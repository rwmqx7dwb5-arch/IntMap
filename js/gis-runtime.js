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
 *
 *  ══ #R819 — 一度に 1 つではなく、名前を持った実行コンテキスト ═════════════════════════════════
 *  What #R783 shipped was one slot: `let MOUNTED = null`, and a caller handing over a second scope
 *  in a realm that already had one was refused `scope-conflict`. That refusal is CORRECT and it is
 *  unchanged — the kernels resolve each other by bare global name, so two assemblies in one realm
 *  would be two registries answering under one name, and a dataset id would resolve in one of them.
 *  What was missing was everything AROUND it:
 *
 *    · one slot could not HOLD two, even where two are legitimate (two realms), so nothing could be
 *      built on top of it — a second scope was refused and also forgotten;
 *    · an assembly could never be taken back off a scope, so the refusal was PERMANENT: a realm that
 *      mounted once could not mount anything else for the rest of its life, even after the caller of
 *      the first was finished with it;
 *    · and the refusal named no holder, so 「what already has this realm」 was unanswerable.
 *
 *  So: a TABLE of contexts rather than a slot, each with an id; `release(ctx)` which takes an
 *  assembly back off the scope it published on — using the list mount() verified, never a second copy
 *  of it — and re-opens the realm; and `contexts()`, which reports per entry whether it is AMBIENT
 *  (whether the kernels that make it up can currently find each other on this realm's scope).
 *
 *  ⚠ AND THE SECOND RUNTIME LIVES IN A SECOND REALM, WHICH IS SAID OUT LOUD RATHER THAN WISHED AWAY.
 *  serve() / attach() / workerSource() are the two ends of ONE protocol written once in this file:
 *  workerSource() emits the module text for a realm that holds nothing but a GIS (a Worker, a worker
 *  thread, a child process), serve() runs inside it and answers CALLS BY PATH on the assembled face,
 *  attach() is the handle on this side. What crosses is plain records — which is what `flow` already
 *  answers in — and what cannot cross is refused BY NAME (`result-not-transferable`, which also
 *  states that the call RAN), because a dataset is a live object of ITS realm and is referred to from
 *  outside by identifier. That is the same 「識別子で結び、綴りで結ばない」 rule the rest of this layer
 *  keeps. ⚠ Every message gets exactly one reply, including refusals and including a released job's
 *  pending calls: a caller left waiting is .agents/rules/one-pass-or-a-reason.md §2-2 (「結果が持ち帰
 *  られなかった」), and it is the shape that makes a caller re-run work that already happened.
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
/* ⚠ (#R819) `module` IS WHERE A REALM WITH NOTHING IN IT CAN GET THIS ONE FROM, and it is null for
   the five that are the PAGE's — the layer registry, the renderer, the upload door, the language and
   the host are made by the running app out of a DOM, and a file that could supply them headlessly
   does not exist. Writing one anyway would be a dependency nobody can honour. workerSource() below
   derives its imports from this column, so a supplier added here reaches an isolated realm the same
   day, and no second list of filenames is kept anywhere. */
const EXTERNALS = Object.freeze([
  Object.freeze({
    name: 'geodesy', global: 'IntMapGeodesy', need: 'required', module: './geodesy.js',
    for: 'distance, area, buffer — every op declaring needsGeodesy (js/gis-ops.js:71, refuses by name: geodesy-missing)',
  }),
  Object.freeze({
    name: 'layers', global: 'IntMapLayers', need: 'optional', module: null,
    for: "the map's own layers as datasets, and what each row states (js/gis-layers.js:94, js/gis-sources.js:114)",
  }),
  Object.freeze({
    name: 'engine', global: 'IntMapGeoEngine', need: 'optional', module: null,
    for: "the camera and the renderer's live sources (js/gis-layers.js:93, js/gis-sources.js:117)",
  }),
  Object.freeze({
    name: 'upload', global: 'GeoJSONUpload', need: 'optional', module: null,
    for: 'putting a dataset on the map — draw() below, and js/gis-layers.js:181',
  }),
  Object.freeze({
    name: 'lang', global: 'IntMapLang', need: 'optional', module: null,
    for: "the reader's language for the Atlas surface's own sentences (js/gis-atlas.js:64)",
  }),
  Object.freeze({
    name: 'host', global: 'IntMapHost', need: 'optional', module: null,
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
  /* ⚠ (#R819) THE REFUSAL IS UNCHANGED IN WHAT IT REFUSES. It exists because the kernels read bare
     globals: a second scope in this realm would be a second set of kernels answering under one name.
     What it now does is NAME THE HOLDER and the two ways forward — release that context when its
     caller is finished, or put the second runtime in its own realm — because a refusal that leaves
     the caller nowhere to go is how a caller comes to work around it. */
  if (live && live !== given) {
    return {
      ok: false, why: 'scope-conflict',
      detail: {
        because: 'a window already exists and it is not the object handed in',
        heldBy: CONTEXTS.filter((c) => c.scope === live).map((c) => c.id),
        instead: 'release that context, or run the second runtime in its own realm (makeGisRuntime.workerSource/serve/attach)',
      },
    };
  }
  if (live === given) return { ok: true, scope: given, install: false };
  return { ok: true, scope: given, install: true };
}

/* The two modes described in the header, in one pass over the one table. */
function applyExternals(scope, given) {
  const closed = !!(given && typeof given === 'object');
  /* (#R819) `wrote` is what THIS call put on the scope, so releasing the context can take exactly
     those back off — and leave anything the page or another caller owns where it is. */
  const present = [], absent = [], missing = [], conflicts = [], wrote = [];
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
      try { scope[d.global] = given[d.name]; } catch (e) { return { closed, present, absent, conflicts, wrote, missing: [{ name: d.name, global: d.global, for: d.for, why: 'scope-not-writable', detail: e && e.message }] }; }
      wrote.push({ name: d.name, global: d.global, value: given[d.name] });
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
  return { closed, present, absent, missing, conflicts, wrote };
}

/* ══ (#R819) ONE SLOT BECAME A TABLE OF NAMED CONTEXTS ══════════════════════════════════════════
   One mounted assembly per (scope, host). ⚠ ASKING TWICE IS ANSWERED WITH 「もう済んでいる」 AND THE
   SAME OBJECT, never with a second set of kernels (.agents/rules/one-pass-or-a-reason.md §1): two
   registries under one global is the failure where a caller's dataset id resolves in one of them and
   not the other. A caller that hands over a DIFFERENT closed set is asking for a different assembly
   and gets one.
   ⚠ WHAT #R783 HELD WAS `let MOUNTED = null` — one record, overwritten by the next mount. The record
   was the only place that knew what an assembly had published, so overwriting it made the first
   assembly UNREACHABLE AND UNREMOVABLE: its kernels were still on its scope under the same names, and
   nothing could take them off again. The table holds every live one, each with an id, what it
   published (the list mount() itself verified — never a second copy), which externals THIS call
   injected, and whether this call is the one that installed `globalThis.window`.
   ⚠ HOW MANY MAY BE AMBIENT AT ONCE IS A PROPERTY OF THE REALM, NOT OF THIS TABLE, so it is MEASURED
   rather than asserted: ambient() asks whether this realm's scope still resolves every published name
   to THIS entry's instances. The kernels read bare globals, so at most one entry per realm can pass
   that — which is the same fact `scope-conflict` refuses on, said as an observation instead of a
   belief. Two runtimes at once therefore need two realms: serve/attach/workerSource below. */
const CONTEXTS = [];
let CTX_SEQ = 0;

function heldBy(scope, host) {
  for (const c of CONTEXTS) if (c.scope === scope && c.host === host) return c;
  return null;
}

/* Whether the kernels that make this assembly up can currently find each other — the whole of what
   「this runtime is the live one」 means, asked of the scope rather than remembered. */
function ambient(c) {
  if (liveScope() !== c.scope) return false;
  for (const [g, inst] of c.published) {
    let seen = null; try { seen = c.scope[g]; } catch (_) { seen = null; }
    if (seen !== inst) return false;
  }
  return true;
}

function describeContext(c) {
  return Object.freeze({ id: c.id, scopeSource: c.scopeSource, host: !!c.host, ambient: ambient(c), externals: c.externals });
}

function makeGisRuntime(deps) {
  const s = planScope(deps);
  if (!s.ok) return s;
  const host = (deps && deps.host) || (deps && deps.externals && deps.externals.host) || null;
  const held = heldBy(s.scope, host);
  if (held && !(deps && deps.externals)) {
    return { ok: true, gis: held.gis, scope: s.scope, host: host, reused: true, scopeInstalled: false, externals: held.externals, context: describeContext(held) };
  }
  /* ⚠ (#R819) THE NAME IS CHECKED BEFORE ANYTHING IS WRITTEN, for the reason the plan does not write:
     a refusal must leave the world where it found it. An id already taken is refused here, where
     nothing has been injected and no scope installed, and never after. */
  const wantId = (deps && deps.contextId != null) ? String(deps.contextId) : null;
  if (wantId && CONTEXTS.some((c) => c.id === wantId)) {
    return { ok: false, why: 'context-id-taken', detail: { id: wantId, because: 'another live context already answers to that name; release it or choose another' } };
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
  const context = { id: wantId || ('gis:' + (++CTX_SEQ)), scopeSource: s.install ? 'installed' : 'live' };
  const mounted = mountGis(s.scope, host, context);
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
  const entry = {
    id: mounted.context ? mounted.context.id : context.id,
    scope: s.scope, host: host, gis: mounted.gis, externals: externals,
    scopeSource: context.scopeSource,
    /* ⚠ FROM THE MOUNT, NOT WRITTEN AGAIN HERE. js/gis-core.js verified this very list against the
       scope; a copy of it in this file would go stale on the day a sixteenth kernel is mounted, and
       release() would leave that one behind under a name the next assembly is about to publish. */
    published: (mounted.published || []).slice(),
    injected: (ext.wrote || []).slice(),
    installed: !!s.install,
  };
  CONTEXTS.push(entry);
  return { ok: true, gis: mounted.gis, scope: s.scope, host: host, reused: false, scopeInstalled: !!s.install, externals: externals, context: describeContext(entry) };
}

/* ── (#R819) 片付ける — TAKING AN ASSEMBLY BACK OFF THE SCOPE IT PUBLISHED ON ────────────────────
   ⚠ THIS IS WHAT MAKES `scope-conflict` A CONDITION RATHER THAN A SENTENCE. Before this, a realm that
   had mounted once was refused for the rest of its life — the caller of the first assembly had no way
   to say 「終わった」. Release removes only what THIS context owns, and it proves ownership by identity
   rather than by name: a global that no longer holds our instance belongs to somebody else now, and is
   reported in `keptForeign` instead of deleted. That is the same rule `scope-carries-uninjected`
   states from the other direction — never take off a scope what was not put there by this caller.
   ⚠ `IntMapModules.gisCore` IS DELIBERATELY LEFT. It is the door to the ASSEMBLER, not to this
   assembly: it mounts a fresh one when it is next called, and removing it would take a working door
   off the page because one runtime on it finished. */
function releaseContext(ref) {
  const id = (ref == null) ? null
    : (typeof ref === 'string' ? ref
      : ((ref.context && ref.context.id != null) ? String(ref.context.id) : (ref.id != null ? String(ref.id) : null)));
  const i = id == null ? -1 : CONTEXTS.findIndex((c) => c.id === id);
  if (i < 0) return { ok: false, why: 'context-unknown', detail: { id: id, live: CONTEXTS.map((c) => c.id) } };
  const c = CONTEXTS[i];
  const unpublished = [], keptForeign = [], externalsRemoved = [];
  for (const [g, inst] of c.published) {
    let seen = null; try { seen = c.scope[g]; } catch (_) { seen = null; }
    if (seen === inst) { try { delete c.scope[g]; unpublished.push(g); } catch (_) { keptForeign.push(g); } }
    else if (seen != null) keptForeign.push(g);
  }
  for (const w of c.injected) {
    let seen = null; try { seen = c.scope[w.global]; } catch (_) { seen = null; }
    if (seen === w.value) { try { delete c.scope[w.global]; externalsRemoved.push(w.name); } catch (_) { keptForeign.push(w.global); } }
    else if (seen != null) keptForeign.push(w.global);
  }
  /* The install is undone only where this call made it, and only while the realm still points at us. */
  let windowUninstalled = false;
  if (c.installed) {
    try { if (globalThis.window === c.scope) { delete globalThis.window; windowUninstalled = true; } } catch (_) { }
  }
  CONTEXTS.splice(i, 1);
  return { ok: true, released: Object.freeze({ id: c.id, unpublished: unpublished, externalsRemoved: externalsRemoved, keptForeign: keptForeign, windowUninstalled: windowUninstalled }) };
}

/* ══ (#R819) 二つ目の runtime は二つ目の realm に住む — ONE PROTOCOL, WRITTEN ONCE, TWO ENDS ═════
   ⚠ WHY A PROTOCOL AND NOT A SECOND ASSEMBLY IN THIS REALM: the kernels resolve each other by bare
   global name, so two assemblies here would be two registries under one name — the defect
   `scope-conflict` exists to refuse, and none of what follows weakens it. A realm is the unit that
   can hold a GIS: a Worker, a worker thread, a child process, another page.
   ⚠ AND BOTH ENDS ARE IN THIS FILE ON PURPOSE. Two files agreeing about a wire format is the shape
   [[intmap-contract-is-not-implementation]] records: a contract with two implementations drifts at
   the seam, and each side's tests stay green while the pair stops working. */
const WIRE = 'intmap-gis/1';

/* The one message-port shape, out of the three that exist. Browser MessagePort/Worker and Node's
   worker_threads.MessagePort are EventTargets (`addEventListener`, and Node needs the explicit
   `start()` that the emitter API calls for you); Node's Worker object itself is an EventEmitter with
   only `on`. A port that is neither is refused by name rather than half-wired. */
function portBind(port, onMessage) {
  if (!port || typeof port.postMessage !== 'function') return null;
  if (typeof port.addEventListener === 'function') {
    const h = (ev) => onMessage((ev && typeof ev === 'object' && 'data' in ev) ? ev.data : ev);
    port.addEventListener('message', h);
    try { if (typeof port.start === 'function') port.start(); } catch (_) { }
    return () => { try { port.removeEventListener('message', h); } catch (_) { } };
  }
  if (typeof port.on === 'function') {
    const h = (d) => onMessage(d);
    port.on('message', h);
    return () => { try { (port.off || port.removeListener).call(port, 'message', h); } catch (_) { } };
  }
  return null;
}

/* ── the call, resolved on the assembled face by PATH ──────────────────────────────────────────
   ⚠ NO LIST OF FORWARDED OPERATIONS. A hand-written table of 「what may be called across」 would be
   the list .agents/rules/no-ad-hoc-hardcoding.md forbids, and the first op added to js/gis-ops.js
   would be unreachable from another realm with nobody the wiser. The path is resolved on the real
   assembly, own properties only, and the three names that are not data (`__proto__`, `prototype`,
   `constructor`) are refused: a message from outside must not be able to walk to a prototype. */
async function invoke(gis, path, args) {
  const p = Array.isArray(path) ? path : [path];
  if (!p.length) return { ok: false, why: 'call-malformed', detail: { because: 'a call names a path on the assembled GIS, e.g. ["flow","run"]' } };
  let node = gis, owner = null;
  for (const k of p) {
    if (typeof k !== 'string' || k === '__proto__' || k === 'prototype' || k === 'constructor') {
      return { ok: false, why: 'path-refused', detail: { path: p, at: String(k) } };
    }
    if (node == null || (typeof node !== 'object' && typeof node !== 'function') || !Object.prototype.hasOwnProperty.call(node, k)) {
      return { ok: false, why: 'path-unknown', detail: { path: p, at: k } };
    }
    owner = node; node = node[k];
  }
  if (typeof node !== 'function') return { ok: false, why: 'path-not-callable', detail: { path: p, is: typeof node } };
  const value = await node.apply(owner, Array.isArray(args) ? args : []);
  /* ⚠ THE REFUSAL SAYS THAT THE CALL RAN. A dataset is a LIVE object of its own realm — it answers
     features() — so it cannot cross, and `data.add` genuinely registered it before we found that out.
     Reporting that as a plain failure would tell the caller to do it again, which is exactly the
     二度目 .agents/rules/one-pass-or-a-reason.md forbids. What crosses is the plain records `flow`
     already answers in; what stays behind is reached from outside by IDENTIFIER, the way every other
     reference in this layer is. */
  if (typeof structuredClone !== 'function') {
    return { ok: false, why: 'result-not-transferable', detail: { path: p, performed: true, because: 'this realm has no structuredClone, so nothing can be proved to cross' } };
  }
  try { return { ok: true, value: structuredClone(value) }; }
  catch (e) {
    return { ok: false, why: 'result-not-transferable', detail: { path: p, performed: true, message: e && e.message, because: 'the value holds live objects of that realm; ask for it by identifier through flow, which answers in plain records' } };
  }
}

/* ── the realm's end: assemble here, and answer calls ─────────────────────────────────────────── */
function serve(port, opts) {
  const o = opts || {};
  const off0 = { fn: null };
  const send = (m) => { try { port.postMessage(m); } catch (_) { } };
  const r = makeGisRuntime(o.runtime || {});
  const onMessage = (m) => {
    if (!m || typeof m !== 'object' || m.w !== WIRE) return;   /* not ours — other traffic on this port is not ours to eat */
    const seq = m.seq;
    if (m.release) {
      const rel = r.ok ? releaseContext(r.context.id) : { ok: false, why: 'never-assembled' };
      send({ w: WIRE, seq: seq, reply: { ok: !!rel.ok, why: rel.why || null, released: rel.released || null } });
      if (off0.fn) off0.fn();
      return;
    }
    /* ⚠ EXACTLY ONE REPLY PER MESSAGE, INCLUDING THE ONES THAT THREW. A caller whose promise never
       settles is the 「結果が持ち帰られなかった」 half of .agents/rules/one-pass-or-a-reason.md §2. */
    Promise.resolve()
      .then(() => (r.ok ? invoke(r.gis, m.call, m.args) : { ok: false, why: r.why, detail: r.detail || null }))
      .then((res) => send({ w: WIRE, seq: seq, reply: res }))
      .catch((e) => send({ w: WIRE, seq: seq, reply: { ok: false, why: 'call-threw', detail: { message: e && e.message } } }));
  };
  const off = portBind(port, onMessage);
  off0.fn = off;
  if (!off) {
    if (r.ok) releaseContext(r.context.id);
    return { ok: false, why: 'port-unusable', detail: { because: 'a port must have postMessage and either addEventListener or on(message)' } };
  }
  /* ⚠ A REFUSAL IS ANNOUNCED, NOT SWALLOWED. A realm that could not assemble and said nothing leaves
     the other end waiting on a hello that will never come — the same unsettled wait again. */
  if (!r.ok) {
    send({ w: WIRE, hello: { ok: false, why: r.why, detail: r.detail || null } });
    return r;
  }
  send({ w: WIRE, hello: { ok: true, context: r.context, externals: r.externals } });
  return {
    ok: true, gis: r.gis, context: r.context,
    stop: () => { if (off0.fn) { off0.fn(); off0.fn = null; } return releaseContext(r.context.id); },
  };
}

/* ── this side's end: a handle on the runtime in that realm ───────────────────────────────────── */
let JOB_SEQ = 0;
function attach(port, opts) {
  const o = opts || {};
  const id = (o.id != null) ? String(o.id) : ('job:' + (++JOB_SEQ));
  const pending = new Map();
  let seq = 0, closed = false, settleReady = null, hello = null;
  const ready = new Promise((res) => { settleReady = res; });
  const off = portBind(port, (m) => {
    if (!m || typeof m !== 'object' || m.w !== WIRE) return;
    if (m.hello) { hello = m.hello; settleReady(m.hello); return; }
    if (m.seq == null) return;
    const res = pending.get(m.seq);
    if (!res) return;   /* a reply to a call already settled by release() — answered once, not twice */
    pending.delete(m.seq);
    res(m.reply || { ok: false, why: 'reply-empty', detail: { seq: m.seq } });
  });
  if (!off) return { ok: false, why: 'port-unusable', detail: { because: 'a port must have postMessage and either addEventListener or on(message)' } };
  /* ⚠ A CALL ALWAYS SETTLES, AND IT SETTLES TO A RECORD — never a rejection, because the whole layer
     answers { ok, why } and a caller that must write two error paths writes one of them wrong. */
  function call(path, args) {
    if (closed) return Promise.resolve({ ok: false, why: 'job-released', detail: { id: id } });
    const n = ++seq;
    return new Promise((res) => {
      pending.set(n, res);
      try { port.postMessage({ w: WIRE, seq: n, call: Array.isArray(path) ? path.slice() : [String(path)], args: args || [] }); }
      catch (e) { pending.delete(n); res({ ok: false, why: 'call-not-sent', detail: { message: e && e.message } }); }
    });
  }
  /* ⚠ RELEASING THIS END SETTLES WHAT IS IN FLIGHT. The realm is told to let its context go, every
     waiting call is answered `job-released`, and nothing is left hanging on a realm that may be about
     to be terminated by whoever created it. ⚠ TERMINATING THAT REALM IS ITS OWNER'S TO DO: this
     function did not create the thread and does not kill it — killing something we did not start is
     how one job's cancel takes another's work with it (js/gis-worker.js records that exact rule). */
  function release() {
    if (closed) return { ok: true, released: { id: id, alreadyReleased: true, pendingSettled: 0 } };
    closed = true;
    try { port.postMessage({ w: WIRE, seq: 0, release: true }); } catch (_) { }
    let n = 0;
    for (const res of pending.values()) { n++; res({ ok: false, why: 'job-released', detail: { id: id } }); }
    pending.clear();
    settleReady(hello || { ok: false, why: 'job-released', detail: { id: id } });
    if (off) off();
    return { ok: true, released: { id: id, alreadyReleased: false, pendingSettled: n } };
  }
  return { ok: true, job: { id: id, ready: ready, call: call, release: release, waiting: () => pending.size } };
}

/* ── the module text a realm with nothing in it runs ──────────────────────────────────────────────
   ⚠ THE URL IS THE CALLER'S TO STATE, AND THAT IS NOT LAZINESS. js/gis-worker.js records why a js/
   module may not write `new URL('./x.js', import.meta.url)`: that form is the one the bundler emits
   and fingerprints, and inside a bundled chunk a path relative to this file's own URL names nothing.
   Deriving it would be right in the dev server and wrong in the build, which is worse than asking.
   ⚠ EVERYTHING ELSE IS DERIVED FROM THAT ONE INPUT, including the suppliers, whose filenames come
   from the EXTERNALS table above rather than from a second list kept here.
   ⚠ NO TOP-LEVEL await: the text must run both as an ES module (a Blob worker) and as the CommonJS
   body Node evaluates for `new Worker(src, { eval: true })`, so the whole of it is an async IIFE
   using dynamic import — the one form both accept. */
function workerSource(opts) {
  const o = opts || {};
  const coreUrl = (o.coreUrl == null || String(o.coreUrl) === '') ? null : String(o.coreUrl);
  if (!coreUrl) {
    return { ok: false, why: 'core-url-missing', detail: { because: 'the other realm must be told where js/gis-core.js is; a path relative to this module is meaningless inside a bundled chunk' } };
  }
  const suppliers = [];
  for (const d of EXTERNALS) {
    if (!d.module) continue;
    let u = (o.suppliers && o.suppliers[d.name]) || null;
    if (!u) { try { u = new URL(d.module, coreUrl).href; } catch (e) { return { ok: false, why: 'supplier-url-underivable', detail: { name: d.name, module: d.module, message: e && e.message } }; } }
    suppliers.push({ name: d.name, global: d.global, url: String(u) });
  }
  const J = (v) => JSON.stringify(v);
  const runtime = ['scope: scope'];
  if (o.contextId != null) runtime.push('contextId: ' + J(String(o.contextId)));
  if (o.host != null) runtime.push('host: ' + J(o.host));
  const lines = [
    '/* (#R819) ONE GIS RUNTIME, ALONE IN THIS REALM — generated by js/gis-runtime.js workerSource().',
    '   The scope is made here and installed before anything is imported, so the classic scripts that',
    '   publish onto the global window land on it, and the assembler finds a live scope rather than',
    '   installing one of its own. */',
    '(async () => {',
    '  const scope = {};',
    '  globalThis.window = scope;',
  ];
  for (const s of suppliers) lines.push('  await import(' + J(s.url) + ');   /* supplies ' + s.name + ' as ' + s.global + ' */');
  lines.push(
    '  const core = await import(' + J(coreUrl) + ');',
    '  let port = null;',
    "  try { const wt = await import('node:worker_threads'); port = wt.parentPort; } catch (_) { port = null; }",
    "  if (!port && typeof self !== 'undefined') port = self;",
    '  const served = core.makeGisRuntime.serve(port, { runtime: { ' + runtime.join(', ') + ' } });',
    '  if (!served.ok && port) {',
    '    try { port.postMessage({ w: ' + J(WIRE) + ', hello: { ok: false, why: served.why, detail: served.detail || null } }); } catch (_) { }',
    '  }',
    '})();',
  );
  return { ok: true, source: lines.join('\n'), coreUrl: coreUrl, suppliers: suppliers.slice() };
}

/* ⚠ THE DECLARED SET IS READABLE, because a caller deciding what to hand over must not have to read
   this file to find out what there is. */
makeGisRuntime.externals = EXTERNALS;
/* (#R819) And so is what is live right now, and the four doors around it. */
makeGisRuntime.contexts = () => Object.freeze(CONTEXTS.map(describeContext));
makeGisRuntime.release = releaseContext;
makeGisRuntime.serve = serve;
makeGisRuntime.attach = attach;
makeGisRuntime.workerSource = workerSource;

return makeGisRuntime;
})();
