/**
 * Chore Boar -- The Sty.
 *
 * The other daily list, and the opposite of the Trough.
 *
 *   The Trough   one chore, one person. Shared out, balanced, no repeats.
 *   The Sty      one chore, EVERYBODY. Nobody can do it for anyone else.
 *
 * It is for the chores that are each person's own -- their bed, their room,
 * their washing. There is nothing to balance and nothing to randomise: if
 * "put your laundry away" is on the list, everybody gets "put your laundry
 * away" every day.
 *
 * Both lists are standing lists. Anything added stays until it is taken off.
 */

/** Everything on the list. */
function styItems(householdId) {
  return findAll(CONFIG.SHEET_STY, { householdId: householdId })
    .filter(function (t) { return String(t.active) !== 'false'; })
    .map(function (t) {
      return {
        styId: t.styId,
        title: t.title,
        notes: t.notes || '',
        category: t.category || '',
        points: Number(t.points || 0)
      };
    });
}

/** The list, plus what today's hand-out produced. */
function loadSty(payload) {
  payload = payload || {};
  var me = requireMember(payload.memberToken);

  return {
    name: CONFIG.STY_NAME,
    items: styItems(me.householdId),
    parentsToo: CONFIG.STY_PARENTS_TOO !== false,
    handedOutToday: countStyToday(me.householdId),
    canEdit: me.role === 'owner'
  };
}

function countStyToday(householdId) {
  var today = todayStr();
  return findAll(CONFIG.SHEET_CHORES, { householdId: householdId })
    .filter(function (c) {
      return c.styId && String(c.dueDate).slice(0, 10) === today;
    }).length;
}

/** Adds a chore to the list. Account holder only. */
function addStyItem(payload) {
  payload = payload || {};
  var me = requireOwner(payload.memberToken);

  var title = String(payload.title || '').trim();
  if (!title) throw new Error('Give the chore a name.');

  insert(CONFIG.SHEET_STY, {
    styId: newId('y'),
    householdId: me.householdId,
    title: title.slice(0, 120),
    notes: String(payload.notes || '').slice(0, 1000),
    category: String(payload.category || '').slice(0, 40),
    points: Math.max(0, Math.min(999, Math.round(Number(payload.points) || 0))),
    active: true,
    createdAt: stamp()
  });
  logAction(me.householdId, '', me.memberId, 'sty_added', title);

  return loadSty(payload);
}

function updateStyItem(payload) {
  payload = payload || {};
  var me = requireOwner(payload.memberToken);

  var t = findOne(CONFIG.SHEET_STY, { styId: payload.styId });
  if (!t || String(t.householdId) !== String(me.householdId)) {
    throw new Error('That is not on your list.');
  }

  var changes = {};
  if (payload.title !== undefined) {
    var title = String(payload.title).trim();
    if (!title) throw new Error('Give the chore a name.');
    changes.title = title.slice(0, 120);
  }
  if (payload.notes !== undefined) changes.notes = String(payload.notes).slice(0, 1000);
  if (payload.category !== undefined) changes.category = String(payload.category).slice(0, 40);
  if (payload.points !== undefined) {
    changes.points = Math.max(0, Math.min(999,
                              Math.round(Number(payload.points) || 0)));
  }

  update(CONFIG.SHEET_STY, t, changes);
  logAction(me.householdId, '', me.memberId, 'sty_edited', t.title);

  return loadSty(payload);
}

function removeStyItem(payload) {
  payload = payload || {};
  var me = requireOwner(payload.memberToken);

  var t = findOne(CONFIG.SHEET_STY, { styId: payload.styId });
  if (!t || String(t.householdId) !== String(me.householdId)) {
    throw new Error('That is not on your list.');
  }
  logAction(me.householdId, '', me.memberId, 'sty_removed', t.title);
  remove(CONFIG.SHEET_STY, t);

  return loadSty(payload);
}

// ---------------------------------------------------------------------
// The hand-out
// ---------------------------------------------------------------------

/**
 * Gives every item on the list to every eligible person.
 *
 * Called by the nightly job, not by a button. Returns how many chores it
 * wrote so the job can log something useful.
 */
function fillStyFor(householdId, actorId) {
  var items = styItems(householdId);
  if (!items.length) return 0;

  var people = findAll(CONFIG.SHEET_MEMBERS, { householdId: householdId })
    .filter(function (m) {
      if (String(m.active) === 'false') return false;
      if (CONFIG.STY_PARENTS_TOO === false && canApprove(m)) return false;
      return true;
    });
  if (!people.length) return 0;

  var today = todayStr();
  var written = 0;

  people.forEach(function (m) {
    items.forEach(function (item) {
      insert(CONFIG.SHEET_CHORES, {
        choreId: newId('c'),
        householdId: householdId,
        title: item.title,
        notes: item.notes,
        category: item.category,
        points: item.points,
        // Straight to claimed and assigned. There is no pool step: this is
        // your bed, and nobody else can make it for you.
        status: STATUS.CLAIMED,
        createdBy: actorId || '',
        createdAt: stamp(),
        assigneeId: m.memberId,
        claimedAt: stamp(),
        startedAt: '',
        submittedAt: '',
        approvedBy: '',
        approvedAt: '',
        dueDate: today,
        recurrence: '',
        reviewNote: '',
        troughId: '',
        styId: item.styId
      });
      written++;
    });
  });

  return written;
}
