/* The pieces every tests/geo-*-checks.test.mjs file shares — written once, here.
 *
 * Those files are the per-ROUND checks of the GIS, routing, navigation and weather subjects
 * (tests/r729-…, r735-…, r783-…, r291, r298, r299, r347, r174, r801) regrouped by SUBJECT. Each round's
 * file used to run in a process of its own, so everything it put on `globalThis` (a `window`, a
 * `document`, an IndexedDB, a `Deno`) was private to it without anybody having to say so. Now several
 * rounds share one process, and that privacy has to be made rather than assumed: `isolate()` below is
 * how each round's block gets it back.
 *
 * ⚠ WHAT IT DOES, EXACTLY. The first call photographs `globalThis` (after every static import of the
 * file has been evaluated — that is the state a fresh process was in when a round's own top level ran).
 * Each block then
 *   · is BUILT against that photograph (its top level — `globalThis.window = …`, `const DATA = make…()` —
 *     sees what a fresh process saw, not what the previous block left);
 *   · records what its top level put on `globalThis`, and puts the photograph back (`built()`);
 *   · re-applies what it recorded when its tests start (`enter`), and puts the photograph back when they
 *     end (`leave`) — so what one block's tests did to `window` cannot be read by the next block.
 * ⚠ It cannot make a MODULE fresh: `import('../js/gis-ops.js')` is evaluated once per process. Every
 * js/gis-*.js module is a factory (`makeGis…()`), and the blocks build a new instance per boot, which is
 * why sharing a process is safe for them — but a block that needs a module evaluated against a global it
 * sets first (tests/geo-routing-relay-checks: `Deno` before the Edge Function is imported) keeps a file
 * of its own. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
/* ⚠ THE ONE OUTPUT ENCODER IS PART OF THE BASELINE, AND THIS IMPORT IS WHY. js/safe-html.js publishes
   `globalThis.IntMapSafe` when it is EVALUATED — once per process, like every module. The page loads it
   at boot, and js/gis-atlas.js / js/gis-panel.js read it at call time. Before this import, whichever
   block happened to import it first had it deleted by `leave()` (it was not in the photograph), and
   every later block that needed it found `undefined` — measured: #R763 ⑧ went red only when an earlier
   block of the same file had loaded the module. Evaluating it before the photograph is taken makes it
   what it is on a page: always there. */
import '../../js/safe-html.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* js/geodesy.js publishes onto `window` at top level and exports nothing, so it is evaluated the way
   a browser evaluates it rather than imported — the boot the GIS checks have used since #R729. */
export function installWindow() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  return w;
}

/* ── per-block isolation of globalThis ─────────────────────────────────────────────────────────── */

let BASE = null;
const snapshot = () => new Map(Reflect.ownKeys(globalThis).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const sameDescriptor = (a, b) => !!a && !!b && a.value === b.value && a.get === b.get && a.set === b.set;

function restore(to) {
  for (const k of Reflect.ownKeys(globalThis)) {
    if (!to.has(k)) { try { delete globalThis[k]; } catch { /* non-configurable: the runtime's own */ } }
  }
  for (const [k, d] of to) {
    if (!sameDescriptor(Object.getOwnPropertyDescriptor(globalThis, k), d)) {
      try { Object.defineProperty(globalThis, k, d); } catch { /* non-configurable */ }
    }
  }
}

export function isolate() {
  if (!BASE) BASE = snapshot();
  restore(BASE);
  let mine = new Map();
  return {
    /* called at the END of a block's top level: what it put on globalThis is kept for its tests */
    built() {
      mine = new Map();
      for (const k of Reflect.ownKeys(globalThis)) {
        const d = Object.getOwnPropertyDescriptor(globalThis, k);
        if (!sameDescriptor(BASE.get(k), d)) mine.set(k, d);
      }
      restore(BASE);
    },
    enter() {
      restore(BASE);
      for (const [k, d] of mine) { try { Object.defineProperty(globalThis, k, d); } catch { /* non-configurable */ } }
    },
    leave() { restore(BASE); },
  };
}

/* ── an in-memory IndexedDB ───────────────────────────────────────────────────────────────────────
   It answers the calls js/gis-project.js makes and nothing else. ⚠ Node has no IndexedDB, and the
   store says `storage-unavailable` rather than pretending — so a shim is the only way to evaluate the
   SHIPPED module rather than a description of it (#R729; #R738 and #R749 carried identical copies,
   which is why it lives here now). */
export function fakeIDB(store) {
  const fire = (obj, name, arg) => { setTimeout(() => { const h = obj['on' + name]; if (h) h(arg || { target: obj }); }, 0); };
  function req(result) { const r = { result, error: null }; fire(r, 'success'); return r; }
  const os = {
    put: (v) => { store.set(v.id, JSON.parse(JSON.stringify(v))); return req(v.id); },
    get: (k) => req(store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : undefined),
    delete: (k) => { const had = store.delete(k); return req(had); },
    getAll: () => req(Array.from(store.values()).map((v) => JSON.parse(JSON.stringify(v)))),
    openCursor: () => {
      const rows = Array.from(store.values()); let i = 0;
      const r = { result: null, error: null };
      const step = () => {
        if (i >= rows.length) { r.result = null; }
        else { const v = JSON.parse(JSON.stringify(rows[i++])); r.result = { value: v, key: v.id, continue: () => { step(); } }; }
        fire(r, 'success');
      };
      step(); return r;
    },
  };
  return {
    open: () => {
      const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => os,
        /* ⚠ `complete` fires AFTER the requests made on this transaction, which is the whole point
           of a store that settles on oncomplete: firing it first made every read answer with the
           value it had before the request landed (this shim said `not-found` for a record it was
           holding). Two ticks, so a request queued synchronously after this call still wins. */
        transaction: () => { const tx = { objectStore: () => os, oncomplete: null, onerror: null, onabort: null, error: null }; setTimeout(() => fire(tx, 'complete'), 0); return tx; },
        close: () => { },
      };
      const r = { result: db, error: null, onupgradeneeded: null };
      setTimeout(() => { if (r.onupgradeneeded) r.onupgradeneeded({ target: r }); if (r.onsuccess) r.onsuccess({ target: r }); }, 0);
      return r;
    },
  };
}
