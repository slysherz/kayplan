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
  return { plan: dir + 'plan.txt', cycles: dir + 'cycles.txt', weeks: dir + 'weeks.txt', sessions: dir + 'sessions.txt', notes: dir + 'notes.txt' };
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
    const [head, macros, hand, sessions, notes] = await Promise.all([
      file(f.plan, format.parsePlanFile), file(f.cycles, format.parseCycles), file(f.weeks, format.parseWeeks), file(f.sessions, format.parseSessions), file(f.notes, format.parseNotes)
    ]);
    return { id, name: head.name || id, bands: head.bands, macros, hand, sessions, notes };
  }));
  data.errors.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : (a.line || 0) - (b.line || 0));
  return data;
}

// The text of one of the files the plan's edits change, written from the data.
export function fileText(data, path) {
  if (path === 'events.txt') return format.serializeEvents(data.events);
  const m = /^plans\/([^/]+)\/(cycles|weeks|sessions|notes)\.txt$/.exec(path), plan = m && planOf(data, m[1]);
  if (!plan) throw new Error('not a file the plan writes: ' + path);
  if (m[2] === 'cycles') return format.serializeCycles(plan.macros);
  if (m[2] === 'weeks') return format.serializeWeeks(plan.hand);
  if (m[2] === 'notes') return format.serializeNotes(plan.notes, plan.bands);
  return format.serializeSessions(plan.sessions);
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

// What an event is for one band of a plan: the race's importance (null for another event, or for an
// event of every plan), or undefined when the event is not for that band. The band's own entry comes
// first, then its plan's (events.txt: "plans: cadete 1, juniors 2").
export function bandEntry(e, planId, band) {
  if (e.plans === null) return null;
  if (band && Object.prototype.hasOwnProperty.call(e.plans, band)) return e.plans[band];
  if (Object.prototype.hasOwnProperty.call(e.plans, planId)) return e.plans[planId];
  return undefined;
}

// The events of one band of a plan, in date order, each with its importance for that band.
// With no band, the events of any band of the plan, each with the importance it has for its most
// important band.
// Each also carries bands, the plan's bands it is for, and only: those bands when they are not all
// of them and no band was asked for, else null.
export function eventsFor(data, planId, today, band) {
  const plan = planOf(data, planId), all = plan ? plan.bands : [];
  return format.sortEvents(data.events).map(e => {
    const bands = all.filter(b => bandEntry(e, planId, b) !== undefined);
    const mine = band ? bandEntry(e, planId, band) : undefined;
    if (band ? mine === undefined : !bands.length) return null;
    const importance = band ? mine : e.kind === 'race' && e.plans ? Math.min(...bands.map(b => bandEntry(e, planId, b))) : null;
    return { ...eventView(data, e, today), importance, bands, only: !band && bands.length < all.length ? bands : null };
  }).filter(Boolean);
}

// ---- sessions ---------------------------------------------------------------

// The name the library gives a session: that of the first line with the same text and place, or ''.
// Nothing links the two: a session whose text is changed is no longer that session.
const NAMES = new WeakMap();
export function nameOf(data, s) {
  if (!data.library) return '';
  let names = NAMES.get(data.library);
  if (!names) {
    names = new Map();
    for (const l of data.library) { const k = format.plain(l.text) + '|' + l.place; if (l.name && !names.has(k)) names.set(k, l.name); }
    NAMES.set(data.library, names);
  }
  return names.get(format.plain(s.text) + '|' + (s.place || 'water')) || '';
}

// A session with what is worked out from its text, and whether it counts as done.
// A session whose date has passed counts as done unless it is marked not done.
// A session of the whole week counts as done once the week has ended.
// band: the band it is worked out for (its pace); a session of one band is always worked out for it,
// and one of the plan's with no band given at the default pace.
//   name   what it is called: its title, else the name the library gives its text
//   band   '' for a session of the plan's, done by every band
export function sessionView(data, s, today, band) {
  return { ...s, band: s.band || '', title: s.title || '', name: s.title || nameOf(data, s), ...infer(s.text, data.tables, s.band || band || null, s.place !== 'water'), status: s.notDone ? 'not done' : s.alt ? 'alternative' : (format.lastDay(s) < today ? 'done' : 'planned') };
}

// The sessions one band does, the plan's and its own, each worked out for that band, in their order.
export function bandSessions(data, plan, band, today) {
  return format.sortSessions(plan.sessions.filter(s => format.forBand(s, band))).map(s => sessionView(data, s, today, band));
}

// The parts of the notes file for the week that starts on this Monday, exactly as written for one
// band, or for the plan when band is '': { notes, phrase }, each '' when there is none.
export function noteParts(plan, monday, band) {
  return Object.fromEntries(format.NOTE_KINDS.map(k => {
    const n = plan.notes.find(x => x.monday === monday && (x.band || '') === (band || '') && (x.kind || 'notes') === k);
    return [k, n ? n.text : ''];
  }));
}

// What a band has for the whole week that starts on this Monday: { notes, phrase }, each '' when
// there is none. Its notes are the plan's with the band's own after them, a blank line between;
// its phrase is its own, else the plan's. With band '' it is the plan's alone.
export function weekNotes(plan, monday, band) {
  const all = noteParts(plan, monday, ''), own = band ? noteParts(plan, monday, band) : { notes: '', phrase: '' };
  const trim = t => String(t || '').replace(/^\s*\n|\s+$/g, '');
  return { notes: [all.notes, own.notes].map(trim).filter(Boolean).join('\n\n'), phrase: own.phrase.trim() ? own.phrase : all.phrase };
}
const hasNotes = n => format.NOTE_KINDS.some(k => String(n[k]).trim());

// ---- the annual sheet -------------------------------------------------------

// Everything the sheet shows for one plan: cycles with their weeks, and each week's type and load.
// The races and events are those of the band given (eventsFor), or of any band of the plan.
export function sheet(data, planId, today, band) {
  const plan = planOf(data, planId), season = data.season;
  const lay = layout(plan.macros);
  const hand = new Map(plan.hand.map(h => [h.monday, h]));
  const events = eventsFor(data, planId, today, band);
  const ended = endedWeeks(season, today), current = weekOf(season, today);
  const counts = {};
  // a session of the plan's counts for every band
  for (const s of plan.sessions) {
    const n = weekOf(season, s.date);
    if (n) { counts[n] = counts[n] || {}; for (const b of s.band ? [s.band] : plan.bands) counts[n][b] = (counts[n][b] || 0) + 1; }
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

// One week of one plan: its place in the cycles, seven days with their events and sessions, the
// sessions of the whole week (week: done on any day of it), and the week's notes and phrase of each
// band as weekNotes gives them ({ band: { notes, phrase } }, and the plan's own under '').
// With a band, only the sessions it does (the plan's and its own), worked out for it; without one,
// every session, those of the plan's at the default pace.
export function weekView(data, planId, n, today, band) {
  const sh = sheet(data, planId, today, band), week = sh.weeks[n - 1];
  const all = band ? bandSessions(data, sh.plan, band, today) : format.sortSessions(sh.plan.sessions).map(s => sessionView(data, s, today));
  const days = [];
  for (let d = 0; d < 7; d++) {
    const date = addDays(week.monday, d);
    days.push({
      date, weekday: d, today: date === today,
      events: week.events.filter(e => e.date <= date && e.to >= date),
      sessions: all.filter(s => s.date === date && !s.week)
    });
  }
  const anyDay = all.filter(s => s.week && s.date === week.monday);
  const notes = Object.fromEntries(['', ...sh.plan.bands].map(b => [b, weekNotes(sh.plan, week.monday, b)]));
  return { ...week, plan: sh.plan, band: band || '', mesoInfo: week.meso === null ? null : sh.mesos[week.meso], macroInfo: week.macro === null ? null : sh.macros[week.macro], days, week: anyDay, notes };
}

// One day across every plan, for the phone at the water's edge: what each group does that day.
// { date, weekday, today, week, plans: [{ id, name, type, meso, events, sessions, anyDay, notes }], prev, next }
//   sessions    the day's sessions that have something written, each as sessionView gives it: one
//               of the plan's once (band ''), at the default pace; one of a band with its band
//   anyDay      the same for the sessions of the whole week, shown on each of its days
//   events      the day's events of the bands that train that day (of any band when none does)
//   notes       [{ band, notes, phrase }]: the week's notes as written, the plan's (band '') when
//               anyone trains that day, then those of each band that trains that day
//   prev, next  the nearest other days that have such a session, or null
export function dayView(data, date, today) {
  const n = weekOf(data.season, date), written = s => !!(String(s.text || '').trim() || String(s.notes || '').trim());
  const plans = data.plans.map(plan => {
    const sh = n ? sheet(data, plan.id, today) : null, wk = sh ? sh.weeks[n - 1] : null;
    const sessions = format.sortSessions(plan.sessions.filter(s => s.date === date && !s.week && written(s))).map(s => sessionView(data, s, today));
    const anyDay = wk ? format.sortSessions(plan.sessions.filter(s => s.week && s.date === wk.monday && written(s))).map(s => sessionView(data, s, today)) : [];
    const both = [...sessions, ...anyDay];
    // a session of the plan's means every band trains
    const bands = both.some(s => !s.band) ? plan.bands : plan.bands.filter(b => both.some(s => s.band === b));
    return {
      id: plan.id, name: plan.name, type: wk ? wk.type : null, meso: wk && wk.meso !== null ? sh.mesos[wk.meso].name : null,
      events: wk ? wk.events.filter(e => e.date <= date && e.to >= date && (!both.length || e.bands.some(b => bands.includes(b)))) : [],
      sessions, anyDay,
      notes: wk && both.length ? ['', ...bands].map(band => ({ band, ...noteParts(plan, wk.monday, band) })).filter(hasNotes) : []
    };
  });
  // a day with a session of its own: those of the whole week are on every day of it
  const dates = [...new Set(data.plans.flatMap(p => p.sessions.filter(s => !s.week && written(s)).map(s => s.date)))].sort();
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
    const named = new Map();
    for (const s of data.library) {
      if (s.name && named.has(s.name.toLowerCase())) add('warning', 'library.txt', s.line, tr('The name "{0}" is also on line {1}', s.name, named.get(s.name.toLowerCase())));
      else if (s.name) named.set(s.name.toLowerCase(), s.line);
      if (s.place === 'water' && !infer(s.text, data.tables, null, false).main) add('warning', 'library.txt', s.line, tr('"{0}" has no zone and is never suggested', s.text));
    }
  }

  // an event names plans and bands, so a band's name must say which band it is
  const ids = data.plans.map(p => p.id), owners = {};
  for (const p of data.plans) for (const b of p.bands) (owners[b] = owners[b] || []).push(p.id);
  for (const b of Object.keys(owners)) {
    if (owners[b].length > 1) add('error', planFiles(owners[b][1]).plan, null, tr('band "{0}" is also in plan {1}: a band can be in one plan only', b, owners[b][0]));
    if (ids.includes(b)) add('error', planFiles(owners[b][0]).plan, null, tr('band "{0}" has the name of a plan', b));
  }
  for (const e of data.events) {
    for (const id of Object.keys(e.plans || {})) {
      if (!ids.includes(id) && !owners[id]) add('error', 'events.txt', e.line, e.name + ': ' + tr('there is no plan or band "{0}"', id));
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
    for (const s of plan.sessions) {
      if (!inSeason(s.date)) add('error', f.sessions, s.line, tr('{0} is outside the season', s.date));
      if (s.band && !plan.bands.includes(s.band)) add('error', f.sessions, s.line, tr('plan {0} has no band "{1}"', plan.id, s.band));
    }
    for (const x of plan.notes) {
      if (weekday(x.monday) !== 0 || !inSeason(x.monday)) add('error', f.notes, x.line, tr('{0} is not the Monday of a week in the season', x.monday));
      if (x.band && !plan.bands.includes(x.band)) add('error', f.notes, x.line, tr('plan {0} has no band "{1}"', plan.id, x.band));
    }
  }
  return out;
}
