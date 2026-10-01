/* ============================================================================
 *  IntMap · EVALUATE A js/ FILE AS THE MODULE IT IS  (module-graph)
 * ----------------------------------------------------------------------------
 *  Measured 2026-10-01: 216 of the 421 node check files evaluated shipped code by reading its TEXT —
 *  `new Function('window', read('js/x.js'))(fakeWindow)` or `vm.runInContext` — and 227 stripped the
 *  comments to match spellings in it. They had to: a file that publishes itself on `window` and reads
 *  its collaborators back off `window` can only be run by faking `window`, and the fake IS the
 *  dependency list, written by hand in the test and nowhere else.
 *
 *  Once a file says what it needs with `import`, the test can ask the module system for it instead:
 *
 *      import { importModule } from './helpers/import-module.mjs';
 *      const { IntMapTime } = await importModule('js/chronos.js');
 *      const M = await importModule('js/foo.js', {
 *        globals: { window: fakeWindow, document: fakeDocument },    // the BROWSER, not the app
 *        mocks:   { 'js/geo-engine.js': { IntMapGeoEngine: stub } }, // an import edge, replaced
 *      });
 *
 *  ── WHAT IT GUARANTEES ─────────────────────────────────────────────────────────────────────────
 *  · THE FILE UNDER TEST IS EVALUATED FRESH on every call (its URL carries `?im=<n>`), so two cases
 *    with two fake windows get two instances. Its OWN imports resolve to the ordinary URLs and are
 *    therefore shared singletons, exactly as in the browser — a real dependency is the real module.
 *  · `mocks` replace an import EDGE, not a global: only the module under test, importing that path
 *    directly, receives the stub; everything else in the graph still gets the real file. Keys are
 *    repository-relative paths; each value is the module's exports by name (`default` for a default
 *    export). This is dependency injection at the boundary the file itself declared.
 *  · `globals` are the BROWSER the file runs in (window, document, location, navigator, …). They are
 *    installed on globalThis with defineProperty — Node 24 defines `navigator` and `localStorage` as
 *    accessors, which a plain assignment would throw on in a module — and they STAY installed: a
 *    module's functions read `window` when they are CALLED, which is after this returns. node --test
 *    runs every file in its own process, so the scope of «stays» is the one check file.
 *    `window` defaults to globalThis itself, which is what it is in a browser.
 * ==========================================================================*/
import { registerHooks, createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url);   /* scripts/lib/ → the repository */
const MOCK = 'intmap-mock:';
let seq = 0;
const scopes = new Map();   /* evaluation id → Map(absolute file URL → stub id) */
const stubs = new Map();    /* stub id → exports object */
let hooked = false;

function hook() {
  if (hooked) return;
  hooked = true;
  registerHooks({
    resolve(specifier, context, next) {
      const parent = context.parentURL || '';
      const m = /[?&]im=(\d+)(?:&|$)/.exec(parent);
      const scope = m ? scopes.get(Number(m[1])) : null;
      if (scope && scope.size) {
        const r = next(specifier, context);
        const sid = scope.get(r.url.split('?')[0]);
        return sid ? { url: MOCK + sid, shortCircuit: true } : r;
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      if (!url.startsWith(MOCK)) return next(url, context);
      const sid = url.slice(MOCK.length);
      const value = stubs.get(sid) || {};
      const ref = `globalThis.__imModuleStubs[${JSON.stringify(sid)}]`;
      const lines = Object.keys(value).map((k) => (k === 'default'
        ? `export default ${ref}.default;`
        : (/^[A-Za-z_$][\w$]*$/.test(k) ? `export const ${k} = ${ref}[${JSON.stringify(k)}];` : '')));
      return { format: 'module', source: lines.join('\n'), shortCircuit: true };
    },
  });
}

/** Install browser globals on globalThis (they stay for the rest of the check file). */
export function installGlobals(globals) {
  const g = globals || {};
  if (!('window' in g) && typeof globalThis.window === 'undefined') g.window = globalThis;
  for (const [k, v] of Object.entries(g)) {
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true, enumerable: true });
  }
  return globalThis;
}

/**
 * Import a repository file as an ES module, evaluated fresh.
 * @param {string} rel  repository-relative path, e.g. 'js/chronos.js'
 * @param {{globals?: object, mocks?: Record<string, object>}} [opts]
 * @returns {Promise<any>} the module namespace
 */
export async function importModule(rel, opts = {}) {
  hook();
  installGlobals(opts.globals);
  const id = ++seq;
  const scope = new Map();
  for (const [dep, value] of Object.entries(opts.mocks || {})) {
    const sid = id + '_' + scope.size;
    stubs.set(sid, value);
    (globalThis.__imModuleStubs || (globalThis.__imModuleStubs = {}))[sid] = value;
    scope.set(new URL(dep, ROOT).href, sid);
  }
  scopes.set(id, scope);
  return import(new URL(rel, ROOT).href + '?im=' + id);
}

/** The absolute file URL of a repository path — for tests that import a shared singleton directly. */
export const fileUrl = (rel) => new URL(rel, ROOT).href;

/**
 * A stub whose behaviour a check can change between cases while the module under test keeps the one
 * binding it imported (an import binding cannot be reassigned from outside, which is the point of it):
 *
 *     const ge = swappable();
 *     const M = await importModule('js/x.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine: ge.value } } });
 *     ge.set(asleepEngine); …   ge.set(liveEngine); …
 */
export function swappable(initial) {
  let cur = initial || {};
  const value = new Proxy({}, {
    get: (_t, k) => { const v = cur[k]; return typeof v === 'function' ? v.bind(cur) : v; },
    has: (_t, k) => k in cur,
    set: (_t, k, v) => { cur[k] = v; return true; },
    ownKeys: () => Reflect.ownKeys(cur),
    getOwnPropertyDescriptor: (_t, k) => { const d = Object.getOwnPropertyDescriptor(cur, k); if (d) d.configurable = true; return d; },
  });
  return { value, set: (next) => { cur = next || {}; }, get: () => cur };
}

/**
 * The app's language registry — js/lang-registry.js itself, loaded once per process, with the language
 * list js/locales/_langs.js declares (the static pages' list; in the app src/locale-boot.js declares the
 * same set from the bundler's glob). SYNCHRONOUS on purpose: Node 24 `require`s an ES module without top-
 * level await, so the build scripts whose callers are synchronous keep their shape, and they share the
 * module instance an `import` of the same file gets.
 */
export function langRegistry() {
  const sb = { window: {} };
  sb.window.window = sb.window;
  vm.runInContext(readFileSync(new URL('js/locales/_langs.js', ROOT), 'utf8'), vm.createContext(sb), { filename: '_langs.js' });
  const { IntMapLang } = createRequire(import.meta.url)(fileURLToPath(new URL('js/lang-registry.js', ROOT)));
  IntMapLang.declare(sb.window.IntMapLangCodes || []);
  return IntMapLang;
}

/**
 * A repository module, synchronously (Node 24 `require`s an ES module without top-level await) — for
 * build scripts whose callers are synchronous. The SAME instance an `import` of the file gets; `globals`
 * are installed first, as for importModule.
 * @param {string} rel  e.g. 'js/border-coast.js'
 */
export function requireModule(rel, globals) {
  if (globals) installGlobals(globals);
  return createRequire(import.meta.url)(fileURLToPath(new URL(rel, ROOT)));
}
