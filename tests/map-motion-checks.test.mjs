/* ============================================================================
 *  IntMap · map-motion — the renderer facts the smoothness work stands on
 * ----------------------------------------------------------------------------
 *  js/geo-engine.js (_smoothWheel, _glideOptions) and js/app-body.js (ARRIVAL_FADE_MS) each rest on
 *  something the PINNED renderer does, read in its source rather than assumed. Those are facts about
 *  one version of maplibre-gl, and the day it is upgraded any of them can stop being true without a
 *  single behaviour test noticing at once. This file re-reads them from node_modules/maplibre-gl/src
 *  — the source the installed version ships — and names the line of IntMap that depends on each.
 *  The behaviour itself is gated by tests/map-motion.spec.js.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ML = join(ROOT, 'node_modules', 'maplibre-gl', 'src');
const src = (p) => readFileSync(join(ML, p), 'utf8');
const engine = readFileSync(join(ROOT, 'js', 'geo-engine.js'), 'utf8');
const num = (re, text, what) => { const m = re.exec(text); assert.ok(m, `${what}: not found`); return Number(m[1]); };

test('the renderer source is installed (these facts are read, not remembered)', () => {
  assert.ok(existsSync(join(ML, 'ui', 'handler_inertia.ts')), 'node_modules/maplibre-gl/src/ui/handler_inertia.ts');
});

test('① the glide: the renderer\'s inertia arithmetic is the one _glideOptions derives linearity from', () => {
  const s = src('ui/handler_inertia.ts');
  /* speed = amount·linearity / duration; duration = |speed| / (deceleration·linearity); amount = speed·duration/2.
     The ease therefore starts at speed·f′(0)/2 × linearity-scaled release speed — continuity is
     linearity·f′(0) = 2, which is what js/geo-engine.js computes. */
  assert.match(s, /amount \* linearity \/ \(inertiaDuration \/ 1000\)/, 'speed = amount × linearity / seconds');
  assert.match(s, /Math\.abs\(speed\) \/ \(deceleration \* linearity\)/, 'duration = |speed| / (deceleration × linearity)');
  assert.match(s, /amount: speed \* \(duration \/ 2\)/, 'amount = speed × duration / 2');
  assert.match(s, /_onMoveEnd\(panInertiaOptions\?: DragPanOptions \| boolean\)/, 'the pan glide reads the dragPan options');
  /* the stock numbers the engine restates (to keep the glide's duration and the largest carried
     release speed what they were) must still be the renderer's */
  const pan = /defaultPanInertiaOptions = extend\(\{\s*deceleration: (\d+),\s*maxSpeed: (\d+)/.exec(s);
  assert.ok(pan, 'defaultPanInertiaOptions');
  const lin = num(/linearity: ([\d.]+),/, s, 'default linearity');
  assert.equal(num(/GLIDE_DECEL=(\d+)/, engine, 'GLIDE_DECEL'), Number(pan[1]), 'js/geo-engine.js GLIDE_DECEL = the renderer\'s pan deceleration');
  assert.equal(num(/GLIDE_STOCK_MAX=(\d+)/, engine, 'GLIDE_STOCK_MAX'), Number(pan[2]), 'GLIDE_STOCK_MAX = the renderer\'s pan maxSpeed');
  assert.equal(num(/GLIDE_STOCK_LIN=([\d.]+)/, engine, 'GLIDE_STOCK_LIN'), lin, 'GLIDE_STOCK_LIN = the renderer\'s default linearity');
  /* and `enable()` without options RESETS the inertia — why the view keeps its glide and passes it */
  assert.match(src('ui/handler/shim/drag_pan.ts'), /this\._inertiaOptions = options \|\| \{\}/, 'DragPanHandler.enable(options) replaces the inertia options');
});

test('① the glide easing: linearity × f′(0) = 2 for the easing js/geo-engine.js ships', () => {
  const K = num(/GLIDE_K=(\d+(?:\.\d+)?)/, engine, 'GLIDE_K');
  const f = (t) => (1 - Math.exp(-K * t)) / (1 - Math.exp(-K));
  const h = 1e-6, slope = (f(h) - f(0)) / h, lin = 2 / slope;
  assert.ok(Math.abs(f(1) - 1) < 1e-12 && f(0) === 0, 'the easing runs 0 → 1');
  assert.ok(lin > 0.3 && lin < 1, `derived linearity ${lin}`);
  /* the end of the glide moves less than a pixel a frame for any carried speed the cap allows */
  const endSpeedShare = Math.exp(-K) * K / (1 - Math.exp(-K)) / slope;
  assert.ok(endSpeedShare < 0.03, `speed at the end of the glide is ${endSpeedShare} of the start`);
});

test('② the wheel: the renderer\'s scroll-zoom handler still has the shape _smoothWheel wraps', () => {
  const s = src('ui/handler/scroll_zoom.ts');
  for (const f of ['_targetZoom', '_lastExpectedZoom', '_finishTimeout', '_needsRerender', '_active', '_type'])
    assert.ok(s.includes('this.' + f), `ScrollZoomHandler.${f}`);
  assert.match(s, /renderFrame\(\)/, 'renderFrame()');
  assert.match(s, /zoomDelta: zoom - tr\.zoom/, 'renderFrame returns a zoomDelta the wrapper replaces');
  assert.match(s, /this\._lastExpectedZoom = zoom;/, 'the external-change bookkeeping the wrapper overwrites');
  assert.match(s, /\/ 200, 1\)/, 'the stock wheel finishes on its own 200 ms clock — the spring postpones it');
  assert.match(s, /this\._easing = this\._smoothOutEasing\(200\)/, 'the per-notch restart the spring replaces');
});

test('② the spring and the gate read the renderer\'s clock (setNow freezes all three)', () => {
  const t = src('util/time_control.ts'), i = src('index.ts');
  assert.match(t, /export function now\(\)/);
  for (const n of ['now', 'setNow', 'restoreNow']) assert.match(i, new RegExp(`^\\s+${n},$`, 'm'), `maplibregl.${n} is exported`);
  assert.match(engine, /maplibregl\.now\(\)/, 'js/geo-engine.js times the spring on maplibregl.now()');
});

test('③ the labels: the map-level fade is the SYMBOL fade, and 0 forces a full placement every frame', () => {
  const st = src('style/style.ts');
  assert.match(st, /forceFullPlacement \|\|= this\._layerOrderChanged \|\| fadeDuration === 0/, 'fadeDuration 0 ⇒ full placement each frame');
  /* a raster's fade is its own paint property, which is why ARRIVAL_FADE_MS on the map changes no tile */
  assert.match(st, /setRasterFadeDuration\(rasterFadeDuration\)/, 'raster fade comes from the layer\'s raster-fade-duration');
  const body = readFileSync(join(ROOT, 'js', 'app-body.js'), 'utf8');
  assert.match(body, /fadeDuration:ARRIVAL_FADE_MS/, 'the primary view fades its labels');
  /* the label fade is #R191's number, whose 正本 is the satellite layer's own declaration */
  assert.equal(num(/const ARRIVAL_FADE_MS=(\d+)/, body, 'ARRIVAL_FADE_MS'),
    num(/id:'layer-sat',type:'raster'[^}]*\},paint:\{'raster-fade-duration':(\d+)/, body, "layer-sat's raster-fade-duration"),
    'labels and satellite tiles arrive on one clock');
});

test('④ the release: what _glideRelease reads in the renderer is still there, with the numbers it restates', () => {
  const s = src('ui/handler_inertia.ts'), hm = src('ui/handler_manager.ts'), map = src('ui/map.ts'), cam = src('ui/camera.ts');
  assert.equal(num(/INERTIA_CUTOFF_MS=(\d+)/, engine, 'INERTIA_CUTOFF_MS'), num(/const BUFFER_CUTOFF = (\d+);/, s, 'BUFFER_CUTOFF'), 'the buffer the renderer keeps');
  assert.equal(num(/INERTIA_WINDOW_MS=(\d+)/, engine, 'INERTIA_WINDOW_MS'), num(/const VELOCITY_WINDOW = (\d+);/, s, 'VELOCITY_WINDOW'), 'the window it measures over');
  assert.match(s, /_inertiaBuffer: InertiaBufferEntry\[\]/, 'HandlerInertia._inertiaBuffer');
  assert.match(s, /record\(settings: HandlerResult\): void \{[\s\S]*?this\._inertiaBuffer\.push\(\{time: now\(\), settings\}\)/, 'entries are stamped with now() — the frame that applied them');
  assert.match(s, /deltas\.zoom \+= settings\.zoomDelta/, 'zoomDelta per entry');
  assert.match(s, /if \(settings\.panDelta\) deltas\.pan\._add\(settings\.panDelta\)/, 'panDelta per entry');
  assert.match(s, /const defaultZoomInertiaOptions = extend\(\{\s*deceleration: 20,/, 'the zoom glide the renderer cannot be told about (why it is replaced)');
  assert.match(hm, /this\._inertia\._onMoveEnd\(this\._map\.dragPan\._inertiaOptions\)/, 'the handler manager asks the instance, with the dragPan options');
  assert.match(map, /_handlers: HandlerManager;/, 'Map._handlers');
  /* ③ rests on this: an ease draws easing(t) with t measured from the call — easing(0) on the first frame */
  assert.match(cam, /this\._easeStart = now\(\);/);
  assert.match(cam, /const t = Math\.min\(\(now\(\) - this\._easeStart\) \/ this\._easeOptions\.duration, 1\);\s*this\._onEaseFrame\(this\._easeOptions\.easing\(t\)\);/);
});

test('⑤ the destination: the satellite gate asks the renderer\'s tile level the way the renderer picks it', () => {
  /* _satDestLevel is round(zoom + 1): a raster source rounds, and the satellite source is tileSize 256 */
  assert.match(src('source/raster_tile_source.ts'), /this\.roundZoom = true;/);
  assert.match(src('geo/projection/covering_tiles.ts'), /\(options\.roundZoom \? Math\.round : Math\.floor\)\(\s*transform\.zoom \+ scaleZoom\(transform\.tileSize \/ options\.tileSize\)/);
  const sat = readFileSync(join(ROOT, 'js', 'sat-proto.js'), 'utf8');
  assert.match(sat, /_satDestLevel=\(d\)=>Math\.max\(0,Math\.min\(19,Math\.round\(d\.zoom\+1\)\)\)/);
  const body = readFileSync(join(ROOT, 'js', 'app-body.js'), 'utf8');
  assert.match(body, /'satellite':\{type:'raster',tiles:\([^)]*\),tileSize:256,maxzoom:19/, 'the satellite source is declared tileSize 256 (the +1) and maxzoom 19 (the clamp)');
});
