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
    s('Load the dishwasher',        'Kitchen', 3,  'daily',   'Rinse the plates first.'),
    s('Empty the dishwasher',       'Kitchen', 3,  'daily',   'Everything back where it lives.'),
    s('Wash the dishes by hand',    'Kitchen', 5,  'daily',   ''),
    s('Dry and put away dishes',    'Kitchen', 3,  'daily',   ''),
    s('Wipe the worktops',          'Kitchen', 2,  'daily',   'Do not forget the corners.'),
    s('Wipe the table',             'Kitchen', 1,  'daily',   ''),
    s('Set the table',              'Kitchen', 2,  'daily',   ''),
    s('Clear the table',            'Kitchen', 2,  'daily',   ''),
    s('Sweep the kitchen floor',    'Kitchen', 3,  'daily',   ''),
    s('Mop the kitchen floor',      'Kitchen', 5,  'weekly',  ''),
    s('Clean the sink',             'Kitchen', 3,  'weekly',  ''),
    s('Wipe down the fridge',       'Kitchen', 5,  'weekly',  'Outside and the door handles.'),
    s('Clean out the fridge',       'Kitchen', 8,  'weekly',  'Bin anything past its date.'),
    s('Clean the microwave',        'Kitchen', 4,  'weekly',  ''),
    s('Clean the stovetop',         'Kitchen', 5,  'weekly',  ''),
    s('Clean the oven',             'Kitchen', 15, 'monthly', 'Wear the gloves.'),
    s('Wipe cupboard doors',        'Kitchen', 5,  'monthly', ''),
    s('Tidy the pantry',            'Kitchen', 8,  'monthly', ''),
    s('Restock the pantry',         'Kitchen', 4,  'weekly',  ''),
    s('Empty the kitchen bin',      'Kitchen', 2,  'daily',   ''),
    s('Refill the ice trays',       'Kitchen', 1,  '',        ''),
    s('Unpack the groceries',       'Kitchen', 4,  'weekly',  ''),
    s('Make coffee',                'Kitchen', 1,  'daily',   ''),
    s('Pack lunches',               'Kitchen', 5,  'daily',   ''),

    // --- Cooking -----------------------------------------------------
    s('Help cook dinner',           'Cooking', 6,  'daily',   ''),
    s('Cook dinner',                'Cooking', 12, '',        ''),
    s('Make breakfast',             'Cooking', 5,  'daily',   ''),
    s('Bake something',             'Cooking', 8,  '',        ''),
    s('Plan the week’s meals', 'Cooking', 8,  'weekly',  ''),

    // --- Bathroom ----------------------------------------------------
    s('Clean the bathroom',         'Bathroom', 10, 'weekly',  'Sink, toilet, bath, mirror.'),
    s('Clean the toilet',           'Bathroom', 5,  'weekly',  ''),
    s('Scrub the bathtub',          'Bathroom', 8,  'weekly',  ''),
    s('Clean the shower',           'Bathroom', 8,  'weekly',  'Get the door track too.'),
    s('Wipe the bathroom mirror',   'Bathroom', 2,  'weekly',  ''),
    s('Wipe the bathroom sink',     'Bathroom', 3,  'weekly',  ''),
    s('Mop the bathroom floor',     'Bathroom', 4,  'weekly',  ''),
    s('Restock toilet paper',       'Bathroom', 1,  'weekly',  ''),
    s('Put out fresh towels',       'Bathroom', 2,  'weekly',  ''),
    s('Empty the bathroom bin',     'Bathroom', 1,  'weekly',  ''),

    // --- Bedroom -----------------------------------------------------
    s('Make your bed',              'Bedroom', 1,  'daily',   ''),
    s('Tidy your room',             'Bedroom', 5,  'daily',   'Floor clear, under the bed as well.'),
    s('Change your bedsheets',      'Bedroom', 5,  'weekly',  ''),
    s('Put your clothes away',      'Bedroom', 3,  'daily',   ''),
    s('Clear off your desk',        'Bedroom', 3,  'weekly',  ''),
    s('Hoover your room',           'Bedroom', 4,  'weekly',  ''),
    s('Dust your room',             'Bedroom', 3,  'weekly',  ''),
    s('Sort out your wardrobe',     'Bedroom', 10, 'monthly', 'Anything outgrown into a bag.'),
    s('Tidy under the bed',         'Bedroom', 4,  'monthly', ''),

    // --- Living areas ------------------------------------------------
    s('Hoover the front room',      'Living Areas', 5, 'weekly', ''),
    s('Hoover the whole house',     'Living Areas', 15, 'weekly', ''),
    s('Dust the front room',        'Living Areas', 3, 'weekly', ''),
    s('Tidy the front room',        'Living Areas', 4, 'daily',  'Cushions straight, remotes away.'),
    s('Sweep the hallway',          'Living Areas', 3, 'weekly', ''),
    s('Mop the floors',             'Living Areas', 10, 'weekly', ''),
    s('Clean the windows',          'Living Areas', 10, 'monthly', ''),
    s('Wipe the skirting boards',   'Living Areas', 8, 'monthly', ''),
    s('Dust the shelves',           'Living Areas', 4, 'weekly', ''),
    s('Hoover the stairs',          'Living Areas', 6, 'weekly', ''),
    s('Tidy the shoe rack',         'Living Areas', 2, 'weekly', ''),
    s('Fluff and straighten cushions', 'Living Areas', 1, 'daily', ''),
    s('Wipe light switches and handles', 'Living Areas', 4, 'monthly', ''),
    s('Clean the TV screen',        'Living Areas', 2, 'monthly', 'Dry microfibre only.'),
    s('Tidy the bookshelf',         'Living Areas', 4, 'monthly', ''),
    s('Water the houseplants',      'Living Areas', 2, 'weekly', ''),

    // --- Laundry -----------------------------------------------------
    s('Start a load of washing',    'Laundry', 2,  '',       ''),
    s('Move washing to the dryer',  'Laundry', 2,  '',       ''),
    s('Hang the washing out',       'Laundry', 4,  '',       ''),
    s('Bring the washing in',       'Laundry', 3,  '',       ''),
    s('Fold the laundry',           'Laundry', 4,  'weekly', ''),
    s('Put your laundry away',      'Laundry', 2,  'weekly', ''),
    s('Sort the dirty washing',     'Laundry', 3,  'weekly', 'Darks, lights, towels.'),
    s('Iron a few things',          'Laundry', 6,  'weekly', ''),
    s('Clean the lint trap',        'Laundry', 1,  'weekly', ''),
    s('Match up the socks',         'Laundry', 3,  'weekly', ''),

    // --- Trash -------------------------------------------------------
    s('Take the bins out',          'Trash', 2, 'weekly', 'Check which bin it is this week.'),
    s('Bring the bins back in',     'Trash', 2, 'weekly', ''),
    s('Empty all the bins',         'Trash', 3, 'weekly', ''),
    s('Sort the recycling',         'Trash', 3, 'weekly', ''),
    s('Take out the recycling',     'Trash', 2, 'weekly', ''),
    s('Break down the boxes',       'Trash', 3, '',       ''),

    // --- Pets --------------------------------------------------------
    s('Feed the pets',              'Pets', 2, 'daily',   ''),
    s('Fresh water for the pets',   'Pets', 1, 'daily',   ''),
    s('Walk the dog',               'Pets', 3, 'daily',   ''),
    s('Clean up after the pets',    'Pets', 5, 'weekly',  ''),
    s('Scoop the litter tray',      'Pets', 3, 'daily',   ''),
    s('Change the litter tray',     'Pets', 5, 'weekly',  ''),
    s('Brush the dog',              'Pets', 3, 'weekly',  ''),
    s('Give the dog a bath',        'Pets', 10, 'monthly', ''),
    s('Clean the pet bowls',        'Pets', 2, 'weekly',  ''),
    s('Clean out the cage or tank', 'Pets', 8, 'weekly',  ''),
    s('Wash the pet bedding',       'Pets', 4, 'monthly', ''),

    // --- Yard --------------------------------------------------------
    s('Mow the lawn',               'Yard', 20, 'weekly',  ''),
    s('Edge the lawn',              'Yard', 10, 'weekly',  ''),
    s('Rake the leaves',            'Yard', 10, '',        ''),
    s('Weed the flower beds',       'Yard', 10, 'weekly',  ''),
    s('Water the plants',           'Yard', 2,  'weekly',  ''),
    s('Water the garden',           'Yard', 3,  'weekly',  ''),
    s('Sweep the porch',            'Yard', 5,  'weekly',  ''),
    s('Sweep the driveway',         'Yard', 5,  'weekly',  ''),
    s('Pick up sticks in the yard', 'Yard', 5,  'weekly',  ''),
    s('Trim the hedges',            'Yard', 15, 'monthly', ''),
    s('Wash the outside bins',      'Yard', 6,  'monthly', ''),
    s('Shovel the snow',            'Yard', 15, '',        ''),
    s('Salt the walkway',           'Yard', 5,  '',        ''),
    s('Plant something',            'Yard', 8,  '',        ''),
    s('Pick up after the dog outside', 'Yard', 5, 'weekly', ''),
    s('Tidy the shed',              'Yard', 12, 'monthly', ''),
    s('Coil the hose up',           'Yard', 2,  'weekly',  ''),
    s('Clean the gutters',          'Yard', 20, 'monthly', 'An adult holds the ladder.'),
    s('Wash the outside windows',   'Yard', 12, 'monthly', ''),
    s('Sweep the garage',           'Yard', 8,  'monthly', ''),
    s('Tidy the garage',            'Yard', 15, 'monthly', ''),

    // --- Vehicle -----------------------------------------------------
    s('Wash the car',               'Vehicle', 20, 'monthly', ''),
    s('Vacuum the car',             'Vehicle', 10, 'monthly', ''),
    s('Clear the rubbish out of the car', 'Vehicle', 4, 'weekly', ''),
    s('Wipe the dashboard',         'Vehicle', 3,  'monthly', ''),
    s('Check the tyre pressures',   'Vehicle', 5,  'monthly', ''),
    s('Fill the washer fluid',      'Vehicle', 3,  'monthly', ''),

    // --- Errands -----------------------------------------------------
    s('Bring the mail in',          'Errands', 1, 'daily',  ''),
    s('Fetch the parcel',           'Errands', 2, '',       ''),
    s('Walk to the shop',           'Errands', 5, '',       ''),
    s('Help carry the shopping',    'Errands', 4, 'weekly', ''),
    s('Return the library books',   'Errands', 4, '',       ''),

    // --- School ------------------------------------------------------
    s('Do your homework',           'School', 5, 'daily',  ''),
    s('Read for 20 minutes',        'School', 3, 'daily',  ''),
    s('Pack your school bag',       'School', 2, 'daily',  ''),
    s('Empty your lunchbox',        'School', 1, 'daily',  'The moment you get in.'),
    s('Lay out tomorrow’s clothes', 'School', 1, 'daily', ''),
    s('Practise your instrument',   'School', 4, 'daily',  ''),

    // --- Helping out -------------------------------------------------
    s('Watch your little brother or sister', 'Helping', 8, '', ''),
    s('Help a sibling with homework', 'Helping', 5, '',      ''),
    s('Tidy the toys away',         'Helping', 3, 'daily',  ''),
    s('Help fold the little one’s clothes', 'Helping', 3, 'weekly', ''),
    s('Read a story to a sibling',  'Helping', 3, '',       ''),

    // --- Anything else -----------------------------------------------
    s('Charge everyone’s devices', 'Other', 1, 'daily',   ''),
    s('Change the air filter',      'Other', 5,  'monthly', ''),
    s('Change a lightbulb',         'Other', 2,  '',        ''),
    s('Test the smoke alarms',      'Other', 4,  'monthly', ''),
    s('Tidy the junk drawer',       'Other', 5,  'monthly', ''),
    s('Sort out the post',          'Other', 3,  'weekly',  ''),
    s('Shred the old paperwork',    'Other', 5,  'monthly', ''),
    s('Wipe down the doorhandles',  'Other', 3,  'weekly',  ''),
    s('Put the shopping list together', 'Other', 3, 'weekly', ''),
    s('Bag up things to donate',    'Other', 8,  '',        ''),
    s('Help with a DIY job',        'Other', 10, '',        ''),
    s('Wipe the stair rail',        'Other', 2,  'weekly',  ''),
    s('Tidy the airing cupboard',   'Other', 6,  'monthly', '')
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
