// ============================================================================
//  IntMap · world-graph-ingest — keeps the PORT slice of the persistent world graph current
//  (supabase/migrations/20261120120000_world_graph_ingest.sql · _shared/world-graph-ports.js · dev-notes/2026-11-20-world-graph-ports.md)
// ----------------------------------------------------------------------------
//  WHAT: reads Wikidata (ports, operators/owners, throughput, rail/road ties), UN/LOCODE (names, points, function
//  flags) and Eurostat mar_go_aa (tonnes handled per port and year), joins them by identifier (_shared/world-graph-ports.js),
//  and applies the result through world_graph_ingest_begin / _apply / _finish: what is new or revised is written, what
//  the upstreams no longer state is retired (refused if that would be most of the slice), and the run — when, what each
//  upstream said about its own freshness, what changed — is a row in world_graph_ingest_runs that the page shows.
//  A run that cannot reach an upstream FAILS (and is recorded as such); it never applies a thinner picture.
//
//  WHO CALLS IT: pg_cron, weekly (the migration), with the x-world-graph-secret header; fail-closed if the secret is unset.
//  POST only. Body {"feed":"ports"} (the only feed so far).
//
//  Deploy:  supabase functions deploy world-graph-ingest --project-ref vpekfwdpurzejrrmacac --use-api --no-verify-jwt
//  Secrets: supabase secrets set WORLD_GRAPH_INGEST_SECRET=<random>   (REQUIRED — fail-closed)
//           select vault.create_secret('<the same value>', 'world_graph_ingest_secret');   (so the weekly cron can post it)
//  (SUPABASE_URL and the project keys are injected — read through _shared/supabase-keys.js.)
//
//  NOTE: written WITHOUT TypeScript annotations, like the other functions — scripts/static-checks.mjs runs `node --check`.
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { secretKey, denoEnv } from "../_shared/supabase-keys.js";
import { siteUrl } from "../_shared/site-origin.js";
import { fetchUpstreams, parseEurostat, parseLocode, build, UA } from "../_shared/world-graph-ports.js";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-world-graph-secret" };
const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { ...CORS, "Content-Type": "application/json" } });

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/* 4,000 claims a call: measured in PGlite 2026-11-20 — 30,646 claims apply in ~6 s of database time, and a request body of this size stays well under the gateway's limit. */
export const CLAIM_CHUNK = 4000;

export async function runPorts(db, fetchFn) {
  const t0 = Date.now();
  const { data: run, error: be } = await db.rpc("world_graph_ingest_begin", { p_feed: "ports" });
  if (be) throw new Error("begin: " + be.message);
  try {
    const up = await fetchUpstreams(fetchFn, UA);
    const eurostat = parseEurostat(up.eurostat);
    if (!eurostat.length || !up.wd.nodes.length) throw new Error("an upstream answered empty (eurostat " + eurostat.length + ", wikidata ports " + up.wd.nodes.length + ")");
    const want = new Set(eurostat.map((r) => r.locode));
    up.wd.nodes.forEach((b) => { if (b.lo) want.add(b.lo.value.replace(/\s/g, "")); });
    const locode = parseLocode(up.locode, want);
    if (locode.size < 100) throw new Error("UN/LOCODE answered too few locations (" + locode.size + ")");
    /* the company atlas ids: the page's own companies are joined by Wikidata id, not by spelling */
    const ar = await fetchFn(siteUrl("data/companies/index.json"), { headers: { "User-Agent": UA } });
    if (!ar.ok) throw new Error("company atlas " + ar.status);
    const atlas = (await ar.json()).companies || [];
    const lngRows = await db.from("world_graph_nodes").select("ref").eq("kind", "LNG terminal");
    if (lngRows.error) throw new Error("lng refs: " + lngRows.error.message);
    const g = build({ wd: up.wd, eurostat, locode, atlasByWd: new Map(atlas.filter((c) => c.wd).map((c) => [c.wd, c])), lngRefs: new Set((lngRows.data || []).map((r) => r.ref)), retrieved: new Date().toISOString().slice(0, 10) });
    const total = { nodes: {}, edges: {}, claims: {} };
    const add = (r) => ["nodes", "edges", "claims"].forEach((k) => Object.entries(r[k] || {}).forEach(([a, b]) => { total[k][a] = (total[k][a] || 0) + b; }));
    const first = await db.rpc("world_graph_ingest_apply", { p_run: run, p_nodes: g.nodes, p_edges: g.edges, p_claims: [] });
    if (first.error) throw new Error("apply nodes/edges: " + first.error.message);
    add(first.data);
    for (let i = 0; i < g.claims.length; i += CLAIM_CHUNK) {
      const r = await db.rpc("world_graph_ingest_apply", { p_run: run, p_nodes: [], p_edges: [], p_claims: g.claims.slice(i, i + CLAIM_CHUNK) });
      if (r.error) throw new Error("apply claims @" + i + ": " + r.error.message);
      add(r.data);
    }
    const upstream = {
      wikidata: { rows: Object.fromEntries(Object.entries(up.wd).map(([k, v]) => [k, v.length])), url: "https://query.wikidata.org/sparql" },
      eurostat: { dataset: "mar_go_aa", updated: up.eurostat.updated || null, rows: eurostat.length },
      unlocode: { rows: locode.size, url: "https://unece.org/trade/cefact/unlocode-code-list-country-and-territory" },
    };
    const fin = await db.rpc("world_graph_ingest_finish", { p_run: run, p_upstream: upstream, p_counts: total });
    if (fin.error) throw new Error("finish: " + fin.error.message);
    return { run, ms: Date.now() - t0, built: { nodes: g.nodes.length, edges: g.edges.length, claims: g.claims.length }, applied: total, finish: fin.data };
  } catch (e) {
    await db.rpc("world_graph_ingest_fail", { p_run: run, p_note: String(e && e.message || e) });
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const secret = Deno.env.get("WORLD_GRAPH_INGEST_SECRET") || "";
  if (!secret) return json({ error: "not_configured", message: "world-graph-ingest is disabled: WORLD_GRAPH_INGEST_SECRET is not set." }, 503);
  const got = req.headers.get("x-world-graph-secret") || "";
  if (!got || !timingSafeEqual(got, secret)) return json({ error: "unauthorized" }, 401);
  let body = {};
  try { body = await req.json(); } catch (_) { body = {}; }
  const feed = body.feed || "ports";
  if (feed !== "ports") return json({ error: "unknown_feed", feed }, 400);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = secretKey(denoEnv);
  if (!url || !key) return json({ error: "not_configured", message: "the project URL or key is not injected" }, 503);
  const db = createClient(url, key, { auth: { persistSession: false } });
  try {
    return json({ ok: true, ...(await runPorts(db, fetch)) });
  } catch (e) {
    return json({ ok: false, error: "ingest_failed", message: String(e && e.message || e) }, 502);
  }
});
