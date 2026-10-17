// A week as the sheet the club hands out (DESIGN.md 8.6), made to look like the club's own: a Google
// Sheets page saved as PDF, A4 lying down, one column a day. Every line of text is a row of the
// spreadsheet, so the rows line up across the days: the places, the "+" between sessions, the line
// for those not on the water. The page prints it; the command line writes it.

import { partsOf } from './notation.js';
import { weekView, noteParts } from './engine.js';
import { tr, getLang } from './lang.js';

// the days and the months in full, here and not in lang.js, where "May" is already the short name
const WEEKDAYS = {
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  pt: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
};
const MONTH_NAMES = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  pt: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
};
const PLACE = { water: 'Water', pool: 'Pool', gym: 'Gym', land: 'Run' };
// how many characters of a session's text fit in a day's column, and of a title at the bottom
const WIDTH = 40, BOX = 34;

const month = iso => (MONTH_NAMES[getLang()] || MONTH_NAMES.en)[+iso.slice(5, 7) - 1];
const day = iso => tr('{0} {1}', +iso.slice(8), month(iso));
// "5 to 11 October", or "28 September to 4 October"
const range = (a, b) => tr('{0} to {1}', a.slice(0, 7) === b.slice(0, 7) ? +a.slice(8) : day(a), day(b));

// A session's text as the club writes it: on one line, or wrapped at a "+" when it is too long for
// the column, the line that goes on ending with the "+".
export function wrapped(text, width) {
  const t = String(text || '').replace(/\s+/g, ' ').trim(), head = /^R[0-7]\+?F?\s*:\s*/i.exec(t);
  const parts = partsOf(head ? t.slice(head[0].length) : t);
  if (head && parts.length) parts[0] = head[0].trim() + ' ' + parts[0];
  const lines = [];
  for (const p of parts) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + 3 + p.length <= width) lines[last] += ' + ' + p;
    else { if (last >= 0) lines[last] += ' +'; lines.push(p); }
  }
  return lines;
}

// Lines no longer than width: wrapped at a "+" first, then a line still too long at its spaces.
export function fitted(text, width) {
  return wrapped(text, width).flatMap(line => {
    const out = [];
    for (const word of line.split(' ')) {
      const last = out.length - 1;
      if (last >= 0 && out[last].length + 1 + word.length <= width) out[last] += ' ' + word; else out.push(word);
    }
    return out;
  });
}

// What the sheet of one band's week holds: the plan's sessions and the band's own. With no band, the
// plan's sessions alone.
// { title, season, period, dates, file, days: [{ name, events, sessions: [{ place, alt, title, lines, notes }] }], anyDay, notes }
//   title    the club's name (name: in season.txt), or the plan's
//   season   "Season 2026- October": the year and the months of the week
//   period   the macrocycle's name, or ''
//   dates    "12 to 18 October"
//   file     the name the sheet is saved under; it names the band only in a plan with several bands
//            and when the band has something of its own that week: otherwise the sheet is the plan's
//   title    the session's title (or its library name) as lines, [] when it has none
//   lines    the session's text as wrapped lays it out
//   alt      it is done in place of the others: these come last, under their own line
//   anyDay   the sessions of the whole week, done on any day of it, at the bottom like the club's gym
//            tables: [{ title, lines }], the title its title (or its library name), after its place in the
//            pool or on land (the water and the gym go without); the lines each part of its text, then
//            its notes
//   notes    what the band has for the whole week, each in its own place on the sheet:
//            { warm: the lines of its notes, inside the frame under the days (a blank line is a blank row),
//              phrase: its lines, on rows of their own at the bottom }
// A session with nothing written, or marked not done, is left out.
export function weekSheet(data, planId, band, n, today) {
  const w = band ? weekView(data, planId, n, today, band) : weekView(data, planId, n, today), s = data.season;
  const dates = range(w.monday, w.sunday), title = s.name || w.plan.name;
  const written = x => (band || !x.band) && !x.notDone && !!(String(x.text || '').trim() || x.name);
  const own = !!band && ([...w.days.flatMap(d => d.sessions), ...w.week].some(x => x.band && written(x)) ||
    Object.values(noteParts(w.plan, w.monday, band)).some(t => String(t).trim()));
  const shown = list => list.filter(written).sort((a, b) => a.alt - b.alt).map(x => ({
    place: tr(PLACE[x.place] || 'Water'), alt: x.alt,
    title: x.name ? fitted(x.name, WIDTH) : [],
    lines: wrapped(x.text, WIDTH),
    notes: String(x.notes || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean)
  }));
  return {
    title,
    season: tr('Season {0}- {1}', w.monday.slice(0, 4), month(w.monday) === month(w.sunday) ? month(w.monday) : month(w.monday) + '/' + month(w.sunday)),
    period: w.macroInfo ? w.macroInfo.name : '',
    dates,
    file: title + '- ' + tr('Training plan') + ' ' + dates + (w.plan.bands.length > 1 && own ? ' - ' + band : ''),
    days: w.days.map(d => ({
      name: (WEEKDAYS[getLang()] || WEEKDAYS.en)[d.weekday],
      // with no band, only the events of the whole plan
      events: d.events.filter(e => band || e.bands.length === w.plan.bands.length).map(e => e.name),
      sessions: shown(d.sessions)
    })),
    anyDay: w.week.filter(written).sort((a, b) => a.alt - b.alt).map(x => {
      const where = x.place === 'water' || x.place === 'gym' ? '' : tr(PLACE[x.place]);
      return {
        title: where || x.name ? fitted(where && x.name ? where + ': ' + x.name : where || x.name, BOX) : [],
        lines: [...partsOf(String(x.text || '')).flatMap(p => fitted(p, BOX)), ...String(x.notes || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean)]
      };
    }),
    notes: notesOf(w.notes[band || ''])
  };
}

// ---- the grid -------------------------------------------------------------------------------------

// A cell: { t: text, k: kind }. Kinds: place, name (a session's title), text, note, plus (between two sessions), label (the line
// before the alternatives), event, warm (a line of the week's notes), head and item (the title and a
// line of a session of the whole week, at the bottom), quote (the week's phrase).
const cell = (t, k) => ({ t, k });

// The rows of the days, each seven cells (null for an empty one). The sessions of a day are stacked
// as the club does it: the place, a blank row, the title, the text, the notes; the next one after a "+", with no
// blank row; then the alternatives after a line of their own. Each stack takes the rows of its
// tallest day, so that what comes next starts on the same row in every column.
export function dayRows(sh) {
  const rows = [];
  // one block of rows from a list of stacks, one per column
  const block = stacks => {
    const h = Math.max(0, ...stacks.map(s => s.length));
    for (let r = 0; r < h; r++) rows.push(Array.from({ length: 7 }, (_, c) => (stacks[c] || [])[r] || null));
  };
  // titled: how many rows of titles the block has, so that a day with none leaves them empty
  const stack = (x, first, titled) => [...(first ? [] : [cell('+', 'plus')]), cell(x.place, 'place'), ...(first ? [null] : []),
    ...Array.from({ length: titled }, (_, r) => x.title[r] ? cell(x.title[r], 'name') : null),
    ...x.lines.map(t => cell(t, 'text')), ...x.notes.map(t => cell('(' + t + ')', 'note'))];
  const sessions = (lists, label) => {
    if (!lists.some(l => l.length)) return;
    if (label) {
      if (rows.length) block([[null]]);
      block(lists.map(l => l.length ? [cell(label, 'label'), null] : []));
    }
    for (let i = 0; i < Math.max(...lists.map(l => l.length)); i++) {
      const titled = Math.max(...lists.map(l => l[i] ? l[i].title.length : 0));
      block(lists.map(l => l[i] ? stack(l[i], i === 0, titled) : []));
    }
  };
  block(sh.days.map(d => d.events.map(t => cell(t, 'event'))));
  sessions(sh.days.map(d => d.sessions.filter(x => !x.alt)));
  sessions(sh.days.map(d => d.sessions.filter(x => x.alt)), tr('For those not on the water') + ';');
  // as tall as the club's sheet at least, and a blank row under the last line
  while (rows.length < 18 || rows[rows.length - 1].some(Boolean)) rows.push(Array(7).fill(null));
  return rows;
}

// The week's notes and phrase as the sheet shows them.
function notesOf(n) {
  const lines = t => {
    const out = String(t || '').split(/\r?\n/).map(x => x.trim());
    while (out.length && !out[0]) out.shift();
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
  };
  return {
    warm: lines(n && n.notes),
    phrase: lines(n && n.phrase).filter(Boolean)
  };
}

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The sheet as a page of its own, ready to be printed or saved as a PDF. The sizes are those of the
// club's sheet: Google Sheets fits the spreadsheet to the width of the page, which makes its rows 9.5 pt high.
export function sheetHtml(sh) {
  const G = '#D9D9D9', K = '#000000', B = '#0000FF';
  const rows = [];
  // a row: its height, its cells (null, or { t, k, span }), the colour of the line under each column
  // and on the right of each column, and of the line on the left of the first
  const row = (h, cells, under, right, left, cls) => rows.push({ h, cells, under, right, left, cls });
  const all = c => Array(7).fill(c);
  const frame = c => [...Array(6).fill(c), K];
  const empty = () => Array(7).fill(null);

  row(9.5, empty(), all(K), all(G), G);
  row(19.8, [{ t: sh.title, k: 'title', span: 7 }], all(G), all(K), K);
  row(12.2, [{ t: sh.season, k: 'season', span: 7 }], all(K), all(K), K);
  // the club's sheet has only its grey lines in the row of the dates, the frame's sides included,
  // and black lines between the days' names
  row(9.4, [sh.period ? cell(sh.period + ';', 'period') : null, cell(sh.dates, 'dates'), null, null, null, null, null], all(K), all(G), G);
  row(9.4, sh.days.map(d => cell(d.name, 'day')), all(K), all(K), K, 'days');
  const body = dayRows(sh), parts = sh.notes;
  body.forEach((cells, i) => row(9.5, cells, all(i === body.length - 1 ? K : G), all(K), K));
  parts.warm.forEach((t, i) => row(9.5, [t ? cell(t, 'warm') : null, ...Array(6).fill(null)], all(i === parts.warm.length - 1 ? K : G), frame(G), K));

  // the sessions of the whole week, four to a band of rows, in every other column, each in a black box
  // as the club's gym tables: the title in bold italic with a line under it, a blank row, the lines, a
  // blank row; a box with no title starts with its lines
  for (let i = 0; i < sh.anyDay.length; i += 4) {
    const band = sh.anyDay.slice(i, i + 4), cols = band.map((_, j) => j * 2);
    const top = Math.max(...band.map(b => b.title.length)), from = top + (top ? 1 : 0);
    const h = from + Math.max(...band.map(b => b.lines.length)) + 1;
    const sides = Array.from({ length: 7 }, (_, c) => cols.includes(c) || cols.includes(c + 1) ? K : G);
    // the row above the band carries the top of the boxes
    row(9.5, empty(), Array.from({ length: 7 }, (_, c) => cols.includes(c) ? K : G), all(G), G);
    for (let r = 0; r < h; r++) {
      const cells = empty();
      band.forEach((b, j) => { cells[j * 2] = r < top ? (b.title[r] ? cell(b.title[r], 'head') : null) : r >= from && r - from < b.lines.length ? cell(b.lines[r - from], 'item') : null; });
      // a line under each box's own title, and under its last row
      const under = Array.from({ length: 7 }, (_, c) => { const b = band[c / 2]; return cols.includes(c) && ((b.title.length && r === b.title.length - 1) || r === h - 1) ? K : G; });
      row(9.5, cells, under, sides, cols.includes(0) ? K : G);
    }
  }
  if (parts.phrase.length) {
    for (let r = 0; r < 3; r++) row(9.5, empty(), all(G), all(G), G);
    for (const q of parts.phrase) row(14.4, [{ t: q, k: 'quote', span: 7 }], all(G), all(G), G);
  }

  const td = (c, i, r) => {
    const style = 'border-right-color:' + r.right[i + (c && c.span ? c.span - 1 : 0)] + ';border-bottom-color:' + r.under[i] + (i === 0 ? ';border-left:0.5pt solid ' + r.left : '');
    return '<td' + (c && c.span ? ' colspan="' + c.span + '"' : '') + ' style="' + style + '"' + (c ? ' class="' + c.k + '"' : '') + '>' + (c ? '<div><span>' + esc(c.t) + '</span></div>' : '') + '</td>';
  };
  const line = r => {
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const c = r.cells[i];
      cells.push(td(c, i, r));
      if (c && c.span) i += c.span - 1;
    }
    return '<tr style="height:' + r.h + 'pt"' + (r.cls ? ' class="' + r.cls + '"' : '') + '>' + cells.join('') + '</tr>';
  };

  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(sh.file) + '</title>' +
    // the club's fonts where the computer has them, else free ones with the same widths: Liberation Sans
    // for Arial, Comic Relief for Comic Sans; Pacifico is free
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pacifico&amp;family=Comic+Relief:wght@400;700&amp;display=block">' +
    '<style>' +
    '@page { size: A4 landscape; margin: 0; }' +
    'html, body { margin: 0; }' +
    'body { padding: 53.5pt 18pt 0 17.5pt; color: #000000; font: 5.85pt Arial, "Liberation Sans", Arimo, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
    'table { width: 806.5pt; border-collapse: separate; border-spacing: 0; table-layout: fixed; }' +
    'td { padding: 0 1.8pt 0.9pt; border: 0 solid; border-right-width: 0.5pt; border-bottom-width: 0.5pt; vertical-align: bottom; white-space: nowrap; overflow: visible; line-height: 1; }' +
    'tr:first-child td { border-top: 0.5pt solid ' + G + '; }' +
    // text wider than its cell goes over the next ones, as in a spreadsheet, and hides their lines
    'td div { display: flex; justify-content: center; }' +
    'td span { background: #FFFFFF; }' +
    '.place { font-weight: bold; }' +
    '.note { font-size: 4pt; }' +
    '.plus { font-size: 6.3pt; }' +
    '.label div, .warm div, .item div, .head div, .dates div, .season div { justify-content: flex-start; }' +
    '.period div { justify-content: flex-end; }' +
    '.label, .warm, .item { font-size: 4.7pt; }' +
    '.head, .name { font-weight: bold; font-style: italic; }' +
    '.title { font: bold 10pt Pacifico, "Comic Sans MS", "Comic Relief", cursive; color: ' + B + '; vertical-align: middle; }' +
    '.season { font: 6.4pt "Comic Sans MS", "Comic Relief", cursive; color: ' + B + '; vertical-align: middle; }' +
    '.period, .dates { font-style: italic; color: ' + B + '; }' +
    '.days td { background: ' + B + '; color: #FFFFFF; font-style: italic; }' +
    '.period span, .dates span, .title span, .season span, .days span { background: transparent; }' +
    '.quote { font: bold italic 8.8pt "Comic Sans MS", "Comic Relief", cursive; vertical-align: middle; }' +
    '</style></head><body><table><colgroup>' + '<col>'.repeat(7) + '</colgroup><tbody>' +
    rows.map(line).join('') + '</tbody></table></body></html>';
}
