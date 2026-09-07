/* ============================================================================
 *  R537 — THE STOP BUTTON THAT WAS UNREACHABLE, AND TWO OTHER THINGS #R527 SHIPPED WRONG
 * ----------------------------------------------------------------------------
 *  #R527 added the photograph search. Verifying it ON PRODUCTION found three defects that every
 *  gate had passed, and all three are the same shape: code that is correct where it was written and
 *  never reached where it runs.
 *
 *   ① THE STOP BUTTON. js/photo-geo-search.js asked `hooks.shouldAbort()` on every point — from a
 *     SYNCHRONOUS loop. On the page that is right: the predicate reads a variable the same thread
 *     just set. In a Worker it is useless, because the flag is set by `self.onmessage` and a worker
 *     running a synchronous loop never returns to its event loop, so the message is still queued
 *     when the search ends. MEASURED on production three times: stop pressed during the sweep,
 *     ignored every time, run completed and reported `done`/`match` instead of `aborted`. It DID
 *     work during tile loading, because that path awaits fetches and so drains the queue — which is
 *     exactly why it looked implemented.
 *   ② `state()` THREW between the drop and the decode: `state.file` is set first and `state.orig`
 *     about a second later, and the accessor read `state.orig.width`. Atlas polls that accessor.
 *   ③ A BARE `{"type":"photoLocate"}` STARTED A REAL SEARCH when the photograph and rectangle
 *     happened to be ready — 625 points, 280 tiles, ~12 MB on the production measurement — with no
 *     confirmation, and (because of ①) no way to stop it.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
await import('../js/photo-geo-terrain.js');
await import('../js/photo-geo-match.js');
await import('../js/photo-geo-search.js');
const T = globalThis.IntMapPhotoTerrain, Q = globalThis.IntMapPhotoSearch;
const src = (f) => readFileSync(join(ROOT, f), 'utf8');

function flatStore(metres) {
  const tile = new Float32Array(65536).fill(metres);
  return { get: () => tile };
}
/* a photograph-shaped input: a flat traced skyline across a small frame */
function photoOf(w, h) {
  return { sky: new Int32Array(w).fill(Math.round(h * 0.4)), use: new Uint8Array(w).fill(1), w, h };
}

test('R537 ①: the sweep yields, so a stop set from OUTSIDE the loop actually stops it', async () => {
  /* This is the production bug, reproduced without a worker: the abort flag is flipped from a
     MACROTASK, exactly as `self.onmessage` would flip it. A loop that never yields can never see
     it — before the fix this test ran to completion and reported aborted:false. */
  const area = { south: 0, north: 0.012, west: 0, east: 0.012 };
  const BANDS = [{ r: 700, z: 13 }, { r: 2500, z: 11 }];
  const field = T.buildField({ lat: 0.006, lon: 0.006 }, area, flatStore(300), { bands: BANDS });
  const photo = photoOf(240, 180);

  let stop = false;
  setTimeout(() => { stop = true; }, 30);          /* a macrotask, like a worker message */
  const res = await Q.run(field, photo, { spacingM: 90, bands: BANDS, tickEvery: 1 }, {
    tick: () => new Promise(r => setTimeout(r, 0)),
    shouldAbort: () => stop
  });
  assert.ok(res, 'the run returns a result');
  assert.equal(res.aborted, true, 'a stop raised from outside the loop must be seen');
  assert.ok(res.stats.coarsePointsVisited < res.stats.coarsePointsPlanned,
    `it must stop EARLY (visited ${res.stats.coarsePointsVisited} of ${res.stats.coarsePointsPlanned})`);
  /* …and an aborted run still returns what it had, because a stop button that throws the work away
     is a destructive button */
  assert.ok(Array.isArray(res.candidates), 'an aborted run still reports its candidates');
  assert.ok(res.verdict && res.verdict.code, 'and still carries a verdict');

  /* ⚠ AND THE SAME RUN WITHOUT THE YIELD CANNOT STOP — which is the bug, stated as a fact rather
     than left to be trusted. Identical setup, identical flag, no `tick`: the loop never returns to
     the event loop, the timer that flips the flag never fires, and the sweep runs to the end. If
     this half ever starts aborting, the yield has stopped being what makes the difference and the
     first half above is no longer testing anything. */
  let stop2 = false;
  setTimeout(() => { stop2 = true; }, 30);
  const blind = await Q.run(field, photo, { spacingM: 90, bands: BANDS }, {
    shouldAbort: () => stop2                      /* no tick: nothing yields */
  });
  assert.equal(blind.aborted, false, 'without a yield the flag cannot arrive — this is the defect');
  assert.equal(blind.stats.coarsePointsVisited, blind.stats.coarsePointsPlanned,
    'and the sweep runs to the very end');
});

test('R537 ①b: run is async and every caller awaits it — a floating promise would be silent', () => {
  const s = src('js/photo-geo-search.js');
  assert.match(s, /async function run\(field, photo, opts, hooks\)/, 'the sweep is async');
  assert.match(s, /if \(hk\.tick\) await hk\.tick\(\);/, 'and it awaits the caller between slices');
  assert.match(s, /MEASURED on production three\s*\n?\s*\*?\s*times/,
    'the measurement that forced this is recorded where the loop is');
  for (const f of ['src/photo-geo-worker.js', 'src/photo-geo-worker-client.js']) {
    const c = src(f);
    assert.match(c, /await Q\.run\(/, f + ' awaits the sweep');
    /* ⚠ the yield must be a MACROTASK: a microtask drains promises and leaves the message queued */
    assert.match(c, /setTimeout\(r, 0\)/, f + ' yields on a macrotask, not a microtask');
  }
});

test('R537 ②: state() answers during the window between the drop and the decode', () => {
  /* the accessor is inside a factory that needs a DOM, so this reads the shipped source for the
     guard rather than instantiating a panel — the failure was a null dereference, and the fix is
     that `state.orig` is checked before it is read. */
  const s = src('js/photo-geo.js');
  const line = s.split('\n').find(l => /photo: \(state\.file && state\.orig\)/.test(l));
  assert.ok(line, 'the photo section of state() checks state.orig before reading it');
  assert.match(s, /decoding: true/, 'and says so, rather than pretending there is no photograph');
  assert.match(s, /skyline: \(state\.skyline && state\.analysis\)/,
    'the skyline section is guarded the same way');
  assert.ok(!/width: state\.orig\.width, height: state\.orig\.height, hasExifGps[^}]*\}\s*:\s*null/.test(
    s.replace(/\(state\.file && state\.orig\)[\s\S]{0,400}?decoding: true \}/, '')),
    'no unguarded read of state.orig survives');
});

test('R537 ③: opening the tool does not start a search that costs minutes', () => {
  const s = src('js/atlas-console.js');
  assert.match(s, /if\(pgAct!=='search'\) return R\(true,note\(L\('The photograph and the search area are both ready/,
    'a call without action:"search" reports readiness instead of sweeping');
  /* the sweep is still reachable — this is a gate, not a removal */
  assert.match(s, /const pgP=PG\.search\(\);/, 'action:"search" still runs it');
  /* and the model is told, where it reads what the call does */
  const cat = src('js/atlas-catalog-text.js');
  assert.match(cat, /THE SWEEP IS NOT STARTED BY OPENING THE TOOL/,
    'the catalogue says the sweep needs to be asked for');
  assert.match(cat, /"photoLocate"/, 'and the spelling the dispatcher answers to is still quoted');
});
