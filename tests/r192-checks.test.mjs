/* ============================================================================
 *  R192 — the contracts this round established, checked against the source.
 *  (The pixel/renderer half is tests/r192.spec.js.)
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── 1 · the aircraft mark is the SAME NUMBER OF PIXELS in both renderings ───────────────────── */
test('R192 aircraft: one size ramp, read by the glyph and by the lifted body', () => {
  const s = read('js/data-layers.js');
  /* the ramp is stated ONCE — the defect was two independent numbers that drifted */
  /* (#R247) the same three stops, scaled 1.25x — see tests/r187-checks. What this file pins is that
     there is exactly ONE table and that both renderings read it, which is unaffected by its scale. */
  assert.match(s, /const _PLANE_SIZE=\[\[2,0\.5\],\[5,0\.725\],\[9,0\.975\]\];/, 'the ramp, as data');
  assert.match(s, /'icon-size':_planeIconSizeExpr\(\)/, 'the symbol layer builds its expression from it');
  assert.match(s, /const iconHalfPx=19\*_planeIconSize\(GE\(\)\.camera\.getZoom\(\)\);/,
    'and the lifted body evaluates the same ramp at the same zoom');
  assert.match(s, /const half=iconHalfPx\*mpp;/, 'so its ground size IS the glyph size');
  /* the 60 m floor is what made the lifted mark 2.7x too big past z14.5 — it must be gone */
  assert.doesNotMatch(s, /const half=Math\.max\(60, ?13\*mpp\)/, 'the metre floor is gone');
  /* sub-pixel thickness: an extrusion that is a block is a different mark when the camera tilts */
  assert.match(s, /const thick=0\.35\*mpp;/, 'and no wall at any pitch');
  /* the stroke is a RING (outer boundary + the body outline as its hole), not a plate underneath */
  assert.match(s, /planeRingPts\(d\.lng,d\.lat,d\.heading,half,_PLANE_RIM\),\s*\n\s*planeRingPts\(d\.lng,d\.lat,d\.heading,half,_PLANE_CORE\)\.slice\(\)\.reverse\(\)/,
    'the stroke is an annulus');
  /* the size is REPORTED, because "the same mark" is a measurable claim (nobody had measured it) */
  assert.match(s, /halfPx:\+\(half\/mpp\)\.toFixed\(2\), glyphHalfPx:\+iconHalfPx\.toFixed\(2\)/, 'and it is measurable');
});

/* ── 2 · the land mask, and the two places that used to paint the sea ────────────────────────── */
test('R192 seismic: land/sea is a bundled fact, and a missing mask never paints the ocean', () => {
  const lm = read('js/land-mask.js');
  assert.match(lm, /window\.IntMapLandMask=/, 'its own module — a fact about the Earth, not about earthquakes');
  assert.match(lm, /data\/land-mask\.png/, 'from the bundled raster');
  assert.match(lm, /if\(!bits\) return null;/, 'and "I do not know" is a distinct answer from "it is land"');

  const s = read('js/seismic.js');
  /* the far field: the mask is consulted, and with no mask the annulus is NOT drawn */
  assert.match(s, /if\(LM\)\{ await LM\.warm\(\); if\(seq!==fldSeq\) return; if\(LM\.ready\(\)\) land=LM; \}/, 'the far field asks the mask');
  assert.match(s, /if\(!land\)\{ console\.warn\('\[seismic\] the land mask is unavailable/, 'and fails closed');
  assert.doesNotMatch(s, /if\(sn&&sn\.have>=sn\.want\*0\.5\) land=sn;/, 'the half-loaded-DEM mask is gone');
  /* the fine field: a cell with no elevation is not a cell on land */
  /* ⚠ (#R215) the three-valued rule is unchanged; the ANSWER now comes from `landAt()` (the coast
     rasterised into this field's own grid, js/coast-mask.js) with this mask still behind it. */
  assert.match(s, /if\(e0==null&&landAt\(k,lo,la\)===false\)\{ sea\+\+; vs\[k\]=-1; continue; \}/,
    'a missing DEM over known sea is sea');
  assert.match(s, /if\(e0==null&&landAt\(k,lo,la\)==null\)\{ noDem\+\+; vs\[k\]=0; continue; \}/,
    'and where NOTHING can say, it is left unpainted rather than assumed');

  /* the mask itself is real: the manifest says where it came from and how much of it is land */
  const man = JSON.parse(read('data/land-mask.json'));
  assert.equal(man.width, 2048); assert.equal(man.height, 1024);
  assert.match(man.source, /Natural Earth/, 'a named public-domain source');
  assert.ok(man.landFraction > 0.25 && man.landFraction < 0.42,
    'and a plausible land fraction for an equirectangular raster (29 % of area, stretched at the poles)');
  assert.ok(fs.statSync(path.join(ROOT, 'data/land-mask.png')).size < 60000, 'it is small enough to ship');

  /* ⚠ and the RASTER ITSELF is checked, not just its manifest: decode the shipped PNG and ask it
     about places whose answer is not in dispute. A mask that was silently all-zero would satisfy
     every other assertion in this file and would leave the far field painting nothing at all. */
  const png = fs.readFileSync(path.join(ROOT, 'data/land-mask.png'));
  let q = 8, idat = [], W = 0, H = 0;
  while (q < png.length) { const len = png.readUInt32BE(q), type = png.toString('ascii', q + 4, q + 8);
    if (type === 'IHDR') { W = png.readUInt32BE(q + 8); H = png.readUInt32BE(q + 12);
      assert.equal(png[q + 16], 1, '1 bit per pixel'); assert.equal(png[q + 17], 0, 'greyscale'); }
    if (type === 'IDAT') idat.push(png.subarray(q + 8, q + 8 + len));
    q += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), rowBytes = W >> 3;
  const isLand = (lng, lat) => { const i = Math.floor((lng + 180) / 360 * W), j = Math.floor((90 - lat) / 180 * H);
    return ((raw[j * (rowBytes + 1) + 1 + (i >> 3)] >> (7 - (i & 7))) & 1) === 1; };
  for (const [name, lng, lat, want] of [
    ['inland Tokyo', 139.70, 35.75, true], ['Sendai', 140.87, 38.27, true], ['Osaka', 135.50, 34.69, true],
    ['London', -0.10, 51.50, true], ['New York', -74.00, 40.71, true], ['Mongolia', 100, 45, true],
    ['the Sahara', 10, 25, true], ['the Amazon', -60, -3, true], ['Sydney', 151.00, -33.87, true],
    ['the open Pacific', -150, 20, false], ['the mid-Atlantic', -30, 0, false],
    ['the Southern Ocean', 0, -60, false], ['the Caspian', 51, 42, false],
    ['the Indian Ocean', 75, -20, false], ['Tokyo Bay', 139.83, 35.55, false],
  ]) assert.equal(isLand(lng, lat), want, name + ' should be ' + (want ? 'land' : 'sea'));
});

/* ── 3 · each intensity scale is computed from the band it is defined on ─────────────────────── */
test('R192 seismic: 震度 is the JMA definition, MMI is fed the band an instrument delivers', () => {
  const s = read('js/seismic.js');
  /* the JMA filter, as published: period effect, 10 Hz high-cut, 0.5 Hz low-cut */
  assert.match(s, /function jmaFilter\(f\)\{/, 'the JMA filter exists');
  assert.match(s, /0\.694\*y2\+0\.241\*y4\+0\.0557\*y6\+0\.009664\*y8\+0\.00134\*y10\+0\.000155\*y12/, 'its published high-cut');
  assert.match(s, /Math\.sqrt\(Math\.max\(0,1-Math\.exp\(-Math\.pow\(f\/0\.5,3\)\)\)\)/, 'and its 0.5 Hz low-cut');
  assert.match(s, /return hc\*lc\/Math\.sqrt\(f\);/, 'with the period-effect term');
  /* the 0.3-second level, and the intensity that IS its definition */
  assert.match(s, /const need=0\.3\/Math\.max\(0\.05,Td\);/, 'the level is a DURATION statement');
  assert.match(s, /function jmaOfA0\(a0\)\{ return 2\*Math\.log10\(Math\.max\(1e-6,a0\)\)\+0\.94; \}/, 'I = 2 log a0 + 0.94');
  assert.doesNotMatch(s, /2\.68\+1\.72\*Math\.log10/, 'and the PGV regression it replaces is gone');
  /* the felt band for the PGV that feeds Worden's GMICE */
  assert.match(s, /const FELT_HP=0\.1, FELT_POLES=4;/, 'a 4-pole high-pass at 0.1 Hz');
  assert.match(s, /const velF=f=>velS\(f\)\*feltHP\(f\);/, 'applied to the velocity spectrum');
  assert.match(s, /const pgvMs=rvt\(velF,Td\), pgaMs2=rvt\(accS,Td\);/, 'and NOT to PGA, which is carried above it');
  /* the two-corner source — the published fix for a single corner at great magnitude */
  /* (#R232) …divided by the directivity factor, because the two source corners move with the
     apparent duration exactly as fc does. The published coefficients are what is pinned. */
  assert.match(s, /const fa=Math\.pow\(10,2\.181-0\.496\*mw\)(?:\/f)?, fb=Math\.pow\(10,2\.41-0\.408\*mw\)(?:\/f)?;/, 'Atkinson & Silva 2000');
  /* ⚠ (#R263) …and the chain still uses it, with one optional factor after it. The displacement
     spectrum gained a `site` branch — the frequency-dependent quarter-wavelength amplification of a
     real velocity profile — which multiplies the SAME `omega0*shape*path` product rather than
     replacing any part of it. Without a site profile the expression is byte-for-byte #R192's. */
  assert.match(s, /\(f=>omega0\*s\.shape\(f\)\*path\(f\)\*site\.amp\(f\)\)/, 'the site branch multiplies the same product');
  assert.match(s, /\(f=>omega0\*s\.shape\(f\)\*path\(f\)\);/, 'and without one, the chain is unchanged');
  /* the field carries BOTH quantities, so switching scale still needs no rebuild (#R190) */
  assert.match(s, /pgvArr=new Float32Array\(N\*N\), a0Arr=new Float32Array\(N\*N\)/, 'both are stored per cell');
  assert.match(s, /const I=\(scale==='jma'\)\?jmaOfA0\(a0\):mmiOf\(pgv\);/, 'and each scale reads its own');
  /* every language says what changed */
  ['計測震度の算出方法', 'the level exceeded for a total of 0.3 s', 'insgesamt 0,3 s', 'суммарно 0,3 с', 'durante 0,3 s en total']
    .forEach(k => assert.ok(s.includes(k), 'the disclaimer says so in every language: ' + k));
});

/* ── 4 · the tsunami model ───────────────────────────────────────────────────────────────────── */
test('R192 tsunami: linear long waves over the real sea floor, from an Okada source', () => {
  const s = read('js/tsunami.js');
  /* ⚠ (#R193) THE EQUATIONS MOVED, SO THESE ASSERTIONS MOVED WITH THEM. #R192 pinned the leapfrog
     step inside js/tsunami.js; #R193 put the solver in a worker (src/tsunami-worker.js) because
     running it on the page was the whole defect. What this test is FOR — a C-grid carrying the
     spherical metric and a CFL-bounded step rather than a flat box with a chosen dt — is unchanged,
     and is asserted against the file that now holds it. Pinning the old location would only assert
     that nothing had improved. */
  const w = read('src/tsunami-worker.js');
  assert.match(s, /window\.IntMapTsunami=/, 'the module publishes itself');
  /* the equations: a C-grid with the spherical metric, not a flat box */
  /* ⚠ (#R197) the same equation, plus the Coriolis term the global domain made necessary — the part
     this test is for (the pressure gradient carrying the spherical metric factor `idx`) is unchanged */
  assert.match(w, /let fl = M\[a\] - gdt \* D \* \(eta\[b\] - eta\[a\]\) \* idx \+ dt \* f \* nn;/, 'the momentum equation');
  assert.match(w, /cor\[j\] = 2 \* OMEGA \* Math\.sin\(la \* DEG\);/, '…with a real Coriolis parameter');
  /* ⚠ (#R197) `sponge` is a per-ROW factor now, not a 921,600-cell field: on a global grid the two
     meridional "edges" are the same meridian and are stitched, so the only absorbing boundary left is
     at the two latitude walls. The metric — 1/(R cosφ) on the zonal divergence and (N cosφ) on the
     meridional one — is what this line is checked for and is unchanged. */
  assert.match(w, /const v = \(eta\[k\] - dt \* \(\(me - mwf\) \* idx \+ \(nnf - ns\) \* inv\)\) \* sp;/, 'continuity, with cos φ');
  assert.match(w, /const ns = Nf\[k \+ south\] \* csS, nnf = Nf\[k\] \* cn;/, '…the cos φ on the meridional flux');
  /* and the edge that no longer exists */
  assert.match(w, /THE ONLY SPONGE LEFT IS AT THE TWO LATITUDE WALLS/, 'longitude has no edge to absorb at');
  assert.match(w, /const dt = Math\.max\(0\.5, 0\.45 \* lim\);/, 'and a CFL time step');
  /* Okada, with the branch trap that a naive transcription falls into.
     ⚠ (#R197) it lives in the worker now — see the note on R193 ⑨. tests/r197-checks.test.mjs RUNS it
     against Okada's own Table 2, which is a stronger statement than any of these regexes. */
  assert.match(w, /function okadaUz\(x, y, depth, L2, W2, dipDeg, slip\)/, 'Okada (1985) uz');
  assert.match(w, /Math\.atan\(xi \* eta \/ \(q \* R\)\)/, 'the PRINCIPAL value, not atan2');
  assert.doesNotMatch(w, /Math\.atan2\(xi \* eta, q \* R\)/, 'because atan2 leaves a plateau behind the fault');
  assert.match(w, /const Lk = Math\.pow\(10, 0\.58 \* M - 2\.42\), Wk = Math\.min\(Lk, Math\.pow\(10, 0\.41 \* M - 1\.61\)\);/,
    'Wells & Coppersmith 1994, reverse faulting');
  /* the strike is read off the sea floor rather than guessed */
  assert.match(w, /let dipAz = Math\.atan2\(dHx, dHy\) \/ DEG;/, 'the strike comes from the bathymetric gradient');
  /* ⚠ (#R197) THE ANTIMERIDIAN STOPPED BEING A SPECIAL CASE. #R192 needed two DEM snapshots because a
     Pacific box ran past +180° and the sampler clamped there. The grid is the whole planet now and
     longitude is periodic, so there is no seam to work around — the assertion that replaced the old
     one is that the wrap exists at all. */
  assert.match(w, /const ip = \(i \+ 1 === nx\) \? 0 : i \+ 1;/, 'the last column\'s eastern neighbour is the first');
  /* ⚠ (#R205) "no demSnapshot at all" was a PROXY for "no seam to work around", and #R205 takes a
     snapshot again — for a local high-resolution floor around the epicentre, which is a refinement of
     a floor that is already complete. The seam invariant is the wrap asserted on the line above; what
     this line now asserts is that any snapshot taken here is WRAPPED rather than clamped, which is the
     thing #R192's two-snapshot workaround existed for. */
  if (/demSnapshot\(/.test(s)) {
    assert.match(s, /demSnapshot\(wrapLng\(lng0\),lat0,wrapLng\(lng1\),lat1,FINE_Z\)/,
      'a snapshot taken here reads wrapped longitudes, not clamped ones');
    assert.match(s, /const lng=wrapLng\(lng0\+\(i\+0\.5\)\*\(lng1-lng0\)\/w\);/, 'and so does every sample it takes');
  }
  /* Green's law only where the linear solution it shoals is still valid — same rule; #R193 keeps the
     depth on this thread as Int16 metres because h itself is transferred to the worker */
  assert.match(s, /const d=sim\.depth\[k\];/, 'the coastal estimate reads the depth it kept');
  assert.match(s, /if\(d<200\) continue;/, 'and starts at the shelf');
  /* frames are quantised. #R192 stored 1 mm in an Int16; #R193 compands to an Int8 along the cube
     root the colour ramp already uses — half the memory at the same visible resolution. */
  /* ⚠ (#R197) …and over the DISPLAY grid rather than the model grid: at 1440 × 640 a frame is 921 KB
     and a run is 140 of them. The picture is area-averaged down by `dec`; the analysis fields are not
     decimated and not quantised, which is the distinction this pair of assertions exists to keep. */
  assert.match(w, /const q = new Int8Array\(fx \* fy\);/, 'the animation is quantised, not stored as floats');
  assert.match(w, /emax, emin, tarr,/, 'and the analysis fields are returned in full precision');
  assert.match(w, /Math\.round\(127 \* Math\.cbrt\(a > 1 \? 1 : a\)\)/, 'on the same curve as the colour ramp');
  /* and it is reachable the way everything in this app is reachable (#R82) */
  const seis = read('js/seismic.js');
  assert.match(seis, /const T=window\.IntMapTsunami; if\(!T\|\|!T\.open\) return false;/,
    'the seismic panel hands the event over');
  /* ⚠ (#R197) the assertion that used to live here — "and the inundation model is still the fallback,
     not removed" — was inverted by 「災害シミュレータからは津波シミュレータを削除しろ」. It is now the
     opposite claim, and tests/r197-checks.test.mjs holds the whole of it. */
  /* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it.
     The question below is unchanged; the read follows the answer to where it lives now. */
  const atlas = read('js/atlas-console.js') + '\n' + read('js/atlas-catalog-text.js');
  assert.match(atlas, /if\(a\.hours!=null&&T\.setHours\) T\.setHours\(\+a\.hours\);/, 'Atlas drives it');
  assert.match(atlas, /"hours"\?:1-30,"maximum"\?:bool,"play"\?:bool/, 'and the SYS catalogue documents the parameters');
  /* five languages */
  ['津波伝播シミュレーション', 'Tsunami-Ausbreitung', 'Распространение цунами', 'Propagación de tsunami']
    .forEach(k => assert.ok(s.includes(k), 'the panel is translated: ' + k));
});

/* ── 5 · the satellite pipeline runs off the main thread ─────────────────────────────────────── */
test('R192 imagery: the tile pipeline is a worker, with the main thread kept as the fallback', () => {
  const w = read('src/sat-worker.js');
  assert.match(w, /self\.onmessage = async \(ev\) =>/, 'it is a worker');
  assert.match(w, /new OffscreenCanvas\(w, h\)/, 'it composes off-thread');
  assert.match(w, /self\.postMessage\(msg, \[bitmap\]\)/, 'and TRANSFERS the bitmap rather than copying it');
  assert.match(w, /const PLACEHOLDER_MAX = 3500;/, 'the same placeholder test as #R158');
  assert.match(w, /for \(let up = 0; up < 13 && az > 1; up\+\+\)/, 'the same 13-level ancestor walk as #R158');

  const c = read('src/sat-worker-client.js');
  assert.match(c, /new Worker\(new URL\('\.\/sat-worker\.js',import\.meta\.url\),\{type:'module'\}\)/, 'started by its own client module');
  assert.match(c, /it\.onerror=\(\)=>\{ try\{ it\.terminate\(\); \}catch\(_\)\{\} w=null;/, 'a dying worker does not take the imagery with it');
  const s = read('js/sat-proto.js');   /* (#R195) the protocol moved out of the shell, byte for byte */
  assert.match(s, /if\(via\)\{ try\{ const r=await via; if\(r&&r\.data\) return \{data:r\.data\}; \}catch\(_\)\{ \/\* fall through to the thread \*\/ \} \}/,
    'and a worker failure falls through to the main-thread path rather than losing the tile');
  assert.match(c, /if\(typeof Worker!=='function'\|\|typeof OffscreenCanvas!=='function'\|\|typeof createImageBitmap!=='function'\) return null;/,
    'a browser without the pieces keeps the old path');
  /* the depth memo is MIRRORED so the synchronous debug hooks and #R179's tests still work */
  assert.match(s, /depth:\(rows\)=>\{ for\(const \[k,have,stop\] of rows\)\{/, 'the depth memo is mirrored back');
  assert.match(s, /worker:\(\)=>!!_satWorker\(\)/, 'and the state is reportable');
});

/* ── 6 · the boot path ───────────────────────────────────────────────────────────────────────── */
test('R192 startup: the 5.5 MB history bundle waits for an idle main thread', () => {
  const s = read('js/time-borders.js');
  assert.match(s, /if\(typeof requestIdleCallback==='function'\) requestIdleCallback\(pf,\{timeout:6000\}\); else setTimeout\(pf,2500\);/,
    'it is prefetched when the thread is free, with a ceiling');
  assert.match(s, /if\(c&&\(c\.saveData===true\|\|\/\(\^\|-\)2g\$\/\.test\(c\.effectiveType\|\|''\)\)\) return;/,
    'and not at all on Data Saver or 2G');
  assert.doesNotMatch(s, /setTimeout\(pf,900\);/, 'the 900 ms timer is gone');
  const idx = read('index.html');
  ['https://a.basemaps.cartocdn.com', 'https://tiles.openfreemap.org', 'https://server.arcgisonline.com']
    .forEach(h => assert.ok(idx.includes('<link rel="preconnect" href="' + h + '"'), 'preconnect: ' + h));
});
