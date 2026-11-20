/* ============================================================================
 *  IntMap · THE PAGE'S SIDE OF THE BUFFER WORKER  (gis-buffer-worker)
 * ----------------------------------------------------------------------------
 *  src/gis-buffer-worker.js runs js/gis-geometry.js's buffer; this starts one worker per lane and matches
 *  replies to blocks. It lives in src/ because `new URL(…, import.meta.url)` is what lets the bundler emit and
 *  fingerprint the worker (the reason src/dem-worker-client.js is here). js/gis-ops.js reaches it by a lazy
 *  import, so it costs the start-up nothing.
 *  ⚠ A WORKER HOLDS ONE BLOCK AND AN ABORT ENDS THE THREAD — the same rule as js/gis-worker.js: a synchronous
 *  buffer cannot be asked to stop, so a reader's cancel is `terminate()`.
 *  ⚠ NOTHING HERE DECIDES AN ANSWER. A block that could not be carried comes back as {ok:false, why} and the
 *  caller computes it on the page, with the same kernel.
 * ==========================================================================*/
export function bufferPool(lanes) {
  const slots = [];
  let dead = null;
  function spawn() {
    if (typeof Worker !== 'function') return null;
    try { return new Worker(new URL('./gis-buffer-worker.js', import.meta.url), { type: 'module' }); } catch (_) { return null; }
  }
  const n = Math.max(1, Math.floor(lanes) || 1);
  for (let i = 0; i < n; i++) slots.push({ w: null, busy: false, has: null });

  function take() {
    for (const s of slots) if (!s.busy) { s.busy = true; return s; }
    return null;
  }
  let seq = 0;
  /* → Promise<{ok:true, results} | {ok:false, why, message?}>. One block per call; the caller keeps at most
     `lanes` in the air, so `take()` always finds a slot. */
  function run(geometries, radiusKm, steps, signal, pack) {
    if (dead) return Promise.resolve({ ok: false, why: dead });
    const s = take();
    if (!s) return Promise.resolve({ ok: false, why: 'no-free-lane' });
    if (!s.w) s.w = spawn();
    if (!s.w) { s.busy = false; dead = 'worker-unavailable'; return Promise.resolve({ ok: false, why: dead }); }
    const w = s.w, id = ++seq;
    return new Promise((resolve) => {
      let done = false;
      const finish = (r, retire) => {
        if (done) return; done = true;
        if (signal) { try { signal.removeEventListener('abort', onAbort); } catch (_) { } }
        if (retire) { try { w.terminate(); } catch (_) { } s.w = null; s.has = null; }
        s.busy = false;
        resolve(r);
      };
      const onAbort = () => finish({ ok: false, why: 'aborted' }, true);
      w.onmessage = (ev) => {
        const m = ev.data || {};
        if (m.id !== id) return;
        if (m.ok) finish(m.packed ? { ok: true, packed: m.packed, fails: m.fails || {} } : { ok: true, results: m.results }, false);
        else finish({ ok: false, why: m.why || 'worker-answered-nothing', message: m.message || null }, true);
      };
      w.onerror = (ev) => { dead = 'worker-died'; finish({ ok: false, why: 'worker-died', message: String((ev && ev.message) || '') }, true); };
      if (signal) { if (signal.aborted) return onAbort(); try { signal.addEventListener('abort', onAbort, { once: true }); } catch (_) { } }
      try { w.postMessage({ id, geometries, radiusKm, steps, pack: !!pack }); }
      catch (e) { finish({ ok: false, why: 'worker-post-failed', message: String((e && e.message) || e) }, true); }
    });
  }
  /* (gis-worker-columnar) One block of a spatial join's pairs. `job` = { rightsKey, rights (packed; sent only to a lane that
     does not hold this key), lefts (packed), candOff, candIdx, predicate, maxKm }. The lane keeps the right-hand set, so a
     join of many blocks sends it once per lane. A lane that answers `rights-missing` (its thread was replaced) is a failed block: the lefts were transferred, so the page computes the block itself with the same kernel. */
  function relate(job, signal) {
    if (dead) return Promise.resolve({ ok: false, why: dead });
    const s = take();
    if (!s) return Promise.resolve({ ok: false, why: 'no-free-lane' });
    if (!s.w) { s.w = spawn(); s.has = null; }
    if (!s.w) { s.busy = false; dead = 'worker-unavailable'; return Promise.resolve({ ok: false, why: dead }); }
    const w = s.w, id = ++seq;
    return new Promise((resolve) => {
      let done = false;
      const finish = (r, retire) => {
        if (done) return; done = true;
        if (signal) { try { signal.removeEventListener('abort', onAbort); } catch (_) { } }
        if (retire) { try { w.terminate(); } catch (_) { } s.w = null; s.has = null; }
        s.busy = false;
        resolve(r);
      };
      const onAbort = () => finish({ ok: false, why: 'aborted' }, true);
      const send = (withRights) => {
        const q = { rightsKey: job.rightsKey, lefts: job.lefts, candOff: job.candOff, candIdx: job.candIdx, predicate: job.predicate, maxKm: job.maxKm };
        const tr = [job.lefts.type.buffer, job.lefts.parts.buffer, job.lefts.xy.buffer, job.candOff.buffer, job.candIdx.buffer];
        if (withRights) q.rights = job.rights;   /* cloned, never transferred: the next lane needs it too */
        w.postMessage({ id, relate: q }, tr);
      };
      w.onmessage = (ev) => {
        const m = ev.data || {};
        if (m.id !== id) return;
        if (m.ok) { s.has = job.rightsKey; finish({ ok: true, relate: m.relate }, false); }
        else finish({ ok: false, why: m.why || 'worker-answered-nothing', message: m.message || null }, true);
      };
      w.onerror = (ev) => { dead = 'worker-died'; finish({ ok: false, why: 'worker-died', message: String((ev && ev.message) || '') }, true); };
      if (signal) { if (signal.aborted) return onAbort(); try { signal.addEventListener('abort', onAbort, { once: true }); } catch (_) { } }
      try { send(s.has !== job.rightsKey); }
      catch (e) { finish({ ok: false, why: 'worker-post-failed', message: String((e && e.message) || e) }, true); }
    });
  }
  function close() { for (const s of slots) { if (s.w) { try { s.w.terminate(); } catch (_) { } s.w = null; } } }
  return { run, relate, close, lanes: n };
}
