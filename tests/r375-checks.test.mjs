/* ============================================================================
 *  IntMap · R375 — THE TABLE AND THE GEOMETRY ARE ONE SET   (tests/r375-checks)
 * ----------------------------------------------------------------------------
 *  「シンガポールでは国別プールではなく世界プールの4文になる」
 *
 *  MEASURED ON PRODUCTION (#R392's verification pass): over Singapore at z=11 and z=13 the shipped
 *  `codeAtPoint(103.85, 1.29)` answered 'SGP' — the country was identified — and the Atlas starter
 *  chips were nonetheless the WORLD four (「日本・ドイツ・インドを比較」), with `redrawn=true`. The
 *  failure was therefore BELOW the identification: `exFacts()` (js/atlas-examples.js) does
 *
 *      const st = near ? countryStats[near] : null;
 *      const nm = st ? cName(st) : null;          →  usePlace = !!(f && f.st && f.name)
 *
 *  and `countryStats.SGP` was `undefined`.
 *
 *  ROOT CAUSE — #R195, commit 01d1821. Before it, js/countries-ui.js fetched the 10 m Natural Earth
 *  file FIRST and built the table from it; 50 m and 110 m were fallbacks for a failed download. #R195
 *  inverted that for a real and correctly measured reason (4,335 KB starting at 2,024 ms on the boot
 *  path, drawing nothing): build the table from the 110 m file, pull the 10 m GEOMETRY in when the
 *  browser is idle. Its premise was stated in the file — «the attributes are identical at every
 *  Natural Earth scale».
 *
 *  THAT IS TRUE OF A FEATURE AND FALSE OF A FILE. Counted this round against the shipped CDN paths:
 *
 *      ne_110m_admin_0_countries.geojson   177 features   177 codes
 *      ne_50m_admin_0_countries.geojson    242 features   240 codes
 *      ne_10m_admin_0_countries.geojson    258 features   252 codes
 *
 *  so 75 codes exist only in the fine file. The upgrade was written as a pure ENRICHMENT pass —
 *  `best.forEach((v,code)=>{ const s=HOST.countryStats[code]; if(!s) return; …})` — while the very
 *  next line swapped `countryGeo` to the fine collection. From that moment the geometry answered for
 *  252 codes and the table knew 177, and NOTHING IN THE REPOSITORY COMPARED THE TWO SETS.
 *
 *  The 75, by Natural Earth TYPE:
 *      Sovereign country  29   AND ATG BHR BRB COM CPV DMA FSM GRD KIR KNA LCA LIE MCO MDV MHL MLT
 *                              MUS NRU PLW SGP SMR STP SYC TON TUV VAT VCT WSM
 *      Dependency         26   AIA ASM BLM BMU COK CYM ESB FRO GUM HMD MAF MNP MSR NFK NIU PCN PYF
 *                              SGS SHN SPM TCA UMI VGB VIR WLF WSB
 *      Country             9   ABW ALA CUW GGY HKG IMN JEY MAC SXM
 *      Indeterminate       8   BJN BRT CNM KAS PGA SCR SER SPI
 *      Disputed            2   GIB IOT
 *      Lease               1   USG
 *
 *  ⚠ THE CHIPS WERE ONE READER OF TWENTY-FIVE. Every site that keys the table by a code the GEOMETRY
 *  produced took its «not found» branch for these 75: the choropleth hover readout and its painted
 *  value (js/data-layers.js), the NATO and EU hover cards, `applyRimland`, the data-centre detail
 *  card (js/datacenters.js), the era-border resolver (js/time-borders.js), the news country fallback
 *  name (js/news-context.js), the silhouette quiz (js/analysis-edu.js), five Atlas paths, and
 *  `resolveCountryId` itself (js/app-body.js), which only accepts a candidate the table already
 *  holds. They were all silent, because every one of them is written to skip an unknown code.
 *
 *  WHAT THIS FILE HOLDS THE REPOSITORY TO. Not «Singapore works» — the invariant underneath it:
 *  ⚠ EVERY ID THE GEOMETRY PRODUCES HAS A ROW. It is scale-free (it does not name a country, a
 *  count, or a Natural Earth scale) and it is checked by RUNNING THE SHIPPED LOADER over a coarse
 *  file and a fine file that differ, which is the one condition under which the defect exists.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readLF(resolve(HERE, '..', p));

/* ── fixtures ────────────────────────────────────────────────────────────────────────────────── */

/* a Natural Earth feature, with the property spellings js/countries-ui.js actually reads */
const feat = (code, name, box, extra = {}) => ({
  type: 'Feature',
  properties: {
    ISO_A3_EH: code, ADMIN: name, NAME: name, NAME_EN: name,
    ISO_A2_EH: extra.a2 || '', ISO_N3: extra.n3 || '',
    POP_EST: extra.pop == null ? 1000 : extra.pop,
    CONTINENT: extra.continent || 'Asia', SUBREGION: extra.subregion || '',
    LABEL_X: (box[0] + box[2]) / 2, LABEL_Y: (box[1] + box[3]) / 2,
    ...(extra.props || {}),
  },
  geometry: { type: 'Polygon', coordinates: [[[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]], [box[0], box[1]]]] },
});

const JPN = () => feat('JPN', 'Japan', [130, 31, 146, 45], { a2: 'JP', pop: 125_000_000 });
const FRA = () => feat('FRA', 'France', [-5, 42, 8, 51], { a2: 'FR', pop: 68_000_000 });
/* the country the report is about, at roughly its real extent */
const SGP = () => feat('SGP', 'Singapore', [103.6, 1.16, 104.09, 1.47], { a2: 'SG', pop: 5_637_000, subregion: 'South-Eastern Asia' });
/* a second one, to prove the fix is not a special case */
const MCO = () => feat('MCO', 'Monaco', [7.4, 43.72, 7.44, 43.75], { a2: 'MC', pop: 39_000, continent: 'Europe' });
/* #R23's non-sovereign flag has to survive the new construction path */
const BJN = () => feat('BJN', 'Bajo Nuevo Bank', [-79.99, 15.79, -79.98, 15.81], { a2: '-99', pop: 0, props: { TYPE: 'Indeterminate' } });
/* a second polygon for a code the coarse file already has — #R15's «largest area wins» must hold */
const JPN_ISLET = () => feat('JPN', 'Okinotorishima', [136.07, 20.42, 136.08, 20.43], { a2: 'JP', pop: 0 });

/* ── the shipped loader, with the browser globals it names ───────────────────────────────────── */

const bboxOf = (f) => {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const ring of f.geometry.coordinates) for (const [x, y] of ring) {
    if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
  }
  return [w, s, e, n];
};
/* monotone in extent, which is all #R15's «largest wins» rule needs of it */
const areaOf = (f) => { const b = bboxOf(f); return Math.max(1, (b[2] - b[0]) * (b[3] - b[1])) * 1e10; };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(pred, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(10); }
  return false;
}

/* Runs the REAL js/countries-ui.js — not a re-implementation of it — over a coarse collection and a
   fine one. Returns the host it mutated plus a note of which host hooks it called. */
async function runLoader({ coarse, fine }) {
  const calls = { reapplyPPP: 0, rebuildGeoIndex: 0, renderStats: 0 };
  const fetched = [];
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
    canDraw: () => false,          /* nothing is drawn in this harness — addCountryLayers stays out */
    isMobile: () => false,         /* desktop schedule, so the upgrade is not held for 15 s */
    searchVal: () => '',
    t: () => '',
    cName: (s) => s.nameEn,
    rebuildGeoIndex: () => { calls.rebuildGeoIndex++; },
    loadGdpPPP: () => Promise.resolve(),
    reapplyPPP: () => { calls.reapplyPPP++; },
    renderCompareFixed: () => {},
    resolveCountryId: () => '',
    _respreadNews: () => {},
  };
  const env = {
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    turf: { area: areaOf },
    fetch: async (url) => {
      fetched.push(String(url));
      const body = /ne_10m_/.test(String(url)) ? fine : coarse;
      if (!body) return { ok: false, json: async () => null };
      return { ok: true, json: async () => JSON.parse(JSON.stringify({ type: 'FeatureCollection', features: body })) };
    },
    navigator: {},
    /* the loader prefers requestIdleCallback; giving it a prompt one keeps the test near half a
       second instead of the 3 s setTimeout fallback. The SCHEDULE is not what is under test here. */
    requestIdleCallback: (fn) => setTimeout(fn, 0),
    console: { warn: () => {}, log: () => {}, error: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  const run = (src) => new Function(
    'window', 'document', 'turf', 'fetch', 'navigator', 'requestIdleCallback', 'console', 'localStorage', src,
  )(win, env.document, env.turf, env.fetch, env.navigator, env.requestIdleCallback, env.console, env.localStorage);

  run(read('js/tables.js'));
  /* ⚠ (#R426) js/countries-ui.js now DEPENDS on this: `_mkStat` derives `bbox` (the frame)
     and `bboxAll` (the union) from window.IntMapCountryExtent. src/main.js imports it before
     js/countries-ui.js for exactly this reason, and this harness runs the real loader, so it
     loads it in the same order. Without it every row is built with a null footprint — which
     is what ③ and ⑤ below catch. */
  run(read('js/country-extent.js'));
  run(read('js/countries-ui.js'));
  const mod = win.IntMapModules.countriesUi(HOST);
  await mod.loadCountryData();
  return { HOST, win, calls, fetched, mod };
}

/* the ids the geometry actually produces — a feature whose code could not be derived gets no id */
const geoIds = (HOST) => [...new Set((HOST.countryGeo.features || []).map((f) => f.id).filter(Boolean))].sort();

/* ── ① the invariant ─────────────────────────────────────────────────────────────────────────── */

test('R375 ① every id the geometry produces has a row in countryStats', async () => {
  const { HOST, calls } = await runLoader({ coarse: [JPN(), FRA()], fine: [JPN(), FRA(), SGP(), MCO(), BJN()] });

  /* the coarse file is what boot builds from, and at that moment the two sets AGREE — the window
     this test is about opens only when the fine geometry replaces the coarse geometry */
  assert.equal(HOST.countryDataLoaded, true, 'the loader finished');
  const landed = await settle(() => (HOST.countryGeo.features || []).length === 5);
  assert.ok(landed, 'the 10 m upgrade replaced countryGeo (it is what makes the codes reachable)');
  assert.ok(calls.rebuildGeoIndex >= 1, 'the gazetteer was rebuilt after the swap');

  const ids = geoIds(HOST);
  assert.deepEqual(ids, ['BJN', 'FRA', 'JPN', 'MCO', 'SGP'], 'the fine collection produced five ids');

  /* ⚠ THE ASSERTION. Before this round the answer was ['BJN','MCO','SGP'] — three ids the geometry
     answers for and the table had never heard of. */
  const orphans = ids.filter((id) => !HOST.countryStats[id]);
  assert.deepEqual(orphans, [],
    `every countryGeo id must have a countryStats row; missing: ${orphans.join(', ')}`);
});

test('R375 ② the reported failure, end to end: codeAtPoint answers, so the table must too', async () => {
  const { HOST } = await runLoader({ coarse: [JPN(), FRA()], fine: [JPN(), FRA(), SGP(), MCO(), BJN()] });
  await settle(() => (HOST.countryGeo.features || []).length === 5);

  /* what `exFacts()` (js/atlas-examples.js) does with the code `codeAtPoint` handed it. The
     production measurement was: near='SGP', st=undefined, usePlace=false → the world pool. */
  for (const code of ['SGP', 'MCO']) {
    const st = HOST.countryStats[code];
    assert.ok(st, `countryStats.${code} exists`);
    const name = st ? HOST.cName(st) : null;
    assert.ok(name, `cName(countryStats.${code}) is a non-empty name — the other half of the gate`);
    assert.equal(!!(st && name), true, `usePlace is true for ${code}`);
  }
  assert.equal(HOST.countryStats.SGP.nameEn, 'Singapore');
});

/* ── ② the row is a real row, not a placeholder ──────────────────────────────────────────────── */

test('R375 ③ a row created by the upgrade is built by the SAME constructor as a boot row', async () => {
  const { HOST } = await runLoader({ coarse: [JPN(), FRA()], fine: [JPN(), FRA(), SGP()] });
  await settle(() => !!HOST.countryStats.SGP);

  const sgp = HOST.countryStats.SGP, jpn = HOST.countryStats.JPN;
  /* the field set is what makes the row usable by the twenty-five readers — a row missing `a2`
     reads English in every language (#R240), a row missing `bbox` is framed at a class zoom (#R185) */
  assert.deepEqual(Object.keys(sgp).sort(), Object.keys(jpn).sort(),
    'the late row and the boot row have exactly the same fields');

  /* …and the curated tables in js/tables.js were consulted, which is the whole point of going
     through the constructor rather than writing a stub row */
  assert.equal(sgp.capital, 'Singapore', 'CAPITAL was read');
  assert.equal(sgp.currency, 'SGD', 'CURRENCY was read');
  assert.equal(sgp.gdp, 501, 'GDP was read');
  assert.equal(sgp.hdi, 0.949, 'HDI was read');
  assert.match(sgp.languages, /Malay/, 'LANGS was read');
  assert.equal(sgp.a2, 'SG', 'the alpha-2 CLDR needs to translate the name is kept (#R240)');
  assert.equal(sgp.flag, '🇸🇬', 'the flag was derived from the alpha-2');
  assert.equal(sgp.pop, 5_637_000, 'POP_EST came off the feature');
  assert.ok(Array.isArray(sgp.bbox) && sgp.bbox.length === 4, 'the footprint was measured (#R185)');
  assert.deepEqual(sgp.bbox.map((v) => +v.toFixed(2)), [103.6, 1.16, 104.09, 1.47]);
  assert.ok(sgp.latlng && Math.abs(sgp.latlng[0] - 1.315) < 0.01, 'the label point came off LABEL_Y/LABEL_X');
  assert.equal(sgp.sov, true, 'a sovereign country is not flagged non-sovereign');
  assert.equal(sgp.code, 'SGP');
});

test('R375 ④ #R23 still holds: a non-sovereign feature created late is still flagged', async () => {
  const { HOST } = await runLoader({ coarse: [JPN(), FRA()], fine: [JPN(), FRA(), BJN()] });
  await settle(() => !!HOST.countryStats.BJN);
  /* Bajo Nuevo Bank is TYPE=Indeterminate. It must get a ROW — `codeAtPoint` answers 'BJN' over it
     and every geometry-keyed reader needs somewhere to land — but `sov:false` is what keeps it out
     of the Countries list, "Random country" and the quizzes, exactly as before this round. */
  assert.ok(HOST.countryStats.BJN, 'it has a row, so no geometry-keyed reader sees a hole');
  assert.equal(HOST.countryStats.BJN.sov, false, 'and it is still flagged non-sovereign');
});

/* ── ③ the enrichment contract #R195 wrote, now measured instead of grepped ──────────────────── */

test('R375 ⑤ an EXISTING row is enriched in place, never replaced', async () => {
  /* the fine Japan is deliberately a DIFFERENT extent from the coarse one, so «was it refreshed?»
     is an observable question and not an assertion that two equal numbers are equal */
  const fineJPN = feat('JPN', 'Japan', [128, 30, 148, 46], { a2: 'JP', pop: 125_000_000 });
  const { HOST } = await runLoader({ coarse: [JPN(), FRA()], fine: [fineJPN, FRA(), SGP()] });
  const before = HOST.countryStats.JPN;
  /* stand in for the three passes #R195 names — the PPP merge, the indicator gap-fill and the time
     machine's snapshot/restore — all of which write onto the row after boot */
  before._marker = 'set by a later pass';
  before.gdppcPPP = 12345;
  const beforeArea = before._area;

  await settle(() => !!HOST.countryStats.SGP);

  assert.equal(HOST.countryStats.JPN, before, 'the SAME object is still in the table (identity)');
  assert.equal(HOST.countryStats.JPN._marker, 'set by a later pass', 'a later pass’s field survived');
  assert.equal(HOST.countryStats.JPN.gdppcPPP, 12345, 'the PPP figure survived');
  assert.ok(HOST.countryStats.JPN._area > beforeArea,
    'and the geometry-decided fields WERE refreshed from the fine file (area grew with the extent)');
  assert.deepEqual(HOST.countryStats.JPN.bbox, [128, 30, 148, 46], 'the footprint was re-measured too');
});

test('R375 ⑥ #R15 still holds: the largest polygon per code wins, in both passes', async () => {
  const { HOST } = await runLoader({ coarse: [JPN(), FRA()], fine: [JPN_ISLET(), JPN(), SGP()] });
  await settle(() => !!HOST.countryStats.SGP);
  /* the islet is listed FIRST in the fine file; if last-wins had crept back in, Japan's row would
     now be measured off a 0.01° box */
  assert.equal(HOST.countryStats.JPN.nameEn, 'Japan', 'the mainland row was not overwritten by a territory');
  /* `_area` is km² — js/countries-ui.js divides turf's m² by 1e6. The mainland box is 16°×14°, the
     islet's 0.01°×0.01°, so the two are five orders of magnitude apart and the check is unambiguous. */
  assert.ok(HOST.countryStats.JPN._area > 1e5,
    `its area is the mainland’s, not the islet’s (got ${HOST.countryStats.JPN._area})`);
});

/* ── ④ the rows arrive late, so the readers that already ran have to be told ─────────────────── */

test('R375 ⑦ rows added after boot get the PPP figures and the on-screen list', async () => {
  const added = await runLoader({ coarse: [JPN(), FRA()], fine: [JPN(), FRA(), SGP()] });
  await settle(() => !!added.HOST.countryStats.SGP);
  assert.equal(added.calls.reapplyPPP, 1,
    'reapplyPPP replays the kept World Bank payload over the rows that did not exist when it merged');

  /* …and NOT when nothing was added, because a replay costs a full walk of the table plus a
     re-render of the Countries tab, and #R195 moved this work to idle precisely to avoid that */
  const same = await runLoader({ coarse: [JPN(), FRA()], fine: [JPN(), FRA()] });
  await settle(() => same.calls.rebuildGeoIndex >= 2, 1500);
  assert.equal(same.calls.reapplyPPP, 0, 'no rows added → no replay');
});

/* ── ⑤ the shape of the fix, in the source ───────────────────────────────────────────────────── */

test('R375 ⑧ ONE constructor: neither loop builds the record by hand', () => {
  const src = codeOnly(read('js/countries-ui.js'));

  /* every write of a row goes through the constructor. A second hand-built record is how the two
     passes drifted apart in the first place, and a regular expression over prose cannot see that —
     hence codeOnly() (#R345). */
  const writes = [...src.matchAll(/HOST\.countryStats\[[A-Za-z_$][\w$]*\]\s*=\s*([^;]{0,24})/g)].map((m) => m[1].trim());
  assert.ok(writes.length >= 2, `both passes write a row; found ${writes.length}`);
  for (const rhs of writes) {
    assert.ok(rhs.startsWith('_mkStat('),
      `every countryStats row is built by _mkStat(); found a write of «${rhs}»`);
  }
  const defs = [...src.matchAll(/const\s+_mkStat\s*=/g)].length;
  assert.equal(defs, 1, '_mkStat is defined exactly once (#R345: a second definition is how ⑩ fails)');

  /* the exact line the defect lived on */
  assert.doesNotMatch(src, /best\.forEach\(\(v,code\)=>\{\s*const s=HOST\.countryStats\[code\];\s*if\(!s\)\s*return;/,
    'the upgrade must not bail out on a code the coarse file did not carry');
});

test('R375 ⑨ #R195’s own guard is intact: no wholesale replacement of an enriched row', () => {
  const src = codeOnly(read('js/countries-ui.js'));
  /* tests/r195-checks ⑧ forbids `HOST.countryStats[code]={…}` inside the upgrade. That guard is
     about the ENRICHMENT branch and is still exactly right; this round only added a CREATE branch
     next to it. Asserted here too so the two rounds' intents are visible in one place. */
  const up = src.slice(src.indexOf('best.forEach'));
  assert.doesNotMatch(up.slice(0, 600), /HOST\.countryStats\[code\]\s*=\s*\{/,
    'an existing row is still never replaced with a fresh object literal');
  assert.match(up.slice(0, 900), /s\.area=Math\.round\(v\.area\)/, 'the in-place enrichment is still there');
});

test('R375 Ⓔ the host hook exists and is wired both ends', () => {
  const shell = codeOnly(read('js/app-body.js'));
  const cui = codeOnly(read('js/countries-ui.js'));
  assert.match(shell, /get reapplyPPP\(\)\{ return _reapplyPPP; \}/, 'js/app-body.js publishes it on the host contract');
  assert.match(shell, /function _reapplyPPP\(\)\{ if\(_pppLast\) _mergePPP\(_pppLast\.pc,_pppLast\.tot\); \}/,
    'and it replays the kept payload rather than carrying a second copy of the merge');
  assert.match(shell, /function _mergePPP\(pc,tot\)\{ try\{ _pppLast=\{pc,tot\};/, 'the payload is kept where it is merged');
  assert.match(cui, /HOST\.reapplyPPP\(\)/, 'js/countries-ui.js calls it when it added rows');
});
