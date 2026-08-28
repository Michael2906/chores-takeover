/**
 * Chore Boar -- the ready-made chore list.
 *
 * Picking one of these in the "new chore" form fills in category, points,
 * notes and how often it repeats. Everything stays editable afterwards; a
 * suggestion is a starting point, not a template you are stuck with. Typing a
 * name that is not on this list just fills the form in by hand.
 *
 * Returned from a function rather than held in a top-level var so nothing
 * depends on which order Apps Script happens to evaluate the files in. See
 * the note in Sheets.gs.
 *
 * ADDING YOUR OWN: title is the only required field. Points are a rough guide
 * -- roughly "one point per five minutes, more if it is unpleasant" -- and you
 * can change any of them here or per-chore in the form.
 */
function suggestionList() {
  return [

    // --- Kitchen -----------------------------------------------------
    s('', 'Kitchen', 3,  'daily',   'Rinse the plates first.'),
    s('', 'Kitchen', 3,  'daily',   'Everything back where it lives.'),
    s('', 'Kitchen', 5,  'daily',   ''),
    s('', 'Kitchen', 3,  'daily',   ''),
    s('', 'Kitchen', 2,  'daily',   'Do not forget the corners.'),
    s('', 'Kitchen', 1,  'daily',   ''),
    s('', 'Kitchen', 2,  'daily',   ''),
    s('', 'Kitchen', 2,  'daily',   ''),
    s('', 'Kitchen', 3,  'daily',   ''),
    s('', 'Kitchen', 5,  'weekly',  ''),
    s('', 'Kitchen', 3,  'weekly',  ''),
    s('', 'Kitchen', 5,  'weekly',  'Outside and the door handles.'),
    s('', 'Kitchen', 8,  'weekly',  'Throw out anything past its date.'),
    s('', 'Kitchen', 4,  'weekly',  ''),
    s('', 'Kitchen', 5,  'weekly',  ''),
    s('',                                   'Kitchen',       15,  'monthly',  'Wear the gloves.'),
    s('', 'Kitchen', 5,  'monthly', ''),
    s('', 'Kitchen', 8,  'monthly', ''),
    s('', 'Kitchen', 4,  'weekly',  ''),
    s('', 'Kitchen', 2,  'daily',   ''),
    s('', 'Kitchen', 1,  '',        ''),
    s('', 'Kitchen', 4,  'weekly',  ''),
    s('', 'Kitchen', 1,  'daily',   ''),
    s('', 'Kitchen', 5,  'daily',   ''),

    // --- Cooking -----------------------------------------------------
    s('', 'Cooking', 6,  'daily',   ''),
    s('',                                   'Cooking',       12,  '',                ''),
    s('', 'Cooking', 5,  'daily',   ''),
    s('', 'Cooking', 8,  '',        ''),
    s('', 'Cooking', 8,  'weekly',  ''),

    // --- Bathroom ----------------------------------------------------
    s('',                                   'Bathroom',      10,  'weekly',    'Sink, toilet, tub, mirror.'),
    s('', 'Bathroom', 5,  'weekly',  ''),
    s('', 'Bathroom', 8,  'weekly',  ''),
    s('', 'Bathroom', 8,  'weekly',  'Get the door track too.'),
    s('', 'Bathroom', 2,  'weekly',  ''),
    s('', 'Bathroom', 3,  'weekly',  ''),
    s('', 'Bathroom', 4,  'weekly',  ''),
    s('', 'Bathroom', 1,  'weekly',  ''),
    s('', 'Bathroom', 2,  'weekly',  ''),
    s('', 'Bathroom', 1,  'weekly',  ''),

    // --- Bedroom -----------------------------------------------------
    s('', 'Bedroom', 1,  'daily',   ''),
    s('', 'Bedroom', 5,  'daily',   'Floor clear, under the bed as well.'),
    s('', 'Bedroom', 5,  'weekly',  ''),
    s('', 'Bedroom', 3,  'daily',   ''),
    s('', 'Bedroom', 3,  'weekly',  ''),
    s('', 'Bedroom', 4,  'weekly',  ''),
    s('', 'Bedroom', 3,  'weekly',  ''),
    s('',                                   'Bedroom',       10,  'monthly',  'Anything outgrown into a bag.'),
    s('', 'Bedroom', 4,  'monthly', ''),

    // --- Living areas ------------------------------------------------
    s('',                                   'Living Areas',  5,   'weekly',   ''),
    s('',                                   'Living Areas',  15,  'weekly',   ''),
    s('',                                   'Living Areas',  3,   'weekly',   ''),
    s('',                                   'Living Areas',  4,   'daily',     'Cushions straight, remotes away.'),
    s('',                                   'Living Areas',  3,   'weekly',   ''),
    s('',                                   'Living Areas',  10,  'weekly',   ''),
    s('',                                   'Living Areas',  10,  'monthly',  ''),
    s('',                                   'Living Areas',  8,   'monthly',  ''),
    s('',                                   'Living Areas',  4,   'weekly',   ''),
    s('',                                   'Living Areas',  6,   'weekly',   ''),
    s('',                                   'Living Areas',  2,   'weekly',   ''),
    s('',                                   'Living Areas',  1,   'daily',    ''),
    s('',                                   'Living Areas',  4,   'monthly',  ''),
    s('',                                   'Living Areas',  2,   'monthly',  'Dry microfiber only.'),
    s('',                                   'Living Areas',  4,   'monthly',  ''),
    s('',                                   'Living Areas',  2,   'weekly',   ''),

    // --- Laundry -----------------------------------------------------
    s('', 'Laundry', 2,  '',       ''),
    s('', 'Laundry', 2,  '',       ''),
    s('', 'Laundry', 4,  '',       ''),
    s('', 'Laundry', 3,  '',       ''),
    s('', 'Laundry', 4,  'weekly', ''),
    s('', 'Laundry', 2,  'weekly', ''),
    s('', 'Laundry', 3,  'weekly', 'Darks, lights, towels.'),
    s('', 'Laundry', 6,  'weekly', ''),
    s('', 'Laundry', 1,  'weekly', ''),
    s('', 'Laundry', 3,  'weekly', ''),

    // --- Trash -------------------------------------------------------
    s('',                                   'Trash',         2,   'weekly',   'Check which cans go out this week.'),
    s('',                                   'Trash',         2,   'weekly',   ''),
    s('',                                   'Trash',         3,   'weekly',   ''),
    s('',                                   'Trash',         3,   'weekly',   ''),
    s('',                                   'Trash',         2,   'weekly',   ''),
    s('',                                   'Trash',         3,   '',               ''),

    // --- Pets --------------------------------------------------------
    s('',                                   'Pets',          2,   'daily',      ''),
    s('',                                   'Pets',          1,   'daily',      ''),
    s('',                                   'Pets',          3,   'daily',      ''),
    s('',                                   'Pets',          5,   'weekly',    ''),
    s('',                                   'Pets',          3,   'daily',      ''),
    s('',                                   'Pets',          5,   'weekly',    ''),
    s('',                                   'Pets',          3,   'weekly',    ''),
    s('',                                   'Pets',          10,  'monthly',  ''),
    s('',                                   'Pets',          2,   'weekly',    ''),
    s('',                                   'Pets',          8,   'weekly',    ''),
    s('',                                   'Pets',          4,   'monthly',  ''),

    // --- Yard --------------------------------------------------------
    s('',                                   'Yard',          20,  'weekly',    ''),
    s('',                                   'Yard',          10,  'weekly',    ''),
    s('',                                   'Yard',          10,  '',                ''),
    s('',                                   'Yard',          10,  'weekly',    ''),
    s('', 'Yard', 2,  'weekly',  ''),
    s('', 'Yard', 3,  'weekly',  ''),
    s('', 'Yard', 5,  'weekly',  ''),
    s('', 'Yard', 5,  'weekly',  ''),
    s('', 'Yard', 5,  'weekly',  ''),
    s('',                                   'Yard',          15,  'monthly',  ''),
    s('', 'Yard', 6,  'monthly', ''),
    s('',                                   'Yard',          15,  '',                ''),
    s('', 'Yard', 5,  '',        ''),
    s('', 'Yard', 8,  '',        ''),
    s('',                                   'Yard',          5,   'weekly',   ''),
    s('',                                   'Yard',          12,  'monthly',  ''),
    s('', 'Yard', 2,  'weekly',  ''),
    s('',                                   'Yard',          20,  'monthly',  'An adult holds the ladder.'),
    s('',                                   'Yard',          12,  'monthly',  ''),
    s('', 'Yard', 8,  'monthly', ''),
    s('',                                   'Yard',          15,  'monthly',  ''),

    // --- Vehicle -----------------------------------------------------
    s('',                                   'Vehicle',       20,  'monthly',  ''),
    s('',                                   'Vehicle',       10,  'monthly',  ''),
    s('',                                   'Vehicle',       4,   'weekly',   ''),
    s('', 'Vehicle', 3,  'monthly', ''),
    s('', 'Vehicle', 5,  'monthly', ''),
    s('', 'Vehicle', 3,  'monthly', ''),

    // --- Errands -----------------------------------------------------
    s('',                                   'Errands',       1,   'daily',     ''),
    s('',                                   'Errands',       2,   '',               ''),
    s('',                                   'Errands',       5,   '',               ''),
    s('',                                   'Errands',       4,   'weekly',   ''),
    s('',                                   'Errands',       4,   '',               ''),

    // --- School ------------------------------------------------------
    s('',                                   'School',        5,   'daily',     ''),
    s('',                                   'School',        3,   'daily',     ''),
    s('',                                   'School',        2,   'daily',     ''),
    s('',                                   'School',        1,   'daily',     'The moment you get in.'),
    s('',                                   'School',        1,   'daily',    ''),
    s('',                                   'School',        4,   'daily',     ''),

    // --- Helping out -------------------------------------------------
    s('',                                   'Helping',       8,   '',         ''),
    s('',                                   'Helping',       5,   '',              ''),
    s('',                                   'Helping',       3,   'daily',     ''),
    s('',                                   'Helping',       3,   'weekly',   ''),
    s('',                                   'Helping',       3,   '',               ''),

    // --- Anything else -----------------------------------------------
    s('',                                   'Other',         1,   'daily',      ''),
    s('', 'Other', 5,  'monthly', ''),
    s('', 'Other', 2,  '',        ''),
    s('', 'Other', 4,  'monthly', ''),
    s('', 'Other', 5,  'monthly', ''),
    s('', 'Other', 3,  'weekly',  ''),
    s('', 'Other', 5,  'monthly', ''),
    s('', 'Other', 3,  'weekly',  ''),
    s('',                                   'Other',         3,   'weekly',   ''),
    s('', 'Other', 8,  '',        ''),
    s('',                                   'Other',         10,  '',                ''),
    s('', 'Other', 2,  'weekly',  ''),
    s('', 'Other', 6,  'monthly', '')
  ];
}

/** Shorthand so the list above stays readable. */
function s(title, category, points, recurrence, notes) {
  return {
    title: title,
    category: category,
    points: points,
    recurrence: recurrence,
    notes: notes
  };
}
