// Edits to weeks, sessions and events. Like the cycle edits in cycles.js, each returns a new value
// and throws an error with code 'not-allowed' when the change makes no sense.

import { isDate, weekday } from './dates.js';
import { tr } from './lang.js';
import { KINDS, RACE_TYPES, BOATS, PLACES, NOTE_KINDS, sessionKey, nextSlot } from './format.js';

function fail(message) {
  const e = new Error(message);
  e.code = 'not-allowed';
  throw e;
}

function oneLine(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

// ---- weeks ------------------------------------------------------------------

// Set a week's type by hand, with a load when it should differ from the type's. type null makes
// the week follow its mesocycle's pattern again.
export function setWeek(plan, monday, type, load, tables) {
  const rest = plan.hand.filter(h => h.monday !== monday);
  if (type === null) return { ...plan, hand: rest };
  if (tables.load[type] === undefined) fail(tr('there is no week type "{0}"', type));
  if (load !== null && (!Number.isInteger(load) || load < 0 || load > 100)) fail(tr('load is a whole number from 0 to 100'));
  return { ...plan, hand: [...rest, { monday, type, load: load === tables.load[type] ? null : load }] };
}

// ---- sessions ---------------------------------------------------------------

// Add a session, or replace the one in the same place in the day's order (slot). A session with no
// slot is added after the others of that day. band: the band it is for alone, or '' when it is the
// plan's, done by every band. week: it is done on any day of the week that starts on date, a Monday.
export function putSession(plan, session) {
  if (!isDate(session.date)) fail(tr('a session needs a date'));
  const band = session.band || '';
  if (band && !plan.bands.includes(band)) fail(tr('plan {0} has no band "{1}"', plan.id, band));
  const place = session.place || 'water';
  if (!PLACES.includes(place)) fail(tr('a session is on the water, or in the pool, the gym or on land'));
  if (session.week && weekday(session.date) !== 0) fail(tr('a session of the whole week is on its Monday'));
  const slot = Number.isInteger(session.slot) && session.slot > 0 ? session.slot : nextSlot(plan.sessions, session.date, session.week);
  const s = { date: session.date, slot, band, place, week: !!session.week, alt: !!session.alt, notDone: !!session.notDone, title: oneLine(session.title).replace(/=/g, '-'), text: oneLine(session.text), notes: String(session.notes || '') };
  return { ...plan, sessions: [...plan.sessions.filter(x => sessionKey(x) !== sessionKey(s)), s] };
}

export function removeSession(plan, key) {
  // the ones after it on that day move up, whoever they are for, as they will be numbered when the file is read again
  const gone = plan.sessions.find(s => sessionKey(s) === key);
  return { ...plan, sessions: plan.sessions.filter(s => s !== gone).map(s => gone && s.date === gone.date && !!s.week === !!gone.week && s.slot > gone.slot ? { ...s, slot: s.slot - 1 } : s) };
}

// What the plan has for the whole week that starts on monday: its notes or its phrase (kind,
// NOTE_KINDS), the plan's when band is '', else that band's own. An empty one is removed.
export function setNotes(plan, monday, band, text, kind = 'notes') {
  if (!isDate(monday)) fail(tr('week notes need the week\'s Monday'));
  band = band || '';
  if (band && !plan.bands.includes(band)) fail(tr('plan {0} has no band "{1}"', plan.id, band));
  if (!NOTE_KINDS.includes(kind)) fail('there is no "' + kind + '" for a week');
  const rest = plan.notes.filter(n => !(n.monday === monday && (n.band || '') === band && (n.kind || 'notes') === kind));
  return { ...plan, notes: String(text || '').trim() ? [...rest, { monday, band, kind, text: String(text) }] : rest };
}

// ---- events -----------------------------------------------------------------

// A new event on this date: a race in no plan yet.
export function newEvent(date) {
  if (!isDate(date)) fail(tr('an event needs a date'));
  return { date, until: null, confirmed: true, name: tr('New event'), place: '', kind: 'race', type: 'fundo', boats: 'mixed', plans: {} };
}

// Change fields of an event. planIds lists every plan, to tell "all plans" from "some". names lists
// every plan and band an event can name, in the order they are written (each plan, then its bands);
// planIds when it is not given.
// changes may hold: date, until, confirmed, name, place, kind, type, boats, and
// plan: { id, value } where id is a plan or a band, and value an importance (1 to 3) for a race,
// true for another event, and null to take that plan or band's own entry out of the event.
export function setEvent(event, changes, planIds, names) {
  names = names || planIds;
  const e = { ...event, plans: event.plans && { ...event.plans } };
  if (changes.name !== undefined) {
    const name = oneLine(changes.name);
    if (!name) fail(tr('an event needs a name'));
    e.name = name;
  }
  if (changes.place !== undefined) e.place = oneLine(changes.place);
  if (changes.confirmed !== undefined) e.confirmed = !!changes.confirmed;
  if (changes.date !== undefined) {
    if (!isDate(changes.date)) fail(tr('an event needs a date'));
    // the last day stays where it is, and is dropped when the first day moves past it
    e.date = changes.date;
    if (e.until && e.until <= e.date) e.until = null;
  }
  if (changes.until !== undefined) {
    if (changes.until && !isDate(changes.until)) fail(tr('until is a date'));
    if (changes.until && changes.until < e.date) fail(tr('an event cannot end before it starts'));
    e.until = changes.until && changes.until > e.date ? changes.until : null;
  }
  if (changes.kind !== undefined && changes.kind !== e.kind) {
    if (!KINDS.includes(changes.kind)) fail(tr('unknown kind of event'));
    const ids = e.plans ? Object.keys(e.plans) : planIds;
    e.kind = changes.kind;
    if (e.kind === 'race') {
      e.type = 'fundo';
      e.boats = 'mixed';
      e.plans = Object.fromEntries(ids.map(id => [id, 2]));
    } else {
      e.type = null;
      e.boats = null;
      // a race in no plan becomes an event for every plan: in no plan it would be lost from every sheet
      e.plans = !ids.length || planIds.every(id => ids.includes(id)) ? null : Object.fromEntries(ids.map(id => [id, null]));
    }
  }
  if (changes.type !== undefined) {
    if (e.kind !== 'race' || !RACE_TYPES.includes(changes.type)) fail(tr('only races have a type: {0}', RACE_TYPES.join(', ')));
    e.type = changes.type;
  }
  if (changes.boats !== undefined) {
    if (e.kind !== 'race' || !BOATS.includes(changes.boats)) fail(tr('only races have boats: {0}', BOATS.join(', ')));
    e.boats = changes.boats;
  }
  if (changes.plan !== undefined) {
    const { id, value } = changes.plan;
    if (!names.includes(id)) fail(tr('there is no plan or band "{0}"', id));
    // written in the order of names
    const now = e.plans || Object.fromEntries(planIds.map(p => [p, null]));
    if (e.kind === 'race') {
      if (value !== null && ![1, 2, 3].includes(value)) fail(tr('importance is 1, 2 or 3'));
    } else if (value !== null && value !== true) fail(tr('only races have an importance'));
    const next = {};
    for (const p of names) {
      if (p === id) { if (value !== null) next[p] = e.kind === 'race' ? value : null; }
      else if (p in now) next[p] = now[p];
    }
    if (e.kind === 'race') e.plans = next;
    else {
      // an event that is not a race and is in no plan would be lost from every sheet; in every plan
      // it needs no list, and the bands named beside them would add nothing
      if (!Object.keys(next).length) fail(tr('an event applies to at least one plan'));
      e.plans = planIds.every(p => p in next) ? null : next;
    }
  }
  return e;
}
