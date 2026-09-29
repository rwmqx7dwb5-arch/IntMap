/* ============================================================================
 *  THE RUNTIME — one frame loop and one camera subscription (js/runtime.js)
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. js/runtime.js is RUN with a hand-cranked frame clock;
 *    the remaining pins are the followers' call sites in page closures.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly as code } from '../scripts/code-only.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r234-checks.test.mjs (tests #1, #2 of 13) ═══
    R234 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).
    Where the claim is arithmetic rather than text, it is COMPUTED here rather
    than pinned to a number this round happened to produce (#R203/#R229). */
{

/* ── 1 · the runtime is ONE frame, ONE camera subscription, ONE timer ───────────────────────── */
test('R234 runtime: one camera subscription drives every follower, reads before writes', () => {
  const s = read('js/runtime.js');
  /* the single subscription — the whole point is that it is made once, here */
  assert.match(s, /\['move', 'zoom', 'rotate', 'pitch', 'resize'\]\.forEach/,
    'the runtime subscribes to the camera exactly once, for everybody');
  /* reads all run before writes, so one follower's style write cannot invalidate the next's measure */
  assert.match(s, /_run\(READ, false\);\s*\n\s*_run\(WRITE, false\);/,
    'the frame runs the READ phase before the WRITE phase');
  /* one task throwing must not cost the others their frame */
  assert.match(s, /try \{ e\.fn\(\); \} catch \(err\) \{ _oops\(k, err\); \}/,
    'a throwing task is reported and the frame continues');
  /* the timer wheel is one timeout, and a hidden document does not tick */
  assert.match(s, /const now = Date\.now\(\), hidden = _hidden\(\);/, 'the wheel knows whether the document is hidden');
  assert.match(s, /if \(hidden && !t\.hidden\) \{ t\.next = now \+ t\.ms; /,
    'a hidden document defers the entry instead of running it');
  /* the lifecycle the instruction asks for, all four verbs */
  for (const verb of ['load', 'activate', 'suspend', 'dispose']) {
    assert.ok(new RegExp('function ' + verb + '\\(').test(s), 'the capability lifecycle has ' + verb + '()');
  }
  /* suspend must raise the flag BEFORE running the capability's own suspend */
  assert.match(s, /SUSPENDED\.add\(name\);\s*\n\s*if \(c\.state === 'active'\)/,
    'suspend() marks the capability before calling into it');
});

test('R234 runtime: the eight private per-camera rAFs are gone from the followers', () => {
  /* Each of these files coalesced its own camera work with its own requestAnimationFrame. The
     claim is not "they got faster" — it is that they now share ONE frame. */
  const wired = {
    /* (#R498) the crosshair left js/app-body.js for js/mobile-map-input.js — the shell budget
       (tests/r168 #8, tests/r479 ⑧) had one line of headroom and this round needed 124. The CLAIM
       is unchanged and is what is checked: this follower shares the one frame. ⚠ And it is now
       SPLIT across the runtime's two phases, which is #R498's own fix — the write half used to
       measure the DOM after writing to it. */
    'js/mobile-map-input.js': /RT\(\)\.onCamera\('shell\.crosshair'/,
    'js/view-controls.js': /R\.onCamera\('viewctl\.altitude'/,
    'js/tool-panel.js': /R\.onCamera\('toolpanel\.ctxmenu'/,
    'js/map-tools.js': /R\.onCamera\('arc3d\.draw'/,
    'js/search-geocode.js': /R\.frame\('search\.card'/,
    'js/tile-warm.js': /R\.onCamera\('tilewarm\.prefetch'/,
    'js/theme-sky.js': /R\.onCamera\('themesky\.follow'/,
  };
  for (const [f, re] of Object.entries(wired)) assert.match(read(f), re, f + ' goes through the runtime');
  /* ⚠ the arc layer subscribed to move AND zoom AND rotate AND pitch with no coalescing at all —
     up to four full redraws inside one frame of a pinch-rotate. That shape must not come back. */
  const mt = read('js/map-tools.js');
  assert.doesNotMatch(mt, /GE\(\)\.events\.on\('move',rd\); GE\(\)\.events\.on\('zoom',rd\); GE\(\)\.events\.on\('rotate',rd\); GE\(\)\.events\.on\('pitch',rd\); window\.addEventListener/,
    'the four uncoalesced arc subscriptions are not the primary path any more');
  /* the runtime is built before anything can register with it */
  const ab = read('js/app-body.js');
  assert.ok(ab.indexOf('makeRuntime(IM_HOST);') > 0, 'the runtime is instantiated in the shell');
  /* (#R498) the first registration the shell reaches is the crosshair's, and it now happens inside
     js/mobile-map-input.js — so what the shell has to get right is that the runtime exists before it
     MOUNTS that surface. Same ordering claim, at the seam it moved to. */
  assert.ok(ab.indexOf('makeRuntime(IM_HOST);') < ab.indexOf('IM_MOBIN.crosshair();'),
    '…and it is built before the first registration');
  assert.ok(ab.indexOf('makeRuntime(IM_HOST);') < ab.indexOf('window.IntMapModules.mobileMapInput(IM_HOST)'),
    '…and before the factory that will register it is even built');
  assert.match(read('js/mobile-map-input.js'), /RT\(\)\.onCamera\('shell\.crosshair\.read',[\s\S]{0,200}\{phase:'read'\}\)/,
    'the crosshair samples the camera in the READ phase — a WRITE-phase read is a forced layout (#R498)');
});
}

/* ═══ from tests/r236-checks.test.mjs (tests #1, #2, #3, #4, #5 of 14) ═══
    R236 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).

    ⚠⚠ AND THE FIRST GROUP DRIVES THE REAL SCHEDULER RATHER THAN GREPPING FOR IT.
    #R235's own lesson was that `_pathDeg`'s unit test passed while the caller threw
    its result away — «関数を検査しても配線は検査されない». The runtime is an
    ES module with one export, so the honest check is to RUN it: stub the four
    globals it touches, pump the frame clock by hand, and count. */
{
/* ⚠ comments quote the instructions, and the instructions quote the strings the checks look for
   (#R208/#R215/#R231/#R232/#R234/#R235 — EIGHT rounds of a check hitting its own explanation).
   Strip the comments and match the SYNTAX. */

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
}
