/* ============================================================================
 *  IntMap · RUNTIME — the one frame loop, the one timer, the one lifecycle  (#R234)
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
 *  ══ THE FOUR REGISTERS ════════════════════════════════════════════════════════════════════════
 *   1. `onCamera(key, fn, {phase})` — the camera moved. ONE engine subscription drives all of them.
 *      `phase:'read'` runs before every `phase:'write'`, so geometry is sampled from one layout.
 *   2. `frame(key, fn)` — do this on the next animation frame, coalesced by key. Same driver.
 *   3. `every(key, ms, fn)` — one timer wheel instead of N `setInterval`s. Skipped while the
 *      document is hidden (a browser already throttles hidden timers; this makes it exact and
 *      makes the wake-up ONE timer instead of thirty-nine).
 *   4. `idle(key, fn)` — after the frame, when nothing is pending.
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
    const ONCE = new Map();      /* key → {fn, cap} — frame(), cleared after it runs */
    const CAM = new Set();       /* keys in READ/WRITE that are camera-driven */
    const SUSPENDED = new Set(); /* capability names whose entries are skipped */

    let _raf = 0, _camWired = false, _dirty = false;
    let _gesture = 0;            /* depth of movestart/moveend nesting; >0 while the camera moves */
    const _stats = { frames: 0, tasks: 0, maxMs: 0, lastMs: 0 };

    function _skip(e) { return !e || (e.cap && SUSPENDED.has(e.cap)); }

    function _run(map, transient) {
      for (const [k, e] of map) {
        if (_skip(e)) continue;
        /* ⚠ one task's throw must not cost every later task its frame — that is how a scheduler
           turns one bug into a frozen map. Report and carry on. */
        try { e.fn(); } catch (err) { _oops(k, err); }
        _stats.tasks++;
      }
      if (transient) map.clear();
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
    function dispose(name) {
      const c = CAPS.get(name); if (!c) return false;
      suspend(name);
      try { if (c.def.dispose) c.def.dispose(); } catch (e) { _oops('dispose:' + name, e); }
      for (const m of [READ, WRITE, ONCE]) for (const [k, e] of Array.from(m)) if (e.cap === name) { m.delete(k); CAM.delete(k); }
      for (const [k, t] of Array.from(TIMERS)) if (t.cap === name) TIMERS.delete(k);
      CAPS.delete(name); SUSPENDED.delete(name);
      return true;
    }

    const API = {
      onCamera, offCamera, frame, every, clearEvery, idle, schedule,
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
    return API;
  })();
}
