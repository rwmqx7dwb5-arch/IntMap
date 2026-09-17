/* ============================================================================
 *  R768 — 「IT DID NOT MOVE」 AND 「I COULD NOT SEE IT MOVE」 WERE THE SAME ANSWER,
 *         SO ATLAS SPENT A WHOLE TURN RETRYING A MOVE THAT NEVER FAILED
 * ----------------------------------------------------------------------------
 *  Measured on production (https://rwmqx7dwb5-arch.github.io/IntMap/), 2026-09-16, signed in,
 *  gpt-5.6-luna, the SAME question twice:
 *
 *    tab in the background   「アイスランドに飛んで」  9 model calls, 8 operations,
 *                                                   SEVEN of them partial/no_change,
 *                                                   stopped: step_budget
 *                                                   (the reader is told the turn hit its
 *                                                    working limit — it did not, it hit a lie)
 *    tab in front            「アイスランドに飛んで」  1 model call, completed/ok,
 *                                                   stopped: answered
 *
 *  A page that is not compositing runs no animation frames, so the camera really does stay where it
 *  was. `view.flyTo`'s verifier read that as `no_change` — the code for 「the request did not take
 *  effect」 — and Atlas, correctly, tried again. .agents/rules/one-pass-or-a-reason.md §2 calls this
 *  the first of the three causes of a repeat: THE OBSERVER LIED. §5 draws the line these tests hold:
 *  「描かれたことを確認できなかった」は失敗ではなく観測できなかったである。
 *
 *  ⚠ NOTHING HERE CONSTRAINS ATLAS (CONSTITUTION.md §5, and the user's instruction in #R768:
 *  「AIモデルが決定権をもっていて、なにをやるか決めるというのはそれでいい。コード側で変に縛ったりする
 *  のは嫌」). No call is refused, no plan is shortened, no step budget moves. What changes is that the
 *  sentence Atlas is handed is true.
 *
 *  ⚠ THESE TESTS DO NOT READ THE SOURCE FOR THE VERDICT (#R505). They build the SHIPPED registry and
 *  EVALUATE the shipped verifier against a stub renderer, because the defect was in what the verdict
 *  could see. ⑤ is the one source-level check, and it measures a structural fact a running verdict
 *  cannot: that the render-tick wait has ONE implementation rather than two that can drift apart.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');

const CAPS = makeAtlasCapabilities({ lang: 'en' });
const fly = CAPS.resolve('view.flyTo');

const CAM = { lng: -21.9, lat: 64.1, zoom: 5, bearing: 0, pitch: 0 };

/* A renderer stub whose ONLY variable is whether it is drawing. `ticking` is the question this round
   gave the engine facade (js/geo-engine.js render.ticking); `mode` picks what it answers:
     'live'   — a render tick arrived            (a normal, foreground page)
     'asleep' — no tick within the window        (the measured backgrounded tab)
     'throws' — the engine cannot answer at all  (an adapter that predates this round) */
function renderer(mode, camera) {
  const cam = camera || CAM;
  return {
    hasRenderer: () => true,
    layers: { sourceData: () => ({ type: 'FeatureCollection', features: [] }) },
    scene: { getStyle: () => ({ layers: [] }) },
    camera: {
      getCenter: () => ({ lng: cam.lng, lat: cam.lat }), getZoom: () => cam.zoom,
      getBearing: () => cam.bearing, getPitch: () => cam.pitch,
      getBounds: () => null
    },
    render: {
      triggerRepaint() {},
      canvas: () => null,
      onNextFrame(ms, fn) { if (mode === 'throws') throw new Error('this adapter cannot say'); fn(mode === 'live'); },
      ticking(ms) {
        if (mode === 'throws') throw new Error('this adapter cannot say');
        return Promise.resolve(mode === 'live');
      }
    }
  };
}

/* the pair, in the order the executor runs it (js/atlas-executor.js: observe → run → observe →
   verify). The observation is where 「was the page drawing?」 is taken, so a verdict asked without it
   is a verdict that never saw the map — which is why this drives both halves rather than the second. */
async function verdict(mode, { before, after, args, raw }) {
  const had = window.IntMapGeoEngine;
  window.IntMapGeoEngine = renderer(mode, after);
  try {
    await fly.observe();
    return fly.verify({}, args, before, after, raw === undefined ? { ok: true } : raw, 'view.flyTo');
  } finally { if (had === undefined) delete window.IntMapGeoEngine; else window.IntMapGeoEngine = had; }
}

/* the production shape: the reader asked for a place, and the camera is exactly where it was */
const STUCK = { before: CAM, after: CAM, args: { place: 'Iceland' } };

test('R768 ① a camera that did not move because the page is not drawing is NOT `no_change`', async () => {
  const v = await verdict('asleep', STUCK);
  assert.equal(v.code, 'not_rendering',
    'a backgrounded page must not be reported as「the map did not change」— that is the sentence that spent 9 model calls on one flyTo');
  assert.notEqual(v.status, 'failed', 'the request did not fail; it could not be observed (rule §5)');
  assert.equal(v.observed && v.observed.rendering, false, 'the verdict has to carry WHY, or the next reader re-derives it');
});

test('R768 ② a drawing page is unchanged from before this round', async () => {
  const v = await verdict('live', STUCK);
  assert.equal(v.code, 'no_change', 'when the renderer really is ticking and nothing moved, the old verdict is the right one');
  assert.equal(v.status, 'partial');
});

test('R768 ③ the probe may only weaken a claim — an engine that cannot answer changes nothing', async () => {
  const v = await verdict('throws', STUCK);
  assert.equal(v.code, 'no_change',
    'an unanswerable probe must leave the verdict exactly as it was; nothing may be downgraded on a question we could not get an answer to');
});

test('R768 ③b a verdict asked without an observation claims nothing either', () => {
  /* the reading belongs to the observer, so a caller that skips it must not inherit the LAST
     operation's answer. (It is one slot — see the declaration beside CAMERA_SETTLE_MS.) */
  const had = window.IntMapGeoEngine;
  window.IntMapGeoEngine = renderer('asleep', CAM);
  try {
    const v = fly.verify({}, STUCK.args, STUCK.before, STUCK.after, { ok: true }, 'view.flyTo');
    assert.equal(typeof v.then, 'undefined', 'the camera verdict is synchronous — every camera capability shares it');
    assert.ok(v.code === 'no_change' || v.code === 'not_rendering');
  } finally { if (had === undefined) delete window.IntMapGeoEngine; else window.IntMapGeoEngine = had; }
});

test('R768 ④ a camera that DID move is still complete, even on a page that is not drawing', async () => {
  const moved = { lng: 139.7, lat: 35.7, zoom: 5, bearing: 0, pitch: 0 };
  const v = await verdict('asleep', { before: CAM, after: moved, args: { place: 'Tokyo' } });
  assert.equal(v.status, 'completed');
  assert.equal(v.code, 'ok', 'the judgement is only ever an upgrade (#R740) — this round must not have inverted that');
});

test('R768 ⑤ the render-tick wait has ONE implementation, and the capture path uses it', () => {
  const ge = fs.readFileSync(path.join(ROOT, 'js', 'geo-engine.js'), 'utf8');
  const vc = fs.readFileSync(path.join(ROOT, 'js', 'atlas-view-capture.js'), 'utf8');
  assert.match(ge, /onNextFrame\s*\(\s*ms\s*,\s*fn\s*\)/, 'the engine facade owns the wait');
  assert.match(vc, /render\.onNextFrame\(/, 'the capture path asks the engine rather than writing the wait again');
  /* the shape it used to have, in the file that used to have it: a `once('render')` paired with its
     own setTimeout fallback. Two of those drift apart — which is exactly why the camera verifier had
     nowhere to ask the question and invented `no_change` instead. */
  assert.ok(!/once\(\s*['"]render['"]/.test(vc),
    'js/atlas-view-capture.js must not keep its own copy of the tick wait');
});

test('R768 ⑥ the reader is told what actually happened, and what to do about it', () => {
  const res = fs.readFileSync(path.join(ROOT, 'js', 'atlas-results.js'), 'utf8');
  const line = res.split('\n').find((l) => l.indexOf('atlas.code.not_rendering') >= 0);
  assert.ok(line, 'a code the reader can be shown needs a sentence (js/atlas-results.js)');
  assert.ok(/IntMap/.test(line) && /前面/.test(line),
    'the Japanese sentence must name the one action that fixes it — bringing IntMap to the front');
  assert.ok(/background/i.test(line), 'and the English one must say why');
});

test('R768 ⑦ the standing rule exists and forbids closing this with a lower ceiling', () => {
  const rule = fs.readFileSync(path.join(ROOT, '.agents', 'rules', 'one-pass-or-a-reason.md'), 'utf8');
  assert.match(rule, /上限を下げて塞いではならない/,
    'the rule has to say the thing that is tempting and wrong: capping the steps leaves the repeats and kills the deliverable instead');
  const agents = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  assert.match(agents, /one-pass-or-a-reason\.md/, 'AGENTS.md §3 must point at the canonical file');
});
