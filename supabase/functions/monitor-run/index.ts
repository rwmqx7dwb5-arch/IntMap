// ============================================================================
//  IntMap · monitor-run  —  Supabase Edge Function (Deno)
// ----------------------------------------------------------------------------
//  The server-side runner for AREA MONITORS (#R141). It runs whether or not the
//  user's browser is open. Two entry modes, both auth-gated, both fail-closed:
//
//   1. CRON  — pg_cron (via pg_net) POSTs with header `x-monitor-secret:<secret>`.
//              Claims up to N DUE monitors atomically (monitor_claim_due →
//              FOR UPDATE SKIP LOCKED, so two ticks never process the same one),
//              processes each, updates next_run_at. Fail-closed: MONITOR_SECRET
//              MUST be set or every request is refused (503).
//   2. USER  — the UI's "Run now" POSTs with the user's JWT + {monitorId}. We
//              verify the JWT, confirm the monitor belongs to that user, enforce
//              a short manual-run cooldown, then run just that one.
//
//  PER-MONITOR PIPELINE (the core rule: CODE decides "changed?", AI only explains)
//    collect (news from current_news within the geometry) → normalize + dedup →
//    snapshot → load baseline (previous run / window) → MECHANICAL diff
//    (new/gone/continuing) → change score → decideAI() → (only on meaningful
//    change) call the AI with the evidence + diff → VALIDATE every evidence id →
//    persist run + evidence + (maybe) report → schedule next_run_at → prune.
//
//  The AI never decides whether something changed, never sees data outside the
//  area, and every factual claim it returns is dropped unless it cites a real
//  ev_key from THIS run's evidence. A source-fetch failure is NEVER "no change".
//
//  Deploy:   supabase functions deploy monitor-run --no-verify-jwt --project-ref vpekfwdpurzejrrmacac
//  Secrets:  supabase secrets set MONITOR_SECRET=<random>          (REQUIRED — fail-closed)
//            # AI reuses the SAME server-held key/provider as ai-proxy:
//            supabase secrets set AI_PROVIDER=openai   AI_MODEL=gpt-5.6-luna   OPENAI_API_KEY=sk-...
//            supabase secrets set MONITOR_AI=off        (optional kill-switch → mechanical only)
//  (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
// ============================================================================

import { createClient } from "@supabase/supabase-js";   // pinned in this function's deno.json
import {
  normalizeNewsRow, dedupeEvidence, pointInMonitorArea, bboxOfGeometry, validGeometry,
  buildNewsSnapshot, clusterPoints, computeChangeScore, severityFromScore,
  decideAI, validateClaims, buildReport, partitionByNovelty,
} from "./logic.mjs";
/* (#R285) WHO Atlas is, from the generated mirror of js/atlas-persona.js — the same text the browser
   surfaces use. Editing it here is a build failure; edit js/atlas-persona.js and run
   `node scripts/sync-atlas-persona.mjs`. */
import { personaPrompt } from "../_shared/atlas-persona.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-monitor-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const PROMPT_VERSION = "monitor-r141-1";

// ---- Bounds / cost guards -------------------------------------------------
const CLAIM_LIMIT = 5;            // due monitors grabbed per cron tick
const GLOBAL_DEADLINE_MS = 110_000; // stop starting new monitors past this (wall-clock guard)
const MAX_EVIDENCE = 60;          // evidence rows stored per run
const MAX_AI_EVIDENCE = 40;       // NEW items sent to the AI
const MANUAL_COOLDOWN_MS = 30_000; // min gap between manual "run now"s per monitor
const NEWS_WINDOW_MS = 72 * 3600 * 1000; // current_news only holds ~72 h
const RETAIN_RUNS = 100;          // keep the newest N runs per monitor
const RETAIN_EVIDENCE_RUNS = 12;  // keep evidence only for the newest N runs (bulk data)
const KEEP_RUNS_PER_MONITOR = RETAIN_RUNS;
// The long-lived per-item ledger (monitor_seen_items) is what makes a "past N
// days" baseline real. Retention MUST be ≥ the largest comparison window the UI
// offers (30 days) so novelty over that window is always answerable; margin lets
// an item age out gracefully. Keep the UI's window options ≤ this.
const RETAIN_SEEN_DAYS = 45;
const MAX_SEEN_WINDOW_DAYS = 30;  // the largest window the UI/DB actually supports

// (#R138-style) constant-time compare so MONITOR_SECRET can't be recovered byte-by-byte.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

// ---------------------------------------------------------------------------
//  AI provider (server-held key; same env convention as ai-proxy / refresh-news).
//  OpenAI goes through the Responses API (works with gpt-5.6-luna, JSON mode, no
//  web tools — the report is grounded ONLY in the evidence we pass). Anthropic &
//  Gemini kept as selectable fallbacks.
// ---------------------------------------------------------------------------
function aiProviderConfig(): { provider: string; key: string; model: string } | null {
  if ((Deno.env.get("MONITOR_AI") || "").toLowerCase() === "off") return null;
  let provider = (Deno.env.get("AI_PROVIDER") || "").toLowerCase();
  if (!provider) {
    if (Deno.env.get("OPENAI_API_KEY")) provider = "openai";
    else if (Deno.env.get("ANTHROPIC_API_KEY")) provider = "anthropic";
    else if (Deno.env.get("GEMINI_API_KEY")) provider = "gemini";
  }
  const model = Deno.env.get("MONITOR_AI_MODEL") || Deno.env.get("AI_MODEL") || "";
  if (provider === "openai") { const key = Deno.env.get("OPENAI_API_KEY"); if (key) return { provider, key, model: model || "gpt-5.6-luna" }; }   /* (#R148) default Luna (Terra 403 / 4o-mini no-access on this project) */
  else if (provider === "anthropic") { const key = Deno.env.get("ANTHROPIC_API_KEY"); if (key) return { provider, key, model: model || "claude-3-5-haiku-latest" }; }
  else if (provider === "gemini") { const key = Deno.env.get("GEMINI_API_KEY"); if (key) return { provider, key, model: model || "gemini-2.0-flash" }; }
  return null;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 55_000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}

/* (#R285) The area-monitor report is Atlas speaking — the user reads its headline and summary in the
   monitors panel — so it opens with the same persona every other Atlas surface uses. */
const AI_SYS =
  personaPrompt("working here as IntMap's area-monitoring analyst") +
  "You receive: (1) a monitored AREA, (2) a machine-computed CHANGE SUMMARY " +
  "(exact new/continuing/gone counts and cluster counts — these numbers are AUTHORITATIVE, do not recompute or contradict them), " +
  "and (3) an EVIDENCE list where each item has an id (like \"ev_3\"), source, title, url, date and place. Write a factual CHANGE report as JSON.\n" +
  "HARD RULES: (a) EVERY factual claim in `changes` MUST cite one or more evidence ids that appear verbatim in the EVIDENCE list. " +
  "Never invent an id, a number, a source, a place or an event that is not in the evidence. (b) Report ONLY on the monitored area — " +
  "the evidence is already filtered to it. (c) Use the CHANGE SUMMARY numbers for any counts. (d) `severity` reflects the significance of the CHANGE " +
  "(none|low|medium|high|critical). (e) Put honest caveats in `data_gaps` (e.g. a source was unavailable) and `limitations` " +
  "(e.g. article locations are the reported subject, not confirmed positions). (f) If the change is minor, say so plainly and keep severity low.\n" +
  "Return ONLY JSON: {\"severity\":string,\"headline\":string,\"summary\":string,\"changes\":[{\"claim\":string,\"evidence_ids\":[string]}]," +
  "\"unchanged\":[string],\"data_gaps\":[string],\"limitations\":[string]}. No prose, no code fences.";

async function callAI(cfg: { provider: string; key: string; model: string }, userMsg: string): Promise<string> {
  if (cfg.provider === "openai") {
    // GPT-5.6 (Terra) via the Responses API. NOTE: OpenAI's json_object validator requires the word
    // "json" in the INPUT messages (not `instructions`); the user message carries it. A 400 still
    // degrades to a tool-free/JSON-mode-free retry (like ai-proxy) — the prompt + client validation
    // enforce the shape either way, so a request-shape rejection never blanks a report.
    const build = (jsonMode: boolean) => ({
      model: cfg.model,
      input: [{ role: "user", content: [{ type: "input_text", text: userMsg }] }],
      instructions: AI_SYS,
      max_output_tokens: 3200,
      reasoning: { effort: "low" },
      ...(jsonMode ? { text: { format: { type: "json_object" } } } : {}),
      store: false,
    });
    const post = (b: Record<string, unknown>) => fetchWithTimeout("https://api.openai.com/v1/responses", {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.key }, body: JSON.stringify(b),
    });
    let r = await post(build(true));
    if (!r.ok && r.status === 400) r = await post(build(false));   // (#R141) degrade: drop JSON mode on a 400
    if (!r.ok) throw new Error("openai " + r.status + " " + (await r.text().catch(() => "")).slice(0, 200));
    const j = await r.json();
    if (typeof j?.output_text === "string" && j.output_text) return j.output_text;
    const parts = (Array.isArray(j?.output) ? j.output : [])
      .filter((it: { type?: string }) => it?.type === "message")
      .flatMap((it: { content?: unknown[] }) => (Array.isArray(it.content) ? it.content : []))
      .filter((p: { type?: string }) => p?.type === "output_text")
      .map((p: { text?: string }) => p.text || "");
    return parts.join("");
  }
  if (cfg.provider === "gemini") {
    const r = await fetchWithTimeout("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(cfg.model) + ":generateContent", {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: userMsg }] }], systemInstruction: { parts: [{ text: AI_SYS }] }, generationConfig: { maxOutputTokens: 3200, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } } }),
    });
    if (!r.ok) throw new Error("gemini " + r.status + " " + (await r.text().catch(() => "")).slice(0, 200));
    const j = await r.json();
    return (j?.candidates?.[0]?.content?.parts || []).filter((p: { thought?: boolean }) => p?.thought !== true).map((p: { text?: string }) => p.text || "").join("");
  }
  // anthropic
  const r = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json", "x-api-key": cfg.key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: cfg.model, max_tokens: 3200, system: AI_SYS, messages: [{ role: "user", content: userMsg }] }),
  });
  if (!r.ok) throw new Error("anthropic " + r.status + " " + (await r.text().catch(() => "")).slice(0, 200));
  const j = await r.json();
  return (j?.content || []).map((b: { text?: string }) => b.text || "").join("");
}

function parseJson(txt: string): Record<string, unknown> | null {
  try {
    const t = (txt || "").replace(/```json/gi, "").replace(/```/g, "");
    const lo = t.indexOf("{"), hi = t.lastIndexOf("}");
    if (lo < 0 || hi < lo) return null;
    return JSON.parse(t.slice(lo, hi + 1));
  } catch { return null; }
}

// deno-lint-ignore no-explicit-any
type DB = any;

// ---------------------------------------------------------------------------
//  Collect the NEWS source: rows from current_news whose SUBJECT falls inside the
//  monitor's area and within the news window. Returns {ok, items} — ok=false means
//  the source itself failed (→ never treated as "no change").
// ---------------------------------------------------------------------------
async function collectNews(db: DB, monitor: Record<string, unknown>, sinceISO: string) {
  try {
    const bbox = (Array.isArray(monitor.bbox) ? monitor.bbox : bboxOfGeometry(monitor.geometry)) as number[] | null;
    // DETERMINISTIC ORDER (#R144): newest-first with a stable id tie-breaker, applied
    // BEFORE the cap, so the same DB state always yields the same set of rows (no
    // phantom churn from Postgres' unspecified default order). Novelty itself is
    // decided by the long-lived ledger, not this cap — so an item pushed past the
    // cap by newer arrivals is never mistaken for a real change.
    let q = db.from("current_news")
      .select("id,lang,topic,title,publisher,link,pub_date,description,subject_lng,subject_lat,subject_name_en,subject_name_jp,pub_label")
      .not("subject_lng", "is", null).not("subject_lat", "is", null)
      .gte("pub_date", sinceISO)
      .order("pub_date", { ascending: false }).order("id", { ascending: true })
      .limit(1500);
    if (bbox) q = q.gte("subject_lng", bbox[0]).lte("subject_lng", bbox[2]).gte("subject_lat", bbox[1]).lte("subject_lat", bbox[3]);
    const { data, error } = await q;
    if (error) return { ok: false, items: [] as Record<string, unknown>[] };
    const items = (data || [])
      .filter((r: Record<string, number>) => pointInMonitorArea(r.subject_lng as number, r.subject_lat as number, monitor as never))
      .map(normalizeNewsRow);
    return { ok: true, items: dedupeEvidence(items).slice(0, MAX_EVIDENCE) };
  } catch { return { ok: false, items: [] as Record<string, unknown>[] }; }
}

// The registry of collectors — add earthquake/weather/fire here later; each is an
// independent async function returning {ok, items}. This is the generic seam the
// spec asks for (no news-only coupling).
const COLLECTORS: Record<string, (db: DB, m: Record<string, unknown>, sinceISO: string) => Promise<{ ok: boolean; items: Record<string, unknown>[] }>> = {
  news: collectNews,
};

// Release a monitor's lock + reschedule directly (fallback when the finalize RPC
// itself is unavailable). NEVER leaves running_since set.
async function releaseLock(db: DB, monId: string, monitor: Record<string, unknown>, intervalMin: number, nowISO: string, status: string | null) {
  const next = new Date(Date.now() + intervalMin * 60_000).toISOString();
  try {
    await db.from("area_monitors").update({
      running_since: null, last_run_at: nowISO, next_run_at: next,
      run_count: (Number(monitor.run_count) || 0) + 1, last_status: status,
    }).eq("id", monId);
  } catch (_) {
    try { await db.from("area_monitors").update({ running_since: null }).eq("id", monId); } catch (__) { /* */ }
  }
}

// ---------------------------------------------------------------------------
//  Process ONE monitor end-to-end. Always leaves a run row + releases the lock.
//  Every DB write is error-checked: a partial persistence failure is recorded as
//  a failure (retryable) and NEVER reported as success. The run finalize + report
//  + monitor-meta writes go through atomic RPCs (monitor_finalize /
//  monitor_commit_report) so they either all land or all roll back.
// ---------------------------------------------------------------------------
async function processMonitor(db: DB, monitor: Record<string, unknown>, aiCfg: { provider: string; key: string; model: string } | null, trigger: string, nowMs: number) {
  const start = nowMs;
  const monId = monitor.id as string;
  const userId = monitor.user_id as string;
  const nowISO = new Date(nowMs).toISOString();
  const sources: string[] = Array.isArray(monitor.sources) && (monitor.sources as string[]).length ? (monitor.sources as string[]) : ["news"];
  const sensitivity = (monitor.sensitivity && typeof monitor.sensitivity === "object") ? monitor.sensitivity as Record<string, unknown> : {};
  const comparison = (monitor.comparison && typeof monitor.comparison === "object") ? monitor.comparison as Record<string, unknown> : {};
  const intervalMin = Number(monitor.interval_minutes) || 360;
  const nextRunISO = () => new Date(Date.now() + intervalMin * 60_000).toISOString();
  const monMeta = () => ({ last_run_at: nowISO, next_run_at: nextRunISO(), run_count: (Number(monitor.run_count) || 0) + 1 });

  // Scaffold the run row FIRST. If THIS fails there is nowhere to record results —
  // so we must NOT proceed: release the lock and report the scaffold failure.
  const { data: runIns, error: scaffoldErr } = await db.from("monitor_runs").insert({
    monitor_id: monId, user_id: userId, status: "internal_error", trigger,
    started_at: nowISO, sources_attempted: sources,
  }).select("id").single();
  const runId = runIns?.id as string | undefined;
  if (scaffoldErr || !runId) {
    try { console.error("monitor-run scaffold insert failed", String(scaffoldErr?.message || "").slice(0, 120)); } catch (_) { /* */ }
    await releaseLock(db, monId, monitor, intervalMin, nowISO, "internal_error");
    return "scaffold_failed";
  }

  // Atomic finalize (run + monitor meta). Returns false if the RPC errored (then
  // we fall back to releasing the lock so a monitor never wedges).
  const finalize = async (runPatch: Record<string, unknown>, monPatch: Record<string, unknown>) => {
    (runPatch as Record<string, unknown>).duration_ms = Date.now() - start;
    const { error } = await db.rpc("monitor_finalize", { p_run: runId, p_mon: monId, run_patch: runPatch, mon_patch: monPatch });
    if (error) {
      try { console.error("monitor_finalize failed", String(error.message || "").slice(0, 120)); } catch (_) { /* */ }
      await releaseLock(db, monId, monitor, intervalMin, nowISO, String(runPatch.status || "internal_error"));
      return false;
    }
    return true;
  };

  try {
    if (monitor.enabled === false) {
      await finalize({ status: "disabled", retryable: false }, { ...monMeta(), last_status: "disabled" });
      return "disabled";
    }
    if (!validGeometry(monitor.geometry) && monitor.geometry_kind !== "circle") {
      await finalize({ status: "invalid_geometry", error_category: "invalid_geometry", error_detail: "geometry is not a valid Polygon/MultiPolygon", retryable: false },
                     { ...monMeta(), last_status: "invalid_geometry" });
      return "invalid_geometry";
    }

    // 1) COLLECT every selected source. Track availability per source.
    const sinceISO = new Date(nowMs - NEWS_WINDOW_MS).toISOString();
    const okSources: string[] = [], failSources: string[] = [];
    let items: Record<string, unknown>[] = [];
    for (const src of sources) {
      const collector = COLLECTORS[src];
      if (!collector) { failSources.push(src); continue; }
      const res = await collector(db, monitor, sinceISO);
      if (res.ok) { okSources.push(src); items = items.concat(res.items); }
      else failSources.push(src);
    }
    items = dedupeEvidence(items).slice(0, MAX_EVIDENCE);
    const partial = failSources.length > 0;

    // All sources down → source_unavailable (NEVER "no change"). Keep the run row.
    if (okSources.length === 0) {
      await finalize({ status: "source_unavailable", sources_ok: okSources, sources_failed: failSources, error_category: "source_unavailable", retryable: true },
                     { ...monMeta(), last_status: "source_unavailable" });
      return "source_unavailable";
    }

    // 2) SNAPSHOT (per-source + overall).
    const snapshot = { news: buildNewsSnapshot(items.filter((i) => i.source_type === "news")), sources_ok: okSources, sources_failed: failSources } as Record<string, unknown>;
    const curKeys = items.map((i) => i.dedup_key as string);
    const curKeySet = new Set(curKeys);
    const newsSnap = snapshot.news as { count: number; publishers: number; keys: string[] };

    // 3) NOVELTY via the long-lived ledger (cap-proof, deterministic). "new" = a
    //    dedup_key NOT seen within the applicable lookback window (the comparison
    //    window for baseline_window mode; the news window for previous_run mode).
    //    This is what a "past 30 days" comparison actually references — independent
    //    of per-run evidence pruning — and it never mistakes a cap-displaced or
    //    re-appearing item for a real change.
    const mode = String(comparison.mode || "previous_run");
    const windowDays = Math.max(1, Math.min(MAX_SEEN_WINDOW_DAYS, Number(comparison.window_days) || 30));
    const lookbackMs = mode === "baseline_window" ? windowDays * 86400000 : NEWS_WINDOW_MS;
    const winStartISO = new Date(nowMs - lookbackMs).toISOString();
    const { data: seenPrior, error: seenErr } = await db.from("monitor_seen_items")
      .select("dedup_key").eq("monitor_id", monId).gte("last_seen_at", winStartISO);
    const ledgerOk = !seenErr;
    const priorKeys = new Set((seenPrior || []).map((r: { dedup_key: string }) => r.dedup_key));

    // Total ledger size (ever) → distinguishes a genuinely-establishing run (empty
    // ledger, e.g. the first run after this feature shipped) from a quiet window.
    const { count: seenTotal } = await db.from("monitor_seen_items").select("id", { count: "exact", head: true }).eq("monitor_id", monId);

    // Previous-run snapshot for the DISPLAY baseline (previous_run mode metrics).
    const { data: prevRun } = await db.from("monitor_runs")
      .select("id,snapshot").eq("monitor_id", monId).not("snapshot", "is", null).neq("id", runId)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    const baselineSnap = (prevRun?.snapshot?.news) || null;
    // Establishing when there is no prior run, the ledger read failed (never flood
    // on a transient error), or the ledger is empty (first run under this system).
    const establishing = !prevRun || !ledgerOk || (Number(seenTotal) || 0) === 0;

    const { newItems, newKeys } = partitionByNovelty(items, priorKeys) as { newItems: Record<string, unknown>[]; newKeys: string[] };
    const newSet = new Set(newKeys);
    const continuing = curKeys.filter((k) => !newSet.has(k));
    // "gone" is informational only (never scores, never triggers the AI) so a
    // cap-displaced item can't manufacture a report.
    const baselineKeys = mode === "baseline_window" ? Array.from(priorKeys) : (baselineSnap?.keys || []);
    const goneKeys = baselineKeys.filter((k: string) => !curKeySet.has(k));
    const prevCount = mode === "baseline_window" ? priorKeys.size : (baselineSnap?.count || 0);

    // 4) CLUSTER + change score (CODE decides "changed?", not the AI). Score uses
    //    the ledger-based NEW set.
    const clusters = clusterPoints(newItems.map((i) => ({ lng: i.lng as number, lat: i.lat as number })), 60);
    const newClusters = clusters.length;
    const corroboratedClusters = clusters.filter((members) => {
      const pubs = new Set(members.map((idx) => String((newItems[idx].source_name as string) || "").toLowerCase()).filter(Boolean));
      return pubs.size >= 2;
    }).length;
    const changeScore = computeChangeScore({ diff: { new: newKeys, gone: goneKeys, continuing }, current: newsSnap as never, baseline: baselineSnap, newClusters, corroboratedClusters });
    const diffOut = { new: newKeys.length, gone: goneKeys.length, continuing: continuing.length, new_clusters: newClusters, corroborated_clusters: corroboratedClusters, prev_count: prevCount, cur_count: newsSnap.count };

    // 5) Persist evidence with per-run ev_key ids (ev_1…). Tag change_kind. If the
    //    evidence write fails we CANNOT ground a report → record a retryable
    //    failure (keep snapshot+diff) and never claim success.
    const evRows = items.slice(0, MAX_EVIDENCE).map((it, i) => ({
      run_id: runId, monitor_id: monId, user_id: userId, ev_key: "ev_" + (i + 1),
      source_type: it.source_type, source_name: it.source_name, source_url: it.source_url, external_id: it.external_id,
      title: it.title, observed_at: it.observed_at, fetched_at: nowISO, lng: it.lng, lat: it.lat,
      payload: it.payload, dedup_key: it.dedup_key,
      change_kind: newSet.has(it.dedup_key as string) ? "new" : "continuing",
    }));
    if (evRows.length) {
      const { error: evErr } = await db.from("monitor_evidence").insert(evRows);
      if (evErr) {
        try { console.error("monitor evidence insert failed", String(evErr.message || "").slice(0, 120)); } catch (_) { /* */ }
        await finalize({ status: "internal_error", sources_ok: okSources, sources_failed: failSources, snapshot, diff: diffOut, change_score: changeScore,
                         report_generated: false, ai_used: false, error_category: "evidence_write_failed", error_detail: "could not persist evidence rows", retryable: true, evidence_count: 0 },
                       { ...monMeta(), last_status: "internal_error" });
        await prune(db, monId);
        return "evidence_failed";
      }
    }

    // Record the current items in the long-lived ledger for future novelty (AFTER
    // computing novelty). first_seen_at is set once (default); last_seen_at bumps.
    if (ledgerOk && items.length) {
      const seenRows = items.map((it) => ({
        monitor_id: monId, user_id: userId, source_type: it.source_type, dedup_key: it.dedup_key,
        title: it.title, source_name: it.source_name, source_url: it.source_url,
        observed_at: it.observed_at, lng: it.lng, lat: it.lat, last_seen_at: nowISO, metadata: it.payload || null,
      }));
      const { error: upErr } = await db.from("monitor_seen_items").upsert(seenRows, { onConflict: "monitor_id,source_type,dedup_key" });
      if (upErr) { try { console.error("monitor seen upsert failed", String(upErr.message || "").slice(0, 120)); } catch (_) { /* */ } }
    }

    // Map dedup_key → ev_key and → coords/label (for evidence-id validation + change points).
    const keyToEv = new Map(evRows.map((e) => [e.dedup_key, e.ev_key]));
    const validKeys = new Set(evRows.map((e) => e.ev_key));
    const evByKey = new Map(evRows.map((e) => [e.ev_key, { lng: e.lng as number, lat: e.lat as number, label: (e.title as string) || "" }]));
    const baseStatus = partial ? "partial" : "success";

    // 6) DECIDE whether to call the AI. Only a real, code-detected change qualifies;
    //    an establishing run only populates the ledger (no AI, no report).
    const decision = decideAI({ isFirstRun: establishing, hasData: items.length > 0, newCount: newKeys.length, changeScore, sensitivity: sensitivity as never });
    if (!aiCfg && decision.call) { decision.call = false; decision.skip = "not_configured"; }

    if (!decision.call) {
      const status = partial ? "partial" : "success_no_change";
      await finalize({ status, sources_ok: okSources, sources_failed: failSources, snapshot, diff: diffOut, change_score: changeScore,
                       report_generated: false, ai_used: false, ai_skip_reason: decision.skip, evidence_count: evRows.length },
                     { ...monMeta(), last_status: status, last_change_severity: "none" });
      await prune(db, monId);
      return status;
    }

    // 7) CALL AI — it only writes the per-claim TEXT (each grounded in real
    //    evidence). The headline/summary/counts are built mechanically below.
    const aiEvidence = newItems.slice(0, MAX_AI_EVIDENCE).map((it) => ({
      id: keyToEv.get(it.dedup_key as string), source: it.source_name, title: it.title,
      url: it.source_url, date: it.observed_at, place: (it.payload as { subject?: string })?.subject || null,
      lng: it.lng, lat: it.lat,
    }));
    const userMsg =
      "AREA: " + String(monitor.area_label || monitor.name || "the monitored area") + "\n" +
      "CHANGE SUMMARY (authoritative): " + JSON.stringify(diffOut) + "\n" +
      "EVIDENCE (new items in the area; cite ids exactly):\n" + JSON.stringify(aiEvidence) + "\n\n" +
      // OpenAI's json_object mode requires the literal word "json" in the input message.
      "Respond with ONLY a single JSON object: {severity, changes:[{claim, evidence_ids}]}. Each claim MUST cite ids from the evidence.";

    let aiText = "", aiOk = false, aiErr = "";
    try { aiText = await callAI(aiCfg!, userMsg); aiOk = !!aiText; }
    catch (e) { aiErr = String((e as Error)?.message || e).slice(0, 160); }

    const parsed = aiOk ? parseJson(aiText) : null;
    const valid = parsed ? validateClaims(parsed, validKeys, evByKey) : { ok: false, claims: [], severity: null, changePoints: [], invalidRefs: [] };

    if (!valid.ok) {
      // AI attempted but produced no evidence-grounded claim → ai_failed, KEEP data.
      await finalize({ status: "ai_failed", sources_ok: okSources, sources_failed: failSources, snapshot, diff: diffOut, change_score: changeScore,
                       report_generated: false, ai_used: true, ai_provider: aiCfg!.provider, ai_model: aiCfg!.model,
                       error_category: "ai_failed", error_detail: (aiErr || "AI output had no evidence-grounded claim").slice(0, 200), retryable: true, evidence_count: evRows.length },
                     { ...monMeta(), last_status: "ai_failed" });
      await prune(db, monId);
      return "ai_failed";
    }

    // 8) Build the GROUNDED report (headline/summary/unchanged/data_gaps from the
    //    authoritative diff numbers + validated claims; limitations are fixed
    //    general caveats) and commit it + finalize the run + monitor meta ATOMICALLY.
    const metrics = { articles: { prev: prevCount, cur: newsSnap.count, delta: newsSnap.count - prevCount }, new_items: newKeys.length, new_clusters: newClusters, corroborated_clusters: corroboratedClusters, publishers: { prev: baselineSnap?.publishers || 0, cur: newsSnap.publishers } };
    const report = buildReport({ areaLabel: String(monitor.area_label || monitor.name || ""), diffOut, metrics, claims: valid.claims, severity: valid.severity, changePoints: valid.changePoints, failSources });
    const severity = report.severity || severityFromScore(changeScore);

    const { data: repId, error: commitErr } = await db.rpc("monitor_commit_report", {
      p_run: runId, p_mon: monId, p_user: userId,
      report: { ...report, severity, ai_provider: aiCfg!.provider, ai_model: aiCfg!.model, prompt_version: PROMPT_VERSION },
      run_patch: { status: baseStatus, sources_ok: okSources, sources_failed: failSources, snapshot, diff: diffOut, change_score: changeScore,
                   ai_used: true, ai_provider: aiCfg!.provider, ai_model: aiCfg!.model, ai_skip_reason: null, evidence_count: evRows.length, duration_ms: Date.now() - start },
      mon_patch: { ...monMeta(), last_status: baseStatus, last_change_severity: severity },
    });

    if (commitErr || !repId) {
      // The atomic commit rolled back → NOTHING was written. Record a retryable
      // failure (keep snapshot+diff), never report_generated=true, release the lock.
      try { console.error("monitor_commit_report failed", String(commitErr?.message || "").slice(0, 120)); } catch (_) { /* */ }
      await finalize({ status: "internal_error", sources_ok: okSources, sources_failed: failSources, snapshot, diff: diffOut, change_score: changeScore,
                       report_generated: false, ai_used: true, ai_provider: aiCfg!.provider, ai_model: aiCfg!.model,
                       error_category: "report_write_failed", error_detail: String(commitErr?.message || "report commit failed").slice(0, 200), retryable: true, evidence_count: evRows.length },
                     { ...monMeta(), last_status: "internal_error" });
      await prune(db, monId);
      return "report_failed";
    }

    await prune(db, monId);
    return baseStatus + "+report";
  } catch (e) {
    const ok = await finalize({ status: "internal_error", error_category: "internal_error", error_detail: String((e as Error)?.message || e).slice(0, 200), retryable: true },
                              { ...monMeta(), last_status: "internal_error" });
    if (!ok) await releaseLock(db, monId, monitor, intervalMin, nowISO, "internal_error");
    return "internal_error";
  }
}

// Retention: keep the newest RETAIN_RUNS runs; drop evidence for runs older than
// the newest RETAIN_EVIDENCE_RUNS (evidence is the bulk). Reports are kept with runs.
async function prune(db: DB, monId: string) {
  try {
    const { data: runs } = await db.from("monitor_runs").select("id").eq("monitor_id", monId).order("started_at", { ascending: false }).limit(500);
    const ids: string[] = (runs || []).map((r: { id: string }) => r.id);
    if (ids.length > KEEP_RUNS_PER_MONITOR) {
      const old = ids.slice(KEEP_RUNS_PER_MONITOR);
      await db.from("monitor_runs").delete().in("id", old);   // cascades evidence + reports
    }
    const keepEv = ids.slice(0, RETAIN_EVIDENCE_RUNS);
    if (ids.length > RETAIN_EVIDENCE_RUNS && keepEv.length) {
      // delete evidence whose run is not among the newest RETAIN_EVIDENCE_RUNS
      await db.from("monitor_evidence").delete().eq("monitor_id", monId).not("run_id", "in", "(" + keepEv.map((x) => `"${x}"`).join(",") + ")");
    }
    // Ledger retention: keep the long-lived seen-items only within RETAIN_SEEN_DAYS
    // of their last sighting. This bounds growth while guaranteeing the ledger
    // always covers the largest supported comparison window (MAX_SEEN_WINDOW_DAYS).
    const seenCutoff = new Date(Date.now() - RETAIN_SEEN_DAYS * 86400000).toISOString();
    await db.from("monitor_seen_items").delete().eq("monitor_id", monId).lt("last_seen_at", seenCutoff);
  } catch (_) { /* best-effort */ }
}

// ---------------------------------------------------------------------------
//  HTTP entry.
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
 try {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const aiCfg = aiProviderConfig();
  const nowMs = Date.now();

  let payload: { monitorId?: string } = {};
  try { payload = await req.json(); } catch (_) { payload = {}; }

  const secret = Deno.env.get("MONITOR_SECRET") || "";
  const gotSecret = req.headers.get("x-monitor-secret") || "";
  const authHeader = req.headers.get("Authorization") || "";

  // ── MODE 1: CRON (shared-secret). Fail-closed: no secret set → refuse everything.
  if (gotSecret) {
    if (!secret) return json({ error: "not_configured", message: "monitor-run disabled: MONITOR_SECRET is not set." }, 503);
    if (!timingSafeEqual(gotSecret, secret)) return json({ error: "unauthorized" }, 401);

    const { data: claimed, error: claimErr } = await db.rpc("monitor_claim_due", { p_limit: CLAIM_LIMIT, p_stale_minutes: 15 });
    if (claimErr) return json({ error: "claim_failed", message: claimErr.message }, 500);
    const monitors: Record<string, unknown>[] = claimed || [];
    const results: Record<string, string> = {};
    for (const m of monitors) {
      if (Date.now() - nowMs > GLOBAL_DEADLINE_MS) {
        // Out of wall-clock budget — release the rest so the next tick re-claims them.
        await db.from("area_monitors").update({ running_since: null }).eq("id", m.id as string);
        results[m.id as string] = "deferred";
        continue;
      }
      results[m.id as string] = await processMonitor(db, m, aiCfg, "schedule", Date.now());
    }
    return json({ ok: true, mode: "cron", claimed: monitors.length, results });
  }

  // ── MODE 2: USER "run now" (JWT + {monitorId}). Verify the JWT, then claim the
  //    monitor ATOMICALLY (ownership + enabled + lock-free-or-stale + cooldown are
  //    ALL inside one UPDATE…WHERE…RETURNING via monitor_claim_one). Two concurrent
  //    "Run now" requests can never both succeed — no check-then-act TOCTOU. It
  //    also cannot race the cron claim (both take the same row lock on the monitor).
  if (!authHeader) return json({ error: "unauthorized", message: "Send x-monitor-secret (cron) or a user JWT + monitorId." }, 401);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "auth", message: "Login required." }, 401);
  const monitorId = String(payload.monitorId || "");
  if (!monitorId) return json({ error: "bad_request", message: "monitorId required." }, 400);

  const { data: claimRows, error: claimErr } = await db.rpc("monitor_claim_one", {
    p_monitor_id: monitorId, p_user_id: user.id,
    p_cooldown_seconds: Math.round(MANUAL_COOLDOWN_MS / 1000), p_stale_minutes: 15,
  });
  if (claimErr) return json({ error: "claim_failed", message: claimErr.message }, 500);
  const claim = (Array.isArray(claimRows) ? claimRows[0] : claimRows) as { claimed?: boolean; reason?: string; monitor?: Record<string, unknown> } | undefined;
  if (!claim || !claim.claimed || !claim.monitor) {
    const reason = claim?.reason || "unavailable";
    // Honest, distinct outcomes for the UI (never a lie about success).
    const statusFor: Record<string, number> = { not_found: 404, disabled: 409, already_running: 409, cooldown: 429, unavailable: 409 };
    const msgFor: Record<string, string> = {
      not_found: "Monitor not found.",
      disabled: "This monitor is paused — resume it to run.",
      already_running: "This monitor is already running.",
      cooldown: "Please wait a moment before running again.",
      unavailable: "This monitor can't run right now.",
    };
    return json({ error: reason, message: msgFor[reason] || msgFor.unavailable }, statusFor[reason] || 409);
  }

  const status = await processMonitor(db, claim.monitor, aiCfg, "manual", Date.now());
  return json({ ok: true, mode: "manual", monitorId, status });
 } catch (topErr) {
  try { console.error("monitor-run UNCAUGHT", String((topErr as Error)?.message || topErr).slice(0, 200)); } catch (_) { /* */ }
  return json({ error: "internal_error", message: "monitor-run hit an unexpected error." }, 500);
 }
});
