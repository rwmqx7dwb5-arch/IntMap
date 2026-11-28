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
import { compareQuantity } from './atlas-evidence.js';
import * as dataImpact from './data-impact.js';
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
  const stated = p.sha256 || p.etag || p.version || p.sourceVersion;
  if (stated) return { version: String(stated), basis: p.sha256 ? 'sha256' : 'stated' };
  return { version: fingerprint({ n: rec.count, g: rec.geometryType, wg: rec.withGeometry, f: fieldShape(rec), b: p.bounds || null, w: p.width || null, h: p.height || null }), basis: 'content-shape' };
}

/**
 * bindGis(graph, data, {opVersion}) — record every dataset now in `data` and every one added later.
 * Returns {refOf(dsId) → node id | null, unbind(), refused()} — `refused` lists records that could not enter and why.
 */
export function bindGis(graph, data, opts) {
  opts = opts || {};
  const ref = new Map(), versions = new Map(), recording = new Set();
  const refused = [];
  let off = null;

  function record(rec) {
    if (!rec?.id || recording.has(rec.id)) return null;
    const registryVersion = data.versionOf?.(rec.id);
    const previous = ref.get(rec.id);
    if (previous?.record === rec && previous?.registryVersion === registryVersion) return previous;
    recording.add(rec.id);
    try { return recordFresh(rec, registryVersion); }
    finally { recording.delete(rec.id); }
  }

  function recordFresh(rec, registryVersion) {
    const p = rec.provenance || {};
    let r;
    if (p.kind === 'map-reconstruction' && (p.mapSource || p.source)) {
      const original = p.mapSource || {};
      const sourceKey = original.url || original.attachment || p.source;
      const sha = original.sha256 || p.sourceSha256;
      const source = graph.putSource({
        type: original.url ? 'web_document' : 'dataset', key: sourceKey, label: original.name || sourceKey,
        version: sha, versionBasis: 'sha256',
        meta: { retrievedAt: p.retrievedAt, licence: p.licence || null, representation: original.representation },
      });
      if (!source.ok) { refused.push({ id: rec.id, why: source.why }); return null; }
      const inputs = [{ id: source.id, version: source.version }];
      for (const id of p.inputs || []) {
        const expected = p.inputVersions?.find(entry => entry.id === id)?.version;
        const n = expected == null ? record(data.get?.(id)) || ref.get(id)
          : versions.get(id)?.get(expected) || (data.versionOf?.(id) === expected ? record(data.get?.(id)) : null);
        if (!n) { refused.push({ id: rec.id, why: 'inputs-not-recorded' }); return null; }
        inputs.push(n);
      }
      r = graph.putDerived({
        type: 'gis_op', label: rec.title || rec.id, inputs,
        calc: { op: 'map.reconstruct', params: { recipe: p.recipe, provenanceSha256: p.output?.provenanceSha256, quality: p.quality } },
        output: { ...p.output, quality: p.quality, count: rec.count, geometryType: rec.geometryType },
        meta: { dataset: rec.id },
      });
    } else if (p.kind === 'op' || (p.kind === 'compute' && p.inputs?.length)) {
      const inputs = [];
      for (const id of (Array.isArray(p.inputs) ? p.inputs : [])) {
        const expected = p.inputVersions?.find((entry) => entry.id === id)?.version;
        const n = expected == null ? record(data.get?.(id)) || ref.get(id)
          : versions.get(id)?.get(expected) || (data.versionOf?.(id) === expected ? record(data.get?.(id)) : null);
        if (n) inputs.push(n);
      }
      if (!inputs.length || inputs.length !== p.inputs.length) { refused.push({ id: rec.id, why: 'inputs-not-recorded' }); return null; }
      r = graph.putDerived({
        type: 'gis_op', label: String(rec.title || p.op || rec.id), inputs,
        calc: p.kind === 'compute' ? { op: 'compute.run', opVersion: p.runtime, params: { codeSha256: p.codeSha256, output: p.output, inputVersions: p.inputVersions } }
          : { op: p.op, opVersion: typeof opts.opVersion === 'function' ? opts.opVersion() : '', params: p.params || null },
        output: { kind: rec.kind || 'vector', count: rec.count, geometryType: rec.geometryType, withGeometry: rec.withGeometry, fields: fieldShape(rec), coverage: p.coverage || null },
        meta: { dataset: rec.id, upstreams: p.upstreams || null, recordedAt: p.recordedAt || null },
      });
    } else {
      const v = datasetVersion(rec);
      r = graph.putSource({ type: 'dataset', key: datasetKey(rec), label: rec.title || rec.id, version: v.version, versionBasis: v.basis, meta: { dataset: rec.id, kind: p.kind || 'unknown', rights: p.rights || null, at: p.at || p.readAt || p.retrievedAt || null } });
    }
    if (!r || !r.ok) { refused.push({ id: rec.id, why: (r && r.why) || 'failed' }); return null; }
    const pin = { id: r.id, version: r.version, record: rec, registryVersion };
    ref.set(rec.id, pin);
    if (registryVersion != null) {
      if (!versions.has(rec.id)) versions.set(rec.id, new Map());
      versions.get(rec.id).set(registryVersion, { id: r.id, version: r.version });
    }
    return pin;
  }

  if (data && typeof data.list === 'function') for (const rec of data.list()) record(rec);
  if (data && typeof data.subscribe === 'function') off = data.subscribe((what, rec) => { if (what === 'add') record(rec); });
  return { refOf: (dsId) => ref.get(dsId)?.id || null, versionOf: (dsId) => ref.get(dsId)?.version || null, unbind: () => { if (off) off(); off = null; }, refused: () => refused.slice() };
}

/**
 * recordAnswer(graph, {registry, claims, callId, model}) → {recorded:[ids], inference:n, uncited:n, unresolved:n}
 * `registry` is js/atlas-evidence.js's; `claims` the normalised answer's `claims` (js/atlas-answer-contract.js).
 */
export function recordAnswer(graph, args) {
  const registry = args && args.registry;
  const claims = Array.isArray(args && args.claims) ? args.claims : [];
  const out = { recorded: [], inference: 0, uncited: 0, unresolved: 0 };
  if (!registry || typeof registry.get !== 'function') return out;

  const sourceOf = new Map();   /* registry record id → { id, version } or null */
  function nodeOfRecord(rec) {
    if (sourceOf.has(rec.id)) return sourceOf.get(rec.id);
    let res = null;
    const g = rec.graphRef ? graph.get(rec.graphRef) : null;
    if (g) {
      res = { id: g.id, version: rec.graphVersion || undefined };
    } else {
      const facts = Array.isArray(rec.supportFacts) ? rec.supportFacts : [];
      const web = !!rec.canonicalUrl;
      const key = web ? rec.canonicalUrl : ((rec.dataBlock ? 'block:' : (rec.origin === 'calculation' ? 'calc:' : 'app:')) + (rec.title || rec.label || rec.publisher || rec.id));
      const version = rec.sourceVersion ? [rec.retrievedAt, rec.sourceVersion].join('@') : rec.publishedAt || rec.validTime || (facts.length ? fingerprint(facts) : '');
      const basis = rec.sourceVersion ? 'retrieved-version' : rec.publishedAt ? 'published_at' : (rec.validTime ? 'valid_time' : 'content-facts');
      const s = graph.putSource({ type: web ? 'web_document' : 'app_data', key, label: rec.title || rec.publisher || key, version, versionBasis: basis,
        retrievedVersion: !!rec.sourceVersion, meta: { title: rec.title || null, retrievedAt: rec.retrievedAt || null, origin: rec.origin, publisher: rec.publisher || null, primarySource: rec.primarySource || null } });
      res = s.ok ? { id: s.id, version: s.version } : null;
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
      if (n) used.push({ ...n, matched: (rec.supportFacts || []).some((f) => compareQuantity(m, f).matches) });
    }
    if (!used.length) { out.uncited++; continue; }
    const backed = used.some((u) => u.matched);
    const r = graph.putDerived({
      type: backed ? 'answer_number' : 'ai_inference',
      label: String(m.concept || m.seriesId || c.id || 'figure').slice(0, 120),
      inputs: used.map(({ id, version }) => ({ id, version })),
      calc: { op: backed ? 'stated_in_record' : 'model_statement', opVersion: 'answer-contract', params: { claimId: String(c.id || '') } },
      output: { value: m.value, unit: m.unit || '', period: m.period || '', geography: m.geography || '', concept: m.concept || '', seriesId: m.seriesId || '' },
      meta: { callId: (args && args.callId) || null, turnId: (args && args.turnId) || null, model: (args && args.model) || null,
        /* which of the cited nodes themselves hold this value — what corroboration is counted from (js/evidence-graph-deliver.js) */
        statedBy: used.filter((u) => u.matched).map((u) => u.id) },
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
function datasetPeriod(time) {
  if (!time || time.kind !== 'constant') return '';
  const stamp = (ms) => Number.isFinite(ms) ? new Date(ms).toISOString().replace(/\.000Z$/, 'Z') : '';
  const start = stamp(time.start), end = stamp(time.end);
  if (start === end) return start;
  if (/^-?\d{4,6}-01-01T00:00:00Z$/.test(start)) {
    const year = start.slice(0, -16);
    if (end === year + '-12-31T23:59:59.999Z') return year;
  }
  return (start || '..') + '/' + (end || '..');
}

export function datasetFacts(data, ids, refOf, versionOf) {
  const out = [];
  for (const id of (Array.isArray(ids) ? ids : [])) {
    const rec = data && typeof data.get === 'function' ? data.get(id) : null;
    if (!rec) continue;
    const period = datasetPeriod(rec.time);
    const facts = [{ seriesId: 'gis.' + rec.id + '.rows', concept: 'rows', value: +rec.count || 0, unit: 'rows', basis: 'reported', geography: '', period }];
    for (const c of (Array.isArray(rec.fields) ? rec.fields : [])) {
      if (!c || c.type !== 'number') continue;
      const mk = (k, v) => ({ seriesId: 'gis.' + rec.id + '.' + c.name + '.' + k, concept: c.name + ' ' + k, value: v, unit: k === 'filled' ? 'rows' : c.unit || '', basis: 'reported', geography: '', period });
      facts.push(mk('filled', c.filled));
      if (Number.isFinite(c.min)) facts.push(mk('min', c.min));
      if (Number.isFinite(c.max)) facts.push(mk('max', c.max));
    }
    out.push({ title: String(rec.title || rec.id), publisher: 'IntMap', validTime: period, dateType: period ? 'valid_time' : '', label: 'GIS', supportFacts: facts,
      graphRef: typeof refOf === 'function' ? refOf(rec.id) : null, graphVersion: typeof versionOf === 'function' ? versionOf(rec.id) : null });
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
  /* what an upstream update reaches (js/data-impact.js): the same graph, so Atlas asks it and never keeps a second one */
  const graph = SHARED.graph;
  const refresh = {
    diff: (observed) => dataImpact.diffObserved(graph, observed),
    plan: (updates, o) => dataImpact.planRefresh(graph, updates, o),
    apply: (updates, o) => dataImpact.applyUpdates(graph, updates, o),
    execute: dataImpact.executePlan,
  };
  return { graph, refOfDataset: (id) => SHARED.gis?.refOf(id) || null, versionOfDataset: (id) => SHARED.gis?.versionOf(id) || null, refresh };
}

/** datasetFactsOnPage(ids) — datasetFacts over the page's registry, with each figure's graph ref; [] when there is no registry. */
export function datasetFactsOnPage(ids, scope) {
  const g = scope || (typeof globalThis !== 'undefined' ? globalThis : {});
  const eg = sharedEvidenceGraph(g);
  return datasetFacts(g.IntMapData || null, Array.isArray(ids) ? ids : [], eg.refOfDataset, eg.versionOfDataset);
}

/**
 * makeTurnObserver(since, scope, turnId) → (ctx) → string[] — what the exact dataset versions created by
 * the turn's calls hold, and what stands behind the figures explicitly recorded for this turn.
 */
export function makeTurnObserver(since, scope, turnId, map) {
  return (ctx) => {
    const g = scope || (typeof globalThis !== 'undefined' ? globalThis : {});
    const eg = sharedEvidenceGraph(g);
    const data = g.IntMapData;
    const created = new Map(), touchedObjects = new Set();
    for (const result of ctx?.results || []) {
      if (result?.ok || result?.status === 'partial') for (const id of result.objectIds || []) touchedObjects.add(String(id));
      for (const receipt of result?.details?.datasetsCreated || []) {
        if (receipt?.id && receipt.version != null) created.set(String(receipt.id), receipt.version);
      }
    }
    const datasets = data && typeof data.versionOf === 'function' ? data.list().filter((r) =>
      (+r.createdAt || 0) >= since && created.has(String(r.id)) && created.get(String(r.id)) === data.versionOf(r.id)) : [];
    const answerNodes = turnId == null ? [] : eg.graph.all().filter((n) =>
      n.kind === 'derived' && (n.type === 'answer_number' || n.type === 'ai_inference') && n.meta?.turnId === turnId).map((n) => n.id);
    const lines = observationLines(assessDeliverable({ graph: eg.graph, datasets, answerNodes }));
    for (const target of map?.initial || []) lines.push('Map reference present at request time: ' + JSON.stringify(target));
    if (touchedObjects.size && map?.turn != null) for (const row of g.IntMapObjects?.list?.() || []) {
      const p = row.shape?.provenance;
      if (touchedObjects.has(String(row.id)) && p?.author === 'atlas' && p.turnId === map.turn) {
        lines.push('Atlas created and drew this object in this turn: ' + JSON.stringify(map.describe(row)));
      }
    }
    return lines;
  };
}
