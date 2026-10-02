// What each zone is and how the course says to train it, for the zone cards of the capacity grid.
// The text is from the Grau II course slides (Planeamento e treino das capacidades físicas na
// canoagem, André Bastos Coelho): slides 135–146 for the zones, 166 for how long a capacity holds,
// 188 for sessions per week and recovery, and the long-term table for the ages.

import { contents } from './grid.js';

export const ZINFO = {
  'R1': {
    name: 'Aerobic, lipid',
    what: 'The lowest speed that still improves aerobic endurance. Builds paddling economy, teaches the body to burn fat and spare glycogen, and speeds up recovery after hard work.',
    intensity: '60–70 strokes/min (kayak) · 65–75% VO2max · 70–80% HRmax',
    how: ["Continuous or split paddling, up to 120'", 'Combined with other zones, it usually goes at the end of the session', 'A good zone for technique work', 'Negligible risk of overtraining'],
    recovery: '24 h',
    build: 'Slowly. Aerobic work needs at least 8 weeks to show an effect.',
    decay: 'Slowly. Aerobic endurance holds for about 30 ± 5 days without training.',
    ages: 'All categories.'
  },
  'R2': {
    name: 'Aerobic–anaerobic transition',
    what: 'The highest steady speed that does not accumulate lactate. The base of aerobic work.',
    intensity: '70–80 strokes/min · 75–85% VO2max · 80–90% HRmax',
    how: ['Continuous and interval methods', "About 60' of work per session (after 45', about 60% of glycogen is used)", 'With anaerobic work in the same session, it usually goes at the end', 'For sprinters: no excessive volume, split work, add high-intensity sets'],
    recovery: '24 h',
    build: 'Slowly. Aerobic work needs at least 8 weeks to show an effect.',
    decay: 'Slowly. About 30 ± 5 days.',
    ages: "From Infantil in the course's long-term table."
  },
  'R3': {
    name: 'Aerobic capacity',
    what: 'A pace close to VO2max. Trains how long VO2max can be held.',
    intensity: '80–90 strokes/min · 90–95% VO2max · 95–98% HRmax',
    how: ["Reps of 2'–6' (around 1500 m for interval work)", "About 30' of work per session", 'Active recovery, work to rest about 1:1', "Warm up well: full VO2max is only available after 30'–50' of activity", 'Develop it fully before starting anaerobic work'],
    recovery: '48–72 h',
    build: 'At least 8 weeks. In well-trained athletes VO2max can improve 10–20% in 2 months.',
    decay: 'Slowly. About 30 ± 5 days (the course gives one figure for all aerobic endurance).',
    ages: "From Infantil in the course's long-term table."
  },
  'R3+': {
    name: 'Aerobic power (VO2max)',
    what: "Work at VO2max. 100% of VO2max can only be held for a few minutes (4'–7').",
    intensity: '90–100 strokes/min · 100% VO2max · 100% HRmax',
    how: ["Reps of 2'–3' (around 800 m)", "About 15' of work per session", 'Active recovery, work to rest 1:1, up to 1:3 for shorter reps', "Intermittent option: 30'' at 95–105% of max aerobic speed, 10''–20'' easy", 'The shorter the rep, the closer it gets to R4'],
    recovery: '48–72 h',
    build: 'At least 8 weeks. In well-trained athletes VO2max can improve 10–20% in 2 months.',
    decay: 'Slowly. About 30 ± 5 days (the course gives one figure for all aerobic endurance).',
    ages: "From Cadete in the course's long-term table."
  },
  'R4': {
    name: 'Lactic capacity (tolerance)',
    what: 'Working with high lactate for as long as possible. Trains tolerance of discomfort and holding technique under fatigue.',
    intensity: '110–120 strokes/min · 105–120% VO2max',
    how: ["Efforts of about 75''–80''", 'Repetitions of 100–400 m, rest 1:3 or more', "Or series of 300–600 m with 10''–30'' rest and 3'–8' between sets", 'Active recovery', 'Watch glycogen stores; these sessions cause a lot of fatigue'],
    recovery: '48–72 h',
    build: 'Fast. 4–6 weeks at 3 sessions a week.',
    decay: 'Faster than aerobic. About 18 ± 4 days.',
    ages: "Seniors only in the course's long-term table."
  },
  'R5': {
    name: 'Lactic power',
    what: 'The highest rate of energy from anaerobic glycolysis. Trains holding technique at very high intensity.',
    intensity: 'Maximal stroke rate · 120–140% VO2max',
    how: ["Efforts of about 45''", 'Repetitions of 100–200 m, or split series of 50–100 m', "3'–6' recovery, active, long enough to restore the fuel", 'About 1000 m of work per session', 'Do it fresh, with minimal fatigue'],
    recovery: '48–72 h',
    build: 'Fast. 4–6 weeks at 3 sessions a week.',
    decay: 'Faster than aerobic. About 18 ± 4 days.',
    ages: "From Junior in the course's long-term table."
  },
  'R6': {
    name: 'Alactic (speed)',
    what: "Maximal speed. R6+ is alactic power: acceleration and top speed, 4''–10''. R6 is alactic capacity: resisting the loss of speed, 10''–20''.",
    intensity: 'Maximal · above 160% VO2max. Below 90% of top speed the stimulus is too weak.',
    how: ["Efforts of 5''–20'' with 3'–4' rest", "1'–3' of total work per session", 'Only when fresh; the number of reps is set by quality', 'Rest must restore full work capacity, but long passive rests cool the muscles', 'Vary the tasks; monotony and too much volume lower the intensity'],
    recovery: '24 h',
    build: 'Keep it in all season; that is how the nervous system learns to coordinate. Too much fatigues the nervous system.',
    decay: 'Fast. Maximal speed holds for only about 5 ± 3 days.',
    ages: 'All categories.'
  },
  'R7': {
    name: 'Competition pace',
    what: 'Racing efficiently: the pace, tactics and conditions of the event.',
    intensity: 'Race speed for the target distance',
    how: ["Split series: the race distance in equal parts, 10''–1' rest", 'Simulation series: the race distance with different splits', "USRPT: 15'' on, 15'' off at race speed; stop when the pace is lost", "2–6 times the race distance in total, more than 8' between pieces", 'Positive split suits athletes with good aerobic capacity; negative split suits those who build lactate fast'],
    perWeek: 'At most 2 sessions per microcycle in preparation, 4 in the competitive period.',
    build: 'Maximum specificity, used as races approach.',
    decay: 'The course gives no figure.',
    ages: "From Infantil in the course's long-term table."
  }
};

const range = r => r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1];

// The card of one zone: { zone, name, what, rows: [[label, text or list]], source }, or null.
// The sessions per week come from the thresholds in tables.txt, so the card follows the table.
// band: the age band the card is shown for, to say when the zone is not suggested at that age.
export function zoneCard(zone, tables, band) {
  const z = ZINFO[zone];
  if (!z) return null;
  const c = contents(tables).find(x => x.zones.includes(zone));
  const perWeek = c
    ? 'Develop: ' + range(c.develop) + ' sessions. Maintain: ' + range(c.maintain) + '.' + (c.zones.length > 1 ? ' Counted together with ' + c.zones.filter(x => x !== zone).join(', ') + '.' : '') + ' Recovery after a session: ' + z.recovery + '.'
    : (z.perWeek || 'No counts given.');
  return {
    zone, name: z.name, what: z.what,
    rows: [['Intensity', z.intensity], ['How to train', z.how], ['Per week', perWeek], ['Builds', z.build], ['Decays', z.decay], ['Ages', z.ages + (tables.zones[band] && !tables.zones[band].includes(zone) ? ' Not suggested for ' + band + '.' : '')]],
    source: 'From the Grau II course slides. The per-week counts assume near-daily training.'
  };
}
