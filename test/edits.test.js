import test from 'node:test';
import assert from 'node:assert/strict';
import * as ed from '../src/edits.js';
import * as e from '../src/engine.js';
import { parseTables, parseEvents, serializeEvents } from '../src/format.js';
import { memoryStore, fixture, TABLES } from './helpers.js';

const tables = parseTables(TABLES).value;
const IDS = ['group-a', 'group-b'];
const plan = () => ({ id: 'group-a', bands: ['older', 'younger'], hand: [{ monday: '2026-01-19', type: 'R', load: null }], sessions: [{ date: '2026-01-20', slot: 'pm', band: 'older', notDone: false, text: '6km R1', notes: '' }] });
const race = () => ({ date: '2026-02-14', until: null, confirmed: false, name: 'Spring regatta', place: 'Lake', kind: 'race', type: 'sprint', boats: 'solo', plans: { 'group-a': 1 } });

test('a week set by hand, and back to its pattern', () => {
  assert.deepEqual(ed.setWeek(plan(), '2026-01-26', 'CH', null, tables).hand, [{ monday: '2026-01-19', type: 'R', load: null }, { monday: '2026-01-26', type: 'CH', load: null }]);
  assert.deepEqual(ed.setWeek(plan(), '2026-01-19', 'C', 70, tables).hand, [{ monday: '2026-01-19', type: 'C', load: 70 }]);
  // a load equal to the type's is not kept
  assert.deepEqual(ed.setWeek(plan(), '2026-01-19', 'C', 80, tables).hand, [{ monday: '2026-01-19', type: 'C', load: null }]);
  assert.deepEqual(ed.setWeek(plan(), '2026-01-19', 'C', 0, tables).hand, [{ monday: '2026-01-19', type: 'C', load: 0 }]);
  assert.deepEqual(ed.setWeek(plan(), '2026-01-19', null, null, tables).hand, []);
  assert.throws(() => ed.setWeek(plan(), '2026-01-19', 'X', null, tables), /no week type "X"/);
  assert.throws(() => ed.setWeek(plan(), '2026-01-19', 'C', 120, tables), /0 to 100/);
  assert.throws(() => ed.setWeek(plan(), '2026-01-19', 'C', 7.5, tables), /whole number/);
});

test('sessions: add, replace, remove', () => {
  const added = ed.putSession(plan(), { date: '2026-01-21', slot: 'am', band: 'younger', text: ' 4km\n R1 ', notes: 'easy' });
  assert.deepEqual(added.sessions[1], { date: '2026-01-21', slot: 'am', band: 'younger', notDone: false, text: '4km R1', notes: 'easy' });
  const replaced = ed.putSession(plan(), { date: '2026-01-20', slot: 'pm', band: 'older', text: '8km R1', notDone: true });
  assert.deepEqual(replaced.sessions, [{ date: '2026-01-20', slot: 'pm', band: 'older', notDone: true, text: '8km R1', notes: '' }]);
  assert.deepEqual(ed.removeSession(plan(), '2026-01-20 pm older').sessions, []);
  assert.equal(ed.removeSession(plan(), '2026-01-20 am older').sessions.length, 1);
  assert.throws(() => ed.putSession(plan(), { date: '2026-01-20', slot: 'pm', band: 'guest', text: '' }), /no band "guest"/);
  assert.throws(() => ed.putSession(plan(), { date: '2026-01-20', slot: 'noon', band: 'older', text: '' }), /morning/);
  assert.throws(() => ed.putSession(plan(), { date: 'soon', slot: 'am', band: 'older', text: '' }), /needs a date/);
});

test('events: fields', () => {
  assert.deepEqual(ed.newEvent('2026-03-01'), { date: '2026-03-01', until: null, confirmed: true, name: 'New event', place: '', kind: 'race', type: 'fundo', boats: 'mixed', plans: {} });
  const r = ed.setEvent(race(), { name: '  Summer   regatta ', place: ' River ', confirmed: true, type: 'fundo', boats: 'crew' }, IDS);
  assert.deepEqual([r.name, r.place, r.confirmed, r.type, r.boats], ['Summer regatta', 'River', true, 'fundo', 'crew']);
  assert.throws(() => ed.setEvent(race(), { name: ' ' }, IDS), /needs a name/);
  assert.throws(() => ed.setEvent(race(), { date: '2026-02-31' }, IDS), /needs a date/);
  assert.throws(() => ed.setEvent(race(), { type: 'slalom' }, IDS), /only races have a type/);
  // dates
  assert.equal(ed.setEvent(race(), { until: '2026-02-15' }, IDS).until, '2026-02-15');
  assert.equal(ed.setEvent(race(), { until: '2026-02-14' }, IDS).until, null);
  assert.equal(ed.setEvent(race(), { until: '' }, IDS).until, null);
  assert.throws(() => ed.setEvent(race(), { until: '2026-02-13' }, IDS), /cannot end before it starts/);
  const long = ed.setEvent(race(), { until: '2026-02-16' }, IDS);
  assert.equal(ed.setEvent(long, { date: '2026-02-15' }, IDS).until, '2026-02-16');
  assert.equal(ed.setEvent(long, { date: '2026-02-20' }, IDS).until, null);
  // the event passed in is never changed
  const before = race();
  ed.setEvent(before, { plan: { id: 'group-b', value: 3 }, name: 'Other' }, IDS);
  ed.setEvent(before, { kind: 'camp' }, IDS);
  assert.deepEqual(before, race());
});

test('events: which plans, and how important', () => {
  // plans are kept in the order of the plans, whatever the order of the clicks
  let r = ed.setEvent({ ...race(), plans: { 'group-b': 3 } }, { plan: { id: 'group-a', value: 1 } }, IDS);
  assert.deepEqual(Object.entries(r.plans), [['group-a', 1], ['group-b', 3]]);
  r = ed.setEvent(r, { plan: { id: 'group-a', value: null } }, IDS);
  assert.deepEqual(r.plans, { 'group-b': 3 });
  assert.deepEqual(ed.setEvent(r, { plan: { id: 'group-b', value: null } }, IDS).plans, {});
  assert.throws(() => ed.setEvent(race(), { plan: { id: 'group-a', value: 4 } }, IDS), /1, 2 or 3/);
  assert.throws(() => ed.setEvent(race(), { plan: { id: 'group-z', value: 1 } }, IDS), /no plan "group-z"/);

  // an event that is not a race: every plan (no list), or some of them
  const camp = { date: '2026-02-16', until: null, confirmed: true, name: 'Camp', place: '', kind: 'camp', type: null, boats: null, plans: null };
  const some = ed.setEvent(camp, { plan: { id: 'group-a', value: null } }, IDS);
  assert.deepEqual(some.plans, { 'group-b': null });
  assert.equal(ed.setEvent(some, { plan: { id: 'group-a', value: true } }, IDS).plans, null);
  assert.throws(() => ed.setEvent(some, { plan: { id: 'group-b', value: null } }, IDS), /at least one plan/);
  assert.throws(() => ed.setEvent(camp, { plan: { id: 'group-a', value: 2 } }, IDS), /only races have an importance/);
});

test('events: changing the kind keeps the plans', () => {
  const camp = ed.setEvent(race(), { kind: 'camp' }, IDS);
  assert.deepEqual([camp.kind, camp.type, camp.boats, camp.plans], ['camp', null, null, { 'group-a': null }]);
  const again = ed.setEvent(camp, { kind: 'race' }, IDS);
  assert.deepEqual([again.type, again.boats, again.plans], ['fundo', 'mixed', { 'group-a': 2 }]);
  const all = ed.setEvent({ ...race(), plans: { 'group-a': 1, 'group-b': 2 } }, { kind: 'holiday' }, IDS);
  assert.equal(all.plans, null);
  assert.deepEqual(ed.setEvent(all, { kind: 'race' }, IDS).plans, { 'group-a': 2, 'group-b': 2 });
  assert.throws(() => ed.setEvent(race(), { kind: 'party' }, IDS), /unknown kind/);
  // every result can be written and read back
  for (const ev of [camp, again, all, ed.newEvent('2026-03-01')]) {
    const back = parseEvents(serializeEvents([ev]));
    assert.deepEqual(back.errors, []);
    const { line, ...rest } = back.value[0];
    assert.deepEqual(rest, ev);
  }
});

test('fileText writes each file the edits change, and nothing else', async () => {
  const files = fixture(), data = await e.load(memoryStore(files));
  for (const path of ['events.txt', 'plans/group-a/cycles.txt', 'plans/group-a/weeks.txt', 'plans/group-a/sessions.txt', 'plans/group-b/sessions.txt']) {
    assert.equal(e.fileText(data, path), files[path], path);
  }
  assert.throws(() => e.fileText(data, 'season.txt'), /not a file the plan writes/);
  assert.throws(() => e.fileText(data, 'plans/group-z/cycles.txt'), /not a file the plan writes/);
});
