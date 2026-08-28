/**
 * Chore Boar -- the nightly hand-out.
 *
 * Both daily lists go out on their own, once a day, to every household in the
 * spreadsheet. Nobody presses anything.
 *
 * ABOUT THE TIMING. Apps Script time triggers are approximate: atHour(0) means
 * "somewhere in the midnight hour", not 00:00:00. In practice it lands within
 * minutes, occasionally later. There is no setting that tightens this and no
 * way to ask for an exact moment -- it is how the platform schedules. The job
 * is written to cope: it works out the date itself and does nothing if that
 * date has already been handed out, so an early, late, or repeated run cannot
 * double anybody up.
 *
 * This runs as the account that owns the script, outside any web request, so
 * there is no member token and no signed-in user. That is why the fill
 * functions here take a household id rather than a payload.
 */

/**
 * The trigger's target. Hands out both lists for every household.
 *
 * Never throws past one household: a spreadsheet problem in one family's rows
 * must not stop everybody else's chores going out. Failures are logged and
 * the loop carries on.
 */
function dailyFill() {
  var households = rows(CONFIG.SHEET_HOUSEHOLDS);
  var today = todayStr();
  var done = 0;
  var skipped = 0;

  console.log('Daily fill for ' + today + ' -- ' + households.length +
              ' household(s).');

  households.forEach(function (h) {
    try {
      var n = fillDayFor(h.householdId, today);
      if (n === null) { skipped++; return; }
      done++;
      console.log('  ' + h.name + ': ' + n + ' chores.');
    } catch (err) {
      // One household's problem is not everybody's.
      console.error('  ' + h.name + ' FAILED: ' + err);
      logAction(h.householdId, '', '', 'daily_fill_failed', String(err));
    }
  });

  console.log('Done. ' + done + ' filled, ' + skipped + ' already had today.');
  return { filled: done, skipped: skipped, date: today };
}

/**
 * Hands both lists out for one household, unless today is already done.
 *
 * Returns the number of chores written, or null if it was already done.
 * Locked, because the trigger and a manual run could otherwise overlap.
 */
function fillDayFor(householdId, today) {
  today = today || todayStr();

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var h = findOne(CONFIG.SHEET_HOUSEHOLDS, { householdId: householdId });
    if (!h) return null;

    // Read the marker INSIDE the lock. This is the whole safety net: a retry,
    // an overlapping manual run, a trigger that fires twice -- none of them
    // can hand out a second set for the same day.
    //
    // It is a stamp on the household rather than "are there chores dated
    // today", which is what this used to check and which is now wrong: a
    // night where every item carried over unfinished writes nothing at all,
    // and the old test would have read that as "not run yet" and let the next
    // call post the recurring chores a second time.
    if (String(h.lastFilledOn || '').slice(0, 10) === today) return null;

    var n = 0;
    n += fillTroughFor(householdId, '');
    n += fillStyFor(householdId, '');
    n += postRecurringFor(householdId);

    update(CONFIG.SHEET_HOUSEHOLDS, h, { lastFilledOn: today });
    logAction(householdId, '', '', 'daily_fill', today + ': ' + n + ' chores');
    return n;
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// Installing and checking the trigger
// ---------------------------------------------------------------------

/**
 * Installs the nightly trigger, replacing any it already made.
 *
 * setUp() calls this, so a normal install needs nothing else. Safe to run
 * again -- it clears its own old triggers first rather than stacking up a
 * second one that would fill the lists twice.
 */
function installDailyFill() {
  var existing = ScriptApp.getProjectTriggers();
  var removed = 0;

  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'dailyFill') {
      ScriptApp.deleteTrigger(existing[i]);
      removed++;
    }
  }

  var hour = Number(CONFIG.DAILY_FILL_HOUR) || 0;
  ScriptApp.newTrigger('dailyFill')
    .timeBased()
    .atHour(hour)
    .nearMinute(1)      // narrows the window; does not make it exact
    .everyDays(1)
    .create();

  var msg = 'Nightly hand-out installed for ~' +
            (hour < 10 ? '0' + hour : hour) + ':00 ' + CONFIG_TZ() +
            (removed ? ' (replaced ' + removed + ' old trigger(s))' : '');
  console.log(msg);
  console.log('Apps Script fires this within the hour, not on the dot.');
  return msg;
}

/** Says whether the nightly job is actually installed. */
function checkDailyFill() {
  var found = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'dailyFill';
  });

  if (!found.length) {
    console.log('NOT INSTALLED. Run installDailyFill() to set it up.');
    return false;
  }
  console.log(found.length + ' nightly trigger(s) installed.');
  if (found.length > 1) {
    console.log('More than one -- run installDailyFill() to clear the extras.');
  }
  return true;
}

/**
 * Hands today's chores out right now, for every household.
 *
 * The recovery path. If the trigger did not fire -- Apps Script had an outage,
 * the authorisation lapsed -- run this from the editor and everyone gets their
 * day. It skips any household that already has today's, so it is safe to run
 * whenever you are unsure.
 */
function fillTodayNow() {
  return dailyFill();
}

// ---------------------------------------------------------------------
// Repeating chores
// ---------------------------------------------------------------------

/**
 * Posts any repeating chore that has come round again.
 *
 * These used to respawn the instant they were approved, which meant a weekly
 * chore signed off at four in the afternoon reappeared at four in the
 * afternoon -- drifting a little further into the day every week, and landing
 * at a different time from everything else. They arrive with the Trough and
 * the Sty now, so the board looks the same every morning.
 *
 * A series with an unfinished chore in it is skipped, for the same reason the
 * Trough skips an item somebody still owes: the work is already on the board.
 *
 * Returns how many were posted.
 */
function postRecurringFor(householdId) {
  var all = findAll(CONFIG.SHEET_CHORES, { householdId: householdId });
  var today = todayStr();

  // Gather each series and find its most recent member.
  var latest = {};
  var openSeries = {};

  all.forEach(function (c) {
    if (!c.seriesId || !c.recurrence) return;

    if (c.status !== STATUS.DONE) {
      openSeries[c.seriesId] = true;
      return;
    }
    var prev = latest[c.seriesId];
    var when = seriesDate(c);
    if (!prev || when > seriesDate(prev)) latest[c.seriesId] = c;
  });

  var nextRef = refAllocator(householdId);
  var posted = 0;

  Object.keys(latest).forEach(function (seriesId) {
    if (openSeries[seriesId]) return;          // still owed, nothing to post

    var last = latest[seriesId];
    var days = recurrenceDays(last.recurrence);
    if (!days) return;

    var due = addDays(seriesDate(last), days);
    if (due > today) return;                   // not come round yet

    insert(CONFIG.SHEET_CHORES, {
      choreId: newId('c'),
      householdId: householdId,
      title: last.title,
      notes: last.notes || '',
      category: last.category || '',
      points: Number(last.points || 0),
      status: STATUS.POOL,
      createdBy: last.createdBy || '',
      createdAt: stamp(),
      assigneeId: '',
      claimedAt: '',
      startedAt: '',
      submittedAt: '',
      approvedBy: '',
      approvedAt: '',
      // Dated today rather than the day it theoretically came due, so a chore
      // that was approved late is not born overdue.
      dueDate: today,
      recurrence: last.recurrence,
      reviewNote: '',
      troughId: '',
      styId: '',
      ref: nextRef(),
      seriesId: seriesId
    });
    posted++;
  });

  if (posted) {
    logAction(householdId, '', '', 'recurring_posted', posted + ' chores');
  }
  return posted;
}

/** The date a finished chore counts as having happened on. */
function seriesDate(c) {
  var d = String(c.dueDate || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return String(c.approvedAt || c.createdAt || '').slice(0, 10);
}

/** yyyy-mm-dd plus n days, in the script's timezone. */
function addDays(dateStr, n) {
  var d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return todayStr();
  d.setDate(d.getDate() + n);
  return Utilities.formatDate(d, CONFIG_TZ(), 'yyyy-MM-dd');
}
