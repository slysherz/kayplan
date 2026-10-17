import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../src/engine.js';
import { seasonReport, weekReport, eventsReport, checkReport } from '../src/report.js';
import { memoryStore, fixture } from './helpers.js';

const load = changes => e.load(memoryStore({ ...fixture(), ...changes }));
const problems = (data, today) => e.check(data, today || '2026-01-21').map(p => p.level + ' ' + p.file + (p.line ? ':' + p.line : '') + ' ' + p.message);

test('the fixture loads without problems', async () => {
  const data = await load();
  assert.deepEqual(data.errors, []);
  assert.deepEqual(data.plans.map(p => [p.id, p.name, p.bands]), [['group-a', 'Group A', ['older', 'younger']], ['group-b', 'Group B', ['masters']]]);
  assert.deepEqual(e.check(data, '2026-01-21'), []);
  assert.equal(Object.keys(data.revs).length, 14);
});

test('plans come in the order season.txt lists them, the rest after by id', async () => {
  const files = fixture();
  files['plans/group-c/plan.txt'] = 'name: Group C\nbands: masters\n';
  files['plans/group-c/cycles.txt'] = 'Only macro\n  12 none  -  Unplanned\n';
  const ids = async () => (await e.load(memoryStore(files))).plans.map(p => p.id);
  assert.deepEqual(await ids(), ['group-a', 'group-b', 'group-c']);
  files['season.txt'] += 'plans: group-c, group-a\n';
  assert.deepEqual(await ids(), ['group-c', 'group-a', 'group-b']);
  files['season.txt'] = files['season.txt'].replace('group-c, group-a', 'group-b, group-z');
  const data = await e.load(memoryStore(files));
  assert.deepEqual(data.plans.map(p => p.id), ['group-b', 'group-a', 'group-c']);
  assert.deepEqual(e.check(data, '2026-01-05').filter(x => x.file === 'season.txt'), [{ level: 'warning', file: 'season.txt', line: null, message: 'plans lists "group-z", which has no folder in plans/' }]);
});

test('weeks: numbers, Mondays, and how many have ended', async () => {
  const { season } = await load();
  assert.equal(e.weekOf(season, '2026-01-05'), 1);
  assert.equal(e.weekOf(season, '2026-01-11'), 1);
  assert.equal(e.weekOf(season, '2026-01-12'), 2);
  assert.equal(e.weekOf(season, '2026-03-29'), 12);
  assert.equal(e.weekOf(season, '2026-03-30'), null);
  assert.equal(e.weekOf(season, '2026-01-04'), null);
  assert.equal(e.mondayOf(season, 12), '2026-03-23');
  assert.equal(e.endedWeeks(season, '2025-12-01'), 0);
  assert.equal(e.endedWeeks(season, '2026-01-11'), 0);   // Sunday of week 1: not ended yet
  assert.equal(e.endedWeeks(season, '2026-01-12'), 1);
  assert.equal(e.endedWeeks(season, '2026-06-01'), 12);
});

test('the sheet: types follow the pattern unless set by hand, loads follow the type', async () => {
  const sh = e.sheet(await load(), 'group-a', '2026-01-21');
  assert.equal(sh.weeks.map(w => w.type).join(' '), 'I C R C C CH R C CH R AT CT');
  assert.equal(sh.weeks.map(w => w.load).join(' '), '60 80 50 80 70 100 50 80 100 50 55 40');
  assert.deepEqual(sh.weeks.filter(w => w.hand).map(w => w.n), [3, 5]);
  assert.deepEqual(sh.weeks.map(w => w.meso).join(''), '000111122233');
  assert.deepEqual(sh.weeks.map(w => w.macro).join(''), '000000011111');
  assert.equal(sh.weeks[4].pattern, 'C');
  assert.deepEqual([sh.weeks[2].monday, sh.weeks[2].sunday], ['2026-01-19', '2026-01-25']);
  // today is Wednesday of week 3
  assert.equal(sh.ended, 2);
  assert.equal(sh.current, 3);
  assert.deepEqual(sh.weeks.filter(w => w.ended).map(w => w.n), [1, 2]);
  assert.deepEqual(sh.weeks.filter(w => w.current).map(w => w.n), [3]);
  assert.deepEqual(sh.weeks[2].sessions, { older: 3, younger: 1 });
  assert.deepEqual(sh.weeks[3].sessions, {});
});

test('the sheet: unplanned weeks have no type and no load', async () => {
  const sh = e.sheet(await load(), 'group-b', '2026-01-21');
  assert.deepEqual([...new Set(sh.weeks.map(w => w.type))], [null]);
  assert.deepEqual([...new Set(sh.weeks.map(w => w.load))], [null]);
  assert.equal(sh.mesos[0].label, '-');
});

test('today is outside the season', async () => {
  const data = await load();
  assert.deepEqual([e.sheet(data, 'group-a', '2025-12-25').ended, e.sheet(data, 'group-a', '2025-12-25').current], [0, null]);
  assert.deepEqual([e.sheet(data, 'group-a', '2026-05-01').ended, e.sheet(data, 'group-a', '2026-05-01').current], [12, null]);
});

test('events: each plan sees its races with its importance, and the events for everyone', async () => {
  const data = await load();
  const a = e.eventsFor(data, 'group-a', '2026-01-21');
  assert.deepEqual(a.map(x => [x.name, x.code, x.importance, x.weeks, x.unconfirmedPast]), [
    ['Spring regatta', 'S1', 1, [6], false], ['Carnival break', 'h', null, [7], false]
  ]);
  const b = e.eventsFor(data, 'group-b', '2026-01-21');
  assert.deepEqual(b.map(x => [x.name, x.code, x.importance, x.weeks]), [['Carnival break', 'h', null, [7]], ['Long race', 'M+', 3, [9]]]);
  const sh = e.sheet(data, 'group-a', '2026-01-21');
  assert.deepEqual(sh.weeks.filter(w => w.events.length).map(w => [w.n, w.events.map(x => x.code).join()]), [[6, 'S1'], [7, 'h']]);
  // a race in the past whose date was never confirmed is flagged
  assert.equal(e.eventsFor(data, 'group-a', '2026-02-14')[0].unconfirmedPast, false);
  assert.equal(e.eventsFor(data, 'group-a', '2026-02-15')[0].unconfirmedPast, true);
});

test('events: an event over several weeks is in each of them', async () => {
  const data = await load({ 'events.txt': '2026-01-10 Camp\n  until: 2026-01-20\n  kind: camp\n  plans: group-a\n' });
  assert.deepEqual(e.eventsFor(data, 'group-a', '2026-01-21')[0].weeks, [1, 2, 3]);
  assert.deepEqual(e.eventsFor(data, 'group-b', '2026-01-21'), []);
  assert.deepEqual(e.weekView(data, 'group-a', 3, '2026-01-21').days.map(d => d.events.length), [1, 1, 0, 0, 0, 0, 0]);
});

test('a week: days with their sessions, main zones and done marks', async () => {
  const w = e.weekView(await load(), 'group-a', 3, '2026-01-21');
  assert.deepEqual([w.n, w.type, w.hand, w.pattern, w.load, w.mesoInfo.name, w.macroInfo.name], [3, 'R', true, 'R', 50, 'General one', 'First macro']);
  assert.deepEqual(w.days.map(d => d.date), ['2026-01-19', '2026-01-20', '2026-01-21', '2026-01-22', '2026-01-23', '2026-01-24', '2026-01-25']);
  assert.deepEqual(w.days.filter(d => d.today).map(d => d.weekday), [2]);
  assert.deepEqual(w.days.flatMap(d => d.sessions).map(s => [s.date, s.slot, s.band, s.main, s.status]), [
    ['2026-01-20', 1, 'older', 'R2', 'done'],
    ['2026-01-20', 2, 'younger', null, 'done'],
    ['2026-01-22', 1, 'older', 'R1', 'not done'],
    ['2026-01-24', 1, 'older', 'R6', 'planned']
  ]);
  // a session on today's date is still planned
  assert.equal(e.weekView(await load(), 'group-a', 3, '2026-01-20').days[1].sessions[0].status, 'planned');
  const race = e.weekView(await load(), 'group-a', 6, '2026-01-21');
  assert.deepEqual(race.days.map(d => d.events.map(x => x.name).join()), ['', '', '', '', '', 'Spring regatta', '']);
});

test('check: problems in the files, with the file and line', async () => {
  const data = await load({
    'events.txt': '2026-02-14 Spring regatta\n  kind: party\n',
    'plans/group-a/sessions.txt': 'tuesday: 6km R1\n2026-01-20 older: 6km R1\n',
    'plans/group-a/cycles.txt': 'First macro\n  3 intro  R1-R2  General one\n  4 wave  R2  General two\n'
  });
  assert.deepEqual(problems(data), [
    'error events.txt:1 kind must be one of: race, test, camp, holiday, no-water',
    'error plans/group-a/cycles.txt:3 pattern must be one of: build, intro, restart, comp, recovery, none',
    'error plans/group-a/sessions.txt:1 a session is written "date: plan", or "date band: plan" for one band, like "2026-10-11: 6km R1" or "2026-10-11 junior gym: circuit"'
  ]);
  // the rest of the plan is still worked out
  assert.equal(e.sheet(data, 'group-a', '2026-01-21').weeks.length, 12);
});

test('check: a plan that does not add up', async () => {
  const data = await load({
    'events.txt': '2026-02-14 Spring regatta\n  kind: race\n  type: sprint\n  boats: solo\n  plans: group-c 1\n\n2026-05-01 Late race\n  kind: race\n  type: fundo\n  boats: solo\n',
    'plans/group-a/cycles.txt': 'First macro\n  3 intro  R1-R2  General one\n',
    'plans/group-a/weeks.txt': '2026-01-20 R\n2026-06-01 R\n2026-01-26 X\n',
    'plans/group-a/sessions.txt': '2026-01-20 older: 6km R1\n2026-01-20 older: 4km R1\n2026-01-20 guest: 4km R1\n2025-12-30 older: 4km R1\n'
  });
  assert.deepEqual(problems(data), [
    'error events.txt:1 Spring regatta: there is no plan or band "group-c"',
    'warning events.txt:7 Late race (2026-05-01) is outside the season',
    'warning events.txt:7 Late race is in no plan',
    'error plans/group-a/cycles.txt the mesocycles cover 3 weeks and the season has 12',
    'error plans/group-a/weeks.txt:1 2026-01-20 is not the Monday of a week in the season',
    'error plans/group-a/weeks.txt:2 2026-06-01 is not the Monday of a week in the season',
    'error plans/group-a/weeks.txt:3 there is no week type "X" in tables.txt',
    'error plans/group-a/sessions.txt:3 plan group-a has no band "guest"',
    'error plans/group-a/sessions.txt:4 2025-12-30 is outside the season'
  ]);
  // weeks past the cycles have no mesocycle, type or load
  const sh = e.sheet(data, 'group-a', '2026-01-21');
  assert.deepEqual([sh.weeks[5].meso, sh.weeks[5].type, sh.weeks[5].load], [null, null, null]);
  // a week set by hand to a type with no load still shows the type
  assert.deepEqual([sh.weeks[3].type, sh.weeks[3].load], ['X', null]);
});

test('check: tables, missing files and an unreadable season', async () => {
  let data = await load({ 'tables.txt': "load  I 60  C 80\nreference  R1 120'\npace default  R1 9.5\n" });
  assert.deepEqual(problems(data), [
    'error tables.txt load is missing for week type CH, R, AT, CT',
    'error tables.txt reference is missing for R0, R2, R3, R3+, R4, R5, R6, R7',
    'error tables.txt pace default is missing for R0, R2, R3, R3+, R4, R5, R6, R7',
    'error tables.txt hard is missing for R1, R2, R3, R3+, R4, R5, R6',
    'error tables.txt race is missing for sprint, fundo, maratona',
    'error tables.txt warmup is missing'
  ]);
  data = await load({ 'tables.txt': fixture()['tables.txt'].replace('older 1000', 'older 1000  guest 500') });
  assert.deepEqual(problems(data), ['warning tables.txt yearly km are given for "guest", which is not a band of any plan']);
  const files = fixture();
  delete files['plans/group-b/plan.txt'];
  delete files['plans/group-b/weeks.txt'];
  data = await e.load(memoryStore(files));
  assert.deepEqual(problems(data), ['error plans/group-b/plan.txt the file is missing']);
  assert.equal(data.plans[1].name, 'group-b');

  data = await load({ 'season.txt': 'start: 2026-01-06\nweeks: 12\n' });
  assert.equal(e.usable(data), false);
  assert.deepEqual(problems(data), ['error season.txt:1 start must be a Monday']);
});

test('check: a past race with an unconfirmed date is a warning', async () => {
  const data = await load();
  assert.deepEqual(problems(data, '2026-02-15'), ['warning events.txt:1 Spring regatta (2026-02-14) is in the past and its date was never confirmed']);
  assert.deepEqual(checkReport(data, '2026-02-15'), { text: 'warning: events.txt:1: Spring regatta (2026-02-14) is in the past and its date was never confirmed\n0 errors, 1 warnings', errors: 0 });
  assert.deepEqual(checkReport(data, '2026-01-21'), { text: 'ok', errors: 0 });
});

test('show season prints the sheet', async () => {
  const lines = seasonReport(await load(), 'group-a', '2026-01-21').split('\n');
  assert.deepEqual(lines.slice(0, 7), [
    'group-a · Group A · bands older, younger',
    '12 weeks, 2026-01-05 to 2026-03-29 · today 2026-01-21, week 3',
    'km older: 7.9 done + 4.9 planned of 1000 yearly · weeks that have ended: 0.0 of 217.2 estimated',
    'km younger: 4.0 done + 0.0 planned, no yearly km',
    '> current week · * type set by hand · km: from sessions/estimate · weeks 1 to 2 have ended',
    '',
    '   wk  monday      macrocycle    mesocycle    content  type  load  sessions            km                      events'
  ]);
  assert.equal(lines[7], '    1  2026-01-05  First macro   General one  R1-R2    I       60                      older 0/93');
  assert.equal(lines[9], '>   3  2026-01-19  First macro   General one  R1-R2    R*      50  older 3, younger 1  older 13/78, younger 4');
  assert.equal(lines[12], '    6  2026-02-09  First macro   General two  R2       CH     100                      older 0/155             S1 Spring regatta (Sat 2026-02-14, sprint, solo, importance 1, date not confirmed)');
  assert.equal(lines[13], '    7  2026-02-16  First macro   General two  R2       R       50                      older 0/78              h Carnival break (Mon 2026-02-16 to 2026-02-22, holiday)');
  assert.equal(lines.length, 19);
  assert.match(seasonReport(await load(), 'group-b', '2026-05-01'), /today 2026-05-01, outside the season/);
  assert.match(seasonReport(await load(), 'group-b', '2026-01-07'), /\* type set by hand · km: from sessions\/estimate · no week has ended\n/);
  assert.match(seasonReport(await load(), 'group-b', '2026-01-21').split('\n')[6], /^\s+1  2026-01-05  Only macro  Unplanned  -        -        -$/);
});

test('show week prints the sessions with the zone working', async () => {
  assert.equal(weekReport(await load(), 'group-a', 3, '2026-01-21'), `group-a · week 3 · 2026-01-19 to 2026-01-25 · current week
First macro / General one / content R1-R2 · type R (set by hand, pattern gives R) · load 50%
km older: 12.8 of 77.6 estimated (load 50% × content 1.00) · R1 6.8 · R2 5.9 · R6 0.2
km younger: 4.0

Mon 2026-01-19
Tue 2026-01-20
  1 older water · done · main zone R2 · 1km R1 + 8x 4' R2/1' R0 + 1km R1
      R2 32' · R1 13' · R0 8' · 7.9 km
      1km R1 ≈ 6'19'' · 4' R2 ≈ 730 m · 1' R0 ≈ 120 m
      note: crew boats on the last four
      note:
      note: watch the stroke rate
  2 younger water · done · main zone none · 2x2000m
      no zone 4 km · 4.0 km
Wed 2026-01-21 · today
Thu 2026-01-22
  1 older water · not done · main zone R1 · 6km R1 + 4x(15'' R7 + 15'' R0)
      R7 1' · R1 38' · R0 1' · 6.2 km
      6km R1 ≈ 37'54'' · 15'' R7 ≈ 50 m · 15'' R0 ≈ 30 m
      note: no water
Fri 2026-01-23
Sat 2026-01-24
  1 older water · planned · main zone R6 · 20' R1 + 4x 10'' R6/2' + 10' R1
      R6 40'' · R1 30' · 4.9 km
      20' R1 ≈ 3.2 km · 10'' R6 ≈ 40 m · 10' R1 ≈ 1.6 km
      check: R6: 2' of rest, below the recommended minimum of 3'
Sun 2026-01-25`);
  const younger = weekReport(await load(), 'group-a', 3, '2026-01-21', 'younger');
  assert.match(younger, /2 younger water/);
  assert.doesNotMatch(younger, /older ·/);
  assert.match(weekReport(await load(), 'group-a', 1, '2026-01-21'), /week 1 · 2026-01-05 to 2026-01-11 · ended\n.* type I · load 60%\nkm older: 0\.0 of 93\.1 estimated \(load 60% × content 1\.00\)\nkm younger: 0\.0\n/);
  assert.match(weekReport(await load(), 'group-b', 9, '2026-01-21'), /type - · load -\nkm masters: 0\.0\n[^]*Sat 2026-03-07\n  M\+ Long race \(Sat 2026-03-07 to 2026-03-08, maratona, mixed, importance 3\)\nSun 2026-03-08\n  M\+ Long race/);
});

test('show events prints the table', async () => {
  assert.equal(eventsReport(await load(), '2026-01-21'), `today 2026-01-21

date        until       confirmed  kind            code  week  name            place  plans
2026-02-14              no         sprint solo     S1    6     Spring regatta  Lake   group-a 1
2026-02-16  2026-02-22  yes        holiday         h     7     Carnival break         all
2026-03-07  2026-03-08  yes        maratona mixed  M+    9     Long race              group-b 3`);
});

test('a day across every plan: its sessions with something written, and the nearest other days', async () => {
  const data = await load(), d = e.dayView(data, '2026-01-20', '2026-01-20');
  assert.deepEqual([d.weekday, d.today, d.week, d.prev, d.next], [1, true, 3, null, '2026-01-22']);
  assert.deepEqual(d.plans.map(p => [p.id, p.type, p.meso, p.sessions.map(s => s.band + ' ' + s.main)]), [['group-a', 'R', 'General one', ['older R2', 'younger null']], ['group-b', null, 'Unplanned', []]]);
  // a day with nothing, between two that have sessions; a race is on its day for the plan it belongs to
  const none = e.dayView(data, '2026-01-23', '2026-01-20');
  assert.deepEqual([none.today, none.prev, none.next, none.plans.flatMap(p => p.sessions)], [false, '2026-01-22', '2026-01-24', []]);
  assert.deepEqual(e.dayView(data, '2026-02-14', '2026-01-20').plans.map(p => p.events.map(x => x.name)), [['Spring regatta'], []]);
  // outside the season
  assert.deepEqual([e.dayView(data, '2025-12-01', '2026-01-20').week, e.dayView(data, '2025-12-01', '2026-01-20').next], [null, '2026-01-20']);
});
