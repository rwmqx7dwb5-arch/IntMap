/* ============================================================================
 *  IntMap · R423 — WHAT THE MAP DRAWS, THE LIST LISTS   (tests/r423-checks)
 * ----------------------------------------------------------------------------
 *  「Norway has no row in the Countries list, at ANY year including the present.」
 *
 *  MEASURED ON PRODUCTION (#R410's verification pass, builds R415 and R416): the historical map drew
 *  a «Norway» label at 1916 and at other years, and the Countries list had no row for it. Checked at
 *  the PRESENT as well — all 240 rows were in the DOM and, of the 14 beginning with "N", none was
 *  Norway, while Niue, Vatican City and Pitcairn Islands all were. So: not a time-travel defect, and
 *  not #R410's.
 *
 *  ROOT CAUSE — #R23's predicate, and a Natural Earth record that CONTRADICTS ITSELF.
 *  Norway's feature carries, on one row:
 *
 *      TYPE        "Sovereign country"          ← what the feature IS
 *      FCLASS_TLC  "Unrecognized"               ← how ONE POINT OF VIEW classifies this polygon
 *      ISO_A3      "-99"      ISO_A2  "-99"     ← blanked for the same reason
 *      WOE_NOTE    "Does not include Svalbard, Jan Mayen, or Bouvet Islands (28289410)."
 *
 *  and #R23's flag read only the second line:
 *
 *      const _nonSov = (p.TYPE==='Indeterminate') || /indetermin|unrecogn/i.test(p.FCLASS_TLC…)
 *
 *  so `sov:false`, and Norway was BUILT and then filtered away at every site that asks
 *  `sov!==false` — the Countries list (js/countries-ui.js `renderStats`), the five-country
 *  comparison picker (js/stats-compare.js `cList`), every Atlas ranking (js/atlas-console.js
 *  «top N by X»), the Atlas starter chips (js/atlas-examples.js) and the era-label name map
 *  (js/time-borders.js `tagSame`, where it also cost Norway its LOCALIZED label: never entering
 *  `cur` means `_same=0`, i.e. drawn by `imtb-lbl`, the VANISHED-STATE style, so a Japanese reader
 *  saw «Norway» rather than «ノルウェー»). One flag, six readers, and nothing anywhere compared what
 *  is DRAWN with what is LISTED.
 *
 *  ⚠ THE FCLASS FAMILY IS NOT A STATEHOOD FIELD, AND THE FILE PROVES IT. Somaliland and Northern
 *  Cyprus — the two genuinely unrecognized states in it — carry `FCLASS_ISO:"Unrecognized"` with
 *  `FCLASS_TLC:"Admin-0 country"`, the opposite arrangement, and are listed today. Counted over the
 *  two shipped files, the FCLASS branch flags 4 features at 110 m and 13 at 10 m, and every one of
 *  them EXCEPT Norway is already `TYPE:"Indeterminate"`; no `TYPE:"Country"` feature carries such an
 *  FCLASS at all. So letting `TYPE` win moves exactly ONE verdict at each scale.
 *
 *  ── WHAT THIS FILE HOLDS THE REPOSITORY TO ──────────────────────────────────────────────────
 *  Not «Norway is listed» — the invariant underneath it, which is the one #R375 stopped one step
 *  short of. #R375 established EVERY ID THE GEOMETRY PRODUCES HAS A ROW; Norway had a row the whole
 *  time. The missing half is:
 *
 *      ⚠ EVERY COUNTRY THE MAP DRAWS IS A COUNTRY THE LIST LISTS.
 *
 *  It names no country, no count and no Natural Earth scale. The set that must be listed is derived
 *  from each feature's OWN `TYPE`, and the test of "listed" is the shipped `renderStats` predicate,
 *  READ OUT OF js/countries-ui.js rather than copied into here — a check that keeps its own copy of
 *  the filter goes on asserting the old filter after somebody edits the real one.
 *
 *  The other half of the claim — the same comparison against the RENDERED DOM, rows really on screen
 *  against the collection the map really downloaded — is the `R423` step of tests/r410.spec.js. It
 *  rides there because that file already boots an app with the Countries tab open, and the suite
 *  ceiling has no headroom (measured: core 28/28 s, total 4,598/4,598 s). A version that also swept
 *  the era labels at 1916 was written, measured at +11.7 s, and dropped for that reason; what it
 *  would have caught, this file catches without a browser, because `sov` does not vary with the clock.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readLF(resolve(HERE, '..', p));
const SRC = read('js/countries-ui.js');

/* ── the shipped list filter, taken from the shipped file ─────────────────────────────────────
   `renderStats` decides what the Countries list contains with one expression. Lifting it out means
   this file cannot drift from it: change the filter and these tests re-aim themselves at the new
   one, which is the opposite of what a hand-copied `s.sov!==false` would do. */
const LIST_FILTER_SRC = (() => {
  const m = SRC.match(/Object\.values\(HOST\.countryStats\)\.filter\((s\s*=>[^;]+?)\)\s*;/);
  assert.ok(m, 'the renderStats list filter must still be findable in js/countries-ui.js');
  return m[1];
})();
const isListed = new Function(`return (${LIST_FILTER_SRC});`)();

test('R423 ⓪ the filter this file aims at is really the Countries list filter', () => {
  /* a guard on the extraction itself: if the regex above ever matched something else, every other
     test here would keep passing while measuring nothing. */
  assert.match(LIST_FILTER_SRC, /\bsov\b/, 'the extracted expression is the sovereignty filter');
  assert.equal(isListed({ nameEn: 'X', sov: true }), true, 'a plain sovereign row is listed');
  assert.equal(isListed({ nameEn: 'X', sov: false }), false, 'a sov:false row is not');
  assert.equal(!!isListed({ nameEn: '', sov: true }), false, 'a nameless row is not');
});

/* ── fixtures: Natural Earth SHAPES, not country names ────────────────────────────────────────
   The property spellings are the ones js/countries-ui.js actually reads. Every value below is a
   value the shipped files really carry — the TYPE list is the complete set used across
   ne_110m/ne_10m_admin_0_countries.geojson (Sovereign country 185, Country 19, Dependency 33,
   Disputed 5, Indeterminate 12, Lease 2, Sovereignty 2 at 10 m), and the FCLASS_TLC list is the
   complete set the #R23 regex can see. */
const NE_TYPES = ['Sovereign country', 'Country', 'Dependency', 'Disputed', 'Indeterminate', 'Lease', 'Sovereignty'];
const NE_FCLASS = ['Admin-0 country', 'Admin-0 dependency', 'Admin-0 indeterminant', 'Unrecognized', null];
/* NE calls these two, and only these two, a country. Everything else is a dependency, a lease, a
   disputed area or no-man's-land, and #R23 is the reason those do not belong in Countries. */
const IS_COUNTRY = (t) => /^(sovereign country|country)$/i.test(String(t || ''));

let seq = 0;
const feat = (code, name, type, fclass, box) => ({
  type: 'Feature',
  properties: {
    ISO_A3_EH: code, ADMIN: name, NAME: name, NAME_EN: name,
    ISO_A2_EH: 'ZZ', ISO_N3: '', POP_EST: 1000, CONTINENT: 'Europe', SUBREGION: '',
    TYPE: type, FCLASS_TLC: fclass,
    LABEL_X: (box[0] + box[2]) / 2, LABEL_Y: (box[1] + box[3]) / 2,
  },
  geometry: { type: 'Polygon', coordinates: [[[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]], [box[0], box[1]]]] },
});
/* one feature per (TYPE, FCLASS_TLC) pair — the whole shape space NE can hand the loader, rather
   than the handful of shapes that happen to exist in today's release */
const CROSS = () => {
  seq = 0;
  const out = [];
  for (const t of NE_TYPES) {
    for (const fc of NE_FCLASS) {
      const n = (seq++).toString().padStart(2, '0');
      out.push(feat('X' + n, 'Feature ' + n, t, fc, [seq, seq, seq + 1, seq + 1]));
    }
  }
  return out;
};

/* ── the shipped loader, with the browser globals it names (the #R375 harness) ────────────────── */

const bboxOf = (f) => {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const ring of f.geometry.coordinates) for (const [x, y] of ring) {
    if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
  }
  return [w, s, e, n];
};
const areaOf = (f) => { const b = bboxOf(f); return Math.max(1, (b[2] - b[0]) * (b[3] - b[1])) * 1e10; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(pred, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(10); }
  return false;
}

async function runLoader({ coarse, fine }) {
  const win = { IntMapLang: { pickArgs: () => ((...a) => a[0]) }, IntMapModules: {} };
  win.IntMapGeoEngine = {
    events: { once: (ev, cb) => { if (ev === 'idle') setTimeout(cb, 0); }, on: () => {} },
    layers: { has: () => false, hasSource: () => false, add: () => {}, addSource: () => {}, setLayout: () => {}, setSourceData: () => {} },
    camera: { getCenter: () => ({ lng: 0, lat: 0 }), getZoom: () => 3 },
    ready: () => false, hasRenderer: () => false,
  };
  const HOST = {
    countryStats: {}, countryGeo: null, countryDataPromise: null, countryDataLoaded: false,
    lang: 'en', mode: 'map', statsFilters: [],
    canDraw: () => false, isMobile: () => false, searchVal: () => '', t: () => '',
    cName: (s) => s.nameEn,
    rebuildGeoIndex: () => {}, loadGdpPPP: () => Promise.resolve(), reapplyPPP: () => {},
    renderCompareFixed: () => {}, resolveCountryId: () => '', _respreadNews: () => {},
  };
  const env = {
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    turf: { area: areaOf },
    fetch: async (url) => {
      const body = /ne_10m_/.test(String(url)) ? fine : coarse;
      if (!body) return { ok: false, json: async () => null };
      return { ok: true, json: async () => JSON.parse(JSON.stringify({ type: 'FeatureCollection', features: body })) };
    },
    navigator: {},
    requestIdleCallback: (fn) => setTimeout(fn, 0),
    console: { warn: () => {}, log: () => {}, error: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  const run = (src) => new Function(
    'window', 'document', 'turf', 'fetch', 'navigator', 'requestIdleCallback', 'console', 'localStorage', src,
  )(win, env.document, env.turf, env.fetch, env.navigator, env.requestIdleCallback, env.console, env.localStorage);

  run(read('js/tables.js'));
  run(read('js/countries-ui.js'));
  const mod = win.IntMapModules.countriesUi(HOST);
  await mod.loadCountryData();
  return { HOST, mod };
}

/* what the map draws: the ids countryGeo actually produces (#R375's `geoIds`) */
const geoIds = (HOST) => [...new Set((HOST.countryGeo.features || []).map((f) => f.id).filter(Boolean))].sort();
/* the NE TYPE the drawn feature carries, by id */
const typeOfDrawn = (HOST) => {
  const m = new Map();
  for (const f of (HOST.countryGeo.features || [])) if (f.id) m.set(f.id, String((f.properties || {}).TYPE || ''));
  return m;
};

/* ── ① THE INVARIANT ──────────────────────────────────────────────────────────────────────────── */

test('R423 ① every country the map draws is a country the list lists', async () => {
  const all = CROSS();
  const { HOST } = await runLoader({ coarse: all, fine: all });
  await settle(() => (HOST.countryGeo.features || []).length === all.length);

  const drawnType = typeOfDrawn(HOST);
  const missing = [];
  for (const id of geoIds(HOST)) {
    if (!IS_COUNTRY(drawnType.get(id))) continue;          /* NE does not call it a country — #R23 governs */
    const row = HOST.countryStats[id];
    if (!row || !isListed(row)) missing.push(`${id} (TYPE=${drawnType.get(id)}, FCLASS_TLC=${JSON.stringify((all.find((f) => f.properties.ISO_A3_EH === id) || { properties: {} }).properties.FCLASS_TLC)})`);
  }
  assert.deepEqual(missing, [],
    `the map draws these as countries and the Countries list has no row for them:\n  ${missing.join('\n  ')}`);
});

test('R423 ② …and #R23 still holds in the other direction: nothing NE refuses to call a country is listed', async () => {
  const all = CROSS();
  const { HOST } = await runLoader({ coarse: all, fine: all });
  await settle(() => (HOST.countryGeo.features || []).length === all.length);

  /* Scarborough Shoal, Serranilla, Bajo Nuevo, Bir Tawil, Wake, Siachen, the Southern Patagonian
     Ice Field and the Cyprus buffer zone are all TYPE=Indeterminate; every one of them must stay
     out, or this round has bought Norway's row by re-admitting the reefs #R23 removed. */
  const leaked = geoIds(HOST).filter((id) => {
    const t = typeOfDrawn(HOST).get(id);
    return t === 'Indeterminate' && isListed(HOST.countryStats[id] || {});
  });
  assert.deepEqual(leaked, [], `no Indeterminate feature may be listed; leaked: ${leaked.join(', ')}`);

  /* and every Indeterminate feature still HAS a row, which is #R375's invariant — `sov:false` is
     what keeps it out of the list, not the absence of a record */
  const rowless = geoIds(HOST).filter((id) => !HOST.countryStats[id]);
  assert.deepEqual(rowless, [], '#R375: every id the geometry produces still has a row');
});

/* ── ② THE REPORTED RECORD, AS DATA ───────────────────────────────────────────────────────────── */

test('R423 ③ a record that calls itself a sovereign country is listed, whatever one viewpoint says', async () => {
  /* Norway's actual shipped record, field for field. It is here as the SHAPE that reproduces the
     report — a row whose TYPE and FCLASS_TLC disagree — not as a country the loader special-cases. */
  const NORWAY_SHAPED = feat('NOR', 'Norway', 'Sovereign country', 'Unrecognized', [5, 58, 31, 71]);
  NORWAY_SHAPED.properties.ISO_A3 = '-99';
  NORWAY_SHAPED.properties.ISO_A2 = '-99';
  NORWAY_SHAPED.properties.ISO_N3 = '-99';
  NORWAY_SHAPED.properties.FCLASS_ISO = 'Unrecognized';
  /* the two genuinely unrecognized states, whose FCLASS_TLC says the OPPOSITE of their FCLASS_ISO —
     the pair that shows the FCLASS family is a viewpoint field and not a statehood field */
  const SOMALILAND = feat('SOL', 'Somaliland', 'Sovereign country', 'Admin-0 country', [43, 8, 49, 11]);
  SOMALILAND.properties.FCLASS_ISO = 'Unrecognized';
  const N_CYPRUS = feat('CYN', 'Northern Cyprus', 'Sovereign country', 'Admin-0 country', [32, 35, 34, 35.7]);
  N_CYPRUS.properties.FCLASS_ISO = 'Unrecognized';
  /* the control: no-man's-land, which must stay out */
  const BIR_TAWIL = feat('BRT', 'Bir Tawil', 'Indeterminate', 'Unrecognized', [33, 21, 34, 22]);

  const all = [NORWAY_SHAPED, SOMALILAND, N_CYPRUS, BIR_TAWIL];
  const { HOST } = await runLoader({ coarse: all, fine: all });
  await settle(() => (HOST.countryGeo.features || []).length === all.length);

  const nor = HOST.countryStats.NOR;
  assert.ok(nor, 'the row exists (it always did — #R375)');
  assert.equal(nor.sov, true, 'TYPE:"Sovereign country" outranks FCLASS_TLC:"Unrecognized"');
  assert.equal(!!isListed(nor), true, 'and the Countries list shows it');
  /* the report, restated as the measurement that failed: the list draws it at the present */
  assert.equal(nor.nameEn, 'Norway', 'under its own name');

  assert.equal(!!isListed(HOST.countryStats.SOL), true, 'Somaliland is listed, as before this round');
  assert.equal(!!isListed(HOST.countryStats.CYN), true, 'Northern Cyprus is listed, as before this round');
  assert.equal(HOST.countryStats.BRT.sov, false, 'and Bir Tawil is still flagged (#R23)');
  assert.equal(!!isListed(HOST.countryStats.BRT), false, 'so it is still out of the list');
});

/* ── ③ THE READERS THE FLAG REACHES ───────────────────────────────────────────────────────────── */

test('R423 ④ the flag has six readers, and the fix reaches all of them', async () => {
  /* `sov` is not the Countries list's private field. These are the sites that ask `sov!==false`,
     found by sweeping js/ this round; a fix that repaired only `renderStats` would leave Norway out
     of every Atlas ranking and out of the comparison picker, which is what the report's "no row"
     was one symptom of. The sweep is asserted here so a future reader cannot be added silently
     without this file noticing the count changed. */
  const FILES = ['js/countries-ui.js', 'js/stats-compare.js', 'js/atlas-console.js', 'js/atlas-examples.js', 'js/time-borders.js'];
  const readers = [];
  for (const f of FILES) {
    const src = read(f);
    const n = (src.match(/\.sov\s*(===|!==)\s*false/g) || []).length;
    if (n) readers.push(`${f}:${n}`);
  }
  assert.deepEqual(readers.sort(), [
    'js/atlas-console.js:2', 'js/atlas-examples.js:1', 'js/countries-ui.js:1',
    'js/stats-compare.js:1', 'js/time-borders.js:1',
  ], 'the six readers of the sovereignty flag, across five files');

  /* and they all read ONE field, written in ONE place — so fixing the predicate fixes all six */
  const writes = (read('js/countries-ui.js').match(/^\s*sov:/gm) || []).length;
  assert.equal(writes, 1, 'the flag is written in exactly one place (js/countries-ui.js `_mkStat`)');
});

test('R423 ⑤ the predicate reads TYPE, and TYPE decides', () => {
  /* a source-level guard on the SHAPE of the fix, so a later edit cannot quietly restore the old
     one-sided read. It asserts the predicate consults TYPE before it consults FCLASS — not the
     literal text of either. */
  const m = SRC.match(/const _nonSov=([^\n]+)/);
  assert.ok(m, 'the #R23 predicate is still there');
  const expr = m[1];
  assert.match(expr, /_neCountry/, 'the predicate consults what Natural Earth calls the feature');
  assert.match(SRC, /const _neCountry=\/\^\(sovereign country\|country\)\$\/i\.test\(_neType\)/,
    'and "country" means NE TYPE «Sovereign country» or «Country»');
  assert.match(expr, /indetermin\|unrecogn/, '#R23\'s FCLASS branch is still in place for everything else');
});
