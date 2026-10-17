import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../src/engine.js';
import { setNotes } from '../src/edits.js';
import { parseNotes, serializeNotes } from '../src/format.js';
import { weekReport, dayReport } from '../src/report.js';
import { weekSheet, sheetHtml } from '../src/export.js';
import { memoryStore, fixture } from './helpers.js';

const NOTES = `2026-01-19 older
  Warm-up before every session
  On land: 15' run

  Hello!

2026-01-19 older phrase
  Mind over matter

2026-01-19 younger
  Bring a hat
`;
const TODAY = '2026-01-21';
const load = changes => e.load(memoryStore({ ...fixture(), 'plans/group-a/notes.txt': NOTES, ...changes }));
const NONE = { notes: '', phrase: '' };

test('notes.txt: the week\'s Monday and the band, "phrase" for the phrase, then the text', () => {
  const r = parseNotes(NOTES);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.value.map(({ line, ...n }) => n), [
    { monday: '2026-01-19', band: 'older', kind: 'notes', text: "Warm-up before every session\nOn land: 15' run\n\nHello!" },
    { monday: '2026-01-19', band: 'older', kind: 'phrase', text: 'Mind over matter' },
    { monday: '2026-01-19', band: 'younger', kind: 'notes', text: 'Bring a hat' }]);
  // written back in the bands' order, by week, the notes before the phrase; empty ones are dropped
  assert.equal(serializeNotes([...r.value].reverse(), ['older', 'younger']), NOTES);
  assert.equal(serializeNotes([{ monday: '2026-01-26', band: 'older', kind: 'notes', text: ' \n' }]), '');
  assert.deepEqual([parseNotes('').value, serializeNotes([])], [[], '']);
  assert.match(parseNotes('2026-01-19 older younger\n  hi\n').errors[0].message, /Monday, then the band/);
  assert.match(parseNotes('2026-01-19 older tables\n  hi\n').errors[0].message, /"phrase" for the phrase/);
  assert.match(parseNotes('2026-01-19 older phrase\n  a\n2026-01-19 older phrase\n  b\n').errors[0].message, /phrase of older for week 2026-01-19 are given twice/);
});

test('week notes and phrase: each set, replaced and removed on its own, and written to notes.txt', async () => {
  const data = await load({ 'plans/group-a/notes.txt': '' });
  let plan = e.planOf(data, 'group-a');
  plan = setNotes(plan, '2026-01-26', 'older', 'first');
  plan = setNotes(plan, '2026-01-26', 'older', 'second');
  plan = setNotes(plan, '2026-01-26', 'older', 'Keep going', 'phrase');
  assert.deepEqual(plan.notes, [{ monday: '2026-01-26', band: 'older', kind: 'notes', text: 'second' }, { monday: '2026-01-26', band: 'older', kind: 'phrase', text: 'Keep going' }]);
  data.plans[0] = plan;
  assert.equal(e.fileText(data, 'plans/group-a/notes.txt'), '2026-01-26 older\n  second\n\n2026-01-26 older phrase\n  Keep going\n');
  assert.deepEqual(setNotes(plan, '2026-01-26', 'older', '  ').notes, [{ monday: '2026-01-26', band: 'older', kind: 'phrase', text: 'Keep going' }]);
  assert.throws(() => setNotes(plan, '2026-01-26', 'nobody', 'x'), /no band "nobody"/);
  assert.throws(() => setNotes(plan, '2026-01-26', 'older', 'x', 'quote'), /no "quote"/);
  // a plan with no notes.txt loads without problems
  const none = await e.load(memoryStore(fixture()));
  assert.deepEqual([none.errors, e.planOf(none, 'group-a').notes], [[], []]);
});

test('check: week notes on a Monday in the season, for a band of the plan', async () => {
  const data = await load({ 'plans/group-a/notes.txt': '2026-01-20 older\n  a\n\n2026-01-26 nobody phrase\n  b\n' });
  assert.deepEqual(e.check(data, TODAY).map(p => p.file + ':' + p.line + ' ' + p.message), [
    'plans/group-a/notes.txt:1 2026-01-20 is not the Monday of a week in the season',
    'plans/group-a/notes.txt:4 plan group-a has no band "nobody"']);
});

test('the week, the day and the command line show the week\'s notes and phrase', async () => {
  const data = await load();
  const w = e.weekView(data, 'group-a', 3, TODAY);
  assert.deepEqual(w.notes, {
    '': NONE,
    older: { notes: "Warm-up before every session\nOn land: 15' run\n\nHello!", phrase: 'Mind over matter' },
    younger: { ...NONE, notes: 'Bring a hat' }
  });
  assert.deepEqual(e.weekView(data, 'group-a', 4, TODAY).notes, { '': NONE, older: NONE, younger: NONE });
  // the day: those of each band that has a session that day
  assert.deepEqual(e.dayView(data, '2026-01-20', TODAY).plans[0].notes.map(n => n.band), ['older', 'younger']);
  assert.deepEqual(e.dayView(data, '2026-01-24', TODAY).plans[0].notes.map(n => n.band), ['older']);
  assert.deepEqual(e.dayView(data, '2026-01-23', TODAY).plans[0].notes, []);
  assert.match(weekReport(data, 'group-a', 3, TODAY, 'older'), /\nnotes older: Warm-up before every session\nnotes older: On land: 15' run\nnotes older:\nnotes older: Hello!\nphrase older: Mind over matter\n\nMon/);
  assert.doesNotMatch(weekReport(data, 'group-a', 3, TODAY, 'older'), /Bring a hat/);
  assert.match(dayReport(data, '2026-01-24', TODAY), /\ngroup-a older · week notes\n    Warm-up before every session\n[^]*\ngroup-a older · week phrase\n    Mind over matter/);
});

test('the exported sheet: the notes in the frame, the phrase at the bottom, nothing guessed', async () => {
  const sh = weekSheet(await load(), 'group-a', 'older', 3, TODAY);
  // a line on its own in the notes stays in the notes; a blank line there is a blank row
  assert.deepEqual(sh.notes, {
    warm: ['Warm-up before every session', "On land: 15' run", '', 'Hello!'],
    phrase: ['Mind over matter']
  });
  const html = sheetHtml(sh);
  // the notes after the days, inside the frame: their last row closes it
  assert.match(html, /class="warm"><div><span>Warm-up before every session<\/span>[^]*class="warm"><div><span>Hello!<\/span><\/div><\/td>(<td style="border-right-color:#[0-9A-F]+;border-bottom-color:#000000"><\/td>){6}<\/tr>/);
  assert.match(html, /<tr style="height:14.4pt"><td colspan="7" [^>]*class="quote"><div><span>Mind over matter<\/span>/);
  assert.doesNotMatch(html, /class="(head|quote)"><div><span>Hello!/);
  // with nothing, none of it
  const empty = sheetHtml(weekSheet(await load(), 'group-a', 'older', 4, TODAY));
  assert.doesNotMatch(empty, /class="(warm|head|item|quote)"/);
});
