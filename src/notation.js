// Reading session notation (DESIGN.md 8.1) and working out the main zone (8.1.1).
// Ported from parsePlan and infer in mockups/level1-layouts.html.

export const ZONES = ['R0', 'R1', 'R2', 'R3', 'R3+', 'R4', 'R5', 'R6', 'R7'];

// What is written per zone: { zone: { sec, m } }.
// Work with no zone is under '?', rest with no zone under 'rest'.
// places is a list of { name, m }: a place name stands for its distance.
export function parsePlan(text, places) {
  return readPlan(text, places).totals;
}

// The same reading, with each piece of work or rest as written, in order:
// pieces: [{ text, zone, sec, m, rest }], one repetition each.
export function readPlan(text, places) {
  const s = String(text || '').replace(/[‘’′´`]/g, "'").replace(/[“”″"]/g, "''");
  const landmarks = (places || []).slice().sort((a, b) => b.name.length - a.name.length);
  const pieces = [];
  let pos = 0;
  function peek(re) { return re.exec(s.slice(pos)); }
  function ws() { const m = peek(/^\s+/); if (m) pos += m[0].length; }
  function add(tot, z, a, k) { if (!tot[z]) tot[z] = { sec: 0, m: 0 }; tot[z].sec += a.sec * k; tot[z].m += a.m * k; }
  function merge(into, from, k) { for (const z in from) add(into, z, from[z], k); }
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
    if ((m = peek(/^(\d+)\s*'(?!')\s*(?:(\d+)\s*'')?/))) { pos += m[0].length; return { sec: +m[1] * 60 + (m[2] ? +m[2] : 0), m: 0 }; }
    if ((m = peek(/^(\d+)\s*''/))) { pos += m[0].length; return { sec: +m[1], m: 0 }; }
    if ((m = peek(/^(\d+(?:[.,]\d+)?)\s*km(?![a-z])/i))) { pos += m[0].length; return { sec: 0, m: parseFloat(m[1].replace(',', '.')) * 1000 }; }
    if ((m = peek(/^(\d+)\s*m(?![a-z])/i))) { pos += m[0].length; return { sec: 0, m: +m[1] }; }
    if ((m = peek(/^(\d+)(?![\d.,])/))) { pos += m[0].length; return { sec: 0, m: +m[1] }; }
    return place();
  }
  function effort(isRest) {
    const a = { sec: 0, m: 0 };
    let k = 1, z = null, got = false, m, start = null;
    while (pos < s.length) {
      ws();
      if (start === null) start = pos;
      const ch = s.charAt(pos);
      if (ch === '' || ch === '+' || ch === '/' || ch === ')' || ch === '(') break;
      const zz = zone();
      if (zz) { if (!z) z = zz; continue; }
      if ((m = peek(/^(\d+)\s*x(?![a-z])\s*/i))) { pos += m[0].length; k *= +m[1]; continue; }
      const am = amount();
      if (am) { a.sec += am.sec; a.m += am.m; got = true; ws(); if (s.charAt(pos) === '-') pos++; continue; }
      m = peek(/^[^\s+\/()]+/);
      pos += m ? m[0].length : 1;
    }
    const tot = {};
    if (got) {
      add(tot, z || (isRest ? 'rest' : '?'), a, k);
      pieces.push({ text: s.slice(start, pos).trim(), zone: z, sec: a.sec, m: a.m, rest: isRest });
    }
    return tot;
  }
  function block() {
    let count = 1, m, inner;
    const tot = {};
    ws();
    if ((m = peek(/^\(\s*(\d+)\s*-\s*(\d+)\s*\)\s*x\s*/i))) { pos += m[0].length; count = (+m[1] + +m[2]) / 2; }
    else if ((m = peek(/^(\d+)\s*x(?![a-z])\s*/i))) { pos += m[0].length; count = +m[1]; }
    ws();
    if (s.charAt(pos) === '(') { pos++; inner = sequence(true); if (s.charAt(pos) === ')') pos++; }
    else inner = effort(false);
    ws();
    if (s.charAt(pos) === '/') { pos++; merge(inner, effort(true), 1); }
    merge(tot, inner, count);
    return tot;
  }
  function sequence(inParen) {
    const tot = {};
    while (pos < s.length) {
      ws();
      const ch = s.charAt(pos);
      if (ch === '') break;
      if (ch === ')') { if (inParen) break; pos++; continue; }
      if (ch === '+' || ch === '/') { pos++; continue; }
      const before = pos;
      merge(tot, block(), 1);
      if (pos === before) pos++;
    }
    return tot;
  }
  return { totals: sequence(false), pieces };
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
  return { main, parts, unzoned: tot['?'] || null, km, totalKm, offMin, pieces: shown };
}

// 10'55'' or 45''
export function durationText(sec) {
  const s = Math.round(sec);
  return s < 60 ? s + "''" : Math.floor(s / 60) + "'" + String(s % 60).padStart(2, '0') + "''";
}

// 730 m or 5.9 km
export function distanceText(m) {
  return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m / 10) * 10 + ' m';
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
  if (a.m > 0) out.push(a.m >= 1000 ? +(a.m / 1000).toFixed(1) + ' km' : Math.round(a.m) + ' m');
  if (a.sec > 0) out.push(minutesText(a.sec / 60));
  return out.join(' + ');
}
