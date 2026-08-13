/* ============================================================================
 *  R236 — the contracts this round established, checked against the source.
 *
 *  ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
 *  (#R228's rule: a check that stays green when you undo the fix is not a check).
 *
 *  ⚠⚠ AND THE FIRST GROUP DRIVES THE REAL SCHEDULER RATHER THAN GREPPING FOR IT.
 *  #R235's own lesson was that `_pathDeg`'s unit test passed while the caller threw
 *  its result away — «関数を検査しても配線は検査されない». The runtime is an
 *  ES module with one export, so the honest check is to RUN it: stub the four
 *  globals it touches, pump the frame clock by hand, and count.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/* ⚠ comments quote the instructions, and the instructions quote the strings the checks look for
   (#R208/#R215/#R231/#R232/#R234/#R235 — EIGHT rounds of a check hitting its own explanation).
   Strip the comments and match the SYNTAX. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── the harness: the four globals js/runtime.js reaches for, and a hand-cranked rAF ──────────── */
function withRuntime(run) {
  const prev = {
    window: globalThis.window, document: globalThis.document,
    raf: globalThis.requestAnimationFrame, perf: globalThis.performance,
  };
  const queue = [];
  globalThis.window = {};
  globalThis.document = { hidden: false };
  globalThis.requestAnimationFrame = (fn) => { queue.push(fn); return queue.length; };
  if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };
  /* one frame = run exactly what was queued when the frame began, so a task that queues more
     work lands in the NEXT frame — which is the very semantic under test */
  const pump = (n = 1) => { for (let i = 0; i < n; i++) { const batch = queue.splice(0, queue.length); batch.forEach((fn) => fn()); } };
  try { return run(pump); }
  finally {
    globalThis.window = prev.window; globalThis.document = prev.document;
    globalThis.requestAnimationFrame = prev.raf; globalThis.performance = prev.perf;
  }
}

/* ── 1 · ⚠⚠ the one-shot queue is DRAINED before it runs, so a loop can re-arm itself ────────── */
test('R236 runtime: a frame() task that re-registers itself keeps running', async () => {
  const { makeRuntime } = await import('../js/runtime.js');
  withRuntime((pump) => {
    const RT = makeRuntime({});
    let runs = 0;
    const step = () => { runs++; if (runs < 25) RT.frame('probe:selfloop', step); };
    RT.frame('probe:selfloop', step);
    pump(30);
    /* against the un-fixed code this is 1: `ONCE.set` during the `for…of` replaced the entry
       being iterated and `map.clear()` afterwards deleted it. That is why the seismic playback
       advanced by a single frame and the wavefronts never moved. */
    assert.equal(runs, 25, 'the self-re-arming task ran every frame, not once');
  });
});

test('R236 runtime: work enqueued during a frame runs in the NEXT frame, not the same one', async () => {
  const { makeRuntime } = await import('../js/runtime.js');
  withRuntime((pump) => {
    const RT = makeRuntime({});
    const order = [];
    RT.frame('a', () => { order.push('a'); RT.frame('b', () => order.push('b')); });
    pump(1);
    assert.deepEqual(order, ['a'], 'b did not get dragged into the frame that enqueued it');
    pump(1);
    assert.deepEqual(order, ['a', 'b'], 'b ran on the following frame');
  });
});

test('R236 runtime: a throwing one-shot still lets the rest of the frame run, and is not retried', async () => {
  const { makeRuntime } = await import('../js/runtime.js');
  withRuntime((pump) => {
    const RT = makeRuntime({});
    let after = 0, boom = 0;
    RT.frame('boom', () => { boom++; throw new Error('x'); });
    RT.frame('after', () => { after++; });
    pump(3);
    assert.equal(after, 1, 'the later task still ran');
    assert.equal(boom, 1, 'the thrower was drained, not retried for ever');
  });
});

/* ── 2 · the fix is in the scheduler, and the seismic playback still rides it ─────────────────── */
test('R236 runtime: _run drains a transient map before running it', () => {
  const s = code(read('js/runtime.js'));
  assert.match(s, /const entries\s*=\s*transient\s*\?\s*Array\.from\(map\)\s*:\s*map;\s*if\s*\(transient\)\s*map\.clear\(\);/,
    'the transient map is snapshotted and cleared BEFORE the loop');
  assert.doesNotMatch(s, /\}\s*if\s*\(transient\)\s*map\.clear\(\);\s*\}/,
    'the old clear-after-the-loop is gone (that was the defect)');
});

test('R236 seismic: the playback is still driven by the one frame loop', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /R\.frame\('seismic:play',\s*step\)/,
    'the play loop re-arms itself through runtime.frame — the construction the fix above protects');
});

/* ── 3 · the limb hands the rim back unless it is actually painting ───────────────────────────── */
test('R236 limb: a layer that cannot draw is removed and reported as a refusal', () => {
  const g = code(read('js/geo-engine.js'));
  assert.match(g, /if\(L\.imAlive\s*&&\s*!L\.imAlive\(\)\)\{/,
    'addLimb asks the layer whether it can draw before claiming success');
  assert.match(g, /limbDrawn\(id\)\{/, 'the adapter reports painted frames');
  assert.match(g, /limbDrawn:id=>A\(\)\.limbDrawn\?A\(\)\.limbDrawn\(id\):0/,
    '…and it is on the engine CONTRACT, or callers get a silent undefined (#R216)');
  const l = code(read('js/limb-layer.js'));
  assert.match(l, /imAlive\(\)\{\s*return\s*!dead\s*&&\s*!!prog;\s*\}/, 'the layer answers for itself');
  assert.match(l, /drawn\+\+;/, 'and counts only frames where the draw call issued');
});

test('R236 limb: the watchdog revokes on EVIDENCE (map frames), never on a timeout alone', () => {
  const t = code(read('js/theme-sky.js'));
  assert.match(t, /if\(mapFrames<8\)\{/,
    'with no frames from the map there is no evidence, so nothing is revoked');
  assert.match(t, /_applyLimb\._refused=true;/, 'the revocation is remembered for the session');
  /* the defect this guards: revoking purely because time passed would take the limb away from any
     reader whose map happened to be idle, since maplibre only repaints on demand. */
  assert.doesNotMatch(t, /setTimeout\(\(\)=>\{\s*if\(_limbPainting\(\)\) return;\s*_applyLimb\._refused=true;/,
    'the first, timeout-only version of the watchdog is gone');
});

/* ── 4 · the rupture area comes first, and the hypocentre goes on it ─────────────────────────── */
test('R236 seismic: draw / hypocentre / place sit in ONE row, rupture area first', () => {
  const s = code(read('js/seismic.js'));
  const row = s.match(/<div style="display:flex;gap:5px;align-items:stretch;">([\s\S]*?)\+'<\/div>'/);
  assert.ok(row, 'the three controls share one flex row');
  const order = [...row[1].matchAll(/class="(sq-fdraw|sq-cm-epi|sq-cm-sta)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['sq-fdraw', 'sq-cm-epi', 'sq-cm-sta'],
    '「やっぱり、震源域を先に」 — the row reads in the order the work is done');
});

test('R236 seismic: with a rupture drawn, a hypocentre outside it is refused', () => {
  const s = code(read('js/seismic.js'));
  assert.match(s, /if\(fault&&fault\.ring&&fault\.ring\.length>=3&&!_inRing\(p,fault\.ring\)\)\{\s*_epiOutside=1;/,
    'the click is rejected rather than moving the nucleation point off the plane');
  assert.match(s, /function _inRing\(pt,ring\)\{/, 'and there is a containment test to reject it with');

  /* the arithmetic, run rather than described — a concave ring so the test is not just a bbox */
  const src = read('js/seismic.js');
  const body = src.slice(src.indexOf('function _inRing'));
  const fn = new Function('return ' + body.slice(0, body.indexOf('\n    }') + 6))();
  const c = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [4, 3], [4, 4], [0, 4]];   /* a C shape */
  assert.equal(fn([0.5, 2], c), true, 'inside the spine of the C');
  assert.equal(fn([3, 2], c), false, 'inside the bounding box but in the C\'s mouth');
  assert.equal(fn([2, 0.5], c), true, 'inside the lower arm');
  assert.equal(fn([5, 2], c), false, 'outside altogether');
});
