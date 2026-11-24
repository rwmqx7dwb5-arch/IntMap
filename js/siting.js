/* ============================================================================
 *  IntMap · INDUSTRIAL SITING — compare places on what a plant needs   (js/siting.js)
 * ----------------------------------------------------------------------------
 *  A plant's location is a bundle of conditions: what power costs, what land costs, who can be hired, which
 *  research institutions are near, what rules apply. IntMap carried each of these in a different place or not at
 *  all. data/siting-<cc>.json puts the ones a public source states side by side per administrative area
 *  (scripts/build-siting-jp.mjs builds Japan's, by prefecture), and ties them to the company atlas's own sites
 *  (data/companies/footprint.json, placed in the area by polygon). This module reads that file.
 *
 *  ── WHAT IT DOES ──
 *    · `compare()` — the same table for any set of areas: each metric's value, its rank among ALL the country's areas
 *      (rank 1 is the better end of that metric: lowest price, highest count), the sample size where the source
 *      gives one, and the company sites in the area (optionally one sector: 'semi' finds the semiconductor firms).
 *    · carries each metric's source, vintage and caveat, the country's rules (statute text), and the `gaps` — the
 *      dimensions no usable source was found for — so an answer says what it did not measure.
 *  ── WHAT IT DOES NOT ──
 *    · add the metrics into one score. «Best» depends on the plant; weights are a judgement the reader or Atlas
 *      states, never one this file hides. Ranks are per metric and the table shows them side by side.
 *    · fill a null. A prefecture the source does not cover keeps null and the answer says so.
 *  ── WORLD ──
 *    Another country is one more file with the same schema (metric ids, units, `better`, per-metric source and
 *    vintage); `loadSiting(cc)` reads `data/siting-<cc>.json` and nothing else here names a country.
 *  The pure half is exported for node (tests/siting-checks.test.mjs).
 * ==========================================================================*/
import { jsonWithin } from './fetch-deadline.js';

const cache = new Map();
/** The country's siting file, or null when none is shipped for it. `cc` is the ISO-2 code, lower-cased in the file name. */
export async function loadSiting(cc = 'JP') {
  const k = String(cc).toLowerCase();
  if (!/^[a-z]{2}$/.test(k)) return null;
  if (!cache.has(k)) cache.set(k, jsonWithin('data/siting-' + k + '.json', 15000).catch(() => null));
  return cache.get(k);
}

const norm = (s) => String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/[\s　.\-'’]/g, '').replace(/[̄́]/g, '');
const fold = (s) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Names → areas. An area answers to its id (JP-13), its local name (東京都 and 東京) and its English name (Tokyo, Kochi for Kōchi). */
export function resolveAreas(data, names) {
  const hit = [], missing = [];
  for (const nm of names || []) {
    const q = fold(nm), q2 = q.replace(/(都|府|県|prefecture|pref)$/, '');
    const a = data.areas.find((x) => fold(x.id) === q || fold(x.name) === q || fold(x.nameLocal) === q || fold(x.nameLocal).replace(/[都府県]$/, '') === q2 || fold(x.name) === q2);
    if (a) { if (!hit.includes(a)) hit.push(a); } else missing.push(String(nm));
  }
  return { areas: hit, missing };
}

/** metric ids by dimension, in the file's order */
export function dimensionsOf(data) {
  const out = {};
  for (const [id, m] of Object.entries(data.metrics)) (out[m.dimension] = out[m.dimension] || []).push(id);
  return out;
}

/** rank (1 = better end) of each area for one metric; ties share the lower rank. null values are not ranked. */
export function rankMetric(data, id) {
  const m = data.metrics[id]; if (!m) return null;
  const vals = data.areas.map((a) => [a.id, a.m[id]]).filter((x) => x[1] != null && isFinite(x[1]));
  const sorted = vals.map((x) => x[1]).sort((a, b) => (m.better === 'lower' ? a - b : b - a));
  const rank = {};
  for (const [aid, v] of vals) rank[aid] = sorted.indexOf(v) + 1;
  return { rank, of: vals.length };
}

/** does a company sector id answer to a free word? 'semiconductor' → 'semi'. Prefix either way, nothing else. */
export function sectorMatches(sector, q) {
  const s = fold(sector), w = fold(q);
  return !!s && !!w && (w.startsWith(s) || s.startsWith(w));
}

/**
 * @param {object} data   the country's siting file
 * @param {{areas?:string[], dimensions?:string[], metrics?:string[], sector?:string, rankBy?:string, top?:number}} q
 * `areas` empty → every area, ordered by `rankBy` (its better end first) or, with a `sector`, by the number of that sector's sites;
 * `dimensions` / `metrics` narrow the columns (default: every metric).
 */
export function compare(data, q = {}) {
  if (!data || !Array.isArray(data.areas)) return { ok: false, code: 'NO_DATA' };
  const res = (q.areas && q.areas.length) ? resolveAreas(data, q.areas) : { areas: [], missing: [] };
  if (q.areas && q.areas.length && !res.areas.length) return { ok: false, code: 'NO_AREA', missing: res.missing };
  const dims = dimensionsOf(data);
  let ids = Object.keys(data.metrics);
  const badDims = (q.dimensions || []).filter((d) => !dims[d]);
  if (q.dimensions && q.dimensions.length) ids = ids.filter((id) => q.dimensions.includes(data.metrics[id].dimension));
  const badMetrics = (q.metrics || []).filter((m) => !data.metrics[m]);
  if (q.metrics && q.metrics.length) ids = ids.filter((id) => q.metrics.includes(id));
  if (q.rankBy && !data.metrics[q.rankBy]) return { ok: false, code: 'BAD_METRIC', metric: q.rankBy, known: Object.keys(data.metrics) };
  const ranks = Object.fromEntries(ids.concat(q.rankBy && !ids.includes(q.rankBy) ? [q.rankBy] : []).map((id) => [id, rankMetric(data, id)]));
  const anchorsIn = (id) => (data.anchors || []).filter((a) => a.iso === id && (!q.sector || sectorMatches(a.sector, q.sector)));
  let pool = res.areas.length ? res.areas : data.areas.slice();
  if (!res.areas.length) {
    if (q.rankBy) {
      const r = ranks[q.rankBy];
      pool = pool.filter((a) => r.rank[a.id] != null).sort((a, b) => r.rank[a.id] - r.rank[b.id]);
    } else if (q.sector) pool = pool.filter((a) => anchorsIn(a.id).length).sort((a, b) => anchorsIn(b.id).length - anchorsIn(a.id).length);
    pool = pool.slice(0, Math.max(1, Math.min(47, q.top || 10)));
  }
  const rows = pool.map((a) => ({
    id: a.id, name: a.name, nameLocal: a.nameLocal, powerArea: a.powerArea || null, note: a.note || null,
    pending: a.pending || null, effective: a.effective || null,
    values: Object.fromEntries(ids.map((id) => [id, { v: a.m[id] == null ? null : a.m[id], rank: ranks[id] && ranks[id].rank[a.id] || null, of: ranks[id] ? ranks[id].of : 0 }])),
    anchors: anchorsIn(a.id),
  }));
  const usedSources = new Set(ids.map((id) => data.metrics[id].source));
  const noSector = q.sector && !(data.anchors || []).some((a) => sectorMatches(a.sector, q.sector));
  return {
    ok: true, country: data.country, generatedAt: data.generatedAt, rows, metricIds: ids,
    metrics: Object.fromEntries(ids.map((id) => [id, data.metrics[id]])),
    sources: Object.fromEntries([...usedSources].map((s) => [s, data.sources[s]])),
    gaps: data.gaps || [],
    rules: (!q.dimensions || !q.dimensions.length || q.dimensions.includes('regulation')) ? data.rules || [] : [],
    unresolved: res.missing, unknownDimensions: badDims, unknownMetrics: badMetrics, noSectorMatch: !!noSector,
    scope: { areas: res.areas.length ? 'named' : (q.rankBy ? 'ranked by ' + q.rankBy : q.sector ? 'with ' + q.sector + ' sites' : 'all'), of: data.areas.length },
  };
}
