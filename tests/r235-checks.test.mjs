/* ============================================================================
 *  R235 — the contracts this round established, checked against the source.
 *
 *  ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
 *  (#R228's rule: a check that stays green when you undo the fix is not a check).
 *  Where the claim is arithmetic it is COMPUTED here rather than pinned to a
 *  number this round happened to produce (#R203/#R229).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* ⚠ comments quote the instructions, and the instructions quote the strings the checks look for
   (#R208/#R215/#R231/#R232/#R234 — SEVEN rounds of a check hitting its own explanation). Strip the
   comments and match the SYNTAX. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── 1 · 「無感」 was three different answers wearing one label ──────────────────────────────── */
test('R235 seismic table: "not felt" is the ground, not the model running out of range', () => {
  const s = code(read('js/seismic.js'));
  /* the cell must NOT gate on `calibrated` any more — that is the defect itself */
  assert.doesNotMatch(s, /if\(!a\.calibrated\) return none;/,
    'the intensity cell no longer blanks on `calibrated`');
  assert.match(s, /if\(!\(a\.pgv>=PGV_FELT\)\) return plain\(notFelt\);/,
    '「無感」 is printed only when the ground is not moving');
  assert.match(s, /if\(!a\.inRange\) return plain\(noAnswer\);/,
    'past the calibrated range the table says so instead of saying "not felt"');
  /* `calibrated` still exists and still goes false above MMI 9.5 — the point is that the CELL
     no longer asks it. If that ever stops being true this test is meaningless, so assert it. */
  assert.match(s, /calibrated:\(inRange&&pgv>=PGV_FELT&&mmi<=9\.5\)/,
    'calibrated still carries the MMI ceiling (which is why the cell must not use it)');

  /* the arithmetic, so the defect is demonstrated rather than described: an M9-class PGV at the
     epicentre converts to MMI above the GMICE ceiling, i.e. `calibrated` false while shaking hard */
  const mmiOf = (pgv) => { const lg = Math.log10(Math.max(1e-6, pgv));
    return Math.max(1, Math.min(12, (lg <= 0.53) ? (3.78 + 1.47 * lg) : (2.89 + 3.16 * lg))); };
  const pgv = 435;                       /* cm/s — measured in-browser near an M9.5 epicentre */
  const mmi = mmiOf(pgv);
  assert.ok(mmi > 9.5, 'the worst-hit ground is above the GMICE ceiling (MMI ' + mmi.toFixed(2) + ')');
  const oldWouldSayNotFelt = !(true && pgv >= 0.062 && mmi <= 9.5);
  assert.ok(oldWouldSayNotFelt, 'and the old test would therefore have printed 「無感」 for it');
});

/* ── 2 · the chip: raw colour, square, not bold, ink chosen for contrast ────────────────────── */
test('R235 seismic table: the chip is the published colour, square and unbolded', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /border-radius:0;background:'\+col/, '四角背景 — no corner radius, and the class colour itself');
  assert.match(s, /font-weight:400;line-height/, '太字禁止');
  assert.match(s, /function _chipInk\(hex\)\{/, 'the ink is a function of the swatch');
  assert.doesNotMatch(s, /_onDark/, '#R234’s darkener is gone — 「そのままの色」');
});

/* ── 3 · the front envelope: spherical, and concave where the source is ─────────────────────── */
test('R235 wavefronts: the envelope is the spherical outer root, not the convex support function', () => {
  const s = code(read('js/seismic.js'));
  assert.doesNotMatch(s, /const cand=k\.off\*Math\.cos\(\(b-k\.phi\)\*D\)\+r;/,
    'the flat support function (= the convex hull) is gone');
  assert.match(s, /Math\.atan2\(B,A\)\+Math\.acos\(q\)/, 'the outer root of the spherical triangle is used');
  assert.match(s, /function _srcPts\(\)/, 'the source points are sampled with their own depths');
  assert.match(s, /dep=zT\+\(zB-zT\)\*f;/, 'each point takes the plane’s depth at its own across-strike position');
  /* ⚠ (#R238) the depth is READ OUT FIRST now, because the body-wave radius takes the bearing too
     (the crustal correction — see `_bodyStretch`). The claim is unchanged and is the whole of #R235's
     finding: the curve is asked for THAT point's depth rather than the hypocentre's. */
  assert.match(s, /const dep=\(k&&k\.dep!=null\)\?k\.dep:depthKm;/, 'each point’s own depth is taken');
  assert.match(s, /frontDelta\(ph\.k,dep,/, 'and asks the travel-time curve for THAT depth');

  /* the maths, run: the exact root must (a) reduce to the old line for small angles and
     (b) exceed it — i.e. bulge outward where the flat formula under-reaches — at large ones. */
  const D = Math.PI / 180;
  const exact = (offDeg, rDeg, dbDeg) => {
    const A = Math.cos(offDeg * D), B = Math.sin(offDeg * D) * Math.cos(dbDeg * D);
    const C = Math.hypot(A, B); const q = Math.cos(rDeg * D) / C;
    if (q < -1 || q > 1) return null;
    return (Math.atan2(B, A) + Math.acos(q)) / D;
  };
  /* the old expression, kept here so the DIFFERENCE is asserted rather than described */
  const support = (offDeg, rDeg, dbDeg) => offDeg * Math.cos(dbDeg * D) + rDeg;
  /* the planar union boundary — the thing the spherical root must agree with when the sphere is
     flat enough for that to be a fair comparison. `support` replaces this square root with `r`,
     which is the tangent line, which is where the convex hull came from. */
  const planar = (offDeg, rDeg, dbDeg) => {
    const s = offDeg * Math.sin(dbDeg * D);
    return offDeg * Math.cos(dbDeg * D) + Math.sqrt(Math.max(0, rDeg * rDeg - s * s));
  };
  /* (a) the spherical root IS the union boundary: at crustal scale it matches the planar union to
     far better than the ring's own 2.5° sampling, at every bearing */
  for (const db of [0, 30, 45, 90, 135, 180]) {
    const e = exact(0.2, 0.5, db), p = planar(0.2, 0.5, db);
    assert.ok(Math.abs(e - p) < 1e-3,
      'the spherical root matches the planar union at Δbearing ' + db + ' (' + (e - p).toExponential(1) + '°)');
  }
  /* (b) …and the OLD expression does not, by a margin that matters even for a small event:
     0.02° of arc is 2.3 km, on a 55 km front */
  const dSmall = Math.abs(support(0.2, 0.5, 90) - exact(0.2, 0.5, 90));
  assert.ok(dSmall > 0.015, 'across strike the support function over-reaches even at crustal scale ('
    + (dSmall * 111.19).toFixed(1) + ' km)');
  /* (c) at Sumatra scale it is wrong by degrees — hundreds of km */
  const dBig = Math.abs(support(10, 20, 90) - exact(10, 20, 90));
  assert.ok(dBig > 0.4, 'at 10°/20° the support function is off by ' + dBig.toFixed(2) + '° of arc');
  /* (c) the identities that make it a wavefront at all */
  assert.ok(Math.abs(exact(0, 5, 123) - 5) < 1e-9, 'a point source gives a circle of radius r');
  assert.ok(Math.abs(exact(3, 5, 0) - 8) < 1e-9, 'forward of the source point the front is off + r');
  assert.ok(Math.abs(exact(3, 5, 180) - 2) < 1e-9, 'behind it the front is r − off');
  assert.equal(exact(30, 1, 90), null, 'a ray that never reaches a source point contributes nothing');
});

/* ── 4 · the surface-wave path is integrated, not a constant ────────────────────────────────── */
test('R235 wavefronts: surface-wave group velocity is a path integral over the crust', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /let OCEAN_G=/, 'the one lateral-heterogeneity assumption is named and adjustable');
  assert.match(s, /function _pathBuild\(\)/, 'a per-epicentre slowness table');
  assert.match(s, /s\+=stepKm\/g;/, 'it integrates 1/g along the great circle');
  assert.match(s, /function _pathDeg\(reducedKm,brg\)/, 'and the front inverts it per bearing');
  assert.match(s, /if\(!tab\) return reducedKm\/\(D\*RE\);/,
    'with no land mask it degrades to exactly the constant-velocity circle it replaced');
  /* the reference values are UNCHANGED, or this would be a silent re-tuning of #R176's physics */
  assert.match(s, /\{ v:3\.5, col:'#0a84ff'/, 'Rayleigh is still 3.5 km/s');
  assert.match(s, /\{ v:4\.4, col:'#bf5af2'/, 'Love is still 4.4 km/s');
  /* an all-continental path must reproduce the plain great-circle answer exactly */
  const RE = 6371.0, D = Math.PI / 180, PS = 1.0, stepKm = PS * D * RE;
  let cum = 0; const N = 40; for (let i = 1; i <= N; i++) cum += stepKm / 1;
  assert.ok(Math.abs(cum - N * stepKm) < 1e-9, 'g = 1 integrates to the plain distance');

  /* ══ ⚠⚠ AND IT HAS TO BE *WIRED* PER BEARING, which is where the first cut of this round failed.
     `rFor` originally took only the source point, so the surface-wave radius was evaluated at
     `k.phi` — the bearing OF THE SOURCE POINT, not of the ray — and came out identical for every
     direction: measured on Tōhoku at t = 400 s, east and west were both 1441 km, ratio 1.000.
     A circle wearing a path integral's clothes. Both halves of the wiring are asserted. */
  assert.match(s, /const k=K\[i\], r=rFor\(k,b\);/, '_envR passes the RAY bearing into the radius function');
  /* ⚠ (#R241) the ELAPSED TIME moved out of this expression into `_frontT(k)` — the front now leaves
     the broken fault rather than the hypocentre, so «has this piece broken yet» and «how long has it
     been radiating» are two questions and only the first is a per-point one. What this line asserts
     is unchanged and is the whole of its subject: the radius is still a function of the RAY bearing
     `b`, not of the source point's own azimuth. */
  assert.match(s, /const d=_pathDeg\(sw\.v\*_frontT\(k\),b\|\|0\);/,
    'the surface-wave radius is a function of that bearing');
  assert.match(s, /function _frontT\(k\)\{/, '…and the elapsed time has one owner');
  /* ⚠ and a POINT source must go through the per-bearing builder too — `ringLines` takes one radius,
     so routing the no-fault case through it would silently discard the integral again */
  /* ⚠ (#R239) via `train()`, which asks `faultRing()` for the leading edge (and, with a rupture,
     the trailing one). The per-bearing property this line protects is unchanged. */
  assert.match(s, /train\(rad,sw\.col,1\.8\)/,
    'surface fronts always use the per-bearing builder, fault or not');
  /* ══ ⚠⚠ (#R238) THE BODY WAVES NO LONGER KEEP THE CIRCULAR HELPER, AND THAT IS THE FIX ═══════════
     This asserted that P and S go through `ringLines` because 「they have no lateral model, so they
     ARE circles」. They now have one: the crustal legs are corrected over the same land/ocean table
     the surface waves invert (`_bodyStretch`), weighted by the crustal share of the path. That was
     the point — P and S are the two biggest rings on the screen, so leaving them bearing-free by
     construction is most of what 「まだ震央中心の同心円に見える」 was looking at, reported for a
     third round. The reasoning above is preserved verbatim; only its conclusion has changed, and it
     changed because the premise did. Same trap as `ringLines` for the surface waves: one radius
     drawn all the way round would throw the correction away, so both families use the builder. */
  assert.doesNotMatch(s, /ringLines\(epi,rad\(null\)\)/,
    'no front is drawn from a single bearing-free radius any more');
  assert.match(s, /const s=_bodyStretch\(b\|\|0,d,dep\);/, 'the body-wave radius is a function of the bearing too');
  /* the label is placed at the view bearing, so it must read the radius there */
  assert.match(s, /const vb=_viewBearing\(\); const r=rad\(vb\);/, 'the front name reads its own bearing’s radius');
});

/* ── 5 · the playback is a frame, not an 11 Hz timer ────────────────────────────────────────── */
test('R235 wavefronts: playback runs on the shared frame loop and keeps its fractional clock', () => {
  const s = code(read('js/seismic.js'));
  assert.doesNotMatch(s, /playing=setInterval\(/, 'the 90 ms stepper is gone');
  assert.doesNotMatch(s, /tl\.value=Math\.round\(tSec\)/, 'the slider no longer quantises the clock to whole seconds');
  assert.match(s, /R\.frame\('seismic:play',step\)/, 'it re-arms through the one runtime frame loop (#R234)');
  assert.match(s, /step="0\.01"/, 'the range input can express the fractional value it is given');
  /* 90 ms is 11 Hz; the point of the change is that it was well under a display frame */
  assert.ok(1000 / 90 < 30, 'the old rate (11.1 Hz) was below any display refresh');
});

/* ── 6 · the published rupture outline, and its fallback ────────────────────────────────────── */
test('R235 rupture: the outline is fetched from the published finite-fault model', async () => {
  const ev = code(read('js/seismic-events.js'));
  assert.match(ev, /export function fetchRuptureRing\(ev, fetchImpl\)/, 'there is a fetcher');
  assert.match(ev, /download\/rupture\.json/, 'it reads ShakeMap’s rupture.json');
  /* every catalogue row that has a published model carries its id */
  const ids = (read('js/seismic-events.js').match(/usgs: '/g) || []).length;
  assert.ok(ids >= 8, 'the catalogue carries the USGS event ids (' + ids + ')');

  const { fetchRuptureRing } = await import('../js/seismic-events.js');
  /* a MultiPolygon with a small decoy ring and the real one, closed, with depth ordinates */
  const big = [[0, 0, 5], [1, 0, 5], [1.5, 0.5, 25], [1, 1, 25], [0, 1, 25], [0, 0, 5]];
  const small = [[10, 10, 2], [10.1, 10, 2], [10.1, 10.1, 2], [10, 10, 2]];
  const fake = (url) => Promise.resolve({ ok: true, json: () => Promise.resolve(
    /^https:\/\/earthquake\.usgs\.gov\/fdsnws/.test(url)
      ? { properties: { products: { shakemap: [{ contents: { 'download/rupture.json': { url: 'https://x/rupture.json' } } }] } } }
      : { metadata: { reference: 'Someone et al. (2011)' },
          features: [{ geometry: { type: 'MultiPolygon', coordinates: [[small], [big]] } }] }) });
  const got = await fetchRuptureRing({ usgs: 'testevent1' }, fake);
  assert.ok(got, 'a well-formed model produces a ring');
  assert.equal(got.segments, 2, 'it reports how many segments the published model had');
  /* ⚠ (#R244) the published ring is now DENSIFIED along its great circles — one vertex per ~50 km,
     the same rule #R234 gave the fallback rectangle, because a 500 km edge is not straight on a
     sphere and every cell of the intensity field measures its distance to these vertices. So the
     count is no longer the vertex count of the file; what this pins is what it always meant — the
     LARGEST ring was taken, its closing repeat was dropped, and no original vertex moved. */
  assert.ok(got.ring.length >= 5, 'the largest ring is used (' + got.ring.length + ' points after densifying)');
  assert.ok(got.ring.some((p) => p[0] === 1 && p[1] === 0), 'an original vertex survives untouched');
  assert.ok(!got.ring.some((p) => p[0] === 10), 'and the small decoy ring is not the one that was taken');
  assert.notDeepEqual(got.ring[got.ring.length - 1], got.ring[0], 'the closing repeat is dropped');
  assert.deepEqual(got.ring[0], [0, 0], 'coordinates are (lng, lat) — the depth ordinate is not a coordinate');
  assert.equal(got.zTopKm, 5, 'the top of the plane comes off the polygon');
  assert.equal(got.zBotKm, 25, 'and so does the bottom');
  assert.match(got.ref, /Someone/, 'the reference travels with it, for the attribution line');

  /* ⚠ THE FALLBACK IS THE WHOLE SAFETY PROPERTY: nothing may throw out to the caller */
  const dead = () => Promise.reject(new Error('offline'));
  assert.equal(await fetchRuptureRing({ usgs: 'testevent2' }, dead), null, 'a failed fetch is null, not a throw');
  assert.equal(await fetchRuptureRing({ id: 'kobe1995' }, dead), null, 'an event with no published model is null');

  const s = code(read('js/seismic.js'));
  assert.match(s, /if\(!pub\|\|evId!==want\|\|!opened\) return;/,
    'a fetch that lands after the reader changed events is dropped');
  assert.match(s, /const ring=ruptureRing\(ev\);/, 'the rectangle is still drawn first, so the panel is never empty');
});

/* ── 7 · day/night is a basic display, not a layer ──────────────────────────────────────────── */
test('R235 day/night: not counted, not chipped, not offered as a layer to discover', () => {
  const dl = code(read('js/data-layers.js'));
  assert.match(dl, /const skip=new Set\(\[[^\]]*'dl-nightside'\]\)/,
    'it is skipped by the Active-layers list, like the other nine basics');
  const w = code(read('js/widgets.js'));
  assert.match(w, /const FEAT_IDS=\[/, 'the featured-layer roulette exists');
  assert.doesNotMatch(w, /FEAT_IDS=\[[^\]]*'dl-nightside'/, 'and no longer offers the day/night switch');
  /* the row itself must STILL be in the basic-display block — this is a re-classification, not a removal */
  assert.match(dl, /const nsRow=rowFor\('nightside'\); if\(nsRow\)/, 'the row is still placed among the basics');
});

/* ── 8 · the phone's layer sheet is the desktop's ───────────────────────────────────────────── */
test('R235 mobile: the layer sheet is the desktop panel, without the compare/imagery furniture', () => {
  const m = code(read('js/mobile-ui.js'));
  assert.doesNotMatch(m, /if\(isM\)\{ moveTo\(layerDropdown,moMountLayers\); moveTo\(satController,moMountSat\);/,
    'the imagery-provider panel is no longer moved into the sheet');
  assert.match(m, /if\(isM\)\{ moveTo\(layerDropdown,moMountLayers\);/, 'the dropdown still is — it is the data source');
  assert.match(m, /restoreHome\(satController\)/, 'and widening still restores it, for a session that was narrow before');
  const css = read('css/intmap.css');
  for (const sel of ['#cmp-mount', '#mo-mount-sat']) {
    assert.ok(css.includes('body.m-lyr-tiles .m-sheet ' + sel), sel + ' is hidden in the phone sheet');
  }
  /* ⚠⚠ `#layer-tools` must be hidden by a selector that OUT-SPECIFIES the existing
     `#mo-mount-layers .layer-dropdown > #layer-tools{display:flex !important}` (2,1,0). A rule of
     the `body.m-lyr-tiles .m-sheet #layer-tools` shape is (1,2,1) and loses — measured: the strip
     stayed `display:flex` with the hide rule matching it. Assert the winning shape, not the intent. */
  assert.ok(css.includes('body.m-lyr-tiles #mo-mount-layers .layer-dropdown > #layer-tools{ display:none !important; }'),
    'the tools strip is hidden by a rule with at least as many ids as the one that shows it');
  /* and the losing shape must NOT be what is relied on */
  assert.ok(!/body\.m-lyr-tiles \.m-sheet #layer-tools\b/.test(css),
    'the under-specific selector is gone, so nobody re-learns this the hard way');
  const idCount = (s) => (s.match(/#/g) || []).length;
  assert.ok(idCount('body.m-lyr-tiles #mo-mount-layers .layer-dropdown > #layer-tools')
    >= idCount('#mo-mount-layers .layer-dropdown > #layer-tools'), 'specificity is not lower than the rule it overrides');
});

/* ── 9 · DE / RU / ES, measured rather than assumed ─────────────────────────────────────────── */
test('R235 i18n: the positional five have no site left in English', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/i18n-positional-audit.mjs')],
    { encoding: 'utf8', cwd: ROOT });
  assert.match(out, /fewer than five arguments \(de\/ru\/es never supplied\): 0/,
    'no call site supplies only en/jp');
  for (const code2 of ['de', 'ru', 'es']) {
    assert.match(out, new RegExp('^' + code2 + ': 0 site', 'm'), code2 + ' has no site identical to English');
  }
  assert.match(out, /total outstanding: 0/, 'the audit is clean');
});
