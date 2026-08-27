/* ============================================================================
 *  IntMap · ONE QUEUE IN FRONT OF NOMINATIM, FOR THE WHOLE APP  (#R489)
 * ----------------------------------------------------------------------------
 *  「公開Nominatimは最大1リクエスト/秒で、バッチ利用も制限しています。
 *    現在の保存コードでは、この経路に共通キューがありません。」
 *
 *  ══ THE MEASUREMENT ══════════════════════════════════════════════════════════════════════════
 *  Seven files in this repository call `nominatim.openstreetmap.org`, and between them they held
 *  TWO private floors and five none at all: js/routing-geocode.js had kept its own `lastNominatim`
 *  and a 1,100 ms gap since #R298, js/atlas-console.js's member-unit fetcher had its own 1,050 ms
 *  promise chain, and the Atlas geocoder, the Atlas extent finder, the river tracer, the mapping
 *  audit, the search card and the map tools went straight to `fetch`. Asked to outline fourteen
 *  oblasts, Atlas therefore issued fourteen `polygon_geojson=1` searches plus retries as fast as the
 *  network would take them — slower than doing it properly, because the host throttles, and outside
 *  the terms IntMap agreed to when it started using the free endpoint.
 *
 *  ⚠ A PRIVATE FLOOR IS NOT A FLOOR. Two modules that each allow themselves one request per second
 *  allow the host two. The counter has to be shared, so it lives here and nowhere else.
 *
 *  ══ TWO CALLERS, TWO SHAPES, ONE FLOOR ═══════════════════════════════════════════════════════
 *  · A KEYSTROKE cannot queue. #R298 measured what happens when it does: the reader types on, and
 *    the slot they were waiting for belongs to a query they no longer want. Those callers pass
 *    `{drop:true}` and are told -1 when the window is already spoken for — unchanged behaviour.
 *  · A BATCH must queue. Fourteen oblast outlines are all still wanted fifteen seconds from now,
 *    and dropping thirteen of them is the failure the reader reported. Those callers WAIT.
 *
 *  ⚠ IT DOES NOT FETCH ANYTHING AND IT CANNOT SEE THE NETWORK. Callers keep their own deadlines
 *  (js/fetch-deadline.js), their own headers and their own parsing; this file hands out the slot.
 *
 *  ⚠ ONE EXPORTED OBJECT, NOT SIX EXPORTED FUNCTIONS, and the state is inside it. tests/r175 ③
 *  forbids an unexported top-level declaration, and module-level `let last` is exactly that — while
 *  a factory that each caller ran would give every caller its own counter, which is the defect this
 *  file removes. A single frozen instance is both: nothing is declared at the top level but the
 *  export, and there is only ever one of it.
 *
 *  ⚠ NO DOM, NO NETWORK, NO GLOBALS BEYOND THE PUBLISH, AND THE CLOCK IS INJECTABLE — so
 *  tests/r489-checks.test.mjs drives the real module with no browser and without waiting real
 *  seconds. The `window` publish exists because js/routing.js, js/river-course.js,
 *  js/search-geocode.js and js/routing-geocode.js may contain no top-level declarations
 *  (tests/r175-checks #4) and so cannot `import` — it is the SAME object the importers get.
 * ==========================================================================*/

export const NominatimGate = (function () {
  /* The policy Nominatim publishes is «at most one request per second». #R298 chose 1,100 ms for the
     margin and measured it; the number stays where it was. */
  const NOMINATIM_GAP_MS = 1100;

  let last = 0, served = 0, dropped = 0, queued = 0;
  let gapMs = NOMINATIM_GAP_MS;
  let clock = () => Date.now();

  /** configure({gapMs, now, reset}) — for tests, and for nothing else. */
  function configure(o) {
    o = o || {};
    if (o.gapMs != null && isFinite(+o.gapMs) && +o.gapMs >= 0) gapMs = +o.gapMs;
    if (typeof o.now === 'function') clock = o.now;
    if (o.reset) { last = 0; served = 0; dropped = 0; queued = 0; }
    return { gapMs, served, dropped, queued };
  }

  /**
   * reserve(opts) -> ms to wait before sending, or -1 when a `drop:true` caller has been dropped.
   *
   * ⚠ THE SLOT IS TAKEN SYNCHRONOUSLY, so two callers in the same tick cannot both decide the window
   * is free. That is #R298's rule, and it is the only reason a shared counter works at all.
   */
  function reserve(opts) {
    const o = opts || {};
    const now = clock();
    const at = Math.max(now, last + gapMs);
    const hold = at - now;
    if (o.drop && hold > gapMs) { dropped++; return -1; }   /* one is already queued — this keystroke is stale */
    last = at;
    served++;
    if (hold > 0) queued++;
    return hold;
  }

  function sleep(ms) { return ms > 0 ? new Promise((r) => { setTimeout(r, ms); }) : Promise.resolve(); }

  /**
   * nominatimSlot(opts) -> Promise<boolean> — true once this caller owns its slot, false if dropped.
   * A batch caller omits `drop` and is never told false.
   *
   * ⚠ IT IS NOT CALLED `wait`. js/routing-geocode.js already has a local `wait(ms)`, and
   * scripts/check-split-scope.mjs walks an `import { wait as x }` specifier as a REFERENCE to
   * `wait` — so a renamed import reads as a free identifier that resolves to nothing. The check is
   * right about the shape it guards; the honest answer is to export the name the call site wants.
   */
  async function nominatimSlot(opts) {
    const hold = reserve(opts);
    if (hold < 0) return false;
    if (hold) await sleep(hold);
    return true;
  }

  /**
   * run(fn, opts) -> Promise — take a slot, then call `fn`. A dropped caller gets `opts.onDrop` (or
   * a rejection with `rate_floor`, which is the message js/routing-geocode.js has always thrown).
   */
  async function run(fn, opts) {
    const ok = await nominatimSlot(opts);
    if (!ok) {
      if (opts && 'onDrop' in opts) return opts.onDrop;
      throw new Error('rate_floor');
    }
    return fn();
  }

  /** stats() — what the gate has actually done, for the checks and for the diagnostics panel. */
  function stats() { return { gapMs, served, dropped, queued, last }; }

  const API = { NOMINATIM_GAP_MS, configure, reserve, nominatimSlot, run, stats };
  try { window.IntMapNominatimGate = API; } catch (_) { /* non-browser (the node checks) */ }
  return API;
})();
