// Cycles: week types from load patterns (DESIGN.md 6.4), cycle positions (6.1) and cycle edits (6.3).
// Ported from patType, rebuild and planAct in mockups/level1-layouts.html.
//
// A plan's cycles are stored as macros: [{ name, mesos: [{ len, pat, zones, name }] }].
// Every edit returns a new plan and throws when it is not allowed; nothing is changed in place.

import { addDays, daysBetween } from './dates.js';
import { tr } from './lang.js';

// 'none' is for time that is not planned yet: its weeks have no type and no load.
export const PATTERNS = ['build', 'intro', 'restart', 'comp', 'recovery', 'none'];
export const CONTENT_ZONES = ['R1', 'R2', 'R3', 'R3+', 'R4', 'R5', 'R6', 'R7'];

// week type for position k of n in a mesocycle with this pattern
export function patType(pat, k, n) {
  if (pat === 'none') return null;
  if (pat === 'recovery') return 'R';
  if (pat === 'comp') return k === n - 1 ? 'CT' : (k === n - 2 ? 'AT' : 'C');
  if (pat === 'restart') return k === 0 ? 'R' : (k === n - 1 && n > 2 ? 'CH' : 'C');
  if (pat === 'intro') return k === 0 ? 'I' : patType('build', k - 1, n - 1);
  if (n === 1) return 'C';
  return k === n - 1 ? 'R' : (k === n - 2 && n > 2 ? 'CH' : 'C');
}

// Which weeks each cycle covers, worked out from the ordered list. Weeks are numbered from 1.
export function layout(macros) {
  const outMacros = [], outMesos = [];
  let n = 1;
  macros.forEach((mc, j) => {
    const first = outMesos.length, from = n;
    for (const m of mc.mesos) {
      outMesos.push({
        index: outMesos.length, macro: j, name: m.name, pat: m.pat, len: m.len,
        zones: m.zones, label: m.zones.length ? m.zones.join('-') : '-',
        // the most intense content gives the block its colour
        zone: m.zones.length ? m.zones[m.zones.length - 1] : null,
        from: n, to: n + m.len - 1
      });
      n += m.len;
    }
    outMacros.push({ index: j, name: mc.name, from, to: n - 1, first, count: mc.mesos.length });
  });
  return { macros: outMacros, mesos: outMesos, weeks: n - 1 };
}

// ---- edits ----------------------------------------------------------------
// ended is the number of weeks that have ended. A boundary can only sit, move or disappear
// at or after the end of the last ended week (DESIGN.md 6.7).

const locked = () => fail(tr('weeks that have ended cannot be moved'));

// what the coach reads when an edit is refused, in the language in use
function fail(message) {
  const e = new Error(message);
  e.code = 'not-allowed';
  throw e;
}

// one flat list of mesocycles, and macrocycles as runs over it
function open(plan) {
  const mesos = [], runs = [];
  for (const mc of plan.macros) {
    runs.push({ name: mc.name, count: mc.mesos.length });
    for (const m of mc.mesos) mesos.push({ ...m, zones: m.zones.slice() });
  }
  return { mesos, runs };
}

function close(plan, f, extra) {
  let at = 0;
  const macros = f.runs.filter(r => r.count > 0).map(r => ({ name: r.name, mesos: f.mesos.slice(at, at += r.count) }));
  return { ...plan, ...extra, macros };
}

function fromOf(f, i) {
  let n = 1;
  for (let k = 0; k < i; k++) n += f.mesos[k].len;
  return n;
}

function runOf(f, i) {
  let at = 0;
  for (let r = 0; r < f.runs.length; r++) { at += f.runs[r].count; if (i < at) return r; }
  return -1;
}

function mesoAt(f, i) {
  if (!Number.isInteger(i) || i < 0 || i >= f.mesos.length) fail(tr('no such mesocycle'));
  return f.mesos[i];
}

// how far the boundary after mesocycle i can move, in weeks: { min, max }
export function boundaryLimits(plan, i, ended) {
  const f = open(plan), a = mesoAt(f, i), b = mesoAt(f, i + 1);
  const at = fromOf(f, i) + a.len - 1;
  if (at < ended) return { min: 0, max: 0 };
  return { min: Math.max(1 - a.len, ended - at), max: b.len - 1 };
}

// Move the boundary after mesocycle i by delta weeks: one block grows and its neighbour shrinks.
export function moveBoundary(plan, i, delta, ended) {
  const f = open(plan), a = mesoAt(f, i), b = mesoAt(f, i + 1);
  if (!Number.isInteger(delta)) fail(tr('whole weeks only'));
  if (delta === 0) return plan;
  if (a.len + delta < 1 || b.len - delta < 1) fail(tr('a block needs at least one week'));
  const at = fromOf(f, i) + a.len - 1;
  if (Math.min(at, at + delta) < ended) locked();
  a.len += delta;
  b.len -= delta;
  return close(plan, f);
}

// Split mesocycle i: a new block starts at this week. The new block copies the contents and pattern.
// Splitting time that is not planned yet leaves both parts with its name.
export function splitMeso(plan, i, week, ended) {
  const f = open(plan), m = mesoAt(f, i), from = fromOf(f, i), first = week - from;
  if (!Number.isInteger(week) || first < 1 || first >= m.len) fail(tr('the new block must start inside the block'));
  if (week - 1 < ended) locked();
  f.mesos.splice(i + 1, 0, { name: m.pat === 'none' ? m.name : tr('New block'), zones: m.zones.slice(), len: m.len - first, pat: m.pat });
  m.len = first;
  f.runs[runOf(f, i)].count++;
  return close(plan, f);
}

// Delete mesocycle i: its weeks join the previous block (the next one, for the first block).
export function deleteMeso(plan, i, ended) {
  const f = open(plan), m = mesoAt(f, i);
  if (f.mesos.length < 2) fail(tr('the last block cannot be deleted'));
  const from = fromOf(f, i), gone = i > 0 ? from - 1 : from + m.len - 1;
  if (gone < ended) locked();
  f.mesos[i > 0 ? i - 1 : 1].len += m.len;
  f.runs[runOf(f, i)].count--;
  f.mesos.splice(i, 1);
  return close(plan, f);
}

// Swap mesocycle i with its neighbour (dir -1 earlier, +1 later). A block carries its weeks with it:
// hand-set weeks and sessions shift by whole weeks, so weekdays are kept. Macrocycles keep their place.
// start is the season's first Monday. Returns { plan, index } with the block's new position.
export function moveMeso(plan, i, dir, ended, start) {
  const f = open(plan);
  mesoAt(f, i);
  const a = dir < 0 ? i - 1 : i;
  if (a < 0 || a + 1 >= f.mesos.length) fail(tr('there is no block on that side'));
  const from = fromOf(f, a), la = f.mesos[a].len, lb = f.mesos[a + 1].len;
  if (from - 1 < ended) locked();
  const x = f.mesos[a];
  f.mesos[a] = f.mesos[a + 1];
  f.mesos[a + 1] = x;
  function shifted(date) {
    const n = Math.floor(daysBetween(start, date) / 7) + 1;
    if (n >= from && n < from + la) return addDays(date, lb * 7);
    if (n >= from + la && n < from + la + lb) return addDays(date, -la * 7);
    return date;
  }
  return {
    plan: close(plan, f, {
      hand: plan.hand.map(h => ({ ...h, monday: shifted(h.monday) })),
      sessions: plan.sessions.map(s => ({ ...s, date: shifted(s.date) }))
    }),
    index: dir < 0 ? i - 1 : i + 1
  };
}

// Mesocycle i and the ones after it in the same macrocycle become a new macrocycle.
export function newMacro(plan, i, ended) {
  const f = open(plan);
  mesoAt(f, i);
  const r = runOf(f, i);
  let first = 0;
  for (let k = 0; k < r; k++) first += f.runs[k].count;
  if (i === first) fail(tr('this block already starts a macrocycle'));
  if (fromOf(f, i) - 1 < ended) locked();
  const old = f.runs[r];
  f.runs.splice(r, 1, { name: old.name, count: i - first }, { name: tr('New macrocycle'), count: old.count - (i - first) });
  return close(plan, f);
}

// Split macrocycle j: a new macrocycle starts at this week. A block that holds the week is split there too.
export function splitMacro(plan, j, week, ended) {
  const lay = layout(plan.macros), mc = lay.macros[j];
  if (!mc) fail(tr('no such macrocycle'));
  if (!Number.isInteger(week) || week <= mc.from || week > mc.to) fail(tr('the new macrocycle must start inside the macrocycle'));
  const m = lay.mesos.find(x => week >= x.from && week <= x.to);
  if (week === m.from) return newMacro(plan, m.index, ended);
  return newMacro(splitMeso(plan, m.index, week, ended), m.index + 1, ended);
}

// Macrocycle j joins the previous macrocycle.
export function mergeMacro(plan, j, ended) {
  const f = open(plan);
  if (!Number.isInteger(j) || j < 1 || j >= f.runs.length) fail(tr('there is no previous macrocycle'));
  let first = 0;
  for (let k = 0; k < j; k++) first += f.runs[k].count;
  if (fromOf(f, first) - 1 < ended) locked();
  f.runs[j - 1].count += f.runs[j].count;
  f.runs.splice(j, 1);
  return close(plan, f);
}

// Change a mesocycle's name, contents or load pattern.
export function setMeso(plan, i, changes) {
  const f = open(plan), m = mesoAt(f, i);
  if (changes.name !== undefined) {
    const name = String(changes.name).replace(/\s+/g, ' ').trim();
    if (!name) fail(tr('a block needs a name'));
    m.name = name;
  }
  if (changes.pat !== undefined) {
    if (!PATTERNS.includes(changes.pat)) fail(tr('unknown load pattern'));
    m.pat = changes.pat;
  }
  if (changes.zones !== undefined) {
    for (const z of changes.zones) { if (!CONTENT_ZONES.includes(z)) fail(tr('unknown zone {0}', z)); }
    m.zones = CONTENT_ZONES.filter(z => changes.zones.includes(z));
  }
  return close(plan, f);
}

export function setMacroName(plan, j, value) {
  const name = String(value).replace(/\s+/g, ' ').trim();
  if (!name) fail(tr('a macrocycle needs a name'));
  if (!plan.macros[j]) fail(tr('no such macrocycle'));
  return { ...plan, macros: plan.macros.map((mc, k) => k === j ? { ...mc, name } : mc) };
}
