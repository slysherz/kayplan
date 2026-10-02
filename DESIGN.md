# Kayplan — design

Status: design agreed for level 1 and the first parts of level 2, 2026-10-02. Level 1 is built and runs on one computer, with the plan in text files in `season/`: the engine, the command line and the page. The GitHub step (section 6.5) is not built. [CLAUDE.md](CLAUDE.md) says what is built, describes the file format and lists the decisions made while building. What is still undecided is listed in [Open questions](#10-open-questions).

Kayplan is a planning tool for one kayak coach at a small club who trains children and teenagers of all ages, often several age groups in the same session. It shows the whole season at a glance and zooms into weeks and single sessions.

The tool is built in three levels (section 2.1), and a level is only started once the one above it works well. Sections 4–8 describe the basics and say which level each part belongs to. Ideas beyond that are listed in [Later, if needed](#9-later-if-needed).

Mockup with dummy data: [mockups/level1-layouts.html](mockups/level1-layouts.html). Open it in a browser and pick the "B · Annual sheet" tab, which is the chosen layout; A and C were set aside. The mockup is the reference for how the sheet looks and behaves. It also holds working versions of the rules in this document, in plain JavaScript:

| Rule | Function in the mockup | Section |
|---|---|---|
| Reading session notation | `parsePlan` | 8.1 |
| Main zone and km per zone of a session | `infer` | 8.1.1, 7.0 |
| Week type from a mesocycle's load pattern | `patType` | 6.4 |
| Cycle positions from the ordered list of mesocycles | `rebuild` | 6.1 |
| Cycle edits (split, move, delete, new macrocycle, merge) | `planAct`, and the boundary drag handlers | 6.3 |
| Km estimate per microcycle | `estimates`, `contentFactor`, `raceFor` | 7.0 |

## 1. Context

- **Club:** about 13 athletes, from Menor (9–10) to Senior. The largest groups are Menores/Iniciados and Juniors. The roster, category ages and last season's races are in [../provas.md](../provas.md).
- **Current practice:** session ideas, landmark distances and a month-by-month log are in [../planificacao.md](../planificacao.md). Kayplan uses the same session notation.
- **Theory source:** the Grau II coaching course slides (*Planeamento e treino das capacidades físicas na canoagem*, André Bastos Coelho), at `/home/diogribe/archive/canoagem/curso-grau-2/componente-especifica/wetransfer_videos-ginasio-kayak-e-canoa_2024-03-18_1757/`. Zone definitions and the annual plan layout come from there unless marked as an assumption.
- **Season shape:** training starts in September/October. Races run from March to August. The race calendar is published partway through the season.

## 2. Principles

1. **Basics first.** The first version does the things the coach would otherwise do by hand every week: lay out the season, write sessions, count km. Anything that rearranges the plan on its own waits.
2. **The coach edits; the tool adds up.** The coach places blocks, races and sessions by hand. The tool keeps the totals and conversions right.
3. **Easy to change.** The calendar arrives late and plans change. Every part of the plan can be added, moved, resized or deleted at any time without redoing the rest.
4. **One session, many groups.** A session is written once and each age group gets its own version.
5. **Tables are data.** Zones, categories, budgets and substitution tables are editable.
6. **AI-native.** Claude has the same information and the same controls as the coach. Anything the coach can see or change on screen, Claude can read or change too, so "update the calendar", "adjust the planning" or "write next week's sessions" are ordinary requests (section 6.5).

### 2.1 Build levels

There is no point starting a level if the one above it is not good.

| Level | The tool… | Contents |
|---|---|---|
| 1. Create | lets the coach build the plan by hand | Yearly calendar with races, macrocycles, mesocycles, microcycles (type and load %), and individual sessions as text, with the main zone worked out from the text (sections 5, 6, 8.1) |
| 2. Augment | shows things about the plan the coach made | Km and minutes per zone, season totals against the budget, distance/time conversion, wrong training order and the other checks (sections 7, 8.2, and the checks in section 9) |
| 3. Generate | proposes plans and sessions | Scaling a session to other age groups, blueprints and suggestions, generated yearly plans (sections 8.3, 8.4, and the planning items in section 9) |

**Level 1 layout (chosen 2026-10-02).** The annual sheet: the course's plan sheet across the top (months, races, macrocycles, mesocycles, content, microcycle number, type, load), with the selected week and the selected session side by side underneath. It is layout B in the mockups. The other two layouts (three stacked strips; season outline with a block calendar) were tried and set aside.

In level 1 each group has its own plan; sharing one session across groups arrives with scaling in level 3.

## 3. Vocabulary

### 3.1 Zones (ritmos)

| Zone | Content | Rep duration | Stroke rate (K) | % VO2max | Method notes |
|---|---|---|---|---|---|
| R0 | Warm-up, games, recovery paddling *(assumption: not defined in the slides)* | — | — | — | — |
| R1 | Aerobic, lipid | up to 120' | 60–70 | 65–75 | Continuous or split; recovery and technique |
| R2 | Aerobic–anaerobic transition | ~60' total | 70–80 | 75–85 | Base of aerobic work |
| R3 | Aerobic capacity (VO2max maintenance) | 2–6' | 80–90 | 90–95 | ~30' total, rest 1:1 |
| R3+ | Aerobic power (VO2max) | 2–3' | 90–100 | 100 | ~15' total, rest up to 1:3 |
| R4 | Lactic capacity / tolerance | 75–80" | 110–120 | 105–120 | Reps to 400 m at 1:3 or more; series to 600 m |
| R5 | Lactic power | ~45" | max | 120–140 | Reps to 200 m, 3–6' rest, ~1000 m total |
| R6 / R6+ | Alactic capacity / power | 10–20" / 4–10" | max | >160 | 3–4' rest, 1–3' total work |
| R7 | Competition pace | race distance | — | — | Simulation series, split series, USRPT |

Also used in the course's plan sheets:

- **R2+**: an intermediate zone between R2 and R3.
- **F variants** (R1F, R2F, R3F, R6F, FRE): resisted paddling with a brake *(assumption)*.
- **Rg**: general endurance off the water — running, cycling, swimming *(assumption)*. Counted in minutes.

### 3.2 Planning units

| Unit | Length | Notes |
|---|---|---|
| Season | 1 year | Holds one or more macrocycles |
| Macrocycle | 3–12 months | Ends in a competitive phase |
| Mesocycle | 3–6 weeks, ideally 4 | Has a dominant content, e.g. "R2" or "R3–R3+" |
| Microcycle | usually 1 week | Has a type and a load % |
| Session | 1 slot (morning/afternoon) | Water, pool, gym or land |
| Set | — | Reps of work and rest in a zone |

Microcycle types:

| Code | Type | Purpose |
|---|---|---|
| I / A | Introductory / adjustment | Prepare for the next level of load |
| C | Load | Enough volume to improve |
| CH | Shock | Maximum stimulus, incomplete recovery |
| R | Recovery | Regeneration |
| AT | Activation | Low volume, high intensity, before a race |
| CT | Competition | Race week |

### 3.3 Categories

Categories follow the age reached in the calendar year of the races.

| Club category | Age | Column in the course's long-term table | Water km per season (course) |
|---|---|---|---|
| Mínimo | 5–8 | none | — |
| Menor | 9–10 | none | — |
| Iniciados A | 11 | "Iniciado B" | 274 |
| Iniciados B | 12 | "Iniciado A" | 315 |
| Infantis A | 13 | "Infantil B" | 822 |
| Infantis B | 14 | "Infantil A" | 955 |
| Cadete | 15 / 16 | "Cadete B" / "Cadete A" | 1605 / 1820 |
| Junior | 17 / 18 | "Junior B" / "Junior A" | 2067 / 2220 |
| Senior | 19+ | "Senior 1º–3º" | 2581–3342 |

In the club's naming A is the younger year; in the course table B comes first. The mapping is by first and second year, not by letter.

Zones each category trains, from the same table:

| Category | Zones |
|---|---|
| Mínimo, Menor | R0, R1 games, short R6 *(assumption)* |
| Iniciado | R1, R6 |
| Infantil | + R2, R3, R7 |
| Cadete | + R2+, R3+, R1F |
| Junior | + R5, R2F, R3F |
| Senior | + R4 |

## 4. Data model

### 4.1 Plans and age bands

Athletes are split by the races they do, not by age.

- **A plan** holds everyone aiming at the same races. Individual athletes are not stored (section 6.5: no names in the repository); a plan only records which categories train in it. It has one set of macrocycles and mesocycles, one set of week types, and its own importance for each race.
- **Inside a plan**, athletes of different categories share the cycles. Each category present in the plan is an **age band** with its own session text, yearly km and paces.
- **A new plan can start as a copy of another**, and then be changed. So two sets of athletes can share a structure exactly (same plan), follow similar structures (a copied plan), or have nothing in common (separate plans).
- The selector at the top of the screen picks a plan and an age band.

At level 1 the coach writes each age band's sessions. At level 3 a session written for one band can be scaled to the others (section 8.3).

### 4.2 What is stored

Everything else is worked out from it.

```
Season            first Monday, number of weeks
 ├─ Events        date, date confirmed?, name, place, kind (race, test, camp, holiday, no water)
 │                 races also have: type (sprint, fundo, maratona), boats (solo, tripulações, mixed)
 ├─ Places        landmark distances (Sede–Foz 1 km, island lap 300 m, …)
 ├─ Tables        zones, load % per week type, load patterns, hard-session km per content, reference volumes, thresholds
 ├─ Categories    yearly km, pace per zone
 └─ Plans         name, and which categories train in it (its age bands)
      ├─ Races          which races the plan is aimed at, and the importance of each (1–3)
      ├─ Mesocycles     an ordered list; each has a name, a macrocycle, a length in weeks, contents (zones) and a load pattern
      │                 a macrocycle is a name and a run of consecutive mesocycles
      ├─ Week types     only for weeks whose type was set by hand
      └─ Sessions       date, slot (morning or afternoon), age band, plan text, notes, "not done" mark
```

Never stored, always worked out: which weeks each cycle covers, week types that follow a pattern, load %, a session's main zone and km, km estimates, and today.

Level 3 adds blueprints and scaling.

## 5. The screen

One screen, as in layout B of the mockup. A selector at the top picks the plan and the age band (the mockup's group buttons stand in for it).

### 5.1 The annual sheet

One column per week. Rows, top to bottom:

| Row | Content | Edited by |
|---|---|---|
| Month, Monday | Calendar | — |
| Races | A two-character code per race (section 6.2) | The events table |
| Macrocycle | Blocks | Click, drag edges (section 6.3) |
| Mesocycle | Blocks, coloured by their most intense content | Click, drag edges |
| Content | The mesocycle's contents, e.g. `R3-R3+` | Click |
| Microcycle | Week number; click selects the week | — |
| Type | I, C, CH, R, AT, CT | Follows the pattern, or set by hand in the week view |
| Load % | A bar per week | Follows the type |
| Km | The week's km estimate, filling as sessions cover it (section 7.0) | — |
| Grid | One row per zone: sessions that week, or km that week, chosen with a switch. The rows are the same in both modes, so switching does not move anything. | — |

### 5.2 The selected week

Under the sheet, on the left. Seven days, each with a morning and an afternoon slot.

- A session card is coloured by its main zone and shows its text.
- An empty slot adds a session.
- A race is a banner on its day.
- The header has previous and next week, the week's type (editable), its load %, and its km from sessions against its estimate.

### 5.3 The selected session

Under the sheet, on the right.

- Day and slot.
- The main zone, worked out from the text, with the time found per zone and the session's km.
- The plan text and a notes field.
- Delete.

## 6. Editing the plan

Level 1. Agreed on 2026-10-02.

### 6.1 The model

- **Weeks are a fixed grid.** The season is a fixed run of dated weeks.
- **Cycles are containers.** Every week belongs to exactly one mesocycle and every mesocycle to exactly one macrocycle. There are no gaps and no overlaps. Time that is not planned yet is a mesocycle called "Unplanned".
- **Races and events belong to dates.** They never move when cycles are edited.
- **Sessions belong to a week and a weekday slot** (for example Tuesday afternoon).

### 6.2 Races and events

A separate view: one editable table, like the one in [../provas.md](../provas.md).

| Column | Notes |
|---|---|
| Date | A date, plus whether it is confirmed. An unconfirmed race carries a best-guess date. |
| Name, place | |
| Kind | Race, test, camp, holiday, no water |
| Race type | Sprint (regatas em linha), fundo or maratona. Races only. |
| Boats | Solo, tripulações (crew boats) or mixed. Races only. |
| Importance | 1 (most important) to 3, set per group. Races only. |
| Groups | Which groups it applies to |

**How races are drawn.** Like the other cells of the sheet: a short text code in one neutral colour, with no icons and no extra colours. (Coloured badges that varied in size, colour and shape were tried and rejected as too busy.)

| Property | Shown by |
|---|---|
| Race type | First character of the code: S sprint, F fundo, M maratona |
| Boats | Second character: 1 solo, T tripulações, + mixed |
| Importance | Shade: dark for 1, grey for 2, outline only for 3 |
| Date not confirmed | A dashed ring around the cell |

For example `F+` on a dark cell is a fundo race with solo and crew boats, importance 1. In the week view the race is a banner on its day with the same shade and ring, showing its name, type and boats in words. Hovering a code gives the full name and all four properties. Clicking it opens the entry. Last season's calendar is the starting guess; entries are corrected when the real calendar is published.

### 6.3 Editing cycles on the sheet

| Action | How | What happens |
|---|---|---|
| Move a boundary | Drag the edge between two blocks | One block grows and its neighbour shrinks, in whole weeks. Weeks and their sessions stay on their dates; the weeks crossed change owner. A macrocycle boundary is also a mesocycle boundary, and dragging it moves both. |
| Edit | Click a block or its content cell | A small panel opens under the block with its name, contents and load pattern, and buttons for split, move, delete and starting a new macrocycle. Clicking a macrocycle gives its name and a merge button. |
| Split | Choose a week inside a block | The block becomes two. This is how new blocks are added, including carving planned blocks out of "Unplanned". |
| Merge | Delete a block | Its weeks join the previous block. Merging a macrocycle joins it to the previous macrocycle. |
| New macrocycle | "Start new macrocycle here" on a mesocycle | That mesocycle and the ones after it in the same macrocycle become a new macrocycle. |
| Move | "Move earlier" and "Move later" in the block's panel (dragging a block is a possible later addition) | The two swap order. A moved block carries its weeks with it, including hand-set types and sessions, shifted by whole weeks so weekdays are kept. |
| Edit a week | Click its type or load cell | Sets the type or load by hand. |

Weeks in the past cannot be moved.

**Content.** A mesocycle can have several contents, or none. They are chosen with one on/off button per zone and shown joined in zone order, as in the course sheets (`R1-R2`, `R3-R3+`). A block with no content shows a dash and a neutral colour. The block's colour comes from its most intense content.

### 6.4 What updates on its own

- **Week type and load.** Each mesocycle has a load pattern. The patterns are: build (load weeks, then shock, then recovery), introduction then build, recovery then build, competition (load weeks, then activation, then race week), and recovery only. Weeks follow the pattern of the mesocycle they are in. When a mesocycle changes length, its weeks re-follow the pattern. A week whose type was set by hand keeps it until it is reset.
- **Nothing else.** Which mesocycles fill a macrocycle, and what sessions go in a week, are not regenerated when a cycle changes. Sessions stay as written. Reworking them is a request to Claude ("Nacional de Fundo moved a week later, adjust macrocycle I", "rewrite weeks 12–14 for the new block") or a manual edit.

### 6.5 AI-native

Plain files alone are not enough: they hold what was typed, not what the tool works out from it (week loads from the pattern, km and minutes per zone, totals against the budget, warnings). Claude must see those too. So there is one engine and two ways into it.

- **One engine.** A single piece of code reads the plan and computes everything derived from it. Nothing is computed only in the screen's code.
- **Two front ends on that engine.** The screen is for the coach. A command-line interface is for Claude. Whatever the screen can show, a command can print as text, with the same numbers:

| Command | Prints |
|---|---|
| `show season` | The annual sheet as a table: cycles, week types, loads, races, and from level 2 the km per zone and totals against the budget |
| `show week 7` | The week's sessions with their computed km and minutes, the week's totals, and any warnings |
| `show events` | The races and events table |
| `check` | Whether the plan is valid, plus every warning the screen would show |

- **The plan itself is plain text files** in this folder: events, cycles, weeks and sessions. They hold only what was typed. The screen edits these files and Claude edits the same files, then runs `check`.
- **Live reload.** The sheet redraws when a file changes, so Claude's edits appear as they are made.
- **History and undo with git.** Each change by the coach or by Claude is a commit, so any change can be reviewed and reverted.
- **An instructions file** in this folder describes the file format, the commands, the planning rules and the no-names rule, so a new Claude session can work on the plan without this conversation.

The command names are placeholders.

**Running on two computers and a phone.** Agreed on 2026-10-02. The repository is on GitHub.

- **The plan files live in one private online git repository.** That is the single copy.
- **The tool is a web page.** On any device it reads and saves those files through the repository host. There is no server of the coach's own to keep running.
- **Every save is a commit**, which gives history and undo. Claude works on a copy of the same repository and pushes its changes.
- **One engine, written once in JavaScript.** It runs in the page for the coach and from the command line for Claude.
- **What it needs:** an account on a git host, a one-time sign-in on each device, and an internet connection when opening and saving.
- **The phone** is for looking up the week and the session at the dock, editing a session's text and marking it not done. The full annual sheet is sized for a computer.
- **Order of building:** first on one computer with the files on disk, with file reading and writing kept behind one small interface; then the same page pointed at the repository.
- **No names in the repository.** No athlete's name, first name or initials goes into any file in it: not in plan files, session text, notes, commit messages, this document or the mockup. The plan is written for plans and age bands, never for individuals. The roster stays in the coach's own notes outside the repository.
- If two devices save at once, the second must reload first; with one coach this is rare.

### 6.6 Planning with an incomplete calendar

- **Start rough.** At the start of the season the coach carves out a few mesocycles for the months ahead and leaves the rest "Unplanned". Weeks need no sessions until the coach gets to them.
- **Races can be added at any time**, with or without a confirmed date, and corrected later.
- The first months are general preparation and depend little on exact race dates, so October to January can be planned in detail while March onward stays rough.

### 6.7 Today

Agreed on 2026-10-02. "Today" is never stored in the plan; it comes from the clock. It splits the season into history and plan.

| What | How today is represented |
|---|---|
| Where we are | The current week is marked on the sheet and the current day in the week view. This mark is separate from the selected week. The tool opens on the current week, and a "Today" control returns to it. |
| Past cycles | Boundaries, moves and splits are locked for weeks that have ended. |
| Past sessions | A session whose date has passed counts as done unless it is marked "not done" (weather, no water, nobody came). Only exceptions are marked. Its text can still be edited, as a correction of what was actually trained. There is no separate copy of the original plan; git history keeps it. |
| Km | Season km split into done (past sessions that were not marked "not done") and planned (future sessions). |
| Km estimates | Frozen for weeks that have ended. Changing a future block shares out only what is left of the yearly km over the weeks still to come. Km missed in the past are shown as a shortfall and are not added to future weeks. |
| Races | A race in the past with an unconfirmed date is flagged for correction. |
| Claude | The commands take today from the clock, so `show week` with no number means this week. An "as of" option runs any command for another date, for checks and previews. |

Later, if needed: weeks until the next race; days since each zone was last trained against its residual effect; a prompt when next week has no sessions yet.

## 7. Season km

Level 2. The coach types no km figures on the sheet. Targets are worked out; sessions are counted against them.

### 7.0 Counting and distributing km

**Counting (bottom-up).** Km come from the session text, with the same reading that finds the main zone (section 8.1.1).

- Distances count as written. Times are turned into km with the group's pace for that zone.
- Each session gives km per zone. These add up per week, per mesocycle and per season.
- Work written without a zone counts toward the week's total, but toward no zone.
- R0 is left out of the totals, because the course's yearly table has no R0.
- Pool, running, cycling and yoga count in minutes under general endurance, not in km.

**Distributing (top-down): one km estimate per microcycle.** There are no per-zone weekly targets. (A version that gave every zone a target in every week was tried and dropped as more than is needed.)

Each microcycle gets a coefficient, and the yearly km are shared out in proportion:

```
coefficient = load % × content factor
estimate    = yearly km × coefficient ÷ sum of all coefficients
```

- **Load.** With the same content, a 50% week gets half the km of a 100% week.
- **Content factor.** The km of a typical hard session with that content, compared with a hard R2 session. Every session also gets a fixed allowance for warm-up and cool-down.

```
content factor = (hard-session km for the content + warm-up allowance) ÷ (hard-session km for R2 + warm-up allowance)
```

| Content | Hard session, work only (km) | Factor with a 2 km allowance | Source of the km |
|---|---|---|---|
| R1 | 12 | 1.00 | Coach: same as R2 |
| R2 | 12 | 1.00 | Course: about 60' of work |
| R3 | 6 | 0.57 | Course: about 30' |
| R3+ | 3.2 | 0.37 | Course: about 15' |
| R4 | 2.2 | 0.30 | Assumption: about 10' |
| R5 | 1 | 0.21 | Course: about 1000 m |
| R6 | 0.5 | 0.18 | Course: 1–3' of work |
| R7, sprint race | 1.4 | 0.24 | Coach: 2x200 m + 2x500 m |
| R7, fundo race | 6 | 0.57 | Assumption |
| R7, maratona race | 13.5 | 1.11 | Coach: 12–15 km |

- **R7 depends on the race.** Race pace means a different distance for a 200 m race and for a marathon, so an R7 block takes its figure from the race it is aimed at: the most important race inside the block, or else the next race after it.
- **Several contents:** the plain average of their factors, so `R3-R3+` is 0.47. **No content:** 1.00.
- **A known weakness:** the factor treats the week as if every session were that content's hard session. Real weeks also hold easier paddles, which would pull the factors closer together.
- **Yearly km:** the water total from the course's long-term table for the group's category (section 3.3). It is a setting per group; nothing is typed on the sheet. A group with no column in that table (Mínimo, Menor) gets no estimate.

The hard-session km and the warm-up allowance are an editable table.

Two properties to keep in mind:

- **The yearly km are fixed, so the estimates are relative.** Lowering one week's load or changing one block's content moves its km to all the other weeks.
- **Load % is used as a share of volume.** Load is volume and intensity together; the content factor is what accounts for intensity.

**On the sheet.**

- A **Km row** directly under the load bars, always visible: the number in each cell is the week's km estimate. The cell fills from the bottom as the week's sessions cover it and turns dark when they reach it. The end of the row shows season km from sessions against the yearly km.
- The capacity grid has a **sessions / km switch**. In km mode each zone row shows the km counted from that week's sessions, with the season sum at the end. These rows have no targets, and they are the same rows as in sessions mode.
- Km are shown as whole numbers; anything under half a km shows as "<1". The exact figure is in the hover text.
- The week view shows the week's km from sessions against its estimate, next to the load %.
- Hovering an estimate shows how it was worked out (load % × content factor).

### 7.1 Capacity grid

Level 2. Shows, week by week, how much each capacity is being trained, so the coach can check the rate against the course's guidance.

**Where.** A block of rows on the annual sheet under the load bars: one row per zone, one cell per week. The zones can be folded into capacity groups (aerobic base R1–R2, aerobic capacity and power R3–R3+, lactic R4–R5, alactic R6, race pace R7).

**What a cell shows.**
- The number of sessions that week whose main zone is that zone. The main zone is worked out from the session text (section 8.1.1).
- The km in that zone, once sessions are read as notation (section 8.2).
- A shade for the state, from the session count:

| State | Meaning | Shade |
|---|---|---|
| Developing | At or above the "develop" count | Dark |
| Maintaining | At or above the "maintain" count | Light |
| Below maintenance | Trained, but less than "maintain" | Outline |
| Absent | Not trained | Empty |

**The thresholds** come from the course and are editable per group:

| Zone | Sessions per week to develop | To maintain |
|---|---|---|
| R1 | 4–6 | 3 |
| R2 | 3–4 | 2 |
| R3 / R3+ | 2–3 | 1 |
| R4 / R5 | 2–4 | 1 |
| R6 / R6+ | 3–4 | 1–2 |

The course's counts assume an athlete who trains most days. A group with two to four sessions a week cannot meet them all, so each group needs its own numbers.

**What the coach reads from a row.**
- How many weeks in a row a capacity has been developing, against the course's build times (aerobic at least 8 weeks, lactic 4–6).
- Whether the row matches the mesocycle's content above it. A mesocycle marked R3 with an empty R3 row is a mismatch.
- How long a capacity has been absent before a race, against its residual effect (aerobic about 30 days, lactic about 18, speed about 5).
- The season total for the zone against its budget, at the end of the row.

The first version only shows the numbers and shades. Turning the comparisons above into automatic warnings is in section 9.

**Zone help.** Hovering or focusing a zone name in the grid opens a card with what the zone is, its intensity markers, how to train it, the course's sessions per week and recovery time, how fast it builds, how fast it decays, and from which category the course's long-term table uses it. The text comes from the zone table (section 3.1) and the course slides, and is editable like the other tables.

## 8. Sessions

### 8.1 Notation

Level 1. The session is typed as text in the notation below. The tool reads it to work out the session's main zone (section 8.1.1); the coach does not pick one.

Sessions are typed in the notation already used in [../planificacao.md](../planificacao.md) and in the course.

```
session := block ("+" block)*
block   := [count "x"] ( "(" session ")" | effort ) ["/" rest]
effort  := amount [zone] [note]
amount  := distance (m, km) | time (', '') | place name
```

Examples: `2x2000m`, `8x 4' R2/1' R0`, `3x(8x 30''/30'')`, `1km R1 + 2x(2' ED + 1' R0)`, `5x(3x 150/100)/6'`.

- A **place name** from the Places table stands for its distance.
- Free-text **notes** on an effort carry drills and boats (SSF, unilateral, with ball, K2).

#### 8.1.1 Main zone

The main zone of a session is inferred from its text. It is never picked by hand, and it is not stored.

1. **Read the work per zone.** The text is read as notation, and the time in each zone is added up. Distances are turned into time with the group's pace for that zone. Rest written with a zone (`/1' R0`, `/3' R1`) counts toward that zone; rest without a zone counts toward none.
2. **Compare each zone with a full session of that zone.** Each zone has a reference volume: what one full session of it looks like. The zone's share is its time divided by its reference.

| Zone | Reference volume | Source |
|---|---|---|
| R1 | 120' | Course |
| R2 | 60' | Course |
| R3 | 30' | Course |
| R3+ | 15' | Course |
| R4 | 10' | Assumption |
| R5 | 4'30" (about 1000 m) | Course |
| R6 | 2' | Course (1–3') |
| R7 | 10' | Assumption |

3. **The main zone is the one with the largest share.** R0 is only the main zone when no other zone appears.

Examples:

| Plan | Time per zone | Main zone |
|---|---|---|
| `1km R1 + 8x 4' R2/1' R0 + 1km R1` | R2 32', R1 13', R0 8' | R2 |
| `6km R1 + 4x(15'' R7 + 15'' R0)` | R1 38', R7 1' | R1 |
| `20' R1 + 4x 10'' R6/2' + 10' R1` | R1 30', R6 40" | R6 |
| `2x2000m` | none written | none |

- **Work without a zone is not counted.** A session with no zone written anywhere has no main zone and is left out of the capacity grid. The session view says so, and the fix is to write the zone next to the work.
- **The session view shows the working**: the time found per zone next to the main zone, so the result can be checked at a glance.
- The reference volumes are an editable table.

A plain raw-time rule would name R1 for almost every session, because warm-up and cool-down outweigh a short hard set. That is why each zone is measured against its own full session.

### 8.2 Distance and time

Level 2. Every work piece and rest can be written in distance or in time. The tool keeps what was typed and shows the other unit next to it, marked "≈".

- **Pace table:** one speed per zone for each group, typed by the coach, for example from the 1 km control. The coach updates it when the group gets faster.
- **Rest:** active rest converts at R0 speed. Passive rest adds time and no km.
- **Result:** every session, week and season has km and minutes per zone, per group, whichever unit was typed.

Illustrative examples:

| Typed | At 11 km/h | At 8 km/h |
|---|---|---|
| `8x 4' R2` | ≈ 5.9 km | ≈ 4.3 km |
| `2x2000m` | ≈ 10'55" per rep | ≈ 15'00" per rep |

Seeing rep duration next to a distance rep also lets the coach check the zone by eye: a 200 m "R5" rep that takes 80" is no longer R5 (about 45").

### 8.3 Scaling to age groups

Level 3. The coach writes the session for one group and presses "scale" to get a version for each other group attending.

Scaling does two things:

1. **Swaps zones the group does not train**, using a substitution table.
2. **Multiplies the volume by the group's scale factor.** The factor is one number per group, typed by the coach (for example Juniors 1.0, Cadetes 0.8, Iniciados 0.3). It applies to the number of reps and to the length of continuous pieces, rounded to whole reps and tidy distances.

The result is ordinary notation that the coach can edit freely. Scaling again replaces it, after asking.

**Default substitution table** *(a proposal, derived from which zones each category has in the course table; to be confirmed)*:

| Master | Junior | Cadete | Infantil | Iniciado | Menor |
|---|---|---|---|---|---|
| R1 | R1 | R1 | R1 | R1 | R0/R1 games |
| R2 | R2 | R2 | R2 | R1 | R1 games |
| R3 | R3 | R3 | R3 | R1 | games |
| R3+ | R3+ | R3+ | R3 | R1 | games |
| R4 | R3+ | R3+ | R3 | R6 | sprint games |
| R5 | R5 | R6 | R6 | R6 | sprint games |
| R6 | R6 | R6 | R6 | R6 | sprint games |
| R7 | R7 | R7 | R7 | R1 | games |

**Example** (illustrative factors). Master for Juniors: `2km R1 + 5x(3' R3+/3' R1) + 2km R1`.

| Group | Factor | Result |
|---|---|---|
| Cadete | 0.8 | `1.5km R1 + 4x(3' R3+/3' R1) + 1.5km R1` |
| Infantil | 0.5 | `1km R1 + 3x(3' R3/3' R1) + 1km R1` |
| Iniciado | 0.3 | `600m R1 + 2x(3' R1/3' R1) + 600m R1` |

The Iniciado result is where the coach would step in and replace the middle with a drill or a game. The first version leaves that to the coach.

### 8.4 Blueprints

Level 3. A blueprint is a saved session: notation, main zone, place (water, pool, gym, land), and a free-text note.

- **Library:** seeded from the "Sugestões de treino" lists in [../planificacao.md](../planificacao.md).
- **Save:** any session can be saved as a blueprint.
- **History:** every past session can be found and copied, whether or not it was saved as a blueprint.
- **Suggesting:** from an empty slot, "from blueprint" lists blueprints and past sessions, filtered by zone and place, least recently used first. The week's dominant content preselects the zone filter.
- **Using one** copies its notation into the slot, where it is scaled and edited like any other session.

## 9. Later, if needed

None of this is in the first cut of any level. Each item is here because it came up during design; it gets built only if the basics of its level prove insufficient. Checks and monitoring belong to level 2; the planning, session and blueprint items belong to level 3.

**Planning**
- Automatic replanning when a race is added or moved (blocks counted backward from the race, general blocks stretching or shrinking, shown as a proposal).
- Race priority driving block structure (taper, activation and competition weeks placed automatically).
- Weekly km targets derived from the budget and the load %.
- Saved snapshots of the plan over time.
- Macrocycle models (traditional, integrated, ATR) as templates that pre-fill blocks.

**Sessions**
- Pace tables with dated entries, updated from logged times; paces per athlete.
- Scaling that keeps rep duration instead of distance, rounds to landmarks, and respects a session-length cap per group.
- Variants that stay linked to the master and update when it changes.
- Rep ranges (`(7-10)x`) and alternatives (`OU`) in the notation.

**Blueprints**
- Parameters and progressions (`6x4'` → `8x4'` → `10x4'`).
- Ranking by fit to the week, variety and how it went last time.
- Filling a whole week from blueprints.

**Checks and warnings** (from the course tables)
- Rep duration and total volume against each zone's limits.
- Sessions per week needed to develop or maintain a zone; residual effect countdown before a race (aerobic 30 ± 5 days, lactic 18 ± 4, speed 5 ± 3).
- Compatible contents in a block, order of contents in a session, recovery time after heavy sessions.
- Build times (aerobic at least 8 weeks, lactic 4–6 weeks), taper rules.

**Load curves** (set aside on 2026-10-02)
- Over the year: fitness, fatigue and freshness curves from the fitness–fatigue model, drawn under the load bars. They describe load, not performance, need a load number per session, and say little for groups that train one to three times a week.
- Over the week: each session's recovery window, from its load level (1–5) and the course's recovery times.

**Monitoring**
- Session RPE × duration, weekly monotony and strain.
- Attendance and km per athlete.
- 3-zone intensity distribution.
- Growth tracking, wellness diary, HRV.

**Other**
- Gym and strength planning.
- Import from watches or GPS; anything athlete-facing.

## 10. Open questions

To settle before or while building level 1:

1. **Groups and cycles.** Settled: plans by races, age bands inside (section 4.1).
2. **File format.** Settled on 2026-10-02: plain text files in `season/`, described in [CLAUDE.md](CLAUDE.md).
3. **How it runs.** Settled: a web page over a private GitHub repository, with no names in it (section 6.5).
4. **Paces.** Km and the main zone need a speed per zone for each group. Where do they come from: typed once per group, or worked out from a control test?
5. **Yearly km per group.** The course figures are for a high-performance pathway (2220 km for second-year Juniors). What figure should each group use, and what about Mínimo and Menor, which have no column?
6. **Sessions off the water.** Pool, gym, yoga and running appear in the coach's notes. How are they written, and do they count in minutes?
7. **Assumed figures in the content factor table** (section 7.0): 6 km for a hard fundo session, 2.2 km for R4, and 13.5 km for marathon race pace against 12 km for R1 and R2.

Assumptions never confirmed:

8. The meaning of R0, the F variants and Rg (section 3.1).
9. The first/second-year mapping between club categories and the course table (section 3.3).
10. The reference volumes for R4 and R7 used to find the main zone (section 8.1.1).
11. The dummy thresholds for developing and maintaining a zone (section 7.1); the course's assume near-daily training.

For level 3:

12. The substitution table and whether one scale factor per group is enough (section 8.3).

## 11. Not yet read

In the course folder: part 2 of the slides and the planning spreadsheets (`Planificação 2022 -.xlsx`, `Planificacao Kms Mateiev.xlsx`, `Planificacao Largo Plazo.xlsx`, `Plano de forca.xlsx`, `Sessão BVT.xlsx`).
