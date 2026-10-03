/* ============================================================================
 *  IntMap · THE EVENT BUS — IntMap's own window events, declared in one table  (event-bus)
 * ----------------------------------------------------------------------------
 *  MEASURED before this file (2026-10-03): fifteen event names raised with `new Event` /
 *  `new CustomEvent` from sixteen files and heard by `addEventListener` in sixty-five, spelled
 *  two ways (`intmap-lang`, `intmap:shakemap`), with nowhere that said what any of them meant, what
 *  it carried or who raised it — and one (`intmap-theme`) heard by a listener that nothing raised
 *  (js/theme-sky.js, which writes the theme, now raises it).
 *
 *  WHAT THIS IS. `EVENTS` below is that list, written once: the name, what it means, the payload
 *  and the files that raise it. `emit` / `on` / `once` are the calls a module uses instead of the bare
 *  DOM ones. tests/event-bus-checks.test.mjs DISCOVERS every site from the source and holds the
 *  table to it both ways (an undeclared name fails; a declaration nothing uses fails; `from` and
 *  `pending` must be exactly what the source does).
 *
 *  ⚠ DELIVERY IS STILL `window.dispatchEvent`. The bus adds a declaration, not a second channel: a
 *  listener written as `window.addEventListener('intmap-lang', …)` — in a file not yet moved, in a
 *  browser spec, in Atlas's page-side observers — hears exactly what it heard before, and an event
 *  raised by hand reaches a bus listener. Moving a file is therefore a pure change of spelling.
 *  An event raised without a payload is a plain `Event`, as the bare calls raised it; with one, a
 *  `CustomEvent` whose `detail` is the payload.
 *
 *  TWO SPELLINGS, ONE EVENT. The canonical form is `intmap-…` (thirteen of the fifteen used it). A
 *  name spelled `intmap:…` is kept as an ALIAS: `emit` raises the canonical name and then every alias
 *  (so a listener on either spelling hears it once), and `on` listens to every spelling but ignores
 *  the alias copies its own `emit` made (so a bus listener hears it once). An alias raised BY HAND is
 *  not a copy, and a bus listener hears it.
 *
 *  AN UNDECLARED NAME is a programming error: under node and the development server it throws; the
 *  production build (`import.meta.env.PROD`, replaced by Vite) warns once per name and delivers, so a
 *  slip never takes a feature down for a reader.
 *
 *  `pending` lists, per event, the files that still call the DOM by hand, and `WHY` says why each has
 *  not moved. It is not a promise; the check fails the moment a file moves and the list does not.
 * ==========================================================================*/
import { MAP_ANSWER_EVENT } from './mobile-sheet.js';

/* why a file still raises or hears an event with the bare DOM calls */
export const WHY = Object.freeze({
  parallel: 'left for a concurrent change to the same file (event-bus round): moved when that lands',
  pinned: 'a node check reads this call\'s spelling in the source; it moves with that check',
  cycle: 'js/bus.js imports this file (it owns a declared name), so it cannot import the bus back',
  scope: 'registered through a runtime scope (js/runtime.js A.on), which owns its removal',
  injected: 'listens on a window handed in by its caller, not on the page\'s',
  script: 'a node check evaluates this file\'s text as a classic script, where an import cannot stand',
});

/**
 * @typedef {object} EventDecl
 * @property {string} means        what has happened when it is raised
 * @property {string|null} detail  the payload (`{ a, b }` = an object with exactly those keys) or null
 * @property {string[]} from       the files that raise it
 * @property {string[]} [aliases]  older spellings, still raised and heard
 * @property {Record<string,keyof typeof WHY>} [pending]  files still using the bare DOM calls
 * @property {string} [orphan]     present when it is heard and nothing raises it
 */
/** @type {Readonly<Record<string, EventDecl>>} */
export const EVENTS = Object.freeze({
  'intmap-lang': {
    means: 'the reader changed the interface language; whatever printed words re-labels',
    detail: null,
    from: ['js/app-body.js'],
    pending: {
      'js/ai-core.js': 'pinned', 'js/app-body.js': 'pinned', 'js/atlas-controls.js': 'pinned', 'js/compare.js': 'pinned',
      'js/dash-extended.js': 'pinned', 'js/i18n-late.js': 'pinned', 'js/keyboard-shortcuts.js': 'pinned',
      'js/layer-favs.js': 'pinned', 'js/layer-time-kernel.js': 'injected', 'js/map-ui.js': 'parallel',
      'js/news-events.js': 'pinned', 'js/news-sources.js': 'pinned', 'js/radiation-layer.js': 'scope', 'js/routing-ui.js': 'pinned',
      'js/satellite.js': 'pinned', 'js/seismic.js': 'pinned', 'js/sims.js': 'pinned', 'js/time-admin1.js': 'script', 'js/workspace.js': 'pinned',
      'js/world-packs.js': 'pinned',
    },
  },
  'intmap-units': {
    means: 'the reader changed a unit setting (temperature); every legend that prints one redraws',
    detail: null,
    from: ['js/app-body.js', 'js/weather.js'],
  },
  'intmap-sidebar-resize': {
    means: 'the sidebar opened, closed or changed width; layout that sits beside it re-measures',
    detail: null,
    from: ['js/app-body.js', 'js/article-reader.js', 'js/map-ui.js', 'js/playground.js'],
    pending: { 'js/app-body.js': 'pinned', 'js/map-ui.js': 'parallel', 'js/mobile-ui.js': 'pinned' },
  },
  'intmap-mem-pressure': {
    means: 'the page is short of memory; caches that can be rebuilt drop what is not on screen',
    detail: null,
    from: ['js/label-occlusion.js'],
  },
  'intmap-basemode': {
    means: 'the base-display mode (default · clean · custom) was applied or changed',
    detail: '{ mode }',
    from: ['js/data-layers.js'],
    pending: { 'js/map-ui.js': 'parallel' },
  },
  'intmap-layerfavs': {
    means: 'the reader starred or unstarred a layer (window.imLayerFavs changed); the shelf rebuilds',
    detail: null,
    from: ['js/layer-favs.js', 'js/map-ui.js'],
    pending: { 'js/layer-favs.js': 'pinned', 'js/map-ui.js': 'parallel' },
  },
  'intmap-gazetteer-world': {
    means: 'the world gazetteer finished loading; indexes built from the partial one are rebuilt',
    detail: null,
    from: ['js/gazetteer.js'],
    pending: { 'js/gazetteer.js': 'script' },
  },
  'intmap-newsgeo-world-ready': {
    means: 'the last slice of the world place table was registered with the news geocoder',
    detail: '{ rows }',
    from: ['js/news-context.js'],
  },
  'intmap-m-xhair': {
    means: 'the phone\'s crosshair switch changed (the reader\'s choice, kept across reloads)',
    detail: '{ on }',
    from: ['js/mobile-sheet.js'],
    pending: { 'js/mobile-sheet.js': 'cycle' },
  },
  [MAP_ANSWER_EVENT]: {
    means: 'a module put an answer on the map (kind card), or a card in the sheet that must be read through (kind read); on a phone the sheet settles to show it',
    detail: '{ kind }',
    from: ['js/atlas-examples.js', 'js/here-now.js', 'js/map-corrections.js', 'js/on-this-day.js', 'js/place-dossier.js', 'js/search-geocode.js', 'js/showcase-gallery.js'],
  },
  'intmap-hist-identity': {
    means: 'the historical-country identity table arrived for the shown year; borders drawn before it re-label',
    detail: '{ year }',
    from: ['js/time-countries.js'],
    pending: { 'js/time-borders.js': 'pinned' },
  },
  'intmap-ecmwf': {
    means: 'the ECMWF layer changed state (metadata, step, play); the same notice its own listeners get',
    detail: 'the object js/wx-ecmwf.js hands its own listeners: { type, ...extra }',
    from: ['js/wx-ecmwf.js'],
  },
  'intmap-shakemap': {
    means: 'the ShakeMap overlay opened, closed, painted or changed metric',
    detail: 'state() of js/shakemap.js: { open, painted, eventId, metric, metrics, ... }',
    from: ['js/shakemap.js'],
    aliases: ['intmap:shakemap'],
  },
  'intmap-ai-limit': {
    means: 'an AI request was refused for the reader\'s usage limit, at the point the reader is told',
    detail: null,
    from: ['js/ai-core.js'],
    aliases: ['intmap:ai-limit'],
    pending: { 'js/ai-core.js': 'pinned', 'js/supporter.js': 'pinned' },
  },
  'intmap-theme': {
    means: 'the colour theme (data-theme on <html>) changed between light and dark; the sky re-renders',
    detail: null,
    from: ['js/theme-sky.js'],
  },
});

const ALIAS = new Map();
for (const [name, d] of Object.entries(EVENTS)) for (const a of d.aliases || []) ALIAS.set(a, name);

const PROD = !!(import.meta.env && import.meta.env.PROD);
const warned = new Set();
const win = () => (typeof window !== 'undefined' ? window : globalThis);
/* the events `emit` raised under an alias — `on` skips them, it already heard the canonical one */
const COPIES = new WeakSet();

/** Every spelling of a name, canonical first; refuses (dev) or warns (prod) on an undeclared name. */
function spellings(name) {
  const canon = ALIAS.get(name) || name;
  const d = EVENTS[canon];
  if (d) return [canon, ...(d.aliases || [])];
  const msg = `IntMap bus: «${name}» is not declared in js/bus.js EVENTS`;
  if (!PROD) throw new Error(msg);
  if (!warned.has(name)) { warned.add(name); try { console.warn(msg); } catch (_) { } }
  return [name];
}

/** Raise an event. `detail` undefined → a plain Event; otherwise a CustomEvent carrying it. */
export function emit(name, detail) {
  const w = win();
  spellings(name).forEach((n, i) => {
    const ev = detail === undefined ? new Event(n) : new CustomEvent(n, { detail });
    if (i > 0) COPIES.add(ev);
    try { w.dispatchEvent(ev); } catch (_) { }
  });
}

/** Listen. Returns the function that stops listening. `opts` are addEventListener's. */
export function on(name, fn, opts) {
  const w = win(), names = spellings(name);
  /* one spelling: the listener is handed to the DOM as it is, so the DOM's own de-duplication and
     `{ once }` behave exactly as the bare call did */
  const h = names.length === 1 ? fn : (ev) => { if (!(ev && COPIES.has(ev))) fn(ev); };
  for (const n of names) w.addEventListener(n, h, opts);
  return () => { for (const n of names) w.removeEventListener(n, h, opts); };
}

/** Listen for the next one only. */
export function once(name, fn) {
  if (spellings(name).length === 1) return on(name, fn, { once: true });
  const off = on(name, (ev) => { off(); fn(ev); });
  return off;
}
