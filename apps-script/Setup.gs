/**
 * Chore Boar -- first-run setup.
 *
 * Run setUp() ONCE from the Apps Script editor. It creates the spreadsheet
 * behind the app, lays out its five sheets, and records the file id in script
 * properties so the app can find it again.
 *
 * Running it twice is safe: it reuses the spreadsheet it already made and only
 * repairs anything missing. It never deletes a row.
 */

function setUp() {
  var props = PropertiesService.getScriptProperties();
  var id = CONFIG.SPREADSHEET_ID || props.getProperty('SPREADSHEET_ID');
  var ss;

  if (id) {
    ss = SpreadsheetApp.openById(id);
    console.log('Using the existing spreadsheet: ' + ss.getName());
  } else {
    ss = SpreadsheetApp.create(CONFIG.APP_NAME + ' data');
    id = ss.getId();
    props.setProperty('SPREADSHEET_ID', id);
    console.log('Created a new spreadsheet.');
  }

  // Create or repair every sheet the app expects.
  var names = [
    CONFIG.SHEET_HOUSEHOLDS,
    CONFIG.SHEET_MEMBERS,
    CONFIG.SHEET_SESSIONS,
    CONFIG.SHEET_CHORES,
    CONFIG.SHEET_LOG
  ];

  names.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      console.log('Added sheet: ' + name);
    }
    writeHeader(sh, name);
    sh.autoResizeColumns(1, SCHEMA[name].length);
  });

  // Drop the default "Sheet1" if it is still there and empty.
  var first = ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1 && first.getLastRow() === 0) {
    ss.deleteSheet(first);
  }

  // Order the tabs the way a person would read them.
  names.forEach(function (name, i) {
    ss.setActiveSheet(ss.getSheetByName(name));
    ss.moveActiveSheet(i + 1);
  });

  // Force PEPPER into existence now, while you are watching, rather than
  // during somebody's first sign-in. It is create-once -- see Auth.gs.
  pepper();

  console.log('');
  console.log('Setup complete.');
  console.log('Spreadsheet: ' + ss.getUrl());
  console.log('');
  console.log('Next: Deploy > New deployment > Web app,');
  console.log('  Execute as: Me,  Who has access: Anyone.');
  console.log('Then open the /exec URL and create your household.');

  return ss.getUrl();
}

/**
 * Where the data lives. Handy when you want to open the sheet and have
 * forgotten the link.
 */
function whereIsTheData() {
  var url = book().getUrl();
  console.log(url);
  return url;
}

/**
 * Installs a nightly trigger that clears expired sessions.
 *
 * Entirely optional -- expired tokens are rejected whether or not they are
 * ever tidied away. This only stops the Sessions sheet growing forever.
 */
function installNightlySweep() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'sweepSessions') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('sweepSessions').timeBased().atHour(3).everyDays(1).create();
  console.log('Nightly session sweep installed for ~3am.');
}

/**
 * Removes every account, chore and log line, and keeps the spreadsheet.
 *
 * DESTRUCTIVE, and there is no undo. It exists so you can throw away the
 * household you made while trying the app out, before the family starts using
 * it for real. It deliberately does NOT clear PEPPER -- that is create-once,
 * and rotating it would only orphan hashes.
 *
 * It will not run unless you pass the exact confirmation string:
 *
 *   resetEverything('YES I MEAN IT')
 */
function resetEverything(confirmation) {
  if (confirmation !== 'YES I MEAN IT') {
    console.log('Not doing anything.');
    console.log("To really wipe every account and chore, call:");
    console.log("  resetEverything('YES I MEAN IT')");
    return;
  }

  var names = [
    CONFIG.SHEET_HOUSEHOLDS,
    CONFIG.SHEET_MEMBERS,
    CONFIG.SHEET_SESSIONS,
    CONFIG.SHEET_CHORES,
    CONFIG.SHEET_LOG
  ];

  names.forEach(function (name) {
    var sh = tab(name);
    var last = sh.getLastRow();
    if (last > 1) sh.deleteRows(2, last - 1);
    console.log('Cleared ' + name);
  });

  console.log('Everything is gone. Open the app to create a fresh household.');
}
