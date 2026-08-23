/* ============================================================================
 *  IntMap · THE ENGINE-NEUTRAL TRACE PROBE  (#R387)
 * ----------------------------------------------------------------------------
 *  Injected into every document BEFORE the first app script by scripts/mobile-trace.mjs.
 *  It is not part of the app: nothing in src/ or js/ imports it, and it never ships.
 *
 *  ── WHY IT EXISTS ─────────────────────────────────────────────────────────────────────────────
 *  Every mobile number this repo owns was taken in Chromium. scripts/frame-profile.mjs sets an
 *  iPhone 13 user-agent, a 390×844 viewport and DPR 3, and then throttles the CPU through CDP —
 *  which is an iPhone-SHAPED CHROMIUM, not an iPhone. The two things that the analysis of
 *  2026-08-24 named as the top cost (MapLibre label placement, and native image decode + GPU
 *  upload) are exactly the two things whose implementations differ most between Blink and WebKit,
 *  so "the engine is not the variable" was the one assumption never tested.
 *
 *  Testing it needs an instrument that runs in BOTH engines, and that rules out everything the
 *  existing profiler is built on. CDP is Chromium-only, so `Profiler.start`, `Emulation.
 *  setCPUThrottlingRate`, `HeapProfiler.collectGarbage` and `Performance.getMetrics` are all
 *  unavailable in WebKit — and so is the `longtask` PerformanceObserver, which Safari has never
 *  shipped (frame-profile.mjs already says so at its own observer, in a catch that silently
 *  produces no number).
 *
 *  So this probe measures from INSIDE the page, with nothing but standard DOM:
 *
 *   1. SELF TIME, NOT INCLUSIVE TIME. `map._render` calls `painter.render`, which calls
 *      `texImage2D`. Timing all three and adding them up counts the same milliseconds three
 *      times. A one-entry-per-nesting-level stack pauses the parent's accumulator on enter and
 *      resumes it on exit, so every bucket holds only the time spent in ITS OWN frames. The sum
 *      of the buckets is therefore a real decomposition and can be compared against the total.
 *
 *   2. A LONG-TASK EQUIVALENT THAT EXISTS IN WEBKIT. A MessageChannel ping loop re-posts to
 *      itself as fast as the task queue allows. On an idle main thread the gap between two ticks
 *      is the queue's own overhead; when the main thread is busy the gap IS the block. Summing the
 *      part of each gap OVER 2 ms gives main-thread busy time, and summing the part over 50 ms
 *      gives a Total-Blocking-Time-style figure — in an engine that has no `longtask` entry type.
 *      ⚠ Both are FLOORS, not upper bounds: work that finishes inside 2 ms is invisible to them.
 *      ⚠ And no calibration is involved, deliberately — see the ping handler for the two ways of
 *      estimating the loop's own idle cost that were tried and were each wrong by a whole column.
 *
 *   3. HOOKS THAT REPORT WHETHER THEY ATTACHED. Every wrapper records `hooks[bucket] = true` only
 *      when the property was actually replaced. A bucket that never attached is reported as
 *      ABSENT, never as 0 — "we did not measure it" and "it cost nothing" are different claims,
 *      and this repo has confused them before (#R344: a geometry index that asked whether a
 *      feature HAD geometry and never whether the geometry had coordinates).
 *
 *  ── WHAT THIS PROBE CANNOT SEE, STATED HERE SO IT IS NOT QUOTED AS ZERO ───────────────────────
 *   · WORKER-SIDE WORK. addInitScript does not reach a dedicated worker's global scope, so the
 *     JPEG/PNG decode that js/sat-worker.js performs, and everything MapLibre's own workers do,
 *     is outside every bucket below. What IS measured is the main thread's half of the exchange:
 *     the structured clone on `postMessage`, and the handler that receives the reply.
 *   · GARBAGE COLLECTION. Neither engine exposes GC timing to page script. In Chromium the runner
 *     can read it over CDP; in WebKit it is reported as null. It is NOT folded into `other`.
 *   · WORK SHORTER THAN ONE PING TICK, per (2) above.
 * ==========================================================================*/
(() => {
  if (window.__imTrace) return;
  const NOW = () => performance.now();

  const S = {
    self: Object.create(null),    /* bucket → ms of MAIN-THREAD SELF TIME */
    calls: Object.create(null),   /* bucket → how many times the wrapped function ran */
    lat: Object.create(null),     /* bucket → ms of wall latency for async work; NOT main-thread time */
    hooks: Object.create(null),   /* bucket → true ONLY if the property was really replaced */
    misses: [],                   /* names that could not be wrapped, so the gap is visible */
    pings: 0, gapSum: 0, maxGap: 0, minGap: Infinity, busy: 0, blocking: 0, gap50: 0, gap100: 0,
    frames: [], rafOn: false,
  };
  window.__imTrace = S;

  /* ── self-time stack ──────────────────────────────────────────────────── */
  const stack = [];
  const add = (n, ms) => { S.self[n] = (S.self[n] || 0) + ms; };
  function enter(n) {
    const t = NOW();
    if (stack.length) { const p = stack[stack.length - 1]; add(p.n, t - p.t); }
    stack.push({ n, t });
  }
  function exit() {
    const t = NOW(); const f = stack.pop();
    if (!f) return;
    add(f.n, t - f.t);
    if (stack.length) stack[stack.length - 1].t = t;
  }

  /* ⚠ Object.getOwnPropertyDescriptor, not `obj[prop]`: reading through the prototype chain would
     happily wrap an INHERITED method and then define an own property that shadows it on the wrong
     object, so a later engine-version change would silently stop measuring the thing it names. */
  function wrap(obj, prop, bucket, label) {
    const name = label || (bucket + '.' + prop);
    if (!obj) { S.misses.push(name + ' (no object)'); return false; }
    const d = Object.getOwnPropertyDescriptor(obj, prop);
    if (!d || typeof d.value !== 'function') { S.misses.push(name + ' (not an own function)'); return false; }
    if (d.value.__imWrapped) return true;
    const orig = d.value;
    const w = function () {
      S.calls[bucket] = (S.calls[bucket] || 0) + 1;
      enter(bucket);
      try { return orig.apply(this, arguments); } finally { exit(); }
    };
    w.__imWrapped = true;
    try { Object.defineProperty(obj, prop, { configurable: true, enumerable: d.enumerable, writable: true, value: w }); }
    catch (_) { S.misses.push(name + ' (not configurable)'); return false; }
    S.hooks[bucket] = true;
    return true;
  }

  /* ── raster decode ────────────────────────────────────────────────────────
     Two numbers, deliberately kept apart. `self.decode` is main-thread time inside the call;
     `lat.decode` is how long the promise took to settle, which in an engine that decodes off the
     main thread is mostly NOT main-thread time. Adding them would assert the opposite of what the
     browser did, and the whole question here is which engine does which. */
  function wrapAsync(host, prop, bucket) {
    if (!host || typeof host[prop] !== 'function') { S.misses.push(bucket + '.' + prop + ' (absent)'); return false; }
    const orig = host[prop];
    host[prop] = function () {
      S.calls[bucket] = (S.calls[bucket] || 0) + 1;
      const t0 = NOW();
      let p;
      enter(bucket);
      try { p = orig.apply(this, arguments); } finally { exit(); }
      if (!p || typeof p.then !== 'function') return p;
      const done = () => { S.lat[bucket] = (S.lat[bucket] || 0) + (NOW() - t0); };
      return p.then((v) => { done(); return v; }, (e) => { done(); throw e; });
    };
    S.hooks[bucket] = true;
    return true;
  }

  wrapAsync(window, 'createImageBitmap', 'decode');
  if (window.HTMLImageElement) wrapAsync(window.HTMLImageElement.prototype, 'decode', 'decode');

  /* ── GPU texture / buffer upload ──────────────────────────────────────────
     ⚠ draw calls are NOT wrapped. `drawElements` runs thousands of times per frame and two
     performance.now() calls around each would be a bigger cost than the thing being measured —
     #R344's own instrument became the top entry in its profile that way. Uploads are per texture
     and per buffer, which is hundreds per phase. */
  for (const ctor of ['WebGL2RenderingContext', 'WebGLRenderingContext']) {
    const C = window[ctor];
    if (!C) continue;
    for (const m of ['texImage2D', 'texSubImage2D', 'compressedTexImage2D', 'texStorage2D']) {
      if (Object.getOwnPropertyDescriptor(C.prototype, m)) wrap(C.prototype, m, 'texUpload', ctor + '.' + m);
    }
    for (const m of ['bufferData', 'bufferSubData']) {
      if (Object.getOwnPropertyDescriptor(C.prototype, m)) wrap(C.prototype, m, 'bufUpload', ctor + '.' + m);
    }
  }

  /* ── worker traffic ───────────────────────────────────────────────────────
     `postMessage` is where the structured clone of the OUTGOING message is paid, synchronously, by
     the caller — #R344 measured 5.59 s of it in a 70 s profile before switching the alert layer to
     diffed updates. The receiving half is the listener the page installs; the clone of the INCOMING
     message is paid by the engine before dispatch and is not separable from page script, so it
     lands in `workerRecv` together with whatever the handler does. */
  const WP = window.Worker && window.Worker.prototype;
  if (WP) {
    wrap(WP, 'postMessage', 'workerPost');
    const listen = (fn) => function (ev) {
      S.calls.workerRecv = (S.calls.workerRecv || 0) + 1;
      enter('workerRecv');
      try { return fn.call(this, ev); } finally { exit(); }
    };
    const origAdd = Object.getOwnPropertyDescriptor(WP, 'addEventListener')
      || Object.getOwnPropertyDescriptor(window.EventTarget.prototype, 'addEventListener');
    if (origAdd && typeof origAdd.value === 'function') {
      const oa = origAdd.value;
      try {
        Object.defineProperty(WP, 'addEventListener', {
          configurable: true, writable: true, enumerable: false,
          value: function (type, fn, opts) {
            if (type === 'message' && typeof fn === 'function') return oa.call(this, type, listen(fn), opts);
            return oa.apply(this, arguments);
          },
        });
        S.hooks.workerRecv = true;
      } catch (_) { S.misses.push('Worker.addEventListener (not configurable)'); }
    } else S.misses.push('Worker.addEventListener (absent)');
    try {
      const d = Object.getOwnPropertyDescriptor(WP, 'onmessage');
      if (d && typeof d.set === 'function') {
        Object.defineProperty(WP, 'onmessage', {
          configurable: true, enumerable: d.enumerable, get: d.get,
          set(fn) { return d.set.call(this, typeof fn === 'function' ? listen(fn) : fn); },
        });
        S.hooks.workerRecv = true;
      } else S.misses.push('Worker.onmessage setter (absent)');
    } catch (_) { S.misses.push('Worker.onmessage setter (not configurable)'); }
  } else S.misses.push('Worker (absent)');

  /* ── MapLibre ─────────────────────────────────────────────────────────────
     Attached on demand, because none of these objects exist until a map has been constructed. The
     runner calls attachMap() once IntMapGeoEngine reports it can draw, and PRINTS what came back —
     a build whose minifier started mangling `_updatePlacement` must show up as a missing hook, not
     as a label-placement cost of zero. Wrapped on the PROTOTYPE rather than the instance so a map
     that is torn down and rebuilt (engine switch, style reload) stays instrumented. */
  S.attachMap = function () {
    let map = null;
    try { map = window.IntMapGeoEngine && window.IntMapGeoEngine.raw && window.IntMapGeoEngine.raw(); } catch (_) {}
    if (!map) { S.misses.push('IntMapGeoEngine.raw() (no map)'); return { ok: false, why: 'no raw map' }; }
    const r = { ok: true };
    try { r.mapRender = wrap(Object.getPrototypeOf(map), '_render', 'mapRender', 'Map._render'); } catch (_) {}
    try { r.render = map.painter ? wrap(Object.getPrototypeOf(map.painter), 'render', 'render', 'Painter.render') : false; } catch (_) {}
    try { r.placement = map.style ? wrap(Object.getPrototypeOf(map.style), '_updatePlacement', 'placement', 'Style._updatePlacement') : false; } catch (_) {}
    if (!r.placement) S.misses.push('Style._updatePlacement — LABEL PLACEMENT IS UNMEASURED IN THIS RUN');
    S.mapAttached = r;
    return r;
  };

  /* ⚠ AND IT HAS TO ATTACH ITSELF, not wait to be called. The map is built DURING boot, and the
     runner cannot call attachMap() until boot has finished — so every millisecond of the first style
     load, the first placement pass and the first texture upload would land outside every bucket and
     `boot.placement` would read 0. That is the exact shape of the mistake this file's header warns
     about: a bucket that was never measured printed as a cost that was never paid. An 8 ms poll
     costs nothing measurable and catches the map within one frame of it existing. */
  const poll = setInterval(() => {
    if (S.mapAttached && S.mapAttached.ok) { clearInterval(poll); return; }
    try { if (window.IntMapGeoEngine && window.IntMapGeoEngine.raw && window.IntMapGeoEngine.raw()) S.attachMap(); } catch (_) {}
  }, 8);
  setTimeout(() => clearInterval(poll), 180_000);

  /* ── the ping loop: main-thread busy without a longtask observer ─────────── */
  let last = NOW();
  const mc = new MessageChannel();
  mc.port1.onmessage = () => {
    const t = NOW(); const g = t - last; last = t;
    S.pings++; S.gapSum += g;
    /* ⚠ A THRESHOLD, NOT A SUBTRACTION — AND THE FIRST TWO ATTEMPTS AT THIS WERE BOTH WRONG.
       The idle cost of one round trip cannot be subtracted out, because neither estimator of it
       survives contact with a real engine:
         · the MEAN gap is `gapSum / pings`, and gapSum IS the wall clock — so `wall − pings × mean`
           is identically zero, for every phase, by construction;
         · the MINIMUM gap is quantised. `performance.now()` is clamped to 0.1 ms in Chromium, so a
           round trip that really costs 0.013 ms reads as either 0 or 0.1. MEASURED in a real run:
           floor 0.100 ms, mean 0.013 ms — a "floor" seven times the average. Using it charged
           7,011,938 × 0.1 ms = 701 s of instrument overhead against a 90 s run and drove busy to
           zero in every row.
       So busy is accumulated directly, as the time spent in gaps LONGER THAN 2 ms. That is above
       both engines' queue floor (Chromium 0.008 ms mean / WebKit 1.167 ms, each measured in a
       continuous loop) and needs no calibration at all. ⚠ It is a FLOOR on main-thread busy time:
       work that finishes inside 2 ms is invisible to it. The bucket columns are wrapper
       measurements and have no such limit. */
    if (g > 2) S.busy += g - 2;
    if (g > 0.001 && g < S.minGap) S.minGap = g;
    if (g > S.maxGap) S.maxGap = g;
    if (g >= 50) { S.gap50++; S.blocking += g - 50; }
    if (g >= 100) S.gap100++;
    mc.port2.postMessage(0);
  };
  mc.port2.postMessage(0);

  /* ── frame intervals ─────────────────────────────────────────────────────
     ⚠ index.html's `?rafshim=1` replaces requestAnimationFrame with a 33 ms timer and would make
     every number here a property of the shim. The runner loads the bare URL and asserts the shim is
     absent (the same guard frame-profile.mjs's open() carries); this records the flag it saw so a
     JSON file can never be read as a frame measurement when it is not one. */
  S.rafShim = /rafshim=1/.test(location.search) || String(requestAnimationFrame).includes('setTimeout');
  let lf = 0;
  const tick = (t) => { if (lf) S.frames.push(t - lf); lf = t; requestAnimationFrame(tick); };
  requestAnimationFrame((t) => { lf = t; S.rafOn = true; requestAnimationFrame(tick); });

  /* ── phase boundaries ─────────────────────────────────────────────────────
     A snapshot rather than a reset: resetting would throw away the ability to check that the phases
     sum to the run, and a phase that the runner failed to close would silently fold into the next
     one instead of showing up as an impossible total. */
  S.snap = function () {
    return {
      t: NOW(),
      self: Object.assign({}, S.self), calls: Object.assign({}, S.calls), lat: Object.assign({}, S.lat),
      pings: S.pings, gapSum: S.gapSum, busy: S.busy, blocking: S.blocking, gap50: S.gap50, gap100: S.gap100, maxGap: S.maxGap,
      frames: S.frames.length,
    };
  };
  S.framesSince = function (n) { return S.frames.slice(n); };
})();
