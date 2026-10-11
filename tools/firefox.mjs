// A small client for Firefox's remote-control port (Marionette), with no dependencies: enough to open
// the page in headless Firefox, run script in it, click, type, drag and take screenshots.
// Used by tools/page-check.mjs. There is no Chrome on the coach's machine.

import net from 'node:net';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';

function freePort() {
  return new Promise(resolve => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)); });
  });
}

// profile is an empty folder for this run; size is the window in px
export async function firefox(profile, size = [1440, 900]) {
  const port = await freePort();
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(profile + '/user.js', 'user_pref("marionette.port", ' + port + ');\nuser_pref("browser.shell.checkDefaultBrowser", false);\nuser_pref("datareporting.policy.dataSubmissionEnabled", false);\n');
  const proc = spawn('firefox', ['--headless', '--no-remote', '--profile', profile, '--marionette', '--window-size', size.join(',')], { stdio: 'ignore' });
  let sock;
  for (let i = 0; i < 150 && !sock; i++) {
    try { sock = await new Promise((res, rej) => { const s = net.connect(port, '127.0.0.1', () => res(s)); s.on('error', rej); }); }
    catch (e) { await new Promise(r => setTimeout(r, 200)); }
  }
  if (!sock) { proc.kill(); throw new Error('Firefox did not start'); }

  // messages are "<length>:<json>"; a command is [0, id, name, params], its answer [1, id, error, result]
  let buf = Buffer.alloc(0), id = 0, hello;
  const waiting = new Map(), greeted = new Promise(r => { hello = r; });
  sock.on('data', d => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      const colon = buf.indexOf(':');
      if (colon < 0) return;
      const len = +buf.subarray(0, colon).toString();
      if (buf.length < colon + 1 + len) return;
      const msg = JSON.parse(buf.subarray(colon + 1, colon + 1 + len).toString());
      buf = buf.subarray(colon + 1 + len);
      if (!Array.isArray(msg)) { hello(msg); continue; }
      const w = waiting.get(msg[1]);
      waiting.delete(msg[1]);
      if (w) { if (msg[2]) w.rej(new Error(msg[2].error + ': ' + msg[2].message)); else w.res(msg[3]); }
    }
  });
  await greeted;
  const cmd = (name, params = {}) => new Promise((res, rej) => {
    const n = ++id, body = JSON.stringify([0, n, name, params]);
    waiting.set(n, { res, rej });
    sock.write(Buffer.byteLength(body) + ':' + body);
  });
  await cmd('WebDriver:NewSession', {});
  await cmd('WebDriver:SetWindowRect', { width: size[0], height: size[1] });

  const key = c => [{ type: 'keyDown', value: c }, { type: 'keyUp', value: c }];
  const ff = {
    ENTER: '', END: '', ESCAPE: '', DOWN: '\uE015', UP: '\uE013',
    resize: (width, height) => cmd('WebDriver:SetWindowRect', { width, height }),
    nav: url => cmd('WebDriver:Navigate', { url }),
    // the page as a PDF, A4 lying down, as the printer would make it
    pdf: async file => fs.writeFileSync(file, Buffer.from((await cmd('WebDriver:Print', { orientation: 'landscape', background: true, shrinkToFit: false, page: { width: 29.7, height: 21 }, margin: { top: 1.2, bottom: 1.2, left: 1, right: 1 } })).value, 'base64')),
    // run script in the page; "return x" gives x back; arguments[] holds args
    js: async (script, ...args) => (await cmd('WebDriver:ExecuteScript', { script, args })).value,
    click: async sel => cmd('WebDriver:ElementClick', { id: (await cmd('WebDriver:FindElement', { using: 'css selector', value: sel })).value[ELEMENT] }),
    // click the element at this part of its width (0 is its left edge, 1 its right)
    clickAt: async (sel, part) => {
      const r = await ff.js('const r = document.querySelector(arguments[0]).getBoundingClientRect(); return [Math.round(r.left + r.width * arguments[1]), Math.round(r.top + r.height / 2)];', sel, part);
      await cmd('WebDriver:PerformActions', { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', duration: 0, x: r[0], y: r[1] }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }] });
      await cmd('WebDriver:ReleaseActions');
    },
    // move the pointer over the element's centre
    hover: async sel => {
      const r = await ff.js('const r = document.querySelector(arguments[0]).getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];', sel);
      await cmd('WebDriver:PerformActions', { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', duration: 0, x: r[0], y: r[1] }] }] });
    },
    // type into whatever has the focus, one key at a time, as a keyboard does
    keys: text => cmd('WebDriver:PerformActions', { actions: [{ type: 'key', id: 'keys', actions: [...text].flatMap(key) }] }),
    // press on the element's centre, move sideways by dx px, release
    drag: async (sel, dx) => {
      const r = await ff.js('const r = document.querySelector(arguments[0]).getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];', sel);
      const moves = [1, 2, 3, 4, 5, 6].map(k => ({ type: 'pointerMove', duration: 30, x: Math.round(r[0] + dx * k / 6), y: r[1] }));
      await cmd('WebDriver:PerformActions', { actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', duration: 0, x: r[0], y: r[1] }, { type: 'pointerDown', button: 0 }, ...moves, { type: 'pointerUp', button: 0 }] }] });
      await cmd('WebDriver:ReleaseActions');
    },
    shot: async file => fs.writeFileSync(file, Buffer.from((await cmd('WebDriver:TakeScreenshot', { full: false })).value, 'base64')),
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    // wait until the script returns something true
    wait: async (script, ms = 6000) => {
      for (const end = Date.now() + ms; ;) {
        if (await ff.js(script)) return;
        if (Date.now() > end) throw new Error('timed out waiting for: ' + script);
        await ff.sleep(50);
      }
    },
    quit: async () => {
      try { await cmd('Marionette:Quit', { flags: ['eForceQuit'] }); } catch (e) { /* already gone */ }
      sock.destroy();
      proc.kill();
    }
  };
  return ff;
}
