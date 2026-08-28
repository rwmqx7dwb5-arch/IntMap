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
 *  ⚠ ONE EXPORT AND EVERYTHING INSIDE IT — tests/r175-checks ③ forbids an unexported top-level
 *  declaration in js/, because such a name would have been a global before the bundle.
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
      const E = window.IntMapGeoEngine;
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
      ONCE.set(key, { fn, cap: (opts && opts.capability) || null });
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
    }
    function _hidden() { try { return !!document.hidden; } catch (_) { return false; } }

    function every(key, ms, fn, opts) {
      const o = opts || {};
      const p = Math.max(16, +ms || 1000);
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
      IDLE.set(key, { fn, cap: (opts && opts.capability) || null });
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
       here would be the two-lists defect (#R220). `load` is where a definition calls it. */
    const CAPS = new Map();      /* name → {def, state, p} */

    function define(name, def) {
      CAPS.set(name, { def: def || {}, state: 'defined', p: null });
      return name;
    }
    function load(name) {
      const c = CAPS.get(name);
      if (!c) return Promise.reject(new Error('no such capability: ' + name));
      if (c.p) return c.p;
      c.state = 'loading';
      c.p = Promise.resolve().then(() => (c.def.load ? c.def.load(IM_HOST) : null))
        .then((v) => { c.state = 'loaded'; return v; })
        .catch((e) => { c.state = 'failed'; _oops('capability:' + name, e); return null; });
      return c.p;
    }
    function activate(name, arg) {
      return load(name).then((v) => {
        const c = CAPS.get(name); if (!c) return null;
        SUSPENDED.delete(name);
        if (c.state === 'failed') return null;
        c.state = 'active';
        schedule();
        try { return c.def.activate ? c.def.activate(arg, v) : v; } catch (e) { _oops('activate:' + name, e); return null; }
      });
    }
    function suspend(name) {
      const c = CAPS.get(name); if (!c) return false;
      /* ⚠ the flag goes up FIRST: whatever `suspend` does must not be able to be undone by a task
         of its own that was already queued for this frame. */
      SUSPENDED.add(name);
      if (c.state === 'active') c.state = 'loaded';
      try { if (c.def.suspend) c.def.suspend(); } catch (e) { _oops('suspend:' + name, e); }
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
       resources that had just been released. */
    function dispose(name) {
      const c = CAPS.get(name); if (!c) return false;
      suspend(name);
      try { if (c.def.dispose) c.def.dispose(); } catch (e) { _oops('dispose:' + name, e); }
      for (const m of [READ, WRITE, ONCE, IDLE]) for (const [k, e] of Array.from(m)) if (e.cap === name) { m.delete(k); CAM.delete(k); }
      for (const [k, t] of Array.from(TIMERS)) if (t.cap === name) TIMERS.delete(k);
      c.state = 'disposed'; c.p = null;
      SUSPENDED.delete(name);
      return true;
    }

    const API = {
      onCamera, offCamera, frame, every, clearEvery, idle, schedule,
      box, remeasure,
      define, load, activate, suspend, dispose,
      gesturing: () => _gesture > 0,
      capabilities: () => Array.from(CAPS.keys()),
      stateOf: (n) => { const c = CAPS.get(n); return c ? c.state : null; },
      /* what the instrument reads — js/perf-hud.js and tests/r234. Counts, not opinions. */
      stats: () => ({
        reads: READ.size, writes: WRITE.size, camera: CAM.size, timers: TIMERS.size,
        capabilities: CAPS.size, suspended: SUSPENDED.size,
        frames: _stats.frames, tasks: _stats.tasks, lastMs: _stats.lastMs, maxMs: _stats.maxMs,
      }),
    };
    try { window.IntMapRuntime = API; } catch (_) { }
    /* (#R408) …and take over the timers that armed themselves before this line ran. Without this
       they stay real `setInterval`s for the life of the tab — see the note under everyTick.
       ⚠ inline rather than a helper: tests/r175 ③ requires every js/ export to be imported by name
       somewhere, and a function only this file calls would be dead by that rule. */
    try {
      for (const [k, r] of Array.from(everyTick.pending)) {
        try { clearInterval(r.h); } catch (_) { }
        API.every(k, r.ms, r.fn, r.opts);
      }
      everyTick.pending.clear();
    } catch (_) { }
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
  const prev = everyTick.pending.get(key);
  if (prev) { try { clearInterval(prev.h); } catch (_) { } }
  everyTick.pending.set(key, { ms: p, fn, opts: opts || undefined, h: setInterval(fn, p) });
  return () => {
    const rec = everyTick.pending.get(key);
    if (rec) { try { clearInterval(rec.h); } catch (_) { } everyTick.pending.delete(key); }
    /* …and if it was adopted between arming and stopping, the wheel is the one holding it now. */
    let R2 = null; try { R2 = window.IntMapRuntime; } catch (_) { R2 = null; }
    if (R2 && typeof R2.clearEvery === 'function') R2.clearEvery(key);
  };
}
/* ⚠ a property rather than a top-level `const`: tests/r175 ③ forbids an unexported top-level
   declaration in js/, because such a name would have been a global before the bundle. */
everyTick.pending = new Map();

/* A serial, for the timers that can be live MORE THAN ONCE AT A TIME — a poll per popup, a retry per
   generation. Keys are global to the wheel and a second `everyTick` under the same key REPLACES the
   first, so such a timer has to name its call and not only its purpose.
   ⚠ It lives here, and on the function rather than beside it, because a module-scope `let` in js/ is
   exactly what tests/r175 ③ forbids: before the bundle that name was a global. */
export function tickKey(prefix) { tickKey.n = (tickKey.n || 0) + 1; return prefix + '#' + tickKey.n; }
tickKey.n = 0;

export function stopTick(stop) {
  if (!stop) return;
  if (typeof stop === 'function') { try { stop(); } catch (_) { } return; }
  try { clearInterval(stop); } catch (_) { }
}
