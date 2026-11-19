/* ============================================================================
 *  IntMap · THE BUFFER, OFF THE PAGE'S THREAD  (gis-buffer-worker)
 * ----------------------------------------------------------------------------
 *  MEASURED (node 22, scripts/gis-scale-bench.mjs): 10,000 points buffered 5 km took 4.1 s on the thread
 *  that draws the map, and one buffered point is about 7 KB of output — the answer is thousands of times
 *  the input, so this is the op that holds the page still. The geometry kernel's own `geomKernel` runs it
 *  here, with the two borrowed things the Blob worker of js/gis-worker.js could never be given (a bare
 *  specifier, and a fingerprinted chunk's URL): polygon-clipping is a static import of THIS bundle, and
 *  js/geodesy.js is imported for its side effect.
 *  ⚠ THERE IS ONE IMPLEMENTATION. `geomKernel` is the function js/gis-geometry.js builds its own kernel
 *  from (`worker.kernelFunction()`), and the operation is reached through its `call` door — the same
 *  bufferKmR the page calls — so the two threads cannot answer differently for the same input.
 *  Protocol: {id, geometries:[GeoJSON|null], radiusKm, steps}
 *         →  {id, ok:true, results:[attempt.bufferKm answer | null]} | {id, ok:false, why, message}
 * ==========================================================================*/
import './gis-buffer-worker-window.js';
import '../js/geodesy.js';
import PC from 'polygon-clipping';
import { makeGisGeometry } from '../js/gis-geometry.js';

const geomKernel = makeGisGeometry().worker.kernelFunction();
const deps = { clipper: PC, geodesy: self.IntMapGeodesy };

self.onmessage = (ev) => {
  const m = ev.data || {};
  if (!m.id || !Array.isArray(m.geometries)) return;
  try {
    const results = new Array(m.geometries.length);
    for (let i = 0; i < m.geometries.length; i++) {
      const g = m.geometries[i];
      if (!g) { results[i] = null; continue; }
      const out = geomKernel(deps, { op: 'bufferKm', args: [g, m.radiusKm, m.steps] });
      /* `call` wraps an answer as {ok:true, value} and passes a refusal through whole; the page reads the
         kernel's own answer, so the wrapper is taken off here and nowhere else. */
      results[i] = (out && out.ok === false) ? out : out.value;
    }
    self.postMessage({ id: m.id, ok: true, results });
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, why: 'worker-threw', message: String((e && e.message) || e) });
  }
};
