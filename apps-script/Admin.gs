/**
 * Chore Boar -- the global admin page.
 *
 * One person can see every household in the spreadsheet and step INTO any of
 * them, doing everything that household's own account holder can do.
 *
 * ---------------------------------------------------------------------
 * Why this has its own password instead of using Google sign-in
 * ---------------------------------------------------------------------
 *
 * It used to be a second deployment set to "only myself", with the gate
 * being Session.getActiveUser(). That is a stronger gate and it had to go,
 * for a reason that is not obvious until you hit it:
 *
 * An Apps Script web app shows Google's own header and footer unless it is
 * framed. Framing it from thechoreboar.fyi makes it a THIRD-PARTY frame, and
 * Safari does not let a third-party frame see its own cookies -- so Google
 * could not see the signed-in session, demanded a sign-in, and did that by
 * navigating the top window straight out of the frame. Sandboxing the frame
 * to stop that just moved the failure: the sign-in callback had nowhere to
 * land and Google answered "malformed request".
 *
 * "Authenticated by Google" and "framed on our own domain" cannot both be
 * true on Safari. The admin page is served from the FAMILY deployment now --
 * anonymous access, so it frames cleanly, no Google chrome, its own icon --
 * and it is protected by a password of ours instead.
 *
 * That password is held exactly the way every household password already is:
 * hashed with a per-row salt plus PEPPER, which lives in script properties
 * and not in the spreadsheet. Wrong guesses lock the gate for a while. Being
 * served from the family deployment also means ONE deployment to keep
 * current rather than two.
 *
 * The page is requested with ?admin=1, which is not a secret and not a gate:
 * all it does is draw the password form. Nothing behind it answers without a
 * live admin session token.
 *
 * ---------------------------------------------------------------------
 * Stepping into a household
 * ---------------------------------------------------------------------
 *
 * Rather than rebuild every screen a second time, entering a household MINTS
 * ORDINARY SESSIONS for that household's account holder and hands them to
 * the browser. The whole normal interface then works, unchanged -- which is
 * also why nothing here needs a second set of permission rules to get subtly
 * wrong.
 *
 * Two things keep that honest: the sessions are short, and every entry and
 * exit is written to the activity log of the household being entered.
 */

/** How long an admin's borrowed household session lasts. */
var ADMIN_IMPERSONATION_HOURS = 2;

/** How long a signed-in admin stays signed in on a device. */
var ADMIN_SESSION_HOURS = 12;

/** Wrong admin passwords allowed before the gate freezes. */
var ADMIN_MAX_ATTEMPTS = 6;
var ADMIN_LOCKOUT_MINUTES = 15;

// ---------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------

/**
 * Run this ONCE from the editor to turn global admin on.
 *
 * It invents the password rather than taking one, for two reasons: a
 * generated one is stronger than anything typed in a hurry, and nothing
 * secret ends up pasted into the editor or committed. It is printed exactly
 * once -- copy it there and then. Run it again to roll it.
 */
function setUpAdmin() {
  var password = randomToken(15).replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
  var salt = randomToken(16);

  PropertiesService.getScriptProperties().setProperties({
    ADMIN_PASSWORD_HASH: hashSecret(password, salt),
    ADMIN_PASSWORD_SALT: salt,
    ADMIN_FAILED: '0',
    ADMIN_LOCKED_UNTIL: ''
  });

  console.log('Global admin is ON. The password is:');
  console.log('');
  console.log('    ' + password);
  console.log('');
  console.log('Copy it now -- it is hashed, so this is the only time it can');
  console.log('be shown. Run setUpAdmin() again to roll it, or change it');
  console.log('from inside the admin page once you are in.');
  console.log('');
  console.log('The admin page is your normal app URL with ?admin=1, and');
  console.log('thechoreboar.fyi/admin.html frames it for you.');
  return 'see the log';
}

/** Turns it off. Nobody passes the gate afterwards. */
function turnOffAdmin() {
  var props = PropertiesService.getScriptProperties();
  ['ADMIN_PASSWORD_HASH', 'ADMIN_PASSWORD_SALT',
   'ADMIN_FAILED', 'ADMIN_LOCKED_UNTIL'].forEach(function (k) {
    props.deleteProperty(k);
  });
  adminEndAllSessions();
  console.log('Global admin is off.');
}

/** Whether an admin password has ever been set. */
function adminIsConfigured() {
  return !!PropertiesService.getScriptProperties()
    .getProperty('ADMIN_PASSWORD_HASH');
}

/**
 * Exchanges the admin password for a session token.
 *
 * Lockout is counted in script properties rather than against a row,
 * because there is no row -- there is one admin, not a table of them.
 */
function adminSignIn(payload) {
  payload = payload || {};
  var props = PropertiesService.getScriptProperties();

  var hash = props.getProperty('ADMIN_PASSWORD_HASH');
  var salt = props.getProperty('ADMIN_PASSWORD_SALT');
  if (!hash || !salt) {
    decoyHash();
    throw new Error('Global admin has not been set up yet.');
  }

  var until = props.getProperty('ADMIN_LOCKED_UNTIL');
  if (until) {
    var mins = Math.ceil((new Date(until).getTime() - Date.now()) / 60000);
    if (mins > 0) {
      throw new Error('Too many wrong tries. Try again in ' + mins +
                      (mins === 1 ? ' minute.' : ' minutes.'));
    }
  }

  if (!safeEqual(hashSecret(String(payload.password || ''), salt), hash)) {
    var n = Number(props.getProperty('ADMIN_FAILED') || 0) + 1;
    if (n >= ADMIN_MAX_ATTEMPTS) {
      props.setProperty('ADMIN_FAILED', '0');
      props.setProperty('ADMIN_LOCKED_UNTIL',
        new Date(Date.now() + ADMIN_LOCKOUT_MINUTES * 60000).toISOString());
    } else {
      props.setProperty('ADMIN_FAILED', String(n));
    }
    throw new Error('That is not the admin password.');
  }

  props.setProperty('ADMIN_FAILED', '0');
  props.setProperty('ADMIN_LOCKED_UNTIL', '');
  logAction('', '', '', 'admin_signed_in', String(payload.deviceLabel || ''));

  return {
    adminToken: openSession('admin', '', '', String(payload.deviceLabel || ''),
                            ADMIN_SESSION_HOURS * 3600 * 1000)
  };
}

/** Ends this device's admin session, and any household seat it holds. */
function adminSignOut(payload) {
  payload = payload || {};
  if (payload.memberToken) closeSession(payload.memberToken);
  if (payload.householdToken) closeSession(payload.householdToken);
  if (payload.adminToken) closeSession(payload.adminToken);
  return { ok: true };
}

/** Every admin session everywhere, gone. Used when the password changes. */
function adminEndAllSessions() {
  var all = findAll(CONFIG.SHEET_SESSIONS, { kind: 'admin' });
  for (var i = all.length - 1; i >= 0; i--) remove(CONFIG.SHEET_SESSIONS, all[i]);
}

/** Changes the admin password from inside the admin page. */
function changeAdminPassword(payload) {
  payload = payload || {};
  requireGlobalAdmin(payload);

  var next = String(payload.newPassword || '');
  if (next.length < 10) {
    throw new Error('Use an admin password of at least 10 characters.');
  }

  var salt = randomToken(16);
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_PASSWORD_HASH: hashSecret(next, salt),
    ADMIN_PASSWORD_SALT: salt,
    ADMIN_FAILED: '0',
    ADMIN_LOCKED_UNTIL: ''
  });

  adminEndAllSessions();
  logAction('', '', '', 'admin_password_changed', '');
  return { ok: true };
}

/**
 * The check every admin action makes.
 *
 * Takes the payload rather than reading an ambient identity: the token in
 * the request is the only thing that says this caller is the admin.
 */
function requireGlobalAdmin(payload) {
  var s = readSession((payload || {}).adminToken, 'admin');
  if (!s) throw new Error('NOT_ADMIN');
  return 'admin';
}

/** True when this request carries a live admin session. */
function hasAdminSession(payload) {
  try {
    requireGlobalAdmin(payload);
    return true;
  } catch (err) {
    return false;
  }
}
// ---------------------------------------------------------------------
// The overview
// ---------------------------------------------------------------------

/** Every household, with enough of a summary to pick one. */
function adminOverview(payload) {
  payload = payload || {};
  requireGlobalAdmin(payload);

  var members = rows(CONFIG.SHEET_MEMBERS);
  var chores = rows(CONFIG.SHEET_CHORES);
  var today = todayStr();

  var byHousehold = {};
  function bucket(id) {
    if (!byHousehold[id]) {
      byHousehold[id] = { members: 0, points: 0, open: 0, waiting: 0, today: 0 };
    }
    return byHousehold[id];
  }

  members.forEach(function (m) {
    if (String(m.active) === 'false') return;
    var b = bucket(m.householdId);
    b.members++;
    b.points += Number(m.points || 0);
  });

  chores.forEach(function (c) {
    var b = bucket(c.householdId);
    if (c.status !== STATUS.DONE) b.open++;
    if (c.status === STATUS.SUBMITTED) b.waiting++;
    if (String(c.dueDate).slice(0, 10) === today) b.today++;
  });

  return {
    admin: 'Global admin',
    today: today,
    households: rows(CONFIG.SHEET_HOUSEHOLDS).map(function (h) {
      var b = bucket(h.householdId);
      return {
        householdId: h.householdId,
        name: h.name,
        ownerEmail: h.ownerEmail,
        createdAt: h.createdAt || '',
        lastFilledOn: String(h.lastFilledOn || ''),
        filledToday: String(h.lastFilledOn || '').slice(0, 10) === today,
        locked: isLocked(h),
        members: b.members,
        points: b.points,
        openChores: b.open,
        waitingApproval: b.waiting,
        dueToday: b.today
      };
    }).sort(function (a, b) { return a.name < b.name ? -1 : 1; })
  };
}

/** Whether a household row is currently frozen by failed sign-ins. */
function isLocked(h) {
  if (!h.lockedUntil) return false;
  var until = new Date(h.lockedUntil);
  return !isNaN(until.getTime()) && until.getTime() > Date.now();
}

/** One household's recent activity, newest first. */
function adminActivityLog(payload) {
  payload = payload || {};
  requireGlobalAdmin(payload);

  var want = String(payload.householdId || '');
  var limit = Math.max(1, Math.min(200, Number(payload.limit) || 60));

  var names = {};
  findAll(CONFIG.SHEET_MEMBERS, { householdId: want }).forEach(function (m) {
    names[m.memberId] = m.name;
  });

  var all = findAll(CONFIG.SHEET_LOG, { householdId: want });
  return {
    entries: all.slice(-limit).reverse().map(function (r) {
      return {
        at: r.at,
        who: names[r.memberId] || (r.memberId ? 'Gone' : 'The system'),
        action: r.action,
        detail: r.detail
      };
    })
  };
}

// ---------------------------------------------------------------------
// Stepping in and out
// ---------------------------------------------------------------------

/**
 * Borrows the account holder's seat in one household.
 *
 * Returns the same pair of tokens a real sign-in would, so the browser can
 * simply drop them in and show the ordinary app.
 */
function adminEnterHousehold(payload) {
  payload = payload || {};
  var admin = requireGlobalAdmin(payload);

  var h = findOne(CONFIG.SHEET_HOUSEHOLDS,
                  { householdId: String(payload.householdId || '') });
  if (!h) throw new Error('No such household.');

  var people = findAll(CONFIG.SHEET_MEMBERS, { householdId: h.householdId })
    .filter(function (m) { return String(m.active) !== 'false'; });

  var owner = people.filter(function (m) { return m.role === 'owner'; })[0] ||
              people.filter(function (m) { return canApprove(m); })[0];
  if (!owner) {
    throw new Error('That household has no account holder left to act as.');
  }

  var ms = ADMIN_IMPERSONATION_HOURS * 3600 * 1000;

  logAction(h.householdId, '', owner.memberId, 'admin_entered', admin);

  return {
    householdToken: openSession('household', h.householdId, '', 'global admin', ms),
    memberToken: openSession('member', h.householdId, owner.memberId,
                             'global admin', ms),
    household: { householdId: h.householdId, name: h.name },
    actingAs: publicMember(owner)
  };
}

/**
 * Hands the borrowed seat back.
 *
 * Its own action rather than reusing releaseMember()/signOutDevice(), which
 * now cost the household password -- a password the admin deliberately does
 * not have. Being the admin is the authorisation here.
 */
function adminLeaveHousehold(payload) {
  payload = payload || {};
  var admin = requireGlobalAdmin(payload);

  var hs = readSession(payload.householdToken, 'household');
  if (hs) logAction(hs.householdId, '', '', 'admin_left', admin);

  if (payload.memberToken) closeSession(payload.memberToken);
  if (payload.householdToken) closeSession(payload.householdToken);
  return { ok: true };
}

// ---------------------------------------------------------------------
// The things only an admin can do
// ---------------------------------------------------------------------

/**
 * Sets a household's password without knowing the old one.
 *
 * For "we are locked out" -- which, with no email on the account and no
 * reset flow, is otherwise unrecoverable. Signs every one of that
 * household's devices out, because a password change they did not make
 * should not leave old sessions running.
 */
function adminResetPassword(payload) {
  payload = payload || {};
  var admin = requireGlobalAdmin(payload);

  var h = findOne(CONFIG.SHEET_HOUSEHOLDS,
                  { householdId: String(payload.householdId || '') });
  if (!h) throw new Error('No such household.');

  var next = String(payload.newPassword || '');
  if (next.length < CONFIG.MIN_PASSWORD) {
    throw new Error('Use a password of at least ' + CONFIG.MIN_PASSWORD +
                    ' characters.');
  }

  var salt = randomToken(16);
  update(CONFIG.SHEET_HOUSEHOLDS, h, {
    passwordSalt: salt,
    passwordHash: hashSecret(next, salt),
    failedAttempts: 0,
    lockedUntil: ''
  });

  var live = findAll(CONFIG.SHEET_SESSIONS, { householdId: h.householdId });
  for (var i = live.length - 1; i >= 0; i--) remove(CONFIG.SHEET_SESSIONS, live[i]);

  logAction(h.householdId, '', '', 'admin_reset_password', admin);
  return adminOverview(payload);
}

/** Clears a lockout without changing the password. */
function adminUnlockHousehold(payload) {
  payload = payload || {};
  var admin = requireGlobalAdmin(payload);

  var h = findOne(CONFIG.SHEET_HOUSEHOLDS,
                  { householdId: String(payload.householdId || '') });
  if (!h) throw new Error('No such household.');

  update(CONFIG.SHEET_HOUSEHOLDS, h, { failedAttempts: 0, lockedUntil: '' });
  logAction(h.householdId, '', '', 'admin_unlocked', admin);
  return adminOverview(payload);
}

/**
 * Runs tonight's hand-out for one household, now.
 *
 * Goes through fillDayFor(), so it takes the same lock and respects the same
 * once-a-day marker as the trigger -- running it twice cannot double anybody
 * up, and it answers honestly when today is already done.
 */
function adminFillHousehold(payload) {
  payload = payload || {};
  var admin = requireGlobalAdmin(payload);

  var h = findOne(CONFIG.SHEET_HOUSEHOLDS,
                  { householdId: String(payload.householdId || '') });
  if (!h) throw new Error('No such household.');

  var n = fillDayFor(h.householdId);
  logAction(h.householdId, '', '', 'admin_filled',
            admin + ': ' + (n === null ? 'already done' : n + ' chores'));

  return {
    alreadyDone: n === null,
    written: n === null ? 0 : n,
    overview: adminOverview(payload)
  };
}

/**
 * Deletes a household and everything belonging to it.
 *
 * Guarded by having to type the name back. There is no undo and no backup
 * beyond the spreadsheet's own version history, so the confirmation is a
 * real one rather than an "are you sure".
 */
function adminDeleteHousehold(payload) {
  payload = payload || {};
  var admin = requireGlobalAdmin(payload);

  var h = findOne(CONFIG.SHEET_HOUSEHOLDS,
                  { householdId: String(payload.householdId || '') });
  if (!h) throw new Error('No such household.');

  if (String(payload.confirmName || '').trim() !== String(h.name).trim()) {
    throw new Error('Type the household name exactly to delete it.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    [CONFIG.SHEET_MEMBERS, CONFIG.SHEET_SESSIONS, CONFIG.SHEET_CHORES,
     CONFIG.SHEET_TROUGH, CONFIG.SHEET_STY, CONFIG.SHEET_GROUPS,
     CONFIG.SHEET_PRIZES, CONFIG.SHEET_REDEEMED].forEach(function (sheet) {
      var mine = findAll(sheet, { householdId: h.householdId });
      // Bottom-up: deleting a row shifts every row beneath it.
      for (var i = mine.length - 1; i >= 0; i--) remove(sheet, mine[i]);
    });

    // The log is kept on purpose -- it is the only record that any of this
    // existed, and it holds the line saying who deleted it.
    logAction(h.householdId, '', '', 'admin_deleted_household',
              admin + ': ' + h.name);
    remove(CONFIG.SHEET_HOUSEHOLDS, h);
  } finally {
    lock.releaseLock();
  }

  return adminOverview(payload);
}
