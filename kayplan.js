#!/usr/bin/env node
// Kayplan on the command line: the same engine as the page, printed as text (DESIGN.md 6.5).

import { fileURLToPath } from 'node:url';
import { diskStore } from './src/store-disk.js';
import { clockToday, isDate } from './src/dates.js';
import { load, usable, planOf, weekOf } from './src/engine.js';
import { seasonReport, weekReport, eventsReport, checkReport, gridReport, zoneReport, checksReport } from './src/report.js';

const USAGE = `usage: node kayplan.js <command> [options]

  show season            the annual sheet as a table: cycles, week types, loads, races
  show week [n]          a week's sessions with the zone working; without n, the current week
  show grid              the capacity grid: sessions a week per zone with their state, and km
  show checks            what the course would question about the sessions and weeks that are written
  show zone <zone>       what a zone is and how the course says to train it, e.g. show zone R3
  show events            the races and events table
  check                  whether the plan is valid, plus the warnings

  --plan <id>            one plan (default: every plan)
  --band <name>          show week, show grid, show checks: one age band (default: every band of the plan)
  --as-of <YYYY-MM-DD>   run as if today were this date
  --dir <folder>         the season folder (default: season/ next to this file)`;

function fail(message) {
  console.error(message);
  process.exit(2);
}

const words = [], opts = {};
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) { words.push(args[i]); continue; }
  const key = args[i].slice(2);
  if (!['plan', 'band', 'as-of', 'dir'].includes(key) || i + 1 >= args.length) fail(USAGE);
  opts[key] = args[++i];
}

const command = words[0] === 'show' ? 'show ' + words[1] : words[0];
if (!['show season', 'show week', 'show grid', 'show checks', 'show zone', 'show events', 'check'].includes(command)) fail(USAGE);
if (opts['as-of'] !== undefined && !isDate(opts['as-of'])) fail('--as-of needs a date like 2026-10-12');

const today = opts['as-of'] || clockToday();
const data = await load(diskStore(opts.dir || fileURLToPath(new URL('./season/', import.meta.url))));

if (command === 'check') {
  const r = checkReport(data, today);
  console.log(r.text);
  process.exit(r.errors ? 1 : 0);
}

if (!usable(data)) fail('season.txt cannot be read; run: node kayplan.js check');
if (opts.plan !== undefined && !planOf(data, opts.plan)) fail('there is no plan "' + opts.plan + '"; plans: ' + data.plans.map(p => p.id).join(', '));
const plans = opts.plan !== undefined ? [opts.plan] : data.plans.map(p => p.id);

if (command === 'show events') {
  console.log(eventsReport(data, today));
} else if (command === 'show zone') {
  const card = zoneReport(String(words[2] || '').toUpperCase(), data.tables);
  if (!card) fail('show zone needs a zone from R1 to R7, like: show zone R3+');
  console.log(card);
} else if (command === 'show grid') {
  const out = [];
  for (const id of plans) { for (const b of planOf(data, id).bands) { if (opts.band === undefined || opts.band === b) out.push(gridReport(data, id, b, today)); } }
  if (!out.length) fail('no band "' + opts.band + '" in ' + plans.join(', '));
  console.log(out.join('\n\n\n'));
} else if (command === 'show checks') {
  const out = [];
  for (const id of plans) { for (const b of planOf(data, id).bands) { if (opts.band === undefined || opts.band === b) out.push(checksReport(data, id, b, today)); } }
  if (!out.length) fail('no band "' + opts.band + '" in ' + plans.join(', '));
  console.log(out.join('\n\n'));
} else if (command === 'show season') {
  console.log(plans.map(id => seasonReport(data, id, today)).join('\n\n\n'));
} else {
  let n;
  if (words[2] === undefined) {
    n = weekOf(data.season, today);
    if (!n) fail('today (' + today + ') is outside the season; give a week number from 1 to ' + data.season.weeks);
  } else {
    n = +words[2];
    if (!Number.isInteger(n) || n < 1 || n > data.season.weeks) fail('week must be a number from 1 to ' + data.season.weeks);
  }
  const shown = opts.band !== undefined ? plans.filter(id => planOf(data, id).bands.includes(opts.band)) : plans;
  if (!shown.length) fail('no band "' + opts.band + '" in ' + plans.join(', '));
  console.log(shown.map(id => weekReport(data, id, n, today, opts.band)).join('\n\n\n'));
}

// the problems are part of what the screen shows, so say when there are any
if (data.errors.length) console.error('\n' + data.errors.length + ' problems in the files; run: node kayplan.js check');
