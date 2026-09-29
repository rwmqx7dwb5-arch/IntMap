/* ============================================================================
 *  IntMap · #R198 checks — the label ladder, the admin-1 layer, the world gazetteer
 * ----------------------------------------------------------------------------
 *  (Moved from tests/r198-checks.test.mjs ③ — the world gazetteer, by topic. ① and ②, the label
 *   ladder and the admin-1 layer, are tests/labels-stack-and-scale-checks.test.mjs.
 *   ⚠ ③c registers ~140k rows into the global js/newsgeo.js locator, so this file stays its own
 *   process: nothing else may run after it against a locator it has grown.)
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
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══ ③ THE WORLD GAZETTEER ═══════════════════════════════════════════════════════════════════ */

/* ⚠ (#R208) THE FILE MOVED AND THIS PIN CAME WITH IT. The artefact is `…json.gz` now (9.0 MB of
   JSON at 148,083 rows is not a thing to ship uncompressed), and the names no longer come from
   Wikidata — 150,000 ids will not go through a rate-limited SPARQL endpoint, so they come from
   GeoNames' own language-tagged `alternateNamesV2`. Both assertions below were pinning the
   MECHANISM; what #R198 meant is "the built table is many times the curated one and every row is
   usable", and that is what they say now. */
const WORLD = join(ROOT, 'data', 'gazetteer-world.json.gz');
const worldDoc = () => JSON.parse(gunzipSync(readFileSync(WORLD)).toString('utf8'));

/* ⚠ (#R620) THE LOCATOR IS FED THE MATCHABLE VIEW, SO THESE TESTS FEED IT THE SAME THING.
   `world()` is now the list of places that EXIST — including the ones whose name a curated table
   already carries, which the build used to delete outright and which no data reader could see
   (MEASURED: 78 places above a million people). What the matcher may see is `worldMatchable()`:
   the same rows minus `cur=1`. Registering the full list here would measure a wiring the app does
   not have, and would report a precision loss the app cannot suffer. */
const matchable = (rows) => rows.filter((r) => r[11] !== 1);

test('R198 ③a: the built table is ten times the curated one, and every row is usable', () => {
  assert.ok(existsSync(WORLD), 'data/gazetteer-world.json.gz is built (scripts/build-gazetteer.mjs)');
  const doc = worldDoc();
  const gz = read('js/gazetteer.js');
  const curated = (gz.match(/^\s{4}\['(?:city|country|flashpoint|town)'/gm) || []).length;
  assert.ok(curated > 300, `sanity: found ${curated} curated rows`);
  assert.ok(doc.rows.length + curated >= curated * 10,
    `${doc.rows.length} + ${curated} curated is not 10× ${curated} — 「Gazetteerを今の10倍の網羅性に」`);
  assert.ok(/GeoNames/.test(doc.attribution),
    'the sources are named in the file itself (standing instruction 4)');
  const seen = new Set(), seenGid = new Set();
  for (const r of doc.rows) {
    const [en, ja, iso2, lng, lat, pop, alt, gid, fcode, disp, cur] = r;
    assert.ok(en && typeof en === 'string', 'every row has an English name');
    assert.ok(lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90, `${en}: coordinates in range`);
    assert.ok(pop >= 0, `${en}: a real population`);
    assert.ok(iso2 && iso2.length === 2, `${en}: a country`);
    assert.ok(!seen.has(en.toLowerCase()), `${en} appears twice — a homonym would scatter the pin`);
    seen.add(en.toLowerCase());
    /* ── (#R620) the four appended fields, each of which something downstream now depends on ── */
    /* the geonameid, because the array index is a POSITION and a rebuild reshuffles it: anything
       that remembers a place across builds has to remember something the publisher assigned. */
    assert.ok(/^\d+$/.test(gid), `${en}: gid is a GeoNames id, got ${JSON.stringify(gid)}`);
    assert.ok(!seenGid.has(gid), `${en}: geonameid ${gid} appears twice — it is the row's identity`);
    seenGid.add(gid);
    /* the feature code, because without it a section of a city is a city (MEASURED: fourteen
       `PPLX` rows above a million people, e.g. `Al Mawşil al Jadīdah` inside Mosul). */
    assert.ok(fcode && typeof fcode === 'string', `${en}: no feature code`);
    assert.ok(doc.placeKinds && doc.placeKinds[fcode] && doc.placeKinds[fcode].kind,
      `${en}: feature code ${fcode} is not described in doc.placeKinds — the classification has to ` +
      'ship with the rows, because the browser cannot fetch featureCodes_en.txt');
    /* the curated-collision flag, which is what lets one list serve both the matcher and the data */
    assert.ok(cur === 0 || cur === 1, `${en}: cur is a flag, got ${JSON.stringify(cur)}`);
    /* the display name, empty when it would only repeat the ASCII key */
    assert.equal(typeof disp, 'string', `${en}: disp is a string (empty means "same as en")`);
    assert.notEqual(disp, en, `${en}: disp repeats en — it is stored empty in that case`);
    void ja; void alt;
  }
  assert.deepEqual(doc.fields.slice(0, 7), ['en', 'ja', 'iso2', 'lng', 'lat', 'pop', 'alt'],
    'the first seven fields keep their #R198/#R208/#R495 index — every reader hard-codes them');
  assert.deepEqual(doc.fields.slice(7), ['gid', 'fcode', 'disp', 'cur'], 'the v3 tail is declared');
  for (const [code, k] of Object.entries(doc.placeKinds)) {
    assert.ok(['settlement', 'part', 'defunct'].includes(k.kind), `${code}: unknown kind ${k.kind}`);
    assert.ok(k.desc, `${code}: GeoNames' own description is what classified it, so it is carried`);
  }
  /* the classification is only useful if it actually SEPARATES something: a section of a place is
     the case that motivated the field, and it is present in the data at scale. */
  const parts = new Set(Object.entries(doc.placeKinds).filter(([, k]) => k.kind === 'part').map(([c]) => c));
  assert.ok(parts.size >= 1, 'at least one feature code is a section-of-a-place');
  assert.ok(doc.rows.some((r) => parts.has(r[8]) && r[5] > 1e6),
    'the rows that made this necessary are still in the file, now labelled rather than mistaken');
  assert.ok(doc.rows.some((r) => r[10] === 1 && r[5] > 1e6),
    'a place above a million people whose name a curated table carries is IN the file now — ' +
    'deleting those is what made Lagos, Mumbai, Tokyo and Cairo invisible to every query');
  assert.ok(new Set(doc.rows.map((r) => r[2])).size >= 200,
    'the long tail covers the world, not one continent');
  assert.ok(doc.rows.filter((r) => r[1]).length > 5000, 'thousands of rows carry a real Japanese name');
});

test('R198 ③b: the client turns those rows into the shape the locator already speaks', () => {
  /* spelling kept — the rows are converted by RUNNING js/gazetteer.js; the two spellings pin that the shipped field order and filter are the ones this file simulates, because the matchable view is only built after a network load */
  const win = { addEventListener() {}, IM_HOST: null };
  new Function('window', 'document', read('js/gazetteer.js'))(win, { baseURI: 'https://example.test/' });
  const GZ = win.IntMapGazetteer;
  const doc = worldDoc();
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
  /* ── (#R620) the tail survives the conversion, and the two views are actually different ────── */
  const src = read('js/gazetteer.js');
  assert.match(src, /out\.push\(\[pop>=250000\?'city':'town', terms, lng, lat, en, ja\|\|en, pop, iso2, gid, fcode, disp\|\|en, cur\]\)/,
    'the appended fields ride BEHIND the eight every existing reader destructures');
  for (const r of rows.slice(0, 200)) {
    assert.equal(r.length, 12, 'twelve fields');
    assert.ok(/^\d+$/.test(r[8]), 'the geonameid survives the conversion');
    assert.ok(r[9], 'so does the feature code');
    assert.ok(r[10], 'the display name falls back to `en` rather than being empty in the row');
    assert.ok(r[11] === 0 || r[11] === 1, 'and the curated-collision flag is a flag');
  }
  assert.ok(typeof GZ.worldMatchable === 'function', 'the matching view is published (#R620)');
  const all = rows.length, may = matchable(rows).length;
  assert.ok(may < all, `worldMatchable withholds nothing (${may} of ${all}) — a curated name must ` +
    'not have a second entry in the matcher');
  assert.ok(may > all * 0.9, `only ${may} of ${all} rows are matchable — the flag has gone wrong`);
  /* ⚠ and the shipped filter is the one this file simulates: same field, same value. */
  assert.match(src, /_worldRows\.filter\(r=>r\[11\]!==1\)/,
    'worldMatchable filters on the curated-collision flag, which is field 11');
  /* v2 files (a cache warmed before the rebuild) still read, as "no id, no kind, collides with
     nothing" — which is what they meant when they were written. */
  const v2 = GZ._rowsFrom({ rows: [['Testville', '', 'JP', 139.7, 35.7, 1234, []]] });
  assert.equal(v2.length, 1);
  assert.deepEqual(v2[0].slice(8), ['', '', 'Testville', 0], 'a v2 row degrades rather than throwing');
});

test('R198 ③c: the world rows cost the deterministic locator NOTHING', async () => {
  const { CORPUS } = await import('./newsgeo-corpus.mjs');
  const { HOLDOUT } = await import('./newsgeo-holdout.mjs');
  const { evaluate } = await import('../scripts/newsgeo-eval.mjs');
  const NG = globalThis.IntMapNewsGeo;

  const base = { c: evaluate(CORPUS), h: evaluate(HOLDOUT) };

  const win = { addEventListener() {} };
  new Function('window', 'document', read('js/gazetteer.js'))(win, { baseURI: 'https://example.test/' });
  const rows = matchable(win.IntMapGazetteer._rowsFrom(worldDoc()));
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
