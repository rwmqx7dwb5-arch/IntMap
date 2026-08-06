/* ============================================================================
 *  R195 — the source-level invariants behind this round's four changes.
 *
 *  These are the claims a browser test cannot make cheaply: that a literal is
 *  written in exactly two places and they agree, that a moved body really moved,
 *  and that the one value a split module cannot inherit is handed to it.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

const appBody = rd('js/app-body.js');
const mapUi = rd('js/map-ui.js');
const geoEngine = rd('js/geo-engine.js');
const cesium = rd('js/cesium-engine.js');
const tsunami = rd('js/tsunami.js');
const satProto = rd('js/sat-proto.js');
const countries = rd('js/countries-ui.js');
const mainJs = rd('src/main.js');

/* ── ① the sidebar state: one key, written in two places, and they must agree ─────────────────── */
test('R195 ①: the session key the sidebar reads is the key the session writes', () => {
  /* Three sites, one literal: the persistence block's KEY (the only WRITER), the #R122 early read of
     the saved layer list, and #R195's early read of the sidebar states. A fourth appearing without a
     reason, or any of them drifting, is what this pins — the sidebars restore from a key written
     ~2,500 lines away, and a typo there would fail silently as "the state was never saved". */
  const keys = [...appBody.matchAll(/'intmap_session2'/g)].length;
  assert.equal(keys, 3, `'intmap_session2' should appear exactly three times in js/app-body.js `
    + `(the KEY, the early layer read, the early sidebar read); found ${keys}`);
  assert.match(appBody, /const KEY='intmap_session2'/, 'the persistence block still owns the key');
  assert.match(appBody, /localStorage\.getItem\('intmap_session2'\)/, 'the sidebar read uses the same key');
});

test('R195 ①: both sidebars are recorded, and every route out of them records itself', () => {
  assert.match(appBody, /sbOpen,\s*lsrOpen/, 'the snapshot carries both sidebar states');
  assert.match(appBody, /sbOpen=!el\.classList\.contains\('collapsed'\)/, 'the left state is read off the DOM');
  assert.match(appBody, /lsrOpen=el\.classList\.contains\('open'\)/, 'the right state is read off the DOM');
  assert.match(appBody, /window\._imSessionUI=_sessUI/, 'the wanted state is published for the layer panel');
  /* the left toggle, and the right panel's open/close/toggle, all save */
  const saves = [...mapUi.matchAll(/window\._imSaveSession&&window\._imSaveSession\(\)/g)].length;
  assert.ok(saves >= 3, `the right layer panel should record open, close and toggle; found ${saves}`);
  assert.match(appBody, /classList\.toggle\('collapsed'\);[\s\S]{0,400}?_imSaveSession/,
    'the left sidebar toggle records itself');
  /* …and boot restores the right panel only when the last session left it open */
  assert.match(mapUi, /window\._imSessionUI&&window\._imSessionUI\.right===true&&!isMob\(\)/,
    'a first visit still boots with the layer panel closed');
});

/* ── ② the dynamic image is parameterised by the engine, not by latitude ──────────────────────── */
test('R195 ②: both engines answer "what latitude is image row r", and differently', () => {
  assert.match(geoEngine, /imageRowLatitudes\(coordinates,height\)/, 'the MapLibre adapter implements it');
  assert.match(cesium, /imageRowLatitudes\(coordinates,height\)/, 'the Cesium adapter implements it');
  /* MapLibre's is the Mercator inverse; Cesium's is linear in latitude. If these two ever became the
     same expression, the bug this round fixed would be back on one of the engines. */
  assert.match(geoEngine, /Math\.log\(Math\.tan\(Math\.PI\s*\/\s*4\s*\+/, 'MapLibre maps rows through Mercator Y');
  assert.match(geoEngine, /2\s*\*\s*Math\.atan\(Math\.exp\(y\)\)/, '…and inverts it to get the latitude back');
  assert.match(cesium, /out\[r\]=n\+\(s-n\)\*\(r\+0\.5\)\/H/, 'a Cesium rectangle is geographic');
  assert.doesNotMatch(cesium.slice(cesium.indexOf('imageRowLatitudes'), cesium.indexOf('imageRowLatitudes') + 900),
    /Math\.log\(Math\.tan/, 'the geographic engine must NOT apply a Mercator transform');
  /* and it is reachable through the contract, not only on the adapter */
  assert.match(geoEngine, /imageRowLatitudes:\(c,h\)=>A\(\)\.imageRowLatitudes/, 'exposed on the MapLibre facade');
  assert.match(cesium, /imageRowLatitudes\(c,h\)\{ const v=V\(\)/, 'exposed on the Cesium facade');
});

test('R195 ②: the tsunami painter asks for the row map instead of assuming N−1−j', () => {
  assert.match(tsunami, /GE\(\)\.layers\.imageRowLatitudes\(c,/, 'the painter asks the engine');
  assert.match(tsunami, /const src=rowOf\[r\]\*N, dst=r\*N/, 'it paints the grid row that belongs at each image row');
  /* the old, wrong mapping must be gone from the draw path */
  assert.doesNotMatch(tsunami, /const src=j\*N, dst=\(N-1-j\)\*N/,
    'the latitude-indexed image row is what put the wave 8° from its epicentre');
  /* the canvas is sized from the row map, not pinned to the grid */
  assert.match(tsunami, /height:imgH/, 'the texture height comes from chooseImgH()');
  assert.match(tsunami, /Math\.min\(2048,Math\.ceil\(N\*worst\)\)/, 'and it is capped');
});

/* ── ③ one hit test per pointer move ─────────────────────────────────────────────────────────── */
test('R195 ③: the hover triad is dispatched by the engine, in one query', () => {
  assert.match(geoEngine, /_hoverHub\(\)/, 'the shared dispatcher exists');
  assert.match(geoEngine, /queryRenderedFeatures\(ev\.point,\{layers:ids\}\)/,
    'ONE query naming every registered layer — the whole point of the change');
  assert.match(geoEngine, /e==='mousemove'\|\|e==='mouseenter'\|\|e==='mouseleave'/,
    'onLayer routes the hover triad to the hub');
  /* enter carries features, leave does not — MapLibre's own delegation semantics */
  assert.match(geoEngine, /H\.emit\(id,'mouseleave',ev,null\)/, 'leave is emitted without features');
  assert.match(geoEngine, /H\.emit\(id,'mouseenter',ev,feats\)/, 'enter is emitted with them');
  /* re-wiring is keyed on the map instance, not a boolean (a re-created map must not lose the hub) */
  assert.match(geoEngine, /H\.wired===m/, 'the wiring is keyed on the map instance');
  /* clicks are deliberately left with the renderer */
  assert.doesNotMatch(geoEngine, /e==='click'[^\n]*_hoverHub/, 'click delegation is unchanged');
});

/* ── ④ the split, and the one value it cannot inherit ────────────────────────────────────────── */
test('R195 ④: the satellite protocol lives in js/sat-proto.js and nowhere else', () => {
  /* a needle from deep inside the moved body: a leftover copy in the shell would win silently */
  const needle = "const _satUrl=(z,y,x)=>_SAT_HOSTS[(x+y)&1]";
  assert.ok(satProto.includes(needle), 'js/sat-proto.js really carries the body');
  assert.ok(!appBody.includes(needle), 'js/app-body.js no longer carries a second copy');
  assert.match(appBody, /window\.IntMapModules\.satProto\(IM_HOST\)/, 'the shell calls the factory');
  assert.match(mainJs, /import '\.\.\/js\/sat-proto\.js';/, 'it is in the module graph');
  assert.match(mainJs, /'satProto',/, "…and in MODULE_FACTORIES, or __imModuleCheck stays silent about it");
  /* ⚠ the one free reference. Inheriting it would leave it undefined and stop @2x for everyone,
     with no error anywhere — the exact silent failure scripts/check-split-scope.mjs exists for. */
  assert.match(appBody, /get hiDPITiles\(\)\{ return _hiDPITiles; \}/, 'the shell hands the decision over');
  assert.match(satProto, /const _hiDPITiles=HOST\.hiDPITiles/, 'the module takes it rather than inheriting it');
  /* the flag the style below the call site reads is still set by the module */
  assert.match(satProto, /window\.__imSatProto=true/, 'the load-bearing flag moved with the body');
});

/* ── ⑤ boot: the 4.3 MB geometry is no longer what the first seconds pay for ──────────────────── */
test('R195 ⑤: the country table loads coarse-first and upgrades the geometry at idle', () => {
  assert.match(countries, /gj=await grab\('ne_110m_admin_0_countries\.geojson'\)/,
    'the rows come from the small file');
  assert.match(countries, /grab\('ne_10m_admin_0_countries\.geojson'\)[\s\S]{0,200}?if\(!\(hi&&hi\.features/,
    'the 10 m geometry still arrives');
  assert.match(countries, /requestIdleCallback\(run,\{timeout:6000\}\)/, 'and it waits for an idle main thread');
  /* ⚠ MERGE, DO NOT REPLACE: countryStats records are enriched in place by the PPP pass, the
     indicator gap-fill and the time machine. Handing each code a fresh object would drop all three. */
  assert.match(countries, /s\.area=Math\.round\(v\.area\); s\._area=v\.area;/, 'the upgrade merges');
  assert.doesNotMatch(countries, /best\.forEach\(\(v,code\)=>\{[\s\S]{0,300}?HOST\.countryStats\[code\]=\{/,
    'the upgrade must never replace a stats record wholesale');
});

/* ── ⑥ the local worker count is written down, not remembered ─────────────────────────────────── */
test('R195 ⑥: a local run does not need a flag nobody can remember', () => {
  const cfg = rd('playwright.config.js');
  assert.match(cfg, /Number\(process\.env\.PW_WORKERS \|\| 2\)/,
    'the local default is 2 workers — this machine produces contention failures above that');
  assert.doesNotMatch(cfg, /workers: isCI \? \([^)]*\) : undefined/, 'the old implicit default is gone');
});
