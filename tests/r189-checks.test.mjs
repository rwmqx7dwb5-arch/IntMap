/* ============================================================================
 *  R189 — eight reports: the aircraft glyph's storage generation, both default
 *  layers healing poisoned sessions, the Cesium polar offline fallback, the
 *  water tracer's TDZ crash + talweg + resolution ladder + discharge, the
 *  flight sim's framing seed, max-zoom @2x, and the seismic overhaul (real-time
 *  playback, JMA scale, terrain-aware painted intensity, free-drawn rupture,
 *  polar-safe rings).
 *  Source-level checks: each one pins the exact code that fixed a report, so a
 *  refactor that silently undoes it fails here with the reason attached.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

/* ── 1 · aircraft: a '1' stored under the default-TRUE era is not a choice ───────────────────── */
test('R189 aircraft: the planes3D storage key is generation-bumped', () => {
  const src = read('js/data-layers.js');
  assert.match(src, /const PLANES3D_KEY='intmap_planes3d3';/, 'a NEW key, so the old value cannot override (#R190 bumped it with the default)');
  assert.match(src, /localStorage\.removeItem\('intmap_planes3d'\); localStorage\.removeItem\('intmap_planes3d2'\)/, 'and BOTH legacy keys are removed');
  assert.match(src, /localStorage\.setItem\(PLANES3D_KEY,planes3D\?'1':'0'\)/, 'the toggle writes the new key');
  /* the glyph itself is untouched — byte-identical to the first commit (#R187) */
  assert.match(src, /const _PLANE_ORIG=\[\[0,-19\]/, 'the original outline stays');
});

/* ── 2 · defaults: sessions written before #R188 are healed ONCE ─────────────────────────────── */
test('R189 defaults: poisoned sessions are migrated, and the SW keeps the cable cache', () => {
  /* (#R200) the session block is js/session-tabs.js now — a real ES module, imported by name. */
  const body = read('js/session-tabs.js');
  assert.match(body, /defv:190/, 'the snapshot stamps its generation (#R190 bumped it — see js/session-tabs.js)');
  assert.match(body, /if\(!\(\+s\.defv>=190\)\) \(window\.IntMapDefaultLayers\|\|\[\]\)\.forEach/,
    'a session from an older generation gets the default-on ids back once');
  const sw = read('sw.js');
  assert.match(sw, /!\/\^intmap-subcables-\/\.test\(k\)/,
    'the SW activate purge spares the page-owned cable cache');
  const dl = read('js/data-layers.js');
  /* the build() give-up path is no longer silent */
  assert.match(dl, /console\.warn\('addSubcables',e\); autoUncheck\('dl-subcables'\);/,
    'a style that never accepts the layers unticks with imAutoOff…');
  assert.match(dl, /海底ケーブルレイヤーを追加できませんでした/, '…and says so');
});

/* The migration reaches every saved session — INCLUDING the ones the test suite writes for itself.
   The Playwright seed (#R186) exists to say "this profile has already opted out of the default-on
   layers" so ~350 tests boot in 3.2 s instead of 9.2 s; unstamped, `_restore()` healed them all
   back on and CI measured three straight timeouts of r174 «zooming in still moves the viewpoint»
   plus three newly-flaky tests. Whatever generation js/app-body.js writes, the seeds must claim. */
test('R189 defaults: every test-suite session seed carries the CURRENT generation', () => {
  const gen = /defv:(\d+)/.exec(read('js/session-tabs.js'));
  assert.ok(gen, 'js/session-tabs.js stamps a generation');
  /* ⚠ (#R225) `tests/helpers/session-seed.js` IS NOW ONE OF THE SEEDS. It gained `sessionWith()` so a
     spec that needs its own layer set stops writing the whole snapshot inline — which is what let the
     stamp drift in the first place. A file that DELEGATES to it is stamped by it, so it is checked
     there rather than twice. */
  const seeds = ['playwright.config.js', 'tests/r172.spec.js', 'tests/r173.spec.js', 'tests/r186.spec.js',
                 'tests/helpers/session-seed.js'];
  for (const f of seeds) {
    const src = read(f);
    for (const m of src.matchAll(/intmap_session2[\s\S]{0,200}?\{[\s\S]{0,200}?\}/g)) {
      const stamp = /["']?defv["']?\s*:\s*(\d+)/.exec(m[0]);
      if (!stamp && /sessionWith\s*\(/.test(m[0])) continue;    /* stamped by the helper, not here */
      assert.ok(stamp, `${f}: a session seed without defv is healed back to the default-on layers`);
      assert.equal(stamp[1], gen[1], `${f}: the seed's generation must track js/session-tabs.js`);
    }
  }
  /* …and the helper itself stamps both of the snapshots it can produce */
  const helper = read('tests/helpers/session-seed.js');
  const stamps = [...helper.matchAll(/["']?defv["']?\s*:\s*(\d+)/g)].map((m) => m[1]);
  assert.ok(stamps.length >= 2, 'both SESSION_VALUE and sessionWith() carry a generation');
  for (const st of stamps) assert.equal(st, gen[1], "the helper's generation must track js/session-tabs.js");
});

test('R189 defaults: buildLegend survives a missing legend element', () => {
  const src = read('js/data-layers.js');
  assert.match(src, /function buildLegend\(\)\{\s*\n\s*const lg=document\.getElementById\('koppen-legend'\);[\s\S]{0,400}if\(!lg\) return;/,
    'the default-on dispatcher fires synthetic changes up to 2.6 s after boot — with the legend ' +
    'element absent this wrote innerHTML on null and killed the change handler uncaught');
});

/* ── 3 · Cesium poles: a live URL is not imagery when the network says no ────────────────────── */
test('R189 cesium: GIBS failure arms the bundled-floor fallback in map view', () => {
  const src = read('js/cesium-engine.js');
  assert.match(src, /this\._polarFallback=false;/, 'the fallback is armed only by an actual failure');
  assert.match(src, /band\.errorEvent\.addEventListener\(\(\)=>\{ if\(!this\._polarFallback\)\{ this\._polarFallback=true; this\._polarTreatment\(\); \}/,
    'a failed polar tile arms it');
  assert.match(src, /L\.show=this\._wantWorldBase\|\|fb;/,
    'the floor shows under the map basemap once armed (only the caps can show through)');
  /* and the perf default that was never set — preloadSiblings was tried and withdrawn (it changes
     what globe.tilesLoaded MEANS; CI measured r180 ⑥ / r184-fs ② timing out because of it) */
  assert.match(src, /this\._globe\.tileCacheSize=_mob\?320:768;/, 'the tile cache is no longer the default 100');
  assert.ok(!/preloadSiblings=true/.test(src), 'preloadSiblings stays withdrawn');
});

/* ── 4 · water: the TDZ crash, the talweg, the ladder, the discharge, the honesty ────────────── */
test('R189 water: an exception is an ending, not a silence', () => {
  const src = read('js/terrain-water.js');
  /* ══ ⚠⚠⚠ (#R267) THE TWO-MODEL ANSWER IS GONE, SO THE ASSERTIONS ABOUT ITS SECOND HALF ARE ═══
     「上流から下流まで全部同じモデル、描画にしろと言っている。」 — the third time that instruction has
     been given (#R211, #R255, #R267). The water beyond the working rectangle is now the SAME
     shallow-water field on the SAME lattice, so the walk, its resolution ladder, its per-window
     routing, its chain, its cross-sections and its escalation no longer exist to be pinned. What
     each round actually ESTABLISHED is kept and re-asserted against the model that replaced them.
     ⚠ This is the seventh consecutive round in which the previous rounds' tests made a correct
     change look like a regression ([[intmap-recurring-lessons]]): assert the property, not the text.
  */
  /* ⚠ (#R267) #R189's FIRST HALF WAS ABOUT A TDZ CRASH IN A 600 km WALK THAT NO LONGER EXISTS.
     What it established is the rule, and the rule is asserted here instead: a failure in the
     long-range answer must become something the reader can see, never a silent nothing. The DEM
     read that can fail now is the lattice growth, and it is counted and printed. */
  assert.match(src, /growBasin\(padW,padE,padN,padS\)\.catch\(\(\)=>\{ growFailed\+\+; \}\)/,
    'a growth that cannot read the elevation data is counted');
  assert.match(src, /result\.sim\.growFailed\)\?\('<br>/, '…and the panel says so');
  assert.match(src, /result\.sim&&result\.sim\.capped/, 'and so does a lattice that stopped growing');
});
test('R189 water: the course follows the ground, at one resolution, with a settable discharge', () => {
  const src = read('js/terrain-water.js');
  /* ══ ⚠⚠ (#R255) THE QUESTION CHANGED, AND THIS IS THE ASSERTION THAT SAID SO ═══════════════════
     #R189 was right that the flood's least-rise escape is not the river, and answered it with an MFD
     accumulation of UNIT contributions — drainage AREA. #R255 was told 「上流から下流まですべて同じ
     計算・描画方法にしろ。上流のものに合わせろ」 and made the downstream WINDOWS run the working
     grid's own `routeWater`. #R267 was told it a third time and removed the windows: the water
     downstream is the same field, on the same lattice, at the same cell size.
     What #R189 established survives in the strongest possible form — the course cannot follow
     anything but the ground, because there is no course, only water on ground. */
  assert.match(src, /B=\{ NX:G\.NX, NY:G\.NY, xW:G\.xW, yN:G\.yN, dx:G\.dx, dy:G\.dy, cellM:G\.cellM,/,
    'the basin starts as the working rectangle itself');
  assert.match(src, /areaM2:G\.areaM2, z:G\.z, offI:0, offJ:0 \}/, '…at its cell size and its DEM level');
  assert.ok(!/TRACE_Z_NEAR/.test(src), 'there is no resolution ladder, because there is one resolution');
  /* ⚠ (#R268) THE PROPERTY, NOT THE CALL SITE. This used to pin `demAt(bLng(i),bLat(j),B.z)` — the
     one line inside the old `bedAt()`. #R268 removed `bedAt` because the growth reads the new ground
     one DEM-TILE BLOCK at a time (the fixed 28-sample probe missed two tiles in three once a basin
     outgrew a few tens of kilometres), so the read now lives in `growBasin` and names the basin's
     own captured `z`. What #R189 is about is unchanged and is what is asserted: ONE level, the
     basin's, for every sample of new ground. */
  assert.match(src, /const dx=Bold\.dx, dy=Bold\.dy, z=Bold\.z;/, 'the growth captures the basin\'s own level');
  assert.match(src, /v=demAt\(nLng\(i\),nLat\(j\),z\)/, 'and new ground is read at that one level');
  assert.ok(!/demAt\([^)]*,\s*(?:B\.z\s*[-+]|z\s*[-+])/.test(src), 'never at a level derived from it');
  /* the discharge control (#R189 「水の水流は設定可能に」) is still here, and is now an INPUT */
  assert.match(src, /let flowM3s=null;/, 'a settable discharge state');
  assert.match(src, /sources\.forEach\(x=>\{ if\(x\.cont&&flowM3s!=null\) x\.rate=flowM3s; \}\);/,
    '…and it sets what the model is actually fed');
});
test('R189 water/seismic: the panels are opaque', () => {
  for (const f of ['js/terrain-water.js', 'js/seismic.js']) {
    const src = read(f);
    assert.match(src, /background:var\(--card-bg,#1c1c1e\)/, `${f} uses the opaque card colour`);
    assert.ok(!/panel\.style\.cssText=[^\n]*var\(--popup-bg/.test(src),
      `${f} no longer builds its panel on the translucent popup colour`);
  }
});

/* ── 5 · flight sim: the framing is the third fact ───────────────────────────────────────────── */
test('R189 flight sim: the seed carries the eye and the look distance, and the intro flies them in', () => {
  const src = read('js/flight-sim.js');
  assert.match(src, /o\.viewCam\.eye=\{ lng:eye\.lng, lat:eye\.lat, alt:eye\.alt \};/, 'the map eye is captured');
  assert.match(src, /o\.viewCam\.dist=Math\.max\(200,Math\.hypot\(dx,dy,eye\.alt\)\);/, 'with its eye→centre distance');
  assert.match(src, /eye:_se, dist:\(isFinite\(vc\.dist\)&&vc\.dist>0\)\?\+vc\.dist:null,/, 'stored on the seed');
  assert.match(src, /let cEyeLng=eLng, cEyeLat=eLat, cEyeAlt=camAlt, _Darm=_D_LOOK;/,
    'steady state = the #R158 camera exactly');
  assert.match(src, /if\(_intro>0&&st\._camSeed&&st\._camSeed\.eye\)\{/, 'blended only while the seed lives');
  assert.match(src, /if\(okCam&&st\._camPrev&&_intro<=0\)\{/,
    'the one-frame-jump guard stands aside during the intro flight (the centre is MEANT to move fast)');
});

/* ── 6 · satellite: the deepest zoom is no longer the one half-resolution view ───────────────── */
test('R189 satellite: the @2x stitch reaches the map maximum zoom', () => {
  const src = read('js/sat-proto.js');   /* (#R195) the protocol moved out of the shell, byte for byte */
  assert.match(src, /if\(!_satHiDPI\|\|z>=20\) return null;/,
    'z19 — the max-zoom view — now stitches from real z20 children where Esri has them');
});

/* ── 7 · seismic: the overhaul ───────────────────────────────────────────────────────────────── */
test('R189 seismic: real-time playback with a visible, settable rate', () => {
  const src = read('js/seismic.js');
  assert.match(src, /let speed=1; const SPEEDS=\[1,2,5,10,30,60,120,300\];/, '×1 default, a real choice list');
  assert.match(src, /tSec=\(tSec\+\(now-last\)\/1000\*speed\)%MAXT;/, 'wall-clock seconds × rate — not 10 s per 90 ms');
  /* (#R237) the control gained a styling class in the same attribute — `class="sq-spd sq-sel"` —
     so the claim is «the control is there», not «the attribute is spelled with a closing quote here». */
  assert.match(src, /class="sq-spd[ "']/, 'the rate is on the panel');
  assert.match(src, /setSpeed\(v\)\{/, 'and callable');
});
test('R189 seismic: JMA scale as a labelled conversion, MMI honesty intact', () => {
  const src = read('js/seismic.js');
  /* (#R192) 震度 is no longer converted from PGV at all — it is the JMA's own computation, off the
     JMA-filtered acceleration. #R189's own note said the regression was standing in for exactly
     that. See tests/r192-checks. */
  assert.match(src, /function jmaOfA0\(a0\)\{ return 2\*Math\.log10\(Math\.max\(1e-6,a0\)\)\+0\.94; \}/,
    '気象庁「計測震度の算出方法」');
  assert.match(src, /\{ min:6\.5, id:'7',  col:'#B40068' \}/, 'the JMA published colours, 震度7 included');
  assert.match(src, /class="sq-scale[ "']/, 'the scale is switchable on the panel');   /* (#R237) see .sq-spd above */
  /* the honesty strings r176 pinned still hold — MMI is still not shindo, and the JMA view says
     what it is */
  assert.ok(/NOT the JMA shindo scale/.test(src) && /気象庁震度階級ではありません/.test(src), 'MMI disclaimer kept');
  /* (#R192) …and it is no longer a conversion: the panel now says the shindo is the JMA's own
     computation. The claim the test is really about — that the panel STATES what the number is —
     is unchanged. */
  assert.match(src, /震度は換算ではなく気象庁「計測震度の算出方法」そのものです/, 'the JMA view says what it is');
  /* (#R246) the registry's descriptions moved to js/locales/pages.<code>.js `sourceUse`; the credit
     is the same sentence, in the file that now holds the English original. */
  const refs = read('js/locales/pages.en.js');
  assert.ok(refs.includes('Fujimoto & Midorikawa (2005)'), 'credited');
  assert.ok(refs.includes('Wald & Allen (2007)'), 'and the Vs30 proxy too');
});
test('R189 seismic: the intensity is a terrain-aware painted field, not contour circles', () => {
  const src = read('js/seismic.js');
  assert.match(src, /async function buildField\(\)\{/, 'the field is built from the DEM');
  assert.match(src, /VS30_BINS=\[\[1e-4,180\],\[2\.2e-3,240\],\[6\.3e-3,300\],\[0\.018,360\],\[0\.05,490\],\[0\.10,620\],\[0\.138,760\]\];/,
    'Wald & Allen 2007 active-tectonic slope table');
  /* ⚠ (#R218) the two quantities now come out of ONE index lookup (prof.both) instead of two. The
     profile, the interpolation and the per-cell multiply are unchanged; only the binary SEARCH for
     the node was replaced by the closed form the geometric table already implies.
     tests/r218-checks ③ runs the old and the new interpolation against each other. */
  /* (#R232) one index for both quantities still — but the profile is now chosen by azimuth, because
     rupture directivity makes the source term a function of direction as well as distance. */
  assert.match(src, /const b2=(?:prof|profAt\(lo,la\))\.both\(rM\);/, 'one RVT profile, one index for both quantities');
  /* ⚠ (#R263) THE PROPERTY IS «THE CELL'S SITE TERM SCALES BOTH QUANTITIES», NOT «ONE MULTIPLY».
     #R189 wrote this as a literal because the site term was a single scalar and one multiply was
     literally all it took. #R263 added the FREQUENCY-DEPENDENT half of the same site term, so a cell
     now applies the scalar `g` and then a shape correction `kk` — two multiplies for two halves of
     one term. What #R189 was defending (both PGV and a₀ scale with this cell's own ground, off one
     index into one profile) is unchanged, so the assertion states that instead. */
  assert.match(src, /let pgv=b2\[0\]\*g, a0=b2\[1\]\*g;/, 'the cell\'s scalar site term scales both quantities');
  assert.match(src, /if\(bank\)\{ const kk=bank\.at\(/, '…and the frequency-shape half is applied to the same pair');
  assert.match(src, /pgv\*=kk\[0\]; a0\*=kk\[1\];/, 'PGV takes the PGV correction and a₀ takes the a₀ one');
  /* ⚠ (#R212) SEA cells are still not painted — but a cell below zero is no longer assumed to be
     sea. 「海抜0m以下の土地は震源分布の対象外にされるのを辞めろ」: the Jordan Rift, a quarter of the
     Netherlands, the Caspian Depression and Death Valley are dry land below zero and were dropped
     out of the map entirely. The land mask decides, bounded at −440 m (below which nothing on Earth
     is dry), and the sign of the elevation only decides where the mask has nothing to say. */
  /* ⚠ (#R215) THE CLAIM, NOT THE LINE. This used to pin the exact `landMask&&landMask.isLand(...)`
     text, which is #R203's trap: the claim survived while the literal did not. The land answer now
     comes from `landAt()` — js/coast-mask.js rasterised into THIS field's own grid, with the 19.5 km
     bundled mask behind it — because deciding a 1.5 km cell's coast with a 19.5 km majority raster
     is the 「大きなタイルでごまかすな」 the report was about. What must stay true is the RULE. */
  assert.match(src, /if\(!\(landAt\(k,lo,la\)===true&&e0>-440\)\)\{ sea\+\+; vs\[k\]=-1; continue; \}/,
    'a sub-zero cell is sea unless the land answer says it is land, and only down to −440 m');
  assert.match(src, /LYR_IMG='seis-mmi-fill'/, 'rendered as a raster fill');
  assert.ok(!/id:'seis-mmi',/.test(src), 'the dashed contour layer is gone');
  assert.ok(!/'seis-mmi-lbl'/.test(src), 'and its labels with it');
  /* (#R190) the fallback is declared — and now names the real cause, which is resolution, not outage */
  assert.match(src, /この範囲では地形が粗く一様地盤で表示/, 'an unusable site term is declared, not hidden');
});
test('R189 seismic: a free-drawn rupture with slip yields Mw, Rrup and finite-source fronts', () => {
  const src = read('js/seismic.js');
  assert.match(src, /const MU=RHO\*BETA\*BETA, VRUP_KMS=0\.75\*BETA\/1000;/, 'μ=ρβ², Vr=0.75β');
  /* ⚠ (#R224) M₀ = μ·A·D̄ MOVED, IT DID NOT GO. The drawn outline is the fault's surface projection
     now, so the whole chain (dip → width → depth → 3-D area → slip → M₀ → Mw) lives in
     js/fault-geometry.js, where it can be verified against real earthquakes in Node. This file's job
     is to prove seismic.js still hands the ring to it and still reads the moment back. */
  assert.match(src, /const s=faultSolve\(ring,aKm2\)/, 'the ring goes through the fault solver');
  const fg = read('js/fault-geometry.js');
  assert.match(fg, /const M0 = mu \* \(areaKm2 \* 1e6\) \* slipM;/, 'M0 = μ·A·D̄');
  assert.match(fg, /const mw = \(Math\.log10\(M0\) - 9\.1\) \/ 1\.5;/, 'Mw back through Hanks & Kanamori');
  assert.match(src, /function faultDistKm\(lng,lat\)\{/, 'Rrup: zero inside, nearest edge outside');
  /* ⚠ (#R235) the CONTRACT, not the parameter name. This used to pin `faultFrontLines(radiusAtDelay)`;
     #R235 changed the callback to take the whole source point (it now carries that point's own depth
     as well as its rupture delay), so a signature match would fail on a change that strengthens
     exactly the property this line is here to protect. What must stay true is that a drawn rupture
     still gets an envelope of DELAYED fronts rather than one circle. */
  assert.match(src, /function faultFrontLines\(\w+\)\{/, 'fronts are the delayed-union envelope');
  assert.match(src, /delay:off\*D\*RE\/VRUP_KMS/, '…each source point delayed by the rupture’s own propagation');
  /* ⚠ (#R238) the CLAIM again, not the spelling. This pinned `fault?faultFrontLines(rad):…`,
     i.e. «a drawn rupture takes the envelope and a point source takes a plain ring». #R238 gave
     the body waves a per-bearing crustal correction, so a point source can no longer be drawn
     from ONE radius either — `ringLines` would repeat the bearing-0 answer all the way round and
     throw the correction away, which is exactly the defect #R235 recorded for the surface waves.
     Both families go through the envelope builder now, so the property this line protects (a
     drawn rupture gets the delayed union, never one circle) is STRONGER, not weaker. */
  /* ⚠ (#R239) `train(rad, …)` builds the leading edge, the trailing edge and the band between them,
     and both come from `faultRing()` — the per-bearing builder `faultFrontLines` is now a front-only
     wrapper around. Same property, one level up. */
  assert.match(src, /train\(rad,ph\.col,ph\.w\)/, '…and it is what a drawn rupture uses');
  assert.doesNotMatch(src, /ringLines\(epi,rad\(null\)\)/, 'no front is drawn from a single bearing-free radius');
  assert.match(src, /DT\.currentGeometry/, 'captured from the SHARED free-draw tool (#R141), not a private one');
  const atlas = read('js/atlas-console.js');
  assert.ok(atlas.includes('"scale"?:"mmi"|"jma"'), 'the SYS catalogue advertises the scale');
  assert.ok(atlas.includes('"slip"?:m'), '…and the slip');
});
test('R189 seismic: rings go through the polar-safe helpers', () => {
  const src = read('js/seismic.js');
  /* ⚠ (#R237) THE STEP COUNT IS NO LONGER 180 AND MUST NOT BE PINNED — 「動作は離散的ではなく
     スムーズにして」 made it a function of the front's size on screen (see _frontSteps). The claim
     this test makes is about WHICH HELPER draws the ring, which is what carries the seam and pole
     behaviour; the number of vertices was never part of it. */
  assert.match(src, /HOST\.diskOutlineLines\(centre,a\*D\*RE,/, 'circular fronts use the shared seam/pole machinery');
  assert.match(src, /HOST\._splitLineToWindows\(ringPts\)/, 'and the finite-source envelope is seam-split the same way');
  assert.match(src, /Math\.max\(-89\.99,Math\.min\(89\.99,la2\/D\)\)/, 'destAng clamps the asin pole case');
  assert.match(src, /const h=Math\.sin\(dla\)\*Math\.sin\(dla\)/, 'gcDelta is the haversine now');
});
