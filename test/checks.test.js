import test from 'node:test';
import assert from 'node:assert/strict';
import { load, sessionView } from '../src/engine.js';
import { sessionChecks, checksView } from '../src/checks.js';
import { parseTables, serializeTables } from '../src/format.js';
import { checksReport } from '../src/report.js';
import { memoryStore, fixture, TABLES } from './helpers.js';

const tables = parseTables(TABLES).value;
// what the checks say about one session text, for the band "older" (no zones line) unless another is given
function said(text, band = 'older', more = {}) {
  const data = { tables };
  return sessionChecks(sessionView(data, { date: '2026-01-20', slot: 1, band, place: 'water', text, notes: '', notDone: false, ...more }, '2026-01-01'), tables);
}

test('tables: the lines the checks compare with', () => {
  assert.deepEqual(tables.rep.R3, [60, 420]);
  assert.deepEqual(tables.rep.R6, [4, 30]);
  assert.deepEqual(tables.rest, { R3: { ratio: 1 }, 'R3+': { ratio: 1 }, R4: { ratio: 3 }, R5: { sec: 180 }, R6: { sec: 180 } });
  assert.deepEqual(tables.recovery, { R1: 24, R2: 24, 'R3-R3+': 48, 'R4-R5': 48, R6: 24 });
  assert.deepEqual(tables.warm, { R3: 1800, 'R3+': 1800 });
  assert.deepEqual([tables.racePace, tables.most], [[2, 4], 1.5]);
  assert.equal(serializeTables(tables), TABLES);
  const bad = parseTables("rep  R3 7'-1'\nrest  R3 soon\nrecovery  R9 24\nwarm  R3 long\nrace-pace 2\nmost much\n").errors.map(e => e.line);
  assert.deepEqual(bad, [1, 2, 3, 4, 5, 6]);
  // a season with none of these lines has none of these checks
  const none = parseTables(TABLES.split('\n').filter(l => !/^(rep|rest|recovery|warm|race-pace|most) /.test(l)).join('\n')).value;
  const s = sessionView({ tables: none }, { date: '2026-01-20', slot: 1, band: 'older', place: 'water', text: "5x 10' R3/1'", notes: '' }, '2026-01-01');
  assert.deepEqual(sessionChecks(s, none), []);
});

test('a session: a sound one says nothing', () => {
  assert.deepEqual(said("5km R1 + 5x 4' R3/4' R1 + 1km R1"), []);
  assert.deepEqual(said("1km R1 + 4x 10'' R6/3' + 8x 4' R2/1' R0 + 1km R1"), []);
  assert.deepEqual(said('yoga'), []);
  assert.deepEqual(said("5x 10' R3/1'", 'older', { notDone: true }), []);
});

test('a session: a zone the course does not give that age', () => {
  assert.deepEqual(said("2km R1 + 6x 10'' R6/3'", 'younger'), []);
  assert.deepEqual(said("2km R1 + 2x 45'' R5/4' + 4x 500m R2/2'", 'younger'), ['R2, R5: not recommended for younger']);
  // rest in a zone is not work in it
  assert.deepEqual(said("6x 10'' R6/3' R2", 'younger'), []);
});

test('a session: the order of contents', () => {
  assert.match(said("2km R1 + 8x 4' R2/1' + 4x 10'' R6/3'")[0], /^R6 after R2: the recommended order is R5 and R6, then/);
  assert.match(said("5km R1 + 4x 3' R3/3' + 3x 40'' R5/4'").join('|'), /R5 after R3/);
  // R1 at the start is the warm-up, and R7 has no place in the order
  assert.deepEqual(said("5km R1 + 4x 10'' R6/3' + 4x 3' R3/3' + 10' R2 + 4x(15'' R7 + 15'' R0) + 1km R1"), []);
});

test('a session: how long a repetition lasts, and the rest after it', () => {
  assert.deepEqual(said("5km R1 + 3x 10' R3/10'"), ["R3: 10' exceeds the recommended maximum of 1' to 7'"]);
  // a distance is turned into time with the band's pace: 3000 m of R3 at 12 km/h is 15'
  assert.match(said("5km R1 + 2x 3000m R3/15'")[0], /^R3: 15' exceeds/);
  assert.deepEqual(said("4x 2'' R6/3'"), ["R6: 2'' is below the recommended minimum of 4'' to 30''"]);
  assert.deepEqual(said("4x 10'' R6/2'"), ["R6: 2' of rest, below the recommended minimum of 3'"]);
  assert.deepEqual(said("5km R1 + 5x 4' R3/2' R1"), ["R3: 2' of rest after 4', below the recommended minimum of 1:1"]);
  assert.deepEqual(said("5km R1 + 4x 1' R4/2'"), ["R4: 2' of rest after 1', below the recommended minimum of 1:3"]);
  // inside brackets the short rests belong to the series
  assert.deepEqual(said("5km R1 + R3 4x(3x 2'/30'')/6'"), []);
});

test('a session: too much of a zone, and R3 before the warm-up is done', () => {
  assert.deepEqual(said("5km R1 + 8x 6' R3/6' R1"), ["R3: 48' in one session exceeds the recommended maximum of 45'"]);
  assert.deepEqual(said("5km R1 + 7x 6' R3/6'"), []);
  assert.deepEqual(said("1km R1 + 5x 4' R3/4'"), ["R3 starts 6'19'' into the session: at least 30' before it is recommended"]);
  assert.deepEqual(said("R3: 5x 4'/4'"), ["R3 starts 0'' into the session: at least 30' before it is recommended"]);
  // off the water nothing is paddled first
  assert.deepEqual(said("5x 4' R3/4'", 'older', { place: 'gym' }), []);
});

// group-a: weeks 1-3 General one (intro, R1-R2), 4-7 General two (build, R2), 8-10 Specific (build, R3), 11-12 Racing (comp, R7)
async function week(sessions, n, events) {
  const files = fixture();
  files['plans/group-a/sessions.txt'] = sessions;
  files['plans/group-a/weeks.txt'] = '';
  if (events) files['events.txt'] = events;
  const data = await load(memoryStore(files));
  assert.deepEqual(data.errors, []);
  return checksView(data, 'group-a', 'older', '2026-01-01')[n - 1];
}

test('a week: hard sessions too close together', async () => {
  const w = await week(`2026-03-02 older: 5km R1 + 5x 4' R3/4'
2026-03-03 older: 5km R1 + 5x 4' R3/4'
2026-03-05 older: 5km R1 + 5x 4' R3/4'
2026-03-07 older: 6km R1
2026-03-07 older: 6km R1
`, 9);
  assert.deepEqual(w.week, ['Mon (R3) and Tue (R3) are less than 48 h apart', 'Sat (R1) and Sat (R1) are less than 24 h apart']);
  // across the weekend, and not for a session marked not done
  const next = await week(`2026-03-01 older: 5km R1 + 5x 4' R3/4'
2026-03-02 older: 5km R1 + 4x 2' R3+/2'
2026-03-03 older not-done: 5km R1 + 5x 4' R3/4'
`, 9);
  assert.deepEqual(next.week, ['Sun (R3) and Mon (R3+) are less than 48 h apart']);
});

test('a week: quality in the morning, race-pace sessions, the block\'s content', async () => {
  const w = await week(`2026-03-03 older: 8km R2
2026-03-03 older: 5km R1 + 5x 4' R3/4'
`, 9);
  assert.deepEqual(w.week, ['Tue (R2) before Tue (R3): the quality session is recommended first']);
  const r7 = "5km R1 + 4x 3' R7/8'\n";
  const prep = await week('2026-03-02 older: ' + r7 + '2026-03-04 older: ' + r7 + '2026-03-06 older: ' + r7 + '2026-03-07 older: 5km R1 + 5x 4\' R3/4\'\n', 9);
  assert.deepEqual(prep.week, ['3 R7 sessions exceed the recommended maximum of 2 a week in the preparatory period']);
  const comp = await week('2026-03-16 older: ' + r7 + '2026-03-17 older: ' + r7 + '2026-03-18 older: ' + r7, 11);
  assert.deepEqual(comp.week, []);
  // a block of R3 with a week of R1 only; a week with no session says nothing
  assert.deepEqual((await week('2026-03-02 older: 8km R1\n', 9)).week, ["R3-R3+ is the block's content and has no session this week"]);
  assert.deepEqual((await week('2026-03-02 older: 8km R1\n', 8)).week, []);
});

test('a week: recovery weeks, the days around a race, the taper', async () => {
  // week 10 is the recovery week of the R3 block
  assert.deepEqual((await week("2026-03-10 older: 5km R1 + 5x 4' R3/4'\n", 10)).week, ['A recovery week with Tue (R3): low volume and intensity are recommended']);
  const race = '2026-03-14 Big race\n  kind: race\n  type: sprint\n  boats: solo\n  plans: group-a 1\n';
  const w = await week("2026-03-13 older: 5km R1 + 5x 4' R3/4'\n2026-03-15 older: 6km R1\n", 10, race);
  assert.deepEqual(w.week, ['A recovery week with Fri (R3): low volume and intensity are recommended', 'Fri (R3) is the day before Big race: a light day is recommended', 'Sun is the day after Big race: a day off is recommended']);
  // week 12 is the race week of the competitive block
  const taper = await week("2026-03-16 older: 5km R1 + 4x 3' R7/8'\n2026-03-18 older: 6km R1\n2026-03-20 older: 6km R1\n2026-03-24 older: 5km R1 + 4x 3' R7/8'\n", 12);
  assert.deepEqual(taper.week, ['1 sessions, 3 the week before: in the taper, lower the volume and keep the number of sessions']);
});

test('show checks lists every week with something, session by session', async () => {
  const files = fixture();
  const data = await load(memoryStore(files));
  assert.equal(checksReport(data, 'group-a', 'older', '2026-01-21'), `group-a · older · what the course would question
week 3
  2026-01-24 · R6: 2' of rest, below the recommended minimum of 3'`);
  assert.equal(checksReport(data, 'group-b', 'masters', '2026-01-21'), 'group-b · masters · what the course would question\nnothing');
  const c = checksView(data, 'group-a', 'older', '2026-01-21');
  assert.deepEqual(c.map(x => x.count).filter(Boolean), [1]);
  assert.deepEqual(Object.keys(c[2].sessions), ['2026-01-24 1 older']);
});
