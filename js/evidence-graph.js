/* ============================================================================
 *  IntMap · EVIDENCE GRAPH — the lineage of a number, kept past the call that made it
 * ----------------------------------------------------------------------------
 *  「この数値は元データ → 変換 → 空間結合 → 集計 → 指標 → 回答 のどこから来たか」を、1 呼び出しの外でも辿れる。
 *
 *  WHAT THIS IS NOT. js/atlas-evidence.js is the registry of ONE model call (≤40 records): it decides which
 *  source a sentence may cite and it dies with the answer. GIS keeps its own in-session lineage
 *  (js/gis-datasets.js `lineage`), data-governance carries terms, the world graph keeps stated claims.
 *  None of them answers «if this input changes, which results are no longer true?». This graph does, and it
 *  is built FROM those — it adds no second judge of any of them.
 *
 *  TWO KINDS OF NODE, NEVER BLENDED
 *    source   the system of record: a dataset, a web document, an app-held series, a world object. Stated by
 *             someone else; IntMap only records WHICH version of it was read. Versions accumulate (append-only);
 *             the node id is stable across them.
 *    derived  something IntMap or a model MADE: a GIS op output, a computed metric, a number in an answer.
 *             It carries the inputs it read WITH THE VERSION of each (`inputs:[{id, version}]`) and the
 *             calculation (`calc:{op, opVersion, params}`). Its id is content-addressed over those, so recording
 *             the same derivation twice is the same node (idempotent — no second row, no second «result»).
 *
 *  THE TWO RULES THAT MAKE IT A LINEAGE AND NOT A LOG
 *   ① A derived node may only name inputs that ARE nodes. A dangling reference is refused (`unknown-input`),
 *     because a trace that stops at a name nobody can open is not a trace.
 *   ② A version is stated or it is `unversioned`. Nothing is filled in from a clock to look complete: a source
 *     whose version we could not tell is reported as such, and an update to it can only be detected by the
 *     version changing from or to that state.
 *
 *  THE QUESTIONS IT ANSWERS (all pure over the graph)
 *     trace(id)            the closure upstream to sources: every step, with the version it pinned
 *     impact(id)           everything derived from `id`, transitively — «what does this feed?»
 *     staleness(id)        a derived node is stale when an input's CURRENT version differs from the pinned one,
 *                          or any input is itself stale (the chain, not only the first link)
 *     wouldStale(id, v)    BEFORE updating a source: which derived nodes become stale if it moves to version v
 *
 *  ⚠ A MODEL NEVER WRITES A NODE. Nodes are made by code from records code holds (registry records, dataset
 *  records). A claim's `evidenceIds` that name no record produce no edge and are counted (`unresolved`), so the
 *  «the model may only reference ids» design of js/atlas-evidence.js is the only way in.
 *
 *  Pure, DOM-free, no I/O. Persistence is a `snapshot()` / `restore()` pair (plain JSON): the caller decides where
 *  it lives (a project save today; a server table later — supabase has no table for it yet, see
 *  docs/architecture/05-ai.md «Evidence Graph»).
 * ==========================================================================*/

export const GRAPH_VERSION = 1;
export const SOURCE_TYPES = ['dataset', 'web_document', 'app_data', 'world_object', 'other'];
export const DERIVED_TYPES = ['gis_op', 'metric', 'answer_number', 'ai_inference', 'other'];

/* A fingerprint, not a signature: 53-bit cyrb53 over a canonical JSON. It names «the same inputs and the same
   calculation», it does not defend against anyone — so it is synchronous (a lineage must not need `await`). */
function cyrb53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* canonical: object keys sorted, undefined dropped — so the same content is the same string wherever it was built */
export function canonical(v) {
  if (v === undefined || typeof v === 'function') return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined && typeof v[k] !== 'function').sort()
    .map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}
export function fingerprint(v) { return cyrb53(canonical(v)); }

const UNVERSIONED = 'unversioned';
const clamp = (s, n) => String(s == null ? '' : s).slice(0, n);

export function makeEvidenceGraph(opts) {
  opts = opts || {};
  const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
  const nodes = new Map();       /* id → node */
  const feeds = new Map();       /* input id → Set(derived ids)  — the reverse index impact() walks */

  const refused = (why, detail) => ({ ok: false, why, detail: detail || null });

  /* ── source ────────────────────────────────────────────────────────────────────────────────── */
  /**
   * putSource({type, key, label, version, versionBasis, meta}) → {ok, id, version, changed}
   * `key` is the source's identity (a URL key, a layer id, a world-object ref) — never a display name.
   * `changed` is true when this appended a NEW version to an existing source (the signal an update happened).
   */
  function putSource(s) {
    s = s || {};
    const type = SOURCE_TYPES.indexOf(s.type) >= 0 ? s.type : 'other';
    const key = clamp(s.key, 300);
    if (!key) return refused('no-key');
    const id = 'src:' + type + ':' + key;
    const version = s.version == null || s.version === '' ? UNVERSIONED : clamp(s.version, 120);
    const basis = version === UNVERSIONED ? 'none' : clamp(s.versionBasis || 'stated', 40);
    const prev = nodes.get(id);
    if (!prev) {
      nodes.set(id, {
        id, kind: 'source', type, key, label: clamp(s.label || key, 200),
        versions: [{ version, basis, at: now(), meta: s.meta || null }],
      });
      return { ok: true, id, version, changed: false };
    }
    const cur = prev.versions[prev.versions.length - 1];
    if (cur.version === version) return { ok: true, id, version, changed: false };
    prev.versions.push({ version, basis, at: now(), meta: s.meta || null });
    if (s.label) prev.label = clamp(s.label, 200);
    return { ok: true, id, version, changed: true, previous: cur.version };
  }

  const currentVersion = (n) => n.kind === 'source'
    ? n.versions[n.versions.length - 1].version
    : n.output.fingerprint;

  /* ── derived ───────────────────────────────────────────────────────────────────────────────── */
  /**
   * putDerived({type, label, inputs:[id | {id}], calc:{op, opVersion, params}, output:{…}, meta}) → {ok, id, existed}
   * Each input's CURRENT version is pinned onto the edge at this moment. Refused: no inputs, or an unknown input.
   * `output.fingerprint` is the version OTHER derived nodes will pin when they read this one; if the caller gave
   * none it is derived from the output summary.
   */
  function putDerived(d) {
    d = d || {};
    const type = DERIVED_TYPES.indexOf(d.type) >= 0 ? d.type : 'other';
    const rawIn = Array.isArray(d.inputs) ? d.inputs : [];
    if (!rawIn.length) return refused('no-inputs');
    const inputs = [];
    for (const r of rawIn) {
      const iid = typeof r === 'string' ? r : (r && r.id);
      const n = nodes.get(iid);
      if (!n) return refused('unknown-input', { id: iid == null ? null : String(iid) });
      if (!inputs.some((x) => x.id === iid)) inputs.push({ id: iid, version: currentVersion(n) });
    }
    const calc = {
      op: clamp(d.calc && d.calc.op, 80),
      opVersion: clamp(d.calc && d.calc.opVersion, 40),
      params: (d.calc && d.calc.params) || null,
    };
    const output = Object.assign({}, d.output || {});
    const idSeed = { type, inputs, calc, out: output.fingerprint || output };
    const id = 'drv:' + type + ':' + fingerprint(idSeed);
    if (nodes.has(id)) return { ok: true, id, existed: true };
    if (!output.fingerprint) output.fingerprint = fingerprint(output);
    nodes.set(id, { id, kind: 'derived', type, label: clamp(d.label || calc.op || type, 200), inputs, calc, output, meta: d.meta || null, createdAt: now() });
    for (const i of inputs) { if (!feeds.has(i.id)) feeds.set(i.id, new Set()); feeds.get(i.id).add(id); }
    return { ok: true, id, existed: false };
  }

  /* ── questions ─────────────────────────────────────────────────────────────────────────────── */
  /** trace(id) → {ok, root, steps:[node…, upstream-first], sources:[source node…]} — the full chain back to the records of origin. */
  function trace(id) {
    const root = nodes.get(id);
    if (!root) return refused('unknown-node', { id: String(id) });
    const seen = new Set(), steps = [];
    (function walk(n) {
      if (seen.has(n.id)) return;
      seen.add(n.id);
      if (n.kind === 'derived') for (const i of n.inputs) { const m = nodes.get(i.id); if (m) walk(m); }
      steps.push(n);
    })(root);
    return { ok: true, root: id, steps, sources: steps.filter((n) => n.kind === 'source') };
  }

  /** impact(id) → ids of every derived node that reads `id` directly or through others (nearest first). */
  function impact(id) {
    if (!nodes.has(id)) return refused('unknown-node', { id: String(id) });
    const out = [], seen = new Set([id]);
    let frontier = [id];
    while (frontier.length) {
      const next = [];
      for (const f of frontier) for (const d of (feeds.get(f) || [])) if (!seen.has(d)) { seen.add(d); out.push(d); next.push(d); }
      frontier = next;
    }
    return { ok: true, id, derived: out };
  }

  /** staleness(id) → null when every pinned input is still current all the way up; else the first cause found. */
  function staleness(id, _seen) {
    const n = nodes.get(id);
    if (!n) return refused('unknown-node', { id: String(id) });
    if (n.kind !== 'derived') return null;
    const seen = _seen || new Set();
    if (seen.has(id)) return null;
    seen.add(id);
    for (const i of n.inputs) {
      const m = nodes.get(i.id);
      if (!m) return { id, cause: 'input-missing', input: i.id };
      const cur = currentVersion(m);
      if (cur !== i.version) return { id, cause: 'input-version-changed', input: i.id, pinned: i.version, current: cur };
      const up = m.kind === 'derived' ? staleness(i.id, seen) : null;
      if (up && up.ok !== false) return { id, cause: 'input-stale', input: i.id, via: up };
    }
    return null;
  }

  /** wouldStale(sourceId, newVersion) → derived ids that would stop being current if the source moved to `newVersion`. Read-only. */
  function wouldStale(sourceId, newVersion) {
    const n = nodes.get(sourceId);
    if (!n) return refused('unknown-node', { id: String(sourceId) });
    const v = newVersion == null || newVersion === '' ? UNVERSIONED : String(newVersion);
    if (currentVersion(n) === v) return { ok: true, id: sourceId, derived: [] };
    const hit = impact(sourceId).derived.filter((d) => {
      const dn = nodes.get(d);
      return dn.inputs.some((i) => i.id === sourceId && i.version !== v);
    });
    /* a derived node downstream of a stale one is stale too — the reach, not only the first ring */
    const all = new Set(hit);
    for (const h of hit) for (const d of impact(h).derived) all.add(d);
    return { ok: true, id: sourceId, derived: Array.from(all) };
  }

  const get = (id) => nodes.get(id) || null;
  const all = () => Array.from(nodes.values());

  function snapshot() {
    return { graphVersion: GRAPH_VERSION, nodes: all().map((n) => JSON.parse(JSON.stringify(n))) };
  }
  /** restore(snap) → {ok, nodes}  — replaces the content. A snapshot of another graphVersion is refused, never guessed at. */
  function restore(snap) {
    if (!snap || snap.graphVersion !== GRAPH_VERSION || !Array.isArray(snap.nodes)) return refused('bad-snapshot');
    nodes.clear(); feeds.clear();
    for (const n of snap.nodes) if (n && n.id) nodes.set(n.id, JSON.parse(JSON.stringify(n)));
    for (const n of nodes.values()) if (n.kind === 'derived') for (const i of n.inputs) { if (!feeds.has(i.id)) feeds.set(i.id, new Set()); feeds.get(i.id).add(n.id); }
    return { ok: true, nodes: nodes.size };
  }

  return { putSource, putDerived, trace, impact, staleness, wouldStale, get, all, snapshot, restore, size: () => nodes.size, UNVERSIONED };
}
