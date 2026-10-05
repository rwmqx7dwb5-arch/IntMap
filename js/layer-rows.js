/* ============================================================================
 *  IntMap · js/layer-rows.js — the DOM side of js/layer-manifest.js
 * ----------------------------------------------------------------------------
 *  Two things, both about the Layers registry `#layer-dropdown`:
 *
 *  ① THE ROWS THE MANIFEST OWNS ARE WRITTEN FROM IT, AT IMPORT. The always-on switches (地名・国境・
 *    道路…) and the hidden 国境・国情報 box used to be ten `<label>` lines in index.html, and their
 *    default tick was a second list in js/data-layers.js (#R476: 「ONE edit in two files」). They are
 *    generated here from the manifest's `html` entries, byte-for-byte the markup index.html shipped,
 *    so the tick and window.IntMapDefaultOn are the same field.
 *    ⚠ src/main.js imports this file right after js/i18n.js and before every module that reads the
 *    registry (the first reader is js/data-layers.js), so no reader can see the document without
 *    them. The English text comes from the English table (loaded eagerly); the i18n pass translates
 *    the `data-i18n` spans later exactly as it did the markup.
 *
 *  ② `whenBoxes(ids, fn)` — CALL `fn(checkbox)` FOR EACH ID AS SOON AS ITS CHECKBOX EXISTS.
 *    ~160 rows are still built by their own modules' `buildUI()` (900 ms and later), and the session
 *    restore used to wait for them with a 25 × 220 ms poll: an id whose row was late by more than
 *    5.5 s was dropped, and an id that would never have a row (a retired layer) cost 25 polls. With
 *    the manifest the restore knows which ids are layers before any row exists: an id the manifest
 *    does not declare (and the document does not have) is settled at once, and a declared one is
 *    applied the moment its row is inserted — a MutationObserver on the registry, disconnected when
 *    the last id has arrived. No clock decides anything.
 *
 *  ③ A LAYER'S `change` THAT ARRIVES BEFORE THE STYLE CAN TAKE LAYERS IS HELD, AND DELIVERED ONCE WHEN
 *    IT CAN (`holdUntilDrawable`). Every way a layer is switched — a finger, the share link's `&l=`
 *    (js/map-ui.js), the saved session (js/session-tabs.js), the default-on boxes (js/app-body.js),
 *    Atlas, the favourites, the packs — ends in the same `change` on the box, and the handlers of all
 *    the manifest's rows (built by some twenty modules) answer it with addSource/addLayer.
 *    Measured on production (2026-09-26): a tab opened HIDDEN parses no
 *    style (MapLibre parses inside an animation frame, and a hidden tab runs none), the restore fired
 *    anyway, the aircraft handler threw «Style is not done loading.» on the spot, the radar's wait
 *    gave up at ~6 s and threw the same, and neither ever came back while both boxes stayed ticked.
 *    Only the submarine cables recovered, because #R187/#R355 had given THAT layer a retry of its own.
 *    Giving each of the others its own retry is the per-case fix .agents/rules/no-ad-hoc-hardcoding.md
 *    forbids; the fact they share is the event, so this is where it is held:
 *      · a capture listener on the document sees every box's `change` before its module does;
 *      · a box the manifest declares, while the renderer EXISTS but canDraw() is false, is stopped
 *        before it reaches the box (`stopPropagation`, not the immediate form — a listener on the
 *        document itself, the session save, still sees the reader's own click as it happened);
 *      · each held box then gets ONE fresh `change`, in arrival order, carrying the state it has THEN:
 *        a box ticked and unticked while the style was loading is delivered once, as unticked —
 *        and carrying WHO set that state: a box whose latest held change was the reconciler's own
 *        (`cb.__syn`, js/data-layers.js) is delivered as the reconciler's own, not as the reader's.
 *    They are delivered when GE().whenCanDraw() resolves — which it never does early (js/geo-engine.js)
 *    — and at no other moment.
 *    ⚠ NOT AT MapLibre's `load`. The first version waited for it, to keep the held layers' sources
 *    from delaying the app's own boot (which was keyed to `load` too). `load` is not an event anyone
 *    can wait on: MapLibre fires it from INSIDE a render, only when every source present has loaded,
 *    and a render that throws never reaches it. MEASURED in CI (PR #760, Browser rest 2/2): the held
 *    boot still had neither the app's boot work nor a single delivered layer 180 s after the style was
 *    released; locally under 4-6x CPU throttling the same boot logged
 *    «Cannot read properties of undefined (reading 'bind')» from drawRaster 44-54 times per run. A
 *    wait keyed to that event is the deadlock one-pass-or-a-reason.md §2 describes. The boot is keyed
 *    to whenCanDraw() instead (js/app-body.js), and its wait was registered long before any box can
 *    change, so it is answered FIRST — the queue drains in registration order — and the held layers
 *    come after the app's own boot work, not in front of it.
 *    With no renderer at all there is nothing to wait for, and the event passes as it always did.
 *    Measured before this: the same share link carrying all 87 shareable layers, opened with the style
 *    held back, ended with 23 map layers fewer than the same link opened normally
 *    (tests/restored-layer-before-style.spec.js).
 *
 *  ④ A DELIVERED `change` WHOSE ANSWER IS STILL BEING FETCHED IS IN FLIGHT (`inFlight`). ③ covers the
 *    time before a change reaches its handler; this covers the time after — the handler has been asked
 *    to draw and the work it started (a style wait, a fetch, a build ladder) has not finished. The
 *    handler says so itself: it hands the promise its request returned to `track(id, p)`, and the entry
 *    leaves when that promise settles, fulfilled OR rejected. The newest change for a box is the one in
 *    flight — a later `track` replaces an earlier one, and a change answered at once (`p` not a
 *    promise) clears it — so an older request finishing late never clears a newer one.
 *    Readers: the reconciler in js/data-layers.js does not judge a box in flight («not painted» while
 *    the paint is still being fetched is observing nothing — .agents/rules/one-pass-or-a-reason.md
 *    §2 ①), and its post-toggle look waits on `idle(id)` and looks once when the request has settled.
 *    MEASURED (production, 2026-09-27, normal boot): the radar row waits for RainViewer's index before
 *    it can add its layer; the look 2.8 s after the tick found it not yet added, pulsed the box
 *    off→on, and the pulse aborted 34 radar tiles (ERR_ABORTED) that the first request had started.
 *    ⚠ No clock ends an entry. It lasts exactly as long as the request, and every request a row starts
 *    has its own end: the renderer's wait resolves only when it can draw (and while it cannot, every
 *    judge abstains anyway — `_canDraw()`), fetches end with the network, and the build ladders keep
 *    their own horizons (see each branch of toggleLayer). A request that never ends could not be
 *    helped by a pulse either: the rows share their pending request (rvFetch returns the same one),
 *    so a re-ask attaches to the very promise being waited on.
 * ==========================================================================*/
import { htmlRows, rowHTML, isLayer } from './layer-manifest.js';
import { layerState } from './layer-state.js';   /* (layer-failure-state) the outcome of every tracked request is KEPT there — see ⑤ */
import { IntMapGeoEngine } from './geo-engine.js';

/** write the manifest's own rows into the registry (idempotent: a row already present is left alone) */
function mountManifestRows(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const dd = d && d.getElementById('layer-dropdown');
  if (!dd) return 0;
  let en = null;
  try { en = (window.IntMapI18N && window.IntMapI18N.en) || null; } catch (_) { en = null; }
  const text = (k) => (en && typeof en[k] === 'string' ? en[k] : '');
  /* after the favourites block, in manifest order — where index.html had them */
  const fav = d.getElementById('layer-fav-section');
  let at = fav ? fav.nextSibling : dd.firstChild;
  let n = 0;
  for (const l of htmlRows()) {
    if (d.getElementById(l.id)) continue;
    const tpl = d.createElement('template');
    tpl.innerHTML = rowHTML(l, text);
    const row = tpl.content.firstChild;
    dd.insertBefore(row, at); at = row.nextSibling; n++;
  }
  return n;
}

/** call `fn(cb)` once per id, as soon as the checkbox with that id is in the document.
    Ids the manifest does not declare and the document does not have are dropped at once (they
    name a layer that no longer exists — the caller's retirement table has already translated the
    ones that were renamed). Returns the number still waiting after the first pass. */
export function whenBoxes(ids, fn, doc) {
  const d = doc || document;
  const left = new Set((ids || []).filter((id) => isLayer(id) || d.getElementById(id)));
  const run = () => {
    for (const id of Array.from(left)) {
      const cb = d.getElementById(id);
      if (cb) { left.delete(id); try { fn(cb); } catch (_) {} }
    }
    return left.size;
  };
  const waiting = run();
  if (!waiting) return 0;
  const dd = d.getElementById('layer-dropdown');
  if (!dd || typeof MutationObserver === 'undefined') return waiting;
  const mo = new MutationObserver(() => { if (!run()) mo.disconnect(); });
  mo.observe(dd, { childList: true, subtree: true });
  return waiting;
}

/** hold a declared layer box's `change` while the renderer cannot take layers; deliver it once it can.
    `engine()` returns the geo-engine facade (window.IntMapGeoEngine in the app). Returns the listener. */
export function holdUntilDrawable(doc, engine) {
  const d = doc || document;
  /* id → { cb, own }, in the order they first arrived. `own` says whether the LATEST change held for
     the box was the map's own re-dispatch — see `deliver`. */
  const held = new Map();
  let waiting = false;
  /* ══ ⚠⚠ THE DELIVERED CHANGE STANDS FOR THE CHANGES IT REPLACES — INCLUDING WHO MADE THEM ════════
     js/data-layers.js tells the reconciler's own dispatches from everyone else's by a mark on the box,
     `cb.__syn`, raised for exactly the duration of the dispatch; every other change on a Layers box is
     read as the reader's («never fight the user», #R85). A held change is re-sent LATER, when that mark
     is long gone. MEASURED (production, then tests/legend-stack-and-held-heal.spec.js 2/2 before this):
     the #R109 heal pulsed a held radar box off→on, the style became drawable between the two halves,
     this gate delivered the «off» unmarked, the reconciler recorded the reader unticking, and the
     pulse's second half stood down — box unticked, no layer, nobody having touched it.
     So the provenance is kept, and it is the provenance of the change that set the state being
     delivered — the LATEST one held. The delivered change carries the box's state at delivery, and that
     state is what the last change made it: a reader's tick overwritten by the map's own «off» is
     delivered as the map's «off» (the map's own «on» follows it), and a map's pulse overwritten by the
     reader's tick is delivered as the reader's. MEASURED: «the reader's if ANY held change was», the
     first form of this, still delivered that radar «off» as the reader's (the reader's tick had been
     held first) and the box still ended unticked, 2 runs of 2. */
  const deliver = () => {
    waiting = false;
    const boxes = Array.from(held.values()); held.clear();
    for (const { cb, own } of boxes) {
      if (own) { try { cb.__syn = (cb.__syn || 0) + 1; } catch (_) {} }
      try { cb.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
      finally { if (own) { try { cb.__syn = Math.max(0, (cb.__syn || 1) - 1); } catch (_) {} } }
    }
  };
  const listener = (e) => {
    const cb = e.target;
    if (!cb || cb.type !== 'checkbox' || !cb.id || !isLayer(cb.id)) return;
    let E = null;
    try { E = engine(); } catch (_) { E = null; }
    try { if (!(E && E.hasRenderer()) || E.canDraw()) return; } catch (_) { return; }
    e.stopPropagation();
    const own = !!cb.__syn;
    const was = held.get(cb.id);
    if (!was) held.set(cb.id, { cb, own });
    else was.own = own;
    if (waiting) return;
    waiting = true;
    E.whenCanDraw().then(deliver, deliver);
  };
  d.addEventListener('change', listener, true);
  /* what is being held right now — the observable «everything has been delivered» is `pending()` empty */
  listener.pending = () => Array.from(held.keys());
  return listener;
}

/** the boxes whose delivered `change` is still being answered — see ④ in the header.
    `track(id, p)` records the promise a handler's request returned (anything not thenable clears the
    box: the change was answered at once); `has(id)` asks; `idle(id)` resolves once nothing is in flight
    for the box, whichever request that turns out to be; `pending()` lists the boxes.
    ⑤ (layer-failure-state) `watch`, when given, is handed every tracked request too — `watch.request(id, p)`.
    This registry forgets a request the moment it settles, fulfilled or rejected alike, which is right for
    «is it still in flight» and was the whole of what the app knew: a rejected request left no trace. The
    watcher is js/layer-state.js, which KEEPS the outcome (failed / unobserved and why). */
export function inFlight(watch) {
  const live = new Map();
  const has = (id) => live.has(id);
  const track = (id, p) => {
    if (!id) return;
    if (watch) { try { watch.request(id, p); } catch (_) { /* the registry does not depend on its reader */ } }
    if (!p || typeof p.then !== 'function') { live.delete(id); return; }
    live.set(id, p);
    const clear = () => { if (live.get(id) === p) live.delete(id); };
    try { p.then(clear, clear); } catch (_) { clear(); }
  };
  /* wait on whatever is in flight NOW, and again if a newer request replaced it meanwhile. `clear` was
     attached first, so by the time this runs the settled entry has already gone (or been replaced). */
  const idle = (id) => new Promise((res) => {
    const wait = () => { const p = live.get(id); if (!p) { res(); return; } p.then(wait, wait); };
    wait();
  });
  return { track, has, idle, pending: () => Array.from(live.keys()) };
}
/* the one registry the app uses: the rows that start requests (js/data-layers.js) and the reconciler
   that must not judge them (same file) import it — a module binding, not one more window global.
   Watched by js/layer-state.js, the one owner of what became of each request (⑤ above). */
export const layerInflight = inFlight(layerState);

try { if (typeof document !== 'undefined') mountManifestRows(document); } catch (e) { try { console.warn('[IntMap] layer rows', e); } catch (_) {} }
/* (restored-layer-catchup) the page's door for both halves of «has every change been answered»: `pending()` the
   changes still held for the style (③), `inflight()` the boxes whose delivered change is still being answered (④).
   A reader that waits for a restored link to catch up waits on these and on js/layer-state.js, not on a duration. */
try { if (typeof document !== 'undefined') { const l = holdUntilDrawable(document, () => IntMapGeoEngine); window.IntMapLayerHold = { pending: l.pending, inflight: layerInflight.pending }; } } catch (e) { try { console.warn('[IntMap] layer hold', e); } catch (_) {} }

/* ============================================================================================
 *  (layer-ownership-by-declaration) ownershipLearner — which renderer layers a Layers box owns, learned from what
 *  the box itself did. Here, beside the rows' change delivery, rather than in a module of its own: a module of its
 *  own was one more file every boot reads (check:perf eager.modules 314 → 315).
 * --------------------------------------------------------------------------------------------
 *  The reconciler in js/data-layers.js (IntMapLayerAudit) compares each Layers box with the layers it
 *  owns. Id tables name them for ~30 boxes; the rest (146 of 177 at boot, measured 2026-10-05) are
 *  LEARNED, and this is the learner.
 *
 *  ⚠⚠⚠ APPEARING IN THE SAME SECONDS IS NOT OWNERSHIP. The first learner (#R81) diffed the style 0.5 /
 *  1.8 / 4 s after a box went ON and gave the box every layer that had appeared meanwhile — whoever had
 *  added it. MEASURED (production 2026-10-05, build 076f908, reproduced locally): «Historical city
 *  populations» was ticked while the map pane was hidden; when the map could draw, the held ticks were
 *  delivered, the clock-driven era borders (imtb-*) and provinces (imta-*) were added in the same seconds,
 *  and the box was given them. Unticked, the audit hid the era borders every time they were drawn — 1890 had
 *  no borders. A fresh boot gave «Railways» the world-capitals and night-side layers the same way. The only
 *  defence was a hand-kept pattern of prefixes to skip, which named neither imtb- nor imta-.
 *
 *  ⇒ OWNERSHIP IS A CAUSAL FACT: the layers a box's own `change` handlers took OFF THE MAP (a drawn layer
 *  hidden or removed) while that box's OFF was being dispatched. The engine reports every visibility write
 *  synchronously (GE().layers.onVisibility, js/geo-engine.js), with whether the layer was drawn before it;
 *  a write belongs to the innermost Layers-box change event whose dispatch has not returned (`eventPhase
 *  !== 0`, the DOM's own «still being dispatched»). A clock tick, the renderer becoming drawable, a fetch
 *  landing or Atlas drawing cannot run inside that synchronous dispatch, so none of them can be attributed
 *  to a box — whatever its layer is called, and with no list to keep.
 *    · Only a write that took a DRAWN layer off counts: a shared pass the handler calls may re-hide what is
 *      already hidden (measured: the place-name boxes' OFF re-asserts the era-hidden country names), and
 *      that changed nothing.
 *    · Only the OFF side is learned. «When I am off, these are off» is exactly what the audit's hide branch
 *      re-asserts (an async ON callback landing after the OFF, #R36); the ON side can call shared passes that
 *      show layers the box does not own (js/app-body.js _applyBorders shows the era borders whenever the
 *      clock travels).
 *  ⚠ A box learns at its first OFF; until then it owns nothing here, and the audit's check() answers null
 *    («no id table»), which every reader already reads as «nothing to judge».
 *  ⚠ A box whose OFF hides its layers only after awaiting something (a lazily loaded module) is not learned
 *    from a synthetic dispatch — measured: beta-dl-volcso2. An id table (or _registerLayerOpacity's cbId)
 *    covers such a box.
 *  The precedence of the id tables over this (a layer a table gives another box is never this box's) is
 *  applied where both are read — `owned()` in js/data-layers.js.
 * ========================================================================================== */

/**
 * @param {Record<string, Set<string>>} store  box id → the layer ids its own OFF took off the map
 * @returns {{ dispatching(e: Event): void, wrote(id: string, shown: boolean, was: boolean): void }}
 *   `dispatching` — call it for a Layers box's `change` event as its dispatch begins (a capture listener on window);
 *   `wrote` — subscribe it to the engine's onVisibility.
 */
export function ownershipLearner(store) {
  /** @type {Event[]} change events whose dispatch has not returned yet, innermost last */
  const live = [];
  const prune = () => { for (let i = live.length - 1; i >= 0; i--) { if (live[i].eventPhase === 0) live.splice(i, 1); } };
  return {
    dispatching(e) { prune(); live.push(e); },
    wrote(id, shown, was) {
      if (shown || !was || !live.length) return;
      prune();
      const e = live[live.length - 1]; if (!e) return;
      const box = /** @type {any} */ (e.target);
      if (!box || box.checked || !box.id) return;   /* only a box going OFF states what is off with it */
      (store[box.id] = store[box.id] || new Set()).add(id);
    },
  };
}
