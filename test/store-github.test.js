import test from 'node:test';
import assert from 'node:assert/strict';
import { githubStore } from '../src/store-github.js';
import { load, fileText } from '../src/engine.js';
import { fakeGithub } from './fake-github.js';
import { fixture } from './helpers.js';

const REPO = 'someone/plan';
// the fixture season in the folder season/ of a repository that also holds other files
function github(more) {
  const files = { 'README.md': 'not the plan\n', 'season/notes.md': 'not a plan file\n' };
  for (const [p, text] of Object.entries(fixture())) files['season/' + p] = text;
  return fakeGithub({ repo: REPO, files: { ...files, ...more } });
}
const open = (gh, more) => githubStore({ repo: REPO, token: 'secret', fetch: gh.fetch, api: 'https://api.test', ...more });
const code = async p => { try { await p; return null; } catch (e) { return e.code || e.message; } };

test('list and read: the text files of the folder, with the blob id as the revision', async () => {
  const gh = github(), store = open(gh);
  const paths = await store.list();
  assert.deepEqual(paths, Object.keys(fixture()).sort());
  const f = await store.read('season.txt');
  assert.equal(f.text, 'start: 2026-01-05\nweeks: 12\n');
  assert.match(f.rev, /^[0-9a-f]{40}$/);
  assert.equal(await store.read('nothing.txt'), null);
  // text that is not ASCII comes through whole
  const accents = github({ 'season/events.txt': '2026-02-14 Taça de Esperanças — 500 m\n  kind: test\n' });
  assert.equal((await open(accents).read('events.txt')).text, '2026-02-14 Taça de Esperanças — 500 m\n  kind: test\n');
});

test('the engine loads a season from GitHub as it does from disk', async () => {
  const data = await load(open(github()));
  assert.deepEqual(data.errors, []);
  assert.deepEqual(data.plans.map(p => p.id), ['group-a', 'group-b']);
  assert.equal(data.library.length, 7);
});

test('write: one commit, the new revision comes back, and reading gives the new text without asking again', async () => {
  const gh = github(), store = open(gh);
  const f = await store.read('plans/group-a/weeks.txt');
  const rev = await store.write('plans/group-a/weeks.txt', '2026-01-19 R\n', f.rev);
  assert.notEqual(rev, f.rev);
  assert.equal(gh.files()['season/plans/group-a/weeks.txt'], '2026-01-19 R\n');
  assert.deepEqual(gh.commits.map(c => c.message), ['first', 'Kayplan: plans/group-a/weeks.txt']);
  const calls = gh.calls.length;
  assert.deepEqual(await store.read('plans/group-a/weeks.txt'), { text: '2026-01-19 R\n', rev });
  assert.equal(gh.calls.length, calls);
  // a second write on the revision just returned
  await store.write('plans/group-a/weeks.txt', 'ação — 1\n', rev);
  assert.equal(gh.files()['season/plans/group-a/weeks.txt'], 'ação — 1\n');
  // the same text again is not a commit
  const again = await store.read('season.txt');
  assert.equal(await store.write('season.txt', again.text, again.rev), again.rev);
  assert.equal(gh.commits.length, 3);
});

test('write: a new file, and a file that changed elsewhere is a conflict', async () => {
  const gh = github(), store = open(gh);
  await store.list();
  const rev = await store.write('plans/group-b/notes.txt', 'new\n', null);
  assert.equal(gh.files()['season/plans/group-b/notes.txt'], 'new\n');
  assert.ok((await store.list()).includes('plans/group-b/notes.txt'));
  // "new" when it is already there
  assert.equal(await code(store.write('plans/group-b/notes.txt', 'again\n', null)), 'conflict');
  // changed from another computer since it was read
  gh.put('season/plans/group-b/notes.txt', 'theirs\n');
  assert.equal(await code(store.write('plans/group-b/notes.txt', 'mine\n', rev)), 'conflict');
  assert.equal(gh.files()['season/plans/group-b/notes.txt'], 'theirs\n');
  // leaving the revision out writes over whatever is there
  await store.write('plans/group-b/notes.txt', 'mine\n');
  assert.equal(gh.files()['season/plans/group-b/notes.txt'], 'mine\n');
});

test('remove: against the revision read', async () => {
  const gh = github(), store = open(gh);
  const f = await store.read('plans/group-b/weeks.txt');
  gh.put('season/plans/group-b/weeks.txt', '2026-01-19 R\n');
  assert.equal(await code(store.remove('plans/group-b/weeks.txt', f.rev)), 'conflict');
  await store.remove('plans/group-b/weeks.txt');
  assert.ok(!('season/plans/group-b/weeks.txt' in gh.files()));
  assert.ok(!(await store.list()).includes('plans/group-b/weeks.txt'));
});

test('stamp: changes when anything is committed, and an unchanged answer is asked for cheaply', async () => {
  const gh = github(), store = open(gh);
  const a = await store.stamp();
  assert.equal(await store.stamp(), a);
  gh.put('season/events.txt', '');
  const b = await store.stamp();
  assert.notEqual(b, a);
  // nothing was listed yet, so the first read lists
  assert.equal((await store.read('events.txt')).text, '');
  const calls = gh.calls.length;
  await store.stamp();
  assert.equal(gh.calls.length, calls + 1);
});

test('after a write, a stale answer from GitHub does not bring the old text back', async () => {
  const gh = github(), store = open(gh);
  const f = await store.read('season.txt');
  const before = await store.stamp();
  const rev = await store.write('season.txt', 'start: 2026-01-05\nweeks: 13\n', f.rev);
  // GitHub still names the commit before the write for a moment
  gh.lag = 2;
  const after = await store.stamp();
  assert.notEqual(after, before);
  await store.list();
  assert.deepEqual(await store.read('season.txt'), { text: 'start: 2026-01-05\nweeks: 13\n', rev });
  assert.equal(await store.stamp(), after);
  assert.equal(gh.lag, 0);
});

test('the engine saves through it: the file as written from the data', async () => {
  const gh = github(), store = open(gh), data = await load(store);
  data.plans[0].hand = [];
  const path = 'plans/group-a/weeks.txt';
  data.revs[path] = await store.write(path, fileText(data, path), data.revs[path]);
  assert.equal(gh.files()['season/' + path], '');
  assert.deepEqual((await load(store)).plans[0].hand, []);
});

test('a refused token, a repository that is not there, a folder that is not there', async () => {
  const gh = github();
  assert.equal(await code(open(gh, { token: 'wrong' }).list()), 'auth');
  assert.equal(await code(open(gh, { repo: 'someone/else' }).list()), 'missing');
  assert.equal(await code(open(gh, { dir: 'elsewhere' }).list()), 'missing');
  // another folder, and a branch given by name
  const other = fakeGithub({ repo: REPO, branch: 'plan', files: { 'club/2027/season.txt': 'start: 2026-01-05\nweeks: 12\n' } });
  assert.deepEqual(await open(other, { dir: 'club/2027/', branch: 'plan' }).list(), ['season.txt']);
});

test('a setup link carries the repository and a token after the #, and is read back', async () => {
  const { setupLink, readSetup } = await import('../src/store-github.js');
  const link = setupLink('https://someone.example/kayplan/#plan=a', { repo: REPO, dir: 'season', token: 'github_pat_Açb/+=', readonly: true, plan: 'group-a' });
  assert.match(link, /^https:\/\/someone\.example\/kayplan\/#setup=[A-Za-z0-9_-]+$/);
  assert.ok(!link.includes('github_pat'));
  assert.deepEqual(readSetup(new URL(link).hash), { repo: REPO, dir: 'season', token: 'github_pat_Açb/+=', readonly: true, plan: 'group-a' });
  // a link for someone who edits: every plan, not read only; the folder defaults to season
  assert.deepEqual(readSetup(new URL(setupLink('https://x.example/', { repo: REPO, token: 't' })).hash), { repo: REPO, dir: 'season', token: 't', readonly: false, plan: null });
  // no link, a broken one, one with no token
  assert.equal(readSetup('#plan=a&week=3'), null);
  assert.equal(readSetup('#setup=not-json'), null);
  assert.equal(readSetup('#setup=' + Buffer.from(JSON.stringify({ repo: REPO })).toString('base64url')), null);
});

test('a token that only reads: the plan loads, and a write is refused as a token problem', async () => {
  const gh = github(), store = open(gh, { token: 'reader' });
  assert.deepEqual((await load(store)).errors, []);
  const f = await store.read('season.txt');
  assert.equal(await code(store.write('season.txt', 'start: 2026-01-05\nweeks: 13\n', f.rev)), 'auth');
  assert.equal(gh.commits.length, 1);
});
