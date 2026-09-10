/* ============================================================================
 *  IntMap · js/time-borders.js, INSTANTIATED — the era-name resolver, evaluated  (#R686)
 * ----------------------------------------------------------------------------
 *  ⚠ THE HAND-WRITTEN NAME TABLES LIVE INSIDE A MODULE CLOSURE, so for eight rounds nothing could
 *  measure what they answer — the same shape as #R575 (the epidemic arithmetic inside a DOM
 *  closure) and #R673 (a rule whose only caller passed a constant). #R686 needs the answer to
 *  «which of the 3,028 era names does the existing table already localize?», and a gate that
 *  reads the source cannot tell: `_ERA_LOC` is 242 regexes, `_VANISHED` 8, `_COLONIZER` 26, and
 *  `IntMapHistStates.STATES` 19 more, all consulted in one order by `_eraLocName`.
 *  So the module is RUN. `window.IntMapModules.timeBorders(HOST)` needs a renderer and a clock;
 *  both are stubs here, and the stub for the renderer answers every unknown member with another
 *  callable stub so that adding a renderer call to the module does not silently disable this
 *  harness (a stub that is less capable than the real thing fails loudly — #R585's lesson is the
 *  other direction, a stub MORE capable than the real thing, and neither is wanted).
 * ==========================================================================*/
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
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
 * @param {{lang?:string, year?:number}} opts
 * @returns {{api:object, window:object, host:object}}
 */
export function timeBorders(opts = {}) {
  const sandbox = {
    window: {}, navigator: { language: 'en' }, Intl, console,
    document: {
      addEventListener: noop, removeEventListener: noop, createElement: el,
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      body: el(), documentElement: el(), head: el(),
    },
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    fetch: async () => { throw new Error('tests/helpers/time-borders.mjs makes no network calls'); },
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
  };
  const w = sandbox.window;
  w.window = w; w.document = sandbox.document;
  w.addEventListener = noop; w.removeEventListener = noop; w.dispatchEvent = noop;
  w.setTimeout = () => 0; w.location = { href: 'http://localhost/', search: '' };
  w.IntMapGeoEngine = new Proxy({ hasRenderer: () => true, ready: () => true }, {
    get: (t, k) => ((k in t) ? t[k] : deep()),
  });
  w.IntMapTime = { year: () => (opts.year != null ? opts.year : 1500), isLive: () => false, on: noop, when: () => null };
  const ctx = vm.createContext(sandbox);
  const run = (f) => vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });
  run('js/locales/_langs.js');
  run('js/lang-registry.js');
  run('js/history.js');
  /* ⚠ (#R695) THE REAL FILE, NOT A STUB. js/time-borders.js reads two things from
     js/hist-scale.js — the clock's floor and the year-zero-safe date arithmetic — and both of
     them only matter below year 1, which is precisely where a stub would have quietly stood in
     for them. Running the owner is cheap (it has no DOM, no map, no clock, no language, by its
     own stated invariant) and it is what the page does. */
  run('js/hist-scale.js');
  run('js/time-borders.js');
  w.IntMapHistStates = w.IntMapModules.histStates({});
  const host = { lang: opts.lang || 'jp', canDraw: () => false };
  const api = w.IntMapModules.timeBorders(host);
  if (!api || typeof api.eraLocName !== 'function') {
    throw new Error('js/time-borders.js published no eraLocName — the era-name tables are unmeasurable again');
  }
  return { api, window: w, host };
}
