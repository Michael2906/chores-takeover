# Chore Boar

A household chore board. Chores go into a shared pool, somebody claims one,
works it, and marks it done; a parent account approves the finished work and
points are awarded.

It runs as a **Google Apps Script web app** with a Google Sheet behind it.
Free, no server, no card, no database to run.

---

## How people get in

Two tiers, on purpose.

| | Household account | Sub-account |
| --- | --- | --- |
| Signs in with | Email + password | Tapping their name, then a PIN |
| Works on | Any number of devices | Whatever device is already signed in |
| Needs a Google account | No | No |
| Can | Everything, incl. managing accounts | Claim, work and finish chores |

You create the household once. Signing in on a device trusts that device for
60 days; after that the device only ever shows the **name list**. Everyone in
the family taps their own name, enters a PIN if they have one, and gets their
own view. Nobody but you ever needs an email address or a password.

A sub-account marked **parent** can approve chores and manage accounts too.

### What the PINs actually protect

Be clear-eyed about this. Once the household password has been entered on the
family tablet, whoever is holding that tablet can try the name list. A PIN
stops a sibling tapping your name; it does not stop somebody who has the
device. That is the right size of lock for a house, and it is not more than
that.

What *is* enforced properly is the server side: every action is checked
against a **member token** issued when somebody picked their name. A child
cannot approve their own chore by editing the page — the server rejects it,
regardless of what the browser claims to be.

---

## Setting it up

You need a Google account. A plain gmail is fine. Whichever account you use
owns the spreadsheet and is where any email comes from.

### 1. Push the code

From the repo root. `login` opens a browser for you to approve; nothing is
stored anywhere but your own machine.

```bash
npx --yes @google/clasp@latest login
```

```bash
npx --yes @google/clasp@latest create-script --type webapp --title "Chore Boar" --rootDir apps-script
```

```bash
npx --yes @google/clasp@latest push
```

That uploads the ten files in `apps-script/`, correctly named. Only that
folder goes up — `tools/` and the preview harness stay local.

### 2. Build the spreadsheet

Open the project (`npx @google/clasp open-script`), pick **`setUp`** from the
function dropdown and run it. Approve the permissions prompt the first time.

It creates the spreadsheet, lays out its five sheets, and prints the link.
Running it twice is safe.

### 3. Deploy

**Deploy > New deployment > Web app**

- Execute as: **Me**
- Who has access: **Anyone**

Copy the `/exec` URL. That is the app.

> **Re-deploying after a code change:** Deploy > Manage deployments > pencil
> icon > Version: **New version** > Deploy. The URL stays the same. Using
> **New deployment** instead gives you a *different* URL and everyone stays on
> the old code.

### 4. Create your household

Open the `/exec` URL, choose **Create a household**, and put in your name,
email and a password. Then **Manage accounts** to add everyone else.

### 5. Optional: tidy old sessions

Run `installNightlySweep` once to have expired sign-in tokens cleared nightly.
Purely housekeeping — expired tokens are rejected either way.

---

## thechoreboar.fyi

Apps Script web apps **cannot be given a custom domain**. The URL is always
`script.google.com/macros/s/…/exec`.

The obvious answer — the registrar's own "masked forwarding" — was tried and
**does not work**. It frames the app under your domain, which makes the
`googleusercontent.com` frame that holds the sign-in tokens third-party, and
Safari refuses to let a third-party frame keep `localStorage`. Measured, not
guessed: it asked for the password on **every single visit**.

So `docs/` holds our own wrapper instead, served by GitHub Pages at the
domain. It exists for one reason: it is first-party at `thechoreboar.fyi`, so
*its* storage is honoured. It keeps the tokens and hands them to the app over
`postMessage`, which is not storage-gated.

```
thechoreboar.fyi   <- the wrapper. Holds the tokens. (GitHub Pages, free)
      | postMessage
script.google.com  <- Apps Script
      |
*.googleusercontent.com   <- the app. Storage here is blocked; unused.
```

Opened directly at the `/exec` URL there is no wrapper and `localStorage` is
used exactly as before, so both routes work.

### Setting it up

1. **GitHub → Settings → Pages**, source **Deploy from a branch**, branch
   `main`, folder **`/docs`**.
2. **Custom domain:** `thechoreboar.fyi`. Tick **Enforce HTTPS** once the
   certificate is issued (can take a few minutes).
3. At Porkbun, **delete any URL forwarding** and add DNS records instead:

   | Type | Host | Value |
   | --- | --- | --- |
   | ALIAS/ANAME | (blank) | `michael2906.github.io` |
   | CNAME | `www` | `michael2906.github.io` |

   If ALIAS is unavailable, use four A records to `185.199.108.153`,
   `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.

### Two things to keep in step

- **`docs/index.html` hardcodes the `/exec` URL.** If that URL ever changes,
  update it there too. It only changes if you use *New deployment* instead of
  *Manage deployments > New version*.
- **`CONFIG.WRAPPER_ORIGINS` is an allow-list of who may be handed a live
  session.** Only put origins you control in it. A wrong entry lets that site
  take over accounts.

---

## The files

### `apps-script/` — everything that gets deployed

| File | What it does |
| --- | --- |
| `Config.gs` | **The only file you normally edit.** Branding, sizes of things, email. |
| `Code.gs` | `doGet` serves the page; `call()` is the single door the browser uses. |
| `Auth.gs` | Households, devices, sub-accounts, PINs, sessions, lockouts. |
| `Chores.gs` | Chores and the transitions between their states. |
| `Sheets.gs` | The spreadsheet as a database. |
| `Trough.gs` | The shared daily list and the algorithm that divides it. |
| `Sty.gs` | The daily list everybody gets a copy of. |
| `Daily.gs` | The nightly job that hands both lists out. |
| `PrizeIdeas.gs` | 61 ready-made prizes with costs. |
| `Store.gs` | The Prize Pen, redemptions, and moving points by hand. |
| `Suggestions.gs` | The 147 ready-made chores. Add your own here. |
| `Setup.gs` | `setUp()`, and the housekeeping functions. |
| `Index/Styles/Scripts/Images.html` | The app itself. |

Names matter — `Index`, `Styles`, `Scripts` and `Images` have to be spelled
exactly that or the page will not build.

### `tools/` — local only, never deployed

| File | What it does |
| --- | --- |
| `preview.py` | Renders the templates into `build/preview.html`, plus `build/wrapper.html` for testing the custom-domain bridge. |
| `mock_backend.js` | A small in-memory stand-in for `google.script.run`, used only by the preview. |
| `build_images.py` | Rebuilds `Images.html` from `/images`. Run after changing the logo. |

```bash
.venv/Scripts/python tools/preview.py
```

Then open `build/preview.html`, or serve it:

```bash
.venv/Scripts/python -m http.server -d build 8777
```

Demo sign-in is `demo@example.com` / `password123`; PINs are Sarah `1234`,
Ellie `1111`. The preview is fake data in memory — nothing it does touches the
real spreadsheet.

To exercise the wrapper bridge, serve the same folder on a **second** port and
open the wrapper from that one:

```bash
.venv/Scripts/python -m http.server -d build 8778
```

`http://localhost:8778/wrapper.html` frames the app from `:8777`. Two ports on
purpose — same-origin would let the app's own `localStorage` quietly stand in
for the bridge, which is the one thing the test needs to rule out. With them
split, tokens appearing in `:8778`'s store and **not** `:8777`'s is proof the
bridge carried them.

---

## The two daily lists

Both are **standing lists**: anything added stays until the account holder
takes it off. Neither is filled by hand -- a trigger installed by `setUp()`
hands them both out every night, for every household.

| | The Trough | The Sty |
| --- | --- | --- |
| Shape | One chore, **one person** | One chore, **everybody** |
| For | Shared work -- trash, dishes, the lawn | Your own patch -- your bed, your room, your laundry |
| Shared out? | Yes, balanced and rotated | No, there is nothing to share |

### The nightly hand-out

`dailyFill()` runs at `CONFIG.DAILY_FILL_HOUR` (0 = midnight Central, since
`appsscript.json` sets the timezone to America/Chicago).

> **Apps Script triggers are approximate.** `atHour(0)` means "somewhere in the
> midnight hour", not 00:00:00. Usually within minutes, occasionally later.
> There is no setting that tightens this. The job copes: it works out the date
> itself and does nothing if that date has already gone out, so an early, late,
> repeated or manually-retried run cannot double anybody up.

Useful from the editor:

| Function | What it does |
| --- | --- |
| `checkDailyFill()` | Says whether the trigger is actually installed. |
| `installDailyFill()` | Installs or replaces it. `setUp()` already does this. |
| `fillTodayNow()` | The recovery path -- hands today's chores out immediately, skipping any household that already has them. |

### How the Trough divides

Three rules:

1. **Nobody gets the same chore two days running.** Whoever had the bins
   yesterday is not eligible for the bins today.
2. **Children are favoured over parents** -- they are the ones spending the
   points, so they earn most of them. `CONFIG.CHILD_WEIGHT` sets how hard it
   leans; 2 means a child carries roughly twice a parent's share.
3. **The points come out roughly even** within that weighting, so nobody ends
   the day with three times what everybody else got.

Each person gets a *target share* of the day's points and every chore goes to
whoever is furthest below theirs, biggest chores first.

> The obvious version of this -- track points-so-far over weight, give to the
> lightest -- looks equivalent and is not. At the start everybody sits on zero,
> so the first and biggest chore goes to a uniformly random person, parents
> included. Measured over 400 runs that washed the bias out almost entirely:
> children ended up with 18% more instead of the intended share. Targets are
> known before anything is handed out, so the 20-pointer goes to a child on the
> first pass. Same test after the change: children 17.5 each, parents 7.0.

### The Sty

Everything on it goes to every active member, every day, already assigned --
there is no pool step, because nobody can make somebody else's bed. Set
`CONFIG.STY_PARENTS_TOO` to `false` to make it children-only.

Note that the Sty flattens the point spread: everyone gets the same items, so
the Trough's weighting only applies to the Trough's share. In a test run with
both lists, children finished on 14 points and parents on 11 -- but of that,
the Trough part was 6 to each child and 3 to each parent, exactly the 2:1
intended.

## The Prize Pen

What the points are actually for. The account holder stocks it; anybody spends
what they have earned.

`PrizeIdeas.gs` holds **61 ready-made prizes with costs already set**, offered
in the "add a prize" box. While the pen is empty a **Stock the pen** button
adds a starter dozen spread across the price bands -- a pen with sixty things
in it is worse than one with a dozen, because nothing stands out as worth
saving for.

Costs are pitched against the chore points, where a day's work is roughly
10-25:

| Band | Roughly | For |
| --- | --- | --- |
| 5-15 | a day or two | small and frequent |
| 20-40 | most of a week | the everyday reward |
| 50-100 | a fortnight | an outing, a small toy |
| 150-400 | a month or more | the thing they are saving for |

Points are taken the moment a prize is claimed, and the claim sits in a list
until a parent marks it handed over -- the prize itself happens in the real
world, and the app cannot know when the ice cream was bought. **Refund** puts
the points back and returns a limited prize to the shelf.

The account holder can also move points directly from **Manage accounts >
Points** -- add, subtract, or set outright, with a reason kept in the activity
log. Chores and the store move points on their own; this is for everything
that happens off the board.

---

## Chore identity

Every chore carries three things, so two cards both reading "Take the trash
out" can never be confused with each other:

| | |
| --- | --- |
| `choreId` | The real key. Every action names one, and the server reads title, points and status from **that row** — never from the browser. A chore cannot be talked into paying twice or paying more than it is worth. |
| `ref` | A short per-household number shown on the card (`#42`), so a person can point at one out loud. |
| `seriesId` | Ties a repeating chore to its predecessors. |

## Nothing reposts while it is still owed

The same rule governs all three sources, and it is why the board does not
silently grow:

- **The Trough** skips an item that still has an unfinished chore anywhere. It
  stays with whoever has it until it is approved, or a parent hands it to
  somebody else.
- **The Sty** skips **per person**. Ellie still owing yesterday's bed has
  nothing to do with whether Jack gets today's — she keeps hers, he gets a
  fresh one.
- **Repeating chores** skip a series with anything unfinished in it.

Measured over two nights: night one handed out 18; night two handed out 4 and
carried 14 over, the 4 going to the one person who had finished. Zero
duplicate outstanding chores.

### Trough and Sty chores never reach the pool

They were handed out deliberately, so **Put back** is not offered on them and
the server refuses it. Two reasons: somebody else could pick up work that was
shared out on purpose, and an unassigned chore is still unfinished, so the
nightly job would hand out a second copy alongside it. A parent moves one with
**Give to** instead. Reopening a finished one returns it to the person who had
it rather than to the pool, for the same reason.

They also cannot be given a recurrence — they are already on a daily list, and
a second schedule would post a duplicate every night.

---

## How a chore moves

```
pool --claim--> claimed --start--> in_progress --mark done--> submitted
                  |                    |                          |
              put back              pause                     approve
                  |                    |                          |
                  v                    v                          v
                pool                claimed                     done
```

A submitted chore can also be **sent back** with a note, which returns it to
in-progress.

Repeating chores are **not** respawned on approval. They are posted by the
nightly job alongside the Trough and the Sty, so everything lands at the same
time each day — a weekly chore signed off at four in the afternoon used to
reappear at four in the afternoon, drifting further into the day every week.
The new one is dated today rather than the day it theoretically came due, so a
chore approved late is not born overdue.

**Points are a parent's decision.** Anyone can post a chore, because
volunteering is worth encouraging, but only a parent account sets what it is
worth. Otherwise a child awards itself twenty points for making its own bed.

**Reopening does not claw points back.** The work was done. "Do it again" is
for chores that need doing again.

---

## Things worth knowing

**PEPPER is create-once.** It is generated on first use and stored in script
properties, *not* in the spreadsheet — that is what stops a leaked sheet from
letting anyone test guesses against a 4-digit PIN. If it is ever cleared,
every password and PIN in the file becomes unverifiable and everyone has to be
reset by hand. Do not "regenerate" it.

**Hash iterations are set low (2000) deliberately.** Each iteration is a
JS-to-Java bridge crossing in Apps Script, so it buys much less than it would
elsewhere, and 20,000 makes every PIN entry feel broken. A 4-digit PIN has
10,000 possibilities and no iteration count saves it from an offline guess
anyway — PEPPER is the real defence.

**Email is off by default.** `CONFIG.EMAIL_ON_SUBMIT` will mail the account
holder when work is submitted. A consumer Google account allows about 100
emails a day.

**Claiming is locked.** Two children hitting Claim on the same chore at the
same moment is the whole point of a shared pool, so the claim and the approval
both run inside a `LockService` lock and re-check the status inside it.

---

## History

This started as a static front end — `index.html`, `script.js`, `CSS/` and
`JS/` — that rendered a header and five tabs and nothing else. That layout
cannot work on Apps Script, which serves no static files and cannot resolve ES
module paths, so the CSS moved into `Styles.html`, the JS into `Scripts.html`
as one classic script, and the logo became a data URI. The old files are in
the git history if you want to look at them.
