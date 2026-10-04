# Kayplan — instructions for working on it

Kayplan is a tool for one kayak coach to plan a club's training season. [DESIGN.md](DESIGN.md) is the agreed design and the source of truth; read it first. This file says what is built, how the plan files are written, and the rules for changing either.

## Rules

1. **No athlete names, ever.** No name, first name or initials of an athlete goes into any file in this folder, into test data, or into a commit message. The athletes are children and this folder becomes a GitHub repository. The plan is written for plans and age bands, never for individuals. The roster is in the coach's notes at `../provas.md`, outside this folder: read it if needed, copy nothing personal from it. Before every commit run `bash tools/check-names.sh`, which searches this folder and the commit messages for the roster's first names.
2. **Levels.** The tool is built in three levels (DESIGN.md 2.1), and a level is only started when the coach says the one above works. Level 1 is accepted. Level 2 is being built in steps the coach tries one at a time (see State). Session suggestions (DESIGN.md 8.4) were asked for by the coach on 2026-10-03 and are built. Do not add anything else from level 3 (scaling, generated plans) or from DESIGN.md section 9 unless the coach asks. Prefer a small thing that is right.
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
- **Level 2, step 3: checks of sessions and weeks** (the coach asked for these from DESIGN.md section 9 on 2026-10-02). What the course would question about a session (a zone not for that age, the order of contents, repetition length, rest, too much of a zone, R3 before the warm-up is done) and about a week (hard sessions under 48 h apart, quality in the afternoon, too many R7 sessions, a block content with no session, intensity in a recovery week, the days around a race, the taper). They are words on the page and in `show week` and `show checks`; nothing is refused. The season-level checks of section 9 (order of blocks, residual effects before a race, build times) were offered and turned down.
- **Zone cards from the course reference** (`docs/course-reference.md`): intensity markers, place in the session and the season, kinds of work for R6 and R7, the resisted variants inside each card, km a year per category. A click keeps a card open.
- **Session suggestions** (DESIGN.md 8.4, asked for by the coach on 2026-10-03): `season/library.txt` holds sessions shared by every plan and band (the coach's old sessions and the course's model sessions). A session with no work written shows a short list in its editor, filtered to the week and ordered by how likely each is to be picked (see "Rules the engine applies"). The reader understands ranges (`2-4x`, `10-20'`).
- **The plan on GitHub** (DESIGN.md 6.5, asked for by the coach on 2026-10-04): `src/store-github.js` reads and writes the plan's files in a folder of a GitHub repository; the page uses it whenever it is not served from this computer, asks once per browser for the repository and a token, and on a phone shows a simple page of the day's sessions. Pushed on 2026-10-04: this folder to the private `slysherz/kayplan-rioneiva-2027`, `site/` to the public `slysherz/kayplan` (push only when the coach says so). `npm run site` builds the page as plain files for GitHub Pages. [HOSTING.md](HOSTING.md) has the steps. It has only been run against a GitHub in memory (`test/fake-github.js`), never against the real one: the coach has to create the repositories and the token.
- Tests for the engine, the command line and the server (`npm test`), and a check of the page in headless Firefox (`npm run page-check`).
- The real 2026–27 season in `season/`: 45 weeks from Monday 28 Sep 2026, three plans, last season's races moved to the matching 2027 weekends as unconfirmed guesses.

Next: nothing is agreed yet. The first cut of level 2 (sections 7.0, 7.1 and 8.2) is built; the coach tries it before anything else is added.

Not built:

- **Frozen estimates.** DESIGN.md 6.7 says estimates of weeks that have ended are frozen. They are not: every estimate follows the plan as it is now, so changing a future block also changes past estimates. Freezing needs the estimate of each ended week to be stored, and the design stores nothing that is worked out. The coach has been told; it waits for a decision.
- The rest of DESIGN.md section 9 (season-level checks, monitoring, load curves), and anything from level 3.
- A commit per save on this computer. Through `serve.js` a save only writes the file; commits are made by hand (ask first). Through GitHub every save is a commit.

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
src/checks.js        what the course would question about a session and a week
src/suggest.js       the sessions suggested for a slot: library.txt and the band's own sessions, filtered and ordered
src/zones.js         the zone cards: what each zone is, from the course slides
src/lang.js          the page's words in English and Portuguese: tr(), dec(), the Portuguese table
src/report.js        the command line's text output
src/store-disk.js    file access on disk; describes the store interface
src/store-http.js    the same interface for the page, through serve.js
src/store-github.js  the same interface for the page, through GitHub's API: a folder of a repository
src/page.js, page.css  the page: draws what the engine works out, turns clicks into edits
test/                node --test; test/page-season is the season the page check runs on
tools/check-names.sh the names check
tools/page-check.mjs the page check; tools/firefox.mjs drives headless Firefox for it
tools/hosted-check.mjs the same for the page as hosted: the built site against a GitHub in memory, and a phone-sized window
tools/build-site.mjs builds site/ (not in git): index.html and the modules the page loads, for a static host
HOSTING.md           how the page and the plan are put on GitHub
season/              the plan: only what was typed
mockups/             the layout mockup with dummy data (reference for look and behaviour)
docs/                the course slides as text: course-reference.md by topic, course-slides-1.md in slide order
```

For a training rule or number, look in `docs/course-reference.md` first (one card per zone, then session, microcycle, mesocycle, season, ages, monitoring; every figure has its slide number). `docs/course-slides-1.md` has the full tables and the slides' own wording. Both cover part 1 of the course only.

## Commands

```
node serve.js                                          the page, at http://127.0.0.1:8137/
node kayplan.js show season [--plan <id>]              the annual sheet as a table
node kayplan.js show week [n] [--plan <id>] [--band <name>]   a week's sessions with the zone working
node kayplan.js show day [date]                        what every plan does on one day (today without a date)
node kayplan.js show grid [--plan <id>] [--band <name>]   the capacity grid: sessions and km per zone and week
node kayplan.js show checks [--plan <id>] [--band <name>]   what the course would question, week by week
node kayplan.js show suggestions <date> <am|pm> [--plan <id>] [--band <name>] [--zone <zone>] [--find <words>] [--place <place>]   the sessions suggested for a slot
node kayplan.js show zone <zone>                       a zone's card: what it is and how the course trains it
node kayplan.js show types                             what each week type is for, with its load
node kayplan.js show events                            the races and events table
npm run site                                           builds site/ for GitHub Pages (HOSTING.md)
npm run hosted-check                                   checks the hosted page in headless Firefox against a GitHub in memory
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
plans: iniciados, cadetes, juniors
```

`start` must be a Monday. Week 1 starts there; weeks are a fixed grid. `plans` is optional: the order the plans are shown in, everywhere (the pills, the events table and its rows of races, `show season`). Plans it does not list come after, by id.

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
rep  R2 2'-60'  R3 1'-7'  R3+ 20''-3'  R4 20''-3'  R5 10''-1'30''  R6 4''-30''
rest  R3 1  R3+ 1  R4 3  R5 3'  R6 3'
recovery  R1 24  R2 24  R3-R3+ 48  R4-R5 48  R6 24
warm  R3 30'  R3+ 30'
race-pace 2 4
most 1.5
zones junior  R1 R2 R3 R3+ R5 R6 R7
zone-km junior  R1 892  R2 961  R3 245.5  R3+ 75.35  R5 8.6  R6 9.6  R7 28
place 1km Sede-Foz
```

- `load`: load % per week type. The types listed here are the valid week types.
- `reference`: what one full session of each zone is, used to find the main zone (DESIGN.md 8.1.1).
- `pace`: km/h per zone. `pace default` must give every zone; `pace <band>` overrides single zones for one age band. Paces turn times into km and distances into time.
- `yearly`: water km per season for a band. A band with no figure gets no estimates.
- `hard`, `race`, `warmup`: the content factor table of DESIGN.md 7.0. `hard` is the km of work in a hard session of each content, `race` the same for race pace by the type of race aimed at, `warmup` the km added to every session.
- `develop`, `maintain`: sessions a week to develop and to maintain each content, as ranges. They are the course's table (slide 188, "Nº Sessões/CT"). Zones joined with `-` are one content and are counted together. One table for every band.
- `rep`, `rest`, `recovery`, `warm`, `race-pace`, `most`: what the checks compare with (`src/checks.js`). All are optional, and a check whose line is missing is off: delete a line to silence that check. `rep` is how long one repetition of a zone lasts; the ranges take in everything the course writes for the zone (its zone slides, its methods table and its model sessions), so they are wider than the single figure of slide 145. `rest` is the least rest after a repetition, as times the repetition (`1`, `3`) or as a time (`3'`). `recovery` is the hours after a session of a content (slide 188). `warm` is the paddling needed before the zone's work starts (slide 137). `race-pace` is the most R7 sessions a week in preparation and in a competitive block (slide 146). `most` is how many times a zone's `reference` one session may hold before it is questioned; 1.5 is Kayplan's own margin, not the course's.
- `zones`: the zones suggested for a band's age: those with km in that category's column of the course's long-term table (slide 172). The grid dims the others. A band with no line has nothing dimmed.
- `zone-km <band>`: the course's km a year in each zone for a band (slide 172), in Kayplan's zones: R1 includes R1F, R2 includes R2+ and R2F, R3 includes R3F, so a band's line adds up to its `yearly`. In km mode the grid shows each zone's season sum next to it. Optional; a band with no line shows the sum alone.
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
- The zone can also be written once for a set, before it or just after its bracket (`R2 3x(4'-6'-6'-4'/1')/3'`, `3x(4'-6'/1') R2/3'`), or once for the session with a colon (`R2: 3x(4'-6'/1')/3' + 2km`). It is then the zone of the work that has none of its own; rest never takes it. A zone after the rest of a set (`…/3' R1`) is the rest's zone. The course's `×` is read as `x`.
- Off the water, write the work in time with its zone (`3x 10' R2/3'`). It counts for the main zone, gives minutes and no km.

### `season/library.txt`

```
3-4x(8' R2 + 30'' R3+)/1'30''
60-75' R1
  a sprint of 15-20'' every 5'
R2: 3x(4'-6'-6'-4'/1')/3'
gym: 4-6 exercises, 2-3x 10-15 reps, tempo 2:2
```

- The sessions that are suggested, shared by every plan and band (the coach, 2026-10-03: no age on a line). The file is optional.
- A line is the plan text, as in a session. `pool:`, `gym:` or `land:` in front when it is not on the water. Indented lines are notes; they go into the session's notes when it has none.
- The order of the lines is the order they are suggested in within a zone: the coach's own sessions are first, the course's model sessions after them.
- A line on the water needs a zone to be suggested. Write the zone next to the work or once at the head (`R2:`); a zone written after the rest of a set is the rest's zone.
- Where the lines come from, in the file's order: the club's weekly plans of 2026 (192 water sessions, by main zone and, in a zone, the most used first), the club's daily plans of 2022 (those that read cleanly and are not already there), the coach's sessions of December 2025, and the course's model sessions. They were extracted on 2026-10-04 from two zip files the coach put in `season/`; the zips hold athletes' names, are ignored by git, and must never be committed.
- **The club writes its zones on another scale than the course** (its own table, R1 to R7: R4 anaerobic threshold, R5 VO2max, R6 lactate tolerance and sprints, R7 maximal speed under 10''). Kayplan counts on the course's scale, so the club's sessions were translated when they were put here: R1, R2, R3 unchanged; club R4 → R3+; club R5 → R4; club R6 → R6 (in the plans it is only used for sprints of 10'' to 30''); club R7 → R6; "ritmo de prova/máximo" → R7; "técnica" → R1. This is Claude's reading of the club's table against the course's lactate and stroke-rate figures; the coach has not confirmed it. A session the coach types on the club's scale is read on the course's scale: this is open (see "Waiting for the coach").
- "Outro bloco igual" was written out. Sprints inside a continuous paddle ("10'' R6 a cada 10'"), brakes, portages and standing starts are notes.
- Not taken from the zips: gym and running sessions (no notation for exercises), the 2018 daily plans and the seniors' plans of 2015–16 (other zone scales), the federation's plans of 2017 (no zones written), a thesis and a strength lecture.
- The coach's old sessions gave intensity as a percentage of capacity (`@90`). They were turned into zones when they were put here: `@70` R1, `@75` R2, `@80` R3, `@90` R3+ (R6 for 20'' with a long rest). The coach has not confirmed this yet.
- Sessions already in a plan are not copied here: the suggestions look them up.

## Rules the engine applies

- **Main zone** (`infer` in `src/notation.js`): time per zone, distances turned into time with the band's pace, divided by the zone's reference volume; the largest share wins; R0 only when no other zone appears. Rest with a zone counts toward it; rest without one counts toward nothing. An F variant (`R1F`) is read as its base zone; `R2+` as R2, `R6+` as R6; only `R3+` is its own zone.
- **Ranges** count as their middle (the coach, 2026-10-03): `2-4x` or `(7-10)x` for a count, `10-20'`, `15-20''`, `4-6km`, `200-400m` for an amount. An amount range is a smaller bare number, then a larger one with its unit; `4'-6'`, `500-300m` and `250-300` are ladders. `OU` (alternatives) is not understood.
- **Ladders** (`4'-6'-4' R2/1'`): each amount takes the zone written after it, or else the last zone written in the effort (`4' R2-2' R3` is 4' of R2 and 2' of R3). The rest comes after every amount, so this one has three rests.
- **The reader keeps every effort** (`readPlan` in `src/notation.js`): its repetitions, the rest written after it, whether it is inside brackets, and what is paddled before it first comes up. The checks are worked out from these.
- **Checks** (`sessionChecks`, `checksView` in `src/checks.js`), per age band, never for a session marked `not-done`:
  - a session: a zone not in the band's `zones` line; contents out of the course's order (R5 and R6, then R3, R3+ and R4, then R2 and R1; R1 at the start is the warm-up, R7 has no place in the order); a repetition outside `rep`; the rest after a repetition under `rest`, only for repetitions outside brackets; time in a zone over `most` times its `reference`; work of a `warm` zone starting too early (not off the water). Distances are turned into time with the band's pace.
  - a week: two sessions that both need 48 h or more on the same or the next day, or two of the same content on one day when it needs 24 h; R1 or R2 in the morning and R3 to R6 in the afternoon of one day; more R7 sessions than `race-pace` (the second number in a `comp` block); a content of the block with no session, in a week that has sessions and is not a recovery week; a recovery week with a session that needs 48 h; such a session the day before a race of importance 1 or 2, or any session the day after it; an AT or CT week with fewer sessions than the week before.
- **Suggestions** (`suggestions` in `src/suggest.js`), for one slot of one band. The candidates are the lines of `library.txt` and the band's own sessions in the plan (not marked `not-done`, not the slot itself), each different text once.
  - Left out: a session with a zone not in the band's `zones` line; one in another place (the water unless the session's place is set; on a day inside a `no-water` event, anything off the water); in an R week anything but R1 and R0, in an AT or CT week anything but R7, R6, R1 and R0.
  - Order of the zones: the block's contents with fewer sessions this week than the lower end of `develop`, the one missing most first; then other zones under the lower end of `maintain`; then the rest. In an AT or CT week: R7, R6, R1.
  - Order in a zone: the band's latest earlier session of that zone; then the others it has had, the longest ago first; then the library in the order of its lines (in I, R, AT and CT weeks the smaller first).
  - With nothing asked, the list takes one of each zone in turn and shows five (`SHOWN`). Asking for a zone lists every suggestion of that zone whatever the week is for. Words list every suggestion containing them in its text, zone, place or notes, whatever the week and the place.
  - A suggestion that would be too close to another session (`tooClose` in `src/checks.js`) or in the wrong half of the day (`wrongHalf`) comes after all the others.
  - There is no scaling to the band: a suggestion is the text as written. Only the band's `zones` line keeps a session away from an age.
- **Km of a session** (`infer`): distances as written, times at the band's pace for the zone. R0 is left out. A distance with no zone counts toward the session's total and toward no zone; a time with no zone gives no km. A session off the water gives no km: its written time counts as minutes off the water, and its distances count for nothing.
- **Km of a week and a season** (`kmView` in `src/km.js`): the sum over the band's sessions on the water that are not marked `not-done`. Season km are split into done (sessions before today) and planned (from today on).
- **Km estimate per microcycle** (`kmView`): yearly km × coefficient ÷ sum of all coefficients, with coefficient = load % × content factor. The content factor is (hard-session km of the content + warm-up) ÷ (the same for R2); several contents average; no content is 1. An R7 block takes its km from the race it is aimed at: the most important race inside the block, else the next one after it, else the season's last race. A week that is not planned yet (no load) counts as an average planned week.
- **Capacity grid** (`gridView` in `src/grid.js`): a week's sessions of a zone are the band's sessions whose main zone is that zone, on or off the water, not marked `not-done`. The state of a cell is judged on the sessions of its whole content that week (R3 with R3+, R4 with R5): developing from the lower end of `develop`, maintaining from the lower end of `maintain`, else below maintenance. R7 has no counts in the course table, so it is never shaded. Every zone from R1 to R7 always has a row, so the grid is there before anything is planned and nothing moves when a session is typed.
- **The past is locked for cycles.** A boundary can be moved, created or removed only at or after the end of the last week that has ended; a block can be moved only if it and its neighbour have not started. Names, contents, patterns, week types and session text can still be changed.
- **Moving a block** swaps it with its neighbour and carries its hand-set weeks and sessions with it, shifted by whole weeks. Macrocycles keep their place. Use `moveMeso` in `src/cycles.js` for this instead of editing dates by hand.

## Decisions made while building, not yet in DESIGN.md

- The pattern `none` for unplanned time (DESIGN.md 6.4 lists five patterns).
- The block-content check only fires when a content has no session at all that week. Comparing with `maintain` was tried in thought and set aside: with two or three sessions a week it would fire every week, and the grid already shows it.
- R2 is named "aerobic glycolytic" in its card, as slide 145 and the coach's reference document do.
- Splitting a block copies its pattern to the new block (the mockup always gave the new block `build`). Splitting unplanned time (`none`) leaves both parts with its name.
- A macrocycle's panel has Split, like a block's: a new macrocycle starts at the chosen week, and the block that holds that week is split there too (`splitMacro` in `src/cycles.js`). The design only had "start a new macrocycle here" on a block, which needed the block split first. In both panels the week offered for the split is the one that was clicked on the cycle's bar (the week after, for a click on its first week); opened from the keyboard, it is the selected week if it is inside the cycle, else the middle.
- A new event starts as a race in no plan. Changed to another kind, it applies to every plan, because an event that is not a race cannot be in no plan.
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

- **Which zone scale the club writes in.** The club's plans use its own R1–R7 table, the tool the course's. The library was translated (see `library.txt` above), but a session typed on the club's scale is counted wrongly (club R4 is read as lactic capacity, club R7 as race pace). Options given to the coach on 2026-10-04: write on the course's scale, or add a table of the club's names for zones that the reader translates.
- **Two checks say something about most of the club's sessions.** Of the 226 library sessions from the club, 130 start R3 or R3+ work before the 30' of `warm` (the club warms up 10') and 125 are out of the course's order of contents (sprints at the end, R2 before R3). The coach was told; `warm` can be deleted or lowered in `tables.txt`, the order check has no switch yet.

- `pace default` in `tables.txt` holds invented placeholder speeds from the mockup. Since level 2 they decide every km that is written as time, so they matter: ask for real ones per band.
- `yearly` holds the course's high-performance figures (the coach chose them as a starting point). With two to four sessions a week the estimates sit well above what the sessions cover.
- The `load` percentages are the mockup's. The figures in `hard`, `race` and `warmup` are the table of DESIGN.md 7.0, of which three are assumptions (open question 7).
- In `events.txt`, every race has importance 2 and a guessed `boats`; `type` is guessed from the name. The three Esperanças races are entered as `fundo`, `mixed` (mass-start lap races of 1 to 6 km by age). Dates are last season's weekends moved to 2027, all `confirmed: no`.
- No landmarks yet (the coach chose to start without them).
- The Iniciados plan has an `infantil` band, added at the coach's request on 2026-10-02 with the course's first-year figures (822 km, zones R1 R2 R3 R6 R7). By last season's birth years nobody is 13 or 14 in 2027, so it may stay empty. The plan's blocks are R1 and R6 only (the Iniciado zones); an Infantil would also train R2, R3 and R7, in its own sessions.
- Changing a block's length or pattern can change the type of weeks that have already ended, because types follow the pattern. The design does not say whether past week types should be frozen. The same goes for km estimates (see State).
- The thresholds of the capacity grid are the course's for every band (the coach's choice, 2026-10-02). The course's counts assume near-daily training; if a band needs its own, the table has to grow a band, like `pace`.

## The page

`src/page.js` holds no rules. It asks the engine for what to draw (`sheet`, `weekView`, `eventView`, `check`), and every change goes through an edit function in `src/cycles.js` or `src/edits.js`, then `fileText` and the store. To change behaviour, change the engine and its tests; to change the look, change `page.js` and `page.css`.

- **Saving.** An edit is applied in memory, drawn, and its file written: at once for clicks, after a short pause for typing. A write carries the revision that was read; if the file changed on disk meanwhile, the write is refused, the page reloads from disk and says so. A file with a line that cannot be read is never saved from the page.
- **Live reload.** The page asks the server every two seconds whether any file changed and reloads the plan when one did. Edit the files while the page is open and the change appears.
- **Where you are** (plan, band, week, view) is kept in the address after `#`, so a reload stays put.
- **The header** keeps the plan buttons and the band buttons in place: every plan shows its bands, one or several, and the status line and the language switch sit at the right. Everything below the header is for the selected band: the grid, its dimmed zones, the km, the checks.
- **On the sheet:** a week type set by hand is bold; the current week has its Monday underlined; a boundary that cannot move has no handle. Events that are not races show as one plain letter in the Races row.
- **Language.** English and Portuguese (Portugal). The page starts in the browser's language, and the EN/PT switch in the header changes it and is remembered on that device (`?lang=pt` in the address forces one, for checks). Every text the page can show goes through `tr('English text', …)` in `src/lang.js`, with the English as the key and `{0}`, `{1}` for what is filled in; numbers with decimals go through `dec()`, which writes a comma in Portuguese. `test/lang.test.js` fails when a text handed to `tr()` has no Portuguese, or a translation is left over, so add the Portuguese with every new text. The Portuguese of the zone cards uses the course slides' own words. Not translated: the words of the plan files (they are the format), the messages about a file line that cannot be read (`src/format.js`), and the command line.
- **Cycle panels:** a cycle's own properties (name, content, load pattern) are on white at the top; what changes the structure (move, split, new macrocycle, merge, delete) is in a grey strip below a line (`.pop-acts`). Keep new controls on the right side of that line.
- **Events view:** the season runs across the top as on the sheet (Month, Monday), with one row of race and event codes for each plan, drawn by the same `raceCell` as the sheet's Races row. Clicking a code selects its entry in the table below; the selected event's code is filled like the selected week. The entry under the pointer has its code ringed in the rows above (a class put on the cells, not a redraw; `markPointed` puts it back after each draw). A race in no plan is in no row.
- **Wording of the checks:** short, as a recommendation, with times as the coach writes them (`60'`, `1'30''`, `45''`), and never "the course gives" (the coach, 2026-10-03; their model: "R6: 60' ultrapassa máximo recomendado de 4'' a 30''").
- **Checks:** a week where the course would question something has its number in the Microcycle row in dark red and underlined, for the selected band. The selected week lists them in words above its days, and the selected session lists its own under the main zone.
- **Week types card:** hovering, focusing or clicking the Type row's label shows what each week type is for, with its load from the load table (`typesCard` in `src/zones.js`; `show types` prints it).
- **Suggestions:** a selected session with no work written (no amount with or without a zone) shows the list under its plan text: the band's zones, the ones the week is missing in bold, then one row per suggestion with its main zone, text and minutes in that zone. A zone button lists that zone's suggestions; words typed in the plan text narrow the list (`r3`, `gym`); a click, or the arrow keys and Enter, puts the text, place and notes into the session, where it is saved and changed like any other. The plan text and the list share one space of a fixed size (the text is short while the list shows, and fills the space otherwise; a long list scrolls inside it), so the notes, the place and everything else in the panel stay where they are (the coach, 2026-10-03). The lower part of the page is at least 600 px high, and a redraw keeps the page scrolled where it was.
- **Where the plan is.** Served from `127.0.0.1` or `localhost` the page uses `serve.js`; anywhere else (or with `?github` in the address) it uses GitHub. The repository (`owner/name`), the folder (`season`) and the token are asked for in a form and kept in the browser's `localStorage` under `kayplan-github`; a refused token or a missing repository brings the form back with the reason. The repository's name in the header opens the form again. GitHub is asked for changes every 20 seconds (the local server every 2), an unchanged answer costing nothing of GitHub's hourly allowance. A save is one commit, "Kayplan: <file>"; a file changed elsewhere since it was read is refused by GitHub and handled like a file changed on disk. After a write GitHub can name the commit before it for a moment; the store ignores a commit it has itself written over, so the old text never comes back.
- **Links for other people** (the coach, 2026-10-04: for another trainer, and a read-only one for the athletes). `setupLink` and `readSetup` in `src/store-github.js`: the page's address with `#setup=` and the repository, folder and token in base64. The page keeps what a link carries in `localStorage` and takes it out of the address. The form opened from the header makes a link from a token pasted there, with "Read only" and a plan to choose. A read-only account (`readonly` in `kayplan-github`) gets the day page on any screen, with no "Full page", and only the plan the link names. This is what the page shows, not what the token can read: a read-only token reads the whole repository.
- **A phone** (760 px or narrower, or `?phone`) gets the day page (the coach, 2026-10-04: "way simpler", opened right before a training session): `dayView` in `src/engine.js` gives every plan's sessions of one day; the page shows them morning first, each with its plan and band, main zone, text in large type, the time per zone, the other units and the notes. Arrows go a day at a time, Today comes back, and a day with no session offers the next day that has one. Nothing is edited there. "Full page" at the bottom opens the whole page (`full=1` in the address). `node kayplan.js show day [date]` prints the same.
- **The full page on a phone**: the days of the week one under the other, the session panel under them, and picking or adding a session scrolls to it. The sheet scrolls sideways as it always did. Fields are 16 px so that a phone does not zoom in on them.
- **Zone cards:** hovering or focusing a zone name shows its card; a click keeps it open and scrollable until Escape or a click elsewhere. A card states one value for each thing, in the same wording across zones, and never says where it comes from (no "the course", no slide, no "on another slide"): the coach asked for this on 2026-10-02. Where slides disagree the card takes the zone summary of slide 145; the sources are in the head of `src/zones.js`. Sessions per week and km a year are read from `tables.txt`, so the card and the grid show the same figures. The course's model sessions are not in the cards (the coach, 2026-10-02): they are in `season/library.txt` as suggestions.
- **Km row:** the number in a cell is the week's estimate, and the cell fills from the bottom as the week's sessions cover it. With no estimate it shows the km from the sessions. How an estimate was worked out is in the cell's hover text.
- **Capacity grid:** dark is developing, light is maintaining, an outline is below maintenance. A zone that is not suggested for the band's age has its name dimmed; its sessions are still counted and shaded. The Sessions/Km switch changes what the cells show, not the rows. The counts behind a shade are in the cell's hover text.
- **Checking it.** `npm run page-check` clicks, types and drags through the page in headless Firefox on a copy of `test/page-season`, and checks the files that were saved. It leaves screenshots in a temporary folder and prints the path: look at them after changing the page. Add a step there for each new behaviour. The one-shot `firefox --screenshot` is of little use here, because it captures the page before the plan has loaded.
