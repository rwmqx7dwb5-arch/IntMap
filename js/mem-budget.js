/* ============================================================================
 *  IntMap · WHAT THIS DEVICE MAY HOLD — one owner for the decoded-DEM ceilings  (#R668)
 * ----------------------------------------------------------------------------
 *  「スマホでズームやホバーが遅い。操作によってはブラウザが落ちる。メモリを使いすぎているのでは。」
 *
 *  ══ THE DEFECT THIS FILE EXISTS FOR ═══════════════════════════════════════════════════════════
 *  FIVE places in this app keep decoded terrarium tiles. Every one of them holds the SAME shape —
 *  `Float32Array(256·256)` = **262,144 bytes** — fetched from the SAME upstream (elevation-tiles-prod
 *  terrarium), and every one of them had its own hand-written ceiling:
 *
 *      src/photo-geo-worker.js        TILE_CACHE_MAX = 1400   → 367 MB
 *      js/map-readout.js              _demCache, phone 140    →  37 MB  (its lease ceiling: #R651)
 *      js/cesium-layers.js            MAX = 400               → 105 MB
 *      js/terrain-water.js            _demBase, trims at 360  →  94 MB
 *      src/photo-geo-worker-client.js pageTiles               →  NO CEILING AT ALL
 *
 *  ⚠⚠⚠ FOUR OF THE FIVE NEVER ASK WHAT DEVICE THEY ARE ON. `1400`, `400` and `360` are the same
 *  numbers on a desktop with 32 GB and on a phone whose whole tab budget may be under a gigabyte,
 *  and `pageTiles` — the MAIN-THREAD fallback, the path taken exactly when the worker could not be
 *  created, which on a memory-starved phone is the likeliest moment of all — has no ceiling to
 *  ignore. Summed, the ceilings authorise about **600 MB of decoded elevation** on a device that
 *  cannot survive a third of it.
 *
 *  ══ WHY A BUDGET AND NOT A PRESSURE SENSOR ════════════════════════════════════════════════════
 *  The existing guard (js/label-occlusion.js) waits for `performance.memory` to cross 0.85 and then
 *  frees things. That is the wrong half of the problem on the reported device, for two reasons that
 *  are facts about the platform rather than opinions about design:
 *
 *    ① `performance.memory` DOES NOT EXIST IN SAFARI. On the iPhone the report is about, the sensor
 *       reads nothing, so the guard is a no-op and every ceiling above is the real ceiling.
 *    ② A ceiling is crossed BETWEEN polls. The guard looks every 8 seconds; one continental
 *       elevation field asks for up to 1,600 tiles in far less than that.
 *
 *  So the ceiling has to be correct BEFORE the allocation, not corrected after it — 「対策の中心を、
 *  圧迫検出後の解放ではなく、確保前の予算管理へ移す」. That is what this file owns. The pressure
 *  path still exists and still helps where the sensor exists; it is now a SECOND line (see
 *  `register`/`relieve` below) rather than the only one.
 *
 *  ══ ⚠ AND THE NUMBERS CARRY THEIR PROVENANCE ═════════════════════════════════════════════════
 *  `.agents/rules/no-ad-hoc-hardcoding.md` §4 requires every constant to say what was observed, what
 *  makes it expire, and who is the source of truth. Each one below does. What this file must NOT
 *  become is a table of per-caller exceptions: callers ask `demTiles(name)` and get an answer
 *  derived from the device and from what a tile costs, not from a list of names with numbers.
 *
 *  ⚠ NO `window`, NO `matchMedia`, NO DOM. This module is imported by BOTH page code and
 *  `src/photo-geo-worker.js`, and a worker has none of those. The device is DISCOVERED on the page
 *  (where the media queries exist) and HANDED to the worker through `adopt()`. A worker that was
 *  never told assumes the SMALL device — an unknown device is not a spacious one, which is #R651's
 *  rule for `navigator.deviceMemory` and the same rule here.
 * ==========================================================================*/
(function (G) {
  'use strict';

  /* ── what one decoded tile costs ─────────────────────────────────────────────────────────────
     OBSERVED: every producer in this app decodes a 256×256 terrarium PNG into one elevation per
       pixel as `Float32Array(65536)` — js/photo-geo-terrain.js `decodeTerrarium`,
       js/map-readout.js `_decodeTile`, js/cesium-layers.js, js/terrain-water.js `_demTile`.
       65,536 × 4 = 262,144 bytes, and that is the retained size: the ImageBitmap and the canvas
       the decode went through are released, the Float32Array is what is kept.
     EXPIRES IF: a producer changes tile size (512² would be ×4) or element type (Int16Array would
       halve it). tests/r668-checks asserts the producers still make Float32Array(65536).
     SOURCE OF TRUTH: this constant. The five stores must not restate it. */
  const DEM_TILE_BYTES = 256 * 256 * 4;

  /* ── how many BYTES of decoded elevation this device may hold, across all five stores ─────────
     OBSERVED: the phone ceilings this app already trusts elsewhere are of this order —
       js/app-body.js:824 gives a phone 640–1024 resident MapLibre tiles, and #R21/#R20 arrived at
       those after OOM tab-kills. Decoded elevation is a SEPARATE budget from that one (MapLibre's
       tiles are the renderer's, these are ours), so it is deliberately the smaller of the two.
       192 MB desktop / 48 MB phone is 732 / 183 tiles — more than one screen's worth of terrain at
       any zoom this app offers, and well inside what a phone tab survives alongside the renderer.
     EXPIRES IF: measured tab-kills reappear on a phone with these ceilings in force, or the
       renderer's own budget (js/app-body.js:824) moves far enough that the two together do not fit.
     SOURCE OF TRUTH: this file. ⚠ It is a TOTAL, not a per-store allowance — see `demTiles`. */
  const BUDGET_BYTES = { phone: 48 * 1024 * 1024, desktop: 192 * 1024 * 1024 };

  /* ── the five stores, and what share of the budget each may take ──────────────────────────────
     ⚠ THESE ARE SHARES OF ONE BUDGET, NOT FIVE INDEPENDENT CEILINGS — which is the whole defect.
     They are weights rather than counts, so a change to the device or to what a tile costs moves
     all five together and none of them can drift away from the others.
     The weights follow how much of ONE PICTURE each store needs at once:
       · `photoSearch`  sweeps a rectangle and needs the whole rectangle resident — the largest.
       · `readout`      answers one point under the finger, plus whatever a build has pinned (#R651
                        owns its lease ceiling; this is the unpinned steady state).
       · `cesium`       holds what the 3-D globe has on screen.
       · `terrainEdit`  holds the tiles the brush has touched.
     A name this table does not know gets the smallest share rather than an exception — a store that
     wants more has to say so HERE, where the other four are visible. */
  const SHARE = { photoSearch: 0.40, cesium: 0.25, terrainEdit: 0.20, readout: 0.15 };
  const MIN_TILES = 24;   /* below this a store cannot hold one viewport and would thrash instead of cache */

  /* ── the device ──────────────────────────────────────────────────────────────────────────────
     ⚠⚠ 「携帯か」 IS A QUESTION ABOUT THE DEVICE, AND A WIDTH ANSWERS IT WRONG. #R232 established
     that and #R498 swept it again: an iPhone turned sideways is 844 px, so a `(max-width:768px)`
     test says "not a phone" about the same phone. The page's answer is `window._imPhoneClass()`
     (js/app-body.js:159), which asks the POINTER and the SCREEN. This file never re-derives it —
     it reads that one, and in a worker it uses whatever the page handed over. */
  let _phone = null;      /* null = nobody has said yet */

  function _discover() {
    if (_phone !== null) return _phone;
    try {
      if (typeof G._imPhoneClass === 'function') { _phone = !!G._imPhoneClass(); return _phone; }
    } catch (_) { }
    /* ⚠ AN UNKNOWN DEVICE IS THE SMALL ONE. A worker that was never told, or a page where the shell
       has not published `_imPhoneClass` yet, must not be handed the desktop ceiling on the strength
       of not knowing — that is the same mistake #R651 removed from `navigator.deviceMemory`, where
       `undefined` (which is what every iPhone reports, always) was being read as "plenty". */
    return true;
  }

  /* the page tells the worker what it found; a worker cannot ask a media query. */
  function adopt(isPhone) { _phone = !!isPhone; }
  function isPhone() { return _discover(); }

  /* ══ ⚠⚠⚠ THE PREDICATE EVERY COST DECISION ASKS — SO THAT NOBODY WRITES A FOURTH COPY ═════════
     #R232 established the rule, #R498 swept it, and #R668 found **39 cost decisions in 18 files
     still asking `isMobile()`** — a `(max-width:768px)` media query, which says "not a phone" about
     an iPhone held sideways (844 px). On that device the app was taking, all at once, the DESKTOP
     budget for the Köppen canvas (16 MB → 67 MB), the seismic far raster (6.6 MB → 48 MB), the
     tsunami grid (×2.8), the wind particles (2,200 → 6,000), the DEM tile budgets, the water solver
     (9,000 → 120,000 steps, 2.5 s → 6 s of main thread) — and NO memory-pressure guard at all.
     ⚠ WHY THE ANSWER IS PUBLISHED RATHER THAN COPIED. Three files had already re-derived the
     predicate by hand (js/dem-source.js, js/precip-annual.js, js/vs30-mask.js) and all three copied
     only its FIRST TWO clauses, dropping the screen-size clause #R499 added — so a phone with a
     Bluetooth mouse, or a stylus, took the desktop budget again. A predicate that is copied is a
     predicate that drifts; this is the one place it is answered.
     ⚠ `fallback` IS THE CALLER'S OLD TEST, NOT `true`. This runs during boot too, before
     js/app-body.js has published `_imPhoneClass` — and returning "phone" to a desktop that simply
     asked early would shrink a workstation's budgets for no reason. Falling back to what the caller
     used to do makes this change strictly an improvement: never worse than today, and correct as
     soon as the shell is up. (The BUDGET's own default, above, is the opposite and deliberately so:
     an unknown device gets the small ceiling, because there the risk is a dead tab.) */
  function deviceIsPhone(fallback) {
    try {
      if (typeof G._imPhoneClass === 'function') return !!G._imPhoneClass();
    } catch (_) { }
    try { return typeof fallback === 'function' ? !!fallback() : !!fallback; } catch (_) { return false; }
  }

  /* ── the answer a store asks for ─────────────────────────────────────────────────────────────
     `demTiles('cesium')` → how many decoded tiles that store may hold ON THIS DEVICE. */
  function demTiles(name) {
    const total = BUDGET_BYTES[_discover() ? 'phone' : 'desktop'];
    const share = SHARE[name] !== undefined ? SHARE[name] : Math.min.apply(null, Object.keys(SHARE).map((k) => SHARE[k]));
    return Math.max(MIN_TILES, Math.floor((total * share) / DEM_TILE_BYTES));
  }

  /* ══ THE SECOND LINE: what can be given back when something else needs the room ═══════════════
     The pressure path that existed before this file reached exactly TWO caches, because it was a
     pair of hand-written `addEventListener('intmap-mem-pressure')` calls and the five stores above
     were not among them. A hand-maintained list of who gets told is the shape
     `.agents/rules/no-ad-hoc-hardcoding.md` §1 forbids: the next store added is silently not told.
     So stores ENROL, and the guard asks the registry rather than naming anybody.
     ⚠ `release()` must leave the store WORKING — everything here is rebuildable from the network,
     so dropping it costs a refetch and never correctness. */
  const _stores = new Map();   /* name → {bytes, release} */

  function register(name, hooks) {
    if (!name || !hooks || typeof hooks.release !== 'function') return function () { };
    _stores.set(name, hooks);
    return function () { _stores.delete(name); };
  }

  /* what the enrolled stores say they are holding, in bytes. Reported rather than guessed: a store
     that cannot say returns 0 and is simply not counted, which is honest — an unknown is not a zero
     anywhere a decision depends on it, and no decision here does. */
  function heldBytes() {
    let n = 0;
    for (const s of _stores.values()) { try { n += (typeof s.bytes === 'function' ? +s.bytes() : 0) || 0; } catch (_) { } }
    return n;
  }

  /* ask every enrolled store to give back what it can. Returns the number of stores that answered,
     so a caller can tell "nobody was holding anything" from "nobody is enrolled". */
  function relieve() {
    let n = 0;
    for (const s of _stores.values()) { try { s.release(); n++; } catch (_) { } }
    return n;
  }

  function stores() { return Array.from(_stores.keys()); }

  G.IntMapMemBudget = {
    DEM_TILE_BYTES, BUDGET_BYTES, SHARE, MIN_TILES,
    adopt, isPhone, deviceIsPhone, demTiles,
    register, relieve, heldBytes, stores,
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
