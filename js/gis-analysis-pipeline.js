/* ============================================================================
 *  IntMap · AN ANALYSIS AS A RE-RUNNABLE PIPELINE — window.IntMapGisPipeline
 * ----------------------------------------------------------------------------
 *  Atlas builds an analysis one `gis` step at a time: acquire the roads of a window, buffer them,
 *  clip a flood zone, count the people. js/gis-project.js can save that chain and re-run it when ONE
 *  step's parameter changes (setParams). What it cannot say is 「対象地域を変えたら」: the window is
 *  not a parameter of one step, it is a value SEVERAL steps were built from, and nothing recorded
 *  which. So moving to another prefecture meant asking Atlas to start again.
 *
 *  A PIPELINE is the missing record: an ordered list of `{id, action}` where `action` is exactly the
 *  object the `gis` door (js/gis-atlas.js run) already takes — nothing new to learn, nothing a second
 *  implementation of an op. Two placeholders make it a recipe rather than a transcript:
 *
 *      "$region"        the pipeline's current region, `[west,south,east,north]`. Written wherever
 *                       the window goes (`acquire.bounds`, a clip rectangle …).
 *      "$step:<id>"     the dataset an earlier step made. Written as an input of a later one.
 *
 *  ⚠ DEPENDENCIES ARE DERIVED FROM THOSE TWO MARKERS, NEVER DECLARED NEXT TO THEM. A second list of
 *  「この段はあの段に依る」 would be the second copy that drifts; the marker in the action IS the
 *  dependency. A step that mentions `$region` depends on the region; one that mentions `$step:a`
 *  depends on `a`; everything reachable from those is affected when they change, and nothing else is.
 *
 *  ══ PARTIAL RECOMPUTATION: A STEP'S KEY IS ITS RECIPE, RESOLVED ═══════════════════════════════════
 *  key(step) = a digest of the action with `$region` replaced by the region and every `$step:x`
 *  replaced by the KEY of x. So a changed region changes the key of exactly the steps that use it and
 *  of every step downstream of those; an unrelated branch keeps its key and is `reused` — its dataset
 *  is left alone, not recomputed and not re-fetched. A step whose key is unchanged is reused only if
 *  its dataset is still in the registry (a deleted result is rebuilt, not trusted).
 *  ⚠ THE KEY COVERS THE RECIPE, NOT THE WORLD. An acquisition from a live source answers differently
 *  tomorrow with the same key; `run({refresh:true})` (or `force:[ids]`) re-runs it. Saying a reused
 *  step is 「最新」 would be a claim the key cannot back, so the report says `reused`, not `current`.
 *  ⚠ A FAILED STEP STOPS ITS DEPENDENTS, AND THEY ARE MARKED. Steps downstream of a failure are
 *  `skipped` (`upstream-failed`), their datasets are invalidated through the registry so no later op
 *  consumes the old answer as if it matched the new region, and the failing step's own reason is
 *  carried as the registry gave it. An unrelated branch is still run.
 *
 *  ══ WHERE IT IS KEPT ══════════════════════════════════════════════════════════════════════════
 *  The definitions are small recipes. They go into the GIS project record beside the datasets
 *  (IntMapGisProject.save(name, {extras})), and `restore()` puts them back after IntMapGisProject.load
 *  — which re-creates every dataset under its ORIGINAL id, so a restored step still finds its result.
 *
 *  EVERY `why` THIS FILE CAN RETURN
 *    pipeline-unknown   step-id-invalid   step-id-duplicate   action-missing   step-unknown
 *    step-order         region-invalid    region-missing      no-steps          step-not-found
 *    exec-unavailable   upstream-failed   dataset-missing     lineage-unavailable  not-capturable
 *  Anything else is the `gis` door's own refusal, carried verbatim.
 *
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY; collaborators are injectable (`deps.exec`, `deps.data`).
 * ==========================================================================*/

export function makeGisPipeline(deps) {
  return (function () {
    const D = deps || {};
    const WIN = () => { try { return (typeof window !== 'undefined' && window) || null; } catch (_) { return null; } };
    const registry = () => D.data || (WIN() && WIN().IntMapData) || null;
    const exec = () => {
      if (typeof D.exec === 'function') return D.exec;
      const W = WIN(); const A = W && W.IntMapGis && W.IntMapGis.atlas;
      return A && typeof A.run === 'function' ? (a) => A.run(a) : null;
    };
    const PIPES = new Map();
    let seq = 0;

    const fail = (why, detail) => ({ ok: false, why, detail: detail || null });
    const clone = (v) => JSON.parse(JSON.stringify(v));
    const REGION = '$region';
    const STEP_RE = /^\$step:([A-Za-z0-9_-]+)$/;
    const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
    const validBounds = (b) => Array.isArray(b) && b.length === 4 && b.every((x) => typeof x === 'number' && isFinite(x)) && b[0] < b[2] && b[1] < b[3] && b[0] >= -180 && b[2] <= 180 && b[1] >= -90 && b[3] <= 90;

    /* walk every string in an action; `fn(str)` may return a replacement (anything) or undefined */
    function mapDeep(v, fn) {
      if (typeof v === 'string') { const r = fn(v); return r === undefined ? v : r; }
      if (Array.isArray(v)) return v.map((x) => mapDeep(x, fn));
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = mapDeep(v[k], fn); return o; }
      return v;
    }
    function scan(action) {
      const refs = new Set(); let usesRegion = false;
      mapDeep(action, (s) => { if (s === REGION) usesRegion = true; const m = STEP_RE.exec(s); if (m) refs.add(m[1]); return undefined; });
      return { refs: Array.from(refs), usesRegion };
    }

    /* a digest for EQUALITY only — never an integrity claim. Two independent 32-bit FNV-1a lanes. */
    function digest(str) {
      let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0xdeadbeef;
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0; h2 = (h2 ^ (h2 >>> 13)) >>> 0;
      }
      return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
    }
    function canon(v) {
      if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
      if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
      return JSON.stringify(v);
    }

    function define(spec) {
      const s = spec || {};
      const steps = Array.isArray(s.steps) ? s.steps : [];
      if (!steps.length) return fail('no-steps');
      let region = null;
      if (s.region != null) { if (!validBounds(s.region)) return fail('region-invalid', { needs: '[west,south,east,north]' }); region = s.region.slice(); }
      const seen = new Map(); const out = [];
      for (const st of steps) {
        const id = st && st.id != null ? String(st.id) : '';
        if (!ID_RE.test(id)) return fail('step-id-invalid', { id, needs: 'letters, digits, _ or -, up to 40' });
        if (seen.has(id)) return fail('step-id-duplicate', { id });
        if (!st.action || typeof st.action !== 'object') return fail('action-missing', { id });
        const sc = scan(st.action);
        for (const r of sc.refs) {
          if (r === id) return fail('step-order', { id, refers: r });
          if (!seen.has(r)) return fail(steps.some((x) => x && String(x.id) === r) ? 'step-order' : 'step-unknown', { id, refers: r });
        }
        if (sc.usesRegion && !region) return fail('region-missing', { id });
        seen.set(id, sc);
        out.push({ id, action: clone(st.action), refs: sc.refs, usesRegion: sc.usesRegion, key: null, datasetId: null, status: 'new', why: null });
      }
      const id = s.id != null && s.id !== '' ? String(s.id) : 'pl-' + (++seq);
      PIPES.set(id, { id, title: String(s.title || id), region, steps: out, source: s.source || 'defined' });
      return { ok: true, id, steps: out.map((x) => x.id), regionBound: out.filter((x) => x.usesRegion).map((x) => x.id) };
    }

    function resolveKeys(p, regionOverride, patches) {
      const region = regionOverride || p.region;
      const keys = new Map();
      for (const st of p.steps) {
        const act = patches && patches[st.id] ? applyPatch(st.action, patches[st.id]) : st.action;
        const resolved = mapDeep(act, (s) => {
          if (s === REGION) return region;
          const m = STEP_RE.exec(s); if (m) return { $key: keys.get(m[1]) };
          return undefined;
        });
        keys.set(st.id, digest(canon(resolved)));
      }
      return keys;
    }
    function applyPatch(action, patch) {
      const a = clone(action);
      a.params = Object.assign({}, a.params || {}, patch);
      return a;
    }
    const alive = (id) => { const R = registry(); return !!(id && R && typeof R.has === 'function' && R.has(id)); };

    /* the steps whose key would change, and the ones that would not — nothing is run */
    function plan(id, change) {
      const p = PIPES.get(id); if (!p) return fail('pipeline-unknown', { id });
      const c = change || {};
      if (c.region != null && !validBounds(c.region)) return fail('region-invalid', { needs: '[west,south,east,north]' });
      if (c.params) for (const k of Object.keys(c.params)) if (!p.steps.some((x) => x.id === k)) return fail('step-not-found', { id: k });
      const next = resolveKeys(p, c.region || null, c.params || null);
      const affected = [], reused = [];
      for (const st of p.steps) (next.get(st.id) !== st.key || !alive(st.datasetId) ? affected : reused).push(st.id);
      return { ok: true, affected, reused };
    }

    async function run(id, opts) {
      const p = PIPES.get(id); if (!p) return fail('pipeline-unknown', { id });
      const X = exec(); if (!X) return fail('exec-unavailable');
      const o = opts || {};
      const force = new Set(Array.isArray(o.force) ? o.force.map(String) : []);
      const keys = resolveKeys(p, null, null);
      const R = registry();
      const done = new Map(); const report = { ok: true, ran: [], reused: [], failed: [], skipped: [] };
      for (const st of p.steps) {
        if (o.signal && o.signal.aborted) { report.ok = false; report.aborted = true; break; }
        const key = keys.get(st.id);
        const bad = st.refs.find((r) => !done.get(r));
        if (bad) {
          st.status = 'skipped'; st.why = 'upstream-failed';
          if (R && st.datasetId && alive(st.datasetId) && typeof R.invalidate === 'function') R.invalidate(st.datasetId, 'upstream-failed');
          report.skipped.push({ id: st.id, why: 'upstream-failed', upstream: bad }); report.ok = false; continue;
        }
        const refreshed = !!o.refresh || force.has(st.id);
        if (key === st.key && alive(st.datasetId) && !refreshed && !(R && R.stale && R.stale(st.datasetId))) {
          st.status = 'reused'; done.set(st.id, st.datasetId); report.reused.push(st.id); continue;
        }
        const action = mapDeep(st.action, (s) => {
          if (s === REGION) return p.region.slice();
          const m = STEP_RE.exec(s); if (m) return done.get(m[1]);
          return undefined;
        });
        if (o.signal) action.signal = o.signal;
        let r = null;
        try { r = await X(action); } catch (e) { r = { ok: false, why: 'exec-threw', detail: String((e && e.message) || e).slice(0, 200) }; }
        const made = r && r.ok ? ((r.dataset && r.dataset.id) || (r.acquired && r.acquired[0] && r.acquired[0].id) || null) : null;
        if (!made) {
          st.status = 'failed'; st.why = (r && r.why) || 'dataset-missing';
          if (R && st.datasetId && alive(st.datasetId) && typeof R.invalidate === 'function') R.invalidate(st.datasetId, st.why);
          report.failed.push({ id: st.id, why: st.why, detail: (r && r.detail) || null }); report.ok = false; continue;
        }
        /* the old result leaves only now that the new one exists; a failed rebuild keeps the old, marked */
        if (R && st.datasetId && st.datasetId !== made && alive(st.datasetId)) R.remove(st.datasetId);
        st.datasetId = made; st.key = key; st.status = 'ran'; st.why = null;
        done.set(st.id, made); report.ran.push(st.id);
      }
      report.datasets = Object.fromEntries(p.steps.map((x) => [x.id, x.datasetId]));
      return report;
    }

    async function setRegion(id, bounds, opts) {
      const p = PIPES.get(id); if (!p) return fail('pipeline-unknown', { id });
      if (!validBounds(bounds)) return fail('region-invalid', { needs: '[west,south,east,north]' });
      if (!p.steps.some((s) => s.usesRegion)) return fail('region-missing', { note: 'no step of this pipeline uses $region, so there is nothing to move' });
      p.region = bounds.slice();
      return run(id, opts);
    }
    async function setParams(id, stepId, patch, opts) {
      const p = PIPES.get(id); if (!p) return fail('pipeline-unknown', { id });
      const st = p.steps.find((x) => x.id === stepId); if (!st) return fail('step-not-found', { id: stepId });
      st.action = applyPatch(st.action, patch && typeof patch === 'object' ? patch : {});
      return run(id, opts);
    }

    /* ── capture: an analysis the session already holds → a pipeline ─────────────────────────────
       Walks the lineage of `datasetId` (IntMapData.lineage: inputs before outputs). An op record
       becomes {op, inputs, params}; a record acquired from a layer becomes an acquisition step whose
       window is `$region` when it equals `region` (given, or the first acquisition's window).
       ⚠ A record that is neither — an import, a Python record — HAS NO RECIPE THIS FILE CAN WRITE,
       and is refused by name (`not-capturable`) rather than frozen in as a fixed input that would
       silently ignore the region. */
    function capture(datasetId, o) {
      const R = registry();
      if (!R || typeof R.lineage !== 'function') return fail('lineage-unavailable');
      const chain = R.lineage(String(datasetId));
      if (!chain.length) return fail('dataset-missing', { id: String(datasetId) });
      const opts = o || {};
      const sid = new Map();
      let region = opts.region && validBounds(opts.region) ? opts.region.slice() : null;
      const steps = [];
      for (const rec of chain) {
        const pv = rec.provenance || {};
        const id = 's' + (steps.length + 1);
        if (pv.kind === 'op') {
          const inputs = (pv.inputs || []).map((i) => sid.has(i) ? '$step:' + sid.get(i) : i);
          steps.push({ id, action: { type: 'gis', op: pv.op, inputs, params: clone(pv.params || {}), title: rec.title } });
        } else if (pv.kind === 'layer' && pv.layer != null) {
          const acq = {};
          if (Array.isArray(pv.bounds) && validBounds(pv.bounds)) {
            if (!region) region = pv.bounds.slice();
            acq.bounds = (canon(pv.bounds) === canon(region)) ? REGION : pv.bounds.slice();
          }
          if (pv.statedTime) acq.time = pv.statedTime;
          steps.push({ id, action: { type: 'gis', inputs: ['layer:' + pv.layer], acquire: acq, title: rec.title } });
        } else return fail('not-capturable', { id: rec.id, kind: pv.kind || 'unknown', note: 'this record has no recipe a pipeline can re-run (an import or a Python record); it would stay fixed while the region moved' });
        sid.set(rec.id, id);
      }
      const r = define({ id: opts.id, title: opts.title || ('captured from ' + datasetId), region, steps, source: 'captured' });
      if (!r.ok) return r;
      /* the datasets already exist: bind them, so the first run reuses what is there */
      const p = PIPES.get(r.id);
      const keys = resolveKeys(p, null, null);
      chain.forEach((rec, i) => { p.steps[i].datasetId = rec.id; p.steps[i].key = keys.get(p.steps[i].id); p.steps[i].status = 'bound'; });
      return Object.assign(r, { region });
    }

    function describe(id) {
      const p = PIPES.get(id); if (!p) return fail('pipeline-unknown', { id });
      return { ok: true, id: p.id, title: p.title, region: p.region ? p.region.slice() : null, source: p.source,
        steps: p.steps.map((s) => ({ id: s.id, op: s.action.op || null, dependsOn: s.refs.slice(), usesRegion: s.usesRegion, status: s.status, why: s.why, dataset: s.datasetId })) };
    }
    const list = () => Array.from(PIPES.values()).map((p) => ({ id: p.id, title: p.title, steps: p.steps.length, region: p.region }));
    const remove = (id) => PIPES.delete(id);

    /* ── persistence through the project record ──────────────────────────────────────────────── */
    function snapshot() { return Array.from(PIPES.values()).map((p) => ({ id: p.id, title: p.title, region: p.region, source: p.source, steps: p.steps.map((s) => ({ id: s.id, action: s.action, key: s.key, datasetId: s.datasetId })) })); }
    async function save(name) {
      const W = WIN(); const P = D.project || (W && W.IntMapGisProject);
      if (!P || typeof P.save !== 'function') return fail('project-unavailable');
      return P.save(name, { extras: { pipelines: snapshot() } });
    }
    /* `loaded` is IntMapGisProject.load()'s answer; its datasets are back under their saved ids */
    function restore(loaded) {
      const saved = loaded && loaded.extras && Array.isArray(loaded.extras.pipelines) ? loaded.extras.pipelines : [];
      const restored = [];
      for (const sp of saved) {
        const r = define({ id: sp.id, title: sp.title, region: sp.region, source: 'restored', steps: sp.steps.map((s) => ({ id: s.id, action: s.action })) });
        if (!r.ok) { restored.push({ id: sp.id, ok: false, why: r.why }); continue; }
        const p = PIPES.get(r.id);
        sp.steps.forEach((s, i) => { if (alive(s.datasetId)) { p.steps[i].datasetId = s.datasetId; p.steps[i].key = s.key; p.steps[i].status = 'restored'; } });
        restored.push({ id: sp.id, ok: true });
      }
      return { ok: true, restored };
    }

    const API = { define, plan, run, setRegion, setParams, capture, describe, list, remove, save, restore };
    try { if (WIN()) WIN().IntMapGisPipeline = API; } catch (_) { }
    return API;
  })();
}
