// The engine: reads the plan through a store and works out everything derived from it.
// The page and the command line both use these functions, so they show the same values (DESIGN.md 6.5).
// "today" is always passed in; it is never stored (6.7).

import { addDays, daysBetween, weekday } from './dates.js';
import { tr } from './lang.js';
import { ZONES, infer } from './notation.js';
import { layout, patType } from './cycles.js';
import * as format from './format.js';

export const RACE_LETTER = { sprint: 'S', fundo: 'F', maratona: 'M' };
export const BOAT_MARK = { solo: '1', crew: 'T', mixed: '+' };
export const EVENT_CODE = { test: 't', camp: 'c', holiday: 'h', 'no-water': 'x' };
// the week types the load patterns produce
const PATTERN_TYPES = ['I', 'C', 'CH', 'R', 'AT', 'CT'];

export function planFiles(id) {
  const dir = 'plans/' + id + '/';
  return { plan: dir + 'plan.txt', cycles: dir + 'cycles.txt', weeks: dir + 'weeks.txt', sessions: dir + 'sessions.txt' };
}

// Read every file. Problems in the files are collected in errors, not thrown.
// revs holds each file's revision as read, for saving it back.
export async function load(store) {
  const data = { season: null, tables: null, events: [], library: [], plans: [], errors: [], revs: {} };
  async function file(path, parse) {
    const f = await store.read(path);
    data.revs[path] = f ? f.rev : null;
    const r = parse(f ? f.text : '');
    if (!f && r.errors.length) data.errors.push({ file: path, line: null, message: tr('the file is missing') });
    else for (const e of r.errors) data.errors.push({ file: path, line: e.line, message: e.message });
    return r.value;
  }
  const paths = await store.list();
  const ids = [...new Set(paths.map(p => /^plans\/([^/]+)\//.exec(p)).filter(Boolean).map(m => m[1]))].sort();
  [data.season, data.tables, data.events, data.library] = await Promise.all([
    file('season.txt', format.parseSeason), file('tables.txt', format.parseTables), file('events.txt', format.parseEvents), file('library.txt', format.parseLibrary)
  ]);
  // plans in the order season.txt lists them; any it does not list come after, by id
  const order = data.season ? data.season.plans : [];
  const rank = id => order.includes(id) ? order.indexOf(id) : order.length;
  ids.sort((a, b) => rank(a) - rank(b));
  data.plans = await Promise.all(ids.map(async id => {
    const f = planFiles(id);
    const [head, macros, hand, sessions] = await Promise.all([
      file(f.plan, format.parsePlanFile), file(f.cycles, format.parseCycles), file(f.weeks, format.parseWeeks), file(f.sessions, format.parseSessions)
    ]);
    return { id, name: head.name || id, bands: head.bands, macros, hand, sessions };
  }));
  data.errors.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : (a.line || 0) - (b.line || 0));
  return data;
}

// The text of one of the files the plan's edits change, written from the data.
export function fileText(data, path) {
  if (path === 'events.txt') return format.serializeEvents(data.events);
  const m = /^plans\/([^/]+)\/(cycles|weeks|sessions)\.txt$/.exec(path), plan = m && planOf(data, m[1]);
  if (!plan) throw new Error('not a file the plan writes: ' + path);
  if (m[2] === 'cycles') return format.serializeCycles(plan.macros);
  if (m[2] === 'weeks') return format.serializeWeeks(plan.hand);
  return format.serializeSessions(plan.sessions, plan.bands);
}

// false when the season itself cannot be read; nothing can be worked out then
export function usable(data) {
  return !!(data.season && data.season.start && data.season.weeks);
}

export function planOf(data, id) {
  return data.plans.find(p => p.id === id) || null;
}

// ---- weeks ------------------------------------------------------------------

// week number (from 1) of a date, or null outside the season
export function weekOf(season, date) {
  const d = daysBetween(season.start, date);
  if (d < 0) return null;
  const n = Math.floor(d / 7) + 1;
  return n <= season.weeks ? n : null;
}

export function mondayOf(season, n) {
  return addDays(season.start, (n - 1) * 7);
}

// how many weeks have ended: their Sunday is before today
export function endedWeeks(season, today) {
  return Math.max(0, Math.min(season.weeks, Math.floor(daysBetween(season.start, today) / 7)));
}

// ---- events -----------------------------------------------------------------

export function raceCode(e) {
  return e.kind === 'race' ? RACE_LETTER[e.type] + BOAT_MARK[e.boats] : EVENT_CODE[e.kind];
}

// An event with what is worked out: its code, the weeks it touches, and whether it is a race in the
// past whose date was never confirmed.
export function eventView(data, e, today) {
  const to = e.until || e.date, weeks = [];
  for (let n = 1; n <= data.season.weeks; n++) {
    const monday = mondayOf(data.season, n);
    if (monday <= to && addDays(monday, 6) >= e.date) weeks.push(n);
  }
  return { ...e, to, code: raceCode(e), weeks, unconfirmedPast: e.kind === 'race' && !e.confirmed && to < today };
}

// The events of one plan, in date order. Races carry the plan's importance.
export function eventsFor(data, planId, today) {
  return format.sortEvents(data.events)
    .filter(e => e.plans === null || planId in e.plans)
    .map(e => ({ ...eventView(data, e, today), importance: e.plans ? e.plans[planId] : null }));
}

// ---- sessions ---------------------------------------------------------------

// A session with what is worked out from its text, and whether it counts as done.
// A session whose date has passed counts as done unless it is marked not done.
export function sessionView(data, s, today) {
  return { ...s, ...infer(s.text, data.tables, s.band, s.place !== 'water'), status: s.notDone ? 'not done' : (s.date < today ? 'done' : 'planned') };
}

// ---- the annual sheet -------------------------------------------------------

// Everything the sheet shows for one plan: cycles with their weeks, and each week's type and load.
export function sheet(data, planId, today) {
  const plan = planOf(data, planId), season = data.season;
  const lay = layout(plan.macros);
  const hand = new Map(plan.hand.map(h => [h.monday, h]));
  const events = eventsFor(data, planId, today);
  const ended = endedWeeks(season, today), current = weekOf(season, today);
  const counts = {};
  for (const s of plan.sessions) {
    const n = weekOf(season, s.date);
    if (n) { counts[n] = counts[n] || {}; counts[n][s.band] = (counts[n][s.band] || 0) + 1; }
  }
  const weeks = [];
  for (let n = 1; n <= season.weeks; n++) {
    const monday = mondayOf(season, n);
    const meso = lay.mesos.find(m => n >= m.from && n <= m.to) || null;
    // the type follows the mesocycle's pattern unless the week was set by hand
    const pattern = meso ? patType(meso.pat, n - meso.from, meso.len) : null;
    const h = hand.get(monday) || null;
    const type = h ? h.type : pattern;
    const typeLoad = type !== null && data.tables.load[type] !== undefined ? data.tables.load[type] : null;
    weeks.push({
      n, monday, sunday: addDays(monday, 6),
      meso: meso ? meso.index : null, macro: meso ? meso.macro : null,
      pattern, hand: !!h, type, load: h && h.load !== null ? h.load : typeLoad,
      ended: n <= ended, current: n === current,
      events: events.filter(e => e.weeks.includes(n)),
      sessions: counts[n] || {}
    });
  }
  return { plan, macros: lay.macros, mesos: lay.mesos, weeks, ended, current, events };
}

// One week of one plan: its place in the cycles, and seven days with their events and sessions.
export function weekView(data, planId, n, today) {
  const sh = sheet(data, planId, today), week = sh.weeks[n - 1];
  const rank = b => { const i = sh.plan.bands.indexOf(b); return i < 0 ? 1000 : i; };
  const days = [];
  for (let d = 0; d < 7; d++) {
    const date = addDays(week.monday, d);
    days.push({
      date, weekday: d, today: date === today,
      events: week.events.filter(e => e.date <= date && e.to >= date),
      sessions: format.sortSessions(sh.plan.sessions.filter(s => s.date === date), sh.plan.bands).map(s => sessionView(data, s, today))
    });
  }
  return { ...week, plan: sh.plan, mesoInfo: week.meso === null ? null : sh.mesos[week.meso], macroInfo: week.macro === null ? null : sh.macros[week.macro], days };
}

// One day across every plan, for the phone at the water's edge: what each group does that day.
// { date, weekday, today, week, plans: [{ id, name, type, meso, events, sessions }], prev, next }
//   sessions    the day's sessions that have something written, each as sessionView gives it
//   prev, next  the nearest other days that have such a session, or null
export function dayView(data, date, today) {
  const n = weekOf(data.season, date), written = s => !!(String(s.text || '').trim() || String(s.notes || '').trim());
  const plans = data.plans.map(plan => {
    const sh = n ? sheet(data, plan.id, today) : null, wk = sh ? sh.weeks[n - 1] : null;
    return {
      id: plan.id, name: plan.name, type: wk ? wk.type : null, meso: wk && wk.meso !== null ? sh.mesos[wk.meso].name : null,
      events: wk ? wk.events.filter(e => e.date <= date && e.to >= date) : [],
      sessions: format.sortSessions(plan.sessions.filter(s => s.date === date && written(s)), plan.bands).map(s => sessionView(data, s, today))
    };
  });
  const dates = [...new Set(data.plans.flatMap(p => p.sessions.filter(written).map(s => s.date)))].sort();
  return { date, weekday: weekday(date), today: date === today, week: n, plans, prev: dates.filter(d => d < date).pop() || null, next: dates.find(d => d > date) || null };
}

// ---- check ------------------------------------------------------------------

// Whether the plan is valid, plus the warnings. Returns [{ level: 'error' | 'warning', file, line, message }].
export function check(data, today) {
  const out = data.errors.map(e => ({ level: 'error', ...e }));
  const add = (level, file, line, message) => out.push({ level, file, line: line || null, message });
  if (!usable(data)) return out;
  const season = data.season, last = addDays(season.start, season.weeks * 7 - 1);
  const inSeason = date => date >= season.start && date <= last;

  for (const id of season.plans) { if (!planOf(data, id)) add('warning', 'season.txt', null, tr('plans lists "{0}", which has no folder in plans/', id)); }

  if (!data.errors.some(e => e.file === 'tables.txt')) {
    const noLoad = PATTERN_TYPES.filter(t => data.tables.load[t] === undefined);
    if (noLoad.length) add('error', 'tables.txt', null, tr('load is missing for week type {0}', noLoad.join(', ')));
    const noRef = ZONES.filter(z => !data.tables.reference[z]);
    if (noRef.length) add('error', 'tables.txt', null, tr('reference is missing for {0}', noRef.join(', ')));
    const noPace = ZONES.filter(z => !(data.tables.pace.default || {})[z]);
    if (noPace.length) add('error', 'tables.txt', null, tr('pace default is missing for {0}', noPace.join(', ')));
    const noHard = ['R1', 'R2', 'R3', 'R3+', 'R4', 'R5', 'R6'].filter(z => data.tables.hard[z] === undefined);
    if (noHard.length) add('error', 'tables.txt', null, tr('hard is missing for {0}', noHard.join(', ')));
    const noRace = format.RACE_TYPES.filter(t => data.tables.race[t] === undefined);
    if (noRace.length) add('error', 'tables.txt', null, tr('race is missing for {0}', noRace.join(', ')));
    if (data.tables.warmup === null) add('error', 'tables.txt', null, tr('warmup is missing'));
    const dev = Object.keys(data.tables.develop), mnt = Object.keys(data.tables.maintain);
    const odd = [...dev.filter(k => !mnt.includes(k)), ...mnt.filter(k => !dev.includes(k))];
    if (odd.length) add('error', 'tables.txt', null, tr('develop and maintain must list the same contents; only one has {0}', odd.join(', ')));
    const all = dev.flatMap(k => k.split('-')), twice = all.filter((z, i) => all.indexOf(z) !== i);
    if (twice.length) add('error', 'tables.txt', null, tr('develop lists {0} in two contents', [...new Set(twice)].join(', ')));
    const bands = data.plans.flatMap(p => p.bands);
    for (const b of Object.keys(data.tables.yearly)) { if (!bands.includes(b)) add('warning', 'tables.txt', null, tr('yearly km are given for "{0}", which is not a band of any plan', b)); }
    for (const b of Object.keys(data.tables.zoneKm)) { if (!bands.includes(b)) add('warning', 'tables.txt', null, tr('zone-km is given for "{0}", which is not a band of any plan', b)); }
    for (const b of Object.keys(data.tables.zones)) { if (!bands.includes(b)) add('warning', 'tables.txt', null, tr('zones are given for "{0}", which is not a band of any plan', b)); }
  }

  // a library line on the water that has no zone is never suggested
  if (!out.some(o => o.level === 'error' && (o.file === 'tables.txt' || o.file === 'library.txt'))) {
    for (const s of data.library) {
      if (s.place === 'water' && !infer(s.text, data.tables, null, false).main) add('warning', 'library.txt', s.line, tr('"{0}" has no zone and is never suggested', s.text));
    }
  }

  const ids = data.plans.map(p => p.id);
  for (const e of data.events) {
    for (const id of Object.keys(e.plans || {})) {
      if (!ids.includes(id)) add('error', 'events.txt', e.line, e.name + ': ' + tr('there is no plan "{0}"', id));
    }
    const v = eventView(data, e, today);
    if (!v.weeks.length) add('warning', 'events.txt', e.line, tr('{0} ({1}) is outside the season', e.name, e.date));
    if (e.kind === 'race' && !Object.keys(e.plans).length) add('warning', 'events.txt', e.line, tr('{0} is in no plan', e.name));
    if (v.unconfirmedPast) add('warning', 'events.txt', e.line, tr('{0} ({1}) is in the past and its date was never confirmed', e.name, e.date));
  }

  for (const plan of data.plans) {
    const f = planFiles(plan.id);
    if (!data.errors.some(e => e.file === f.cycles)) {
      const covered = layout(plan.macros).weeks;
      if (covered !== season.weeks) add('error', f.cycles, null, tr('the mesocycles cover {0} weeks and the season has {1}', covered, season.weeks));
    }
    for (const h of plan.hand) {
      if (weekday(h.monday) !== 0 || !inSeason(h.monday)) add('error', f.weeks, h.line, tr('{0} is not the Monday of a week in the season', h.monday));
      // a missing pattern type is already reported once, for tables.txt
      if (data.tables.load[h.type] === undefined && !PATTERN_TYPES.includes(h.type)) add('error', f.weeks, h.line, tr('there is no week type "{0}" in tables.txt', h.type));
    }
    const seen = new Set();
    for (const s of plan.sessions) {
      const key = format.sessionKey(s);
      if (seen.has(key)) add('error', f.sessions, s.line, tr('there are two sessions for {0}', key));
      seen.add(key);
      if (!inSeason(s.date)) add('error', f.sessions, s.line, tr('{0} is outside the season', s.date));
      if (!plan.bands.includes(s.band)) add('error', f.sessions, s.line, tr('plan {0} has no band "{1}"', plan.id, s.band));
    }
  }
  return out;
}
