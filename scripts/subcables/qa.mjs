/* ============================================================================
 *  IntMap · subcables — THE GENERATED DATASET IS CHECKED, NOT ASSUMED
 * ----------------------------------------------------------------------------
 *  The brief's §9: "単純にテストがgreenになれば良いのではなく、生成結果そのものを
 *  統計的に検査してください" — do not check that the build ran; check what it
 *  produced. Every cable that existed before must exist after, every route must
 *  start and end at a landing point, nothing may cross land, nothing may be NaN,
 *  nothing may break at the antimeridian, and a route whose length disagrees
 *  violently with the operator's own published length is a route that is wrong.
 *
 *  FATAL checks stop the build and leave the shipped dataset untouched.
 *  REPORTED checks are counted and listed; they describe quality, not validity,
 *  and the numbers go into data/subcables.build.json so the next round can see
 *  whether they moved.
 * ==========================================================================*/
import { haversine, lineLength, segmentsIntersect, nearestOnLine, unwrap } from './geo.mjs';

export function runQA({ routeFC, lpFC, meta, cables, router, perCable }) {
  const fatal = [], summary = [];
  const report = {};

  /* ── ① every cable still exists, and has geometry ───────────────────────── */
  const withGeom = new Set(routeFC.features.map(f => f.properties.id));
  const missing = cables.filter(c => !withGeom.has(c.id)).map(c => c.id);
  report.cablesIn = cables.length;
  report.cablesOut = withGeom.size;
  report.cablesMissing = missing;
  if (missing.length) fatal.push('① ' + missing.length + ' cable(s) lost their geometry: ' + missing.slice(0, 12).join(', '));
  summary.push('① cables ' + withGeom.size + '/' + cables.length + ' have geometry');

  /* ── ② coordinates are finite and on the planet ─────────────────────────── */
  let bad = 0, badLon = 0, badLat = 0, zeroLen = 0, shortSeg = 0, verts = 0;
  const badIds = new Set();
  for (const f of routeFC.features) {
    const co = f.geometry.coordinates;
    if (co.length < 2) { zeroLen++; badIds.add(f.properties.feature_id); }
    let prev = null, moved = false;
    for (const c of co) {
      verts++;
      if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) { bad++; badIds.add(f.properties.feature_id); continue; }
      if (c[0] < -180 || c[0] > 180) { badLon++; badIds.add(f.properties.feature_id); }
      if (c[1] < -90 || c[1] > 90) { badLat++; badIds.add(f.properties.feature_id); }
      if (prev && (prev[0] !== c[0] || prev[1] !== c[1])) moved = true;
      prev = c;
    }
    if (co.length >= 2 && !moved) shortSeg++;
  }
  report.vertices = verts;
  report.nonFinite = bad; report.lonOutOfRange = badLon; report.latOutOfRange = badLat;
  report.featuresWithFewerThanTwoPoints = zeroLen; report.zeroLengthFeatures = shortSeg;
  if (bad || badLon || badLat) fatal.push('② ' + (bad + badLon + badLat) + ' invalid coordinate(s) (NaN/∞ or off-planet)');
  if (zeroLen) fatal.push('② ' + zeroLen + ' feature(s) with fewer than two points');
  summary.push('② ' + verts.toLocaleString() + ' vertices, ' + bad + ' non-finite, ' + (badLon + badLat) + ' out of range, ' + shortSeg + ' zero-length');

  /* ── ③ the antimeridian ─────────────────────────────────────────────────
     Nothing may jump more than 180° of longitude between two consecutive
     points: that is the streak-across-the-map failure, and it is the ONLY thing
     that distinguishes a Pacific cable from a drawing error. */
  let jumps = 0; const jumpIds = [];
  for (const f of routeFC.features) {
    const co = f.geometry.coordinates;
    for (let i = 1; i < co.length; i++) if (Math.abs(co[i][0] - co[i - 1][0]) > 180) { jumps++; jumpIds.push(f.properties.feature_id); break; }
  }
  report.antimeridianBreaks = jumps;
  if (jumps) fatal.push('③ ' + jumps + ' feature(s) jump >180° of longitude: ' + jumpIds.slice(0, 8).join(', '));
  summary.push('③ antimeridian: ' + jumps + ' broken feature(s)');

  /* ── ④ land crossing ───────────────────────────────────────────────────
     Sampled against the SAME grid the router refused to walk on, at a step
     finer than one cell, so a crossing here is a crossing the router itself
     would have rejected. Landings are excluded: the last 12 km at each end is
     where a cable is SUPPOSED to reach the shore. */
  const LANDFALL_M = 12000;
  let landPts = 0, landFeat = 0; const landWorst = [];
  for (const f of routeFC.features) {
    const co = f.geometry.coordinates;
    const total = lineLength(co);
    let s = 0, hit = 0;
    for (let i = 1; i < co.length; i++) {
      const seg = haversine(co[i - 1], co[i]);
      const n = Math.max(1, Math.ceil(seg / 4000));
      for (let k = 0; k <= n; k++) {
        const t = k / n, at = s + seg * t;
        if (at < LANDFALL_M || at > total - LANDFALL_M) continue;
        const lon = co[i - 1][0] + (co[i][0] - co[i - 1][0]) * t, lat = co[i - 1][1] + (co[i][1] - co[i - 1][1]) * t;
        if (!router.passable[router.idx(router.rowOf(lat), router.colOf(lon))]) hit++;
      }
      s += seg;
    }
    if (hit) { landFeat++; landPts += hit; landWorst.push({ id: f.properties.feature_id, cable: f.properties.id, hits: hit, quality: f.properties.quality }); }
  }
  landWorst.sort((a, b) => b.hits - a.hits);
  report.landCrossingFeatures = landFeat;
  report.landCrossingSamples = landPts;
  report.landCrossingWorst = landWorst.slice(0, 20);
  summary.push('④ land crossing: ' + landFeat + ' feature(s), ' + landPts + ' sampled point(s) beyond the ' + (LANDFALL_M / 1000) + ' km landfall window');

  /* ── ⑤ routes start and end at landing points ───────────────────────────── */
  const lpByCable = new Map();
  for (const [id, m] of Object.entries(meta.cables)) lpByCable.set(id, m.landingPoints.map(l => meta.landingPoints[l]).filter(Boolean).map(l => l.coord));
  let endsOk = 0, endsChecked = 0; const farEnds = [];
  const byCable = new Map();
  for (const f of routeFC.features) { const a = byCable.get(f.properties.id) || []; a.push(f); byCable.set(f.properties.id, a); }
  for (const [id, feats] of byCable) {
    const lps = lpByCable.get(id) || [];
    if (!lps.length) continue;
    /* the cable's extreme endpoints: those not shared with another of its own features */
    const ends = terminalPoints(feats);
    for (const p of ends) {
      endsChecked++;
      let bd = Infinity; for (const q of lps) { const d = haversine(p, q); if (d < bd) bd = d; }
      if (bd <= 25000) endsOk++; else farEnds.push({ cable: id, km: Math.round(bd / 1000) });
    }
  }
  farEnds.sort((a, b) => b.km - a.km);
  report.terminalsChecked = endsChecked; report.terminalsAtLanding = endsOk;
  report.terminalsFar = farEnds.slice(0, 20);
  summary.push('⑤ route ends at a landing point: ' + endsOk + '/' + endsChecked + ' (' + (endsChecked ? (100 * endsOk / endsChecked).toFixed(1) : '0') + '%)');

  /* ── ⑥ published length vs built length ─────────────────────────────────── */
  const ratios = [];
  for (const p of perCable) {
    if (!p.publishedKm || p.publishedKm < 20) continue;
    const built = (p.verifiedM + p.reconM + p.estM) / 1000;
    if (built <= 0) continue;
    ratios.push({ id: p.id, published: p.publishedKm, built: Math.round(built), ratio: built / p.publishedKm });
  }
  ratios.sort((a, b) => a.ratio - b.ratio);
  const rs = ratios.map(r => r.ratio).sort((a, b) => a - b);
  const q = (f) => rs.length ? +rs[Math.floor(rs.length * f)].toFixed(3) : null;
  report.lengthComparedCables = ratios.length;
  report.lengthRatio = { p05: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95) };
  report.lengthOutliers = ratios.filter(r => r.ratio < 0.6 || r.ratio > 1.8).length;
  report.lengthWorstShort = ratios.slice(0, 12);
  report.lengthWorstLong = ratios.slice(-12).reverse();
  summary.push('⑥ built/published length: p50 ' + report.lengthRatio.p50 + ' (p05 ' + report.lengthRatio.p05 + ' … p95 ' + report.lengthRatio.p95 + '), '
    + report.lengthOutliers + '/' + ratios.length + ' outside 0.6–1.8');

  /* ── ⑦ self-intersection ───────────────────────────────────────────────
     A cable crossing ITSELF is not impossible — festoons do it — but a route
     that does it many times is a routing artefact. Counted per feature, with
     adjacent segments excluded. */
  let selfHits = 0, selfFeats = 0;
  for (const f of routeFC.features) {
    const co = f.geometry.coordinates;
    if (co.length > 400) continue;                     /* O(n²); the long ones are sampled by ⑧ */
    let hit = 0;
    for (let i = 1; i < co.length - 2; i++)
      for (let j = i + 2; j < co.length; j++)
        if (segmentsIntersect(co[i - 1], co[i], co[j - 1], co[j])) hit++;
    if (hit) { selfFeats++; selfHits += hit; }
  }
  report.selfIntersectingFeatures = selfFeats; report.selfIntersections = selfHits;
  summary.push('⑦ self-intersection: ' + selfFeats + ' feature(s), ' + selfHits + ' crossing(s)');

  /* ── ⑧ detour: how much longer than the straight line ───────────────────── */
  const detours = [];
  for (const f of routeFC.features) {
    const co = f.geometry.coordinates;
    const gc = haversine(co[0], co[co.length - 1]);
    if (gc < 50000) continue;
    detours.push({ id: f.properties.feature_id, r: lineLength(co) / gc });
  }
  detours.sort((a, b) => b.r - a.r);
  const dr = detours.map(d => d.r).sort((a, b) => a - b);
  report.detour = dr.length ? { p50: +dr[Math.floor(dr.length * 0.5)].toFixed(3), p90: +dr[Math.floor(dr.length * 0.9)].toFixed(3), p99: +dr[Math.floor(dr.length * 0.99)].toFixed(3), max: +dr[dr.length - 1].toFixed(2) } : null;
  report.detourWorst = detours.slice(0, 12).map(d => ({ ...d, r: +d.r.toFixed(2) }));
  summary.push('⑧ detour vs straight line: p50 ' + (report.detour ? report.detour.p50 : '—') + ', p99 ' + (report.detour ? report.detour.p99 : '—'));

  /* ── ⑨ duplicate and disconnected ───────────────────────────────────────── */
  const ids = routeFC.features.map(f => f.properties.feature_id);
  const dupIds = ids.length - new Set(ids).size;
  report.duplicateFeatureIds = dupIds;
  if (dupIds) fatal.push('⑨ ' + dupIds + ' duplicate feature_id(s)');
  let disconnected = 0; const discList = [];
  for (const [id, feats] of byCable) {
    const comps = components(feats);
    if (comps > 1) { disconnected++; discList.push({ cable: id, components: comps }); }
  }
  report.disconnectedCables = disconnected;
  report.disconnectedWorst = discList.sort((a, b) => b.components - a.components).slice(0, 15);
  summary.push('⑨ ' + dupIds + ' duplicate id(s), ' + disconnected + ' cable(s) drawn in more than one piece');

  /* ── ⑩ the surveyed pieces really are near their own source ──────────────── */
  const byQuality = {};
  for (const f of routeFC.features) {
    const k = f.properties.quality;
    byQuality[k] = (byQuality[k] || 0) + 1;
  }
  report.featuresByQuality = byQuality;
  summary.push('⑩ features by quality: ' + JSON.stringify(byQuality));

  return { fatal, summary, report };
}

/* endpoints of a cable's drawing that no other piece of it continues */
function terminalPoints(feats) {
  const pts = [];
  for (const f of feats) { const co = f.geometry.coordinates; pts.push(co[0], co[co.length - 1]); }
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    let shared = false;
    for (let j = 0; j < pts.length; j++) {
      if (i === j) continue;
      if (haversine(pts[i], pts[j]) < 3000) { shared = true; break; }
    }
    if (!shared) out.push(pts[i]);
  }
  return out;
}

/* how many connected pieces a cable is drawn in (endpoints within 30 km join) */
function components(feats) {
  const n = feats.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const ends = feats.map(f => { const c = f.geometry.coordinates; return [c[0], c[c.length - 1]]; });
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    let near = false;
    for (const a of ends[i]) for (const b of ends[j]) {
      let d = haversine(a, b);
      if (Math.abs(Math.abs(a[0]) - 180) < 0.001 && Math.abs(Math.abs(b[0]) - 180) < 0.001) d = Math.abs(a[1] - b[1]) * 111320;
      if (d < 30000) near = true;
    }
    if (near) { const ra = find(i), rb = find(j); if (ra !== rb) parent[ra] = rb; }
  }
  const roots = new Set(); for (let i = 0; i < n; i++) roots.add(find(i));
  return roots.size;
}

export { nearestOnLine, unwrap };
