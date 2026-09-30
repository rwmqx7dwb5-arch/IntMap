/* ============================================================================
 *  shell-sky-space-checks — the sky, the stars, the opening view and the space explorer
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r203-checks.test.mjs
 *  tests/r207-checks.test.mjs
 *  tests/r289-checks.test.mjs
 *  tests/r498-checks.test.mjs
 *  tests/r186-checks.test.mjs
 *  tests/r221-checks.test.mjs
 *  tests/r196-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { skyColour } from '../js/sky-model.js';
import { codeOnly } from '../scripts/code-only.mjs';
import { readLF } from '../scripts/eol.mjs';
import { appShell, asClassicScript } from './app-source.mjs';
import { capsSource, capabilityEntry } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R203 · from r203-checks.test.mjs ═══════════════════════ */
/* (#R203 — the round's own account of why these checks exist heads its other half, in tests/shell-launch-defaults-checks.test.mjs) */
{
const rd = read;

/* ── ③ THE MOON IS NOT INSIDE THE EARTH ────────────────────────────────────────────────────────
   Derived from js/space.js's own constants, so the test cannot drift from the file: at PERIGEE the
   Moon's model-scale separation must exceed the two model radii put together. */
/* spelling kept: browser script (js/space.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R203 ③ in model scale the Moon clears the Earth at perigee', () => {
  const src = rd('js/space.js');
  const num = (re, what) => { const m = re.exec(src); assert.ok(m, `js/space.js no longer states ${what}`); return Number(m[1]); };
  const POS_P = num(/const POS_P=([\d.]+)/, 'POS_P');
  const RAD_K = num(/RAD_K=([\d.]+)/, 'RAD_K');
  const MOON_K = num(/const MOON_K=([\d.]+)/, 'MOON_K');
  const MOON_REF = num(/MOON_REF_KM=(\d+)/, 'MOON_REF_KM');
  const radScale = (km) => RAD_K * Math.pow(km / 6378.137, 1 / 3);
  const sep = (km) => MOON_K * Math.pow(km / MOON_REF, POS_P);
  const rE = radScale(6378.137), rM = radScale(1737.4);
  assert.ok(sep(356500) > (rE + rM) * 1.5,
    `perigee separation ${sep(356500).toFixed(4)} against radii ${(rE + rM).toFixed(4)} — the Moon is inside the Earth`);
  /* and the old behaviour — compressing the HELIOCENTRIC distance — is what fused them */
  const POS_K = num(/POS_K=(\d+)/, 'POS_K');
  const old = POS_K * Math.pow(1 + 356500 / 149597870.7, POS_P) - POS_K * Math.pow(1, POS_P);
  assert.ok(old < rE + rM, 'the defect this fixes: the heliocentric compression really did fuse them');
  /* the Moon must be placed relative to the Earth in the scene, not from its own heliocentric radius */
  assert.match(src, /if\(id==='moon'&&pos\._moonGeo/, 'scenePos must special-case the Moon');
});

/* spelling kept: browser script (js/space.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R203 ③b the space explorer draws the app’s own Earth, and there is no second one', () => {
  const src = rd('js/space.js');
  assert.match(src, /IntMapWorldBase[\s\S]{0,80}url\(\)/, 'the Earth texture comes from js/world-base.js');
  assert.match(src, /data\/world-basemap\.jpg/, 'and falls back to the same bundled picture');
  /* the per-planet URL must no longer be reachable for the Earth: texUrl returns before it */
  const tu = src.slice(src.indexOf('function texUrl(id)'), src.indexOf('/* a 1×1 stand-in'));
  assert.match(tu, /if\(id==='earth'\)/, 'texUrl must answer for the Earth before the planets folder');
  assert.ok(tu.indexOf("id==='earth'") < tu.indexOf("'data/planets/'"), 'and it must answer FIRST');
  assert.ok(!fs.existsSync(path.join(ROOT, 'data/planets/earth.jpg')), 'and from the repository');
  /* the other worlds still come from where they always did */
  assert.ok(fs.existsSync(path.join(ROOT, 'data/planets/mars.jpg')));
  /* the crossing states a size in both directions */
  assert.match(src, /function mapGlobeRadiusPx/);
  assert.match(src, /function earthRadiusPx/);
  assert.match(src, /o\.match/, 'openView takes the size and face the map handed over');
});

/* ── ④ THE HORIZON DOES NOT FLICKER ─────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/geo-engine.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R203 ④ the far-plane override is never cleared by a zoom', () => {
  const ge = rd('js/geo-engine.js');
  const i = ge.indexOf('setHorizonReach(on)');
  assert.ok(i > 0, 'setHorizonReach is still there');
  const body = ge.slice(i, ge.indexOf('setCenterClamped(on)', i));
  assert.match(body, /shapeChanged\(tr,sph\)/, 'the clear is gated on the shape, not on the altitude');
  assert.match(body, /prisZoom/, 'the pristine plane is remembered with the zoom it was read at');
  /* the sphere rescales the cached plane by 2^Δzoom; the plane does not, and both are measured */
  assert.match(body, /sph \? pris\*Math\.pow\(2,\(tr\.zoom\|\|0\)-prisZoom\) : pris/);
  /* and the altitude alone must no longer be able to trigger a clear */
  assert.doesNotMatch(body, /if\(!\(force\|\|moved\)\) return;\s*\n\s*try\{ tr\.clearNearFarZOverride/,
    'an altitude change must not clear the override — that is the flicker');
});
}

/* ═══════════════════════ #R207 · from r207-checks.test.mjs ═══════════════════════ */
/* (#R207 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{
/* ── ⑩ the space view's own invariants ─────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/space.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R207 ⑩ space: the way back is the Earth\'s, the scale switch preserves framing, no emoji on the scale segments', () => {
  const s = read('js/space.js');
  assert.ok(/function atNearLimit\(\)\{\s*if\(!earthIsSubject\(\)\) return false;/.test(s),
    'the return-to-map gesture is armed only when the Earth is the subject');
  /* the framing, not the number, is what survives a scale change */
  /* (#R221) the window is longer: setScale now carries BOTH invariants — the AU distance far out and
     the focused body's apparent size close in — and blends them in log space, because neither one
     alone is what the reader is holding (DEV-NOTES #R221 §7). */
  /* (#R222) the window is longer again — the round wrote down why the frame edge is the invariant */
  const sc = s.slice(s.indexOf('function setScale('), s.indexOf('function setScale(') + 3000);
  /* ⚠ (#R219) INTENDED REPLACEMENT. #R207's invariant was the FRAMING (`dist / systemDist()`), which
     is right inside the planets and wrong outside them: at the model ceiling it lands the camera three
     orders of magnitude off (measured — DEV-NOTES #R219 §7). The two scales are two unit systems over
     the same physical space, so the quantity that survives is the distance in AU. */
  /* ⚠ (#R222) INTENDED REPLACEMENT, AGAIN, AND FOR THE SAME KIND OF REASON #R219 replaced #R207's.
     #R219's invariant was the CAMERA's distance in AU, which round-trips exactly and still moves the
     picture: what a reader calls the zoom level is what is IN FRAME, and the frame edge sits at
     dist·tan(fov/2) — a length the two scales map by different laws. So the quantity carried across
     is the real-space radius AT THE FRAME EDGE (DEV-NOTES #R222 §6). Both conversions still go
     through `auOfDist` / `posScale`; what changed is the length handed to them. */
  assert.ok(/auOfDist\(dist\*HALF_FRAME\)/.test(sc.replace(/\s/g, '')) && /posScale\(edgeAu\)/.test(sc),
    'setScale converts the FRAME EDGE through AU and back (#R222)');
  assert.ok(!/dist\*k/.test(sc), 'the framing ratio is what #R219 replaced — it must be gone');
  assert.ok(/Math\.max\(distFloor\(\),Math\.min\(distCeil\(\),d\)\)/.test(sc),
    'and the result is still clamped to the reach');
  /* 「実寸大とモデル大には絵文字を付けるな」 */
  const seg = s.slice(s.indexOf(".sp-scale\" data-s=\"real\"") >= 0 ? 0 : s.indexOf("class=\"sp-scale\""));
  const line = /<button class="sp-scale" data-s="real" style="'\+SEG\+'">([^']*)/.exec(s);
  assert.ok(line, 'the true-scale segment is declared');
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(line[1]), 'and carries no emoji');
  assert.ok(seg.length >= 0);
  /* the two new switches exist and are public */
  assert.ok(/setOrbits, setNames, orbits:\(\)=>showOrbits, names:\(\)=>showNames/.test(s),
    'orbits and place-name switches are part of the public surface');
  /* the Moon's line is drawn through the same placement the Moon uses */
  assert.ok(/function moonOrbitBuf\(jd\)/.test(s) && /scenePos\(p,'moon',\[0,0,0\]\)/.test(s),
    'the Moon\'s orbit is built from scenePos — one owner for "where is it"');
});

/* ── ⑪ the "keep zooming out" caption is placed in the MAP, and wears a pill ───────────────────── */
/* spelling kept: browser script (js/space.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R207 ⑪ the space-approach caption is centred on the visible map and has its own surface', () => {
  const s = read('js/space-approach.js') + read('js/space.js');
  assert.ok(/function mapMidX\(\)/.test(s), 'the midpoint is measured');
  assert.ok(/g\.style\.left=Math\.round\(mapMidX\(\)\)\+'px'/.test(s), 'and applied every time it is shown');
  assert.ok(!/position:fixed;left:50%;bottom:96px/.test(s), 'the absolute viewport centre is gone');
  assert.ok(/border-radius:999px/.test(s) && /var\(--card-bg/.test(s),
    'it is a pill on the app surface, so it reads in light mode as well as dark');
});
}

/* ═══════════════════════ #R289 · from r289-checks.test.mjs ═══════════════════════ */
/* (#R289 — the round's own account of why these checks exist heads its other half, in tests/shell-data-layers-checks.test.mjs) */
{
const read = (p) => readLF(resolve(ROOT, p));

/* ── ⑩ THE FLAT MAP DOES NOT LEAD TO SPACE ──────────────────────────────────────────────────
   「Flat地図では、ズームし続ければ宇宙へ行く機能を無効に。」 The crossing hands the space camera the
   size and the FACE the Earth had on screen, which is a statement about a sphere. */
/* spelling kept: browser script (js/space.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R289 ⑩ the zoom-out crossing is refused on the flat projection, gauge and all', () => {
  const s = read('js/space-approach.js') + read('js/space.js');
  assert.match(s, /function flatProj\(\)\{ try\{ return HOST\.proj!=='globe'; \}catch\(_\)\{ return false; \} \}/,
    'the projection is asked through the host, and an error is not "flat"');
  assert.match(s, /function pushOut\(dz\)\{\r?\n\s+if\(flatProj\(\)\)\{ if\(over\)\{ over=0; paintGauge\(0\); \} return; \}/,
    'the refusal must be the FIRST thing pushOut does, and it must clear the gauge with it');
  /* ⚠ the way BACK is untouched: a session already in space that switches to flat can still leave */
  assert.ok(!/function pushIn\(dz\)\{\r?\n\s+if\(flatProj\(\)\)/.test(s), 'pushIn must not be gated — that would trap the reader');
});
}

/* ═══════════════════════ #R498 · from r498-checks.test.mjs ═══════════════════════ */
/* (#R498 — the round's own account of why these checks exist heads its other half, in tests/shell-map-input-checks.test.mjs) */
{
const R = (p) => readLF(join(ROOT, p));
const CODE = (p) => codeOnly(R(p));

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ THE ATMOSPHERE IS STILL EXACT WHEN THE MAP STOPS
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R498 ⑥ js/sky-model.js is a pure function of its arguments — which is what the memo rests on', () => {
  const a = skyColour(12.5, 1800, 47.25, 3.5);
  const b = skyColour(12.5, 1800, 47.25, 3.5);
  assert.equal(a.hex, b.hex, 'the same camera gave two different skies — the model is not memoisable');
  assert.notEqual(skyColour(12.5, 1800, 47.25, 3.5).hex, skyColour(4.0, 1800, 47.25, 3.5).hex,
    'a nine-degree change in the Sun did not move the sky — the memo key would be hiding real motion');
});

/* spelling kept: browser script (js/theme-sky.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R498 ⑥ the sky follower does the cheap per-frame work first and gates only the two integrals', () => {
  const t = CODE('js/theme-sky.js');
  const foll = t.slice(t.indexOf('function _skyFollowCamera()'));
  const end = foll.indexOf('_applySkyAtmosphere(HOST.mapType===');
  const body = foll.slice(0, end);

  /* #R234's / #R241's / #R240's per-frame work must still be unconditional, and must come FIRST */
  const iLimb = body.indexOf('_limbOwnsRim()');
  const iAir = body.indexOf('_airAtZoom(');
  const iAim = body.indexOf('_aimSun._at');
  const iCol = body.indexOf('_skyColoursNow()');
  assert.ok(iLimb > 0 && iAir > 0 && iAim > 0, 'the cheap per-frame work left the follower');
  assert.ok(iCol > iLimb && iCol > iAir && iCol > iAim,
    'the two scattering integrals still run before the cheap work they were meant to stop delaying');

  assert.match(body, /window\.__imGesture/,
    'the integrals are not gated on the gesture — they run 60 times a second through every drag');
  assert.match(t, /function _skyColoursNow\(\)/, 'the memo is gone');
  assert.match(t, /_sunElevAtCentre\(\)\+'\|'\+_eyeAltM\(\)\+'\|'\+_relAzimuth\(\)/,
    'the memo key no longer names all three inputs — a stale colour could survive a real camera move');
  /* #R227's comparison is untouched */
  assert.match(body, /limb===_applySkyAtmosphere\._limb/, 'who owns the rim is still compared');
});
}

/* ═══════════════════════ #R186 · from r186-checks.test.mjs ═══════════════════════ */
/* (#R186) Node-side checks for this round's changes that do not need a browser.
 *
 * Each one pins a decision that was made from a MEASUREMENT — a published astronomical value, a
 * probe of a live API, a read of the bundled data — so the test states the measurement rather than
 * the code. The browser half is tests/r186.spec.js. */
{
/* (layer-manifest) the lists are views of js/layer-manifest.js */

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n')
  : fs.readFileSync(path.join(ROOT, p), 'utf8'));
const bytes = (p) => fs.readFileSync(path.join(ROOT, p));

/* ── the bundled sky ─────────────────────────────────────────────────────────────────────────── */

test('R186 stars: the bundled catalogue is a real all-sky bright-star list', () => {
  const b = bytes('data/stars.bin');
  /* ⚠ (#R208) THE FORMAT IS A VERSION, NOT A CONSTANT. IMSTAR2 added the measured parallax as two
     more bytes per star (scripts/build-star-catalogue.mjs), so pinning 'IMSTAR1' and a 6-byte stride
     pinned the SHAPE where the claim is 'this is a real all-sky catalogue whose length agrees with
     its own count'. The stride is derived here exactly as both readers derive it. */
  const magic = b.slice(0, 7).toString('latin1');
  assert.match(magic, /^IMSTAR[12]$/, 'header');
  const STRIDE = magic === 'IMSTAR2' ? 8 : 6;
  const n = b.readUInt32LE(8);
  assert.equal(b.length, 12 + n * STRIDE, 'the record count and the file length must agree');
  /* The Bright Star Catalogue holds ~9,100 stars to V≈6.5 — the naked-eye sky. Far fewer than that
     would be a truncated download rather than a sky.
     (#R187) The shipped catalogue is HIPPARCOS now (~98,900 to V 9.5): the naked-eye sky measured
     0.16 % lit pixels behind the globe, i.e. black, and no brightness curve fixes a star COUNT. BSC
     is still the build's fallback, so the floor stays where it was and the source may be either. */
  assert.ok(n >= 5000, `only ${n} stars — that is not an all-sky catalogue`);
  const manifest = JSON.parse(read('data/stars.json'));
  assert.equal(manifest.count, n);
  assert.equal(manifest.epoch, 'J2000.0');
  assert.match(manifest.source, /Hipparcos|Bright Star Catalogue/i);
});

test('R186 stars: named stars are where the catalogue says they are', () => {
  /* Published J2000 positions and V magnitudes. If the byte layout or the quantisation ever drifts,
     Sirius stops being at 6h45m and this fails — which is the only way to know the sky is the real
     sky and not a plausible-looking scatter. */
  const b = bytes('data/stars.bin');
  const n = b.readUInt32LE(8);
  const STRIDE = b.slice(0, 7).toString('latin1') === 'IMSTAR2' ? 8 : 6;
  const at = (i) => ({
    ra: b.readUInt16LE(12 + i * STRIDE) * 360 / 65536,
    dec: b.readInt16LE(14 + i * STRIDE) * 90 / 32767,
    v: b.readUInt8(16 + i * STRIDE) / 20 - 2,
    bv: b.readInt8(17 + i * STRIDE) / 50,
  });
  /* ⚠ (#R187) B−V IS A MEASUREMENT, AND TWO CATALOGUES CAN MEASURE IT DIFFERENTLY. Betelgeuse is a
     semiregular variable: the Bright Star Catalogue lists B−V 1.85, Hipparcos measured 1.50, and
     both are real values for the same star. The build ships whichever source answered, so the
     acceptable values are listed rather than one being declared correct. Position and V magnitude
     stay strict — those are what prove the byte layout and the quantisation are intact. */
  const known = [
    ['Sirius', 101.287, -16.716, -1.46, [0.00]],
    ['Vega', 279.234, 38.784, 0.03, [0.00]],
    ['Arcturus', 213.915, 19.182, -0.05, [1.23]],
    ['Betelgeuse', 88.793, 7.407, 0.45, [1.85, 1.50]],
    ['Polaris', 37.954, 89.264, 1.97, [0.60]],
  ];
  for (const [name, ra, dec, v, bvs] of known) {
    let best = null, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const s = at(i);
      const d = Math.hypot((s.ra - ra) * Math.cos(dec * Math.PI / 180), s.dec - dec);
      if (d < bd) { bd = d; best = s; }
    }
    /* 30 arcsec is far coarser than the 20 arcsec quantisation and far finer than any mix-up */
    assert.ok(bd * 3600 < 30, `${name}: nearest catalogue star is ${(bd * 3600).toFixed(1)}" away`);
    assert.ok(Math.abs(best.v - v) < 0.12, `${name}: V ${best.v.toFixed(2)} vs ${v}`);
    assert.ok(bvs.some((bv) => Math.abs(best.bv - bv) < 0.06),
      `${name}: B-V ${best.bv.toFixed(2)} matches none of ${bvs.join(' / ')}`);
  }
});

/* js/space-sky.js publishes window.IntMapSky and reads nothing else at load time, which is what
   makes its astronomy testable without a browser. */
const sky = (() => {
  const ctx = { window: {}, document: { baseURI: 'http://x/' }, requestAnimationFrame: () => 0, setInterval: () => 0 };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(asClassicScript(read('js/space-sky.js')), ctx);
  return ctx.window.IntMapSky;
})();

test('R186 sky: sidereal time matches the published value at J2000.0', () => {
  /* GMST at 2000-01-01 12:00 UT is 18h 41m 50.548s = 280.46062°. This ONE number decides where the
     whole sky is drawn; if it is wrong, every constellation is in the wrong place by the same angle
     and nothing else in the app would notice. */
  const g = sky.gmstDeg(Date.UTC(2000, 0, 1, 12, 0, 0));
  assert.ok(Math.abs(g - 280.46062) * 3600 < 1, `GMST(J2000) = ${g}°, expected 280.46062°`);
});

test('R186 sky: the Sun is on the equator at an equinox and at the obliquity at a solstice', () => {
  /* Two facts about the real Sun that no plausible-looking approximation gets right by accident. */
  const eq = sky.sunPosition(Date.UTC(2026, 2, 20, 14, 46, 0));   /* March 2026 equinox */
  assert.ok(Math.abs(eq.dec) < 0.05, `equinox declination ${eq.dec}°`);
  const sol = sky.sunPosition(Date.UTC(2026, 5, 21, 8, 25, 0));   /* June 2026 solstice */
  assert.ok(Math.abs(sol.dec - 23.44) < 0.06, `solstice declination ${sol.dec}°`);
  /* the Sun's disc is half a degree wide, and it is drawn at that size */
  assert.ok(sol.angularDiamDeg > 0.52 && sol.angularDiamDeg < 0.55, `angular diameter ${sol.angularDiamDeg}°`);
});

test('R186 sky: B−V produces real star colours', () => {
  /* Blue stars must come out blue and red stars red — the colour is a measurement, not a palette. */
  const blue = sky.bvToRGB(-0.03);   /* Vega / Rigel class */
  const red = sky.bvToRGB(1.85);     /* Betelgeuse */
  assert.ok(blue[2] >= blue[0], 'a B−V of −0.03 must not be redder than it is blue');
  assert.ok(red[0] > red[2] + 40, 'a B−V of 1.85 must be clearly red');
});

/* spelling kept: browser script (js/theme-sky.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R186 the atmosphere yields to whoever owns the sky more specifically', () => {
  /* Measured: switching the basemap during a flight cleared the simulator's own cockpit sky to
     undefined (tests/r174 «the renderer's own sky is what a cockpit sees»). A window with a pilot in
     it, and the sun-and-shadow simulator studying one particular moment, are both more specific
     requests than "the satellite view has an atmosphere". */
  /* (#R199) the sky and everything that decides its colour live in js/theme-sky.js now. */
  const src = read('js/theme-sky.js');
  assert.match(src, /function _skyIsOwnedElsewhere\(\)/);
  assert.match(src, /IntMapFlightSim; if\(FS&&FS\.active&&FS\.active\(\)\) return true/);
  assert.match(src, /if\(!GE\(\)\.hasRenderer\(\)\|\|_skyIsOwnedElsewhere\(\)\) return;/, 'the guard has to be on the way IN, not only on the restore');
  assert.match(src, /function _sunSimOwnsLight\(\)/, 'and the sun simulator keeps the light it aimed');
});

/* spelling kept: browser script (js/geo-engine.js, js/space-sky.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R186 engine contract: the sky asks the renderer, it does not re-derive it', () => {
  const ge = read('js/geo-engine.js'), ss = read('js/space-sky.js');
  assert.match(ge, /viewFrame\(\)\{/, 'the frame a point at infinity is projected with');
  assert.match(ge, /setSunDirection\(o\)\{/, 'the sun, stated without a convention');
  /* space-sky must not name the renderer — scripts/engine-coupling.mjs gates that, and this says why */
  assert.ok(!/maplibregl|mapboxgl/.test(ss), 'js/space-sky.js must reach the renderer only through the contract');
});
}

/* ═══════════════════════ #R221 · from r221-checks.test.mjs ═══════════════════════ */
/* (#R221 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n')
  : readFileSync(join(ROOT, p), 'utf8'));

/* ── ③ DAY/NIGHT IS A PROPERTY OF THE SATELLITE BASEMAP ──────────────────────────────────────
   #R220 gated the LAYERS; the Sun-aimed light, the horizon colour and the sky colour were not
   gated, and those are the other three things that darken the globe by the Sun. */
/* spelling kept: browser script (js/theme-sky.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R221 ③ the sun-aimed light and the sky both stand down on the vector map', () => {
  const ts = read('js/theme-sky.js');
  assert.ok(/_satelliteUp\s*\(\s*\)/.test(ts), 'theme-sky must ask whether the satellite basemap is up');
  assert.ok(/getLayout\('layer-sat','visibility'\)/.test(ts),
    'it must be the SAME question js/night-side.js asks, or the two can disagree');
  const i = ts.indexOf('function _nightSideOff');
  assert.ok(i > 0);
  assert.ok(ts.slice(i, i + 320).includes('!_satelliteUp()'),
    '_nightSideOff must be true when the basemap is not satellite');
});

/* ── ④ THE SKY MODEL'S MIE TERM IS ATTENUATED PER CHANNEL ────────────────────────────────────
   A scalar there injects neutral haze attenuated through green, which is the olive horizon. */
test('#R221 ④ Mie in-scattering carries a per-channel optical path', async () => {
  const src = read('js/sky-model.js');
  assert.ok(/const sumM = \[0, 0, 0\]/.test(src), 'sumM must be a 3-vector, not a scalar');
  assert.ok(/sumM\[k\] \+= hm \* a/.test(src), 'each channel must use its OWN attenuation');
  assert.ok(!/if \(k === 1\) att1 = a/.test(src), 'the green-channel shortcut must be gone');

  const { skyColour } = await import('../js/sky-model.js');
  /* looking INTO a low Sun must be warm — red above blue. With the scalar bug this was olive. */
  const at = skyColour(2, 0, 0, 3).rgb;
  assert.ok(at[0] > at[2], `a sunset looked at should be warm, got rgb(${at})`);
  /* …and the same Sun looked AWAY from must be darker than looked at */
  const away = skyColour(2, 0, 180, 3).rgb;
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(lum(at) > lum(away), 'the sky toward the Sun must be brighter than the sky away from it');
  /* the #R202 Cesium calibration must survive: the noon sample stays close to [85,112,130] */
  const noon = skyColour(60, 0, 90, 55).rgb;
  assert.ok(Math.abs(noon[0] - 85) < 25 && Math.abs(noon[1] - 112) < 25,
    `#R202's noon calibration moved too far: rgb(${noon})`);
  assert.ok(noon[2] > noon[1] && noon[1] > noon[0], 'a noon sky must be blue-dominant');
});

/* ── ⑤ THE SPACE VIEW ─────────────────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/space.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R221 ⑤ zooming in with a probe selected cannot enter a planet body view', () => {
  const sp = read('js/space.js');
  const i = sp.indexOf('function autoMode()');
  assert.ok(i > 0);
  const body = sp.slice(i, i + 500);
  assert.ok(/craftSel\|\|smallSel/.test(body),
    'autoMode must not cross into body mode while a spacecraft or small body is the selection');
});

/* spelling kept: browser script (js/space.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R221 ⑤ the scale switch preserves what the picture is of', () => {
  const sp = read('js/space.js');
  const i = sp.indexOf('function setScale(');
  assert.ok(i > 0);
  const body = sp.slice(i, i + 2200);
  assert.ok(/focusRadius\(\)/.test(body), 'the switch must know the focused body\'s drawn radius');
  assert.ok(/byRadii/.test(body) && /byAu/.test(body), 'both invariants must be present');
  assert.ok(/Math\.exp\(\s*w\s*\*\s*Math\.log\(byRadii\)/.test(body), 'they must be blended in log space');
  /* a probe has no radius, so the AU rule must be the only one that applies to it */
  const fr = sp.indexOf('function focusRadius()');
  assert.ok(fr > 0 && sp.slice(fr, fr + 220).includes('craftSel||smallSel'),
    'a selected point object must report no radius, or the blend frames the wrong thing');
});

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('#R221 ⑤ the phone body list is a sheet, not an 8,463 px corridor', () => {
  const sp = read('js/space.js');
  assert.ok(/sp-sidebox/.test(sp) && /sp-bodyb/.test(sp) && /sp-sidef/.test(sp),
    'the chip, the sheet and the filter must all exist');
  assert.ok(/function applySideFilter/.test(sp), 'a 106-row list needs a filter');
  const css = read('css/intmap.css');
  assert.ok(/#space-view \.sp-sidebox\{ display:contents; \}/.test(css),
    'the wrapper must be display:contents on a pointer machine so the desktop column is unchanged');
  assert.ok(!/flex-direction:row !important;[\s\S]{0,80}#space-view \.sp-side/.test(css),
    'the old horizontal strip rule must be gone');
});
}

/* ═══════════════════════ #R196 · from r196-checks.test.mjs ═══════════════════════ */
/* (#R196 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{
const rd = read;

/* spelling kept: browser script (js/theme-sky.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R196 ③b the sky is set for EVERY basemap, and set3D no longer fights it', () => {
  const shell = appShell(new URL('../', import.meta.url));
  /* (#R199) the sky itself moved to js/theme-sky.js — one coherent subject, taken out of app-body
     whole. set3D stayed behind, so the "one owner" claim is still asked of the shell; the sky's own
     declarations are now asked of the file that holds them, which is stricter than searching a
     concatenation. The satellite-only gate must be absent from BOTH. */
  const sky = rd('js/theme-sky.js');
  assert.doesNotMatch(shell, /if\(currentProj!=='globe'\)\{ try\{ GE\(\)\.scene\.setSky/,
    'set3D must not install a second sky — one owner (#R196)');
  /* ⚠ (#R213) THE PIN MOVED FROM THE LITERAL TO THE CLAIM. This asserted the string `0.55`, which is
     the value #R196 measured AT GROUND LEVEL — but the claim it was standing in for is "the
     atmosphere band is declared, and it is as thick as the Cesium capture showed". #R213 made the
     thickness fall off with the camera's height (the shell subtends less of the view from orbit), so
     the literal is gone while the measurement it encoded is not: `_horizonBlend()` still returns
     0.55 at h = 0. Pinning the literal here would have failed a change that preserves the finding —
     the #R203 trap of writing the previous round's value instead of its meaning. */
  /* ⚠ (#R221) THE PIN MOVED ONE STEP FURTHER — FROM THE SOURCE LINE TO ITS PARTS. #R213's own note
     above says the claim is "the band is as thick as the Cesium capture showed", and then pinned the
     literal early-return line, which #R221 had to change when the thickness gained its other physical
     term: a sunset packs the glow into the first few degrees, a noon spreads it over the whole band.
     The finding is preserved and is asserted AS a finding — the height term #R213 measured is still
     the base, and the Sun term is NORMALISED to the reference condition #R196 measured at, so that
     condition still returns 0.55. */
  assert.match(sky, /'sky-horizon-blend':_horizonBlend\(\)/, 'the atmosphere band is declared');
  assert.match(sky, /function _horizonBlend\(\)/, 'and it is a function of the camera and the Sun');
  assert.match(sky, /0\.14\+0\.41\*frac/, 'the height term #R213 measured is still the base');
  assert.match(sky, /Math\.sqrt\(r\/_HB_REF\)/, 'and at ground level it is still the 0.55 #R196 measured');
  /* ⚠⚠ (#R223) AND SUPERSEDED BACK, AT THE READER'S EXPLICIT INSTRUCTION.
     「衛星画像で地平線付近を白い靄で見えなくするな。クソ機能つけるな。」(confirmed: on every basemap.)
     #R196 pinned the fog OFF; #R216 put aerial perspective back and argued the physics correctly;
     #R223 measured the picture and took it out again. `fog-ground-blend` is not "how strong" but
     WHERE ALONG THE GROUND the wash starts, so 0.62 painted the pale horizon colour across the far
     third of the screen — over the satellite imagery the reader opened. What #R196 protected is
     protected again, and from ONE place. */
  assert.match(sky, /'fog-ground-blend':fg\.ground/, 'the pair still comes from _aerial(), not from literals');
  assert.match(sky, /function _aerial\(\)\{ return \{ ground:1, horizon:0 \}; \}/, 'off at every altitude');
  assert.ok(!/ground:\+\(1-[\d.]+\*f\)/.test(sky), 'no altitude ramp may bring the wash back (#R174)');
  /* the horizon colour follows the Sun, so it cannot be a constant */
  assert.match(sky, /function _horizonColour\(\)/);
  assert.match(sky, /function _sunElevAtCentre\(\)/);
  /* …and the early return that made this satellite-only is gone */
  assert.doesNotMatch(shell + sky, /if\(!sat\)\{ if\(_applySkyAtmosphere\._on\)/, 'the satellite-only gate is gone');
});

/* ── ④ THE NIGHT SIDE ──────────────────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/night-side.js, src/main.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R196 ④ the night side is a zoom expression, and builds nothing until it would be visible', () => {
  const n = rd('js/night-side.js');
  /* ⚠ the defect that shipped in the first version: a zoom expression may only be the OUTERMOST
     one, and addLayer swallows the rejection, so the layer silently did not exist */
  assert.doesNotMatch(n, /\['\*',\['get','a'\],RAMP\]/, 'no zoom expression nested inside another');
  assert.match(n, /const ramp=\(k\)=>\['interpolate',\['linear'\],\['zoom'\]\]/, 'the scale multiplies the STOPS');
  /* ⚠ (#R201) the rejection is now CAUGHT AND ANSWERED rather than caught and abandoned: the polar
     cap's opacity is data-driven, so if MapLibre ever refuses that form the layer is re-added with a
     plain ramp instead of the night side losing its poles. The property is the same one — addLayer
     swallows a rejected paint expression, so the layer is READ BACK. */
  assert.match(n, /if\(!GE\(\)\.layers\.has\(LYR\)\)\{[\s\S]{0,120}?lastErr='cap-expression';/,
    'a rejected paint expression is detected, and answered with a form that cannot be rejected');
  /* (#R220) …and a failed read-back now UNMAKES what it built: the polar fan on its own is a black
     disc on the pole, which is what seven rounds of that report turned out to be. */
  assert.match(n, /if\(!GE\(\)\.layers\.hasDynamicImage\(DYN\)\)\{[^}]*destroy\(\); return false; \}/,
    'and the image — which now carries the whole effect — is read back too');
  assert.match(n, /imageRowLatitudes/, 'the lights image is placed through the engine’s row→latitude map (#R195)');
  /* ⚠⚠ (#R228) THIS PINNED THE LINE, SO IT PINNED THE DEFECT. It asserted the exact text
     `if(zoomNow()>ZMAX+0.4){ return; }` — a bare `return` — and that bare return WAS the bug: the
     guard stopped the layers being built above the ramp and never removed ones already built, so on
     every cold load (the app opens at z1.7, inside the ramp) both full-screen layers survived every
     zoom the reader actually uses. A test that pins this round's characters cannot survive next
     round's fix; the check is the RELATIONSHIP (#R198). */
  const guard = n.match(/if\s*\(\s*zoomNow\(\)\s*>\s*ZMAX[^)]*\)\s*\{[^}]*\}/);
  assert.ok(guard, 'the camera-width guard is still there');
  assert.match(guard[0], /return/, 'nothing is BUILT until the camera is wide enough');
  assert.match(guard[0], /destroy\(\)/,
    'and nothing is LEFT BUILT once it is not — above the ramp the layers are torn down (#R228)');
  /* …and the GIBS request is not on the boot path — the app opens at zoom 1.7 */
  assert.match(n, /requestIdleCallback\(_lights,\{timeout:6000\}\)/, 'the city lights wait for the first idle');
  /* ⚠ MapLibre ONLY — measured: whole-globe clamped-to-ground polygons stopped Cesium's camera
     outright (tests/r182-cesium ③ passed on main, failed here, passed again with this switched off),
     and Cesium does not need them: its globe has real solar lighting, driven by the same
     setSunDirection() call this round now makes for every basemap. */
  assert.match(n, /function engineIsMapLibre\(\)/, 'the engine is checked');
  assert.match(n, /if\(!engineIsMapLibre\(\)\) return false;/, 'build() refuses on a second engine');
  assert.match(n, /if\(!enabled\|\|!engineIsMapLibre\(\)\) return;/, 'and so does the moveend hook');
  assert.ok(existsSync(join(ROOT, 'js/night-side.js')));
  assert.ok(rd('src/main.js').includes("import '../js/night-side.js';"), 'the entry imports it');
});

/* ── ⑤b ATLAS DRIVES IT ───────────────────────────────────────────────
   STANDING: every feature is operable from Atlas. ⚠ #R115's lesson is that an action parameter the SYS
   catalogue does not mention DOES NOT EXIST to the planner — so all three places are checked. */
/* spelling kept: browser script (js/atlas-console.js, js/atlas-catalog-text.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R196 ⑤b the night side is an Atlas action, in the dispatch AND in the catalogue', () => {
  /* (#R318) …plus js/atlas-catalog-text.js, where the action catalogue lives now. */
  const a = (rd('js/atlas-console.js') + '\n' + capsSource()) + '\n' + rd('js/atlas-catalog-text.js');
  assert.ok(capabilityEntry('nightSide'), 'the dispatch handles it');
  assert.match(a, /window\.IntMapNightSide\.setEnabled\(want\)/, 'and really drives the module');
  assert.match(a, /nightSide:\{ lbl:\(\)=>L\('Night side of the Earth'/, 'it is a listed on/off surface');
  assert.match(a, /\{"type":"nightSide","on":bool\}/, 'and the SYS catalogue declares it');
});
}
