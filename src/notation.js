// Reading session notation (DESIGN.md 8.1) and working out the main zone (8.1.1).
// Ported from parsePlan and infer in mockups/level1-layouts.html.

import { dec } from './lang.js';

export const ZONES = ['R0', 'R1', 'R2', 'R3', 'R3+', 'R4', 'R5', 'R6', 'R7'];

// What is written per zone: { zone: { sec, m } }.
// Work with no zone is under '?', rest with no zone under 'rest'.
// places is a list of { name, m }: a place name stands for its distance.
export function parsePlan(text, places) {
  return readPlan(text, places).totals;
}

// The same reading, with each effort as written, in order:
// pieces: [{ text, zone, sec, m, rest, reps, before, set, times, restAfter }], one repetition each.
//   reps       [{ sec, m, zone }]: each amount of the effort ("4'-6'-4'" is three)
//   zone       the effort's zone, or null when it has none or more than one
//   before     { zone: { sec, m } }: what is paddled before the effort first comes up
//   set        the effort is inside brackets
//   times      how many times its own block repeats it ("8x 4'" is 8)
//   restAfter  { sec, m, zone }: the rest written after it ("/1' R0"), or null
//
// A range counts as its middle: "2-4x 2'" is three times, "10-20'" is 15', "4-6km" is 5 km.
//
// Where the zone is written:
//   after the work            8x 4' R2/1' R0
//   after each amount         4' R2-6' R3
//   once for a set            R2 3x(4'-6'/1')/3'   or   3x(4'-6'/1') R2/3'
//   once for the session      R2: 3x(4'-6'/1')/3' + 2km
// A zone given to a set or a session is the zone of the work that has none of its own. Rest never takes it.
export function readPlan(text, places) {
  const s = String(text || '').replace(/[‘’′´`]/g, "'").replace(/[“”″"]/g, "''");
  const landmarks = (places || []).slice().sort((a, b) => b.name.length - a.name.length);
  // "4x", or a range, "2-4x", which counts as its middle
  const COUNT = /^(\d+)(?:\s*-\s*(\d+))?\s*[x×](?![a-z])\s*/i;
  const times = m => m[2] ? (+m[1] + +m[2]) / 2 : +m[1];
  let pos = 0;
  function peek(re) { return re.exec(s.slice(pos)); }
  function ws() { const m = peek(/^\s+/); if (m) pos += m[0].length; }
  function zone() {
    const m = peek(/^R([0-7])(\+)?F?(?![A-Za-z0-9])/i);
    if (!m) return null;
    pos += m[0].length;
    return 'R' + m[1] + (m[2] && m[1] === '3' ? '+' : '');
  }
  function place() {
    for (const p of landmarks) {
      const end = pos + p.name.length;
      if (s.slice(pos, end).toLowerCase() === p.name.toLowerCase() && !/[\p{L}\p{N}]/u.test(s.charAt(end))) { pos = end; return { sec: 0, m: p.m }; }
    }
    return null;
  }
  function amount() {
    let m;
    // a range, "10-20'" or "4-6km": a smaller bare number, then a larger one with its unit. It counts
    // as its middle. ("500-300" and "4'-6'" are two amounts.)
    const mark = pos;
    if ((m = peek(/^(\d+(?:[.,]\d+)?)\s*-\s*(?=\d+(?:[.,]\d+)?\s*(?:'|km(?![a-z])|m(?![a-z])))/i))) {
      const lo = parseFloat(m[1].replace(',', '.'));
      pos += m[0].length;
      const hi = amount();
      if (hi) {
        const written = s.slice(mark, pos);
        // the larger number, in the unit both are written in
        const top = hi.sec ? (/''$/.test(written) ? hi.sec : hi.sec / 60) : /km$/i.test(written) ? hi.m / 1000 : hi.m;
        if (lo < top) { const f = (lo + top) / 2 / top; return { sec: hi.sec * f, m: hi.m * f }; }
      }
      pos = mark;
    }
    if ((m = peek(/^(\d+)\s*'(?!')\s*(?:(\d+)\s*'')?/))) { pos += m[0].length; return { sec: +m[1] * 60 + (m[2] ? +m[2] : 0), m: 0 }; }
    if ((m = peek(/^(\d+)\s*''/))) { pos += m[0].length; return { sec: +m[1], m: 0 }; }
    if ((m = peek(/^(\d+(?:[.,]\d+)?)\s*km(?![a-z])/i))) { pos += m[0].length; return { sec: 0, m: parseFloat(m[1].replace(',', '.')) * 1000 }; }
    if ((m = peek(/^(\d+)\s*m(?![a-z])/i))) { pos += m[0].length; return { sec: 0, m: +m[1] }; }
    if ((m = peek(/^(\d+)(?![\d.,])/))) { pos += m[0].length; return { sec: 0, m: +m[1] }; }
    return place();
  }

  // ---- reading: the text as a tree of efforts, blocks and sequences ----

  // An effort: one or more amounts. An amount takes the zone written after it, or else the last one written.
  function effort(isRest) {
    const reps = [];
    let k = 1, last = null, m, start = null;
    while (pos < s.length) {
      ws();
      if (start === null) start = pos;
      const ch = s.charAt(pos);
      if (ch === '' || ch === '+' || ch === '/' || ch === ')' || ch === '(') break;
      if (ch === '-') { pos++; continue; }
      const zz = zone();
      if (zz) { for (const r of reps) { if (!r.zone) r.zone = zz; } last = zz; continue; }
      if ((m = peek(COUNT))) { pos += m[0].length; k *= times(m); continue; }
      const am = amount();
      if (am) { reps.push({ sec: am.sec, m: am.m, zone: null }); continue; }
      m = peek(/^[^\s+\/()]+/);
      pos += m ? m[0].length : 1;
    }
    if (!reps.length) return null;
    for (const r of reps) { if (!r.zone) r.zone = last; }
    return { kind: 'effort', rest: isRest, reps, k, text: s.slice(start, pos).trim() };
  }
  function block() {
    let count = 1, m, zoneOf = null, body;
    ws();
    // a zone written before a count or a bracket is the zone of that block's work
    const mark = pos, before = zone();
    if (before) { ws(); if (peek(/^(\(|\d+(?:\s*-\s*\d+)?\s*[x×](?![a-z]))/i)) zoneOf = before; else pos = mark; }
    if ((m = peek(/^\(\s*(\d+)\s*-\s*(\d+)\s*\)\s*[x×]\s*/i))) { pos += m[0].length; count = (+m[1] + +m[2]) / 2; }
    else if ((m = peek(COUNT))) { pos += m[0].length; count = times(m); }
    ws();
    const set = s.charAt(pos) === '(';
    if (set) {
      pos++;
      body = sequence(true);
      if (s.charAt(pos) === ')') pos++;
      // … and so is a zone written just after the bracket closes
      const here = pos;
      ws();
      const after = zone();
      if (after && !zoneOf) zoneOf = after; else if (!after) pos = here;
    } else body = effort(false);
    ws();
    let rest = null;
    if (s.charAt(pos) === '/') { pos++; rest = effort(true); }
    return { kind: 'block', count, body, rest, zone: zoneOf, set };
  }
  function sequence(inParen) {
    const items = [];
    while (pos < s.length) {
      ws();
      const ch = s.charAt(pos);
      if (ch === '') break;
      if (ch === ')') { if (inParen) break; pos++; continue; }
      if (ch === '+' || ch === '/') { pos++; continue; }
      const before = pos;
      items.push(block());
      if (pos === before) pos++;
    }
    return { kind: 'seq', items };
  }

  // ---- adding up: totals with every repetition counted, and the efforts in the order they come up ----

  const pieces = [], clock = {};
  function add(tot, z, a, k) { if (!tot[z]) tot[z] = { sec: 0, m: 0 }; tot[z].sec += a.sec * k; tot[z].m += a.m * k; }
  function merge(into, from, k) { for (const z in from) add(into, z, from[z], k); }
  const sum = (reps, f) => reps.reduce((n, r) => n + r[f], 0);
  function run(node, given, inSet) {
    const tot = {};
    if (!node) return tot;
    if (node.kind === 'seq') { for (const it of node.items) merge(tot, run(it, given, inSet), 1); return tot; }
    if (node.kind === 'effort') {
      const reps = node.reps.map(r => ({ sec: r.sec, m: r.m, zone: r.zone || (node.rest ? null : given) }));
      const zones = [...new Set(reps.map(r => r.zone))];
      const before = {};
      merge(before, clock, 1);
      const piece = { text: node.text, zone: zones.length === 1 ? zones[0] : null, sec: sum(reps, 'sec'), m: sum(reps, 'm'), rest: node.rest, reps, before, set: inSet, times: node.k, restAfter: null };
      pieces.push(piece);
      for (const r of reps) add(tot, r.zone || (node.rest ? 'rest' : '?'), r, node.k);
      merge(clock, tot, 1);
      node.piece = piece;
      return tot;
    }
    const z = node.zone || given;
    const one = run(node.body, z, inSet || node.set);
    // the rest comes after every amount of the effort: "4'-6'-4'/1'" has three rests
    const rests = node.body && node.body.kind === 'effort' ? node.body.reps.length : 1;
    const pause = run(node.rest, z, inSet || node.set);
    merge(clock, pause, rests - 1);
    merge(one, pause, rests);
    if (node.body && node.body.kind === 'effort') {
      const w = node.body.piece, r = node.rest && node.rest.piece;
      w.times *= node.count;
      if (r) w.restAfter = { sec: r.sec, m: r.m, zone: r.zone };
    }
    // the clock has run through the block once; the other times come before whatever follows
    merge(clock, one, node.count - 1);
    merge(tot, one, node.count);
    return tot;
  }

  // a zone and a colon at the head is the zone of the whole session
  const head = peek(/^\s*R([0-7])(\+)?F?\s*:\s*/i);
  let all = null;
  if (head) { pos += head[0].length; all = 'R' + head[1] + (head[2] && head[1] === '3' ? '+' : ''); }
  return { totals: run(sequence(false), all, false), pieces };
}

// minutes an amount takes at the band's pace for the zone; a distance with no pace takes none
export function minutesOf(a, zone, tables, band) {
  const v = (tables.pace[band] || {})[zone] || (tables.pace.default || {})[zone] || 0;
  return a.sec / 60 + (v ? a.m / 1000 / v * 60 : 0);
}

// What a session's text works out to. tables holds reference (seconds per zone), pace (km/h per zone,
// per band with a default) and places. offWater: the session is in the pool, the gym or on land.
//
// main      the main zone (DESIGN.md 8.1.1), or null
// parts     [{ zone, min, share }]: time per zone, and its share of one full session of that zone
// unzoned   { sec, m } written with no zone, or null
// km        { zone: km } and totalKm (7.0): distances as written, times at the zone's pace.
//           R0 is left out. Distance with no zone counts toward the total only. Nothing off the water.
// offMin    minutes of work off the water
// pieces    [{ text, approx }]: each piece with a zone, and its other unit (8.2)
// efforts   the efforts as readPlan gives them, for the checks
export function infer(text, tables, band, offWater) {
  const { totals: tot, pieces } = readPlan(text, tables.places);
  const own = tables.pace[band] || {}, shared = tables.pace.default || {};
  const speed = z => own[z] || shared[z] || 0;
  const parts = [], km = {};
  let totalKm = 0, offMin = 0;
  for (const z of ZONES) {
    if (!tot[z]) continue;
    // off the water a distance is not paddled, so only written time counts
    const min = tot[z].sec / 60 + (speed(z) && !offWater ? tot[z].m / 1000 / speed(z) * 60 : 0);
    if (min <= 0) continue;
    // each zone is measured against one full session of that zone
    parts.push({ zone: z, min, share: min / (tables.reference[z] / 60) });
    if (offWater) offMin += min;
    else if (z !== 'R0') { km[z] = tot[z].m / 1000 + tot[z].sec / 3600 * speed(z); totalKm += km[z]; }
  }
  if (tot['?']) { if (offWater) offMin += tot['?'].sec / 60; else totalKm += tot['?'].m / 1000; }
  let main = null, best = 0;
  for (const p of parts) { if (p.zone !== 'R0' && p.share > best) { best = p.share; main = p.zone; } }
  if (!main && parts.length) main = 'R0';

  const shown = [];
  for (const p of offWater ? [] : pieces) {
    const v = p.zone ? speed(p.zone) : 0;
    if (!v || (p.sec > 0) === (p.m > 0)) continue;
    const approx = p.m > 0 ? durationText(p.m / 1000 / v * 3600) : distanceText(p.sec / 3600 * v * 1000);
    if (!shown.some(x => x.text === p.text)) shown.push({ text: p.text, approx });
  }
  return { main, parts, unzoned: tot['?'] || null, km, totalKm, offMin, pieces: shown, efforts: pieces };
}

// 10'55'' or 45''
export function durationText(sec) {
  const s = Math.round(sec);
  return s < 60 ? s + "''" : Math.floor(s / 60) + "'" + String(s % 60).padStart(2, '0') + "''";
}

// 730 m or 5.9 km
export function distanceText(m) {
  return m >= 1000 ? dec(m / 1000, 1) + ' km' : Math.round(m / 10) * 10 + ' m';
}

// km as shown on the sheet: whole numbers, "<1" under half a km
export function kmText(km) {
  return km >= 0.5 ? String(Math.round(km)) : (km > 0 ? '<1' : '0');
}

// 32' or 40''
export function minutesText(min) {
  return min >= 1 ? Math.round(min) + "'" : Math.round(min * 60) + "''";
}

// work written with no zone, as written: "4 km", "800 m + 10'"
export function amountText(a) {
  const out = [];
  if (a.m > 0) out.push(a.m >= 1000 ? dec(+(a.m / 1000).toFixed(1)) + ' km' : Math.round(a.m) + ' m');
  if (a.sec > 0) out.push(minutesText(a.sec / 60));
  return out.join(' + ');
}

// ---- the text laid out to be read (DESIGN.md 8.5) ---------------------------

// the parts between the "+" that are outside brackets; the "+" of R3+ belongs to the zone
function partsOf(t) {
  const out = [];
  let depth = 0, from = 0;
  for (let i = 0; i < t.length; i++) {
    const ch = t.charAt(i);
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === '+' && depth === 0 && !/(^|[^A-Za-z0-9])R3$/i.test(t.slice(0, i))) { out.push(t.slice(from, i).trim()); from = i + 1; }
  }
  out.push(t.slice(from).trim());
  return out.filter(Boolean);
}

// The text over several lines: [{ depth, text, part }].
// One line for each part between "+"; a set longer than width opens on one line, has its own parts
// under it, one step in and as many on a line as fit, and closes on a line with its rest. The parts
// of the session are one under the other with no "+"; inside a set a line that continues starts
// with "+". oneLine puts the lines back together.
//   part   the part as written, on its first line; null on the lines that continue it
// A zone written for the whole session ("R2:") is on the first line.
export function outline(text, width) {
  const t = String(text || '').replace(/\s+/g, ' ').trim(), lines = [];
  const head = /^R[0-7]\+?F?\s*:\s*/i.exec(t);
  function put(part, depth, lead, top) {
    const open = part.indexOf('(');
    let close = -1;
    for (let i = open, d = 0; open >= 0 && i < part.length; i++) {
      if (part.charAt(i) === '(') d++;
      else if (part.charAt(i) === ')' && --d === 0) { close = i; break; }
    }
    const inner = close < 0 ? [] : partsOf(part.slice(open + 1, close));
    if (lead.length + part.length + depth * 2 <= width || inner.length < 2) { lines.push({ depth, text: lead + part, part: top ? part : null }); return; }
    lines.push({ depth, text: lead + part.slice(0, open + 1), part: top ? part : null });
    // the set's own parts, as many on a line as fit; one that is itself too long is laid out the same way
    const room = width - (depth + 1) * 2, fits = p => p.length + 2 <= room || p.indexOf('(') < 0;
    let line = '';
    inner.forEach((p, i) => {
      const lead = i ? '+ ' : '';
      if (line && fits(p) && line.length + 3 + p.length <= room) { line += ' + ' + p; return; }
      if (line) lines.push({ depth: depth + 1, text: line, part: null });
      line = '';
      if (fits(p)) line = lead + p; else put(p, depth + 1, lead, false);
    });
    if (line) lines.push({ depth: depth + 1, text: line, part: null });
    lines.push({ depth, text: part.slice(close), part: null });
  }
  partsOf(head ? t.slice(head[0].length) : t).forEach((p, i) => put(p, 0, head && !i ? head[0].trim() + ' ' : '', true));
  return lines;
}

// minutes with the rests, and km as infer counts them
function sizeOf(text, tables, band, offWater) {
  const tot = readPlan(text, tables.places).totals, own = tables.pace[band] || {}, shared = tables.pace.default || {};
  let min = 0, km = 0;
  for (const z in tot) {
    const v = ZONES.includes(z) ? own[z] || shared[z] || 0 : 0;
    min += tot[z].sec / 60 + (v && !offWater ? tot[z].m / 1000 / v * 60 : 0);
    if (!offWater && z !== 'R0' && z !== 'rest') km += tot[z].m / 1000 + tot[z].sec / 3600 * v;
  }
  return { min, km };
}

// A session laid out with what each part comes to: { lines: [{ depth, text, min, km }], min, km }.
// min and km are on a part's first line and null on the lines that continue it.
//   min   minutes, the rests counted; a distance with no pace takes none
//   km    as infer counts them: nothing for R0, for rest with no zone, or off the water
export function sessionLines(text, tables, band, offWater, width) {
  const head = /^\s*R[0-7]\+?F?\s*:\s*/i.exec(String(text || ''));
  let min = 0, km = 0;
  const lines = outline(text, width).map(l => {
    if (l.part === null) return { depth: l.depth, text: l.text, min: null, km: null };
    const x = sizeOf((head ? head[0] : '') + l.part, tables, band, offWater);
    min += x.min; km += x.km;
    return { depth: l.depth, text: l.text, min: x.min, km: x.km };
  });
  return { lines, min, km };
}

// the session as it is shown where it is typed: outline's lines, a step in for each depth
export function linesText(text, width) {
  return outline(text, width).map(l => '  '.repeat(l.depth) + l.text).join('\n');
}

// Lines back to the one line a session is stored as. A new line is a "+", unless it starts with
// "+", ")" or "/", or the line above ends with "+", "(", "/" or ":".
export function oneLine(text) {
  let out = '';
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.replace(/\s+/g, ' ').trim();
    if (!l) continue;
    // the "+" of R3+ is the zone's, not a "+" left open
    const open = /[(\/:]$/.test(out) || (/\+$/.test(out) && !/(^|[^A-Za-z0-9])R3\+$/i.test(out));
    if (!out) out = l;
    else if (/\($/.test(out) || /^\)/.test(l)) out += l;
    else if (open || /^[+\/]/.test(l)) out += ' ' + l;
    else out += ' + ' + l;
  }
  return out;
}
