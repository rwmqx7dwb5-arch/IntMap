/* ============================================================================
 *  R497 — THE VOLCANO TABLE WAS COUNTING ROWS IT COULD NOT NAME
 * ----------------------------------------------------------------------------
 *  #R495 registered `volcanoes` as a table of the cross-dataset query engine and read its rows as
 *  `p.name` / `p.elev` / `p.type` / `p.last`. data/volcanoes_gvp.json uses ONE-LETTER keys — `n`,
 *  `c`, `t`, `e`, `y`, `v` — so every one of those was `undefined`. Measured on production the day
 *  it shipped: 「coastKm >= 300」 answered **127 volcanoes**, all of them with an empty name and a
 *  null elevation. The COUNT was right, which is exactly why nothing caught it.
 *
 *  ⚠ THE LESSON THIS FILE ENCODES: a table's shape passing is not the table working. #R495's own
 *  rule ② says a column may not appear without its source; a column that appears with its source
 *  and nothing IN it breaks the same rule from the inside. So these checks read VALUES out of the
 *  shipped file through the module's own accessor names, and refuse a row set that is merely
 *  the right length.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { codeOnly } from '../scripts/code-only.mjs';   /* the forbidden names below appear in this round's own COMMENT explaining them */

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const GVP = JSON.parse(read('data/volcanoes_gvp.json'));

test('R497 ①: the shipped GVP file really does use one-letter keys', () => {
  const feats = GVP.features || [];
  assert.ok(feats.length > 1000, `${feats.length} volcanoes`);
  const p = feats[0].properties || {};
  for (const k of ['n', 'c', 't', 'e', 'y', 'v']) {
    assert.ok(k in p, `data/volcanoes_gvp.json no longer carries «${k}» — js/atlas-query.js reads it`);
  }
  /* and NOT the long ones the broken code guessed at */
  for (const k of ['name', 'elev', 'type', 'last']) {
    assert.ok(!(k in p), `«${k}» now exists too — decide which one js/atlas-query.js should read`);
  }
});

test('R497 ②: js/atlas-query.js reads the keys the file actually has', () => {
  const eng = read('js/atlas-query.js');
  const i = eng.indexOf('async function volcanoRows');
  assert.ok(i > 0, 'the volcanoes table is gone');
  /* ⚠ CODE ONLY. The guessed names are quoted in this round's own comment explaining what they
     broke, and a check that reads comments would be asserting about prose. */
  const body = codeOnly(eng.slice(i, eng.indexOf('\n  }', i)));
  assert.match(body, /name: p\.n \|\| ''/, 'the name comes from `n`');
  assert.match(body, /elevM: num\(p\.e\)/, 'the elevation comes from `e`');
  assert.match(body, /kind: p\.t \|\| ''/, 'the type comes from `t`');
  assert.match(body, /country: p\.c \|\| ''/, 'the country comes from `c`');
  assert.match(body, /p\.v != null/, 'the id is the GVP volcano number');
  /* the guessed names must not come back */
  for (const bad of ['p.name', 'p.elev', 'p.type', 'p.last', 'p.lastEruption', 'p.num']) {
    assert.ok(!body.includes(bad), `js/atlas-query.js reads «${bad}», which the file does not have`);
  }
});

test('R497 ③: reading the real file that way produces NAMED rows with real numbers', () => {
  /* the same conversion the module performs, applied to the shipped data — a row set that is the
     right LENGTH and empty of content is what shipped, so length is not what this asserts */
  const rows = [];
  for (const f of (GVP.features || [])) {
    const c = f.geometry && f.geometry.coordinates; if (!c) continue;
    const p = f.properties || {};
    rows.push({ id: String(p.v != null ? p.v : (p.n || '')), name: p.n || '', lng: +c[0], lat: +c[1],
      country: p.c || '', elevM: (p.e == null || isNaN(+p.e)) ? null : +p.e, kind: p.t || '',
      lastEruption: p.y != null ? String(p.y) : '' });
  }
  assert.ok(rows.length > 1000);
  const named = rows.filter((r) => r.name.length > 1).length;
  const withElev = rows.filter((r) => r.elevM != null).length;
  const withCountry = rows.filter((r) => r.country.length > 1).length;
  assert.ok(named / rows.length > 0.99, `only ${named} of ${rows.length} volcanoes have a name`);
  assert.ok(withElev / rows.length > 0.95, `only ${withElev} of ${rows.length} have an elevation`);
  assert.ok(withCountry / rows.length > 0.95, `only ${withCountry} of ${rows.length} have a country`);
  /* every id is unique, or the join would collapse rows onto one another */
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'volcano ids are not unique');
  /* a known row, spelled out, so a silent reshuffle of the columns is visible */
  const fuji = rows.find((r) => /^Fuji/i.test(r.name));
  assert.ok(fuji, 'Fuji is not in the record');
  assert.equal(fuji.country, 'Japan');
  assert.ok(fuji.elevM > 3000 && fuji.elevM < 4000, `Fuji is ${fuji.elevM} m`);
  assert.ok(Math.abs(fuji.lng - 138.73) < 0.5 && Math.abs(fuji.lat - 35.36) < 0.5, 'Fuji is where Fuji is');
});

test('R497 ④: the two facts the row carries are reachable as columns, and documented', () => {
  const eng = read('js/atlas-query.js');
  assert.match(eng, /col\('country', \['volcanoes'\]/, 'the volcano country is a column');
  assert.match(eng, /col\('lastEruptionYear', \['volcanoes'\]/, 'the last known eruption is a column');
  /* #R115's rule: a column the catalogue does not name does not exist for the planner */
  const cat = read('js/atlas-catalog-text.js');
  const block = cat.slice(cat.indexOf('CROSS-DATASET QUERY'), cat.indexOf("' },", cat.indexOf('CROSS-DATASET QUERY')));
  assert.match(block, /volcanoes \(Smithsonian GVP, offline\)[^·]*country/, 'the catalogue names the country column');
  assert.match(block, /lastEruptionYear/, 'the catalogue names the last-eruption column');
});
