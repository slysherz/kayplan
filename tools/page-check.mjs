// Checks the page in headless Firefox: clicks, types and drags as the coach would, and after each
// step looks at both the screen and the files that were saved.
//
//   node tools/page-check.mjs        (about two minutes; needs firefox)
//
// It works on a copy of test/page-season in a temporary folder, with its own server, and never
// touches season/. The page runs as of 2 Oct 2026 (?asof=), so the result does not depend on the day.
// Screenshots are left in the temporary folder, whose path is printed at the end: look at them.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { firefox } from './firefox.mjs';
import { createServer } from '../serve.js';
import { diskStore } from '../src/store-disk.js';
import { load, check } from '../src/engine.js';

const FIXTURE = fileURLToPath(new URL('../test/page-season/', import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kayplan-page-'));
const DIR = path.join(TMP, 'season');
const TODAY = '2026-10-02';   // a Friday, in week 1

const file = p => fs.readFileSync(path.join(DIR, p), 'utf8');
const put = (p, text) => fs.writeFileSync(path.join(DIR, p), text);
function fresh() {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.cpSync(FIXTURE, DIR, { recursive: true });
}

fresh();
let server = createServer(DIR);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port, BASE = 'http://127.0.0.1:' + PORT + '/';
const ff = await firefox(path.join(TMP, 'profile'));

const text = sel => ff.js('const e = document.querySelector(arguments[0]); return e ? e.textContent : null;', sel);
const value = sel => ff.js('return document.querySelector(arguments[0]).value', sel);
const count = sel => ff.js('return document.querySelectorAll(arguments[0]).length', sel);
const status = () => text('#status');
// choose in a select, or tick a checkbox, the way a click would
const choose = (sel, v) => ff.js('const s = document.querySelector(arguments[0]); if (s.type === "checkbox") s.checked = arguments[1]; else s.value = arguments[1]; s.dispatchEvent(new Event("change", { bubbles: true }));', sel, v);
const selectAll = sel => ff.js('document.querySelector(arguments[0]).select()', sel);
// typing is saved after a pause; wait until nothing is waiting to be saved
const saved = async () => { await ff.sleep(900); await ff.wait('return !document.querySelector("#status .muted")'); };
const shot = name => ff.shot(path.join(TMP, name + '.png'));
async function open(hash, asof = TODAY, lang = '') {
  // through a blank page, because going to the same address with another #part does not reload
  await ff.nav('about:blank');
  await ff.nav(BASE + '?asof=' + asof + (lang ? '&lang=' + lang : '') + '#' + hash);
  await ff.js('window.__errs = []; window.addEventListener("error", e => __errs.push(String(e.message))); window.addEventListener("unhandledrejection", e => __errs.push("rejection: " + String(e.reason)));');
  await ff.wait('return !!document.querySelector(".sheet")');
}

let step = 0, failed = false;
const ok = name => console.log('ok ' + (++step) + ' ' + name);

try {
  // ================= weeks and sessions =================
  await open('plan=juniors');
  await shot('01-sheet');
  assert.match(await text('.lower .sec-h b'), /Week 1/);
  assert.equal(await text('.cell.now'), '28');
  assert.equal(await text('.day.now .day-h b'), 'Fri');
  assert.equal(await ff.js('return [...document.querySelectorAll(".sty")].slice(0, 9).map(b => b.textContent).join(" ")'), 'I C R CH R C C CH R');
  assert.equal(await count('.sty.hand'), 1);
  // km, checked by hand: week 1 has 6 + 7.87 + 4 km of sessions (the one marked not done is left out);
  // its estimate is 2220 x 0.6 / 22.95, the sum of load x content over the season
  assert.equal(await text('[data-id=week-km]'), '18 of 58 km');
  assert.equal(await text('.cap[data-v="1"]'), '58');
  assert.match(await ff.js('return document.querySelector(".cap[data-v=\\"1\\"]").title'), /estimate 58\.0 km \(load 60% × content 1\.00\), sessions 17\.9 km \(31%\)/);
  assert.match(await ff.js('return document.querySelector(".cap[data-v=\\"30\\"]").title'), /not planned yet: an average week/);
  assert.equal(await text('.capsum'), '18 / 2220');
  assert.match(await ff.js('return document.querySelector(".capsum").title'), /6\.0 km done, 11\.9 km planned, of 2220 km a year/);
  ok('opens on the current week; today is marked; types follow the patterns, the hand-set one is marked; km row');

  // the capacity grid: always a row for each zone
  assert.deepEqual(await ff.js('return [...document.querySelectorAll(".zlab")].map(b => b.dataset.tip)'), ['R1', 'R2', 'R3', 'R3+', 'R4', 'R5', 'R6', 'R7']);
  assert.deepEqual(await ff.js('return [...document.querySelectorAll(".zlab.off")].map(b => b.dataset.tip)'), ['R4']);   // juniors: every zone but R4
  const cell = (zone, week) => '.zlab[data-tip="' + zone + '"] ~ .cap[data-v="' + week + '"]';
  assert.equal(await text(cell('R1', 1)), '1');
  assert.equal(await ff.js('return document.querySelector(arguments[0]).className', cell('R1', 1)), 'cap mono low cur');
  assert.match(await ff.js('return document.querySelector(arguments[0]).title', cell('R1', 1)), /1 session of R1: below maintenance \(develop 4–6, maintain 3\)/);
  assert.equal(await text(cell('R3', 1)), '·');
  await ff.click('.segb[data-v="km"]');
  assert.equal(await text(cell('R1', 1)), '8');
  // in km, a zone's season sum stands next to the course's km a year in that zone
  assert.equal(await text('.zlab[data-tip="R2"] ~ .capsum'), '6 / 961');
  assert.equal(await text('.zlab[data-tip="R4"] ~ .capsum'), '0');
  assert.equal(await ff.js('return document.querySelector(".zlab[data-tip=\\"R2\\"] ~ .capsum").title'), "R2: 5.9 km from this season's sessions, 961 km a year in the course's table");
  await ff.click('.segb[data-v="sessions"]');
  assert.equal(await text('.zlab[data-tip="R2"] ~ .capsum'), '1');
  // the zone card opens when the zone name gets the focus
  await ff.js('document.querySelector(".zlab[data-tip=\\"R3+\\"]").focus()');
  assert.equal(await ff.js('return document.getElementById("tip").hidden'), false);
  assert.match(await text('#tip'), /R3\+ · Aerobic power[^]*Develop: 2–3 sessions\. Maintain: 1\. Counted together with R3\./);
  await shot('01-zone-card');
  await ff.js('document.activeElement.blur()');
  assert.equal(await ff.js('return document.getElementById("tip").hidden'), true);
  // a click keeps the card open, so it can be scrolled; Escape or a click elsewhere closes it
  await ff.js('document.activeElement.blur()');
  assert.equal(await ff.js('return document.getElementById("tip").hidden'), true);
  await ff.click('.zlab[data-tip="R2"]');
  await ff.hover('.tab');
  assert.match(await text('#tip'), /R2 · Aerobic glycolytic[^]*How to train[^]*Per week[^]*In a session[^]*In the season[^]*Resisted[^]*Km a year[^]*junior 961/);
  assert.doesNotMatch(await text('#tip'), /slide|course|Model sessions/i);
  assert.equal(await ff.js('const t = document.getElementById("tip"); return !t.hidden && t.classList.contains("pinned") && t.getBoundingClientRect().bottom <= window.innerHeight'), true);
  await shot('01-zone-card-open');
  await ff.keys(ff.ESCAPE);
  assert.equal(await ff.js('return document.getElementById("tip").hidden'), true);
  await ff.click('.zlab[data-tip="R7"]');
  assert.match(await text('#tip'), /R7 · Competition pace[^]*Kinds of work[^]*Simulation series/);
  await ff.click('.brand');
  assert.equal(await ff.js('return document.getElementById("tip").hidden'), true);
  ok('capacity grid: rows, counts, sessions and km modes, zone card');

  await ff.click('.swk[data-v="3"]');
  assert.match(await text('.lower .sec-h b'), /Week 3/);
  assert.equal(await value('[data-fid=w-type]'), 'R');
  assert.equal(await value('[data-fid=w-load]'), '50');
  await choose('[data-fid=w-type]', 'CH');
  await saved();
  assert.equal(file('plans/juniors/weeks.txt'), '2026-10-12 CH\n');
  await ff.click('[data-fid=w-load]');
  await selectAll('[data-fid=w-load]');
  await ff.keys('85');
  await saved();
  assert.equal(file('plans/juniors/weeks.txt'), '2026-10-12 CH 85\n');
  assert.equal(await value('[data-fid=w-load]'), '85');
  await choose('[data-fid=w-type]', '');
  await saved();
  assert.equal(file('plans/juniors/weeks.txt'), '');
  assert.equal(await text('.sty[data-v="3"]'), 'C');
  ok('week type and load set by hand are saved; back to the pattern removes them');

  await ff.click('.day:nth-child(2) .add[data-v="pm"]');
  await ff.keys("1km R1 + 8x 4' R2/1' R0 + 1km R1");
  assert.equal(await text('.zpill'), 'R2');
  assert.match(await text('.inf small'), /R2 ≈ 32' · R1 ≈ 13' · R0 ≈ 8' · ≈ 7\.9 km/);
  assert.equal(await text('.inf .other'), "1km R1 ≈ 6'19'' · 4' R2 ≈ 730 m · 1' R0 ≈ 120 m");
  assert.equal(await text('[data-id=week-km]'), '8 of 76 km');
  assert.equal(await text('.cap[data-v="3"]'), '76');
  await saved();
  assert.match(file('plans/juniors/sessions.txt'), /^2026-10-13 pm junior: 1km R1 \+ 8x 4' R2\/1' R0 \+ 1km R1$/m);
  await ff.click('[data-fid=s-notes]');
  await ff.keys('first line' + ff.ENTER + 'second  line ');
  await saved();
  await ff.sleep(2500);   // long enough for the page to notice its own save and reload
  assert.equal(await value('[data-fid=s-notes]'), 'first line\nsecond  line ');
  assert.equal(await ff.js('return document.activeElement.dataset.fid'), 's-notes');
  assert.match(file('plans/juniors/sessions.txt'), /R0 \+ 1km R1\n  first line\n  second  line\n/);
  ok('a new session: the main zone follows the text; plan and notes are saved; focus and typing survive a reload');

  await ff.click('[data-fid=s-text]');
  await ff.keys(ff.END + ff.ENTER + ' + 4x 10');
  assert.equal(await value('[data-fid=s-text]'), "1km R1 + 8x 4' R2/1' R0 + 1km R1 + 4x 10");
  await ff.keys("'' R6/2'");
  await saved();
  assert.match(file('plans/juniors/sessions.txt'), /1km R1 \+ 4x 10'' R6\/2'$/m);
  ok('spaces can be typed at the end of the plan; Enter does nothing there');

  await choose('[data-fid=s-place]', 'pool');
  await saved();
  assert.match(file('plans/juniors/sessions.txt'), /^2026-10-13 pm junior pool: 1km R1 /m);
  assert.equal(await text('.zpill'), 'R2');
  assert.match(await text('.chip.on .chip-h'), /PM · R2 · pool/);
  assert.equal(await text('[data-id=week-km]'), "0 of 76 km · 41' off the water");
  assert.equal(await count('.inf .other'), 0);
  await shot('02-pool');
  await choose('[data-fid=s-place]', 'water');
  await saved();
  assert.match(file('plans/juniors/sessions.txt'), /^2026-10-13 pm junior: 1km R1 /m);
  ok('a session in the pool: no km, minutes off the water, the main zone still worked out');

  await ff.click('[data-fid=s-notdone]');
  await saved();
  assert.match(file('plans/juniors/sessions.txt'), /^2026-10-13 pm junior not-done: /m);
  assert.match(await text('[data-id=week-km]'), /^0 of 76 km$/);
  assert.match(await text('.chip.on .chip-h'), /not done/);
  await shot('02-session');
  await ff.click('.del');
  await saved();
  assert.doesNotMatch(file('plans/juniors/sessions.txt'), /2026-10-13/);
  ok('not done, and delete');

  // ================= cycles =================
  await ff.click('.meso[data-v="1"]');
  await shot('03-edit-panel');
  assert.equal(await value('[data-fid=pop-name]'), 'General II');
  await ff.click('[data-fid=pop-name]');
  await selectAll('[data-fid=pop-name]');
  await ff.keys('Base two');
  await ff.click('.ztog[data-v="R3"]');
  await choose('[data-fid=pop-pat]', 'restart');
  await saved();
  assert.match(file('plans/juniors/cycles.txt'), /^ +4 restart +R2-R3 +Base two$/m);
  assert.equal(await text('.sty[data-v="6"]'), 'R');
  ok('edit panel: name, contents and load pattern');

  await choose('#splitw', '8');
  await ff.click('[data-act=m-split]');
  await saved();
  assert.match(file('plans/juniors/cycles.txt'), /^ +2 restart +R2-R3 +Base two\n +2 restart +R2-R3 +New block$/m);
  assert.equal(await value('[data-fid=pop-name]'), 'New block');
  await ff.click('[data-act=m-newmacro]');
  await saved();
  assert.match(file('plans/juniors/cycles.txt'), /Base two\nNew macrocycle\n +2 restart +R2-R3 +New block/);
  await ff.click('[data-act=pop-close]');
  await ff.click('.macro[data-v="1"]');
  await ff.click('[data-act=mac-merge]');
  await saved();
  assert.doesNotMatch(file('plans/juniors/cycles.txt'), /New macrocycle/);
  ok('split, start a new macrocycle, merge it back');

  await ff.click('.meso[data-v="0"]');
  await ff.click('[data-act=m-right]');
  await saved();
  assert.match(file('plans/juniors/cycles.txt'), /^Macrocycle I\n +2 restart +R2-R3 +Base two\n +5 intro +R1-R2 +General I\n/);
  assert.match(file('plans/juniors/sessions.txt'), /^2026-10-13 pm junior: 6km R1$/m);   // from 29 Sep, two weeks later
  assert.match(file('plans/juniors/sessions.txt'), /^2026-10-17 am senior: 3x 2000m R2$/m);
  assert.equal(file('plans/juniors/weeks.txt'), '');
  await ff.click('[data-act=m-left]');
  await saved();
  assert.match(file('plans/juniors/sessions.txt'), /^2026-09-29 pm junior: 6km R1$/m);
  await ff.click('[data-act=pop-close]');
  ok('move a block later and back: its sessions travel with it');

  await ff.click('.meso[data-v="2"]');
  await ff.click('[data-act=m-del]');
  await saved();
  assert.match(file('plans/juniors/cycles.txt'), /^ +4 restart +R2-R3 +Base two$/m);
  ok('delete a block: its weeks join the previous one');

  await ff.drag('.rel:nth-child(5) .hdl[data-drag="0"]', 52);
  await saved();
  assert.match(file('plans/juniors/cycles.txt'), /^ +7 intro +R1-R2 +General I\n +2 restart +R2-R3 +Base two$/m);
  await ff.drag('.rel:nth-child(5) .hdl[data-drag="0"]', 400);
  await saved();
  assert.match(file('plans/juniors/cycles.txt'), /^ +8 intro +R1-R2 +General I\n +1 restart +R2-R3 +Base two$/m);
  await ff.drag('.rel:nth-child(4) .hdl', -26);
  await saved();
  assert.match(file('plans/juniors/cycles.txt'), /^ +11 build +R3-R3\+ +Specific II\nMacrocycle II\n +21 none +- +Unplanned$/m);
  await shot('04-after-drag');
  ok('drag a boundary: whole weeks, stops at one week, a macrocycle boundary moves its mesocycle boundary');

  // ================= selectors and events =================
  fresh();
  await open('plan=juniors&week=23');
  assert.match(await text('.day:nth-child(6) .race'), /Campeonato Regional de Fundo Norte.*Fundo · Mixed · date not confirmed/);
  await ff.click('.pill[data-v="iniciados"]');
  assert.equal(await text('.pill.band.on'), 'iniciado');
  assert.equal(await count('.rc'), 7);
  // the zones the course's long-term table does not give this age are dimmed: Iniciados have R1 and R6
  assert.deepEqual(await ff.js('return [...document.querySelectorAll(".zlab.off")].map(b => b.dataset.tip)'), ['R2', 'R3', 'R3+', 'R4', 'R5', 'R7']);
  await shot('05-not-suggested');
  // a band with no yearly km has no estimates
  await ff.click('.pill.band[data-v="menor"]');
  assert.equal(await text('.cap[data-v="1"]'), '·');
  assert.equal(await text('.capsum'), '0');
  await ff.click('.pill[data-v="cadetes"]');
  assert.equal(await count('.pill.band'), 0);
  await ff.click('.pill[data-v="juniors"]');
  await ff.click('.pill.band[data-v="senior"]');
  await ff.click('.swk[data-v="1"]');
  assert.equal(await count('.chip'), 1);
  assert.match(await text('.chip .chip-t'), /3x 2000m R2/);
  await ff.click('.swk[data-v="30"]');
  await ff.click('[data-act=today]');
  assert.match(await text('.lower .sec-h b'), /Week 1/);
  ok('plan and band selectors; each plan sees its own races; a race is a banner on its day; Today');

  await ff.click('.racecell .rc');
  const row = '.events tr.on ';
  assert.equal(await value(row + '[data-f=name]'), 'Campeonato Regional de Fundo Norte');
  // the season across the top of the events view: a row of races for each plan, the chosen one marked
  assert.deepEqual(await ff.js('return [...document.querySelectorAll("[data-races]")].map(r => r.dataset.races + " " + r.querySelectorAll(".rc").length + " " + r.querySelectorAll(".racecell").length)'), ['cadetes 9 45', 'iniciados 7 45', 'juniors 9 45']);
  assert.equal(await count('.racecell.on'), 3);
  assert.equal(await count('.cell.now'), 1);
  await shot('05-events');
  // the entry under the pointer is ringed in the rows of the plans it is in, and stays so when the page is drawn again
  const ringed = () => ff.js('return [...document.querySelectorAll(".racecell.hov")].map(c => c.parentNode.dataset.races + " " + ([...c.parentNode.children].indexOf(c)))');
  await ff.hover('.events tbody tr:nth-child(4) td.place');   // Taça de Portugal de Regatas em Linha: week 29, not for Iniciados
  assert.deepEqual(await ringed(), ['cadetes 29', 'juniors 29']);
  await shot('05-events-hover');
  await ff.js('document.querySelector("[data-act=view][data-v=events]").click()');   // drawn again, the pointer has not moved
  assert.deepEqual(await ringed(), ['cadetes 29', 'juniors 29']);
  await ff.hover('.events thead th');
  assert.deepEqual(await ringed(), []);
  await ff.click('[data-races=juniors] .racecell:nth-child(26) .rc');
  assert.equal(await value(row + '[data-f=name]'), 'Campeonato Nacional de Fundo');
  assert.equal(await count('.racecell.on'), 3);
  await ff.click('[data-races=cadetes] .racecell:nth-child(24) .rc');
  assert.equal(await value(row + '[data-f=name]'), 'Campeonato Regional de Fundo Norte');
  await choose(row + '[data-f=confirmed]', true);
  await choose(row + '[data-f=boats]', 'solo');
  await choose(row + '[data-f="plan:juniors"]', '1');
  await choose(row + '[data-f="plan:iniciados"]', '');
  await choose(row + '[data-f=until]', '2027-03-07');
  await saved();
  assert.match(file('events.txt'), /^2027-03-06 Campeonato Regional de Fundo Norte\n  until: 2027-03-07\n  place: Marco de Canaveses\n  kind: race\n  type: fundo\n  boats: solo\n  plans: cadetes 2, juniors 1\n/);
  ok('a race code opens its entry; confirmed, boats, importance, plans and last day are saved');

  await ff.click(row + '[data-f=place]');
  await selectAll(row + '[data-f=place]');
  await ff.keys('Marco');
  await choose(row + '[data-f=date]', '0002-03-06');   // a year half typed
  await choose(row + '[data-f=date]', '2027-03-05');
  await saved();
  assert.match(file('events.txt'), /^2027-03-05 Campeonato Regional de Fundo Norte\n  until: 2027-03-07\n  place: Marco\n/);
  ok('place and date; a half-typed year is ignored');

  const n = await count('.events tbody tr');
  await ff.click('[data-act=ev-add]');
  assert.equal(await count('.events tbody tr'), n + 1);
  assert.equal(await ff.js('return document.activeElement.dataset.f'), 'name');
  await ff.keys('Christmas');
  await choose(row + '[data-f=kind]', 'holiday');
  assert.equal(await count(row + '[data-f=type]'), 0);
  await choose(row + '[data-f=date]', '2026-12-21');
  await choose(row + '[data-f=until]', '2027-01-03');
  await saved();
  assert.match(file('events.txt'), /^2026-12-21 Christmas\n  until: 2027-01-03\n  kind: holiday\n\n/);
  await choose(row + '[data-f="plan:cadetes"]', false);
  await saved();
  assert.match(file('events.txt'), /^2026-12-21 Christmas\n  until: 2027-01-03\n  kind: holiday\n  plans: iniciados, juniors\n/);
  await choose(row + '[data-f="plan:iniciados"]', false);
  await choose(row + '[data-f="plan:juniors"]', false);   // the last plan stays
  assert.match(await text('.msg'), /at least one plan/);
  assert.equal(await ff.js('return document.querySelector(arguments[0]).checked', row + '[data-f="plan:juniors"]'), true);
  await ff.click('[data-act=view][data-v=sheet]');
  assert.equal(await count('.msg'), 0);
  assert.equal(await text('.racecell:nth-child(14) .rc'), 'h');
  assert.equal(await text('.racecell:nth-child(15) .rc'), 'h');
  await ff.click('.swk[data-v="13"]');
  assert.equal(await count('.day .race'), 7);
  await shot('06-holiday');
  await ff.click('.racecell:nth-child(14) .rc');
  await ff.click(row + '[data-act=ev-del]');
  await saved();
  assert.doesNotMatch(file('events.txt'), /Christmas/);
  assert.equal(await count('.events tbody tr'), n);
  ok('add an event, make it a holiday for some plans, see it on the sheet and in the week, delete it');

  // ================= files changing outside the page =================
  await ff.click('[data-act=view][data-v=sheet]');
  await ff.click('.pill.band[data-v="junior"]');
  await ff.click('.swk[data-v="2"]');
  fs.appendFileSync(path.join(DIR, 'plans/juniors/sessions.txt'), "2026-10-06 pm junior: 8km R1 + 6x 10'' R6/2'\n");
  await ff.wait('return document.querySelectorAll(".chip").length === 1');
  assert.match(await text('.chip .chip-h'), /PM · R6/);
  ok('live reload: a session written to the file appears on the page');

  await ff.click('.chip');
  await ff.click('[data-fid=s-text]');
  put('plans/juniors/sessions.txt', file('plans/juniors/sessions.txt').replace('8km R1', '9km R1'));
  await ff.keys(' + 1km R0');
  await ff.wait('return /changed on disk/.test(document.getElementById("status").textContent)');
  await ff.wait('return /9km R1/.test(document.querySelector("[data-fid=s-text]").value)');
  assert.match(file('plans/juniors/sessions.txt'), /9km R1 \+ 6x 10'' R6\/2'\n$/);
  ok('a file that changed on disk is not overwritten by the page: the newer text is shown, with a message');

  fs.appendFileSync(path.join(DIR, 'plans/juniors/sessions.txt'), 'next tuesday: something\n');
  await ff.wait('return /1 problem/.test(document.getElementById("status").textContent)');
  await ff.click('.day:nth-child(5) .add[data-v="am"]');
  assert.match(await text('.pop.problems'), /plans\/juniors\/sessions.txt:\d+ · a session is written/);
  await shot('07-problems');
  await ff.sleep(1200);
  assert.match(file('plans/juniors/sessions.txt'), /next tuesday: something\n$/);
  await choose('[data-fid=w-type]', 'R');
  await saved();
  assert.equal(file('plans/juniors/weeks.txt'), '2026-10-05 R\n2026-10-12 R\n');
  await ff.click('.swk[data-v="2"]');
  assert.equal(await count('.msg'), 0);
  put('plans/juniors/sessions.txt', file('plans/juniors/sessions.txt').replace('next tuesday: something\n', ''));
  await ff.wait('return !/problem/.test(document.getElementById("status").textContent)');
  ok('a line that cannot be read: shown as a problem, the file is not saved over, other files still save');

  // ================= the capacity grid, with the course's counts =================
  fresh();
  put('plans/juniors/sessions.txt', [
    "2026-10-05 pm junior: 2km R1 + 8x 4' R2/1' R0",            // week 2: three R2 sessions
    "2026-10-06 pm junior: 2km R1 + 3x 2000m R2/3'",
    "2026-10-08 pm junior pool: 10' R1 + 3x 10' R2/3'",          // one of them in the pool
    "2026-10-10 am junior: 2km R1 + 4x 4' R3/4' R1",            // one R3 and one R3+
    "2026-10-11 am junior: 2km R1 + 5x 3' R3+/3' R1",
    "2026-10-13 pm junior: 2km R1 + 8x 4' R2/1' R0",            // week 3: two R2, one R6
    "2026-10-15 pm junior: 2km R1 + 3x 2000m R2/3'",
    "2026-10-17 am junior: 20' R1 + 6x 10'' R6/2' + 10' R1",
    "2026-10-18 am junior not-done: 2km R1 + 8x 4' R2/1' R0"     // not done: not counted
  ].join('\n') + '\n');
  await open('plan=juniors&week=2');
  const g = (zone, week) => ff.js('const c = document.querySelector(arguments[0]); return c.textContent + " " + c.className.replace(/cap mono ?| ?cur/g, "")', '.zlab[data-tip="' + zone + '"] ~ .cap[data-v="' + week + '"]');
  assert.deepEqual([await g('R2', 2), await g('R3', 2), await g('R3+', 2)], ['3 dev', '1 dev', '1 dev']);   // 3 of R2; R3 and R3+ make 2 together
  assert.deepEqual([await g('R2', 3), await g('R6', 3), await g('R1', 3)], ['2 mnt', '1 mnt', '· ']);
  assert.match(await ff.js('return document.querySelector(arguments[0]).title', '.zlab[data-tip="R3"] ~ .cap[data-v="2"]'), /1 session of R3, 2 of R3-R3\+ together: developing \(develop 2–3, maintain 1\)/);
  await shot('05-grid');
  await ff.click('.segb[data-v="km"]');
  assert.deepEqual([await g('R2', 2), await g('R3+', 2)], ['12 tg', '3 tg']);   // 5.87 + 6 km of R2 on the water, none from the pool
  await shot('05-grid-km');
  ok('capacity grid: developing and maintaining by the course counts; R3 and R3+ together; the pool counts as a session, not as km');

  // ================= the past is locked =================
  fresh();
  await open('plan=juniors', '2026-11-18');   // week 8: weeks 1 to 7 have ended
  assert.match(await text('.lower .sec-h b'), /Week 8/);
  assert.equal(await text('.cell.now'), '16');
  assert.deepEqual(await ff.js('return [...document.querySelectorAll(".rel:nth-child(5) .hdl")].map(h => +h.dataset.drag)'), [1, 2, 3]);
  await ff.click('.meso[data-v="0"]');
  assert.deepEqual(await ff.js('return [...document.querySelectorAll(".pop .b")].filter(b => b.disabled).map(b => b.dataset.act)'), ['m-left', 'm-right', 'm-newmacro', 'm-del']);
  assert.equal(await count('#splitw'), 0);
  await shot('08-past');
  await ff.click('[data-act=pop-close]');
  await ff.click('.meso[data-v="1"]');   // weeks 6 to 9: only weeks 8 and 9 can start a new block
  assert.deepEqual(await ff.js('return [...document.getElementById("splitw").options].map(o => o.value)'), ['8', '9']);
  await ff.click('[data-act=pop-close]');
  await ff.drag('.rel:nth-child(5) .hdl[data-drag="1"]', -130);   // towards the past: stops at the end of week 7
  await saved();
  assert.match(file('plans/juniors/cycles.txt'), /^ +5 intro +R1-R2 +General I\n +2 build +R2 +General II\n +6 build +R3 +Specific I$/m);
  ok('weeks that have ended: their boundaries have no handle, blocks cannot move, a drag stops at the past');

  // ================= a season as the coach first sees it =================
  fresh();
  fs.rmSync(path.join(DIR, 'plans/cadetes/sessions.txt'));   // a file that does not exist yet
  await ff.js('localStorage.clear()');
  await open('');
  assert.equal(await text('.pill.on'), 'Cadetes');
  assert.match(await text('.lower .sec-h b'), /Week 1/);
  assert.equal(await status(), '');
  assert.equal(await ff.js('return document.querySelector("[data-fid=w-load]").disabled'), true);
  // the grid is there before anything is planned
  assert.equal(await count('.zlab'), 8);
  assert.equal(await count('.lab .segb'), 2);
  await shot('09-unplanned');
  await ff.click('.meso[data-v="0"]');
  await choose('#splitw', '6');
  await ff.click('[data-act=m-split]');
  await ff.click('[data-act=pop-close]');
  await ff.click('.meso[data-v="0"]');
  await ff.click('[data-fid=pop-name]');
  await selectAll('[data-fid=pop-name]');
  await ff.keys('General I');
  await ff.click('.ztog[data-v="R1"]');
  await ff.click('.ztog[data-v="R2"]');
  await choose('[data-fid=pop-pat]', 'intro');
  await saved();
  assert.equal(file('plans/cadetes/cycles.txt'), 'Macrocycle I\n   5 intro  R1-R2  General I\n  40 none   -      Unplanned\n');
  await ff.click('[data-act=pop-close]');
  assert.equal(await ff.js('return [...document.querySelectorAll(".sty")].slice(0, 7).map(b => b.textContent).join(" ")'), 'I C C CH R  ');
  ok('carving the first block out of unplanned time');

  // a new macrocycle from the macrocycle's own panel, at the week that was clicked, inside a block
  await ff.clickAt('.macro[data-v="0"]', 19.5 / 45);
  assert.equal(await ff.js('return document.getElementById("splitw").options.length'), 44);
  assert.equal(await value('#splitw'), '20');
  await shot('10-split-macro');
  await ff.click('[data-act=mac-split]');
  await saved();
  assert.equal(file('plans/cadetes/cycles.txt'), 'Macrocycle I\n   5 intro  R1-R2  General I\n  14 none   -      Unplanned\nNew macrocycle\n  26 none   -      Unplanned\n');
  assert.equal(await value('[data-fid=pop-name]'), 'New macrocycle');
  assert.equal(await text('.pop-h .muted'), 'weeks 20–45');
  await ff.click('[data-act=mac-merge]');
  await saved();
  assert.doesNotMatch(file('plans/cadetes/cycles.txt'), /New macrocycle/);
  await ff.click('[data-act=pop-close]');
  ok('split a macrocycle at the week that was clicked: one step, the block is split there too');

  // the first week cannot start a new cycle, so the next one is offered; a block offers its clicked week too
  await ff.clickAt('.macro[data-v="0"]', 0.5 / 45);
  assert.equal(await value('#splitw'), '2');
  await ff.click('[data-act=pop-close]');
  await ff.clickAt('.meso[data-v="1"]', 10.5 / 14);   // weeks 6 to 19
  assert.equal(await value('#splitw'), '16');
  await ff.clickAt('.content[data-v="1"]', 4.5 / 14);
  assert.equal(await value('#splitw'), '10');
  // a week chosen by hand stays when the panel is drawn again
  await choose('#splitw', '12');
  await ff.click('.ztog[data-v="R1"]');
  await saved();
  assert.equal(await value('#splitw'), '12');
  await ff.click('.ztog[data-v="R1"]');
  await saved();
  await ff.click('[data-act=pop-close]');
  // from the keyboard there is no position: the middle is offered
  await ff.js('document.querySelector(".macro[data-v=\\"0\\"]").focus()');
  await ff.keys(ff.ENTER);
  assert.equal(await value('#splitw'), '24');
  await ff.click('[data-act=pop-close]');
  ok('the week under the click is offered for a split, on a macrocycle and on a block');

  await ff.click('.day:nth-child(6) .add[data-v="am"]');
  await ff.keys('controlo 1km');
  await saved();
  assert.equal(file('plans/cadetes/sessions.txt'), '2026-10-03 am cadete: controlo 1km\n');
  assert.equal(await text('.zpill'), '–');
  assert.equal(await text('.inf small'), 'No zone found · ≈ 1.0 km');   // the distance still counts toward the week
  ok('the first session creates sessions.txt; a plan with no zone says so');

  server.closeAllConnections();
  await new Promise(r => server.close(r));
  await ff.keys(' R3');
  await ff.wait('return /is the server running/.test(document.getElementById("status").textContent)', 9000);
  assert.equal(file('plans/cadetes/sessions.txt'), '2026-10-03 am cadete: controlo 1km\n');
  server = createServer(DIR);
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  await ff.wait('return !/is the server running/.test(document.getElementById("status").textContent)', 12000);
  await saved();
  assert.equal(file('plans/cadetes/sessions.txt'), '2026-10-03 am cadete: controlo 1km R3\n');
  assert.equal(await value('[data-fid=s-text]'), 'controlo 1km R3');
  ok('the server stops and starts again: the page says so, keeps the typing, and saves it afterwards');

  put('season.txt', 'start: 2026-09-29\nweeks: 45\n');
  await ff.wait('return !document.querySelector(".sheet")');
  assert.match(await text('.pop.problems'), /season.txt:1 · start must be a Monday/);
  put('season.txt', 'start: 2026-09-28\nweeks: 45\n');
  await ff.wait('return !!document.querySelector(".sheet")');
  ok('a season that cannot be read shows only the problem, and the page comes back when it is fixed');

  // ================= what the course would question =================
  fresh();
  await open('plan=juniors&week=2');
  assert.equal(await count('.swk.warn'), 0);
  assert.equal(await count('.chks'), 0);
  await ff.click('.day:nth-child(1) .add[data-v="am"]');
  await ff.keys("1km R1 + 5x 4' R3/2'");
  await saved();
  assert.deepEqual(await ff.js('return [...document.querySelectorAll("[data-id=s-checks] div")].map(d => d.textContent)'),
    ["R3: 2'00'' of rest after 4'00'' of work; the course gives 1:1 or more", "R3 starts 6' into the session; the course says VO2max is only fully available after 30'"]);
  assert.deepEqual(await ff.js('return [...document.querySelectorAll(".swk.warn")].map(b => b.textContent)'), ['2']);
  // the course's own way of writing: the zone once, before the set, with the multiplication sign
  await ff.click('.day:nth-child(2) .add[data-v="am"]');
  await ff.keys("6km R1 + R3+ 4 × (6×30''/30'')/8' + 1km R1");
  await saved();
  assert.equal(await text('.zpill'), 'R3+');
  assert.match(await text('.inf small'), /R3\+ ≈ 12' · R1 ≈ 44'/);
  assert.equal(await count('[data-id=s-checks]'), 0);
  assert.deepEqual(await ff.js('return [...document.querySelectorAll("[data-id=w-checks] div")].map(d => d.textContent)'),
    ['Mon AM (R3) and Tue AM (R3+) are less than 48 h apart', "R1 is the block's content and has no session this week", "R2 is the block's content and has no session this week",
      "Mon AM · R3: 2'00'' of rest after 4'00'' of work; the course gives 1:1 or more", "Mon AM · R3 starts 6' into the session; the course says VO2max is only fully available after 30'"]);
  await shot('12-checks');
  // the other band of the plan has its own sessions: its week 2 says nothing, only its week 1 is marked
  await ff.click('.pill.band[data-v="senior"]');
  assert.equal(await count('.swk.warn'), 1);
  assert.equal(await count('.chks'), 0);
  ok('checks: a session and a week say what the course would question; the course notation is read');

  // ================= in Portuguese =================
  fresh();
  await open('plan=juniors&week=6', '2026-11-18', 'pt');
  assert.equal(await ff.js('return document.documentElement.lang'), 'pt-PT');
  assert.deepEqual(await ff.js('return [...document.querySelectorAll(".tab, header > .b")].map(b => b.textContent)'), ['Plano', 'Eventos', 'Hoje']);
  assert.deepEqual(await ff.js('return [...document.querySelectorAll(".sheet .row > div.lab")].map(l => l.textContent).slice(0, 10)'), ['Mês', 'Segunda', 'Provas', 'Macrociclo', 'Mesociclo', 'Conteúdo', 'Microciclo', 'Tipo', 'Carga %', 'Km']);
  assert.equal(await text('.month'), 'Set');
  assert.match(await text('.lower .sec-h b'), /Semana 6/);
  assert.match(await text('.lower .sec-h .muted'), /2 Nov – 8 Nov/);
  assert.equal(await text('.day-h b'), 'Seg');
  assert.equal(await text('.add'), '+ Manhã');
  assert.match(await text('[data-fid=w-type] option'), /^Padrão · /);
  // a number written with a comma, and a hover text
  await ff.click('.swk[data-v="1"]');
  assert.match(await text('.inf small'), /≈ 6,0 km/);
  assert.match(await ff.js('return document.querySelector(".row .cap[data-v=\\"1\\"]").title'), /^Semana 1: estimativa \d+,\d km \(carga 60% × conteúdo 1,00\), sessões \d+,\d km/);
  // the edit panel, a refusal and the zone card
  await ff.click('.meso[data-v="1"]');
  assert.deepEqual(await ff.js('return [...document.querySelectorAll(".pop .b")].map(b => b.textContent)'), ['◀ Mais cedo', 'Mais tarde ▶', 'Dividir', 'Começar novo macrociclo aqui', 'Apagar']);
  assert.match(await text('[data-fid=pop-pat]'), /Desenvolvimento: carga, choque, recuperação/);
  await shot('11-portuguese');
  await ff.click('[data-act=pop-close]');
  await ff.js('document.querySelector(".zlab[data-tip=\\"R3+\\"]").focus()');
  assert.match(await text('#tip'), /R3\+ · Potência aeróbia[^]*Desenvolver: 2–3 sessões\. Manter: 1\. Contado em conjunto com R3\./);
  await shot('11-portuguese-card');
  await ff.js('document.activeElement.blur()');
  // the events view, and a new event's name
  await ff.click('[data-act=view][data-v=events]');
  assert.deepEqual(await ff.js('return [...document.querySelectorAll(".events th")].map(t => t.textContent).slice(0, 8)'), ['Data', 'Até', 'Confirmada', 'Nome', 'Local', 'Tipo', 'Tipo de prova', 'Embarcações']);
  await ff.click('[data-act=ev-add]');
  await saved();
  assert.match(file('events.txt'), /^2026-11-18 Novo evento$/m);
  assert.equal(await text('header .b.danger'), '1 problema');
  await ff.click('[data-act=problems]');
  assert.match(await text('.pop.problems'), /aviso · events\.txt · Novo evento não está em nenhum plano/);
  await shot('11-portuguese-events');
  await ff.click('[data-act=pop-close]');
  await ff.click('.events tr.on [data-act=ev-del]');
  await saved();
  // the switch: English again, at once, and kept on this device
  assert.deepEqual(await ff.js('return [...document.querySelectorAll("[data-act=lang]")].map(b => b.textContent + (b.classList.contains("on") ? "*" : ""))'), ['EN', 'PT*']);
  await ff.click('[data-act=lang][data-v=en]');
  assert.equal(await text('.tab.on'), 'Events');
  assert.equal(await ff.js('return localStorage.getItem("kayplan-lang")'), 'en');
  await ff.click('[data-act=lang][data-v=pt]');
  assert.equal(await text('.tab.on'), 'Eventos');
  await ff.click('[data-act=lang][data-v=en]');
  await ff.js('localStorage.removeItem("kayplan-lang")');
  ok('Portuguese: the sheet, the week, numbers, panels, the zone card, events and problems; the switch');

  // ================= afterwards =================
  assert.deepEqual(await ff.js('return window.__errs || []'), []);
  assert.deepEqual(check(await load(diskStore(DIR)), TODAY), []);
  ok('no script errors on the page, and the files it wrote pass check');
} catch (e) {
  failed = true;
  console.log('FAILED after step ' + step + '\n', e);
  console.log('status line: ' + await status().catch(() => '?'));
  console.log('page errors: ' + JSON.stringify(await ff.js('return window.__errs || []').catch(() => '?')));
  await shot('failed').catch(() => {});
} finally {
  await ff.quit();
  server.closeAllConnections();
  server.close();
}
console.log((failed ? 'FAILED' : 'all ' + step + ' steps passed') + '; screenshots in ' + TMP);
process.exit(failed ? 1 : 0);
