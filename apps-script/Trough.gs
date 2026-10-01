/**
 * Chore Boar -- The Trough.
 *
 * A standing list of the chores that come round on a schedule. Filling the
 * trough copies each one that is due into a real chore and hands it to
 * somebody.
 *
 * Two things narrow each item, and both are per item:
 *
 *   WHO       everyone, a named group, or specific people. The random pick
 *             happens INSIDE that set, so "the bins" shared between the two
 *             eldest never lands on the four-year-old. See Groups.gs.
 *
 *   HOW OFTEN daily, weekly on a chosen day, fortnightly, or monthly on a
 *             chosen date. Blank means daily, which is what the list used to
 *             be. See troughDueToday() in Daily.gs.
 *
 * The hand-out is pseudo-random, not random. Three rules shape it:
 *
 *   1. Nobody gets the same trough chore twice running. Whoever had the bins
 *      last time is not eligible this time.
 *
 *   2. Children are favoured over parents. They are the ones spending the
 *      points, so they should be earning most of them.
 *
 *   3. The points come out roughly even -- weighted by rule 2 -- so nobody
 *      ends the day with three times what everybody else got.
 *
 * Rules 2 and 3 are one mechanism: each person is given a TARGET share of the
 * day's points, proportional to their weight, and every chore goes to whoever
 * is furthest below theirs. Biggest chores first, so the small ones are left
 * over to even the totals up.
 *
 * It is handed out by the nightly job in Daily.gs, not by anybody pressing a
 * button. The list itself is standing: what is on it stays until it is taken
 * off.
 */

// ---------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------

/** Every chore on the list, in the shape the client renders and edits. */
function troughItems(householdId) {
  return findAll(CONFIG.SHEET_TROUGH, { householdId: householdId })
    .filter(function (t) { return String(t.active) !== 'false'; })
    .map(function (t) {
      var out = {
        troughId: t.troughId,
        title: t.title,
        notes: t.notes || '',
        category: t.category || '',
        points: Number(t.points || 0),
        frequency: String(t.frequency || 'daily') || 'daily',
        onDay: Number(t.onDay || 0),
        // Carried because 'fortnightly' is anchored to the week the item was
        // created, so the schedule test needs it.
        createdAt: t.createdAt || ''
      };
      var who = publicAudience(t);
      out.audience = who.audience;
      out.groupId = who.groupId;
      out.memberIds = who.memberIds;
      return out;
    });
}

/** The list, plus who got what last time it was filled. */
function loadTrough(payload) {
  payload = payload || {};
  var me = requireMember(payload.memberToken);

  return {
    name: CONFIG.TROUGH_NAME,
    items: troughItems(me.householdId),
    lastFilled: lastFillSummary(me.householdId),
    canEdit: me.role === 'owner',
    // Handed out by the nightly job, so there is nothing here to press.
    fillHour: Number(CONFIG.DAILY_FILL_HOUR) || 0,
    // So the form can draw its pickers without a second call.
    groups: groupsFor(me.householdId),
    members: activeMembers(me.householdId),
    frequencies: CONFIG.TROUGH_FREQUENCIES,
    weekdays: CONFIG.WEEKDAYS
  };
}

/**
 * Reads a frequency off a request payload.
 *
 * onDay carries two different things depending on the frequency -- a weekday
 * for weekly and fortnightly, a date for monthly -- so it is clamped to the
 * right range here rather than trusted. A monthly chore is capped at the
 * 28th: "the 31st" would silently skip five months of the year.
 */
function scheduleFromPayload(payload) {
  var freq = String(payload.frequency || 'daily').toLowerCase();
  var allowed = CONFIG.TROUGH_FREQUENCIES || ['daily'];
  if (allowed.indexOf(freq) < 0) freq = 'daily';

  var onDay = 0;
  if (freq === 'weekly' || freq === 'fortnightly') {
    onDay = Math.max(0, Math.min(6, Math.round(Number(payload.onDay) || 0)));
  } else if (freq === 'monthly') {
    onDay = Math.max(1, Math.min(28, Math.round(Number(payload.onDay) || 1)));
  }
  return { frequency: freq, onDay: onDay };
}

/** Adds a chore to the list. Account holder only. */
function addTroughItem(payload) {
  payload = payload || {};
  var me = requireOwner(payload.memberToken);

  var title = String(payload.title || '').trim();
  if (!title) throw new Error('Give the chore a name.');

  var who = audienceFromPayload(me.householdId, payload);
  var when = scheduleFromPayload(payload);

  insert(CONFIG.SHEET_TROUGH, {
    troughId: newId('t'),
    householdId: me.householdId,
    title: title.slice(0, 120),
    notes: String(payload.notes || '').slice(0, 1000),
    category: String(payload.category || '').slice(0, 40),
    points: Math.max(0, Math.min(999, Math.round(Number(payload.points) || 0))),
    active: true,
    createdAt: stamp(),
    audience: who.audience,
    groupId: who.groupId,
    memberIds: who.memberIds,
    frequency: when.frequency,
    onDay: when.onDay
  });
  logAction(me.householdId, '', me.memberId, 'trough_added', title);

  return loadTrough(payload);
}

/** Edits one. Account holder only. */
function updateTroughItem(payload) {
  payload = payload || {};
  var me = requireOwner(payload.memberToken);

  var t = findOne(CONFIG.SHEET_TROUGH, { troughId: payload.troughId });
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
  if (payload.audience !== undefined) {
    var who = audienceFromPayload(me.householdId, payload);
    changes.audience = who.audience;
    changes.groupId = who.groupId;
    changes.memberIds = who.memberIds;
  }
  if (payload.frequency !== undefined) {
    var when = scheduleFromPayload(payload);
    changes.frequency = when.frequency;
    changes.onDay = when.onDay;
  }

  update(CONFIG.SHEET_TROUGH, t, changes);
  logAction(me.householdId, '', me.memberId, 'trough_edited', t.title);

  return loadTrough(payload);
}

/** Takes one off the list. Chores already handed out are left alone. */
function removeTroughItem(payload) {
  payload = payload || {};
  var me = requireOwner(payload.memberToken);

  var t = findOne(CONFIG.SHEET_TROUGH, { troughId: payload.troughId });
  if (!t || String(t.householdId) !== String(me.householdId)) {
    throw new Error('That is not on your list.');
  }
  logAction(me.householdId, '', me.memberId, 'trough_removed', t.title);
  remove(CONFIG.SHEET_TROUGH, t);

  return loadTrough(payload);
}

// ---------------------------------------------------------------------
// Filling it
// ---------------------------------------------------------------------

/**
 * Hands the Trough out for one household. Called by the nightly job.
 *
 * Takes a household id rather than a request payload: it runs from a trigger,
 * where there is no signed-in member and no token to check. Whether today has
 * already been done is the caller's business -- see fillDayFor() in Daily.gs,
 * which holds the lock across both lists.
 *
 * Returns the number of chores written.
 */
function fillTroughFor(householdId, actorId) {
  var today = todayStr();
  var all = findAll(CONFIG.SHEET_CHORES, { householdId: householdId });

  // A chore nobody finished is still owed. Handing the same one out again
  // would leave two of it on the board and let somebody else do work that
  // was deliberately given to a particular person -- so the outstanding one
  // simply stays where it is, and this item sits out tonight.
  var outstanding = {};
  all.forEach(function (c) {
    if (c.troughId && c.status !== STATUS.DONE) outstanding[c.troughId] = true;
  });

  var items = troughItems(householdId).filter(function (i) {
    return !outstanding[i.troughId] && troughDueToday(i, today);
  });
  if (!items.length) return 0;

  var people = findAll(CONFIG.SHEET_MEMBERS, { householdId: householdId })
    .filter(function (m) { return String(m.active) !== 'false'; });
  if (!people.length) return 0;

  var groupIndex = groupIndexFor(householdId);

  // Who an item may go to. An item whose group was deleted, or all of whose
  // people have been turned off, resolves to nobody -- and is then skipped
  // rather than quietly widened back out to the whole household.
  var poolFor = function (item) {
    return audienceMembers(item, people, groupIndex);
  };
  items = items.filter(function (i) { return poolFor(i).length > 0; });
  if (!items.length) return 0;

  var nextRef = refAllocator(householdId);
  var plan = planTrough(items, people, recentHolders(householdId, all, today),
                        poolFor);

  plan.forEach(function (row) {
    insert(CONFIG.SHEET_CHORES, {
      choreId: newId('c'),
      householdId: householdId,
      title: row.item.title,
      notes: row.item.notes,
      category: row.item.category,
      points: row.item.points,
      status: STATUS.CLAIMED,
      createdBy: actorId || '',
      createdAt: stamp(),
      assigneeId: row.member.memberId,
      claimedAt: stamp(),
      startedAt: '',
      submittedAt: '',
      approvedBy: '',
      approvedAt: '',
      dueDate: today,
      recurrence: '',
      reviewNote: '',
      troughId: row.item.troughId,
      styId: '',
      ref: nextRef(),
      seriesId: ''
    });
  });

  return plan.length;
}

/**
 * Who should not get each trough chore this time, as { troughId: {memberId} }.
 *
 * Two rules, unioned:
 *
 *   1. Anybody who had it within the last CONFIG.NO_REPEAT_DAYS days. This is
 *      the daily rule -- not the bins two nights running.
 *
 *   2. Whoever had the PREVIOUS instance of that item, however long ago.
 *      Without this, a weekly or monthly chore has no no-repeat rule at all:
 *      its last hand-out was seven or thirty days back, comfortably outside
 *      the date window, so the same child could have the bins every Saturday
 *      for a year and the shuffle would never notice.
 *
 * Used only to exclude people, so a missing entry simply means "anyone may
 * have it".
 */
function recentHolders(householdId, allChores, today) {
  today = today || todayStr();

  var cutoff = new Date();
  cutoff.setHours(12, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - Math.max(1, Number(CONFIG.NO_REPEAT_DAYS) || 1));
  var cutoffStr = Utilities.formatDate(cutoff, CONFIG_TZ(), 'yyyy-MM-dd');

  var recent = {};
  var lastDate = {};
  var lastHolders = {};

  (allChores || findAll(CONFIG.SHEET_CHORES, { householdId: householdId }))
    .forEach(function (c) {
      if (!c.troughId || !c.assigneeId) return;
      var d = String(c.dueDate).slice(0, 10);
      if (d >= today) return;

      // Rule 1 -- the date window.
      if (d >= cutoffStr) {
        if (!recent[c.troughId]) recent[c.troughId] = {};
        recent[c.troughId][c.assigneeId] = true;
      }

      // Rule 2 -- the most recent hand-out, whenever it was. Ties are kept
      // together: two people can share one date if the item was re-posted.
      if (!lastDate[c.troughId] || d > lastDate[c.troughId]) {
        lastDate[c.troughId] = d;
        lastHolders[c.troughId] = {};
      }
      if (d === lastDate[c.troughId]) lastHolders[c.troughId][c.assigneeId] = true;
    });

  Object.keys(lastHolders).forEach(function (troughId) {
    if (!recent[troughId]) recent[troughId] = {};
    Object.keys(lastHolders[troughId]).forEach(function (memberId) {
      recent[troughId][memberId] = true;
    });
  });

  return recent;
}

/**
 * Works out who gets what. Pure -- no reads, no writes -- so it can be
 * reasoned about and tested on its own.
 *
 * `poolFor(item)` returns the members that item may go to; omit it and every
 * item may go to anybody.
 *
 * Returns [{item, member}].
 */
function planTrough(items, people, recent, poolFor) {
  poolFor = poolFor || function () { return people; };

  // Biggest chores first, ties shuffled so the same person does not always
  // get the same one of two equal chores.
  var queue = shuffle(items.slice()).sort(function (a, b) {
    return Number(b.points || 0) - Number(a.points || 0);
  });

  var total = 0;
  queue.forEach(function (i) { total += Number(i.points || 0); });

  // Anyone who can approve is a parent; everybody else is a child and carries
  // the heavier share.
  var weightOf = {};
  var sumWeights = 0;
  people.forEach(function (m) {
    var w = canApprove(m) ? 1 : Math.max(1, Number(CONFIG.CHILD_WEIGHT) || 1);
    weightOf[m.memberId] = w;
    sumWeights += w;
  });

  // Each person gets a TARGET share of the day's points, and every chore goes
  // to whoever is furthest below theirs.
  //
  // The obvious version of this -- track points-so-far divided by weight and
  // give to the lightest -- looks equivalent and is not. At the start
  // everybody is on zero, so the first and biggest chore goes out to a
  // uniformly random person, parents included; measured over 400 runs that
  // washed the whole bias out and children ended up with 18% more instead of
  // the intended share. Targets are known before anything is handed out, so
  // the 20-pointer goes to a child on the first pass.
  //
  // Targets are still worked out across EVERYBODY even though an item may
  // only go to some of them. A child who is in every group would otherwise
  // be measured against a smaller pot on each item and come out carrying far
  // more than their share of the evening.
  var target = {};
  var given = {};
  people.forEach(function (m) {
    target[m.memberId] = sumWeights ? total * weightOf[m.memberId] / sumWeights : 0;
    given[m.memberId] = 0;
  });

  var plan = [];

  queue.forEach(function (item) {
    var blocked = recent[item.troughId] || {};
    var pool = poolFor(item);
    if (!pool.length) return;

    var eligible = pool.filter(function (m) { return !blocked[m.memberId]; });

    // Everybody in the pool had this one last time -- a one-person group, or
    // a short list. The no-repeat rule is a preference, not a reason to skip
    // a chore.
    if (!eligible.length) eligible = pool.slice();

    // Shuffled first so identical deficits break randomly rather than by
    // sheet order, which is what keeps the hand-out varying day to day.
    eligible = shuffle(eligible);

    var best = eligible[0];
    var bestNeed = target[best.memberId] - given[best.memberId];

    for (var i = 1; i < eligible.length; i++) {
      var m = eligible[i];
      var need = target[m.memberId] - given[m.memberId];
      if (need > bestNeed) { best = m; bestNeed = need; }
    }

    given[best.memberId] += Number(item.points || 0);
    plan.push({ item: item, member: best });
  });

  return plan;
}

/** Fisher-Yates. */
function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/** What today's fill produced, for the "last filled" line. */
function lastFillSummary(householdId) {
  var today = todayStr();
  var mine = findAll(CONFIG.SHEET_CHORES, { householdId: householdId })
    .filter(function (c) {
      return c.troughId && String(c.dueDate).slice(0, 10) === today;
    });
  if (!mine.length) return null;

  var members = {};
  activeMembers(householdId).forEach(function (m) { members[m.memberId] = m; });

  var per = {};
  mine.forEach(function (c) {
    var who = members[c.assigneeId];
    var name = who ? who.name : 'Someone';
    if (!per[name]) per[name] = { name: name, count: 0, points: 0,
                                  color: who ? who.color : '#888' };
    per[name].count++;
    per[name].points += Number(c.points || 0);
  });

  return {
    date: today,
    total: mine.length,
    perPerson: Object.keys(per).map(function (k) { return per[k]; })
      .sort(function (a, b) { return b.points - a.points; })
  };
}

/** Today, in the script's timezone rather than the server's idea of UTC. */
function todayStr() {
  return Utilities.formatDate(new Date(), CONFIG_TZ(), 'yyyy-MM-dd');
}
