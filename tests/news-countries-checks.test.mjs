/* ============================================================================
 *  IntMap · the Countries table — what the map draws, the list lists, and the words beside it
 * ----------------------------------------------------------------------------
 *  js/countries-ui.js の表（countryStats）と幾何（countryGeo）が 1 つの集合であること、
 *  主権の判定、region / subregion の 9 言語解決。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithinFor } from './helpers/load-wx-source.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import fs, { readdirSync } from 'node:fs';
import { parse } from 'acorn';
import { importModule, langRegistry, fileUrl } from './helpers/import-module.mjs';
import * as walk from 'acorn-walk';

/* ════════ #R375 — from tests/r375-checks.test.mjs ════════ */
{
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
  /* (module-graph) the renderer is js/countries-ui.js's geo-engine.js IMPORT now (handed in as a mock below); the
     language registry and js/tables.js are the real modules it imports */
  const win = {};
  win.window = win;
  const GEO = {
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
      if (!body) return { ok: false, status: 404, text: async () => 'null', json: async () => null };
      const fc = JSON.stringify({ type: 'FeatureCollection', features: body });
      return { ok: true, status: 200, text: async () => fc, json: async () => JSON.parse(fc) };
    },
    navigator: {},
    /* the loader prefers requestIdleCallback; giving it a prompt one keeps the test near half a
       second instead of the 3 s setTimeout fallback. The SCHEDULE is not what is under test here. */
    requestIdleCallback: (fn) => setTimeout(fn, 0),
    console: { warn: () => {}, log: () => {}, error: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  /* (fetch-deadline-layer) js/countries-ui.js reads Natural Earth through js/fetch-deadline.js, reached as
     window.IntMapFetchWithin — the REAL file, evaluated so that the fetch it calls is this stub. The stub
     answers with a body (`text`) because that is what the clock reads. */
  win.IntMapFetchWithin = fetchWithinFor(env.fetch);
  /* (module-graph) the loader is IMPORTED, not run from its text: the stubs above are its browser (installed as
     globals for this case; the real console stays), and js/tables.js is the real module its import resolves to */
  const globals = { window: win, document: env.document, turf: env.turf, fetch: env.fetch, navigator: env.navigator,
    requestIdleCallback: env.requestIdleCallback, localStorage: env.localStorage };

  /* ⚠ (#R426) js/countries-ui.js now DEPENDS on this: `_mkStat` derives `bbox` (the frame)
     and `bboxAll` (the union) from window.IntMapCountryExtent. src/main.js imports it before
     js/countries-ui.js for exactly this reason, and this harness runs the real loader, so it
     loads it in the same order. Without it every row is built with a null footprint — which
     is what ③ and ⑤ below catch. */
  await importModule('js/country-extent.js', { globals });
  const M = await importModule('js/countries-ui.js', { globals, mocks: { 'js/geo-engine.js': { IntMapGeoEngine: GEO } } });
  const mod = M.countriesUi(HOST);
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

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
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

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
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

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R375 Ⓔ the host hook exists and is wired both ends', () => {
  const shell = codeOnly(read('js/app-body.js'));
  const cui = codeOnly(read('js/countries-ui.js'));
  assert.match(shell, /get reapplyPPP\(\)\{ return _reapplyPPP; \}/, 'js/app-body.js publishes it on the host contract');
  assert.match(shell, /function _reapplyPPP\(\)\{ if\(_pppLast\) _mergePPP\(_pppLast\.pc,_pppLast\.tot\); \}/,
    'and it replays the kept payload rather than carrying a second copy of the merge');
  assert.match(shell, /function _mergePPP\(pc,tot\)\{ try\{ _pppLast=\{pc,tot\};/, 'the payload is kept where it is merged');
  assert.match(cui, /HOST\.reapplyPPP\(\)/, 'js/countries-ui.js calls it when it added rows');
});
}

/* ════════ #R423 — from tests/r423-checks.test.mjs ════════ */
{
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
  /* (module-graph) the renderer is js/countries-ui.js's geo-engine.js IMPORT now (handed in as a mock below); the
     language registry and js/tables.js are the real modules it imports */
  const win = {};
  win.window = win;
  const GEO = {
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
      if (!body) return { ok: false, status: 404, text: async () => 'null', json: async () => null };
      const fc = JSON.stringify({ type: 'FeatureCollection', features: body });
      return { ok: true, status: 200, text: async () => fc, json: async () => JSON.parse(fc) };
    },
    navigator: {},
    requestIdleCallback: (fn) => setTimeout(fn, 0),
    console: { warn: () => {}, log: () => {}, error: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  /* (fetch-deadline-layer) js/countries-ui.js reads Natural Earth through js/fetch-deadline.js, reached as
     window.IntMapFetchWithin — the REAL file, evaluated so that the fetch it calls is this stub. The stub
     answers with a body (`text`) because that is what the clock reads. */
  win.IntMapFetchWithin = fetchWithinFor(env.fetch);
  /* (module-graph) imported as in #R375's harness above: the stubs are the browser, the renderer is the mock */
  const globals = { window: win, document: env.document, turf: env.turf, fetch: env.fetch, navigator: env.navigator,
    requestIdleCallback: env.requestIdleCallback, localStorage: env.localStorage };
  const M = await importModule('js/countries-ui.js', { globals, mocks: { 'js/geo-engine.js': { IntMapGeoEngine: GEO } } });
  const mod = M.countriesUi(HOST);
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

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('R423 ④ every reader of the sovereignty flag is found by sweeping js/, and the fix reaches all of them', async () => {
  /* `sov` is not the Countries list's private field. These are the sites that ask `sov!==false`,
     found by sweeping js/ this round; a fix that repaired only `renderStats` would leave Norway out
     of every Atlas ranking and out of the comparison picker, which is what the report's "no row"
     was one symptom of. The sweep is asserted here so a future reader cannot be added silently
     without this file noticing the count changed. */
  /* ⚠⚠⚠ (#R733) THE SWEEP IS RUN HERE, NOT FROZEN AS FIVE FILENAMES. The paragraph above says the
     readers were 「found by sweeping js/」 and then the check named the five files that sweep hit —
     so what it actually measured was 「these five files still contain what they contained」. #R733
     moved the country resolver out of js/atlas-console.js into js/atlas-geo-resolve.js and this went
     red, with SIX readers still present and ONE file not on the list. That is the shape
     .agents/rules/no-ad-hoc-hardcoding.md §1 names and [[intmap-restate-the-defect-not-the-fix]]
     restates: the defect was 「a reader can be ADDED silently」, and a frozen file list also refuses
     a reader that MOVED. The invariant is about the flag, so it is measured over js/. */
  const JS = readdirSync(resolve(HERE, '..', 'js')).filter((f) => f.endsWith('.js')).sort();
  const readers = [];
  let total = 0;
  for (const f of JS) {
    const n = (read('js/' + f).match(/\.sov\s*(===|!==)\s*false/g) || []).length;
    if (n) { readers.push(`js/${f}:${n}`); total += n; }
  }
  /* ⚠⚠⚠ AND THE SWEEP IMMEDIATELY FOUND THE THING THE FROZEN LIST EXISTED TO PREVENT. Seven, not
     six: `js/atlas-query.js` has read this flag since #R495 and was never on the five-file list, so
     「a future reader cannot be added silently」 is exactly what happened — silently, and the check
     stayed green through it. The count rose because the census got wider, NOT because a reader was
     added this round; the flag is still written in one place and still reaches all seven. */
  /* ⚠⚠ (#R775) EIGHT. `js/atlas-metrics.js` `isRankableCountry` is the eighth, and it was added because
     `data.rank` / `ratio` / `relate` / `drawChoro` / `scoreMap` were NOT reading the flag — measured on
     production, Antarctica came back as the country with the highest GDP per capita. The number here is
     a WATCHMAN, not a policy: it exists so a reader cannot appear unnoticed, and it moves when one does.
     What must not move is the line below it — the flag is still written in exactly one place. */
  assert.equal(total, 8, 'readers of the sovereignty flag across js/ — found: ' + readers.join(', '));
  assert.ok(readers.indexOf('js/atlas-metrics.js:1') >= 0, 'including the one predicate every Atlas ranking asks');
  assert.ok(readers.indexOf('js/atlas-query.js:1') >= 0, 'including the one the frozen list could not see');

  /* and they all read ONE field, written in ONE place — so fixing the predicate fixes all six */
  const writes = (read('js/countries-ui.js').match(/^\s*sov:/gm) || []).length;
  assert.equal(writes, 1, 'the flag is written in exactly one place (js/countries-ui.js `_mkStat`)');
});

test('R423 ⑤ the predicate reads TYPE, and TYPE decides', async () => {
  /* ⚠ (tests-by-topic) EVALUATED over the whole shape space. This was a source-level guard on the
     SHAPE of the fix (the words `_neCountry`, the TYPE regex, `indetermin|unrecogn` in the `_nonSov`
     line) — which a correct predicate written another way would fail, and a wrong one that kept the
     words would pass. The shipped loader is run over every (TYPE, FCLASS_TLC) pair Natural Earth can
     hand it, and the flag it WROTE is compared with the rule the round stated:
       · NE calls it a country (TYPE «Sovereign country» / «Country») → sovereign, whatever FCLASS says;
       · TYPE «Indeterminate» → not sovereign, whatever FCLASS says (#R23);
       · anything else → #R23's FCLASS branch still decides (`indetermin` / `unrecogn`). */
  const all = CROSS();
  const { HOST } = await runLoader({ coarse: all, fine: all });
  await settle(() => (HOST.countryGeo.features || []).length === all.length);
  const wrong = [];
  for (const f of all) {
    const p = f.properties, row = HOST.countryStats[p.ISO_A3_EH];
    assert.ok(row, `${p.ISO_A3_EH} has a row`);
    const want = IS_COUNTRY(p.TYPE) ? true
      : (p.TYPE === 'Indeterminate' ? false : !/indetermin|unrecogn/i.test(String(p.FCLASS_TLC || '')));
    if (row.sov !== want) wrong.push(`${p.TYPE} / ${p.FCLASS_TLC}: sov=${row.sov}, want ${want}`);
  }
  assert.deepEqual(wrong, [], 'TYPE must decide for a country, and #R23 for everything else');
  /* the pair that was the report, named: TYPE says country, one viewpoint says «Unrecognized» */
  const nor = all.find((f) => f.properties.TYPE === 'Sovereign country' && f.properties.FCLASS_TLC === 'Unrecognized');
  assert.equal(HOST.countryStats[nor.properties.ISO_A3_EH].sov, true, 'TYPE outranks FCLASS_TLC');
});
}

/* ════════ #R424 — from tests/r424-checks.test.mjs ════════ */
{
/* ============================================================================
 *  R424 — 国名の下のサブ行は、歴史上の国だけ英語のままだった
 * ----------------------------------------------------------------------------
 *  報告（本番・日本語・1916年）:
 *    歴史上の行  「イギリス領インド帝国 / South Asia / Calcutta / New Delhi」
 *                「大日本帝国 / East Asia / Tokyo」
 *    現代の行    「北アメリカ」「ヨーロッパ」   ——同じ一覧の、同じ位置。
 *
 *  #R251 は `s.region` を `_regionName()` に通した。その表は **Natural Earth の CONTINENT** だけを
 *  写した閉じた集合で、`s.region` の**産地はそれ一つではなかった**。表に無い値は `return r` に落ち、
 *  九言語すべてで生の英語のまま出る。しかも**どの計器も見えない**——tests/r251-langs.spec.js は
 *  「IntMap がその文字列の訳を**持っている**とき」だけ鳴るので、訳が無い語には沈黙する。
 *
 *  産地は二つあった。
 *    ① js/history.js の `STATES` は**準大陸の語彙**を持つ（Eurasia / Middle East / South Asia /
 *       Southeast Asia / East Asia）。大陸は一つも無い。これが報告された欠陥。
 *    ② Natural Earth には**八つ目の CONTINENT 値**がある。実測（この app が取りに行く三つの縮尺）:
 *       ne_110m ＝既定の起動が読む file が «Seven seas (open ocean)» を ATF に与えており、
 *       ATF は `sov:true` なので**一覧に出る行**である。ne_50m / ne_10m ではモルディブ・
 *       モーリシャス・セーシェル・セントヘレナ・BIOT・南ジョージア・ハード島・クリッパートンも
 *       そこに入る。つまり**歴史側だけの欠陥ではなかった**。
 *
 *  ⚠ この検査は「表に何が書いてあるか」ではなく「**表が語彙を覆っているか**」を訊く。①②が
 *  それで、js/history.js に州を足した誰かが訳の無い region を黙って持ち込めなくなる。
 *  ④ は表の形ではなく **app 自身の解決器を実行して**九言語ぶんの答えを見る。
 *
 *  ── #R443 追記（⑥〜⑩）──────────────────────────────────────────────────────────────
 *  **同じ行の残り半分**。⑤ が「カードは region を解決している」と言った隣で、`s.subregion` は
 *  生のまま出続けた——日本語で「北アメリカ / Northern America」、de/ru/es/fr/ko/zh-Hant/
 *  zh-Hans も同じ。#R424 はそれを一文で見送っている（「表に無いので英語のまま」）が、
 *  **表は二つ在った**: js/atlas-examples.js が 22 値（#R313 追記2）、残る 2 値は `_REGIONS`。
 *
 *  だから ⑥〜⑩ は「二つ目の表が在るか」ではなく「**一つだけ在って・語彙を覆っていて・
 *  重なる所で食い違わないか**」を訊く。⑩ が、元の欠陥そのものを捕まえる段——
 *  **面ごとに写しがあり、片方だけ直る**という形を、js/*.js 全体を数えて禁じる。
 * ==========================================================================*/
const root = new URL('../', import.meta.url);
const rd = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const abs = (p) => new URL(p, root).pathname;

const COUNTRIES = 'js/countries-ui.js';
const HISTORY = 'js/history.js';

/* ── the `_REGIONS` table, read as a TREE rather than as text ───────────────────────────────────
   A regex over the source would also match this file's own prose in the header above, which is
   [[intmap-recurring-lessons]]'s «the check says yes to its own explanation». acorn answers about
   the object that is actually assigned.
   ⚠ (#R443) `sourceType` stays SCRIPT — see ⑩. Four harnesses run this file through
   `new Function(src)`, so it must remain parseable as a classic script, and this parse is the same
   claim made cheaply.
   (module-graph) the file imports its collaborators and exports its factory now, so it is parsed as the
   module it is; the classic-script claim of ⑩ is the part this migration ended. */
const countriesAst = () => parse(rd(COUNTRIES), { ecmaVersion: 2022, sourceType: 'module' });

/** the properties of an ObjectExpression, as {key, call} — the shape ③ and ④ read */
const entriesOf = (obj) => obj.properties.map((p) => ({
  key: p.key.type === 'Literal' ? p.key.value : p.key.name,
  call: p.value,
}));

function regionTable() {
  const ast = countriesAst();
  let obj = null;
  walk.simple(ast, {
    AssignmentExpression(n) {
      if (n.left.type === 'Identifier' && n.left.name === '_REGIONS' && n.right.type === 'ObjectExpression') obj = n.right;
    },
  });
  assert.ok(obj, `${COUNTRIES}: no _REGIONS object is assigned anywhere`);
  return entriesOf(obj);
}

/* ── (#R443) …and the SUBREGION table beside it, read the same way ─────────────────────────────
   It is cached on the published function itself (`window._imSubregionName._t = {…}`), which is the
   shape `window._imCldrRegion._c` in the same file already uses: no unexported top-level
   declaration, and nothing built while the file is evaluated. */
function subregionTable() {
  const ast = countriesAst();
  let obj = null;
  walk.simple(ast, {
    AssignmentExpression(n) {
      const l = n.left;
      if (l.type === 'MemberExpression' && !l.computed && l.property.name === '_t'
        && l.object.type === 'MemberExpression' && l.object.property.name === '_imSubregionName'
        && n.right.type === 'ObjectExpression') obj = n.right;
    },
  });
  assert.ok(obj, `${COUNTRIES}: no window._imSubregionName._t object is assigned anywhere`);
  return entriesOf(obj);
}

/** every `region:'…'` STRING literal js/history.js declares (its `region:S.region` is not one) */
function historyRegions() {
  const ast = parse(rd(HISTORY), { ecmaVersion: 2022, sourceType: 'module' });   /* (module-graph) js/history.js imports now */
  const out = new Set();
  walk.simple(ast, {
    Property(n) {
      const k = n.key.type === 'Literal' ? n.key.value : n.key.name;
      if (k === 'region' && n.value.type === 'Literal' && typeof n.value.value === 'string' && n.value.value) out.add(n.value.value);
    },
  });
  return out;
}

/* ⚠ MEASURED, NOT REMEMBERED — 2026-08-25, over the three files loadCountryData() fetches from
   nvkelso/natural-earth-vector: ne_110m (177 features), ne_50m (242) and ne_10m (258). The union of
   their CONTINENT values is these eight, and the eighth is not a continent at all. 0 features carry
   an empty CONTINENT at any scale, which is also why the restcountries fallback in enrichCountry()
   («Americas» / «Antarctic») is unreachable in practice and is not listed here. */
const NE_CONTINENTS = [
  'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica',
  'Seven seas (open ocean)',
];

/* ⚠ (#R443) MEASURED THE SAME WAY, THE SAME DAY, over the same three files: the union of their
   SUBREGION values is these 24. ne_110m — the file every default boot reads — carries 22 of them;
   ne_50m and ne_10m add «Micronesia» and «Polynesia». 0 features carry an empty SUBREGION at any
   scale, so `enrichCountry()`'s restcountries fallback for this field is unreachable in practice,
   exactly as #R424 found for CONTINENT. ⚠ THREE OF THESE ARE ALSO CONTINENT VALUES — that is not a
   mistake in the list, it is why ⑨ exists. */
const NE_SUBREGIONS = [
  'Antarctica', 'Australia and New Zealand', 'Caribbean', 'Central America', 'Central Asia',
  'Eastern Africa', 'Eastern Asia', 'Eastern Europe', 'Melanesia', 'Micronesia', 'Middle Africa',
  'Northern Africa', 'Northern America', 'Northern Europe', 'Polynesia', 'Seven seas (open ocean)',
  'South America', 'South-Eastern Asia', 'Southern Africa', 'Southern Asia', 'Southern Europe',
  'Western Africa', 'Western Asia', 'Western Europe',
];

/* ⚠ (#R443) the four groups of rows where Natural Earth's CONTINENT and its SUBREGION name the SAME
   place. English keeps «North America / Northern America» apart; every other language spells both
   halves identically, which is why the card compares RESOLVED strings rather than these keys. */
const COLLIDING = [
  ['North America', 'Northern America'], ['South America', 'South America'],
  ['Antarctica', 'Antarctica'], ['Seven seas (open ocean)', 'Seven seas (open ocean)'],
];

/* ══ ① the vocabulary js/history.js DECLARES is covered by the table that translates it ═════════ */
test('R424 ① every region js/history.js declares has an entry in the country table', () => {
  const keys = new Set(regionTable().map((r) => r.key));
  const missing = [...historyRegions()].filter((r) => !keys.has(r)).sort();
  assert.deepEqual(missing, [],
    `js/history.js declares ${missing.length} region(s) that _REGIONS in ${COUNTRIES} does not translate — `
    + `they print as raw English in all nine languages: ${missing.join(', ')}`);

  /* …and the gate is not vacuous: this vocabulary is NOT the continents, which is the whole reason
     #R251's table missed it. If a later round genuinely folds these into continents, delete this
     assertion deliberately rather than letting the one above go quietly true for a new reason. */
  const outside = [...historyRegions()].filter((r) => !NE_CONTINENTS.includes(r));
  assert.ok(outside.length >= 5,
    'js/history.js used to carry five sub-continental regions no Natural Earth continent covers; '
    + `it now carries ${outside.length}`);
});

/* ══ ② …and so is Natural Earth's own, including the value that is not a continent ═════════════ */
test('R424 ② every Natural Earth CONTINENT value has an entry in the country table', () => {
  const keys = new Set(regionTable().map((r) => r.key));
  const missing = NE_CONTINENTS.filter((r) => !keys.has(r));
  assert.deepEqual(missing, [],
    `Natural Earth puts these on real rows of the Countries list and ${COUNTRIES} cannot name them: ${missing.join(', ')}`);
});

/* ══ ③ every entry is a five-argument call — the shape every instrument in scripts/i18n-*.mjs sees ═ */
test('R424 ③ every region is a five-argument L(…) call whose first argument is its own key', () => {
  for (const { key, call } of regionTable()) {
    assert.equal(call.type, 'CallExpression', `${key}: the table value must be a call, not a literal array (#R241)`);
    assert.equal(call.arguments.length, 5, `${key}: expected 5 positional arguments, got ${call.arguments.length}`);
    for (const [i, a] of call.arguments.entries()) {
      assert.equal(a.type, 'Literal', `${key}: argument ${i} must be a string literal`);
      assert.ok(typeof a.value === 'string' && a.value.trim(), `${key}: argument ${i} is empty`);
    }
    assert.equal(call.arguments[0].value, key,
      `${key}: argument 0 IS the lookup key — fr / ko / zh resolve through the inline table by it (js/lang-registry.js)`);
  }
});

/* ══ ④ …AND THE APP'S OWN RESOLVER IS ASKED, IN ALL NINE LANGUAGES ══════════════════════════════
   Not «is there a table row» — that is a shape, and a shape is what walked past this from #R251 onwards.
   js/lang-registry.js and the four inline locale files are LOADED and RUN here, and each region is
   resolved exactly the way js/countries-ui.js resolves it. de / ru / es come from the call's own
   arguments; fr / ko / zh / zh-hans come from `inline`, keyed by the English string. */
/* (module-graph) the registry is a module now: it is the REAL js/lang-registry.js (langRegistry() declares the
   list js/locales/_langs.js publishes), and the four inline locale files are IMPORTED — each one's
   `IntMapLang.define` lands in that same instance, which is what the app does. */
async function resolver() {
  const IntMapLang = langRegistry();
  for (const c of ['fr', 'ko', 'zh', 'zh-hans']) await import(fileUrl(`js/locales/ui.${c}.js`));
  return { IntMapLang };
}

/* ⚠ THREE PAIRS ARE GENUINELY THE SAME WORD, and each is a claim about ONE language — the same rule
   scripts/i18n-positional-audit.mjs states for its own SAME_AS_EN set. «Asia» and «Eurasia» are the
   Spanish spellings (RAE); «Europe» is the French one. Everything else must differ. */
const SAME_AS_EN = { es: ['Asia', 'Eurasia'], fr: ['Europe'] };

test('R424 ④ every region resolves in all nine languages, through the app’s own resolver', async () => {
  const ctx = await resolver();
  const codes = ctx.IntMapLang.list().map((r) => r.code);
  assert.equal(codes.length, 9, `the locale directory declares nine languages; it declared ${codes.join(',')}`);

  let lang = 'en';
  const pick = ctx.IntMapLang.pick(() => lang);
  const bad = [];
  for (const { key, call } of regionTable()) {
    const args = call.arguments.map((a) => a.value);
    for (const code of codes) {
      lang = code;
      const got = pick.apply(null, args);
      assert.ok(got && String(got).trim(), `${key} resolved to nothing in ${code}`);
      if (code === 'en') { assert.equal(got, key, `${key}: English must be the key itself`); continue; }
      const allowed = (SAME_AS_EN[code] || []).includes(key);
      if (got === key && !allowed) bad.push(`${code}  ${key}`);
    }
  }
  assert.deepEqual(bad, [],
    `${bad.length} region(s) still resolve to the English string — a reader of that language sees English `
    + `under the country's name:\n  ${bad.join('\n  ')}`);
});

/* ══ ⑤ BOTH surfaces that print the field go through the table ══════════════════════════════════
   #R251 routed the list's sub-line and left the country card printing `s.region` raw, so the row a
   reader clicked said 「ヨーロッパ」 and the card it opened said «Europe / Western Europe».
   ⚠ Code-shaped needles only — this file's own header names the field and the spellings. */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R424 ⑤ the list sub-line and the country card both name the region through _regionName', () => {
  const src = codeOnly(rd(COUNTRIES));   /* comments are not the program */

  assert.match(src, /const subline=[^\n]*_regionName\(s\.region\)/,
    'the Countries list sub-line must resolve the region, not print it');
  assert.match(src, /statRegion'\)[^\n]*_regionName\(s\.region\)/,
    'the country card’s Region row must resolve the region, not print it');

  assert.doesNotMatch(src, /\$\{s\.region\}/, 'a raw ${s.region} is English in nine languages');
  assert.doesNotMatch(src, /\(s\.region\|\|'—'\)/, 'the shape #R424 removed from the country card is back');

  /* the capital is a PLACE NAME and stays untranslated on BOTH kinds of row — that is what makes the
     region the only inconsistency the reader saw, and it was measured before deciding: modern rows
     print CAPITAL[code] («Washington, D.C.»), historical rows print _STINFO's («Tokyo»). */
  assert.match(src, /const subline=[^\n]*s\.capital\|\|''/,
    'the sub-line still prints the capital as it stands (#R251)');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  R443 — …AND THE OTHER HALF OF THE VERY SAME LINE
 * ----------------------------------------------------------------------------------------------
 *  ⑤ above says the card resolves `s.region`. It printed `s.subregion` RAW beside it for another
 *  nineteen rounds — 「北アメリカ / Northern America」 in Japanese, and the same in de/ru/es/fr/
 *  ko/zh-Hant/zh-Hans — because #R424 deferred it in one sentence: «it has no entry in any table
 *  to be shown instead». It had two. js/atlas-examples.js held 22 of the 24 values as shipped
 *  `L(…)` calls (#R313 追記2), and the other two were already `_REGIONS` keys.
 *
 *  ⚠ SO THESE CHECKS ARE NOT «is there a second table» — they are «is there exactly ONE, does it
 *  cover the vocabulary, and do the two tables agree where they overlap». ⑩ is the part that
 *  would have caught the original defect: a copy per surface, corrected on one of them.
 * ══════════════════════════════════════════════════════════════════════════════════════════════*/

/* ⚠ ONE CLAIM PER LANGUAGE, read against the RAE the same way ④'s set was: Spanish spells both
   Oceanian subregions exactly as English does, and scripts/i18n-positional-audit.mjs has carried
   that same pair since #R309. Everything else in the 24 must differ. */
const SAME_AS_EN_SUB = { es: ['Melanesia', 'Micronesia'] };

/* ══ ⑥ the table IS Natural Earth's SUBREGION vocabulary — no gap, and no invented key ═════════ */
test('R443 ⑥ subregionName covers exactly Natural Earth’s 24 SUBREGION values', () => {
  const keys = subregionTable().map((r) => r.key).sort();
  assert.deepEqual(keys, [...NE_SUBREGIONS].sort(),
    'a value Natural Earth puts on a real row of the Countries list prints as raw English in all '
    + 'nine languages, or the table carries a key nothing upstream can produce');
});

/* ══ ⑦ …in the five-argument shape every instrument in scripts/i18n-*.mjs can see ══════════════ */
test('R443 ⑦ every subregion is a five-argument call whose first argument is its own key', () => {
  for (const { key, call } of subregionTable()) {
    assert.equal(call.type, 'CallExpression', `${key}: the table value must be a call, not a literal array (#R241)`);
    assert.equal(call.arguments.length, 5, `${key}: expected 5 positional arguments, got ${call.arguments.length}`);
    for (const [i, a] of call.arguments.entries()) {
      assert.equal(a.type, 'Literal', `${key}: argument ${i} must be a string literal`);
      assert.ok(typeof a.value === 'string' && a.value.trim(), `${key}: argument ${i} is empty`);
    }
    assert.equal(call.arguments[0].value, key,
      `${key}: argument 0 IS the lookup key — fr / ko / zh resolve through the inline table by it (js/lang-registry.js)`);
  }
});

/* ══ ⑧ …AND THE APP'S OWN RESOLVER IS ASKED, IN ALL NINE LANGUAGES ════════════════════════════ */
test('R443 ⑧ every subregion resolves in all nine languages, through the app’s own resolver', async () => {
  const ctx = await resolver();
  const codes = ctx.IntMapLang.list().map((r) => r.code);
  let lang = 'en';
  const pick = ctx.IntMapLang.pick(() => lang);
  const bad = [];
  for (const { key, call } of subregionTable()) {
    const args = call.arguments.map((a) => a.value);
    for (const code of codes) {
      lang = code;
      const got = pick.apply(null, args);
      assert.ok(got && String(got).trim(), `${key} resolved to nothing in ${code}`);
      if (code === 'en') { assert.equal(got, key, `${key}: English must be the key itself`); continue; }
      if (got === key && !(SAME_AS_EN_SUB[code] || []).includes(key)) bad.push(`${code}  ${key}`);
    }
  }
  assert.deepEqual(bad, [],
    `${bad.length} subregion(s) still resolve to the English string — a reader of that language sees `
    + `English on the card’s Region row:\n  ${bad.join('\n  ')}`);
});

/* ══ ⑨ the two tables agree where the same place is in both, and that is what the card collapses ═ */
test('R443 ⑨ CONTINENT and SUBREGION never disagree about a place they both name', async () => {
  const reg = new Map(regionTable().map((r) => [r.key, r.call.arguments.map((a) => a.value)]));
  const sub = new Map(subregionTable().map((r) => [r.key, r.call.arguments.map((a) => a.value)]));

  /* ① the three keys that are literally in both tables must be the same five arguments. Two copies
        of one spelling is how the defect this round fixed was born, one level up. */
  const shared = [...sub.keys()].filter((k) => reg.has(k));
  assert.ok(shared.length >= 3,
    `«Antarctica», «South America» and «Seven seas (open ocean)» are Natural Earth CONTINENT values AND `
    + `SUBREGION values; the tables share ${shared.length} keys, so this check has stopped asserting anything`);
  for (const k of shared) {
    assert.deepEqual(sub.get(k), reg.get(k),
      `${k}: the same place is spelled two ways in the two tables — the card would print both`);
  }

  /* ② …and the card's collapse compares RESOLVED strings, so measure them. Every language except
        English spells both halves of all four pairs identically; English keeps «North America»
        apart from «Northern America», which is the one row of this table that must NOT collapse. */
  const ctx = await resolver();
  const codes = ctx.IntMapLang.list().map((r) => r.code);
  let lang = 'en';
  const pick = ctx.IntMapLang.pick(() => lang);
  const rows = [];
  for (const [r, s] of COLLIDING) {
    assert.ok(reg.has(r), `${r} is a CONTINENT value with no entry in _REGIONS`);
    assert.ok(sub.has(s), `${s} is a SUBREGION value with no entry in subregionName`);
    for (const code of codes) {
      lang = code;
      const a = pick.apply(null, reg.get(r)), b = pick.apply(null, sub.get(s));
      rows.push({ code, r, s, same: a === b, a, b });
    }
  }
  const notSame = rows.filter((x) => !x.same).map((x) => `${x.code}  ${x.a} / ${x.b}`);
  assert.deepEqual(notSame, ['en  North America / Northern America'],
    'the card doubles a place name for a reader of these languages — or English has stopped being '
    + `the one pair that legitimately differs:\n  ${notSame.join('\n  ')}`);
});

/* ══ ⑩ ONE TABLE, TWO READERS — the shape that would have caught the original defect ═══════════ */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R443 ⑩ the card resolves the subregion, and no second copy of the table exists in js/', () => {
  const strip = (s) => codeOnly(s);   /* comments are not the program (#R345) */
  const src = strip(rd(COUNTRIES));

  assert.match(src, /statRegion'\)[^\n]*_imSubregionName\(s\.subregion,\s*HOST\.lang\)/,
    'the country card’s Region row must resolve the subregion, not print Natural Earth’s English');
  assert.doesNotMatch(src, /\(s\.subregion\?' \/ '\+s\.subregion:''\)/,
    'the shape #R443 removed from the country card is back — the raw SUBREGION beside a translated region');
  assert.match(src, /const _regRow=\(a,b\)=>[^\n]*b!==a/,
    'the collapse must compare the two RESOLVED strings; comparing the English keys collapses none of the four');

  /* the table is DECLARED once. A `'Australia and New Zealand':` key is this vocabulary and nothing
     else; js/locales/ui.*.js hold the same words as INLINE entries, which is a different mechanism
     (keyed by the English string, for the four languages past the positional five) and is not js/*.js. */
  const jsDir = new URL('js/', root);
  const holders = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'))
    .filter((f) => /'Australia and New Zealand'\s*:/.test(strip(fs.readFileSync(new URL(f, jsDir), 'utf8'))));
  assert.deepEqual(holders, ['countries-ui.js'],
    'the 24 SUBREGION names are declared in more than one js/ module — a correction made on one of '
    + `them leaves the other wrong, which is exactly how this round’s defect was built: ${holders.join(', ')}`);

  const atlas = strip(rd('js/atlas-examples.js'));
  assert.match(atlas, /window\._imSubregionName\(s,\s*HOST\.lang\)/,
    'Atlas’s {sub} slot must resolve through the one shared table, with its own language');

  /* ⚠⚠ AND THE BRIDGE IS `window`, NOT `export`, FOR A REASON THAT IS MEASURED HERE RATHER THAN
     REMEMBERED. Several harnesses run js/countries-ui.js as a CLASSIC SCRIPT through
     `new Function(src)` so they can exercise the real `_mkStat` and the real 10 m upgrade pass over
     synthetic Natural Earth features. One `export` keyword is a SyntaxError to every one of them —
     measured: 16 tests red across tests/news-countries-checks.test.mjs #R375, r392, r423 and r337 on a file whose behaviour had not
     changed. ⚠ The count below is COUNTED, not written down, and the property those harnesses depend
     on is stated directly — so a future round learns it from one parse error here, not from sixteen
     somewhere else, and the day nothing runs this file as a script the first assertion says so. */
  /* (tests-by-topic) this file used to exclude itself, because it only NAMED the two strings. It is
     now the file that holds #R375's and #R423's loader harness too — it really does run
     js/countries-ui.js through `new Function`, so it is counted like every other runner. */
  /* (module-graph) THAT CONSTRAINT ENDED, and what it protected is now stated the other way round. The file
     imports its collaborators and EXPORTS its factory, so it is a module and a harness reaches it by import
     (tests/helpers/import-module.mjs). A harness that still evaluated the file's TEXT would have to strip
     the import/export lines and fake the edges on `window` — the hand-written dependency list the migration
     removed. So: it parses as a module, it exports `countriesUi`, and no check file runs its whole text.
     The discovery is the old one made exact — the old one counted any file that NAMED the path and
     contained `new Function(` anywhere, which was 13 files, most of them evaluating something else:
     a whole-file evaluation is an eval call (new Function / vm.run* / new vm.Script, or a local helper
     that wraps one) on a statement that names the path, or fed a variable that holds the file's whole
     text. A lifted FRAGMENT (liftFunction / fnBody / slice / match) is not the file and is not counted. */
  assert.doesNotThrow(() => parse(rd(COUNTRIES), { ecmaVersion: 2022, sourceType: 'module' }),
    `${COUNTRIES} must parse as the ES module it is`);
  const ast = parse(rd(COUNTRIES), { ecmaVersion: 2022, sourceType: 'module' });
  assert.ok(ast.body.some((st) => st.type === 'ExportNamedDeclaration' && st.declaration
      && st.declaration.type === 'FunctionDeclaration' && st.declaration.id.name === 'countriesUi'),
    `${COUNTRIES} must export its factory, countriesUi, for the shell and the harnesses to import`);

  const EVAL = /\bnew\s+Function\s*\(|\bvm\.run(?:InContext|InNewContext|InThisContext)\s*\(|\bnew\s+vm\.Script\s*\(/g;
  const FRAGMENT = /\b(?:liftFunction|liftBody|lift|fnBody|bodyOf)\s*\(|\.slice\(|\.match\(|\.exec\(|indexOf\(/;
  const PATH = /countries-ui\.js/;
  const argOf = (code, open) => {   /* the balanced (...) an eval call opens */
    let depth = 0, q = null, i = open;
    for (; i < code.length; i++) {
      const c = code[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '(') depth++; else if (c === ')' && !--depth) break;
    }
    return code.slice(open, i + 1);
  };
  const tDir = new URL('tests/', root);
  const runners = [];
  for (const f of fs.readdirSync(tDir).filter((n) => n.endsWith('.test.mjs'))) {
    const code = codeOnly(fs.readFileSync(new URL(f, tDir), 'utf8'));
    if (!PATH.test(code)) continue;
    /* local helpers that wrap an eval call: `const run = (src) => new Function(…)` / `function run(src) { … }` */
    const helpers = new Set();
    for (const m of code.matchAll(EVAL)) {
      const before = code.slice(Math.max(0, m.index - 400), m.index);
      const defs = [...before.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|function\s+([A-Za-z_$][\w$]*)\s*\(/g)];
      const d = defs[defs.length - 1];
      if (d) helpers.add(d[1] || d[2]);
    }
    /* variables holding the file's WHOLE text */
    const whole = new Set();
    for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*)/g)) {
      if (PATH.test(m[2]) && !FRAGMENT.test(m[2])) whole.add(m[1]);
    }
    const mentionsFile = (s) => !FRAGMENT.test(s) && (PATH.test(s) || [...whole].some((v) => new RegExp('\\b' + v.replace(/\$/g, '\\$') + '\\b').test(s)));
    const calls = [...code.matchAll(EVAL)].map((m) => argOf(code, m.index + m[0].length - 1));
    for (const h of helpers) {
      for (const m of code.matchAll(new RegExp('(?<![\\w$.])' + h.replace(/\$/g, '\\$') + '\\s*\\(', 'g'))) calls.push(argOf(code, m.index + m[0].length - 1));
    }
    if (calls.some(mentionsFile)) runners.push(f);
  }
  assert.deepEqual(runners, [],
    `${COUNTRIES} is a module: import it (tests/helpers/import-module.mjs) instead of evaluating its text — `
    + `these check files still run the whole file through new Function / vm: ${runners.join(', ')}`);
});
}
