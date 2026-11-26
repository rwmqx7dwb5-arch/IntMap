// ============================================================================
//  IntMap · atlas-jobs  —  Supabase Edge Function (Deno)
// ----------------------------------------------------------------------------
//  Durable Atlas jobs: long research that keeps running after the tab is closed (atlas-durable-jobs).
//  docs/architecture/05-ai.md «永続ジョブ». Tables and the state machine: supabase/migrations/20261123130000_atlas_durable_jobs.sql.
//
//    op "create"  (a signed-in reader)  { idem, title?, tasks:[contract] } → { jobId, created, status }
//         plans the contracts (js/atlas-job-core.js planJob, the rules research.delegate applies), creates the job
//         idempotently on (reader, idem), charges ONE of the reader's daily AI uses when it was newly created (a refused
//         creation charges nothing and ends the job it made), and starts the first lease in the background.
//    op "tick"    (the shared secret)   takes one job whose lease lapsed (or that nobody started) and runs it. Called by
//         pg_cron every minute while such a job exists, and by this function itself to continue after a time slice.
//    A reader cancels / amends a running job with the RPCs atlas_job_cancel / atlas_job_amend and reads it with a
//    select — RLS gives them their own rows — so those need no route here.
//
//  THE FENCES (a job is paid by the server's key, with nobody at the keyboard):
//    · ONE JOB's cost: reserved before each provider request, settled after (public.atlas_job_reserve/settle) against
//      atlas_jobs_control.job_cost_cap_micros ($1).
//    · the reader's concurrency (2) and the project's (20): how many jobs RUN at once — checked in atlas_job_claim; a job past them WAITS (queued), it is not refused.
//    · the project-wide DAILY request ceiling: spendCeiling below, taken inside providerFetch for every request.
//    · THE STOP SWITCH: atlas_jobs_control.enabled = false (or the secret ATLAS_JOBS=off) — no creation, no claim, and a
//      running job ends cancelled (kill_switch) at its next checkpoint, before its next provider request.
//
//  Deploy:   supabase functions deploy atlas-jobs --no-verify-jwt --use-api --project-ref vpekfwdpurzejrrmacac
//  Secrets:  ATLAS_JOBS_SECRET=<random>   (REQUIRED for tick — fail-closed; create works without it but cannot continue after a slice)
//            ATLAS_JOBS=off               (optional stop switch, beside the table's)
//            ATLAS_JOBS_GLOBAL_PER_DAY=<n>  (optional — moves the project-wide request ceiling below)
//            AI_PROVIDER / AI_MODEL / ATLAS_DELEGATION_MODEL / OPENAI_API_KEY  (the same as ai-proxy; only openai is run here)
//  pg_cron: 20261123130000_atlas_durable_jobs.sql schedules the tick; its secret is vault `atlas_jobs_secret` (= ATLAS_JOBS_SECRET).
// ============================================================================

import { createClient } from "@supabase/supabase-js";   // pinned in this function's deno.json
import { secretKey, publishableKey, denoEnv } from "../_shared/supabase-keys.js";
import { personaPrompt } from "../_shared/atlas-persona.js";
import { workerSystem, planJob } from "../_shared/atlas-job-core.js";
import { runJob } from "../_shared/atlas-job-runner.js";
import { makeServerCaps } from "../_shared/atlas-server-caps.js";
import { makeHeadlessGis } from "../_shared/gis-headless.js";
import { loadGis } from "../_shared/gis-loader.js";
import { fetchGeoJson } from "../_shared/gis-input-fetch.js";
import { capClass } from "../_shared/atlas-cap-classes.js";
import { accountFor, openTurn, LedgerUnavailable } from "../_shared/ai-ledger.js";
import {
  OPENAI_DEFAULT_MODEL, FALLBACK_CHAIN, priceOf, outputCeilingOf, costMicros, providerFetch, spendCeiling,
  providerBudgetMs, EDGE_WALL_CLOCK_MS, EDGE_SETTLE_MARGIN_MS,
} from "../_shared/ai-provider.js";
import { quotaClass, retryAfterHeader } from "../_shared/ai-quota-class.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-atlas-jobs-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (k: string) => Deno.env.get(k) || "";

/* THE PROJECT-WIDE DAILY REQUEST CEILING of this function.
   Observation 2026-11-20: ai-proxy's own ceiling is 3000 requests/day (config.ts GLOBAL_PER_DAY) for every reader's
   every call; a default job is 2 tasks x up to 2 attempts, so 600 requests/day is ~150 jobs — a fifth of what readers'
   own turns may use, and far above the handful of jobs the 2-per-reader / 20-at-once fence lets run.
   Expires when jobs become a main use of Atlas — then ATLAS_JOBS_GLOBAL_PER_DAY moves it without a deploy. Canonical: this constant. */
const GLOBAL_PER_DAY = 600;
const CEILING = spendCeiling({ fn: "atlas-jobs", perDay: GLOBAL_PER_DAY, env });

/* How long one invocation starts new work for, and how long a lease lasts.
   (atlas-jobs-reliability) A worker request is not bound by a number of ours: this invocation answered its caller (202) before it began
   the work, so the clock it answers to is the platform's whole wall clock (EDGE_WALL_CLOCK_MS, _shared/ai-provider.js — the one place
   it lives), the same window ai-proxy gives a streamed worker. Measured on production 2026-11-25 (dev-notes/2026-11-25-atlas-delegation-efficiency.md):
   a worker that searches runs ~110 s, and 5 of 6 workers were cut at the 100 s this file used to impose and fell back to «answered from memory».
   30 s of starting new tasks leaves the rest of the window for the longest of them. A lease is renewed by the runner every LEASE_S/3 while
   a request is in flight (atlas-job-runner.js keepLease), so it stays short — a runner that dies is taken over after 150 s, not after the
   whole window. Expires with the platform's wall-clock limit. */
const SLICE_MS = 30_000;
const LEASE_S = 150;

const MODEL_ID_OK = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,79}$/;
/* output allowance of one worker request: atlas_delegate's maxOutput is 3000 (ai-proxy tasks/atlas_delegate.ts); reasoning
   tokens count against max_output_tokens, so the request leaves room for the same again. */
const MAX_OUTPUT_TOKENS = 6000;
/* A task's own `maxOutput` (js/atlas-job-core.js) raises the visible budget the way the page's worker does (ai-proxy spec.ts hintedMaxOutput): never below atlas_delegate's 3000,
   up to the model's documented ceiling (outputCeilingOf; none cited → no raise). The request keeps room for the same again for reasoning, itself capped at that ceiling. */
function outputTokens(maxOutput: unknown, model: string): number {
  const ceil = outputCeilingOf(model);
  const h = Math.floor(Number(maxOutput));
  if (!Number.isFinite(h) || h <= 0) return MAX_OUTPUT_TOKENS;
  const visible = ceil ? Math.max(3000, Math.min(h, ceil)) : 3000;
  const total = Math.max(MAX_OUTPUT_TOKENS, visible * 2);
  return ceil ? Math.min(total, ceil) : total;
}
/* what a hosted web search reads into the prompt, for the ESTIMATE only (the settle uses what the provider billed).
   Observation: ai_turns p99 input of a web turn is 345,819 tokens (config.ts TURN_COST_CAP_USD); a worker's search is a share of that. Expires with that table's numbers. */
const WEB_READ_TOKENS = 50_000;
/* What one image adds to a request's INPUT, for the ESTIMATE only (the settle uses what the provider billed). Observation: OpenAI's vision guide prices a
   high-detail 1024x1024 image at 765 tokens and larger ones tile up from there; 1,500 is the estimate for an image of the sizes a reader attaches or a map frame is.
   Expires with the provider's image pricing. */
const IMAGE_READ_TOKENS = 1_500;
/* The images a job may carry, stated as ai-proxy states them for a turn (ai-proxy/config.ts MAX_IMAGES / MAX_IMAGES_BYTES) — held EQUAL by
   tests/atlas-jobs-reliability-checks.test.mjs, so a change there is noticed here. A job past them is refused by name (images_too_large), never trimmed. */
const MAX_IMAGES_PER_TASK = 4;
const MAX_IMAGES_BYTES = 12 * 1024 * 1024;
const IMAGE_URL_OK = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

function modelFor(): string {
  const pick = [env("ATLAS_DELEGATION_MODEL"), env("AI_MODEL")].map((m) => m.trim()).find((m) => m && MODEL_ID_OK.test(m) && priceOf(m).known);
  return pick || OPENAI_DEFAULT_MODEL;
}

const money = {
  estimate(chars: number, web: boolean, maxOutput?: number, images = 0) {
    const p = priceOf(modelFor());
    const inTok = Math.ceil(chars / 3) + (web ? WEB_READ_TOKENS : 0) + Math.max(0, Math.floor(images)) * IMAGE_READ_TOKENS;
    return Math.ceil(inTok * p.input + outputTokens(maxOutput, modelFor()) * p.output);
  },
  actual(usage: unknown, model: string) { return costMicros(model || modelFor(), usage, "openai"); },
};

class ModelError extends Error {
  code: string; status: number; timeout: boolean; retryAfterSeconds?: number;
  constructor(code: string, message: string, status = 0, timeout = false, retryAfterSeconds?: number) { super(message); this.code = code; this.status = status; this.timeout = timeout; this.retryAfterSeconds = retryAfterSeconds; }
}

/* A non-2xx answer's body is read ONLY to classify it (_shared/ai-quota-class.js — the taxonomy ai-proxy uses) and then dropped: the
   verdict is kept, never the body. Bounded: a 4 KB prefix is what the classifier needs. */
async function classifyFailure(res: Response): Promise<{ len: number; verdict: ReturnType<typeof quotaClass> }> {
  let text = "";
  try { text = await res.text(); } catch (_) { text = ""; }
  return { len: text.length, verdict: quotaClass(res.status, text.slice(0, 4096)) };
}

/* One worker request to the provider. OpenAI Responses only — the provider this project runs (AI_PROVIDER=openai); another
   provider fails the task `provider_unsupported` by name rather than running unmetered. A 403/404 model_not_found walks
   FALLBACK_CHAIN one step each, as ai-proxy does. */
async function callModel(system: string, prompt: string, o: { web: boolean; signal?: AbortSignal; maxOutput?: number; startedAt?: number; images?: string[] }) {
  if ((env("AI_PROVIDER") || "openai").toLowerCase() !== "openai") throw new ModelError("provider_unsupported", "Durable jobs run on the OpenAI provider only.");
  const key = env("OPENAI_API_KEY");
  if (!key) throw new ModelError("provider_unavailable", "The AI provider is not configured.", 503);
  const chain = [modelFor(), ...FALLBACK_CHAIN.filter((m) => m !== modelFor())];
  for (let i = 0; i < chain.length; i++) {
    let res: Response;
    try {
      res = await providerFetch("https://api.openai.com/v1/responses", {
        method: "POST", signal: o.signal,
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: chain[i], instructions: system,
          input: [{ role: "user", content: [{ type: "input_text", text: prompt }, ...(o.images || []).map((u) => ({ type: "input_image", image_url: u }))] }],
          max_output_tokens: outputTokens(o.maxOutput, chain[i]), reasoning: { effort: "medium" }, store: false,
          ...(o.web ? { tools: [{ type: "web_search" }] } : { text: { format: { type: "json_object" } } }),
        }),
      }, { ceiling: CEILING, timeoutMs: providerBudgetMs(true, o.startedAt, Date.now()) });   /* what is left of THIS invocation's window; a retry or a fallback step takes from the same budget */
    } catch (e) {
      const c = String((e as { code?: string })?.code || "");
      if (c === "spend_ceiling" || c === "share_ceiling") throw new ModelError("spend_ceiling", "The project-wide daily AI ceiling was reached.", 503);
      if (c === "timeout") throw new ModelError("provider_unavailable", "The AI provider timed out.", 503, true);
      throw new ModelError("provider_unavailable", "Could not reach the AI provider.", 503);
    }
    if (!res.ok) {
      const { len, verdict } = await classifyFailure(res);   // the provider's body is never kept: a verdict and a length
      if ((res.status === 403 || res.status === 404) && i + 1 < chain.length) continue;
      /* (atlas-jobs-reliability) a per-MINUTE rate limit is not a quota: the runner waits it out and asks again; billing / spend limit / per-day, and 402, end the task refused */
      if (verdict && verdict.kind === "rate") throw new ModelError("provider_rate_limit", `The AI provider is rate-limiting requests (${res.status}, ${len} bytes).`, res.status, false, verdict.retryAfterSeconds ?? retryAfterHeader(res.headers));
      if (res.status === 429 || res.status === 402 || (verdict && verdict.kind === "quota")) throw new ModelError("provider_quota", `The AI provider refused (${res.status}, ${len} bytes).`, res.status);
      throw new ModelError("provider_unavailable", `The AI provider answered ${res.status} (${len} bytes).`, res.status);
    }
    const j = await res.json();
    const out: Array<Record<string, unknown>> = Array.isArray(j?.output) ? j.output : [];
    const parts = out.filter((it) => it?.type === "message").flatMap((it) => (Array.isArray(it.content) ? it.content as Array<Record<string, unknown>> : []))
      .filter((p) => p?.type === "output_text" && typeof p.text === "string");
    const text = (typeof j?.output_text === "string" && j.output_text) || parts.map((p) => String(p.text)).join("");
    const citations: Array<{ url: string; title: string }> = [];
    for (const p of parts) for (const an of (Array.isArray(p.annotations) ? p.annotations as Array<Record<string, unknown>> : [])) {
      if (an?.type === "url_citation" && typeof an.url === "string" && an.url) citations.push({ url: an.url, title: String(an.title || "") });
    }
    const u = j?.usage || {};
    return {
      text, citations, model: chain[i],
      usage: (() => { const whole = Number(u.input_tokens) || 0, cached = Math.min(whole, Number(u?.input_tokens_details?.cached_tokens) || 0); return { input: whole - cached, cached_read: cached, output: Number(u.output_tokens) || 0 }; })(),   /* costMicros reads `input` as the uncached remainder */
    };
  }
  throw new ModelError("provider_unavailable", "No model of the chain answered.", 503);
}

// deno-lint-ignore no-explicit-any
function adminClient(): any { return createClient(env("SUPABASE_URL"), secretKey(denoEnv), { auth: { persistSession: false } }); }

/* claim one job and run a slice of it; when work is left, continue with another invocation of this function */
async function runSlice(jobId: string | null): Promise<string> {
  if (env("ATLAS_JOBS").toLowerCase() === "off") return "off";
  const db = adminClient();
  const holder = "edge:" + crypto.randomUUID().slice(0, 12);
  const { data, error } = await db.rpc("atlas_job_claim", { p_holder: holder, p_lease_seconds: LEASE_S, p_job: jobId });
  if (error) { console.error("atlas-jobs claim failed", String(error.message || "").slice(0, 160)); return "claim_failed"; }
  const job = Array.isArray(data) ? data[0] : data;
  if (!job) return "none";
  let outcome = "error";
  try {
    const r = await runJob({
      db, job, holder, callModel, money, capabilities: makeServerCaps({ db, gis: makeHeadlessGis({ loadGis, now: () => Date.now() }), fetchGeoJson }), now: () => Date.now(), budgetMs: SLICE_MS, leaseSeconds: LEASE_S,
      heartbeatMs: Math.floor(LEASE_S * 1000 / 3), hardMs: EDGE_WALL_CLOCK_MS - EDGE_SETTLE_MARGIN_MS,
      system: workerSystem(personaPrompt("working here as a research worker: you have been handed ONE piece of a larger request, and the Atlas talking to the reader will integrate your findings with those of other workers", { mode: "internal" })),
    });
    outcome = r.outcome;
  } catch (e) {
    console.error("atlas-jobs run failed", String((e as Error)?.message || e).slice(0, 200));
    try { await db.rpc("atlas_job_release", { p_job: job.id, p_holder: holder }); } catch (_) { /* the lease lapses */ }
  }
  if (outcome === "more") await chain();
  /* (atlas-jobs-reliability) a job that ended leaves a place: a job that waited for one (the fences are checked at the claim, not at the door) starts now rather than at the next minute's tick */
  else if (outcome === "finished") {
    try { const { data } = await db.rpc("atlas_jobs_waiting"); if (Number(data) > 0) await chain(); } catch (_) { /* the tick finds it */ }
  }
  return outcome;
}

/* the next slice, as a request of its own (a fresh wall-clock budget) — fire and forget */
async function chain() {
  const secret = env("ATLAS_JOBS_SECRET");
  if (!secret) return;   // no secret, no chain: the cron tick (which needs the same secret) is what continues it
  try {
    await fetch(env("SUPABASE_URL") + "/functions/v1/atlas-jobs", {
      method: "POST", headers: { "Content-Type": "application/json", "x-atlas-jobs-secret": secret }, body: JSON.stringify({ op: "tick" }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => {});
  } catch (_) { /* the cron tick continues it */ }
}

// deno-lint-ignore no-explicit-any
const waitUntil = (p: Promise<unknown>) => { try { (globalThis as any).EdgeRuntime?.waitUntil?.(p); } catch (_) { /* nothing to hold it */ } return p; };

async function create(req: Request, body: Record<string, unknown>): Promise<Response> {
  const url = env("SUPABASE_URL");
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(url, publishableKey(denoEnv), { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: ud } = await userClient.auth.getUser();
  const user = ud?.user;
  if (!user) return json({ error: "auth", message: "Login required." }, 401);
  if (env("ATLAS_JOBS").toLowerCase() === "off") return json({ error: "disabled" }, 503);

  const idem = String(body.idem || "").trim();
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(idem)) return json({ error: "bad_request", message: "idem is required (1-120 of A-Z a-z 0-9 . _ : -)." }, 400);
  const caps = makeServerCaps();
  const plan = planJob(body.tasks as unknown[], { kinds: ["worker", "capability"], maxOutput: true, images: true, capabilityOk: (id: string) => caps.has(id), parkable: (id: string) => capClass(id) === "parkable" });
  // a refusal for a capability with no twin says what DOES have one (discovered from the lane, not written here)
  if (!plan.ok) return json({ error: "bad_plan", code: plan.error, at: plan.at, ...(plan.error === "capability_unsupported_on_server" ? { available: caps.catalogue() } : {}) }, 400);

  /* (atlas-jobs-reliability) THE IMAGES A WORKER TASK NAMES arrive with the job, resolved by the page ({ name: [data URL] }); a name with no image, a thing that is
     not an image, or more than a job may carry is refused by name BEFORE the job exists — never dropped, never trimmed. */
  const sent = (body.images && typeof body.images === "object" && !Array.isArray(body.images)) ? body.images as Record<string, unknown> : {};
  let bytes = 0;
  const seenUrls = new Set<string>();
  const taskImages = new Map<string, Array<{ name: string; urls: string[] }>>();
  for (const t of plan.tasks as Array<{ id: string; contract: { kind?: string; images?: string[] } }>) {
    const names = t.contract.kind === "worker" ? (t.contract.images || []) : [];
    if (!names.length) continue;
    const got: Array<{ name: string; urls: string[] }> = [];
    let n = 0;
    for (const name of names) {
      const urls = Array.isArray(sent[name]) ? (sent[name] as unknown[]) : [];
      if (!urls.length) return json({ error: "bad_plan", code: "images_missing", at: t.id, name }, 400);
      for (const u of urls) {
        if (typeof u !== "string" || !IMAGE_URL_OK.test(u)) return json({ error: "bad_plan", code: "images_invalid", at: t.id, name }, 400);
        if (!seenUrls.has(u)) { seenUrls.add(u); bytes += u.length; }
        n += 1;
      }
      got.push({ name, urls: urls as string[] });
    }
    if (n > MAX_IMAGES_PER_TASK || bytes > MAX_IMAGES_BYTES) return json({ error: "bad_plan", code: "images_too_large", at: t.id }, 400);
    taskImages.set(t.id, got);
  }

  const db = adminClient();
  const { data, error } = await db.rpc("atlas_job_create", {
    p_user: user.id, p_idem: idem, p_title: String(body.title || "").slice(0, 200),
    p_tasks: plan.tasks.map((t: { id: string; key: string; contract: unknown; deps: string[] }) => ({ id: t.id, key: t.key, contract: t.contract, deps: t.deps, images: taskImages.get(t.id) || null })),
  });
  if (error) return json({ error: "unavailable" }, 503);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.job_id) {
    const reason = String(row?.reason || "unavailable");
    return json({ error: reason }, reason === "disabled" ? 503 : 400);
  }
  if (!row.created) return json({ jobId: row.job_id, created: false, status: row.status });   // the same key again: the same job, nothing charged, nothing started twice

  // A new job costs one of the reader's daily uses, like a turn; a refusal ends the job it just made, before anything ran.
  const account = await accountFor(db, user.id, env);
  const reject = async (code: string, status: number, extra: Record<string, unknown> = {}) => {
    await db.from("atlas_jobs").update({ status: "cancelled", stop_reason: code, ended_at: new Date().toISOString() }).eq("id", row.job_id);
    await db.from("atlas_job_tasks").update({ status: "cancelled" }).eq("job_id", row.job_id);
    return json({ error: code, ...extra }, status);
  };
  try {
    const t = await openTurn(db, account, { turn: "job:" + row.job_id, maxCalls: 1, ttlSeconds: 900 });
    if (!t.allowed) return await reject("limit", 429, { used: t.used });
  } catch (e) {
    if (e instanceof LedgerUnavailable) return await reject("quota_unavailable", 503);
    throw e;
  }
  waitUntil(runSlice(row.job_id));
  return json({ jobId: row.job_id, created: true, status: "queued" }, 202);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch (_) { body = {}; }
    const op = String(body.op || "");
    if (op === "create") return await create(req, body);
    if (op === "tick") {
      const secret = env("ATLAS_JOBS_SECRET");
      if (!secret) return json({ error: "not_configured" }, 503);
      const got = req.headers.get("x-atlas-jobs-secret") || "";
      if (!got || !timingSafeEqual(got, secret)) return json({ error: "unauthorized" }, 401);
      waitUntil(runSlice(null));
      return json({ ok: true }, 202);
    }
    return json({ error: "bad_op" }, 400);
  } catch (e) {
    console.error("atlas-jobs UNCAUGHT", String((e as Error)?.message || e).slice(0, 300));
    return json({ error: "unavailable", message: "Please try again." }, 500);
  }
});
