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
  // The wrapper page at your own domain
  // ---------------------------------------------------------------------

  // Apps Script cannot be given a custom domain, so thechoreboar.fyi serves a
  // small wrapper page (docs/index.html, hosted on GitHub Pages) that frames
  // this app. The wrapper exists to hold the sign-in tokens: inside it this
  // app is a third-party frame, and Safari will not let a third-party frame
  // keep localStorage -- which is why plain cloaked forwarding asked for the
  // password on every visit.
  //
  // THIS IS AN ALLOW-LIST OF WHO MAY BE HANDED A LIVE SESSION. Only add an
  // origin you control. A wrong entry here lets that site take over accounts.
  // Origins only -- scheme and host, no trailing slash, no path.
  WRAPPER_ORIGINS: [
    'https://thechoreboar.fyi',
    'https://www.thechoreboar.fyi'
  ],

  // ---------------------------------------------------------------------
  // Chores
  // ---------------------------------------------------------------------

  // Offered in the "new chore" form. Free text is allowed too.
  CATEGORIES: [
    'Kitchen', 'Bathroom', 'Bedroom', 'Laundry',
    'Yard', 'Pets', 'Trash', 'Vehicle', 'Other'
  ],

  // Point values offered as quick-pick buttons. Any other number can still be
  // typed in -- these are shortcuts, not the whole range.
  POINT_PRESETS: [1, 2, 3, 5, 10, 20],

  // Ready-made chores. Picking one fills in the rest of the form, which stays
  // fully editable -- the suggestion is a starting point, not a template you
  // are stuck with. Typing a name that is not on this list just fills the form
  // in by hand as before.
  //
  // Add your own freely: title is the only required field.
  SUGGESTIONS: [
    { title: 'Load the dishwasher',   category: 'Kitchen',  points: 3,  recurrence: 'daily',   notes: 'Rinse the plates first.' },
    { title: 'Empty the dishwasher',  category: 'Kitchen',  points: 3,  recurrence: 'daily',   notes: '' },
    { title: 'Wipe the worktops',     category: 'Kitchen',  points: 2,  recurrence: 'daily',   notes: 'Do not forget the corners.' },
    { title: 'Sweep the kitchen',     category: 'Kitchen',  points: 3,  recurrence: 'weekly',  notes: '' },
    { title: 'Take the bins out',     category: 'Trash',    points: 2,  recurrence: 'weekly',  notes: 'Check which bin it is this week.' },
    { title: 'Clean the bathroom',    category: 'Bathroom', points: 10, recurrence: 'weekly',  notes: 'Sink, toilet, bath, mirror.' },
    { title: 'Scrub the bathtub',     category: 'Bathroom', points: 8,  recurrence: 'monthly', notes: '' },
    { title: 'Make your bed',         category: 'Bedroom',  points: 1,  recurrence: 'daily',   notes: '' },
    { title: 'Tidy your room',        category: 'Bedroom',  points: 5,  recurrence: 'weekly',  notes: 'Floor clear, under the bed as well.' },
    { title: 'Hoover the front room', category: 'Bedroom',  points: 5,  recurrence: 'weekly',  notes: '' },
    { title: 'Dust the front room',   category: 'Bedroom',  points: 3,  recurrence: 'weekly',  notes: '' },
    { title: 'Fold the laundry',      category: 'Laundry',  points: 4,  recurrence: 'weekly',  notes: '' },
    { title: 'Put your laundry away', category: 'Laundry',  points: 2,  recurrence: 'weekly',  notes: '' },
    { title: 'Start a load of washing', category: 'Laundry', points: 2, recurrence: '',        notes: '' },
    { title: 'Mow the lawn',          category: 'Yard',     points: 20, recurrence: 'weekly',  notes: '' },
    { title: 'Rake the leaves',       category: 'Yard',     points: 10, recurrence: '',        notes: '' },
    { title: 'Sweep the porch',       category: 'Yard',     points: 5,  recurrence: 'weekly',  notes: '' },
    { title: 'Water the plants',      category: 'Yard',     points: 2,  recurrence: 'weekly',  notes: '' },
    { title: 'Feed the pets',         category: 'Pets',     points: 2,  recurrence: 'daily',   notes: '' },
    { title: 'Walk the dog',          category: 'Pets',     points: 3,  recurrence: 'daily',   notes: '' },
    { title: 'Clean up after the pets', category: 'Pets',   points: 5,  recurrence: 'weekly',  notes: '' },
    { title: 'Wash the car',          category: 'Vehicle',  points: 20, recurrence: 'monthly', notes: '' },
    { title: 'Vacuum the car',        category: 'Vehicle',  points: 10, recurrence: 'monthly', notes: '' },
    { title: 'Bring the mail in',     category: 'Other',    points: 1,  recurrence: 'daily',   notes: '' },
    { title: 'Set the table',         category: 'Kitchen',  points: 2,  recurrence: 'daily',   notes: '' },
    { title: 'Clear the table',       category: 'Kitchen',  points: 2,  recurrence: 'daily',   notes: '' }
  ],

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
