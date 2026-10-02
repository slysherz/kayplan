#!/usr/bin/env node
// The local server for the page: it serves the page's own files and reads and writes the plan
// files through the disk store. Node built-ins only.
//
//   node serve.js [--port 8137] [--dir <season folder>]
//
// It listens on this computer only and answers only requests made to it by name (127.0.0.1 or
// localhost), so other machines and other web pages cannot read or change the plan.

import http from 'node:http';
import fs from 'node:fs/promises';
import nodePath from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { diskStore, safePath } from './src/store-disk.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

// changes whenever any plan file changes
async function stampOf(store) {
  const hash = crypto.createHash('sha1');
  for (const path of await store.list()) {
    const f = await store.read(path);
    if (f) hash.update(path + ' ' + f.rev + '\n');
  }
  return hash.digest('hex');
}

function body(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createServer(dir) {
  const store = diskStore(dir);

  async function api(req, res, url) {
    const json = (status, value) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
    if (req.method !== 'GET') {
      // a page from another site cannot send this header without asking first, and is never told yes
      const origin = req.headers.origin;
      if (req.headers['x-kayplan'] !== '1' || (origin && origin !== 'http://' + req.headers.host)) return json(403, { error: 'forbidden' });
    }
    if (url.pathname === '/api/list' && req.method === 'GET') return json(200, { paths: await store.list() });
    if (url.pathname === '/api/stamp' && req.method === 'GET') return json(200, { stamp: await stampOf(store) });
    if (url.pathname !== '/api/file') return json(404, { error: 'not found' });
    const path = url.searchParams.get('path');
    if (!safePath(path)) return json(400, { error: 'not a plan file' });
    // the revision the caller last read: If-Match for a file, If-None-Match: * for a new one
    const rev = req.headers['if-none-match'] === '*' ? null : (req.headers['if-match'] || undefined);
    try {
      if (req.method === 'GET') {
        const f = await store.read(path);
        if (!f) return json(404, { error: 'no such file' });
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', etag: f.rev });
        return res.end(f.text);
      }
      if (req.method === 'PUT') return json(200, { rev: await store.write(path, await body(req, 1 << 20), rev) });
      if (req.method === 'DELETE') { await store.remove(path, rev); return json(200, {}); }
      return json(405, { error: 'method not allowed' });
    } catch (e) {
      if (e.code === 'conflict') return json(409, { error: 'conflict' });
      throw e;
    }
  }

  async function page(req, res, url) {
    const name = url.pathname === '/' ? '/index.html' : url.pathname;
    if (req.method !== 'GET' || !/^\/(index\.html|src\/[a-z-]+\.(js|css))$/.test(name)) { res.writeHead(404); return res.end('not found'); }
    try {
      const data = await fs.readFile(nodePath.join(HERE, name));
      res.writeHead(200, { 'content-type': TYPES[nodePath.extname(name)], 'cache-control': 'no-store' });
      res.end(data);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      res.writeHead(404);
      res.end('not found');
    }
  }

  return http.createServer((req, res) => {
    const port = req.socket.localPort, host = req.headers.host;
    if (host !== '127.0.0.1:' + port && host !== 'localhost:' + port) { res.writeHead(403); return res.end('forbidden'); }
    const url = new URL(req.url, 'http://' + host);
    (url.pathname.startsWith('/api/') ? api : page)(req, res, url).catch(e => {
      if (!res.headersSent) res.writeHead(e.status || 500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(e.status ? e.message : 'server error');
      if (!e.status) console.error(e);
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = { port: '8137', dir: nodePath.join(HERE, 'season') };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    if (!(key in opts) || args[i + 1] === undefined) { console.error('usage: node serve.js [--port 8137] [--dir <season folder>]'); process.exit(2); }
    opts[key] = args[i + 1];
  }
  const server = createServer(opts.dir);
  server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? 'port ' + opts.port + ' is in use; is Kayplan already running? Or try --port' : e.message); process.exit(1); });
  server.listen(+opts.port, '127.0.0.1', () => console.log('Kayplan is at http://127.0.0.1:' + opts.port + '/   (Ctrl+C stops it)'));
}
