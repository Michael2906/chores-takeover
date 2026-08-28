/**
 * Chore Boar -- The Prize Pen.
 *
 * What the points are actually for. The account holder stocks it with prizes
 * and a price; anybody can spend what they have earned.
 *
 * Points are taken the moment a prize is claimed, and the claim then sits in a
 * list until a parent marks it handed over -- because the prize itself happens
 * in the real world, and the app cannot know when the ice cream was bought.
 * Cancelling a claim refunds it.
 *
 * Everything that moves points is locked and re-checked inside the lock: two
 * phones claiming the last prize at once, or a child spending points that were
 * being adjusted at the same moment, are the obvious ways to end up owing
 * somebody something.
 */

// ---------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------

/** The shop front, plus this household's outstanding claims. */
function loadStore(payload) {
  payload = payload || {};
  var me = requireMember(payload.memberToken);

  var members = {};
  activeMembers(me.householdId).forEach(function (m) { members[m.memberId] = m; });

  var prizes = findAll(CONFIG.SHEET_PRIZES, { householdId: me.householdId })
    .filter(function (p) { return String(p.active) !== 'false'; })
    .map(function (p) {
      var stock = String(p.stock) === '' ? null : Number(p.stock);
      return {
        prizeId: p.prizeId,
        name: p.name,
        notes: p.notes || '',
        cost: Number(p.cost || 0),
        stock: stock,                       // null means unlimited
        soldOut: stock !== null && stock <= 0,
        affordable: Number(me.points || 0) >= Number(p.cost || 0)
      };
    })
    .sort(function (a, b) { return a.cost - b.cost; });

  // A child sees their own claims; a parent sees everybody's, because a
  // parent is the one who has to hand the prizes over.
  var claims = findAll(CONFIG.SHEET_REDEEMED, { householdId: me.householdId })
    .filter(function (r) {
      return canApprove(me) || String(r.memberId) === String(me.memberId);
    })
    .map(function (r) {
      var who = members[r.memberId];
      return {
        redemptionId: r.redemptionId,
        name: r.name,
        cost: Number(r.cost || 0),
        at: r.at,
        status: r.status || 'claimed',
        memberId: r.memberId,
        memberName: who ? who.name : 'Someone',
        memberColor: who ? who.color : '#888'
      };
    })
    .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });

  return {
    name: CONFIG.STORE_NAME,
    prizes: prizes,
    claims: claims.slice(0, 60),
    myPoints: Number(me.points || 0),
    canManage: me.role === 'owner',
    canFulfil: canApprove(me)
  };
}

// ---------------------------------------------------------------------
// Stocking it -- account holder only
// ---------------------------------------------------------------------

function addPrize(payload) {
  payload = payload || {};
  var me = requireOwner(payload.memberToken);

  var name = String(payload.name || '').trim();
  if (!name) throw new Error('Give the prize a name.');

  insert(CONFIG.SHEET_PRIZES, {
    prizeId: newId('p'),
    householdId: me.householdId,
    name: name.slice(0, 80),
    notes: String(payload.notes || '').slice(0, 500),
    cost: Math.max(0, Math.min(99999, Math.round(Number(payload.cost) || 0))),
    // Blank means unlimited, which is the common case for "stay up late".
    stock: payload.stock === '' || payload.stock === undefined ||
           payload.stock === null
             ? '' : Math.max(0, Math.round(Number(payload.stock) || 0)),
    active: true,
    createdAt: stamp()
  });
  logAction(me.householdId, '', me.memberId, 'prize_added', name);

  return loadStore(payload);
}

function updatePrize(payload) {
  payload = payload || {};
  var me = requireOwner(payload.memberToken);

  var p = findOne(CONFIG.SHEET_PRIZES, { prizeId: payload.prizeId });
  if (!p || String(p.householdId) !== String(me.householdId)) {
    throw new Error('That prize is not in your store.');
  }

  var changes = {};
  if (payload.name !== undefined) {
    var n = String(payload.name).trim();
    if (!n) throw new Error('Give the prize a name.');
    changes.name = n.slice(0, 80);
  }
  if (payload.notes !== undefined) changes.notes = String(payload.notes).slice(0, 500);
  if (payload.cost !== undefined) {
    changes.cost = Math.max(0, Math.min(99999, Math.round(Number(payload.cost) || 0)));
  }
  if (payload.stock !== undefined) {
    changes.stock = payload.stock === '' || payload.stock === null
      ? '' : Math.max(0, Math.round(Number(payload.stock) || 0));
  }

  update(CONFIG.SHEET_PRIZES, p, changes);
  logAction(me.householdId, '', me.memberId, 'prize_edited', p.name);

  return loadStore(payload);
}

/** Takes a prize off the shelf. Past claims keep their record. */
function removePrize(payload) {
  payload = payload || {};
  var me = requireOwner(payload.memberToken);

  var p = findOne(CONFIG.SHEET_PRIZES, { prizeId: payload.prizeId });
  if (!p || String(p.householdId) !== String(me.householdId)) {
    throw new Error('That prize is not in your store.');
  }
  logAction(me.householdId, '', me.memberId, 'prize_removed', p.name);
  remove(CONFIG.SHEET_PRIZES, p);

  return loadStore(payload);
}

// ---------------------------------------------------------------------
// Spending
// ---------------------------------------------------------------------

/**
 * Claims a prize. Anybody may, for themselves, with their own points.
 *
 * Locked, and the balance is re-read inside the lock -- otherwise two taps in
 * quick succession both see the old balance and go through, and somebody
 * spends points they did not have.
 */
function redeemPrize(payload) {
  payload = payload || {};

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var me = requireMember(payload.memberToken);

    var p = findOne(CONFIG.SHEET_PRIZES, { prizeId: payload.prizeId });
    if (!p || String(p.householdId) !== String(me.householdId) ||
        String(p.active) === 'false') {
      throw new Error('That prize is not available.');
    }

    var cost = Number(p.cost || 0);
    var have = Number(me.points || 0);
    if (have < cost) {
      throw new Error('That costs ' + cost + ' points and you have ' + have + '.');
    }

    var stock = String(p.stock) === '' ? null : Number(p.stock);
    if (stock !== null && stock <= 0) throw new Error('That one has run out.');

    update(CONFIG.SHEET_MEMBERS, me, { points: have - cost });
    if (stock !== null) update(CONFIG.SHEET_PRIZES, p, { stock: stock - 1 });

    insert(CONFIG.SHEET_REDEEMED, {
      redemptionId: newId('r'),
      householdId: me.householdId,
      prizeId: p.prizeId,
      memberId: me.memberId,
      name: p.name,
      cost: cost,
      at: stamp(),
      status: CONFIG.STORE_NEEDS_FULFILLING ? 'claimed' : 'handed over',
      handledBy: '',
      handledAt: ''
    });

    logAction(me.householdId, '', me.memberId, 'prize_claimed',
              p.name + ' (-' + cost + ')');
  } finally {
    lock.releaseLock();
  }
  return loadStore(payload);
}

/** Marks a claim as handed over. Parents. */
function fulfilRedemption(payload) {
  payload = payload || {};
  var me = requireApprover(payload.memberToken);

  var r = findOne(CONFIG.SHEET_REDEEMED, { redemptionId: payload.redemptionId });
  if (!r || String(r.householdId) !== String(me.householdId)) {
    throw new Error('That claim no longer exists.');
  }
  if (r.status !== 'claimed') throw new Error('That one is already dealt with.');

  update(CONFIG.SHEET_REDEEMED, r, {
    status: 'handed over',
    handledBy: me.memberId,
    handledAt: stamp()
  });
  logAction(me.householdId, '', me.memberId, 'prize_handed_over', r.name);

  return loadStore(payload);
}

/** Cancels a claim and gives the points back. Parents. */
function cancelRedemption(payload) {
  payload = payload || {};

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var me = requireApprover(payload.memberToken);

    var r = findOne(CONFIG.SHEET_REDEEMED, { redemptionId: payload.redemptionId });
    if (!r || String(r.householdId) !== String(me.householdId)) {
      throw new Error('That claim no longer exists.');
    }
    if (r.status === 'cancelled') throw new Error('That one is already cancelled.');

    var who = findOne(CONFIG.SHEET_MEMBERS, { memberId: r.memberId });
    if (who) {
      update(CONFIG.SHEET_MEMBERS, who,
             { points: Number(who.points || 0) + Number(r.cost || 0) });
    }
    // Put it back on the shelf if it was a limited one.
    var p = findOne(CONFIG.SHEET_PRIZES, { prizeId: r.prizeId });
    if (p && String(p.stock) !== '') {
      update(CONFIG.SHEET_PRIZES, p, { stock: Number(p.stock || 0) + 1 });
    }

    update(CONFIG.SHEET_REDEEMED, r, {
      status: 'cancelled',
      handledBy: me.memberId,
      handledAt: stamp()
    });
    logAction(me.householdId, '', me.memberId, 'prize_cancelled',
              r.name + ' (+' + r.cost + ' back)');
  } finally {
    lock.releaseLock();
  }
  return loadStore(payload);
}

// ---------------------------------------------------------------------
// Moving points by hand
// ---------------------------------------------------------------------

/**
 * Adds to, takes from, or sets somebody's points. Account holder only.
 *
 * `delta` adjusts, `set` replaces. Both are logged with the reason given,
 * because "why do I have 40 fewer points than yesterday" is a question that
 * gets asked and deserves an answer.
 */
function adjustPoints(payload) {
  payload = payload || {};

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var me = requireOwner(payload.memberToken);

    var target = findOne(CONFIG.SHEET_MEMBERS, { memberId: payload.targetId });
    if (!target || String(target.householdId) !== String(me.householdId)) {
      throw new Error('That account is not in this household.');
    }

    var before = Number(target.points || 0);
    var after;

    if (payload.set !== undefined && payload.set !== null && payload.set !== '') {
      after = Math.round(Number(payload.set));
      if (isNaN(after)) throw new Error('Enter a number.');
    } else {
      var delta = Math.round(Number(payload.delta) || 0);
      if (!delta) throw new Error('Enter how many points to add or take away.');
      after = before + delta;
    }

    // Points are a score, not a debt. Nobody goes negative.
    after = Math.max(0, Math.min(999999, after));

    update(CONFIG.SHEET_MEMBERS, target, { points: after });

    var reason = String(payload.reason || '').trim().slice(0, 200);
    logAction(me.householdId, '', me.memberId, 'points_adjusted',
              target.name + ': ' + before + ' -> ' + after +
              (reason ? ' (' + reason + ')' : ''));
  } finally {
    lock.releaseLock();
  }
  return { members: activeMembers(me.householdId) };
}
