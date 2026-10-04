// What each zone is and how the course says to train it, for the zone cards of the capacity grid.
// The text is from the Grau II course slides (Planeamento e treino das capacidades físicas na
// canoagem, André Bastos Coelho), as gathered by topic in docs/course-reference.md: slides 135–146
// and 32–33 for the zones, 160 for the season, 166 for how long a capacity holds, 188 for sessions
// per week and recovery, 195 for the order in a session, and 172 for the ages. Where slides disagree,
// the card takes the zone summary of slide 145.
//
// The English text is also the key of its Portuguese in lang.js; "recovery" is not translated.
// The course's model sessions are not in the cards: they belong with the training suggestions (DESIGN.md 8.4).

import { contents } from './grid.js';
import { tr, dec } from './lang.js';

const MIDDLE = 'In the middle of the session, after speed and before R2 and R1. It goes with a main content of R4 or R5.';
const BASIC = 'Basic phase, for every race distance.';

export const ZINFO = {
  'R1': {
    name: 'Aerobic, lipid',
    what: 'The lowest speed that still improves aerobic endurance. Builds paddling economy, teaches the body to burn fat and spare glycogen, and speeds up recovery after hard work.',
    intensity: ['Kayak 60–70 strokes/min, canoe 36–42', '65–75% VO2max · 70–80% HRmax', 'Lactate 1–2 mmol/L · RPE 10–11'],
    how: ["Continuous or split paddling, up to 120'", 'A good zone for technique work', 'Negligible risk of overtraining', 'For sprinters: moderate distances that keep the technique, with a high-intensity set'],
    session: 'With other contents it usually goes at the end, as regeneration. As the main content it goes with R6, resisted work and hypertrophy strength.',
    season: BASIC,
    recovery: '24 h',
    build: 'At least 8 weeks.',
    decay: 'About 30 ± 5 days without training.',
    resisted: 'R1F: R1 against a brake. Develops with 3–4 sessions a week, maintained with 2. Counted here as R1.',
    ages: 'From Iniciado.'
  },
  'R2': {
    name: 'Aerobic glycolytic',
    what: 'The aerobic–anaerobic transition zone: the highest steady speed that does not accumulate lactate. The base of aerobic work.',
    intensity: ['Kayak 70–80 strokes/min, canoe 42–48', '75–85% VO2max · 80–90% HRmax', 'Lactate 2–4 mmol/L · RPE 12–14'],
    how: ['Continuous and interval methods', "About 60' of work per session (after 45', about 60% of glycogen is used)", "Repetitions of 3'–8', 1' between them, 3' between sets", 'For sprinters: no excessive volume, split work, add high-intensity sets'],
    session: 'Usually at the end of the session, after anaerobic work. As the main content it goes with R6, resisted work and hypertrophy strength.',
    season: BASIC,
    recovery: '24 h',
    build: 'At least 8 weeks.',
    decay: 'About 30 ± 5 days without training.',
    resisted: "R2F: R2 against a brake. R2+: between R2 and R3, the repetitions of R2 with 30'' of rest. Both are counted here as R2.",
    ages: 'From Infantil.'
  },
  'R3': {
    name: 'Aerobic capacity',
    what: 'A pace close to VO2max. Trains how long VO2max can be held.',
    intensity: ['Kayak 80–90 strokes/min, canoe 48–54', '90–95% VO2max · 95–98% HRmax', 'Lactate 4–6 mmol/L · RPE 15–16'],
    how: ["Reps of 2'–6' (around 1500 m for interval work)", "About 30' of work per session", 'Active recovery, work to rest about 1:1', "Warm up well: full VO2max is only available after 30'–50' of activity", 'Develop it fully before starting anaerobic work'],
    session: MIDDLE,
    season: 'Specific phase for 500 m and 1000 m; competitive phase for 1000 m.',
    recovery: '48–72 h',
    build: 'At least 8 weeks.',
    decay: 'About 30 ± 5 days without training.',
    resisted: 'R3F: R3 against a brake. Develops with 2–4 sessions a week, maintained with 1. Counted here as R3.',
    ages: 'From Infantil.'
  },
  'R3+': {
    name: 'Aerobic power (VO2max)',
    what: "Work at VO2max. 100% of VO2max can only be held for a few minutes (4'–7').",
    intensity: ['Kayak 90–100 strokes/min, canoe 54–60', '100% VO2max · 100% HRmax', 'Lactate 6–8 mmol/L · RPE 17–19'],
    how: ["Reps of 2'–3' (around 800 m)", "About 15' of work per session", 'Active recovery, work to rest 1:1, up to 1:3 for shorter reps', "Intermittent option: 30'' at 95–105% of max aerobic speed, 10''–20'' easy", 'The shorter the rep, the closer it gets to R4'],
    session: MIDDLE,
    season: 'Basic phase for 200 m. Specific phase for 500 m and 1000 m, where it is the key content. Competitive phase for 500 m and 1000 m.',
    recovery: '48–72 h',
    build: 'At least 8 weeks.',
    decay: 'About 30 ± 5 days without training.',
    resisted: 'R3+F: R3+ against a brake. Counted here as R3+.',
    ages: 'From Cadete.'
  },
  'R4': {
    name: 'Lactic capacity (tolerance)',
    what: 'Working with high lactate for as long as possible. Trains tolerance of discomfort and holding technique under fatigue.',
    intensity: ['Kayak 110–120 strokes/min, canoe 66–72', '105–120% VO2max', 'Lactate 8–14 mmol/L'],
    how: ["Efforts of about 75''–80''", 'Repetitions of 100–400 m, rest 1:3 or more', "Or series of 300–600 m with 10''–30'' rest and 3'–8' between sets", 'Active recovery', 'Watch glycogen stores; these sessions cause a lot of fatigue'],
    session: 'In the middle of the session. As the main content, with R5, it goes with resisted work, R3 and R3+. A heavy lactic load before aerobic or speed work works against them.',
    season: 'Specific and competitive phases for every distance; a key content of the specific phase for 500 m. It comes after R3+ and before speed.',
    recovery: '48–72 h',
    build: '4–6 weeks, at 3 sessions a week.',
    decay: 'About 18 ± 4 days without training.',
    resisted: 'R4F: R4 against a brake. Counted here as R4.',
    ages: 'Seniors only.'
  },
  'R5': {
    name: 'Lactic power',
    what: 'The highest rate of energy from anaerobic glycolysis. Trains holding technique at very high intensity.',
    intensity: ['Maximal stroke rate', '120–140% VO2max', 'Maximal lactate'],
    how: ["Efforts of about 45''", 'Repetitions of 100–200 m, or split series of 50–100 m', "3'–6' recovery, active, long enough to restore the fuel", 'About 1000 m of work per session', 'Do it fresh, with minimal fatigue'],
    session: 'First in the session, done fresh, with R6. As the main content, with R4, it goes with resisted work, R3 and R3+.',
    season: '200 m: specific phase, where it is the key content, and competitive phase. 500 m: specific and competitive phases. 1000 m: specific phase only.',
    recovery: '48–72 h',
    build: '4–6 weeks, at 3 sessions a week.',
    decay: 'About 18 ± 4 days without training.',
    resisted: 'R5F: R5 against a brake. Counted here as R5.',
    ages: 'From Junior.'
  },
  'R6': {
    name: 'Alactic (speed)',
    what: "Maximal speed. R6+ is alactic power: acceleration and top speed, 4''–10''. R6 is alactic capacity: resisting the loss of speed, 10''–20''.",
    intensity: ['Maximal stroke rate', 'Above 160% VO2max'],
    how: ['Below 90% of top speed the stimulus is too weak', 'Only when fresh; the number of reps is set by quality', 'Rest must restore full work capacity, but long passive rests cool the muscles', 'Vary the tasks; monotony and too much volume lower the intensity'],
    kinds: ["Acceleration: 5''–10'' of work", "Top speed: about 10''", "Speed endurance: 10''–20''", "Each with 3'–4' of recovery, and 1'–3' of work in the session"],
    session: 'First in the session, done fresh. As the main content it goes with R1, R2, explosive strength and hypertrophy strength. Speed before aerobic or lactic work helps them.',
    season: '200 m: R6+ in the basic phase, R6 in the specific and competitive phases. 500 m: R6+ in the basic phase, R6 in the specific phase. 1000 m: R6 in the specific phase.',
    recovery: '24 h',
    build: 'Trained all season.',
    decay: 'About 5 ± 3 days without training.',
    resisted: 'R6F: R6 against a brake. Develops with 2–4 sessions a week, maintained with 1–2. R6F and R6+ are counted here as R6.',
    ages: 'From Iniciado.'
  },
  'R7': {
    name: 'Competition pace',
    what: 'Racing efficiently: the pace, tactics and conditions of the event.',
    intensity: ['Race speed for the target distance'],
    how: ['A faster first part suits athletes with good aerobic capacity who do not build lactate fast', 'A faster second part suits athletes of low aerobic capacity who build lactate fast', "USRPT: 15'' on, 15'' off at race speed; stop when the pace is lost", 'Fewer of the hardest simulation sets, more of the easier ones'],
    kinds: ["Endurance pace: pieces of 20% of the race distance, 15''–1' between parts, more than 8'–10' between pieces", "Broken series: the race distance in equal parts, 10''–1' between parts, more than 10'–15' between pieces", "Simulation series: the race distance in unequal parts, 10''–90'' between parts, more than 10' between pieces", "Speed pace: pieces of 2/3 of the race distance, more than 8'–15' between pieces", '2–6 race distances in the session (2–4 for speed pace)'],
    session: 'Warm up to race readiness before any race-pace session.',
    season: 'The third and last part of a preparation: simulating the competition. In the taper, work at race speed with full recovery.',
    perWeek: 'At most 2 sessions per microcycle in preparation, 4 in the competitive period.',
    build: 'Used as races approach.',
    ages: 'From Infantil.'
  }
};

// What each week type is for (slide 186), for the card of the Type row.
export const TYPEINFO = {
  I: { name: 'Introductory', what: 'Prepares for the next level of load or the next mesocycle, with reduced load.' },
  C: { name: 'Load', what: 'Enough volume to improve, without exhausting the athlete.' },
  CH: { name: 'Shock', what: 'The highest stimulus: development sessions without full recovery between them.' },
  R: { name: 'Recovery', what: 'Regeneration: low volume and intensity.' },
  AT: { name: 'Activation', what: 'Before an important race: full recovery, low volume, high intensity, modelling the race.' },
  CT: { name: 'Competition', what: 'The race week: the race, supplementary sessions and recovery.' }
};

// The card of the week types: { name, rows: [[type and load, what it is for]] }, one row for each type
// of the load table, in its order, with its load.
export function typesCard(tables) {
  const rows = Object.keys(tables.load).map(t => [t + ' · ' + tables.load[t] + '%', TYPEINFO[t] ? tr(TYPEINFO[t].name) + '. ' + tr(TYPEINFO[t].what) : '']);
  return { name: tr('Microcycle types'), rows };
}

const range = r => r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1];

// The card of one zone: { zone, name, what, rows: [[label, text or list]] }, or null.
// The sessions per week and the km a year come from tables.txt, so the card shows the same figures as the grid.
// A card states one value for each thing and does not say where it comes from: that is in this file's head.
// The text is looked up in the language in use.
export function zoneCard(zone, tables) {
  const z = ZINFO[zone];
  if (!z) return null;
  const c = contents(tables).find(x => x.zones.includes(zone));
  const perWeek = c
    ? tr('Develop: {0} sessions. Maintain: {1}.', range(c.develop), range(c.maintain)) + (c.zones.length > 1 ? ' ' + tr('Counted together with {0}.', c.zones.filter(x => x !== zone).join(', ')) : '') + ' ' + tr('Recovery after a session: {0}.', z.recovery)
    : (z.perWeek ? tr(z.perWeek) : tr('No counts given.'));
  const km = Object.keys(tables.zoneKm).filter(b => tables.zoneKm[b][zone] !== undefined).map(b => b + ' ' + dec(tables.zoneKm[b][zone])).join(', ');
  const rows = [
    [tr('Intensity'), z.intensity.map(x => tr(x))],
    [tr('How to train'), z.how.map(x => tr(x))],
    z.kinds && [tr('Kinds of work'), z.kinds.map(x => tr(x))],
    [tr('Per week'), perWeek],
    [tr('In a session'), tr(z.session)],
    [tr('In the season'), tr(z.season)],
    [tr('Builds'), tr(z.build)],
    z.decay && [tr('Decays'), tr(z.decay)],
    z.resisted && [tr('Resisted'), tr(z.resisted)],
    [tr('Ages'), tr(z.ages)],
    km && [tr('Km a year'), km]
  ];
  return { zone, name: tr(z.name), what: tr(z.what), rows: rows.filter(Boolean) };
}
