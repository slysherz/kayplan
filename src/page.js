// The page: layout B of the mockup, on the engine. It draws what the engine (engine.js, km.js) works
// out and turns clicks and typing into the edits of cycles.js and edits.js. Nothing is computed only here.
//
// Every change is applied to the plan in memory, drawn, and saved to its file. The page watches the
// files, so a change made outside (by Claude, or in an editor) is drawn within a couple of seconds.

import { clockToday, isDate, shortDate, addDays, weekday, DAYS, MONTHS } from './dates.js';
import { minutesText, amountText, kmText } from './notation.js';
import * as cycles from './cycles.js';
import * as edits from './edits.js';
import { KINDS, RACE_TYPES, BOATS, PLACES, sessionKey, sortEvents } from './format.js';
import { load, usable, planOf, planFiles, sheet, weekView, eventView, check, fileText, weekOf, endedWeeks, dayView } from './engine.js';
import { kmView } from './km.js';
import { gridView } from './grid.js';
import { zoneCard, typesCard } from './zones.js';
import { checksView } from './checks.js';
import { suggestions } from './suggest.js';
import { httpStore } from './store-http.js';
import { githubStore, setupLink, readSetup } from './store-github.js';
import { tr, dec, setLang, getLang, LANGS } from './lang.js';

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
// the names shown for what the files hold as short words; looked up when drawn, in the language in use
const typeName = x => ({ I: tr('Introductory'), C: tr('Load'), CH: tr('Shock'), R: tr('Recovery'), AT: tr('Activation'), CT: tr('Competition') })[x];
const patternName = x => ({
  build: tr('Build: load, shock, recovery'), intro: tr('Introduction, then build'), restart: tr('Recovery, then build'),
  comp: tr('Competition: load, activation, race'), recovery: tr('Recovery only'), none: tr('Not planned')
})[x];
const kindName = x => ({ race: tr('Race'), test: tr('Test'), camp: tr('Camp'), holiday: tr('Holiday'), 'no-water': tr('No water') })[x];
const raceTypeName = x => ({ sprint: tr('Sprint'), fundo: tr('Fundo'), maratona: tr('Maratona') })[x];
const boatName = x => ({ solo: tr('Solo'), crew: tr('Tripulações'), mixed: tr('Mixed') })[x];
const placeName = x => ({ water: tr('Water'), pool: tr('Pool'), gym: tr('Gym'), land: tr('Land') })[x];
const slotName = x => ({ am: tr('AM'), pm: tr('PM') })[x];
const stateName = x => ({ developing: tr('developing'), maintaining: tr('maintaining'), 'below maintenance': tr('below maintenance'), trained: tr('trained'), absent: tr('absent') })[x];

const params = new URLSearchParams(location.search);
// Where the plan is: the files next to the local server when the page comes from it; anywhere else,
// a folder of a GitHub repository, opened with a token this browser keeps (DESIGN.md 6.5).
const hosted = !/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname) || params.has('github');
let account = null;     // { repo, dir, token }: the repository this browser opens
let signin = null;      // { message } while the form that asks for the repository is shown
let store = hosted ? null : httpStore();

let data = null;        // the plan as loaded, with the edits made here
let known = null;       // the files' stamp when data was loaded
let ctx = null;         // what the last draw worked out
let edition = 0;        // counts edits made here, so a reload that raced with one is thrown away
let note = '';          // why the last edit was refused; cleared by the next click
let fault = '';         // the server cannot be reached; cleared when it answers again
let toSession = false; // a session was just picked: on a phone, scroll to it on the next draw
let reveal = true;      // scroll the sheet to the selected week on the next draw
let uid = 0;
const state = { plan: null, band: null, week: null, sel: null, view: 'sheet', edit: null, problems: false, event: null, grid: 'sessions', zone: null, day: null, full: false };

// the language: ?lang= in the address, else the one chosen on this device, else the browser's
function useLang(l, keep) {
  setLang(l);
  document.documentElement.lang = getLang() === 'pt' ? 'pt-PT' : 'en';
  if (keep) { try { localStorage.setItem('kayplan-lang', getLang()); } catch (e) { /* no storage */ } }
}
function firstLang() {
  let saved = null;
  try { saved = localStorage.getItem('kayplan-lang'); } catch (e) { /* no storage */ }
  return params.get('lang') || saved || (/^pt\b/i.test(navigator.language || '') ? 'pt' : 'en');
}

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
  state.grid = h.get('grid') === 'km' ? 'km' : 'sessions';
  state.sel = h.get('sel');
  const ed = /^(meso|macro):(\d+)$/.exec(h.get('edit') || '');
  state.edit = ed ? { kind: ed[1], i: +ed[2] } : null;
  state.problems = h.get('problems') === '1';
  state.day = isDate(h.get('day') || '') ? h.get('day') : null;
  state.full = h.get('full') === '1';
}

function writeHash() {
  const h = new URLSearchParams();
  if (state.day) h.set('day', state.day);
  if (state.full) h.set('full', '1');
  for (const k of ['plan', 'band', 'week']) { if (state[k] !== null) h.set(k, state[k]); }
  if (state.view === 'events') h.set('view', 'events');
  if (state.grid === 'km') h.set('grid', 'km');
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

// ---- the repository, when the plan is on GitHub -------------------------------------------

function readAccount() {
  // a setup link: keep what it carries in this browser, and take it out of the address
  const sent = readSetup(location.hash);
  if (sent) {
    try { localStorage.setItem('kayplan-github', JSON.stringify({ ...JSON.parse(localStorage.getItem('kayplan-github') || '{}'), ...sent })); } catch (e) { /* no storage */ }
    history.replaceState(null, '', location.pathname + location.search);
  }
  try { account = JSON.parse(localStorage.getItem('kayplan-github') || 'null'); } catch (e) { account = sent; }
  if (account && account.repo && account.token) store = githubStore(account);
  else signin = { message: '' };
}

function drawSignin() {
  const a = account || {}, f = (name, label, value, type) => '<label class="fld"><span>' + label + '</span><input type="' + (type || 'text') + '" data-gh="' + name + '" value="' + esc(value || '') + '" autocomplete="off" autocapitalize="off" spellcheck="false"></label>';
  document.getElementById('root').innerHTML = '<div class="signin panel"><div class="pop-h"><div class="brand">Kayplan</div>' + (data ? '<button class="x" data-act="gh-close" aria-label="' + tr('Close') + '">×</button>' : '') + '</div>' +
    f('repo', tr('Repository'), a.repo).replace('<input ', '<input placeholder="owner/name" ') + f('dir', tr('Folder'), a.dir || 'season') + f('token', tr('Token'), a.token, 'password') +
    '<div class="pop-r"><button class="b" data-act="gh-open">' + tr('Open') + '</button><span class="msg">' + esc(signin.message || '') + '</span></div>' +
    // with the plan open: a link that sets up another person's browser, with their own token
    (data && usable(data) && a.repo && !a.readonly ? '<div class="pop-acts"><div class="eyebrow">' + tr('Link for another person') + '</div>' + f('ltoken', tr('Their token'), '', 'password') +
      '<div class="pop-r"><select data-gh="lplan"><option value="">' + tr('All plans') + '</option>' + data.plans.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('') + '</select>' +
      '<label class="inline"><input type="checkbox" data-gh="lro"><span>' + tr('Read only') + '</span></label></div>' +
      '<div class="pop-r"><input type="text" class="mono link" data-gh="link" readonly><button class="b" data-act="gh-copy" disabled>' + tr('Copy link') + '</button></div></div>' : '') + '</div>';
}

// the link follows what is typed in its fields
function drawLink() {
  const q = name => document.querySelector('[data-gh="' + name + '"]'), out = q('link');
  if (!out) return;
  const token = q('ltoken').value.trim();
  out.value = token ? setupLink(location.origin + location.pathname, { repo: account.repo, dir: account.dir, token, readonly: q('lro').checked, plan: q('lplan').value }) : '';
  document.querySelector('[data-act="gh-copy"]').disabled = !token;
}
document.addEventListener('input', e => { if (e.target.dataset && /^l(token|plan|ro)$/.test(e.target.dataset.gh || '')) drawLink(); });
document.addEventListener('change', e => { if (e.target.dataset && /^l(token|plan|ro)$/.test(e.target.dataset.gh || '')) drawLink(); });

function copyLink() {
  const out = document.querySelector('[data-gh="link"]');
  out.select();
  try { navigator.clipboard.writeText(out.value); } catch (e) { /* the link stays selected, to be copied by hand */ }
}

function openAccount() {
  const v = name => document.querySelector('[data-gh="' + name + '"]').value.trim();
  // typed by hand, it is the coach's own: not read only, every plan
  account = { ...(account || {}), repo: v('repo'), dir: v('dir') || 'season', token: v('token'), readonly: false, plan: null };
  if (!/^[\w.-]+\/[\w.-]+$/.test(account.repo)) { signin = { message: tr('Write the repository as owner/name') }; drawSignin(); return; }
  try { localStorage.setItem('kayplan-github', JSON.stringify(account)); } catch (e) { /* no storage: asked again next time */ }
  store = githubStore(account);
  signin = { message: '' };
  data = null;
  known = null;
  drawSignin();
  reload();
}

// ---- loading and saving -------------------------------------------------------

const dirty = new Set();   // files changed here and not saved yet
let timer = null, queue = Promise.resolve(), pending = 0, conflict = false, drag = null;

// the store did not answer: say so, and when it is the token or the repository, ask for them again
function unread(e) {
  const asked = e.code === 'auth' ? tr('GitHub refused the token') : e.code === 'missing' ? tr('The repository or the folder was not found with this token') : '';
  fault = hosted ? tr('The plan cannot be read: is there a connection?') : tr('The plan cannot be read: is the server running?');
  if (asked || signin) { signin = { message: asked || fault }; drawSignin(); }
  else paintStatus();
}

async function reload() {
  if (!store) { drawSignin(); return; }
  const mark = edition;
  let fresh, stamp;
  try {
    stamp = await store.stamp();
    fresh = await load(store);
  } catch (e) {
    unread(e);
    return;
  }
  signin = null;
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
  if (document.hidden || drag || pending || !store || signin) return;
  if (dirty.size) { if (!timer) flush(); return; }
  try {
    if (await store.stamp() !== known) await reload();
  } catch (e) {
    unread(e);
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
        else { dirty.add(path); fault = hosted ? tr('Not saved yet: is there a connection?') : tr('Not saved yet: is the server running?'); }
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
    note = tr('The plan changed on disk; your last change was not saved');
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
    note = tr('{0} has a problem; fix it in the file first', bad);
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
  if (e.kind === 'race') bits.push(raceTypeName(e.type), boatName(e.boats), tr('importance {0} of 3', e.importance));
  else bits.push(kindName(e.kind));
  bits.push(shortDate(e.date) + (e.to !== e.date ? ' – ' + shortDate(e.to) : ''));
  if (e.place) bits.push(e.place);
  bits.push(e.confirmed ? tr('date confirmed') : tr('date not confirmed'));
  return bits.join(' · ');
}

// a race's shade is its importance; a dashed ring means the date is not confirmed
function eventClass(e) {
  return (e.kind === 'race' ? 'i' + e.importance : 'other') + (e.confirmed ? '' : ' tbc');
}

// one cell of the Races row: the most important race of the week, or else its first event.
// In the events view, the event whose entry is selected comes first and its cell is marked.
function raceCell(w) {
  if (!w.events.length) return '<div class="racecell"></div>';
  const sel = w.events.find(x => x.uid === state.event);
  const e = sel || w.events.filter(x => x.kind === 'race').sort((a, b) => a.importance - b.importance)[0] || w.events[0];
  return '<div class="racecell' + (sel ? ' on' : '') + '" data-evs="' + w.events.map(x => x.uid).join(' ') + '"><button class="rc mono ' + eventClass(e) + '" data-act="event" data-v="' + e.uid + '" title="' + esc(w.events.map(eventTitle).join('\n')) + '">' + e.code + '</button></div>';
}

function banner(e) {
  const words = e.kind === 'race' ? raceTypeName(e.type) + ' · ' + boatName(e.boats) : kindName(e.kind);
  return '<button class="race ' + (e.kind === 'race' ? eventClass(e) : 'i3' + (e.confirmed ? '' : ' tbc')) + '" data-act="event" data-v="' + e.uid + '" title="' + esc(eventTitle(e)) + '">' +
    esc(e.name) + '<small>' + words + (e.confirmed ? '' : ' · ' + tr('date not confirmed')) + '</small></button>';
}

function chip(s) {
  const c = zc(s.main);
  return '<button class="chip' + (sessionKey(s) === sessionKey(ctx.session) ? ' on' : '') + (s.notDone ? ' off' : '') + '" data-act="pick" data-v="' + sessionKey(s) + '" style="background:' + c.bg + ';color:' + c.fg + '">' +
    '<span class="chip-h">' + slotName(s.slot) + ' · ' + (s.main || tr('no zone')) + (s.place !== 'water' ? ' · ' + placeName(s.place).toLowerCase() : '') + (s.notDone ? ' · ' + tr('not done') : '') + '</span><span class="chip-t mono">' + esc(s.text || tr('Empty session')) + '</span></button>';
}

function statusHtml() {
  const problems = data ? check(data, now()) : [];
  return (problems.length ? '<button class="b danger" data-act="problems">' + (problems.length === 1 ? tr('{0} problem', 1) : tr('{0} problems', problems.length)) + '</button>' : '') +
    [fault, note].filter(Boolean).map(m => '<span class="msg">' + esc(m) + '</span>').join('') +
    (pending || dirty.size ? '<span class="muted">' + tr('Saving…') + '</span>' : '');
}

// the status line is redrawn on its own, so a save finishing never disturbs what is being typed
function paintStatus() {
  const el = document.getElementById('status');
  if (el) el.innerHTML = statusHtml();
}

function header() {
  let label = '', pills = '';
  const langs = '<span class="seg">' + LANGS.map(l => '<button class="segb' + (l === getLang() ? ' on' : '') + '" data-act="lang" data-v="' + l + '">' + l.toUpperCase() + '</button>').join('') + '</span>';
  if (usable(data)) {
    const s = data.season, end = new Date(Date.parse(s.start) + (s.weeks * 7 - 1) * 86400000).getUTCFullYear(), start = +s.start.slice(0, 4);
    label = start === end ? String(start) : start + '–' + String(end).slice(2);
    const plan = planOf(data, state.plan);
    // every plan shows its bands, one or several, so the plan buttons never move
    pills = data.plans.map(p => '<button class="pill' + (p.id === state.plan ? ' on' : '') + '" data-act="plan" data-v="' + p.id + '">' + esc(p.name) + '</button>').join('') +
      (plan ? '<span class="gap"></span>' + plan.bands.map(b => '<button class="pill band' + (b === state.band ? ' on' : '') + '" data-act="band" data-v="' + b + '">' + esc(b) + '</button>').join('') : '');
  }
  return '<header><div class="brand">Kayplan</div><div class="muted">' + label + '</div>' +
    '<div class="tabs"><button class="tab' + (state.view === 'sheet' ? ' on' : '') + '" data-act="view" data-v="sheet">' + tr('Plan') + '</button>' +
    '<button class="tab' + (state.view === 'events' ? ' on' : '') + '" data-act="view" data-v="events">' + tr('Events') + '</button></div>' +
    '<button class="b" data-act="today"' + (usable(data) && weekOf(data.season, now()) ? '' : ' disabled') + '>' + tr('Today') + '</button>' +
    '<div class="pills">' + pills + '</div><div id="status">' + statusHtml() + '</div>' + langs +
    (hosted && account ? '<button class="b acct" data-act="account">' + esc(account.repo) + '</button>' : '') + '</header>';
}

function problemsPanel() {
  if (!state.problems) return '';
  const problems = check(data, now());
  return '<div class="pop problems"><div class="pop-h"><span class="eyebrow">' + tr('Problems') + '</span><button class="x" data-act="pop-close" aria-label="' + tr('Close') + '">×</button></div>' +
    (problems.length ? problems.map(p => '<div><b>' + (p.level === 'error' ? tr('error') : tr('warning')) + '</b> · <span class="mono">' + esc(p.file + (p.line ? ':' + p.line : '')) + '</span> · ' + esc(p.message) + '</div>').join('') : '<div class="muted">' + tr('None') + '</div>') + '</div>';
}

// ---- drawing: the annual sheet, the week and the session -------------------------

// One cell of the Km row: the number is the week's estimate, and the cell fills from the bottom as
// the week's sessions cover it. With no estimate, the number is the km from the sessions.
function kmCell(w, x) {
  let cls = 'cap mono', style = '', text, tip;
  if (x.estimate !== null) {
    const pct = x.estimate > 0 ? Math.min(1, x.km / x.estimate) : 0;
    text = Math.round(x.estimate);
    const why = x.planned ? tr('load {0}% × content {1}', x.load, dec(x.factor, 2)) : tr('not planned yet: an average week');
    tip = tr('estimate {0} km ({1}), sessions {2} km', dec(x.estimate, 1), why, dec(x.km, 1)) + (x.estimate > 0 ? ' (' + Math.round(x.km / x.estimate * 100) + '%)' : '');
    if (pct >= 0.95) cls += ' dev';
    else { cls += ' tg'; if (pct > 0) style = ' style="background-image:linear-gradient(to top, #BCD9E6 ' + Math.round(pct * 100) + '%, transparent ' + Math.round(pct * 100) + '%)"'; }
  } else {
    text = x.km > 0 ? kmText(x.km) : '·';
    tip = tr('sessions {0} km', dec(x.km, 1));
    if (x.km >= 0.5) cls += ' tg';
  }
  return '<button class="' + cls + (w.n === state.week ? ' cur' : '') + '" data-act="week" data-v="' + w.n + '"' + style + ' title="' + tr('Week {0}', w.n) + ': ' + tip + '">' + text + '</button>';
}

const STATE_CLASS = { developing: ' dev', maintaining: ' mnt', 'below maintenance': ' low', trained: ' tg', absent: '' };
const span = r => r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1];

// The capacity grid: one row per zone, one cell per week, showing sessions or km. The shade of a
// sessions cell is the content's state that week, by the course's sessions a week.
function gridRows(grid, weeks) {
  const km = state.grid === 'km';
  const head = '<div class="row" style="margin-top:8px"><div class="lab" style="height:20px"><span class="seg">' +
    '<button class="segb' + (km ? '' : ' on') + '" data-act="grid" data-v="sessions">' + tr('Sessions') + '</button><button class="segb' + (km ? ' on' : '') + '" data-act="grid" data-v="km">' + tr('Km') + '</button></span></div>' +
    '<div class="legend" style="width:' + (weeks * CW + 96) + 'px"><span>' + tr('Season') + '</span></div></div>';
  return head + grid.rows.map(r => {
    const c = r.content;
    const cells = r.weeks.map(x => {
      const cur = x.n === state.week ? ' cur' : '';
      if (km) return '<button class="cap mono' + (x.km >= 0.5 ? ' tg' : '') + cur + '" data-act="week" data-v="' + x.n + '" title="' + tr('Week {0}', x.n) + ': ' + r.zone + ' ' + dec(x.km, 1) + ' km">' + (x.km > 0 ? kmText(x.km) : '·') + '</button>';
      const tip = tr('Week {0}', x.n) + ': ' + (x.sessions === 1 ? tr('{0} session of {1}', 1, r.zone) : tr('{0} sessions of {1}', x.sessions, r.zone)) +
        (c && c.zones.length > 1 && x.sessions ? ', ' + tr('{0} of {1} together', x.together, c.key) : '') + (x.sessions ? ': ' + stateName(x.state) : '') +
        (c ? ' (' + tr('develop {0}, maintain {1}', span(c.develop), span(c.maintain)) + ')' : '') + (r.suggested === false ? ' · ' + tr('not suggested at this age') : '');
      return '<button class="cap mono' + STATE_CLASS[x.state] + cur + '" data-act="week" data-v="' + x.n + '" title="' + tip + '">' + (x.sessions || '·') + '</button>';
    }).join('');
    // a zone the course's long-term table does not give this age is dimmed
    return '<div class="row"><button class="lab zlab' + (r.suggested === false ? ' off' : '') + '" data-tip="' + r.zone + '" style="height:20px"><i class="sw" style="background:' + Z[r.zone].bg + '"></i><u>' + r.zone + '</u></button>' + cells +
      '<div class="capsum mono"' + (r.yearly === null ? '' : ' title="' + tr("{0}: {1} km this season, {2} km a year recommended", r.zone, dec(r.km, 1), dec(r.yearly)) + '"') + '>' +
      (km ? kmText(r.km) + (r.yearly === null ? '' : ' / ' + dec(r.yearly)) : r.sessions) + '</div></div>';
  }).join('');
}

const lab = (text, h) => '<div class="lab" style="height:' + h + 'px">' + text + '</div>';

// the Month and Monday rows over the season's weeks
function calendarRows(W) {
  const months = [];
  for (const w of W) {
    const label = tr(MONTHS[+w.monday.slice(5, 7) - 1]), last = months[months.length - 1];
    if (last && last.label === label) last.count++; else months.push({ label, count: 1 });
  }
  return '<div class="row">' + lab(tr('Month'), 18) + months.map(m => '<div class="month" style="width:' + (m.count * CW) + 'px">' + m.label + '</div>').join('') + '</div>' +
    '<div class="row">' + lab(tr('Monday'), 18) + W.map(w => '<div class="cell mono' + (w.current ? ' now' : '') + '">' + +w.monday.slice(8) + '</div>').join('') + '</div>';
}

function sheetView() {
  const { sh, wk, plan, session, km } = ctx, W = sh.weeks, ed = state.edit;
  const per = fn => W.map(fn).join('');
  const width = m => 'width:' + ((m.to - m.from + 1) * CW) + 'px';
  // a boundary can be dragged unless the weeks around it have ended
  const handle = (i, week) => {
    const lim = cycles.boundaryLimits(plan, i, sh.ended);
    return lim.min === 0 && lim.max === 0 ? '' : '<span class="hdl" data-drag="' + i + '" style="left:' + (LAB + week * CW - 4) + 'px"></span>';
  };
  const mesoHandles = sh.mesos.slice(0, -1).map((m, i) => handle(i, m.to)).join('');
  const on = w => w.n === state.week ? ' on' : '';
  // what the course would question, for the selected band: per week, and per session of the selected week
  const said = (c, days) => [...c.week, ...days.flatMap(d => d.sessions.filter(s => c.sessions[sessionKey(s)]).flatMap(s =>
    c.sessions[sessionKey(s)].map(t => tr(DAYS[d.weekday]) + ' ' + slotName(s.slot) + ' · ' + t)))];
  const flagged = w => ctx.checks[w.n - 1].count ? ' warn' : '';
  // season km from sessions against the yearly km
  const se = km.season;
  const seasonTip = tr('Season: {0} km done, {1} km planned', dec(se.done, 1), dec(se.planned, 1)) + (se.yearly === null ? '' : ', ' + tr('of {0} km a year', se.yearly)) +
    (sh.ended && se.yearly !== null ? '. ' + tr('Weeks that have ended: {0} of {1} km estimated', dec(se.endedKm, 1), dec(se.endedEstimate, 1)) : '');

  const top =
    '<div class="panel sx" data-scroll="sheet" style="margin:12px 16px 0;flex-shrink:0"><div class="sheet" style="width:' + (LAB + W.length * CW + 104) + 'px">' +
    calendarRows(W) +
    '<div class="row">' + lab(tr('Races'), 24) + per(raceCell) + '</div>' +
    '<div class="row rel">' + lab(tr('Macrocycle'), 22) + sh.macros.map((m, i) =>
      '<button class="macro' + (ed && ed.kind === 'macro' && ed.i === i ? ' editing' : '') + '" data-act="edit-macro" data-v="' + i + '" data-anchor-id="macro' + i + '" title="' + esc(m.name) + ' · ' + tr('weeks {0}–{1}', m.from, m.to) + '" style="' + width(m) + '">' + esc(m.name) + '</button>').join('') +
      sh.macros.slice(0, -1).map(m => handle(m.first + m.count - 1, m.to)).join('') + '</div>' +
    '<div class="row rel">' + lab(tr('Mesocycle'), 22) + sh.mesos.map((m, i) =>
      '<button class="meso' + (ed && ed.kind === 'meso' && ed.i === i ? ' editing' : '') + '" data-act="edit-meso" data-v="' + i + '" data-anchor-id="meso' + i + '" title="' + esc(m.name) + ' · ' + m.label + ' · ' + tr('weeks {0}–{1}', m.from, m.to) + '" style="' + width(m) + ';background:' + zc(m.zone).bg + ';color:' + zc(m.zone).fg + '">' + esc(m.name) + '</button>').join('') +
      mesoHandles + '</div>' +
    '<div class="row rel" id="content-row">' + lab(tr('Content'), 20) + sh.mesos.map((m, i) =>
      '<button class="content mono" data-act="edit-meso" data-v="' + i + '" style="' + width(m) + '">' + (m.zones.length ? m.label : '–') + '</button>').join('') + mesoHandles + '</div>' +
    '<div class="row">' + lab(tr('Microcycle'), 26) + per(w => '<button class="swk mono' + on(w) + flagged(w) + '" data-act="week" data-v="' + w.n + '" aria-label="' + tr('Week {0}', w.n) + '">' + w.n + '</button>') + '</div>' +
    // the Type label opens the card of the week types, as a zone name opens its card
    '<div class="row"><button class="lab zlab" data-tip="types" style="height:22px"><u>' + tr('Type') + '</u></button>' + per(w => '<button class="sty mono' + on(w) + (w.hand ? ' hand' : '') + '" data-act="week" data-v="' + w.n + '" aria-label="' + tr('Week {0} type', w.n) + '"' + (w.hand ? ' title="' + tr('Set by hand') + '"' : '') + '>' + (w.type || '') + '</button>') + '</div>' +
    '<div class="row">' + lab(tr('Load %'), 60) + per(w => '<button class="sld' + on(w) + '" data-act="week" data-v="' + w.n + '" aria-label="' + (w.load === null ? tr('Week {0} load not set', w.n) : tr('Week {0} load {1} percent', w.n, w.load)) + '"' + (w.load === null ? '' : ' title="' + w.load + '%"') + '><span style="height:' + Math.round((w.load || 0) * 0.56) + 'px"></span></button>') + '</div>' +
    '<div class="row">' + lab(tr('Km'), 20) + per(w => kmCell(w, km.weeks[w.n - 1])) +
    '<div class="capsum mono" title="' + seasonTip + '">' + Math.round(se.done + se.planned) + (se.yearly === null ? '' : ' / ' + se.yearly) + '</div></div>' +
    gridRows(ctx.grid, W.length) +
    '</div></div>';

  const types = Object.keys(data.tables.load);
  const typeSelect = '<label class="inline"><span>' + tr('Type') + '</span><select data-change="type" data-fid="w-type">' +
    '<option value=""' + (wk.hand ? '' : ' selected') + '>' + tr('Pattern') + ' · ' + (wk.pattern || '–') + '</option>' +
    types.map(t => '<option value="' + t + '"' + (wk.hand && wk.type === t ? ' selected' : '') + '>' + t + (typeName(t) ? ' · ' + typeName(t) : '') + '</option>').join('') + '</select></label>';
  const loadInput = '<label class="inline"><span>' + tr('Load') + '</span><input type="text" inputmode="numeric" class="mono" data-input="load" data-fid="w-load" value="' + (wk.load === null ? '' : wk.load) + '"' + (wk.type === null ? ' disabled' : '') + '><span>%</span></label>';
  const where = wk.mesoInfo ? esc(wk.mesoInfo.name) + ' · ' + (wk.mesoInfo.zones.length ? wk.mesoInfo.label : '–') : '';
  const wkm = km.weeks[wk.n - 1];
  const weekKm = '<span class="mono" data-id="week-km">' + (wkm.estimate === null ? kmText(wkm.km) + ' km' : tr('{0} of {1} km', kmText(wkm.km), Math.round(wkm.estimate))) + (wkm.offMin > 0 ? ' · ' + tr('{0} off the water', minutesText(wkm.offMin)) : '') + '</span>';

  const days = wk.days.map(d => {
    const slots = ['am', 'pm'].map(slot => {
      const s = d.sessions.find(x => x.slot === slot && x.band === state.band);
      return s ? chip(s) : '<button class="add" data-act="add" data-v="' + slot + '" data-date="' + d.date + '" aria-label="' + tr('Add session') + '">+ ' + slotName(slot) + '</button>';
    }).join('');
    return '<div class="day' + (d.today ? ' now' : '') + '"><div class="day-h"><b>' + tr(DAYS[d.weekday]) + '</b><span class="muted">' + shortDate(d.date) + '</span></div>' + d.events.map(banner).join('') + slots + '</div>';
  }).join('');

  let right = '<div class="ed-col"><div class="eyebrow">' + tr('Session') + '</div></div>';
  if (session) {
    let work = session.parts.slice().reverse().map(p => p.zone + ' ≈ ' + minutesText(p.min));
    if (session.unzoned) work.push(tr('no zone') + ' ' + amountText(session.unzoned));
    if (!session.main) work = session.text ? [tr('No zone found')] : [];
    if (session.place === 'water' && session.totalKm > 0) work.push('≈ ' + dec(session.totalKm, 1) + ' km');
    const doubts = ctx.checks[wk.n - 1].sessions[sessionKey(session)] || [];
    // each piece with a zone, and its other unit
    const other = session.pieces.map(x => x.text + ' ≈ ' + x.approx).join(' · ');
    const c = zc(session.main);
    right = '<div class="ed-col' + (ctx.sug ? ' asking' : '') + '"><div class="eyebrow">' + tr('Session') + '</div><div class="when">' + tr(DAYS[wk.days.findIndex(d => d.date === session.date)]) + ' ' + shortDate(session.date) + ' · ' + slotName(session.slot) + '</div>' +
      '<div class="fld"><span>' + tr('Main zone') + '</span><div class="inf"><b class="zpill" style="background:' + c.bg + ';color:' + c.fg + '">' + (session.main || '–') + '</b><small>' + esc(work.join(' · ')) + (other ? '<span class="mono other">' + esc(other) + '</span>' : '') + '</small></div></div>' +
      (doubts.length ? '<div class="chks" data-id="s-checks">' + doubts.map(t => '<div>' + esc(t) + '</div>').join('') + '</div>' : '') +
      '<label class="fld f-plan"><span>' + tr('Plan') + '</span><textarea class="mono plan" data-input="text" data-fid="s-text" spellcheck="false">' + esc(session.text) + '</textarea></label>' +
      suggested() +
      '<label class="fld f-notes"><span>' + tr('Notes') + '</span><textarea data-input="notes" data-fid="s-notes">' + esc(session.notes) + '</textarea></label>' +
      '<div class="pop-r"><label class="inline"><span>' + tr('Place') + '</span><select data-change="place" data-fid="s-place">' + PLACES.map(x => '<option value="' + x + '"' + (x === session.place ? ' selected' : '') + '>' + placeName(x) + '</option>').join('') + '</select></label>' +
      '<label class="inline"><input type="checkbox" data-change="notdone" data-fid="s-notdone"' + (session.notDone ? ' checked' : '') + '><span>' + tr('Not done') + '</span></label>' +
      '<button class="del" data-act="del">' + tr('Delete session') + '</button></div></div>';
  }

  const weekSaid = said(ctx.checks[wk.n - 1], wk.days.map(d => ({ ...d, sessions: d.sessions.filter(s => s.band === state.band) })));
  const lower =
    '<div class="lower"><div class="left"><div class="sec-h" style="margin:0">' +
    '<button class="nav" data-act="prev" aria-label="' + tr('Previous week') + '"' + (state.week > 1 ? '' : ' disabled') + '>‹</button><button class="nav" data-act="next" aria-label="' + tr('Next week') + '"' + (state.week < W.length ? '' : ' disabled') + '>›</button>' +
    '<b style="font-size:16px">' + tr('Week {0}', wk.n) + '</b><span class="muted">' + shortDate(wk.monday) + ' – ' + shortDate(wk.sunday) + (where ? ' · ' + where : '') + '</span>' +
    '<span class="push"></span>' + typeSelect + loadInput + weekKm + '</div>' +
    (weekSaid.length ? '<div class="chks" data-id="w-checks">' + weekSaid.map(t => '<div>' + esc(t) + '</div>').join('') + '</div>' : '') +
    '<div class="sx" style="flex:1 1 auto;display:flex"><div class="days">' + days + '</div></div></div>' +
    '<div class="panel right">' + right + '</div></div>';
  return top + lower;
}

// the sessions suggested for the selected session while it has no work written: the band's zones, the
// ones the week is missing in bold, then one row each; a zone lists every suggestion of that zone
function suggested() {
  const g = ctx.sug;
  if (!g) return '';
  const rows = g.list.map((x, i) => {
    const c = zc(x.main);
    return '<button class="sug-r" data-act="sug" data-v="' + i + '"' + (x.notes ? ' title="' + esc(x.notes) + '"' : '') + '><b style="background:' + c.bg + ';color:' + c.fg + '">' + (x.main || placeName(x.place)) + '</b>' +
      '<span class="mono">' + esc(x.text) + '</span><small>' + (x.min > 0 ? minutesText(x.min) : '') + '</small></button>';
  }).join('');
  const zones = g.typed ? '' : '<div class="sug-z">' + g.zones.map(z => '<button class="segb' + (z.missing ? ' need' : '') + (state.zone === z.zone ? ' on' : '') + '" data-act="sug-zone" data-v="' + z.zone + '">' + z.zone + '</button>').join('') + '</div>';
  return '<div class="sug" data-id="sug">' + zones + '<div class="sug-l">' + rows + '</div></div>';
}

// ---- the phone: one day, to read before a training session ------------------------------------

// a narrow window gets the day page unless the full page was asked for
// someone who can only read gets it on any screen, and no full page
const reader = () => !!(account && account.readonly);
const phone = () => reader() || ((window.innerWidth <= 760 || params.has('phone')) && !state.full);

// Every plan's sessions of one day, the morning first. Nothing is edited here.
function phoneView() {
  const today = now(), d = dayView(data, state.day || today, today);
  // a link made for one plan shows that plan only
  if (account && account.plan && d.plans.some(p => p.id === account.plan)) d.plans = d.plans.filter(p => p.id === account.plan);
  const seen = new Set(), events = d.plans.flatMap(p => p.events).filter(e => !seen.has(e.name) && seen.add(e.name));
  const cards = ['am', 'pm'].flatMap(slot => d.plans.flatMap(p => p.sessions.filter(s => s.slot === slot).map(s => {
    const c = zc(s.main);
    let work = s.parts.slice().reverse().map(x => x.zone + ' ≈ ' + minutesText(x.min));
    if (s.place === 'water' && s.totalKm > 0) work.push('≈ ' + dec(s.totalKm, 1) + ' km');
    const other = s.pieces.map(x => x.text + ' ≈ ' + x.approx).join(' · ');
    return '<div class="ph-s panel' + (s.notDone ? ' off' : '') + '"><div class="ph-h"><b class="zpill" style="background:' + c.bg + ';color:' + c.fg + '">' + (s.main || '–') + '</b>' +
      '<div><b>' + esc(p.name) + ' · ' + esc(s.band) + '</b><span class="muted">' + slotName(s.slot) + (s.place !== 'water' ? ' · ' + placeName(s.place) : '') + (s.notDone ? ' · ' + tr('not done') : '') + '</span></div></div>' +
      (s.text ? '<div class="ph-t mono">' + esc(s.text) + '</div>' : '') +
      (work.length ? '<div class="ph-w muted">' + esc(work.join(' · ')) + (other ? '<span class="mono">' + esc(other) + '</span>' : '') + '</div>' : '') +
      (s.notes ? '<div class="ph-n">' + esc(s.notes) + '</div>' : '') + '</div>';
  })));
  const none = cards.length ? '' : '<div class="ph-none muted">' + tr('No sessions') + '</div>' +
    (d.next ? '<button class="b" data-act="day" data-v="' + d.next + '">' + tr('Next session') + ' · ' + tr(DAYS[weekday(d.next)]) + ' ' + shortDate(d.next) + '</button>' : '');
  return '<header class="ph-top"><button class="nav" data-act="day" data-v="' + addDays(d.date, -1) + '" aria-label="' + tr('Previous day') + '">‹</button>' +
    '<div class="ph-d"><b>' + tr(DAYS[d.weekday]) + ' ' + shortDate(d.date) + '</b><span class="muted">' + (d.week ? tr('Week {0}', d.week) : '') + '</span></div>' +
    '<button class="nav" data-act="day" data-v="' + addDays(d.date, 1) + '" aria-label="' + tr('Next day') + '">›</button>' +
    '<button class="b" data-act="day" data-v=""' + (d.today ? ' disabled' : '') + '>' + tr('Today') + '</button><span id="status">' + statusHtml() + '</span></header>' +
    '<div id="app" class="ph">' + events.map(banner).join('') + cards.join('') + none +
    '<div class="ph-f">' + (reader() ? '<span></span>' : '<button class="b" data-act="full">' + tr('Full page') + '</button>') +
    '<span class="seg">' + LANGS.map(l => '<button class="segb' + (l === getLang() ? ' on' : '') + '" data-act="lang" data-v="' + l + '">' + l.toUpperCase() + '</button>').join('') + '</span></div></div>';
}

// the edit panel under a block
// The week offered for a split: the one that was clicked on the cycle, else the selected week, else the middle.
function splitDefault(ed, from, first, last) {
  if (ed.week != null) return Math.min(last, Math.max(from, ed.week));
  if (state.week >= from && state.week <= last) return state.week;
  return Math.min(last, Math.max(from, first + Math.ceil((last - first + 1) / 2)));
}

// The week under a click on a cycle. A click from the keyboard has no position.
function weekAt(e, el, c) {
  const r = el.getBoundingClientRect(), n = c.to - c.from + 1;
  if (!e.detail || !(r.width > 0)) return null;
  return c.from + Math.min(n - 1, Math.max(0, Math.floor((e.clientX - r.left) / r.width * n)));
}

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
    const def = splitDefault(ed, from, m.from, m.to);
    let wopt = '';
    for (let w = from; w <= m.to; w++) wopt += '<option value="' + w + '"' + (w === def ? ' selected' : '') + '>' + tr('week {0}', w) + '</option>';
    return '<div class="pop" id="pop" data-anchor="meso' + ed.i + '">' +
      '<div class="pop-h"><span class="eyebrow">' + tr('Mesocycle') + '</span><span class="muted">' + tr('weeks {0}–{1}', m.from, m.to) + '</span><button class="x" data-act="pop-close" aria-label="' + tr('Close') + '">×</button></div>' +
      '<label class="fld"><span>' + tr('Name') + '</span><input type="text" data-plan="name" data-fid="pop-name" value="' + esc(m.name) + '"></label>' +
      '<div class="fld"><span>' + tr('Content') + '</span><div class="ztogs">' + cycles.CONTENT_ZONES.map(z => {
        const on = m.zones.includes(z);
        return '<button class="ztog mono" data-act="m-zone" data-v="' + z + '" aria-pressed="' + on + '"' + (on ? ' style="background:' + Z[z].bg + ';color:' + Z[z].fg + ';border-color:' + Z[z].bg + '"' : '') + '>' + z + '</button>';
      }).join('') + '</div></div>' +
      '<label class="fld"><span>' + tr('Load pattern') + '</span><select data-change="pat" data-fid="pop-pat">' + cycles.PATTERNS.map(p => '<option value="' + p + '"' + (p === m.pat ? ' selected' : '') + '>' + patternName(p) + '</option>').join('') + '</select></label>' +
      '<div class="pop-acts"><div class="pop-r"><button class="b" data-act="m-left"' + can(() => cycles.moveMeso(plan, ed.i, -1, ended, data.season.start)) + '>◀ ' + tr('Move earlier') + '</button>' +
      '<button class="b" data-act="m-right"' + can(() => cycles.moveMeso(plan, ed.i, 1, ended, data.season.start)) + '>' + tr('Move later') + ' ▶</button></div>' +
      (wopt ? '<div class="pop-r"><button class="b" data-act="m-split">' + tr('Split') + '</button><label class="inline"><span>' + tr('new block from') + '</span><select id="splitw" data-change="splitw">' + wopt + '</select></label></div>' : '') +
      '<div class="pop-r"><button class="b" data-act="m-newmacro"' + can(() => cycles.newMacro(plan, ed.i, ended)) + '>' + tr('Start new macrocycle here') + '</button>' +
      '<button class="b danger" data-act="m-del"' + can(() => cycles.deleteMeso(plan, ed.i, ended)) + '>' + tr('Delete') + '</button></div></div></div>';
  }
  const mc = sh.macros[ed.i];
  if (!mc) return '';
  // a new macrocycle can start at any week of this one that has not ended
  const mfrom = Math.max(mc.from + 1, ended + 1);
  const mdef = splitDefault(ed, mfrom, mc.from, mc.to);
  let mopt = '';
  for (let w = mfrom; w <= mc.to; w++) mopt += '<option value="' + w + '"' + (w === mdef ? ' selected' : '') + '>' + tr('week {0}', w) + '</option>';
  return '<div class="pop" id="pop" data-anchor="macro' + ed.i + '">' +
    '<div class="pop-h"><span class="eyebrow">' + tr('Macrocycle') + '</span><span class="muted">' + tr('weeks {0}–{1}', mc.from, mc.to) + '</span><button class="x" data-act="pop-close" aria-label="' + tr('Close') + '">×</button></div>' +
    '<label class="fld"><span>' + tr('Name') + '</span><input type="text" data-plan="mname" data-fid="pop-name" value="' + esc(mc.name) + '"></label>' +
    '<div class="pop-acts">' + (mopt ? '<div class="pop-r"><button class="b" data-act="mac-split">' + tr('Split') + '</button><label class="inline"><span>' + tr('new macrocycle from') + '</span><select id="splitw" data-change="splitw">' + mopt + '</select></label></div>' : '') +
    '<div class="pop-r"><button class="b danger" data-act="mac-merge"' + can(() => cycles.mergeMacro(plan, ed.i, ended)) + '>' + tr('Merge into previous') + '</button></div></div></div>';
}

// ---- drawing: the races and events table -----------------------------------------

function eventsView() {
  const today = now(), plans = data.plans;
  const options = (list, names, value) => list.map(v => '<option value="' + v + '"' + (v === value ? ' selected' : '') + '>' + names(v) + '</option>').join('');
  const rows = sortEvents(data.events).map(raw => {
    const e = eventView(data, raw, today), id = e.uid, race = e.kind === 'race';
    const f = name => ' data-ev="' + id + '" data-f="' + name + '" data-fid="ev-' + id + '-' + name + '"';
    return '<tr' + (id === state.event ? ' class="on"' : '') + ' data-row="' + id + '">' +
      '<td><input type="date"' + f('date') + ' value="' + e.date + '"' + (e.unconfirmedPast ? ' class="flag"' : '') + '></td>' +
      '<td><input type="date"' + f('until') + ' value="' + (e.until || '') + '"></td>' +
      '<td class="c"><input type="checkbox"' + f('confirmed') + (e.confirmed ? ' checked' : '') + ' aria-label="' + tr('Date confirmed') + '"></td>' +
      '<td class="name"><input type="text"' + f('name') + ' value="' + esc(e.name) + '" title="' + esc(e.name) + '"></td>' +
      '<td class="place"><input type="text"' + f('place') + ' value="' + esc(e.place) + '"></td>' +
      '<td class="sel"><select' + f('kind') + '>' + options(KINDS, kindName, e.kind) + '</select></td>' +
      '<td class="sel">' + (race ? '<select' + f('type') + '>' + options(RACE_TYPES, raceTypeName, e.type) + '</select>' : '') + '</td>' +
      '<td class="sel">' + (race ? '<select' + f('boats') + '>' + options(BOATS, boatName, e.boats) + '</select>' : '') + '</td>' +
      plans.map(p => {
        if (!race) return '<td class="c"><input type="checkbox"' + f('plan:' + p.id) + (e.plans === null || p.id in e.plans ? ' checked' : '') + ' aria-label="' + esc(p.name) + '"></td>';
        const v = p.id in e.plans ? String(e.plans[p.id]) : '';
        return '<td><select class="mono"' + f('plan:' + p.id) + ' aria-label="' + tr('{0} importance', esc(p.name)) + '">' + ['', '1', '2', '3'].map(x => '<option value="' + x + '"' + (x === v ? ' selected' : '') + '>' + (x || '–') + '</option>').join('') + '</select></td>';
      }).join('') +
      '<td><button class="b danger" data-act="ev-del" data-v="' + id + '">' + tr('Delete') + '</button></td></tr>';
  }).join('');
  // the season across the top, as on the plan's sheet: one row of races and events for each plan
  const sheets = plans.map(p => sheet(data, p.id, today));
  const strip = '<div class="panel sx" data-scroll="sheet" style="margin:12px 16px 0;flex-shrink:0"><div class="sheet" style="width:' + (LAB + data.season.weeks * CW + 8) + 'px">' +
    calendarRows(sheets[0].weeks) +
    sheets.map((sh, i) => '<div class="row" data-races="' + plans[i].id + '">' + lab('<span class="cut" title="' + esc(plans[i].name) + '">' + esc(plans[i].name) + '</span>', 24) + sh.weeks.map(raceCell).join('') + '</div>').join('') +
    '</div></div>';
  return strip + '<div class="panel sx events"><table><thead><tr>' + [tr('Date'), tr('Until'), tr('Confirmed'), tr('Name'), tr('Place'), tr('Kind'), tr('Race type'), tr('Boats')].map(h => '<th>' + h + '</th>').join('') +
    plans.map(p => '<th>' + esc(p.name) + '</th>').join('') + '<th></th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="foot"><button class="b" data-act="ev-add">' + tr('Add event') + '</button></div></div>';
}

// ---- drawing: everything -----------------------------------------------------------

// ---- the zone cards: hovering or focusing a zone name in the grid opens its card; a click keeps it
// open, so that it can be scrolled and read, until a click elsewhere or Escape -----------

const tipEl = document.getElementById('tip');
let pinned = null;   // the card that was clicked open: a zone, or "types"
function hideTip() { tipEl.hidden = true; }
function unpin() { pinned = null; tipEl.classList.remove('pinned'); hideTip(); }
function showTip(el) {
  const card = !data ? null : el.dataset.tip === 'types' ? typesCard(data.tables) : zoneCard(el.dataset.tip, data.tables);
  if (!card) return;
  tipEl.innerHTML = (card.zone ? '<h4><i style="background:' + Z[card.zone].bg + '"></i>' + card.zone + ' · ' + esc(card.name) + '</h4><p>' + esc(card.what) + '</p>' : '<h4>' + esc(card.name) + '</h4>') + '<dl>' +
    card.rows.map(([label, v]) => '<dt>' + esc(label) + '</dt><dd>' + (Array.isArray(v) ? '<ul>' + v.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : esc(v)) + '</dd>').join('') +
    '</dl>';
  tipEl.hidden = false;
  const r = el.getBoundingClientRect();
  tipEl.style.left = (r.right + 8) + 'px';
  tipEl.style.top = Math.max(8, Math.min(r.top - 12, window.innerHeight - tipEl.offsetHeight - 8)) + 'px';
}
// ---- the events view: the entry under the pointer is marked in the rows of races above -----------

let pointed = null;
function markPointed() {
  for (const c of document.querySelectorAll('.racecell.hov')) c.classList.remove('hov');
  if (!pointed) return;
  for (const c of document.querySelectorAll('.racecell[data-evs~="' + pointed + '"]')) c.classList.add('hov');
}
document.addEventListener('mouseover', e => {
  const row = e.target.closest ? e.target.closest('tr[data-row]') : null, id = row ? row.dataset.row : null;
  if (id !== pointed) { pointed = id; markPointed(); }
});

const tipTarget = e => e.target.closest ? e.target.closest('[data-tip]') : null;
document.addEventListener('mouseover', e => { const t = tipTarget(e); if (t && !pinned) showTip(t); });
document.addEventListener('mouseout', e => { const t = tipTarget(e); if (t && !pinned && !(e.relatedTarget && t.contains(e.relatedTarget))) hideTip(); });
document.addEventListener('focusin', e => { const t = tipTarget(e); if (t && !pinned) showTip(t); });
document.addEventListener('focusout', e => { if (tipTarget(e) && !pinned) hideTip(); });
document.addEventListener('click', e => {
  const t = tipTarget(e);
  if (t && t.dataset.tip !== pinned) { pinned = t.dataset.tip; tipEl.classList.add('pinned'); showTip(t); tipEl.scrollTop = 0; }
  else if (pinned && !(e.target.closest && e.target.closest('#tip'))) unpin();
});

function render() {
  const root = document.getElementById('root');
  if (signin) { drawSignin(); return; }
  if (!data) return;
  if (!pinned) hideTip();
  // remember what is focused and how far the sheet is scrolled, to put both back
  const a = document.activeElement, fid = a && a.dataset ? a.dataset.fid : null;
  const held = fid ? { value: a.value, from: a.selectionStart, to: a.selectionEnd, top: a.scrollTop } : null;
  const scroll = {};
  for (const el of root.querySelectorAll('[data-scroll]')) scroll[el.dataset.scroll] = el.scrollLeft;
  const was = document.getElementById('app'), down = was ? was.scrollTop : 0;

  if (usable(data) && phone()) {
    ctx = null;
    state.problems = false;
    root.innerHTML = phoneView();
    writeHash();
    return;
  }
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
  ctx = { today, plan, sh, wk, session: mine.find(s => sessionKey(s) === state.sel) || mine[0] || null, km: kmView(data, plan.id, state.band, today), grid: gridView(data, plan.id, state.band, today), checks: checksView(data, plan.id, state.band, today) };
  // a session with no work written yet is offered suggestions; words typed in it narrow them
  const sn = ctx.session;
  ctx.sug = null;
  if (sn && !sn.main && !sn.unzoned) {
    const r = suggestions(data, plan.id, state.band, sn.date, sn.slot, today, { place: sn.place, query: sn.text, zone: sn.text.trim() ? null : state.zone });
    if (r.list.length || !sn.text.trim()) ctx.sug = { ...r, typed: !!sn.text.trim() };
  }
  root.innerHTML = header() + '<div id="app">' + (state.view === 'events' ? eventsView() : sheetView()) + '</div>' + popover() + problemsPanel();

  // the page stays scrolled where it was
  const app = document.getElementById('app');
  if (app && down) app.scrollTop = down;

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
  // on a phone the session is under the week: bring it into view when one is picked
  if (toSession && window.innerWidth <= 760) { const el = root.querySelector('.lower .right'); if (el) el.scrollIntoView({ block: 'start' }); }
  toSession = false;
  markPointed();
  // a card that was clicked open stays open across a redraw
  if (pinned) { const el = root.querySelector('[data-tip="' + pinned + '"]'); if (el) showTip(el); else unpin(); }
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
        ed.week = null;
      });
    } else if (act === 'm-split') {
      const sel = document.getElementById('splitw');
      change([f.cycles], () => { setPlan(cycles.splitMeso(plan, i, sel ? +sel.value : 0, ended)); ed.i = i + 1; ed.week = null; });
    } else if (act === 'm-del') {
      change([f.cycles], () => { setPlan(cycles.deleteMeso(plan, i, ended)); state.edit = null; });
    } else if (act === 'm-newmacro') {
      change([f.cycles], () => setPlan(cycles.newMacro(plan, i, ended)));
    }
  } else if (act === 'mac-split') {
    const sel = document.getElementById('splitw');
    change([f.cycles], () => { setPlan(cycles.splitMacro(plan, i, sel ? +sel.value : 0, ended)); ed.i = i + 1; ed.week = null; });
  } else if (act === 'mac-merge') {
    change([f.cycles], () => { setPlan(cycles.mergeMacro(plan, i, ended)); ed.i = i - 1; ed.week = null; });
  }
}

document.addEventListener('click', e => {
  const gh = e.target.closest('[data-act^="gh-"]');
  if (gh) {
    if (gh.dataset.act === 'gh-open') openAccount();
    else if (gh.dataset.act === 'gh-copy') copyLink();
    else { signin = null; render(); }
    return;
  }
  if (!data || signin) return;
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
  if (act === 'account') signin = { message: '' };
  else if (act === 'problems') state.problems = !state.problems;
  else if (act === 'pop-close') { state.edit = null; state.problems = false; }
  else if (act === 'view') { state.view = v; state.edit = null; state.event = null; reveal = true; }
  else if (act === 'grid') state.grid = v;
  // the words change at once; the files are read again so that their problems are in the new language too
  else if (act === 'lang') { useLang(v, true); render(); reload(); return; }
  else if (act === 'day') state.day = v || null;
  else if (act === 'full') { state.full = true; settle(); reveal = true; }
  else if (!ctx) { /* the rest needs a plan on screen */ }
  else if (act === 'today') { state.week = weekOf(data.season, now()); state.view = 'sheet'; state.sel = null; reveal = true; }
  else if (act === 'plan') { state.plan = v; state.band = null; state.sel = null; state.edit = null; settle(); }
  else if (act === 'band') { state.band = v; state.sel = null; }
  else if (act === 'week' || act === 'prev' || act === 'next') {
    const n = act === 'week' ? +v : state.week + (act === 'prev' ? -1 : 1);
    if (n !== state.week && n >= 1 && n <= data.season.weeks) { state.week = n; state.sel = null; reveal = true; }
  }
  else if (act === 'pick') { state.sel = v; state.zone = null; toSession = true; }
  else if (act === 'sug-zone') state.zone = state.zone === v ? null : v;
  else if (act === 'sug') {
    // the suggestion's text goes into the session, to be changed there like any other
    const x = ctx.sug && ctx.sug.list[+v], sn = ctx.session;
    if (x && sn) {
      state.zone = null;
      change([planFiles(ctx.plan.id).sessions], () => setPlan(edits.putSession(ctx.plan, { ...sn, text: x.text, place: x.place, notes: sn.notes || x.notes })));
      const ta = document.querySelector('[data-fid="s-text"]');
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }
    return;
  }
  else if (act === 'edit-meso') { state.edit = { kind: 'meso', i: +v, week: weekAt(e, t, ctx.sh.mesos[+v]) }; state.problems = false; }
  else if (act === 'edit-macro') { state.edit = { kind: 'macro', i: +v, week: weekAt(e, t, ctx.sh.macros[+v]) }; state.problems = false; }
  else if (/^m-|^mac-/.test(act)) { planAct(act, v); return; }
  else if (act === 'add') {
    const s = { date: t.dataset.date, slot: v, band: state.band, place: 'water', text: '', notes: '' };
    state.sel = sessionKey(s);
    state.zone = null;
    toSession = true;
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
  if (c === 'splitw' && state.edit) state.edit.week = +el.value;
  else if (c === 'type') change([f.weeks], () => setPlan(edits.setWeek(ctx.plan, ctx.wk.monday, el.value || null, null, data.tables)));
  else if (c === 'pat' && state.edit) change([f.cycles], () => setPlan(cycles.setMeso(ctx.plan, state.edit.i, { pat: el.value })));
  else if (c === 'notdone' && ctx.session) change([f.sessions], () => setPlan(edits.putSession(ctx.plan, { ...ctx.session, notDone: el.checked })));
  else if (c === 'place' && ctx.session) change([f.sessions], () => setPlan(edits.putSession(ctx.plan, { ...ctx.session, place: el.value })));
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
  if (e.key === 'Enter' && e.target.dataset && /^(repo|dir|token)$/.test(e.target.dataset.gh || '')) { openAccount(); return; }
  if (e.key === 'Escape' && pinned) unpin();
  if (e.key === 'Escape' && (state.edit || state.problems)) { state.edit = null; state.problems = false; render(); }
  // the arrows go from the plan text into the suggestions and along them
  const row = e.target.closest ? e.target.closest('.sug-r') : null, inText = e.target.dataset && e.target.dataset.input === 'text';
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (row || (inText && ctx && ctx.sug))) {
    const rows = [...document.querySelectorAll('.sug-r')], i = rows.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1);
    const to = i < 0 ? document.querySelector('[data-fid="s-text"]') : rows[i];
    if (to && (row || e.key === 'ArrowDown')) { e.preventDefault(); to.focus(); }
  }
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

useLang(firstLang(), false);
readHash();
if (hosted) readAccount();
reload();
// GitHub is asked less often than the local server
setInterval(poll, hosted ? (account && account.every) || 20000 : 2000);
