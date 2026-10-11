import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../src/cycles.js';
import { parseCycles } from '../src/format.js';
import { CYCLES } from './helpers.js';

const START = '2026-01-05';

// weeks 1-3 General one, 4-7 General two | 8-10 Specific, 11-12 Racing
function plan() {
  return {
    id: 'group-a',
    macros: parseCycles(CYCLES).value,
    hand: [{ monday: '2026-01-26', type: 'R', load: null }, { monday: '2026-02-23', type: 'CH', load: 90 }],   // weeks 4 and 8
    sessions: [
      { date: '2026-01-06', slot: 2, band: 'older', text: 'week 1 Tue' },
      { date: '2026-01-31', slot: 1, band: 'older', text: 'week 4 Sat' },
      { date: '2026-02-24', slot: 2, band: 'older', text: 'week 8 Tue' },
      { date: '2026-03-17', slot: 2, band: 'older', text: 'week 11 Tue' }
    ]
  };
}

const shape = p => p.macros.map(mc => mc.name + ': ' + mc.mesos.map(m => m.name + ' ' + m.len).join(', ')).join(' | ');
const types = (pat, n) => Array.from({ length: n }, (_, k) => c.patType(pat, k, n)).join(' ');
const locked = /weeks that have ended cannot be moved/;

test('week types follow the load pattern', () => {
  assert.equal(types('build', 1), 'C');
  assert.equal(types('build', 2), 'C R');
  assert.equal(types('build', 3), 'C CH R');
  assert.equal(types('build', 5), 'C C C CH R');
  assert.equal(types('intro', 1), 'I');
  assert.equal(types('intro', 2), 'I C');
  assert.equal(types('intro', 5), 'I C C CH R');
  assert.equal(types('restart', 1), 'R');
  assert.equal(types('restart', 2), 'R C');
  assert.equal(types('restart', 4), 'R C C CH');
  assert.equal(types('comp', 1), 'CT');
  assert.equal(types('comp', 2), 'AT CT');
  assert.equal(types('comp', 4), 'C C AT CT');
  assert.equal(types('recovery', 3), 'R R R');
  assert.deepEqual([c.patType('none', 0, 2), c.patType('none', 1, 2)], [null, null]);
});

test('cycle positions come from the ordered list', () => {
  const lay = c.layout(plan().macros);
  assert.equal(lay.weeks, 12);
  assert.deepEqual(lay.macros.map(m => [m.name, m.from, m.to, m.first, m.count]), [['First macro', 1, 7, 0, 2], ['Second macro', 8, 12, 2, 2]]);
  assert.deepEqual(lay.mesos.map(m => [m.name, m.macro, m.from, m.to, m.label, m.zone]), [
    ['General one', 0, 1, 3, 'R1-R2', 'R2'], ['General two', 0, 4, 7, 'R2', 'R2'], ['Specific', 1, 8, 10, 'R3', 'R3'], ['Racing', 1, 11, 12, 'R7', 'R7']
  ]);
  const empty = c.layout([{ name: 'M', mesos: [{ len: 5, pat: 'none', zones: [], name: 'Unplanned' }] }]).mesos[0];
  assert.deepEqual([empty.label, empty.zone], ['-', null]);
});

test('edits return a new plan and leave the old one alone', () => {
  const p = plan(), before = JSON.stringify(p);
  c.moveBoundary(p, 0, 1, 0);
  c.splitMeso(p, 1, 6, 0);
  c.deleteMeso(p, 2, 0);
  c.moveMeso(p, 1, 1, 0, START);
  c.newMacro(p, 1, 0);
  c.mergeMacro(p, 1, 0);
  c.setMeso(p, 0, { name: 'X', zones: ['R5'], pat: 'comp' });
  c.setMacroName(p, 0, 'X');
  assert.equal(JSON.stringify(p), before);
});

test('moving a boundary: one block grows, its neighbour shrinks', () => {
  assert.equal(shape(c.moveBoundary(plan(), 0, 1, 0)), 'First macro: General one 4, General two 3 | Second macro: Specific 3, Racing 2');
  assert.equal(shape(c.moveBoundary(plan(), 0, -2, 0)), 'First macro: General one 1, General two 6 | Second macro: Specific 3, Racing 2');
  // a macrocycle boundary is also a mesocycle boundary
  const moved = c.moveBoundary(plan(), 1, -1, 0);
  assert.equal(shape(moved), 'First macro: General one 3, General two 3 | Second macro: Specific 4, Racing 2');
  assert.deepEqual(c.layout(moved.macros).macros.map(m => [m.from, m.to]), [[1, 6], [7, 12]]);
  assert.equal(c.moveBoundary(plan(), 0, 0, 12).macros.length, 2);
  assert.throws(() => c.moveBoundary(plan(), 0, -3, 0), /at least one week/);
  assert.throws(() => c.moveBoundary(plan(), 0, 4, 0), /at least one week/);
  assert.throws(() => c.moveBoundary(plan(), 3, 1, 0), /no such mesocycle/);
  assert.throws(() => c.moveBoundary(plan(), 0, 0.5, 0), /whole weeks/);
});

test('moving a boundary: weeks that have ended stay where they are', () => {
  assert.deepEqual(c.boundaryLimits(plan(), 0, 0), { min: -2, max: 3 });
  // the boundary sits at the end of week 3
  assert.deepEqual(c.boundaryLimits(plan(), 0, 2), { min: -1, max: 3 });
  assert.deepEqual(c.boundaryLimits(plan(), 0, 3), { min: 0, max: 3 });
  assert.deepEqual(c.boundaryLimits(plan(), 0, 4), { min: 0, max: 0 });
  assert.equal(shape(c.moveBoundary(plan(), 0, -1, 2)), 'First macro: General one 2, General two 5 | Second macro: Specific 3, Racing 2');
  assert.throws(() => c.moveBoundary(plan(), 0, -2, 2), locked);
  assert.equal(shape(c.moveBoundary(plan(), 0, 1, 3)), 'First macro: General one 4, General two 3 | Second macro: Specific 3, Racing 2');
  assert.throws(() => c.moveBoundary(plan(), 0, 1, 4), locked);
});

test('splitting a block', () => {
  const p = c.splitMeso(plan(), 1, 6, 0);
  assert.equal(shape(p), 'First macro: General one 3, General two 2, New block 2 | Second macro: Specific 3, Racing 2');
  assert.deepEqual(p.macros[0].mesos[2], { len: 2, pat: 'build', zones: ['R2'], name: 'New block' });
  // carving from unplanned time leaves both parts unplanned, with the same name
  const u = c.splitMeso({ macros: [{ name: 'M', mesos: [{ len: 12, pat: 'none', zones: [], name: 'Unplanned' }] }], hand: [], sessions: [] }, 0, 5, 0);
  assert.deepEqual(u.macros[0].mesos, [{ len: 4, pat: 'none', zones: [], name: 'Unplanned' }, { len: 8, pat: 'none', zones: [], name: 'Unplanned' }]);
  assert.throws(() => c.splitMeso(plan(), 1, 4, 0), /inside the block/);
  assert.throws(() => c.splitMeso(plan(), 1, 8, 0), /inside the block/);
  assert.equal(c.splitMeso(plan(), 1, 6, 5).macros[0].mesos.length, 3);
  assert.throws(() => c.splitMeso(plan(), 1, 6, 6), locked);
});

test('deleting a block: its weeks join the previous one', () => {
  assert.equal(shape(c.deleteMeso(plan(), 1, 0)), 'First macro: General one 7 | Second macro: Specific 3, Racing 2');
  // across a macrocycle boundary too
  assert.equal(shape(c.deleteMeso(plan(), 2, 0)), 'First macro: General one 3, General two 7 | Second macro: Racing 2');
  // the first block joins the next
  assert.equal(shape(c.deleteMeso(plan(), 0, 0)), 'First macro: General two 7 | Second macro: Specific 3, Racing 2');
  // a macrocycle with no blocks left is gone
  const one = c.deleteMeso(c.deleteMeso(plan(), 3, 0), 2, 0);
  assert.equal(shape(one), 'First macro: General one 3, General two 9');
  assert.throws(() => c.deleteMeso({ macros: [{ name: 'M', mesos: [{ len: 12, pat: 'none', zones: [], name: 'U' }] }] }, 0, 0), /last block/);
  assert.equal(shape(c.deleteMeso(plan(), 2, 7)), 'First macro: General one 3, General two 7 | Second macro: Racing 2');
  assert.throws(() => c.deleteMeso(plan(), 2, 8), locked);
  assert.throws(() => c.deleteMeso(plan(), 0, 4), locked);
});

test('moving a block: it carries its hand-set weeks and sessions, weekdays kept', () => {
  const r = c.moveMeso(plan(), 1, 1, 0, START);
  assert.equal(r.index, 2);
  // macrocycles keep their place; the two blocks swap
  assert.equal(shape(r.plan), 'First macro: General one 3, Specific 3 | Second macro: General two 4, Racing 2');
  // General two (weeks 4-7) moved 3 weeks later, Specific (weeks 8-10) 4 weeks earlier
  assert.deepEqual(r.plan.sessions.map(s => s.date + ' ' + s.text), [
    '2026-01-06 week 1 Tue', '2026-02-21 week 4 Sat', '2026-01-27 week 8 Tue', '2026-03-17 week 11 Tue'
  ]);
  assert.deepEqual(r.plan.hand, [{ monday: '2026-02-16', type: 'R', load: null }, { monday: '2026-01-26', type: 'CH', load: 90 }]);
  // moving it back restores everything
  const back = c.moveMeso(r.plan, 2, -1, 0, START);
  assert.equal(back.index, 1);
  assert.deepEqual(back.plan, plan());
  assert.throws(() => c.moveMeso(plan(), 0, -1, 0, START), /no block on that side/);
  assert.throws(() => c.moveMeso(plan(), 3, 1, 0, START), /no block on that side/);
  // both blocks must be in weeks that have not ended
  assert.equal(c.moveMeso(plan(), 1, 1, 3, START).index, 2);
  assert.throws(() => c.moveMeso(plan(), 1, 1, 4, START), locked);
  assert.throws(() => c.moveMeso(plan(), 2, -1, 4, START), locked);
});

test('macrocycles: start a new one, merge into the previous', () => {
  assert.equal(shape(c.newMacro(plan(), 1, 0)), 'First macro: General one 3 | New macrocycle: General two 4 | Second macro: Specific 3, Racing 2');
  assert.throws(() => c.newMacro(plan(), 0, 0), /already starts/);
  assert.throws(() => c.newMacro(plan(), 2, 0), /already starts/);
  assert.equal(c.newMacro(plan(), 1, 3).macros.length, 3);
  assert.throws(() => c.newMacro(plan(), 1, 4), locked);

  assert.equal(shape(c.mergeMacro(plan(), 1, 0)), 'First macro: General one 3, General two 4, Specific 3, Racing 2');
  assert.throws(() => c.mergeMacro(plan(), 0, 0), /no previous macrocycle/);
  assert.equal(c.mergeMacro(plan(), 1, 7).macros.length, 1);
  assert.throws(() => c.mergeMacro(plan(), 1, 8), locked);
  // a new macrocycle, merged again, gives the plan back
  assert.deepEqual(c.mergeMacro(c.newMacro(plan(), 1, 0), 1, 0).macros, plan().macros);
});

test('macrocycles: split one at a week', () => {
  // at the start of a block: only the macrocycle is split
  assert.equal(shape(c.splitMacro(plan(), 0, 4, 0)), 'First macro: General one 3 | New macrocycle: General two 4 | Second macro: Specific 3, Racing 2');
  // inside a block: the block is split at that week too
  assert.equal(shape(c.splitMacro(plan(), 0, 6, 0)), 'First macro: General one 3, General two 2 | New macrocycle: New block 2 | Second macro: Specific 3, Racing 2');
  assert.equal(shape(c.splitMacro(plan(), 1, 12, 0)), 'First macro: General one 3, General two 4 | Second macro: Specific 3, Racing 1 | New macrocycle: New block 1');
  // time that is not planned yet keeps its name on both sides
  const u = c.splitMacro({ macros: [{ name: 'M', mesos: [{ len: 12, pat: 'none', zones: [], name: 'Unplanned' }] }], hand: [], sessions: [] }, 0, 5, 0);
  assert.equal(shape(u), 'M: Unplanned 4 | New macrocycle: Unplanned 8');
  // only at a week after the macrocycle's first
  assert.throws(() => c.splitMacro(plan(), 0, 1, 0), /inside the macrocycle/);
  assert.throws(() => c.splitMacro(plan(), 0, 8, 0), /inside the macrocycle/);
  assert.throws(() => c.splitMacro(plan(), 1, 8, 0), /inside the macrocycle/);
  assert.throws(() => c.splitMacro(plan(), 2, 9, 0), /no such macrocycle/);
  // the week before the new macrocycle must not have ended
  assert.equal(c.splitMacro(plan(), 0, 6, 5).macros.length, 3);
  assert.throws(() => c.splitMacro(plan(), 0, 6, 6), locked);
  assert.throws(() => c.splitMacro(plan(), 0, 4, 4), locked);
});

test('names, contents and pattern', () => {
  const p = c.setMeso(plan(), 0, { name: '  Base   one ', zones: ['R3+', 'R1', 'R3'], pat: 'restart' });
  assert.deepEqual(p.macros[0].mesos[0], { len: 3, pat: 'restart', zones: ['R1', 'R3', 'R3+'], name: 'Base one' });
  assert.deepEqual(c.setMeso(plan(), 0, { zones: [] }).macros[0].mesos[0].zones, []);
  assert.throws(() => c.setMeso(plan(), 0, { name: '  ' }), /needs a name/);
  assert.throws(() => c.setMeso(plan(), 0, { pat: 'wave' }), /unknown load pattern/);
  assert.throws(() => c.setMeso(plan(), 0, { zones: ['R0'] }), /unknown zone/);
  assert.equal(c.setMacroName(plan(), 1, ' Spring ').macros[1].name, 'Spring');
  assert.throws(() => c.setMacroName(plan(), 1, ''), /needs a name/);
  assert.throws(() => c.setMacroName(plan(), 2, 'X'), /no such macrocycle/);
});
