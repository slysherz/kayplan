import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { diskStore, safePath } from '../src/store-disk.js';
import { fixture } from './helpers.js';

const CLI = fileURLToPath(new URL('../kayplan.js', import.meta.url));

async function tempSeason(changes) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kayplan-test-'));
  const store = diskStore(dir), files = { ...fixture(), ...changes };
  for (const p of Object.keys(files)) await store.write(p, files[p]);
  return { dir, store };
}

function run(dir, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args, '--dir', dir], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('the disk store lists, reads, writes and removes plan files', async t => {
  const { dir, store } = await tempSeason();
  t.after(() => fs.rm(dir, { recursive: true }));
  assert.deepEqual(await store.list(), Object.keys(fixture()).sort());
  assert.equal((await store.read('season.txt')).text, 'start: 2026-01-05\nweeks: 12\n');
  assert.equal(await store.read('plans/group-c/plan.txt'), null);
  await store.write('plans/group-c/plan.txt', 'name: C\nbands: c\n', null);
  assert.equal((await store.read('plans/group-c/plan.txt')).text, 'name: C\nbands: c\n');
  await store.remove('plans/group-c/plan.txt');
  assert.equal(await store.read('plans/group-c/plan.txt'), null);
  // files that are not plan files are not listed
  await fs.writeFile(path.join(dir, 'notes.md'), 'x');
  assert.equal((await store.list()).includes('notes.md'), false);
});

test('the disk store refuses to overwrite a file that changed since it was read', async t => {
  const { dir, store } = await tempSeason();
  t.after(() => fs.rm(dir, { recursive: true }));
  const first = await store.read('season.txt');
  const rev = await store.write('season.txt', 'start: 2026-01-05\nweeks: 13\n', first.rev);
  assert.equal(rev, (await store.read('season.txt')).rev);
  // a second writer still holding the first revision
  await assert.rejects(store.write('season.txt', 'start: 2026-01-05\nweeks: 14\n', first.rev), { code: 'conflict' });
  await assert.rejects(store.remove('season.txt', first.rev), { code: 'conflict' });
  // a file expected to be new that already exists
  await assert.rejects(store.write('events.txt', '', null), { code: 'conflict' });
  assert.equal((await store.read('season.txt')).text, 'start: 2026-01-05\nweeks: 13\n');
});

test('the disk store only touches plan files inside its folder', async t => {
  const { dir, store } = await tempSeason();
  t.after(() => fs.rm(dir, { recursive: true }));
  for (const bad of ['../season.txt', '/etc/passwd.txt', 'plans/../../x.txt', 'season.md', 'plans\\x.txt', '.hidden.txt', 'Plans/x.txt', '']) {
    assert.equal(safePath(bad), false, bad);
    await assert.rejects(store.write(bad, 'x'), /not a plan file/);
    await assert.rejects(store.read(bad), /not a plan file/);
  }
  assert.equal(safePath('plans/group-a/sessions.txt'), true);
});

test('command line: check', async t => {
  const { dir, store } = await tempSeason();
  t.after(() => fs.rm(dir, { recursive: true }));
  assert.deepEqual(run(dir, 'check', '--as-of', '2026-01-21'), { code: 0, out: 'ok\n', err: '' });
  assert.deepEqual(run(dir, 'check', '--as-of', '2026-02-15'), { code: 0, out: 'warning: events.txt:1: Spring regatta (2026-02-14) is in the past and its date was never confirmed\n0 errors, 1 warnings\n', err: '' });
  await store.write('plans/group-a/sessions.txt', '2026-01-20 pm guest: 6km R1\n');
  assert.deepEqual(run(dir, 'check', '--as-of', '2026-01-21'), { code: 1, out: 'error: plans/group-a/sessions.txt:1: plan group-a has no band "guest"\n1 errors, 0 warnings\n', err: '' });
});

test('command line: show', async t => {
  const { dir } = await tempSeason();
  t.after(() => fs.rm(dir, { recursive: true }));
  let r = run(dir, 'show', 'season', '--as-of', '2026-01-21');
  assert.equal(r.code, 0);
  assert.match(r.out, /^group-a · Group A · bands older, younger\n/);
  assert.match(r.out, /\n\n\ngroup-b · Group B · bands masters\n/);
  r = run(dir, 'show', 'season', '--plan', 'group-b', '--as-of', '2026-01-21');
  assert.doesNotMatch(r.out, /group-a/);

  // without a number, the current week
  r = run(dir, 'show', 'week', '--plan', 'group-a', '--as-of', '2026-01-21');
  assert.match(r.out, /^group-a · week 3 · 2026-01-19 to 2026-01-25 · current week\n/);
  r = run(dir, 'show', 'week', '6', '--as-of', '2026-01-21');
  assert.match(r.out, /^group-a · week 6 [^]*\n\n\ngroup-b · week 6 /);
  r = run(dir, 'show', 'week', '3', '--band', 'younger', '--as-of', '2026-01-21');
  assert.match(r.out, /^group-a · week 3 /);
  assert.doesNotMatch(r.out, /group-b|older ·/);

  r = run(dir, 'show', 'events', '--as-of', '2026-01-21');
  assert.match(r.out, /Spring regatta  Lake   group-a 1/);
});

test('command line: mistakes are explained', async t => {
  const { dir, store } = await tempSeason();
  t.after(() => fs.rm(dir, { recursive: true }));
  const fails = (args, message) => { const r = run(dir, ...args); assert.equal(r.code, 2, args.join(' ')); assert.match(r.err, message); assert.equal(r.out, ''); };
  fails(['show'], /^usage:/);
  fails(['delete', 'everything'], /^usage:/);
  fails(['show', 'week', '13', '--as-of', '2026-01-21'], /week must be a number from 1 to 12/);
  fails(['show', 'week', '--as-of', '2026-05-01'], /today \(2026-05-01\) is outside the season/);
  fails(['show', 'season', '--plan', 'group-z'], /there is no plan "group-z"; plans: group-a, group-b/);
  fails(['show', 'week', '3', '--band', 'guest'], /no band "guest" in group-a, group-b/);
  fails(['check', '--as-of', 'tomorrow'], /--as-of needs a date/);
  // a file with a problem: show still prints, and says so
  await store.write('plans/group-a/weeks.txt', 'next week R\n');
  const r = run(dir, 'show', 'season', '--plan', 'group-a', '--as-of', '2026-01-21');
  assert.equal(r.code, 0);
  assert.match(r.err, /1 problems in the files; run: node kayplan.js check/);
  await store.write('season.txt', 'start: soon\n');
  fails(['show', 'season'], /season.txt cannot be read/);
});
