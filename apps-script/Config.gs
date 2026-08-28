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
  SHEET_TROUGH:     'Trough',
  SHEET_STY:        'Sty',
  SHEET_PRIZES:     'Prizes',
  SHEET_REDEEMED:   'Redemptions',
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
    'Kitchen', 'Cooking', 'Bathroom', 'Bedroom', 'Living Areas', 'Laundry',
    'Trash', 'Pets', 'Yard', 'Vehicle', 'Errands', 'School', 'Helping', 'Other'
  ],

  // Point values offered as quick-pick buttons. Any other number can still be
  // typed in -- these are shortcuts, not the whole range.
  POINT_PRESETS: [1, 2, 3, 5, 10, 20],

  // Ready-made chores live in Suggestions.gs -- there are enough of them to
  // swamp this file. Add your own there.

  // ---------------------------------------------------------------------
  // The Trough -- the daily hand-out
  // ---------------------------------------------------------------------

  // What the daily list is called on screen. It is the boar's feeding trough:
  // the same chores come round every day and get shared out.
  TROUGH_NAME: 'The Trough',

  // How much harder the hand-out leans on children than on parents.
  //
  // Each person's "load" is their points so far divided by this weight, and
  // the next chore goes to whoever is carrying the least. At 2, a child takes
  // roughly twice the points of a parent before the parent is picked -- which
  // is the point, since the children are the ones spending them. Set it to 1
  // to share evenly, or higher to lean harder on the kids.
  CHILD_WEIGHT: 2,

  // Nobody gets the same trough chore two days running. Raise this to widen
  // the gap -- 2 means "not yesterday or the day before".
  NO_REPEAT_DAYS: 1,

  // ---------------------------------------------------------------------
  // The Sty -- everybody's own patch
  // ---------------------------------------------------------------------

  // The other daily list. Where the Trough is shared OUT -- one chore, one
  // person -- everything on this list goes to EVERYBODY, every day. It is for
  // the chores that are each person's own: their bed, their room, their
  // washing. Nobody can do somebody else's.
  STY_NAME: 'The Sty',

  // Whether parents get the Sty list too. Everyone has a bedroom and laundry,
  // so this is on. Turn it off to make it children-only.
  STY_PARENTS_TOO: true,

  // ---------------------------------------------------------------------
  // The nightly hand-out
  // ---------------------------------------------------------------------

  // Both lists are handed out automatically, once a day, by a trigger that
  // setUp() installs. Nobody has to press anything.
  //
  // The hour is in the script's timezone -- America/Chicago, set in
  // appsscript.json -- so 0 means midnight Central.
  //
  // BE AWARE: Apps Script time triggers are approximate. atHour(0) means
  // "somewhere in the midnight hour", not 00:00:00 exactly. In practice it
  // lands within a few minutes to an hour. That is a limit of the platform,
  // not something this setting can tighten.
  DAILY_FILL_HOUR: 0,

  // A run that finds today's chores already handed out does nothing, so a
  // retry after a failure cannot double anybody up.
  //

  // ---------------------------------------------------------------------
  // The Store
  // ---------------------------------------------------------------------

  STORE_NAME: 'The Prize Pen',

  // Whether a redemption waits for a parent to hand the prize over. With this
  // on, points are taken at once and the claim sits in a list until somebody
  // marks it handed over -- which is usually what you want, since the prize
  // itself happens in the real world.
  STORE_NEEDS_FULFILLING: true,

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
