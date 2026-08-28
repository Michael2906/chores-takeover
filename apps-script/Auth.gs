/**
 * Chore Boar -- accounts, devices and who is allowed to do what.
 *
 * Two tiers, deliberately:
 *
 *   Household account   Real email + password. Signs in on as many devices as
 *                       you like; each device is then trusted for
 *                       CONFIG.SESSION_DAYS. Creates and manages sub-accounts.
 *
 *   Sub-account         A name in the household, reached by tapping it and
 *                       (optionally) entering a PIN. No email, no password.
 *
 * Google's own sign-in is all-or-nothing for an Apps Script web app -- turning
 * it on would force every child to own a Google account -- so the credentials
 * here are ours to hold. Two things follow from that, and both matter:
 *
 *   1. PEPPER is the real protection. Hashes live in the spreadsheet; PEPPER
 *      lives in script properties. Someone who gets the sheet alone cannot
 *      test guesses against a 4-digit PIN. Losing PEPPER, though, invalidates
 *      every password and PIN in the file -- so it is written ONCE and never
 *      rotated. See pepper() below.
 *
 *   2. A trusted device is trusted. Once the household password is entered on
 *      the family tablet, anyone holding that tablet can attempt the name
 *      list. PINs slow a sibling down; they are not a security boundary
 *      against someone with the device in their hands. Sized for a household,
 *      and no more than that.
 *
 * Every action still proves itself server-side: the member token names who is
 * acting, so the browser cannot simply claim to be Mum.
 */

// ---------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------

/**
 * The site-wide secret mixed into every hash.
 *
 * CREATE-ONCE. It is generated on first use and then left alone forever. If
 * this value is ever cleared or changed, every stored password and PIN becomes
 * unverifiable and everyone has to be reset by hand. Do not "regenerate" it.
 */
function pepper() {
  var props = PropertiesService.getScriptProperties();
  var v = props.getProperty('PEPPER');
  if (v) return v;

  // Serialise so two first-ever sign-ins cannot each write their own pepper.
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    v = props.getProperty('PEPPER');
    if (!v) {
      v = randomToken(32);
      props.setProperty('PEPPER', v);
    }
  } finally {
    lock.releaseLock();
  }
  return v;
}

/** A URL-safe random string with n bytes of entropy behind it. */
function randomToken(n) {
  var bytes = [];
  for (var i = 0; i < n; i++) bytes.push(Math.floor(Math.random() * 256) - 128);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

/**
 * Iterated HMAC-SHA256 over the secret, keyed by the row's own salt plus
 * PEPPER. Returns base64.
 */
function hashSecret(secret, salt) {
  var keyBytes = Utilities.newBlob(String(salt) + '|' + pepper()).getBytes();
  var acc = Utilities.computeHmacSha256Signature(
    Utilities.newBlob(String(secret)).getBytes(), keyBytes);

  for (var i = 1; i < CONFIG.HASH_ITERATIONS; i++) {
    acc = Utilities.computeHmacSha256Signature(acc, keyBytes);
  }
  return Utilities.base64Encode(acc);
}

/** Compares two strings without leaking where they first differ. */
function safeEqual(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Burns the same time a real check would.
 *
 * Called when the account does not exist, so that "no such email" and "wrong
 * password" take equally long and the timing cannot be used to work out who
 * has an account here.
 */
function decoyHash() {
  hashSecret('decoy-secret-value', 'decoy-salt');
}

// ---------------------------------------------------------------------
// Lockout
// ---------------------------------------------------------------------

/** Throws if this row is currently frozen after too many bad attempts. */
function assertNotLocked(rec) {
  if (!rec.lockedUntil) return;
  var until = new Date(rec.lockedUntil);
  if (isNaN(until.getTime())) return;
  var mins = Math.ceil((until.getTime() - Date.now()) / 60000);
  if (mins > 0) {
    throw new Error('Too many wrong tries. Try again in ' + mins +
                    (mins === 1 ? ' minute.' : ' minutes.'));
  }
}

/** Counts a failure and freezes the row once MAX_ATTEMPTS is reached. */
function noteFailure(sheet, rec) {
  var n = Number(rec.failedAttempts || 0) + 1;
  var changes = { failedAttempts: n };
  if (n >= CONFIG.MAX_ATTEMPTS) {
    changes.lockedUntil =
      new Date(Date.now() + CONFIG.LOCKOUT_MINUTES * 60000).toISOString();
    changes.failedAttempts = 0;
  }
  update(sheet, rec, changes);
}

/** Clears the failure count after a good credential. */
function noteSuccess(sheet, rec) {
  if (Number(rec.failedAttempts || 0) || rec.lockedUntil) {
    update(sheet, rec, { failedAttempts: 0, lockedUntil: '' });
  }
}

// ---------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------

/** Issues a session row and returns its token. */
function openSession(kind, householdId, memberId, deviceLabel) {
  var ms = kind === 'household'
    ? CONFIG.SESSION_DAYS * 24 * 3600 * 1000
    : CONFIG.MEMBER_SESSION_HOURS * 3600 * 1000;

  var token = randomToken(24);
  insert(CONFIG.SHEET_SESSIONS, {
    token: token,
    kind: kind,
    householdId: householdId,
    memberId: memberId || '',
    deviceLabel: deviceLabel || '',
    createdAt: stamp(),
    lastSeenAt: stamp(),
    expiresAt: new Date(Date.now() + ms).toISOString()
  });
  return token;
}

/**
 * Looks a token up and confirms it is the right kind and still live. Returns
 * the session row, or null. Touches lastSeenAt so idle devices are visible.
 */
function readSession(token, kind) {
  if (!token) return null;
  var s = findOne(CONFIG.SHEET_SESSIONS, { token: token });
  if (!s) return null;
  if (kind && s.kind !== kind) return null;

  if (new Date(s.expiresAt).getTime() < Date.now()) {
    remove(CONFIG.SHEET_SESSIONS, s);
    return null;
  }
  update(CONFIG.SHEET_SESSIONS, s, { lastSeenAt: stamp() });
  return s;
}

/** Ends one session. Used by Sign out. */
function closeSession(token) {
  var s = findOne(CONFIG.SHEET_SESSIONS, { token: token });
  if (s) remove(CONFIG.SHEET_SESSIONS, s);
}

/** Drops expired session rows so the sheet does not grow without bound. */
function sweepSessions() {
  var now = Date.now();
  var all = rows(CONFIG.SHEET_SESSIONS);
  // Delete bottom-up: removing a row shifts every row beneath it.
  for (var i = all.length - 1; i >= 0; i--) {
    if (new Date(all[i].expiresAt).getTime() < now) {
      remove(CONFIG.SHEET_SESSIONS, all[i]);
    }
  }
}

// ---------------------------------------------------------------------
// The gate every action passes through
// ---------------------------------------------------------------------

/**
 * Turns a member token into the acting member, or throws.
 *
 * This -- not anything the browser says about itself -- is what establishes
 * who is doing something and whether they may.
 */
function requireMember(memberToken) {
  var s = readSession(memberToken, 'member');
  if (!s) throw new Error('SIGNED_OUT');

  var m = findOne(CONFIG.SHEET_MEMBERS, { memberId: s.memberId });
  if (!m) throw new Error('SIGNED_OUT');
  if (String(m.active) === 'false') {
    throw new Error('That account has been turned off.');
  }
  if (String(m.householdId) !== String(s.householdId)) {
    throw new Error('SIGNED_OUT');
  }
  return m;
}

/** As requireMember, but the member must be allowed to approve chores. */
function requireApprover(memberToken) {
  var m = requireMember(memberToken);
  if (!canApprove(m)) {
    throw new Error('Only a parent account can do that.');
  }
  return m;
}

/** True for the roles allowed to approve chores and manage sub-accounts. */
function canApprove(member) {
  return member.role === 'owner' || member.role === 'approver';
}

/** The safe-to-send shape of a member -- never the hash or the salt. */
function publicMember(m) {
  return {
    memberId: m.memberId,
    name: m.name,
    role: m.role,
    color: m.color,
    points: Number(m.points || 0),
    hasPin: !!m.pinHash,
    canApprove: canApprove(m),
    active: String(m.active) !== 'false'
  };
}

// ---------------------------------------------------------------------
// Creating a household
// ---------------------------------------------------------------------

/**
 * Stands up a brand new household and signs the creating device in.
 *
 * The owner becomes both a Households row (the email and password that work
 * on any device) and a Members row (so they show up in the name list and can
 * own chores like anyone else).
 */
function createHousehold(payload) {
  payload = payload || {};

  var householdName = String(payload.householdName || '').trim();
  var ownerName = String(payload.ownerName || '').trim();
  var email = String(payload.email || '').trim().toLowerCase();
  var password = String(payload.password || '');

  if (!householdName) throw new Error('Give your household a name.');
  if (!ownerName) throw new Error('Enter your own name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('That email address does not look right.');
  }
  if (password.length < CONFIG.MIN_PASSWORD) {
    throw new Error('Use a password of at least ' + CONFIG.MIN_PASSWORD +
                    ' characters.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (findOne(CONFIG.SHEET_HOUSEHOLDS, { ownerEmail: email })) {
      throw new Error('There is already an account for that email. Sign in instead.');
    }

    var householdId = newId('h');
    var salt = randomToken(16);

    insert(CONFIG.SHEET_HOUSEHOLDS, {
      householdId: householdId,
      name: householdName,
      ownerEmail: email,
      passwordHash: hashSecret(password, salt),
      passwordSalt: salt,
      createdAt: stamp(),
      failedAttempts: 0,
      lockedUntil: ''
    });

    var owner = {
      memberId: newId('m'),
      householdId: householdId,
      name: ownerName,
      role: 'owner',
      pinHash: '',
      pinSalt: '',
      color: memberColor(0),
      points: 0,
      active: true,
      createdAt: stamp(),
      failedAttempts: 0,
      lockedUntil: ''
    };
    insert(CONFIG.SHEET_MEMBERS, owner);

    logAction(householdId, '', owner.memberId, 'household_created', householdName);

    return {
      householdToken: openSession('household', householdId, '',
                                 payload.deviceLabel),
      household: { householdId: householdId, name: householdName },
      members: [publicMember(owner)]
    };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// Signing a device in
// ---------------------------------------------------------------------

/**
 * Household email + password. Succeeds once per device; after this the device
 * only ever sees the name list.
 */
function signInHousehold(payload) {
  payload = payload || {};
  var email = String(payload.email || '').trim().toLowerCase();
  var password = String(payload.password || '');

  var h = findOne(CONFIG.SHEET_HOUSEHOLDS, { ownerEmail: email });
  if (!h) {
    // Spend the same time we would have on a real check.
    decoyHash();
    throw new Error('Wrong email or password.');
  }
  assertNotLocked(h);

  if (!safeEqual(hashSecret(password, h.passwordSalt), h.passwordHash)) {
    noteFailure(CONFIG.SHEET_HOUSEHOLDS, h);
    throw new Error('Wrong email or password.');
  }
  noteSuccess(CONFIG.SHEET_HOUSEHOLDS, h);
  logAction(h.householdId, '', '', 'device_signed_in',
            String(payload.deviceLabel || ''));

  return {
    householdToken: openSession('household', h.householdId, '',
                                payload.deviceLabel),
    household: { householdId: h.householdId, name: h.name },
    members: activeMembers(h.householdId)
  };
}

/**
 * Called on every page load with whatever the device remembered.
 *
 * Returns as much as each token earns: nothing, the name list, or the name
 * list plus the person who was already active on this device.
 */
function resumeSession(payload) {
  payload = payload || {};

  var hs = readSession(payload.householdToken, 'household');
  if (!hs) return { signedIn: false };

  var h = findOne(CONFIG.SHEET_HOUSEHOLDS, { householdId: hs.householdId });
  if (!h) return { signedIn: false };

  var out = {
    signedIn: true,
    household: { householdId: h.householdId, name: h.name },
    members: activeMembers(h.householdId),
    me: null
  };

  // A live member token means somebody is still the active user here.
  try {
    var m = requireMember(payload.memberToken);
    if (String(m.householdId) === String(h.householdId)) out.me = publicMember(m);
  } catch (err) {
    // Lapsed or absent -- they simply re-pick their name. Not an error.
  }
  return out;
}

/** Forgets this device entirely: back to the email and password screen. */
function signOutDevice(payload) {
  payload = payload || {};
  if (payload.memberToken) closeSession(payload.memberToken);
  if (payload.householdToken) closeSession(payload.householdToken);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Picking who you are
// ---------------------------------------------------------------------

/**
 * Tap a name, and enter a PIN if that account has one. Returns the member
 * token every later action is checked against.
 */
function pickMember(payload) {
  payload = payload || {};

  var hs = readSession(payload.householdToken, 'household');
  if (!hs) throw new Error('SIGNED_OUT');

  var m = findOne(CONFIG.SHEET_MEMBERS, { memberId: payload.memberId });
  if (!m || String(m.householdId) !== String(hs.householdId)) {
    throw new Error('That name is not in this household.');
  }
  if (String(m.active) === 'false') {
    throw new Error('That account has been turned off.');
  }
  assertNotLocked(m);

  if (m.pinHash) {
    var pin = String(payload.pin || '');
    if (!pin) throw new Error('PIN_REQUIRED');
    if (!safeEqual(hashSecret(pin, m.pinSalt), m.pinHash)) {
      noteFailure(CONFIG.SHEET_MEMBERS, m);
      throw new Error('That PIN is not right.');
    }
  }
  noteSuccess(CONFIG.SHEET_MEMBERS, m);

  // One active person per device: retire whoever was here before.
  if (payload.memberToken) closeSession(payload.memberToken);

  return {
    memberToken: openSession('member', m.householdId, m.memberId,
                             hs.deviceLabel),
    me: publicMember(m)
  };
}

/** Steps back to the name list without forgetting the device. */
function releaseMember(payload) {
  payload = payload || {};
  if (payload.memberToken) closeSession(payload.memberToken);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Managing sub-accounts (parent accounts only)
// ---------------------------------------------------------------------

/** Every account in the household that has not been turned off. */
function activeMembers(householdId) {
  return findAll(CONFIG.SHEET_MEMBERS, { householdId: householdId })
    .filter(function (m) { return String(m.active) !== 'false'; })
    .map(publicMember);
}

/** Adds a sub-account. PIN is optional -- blank means the name alone gets in. */
function addMember(payload) {
  payload = payload || {};
  var actor = requireApprover(payload.memberToken);

  var name = String(payload.name || '').trim();
  if (!name) throw new Error('Enter a name.');

  var role = payload.role === 'approver' ? 'approver' : 'member';
  var pin = String(payload.pin || '').trim();
  if (pin) assertPinShape(pin);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var existing = findAll(CONFIG.SHEET_MEMBERS,
                           { householdId: actor.householdId });
    var clash = existing.filter(function (m) {
      return String(m.name).toLowerCase() === name.toLowerCase() &&
             String(m.active) !== 'false';
    });
    if (clash.length) {
      throw new Error('There is already a ' + name + ' in this household.');
    }

    var salt = pin ? randomToken(16) : '';
    var m = {
      memberId: newId('m'),
      householdId: actor.householdId,
      name: name,
      role: role,
      pinHash: pin ? hashSecret(pin, salt) : '',
      pinSalt: salt,
      color: memberColor(existing.length),
      points: 0,
      active: true,
      createdAt: stamp(),
      failedAttempts: 0,
      lockedUntil: ''
    };
    insert(CONFIG.SHEET_MEMBERS, m);
    logAction(actor.householdId, '', actor.memberId, 'member_added', name);

    return { members: activeMembers(actor.householdId), added: publicMember(m) };
  } finally {
    lock.releaseLock();
  }
}

/** Renames, re-roles, re-PINs or turns off a sub-account. */
function updateMember(payload) {
  payload = payload || {};
  var actor = requireApprover(payload.memberToken);

  var m = findOne(CONFIG.SHEET_MEMBERS, { memberId: payload.targetId });
  if (!m || String(m.householdId) !== String(actor.householdId)) {
    throw new Error('That account is not in this household.');
  }

  var changes = {};

  if (payload.name !== undefined) {
    var name = String(payload.name).trim();
    if (!name) throw new Error('A name cannot be blank.');
    changes.name = name;
  }

  if (payload.role !== undefined) {
    if (m.role === 'owner') {
      throw new Error('The account holder always keeps parent access.');
    }
    changes.role = payload.role === 'approver' ? 'approver' : 'member';
  }

  // '' clears the PIN, a value sets it, undefined leaves it alone.
  if (payload.pin !== undefined) {
    var pin = String(payload.pin).trim();
    if (pin) {
      assertPinShape(pin);
      changes.pinSalt = randomToken(16);
      changes.pinHash = hashSecret(pin, changes.pinSalt);
    } else {
      changes.pinHash = '';
      changes.pinSalt = '';
    }
    // A changed PIN should not leave old devices signed in as this person.
    endMemberSessions(m.memberId);
  }

  if (payload.active !== undefined) {
    if (m.role === 'owner' && payload.active === false) {
      throw new Error('The account holder cannot be turned off.');
    }
    changes.active = !!payload.active;
    if (!changes.active) endMemberSessions(m.memberId);
  }

  // Clearing a lockout by hand, e.g. a child who forgot their PIN.
  if (payload.unlock) {
    changes.failedAttempts = 0;
    changes.lockedUntil = '';
  }

  update(CONFIG.SHEET_MEMBERS, m, changes);
  logAction(actor.householdId, '', actor.memberId, 'member_updated',
            m.name + ': ' + Object.keys(changes).join(', '));

  return { members: activeMembers(actor.householdId) };
}

/** Signs every device out of one member, without touching device trust. */
function endMemberSessions(memberId) {
  var all = findAll(CONFIG.SHEET_SESSIONS, { memberId: memberId });
  for (var i = all.length - 1; i >= 0; i--) {
    remove(CONFIG.SHEET_SESSIONS, all[i]);
  }
}

/** PINs are digits only, exactly CONFIG.PIN_LENGTH of them. */
function assertPinShape(pin) {
  var re = new RegExp('^\\d{' + CONFIG.PIN_LENGTH + '}$');
  if (!re.test(pin)) {
    throw new Error('A PIN is exactly ' + CONFIG.PIN_LENGTH + ' digits.');
  }
}

/** Changes the household password. Signs other devices out. */
function changeHouseholdPassword(payload) {
  payload = payload || {};
  var actor = requireMember(payload.memberToken);
  if (actor.role !== 'owner') {
    throw new Error('Only the account holder can change the password.');
  }

  var h = findOne(CONFIG.SHEET_HOUSEHOLDS, { householdId: actor.householdId });
  if (!h) throw new Error('SIGNED_OUT');

  if (!safeEqual(hashSecret(String(payload.currentPassword || ''),
                            h.passwordSalt), h.passwordHash)) {
    throw new Error('That is not the current password.');
  }
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

  // Every other device has to sign in again -- that is the point of doing this.
  var live = findAll(CONFIG.SHEET_SESSIONS, { householdId: h.householdId });
  for (var i = live.length - 1; i >= 0; i--) {
    if (live[i].token !== payload.householdToken &&
        live[i].token !== payload.memberToken) {
      remove(CONFIG.SHEET_SESSIONS, live[i]);
    }
  }

  logAction(h.householdId, '', actor.memberId, 'password_changed', '');
  return { ok: true };
}

/** The palette sub-accounts are coloured from, in the order they are added. */
function memberColor(i) {
  var palette = ['#02407d', '#914a42', '#bba255', '#2e8b74',
                 '#6a4c93', '#c1683c', '#3d7ea6', '#7a8b3d'];
  return palette[i % palette.length];
}
