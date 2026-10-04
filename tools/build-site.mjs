// Builds the page as plain files for a static host (GitHub Pages): index.html and the modules the
// page loads, in site/. Nothing of the plan, the course documents or the tests goes into it.
//
//   node tools/build-site.mjs [folder]      default: site/ next to this folder's parent

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// only for the command line and the local server
const NOT_THE_PAGE = ['store-disk.js', 'report.js'];

export function buildSite(out = path.join(ROOT, 'site')) {
  fs.rmSync(path.join(out, 'src'), { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'src'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(out, 'index.html'));
  const files = fs.readdirSync(path.join(ROOT, 'src')).filter(f => /\.(js|css)$/.test(f) && !NOT_THE_PAGE.includes(f));
  for (const f of files) fs.copyFileSync(path.join(ROOT, 'src', f), path.join(out, 'src', f));
  // GitHub Pages: serve the files as they are
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  return { out, files: ['index.html', ...files.map(f => 'src/' + f)] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = buildSite(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log(r.files.length + ' files in ' + r.out);
}
