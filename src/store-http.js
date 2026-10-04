// File access for the page, through the local server (serve.js).
// The same store interface as store-disk.js, plus stamp(), which changes whenever any file changes
// and is what live reload watches.

export function httpStore(base) {
  const root = base || '';
  const at = path => root + '/api/file?path=' + encodeURIComponent(path);
  async function call(url, options) {
    const res = await fetch(url, options);
    if (res.status === 409) throw Object.assign(new Error('the file changed since it was read'), { code: 'conflict' });
    return res;
  }
  function sent(rev) {
    const headers = { 'x-kayplan': '1' };
    if (rev === null) headers['if-none-match'] = '*';
    else if (rev !== undefined) headers['if-match'] = rev;
    return headers;
  }
  async function ok(res) {
    if (!res.ok) throw new Error('the server answered ' + res.status);
    return res;
  }
  return {
    async list() {
      return (await (await ok(await call(root + '/api/list'))).json()).paths;
    },
    async read(path) {
      const res = await call(at(path));
      if (res.status === 404) return null;
      await ok(res);
      return { text: await res.text(), rev: res.headers.get('etag') };
    },
    async write(path, text, rev) {
      // keepalive lets a save that was just sent finish when the page is being closed
      const res = await ok(await call(at(path), { method: 'PUT', headers: sent(rev), body: text, keepalive: true }));
      return (await res.json()).rev;
    },
    async remove(path, rev) {
      await ok(await call(at(path), { method: 'DELETE', headers: sent(rev) }));
    },
    async stamp() {
      return (await (await ok(await call(root + '/api/stamp'))).json()).stamp;
    }
  };
}
