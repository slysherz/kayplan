// File access on this computer's disk.
//
// A store is the one small interface the engine reads and saves through:
//   list()                    -> paths of the plan's files, relative to the season folder
//   read(path)                -> { text, rev } or null when there is no such file
//   write(path, text, rev)    -> the new rev; rev is the revision the caller last read (null for a new file)
//   remove(path, rev)
// write and remove throw an error with code 'conflict' when the file changed since that rev, so a
// stale copy never overwrites newer text. Leaving rev out skips that check.
// The GitHub store will implement the same four functions.

import fs from 'node:fs/promises';
import nodePath from 'node:path';
import crypto from 'node:crypto';

export function revOf(text) {
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex');
}

// only plain text files inside the season folder
export function safePath(path) {
  return typeof path === 'string' && /^(?:[a-z0-9][a-z0-9-]*\/)*[a-z0-9][a-z0-9-]*\.txt$/.test(path);
}

export function diskStore(root) {
  function full(path) {
    if (!safePath(path)) throw new Error('not a plan file: ' + path);
    return nodePath.join(root, ...path.split('/'));
  }
  async function read(path) {
    try {
      const text = await fs.readFile(full(path), 'utf8');
      return { text, rev: revOf(text) };
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }
  async function unchanged(path, rev) {
    if (rev === undefined) return;
    const now = await read(path);
    if ((now ? now.rev : null) !== rev) {
      const e = new Error(path + ' changed since it was read');
      e.code = 'conflict';
      throw e;
    }
  }
  return {
    async list() {
      const out = [];
      async function walk(dir, prefix) {
        let entries;
        try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
        for (const ent of entries) {
          if (ent.isDirectory()) await walk(nodePath.join(dir, ent.name), prefix + ent.name + '/');
          else if (safePath(prefix + ent.name)) out.push(prefix + ent.name);
        }
      }
      await walk(root, '');
      return out.sort();
    },
    read,
    async write(path, text, rev) {
      await unchanged(path, rev);
      const target = full(path), tmp = target + '.tmp';
      await fs.mkdir(nodePath.dirname(target), { recursive: true });
      await fs.writeFile(tmp, text, 'utf8');
      await fs.rename(tmp, target);
      return revOf(text);
    },
    async remove(path, rev) {
      await unchanged(path, rev);
      await fs.rm(full(path), { force: true });
    }
  };
}
