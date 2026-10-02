import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tr, dec, setLang, getLang, PT } from '../src/lang.js';
import { ZINFO, zoneCard } from '../src/zones.js';
import { MONTHS, DAYS, shortDate } from '../src/dates.js';
import { distanceText } from '../src/notation.js';
import * as cycles from '../src/cycles.js';
import { parseTables, parseCycles } from '../src/format.js';
import { TABLES, CYCLES } from './helpers.js';

// every text the code hands to tr(), read from the source, plus the tables that are looked up by value
function texts() {
  const dir = new URL('../src/', import.meta.url);
  const found = new Set();
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/\btr\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g)) found.add(new Function('return ' + m[1])());
  }
  for (const z of Object.values(ZINFO)) for (const [k, v] of Object.entries(z)) { if (k !== 'recovery') for (const x of [].concat(v)) found.add(x); }
  for (const x of [...MONTHS, ...DAYS]) found.add(x);
  return found;
}

test('Portuguese: every text has a translation, and no translation is left over', () => {
  const used = texts();
  assert.deepEqual([...used].filter(k => !(k in PT)), []);
  assert.deepEqual(Object.keys(PT).filter(k => !used.has(k)), []);
});

test('Portuguese: a translation fills in the same things as the English', () => {
  const holes = s => (s.match(/\{\d\}/g) || []).sort().join(' ');
  for (const [en, pt] of Object.entries(PT)) {
    assert.equal(holes(pt), holes(en), en);
    assert.ok(pt.trim() === pt && pt.length > 0, en);
  }
});

test('the language in use decides the words and the decimal mark', () => {
  try {
    assert.equal(getLang(), 'en');
    assert.equal(tr('weeks {0}–{1}', 6, 9), 'weeks 6–9');
    assert.equal(tr('a text nobody translated'), 'a text nobody translated');
    assert.equal(dec(5.94, 1), '5.9');
    setLang('pt');
    assert.equal(tr('weeks {0}–{1}', 6, 9), 'semanas 6–9');
    assert.equal(tr('a text nobody translated'), 'a text nobody translated');
    assert.equal(dec(5.94, 1), '5,9');
    assert.equal(dec(12), '12');
    assert.equal(shortDate('2026-10-05'), '5 Out');
    assert.equal(distanceText(5940), '5,9 km');
    // a refusal, a default name and a zone card
    const plan = { id: 'group-a', macros: parseCycles(CYCLES).value, hand: [], sessions: [] };
    assert.throws(() => cycles.splitMeso(plan, 1, 6, 6), /as semanas que já terminaram não podem ser movidas/);
    assert.equal(cycles.splitMacro(plan, 0, 6, 0).macros[1].name, 'Novo macrociclo');
    const card = zoneCard('R4', parseTables(TABLES).value, 'younger');
    assert.equal(card.name, 'Capacidade láctica (tolerância)');
    assert.deepEqual(card.rows.map(r => r[0]), ['Intensidade', 'Como treinar', 'Por semana', 'Na sessão', 'Na época', 'Desenvolve-se', 'Perde-se', 'Com travão', 'Escalões']);
    const row = label => card.rows.find(r => r[0] === label)[1];
    assert.equal(row('Por semana'), 'Desenvolver: 2–4 sessões. Manter: 1. Contado em conjunto com R5. Recuperação depois de uma sessão: 48–72 h.');
    assert.match(row('Escalões'), /Não sugerido para younger\.$/);
    assert.equal(row('Perde-se'), 'Cerca de 18 ± 4 dias sem treino.');
    assert.equal(zoneCard('R4', parseTables(TABLES + 'zone-km older  R4 35.2\n').value, 'older').rows.pop()[1], 'older 35,2');
    setLang('xx');
    assert.equal(getLang(), 'en');
  } finally { setLang('en'); }
});
