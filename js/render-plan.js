// @ts-check
/* ============================================================================
 *  IntMap · js/render-plan.js — choose HOW to draw something from what the engine can do
 * ----------------------------------------------------------------------------
 *  MapLibre and Cesium are not interchangeable: 3D Tiles exist only on Cesium, footprint extrusion exists on both.
 *  A feature that has more than one way to be drawn lists them, best first, each with the capabilities it needs
 *  (js/geo-engine.js `capabilities`). The first one the active engine can do is chosen; if none, the answer says
 *  so and says which capability was missing, so the caller can tell the user instead of drawing nothing in silence.
 *  Pure: no window, no engine — tests/engine-render-plan-checks.test.mjs runs it in Node.
 * ==========================================================================*/

/** @typedef {{ method: string, needs: string[] }} RenderCandidate */
/** @typedef {{ method: string|null, index: number, missing: string[] }} RenderPlan */

/**
 * @param {Record<string, any>|null|undefined} caps  the active engine's capabilities
 * @param {RenderCandidate[]} candidates              best first
 * @returns {RenderPlan}  `method` null when nothing can be drawn; `missing` is then the first candidate's unmet needs
 */
export function pickRenderMethod(caps, candidates) {
  const c = caps || {};
  let firstMissing = /** @type {string[]} */ ([]);
  for (let i = 0; i < candidates.length; i++) {
    const miss = candidates[i].needs.filter((k) => !c[k]);
    if (!miss.length) return { method: candidates[i].method, index: i, missing: [] };
    if (!i) firstMissing = miss;
  }
  return { method: null, index: -1, missing: firstMissing };
}
