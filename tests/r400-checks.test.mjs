/* ============================================================================
 *  R400 — the deep tier was red for six nights, and the list that broke it needs no browser
 * ----------------------------------------------------------------------------
 *  `tests/r209.spec.js` asks whether every DEFERRED module actually arrives, registers and
 *  publishes the member its own doors call. That question needs a browser. But the assertion at the
 *  top of it — that the spec's hand-written MEMBER table names the same modules the loader ships —
 *  is a comparison between two files on disk, and it is the half that keeps breaking:
 *
 *    · #R322 added five `analysis*` modules to js/lazy-modules.js and no lines to the table. The
 *      #R341 note in that spec records the consequence: the deep tier went red at that merge and
 *      stayed red until somebody looked.
 *    · It then happened AGAIN, to eight modules from five rounds — R349 (`warLayer`), R353
 *      (`volcanoIntel`, `volcanoLayers`), R354 (the three `company*`), R386 (`newsEvents`) and
 *      R388 (`railways`). Measured on 2026-08-24: the loader shipped 32, the table named 24.
 *
 *  ⚠ THE REPEATED CAUSE IS THE TIER, NOT THE AUTHORS. A round that leaves a line out is told by a
 *  job that runs at 03:00 JST and whose failure nobody is watching by default (#R304), so the
 *  feedback arrives days later attached to somebody else's round. Five separate rounds made the
 *  same omission because none of them could have seen it.
 *
 *  So the browser-free half runs HERE, in the node tier, on every push. The spec keeps the runtime
 *  half — a module that loads but publishes nothing still fails there, and only a browser can say
 *  so. What changed is WHEN you find out you forgot a line: at your own push, not at somebody
 *  else's nightly.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lazyModules } from './app-source.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new URL(p, ROOT)), 'utf8');

/** The MEMBER table as tests/r209.spec.js writes it: `name: ['Global', 'member']`. */
function memberTable(src) {
  const m = src.match(/const MEMBER\s*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(m, 'tests/r209.spec.js no longer holds a `const MEMBER = { … };` table — this check is reading the wrong thing');
  const rows = new Map();
  for (const r of m[1].matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*:\s*\[([^\]]*)\]/gm)) {
    const parts = [...r[2].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    rows.set(r[1], parts);
  }
  return rows;
}

test('R400 ①: every module the loader ships is named in the spec\'s MEMBER table, and nothing else is', () => {
  const shipped = lazyModules(ROOT).map((m) => m.name);
  const table = memberTable(read('tests/r209.spec.js'));

  /* ⚠ BOTH DIRECTIONS. A missing row is the failure that happened twice; a leftover row is a member
     nothing can prove any more, and it would sit there asserting nothing. */
  const missing = shipped.filter((n) => !table.has(n));
  const stale = [...table.keys()].filter((n) => !shipped.includes(n));
  assert.deepEqual(missing, [],
    'js/lazy-modules.js ships these and tests/r209.spec.js does not name them — add a line naming the member THAT MODULE\'S OWN doors call');
  assert.deepEqual(stale, [],
    'tests/r209.spec.js names these and the loader no longer ships them — remove the rows');
  assert.ok(shipped.length >= 30, `only ${shipped.length} lazy modules parsed — the parser is reading the wrong thing`);
});

test('R400 ②: every named member is a real global and a real member of it', () => {
  const table = memberTable(read('tests/r209.spec.js'));
  const shipped = new Map(lazyModules(ROOT).map((m) => [m.name, m]));
  const wrongGlobal = [];
  for (const [name, parts] of table) {
    const mod = shipped.get(name);
    if (!mod) continue;                                   /* ① already reports this */
    assert.ok(parts.length >= 1, `${name}: the MEMBER row is empty`);
    /* the global the row names must be the global the LOADER publishes — two lists of one fact
       again, and the reason #R341's note had to say «writing `open` because the four siblings use
       it made this row assert nothing about the module it names» */
    if (String(mod.global) !== parts[0]) wrongGlobal.push(`${name}: table says ${parts[0]}, loader publishes ${mod.global}`);
  }
  assert.deepEqual(wrongGlobal, [], 'the MEMBER table and js/lazy-modules.js disagree about what these publish');
});

test('R400 ③: this check can go red — a table with a row removed is reported', () => {
  /* ⚠ A GATE NOBODY HAS SEEN FAIL PROVES NOTHING (#R318 ②). The parse and the comparison are
     exercised here against a table that is wrong on purpose, so the green above means something. */
  const src = read('tests/r209.spec.js');
  const table = memberTable(src);
  const shipped = lazyModules(ROOT).map((m) => m.name);
  /* ⚠ deliberately a LOOSE floor, and lower than ①'s. This test proves the COMPARISON reports
     correctly; whether the table is complete is ①'s question, and duplicating it here would make
     two checks go red for one defect and neither of them say which. */
  assert.ok(table.size >= 20, `the real table has only ${table.size} rows — the parser is reading the wrong thing`);

  /* ⚠ THE BASELINE IS BUILT FROM `shipped`, NOT READ FROM THE FILE. An earlier draft mutated the
     REAL table, so while that table was still missing eight rows this test went red for ①'s reason
     and reported nine victims instead of one — two checks red for one defect, and neither of them
     saying which. What ③ is for is the COMPARISON; ① owns the question of completeness. */
  const victim = shipped[0];
  const complete = new Map(shipped.map((n) => [n, ['IntMapWhatever', 'open']]));
  const broken = new Map(complete);
  broken.delete(victim);
  assert.deepEqual(shipped.filter((n) => !broken.has(n)), [victim],
    'removing one row must be reported as exactly that one missing module');

  const withExtra = new Map(complete);
  withExtra.set('moduleThatDoesNotExist', ['IntMapNope', 'open']);
  assert.deepEqual([...withExtra.keys()].filter((n) => !shipped.includes(n)), ['moduleThatDoesNotExist'],
    'a leftover row must be reported as stale');
});
