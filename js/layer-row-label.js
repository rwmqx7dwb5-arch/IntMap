/* ============================================================================
 *  IntMap · js/layer-row-label.js — THE NAME A ROW OF THE LAYERS REGISTRY SHOWS THE READER
 * ----------------------------------------------------------------------------
 *  A row of `#layer-dropdown` names itself in the reader's language — through `data-i18n`, or through
 *  the words the module that builds it wrote (js/layer-manifest.js: «a row without `label` is named by
 *  the module that builds it»). Atlas read that name with one expression written twice inside
 *  js/atlas-console.js (`layerCatalog` and `_labelOf`), and the command palette (js/command-palette.js)
 *  needs the same answer. One reading, here, for every reader of the registry.
 * ==========================================================================*/

/** the visible name of the registry row a checkbox belongs to ('' when it has none) */
export function layerRowLabel(cb) {
  try {
    const lab = cb && (cb.closest('label') || cb.closest('.lyr-row'));
    if (!lab) return '';
    const sp = lab.querySelector('span[data-i18n], span.ec-lbl, span[id$="-lbl"], .geo-label');
    return String(sp ? sp.textContent : (lab.textContent || '')).replace(/\s+/g, ' ').trim();
  } catch (_) { return ''; }
}

/** every checkbox of the registry, in the panel's order */
export function registryBoxes() {
  try { return Array.from(document.querySelectorAll('#layer-dropdown input[type=checkbox]')); } catch (_) { return []; }
}
