/* ============================================================================
 *  IntMap · #R198 checks — the label ladder, the admin-1 layer, the world gazetteer
 * ----------------------------------------------------------------------------
 *  Three claims this round makes that a regex over the source cannot check, so all three are
 *  checked by RUNNING something (#R197's lesson):
 *    ① every non-place label is smaller than the place-label reference AT EVERY ZOOM — derived from
 *       js/label-scale.js's own tables, not from a copy of them here;
 *    ② the admin-1 layer is wired everywhere a place-label layer has to be wired;
 *    ③ 3,482 new gazetteer rows do not cost the deterministic locator a single labelled headline —
 *       measured by registering them into js/newsgeo.js and re-scoring the same corpus.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* js/label-scale.js publishes window.IntMapLabelScale and touches nothing else (the same shape
   js/place-framing.js has since #R183), which is what lets it be exercised without a browser. */
function loadScale() {
  const win = { addEventListener() {} };
  new Function('window', read('js/label-scale.js'))(win);
  return win.IntMapLabelScale;
}

/* ═══ ① THE LADDER ════════════════════════════════════════════════════════════════════════════ */

test('R198 ①a: REF really is the pointwise maximum of the place classes', () => {
  const LS = loadScale();
  for (let z = 0; z <= 22; z += 0.1) {
    const zz = Math.round(z * 10) / 10, ref = LS.refAt(zz);
    for (const kind of Object.keys(LS.PLACE)) {
      assert.ok(LS.placeAt(kind, zz) <= ref + 1e-9,
        `place('${kind}') is ${LS.placeAt(kind, zz)} at z${zz}, above the REF ladder's ${ref} — ` +
        'raise REF or lower the class, but the cap for every non-place label is derived from REF');
    }
  }
});

test('R198 ①b: every non-place label is strictly smaller than the place reference, at every zoom', () => {
  const LS = loadScale();
  /* w > 1 must be clamped: sub() exists to make this inequality unbreakable by its callers. */
  for (const w of [0.5, 0.78, 0.82, 0.86, 0.9, 0.92, 0.95, 1, 1.5, 99]) {
    for (let z = 0; z <= 22; z += 0.1) {
      const zz = Math.round(z * 10) / 10;
      assert.ok(LS.subAt(zz, w) < LS.refAt(zz),
        `sub(${w}) is ${LS.subAt(zz, w)} at z${zz}, not below the place reference ${LS.refAt(zz)}`);
    }
  }
});

test('R198 ①c: every place class is SMALLER than it was before this round', () => {
  const LS = loadScale();
  /* the pre-#R198 curves, read off the layers they were written on (js/place-labels.js, js/time-borders.js) */
  const BEFORE = { country: [[1, 10], [4, 15]], city: [[4, 11], [10, 15]],
                   other: [[8, 10], [13, 13]], era: [[1, 9.5], [4, 13]] };
  const at = (s, z) => {
    if (z <= s[0][0]) return s[0][1];
    if (z >= s[s.length - 1][0]) return s[s.length - 1][1];
    for (let i = 1; i < s.length; i++) { const [a, b] = s[i - 1], [c, d] = s[i]; if (z <= c) return b + (d - b) * ((z - a) / (c - a)); }
    return s[s.length - 1][1];
  };
  for (const kind of Object.keys(BEFORE)) {
    for (let z = 0; z <= 22; z += 0.1) {
      const zz = Math.round(z * 10) / 10;
      assert.ok(LS.placeAt(kind, zz) <= at(BEFORE[kind], zz) + 1e-9,
        `place('${kind}') at z${zz} is ${LS.placeAt(kind, zz)}, not below its pre-#R198 ${at(BEFORE[kind], zz)} — ` +
        'the request was 「全体的にラベルのテキストサイズを下げた」');
    }
  }
  /* …and the loudest one: an ocean name was 19.3 px where a city was 15. */
  assert.ok(LS.subAt(9, 1) < 12, `the largest non-place label is ${LS.subAt(9, 1)} px at z9, was 19.3`);
});

test('R198 ①d: the expressions keep zoom OUTERMOST (#R73 — MapLibre drops the layer silently)', () => {
  const LS = loadScale();
  const outermostOk = (e) => Array.isArray(e) && e[0] === 'interpolate' &&
    JSON.stringify(e.slice(3)).indexOf('"zoom"') < 0;
  for (const kind of Object.keys(LS.PLACE)) assert.ok(outermostOk(LS.place(kind)), `place('${kind}')`);
  assert.ok(outermostOk(LS.sub(0.9)), 'sub()');
  const sc = LS.subCase(['==', ['get', 'big'], 1], 1, 0.86);
  assert.ok(outermostOk(sc), 'subCase()');
  assert.equal(sc[4][0], 'case', 'subCase puts the case in the stop OUTPUT, where it is legal');
});

test('R198 ①e: js/label-scale.js is the only source of a map text size', () => {
  const files = ['place-labels', 'app-body', 'data-layers', 'atlas-console', 'layer-packs',
    'community-board', 'dash-extended', 'cameras', 'drone-ops', 'beta-overlays', 'map-extras',
    'news-ui', 'satellites-live', 'terrain-water', 'time-borders', 'tsunami', 'weather'];
  for (const f of files) {
    const src = read(`js/${f}.js`);
    const lit = [...src.matchAll(/'text-size'\s*:\s*[0-9[]/g)];
    for (const m of lit) {
      assert.fail(`js/${f}.js still declares a literal text-size at index ${m.index} — ` +
        'every map label size comes from window.IntMapLabelScale (#R198)');
    }
    assert.ok(!/'text-size'/.test(src) || /IntMapLabelScale/.test(src),
      `js/${f}.js sets a text-size without going through IntMapLabelScale`);
  }
});

/* ═══ ② THE ADMIN-1 LAYER ═════════════════════════════════════════════════════════════════════ */

test('R198 ②a: ofm-admin1 is built from the classes that actually carry the units named in the ask', () => {
  const src = read('js/place-labels.js');
  assert.ok(/id:'ofm-admin1'/.test(src), 'the layer exists');
  assert.ok(/\['state','province'\]/.test(src),
    'both OpenMapTiles classes — Japanese prefectures are `province`, US states are `state`');
  assert.ok(/LS\.place\('admin1'\)/.test(src), 'its size comes from the place ladder, not a literal');
  assert.ok(/'symbol-sort-key':\['coalesce',\['get','rank'\]/.test(src),
    'the collision test is resolved by rank, so a crowded view keeps the bigger unit');
});

test('R198 ②b: it is wired into every list a place-label layer belongs to', () => {
  assert.ok(/'cb-names':\[[^\]]*'ofm-admin1'/.test(read('js/data-layers.js')),
    'the layer-audit map for the Place-names switch (#R79) must know it, or a checked-but-blank ' +
    'state would never be healed');
  /* (#R200) the "names and borders above every data layer" self-heal is js/label-occlusion.js now —
     it left js/app-body.js with the rest of that subject. Asked of that file directly. */
  const body = read('js/label-occlusion.js');
  const stack = /const STACK=\[([^\]]*)\]/.exec(body);
  assert.ok(stack, 'the label STACK still exists');
  const ids = stack[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.ok(ids.includes('ofm-admin1'), 'ofm-admin1 is in the label stack');
  assert.ok(ids.indexOf('ofm-admin1') < ids.indexOf('ofm-city'),
    'below ofm-city → a city name wins the collision against the region containing it');
  assert.ok(ids.indexOf('ofm-admin1') > ids.indexOf('ofm-peak'), 'above the peaks');
  const pl = read('js/place-labels.js');
  assert.ok(/\['ofm-country','ofm-admin1','ofm-city','ofm-other'\]/.test(pl),
    'applyLabelLang localises and shows/hides it with the other place names');
  assert.ok(/id==='ofm-country'\|\|id==='ofm-admin1'/.test(pl),
    "it hides while the time machine is travelling, for #R103's reason");
});

/* ═══ ③ THE WORLD GAZETTEER ═══════════════════════════════════════════════════════════════════ */

const WORLD = join(ROOT, 'data', 'gazetteer-world.json');

test('R198 ③a: the built table is ten times the curated one, and every row is usable', () => {
  assert.ok(existsSync(WORLD), 'data/gazetteer-world.json is built (scripts/build-gazetteer.mjs)');
  const doc = JSON.parse(readFileSync(WORLD, 'utf8'));
  const gz = read('js/gazetteer.js');
  const curated = (gz.match(/^\s{4}\['(?:city|country|flashpoint|town)'/gm) || []).length;
  assert.ok(curated > 300, `sanity: found ${curated} curated rows`);
  assert.ok(doc.rows.length + curated >= curated * 10,
    `${doc.rows.length} + ${curated} curated is not 10× ${curated} — 「Gazetteerを今の10倍の網羅性に」`);
  assert.ok(/GeoNames/.test(doc.attribution) && /Wikidata/.test(doc.attribution),
    'the sources are named in the file itself (standing instruction 4)');
  const seen = new Set();
  for (const r of doc.rows) {
    const [en, ja, iso2, lng, lat, pop] = r;
    assert.ok(en && typeof en === 'string', 'every row has an English name');
    assert.ok(lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90, `${en}: coordinates in range`);
    assert.ok(pop >= 0, `${en}: a real population`);
    assert.ok(iso2 && iso2.length === 2, `${en}: a country`);
    assert.ok(!seen.has(en.toLowerCase()), `${en} appears twice — a homonym would scatter the pin`);
    seen.add(en.toLowerCase());
  }
  assert.ok(new Set(doc.rows.map((r) => r[2])).size >= 200,
    'the long tail covers the world, not one continent');
  assert.ok(doc.rows.filter((r) => r[1]).length > 5000, 'thousands of rows carry a real Japanese name');
});

test('R198 ③b: the client turns those rows into the shape the locator already speaks', () => {
  const win = { addEventListener() {}, IM_HOST: null };
  new Function('window', 'document', read('js/gazetteer.js'))(win, { baseURI: 'https://example.test/' });
  const GZ = win.IntMapGazetteer;
  const doc = JSON.parse(readFileSync(WORLD, 'utf8'));
  const rows = GZ._rowsFrom(doc);
  assert.equal(rows.length, doc.rows.length);
  for (const [type, terms, lng, lat, en, jp] of rows.slice(0, 200)) {
    assert.ok(type === 'city' || type === 'town', 'type is one the scorer already ranks');
    assert.ok(Array.isArray(terms) && terms.length >= 1 && terms.every((t) => typeof t === 'string' && t.length));
    assert.ok(isFinite(lng) && isFinite(lat) && en && jp);
  }
  /* index() must fold them in — and must not have folded them in before they arrived */
  const before = GZ.index();
  assert.ok(!before.town, 'nothing is a `town` until the world rows land');
  assert.ok(before.city.length > 200, 'the curated rows are there synchronously, as ever');
});

test('R198 ③c: the world rows cost the deterministic locator NOTHING', async () => {
  const { CORPUS } = await import('./newsgeo-corpus.mjs');
  const { HOLDOUT } = await import('./newsgeo-holdout.mjs');
  const { evaluate } = await import('../scripts/newsgeo-eval.mjs');
  const NG = globalThis.IntMapNewsGeo;

  const base = { c: evaluate(CORPUS), h: evaluate(HOLDOUT) };

  const win = { addEventListener() {} };
  new Function('window', 'document', read('js/gazetteer.js'))(win, { baseURI: 'https://example.test/' });
  const rows = win.IntMapGazetteer._rowsFrom(JSON.parse(readFileSync(WORLD, 'utf8')));
  const added = NG.register(rows.map(([type, terms, lng, lat, en, jp]) =>
    ({ terms, lng, lat, type, name_en: en, name_jp: jp })));
  assert.ok(added > 10_000, `only ${added} rows registered`);

  const after = { c: evaluate(CORPUS), h: evaluate(HOLDOUT) };
  assert.ok(after.c.nw >= base.c.nw,
    `the development corpus went ${base.c.nw}/${base.c.total} → ${after.c.nw}/${after.c.total} — ` +
    'coverage that costs precision is not coverage');
  assert.ok(after.h.nw >= base.h.nw,
    `the HELD-OUT set went ${base.h.nw}/${base.h.total} → ${after.h.nw}/${after.h.total}`);
  /* …and register() is idempotent, because rebuildGeoIndex re-enters on every geo_pins update */
  assert.equal(NG.register(rows.map(([type, terms, lng, lat, en, jp]) =>
    ({ terms, lng, lat, type, name_en: en, name_jp: jp }))), 0, 'a second register() adds nothing');
});
