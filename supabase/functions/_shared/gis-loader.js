// ============================================================================
//  IntMap · _shared/gis-loader.js — the SAME GIS the page and Atlas use, assembled with no screen
// ----------------------------------------------------------------------------
//  js/gis-core.js makeGisRuntime() (docs/GIS-CORE.md §5.8) — not a second implementation. js/geodesy.js is a
//  classic script that writes onto `window`, so `window` is made a plain object FIRST and handed to the runtime
//  as its scope (a runtime handed a scope other than the live window is refused `scope-conflict`).
//  Both imports are literal specifiers so the Edge bundler follows them.
// ============================================================================
/* ONE realm per isolate: the kernels are one instance each, so the runtime is built once and every caller shares it (a second makeGisRuntime on the
   same scope is a second set of kernels). A failed load is not remembered. */
let loaded = null;
export function loadGis() {
  return loaded || (loaded = build().catch((e) => { loaded = null; throw e; }));
}

async function build() {
  /* ⚠ ADOPT A window THAT IS ALREADY THERE. The Supabase Edge runtime defines window itself, as an accessor that cannot be assigned; assigning our own object
     did nothing, the runtime found a window that was not the scope it was handed and refused scope-conflict — every data.gis task failed so in production
     (2026-11-26, PR #1431). With no window (Node, a test) a plain object is made. Either way the runtime is handed the very object the kernels will read. */
  const live = typeof window !== "undefined" && window ? window : null;
  const scope = live || {};
  if (!live) globalThis.window = scope;
  await import("../../../js/geodesy.js");
  const mod = await import("../../../js/gis-core.js");
  /* a scope we made is closed (only geodesy is handed over); a window the host owns is the supplier itself (the runtime's open mode: what it carries is what the kernels read) */
  const r = mod.makeGisRuntime(live ? { scope, host: { lang: "en" } } : { scope, externals: { geodesy: scope.IntMapGeodesy }, host: { lang: "en" } });
  if (!r.ok) throw new Error("gis_unavailable:" + r.why + (r.detail ? " " + JSON.stringify(r.detail).slice(0, 300) : ""));
  return r.gis;
}
