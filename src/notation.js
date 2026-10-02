// Reading session notation (DESIGN.md 8.1) and working out the main zone (8.1.1).
// Ported from parsePlan and infer in mockups/level1-layouts.html.

export const ZONES = ['R0', 'R1', 'R2', 'R3', 'R3+', 'R4', 'R5', 'R6', 'R7'];

// What is written per zone: { zone: { sec, m } }.
// Work with no zone is under '?', rest with no zone under 'rest'.
// places is a list of { name, m }: a place name stands for its distance.
export function parsePlan(text, places) {
  const s = String(text || '').replace(/[‘’′´`]/g, "'").replace(/[“”″"]/g, "''");
  const landmarks = (places || []).slice().sort((a, b) => b.name.length - a.name.length);
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
    let k = 1, z = null, got = false, m;
    while (pos < s.length) {
      ws();
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
    if (got) add(tot, z || (isRest ? 'rest' : '?'), a, k);
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
  return sequence(false);
}

// The main zone of a session, from its text. tables holds reference (seconds per zone), pace (km/h per zone,
// per band with a default) and places.
// Returns { main, parts: [{ zone, min, share }], unzoned: { sec, m } | null }.
export function infer(text, tables, band) {
  const tot = parsePlan(text, tables.places);
  const own = tables.pace[band] || {}, shared = tables.pace.default || {};
  const parts = [];
  for (const z of ZONES) {
    if (!tot[z]) continue;
    const speed = own[z] || shared[z] || 0;
    const min = tot[z].sec / 60 + (speed ? tot[z].m / 1000 / speed * 60 : 0);
    if (min <= 0) continue;
    // each zone is measured against one full session of that zone
    parts.push({ zone: z, min, share: min / (tables.reference[z] / 60) });
  }
  let main = null, best = 0;
  for (const p of parts) { if (p.zone !== 'R0' && p.share > best) { best = p.share; main = p.zone; } }
  if (!main && parts.length) main = 'R0';
  return { main, parts, unzoned: tot['?'] || null };
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
