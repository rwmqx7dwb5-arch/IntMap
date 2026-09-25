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
 *        a box ticked and unticked while the style was loading is delivered once, as unticked.
 *    WHEN it is delivered depends on whether the renderer has had its first `load`:
 *      · held before that first `load` (the boot — the only time the production failure happened) →
 *        delivered right AFTER it, and everything that arrives until then waits in the same queue so
 *        nothing overtakes it. Not at the first moment canDraw() is true: MapLibre fires `load` only
 *        once every source present has loaded, so adding the held layers at the parse puts their
 *        sources in front of the app's own boot. MEASURED with all 87 shareable layers held: the
 *        app's `load` handler (js/app-body.js — the whole-Earth floor, the default layers, the launch
 *        screen's milestones) had not run 28 s after the style was released. The app's own restores
 *        were written to run after `load` (js/map-ui.js, js/session-tabs.js wait for it); this only
 *        restores that order for the requests whose fallback clocks ran ahead of it.
 *      · held after it (a style that was parsed and is being replaced) → delivered when
 *        GE().whenCanDraw() resolves, which it never does early (js/geo-engine.js).
 *    With no renderer at all there is nothing to wait for, and the event passes as it always did.
 *    Measured before this: the same share link carrying all 87 shareable layers, opened with the style
 *    held back, ended with 23 map layers fewer than the same link opened normally
 *    (tests/restored-layer-before-style.spec.js).
 * ==========================================================================*/
import { htmlRows, rowHTML, isLayer } from './layer-manifest.js';

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
  const held = new Map();   /* id → box, in the order they first arrived */
  let waiting = false;
  /* has the renderer had its first `load`? undefined = not asked yet. It can only be learned by
     listening BEFORE it happens, and the one moment that is certain is a check that finds the style
     unparsed (`load` implies a parsed style). A first look that finds it parsed cannot tell, and
     answers «yes»: the event then passes exactly as it did before this gate existed. */
  let booted;
  const deliver = () => {
    waiting = false;
    const boxes = Array.from(held.values()); held.clear();
    for (const cb of boxes) { try { cb.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {} }
  };
  const listener = (e) => {
    const cb = e.target;
    if (!cb || cb.type !== 'checkbox' || !cb.id || !isLayer(cb.id)) return;
    let E = null, drawable = true;
    try { E = engine(); } catch (_) { E = null; }
    try { if (!(E && E.hasRenderer())) return; drawable = !!E.canDraw(); } catch (_) { return; }
    if (booted === undefined) {
      booted = drawable;
      if (!booted) {
        try { E.events.once('load', () => { booted = true; if (held.size) E.whenCanDraw().then(deliver, deliver); else waiting = false; }); }
        catch (_) { booted = true; }
      }
    }
    if (drawable && booted) return;
    e.stopPropagation();
    if (!held.has(cb.id)) held.set(cb.id, cb);
    if (waiting) return;
    waiting = true;
    if (booted) E.whenCanDraw().then(deliver, deliver);   /* else: the `load` listener above delivers */
  };
  d.addEventListener('change', listener, true);
  return listener;
}

try { if (typeof document !== 'undefined') mountManifestRows(document); } catch (e) { try { console.warn('[IntMap] layer rows', e); } catch (_) {} }
try { if (typeof document !== 'undefined') holdUntilDrawable(document, () => window.IntMapGeoEngine); } catch (e) { try { console.warn('[IntMap] layer hold', e); } catch (_) {} }
