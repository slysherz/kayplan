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

  // a phone
  await ff.resize(390, 844);
  await open('plan=juniors&band=junior&week=7');
  await ff.wait('return !!document.querySelector(".sheet")');
  await shot('03-phone-top');
  assert.ok(await ff.js('return document.documentElement.scrollWidth <= window.innerWidth'), 'the page is no wider than the phone');
  await ff.click('.day:nth-child(2) .chip');
  await ff.sleep(300);
  assert.ok(await ff.js('const r = document.querySelector(".lower .right").getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight / 2'), 'the session is in view');
  assert.ok(await ff.js('const d = [...document.querySelectorAll(".day")].map(x => x.getBoundingClientRect()); return d[1].top > d[0].top && Math.abs(d[1].left - d[0].left) < 1'), 'the days are one under the other');
  await shot('04-phone-session');
  await ff.js('document.querySelector(".day:nth-child(5)").scrollIntoView()');
  await ff.click('.day:nth-child(5) .add[data-v="am"]');
  await ff.sleep(300);
  assert.equal(await count('.sug-r'), 5);
  await shot('05-phone-suggestions');
  await ff.click('.sug-r');
  await saved();
  assert.match(season('plans/juniors/sessions.txt'), /^2026-11-13 am junior: /m);
  await ff.click('[data-act=view][data-v=events]');
  await shot('06-phone-events');
  ok('a phone: the days one under the other, the session under them, a suggestion taken');

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
