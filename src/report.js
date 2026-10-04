// The command line's text output. Everything printed here comes from the engine.

import { DAYS, addDays, weekday } from './dates.js';
import { minutesText, amountText, kmText } from './notation.js';
import { sheet, weekView, eventView, check, weekOf, dayView } from './engine.js';
import { suggestions } from './suggest.js';
import { kmView } from './km.js';
import { gridView } from './grid.js';
import { zoneCard, typesCard } from './zones.js';
import { sortEvents } from './format.js';
import { checksView, sessionChecks } from './checks.js';

// rows of cells -> aligned columns; right lists the columns aligned to the right
function table(rows, right) {
  const widths = [];
  for (const r of rows) r.forEach((c, i) => { widths[i] = Math.max(widths[i] || 0, String(c).length); });
  return rows.map(r => r.map((c, i) => (right || []).includes(i) ? String(c).padStart(widths[i]) : String(c).padEnd(widths[i])).join('  ').replace(/\s+$/, '')).join('\n');
}

function eventText(e) {
  const bits = [DAYS[weekday(e.date)] + ' ' + e.date + (e.to !== e.date ? ' to ' + e.to : '')];
  if (e.kind === 'race') bits.push(e.type + ', ' + e.boats);
  else bits.push(e.kind);
  if (e.importance) bits.push('importance ' + e.importance);
  if (!e.confirmed) bits.push('date not confirmed');
  return e.code + ' ' + e.name + ' (' + bits.join(', ') + ')';
}

function planHead(data, plan, today, current) {
  const s = data.season;
  return plan.id + ' · ' + plan.name + ' · bands ' + plan.bands.join(', ') + '\n' +
    s.weeks + ' weeks, ' + s.start + ' to ' + addDays(s.start, s.weeks * 7 - 1) + ' · today ' + today + (current ? ', week ' + current : ', outside the season');
}

const one = km => km.toFixed(1);

// the annual sheet as a table, one row per week
export function seasonReport(data, planId, today) {
  const sh = sheet(data, planId, today);
  const kms = sh.plan.bands.map(b => kmView(data, planId, b, today));
  const rows = [['', 'wk', 'monday', 'macrocycle', 'mesocycle', 'content', 'type', 'load', 'sessions', 'km', 'events']];
  for (const w of sh.weeks) {
    const meso = w.meso === null ? null : sh.mesos[w.meso];
    rows.push([
      w.current ? '>' : '', w.n, w.monday,
      w.macro === null ? '' : sh.macros[w.macro].name, meso ? meso.name : '', meso ? meso.label : '',
      w.type === null ? '-' : w.type + (w.hand ? '*' : ''), w.load === null ? '-' : w.load,
      sh.plan.bands.filter(b => w.sessions[b]).map(b => b + ' ' + w.sessions[b]).join(', '),
      // km from the week's sessions / the week's estimate
      kms.filter(k => k.weeks[w.n - 1].km > 0 || k.weeks[w.n - 1].estimate !== null).map(k => {
        const x = k.weeks[w.n - 1];
        return k.band + ' ' + kmText(x.km) + (x.estimate === null ? '' : '/' + Math.round(x.estimate));
      }).join(', '),
      w.events.map(eventText).join('; ')
    ]);
  }
  const totals = kms.map(k => {
    const s = k.season;
    return 'km ' + k.band + ': ' + one(s.done) + ' done + ' + one(s.planned) + ' planned' + (s.yearly === null ? ', no yearly km' : ' of ' + s.yearly + ' yearly') +
      (sh.ended && s.yearly !== null ? ' · weeks that have ended: ' + one(s.endedKm) + ' of ' + one(s.endedEstimate) + ' estimated' : '');
  });
  return planHead(data, sh.plan, today, sh.current) + '\n' + totals.join('\n') + '\n' +
    '> current week · * type set by hand · km: from sessions/estimate · ' + (sh.ended ? 'weeks 1 to ' + sh.ended + ' have ended' : 'no week has ended') + '\n\n' + table(rows, [1, 7]);
}

// what the course would question, for one band of a plan: every week that has something
export function checksReport(data, planId, band, today) {
  const out = [planId + ' · ' + band + ' · what the course would question'];
  for (const c of checksView(data, planId, band, today)) {
    if (!c.count) continue;
    out.push('week ' + c.n);
    for (const t of c.week) out.push('  ' + t);
    for (const key of Object.keys(c.sessions)) for (const t of c.sessions[key]) out.push('  ' + key.split(' ').slice(0, 2).join(' ') + ' · ' + t);
  }
  if (out.length === 1) out.push('nothing');
  return out.join('\n');
}

// the sessions suggested for one slot of one band, the most likely first
export function suggestReport(data, planId, band, date, slot, today, ask) {
  const r = suggestions(data, planId, band, date, slot, today, ask), n = weekOf(data.season, date);
  const type = n ? sheet(data, planId, today).weeks[n - 1].type : null, missing = r.zones.filter(z => z.missing).map(z => z.zone);
  const out = [planId + ' · ' + band + ' · ' + date + ' ' + slot + (n ? ' · week ' + n + (type ? ' (' + type + ')' : '') : '') + (missing.length ? ' · missing ' + missing.join(', ') : '')];
  const rows = r.list.map(x => ['  ' + (x.main || '-'), x.min > 0 ? minutesText(x.min) : '', (x.place !== 'water' ? x.place + ': ' : '') + x.text, [x.used ? 'last ' + x.used : '', x.clash ? 'clashes' : ''].filter(Boolean).join(' · ')]);
  if (rows.length) out.push(table(rows, [1]));
  out.push(r.list.length < r.total ? '  ' + r.list.length + ' of ' + r.total : (r.total ? '' : '  nothing'));
  return out.join('\n').trimEnd();
}

// one day across every plan: what each group does
export function dayReport(data, date, today) {
  const d = dayView(data, date, today), out = [DAYS[d.weekday] + ' ' + date + (d.today ? ' · today' : '') + (d.week ? ' · week ' + d.week : ' · outside the season')];
  const seen = new Set();
  for (const p of d.plans) for (const e of p.events) { if (!seen.has(e.name)) { seen.add(e.name); out.push('  ' + eventText(e)); } }
  for (const p of d.plans) {
    for (const s of p.sessions) {
      out.push(s.slot + ' ' + p.id + ' ' + s.band + (s.place !== 'water' ? ' ' + s.place : '') + (s.notDone ? ' · not done' : '') + ' · ' + (s.main || 'no zone') + ' · ' + (s.text || '(empty)'));
      for (const line of s.notes ? s.notes.split('\n') : []) out.push(('    ' + line).trimEnd());
    }
  }
  if (!d.plans.some(p => p.sessions.length)) out.push('no sessions' + (d.next ? ' · next ' + d.next : ''));
  return out.join('\n');
}

// one week: its sessions with the zone working and km, its totals, and its events
export function weekReport(data, planId, n, today, band) {
  const w = weekView(data, planId, n, today);
  const where = w.mesoInfo ? w.macroInfo.name + ' / ' + w.mesoInfo.name + ' / content ' + w.mesoInfo.label : 'no mesocycle';
  const out = [
    w.plan.id + ' · week ' + n + ' · ' + w.monday + ' to ' + w.sunday + (w.current ? ' · current week' : (w.ended ? ' · ended' : '')),
    where + ' · type ' + (w.type === null ? '-' : w.type + (w.hand ? ' (set by hand, pattern gives ' + (w.pattern || '-') + ')' : '')) + ' · load ' + (w.load === null ? '-' : w.load + '%')
  ];
  for (const b of w.plan.bands) {
    if (band && b !== band) continue;
    const x = kmView(data, planId, b, today).weeks[n - 1];
    const zones = Object.keys(x.zones).map(z => z + ' ' + one(x.zones[z]));
    out.push('km ' + b + ': ' + one(x.km) + (x.estimate === null ? '' : ' of ' + one(x.estimate) + ' estimated' + (x.planned ? ' (load ' + x.load + '% × content ' + x.factor.toFixed(2) + ')' : ' (not planned yet: an average week)')) +
      (zones.length ? ' · ' + zones.join(' · ') : '') + (x.offMin > 0 ? ' · off the water ' + minutesText(x.offMin) : ''));
  }
  for (const b of w.plan.bands) {
    if (band && b !== band) continue;
    for (const t of checksView(data, planId, b, today)[n - 1].week) out.push('check ' + b + ': ' + t);
  }
  out.push('');
  for (const d of w.days) {
    out.push(DAYS[d.weekday] + ' ' + d.date + (d.today ? ' · today' : ''));
    for (const e of d.events) out.push('  ' + eventText(e));
    for (const s of d.sessions) {
      if (band && s.band !== band) continue;
      out.push('  ' + s.slot + ' ' + s.band + (s.place !== 'water' ? ' ' + s.place : '') + ' · ' + s.status + ' · main zone ' + (s.main || 'none') + ' · ' + (s.text || '(empty)'));
      const work = s.parts.slice().reverse().map(p => p.zone + ' ' + minutesText(p.min));
      if (s.unzoned) work.push('no zone ' + amountText(s.unzoned));
      if (s.place === 'water' && s.totalKm > 0) work.push(one(s.totalKm) + ' km');
      if (work.length) out.push('      ' + work.join(' · '));
      if (s.pieces.length) out.push('      ' + s.pieces.map(p => p.text + ' ≈ ' + p.approx).join(' · '));
      for (const t of sessionChecks(s, data.tables)) out.push('      check: ' + t);
      for (const line of s.notes ? s.notes.split('\n') : []) out.push(('      note: ' + line).trimEnd());
    }
  }
  return out.join('\n');
}

const STATE_LETTER = { developing: 'D', maintaining: 'M', 'below maintenance': 'b', trained: '', absent: '' };

// the capacity grid of one band: sessions a week by main zone with their state, and km in the zone
export function gridReport(data, planId, band, today) {
  const sh = sheet(data, planId, today), g = gridView(data, planId, band, today);
  // a zone the course does not suggest for the band's age is in brackets
  const rows = [['', 'wk', 'monday', 'content', ...g.rows.map(r => r.suggested === false ? '(' + r.zone + ')' : r.zone)]];
  for (const w of sh.weeks) {
    rows.push([w.current ? '>' : '', w.n, w.monday, w.meso === null ? '' : sh.mesos[w.meso].label, ...g.rows.map(r => {
      const x = r.weeks[w.n - 1];
      if (!x.sessions && !x.km) return '·';
      return (x.sessions ? x.sessions + STATE_LETTER[x.state] : '-') + (x.km > 0 ? ' ' + kmText(x.km) : '');
    })]);
  }
  rows.push(['', '', 'season', '', ...g.rows.map(r => r.sessions + ' ' + kmText(r.km))]);
  // the course's km a year in each zone for this band, when the zone-km table gives them
  if (g.rows.some(r => r.yearly !== null)) rows.push(['', '', 'a year', '', ...g.rows.map(r => r.yearly === null ? '' : String(r.yearly))]);
  const counted = g.rows.filter(r => r.content).map(r => r.content.key).filter((k, i, a) => a.indexOf(k) === i);
  return planId + ' · ' + band + ' · sessions a week by main zone, then km in the zone\n' +
    'D developing, M maintaining, b below maintenance, by the course\'s sessions a week' + (counted.some(k => k.includes('-')) ? '; ' + counted.filter(k => k.includes('-')).join(' and ') + ' are counted together' : '') + '\n' +
    (g.rows.some(r => r.suggested === false) ? '(zone) not in the course\'s long-term table for this age\n' : '') + '\n' +
    table(rows, [1]);
}

// the card of the week types
export function typesReport(tables) {
  const c = typesCard(tables);
  return [c.name, ...c.rows.map(([label, v]) => label + ': ' + v)].join('\n');
}

// the card of one zone
export function zoneReport(zone, tables) {
  const c = zoneCard(zone, tables);
  if (!c) return null;
  return [c.zone + ' · ' + c.name, c.what, ...c.rows.map(([label, v]) => label + ':' + (Array.isArray(v) ? v.map(x => '\n  - ' + x).join('') : ' ' + v))].join('\n');
}

// the races and events table, for every plan
export function eventsReport(data, today) {
  const rows = [['date', 'until', 'confirmed', 'kind', 'code', 'week', 'name', 'place', 'plans']];
  for (const raw of sortEvents(data.events)) {
    const e = eventView(data, raw, today);
    rows.push([
      e.date, e.until || '', e.confirmed ? 'yes' : 'no', e.kind === 'race' ? e.type + ' ' + e.boats : e.kind, e.code,
      e.weeks.length ? (e.weeks.length > 1 ? e.weeks[0] + '-' + e.weeks[e.weeks.length - 1] : e.weeks[0]) : '-',
      e.name, e.place,
      e.plans === null ? 'all' : Object.keys(e.plans).map(id => e.plans[id] ? id + ' ' + e.plans[id] : id).join(', ')
    ]);
  }
  return 'today ' + today + '\n\n' + table(rows);
}

export function checkReport(data, today) {
  const problems = check(data, today), errors = problems.filter(p => p.level === 'error').length;
  const lines = problems.map(p => p.level + ': ' + p.file + (p.line ? ':' + p.line : '') + ': ' + p.message);
  lines.push(problems.length ? errors + ' errors, ' + (problems.length - errors) + ' warnings' : 'ok');
  return { text: lines.join('\n'), errors };
}
