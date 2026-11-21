/* ============================================================================
 *  IntMap · EVIDENCE GRAPH — what a turn DELIVERED, as opposed to what it DID
 * ----------------------------------------------------------------------------
 *  An operation that returned ok is not an investigation that reached its goal. 「20 都市の人口を比較して」 can run
 *  every call successfully and still hold 8 populations; one document cited three times is one witness, not three.
 *  The loop's record (js/atlas-goal-verify.js `recordOf`) says each operation worked. This says what the
 *  artefacts it left actually CONTAIN, and which conclusions rest on how many independent origins — read from
 *  the dataset registry and the evidence graph, by code, as FACTS.
 *
 *  ⚠ IT JUDGES NOTHING FOR ATLAS (CONSTITUTION.md §5). Nothing here knows what the request asked for — no word of
 *  it is read. It reports counts: rows, how many carry each field, which origins stand behind each figure. The
 *  reader of those facts is the separate goal verifier (js/atlas-goal-verify.js `observe`), which sees the request
 *  and decides whether 8 of 20 is a shortfall. A caller that DOES know the target (a capability that was told
 *  «20 cities») may pass `expected` and gets the shortfall computed; nobody has to guess it from prose.
 *  ⚠ NOT OBSERVED IS NOT MISSING: a dataset with no fields measured, a claim whose origin could not be traced —
 *  these are reported as `unobserved`, never as incomplete.
 *
 *  Pure, DOM-free, no I/O. Inputs are plain records (js/gis-datasets.js shape) and a graph (js/evidence-graph.js).
 * ==========================================================================*/

/** which origin a source node stands for: two pages of one host are one witness; a dataset is its layer key */
export function originOf(node) {
  if (!node || node.kind !== 'source') return null;
  if (node.type === 'web_document') {
    const m = /^(?:https?:\/\/)?([^/?#]+)/i.exec(String(node.key || ''));
    const host = m ? m[1].toLowerCase().replace(/^www\./, '') : String(node.key || '');
    return 'web:' + host;
  }
  return node.type + ':' + node.key;
}

/**
 * assessDataset(rec, {expected}) → what one dataset holds.
 *   fields[]    every column with how many rows carry a value (`filled` of `total`)
 *   partial[]   columns carried by fewer rows than the dataset has — the facts a «8 of 20» reading is made of
 *   expected    {count?, fields?:[names]} when the caller KNOWS the target; then `shortfall` is computed
 */
export function assessDataset(rec, opts) {
  if (!rec || typeof rec !== 'object') return null;
  const fields = (Array.isArray(rec.fields) ? rec.fields : []).filter((f) => f && f.name != null)
    .map((f) => ({ name: String(f.name), type: f.type || null, filled: +f.filled || 0, total: +f.total || 0 }));
  const count = +rec.count || 0;
  const observed = fields.length > 0 && fields.every((f) => f.total > 0);
  const partial = fields.filter((f) => f.total > 0 && f.filled < f.total).map((f) => ({ name: f.name, filled: f.filled, total: f.total }));
  const out = { dataset: rec.id || null, title: String(rec.title || rec.id || ''), count, observed, fields, partial, shortfall: null };
  const exp = opts && opts.expected;
  if (exp) {
    const sf = { count: null, fields: [] };
    if (exp.count != null && count < +exp.count) sf.count = { have: count, need: +exp.count };
    for (const name of (Array.isArray(exp.fields) ? exp.fields : [])) {
      const f = fields.find((x) => x.name === name);
      const need = exp.count != null ? +exp.count : count;
      if (!f) sf.fields.push({ name, have: 0, need, absent: true });
      else if (f.filled < need) sf.fields.push({ name, have: f.filled, need });
    }
    out.shortfall = (sf.count || sf.fields.length) ? sf : null;
  }
  return out;
}

/**
 * assessSupport(graph, nodeIds) → per figure: how many INDEPENDENT origins state it.
 *   citations     how many source edges the figure was built from (what a count of «sources» would say)
 *   independent   how many distinct origins those reduce to — one host cited three times is 1
 *   statedBy      the origins whose own record holds that very value (corroboration), when the recorder knew
 *   support       'model_only'  an ai_inference — no cited record states the value
 *                 'single'      one origin states it (or only one is traceable)
 *                 'corroborated' two or more distinct origins state it
 *                 'unobserved'  the node is unknown or has no traceable origin
 */
export function assessSupport(graph, nodeIds) {
  const rows = [];
  for (const id of (Array.isArray(nodeIds) ? nodeIds : [])) {
    const n = graph && graph.get(id);
    if (!n || n.kind !== 'derived') { rows.push({ id, support: 'unobserved', citations: 0, independent: 0, statedBy: [], origins: [] }); continue; }
    const t = graph.trace(id);
    const originsOf = (ids) => {
      const set = new Set();
      for (const i of ids) { const tt = graph.trace(i); if (tt.ok) for (const s of tt.sources) set.add(originOf(s)); }
      return Array.from(set);
    };
    const origins = t.ok ? Array.from(new Set(t.sources.map(originOf))) : [];
    const direct = n.inputs.map((i) => i.id);
    const statedIds = n.meta && Array.isArray(n.meta.statedBy) ? n.meta.statedBy : null;
    const statedBy = statedIds ? originsOf(statedIds) : [];
    let support;
    if (n.type === 'ai_inference') support = 'model_only';
    else if (!origins.length) support = 'unobserved';
    else if ((statedIds ? statedBy.length : origins.length) >= 2) support = 'corroborated';
    else support = 'single';
    rows.push({ id, label: n.label, value: n.output && n.output.value != null ? n.output.value : null, type: n.type, support,
      citations: direct.length, independent: origins.length, statedBy, origins });
  }
  return rows;
}

/**
 * assessDeliverable({graph, datasets, answerNodes, expected}) → {datasets, conclusions, gaps}
 *   gaps  the plain list of what is missing or thin — empty when there is nothing to report, NEVER «complete»:
 *         completeness against the request is the verifier's reading; this is only what the artefacts hold.
 */
export function assessDeliverable(args) {
  const a = args || {};
  const datasets = (Array.isArray(a.datasets) ? a.datasets : []).map((r) => assessDataset(r, { expected: a.expected && a.expected[r.id] })).filter(Boolean);
  const conclusions = a.graph ? assessSupport(a.graph, a.answerNodes || []) : [];
  const gaps = [];
  for (const d of datasets) {
    if (d.shortfall && d.shortfall.count) gaps.push({ kind: 'rows', what: d.title, have: d.shortfall.count.have, need: d.shortfall.count.need });
    for (const f of (d.shortfall ? d.shortfall.fields : [])) gaps.push({ kind: 'field', what: d.title + '.' + f.name, have: f.have, need: f.need, absent: !!f.absent });
    if (!d.shortfall) for (const p of d.partial) gaps.push({ kind: 'partial', what: d.title + '.' + p.name, have: p.filled, need: p.total });
  }
  for (const c of conclusions) {
    if (c.support === 'model_only') gaps.push({ kind: 'conclusion-unsupported', what: c.label || c.id, have: 0, need: 1 });
    else if (c.support === 'single' && c.citations > 1 && c.independent <= 1) gaps.push({ kind: 'conclusion-single-origin', what: c.label || c.id, have: 1, need: c.citations });
  }
  return { datasets, conclusions, gaps };
}

/** the lines the goal verifier is shown beside the record of operations — facts, in plain words, no verdict */
export function observationLines(report) {
  const out = [];
  for (const d of (report && report.datasets) || []) {
    if (!d.observed) { out.push(d.title + ': ' + d.count + ' rows (columns not measured)'); continue; }
    const thin = d.partial.map((p) => p.name + ' ' + p.filled + '/' + p.total);
    out.push(d.title + ': ' + d.count + ' rows' + (thin.length ? '; values present for ' + thin.join(', ') : '; every column filled'));
    if (d.shortfall) {
      if (d.shortfall.count) out.push('  expected ' + d.shortfall.count.need + ' rows, holds ' + d.shortfall.count.have);
      for (const f of d.shortfall.fields) out.push('  expected ' + f.need + ' values of ' + f.name + ', holds ' + f.have + (f.absent ? ' (no such column)' : ''));
    }
  }
  for (const c of (report && report.conclusions) || []) {
    const v = c.value != null ? ' = ' + c.value : '';
    const why = { model_only: 'the model\'s own figure — no cited record states it', single: c.citations > 1 ? 'built from ' + c.citations + ' citations that are ONE origin' : 'one origin', corroborated: c.independent + ' independent origins', unobserved: 'origin not traceable' }[c.support];
    out.push('figure ' + (c.label || c.id) + v + ': ' + why);
  }
  return out;
}
