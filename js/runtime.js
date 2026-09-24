/* ============================================================================
 *  IntMap · RUNTIME — the one frame loop, the one timer, the one box, the one lifecycle  (#R234)
 * ----------------------------------------------------------------------------
 *  「move、rAF、setInterval、Observer類を共通Schedulerで管理。操作中は地図描画を最優先。
 *    全機能に load / activate / suspend / dispose のライフサイクルを持たせる。
 *    最終目標は、機能数が数倍になっても地図操作経路の処理量が増えない設計。」
 *
 *  ══ THE DEFECT THIS FILE EXISTS FOR ═══════════════════════════════════════════════════════════
 *  The report is 「指に付いてこない（カクつく）」 — not a stall after the gesture, DURING it — and
 *  「機種の問題ではない」. So the thing to remove is per-frame work on the drag path, and the shape
 *  of that work was: EVERY feature that follows the camera had its own `events.on('move')` and its
 *  own `requestAnimationFrame`. Counted on this branch before the change: eight camera subscribers
 *  in seven files, each rAF-coalescing ITSELF.
 *
 *  Eight private rAFs are not eight-times-one-rAF. They are eight separate callbacks in the frame,
 *  and — because each one reads geometry (`project()`, `getBoundingClientRect()`) and then writes
 *  style in the same callback — each write invalidates layout for the NEXT one's read. That is
 *  forced synchronous layout, N times a frame, and it is paid on the pointer's own path.
 *
 *  ⚠ WHAT THIS DOES **NOT** DO, AND WHY THAT IS THE POINT.
 *  It does not skip anybody's work, lower anybody's rate, or defer anything visible to the settle.
 *  Every subscriber still runs on every frame it used to run on, with the same inputs, and the map
 *  looks the same in motion as it did before — 「画質やglassを落として速くするのではなく、不要な計算・
 *  ロード・イベント処理そのものを消す」. What is removed is duplication: one camera subscription
 *  instead of eight, one rAF instead of eight, and READS BEFORE WRITES inside it so that the layout
 *  that used to be recomputed N times a frame is recomputed once.
 *  ⚠ #R229 is why that paragraph is here. A scheduler is exactly the kind of file that starts
 *  "helpfully" dropping frames for people, and nobody asked for that.
 *
 *  ══ THE FIVE REGISTERS ════════════════════════════════════════════════════════════════════════
 *   1. `onCamera(key, fn, {phase})` — the camera moved. ONE engine subscription drives all of them.
 *      `phase:'read'` runs before every `phase:'write'`, so geometry is sampled from one layout.
 *   2. `frame(key, fn)` — do this on the next animation frame, coalesced by key. Same driver.
 *   3. `every(key, ms, fn)` — one timer wheel instead of N `setInterval`s. Skipped while the
 *      document is hidden (a browser already throttles hidden timers; this makes it exact and
 *      makes the wake-up ONE timer instead of thirty-nine).
 *   4. `idle(key, fn)` — after the frame, when nothing is pending.
 *   5. `box(el)` (#R499) — where an element IS, answered from an observer instead of from the DOM.
 *      One cache instead of the three private ResizeObservers and the five per-event
 *      `getBoundingClientRect()` calls that turn a finger's coordinates into the map's.
 *
 *  ══ AND THE LIFECYCLE, WHICH IS THE OTHER HALF OF THE INSTRUCTION ═════════════════════════════
 *  `define(name, {load, activate, suspend, dispose})` records what a capability can do; `activate`
 *  is what makes its per-frame work eligible at all. Everything a capability registers here is
 *  tagged with its name, so `suspend(name)` takes ALL of it off the frame loop in one call and
 *  `dispose(name)` forgets it. A feature that is not activated costs the drag path zero — which is
 *  the "機能数が数倍になっても地図操作経路の処理量が増えない" property, held mechanically rather
 *  than by everyone remembering to unsubscribe.
 *
 *  (#R795 lifted tests/r175 ③'s ban on unexported top-level declarations; the shape below —
 *  one export wrapping one closure — is kept because the registers ARE one instance, not because
 *  a rule requires it. The early-timer memo below is an ordinary module-scope Map now.)
 * ==========================================================================*/

export function makeRuntime(HOST) {
  return (function () {
    const IM_HOST = HOST;

    /* ── the frame register ───────────────────────────────────────────────────────────────────
       Two ordered maps rather than one, because the whole point is that every geometry READ in a
       frame happens before the first style WRITE of that frame. A Map keeps insertion order, so
       registration order is run order and it is stable across frames. */
    const READ = new Map();      /* key → {fn, cap} — sample the camera / measure the DOM */
    const WRITE = new Map();     /* key → {fn, cap} — place things */
    const ONCE = new Map();      /* key → {fn, cap} — frame(), DRAINED before it runs (see _run) */
    const CAM = new Set();       /* keys in READ/WRITE that are camera-driven */
    const SUSPENDED = new Set(); /* capability names whose entries are skipped */
    const _own = { unowned: 0 };  /* (#R796) registrations made with no owner — read by stats(); the number to drive to zero */

    let _raf = 0, _camWired = false, _dirty = false;
    let _gesture = 0;            /* depth of movestart/moveend nesting; >0 while the camera moves */
    const _stats = { frames: 0, tasks: 0, maxMs: 0, lastMs: 0 };

    function _skip(e) { return !e || (e.cap && SUSPENDED.has(e.cap)); }

    /* ══ ⚠⚠ (#R236) A ONE-SHOT QUEUE IS **DRAINED** BEFORE IT RUNS, NOT CLEARED AFTER ══════════════
       「地震波伝播は…点でもフリー描画震源域でも波が出ない。」

       #R235 moved the seismic playback off `setInterval` and onto `frame()`, and the fronts stopped
       moving the same round. The geometry was never the problem — measured live, the ring features
       are built correctly and DO render. The playback died in this function.

       An animation driven by `frame()` re-arms itself from inside its own callback, which is the
       only way a one-shot queue can express "again next frame":

           const step = () => { …advance…; RT.frame('seismic:play', step); };

       `ONCE.set(key,…)` during the `for…of` above REPLACES the entry being iterated, and then
       `map.clear()` below deleted it. So the task ran exactly ONCE and the loop was over — the
       ▶ button latched to ⏸, `tSec` advanced by a single frame (~0.016 s of model time at 1×,
       far too little to see) and nothing ever moved again. Measured, not reasoned: a probe task
       that re-registers itself 50 times ran **1** time.

       Draining first is also the correct semantic independently of the bug. `frame()` means "run
       this on the next frame"; work enqueued WHILE that frame is running belongs to the NEXT one,
       not to this one. Clearing afterwards conflated the two and silently threw the second away.
       ⚠ The entries are snapshotted too, so a task that enqueues a DIFFERENT key does not extend
       the loop it is already inside — that is how one task could starve the frame it runs in. */
    function _run(map, transient) {
      const entries = transient ? Array.from(map) : map;
      if (transient) map.clear();
      for (const [k, e] of entries) {
        if (_skip(e)) continue;
        /* ⚠ one task's throw must not cost every later task its frame — that is how a scheduler
           turns one bug into a frozen map. Report and carry on. */
        try { e.fn(); } catch (err) { _oops(k, err); }
        _stats.tasks++;
      }
    }

    function _tick() {
      _raf = 0; _dirty = false;
      const t0 = _now();
      _run(READ, false);
      _run(WRITE, false);
      _run(ONCE, true);
      const dt = _now() - t0;
      _stats.frames++; _stats.lastMs = dt; if (dt > _stats.maxMs) _stats.maxMs = dt;
    }

    function _now() { try { return performance.now(); } catch (_) { return Date.now(); } }

    function _oops(key, err) {
      try {
        const c = window.__imRuntime || (window.__imRuntime = { errors: [] });
        if (c.errors.length < 50) c.errors.push(key + ': ' + (err && err.message));
        console.error('[IntMap runtime] task ' + key + ' threw', err);
      } catch (_) { /* console is not a dependency */ }
    }

    /* Ask for a frame. Idempotent within a frame — this is the coalescing every caller used to
       write for itself. */
    function schedule() {
      if (_raf || _dirty) return;
      _dirty = true;
      try { _raf = requestAnimationFrame(_tick); _dirty = false; }
      catch (_) { _dirty = false; try { setTimeout(_tick, 16); } catch (__) { } }
    }

    /* ── 1. the camera register ───────────────────────────────────────────────────────────────
       ⚠ ONE subscription to the engine, created on the first caller. Eight `events.on('move')`
       meant eight dispatches per frame out of the renderer's own event emitter before any of this
       app's code ran at all. */
    function _wireCamera() {
      if (_camWired) return;
      /* (#R796) headless: no window is not an error, it is "no engine yet" (tests, scripts/frame-profile.mjs) */
      let E = null; try { E = window.IntMapGeoEngine; } catch (_) { E = null; }
      if (!E || !E.events || !E.hasRenderer || !E.hasRenderer()) return;
      _camWired = true;
      const bump = () => { if (CAM.size) schedule(); };
      ['move', 'zoom', 'rotate', 'pitch', 'resize'].forEach((ev) => { try { E.events.on(ev, bump); } catch (_) { } });
      /* the gesture flag is published, not consumed here: nothing in this file changes behaviour
         because of it. It is what lets a CALLER say "this one is only worth doing when the camera
         has settled" in its own words, at its own site, where the trade is visible. */
      ['movestart', 'zoomstart', 'rotatestart', 'pitchstart'].forEach((ev) => {
        try { E.events.on(ev, () => { _gesture++; _pub(); }); } catch (_) { }
      });
      ['moveend', 'zoomend', 'rotateend', 'pitchend'].forEach((ev) => {
        try { E.events.on(ev, () => { _gesture = Math.max(0, _gesture - 1); _pub(); schedule(); }); } catch (_) { }
      });
    }
    function _pub() { try { window.__imGesture = _gesture > 0; } catch (_) { } }

    function onCamera(key, fn, opts) {
      const o = opts || {};
      const e = { fn, cap: o.capability || null };
      if (!e.cap) _own.unowned++;
      (o.phase === 'read' ? READ : WRITE).set(key, e);
      CAM.add(key);
      _wireCamera();
      /* the engine may not exist yet at registration time (js/geo-engine.js is imported before the
         map is constructed — #R178). Retry on the load event rather than binding to nothing, which
         is #R170's silent-no-op defect. */
      if (!_camWired) { try { window.IntMapGeoEngine.events.once('load', _wireCamera); } catch (_) { } }
      schedule();
      return () => offCamera(key);
    }
    function offCamera(key) { READ.delete(key); WRITE.delete(key); CAM.delete(key); }

    /* ── 2. one-shot frame work ───────────────────────────────────────────────────────────────*/
    function frame(key, fn, opts) {
      const cap = (opts && opts.capability) || null;
      if (!cap) _own.unowned++;
      ONCE.set(key, { fn, cap });
      schedule();
    }

    /* ── 3. the timer wheel ───────────────────────────────────────────────────────────────────
       Thirty-nine `setInterval`s is thirty-nine independent wake-ups, none of which knows the tab
       is in the background. One timer, each entry keeping its own period, and no tick at all while
       the document is hidden — which is what the browser is already trying to do to each of them
       separately and badly. ⚠ A task whose period has passed while hidden runs ONCE on return, not
       once per missed period: catching up is never what any of these callers wanted. */
    const TIMERS = new Map();    /* key → {ms, fn, next, cap, hidden} */
    let _wheel = 0, _wheelMs = 0;

    function _wheelTick() {
      const now = Date.now(), hidden = _hidden();
      let soonest = Infinity;
      for (const [k, t] of TIMERS) {
        if (_skip(t)) { continue; }
        if (hidden && !t.hidden) { t.next = now + t.ms; soonest = Math.min(soonest, t.ms); continue; }
        if (now >= t.next) {
          t.next = now + t.ms;
          try { t.fn(); } catch (err) { _oops('timer:' + k, err); }
        }
        soonest = Math.min(soonest, Math.max(16, t.next - now));
      }
      _arm(soonest);
    }
    function _arm(ms) {
      if (!TIMERS.size) { if (_wheel) { clearTimeout(_wheel); _wheel = 0; } return; }
      const want = Math.max(16, Math.min(60000, isFinite(ms) ? ms : 1000));
      if (_wheel) clearTimeout(_wheel);
      _wheelMs = want;
      _wheel = setTimeout(_wheelTick, want);
      /* a timer must not keep a headless process alive (Node: tests, scripts/frame-profile.mjs); a browser ignores this */
      try { if (_wheel && typeof _wheel.unref === 'function') _wheel.unref(); } catch (_) { }
    }
    function _hidden() { try { return !!document.hidden; } catch (_) { return false; } }

    function every(key, ms, fn, opts) {
      const o = opts || {};
      const p = Math.max(16, +ms || 1000);
      if (!o.capability) _own.unowned++;
      TIMERS.set(key, { ms: p, fn, next: Date.now() + p, cap: o.capability || null, hidden: !!o.whenHidden });
      _arm(Math.min(p, _wheelMs || p));
      return () => clearEvery(key);
    }
    function clearEvery(key) { TIMERS.delete(key); if (!TIMERS.size && _wheel) { clearTimeout(_wheel); _wheel = 0; } }

    /* the wheel re-arms itself the moment the tab comes back, instead of waiting out whatever
       interval the browser had throttled it to. */
    try { document.addEventListener('visibilitychange', () => { if (!_hidden()) _arm(16); }); } catch (_) { }

    /* ══ ⚠⚠⚠ (#R499) 5. THE BOX — AN ELEMENT'S GEOMETRY IS NOT A PROPERTY OF THE FINGER ═════════
       「スマホでの動作が重い」, and #R498's answer to the same report was one instance of a shape
       that this branch carries FIVE more of. Every place that turns a pointer's CLIENT coordinates
       into MAP coordinates does it the same way:

           const r = canvas.getBoundingClientRect();      // ← on every touchmove
           unproject([touch.clientX - r.left, touch.clientY - r.top]);

       js/wheel-zoom.js's custom pinch, js/map-tools.js's `touchLL`, js/volume3d.js's two stroke
       handlers, js/tool-panel.js's context menu (on every camera frame) and js/map-tooltip.js's
       placement each measured for themselves — and three of them kept a private ResizeObserver to
       avoid it, which is three implementations of one instrument (#R311 for the tooltip, #R498 for
       the crosshair). ⚠ THE ANSWER CANNOT BE "everyone should remember to cache", because #R498
       measured what happens to an optimisation that is optional: `setMapTooltipHTML` existed for
       eleven rounds and ONE of eight files used it. So the cache is HERE, beside the frame loop
       whose whole purpose is that a layout is sampled once, and the sites ask this instead.

       WHAT INVALIDATES IT — every way the answer can change, not a guess about which ones matter:
         · a ResizeObserver on the element itself (the sidebar's 300 ms collapse, a rotation, the
           bottom sheet resizing the map — all of them change the box and all of them fire here);
         · window resize / orientationchange / scroll, and the visual viewport's own pair, which is
           what moves `left`/`top` under a pinch-zoomed mobile page without any size changing;
         · ⚠ AND EVERY `pointerdown` / `touchstart`, which is the one that makes this exact rather
           than merely careful. A gesture cannot begin without one, so every drag starts from a
           freshly measured box and re-uses it for the rest of the stroke — precisely the rule
           #R498 wrote for the long-press by hand, held for every caller instead of one.
       The measurement itself is taken LAZILY, on the next `box()` after an invalidation, so a
       resize nobody asks about costs nothing at all. */
    const BOXES = new WeakMap();     /* el → {r, ro} — r === null means "ask the DOM next time" */
    let _boxWired = false;
    function _boxAllStale() { _boxGen++; }
    let _boxGen = 0;
    function _wireBox() {
      if (_boxWired) return; _boxWired = true;
      let W = null; try { W = window; } catch (_) { W = null; }     /* ⚠ evaluating `window` is itself the throw, outside any try the callee owns */
      if (!W || !W.addEventListener) return;
      const on = (t, ev) => { try { t.addEventListener(ev, _boxAllStale, { passive: true, capture: true }); } catch (_) { } };
      on(W, 'resize'); on(W, 'orientationchange'); on(W, 'scroll');
      on(W, 'pointerdown'); on(W, 'touchstart');
      try { if (W.visualViewport) { on(W.visualViewport, 'resize'); on(W.visualViewport, 'scroll'); } } catch (_) { }
    }
    function box(el) {
      if (!el || !el.getBoundingClientRect) return { left: 0, top: 0, width: 0, height: 0 };
      _wireBox();
      let e = BOXES.get(el);
      if (!e) {
        e = { r: null, gen: -1, ro: null };
        BOXES.set(el, e);
        try { e.ro = new ResizeObserver(() => { e.r = null; }); e.ro.observe(el); } catch (_) { e.ro = null; }
      }
      if (!e.r || e.gen !== _boxGen) {
        const r = el.getBoundingClientRect();
        /* a plain object, not the live DOMRect: a caller that keeps it must not be handed something
           the next layout silently rewrites. */
        e.r = { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
        e.gen = _boxGen;
      }
      return e.r;
    }
    /* for the caller that KNOWS it just changed the layout itself — a panel that expanded, a sheet
       that was dragged — and cannot wait for the observer's next delivery. */
    function remeasure(el) { if (el) { const e = BOXES.get(el); if (e) e.r = null; } else _boxAllStale(); }

    /* ── 4. idle ──────────────────────────────────────────────────────────────────────────────*/
    const IDLE = new Map();
    let _idleH = 0;
    function idle(key, fn, opts) {
      const cap = (opts && opts.capability) || null;
      if (!cap) _own.unowned++;
      IDLE.set(key, { fn, cap });
      if (_idleH) return;
      const run = () => {
        _idleH = 0;
        const q = Array.from(IDLE); IDLE.clear();
        for (const [k, e] of q) { if (_skip(e)) continue; try { e.fn(); } catch (err) { _oops('idle:' + k, err); } }
      };
      try { _idleH = requestIdleCallback(run, { timeout: (opts && opts.timeout) || 2000 }); }
      catch (_) { _idleH = setTimeout(run, 200); }
    }

    /* ══ THE LIFECYCLE ═══════════════════════════════════════════════════════════════════════
       A capability is a name plus up to four verbs. `load` may be async (that is where a dynamic
       import goes); `activate` / `suspend` are the cheap pair a feature toggles with, and the
       runtime enforces what "suspended" means for everything the capability registered above —
       so a feature cannot leave a per-frame task behind by forgetting to unsubscribe.

       ⚠ IT IS A REGISTER, NOT A LOADER. js/lazy-modules.js already owns "fetch this file, mount
       its factory, verify what it published" (#R209) and has for nine modules; duplicating that
       here would be the two-lists defect (#R220). `load` is where a definition calls it.

       ══ ⚠⚠⚠ (#R796) A GENERATION, AND A SCOPE THAT OWNS WHAT THE CAPABILITY ACQUIRES ═══════════
       Measured on the tree before this round: nothing here could tell "the load that just finished"
       from "the load that was started before the user closed the panel". `activate` waited on
       `load`, then set `active` — so open → (loading…) → close → load completes → ACTIVE AGAIN,
       with nobody holding the panel. And a failed `load` stayed memoised in `c.p`, so the next
       open returned the same rejection without trying. Four features (#R708: DEM, Köppen, the
       legend clock, the playground) had each written their own "reject the stale completion" by
       hand, which is the shape this file exists to end — one mechanism, held here, for everyone.

       So every capability carries a GENERATION, bumped by `dispose`, and two SCOPES:
         · the LOADED scope lives from `load` to `dispose` — the catalogue, the worker, the GL
           objects a feature keeps across toggles for a fast resume;
         · the ACTIVE scope lives from `activate` to `suspend` — the map listeners, the tick, the
           panel's DOM handlers, the in-flight fetches.
       A scope OWNS what is registered through it: `on(target, ev, fn)` (DOM or emitter), `every`,
       `frame`, `onCamera`, `idle`, `timeout`, `fetch` (its AbortSignal is the scope's), `own(x)`
       (anything with dispose/abort/terminate/disconnect/close, or a function). `release()` gives
       all of it back at once, in reverse order; `alive()` answers whether the scope is still the
       current one; `guard(fn)` wraps an async continuation so a result that arrives after release
       is dropped rather than applied. The verbs receive the scope: `load(host, loaded)`,
       `activate(arg, value, active)`. A capability that ignores the argument behaves exactly as
       before — the scope is a facility, not a contract change — but a registration made through
       it is tagged with the owner's name without the caller having to spell `capability:`.
       (Measured: zero registrations in js/ passed `capability:` by hand. Tags that must be typed
       are tags that are not there.) */
    const CAPS = new Map();      /* name → {def, state, p, gen, value, loaded, active} */

    function _isEmitter(t) { return t && typeof t.on === 'function' && typeof t.off === 'function' && typeof t.addEventListener !== 'function'; }
    function makeScope(name, kind, gen) {
      const undo = [];
      let live = true;
      const ac = (typeof AbortController === 'function') ? new AbortController() : null;
      const keyOf = (k) => (String(k).indexOf(name + ':') === 0 ? String(k) : name + ':' + k);
      const S = {
        name, kind, gen,
        get signal() { return ac ? ac.signal : undefined; },
        alive: () => live && _capGen(name) === gen,
        /* register, and remember how to forget */
        on(target, ev, fn, opts) {
          if (!target || !live) return () => { };
          if (_isEmitter(target)) { target.on(ev, fn); const off = () => { try { target.off(ev, fn); } catch (_) { } }; undo.push(off); return off; }
          if (typeof target.addEventListener !== 'function') return () => { };
          const o = (opts && typeof opts === 'object') ? Object.assign({}, opts) : (opts ? { capture: true } : {});
          target.addEventListener(ev, fn, o);
          const off = () => { try { target.removeEventListener(ev, fn, o); } catch (_) { } };
          undo.push(off); return off;
        },
        every(key, ms, fn, opts) { const k = keyOf(key); const stop = every(k, ms, fn, Object.assign({}, opts || {}, { capability: name })); undo.push(stop); return stop; },
        frame(key, fn) { const k = keyOf(key); frame(k, fn, { capability: name }); undo.push(() => ONCE.delete(k)); },
        onCamera(key, fn, opts) { const k = keyOf(key); const off = onCamera(k, fn, Object.assign({}, opts || {}, { capability: name })); undo.push(off); return off; },
        idle(key, fn, opts) { const k = keyOf(key); idle(k, fn, Object.assign({}, opts || {}, { capability: name })); undo.push(() => IDLE.delete(k)); },
        timeout(ms, fn) { const h = setTimeout(() => { if (S.alive()) { try { fn(); } catch (err) { _oops(name + ':timeout', err); } } }, ms); try { if (h && typeof h.unref === 'function') h.unref(); } catch (_) { } undo.push(() => clearTimeout(h)); return h; },
        fetch(url, init) {
          const o = Object.assign({}, init || {});
          if (ac) {
            if (o.signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') o.signal = AbortSignal.any([o.signal, ac.signal]);
            else if (!o.signal) o.signal = ac.signal;
          }
          return fetch(url, o);
        },
        own(x) {
          if (!x) return x;
          const f = typeof x === 'function' ? x
            : typeof x.dispose === 'function' ? () => x.dispose()
            : typeof x.abort === 'function' ? () => x.abort()
            : typeof x.terminate === 'function' ? () => x.terminate()
            : typeof x.disconnect === 'function' ? () => x.disconnect()
            : typeof x.close === 'function' ? () => x.close()
            : null;
          if (f) undo.push(() => { try { f(); } catch (err) { _oops(name + ':own', err); } });
          return x;
        },
        /* a continuation that must not apply after the scope is gone: `p.then(S.guard(v => paint(v)))` */
        guard(fn) { return function (v) { if (!S.alive()) return undefined; return fn.call(this, v); }; },
        release() {
          if (!live) return; live = false;
          try { if (ac) ac.abort(); } catch (_) { }
          while (undo.length) { const f = undo.pop(); try { f(); } catch (err) { _oops(name + ':release', err); } }
        },
        owned: () => undo.length,
      };
      return S;
    }
    function _capGen(name) { const c = CAPS.get(name); return c ? c.gen : -1; }

    function define(name, def) {
      const prev = CAPS.get(name);
      CAPS.set(name, { def: def || {}, state: 'defined', p: null, gen: prev ? prev.gen : 0, value: null, loaded: null, active: null });
      return name;
    }
    function load(name) {
      const c = CAPS.get(name);
      if (!c) return Promise.reject(new Error('no such capability: ' + name));
      if (c.p) return c.p;
      const gen = c.gen;
      c.state = 'loading';
      if (!c.loaded) c.loaded = makeScope(name, 'loaded', gen);
      const scope = c.loaded;
      c.p = Promise.resolve().then(() => (c.def.load ? c.def.load(IM_HOST, scope) : null))
        .then((v) => {
          /* ⚠ disposed while loading: the result belongs to a generation that no longer exists */
          if (c.gen !== gen) return null;
          c.state = 'loaded'; c.value = v; return v;
        })
        .catch((e) => {
          _oops('capability:' + name, e);
          /* ⚠ a failure is not memoised — the next activate tries again (#R796) */
          if (c.gen === gen) { c.state = 'failed'; c.p = null; }
          return null;
        });
      return c.p;
    }
    function activate(name, arg) {
      const c0 = CAPS.get(name);
      const gen = c0 ? c0.gen : -1;
      return load(name).then((v) => {
        const c = CAPS.get(name); if (!c) return null;
        /* ⚠ the whole point (#R796): closed — or disposed and reopened — while the load ran.
           This activation is stale and does nothing; a newer one, if any, is on its own way. */
        if (c.gen !== gen || c.state === 'disposed') return null;
        if (c.state === 'failed') return null;
        SUSPENDED.delete(name);
        if (c.active) c.active.release();
        c.active = makeScope(name, 'active', gen);
        c.state = 'active';
        schedule();
        try { return c.def.activate ? c.def.activate(arg, v, c.active) : v; } catch (e) { _oops('activate:' + name, e); return null; }
      });
    }
    function suspend(name) {
      const c = CAPS.get(name); if (!c) return false;
      /* ⚠ the flag goes up FIRST: whatever `suspend` does must not be able to be undone by a task
         of its own that was already queued for this frame. */
      SUSPENDED.add(name);
      if (c.state === 'active') c.state = 'loaded';
      try { if (c.def.suspend) c.def.suspend(); } catch (e) { _oops('suspend:' + name, e); }
      if (c.active) { c.active.release(); c.active = null; }
      return true;
    }
    /* ══ ⚠⚠⚠ (#R322) DISPOSE MUST NOT MEAN 「TWICE IS IMPOSSIBLE」 ═══════════════════════════════
       This used to end with `CAPS.delete(name)`, which reads as thorough and is not: the DEFINITION
       went with the resources, so the next `activate(name)` rejected with 「no such capability」 and
       a feature that had been closed once could never be opened again. Nothing caught it because
       nothing called dispose at all — the lifecycle had zero callers until this round.

       So the register keeps the definition and the STATE says what happened. `disposed` differs
       from `defined` only in having been alive once; both re-run `def.load` on the next activate,
       because `c.p` — the memo that made load idempotent — is dropped here. That is the whole
       re-open path: forget what was loaded, keep how to load it.

       ⚠ AND IDLE IS SWEPT TOO. The old sweep covered READ / WRITE / ONCE / TIMERS and missed IDLE,
       while the last line deleted the capability from SUSPENDED — so a disposed capability's idle
       task was not skipped either (`_skip` needs the name to still be suspended) and ran against
       resources that had just been released.
       (#R796) …and the GENERATION moves first, so a load or an activation still in flight finds
       itself stale when it lands; then both scopes give back everything they own. */
    function dispose(name) {
      const c = CAPS.get(name); if (!c) return false;
      c.gen++;
      suspend(name);
      try { if (c.def.dispose) c.def.dispose(); } catch (e) { _oops('dispose:' + name, e); }
      if (c.loaded) { c.loaded.release(); c.loaded = null; }
      for (const m of [READ, WRITE, ONCE, IDLE]) for (const [k, e] of Array.from(m)) if (e.cap === name) { m.delete(k); CAM.delete(k); }
      for (const [k, t] of Array.from(TIMERS)) if (t.cap === name) TIMERS.delete(k);
      c.state = 'disposed'; c.p = null; c.value = null;
      SUSPENDED.delete(name);
      return true;
    }
    /* the scopes, for a caller that owns a resource outside the four verbs (a panel built lazily
       after activate, a worker job) — `RT.scope('sat.live')` is the loaded scope, `RT.scope(name,
       'active')` the active one; null when that lifetime is not running. */
    function scopeOf(name, kind) {
      const c = CAPS.get(name); if (!c) return null;
      return kind === 'active' ? c.active : c.loaded;
    }

    const API = {
      onCamera, offCamera, frame, every, clearEvery, idle, schedule,
      box, remeasure,
      define, load, activate, suspend, dispose, scope: scopeOf,
      gesturing: () => _gesture > 0,
      capabilities: () => Array.from(CAPS.keys()),
      stateOf: (n) => { const c = CAPS.get(n); return c ? c.state : null; },
      generationOf: (n) => { const c = CAPS.get(n); return c ? c.gen : null; },
      /* what the instrument reads — js/perf-hud.js and tests/r234. Counts, not opinions. */
      stats: () => ({
        reads: READ.size, writes: WRITE.size, camera: CAM.size, timers: TIMERS.size,
        capabilities: CAPS.size, suspended: SUSPENDED.size, unowned: _own.unowned,
        frames: _stats.frames, tasks: _stats.tasks, lastMs: _stats.lastMs, maxMs: _stats.maxMs,
      }),
    };
    try { window.IntMapRuntime = API; } catch (_) { }
    /* (#R408) …and take over the timers that armed themselves before this line ran. Without this
       they stay real `setInterval`s for the life of the tab — see the note under everyTick. */
    adoptEarlyTimers(API);
    return API;
  })();
}

/* ══ THE TWO NAMES THE REST OF js/ CALLS ══════════════════════════════════════════════════════
 *  The wheel above has existed since #R234 and its header promised it would replace "thirty-nine"
 *  `setInterval`s. It had ZERO callers, and there were FORTY-THREE raw `setInterval`s in js/ — so
 *  the register built to make hidden-tab wake-ups exact was, in practice, one more thing that was
 *  true only on paper. (#R394 is the same shape: a column naming which mechanism decided, written
 *  unconditionally by a mechanism that never ran.) A gate now measures it: tests/r408-checks ②.
 *
 *  Two exported names rather than "call window.IntMapRuntime.every yourself", for two reasons:
 *   1. `window.IntMapRuntime` does not exist until js/app-body.js builds it, and TWO of the sites
 *      run before that: js/perf-hud.js (`?perf=1` only) at module-evaluation time, and
 *      js/theme-sky.js, whose factory body runs at js/app-body.js:500 — some 250 lines ABOVE the
 *      `makeRuntime` call at :756. A caller that silently does nothing because the register was not
 *      there yet is #R170's defect, so this arms a real interval instead of no-opping.
 *      ⚠⚠⚠ …AND THEN IT HANDS IT OVER, WHICH IS THE HALF THAT ALMOST GOT WRITTEN WRONG. A plain
 *      fallback leaves those two timers OFF the wheel for the life of the tab, so the gate that
 *      counts raw `setInterval`s would read green while two of them ticked in a hidden tab exactly
 *      as before — «the column says which mechanism decided, and that mechanism never ran» (#R394),
 *      one round after writing that sentence down. So `makeRuntime` ADOPTS whatever armed itself
 *      early: it clears the real interval and re-registers the same key, period and function on the
 *      wheel. Being early costs a caller nothing but the milliseconds before the register exists.
 *   2. `stopTick` accepts BOTH the stop function this returns and a raw numeric handle. The
 *      dangerous state is a half-converted file — `clearInterval(fn)` is a silent no-op and leaks
 *      the timer for the life of the tab — and accepting both makes that state impossible to write.
 *
 *  ⚠ KEYS ARE GLOBAL. One Map holds every timer, so a key must name its owner:
 *  'data-layers:orphan-sweep', not 'sweep'. A second `everyTick` with the same key REPLACES the
 *  first — which is what a restart wants, and is NOT what two concurrent instances want, so
 *  anything that can run more than once at a time puts its instance id in the key.
 *  ⚠ `opts.whenHidden` keeps a timer running in a hidden tab. The default is off; it is on only
 *  where a missed tick loses something the reader would notice on return.
 * ==========================================================================*/
export function everyTick(key, ms, fn, opts) {
  let R = null;
  try { R = window.IntMapRuntime; } catch (_) { R = null; }
  if (R && typeof R.every === 'function') return R.every(key, ms, fn, opts);
  /* Too early for the register. Arm a real interval so the caller is not a silent no-op, and leave
     it where `makeRuntime` will find it. ⚠ the same key twice means the first one is superseded,
     exactly as the wheel treats it — so clear it rather than leaking a timer nobody can reach. */
  const p = Math.max(16, +ms || 1000);
  const prev = PENDING_TICKS.get(key);
  if (prev) { try { clearInterval(prev.h); } catch (_) { } }
  PENDING_TICKS.set(key, { ms: p, fn, opts: opts || undefined, h: setInterval(fn, p) });
  return () => {
    const rec = PENDING_TICKS.get(key);
    if (rec) { try { clearInterval(rec.h); } catch (_) { } PENDING_TICKS.delete(key); }
    /* …and if it was adopted between arming and stopping, the wheel is the one holding it now. */
    let R2 = null; try { R2 = window.IntMapRuntime; } catch (_) { R2 = null; }
    if (R2 && typeof R2.clearEvery === 'function') R2.clearEvery(key);
  };
}
/* the timers that armed themselves before the register existed — key → {ms, fn, opts, h}. A module-scope
   Map since #R795 (it hung off the function while tests/r175 ③ forbade a top-level declaration). */
const PENDING_TICKS = new Map();
/* give back every timer armed before a register existed — a headless caller (a test, a script) that
   mounted no runtime is otherwise left with a raw interval holding its process open */
export function stopEarlyTimers() {
  let n = 0;
  for (const r of PENDING_TICKS.values()) { try { clearInterval(r.h); } catch (_) { } n++; }
  PENDING_TICKS.clear();
  return n;
}
function adoptEarlyTimers(API) {
  for (const [k, r] of Array.from(PENDING_TICKS)) {
    try { clearInterval(r.h); } catch (_) { }
    try { API.every(k, r.ms, r.fn, r.opts); } catch (_) { }
  }
  PENDING_TICKS.clear();
}

/* A serial, for the timers that can be live MORE THAN ONCE AT A TIME — a poll per popup, a retry per
   generation. Keys are global to the wheel and a second `everyTick` under the same key REPLACES the
   first, so such a timer has to name its call and not only its purpose. */
let tickSerial = 0;
export function tickKey(prefix) { tickSerial++; return prefix + '#' + tickSerial; }

export function stopTick(stop) {
  if (!stop) return;
  if (typeof stop === 'function') { try { stop(); } catch (_) { } return; }
  try { clearInterval(stop); } catch (_) { }
}
