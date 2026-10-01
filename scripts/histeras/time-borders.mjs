/* ============================================================================
 *  IntMap · js/time-borders.js, INSTANTIATED — the era-name resolver, evaluated  (#R686)
 * ----------------------------------------------------------------------------
 *  ⚠ THE HAND-WRITTEN NAME TABLES LIVE INSIDE A MODULE CLOSURE, so for eight rounds nothing could
 *  measure what they answer — the same shape as #R575 (the epidemic arithmetic inside a DOM
 *  closure) and #R673 (a rule whose only caller passed a constant). #R686 needs the answer to
 *  «which of the 3,028 era names does the existing table already localize?», and a gate that
 *  reads the source cannot tell: `_ERA_LOC` is 242 regexes, `_VANISHED` 8, `_COLONIZER` 26, and
 *  `IntMapHistStates.STATES` 19 more, all consulted in one order by `_eraLocName`.
 *  So the module is RUN. `timeBorders(HOST)` (js/time-borders.js's export) needs a renderer and a
 *  clock; both are stubs here, handed to the module at its own import edges (module-graph) — and the stub for the renderer answers every unknown member with another
 *  callable stub so that adding a renderer call to the module does not silently disable this
 *  harness (a stub that is less capable than the real thing fails loudly — #R585's lesson is the
 *  other direction, a stub MORE capable than the real thing, and neither is wanted).
 * ==========================================================================*/
import { importModule, langRegistry } from '../lib/import-module.mjs';

const noop = () => {};
const deep = () => new Proxy(function () {}, {
  get(_, k) { return (k === 'then' || k === 'toJSON' || typeof k === 'symbol') ? undefined : deep(); },
  apply: () => deep(),
});
const el = () => ({
  addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
  style: {}, dataset: {}, children: [],
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  setAttribute: noop, getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [],
});

/**
 * Instantiate js/time-borders.js outside a browser.
 * (module-graph) ASYNCHRONOUS since the module is IMPORTED: js/time-borders.js says what it needs with
 * `import`, so the renderer and the clock are supplied as those imports (mocks) and the browser as the
 * globals — instead of a vm context the harness had to fill with the module's dependency list by hand.
 * @param {{lang?:string, year?:number, fetch?:Function}} opts
 * @returns {Promise<{api:object, window:object, host:object}>}
 */
export async function timeBorders(opts = {}) {
  const sandbox = {
    window: {}, navigator: { language: 'en' }, Intl, console,
    document: {
      addEventListener: noop, removeEventListener: noop, createElement: el,
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      body: el(), documentElement: el(),
      /* (module-graph) a <script> appended here (js/border-coast.js loads data/border-coast.js that way)
         FAILS, as it would with no network, instead of never answering: the module is the real shared one
         now, and a load that neither arrives nor errors leaves its caller waiting for ever */
      head: Object.assign(el(), { appendChild(n) { if (n && typeof n.onerror === 'function') queueMicrotask(() => n.onerror(new Error('no network in this harness'))); return n; } }),
    },
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    /* (hist-bundles-off-main) a caller may hand a fetch that serves the repository's own files, so the
       records are opened the way the page opens them (through js/hist-bundles.js) instead of published */
    fetch: opts.fetch || (async () => { throw new Error('tests/helpers/time-borders.mjs makes no network calls'); }),
    TextDecoder,
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
  };
  const w = sandbox.window;
  w.window = w; w.document = sandbox.document;
  w.addEventListener = noop; w.removeEventListener = noop; w.dispatchEvent = noop;
  w.setTimeout = () => 0; w.location = { href: 'http://localhost/', search: '' };
  /* `whenCanDraw` is the engine's wait for a style that can take layers (js/geo-engine.js). This
     harness has no style — the host below answers canDraw() false — so the wait is the one that
     never answers, which is what the real one does for a style that is not there. */
  const IntMapGeoEngine = new Proxy({ hasRenderer: () => true, ready: () => true, whenCanDraw: () => new Promise(() => {}) }, {
    get: (t, k) => ((k in t) ? t[k] : deep()),
  });
  /* (hist-bundles-off-main) the door reads a record's bytes through the app's clocked reader
     (window.IntMapFetchWithin); a caller that serves files hands the same reader over the same fetch */
  if (opts.fetch) w.IntMapFetchWithin = { clockFor: () => 60000, readWithin: async (u) => { const r = await opts.fetch(u); return { ok: r.ok, status: r.status, bytes: await r.arrayBuffer() }; } };
  const IntMapTime = { year: () => (opts.year != null ? opts.year : 1500), isLive: () => false, on: noop, when: () => null };
  const globals = { ...sandbox, window: w };
  langRegistry();   /* the real registry, with the shipped language list declared */
  const history = await importModule('js/history.js', { globals });
  /* ⚠ (#R695) THE REAL FILE, NOT A STUB. js/time-borders.js reads two things from
     js/hist-scale.js — the clock's floor and the year-zero-safe date arithmetic — and both of
     them only matter below year 1, which is precisely where a stub would have quietly stood in
     for them. Running the owner is cheap (it has no DOM, no map, no clock, no language, by its
     own stated invariant) and it is what the page does. */
  await importModule('js/hist-scale.js', { globals });
  /* (hist-bundles-off-main) the one door js/time-borders.js opens its records through. With no Worker
     in this context it answers on this thread, from a bundle a caller published on `window`. */
  await importModule('js/hist-bundles.js', { globals });
  const TB = await importModule('js/time-borders.js', { globals, mocks: {
    'js/geo-engine.js': { IntMapGeoEngine },
    'js/chronos.js': { IntMapTime },
  } });
  w.IntMapHistStates = history.histStates({});
  const host = { lang: opts.lang || 'jp', canDraw: () => false };
  const api = TB.timeBorders(host);
  if (!api || typeof api.eraLocName !== 'function') {
    throw new Error('js/time-borders.js published no eraLocName — the era-name tables are unmeasurable again');
  }
  return { api, window: w, host };
}
