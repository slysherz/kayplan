import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlan, infer, minutesText, amountText } from '../src/notation.js';
import { parseTables } from '../src/format.js';
import { TABLES } from './helpers.js';

const tables = parseTables(TABLES).value;

// "R2 32' · R1 13' · R0 8'", the most intense zone first, as the session view shows it
function working(text, band) {
  return infer(text, tables, band || 'any').parts.slice().reverse().map(p => p.zone + ' ' + minutesText(p.min)).join(' · ');
}

test('reads the examples of DESIGN.md 8.1', () => {
  assert.deepEqual(parsePlan('2x2000m'), { '?': { sec: 0, m: 4000 } });
  assert.deepEqual(parsePlan("8x 4' R2/1' R0"), { R2: { sec: 1920, m: 0 }, R0: { sec: 480, m: 0 } });
  assert.deepEqual(parsePlan("3x(8x 30''/30'')"), { '?': { sec: 720, m: 0 }, rest: { sec: 720, m: 0 } });
  assert.deepEqual(parsePlan("1km R1 + 2x(2' ED + 1' R0)"), { R1: { sec: 0, m: 1000 }, '?': { sec: 240, m: 0 }, R0: { sec: 120, m: 0 } });
  assert.deepEqual(parsePlan("5x(3x 150/100)/6'"), { '?': { sec: 0, m: 2250 }, rest: { sec: 1800, m: 1500 } });
});

test('reads the notation as it is typed in the coach notes', () => {
  assert.deepEqual(parsePlan("8x 4' R2/1'R0"), { R2: { sec: 1920, m: 0 }, R0: { sec: 480, m: 0 } });
  assert.deepEqual(parsePlan("2x(6x2'30'' R2 / 30'')"), { R2: { sec: 1800, m: 0 }, rest: { sec: 360, m: 0 } });
  assert.deepEqual(parsePlan('3x 250m + 2x 500m'), { '?': { sec: 0, m: 1750 } });
  assert.deepEqual(parsePlan('3x 2000m R2'), { R2: { sec: 0, m: 6000 } });
  assert.deepEqual(parsePlan("10' R1 + 2x 200m com bola solo + 2x pares + 10' R1"), { R1: { sec: 1200, m: 0 }, '?': { sec: 0, m: 400 } });
  // a rep range counts as its middle
  assert.deepEqual(parsePlan("(7-10)x 4'R2 + 1'R1"), { R2: { sec: 2040, m: 0 }, R1: { sec: 60, m: 0 } });
  assert.deepEqual(parsePlan('yoga'), {});
  assert.deepEqual(parsePlan(''), {});
});

test('accepts typographic quotes, decimal commas and pyramids', () => {
  assert.deepEqual(parsePlan('8x 4′ R2/1′ R0'), parsePlan("8x 4' R2/1' R0"));
  assert.deepEqual(parsePlan('6x 30″ R5'), { R5: { sec: 180, m: 0 } });
  assert.deepEqual(parsePlan('6x 30” R5'), { R5: { sec: 180, m: 0 } });
  assert.deepEqual(parsePlan('1,5km R1'), { R1: { sec: 0, m: 1500 } });
  assert.deepEqual(parsePlan("3x(4'-6'-4' R2/1')/3'"), { R2: { sec: 2520, m: 0 }, rest: { sec: 720, m: 0 } });
});

test('zone variants are read as their base zone', () => {
  assert.deepEqual(parsePlan("10' R1F"), { R1: { sec: 600, m: 0 } });
  assert.deepEqual(parsePlan("4x 2' R3+"), { 'R3+': { sec: 480, m: 0 } });
  assert.deepEqual(parsePlan("10' R2+"), { R2: { sec: 600, m: 0 } });
  assert.deepEqual(parsePlan("6x 10'' R6+/2'"), { R6: { sec: 60, m: 0 }, rest: { sec: 720, m: 0 } });
  assert.deepEqual(parsePlan("5' r2"), { R2: { sec: 300, m: 0 } });
  // not a zone: R8, or R2 run into a word
  assert.deepEqual(parsePlan("5' R8"), { '?': { sec: 300, m: 0 } });
  assert.deepEqual(parsePlan("5' R2x"), { '?': { sec: 300, m: 0 } });
});

test('a place name stands for its distance', () => {
  const places = [{ name: 'Dock-Bridge', m: 1000 }, { name: 'Dock', m: 50 }];
  assert.deepEqual(parsePlan('2x Dock-Bridge R2', places), { R2: { sec: 0, m: 2000 } });
  assert.deepEqual(parsePlan('2x dock-bridge R2 + 4x Dock R6', places), { R2: { sec: 0, m: 2000 }, R6: { sec: 0, m: 200 } });
  assert.deepEqual(parsePlan('2x Dockside R2', places), {});
  assert.deepEqual(parsePlan('2x Dock-Bridge R2'), {});
});

test('main zone: the examples of DESIGN.md 8.1.1', () => {
  assert.equal(infer("1km R1 + 8x 4' R2/1' R0 + 1km R1", tables, 'any').main, 'R2');
  assert.equal(working("1km R1 + 8x 4' R2/1' R0 + 1km R1"), "R2 32' · R1 13' · R0 8'");

  assert.equal(infer("6km R1 + 4x(15'' R7 + 15'' R0)", tables, 'any').main, 'R1');
  assert.equal(working("6km R1 + 4x(15'' R7 + 15'' R0)"), "R7 1' · R1 38' · R0 1'");

  assert.equal(infer("20' R1 + 4x 10'' R6/2' + 10' R1", tables, 'any').main, 'R6');
  assert.equal(working("20' R1 + 4x 10'' R6/2' + 10' R1"), "R6 40'' · R1 30'");

  const none = infer('2x2000m', tables, 'any');
  assert.equal(none.main, null);
  assert.deepEqual(none.parts, []);
  assert.deepEqual(none.unzoned, { sec: 0, m: 4000 });
  assert.equal(amountText(none.unzoned), '4 km');
});

test('main zone: R0 only when no other zone appears', () => {
  assert.equal(infer("20' R0 games", tables, 'any').main, 'R0');
  assert.equal(infer("50' R0 + 1' R1", tables, 'any').main, 'R1');
  assert.equal(infer('yoga', tables, 'any').main, null);
});

test('main zone: each zone is measured against its own full session', () => {
  const r = infer("30' R1 + 10' R3", tables, 'any');
  assert.equal(r.main, 'R3');
  assert.deepEqual(r.parts.map(p => [p.zone, +p.share.toFixed(3)]), [['R1', 0.25], ['R3', 0.333]]);
});

test('a band with its own pace uses it, and the default for the other zones', () => {
  const t = parseTables(TABLES + 'pace slow  R1 4.75\n').value;
  assert.equal(Math.round(infer('1km R1', t, 'slow').parts[0].min * 10), 126);
  assert.equal(Math.round(infer('1km R1', t, 'other').parts[0].min * 10), 63);
  assert.equal(Math.round(infer('1100m R2', t, 'slow').parts[0].min), 6);
});

test('amounts as text', () => {
  assert.equal(minutesText(31.6), "32'");
  assert.equal(minutesText(0.667), "40''");
  assert.equal(amountText({ sec: 600, m: 800 }), "800 m + 10'");
  assert.equal(amountText({ sec: 0, m: 1500 }), '1.5 km');
});
