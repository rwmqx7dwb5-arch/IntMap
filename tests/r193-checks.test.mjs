/* ============================================================================
 *  R193 — source contracts. The parts that can be proved without a renderer.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const R = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(R, p), 'utf8');

test('R193 ① the tsunami solver lives in a worker, and the page never runs the time loop', () => {
  assert.ok(fs.existsSync(path.join(R, 'src/tsunami-worker.js')), 'src/tsunami-worker.js exists');
  assert.ok(fs.existsSync(path.join(R, 'src/tsunami-worker-client.js')), 'the page-side client exists');
  const w = read('src/tsunami-worker.js');
  const m = read('js/tsunami.js');
  /* the integration loop is in the worker */
  assert.match(w, /for \(let s = 0; s < steps; s\+\+\)/, 'the worker owns the time stepping');
  /* …and NOT on the page. #R192 had `for(let s=0;s<steps;s++)` inside js/tsunami.js. */
  assert.ok(!/for\s*\(\s*let\s+s\s*=\s*0\s*;\s*s\s*<\s*steps/.test(m), 'js/tsunami.js has no time-stepping loop');
  /* the client is imported so window.IntMapTsunamiWorker exists at runtime */
  assert.match(read('src/main.js'), /tsunami-worker-client\.js/, 'the client is in the bundle');
});

test('R193 ② the worker is nonlinear where it matters, and says why it is not elsewhere', () => {
  const w = read('src/tsunami-worker.js');
  /* total depth in the pressure term (D = h + eta), not the still-water depth */
  assert.match(w, /const D = 0\.5 \* \(ha \+ eta\[a\] \+ hb \+ eta\[b\]\)/, 'pressure uses the total depth');
  /* Manning friction, and gated on shallow water because that is the only place it is not zero */
  assert.match(w, /MANNING = 0\.025/, 'Manning n for an ocean floor');
  assert.match(w, /if \(D < 500\)/, 'friction is evaluated only where it is not negligible');
  assert.match(w, /D \* D \* Math\.cbrt\(D\)/, 'D^(7/3) without a fractional pow');
  /* the two omissions are argued rather than silent */
  assert.match(w, /ADVECTION .* IS DELIBERATELY ABSENT/s, 'advection is documented as a decision');
  assert.match(w, /KAJIURA FILTER IS ALSO ABSENT/, 'the Kajiura filter is documented as a decision');
  /* the CFL limit is per cell, not the narrowest cell against the deepest cell */
  assert.match(w, /const v = dl \/ c; if \(v < lim\) lim = v;/, 'CFL is evaluated per cell');
});

test('R193 ③ the animation has no encoder in it', () => {
  const m = read('js/tsunami.js');
  /* #R192 built a PNG data URL per animation frame. Nothing here may. */
  assert.ok(!/toDataURL/.test(m), 'js/tsunami.js never encodes a PNG');
  assert.match(m, /addDynamicImage\(/, 'the field goes through the engine dynamic-image primitive');
  assert.match(m, /touchDynamicImage\(/, 'and is refreshed by touching it, not by rebuilding a source');
  /* playback is in simulated seconds and interpolates between stored frames */
  assert.match(m, /const q=\(A0\[k\]\+\(A1\[k\]-A0\[k\]\)\*w\)\|0/, 'frames are interpolated');
  assert.match(m, /tSim\+=speed\*dtReal/, 'time advances by wall clock × speed');
});

test('R193 ④ the ramp is opaque where there is a wave and clear where there is none', () => {
  const m = read('js/tsunami.js');
  /* #R192's ramp started at white with alpha 30/255 at zero, which is why the wave was invisible */
  assert.match(m, /const A8=Math\.round\(255\*Math\.pow\(a,0\.62\)\*0\.94\)/, 'alpha rises with amplitude');
  /* …and is exactly zero at zero */
  const alphaAtZero = Math.round(255 * Math.pow(0, 0.62) * 0.94);
  assert.equal(alphaAtZero, 0, 'a cell with no wave is fully transparent');
  /* the scale is the field's own 92nd percentile, not the source amplitude */
  assert.match(m, /v\[Math\.floor\(v\.length\*0\.92\)\]/, 'the display scale comes from the field');
});

test('R193 ⑤ the panel is opaque — #R189 already settled this', () => {
  const m = read('js/tsunami.js');
  assert.match(m, /background:var\(--card-bg/, 'the panel uses the opaque card background');
  assert.ok(!/#tsu-panel[\s\S]{0,400}--popup-bg/.test(m), 'and not the translucent popup background');
});

test('R193 ⑥ both engines implement the dynamic-image primitive', () => {
  const g = read('js/geo-engine.js'), c = read('js/cesium-engine.js');
  for (const fn of ['addDynamicImage', 'touchDynamicImage', 'setDynamicImageOpacity', 'removeDynamicImage']) {
    assert.ok(g.includes(fn), 'geo-engine has ' + fn);
    assert.ok(c.includes(fn), 'cesium-engine has ' + fn);
  }
  /* the Cesium side MUST alternate canvases — a material image is compared by identity */
  assert.match(c, /rec\.at=next;/, 'Cesium hands back a different canvas object each touch');
  assert.match(c, /cv:\[mk\(\),mk\(\)\]/, 'which is why it keeps two');
});

test('R193 ⑦ the ancestor walk starts from what the depth memo already knows', () => {
  const w = read('src/sat-worker.js'), a = read('js/sat-proto.js');   /* (#R195) protocol split out */
  assert.match(w, /const hint = knownStop\(z, x, y\);/, 'the worker consults the memo');
  assert.match(a, /const _hint=_satKnownStop\(z,x,y\);/, 'and so does the main-thread fallback');
  /* a stale hint must not be trusted blindly: the walk resumes from there */
  assert.match(w, /else if \(got\) \{ az = hint;/, 'the worker falls back when the hint is stale');
  assert.match(a, /else if\(got\)\{ az=_hint;/, 'and so does the fallback path');
});

test('R193 ⑧ nothing large is fetched on the boot path that nobody is waiting for', () => {
  /* Köppen: the small file first, the full one behind an idle callback */
  const d = read('js/data-layers.js');
  assert.match(d, /function koppenDisplayURL\(p\)\{ return koppenPhone\(\)\?koppenSmallURL\(p\):koppenSmallURL\(p\); \}/,
    'the first Köppen picture is the 4k one on every device');
  assert.match(d, /function koppenUpgrade\(/, 'and the full-resolution one is swapped in later');
  assert.match(d, /requestIdleCallback\(run,\{timeout:8000\}\)/, 'behind an idle callback');
  /* the layer-preview queue does not open until the panel is shown or the page is idle */
  const lp = read('js/layer-previews.js');
  assert.match(lp, /function _imgPump\(\)\{ if\(!_imgOpen\) return;/, 'the preview queue starts closed');
  assert.match(lp, /function kick\(container\)\{ _openQueue\(\);/, 'opening the panel opens it');
  /* katex and html2canvas are deferred, not merely split */
  const v = read('src/vendor.js');
  /* ⚠ (#R224) DEFERRED BECAME ON-DEMAND, which is what #R193 was reaching for. An idle callback with
     a 6 s ceiling still fetched, parsed and compiled 456 kB on EVERY session (measured this round at
     t = 1.04 s on a clean phone load) for two features most sessions never touch. They are keyed to
     their first use now: html2canvas when the shutter is pressed, KaTeX when an answer carries LaTeX. */
  assert.ok(!/requestIdleCallback\(load/.test(v), 'the vendors are no longer merely delayed');
  assert.match(v, /window\.IntMapVendor = /, 'they are behind an explicit first-use gate');
  /* ⚠ (#R493) THE FETCH MOVED WITH THE CAPTURE, AND THE CLAIM DID NOT. js/screenshot.js used to hold
     the picture; it now holds the BUTTON and calls js/atlas-view-capture.js, which Atlas calls too
     (view.inspect). Reading the old file would only prove that a second copy of the fetch had been
     left behind — the duplication that round removed. The property is unchanged: whoever composes
     the screen pulls its own 198 kB library at that moment and never at boot. */
  assert.match(read('js/atlas-view-capture.js'), /IntMapVendor\.html2canvas\(\)/, 'the capture path fetches its own library');
  assert.match(read('js/screenshot.js'), /await import\('\.\/atlas-view-capture\.js'\)/, '…and the shutter reaches it on demand, not at boot');
  assert.match(read('js/atlas-reply.js'), /IntMapVendor\.katex\(\)/, 'and the maths path fetches KaTeX');
  /* the country file waits for the map's own idle */
  const ab = read('js/app-body.js');
  assert.match(ab, /GE\(\)\.events\.once\('idle',\(\)=>setTimeout\(once,300\)\);[\s\S]{0,80}setTimeout\(once,5000\);/,
    'the gazetteer warm-up waits for the map to settle');
  /* and the analytics tag is inserted at idle rather than at parse time */
  const h = read('index.html');
  /* ⚠ THE PROPERTY IS «SCHEDULED AT IDLE WITH A CEILING», NOT «the callback is named `ins`». The
     scheduled function is `guarded` now — it re-checks that no OAuth/magic-link credential is still
     sitting in the URL before inserting the tag, because Clarity records the page URL and a DOM
     replay (see the note beside the tag). Same scheduler, same 6 s ceiling, same "not at parse
     time"; pinning the identifier made this fail on a privacy fix that changes none of that. */
  assert.match(h, /if\(typeof requestIdleCallback==='function'\) requestIdleCallback\(\w+,\{timeout:6000\}\)/,
    'the Clarity tag is inserted at idle');
  assert.match(h, /var authy=function\(\)/, 'and only once the URL carries no auth credential');
  assert.match(h, /c\[a\]=c\[a\]\|\|function\(\)\{\(c\[a\]\.q=c\[a\]\.q\|\|\[\]\)\.push\(arguments\)\}/,
    '…while its queue shim is still defined immediately, so nothing that calls it breaks');
});

test('R193 ⑨ the sub-fault source preserves the moment the magnitude implies', async () => {
  /* The taper weights are re-normalised so the MEAN slip is the Wells & Coppersmith value: a source
     that quietly changed the magnitude would be a physics bug hiding in a cosmetic change. */
  /* ⚠ (#R197) THE SOURCE MOVED, THE PROPERTY DID NOT. Okada and the sub-fault grid are evaluated in
     src/tsunami-worker.js now (a global grid is 921,600 cells and none of that belongs on the page),
     so this reads the worker. tests/r197-checks.test.mjs additionally RUNS the normalisation and
     checks that area × slip gives back the magnitude, which is what this assertion is protecting. */
  const m = read('src/tsunami-worker.js');
  assert.match(m, /const norm=\(SUB_S\*SUB_W\)\/Math\.max\(1e-9,wsum\);/, 'the weights are normalised');
  /* recompute the normalisation the same way the module does and check it is exactly mean-preserving */
  const SUB_S = 8, SUB_W = 3;
  const taper = (s) => Math.sqrt(Math.sin(Math.PI * Math.max(0.001, Math.min(0.999, s))));
  let wsum = 0; const wts = [];
  for (let a = 0; a < SUB_S; a++) for (let b = 0; b < SUB_W; b++) { const w = taper((a + 0.5) / SUB_S) * taper((b + 0.5) / SUB_W); wts.push(w); wsum += w; }
  const norm = (SUB_S * SUB_W) / wsum;
  const mean = wts.reduce((s, w) => s + w * norm, 0) / wts.length;
  assert.ok(Math.abs(mean - 1) < 1e-12, 'the mean sub-fault slip equals the plane\'s mean slip');
  /* and the taper really is a taper — the edges slip less than the centre */
  assert.ok(wts[0] < wts[Math.floor(wts.length / 2)], 'the edge slips less than the middle');
});
