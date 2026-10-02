import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../src/engine.js';
import { gridView, contents, stateOf } from '../src/grid.js';
import { zoneCard, ZINFO } from '../src/zones.js';
import { gridReport, zoneReport } from '../src/report.js';
import { parseTables, serializeTables } from '../src/format.js';
import { memoryStore, fixture, TABLES } from './helpers.js';

const tables = parseTables(TABLES).value;
const load = changes => e.load(memoryStore({ ...fixture(), ...changes }));
const TODAY = '2026-01-21';   // Wednesday of week 3
const row = (g, zone) => g.rows.find(r => r.zone === zone);

test('the thresholds are the course table: sessions a week to develop and to maintain each content', () => {
  assert.deepEqual(contents(tables), [
    { key: 'R1', zones: ['R1'], develop: [4, 6], maintain: [3, 3] },
    { key: 'R2', zones: ['R2'], develop: [3, 4], maintain: [2, 2] },
    { key: 'R3-R3+', zones: ['R3', 'R3+'], develop: [2, 3], maintain: [1, 1] },
    { key: 'R4-R5', zones: ['R4', 'R5'], develop: [2, 4], maintain: [1, 1] },
    { key: 'R6', zones: ['R6'], develop: [3, 4], maintain: [1, 2] }
  ]);
  assert.equal(serializeTables(tables), TABLES);
  assert.deepEqual(tables.zones, { younger: ['R1', 'R6'] });
  assert.deepEqual(parseTables('zones older R6 R3+ R1\n').value.zones, { older: ['R1', 'R3+', 'R6'] });
  assert.match(parseTables('zones older\n').errors[0].message, /zones needs a band and its zones/);
  assert.match(parseTables('zones older R0\n').errors[0].message, /zones needs a band and its zones/);
  assert.match(parseTables('develop  R1 lots\n').errors[0].message, /sessions a week like 3 or 2-3/);
  assert.match(parseTables('develop  R0 2\n').errors[0].message, /a content like R1 or R3-R3\+/);
  assert.match(parseTables('maintain  R3-R3 2\n').errors[0].message, /a content like/);
  assert.match(parseTables('maintain  R1 4-3\n').errors[0].message, /sessions a week/);
});

test('what a number of sessions in a week means', () => {
  const c = Object.fromEntries(contents(tables).map(x => [x.key, x]));
  const states = (key, counts) => counts.map(n => stateOf(n, c[key]));
  assert.deepEqual(states('R1', [0, 1, 2, 3, 4, 6, 7]), ['absent', 'below maintenance', 'below maintenance', 'maintaining', 'developing', 'developing', 'developing']);
  assert.deepEqual(states('R2', [1, 2, 3]), ['below maintenance', 'maintaining', 'developing']);
  assert.deepEqual(states('R3-R3+', [1, 2]), ['maintaining', 'developing']);
  assert.deepEqual(states('R4-R5', [1, 2]), ['maintaining', 'developing']);
  assert.deepEqual(states('R6', [1, 2, 3]), ['maintaining', 'maintaining', 'developing']);
  // a zone with no counts in the table (R7)
  assert.deepEqual([stateOf(0, null), stateOf(2, null)], ['absent', 'trained']);
});

test('the grid: a row per zone, sessions by main zone', async () => {
  const g = gridView(await load(), 'group-a', 'older', TODAY);
  assert.deepEqual(g.rows.map(r => r.zone), ['R1', 'R2', 'R3', 'R3+', 'R4', 'R5', 'R6', 'R7']);
  const week3 = z => { const { n, ...rest } = row(g, z).weeks[2]; return { ...rest, km: +rest.km.toFixed(2) }; };
  // Tuesday is an R2 session and Saturday an R6 one; Thursday (R1) is marked not done
  assert.deepEqual(week3('R1'), { sessions: 0, together: 0, state: 'absent', km: 6.75 });
  assert.deepEqual(week3('R2'), { sessions: 1, together: 1, state: 'below maintenance', km: 5.87 });
  assert.deepEqual(week3('R6'), { sessions: 1, together: 1, state: 'maintaining', km: 0.18 });
  // a block marked R3 with no R3 session is an empty row
  assert.deepEqual([row(g, 'R3').sessions, row(g, 'R3').km, row(g, 'R7').content], [0, 0, null]);
  assert.deepEqual([row(g, 'R2').sessions, +row(g, 'R2').km.toFixed(2)], [1, 5.87]);
  // each band has its own grid; a session with no zone is in no row
  assert.deepEqual(gridView(await load(), 'group-a', 'younger', TODAY).rows.map(r => r.sessions), [0, 0, 0, 0, 0, 0, 0, 0]);
  // the rows are there before anything is planned
  const empty = gridView(await load(), 'group-b', 'masters', TODAY);
  assert.deepEqual([empty.rows.length, empty.rows[0].weeks.length, empty.rows.every(r => r.sessions === 0 && r.km === 0)], [8, 12, true]);
});

test('the grid: R3 with R3+ and R4 with R5 are counted together, as in the course', async () => {
  const sessions = [
    "2026-01-19 pm older: 2km R1 + 4x 4' R3/4' R1",          // R3
    "2026-01-20 pm older: 2km R1 + 5x 3' R3+/3' R1",         // R3+
    "2026-01-21 pm older: 2km R1 + 6x 300m R4/4'",           // R4
    "2026-01-22 pm older pool: 10' R1 + 3x 10' R2/3'",       // R2, in the pool
    "2026-01-23 pm older: 20' R0 games",                     // R0 only: in no row
    "2026-01-24 am older not-done: 2km R1 + 4x 200m R5/5'",  // R5, did not happen
    "2026-01-24 pm older: 2km R1 + 2x 1000m R7/10'"          // R7
  ].join('\n') + '\n';
  const g = gridView(await load({ 'plans/group-a/sessions.txt': sessions }), 'group-a', 'older', TODAY);
  const w = z => row(g, z).weeks[2];
  // one session each of R3 and R3+ make two of the content: developing
  assert.deepEqual([w('R3').sessions, w('R3').together, w('R3').state], [1, 2, 'developing']);
  assert.deepEqual([w('R3+').sessions, w('R3+').together, w('R3+').state], [1, 2, 'developing']);
  assert.deepEqual([w('R4').sessions, w('R4').together, w('R4').state], [1, 1, 'maintaining']);
  // off the water counts as a session of its zone, with no km
  assert.deepEqual([w('R2').sessions, w('R2').state, w('R2').km], [1, 'below maintenance', 0]);
  assert.deepEqual([w('R7').sessions, w('R7').state], [1, 'trained']);
  assert.deepEqual([w('R1').sessions, w('R5').sessions, w('R6').sessions], [0, 0, 0]);
});

test('the grid marks the zones the course does not suggest for the band', async () => {
  const data = await load();
  // younger has a zones line: R1 and R6 only
  assert.deepEqual(gridView(data, 'group-a', 'younger', TODAY).rows.map(r => r.suggested), [true, false, false, false, false, false, true, false]);
  // a band with no zones line has nothing marked
  assert.deepEqual([...new Set(gridView(data, 'group-a', 'older', TODAY).rows.map(r => r.suggested))], [null]);
  assert.match(gridReport(data, 'group-a', 'younger', TODAY), /\(zone\) not in the course's long-term table for this age\n\n   wk  monday      content  R1 +\(R2\) +\(R3\) +\(R3\+\) +\(R4\) +\(R5\) +R6 +\(R7\)\n/);
  // the card gives the youngest category with km in the zone (slide 172), whatever band is shown
  const ages = zone => zoneCard(zone, data.tables).rows.find(r => r[0] === 'Ages')[1];
  assert.deepEqual(['R1', 'R2', 'R3', 'R3+', 'R4', 'R5', 'R6', 'R7'].map(ages),
    ['From Iniciado.', 'From Infantil.', 'From Infantil.', 'From Cadete.', 'Seniors only.', 'From Junior.', 'From Iniciado.', 'From Infantil.']);
  const odd = await load({ 'tables.txt': fixture()['tables.txt'] + 'zones guest  R1\n' });
  assert.deepEqual(e.check(odd, TODAY).map(p => p.message), ['zones are given for "guest", which is not a band of any plan']);
});

test('check: the thresholds table must be consistent', async () => {
  const bad = fixture()['tables.txt'].replace('maintain  R1 3  R2 2', 'maintain  R1 3').replace('R4-R5 2-4  R6 3-4', 'R4-R5 2-4  R5-R6 3-4').replace('R4-R5 1  R6 1-2', 'R4-R5 1  R5-R6 1-2');
  assert.deepEqual(e.check(await load({ 'tables.txt': bad }), TODAY).map(p => p.message), [
    'develop and maintain must list the same contents; only one has R2',
    'develop lists R5 in two contents'
  ]);
  // without the table the grid still counts, with no states
  const none = await load({ 'tables.txt': fixture()['tables.txt'].replace(/^(develop|maintain).*\n/gm, '') });
  assert.deepEqual(e.check(none, TODAY), []);
  assert.equal(row(gridView(none, 'group-a', 'older', TODAY), 'R2').weeks[2].state, 'trained');
});

test('show grid prints the grid', async () => {
  assert.equal(gridReport(await load(), 'group-a', 'older', TODAY), `group-a · older · sessions a week by main zone, then km in the zone
D developing, M maintaining, b below maintenance, by the course's sessions a week; R3-R3+ and R4-R5 are counted together

   wk  monday      content  R1   R2    R3   R3+  R4   R5   R6     R7
    1  2026-01-05  R1-R2    ·    ·     ·    ·    ·    ·    ·      ·
    2  2026-01-12  R1-R2    ·    ·     ·    ·    ·    ·    ·      ·
>   3  2026-01-19  R1-R2    - 7  1b 6  ·    ·    ·    ·    1M <1  ·
    4  2026-01-26  R2       ·    ·     ·    ·    ·    ·    ·      ·
    5  2026-02-02  R2       ·    ·     ·    ·    ·    ·    ·      ·
    6  2026-02-09  R2       ·    ·     ·    ·    ·    ·    ·      ·
    7  2026-02-16  R2       ·    ·     ·    ·    ·    ·    ·      ·
    8  2026-02-23  R3       ·    ·     ·    ·    ·    ·    ·      ·
    9  2026-03-02  R3       ·    ·     ·    ·    ·    ·    ·      ·
   10  2026-03-09  R3       ·    ·     ·    ·    ·    ·    ·      ·
   11  2026-03-16  R7       ·    ·     ·    ·    ·    ·    ·      ·
   12  2026-03-23  R7       ·    ·     ·    ·    ·    ·    ·      ·
       season               0 7  1 6   0 0  0 0  0 0  0 0  1 <1   0 0`);
});

test('zone cards: km a year, and nothing about where the text comes from', () => {
  // km a year are the grid's own figures, from the zone-km lines; with none there is no such row
  assert.equal(zoneCard('R6', tables).rows.find(r => r[0] === 'Km a year'), undefined);
  const withKm = parseTables(TABLES + 'zone-km younger  R1 267  R6 7.2\nzone-km older  R1 840  R2 515  R6 21\n').value;
  assert.equal(zoneCard('R6', withKm).rows.find(r => r[0] === 'Km a year')[1], 'younger 7.2, older 21');
  assert.equal(zoneCard('R2', withKm).rows.find(r => r[0] === 'Km a year')[1], 'older 515');
  // a card says each thing once, and not where it comes from
  for (const zone of Object.keys(ZINFO)) {
    const card = zoneCard(zone, withKm), all = JSON.stringify(card);
    assert.doesNotMatch(all, /slide|course|Kayplan|Grau/i, zone);
    assert.equal(card.source, undefined);
    assert.equal(card.rows.find(r => r[0] === 'Intensity')[1].length <= 3, true);
  }
});

test("the course's km a year in each zone stand at the end of the rows", async () => {
  const none = gridView(await load(), 'group-a', 'older', TODAY);
  assert.deepEqual(none.rows.map(r => r.yearly), [null, null, null, null, null, null, null, null]);
  const text = TABLES + 'zone-km older  R1 580  R2 415.5  R6 21\n';
  const t = parseTables(text);
  assert.deepEqual([t.errors, t.value.zoneKm], [[], { older: { R1: 580, R2: 415.5, R6: 21 } }]);
  assert.equal(serializeTables(t.value), text);
  assert.match(parseTables('zone-km older  R0 5\n').errors[0].message, /a zone from R1 to R7 and its km a year/);
  const data = await load({ 'tables.txt': text + 'zone-km nobody  R1 5\n' });
  const g = gridView(data, 'group-a', 'older', TODAY);
  assert.deepEqual(g.rows.map(r => r.zone + ' ' + r.yearly), ['R1 580', 'R2 415.5', 'R3 null', 'R3+ null', 'R4 null', 'R5 null', 'R6 21', 'R7 null']);
  assert.match(gridReport(data, 'group-a', 'older', TODAY), /\n +season +\S.*\n +a year +580 +415\.5 +21$/);
  assert.deepEqual(e.check(data, TODAY).map(x => x.message), ['zone-km is given for "nobody", which is not a band of any plan']);
});

test('zone cards: the sessions per week follow the table', () => {
  const perWeek = z => zoneCard(z, tables).rows.find(r => r[0] === 'Per week')[1];
  assert.equal(perWeek('R1'), 'Develop: 4–6 sessions. Maintain: 3. Recovery after a session: 24 h.');
  assert.equal(perWeek('R3+'), 'Develop: 2–3 sessions. Maintain: 1. Counted together with R3. Recovery after a session: 48–72 h.');
  assert.equal(perWeek('R5'), 'Develop: 2–4 sessions. Maintain: 1. Counted together with R4. Recovery after a session: 48–72 h.');
  assert.equal(perWeek('R6'), 'Develop: 3–4 sessions. Maintain: 1–2. Recovery after a session: 24 h.');
  assert.equal(perWeek('R7'), 'At most 2 sessions per microcycle in preparation, 4 in the competitive period.');
  assert.equal(zoneCard('R0', tables), null);
  assert.match(zoneReport('R2', tables), /^R2 · Aerobic glycolytic\n[^]*\nHow to train:\n  - Continuous and interval methods\n[^]*\nPer week: Develop: 3–4 sessions\. Maintain: 2\./);
  assert.equal(zoneReport('R9', tables), null);
});
