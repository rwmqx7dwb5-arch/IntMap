// ============================================================================
//  tests/monitor-logic.test.mjs  (#R141)
//  Unit tests for the PURE area-monitoring engine that both the Deno Edge
//  Function (monitor-run) and this test import. Run by `node --test` (npm test).
//  Covers the spec's required logic: in/out of a circle + polygon, date/window,
//  dedup, clustering, first-run vs no-change vs real-change, change score, and
//  the evidence-id validation that gates every AI claim.
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  haversineKm, pointInRing, pointInGeometry, bboxOfGeometry, pointInMonitorArea,
  validGeometry, isSafeHttpUrl, normalizeNewsRow, dedupeEvidence, diffKeys,
  clusterPoints, distinctPublishers, buildNewsSnapshot, computeChangeScore,
  severityFromScore, decideAI, validateAndCleanReport,
} from "../supabase/functions/monitor-run/logic.mjs";

// Square polygon covering [0,0]..[2,2].
const SQUARE = { type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] };

test("haversineKm — known distance (Tokyo↔Osaka ≈ 400 km)", () => {
  const d = haversineKm(139.69, 35.68, 135.5, 34.69);
  assert.ok(d > 380 && d < 420, `got ${d}`);
});

test("pointInRing / pointInGeometry — inside vs outside a square", () => {
  assert.equal(pointInGeometry(1, 1, SQUARE), true);
  assert.equal(pointInGeometry(3, 3, SQUARE), false);
  assert.equal(pointInGeometry(-0.5, 1, SQUARE), false);
});

test("pointInGeometry — MultiPolygon + a hole", () => {
  const holed = { type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]] };
  assert.equal(pointInGeometry(0.5, 0.5, holed), true);   // in outer, outside hole
  assert.equal(pointInGeometry(2, 2, holed), false);      // in the hole
  const multi = { type: "MultiPolygon", coordinates: [SQUARE.coordinates, [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]]] };
  assert.equal(pointInGeometry(10.5, 10.5, multi), true);
  assert.equal(pointInGeometry(5, 5, multi), false);
});

test("pointInMonitorArea — circle uses exact haversine (in vs out)", () => {
  const m = { geometry_kind: "circle", center_lng: 139.69, center_lat: 35.68, radius_km: 60 };
  assert.equal(pointInMonitorArea(139.70, 35.69, m), true);       // ~1 km away
  assert.equal(pointInMonitorArea(135.5, 34.69, m), false);       // ~400 km away
});

test("pointInMonitorArea — polygon path with bbox pre-filter", () => {
  const m = { geometry_kind: "polygon", geometry: SQUARE, bbox: bboxOfGeometry(SQUARE) };
  assert.equal(pointInMonitorArea(1, 1, m), true);
  assert.equal(pointInMonitorArea(100, 100, m), false);   // rejected by bbox
});

test("bboxOfGeometry", () => {
  assert.deepEqual(bboxOfGeometry(SQUARE), [0, 0, 2, 2]);
});

test("validGeometry — accepts real polygons, rejects junk", () => {
  assert.equal(validGeometry(SQUARE), true);
  assert.equal(validGeometry({ type: "Polygon", coordinates: [[[0, 0], [1, 0]]] }), false); // <4 pts
  assert.equal(validGeometry({ type: "Point", coordinates: [0, 0] }), false);
  assert.equal(validGeometry(null), false);
  assert.equal(validGeometry({ type: "Polygon", coordinates: [[[0, 0], [999, 0], [1, 1], [0, 0]]] }), false); // lng>180
});

test("isSafeHttpUrl — only http/https", () => {
  assert.equal(isSafeHttpUrl("https://example.test/a"), true);
  assert.equal(isSafeHttpUrl("http://example.test/a"), true);
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("data:text/html,x"), false);
  assert.equal(isSafeHttpUrl(""), false);
});

test("normalizeNewsRow — canonical evidence + dedup_key + url scheme guard", () => {
  const row = { id: 7, lang: "en", topic: "world", title: "Quake near Tokyo", publisher: "Test Wire", link: "https://example.test/News/1?utm=x#frag", pub_date: "2026-07-20T00:00:00Z", subject_lng: 139.7, subject_lat: 35.7, subject_name_en: "Tokyo" };
  const e = normalizeNewsRow(row);
  assert.equal(e.source_type, "news");
  assert.equal(e.source_url, "https://example.test/News/1?utm=x#frag");
  assert.equal(e.dedup_key, "news:https://example.test/news/1"); // query+frag stripped, lowercased
  assert.equal(e.lng, 139.7);
  // unsafe scheme → source_url null, still keyed
  const bad = normalizeNewsRow({ ...row, link: "javascript:alert(1)" });
  assert.equal(bad.source_url, null);
});

test("dedupeEvidence — by dedup_key", () => {
  const a = { dedup_key: "k1" }, b = { dedup_key: "k1" }, c = { dedup_key: "k2" };
  assert.equal(dedupeEvidence([a, b, c]).length, 2);
});

test("diffKeys — new / gone / continuing", () => {
  const d = diffKeys(["a", "b", "c"], ["b", "c", "d"]);
  assert.deepEqual(d.new.sort(), ["a"]);
  assert.deepEqual(d.gone.sort(), ["d"]);
  assert.deepEqual(d.continuing.sort(), ["b", "c"]);
});

test("clusterPoints — near merge, far split", () => {
  const near = [{ lng: 0, lat: 0 }, { lng: 0.1, lat: 0.1 }];    // ~15 km
  assert.equal(clusterPoints(near, 60).length, 1);
  const far = [{ lng: 0, lat: 0 }, { lng: 10, lat: 10 }];       // ~1500 km
  assert.equal(clusterPoints(far, 60).length, 2);
});

test("computeChangeScore — new independent events beat volume-only churn", () => {
  const base = { count: 5, publishers: 3 };
  // 4 new items across 3 clusters, 2 corroborated → meaningful
  const meaningful = computeChangeScore({ diff: { new: ["a", "b", "c", "d"], gone: [], continuing: [] }, current: { count: 9, publishers: 6 }, baseline: base, newClusters: 3, corroboratedClusters: 2 });
  // volume rose but 0 new keys, 0 clusters (all continuing rewrites) → near zero
  const churn = computeChangeScore({ diff: { new: [], gone: [], continuing: ["x", "y"] }, current: { count: 12, publishers: 3 }, baseline: base, newClusters: 0, corroboratedClusters: 0 });
  assert.ok(meaningful > 0.5, `meaningful=${meaningful}`);
  assert.ok(churn < 0.2, `churn=${churn}`);
  assert.ok(meaningful > churn);
});

test("severityFromScore — buckets", () => {
  assert.equal(severityFromScore(0), "none");
  assert.equal(severityFromScore(0.2), "low");
  assert.equal(severityFromScore(0.4), "medium");
  assert.equal(severityFromScore(0.6), "high");
  assert.equal(severityFromScore(0.8), "critical");
});

test("decideAI — first run establishes baseline (no AI)", () => {
  const r = decideAI({ isFirstRun: true, hasData: true, newCount: 5, changeScore: 0.9, sensitivity: {} });
  assert.equal(r.call, false);
  assert.equal(r.skip, "insufficient_baseline");
});

test("decideAI — no new items → no_change (no AI)", () => {
  const r = decideAI({ isFirstRun: false, hasData: true, newCount: 0, changeScore: 0.9, sensitivity: {} });
  assert.equal(r.call, false);
  assert.equal(r.skip, "no_change");
});

test("decideAI — below threshold → skip", () => {
  const r = decideAI({ isFirstRun: false, hasData: true, newCount: 1, changeScore: 0.1, sensitivity: { min_score: 0.3 } });
  assert.equal(r.call, false);
  assert.equal(r.skip, "below_threshold");
});

test("decideAI — no data → no AI (never 'no change')", () => {
  const r = decideAI({ isFirstRun: false, hasData: false, newCount: 0, changeScore: 0, sensitivity: {} });
  assert.equal(r.call, false);
  assert.equal(r.skip, "no_data");
});

test("decideAI — real change calls AI", () => {
  const r = decideAI({ isFirstRun: false, hasData: true, newCount: 4, changeScore: 0.6, sensitivity: {} });
  assert.equal(r.call, true);
});

test("validateAndCleanReport — drops claims citing a nonexistent evidence id", () => {
  const valid = new Set(["ev_1", "ev_2"]);
  const byKey = new Map([["ev_1", { lng: 1, lat: 1, label: "A" }], ["ev_2", { lng: 2, lat: 2, label: "B" }]]);
  const report = {
    severity: "medium", headline: "Two developments", summary: "…",
    changes: [
      { claim: "Real claim.", evidence_ids: ["ev_1", "ev_99"] },   // ev_99 dropped, claim survives on ev_1
      { claim: "Fabricated claim.", evidence_ids: ["ev_77"] },     // no valid id → dropped entirely
    ],
    unchanged: ["nothing else"], data_gaps: [], limitations: [],
  };
  const { ok, cleaned, invalidRefs } = validateAndCleanReport(report, valid, byKey);
  assert.equal(ok, true);
  assert.equal(cleaned.changes.length, 1);
  assert.deepEqual(cleaned.changes[0].evidence_ids, ["ev_1"]);
  assert.ok(invalidRefs.includes("ev_99") && invalidRefs.includes("ev_77"));
  // change_points synthesized from the surviving cited evidence's coords
  assert.equal(cleaned.change_points.length, 1);
  assert.deepEqual(cleaned.change_points[0], { lng: 1, lat: 1, label: "A", evidence_id: "ev_1" });
});

test("validateAndCleanReport — a report with NO grounded claim is rejected", () => {
  const valid = new Set(["ev_1"]);
  const report = { headline: "All made up", changes: [{ claim: "x", evidence_ids: ["ev_nope"] }] };
  const { ok } = validateAndCleanReport(report, valid, new Map());
  assert.equal(ok, false);
});

test("validateAndCleanReport — invalid severity is nulled (caller falls back to score)", () => {
  const valid = new Set(["ev_1"]);
  const byKey = new Map([["ev_1", { lng: 0, lat: 0, label: "" }]]);
  const report = { severity: "apocalyptic", headline: "H", changes: [{ claim: "c", evidence_ids: ["ev_1"] }] };
  const { ok, cleaned } = validateAndCleanReport(report, valid, byKey);
  assert.equal(ok, true);
  assert.equal(cleaned.severity, null);
});

test("buildNewsSnapshot / distinctPublishers", () => {
  const items = [
    { dedup_key: "k1", source_name: "BBC", payload: { topic: "world" } },
    { dedup_key: "k2", source_name: "bbc", payload: { topic: "world" } },
    { dedup_key: "k3", source_name: "Reuters", payload: { topic: "business" } },
  ];
  assert.equal(distinctPublishers(items), 2); // case-insensitive
  const s = buildNewsSnapshot(items);
  assert.equal(s.count, 3);
  assert.equal(s.publishers, 2);
  assert.deepEqual(s.keys, ["k1", "k2", "k3"]);
});
