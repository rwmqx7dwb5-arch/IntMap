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

try { if (typeof document !== 'undefined') mountManifestRows(document); } catch (e) { try { console.warn('[IntMap] layer rows', e); } catch (_) {} }
