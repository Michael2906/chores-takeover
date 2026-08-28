/**
 * Chore Boar -- configuration.
 *
 * This is the only file you normally need to edit. Everything else reads from
 * CONFIG. After changing anything here, re-deploy the web app:
 * Deploy > Manage deployments > pencil > Version: New version > Deploy.
 */

var CONFIG = {

  // ---------------------------------------------------------------------
  // Branding
  // ---------------------------------------------------------------------

  APP_NAME: 'Chore Boar',
  TAGLINE:  'Somebody has to do it.',

  // ---------------------------------------------------------------------
  // The spreadsheet behind the app
  // ---------------------------------------------------------------------

  // Leave blank and setUp() creates a new spreadsheet, then records its id in
  // script properties. Paste an existing spreadsheet id here to use that one.
  SPREADSHEET_ID: '',

  SHEET_HOUSEHOLDS: 'Households',
  SHEET_MEMBERS:    'Members',
  SHEET_SESSIONS:   'Sessions',
  SHEET_CHORES:     'Chores',
  SHEET_LOG:        'Activity Log',

  // ---------------------------------------------------------------------
  // Sign-in behaviour
  // ---------------------------------------------------------------------

  // How long a device stays signed in to the household before it has to enter
  // the account password again. This is device-level trust only.
  SESSION_DAYS: 60,

  // How long the person who picked their name stays the active user on that
  // device. When it lapses they re-pick from the name list (and re-enter their
  // PIN if they have one). Every action is checked against this, not against
  // whatever name the browser claims -- so a shorter window is a real gate.
  MEMBER_SESSION_HOURS: 12,

  // Wrong-password / wrong-PIN attempts allowed before that account is frozen
  // for LOCKOUT_MINUTES. Applies per household account and per sub-account.
  MAX_ATTEMPTS:     8,
  LOCKOUT_MINUTES: 15,

  // Password rules for the household account holder.
  MIN_PASSWORD: 8,

  // Sub-account PIN length. A PIN is optional per sub-account -- a young kid
  // can be left PIN-less so they just tap their name.
  PIN_LENGTH: 4,

  // Iterations for the password/PIN hash.
  //
  // Each iteration is a JS-to-Java bridge crossing in Apps Script, so this
  // buys far less than it would elsewhere -- 2000 keeps sign-in well under a
  // second, 20000 makes every PIN entry feel broken. Be honest about what is
  // actually protecting you here: a 4-digit PIN has 10,000 possibilities and
  // NO iteration count saves it from an offline guess. The real defence is
  // PEPPER, which lives in script properties and NOT in the spreadsheet, so
  // a leaked sheet alone does not let anyone test guesses. See Auth.gs.
  HASH_ITERATIONS: 2000,

  // ---------------------------------------------------------------------
  // Chores
  // ---------------------------------------------------------------------

  // Offered in the "new chore" form. Free text is allowed too.
  CATEGORIES: [
    'Kitchen', 'Bathroom', 'Bedroom', 'Laundry',
    'Yard', 'Pets', 'Trash', 'Vehicle', 'Other'
  ],

  // Point values offered as quick-pick buttons.
  POINT_PRESETS: [1, 2, 3, 5, 10, 20],

  // A chore nobody has claimed this many days past its due date is flagged.
  STALE_DAYS: 3,

  // ---------------------------------------------------------------------
  // Email
  // ---------------------------------------------------------------------

  // Mail always comes FROM the Google account that owns the script. This is
  // only the display name people see.
  FROM_NAME: 'Chore Boar',

  // Tell the household account holder when a sub-account submits a chore for
  // approval. Off by default -- turn it on once you know you want the mail.
  // A consumer Google account allows about 100 emails a day.
  EMAIL_ON_SUBMIT: false
};
