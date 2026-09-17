/* ============================================================================
 *  IntMap · THE GIS ASSEMBLER — what supplies the scope the kernels read   (#R783)
 * ----------------------------------------------------------------------------
 *  js/gis-core.js is the MOUNTING ORDER: which fifteen kernels come up, in which order, and what
 *  the assembled face offers (draw(), flow, the Atlas door). This file is the other half of that
 *  sentence — WHERE they come up. Every kernel resolves its neighbours out of the global scope at
 *  call time (js/gis-ops.js:70, js/gis-layers.js:87, js/gis-raster.js:138), and the things this
 *  layer does not own — the geodesy, the layer registry, the renderer, the upload door — are
 *  supplied by whoever is running it. makeGisRuntime() is the one place that decides what plays
 *  the part of that scope and what has been handed over.
 *
 *  ⚠ WHY THIS IS A SECOND FILE, AND WHY IT IS NOT A SPLIT MADE TO SATISFY A CHECK. The reader of
 *  the assembler is OUTSIDE js/: tests and outside programs import `makeGisRuntime` from
 *  js/gis-core.js in Node (docs/GIS-CORE.md §5.8), while the browser reaches the same assembly
 *  through window.IntMapModules.gisCore. A module whose only readers are outside the bundle has no
 *  line inside it that names what it publishes — and tests/r175-checks ③ measures exactly that:
 *  every export of a js/ module must be imported BY NAME from js/, or it is dead code. The honest
 *  way to hold that property is not to hide the export; it is to give it a real reader. So the two
 *  halves read each other, and each one's export is named by the other:
 *
 *      js/gis-core.js      export const mountGis      ← imported by name below
 *      js/gis-runtime.js   export const makeGisRuntime ← imported by name by js/gis-core.js,
 *                                                        which re-exports it for the outside caller
 *                                                        and registers the browser door with it
 *
 *  ⚠ THE CYCLE IS EVALUATION-SAFE AND ONE-DIRECTIONAL IN TIME. js/gis-core.js is the entry (that is
 *  what js/lazy-modules.js imports), so this file is evaluated first, and nothing here CALLS
 *  mountGis while it runs — the reference is read when a caller assembles a runtime, long after
 *  both modules have finished evaluating. ⚠ Importing THIS file on its own and assembling before
 *  js/gis-core.js has evaluated is the one order that does not work; nothing does it, and a caller
 *  that wants the runtime asks for js/gis-core.js, which is also where the kernels come from.
 *
 *  ⚠ AND THE DEFAULT SUPPLIER IS BUILT IN ONE PLACE, NOT FALLEN BACK TO IN MANY. `EXTERNALS` below
 *  is the whole list of what this layer borrows, with what each one is FOR. Two modes, and the
 *  difference between them is a property of the supplier rather than a preference:
 *      · no `externals`  — the live scope is the supplier. It is ALIVE: js/geodesy.js may land a tick
 *        after this mounts, so absence now is not absence at call time, which is why the kernels ask
 *        again every time and why this mode reports what is absent instead of refusing. Nothing in
 *        the browser path changed.
 *      · `externals` given — the set is CLOSED. What was not handed over is ABSENT, never taken off
 *        the scope behind the caller's back (that is `scope-carries-uninjected`), and a `required`
 *        one missing is a refusal that names it — never a silent default.
 * ==========================================================================*/

import { mountGis } from './gis-core.js';
/* ══ ⚠ ONE TOP-LEVEL BINDING, AND THE REST OF THE FILE INSIDE IT ═════════════════════════════
   tests/r175-checks ③ is the property the bundling rests on: a js/ module may hold NO unexported
   top-level declaration, because a classic script's top-level `const`/`function` was a global and
   this file is loaded inside the `gisCore` chunk beside fifteen kernels that resolve each other by
   global name. The assembler is seven bindings (EXTERNALS, liveScope, planScope, applyExternals,
   MOUNTED, makeGisRuntime and the table on it) — all module-private in intent, and the rule does
   not admit an export written only so a test can reach a helper. So the whole assembly lives in one
   closure and this file publishes ONE name.
   ⚠ MOVED WHOLE, NOT REFORMATTED. The body below is byte-for-byte what it was in js/gis-core.js —
   the same expressions, the same indentation, the same order, `makeGisRuntime.externals` in the same
   place — with ONE identifier changed: the mounting step, which was a local `mount(...)`, is now the
   imported `mountGis(...)`. Re-indenting 130 lines while calling it a move is the shape
   [[intmap-my-own-fix-had-the-shape-i-was-fixing]] records. */
export const makeGisRuntime = (function () {

/* ── WHAT THIS LAYER BORROWS AND DOES NOT OWN (#R783) ─────────────────────────────────────────
   ⚠ THE `global` IS WHERE THE KERNELS ACTUALLY LOOK, and it is why this table can be verified
   rather than believed: the file:line beside each one is the reader. A name written here that no
   kernel reads would be a dependency nobody has. */
const EXTERNALS = Object.freeze([
  Object.freeze({
    name: 'geodesy', global: 'IntMapGeodesy', need: 'required',
    for: 'distance, area, buffer — every op declaring needsGeodesy (js/gis-ops.js:71, refuses by name: geodesy-missing)',
  }),
  Object.freeze({
    name: 'layers', global: 'IntMapLayers', need: 'optional',
    for: "the map's own layers as datasets, and what each row states (js/gis-layers.js:94, js/gis-sources.js:114)",
  }),
  Object.freeze({
    name: 'engine', global: 'IntMapGeoEngine', need: 'optional',
    for: "the camera and the renderer's live sources (js/gis-layers.js:93, js/gis-sources.js:117)",
  }),
  Object.freeze({
    name: 'upload', global: 'GeoJSONUpload', need: 'optional',
    for: 'putting a dataset on the map — draw() below, and js/gis-layers.js:181',
  }),
  Object.freeze({
    name: 'lang', global: 'IntMapLang', need: 'optional',
    for: "the reader's language for the Atlas surface's own sentences (js/gis-atlas.js:64)",
  }),
  Object.freeze({
    name: 'host', global: 'IntMapHost', need: 'optional',
    for: 'the app host the panel and the Atlas surface read (js/gis-atlas.js:65)',
  }),
]);

function liveScope() { try { return (typeof window !== 'undefined' && window) ? window : null; } catch (_) { return null; } }

/* ⚠ THE SCOPE IS THE DEPENDENCY, BECAUSE THE KERNELS ARE ONE INSTANCE EACH BY DESIGN. Every module
   above reads its neighbours out of `window` at CALL time — deliberately, so that a kernel mounted a
   tick later is found, and so that nobody holds a private second copy (js/gis-core.js's own notes say
   so of the raster, the index and the expression kernels). A headless caller therefore does not
   «avoid window»; it SUPPLIES the object that plays that part, once, here.
   ⚠ AND IT IS SAID OUT LOUD. The install is reported as `scopeInstalled`, and a scope handed in where
   one already exists is refused (`scope-conflict`) rather than clobbered — two scopes would be two
   sets of kernels answering under one name.
   ⚠ IT PLANS AND DOES NOT WRITE. The install happens after every refusal below has had its chance,
   because the first version of this function installed the scope and THEN discovered the missing
   dependency — leaving a global `window` behind a refusal, so the next call refused again with a
   different reason (`scope-conflict`) about a state the first refusal had created. A refusal must
   leave the world where it found it, or it is not a refusal. */
function planScope(deps) {
  const live = liveScope();
  const given = (deps && deps.scope) || null;
  if (!given) {
    if (live) return { ok: true, scope: live, install: false };
    return {
      ok: false, why: 'scope-missing',
      detail: { needs: 'deps.scope', because: 'the kernels read each other out of the global scope at call time; with no window there is nothing to read' },
    };
  }
  if (live && live !== given) return { ok: false, why: 'scope-conflict', detail: { because: 'a window already exists and it is not the object handed in' } };
  if (live === given) return { ok: true, scope: given, install: false };
  return { ok: true, scope: given, install: true };
}

/* The two modes described in the header, in one pass over the one table. */
function applyExternals(scope, given) {
  const closed = !!(given && typeof given === 'object');
  const present = [], absent = [], missing = [], conflicts = [];
  for (const d of EXTERNALS) {
    if (!closed) {
      /* The live scope is the supplier. Nothing is written and nothing is refused: the kernels ask
         it again on every call, so this is a REPORT of what is there right now. */
      let v = null; try { v = scope[d.global] || null; } catch (_) { v = null; }
      (v ? present : absent).push(d.name);
      continue;
    }
    const handed = Object.prototype.hasOwnProperty.call(given, d.name) && given[d.name] != null;
    if (handed) {
      try { scope[d.global] = given[d.name]; } catch (e) { return { closed, present, absent, conflicts, missing: [{ name: d.name, global: d.global, for: d.for, why: 'scope-not-writable', detail: e && e.message }] }; }
      present.push(d.name);
      continue;
    }
    let onScope = null; try { onScope = scope[d.global] || null; } catch (_) { onScope = null; }
    /* ⚠ A CLOSED SET THAT QUIETLY ATE WHAT THE SCOPE HAPPENED TO CARRY WOULD BE HALF-INJECTED, and
       the caller would have no way to know which half. */
    if (onScope) { conflicts.push({ name: d.name, global: d.global }); continue; }
    absent.push(d.name);
    if (d.need === 'required') missing.push({ name: d.name, global: d.global, for: d.for });
  }
  return { closed, present, absent, missing, conflicts };
}

/* One mounted assembly per (scope, host). ⚠ ASKING TWICE IS ANSWERED WITH 「もう済んでいる」 AND THE
   SAME OBJECT, never with a second set of kernels (.agents/rules/one-pass-or-a-reason.md §1): two
   registries under one global is the failure where a caller's dataset id resolves in one of them and
   not the other. A caller that hands over a DIFFERENT closed set is asking for a different assembly
   and gets one. */
let MOUNTED = null;

function makeGisRuntime(deps) {
  const s = planScope(deps);
  if (!s.ok) return s;
  const host = (deps && deps.host) || (deps && deps.externals && deps.externals.host) || null;
  if (MOUNTED && MOUNTED.scope === s.scope && MOUNTED.host === host && !(deps && deps.externals)) {
    return { ok: true, gis: MOUNTED.gis, scope: s.scope, host: host, reused: true, scopeInstalled: false, externals: MOUNTED.externals };
  }
  const ext = applyExternals(s.scope, deps && deps.externals);
  if (ext.conflicts.length) {
    return { ok: false, why: 'scope-carries-uninjected', detail: { deps: ext.conflicts, because: 'these were not handed over, and taking them off the scope would make the injected set half the caller\'s and half the page\'s' } };
  }
  if (ext.missing.length) {
    return { ok: false, why: 'dependency-missing', detail: { missing: ext.missing } };
  }
  if (s.install) {
    try { globalThis.window = s.scope; } catch (e) { return { ok: false, why: 'scope-install-failed', detail: { message: e && e.message } }; }
  }
  const mounted = mountGis(s.scope, host);
  /* ⚠ AND THE INSTALL IS TAKEN BACK IF THE MOUNT DID NOT HAPPEN, for the same reason the plan does
     not write: a global left standing for an assembly that does not exist is a scope with no kernels
     in it, and the next caller would be refused with `scope-conflict` about it. */
  if (!mounted.ok) {
    if (s.install) { try { delete globalThis.window; } catch (_) { } }
    return mounted;
  }
  const externals = Object.freeze({
    supplier: ext.closed ? 'injected' : 'scope',
    present: Object.freeze(ext.present.slice()),
    absent: Object.freeze(ext.absent.slice()),
    /* What each absent one costs, from the same table the resolution used. */
    absentCosts: Object.freeze(EXTERNALS.filter((d) => ext.absent.indexOf(d.name) >= 0).map((d) => Object.freeze({ name: d.name, need: d.need, for: d.for }))),
  });
  MOUNTED = { scope: s.scope, host: host, gis: mounted.gis, externals: externals };
  return { ok: true, gis: mounted.gis, scope: s.scope, host: host, reused: false, scopeInstalled: !!s.install, externals: externals };
}

/* ⚠ THE DECLARED SET IS READABLE, because a caller deciding what to hand over must not have to read
   this file to find out what there is. */
makeGisRuntime.externals = EXTERNALS;

return makeGisRuntime;
})();
