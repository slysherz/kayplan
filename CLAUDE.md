# Kayplan — instructions for working on it

Kayplan is a tool for one kayak coach to plan a club's training season. [DESIGN.md](DESIGN.md) is the agreed design and the source of truth; read it first. This file says what is built, how the plan files are written, and the rules for changing either.

## Rules

1. **No athlete names, ever.** No name, first name or initials of an athlete goes into any file in this folder, into test data, or into a commit message. The athletes are children and this folder becomes a GitHub repository. The plan is written for plans and age bands, never for individuals. The roster is in the coach's notes at `../provas.md`, outside this folder: read it if needed, copy nothing personal from it. Before every commit run `bash tools/check-names.sh`, which searches this folder and the commit messages for the roster's first names.
2. **Levels.** The tool is built in three levels (DESIGN.md 2.1). Only level 1 is being built. Do not add anything from level 2 or 3 (km, totals, the zone grid, checks from the course tables, scaling, blueprints) until the coach says level 1 works. Prefer a small thing that is right.
3. **The screen stays calm.** The neutral palette and plain text cells of layout B in [mockups/level1-layouts.html](mockups/level1-layouts.html). No explanatory text on the page, no new colours, no icons.
4. **One engine.** Everything worked out from the plan is computed in `src/` and used by both the page and the command line. Nothing is computed only in the page's code.
5. **As few dependencies as possible.** There are none so far: plain JavaScript modules, Node's built-in test runner.
6. **Ask before making commits.**
7. **Check before saying something works.** Run the tests. For the page, render it with headless Firefox and look at the screenshot (there is no Chrome on the coach's machine):
   `firefox --headless --no-remote --profile <temp dir> --screenshot <file> <url>`
   Say plainly what was tested and what was not.

## State

Built (level 1, first step):

- The engine: file format, session notation and main zone, cycle positions, week types and loads, cycle edits, events, today, `check`.
- The command line, `kayplan.js`.
- Tests for all of the above (`npm test`).
- The real 2026–27 season in `season/`: 45 weeks from Monday 28 Sep 2026, three plans, last season's races moved to the matching 2027 weekends as unconfirmed guesses.

Not built yet:

- The page: `index.html`, `src/page.js`, `src/page.css`, the local server `serve.js`, and `src/store-http.js`. See "Next step" below.
- The GitHub store (after the page works on disk).

## Layout

```
DESIGN.md            the design
CLAUDE.md            this file
kayplan.js           command line
src/dates.js         date arithmetic on YYYY-MM-DD strings
src/notation.js      reading session text; main zone
src/cycles.js        week types from patterns, cycle positions, cycle edits
src/format.js        the plan's text files <-> data
src/engine.js        load, sheet, weekView, eventsFor, check
src/report.js        the command line's text output
src/store-disk.js    file access on disk; describes the store interface
test/                node --test
tools/check-names.sh the names check
season/              the plan: only what was typed
mockups/             the layout mockup with dummy data (reference for look and behaviour)
```

## Commands

```
node kayplan.js show season [--plan <id>]              the annual sheet as a table
node kayplan.js show week [n] [--plan <id>] [--band <name>]   a week's sessions with the zone working
node kayplan.js show events                            the races and events table
node kayplan.js check                                  errors and warnings; exit code 1 on errors
npm test
```

- Without `--plan`, every plan is shown. `show week` without a number is the current week.
- `--as-of <YYYY-MM-DD>` runs any command as if today were that date. Today is never stored.
- `--dir <folder>` reads another season folder (the tests use this).
- In `show season`, `>` marks the current week and `*` a week type set by hand.

## Working on the plan

The coach asks for changes in words ("write next week's sessions", "the Nacional de Fundo moved a week later"). To make them:

1. Look first: `show season`, `show week n`, `show events`.
2. Edit the text files in `season/`.
3. Run `node kayplan.js check`, then `show` again to see the worked-out values.

Never store anything that is worked out: week positions of cycles, week types that follow a pattern, loads, main zones, today.

## The plan files

One shape throughout: a head line, then indented lines that belong to it. No comments. A line the tool cannot read is an error in `check`. Files are written back in one canonical order and spacing; hand edits in any order are read fine. Paths are lower case, letters, digits and hyphens, ending in `.txt`.

### `season/season.txt`

```
start: 2026-09-28
weeks: 45
```

`start` must be a Monday. Week 1 starts there; weeks are a fixed grid.

### `season/tables.txt`

```
load  I 60  C 80  CH 100  R 50  AT 55  CT 40
reference  R0 60'  R1 120'  R2 60'  R3 30'  R3+ 15'  R4 10'  R5 4'30''  R6 2'  R7 10'
pace default  R0 7  R1 9.5  R2 11  R3 12  R3+ 12.8  R4 13.5  R5 14.5  R6 16  R7 13
pace junior  R1 10  R2 11.5
place 1km Sede-Foz
```

- `load`: load % per week type. The types listed here are the valid week types.
- `reference`: what one full session of each zone is, used to find the main zone (DESIGN.md 8.1.1).
- `pace`: km/h per zone. `pace default` must give every zone; `pace <band>` overrides single zones for one age band.
- `place`: a landmark distance. Its name, written in a session, stands for the distance.

### `season/events.txt`

```
2027-03-20 Campeonato Nacional de Fundo
  until: 2027-03-21
  confirmed: no
  place: Mirandela
  kind: race
  type: fundo
  boats: mixed
  plans: juniors 1, cadetes 2

2026-12-21 Christmas
  until: 2027-01-03
  kind: holiday
```

- Head: the date and the name. `until` for more than one day. `confirmed: no` when the date is a guess.
- `kind`: race, test, camp, holiday, no-water.
- Races need `type` (sprint, fundo, maratona) and `boats` (solo, crew, mixed), and `plans` lists the plans aimed at it with the importance of each, 1 (most) to 3.
- Other events: `plans: juniors, cadetes` limits them to those plans; no `plans` line means every plan.
- Events never move when cycles are edited.

### `season/plans/<plan>/plan.txt`

```
name: Juniors
bands: junior, senior
```

The folder name is the plan's id. A plan is everyone aiming at the same races; its bands are the age categories that train in it, each with its own sessions.

### `season/plans/<plan>/cycles.txt`

```
Macrocycle I
  5 intro  R1-R2  General I
  4 build  R2     General II
Macrocycle II
  36 none  -  Unplanned
```

A macrocycle name, then its mesocycles in order: weeks, load pattern, contents, name. Contents are zones R1 to R7 joined with `-`, or `-` for none. The weeks must add up to the season's. This is the whole cycle structure.

Load patterns give each week its type by its position in the mesocycle:

| Pattern | Weeks |
|---|---|
| `build` | C … C CH R (a 2-week block is C R, a 1-week block is C) |
| `intro` | I, then as build |
| `restart` | R C … C CH |
| `comp` | C … C AT CT |
| `recovery` | R R … |
| `none` | no type and no load: time that is not planned yet |

### `season/plans/<plan>/weeks.txt`

```
2026-11-16 R
2026-12-28 R 30
```

Only weeks whose type was set by hand: the week's Monday, the type, and a load % when it should differ from the type's. Delete the line to make the week follow its pattern again.

### `season/plans/<plan>/sessions.txt`

```
2026-10-10 am junior: 3x 2000m R2
2026-10-10 am senior: 3x 2000m R2
2026-10-11 am junior: 1km R1 + 8x 4' R2/1' R0 + 1km R1
  K2 on the last four reps
2026-10-14 pm junior not-done: 6km R1 + 4x(15'' R7 + 15'' R0)
  no water
```

- Head: date, slot (`am` or `pm`), band, then `not-done` if it did not happen. Everything after the first colon is the plan text, on one line, in the notation of DESIGN.md 8.1.
- Indented lines are notes.
- One session per date, slot and band.
- A session whose date has passed counts as done unless it is marked `not-done`.
- Write the zone next to the work (`6km R1`): the main zone is worked out from the text and never stored. Work with no zone is not counted; `show week` prints it as "no zone".

## Rules the engine applies

- **Main zone** (`infer` in `src/notation.js`): time per zone, distances turned into time with the band's pace, divided by the zone's reference volume; the largest share wins; R0 only when no other zone appears. Rest with a zone counts toward it; rest without one counts toward nothing. An F variant (`R1F`) is read as its base zone; `R2+` as R2, `R6+` as R6; only `R3+` is its own zone.
- **Rep ranges** `(7-10)x` count as their middle. `OU` (alternatives) is not understood.
- **The past is locked for cycles.** A boundary can be moved, created or removed only at or after the end of the last week that has ended; a block can be moved only if it and its neighbour have not started. Names, contents, patterns, week types and session text can still be changed.
- **Moving a block** swaps it with its neighbour and carries its hand-set weeks and sessions with it, shifted by whole weeks. Macrocycles keep their place. Use `moveMeso` in `src/cycles.js` for this instead of editing dates by hand.

## Decisions made while building, not yet in DESIGN.md

- The pattern `none` for unplanned time (DESIGN.md 6.4 lists five patterns).
- Splitting a block copies its pattern to the new block (the mockup always gave the new block `build`).
- `check` reports invalid files and plan-level warnings (a race outside the season, a race in no plan, a past race whose date was never confirmed). A session with no zone is shown in `show week` and is not a `check` warning, so that off-water sessions (yoga, pool) do not flood it.
- Events that are not races have a one-letter code: `t` test, `c` camp, `h` holiday, `x` no water.
- Saving checks the revision that was read (`store.write(path, text, rev)`), so a stale copy never overwrites newer text. GitHub's file API works the same way.
- Level 1 shows the time found per zone for a session, but no km. Km are level 2.

## Waiting for the coach

- `pace default` in `tables.txt` holds invented placeholder speeds from the mockup. They only matter when a session mixes distances and times.
- The `load` percentages are also the mockup's.
- In `events.txt`, every race has importance 2 and a guessed `boats`; `type` is guessed from the name. The three Esperanças races are entered as `fundo`, `mixed` (mass-start lap races of 1 to 6 km by age). Dates are last season's weekends moved to 2027, all `confirmed: no`.
- No landmarks yet (the coach chose to start without them).
- Changing a block's length or pattern can change the type of weeks that have already ended, because types follow the pattern. The design does not say whether past week types should be frozen.

## Next step: the page

Layout B of the mockup, on the engine, for level 1 only:

- `serve.js`: a local server with Node built-ins only. It serves the page and reads and writes the files in `season/` through the disk store. Listen on 127.0.0.1 only and refuse requests from other origins.
- `src/store-http.js`: the same four store functions for the page, through that server.
- The annual sheet with these rows: month, Monday, races, macrocycle, mesocycle, content, microcycle, type, load. Not the Km row, the zone grid or the zone hover cards (level 2).
- Cycle editing as in the mockup (drag a boundary, the edit panel), calling the edits in `src/cycles.js`, with the past locked.
- The selected week and the selected session under the sheet; type and load set by hand; the "not done" mark.
- The races and events table as a separate view.
- A selector for plan and age band; the current week marked, and a "Today" control.
- Live reload: redraw when a file changes on disk.
- The page must not save a file that has errors.
