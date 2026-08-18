/* ============================================================================
 *  R188 — source-level checks (no browser)
 * ----------------------------------------------------------------------------
 *  Six instructions, every one of them a re-report. What each of these guards is
 *  the MEASUREMENT that finally named the cause, so a later tidy-up cannot quietly
 *  put the same defect back.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/* ── 1. live aircraft: a triangular covering, a bigger budget, the SAME pace ─────────────────── */
test('R188 aircraft: the lattice is triangular, so each request covers 1.36× the sky', () => {
  const src = read('js/data-layers.js');
  /* The optimal covering of a plane by equal circles: neighbours at r√3, rows at that × √3/2.
     #R186/#R187 stepped by the inscribed SQUARE (r√2), which keeps 2r² of a circle's πr². */
  assert.match(src, /const stepKm=rKm\*Math\.sqrt\(3\)\*PLANE_LATTICE_MARGIN;/,
    'centres must be spaced r√3 — the covering lattice, not the inscribed square');
  assert.match(src, /const rowKm=stepKm\*Math\.sqrt\(3\)\/2;/, 'rows at √3/2 of the step');
  assert.match(src, /const off=\(j&1\)\?dLng\/2:0;/, 'alternate rows offset by half a step');
  assert.ok(!/Math\.SQRT2\*0\.94/.test(src), 'the inscribed-square step must be gone');

  /* the area arithmetic the round claims, checked rather than asserted in a comment */
  const r = 250 * 1.852, margin = 0.96;
  const step = r * Math.sqrt(3) * margin, row = step * Math.sqrt(3) / 2;
  const hex = step * row, square = Math.pow(r * Math.SQRT2 * 0.94, 2);
  assert.ok(hex / square > 1.3, `covering gain ${(hex / square).toFixed(2)}× should be ~1.36`);

  /* ⚠ the pace is a MEASUREMENT and must not move: 34 circles at 1,200 ms all answered 200, the
     same 34 at 700 ms gave 12 successes and then 16 consecutive hard failures. */
  assert.match(src, /const PLANE_GAP_MS=1200;/, 'the measured spacing is 1.2 s and is unchanged');
  assert.match(src, /const PLANE_CIRCLE_NM=250;/, 'r=250 is the API maximum (300/500 answer 403)');
  assert.match(src, /PLANE_CIRCLE_BUDGET=\(\)=>\(\(typeof isMobile==='function'&&isMobile\(\)\)\?24:128\)/,
    'the budget is 128 circles (mobile 24)');
  /* the long-run rate is 3.5 s a circle whatever the budget — so the ceiling has to clear it */
  const poll = /return Math\.max\(20000,Math\.min\((\d+),Math\.round\(n\*3500\)\)\);/.exec(src);
  assert.ok(poll, 'planePollMs must keep the 3.5 s-a-circle rule');
  assert.ok(+poll[1] >= 128 * 3500,
    `poll ceiling ${poll[1]} ms clips a 128-circle sweep (${128 * 3500} ms) — that would ask FASTER than measured`);
});

test('R188 aircraft: a 154-second sweep publishes as it goes, centre first', () => {
  const src = read('js/data-layers.js');
  assert.match(src, /const PLANE_PUBLISH_MS=4000;/, 'the sweep publishes every few seconds');
  /* ⚠ (#R245) …and the FIRST success publishes without waiting for that interval — `lastPub` starts
     at the sweep's own start, so the centre circle's aircraft used to sit in `byHex` for four
     seconds with nothing on screen (「表示されるまでが遅い」). The cadence after it is unchanged. */
  assert.match(src, /if\(ok>0&&\(published===0 \? circles\.length>1 : Date\.now\(\)-lastPub>=PLANE_PUBLISH_MS\)\) publish\(false\);/,
    '…from inside the circle loop, first success immediately, then every PLANE_PUBLISH_MS');
  /* a carried-over aircraft is dropped only once the sweep has RE-ASKED about its patch of sky */
  assert.match(src, /function planeCellOf\(lat,lng\)\{/, 'the lattice must answer "which cell is this"');
  assert.match(src, /if\(cell!=null&&swept\.has\(cell\)\) continue;/,
    'carry-over must be resolved by "was this cell asked?", not by age alone');
  /* …and the cell key travels with the circle, because rows beyond ±88° are skipped */
  assert.match(src, /out\.push\(\[Math\.max\(-89\.9,Math\.min\(89\.9,lat\)\),lng,j\*nx\+i\]\);/,
    'each circle carries its cell key');
  /* centre-out order: measured row-major, the first four circles landed in the mid-Atlantic */
  assert.match(src, /out\.sort\(\(a,b\)=>\{/, 'circles must be ordered by distance from the view centre');
  /* a sweep the camera has left behind is abandoned — safe only because it already published */
  assert.match(src, /if\(Math\.abs\(dLng\)<cv\.coverKmX\/2&&Math\.abs\(dLat\)<cv\.coverKmY\/2\) return;/,
    'a new request takes over when the centre has moved more than half the covered block');
  assert.match(src, /finally \{ if\(mine===_planeSweep\) _planeBusy=false; \}/,
    'only the owning sweep may clear the busy flag');
});

/* ── 2. the default layers: a failed download is not a preference ────────────────────────────── */
test('R188 default layers: the cable data is kept, and an outage is never saved as a choice', () => {
  /* (#R200) the snapshot moved to js/session-tabs.js with the rest of the session block. */
  const dl = read('js/data-layers.js'), ab = read('js/session-tabs.js');
  assert.match(dl, /window\.IntMapDefaultLayers=\['dl-climate','dl-subcables'\];/,
    'both layers still start on');
  /* measured: the direct fetch is `TypeError: Failed to fetch` every time (no ACAO), so this layer
     has ALWAYS come through a volunteer CORS proxy — which is the whole asymmetry with Köppen. */
  assert.match(dl, /const _CABLE_CACHE='intmap-subcables-v1';/, 'a successful download must be kept');
  assert.match(dl, /async function _cableCached\(u\)\{/, 'and served before the network on the next visit');
  assert.match(dl, /return \{cab:cCache,lp:lCache,fromCache:true\};/, 'the kept copy answers immediately');
  /* retried with backoff before the box is ever touched */
  assert.match(dl, /if\(cb&&cb\.checked&&_subcableTries<3\)\{ const wait=\[5000,15000,45000\]\[_subcableTries\+\+\];/,
    'three backed-off retries before giving up');
  /* and when it does give up, the app marks the untick as ITS OWN */
  assert.match(dl, /function autoUncheck\(id\)\{[\s\S]{0,120}cb\.dataset\.imAutoOff='1';/,
    'an app-side untick must be marked');
  assert.ok(!/if\(!cab\)\{ const cb=document\.getElementById\('dl-subcables'\); if\(cb\)\{ cb\.checked=false;/.test(dl),
    'the old bare untick must be gone');
  /* …and the session keeps wanting it, which is what made the failure PERMANENT before */
  assert.match(ab, /if\(cb&&!cb\.checked&&cb\.dataset&&cb\.dataset\.imAutoOff==='1'&&layers\.indexOf\(id\)<0\) layers\.push\(id\);/,
    'the snapshot must not record an app-side untick as the user switching the layer off');
  assert.match(ab, /if\(e\.isTrusted&&e\.target\.dataset\) delete e\.target\.dataset\.imAutoOff;/,
    'a real click settles it, in either direction');
});

/* ── 3. Cesium: the poles are lit under BOTH basemaps ────────────────────────────────────────── */
test('R188 Cesium: the polar bands are always shown, and wear the map palette', () => {
  const src = read('js/cesium-engine.js');
  /* measured before the change: satellite 88°S = 239.3/255, MAP 88°S = 0.56/255, MAP 88°N = 12.0/255 */
  assert.match(src, /this\._polarBase=\[\];/, 'the polar bands are their own collection');
  assert.match(src, /L\.show=polar\?true:!!this\._wantWorldBase;/,
    'a polar band is shown whatever the basemap is');
  assert.match(src, /_polarTreatment\(\)\{/, '…and switches treatment with it');
  assert.match(src, /const t=sat\?\{b:1,c:1,s:1,g:1\}:\(dark\?\{b:0\.42,c:0\.90,s:0\.35,g:1\}:\{b:1\.22,c:0\.92,s:0\.34,g:0\.9\}\);/,
    'satellite untouched; the map gets the swept treatment (b .42 / c .90) in dark, its own in light');
  /* the light and dark maps are different targets, and the theme changes without the basemap doing so */
  assert.match(src, /attributeFilter:\['data-theme'\]/, 'the treatment must follow the theme');
  /* the ±85.0511° scoping #R187 added is load-bearing (it made tests/r184-cesium-fs fail 3/3) */
  assert.match(src, /const MERC_EDGE=85\.0511287798066;/, 'the bands stay scoped to the caps');
  /* the single-tile bundled picture is a DIFFERENT object and must stay with the satellite view:
     one equirectangular row over a whole cap is the radial smear #R187 replaced. */
  assert.match(src, /Cesium\.SingleTileImageryProvider\.fromUrl\(worldUrl,\{rectangle:rect,tileWidth:2048,tileHeight:1024\}\)\s*\n?\s*\.then\(add\)/,
    'the bundled floor is added without the polar flag, so it still follows the satellite basemap');
});

/* ── 4. widgets: glass, and one material for all of them ─────────────────────────────────────── */
test('R188 widgets: every card is translucent glass, tint included', () => {
  const src = read('js/widgets.js');
  /* measured in the DEFAULT appearance before the change: --glass-fill = #1c1c1e (opaque), every
     card rgb(28,28,30), the AQI card an opaque rgb(255,204,0). No widget was glass at all. */
  assert.match(src, /':root\{--wgt-glass:rgba\(255,255,255,0\.55\)/, 'the cards get their own material');
  assert.match(src, /'\[data-theme="dark"\]\{--wgt-glass:rgba\(30,30,38,0\.44\)/, 'translucent in dark too');
  assert.match(src, /\.wgt-card\{position:relative;border-radius:22px;[^']*background:var\(--wgt-glass\)/,
    'the card fill must be the widget material, not the appearance-setting fill');
  assert.ok(!/\.wgt-card\{position:relative;[^']*background:var\(--glass-fill\)/.test(src),
    '--glass-fill must no longer decide whether a widget is glass');
  /* the tint is a constant alpha — #R187 took it from the setting, which meant 1.0 (opaque) by default */
  assert.match(src, /const _TINT_GLASS=0\.52;\s*\n\s*function _tintA\(\)\{ return _TINT_GLASS; \}/,
    'AQI/UV must be the same material at a fixed alpha, not an opaque slab');
  /* the flat fill (#R187's other half) stays: no gradient may darken a corner */
  assert.ok(!/linear-gradient\(158deg,\s*'\+_sh/.test(src), 'no re-introduced 158° shade gradient');
  /* ⚠ and it is scoped to the widgets — every other surface still follows the setting (#R33/#R153) */
  const css = read('css/intmap.css');
  assert.match(css, /:root\{ --glass-blur:16px; --glass-sat:150%; --glass-fill:var\(--card-bg\);/,
    'the shared material is untouched');
});

/* ── 5. terrain & water: the water's own edges, not a stroke ─────────────────────────────────── */
test('R188 water: the drawn body is measured from the ground, not from one width', () => {
  const src = read('js/terrain-water.js');
  /* ══ ⚠⚠⚠ (#R267) THE CLAIM SURVIVES; THE MACHINE THAT MADE IT TRUE IS GONE ═════════════════════
     #R188's claim was that the far field's width comes from the DEM (a transect solved at the level
     continuity asks for) rather than from one stroke width. Every assertion in the original version
     of this test pinned that machinery by its source text: `channelSections`, `geom(m,h)`, `atQ`,
     the 26-step bisection, `stamp(lng,lat,nx,ny,wl,wr,dep,cellM)`, the canvas sizing.

     #R267 was told 「上流から下流まで全部同じモデル、描画にしろ」 and there is no far field any more —
     the water beyond the working rectangle is the same shallow-water field on the same lattice. Its
     width is not solved from a transect at all: it is however many cells hold water, which is a
     stronger form of the same claim (the ground decides the width, cell by cell, every step). So
     the test asserts the property and, positively, that no width is ever written as a constant.
     ⚠ THIS IS THE SEVENTH ROUND IN A ROW IN WHICH THE PREVIOUS ROUND'S TESTS MADE A CORRECT CHANGE
     LOOK LIKE A REGRESSION ([[intmap-recurring-lessons]]). The rule that keeps coming out of it:
     assert what must be TRUE of the answer, not the text that produced it. */
  assert.ok(!/lineWidth=/.test(src), 'nothing about the water is drawn as a stroke of any width');
  assert.ok(!/widthPx/.test(src), 'and no width in pixels survives');
  /* the drawn extent is the wet set of the solver, cell by cell */
  assert.match(src, /if\(d>0\.02\)\{ const c=waterRGBA\(d\);/, 'a cell is drawn because it holds water');
  assert.match(src, /const bb=basinBBox\(\);/, 'over the lattice the model actually covers');
  /* a claim finer than the data is still counted, never passed off as measurement (#R185) */
  assert.match(src, /drawBlock>1/, 'and a picture coarser than the model says so');
  /* and the second silent no-op #R188 fixed: a click before the grid exists */
  assert.ok(!/function onClick\(e\)\{ if\(!opened\|\|!G\) return;/.test(src),
    'a click with no grid yet must not be discarded');
  assert.match(src, /if\(!G\)\{ if\(mode==='source'\) onClickNoGrid\(lng,lat\);/,
    'it must build and then place the water');
});

/* ── 6. flight sim: the view's tilt reaches both the aeroplane and the camera ────────────────── */
test('R188 flight sim: "current map view" carries the tilt, clamped to the airframe', () => {
  const src = read('js/flight-sim.js');
  assert.match(src, /o\.viewGamma=\(_p-90\)\*Math\.PI\/180;/,
    'the view tilt becomes a flight-path angle (90° = level, the sim\'s own convention)');
  assert.match(src, /o\.viewCam=\{ pitch:_p, bearing:\(isFinite\(_b\)\?_b:0\), roll:\(isFinite\(_r\)\?_r:0\) \};/,
    '…and the camera is seeded from the same view');
  /* clamped to what the airframe can HOLD, from the same polar as the level trim — no round numbers */
  assert.match(src, /function computeTrim\(gammaWant\)\{/, 'the trim must accept a requested path angle');
  assert.match(src, /const gMax=Math\.asin\(Math\.max\(-1,Math\.min\(1,\(Tmx-Drag\)\/Math\.max\(1,ac\.m\*g0\)\)\)\);/,
    'the climb limit is full thrust against drag');
  assert.match(src, /const _glide=-Math\.atan2\(CD,Math\.max\(0\.05,CLn\)\);/,
    'the descent limit is the idle glide angle');
  assert.match(src, /gamma=Math\.max\(Math\.min\(_glide,gMax\),Math\.min\(gMax,gammaWant\)\);/,
    'the request is clamped between them — a top-down map must not become a vertical dive');
  /* every path that existed before passes no argument and must be unchanged */
  assert.match(src, /\} else \{ st\.thr=Math\.max\(0\.02,Math\.min\(1,Drag\/\(ac\.Tmax\*densF\)\)\);/,
    'the no-argument branch is still the level trim');
  /* the camera intro: frame one is the view START was pressed on */
  assert.match(src, /st\._camSeed=\{ pitch:\+vc\.pitch,/, 'the seed is stored on the flight state');   /* (#R189) the seed also carries eye+dist */
  assert.match(src, /st\._cB=sd\?sd\.bearing:bearingT; st\._cR=sd\?sd\.roll:rollT; st\._cP=sd\?sd\.pitch:pitchT;/,
    'the smoother starts from the map view, not the aeroplane');
  assert.match(src, /const cap=\(_intro>0\?110:900\)\*Math\.max\(0\.001,dt\)/, 'and eases rather than cuts');
  assert.match(src, /if\(age>=st\._camSeed\.ms\) st\._camSeed=null;/,
    'the seed is dropped when the intro ends, so the #R174 constants come back exactly');
});
