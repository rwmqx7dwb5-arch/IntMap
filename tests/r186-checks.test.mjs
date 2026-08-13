/* (#R186) Node-side checks for this round's changes that do not need a browser.
 *
 * Each one pins a decision that was made from a MEASUREMENT — a published astronomical value, a
 * probe of a live API, a read of the bundled data — so the test states the measurement rather than
 * the code. The browser half is tests/r186.spec.js. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();

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
  vm.runInContext(read('js/space-sky.js'), ctx);
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

/* ── the bundled whole-Earth base ────────────────────────────────────────────────────────────── */

test('R186 world base: the shipped picture is a 2048x1024 equirectangular JPEG', () => {
  const b = bytes('data/world-basemap.jpg');
  assert.ok(b[0] === 0xff && b[1] === 0xd8, 'JPEG SOI');
  let w = 0, h = 0;
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  assert.equal(w, 2048); assert.equal(h, 1024);
  /* It has to be small enough to be there before the first frame — that is the whole point of it. */
  assert.ok(b.length < 600_000, `${b.length} bytes is too heavy for a no-wait base`);
  const m = JSON.parse(read('data/world-basemap.json'));
  assert.deepEqual(m.bbox, [-180, -90, 180, 90], 'it must reach the poles — that is what Mercator cannot do');
  assert.match(m.source, /NASA/i);
});

/* ── the decisions that were made from measurements ──────────────────────────────────────────── */

test('R186 aircraft: the sweep is paced to what the feed actually tolerates', () => {
  const src = read('js/data-layers.js');
  /* Probed against the live API: four-at-a-time lost 9 of 20 requests to bare connection failures,
     while 14 consecutive requests spaced 1.2 s apart all succeeded and the block lifted after 30 s
     of quiet. These three constants ARE that measurement. */
  assert.match(src, /PLANE_GAP_MS\s*=\s*1200\b/, 'the 1.2 s spacing is the measured sustainable pace');
  assert.match(src, /PLANE_CIRCLE_NM\s*=\s*250\b/, '250 nm is the API maximum (300 answers 403)');
  /* (#R187) the floor and the cap moved again with the wider budget — see tests/r187-checks */
  assert.match(src, /PLANES_MIN_ZOOM\s*=\s*2\b/, 'the tiled sweep lowered the floor from z5 to z3 to z2');
  assert.ok(/PLANE_MAX_AIRCRAFT\s*=\s*50000\b/.test(src), 'the count cap is no longer one circle wide');
  /* concurrency must be gone — a parallel sweep is what tripped the block */
  assert.ok(!/PLANE_CONCURRENCY/.test(src), 'the sweep must be sequential');
});

test('R186 sea level: nothing between the ramp and the opacity slider', () => {
  const src = read('js/data-layers.js');
  const m = /const cand=\[(.*?)\];/s.exec(src);
  assert.ok(m, 'the sea-level ramp candidates must still be one literal');
  /* Every FLOODED stop has to be fully opaque, or the slider can never reach 100 % — which is
     exactly what was reported. Only the two land-side stops may be transparent. */
  const stops = [...m[1].matchAll(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/g)].map(x => +x[4]);
  const opaque = stops.filter(a => a === 1).length;
  const clear = stops.filter(a => a === 0).length;
  assert.equal(opaque + clear, stops.length, 'a sea-level ramp stop must be fully opaque or fully clear');
  assert.ok(opaque >= 4 && clear >= 2, `ramp alphas: ${stops.join(',')}`);
});

test('R186 widgets: no ambient shadow around a widget card', () => {
  const src = read('js/widgets.js');
  for (const rule of src.split('+').filter(s => /\.wgt-card/.test(s) && /box-shadow/.test(s))) {
    const bs = /box-shadow:([^;}]*)/.exec(rule);
    if (!bs) continue;
    /* an `inset` shadow is the glass edge INSIDE the card; anything else is the halo that was asked
       to go away. Split on commas OUTSIDE the rgba() parentheses — a naive split cuts the colour up. */
    const parts = bs[1].replace(/rgba?\([^)]*\)/g, (c) => c.replace(/,/g, ''));
    for (const raw of parts.split(',')) {
      const part = raw.replace(//g, ',').trim();
      if (!part) continue;
      assert.match(part, /inset/, `outer shadow still on a widget card: ${part}`);
    }
  }
});

test('R186 defaults: Köppen and the submarine cables are named once, and read by three places', () => {
  /* (#R200) the reader is js/session-tabs.js now — the session block left js/app-body.js for its own
     real ES module. Asked of that file directly rather than of a concatenation: stricter, because a
     third move would have to say so here. */
  const dl = read('js/data-layers.js'), ab = read('js/session-tabs.js');
  assert.match(dl, /window\.IntMapDefaultLayers\s*=\s*\['dl-climate','dl-subcables'\]/);
  assert.ok(/IntMapDefaultLayers/.test(ab), 'the session block must read the same list');
  /* …and the session restore must be able to turn one OFF again, or "default on" becomes "stuck on" */
  assert.match(ab, /defOff/, 'the restore has to switch a default-on layer back off when the session says so');
});

test('R186 launch screen: static markup, the real icon, and a failsafe', () => {
  const html = read('index.html');
  assert.match(html, /id="boot-splash"/, 'the splash must be in the HTML, not injected by JS');
  assert.match(html, /IntMap\.Icon\.png/, 'it must use the app icon');
  assert.ok(html.indexOf('id="boot-splash"') < html.indexOf('class="operation-room"'),
    'the splash has to be parsed before the app it covers');
  assert.match(html, /window\.__imBoot\s*=/, 'the milestone API');
  assert.match(html, /no ready signal after 20 s/, 'a launch screen that cannot be dismissed is worse than none');
  const icon = bytes('IntMap.Icon.png');
  assert.ok(icon[1] === 0x50 && icon[2] === 0x4e && icon[3] === 0x47, 'PNG');
  assert.ok(icon.length < 300_000, `${icon.length} bytes delays the very first paint`);
  assert.equal(icon.readUInt32BE(16), icon.readUInt32BE(20), 'an app icon is square');
  /* the splash styles must be in the render-blocking stylesheet, so it paints in the first frame */
  assert.match(read('css/intmap.css'), /\.boot-splash\{/);
});

test('R186 i18n: every new string exists in every registered language', () => {
  /* ⚠ (#R223) EVERY REGISTERED LANGUAGE, not the number five — a sixth (zh) landed and this
     assertion was about coverage. `LANGS` is the one list (js/lang-registry.js). */
  const NL = (read('js/locales/_langs.js').split('IntMapLangBeta')[0].match(/"[a-z-]+"/g) || []).length;   /* (#R232) the GENERATED language list — the registry's rows stopped being the list when a language became one file */
  const src = read('js/i18n.js');
  for (const key of ['poiLabels', 'planesAreaHint']) {
    const n = [...src.matchAll(new RegExp(key + ':"', 'g'))].length;
    assert.equal(n, NL, `${key} is in ${n} languages, not ${NL}`);
  }
});

test('R186 water: the solver states its model, and the tracer states its endings', () => {
  const src = read('js/terrain-water.js');
  assert.match(src, /MFD_P\s*=\s*1\.1/, 'Freeman multiple-flow-direction exponent');
  assert.match(src, /model:'priority-flood \+ MFD/, 'the result must say what model produced it');
  assert.match(src, /LAKE_STOP_M\s*=\s*25/, 'a basin deeper than this stops the water');
  /* the sea test cannot be an elevation test — Death Valley proved that */
  assert.match(src, /function seaCheck/);
  assert.match(src, /fraction/, 'the sea test needs the area fraction as well as edge contact');
  for (const end of ['sea', 'sink', 'lake', 'loop', 'flat', 'nodata', 'tiles']) {
    assert.ok(src.includes(`case '${end}'`) || src.includes(`end='${end}'`), `the ending '${end}' must be reachable and labelled`);
  }
});

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

test('R186 water: DEM roughness is not a pond', () => {
  /* Raising the grid 256 → 384 made every one-cell dip qualify as a depression; tests/r176 measured
     a 1-cell "basin" of 993 m³ and 0.43 m on ground that is flat. A pond is WIDE or DEEP. */
  assert.match(read('js/terrain-water.js'),
    /if\(cells\.length<3&&\(spill-surf\[cells\[0\]\]\)<1\.0\)\{ cells\.forEach\(c=>\{ depId\[c\]=-1; \}\); continue; \}/);
});

test('R186 engine contract: the sky asks the renderer, it does not re-derive it', () => {
  const ge = read('js/geo-engine.js'), ss = read('js/space-sky.js');
  assert.match(ge, /viewFrame\(\)\{/, 'the frame a point at infinity is projected with');
  assert.match(ge, /setSunDirection\(o\)\{/, 'the sun, stated without a convention');
  /* space-sky must not name the renderer — scripts/engine-coupling.mjs gates that, and this says why */
  assert.ok(!/maplibregl|mapboxgl/.test(ss), 'js/space-sky.js must reach the renderer only through the contract');
});
