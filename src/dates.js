// Dates are ISO strings (YYYY-MM-DD). All arithmetic is in UTC, so daylight saving never shifts a day.

import { tr } from './lang.js';

const DAY_MS = 86400000;

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toMs(iso) {
  const p = iso.split('-');
  return Date.UTC(+p[0], +p[1] - 1, +p[2]);
}

function fromMs(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && fromMs(toMs(s)) === s;
}

export function addDays(iso, n) {
  return fromMs(toMs(iso) + n * DAY_MS);
}

// days from a to b; negative when b is before a
export function daysBetween(a, b) {
  return Math.round((toMs(b) - toMs(a)) / DAY_MS);
}

// 0 = Monday … 6 = Sunday
export function weekday(iso) {
  return (new Date(toMs(iso)).getUTCDay() + 6) % 7;
}

// today by the local clock; never stored in the plan (DESIGN.md 6.7)
export function clockToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// "5 Oct", in the language in use
export function shortDate(iso) {
  return +iso.slice(8) + ' ' + tr(MONTHS[+iso.slice(5, 7) - 1]);
}
