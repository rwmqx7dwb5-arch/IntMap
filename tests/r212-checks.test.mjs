/* R212 — source-level checks.
 *
 * Every assertion here is a RELATION, not a value (#R203's trap, six times over by #R211): "the
 * arrow layer reads its icon from the feature" rather than "the icon is called wp-arrow-X", "the
 * alpha IS the slider" rather than "the alpha is 0.45". The eclipse block is the exception and is
 * deliberately numeric — those numbers are the published catalogue, and matching them is the whole
 * claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── 1. the trade flow is an ARROW, and it points the way the goods move ───────────────────────── */
test('R212 ①: trade arcs carry direction — an icon layer along the line, and imports run partner→home', () => {
  const s = read('js/world-packs.js');
  /* ⚠⚠ (#R258) REPLACED, BY INSTRUCTION, NOT BY DRIFT. 「誰が線に複数矢印つけろって言ってんねん。」
     — #R212 read 「矢印にしろ」 as «put arrowheads on the line» and placed one every 110 px. The
     round that asked for it says that is not what it meant: the flow is ONE arrow. So the
     along-the-line repeater is gone and what this test pins is what makes the picture an arrow —
     a head at the destination, in the shaft's colour, with the shaft stopping at its base. */
  assert.doesNotMatch(s, /id:'wp-trade-arrow'/, 'the along-the-line repeater is back');
  /* ⚠ (#R261) the window was 400 chars and #R261's note about `icon-rotation-alignment:'viewport'`
     pushed `icon-anchor` past it. A character budget between two facts is a tripwire on COMMENTS,
     not on behaviour — it is the layer definition that has to be searched, so it is bounded by the
     next layer instead. */
  const tip = /id:'wp-trade-tip'[\s\S]*?\}\);/.exec(s);
  assert.ok(tip, 'the tip layer is defined');
  assert.match(tip[0], /'icon-anchor':'top'/,
    'the single head is anchored by its TIP, on the arc’s last vertex');
  assert.match(s, /'icon-image':\['get','ai'\]/, 'the icon comes from the feature, so both directions can coexist');
  /* the coordinate order IS the direction: exports leave home, imports arrive at it */
  assert.match(s, /dir==='X'\)\?greatCircle\(home,c,\d+\):greatCircle\(c,home,\d+\)/,
    'the arc is reversed for imports rather than the arrowheads being flipped separately');
});

/* ── 2. a panel closed is a layer off ─────────────────────────────────────────────────────────── */
test('R212 ②: every world-data panel drives its own layer row when it is closed', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /function makePanel\(id,title,cbId/, 'makePanel takes the row it belongs to');
  /* ⚠ (#R215) THE ✕ IS THE LEGEND'S OWN NOW. 「いや汎用の凡例の方に統合させろ。余計な例外作んなぼけ」 —
     the panel is no longer a window of this file's making, it IS `.data-legend.generic-legend`, whose
     ✕ was already wired to `dataset.cbId` in js/data-layers.js. The CLAIM is unchanged (closing the
     window turns the layer off); what changed is that there is one implementation of it instead of
     two, which is what the report asked for. So this asserts the binding, not the old markup. */
  assert.match(s, /_registerLayerOpacity\(LID,\s*names\(\),\s*layers\(\),\s*cbId\)/, 'the panel hands its row to the legend');
  assert.match(read('js/data-layers.js'), /el\.dataset\.cbId&&document\.getElementById\(el\.dataset\.cbId\)/,
    'and that legend’s ✕ unticks exactly that row');
  assert.match(s, /function uncheckRow\(cbId\)/, 'the row-unticking helper is still published for the families that need it');
  /* …and every panel actually passes one */
  const panels = [...s.matchAll(/makePanel\('([\w-]+)'\s*,[\s\S]{0,560}?\}\s*\)\s*;/g)].map((m) => m[0]);
  assert.ok(panels.length >= 5, 'all five families make a panel (found ' + panels.length + ')');
  for (const p of panels) assert.match(p, /'wp-dl-[a-z]+'/, 'this panel was created without a row id: ' + p.slice(0, 80));
});

/* ── 3. electricity and primary energy are ONE layer with a switch ─────────────────────────────── */
test('R212 ③: the energy mix is one row, and its legend is built from the paint ramp', () => {
  const s = read('js/world-packs.js');
  assert.ok(!/'wp-dl-elec'|'wp-dl-prim'/.test(s), 'the two separate rows are gone');
  assert.match(s, /\['energy','#[0-9a-f]{6}',v=>window\.__wpEnergy\.toggle\(v\)\]/, 'one row drives one toggle');
  /* the legend and the paint expression must come from the SAME array — one ramp, not two copies */
  assert.match(s, /const ENERGY_RAMP=\{/, 'the ramp is data at the factory top level (#R211)');
  assert.match(s, /ramp=\['interpolate',\['linear'\],\['to-number',\['feature-state',key\],-1\]\]\s*\n?\s*\.concat\(ENERGY_RAMP\[k\]/,
    'the paint expression is built FROM the ramp');
  assert.match(s, /rampLegend\(ENERGY_RAMP\[k\]\.map/, 'and so is the legend');
});

/* ── 4. the warnings layer never states a safety fact it does not have ─────────────────────────── */
test('R212 ④: "nothing in force" is only said when that feed actually answered', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /FEED_STATE/, 'each feed carries its own state');
  /* the sentence is gated on the state being ok — the GUARD is the property, not the exact
     wording of the sentence (#R273 rewrote the sentence and the branch shape stayed) */
  const okBranch = /st==='ok'\)[\s\S]{0,200}Nothing in force right now/.test(s);
  assert.ok(okBranch, 'the reassuring sentence is behind an ok check');
  /* ⚠⚠ (#R273) GDACS IS GONE — 「GDACSを完全に撤廃しろ」. What #R212 was about survives and is
     STRONGER: a country this app has no feed for must not look like a country with nothing in
     force. It used to be covered by an event feed presented beside national warnings; it is a
     HATCH and a sentence now, which is the same claim made honestly. */
  assert.ok(!/loadGDACS|gdacsapi/.test(s), 'GDACS must be gone, not re-added');
  assert.match(s, /No feed connected/, 'a country with no feed says so in words');
  assert.match(s, /wp-alert-hatch/, '…and is hatched on the map rather than left blank');
  /* ⚠ and Japan is drawn at the unit the JMA issues at. #R212's point was that a geometry which
     cannot be had is an ERROR rather than an empty map, and that is what is asserted. */
  assert.match(s, /japan-topography[\s\S]{0,200}N03/, 'the municipality geometry is the MLIT boundary set');
  assert.match(s, /throw new Error\('jma: no issuing-unit geometry could be read'\)/,
    'a geometry that cannot be had is an error, not an empty map');
});

/* ── 5. crops are a crop raster, not a country choropleth ──────────────────────────────────────── */
test('R212 ⑤: the crop layer draws FAO GAEZ cells, and its scale does not move when you pan', () => {
  const s = read('js/world-packs.js');
  assert.ok(!/wpCrop'|'wp-crop-fill'/.test(s), 'the per-country fill is gone');
  assert.match(s, /gaez-services\.fao\.org\/server\/rest\/services\/res06\/ImageServer/, 'GAEZ res06');
  assert.match(s, /computeStatisticsHistograms/, 'the stretch uses the raster’s own measured range');
  assert.match(s, /DRA:false/, 'and NOT a per-view dynamic range — the same colour must mean the same number');
  assert.match(s, /\/identify\?/, 'a tap asks the server for the value in that cell');
});

/* ── 6. the eclipse arithmetic, against the published catalogue ────────────────────────────────── */
test('R212 ⑥: lunar and solar eclipses come out where — and what — the catalogue says', async () => {
  const win = {};
  const ephem = read('js/ephemeris.js');
  const events = read('js/space-events.js');
  // eslint-disable-next-line no-new-func
  new Function('window', ephem + '\n;return window.IntMapEphemeris;')(win);
  win.IntMapEphemeris = new Function('window', ephem + '\n;return window.IntMapEphemeris;')(win);
  const SE = new Function('window', events + '\n;return window.IntMapSpaceEvents;')(win);

  const lunar = SE.eclipses(Date.UTC(2023, 8, 1), 1200, false);
  const byDate = (list) => Object.fromEntries(list.map((x) => [new Date(x.ms).toISOString().slice(0, 10), x]));
  const L = byDate(lunar);
  /* dates first — a wrong date is a wrong search, not a wrong classification */
  for (const d of ['2023-10-28', '2024-03-25', '2024-09-18', '2025-03-14', '2025-09-07', '2026-03-03', '2026-08-28'])
    assert.ok(L[d], 'no lunar eclipse found on ' + d);
  /* …then the magnitudes. Published umbral magnitudes: 0.122, −0.13 (penumbral), 0.085, 1.178, 0.9297 */
  const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, what + ': ' + a.toFixed(3) + ' vs ' + b);
  near(L['2023-10-28'].umbraMag, 0.122, 0.03, '2023-10-28 umbral magnitude');
  near(L['2024-09-18'].umbraMag, 0.085, 0.03, '2024-09-18 umbral magnitude');
  near(L['2025-03-14'].umbraMag, 1.178, 0.03, '2025-03-14 umbral magnitude');
  near(L['2026-08-28'].umbraMag, 0.9297, 0.03, '2026-08-28 umbral magnitude');
  assert.equal(L['2024-03-25'].kind, 'penumbral');
  assert.equal(L['2025-03-14'].kind, 'total');
  assert.equal(L['2026-08-28'].kind, 'partial');

  const S = byDate(SE.eclipses(Date.UTC(2023, 8, 1), 1200, true));
  assert.equal(S['2024-04-08'] && S['2024-04-08'].kind, 'total', '2024-04-08 is the North American total');
  assert.equal(S['2023-10-14'] && S['2023-10-14'].kind, 'annular');
  assert.equal(S['2026-02-17'] && S['2026-02-17'].kind, 'annular');
  assert.equal(S['2026-08-12'] && S['2026-08-12'].kind, 'total');
  near(S['2026-08-12'].gamma, 0.898, 0.02, '2026-08-12 gamma');

  /* the shadow radii are Meeus's, and the coefficient is the one that reproduces all of the above */
  assert.match(events, /0\.998340\*par/, 'the umbra/penumbra coefficient is 0.998340 (1.29 gave every eclipse as total)');
});

/* ── 7. one border line, three layers ──────────────────────────────────────────────────────────── */
test('R212 ⑦: today’s borders, provinces and historical borders read one style module', () => {
  const bs = read('js/border-style.js');
  assert.match(bs, /export const BORDER_COLOR/);
  assert.match(bs, /export const BORDER_WIDTH/);
  const app = read('js/app-body.js');
  assert.match(app, /import \{ BORDER_COLOR, ADMIN1_COLOR, BORDER_WIDTH, BORDER_CASING, ADMIN1_WIDTH \} from '\.\/border-style\.js'/);
  assert.match(app, /'line-color':BORDER_COLOR,[^}]*'line-width':BORDER_WIDTH/, 'the national border uses them');
  assert.match(app, /'line-color':ADMIN1_COLOR,[^}]*'line-width':ADMIN1_WIDTH/, 'and so does the province line');
  const tb = read('js/time-borders.js');
  assert.match(tb, /_BS\.color\|\|/, 'the historical border reads the same module');
  assert.match(tb, /_BS\.width\|\|/);
  /* the fallback literals must BE the module's values, or the two disagree the moment one changes */
  const col = /export const BORDER_COLOR = '(#[0-9a-f]{6})'/.exec(bs)[1];
  assert.ok(tb.includes("_BS.color||'" + col + "'"), 'the historical fallback colour is the module’s own');
});

/* ── 8. the shadow slider is the shadow's alpha ────────────────────────────────────────────────── */
test('R212 ⑧: 100 % shadow is opaque — the alpha is baked, not scaled down', () => {
  const s = read('js/insolation.js');
  assert.match(s, /const a=Math\.round\(255\*Math\.max\(0\.05,Math\.min\(1,_shadowOp\)\)\)/,
    'the PNG alpha IS the requested opacity');
  assert.ok(!/_shadowOp\/0\.30/.test(s), 'the old "scale down from 0.30" mapping is gone');
  assert.match(s, /function setShadowOpacity\(v\)\{[\s\S]{0,220}paint\(_last\.g,_last\.mask\)/,
    'moving the slider re-bakes the last mask rather than recomputing the analysis');
  const sims = read('js/sims.js');
  assert.match(sims, /Math\.max\(0\.05,Math\.min\(1,\+v\|\|0\.30\)\)/, 'the panel’s own ceiling is 1, not 0.95');
  assert.match(sims, /class="sun-op" min="5" max="100"/, 'and the slider can reach it');
  assert.ok(!/background:var\(--popup-bg,#141414\)/.test(sims), 'the panels are opaque (--card-bg), not see-through');
});

/* ── 9. the earthquake panel: one epicentre control, and land below sea level is land ───────────── */
test('R212 ⑨: one epicenter control, and sub-sea-level LAND is painted', () => {
  const s = read('js/seismic.js');
  assert.ok(!/class="sq-pick"/.test(s), 'the separate "place the epicenter" button is gone');
  assert.ok(!/const PICKBTN=/.test(s), 'and so is the style that only it used');
  /* ⚠ (#R218) the segment gained an OFF state — 「もう一度クリックしたら選択解除されるように」 — so the
     handler is now a toggle. The claim this line makes is unchanged and still checked: pressing it ON
     both sets the click mode AND arms the pick, in that order, from the one control. */
  assert.match(s.replace(/\/\*[\s\S]*?\*\//g, ''), /\.sq-cm-epi'\)[\s\S]{0,400}setClickMode\('epi'\);\s*startPick\(\)/,
    'the one segment both sets the click mode and arms the pick');
  assert.match(s, /if\(clickMode==='epi'\) setClickMode\('none'\)/, '…and a second press turns it off');
  /* the land test is the MASK plus a depth bound, not the sign of the elevation */
  /* (#R215) same claim, finer answer — see js/coast-mask.js and tests/r215 ②b */
  assert.match(s, /landAt\(k,lo,la\)===true&&e0>-440/,
    'a cell below zero is land when the land answer says so and it is above the lowest dry land on Earth');
  /* a drawn rupture defines the source but does not start the solve */
  assert.match(s, /function _fCapture[\s\S]{0,400}render\(\); touch\(\); return true;/,
    'capturing the rupture marks the field stale — the ▶ button runs it');
});

/* ── 10. the tsunami takes the drawn rupture ───────────────────────────────────────────────────── */
test('R212 ⑩: a free-drawn rupture reaches the tsunami model and defines its fault plane', () => {
  const sq = read('js/seismic.js');
  assert.match(sq, /T\.follow\(\{[^}]*rupture:/, 'the seismic panel pushes the ring next door');
  const ts = read('js/tsunami.js');
  assert.match(ts, /const rupKey=/, 'the rupture is part of the source identity');
  assert.match(ts, /srcKey=\(\)=>[^;]*rupKey\(rupture\)/, 'so redrawing it is not mistaken for the same event');
  const w = read('src/tsunami-worker.js');
  assert.match(w, /function rupturePlane\(/);
  assert.match(w, /const drawn = rupturePlane\(m\.src\.rupture, srcLat\)/);
  assert.match(w, /const strike = drawn \? drawn\.strike/, 'the strike comes from the drawing when there is one');
  assert.match(w, /MU \* L \* W \* slip/, 'and the moment is μ·A·D̄, the same one the panel reports');
});

/* ── 11. wide 3-D bodies follow the curvature ──────────────────────────────────────────────────── */
test('R212 ⑪: a solid’s outline is densified and its caps are subdivided with one count', () => {
  const s = read('js/solid3d.js');
  assert.match(s, /const SEG_KM=\d+, MAX_N=\d+/);
  assert.match(s, /function densify/, 'the outline gains points so the walls curve');
  assert.match(s, /capN=Math\.max\(capN,Math\.min\(MAX_N/, 'ONE subdivision count for the whole mesh…');
  assert.match(s, /const u=\(capN-i\)\/capN, v=\(i-j\)\/capN, w=j\/capN/, '…applied barycentrically (no T-junctions)');
});

/* ── 12. the news says where a story came FROM, or says it does not know ───────────────────────── */
/* ⚠⚠ (#R416) THIS TEST'S FIRST HALF GUARDED A MECHANISM THAT NO LONGER EXISTS — the same shape
   #R276 found in ⑬ below. #R212 answered 「ニュースの発信地が全然発信地の場所になっていない」 by
   forbidding the publisher branch from borrowing the subject's coordinates. #R416 removed that
   branch, and the toggle above it, because in the surface that is now the DEFAULT it did something
   worse than borrowing: an 出来事 has no publisher location at all, so pressing it scattered 200 of
   200 events to invented coordinates (measured — DEV-NOTES #R416).
   ⚠ THE INVARIANT IS KEPT, FROM THE OTHER SIDE. What #R212 protected is that a pin never claims an
   origin it does not have; with only one placement left, the way to break that promise again is to
   bring the branch back — so this asserts it is ABSENT. The rest of the test, which is about
   resolving an outlet from its URL, is untouched and still runs.
   ⚠ The needle is code-shaped for the same reason tests/r416-checks ⑤ is: this comment names the
   removed mechanism, and a test that banned the WORD would fail on its own prose. */
test('R212 ⑫: a news pin never claims an origin it does not have', () => {
  const app = read('js/app-body.js');
  assert.ok(!/if\(newsPinMode==='publisher'\)\{/.test(app),
    'the publisher pin branch must stay removed — it placed events at invented coordinates (#R416)');
  assert.match(app, /function applyPinMode\(a\)\{/, 'the one placement rule is still here');
  const ctx = read('js/news-context.js');
  assert.match(ctx, /function matchPublisher\(publisher,link\)/, 'the outlet can be resolved from its URL too');
  assert.match(ctx, /_hostKey\(publisher\), _hostKey\(link\)/, 'both the publisher string and the link are tried');
  assert.match(ctx, /label:publisher, place:/, 'a place-name match labels the pin with the OUTLET, not the city');
});

/* ── 13. no request waits forever ──────────────────────────────────────────────────────────────── */
test('R212 ⑬: the news proxies and the wind grid both carry a deadline', () => {
  const pf = read('js/proxy-fetch.js');
  assert.match(pf, /const PROXY_TIMEOUT_MS = \d+/);
  /* (#R446) each racer still has its own clock; it may simply no longer outlast the budget the
     CALLER named — without the clamp a 3 s budget would still sit through an 8 s attempt. */
  assert.match(pf, /fetchDeadline\(make\(url\), Math\.min\(PROXY_TIMEOUT_MS, left\(\)\), ctls\[i\]\)/, 'each racer has its own clock');
  assert.match(pf, /ctls\.forEach\(\(c\) => \{ try \{ c\.abort\(\)/, 'and the losers are aborted when one wins');
  assert.match(read('js/app-body.js'), /import \{ fetchViaProxy \} from '\.\/proxy-fetch\.js'/, 'and the core just imports it');
  /* ⚠⚠ (#R276) THE SECOND HALF OF THIS TEST GUARDED A MECHANISM THAT NO LONGER EXISTS, AND THE
     PROPERTY IT WAS FOR IS NOW SATISFIED MORE STRONGLY. #R212's report was 「Wind(animated)が表示
     されるまでが非常に遅い」, and its answer was a deadline on each of the five chunked Open-Meteo
     point requests the wind field was assembled from. #R276 removed the requests: the field is the
     ECMWF IFS `.om` file, read once through the Open-Meteo SDK (which carries its own
     AbortController) after ONE metadata fetch through the guarded client. So the check is that the
     wind layer asks for no per-point weather at all — a stronger statement than 「each of its many
     requests has a clock」, and one that cannot be satisfied by re-adding the grid. */
  const w = read('js/weather.js') + read('js/wx-ecmwf.js') + read('js/wx-wind.js');
  assert.doesNotMatch(w, /api\.open-meteo\.com\/v1\/forecast/,
    'the wind field must not be built from point-forecast requests');
  assert.doesNotMatch(w, /latitude='\+lats\.join|latitude='\+las\.join/,
    '…and certainly not from a joined list of coordinates');
  assert.match(read('js/wx-ecmwf.js'), /window\.IntMapWx && window\.IntMapWx\.guardedJSON/,
    'the one metadata fetch goes through the guarded client, which is where the deadline and the breaker live');
});

/* ── 14. the sources page is the registry, not a copy of it ────────────────────────────────────── */
test('R212 ⑭: sources.html renders js/reference-data.js and ships with the build', () => {
  const html = read('sources.html');
  assert.match(html, /<script src="\.\/js\/reference-data\.js"><\/script>/);
  /* ⚠ (#R218) the renderer moved out of the page into js/sources-list.js — the page is a shell now.
     The invariant is unchanged and is the whole point of this test: ONE list, read, never copied. */
  const list = read('js/sources-list.js');
  assert.match(list, /window\.IntMapRefData && window\.IntMapRefData\.dataSources/);
  assert.ok(!/dataSources\s*=\s*\[/.test(html + list), 'the page must not carry its own copy of the list');
  const vite = read('vite.config.js');
  assert.match(vite, /'sources\.html'/);
  assert.match(vite, /'js\/reference-data\.js'/, 'the registry is copied so the page can read it in production');
  assert.match(vite, /'js\/sources-list\.js'/, '…and so is the renderer it moved into');
});

/* ── 15. the spelling landmines are still intact (#R210 §10, #R211 §7) ─────────────────────────── */
test('R212 ⑮: the four data contracts that look like British spellings are untouched', () => {
  assert.match(read('js/place-labels.js'), /'theatre'/, "OpenMapTiles' class value");
  /* (#R224) the ocean-current row that carried this property moved out of js/data-layers.js when the
     two layers became one; the spelling landmine it guards is the SAME one, in the file that kept it. */
  assert.match(read('js/ocean-currents.js'), /colour|'col'/, 'the ocean-currents property name');
  assert.match(read('js/atlas-sources.js'), /landuse"="harbour/, 'the OSM tag value in the Overpass query');
  assert.match(read('js/routing.js'), /'cancelled'/, "js/routing.js's internal status");
});
