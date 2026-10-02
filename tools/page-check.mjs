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
async function open(hash, asof = TODAY) {
  // through a blank page, because going to the same address with another #part does not reload
  await ff.nav('about:blank');
  await ff.nav(BASE + '?asof=' + asof + '#' + hash);
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
  ok('opens on the current week; today is marked; types follow the patterns, the hand-set one is marked');

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
  assert.match(await text('.inf small'), /R2 ≈ 32' · R1 ≈ 13' · R0 ≈ 8'/);
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

  await ff.click('[data-fid=s-notdone]');
  await saved();
  assert.match(file('plans/juniors/sessions.txt'), /^2026-10-13 pm junior not-done: /m);
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
  await shot('05-events');
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

  await ff.click('.day:nth-child(6) .add[data-v="am"]');
  await ff.keys('controlo 1km');
  await saved();
  assert.equal(file('plans/cadetes/sessions.txt'), '2026-10-03 am cadete: controlo 1km\n');
  assert.equal(await text('.zpill'), '–');
  assert.equal(await text('.inf small'), 'No zone found');
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
