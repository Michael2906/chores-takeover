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
 * note. Approving a chore that has a recurrence rule immediately posts the
 * next one to the pool.
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
    pointPresets: CONFIG.POINT_PRESETS
  };
}

/** The safe, display-ready shape of a chore. */
function choreView(c, membersById) {
  var assignee = c.assigneeId && membersById[c.assigneeId];
  var creator = c.createdBy && membersById[c.createdBy];
  var approver = c.approvedBy && membersById[c.approvedBy];

  return {
    choreId: c.choreId,
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
 * Posts a chore.
 *
 * Anyone may add one -- volunteering to do something is worth encouraging --
 * but only a parent account sets its point value, or a child could award
 * itself twenty points for making its own bed.
 */
function createChore(payload) {
  payload = payload || {};
  var me = requireMember(payload.memberToken);

  var title = String(payload.title || '').trim();
  if (!title) throw new Error('Give the chore a name.');
  if (title.length > 120) title = title.slice(0, 120);

  var points = 0;
  if (canApprove(me)) {
    points = Math.max(0, Math.min(999, Math.round(Number(payload.points) || 0)));
  }

  var assigneeId = '';
  var status = STATUS.POOL;

  // A parent can hand a chore straight to somebody instead of pooling it.
  if (payload.assigneeId && canApprove(me)) {
    var target = findOne(CONFIG.SHEET_MEMBERS, { memberId: payload.assigneeId });
    if (!target || String(target.householdId) !== String(me.householdId)) {
      throw new Error('That person is not in this household.');
    }
    assigneeId = target.memberId;
    status = STATUS.CLAIMED;
  }

  var c = {
    choreId: newId('c'),
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
    recurrence: cleanRecurrence(payload.recurrence),
    reviewNote: ''
  };
  insert(CONFIG.SHEET_CHORES, c);
  logAction(me.householdId, c.choreId, me.memberId, 'created', title);

  return loadBoard(payload);
}

/**
 * Edits a chore. A parent can change any of them; anyone else only their own,
 * and only while it is still sitting in the pool.
 */
function updateChore(payload) {
  payload = payload || {};
  var me = requireMember(payload.memberToken);
  var c = ownChore(me.householdId, payload.choreId);

  if (!canApprove(me)) {
    if (String(c.createdBy) !== String(me.memberId) || c.status !== STATUS.POOL) {
      throw new Error('Only a parent account can change that chore.');
    }
  }

  var changes = {};
  if (payload.title !== undefined) {
    var t = String(payload.title).trim();
    if (!t) throw new Error('Give the chore a name.');
    changes.title = t.slice(0, 120);
  }
  if (payload.notes !== undefined) changes.notes = String(payload.notes).slice(0, 1000);
  if (payload.category !== undefined) changes.category = String(payload.category).slice(0, 40);
  if (payload.dueDate !== undefined) changes.dueDate = cleanDate(payload.dueDate);
  if (payload.recurrence !== undefined) changes.recurrence = cleanRecurrence(payload.recurrence);

  // Points stay a parent's decision, on edit as much as on create.
  if (payload.points !== undefined && canApprove(me)) {
    changes.points = Math.max(0, Math.min(999, Math.round(Number(payload.points) || 0)));
  }

  update(CONFIG.SHEET_CHORES, c, changes);
  logAction(me.householdId, c.choreId, me.memberId, 'edited',
            Object.keys(changes).join(', '));

  return loadBoard(payload);
}

/** Deletes a chore. Same rule as editing one. */
function deleteChore(payload) {
  payload = payload || {};
  var me = requireMember(payload.memberToken);
  var c = ownChore(me.householdId, payload.choreId);

  if (!canApprove(me)) {
    if (String(c.createdBy) !== String(me.memberId) || c.status !== STATUS.POOL) {
      throw new Error('Only a parent account can delete that chore.');
    }
  }
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
  if (String(c.assigneeId) !== String(me.memberId) && !canApprove(me)) {
    throw new Error('That is not your chore.');
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
  if (String(c.assigneeId) !== String(me.memberId) && !canApprove(me)) {
    throw new Error('That is not your chore.');
  }

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
  if (String(c.assigneeId) !== String(me.memberId) && !canApprove(me)) {
    throw new Error('That is not your chore.');
  }

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
  if (String(c.assigneeId) !== String(me.memberId) && !canApprove(me)) {
    throw new Error('That is not your chore.');
  }

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
              c.title + ' (+' + pts + ')');

    // A repeating chore posts its next occurrence the moment this one lands.
    if (c.recurrence) respawn(c, me);
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

  assertStatus(c, [STATUS.DONE]);

  // Points already awarded are not clawed back -- the work was done. Reopening
  // is for "this needs doing again", not for undoing a payout.
  update(CONFIG.SHEET_CHORES, c, {
    status: STATUS.POOL,
    assigneeId: '',
    claimedAt: '',
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

/** Posts the next occurrence of a repeating chore into the pool. */
function respawn(c, actor) {
  var next = nextDueDate(c.dueDate, c.recurrence);

  insert(CONFIG.SHEET_CHORES, {
    choreId: newId('c'),
    householdId: c.householdId,
    title: c.title,
    notes: c.notes || '',
    category: c.category || '',
    points: Number(c.points || 0),
    status: STATUS.POOL,
    createdBy: c.createdBy || actor.memberId,
    createdAt: stamp(),
    assigneeId: '',
    claimedAt: '',
    startedAt: '',
    submittedAt: '',
    approvedBy: '',
    approvedAt: '',
    dueDate: next,
    recurrence: c.recurrence,
    reviewNote: ''
  });
  logAction(c.householdId, '', actor.memberId, 'respawned',
            c.title + ' due ' + (next || 'whenever'));
}

/**
 * The next due date for a repeating chore.
 *
 * Counted from today rather than from the old due date, so a weekly chore
 * approved three weeks late becomes due next week -- not immediately overdue
 * on arrival, which would be a rotten thing to hand somebody.
 */
function nextDueDate(previous, recurrence) {
  var base = new Date();
  base.setHours(12, 0, 0, 0);

  if (recurrence === 'daily') base.setDate(base.getDate() + 1);
  else if (recurrence === 'weekly') base.setDate(base.getDate() + 7);
  else if (recurrence === 'monthly') base.setMonth(base.getMonth() + 1);
  else return '';

  return Utilities.formatDate(base, CONFIG_TZ(), 'yyyy-MM-dd');
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
