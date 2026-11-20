/* ============================================================================
 *  IntMap · Atlas fact merge — COMPARABILITY: may these two numbers be set side by side?   (js/atlas-fact-comparability.js)
 * ----------------------------------------------------------------------------
 *  js/atlas-fact-merge.js says whether workers stated the SAME value for one object and attribute. That is a
 *  weaker question than the one a reader needs: 「人口 13.9M」と「人口 9.7M」は食い違いか、それとも片方は都市圏・片方は
 *  行政区域か」. Two numbers that differ may differ because they measure different things, and two that agree may
 *  agree by accident. This file adds what can be OBSERVED about that, to every row two workers stated:
 *
 *    unit         the unit kernel's verdict when it is given (identical / convertible / incompatible / unknown), else
 *                 whether the spelling is the same
 *    scope        what a value is a measurement OF (admin-area, metro-area, radius …) — js/gis-semantics.js's vocabulary
 *    basis        the borders it was COUNTED in (present-day / as-of-time)
 *    period       the span a value covers (a year's total and one day's reading are not the same kind of number)
 *    aggregation  how it was reduced (sum / mean / …)
 *  Each facet is `same` (every fact states it, identically), `differs` (stated and unequal), `partial` (some state it,
 *  some do not — the silent ones are NAMED) or `unstated` (nobody did). A facet nobody stated is never read as
 *  「same」 (js/gis-semantics.js keeps the same rule: silence is its own state).
 *
 *  WHERE A FACET COMES FROM. A worker states it on the fact; failing that, a fact that names the dataset column it
 *  was read from (`column:{dataset,field}`) takes it from the SEMANTIC LAYER (js/gis-semantics.js describe()), marked
 *  `derived` with the layer named — the layer answers for a registered dataset, it does not guess for a web page.
 *  When both facts name columns, the layer's own `comparable()` verdict (quantity, borders, time) is attached whole.
 *
 *  AND WHAT HAS CHANGED UNDER THE NUMBER. A comparison across years of an administrative area is also a comparison
 *  of two shapes when the area was redrawn or merged. `ties(ref)` (the persistent world graph — js/world-graph-store.js
 *  — through the page) returns the object's ties with the periods they held and its own validity; those that BEGIN OR
 *  END INSIDE the span the compared values cover are returned as `changedWithin`, verbatim. Which of them is a
 *  boundary change, a merger or only a new operator is Atlas's reading: no relation name is interpreted here.
 *
 *  ⚠ NOTHING HERE IS A VERDICT AND NOTHING CHANGES A ROW'S `status`. `agree`, `conflict` and `single` stay what
 *  mergeFacts decided; `comparability` is an observation placed beside them, with `differs` / `unstated` listed so
 *  Atlas can say 「この 2 つは同じものを測っていない」 or 「測っているものが分からない」 — and keep both numbers.
 *  No DOM, no network: the semantic layer, the unit kernel and `ties` are handed in (every one optional; a missing
 *  one leaves its facet `unstated` and says so under `unobserved`).
 * ==========================================================================*/

const fold = (v) => String(v == null ? '' : v).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const FACETS = ['unit', 'scope', 'basis', 'period', 'aggregation'];

/** what the worker may state beyond value/unit/at — clean copies, nothing defaulted (js/atlas-fact-merge.js normalizeFact calls this) */
export function normalizeMeaning(f, timeMs) {
  const out = {};
  const scope = s(f.scope && typeof f.scope === 'object' ? f.scope.kind : f.scope, 40); if (fold(scope)) out.scope = scope;
  const basis = s(f.basis, 20); if (fold(basis)) out.basis = basis;
  const aggregation = s(f.aggregation, 24); if (fold(aggregation)) out.aggregation = aggregation;
  if (f.period && typeof f.period === 'object') {
    const a = timeMs(f.period.from), b = timeMs(f.period.to);
    if (a != null || b != null) out.period = { from: f.period.from != null ? s(f.period.from, 32) : undefined, to: f.period.to != null ? s(f.period.to, 32) : undefined };
  }
  if (f.column && typeof f.column === 'object') {
    const dataset = s(f.column.dataset, 160), field = s(f.column.field, 120);
    if (dataset && field) out.column = { dataset, field };
  }
  return out;
}

/** the key part of a period: two facts about the same year but different spans are different rows */
export const periodKey = (f, timeMs) => (f.period ? [timeMs(f.period.from), timeMs(f.period.to)].map((x) => (x == null ? '' : x)).join('~') : '');

/** the facets a fact does not state, read from the semantic layer through the column it names → { facet: {value, from} } */
export function fromSemantics(f, semantics) {
  const got = {};
  if (!f.column || !semantics || typeof semantics.describe !== 'function') return got;
  let d = null; try { d = semantics.describe(f.column.dataset); } catch (_) { d = null; }
  if (!d || !d.ok) return got;
  const col = (d.columns || []).find((c) => c.name === f.column.field);
  const take = (facet, st, pick) => { if (st && st.state && st.state !== 'unstated') { const v = pick ? pick(st.value) : st.value; if (v != null) got[facet] = { value: String(v), from: 'semantic-layer:' + f.column.dataset + (st.from ? ' (' + st.from + ')' : '') }; } };
  if (col) {
    take('basis', col.basis); take('unit', col.unit);
    if (col.aggregation && col.aggregation.state === 'stated') take('aggregation', col.aggregation);
  }
  if (!got.basis) take('basis', d.basis);
  take('scope', d.scope, (v) => (v && v.kind) || null);
  return got;
}

const facetValue = (f, facet, derived) => {
  if (facet === 'period') return f.period ? (s(f.period.from, 32) + ' → ' + s(f.period.to, 32)) : null;
  if (f[facet] != null && f[facet] !== '') return String(f[facet]);
  return derived && derived[facet] ? derived[facet].value : null;
};

/* assessRow(facts, ctx) → { state, facets, differing, unstated, semantics?, unobserved? }  — `facts` carry `.task`
   ctx: { semantics?, units? }   Only called for a row two or more workers stated. */
export function assessRow(facts, ctx) {
  ctx = ctx || {};
  const derived = facts.map((f) => fromSemantics(f, ctx.semantics));
  const facets = {}, differing = [], unstated = [], unobserved = [];
  FACETS.forEach((facet) => {
    const seen = new Map(), silent = [];
    facts.forEach((f, i) => {
      const v = facetValue(f, facet, derived[i]);
      if (v == null) { if (silent.indexOf(f.task) < 0) silent.push(f.task); return; }
      const k = facet === 'period' ? v : fold(v);
      if (!seen.has(k)) seen.set(k, { value: v, tasks: [], from: (f[facet] != null && f[facet] !== '') || (facet === 'period' && f.period) ? 'stated' : (derived[i][facet] || {}).from });
      const e = seen.get(k); if (e.tasks.indexOf(f.task) < 0) e.tasks.push(f.task);
    });
    const values = Array.from(seen.values());
    let state = !values.length ? 'unstated' : (silent.length ? 'partial' : (values.length > 1 ? 'differs' : 'same'));
    const out = { state, values };
    if (silent.length && values.length) out.silent = silent;
    if (facet === 'unit' && values.length > 1) {
      if (ctx.units && typeof ctx.units.compare === 'function') {
        const verdicts = [];
        for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) { try { verdicts.push(ctx.units.compare(values[i].value, values[j].value).verdict); } catch (_) { verdicts.push('unknown'); } }
        out.verdicts = Array.from(new Set(verdicts));
        /* a convertible pair is a difference of spelling, not of measurement; anything the kernel cannot read stays `differs` */
        if (out.verdicts.every((v) => v === 'convertible' || v === 'identical')) out.state = silent.length ? 'partial' : 'same';
      } else unobserved.push('unit-kernel');
    }
    facets[facet] = out;
    if (out.state === 'differs') differing.push(facet);
    if (out.state === 'unstated' || out.state === 'partial') unstated.push(facet);
  });
  const res = { state: differing.length ? 'differs' : (unstated.length ? 'unknown' : 'same'), facets, differing, unstated };
  /* the semantic layer's whole verdict for each pair of DISTINCT columns the facts were read from */
  if (ctx.semantics && typeof ctx.semantics.comparable === 'function') {
    const cols = [];
    facts.forEach((f) => { if (f.column && !cols.some((c) => c.dataset === f.column.dataset && c.field === f.column.field)) cols.push(f.column); });
    const pairs = [];
    for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
      let r = null; try { r = ctx.semantics.comparable(cols[i], cols[j]); } catch (_) { r = null; }
      if (r && r.ok) pairs.push({ a: cols[i], b: cols[j], comparable: r.comparable, quantity: r.quantity && r.quantity.verdict, warnings: (r.warnings || []).map((w) => ({ code: w.code, severity: w.severity, message: w.message })) });
      else pairs.push({ a: cols[i], b: cols[j], comparable: null, refused: r ? r.why : 'unobserved' });
    }
    if (pairs.length) res.semantics = pairs;
  } else if (facts.some((f) => f.column)) unobserved.push('semantic-layer');
  if (unobserved.length) res.unobserved = unobserved;
  return res;
}

/* boundaryChanges(ref, span, ties) → { checked, changedWithin[], validity? } for ONE object over [fromMs, toMs].
   `ties(ref)` → { ties:[{rel, ref, fromMs, toMs}], validity:{fromMs, toMs} } | null (sync or async). A failure is `checked:false` —
   «could not read the graph» is not 「nothing changed」. */
export async function boundaryChanges(ref, span, ties) {
  if (typeof ties !== 'function' || !ref || !span || span.fromMs == null || span.toMs == null) return { checked: false };
  let g = null;
  try { g = await ties(ref); } catch (_) { return { checked: false, failed: true }; }
  if (!g) return { checked: false };
  const inside = (ms) => ms != null && ms >= span.fromMs && ms <= span.toMs;
  const changed = [];
  (g.ties || []).forEach((t) => {
    if (inside(t.fromMs) || inside(t.toMs)) changed.push({ rel: t.rel, ref: t.ref, fromMs: t.fromMs == null ? undefined : t.fromMs, toMs: t.toMs == null ? undefined : t.toMs, begins: inside(t.fromMs) || undefined, ends: inside(t.toMs) || undefined });
  });
  const v = g.validity || {};
  const out = { checked: true, changedWithin: changed };
  if (inside(v.fromMs) || inside(v.toMs)) out.validity = { fromMs: v.fromMs == null ? undefined : v.fromMs, toMs: v.toMs == null ? undefined : v.toMs, begins: inside(v.fromMs) || undefined, ends: inside(v.toMs) || undefined };
  return out;
}
