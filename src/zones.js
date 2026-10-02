// What each zone is and how the course says to train it, for the zone cards of the capacity grid.
// The text is from the Grau II course slides (Planeamento e treino das capacidades físicas na
// canoagem, André Bastos Coelho), as gathered by topic in docs/course-reference.md: slides 135–146
// and 32–33 for the zones, 160 for the season, 166 for how long a capacity holds, 188 for sessions
// per week and recovery, 195 for the order in a session, and 172 for the ages and the km a year.
//
// The English text is also the key of its Portuguese in lang.js. "models" are sessions in the
// course's notation, written so that Kayplan reads them; they and "recovery" are not translated.

import { contents } from './grid.js';
import { tr, dec } from './lang.js';

const MIDDLE = 'In the middle of the session, after speed and before R2 and R1. It goes with a main content of R4 or R5.';
const BASIC = 'Basic phase, for every race distance.';

export const ZINFO = {
  'R1': {
    name: 'Aerobic, lipid',
    what: 'The lowest speed that still improves aerobic endurance. Builds paddling economy, teaches the body to burn fat and spare glycogen, and speeds up recovery after hard work.',
    intensity: ['Kayak 60–70 strokes/min, canoe 36–42', '65–75% VO2max · 70–80% HRmax (67–82% on another slide)', 'Lactate 1–2 mmol/L · 90–130 bpm · RPE 10–11'],
    how: ["Continuous or split paddling, up to 120'", 'A good zone for technique work', 'Negligible risk of overtraining', 'For sprinters: moderate distances that keep the technique, with a high-intensity set'],
    models: ['16km R1'],
    session: 'With other contents it usually goes at the end, as regeneration. As the main content it goes with R6, resisted work and hypertrophy strength.',
    season: BASIC,
    recovery: '24 h',
    build: 'Slowly. Aerobic work needs at least 8 weeks to show an effect.',
    decay: 'Slowly. Aerobic endurance holds for about 30 ± 5 days without training.',
    resisted: 'R1F is R1 paddled against a brake. For Cadetes it is a large part of the year: 260–290 km. Aerobic resisted work develops with 3–4 sessions a week and is maintained with 2; recovery 24 h. Kayplan counts R1F as R1.',
    ages: 'All categories.'
  },
  'R2': {
    name: 'Aerobic glycolytic',
    what: 'The aerobic–anaerobic transition zone: the highest steady speed that does not accumulate lactate. The base of aerobic work.',
    intensity: ['Kayak 70–80 strokes/min, canoe 42–48', '75–85% VO2max · 80–90% HRmax (82–87% on another slide)', 'Lactate 2–4 mmol/L · 130–160 bpm · RPE 12–14'],
    how: ['Continuous and interval methods', "About 60' of work per session (after 45', about 60% of glycogen is used)", "In the course's sessions: repetitions of 3'–8', 1' between them, 3' between sets", 'For sprinters: no excessive volume, split work, add high-intensity sets'],
    models: ["R2 3×(4'-6'-6'-4'/1')/3'", "R2 2×(6'-8'-8'-6'/1')/3'", "R2 3×(8'-6'-4'/1')/3'", "R2 2×(4×5'/1')/3'"],
    session: 'Usually at the end of the session, after anaerobic work. As the main content it goes with R6, resisted work and hypertrophy strength.',
    season: BASIC,
    recovery: '24 h',
    build: 'Slowly. Aerobic work needs at least 8 weeks to show an effect.',
    decay: 'Slowly. About 30 ± 5 days.',
    resisted: "R2F is paired with R2 in the same mesocycle, from Junior on, often in the afternoon of the same day. R2+ sits between R2 and R3: the same repetitions as R2 with 30'' of rest in place of 1'; Cadetes and Juniors give it a mesocycle of its own. Kayplan counts both as R2.",
    ages: "From Infantil in the course's long-term table."
  },
  'R3': {
    name: 'Aerobic capacity',
    what: 'A pace close to VO2max. Trains how long VO2max can be held.',
    intensity: ['Kayak 80–90 strokes/min, canoe 48–54', '90–95% VO2max · 95–98% HRmax (87–95% on another slide)', 'Lactate 4–6 mmol/L · 160–180 bpm · RPE 15–16'],
    how: ["Reps of 2'–6' (around 1500 m for interval work)", "About 30' of work per session", 'Active recovery, work to rest about 1:1', "Warm up well: full VO2max is only available after 30'–50' of activity", 'Develop it fully before starting anaerobic work'],
    models: ["R3 4×(3×2'/30'')/6'", "R3 6×(2'-1'30''-1'/30'')/4'30''", "R3 5×(1'-2'-2'-1'/30'')/6'"],
    session: MIDDLE,
    season: 'Specific phase for 500 m and 1000 m; competitive phase for 1000 m.',
    recovery: '48–72 h',
    build: 'At least 8 weeks. In well-trained athletes VO2max can improve 10–20% in 2 months.',
    decay: 'Slowly. About 30 ± 5 days (the course gives one figure for all aerobic endurance).',
    resisted: 'R3F is paired with R3, from Junior on: a short resisted set before the R3 set. Lactic resisted work develops with 2–4 sessions a week and is maintained with 1; recovery 48–72 h. Kayplan counts R3F as R3.',
    ages: "From Infantil in the course's long-term table."
  },
  'R3+': {
    name: 'Aerobic power (VO2max)',
    what: "Work at VO2max. 100% of VO2max can only be held for a few minutes (4'–7').",
    intensity: ['Kayak 90–100 strokes/min, canoe 54–60', '100% VO2max · 100% HRmax', 'Lactate 6–8 mmol/L · 160–180 bpm · RPE 17–19'],
    how: ["Reps of 2'–3' (around 800 m)", "About 15' of work per session", 'Active recovery, work to rest 1:1, up to 1:3 for shorter reps', "Intermittent option: 30'' at 95–105% of max aerobic speed, 10''–20'' easy", 'The shorter the rep, the closer it gets to R4'],
    models: ["R3+ 4×(6×30''/30'')/8'", "R3+ 5×(4×45''/45'')/8'", "R3+ 4×(500-300/200)/12'"],
    session: MIDDLE,
    season: 'Basic phase for 200 m. Specific phase for 500 m and 1000 m, where it is the key content. Competitive phase for 500 m and 1000 m.',
    recovery: '48–72 h',
    build: 'At least 8 weeks. In well-trained athletes VO2max can improve 10–20% in 2 months.',
    decay: 'Slowly. About 30 ± 5 days (the course gives one figure for all aerobic endurance).',
    resisted: 'Its resisted partners are R3+F and R4F. Kayplan counts R3+F as R3+.',
    ages: "From Cadete in the course's long-term table."
  },
  'R4': {
    name: 'Lactic capacity (tolerance)',
    what: 'Working with high lactate for as long as possible. Trains tolerance of discomfort and holding technique under fatigue.',
    intensity: ['Kayak 110–120 strokes/min, canoe 66–72', '105–120% of the speed at VO2max', 'Lactate 8–14 mmol/L · 180 bpm to maximal'],
    how: ["Efforts of about 75''–80''", 'Repetitions of 100–400 m, rest 1:3 or more', "Or series of 300–600 m with 10''–30'' rest and 3'–8' between sets", 'Active recovery', 'Watch glycogen stores; these sessions cause a lot of fatigue'],
    models: ["R4 5×(3×150/100)/6'", "R4 5×(250-200/100)/8'", "R4 3×(3×200/100)/10' + R4 3×(3×150/100)/10'"],
    session: 'In the middle of the session. As the main content, with R5, it goes with resisted work, R3 and R3+. A heavy lactic load before aerobic or speed work works against them.',
    season: 'Specific and competitive phases for every distance; a key content of the specific phase for 500 m. It comes after R3+ and before speed.',
    recovery: '48–72 h',
    build: 'Fast. 4–6 weeks at 3 sessions a week.',
    decay: 'Faster than aerobic. About 18 ± 4 days.',
    resisted: 'R4F is its resisted partner, together with R5F. Kayplan counts R4F as R4.',
    ages: "Seniors only in the course's long-term table."
  },
  'R5': {
    name: 'Lactic power',
    what: 'The highest rate of energy from anaerobic glycolysis. Trains holding technique at very high intensity.',
    intensity: ['Maximal stroke rate', '120–140% of the speed at VO2max', 'Maximal lactate'],
    how: ["Efforts of about 45''", 'Repetitions of 100–200 m, or split series of 50–100 m', "3'–6' recovery, active, long enough to restore the fuel", 'About 1000 m of work per session', 'Do it fresh, with minimal fatigue'],
    models: ["R5 4×(3×10''/30'')/4'", "4×50m R5/4' + 4×100m R5/5'"],
    session: 'First in the session, done fresh, with R6. As the main content, with R4, it goes with resisted work, R3 and R3+.',
    season: '200 m: specific phase, where it is the key content, and competitive phase. 500 m: specific and competitive phases. 1000 m: specific phase only.',
    recovery: '48–72 h',
    build: 'Fast. 4–6 weeks at 3 sessions a week.',
    decay: 'Faster than aerobic. About 18 ± 4 days.',
    resisted: 'R5F is its resisted partner. Kayplan counts R5F as R5.',
    ages: "From Junior in the course's long-term table."
  },
  'R6': {
    name: 'Alactic (speed)',
    what: "Maximal speed. R6+ is alactic power: acceleration and top speed, 4''–10''. R6 is alactic capacity: resisting the loss of speed, 10''–20''.",
    intensity: ['Maximal', 'Above 160% of the speed at VO2max', 'Below 90% of top speed the stimulus is too weak'],
    how: ['Only when fresh; the number of reps is set by quality', 'Rest must restore full work capacity, but long passive rests cool the muscles', 'Vary the tasks; monotony and too much volume lower the intensity'],
    kinds: ["Acceleration: 5''–10'' of work", "Top speed: about 10''", "Speed endurance: 10''–20''", "Each with 3'–4' of recovery, and 1'–3' of work in the session"],
    models: ["R6 3×(3×50/3')/6'"],
    session: 'First in the session, done fresh. As the main content it goes with R1, R2, explosive strength and hypertrophy strength. Speed before aerobic or lactic work helps them.',
    season: '200 m: R6+ in the basic phase, R6 in the specific and competitive phases. 500 m: R6+ in the basic phase, R6 in the specific phase. 1000 m: R6 in the specific phase.',
    recovery: '24 h',
    build: 'Keep it in all season; that is how the nervous system learns to coordinate. Too much fatigues the nervous system.',
    decay: 'Fast. Maximal speed holds for only about 5 ± 3 days.',
    resisted: 'R6 is paired with R6F, and R6+ with explosive strength. Alactic resisted work develops with 2–4 sessions a week and is maintained with 1–2; recovery 24 h. Kayplan counts R6F and R6+ as R6.',
    ages: 'All categories.'
  },
  'R7': {
    name: 'Competition pace',
    what: 'Racing efficiently: the pace, tactics and conditions of the event.',
    intensity: ['Race speed for the target distance', 'A faster first part suits athletes with good aerobic capacity who do not build lactate fast', 'A faster second part suits athletes of low aerobic capacity who build lactate fast'],
    how: ["USRPT: 15'' on, 15'' off at race speed; stop when the pace is lost", 'Fewer of the hardest simulation sets, more of the easier ones'],
    kinds: ["Endurance pace: pieces of 20% of the race distance, 15''–1' between parts, more than 8'–10' between pieces", "Broken series: the race distance in equal parts, 10''–1' between parts, more than 10'–15' between pieces", "Simulation series: the race distance in unequal parts, 10''–90'' between parts, more than 10' between pieces", "Speed pace: pieces of 2/3 of the race distance, more than 8'–15' between pieces", '2–6 race distances in the session (2–4 for speed pace)'],
    session: 'Warm up to race readiness before any race-pace session.',
    season: 'The third and last part of a preparation: simulating the competition. In the taper, work at race speed with full recovery.',
    perWeek: 'At most 2 sessions per microcycle in preparation, 4 in the competitive period.',
    build: 'Maximum specificity, used as races approach.',
    decay: 'The course gives no figure.',
    ages: "From Infantil in the course's long-term table."
  }
};

// Paddling km a year per zone and category, from the first to the second year in the category
// (the three under-23 years for Senior): the course's long-term table, slide 172.
export const COURSE_KM = {
  'R1': [['Iniciado', 267, 308], ['Infantil', 445, 578], ['Cadete', 580, 710], ['Junior', 782, 840], ['Senior', 993, 1316]],
  'R2': [['Infantil', 267, 267], ['Cadete', 415, 455], ['Junior', 741, 794], ['Senior', 994, 1235]],
  'R3': [['Infantil', 76, 76], ['Cadete', 151, 165], ['Junior', 217, 229.5], ['Senior', 314, 371.3]],
  'R3+': [['Cadete', 50, 51], ['Junior', 70, 75.4], ['Senior', 98.6, 128.7]],
  'R4': [['Senior', 8, 35.2]],
  'R5': [['Junior', 8.6, 8.6], ['Senior', 12.7, 14.5]],
  'R6': [['Iniciado', 7.2, 7.2], ['Infantil', 11.5, 11.5], ['Cadete', 21, 21], ['Junior', 9.6, 9.6], ['Senior', 9, 10.2]],
  'R7': [['Infantil', 22, 22], ['Cadete', 28, 28], ['Junior', 28, 28], ['Senior', 60, 72]]
};

const range = r => r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1];

// The card of one zone: { zone, name, what, rows: [[label, text or list, 'notation' for session text]], source }, or null.
// The sessions per week come from the thresholds in tables.txt, so the card follows the table.
// band: the age band the card is shown for, to say when the zone is not suggested at that age.
// The text is looked up in the language in use.
export function zoneCard(zone, tables, band) {
  const z = ZINFO[zone];
  if (!z) return null;
  const c = contents(tables).find(x => x.zones.includes(zone));
  const perWeek = c
    ? tr('Develop: {0} sessions. Maintain: {1}.', range(c.develop), range(c.maintain)) + (c.zones.length > 1 ? ' ' + tr('Counted together with {0}.', c.zones.filter(x => x !== zone).join(', ')) : '') + ' ' + tr('Recovery after a session: {0}.', z.recovery)
    : (z.perWeek ? tr(z.perWeek) : tr('No counts given.'));
  const km = COURSE_KM[zone].map(([who, lo, hi]) => who + ' ' + (lo === hi ? dec(lo) : dec(lo) + '–' + dec(hi))).join(', ');
  const rows = [
    [tr('Intensity'), z.intensity.map(x => tr(x))],
    [tr('How to train'), z.how.map(x => tr(x))],
    z.kinds && [tr('Kinds of work'), z.kinds.map(x => tr(x))],
    z.models && [tr('Model sessions'), z.models, 'notation'],
    [tr('Per week'), perWeek],
    [tr('In a session'), tr(z.session)],
    [tr('In the season'), tr(z.season)],
    [tr('Builds'), tr(z.build)],
    [tr('Decays'), tr(z.decay)],
    z.resisted && [tr('Resisted'), tr(z.resisted)],
    [tr('Ages'), tr(z.ages) + (tables.zones[band] && !tables.zones[band].includes(zone) ? ' ' + tr('Not suggested for {0}.', band) : '')],
    [tr('Km a year'), km]
  ];
  return {
    zone, name: tr(z.name), what: tr(z.what), rows: rows.filter(Boolean),
    source: tr('From the Grau II course slides. The per-week counts assume near-daily training.')
  };
}
