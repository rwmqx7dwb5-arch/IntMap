/* ============================================================================
 *  IntMap · THE PROJECT — window.IntMapGisProject   (#R729)
 * ----------------------------------------------------------------------------
 *  「さっきの作業の続きから」 had no answer for anything the reader MADE.
 *
 *  js/session-tabs.js already brings a reload back to the same VIEW: which layers are ticked, which
 *  tab is open, which base map, where the master clock stands. What it does not carry — because it
 *  is not its subject — is the data itself. A CSV the reader dropped, and the buffer / clip / join
 *  they ran on it, lived only in js/gis-datasets.js's Map, which is memory: one reload and the file
 *  had to be dropped again and every step re-run by hand, in the right order, from recollection.
 *
 *  ══ WHAT IS SAVED, AND WHAT IS DELIBERATELY NOT ═══════════════════════════════════════════════
 *  SAVED — one record per project, holding the datasets in LINEAGE ORDER (inputs before the things
 *  made from them), each as one of two shapes:
 *
 *    · a BODY  — everything that is not an op (`provenance.kind !== 'op'`): the features verbatim,
 *      plus title, sourceCrs and the provenance that arrived. An import has no recipe — the bytes
 *      ARE the origin — so the only way to have it back is to hold it.
 *    · a STEP  — an op (`provenance.kind === 'op'`): `{op, inputs, params}` and nothing else. ⚠ THE
 *      RESULT IS NOT SAVED. It is derivable from the recipe, and saving it would create the one
 *      state this whole file exists to prevent: an input that changed and an output that did not,
 *      sitting next to each other, both looking equally current. Holding the recipe also costs a few
 *      hundred bytes where holding the geometry costs megabytes, but that is the smaller reason.
 *
 *  NOT SAVED — the base map, the camera, the tab, the clock, which layers are ticked. Those are
 *  js/session-tabs.js's, they are already restored on every load, and writing them here as well
 *  would put ONE FACT IN TWO PLACES: the two copies would disagree the first time a reader saved a
 *  project, moved the map, and reloaded, and nothing in the program could say which one was meant.
 *  A project is 「何を持っていて、そこから何を作ったか」. Where you were looking is not part of it.
 *
 *  ══ WHY IndexedDB AND NOT localStorage ════════════════════════════════════════════════════════
 *  Features are the payload. A dropped shapefile of a country's roads is several megabytes of JSON;
 *  localStorage is a SYNCHRONOUS ~5 MB string store shared with every other key the app writes, so
 *  it would block the main thread for the length of the serialisation and then throw on the first
 *  file that mattered. ⚠ AND WHEN THE STORE IS NOT THERE, NOTHING HERE PRETENDS. A private window
 *  with IndexedDB disabled, or a browser that refuses to open the database, gets
 *  `{ok:false, why:'storage-unavailable'}` and `available() === false` — never a resolved save that
 *  saved nothing. A reader who is told 「保存しました」 and finds an empty list tomorrow has lost
 *  work; a reader who is told the store is unavailable can export instead.
 *
 *  ══ setParams IS THE POINT OF KEEPING RECIPES ═════════════════════════════════════════════════
 *  「半径 5km を 10km にして計算し直す」 is not a re-import. `setParams(id, {radiusKm:10})` re-runs
 *  the named op with the new parameter and then re-runs EVERYTHING MADE FROM IT, upstream first,
 *  each under its own original id, so the map layer, the query bridge and every later step keep
 *  pointing at the same names and simply see new contents. Recomputation stops at the first failure
 *  and says so: a chain half-rebuilt in silence is a chain whose later halves are quietly stale.
 *
 *  ⚠ AND A FAILURE NOW LEAVES THE CHAIN WHERE IT WAS, MARKED (#R732). Two things were wrong before:
 *  the step that failed had already been REMOVED to free its id, so a radius the op refuses deleted
 *  the dataset the reader was editing; and the steps below it were never touched at all, so they
 *  sat holding the answer to the OLD parameters with nothing saying so — the panel listed them, the
 *  map drew them and the next op consumed them. So each step holds its old record until the new one
 *  commits, and everything from the failure downwards is marked `stale` in js/gis-datasets.js —
 *  which js/gis-ops.js then REFUSES as an input (`input-stale`), because a state nothing inspects
 *  is a decoration. The features are kept rather than deleted: the last answer that was actually
 *  computed is worth more to a reader than an empty panel, as long as everything says what it is.
 *
 *  ══ EVERY `why` THIS FILE CAN RETURN ══════════════════════════════════════════════════════════
 *    storage-unavailable  IndexedDB is absent, disabled, or would not open.
 *    registry-missing     window.IntMapData is not present, so there is nothing to read or restore into.
 *                         ⚠ (#R729) SPELT THE WAY js/gis-ops.js SPELLS IT. Two spellings of one fact
 *                         are two facts to the panel: the second one reaches a reader with no sentence.
 *    nothing-to-save      save() was called with no datasets registered.
 *    not-found            load()/remove() named a project id that is not in the store.
 *    read-failed          the IndexedDB read transaction failed (detail carries the error).
 *    write-failed         the IndexedDB write transaction failed, quota included (detail carries it).
 *    add-failed           restoring a saved body was refused by IntMapData.add (detail carries it).
 *    ops-unavailable      a step has to be re-run but window.IntMapGisOps is not loaded.
 *    op-failed            IntMapGisOps.run said no without naming a reason.
 *    upstream-failed      this step was NOT run because an earlier step in its chain failed.
 *    not-an-op            setParams named a dataset that has no recipe (an import has no parameters).
 *    no-such-dataset      setParams named an id that is not registered.
 *    cycle                the dependency graph reached itself; no order exists, so nothing was run.
 *  ⚠ `failed[].why` may ALSO carry a code that came straight out of window.IntMapGisOps — the reason
 *  an op refused belongs to the op, and rewriting it here as a generic 'op-failed' would throw away
 *  the only sentence that tells the reader what to change.
 * ==========================================================================*/

export function makeGisProject() {
  return (function () {

    const DB_NAME = 'intmap-gis', STORE = 'projects', DB_VERSION = 1;
    const RECORD_VERSION = 1;

    /* `dead` is set only when the environment HAS NO IndexedDB at all (Node, a browser with it
       switched off). A transaction that failed once does not set it: the disk being full this
       minute is not the same claim as the store not existing. */
    let dbp = null, dead = false;

    function idbGlobal() {
      try {
        if (typeof indexedDB !== 'undefined' && indexedDB) return indexedDB;
        if (typeof window !== 'undefined' && window && window.indexedDB) return window.indexedDB;
      } catch (_) { }
      return null;
    }

    function open() {
      if (dead) return Promise.resolve(null);
      if (dbp) return dbp;
      dbp = new Promise((res) => {
        const g = idbGlobal();
        if (!g) { dead = true; return res(null); }
        let rq;
        try { rq = g.open(DB_NAME, DB_VERSION); } catch (_) { dbp = null; return res(null); }
        rq.onupgradeneeded = () => {
          try {
            const db = rq.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
          } catch (_) { }
        };
        rq.onsuccess = () => res(rq.result);
        /* Not `dead`: let the next call try again. A blocked open usually means another tab is
           holding an older version, which ends when that tab does. */
        rq.onerror = () => { dbp = null; res(null); };
        rq.onblocked = () => { dbp = null; res(null); };
      });
      return dbp;
    }

    function errText(e) {
      if (!e) return null;
      const name = e.name ? String(e.name) : '';
      const msg = e.message ? String(e.message) : String(e);
      return name ? (name + ': ' + msg) : msg;
    }

    /* One door to a transaction. `fn(store, done)` issues its requests and calls done(value) with
       whatever the caller wants back; the promise settles on the TRANSACTION, not on the request, so
       a write is only reported as ok once it has actually committed. */
    function withStore(mode, fn) {
      return open().then((db) => {
        if (!db) return { ok: false, why: 'storage-unavailable' };
        const why = (mode === 'readwrite') ? 'write-failed' : 'read-failed';
        return new Promise((res) => {
          let value = null, settled = false;
          const finish = (r) => { if (!settled) { settled = true; res(r); } };
          let tx;
          try { tx = db.transaction(STORE, mode); } catch (e) { return finish({ ok: false, why, detail: errText(e) }); }
          tx.oncomplete = () => finish({ ok: true, value });
          tx.onerror = () => finish({ ok: false, why, detail: errText(tx.error) });
          tx.onabort = () => finish({ ok: false, why, detail: errText(tx.error) });
          try { fn(tx.objectStore(STORE), (v) => { value = v; }); }
          catch (e) { try { tx.abort(); } catch (_) { } finish({ ok: false, why, detail: errText(e) }); }
        });
      });
    }

    /* ── the two neighbours, resolved at CALL time ──────────────────────────────────────────────
       Never captured when this factory ran: js/gis-ops.js may register itself after this module is
       constructed, and a captured `undefined` would make every op look permanently unavailable. */
    function registry() { try { return (typeof window !== 'undefined' && window && window.IntMapData) || null; } catch (_) { return null; } }
    function ops() { try { return (typeof window !== 'undefined' && window && window.IntMapGisOps) || null; } catch (_) { return null; } }

    /* ── save ──────────────────────────────────────────────────────────────────────────────────
       The order is the whole reason lineage() exists: a saved list in registration order would put
       an op before the import it consumes on any project where the reader re-imported something
       late, and load() would then fail on a step whose input did not exist yet. */
    function orderedDatasets(reg) {
      const seen = new Set(), out = [];
      for (const rec of reg.list()) {
        for (const up of reg.lineage(rec.id)) {
          if (seen.has(up.id)) continue;
          seen.add(up.id);
          out.push(up);
        }
      }
      return out;
    }

    function stepFor(rec) {
      const prov = rec.provenance || { kind: 'unknown' };
      const base = { id: rec.id, title: rec.title || rec.id, sourceCrs: rec.sourceCrs || null };
      if (prov.kind === 'op') {
        return Object.assign(base, {
          kind: 'op',
          op: prov.op || null,
          inputs: Array.isArray(prov.inputs) ? prov.inputs.slice() : [],
          params: prov.params ? JSON.parse(JSON.stringify(prov.params)) : {},
        });
      }
      /* ⚠ A RASTER BODY HOLDS SAMPLES, AND rec.features() DOES NOT EXIST ON IT (#R735). Without this
         arm the first project containing an imported grid would have thrown inside save() and come
         back as `read-failed` — a file the reader had opened, reported as an unreadable registry.
         A raster made BY an op does not come here: its provenance is a recipe, which the arm above
         saves and load() replays, so the megabytes are stored only for the grid nothing can rebuild.
         The samples go in as the typed arrays they are; IndexedDB stores them by structured clone,
         which keeps them binary instead of turning every pixel into digits. */
      if (rec.kind === 'raster') {
        const bands = Array.isArray(rec.bands) ? rec.bands : [];
        return Object.assign(base, {
          kind: 'raster-body',
          provenance: JSON.parse(JSON.stringify(prov)),
          time: rec.time ? JSON.parse(JSON.stringify(rec.time)) : null,
          width: rec.width, height: rec.height,
          grid: Object.assign({}, rec.grid),
          bands: JSON.parse(JSON.stringify(bands)),
          samples: bands.map((_, i) => rec.read(i)),
        });
      }
      /* Anything that is not an op is a body — an import, and also the `unknown` provenance a
         built-in record carries. Neither can be re-run, so the features go in and the provenance is
         carried verbatim rather than being re-labelled as an import it was not. */
      return Object.assign(base, {
        kind: 'body',
        provenance: JSON.parse(JSON.stringify(prov)),
        /* ⚠ (#R735) THE TIME DECLARATION IS PART OF THE BODY. It was measured once, when the file
           was read — a GPX track's per-fix axis is a property of those bytes — and a reload that
           dropped it would bring the features back with `time:null`, which says 「この記録は時刻を
           述べていない」 about a file that does. It is re-verified on the way in, so a saved
           declaration cannot outlive the features it describes. */
        time: rec.time ? JSON.parse(JSON.stringify(rec.time)) : null,
        features: rec.features(),
      });
    }

    /* The reader is shown a size, so a real one is measured. It costs one serialisation pass over
       the features; IndexedDB stores the object by structured clone and never reports a size, and a
       guessed number next to a real filename is worse than no number. */
    function byteSize(obj) {
      let s;
      try { s = JSON.stringify(obj); } catch (_) { return null; }
      if (typeof s !== 'string') return null;
      try { if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length; } catch (_) { }
      return s.length;
    }

    /* ⚠ SAMPLES ARE MEASURED, NOT SERIALISED (#R735). JSON.stringify of a Float64Array is not a
       number list — it is `{"0":…,"1":…}`, one key per pixel — so asking byteSize about a 4,000 × 4,000
       grid would build a string of several hundred megabytes to report a size, on the main thread,
       for a number the reader glances at. The binary length IS the size IndexedDB stores, so it is
       taken from the buffer and the rest of the record is measured as text. */
    function recordBytes(rec) {
      let binary = 0;
      const steps = (rec && rec.steps) || [];
      const light = steps.map((st) => {
        if (st.kind !== 'raster-body') return st;
        for (const arr of (st.samples || [])) {
          if (arr && typeof arr.byteLength === 'number') binary += arr.byteLength;
          else if (Array.isArray(arr)) binary += arr.length * 8;
        }
        const copy = Object.assign({}, st);
        delete copy.samples;
        return copy;
      });
      const text = byteSize(Object.assign({}, rec, { steps: light }));
      return (text == null) ? null : text + binary;
    }

    function newId() {
      return 'prj-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    function save(name) {
      const reg = registry();
      if (!reg) return Promise.resolve({ ok: false, why: 'registry-missing' });
      if (!available()) return Promise.resolve({ ok: false, why: 'storage-unavailable' });
      let steps;
      try { steps = orderedDatasets(reg).map(stepFor); }
      catch (e) { return Promise.resolve({ ok: false, why: 'read-failed', detail: errText(e) }); }
      if (!steps.length) return Promise.resolve({ ok: false, why: 'nothing-to-save' });
      const rec = {
        id: newId(),
        version: RECORD_VERSION,
        name: String(name == null || name === '' ? 'project' : name),
        savedAt: Date.now(),
        datasets: steps.length,
        steps,
      };
      const bytes = recordBytes(rec);
      return withStore('readwrite', (st) => { st.put(rec); }).then((r) => {
        if (!r.ok) return r;
        return { ok: true, id: rec.id, datasets: rec.datasets, bytes };
      });
    }

    /* ── list / remove ─────────────────────────────────────────────────────────────────────────
       ⚠ IndexedDB cannot read PART of a value, so listing does read every saved body off the disk.
       The cursor keeps one record alive at a time and copies four fields out of it, so the peak
       cost is the largest single project rather than the sum of all of them; getAll() would hold
       every project's features in memory at once to answer a question about their names. */
    function list() {
      if (!available()) return Promise.resolve([]);
      return withStore('readonly', (st, done) => {
        const out = [];
        const rq = st.openCursor();
        rq.onsuccess = () => {
          const c = rq.result;
          if (!c) return done(out);
          const v = c.value || {};
          out.push({
            id: v.id,
            name: v.name || v.id,
            savedAt: v.savedAt || 0,
            datasets: (typeof v.datasets === 'number') ? v.datasets : ((v.steps && v.steps.length) || 0),
          });
          c.continue();
        };
      }).then((r) => {
        if (!r.ok || !Array.isArray(r.value)) return [];
        /* newest first: 「最後に保存したもの」 is the one the reader means by default */
        return r.value.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      });
    }

    function readOne(id) {
      return withStore('readonly', (st, done) => {
        const rq = st.get(id);
        rq.onsuccess = () => done(rq.result || null);
      });
    }

    function readLatest() {
      return withStore('readonly', (st, done) => {
        let best = null;
        const rq = st.openCursor();
        rq.onsuccess = () => {
          const c = rq.result;
          if (!c) return done(best);
          const v = c.value;
          if (v && (!best || (v.savedAt || 0) > (best.savedAt || 0))) best = v;
          c.continue();
        };
      });
    }

    function remove(id) {
      if (!available()) return Promise.resolve({ ok: false, why: 'storage-unavailable' });
      return readOne(id).then((r) => {
        if (!r.ok) return r;
        if (!r.value) return { ok: false, why: 'not-found' };
        return withStore('readwrite', (st) => { st.delete(id); }).then((w) => (w.ok ? { ok: true } : w));
      });
    }

    /* ── load ──────────────────────────────────────────────────────────────────────────────────
       Steps are replayed in the saved order. A step that fails does NOT stop the rest — a project
       whose third op needs a capability this build does not have should still give the reader back
       the two imports and everything else — but every failure is named, and `ok` is false whenever
       there is one. A resolved `ok:true` here means the whole project is back. */
    function restoreStep(reg, step, opts) {
      if (step.kind === 'op') {
        const O = ops();
        if (!O || typeof O.run !== 'function') return Promise.resolve({ ok: false, why: 'ops-unavailable' });
        try { reg.remove(step.id); } catch (_) { }
        return Promise.resolve(O.run({
          id: step.id, op: step.op, inputs: step.inputs || [], params: step.params || {}, title: step.title,
        }, opts || null)).then((res) => {
          if (res && res.ok) return { ok: true };
          return { ok: false, why: (res && res.why) || 'op-failed', detail: res && res.detail };
        }, (e) => ({ ok: false, why: 'op-failed', detail: errText(e) }));
      }
      try { reg.remove(step.id); } catch (_) { }
      try {
        if (step.kind === 'raster-body') {
          const samples = Array.isArray(step.samples) ? step.samples : [];
          reg.add({
            kind: 'raster',
            id: step.id,
            title: step.title,
            sourceCrs: step.sourceCrs || null,
            provenance: step.provenance || { kind: 'unknown' },
            time: step.time || null,
            width: step.width, height: step.height, grid: step.grid,
            bands: Array.isArray(step.bands) ? step.bands : [],
            /* The stored arrays are handed back as they are. ⚠ A band whose samples did not survive
               the round trip is answered with an EMPTY array rather than a zero-filled grid: zeroes
               are a reading, and js/gis-raster.js would report them as elevations of exactly 0 m. */
            read: (i) => (samples[i] || []),
          });
          return Promise.resolve({ ok: true });
        }
        reg.add({
          id: step.id,
          title: step.title,
          features: Array.isArray(step.features) ? step.features : [],
          sourceCrs: step.sourceCrs || null,
          provenance: step.provenance || { kind: 'unknown' },
          time: step.time || null,
        });
        return Promise.resolve({ ok: true });
      } catch (e) {
        return Promise.resolve({ ok: false, why: 'add-failed', detail: errText(e) });
      }
    }

    /* `opts` is `{signal, onProgress}`, for the same reason setParams takes one (#R738): a saved
       project's ops are re-RUN on load, so opening a project with a heavy chain in it holds the thread
       exactly as changing a parameter does. ⚠ A cancelled load stops replaying and says so; what was
       already restored stays, because those records are complete — a half-restored project that threw
       its own restored steps away would answer the reader's stop with a bigger loss than the wait. */
    function load(id, opts) {
      const reg = registry();
      if (!reg) return Promise.resolve({ ok: false, why: 'registry-missing', restored: 0, failed: [] });
      if (!available()) return Promise.resolve({ ok: false, why: 'storage-unavailable', restored: 0, failed: [] });
      const read = (id == null || id === '') ? readLatest() : readOne(id);
      return read.then((r) => {
        if (!r.ok) return Object.assign({ restored: 0, failed: [] }, r);
        const rec = r.value;
        if (!rec || !Array.isArray(rec.steps)) return { ok: false, why: 'not-found', restored: 0, failed: [] };
        const failed = [];
        let restored = 0;
        const sig = (opts && opts.signal) || null;
        const onp = (opts && typeof opts.onProgress === 'function') ? opts.onProgress : null;
        const steps = rec.steps.length;
        let cancelled = false;
        return rec.steps.reduce((chain, step, i) => chain.then(() => {
          /* ⚠ EVERY REMAINING STEP IS NAMED, not just the one the stop landed on. A caller told only
             「中止しました」 cannot tell the reader which of their saved layers are missing, and the
             steps after a cancel are missing for exactly the same reason as the first. */
          if (sig && sig.aborted) { cancelled = true; failed.push({ id: step.id, why: 'cancelled', detail: { step: i + 1, steps: steps } }); return; }
          if (onp) { try { onp({ step: i + 1, steps: steps, id: step.id, op: step.op || null, done: null, total: null }); } catch (_) { } }
          return restoreStep(reg, step, { signal: sig, onProgress: (inner) => { if (onp) { try { onp({ step: i + 1, steps: steps, id: step.id, op: step.op || null, done: inner.done, total: inner.total }); } catch (_) { } } } }).then((res) => {
            if (res.ok) restored++;
            else failed.push({ id: step.id, why: res.why, detail: res.detail || null });
          });
        }), Promise.resolve()).then(() => ({ ok: failed.length === 0, id: rec.id, restored, failed, cancelled: cancelled }));
      });
    }

    /* ── setParams ─────────────────────────────────────────────────────────────────────────────
       The affected set is the target plus everything reachable through dependents(). It is ordered
       by Kahn's rule over that subgraph: a node may run once every affected input of it has run.
       ⚠ What is left over when nothing can run is a CYCLE, and a cycle has no correct order, so
       nothing at all is re-run — removing half a ring and rebuilding it would leave the registry in
       a state that depends on which node the reader happened to name. */
    function affectedOrder(reg, rootId) {
      const affected = new Set([rootId]);
      const queue = [rootId];
      while (queue.length) {
        const cur = queue.shift();
        for (const d of reg.dependents(cur)) {
          if (affected.has(d.id)) continue;
          affected.add(d.id);
          queue.push(d.id);
        }
      }
      const done = new Set(), order = [];
      let moved = true;
      while (moved && order.length < affected.size) {
        moved = false;
        for (const id of affected) {
          if (done.has(id)) continue;
          const rec = reg.get(id);
          const inputs = (rec && rec.provenance && rec.provenance.inputs) || [];
          /* only inputs that are THEMSELVES being rebuilt can hold this one back */
          if (inputs.some((i) => affected.has(i) && !done.has(i))) continue;
          done.add(id); order.push(id); moved = true;
        }
      }
      if (order.length !== affected.size) return null;   /* cycle */
      return order;
    }

    /* ⚠ `opts` IS `{signal, onProgress}` AND IT IS NOT DECORATION (#R738). #R735 built the interruptible
       runner in js/gis-ops.js — `run(step, {signal, onProgress})`, yielding by elapsed milliseconds —
       and then NOTHING passed it: the only caller in the whole program that handed over a signal was a
       check. So a reader who changed a radius on a chain over 40,000 polygons got the same frozen tab
       #R735 says it removed, and the stop button the panel could have drawn would have been a control
       with no effect. The same defect this project keeps recording (「完成した配線が通電しているか」)
       — a capability that exists, is tested, is documented, and is reached by no one.

       ⚠ CANCELLING IS NOT UNDOING. Steps that already committed stay committed: their features ARE the
       answer to the new parameters. What the cancel stops is the rest of the chain, and those records
       are marked `stale` exactly as a failure marks them — because 「計算し直していない」 is the same
       fact about them whether the reader stopped it or the op refused. */
    function setParams(datasetId, params, opts) {
      const reg = registry();
      if (!reg) return Promise.resolve({ ok: false, why: 'registry-missing', rebuilt: [], failed: [] });
      const target = reg.get(datasetId);
      if (!target) return Promise.resolve({ ok: false, why: 'no-such-dataset', rebuilt: [], failed: [] });
      if (!target.provenance || target.provenance.kind !== 'op') {
        return Promise.resolve({ ok: false, why: 'not-an-op', rebuilt: [], failed: [] });
      }
      const O = ops();
      if (!O || typeof O.run !== 'function') return Promise.resolve({ ok: false, why: 'ops-unavailable', rebuilt: [], failed: [] });
      const order = affectedOrder(reg, datasetId);
      if (!order) return Promise.resolve({ ok: false, why: 'cycle', rebuilt: [], failed: [] });

      /* Every recipe is read BEFORE anything is removed — each rebuild deletes its own record, and a
         downstream recipe read after that deletion would be read off a dataset that no longer
         exists. The named parameters are MERGED over the target's own: setParams(id,{radiusKm:10})
         is 「半径だけ変える」, and a key that was not named keeps the value it had. */
      const plan = order.map((id) => {
        const rec = reg.get(id);
        const p = (rec && rec.provenance) || {};
        const old = p.params ? JSON.parse(JSON.stringify(p.params)) : {};
        return {
          id,
          op: p.op || null,
          inputs: Array.isArray(p.inputs) ? p.inputs.slice() : [],
          title: (rec && rec.title) || id,
          params: (id === datasetId) ? Object.assign(old, params || {}) : old,
        };
      });

      /* ⚠ THE OLD RECORD IS HELD, NOT THROWN AWAY (#R732). A rebuild has to free the id before it
         can re-register under it, and until now a re-run that failed left NOTHING there: the reader
         who typed a radius the op refuses lost the dataset they were editing, and setParams could
         not even be called again to put the value back ('no-such-dataset'). Holding the record
         costs a pointer — features() hands back the same array — and makes each step commit or
         restore rather than commit or vanish. */
      /* ⚠ (#R735) WHAT IS HELD DEPENDS ON WHAT THE RECORD HOLDS. A raster's payload is behind read()
         and it has no features(), so the one-shape snapshot would have THROWN on the first op that
         outputs a grid — turning 「半径を変えて計算し直す」 on a chain with a raster in it into an
         exception, at the exact moment the old record had already been removed. The commit-or-restore
         guarantee #R732 built is only as wide as the shapes this function can hold. */
      function snapshot(id) {
        const rec = reg.get(id);
        if (!rec) return null;
        const base = { id: rec.id, title: rec.title, sourceCrs: rec.sourceCrs || null, provenance: rec.provenance, createdAt: rec.createdAt, time: rec.time || null, stale: rec.stale || null };
        if (rec.kind === 'raster') {
          const bands = Array.isArray(rec.bands) ? rec.bands : [];
          const held = bands.map((_, i) => rec.read(i));
          return Object.assign(base, { kind: 'raster', width: rec.width, height: rec.height, grid: rec.grid, bands: bands, read: (i) => (held[i] || []) });
        }
        return Object.assign(base, { features: rec.features() });
      }
      function restore(snap, why) {
        if (!snap || reg.has(snap.id)) return;
        try {
          if (snap.kind === 'raster') {
            reg.add({ kind: 'raster', id: snap.id, title: snap.title, sourceCrs: snap.sourceCrs, provenance: snap.provenance, createdAt: snap.createdAt, time: snap.time, width: snap.width, height: snap.height, grid: snap.grid, bands: snap.bands, read: snap.read });
          } else {
            reg.add({ id: snap.id, title: snap.title, features: snap.features, sourceCrs: snap.sourceCrs, provenance: snap.provenance, createdAt: snap.createdAt, time: snap.time });
          }
          reg.invalidate(snap.id, why);
        } catch (_) { }
      }

      const rebuilt = [], failed = [];
      let stopped = false;
      /* The chain's own progress, around each op's. A reader watching 「3 / 7 · 12,400 / 40,000」 is
         told two different things — which step, and where inside it — and only the first of those is
         knowable here. ⚠ The inner report is passed through rather than re-counted: js/gis-ops.js
         yields on elapsed time, so the count it reports is the only one that exists. */
      const sig = (opts && opts.signal) || null;
      const onp = (opts && typeof opts.onProgress === 'function') ? opts.onProgress : null;
      const steps = plan.length;
      const report = (i, step, inner) => {
        if (!onp) return;
        try { onp({ step: i + 1, steps: steps, id: step.id, op: step.op, done: inner ? inner.done : null, total: inner ? inner.total : null }); } catch (_) { }
      };
      return plan.reduce((chain, step, i) => chain.then(() => {
        /* ⚠ THE STEPS BELOW A FAILURE ARE NOT MERELY «not re-run». They still hold the output of the
           OLD parameters, and until #R732 nothing in the registry said so: the panel listed them,
           draw() drew them and the next op consumed them, all as if they answered the recipe the
           reader had just changed. Naming them in `failed` told only the caller of setParams; the
           state has to be on the DATASET, because everything else reads the dataset. */
        if (stopped) {
          failed.push({ id: step.id, why: 'upstream-failed', detail: null });
          try { reg.invalidate(step.id, 'upstream-failed'); } catch (_) { }
          return;
        }
        /* ⚠ ASKED BEFORE THE RECORD IS REMOVED. A cancel noticed after the removal would have to put
           the snapshot back to say the same thing; asked here, the record is never disturbed at all,
           and the reader who pressed stop between steps loses nothing that was already there. */
        if (sig && sig.aborted) {
          stopped = true;
          failed.push({ id: step.id, why: 'cancelled', detail: { step: i + 1, steps: steps } });
          try { reg.invalidate(step.id, 'cancelled'); } catch (_) { }
          return;
        }
        report(i, step, null);
        const held = snapshot(step.id);
        try { reg.remove(step.id); } catch (_) { }
        return Promise.resolve(O.run({ id: step.id, op: step.op, inputs: step.inputs, params: step.params, title: step.title },
          { signal: sig, onProgress: (inner) => report(i, step, inner) }))
          .then((res) => {
            if (res && res.ok) { rebuilt.push(step.id); return; }
            stopped = true;
            const why = (res && res.why) || 'op-failed';
            failed.push({ id: step.id, why: why, detail: (res && res.detail) || null });
            /* Put back what was there and say why it is no longer an answer to its own recipe. */
            restore(held, why);
          }, (e) => {
            stopped = true;
            failed.push({ id: step.id, why: 'op-failed', detail: errText(e) });
            restore(held, 'op-failed');
          });
      }), Promise.resolve()).then(() => ({ ok: failed.length === 0, rebuilt, failed }));
    }

    /* Sync, so a panel can grey a button out before any promise. It answers the question it can
       answer without I/O — «is there an IndexedDB here at all» — and every method re-checks by
       actually opening, because a store that exists can still refuse. */
    function available() {
      if (dead) return false;
      return !!idbGlobal();
    }

    const API = {
      save, load, list, remove, setParams, available,
      /* named so a test or a panel can talk about the store without re-deriving the strings */
      dbName: DB_NAME, storeName: STORE, recordVersion: RECORD_VERSION,
    };
    try { window.IntMapGisProject = API; } catch (_) { }
    return API;
  })();
}
