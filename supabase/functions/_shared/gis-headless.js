// ============================================================================
//  IntMap · _shared/gis-headless.js — ONE spatial-operation runner with no screen, for every host that has none
// ----------------------------------------------------------------------------
//  Two doors run the page's own GIS (js/gis-core.js, assembled by _shared/gis-loader.js) on GeoJSON they were handed:
//  the MCP server (intmap_gis_run) and a durable job's server twin (data.gis, atlas-server-caps.js). They used to be
//  one function in one of them. This is that function, taken out so the second door is not a copy of the first:
//  what an op accepts, how its inputs are registered, how its answer and its provenance manifest are read back.
//
//    makeHeadlessGis({ loadGis, now }) → { ops(), run({ op, inputs, params }) }
//      ops()  the operations that work from inline vectors, as the GIS DECLARES them (never a list written here)
//      run()  ONE operation over inputs = arrays of Features, in the op's input order → { op, features, manifest }
//    Every refusal is a HeadlessError { code, detail } — a code the caller can show, not a thrown string.
//
//  The GIS is one realm per isolate (its kernels resolve each other by global name), so runs take turns and each starts
//  from an empty registry: nothing one caller sent is visible to the next.
//  What a HOST bounds (feature counts, bytes, time) is the host's: this file adds no number of its own.
//  ⚠ NO TYPE ANNOTATIONS — scripts/static-checks.mjs parses committed .js as plain JavaScript.
// ============================================================================

const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

export class HeadlessError extends Error { constructor(code, detail) { super(code); this.code = code; this.detail = detail; } }

/* a FeatureCollection, a Feature or an array of Features → the Features; null for anything else */
export function toFeatures(x) {
  if (Array.isArray(x)) return x;
  if (isObj(x) && x.type === "FeatureCollection" && Array.isArray(x.features)) return x.features;
  if (isObj(x) && x.type === "Feature") return [x];
  return null;
}

export function makeHeadlessGis(deps) {
  let tail = Promise.resolve();
  const gate = (fn) => { const run = tail.then(fn, fn); tail = run.then(() => {}, () => {}); return run; };
  let gisP = null;
  const gis = () => (gisP || (gisP = Promise.resolve().then(deps.loadGis).catch((e) => { gisP = null; throw e; })));

  async function catalogue() {
    const g = await gis();
    const cat = g.flow.find();
    /* declared as working from inline vectors (no raster output, no degree-grid-only surface) — the GIS's own predicate, the one the
       page's planner asks too (js/gis-core.js flow.runsWithoutScreen), so «what the server can run» is not written twice */
    return arr(cat.ops).filter((o) => g.flow.runsWithoutScreen(o));
  }

  return {
    ops: () => gate(async () => (await catalogue()).map((o) => ({ id: o.id, inputs: o.inputs, accepts: o.accepts, output: o.output, params: o.params }))),
    /* run({ op, inputs, params, names? }) — `names[i]` is where input i came from (a file's address, the task that made it): it is written into
       the provenance the GIS keeps for that input, so the manifest names the real source (it said `headless-input` for every file, measured
       2026-11-27). An input with no name is said to be unnamed, not given a made-up one. */
    run: (a) => gate(async () => {
      const g = await gis();
      const op = (await catalogue()).find((o) => o.id === a.op);
      if (!op) throw new HeadlessError("unknown_op", "see the operation list");
      const sets = arr(a.inputs);
      if (sets.length !== op.inputs) throw new HeadlessError("wrong_input_count", op.id + " takes " + op.inputs + " input(s)");
      g.data.clear();
      try {
        const ids = sets.map((features, i) => {
          const id = "in" + (i + 1);
          const name = arr(a.names)[i] ? String(arr(a.names)[i]).slice(0, 500) : "";
          const added = g.data.add({ id, title: name || id, features, provenance: { kind: "import", file: name || "(unnamed input " + (i + 1) + ")", format: "geojson", readAt: deps.now() } });
          if (added && added.ok === false) throw new HeadlessError("bad_input", String(added.why || "input refused"));
          return id;
        });
        await g.geometry.ready();
        const r = await g.flow.run({ op: op.id, inputs: ids, params: isObj(a.params) ? a.params : {} });
        if (!r || !r.ok) throw new HeadlessError("op_refused", String((r && r.why) || "refused"));
        const ds = g.data.get(r.dataset.id);
        const features = arr(ds && (typeof ds.features === "function" ? ds.features() : ds.features)); /* js/gis-project.js reads the body the same way: rec.features() */
        const manifest = await g.flow.account(r.dataset.id);
        return { op: op.id, features, manifest };
      } finally { try { g.data.clear(); } catch (_) { /* the next call clears again */ } }
    }),
  };
}
