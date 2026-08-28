/**
 * Chore Boar -- web app entry point and the single door the client calls.
 *
 * doGet() serves the app. Everything after that goes through call(), so the
 * browser has exactly one function to know about and every reply has the same
 * shape:
 *
 *   { ok: true,  data: ... }
 *   { ok: false, error: 'something a person can read' }
 *
 * Errors are caught and returned rather than thrown, because a thrown Apps
 * Script error reaches the browser as an opaque failure with the real message
 * stripped out -- which is how you end up with a UI that can only say
 * "something went wrong".
 */

// ---------------------------------------------------------------------
// Serving the page
// ---------------------------------------------------------------------

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  template.config = {
    appName:  CONFIG.APP_NAME,
    tagline:  CONFIG.TAGLINE,
    pinLength: CONFIG.PIN_LENGTH,
    minPassword: CONFIG.MIN_PASSWORD,
    wrapperOrigins: CONFIG.WRAPPER_ORIGINS || []
  };
  return template.evaluate()
    .setTitle(CONFIG.APP_NAME)
    .addMetaTag('viewport',
                'width=device-width, initial-scale=1, viewport-fit=cover')
    // ALLOWALL so a masked custom domain (thechoreboar.com forwarding with
    // cloaking) can frame the app. Apps Script cannot be given a custom
    // domain directly, and framing is the only way to keep your own name in
    // the address bar.
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Lets Index.html pull in the CSS/JS/artwork partials. */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// ---------------------------------------------------------------------
// The one call the client makes
// ---------------------------------------------------------------------

/**
 * Everything the browser is allowed to ask for.
 *
 * An allow-list, not a lookup on the global scope: without it, `call` would
 * hand the open internet every function in the project, pepper() and
 * hashSecret() included.
 *
 * Built inside a function rather than at file scope on purpose. Apps Script
 * evaluates the files of a project in an order it does not promise, so a
 * top-level `var ACTIONS = {resumeSession: resumeSession, ...}` can capture
 * `undefined` for anything declared in a file that happens to load later.
 * By the time this runs, every file is in.
 */
function actions() {
  return {
    // Sessions and accounts
    resumeSession:  resumeSession,
    createHousehold: createHousehold,
    signInHousehold: signInHousehold,
    signOutDevice:  signOutDevice,
    pickMember:     pickMember,
    releaseMember:  releaseMember,
    addMember:      addMember,
    updateMember:   updateMember,
    changeHouseholdPassword: changeHouseholdPassword,

    // The board
    loadBoard:      loadBoard,
    createChore:    createChore,
    updateChore:    updateChore,
    deleteChore:    deleteChore,
    claimChore:     claimChore,
    releaseChore:   releaseChore,
    startChore:     startChore,
    pauseChore:     pauseChore,
    submitChore:    submitChore,
    approveChore:   approveChore,
    sendBackChore:  sendBackChore,
    assignChore:    assignChore,
    reopenChore:    reopenChore
  };
}

/** Dispatches one action and always answers in the same envelope. */
function call(action, payload) {
  try {
    var map = actions();
    var fn = Object.prototype.hasOwnProperty.call(map, action)
      ? map[action] : null;
    if (!fn) throw new Error('Unknown action: ' + action);

    return { ok: true, data: fn(payload || {}) };
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    // SIGNED_OUT is a signal to the client, not a sentence to show anybody.
    if (msg !== 'SIGNED_OUT' && msg !== 'PIN_REQUIRED') {
      console.error(action + ' failed: ' + msg);
    }
    return { ok: false, error: msg };
  }
}
