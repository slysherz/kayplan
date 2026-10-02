// The command line's text output. Everything printed here comes from the engine.

import { DAYS, addDays, weekday } from './dates.js';
import { minutesText, amountText } from './notation.js';
import { sheet, weekView, eventView, check } from './engine.js';
import { sortEvents } from './format.js';

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

// the annual sheet as a table, one row per week
export function seasonReport(data, planId, today) {
  const sh = sheet(data, planId, today);
  const rows = [['', 'wk', 'monday', 'macrocycle', 'mesocycle', 'content', 'type', 'load', 'sessions', 'events']];
  for (const w of sh.weeks) {
    const meso = w.meso === null ? null : sh.mesos[w.meso];
    rows.push([
      w.current ? '>' : '', w.n, w.monday,
      w.macro === null ? '' : sh.macros[w.macro].name, meso ? meso.name : '', meso ? meso.label : '',
      w.type === null ? '-' : w.type + (w.hand ? '*' : ''), w.load === null ? '-' : w.load,
      sh.plan.bands.filter(b => w.sessions[b]).map(b => b + ' ' + w.sessions[b]).join(', '),
      w.events.map(eventText).join('; ')
    ]);
  }
  return planHead(data, sh.plan, today, sh.current) + '\n' +
    '> current week · * type set by hand · ' + (sh.ended ? 'weeks 1 to ' + sh.ended + ' have ended' : 'no week has ended') + '\n\n' + table(rows, [1, 7]);
}

// one week: its sessions with the zone working, and its events
export function weekReport(data, planId, n, today, band) {
  const w = weekView(data, planId, n, today);
  const where = w.mesoInfo ? w.macroInfo.name + ' / ' + w.mesoInfo.name + ' / content ' + w.mesoInfo.label : 'no mesocycle';
  const out = [
    w.plan.id + ' · week ' + n + ' · ' + w.monday + ' to ' + w.sunday + (w.current ? ' · current week' : (w.ended ? ' · ended' : '')),
    where + ' · type ' + (w.type === null ? '-' : w.type + (w.hand ? ' (set by hand, pattern gives ' + (w.pattern || '-') + ')' : '')) + ' · load ' + (w.load === null ? '-' : w.load + '%'),
    ''
  ];
  for (const d of w.days) {
    out.push(DAYS[d.weekday] + ' ' + d.date + (d.today ? ' · today' : ''));
    for (const e of d.events) out.push('  ' + eventText(e));
    for (const s of d.sessions) {
      if (band && s.band !== band) continue;
      out.push('  ' + s.slot + ' ' + s.band + ' · ' + s.status + ' · main zone ' + (s.main || 'none') + ' · ' + (s.text || '(empty)'));
      const work = s.parts.slice().reverse().map(p => p.zone + ' ' + minutesText(p.min));
      if (s.unzoned) work.push('no zone ' + amountText(s.unzoned));
      if (work.length) out.push('      ' + work.join(' · '));
      for (const line of s.notes ? s.notes.split('\n') : []) out.push(('      note: ' + line).trimEnd());
    }
  }
  return out.join('\n');
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
