// A GitHub in memory, for the tests: the few calls store-github.js makes, answered the way GitHub does.
// fakeGithub({ repo, token, reader, files }) (reader is a token that may only read) returns { fetch, files(), commits, hold }.
//   files()   the repository's files now: { path: text }
//   commits   every commit: [{ sha, message }]
//   lag       set to a number to make the next that many "last commit" answers stale, as GitHub can be

import crypto from 'node:crypto';

const sha1 = s => crypto.createHash('sha1').update(s, 'utf8').digest('hex');
const blobId = text => sha1('blob ' + Buffer.byteLength(text, 'utf8') + '\0' + text);

export function fakeGithub({ repo = 'someone/plan', token = 'secret', reader = 'reader', branch = 'main', files = {} } = {}) {
  let held = { ...files };
  const trees = {}, commits = [];
  const state = { lag: 0, calls: [] };
  function commit(message) {
    const tree = sha1('tree ' + JSON.stringify(Object.keys(held).sort().map(p => [p, blobId(held[p])])));
    trees[tree] = { ...held };
    commits.push({ sha: sha1('commit ' + commits.length + tree), tree, message });
  }
  commit('first');
  const answer = (status, body, headers) => new Response(status === 304 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  const blobs = () => { const out = {}; for (const t of Object.values(trees)) for (const text of Object.values(t)) out[blobId(text)] = text; return out; };

  async function fetch(url, options = {}) {
    const u = new URL(url, 'http://fake'), method = options.method || 'GET', h = new Headers(options.headers || {});
    const at = u.pathname.replace(/^.*?\/repos\//, '/repos/');
    state.calls.push(method + ' ' + at);
    // a second token that may only read
    const reads = h.get('authorization') === 'Bearer ' + reader;
    if (!reads && h.get('authorization') !== 'Bearer ' + token) return answer(401, { message: 'Bad credentials' });
    if (reads && method !== 'GET') return answer(403, { message: 'Resource not accessible by personal access token' });
    if (!at.startsWith('/repos/' + repo)) return answer(404, { message: 'Not Found' });
    const rest = at.slice(('/repos/' + repo).length);
    if (rest === '' && method === 'GET') return answer(200, { default_branch: branch });
    if (rest === '/commits/' + branch && method === 'GET') {
      // a stale answer: the commit before the last one
      const c = state.lag > 0 && commits.length > 1 ? (state.lag--, commits[commits.length - 2]) : commits[commits.length - 1];
      const etag = '"' + c.sha + '"';
      if (h.get('if-none-match') === etag) return answer(304, null, { etag });
      return answer(200, { sha: c.sha, commit: { tree: { sha: c.tree } } }, { etag });
    }
    let m = /^\/git\/trees\/([0-9a-f]+)$/.exec(rest);
    if (m && method === 'GET') {
      const t = trees[m[1]];
      if (!t) return answer(404, { message: 'Not Found' });
      const dirs = new Set();
      for (const p of Object.keys(t)) { const parts = p.split('/'); for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/')); }
      return answer(200, { truncated: false, tree: [...[...dirs].map(p => ({ path: p, type: 'tree' })), ...Object.keys(t).map(p => ({ path: p, type: 'blob', sha: blobId(t[p]) }))] });
    }
    m = /^\/git\/blobs\/([0-9a-f]+)$/.exec(rest);
    if (m && method === 'GET') {
      const text = blobs()[m[1]];
      if (text === undefined) return answer(404, { message: 'Not Found' });
      // GitHub breaks the base64 into lines
      return answer(200, { encoding: 'base64', content: Buffer.from(text, 'utf8').toString('base64').replace(/(.{60})/g, '$1\n') });
    }
    m = /^\/contents\/(.+)$/.exec(rest);
    if (m) {
      const path = decodeURIComponent(m[1]), has = path in held, now = has ? blobId(held[path]) : null;
      if (method === 'GET') return has ? answer(200, { sha: now }) : answer(404, { message: 'Not Found' });
      const body = JSON.parse(options.body || '{}');
      if (body.branch !== branch) return answer(404, { message: 'Branch not found' });
      if (method === 'PUT') {
        if (has && !body.sha) return answer(422, { message: '"sha" wasn\'t supplied.' });
        if ((body.sha || null) !== now) return answer(409, { message: path + ' does not match ' + body.sha });
        held[path] = Buffer.from(body.content, 'base64').toString('utf8');
        commit(body.message);
        const c = commits[commits.length - 1];
        return answer(has ? 200 : 201, { content: { sha: blobId(held[path]) }, commit: { sha: c.sha, tree: { sha: c.tree } } });
      }
      if (method === 'DELETE') {
        if (!has) return answer(404, { message: 'Not Found' });
        if (body.sha !== now) return answer(409, { message: 'does not match' });
        delete held[path];
        commit(body.message);
        const c = commits[commits.length - 1];
        return answer(200, { content: null, commit: { sha: c.sha, tree: { sha: c.tree } } });
      }
    }
    return answer(404, { message: 'Not Found' });
  }
  return Object.assign(state, { fetch, files: () => ({ ...held }), commits, put(path, text) { held[path] = text; commit('from elsewhere'); } });
}
