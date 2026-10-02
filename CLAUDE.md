# Kayplan — instructions for working on it

Kayplan is a tool for one kayak coach to plan a club's training season. [DESIGN.md](DESIGN.md) is the agreed design and the source of truth; read it first. This file says what is built, how the plan files are written, and the rules for changing either.

## Rules

1. **No athlete names, ever.** No name, first name or initials of an athlete goes into any file in this folder, into test data, or into a commit message. The athletes are children and this folder becomes a GitHub repository. The plan is written for plans and age bands, never for individuals. The roster is in the coach's notes at `../provas.md`, outside this folder: read it if needed, copy nothing personal from it. Before every commit run `bash tools/check-names.sh`, which searches this folder and the commit messages for the roster's first names.
2. **Levels.** The tool is built in three levels (DESIGN.md 2.1), and a level is only started when the coach says the one above works. Level 1 is accepted. Level 2 is being built in steps the coach tries one at a time (see State). Do not add anything from level 3 (scaling, blueprints, generated plans) or from DESIGN.md section 9. Prefer a small thing that is right.
3. **The screen stays calm.** The neutral palette and plain text cells of layout B in [mockups/level1-layouts.html](mockups/level1-layouts.html). No explanatory text on the page, no new colours, no icons.
4. **One engine.** Everything worked out from the plan is computed in `src/` and used by both the page and the command line. Nothing is computed only in the page's code.
5. **As few dependencies as possible.** There are none so far: plain JavaScript modules, Node's built-in test runner.
6. **Ask before making commits.**
7. **Check before saying something works.** Run `npm test`. For the page, run `npm run page-check` and look at the screenshots it leaves (headless Firefox; there is no Chrome on the coach's machine). Say plainly what was tested and what was not.

## State

Built:

- **Level 1** (accepted by the coach on 2026-10-02): the engine, the command line `kayplan.js`, and the page served by `serve.js` from the files on this computer: the annual sheet, cycle editing, the selected week and session, the races and events table, live reload.
- **Level 2, step 1: km** (DESIGN.md 7.0 and 8.2). Km counted from the sessions, per zone, week and season; one km estimate per microcycle from the yearly km; the Km row on the sheet; the week's km against its estimate; each piece of a session with its other unit; a place per session, so that work off the water gives minutes and no km.
- **Level 2, step 2: the capacity grid** (DESIGN.md 7.1). Under the Km row, one row per zone and one cell per week, showing sessions or km with a switch. A sessions cell is shaded developing, maintaining or below maintenance by the course's sessions a week. Hovering or focusing a zone name opens its card.
- Tests for the engine, the command line and the server (`npm test`), and a check of the page in headless Firefox (`npm run page-check`).
- The real 2026–27 season in `season/`: 45 weeks from Monday 28 Sep 2026, three plans, last season's races moved to the matching 2027 weekends as unconfirmed guesses.

Next: nothing is agreed yet. The first cut of level 2 (sections 7.0, 7.1 and 8.2) is built; the coach tries it before anything else is added.

Not built:

- **Frozen estimates.** DESIGN.md 6.7 says estimates of weeks that have ended are frozen. They are not: every estimate follows the plan as it is now, so changing a future block also changes past estimates. Freezing needs the estimate of each ended week to be stored, and the design stores nothing that is worked out. The coach has been told; it waits for a decision.
- The checks of DESIGN.md section 9, and anything from level 3.
- The GitHub store, for use from two computers and a phone (DESIGN.md 6.5). It implements the store interface described in `src/store-disk.js`, and the page then needs a sign-in and a layout for the phone.
- A commit per save. On this computer a save only writes the file; commits are made by hand (ask first).

## Layout

```
DESIGN.md            the design
CLAUDE.md            this file
kayplan.js           command line
serve.js             local server for the page
index.html           the page
src/dates.js         date arithmetic on YYYY-MM-DD strings
src/notation.js      reading session text; main zone
src/cycles.js        week types from patterns, cycle positions, cycle edits
src/edits.js         edits to weeks, sessions and events
src/format.js        the plan's text files <-> data
src/engine.js        load, sheet, weekView, eventsFor, check, fileText
src/km.js            km counted from sessions; the km estimate per microcycle
src/grid.js          the capacity grid: sessions and km per zone and week, and their state
src/zones.js         the zone cards: what each zone is, from the course slides
src/report.js        the command line's text output
src/store-disk.js    file access on disk; describes the store interface
src/store-http.js    the same interface for the page, through serve.js
src/page.js, page.css  the page: draws what the engine works out, turns clicks into edits
test/                node --test; test/page-season is the season the page check runs on
tools/check-names.sh the names check
tools/page-check.mjs the page check; tools/firefox.mjs drives headless Firefox for it
season/              the plan: only what was typed
mockups/             the layout mockup with dummy data (reference for look and behaviour)
```

## Commands

```
node serve.js                                          the page, at http://127.0.0.1:8137/
node kayplan.js show season [--plan <id>]              the annual sheet as a table
node kayplan.js show week [n] [--plan <id>] [--band <name>]   a week's sessions with the zone working
node kayplan.js show grid [--plan <id>] [--band <name>]   the capacity grid: sessions and km per zone and week
node kayplan.js show zone <zone>                       a zone's card: what it is and how the course trains it
node kayplan.js show events                            the races and events table
node kayplan.js check                                  errors and warnings; exit code 1 on errors
npm test                                               engine, command line and server
npm run page-check                                     the page, in headless Firefox (about two minutes)
```

- Without `--plan`, every plan is shown. `show week` without a number is the current week.
- `--as-of <YYYY-MM-DD>` runs any command as if today were that date. Today is never stored. The page takes `?asof=YYYY-MM-DD` in its address for the same purpose.
- `--dir <folder>` reads another season folder; `serve.js` takes `--dir` and `--port` too. Use these to try things on a copy and never experiment in `season/`.
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
yearly  junior 2220  senior 2581  cadete 1605  iniciado 274
hard  R1 12  R2 12  R3 6  R3+ 3.2  R4 2.2  R5 1  R6 0.5
race  sprint 1.4  fundo 6  maratona 13.5
warmup 2
develop  R1 4-6  R2 3-4  R3-R3+ 2-3  R4-R5 2-4  R6 3-4
maintain  R1 3  R2 2  R3-R3+ 1  R4-R5 1  R6 1-2
zones junior  R1 R2 R3 R3+ R5 R6 R7
place 1km Sede-Foz
```

- `load`: load % per week type. The types listed here are the valid week types.
- `reference`: what one full session of each zone is, used to find the main zone (DESIGN.md 8.1.1).
- `pace`: km/h per zone. `pace default` must give every zone; `pace <band>` overrides single zones for one age band. Paces turn times into km and distances into time.
- `yearly`: water km per season for a band. A band with no figure gets no estimates.
- `hard`, `race`, `warmup`: the content factor table of DESIGN.md 7.0. `hard` is the km of work in a hard session of each content, `race` the same for race pace by the type of race aimed at, `warmup` the km added to every session.
- `develop`, `maintain`: sessions a week to develop and to maintain each content, as ranges. They are the course's table (slide 188, "Nº Sessões/CT"). Zones joined with `-` are one content and are counted together. One table for every band.
- `zones`: the zones suggested for a band's age: those with km in that category's column of the course's long-term table (slide 172). The grid dims the others. A band with no line has nothing dimmed.
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
2026-10-15 pm junior pool: 10' R1 + 3x 10' R2/3'
```

- Head: date, slot (`am` or `pm`), band, then the place when it is not the water (`pool`, `gym`, `land`), then `not-done` if it did not happen. Everything after the first colon is the plan text, on one line, in the notation of DESIGN.md 8.1.
- Indented lines are notes.
- One session per date, slot and band.
- A session whose date has passed counts as done unless it is marked `not-done`.
- Write the zone next to the work (`6km R1`): the main zone and the km are worked out from the text and never stored. Work with no zone has no main zone; `show week` prints it as "no zone".
- Off the water, write the work in time with its zone (`3x 10' R2/3'`). It counts for the main zone, gives minutes and no km.

## Rules the engine applies

- **Main zone** (`infer` in `src/notation.js`): time per zone, distances turned into time with the band's pace, divided by the zone's reference volume; the largest share wins; R0 only when no other zone appears. Rest with a zone counts toward it; rest without one counts toward nothing. An F variant (`R1F`) is read as its base zone; `R2+` as R2, `R6+` as R6; only `R3+` is its own zone.
- **Rep ranges** `(7-10)x` count as their middle. `OU` (alternatives) is not understood.
- **Km of a session** (`infer`): distances as written, times at the band's pace for the zone. R0 is left out. A distance with no zone counts toward the session's total and toward no zone; a time with no zone gives no km. A session off the water gives no km: its written time counts as minutes off the water, and its distances count for nothing.
- **Km of a week and a season** (`kmView` in `src/km.js`): the sum over the band's sessions on the water that are not marked `not-done`. Season km are split into done (sessions before today) and planned (from today on).
- **Km estimate per microcycle** (`kmView`): yearly km × coefficient ÷ sum of all coefficients, with coefficient = load % × content factor. The content factor is (hard-session km of the content + warm-up) ÷ (the same for R2); several contents average; no content is 1. An R7 block takes its km from the race it is aimed at: the most important race inside the block, else the next one after it, else the season's last race. A week that is not planned yet (no load) counts as an average planned week.
- **Capacity grid** (`gridView` in `src/grid.js`): a week's sessions of a zone are the band's sessions whose main zone is that zone, on or off the water, not marked `not-done`. The state of a cell is judged on the sessions of its whole content that week (R3 with R3+, R4 with R5): developing from the lower end of `develop`, maintaining from the lower end of `maintain`, else below maintenance. R7 has no counts in the course table, so it is never shaded. Every zone from R1 to R7 always has a row, so the grid is there before anything is planned and nothing moves when a session is typed.
- **The past is locked for cycles.** A boundary can be moved, created or removed only at or after the end of the last week that has ended; a block can be moved only if it and its neighbour have not started. Names, contents, patterns, week types and session text can still be changed.
- **Moving a block** swaps it with its neighbour and carries its hand-set weeks and sessions with it, shifted by whole weeks. Macrocycles keep their place. Use `moveMeso` in `src/cycles.js` for this instead of editing dates by hand.

## Decisions made while building, not yet in DESIGN.md

- The pattern `none` for unplanned time (DESIGN.md 6.4 lists five patterns).
- Splitting a block copies its pattern to the new block (the mockup always gave the new block `build`). Splitting unplanned time (`none`) leaves both parts with its name.
- `check` reports invalid files and plan-level warnings (a race outside the season, a race in no plan, a past race whose date was never confirmed). A session with no zone is shown in `show week` and is not a `check` warning, so that off-water sessions (yoga, pool) do not flood it.
- Events that are not races have a one-letter code: `t` test, `c` camp, `h` holiday, `x` no water.
- Saving checks the revision that was read (`store.write(path, text, rev)`), so a stale copy never overwrites newer text. GitHub's file API works the same way.
- A session has a place: water (not written), pool, gym or land. Decided by the coach on 2026-10-02: off the water is not counted for km, but counts for capacities. This replaces the Rg idea of DESIGN.md 3.1 for counting.
- A week that is not planned yet counts as an average planned week in the km estimates. Without this, a rough plan with five planned weeks would share the whole year's km among those five.
- Time written with no zone gives no km (the mockup used an invented 10 km/h).
- The grid has one row per zone (as designed), but the state is judged per content of the course table, so one R3 and one R3+ session in a week show both rows as developing.
- The upper ends of the course's ranges (4–6, 2–3) are kept in the table and shown in the zone cards; they do not change a cell's shade. The course's limit for R7 (at most 2 sessions per microcycle in preparation, 4 in the competitive period) is in the R7 card only.
- `zones menor  R1 R6` is an assumption (the same as Iniciado): the course's long-term table has no column for Menor.
- A block after the last race aims at the last race (as the mockup does); in a plan with no races, R7 counts like R2.

## Waiting for the coach

- `pace default` in `tables.txt` holds invented placeholder speeds from the mockup. Since level 2 they decide every km that is written as time, so they matter: ask for real ones per band.
- `yearly` holds the course's high-performance figures (the coach chose them as a starting point). With two to four sessions a week the estimates sit well above what the sessions cover.
- The `load` percentages are the mockup's. The figures in `hard`, `race` and `warmup` are the table of DESIGN.md 7.0, of which three are assumptions (open question 7).
- In `events.txt`, every race has importance 2 and a guessed `boats`; `type` is guessed from the name. The three Esperanças races are entered as `fundo`, `mixed` (mass-start lap races of 1 to 6 km by age). Dates are last season's weekends moved to 2027, all `confirmed: no`.
- No landmarks yet (the coach chose to start without them).
- Changing a block's length or pattern can change the type of weeks that have already ended, because types follow the pattern. The design does not say whether past week types should be frozen. The same goes for km estimates (see State).
- The thresholds of the capacity grid are the course's for every band (the coach's choice, 2026-10-02). The course's counts assume near-daily training; if a band needs its own, the table has to grow a band, like `pace`.

## The page

`src/page.js` holds no rules. It asks the engine for what to draw (`sheet`, `weekView`, `eventView`, `check`), and every change goes through an edit function in `src/cycles.js` or `src/edits.js`, then `fileText` and the store. To change behaviour, change the engine and its tests; to change the look, change `page.js` and `page.css`.

- **Saving.** An edit is applied in memory, drawn, and its file written: at once for clicks, after a short pause for typing. A write carries the revision that was read; if the file changed on disk meanwhile, the write is refused, the page reloads from disk and says so. A file with a line that cannot be read is never saved from the page.
- **Live reload.** The page asks the server every two seconds whether any file changed and reloads the plan when one did. Edit the files while the page is open and the change appears.
- **Where you are** (plan, band, week, view) is kept in the address after `#`, so a reload stays put.
- **On the sheet:** a week type set by hand is bold; the current week has its Monday underlined; a boundary that cannot move has no handle. Events that are not races show as one plain letter in the Races row.
- **Km row:** the number in a cell is the week's estimate, and the cell fills from the bottom as the week's sessions cover it. With no estimate it shows the km from the sessions. How an estimate was worked out is in the cell's hover text.
- **Capacity grid:** dark is developing, light is maintaining, an outline is below maintenance. A zone that is not suggested for the band's age has its name dimmed; its sessions are still counted and shaded. The Sessions/Km switch changes what the cells show, not the rows. The counts behind a shade are in the cell's hover text.
- **Checking it.** `npm run page-check` clicks, types and drags through the page in headless Firefox on a copy of `test/page-season`, and checks the files that were saved. It leaves screenshots in a temporary folder and prints the path: look at them after changing the page. Add a step there for each new behaviour. The one-shot `firefox --screenshot` is of little use here, because it captures the page before the plan has loaded.
