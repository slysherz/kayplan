import test from 'node:test';
import assert from 'node:assert/strict';
import { load, nameOf, check } from '../src/engine.js';
import { suggestions, SHOWN } from '../src/suggest.js';
import { parseLibrary, serializeLibrary } from '../src/format.js';
import { suggestReport } from '../src/report.js';
import { weekSheet, sheetHtml } from '../src/export.js';
import { setLang } from '../src/lang.js';
import { parseSeason, serializeSeason } from '../src/format.js';
import { memoryStore, fixture, LIBRARY } from './helpers.js';

const TODAY = '2026-01-06';
const R2A = "R2: 3x(4'-6'-6'-4'/1')/3'", R2B = "R2: 2x(4x 5'/1')/3'", R3 = "R3: 4x(3x 2'/30'')/6'", R6 = "R6: 3x(3x 50/3')/6'";
const HAD_R2 = "1km R1 + 8x 4' R2/1' R0 + 1km R1", HAD_R6 = "20' R1 + 4x 10'' R6/2' + 10' R1";

async function season(change) {
  const files = fixture();
  if (change) change(files);
  return load(memoryStore(files));
}
const texts = r => r.list.map(x => x.text);

test('library.txt: one session a line, the place in front when off the water, notes under it', () => {
  const r = parseLibrary(LIBRARY);
  assert.deepEqual(r.errors, []);
  assert.equal(r.value.length, 7);
  assert.deepEqual([r.value[2].place, r.value[2].text], ['water', R2A]);
  assert.deepEqual([r.value[6].place, r.value[6].text, r.value[6].notes], ['gym', '4-6 exercises, 2-3x 10-15 reps', 'tempo 2:2']);
  assert.equal(serializeLibrary(r.value), LIBRARY);
});

test('a season with no library.txt loads, and suggests only what the band has had', async () => {
  const data = await season(f => { delete f['library.txt']; });
  assert.deepEqual(data.errors, []);
  assert.deepEqual(texts(suggestions(data, 'group-a', 'older', '2026-02-03', 1, TODAY)), [HAD_R2, HAD_R6]);
});

test('an empty week: one of each zone in turn, the zones the block is missing first', async () => {
  const data = await season();
  // week 2 is in the block R1-R2 and has no session: R1 needs 4 and R2 needs 3, then the zones to maintain
  const r = suggestions(data, 'group-a', 'older', '2026-01-13', 1, TODAY);
  assert.deepEqual(r.zones.filter(z => z.missing).map(z => z.zone), ['R1', 'R2']);
  assert.deepEqual(r.zones.map(z => z.zone), ['R1', 'R2', 'R3', 'R3+', 'R4', 'R5', 'R6', 'R7']);
  assert.equal(r.list.length, SHOWN);
  assert.deepEqual(texts(r), ["60' R1", R2A, R3, R6, '10km R1']);
  assert.deepEqual(r.list.map(x => x.main), ['R1', 'R2', 'R3', 'R6', 'R1']);
  assert.deepEqual(r.list.map(x => Math.round(x.min)), [60, 60, 24, 2, 63]);
  // six lines on the water, and the two sessions the band has later in the season
  assert.equal(r.total, 8);
  assert.equal(suggestions(data, 'group-a', 'older', '2026-01-13', 1, TODAY, { limit: 3 }).list.length, 3);
});

test('in a zone, the session the band had last time comes first', async () => {
  const data = await season();
  // week 4, block R2: R2 was last trained on 20 Jan, R6 on 24 Jan
  const r = suggestions(data, 'group-a', 'older', '2026-01-27', 1, TODAY);
  assert.deepEqual(texts(r), [HAD_R2, "60' R1", R3, HAD_R6, R2A]);
  assert.deepEqual(r.list.map(x => x.used), ['2026-01-20', null, null, '2026-01-24', null]);
  // a session already in the week counts: with three R2 sessions R2 is no longer missing and comes after
  const full = await season(f => { f['plans/group-a/sessions.txt'] += "2026-01-26 older: 40' R2\n2026-01-28 older: 40' R2\n2026-01-29 older: 40' R2\n"; });
  const q = suggestions(full, 'group-a', 'older', '2026-01-27', 1, TODAY);
  assert.deepEqual(q.zones.filter(z => z.missing), []);
  assert.equal(q.list[0].main, 'R1');
});

test('asking for a zone lists every suggestion of that zone', async () => {
  const data = await season();
  const r = suggestions(data, 'group-a', 'older', '2026-01-27', 1, TODAY, { zone: 'R2' });
  assert.deepEqual(texts(r), [HAD_R2, R2A, R2B]);
  assert.equal(r.total, 3);
});

test('words narrow the list, in any place and whatever the week is for', async () => {
  const data = await season();
  assert.deepEqual(texts(suggestions(data, 'group-a', 'older', '2026-01-13', 1, TODAY, { query: "5'" })), [R2B]);
  assert.deepEqual(texts(suggestions(data, 'group-a', 'older', '2026-01-13', 1, TODAY, { query: 'r2 4' })), [R2A, R2B, HAD_R2]);
  const gym = suggestions(data, 'group-a', 'older', '2026-01-13', 1, TODAY, { query: 'GYM' });
  assert.deepEqual(gym.list.map(x => [x.place, x.main, x.notes]), [['gym', null, 'tempo 2:2']]);
  assert.deepEqual(texts(suggestions(data, 'group-a', 'older', '2026-01-13', 1, TODAY, { query: 'nothing like this' })), []);
});

test('the place: the water unless another is chosen, and off the water on a day with no water', async () => {
  const data = await season();
  assert.deepEqual(suggestions(data, 'group-a', 'older', '2026-01-13', 1, TODAY, { place: 'gym' }).list.map(x => x.place), ['gym']);
  assert.deepEqual(texts(suggestions(data, 'group-a', 'older', '2026-01-13', 1, TODAY, { place: 'pool' })), []);
  const dry = await season(f => { f['events.txt'] += '\n2026-01-12 River in flood\n  until: 2026-01-14\n  kind: no-water\n'; });
  assert.deepEqual(dry.errors, []);
  assert.deepEqual(suggestions(dry, 'group-a', 'older', '2026-01-13', 1, TODAY).list.map(x => x.place), ['gym']);
  assert.equal(suggestions(dry, 'group-a', 'older', '2026-01-15', 1, TODAY).list[0].place, 'water');
});

test('a recovery week takes only light sessions, the smaller first', async () => {
  const data = await season();
  // week 3 is set to R by hand
  const r = suggestions(data, 'group-a', 'older', '2026-01-21', 1, TODAY);
  assert.deepEqual(texts(r), ["60' R1", '10km R1']);
  // asking for a zone is still answered
  assert.deepEqual(texts(suggestions(data, 'group-a', 'older', '2026-01-21', 1, TODAY, { zone: 'R3' })), [R3]);
});

test('a competition week takes race pace, speed and easy paddling', async () => {
  const data = await season(f => { f['library.txt'] += "2x(4x 250/1')/10' R7\n"; });
  // weeks 11 and 12 are the block "comp"
  const r = suggestions(data, 'group-a', 'older', '2026-03-17', 1, TODAY);
  assert.deepEqual([...new Set(r.list.map(x => x.main))], ['R7', 'R6', 'R1']);
  assert.equal(r.list[0].text, "2x(4x 250/1')/10' R7");
});

test('a zone the band is not given is left out', async () => {
  const data = await season();
  // "younger" has R1 and R6 only
  const r = suggestions(data, 'group-a', 'younger', '2026-01-13', 1, TODAY, { limit: 99 });
  assert.deepEqual(r.zones.map(z => z.zone), ['R1', 'R6']);
  assert.deepEqual(texts(r), ["60' R1", R6, '10km R1']);
  // the band's own history is its own: "2x2000m" has no zone and is not suggested
  assert.equal(r.total, 3);
});

test('a session that would be too close to another comes last', async () => {
  const data = await season(f => { f['plans/group-a/sessions.txt'] += "2026-01-13 older:\n2026-01-13 older: 5km R1 + 5x 4' R3/4' R1\n"; });
  const r = suggestions(data, 'group-a', 'older', '2026-01-14', 1, TODAY, { limit: 99 });
  const clash = r.list.filter(x => x.clash);
  assert.deepEqual(clash.map(x => x.main), ['R3', 'R3']);
  assert.deepEqual(r.list.slice(-2), clash);
  assert.ok(!r.list.slice(0, SHOWN).some(x => x.clash));
  // two days later it is far enough
  assert.ok(!suggestions(data, 'group-a', 'older', '2026-01-15', 1, TODAY, { limit: 99 }).list.some(x => x.clash));
  // volume first with quality after it on the same day: the R1 sessions clash
  const am = suggestions(data, 'group-a', 'older', '2026-01-13', 1, TODAY, { zone: 'R1' });
  assert.deepEqual(am.list.map(x => x.clash), [true, true]);
});

test('the slot being filled is not counted, and a session marked not done is not suggested', async () => {
  const data = await season();
  const r = suggestions(data, 'group-a', 'older', '2026-01-20', 1, TODAY, { limit: 99 });
  assert.ok(!texts(r).includes(HAD_R2));
  assert.ok(!texts(r).some(t => /R7/.test(t)));
});

test('show suggestions: the list as text', async () => {
  const data = await season();
  assert.equal(suggestReport(data, 'group-a', 'older', '2026-01-27', 1, TODAY, { zone: 'R2' }),
    "group-a · older · 2026-01-27 · session 1 · week 4 (C) · missing R2\n" +
    "  R2  32'  1km R1 + 8x 4' R2/1' R0 + 1km R1  last 2026-01-20\n" +
    "  R2  60'  R2: 3x(4'-6'-6'-4'/1')/3'\n" +
    "  R2  40'  R2: 2x(4x 5'/1')/3'");
  assert.match(suggestReport(data, 'group-a', 'older', '2026-01-13', 1, TODAY), /\n {2}5 of 8$/);
  assert.match(suggestReport(data, 'group-a', 'older', '2026-01-13', 1, TODAY, { place: 'pool' }), /\n {2}nothing$/);
});

test('check: a library line on the water with no zone is a warning', async () => {
  const { check } = await import('../src/engine.js');
  const data = await season(f => { f['library.txt'] += "8x 4'/1'\nyoga\ngym: circuit\n"; });
  assert.deepEqual(check(data, TODAY).filter(p => p.file === 'library.txt').map(p => [p.level, p.line, p.message]),
    [['warning', 9, '"8x 4\'/1\'" has no zone and is never suggested'], ['warning', 10, '"yoga" has no zone and is never suggested']]);
});

test('library.txt: a line can have a name, and a session with the same text is shown by it', async () => {
  const lib = "Ladder one = R2: 3x(4'-6'-6'-4'/1')/3'\ngym: Circuit = 4-6 exercises\n60' R1\n";
  const r = parseLibrary(lib);
  assert.deepEqual(r.value.map(x => [x.place, x.name, x.text]), [['water', 'Ladder one', "R2: 3x(4'-6'-6'-4'/1')/3'"], ['gym', 'Circuit', '4-6 exercises'], ['water', '', "60' R1"]]);
  assert.equal(serializeLibrary(r.value), lib);
  const data = await season(f => { f['library.txt'] = lib + "Ladder one = 50' R1\n"; });
  // the spaces and the case do not count; another text is another session
  assert.equal(nameOf(data, { text: "r2: 3x( 4'-6'-6'-4' / 1' )/3'", place: 'water' }), 'Ladder one');
  assert.equal(nameOf(data, { text: "R2: 3x(4'-6'-6'-4'/1')/2'", place: 'water' }), '');
  assert.equal(nameOf(data, { text: '4-6 exercises', place: 'water' }), '');
  const got = suggestions(data, 'group-a', 'older', '2026-02-03', 1, TODAY, { query: 'ladder' });
  assert.deepEqual(got.list.map(x => [x.name, x.text]), [['Ladder one', "R2: 3x(4'-6'-6'-4'/1')/3'"], ['Ladder one', "50' R1"]]);
  assert.deepEqual(check(data, TODAY).filter(p => p.file === 'library.txt').map(p => [p.level, p.line, p.message]), [['warning', 4, 'The name "Ladder one" is also on line 1']]);
});

test('the week sheet: a column a day, each session with its place, its lines and its notes', async () => {
  const data = await season(f => {
    f['season.txt'] = 'name: The Club\n' + f['season.txt'];
    f['plans/group-a/sessions.txt'] = "2026-01-20 older gym: circuit <A>\n" + f['plans/group-a/sessions.txt'] + "2026-01-21 older:\n2026-01-20 older gym alt: long circuit\n2026-01-20 older land alt: 45-60' R1\n";
  });
  assert.equal(data.season.name, 'The Club');
  assert.equal(parseSeason(serializeSeason(data.season)).value.name, 'The Club');
  const sh = weekSheet(data, 'group-a', 'older', 3, TODAY);
  assert.deepEqual([sh.title, sh.period.replace(/^.*; /, ''), sh.file], ['The Club', '19 to 25 January', 'The Club - Training plan 19 to 25 January - older']);
  assert.match(sh.season, /^Season 2026 · /);
  assert.deepEqual(sh.days.map(d => d.name), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  // in the day's order, the alternatives last; the other band, the empty session and the one not done are left out
  assert.deepEqual(sh.days[1].sessions, [
    { place: 'Gym', alt: false, lines: ['circuit <A>'], notes: [] },
    { place: 'Water', alt: false, lines: ['1km R1', "8x 4' R2/1' R0", '1km R1'], notes: ['crew boats on the last four', 'watch the stroke rate'] },
    { place: 'Gym', alt: true, lines: ['long circuit'], notes: [] },
    { place: 'Run', alt: true, lines: ["45-60' R1"], notes: [] }]);
  assert.deepEqual([sh.days[2].sessions, sh.days[3].sessions], [[], []]);
  const html = sheetHtml(sh);
  assert.match(html, /<b>Gym<\/b><p>circuit &lt;A&gt;<\/p><u>\+<\/u><b>Water<\/b><p>1km R1<br>8x 4' R2\/1' R0<br>1km R1<\/p><small>\(crew boats on the last four\)<\/small><small>\(watch the stroke rate\)<\/small><em>For those not on the water;<\/em><b>Gym<\/b><p>long circuit<\/p><u>\+<\/u><b>Run<\/b><p>45-60' R1<\/p><\/td>/);
  // an alternative counts for nothing: not in the km, the grid, the checks or what is suggested
  const plain = await season(f => { f['plans/group-a/sessions.txt'] = "2026-01-20 older gym: circuit <A>\n" + f['plans/group-a/sessions.txt'] + "2026-01-21 older:\n"; });
  const { kmView } = await import('../src/km.js'), { gridView } = await import('../src/grid.js');
  assert.deepEqual(kmView(data, 'group-a', 'older', TODAY).weeks[2], kmView(plain, 'group-a', 'older', TODAY).weeks[2]);
  assert.deepEqual(gridView(data, 'group-a', 'older', TODAY), gridView(plain, 'group-a', 'older', TODAY));
  assert.ok(!suggestions(data, 'group-a', 'older', '2026-02-03', 1, TODAY, { limit: 99 }).list.some(x => x.text === 'long circuit'));
  assert.match(html, /@page \{ size: A4 landscape/);
  setLang('pt');
  try {
    const pt = weekSheet(data, 'group-a', 'older', 5, TODAY);
    assert.deepEqual([pt.period.replace(/^.*; /, ''), pt.days[1].name], ['2 a 8 de Fevereiro', 'Terça']);
    assert.equal(weekSheet(data, 'group-a', 'older', 4, TODAY).period.replace(/^.*; /, ''), '26 de Janeiro a 1 de Fevereiro');
  } finally { setLang('en'); }
});
