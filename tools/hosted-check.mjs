// Checks the page as it runs on a static host with the plan on GitHub: the built site/ and a GitHub
// in memory (test/fake-github.js), in headless Firefox. It never talks to the real GitHub.
//
//   node tools/hosted-check.mjs        (needs firefox)
//
// Screenshots are left in a temporary folder, whose path is printed at the end: look at them.

import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { firefox } from './firefox.mjs';
import { buildSite } from './build-site.mjs';
import { fakeGithub } from '../test/fake-github.js';

const FIXTURE = fileURLToPath(new URL('../test/page-season/', import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kayplan-hosted-'));
const SITE = buildSite(path.join(TMP, 'site')).out;
const TODAY = '2026-10-02', REPO = 'someone/plan';

// the fixture season in the folder season/ of the repository
const files = { 'README.md': 'not the plan\n' };
(function walk(dir, prefix) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(dir, e.name), prefix + e.name + '/');
    else files[prefix + e.name] = fs.readFileSync(path.join(dir, e.name), 'utf8');
  }
})(FIXTURE, 'season/');
const gh = fakeGithub({ repo: REPO, token: 'secret', files });

// one server: the built site as plain files, and the fake GitHub under /gh
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/gh/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const r = await gh.fetch('http://fake' + url.pathname.slice(3) + url.search, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    return res.end(r.status === 304 ? undefined : await r.text());
  }
  const name = url.pathname === '/' ? '/index.html' : url.pathname, full = path.join(SITE, name);
  if (!full.startsWith(SITE) || !fs.existsSync(full)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(fs.readFileSync(full));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';
const ff = await firefox(path.join(TMP, 'profile'));

const text = sel => ff.js('const e = document.querySelector(arguments[0]); return e ? e.textContent : null;', sel);
const value = sel => ff.js('return document.querySelector(arguments[0]).value', sel);
const count = sel => ff.js('return document.querySelectorAll(arguments[0]).length', sel);
const shot = name => ff.shot(path.join(TMP, name + '.png'));
const saved = async () => { await ff.sleep(900); await ff.wait('return !document.querySelector("#status .muted")'); };
const season = p => gh.files()['season/' + p];
async function open(hash = '') {
  await ff.nav('about:blank');
  await ff.nav(BASE + '?github&asof=' + TODAY + '#' + hash);
  await ff.js('window.__errs = []; window.addEventListener("error", e => __errs.push(String(e.message))); window.addEventListener("unhandledrejection", e => __errs.push("rejection: " + String(e.reason)));');
}
const fill = async (name, v) => { await ff.click('[data-gh=' + name + ']'); await ff.js('document.querySelector("[data-gh=' + name + ']").select()'); await ff.keys(v); };

let step = 0, failed = false;
const ok = name => console.log('ok ' + (++step) + ' ' + name);

try {
  // this browser is told where the fake GitHub is, and to look for changes every second
  await open();
  await ff.js('localStorage.setItem("kayplan-github", JSON.stringify({ api: location.origin + "/gh", every: 1000 }))');
  await open();
  await ff.wait('return !!document.querySelector(".signin")');
  assert.equal(await count('.sheet'), 0);
  assert.equal(await value('[data-gh=dir]'), 'season');
  await shot('01-signin');
  await ff.click('[data-act=gh-open]');
  assert.equal(await text('.signin .msg'), 'Write the repository as owner/name');
  await fill('repo', REPO);
  await fill('token', 'wrong');
  await ff.click('[data-act=gh-open]');
  await ff.wait('return /refused the token/.test(document.querySelector(".signin .msg").textContent)');
  await fill('repo', 'someone/other');
  await fill('token', 'secret');
  await ff.click('[data-act=gh-open]');
  await ff.wait('return /was not found/.test(document.querySelector(".signin .msg").textContent)');
  ok('with no repository the page asks for one; a wrong name or token is said');

  await fill('repo', REPO);
  await ff.keys(ff.ENTER);
  await ff.wait('return !!document.querySelector(".sheet")');
  assert.equal(await count('.signin'), 0);
  assert.equal(await text('.acct'), REPO);
  assert.deepEqual(await ff.js('return [...document.querySelectorAll(".pill:not(.band)")].map(b => b.textContent)'), ['Cadetes', 'Iniciados', 'Juniors']);
  assert.equal(await text('#status'), '');
  await shot('02-sheet');
  await open('plan=juniors&band=junior&week=1');
  await ff.wait('return !!document.querySelector(".sheet")');
  assert.equal(await count('.signin'), 0);
  ok('the right repository and token open the plan, and the browser remembers them');

  const commits = gh.commits.length;
  await open('plan=juniors&band=junior&week=7');
  await ff.wait('return !!document.querySelector(".sheet")');
  await ff.click('.day:nth-child(2) .add[data-v="pm"]');
  await ff.keys("6km R1 + 4x 10'' R6/3'");
  await saved();
  assert.match(season('plans/juniors/sessions.txt'), /^2026-11-10 pm junior: 6km R1 \+ 4x 10'' R6\/3'$/m);
  assert.ok(gh.commits.length > commits);
  assert.equal(gh.commits[gh.commits.length - 1].message, 'Kayplan: plans/juniors/sessions.txt');
  // the page notices its own commit and stays as it is, with the typing where it was
  await ff.sleep(2500);
  assert.equal(await value('[data-fid=s-text]'), "6km R1 + 4x 10'' R6/3'");
  await ff.keys(' + 1km R1');
  await saved();
  assert.match(season('plans/juniors/sessions.txt'), /R6\/3' \+ 1km R1$/m);
  assert.equal(await text('#status'), '');
  ok('typing a session is committed to the repository, and a second save follows the first');

  // a change from another device appears by itself
  gh.put('season/plans/juniors/sessions.txt', season('plans/juniors/sessions.txt') + "2026-11-12 am junior: 8km R1\n");
  await ff.wait('return [...document.querySelectorAll(".chip-t")].some(c => c.textContent === "8km R1")', 8000);
  // and a save over a file that changed elsewhere is refused, with the newer text shown
  gh.put('season/plans/juniors/sessions.txt', season('plans/juniors/sessions.txt').replace('8km R1', '9km R1'));
  await ff.click('[data-fid=s-text]');
  await ff.keys(ff.END + ' + 2km R1');
  await ff.wait('return /changed on disk/.test(document.querySelector("#status").textContent)', 8000);
  await ff.wait('return [...document.querySelectorAll(".chip-t")].some(c => c.textContent === "9km R1")', 8000);
  assert.ok(!/2km R1/.test(season('plans/juniors/sessions.txt')));
  ok('a change from another device appears; a save over it is refused and the newer text is shown');

  // the cycles and the events save too
  await ff.click('[data-fid=w-type]');
  await ff.js('const s = document.querySelector("[data-fid=w-type]"); s.value = "R"; s.dispatchEvent(new Event("change", { bubbles: true }));');
  await saved();
  assert.match(season('plans/juniors/weeks.txt'), /^2026-11-09 R$/m);
  ok('a week type set by hand is committed');

  // the form again from the header, and closing it
  await ff.click('.acct');
  await ff.wait('return !!document.querySelector(".signin")');
  assert.equal(await value('[data-gh=repo]'), REPO);
  await ff.click('[data-act=gh-close]');
  await ff.wait('return !!document.querySelector(".sheet")');
  ok('the repository can be changed from the header');

  // a phone gets the day page: every plan's sessions of one day, and nothing to edit
  await ff.resize(390, 844);
  await open('');
  await ff.wait('return !!document.querySelector(".ph")');
  assert.equal(await count('.sheet'), 0);
  assert.equal(await count('textarea'), 0);
  assert.equal(await text('.ph-d b'), 'Fri 2 Oct');
  assert.equal(await text('.ph-d span'), 'Week 1');
  assert.equal(await text('.ph-none'), 'No sessions');
  assert.ok(await ff.js('return document.querySelector("[data-act=day][data-v=\'\']").disabled'));
  await shot('03-phone-empty');
  // the next day with a session: the juniors' two groups
  assert.equal(await text('.ph .b[data-act=day]'), 'Next session · Sat 3 Oct');
  await ff.click('.ph .b[data-act=day]');
  assert.equal(await text('.ph-d b'), 'Sat 3 Oct');
  assert.deepEqual(await ff.js('return [...document.querySelectorAll(".ph-s")].map(c => [c.querySelector(".zpill").textContent, c.querySelector(".ph-h div b").textContent, c.querySelector(".ph-h div span").textContent, c.querySelector(".ph-t").textContent])'),
    [['R2', 'Juniors · junior', 'AM', "1km R1 + 8x 4' R2/1'R0 + 1km R1"], ['R2', 'Juniors · senior', 'AM', '3x 2000m R2']]);
  assert.equal(await text('.ph-n'), 'K2 on the last four reps');
  assert.match(await text('.ph-w'), /R2 ≈ 32' · R1 ≈ 13' · R0 ≈ 8' · ≈ 7\.9 km/);
  assert.ok(await ff.js('return document.documentElement.scrollWidth <= window.innerWidth'), 'the page is no wider than the phone');
  await shot('04-phone-day');
  // the arrows go a day at a time; a session marked not done is shown struck out; Today comes back
  await ff.click('[aria-label="Previous day"]');
  await ff.click('[aria-label="Previous day"]');
  assert.equal(await text('.ph-d b'), 'Thu 1 Oct');
  assert.equal(await count('.ph-s.off'), 1);
  assert.match(await text('.ph-h div span'), /PM · not done/);
  await ff.click('[data-act=day][data-v=""]');
  assert.equal(await text('.ph-d b'), 'Fri 2 Oct');
  // a change made elsewhere appears here too
  gh.put('season/plans/cadetes/sessions.txt', "2026-10-02 pm cadete: 8km R1\n  easy\n");
  await ff.wait('return !!document.querySelector(".ph-s")', 8000);
  assert.equal(await text('.ph-h div b'), 'Cadetes · cadete');
  // the day is in the address, so a reload stays on it; Portuguese
  await ff.click('[aria-label="Next day"]');
  await ff.click('[data-act=lang][data-v=pt]');
  assert.equal(await text('.ph-d b'), 'Sáb 3 Out');
  assert.match(await ff.js('return location.hash'), /day=2026-10-03/);
  await ff.click('[data-act=lang][data-v=en]');
  await ff.js('localStorage.removeItem("kayplan-lang")');
  ok('a phone: the day page, with the next session, the arrows, a change from elsewhere and Portuguese');

  // the full page is one tap away, laid out for the narrow window
  await ff.click('[data-act=full]');
  await ff.wait('return !!document.querySelector(".sheet")');
  assert.ok(await ff.js('return document.documentElement.scrollWidth <= window.innerWidth'), 'the page is no wider than the phone');
  await ff.click('.swk[data-v="7"]');
  await ff.js('document.querySelector(".day:nth-child(2)").scrollIntoView()');
  await ff.click('.day:nth-child(2) .chip');
  await ff.sleep(300);
  assert.ok(await ff.js('const r = document.querySelector(".lower .right").getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight / 2'), 'the session is in view');
  assert.ok(await ff.js('const d = [...document.querySelectorAll(".day")].map(x => x.getBoundingClientRect()); return d[1].top > d[0].top && Math.abs(d[1].left - d[0].left) < 1'), 'the days are one under the other');
  await shot('05-phone-full');
  ok('a phone: the full page on request, the days one under the other and the session under them');

  // ---- links for other people ----
  await ff.resize(1440, 900);
  await open('plan=juniors&band=junior&week=1');
  await ff.wait('return !!document.querySelector(".sheet")');
  await ff.click('.acct');
  await ff.wait('return !!document.querySelector("[data-gh=ltoken]")');
  assert.equal(await value('[data-gh=link]'), '');
  assert.ok(await ff.js('return document.querySelector("[data-act=gh-copy]").disabled'));
  await ff.click('[data-gh=ltoken]');
  await ff.keys('secret');
  const writer = await value('[data-gh=link]');
  assert.match(writer, new RegExp('^' + BASE.replace(/[.]/g, '[.]') + '#setup=[A-Za-z0-9_-]+$'));
  // for the athletes: a token that only reads, one plan
  await ff.js('document.querySelector("[data-gh=ltoken]").select()');
  await ff.keys('reader');
  await ff.js('const s = document.querySelector("[data-gh=lplan]"); s.value = "juniors"; s.dispatchEvent(new Event("change", { bubbles: true }));');
  await ff.click('[data-gh=lro]');
  const reading = await value('[data-gh=link]');
  assert.notEqual(reading, writer);
  await shot('06-links');
  ok('the form makes a link for another person from their token, read only and for one plan if wanted');

  // another person's browser: nothing remembered, and only the link
  const elsewhere = async link => {
    await ff.js('localStorage.clear(); localStorage.setItem("kayplan-github", JSON.stringify({ api: location.origin + "/gh", every: 1000 }))');
    await ff.nav('about:blank');
    await ff.nav(link.replace('#', '?github&asof=2026-10-03#'));
    await ff.js('window.__errs = []; window.addEventListener("error", e => __errs.push(String(e.message)));');
  };
  await elsewhere(reading);
  await ff.wait('return !!document.querySelector(".ph")');
  assert.equal(await count('.signin'), 0);
  assert.ok(!/setup=/.test(await ff.js('return location.href')), 'the token is gone from the address');
  // the day page on a wide screen, only the plan the link was made for, and no way to the full page
  assert.deepEqual(await ff.js('return [...document.querySelectorAll(".ph-h div b")].map(b => b.textContent)'), ['Juniors · junior', 'Juniors · senior']);
  assert.equal(await count('[data-act=full]'), 0);
  assert.equal(await count('textarea, .acct'), 0);
  await ff.click('[aria-label="Previous day"]');
  assert.equal(await count('.ph-s'), 0, 'the cadetes session of 2 Oct is not shown to the juniors');
  await shot('07-reader');
  // it is remembered: the plain address opens the same page
  await ff.nav('about:blank');
  await ff.nav(BASE + '?github&asof=2026-10-03');
  await ff.wait('return !!document.querySelector(".ph")');
  assert.equal(await count('[data-act=full]'), 0);
  const before = gh.commits.length;
  ok('a read-only link opens the day page of one plan with nothing to type, and is remembered');

  await elsewhere(writer);
  await ff.wait('return !!document.querySelector(".sheet")');
  assert.equal(await count('.signin'), 0);
  assert.ok(!/setup=/.test(await ff.js('return location.href')));
  assert.equal(await text('.acct'), REPO);
  await ff.click('.swk[data-v="7"]');
  await ff.click('.day:nth-child(7) .add[data-v="am"]');
  await ff.keys('5km R1');
  await saved();
  assert.match(season('plans/cadetes/sessions.txt'), /^2026-11-15 am cadete: 5km R1$/m);
  assert.ok(gh.commits.length > before);
  ok('a link with a token that writes opens the full page, and its saves are committed');

  assert.deepEqual(await ff.js('return window.__errs || []'), []);
  ok('no script errors on the page');
} catch (e) {
  failed = true;
  console.log('FAILED after step ' + step + '\n', e);
  console.log('status line: ' + await text('#status').catch(() => '?'));
  console.log('page errors: ' + JSON.stringify(await ff.js('return window.__errs || []').catch(() => '?')));
  await shot('failed').catch(() => {});
} finally {
  await ff.quit();
  server.closeAllConnections();
  server.close();
}
console.log((failed ? 'FAILED' : 'all ' + step + ' steps passed') + '; screenshots in ' + TMP);
process.exit(failed ? 1 : 0);
