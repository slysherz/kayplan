// The page: layout B of the mockup, on the engine. It draws what the engine works out and turns
// clicks and typing into the edits of cycles.js and edits.js. Nothing is computed only here.
//
// Every change is applied to the plan in memory, drawn, and saved to its file. The page watches the
// files, so a change made outside (by Claude, or in an editor) is drawn within a couple of seconds.

import { clockToday, isDate, shortDate, DAYS, MONTHS } from './dates.js';
import { minutesText, amountText } from './notation.js';
import * as cycles from './cycles.js';
import * as edits from './edits.js';
import { KINDS, RACE_TYPES, BOATS, sessionKey, sortEvents } from './format.js';
import { load, usable, planOf, planFiles, sheet, weekView, eventView, check, fileText, weekOf, endedWeeks } from './engine.js';
import { httpStore } from './store-http.js';

const CW = 26, LAB = 104;   // width of a week column and of the row labels, in px
const Z = {
  'R0': { bg: '#D9DDE3', fg: '#16202A' },
  'R1': { bg: '#BFE0F2', fg: '#16202A' },
  'R2': { bg: '#7DB8E0', fg: '#16202A' },
  'R3': { bg: '#2F74B5', fg: '#FFFFFF' },
  'R3+': { bg: '#1B4B82', fg: '#FFFFFF' },
  'R4': { bg: '#F0B95B', fg: '#16202A' },
  'R5': { bg: '#D9722B', fg: '#16202A' },
  'R6': { bg: '#7B4FA8', fg: '#FFFFFF' },
  'R7': { bg: '#2A2F36', fg: '#FFFFFF' }
};
const NOZ = { bg: '#E6EAEE', fg: '#16202A' };
const TYPE_NAMES = { I: 'Introductory', C: 'Load', CH: 'Shock', R: 'Recovery', AT: 'Activation', CT: 'Competition' };
const PATTERN_NAMES = {
  build: 'Build: load, shock, recovery', intro: 'Introduction, then build', restart: 'Recovery, then build',
  comp: 'Competition: load, activation, race', recovery: 'Recovery only', none: 'Not planned'
};
const KIND_NAMES = { race: 'Race', test: 'Test', camp: 'Camp', holiday: 'Holiday', 'no-water': 'No water' };
const TYPE_LABEL = { sprint: 'Sprint', fundo: 'Fundo', maratona: 'Maratona' };
const BOAT_LABEL = { solo: 'Solo', crew: 'Tripulações', mixed: 'Mixed' };

const store = httpStore();
const params = new URLSearchParams(location.search);

let data = null;        // the plan as loaded, with the edits made here
let known = null;       // the files' stamp when data was loaded
let ctx = null;         // what the last draw worked out
let edition = 0;        // counts edits made here, so a reload that raced with one is thrown away
let note = '';          // why the last edit was refused; cleared by the next click
let fault = '';         // the server cannot be reached; cleared when it answers again
let reveal = true;      // scroll the sheet to the selected week on the next draw
let uid = 0;
const state = { plan: null, band: null, week: null, sel: null, view: 'sheet', edit: null, problems: false, event: null };

// today comes from the clock; ?asof=YYYY-MM-DD shows the page as of another date
function now() {
  const a = params.get('asof');
  return a && isDate(a) ? a : clockToday();
}

function esc(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const zc = z => z && Z[z] ? Z[z] : NOZ;
const squash = s => String(s).replace(/\s+/g, ' ').trim();

// ---- where we are: kept in the address, so a reload of the page stays put ----

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('kayplan') || '{}'); } catch (e) { /* no storage: start from the defaults */ }
  state.plan = h.get('plan') || saved.plan || null;
  state.band = h.get('band') || saved.band || null;
  state.week = h.has('week') ? +h.get('week') : null;
  state.view = h.get('view') === 'events' ? 'events' : 'sheet';
  state.sel = h.get('sel');
  const ed = /^(meso|macro):(\d+)$/.exec(h.get('edit') || '');
  state.edit = ed ? { kind: ed[1], i: +ed[2] } : null;
  state.problems = h.get('problems') === '1';
}

function writeHash() {
  const h = new URLSearchParams();
  for (const k of ['plan', 'band', 'week']) { if (state[k] !== null) h.set(k, state[k]); }
  if (state.view === 'events') h.set('view', 'events');
  if (state.sel) h.set('sel', state.sel);
  if (state.edit) h.set('edit', state.edit.kind + ':' + state.edit.i);
  if (state.problems) h.set('problems', '1');
  history.replaceState(null, '', '#' + h.toString());
  try { localStorage.setItem('kayplan', JSON.stringify({ plan: state.plan, band: state.band })); } catch (e) { /* no storage */ }
}

// make the selection fit the plan that was loaded
function settle() {
  if (!usable(data)) return;
  if (!planOf(data, state.plan)) state.plan = data.plans.length ? data.plans[0].id : null;
  const plan = planOf(data, state.plan);
  if (!plan) return;
  if (!plan.bands.includes(state.band)) state.band = plan.bands[0] || null;
  const n = data.season.weeks;
  if (!Number.isInteger(state.week) || state.week < 1 || state.week > n) state.week = weekOf(data.season, now()) || (now() < data.season.start ? 1 : n);
  if (state.edit) {
    const lay = cycles.layout(plan.macros);
    if (!(state.edit.kind === 'meso' ? lay.mesos : lay.macros)[state.edit.i]) state.edit = null;
  }
  if (state.event && !data.events.some(e => e.uid === state.event)) state.event = null;
}

// events have no id in the file; give each one a handle for the page, kept across reloads
function tag(before) {
  const old = new Map((before || []).map(e => [e.date + ' ' + e.name, e.uid]));
  for (const e of data.events) {
    const k = e.date + ' ' + e.name;
    e.uid = old.get(k) || 'e' + (++uid);
    old.delete(k);
  }
}

// ---- loading and saving -------------------------------------------------------

const dirty = new Set();   // files changed here and not saved yet
let timer = null, queue = Promise.resolve(), pending = 0, conflict = false, drag = null;

async function reload() {
  const mark = edition;
  let fresh, stamp;
  try {
    stamp = await store.stamp();
    fresh = await load(store);
  } catch (e) {
    fault = 'The plan cannot be read: is the server running?';
    paintStatus();
    return;
  }
  // something was typed meanwhile: keep what is on screen and try again on the next tick
  if (mark !== edition || dirty.size || pending || drag) return;
  const before = data ? data.events : null;
  data = fresh;
  known = stamp;
  fault = '';
  tag(before);
  settle();
  render();
}

async function poll() {
  if (document.hidden || drag || pending) return;
  if (dirty.size) { if (!timer) flush(); return; }
  try {
    if (await store.stamp() !== known) await reload();
  } catch (e) {
    fault = 'The plan cannot be read: is the server running?';
    paintStatus();
  }
}

function flush() {
  clearTimeout(timer);
  timer = null;
  for (const path of [...dirty]) {
    dirty.delete(path);
    pending++;
    queue = queue.then(async () => {
      try {
        // written from the plan as it is now, against the revision last read or written
        if (!conflict) data.revs[path] = await store.write(path, fileText(data, path), data.revs[path]);
      } catch (e) {
        if (e.code === 'conflict') conflict = true;
        else { dirty.add(path); fault = 'Not saved yet: is the server running?'; }
      }
      pending--;
      if (!pending) settled();
    });
  }
  paintStatus();
}

function settled() {
  if (conflict) {
    // the file changed on disk since it was read: what is on disk wins, and the page shows it
    conflict = false;
    dirty.clear();
    note = 'The plan changed on disk; your last change was not saved';
    reload();
  } else if (!dirty.size) fault = '';
  paintStatus();
}

// Apply an edit to the files at paths. fn changes data and may throw 'not-allowed'.
// soon: the edit is typing, saved after a pause. quiet: do not redraw (the field being typed stays as it is).
function change(paths, fn, how) {
  const bad = paths.find(p => data.errors.some(e => e.file === p));
  if (bad) {
    // saving would drop the lines that could not be read
    note = bad + ' has a problem; fix it in the file first';
    state.problems = true;
    render();
    return false;
  }
  try { fn(); } catch (e) {
    if (e.code !== 'not-allowed') throw e;
    note = e.message.charAt(0).toUpperCase() + e.message.slice(1);
    if (how && how.quiet) paintStatus(); else render();
    return false;
  }
  note = '';
  edition++;
  for (const p of paths) dirty.add(p);
  if (how && how.soon) { clearTimeout(timer); timer = setTimeout(flush, 600); } else flush();
  if (how && how.quiet) paintStatus(); else render();
  return true;
}

function setPlan(next) {
  data.plans = data.plans.map(p => p.id === next.id ? next : p);
}

// ---- drawing: pieces -----------------------------------------------------------

function eventTitle(e) {
  const bits = [e.name];
  if (e.kind === 'race') bits.push(TYPE_LABEL[e.type], BOAT_LABEL[e.boats], 'importance ' + e.importance + ' of 3');
  else bits.push(KIND_NAMES[e.kind]);
  bits.push(shortDate(e.date) + (e.to !== e.date ? ' – ' + shortDate(e.to) : ''));
  if (e.place) bits.push(e.place);
  bits.push(e.confirmed ? 'date confirmed' : 'date not confirmed');
  return bits.join(' · ');
}

// a race's shade is its importance; a dashed ring means the date is not confirmed
function eventClass(e) {
  return (e.kind === 'race' ? 'i' + e.importance : 'other') + (e.confirmed ? '' : ' tbc');
}

// one cell of the Races row: the most important race of the week, or else its first event
function raceCell(w) {
  if (!w.events.length) return '<div class="racecell"></div>';
  const e = w.events.filter(x => x.kind === 'race').sort((a, b) => a.importance - b.importance)[0] || w.events[0];
  return '<div class="racecell"><button class="rc mono ' + eventClass(e) + '" data-act="event" data-v="' + e.uid + '" title="' + esc(w.events.map(eventTitle).join('\n')) + '">' + e.code + '</button></div>';
}

function banner(e) {
  const words = e.kind === 'race' ? TYPE_LABEL[e.type] + ' · ' + BOAT_LABEL[e.boats] : KIND_NAMES[e.kind];
  return '<button class="race ' + (e.kind === 'race' ? eventClass(e) : 'i3' + (e.confirmed ? '' : ' tbc')) + '" data-act="event" data-v="' + e.uid + '" title="' + esc(eventTitle(e)) + '">' +
    esc(e.name) + '<small>' + words + (e.confirmed ? '' : ' · date not confirmed') + '</small></button>';
}

function chip(s) {
  const c = zc(s.main);
  return '<button class="chip' + (sessionKey(s) === sessionKey(ctx.session) ? ' on' : '') + (s.notDone ? ' off' : '') + '" data-act="pick" data-v="' + sessionKey(s) + '" style="background:' + c.bg + ';color:' + c.fg + '">' +
    '<span class="chip-h">' + s.slot.toUpperCase() + ' · ' + (s.main || 'no zone') + (s.notDone ? ' · not done' : '') + '</span><span class="chip-t mono">' + esc(s.text || 'Empty session') + '</span></button>';
}

function statusHtml() {
  const problems = data ? check(data, now()) : [];
  return (problems.length ? '<button class="b danger" data-act="problems">' + problems.length + (problems.length === 1 ? ' problem' : ' problems') + '</button>' : '') +
    [fault, note].filter(Boolean).map(m => '<span class="msg">' + esc(m) + '</span>').join('') +
    (pending || dirty.size ? '<span class="muted">Saving…</span>' : '');
}

// the status line is redrawn on its own, so a save finishing never disturbs what is being typed
function paintStatus() {
  const el = document.getElementById('status');
  if (el) el.innerHTML = statusHtml();
}

function header() {
  let label = '', pills = '';
  if (usable(data)) {
    const s = data.season, end = new Date(Date.parse(s.start) + (s.weeks * 7 - 1) * 86400000).getUTCFullYear(), start = +s.start.slice(0, 4);
    label = start === end ? String(start) : start + '–' + String(end).slice(2);
    const plan = planOf(data, state.plan);
    pills = data.plans.map(p => '<button class="pill' + (p.id === state.plan ? ' on' : '') + '" data-act="plan" data-v="' + p.id + '">' + esc(p.name) + '</button>').join('') +
      (plan && plan.bands.length > 1 ? '<span class="gap"></span>' + plan.bands.map(b => '<button class="pill band' + (b === state.band ? ' on' : '') + '" data-act="band" data-v="' + b + '">' + esc(b) + '</button>').join('') : '');
  }
  return '<header><div class="brand">Kayplan</div><div class="muted">' + label + '</div>' +
    '<div class="tabs"><button class="tab' + (state.view === 'sheet' ? ' on' : '') + '" data-act="view" data-v="sheet">Plan</button>' +
    '<button class="tab' + (state.view === 'events' ? ' on' : '') + '" data-act="view" data-v="events">Events</button></div>' +
    '<button class="b" data-act="today"' + (usable(data) && weekOf(data.season, now()) ? '' : ' disabled') + '>Today</button>' +
    '<div id="status">' + statusHtml() + '</div><div class="pills">' + pills + '</div></header>';
}

function problemsPanel() {
  if (!state.problems) return '';
  const problems = check(data, now());
  return '<div class="pop problems"><div class="pop-h"><span class="eyebrow">Problems</span><button class="x" data-act="pop-close" aria-label="Close">×</button></div>' +
    (problems.length ? problems.map(p => '<div><b>' + p.level + '</b> · <span class="mono">' + esc(p.file + (p.line ? ':' + p.line : '')) + '</span> · ' + esc(p.message) + '</div>').join('') : '<div class="muted">None</div>') + '</div>';
}

// ---- drawing: the annual sheet, the week and the session -------------------------

function sheetView() {
  const { sh, wk, plan, session } = ctx, W = sh.weeks, ed = state.edit;
  const lab = (text, h) => '<div class="lab" style="height:' + h + 'px">' + text + '</div>';
  const per = fn => W.map(fn).join('');
  const width = m => 'width:' + ((m.to - m.from + 1) * CW) + 'px';
  const months = [];
  for (const w of W) {
    const label = MONTHS[+w.monday.slice(5, 7) - 1], last = months[months.length - 1];
    if (last && last.label === label) last.count++; else months.push({ label, count: 1 });
  }
  // a boundary can be dragged unless the weeks around it have ended
  const handle = (i, week) => {
    const lim = cycles.boundaryLimits(plan, i, sh.ended);
    return lim.min === 0 && lim.max === 0 ? '' : '<span class="hdl" data-drag="' + i + '" style="left:' + (LAB + week * CW - 4) + 'px"></span>';
  };
  const mesoHandles = sh.mesos.slice(0, -1).map((m, i) => handle(i, m.to)).join('');
  const on = w => w.n === state.week ? ' on' : '';

  const top =
    '<div class="panel sx" data-scroll="sheet" style="margin:12px 16px 0;flex-shrink:0"><div class="sheet" style="width:' + (LAB + W.length * CW + 8) + 'px">' +
    '<div class="row">' + lab('Month', 18) + months.map(m => '<div class="month" style="width:' + (m.count * CW) + 'px">' + m.label + '</div>').join('') + '</div>' +
    '<div class="row">' + lab('Monday', 18) + per(w => '<div class="cell mono' + (w.current ? ' now' : '') + '">' + +w.monday.slice(8) + '</div>') + '</div>' +
    '<div class="row">' + lab('Races', 24) + per(raceCell) + '</div>' +
    '<div class="row rel">' + lab('Macrocycle', 22) + sh.macros.map((m, i) =>
      '<button class="macro' + (ed && ed.kind === 'macro' && ed.i === i ? ' editing' : '') + '" data-act="edit-macro" data-v="' + i + '" data-anchor-id="macro' + i + '" title="' + esc(m.name) + ' · weeks ' + m.from + '–' + m.to + '" style="' + width(m) + '">' + esc(m.name) + '</button>').join('') +
      sh.macros.slice(0, -1).map(m => handle(m.first + m.count - 1, m.to)).join('') + '</div>' +
    '<div class="row rel">' + lab('Mesocycle', 22) + sh.mesos.map((m, i) =>
      '<button class="meso' + (ed && ed.kind === 'meso' && ed.i === i ? ' editing' : '') + '" data-act="edit-meso" data-v="' + i + '" data-anchor-id="meso' + i + '" title="' + esc(m.name) + ' · ' + m.label + ' · weeks ' + m.from + '–' + m.to + '" style="' + width(m) + ';background:' + zc(m.zone).bg + ';color:' + zc(m.zone).fg + '">' + esc(m.name) + '</button>').join('') +
      mesoHandles + '</div>' +
    '<div class="row rel" id="content-row">' + lab('Content', 20) + sh.mesos.map((m, i) =>
      '<button class="content mono" data-act="edit-meso" data-v="' + i + '" style="' + width(m) + '">' + (m.zones.length ? m.label : '–') + '</button>').join('') + mesoHandles + '</div>' +
    '<div class="row">' + lab('Microcycle', 26) + per(w => '<button class="swk mono' + on(w) + '" data-act="week" data-v="' + w.n + '" aria-label="Week ' + w.n + '">' + w.n + '</button>') + '</div>' +
    '<div class="row">' + lab('Type', 22) + per(w => '<button class="sty mono' + on(w) + (w.hand ? ' hand' : '') + '" data-act="week" data-v="' + w.n + '" aria-label="Week ' + w.n + ' type"' + (w.hand ? ' title="Set by hand"' : '') + '>' + (w.type || '') + '</button>') + '</div>' +
    '<div class="row">' + lab('Load %', 60) + per(w => '<button class="sld' + on(w) + '" data-act="week" data-v="' + w.n + '" aria-label="Week ' + w.n + ' load ' + (w.load === null ? 'not set' : w.load + ' percent') + '"' + (w.load === null ? '' : ' title="' + w.load + '%"') + '><span style="height:' + Math.round((w.load || 0) * 0.56) + 'px"></span></button>') + '</div>' +
    '</div></div>';

  const types = Object.keys(data.tables.load);
  const typeSelect = '<label class="inline"><span>Type</span><select data-change="type" data-fid="w-type">' +
    '<option value=""' + (wk.hand ? '' : ' selected') + '>Pattern · ' + (wk.pattern || '–') + '</option>' +
    types.map(t => '<option value="' + t + '"' + (wk.hand && wk.type === t ? ' selected' : '') + '>' + t + (TYPE_NAMES[t] ? ' · ' + TYPE_NAMES[t] : '') + '</option>').join('') + '</select></label>';
  const loadInput = '<label class="inline"><span>Load</span><input type="text" inputmode="numeric" class="mono" data-input="load" data-fid="w-load" value="' + (wk.load === null ? '' : wk.load) + '"' + (wk.type === null ? ' disabled' : '') + '><span>%</span></label>';
  const where = wk.mesoInfo ? esc(wk.mesoInfo.name) + ' · ' + (wk.mesoInfo.zones.length ? wk.mesoInfo.label : '–') : '';

  const days = wk.days.map(d => {
    const slots = ['am', 'pm'].map(slot => {
      const s = d.sessions.find(x => x.slot === slot && x.band === state.band);
      return s ? chip(s) : '<button class="add" data-act="add" data-v="' + slot + '" data-date="' + d.date + '" aria-label="Add session">+ ' + slot.toUpperCase() + '</button>';
    }).join('');
    return '<div class="day' + (d.today ? ' now' : '') + '"><div class="day-h"><b>' + DAYS[d.weekday] + '</b><span class="muted">' + shortDate(d.date) + '</span></div>' + d.events.map(banner).join('') + slots + '</div>';
  }).join('');

  let right = '<div class="ed-col"><div class="eyebrow">Session</div></div>';
  if (session) {
    let work = session.parts.slice().reverse().map(p => p.zone + ' ≈ ' + minutesText(p.min));
    if (session.unzoned) work.push('no zone ' + amountText(session.unzoned));
    if (!session.main) work = session.text ? ['No zone found'] : [];
    const c = zc(session.main);
    right = '<div class="ed-col"><div class="eyebrow">Session</div><div class="when">' + DAYS[wk.days.findIndex(d => d.date === session.date)] + ' ' + shortDate(session.date) + ' · ' + session.slot.toUpperCase() + '</div>' +
      '<div class="fld"><span>Main zone</span><div class="inf"><b class="zpill" style="background:' + c.bg + ';color:' + c.fg + '">' + (session.main || '–') + '</b><small>' + esc(work.join(' · ')) + '</small></div></div>' +
      '<label class="fld f-plan"><span>Plan</span><textarea class="mono plan" data-input="text" data-fid="s-text" spellcheck="false">' + esc(session.text) + '</textarea></label>' +
      '<label class="fld f-notes"><span>Notes</span><textarea data-input="notes" data-fid="s-notes">' + esc(session.notes) + '</textarea></label>' +
      '<div class="pop-r"><label class="inline"><input type="checkbox" data-change="notdone" data-fid="s-notdone"' + (session.notDone ? ' checked' : '') + '><span>Not done</span></label>' +
      '<button class="del" data-act="del">Delete session</button></div></div>';
  }

  const lower =
    '<div class="lower"><div class="left"><div class="sec-h" style="margin:0">' +
    '<button class="nav" data-act="prev" aria-label="Previous week"' + (state.week > 1 ? '' : ' disabled') + '>‹</button><button class="nav" data-act="next" aria-label="Next week"' + (state.week < W.length ? '' : ' disabled') + '>›</button>' +
    '<b style="font-size:16px">Week ' + wk.n + '</b><span class="muted">' + shortDate(wk.monday) + ' – ' + shortDate(wk.sunday) + (where ? ' · ' + where : '') + '</span>' +
    '<span class="push"></span>' + typeSelect + loadInput + '</div>' +
    '<div class="sx" style="flex:1 1 auto;display:flex"><div class="days">' + days + '</div></div></div>' +
    '<div class="panel right">' + right + '</div></div>';
  return top + lower;
}

// the edit panel under a block
function popover() {
  const ed = state.edit;
  if (!ed || state.view !== 'sheet') return '';
  const { sh, plan } = ctx, ended = sh.ended;
  const can = fn => { try { fn(); return ''; } catch (e) { return ' disabled'; } };
  if (ed.kind === 'meso') {
    const m = sh.mesos[ed.i];
    if (!m) return '';
    // a new block can start at any week of this block that has not ended
    const from = Math.max(m.from + 1, ended + 1);
    const def = state.week >= from && state.week <= m.to ? state.week : Math.min(m.to, Math.max(from, m.from + Math.ceil(m.len / 2)));
    let wopt = '';
    for (let w = from; w <= m.to; w++) wopt += '<option value="' + w + '"' + (w === def ? ' selected' : '') + '>week ' + w + '</option>';
    return '<div class="pop" id="pop" data-anchor="meso' + ed.i + '">' +
      '<div class="pop-h"><span class="eyebrow">Mesocycle</span><span class="muted">weeks ' + m.from + '–' + m.to + '</span><button class="x" data-act="pop-close" aria-label="Close">×</button></div>' +
      '<label class="fld"><span>Name</span><input type="text" data-plan="name" data-fid="pop-name" value="' + esc(m.name) + '"></label>' +
      '<div class="fld"><span>Content</span><div class="ztogs">' + cycles.CONTENT_ZONES.map(z => {
        const on = m.zones.includes(z);
        return '<button class="ztog mono" data-act="m-zone" data-v="' + z + '" aria-pressed="' + on + '"' + (on ? ' style="background:' + Z[z].bg + ';color:' + Z[z].fg + ';border-color:' + Z[z].bg + '"' : '') + '>' + z + '</button>';
      }).join('') + '</div></div>' +
      '<label class="fld"><span>Load pattern</span><select data-change="pat" data-fid="pop-pat">' + cycles.PATTERNS.map(p => '<option value="' + p + '"' + (p === m.pat ? ' selected' : '') + '>' + PATTERN_NAMES[p] + '</option>').join('') + '</select></label>' +
      '<div class="pop-r"><button class="b" data-act="m-left"' + can(() => cycles.moveMeso(plan, ed.i, -1, ended, data.season.start)) + '>◀ Move earlier</button>' +
      '<button class="b" data-act="m-right"' + can(() => cycles.moveMeso(plan, ed.i, 1, ended, data.season.start)) + '>Move later ▶</button></div>' +
      (wopt ? '<div class="pop-r"><button class="b" data-act="m-split">Split</button><label class="inline"><span>new block from</span><select id="splitw">' + wopt + '</select></label></div>' : '') +
      '<div class="pop-r"><button class="b" data-act="m-newmacro"' + can(() => cycles.newMacro(plan, ed.i, ended)) + '>Start new macrocycle here</button>' +
      '<button class="b danger" data-act="m-del"' + can(() => cycles.deleteMeso(plan, ed.i, ended)) + '>Delete</button></div></div>';
  }
  const mc = sh.macros[ed.i];
  if (!mc) return '';
  return '<div class="pop" id="pop" data-anchor="macro' + ed.i + '">' +
    '<div class="pop-h"><span class="eyebrow">Macrocycle</span><span class="muted">weeks ' + mc.from + '–' + mc.to + '</span><button class="x" data-act="pop-close" aria-label="Close">×</button></div>' +
    '<label class="fld"><span>Name</span><input type="text" data-plan="mname" data-fid="pop-name" value="' + esc(mc.name) + '"></label>' +
    '<div class="pop-r"><button class="b danger" data-act="mac-merge"' + can(() => cycles.mergeMacro(plan, ed.i, ended)) + '>Merge into previous</button></div></div>';
}

// ---- drawing: the races and events table -----------------------------------------

function eventsView() {
  const today = now(), plans = data.plans;
  const options = (list, names, value) => list.map(v => '<option value="' + v + '"' + (v === value ? ' selected' : '') + '>' + names[v] + '</option>').join('');
  const rows = sortEvents(data.events).map(raw => {
    const e = eventView(data, raw, today), id = e.uid, race = e.kind === 'race';
    const f = name => ' data-ev="' + id + '" data-f="' + name + '" data-fid="ev-' + id + '-' + name + '"';
    return '<tr' + (id === state.event ? ' class="on"' : '') + ' data-row="' + id + '">' +
      '<td><input type="date"' + f('date') + ' value="' + e.date + '"' + (e.unconfirmedPast ? ' class="flag"' : '') + '></td>' +
      '<td><input type="date"' + f('until') + ' value="' + (e.until || '') + '"></td>' +
      '<td class="c"><input type="checkbox"' + f('confirmed') + (e.confirmed ? ' checked' : '') + ' aria-label="Date confirmed"></td>' +
      '<td class="name"><input type="text"' + f('name') + ' value="' + esc(e.name) + '" title="' + esc(e.name) + '"></td>' +
      '<td class="place"><input type="text"' + f('place') + ' value="' + esc(e.place) + '"></td>' +
      '<td class="sel"><select' + f('kind') + '>' + options(KINDS, KIND_NAMES, e.kind) + '</select></td>' +
      '<td class="sel">' + (race ? '<select' + f('type') + '>' + options(RACE_TYPES, TYPE_LABEL, e.type) + '</select>' : '') + '</td>' +
      '<td class="sel">' + (race ? '<select' + f('boats') + '>' + options(BOATS, BOAT_LABEL, e.boats) + '</select>' : '') + '</td>' +
      plans.map(p => {
        if (!race) return '<td class="c"><input type="checkbox"' + f('plan:' + p.id) + (e.plans === null || p.id in e.plans ? ' checked' : '') + ' aria-label="' + esc(p.name) + '"></td>';
        const v = p.id in e.plans ? String(e.plans[p.id]) : '';
        return '<td><select class="mono"' + f('plan:' + p.id) + ' aria-label="' + esc(p.name) + ' importance">' + ['', '1', '2', '3'].map(x => '<option value="' + x + '"' + (x === v ? ' selected' : '') + '>' + (x || '–') + '</option>').join('') + '</select></td>';
      }).join('') +
      '<td><button class="b danger" data-act="ev-del" data-v="' + id + '">Delete</button></td></tr>';
  }).join('');
  return '<div class="panel sx events"><table><thead><tr><th>Date</th><th>Until</th><th>Confirmed</th><th>Name</th><th>Place</th><th>Kind</th><th>Race type</th><th>Boats</th>' +
    plans.map(p => '<th>' + esc(p.name) + '</th>').join('') + '<th></th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="foot"><button class="b" data-act="ev-add">Add event</button></div></div>';
}

// ---- drawing: everything -----------------------------------------------------------

function render() {
  const root = document.getElementById('root');
  if (!data) return;
  // remember what is focused and how far the sheet is scrolled, to put both back
  const a = document.activeElement, fid = a && a.dataset ? a.dataset.fid : null;
  const held = fid ? { value: a.value, from: a.selectionStart, to: a.selectionEnd, top: a.scrollTop } : null;
  const scroll = {};
  for (const el of root.querySelectorAll('[data-scroll]')) scroll[el.dataset.scroll] = el.scrollLeft;

  const plan = usable(data) ? planOf(data, state.plan) : null;
  if (!plan || !plan.bands.length) {
    // nothing can be drawn until the files can be read: show only the problems
    state.problems = true;
    ctx = null;
    root.innerHTML = header() + '<div id="app"></div>' + problemsPanel();
    return;
  }
  const today = now(), sh = sheet(data, plan.id, today), wk = weekView(data, plan.id, state.week, today);
  const mine = wk.days.flatMap(d => d.sessions).filter(s => s.band === state.band);
  ctx = { today, plan, sh, wk, session: mine.find(s => sessionKey(s) === state.sel) || mine[0] || null };
  root.innerHTML = header() + '<div id="app">' + (state.view === 'events' ? eventsView() : sheetView()) + '</div>' + popover() + problemsPanel();

  const pop = document.getElementById('pop');
  if (pop) {
    const anchor = root.querySelector('[data-anchor-id="' + pop.dataset.anchor + '"]'), under = document.getElementById('content-row');
    if (anchor && under) {
      pop.style.left = Math.max(8, Math.min(anchor.getBoundingClientRect().left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
      pop.style.top = (under.getBoundingClientRect().bottom + 6) + 'px';
    }
  }
  for (const el of root.querySelectorAll('[data-scroll]')) {
    if (scroll[el.dataset.scroll] !== undefined) el.scrollLeft = scroll[el.dataset.scroll];
    const on = reveal ? el.querySelector('.swk.on') : null;
    if (on) {
      const left = on.offsetLeft - el.offsetLeft, right = left + on.offsetWidth;
      if (left < el.scrollLeft + LAB + 6) el.scrollLeft = Math.max(0, left - LAB - 6);
      else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth + 8;
    }
  }
  reveal = false;
  if (fid) {
    const el = root.querySelector('[data-fid="' + fid + '"]');
    if (el) {
      // what is being typed is kept as typed while it means the same as what was saved
      if (typeof held.value === 'string' && el.value !== held.value && squash(el.value) === squash(held.value)) el.value = held.value;
      el.focus();
      try { el.setSelectionRange(held.from, held.to); } catch (e) { /* not a text field */ }
      el.scrollTop = held.top;
    }
  }
  writeHash();
}

// ---- acting: clicks ------------------------------------------------------------------

function planAct(act, v) {
  const ed = state.edit, plan = ctx.plan, f = planFiles(plan.id), ended = ctx.sh.ended, i = ed.i;
  if (ed.kind === 'meso') {
    if (act === 'm-zone') {
      const zones = ctx.sh.mesos[i].zones;
      change([f.cycles], () => setPlan(cycles.setMeso(plan, i, { zones: zones.includes(v) ? zones.filter(z => z !== v) : [...zones, v] })));
    } else if (act === 'm-left' || act === 'm-right') {
      // a moved block carries its hand-set weeks and its sessions
      change([f.cycles, f.weeks, f.sessions], () => {
        const r = cycles.moveMeso(plan, i, act === 'm-left' ? -1 : 1, ended, data.season.start);
        setPlan(r.plan);
        ed.i = r.index;
      });
    } else if (act === 'm-split') {
      const sel = document.getElementById('splitw');
      change([f.cycles], () => { setPlan(cycles.splitMeso(plan, i, sel ? +sel.value : 0, ended)); ed.i = i + 1; });
    } else if (act === 'm-del') {
      change([f.cycles], () => { setPlan(cycles.deleteMeso(plan, i, ended)); state.edit = null; });
    } else if (act === 'm-newmacro') {
      change([f.cycles], () => setPlan(cycles.newMacro(plan, i, ended)));
    }
  } else if (act === 'mac-merge') {
    change([f.cycles], () => { setPlan(cycles.mergeMacro(plan, i, ended)); ed.i = i - 1; });
  }
}

document.addEventListener('click', e => {
  if (!data) return;
  note = '';
  const t = e.target.closest('[data-act]'), inPop = e.target.closest('.pop');
  // a click outside an open panel closes it
  if ((state.edit || state.problems) && !inPop && !(t && /^(edit-|problems)/.test(t.dataset.act))) {
    state.edit = null;
    state.problems = false;
    if (!t) { render(); return; }
  }
  if (!t || t.disabled) { paintStatus(); return; }
  const act = t.dataset.act, v = t.dataset.v;
  if (act === 'problems') state.problems = !state.problems;
  else if (act === 'pop-close') { state.edit = null; state.problems = false; }
  else if (act === 'view') { state.view = v; state.edit = null; state.event = null; reveal = true; }
  else if (!ctx) { /* the rest needs a plan on screen */ }
  else if (act === 'today') { state.week = weekOf(data.season, now()); state.view = 'sheet'; state.sel = null; reveal = true; }
  else if (act === 'plan') { state.plan = v; state.band = null; state.sel = null; state.edit = null; settle(); }
  else if (act === 'band') { state.band = v; state.sel = null; }
  else if (act === 'week' || act === 'prev' || act === 'next') {
    const n = act === 'week' ? +v : state.week + (act === 'prev' ? -1 : 1);
    if (n !== state.week && n >= 1 && n <= data.season.weeks) { state.week = n; state.sel = null; reveal = true; }
  }
  else if (act === 'pick') state.sel = v;
  else if (act === 'edit-meso') { state.edit = { kind: 'meso', i: +v }; state.problems = false; }
  else if (act === 'edit-macro') { state.edit = { kind: 'macro', i: +v }; state.problems = false; }
  else if (/^m-|^mac-/.test(act)) { planAct(act, v); return; }
  else if (act === 'add') {
    const s = { date: t.dataset.date, slot: v, band: state.band, text: '', notes: '' };
    state.sel = sessionKey(s);
    if (change([planFiles(ctx.plan.id).sessions], () => setPlan(edits.putSession(ctx.plan, s)))) {
      const ta = document.querySelector('[data-fid="s-text"]');
      if (ta) ta.focus();
    }
    return;
  }
  else if (act === 'del') {
    if (ctx.session) { const key = sessionKey(ctx.session); state.sel = null; change([planFiles(ctx.plan.id).sessions], () => setPlan(edits.removeSession(ctx.plan, key))); }
    return;
  }
  else if (act === 'event') { state.view = 'events'; state.event = v; state.edit = null; }
  else if (act === 'ev-add') {
    const ev = { ...edits.newEvent(weekOf(data.season, now()) ? now() : data.season.start), uid: 'e' + (++uid) };
    state.event = ev.uid;
    if (change(['events.txt'], () => { data.events = [...data.events, ev]; })) {
      const name = document.querySelector('[data-fid="ev-' + ev.uid + '-name"]');
      if (name) { name.focus(); name.select(); }
    }
    return;
  }
  else if (act === 'ev-del') { change(['events.txt'], () => { data.events = data.events.filter(x => x.uid !== v); }); return; }
  render();
  if (act === 'event') {
    const row = document.querySelector('[data-row="' + v + '"]');
    if (row) row.scrollIntoView({ block: 'center' });
  }
});

// ---- acting: fields --------------------------------------------------------------------

// one field of the events table
function eventField(el, typing) {
  const id = el.dataset.ev, f = el.dataset.f, ids = data.plans.map(p => p.id);
  const ev = data.events.find(x => x.uid === id);
  if (!ev) return;
  let changes, how;
  if (f === 'name' || f === 'place') {
    if (!typing) return;
    if (f === 'name' && !el.value.trim()) return;   // an event keeps its name while the field is empty
    changes = { [f]: el.value };
    how = { soon: true };
  } else if (typing) return;
  else if (f === 'date' || f === 'until') {
    // a date being typed passes through years like 0002; wait for a real one
    if (el.value ? !isDate(el.value) || el.value < '2000' : f === 'date') return;
    changes = { [f]: el.value };
    // the row is not redrawn or moved while its date is being typed
    how = { soon: true, quiet: true };
  }
  else if (f === 'confirmed') changes = { confirmed: el.checked };
  else if (f === 'kind' || f === 'type' || f === 'boats') changes = { [f]: el.value };
  else if (f.startsWith('plan:')) changes = { plan: { id: f.slice(5), value: ev.kind === 'race' ? (el.value ? +el.value : null) : (el.checked ? true : null) } };
  else return;
  change(['events.txt'], () => { data.events = data.events.map(x => x === ev ? edits.setEvent(ev, changes, ids) : x); }, how);
}

document.addEventListener('change', e => {
  const el = e.target;
  if (!data || !el.dataset) return;
  if (el.dataset.ev) { eventField(el, false); return; }
  if (!ctx) return;
  const f = planFiles(ctx.plan.id), c = el.dataset.change;
  if (c === 'type') change([f.weeks], () => setPlan(edits.setWeek(ctx.plan, ctx.wk.monday, el.value || null, null, data.tables)));
  else if (c === 'pat' && state.edit) change([f.cycles], () => setPlan(cycles.setMeso(ctx.plan, state.edit.i, { pat: el.value })));
  else if (c === 'notdone' && ctx.session) change([f.sessions], () => setPlan(edits.putSession(ctx.plan, { ...ctx.session, notDone: el.checked })));
});

document.addEventListener('input', e => {
  const el = e.target;
  if (!data || !el.dataset) return;
  if (el.dataset.ev) { eventField(el, true); return; }
  if (!ctx) return;
  const f = planFiles(ctx.plan.id), typing = { soon: true };
  const name = el.dataset.plan, field = el.dataset.input;
  if ((name === 'name' || name === 'mname') && state.edit) {
    if (!el.value.trim()) return;   // a block keeps its name while the field is empty
    change([f.cycles], () => setPlan(name === 'name' ? cycles.setMeso(ctx.plan, state.edit.i, { name: el.value }) : cycles.setMacroName(ctx.plan, state.edit.i, el.value)), typing);
  } else if ((field === 'text' || field === 'notes') && ctx.session) {
    change([f.sessions], () => setPlan(edits.putSession(ctx.plan, { ...ctx.session, [field]: el.value })), typing);
  } else if (field === 'load') {
    const w = ctx.wk, v = +el.value;
    if (!/^\d+$/.test(el.value.trim()) || v > 100 || w.type === null || (!w.hand && v === w.load)) return;
    change([f.weeks], () => setPlan(edits.setWeek(ctx.plan, w.monday, w.type, v, data.tables)), typing);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && (state.edit || state.problems)) { state.edit = null; state.problems = false; render(); }
  // the plan text is one line
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.input === 'text') e.preventDefault();
});

// leaving a field saves what was typed without waiting
document.addEventListener('focusout', () => { if (dirty.size) flush(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && dirty.size) flush(); });

// ---- acting: dragging a boundary between two blocks ---------------------------------------

document.addEventListener('pointerdown', e => {
  const h = e.target.closest ? e.target.closest('[data-drag]') : null;
  if (!h || !ctx) return;
  e.preventDefault();
  const i = +h.dataset.drag, path = planFiles(ctx.plan.id).cycles;
  if (data.errors.some(x => x.file === path)) { change([path], () => {}); return; }
  drag = { i, x: e.clientX, d: 0, base: ctx.plan, lim: cycles.boundaryLimits(ctx.plan, i, ctx.sh.ended), path };
  state.edit = null;
  document.body.classList.add('dragging');
});

document.addEventListener('pointermove', e => {
  if (!drag) return;
  const d = Math.max(drag.lim.min, Math.min(drag.lim.max, Math.round((e.clientX - drag.x) / CW)));
  if (d === drag.d) return;
  drag.d = d;
  edition++;
  // one block grows and its neighbour shrinks, in whole weeks; saved when the drag ends
  setPlan(cycles.moveBoundary(drag.base, drag.i, d, ctx.sh.ended));
  render();
});

function endDrag(keep) {
  if (!drag) return;
  const done = drag;
  drag = null;
  document.body.classList.remove('dragging');
  if (!keep) setPlan(done.base);
  if (keep && done.d !== 0) change([done.path], () => {});
  else render();
}

document.addEventListener('pointerup', () => endDrag(true));
document.addEventListener('pointercancel', () => endDrag(false));

// ---- start ---------------------------------------------------------------------------------

readHash();
reload();
setInterval(poll, 2000);
