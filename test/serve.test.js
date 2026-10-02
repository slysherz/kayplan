import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createServer } from '../serve.js';
import { httpStore } from '../src/store-http.js';
import { diskStore } from '../src/store-disk.js';
import { load, check } from '../src/engine.js';
import { fixture } from './helpers.js';

async function running(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kayplan-test-'));
  const disk = diskStore(dir), files = fixture();
  for (const p of Object.keys(files)) await disk.write(p, files[p]);
  const server = createServer(dir);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); server.close(); await fs.rm(dir, { recursive: true }); });
  const base = 'http://127.0.0.1:' + server.address().port;
  return { base, disk, store: httpStore(base), port: server.address().port };
}

// a request with any headers, including a Host that fetch would not let us set
function raw(port, method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: url, headers }, res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('the page reads the same plan through the server as the command line reads from disk', async t => {
  const { store, disk } = await running(t);
  assert.deepEqual(await store.list(), await disk.list());
  const viaHttp = await load(store), viaDisk = await load(disk);
  assert.deepEqual(viaHttp, viaDisk);
  assert.deepEqual(check(viaHttp, '2026-01-21'), []);
  assert.equal(await store.read('plans/group-c/plan.txt'), null);
});

test('saving through the server: revisions, conflicts, new files, removal', async t => {
  const { store, disk } = await running(t);
  const first = await store.read('season.txt');
  const rev = await store.write('season.txt', 'start: 2026-01-05\nweeks: 13\n', first.rev);
  assert.equal((await disk.read('season.txt')).text, 'start: 2026-01-05\nweeks: 13\n');
  assert.equal(rev, (await store.read('season.txt')).rev);
  await assert.rejects(store.write('season.txt', 'start: 2026-01-05\nweeks: 14\n', first.rev), { code: 'conflict' });
  await assert.rejects(store.write('events.txt', '', null), { code: 'conflict' });
  assert.equal((await disk.read('season.txt')).text, 'start: 2026-01-05\nweeks: 13\n');
  // text with accents and quotes arrives unchanged
  const text = "2026-01-20 pm older: 1km R1 + 8x 4' R2/1' R0 – caça à baleia\n";
  await store.write('plans/group-a/sessions.txt', text, (await store.read('plans/group-a/sessions.txt')).rev);
  assert.equal((await disk.read('plans/group-a/sessions.txt')).text, text);
  await store.write('plans/group-c/plan.txt', 'name: C\nbands: c\n', null);
  assert.equal((await store.list()).includes('plans/group-c/plan.txt'), true);
  await assert.rejects(store.remove('plans/group-c/plan.txt', 'stale'), { code: 'conflict' });
  await store.remove('plans/group-c/plan.txt', (await store.read('plans/group-c/plan.txt')).rev);
  assert.equal(await store.read('plans/group-c/plan.txt'), null);
});

test('the stamp changes when a file changes on disk, and only then', async t => {
  const { store, disk } = await running(t);
  const a = await store.stamp();
  assert.equal(await store.stamp(), a);
  await disk.write('plans/group-a/weeks.txt', '2026-01-19 C\n');
  const b = await store.stamp();
  assert.notEqual(b, a);
  await disk.write('plans/group-a/weeks.txt', '2026-01-19 R\n2026-02-02 C 70\n');
  assert.equal(await store.stamp(), a);
});

test('the server serves the page and nothing else from the folder', async t => {
  const { base } = await running(t);
  const get = async p => { const r = await fetch(base + p); return [r.status, r.headers.get('content-type')]; };
  assert.deepEqual(await get('/src/engine.js'), [200, 'text/javascript; charset=utf-8']);
  for (const p of ['/DESIGN.md', '/package.json', '/test/helpers.js', '/src/../package.json', '/season/season.txt', '/.git/config', '/serve.js']) {
    assert.equal((await get(p))[0], 404, p);
  }
  for (const p of ['../season.txt', 'season.md', '/etc/passwd', '']) {
    assert.equal((await fetch(base + '/api/file?path=' + encodeURIComponent(p))).status, 400, p);
  }
  assert.equal((await fetch(base + '/api/other')).status, 404);
});

test('the server refuses other sites and other names', async t => {
  const { port, disk } = await running(t);
  const host = '127.0.0.1:' + port, before = (await disk.read('season.txt')).text;
  const put = headers => raw(port, 'PUT', '/api/file?path=season.txt', headers, 'start: 2026-01-05\nweeks: 1\n');
  // a write without the page's header, or from a page on another site
  assert.equal((await put({ host })).status, 403);
  assert.equal((await put({ host, 'x-kayplan': '1', origin: 'http://example.com' })).status, 403);
  assert.equal((await raw(port, 'DELETE', '/api/file?path=season.txt', { host }, '')).status, 403);
  // a request that reached this server under another name
  assert.equal((await raw(port, 'GET', '/api/list', { host: 'example.com' }, '')).status, 403);
  assert.equal((await raw(port, 'GET', '/', { host: 'example.com:' + port }, '')).status, 403);
  assert.equal((await disk.read('season.txt')).text, before);
  // the page itself
  assert.equal((await put({ host, 'x-kayplan': '1', origin: 'http://' + host })).status, 200);
  assert.equal((await raw(port, 'GET', '/api/list', { host: 'localhost:' + port }, '')).status, 200);
});
