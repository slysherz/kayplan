// A week as the sheet the club hands out (DESIGN.md 8.6): one column a day, each session with its
// place, its text and its notes, on one A4 page lying down. The page prints it; the command line writes it.

import { addDays } from './dates.js';
import { outline } from './notation.js';
import { weekView } from './engine.js';
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

const month = iso => (MONTH_NAMES[getLang()] || MONTH_NAMES.en)[+iso.slice(5, 7) - 1];
const day = iso => tr('{0} {1}', +iso.slice(8), month(iso));
// "5 to 11 October", or "28 September to 4 October"
const range = (a, b) => tr('{0} to {1}', a.slice(0, 7) === b.slice(0, 7) ? +a.slice(8) : day(a), day(b));

// What the sheet of one band's week holds.
// { title, season, period, file, days: [{ name, events, sessions: [{ place, alt, lines, notes }] }] }
//   title    the club's name (name: in season.txt), or the plan's
//   season   "Season 2026–27 · September/October": the months of the week's block, or of the week
//   period   the macrocycle and the week's dates
//   file     the name the sheet is saved under
//   lines    the session's text as outline lays it out; the sheet centres them, so no line is stepped in
//   alt      it is done in place of the others: these come last, under their own line
// A session with nothing written, or marked not done, is left out.
export function weekSheet(data, planId, band, n, today) {
  const w = weekView(data, planId, n, today), s = data.season;
  const first = +s.start.slice(0, 4), last = +addDays(s.start, s.weeks * 7 - 1).slice(0, 4);
  const from = w.mesoInfo ? addDays(s.start, (w.mesoInfo.from - 1) * 7) : w.monday, to = w.mesoInfo ? addDays(s.start, w.mesoInfo.to * 7 - 1) : w.sunday;
  const dates = range(w.monday, w.sunday), title = s.name || w.plan.name;
  return {
    title,
    season: tr('Season {0}', first === last ? first : first + '–' + String(last).slice(2)) + ' · ' + (month(from) === month(to) ? month(from) : month(from) + '/' + month(to)),
    period: (w.macroInfo ? w.macroInfo.name + '; ' : '') + dates,
    file: title + ' - ' + tr('Training plan') + ' ' + dates + (w.plan.bands.length > 1 ? ' - ' + band : ''),
    days: w.days.map(d => ({
      name: (WEEKDAYS[getLang()] || WEEKDAYS.en)[d.weekday],
      events: d.events.map(e => e.name),
      sessions: d.sessions.filter(x => x.band === band && !x.notDone && String(x.text || '').trim()).sort((a, b) => a.alt - b.alt).map(x => ({
        place: tr(PLACE[x.place] || 'Water'), alt: x.alt,
        lines: outline(x.text, 30).map(l => l.text),
        notes: String(x.notes || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean)
      }))
    }))
  };
}

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The sheet as a page of its own, ready to be printed or saved as a PDF.
export function sheetHtml(sh) {
  const col = d => '<td>' + d.events.map(e => '<i>' + esc(e) + '</i>').join('') +
    d.sessions.map((x, i) => (x.alt ? (i && d.sessions[i - 1].alt ? '<u>+</u>' : '<em>' + esc(tr('For those not on the water')) + ';</em>') : i ? '<u>+</u>' : '') +
      '<b>' + esc(x.place) + '</b><p>' + x.lines.map(esc).join('<br>') + '</p>' + x.notes.map(t => '<small>(' + esc(t) + ')</small>').join('')).join('') + '</td>';
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(sh.file) + '</title><style>' +
    '@page { size: A4 landscape; margin: 12mm 10mm; }' +
    'html, body { margin: 0; }' +
    'body { font: 9pt Arial, Helvetica, sans-serif; color: #000000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
    'table { width: 100%; border-collapse: collapse; table-layout: fixed; }' +
    'th, td { border: 1px solid #D0D0D0; }' +
    'caption { caption-side: top; text-align: left; color: #0000FF; border: 1px solid #000000; border-bottom: 0; }' +
    'caption h1 { margin: 0; padding: 3pt 0 5pt; text-align: center; font: bold italic 13pt Pacifico, "Comic Sans MS", cursive; border-bottom: 1px solid #D0D0D0; }' +
    'caption h2 { margin: 0; padding: 2pt 3pt; font: 9pt "Comic Sans MS", Arial, sans-serif; border-bottom: 1px solid #D0D0D0; }' +
    'caption h3 { margin: 0; padding: 1pt 3pt 1pt 9%; font: italic 7pt Arial, Helvetica, sans-serif; }' +
    'th { background: #0000FF; color: #FFFFFF; font: italic 8pt Arial, Helvetica, sans-serif; padding: 1pt 0; border-color: #0000FF; }' +
    'td { vertical-align: top; text-align: center; height: 95mm; padding: 2pt 3pt 6pt; border-left-color: #000000; border-right-color: #000000; border-bottom-color: #000000; }' +
    'td b, td i, td p, td small, td u, td em { display: block; }' +
    'td em { font-style: normal; font-size: 7pt; text-align: left; margin: 14pt 0 10pt; }' +
    'td b { font-size: 9pt; margin-bottom: 11pt; }' +
    'td i { font-size: 8pt; margin-bottom: 6pt; }' +
    'td p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.35; }' +
    'td small { font-size: 6pt; margin-top: 4pt; }' +
    'td u { text-decoration: none; margin: 4pt 0; }' +
    '</style></head><body><table><caption><h1>' + esc(sh.title) + '</h1><h2>' + esc(sh.season) + '</h2><h3>' + esc(sh.period) + '</h3></caption>' +
    '<thead><tr>' + sh.days.map(d => '<th>' + esc(d.name) + '</th>').join('') + '</tr></thead>' +
    '<tbody><tr>' + sh.days.map(col).join('') + '</tr></tbody></table></body></html>';
}
