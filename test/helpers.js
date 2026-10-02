// A store kept in memory, and one small invented season, for the tests.
// Test data never uses real people: plans and bands have made-up labels.

export function memoryStore(files) {
  const held = { ...files };
  let count = 0;
  const revs = {};
  for (const p of Object.keys(held)) revs[p] = 'r' + (++count);
  return {
    files: held,
    async list() { return Object.keys(held).sort(); },
    async read(path) { return path in held ? { text: held[path], rev: revs[path] } : null; },
    async write(path, text, rev) {
      if (rev !== undefined && (path in held ? revs[path] : null) !== rev) { const e = new Error('changed'); e.code = 'conflict'; throw e; }
      held[path] = text;
      return (revs[path] = 'r' + (++count));
    },
    async remove(path) { delete held[path]; delete revs[path]; }
  };
}

export const TABLES = `load  I 60  C 80  CH 100  R 50  AT 55  CT 40
reference  R0 60'  R1 120'  R2 60'  R3 30'  R3+ 15'  R4 10'  R5 4'30''  R6 2'  R7 10'
pace default  R0 7  R1 9.5  R2 11  R3 12  R3+ 12.8  R4 13.5  R5 14.5  R6 16  R7 13
`;

export const CYCLES = `First macro
  3 intro  R1-R2  General one
  4 build  R2     General two
Second macro
  3 build  R3     Specific
  2 comp   R7     Racing
`;

// 12 weeks from Monday 5 Jan 2026
export function fixture() {
  return {
    'season.txt': 'start: 2026-01-05\nweeks: 12\n',
    'tables.txt': TABLES,
    'events.txt': `2026-02-14 Spring regatta
  confirmed: no
  place: Lake
  kind: race
  type: sprint
  boats: solo
  plans: group-a 1

2026-02-16 Carnival break
  until: 2026-02-22
  kind: holiday

2026-03-07 Long race
  until: 2026-03-08
  kind: race
  type: maratona
  boats: mixed
  plans: group-b 3
`,
    'plans/group-a/plan.txt': 'name: Group A\nbands: older, younger\n',
    'plans/group-a/cycles.txt': CYCLES,
    'plans/group-a/weeks.txt': '2026-01-19 R\n2026-02-02 C 70\n',
    'plans/group-a/sessions.txt': `2026-01-20 pm older: 1km R1 + 8x 4' R2/1' R0 + 1km R1
  crew boats on the last four

  watch the stroke rate
2026-01-20 pm younger: 2x2000m
2026-01-22 am older not-done: 6km R1 + 4x(15'' R7 + 15'' R0)
  no water
2026-01-24 am older: 20' R1 + 4x 10'' R6/2' + 10' R1
`,
    'plans/group-b/plan.txt': 'name: Group B\nbands: masters\n',
    'plans/group-b/cycles.txt': 'Only macro\n  12 none  -  Unplanned\n',
    'plans/group-b/weeks.txt': '',
    'plans/group-b/sessions.txt': ''
  };
}
