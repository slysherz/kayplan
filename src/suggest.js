// Sessions suggested for a slot (DESIGN.md 8.4): the lines of library.txt and the sessions the band
// has already had, filtered to what fits the week and ordered by how likely each is to be picked.
// Using one copies its text into the slot; nothing links the two afterwards.

import { infer, ZONES } from './notation.js';
import { sheet, sessionView, weekOf } from './engine.js';
import { contents } from './grid.js';
import { tooClose, wrongHalf } from './checks.js';
import { CONTENT_ZONES } from './cycles.js';
import { sessionKey, plain } from './format.js';

// how many are listed when nothing was asked for
export const SHOWN = 5;

// the zones a week of this type is for; any zone when the type is not here
const LIGHT = { R: ['R1', 'R0'], AT: ['R7', 'R6', 'R1', 'R0'], CT: ['R7', 'R6', 'R1', 'R0'] };
// weeks that take the smaller session of two
const SMALL = ['I', 'R', 'AT', 'CT'];

const same = t => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();

// Suggestions for one slot of one band.
//
// ask: { place, zone, query, limit }
//   place   the place the session is set to; the water unless given
//   zone    every suggestion of this main zone, whatever the week is for
//   query   every suggestion with these words in its name, text, zone, place or notes, whatever the week and place
//   limit   how many to list; SHOWN when neither zone nor query is given, all of them otherwise
//
// Returns { zones, list, total }.
//   zones  [{ zone, missing }]: the band's zones; missing when it is a content of the block that has
//          fewer sessions this week than it takes to develop it
//   list   [{ text, place, notes, name, main, min, used, clash }], the most likely first
//          name   the name the library gives it, or ''
//          min    minutes of work in the main zone
//          used   the date it was last in the plan before this slot, or null
//          clash  it would be too close to another session of the week, or in the wrong half of the day
//   total  how many there are before the limit
//
// What is left out: a session with a zone the band's age is not given, one in another place, and in a
// recovery, activation or competition week one whose main zone the week is not for.
// The order: the zones of the block that have fewer sessions this week than it takes to develop them,
// the one missing most first, then the other zones below what maintains them, then the rest; in a zone, the session it had last time, then the
// others it has had, the longest ago first, then the library in the order of its lines (the smaller
// first in a light week). Without a zone or a query the list takes one of each zone in turn.
// A session that clashes comes after all the others.
export function suggestions(data, planId, band, date, slot, today, ask) {
  ask = ask || {};
  const sh = sheet(data, planId, today), tables = data.tables, n = weekOf(data.season, date);
  const wk = n ? sh.weeks[n - 1] : null, meso = wk && wk.meso !== null ? sh.mesos[wk.meso] : null;
  const allowed = tables.zones[band] || null, here = { date, slot, band };
  const mine = sh.plan.sessions.filter(s => s.band === band && !s.notDone && sessionKey(s) !== sessionKey(here) && same(s.text)).map(s => sessionView(data, s, today));
  const earlier = s => s.date < date || (s.date === date && s.slot < slot);

  // every different text once: the band's own sessions, then the library
  const found = new Map();
  for (const s of mine) {
    const key = plain(s.text) + '|' + s.place, c = found.get(key) || { text: s.text, place: s.place, notes: s.notes, name: '', used: null, order: Infinity };
    if (earlier(s) && (!c.used || s.date > c.used)) c.used = s.date;
    found.set(key, c);
  }
  data.library.forEach((s, i) => {
    const key = plain(s.text) + '|' + s.place, c = found.get(key);
    if (c) { if (c.order === Infinity) c.order = i; c.name = c.name || s.name; } else found.set(key, { text: s.text, place: s.place, notes: s.notes, name: s.name, used: null, order: i });
  });

  // where: a place that was chosen; else off the water on a day with no water; else the water
  const dry = (wk ? wk.events : []).some(e => e.kind === 'no-water' && e.date <= date && e.to >= date);
  const places = ask.place && ask.place !== 'water' ? [ask.place] : dry ? ['pool', 'gym', 'land'] : ['water'];
  const words = same(ask.query).split(' ').filter(Boolean);
  const light = wk && LIGHT[wk.type] ? LIGHT[wk.type] : null;

  let list = [];
  for (const c of found.values()) {
    const v = infer(c.text, tables, band, c.place !== 'water');
    if (!v.main && c.place === 'water') continue;
    if (allowed && v.parts.some(p => p.zone !== 'R0' && !allowed.includes(p.zone))) continue;
    if (words.length) {
      const hay = same([c.name, c.text, c.place, v.main || '', c.notes].join(' '));
      if (!words.every(w => hay.includes(w))) continue;
    } else {
      if (!places.includes(c.place)) continue;
      if (ask.zone ? v.main !== ask.zone : light && v.main && !light.includes(v.main)) continue;
    }
    const part = v.parts.find(p => p.zone === v.main);
    const as = { ...here, main: v.main, place: c.place };
    const clash = mine.some(o => earlier(o) ? tooClose(o, as, tables) > 0 : tooClose(as, o, tables) > 0) ||
      mine.some(o => o.date === date && o.slot !== slot && (slot === 'am' ? wrongHalf(as, o) : wrongHalf(o, as)));
    list.push({ text: c.text, place: c.place, notes: c.notes, name: c.name, main: v.main, min: part ? part.min : v.offMin, share: part ? part.share : 0, used: c.used, order: c.order, clash });
  }

  // the zones, the one the week is missing most first
  const kinds = contents(tables), week = mine.filter(s => weekOf(data.season, s.date) === n);
  const need = {};
  (allowed || CONTENT_ZONES).forEach((z, i) => {
    const c = kinds.find(k => k.zones.includes(z)), group = c ? c.zones : [z];
    const has = week.filter(s => group.includes(s.main)).length;
    const inBlock = !!meso && group.some(g => meso.zones.includes(g));
    const gap = c ? (inBlock ? c.develop[0] : c.maintain[0]) - has : 0;
    need[z] = { zone: z, missing: inBlock && gap > 0, rank: light ? [light.indexOf(z) < 0 ? 99 : light.indexOf(z), 0, i] : [gap > 0 ? (inBlock ? 0 : 1) : 2, -gap, i] };
  });
  const rank = z => need[z] ? need[z].rank : [100, 0, 0];
  const byRank = (a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };

  // in a zone: last time's session, then the others it has had, the longest ago first, then the library
  const before = mine.filter(earlier).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : a.slot < b.slot ? 1 : -1);
  const small = !!wk && SMALL.includes(wk.type);
  const within = (a, b) => {
    if (!!a.used !== !!b.used) return a.used ? -1 : 1;
    if (a.used && a.used !== b.used) return a.used < b.used ? -1 : 1;
    if (!a.used && small && a.share !== b.share) return a.share - b.share;
    return a.order - b.order;
  };
  const groups = new Map();
  for (const z of [...new Set(list.map(x => x.main))].sort(byRank)) {
    const rows = list.filter(x => x.main === z && !x.clash).sort(within);
    const last = before.find(s => s.main === z), i = last ? rows.findIndex(x => plain(x.text) === plain(last.text) && x.place === last.place) : -1;
    if (i > 0) rows.unshift(rows.splice(i, 1)[0]);
    groups.set(z, rows);
  }
  const clashing = list.filter(x => x.clash).sort((a, b) => byRank(a.main, b.main) || within(a, b));

  const out = [];
  if (ask.zone || words.length) for (const rows of groups.values()) out.push(...rows);
  else {
    // one of each zone in turn, so that the first few are different choices
    for (let i = 0, more = true; more; i++) {
      more = false;
      for (const rows of groups.values()) { if (rows[i]) { out.push(rows[i]); more = true; } }
    }
  }
  out.push(...clashing);
  const limit = ask.limit || (ask.zone || words.length ? out.length : SHOWN);
  return {
    zones: ZONES.filter(z => need[z]).map(z => ({ zone: z, missing: need[z].missing })),
    list: out.slice(0, limit).map(x => ({ text: x.text, place: x.place, notes: x.notes, name: x.name, main: x.main, min: x.min, used: x.used, clash: x.clash })),
    total: out.length
  };
}
