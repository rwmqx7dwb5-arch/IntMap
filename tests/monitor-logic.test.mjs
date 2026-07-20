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
  severityFromScore, decideAI, validateClaims, buildReport, partitionByNovelty,
  classifyDisappeared,
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

test("validateClaims — drops claims citing a nonexistent evidence id", () => {
  const valid = new Set(["ev_1", "ev_2"]);
  const byKey = new Map([["ev_1", { lng: 1, lat: 1, label: "A" }], ["ev_2", { lng: 2, lat: 2, label: "B" }]]);
  const report = {
    severity: "medium",
    changes: [
      { claim: "Real claim.", evidence_ids: ["ev_1", "ev_99"] },   // ev_99 dropped, claim survives on ev_1
      { claim: "Fabricated claim.", evidence_ids: ["ev_77"] },     // no valid id → dropped entirely
    ],
  };
  const { ok, claims, invalidRefs, changePoints } = validateClaims(report, valid, byKey);
  assert.equal(ok, true);
  assert.equal(claims.length, 1);
  assert.deepEqual(claims[0].evidence_ids, ["ev_1"]);
  assert.ok(invalidRefs.includes("ev_99") && invalidRefs.includes("ev_77"));
  // change_points synthesized from the surviving cited evidence's coords
  assert.equal(changePoints.length, 1);
  assert.deepEqual(changePoints[0], { lng: 1, lat: 1, label: "A", evidence_id: "ev_1" });
});

test("validateClaims — a report with NO grounded claim is rejected", () => {
  const valid = new Set(["ev_1"]);
  const report = { headline: "All made up", changes: [{ claim: "x", evidence_ids: ["ev_nope"] }] };
  const { ok, claims } = validateClaims(report, valid, new Map());
  assert.equal(ok, false);
  assert.equal(claims.length, 0);
});

test("validateClaims — invalid severity is nulled (caller falls back to score)", () => {
  const valid = new Set(["ev_1"]);
  const byKey = new Map([["ev_1", { lng: 0, lat: 0, label: "" }]]);
  const report = { severity: "apocalyptic", changes: [{ claim: "c", evidence_ids: ["ev_1"] }] };
  const { ok, severity } = validateClaims(report, valid, byKey);
  assert.equal(ok, true);
  assert.equal(severity, null);
});

// ── (#R144) Grounded report: headline/summary/unchanged/data_gaps are built from
//    the AUTHORITATIVE diff numbers + validated claims — never from AI free text.
test("buildReport — headline & summary are built ONLY from authoritative numbers", () => {
  const diffOut = { new: 3, gone: 1, continuing: 2, new_clusters: 2, corroborated_clusters: 1, prev_count: 5, cur_count: 8 };
  const claims = [{ claim: "Flooding reported near the port.", evidence_ids: ["ev_1"] }];
  const r = buildReport({ areaLabel: "Rotterdam", diffOut, metrics: { articles: { prev: 5, cur: 8, delta: 3 } }, claims, severity: "high", changePoints: [], failSources: [] });
  // headline uses the authoritative NEW count and the area
  assert.match(r.headline, /^3 new reports in Rotterdam$/);
  // summary uses the authoritative numbers verbatim (5 → 8 (+3))
  assert.match(r.summary, /3 new items/);
  assert.match(r.summary, /5 → 8 \(\+3\)/);
  // continuing count → an "unchanged" line
  assert.equal(r.unchanged.length, 1);
  assert.match(r.unchanged[0], /2 previously-seen reports/);
  // the AI's claims are carried through verbatim as `changes`
  assert.deepEqual(r.changes, claims);
  assert.equal(r.severity, "high");
});

test("buildReport — no fabricated numbers can leak: it ignores any AI-supplied text fields", () => {
  const diffOut = { new: 1, gone: 0, continuing: 0, new_clusters: 1, corroborated_clusters: 0, prev_count: 0, cur_count: 1 };
  // Even if a caller tried to smuggle AI headline/summary in, buildReport doesn't read them.
  const r = buildReport({ areaLabel: "Area", diffOut, metrics: null, claims: [{ claim: "c", evidence_ids: ["ev_1"] }], severity: null, changePoints: [], failSources: [] });
  assert.match(r.headline, /^1 new report in Area$/);         // singular, from the number
  assert.equal(r.unchanged.length, 0);                          // continuing=0 → no unchanged line
  assert.ok(r.severity && r.severity !== "none");              // derived from the diff, not AI
});

test("buildReport — data_gaps come ONLY from sources that actually failed", () => {
  const diffOut = { new: 2, gone: 0, continuing: 0, new_clusters: 1, corroborated_clusters: 0, prev_count: 0, cur_count: 2 };
  const r = buildReport({ areaLabel: "X", diffOut, metrics: null, claims: [{ claim: "c", evidence_ids: ["ev_1"] }], severity: "low", changePoints: [], failSources: ["weather", "earthquake"] });
  assert.equal(r.data_gaps.length, 2);
  assert.match(r.data_gaps[0], /weather source was unavailable/);
  assert.match(r.data_gaps[1], /earthquake source was unavailable/);
  // limitations are fixed general caveats (not factual assertions), always present
  assert.ok(r.limitations.length >= 1);
  assert.match(r.limitations[0], /reported subject/);
});

// ── (#R144) Ledger-based novelty: cap-proof + deterministic "new".
test("partitionByNovelty — a re-appearing/cap-displaced item is NOT falsely new", () => {
  const items = [{ dedup_key: "a" }, { dedup_key: "b" }, { dedup_key: "c" }];
  const prior = new Set(["b"]);                                  // b was seen before
  const { newItems, newKeys } = partitionByNovelty(items, prior);
  assert.deepEqual(newKeys.sort(), ["a", "c"]);                  // only genuinely-new keys
  assert.equal(newItems.length, 2);
  // adding a previously-seen key to the ledger makes it non-new next time (flap-proof)
  const { newKeys: k2 } = partitionByNovelty(items, new Set(["a", "b", "c"]));
  assert.deepEqual(k2, []);
});

test("partitionByNovelty — result is independent of item order (deterministic set)", () => {
  const prior = new Set(["x"]);
  const a = partitionByNovelty([{ dedup_key: "x" }, { dedup_key: "y" }, { dedup_key: "z" }], prior).newKeys.slice().sort();
  const b = partitionByNovelty([{ dedup_key: "z" }, { dedup_key: "x" }, { dedup_key: "y" }], prior).newKeys.slice().sort();
  assert.deepEqual(a, b);
  assert.deepEqual(a, ["y", "z"]);
});

test("classifyDisappeared — cap-displaced (in-window) is 'absent', not a real 'gone'; aged-out is 'expired'", () => {
  const now = Date.parse("2026-07-20T00:00:00Z");
  const windowStart = now - 72 * 3600 * 1000;                    // 72h news window
  const observed = new Map([
    ["old", "2026-07-15T00:00:00Z"],   // 5 days old → outside window → expired
    ["fresh", "2026-07-19T12:00:00Z"], // 12h old → inside window → absent (cap), NOT meaningful
  ]);
  const { expired, absent } = classifyDisappeared(["old", "fresh"], new Set(), observed, windowStart);
  assert.deepEqual(expired, ["old"]);
  assert.deepEqual(absent, ["fresh"]);
});

test("(#R144) cap-induced churn does not create a change: novelty is stable across a shifting cap", () => {
  // Run N ledger already knows a1..a5. A new item a6 arrives; the cap drops a5.
  const prior = new Set(["a1", "a2", "a3", "a4", "a5"]);
  const capped = [{ dedup_key: "a6" }, { dedup_key: "a1" }, { dedup_key: "a2" }, { dedup_key: "a3" }, { dedup_key: "a4" }]; // a5 pushed out
  const { newKeys } = partitionByNovelty(capped, prior);
  assert.deepEqual(newKeys, ["a6"]);                             // ONLY the genuinely-new item, not a re-shuffle
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
