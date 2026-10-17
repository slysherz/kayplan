import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../src/engine.js';
import { putSession, removeSession } from '../src/edits.js';
import { parseSessions, serializeSessions, sessionKey } from '../src/format.js';
import { kmView } from '../src/km.js';
import { gridView } from '../src/grid.js';
import { checksView } from '../src/checks.js';
import { suggestions } from '../src/suggest.js';
import { weekReport, dayReport } from '../src/report.js';
import { weekSheet, dayRows, sheetHtml, fitted } from '../src/export.js';
import { memoryStore, fixture } from './helpers.js';

// week 3 is 19 to 25 January; its Monday has a session of its own too
const WEEK = `2026-01-19 older: 6km R1
2026-01-19 older gym week: Strength I
  half the reps
2026-01-19 older week: 4x 4' R3/4' R1
`;
const TODAY = '2026-01-21';
const load = () => e.load(memoryStore({ ...fixture(), 'plans/group-a/sessions.txt': fixture()['plans/group-a/sessions.txt'] + WEEK }));

test('a session of the whole week: "week" after the place, on the Monday, numbered apart from the Monday\'s', () => {
  const r = parseSessions(WEEK);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value.map(s => [s.week, s.slot, s.place, sessionKey(s)]), [[false, 1, 'water', '2026-01-19 1'], [true, 1, 'gym', '2026-01-19 w1'], [true, 2, 'water', '2026-01-19 w2']]);
  // written back with the week's sessions before the Monday's
  assert.equal(serializeSessions(r.value), "2026-01-19 older gym week: Strength I\n  half the reps\n2026-01-19 older week: 4x 4' R3/4' R1\n2026-01-19 older: 6km R1\n");
  assert.match(parseSessions('2026-01-20 older week: 6km R1\n').errors[0].message, /on its Monday/);
});

test('week sessions: added after the week\'s others, removed without moving the Monday\'s', async () => {
  const data = await load(), plan = e.planOf(data, 'group-a');
  const more = putSession(plan, { date: '2026-01-19', band: 'older', place: 'land', week: true, text: "30' R1" });
  assert.deepEqual(more.sessions.filter(s => s.week).map(s => [s.slot, s.text]), [[1, 'Strength I'], [2, "4x 4' R3/4' R1"], [3, "30' R1"]]);
  const less = removeSession(more, '2026-01-19 w1');
  assert.deepEqual(less.sessions.filter(s => s.date === '2026-01-19').map(sessionKey), ['2026-01-19 1', '2026-01-19 w1', '2026-01-19 w2']);
  assert.throws(() => putSession(plan, { date: '2026-01-20', band: 'older', week: true, text: '' }), /on its Monday/);
});

test('the week shows them apart from its days; the day page shows them on every day of the week', async () => {
  const data = await load(), w = e.weekView(data, 'group-a', 3, TODAY);
  assert.deepEqual(w.days[0].sessions.map(s => s.text), ['6km R1']);
  assert.deepEqual(w.week.map(s => [s.text, s.main, s.status]), [['Strength I', null, 'planned'], ["4x 4' R3/4' R1", 'R3', 'planned']]);
  // done once the week has ended
  assert.equal(e.weekView(data, 'group-a', 3, '2026-01-26').week[1].status, 'done');
  for (const day of ['2026-01-19', '2026-01-23', '2026-01-25']) assert.equal(e.dayView(data, day, TODAY).plans[0].anyDay.length, 2, day);
  assert.equal(e.dayView(data, '2026-01-26', TODAY).plans[0].anyDay.length, 0);
  // the nearest days with a session are those with one of their own
  assert.deepEqual([e.dayView(data, '2026-01-23', TODAY).prev, e.dayView(data, '2026-01-23', TODAY).next], ['2026-01-22', '2026-01-24']);
  assert.match(dayReport(data, '2026-01-23', TODAY), /group-a older gym · any day · no zone · Strength I\n    half the reps/);
  assert.match(weekReport(data, 'group-a', 3, TODAY, 'older'), /Sun 2026-01-25\nAny day\n  1 older gym · planned · main zone none · Strength I\n/);
});

test('they count for the week: km, the grid and the week\'s content, but not the checks that need a day', async () => {
  const data = await load();
  assert.equal(Math.round(kmView(data, 'group-a', 'older', TODAY).weeks[2].zones.R3 * 10) / 10, 3.2);
  assert.equal(gridView(data, 'group-a', 'older', TODAY).rows.find(r => r.zone === 'R3').weeks[2].sessions, 1);
  const c = checksView(data, 'group-a', 'older', TODAY)[2];
  // the R3 session of the week is not "less than 48 h" from any day, nor after volume on its Monday
  assert.ok(!c.week.some(t => /apart|first/.test(t)), c.week.join('\n'));
  assert.ok(c.sessions['2026-01-19 w2'].some(t => /R3/.test(t)));
  // suggested for a week slot, and nothing clashes with a day
  const r = suggestions(data, 'group-a', 'older', '2026-01-19', 3, TODAY, { week: true, limit: 99 });
  assert.ok(r.list.length && r.list.every(x => !x.clash));
});

test('the exported sheet has them at the bottom like the club\'s gym tables, boxed: the title, then the plan a part a line, then the notes', async () => {
  const sh = weekSheet(await load(), 'group-a', 'older', 3, TODAY);
  assert.deepEqual(sh.days[0].sessions.map(x => x.lines), [['6km R1']]);
  // with no title, no heading: the plan and the notes
  assert.deepEqual(sh.anyDay, [{ title: [], lines: ['Strength I', 'half the reps'] }, { title: [], lines: ["4x 4' R3/4' R1"] }]);
  assert.ok(!dayRows(sh).flat().some(c => c && /Strength/.test(c.t)));
  const titled = weekSheet(await e.load(memoryStore({ ...fixture(), 'plans/group-a/sessions.txt':
    "2026-01-19 older gym week: Força I = Supino 60% + Tração 60%\n2026-01-19 older land week: 45-60' R1\n2026-01-19 older land week: Corrida longa = 60' R1\n" })), 'group-a', 'older', 3, TODAY);
  // the place in front only on land or in the pool
  assert.deepEqual(titled.anyDay, [
    { title: ['Força I'], lines: ['Supino 60%', 'Tração 60%'] },
    { title: ['Run'], lines: ["45-60' R1"] },
    { title: ['Run: Corrida longa'], lines: ["60' R1"] }]);
  const html = sheetHtml(titled);
  // the title in bold italic, a blank row, a line each; the third column has its own
  assert.match(html, /class="head"><div><span>Força I<\/span><\/div><\/td><td [^>]*><\/td><td [^>]*class="head"><div><span>Run<\/span>/);
  assert.match(html, /class="item"><div><span>Supino 60%<\/span>[^]*class="item"><div><span>Tração 60%<\/span>/);
  // each in a black box, as the club's gym tables: a line under the title, the sides black
  assert.match(html, /<td style="border-right-color:#000000;border-bottom-color:#000000;border-left:0.5pt solid #000000" class="head"><div><span>Força I<\/span>/);
  assert.match(html, /<td style="border-right-color:#000000;border-bottom-color:#D9D9D9;border-left:0.5pt solid #000000" class="item"><div><span>Supino 60%<\/span>/);
  assert.deepEqual(fitted('Gym: 4-6 exercises, 2-3x 10-15 reps, tempo 2:2', 34), ['Gym: 4-6 exercises, 2-3x 10-15', 'reps, tempo 2:2']);
});
