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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  normalizeNewsRow, dedupeEvidence, pointInMonitorArea, bboxOfGeometry, validGeometry,
  buildNewsSnapshot, diffKeys, clusterPoints, computeChangeScore, severityFromScore,
  decideAI, validateAndCleanReport,
} from "./logic.mjs";

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
  if (provider === "openai") { const key = Deno.env.get("OPENAI_API_KEY"); if (key) return { provider, key, model: model || "gpt-4o-mini" }; }
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

const AI_SYS =
  "You are IntMap's area-monitoring analyst. You receive: (1) a monitored AREA, (2) a machine-computed CHANGE SUMMARY " +
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
    const body = {
      model: cfg.model,
      input: [{ role: "user", content: [{ type: "input_text", text: userMsg }] }],
      instructions: AI_SYS,
      max_output_tokens: 3200,
      reasoning: { effort: "low" },
      text: { format: { type: "json_object" } },
      store: false,
    };
    const r = await fetchWithTimeout("https://api.openai.com/v1/responses", {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.key }, body: JSON.stringify(body),
    });
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
    let q = db.from("current_news")
      .select("id,lang,topic,title,publisher,link,pub_date,description,subject_lng,subject_lat,subject_name_en,subject_name_jp,pub_label")
      .not("subject_lng", "is", null).not("subject_lat", "is", null)
      .gte("pub_date", sinceISO).limit(1500);
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

// ---------------------------------------------------------------------------
//  Process ONE monitor end-to-end. Always leaves a run row + releases the lock.
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

  // Scaffold the run row FIRST so snapshot/diff/evidence survive even a late crash.
  let runId = "";
  const { data: runIns } = await db.from("monitor_runs").insert({
    monitor_id: monId, user_id: userId, status: "internal_error", trigger,
    started_at: nowISO, sources_attempted: sources,
  }).select("id").single();
  runId = runIns?.id;

  const finalizeRun = async (patch: Record<string, unknown>) => {
    patch.finished_at = new Date().toISOString();
    patch.duration_ms = Date.now() - start;
    if (runId) await db.from("monitor_runs").update(patch).eq("id", runId);
  };
  const scheduleNext = async (extra: Record<string, unknown> = {}) => {
    const next = new Date(Date.now() + intervalMin * 60_000).toISOString();
    await db.from("area_monitors").update({
      running_since: null, last_run_at: nowISO, next_run_at: next,
      run_count: (Number(monitor.run_count) || 0) + 1, ...extra,
    }).eq("id", monId);
  };

  try {
    if (monitor.enabled === false) {
      await finalizeRun({ status: "disabled" });
      await db.from("area_monitors").update({ running_since: null }).eq("id", monId);
      return "disabled";
    }
    if (!validGeometry(monitor.geometry) && monitor.geometry_kind !== "circle") {
      await finalizeRun({ status: "invalid_geometry", error_category: "invalid_geometry", error_detail: "geometry is not a valid Polygon/MultiPolygon", retryable: false });
      await scheduleNext({ last_status: "invalid_geometry" });
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

    // All sources down → source_unavailable (NEVER "no change"). Keep the run row.
    if (okSources.length === 0) {
      await finalizeRun({ status: "source_unavailable", sources_ok: okSources, sources_failed: failSources, error_category: "source_unavailable", retryable: true });
      await scheduleNext({ last_status: "source_unavailable" });
      return "source_unavailable";
    }

    // 2) SNAPSHOT (per-source + overall).
    const snapshot = { news: buildNewsSnapshot(items.filter((i) => i.source_type === "news")), sources_ok: okSources, sources_failed: failSources } as Record<string, unknown>;
    const curKeys = items.map((i) => i.dedup_key as string);

    // 3) BASELINE — previous run's snapshot, or the accumulated window of evidence.
    const { data: prevRun } = await db.from("monitor_runs")
      .select("id,snapshot").eq("monitor_id", monId).not("snapshot", "is", null).neq("id", runId)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    const isFirstRun = !prevRun;
    const baselineSnap = (prevRun?.snapshot?.news) || null;
    let baselineKeys: string[] = baselineSnap?.keys || [];
    if (String(comparison.mode || "previous_run") === "baseline_window") {
      const windowDays = Number(comparison.window_days) || 30;
      const winStart = new Date(nowMs - windowDays * 86400000).toISOString();
      const { data: evrows } = await db.from("monitor_evidence").select("dedup_key").eq("monitor_id", monId).neq("run_id", runId).gte("fetched_at", winStart);
      baselineKeys = Array.from(new Set((evrows || []).map((r: { dedup_key: string }) => r.dedup_key)));
    }

    // 4) MECHANICAL DIFF + change score (CODE decides "changed?", not the AI).
    const diff = diffKeys(curKeys, baselineKeys);
    const newItems = items.filter((i) => diff.new.includes(i.dedup_key as string));
    const clusters = clusterPoints(newItems.map((i) => ({ lng: i.lng as number, lat: i.lat as number })), 60);
    const newClusters = clusters.length;
    const corroboratedClusters = clusters.filter((members) => {
      const pubs = new Set(members.map((idx) => String((newItems[idx].source_name as string) || "").toLowerCase()).filter(Boolean));
      return pubs.size >= 2;
    }).length;
    const changeScore = computeChangeScore({ diff, current: snapshot.news as never, baseline: baselineSnap, newClusters, corroboratedClusters });
    const diffOut = { new: diff.new.length, gone: diff.gone.length, continuing: diff.continuing.length, new_clusters: newClusters, corroborated_clusters: corroboratedClusters, prev_count: baselineSnap?.count || 0, cur_count: (snapshot.news as { count: number }).count };

    // 5) Persist evidence with per-run ev_key ids (ev_1…). Tag change_kind.
    const evRows = items.slice(0, MAX_EVIDENCE).map((it, i) => ({
      run_id: runId, monitor_id: monId, user_id: userId, ev_key: "ev_" + (i + 1),
      source_type: it.source_type, source_name: it.source_name, source_url: it.source_url, external_id: it.external_id,
      title: it.title, observed_at: it.observed_at, fetched_at: nowISO, lng: it.lng, lat: it.lat,
      payload: it.payload, dedup_key: it.dedup_key,
      change_kind: diff.new.includes(it.dedup_key as string) ? "new" : (diff.continuing.includes(it.dedup_key as string) ? "continuing" : null),
    }));
    if (evRows.length) await db.from("monitor_evidence").insert(evRows);
    // Map dedup_key → ev_key and → coords/label (for evidence-id validation + change points).
    const keyToEv = new Map(evRows.map((e) => [e.dedup_key, e.ev_key]));
    const validKeys = new Set(evRows.map((e) => e.ev_key));
    const evByKey = new Map(evRows.map((e) => [e.ev_key, { lng: e.lng as number, lat: e.lat as number, label: (e.title as string) || "" }]));

    const partial = failSources.length > 0;
    const mechGaps = failSources.map((s) => `The ${s} source was unavailable this run.`);
    const baseStatus = partial ? "partial" : "success";

    // 6) DECIDE whether to call the AI. Only a real, code-detected change qualifies.
    const decision = decideAI({ isFirstRun, hasData: items.length > 0, newCount: diff.new.length, changeScore, sensitivity: sensitivity as never });

    if (!aiCfg && decision.call) decision.call = false, decision.skip = "not_configured";

    if (!decision.call) {
      // No report. Record a run-only outcome honestly. success_no_change unless the
      // run also had a partial source failure (then keep the partial signal).
      const status = partial ? "partial" : "success_no_change";
      await finalizeRun({
        status, sources_ok: okSources, sources_failed: failSources, snapshot, diff: diffOut, change_score: changeScore,
        report_generated: false, ai_used: false, ai_skip_reason: decision.skip, evidence_count: evRows.length,
      });
      await scheduleNext({ last_status: status, last_change_severity: "none" });
      await prune(db, monId);
      return status;
    }

    // 7) CALL AI — build the evidence + change summary message (NEW items only).
    const aiEvidence = newItems.slice(0, MAX_AI_EVIDENCE).map((it) => ({
      id: keyToEv.get(it.dedup_key as string), source: it.source_name, title: it.title,
      url: it.source_url, date: it.observed_at, place: (it.payload as { subject?: string })?.subject || null,
      lng: it.lng, lat: it.lat,
    }));
    const userMsg =
      "AREA: " + String(monitor.area_label || monitor.name || "the monitored area") + "\n" +
      "CHANGE SUMMARY (authoritative): " + JSON.stringify(diffOut) + "\n" +
      "EVIDENCE (new items in the area; cite ids exactly):\n" + JSON.stringify(aiEvidence);

    let aiText = "", aiOk = false, aiErr = "";
    try { aiText = await callAI(aiCfg!, userMsg); aiOk = !!aiText; }
    catch (e) { aiErr = String((e as Error)?.message || e).slice(0, 160); }

    const parsed = aiOk ? parseJson(aiText) : null;
    const valid = parsed ? validateAndCleanReport(parsed, validKeys, evByKey) : { ok: false, cleaned: null, invalidRefs: [] };

    if (!valid.ok || !valid.cleaned) {
      // AI attempted but failed/hallucinated → ai_failed, but KEEP snapshot+diff+evidence.
      await finalizeRun({
        status: "ai_failed", sources_ok: okSources, sources_failed: failSources, snapshot, diff: diffOut, change_score: changeScore,
        report_generated: false, ai_used: true, ai_provider: aiCfg!.provider, ai_model: aiCfg!.model,
        error_category: "ai_failed", error_detail: (aiErr || "AI output had no evidence-grounded claim").slice(0, 200), retryable: true, evidence_count: evRows.length,
      });
      await scheduleNext({ last_status: "ai_failed" });
      await prune(db, monId);
      return "ai_failed";
    }

    // 8) Build + persist the validated report. Merge mechanical gaps/limitations.
    const cleaned = valid.cleaned;
    const severity = cleaned.severity || severityFromScore(changeScore);
    const dataGaps = Array.from(new Set([...(cleaned.data_gaps || []), ...mechGaps]));
    const limitations = Array.from(new Set([...(cleaned.limitations || []), "Locations represent the reported subject of each article, not a confirmed on-the-ground position."]));
    const metrics = { articles: { prev: baselineSnap?.count || 0, cur: (snapshot.news as { count: number }).count, delta: (snapshot.news as { count: number }).count - (baselineSnap?.count || 0) }, new_items: diff.new.length, new_clusters: newClusters, publishers: { prev: baselineSnap?.publishers || 0, cur: (snapshot.news as { publishers: number }).publishers } };

    const { data: repIns } = await db.from("monitor_reports").insert({
      monitor_id: monId, run_id: runId, user_id: userId, severity,
      headline: cleaned.headline, summary: cleaned.summary,
      changes: cleaned.changes, unchanged: cleaned.unchanged, data_gaps: dataGaps, limitations,
      metrics, change_points: cleaned.change_points,
      ai_provider: aiCfg!.provider, ai_model: aiCfg!.model, prompt_version: PROMPT_VERSION,
    }).select("id").single();
    const reportId = repIns?.id;

    await finalizeRun({
      status: baseStatus, sources_ok: okSources, sources_failed: failSources, snapshot, diff: diffOut, change_score: changeScore,
      report_generated: true, report_id: reportId, ai_used: true, ai_provider: aiCfg!.provider, ai_model: aiCfg!.model,
      ai_skip_reason: null, evidence_count: evRows.length,
    });
    await scheduleNext({ last_status: baseStatus, last_change_severity: severity, last_report_id: reportId });
    await prune(db, monId);
    return baseStatus + "+report";
  } catch (e) {
    await finalizeRun({ status: "internal_error", error_category: "internal_error", error_detail: String((e as Error)?.message || e).slice(0, 200), retryable: true });
    // Always release the lock + reschedule so a crash never wedges a monitor.
    try { await scheduleNext({ last_status: "internal_error" }); } catch (_) { await db.from("area_monitors").update({ running_since: null }).eq("id", monId); }
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

  // ── MODE 2: USER "run now" (JWT + {monitorId}). Verify ownership + cooldown.
  if (!authHeader) return json({ error: "unauthorized", message: "Send x-monitor-secret (cron) or a user JWT + monitorId." }, 401);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "auth", message: "Login required." }, 401);
  const monitorId = String(payload.monitorId || "");
  if (!monitorId) return json({ error: "bad_request", message: "monitorId required." }, 400);

  const { data: monitor } = await db.from("area_monitors").select("*").eq("id", monitorId).maybeSingle();
  if (!monitor || monitor.user_id !== user.id) return json({ error: "not_found" }, 404);   // don't leak existence
  if (monitor.running_since && (nowMs - new Date(monitor.running_since).getTime()) < 15 * 60_000) return json({ error: "already_running" }, 409);

  // Manual cooldown — the newest run must be older than MANUAL_COOLDOWN_MS.
  const { data: lastRun } = await db.from("monitor_runs").select("started_at").eq("monitor_id", monitorId).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (lastRun && (nowMs - new Date(lastRun.started_at).getTime()) < MANUAL_COOLDOWN_MS) return json({ error: "cooldown", message: "Please wait a moment before running again." }, 429);

  // Claim (lock) then process just this one.
  await db.from("area_monitors").update({ running_since: new Date(nowMs).toISOString() }).eq("id", monitorId);
  const status = await processMonitor(db, monitor, aiCfg, "manual", Date.now());
  return json({ ok: true, mode: "manual", monitorId, status });
 } catch (topErr) {
  try { console.error("monitor-run UNCAUGHT", String((topErr as Error)?.message || topErr).slice(0, 200)); } catch (_) { /* */ }
  return json({ error: "internal_error", message: "monitor-run hit an unexpected error." }, 500);
 }
});
