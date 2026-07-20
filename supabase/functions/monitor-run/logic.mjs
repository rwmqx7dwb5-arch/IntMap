// ============================================================================
//  IntMap · monitor-run · logic.mjs  —  PURE, runtime-agnostic comparison engine
// ----------------------------------------------------------------------------
//  The heart of the "don't let the AI decide whether something changed" rule.
//  Everything mechanical — point-in-area, normalization, dedup, the diff of
//  new/gone/continuing, the change score, the AI call/skip decision, and the
//  evidence-id validation that gates every AI claim — lives here as PURE
//  functions with NO Deno/Node/network APIs. That means:
//    • the Deno Edge Function (index.ts) imports it, and
//    • the Node test (tests/monitor-logic.test.mjs) imports the SAME code,
//  so the logic that runs in production is exactly the logic under test.
//
//  Nothing here reaches the network or a clock unless a timestamp is passed in.
// ============================================================================

// ---------------------------------------------------------------------------
//  Geometry — point-in-area (ray casting for polygons, haversine for circles).
// ---------------------------------------------------------------------------

export function haversineKm(aLng, aLat, bLng, bLat) {
  const R = 6371.0088;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Ray-casting point-in-ring. ring = [[lng,lat],…] (first!=last tolerated).
export function pointInRing(lng, lat, ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// A GeoJSON Polygon ring set: outer ring includes, holes exclude.
function pointInPolygonRings(lng, lat, rings) {
  if (!rings || !rings.length) return false;
  if (!pointInRing(lng, lat, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) {
    if (pointInRing(lng, lat, rings[k])) return false; // in a hole
  }
  return true;
}

export function pointInGeometry(lng, lat, geom) {
  if (!geom || typeof geom !== "object") return false;
  if (geom.type === "Polygon") return pointInPolygonRings(lng, lat, geom.coordinates || []);
  if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates || []) {
      if (pointInPolygonRings(lng, lat, poly)) return true;
    }
    return false;
  }
  return false;
}

export function bboxOfGeometry(geom) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const scan = (ring) => {
    for (const p of ring) {
      if (p[0] < w) w = p[0];
      if (p[0] > e) e = p[0];
      if (p[1] < s) s = p[1];
      if (p[1] > n) n = p[1];
    }
  };
  if (!geom) return null;
  if (geom.type === "Polygon") (geom.coordinates || []).forEach(scan);
  else if (geom.type === "MultiPolygon") (geom.coordinates || []).forEach((poly) => (poly || []).forEach(scan));
  else return null;
  if (!isFinite(w)) return null;
  return [w, s, e, n];
}

// The one place "is this point in the monitored area?" is decided. A monitor is
// either a circle (center+radius_km — exact haversine) or a polygon/region.
export function pointInMonitorArea(lng, lat, monitor) {
  if (!isFinite(lng) || !isFinite(lat)) return false;
  if (
    monitor &&
    monitor.geometry_kind === "circle" &&
    isFinite(monitor.center_lng) &&
    isFinite(monitor.center_lat) &&
    isFinite(monitor.radius_km) &&
    monitor.radius_km > 0
  ) {
    return haversineKm(monitor.center_lng, monitor.center_lat, lng, lat) <= monitor.radius_km;
  }
  // bbox pre-filter, then precise ray-cast.
  const bbox = Array.isArray(monitor && monitor.bbox) ? monitor.bbox : bboxOfGeometry(monitor && monitor.geometry);
  if (bbox && (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3])) return false;
  return pointInGeometry(lng, lat, monitor && monitor.geometry);
}

// Validate a stored/collected geometry is a real, non-degenerate Polygon/MultiPolygon.
export function validGeometry(geom) {
  if (!geom || typeof geom !== "object") return false;
  const ringOk = (r) => Array.isArray(r) && r.length >= 4 && r.every((p) => Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);
  if (geom.type === "Polygon") return Array.isArray(geom.coordinates) && geom.coordinates.length >= 1 && geom.coordinates.every(ringOk);
  if (geom.type === "MultiPolygon") return Array.isArray(geom.coordinates) && geom.coordinates.length >= 1 && geom.coordinates.every((poly) => Array.isArray(poly) && poly.length >= 1 && poly.every(ringOk));
  return false;
}

// ---------------------------------------------------------------------------
//  URL safety — the ONLY urls we ever store are the ones providers give us; we
//  never fetch arbitrary urls (no SSRF surface). Still, validate the scheme so a
//  javascript:/data: url can never reach the UI as a source link.
// ---------------------------------------------------------------------------
export function isSafeHttpUrl(u) {
  if (typeof u !== "string" || !u) return false;
  return /^https?:\/\/[^\s]+$/i.test(u.trim());
}

// ---------------------------------------------------------------------------
//  Normalization — turn a raw source row into a canonical evidence candidate.
//  dedup_key is what dedup + diff work on; keep it stable & source-scoped.
// ---------------------------------------------------------------------------
function canonUrl(link) {
  return String(link || "").trim().replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();
}

// A `current_news` row → evidence candidate. Locations are the reported SUBJECT
// of the article (subject_lng/lat), which is exactly what "in this area" means.
export function normalizeNewsRow(row) {
  const link = String(row.link || "");
  const lng = row.subject_lng, lat = row.subject_lat;
  const name = row.subject_name_en || row.subject_name_jp || row.pub_label || "";
  return {
    source_type: "news",
    source_name: String(row.publisher || "").slice(0, 120) || null,
    source_url: isSafeHttpUrl(link) ? link : null,
    external_id: canonUrl(link) || null,
    title: String(row.title || "").slice(0, 300) || null,
    observed_at: row.pub_date || null,
    lng: isFinite(lng) ? lng : null,
    lat: isFinite(lat) ? lat : null,
    payload: {
      lang: row.lang || null,
      topic: row.topic || null,
      subject: name || null,
      description: String(row.description || "").slice(0, 400) || null,
    },
    dedup_key: "news:" + (canonUrl(link) || String(row.id || Math.abs(hashStr(String(row.title || ""))))),
  };
}

// Small stable string hash (djb2) — deterministic, no crypto dependency.
export function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h;
}

// Dedup a list of evidence candidates by dedup_key (keep the first / freshest).
export function dedupeEvidence(list) {
  const seen = new Set();
  const out = [];
  for (const e of list) {
    if (!e || !e.dedup_key) continue;
    if (seen.has(e.dedup_key)) continue;
    seen.add(e.dedup_key);
    out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Diff — the mechanical new / gone / continuing split against a baseline set of
//  dedup_keys. This is where "changed?" is decided BY CODE, not the AI.
// ---------------------------------------------------------------------------
export function diffKeys(currentKeys, baselineKeys) {
  const cur = new Set(currentKeys);
  const base = new Set(baselineKeys);
  const isNew = [], gone = [], cont = [];
  for (const k of cur) (base.has(k) ? cont : isNew).push(k);
  for (const k of base) if (!cur.has(k)) gone.push(k);
  return { new: isNew, gone, continuing: cont };
}

// Greedy spatial clustering of points (km radius). Returns clusters of indices.
export function clusterPoints(points, radiusKm = 60) {
  const clusters = [];
  const used = new Array(points.length).fill(false);
  for (let i = 0; i < points.length; i++) {
    if (used[i]) continue;
    const p = points[i];
    if (!isFinite(p.lng) || !isFinite(p.lat)) continue;
    const members = [i];
    used[i] = true;
    for (let j = i + 1; j < points.length; j++) {
      if (used[j]) continue;
      const q = points[j];
      if (!isFinite(q.lng) || !isFinite(q.lat)) continue;
      if (haversineKm(p.lng, p.lat, q.lng, q.lat) <= radiusKm) {
        members.push(j);
        used[j] = true;
      }
    }
    clusters.push(members);
  }
  return clusters;
}

export function distinctPublishers(items) {
  const s = new Set();
  for (const it of items) if (it && it.source_name) s.add(String(it.source_name).toLowerCase());
  return s.size;
}

// ---------------------------------------------------------------------------
//  Snapshot + change score.
// ---------------------------------------------------------------------------
// Build a compact, storable snapshot of what a source found this run.
export function buildNewsSnapshot(items) {
  return {
    count: items.length,
    publishers: distinctPublishers(items),
    keys: items.map((i) => i.dedup_key),
    topics: Array.from(new Set(items.map((i) => (i.payload && i.payload.topic) || "").filter(Boolean))).slice(0, 20),
  };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Weighted change score in [0,1]. Deliberately NOT "article count went up":
// new *clusters* and multi-publisher *corroboration* dominate, so 11 rewrites of
// one story score far lower than 3 genuinely new, independently-reported events.
export function computeChangeScore({ diff, current, baseline, newClusters, corroboratedClusters }) {
  const newCount = diff.new.length;
  const curPub = current.publishers || 0;
  const basePub = (baseline && baseline.publishers) || 0;
  const curCount = current.count || 0;
  const baseCount = (baseline && baseline.count) || 0;

  const cNew = clamp01(newCount / 8);
  const cClusters = clamp01((newClusters || 0) / 3);
  const cCorro = clamp01((corroboratedClusters || 0) / 2);
  const cDiversity = clamp01(Math.max(0, curPub - basePub) / 4);
  const cVolume = clamp01(Math.max(0, curCount - baseCount) / 10);

  const score =
    0.35 * cNew + 0.25 * cClusters + 0.2 * cCorro + 0.1 * cDiversity + 0.1 * cVolume;
  return clamp01(score);
}

// Map a change score → severity bucket (a fallback; the AI may refine within bounds).
export function severityFromScore(score) {
  if (score >= 0.75) return "critical";
  if (score >= 0.55) return "high";
  if (score >= 0.35) return "medium";
  if (score > 0) return "low";
  return "none";
}

// The AI call/skip decision. AI is called ONLY when a meaningful, code-detected
// change exists — never to decide whether a change happened.
//   isFirstRun            → skip 'insufficient_baseline' (this run establishes it)
//   no data at all        → caller handles as source_unavailable (skip 'no_data')
//   newCount === 0        → skip 'no_change'
//   score < threshold     → skip 'below_threshold'
//   else                  → call
export function decideAI({ isFirstRun, hasData, newCount, changeScore, sensitivity }) {
  if (!hasData) return { call: false, skip: "no_data" };
  if (isFirstRun) return { call: false, skip: "insufficient_baseline" };
  if (!newCount) return { call: false, skip: "no_change" };
  const minNew = sensitivity && isFinite(sensitivity.min_new) ? sensitivity.min_new : 1;
  if (newCount < minNew) return { call: false, skip: "below_threshold" };
  const minScore = sensitivity && isFinite(sensitivity.min_score) ? sensitivity.min_score : 0.3;
  if (changeScore < minScore) return { call: false, skip: "below_threshold" };
  return { call: true, skip: null };
}

// ---------------------------------------------------------------------------
//  Evidence-id validation — the anti-fabrication gate. EVERY evidence_id an AI
//  report cites MUST be a real ev_key from THIS run's evidence. Claims that cite
//  a nonexistent id are dropped; a report with no surviving grounded claim is
//  rejected entirely (caller then records ai_failed and keeps snapshot+diff).
// ---------------------------------------------------------------------------
export function validateAndCleanReport(report, validKeySet, changePointsByKey) {
  const invalid = new Set();
  const arr = (v) => (Array.isArray(v) ? v : []);
  const strArr = (v) => arr(v).map((x) => String(x)).filter(Boolean).slice(0, 40);

  const changes = arr(report && report.changes)
    .map((c) => {
      const ids = arr(c && c.evidence_ids).map((x) => String(x));
      const good = ids.filter((id) => {
        const ok = validKeySet.has(id);
        if (!ok) invalid.add(id);
        return ok;
      });
      return { claim: String((c && c.claim) || "").slice(0, 500), evidence_ids: good, metric: c && c.metric ? String(c.metric).slice(0, 120) : undefined };
    })
    // A factual claim with NO surviving evidence id is not allowed to stand.
    .filter((c) => c.claim && c.evidence_ids.length > 0);

  // change_points: keep only points whose evidence_id is real.
  const points = arr(report && report.change_points)
    .map((p) => ({ lng: Number(p && p.lng), lat: Number(p && p.lat), label: String((p && p.label) || "").slice(0, 120), evidence_id: p && p.evidence_id ? String(p.evidence_id) : null }))
    .filter((p) => isFinite(p.lng) && isFinite(p.lat) && (!p.evidence_id || validKeySet.has(p.evidence_id)));

  // If the AI gave no change_points but cited evidence, synthesize points from the cited keys' coords.
  let finalPoints = points;
  if (!finalPoints.length && changePointsByKey) {
    const seen = new Set();
    finalPoints = [];
    for (const c of changes) {
      for (const id of c.evidence_ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const pt = changePointsByKey.get(id);
        if (pt && isFinite(pt.lng) && isFinite(pt.lat)) finalPoints.push({ lng: pt.lng, lat: pt.lat, label: pt.label || "", evidence_id: id });
      }
    }
  }

  const severity = ["none", "low", "medium", "high", "critical"].includes(report && report.severity) ? report.severity : null;

  const cleaned = {
    severity,
    headline: String((report && report.headline) || "").slice(0, 200),
    summary: String((report && report.summary) || "").slice(0, 2000),
    changes,
    unchanged: strArr(report && report.unchanged).map((s) => s.slice(0, 300)),
    data_gaps: strArr(report && report.data_gaps).map((s) => s.slice(0, 300)),
    limitations: strArr(report && report.limitations).map((s) => s.slice(0, 300)),
    change_points: finalPoints.slice(0, 60),
  };

  const ok = !!cleaned.headline && changes.length > 0;
  return { ok, cleaned, invalidRefs: Array.from(invalid) };
}
