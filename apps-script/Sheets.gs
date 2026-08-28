/**
 * Chore Boar -- the spreadsheet as a database.
 *
 * Every table is one sheet whose first row is the header. Rows come back as
 * plain objects keyed by header name, so the rest of the code never counts
 * columns and adding a column never shifts anything.
 *
 * Scale note: a household is tens of members and hundreds of chores, so
 * reading a whole sheet per call is cheaper than being clever about ranges.
 */

// ---------------------------------------------------------------------
// Schema -- the header row of each sheet, in order
// ---------------------------------------------------------------------

/**
 * The header row of one sheet.
 *
 * Built on first use rather than at file scope. Apps Script evaluates a
 * project's files in an order it does not promise, so reading CONFIG while
 * this file loads is a coin toss -- and losing it is not a small bug: the
 * whole project fails to load and every single call dies with a TypeError
 * nowhere near the cause.
 */
var _schema = null;

function schema(name) {
  if (!_schema) {
    _schema = {};
    _schema[CONFIG.SHEET_HOUSEHOLDS] = [
      'householdId', 'name', 'ownerEmail', 'passwordHash', 'passwordSalt',
      'createdAt', 'failedAttempts', 'lockedUntil'
    ];
    _schema[CONFIG.SHEET_MEMBERS] = [
      'memberId', 'householdId', 'name', 'role', 'pinHash', 'pinSalt',
      'color', 'points', 'active', 'createdAt', 'failedAttempts', 'lockedUntil'
    ];
    _schema[CONFIG.SHEET_SESSIONS] = [
      'token', 'kind', 'householdId', 'memberId', 'deviceLabel',
      'createdAt', 'lastSeenAt', 'expiresAt'
    ];
    _schema[CONFIG.SHEET_CHORES] = [
      'choreId', 'householdId', 'title', 'notes', 'category', 'points',
      'status', 'createdBy', 'createdAt', 'assigneeId', 'claimedAt',
      'startedAt', 'submittedAt', 'approvedBy', 'approvedAt', 'dueDate',
      'recurrence', 'reviewNote'
    ];
    _schema[CONFIG.SHEET_LOG] = [
      'at', 'householdId', 'choreId', 'memberId', 'action', 'detail'
    ];
  }
  return _schema[name];
}

// ---------------------------------------------------------------------
// Getting at the file
// ---------------------------------------------------------------------

var _ss = null;

/** The spreadsheet, opened once per execution. */
function book() {
  if (_ss) return _ss;

  var id = CONFIG.SPREADSHEET_ID ||
           PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error(
      'No spreadsheet yet. Run setUp() once from the Apps Script editor.');
  }
  _ss = SpreadsheetApp.openById(id);
  return _ss;
}

/** A sheet by name, created with its header row if it is missing. */
function tab(name) {
  var ss = book();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    writeHeader(sh, name);
  }
  return sh;
}

/** Lays down (or repairs) the header row and freezes it. */
function writeHeader(sh, name) {
  var head = schema(name);
  if (!head) return;
  sh.getRange(1, 1, 1, head.length).setValues([head])
    .setFontWeight('bold').setBackground('#02407d').setFontColor('#ffffff');
  sh.setFrozenRows(1);
}

// ---------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------

/**
 * Every row of a sheet as an object, plus a private _row holding its real
 * sheet row number so update() and remove() can find it again.
 */
function rows(name) {
  var sh = tab(name);
  var last = sh.getLastRow();
  if (last < 2) return [];

  var head = schema(name);
  var values = sh.getRange(2, 1, last - 1, head.length).getValues();
  var out = [];

  for (var i = 0; i < values.length; i++) {
    // A row whose first cell is blank is a leftover from a manual delete.
    if (values[i][0] === '' || values[i][0] === null) continue;
    var rec = { _row: i + 2 };
    for (var c = 0; c < head.length; c++) rec[head[c]] = values[i][c];
    out.push(rec);
  }
  return out;
}

/** Rows matching every key/value in `where`. */
function findAll(name, where) {
  return rows(name).filter(function (r) {
    for (var k in where) {
      if (String(r[k]) !== String(where[k])) return false;
    }
    return true;
  });
}

/** The first row matching `where`, or null. */
function findOne(name, where) {
  var hits = findAll(name, where);
  return hits.length ? hits[0] : null;
}

// ---------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------

/** Appends a record, filling unmentioned columns with ''. Returns it. */
function insert(name, rec) {
  var head = schema(name);
  var line = head.map(function (k) {
    return rec[k] === undefined || rec[k] === null ? '' : rec[k];
  });
  tab(name).appendRow(line);
  return rec;
}

/**
 * Writes the given fields back to an existing row. `rec` must be something
 * rows()/findOne() handed you, so it carries _row.
 */
function update(name, rec, changes) {
  if (!rec || !rec._row) throw new Error('update() needs a row read from the sheet.');
  var head = schema(name);
  var sh = tab(name);

  for (var k in changes) {
    var col = head.indexOf(k);
    if (col < 0) continue;
    var v = changes[k];
    sh.getRange(rec._row, col + 1).setValue(v === undefined || v === null ? '' : v);
    rec[k] = v;
  }
  return rec;
}

/** Deletes a row read from the sheet. */
function remove(name, rec) {
  if (!rec || !rec._row) throw new Error('remove() needs a row read from the sheet.');
  tab(name).deleteRow(rec._row);
}

// ---------------------------------------------------------------------
// Bits every table needs
// ---------------------------------------------------------------------

/** A short unique id, e.g. "m-l8x2k9f-4823". */
function newId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' +
         Math.floor(Math.random() * 9000 + 1000);
}

/** Now, as an ISO string -- what every timestamp column stores. */
function stamp() {
  return new Date().toISOString();
}

/** Records something that happened. Never throws -- logging must not lose work. */
function logAction(householdId, choreId, memberId, action, detail) {
  try {
    insert(CONFIG.SHEET_LOG, {
      at: stamp(),
      householdId: householdId || '',
      choreId: choreId || '',
      memberId: memberId || '',
      action: action || '',
      detail: detail || ''
    });
  } catch (err) {
    console.error('logAction failed: ' + err);
  }
}
