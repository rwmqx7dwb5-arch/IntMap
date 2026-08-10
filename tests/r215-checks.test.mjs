/* ============================================================================
 *  R215 — Node checks: one window per layer, the coast at the field's own grain,
 *         great-circle solids, the Wikidata split, and a ★ card that cannot throw
 * ----------------------------------------------------------------------------
 *  ⚠ #R203's trap, restated: DO NOT pin the previous round's VALUES. Each check below is either an
 *  IDENTITY (true for every input) or a CLAIM the code makes about itself — never a constant that a
 *  later round could legitimately change while keeping every promise.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══ ① ONE WINDOW PER LAYER — THE WORLD-DATA FAMILIES RENDER INTO THE GENERIC LEGEND ═════════
   「いや汎油の凡例の方に統合させろ。余計な例外作んなぼけ」 — the failure this guards is a SECOND
   floating box appearing beside the app's own legend, which is what the report was about. */
test('R215 ①a: the world-data panel is the generic legend, not a window of its own', () => {
  const wp = read('js/world-packs.js');
  /* it must go through the app's own legend machinery… */
  assert.match(wp, /_registerLayerOpacity/, 'the panel registers through the standard legend/opacity path');
  assert.match(wp, /_hideGenericLegend/, 'closing the layer hides that same legend');
  /* …and must NOT build its own positioned container any more */
  assert.equal(/position:fixed;left:16px;top:96px/.test(wp), false,
    'no hand-positioned floating panel is created — the legend owns its own position (tileLegends)');
  assert.match(wp, /className='wp-body'/, 'the family renders into a .wp-body inside the legend');
  assert.match(read('css/intmap.css'), /\.data-legend \.wp-body/, '…and that body is styled as part of the legend');
});

test('R215 ①b: every world-data family names the legend it renders into', () => {
  const wp = read('js/world-packs.js');
  const iw = read('js/industry-web.js');
  const ids = [...(wp + iw).matchAll(/legendId:\s*'([a-z0-9]+)'/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'two families sharing one legend id would overwrite each other');
  assert.ok(ids.length >= 6, `all six families declare a legend id (found ${ids.length}: ${ids})`);
  /* and each declares the layers that legend's opacity slider drives, or the slider drives nothing */
  const layerThunks = [...(wp + iw).matchAll(/layers:\s*\(\)\s*=>/g)].length;
  assert.equal(layerThunks, ids.length, 'every legendId comes with the layer ids it owns');
});

test('R215 ①c: the crop panel does not offer the 10 m land cover', () => {
  const wp = read('js/world-packs.js');
  assert.equal(/wp-c-lc/.test(wp), false, '「いやなんでここに10m被覆載せるんだよ。別物やろが」');
  assert.equal(/eco-dl-worldcover/.test(wp), false, 'and it does not reach for that checkbox either');
});

test('R215 ①d: Settings offers the data-sources PAGE and does not offer a second, lesser copy', () => {
  const html = read('index.html');
  assert.match(html, /id="link-sources"[^>]*href="\.\/sources\.html"/, 'the entry is the page');
  assert.equal(/id="btn-data-sources"/.test(html), false, '「アプリ内で簡易一覧を見る←ふざけんじゃねえよ」');
});

/* ═══ ② THE COASTLINE IS DECIDED AT THE CALLER'S RESOLUTION ══════════════════════════════════
   「海抜0m以下の土地は…（なんか、海外線の境界部分が雑な処理になっている。大きなタイルでごまかすな。）」*/
test('R215 ②a: a fine coast mask exists, is loaded, and holds no geometry of its own', () => {
  assert.ok(existsSync(join(ROOT, 'js/coast-mask.js')), 'js/coast-mask.js exists');
  const cm = read('js/coast-mask.js');
  assert.match(read('src/main.js'), /coast-mask\.js/, 'it is imported by the bundle');
  assert.match(cm, /window\.countryGeo/, 'it reads the app’s own country outline rather than fetching a second one');
  assert.match(cm, /rasterize/, 'it answers a GRID, which is the whole point of it');
  /* it must not become a second land/sea authority: the bundled point mask is still the fallback */
  assert.match(cm, /IntMapLandMask/, 'the 19.5 km bundled mask remains the fallback, not a rival');
});

test('R215 ②b: the seismic fine field decides land through the grid answer, not through the 19.5 km mask', () => {
  const s = read('js/seismic.js');
  const i = s.indexOf('const landAt=');
  assert.ok(i > 0, 'the field has one land predicate');
  /* the below-sea-level branch — the one the report is about — must go through it */
  const below = s.slice(s.indexOf('else if(e0<=0){'), s.indexOf('else if(e0<=0){') + 260);
  assert.match(below, /landAt\(/, 'a cell below zero asks the fine answer');
  assert.equal(/landMask&&landMask\.isLand\(lo,la\)===true/.test(below), false,
    'it no longer reads the 19.5 km majority raster directly');
  assert.match(s, /coastSource:\s*coastSrc/, 'and the field DECLARES which coastline answered (#R185: no silent caps)');
});

/* ═══ ③ A SOLID FOLLOWS THE GREAT CIRCLE ═════════════════════════════════════════════════════
   「3D立体は…単なる多角形ではなく、地球の曲がりに沿ったものにして。（追記：いやなんで大圏考慮して
   ないねんくそが。）」 — the identity: a densified edge's midpoint is ON the great circle, which for a
   pair of points on the equator/meridian has an answer nobody has to trust the implementation for. */
function densifier() {
  const src = read('js/volume3d.js');
  const a = src.indexOf('const _D=Math.PI/180;');
  const b = src.indexOf('function closedRing()');
  assert.ok(a > 0 && b > a, 'the great-circle helpers are where this test expects them');
  const win = {};
  new Function('out', src.slice(a, b) + '\nout.gcPoints=gcPoints; out.densify=densify;')(win);
  return win;
}

test('R215 ③a: a densified edge lies on the great circle between its ends', () => {
  const { densify } = densifier();
  /* along a meridian the great circle IS the meridian: every inserted point keeps the longitude */
  const merid = densify([[10, 0], [10, 60]]);
  assert.ok(merid.length > 2, 'a 6,600 km edge is subdivided');
  merid.forEach((p) => assert.ok(Math.abs(p[0] - 10) < 1e-9, 'a meridian stays at its longitude'));
  /* along the equator the great circle IS the equator */
  const eq = densify([[0, 0], [80, 0]]);
  eq.forEach((p) => assert.ok(Math.abs(p[1]) < 1e-9, 'the equator stays at latitude 0'));
  /* and OFF those two special cases the inserted point is NOT the straight-line midpoint — which is
     the entire defect being fixed. Tokyo → Los Angeles: the great circle passes far north of it. */
  const tk = [139.69, 35.69], la = [-118.24, 34.05];
  const mid = densify([tk, la]);
  const half = mid[Math.floor(mid.length / 2)];
  assert.ok(half[1] > 45, `the great circle bulges north (got ${half[1].toFixed(1)}°, the chord midpoint is ~35°)`);
});

test('R215 ③b: densifying preserves the ends, the winding and the closure', () => {
  const { densify } = densifier();
  const ring = [[0, 0], [40, 0], [40, 30], [0, 30], [0, 0]];
  const d = densify(ring);
  assert.deepEqual(d[0], [0, 0], 'the first vertex is the first clicked vertex');
  assert.equal(d[d.length - 1][0], 0, 'and the ring still closes on it');
  assert.equal(d[d.length - 1][1], 0);
  /* no jump longer than 180° anywhere — the unwrap rule, which is what stops a body being drawn
     the long way round the world */
  for (let i = 1; i < d.length; i++) assert.ok(Math.abs(d[i][0] - d[i - 1][0]) <= 180, 'longitudes are unwrapped');
});

/* ═══ ④ THE INDUSTRY WEB'S QUERIES ═══════════════════════════════════════════════════════════
   「Wikidata に接続できませんでした：クエリが25秒を超えました。何も描いていません。…←は？」 */
test('R215 ④a: the node query carries no ownership join, and the edges are VALUES-bound', () => {
  const iw = read('js/industry-web.js');
  const nodes = iw.slice(iw.indexOf('function sparqlNodes'), iw.indexOf('    /* `prop` runs owner'));
  assert.equal(/P749|P127|P355|GROUP_CONCAT/.test(nodes), false,
    'the ownership OPTIONAL is what made the node query a coin toss — it is not in it');
  const owners = iw.slice(iw.indexOf('function sparqlOwners'), iw.indexOf('const EDGE_PROPS'));
  assert.match(owners, /VALUES \?c/, 'the edges are bound by ids already known — the same lesson as the money queries');
  assert.equal(/UNION/.test(owners), false, 'one property per query, never a UNION (#R213 measured 65.6 s for that)');
});

test('R215 ④b: the secondary queries are rate-limited and each failure is its own sentence', () => {
  const iw = read('js/industry-web.js');
  assert.match(iw, /lane\(moneyJobs\.concat\(edgeJobs\),\s*2\)/, 'they run two at a time, not six at once');
  assert.match(iw, /edgeErr/, 'a refused ownership query is reported as a failure, not as "owns nobody"');
  assert.match(iw, /moneyErr/, '…and so is a refused money query (#R213)');
  /* the deadline must be a genuine "something is wrong" bound, not one the normal case has to beat */
  const to = /}, (\d+)\);\s*$/m.exec(iw.slice(iw.indexOf('const to = setTimeout'), iw.indexOf('const to = setTimeout') + 200));
  assert.ok(to && +to[1] >= 30000, `the deadline is above the measured worst case (got ${to && to[1]})`);
});

/* ═══ ⑤ THE DAY/NIGHT SWITCH REACHES WHATEVER IS DRAWING ═════════════════════════════════════
   「設定から、昼夜を表示するのをオフに…（追記：オフにしてもオフにならない。MapLibre。）」 */
test('R215 ⑤: with the day/night display off, the Sun is not aimed on ANY engine', () => {
  const ts = read('js/theme-sky.js');
  const aim = ts.slice(ts.indexOf('function _aimSun()'), ts.indexOf('function _aimSun()') + 420);
  assert.match(aim, /_nightSideOff\(\)/, 'the switch is read before the Sun is aimed, not after (#R214)');
  assert.match(aim, /setSunDirection\(null\)/, 'off means the light stops following the Sun');
  assert.equal(/_rendererLightsTheGlobe/.test(aim), false,
    'no engine is excused — maplibre-gl’s own atmosphere pass reads style.light for u_sun_pos');
  /* and the sky must stop reporting which side is night, or the terminator is still on screen */
  const elev = ts.slice(ts.indexOf('function _sunElevAtCentre()'), ts.indexOf('function _sunElevAtCentre()') + 200);
  assert.match(elev, /_nightSideOff\(\)/, 'horizon-color and sky-color fall back to their day values');
});

/* ═══ ⑥ A SAVED ★ CARD CANNOT TAKE THE LIST DOWN WITH IT ═════════════════════════════════════
   「★保存…（追記：いやその時は保存されるけど数日後とかには消えるって話だわボケ）」 */
test('R215 ⑥: a snapshot always carries an analysis object, and the renderer does not assume', () => {
  const nu = read('js/news-ui.js');
  assert.match(nu, /function snapAnalysis/, 'there is one place that shapes a snapshot’s analysis');
  const code = nu.replace(/\/\*[\s\S]*?\*\//g, '');   /* the prose still NAMES the old shape, on purpose */
  assert.equal(/analysis:\s*null/.test(code), false, 'nothing writes a null analysis any more — that is what threw');
  /* merge() must normalise records written by an OLDER build, or the fix never reaches existing stars */
  const merge = nu.slice(nu.indexOf('merge(feed,links)'), nu.indexOf('merge(feed,links)') + 700);
  assert.match(merge, /snapAnalysis/, 'records already on disk are normalised on the way out');
  const batch = nu.slice(nu.indexOf('function appendNewsBatch'), nu.indexOf('function appendNewsBatch') + 900);
  assert.match(batch, /if\(!item\.analysis\|\|typeof item\.analysis!=='object'\)/,
    'and the card renderer guards, because one throw inside forEach ends the whole batch');
});

/* ═══ ⑦ THE DATA-SOURCES PAGE IS FOR A READER ════════════════════════════════════════════════
   「いや私向けに作ってんじゃねーよ。サイトに開発者向けのページおくわけないやろがくそ。作り直せ。」 */
test('R215 ⑦: sources.html explains the data, not the build', () => {
  const src = read('sources.html');
  const body = src.slice(src.indexOf('<body>'), src.indexOf('<script'));
  assert.equal(/reference-data\.js/.test(body), false, 'no source filename is shown to a reader');
  assert.equal(/登録簿/.test(body), false, 'no internal vocabulary for the list');
  assert.equal(/二重に持たない|single source of truth/.test(body), false, 'no maintenance argument');
  /* and it still answers the four questions a reader actually has */
  for (const id of ['what', 'live', 'privacy', 'licence', 'limits', 'list']) {
    assert.match(body, new RegExp(`id="${id}"`), `the page keeps its «${id}» section`);
  }
  assert.match(body, /science\.html/, 'and still points at the method page for how things are computed');
});

/* ═══ ⑧ THE TIDE LAYER IS A LAYER ════════════════════════════════════════════════════════════
   「（追記：いやさぼってんじゃねーよ。指示通り作れ）」 */
test('R215 ⑧: switching tides on opens its window and awaits the mask it samples', () => {
  const wp = read('js/world-packs.js');
  const scan = wp.slice(wp.indexOf('function scanCoast()'), wp.indexOf('function overview(failed)'));
  assert.match(scan, /LM\.warm\(\)\s*:\s*null/, 'the land mask is AWAITED — firing warm() and reading ready() is the bug');
  assert.match(scan, /\.then\(\(\)=>scanNow/, '…and the sampling happens after it resolves');
  assert.match(scan, /rearm/, 'a scan that answered nothing does not latch the view against a retry');
  /* ⚠ matched with a regex rather than by slicing between two literal strings: this working copy is
     checked out with CRLF on Windows and committed with LF, so a search key containing "\n" finds
     nothing after a branch switch and the slice silently becomes the whole file. Same class of trap
     as #R203's pinned literals — the assertion has to survive things that are not the subject. */
  const toggle = /function toggle\(v\)\{ on=v;[\s\S]{0,600}?clearFlood\(\);[\s\S]{0,600}?whenDrawable\(/.exec(wp);
  assert.ok(toggle, 'the tide toggle is where this test expects it');
  assert.match(toggle[0], /overview\(\)/, 'the window opens with the layer rather than on a tap');
  assert.match(toggle[0], /scanning=true/, '…and says it is scanning until the mask has answered');
});

/* ═══ ⑨ THE TRADE LAYER PAINTS THE COUNTRIES ═════════════════════════════════════════════════
   「貿易レイヤーは該当国がぬられるように」 */
test('R215 ⑨: trade shades the countries on the app’s own country source', () => {
  const wp = read('js/world-packs.js');
  const i = wp.indexOf("const CHORO='wp-trade-fill'");
  assert.ok(i > 0, 'there is a trade choropleth');
  const blk = wp.slice(i, i + 1400);
  assert.match(blk, /source:'countries'/, 'on the SAME country geometry every other layer uses (「いつもの国境線」)');
  assert.match(blk, /feature-state','wpTrade'/, 'driven by feature-state, so it repaints without rebuilding geometry');
  assert.match(blk, /wpTradeH/, 'and the selected country reads as itself, not as its own partner');
  assert.match(wp, /hiResCountries\(\)/, 'and it asks for the 10 m outline rather than drawing the 110 m boot copy');
});
