/**
 * Chore Boar -- the global admin page.
 *
 * One person -- whoever owns this script -- can see every household in the
 * spreadsheet, and can step INTO any of them and do everything that
 * household's own account holder can do.
 *
 * ---------------------------------------------------------------------
 * How it is reached, and why that is the gate
 * ---------------------------------------------------------------------
 *
 * The family app has to be deployed "Execute as: me, Access: anyone",
 * because the children have no Google accounts and must not need one. That
 * deployment can therefore never be trusted to say who is visiting.
 *
 * So the admin page is a SECOND web-app deployment of this same project,
 * configured "Execute as: user accessing, Access: Only myself". Google then
 * authenticates the visitor for us and Session.getActiveUser() is real.
 *
 * The gate is an IDENTITY check, not a URL check:
 *
 *     Session.getActiveUser().getEmail() === the stored ADMIN_EMAIL
 *
 * which means it does not matter which of the two URLs anybody loads. On the
 * public deployment the active user is anonymous and the check simply fails.
 * There is deliberately NO fallback to Session.getEffectiveUser(): on a
 * deployment that runs as the accessing user that is the visitor, so a
 * fallback would quietly make every visitor an admin the day a deployment
 * setting changed. With no ADMIN_EMAIL stored, global admin is OFF.
 *
 * Run setUpAdmin() once from the editor to store it.
 *
 * ---------------------------------------------------------------------
 * Stepping into a household
 * ---------------------------------------------------------------------
 *
 * Rather than rebuild every screen a second time, entering a household MINTS
 * ORDINARY SESSIONS for that household's account holder and hands them to
 * the browser. The whole normal interface then works, unchanged, because as
 * far as every other function is concerned this is simply that person signed
 * in -- which is also why nothing here needs a second set of permission
 * rules to get subtly wrong.
 *
 * Two things keep that honest:
 *
 *   - the sessions are short (ADMIN_IMPERSONATION_HOURS), not the 60 days a
 *     real device gets, so a forgotten tab is not a permanent back door;
 *   - every entry and exit is written to the activity log, under the
 *     household being entered.
 */

/** How long an admin's borrowed session lasts. */
var ADMIN_IMPERSONATION_HOURS = 2;

// ---------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------

/** The one email allowed, or '' when global admin has never been set up. */
function adminEmailAddress() {
  var v = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL');
  return String(v || '').trim().toLowerCase();
}

/** Who Google says is visiting. '' for anonymous. */
function visitorEmail() {
  try {
    return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  } catch (err) {
    // Thrown rather than returned when the deployment has no right to ask.
    return '';
  }
}

/** True only for the stored admin, and only when one has been stored. */
function isGlobalAdmin() {
  var want = adminEmailAddress();
  if (!want) return false;
  var who = visitorEmail();
  return !!who && who === want;
}

function requireGlobalAdmin() {
  if (!isGlobalAdmin()) throw new Error('NOT_ADMIN');
  return visitorEmail();
}

/**
 * Run this ONCE from the Apps Script editor to turn global admin on.
 *
 * Reads the email from whoever is running it -- in the editor that is
 * unambiguously you -- and stores it. Running it from anywhere else cannot
 * happen: it is not in the actions() allow-list, so the browser cannot ask
 * for it.
 */
function setUpAdmin() {
  var me = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!me) {
    throw new Error('Could not read your email. Run this from the editor.');
  }
  PropertiesService.getScriptProperties().setProperty('ADMIN_EMAIL', me);

  console.log('Global admin is now: ' + me);
  console.log('');
  console.log('Next: Deploy > New deployment > Web app');
  console.log('  Execute as:       User accessing the web app');
  console.log('  Who has access:   Only myself');
  console.log('That deployment URL is your admin page. The family app keeps');
  console.log('its own URL and its own settings -- do not change those.');
  return me;
}

/** Turns it off again. Editor only, same as setUpAdmin(). */
function turnOffAdmin() {
  PropertiesService.getScriptProperties().deleteProperty('ADMIN_EMAIL');
  console.log('Global admin is off. Nobody passes the check now.');
}

// ---------------------------------------------------------------------
// The overview
// ---------------------------------------------------------------------

/** Every household, with enough of a summary to pick one. */
function adminOverview(payload) {
  requireGlobalAdmin();

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
    admin: visitorEmail(),
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
  requireGlobalAdmin();

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
  var admin = requireGlobalAdmin();

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
  var admin = requireGlobalAdmin();

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
  var admin = requireGlobalAdmin();

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
  var admin = requireGlobalAdmin();

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
  var admin = requireGlobalAdmin();

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
  var admin = requireGlobalAdmin();

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
