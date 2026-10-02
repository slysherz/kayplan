// The capacity grid (DESIGN.md 7.1): week by week, how much each zone is trained, against the
// course's sessions per week to develop and to maintain each content (Grau II slides, "Nº Sessões/CT").

import { sheet, sessionView, weekOf } from './engine.js';
import { kmView } from './km.js';
import { CONTENT_ZONES } from './cycles.js';

// The contents of the thresholds table: [{ key, zones, develop: [from, to], maintain: [from, to] }].
// Zones joined in one content (R3-R3+, R4-R5) are counted together, as the course counts them.
export function contents(tables) {
  return Object.keys(tables.develop).filter(k => tables.maintain[k]).map(key => ({ key, zones: key.split('-'), develop: tables.develop[key], maintain: tables.maintain[key] }));
}

// What a number of sessions in one week means for a content. The lower end of each range decides.
export function stateOf(sessions, content) {
  if (!sessions) return 'absent';
  if (!content) return 'trained';   // no counts given for this zone (R7)
  return sessions >= content.develop[0] ? 'developing' : sessions >= content.maintain[0] ? 'maintaining' : 'below maintenance';
}

// One row per zone, R1 to R7, for one age band of a plan. The rows are always the same, so the grid
// is there before anything is planned and nothing moves when a session is typed.
//
// rows: [{ zone, content, suggested, weeks: [{ n, sessions, together, state, km }], sessions, km, yearly }]
//   yearly    the course's km a year in the zone for the band (the zone-km table), or null
//   suggested whether the zone is one the course's long-term table gives the band's age (the zones
//             table); null when the band has no line there
//   sessions  the week's sessions whose main zone is this zone, on or off the water, not marked "not done"
//   together  the same count over every zone of the row's content: this is what the state is judged on
//   km        the week's km in the zone (water only)
export function gridView(data, planId, band, today) {
  const sh = sheet(data, planId, today), km = kmView(data, planId, band, today), list = contents(data.tables);
  const counts = {};
  for (const s of sh.plan.sessions) {
    const n = weekOf(data.season, s.date);
    if (s.band !== band || s.notDone || !n) continue;
    const main = sessionView(data, s, today).main;
    if (!main) continue;
    counts[main] = counts[main] || {};
    counts[main][n] = (counts[main][n] || 0) + 1;
  }
  const yearly = data.tables.zoneKm[band] || {};
  const rows = CONTENT_ZONES.map(zone => {
    const content = list.find(c => c.zones.includes(zone)) || null, group = content ? content.zones : [zone];
    const weeks = sh.weeks.map(w => {
      const sessions = (counts[zone] || {})[w.n] || 0;
      const together = group.reduce((a, z) => a + ((counts[z] || {})[w.n] || 0), 0);
      return { n: w.n, sessions, together, state: sessions ? stateOf(together, content) : 'absent', km: km.weeks[w.n - 1].zones[zone] || 0 };
    });
    return { zone, content, suggested: data.tables.zones[band] ? data.tables.zones[band].includes(zone) : null, weeks, sessions: weeks.reduce((a, w) => a + w.sessions, 0), km: weeks.reduce((a, w) => a + w.km, 0), yearly: yearly[zone] === undefined ? null : yearly[zone] };
  });
  return { band, rows };
}
