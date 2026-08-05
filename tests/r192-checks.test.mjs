/* ============================================================================
 *  R192 — the contracts this round established, checked against the source.
 *  (The pixel/renderer half is tests/r192.spec.js.)
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── 1 · the aircraft mark is the SAME NUMBER OF PIXELS in both renderings ───────────────────── */
test('R192 aircraft: one size ramp, read by the glyph and by the lifted body', () => {
  const s = read('js/data-layers.js');
  /* the ramp is stated ONCE — the defect was two independent numbers that drifted */
  assert.match(s, /const _PLANE_SIZE=\[\[2,0\.4\],\[5,0\.58\],\[9,0\.78\]\];/, 'the original ramp, as data');
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
  assert.match(s, /if\(e0==null&&landMask&&landMask\.isLand\(lo,la\)===false\)\{ sea\+\+; vs\[k\]=-1; continue; \}/,
    'a missing DEM over known sea is sea');
  assert.match(s, /if\(e0==null&&!landMask\)\{ noDem\+\+; vs\[k\]=0; continue; \}/, 'and with no mask it is left unpainted');

  /* the mask itself is real: the manifest says where it came from and how much of it is land */
  const man = JSON.parse(read('data/land-mask.json'));
  assert.equal(man.width, 2048); assert.equal(man.height, 1024);
  assert.match(man.source, /Natural Earth/, 'a named public-domain source');
  assert.ok(man.landFraction > 0.25 && man.landFraction < 0.42,
    'and a plausible land fraction for an equirectangular raster (29 % of area, stretched at the poles)');
  assert.ok(fs.statSync(path.join(ROOT, 'data/land-mask.png')).size < 60000, 'it is small enough to ship');
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
  assert.match(s, /const fa=Math\.pow\(10,2\.181-0\.496\*mw\), fb=Math\.pow\(10,2\.41-0\.408\*mw\);/, 'Atkinson & Silva 2000');
  assert.match(s, /const disp=f=>omega0\*s\.shape\(f\)\*path\(f\);/, 'and the chain uses it');
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
  assert.match(s, /window\.IntMapTsunami=/, 'the module publishes itself');
  /* the equations: a C-grid with the spherical metric, not a flat box */
  assert.match(s, /M\[a\]=\(hf>0\)\?\(\(M\[a\]-dt\*G\*hf\*\(eta\[b\]-eta\[a\]\)\*invDx\)\*sponge\[a\]\):0;/, 'the momentum equation');
  assert.match(s, /eta\[k\]=\(eta\[k\]-dt\*\(\(me-mw2\)\*invDx\+\(nn-ns\)\/\(dyM\*cj\)\)\)\*sponge\[k\];/, 'continuity, with cos φ');
  assert.match(s, /const dt=Math\.max\(1,0\.45\*Math\.min\(dxMin,dyM\)\/Math\.max\(1,cMax\)\);/, 'and a CFL time step');
  /* Okada, with the branch trap that a naive transcription falls into */
  assert.match(s, /function okadaUz\(x,y,depth,L2,W2,dipDeg,slip\)/, 'Okada (1985) uz');
  assert.match(s, /Math\.atan\(xi\*eta\/\(q\*R\)\)/, 'the PRINCIPAL value, not atan2');
  assert.doesNotMatch(s, /Math\.atan2\(xi\*eta,q\*R\)/, 'because atan2 leaves a plateau behind the fault');
  assert.match(s, /const Lk=Math\.pow\(10,0\.58\*M-2\.42\), Wk=Math\.min\(Lk,Math\.pow\(10,0\.41\*M-1\.61\)\);/,
    'Wells & Coppersmith 1994, reverse faulting');
  /* the strike is read off the sea floor rather than guessed */
  assert.match(s, /let dipAz=Math\.atan2\(dHx,dHy\)\/D;/, 'the strike comes from the bathymetric gradient');
  /* the antimeridian: a Pacific domain crosses it, and demSnapshot clamps at ±180 */
  assert.match(s, /const snapB=\(eLng>180\)\?demSnapshot\(-180,sLat,wrapLng\(eLng\),nLat,z\)/, 'two snapshots across the date line');
  /* Green's law only where the linear solution it shoals is still valid */
  assert.match(s, /const k=j\*N\+i; if\(h\[k\]<200\) continue;/, 'the coastal estimate starts at the shelf');
  /* frames are quantised — 120 float frames of 320² is 49 MB */
  assert.match(s, /const q=new Int16Array\(N\*N\);/, 'the animation is stored at 1 mm');
  /* and it is reachable the way everything in this app is reachable (#R82) */
  const seis = read('js/seismic.js');
  assert.match(seis, /if\(T&&T\.open\)\{ try\{ T\.open\(\{ lng:epi\[0\], lat:epi\[1\], mw:\(fault\?fault\.mw:mw\), depth:depthKm \}\); return true; \}catch\(_\)\{\} \}/,
    'the seismic panel hands the event over');
  assert.match(seis, /const D2=window\.IntMapDisaster; if\(!D2\|\|!D2\.open\) return false;/,
    'and the inundation model is still the fallback, not removed');
  const atlas = read('js/atlas-console.js');
  assert.match(atlas, /if\(a\.hours!=null&&T\.setHours\) T\.setHours\(\+a\.hours\);/, 'Atlas drives it');
  assert.match(atlas, /"hours"\?:3-24,"maximum"\?:bool,"play"\?:bool/, 'and the SYS catalogue documents the parameters');
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
  const s = read('js/app-body.js');
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
