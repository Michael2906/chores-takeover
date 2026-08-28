/**
 * Chore Boar -- ready-made prizes for The Prize Pen.
 *
 * So nobody has to sit down and invent a reward scheme from nothing. Picking
 * one in the "add a prize" box fills the cost in; "Stock the pen" adds a
 * sensible starter set in one go. Everything stays editable afterwards.
 *
 * ABOUT THE COSTS. They are pitched against the chore points in
 * Suggestions.gs, where a day's work is roughly 10-25 points. So:
 *
 *     5-15    a day or two of chores      small, frequent, keeps interest up
 *    20-40    most of a week              the everyday reward
 *    50-100   a fortnight                 an outing, a small toy
 *   150-400   a month or more             the thing they are saving for
 *
 * If your household earns points faster or slower, scale the lot -- the
 * ordering matters more than the numbers.
 *
 * Returned from a function rather than a top-level var so nothing depends on
 * which order Apps Script evaluates the files in.
 */
function prizeIdeas() {
  return [

    // --- Screen time and games ---------------------------------------
    z('30 minutes of extra screen time',         10,   'Screen time'),
    z('An hour of extra screen time',            18,   'Screen time'),
    z('Pick tonight’s movie',                    20,   'Screen time'),
    z('A games night of your choosing',          25,   'Screen time'),
    z('Extra hour on the console',               18,   'Screen time'),
    z('Choose the music in the car',             8,    'Screen time'),
    z('Phone in your room for an evening',       30,   'Screen time'),

    // --- Food ---------------------------------------------------------
    z('An ice cream',                            15,   'Food'),
    z('Pick the dessert',                        10,   'Food'),
    z('Choose what is for dinner',               25,   'Food'),
    z('Takeout of your choosing',                60,   'Food'),
    z('Bake something together',                 25,   'Food'),
    z('A milkshake on the way home',             18,   'Food'),
    z('Breakfast out at the weekend',            50,   'Food'),
    z('A pack of your favorite candy',           12,   'Food'),
    z('Pizza night',                             55,   'Food'),
    z('Hot chocolate with everything on it',     8,    'Food'),

    // --- Time off -----------------------------------------------------
    z('Skip one chore',                          40,   'Time off'),
    z('Skip the dishes tonight',                 20,   'Time off'),
    z('A whole chore-free day',                  120,  'Time off'),
    z('Swap a chore with someone',               25,   'Time off'),
    z('Get out of taking the trash out',         15,   'Time off'),
    z('Sleep in on the weekend',                 20,   'Time off'),

    // --- Bedtime ------------------------------------------------------
    z('Stay up 30 minutes later',                20,   'Bedtime'),
    z('Stay up an hour later',                   35,   'Bedtime'),
    z('One extra bedtime story',                 8,    'Bedtime'),
    z('Camp out in the living room',             45,   'Bedtime'),
    z('A sleepover with a friend',               100,  'Bedtime'),

    // --- Days out -----------------------------------------------------
    z('A trip to the park',                      25,   'Days out'),
    z('A trip to the library',                   20,   'Days out'),
    z('Swimming',                                50,   'Days out'),
    z('The movies',                              90,   'Days out'),
    z('Bowling',                                 90,   'Days out'),
    z('A day at the zoo',                        200,  'Days out'),
    z('Mini golf',                               70,   'Days out'),
    z('A trip to the museum',                    45,   'Days out'),
    z('An afternoon at the beach',               110,  'Days out'),
    z('Trampoline park',                         120,  'Days out'),

    // --- Money and things ---------------------------------------------
    z('$1 allowance',                            20,   'Money'),
    z('$5 allowance',                            90,   'Money'),
    z('$10 allowance',                           170,  'Money'),
    z('A small toy',                             80,   'Money'),
    z('A book of your choosing',                 70,   'Money'),
    z('A new game',                              300,  'Money'),
    z('Something from the dollar store',         35,   'Money'),
    z('A magazine',                              30,   'Money'),
    z('Craft supplies',                          60,   'Money'),
    z('A new set of pens',                       40,   'Money'),

    // --- Privileges ---------------------------------------------------
    z('Front seat for a week',                   30,   'Privileges'),
    z('Choose the weekend outing',               75,   'Privileges'),
    z('Be in charge of the remote for a night',  20,   'Privileges'),
    z('Pick where we sit at dinner',             6,    'Privileges'),
    z('Have a friend over',                      60,   'Privileges'),
    z('Redecorate a corner of your room',        250,  'Privileges'),
    z('A day where you set the rules',           200,  'Privileges'),
    z('Choose the family board game',            12,   'Privileges'),

    // --- Together -----------------------------------------------------
    z('An hour doing something with Mom or Dad', 30,   'Together'),
    z('A bike ride together',                    25,   'Together'),
    z('Build something together',                45,   'Together'),
    z('A walk somewhere new',                    30,   'Together'),
    z('Teach me one of your games',              15,   'Together')
  ];
}

/** Shorthand so the list above stays readable. */
function z(name, cost, notes) {
  return { name: name, cost: cost, notes: notes };
}

/**
 * The starter set "Stock the pen" adds.
 *
 * A spread across the price bands rather than the whole list -- a pen with
 * sixty things in it is worse than one with a dozen, because nothing stands
 * out as worth saving for.
 */
function starterPrizes() {
  var want = [
    '30 minutes of extra screen time',
    'An ice cream',
    'Pick tonight’s movie',
    'Stay up 30 minutes later',
    'Choose what is for dinner',
    'A trip to the park',
    'Skip one chore',
    'Swimming',
    '$5 allowance',
    'The movies',
    'A small toy',
    'A day at the zoo'
  ];

  var byName = {};
  prizeIdeas().forEach(function (p) { byName[p.name] = p; });

  return want.map(function (n) { return byName[n]; })
             .filter(function (p) { return !!p; });
}
