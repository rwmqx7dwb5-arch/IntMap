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
 *
 *  ══ #R749 — 「続きから」 と 「同じ結果」 は別の要求で、片方ずつ欠けていた ══════════════════════
 *  ⚠ A BODY NOW CARRIES THE READER'S DECLARATIONS (`declarations`). 「この列は人数か、人口密度か」
 *  「単位は m か km か」 is not an edit and not a keystroke — it is what the data MEANS, stated by the
 *  reader, and nothing in the program can re-derive it. It lived in js/gis-datasets.js beside the undo
 *  stack, so it had the undo stack's lifetime and a reload silently dropped it while keeping the
 *  edited values. It is put back through `restoreDeclarations`, which RE-VERIFIES each one against the
 *  features that actually came back: a saved declaration copied in blind would restate `number` over
 *  cells that are no longer numbers. What no longer holds arrives in `declarationsRefused`, named.
 *
 *  ⚠ A STEP IS A RECIPE, AND A RECIPE IS AN ANSWER ONLY TOGETHER WITH WHAT RUNS IT (`engine`). #R743
 *  corrected `union` and the pre-filter of the distance search — THE ANSWERS THEMSELVES — so a project
 *  saved before it and re-run after it produces different numbers under the same parameters. Nothing
 *  in the record, and nothing on the screen, said so. Each op step now records the version its kernels
 *  stated, and load() reports the comparison in THREE states, never two:
 *      engineChanged[]   both versions are known and they differ — the same recipe, a different answer
 *      engineUnknown[]   one of them is null: an old record, or a build whose kernels do not state one
 *      (neither)         both known and equal
 *  ⚠ 「測れなかった」 IS NOT 「同じ」. A record written before this field existed has no version in it,
 *  and putting today's version there on the way in would be the program inventing a statement nobody
 *  made — the shape .agents/rules/historical-verification.md §2-3 names.
 *  ⚠ AND IT DOES NOT STOP THE LOAD. Refusing to open a project because the kernel moved would cost the
 *  reader their work to tell them something they can only act on once they have it back.
 *
 *  ══ #R819 — 「正しく計算し直す」と「正しく使い回す」を両立させる ═══════════════════════════════
 *  ⚠ NOTHING ABOVE CHANGES. The recipe is still the only thing written to disk, `stale` is still what
 *  a failed rebuild leaves behind, and a load with no cache runs exactly the calls it ran before.
 *  What is added (see CACHE_KEY_VERSION, far below) is a MEMORY OF ONE RUN, held in this tab's memory
 *  and keyed by every condition that produced it: the inputs' CONTENT (sha256 of the payload, never a
 *  timestamp), what those inputs declare, which upstream they came from, the parameters, and the
 *  kernels' versions. All five equal, or there is no reuse — and an engine that cannot be measured
 *  gets no key at all, because compareEngine's 「測れなかった」 is not 「同じ」.
 *  ⚠ AND A REUSED RECORD IS COMPARED, WHOLE, AGAINST THE DESCRIPTION OF THE ONE THE OP PRODUCED. A
 *  disagreement between recipe and memory cannot be lived with quietly: the entry is dropped and the
 *  kernel runs. 「食い違いうる設計なら作らない」 — this is how that is met, by measurement.
 * ==========================================================================*/

export function makeGisProject() {
  return (function () {

    const DB_NAME = 'intmap-gis', STORE = 'projects', DB_VERSION = 1;
    /* ⚠ THE RECORD VERSION IS RAISED, AND THE OLD ONE IS STILL READ (#R749: 1 → 2, for `engine` on a
       step and `declarations` on a body). A project the reader saved last week is their work; the two
       new fields are ABSENT from it, and absent is answered as null — not as today's value. See
       compareEngine and restoreDecls. */
    const RECORD_VERSION = 2;

    /* (#R765) manifest() が書く文書の版。読み手が「この形を知っているか」を判断できるように。
       ⚠ (#R783) 1 → 2。`steps[].trace` / `steps[].provenance` / `environment` / `traceability` が
       増えた。古い版の文書は今でも verify() が読む——版を上げることは、前の形を拒むことではない。 */
    const MANIFEST_VERSION = 2;

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
    /* (#R752) The geometry accessor that stood here is gone — not because the kernel stopped
       mattering, but because engineNow() no longer names kernels one at a time. Nothing else in this
       file called it. */

    /* ── which implementation computed this (#R749) ─────────────────────────────────────────────
       ⚠ THE VERSION IS NOT WRITTEN IN THIS FILE, IT IS ASKED OF THE KERNEL. js/gis-ops.js and
       js/gis-geometry.js each state their own; a number copied here would be a second place to keep
       correct, and the first release that forgot it would make this file report 「同じ」 about a
       kernel that had changed.
       ⚠ A MODULE THAT DOES NOT ANSWER GIVES null, AND null IS NOT A VERSION. A build where the ops
       are not loaded yet, or an older kernel with no version(), is 「測れなかった」 — the guard is here
       so that state is REACHED rather than crashed into, and compareEngine is what stops it being
       reported as agreement. */
    function askVersion(mod) {
      try {
        if (!mod || typeof mod.version !== 'function') return null;
        const v = mod.version();
        return (v == null || v === '') ? null : String(v);
      } catch (_) { return null; }
    }
    /* ⚠ (#R752) THIS USED TO BE `{ ops: …, geometry: … }` — TWO KERNELS, WRITTEN BY HAND. The note
       above it was already right that a number copied here is a second place to keep correct; what
       nobody noticed is that THE LIST OF WHICH KERNELS TO ASK was itself such a copy, and it was
       wrong on the day it was written. #R749 introduced js/gis-raster.js and js/gis-warp.js in the
       same round that introduced this record, and neither has ever been asked: a project whose step
       resampled a grid with bilinear replays today through whatever bilinear means today, and
       `engineChanged` says nothing. The same holds for js/gis-expr.js (what `compute` computes) and
       js/gis-index.js — #R743 measured the spatial prefilter DISCARDING TRUE PAIRS, which is an
       answer changing, not an optimisation.
       ⚠ SO THE SET IS DISCOVERED, NOT LISTED. A kernel is 「version() を述べる IntMapGis* の module」
       — a fact about the module rather than a name in this file — so a kernel mounted tomorrow is
       recorded the day it declares a version, and one that forgets to declare is caught by the gate
       in scripts/gis-kernel-versions.mjs rather than by somebody remembering this line.
       ⚠ THE PREFIX IS THE WHOLE TEST, DELIBERATELY. Asking `window` for everything that happens to
       have a version() would record the renderer's. */
    const KERNEL_GLOBAL = /^IntMapGis([A-Z].*)$/;

    /* IntMapGisOps → 'ops'. ⚠ The spelling MUST NOT MOVE: it is the key inside records readers saved
       before this round, and a renamed part reads as 「保存には在ったが今は測れない」 for every old
       project at once. */
    function partName(global) {
      const m = KERNEL_GLOBAL.exec(global);
      return m ? (m[1].charAt(0).toLowerCase() + m[1].slice(1)) : null;
    }

    function kernelGlobals() {
      try {
        if (typeof window === 'undefined' || !window) return [];
        return Object.keys(window).filter((k) => KERNEL_GLOBAL.test(k)).sort();
      } catch (_) { return []; }
    }

    function engineNow() {
      const out = {};
      for (const g of kernelGlobals()) {
        let mod = null;
        try { mod = window[g]; } catch (_) { mod = null; }
        /* A module without version() is not a kernel that failed to answer — it is not a kernel.
           js/gis-panel.js draws; js/gis-project.js stores; neither changes a number. */
        if (!mod || typeof mod.version !== 'function') continue;
        out[partName(g)] = askVersion(mod);
      }
      return out;
    }

    /* ⚠ THE PARTS TO COMPARE ARE THE UNION OF 「保存に在った」 AND 「いま在る」, never a list. A part
       present in the saved record and absent today must be reported — as 'unknown', which is what
       compareEngine does with null — because 「そのカーネルはもう載っていない」 is a real difference
       between the run that made these numbers and the run replaying them. A hand-written list could
       only ever name the parts somebody thought of. */
    function engineParts(saved, now) {
      const keys = new Set();
      for (const o of [saved, now]) {
        if (o && typeof o === 'object') for (const k of Object.keys(o)) keys.add(k);
      }
      return [...keys].sort();
    }

    function engineCopy(e) {
      if (!e || typeof e !== 'object') return null;
      const out = {};
      for (const k of Object.keys(e).sort()) out[k] = (e[k] == null || e[k] === '') ? null : String(e[k]);
      return out;
    }

    /* 'changed' | 'unknown' | 'same' — three answers, because there are three situations. A part that
       cannot be compared makes the verdict 'unknown' and NEVER 'same'; a part that differs makes it
       'changed', which outranks 'unknown' because a known difference is the stronger statement. */
    function compareEngine(saved, now) {
      let unknown = false, changed = false;
      for (const k of engineParts(saved, now)) {
        const a = saved ? saved[k] : null;
        const b = now ? now[k] : null;
        if (a == null || b == null) { unknown = true; continue; }
        if (a !== b) changed = true;
      }
      return changed ? 'changed' : (unknown ? 'unknown' : 'same');
    }

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

    function stepFor(rec, reg) {
      const prov = rec.provenance || { kind: 'unknown' };
      const base = { id: rec.id, title: rec.title || rec.id, sourceCrs: rec.sourceCrs || null };
      if (prov.kind === 'op') {
        return Object.assign(base, {
          kind: 'op',
          op: prov.op || null,
          inputs: Array.isArray(prov.inputs) ? prov.inputs.slice() : [],
          params: prov.params ? JSON.parse(JSON.stringify(prov.params)) : {},
          /* ⚠ (#R749) THE RECIPE ALONE DOES NOT DETERMINE THE ANSWER. Saved beside the parameters
             because it is the other half of what produced these numbers; null in either part is
             carried as null, so a build that cannot say is not recorded as having agreed. */
          engine: engineNow(),
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
        /* ⚠ (#R749) WHAT THE READER DECLARED THE COLUMNS MEAN. It is not an edit — the edited VALUES
           are already here, in `features` — and it is not derivable from them: no measurement can say
           whether a column of numbers is people or people per km². It was held beside the undo stack
           and therefore had the undo stack's lifetime, which is why a reload used to keep the values
           and lose their meaning. `null` when the registry cannot be asked, which is a different
           record from `{}` 「誰も何も述べていない」. */
        declarations: (reg && typeof reg.declarations === 'function') ? reg.declarations(rec.id) : null,
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
      try { steps = orderedDatasets(reg).map((rec) => stepFor(rec, reg)); }
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
    /* The saved declarations, re-declared. ⚠ EVERY REFUSAL IS CARRIED OUT OF HERE, because that is the
       only way the reader learns that a column they had named is gone or no longer holds the kind of
       value they said it held. Swallowing them would restore a project that quietly means something
       else than it did. A registry with no such door (an older build) is answered with an empty list
       rather than with a pretence that there was nothing to restore. */
    function restoreDecls(reg, step) {
      const d = step && step.declarations;
      if (!d || typeof d !== 'object' || typeof reg.restoreDeclarations !== 'function') return [];
      let r;
      try { r = reg.restoreDeclarations(step.id, d); }
      catch (e) { return [{ field: null, why: 'add-failed', detail: errText(e) }]; }
      if (!r || !r.ok) return [{ field: null, why: (r && r.why) || 'add-failed', detail: (r && r.detail) || null }];
      return Array.isArray(r.refused) ? r.refused : [];
    }

    function restoreStep(reg, step, opts) {
      if (step.kind === 'op') {
        const O = ops();
        if (!O || typeof O.run !== 'function') return Promise.resolve({ ok: false, why: 'ops-unavailable' });
        try { reg.remove(step.id); } catch (_) { }
        /* (#R819) Through runStep, which is O.run plus 「この条件でこの答えは既に計算してある」. With no
           key or no entry it IS O.run, with the same arguments. */
        return runStep({
          id: step.id, op: step.op, inputs: step.inputs || [], params: step.params || {}, title: step.title,
        }, opts || null).then((res) => {
          if (res && res.ok) return { ok: true, fromCache: res.fromCache === true };
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
        /* ⚠ AFTER the record exists, and through the registry's own door: a declaration is verified
           against the features that just came back, not copied over them. */
        return Promise.resolve({ ok: true, declarationsRefused: restoreDecls(reg, step) });
      } catch (e) {
        return Promise.resolve({ ok: false, why: 'add-failed', detail: errText(e) });
      }
    }

    /* `opts` is `{signal, onProgress}`, for the same reason setParams takes one (#R738): a saved
       project's ops are re-RUN on load, so opening a project with a heavy chain in it holds the thread
       exactly as changing a parameter does. ⚠ A cancelled load stops replaying and says so; what was
       already restored stays, because those records are complete — a half-restored project that threw
       its own restored steps away would answer the reader's stop with a bigger loss than the wait. */
    /* One shape for every exit of load(), so a caller never has to ask whether a field is there before
       reading it. ⚠ The lists are EMPTY, which is 「何も無かった」 — the same claim they make when the
       load ran and found nothing to report, and a different claim from a missing key. */
    /* ⚠ (#R819) `reused` IS PART OF THE SHAPE, and it is 「計算し直さずに済んだ段」 — never a claim that
       they were skipped. A reused step is restored under its own id with the answer its own recipe
       produces under conditions that were measured to be the same; it is counted in `restored` exactly
       as a recomputed one is, and named here as well so a reader can see which. */
    function loadShell() { return { restored: 0, reused: [], failed: [], engineChanged: [], engineUnknown: [], declarationsRefused: [], savedVersion: null }; }

    function load(id, opts) {
      const reg = registry();
      if (!reg) return Promise.resolve(Object.assign(loadShell(), { ok: false, why: 'registry-missing' }));
      if (!available()) return Promise.resolve(Object.assign(loadShell(), { ok: false, why: 'storage-unavailable' }));
      const read = (id == null || id === '') ? readLatest() : readOne(id);
      return read.then((r) => {
        if (!r.ok) return Object.assign(loadShell(), r);
        const rec = r.value;
        if (!rec || !Array.isArray(rec.steps)) return Object.assign(loadShell(), { ok: false, why: 'not-found' });
        const failed = [];
        const declarationsRefused = [];
        const reused = [];
        let restored = 0;

        /* ⚠ ASKED OF EVERY SAVED STEP, BEFORE ANY OF THEM RUNS. The question is about the RECIPE — 「この
           段を計算する実装は、保存した日と同じか」 — and it has an answer whether or not the re-run
           succeeds. Deriving it from the rebuilt records instead would lose it for exactly the steps
           that failed, which are the ones a reader is most likely to be asking about. */
        const now = engineNow();
        const engineChanged = [], engineUnknown = [];
        for (const st of rec.steps) {
          if (!st || st.kind !== 'op') continue;
          const saved = engineCopy(st.engine);
          const verdict = compareEngine(saved, now);
          if (verdict === 'same') continue;
          const entry = { id: st.id, op: st.op || null, saved: saved, now: engineCopy(now) };
          (verdict === 'changed' ? engineChanged : engineUnknown).push(entry);
        }
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
            if (res.ok) { restored++; if (res.fromCache) reused.push(step.id); }
            else failed.push({ id: step.id, why: res.why, detail: res.detail || null });
            for (const d of (res.declarationsRefused || [])) declarationsRefused.push(Object.assign({ id: step.id }, d));
          });
        }), Promise.resolve()).then(() => ({
          ok: failed.length === 0, id: rec.id, restored, reused, failed, cancelled: cancelled,
          /* ⚠ THE PROJECT IS BACK AND IT MAY NO LONGER MEAN THE SAME THING. These three are not
             failures — every step above them restored — and they are not decoration either: they are
             the difference between 「開けた」 and 「開けたものが保存した日と同じ」. */
          engineChanged, engineUnknown, declarationsRefused,
          savedVersion: (typeof rec.version === 'number' && isFinite(rec.version)) ? rec.version : null,
        }));
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
      if (!reg) return Promise.resolve({ ok: false, why: 'registry-missing', rebuilt: [], reused: [], failed: [] });
      const target = reg.get(datasetId);
      if (!target) return Promise.resolve({ ok: false, why: 'no-such-dataset', rebuilt: [], reused: [], failed: [] });
      if (!target.provenance || target.provenance.kind !== 'op') {
        return Promise.resolve({ ok: false, why: 'not-an-op', rebuilt: [], reused: [], failed: [] });
      }
      const O = ops();
      if (!O || typeof O.run !== 'function') return Promise.resolve({ ok: false, why: 'ops-unavailable', rebuilt: [], reused: [], failed: [] });
      const order = affectedOrder(reg, datasetId);
      if (!order) return Promise.resolve({ ok: false, why: 'cycle', rebuilt: [], reused: [], failed: [] });

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

      const rebuilt = [], reused = [], failed = [];
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
        /* (#R819) 「半径を 10km に変えて、また 5km に戻す」 is the case this exists for: the second
           change asks a question that was already answered under conditions nothing has moved. Through
           runStep — which is O.run with the same arguments whenever there is no entry to reuse. */
        return runStep({ id: step.id, op: step.op, inputs: step.inputs, params: step.params, title: step.title },
          { signal: sig, onProgress: (inner) => report(i, step, inner) })
          .then((res) => {
            if (res && res.ok) { rebuilt.push(step.id); if (res.fromCache) reused.push(step.id); return; }
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
      }), Promise.resolve()).then(() => ({ ok: failed.length === 0, rebuilt, reused, failed }));
    }

    /* Sync, so a panel can grey a button out before any promise. It answers the question it can
       answer without I/O — «is there an IndexedDB here at all» — and every method re-checks by
       actually opening, because a store that exists can still refuse. */
    function available() {
      if (dead) return false;
      return !!idbGlobal();
    }

    /* ══ ⚠⚠⚠ (#R819) 「再現できること」と「毎回ぜんぶ計算し直すこと」は別のこと ══════════════════════
       THE RECIPE REMAINS THE ORIGINAL. Everything above this line is unchanged in what it BELIEVES: a
       derived dataset is `{op, inputs, params}` and nothing else is written to disk, because a stored
       answer beside a changed input is the one state this file exists to prevent. What is added here
       is not a second source of truth — it is a MEMORY OF ONE RUN, and it may be consulted only when
       every condition that produced that run is measurably the same one.

       ⚠ SO THE ANSWER IS NOT KEYED BY ITS NAME, IT IS KEYED BY ITS CONDITIONS. The key is the sha256
       of, in one canonical document:
         op / params / title   what the reader asked for — the recipe itself, and the title because
                               js/gis-ops.js composes an output title out of its inputs' titles
         inputs[].content      sha256 of each input's PAYLOAD (payloadText → the same canonical form
                               manifest() fingerprints with). ⚠ BYTES, NEVER A TIMESTAMP. 「新しいから
                               同じ」 is [[intmap-deployed-combination-is-unmeasured]] one layer down;
                               `createdAt` is deliberately absent from every part of this key, in both
                               directions — a rebuilt input that came out identical is identical
         inputs[].conditions   what an op reads BESIDES the coordinates: the record's whole description
                               (crs, sourceCrs, the declared time axis, the columns with their units
                               and who stated them, the bands, `stale`) plus the reader's own
                               declarations(). Taken WHOLE from describe() rather than as a list of the
                               fields somebody thought of ([[intmap-discovered-list-is-a-photograph]])
         inputs[].upstream     every non-op ancestor's provenance verbatim — which acquisition, which
                               file, which stated time these bytes are FROM. The content hash already
                               covers what they contain; this states what they are OF, so an entry can
                               never be reused across two different upstream snapshots that happen to
                               have hashed the same
         engine                engineNow() — the kernels, DISCOVERED, exactly as #R749 discovers them
       ⚠ AND THE ENGINE IS ONLY A KEY WHEN IT IS MEASURABLE. compareEngine is the one judgement in this
       file about 「同じエンジンか」, and it is asked here too (`engineKeyable`): a part that states no
       version makes the verdict 'unknown', 「測れなかった」 is not 「同じ」, and an unmeasurable engine
       gets NO KEY AT ALL rather than a key that quietly matches. Nothing is remembered and nothing is
       reused; the run takes the path it takes today, to the letter.

       ⚠ AND A REUSED RECORD IS VERIFIED, NOT TRUSTED. Restoring goes through the registry's own door
       (add()), and the record that comes back is compared — canonically, whole — against the
       description of the record the op actually produced. If they differ in any respect the entry is
       DROPPED and the op runs. That is what makes 「レシピとキャッシュが食い違う」 unreachable rather
       than unlikely: a disagreement cannot survive the moment it would be used.

       ⚠ THIS FILE STILL COMPUTES NOTHING (scripts/gis-kernel-versions.mjs's NOT_A_KERNEL row). The
       cache produces no number; it hands back one a kernel produced, or it steps aside. CACHE_KEY_
       VERSION is the shape of the key material, and raising it can only cause misses. */
    const CACHE_KEY_VERSION = 1;

    /* The budget. ⚠ Observation: a vector op's output in this repository's own checks measures in
       kilobytes, while ONE band of a 4,000 × 4,000 float64 grid is 128 MB — so the ceiling is not a
       count, it is bytes, and an entry larger than the whole budget is never remembered rather than
       evicting everything else to hold it. Expires if the app starts holding payloads of a different
       order (a reader importing national rasters), which is why configure() exists and why these two
       numbers live in ONE place that cache.limits() reports. */
    const cacheLimits = { maxEntries: 24, maxBytes: 48 * 1024 * 1024 };
    const CACHE = new Map();
    let cacheOn = true;
    /* The receipt. Background work that did not run and background work that ran and was refused look
       identical from outside ([[intmap-background-work-needs-a-receipt]]), and 「使われた」「鍵を作れ
       なかった」「食い違ったので捨てた」 are three different things a reader of this module can act on. */
    const cacheLedger = { hits: 0, misses: 0, stored: 0, evicted: 0, unkeyable: 0, mismatched: 0, tooLarge: 0 };

    function deepCopy(v) {
      /* A typed array is not JSON: `JSON.stringify(Float64Array)` is `{"0":…}`, one key per sample. */
      if (ArrayBuffer.isView(v) && typeof v.slice === 'function') return v.slice();
      try { if (typeof structuredClone === 'function') return structuredClone(v); } catch (_) { }
      try { return JSON.parse(JSON.stringify(v)); } catch (_) { return null; }
    }

    /* ⚠ TWO FIELDS ARE LEFT OUT, AND EACH IS NAMED FOR WHAT IT IS A PROPERTY OF. `id` is what the
       answer is CALLED — the same answer under a new name is the same answer, and it is what makes one
       remembered run reusable by a second step that asks the same question. `createdAt` is WHEN THE
       RECORD WAS REGISTERED, which is now, for a record registered now. Everything else in a
       description is a property of the answer and is compared. */
    function stableDescription(desc) {
      if (!desc || typeof desc !== 'object') return null;
      const out = {};
      for (const k of Object.keys(desc)) { if (k === 'id' || k === 'createdAt') continue; out[k] = desc[k]; }
      return out;
    }

    /* What an op reads about an input besides its coordinates. `createdAt` is dropped for the reason
       above; the input's `id` is KEPT, because the recipe names it and the output's provenance records
       it. */
    function conditionsOf(reg, id) {
      const desc = (typeof reg.describe === 'function') ? reg.describe(id) : null;
      if (!desc) return null;
      const record = {};
      for (const k of Object.keys(desc)) { if (k === 'createdAt') continue; record[k] = desc[k]; }
      const declared = (typeof reg.declarations === 'function') ? reg.declarations(id) : null;
      return { record: record, declared: declared };
    }

    /* Which upstream these bytes are OF — every ancestor that is not itself a recipe, verbatim. */
    function upstreamOf(reg, id) {
      if (typeof reg.lineage !== 'function') return null;
      const out = [];
      let chain;
      try { chain = reg.lineage(id) || []; } catch (_) { return null; }
      for (const anc of chain) {
        const p = (anc && anc.provenance) || { kind: 'unknown' };
        if (String(p.kind || '') === 'op') continue;
        let copy = null;
        try { copy = JSON.parse(JSON.stringify(p)); } catch (_) { return null; }
        out.push({ id: anc.id, upstream: copy });
      }
      return out;
    }

    async function inputIdentity(reg, id) {
      const rec = (typeof reg.get === 'function') ? reg.get(id) : null;
      if (!rec) return null;
      const text = payloadText(rec);
      if (text == null) return null;
      const content = await sha256Hex(text);
      if (content == null) return null;                      /* no digest here → no key, no reuse */
      const cond = conditionsOf(reg, id);
      if (!cond) return null;
      const up = upstreamOf(reg, id);
      if (up == null) return null;
      return { id: String(id), content: content, conditions: cond, upstream: up };
    }

    /* ⚠ ASKED THROUGH compareEngine, so this file keeps ONE opinion about what an engine comparison is
       (#R749's three states). A version nobody states makes the verdict 'unknown', and an engine with
       no parts at all is not an engine that agrees — it is a build where nothing said anything. */
    function engineKeyable(e) {
      if (!e || typeof e !== 'object' || !Object.keys(e).length) return false;
      return compareEngine(e, e) === 'same';
    }

    /* `part` is null for 「この段まるごと」. It is a slot rather than a boolean because a step can be
       computed in pieces — a warp writing one window at a time — and a window's result is the answer to
       the SAME conditions plus which window it is. Nothing in this file produces one; the door is here
       so that a producer of partial results keys them against the same five axes instead of inventing a
       sixth vocabulary. */
    /* ⚠ THE FIELD IS `reason`, NOT `why`, AND THE DIFFERENCE IS REAL. Every `why` this file returns is
       a REFUSAL A READER IS SHOWN — the header lists them, and tests/r729-gis-core-checks ④ measures
       that each has a sentence in js/gis-panel.js. 「鍵を作れなかった」 refuses nobody: the run happens
       exactly as it would have, and nothing about it reaches a panel. Spelling it `why` would put five
       codes into the reader-facing vocabulary that no reader can ever be shown, which makes that gate's
       population say something false about what a reader can meet. */
    async function cacheKey(step, part) {
      if (!cacheOn) return { ok: false, reason: 'cache-disabled' };
      const reg = registry();
      if (!reg || typeof reg.get !== 'function') return { ok: false, reason: 'registry-missing' };
      const engine = engineNow();
      if (!engineKeyable(engine)) return { ok: false, reason: 'engine-unmeasurable', detail: engineCopy(engine) };
      const inputs = [];
      for (const id of (Array.isArray(step && step.inputs) ? step.inputs : [])) {
        const ident = await inputIdentity(reg, id);
        if (!ident) return { ok: false, reason: 'input-unmeasurable', detail: { id: (id == null) ? null : String(id) } };
        inputs.push(ident);
      }
      const material = {
        v: CACHE_KEY_VERSION,
        op: (step && step.op != null) ? String(step.op) : null,
        params: (step && step.params && typeof step.params === 'object') ? step.params : {},
        title: (step && step.title != null && String(step.title) !== '') ? String(step.title) : null,
        inputs: inputs,
        engine: engine,
        part: (part === undefined) ? null : part,
      };
      let key = null;
      try { key = await sha256Hex(canonical(material)); } catch (_) { key = null; }
      if (key == null) return { ok: false, reason: 'no-digest' };
      return { ok: true, key: key, engine: engine };
    }

    function payloadBytes(payload) {
      if (!payload) return 0;
      if (payload.kind === 'raster') {
        let bin = 0;
        for (const a of (payload.samples || [])) {
          if (a && typeof a.byteLength === 'number') bin += a.byteLength;
          else if (Array.isArray(a)) bin += a.length * 8;
        }
        return bin + (byteSize({ width: payload.width, height: payload.height, grid: payload.grid, bands: payload.bands }) || 0);
      }
      if (payload.kind === 'value') return byteSize(payload.value) || 0;
      return byteSize(payload.features) || 0;
    }

    /* The payload, COPIED. The registry hands back the array it holds; keeping that reference would let
       anything that edits a record edit the remembered answer with it, and a cache that can be written
       through is not a record of what was computed. */
    function payloadCopy(rec) {
      if (String(rec.kind || 'vector') === 'raster') {
        const bands = Array.isArray(rec.bands) ? rec.bands : [];
        const samples = [];
        for (let i = 0; i < bands.length; i++) {
          let v = null;
          try { v = rec.read(i); } catch (_) { return null; }
          if (!v) return null;
          samples.push(deepCopy(v));
        }
        return { kind: 'raster', width: rec.width, height: rec.height, grid: deepCopy(rec.grid), bands: deepCopy(bands), samples: samples };
      }
      let f = null;
      try { f = rec.features(); } catch (_) { return null; }
      if (!Array.isArray(f)) return null;
      const copy = deepCopy(f);
      return copy ? { kind: 'vector', features: copy } : null;
    }

    function cacheBytesTotal() {
      let n = 0;
      for (const e of CACHE.values()) n += (e.bytes || 0);
      return n;
    }

    /* Least recently USED, and the timestamp orders eviction only — it is never asked whether two
       things are the same. */
    function evict() {
      while (CACHE.size > cacheLimits.maxEntries || cacheBytesTotal() > cacheLimits.maxBytes) {
        let oldestKey = null, oldestAt = Infinity;
        for (const [k, e] of CACHE) { if (e.usedAt < oldestAt) { oldestAt = e.usedAt; oldestKey = k; } }
        if (oldestKey == null) break;
        CACHE.delete(oldestKey);
        cacheLedger.evicted++;
      }
    }

    /* The inverse of js/gis-datasets.js's applyInherited: the unit statements that produced these
       columns, read back off the columns. ⚠ IT IS NOT TRUSTED — if the round trip does not reproduce
       the description exactly, reuse() drops the entry and the op runs. A second opinion about what a
       column states would be a second opinion; a reversal that is CHECKED is a measurement. */
    function statementsFrom(fields) {
      if (!Array.isArray(fields)) return null;
      const out = {};
      for (const f of fields) {
        if (!f || f.unit == null) continue;
        out[f.name] = {
          unit: f.unit,
          unitStated: (f.unitStatedAt != null) ? f.unitStatedAt : ((f.unitStated != null) ? f.unitStated : null),
          unitFrom: (f.unitFrom != null) ? f.unitFrom : null,
        };
      }
      return Object.keys(out).length ? out : null;
    }

    function remember(key, rec, stats, reg) {
      if (!cacheOn || key == null || !rec || !reg) return;
      const payload = payloadCopy(rec);
      if (!payload) return;
      const desc = stableDescription((typeof reg.describe === 'function') ? reg.describe(rec.id) : null);
      if (!desc) return;
      const bytes = payloadBytes(payload);
      if (bytes > cacheLimits.maxBytes) { cacheLedger.tooLarge++; return; }
      const at = Date.now();
      CACHE.delete(key);
      CACHE.set(key, { key: key, kind: payload.kind, payload: payload, describe: desc, stats: (stats == null) ? null : deepCopy(stats), bytes: bytes, at: at, usedAt: at });
      cacheLedger.stored++;
      evict();
    }

    /* Hand back a remembered answer under the caller's id — or nothing, having left the registry as it
       found it. ⚠ THE ID MUST ALREADY BE FREE: both callers remove the old record before they run, and
       this door does not remove anything it did not add. */
    function reuse(key, step, reg) {
      const e = CACHE.get(key);
      if (!e) { cacheLedger.misses++; return null; }
      let rec = null;
      try {
        if (e.kind === 'raster') {
          const held = (e.payload.samples || []).map(deepCopy);
          rec = reg.add({
            kind: 'raster', id: step.id, title: e.describe.title,
            sourceCrs: e.describe.sourceCrs || null,
            provenance: deepCopy(e.describe.provenance),
            time: deepCopy(e.describe.time),
            width: e.payload.width, height: e.payload.height, grid: deepCopy(e.payload.grid),
            bands: deepCopy(e.payload.bands),
            read: (i) => (held[i] || []),
          });
        } else {
          rec = reg.add({
            id: step.id, title: e.describe.title,
            features: deepCopy(e.payload.features),
            sourceCrs: e.describe.sourceCrs || null,
            provenance: deepCopy(e.describe.provenance),
            time: deepCopy(e.describe.time),
            fieldStatements: statementsFrom(e.describe.fields),
          });
        }
      } catch (_) { rec = null; }
      /* ⚠ THE ENTRY IS KEPT HERE. A refused add is about THIS registration — an id still in use, most
         likely — and not about whether the remembered answer is still the answer; throwing the memory
         away would punish a good entry for the caller's timing. The op runs, as it would have. */
      if (!rec) { cacheLedger.misses++; return null; }
      const got = stableDescription(reg.describe(rec.id));
      if (canonical(got) !== canonical(e.describe)) {
        /* ⚠ THE DISAGREEMENT IS RESOLVED BY THE KERNEL, not by this file. Whatever came back is
           removed, the entry is forgotten, and the caller falls through to the op. */
        try { reg.remove(step.id); } catch (_) { }
        CACHE.delete(key);
        cacheLedger.mismatched++;
        return null;
      }
      e.usedAt = Date.now();
      cacheLedger.hits++;
      return { dataset: rec, stats: e.stats };
    }

    /* ⚠ THE ONE DOOR THE TWO RE-RUN PATHS GO THROUGH. With no key, with the cache off, or with a miss,
       what happens is `O.run(step, opts)` and nothing else — the same call, the same arguments, the
       same result object. A hit returns the op's own shape with `fromCache:true` added, because a
       caller reporting 「計算し直した」 about a step that was not computed is the missing receipt this
       repository keeps re-learning about. */
    async function runStep(step, opts) {
      const O = ops();
      if (!O || typeof O.run !== 'function') return { ok: false, why: 'ops-unavailable' };
      const reg = registry();
      const sig = (opts && opts.signal) || null;
      /* ⚠ A STOP ALREADY PRESSED IS THE OP'S ANSWER TO GIVE. Serving a remembered result here would
         turn 「中止しました」 into a rebuilt step, which is a different thing to tell a reader. */
      const k = (reg && !(sig && sig.aborted)) ? await cacheKey(step, null) : { ok: false, reason: 'not-consulted' };
      let key = null;
      if (k.ok) {
        key = k.key;
        const hit = reuse(key, step, reg);
        if (hit) return { ok: true, dataset: hit.dataset, stats: hit.stats || undefined, fromCache: true };
      } else if (k.reason !== 'cache-disabled' && k.reason !== 'not-consulted') {
        cacheLedger.unkeyable++;
      }
      /* ⚠ THE SIGNAL AND THE PROGRESS ARE HANDED OVER HERE, which is what makes the stop button a
         control with an effect (#R738 ⑥). Both callers used to write this call out themselves; the
         arguments are the same five fields and the same two options, normalised in one place now that
         one function makes the call. */
      const res = await O.run({
        id: step.id, op: step.op, inputs: step.inputs || [], params: step.params || {}, title: step.title,
      }, { signal: sig, onProgress: (opts && typeof opts.onProgress === 'function') ? opts.onProgress : null });
      if (res && res.ok && res.dataset && key) { try { remember(key, res.dataset, res.stats, reg); } catch (_) { } }
      return res;
    }

    function cacheClear() { CACHE.clear(); }

    /* ══ ⚠⚠⚠ (#R765) 「作業を再開できる」と「その結果をもう一度出せる」は別のこと ══════════════════
       save()/load() above make an analysis RESUMABLE: the inputs come back whole, the ops replay, and
       a changed engine is reported. That is the right design and it is not reproducibility. A recipe
       replayed on a different engine, against an upstream that has refreshed, at a different hour,
       is a NEW answer wearing the old one's name — and #R749's version comparison can only say
       「違う」 after the fact, to whoever happens to be looking.
       ⚠ WHAT WAS MISSING IS A DOCUMENT, not a store. To hand an analysis to somebody else — or to
       one's own future self — the question is 「この数は何から、どうやって出たのか」, and the answer
       was spread across four modules and reachable only by walking them. manifest() walks them once
       and writes it down.
       ⚠ IT ASSERTS NOTHING IT CANNOT ESTABLISH. Every manifest carries `gaps`: the things this app
       genuinely does not know about its own answer — an upstream nobody versions, an import whose
       bytes are not kept, a step computed before the engine stamped itself. A manifest with no gaps
       list would be the 「知らない」を「全部だ」の代わりにする shape this layer exists to refuse
       ([[intmap-one-store-was-asked]]), and the gaps are the most useful part of it for a reader
       deciding how much to trust the number.
       ⚠ AND THE FINGERPRINT IS OF THE ANSWER, NOT OF THE RECIPE. Two runs of one recipe are the same
       analysis; whether they are the same ANSWER is the question, and it is answerable only by
       hashing what came out. That is what makes 「同じ結果を再現できたか」 a measurement rather than
       a hope. */

    /* SHA-256 through the platform's own digest — the same one in a browser and in node, so a
       fingerprint taken here and checked there is the same number. ⚠ null when no digest is
       available (an insecure context has no crypto.subtle): that is a gap, stated, never a weaker
       hash quietly substituted — two different functions producing 「the fingerprint」 is worse than
       not having one. */
    async function sha256Hex(text) {
      try {
        const c = (typeof globalThis !== 'undefined') ? globalThis.crypto : null;
        if (!c || !c.subtle || typeof c.subtle.digest !== 'function') return null;
        const bytes = new TextEncoder().encode(text);
        const buf = await c.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (_) { return null; }
    }

    /* ⚠ CANONICAL, OR IT IS NOT A FINGERPRINT. JSON.stringify writes an object's keys in insertion
       order, so the same features built by two code paths would hash differently and the comparison
       would report a difference that is not one. Keys are sorted at every depth; arrays keep their
       order, because the order of features IS part of the answer. */
    function canonical(v) {
      if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
      if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
      const keys = Object.keys(v).sort();
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
    }

    /* What a record's payload IS, reduced to text one can hash. ⚠ A GRID IS HASHED FROM ITS SAMPLES
       AND ITS PLACEMENT, both — 「同じ画素の並びが別の場所に置かれている」 is a different answer, and
       #R756's export round-trip found that exact class of defect by measuring the grid as well as
       the cells. */
    function payloadText(rec) {
      if (!rec) return null;
      if (String(rec.kind || 'vector') === 'raster') {
        const bands = [];
        const n = (rec.bands || []).length;
        for (let b = 0; b < n; b++) {
          let vals = null;
          try { vals = rec.read(b); } catch (_) { return null; }
          if (!vals) return null;
          /* NaN has no JSON form and every void would otherwise read as null — written as a word so
             that 「欠損」 and 「値が無いことを述べていない」 stay distinguishable in the hash too. */
          const out = new Array(vals.length);
          for (let i = 0; i < vals.length; i++) out[i] = Number.isFinite(vals[i]) ? vals[i] : 'nodata';
          bands.push({ band: (rec.bands[b] || {}).name || b, values: out });
        }
        return canonical({ kind: 'raster', width: rec.width, height: rec.height, grid: rec.grid, bands: bands });
      }
      let feats = null;
      try { feats = rec.features(); } catch (_) { return null; }
      if (!Array.isArray(feats)) return null;
      return canonical({ kind: 'vector', features: feats });
    }

    /* The origin of one record, in the vocabulary its provenance already uses. Nothing is inferred:
       a record whose provenance names a kind this file does not know is reported under that name. */
    function originOf(prov) {
      const k = (prov && prov.kind) ? String(prov.kind) : 'unknown';
      return k;
    }

    /* ══ ⚠⚠⚠ (#R783) 「欄が埋まっている」は「辿れる」ではない ════════════════════════════════════
       #R765 の manifest は、レシピ・エンジンの版・取得の条件・内容の指紋を持っている。外部監査が
       名指したのはその次の一段で、正しい指摘だった: **その記録が指す原データと実行環境を、第三者が
       後から本当に取り出せるか**は、どの欄からも読めない。指紋は「同じものを持っているか」を確かめ
       られるが、持っていない者にそれを渡さない。レシピは再実行できるが、入力がこの文書の中に無ければ
       再実行できない。
       ⚠ SO EVERY STEP STATES WHICH OF THE THREE IT IS, AND THE WORD IS DERIVED, NOT ASSERTED:
           recipe                この段は導ける——op・引数・**名指した入力が全部この文書にある**
           recipe-inputs-missing レシピはあるが、入力がこの文書の中に無い（鎖の外から来ている）
           body                  導けない。本体そのものが出自で、指紋でだけ同一性を確かめられる
           body-unverifiable     本体が出自で、指紋も無い——同じものかどうかを確かめる手段が無い
       ⚠ AND `retrieval` IS A REFERENCE, NOT A COPY OF THE DATA. 時刻で変わるレイヤーについては
       「もう一度取得する」は答えの代わりにならない（#R749 の方針）——だから再取得の参照は参照として
       書き、答えの側は「取得時の本体」に置いたままにする。`sameAnswer` がその違いを述べる。 */
    function traceOf(step, known, wantFp) {
      const hasFp = wantFp && step.fingerprint != null;
      const out = { data: null, dataDetail: null, environment: null, retrieval: null };

      if (step.origin === 'op' && step.recipe) {
        const inputs = Array.isArray(step.recipe.inputs) ? step.recipe.inputs.slice() : [];
        /* ⚠ 測っている。鎖の順序（lineage は入力が先）に依っているのではなく、この文書に実際に在る
           id と突き合わせている——「入力はあるはず」は辿れることの代わりにならない。 */
        const missing = inputs.filter((i) => !known.has(i));
        out.data = missing.length ? 'recipe-inputs-missing' : 'recipe';
        if (missing.length) out.dataDetail = { missingInputs: missing };
        const eng = step.engineThen;
        const parts = (eng && typeof eng === 'object') ? Object.keys(eng) : [];
        out.environment = !parts.length ? 'not-recorded'
          : (parts.some((k) => eng[k] == null) ? 'partly-recorded' : 'recorded');
        out.retrieval = {
          by: 'replay',
          call: 'IntMapGisOps.run',
          args: { op: step.recipe.op, inputs: inputs, params: step.recipe.params },
          /* ⚠ 再実行が同じ答えを返すのは、同じエンジンのときだけ。版が記録されていなければ
             「同じになる条件」そのものが述べられていない。 */
          sameAnswer: (out.environment === 'recorded') ? 'if-engine-matches' : 'unknown',
          verifyWith: hasFp ? step.fingerprintOf : null,
          expect: hasFp ? step.fingerprint : null,
        };
        return out;
      }

      /* 演算でないもの——取り込み・地図レイヤーの取得・組み込みの記録。⚠ ここで計算されたものは
         何も無いので、実行環境は「この段についての主張ではない」。今日のエンジンを書けば、
         そのエンジンが作ったという主張になる。 */
      out.environment = 'not-computed-here';
      out.data = hasFp ? 'body' : 'body-unverifiable';
      const re = {
        by: 'body',
        /* ⚠ 本体は manifest には入らない（数メガバイトの文書は誰も読まない）。入るのは、
           それが同じ本体かを確かめる手段と、それを保存している場所の名前。 */
        inThisDocument: false,
        keptBy: 'IntMapGisProject.save',
        verifyWith: hasFp ? step.fingerprintOf : null,
        expect: hasFp ? step.fingerprint : null,
        file: (step.file == null) ? null : step.file,
        format: (step.format == null) ? null : step.format,
        readAt: (step.readAt == null) ? null : step.readAt,
      };
      if (step.acquisition) {
        /* 取得は、そのときの上流への問い合わせ。同じ問い合わせを書き下しても、同じ答えが返る保証は
           無い——だから参照として書き、そう述べる。 */
        re.reacquire = {
          call: 'IntMapGisLayers.acquire',
          args: {
            layer: step.acquisition.layer,
            bounds: step.acquisition.bounds || null,
            statedTime: step.acquisition.statedTime || null,
          },
        };
        re.acquiredAt = step.acquisition.at || null;
        re.sameAnswer = 'not-guaranteed';
      } else {
        re.sameAnswer = 'same-bytes-only';
      }
      out.retrieval = re;
      return out;
    }

    async function stepOf(rec, opts) {
      const D = registry();
      const desc = (D && typeof D.describe === 'function') ? D.describe(rec.id) : null;
      const prov = (desc && desc.provenance) || {};
      const step = {
        id: rec.id,
        title: desc ? desc.title : rec.id,
        kind: desc ? desc.kind : null,
        origin: originOf(prov),
        crs: desc ? desc.crs : null,
        sourceCrs: desc ? desc.sourceCrs : null,
        time: desc ? desc.time : null,
        count: desc ? desc.count : null,
        /* ⚠ THE COLUMNS WITH THEIR UNITS AND WHO STATED THEM. A number whose unit is only in the
           reader's head is the defect #R763 measured on the layers; a manifest that dropped it here
           would put it back. */
        fields: (desc && desc.fields) ? desc.fields.map((f) => ({
          name: f.name, type: f.type, unit: (f.unit == null ? null : f.unit),
          unitStated: f.unitStated || null, unitFrom: f.unitFrom || null,
        })) : null,
        bands: (desc && desc.bands) ? desc.bands.slice() : null,
      };
      if (prov.kind === 'op') {
        step.recipe = { op: prov.op, inputs: (prov.inputs || []).slice(), params: prov.params || {} };
        /* Stamped when it ran (#R765). Absent for a record computed before that, or while
           js/gis-project.js was not mounted — reported as a gap rather than filled in from today. */
        step.engineThen = prov.engine || null;
      } else {
        step.recipe = null;
      }
      if (prov.layer != null) {
        step.acquisition = {
          layer: String(prov.layer),
          bounds: prov.bounds || null,
          statedTime: prov.statedTime || null,
          at: prov.at || null,
        };
      }
      /* ⚠ COVERAGE IS COPIED WHOLE, not summarised. 「どこまでが答えられたか」 and 「演算が何行
         落としたか」 are the two questions a reader checking someone else's number asks first, and a
         manifest that reduced them to a word would be answering a third. */
      if (prov.coverage) step.coverage = prov.coverage;
      if (prov.readAt != null) step.readAt = prov.readAt;
      if (prov.file != null) step.file = String(prov.file);
      if (prov.format != null) step.format = String(prov.format);
      if (desc && desc.stale) step.stale = desc.stale;
      /* ⚠ (#R783) THE PROVENANCE AS IT WAS WRITTEN, BESIDE THE FIELDS THIS FILE NAMES. The named ones
         above are what this file knows how to talk about; a writer may have stated more — a licence, a
         url, how many cells the reader has since edited — and a document carrying only the fields
         somebody thought of is the hand-written list this repository keeps re-learning about
         ([[intmap-discovered-list-is-a-photograph]]). Verbatim, so no second reading of it happens
         here: js/gis-export.js already owns the synonym table for licence / source / retrievedAt, and
         a second one would be a second opinion about what a record states. */
      step.provenance = (function () { try { return JSON.parse(JSON.stringify(prov)); } catch (_) { return null; } })();

      if (!(opts && opts.fingerprint === false)) {
        const text = payloadText(rec);
        step.fingerprint = (text == null) ? null : await sha256Hex(text);
        step.fingerprintOf = 'sha256/canonical-json';
      }
      return step;
    }

    /* manifest(id) — 「この数は何から、どうやって出たのか」 as one document. */
    async function manifest(id, opts) {
      const D = registry();
      if (!D || typeof D.lineage !== 'function') return { ok: false, why: 'registry-missing' };
      const key = String(id == null ? '' : id);
      const target = (typeof D.get === 'function') ? D.get(key) : null;
      if (!target) return { ok: false, why: 'unknown-dataset', detail: { id: key } };

      const chain = D.lineage(key) || [];
      const steps = [];
      const wantFp = !(opts && opts.fingerprint === false);
      /* ⚠ THE SET GROWS AS THE DOCUMENT DOES, so 「入力がこの文書にある」 is measured against what is
         actually written above this step and not against the registry — a manifest is read by somebody
         who has only the manifest. */
      const known = new Set();
      for (const rec of chain) {
        const s = await stepOf(rec, opts);
        s.trace = traceOf(s, known, wantFp);
        known.add(s.id);
        steps.push(s);
      }

      const gaps = [];
      for (const s of steps) {
        if (s.origin === 'op' && !s.engineThen) {
          gaps.push({ step: s.id, gap: 'engine-not-recorded', means: 'この段を計算したエンジンの版が記録されていない（いまの版は「そのときの版」ではない）' });
        }
        if (s.origin === 'import') {
          gaps.push({ step: s.id, gap: 'source-bytes-not-kept', means: '取り込んだ元のバイトは保存していないので、同じファイルかどうかは指紋でしか確かめられない' });
        }
        if (s.acquisition && !(s.coverage && s.coverage.completeness)) {
          gaps.push({ step: s.id, gap: 'coverage-unstated', means: '求めた範囲のうちどこまで答えられたかを、この供給元は述べていない' });
        }
        if (s.acquisition) {
          gaps.push({ step: s.id, gap: 'upstream-not-versioned', means: '上流そのものに版が無いので、同じ問い合わせが同じ答えを返す保証は無い' });
        }
        if (s.fingerprint === null && !(opts && opts.fingerprint === false)) {
          gaps.push({ step: s.id, gap: 'fingerprint-unavailable', means: '内容の指紋を取れなかった（この環境に SHA-256 が無いか、payload を読めなかった）' });
        }
        /* ⚠ (#R783) 辿れないことが、辿れる欄の隣に黙って座らないように。上の 5 つは「この app が
           自分の答えについて知らないこと」で、この 3 つは「この文書だけを持った読み手が到達できない
           こと」——別の穴なので、別に述べる。 */
        if (s.trace.data === 'recipe-inputs-missing') {
          gaps.push({ step: s.id, gap: 'recipe-inputs-missing', means: 'この段のレシピは在るが、名指している入力がこの文書に無いので、この文書だけでは再実行できない', detail: s.trace.dataDetail });
        }
        if (s.trace.data === 'body-unverifiable') {
          gaps.push({ step: s.id, gap: 'body-not-verifiable', means: '本体そのものが出自で、しかも内容の指紋が無いので、手元のものが同じ本体かを確かめる手段が無い' });
        }
        if (s.trace.environment === 'partly-recorded') {
          gaps.push({ step: s.id, gap: 'engine-partly-recorded', means: 'この段を計算したエンジンのうち、版を述べなかった部品がある（その部品については「同じ」と言えない）', detail: { engineThen: s.engineThen } });
        }
      }

      /* ══ ⚠ (#R783) 「実行環境」を、版の一覧より 1 段広く述べる ══════════════════════════════════
         `engineNow` は版を述べた部品の版。⚠ THE MODULES THAT STATE NO VERSION ARE THE INTERESTING
         HALF: they are loaded, they may well change an answer, and they are precisely the reason
         #R749's comparison can return 「測れなかった」. engineNow cannot show them — a key with a null
         value and a key that is not there mean different things and neither is 「載っているが黙って
         いる」. So the loaded set is listed and the silent ones are named.
         ⚠ BEING IN `statesNoVersion` IS NOT AN ACCUSATION. This file states no version either, and
         neither does the panel: a module that changes no number is not a kernel that forgot
         (engineNow's own note says so). Which of them OUGHT to state one is settled by the ledger in
         scripts/gis-kernel-versions.mjs, not at run time — what is written here is only the fact a
         reader needs, that these were loaded and said nothing.
         ⚠ 版そのものはここに写さない。正本は下の `engineNow` 1 か所。 */
      const loaded = kernelGlobals();
      const silent = [];
      for (const g of loaded) {
        let mod = null;
        try { mod = window[g]; } catch (_) { mod = null; }
        if (!mod || typeof mod.version !== 'function') silent.push(g);
      }
      /* Whether this environment can take a fingerprint at all — the same question sha256Hex answers
         by returning null, asked once so the document states it rather than leaving the reader to
         infer it from a null. */
      const digest = (await sha256Hex('')) ? 'sha256' : null;

      /* ⚠ THE SUMMARY IS COMPUTED FROM THE STEPS, NEVER WRITTEN BESIDE THEM. Three answers for the
         data, because there are three situations: everything is derivable from recipes; some steps
         need their body handed over as well (and can be checked when it is); or at least one step can
         be neither derived nor checked. */
      const blockedBy = [];
      let needsBody = false;
      for (const s of steps) {
        if (s.trace.data === 'recipe') continue;
        if (s.trace.data === 'body') { needsBody = true; continue; }
        blockedBy.push({ step: s.id, axis: 'data', state: s.trace.data, detail: s.trace.dataDetail || null });
      }
      const opSteps = steps.filter((s) => s.origin === 'op');
      let envState;
      if (!opSteps.length) envState = 'nothing-computed';
      else if (opSteps.every((s) => s.trace.environment === 'recorded')) envState = 'recorded';
      else if (opSteps.some((s) => s.trace.environment === 'recorded' || s.trace.environment === 'partly-recorded')) envState = 'partly-recorded';
      else envState = 'not-recorded';
      for (const s of opSteps) {
        if (s.trace.environment === 'recorded') continue;
        blockedBy.push({ step: s.id, axis: 'environment', state: s.trace.environment, detail: null });
      }

      return {
        ok: true,
        id: key,
        title: target.title,
        producedAt: Date.now(),
        /* ⚠ TWO DIFFERENT CLAIMS, SIDE BY SIDE AND NEVER MERGED. `engineNow` is what is loaded as
           this manifest is written; each step's `engineThen` is what computed that step. They agree
           in the ordinary case and their disagreement is the whole reason #R749 built the version. */
        engineNow: engineNow(),
        /* ⚠ (#R783) 実行環境のうち、版では述べられない部分。版は上の engineNow が正本。 */
        environment: {
          kernelsLoaded: loaded,
          statesNoVersion: silent,
          digest: digest,
          recordVersion: RECORD_VERSION,
        },
        steps: steps,
        answer: {
          fingerprint: steps.length ? steps[steps.length - 1].fingerprint : null,
          count: target.count == null ? null : target.count,
          kind: String(target.kind || 'vector'),
        },
        /* ⚠ (#R783) 「この文書だけを持った第三者は、原データと実行環境に到達できるか」。
           到達できない場合は、どの段の・どちらの軸が・なぜ、が blockedBy に並ぶ——空の blockedBy が
           「到達できる」で、欄が埋まっていることは何の代わりにもならない。 */
        traceability: {
          data: blockedBy.some((b) => b.axis === 'data') ? 'partial' : (needsBody ? 'with-bodies' : 'derivable'),
          environment: envState,
          blockedBy: blockedBy,
        },
        gaps: gaps,
        manifestVersion: MANIFEST_VERSION,
      };
    }

    /* Did this record come out the same as the manifest says it did? ⚠ IT ANSWERS THREE THINGS, NOT
       TWO: 「同じ」「違う」「測れなかった」. A fingerprint that could not be taken is not a match, and
       reporting it as one is the failure mode this whole layer keeps recording. */
    async function verify(id, saved) {
      const D = registry();
      if (!D || typeof D.get !== 'function') return { ok: false, why: 'registry-missing' };
      const rec = D.get(String(id));
      if (!rec) return { ok: false, why: 'unknown-dataset', detail: { id: String(id) } };
      const want = (saved && typeof saved === 'object')
        ? (saved.answer ? saved.answer.fingerprint : saved.fingerprint)
        : saved;
      const text = payloadText(rec);
      const got = (text == null) ? null : await sha256Hex(text);
      /* ⚠ (#R783) THE OTHER HALF OF 「同じ結果か」 IS 「同じ環境か」, and a caller holding a manifest
         has the answer to it in their hand. Asked through the same compareEngine the load path uses —
         three answers, and 「測れなかった」 never reported as 「同じ」 — so this file has one opinion
         about what an engine comparison is. Absent where the document does not carry one: a bare
         fingerprint string says nothing about an engine, and inventing 'same' for it would be the
         shape this layer exists to refuse. */
      const savedEngine = (saved && typeof saved === 'object') ? engineCopy(saved.engineNow) : null;
      const engine = savedEngine
        ? { verdict: compareEngine(savedEngine, engineNow()), saved: savedEngine, now: engineCopy(engineNow()) }
        : { verdict: 'unknown', saved: null, now: engineCopy(engineNow()) };
      if (want == null || got == null) {
        return { ok: true, verdict: 'unmeasurable', expected: want == null ? null : String(want), actual: got, engine: engine };
      }
      return { ok: true, verdict: (String(want) === got) ? 'same' : 'different', expected: String(want), actual: got, engine: engine };
    }

    const API = {
      save, load, list, remove, setParams, available,
      /* (#R765) 「この数は何から、どうやって出たのか」を 1 つの文書に — と、それが同じ答えかを測る口 */
      manifest, verify, manifestVersion: MANIFEST_VERSION,
      /* ══ (#R819) 不変条件を鍵にした結果の記憶。⚠ THE RECIPE IS STILL THE ORIGINAL — this hands back an
         answer a kernel computed, under conditions measured to be the same one, or it steps aside.
           enabled/setEnabled  off restores the path this module took before this round, to the letter
                               (and forgets what it held: an entry nobody may consult is not a saving)
           keyFor(step, part)  the key, or the REASON there is none — 'engine-unmeasurable',
                               'input-unmeasurable', 'no-digest', 'cache-disabled', 'registry-missing'.
                               `part` is the slot for a piece of a step (a warp's window): the same five
                               axes plus which piece, so a producer of partial results never has to
                               invent a second vocabulary for 「同じ条件か」
           putValue/getValue   the receptacle for such a piece. It stores what it is handed and states
                               nothing about it; what a piece MEANS belongs to whoever computes it
           stats/limits        the receipt and the budget (see cacheLimits) */
      cache: {
        enabled: () => cacheOn,
        setEnabled: (v) => { cacheOn = !!v; if (!cacheOn) cacheClear(); return cacheOn; },
        clear: cacheClear,
        keyFor: (step, part) => cacheKey(step || {}, part),
        putValue: (key, value) => {
          if (!cacheOn || key == null) return false;
          const copy = deepCopy(value);
          if (copy === null && value !== null) return false;
          const payload = { kind: 'value', value: copy };
          const bytes = payloadBytes(payload);
          if (bytes > cacheLimits.maxBytes) { cacheLedger.tooLarge++; return false; }
          const at = Date.now();
          CACHE.delete(String(key));
          CACHE.set(String(key), { key: String(key), kind: 'value', payload: payload, describe: null, stats: null, bytes: bytes, at: at, usedAt: at });
          cacheLedger.stored++;
          evict();
          return true;
        },
        getValue: (key) => {
          const e = CACHE.get(String(key));
          if (!e || e.kind !== 'value') { cacheLedger.misses++; return null; }
          e.usedAt = Date.now();
          cacheLedger.hits++;
          return deepCopy(e.payload.value);
        },
        stats: () => Object.assign({ entries: CACHE.size, bytes: cacheBytesTotal(), keyVersion: CACHE_KEY_VERSION }, cacheLedger),
        limits: () => Object.assign({}, cacheLimits),
        configure: (next) => {
          if (next && typeof next === 'object') {
            if (typeof next.maxEntries === 'number' && isFinite(next.maxEntries) && next.maxEntries >= 0) cacheLimits.maxEntries = Math.floor(next.maxEntries);
            if (typeof next.maxBytes === 'number' && isFinite(next.maxBytes) && next.maxBytes >= 0) cacheLimits.maxBytes = Math.floor(next.maxBytes);
            evict();
          }
          return Object.assign({}, cacheLimits);
        },
      },
      /* named so a test or a panel can talk about the store without re-deriving the strings */
      dbName: DB_NAME, storeName: STORE, recordVersion: RECORD_VERSION,
      /* (#R749) What the kernels say they are RIGHT NOW — the other half of what a saved step's
         numbers depend on. Exposed so a panel can show the comparison load() reports without asking
         the kernels a second way; the version itself belongs to js/gis-ops.js and js/gis-geometry.js. */
      engine: engineNow,
    };
    try { window.IntMapGisProject = API; } catch (_) { }
    return API;
  })();
}
