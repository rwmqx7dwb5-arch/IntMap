/* ============================================================================
 *  IntMap · A SIMULATION'S OUTPUT IS A DATASET — registerSimOutput  (science-instruments)
 * ----------------------------------------------------------------------------
 *  「プルームに入る市区町村の人口は？」 was a question no combination of steps could answer: the plume
 *  was paint in a renderer source, and the only things the analysis tools (js/gis-ops.js), the
 *  Atlas cross-dataset query (`data.query`, js/atlas-query.js `from`) and the project save
 *  (js/gis-project.js) can read are records in the ONE dataset registry (js/gis-datasets.js). A
 *  simulator drew a shape on the map and nothing that analyses shapes could see it.
 *
 *  This is the one door every simulator uses to put its answer in that registry. It is not a second
 *  registry and holds nothing itself:
 *    · the record is an ordinary vector record — the ops, the query bridge and the list panel treat
 *      it exactly like an import or an op's output;
 *    · its provenance is {kind:'sim', sim, version, params, seed, at, file} — WHICH model, WHICH
 *      version of it, WITH WHICH arguments, and the SEED of its random numbers where it has one, so
 *      the run can be repeated and two runs can be told apart. `file` is the sentence a reader sees
 *      as the source (js/atlas-query.js prints it in the method block);
 *    · ⚠ it is BODY, not a recipe (js/gis-project.js §BODY): a simulation over a LIVE wind field is
 *      not a function of its arguments alone — the field it read is gone the next hour — so a saved
 *      project keeps the features themselves, and the provenance says how they were made.
 *
 *  ⚠ ONE LIVE RECORD PER SIMULATOR. A re-run replaces the last record of the same simulator — unless
 *  something was BUILT from it, in which case the old record stays and is marked stale through the
 *  registry's own invalidation (the ops refuse a stale input by name), because deleting an input
 *  out from under a reader's chain would be the silent loss js/gis-datasets.js `invalidate` exists
 *  to prevent.
 * ==========================================================================*/

const LIVE = new Map();   /* sim → the id of its current record */
let seq = 0;

async function registry() {
  if (window.IntMapData) return window.IntMapData;
  try { if (window.IntMapLazy && window.IntMapLazy.need) await window.IntMapLazy.need('gisCore'); } catch (_) {}
  return window.IntMapData || null;
}

/** spec: { sim, version, title, features, params, seed?, time?, file?, fieldStatements? }
 *  → the registry record, or null when the registry could not be loaded (said, never thrown). */
export async function registerSimOutput(spec) {
  const D = await registry();
  if (!D || !spec || !spec.sim || !Array.isArray(spec.features)) return null;
  const sim = String(spec.sim);
  const prev = LIVE.get(sim);
  if (prev && D.has(prev)) {
    let deps = []; try { deps = D.dependents(prev) || []; } catch (_) { deps = []; }
    if (deps.length) { try { D.invalidate(prev, 'superseded by a newer ' + sim + ' run'); } catch (_) {} }
    else { try { D.remove(prev); } catch (_) {} }
  }
  const id = 'sim-' + sim.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-' + (++seq);
  let rec = null;
  try {
    rec = D.add({
      id, title: String(spec.title || sim), features: spec.features, time: spec.time || null,
      fieldStatements: spec.fieldStatements || null,
      provenance: { kind: 'sim', sim, version: String(spec.version || ''), params: spec.params || {},
        seed: spec.seed == null ? null : spec.seed, at: Date.now(),
        file: String(spec.file || ('IntMap · ' + sim)) },
    });
  } catch (_) { rec = null; }
  if (rec) LIVE.set(sim, rec.id);
  return rec;
}

/** the current record of one simulator, or null */
export function simDataset(sim) {
  const id = LIVE.get(String(sim));
  try { return id && window.IntMapData && window.IntMapData.get(id); } catch (_) { return null; }
}

