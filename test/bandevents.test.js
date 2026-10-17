import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../src/engine.js';
import { setEvent } from '../src/edits.js';
import { parseEvents, serializeEvents } from '../src/format.js';
import { kmView } from '../src/km.js';
import { checksView } from '../src/checks.js';
import { seasonReport, weekReport } from '../src/report.js';
import { weekSheet } from '../src/export.js';
import { memoryStore, fixture } from './helpers.js';

// group-a has the bands older and younger. A race of the older band alone on Sunday 25 January
// (week 3), a camp of the younger band alone, a race of the plan where the younger band has its own
// importance, and in the R7 block (weeks 11 and 12) a sprint for the older band and a marathon for the
// younger one.
const EVENTS = `2026-01-25 Older cup
  kind: race
  type: sprint
  boats: solo
  plans: older 1

2026-01-26 Young camp
  until: 2026-01-27
  kind: camp
  plans: younger

2026-02-14 Spring regatta
  kind: race
  type: sprint
  boats: solo
  plans: group-a 3, younger 1, group-b 2

2026-03-21 Short final
  kind: race
  type: sprint
  boats: solo
  plans: older 1

2026-03-22 Long final
  kind: race
  type: maratona
  boats: mixed
  plans: younger 1
`;
const TODAY = '2026-01-21';
const load = changes => e.load(memoryStore({ ...fixture(), 'events.txt': EVENTS, ...changes }));
const names = (data, band) => e.eventsFor(data, 'group-a', TODAY, band).map(x => x.name + (x.importance ? ' ' + x.importance : ''));

test('events.txt: a plan means every band of it, a band that band alone, and a band\'s own entry comes first', async () => {
  const r = parseEvents(EVENTS);
  assert.deepEqual(r.errors, []);
  assert.equal(serializeEvents(r.value), EVENTS);
  const spring = r.value[2];
  assert.deepEqual([e.bandEntry(spring, 'group-a', 'older'), e.bandEntry(spring, 'group-a', 'younger'), e.bandEntry(spring, 'group-b', 'masters')], [3, 1, 2]);
  assert.equal(e.bandEntry(r.value[0], 'group-a', 'younger'), undefined);
  assert.equal(e.bandEntry({ plans: null }, 'group-a', 'younger'), null);
  const data = await load();
  assert.deepEqual(names(data, 'older'), ['Older cup 1', 'Spring regatta 3', 'Short final 1']);
  assert.deepEqual(names(data, 'younger'), ['Young camp', 'Spring regatta 1', 'Long final 1']);
  // with no band: those of any band, at their most important, saying which bands when not all
  const any = e.eventsFor(data, 'group-a', TODAY);
  assert.deepEqual(any.map(x => [x.name, x.importance, x.only]), [['Older cup', 1, ['older']], ['Young camp', null, ['younger']], ['Spring regatta', 1, null], ['Short final', 1, ['older']], ['Long final', 1, ['younger']]]);
  assert.deepEqual(e.check(data, TODAY).filter(p => p.level === 'error'), []);
});

test('check: a name that is neither a plan nor a band; a band in two plans, or with the name of a plan', async () => {
  const data = await load({ 'events.txt': '2026-02-14 Race\n  kind: race\n  type: sprint\n  boats: solo\n  plans: elder 1\n', 'plans/group-b/plan.txt': 'name: Group B\nbands: masters, younger, group-a\n' });
  assert.deepEqual(e.check(data, TODAY).filter(p => p.level === 'error').map(p => p.file + ' ' + p.message), [
    'plans/group-b/plan.txt band "younger" is also in plan group-a: a band can be in one plan only',
    'plans/group-b/plan.txt band "group-a" has the name of a plan',
    'events.txt Race: there is no plan or band "elder"']);
});

test('per band: the sheet\'s races, the week\'s banners, the race an R7 block aims at, the days around a race', async () => {
  const data = await load({ 'plans/group-a/sessions.txt': '2026-01-26: 6km R1\n' });
  assert.deepEqual(e.sheet(data, 'group-a', TODAY, 'younger').weeks[2].events.map(x => x.name), []);
  assert.deepEqual(e.sheet(data, 'group-a', TODAY, 'older').weeks[2].events.map(x => x.name), ['Older cup']);
  assert.deepEqual(e.weekView(data, 'group-a', 4, TODAY, 'younger').days[0].events.map(x => x.name), ['Young camp']);
  assert.deepEqual(e.weekView(data, 'group-a', 4, TODAY, 'older').days[0].events, []);
  // the R7 block takes its km from each band's own race: a sprint, a marathon
  const factor = b => kmView(data, 'group-a', b, TODAY).weeks[10].factor;
  assert.deepEqual([factor('older'), factor('younger')], [(1.4 + 2) / 14, (13.5 + 2) / 14]);
  // the day after the older band's race: a day off is recommended to the older band alone
  const after = b => checksView(data, 'group-a', b, TODAY)[3].week.filter(t => /day after/.test(t));
  assert.deepEqual([after('older'), after('younger')], [['Mon is the day after Older cup: a day off is recommended'], []]);
  // the command line: with a band, its races; without one, saying whose
  assert.match(seasonReport(data, 'group-a', TODAY), /S1 Older cup \(Sun 2026-01-25, sprint, solo, importance 1, for older\)/);
  assert.doesNotMatch(seasonReport(data, 'group-a', TODAY, 'younger'), /Older cup/);
  assert.match(weekReport(data, 'group-a', 3, TODAY, 'older'), /\n  S1 Older cup/);
  assert.doesNotMatch(weekReport(data, 'group-a', 3, TODAY, 'younger'), /Older cup/);
});

test('the day page and the sheet: the races of the bands that train; with no band, those of the whole plan', async () => {
  const younger = await load({ 'plans/group-a/sessions.txt': '2026-01-25 younger: 6km R1\n' });
  assert.deepEqual(e.dayView(younger, '2026-01-25', TODAY).plans[0].events, []);
  const all = await load({ 'plans/group-a/sessions.txt': '2026-01-25: 6km R1\n' });
  assert.deepEqual(e.dayView(all, '2026-01-25', TODAY).plans[0].events.map(x => x.name), ['Older cup']);
  // nobody trains: the events of any band
  assert.deepEqual(e.dayView(all, '2026-01-26', TODAY).plans[0].events.map(x => x.name), ['Young camp']);
  assert.deepEqual(weekSheet(all, 'group-a', 'older', 3, TODAY).days[6].events, ['Older cup']);
  assert.deepEqual(weekSheet(all, 'group-a', 'younger', 3, TODAY).days[6].events, []);
  assert.deepEqual(weekSheet(all, 'group-a', '', 3, TODAY).days[6].events, []);
  assert.deepEqual(weekSheet(all, 'group-a', '', 6, TODAY).days[5].events, ['Spring regatta']);
});

test('editing an event: a band\'s own entry beside its plan\'s, written in the order of plans and bands', () => {
  const ids = ['group-a', 'group-b'], order = ['group-a', 'older', 'younger', 'group-b'];
  const race = { date: '2026-02-14', until: null, confirmed: true, name: 'R', place: '', kind: 'race', type: 'sprint', boats: 'solo', plans: { 'group-b': 2 } };
  let r = setEvent(race, { plan: { id: 'younger', value: 1 } }, ids, order);
  r = setEvent(r, { plan: { id: 'group-a', value: 3 } }, ids, order);
  assert.deepEqual(Object.entries(r.plans), [['group-a', 3], ['younger', 1], ['group-b', 2]]);
  assert.deepEqual(setEvent(r, { plan: { id: 'younger', value: null } }, ids, order).plans, { 'group-a': 3, 'group-b': 2 });
  assert.throws(() => setEvent(race, { plan: { id: 'elder', value: 1 } }, ids, order), /no plan or band "elder"/);
  // another event: a band alone, and back to every plan
  const camp = { date: '2026-02-16', until: null, confirmed: true, name: 'Camp', place: '', kind: 'camp', type: null, boats: null, plans: null };
  let c = setEvent(camp, { plan: { id: 'group-a', value: null } }, ids, order);
  c = setEvent(c, { plan: { id: 'younger', value: true } }, ids, order);
  c = setEvent(c, { plan: { id: 'group-b', value: null } }, ids, order);
  assert.deepEqual(c.plans, { younger: null });
  assert.match(serializeEvents([c]), /\n  plans: younger\n$/);
  assert.equal(setEvent(setEvent(c, { plan: { id: 'group-a', value: true } }, ids, order), { plan: { id: 'group-b', value: true } }, ids, order).plans, null);
});
