/**
 * Chore Boar -- named groups of people, and who an item is aimed at.
 *
 * A group is a name and a set of members: "The Kids", "The Big Two". It
 * exists so that "who gets this" is said ONCE and then reused by every item
 * on both daily lists, rather than re-ticking the same four children on the
 * twelfth homework chore.
 *
 * Groups are resolved at HAND-OUT time, never copied into the item. Adding a
 * child to "The Kids" therefore changes every chore aimed at that group, with
 * nothing to go back and edit -- which is the whole reason for having them.
 *
 * ---------------------------------------------------------------------
 * The audience of an item
 * ---------------------------------------------------------------------
 *
 * Both the Trough and the Sty carry the same three columns:
 *
 *   audience    '' or 'everyone' | 'group' | 'people'
 *   groupId     which group, when audience is 'group'
 *   memberIds   a CSV of member ids, when audience is 'people'
 *
 * '' means everyone, so every row written before any of this existed keeps
 * doing exactly what it did.
 */

// ---------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------

/** Every group in the household, with its members as an array. */
function groupsFor(householdId) {
  return findAll(CONFIG.SHEET_GROUPS, { householdId: householdId })
    .map(function (g) {
      return {
        groupId: g.groupId,
        name: g.name,
        memberIds: csvToList(g.memberIds)
      };
    });
}

/** The groups a signed-in member may see. Everyone can read them. */
function loadGroups(payload) {
  payload = payload || {};
  var me = requireMember(payload.memberToken);
  return {
    groups: groupsFor(me.householdId),
    members: activeMembers(me.householdId),
    canEdit: me.role === 'owner'
  };
}

// ---------------------------------------------------------------------
// Writing. Account holder only -- same bar as managing accounts.
// ---------------------------------------------------------------------

function addGroup(payload) {
  payload = payload || {};
  var me = requireOwner(payload.memberToken);

  var name = String(payload.name || '').trim();
  if (!name) throw new Error('Give the group a name.');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var clash = groupsFor(me.householdId).filter(function (g) {
      return String(g.name).toLowerCase() === name.toLowerCase();
    });
    if (clash.length) throw new Error('There is already a group called ' + name + '.');

    insert(CONFIG.SHEET_GROUPS, {
      groupId: newId('g'),
      householdId: me.householdId,
      name: name.slice(0, 40),
      memberIds: cleanMemberCsv(me.householdId, payload.memberIds),
      createdAt: stamp()
    });
    logAction(me.householdId, '', me.memberId, 'group_added', name);
  } finally {
    lock.releaseLock();
  }

  return loadGroups(payload);
}

function updateGroup(payload) {
  payload = payload || {};
  var me = requireOwner(payload.memberToken);

  var g = findOne(CONFIG.SHEET_GROUPS, { groupId: payload.groupId });
  if (!g || String(g.householdId) !== String(me.householdId)) {
    throw new Error('That group is not in this household.');
  }

  var changes = {};
  if (payload.name !== undefined) {
    var name = String(payload.name).trim();
    if (!name) throw new Error('A group name cannot be blank.');
    changes.name = name.slice(0, 40);
  }
  if (payload.memberIds !== undefined) {
    changes.memberIds = cleanMemberCsv(me.householdId, payload.memberIds);
  }

  update(CONFIG.SHEET_GROUPS, g, changes);
  logAction(me.householdId, '', me.memberId, 'group_updated', g.name);

  return loadGroups(payload);
}

/**
 * Deletes a group.
 *
 * Items pointing at it are NOT rewritten to "everyone". An item that has lost
 * its group hands out to nobody and says so on the list, which is a visible
 * problem somebody fixes; quietly widening "the kids' homework" to the whole
 * household is a silent one.
 */
function removeGroup(payload) {
  payload = payload || {};
  var me = requireOwner(payload.memberToken);

  var g = findOne(CONFIG.SHEET_GROUPS, { groupId: payload.groupId });
  if (!g || String(g.householdId) !== String(me.householdId)) {
    throw new Error('That group is not in this household.');
  }

  var used = countItemsUsingGroup(me.householdId, g.groupId);
  if (used && !payload.force) {
    throw new Error('That group is used by ' + used +
                    (used === 1 ? ' chore' : ' chores') +
                    '. Point those somewhere else first, or delete it anyway.');
  }

  logAction(me.householdId, '', me.memberId, 'group_removed', g.name);
  remove(CONFIG.SHEET_GROUPS, g);

  return loadGroups(payload);
}

/** How many Trough and Sty items are aimed at one group. */
function countItemsUsingGroup(householdId, groupId) {
  var n = 0;
  [CONFIG.SHEET_TROUGH, CONFIG.SHEET_STY].forEach(function (sheet) {
    findAll(sheet, { householdId: householdId }).forEach(function (t) {
      if (String(t.active) === 'false') return;
      if (String(t.audience) === 'group' && String(t.groupId) === String(groupId)) n++;
    });
  });
  return n;
}

// ---------------------------------------------------------------------
// Resolving an audience to actual people
// ---------------------------------------------------------------------

/**
 * Which of `people` an item is aimed at.
 *
 * `people` is the already-filtered list of active members, passed in rather
 * than read, because the hand-out resolves a whole list of items in one go
 * and re-reading the Members sheet per item would be the expensive part.
 *
 * Returns [] when the audience names nobody -- a deleted group, or people who
 * have all been turned off. The item is then skipped for the night rather
 * than falling back to everybody: an item that says who it is for has said
 * so deliberately.
 */
function audienceMembers(rec, people, groupIndex) {
  var kind = String(rec.audience || 'everyone');

  if (kind === 'group') {
    var g = groupIndex[String(rec.groupId)];
    if (!g) return [];
    var inGroup = {};
    g.memberIds.forEach(function (id) { inGroup[String(id)] = true; });
    return people.filter(function (m) { return inGroup[String(m.memberId)]; });
  }

  if (kind === 'people') {
    var picked = {};
    csvToList(rec.memberIds).forEach(function (id) { picked[String(id)] = true; });
    return people.filter(function (m) { return picked[String(m.memberId)]; });
  }

  return people.slice();
}

/** Groups keyed by id, for audienceMembers to look up without re-reading. */
function groupIndexFor(householdId) {
  var index = {};
  groupsFor(householdId).forEach(function (g) { index[String(g.groupId)] = g; });
  return index;
}

/** The audience of a stored row, in the shape the client edits. */
function publicAudience(rec) {
  return {
    audience: String(rec.audience || 'everyone'),
    groupId: rec.groupId ? String(rec.groupId) : '',
    memberIds: csvToList(rec.memberIds)
  };
}

/**
 * Reads an audience off a request payload, checking it names something real.
 *
 * Returns the three columns to store. Throws rather than silently widening:
 * "the kids" turning into "everybody" because a group id was mistyped is the
 * kind of bug nobody notices until the wrong person is doing the homework.
 */
function audienceFromPayload(householdId, payload) {
  var kind = String(payload.audience || 'everyone');

  if (kind === 'group') {
    var id = String(payload.groupId || '');
    var g = findOne(CONFIG.SHEET_GROUPS, { groupId: id });
    if (!g || String(g.householdId) !== String(householdId)) {
      throw new Error('Pick a group.');
    }
    return { audience: 'group', groupId: id, memberIds: '' };
  }

  if (kind === 'people') {
    var csv = cleanMemberCsv(householdId, payload.memberIds);
    if (!csv) throw new Error('Pick at least one person.');
    return { audience: 'people', groupId: '', memberIds: csv };
  }

  return { audience: 'everyone', groupId: '', memberIds: '' };
}

// ---------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------

/** 'a,b,c' or ['a','b'] -> ['a','b','c']. Blanks dropped. */
function csvToList(v) {
  if (v === null || v === undefined || v === '') return [];
  var parts = Array.isArray(v) ? v : String(v).split(',');
  var out = [];
  parts.forEach(function (x) {
    var s = String(x).trim();
    if (s) out.push(s);
  });
  return out;
}

/** Keeps only ids that are real, active members of this household. */
function cleanMemberCsv(householdId, v) {
  var want = {};
  csvToList(v).forEach(function (id) { want[String(id)] = true; });
  if (!Object.keys(want).length) return '';

  var keep = [];
  findAll(CONFIG.SHEET_MEMBERS, { householdId: householdId }).forEach(function (m) {
    if (String(m.active) === 'false') return;
    if (want[String(m.memberId)]) keep.push(String(m.memberId));
  });
  return keep.join(',');
}
