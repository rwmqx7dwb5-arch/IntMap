/* ============================================================================
 *  IntMap · THE MAIN-THREAD SIDE OF THE RADIATION WORKER — window.IntMapRadiationWorker  (#R568)
 * ----------------------------------------------------------------------------
 *  It lives in src/ rather than js/ for the reason src/tsunami-worker-client.js states at its top:
 *  `new URL('./radiation-worker.js', import.meta.url)` is the only form that lets the bundler emit
 *  and fingerprint the worker, and a js/ module cannot write it.
 *
 *  ⚠ IT DEGRADES, AND THE CALLER IS TOLD WHICH IT GOT. If Worker is missing or the worker dies,
 *  `available()` is false and js/sims.js solves on the page with a smaller particle count — and the
 *  run REPORTS that it did (`engine`), because a page-thread run has a coarser Monte-Carlo error
 *  than a worker run and a report that hid the difference would be claiming a precision it did not
 *  have. That is the same rule the peak's own error bar follows.
 * ==========================================================================*/
window.IntMapRadiationWorker = (function () {
  'use strict';

  let w = null, tried = false, seq = 0;
  const pend = new Map();

  function worker() {
    if (tried) return w;
    tried = true;
    try {
      if (typeof Worker !== 'function') return null;
      const it = new Worker(new URL('./radiation-worker.js', import.meta.url), { type: 'module' });
      it.onmessage = (ev) => {
        const m = ev.data || {};
        const p = pend.get(m.id);
        if (!p) return;
        if (m.type === 'progress') { if (p.onProgress) { try { p.onProgress(m.p); } catch (_) { } } return; }
        pend.delete(m.id);
        if (m.type === 'error') p.rej(new Error(m.error || 'radiation worker'));
        else p.res(m.res);
      };
      it.onerror = () => {
        try { it.terminate(); } catch (_) { }
        w = null;
        pend.forEach((p) => { try { p.rej(new Error('radiation worker died')); } catch (_) { } });
        pend.clear();
      };
      w = it;
    } catch (_) { w = null; }
    return w;
  }

  return {
    available() { return !!worker(); },
    /* field/src/opts are exactly RAD.simulate's arguments — this side invents none of them. */
    run(field, src, opts, onProgress) {
      const it = worker();
      if (!it) return Promise.reject(new Error('no radiation worker'));
      const id = ++seq;
      return new Promise((res, rej) => {
        pend.set(id, { res, rej, onProgress });
        try { it.postMessage({ cmd: 'run', id, field, src, opts }); }
        catch (e) { pend.delete(id); rej(e); }
      });
    },
  };
})();
