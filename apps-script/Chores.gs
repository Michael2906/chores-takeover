/**
 * Chore Boar -- chores and the path they travel.
 *
 *   pool ---claim--> claimed ---start--> in_progress ---submit--> submitted
 *                       |                     |                      |
 *                    release               pause                  approve
 *                       |                     |                      |
 *                       v                     v                      v
 *                     pool                 claimed                  done
 *
 * submitted can also be sent back, which returns it to in_progress with a
 * note.
 *
 * IDENTITY. Every chore carries three things that keep two cards reading
 * "Take the trash out" from being confused with each other:
 *
 *   choreId    the real key. Every action names one, and the server reads
 *              title, points and status from THAT row -- never from the
 *              browser -- so a chore cannot be talked into paying twice or
 *              paying more than it is worth.
 *   ref        a short per-household number (#42) shown on the card, so a
 *              person can point at one out loud.
 *   seriesId   ties a repeating chore to its predecessors.
 *
 * REPEATING CHORES do not respawn when approved. They are posted by the
 * nightly job in Daily.gs, alongside the Trough and the Sty, so everything
 * that lands does so at the same time each day.
 *
 * Every transition below is checked server-side against the acting member's
 * token, so the browser cannot claim a chore on someone else's behalf or
 * approve its own work. The status guards are not decoration either: they are
 * what stops a stale tab, left open on a phone since yesterday, from
 * re-approving a chore that has already been paid out.
 */

var STATUS = {
  POOL:     'pool',
  CLAIMED:  'claimed',
  PROGRESS: 'in_progress',
  SUBMIT:   'submitted',
  DONE:     'done'
};

// How many finished chores the Done tab carries. The Activity Log keeps the
// rest -- this is just what a phone should have to render.
var DONE_LIMIT = 100;

// ---------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------

/**
 * Everything the app needs to draw itself: who I am, who else is here, and
 * every chore that belongs on a tab.
 */
function loadBoard(payload) {
  payload = payload || {};
  var me = requireMember(payload.memberToken);

  var all = findAll(CONFIG.SHEET_CHORES, { householdId: me.householdId });
  var members = activeMembers(me.householdId);
  var byId = {};
  members.forEach(function (m) { byId[m.memberId] = m; });

  var live = [];
  var done = [];

  all.forEach(function (c) {
    // Filtered HERE, not in the browser. Sending every chore down and hiding
    // some of them client-side would still put one parent's chores in the
    // other parent's page source.
    if (!maySee(c, me, byId[c.assigneeId])) return;

    var view = choreView(c, byId);
    if (c.status === STATUS.DONE) done.push(view); else live.push(view);
  });

  // Newest first, and only the recent tail of the finished ones.
  done.sort(function (a, b) {
    return String(b.approvedAt || '').localeCompare(String(a.approvedAt || ''));
  });
  done = done.slice(0, DONE_LIMIT);

  live.sort(function (a, b) {
    // Overdue first, then by due date, then oldest-posted first.
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    var ad = a.dueDate || '9999';
    var bd = b.dueDate || '9999';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });

  return {
    me: publicMember(me),
    members: members,
    chores: live.concat(done),
    categories: CONFIG.CATEGORIES,
    pointPresets: CONFIG.POINT_PRESETS,
    suggestions: suggestionList()
  };
}

/** The safe, display-ready shape of a chore. */
function choreView(c, membersById) {
  var assignee = c.assigneeId && membersById[c.assigneeId];
  var creator = c.createdBy && membersById[c.createdBy];
  var approver = c.approvedBy && membersById[c.approvedBy];

  return {
    choreId: c.choreId,
    ref: Number(c.ref || 0),
    seriesId: c.seriesId || '',
    // Where it came from, so the card can say so and the buttons can differ.
    source: c.troughId ? 'trough' : (c.styId ? 'sty' : 'pool'),
    title: c.title,
    notes: c.notes || '',
    category: c.category || '',
    points: Number(c.points || 0),
    status: c.status,
    dueDate: c.dueDate ? String(c.dueDate).slice(0, 10) : '',
    recurrence: c.recurrence || '',
    reviewNote: c.reviewNote || '',
    createdAt: c.createdAt,
    createdBy: c.createdBy || '',
    createdByName: creator ? creator.name : '',
    assigneeId: c.assigneeId || '',
    assigneeName: assignee ? assignee.name : '',
    assigneeColor: assignee ? assignee.color : '',
    claimedAt: c.claimedAt || '',
    startedAt: c.startedAt || '',
    submittedAt: c.submittedAt || '',
    approvedAt: c.approvedAt || '',
    approvedByName: approver ? approver.name : '',
    overdue: isOverdue(c)
  };
}

/** True when an unfinished chore is past its due date. */
function isOverdue(c) {
  if (!c.dueDate || c.status === STATUS.DONE) return false;
  var due = new Date(String(c.dueDate).slice(0, 10) + 'T23:59:59');
  return !isNaN(due.getTime()) && due.getTime() < Date.now();
}

/**
 * Hands out the next few reference numbers for a household.
 *
 * Returns a function, so a batch (the nightly job writes a dozen at a time)
 * scans the sheet once rather than once per chore.
 */
function refAllocator(householdId) {
  var max = 0;
  findAll(CONFIG.SHEET_CHORES, { householdId: householdId }).forEach(function (c) {
    var n = Number(c.ref || 0);
    if (n > max) max = n;
  });
  return function () { return ++max; };
}

/**
 * Whether somebody may see -- and therefore act on -- a chore.
 *
 * One rule, in one place, used for both, because a chore you can see but not
 * touch (or worse, touch but not see) is how a permission model rots.
 *
 *   Account holder   everything.
 *   Parent           their own, and every child's. NOT another parent's.
 *   Child            their own only.
 *
 * Unclaimed work is everybody's business regardless -- that is what the pool
 * is for.
 *
 * `who` is the assignee, already looked up when the caller has the roster to
 * hand; otherwise it is fetched.
 */
function maySee(c, me, who) {
  if (!c.assigneeId) return true;
  if (String(c.assigneeId) === String(me.memberId)) return true;
  if (me.role === 'owner') return true;
  if (!canApprove(me)) return false;

  if (who === undefined) {
    who = findOne(CONFIG.SHEET_MEMBERS, { memberId: c.assigneeId });
  }
  // A parent sees the children, not the other parent.
  return !!who && !canApprove(who);
}

/** maySee, as a guard. */
function assertMaySee(c, me) {
  if (maySee(c, me)) return;

  var who = findOne(CONFIG.SHEET_MEMBERS, { memberId: c.assigneeId });
  if (canApprove(me) && who && canApprove(who)) {
    throw new Error('That is another parent\'s chore. Only the account ' +
                    'holder can change it.');
  }
  throw new Error('That is not your chore.');
}

/** True for a chore handed out by the Trough or the Sty. */
function isDailyChore(c) {
  return !!(c.troughId || c.styId);
}

/** Fetches a chore in this household, or throws. */
function ownChore(householdId, choreId) {
  var c = findOne(CONFIG.SHEET_CHORES, { choreId: choreId });
  if (!c || String(c.householdId) !== String(householdId)) {
    throw new Error('That chore no longer exists.');
  }
  return c;
}

/** Guards a transition, naming what actually happened instead of failing mutely. */
function assertStatus(c, expected) {
  var ok = expected.indexOf(c.status) >= 0;
  if (ok) return;
  throw new Error('That chore has moved on -- it is ' +
                  statusWords(c.status) + ' now. Pull to refresh.');
}

function statusWords(status) {
  return {
    pool:        'back in the pool',
    claimed:     'claimed',
    in_progress: 'in progress',
    submitted:   'waiting for approval',
    done:        'already done'
  }[status] || status;
}

// ---------------------------------------------------------------------
// Creating and editing
// ---------------------------------------------------------------------

/**
 * Posts a chore. Parent accounts only.
 *
 * Children claim from the pool rather than stocking it: letting them post
 * their own work is how "tidy my own desk, 20 points" gets onto the board.
 */
function createChore(payload) {
  payload = payload || {};
  var me = requireApprover(payload.memberToken);

  var title = String(payload.title || '').trim();
  if (!title) throw new Error('Give the chore a name.');
  if (title.length > 120) title = title.slice(0, 120);

  var points = Math.max(0, Math.min(999,
                        Math.round(Number(payload.points) || 0)));

  var assigneeId = '';
  var status = STATUS.POOL;

  // A chore can be handed straight to somebody instead of pooled.
  if (payload.assigneeId) {
    var target = findOne(CONFIG.SHEET_MEMBERS, { memberId: payload.assigneeId });
    if (!target || String(target.householdId) !== String(me.householdId)) {
      throw new Error('That person is not in this household.');
    }
    assigneeId = target.memberId;
    status = STATUS.CLAIMED;
  }

  var choreId = newId('c');
  var recurrence = cleanRecurrence(payload.recurrence);

  var c = {
    choreId: choreId,
    householdId: me.householdId,
    title: title,
    notes: String(payload.notes || '').slice(0, 1000),
    category: String(payload.category || '').slice(0, 40),
    points: points,
    status: status,
    createdBy: me.memberId,
    createdAt: stamp(),
    assigneeId: assigneeId,
    claimedAt: assigneeId ? stamp() : '',
    startedAt: '',
    submittedAt: '',
    approvedBy: '',
    approvedAt: '',
    dueDate: cleanDate(payload.dueDate),
    recurrence: recurrence,
    reviewNote: '',
    troughId: '',
    styId: '',
    ref: refAllocator(me.householdId)(),
    // A repeating chore is the first of a series; every later copy carries
    // the same seriesId so the nightly job can find the latest one.
    seriesId: recurrence ? choreId : ''
  };
  insert(CONFIG.SHEET_CHORES, c);
  logAction(me.householdId, c.choreId, me.memberId, 'created', title);

  return loadBoard(payload);
}

/** Edits a chore. Parent accounts only, same as posting one. */
function updateChore(payload) {
  payload = payload || {};
  var me = requireApprover(payload.memberToken);
  var c = ownChore(me.householdId, payload.choreId);
  assertMaySee(c, me);

  var changes = {};
  if (payload.title !== undefined) {
    var t = String(payload.title).trim();
    if (!t) throw new Error('Give the chore a name.');
    changes.title = t.slice(0, 120);
  }
  if (payload.notes !== undefined) changes.notes = String(payload.notes).slice(0, 1000);
  if (payload.category !== undefined) changes.category = String(payload.category).slice(0, 40);
  if (payload.dueDate !== undefined) changes.dueDate = cleanDate(payload.dueDate);
  if (payload.recurrence !== undefined && !isDailyChore(c)) {
    // A Trough or Sty chore is already on a daily list; giving it a second
    // schedule of its own would post a duplicate every night.
    changes.recurrence = cleanRecurrence(payload.recurrence);
    if (changes.recurrence && !c.seriesId) changes.seriesId = c.choreId;
  }

  if (payload.points !== undefined) {
    changes.points = Math.max(0, Math.min(999,
                              Math.round(Number(payload.points) || 0)));
  }

  update(CONFIG.SHEET_CHORES, c, changes);
  logAction(me.householdId, c.choreId, me.memberId, 'edited',
            Object.keys(changes).join(', '));

  return loadBoard(payload);
}

/** Deletes a chore. Same rule as editing one. */
function deleteChore(payload) {
  payload = payload || {};
  var me = requireApprover(payload.memberToken);
  var c = ownChore(me.householdId, payload.choreId);
  assertMaySee(c, me);

  logAction(me.householdId, c.choreId, me.memberId, 'deleted', c.title);
  remove(CONFIG.SHEET_CHORES, c);

  return loadBoard(payload);
}

// ---------------------------------------------------------------------
// Moving a chore along
// ---------------------------------------------------------------------

/**
 * Takes a chore out of the pool.
 *
 * Locked, because two children hitting Claim on the same chore at the same
 * moment is not a hypothetical -- it is the whole point of a shared pool.
 */
function claimChore(payload) {
  payload = payload || {};
  var me = requireMember(payload.memberToken);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var c = ownChore(me.householdId, payload.choreId);

    // Re-read inside the lock: whoever got here first has already changed it.
    if (c.status !== STATUS.POOL) {
      var who = c.assigneeId
        ? findOne(CONFIG.SHEET_MEMBERS, { memberId: c.assigneeId })
        : null;
      throw new Error(who ? (who.name + ' got that one first.')
                          : 'Somebody else got that one first.');
    }

    update(CONFIG.SHEET_CHORES, c, {
      status: STATUS.CLAIMED,
      assigneeId: me.memberId,
      claimedAt: stamp(),
      reviewNote: ''
    });
    logAction(me.householdId, c.choreId, me.memberId, 'claimed', c.title);
  } finally {
    lock.releaseLock();
  }
  return loadBoard(payload);
}

/** Puts a chore back. Yours to give up, or a parent's to take back. */
function releaseChore(payload) {
  payload = payload || {};
  var me = requireMember(payload.memberToken);
  var c = ownChore(me.householdId, payload.choreId);

  assertStatus(c, [STATUS.CLAIMED, STATUS.PROGRESS, STATUS.SUBMIT]);
  assertMaySee(c, me);

  // A chore that was handed to somebody is theirs. Dropping it into the pool
  // would let anyone pick up work that was deliberately shared out, and the
  // nightly job would then hand out a second copy because this one is still
  // outstanding. A parent moves it with "Give to" instead.
  if (isDailyChore(c)) {
    throw new Error(
      c.troughId
        ? 'Trough chores stay with the person they went to. A parent can hand it to somebody else.'
        : 'Sty chores are each person\'s own. A parent can hand it to somebody else.');
  }

  update(CONFIG.SHEET_CHORES, c, {
    status: STATUS.POOL,
    assigneeId: '',
    claimedAt: '',
    startedAt: '',
    submittedAt: ''
  });
  logAction(me.householdId, c.choreId, me.memberId, 'released', c.title);

  return loadBoard(payload);
}

/** Started work on it. */
function startChore(payload) {
  payload = payload || {};
  var me = requireMember(payload.memberToken);
  var c = ownChore(me.householdId, payload.choreId);

  assertStatus(c, [STATUS.CLAIMED]);
  assertMaySee(c, me);

  update(CONFIG.SHEET_CHORES, c, { status: STATUS.PROGRESS, startedAt: stamp() });
  logAction(me.householdId, c.choreId, me.memberId, 'started', c.title);

  return loadBoard(payload);
}

/** Stepped away from it -- back to My Chores, not back to the pool. */
function pauseChore(payload) {
  payload = payload || {};
  var me = requireMember(payload.memberToken);
  var c = ownChore(me.householdId, payload.choreId);

  assertStatus(c, [STATUS.PROGRESS]);
  assertMaySee(c, me);

  update(CONFIG.SHEET_CHORES, c, { status: STATUS.CLAIMED, startedAt: '' });
  logAction(me.householdId, c.choreId, me.memberId, 'paused', c.title);

  return loadBoard(payload);
}

/**
 * Hands a finished chore up for approval.
 *
 * Accepted straight from claimed as well as from in_progress -- pressing Start
 * is a courtesy, and refusing the submission of finished work because nobody
 * pressed it would be daft.
 */
function submitChore(payload) {
  payload = payload || {};
  var me = requireMember(payload.memberToken);
  var c = ownChore(me.householdId, payload.choreId);

  assertStatus(c, [STATUS.CLAIMED, STATUS.PROGRESS]);
  assertMaySee(c, me);

  update(CONFIG.SHEET_CHORES, c, {
    status: STATUS.SUBMIT,
    submittedAt: stamp(),
    startedAt: c.startedAt || stamp(),
    reviewNote: ''
  });
  logAction(me.householdId, c.choreId, me.memberId, 'submitted', c.title);

  if (CONFIG.EMAIL_ON_SUBMIT) notifySubmission(c, me);

  return loadBoard(payload);
}

/**
 * Approves it: points are awarded and the chore is finished.
 *
 * Locked and re-checked, so a stale tab cannot pay for the same chore twice.
 */
function approveChore(payload) {
  payload = payload || {};
  var me = requireApprover(payload.memberToken);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var c = ownChore(me.householdId, payload.choreId);
    assertMaySee(c, me);
    assertStatus(c, [STATUS.SUBMIT]);

    update(CONFIG.SHEET_CHORES, c, {
      status: STATUS.DONE,
      approvedBy: me.memberId,
      approvedAt: stamp(),
      reviewNote: ''
    });

    var pts = Number(c.points || 0);
    if (pts > 0 && c.assigneeId) {
      var who = findOne(CONFIG.SHEET_MEMBERS, { memberId: c.assigneeId });
      if (who) {
        update(CONFIG.SHEET_MEMBERS, who,
               { points: Number(who.points || 0) + pts });
      }
    }
    logAction(me.householdId, c.choreId, me.memberId, 'approved',
              '#' + (c.ref || '?') + ' ' + c.title + ' (+' + pts + ')');

    // Repeating chores are NOT respawned here. They are posted by the nightly
    // job with everything else, so a chore approved at four in the afternoon
    // does not reappear mid-afternoon tomorrow while the Trough and the Sty
    // arrive at midnight.
  } finally {
    lock.releaseLock();
  }
  return loadBoard(payload);
}

/** Not good enough yet: back to in progress, with a note saying why. */
function sendBackChore(payload) {
  payload = payload || {};
  var me = requireApprover(payload.memberToken);
  var c = ownChore(me.householdId, payload.choreId);
  assertMaySee(c, me);

  assertStatus(c, [STATUS.SUBMIT]);

  var note = String(payload.note || '').trim().slice(0, 500);
  update(CONFIG.SHEET_CHORES, c, {
    status: STATUS.PROGRESS,
    submittedAt: '',
    reviewNote: note || 'Needs another look.'
  });
  logAction(me.householdId, c.choreId, me.memberId, 'sent_back', note);

  return loadBoard(payload);
}

/** Hands an existing chore to somebody, from any stage. Parents only. */
function assignChore(payload) {
  payload = payload || {};
  var me = requireApprover(payload.memberToken);
  var c = ownChore(me.householdId, payload.choreId);
  assertMaySee(c, me);

  if (c.status === STATUS.DONE) throw new Error('That chore is already done.');

  var target = findOne(CONFIG.SHEET_MEMBERS, { memberId: payload.assigneeId });
  if (!target || String(target.householdId) !== String(me.householdId)) {
    throw new Error('That person is not in this household.');
  }

  update(CONFIG.SHEET_CHORES, c, {
    assigneeId: target.memberId,
    status: c.status === STATUS.POOL ? STATUS.CLAIMED : c.status,
    claimedAt: c.claimedAt || stamp()
  });
  logAction(me.householdId, c.choreId, me.memberId, 'assigned',
            c.title + ' -> ' + target.name);

  return loadBoard(payload);
}

/** Puts a finished chore back in the pool. Parents only. */
function reopenChore(payload) {
  payload = payload || {};
  var me = requireApprover(payload.memberToken);
  var c = ownChore(me.householdId, payload.choreId);
  assertMaySee(c, me);

  assertStatus(c, [STATUS.DONE]);

  // Points already awarded are not clawed back -- the work was done. Reopening
  // is for "this needs doing again", not for undoing a payout.
  //
  // A Trough or Sty chore goes back to the person who had it rather than to
  // the pool, for the same reason it could not be released there.
  var daily = isDailyChore(c);

  update(CONFIG.SHEET_CHORES, c, {
    status: daily ? STATUS.CLAIMED : STATUS.POOL,
    assigneeId: daily ? c.assigneeId : '',
    claimedAt: daily ? stamp() : '',
    startedAt: '',
    submittedAt: '',
    approvedBy: '',
    approvedAt: '',
    reviewNote: ''
  });
  logAction(me.householdId, c.choreId, me.memberId, 'reopened', c.title);

  return loadBoard(payload);
}

// ---------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------

/** How many days a recurrence rule waits. 0 for "does not repeat". */
function recurrenceDays(recurrence) {
  if (recurrence === 'daily') return 1;
  if (recurrence === 'weekly') return 7;
  if (recurrence === 'monthly') return 30;
  return 0;
}

/** The script's timezone, for formatting dates the household recognises. */
function CONFIG_TZ() {
  return Session.getScriptTimeZone() || 'America/Chicago';
}

// ---------------------------------------------------------------------
// Input tidying
// ---------------------------------------------------------------------

/** Accepts yyyy-mm-dd and nothing else; anything odd becomes no date. */
function cleanDate(v) {
  var s = String(v || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  var d = new Date(s + 'T12:00:00');
  return isNaN(d.getTime()) ? '' : s;
}

function cleanRecurrence(v) {
  var s = String(v || '').trim().toLowerCase();
  return ['daily', 'weekly', 'monthly'].indexOf(s) >= 0 ? s : '';
}

// ---------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------

/**
 * Tells the account holder that something is waiting for approval.
 *
 * Reports rather than throws: a submission that is already banked must never
 * be lost because the mail quota ran out.
 */
function notifySubmission(chore, submitter) {
  try {
    var h = findOne(CONFIG.SHEET_HOUSEHOLDS, { householdId: chore.householdId });
    if (!h || !h.ownerEmail) return { sent: false, reason: 'no owner email' };

    MailApp.sendEmail({
      to: h.ownerEmail,
      name: CONFIG.FROM_NAME,
      subject: '[' + CONFIG.APP_NAME + '] ' + submitter.name +
               ' finished: ' + chore.title,
      htmlBody:
        '<p><strong>' + escapeHtml(submitter.name) + '</strong> has marked a chore done ' +
        'and it is waiting for your approval.</p>' +
        '<p style="font-size:1.1em"><strong>' + escapeHtml(chore.title) + '</strong>' +
        (Number(chore.points || 0) ? ' &mdash; ' + Number(chore.points) + ' points' : '') +
        '</p>' +
        (chore.notes ? '<p>' + escapeHtml(chore.notes) + '</p>' : '') +
        '<p>Open ' + escapeHtml(CONFIG.APP_NAME) +
        ' and check the <em>Ready for Approval</em> tab.</p>'
    });
    return { sent: true };
  } catch (err) {
    console.error('notifySubmission failed: ' + err);
    return { sent: false, reason: String(err) };
  }
}

function escapeHtml(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
