// Season km (DESIGN.md 7.0): the km counted from the sessions, and one km estimate per microcycle.
// Nothing here is typed by the coach except the tables: yearly km per band, and the km of a hard
// session per content.

import { sheet, sessionView, weekOf } from './engine.js';

// The race a block is aimed at: the most important race inside it, or else the next one after it,
// or else the last race of the season. races are the plan's races in date order, each with its
// weeks and importance.
export function raceFor(meso, races) {
  const inside = races.filter(r => r.weeks[0] >= meso.from && r.weeks[0] <= meso.to).sort((a, b) => a.importance - b.importance);
  return inside[0] || races.find(r => r.weeks[0] > meso.to) || races[races.length - 1] || null;
}

// The km of a typical hard session with the block's contents, compared with a hard R2 session.
// Every session also gets the warm-up allowance. Several contents: the plain average. None: 1.
// R7 is race pace, so its km depend on the race the block is aimed at; in a plan with no races it
// counts like R2.
export function contentFactor(meso, races, tables) {
  if (!meso.zones.length) return 1;
  const base = tables.hard.R2 + tables.warmup;
  let sum = 0;
  for (const z of meso.zones) {
    let km = tables.hard[z];
    if (z === 'R7') { const race = raceFor(meso, races); km = race ? tables.race[race.type] : tables.hard.R2; }
    sum += (km + tables.warmup) / base;
  }
  return sum / meso.zones.length;
}

// Km for one age band of a plan.
//
// weeks[n-1]: { n, load, factor, coef, planned, estimate, km, zones: { zone: km }, offMin }
//   coef      load % × content factor. A week that is not planned yet (no load) counts as an
//             average planned week, so a rough plan still gives sensible estimates for its planned part.
//   estimate  yearly km × coef ÷ sum of all coefs; null when the band has no yearly km or nothing is planned
//   km        from the week's sessions on the water that are not marked "not done"
//   offMin    minutes of work off the water
// season: { yearly, done, planned, endedKm, endedEstimate }
//   done      km of sessions before today; planned: km of sessions from today on
//   ended…    km and estimate summed over the weeks that have ended, to show a shortfall
export function kmView(data, planId, band, today) {
  const sh = sheet(data, planId, today), t = data.tables;
  const races = sh.events.filter(e => e.kind === 'race' && e.weeks.length);
  const complete = t.warmup !== null && ['R1', 'R2', 'R3', 'R3+', 'R4', 'R5', 'R6'].every(z => t.hard[z] !== undefined) && Object.keys(t.race).length === 3;
  const factors = sh.mesos.map(m => complete ? contentFactor(m, races, t) : null);
  const weeks = sh.weeks.map(w => {
    const factor = w.meso === null ? null : factors[w.meso];
    const planned = w.load !== null && factor !== null;
    return { n: w.n, load: w.load, factor, planned, coef: planned ? w.load / 100 * factor : null, estimate: null, km: 0, zones: {}, offMin: 0 };
  });
  const known = weeks.filter(w => w.planned), mean = known.length ? known.reduce((a, w) => a + w.coef, 0) / known.length : null;
  const yearly = t.yearly[band] === undefined ? null : t.yearly[band];
  if (mean !== null) {
    for (const w of weeks) { if (!w.planned) w.coef = mean; }
    const total = weeks.reduce((a, w) => a + w.coef, 0);
    if (yearly !== null && total > 0) { for (const w of weeks) w.estimate = yearly * w.coef / total; }
  }

  const season = { yearly, done: 0, planned: 0, endedKm: 0, endedEstimate: 0 };
  for (const s of sh.plan.sessions) {
    const n = weekOf(data.season, s.date);
    if (s.band !== band || s.notDone || !n) continue;
    const v = sessionView(data, s, today), w = weeks[n - 1];
    w.km += v.totalKm;
    w.offMin += v.offMin;
    for (const z of Object.keys(v.km)) w.zones[z] = (w.zones[z] || 0) + v.km[z];
    if (s.date < today) season.done += v.totalKm; else season.planned += v.totalKm;
  }
  for (const w of weeks.slice(0, sh.ended)) { season.endedKm += w.km; season.endedEstimate += w.estimate || 0; }
  return { band, weeks, season };
}
