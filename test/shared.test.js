import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../src/engine.js';
import { putSession, removeSession, setNotes } from '../src/edits.js';
import { parseSessions, serializeSessions, parseNotes, serializeNotes, parsePlanFile, sessionKey, nextSlot } from '../src/format.js';
import { moveMeso } from '../src/cycles.js';
import { kmView } from '../src/km.js';
import { gridView } from '../src/grid.js';
import { checksView } from '../src/checks.js';
import { suggestions } from '../src/suggest.js';
import { weekReport, dayReport, seasonReport } from '../src/report.js';
import { weekSheet } from '../src/export.js';
import { memoryStore, fixture, TABLES } from './helpers.js';

// week 3 is 19 to 25 January. On Tuesday the plan has a session for every band between the two
// bands' own; on Thursday one of the plan's has R3, which the younger band's age is not given.
const SESSIONS = `2026-01-20 older: 6km R1
2026-01-20: 10km R1
  together
2026-01-20 younger gym: circuit
2026-01-22: 5km R1 + 5x 4' R3/4'
2026-01-19 gym week: Strength I
`;
const TODAY = '2026-01-21';
// the older band paddles R1 faster than the default
const load = changes => e.load(memoryStore({ ...fixture(), 'tables.txt': TABLES + 'pace older  R1 12\n', 'plans/group-a/sessions.txt': SESSIONS, ...changes }));

test('sessions.txt: with no band a session is the plan\'s; the words after the date in any order; one order on the day', () => {
  const r = parseSessions(SESSIONS);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value.map(s => [s.date, s.band, s.place, s.week, s.slot, sessionKey(s)]), [
    ['2026-01-20', 'older', 'water', false, 1, '2026-01-20 1'],
    ['2026-01-20', '', 'water', false, 2, '2026-01-20 2'],
    ['2026-01-20', 'younger', 'gym', false, 3, '2026-01-20 3'],
    ['2026-01-22', '', 'water', false, 1, '2026-01-22 1'],
    ['2026-01-19', '', 'gym', true, 1, '2026-01-19 w1']]);
  // written back in the day's order, with no band for the plan's
  assert.equal(serializeSessions(r.value), "2026-01-19 gym week: Strength I\n2026-01-20 older: 6km R1\n2026-01-20: 10km R1\n  together\n2026-01-20 younger gym: circuit\n2026-01-22: 5km R1 + 5x 4' R3/4'\n");
  // the flags in any order, written in one
  const any = parseSessions("2026-01-20 alt gym: long circuit\n2026-01-19 not-done week pool: 3x 10' R2/3'\n2026-01-20 older alt land not-done: 45' R1\n");
  assert.deepEqual(any.errors, []);
  assert.deepEqual(any.value.map(s => [s.band, s.place, s.week, s.alt, s.notDone]), [['', 'gym', false, true, false], ['', 'pool', true, false, true], ['older', 'land', false, true, true]]);
  assert.equal(serializeSessions(any.value), "2026-01-19 pool week not-done: 3x 10' R2/3'\n2026-01-20 gym alt: long circuit\n2026-01-20 older land alt not-done: 45' R1\n");
  // the older forms still read, as sessions of their band, the morning first
  const old = parseSessions('2026-01-20 pm older:\n2026-01-20 am younger gym: circuit\n2026-01-21 older: 6km R1\n');
  assert.deepEqual(old.value.map(s => [s.band, s.slot]), [['older', 2], ['younger', 1], ['older', 1]]);
  assert.equal(serializeSessions(old.value), '2026-01-20 younger gym: circuit\n2026-01-20 older:\n2026-01-21 older: 6km R1\n');
  // a band comes first; a word twice, two places, or an unknown word after the band cannot be read
  for (const bad of ['2026-01-20 gym older: x', '2026-01-20 older gym pool: x', '2026-01-20 alt alt: x', '2026-01-20 older younger: x', '2026-01-20 older week week: x']) {
    assert.match(parseSessions(bad + '\n').errors[0].message, /a session is written "date: plan", or "date band: plan"/, bad);
  }
  // a band cannot have the name of one of those words
  assert.match(parsePlanFile('name: A\nbands: older, gym\n').errors[0].message, /"gym" cannot be a band/);
  assert.match(parsePlanFile('name: A\nbands: phrase\n').errors[0].message, /"phrase" cannot be a band/);
});

test('editing: a new session goes after every one of its day, whoever it is for; removing one moves the later ones up', async () => {
  const plan = e.planOf(await load(), 'group-a');
  assert.equal(nextSlot(plan.sessions, '2026-01-20', false), 4);
  // a new one is the plan's when no band is given
  const more = putSession(plan, { date: '2026-01-20', place: 'land', text: "30' R1" });
  assert.deepEqual(more.sessions.filter(s => s.date === '2026-01-20' && !s.week).map(s => [s.slot, s.band, s.place]), [[1, 'older', 'water'], [2, '', 'water'], [3, 'younger', 'gym'], [4, '', 'land']]);
  // made for one band and back: the same session, in the same place
  const one = putSession(more, { ...more.sessions[1], band: 'younger' });
  assert.deepEqual(one.sessions.filter(s => s.date === '2026-01-20').map(s => [sessionKey(s), s.band, s.text]), [['2026-01-20 1', 'older', '6km R1'], ['2026-01-20 3', 'younger', 'circuit'], ['2026-01-20 4', '', "30' R1"], ['2026-01-20 2', 'younger', '10km R1']]);
  assert.deepEqual(putSession(one, { ...one.sessions.find(s => sessionKey(s) === '2026-01-20 2'), band: '' }).sessions.find(s => sessionKey(s) === '2026-01-20 2').band, '');
  assert.throws(() => putSession(plan, { date: '2026-01-20', band: 'guest', text: '' }), /no band "guest"/);
  // the plan's session gone, the younger band's moves up
  const less = removeSession(more, '2026-01-20 2');
  assert.deepEqual(less.sessions.filter(s => s.date === '2026-01-20' && !s.week).map(s => [s.slot, s.band, s.text]), [[1, 'older', '6km R1'], [2, 'younger', 'circuit'], [3, '', "30' R1"]]);
  assert.equal(serializeSessions(less.sessions).split('\n').filter(l => l.startsWith('2026-01-20')).join('|'), "2026-01-20 older: 6km R1|2026-01-20 younger gym: circuit|2026-01-20 land: 30' R1");
});

test('each band does the plan\'s sessions and its own: the week, km at its pace, the grid, the checks, the suggestions', async () => {
  const data = await load();
  const older = e.weekView(data, 'group-a', 3, TODAY, 'older'), younger = e.weekView(data, 'group-a', 3, TODAY, 'younger');
  assert.deepEqual(older.days[1].sessions.map(s => [s.slot, s.band, s.text]), [[1, 'older', '6km R1'], [2, '', '10km R1']]);
  assert.deepEqual(younger.days[1].sessions.map(s => [s.slot, s.band, s.text]), [[2, '', '10km R1'], [3, 'younger', 'circuit']]);
  assert.deepEqual([older.week.length, younger.week.length], [1, 1]);
  // the same 10 km take each band its own time
  assert.deepEqual([older.days[1].sessions[1].parts[0].min, younger.days[1].sessions[0].parts[0].min], [50, 10 / 9.5 * 60]);
  // without a band, every session, the plan's at the default pace
  assert.deepEqual(e.weekView(data, 'group-a', 3, TODAY).days[1].sessions.map(s => s.band), ['older', '', 'younger']);
  // km: the plan's sessions count for each band
  const km = b => kmView(data, 'group-a', b, TODAY).weeks[2];
  assert.equal(Math.round(km('older').km * 10) / 10, 6 + 10 + 5 + 20 / 60 * 12);
  assert.equal(Math.round(km('younger').km * 10) / 10, 10 + 5 + 20 / 60 * 12);
  assert.equal(Math.round(km('younger').offMin), 0);
  // the grid: the R3 session is the plan's, so each band has it
  for (const b of ['older', 'younger']) assert.equal(gridView(data, 'group-a', b, TODAY).rows.find(r => r.zone === 'R3').weeks[2].sessions, 1, b);
  assert.deepEqual(e.sheet(data, 'group-a', TODAY).weeks[2].sessions, { older: 4, younger: 4 });
  // the checks: R3 is questioned for the younger band only, as words
  const said = b => checksView(data, 'group-a', b, TODAY)[2].sessions['2026-01-22 1'] || [];
  assert.ok(said('younger').includes('R3: not recommended for younger'), said('younger').join('\n'));
  assert.ok(!said('older').some(t => /not recommended/.test(t)));
  // suggestions: what the band has had includes the plan's sessions
  const r = suggestions(data, 'group-a', 'younger', '2026-01-27', 1, TODAY, { zone: 'R1' });
  assert.equal(r.list.find(x => x.text === '10km R1').used, '2026-01-20');
});

test('the day page shows a session of the plan\'s once, with the plan; the command line likewise', async () => {
  const data = await load();
  const d = e.dayView(data, '2026-01-20', TODAY).plans[0];
  assert.deepEqual(d.sessions.map(s => [s.band, s.text]), [['older', '6km R1'], ['', '10km R1'], ['younger', 'circuit']]);
  assert.deepEqual(d.anyDay.map(s => s.band), ['']);
  // only the plan's on Thursday: everyone trains
  assert.deepEqual(e.dayView(data, '2026-01-22', TODAY).plans[0].sessions.map(s => s.band), ['']);
  assert.match(dayReport(data, '2026-01-20', TODAY), /\ngroup-a older water · R1 · 6km R1\ngroup-a water · R1 · 10km R1\n    together\ngroup-a younger gym · no zone · circuit\n/);
  // show week: the plan's are "all"; checked for each band that does them
  const all = weekReport(data, 'group-a', 3, TODAY);
  assert.match(all, /\n  2 all water · done · main zone R1 · 10km R1\n/);
  assert.match(all, /\n      check younger: R3: not recommended for younger\n/);
  const young = weekReport(data, 'group-a', 3, TODAY, 'younger');
  assert.match(young, /\n  2 all water · done · main zone R1 · 10km R1\n/);
  assert.doesNotMatch(young, /6km R1/);
  assert.match(young, /\n      check: R3: not recommended for younger\n/);
  assert.match(seasonReport(data, 'group-a', TODAY), /older 4, younger 4/);
});

test('check: a session or a note for a band the plan does not have', async () => {
  const data = await load({ 'plans/group-a/sessions.txt': '2026-01-20: 6km R1\n2026-01-20 guest: 4km R1\n', 'plans/group-a/notes.txt': '2026-01-19\n  a\n\n2026-01-19 guest\n  b\n' });
  assert.deepEqual(e.check(data, TODAY).map(p => p.level + ' ' + p.file + ':' + p.line + ' ' + p.message), [
    'error plans/group-a/sessions.txt:2 plan group-a has no band "guest"',
    'error plans/group-a/notes.txt:4 plan group-a has no band "guest"']);
});

const NOTES = `2026-01-19
  Warm-up before every session

2026-01-19 phrase
  Together

2026-01-19 older
  Gym on Thursday

2026-01-19 younger phrase
  Small steps
`;

test('notes.txt: with no band the plan\'s; a band reads the plan\'s notes, then its own, and its own phrase in place of the plan\'s', async () => {
  const r = parseNotes(NOTES);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value.map(n => [n.band, n.kind]), [['', 'notes'], ['', 'phrase'], ['older', 'notes'], ['younger', 'phrase']]);
  assert.equal(serializeNotes([...r.value].reverse(), ['older', 'younger']), NOTES);
  assert.match(parseNotes('2026-01-19\n  a\n2026-01-19\n  b\n').errors[0].message, /notes of the plan for week 2026-01-19 are given twice/);
  const data = await load({ 'plans/group-a/notes.txt': NOTES }), plan = e.planOf(data, 'group-a');
  assert.deepEqual(e.weekNotes(plan, '2026-01-19', 'older'), { notes: 'Warm-up before every session\n\nGym on Thursday', phrase: 'Together' });
  assert.deepEqual(e.weekNotes(plan, '2026-01-19', 'younger'), { notes: 'Warm-up before every session', phrase: 'Small steps' });
  assert.deepEqual(e.weekNotes(plan, '2026-01-19', ''), { notes: 'Warm-up before every session', phrase: 'Together' });
  assert.deepEqual(e.noteParts(plan, '2026-01-19', 'older'), { notes: 'Gym on Thursday', phrase: '' });
  // edited: the plan's when no band is given
  const set = setNotes(setNotes(plan, '2026-01-26', '', 'All of us'), '2026-01-26', 'older', 'Only us', 'phrase');
  assert.equal(serializeNotes(set.notes, set.bands).split('\n\n').slice(-2).join('|'), '2026-01-26\n  All of us|2026-01-26 older phrase\n  Only us\n');
  // the day page: the plan's once, then each band's own, for the bands that train
  assert.deepEqual(e.dayView(data, '2026-01-22', TODAY).plans[0].notes.map(n => [n.band, n.notes, n.phrase]), [['', 'Warm-up before every session', 'Together'], ['older', 'Gym on Thursday', ''], ['younger', '', 'Small steps']]);
  assert.match(weekReport(data, 'group-a', 3, TODAY, 'older'), /\nnotes: Warm-up before every session\nphrase: Together\nnotes older: Gym on Thursday\n\n/);
  // the sheet of a band: its notes after the plan's, its phrase in place of the plan's
  const sh = weekSheet(data, 'group-a', 'younger', 3, TODAY);
  assert.deepEqual(sh.notes, { warm: ['Warm-up before every session'], phrase: ['Small steps'] });
});

test('the week sheet: the plan\'s sessions and the band\'s own; named after the band only when it has something of its own', async () => {
  const data = await load();
  const older = weekSheet(data, 'group-a', 'older', 3, TODAY);
  assert.deepEqual(older.days[1].sessions.map(x => x.lines[0]), ['6km R1', '10km R1']);
  assert.match(older.file, / - older$/);
  // the plan's sessions alone, with no band
  const plan = weekSheet(data, 'group-a', '', 3, TODAY);
  assert.deepEqual(plan.days[1].sessions.map(x => x.lines[0]), ['10km R1']);
  assert.doesNotMatch(plan.file, / - /);
  // a week with only the plan's sessions is the plan's sheet, whichever band it is made for
  const shared = await load({ 'plans/group-a/sessions.txt': '2026-01-20: 10km R1\n' });
  assert.doesNotMatch(weekSheet(shared, 'group-a', 'older', 3, TODAY).file, / - /);
});

test('moving a block carries the plan\'s sessions and notes with it', async () => {
  const data = await load({ 'plans/group-a/notes.txt': NOTES }), plan = e.planOf(data, 'group-a');
  // the first block (weeks 1 to 3) swaps with the second (weeks 4 to 7): week 3 becomes week 7
  const moved = moveMeso(plan, 0, 1, 0, data.season.start).plan;
  assert.deepEqual(moved.sessions.map(s => [s.date, s.band, s.slot]), [['2026-02-17', 'older', 1], ['2026-02-17', '', 2], ['2026-02-17', 'younger', 3], ['2026-02-19', '', 1], ['2026-02-16', '', 1]]);
  assert.deepEqual([...new Set(moved.notes.map(n => n.monday))], ['2026-02-16']);
});
