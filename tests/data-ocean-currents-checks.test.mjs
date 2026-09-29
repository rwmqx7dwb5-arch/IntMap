/* ============================================================================
 *  Ocean currents — the bundled dataset (data/ocean-currents.json, the gridded field files) and the ONE
 *  layer that draws it (js/ocean-currents.js, js/ocean-currents-field.js).
 * ----------------------------------------------------------------------------
 *  Gathered from tests/r208-checks ⑧ (traced through a measured field, warm/cold derived; one layer
 *  left), tests/r219-checks ④ (a bundled dataset in five languages) and tests/r222-checks ①–③ (the field
 *  as a gridded binary, the enlarged named plate, the level-of-detail contract). Titles keep the round
 *  that wrote them.
 *
 *  ⚠ RELATIONS, NOT THIS ROUND'S NUMBERS (#R199/#R203). The data is read as data; the field decoder is a
 *  window IIFE and is RUN on the real file; what the layer draws on a live map is read and says so.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DOC = () => JSON.parse(read('data/ocean-currents.json'));

/* ═══ #R208 ⑧ THE PATHS ARE TRACED THROUGH A MEASURED FIELD ════════════════════════════════════ */

test('R208 ⑧a: the paths are traced through a measured field, and warm/cold is derived', () => {
  const p = join(ROOT, 'data', 'ocean-currents.json');
  assert.ok(existsSync(p), 'data/ocean-currents.json is built (scripts/build-ocean-currents.mjs)');
  const doc = DOC();
  /* ⚠ NOT the dataset that was approved: #R207 stopped on the Maps.com licence, and the Data Basin copy
     answered `allow_anonymous_download: false`. (#R221) it was rebuilt from three NOAA products, all U.S.
     Government works in the public domain. The CLAIM is unchanged: the file names where its numbers came
     from and states the licence. */
  assert.ok(/NOAA/.test(doc.source) && /public domain/i.test(doc.attribution), 'the source is named and its licence stated');
  assert.ok(/traced/i.test(doc.attribution) && /seed/i.test(doc.attribution), 'and it says which part is measured and which part is editorial');
  assert.ok(doc.named.length >= 20, `${doc.named.length} named currents`);
  /* ⚠ (#R222) `doc.arrows` IS GONE and the claim it carried is not: "more than 3,000 arrows" is now
     "more than 3,000 measured cells", read where the data now lives. */
  assert.ok(doc.field && doc.field.cells > 3000, `${doc.field && doc.field.cells} measured cells`);
  assert.ok(existsSync(join(ROOT, 'data', 'ocean-currents-field.bin.gz')), 'the field file ships');
  for (const c of doc.named) {
    assert.ok(c.en && c.ja, `${c.en}: both names`);
    assert.ok(['warm', 'cold', 'zonal'].includes(c.kind), `${c.en}: kind "${c.kind}"`);
    assert.ok(c.path.length >= 6, `${c.en}: ${c.path.length} vertices is not a path`);
    /* every vertex is a real coordinate, and no path jumps the antimeridian mid-line */
    let prev = null;
    for (const [lng, lat] of c.path) {
      assert.ok(lng >= -180 && lng <= 180 && lat >= -85 && lat <= 85, `${c.en}: ${lng},${lat}`);
      if (prev) assert.ok(Math.abs(lng - prev) < 180, `${c.en} crosses the seam inside one line`);
      prev = lng;
    }
    /* ⚠ the classification must AGREE with the number it was derived from — if these can disagree, one
       of them is decoration. (#R221) the poleward component called the Benguela WARM, the Canary zonal and
       the West Australian warm, so warm and cold are MEASURED as temperatures (the current's SST against
       the zonal mean at its latitude), and `kindFrom` records which rule answered. */
    if (c.kindFrom === 'sst') {
      const k = c.sstAnomK > 0.6 ? 'warm' : (c.sstAnomK < -0.6 ? 'cold' : 'zonal');
      assert.equal(c.kind, k, `${c.en}: kind ${c.kind} but ΔT ${c.sstAnomK} K`);
    } else {
      const k = c.polewardMs > 0.012 ? 'warm' : (c.polewardMs < -0.012 ? 'cold' : 'zonal');
      assert.equal(c.kind, k, `${c.en}: kind ${c.kind} but poleward ${c.polewardMs}`);
    }
  }
  /* the four best-known western boundary currents carry warm water poleward */
  const by = Object.fromEntries(doc.named.map((c) => [c.en, c]));
  for (const n of ['Gulf Stream', 'Kuroshio', 'East Australian Current', 'Agulhas Current']) {
    assert.ok(by[n], `${n} is missing`);
    assert.equal(by[n].kind, 'warm', `${n} is a warm western boundary current`);
  }
  /* …and these carry cold water equatorward */
  for (const n of ['Labrador Current', 'Oyashio', 'California Current', 'Benguela Current']) {
    assert.ok(by[n], `${n} is missing`);
    assert.equal(by[n].kind, 'cold', `${n} is a cold eastern boundary / subpolar current`);
  }
  assert.ok(by['Gulf Stream'].maxSpeed > 0.6, `Gulf Stream max ${by['Gulf Stream'].maxSpeed} m/s`);
});

/* ⚠ (#R224) REWRITTEN, BECAUSE THE LAYER #R208 TESTED NO LONGER EXISTS. 「海流レイヤー、二つあるなんて
   いうややこしいことするな。統一しろ。」 js/ocean-currents.js is the one implementation, and the
   properties #R208 protected are asserted where they now live.
   ⚠ READ, NOT RUN: the classes, colours and labels are a MapLibre style the layer adds to a live map. */
test('R208 ⑧b: warm red, cold blue, zonal neither — in the ONE surviving layer', () => {
  const oc = read('js/ocean-currents.js');
  assert.ok(/warm/.test(oc) && /cold/.test(oc), 'the plate still classifies warm/cold');
  assert.ok(/zonal/i.test(oc), 'and a genuinely zonal current is still neither, rather than forced into one of the two');
  assert.ok(/'text-field':\['get','name'\]|"text-field":\["get","name"\]/.test(oc), 'the currents are named on the map');
});

/* ⚠ READ, NOT RUN: the absence of a second implementation and the session migration are claims about
   the text of two app modules. */
test('R208 ⑧c (#R224): there is exactly ONE ocean-current layer left', () => {
  const dl = read('js/data-layers.js');
  assert.ok(!/\['oceancur','lyrOceanCur'\]/.test(dl), 'no row in the Oceans & maritime list');
  assert.ok(!/function addOceanCurrents/.test(dl), 'no second drawing implementation');
  assert.ok(!/function showOceanCurLegend/.test(dl), 'no second legend');
  assert.ok(!/lyr-oceancur/.test(dl), 'no second set of layer ids');
  /* …and a session that had the old row ticked is carried over to the surviving one */
  const st = read('js/session-tabs.js');
  assert.match(st, /dl-oceancur/, 'the migration knows the retired id');
  assert.match(st, /wp-dl-currents/, 'and where it goes');
});

/* ═══ #R219 ④ A BUNDLED DATASET, IN FIVE LANGUAGES ═══════════════════════════════════════════ */

test('R219 ④ data/ocean-currents.json ships every current in all five languages', () => {
  const d = DOC();
  assert.ok(Array.isArray(d.named) && d.named.length >= 20);
  /* (#R222) the global flow field is still required — it is a gridded file now, not `arrows` */
  assert.ok(d.field && d.field.cells > 1000, 'the global flow field must be there');
  for (const c of d.named) {
    for (const l of ['en', 'ja', 'de', 'ru', 'es']) assert.ok(c[l] && c[l].length > 1, c.en + ' is missing ' + l);
    assert.ok(['warm', 'cold', 'zonal'].includes(c.kind), c.en + ' has kind ' + c.kind);
    assert.ok(Array.isArray(c.path) && c.path.length >= 5, c.en + ' has no traced path');
  }
  /* ⚠ READ (this half): what the layer fetches is a property of every URL in the module */
  const src = read('js/ocean-currents.js');
  assert.ok(src.includes('data/ocean-currents.json'), 'the layer must read the bundled file');
  assert.ok(!/marine-api\.open-meteo|query\.wikidata\.org/.test(src),
    'the rebuilt layer must not fetch the field or the names — it is a fixed dataset (#R219)');
});

/* ═══ #R222 ① ② ③ THE FIELD, THE PLATE, THE LEVEL OF DETAIL ═════════════════════════════════ */

test('#R222 ① the ocean-current field ships as a gridded binary the client can stride', () => {
  const doc = DOC();
  assert.ok(!('arrows' in doc), 'doc.arrows is gone — the field is a grid file now');
  assert.ok(doc.field && doc.field.file && doc.field.nx && doc.field.ny, 'the JSON describes the field file');
  assert.equal(doc.field.gridDeg, 0.25, 'the field keeps the source grid');
  assert.ok(doc.field.cells > 100000, `${doc.field.cells} cells with flow`);
  const buf = gunzipSync(readFileSync(join(ROOT, doc.field.file)));
  assert.equal(buf.toString('ascii', 0, 4), 'IMOC', 'the magic');
  assert.equal(buf.readUInt8(4), 1, 'format version 1');
  const planes = buf.readUInt8(5), nx = buf.readUInt16LE(6), ny = buf.readUInt16LE(8);
  assert.equal(planes, 1, 'the annual file is one plane');
  assert.equal(nx, doc.field.nx); assert.equal(ny, doc.field.ny);
  assert.equal(buf.length, 16 + planes * nx * ny * 2, 'exactly two bytes a cell, no padding');
  /* the decoded field has to contain a fast western boundary current somewhere */
  const sp = buf.subarray(16, 16 + nx * ny);
  let max = 0; for (let i = 0; i < sp.length; i++) if (sp[i] > max) max = sp[i];
  const SPMAX = buf.readUInt16LE(12) / 1000;
  assert.ok(SPMAX * (max / 255) ** 2 > 0.5, 'the fastest cell is a real boundary current');
});

test('#R222 ① …and the twelve monthly climatologies are their own file, fetched only on demand', () => {
  const doc = DOC();
  assert.ok(doc.months && doc.months.file, 'the months are described');
  const buf = gunzipSync(readFileSync(join(ROOT, doc.months.file)));
  assert.equal(buf.toString('ascii', 0, 4), 'IMOC');
  assert.equal(buf.readUInt8(5), 12, 'twelve planes, one per calendar month');
  /* ⚠ READ (this half): WHEN the 3 MB file is fetched is the live layer's network behaviour */
  const oc = read('js/ocean-currents.js');
  assert.ok(/loadMonths/.test(oc), 'the months file has its own loader');
  const setM = oc.slice(oc.indexOf('function setMonth('), oc.indexOf('function setMonth(') + 400);
  assert.ok(/m>0&&!months/.test(setM.replace(/\s/g, '')) && /loadMonths\(\)/.test(setM), 'and it is only fetched when a month is actually chosen');
  assert.ok(!/loadMonths\(\)/.test(oc.slice(oc.indexOf('function load('), oc.indexOf('function loadField('))),
    'switching the layer on must not pull the 3 MB seasonal file');
  /* every named current carries its twelve monthly speeds and the along-path projection */
  const withM = doc.named.filter((c) => Array.isArray(c.monthSpeed) && c.monthSpeed.length === 12);
  assert.ok(withM.length > doc.named.length * 0.9, `${withM.length}/${doc.named.length} carry a season`);
  assert.ok(doc.named.every((c) => !c.monthAlong || c.monthAlong.length === 12));
});

test('#R222 ② the named plate is the enlarged one, in all five languages', () => {
  const doc = DOC();
  assert.ok(doc.named.length >= 95, `only ${doc.named.length} named currents`);
  for (const c of doc.named) {
    for (const l of ['en', 'ja', 'de', 'ru', 'es']) assert.ok(c[l] && c[l].length > 1, `${c.en} is missing ${l}`);
    assert.ok(Array.isArray(c.path) && c.path.length >= 4, `${c.en} has no path`);
  }
  /* the marginal-sea and coastal currents #R222 added must actually have traced */
  for (const en of ['Tsugaru Current', 'East Korea Warm Current', 'Taiwan Warm Current',
    'East African Coastal Current', 'Cape Horn Current', 'Yucatán Current']) {
    assert.ok(doc.named.some((c) => c.en === en), `${en} is missing from the plate`);
  }
});

test('#R222 ③ the field decoder strides the grid so the mark count is bounded at every zoom', () => {
  /* RUN: the module is a window IIFE, so it is evaluated with a stand-in window (the #R221 pattern) */
  const win = {};
  new Function('window', read('js/ocean-currents-field.js'))(win);
  const F = win.IntMapCurrentField;
  assert.ok(F && F.arrows && F.strideFor, 'the decoder publishes its surface');
  const field = F.parse(gunzipSync(readFileSync(join(ROOT, DOC().field.file))).buffer);
  const cap = 4200;
  const world = F.arrows(field, 0, { w: -180, e: 180, s: -80, n: 82 }, cap);
  const bay = F.arrows(field, 0, { w: 139, e: 141, s: 34, n: 36 }, cap);
  assert.ok(world.features.length <= cap, `${world.features.length} marks for the world`);
  assert.ok(bay.features.length <= cap, `${bay.features.length} marks for a bay`);
  assert.ok(world.grid > bay.grid, 'a wider view is drawn coarser');
  assert.equal(bay.grid, field.grid, 'a small view reaches the source grid itself');
  /* a strided mark is the vector mean of its block, so no mark may exceed the file's ceiling */
  assert.ok(world.features.every((f) => f.properties.s <= field.spMax + 1e-6));
  assert.ok(world.features.every((f) => f.properties.b >= -180 && f.properties.b <= 180));
});
