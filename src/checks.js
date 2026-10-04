// What the course would question about a session and about a week (the checks of DESIGN.md section 9).
// Each check compares what is written with a line of tables.txt, and is off when that line is missing.
// The texts are what the coach reads, in the language in use. Nothing here stops an edit.

import { ZONES, minutesOf, minutesText } from './notation.js';
import { sheet, sessionView, eventsFor, weekOf } from './engine.js';
import { sessionKey, sortSessions } from './format.js';
import { addDays, daysBetween, weekday, DAYS } from './dates.js';
import { tr } from './lang.js';

// the course's order of contents in a session, from fresh to tired (slide 195):
// R5 and R6 first, then R3, R3+ and R4, then R2 and R1
const ORDER = { R5: 0, R6: 0, R3: 1, 'R3+': 1, R4: 1, R2: 2, R1: 2 };

// hours to recover after a session whose main zone is this one, or 0
function hoursOf(tables, zone) {
  const key = Object.keys(tables.recovery).find(k => k.split('-').includes(zone));
  return key ? tables.recovery[key] : 0;
}

// a time as the coach writes it: 60', 1'30'', 45''
function short(sec) {
  const s = Math.round(sec), m = Math.floor(s / 60), r = s % 60;
  return (m ? m + "'" : '') + (r || !m ? r + "''" : '');
}

// a session that needs two days before the next one like it (48 h or more)
const hard = (tables, s) => hoursOf(tables, s.main) >= 48;

// the content a zone is counted in (R3 and R3+ together, R4 and R5 together)
const contentOf = (tables, z) => Object.keys(tables.develop).find(key => key.split('-').includes(z)) || z;

// The hours two sessions should be apart and are not, a before b (the recovery table): 48 after a
// session that needs 48 h or more, 24 for the same content twice in a day. 0 when they are far enough.
export function tooClose(a, b, tables) {
  const days = daysBetween(a.date, b.date);
  if (hard(tables, a) && hard(tables, b) && days < 2) return 48;
  if (days === 0 && a.main && contentOf(tables, a.main) === contentOf(tables, b.main) && hoursOf(tables, a.main) >= 24) return 24;
  return 0;
}

// volume in the morning and quality in the afternoon of the same day (slide 196)
export function wrongHalf(am, pm) {
  return ORDER[am.main] === 2 && ORDER[pm.main] < 2;
}

// "Tue AM (R3)"
function named(s) {
  return tr(DAYS[weekday(s.date)]) + ' ' + (s.slot === 'am' ? tr('AM') : tr('PM')) + ' (' + s.main + ')';
}

// One session, as sessionView gives it: [text]. A session marked "not done" is not checked.
export function sessionChecks(s, tables) {
  const out = [];
  if (s.notDone) return out;
  const band = s.band, off = s.place !== 'water';
  // off the water a distance is not paddled, so only written time is looked at
  const mins = (a, zone) => minutesOf(off ? { sec: a.sec, m: 0 } : a, ZONES.includes(zone) ? zone : 'R0', tables, band);
  const work = s.efforts.filter(p => !p.rest);
  const reps = work.flatMap(p => p.reps.filter(r => r.zone).map(r => ({ ...r, piece: p })));

  // a zone the course does not give this age (the zones table)
  const allowed = tables.zones[band];
  if (allowed) {
    const odd = ZONES.filter(z => z !== 'R0' && !allowed.includes(z) && reps.some(r => r.zone === z));
    if (odd.length) out.push(tr('{0}: not recommended for {1}', odd.join(', '), band));
  }

  // the order of contents; R1 at the start is the warm-up
  const seq = reps.map(r => r.zone).filter(z => z in ORDER);
  let k = 0, late = null;
  while (k < seq.length && seq[k] === 'R1') k++;
  for (const z of seq.slice(k)) {
    if (late && ORDER[z] < ORDER[late]) { out.push(tr('{0} after {1}: the recommended order is R5 and R6, then R3, R3+ and R4, then R2 and R1', z, late)); break; }
    if (!late || ORDER[z] > ORDER[late]) late = z;
  }

  // how long one repetition lasts (the rep table)
  for (const z of Object.keys(tables.rep)) {
    const [lo, hi] = tables.rep[z];
    const bad = reps.map(r => mins(r, z) * 60).find((sec, i) => reps[i].zone === z && sec > 0 && (sec < lo - 0.5 || sec > hi + 0.5));
    if (bad !== undefined) out.push(bad > hi
      ? tr('{0}: {1} exceeds the recommended maximum of {2} to {3}', z, short(bad), short(lo), short(hi))
      : tr('{0}: {1} is below the recommended minimum of {2} to {3}', z, short(bad), short(lo), short(hi)));
  }

  // the rest after a repetition (the rest table). Inside brackets the short rests belong to the
  // series and the long one is between sets, so only repetitions on their own are looked at.
  const told = new Set();
  for (const p of work) {
    const rule = p.zone && tables.rest[p.zone];
    if (!rule || p.set || !p.restAfter || told.has(p.zone)) continue;
    const w = Math.max(...p.reps.map(r => mins(r, p.zone))), r = mins(p.restAfter, p.restAfter.zone);
    if (!(w > 0) || !(r > 0)) continue;
    const need = rule.sec ? rule.sec / 60 : rule.ratio * w;
    if (r < need - 1 / 120) {
      told.add(p.zone);
      out.push(rule.sec
        ? tr('{0}: {1} of rest, below the recommended minimum of {2}', p.zone, short(r * 60), short(rule.sec))
        : tr('{0}: {1} of rest after {2}, below the recommended minimum of 1:{3}', p.zone, short(r * 60), short(w * 60), rule.ratio));
    }
  }

  // more work in a zone than a full session of it (the reference table, times "most")
  if (tables.most !== null) {
    for (const p of s.parts) {
      if (p.zone !== 'R0' && p.share > tables.most + 1e-9) out.push(tr('{0}: {1} in one session exceeds the recommended maximum of {2}', p.zone, minutesText(p.min), short(tables.reference[p.zone] * tables.most)));
    }
  }

  // paddling before the zone's work starts (the warm table)
  if (!off) {
    const first = work.find(p => p.reps.some(r => r.zone in tables.warm));
    if (first) {
      const z = first.reps.find(r => r.zone in tables.warm).zone;
      const done = Object.keys(first.before).reduce((n, key) => n + mins(first.before[key], key), 0);
      if (done * 60 < tables.warm[z] - 0.5) out.push(tr('{0} starts {1} into the session: at least {2} before it is recommended', z, short(done * 60), short(tables.warm[z])));
    }
  }
  return out;
}

// Every week of one age band of a plan: [{ n, week: [text], sessions: { key: [text] }, count }].
// week      what the course would question about the week as a whole
// sessions  the same for each session, by its key
// count     how many texts there are in all
export function checksView(data, planId, band, today) {
  const sh = sheet(data, planId, today), tables = data.tables, plan = sh.plan;
  const all = sortSessions(plan.sessions.filter(s => s.band === band && !s.notDone), plan.bands).map(s => sessionView(data, s, today));
  const races = eventsFor(data, planId, today).filter(e => e.kind === 'race' && e.importance <= 2);
  const allowed = tables.zones[band];
  const content = z => contentOf(tables, z);

  return sh.weeks.map(wk => {
    const list = all.filter(s => weekOf(data.season, s.date) === wk.n);
    const meso = wk.meso === null ? null : sh.mesos[wk.meso];
    const week = [], sessions = {};

    // too little time between sessions (the recovery table): two days after a session that needs
    // 48 h or more; a session of the same content not on the same day when it needs 24 h
    for (const b of list) {
      for (const a of all) {
        if (a === b || a.date > b.date || (a.date === b.date && a.slot >= b.slot)) continue;
        const hours = tooClose(a, b, tables);
        if (hours) week.push(tr('{0} and {1} are less than {2} h apart', named(a), named(b), hours));
      }
    }

    // quality in the morning, volume in the afternoon (slide 196)
    for (const pm of list.filter(s => s.slot === 'pm')) {
      const am = list.find(s => s.date === pm.date && s.slot === 'am');
      if (am && wrongHalf(am, pm)) week.push(tr('{0} before {1}: the quality session is recommended in the morning', named(am), named(pm)));
    }

    // race-pace sessions in the week (the race-pace table)
    const r7 = list.filter(s => s.main === 'R7').length;
    if (tables.racePace) {
      const comp = !!meso && meso.pat === 'comp', limit = tables.racePace[comp ? 1 : 0];
      if (r7 > limit) week.push(comp
        ? tr('{0} R7 sessions exceed the recommended maximum of {1} a week in the competitive period', r7, limit)
        : tr('{0} R7 sessions exceed the recommended maximum of {1} a week in the preparatory period', r7, limit));
    }

    // a content of the block that has no session in a week with sessions
    if (meso && list.length && wk.type !== 'R') {
      const keys = [...new Set(meso.zones.filter(z => !allowed || allowed.includes(z)).map(content))];
      for (const key of keys) {
        if (!list.some(s => s.main && content(s.main) === key)) week.push(tr("{0} is the block's content and has no session this week", key));
      }
    }

    // a recovery week keeps volume and intensity low
    if (wk.type === 'R') {
      const heavy = list.filter(s => hard(tables, s));
      if (heavy.length) week.push(tr('A recovery week with {0}: low volume and intensity are recommended', heavy.map(named).join(', ')));
    }

    // around a race: a light day before, the day after off (slide 128)
    for (const s of list) {
      for (const e of races) {
        if (s.date === addDays(e.date, -1) && hard(tables, s)) week.push(tr('{0} is the day before {1}: a light day is recommended', named(s), e.name));
        if (s.date === addDays(e.to, 1)) week.push(tr('{0} is the day after {1}: a day off is recommended', tr(DAYS[weekday(s.date)]), e.name));
      }
    }

    // the taper lowers the volume, not the number of sessions (slide 189)
    if ((wk.type === 'AT' || wk.type === 'CT') && list.length) {
      const before = all.filter(s => weekOf(data.season, s.date) === wk.n - 1).length;
      if (before > list.length) week.push(tr('{0} sessions, {1} the week before: in the taper, lower the volume and keep the number of sessions', list.length, before));
    }

    let count = week.length;
    for (const s of list) {
      const found = sessionChecks(s, tables);
      if (found.length) { sessions[sessionKey(s)] = found; count += found.length; }
    }
    return { n: wk.n, week, sessions, count };
  });
}
