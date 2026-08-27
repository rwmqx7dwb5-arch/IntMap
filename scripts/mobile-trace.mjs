/* ============================================================================
 *  IntMap · ONE CONTINUOUS MOBILE TRACE, IN TWO ENGINES  (#R387)
 * ----------------------------------------------------------------------------
 *  「実iPhone Safariを対象に、起動→最初のpan→最初のzoom→暖機後→気象ON→警報ONまでを1本の性能
 *   トレースとして測定し、MapLibre label placement / raster decode / texture upload / worker clone /
 *   GC / IntMap JS を完全に時間帰属すること」
 *
 *  A real iPhone cannot be reached from this machine (Windows, no Safari, no device bridge), so the
 *  engine — not the phone — is what this instrument varies. Playwright's WebKit is the same engine
 *  family iOS Safari is built on (JavaScriptCore + WebCore); Chromium is what every mobile number
 *  this repo owns was taken in. Running the SAME scripted trace through both, on the same machine,
 *  in the same minute, off the same replayed bytes, isolates exactly one variable.
 *
 *  ⚠ THE CPU IS HELD CONSTANT ON PURPOSE. frame-profile.mjs's mobile profile throttles the CPU 4×
 *  through CDP, and CDP does not exist in WebKit. Throttling one arm and not the other would make
 *  the comparison meaningless, so `--cpu` defaults to 1 HERE and the historical ×4 Chromium figure
 *  stays where it was measured. A number from this script is an ENGINE comparison on desktop
 *  silicon, not a phone number, and the printout says so on every run.
 *
 *  ── WHAT IS AND IS NOT COMPARABLE ─────────────────────────────────────────────────────────────
 *   comparable │ every bucket in scripts/trace-probe.js — placement, render, texUpload, bufUpload,
 *              │ decode, workerPost, workerRecv, frames, busy (>2 ms gaps), blocking. All standard DOM.
 *   Chromium   │ heap (CDP HeapProfiler + Performance.getMetrics), CPU throttling, network
 *   only       │ throttling, the `longtask` observer. Printed as "—" for WebKit, never as 0.
 *
 *  ── THE CROSS-CHECK THAT MAKES THE WEBKIT NUMBER CREDIBLE ─────────────────────────────────────
 *  The probe's attribution is a wrapper count, not a sampling profiler, and a wrapper can only see
 *  what it wrapped. So Chromium is measured TWICE — once by the probe and once by the CDP sampling
 *  profiler (--verify) — and the two are printed side by side. If the wrapper-based decomposition
 *  agrees with the sampler in the engine where both exist, the same decomposition in the engine
 *  where only one exists is evidence rather than assertion. If they disagree, the disagreement is
 *  the finding and is printed rather than smoothed.
 *
 *  USAGE
 *    node scripts/mobile-trace.mjs --record                  # once: fill the replay cache
 *    node scripts/mobile-trace.mjs                           # both engines, mobile profile
 *    node scripts/mobile-trace.mjs --engine webkit
 *    node scripts/mobile-trace.mjs --cpu 4 --engine chromium # the historical throttled profile
 *    node scripts/mobile-trace.mjs --verify                  # + the CDP sampler cross-check
 *      …with  --desktop  --reps N (default 3)  --base http://127.0.0.1:4373  --json <path>
 *
 *  ── ⚠⚠⚠ (#R496) AND SINCE #R496, TWO PHASES DRIVEN BY A REAL FINGER ──────────────────────────
 *  Everything above is driven through `IntMapGeoEngine.camera` — an animated easeTo/panBy — for the
 *  reason #R352 recorded: a synthesised MouseEvent never reaches MapLibre's handlers, and page.mouse
 *  is viewport-relative while the map is offset. That reason is about the MOUSE. It left this
 *  instrument unable to see the whole of the reported defect, which is about a FINGER: a camera
 *  command produces no touchstart, no touchmove, no pinch recognition, and therefore never runs the
 *  app's own touch handlers or MapLibre's — so the two hottest paths #R496 found (a
 *  `getBoundingClientRect()` per touchmove in the long-press handler, and a write→read→write
 *  crosshair task on the same frames) contributed EXACTLY ZERO to every mobile number this repo owns.
 *  `Input.dispatchTouchEvent` produces trusted touch events, so `pan-touch` and `pinch-touch` run
 *  the real input path, and each reports what a camera command cannot: forced-layout reads per
 *  touchmove, and the delay from the event to the frame that answers it.
 *  ⚠ CHROMIUM ONLY, AND SAID SO RATHER THAN SKIPPED. CDP does not exist in Playwright's WebKit, so
 *  those phases are absent from the WebKit arm — reported as absent, never as a cost of zero (#R322).
 * ==========================================================================*/
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { PORT } from '../tests/helpers/session-seed.js';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROBE = join(ROOT, 'scripts', 'trace-probe.js');

/* ⚠ THE BASE URL HAS TO BE DECIDED BEFORE frame-profile.mjs IS IMPORTED, and pushed onto argv rather
   than kept in a variable. That module reads `--base` at import time and its replay() lets a URL
   through untouched only when it starts with ITS OWN BASE — so if the two disagreed by one port
   number, every request for the app's own HTML and chunks would be answered out of the tile cache
   (or blocked). #R282's per-checkout port is used by default so parallel sessions do not share a
   server and silently measure each other's dist/ (tests/helpers/session-seed.js).

   ⚠ AND argv HAS TO BE PADDED FIRST. Both modules read `process.argv.slice(2)`, which assumes the
   node/script pair is there — and it is not when this file is imported from `node -e` or from a test
   runner, where argv can be a single element. Pushing onto a short array puts `--base` at index 1,
   slice(2) drops it, and frame-profile.mjs silently keeps its default 4173. Caught by ⑥, which
   exists because this is invisible in normal use and total when it happens. */
while (process.argv.length < 2) process.argv.push('');
if (!process.argv.includes('--base')) process.argv.push('--base', `http://127.0.0.1:${PORT}`);

/* ⚠ #R322's note on the exported pieces: a second harness that grew its own replay cache would make
   the two arms differ by the cache as well as by the engine, which is the one thing this may not do.
   newContext() carries the route() interception, the mobile viewport/DPR/UA and the service-worker
   block; `stats` is the shared hit/miss tally. */
const FP = await import('./frame-profile.mjs');
const { newContext, stats, BASE, avg, q } = FP;

const pw = require(join(ROOT, 'node_modules', 'playwright-core', 'index.js'));
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

/* ── the harness owns its server ──────────────────────────────────────────
   Same arrangement playwright.config.js's webServer has, and for the same reason: a measurement that
   depends on someone having started a server by hand is a measurement that will one day be taken
   against a stale dist/. Started only if nothing answers, and taken down again at the end. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function reachable(u) { try { const r = await fetch(u, { method: 'GET' }); return r.ok || r.status === 304; } catch (_) { return false; } }
/* ⚠ AND IT HAS TO BE **OUR** dist/. The per-checkout port is a hash of the path modulo 200, so two
   worktrees CAN land on the same number, and #R282 recorded what that costs when they do: the second
   session skips its own build and measures the first one's dist/ — green, and about code that was
   never changed. Reachable is not the test; byte-identical index.html is. */
async function servingOurDist(base) {
  try {
    const served = Buffer.from(await (await fetch(base + '/index.html')).arrayBuffer());
    const local = readFileSync(join(ROOT, 'dist', 'index.html'));
    return createHash('sha256').update(served).digest('hex') === createHash('sha256').update(local).digest('hex');
  } catch (_) { return false; }
}
async function ensureServer(base) {
  if (await reachable(base)) {
    if (await servingOurDist(base)) { console.log(`  reusing the server already at ${base} — it is serving this checkout's dist/`); return null; }
    throw new Error(`something is already listening on ${base} and it is NOT this checkout's dist/ (${join(ROOT, 'dist')}).\n`
      + '  Two worktrees hashed to the same port. Re-run with --base http://127.0.0.1:<free port> after starting a server there.');
  }
  const port = new URL(base).port;
  const p = spawn(process.execPath, [join(ROOT, 'scripts', 'serve.mjs'), '--root', join(ROOT, 'dist'), '--port', port], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { await sleep(500); if (await reachable(base)) { console.log(`  serving ${join(ROOT, 'dist')} at ${base}`); return p; } }
  try { p.kill(); } catch (_) {}
  throw new Error('no server came up at ' + base);
}

const CPU = Number(val('--cpu', 1));
const REPS = Number(val('--reps', 3));
const VERIFY = has('--verify');
const ENGINES = (() => {
  const e = val('--engine', 'both');
  return e === 'both' ? ['chromium', 'webkit'] : [e];
})();

/* candidates, most-likely first — see layerOn() for why this is a list and not a constant */
const WIND_CB = ['dl-wind', 'dl-ec-wind'];
const ALERT_CB = ['wp-dl-alerts', 'dl-alerts'];
const PAN = { dx: 170, dy: 120, ms: 900 };
const ZOOM = { dz: 2, ms: 1100 };
/* (#R496) a finger drag of about the same size as PAN, at about 60 Hz, and a two-finger spread */
const TPAN = { dx: 150, dy: 110, steps: 36, ms: 16 };
const TPINCH = { from: 60, to: 220, steps: 36, ms: 16 };
/* (#R496) …and the gesture the alerts report is actually about: a SMALL pan, at city zoom */
const TPAN_SMALL = { dx: 55, dy: 40, steps: 20, ms: 16 };
const CITY_Z = 11;

const BUCKETS = ['placement', 'render', 'mapRender', 'texUpload', 'bufUpload', 'decode', 'workerPost', 'workerRecv'];

/* ── engine launch ─────────────────────────────────────────────────────────
   `--use-angle=d3d11` is #R202's flag and is Chromium's alone: it picks the real GPU over
   SwiftShader. WebKit on Windows has no equivalent switch — it uses the system ANGLE build — so the
   arms differ in one way that cannot be removed, and that limitation is printed with the result
   instead of being left for a reader to discover. */
function launch(engine) {
  return engine === 'webkit' ? pw.webkit.launch() : pw.chromium.launch({ args: ['--use-angle=d3d11'] });
}

/* ── what only Chromium can answer ───────────────────────────────────────── */
async function cdpFor(engine, ctx, page) {
  if (engine !== 'chromium') return null;
  try {
    const cdp = await ctx.newCDPSession(page);
    if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    try { await cdp.send('Performance.enable'); } catch (_) {}
    try { await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); } catch (_) {}
    return cdp;
  } catch (_) { return null; }
}
async function heapOf(cdp) {
  if (!cdp) return null;                              /* ⚠ null, not 0 — WebKit did not decline to be big */
  try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) {}
  try {
    const m = await cdp.send('Performance.getMetrics');
    const g = (n) => (m.metrics.find((x) => x.name === n) || {}).value || 0;
    return { heapMB: +(g('JSHeapUsedSize') / 1048576).toFixed(2), nodes: g('Nodes'), listeners: g('JSEventListeners') };
  } catch (_) { return null; }
}

/* ⚠ THERE IS NO CALIBRATION AT ALL ANY MORE, AND TWO EARLIER VERSIONS OF THIS FILE HAD ONE.
   `busy` was `wall − pings × tick0`, with tick0 the ping loop's own idle cost. Both ways of
   estimating tick0 failed, in opposite directions, and each failure was total rather than partial:
     · from a quiet `about:blank`, the mean gap is 0.011 ms in Chromium and 50 ms in WebKit, because
       a page Playwright is not driving gets THROTTLED. A tick0 50× too large drives busy to 0;
     · from the run's own smallest gap, Chromium reports 0.100 ms against a 0.013 ms mean —
       `performance.now()` is quantised to 0.1 ms there, so the "floor" is the clock's resolution,
       not the queue's. MEASURED: 7,011,938 × 0.1 ms = 701 s charged against a 90 s run.
   The probe now accumulates busy directly, as time spent in gaps longer than 2 ms, which is above
   both engines' floor and needs no calibration. See scripts/trace-probe.js. The floor and the mean
   are still printed per rep, as diagnostics about the engine — not as inputs to any number. */

/* ⚠ EVERY PROTOCOL CALL IN A REP GOES THROUGH THIS. A wedged WebKit page answers nothing at all —
   not `page.evaluate(() => 'yes')`, not a snapshot — and Playwright's own timeouts do not cover a
   bare `evaluate`. Without a deadline the harness prints one line and then sits, which is how two
   twelve-minute silences happened on a run whose whole subject was an engine that wedges. */
const DEADLINE_MS = Number(process.argv.includes('--phase-timeout')
  ? process.argv[process.argv.indexOf('--phase-timeout') + 1] : 150_000);
const deadline = (p, what) => Promise.race([p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} wedged: the page stopped answering after ${DEADLINE_MS} ms`)), DEADLINE_MS))]);

const snap = (page) => page.evaluate(() => window.__imTrace.snap());
const framesBetween = (page, a, b) =>
  page.evaluate(([i, j]) => window.__imTrace.frames.slice(i, j), [a.frames, b.frames]);

function phaseOf(a, b, frames) {
  const wall = b.t - a.t;
  const busy = (b.busy || 0) - (a.busy || 0);      /* time in ping gaps over 2 ms — see the probe */
  const self = {};
  let attributed = 0;
  for (const k of BUCKETS) {
    const v = (b.self[k] || 0) - (a.self[k] || 0);
    self[k] = +v.toFixed(1);
    attributed += v;
  }
  const calls = {};
  for (const k of BUCKETS) calls[k] = (b.calls[k] || 0) - (a.calls[k] || 0);
  const f = frames.filter((x) => x > 0 && x < 5000).sort((x, y) => x - y);
  return {
    wallMs: Math.round(wall),
    busyMs: Math.round(busy),
    blockingMs: Math.round(b.blocking - a.blocking),
    gap50: b.gap50 - a.gap50, gap100: b.gap100 - a.gap100,
    self, calls,
    attributedMs: +attributed.toFixed(1),
    otherMs: +Math.max(0, busy - attributed).toFixed(1),
    overAttributed: attributed > busy,
    decodeLatencyMs: +(((b.lat.decode || 0) - (a.lat.decode || 0))).toFixed(1),
    frames: f.length,
    fps: f.length ? +(1000 / avg(f)).toFixed(1) : null,
    worstFrameMs: f.length ? +q(f, 0.99).toFixed(1) : null,
  };
}

/* ── the gestures ─────────────────────────────────────────────────────────
   Driven through IntMapGeoEngine.camera (an animated easeTo/panBy, so the renderer draws a real
   sequence of frames) rather than through synthetic input events. #R352 measured why: a synthesized
   MouseEvent never reaches MapLibre's handlers at all, and page.mouse is viewport-relative while the
   map is offset by the sidebar, so an input-driven gesture silently lands somewhere else. The camera
   path is also the one the existing corpus used (frame-profile.mjs's sweep()), which keeps this
   comparable with it. */
/* ⚠ SIX SECONDS, NOT TWENTY, AND THE TIMEOUTS ARE COUNTED. `map.loaded()` stays false while ANY
   source is still fetching, and this harness deliberately blocks uncached requests — so with a
   partly-cold replay cache every gesture paid the full ceiling and the wall column filled up with
   the instrument's own patience: a 1.1 s zoom was reported as 38 s. The number that matters is busy
   time, which is unaffected, but a wall column nobody can read is a wall column nobody checks. */
let unsettled = 0;
/* ⚠ INTERVAL POLLING, AND A HARD DEADLINE ON TOP OF PLAYWRIGHT'S OWN.
   `waitForFunction` polls with requestAnimationFrame by default, and rAF is the one primitive that
   effectively stops in a WebKit page Playwright is not actively driving — MEASURED at one frame in
   600 ms on a settled page, against 60 fps in Chromium. A six-second wait sat there for ELEVEN
   MINUTES before this was found, printing nothing, on a run whose whole point was measuring WebKit.
   `polling: 500` does not depend on the frame loop; the race is belt and braces, because a waiter
   that can outlive its own timeout has already been observed once in this engine. */
function waitFor(page, fn, ms) {
  return Promise.race([
    page.waitForFunction(fn, null, { timeout: ms, polling: 500 }).then(() => true, () => false),
    new Promise((r) => setTimeout(() => r(false), ms + 2000)),
  ]);
}
async function settle(page, ms) {
  const ok = await waitFor(page, () => {
    try { const m = window.IntMapGeoEngine.raw(); return !!(m && m.loaded && m.loaded()); } catch (_) { return false; }
  }, 6_000);
  if (!ok) unsettled++;
  await page.waitForTimeout(ms);
}
async function pan(page) {
  await page.evaluate(async (P) => {
    const E = window.IntMapGeoEngine, m = E.raw();
    await new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; try { m.off('moveend', fin); } catch (_) {} res(); };
      m.on('moveend', fin); setTimeout(fin, P.ms + 5000);
      try { m.panBy([P.dx, P.dy], { duration: P.ms }); } catch (_) { fin(); }
    });
  }, PAN);
  await settle(page, 600);
}
async function zoom(page, dir) {
  await page.evaluate(async (P) => {
    const E = window.IntMapGeoEngine, m = E.raw();
    const c = E.camera.get();
    await new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; try { m.off('moveend', fin); } catch (_) {} res(); };
      m.on('moveend', fin); setTimeout(fin, P.ms + 5000);
      try { E.camera.easeTo({ center: c.center, zoom: c.zoom + P.dz, duration: P.ms }); } catch (_) { fin(); }
    });
  }, { ...ZOOM, dz: ZOOM.dz * dir });
  await settle(page, 600);
}

/* ══ (#R496) REAL FINGER INPUT ═══════════════════════════════════════════════════════════════
   `Input.dispatchTouchEvent` is the only way to produce a TRUSTED touch, which is what MapLibre's
   TouchPanHandler / TouchZoomRotateHandler and the app's own long-press listener are waiting for.
   The coordinates are viewport CSS pixels, so they are taken from the canvas's own box rather than
   assumed — #R352's other half of the same lesson. */
async function canvasBox(page) {
  return page.evaluate(() => {
    const r = window.IntMapGeoEngine.render.canvas().getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
}
/* ⚠ THE TWO COUNTERS THIS PHASE EXISTS FOR. `busy` and `fps` cannot tell a forced synchronous
   layout from any other millisecond, and a forced layout is precisely what the input path was
   paying: the count of `getBoundingClientRect` / `getComputedStyle` calls PER TOUCHMOVE is the
   number that goes to 0 when the defect is gone and stays whatever it is when it is not.
   The third number is the one a camera command can never produce: touchmove → the frame that
   answers it, which is 「指に付いてこない」 stated as a measurement. */
async function touchMetersOn(page) {
  await page.evaluate(() => {
    const S = window.__imTouch = { rect: 0, style: 0, moves: 0, lat: [] };
    if (!window.__imTouchWrapped) {
      window.__imTouchWrapped = true;
      const ER = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () { if (window.__imTouch) window.__imTouch.rect++; return ER.apply(this, arguments); };
      const GS = window.getComputedStyle;
      window.getComputedStyle = function () { if (window.__imTouch) window.__imTouch.style++; return GS.apply(this, arguments); };
    }
    /* capture, so `t` is when the event ARRIVED — before the app's own handlers, not after them */
    S.on = () => { S.moves++; const t = performance.now(); requestAnimationFrame(() => S.lat.push(performance.now() - t)); };
    try { window.IntMapGeoEngine.render.canvas().addEventListener('touchmove', S.on, { passive: true, capture: true }); } catch (_) {}
  });
}
async function touchMetersOff(page) {
  return page.evaluate(() => {
    const S = window.__imTouch; if (!S) return null;
    try { window.IntMapGeoEngine.render.canvas().removeEventListener('touchmove', S.on, { capture: true }); } catch (_) {}
    window.__imTouch = null;                                 /* the wrappers stop counting here */
    const l = S.lat.slice().sort((a, b) => a - b);
    const pick = (f) => (l.length ? +l[Math.min(l.length - 1, Math.floor(l.length * f))].toFixed(1) : null);
    return {
      moves: S.moves, rect: S.rect, style: S.style,
      rectPerMove: S.moves ? +(S.rect / S.moves).toFixed(2) : null,
      stylePerMove: S.moves ? +(S.style / S.moves).toFixed(2) : null,
      latP50: pick(0.5), latP95: pick(0.95), latMax: l.length ? +l[l.length - 1].toFixed(1) : null,
    };
  });
}
async function touchPan(page, cdp, P) {
  P = P || TPAN;
  const b = await canvasBox(page);
  const x0 = b.x + b.w / 2 + P.dx / 2, y0 = b.y + b.h * 0.42 + P.dy / 2;
  const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  await send('touchStart', [{ x: x0, y: y0, id: 0 }]);
  for (let i = 1; i <= P.steps; i++) {
    const k = i / P.steps;
    await send('touchMove', [{ x: x0 - P.dx * k, y: y0 - P.dy * k, id: 0 }]);
    await sleep(P.ms);
  }
  await send('touchEnd', []);
  await settle(page, 600);
}
async function touchPinch(page, cdp) {
  const b = await canvasBox(page);
  const cx = b.x + b.w / 2, cy = b.y + b.h * 0.42;
  const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const pts = (r) => [{ x: cx - r, y: cy, id: 0 }, { x: cx + r, y: cy, id: 1 }];
  await send('touchStart', pts(TPINCH.from));
  for (let i = 1; i <= TPINCH.steps; i++) {
    await send('touchMove', pts(TPINCH.from + (TPINCH.to - TPINCH.from) * (i / TPINCH.steps)));
    await sleep(TPINCH.ms);
  }
  await send('touchEnd', []);
  await settle(page, 600);
}
async function zoomTo(page, z) {
  await page.evaluate(async (zz) => {
    const E = window.IntMapGeoEngine, m = E.raw();
    await new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; try { m.off('moveend', fin); } catch (_) {} res(); };
      m.on('moveend', fin); setTimeout(fin, 6000);
      try { E.camera.easeTo({ center: E.camera.get().center, zoom: zz, duration: 800 }); } catch (_) { fin(); }
    });
  }, z);
  await settle(page, 1500);
}

/* ── switching a layer on, without trusting a hard-coded id ────────────────
   ⚠ THE FIRST RUN OF THIS SCRIPT GOT BOTH IDS WRONG AND SAID SO, WHICH IS THE ONLY REASON THIS
   FUNCTION LOOKS LIKE THIS. `dl-ec-wind` is the id of the layer PREVIEW canvas (js/layer-previews.js),
   not of a checkbox — the wind toggle is `dl-wind` — and the alerts toggle is `wp-dl-alerts`, in the
   world-packs namespace. Both were reported as ran:false / result:false rather than as a phase that
   cost nothing (#R322's rule), so the wrong number never got written down.
   Three things now have to hold before a phase counts as driven: an element with that id exists, it
   really is a checkbox, and AFTER the command it really is checked. A command that returns ok and
   leaves the box alone is the failure this repo keeps rediscovering. */
async function layerOn(page, candidates) {
  return page.evaluate(async (ids) => {
    const seen = [];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const cb of ids) {
      const el = document.getElementById(cb);
      if (!el) { seen.push(cb + ':absent'); continue; }
      if (el.type !== 'checkbox') { seen.push(cb + ':' + el.tagName.toLowerCase() + (el.type ? '/' + el.type : '')); continue; }
      if (el.checked) return { ran: true, id: cb, already: true };
      /* ⚠ THREE ROUTES, TRIED IN ORDER, AND NONE OF THEM AWAITS THE APP.
         Every way of getting this wrong was measured here, in this order:
           · NOT awaiting IntMapOS.exec reads `checked` before the command has run (#R318's
             «exec の非同期の嘘») and reports stayed-off for a toggle that works;
           · AWAITING it hangs the whole harness — switching the alert layer on starts network work
             and the promise never settles when a request cannot be answered. Two diagnostic runs
             sat inside one page.evaluate until they were killed;
           · and el.click(), the path a reader actually takes, ALSO leaves the box off here, because
             the layer row cancels the click.
         So: try the reader's route first, fall back to the app's own command WITHOUT awaiting it,
         and only then set the property and fire the `change` the app listens for. Each route is
         followed by a bounded poll, and the route that worked is reported — a phase driven through
         the third route is a weaker statement than one driven through the first, and the JSON has
         to be able to say which it was. */
      const stuck = async (ms) => {
        for (let i = 0; i < ms / 100; i++) {
          const now = document.getElementById(cb);
          if (now && now.checked) return i * 100;
          await wait(100);
        }
        return -1;
      };
      let waited = -1, via = null;
      try { el.click(); via = 'click'; waited = await stuck(1000); } catch (_) {}
      if (waited < 0) {
        try {
          const OS = window.IntMapOS;
          if (OS && OS.exec) { Promise.resolve(OS.exec('layer.on', { id: cb, source: 'ui' })).catch(() => {}); via = 'exec'; waited = await stuck(3000); }
        } catch (_) {}
      }
      if (waited < 0) {
        try { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); via = 'change'; waited = await stuck(3000); } catch (_) {}
      }
      if (waited >= 0) return { ran: true, id: cb, via, waitedMs: waited };
      seen.push(cb + ':stayed-off(disabled=' + !!el.disabled + ')');
    }
    return { ran: false, why: 'no candidate turned on', tried: seen };
  }, candidates);
}

async function traceOnce(engine, rep) {
  unsettled = 0;
  const browser = await launch(engine);               /* a fresh browser per rep: the only cold-cache
                                                           lever that exists in both engines */
  const ctx = await newContext(browser);
  await ctx.addInitScript({ path: PROBE });
  const page = await ctx.newPage();
  const cdp = await cdpFor(engine, ctx, page);
  const raw = []; const extra = {}; const marks = [];
  const t0 = Date.now();
  try {

  process.stdout.write(`    · ${engine} navigate …`);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180_000 });
  let a = await snap(page);
  let bootOk = true;
  bootOk = await waitFor(page, () => window.__imBoot && window.__imBoot.isDone(), 120_000);
  process.stdout.write(` boot ${Date.now() - t0} ms (ready=${bootOk})\n`);

  /* ⚠ SNAPSHOTS NOW, ARITHMETIC AT THE END. tick0 — the ping loop's own cost per round trip — is
     not known until the run is over, because the only trustworthy estimate of it is the SMALLEST
     gap the loop ever saw (see the probe). Computing each phase as it closed would have to use a
     number measured on a different page, and in WebKit that number was 50× wrong. */
  /* ⚠ A PHASE THAT IS TAKING TOO LONG HAS TO BE VISIBLE WHILE IT IS TAKING TOO LONG. The first
     two-engine run printed nothing for fifteen minutes and there was no way to tell a slow WebKit
     boot from a wait that would never end. One line per phase, flushed as it closes. */
  /* ⚠ AND A WEDGED PAGE HAS TO FAIL, NOT WAIT. WebKit stops answering the protocol entirely when a
     request it needs is blocked or goes to a live network that does not answer — `page.evaluate`
     included, so every bounded wait inside the phase returns and the harness then hangs on the
     SNAPSHOT instead. Two runs sat like that for ten minutes each, printing nothing. Every phase now
     runs against a wall-clock deadline; tripping it ends the rep with a named error, and the run
     loop reports the rep as lost rather than losing the whole run. */
  const step = async (name, fn) => {
    const before = a;
    const t = Date.now();
    process.stdout.write(`    · ${engine} ${name} …`);
    await deadline(fn(), `phase "${name}"`);
    process.stdout.write(` ${Date.now() - t} ms\n`);
    const after = await deadline(snap(page), `phase "${name}" snapshot`);
    raw.push({ name, a: before, b: after, frames: await framesBetween(page, before, after) });
    a = after;
    marks.push(name);
  };

  /* boot is closed against the snapshot taken at domcontentloaded, so it holds the app's own
     start-up and nothing of the navigation the harness performed.
     ⚠ AND THE SNAPSHOT ITSELF HAS TO BE GUARDED, NOT JUST THE PHASES. A WebKit page that has wedged
     answers no protocol message at all, so the run does not hang inside a phase — it hangs on the
     very first `page.evaluate` after boot, which is here, before any phase has started. Two runs
     sat exactly there for twelve minutes. */
  {
    const after = await deadline(snap(page), 'boot snapshot');
    raw.push({ name: 'boot', a, b: after, frames: await deadline(framesBetween(page, a, after), 'boot frames') });
    extra.boot = { ready: bootOk };
    a = after;
  }

  const hooks = await deadline(page.evaluate(() => window.__imTrace.attachMap()), 'attachMap');
  const shim = await page.evaluate(() => window.__imTrace.rafShim);
  if (shim) throw new Error('the rAF shim is installed — every frame time would be a 33 ms timer');

  await step('settle', () => settle(page, 2500));
  await step('pan-first', () => pan(page));
  await step('zoom-first', () => zoom(page, +1));
  await step('warm-up', async () => { await zoom(page, -1); await pan(page); await zoom(page, +1); await zoom(page, -1); });
  await step('pan-warm', () => pan(page));
  await step('zoom-warm', () => zoom(page, +1));
  await step('zoom-back', () => zoom(page, -1));

  /* (#R496) the same warm map, driven by a finger instead of by a camera command */
  const touched = async (name, fn) => {
    await step(name, async () => { await touchMetersOn(page); await fn(); extra[name] = { touch: await touchMetersOff(page) }; });
  };
  if (cdp) {
    await touched('pan-touch', () => touchPan(page, cdp));
    await touched('pinch-touch', () => touchPinch(page, cdp));
  }

  /* ⚠ A PHASE THAT DID NOT HAPPEN POISONS THE ONES AFTER IT, not just itself. The first run spent
     92 s inside a wait for a wind field that was never going to arrive, and the two phases that
     followed it inherited whatever the app had queued up in that time — 20 s of pan at 4.5 fps that
     had nothing to do with alerts. So a failure here marks everything downstream `tainted` rather
     than letting a plausible-looking number be read as a measurement of the feature. */
  let wx = null, al = null, taint = false;
  await step('weather-on', async () => {
    wx = await layerOn(page, WIND_CB);
    if (wx.ran) {
      /* ⚠ THE ECMWF FIELD DOES NOT ARRIVE INSIDE THIS HARNESS, AND WAITING LONGER DOES NOT HELP.
         MEASURED: two recording passes, one of them after purging every failure the cache had
         memorised, both waited 187 s and both ended with `field:false`. The field is a set of large
         HTTP Range requests against Open-Meteo's `.om` files; `route.fetch()` gives up on them at
         20 s, writes the failure into the cache, and every later run replays THAT.
         So the wait is capped at a bounded, identical-in-both-engines 25 s and what the phase
         actually measures is stated instead of implied: switching the wind layer on, the module
         load and the layer construction behind it — NOT the field decode. `field` and `windLayers`
         are both reported so a reader can never mistake one for the other. #R325's 1,190 ms colour
         step is a different measurement, taken with a live network. */
      wx.field = await waitFor(page, () => {
        try { return !!(window.IntMapECMWF && window.IntMapECMWF.sampler && window.IntMapECMWF.sampler('wind_u_component_10m')); }
        catch (_) { return false; }
      }, 25_000);
      wx.windLayers = await page.evaluate(() => {
        try {
          const s = window.IntMapGeoEngine.raw().getStyle();
          return (s.layers || []).filter((l) => /wind/i.test(l.id)).length;
        } catch (_) { return null; }
      });
    }
    await settle(page, 2500);
  });
  extra['weather-on'] = { driven: wx };
  /* ⚠ THE QUESTION IS WHAT THE RENDERER HAS, NOT WHAT THE SOURCE INTENDED (#R353). The box being
     checked is the app's opinion; a wind layer existing in `getStyle().layers` is the renderer's.
     `field` is deliberately NOT part of this test — it is known not to arrive here (see above), and
     tainting every downstream phase on it would throw away the half of the measurement that works. */
  if (!wx.ran || !(wx.windLayers > 0)) taint = true;
  await step('pan-weather', () => pan(page));
  extra['pan-weather'] = { tainted: taint };

  await step('alerts-on', async () => {
    al = await layerOn(page, ALERT_CB);
    await settle(page, 6000);
  });
  extra['alerts-on'] = { driven: al, tainted: taint };
  if (!al.ran) taint = true;
  await step('pan-alerts', () => pan(page));
  extra['pan-alerts'] = { tainted: taint };

  /* ⚠ (#R496) 12,063 ms busy / 34.2 fps FOR THE ALERTS PHASE IS A NUMBER ABOUT A WHOLE-WORLD PAN.
     The report is about a phone in a city, so the layer is measured again where a reader meets it:
     zoomed to z11 and moved by a short finger drag, which is a different amount of geometry and a
     different amount of placement. The wide pan above is kept, unchanged, so the two are comparable. */
  await step('zoom-alerts-city', () => zoomTo(page, CITY_Z));
  extra['zoom-alerts-city'] = { tainted: taint, zoom: CITY_Z };
  if (cdp) {
    await touched('pan-alerts-city', () => touchPan(page, cdp, TPAN_SMALL));
    extra['pan-alerts-city'] = Object.assign({ tainted: taint }, extra['pan-alerts-city'] || {});
  } else {
    await step('pan-alerts-city', () => pan(page));
    extra['pan-alerts-city'] = { tainted: taint, note: 'camera-driven: no CDP in this engine' };
  }

  /* ── the floor, and what it says about this engine's resolution ─────────── */
  const clock = await page.evaluate(() => {
    const S = window.__imTrace;
    return { minGap: isFinite(S.minGap) ? S.minGap : null, pings: S.pings, gapSum: S.gapSum };
  });
  const phases = {};
  for (const r of raw) phases[r.name] = Object.assign(phaseOf(r.a, r.b, r.frames), extra[r.name] || {});

  const heap = await heapOf(cdp);
  const res = await page.evaluate(() => {
    const r = performance.getEntriesByType('resource');
    return {
      requests: r.length,
      kB: Math.round(r.reduce((s, x) => s + (x.encodedBodySize || 0), 0) / 1024),
      misses: (window.__imTrace.misses || []).slice(0, 12),
      hooks: Object.assign({}, window.__imTrace.hooks),
    };
  });
  return { engine, rep, totalMs: Date.now() - t0, phases, hooks, heap, res, marks, unsettled, clock };
  } finally { try { await ctx.close(); } catch (_) {} try { await browser.close(); } catch (_) {} }
}

/* ── the Chromium-only cross-check ────────────────────────────────────────
   Same navigation, same wait, but the CDP sampler running over it. Compared against the probe's own
   `mapRender + render + placement` for the same interval. Two instruments that disagree about the
   same milliseconds are a result, and the point of running it is that the ANSWER IS ALLOWED TO BE
   "they disagree" — #R345's most useful outcome was a suite staying green when it should not have. */
async function verifyChromium() {
  const browser = await pw.chromium.launch({ args: ['--use-angle=d3d11'] });
  const ctx = await newContext(browser);
  await ctx.addInitScript({ path: PROBE });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(() => window.__imBoot && window.__imBoot.isDone(), null, { timeout: 120_000 }).catch(() => {});
  await page.evaluate(() => window.__imTrace.attachMap());
  const a = await snap(page);
  await settle(page, 2000);
  await pan(page); await zoom(page, +1); await zoom(page, -1); await pan(page);
  const b = await snap(page);
  const { profile } = await cdp.send('Profiler.stop');

  const total = profile.endTime - profile.startTime;
  const hits = profile.nodes.reduce((s, n) => s + (n.hitCount || 0), 0) || 1;
  const per = total / hits / 1000;
  const byFn = new Map();
  for (const n of profile.nodes) {
    const h = n.hitCount || 0; if (!h) continue;
    const cf = n.callFrame || {};
    byFn.set(cf.functionName || '(anonymous)', (byFn.get(cf.functionName || '(anonymous)') || 0) + h * per);
  }
  await ctx.close(); await browser.close();
  const probe = phaseOf(a, b, []);
  return { sampler: [...byFn.entries()].sort((x, y) => y[1] - x[1]).slice(0, 20), probe, sampledMs: total / 1000 };
}

/* ── printing ─────────────────────────────────────────────────────────────── */
const pad = (s, n) => String(s).padStart(n);
function table(runs) {
  const names = runs[0].marks ? ['boot', ...runs[0].marks] : Object.keys(runs[0].phases);
  const uniq = [...new Set(names)];
  const med = (engine, phase, get) => {
    const v = runs.filter((r) => r.engine === engine).map((r) => get(r.phases[phase])).filter((x) => x != null);
    return v.length ? v.sort((a, b) => a - b)[Math.floor(v.length / 2)] : null;
  };
  const engines = [...new Set(runs.map((r) => r.engine))];
  for (const e of engines) {
    console.log(`\n  ${e.toUpperCase()}   phase          wall  busy>2   block  gap≥50   fps  worst │ placemt  render  mapRnd  texUpl  bufUpl  decode   wPost   wRecv │   other`);
    for (const p of uniq) {
      if (!runs.find((r) => r.engine === e && r.phases[p])) continue;
      const g = (f) => med(e, p, (x) => (x ? f(x) : null));
      const s = (k) => pad((g((x) => x.self[k]) ?? 0).toFixed(0), 7);
      console.log(`           ${p.padEnd(12)} ${pad(g((x) => x.wallMs), 7)} ${pad(g((x) => x.busyMs), 7)} ${pad(g((x) => x.blockingMs), 7)} ${pad(g((x) => x.gap50), 7)} ${pad(g((x) => x.fps) ?? '—', 5)} ${pad(g((x) => x.worstFrameMs) ?? '—', 6)} │${s('placement')}${s('render')}${s('mapRender')}${s('texUpload')}${s('bufUpload')}${s('decode')}${s('workerPost')}${s('workerRecv')} │ ${pad((g((x) => x.otherMs) ?? 0).toFixed(0), 7)}`);
    }
  }
  if (engines.length === 2) {
    console.log(`\n  WEBKIT ÷ CHROMIUM   phase          wall  busy>2   fps  worst │ placemt  render  texUpl  decode   wPost`);
    for (const p of uniq) {
      const r = (f) => {
        const c = med('chromium', p, (x) => (x ? f(x) : null)), w = med('webkit', p, (x) => (x ? f(x) : null));
        return (c && w && c > 0) ? (w / c).toFixed(2) + '×' : '—';
      };
      const s = (k) => pad(r((x) => x.self[k]), 8);
      console.log(`                      ${p.padEnd(12)} ${pad(r((x) => x.wallMs), 7)} ${pad(r((x) => x.busyMs), 7)} ${pad(r((x) => x.fps), 5)} ${pad(r((x) => x.worstFrameMs), 6)} │${s('placement')}${s('render')}${s('texUpload')}${s('decode')}${s('workerPost')}`);
    }
  }
}

/* ⚠ (#R496) THE TWO NUMBERS A CAMERA COMMAND CANNOT PRODUCE GET THEIR OWN TABLE, because they are
   not milliseconds of anything: `rect/move` and `style/move` are COUNTS of forced-layout questions
   asked per finger event — the quantity that is 0 when the input path is clean and stays whatever it
   is when it is not — and `lat` is the delay from a touchmove to the frame that answers it. */
function touchTable(runs) {
  const rows = [];
  for (const r of runs) for (const [p, v] of Object.entries(r.phases)) if (v && v.touch) rows.push([r.engine, r.rep, p, v.touch]);
  if (!rows.length) { console.log('\n  REAL TOUCH: no phase was driven by a finger (CDP is chromium-only)'); return; }
  console.log('\n  REAL TOUCH (CDP-dispatched finger events)   phase             moves  rect/move  style/move   lat p50  lat p95  lat max');
  for (const [e, rep_, p, t] of rows) {
    console.log(`    ${e} rep${rep_}  ${p.padEnd(18)} ${pad(t.moves, 6)} ${pad(t.rectPerMove ?? '—', 10)} ${pad(t.stylePerMove ?? '—', 11)} ${pad(t.latP50 ?? '—', 9)} ${pad(t.latP95 ?? '—', 8)} ${pad(t.latMax ?? '—', 8)}`);
  }
  console.log('    ⚠ rect/move and style/move include this harness\'s own wrappers on every element in the page,');
  console.log('      not only the map — they are a BUDGET for the input path, and the number to watch is the trend.');
}

/* (#R322's pattern) the pieces a regression check needs, so the arithmetic that decides what every
   number in the table means can be exercised without launching a browser. */
export { phaseOf, BUCKETS, layerOn, servingOurDist };

/* ── run ────────────────────────────────────────────────────────────────────
   …only when this file IS the command. Importing it must not start a server or a browser. */
const INVOKED = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (!INVOKED) { /* imported for its exports — nothing below runs */ } else {
const server = await ensureServer(BASE);
const stopServer = () => { if (server) { try { server.kill(); } catch (_) {} } };
process.on('exit', stopServer); process.on('SIGINT', () => { stopServer(); process.exit(130); });

const runs = [];
const lost = [];
for (const e of ENGINES) {
  for (let i = 0; i < REPS; i++) {
    let r;
    try { r = await traceOnce(e, i + 1); } catch (err) {
      const why = String((err && err.message) || err).slice(0, 200);
      console.log(`\n  ⚠ ${e} rep${i + 1} LOST: ${why}`);
      lost.push({ engine: e, rep: i + 1, why });
      continue;
    }
    runs.push(r);
    const ph = r.phases;
    console.log(`  ${e} rep${i + 1}  boot ${ph.boot.wallMs} ms (ready=${ph.boot.ready})  pan-first ${ph['pan-first'].fps} fps  zoom-first ${ph['zoom-first'].fps} fps  pan-warm ${ph['pan-warm'].fps} fps  weather-on ${ph['weather-on'].wallMs} ms  alerts-on ${ph['alerts-on'].wallMs} ms  unsettled ${r.unsettled}`);
    const mean = r.clock.gapSum / Math.max(1, r.clock.pings);
    console.log(`    ping floor ${r.clock.minGap == null ? '—' : r.clock.minGap.toFixed(3)} ms · mean ${mean.toFixed(3)} ms over ${r.clock.pings} round trips`
      + (mean > 8 * (r.clock.minGap || 1) ? '  ⚠ mean ≫ floor: the page was throttled while idle' : ''));
    if (i === 0) {
      console.log(`    hooks: ${JSON.stringify(r.hooks)}`);
      if (r.res.misses.length) console.log(`    unhooked: ${r.res.misses.join(' · ')}`);
      console.log(`    ${r.res.requests} requests / ${r.res.kB} kB · heap ${r.heap ? r.heap.heapMB + ' MB' : '— (not exposed to page script in this engine)'}`);
      console.log(`    weather driven: ${JSON.stringify(ph['weather-on'].driven)} · alerts driven: ${JSON.stringify(ph['alerts-on'].driven)}`);
    }
  }
}
if (!runs.length) console.log('\n  every rep was lost — nothing to tabulate');
else { table(runs); touchTable(runs); }
if (lost.length) {
  console.log(`\n  ⚠ ${lost.length} rep(s) lost: ` + lost.map((l) => `${l.engine} rep${l.rep} (${l.why})`).join(' · '));
}
console.log(`\n  cpu=${CPU}× (held equal across engines — NOT the historical mobile ×4 unless --cpu 4)  reps=${REPS}  base=${BASE}`);
console.log(`  cache: ${stats.hit} replayed, ${stats.miss} missed, ${stats.blocked} blocked${stats.miss && !has('--record') ? '  ⚠ MISSES WERE BLOCKED — re-run once with --record' : ''}`);
console.log('  ⚠ this is an ENGINE comparison on desktop silicon. WebKit here is not iOS Safari: no CPU throttle exists in it,');
console.log('    and worker-side decode, GC and any work shorter than one ping tick are outside every bucket above.');

let verify = null;
if (VERIFY) {
  verify = await verifyChromium();
  console.log(`\n  CROSS-CHECK (chromium only) · CDP sampler over ${verify.sampledMs.toFixed(0)} ms`);
  console.log(`    probe, same interval: placement ${verify.probe.self.placement} ms · render ${verify.probe.self.render} ms · mapRender ${verify.probe.self.mapRender} ms · texUpload ${verify.probe.self.texUpload} ms`);
  for (const [fn, ms] of verify.sampler.slice(0, 12)) console.log(`    ${pad(ms.toFixed(1), 9)} ms  ${fn}`);
}

const out = val('--json', null);
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ mode: 'mobile-trace', cpu: CPU, reps: REPS, base: BASE, runs, verify }, null, 2));
  console.log(`  → ${out}`);
}
stopServer();
}
