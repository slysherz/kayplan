// File access through GitHub: the plan's files are in a folder of a repository, read and written with
// GitHub's API. The same store interface as store-disk.js, plus stamp(), as store-http.js has.
//
// rev is the file's blob id. A write is one commit; it carries the rev that was read, and GitHub
// refuses it when the file has changed since, which is the 'conflict' of the interface.
//
// settings: { repo: 'owner/name', token, dir: 'season', branch, api, fetch }
//   branch  the repository's default branch unless given
//   api     https://api.github.com unless given
//   fetch   the fetch to use (the tests give their own)
// An error carries code 'auth' when the token is refused and 'missing' when the repository or the
// folder cannot be found with it.

// text <-> base64 of its UTF-8 bytes
function encode(text) {
  let s = '';
  for (const b of new TextEncoder().encode(text)) s += String.fromCharCode(b);
  return btoa(s);
}
function decode(b64) {
  const s = atob(String(b64).replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(s, c => c.charCodeAt(0)));
}

export function githubStore(settings) {
  const api = (settings.api || 'https://api.github.com').replace(/\/$/, ''), repo = settings.repo, dir = (settings.dir || 'season').replace(/^\/+|\/+$/g, '');
  const send = settings.fetch || ((...a) => fetch(...a));
  const base = api + '/repos/' + repo;
  const at = path => base + '/contents/' + (dir + '/' + path).split('/').map(encodeURIComponent).join('/');
  let branch = settings.branch || null;
  let head = null;              // { sha, tree, etag }: the branch's last commit as last seen
  const old = new Set();        // commits this store has written over; GitHub may still answer with one for a moment
  let shas = null;              // path -> blob id, from the last list
  const texts = new Map();      // blob id -> text

  function fail(message, code) {
    throw Object.assign(new Error(message), code ? { code } : {});
  }
  async function call(method, url, body, headers) {
    const res = await send(url, {
      method, cache: 'no-store', keepalive: method !== 'GET',
      headers: { accept: 'application/vnd.github+json', authorization: 'Bearer ' + settings.token, 'x-github-api-version': '2022-11-28', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401 || res.status === 403) fail('GitHub refused the token (' + res.status + ')', 'auth');
    return res;
  }
  async function json(res) {
    if (!res.ok) fail('GitHub answered ' + res.status);
    return res.json();
  }
  async function branchName() {
    if (!branch) {
      const res = await call('GET', base);
      if (res.status === 404) fail('there is no repository ' + repo + ' for this token', 'missing');
      branch = (await json(res)).default_branch;
    }
    return branch;
  }
  // the branch's last commit; an unchanged answer costs nothing of the hourly allowance
  async function latest() {
    const res = await call('GET', base + '/commits/' + encodeURIComponent(await branchName()), null, head && head.etag ? { 'if-none-match': head.etag } : {});
    if (res.status === 304) return head;
    if (res.status === 404 || res.status === 409) fail('there is no branch ' + branch + ' in ' + repo, 'missing');
    const c = await json(res);
    if (!(head && old.has(c.sha))) head = { sha: c.sha, tree: c.commit.tree.sha, etag: res.headers.get('etag') };
    return head;
  }
  // the blob id of one file as GitHub has it now, or null
  async function current(path) {
    const res = await call('GET', at(path) + '?ref=' + encodeURIComponent(await branchName()));
    if (res.status === 404) return null;
    return (await json(res)).sha;
  }
  // PUT or DELETE one file against the rev that was read
  async function change(method, path, text, rev) {
    const sha = rev === undefined ? await current(path) : rev;
    const body = { message: 'Kayplan: ' + path, branch: await branchName() };
    if (text !== null) body.content = encode(text);
    if (sha) body.sha = sha;
    for (let tries = 0; ; tries++) {
      const res = await call(method, at(path), body);
      if (res.ok) {
        const done = await res.json();
        if (head) old.add(head.sha);
        head = { sha: done.commit.sha, tree: done.commit.tree.sha, etag: null };
        return done.content ? done.content.sha : null;
      }
      if (res.status !== 409 && res.status !== 422 && res.status !== 404) fail('GitHub answered ' + res.status);
      // refused: because the file changed, or only because another commit landed at the same moment
      if (await current(path) !== (sha || null) || tries >= 3) fail(path + ' changed since it was read', 'conflict');
    }
  }

  return {
    // GitHub is asked less often than the local server
    every: 20000,
    async list() {
      const h = await latest();
      const res = await call('GET', base + '/git/trees/' + h.tree + '?recursive=1');
      const tree = (await json(res)).tree;
      shas = new Map();
      for (const e of tree) {
        if (e.type === 'blob' && e.path.startsWith(dir + '/') && /\.txt$/.test(e.path)) shas.set(e.path.slice(dir.length + 1), e.sha);
      }
      if (!shas.size && !tree.some(e => e.path === dir)) fail('there is no folder ' + dir + ' in ' + repo, 'missing');
      return [...shas.keys()].sort();
    },
    async read(path) {
      if (!shas) await this.list();
      const sha = shas.get(path);
      if (!sha) return null;
      if (!texts.has(sha)) texts.set(sha, decode((await json(await call('GET', base + '/git/blobs/' + sha))).content));
      return { text: texts.get(sha), rev: sha };
    },
    async write(path, text, rev) {
      // the same text again is not a new commit
      if (rev && texts.get(rev) === text) return rev;
      const sha = await change('PUT', path, text, rev);
      texts.set(sha, text);
      if (shas) shas.set(path, sha);
      return sha;
    },
    async remove(path, rev) {
      await change('DELETE', path, null, rev);
      if (shas) shas.delete(path);
    },
    async stamp() {
      return (await latest()).sha;
    }
  };
}
