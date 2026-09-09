/* ============================================================================
 *  IntMap · THE RADIOACTIVE-PLUME SOLVE, OFF THE MAIN THREAD  (#R568)
 * ----------------------------------------------------------------------------
 *  The model is js/radiation-model.js and nothing of it is repeated here — this file is the
 *  message boundary and nothing else, which is the same division src/photo-geo-worker.js and
 *  src/tsunami-worker.js are built on.
 *
 *  ⚠ WHY THE SOLVE HAD TO LEAVE THE PAGE. The old model ran 2,600 particles because 2,600 was what
 *  the main thread could do between two frames — and 2,600 particles sharing 8.5e16 Bq is what made
 *  a peak-deposition figure a coin toss (#R568 ⑦). Twenty thousand particles at a ten-minute step
 *  over a two-day window is ~6 million particle-steps; run on the page that is a visible freeze, and
 *  run here it is a progress bar. The particle count is the caller's, not this file's.
 * ==========================================================================*/
import { RAD } from '../js/radiation-model.js';

self.onmessage = (ev) => {
  const m = ev.data || {};
  if (m.cmd !== 'run') return;
  try {
    const res = RAD.simulate(m.field, m.src, m.opts, (p) => {
      try { self.postMessage({ type: 'progress', id: m.id, p }); } catch (_) { }
    });
    /* The three grid arrays are TRANSFERRED: a 48 h run over a busy field can hold tens of thousands
       of cells, and copying them back would undo part of what moving the solve here bought. */
    self.postMessage({ type: 'done', id: m.id, res },
      [res.keys.buffer, res.bq.buffer, res.cnt.buffer]);
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, error: (e && e.message) || 'radiation worker' });
  }
};
