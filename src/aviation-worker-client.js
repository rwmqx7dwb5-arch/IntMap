/* ============================================================================
 *  IntMap · THE MAIN-THREAD SIDE OF THE AVIATION WORKER — window.IntMapAviationWorker  (#R341)
 * ----------------------------------------------------------------------------
 *  src/aviation-worker.js owns the aircraft: it fetches the IMAV/1 snapshots, decodes them, keeps
 *  the slotted typed-array store, ages aircraft out, applies the filter and packs the GPU buffers.
 *  This is the half that has to live on the page — it starts the worker lazily, matches replies to
 *  requests, and hands the transferred buffers straight on to the caller.
 *
 *  It is its own file rather than more lines inside the aviation layer because standing rule 13
 *  says new functionality goes in a new file, and it lives in src/ rather than js/ because the ONE
 *  thing it does that a js/ module cannot is NAME THE WORKER ASSET: `new URL(…, import.meta.url)`
 *  is what lets the bundler emit and fingerprint src/aviation-worker.js. That is the same reason
 *  src/sat-worker-client.js and src/tsunami-worker-client.js are where they are.
 *
 *  EVERYTHING DEGRADES. If Worker is missing, `available()` is false and the caller keeps whatever
 *  path it had — it does not get a half-working layer. If the worker dies mid-flight every pending
 *  request is rejected rather than left hanging, because a promise that never settles is how a
 *  layer ends up permanently showing a spinner.
 * ==========================================================================*/
window.IntMapAviationWorker = (function () {
  'use strict';

  let w = null, tried = false, seq = 0;
  const pend = new Map();
  let onFrame = null;

  function worker() {
    if (tried) return w;
    tried = true;
    try {
      if (typeof Worker !== 'function') return null;
      const it = new Worker(new URL('./aviation-worker.js', import.meta.url), { type: 'module' });
      it.onmessage = (ev) => {
        const m = ev.data || {};
        /* A frame is BROADCAST as well as resolved: a poll's answer is also the new picture, and
           the layer wants it even when it did not ask (a filter change repacks, for instance). */
        if (m.type === 'frame' && onFrame) { try { onFrame(m); } catch (_) { } }
        const p = pend.get(m.id);
        if (!p) return;
        pend.delete(m.id);
        if (m.type === 'error') p.rej(new Error(m.error || 'aviation worker'));
        else p.res(m);
      };
      it.onerror = () => {
        try { it.terminate(); } catch (_) { }
        w = null;
        pend.forEach((p) => { try { p.rej(new Error('aviation worker died')); } catch (_) { } });
        pend.clear();
      };
      w = it;
    } catch (_) { w = null; }
    return w;
  }

  function send(cmd, extra) {
    const it = worker();
    if (!it) return Promise.reject(new Error('no aviation worker'));
    const id = ++seq;
    const msg = Object.assign({ cmd, id }, extra || {});
    return new Promise((res, rej) => {
      pend.set(id, { res, rej });
      try { it.postMessage(msg); } catch (e) { pend.delete(id); rej(e); }
    });
  }

  return {
    available() { try { return typeof Worker === 'function'; } catch (_) { return false; } },
    /** started lazily by the first call; safe to call repeatedly */
    start() { return !!worker(); },
    /** the layer's own callback for every new packed frame, however it was triggered */
    onFrame(fn) { onFrame = (typeof fn === 'function') ? fn : null; },

    config(o) { return send('config', o); },
    poll(channel, query) { return send('poll', { channel, query }); },
    filter(f) { return send('filter', { filter: f }); },
    select(hex) { return send('select', { hex }); },
    lift(on) { return send('lift', { on: !!on }); },
    repack() { return send('repack'); },
    search(q, limit) { return send('search', { q, limit }); },
    detail(hex) { return send('detail', { hex }); },
    track(hex) { return send('track', { hex }); },
    stats() { return send('stats'); },

    stop() {
      try { if (w) w.terminate(); } catch (_) { }
      w = null; tried = false;
      pend.forEach((p) => { try { p.rej(new Error('aviation worker stopped')); } catch (_) { } });
      pend.clear();
    },
  };
})();
