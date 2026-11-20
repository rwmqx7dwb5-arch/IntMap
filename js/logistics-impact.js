/* ============================================================================
 *  IntMap · logistics-impact — «this port stops: which cities and factories lose their nearest port?»
 * ----------------------------------------------------------------------------
 *  data/logistics-network.json (scripts/logistics/build.mjs) holds, for each city of >= 100,000 people and each
 *  factory-type site of the company atlas that has rail within reach, the ports it reaches BY RAIL in order
 *  (nearest first, with the rail kilometres). A port stopping is answered from that order — not guessed:
 *    · the entities whose NEAREST port it is are the ones that lose it;
 *    · each falls back to the next port in ITS order, and the extra rail kilometres are the difference;
 *    · an entity with no further port inside the model's reach is reported as having NO alternative.
 *  The alternative port's own stated annual cargo (Eurostat, a Wikidata throughput) is set beside the number of
 *  entities it would receive, so the reader can see where the redirected hinterland lands — the file does not
 *  contain a capacity for ports outside the Eurostat area, and the answer says «not stated» rather than a figure.
 *
 *  ⚠ A MODEL OF REACHABILITY, NOT OF FREIGHT. The file's `model.kind` says so and `describe()` returns it with
 *  every answer: gauge, electrification, track capacity and operators are not constraints; road and barge legs are
 *  not in it; the ports are those that state cargo, a UN/LOCODE or a rail terminal.
 *  Pure apart from `load` (the page's fetch, or a file read in the node checks).
 * ==========================================================================*/
import { jsonWithin } from './fetch-deadline.js';
export function makeLogisticsImpact(deps) {
  /* the file is ~1 MB; observed 2026-11-20 as one static read. 30 s bounds a stalled connection, not a slow line; expires if the file grows past a few MB. Canon: js/proxy-fetch.js clockFor. */
  const READ_MS = 30000;
  deps = deps || {};
  let cache = null;
  async function data() {
    if (cache) return cache;
    const load = deps.load || (async () => {
      const url = (typeof document !== 'undefined' && document.baseURI) ? new URL('data/logistics-network.json', document.baseURI).toString() : 'data/logistics-network.json';
      return jsonWithin(url, READ_MS);
    });
    cache = await load();
    return cache;
  }
  const norm = (s) => String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\bport(?:s)? (?:of|de|du|di|of the)\b/g, '').replace(/[^\p{L}\p{N}]+/g, ' ').trim();

  /** the ports a query can mean: UN/LOCODE or Wikidata id exactly, else the name (exact, then contained), best first */
  function findPorts(D, q) {
    const raw = String(q || '').trim(); if (!raw) return [];
    const up = raw.toUpperCase().replace(/\s+/g, '');
    const byId = D.ports.map((p, i) => ({ p, i })).filter((x) => x.p.locode === up || x.p.wikidata === up || x.p.ref === raw);
    if (byId.length) return byId;
    const n = norm(raw); if (!n) return [];
    const exact = [], part = [];
    D.ports.forEach((p, i) => {
      const names = [p.name].concat(p.names || []).map(norm).filter(Boolean);
      if (names.indexOf(n) >= 0) exact.push({ p, i });
      else if (names.some((x) => x.indexOf(n) >= 0 || (x.length >= 4 && n.indexOf(x) >= 0))) part.push({ p, i });
    });
    const cap = (x) => (x.p.capacity ? x.p.capacity.value : 0);
    return (exact.length ? exact : part).sort((a, b) => cap(b) - cap(a));
  }
  const median = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
  const portLine = (p) => ({ ref: p.ref, name: p.name, cc: p.cc, locode: p.locode, capacity: p.capacity || null });

  /**
   * query: a port name / UN/LOCODE / wikidata id.   opts: { top: how many cities / factories to list (default 8) }
   * → { ok:true, port, affected, rerouted, stranded, topCities, factories, model, coverage }
   *   { ok:false, code:'no-port'|'ambiguous'|'unavailable', candidates? }
   */
  async function impact(query, opts) {
    opts = opts || {};
    let D;
    try { D = await data(); } catch (_) { return { ok: false, code: 'unavailable' }; }
    const hits = findPorts(D, query);
    if (!hits.length) return { ok: false, code: 'no-port', listed: D.ports.length };
    /* several ports answer to the name and none is exact in capacity terms: say so instead of choosing for the reader */
    const exactIds = hits.filter((h) => h.p.locode === String(query).toUpperCase().replace(/\s+/g, '') || h.p.wikidata === String(query).toUpperCase());
    if (hits.length > 1 && !exactIds.length) {
      const first = hits[0], second = hits[1];
      const nm = (x) => norm(x.p.name);
      if (nm(first) === nm(second) || (first.p.capacity && second.p.capacity && second.p.capacity.value * 4 > first.p.capacity.value)) {
        return { ok: false, code: 'ambiguous', candidates: hits.slice(0, 6).map((h) => portLine(h.p)) };
      }
    }
    const { p, i } = hits[0];
    const top = opts.top > 0 ? Math.floor(opts.top) : 8;
    const lost = [];
    for (const e of D.entities) if (e.r[0][0] === i) lost.push(e);
    const rows = lost.map((e) => {
      const alt = e.r[1] || null;
      return { e, alt: alt ? { port: D.ports[alt[0]], idx: alt[0], km: alt[1], extraKm: +(alt[1] - e.r[0][1]).toFixed(1) } : null };
    });
    const cities = rows.filter((x) => x.e.k === 'c'), plants = rows.filter((x) => x.e.k === 'f');
    const byAlt = new Map();
    rows.forEach((x) => { if (!x.alt) return; const g = byAlt.get(x.alt.idx) || { port: x.alt.port, n: 0, extra: [] }; g.n++; g.extra.push(x.alt.extraKm); byAlt.set(x.alt.idx, g); });
    const rerouted = [...byAlt.values()].sort((a, b) => b.n - a.n).slice(0, 6).map((g) => ({ port: portLine(g.port), entities: g.n, medianExtraKm: median(g.extra), maxExtraKm: Math.max(...g.extra) }));
    const stranded = rows.filter((x) => !x.alt);
    const line = (x) => ({ name: x.e.n, nameJa: x.e.ja || null, cc: x.e.cc, population: x.e.p || null, company: x.e.co || null, siteType: x.e.st || null, nearestRailKm: x.e.r[0][1], fallback: x.alt ? { port: portLine(x.alt.port), railKm: x.alt.km, extraKm: x.alt.extraKm } : null });
    return {
      ok: true,
      port: Object.assign(portLine(p), { coastKm: p.coastKm, railAccessKm: p.accessKm, railTerminalFlag: !!p.railTerminal }),
      affected: { cities: cities.length, population: cities.reduce((s, x) => s + (x.e.p || 0), 0), factories: plants.length, companies: new Set(plants.map((x) => x.e.co)).size },
      rerouted,
      stranded: { cities: stranded.filter((x) => x.e.k === 'c').length, factories: stranded.filter((x) => x.e.k === 'f').length },
      medianExtraKm: median(rows.filter((x) => x.alt).map((x) => x.alt.extraKm)),
      topCities: cities.sort((a, b) => (b.e.p || 0) - (a.e.p || 0)).slice(0, top).map(line),
      factories: plants.slice(0, Math.max(top, 12)).map(line),
      factoriesTotal: plants.length,
      model: D.model, coverage: D.coverage, asOf: D.asOf, sources: D.inputs,
    };
  }
  return { impact, findPorts, data };
}
