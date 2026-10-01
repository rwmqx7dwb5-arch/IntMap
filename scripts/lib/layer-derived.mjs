/* ============================================================================
 *  IntMap · scripts/lib/layer-derived.mjs — EVERYTHING the Layers list hands its readers, as one value
 * ----------------------------------------------------------------------------
 *  (layer-descriptor) The question a migration of the layer list has to answer is not «does the new
 *  file look right» but «does every reader still receive the same bytes». This is the list of what
 *  they receive: every export of js/layer-manifest.js, called the way its readers call it, plus the
 *  markup of the generated rows. tests/fixtures/layer-descriptor-before.json is this value taken
 *  from the hand-kept manifest the commit before the descriptors existed; the descriptor gate
 *  (tests/layer-descriptor-checks.test.mjs) takes it again from the derived manifest and compares
 *  the two as TEXT. A field that moved, a row that changed shelf or order, a flag that flipped —
 *  each changes a byte of this.
 *
 *  ⚠ PURE: takes the manifest module as an argument, so the same function photographs the tree it
 *  is run in and a scratch copy of it (tests/helpers/scratch-tree.mjs).
 * ==========================================================================*/

/** the readers' view of a manifest module `M` (an `import * as M from '…/js/layer-manifest.js'`) */
export function layerDerived(M) {
  const text = (k) => 'T:' + k;   /* a stand-in English for rowHTML — the i18n pass replaces it in the app */
  return {
    SHELVES: M.SHELVES,
    LAYERS: M.LAYERS,
    BETA: M.BETA, BASE: M.BASE, HIDDEN: M.HIDDEN,
    layerGroups: M.layerGroups(),
    betaKeys: M.betaKeys(),
    basicRows: M.basicRows(),
    basicLayers: M.basicLayers(),
    hiddenRows: M.hiddenRows(),
    defaultLayers: M.defaultLayers(),
    defaultOn: M.defaultOn(),
    sharedIds: M.sharedIds(),
    htmlRows: M.htmlRows(),
    rows: M.htmlRows().map((l) => M.rowHTML(l, text)),
    catalog: M.catalog(),
    /* the two lookups, asked of every id and every short name the list holds */
    layerFor: M.LAYERS.flatMap((l) => [l.id, l.key].filter(Boolean)).map((k) => [k, (M.layerFor(k) || {}).id || null]),
    isLayer: M.LAYERS.map((l) => [l.id, M.isLayer(l.id)]).concat([['no-such-layer', M.isLayer('no-such-layer')]]),
  };
}

/** the value as the fixture stores it — one stable text */
export const layerDerivedText = (M) => JSON.stringify(layerDerived(M), null, 1) + '\n';
