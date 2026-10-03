/* ============================================================================
 *  IntMap · scripts/lib/layer-descriptor.mjs — WHAT A LAYER IS: one declaration, and everything derived from it
 * ----------------------------------------------------------------------------
 *  (layer-descriptor) Measured 2026-09-30 on the WHO outbreaks layer: one layer was written into
 *  seven registries under three spellings — `wp-dl-outbreaks` in the Layers list, `outbreaks` in
 *  IntMapLayers and in the share state, `outbreaks.open/close` in the kernel, `map.outbreaks` in
 *  Atlas's capability table — and NOTHING said these were one layer. Of the 174 rows only 9 had an
 *  IntMapLayers id that a reader could guess from the row id; the rest were joined by nobody. The
 *  agreement between the registries was held by tests comparing them, not by any statement of what
 *  a layer is.
 *
 *  A LAYER IS ONE FILE: js/layers/<id>.js, `export default { … }`. This module is what such a file may
 *  say, how it is checked, and how the Layers list every reader already asks (js/layer-manifest.js) is
 *  derived from the set of them. The set is discovered from the directory by scripts/layer-descriptors.mjs
 *  (it writes the GENERATED LAYERS region of js/layer-manifest.js; `npm run build` runs it first) — there is
 *  no list to add a layer to.
 *
 *  ── THE FIELDS ─────────────────────────────────────────────────────────────────────────────
 *  WHERE IT STANDS
 *    id        the checkbox id — the key the session, the share link, the favourites and Atlas hold;
 *              the file is named after it
 *    shelf     the shelf it is filed on (a key of js/layers/_shelves.js)
 *    order     its position on that shelf — rows are shown in ascending order; numbers, not a list,
 *              so a new layer stands between two without moving either
 *  WHAT IT IS
 *    kind      (basic-display-not-layers) `'display'` for an item of the MAP DISPLAY (基本表示) — place names,
 *              water & terrain labels, places & facilities, borders, coastlines, state borders, roads, railways,
 *              the grid, day & night, 3-D buildings: how the base map itself is drawn. Absent for a LAYER (data
 *              laid over the map). The reader's decision (2026-10-02):「基本表示をレイヤーって言うな」— a display
 *              item is not called a layer and is not counted as one, anywhere: the panel's 「表示中のレイヤー」,
 *              the share link's `l=` (display items travel in `d=`, js/map-state.js), the usage count, Atlas,
 *              the landing page's number of layers. Every one of those reads THIS field, through
 *              js/layer-manifest.js (`isDisplay` / `dataLayers` / `displayItems`). A shelf holds one kind only
 *              (setProblems), and the panel's top shelf `base` holds exactly the display items.
 *  THE ROW (exactly the facts js/layer-manifest.js has always carried — derived from here unchanged)
 *    key       the short name reorganizeLayerPanel files it by (`climate`); absent when nothing names it so
 *    label     the i18n key of its name, when the row names itself through one (`data-i18n`)
 *    rest      folded behind 「その他N件」 inside its shelf
 *    on        ticked for a first-time reader
 *    share     carried by the share link's `&l=`
 *    html      the row is generated from this declaration (js/layer-rows.js) rather than by a module
 *    lazy      the on-demand module(s) its toggle loads (names in js/lazy-modules.js LAZY_REGISTRY)
 *    ⚠ A ROW WITHOUT `label` IS NAMED BY THE MODULE THAT BUILDS IT (136 of 174 on 2026-10-01), as an
 *      `L.arr(LA(…))` tuple at the call site. Not an oversight: scripts/i18n-audit.mjs finds a translation
 *      BY that call, so a name moved into data here would leave the translation gate's universe — it would
 *      stop being counted, not merely stop being translated (#R548). Moving the names is a change to the
 *      audit first (a surface that reads the declarations), then to the rows.
 *  THE LINKS — the same layer in the other registries, under the spelling each of them uses
 *    registry  the id(s) it registers with window.IntMapLayers (how Atlas reads what is drawn)
 *    state     the key of the module state it carries through the share link (window.IntMapShareState)
 *    commands  the kernel commands that operate it (window.IntMapOS)
 *    atlas     the Atlas capabilities that operate it specifically (js/atlas-cap-<namespace>.js)
 *    sources   the rows of the data-sources registry it draws from (js/reference-data.js DATA_SOURCES `n`)
 *    time      when its data can answer for (Chronos): { kind: 'elements', bands } — each feature carries
 *              its own validity, widest around its epoch by orbit class (js/satellites-live.js reads the
 *              bands from here); a declaration with no `time` makes no claim
 *    pkg       (layer-packages) the LAYER PACKAGE that implements the row's switch: js/layer-pkg-<pkg>.js,
 *              whose factory `<camel(pkg)>Package(kit)` returns, for every row naming it, what switching the
 *              row on and off and moving its opacity does. js/data-layers.js loads it the first time one of
 *              those rows is switched (packageFile / packageExport below are the names, written once); a row
 *              without `pkg` is still implemented inside js/data-layers.js. Several rows may name one package
 *              (a family that shares its implementation). scripts/layer-packages.mjs holds the rest of the rule.
 *    measures  (map-layer-system) the upstream SERIES the row paints, as `<publisher>:<series>` — `worldbank:SP.DYN.LE00.IN`,
 *              `countrystats:gdppc`. Two rows measuring one series are ONE indicator to the reader (js/indicator-browser.js
 *              offers it once and names both rows); the claim is held against the code that paints the row
 *              (scripts/lib/indicator-series.mjs), and a series the code paints that no declaration claims is a problem too
 *
 *  ⚠ A LINK IS A CLAIM, AND EVERY CLAIM HAS A READER THAT CAN REFUSE IT. scripts/layer-descriptors.mjs
 *  checks each link against the registry that holds it (the literal registration in js/, the capability
 *  table, the sources registry, the lazy registry, the locale tables); a link nothing can check is not
 *  written (see scripts/layer-descriptor-migrate.mjs on composed registrations).
 *  ⚠ PURE DATA + PURE FUNCTIONS: no DOM, no `window`. Node imports it as it is.
 * ==========================================================================*/

/** the row facts js/layer-manifest.js has always carried, in the order it carried them */
const ROW_FIELDS = Object.freeze(['id', 'kind', 'key', 'label', 'rest', 'on', 'share', 'html', 'lazy']);
/** (basic-display-not-layers) the kinds a declaration may state — absent is a layer */
export const KINDS = Object.freeze(['display']);
/** the shelf whose rows are the map display, and nothing else (js/layers/_shelves.js) */
const DISPLAY_SHELF = 'base';
/** the facts that join the layer to the other registries */
const LINK_FIELDS = Object.freeze(['registry', 'state', 'commands', 'atlas', 'sources', 'time', 'pkg', 'measures']);
const FIELDS = Object.freeze(['id', 'shelf', 'order'].concat(ROW_FIELDS.slice(1), LINK_FIELDS));

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isStrList = (v) => Array.isArray(v) && v.length > 0 && v.every(isStr) && new Set(v).size === v.length;
/** the time contracts a declaration may state (each has a reader — see the header) */
const TIME_KINDS = Object.freeze({
  /* bands: [[mean motion (rev/day), half-width (days)], …] — the first band whose number the feature's
     mean motion EXCEEDS applies; the last band's number is -Infinity, so every feature has one */
  elements: (t) => Array.isArray(t.bands) && t.bands.length > 0
    && t.bands.every((b) => Array.isArray(b) && b.length === 2 && typeof b[0] === 'number' && typeof b[1] === 'number' && b[1] > 0)
    && t.bands[t.bands.length - 1][0] === -Infinity,
});

/**
 * Everything wrong with one declaration, as sentences. `file` is its file name (the id must match it);
 * `shelves` the shelf keys that exist.
 * @param {Record<string, any>} d @param {string} file @param {Set<string>} shelves
 */
export function descriptorProblems(d, file, shelves) {
  const out = [];
  const at = (m) => out.push(file + ': ' + m);
  if (!d || typeof d !== 'object') { at('does not export a declaration (`export default { … }`)'); return out; }
  for (const k of Object.keys(d)) if (!FIELDS.includes(k)) at('says `' + k + '`, which is not a field of a layer (scripts/lib/layer-descriptor.mjs FIELDS)');
  if (!isStr(d.id)) at('has no `id`');
  else if (file !== d.id + '.js') at('declares the id `' + d.id + '` — a layer\'s file is named after its id (' + d.id + '.js)');
  if (!shelves.has(d.shelf)) at('is on the shelf `' + d.shelf + '`, which js/layers/_shelves.js does not have');
  if (typeof d.order !== 'number' || !Number.isFinite(d.order)) at('has no numeric `order` on its shelf');
  for (const k of ['key', 'label', 'state']) if (k in d && !isStr(d[k])) at('`' + k + '` must be a non-empty string');
  if ('pkg' in d && !PKG_NAME.test(String(d.pkg))) at('`pkg` must be a lower-case kebab name (it names js/layer-pkg-<pkg>.js)');
  for (const k of ['rest', 'on', 'share', 'html']) if (k in d && d[k] !== true) at('`' + k + '` is written only when it is true (absent means false)');
  for (const k of ['lazy', 'registry', 'commands', 'atlas', 'sources', 'measures']) if (k in d && !isStrList(d[k])) at('`' + k + '` must be a list of distinct names');
  if ('kind' in d && !KINDS.includes(d.kind)) at('`kind` is one of ' + KINDS.join(', ') + ' (absent means a layer)');
  if ((d.kind === 'display') !== (d.shelf === DISPLAY_SHELF)) at(d.kind === 'display'
    ? "is a display item (`kind: 'display'`) on the shelf `" + d.shelf + '` — the map display is the shelf `' + DISPLAY_SHELF + '`'
    : 'is on the shelf `' + DISPLAY_SHELF + "`, which holds the map display only — a layer there would be counted as neither (state `kind: 'display'` or move it)");
  if (d.html && !isStr(d.label)) at('a generated row (`html`) names itself through an i18n `label`');
  if ('time' in d) {
    const t = d.time, ok = t && typeof t === 'object' && Object.prototype.hasOwnProperty.call(TIME_KINDS, t.kind) && TIME_KINDS[t.kind](t);
    if (!ok) at('`time` is not a contract scripts/lib/layer-descriptor.mjs TIME_KINDS knows (' + Object.keys(TIME_KINDS).join(', ') + ')');
  }
  return out;
}

/* (layer-packages) a package's name, and the two names derived from it — the file and its factory — written here once */
const PKG_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** the module of a layer package, relative to js/ */
export const packageFile = (pkg) => 'layer-pkg-' + pkg + '.js';
/** the factory a layer package exports: `subcables` → `subcablesPackage`, `sea-level` → `seaLevelPackage` */
export const packageExport = (pkg) => pkg.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()) + 'Package';

/** problems across the whole set: one id, one key, one place on a shelf, one owner of each link */
export function setProblems(list) {
  const out = [];
  const dup = (what, keyOf) => {
    const seen = new Map();
    for (const d of list) for (const k of [].concat(keyOf(d) || [])) {
      if (seen.has(k)) out.push(what + ' `' + k + '` is claimed by both ' + seen.get(k) + ' and ' + d.id);
      else seen.set(k, d.id);
    }
  };
  dup('the id', (d) => d.id);
  dup('the short name', (d) => d.key);
  dup('the position', (d) => d.shelf + ' #' + d.order);
  dup('the IntMapLayers id', (d) => d.registry);
  dup('the kernel command', (d) => d.commands);
  /* (basic-display-not-layers) a shelf is a shelf of layers or of display items, never both: the panel heads,
     counts and folds a shelf as one thing */
  const kindOf = new Map();
  for (const d of list) { const k = d.kind || 'layer', was = kindOf.get(d.shelf);
    if (!was) kindOf.set(d.shelf, { k, id: d.id });
    else if (was.k !== k) out.push('the shelf `' + d.shelf + '` mixes a ' + was.k + ' (' + was.id + ') and a ' + k + ' (' + d.id + ')'); }
  return out;
}

/** the row as js/layer-manifest.js has always carried it: the row fields, in the declaration's own order */
const rowOf = (d) => Object.fromEntries(Object.keys(d).filter((k) => ROW_FIELDS.includes(k)).map((k) => [k, Array.isArray(d[k]) ? d[k].slice() : d[k]]));

/** the Layers list's SHELVES, derived: every shelf in panel order, each with its rows in `order` */
export function deriveShelves(shelves, list) {
  return shelves.map((s) => ({
    key: s.key,
    layers: list.filter((d) => d.shelf === s.key).slice().sort((a, b) => a.order - b.order).map(rowOf),
  }));
}
