// ============================================================================
//  IntMap · mcp-server/gis-loader.js — the SAME GIS the page and Atlas use, assembled with no screen
// ----------------------------------------------------------------------------
//  js/gis-core.js makeGisRuntime() (docs/GIS-CORE.md §5.8) — not a second implementation. js/geodesy.js is a
//  classic script that writes onto `window`, so `window` is made a plain object FIRST and handed to the runtime
//  as its scope (a runtime handed a scope other than the live window is refused `scope-conflict`).
//  Both imports are literal specifiers so the Edge bundler follows them.
// ============================================================================
export async function loadGis() {
  const scope = {};
  globalThis.window = scope;
  await import("../../../js/geodesy.js");
  const mod = await import("../../../js/gis-core.js");
  const r = mod.makeGisRuntime({ scope, externals: { geodesy: scope.IntMapGeodesy }, host: { lang: "en" } });
  if (!r.ok) throw new Error("gis_unavailable:" + r.why);
  return r.gis;
}
