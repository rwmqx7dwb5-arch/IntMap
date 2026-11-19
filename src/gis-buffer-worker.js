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
import { pack, transferables } from '../js/gis-packed.js';

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
    if (m.pack) {
      /* ⚠ PACKED: the answers' geometries leave as flat typed arrays and are TRANSFERRED, not cloned. A refusal
         (and only a refusal) stays an object, keyed by its position — a null-geometry success and a failure are
         different facts and must not share a representation. */
      const fails = {}, gs = new Array(results.length);
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r && r.ok === false) { fails[i] = r; gs[i] = null; } else gs[i] = r ? r.geometry : null;
      }
      const packed = pack(gs);
      self.postMessage({ id: m.id, ok: true, packed, fails }, transferables(packed));
      return;
    }
    self.postMessage({ id: m.id, ok: true, results });
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, why: 'worker-threw', message: String((e && e.message) || e) });
  }
};
