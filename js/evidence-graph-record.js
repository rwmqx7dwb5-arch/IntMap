/* ============================================================================
 *  IntMap · EVIDENCE GRAPH — the recorders (js/evidence-graph.js holds the graph; these fill it)
 * ----------------------------------------------------------------------------
 *  Two vertical threads, from what IntMap already holds, adding no new judge:
 *
 *    GIS   js/gis-datasets.js `subscribe('add')` → a source node for every record that is NOT an op output
 *          (an import, a layer read, a fetch) and a derived `gis_op` node for every op output, whose inputs are
 *          the nodes of `provenance.inputs` — pinned at the version they had when the op ran. The recipe
 *          (`op`, `params`) and the kernel version (`ops-N`) are the calculation.
 *    Atlas js/atlas-evidence.js registry + the answer's claims → a derived `answer_number` per claim that states
 *          a figure and cites evidence. Its inputs are the SOURCE nodes of the cited records — or, when a record
 *          carries a `graphRef` (a GIS result handed to the answer as an app fact), the GIS node itself, so the
 *          number traces through the op chain to the imported data.
 *
 *  ⚠ AN ANSWER NUMBER IS «answer_number» ONLY WHEN A CITED RECORD STATES THAT VALUE (a supportFact, or a
 *  graph node's `output.value`). A figure the model wrote that no cited record holds is `ai_inference` — still
 *  traceable to what it cited, but recorded as the model's own, so the graph never lends a number the authority
 *  of a source that did not say it. A figure that cites nothing at all cannot be a node (rule ① of the graph)
 *  and is COUNTED in `uncited`, not dropped silently.
 *  ⚠ NOTHING HERE READS A URL FROM THE MODEL. A claim's `evidenceIds` are looked up in the registry; an id that
 *  is not there makes no edge (`unresolved`).
 * ==========================================================================*/
import { makeEvidenceGraph, fingerprint } from './evidence-graph.js';
import { assessDeliverable, observationLines } from './evidence-graph-deliver.js';

const fieldShape = (rec) => (Array.isArray(rec && rec.fields) ? rec.fields : [])
  .map((f) => (f && typeof f === 'object') ? [f.name, f.type] : [String(f), null]);

/** the identity of a non-op dataset: where it came from, never its session-local `ds-N` unless nothing else says */
function datasetKey(rec) {
  const p = (rec && rec.provenance) || {};
  const k = p.layer || p.url || p.source || p.file || p.name;
  return k ? String(k) : ('session:' + rec.id + ':' + (rec.title || ''));
}

/** the shape version of a dataset: rows, columns, geometry — stated by the provenance's own version/etag when it has one */
function datasetVersion(rec) {
  const p = (rec && rec.provenance) || {};
  const stated = p.etag || p.version || p.sourceVersion;
  if (stated) return { version: String(stated), basis: 'stated' };
  return { version: fingerprint({ n: rec.count, g: rec.geometryType, wg: rec.withGeometry, f: fieldShape(rec), b: p.bounds || null, w: p.width || null, h: p.height || null }), basis: 'content-shape' };
}

/**
 * bindGis(graph, data, {opVersion}) — record every dataset now in `data` and every one added later.
 * Returns {refOf(dsId) → node id | null, unbind(), refused()} — `refused` lists records that could not enter and why.
 */
export function bindGis(graph, data, opts) {
  opts = opts || {};
  const ref = new Map();
  const refused = [];
  let off = null;

  function record(rec) {
    if (!rec || !rec.id) return null;
    if (ref.has(rec.id)) return ref.get(rec.id);
    const p = rec.provenance || {};
    let r;
    if (p.kind === 'op') {
      const inputs = [];
      for (const i of (Array.isArray(p.inputs) ? p.inputs : [])) {
        let n = ref.get(i);
        if (!n && data && typeof data.get === 'function' && data.get(i)) n = record(data.get(i));
        if (n) inputs.push(n);
      }
      if (!inputs.length) { refused.push({ id: rec.id, why: 'inputs-not-recorded' }); return null; }
      r = graph.putDerived({
        type: 'gis_op', label: String(rec.title || p.op || rec.id), inputs,
        calc: { op: p.op, opVersion: typeof opts.opVersion === 'function' ? opts.opVersion() : '', params: p.params || null },
        output: { kind: rec.kind || 'vector', count: rec.count, geometryType: rec.geometryType, withGeometry: rec.withGeometry, fields: fieldShape(rec), coverage: p.coverage || null },
        meta: { dataset: rec.id, upstreams: p.upstreams || null, recordedAt: p.recordedAt || null },
      });
    } else {
      const v = datasetVersion(rec);
      r = graph.putSource({ type: 'dataset', key: datasetKey(rec), label: rec.title || rec.id, version: v.version, versionBasis: v.basis, meta: { dataset: rec.id, kind: p.kind || 'unknown', rights: p.rights || null, at: p.at || p.readAt || p.retrievedAt || null } });
    }
    if (!r || !r.ok) { refused.push({ id: rec.id, why: (r && r.why) || 'failed' }); return null; }
    ref.set(rec.id, r.id);
    return r.id;
  }

  if (data && typeof data.list === 'function') for (const rec of data.list()) record(rec);
  if (data && typeof data.subscribe === 'function') off = data.subscribe((what, rec) => { if (what === 'add') record(rec); });
  return { refOf: (dsId) => ref.get(dsId) || null, unbind: () => { if (off) off(); off = null; }, refused: () => refused.slice() };
}

const sameValue = (a, b) => a != null && b != null && isFinite(a) && isFinite(b) && Number(a) === Number(b);

/**
 * recordAnswer(graph, {registry, claims, callId, model}) → {recorded:[ids], inference:n, uncited:n, unresolved:n}
 * `registry` is js/atlas-evidence.js's; `claims` the normalised answer's `claims` (js/atlas-answer-contract.js).
 */
export function recordAnswer(graph, args) {
  const registry = args && args.registry;
  const claims = Array.isArray(args && args.claims) ? args.claims : [];
  const out = { recorded: [], inference: 0, uncited: 0, unresolved: 0 };
  if (!registry || typeof registry.get !== 'function') return out;

  const sourceOf = new Map();   /* registry record id → { node id, facts[] } or null */
  function nodeOfRecord(rec) {
    if (sourceOf.has(rec.id)) return sourceOf.get(rec.id);
    let res = null;
    const g = rec.graphRef ? graph.get(rec.graphRef) : null;
    if (g) {
      /* the facts code attached to the record (a GIS result put in front of the model) and the node's own value */
      res = { id: g.id, values: (Array.isArray(rec.supportFacts) ? rec.supportFacts : []).map((f) => f.value)
        .concat(g.kind === 'derived' && g.output && g.output.value != null ? [g.output.value] : []) };
    } else {
      const facts = Array.isArray(rec.supportFacts) ? rec.supportFacts : [];
      const web = !!rec.canonicalUrl;
      const key = web ? rec.canonicalUrl : ((rec.dataBlock ? 'block:' : (rec.origin === 'calculation' ? 'calc:' : 'app:')) + (rec.title || rec.label || rec.publisher || rec.id));
      const version = rec.publishedAt || rec.validTime || (facts.length ? fingerprint(facts) : '');
      const basis = rec.publishedAt ? 'published_at' : (rec.validTime ? 'valid_time' : 'content-facts');
      const s = graph.putSource({ type: web ? 'web_document' : 'app_data', key, label: rec.title || rec.publisher || key, version, versionBasis: basis, meta: { retrievedAt: rec.retrievedAt || null, origin: rec.origin, publisher: rec.publisher || null } });
      res = s.ok ? { id: s.id, values: facts.map((f) => f.value) } : null;
    }
    sourceOf.set(rec.id, res);
    return res;
  }

  for (const c of claims) {
    const m = c && c.metric;
    if (!m || m.value == null) continue;                       /* only a stated figure is a number to trace */
    const ids = Array.isArray(c.evidenceIds) ? c.evidenceIds : [];
    const used = [];
    for (const eid of ids) {
      const rec = registry.get(eid);
      if (!rec) { out.unresolved++; continue; }
      const n = nodeOfRecord(rec);
      if (n) used.push(n);
    }
    if (!used.length) { out.uncited++; continue; }
    const backed = used.some((u) => u.values.some((v) => sameValue(v, m.value)));
    const r = graph.putDerived({
      type: backed ? 'answer_number' : 'ai_inference',
      label: String(m.concept || m.seriesId || c.id || 'figure').slice(0, 120),
      inputs: used.map((u) => u.id),
      calc: { op: backed ? 'stated_in_record' : 'model_statement', opVersion: 'answer-contract', params: { claimId: String(c.id || '') } },
      output: { value: m.value, unit: m.unit || '', period: m.period || '', geography: m.geography || '', concept: m.concept || '', seriesId: m.seriesId || '' },
      meta: { callId: (args && args.callId) || null, turnId: (args && args.turnId) || null, model: (args && args.model) || null,
        /* which of the cited nodes themselves hold this value — what corroboration is counted from (js/evidence-graph-deliver.js) */
        statedBy: used.filter((u) => u.values.some((v) => sameValue(v, m.value))).map((u) => u.id) },
    });
    if (r.ok) { out.recorded.push(r.id); if (!backed) out.inference++; }
  }
  return out;
}

/** the evidence nodes recorded for one turn's answers — what a notebook entry of that turn rests on */
export function evidenceRefsForTurn(graph, turnId) {
  if (!turnId) return [];
  return graph.all().filter((n) => n.kind === 'derived' && n.meta && n.meta.turnId === turnId).map((n) => n.id);
}

/**
 * recordNews(graph, items) → [source node ids] — news documents as source nodes, so a figure or a note can cite them.
 * A news item is a web document: its key is its URL, its version the time it was published (or, failing that, nothing —
 * `unversioned`; a retrieval clock is NOT a publication date). The registry already does this for the documents an
 * ANSWER cites; this is for the ones a caller holds before any answer exists (the loaded feed, a briefing's sources).
 */
export function recordNews(graph, items) {
  const ids = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    const url = it && (it.url || it.link || it.canonicalUrl);
    if (!url || !/^https?:\/\//i.test(String(url))) continue;
    const r = graph.putSource({ type: 'web_document', key: String(url), label: it.title || it.headline || url, version: it.publishedAt || it.date || it.seendate || '', versionBasis: 'published_at',
      meta: { publisher: it.source || it.publisher || it.domain || null, retrievedAt: it.retrievedAt || null } });
    if (r.ok) ids.push(r.id);
  }
  return ids;
}

/**
 * recordNote(graph, entry) → {ok, id} | {ok:false, why} — a notebook entry (js/atlas-notebook-store.js) as a derived
 * `other` node whose inputs are the evidence nodes of that turn (`entry.evidenceRefs`, ids code minted when the turn's
 * answer was recorded) plus the documents the entry lists as sources. A note that cites nothing the graph holds is not a node.
 * The note's own text is not part of the lineage — it is the reader's; only what it RESTS ON is.
 */
export function recordNote(graph, entry) {
  if (!entry || !entry.id) return { ok: false, why: 'no-entry' };
  const inputs = (Array.isArray(entry.evidenceRefs) ? entry.evidenceRefs : []).filter((id) => graph.get(id));
  for (const sId of recordNews(graph, entry.sources || [])) if (inputs.indexOf(sId) < 0) inputs.push(sId);
  if (!inputs.length) return { ok: false, why: 'nothing-cited' };
  return graph.putDerived({ type: 'other', label: String(entry.title || entry.question || entry.id).slice(0, 140), inputs,
    calc: { op: 'investigation_note', opVersion: 'notebook-v1', params: { entry: entry.id } },
    output: { entry: entry.id, question: String(entry.question || '').slice(0, 300), answerLength: String(entry.answer || '').length },
    meta: { notebookEntry: entry.id } });
}

/**
 * datasetFacts(data, ids, refOf) → app-fact records for js/atlas-evidence.js `addAppData`, one per dataset,
 * each carrying the `graphRef` of the dataset's node so an answer figure drawn from it traces through the GIS chain.
 * The facts are what the dataset MEASURED about itself — row count, and min / max / filled-of-total for each numeric
 * column — never a statistic computed here. A dataset the graph has no node for is still offered (no graphRef): the
 * figures are real, the lineage just starts at the answer.
 */
export function datasetFacts(data, ids, refOf) {
  const out = [];
  for (const id of (Array.isArray(ids) ? ids : [])) {
    const rec = data && typeof data.get === 'function' ? data.get(id) : null;
    if (!rec) continue;
    const facts = [{ seriesId: 'gis.' + rec.id + '.rows', concept: 'rows', value: +rec.count || 0, unit: 'rows', basis: 'reported', geography: '', period: 'latest' }];
    for (const c of (Array.isArray(rec.fields) ? rec.fields : [])) {
      if (!c || c.type !== 'number') continue;
      const mk = (k, v) => ({ seriesId: 'gis.' + rec.id + '.' + c.name + '.' + k, concept: c.name + ' ' + k, value: v, unit: c.unit || '', basis: 'reported', geography: '', period: 'latest' });
      facts.push(mk('filled', c.filled));
      if (isFinite(c.min)) facts.push(mk('min', +c.min));
      if (isFinite(c.max)) facts.push(mk('max', +c.max));
    }
    out.push({ title: String(rec.title || rec.id), publisher: 'IntMap', validTime: 'latest', dateType: 'valid_time', label: 'GIS', supportFacts: facts,
      graphRef: typeof refOf === 'function' ? refOf(rec.id) : null });
  }
  return out;
}

/* ── the page's one graph ─────────────────────────────────────────────────────────────────────── */
let SHARED = null;
/** sharedEvidenceGraph() — the page-lifetime graph, bound to window.IntMapData once it exists (idempotent). */
export function sharedEvidenceGraph(scope) {
  const g = scope || (typeof globalThis !== 'undefined' ? globalThis : {});
  if (!SHARED) SHARED = { graph: makeEvidenceGraph(), gis: null, boundTo: null };
  const data = g.IntMapData || null;
  if (data && SHARED.boundTo !== data) {
    if (SHARED.gis) SHARED.gis.unbind();
    const ops = g.IntMapGisOps;
    SHARED.gis = bindGis(SHARED.graph, data, { opVersion: () => (ops && typeof ops.version === 'function' ? ops.version() : '') });
    SHARED.boundTo = data;
  }
  return { graph: SHARED.graph, refOfDataset: (id) => (SHARED.gis ? SHARED.gis.refOf(id) : null) };
}

/** datasetFactsOnPage(ids) — datasetFacts over the page's registry, with each figure's graph ref; [] when there is no registry. */
export function datasetFactsOnPage(ids, scope) {
  const g = scope || (typeof globalThis !== 'undefined' ? globalThis : {});
  const eg = sharedEvidenceGraph(g);
  return datasetFacts(g.IntMapData || null, Array.isArray(ids) ? ids : [], eg.refOfDataset);
}

/**
 * makeTurnObserver(since, scope) → () → string[] — the lines js/atlas-goal-verify.js shows its reader beside the record
 * of operations: what the datasets created since `since` (a turn's start, ms) hold, and what stands behind each figure
 * recorded since. Facts from the registry and the graph only; empty when the turn made neither.
 */
export function makeTurnObserver(since, scope) {
  return () => {
    const g = scope || (typeof globalThis !== 'undefined' ? globalThis : {});
    const eg = sharedEvidenceGraph(g);
    const data = g.IntMapData;
    const datasets = data && typeof data.list === 'function' ? data.list().filter((r) => (+r.createdAt || 0) >= since) : [];
    const answerNodes = eg.graph.all().filter((n) => n.kind === 'derived' && (n.type === 'answer_number' || n.type === 'ai_inference') && (Date.parse(n.createdAt) || 0) >= since).map((n) => n.id);
    return observationLines(assessDeliverable({ graph: eg.graph, datasets, answerNodes }));
  };
}
