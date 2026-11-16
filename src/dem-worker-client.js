/* ============================================================================
 *  IntMap · THE PAGE'S SIDE OF THE DEM DECODE WORKER — window.IntMapDemWorker  (speed-overhaul)
 * ----------------------------------------------------------------------------
 *  src/dem-worker.js fetches and decodes a terrarium tile into metres; this starts it lazily and matches
 *  replies to requests. It lives in src/ for the reason src/sat-worker-client.js does: `new URL(…,
 *  import.meta.url)` is what lets the bundler emit the worker. Everything degrades: without Worker,
 *  OffscreenCanvas or createImageBitmap `decode()` returns null and js/map-readout.js keeps its own
 *  <img> path, and a worker that dies rejects what it held so the store marks those tiles failed (and
 *  retries them, as it does any failed tile) instead of waiting for ever.
 * ==========================================================================*/
window.IntMapDemWorker = (function () {
  'use strict';
  let w = null, tried = false, seq = 0;
  const pend = new Map();
  function worker() {
    if (tried) return w;
    tried = true;
    try {
      if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') return null;
      const it = new Worker(new URL('./dem-worker.js', import.meta.url), { type: 'module' });
      it.onmessage = (ev) => {
        const m = ev.data || {};
        const p = pend.get(m.id); if (!p) return; pend.delete(m.id);
        if (m.ok) p.res({ el: new Float32Array(m.el), voids: m.voids | 0 }); else p.rej(new Error(m.err || 'dem worker'));
      };
      it.onerror = () => {
        try { it.terminate(); } catch (_) { }
        w = null;   /* `tried` stays set: the page's own path takes every later tile */
        pend.forEach((p) => { try { p.rej(new Error('dem worker died')); } catch (_) { } }); pend.clear();
      };
      w = it;
    } catch (_) { w = null; }
    return w;
  }
  return {
    available: () => !!worker(),
    /** one tile, read within `ms` → Promise<{el: Float32Array(65536), voids}>, or null when there is no worker to ask */
    decode(url, ms) {
      const it = worker(); if (!it) return null;
      const id = ++seq;
      const p = new Promise((res, rej) => { pend.set(id, { res, rej }); });
      try { it.postMessage({ id, url, ms }); } catch (_) { pend.delete(id); return null; }
      return p;
    },
  };
})();
