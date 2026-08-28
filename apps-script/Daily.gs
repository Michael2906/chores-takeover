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
    // Re-check inside the lock. This is the whole safety net: whatever else
    // happens -- a retry, an overlapping manual run, a trigger that fires
    // twice -- nobody gets two sets of chores for one day.
    var already = findAll(CONFIG.SHEET_CHORES, { householdId: householdId })
      .filter(function (c) {
        return (c.troughId || c.styId) &&
               String(c.dueDate).slice(0, 10) === today;
      });
    if (already.length) return null;

    var n = 0;
    n += fillTroughFor(householdId, '');
    n += fillStyFor(householdId, '');

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
