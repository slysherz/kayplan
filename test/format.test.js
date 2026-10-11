import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../src/format.js';
import { fixture, TABLES, CYCLES } from './helpers.js';

const files = fixture();
const strip = list => list.map(({ line, ...rest }) => rest);

test('every canonical file reads and writes back to the same text', () => {
  const round = (text, parse, serialize, ...more) => {
    const r = parse(text);
    assert.deepEqual(r.errors, []);
    assert.equal(serialize(r.value, ...more), text);
  };
  round(files['season.txt'], f.parseSeason, f.serializeSeason);
  round(TABLES.replace('yearly', 'pace older  R1 10  R2 11.5\nyearly') + 'place 1km Dock-Bridge\nplace 300m Island lap\n', f.parseTables, f.serializeTables);
  // a file from before the km tables still reads and writes back unchanged
  round(TABLES.split('\n').slice(0, 3).join('\n') + '\n', f.parseTables, f.serializeTables);
  round(files['events.txt'], f.parseEvents, f.serializeEvents);
  round(files['plans/group-a/plan.txt'], f.parsePlanFile, f.serializePlanFile);
  round(CYCLES, f.parseCycles, f.serializeCycles);
  round(files['plans/group-b/cycles.txt'], f.parseCycles, f.serializeCycles);
  round(files['plans/group-a/weeks.txt'], f.parseWeeks, f.serializeWeeks);
  round(files['plans/group-a/sessions.txt'], f.parseSessions, f.serializeSessions, ['older', 'younger']);
  for (const [parse, serialize] of [[f.parseEvents, f.serializeEvents], [f.parseWeeks, f.serializeWeeks], [f.parseSessions, f.serializeSessions]]) {
    assert.deepEqual(parse('').value, []);
    assert.equal(serialize([]), '');
  }
});

test('season', () => {
  assert.deepEqual(f.parseSeason('start: 2026-09-28\nweeks: 45\n').value, { start: '2026-09-28', weeks: 45, plans: [], name: '' });
  // the order of the plans, when it is given
  const ordered = f.parseSeason('start: 2026-09-28\nplans:  group-b,group-a\nweeks: 45\n');
  assert.deepEqual(ordered.value, { start: '2026-09-28', weeks: 45, plans: ['group-b', 'group-a'], name: '' });
  assert.equal(f.serializeSeason(ordered.value), 'start: 2026-09-28\nweeks: 45\nplans: group-b, group-a\n');
  assert.match(f.parseSeason('start: 2026-09-28\nweeks: 45\nplans: a, a\n').errors[0].message, /listed twice/);
  assert.match(f.parseSeason('start: 2026-09-28\nweeks: 45\nplans: Group A\n').errors[0].message, /cannot be a plan/);
  assert.match(f.parseSeason('start: 2026-09-29\nweeks: 45\n').errors[0].message, /Monday/);
  assert.match(f.parseSeason('start: 2026-02-30\nweeks: 45\n').errors[0].message, /date/);
  assert.match(f.parseSeason('start: 2026-09-28\nweeks: many\n').errors[0].message, /weeks/);
  assert.match(f.parseSeason('weeks: 45\n').errors[0].message, /start is missing/);
  assert.match(f.parseSeason('').errors[0].message, /start is missing/);
  assert.deepEqual(f.parseSeason('start: 2026-09-28\nweeks: 45\nend: soon\n').errors, [{ line: 3, message: 'cannot read "end: soon"' }]);
});

test('tables', () => {
  const t = f.parseTables(TABLES + 'place 1.5km Long reach\n').value;
  assert.deepEqual(t.load, { I: 60, C: 80, CH: 100, R: 50, AT: 55, CT: 40 });
  assert.equal(t.reference.R5, 270);
  assert.equal(t.reference.R1, 7200);
  assert.equal(t.pace.default['R3+'], 12.8);
  assert.deepEqual(t.places, [{ name: 'Long reach', m: 1500 }]);
  assert.deepEqual(t.yearly, { older: 1000 });
  assert.deepEqual(t.hard, { R1: 12, R2: 12, R3: 6, 'R3+': 3.2, R4: 2.2, R5: 1, R6: 0.5 });
  assert.deepEqual(t.race, { sprint: 1.4, fundo: 6, maratona: 13.5 });
  assert.equal(t.warmup, 2);
  assert.equal(f.parseTables('load  C 80\n').value.warmup, null);
  assert.match(f.parseTables('yearly  older lots\n').errors[0].message, /water km per season/);
  assert.match(f.parseTables('hard  R7 5\n').errors[0].message, /R1 to R6/);
  assert.match(f.parseTables('race  slalom 5\n').errors[0].message, /sprint, fundo or maratona/);
  assert.match(f.parseTables('warmup 2 km\n').errors[0].message, /one number/);
  assert.match(f.parseTables('load  C\n').errors[0].message, /pairs/);
  assert.match(f.parseTables('load  C 180\n').errors[0].message, /0 to 100/);
  assert.match(f.parseTables('reference  R9 10\'\n').errors[0].message, /zone/);
  assert.match(f.parseTables('reference  R1 soon\n').errors[0].message, /time/);
  assert.match(f.parseTables('pace default  R1 fast\n').errors[0].message, /km\/h/);
  assert.match(f.parseTables('place far Dock\n').errors[0].message, /distance/);
  assert.match(f.parseTables('load  C 80\nload  C 70\n').errors[0].message, /twice/);
  assert.deepEqual(f.parseTables('speed 4\n').errors, [{ line: 1, message: 'cannot read "speed 4"' }]);
});

test('events', () => {
  const events = f.parseEvents(files['events.txt']).value;
  assert.deepEqual(strip(events), [
    { date: '2026-02-14', until: null, confirmed: false, name: 'Spring regatta', place: 'Lake', kind: 'race', type: 'sprint', boats: 'solo', plans: { 'group-a': 1 } },
    { date: '2026-02-16', until: '2026-02-22', confirmed: true, name: 'Carnival break', place: '', kind: 'holiday', type: null, boats: null, plans: null },
    { date: '2026-03-07', until: '2026-03-08', confirmed: true, name: 'Long race', place: '', kind: 'race', type: 'maratona', boats: 'mixed', plans: { 'group-b': 3 } }
  ]);
  assert.equal(events[1].line, 9);
  const bad = text => f.parseEvents(text).errors.map(e => e.line + ': ' + e.message).join(' | ');
  assert.match(bad('Spring regatta\n  kind: race\n'), /^1: an event starts with its date/);
  assert.match(bad('2026-02-14 Race\n  kind: party\n'), /kind must be one of/);
  assert.match(bad('2026-02-14 Race\n  kind: race\n  boats: solo\n'), /needs type/);
  assert.match(bad('2026-02-14 Race\n  kind: race\n  type: sprint\n'), /needs boats/);
  assert.match(bad('2026-02-14 Camp\n  kind: camp\n  type: sprint\n'), /only races/);
  assert.match(bad('2026-02-14 Camp\n  kind: camp\n  until: 2026-02-10\n'), /on or after/);
  assert.match(bad('2026-02-14 Camp\n  kind: camp\n  confirmed: maybe\n'), /yes or no/);
  assert.match(bad('2026-02-14 Camp\n  kind: camp\n  where: here\n'), /^3: cannot read "where: here"/);
  assert.match(bad('2026-02-14 Race\n  kind: race\n  type: sprint\n  boats: solo\n  plans: group-a\n'), /plan importance/);
  assert.match(bad('2026-02-14 Race\n  kind: race\n  type: sprint\n  boats: solo\n  plans: group-a 4\n'), /plan importance/);
  assert.match(bad('2026-02-14 Camp\n  kind: camp\n  plans: group-a 1\n'), /only races have an importance/);
  // an event with a problem is left out, the others are kept
  assert.equal(f.parseEvents('2026-02-14 Camp\n  kind: party\n\n2026-02-15 Test\n  kind: test\n').value.length, 1);
});

test('events are written in date order, with only what is not the default', () => {
  const text = f.serializeEvents([
    { date: '2026-03-01', until: null, confirmed: true, name: 'Zeta', place: '', kind: 'test', type: null, boats: null, plans: { 'group-a': null } },
    { date: '2026-03-01', until: '2026-03-01', confirmed: true, name: 'Alpha', place: 'River', kind: 'race', type: 'fundo', boats: 'crew', plans: {} },
    { date: '2026-01-10', until: '2026-01-12', confirmed: false, name: 'Camp', place: '', kind: 'camp', type: null, boats: null, plans: null }
  ]);
  assert.equal(text, `2026-01-10 Camp
  until: 2026-01-12
  confirmed: no
  kind: camp

2026-03-01 Alpha
  place: River
  kind: race
  type: fundo
  boats: crew

2026-03-01 Zeta
  kind: test
  plans: group-a
`);
  assert.deepEqual(f.parseEvents(text).errors, []);
});

test('plan file', () => {
  assert.deepEqual(f.parsePlanFile('name: Group A\nbands: older, younger\n').value, { name: 'Group A', bands: ['older', 'younger'] });
  assert.match(f.parsePlanFile('name: Group A\nbands: Older\n').errors[0].message, /lower case/);
  assert.match(f.parsePlanFile('name: Group A\nbands: a, a\n').errors[0].message, /each once/);
  assert.match(f.parsePlanFile('name: Group A\n').errors[0].message, /bands is missing/);
});

test('cycles', () => {
  const macros = f.parseCycles(CYCLES).value;
  assert.deepEqual(macros, [
    { name: 'First macro', mesos: [{ len: 3, pat: 'intro', zones: ['R1', 'R2'], name: 'General one' }, { len: 4, pat: 'build', zones: ['R2'], name: 'General two' }] },
    { name: 'Second macro', mesos: [{ len: 3, pat: 'build', zones: ['R3'], name: 'Specific' }, { len: 2, pat: 'comp', zones: ['R7'], name: 'Racing' }] }
  ]);
  assert.deepEqual(f.parseCycles('M\n  45 none - Unplanned\n').value[0].mesos[0], { len: 45, pat: 'none', zones: [], name: 'Unplanned' });
  // contents are kept in zone order
  assert.deepEqual(f.parseCycles('M\n  4 build R3+-R3 Block\n').value[0].mesos[0].zones, ['R3', 'R3+']);
  const bad = text => f.parseCycles(text).errors.map(e => e.line + ': ' + e.message).join(' | ');
  assert.match(bad('M\n  4 build R2\n'), /^2: a mesocycle is written/);
  assert.match(bad('M\n  0 build R2 Block\n'), /at least one week/);
  assert.match(bad('M\n  4 wave R2 Block\n'), /pattern must be one of/);
  assert.match(bad('M\n  4 build R0 Block\n'), /contents are zones/);
  assert.match(bad('M\n  4 build R2-R2 Block\n'), /contents are zones/);
  assert.match(bad('M\n4 build R2 Block\n'), /has no mesocycles/);
  assert.match(bad('  4 build R2 Block\n'), /^1: indented line with nothing above it/);
});

test('weeks set by hand', () => {
  assert.deepEqual(strip(f.parseWeeks('2026-01-19 R\n2026-02-02 C 70\n').value), [{ monday: '2026-01-19', type: 'R', load: null }, { monday: '2026-02-02', type: 'C', load: 70 }]);
  assert.equal(f.serializeWeeks([{ monday: '2026-02-02', type: 'C', load: 0 }, { monday: '2026-01-19', type: 'R', load: null }]), '2026-01-19 R\n2026-02-02 C 0\n');
  assert.match(f.parseWeeks('2026-01-19 r\n').errors[0].message, /a week is written/);
  assert.match(f.parseWeeks('2026-01-19 R 130\n').errors[0].message, /a week is written/);
  assert.match(f.parseWeeks('2026-01-19 R\n2026-01-19 C\n').errors[0].message, /twice/);
});

test('sessions', () => {
  const sessions = f.parseSessions(files['plans/group-a/sessions.txt']).value;
  assert.deepEqual(strip(sessions), [
    { date: '2026-01-20', slot: 1, band: 'older', place: 'water', alt: false, notDone: false, text: "1km R1 + 8x 4' R2/1' R0 + 1km R1", notes: 'crew boats on the last four\n\nwatch the stroke rate' },
    { date: '2026-01-20', slot: 1, band: 'younger', place: 'water', alt: false, notDone: false, text: '2x2000m', notes: '' },
    { date: '2026-01-22', slot: 1, band: 'older', place: 'water', alt: false, notDone: true, text: "6km R1 + 4x(15'' R7 + 15'' R0)", notes: 'no water' },
    { date: '2026-01-24', slot: 1, band: 'older', place: 'water', alt: false, notDone: false, text: "20' R1 + 4x 10'' R6/2' + 10' R1", notes: '' }
  ]);
  assert.equal(sessions[2].line, 6);
  // the plan text is kept as typed, colons and bars included
  assert.equal(f.parseSessions('2026-01-20 older: unilateral (D | E): 2x 300m\n').value[0].text, 'unilateral (D | E): 2x 300m');
  assert.equal(f.parseSessions('2026-01-20 older:\n').value[0].text, '');
  // the place, when it is not the water
  const pool = f.parseSessions("2026-01-20 older pool: 3x 10' R2/3'\n2026-01-21 older gym not-done: circuit\n").value;
  assert.deepEqual(pool.map(x => [x.place, x.notDone, x.text]), [['pool', false, "3x 10' R2/3'"], ['gym', true, 'circuit']]);
  assert.equal(f.serializeSessions(pool, ['older']), "2026-01-20 older pool: 3x 10' R2/3'\n2026-01-21 older gym not-done: circuit\n");
  assert.equal(f.serializeSessions([{ date: '2026-01-20', slot: 1, band: 'older', place: 'water', text: '6km R1' }]), '2026-01-20 older: 6km R1\n');
  // any number on a day, in the order of their lines; one done in place of the others is "alt"
  const day = "2026-01-20 older: 6km R1\n2026-01-20 older gym: circuit\n2026-01-20 older gym alt not-done: long circuit\n  for those not on the water\n2026-01-20 younger land: 20' R1\n";
  assert.deepEqual(f.parseSessions(day).value.map(x => [x.band, x.slot, x.place, x.alt, x.notDone]), [['older', 1, 'water', false, false], ['older', 2, 'gym', false, false], ['older', 3, 'gym', true, true], ['younger', 1, 'land', false, false]]);
  assert.equal(f.serializeSessions(f.parseSessions(day).value, ['older', 'younger']), day);
  assert.deepEqual([f.counted({}), f.counted({ alt: true }), f.counted({ notDone: true })], [true, false, false]);
  assert.equal(f.nextSlot(f.parseSessions(day).value, '2026-01-20', 'older'), 4);
  // the older lines with the half of the day are read, the morning first whatever the order of the lines
  const old = f.parseSessions("2026-01-20 pm older gym: circuit\n2026-01-20 am older: 6km R1\n").value;
  assert.deepEqual(old.map(x => [x.slot, x.place]), [[2, 'gym'], [1, 'water']]);
  assert.equal(f.serializeSessions(old, ['older']), "2026-01-20 older: 6km R1\n2026-01-20 older gym: circuit\n");
  assert.match(f.parseSessions('2026-01-20 older lake: 6km R1\n').errors[0].message, /a session is written/);
  assert.match(f.parseSessions('2026-01-20 noon older: 6km R1\n').errors[0].message, /a session is written/);
  assert.match(f.parseSessions('2026-01-32 older: 6km R1\n').errors[0].message, /a session is written/);
  assert.match(f.parseSessions('6km R1\n').errors[0].message, /a session is written/);
});

test('sessions are written in date, band and day order, on one line each', () => {
  const text = f.serializeSessions([
    { date: '2026-01-21', slot: 1, band: 'younger', notDone: false, text: '  4km\n R1 ', notes: '\n  first\n\n\nsecond  \n\n' },
    { date: '2026-01-20', slot: 1, band: 'older', notDone: true, text: '', notes: '' },
    { date: '2026-01-21', slot: 1, band: 'older', notDone: false, text: '6km R1', notes: '' },
    { date: '2026-01-20', slot: 1, band: 'guest', notDone: false, text: 'yoga', notes: '' }
  ], ['older', 'younger']);
  assert.equal(text, `2026-01-20 older not-done:
2026-01-20 guest: yoga
2026-01-21 older: 6km R1
2026-01-21 younger: 4km R1
  first


  second
`);
  const back = f.parseSessions(text);
  assert.deepEqual(back.errors, []);
  assert.equal(back.value[3].notes, 'first\n\n\nsecond');
  assert.equal(f.serializeSessions(back.value, ['older', 'younger']), text);
});
