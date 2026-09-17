#!/usr/bin/env node
/* ============================================================================
 *  check:atlasrepeat — the gate for .agents/rules/one-pass-or-a-reason.md
 * ----------------------------------------------------------------------------
 *  The rule says a repeat is a SYMPTOM, and names the first cause: the observer reported a failure
 *  that had not happened. This gate measures that one thing, because it is the one thing that can be
 *  measured without asking a model anything:
 *
 *    ①  the engine can be asked 「are you drawing right now?」, in ONE place
 *    ②  no Atlas observer writes that wait a second time (two copies drift, and the drift is silent)
 *    ③  the SHIPPED camera verifier, EVALUATED, does not call a page that is not compositing
 *        a failure of the request — and does not invent a failure when it cannot tell
 *
 *  ⚠ IT DOES NOT COUNT STEPS, AND IT MUST NOT. Gating on 「how many calls did the turn make」 is the
 *  ceiling the rule's §3 forbids, wearing a test's clothes: it would fail the turns where Atlas was
 *  right to keep going, and pass the ones where it was lied to twice instead of five times.
 *  ⚠ ③ EVALUATES rather than reads (#R505). ② is a source scan, and it is honest about being one:
 *  it measures 「is there a second spelling of this wait」, which is a fact about the text.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'js');
let bad = 0;
const ok = (m) => console.log('  ok    ' + m);
const no = (m) => { bad++; console.log('  FAIL  ' + m); };

/* strip block and line comments: a sentence ABOUT the wait is documentation, not a second one */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ── ① the one place ─────────────────────────────────────────────────────── */
const engine = code(fs.readFileSync(path.join(JS, 'geo-engine.js'), 'utf8'));
if (/onNextFrame\s*\(/.test(engine) && /ticking\s*\(/.test(engine)) ok('engine: js/geo-engine.js answers 「are you drawing?」 (render.onNextFrame / render.ticking)');
else no('engine: js/geo-engine.js must expose render.onNextFrame + render.ticking — the wait belongs to the renderer, not to each reader');

/* ── ② and only that place, for every Atlas observer ─────────────────────── */
const atlas = fs.readdirSync(JS).filter((f) => /^atlas-.*\.js$/.test(f));
const copies = atlas.filter((f) => /once\s*\(\s*['"]render['"]/.test(code(fs.readFileSync(path.join(JS, f), 'utf8'))));
if (!copies.length) ok('observers: ' + atlas.length + ' Atlas module(s) ask the engine; none writes the tick wait again');
else no('observers: these write their own render-tick wait instead of asking the engine — ' + copies.join(', '));

/* ── ③ what the shipped verifier actually answers ────────────────────────── */
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const fly = makeAtlasCapabilities({ lang: 'en' }).resolve('view.flyTo');
const CAM = { lng: -21.9, lat: 64.1, zoom: 5, bearing: 0, pitch: 0 };
const stub = (mode) => ({
  hasRenderer: () => true,
  layers: { sourceData: () => ({ type: 'FeatureCollection', features: [] }) },
  scene: { getStyle: () => ({ layers: [] }) },
  camera: { getCenter: () => ({ lng: CAM.lng, lat: CAM.lat }), getZoom: () => CAM.zoom, getBearing: () => 0, getPitch: () => 0, getBounds: () => null },
  render: {
    triggerRepaint() {}, canvas: () => null,
    onNextFrame(ms, fn) { if (mode === 'throws') throw new Error('cannot say'); fn(mode === 'live'); },
    ticking() { if (mode === 'throws') throw new Error('cannot say'); return Promise.resolve(mode === 'live'); }
  }
});
/* observe → verify, the order js/atlas-executor.js runs them in: the reading 「was the page drawing?」
   is taken beside the AFTER sample, so a verdict asked on its own never saw the map. */
async function verdictWith(mode) {
  window.IntMapGeoEngine = stub(mode);
  try { await fly.observe(); return fly.verify({}, { place: 'Iceland' }, CAM, CAM, { ok: true }, 'view.flyTo'); }
  finally { delete window.IntMapGeoEngine; }
}
const asleep = await verdictWith('asleep');
const live = await verdictWith('live');
const mute = await verdictWith('throws');

if (asleep.code === 'not_rendering' && asleep.status !== 'failed') ok('verdict: a page that is not compositing is reported as unobserved, not as a move that failed');
else no('verdict: a camera move on a non-drawing page answered ' + asleep.status + '/' + asleep.code + ' — that sentence is what Atlas retries against (rule §2-1)');

if (live.code === 'no_change') ok('verdict: a drawing page keeps the verdict it always had');
else no('verdict: a drawing page that did not move must still answer no_change, not ' + live.code);

if (mute.code === 'no_change') ok('verdict: an engine that cannot answer weakens nothing');
else no('verdict: an unanswerable probe changed the verdict to ' + mute.code + ' — the probe may only weaken a claim, never make one');

console.log('\ncheck:atlasrepeat — a repeat is a symptom; this measures the cause that can be measured');
process.exit(bad ? 1 : 0);
