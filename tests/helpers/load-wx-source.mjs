/* The shipped fetch clock and the shipped weather client, evaluated against a STUB `fetch`.
 *
 * (fetch-deadline-layer) js/fetch-deadline.js's readers call the global `fetch`, so a harness that
 * hands a module its own `fetch` (the `new Function('…','fetch', src)` pattern several tests use)
 * would otherwise be bypassed by them. `fetchWithinFor(fetch)` evaluates the REAL js/fetch-deadline.js
 * source in a scope where `fetch` is the stub, and returns what that file publishes as
 * `window.IntMapFetchWithin` — { jsonWithin, readWithin, clockFor }, with the real clockFor.
 * `loadWxSource(fetch)` does the same for js/wx-source.js, whose two import lines are removed and
 * their bindings supplied from that evaluation. Nothing in either file is copied here; both are read
 * from the tree on every call. */
import { readFileSync } from 'node:fs';
import { clockFor } from '../../js/proxy-fetch.js';

const ROOT = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const IMPORTS = /^import [^\n]*\n/gm;

export function fetchWithinFor(fetchImpl) {
  const raw = read('js/fetch-deadline.js');
  const src = raw.replace(IMPORTS, '').replace(/^export const \{ jsonWithin, readWithin \} =/m, 'const { jsonWithin, readWithin } =');
  if (!/^const \{ jsonWithin, readWithin \} =/m.test(src)) throw new Error('js/fetch-deadline.js no longer exports { jsonWithin, readWithin } in one statement — update this helper');
  const win = {};
  // eslint-disable-next-line no-new-func
  new Function('fetch', 'clockFor', 'window', src)(fetchImpl, clockFor, win);
  if (!win.IntMapFetchWithin) throw new Error('js/fetch-deadline.js no longer publishes window.IntMapFetchWithin — update this helper');
  return win.IntMapFetchWithin;
}

export function loadWxSource(fetchImpl, win) {
  const store = {};
  const w = win || {};
  if (!w.localStorage) {
    w.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };
  }
  const F = fetchWithinFor(fetchImpl);
  const wx = read('js/wx-source.js').replace(IMPORTS, '');
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'localStorage', 'fetch', 'readWithin', 'clockFor', wx + '\nreturn window.IntMapWx;');
  return fn(w, w.localStorage, fetchImpl, F.readWithin, F.clockFor);
}
