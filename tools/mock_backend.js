/* ===================================================================
   A stand-in for google.script.run, for LOCAL PREVIEW ONLY.

   The real backend is the .gs files; this is a small in-memory copy of the
   same rules so the interface can be clicked through in a normal browser
   without deploying. It is never pushed to Apps Script -- it lives in tools/
   and clasp only uploads apps-script/.

   Where it deliberately differs: no hashing (PINs and passwords are compared
   as plain text), no locking, no lockouts. Everything about the SHAPE of the
   replies matches Code.gs's envelope, because that is what the client cares
   about.
   =================================================================== */
(function () {
  'use strict';

  var DB = {
    households: [],
    members: [],
    sessions: [],
    chores: [],
    trough: [],
    sty: [],
    prizes: [],
    redemptions: []
  };

  var seq = 0;
  function id(p) { return p + '-' + (++seq); }

  var refSeq = 0;
  function nextRef() { return ++refSeq; }
  function now() { return new Date().toISOString(); }

  var PALETTE = ['#2f5d8a', '#9c6259', '#c2ab72', '#5f9384',
                 '#7a6a99', '#c08760', '#5d8aa6', '#8a9463'];

  // A short stand-in for CONFIG.SUGGESTIONS -- enough to exercise the
  // autofill, not a copy of the whole list.
  var SUGGESTIONS = [
    { title: 'Load the dishwasher', category: 'Kitchen', points: 3,
      recurrence: 'daily', notes: 'Rinse the plates first.' },
    { title: 'Take the bins out', category: 'Trash', points: 2,
      recurrence: 'weekly', notes: 'Check which bin it is this week.' },
    { title: 'Clean the bathroom', category: 'Bathroom', points: 10,
      recurrence: 'weekly', notes: 'Sink, toilet, bath, mirror.' },
    { title: 'Mow the lawn', category: 'Yard', points: 20,
      recurrence: 'weekly', notes: '' },
    // Deliberately not a preset value, so the Custom chip gets exercised.
    { title: 'Wash the car', category: 'Vehicle', points: 15,
      recurrence: 'monthly', notes: '' }
  ];

  var PRIZE_IDEAS = [
    { name: '30 minutes of extra screen time', cost: 10, notes: 'Screen time' },
    { name: 'An ice cream',                    cost: 15, notes: 'Food' },
    { name: 'Stay up 30 minutes later',        cost: 20, notes: 'Bedtime' },
    { name: 'Skip one chore',                  cost: 40, notes: 'Time off' },
    { name: 'The movies',                      cost: 90, notes: 'Days out' },
    { name: 'A day at the zoo',                cost: 200, notes: 'Days out' }
  ];

  var STARTER = PRIZE_IDEAS.slice(0, 4);

  // ---------------------------------------------------------------
  // Seed data, so the board can be looked at without ten minutes of typing
  // ---------------------------------------------------------------
  function seed() {
    var h = { householdId: id('h'), name: 'The Sewells',
              ownerEmail: 'demo@example.com', password: 'password123',
              lastFilledOn: '' };
    DB.households.push(h);

    var people = [
      ['Michael', 'owner', ''],
      ['Sarah', 'approver', '1234'],
      ['Ellie', 'member', '1111'],
      ['Jack', 'member', '']
    ];
    people.forEach(function (p, i) {
      DB.members.push({
        memberId: id('m'), householdId: h.householdId,
        name: p[0], realName: p[0], role: p[1], pin: p[2],
        color: PALETTE[i % PALETTE.length],
        points: [0, 0, 34, 12][i], active: true
      });
    });

    var m = DB.members;
    var today = new Date();
    var day = function (n) {
      var d = new Date(today); d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };

    [
      ['Load the dishwasher', 'Rinse the plates first.', 'Kitchen', 3, 'pool', '', day(0), 'daily'],
      ['Take the bins out', 'Blue bin this week.', 'Trash', 2, 'pool', '', day(-2), 'weekly'],
      ['Hoover the front room', '', 'Bedroom', 5, 'pool', '', '', ''],
      ['Walk the dog', 'Long way round.', 'Pets', 3, 'claimed', 2, day(0), 'daily'],
      ['Fold the laundry', '', 'Laundry', 4, 'claimed', 3, day(1), ''],
      ['Clean your room', 'Under the bed as well.', 'Bedroom', 10, 'in_progress', 2, day(1), ''],
      ['Wash the car', '', 'Vehicle', 20, 'submitted', 3, '', ''],
      ['Sweep the porch', '', 'Yard', 5, 'submitted', 2, day(-1), ''],
      ['Empty the dishwasher', '', 'Kitchen', 3, 'done', 2, '', 'daily'],
      ['Tidy the garage', 'Boxes to the left.', 'Yard', 15, 'done', 3, '', '']
    ].forEach(function (r) {
      var assignee = r[5] === '' ? '' : m[r[5]].memberId;
      DB.chores.push({
        ref: nextRef(),
        choreId: id('c'), householdId: h.householdId,
        title: r[0], notes: r[1], category: r[2], points: r[3],
        status: r[4], createdBy: m[0].memberId, createdAt: now(),
        assigneeId: assignee,
        claimedAt: assignee ? now() : '',
        startedAt: r[4] === 'in_progress' || r[4] === 'submitted' ? now() : '',
        submittedAt: r[4] === 'submitted' ? now() : '',
        approvedBy: r[4] === 'done' ? m[0].memberId : '',
        approvedAt: r[4] === 'done' ? now() : '',
        dueDate: r[6], recurrence: r[7], reviewNote: ''
      });
    });

    // One chore that was sent back, to exercise that card state.
    DB.chores.push({
      ref: nextRef(),
      choreId: id('c'), householdId: h.householdId,
      title: 'Wipe the worktops', notes: '', category: 'Kitchen', points: 4,
      status: 'in_progress', createdBy: m[0].memberId, createdAt: now(),
      assigneeId: m[2].memberId, claimedAt: now(), startedAt: now(),
      submittedAt: '', approvedBy: '', approvedAt: '',
      dueDate: '', recurrence: '',
      reviewNote: 'The corners by the kettle were missed.'
    });
  }
  // The daily list and a stocked prize pen, so both screens have something
  // in them the moment the preview opens.
  DB.trough = [
    { troughId: 'tr1', title: 'Load the dishwasher', category: 'Kitchen', points: 3, notes: '' },
    { troughId: 'tr2', title: 'Take the bins out',   category: 'Trash',   points: 2, notes: '' },
    { troughId: 'tr3', title: 'Feed the pets',       category: 'Pets',    points: 2, notes: '' },
    { troughId: 'tr4', title: 'Tidy the front room', category: 'Living Areas', points: 4, notes: '' },
    { troughId: 'tr5', title: 'Hoover the stairs',   category: 'Living Areas', points: 6, notes: '' },
    { troughId: 'tr6', title: 'Make your bed',       category: 'Bedroom', points: 1, notes: '' }
  ];

  DB.sty = [
    { styId: 'sy1', title: 'Make your bed',        category: 'Bedroom', points: 1, notes: '' },
    { styId: 'sy2', title: 'Put your laundry away', category: 'Laundry', points: 2, notes: '' },
    { styId: 'sy3', title: 'Clean your room',      category: 'Bedroom', points: 5, notes: '' }
  ];

  DB.prizes = [
    { prizeId: 'pz1', name: 'Ice cream',        notes: 'Any flavour.',      cost: 15,  stock: '' },
    { prizeId: 'pz2', name: 'Stay up an hour',  notes: 'Weekends only.',    cost: 30,  stock: '' },
    { prizeId: 'pz3', name: 'Pick the film',    notes: '',                  cost: 20,  stock: '' },
    { prizeId: 'pz4', name: 'Trip to the shop', notes: 'Five pounds.',      cost: 60,  stock: 2 },
    { prizeId: 'pz5', name: 'Skip one chore',   notes: 'Once a week.',      cost: 40,  stock: 0 }
  ];

  DB.redemptions = [];

  seed();

  // ---------------------------------------------------------------
  // Helpers mirroring the server
  // ---------------------------------------------------------------
  function find(list, key, val) {
    return list.filter(function (x) { return String(x[key]) === String(val); })[0] || null;
  }

  function publicMember(m) {
    return {
      memberId: m.memberId, name: m.name, realName: m.realName || m.name,
      role: m.role, color: m.color,
      points: Number(m.points || 0), hasPin: !!m.pin,
      canApprove: m.role === 'owner' || m.role === 'approver',
      active: m.active !== false
    };
  }

  function activeMembers(hid) {
    return DB.members.filter(function (m) {
      return m.householdId === hid && m.active !== false;
    }).map(publicMember);
  }

  function openSession(kind, hid, mid) {
    var t = id('t');
    DB.sessions.push({ token: t, kind: kind, householdId: hid, memberId: mid || '' });
    return t;
  }

  function session(token, kind) {
    var s = find(DB.sessions, 'token', token);
    if (!s || (kind && s.kind !== kind)) return null;
    return s;
  }

  function requireMember(token) {
    var s = session(token, 'member');
    if (!s) throw new Error('SIGNED_OUT');
    var m = find(DB.members, 'memberId', s.memberId);
    if (!m) throw new Error('SIGNED_OUT');
    return m;
  }

  function requireApprover(token) {
    var m = requireMember(token);
    if (m.role !== 'owner' && m.role !== 'approver') {
      throw new Error('Only a parent account can do that.');
    }
    return m;
  }

  function m_role_approver(m) { return m.role === 'approver' || m.role === 'owner'; }

  function requireOwner(token) {
    var m = requireMember(token);
    if (m.role !== 'owner') {
      throw new Error('Only the account holder can manage accounts.');
    }
    return m;
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  var CHILD_WEIGHT = 2;

  /** The same target-share algorithm as Trough.gs. */
  function planTrough(items, people, recent) {
    var queue = shuffle(items.slice()).sort(function (a, b) {
      return Number(b.points || 0) - Number(a.points || 0);
    });

    var total = 0;
    queue.forEach(function (i) { total += Number(i.points || 0); });

    var weightOf = {}, sumW = 0;
    people.forEach(function (m) {
      var w = (m.role === 'owner' || m.role === 'approver') ? 1 : CHILD_WEIGHT;
      weightOf[m.memberId] = w; sumW += w;
    });

    var target = {}, given = {};
    people.forEach(function (m) {
      target[m.memberId] = sumW ? total * weightOf[m.memberId] / sumW : 0;
      given[m.memberId] = 0;
    });

    var plan = [];
    queue.forEach(function (item) {
      var blocked = recent[item.troughId] || {};
      var elig = people.filter(function (m) { return !blocked[m.memberId]; });
      if (!elig.length) elig = people.slice();
      elig = shuffle(elig);

      var best = elig[0], bestNeed = target[best.memberId] - given[best.memberId];
      for (var i = 1; i < elig.length; i++) {
        var need = target[elig[i].memberId] - given[elig[i].memberId];
        if (need > bestNeed) { best = elig[i]; bestNeed = need; }
      }
      given[best.memberId] += Number(item.points || 0);
      plan.push({ item: item, member: best });
    });
    return plan;
  }

  function ownChore(hid, cid) {
    var c = find(DB.chores, 'choreId', cid);
    if (!c || c.householdId !== hid) throw new Error('That chore no longer exists.');
    return c;
  }

  function overdue(c) {
    if (!c.dueDate || c.status === 'done') return false;
    return new Date(c.dueDate + 'T23:59:59').getTime() < Date.now();
  }

  function view(c) {
    var a = c.assigneeId ? find(DB.members, 'memberId', c.assigneeId) : null;
    var cr = c.createdBy ? find(DB.members, 'memberId', c.createdBy) : null;
    var ap = c.approvedBy ? find(DB.members, 'memberId', c.approvedBy) : null;
    return {
      choreId: c.choreId,
      ref: Number(c.ref || 0),
      seriesId: c.seriesId || '',
      source: c.troughId ? 'trough' : (c.styId ? 'sty' : 'pool'),
      title: c.title, notes: c.notes || '',
      category: c.category || '', points: Number(c.points || 0),
      status: c.status, dueDate: c.dueDate || '', recurrence: c.recurrence || '',
      reviewNote: c.reviewNote || '', createdAt: c.createdAt,
      createdBy: c.createdBy || '', createdByName: cr ? cr.name : '',
      assigneeId: c.assigneeId || '', assigneeName: a ? a.name : '',
      assigneeColor: a ? a.color : '',
      claimedAt: c.claimedAt || '', startedAt: c.startedAt || '',
      submittedAt: c.submittedAt || '', approvedAt: c.approvedAt || '',
      approvedByName: ap ? ap.name : '', overdue: overdue(c)
    };
  }

  function board(token) {
    var me = requireMember(token);
    var mine = DB.chores.filter(function (c) {
      return c.householdId === me.householdId;
    }).map(view);

    return {
      me: publicMember(me),
      members: activeMembers(me.householdId),
      chores: mine,
      categories: ['Kitchen', 'Bathroom', 'Bedroom', 'Laundry', 'Yard',
                   'Pets', 'Trash', 'Vehicle', 'Other'],
      pointPresets: [1, 2, 3, 5, 10, 20],
      suggestions: SUGGESTIONS
    };
  }

  // ---------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------
  var ACTIONS = {
    resumeSession: function (p) {
      var s = session(p.householdToken, 'household');
      if (!s) return { signedIn: false };
      var h = find(DB.households, 'householdId', s.householdId);
      var out = {
        signedIn: true,
        household: { householdId: h.householdId, name: h.name },
        members: activeMembers(h.householdId),
        me: null
      };
      try { out.me = publicMember(requireMember(p.memberToken)); } catch (e) {}
      return out;
    },

    createHousehold: function (p) {
      if (!String(p.householdName || '').trim()) throw new Error('Give your household a name.');
      if (!String(p.ownerName || '').trim()) throw new Error('Enter your own name.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(p.email || '')))
        throw new Error('That email address does not look right.');
      if (String(p.password || '').length < 8)
        throw new Error('Use a password of at least 8 characters.');
      if (find(DB.households, 'ownerEmail', String(p.email).toLowerCase()))
        throw new Error('There is already an account for that email. Sign in instead.');

      var h = { householdId: id('h'), name: p.householdName,
                ownerEmail: String(p.email).toLowerCase(), password: p.password };
      DB.households.push(h);
      var owner = { memberId: id('m'), householdId: h.householdId,
                    name: p.ownerName, role: 'owner', pin: '',
                    color: PALETTE[0], points: 0, active: true };
      DB.members.push(owner);

      return {
        householdToken: openSession('household', h.householdId, ''),
        household: { householdId: h.householdId, name: h.name },
        members: [publicMember(owner)]
      };
    },

    signInHousehold: function (p) {
      var h = find(DB.households, 'ownerEmail', String(p.email || '').toLowerCase());
      if (!h || h.password !== p.password) throw new Error('Wrong email or password.');
      return {
        householdToken: openSession('household', h.householdId, ''),
        household: { householdId: h.householdId, name: h.name },
        members: activeMembers(h.householdId)
      };
    },

    signOutDevice: function (p) {
      DB.sessions = DB.sessions.filter(function (s) {
        return s.token !== p.householdToken && s.token !== p.memberToken;
      });
      return { ok: true };
    },

    pickMember: function (p) {
      var s = session(p.householdToken, 'household');
      if (!s) throw new Error('SIGNED_OUT');
      var m = find(DB.members, 'memberId', p.memberId);
      if (!m || m.householdId !== s.householdId)
        throw new Error('That name is not in this household.');
      if (m.pin) {
        if (!p.pin) throw new Error('PIN_REQUIRED');
        if (String(p.pin) !== String(m.pin)) throw new Error('That PIN is not right.');
      }
      return {
        memberToken: openSession('member', m.householdId, m.memberId),
        me: publicMember(m)
      };
    },

    releaseMember: function (p) {
      DB.sessions = DB.sessions.filter(function (s) { return s.token !== p.memberToken; });
      return { ok: true };
    },

    addMember: function (p) {
      var actor = requireOwner(p.memberToken);
      if (!String(p.name || '').trim()) throw new Error('Enter a name.');
      var clash = DB.members.filter(function (m) {
        return m.householdId === actor.householdId && m.active !== false &&
               m.name.toLowerCase() === String(p.name).trim().toLowerCase();
      });
      if (clash.length) throw new Error('There is already a ' + p.name + ' in this household.');
      if (p.pin && !/^\d{4}$/.test(String(p.pin)))
        throw new Error('A PIN is exactly 4 digits.');

      var n = DB.members.filter(function (m) { return m.householdId === actor.householdId; }).length;
      var m2 = { memberId: id('m'), householdId: actor.householdId,
                 name: String(p.name).trim(),
                 role: p.role === 'approver' ? 'approver' : 'member',
                 pin: p.pin || '', color: PALETTE[n % PALETTE.length],
                 points: 0, active: true };
      DB.members.push(m2);
      return { members: activeMembers(actor.householdId), added: publicMember(m2) };
    },

    updateMember: function (p) {
      var actor = requireOwner(p.memberToken);
      var m = find(DB.members, 'memberId', p.targetId);
      if (!m || m.householdId !== actor.householdId)
        throw new Error('That account is not in this household.');

      if (p.name !== undefined) {
        if (!String(p.name).trim()) throw new Error('A name cannot be blank.');
        m.name = String(p.name).trim();
      }
      if (p.realName !== undefined) {
        m.realName = String(p.realName).trim() || m.name;
      }
      if (p.role !== undefined) {
        if (m.role === 'owner') throw new Error('The account holder always keeps parent access.');
        m.role = p.role === 'approver' ? 'approver' : 'member';
      }
      if (p.pin !== undefined) {
        if (p.pin && !/^\d{4}$/.test(String(p.pin)))
          throw new Error('A PIN is exactly 4 digits.');
        m.pin = p.pin || '';
      }
      if (p.active !== undefined) {
        if (m.role === 'owner' && p.active === false)
          throw new Error('The account holder cannot be turned off.');
        m.active = !!p.active;
      }
      return { members: activeMembers(actor.householdId) };
    },

    changeHouseholdPassword: function (p) {
      var actor = requireMember(p.memberToken);
      if (actor.role !== 'owner') throw new Error('Only the account holder can change the password.');
      var h = find(DB.households, 'householdId', actor.householdId);
      if (h.password !== p.currentPassword) throw new Error('That is not the current password.');
      if (String(p.newPassword || '').length < 8)
        throw new Error('Use a password of at least 8 characters.');
      h.password = p.newPassword;
      return { ok: true };
    },

    loadBoard: function (p) { return board(p.memberToken); },

    createChore: function (p) {
      var me = requireApprover(p.memberToken);
      if (!String(p.title || '').trim()) throw new Error('Give the chore a name.');
      var boss = me.role === 'owner' || me.role === 'approver';
      var assignee = (p.assigneeId && boss) ? p.assigneeId : '';
      var cid = id('c');
      DB.chores.push({
        ref: nextRef(), seriesId: p.recurrence ? cid : '',
        choreId: cid, householdId: me.householdId,
        title: String(p.title).trim(), notes: p.notes || '',
        category: p.category || '',
        points: boss ? Math.max(0, Number(p.points) || 0) : 0,
        status: assignee ? 'claimed' : 'pool',
        createdBy: me.memberId, createdAt: now(),
        assigneeId: assignee, claimedAt: assignee ? now() : '',
        startedAt: '', submittedAt: '', approvedBy: '', approvedAt: '',
        dueDate: p.dueDate || '', recurrence: p.recurrence || '', reviewNote: ''
      });
      return board(p.memberToken);
    },

    updateChore: function (p) {
      var me = requireApprover(p.memberToken);
      var c = ownChore(me.householdId, p.choreId);
      var boss = me.role === 'owner' || me.role === 'approver';
      if (!boss && (c.createdBy !== me.memberId || c.status !== 'pool'))
        throw new Error('Only a parent account can change that chore.');

      if (p.title !== undefined) {
        if (!String(p.title).trim()) throw new Error('Give the chore a name.');
        c.title = String(p.title).trim();
      }
      if (p.notes !== undefined) c.notes = p.notes;
      if (p.category !== undefined) c.category = p.category;
      if (p.dueDate !== undefined) c.dueDate = p.dueDate;
      if (p.recurrence !== undefined) c.recurrence = p.recurrence;
      if (p.points !== undefined && boss) c.points = Math.max(0, Number(p.points) || 0);
      return board(p.memberToken);
    },

    deleteChore: function (p) {
      var me = requireApprover(p.memberToken);
      var c = ownChore(me.householdId, p.choreId);
      var boss = me.role === 'owner' || me.role === 'approver';
      if (!boss && (c.createdBy !== me.memberId || c.status !== 'pool'))
        throw new Error('Only a parent account can delete that chore.');
      DB.chores = DB.chores.filter(function (x) { return x.choreId !== c.choreId; });
      return board(p.memberToken);
    },

    claimChore: function (p) {
      var me = requireMember(p.memberToken);
      var c = ownChore(me.householdId, p.choreId);
      if (c.status !== 'pool') {
        var who = c.assigneeId ? find(DB.members, 'memberId', c.assigneeId) : null;
        throw new Error(who ? (who.name + ' got that one first.')
                            : 'Somebody else got that one first.');
      }
      c.status = 'claimed'; c.assigneeId = me.memberId;
      c.claimedAt = now(); c.reviewNote = '';
      return board(p.memberToken);
    },

    releaseChore: function (p) {
      var me = requireMember(p.memberToken);
      var c = ownChore(me.householdId, p.choreId);
      var boss = me.role === 'owner' || me.role === 'approver';
      if (c.assigneeId !== me.memberId && !boss) throw new Error('That is not your chore.');
      if (c.troughId || c.styId) {
        throw new Error(c.troughId
          ? 'Trough chores stay with the person they went to. A parent can hand it to somebody else.'
          : "Sty chores are each person's own. A parent can hand it to somebody else.");
      }
      c.status = 'pool'; c.assigneeId = ''; c.claimedAt = '';
      c.startedAt = ''; c.submittedAt = '';
      return board(p.memberToken);
    },

    startChore: function (p) {
      var me = requireMember(p.memberToken);
      var c = ownChore(me.householdId, p.choreId);
      if (c.status !== 'claimed') throw new Error('That chore has moved on. Pull to refresh.');
      c.status = 'in_progress'; c.startedAt = now();
      return board(p.memberToken);
    },

    pauseChore: function (p) {
      var me = requireMember(p.memberToken);
      var c = ownChore(me.householdId, p.choreId);
      if (c.status !== 'in_progress') throw new Error('That chore has moved on. Pull to refresh.');
      c.status = 'claimed'; c.startedAt = '';
      return board(p.memberToken);
    },

    submitChore: function (p) {
      var me = requireMember(p.memberToken);
      var c = ownChore(me.householdId, p.choreId);
      if (['claimed', 'in_progress'].indexOf(c.status) < 0)
        throw new Error('That chore has moved on. Pull to refresh.');
      c.status = 'submitted'; c.submittedAt = now();
      c.startedAt = c.startedAt || now(); c.reviewNote = '';
      return board(p.memberToken);
    },

    approveChore: function (p) {
      var me = requireApprover(p.memberToken);
      var c = ownChore(me.householdId, p.choreId);
      if (c.status !== 'submitted') throw new Error('That chore is already done.');
      c.status = 'done'; c.approvedBy = me.memberId; c.approvedAt = now();
      c.reviewNote = '';
      if (c.points > 0 && c.assigneeId) {
        var w = find(DB.members, 'memberId', c.assigneeId);
        if (w) w.points = Number(w.points || 0) + Number(c.points);
      }
      // Repeating chores are posted by the nightly job, not on approval.
      return board(p.memberToken);
    },

    sendBackChore: function (p) {
      var me = requireApprover(p.memberToken);
      var c = ownChore(me.householdId, p.choreId);
      if (c.status !== 'submitted') throw new Error('That chore has moved on. Pull to refresh.');
      c.status = 'in_progress'; c.submittedAt = '';
      c.reviewNote = String(p.note || '').trim() || 'Needs another look.';
      return board(p.memberToken);
    },

    assignChore: function (p) {
      var me = requireApprover(p.memberToken);
      var c = ownChore(me.householdId, p.choreId);
      if (c.status === 'done') throw new Error('That chore is already done.');
      var t = find(DB.members, 'memberId', p.assigneeId);
      if (!t || t.householdId !== me.householdId)
        throw new Error('That person is not in this household.');
      c.assigneeId = t.memberId;
      if (c.status === 'pool') c.status = 'claimed';
      c.claimedAt = c.claimedAt || now();
      return board(p.memberToken);
    },

    loadTrough: function (p) {
      var me = requireMember(p.memberToken);
      var filled = DB.chores.filter(function (c) {
        return c.troughId && c.dueDate === today();
      });
      var last = null;
      if (filled.length) {
        var per = {};
        filled.forEach(function (c) {
          var w = find(DB.members, 'memberId', c.assigneeId);
          var n = w ? w.name : 'Someone';
          if (!per[n]) per[n] = { name: n, count: 0, points: 0, color: w ? w.color : '#888' };
          per[n].count++; per[n].points += Number(c.points || 0);
        });
        last = { date: today(), total: filled.length,
                 perPerson: Object.keys(per).map(function (k) { return per[k]; })
                   .sort(function (a, b) { return b.points - a.points; }) };
      }
      return {
        name: 'The Trough',
        items: DB.trough.slice(),
        lastFilled: last,
        canEdit: me.role === 'owner',
        canFill: me.role === 'owner' || m_role_approver(me)
      };
    },

    addTroughItem: function (p) {
      requireOwner(p.memberToken);
      if (!String(p.title || '').trim()) throw new Error('Give the chore a name.');
      DB.trough.push({ troughId: id('tr'), title: String(p.title).trim(),
        category: p.category || '', points: Math.max(0, Number(p.points) || 0),
        notes: '' });
      return ACTIONS.loadTrough(p);
    },

    updateTroughItem: function (p) {
      requireOwner(p.memberToken);
      var t = find(DB.trough, 'troughId', p.troughId);
      if (!t) throw new Error('That is not on your list.');
      if (p.title !== undefined) t.title = String(p.title).trim() || t.title;
      if (p.points !== undefined) t.points = Math.max(0, Number(p.points) || 0);
      if (p.category !== undefined) t.category = p.category;
      if (p.notes !== undefined) t.notes = p.notes;
      return ACTIONS.loadTrough(p);
    },

    removeTroughItem: function (p) {
      requireOwner(p.memberToken);
      DB.trough = DB.trough.filter(function (t) { return t.troughId !== p.troughId; });
      return ACTIONS.loadTrough(p);
    },

    loadSty: function (p) {
      var me = requireMember(p.memberToken);
      return {
        name: 'The Sty',
        items: DB.sty.slice(),
        parentsToo: true,
        handedOutToday: DB.chores.filter(function (c) {
          return c.styId && c.dueDate === today();
        }).length,
        canEdit: me.role === 'owner'
      };
    },

    addStyItem: function (p) {
      requireOwner(p.memberToken);
      if (!String(p.title || '').trim()) throw new Error('Give the chore a name.');
      DB.sty.push({ styId: id('sy'), title: String(p.title).trim(),
        category: p.category || '', points: Math.max(0, Number(p.points) || 0),
        notes: '' });
      return ACTIONS.loadSty(p);
    },

    updateStyItem: function (p) {
      requireOwner(p.memberToken);
      var t = find(DB.sty, 'styId', p.styId);
      if (!t) throw new Error('That is not on your list.');
      if (p.title !== undefined) t.title = String(p.title).trim() || t.title;
      if (p.points !== undefined) t.points = Math.max(0, Number(p.points) || 0);
      if (p.category !== undefined) t.category = p.category;
      if (p.notes !== undefined) t.notes = p.notes;
      return ACTIONS.loadSty(p);
    },

    removeStyItem: function (p) {
      requireOwner(p.memberToken);
      DB.sty = DB.sty.filter(function (t) { return t.styId !== p.styId; });
      return ACTIONS.loadSty(p);
    },

    stockStore: function (p) {
      requireOwner(p.memberToken);
      if (DB.prizes.length) throw new Error('There are already prizes in the pen.');
      STARTER.forEach(function (x) {
        DB.prizes.push({ prizeId: id('pz'), name: x.name, notes: x.notes,
                         cost: x.cost, stock: '' });
      });
      return ACTIONS.loadStore(p);
    },

    loadStore: function (p) {
      var me = requireMember(p.memberToken);
      var boss = me.role === 'owner' || m_role_approver(me);
      return {
        name: 'The Prize Pen',
        myPoints: Number(me.points || 0),
        canManage: me.role === 'owner',
        canFulfil: boss,
        ideas: PRIZE_IDEAS,
        canStock: me.role === 'owner' && DB.prizes.length === 0,
        prizes: DB.prizes.map(function (x) {
          var stock = x.stock === '' ? null : Number(x.stock);
          return { prizeId: x.prizeId, name: x.name, notes: x.notes,
            cost: Number(x.cost || 0), stock: stock,
            soldOut: stock !== null && stock <= 0,
            affordable: Number(me.points || 0) >= Number(x.cost || 0) };
        }).sort(function (a, b) { return a.cost - b.cost; }),
        claims: DB.redemptions.filter(function (r) {
          return boss || r.memberId === me.memberId;
        }).map(function (r) {
          var w = find(DB.members, 'memberId', r.memberId);
          return { redemptionId: r.redemptionId, name: r.name, cost: r.cost,
            at: r.at, status: r.status, memberId: r.memberId,
            memberName: w ? w.name : 'Someone', memberColor: w ? w.color : '#888' };
        }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); })
      };
    },

    addPrize: function (p) {
      requireOwner(p.memberToken);
      if (!String(p.name || '').trim()) throw new Error('Give the prize a name.');
      DB.prizes.push({ prizeId: id('pz'), name: String(p.name).trim(),
        notes: p.notes || '', cost: Math.max(0, Number(p.cost) || 0),
        stock: p.stock === '' || p.stock === undefined || p.stock === null
          ? '' : Math.max(0, Number(p.stock) || 0) });
      return ACTIONS.loadStore(p);
    },

    updatePrize: function (p) {
      requireOwner(p.memberToken);
      var x = find(DB.prizes, 'prizeId', p.prizeId);
      if (!x) throw new Error('That prize is not in your store.');
      if (p.name !== undefined) x.name = String(p.name).trim() || x.name;
      if (p.cost !== undefined) x.cost = Math.max(0, Number(p.cost) || 0);
      if (p.notes !== undefined) x.notes = p.notes;
      if (p.stock !== undefined) {
        x.stock = p.stock === '' || p.stock === null ? '' : Math.max(0, Number(p.stock) || 0);
      }
      return ACTIONS.loadStore(p);
    },

    removePrize: function (p) {
      requireOwner(p.memberToken);
      DB.prizes = DB.prizes.filter(function (x) { return x.prizeId !== p.prizeId; });
      return ACTIONS.loadStore(p);
    },

    redeemPrize: function (p) {
      var me = requireMember(p.memberToken);
      var x = find(DB.prizes, 'prizeId', p.prizeId);
      if (!x) throw new Error('That prize is not available.');
      var cost = Number(x.cost || 0), have = Number(me.points || 0);
      if (have < cost) {
        throw new Error('That costs ' + cost + ' points and you have ' + have + '.');
      }
      var stock = x.stock === '' ? null : Number(x.stock);
      if (stock !== null && stock <= 0) throw new Error('That one has run out.');

      me.points = have - cost;
      if (stock !== null) x.stock = stock - 1;
      DB.redemptions.push({ redemptionId: id('r'), householdId: me.householdId,
        prizeId: x.prizeId, memberId: me.memberId, name: x.name, cost: cost,
        at: now(), status: 'claimed' });
      return ACTIONS.loadStore(p);
    },

    fulfilRedemption: function (p) {
      requireApprover(p.memberToken);
      var r = find(DB.redemptions, 'redemptionId', p.redemptionId);
      if (!r) throw new Error('That claim no longer exists.');
      if (r.status !== 'claimed') throw new Error('That one is already dealt with.');
      r.status = 'handed over';
      return ACTIONS.loadStore(p);
    },

    cancelRedemption: function (p) {
      requireApprover(p.memberToken);
      var r = find(DB.redemptions, 'redemptionId', p.redemptionId);
      if (!r) throw new Error('That claim no longer exists.');
      if (r.status === 'cancelled') throw new Error('That one is already cancelled.');
      var w = find(DB.members, 'memberId', r.memberId);
      if (w) w.points = Number(w.points || 0) + Number(r.cost || 0);
      var x = find(DB.prizes, 'prizeId', r.prizeId);
      if (x && x.stock !== '') x.stock = Number(x.stock || 0) + 1;
      r.status = 'cancelled';
      return ACTIONS.loadStore(p);
    },

    adjustPoints: function (p) {
      var me = requireOwner(p.memberToken);
      var t = find(DB.members, 'memberId', p.targetId);
      if (!t) throw new Error('That account is not in this household.');
      var before = Number(t.points || 0), after;
      if (p.set !== undefined && p.set !== null && p.set !== '') {
        after = Math.round(Number(p.set));
        if (isNaN(after)) throw new Error('Enter a number.');
      } else {
        var d = Math.round(Number(p.delta) || 0);
        if (!d) throw new Error('Enter how many points to add or take away.');
        after = before + d;
      }
      t.points = Math.max(0, Math.min(999999, after));
      return { members: activeMembers(me.householdId) };
    },

    reopenChore: function (p) {
      var me = requireApprover(p.memberToken);
      var c = ownChore(me.householdId, p.choreId);
      if (c.status !== 'done') throw new Error('That chore is not done.');
      c.status = 'pool'; c.assigneeId = ''; c.claimedAt = '';
      c.startedAt = ''; c.submittedAt = ''; c.approvedBy = '';
      c.approvedAt = ''; c.reviewNote = '';
      return board(p.memberToken);
    }
  };

  // ---------------------------------------------------------------
  // The google.script.run stand-in
  // ---------------------------------------------------------------
  function Runner(success, failure) {
    this._ok = success || function () {};
    this._no = failure || function () {};
  }

  Runner.prototype.withSuccessHandler = function (fn) {
    return new Runner(fn, this._no);
  };
  Runner.prototype.withFailureHandler = function (fn) {
    return new Runner(this._ok, fn);
  };

  Runner.prototype.call = function (action, payload) {
    var self = this;
    // A short delay so loading states are actually visible in preview.
    setTimeout(function () {
      var res;
      try {
        var fn = Object.prototype.hasOwnProperty.call(ACTIONS, action)
          ? ACTIONS[action] : null;
        if (!fn) throw new Error('Unknown action: ' + action);
        res = { ok: true, data: fn(payload || {}) };
      } catch (err) {
        res = { ok: false, error: String(err && err.message ? err.message : err) };
      }
      console.log('[mock]', action, '->', res.ok ? 'ok' : res.error);
      self._ok(res);
    }, 120);
  };

  /**
   * What the nightly trigger does, so the preview can exercise it.
   * window.MOCK_NIGHTLY() in the console runs a "midnight".
   */
  window.MOCK_NIGHTLY = function () {
    var h = DB.households[0];
    if (h.lastFilledOn === today()) return { skipped: true };

    var people = DB.members.filter(function (m) {
      return m.householdId === h.householdId && m.active !== false;
    });

    // Anything still owed keeps its holder and blocks a fresh copy.
    var troughOpen = {}, styOwed = {}, seriesOpen = {}, seriesLast = {};
    DB.chores.forEach(function (c) {
      if (c.troughId && c.status !== 'done') troughOpen[c.troughId] = true;
      if (c.styId && c.assigneeId && c.status !== 'done') {
        styOwed[c.assigneeId + '|' + c.styId] = true;
      }
      if (c.seriesId && c.recurrence) {
        if (c.status !== 'done') seriesOpen[c.seriesId] = true;
        else {
          var prev = seriesLast[c.seriesId];
          if (!prev || seriesDate(c) > seriesDate(prev)) {
            seriesLast[c.seriesId] = c;
          }
        }
      }
    });

    var recent = {};
    DB.chores.forEach(function (c) {
      if (c.troughId && c.assigneeId && c.dueDate && c.dueDate < today()) {
        if (!recent[c.troughId]) recent[c.troughId] = {};
        recent[c.troughId][c.assigneeId] = true;
      }
    });

    var n = 0, carried = 0;

    var items = DB.trough.filter(function (i) {
      if (troughOpen[i.troughId]) { carried++; return false; }
      return true;
    });
    planTrough(items, people, recent).forEach(function (row) {
      DB.chores.push(mkChore(h, row.item, row.member, row.item.troughId, ''));
      n++;
    });

    people.forEach(function (m) {
      DB.sty.forEach(function (item) {
        if (styOwed[m.memberId + '|' + item.styId]) { carried++; return; }
        DB.chores.push(mkChore(h, item, m, '', item.styId));
        n++;
      });
    });

    var reposted = 0;
    Object.keys(seriesLast).forEach(function (sid) {
      if (seriesOpen[sid]) return;
      var last = seriesLast[sid];
      var days = last.recurrence === 'daily' ? 1
               : last.recurrence === 'weekly' ? 7
               : last.recurrence === 'monthly' ? 30 : 0;
      if (!days) return;
      var base = new Date(seriesDate(last) + 'T12:00:00');
      base.setDate(base.getDate() + days);
      var due = base.getFullYear() + '-' +
                String(base.getMonth() + 1).padStart(2, '0') + '-' +
                String(base.getDate()).padStart(2, '0');
      if (due > today()) return;

      DB.chores.push({
        ref: nextRef(), seriesId: sid,
        choreId: id('c'), householdId: h.householdId, title: last.title,
        notes: last.notes || '', category: last.category || '',
        points: last.points, status: 'pool', createdBy: last.createdBy || '',
        createdAt: now(), assigneeId: '', claimedAt: '', startedAt: '',
        submittedAt: '', approvedBy: '', approvedAt: '', dueDate: today(),
        recurrence: last.recurrence, reviewNote: '', troughId: '', styId: ''
      });
      n++; reposted++;
    });

    h.lastFilledOn = today();
    return { filled: n, carriedOver: carried, reposted: reposted };
  };

  /** Mirrors seriesDate() in Daily.gs. */
  function seriesDate(c) {
    var d = String(c.dueDate || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    return String(c.approvedAt || c.createdAt || '').slice(0, 10);
  }

  function mkChore(h, item, member, troughId, styId) {
    return {
      ref: nextRef(), seriesId: '',
      choreId: id('c'), householdId: h.householdId, title: item.title,
      notes: item.notes || '', category: item.category || '',
      points: item.points, status: 'claimed', createdBy: '', createdAt: now(),
      assigneeId: member.memberId, claimedAt: now(), startedAt: '',
      submittedAt: '', approvedBy: '', approvedAt: '', dueDate: today(),
      recurrence: '', reviewNote: '', troughId: troughId, styId: styId
    };
  }

  window.google = { script: { run: new Runner() } };

  // Announced so nobody mistakes the preview for the real thing.
  console.log('%c[mock backend] Preview only. Demo sign-in: ' +
              'demo@example.com / password123. PINs: Sarah 1234, Ellie 1111.',
              'color:#02407d;font-weight:bold');
  window.MOCK_DB = DB;
})();
