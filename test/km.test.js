import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../src/engine.js';
import { kmView, contentFactor, raceFor } from '../src/km.js';
import { infer, durationText, distanceText, kmText } from '../src/notation.js';
import { parseTables } from '../src/format.js';
import { memoryStore, fixture, TABLES } from './helpers.js';

const tables = parseTables(TABLES).value;
const load = changes => e.load(memoryStore({ ...fixture(), ...changes }));
const TODAY = '2026-01-21';   // Wednesday of week 3
const round = (x, d = 1) => +x.toFixed(d);

test('km of a session: distances as written, times at the zone pace, R0 left out', () => {
  const s = infer("1km R1 + 8x 4' R2/1' R0 + 1km R1", tables, 'any');
  assert.deepEqual(Object.keys(s.km), ['R1', 'R2']);
  assert.equal(round(s.km.R1, 2), 2);
  assert.equal(round(s.km.R2, 2), 5.87);   // 32' at 11 km/h
  assert.equal(round(s.totalKm, 2), 7.87);
  // work with no zone: its distance counts toward the total and toward no zone; its time cannot be turned into km
  const u = infer("2x2000m + 10' easy + 1km R1", tables, 'any');
  assert.deepEqual([u.km, round(u.totalKm, 2)], [{ R1: 1 }, 5]);
  // rest counts only when it has a zone
  assert.equal(round(infer("4x 1000m R3/3'", tables, 'any').totalKm, 2), 4);
  assert.equal(round(infer("4x 1000m R3/3' R1", tables, 'any').totalKm, 2), 5.9);
  assert.deepEqual([infer('yoga', tables, 'any').totalKm, infer('', tables, 'any').km], [0, {}]);
});

test('the other unit next to each piece: the examples of DESIGN.md 8.2', () => {
  const fast = parseTables(TABLES).value, slow = parseTables(TABLES.replace('R2 11 ', 'R2 8 ')).value;
  assert.equal(round(infer("8x 4' R2", fast, 'any').totalKm), 5.9);
  assert.equal(round(infer("8x 4' R2", slow, 'any').totalKm), 4.3);
  assert.deepEqual(infer('2x2000m R2', fast, 'any').pieces, [{ text: '2000m R2', approx: "10'55''" }]);
  assert.deepEqual(infer('2x2000m R2', slow, 'any').pieces, [{ text: '2000m R2', approx: "15'00''" }]);
  // each different piece once, in order; rest with a zone too; nothing for work with no zone
  assert.deepEqual(infer("1km R1 + 8x 4' R2/1' R0 + 1km R1 + 2x 500m", fast, 'any').pieces, [
    { text: '1km R1', approx: "6'19''" }, { text: "4' R2", approx: '730 m' }, { text: "1' R0", approx: '120 m' }
  ]);
  assert.deepEqual(infer("4x 200m R5/3'", fast, 'any').pieces, [{ text: '200m R5', approx: "50''" }]);
  assert.equal(durationText(59.6), "1'00''");
  assert.equal(durationText(654.5), "10'55''");
  assert.equal(distanceText(733.3), '730 m');
  assert.equal(distanceText(5866), '5.9 km');
  assert.deepEqual([kmText(0), kmText(0.2), kmText(0.5), kmText(41.4)], ['0', '<1', '1', '41']);
});

test('off the water: no km, but the zones still count', () => {
  const s = infer("10' R1 + 3x 10' R2/3' + 400m R2 + 5' loose", tables, 'any', true);
  assert.deepEqual([s.km, s.totalKm, s.pieces], [{}, 0, []]);
  assert.equal(s.main, 'R2');
  // only written time counts: the 400 m are not paddled
  assert.deepEqual(s.parts.map(p => [p.zone, p.min]), [['R1', 10], ['R2', 30]]);
  assert.equal(s.offMin, 45);
});

test('content factors: the table of DESIGN.md 7.0', () => {
  const sprint = [{ type: 'sprint', importance: 1, weeks: [5] }], fundo = [{ type: 'fundo', importance: 1, weeks: [5] }], maratona = [{ type: 'maratona', importance: 1, weeks: [5] }];
  const f = (zones, races) => round(contentFactor({ zones, from: 1, to: 6 }, races || [], tables), 2);
  assert.deepEqual(['R1', 'R2', 'R3', 'R3+', 'R4', 'R5', 'R6'].map(z => f([z])), [1, 1, 0.57, 0.37, 0.3, 0.21, 0.18]);
  assert.deepEqual([f(['R7'], sprint), f(['R7'], fundo), f(['R7'], maratona)], [0.24, 0.57, 1.11]);
  assert.equal(f(['R3', 'R3+']), 0.47);
  assert.equal(f([]), 1);
  assert.equal(f(['R7'], []), 1);
});

test('the race a block is aimed at', () => {
  const races = [
    { name: 'a', importance: 2, weeks: [3] }, { name: 'b', importance: 1, weeks: [4] }, { name: 'c', importance: 1, weeks: [4, 5] }, { name: 'd', importance: 3, weeks: [9] }
  ];
  const aim = (from, to) => { const r = raceFor({ from, to }, races); return r ? r.name : null; };
  assert.equal(aim(1, 4), 'b');    // the most important inside, the earlier of two equals
  assert.equal(aim(3, 3), 'a');
  assert.equal(aim(5, 7), 'd');    // none inside: the next one after
  assert.equal(aim(10, 12), 'd');  // none after: the last one
  assert.equal(raceFor({ from: 1, to: 4 }, []), null);
});

test('estimates: the yearly km shared out by load and content', async () => {
  const k = kmView(await load(), 'group-a', 'older', TODAY);
  assert.equal(round(k.weeks.reduce((a, w) => a + w.estimate, 0), 6), 1000);
  // weeks 1-7 are R1-R2 and R2 (1.00), 8-10 R3 (0.57), 11-12 R7 aimed at the sprint race (0.24)
  assert.deepEqual(k.weeks.map(w => round(w.factor, 2)), [1, 1, 1, 1, 1, 1, 1, 0.57, 0.57, 0.57, 0.24, 0.24]);
  assert.deepEqual(k.weeks.map(w => w.load), [60, 80, 50, 80, 70, 100, 50, 80, 100, 50, 55, 40]);
  // with the same content, a 50% week gets half the km of a 100% week
  assert.equal(round(k.weeks[5].estimate / k.weeks[2].estimate, 6), 2);
  assert.equal(round(k.weeks[8].estimate / k.weeks[5].estimate, 2), 0.57);
  assert.deepEqual(k.weeks.map(w => Math.round(w.estimate)), [93, 124, 78, 124, 109, 155, 78, 71, 89, 44, 21, 15]);
  // a band with no yearly km has no estimates
  const y = kmView(await load(), 'group-a', 'younger', TODAY);
  assert.deepEqual([...new Set(y.weeks.map(w => w.estimate))], [null]);
  assert.equal(y.season.yearly, null);
});

test('estimates: a load set by hand, a changed block, and lowering one week moves km to the others', async () => {
  const base = kmView(await load(), 'group-a', 'older', TODAY);
  const k = kmView(await load({ 'plans/group-a/weeks.txt': '2026-01-19 R\n2026-02-02 C 35\n' }), 'group-a', 'older', TODAY);
  assert.equal(round(k.weeks.reduce((a, w) => a + w.estimate, 0), 6), 1000);
  assert.equal(round(k.weeks[4].estimate / k.weeks[2].estimate, 6), 0.7);
  assert.ok(k.weeks[0].estimate > base.weeks[0].estimate);
});

test('estimates: time that is not planned yet counts as an average planned week', async () => {
  const cycles = 'M\n  2 build  R2  Base\n  2 build  R3  Next\n  8 none  -  Unplanned\n';
  const k = kmView(await load({ 'plans/group-a/cycles.txt': cycles, 'plans/group-a/weeks.txt': '' }), 'group-a', 'older', TODAY);
  // coefs: C 0.8, R 0.5, then R3: 0.8 and 0.5 times 0.571; their average for each of the 8 unplanned weeks
  const mean = (0.8 + 0.5 + (0.8 + 0.5) * 8 / 14) / 4;
  assert.deepEqual(k.weeks.map(w => w.planned), [true, true, true, true, false, false, false, false, false, false, false, false]);
  assert.equal(round(k.weeks[4].coef, 9), round(mean, 9));
  assert.equal(round(k.weeks[0].estimate, 4), round(1000 * 0.8 / (12 * mean), 4));
  assert.equal(round(k.weeks.reduce((a, w) => a + w.estimate, 0), 6), 1000);
  // nothing planned at all: no estimates
  const none = kmView(await load({ 'plans/group-a/cycles.txt': 'M\n  12 none  -  Unplanned\n', 'plans/group-a/weeks.txt': '' }), 'group-a', 'older', TODAY);
  assert.deepEqual([...new Set(none.weeks.map(w => w.estimate))], [null]);
  // a week of it set by hand is planned
  const one = kmView(await load({ 'plans/group-a/cycles.txt': 'M\n  12 none  -  Unplanned\n', 'plans/group-a/weeks.txt': '2026-01-19 C\n' }), 'group-a', 'older', TODAY);
  assert.equal(round(one.weeks[2].estimate, 4), round(1000 / 12, 4));
});

test('km counted from sessions: per week, per zone, done and planned', async () => {
  const k = kmView(await load(), 'group-a', 'older', TODAY);
  const w = k.weeks[2];
  // Tuesday 7.87 km and Saturday 4.93 km; Thursday is marked not done and is left out
  assert.equal(round(w.km, 2), 12.79);
  assert.deepEqual(Object.fromEntries(Object.entries(w.zones).map(([z, v]) => [z, round(v, 2)])), { R1: 6.75, R2: 5.87, R6: 0.18 });
  assert.deepEqual(k.weeks.filter(x => x.km > 0).map(x => x.n), [3]);
  // Tuesday has passed, Saturday is still to come
  assert.deepEqual([round(k.season.done, 2), round(k.season.planned, 2)], [7.87, 4.93]);
  assert.deepEqual([k.season.endedKm, round(k.season.endedEstimate, 1)], [0, 217.2]);
  const later = kmView(await load(), 'group-a', 'older', '2026-02-01');
  assert.deepEqual([round(later.season.done, 2), later.season.planned, round(later.season.endedKm, 2)], [12.79, 0, 12.79]);
  // each band has its own km
  assert.equal(round(kmView(await load(), 'group-a', 'younger', TODAY).weeks[2].km, 2), 4);
});

test('km counted from sessions: off the water gives minutes, not km', async () => {
  const data = await load({ 'plans/group-a/sessions.txt': "2026-01-20 pm older pool: 10' R1 + 3x 10' R2/3'\n2026-01-21 am older gym not-done: 40' circuit\n2026-01-22 am older: 4km R1\n" });
  const w = kmView(data, 'group-a', 'older', TODAY).weeks[2];
  assert.deepEqual([w.km, w.zones, w.offMin], [4, { R1: 4 }, 40]);
  const v = e.weekView(data, 'group-a', 3, TODAY).days[1].sessions[0];
  assert.deepEqual([v.place, v.main, v.totalKm, v.offMin], ['pool', 'R2', 0, 40]);
});

test('km when the tables are not complete: counted, but no estimates', async () => {
  const data = await load({ 'tables.txt': fixture()['tables.txt'].replace(/^warmup.*\n/m, '') });
  const k = kmView(data, 'group-a', 'older', TODAY);
  assert.deepEqual([...new Set(k.weeks.map(w => w.estimate))], [null]);
  assert.equal(round(k.weeks[2].km, 2), 12.79);
});
