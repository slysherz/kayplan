// The plan's text files <-> data. The files hold only what was typed (DESIGN.md 4.2).
//
// One shape throughout: a head line, then indented lines that belong to it.
// Every parse function returns { value, errors: [{ line, message }] } and never throws.
// Every serialize function writes the one canonical form, so reading a canonical file and writing it
// back gives the same text. There are no comments in the files.

import { isDate, weekday } from './dates.js';
import { ZONES } from './notation.js';
import { PATTERNS, CONTENT_ZONES } from './cycles.js';

export const KINDS = ['race', 'test', 'camp', 'holiday', 'no-water'];
export const RACE_TYPES = ['sprint', 'fundo', 'maratona'];
export const BOATS = ['solo', 'crew', 'mixed'];
export const SLOTS = ['am', 'pm'];
// where a session happens; km are only counted on the water
export const PLACES = ['water', 'pool', 'gym', 'land'];

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function readBlocks(text) {
  const blocks = [], errors = [];
  let cur = null, blanks = 0;
  String(text || '').replace(/^﻿/, '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    if (line === '') { blanks++; return; }
    if (/^\s/.test(line)) {
      if (!cur) errors.push({ line: i + 1, message: 'indented line with nothing above it' });
      else {
        // blank lines between indented lines are kept (they matter in notes)
        for (; blanks > 0; blanks--) cur.sub.push({ text: '', line: i + 1 - blanks });
        cur.sub.push({ text: line.trim(), line: i + 1 });
      }
    } else {
      cur = { head: line, line: i + 1, sub: [] };
      blocks.push(cur);
    }
    blanks = 0;
  });
  return { blocks, errors };
}

// indented "key: value" lines of a block
function fields(block, keys, errors) {
  const out = {};
  for (const s of block.sub) {
    if (s.text === '') continue;
    const m = /^([a-z-]+):\s*(.*)$/.exec(s.text);
    if (!m || !keys.includes(m[1])) errors.push({ line: s.line, message: 'cannot read "' + s.text + '"' });
    else if (m[1] in out) errors.push({ line: s.line, message: '"' + m[1] + '" is given twice' });
    else out[m[1]] = m[2];
  }
  return out;
}

function noSub(block, errors) {
  if (block.sub.length) errors.push({ line: block.sub[0].line, message: 'unexpected indented line' });
}

function text(lines) {
  return lines.length ? lines.join('\n') + '\n' : '';
}

// ---- season.txt -------------------------------------------------------------
// start: 2026-09-28
// weeks: 45

export function parseSeason(source) {
  const { blocks, errors } = readBlocks(source);
  const value = { start: null, weeks: null, plans: [] };
  for (const b of blocks) {
    noSub(b, errors);
    const m = /^(start|weeks|plans):\s*(.*)$/.exec(b.head);
    if (!m) { errors.push({ line: b.line, message: 'cannot read "' + b.head + '"' }); continue; }
    if (m[1] === 'plans') {
      // the order the plans are shown in
      const ids = m[2].split(',').map(x => x.trim()).filter(Boolean);
      const bad = ids.find(id => !SLUG.test(id)), twice = ids.find((id, i) => ids.indexOf(id) !== i);
      if (bad) errors.push({ line: b.line, message: '"' + bad + '" cannot be a plan: lower case letters, digits and hyphens' });
      else if (twice) errors.push({ line: b.line, message: 'plan "' + twice + '" is listed twice' });
      else value.plans = ids;
    } else if (m[1] === 'start') {
      if (!isDate(m[2])) errors.push({ line: b.line, message: 'start must be a date like 2026-09-28' });
      else if (weekday(m[2]) !== 0) errors.push({ line: b.line, message: 'start must be a Monday' });
      else value.start = m[2];
    } else {
      if (!/^\d+$/.test(m[2]) || +m[2] < 1 || +m[2] > 106) errors.push({ line: b.line, message: 'weeks must be a number from 1 to 106' });
      else value.weeks = +m[2];
    }
  }
  if (!value.start && !errors.length) errors.push({ line: 1, message: 'start is missing' });
  if (!value.weeks && !errors.length) errors.push({ line: 1, message: 'weeks is missing' });
  return { value, errors };
}

export function serializeSeason(season) {
  return text(['start: ' + season.start, 'weeks: ' + season.weeks, ...(season.plans && season.plans.length ? ['plans: ' + season.plans.join(', ')] : [])]);
}

// ---- tables.txt -------------------------------------------------------------
// load  I 60  C 80  CH 100  R 50  AT 55  CT 40
// reference  R0 60'  R1 120'  …  R5 4'30''
// pace default  R0 7  R1 9.5  …        km/h; "pace junior …" gives a band its own speeds
// yearly  junior 2220  cadete 1605      water km per season, per band
// hard  R1 12  R2 12  R3 6  …           km of work in a typical hard session with that content
// race  sprint 1.4  fundo 6  maratona 13.5    the same for race pace (R7), by the race aimed at
// warmup 2                              km added to every session for warm-up and cool-down
// develop  R1 4-6  R2 3-4  R3-R3+ 2-3  R4-R5 2-4  R6 3-4      sessions a week to develop a content
// maintain  R1 3  R2 2  R3-R3+ 1  R4-R5 1  R6 1-2             and to maintain it; zones joined with
//                                       "-" are one content and are counted together
// zones junior  R1 R2 R3 R3+ R5 R6 R7   the zones suggested for a band's age
// zone-km junior  R1 892  R2 961        km a year in each zone for a band: the course's long-term table
//
// What the checks of a session and a week compare with (src/checks.js); a check with no line is off:
// rep  R3 1'-7'  R6 4''-30''            how long one repetition of a zone lasts
// rest  R3 1  R4 3  R5 3'               the least rest after a repetition: times the repetition, or a time
// recovery  R1 24  R3-R3+ 48            hours to recover after a session of a content
// warm  R3 30'                          paddling needed before the zone's work starts
// race-pace 2 4                         most R7 sessions a week: in preparation, in a competitive block
// most 1.5                              most work in a zone in one session, as times its reference
// place 1km Sede-Foz

function duration(s) {
  const m = /^(?:(\d+)')?(?:(\d+)'')?$/.exec(s);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  return (+m[1] || 0) * 60 + (+m[2] || 0);
}

function durationText(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return (m ? m + "'" : '') + (s || !m ? s + "''" : '');
}

function distance(s) {
  const m = /^(\d+(?:\.\d+)?)(km|m)$/.exec(s);
  return m ? Math.round(parseFloat(m[1]) * (m[2] === 'km' ? 1000 : 1)) : null;
}

function distanceText(m) {
  return m >= 1000 && m % 100 === 0 ? m / 1000 + 'km' : m + 'm';
}

export function parseTables(source) {
  const { blocks, errors } = readBlocks(source);
  const value = { load: {}, reference: {}, pace: {}, yearly: {}, hard: {}, race: {}, warmup: null, develop: {}, maintain: {}, zones: {}, places: [], zoneKm: {}, rep: {}, rest: {}, recovery: {}, warm: {}, racePace: null, most: null };
  const seen = {};
  const number = v => /^\d+(\.\d+)?$/.test(v);
  for (const b of blocks) {
    noSub(b, errors);
    const err = message => errors.push({ line: b.line, message });
    const words = b.head.split(/\s+/), kind = words[0];
    const pairs = (from, read) => {
      const rest = words.slice(from);
      if (rest.length % 2) return err('expected pairs like "' + (kind === 'load' ? 'C 80' : 'R2 60') + '"');
      for (let k = 0; k < rest.length; k += 2) read(rest[k], rest[k + 1]);
    };
    const once = key => { if (seen[key]) err('"' + key + '" is given twice'); seen[key] = true; };
    if (kind === 'load') {
      once('load');
      pairs(1, (type, v) => {
        if (!/^[A-Z]+$/.test(type) || !/^\d+$/.test(v) || +v > 100) err('cannot read "' + type + ' ' + v + '": a week type and a load from 0 to 100');
        else value.load[type] = +v;
      });
    } else if (kind === 'reference') {
      once('reference');
      pairs(1, (z, v) => {
        const sec = duration(v);
        if (!ZONES.includes(z) || !sec) err('cannot read "' + z + ' ' + v + '": a zone and a time like 30\' or 4\'30\'\'');
        else value.reference[z] = sec;
      });
    } else if (kind === 'pace') {
      const band = words[1];
      if (!band || !SLUG.test(band)) { err('pace needs a band name or "default"'); continue; }
      once('pace ' + band);
      value.pace[band] = {};
      pairs(2, (z, v) => {
        if (!ZONES.includes(z) || !/^\d+(\.\d+)?$/.test(v) || +v <= 0) err('cannot read "' + z + ' ' + v + '": a zone and a speed in km/h');
        else value.pace[band][z] = +v;
      });
    } else if (kind === 'yearly') {
      once('yearly');
      pairs(1, (band, v) => {
        if (!SLUG.test(band) || !number(v) || +v <= 0) err('cannot read "' + band + ' ' + v + '": a band and its water km per season');
        else value.yearly[band] = +v;
      });
    } else if (kind === 'hard') {
      once('hard');
      pairs(1, (z, v) => {
        if (!CONTENT_ZONES.includes(z) || z === 'R7' || !number(v)) err('cannot read "' + z + ' ' + v + '": a zone from R1 to R6 and the km of a hard session');
        else value.hard[z] = +v;
      });
    } else if (kind === 'race') {
      once('race');
      pairs(1, (type, v) => {
        if (!RACE_TYPES.includes(type) || !number(v)) err('cannot read "' + type + ' ' + v + '": sprint, fundo or maratona and the km of a race-pace session');
        else value.race[type] = +v;
      });
    } else if (kind === 'warmup') {
      once('warmup');
      if (words.length !== 2 || !number(words[1])) err('warmup is one number of km, like "warmup 2"');
      else value.warmup = +words[1];
    } else if (kind === 'develop' || kind === 'maintain') {
      once(kind);
      pairs(1, (content, v) => {
        const zones = content.split('-'), m = /^(\d+)(?:-(\d+))?$/.exec(v);
        if (zones.some(z => !CONTENT_ZONES.includes(z)) || new Set(zones).size !== zones.length || !m || (m[2] !== undefined && +m[2] < +m[1])) err('cannot read "' + content + ' ' + v + '": a content like R1 or R3-R3+ and sessions a week like 3 or 2-3');
        else value[kind][content] = [+m[1], m[2] === undefined ? +m[1] : +m[2]];
      });
    } else if (kind === 'zone-km') {
      const band = words[1];
      if (!band || !SLUG.test(band)) { err('zone-km needs a band and its km a year per zone, like "zone-km iniciado R1 267 R6 7.2"'); continue; }
      once('zone-km ' + band);
      value.zoneKm[band] = {};
      pairs(2, (z, v) => {
        if (!CONTENT_ZONES.includes(z) || !number(v)) err('cannot read "' + z + ' ' + v + '": a zone from R1 to R7 and its km a year');
        else value.zoneKm[band][z] = +v;
      });
    } else if (kind === 'rep') {
      once('rep');
      pairs(1, (z, v) => {
        const ends = v.split('-').map(duration);
        if (!CONTENT_ZONES.includes(z) || ends.length !== 2 || !ends[0] || !ends[1] || ends[1] < ends[0]) err('cannot read "' + z + ' ' + v + '": a zone and how long one repetition lasts, like 1\'-7\' or 20\'\'-3\'');
        else value.rep[z] = ends;
      });
    } else if (kind === 'rest') {
      once('rest');
      pairs(1, (z, v) => {
        const sec = duration(v);
        if (!CONTENT_ZONES.includes(z) || (!sec && !(number(v) && +v > 0))) err('cannot read "' + z + ' ' + v + '": a zone and its least rest, as times the repetition like 3 or as a time like 3\'');
        else value.rest[z] = sec ? { sec } : { ratio: +v };
      });
    } else if (kind === 'recovery') {
      once('recovery');
      pairs(1, (content, v) => {
        const zones = content.split('-');
        if (zones.some(z => !CONTENT_ZONES.includes(z)) || new Set(zones).size !== zones.length || !/^\d+$/.test(v) || +v < 1) err('cannot read "' + content + ' ' + v + '": a content like R1 or R3-R3+ and the hours to recover');
        else value.recovery[content] = +v;
      });
    } else if (kind === 'warm') {
      once('warm');
      pairs(1, (z, v) => {
        const sec = duration(v);
        if (!CONTENT_ZONES.includes(z) || !sec) err('cannot read "' + z + ' ' + v + '": a zone and the paddling before it, like 30\'');
        else value.warm[z] = sec;
      });
    } else if (kind === 'race-pace') {
      once('race-pace');
      if (words.length !== 3 || !/^\d+$/.test(words[1]) || !/^\d+$/.test(words[2])) err('race-pace is two numbers of sessions a week, like "race-pace 2 4"');
      else value.racePace = [+words[1], +words[2]];
    } else if (kind === 'most') {
      once('most');
      if (words.length !== 2 || !number(words[1]) || +words[1] <= 0) err('most is one number, like "most 1.5"');
      else value.most = +words[1];
    } else if (kind === 'zones') {
      const band = words[1], zones = words.slice(2);
      if (!band || !SLUG.test(band) || !zones.length || zones.some(z => !CONTENT_ZONES.includes(z))) { err('zones needs a band and its zones from R1 to R7, like "zones iniciado R1 R6"'); continue; }
      once('zones ' + band);
      value.zones[band] = CONTENT_ZONES.filter(z => zones.includes(z));
    } else if (kind === 'place') {
      const m = /^place\s+(\S+)\s+(.+)$/.exec(b.head), dist = m ? distance(m[1]) : null;
      if (!dist) err('cannot read "' + b.head + '": place, a distance like 300m or 1km, then the name');
      else value.places.push({ name: m[2], m: dist });
    } else err('cannot read "' + b.head + '"');
  }
  return { value, errors };
}

export function serializeTables(tables) {
  const join = (head, obj, show) => head + '  ' + Object.keys(obj).map(k => k + ' ' + (show ? show(obj[k]) : obj[k])).join('  ');
  const bands = Object.keys(tables.pace).sort((a, b) => (b === 'default') - (a === 'default'));
  return text([
    join('load', tables.load),
    join('reference', tables.reference, durationText),
    ...bands.map(b => join('pace ' + b, tables.pace[b])),
    ...(Object.keys(tables.yearly).length ? [join('yearly', tables.yearly)] : []),
    ...(Object.keys(tables.hard).length ? [join('hard', tables.hard)] : []),
    ...(Object.keys(tables.race).length ? [join('race', tables.race)] : []),
    ...(tables.warmup === null ? [] : ['warmup ' + tables.warmup]),
    ...['develop', 'maintain'].filter(k => Object.keys(tables[k]).length).map(k => join(k, tables[k], r => r[0] === r[1] ? r[0] : r[0] + '-' + r[1])),
    ...(Object.keys(tables.rep).length ? [join('rep', tables.rep, r => durationText(r[0]) + '-' + durationText(r[1]))] : []),
    ...(Object.keys(tables.rest).length ? [join('rest', tables.rest, r => r.sec ? durationText(r.sec) : r.ratio)] : []),
    ...(Object.keys(tables.recovery).length ? [join('recovery', tables.recovery)] : []),
    ...(Object.keys(tables.warm).length ? [join('warm', tables.warm, durationText)] : []),
    ...(tables.racePace ? ['race-pace ' + tables.racePace.join(' ')] : []),
    ...(tables.most === null ? [] : ['most ' + tables.most]),
    ...Object.keys(tables.zones).map(b => 'zones ' + b + '  ' + tables.zones[b].join(' ')),
    ...Object.keys(tables.zoneKm).map(b => join('zone-km ' + b, tables.zoneKm[b])),
    ...tables.places.map(p => 'place ' + distanceText(p.m) + ' ' + p.name)
  ]);
}

// ---- events.txt -------------------------------------------------------------
// 2027-03-20 Campeonato Nacional de Fundo
//   until: 2027-03-21
//   confirmed: no
//   place: Mirandela
//   kind: race
//   type: fundo
//   boats: mixed
//   plans: juniors 1, cadetes 2
//
// plans: for a race, the plans aimed at it with the importance of each (1 to 3).
// For other events, the plans it applies to; no plans line means every plan.

export function parseEvents(source) {
  const { blocks, errors } = readBlocks(source);
  const value = [];
  for (const b of blocks) {
    const err = message => errors.push({ line: b.line, message });
    const before = errors.length;
    const head = /^(\S+) (.+)$/.exec(b.head);
    if (!head || !isDate(head[1])) { err('an event starts with its date and name, like "2027-03-20 Name"'); continue; }
    const f = fields(b, ['until', 'confirmed', 'place', 'kind', 'type', 'boats', 'plans'], errors);
    const e = { date: head[1], until: null, confirmed: true, name: head[2], place: f.place || '', kind: f.kind, type: null, boats: null, plans: null, line: b.line };
    if (f.until !== undefined) {
      if (!isDate(f.until) || f.until < e.date) err('until must be a date on or after the event date');
      else if (f.until > e.date) e.until = f.until;
    }
    if (f.confirmed !== undefined) {
      if (f.confirmed !== 'yes' && f.confirmed !== 'no') err('confirmed is yes or no');
      else e.confirmed = f.confirmed === 'yes';
    }
    if (!KINDS.includes(f.kind)) err('kind must be one of: ' + KINDS.join(', '));
    const race = f.kind === 'race';
    if (race) {
      if (!RACE_TYPES.includes(f.type)) err('a race needs type: ' + RACE_TYPES.join(', '));
      else e.type = f.type;
      if (!BOATS.includes(f.boats)) err('a race needs boats: ' + BOATS.join(', '));
      else e.boats = f.boats;
    } else if (f.type !== undefined || f.boats !== undefined) err('only races have type and boats');
    if (f.plans !== undefined) {
      e.plans = {};
      for (const part of f.plans.split(',')) {
        const m = /^([a-z0-9][a-z0-9-]*)(?: ([123]))?$/.exec(part.trim());
        if (!m || (race && !m[2]) || (!race && m[2])) { err(race ? 'plans for a race are written "plan importance", like "juniors 1, cadetes 2"' : 'plans are written "juniors, cadetes"; only races have an importance'); break; }
        if (m[1] in e.plans) { err('plan "' + m[1] + '" is given twice'); break; }
        e.plans[m[1]] = m[2] ? +m[2] : null;
      }
    } else if (race) e.plans = {};
    if (errors.length === before) value.push(e);
  }
  return { value, errors };
}

export function sortEvents(events) {
  return events.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

export function serializeEvents(events) {
  const out = sortEvents(events).map(e => {
    const lines = [e.date + ' ' + e.name];
    if (e.until && e.until !== e.date) lines.push('  until: ' + e.until);
    if (!e.confirmed) lines.push('  confirmed: no');
    if (e.place) lines.push('  place: ' + e.place);
    lines.push('  kind: ' + e.kind);
    if (e.kind === 'race') lines.push('  type: ' + e.type, '  boats: ' + e.boats);
    const ids = e.plans ? Object.keys(e.plans) : [];
    if (ids.length) lines.push('  plans: ' + ids.map(id => e.plans[id] ? id + ' ' + e.plans[id] : id).join(', '));
    return lines.join('\n');
  });
  return out.length ? out.join('\n\n') + '\n' : '';
}

// ---- plans/<plan>/plan.txt --------------------------------------------------
// name: Juniors
// bands: junior, senior

export function parsePlanFile(source) {
  const { blocks, errors } = readBlocks(source);
  const value = { name: '', bands: [] };
  for (const b of blocks) {
    noSub(b, errors);
    const m = /^(name|bands):\s*(.*)$/.exec(b.head);
    if (!m) { errors.push({ line: b.line, message: 'cannot read "' + b.head + '"' }); continue; }
    if (m[1] === 'name') value.name = m[2];
    else {
      const bands = m[2].split(',').map(s => s.trim()).filter(Boolean);
      if (bands.some(x => !SLUG.test(x)) || new Set(bands).size !== bands.length) errors.push({ line: b.line, message: 'bands are short names in lower case, each once, like "junior, senior"' });
      else value.bands = bands;
    }
  }
  if (!errors.length && !value.name) errors.push({ line: 1, message: 'name is missing' });
  if (!errors.length && !value.bands.length) errors.push({ line: 1, message: 'bands is missing' });
  return { value, errors };
}

export function serializePlanFile(plan) {
  return text(['name: ' + plan.name, 'bands: ' + plan.bands.join(', ')]);
}

// ---- plans/<plan>/cycles.txt ------------------------------------------------
// Macrocycle I
//   5 intro  R1-R2  General I
//   4 build  R2     General II
//
// A macrocycle, then its mesocycles in order: weeks, load pattern, contents ("-" for none), name.

export function parseCycles(source) {
  const { blocks, errors } = readBlocks(source);
  const value = [];
  for (const b of blocks) {
    const macro = { name: b.head, mesos: [] };
    for (const s of b.sub) {
      if (s.text === '') continue;
      const err = message => errors.push({ line: s.line, message });
      const m = /^(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/.exec(s.text);
      if (!m) { err('a mesocycle is written "weeks pattern contents name", like "4 build R2 General II"'); continue; }
      const zones = m[3] === '-' ? [] : m[3].split('-');
      if (+m[1] < 1) err('a mesocycle needs at least one week');
      else if (!PATTERNS.includes(m[2])) err('pattern must be one of: ' + PATTERNS.join(', '));
      else if (zones.some(z => !CONTENT_ZONES.includes(z)) || new Set(zones).size !== zones.length) err('contents are zones joined with "-", like R3-R3+, or "-" for none');
      else macro.mesos.push({ len: +m[1], pat: m[2], zones: CONTENT_ZONES.filter(z => zones.includes(z)), name: m[4] });
    }
    if (!macro.mesos.length) errors.push({ line: b.line, message: 'macrocycle "' + b.head + '" has no mesocycles' });
    else value.push(macro);
  }
  return { value, errors };
}

export function serializeCycles(macros) {
  const all = macros.flatMap(mc => mc.mesos), label = m => m.zones.length ? m.zones.join('-') : '-';
  const w1 = Math.max(0, ...all.map(m => String(m.len).length));
  const w2 = Math.max(0, ...all.map(m => m.pat.length));
  const w3 = Math.max(0, ...all.map(m => label(m).length));
  return text(macros.flatMap(mc => [mc.name, ...mc.mesos.map(m =>
    '  ' + String(m.len).padStart(w1) + ' ' + m.pat.padEnd(w2) + '  ' + label(m).padEnd(w3) + '  ' + m.name)]));
}

// ---- plans/<plan>/weeks.txt -------------------------------------------------
// 2026-11-16 R
// 2026-12-28 R 30
//
// Only weeks set by hand: the week's Monday, the type, and a load % when it differs from the type's.

export function parseWeeks(source) {
  const { blocks, errors } = readBlocks(source);
  const value = [], seen = new Set();
  for (const b of blocks) {
    noSub(b, errors);
    const m = /^(\S+) ([A-Z]+)(?: (\d+))?$/.exec(b.head);
    if (!m || !isDate(m[1]) || (m[3] !== undefined && +m[3] > 100)) errors.push({ line: b.line, message: 'a week is written "Monday type load", like "2026-11-16 R" or "2026-11-16 R 30"' });
    else if (seen.has(m[1])) errors.push({ line: b.line, message: 'week ' + m[1] + ' is given twice' });
    else { seen.add(m[1]); value.push({ monday: m[1], type: m[2], load: m[3] === undefined ? null : +m[3], line: b.line }); }
  }
  return { value, errors };
}

export function serializeWeeks(hand) {
  return text(hand.slice().sort((a, b) => a.monday < b.monday ? -1 : 1).map(h => h.monday + ' ' + h.type + (h.load == null ? '' : ' ' + h.load)));
}

// ---- plans/<plan>/sessions.txt ----------------------------------------------
// 2026-10-11 am junior: 1km R1 + 8x 4' R2/1' R0 + 1km R1
//   K2 on the last four reps
// 2026-10-14 pm junior not-done: 6km R1
// 2026-10-15 pm junior pool: 3x 10' R2/3'
//
// Date, slot, band, then the place when it is not the water (pool, gym, land), then "not-done" when
// it did not happen. Everything after the first colon is the plan text, on one line. Indented lines
// are notes.

export function parseSessions(source) {
  const { blocks, errors } = readBlocks(source);
  const value = [];
  for (const b of blocks) {
    const m = /^(\S+) (am|pm) ([a-z0-9][a-z0-9-]*)(?: (pool|gym|land))?( not-done)?:(?: (.*))?$/.exec(b.head);
    if (!m || !isDate(m[1])) { errors.push({ line: b.line, message: 'a session is written "date slot band: plan", like "2026-10-11 am junior: 6km R1"' }); continue; }
    value.push({ date: m[1], slot: m[2], band: m[3], place: m[4] || 'water', notDone: !!m[5], text: (m[6] || '').trim(), notes: b.sub.map(s => s.text).join('\n'), line: b.line });
  }
  return { value, errors };
}

// ---- library.txt ------------------------------------------------------------
// R2: 3x(4'-6'-6'-4'/1')/3'
//   a note
// gym: 4-6 exercises, 2-3x 10-15 reps
//
// The sessions that are suggested for an empty slot, shared by every plan and band. A line is the
// plan text as in a session; "pool:", "gym:" or "land:" in front when it is not on the water.
// Indented lines are notes. The order of the lines is the order they are suggested in.

export function parseLibrary(source) {
  const { blocks, errors } = readBlocks(source);
  const value = blocks.map(b => {
    const m = /^(pool|gym|land):\s*(.*)$/.exec(b.head);
    return { place: m ? m[1] : 'water', text: (m ? m[2] : b.head).replace(/\s+/g, ' ').trim(), notes: b.sub.map(s => s.text).join('\n'), line: b.line };
  });
  return { value, errors };
}

export function serializeLibrary(library) {
  const lines = [];
  for (const s of library) {
    lines.push((s.place && s.place !== 'water' ? s.place + ': ' : '') + s.text);
    for (const n of String(s.notes || '').split(/\r?\n/)) { if (n.trim()) lines.push('  ' + n.trim()); }
  }
  return text(lines);
}

export function sessionKey(s) {
  return s.date + ' ' + s.slot + ' ' + s.band;
}

// bands gives the order of the bands within a slot
export function sortSessions(sessions, bands) {
  const rank = b => { const i = (bands || []).indexOf(b); return i < 0 ? 1000 : i; };
  return sessions.slice().sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) :
    a.slot !== b.slot ? (a.slot < b.slot ? -1 : 1) :
    rank(a.band) !== rank(b.band) ? rank(a.band) - rank(b.band) :
    a.band < b.band ? -1 : a.band > b.band ? 1 : 0);
}

export function serializeSessions(sessions, bands) {
  const lines = [];
  for (const s of sortSessions(sessions, bands)) {
    const plan = String(s.text || '').replace(/\s+/g, ' ').trim();
    lines.push(s.date + ' ' + s.slot + ' ' + s.band + (s.place && s.place !== 'water' ? ' ' + s.place : '') + (s.notDone ? ' not-done' : '') + ':' + (plan ? ' ' + plan : ''));
    const notes = String(s.notes || '').split(/\r?\n/).map(n => n.trim());
    while (notes.length && notes[0] === '') notes.shift();
    while (notes.length && notes[notes.length - 1] === '') notes.pop();
    for (const n of notes) lines.push(n ? '  ' + n : '');
  }
  return text(lines);
}
