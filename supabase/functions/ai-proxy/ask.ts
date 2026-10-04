// ============================================================================
//  IntMap · ai-proxy · ask — one POST, from the reader's JWT to the answer
// ----------------------------------------------------------------------------
//  (atlas-core-split) The body of index.ts's Deno.serve, moved unchanged: the steps 1–6 that
//  index.ts's header describes, in that order. What differs by TASK is no longer written here as
//  `task === "…"` — it is read from the task's own record (`spec`, tasks/<task>.ts).
// ============================================================================

import { createClient } from "@supabase/supabase-js";   // pinned in this function's deno.json
/* (#R801) The bounded reader and the bounded fetch every keyless relay already uses. The request
   body and the provider's answer are read through them so a byte ceiling and a deadline hold WHILE
   the bytes arrive, not after they have all been buffered. */
import { readCapped, RelayError } from "../_shared/relay-guard.js";
/* (ai-one-ledger) The plan table, the account and the turn ledger's doors (written to be shared by
   every caller that charges the same allowance), and what a provider answer cost (one shape for three providers,
   plus the Anthropic prompt-cache breakpoints). */
import { accountFor, openTurn, refundTurn, settleTurn, recordUsage, LedgerUnavailable, cohortOf, NEWCOMER } from "../_shared/ai-ledger.js";
import { usageMeter } from "../_shared/ai-usage.js";
/* (atlas-live-stream) The provider's server-sent events, read twice: as previews for the reader while
   they arrive, and folded back into the body the parsers below already read. */
import { previewSink, sseEncode, HEARTBEAT_MS } from "../_shared/ai-stream.js";
/* (edge-spend-and-models) The model table, the provider-answer ceilings and the one door to a paid
   provider are shared with every other function that holds a provider key — see that file's header
   for what was found when each of them lived here and in four other places. */
import { OPENAI_DEFAULT_MODEL, FALLBACK_CHAIN, PROVIDER_DEFAULT_MODEL } from "../_shared/ai-provider.js";
/* (atlas-quality-lab) the independent grader's shape, budget and provider rule — shared with
   scripts/atlas-eval/grade.mjs, which reads the grade back against the same criteria */
import { graderProviderFor } from "../_shared/atlas-grade-schema.js";
import {
  cors, json, GLOSS_PLAN_LIMITS, GLOSS_LANE, MAX_GLOSS_PROMPT, TURN_MAX_CALLS, TURN_TTL_S, MAX_TURN_KEY, REPLAY_KEY_OK,
  CEILING, NEWCOMER_CEILING, PROVIDERS, MODEL_ID_OK, MAX_PROMPT, MAX_SYSTEM, MAX_IMAGES, MAX_BODY_BYTES, MAX_IMAGES_BYTES,
  MAX_FILES, MAX_FILE_TEXT, MAX_FILES_TEXT, MAX_DOCS, MAX_DOC_BYTES, MAX_DOCS_BYTES, DOC_MIME,
} from "./config.ts";
import { normalizeTurn, cacheBasis, sha256Hex } from "./turn.ts";
import type { TurnReq, TurnItem } from "./turn.ts";
import { schemaOk, openAiSchemaFormat } from "./schema.ts";
import { TASKS, maxOutputFor, HARD_MAX_OUTPUT } from "./tasks/index.ts";
import { parseDataUrl, b64Bytes } from "./media.ts";
import type { ImgPart, FilePart, DocPart, WebCitation } from "./media.ts";
import { ProviderError } from "./provider-call.ts";
import type { Meter, StreamSink } from "./provider-call.ts";
import { callOpenAI } from "./providers/openai.ts";
import { callGemini, callGeminiRetry, callGeminiTurn, geminiRetry } from "./providers/gemini.ts";
import { callAnthropic, callAnthropicTurn } from "./providers/anthropic.ts";
import { listModels } from "./models.ts";
import { awaitAnswer, claimAnswer, beatAnswer, finishAnswer, replayed } from "./replay.ts";

export async function ask(req: Request): Promise<Response> {

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) Identify the user from their JWT. Login is required.
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "auth", message: "Login required." }, 401);

  // Service-role client for the quota table + plan lookup.
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 2) Plan → limit. (ai-one-ledger) Resolved by _shared/ai-ledger.js accountFor — profiles.plan, then
  //    the developer override below — so any other caller of the ledger resolves the SAME account the same way.
  /* (#R31/#R32) Developer override → UNLIMITED AI, quota never consumed ("AI機能の使用は無制限に").
     ⚠ IT IS A USER ID NOW, AND THE ID LIVES IN A SECRET RATHER THAN IN THIS FILE. The rule used to be
     a hard-coded e-mail address compiled into a PUBLIC repository, which is three separate problems:
       · it publishes the maintainer's address to anyone who reads the source;
       · it makes the privilege depend on `auth.users.email`, a field that a provider can change
         (an Apple private-relay address is re-issued when the user turns off «Hide My Email») and
         that several identity providers let the account holder edit;
       · and it is unrevocable without a redeploy.
     The identity is the immutable `auth.users.id`, supplied through the DEV_USER_IDS secret
     (`supabase secrets set DEV_USER_IDS=<uuid>`), so the RIGHTS are unchanged — the same account is
     still exempt from consumption and still resolves to plan "unlimited" — while the address is gone
     from the tree and the grant can be moved or withdrawn without touching code. `profiles.plan`
     carries the same grant in the database, so the two agree even if the secret is ever unset.
     (ai-one-ledger) The rule itself is _shared/ai-ledger.js devUserIds now — unchanged, moved. */
  const account = await accountFor(db, user.id, (k: string) => Deno.env.get(k) || "");
  const isDev = account.isDev;
  const plan = account.plan;
  const limit = account.limit;

  /* (#R318) The turn key travels in a HEADER, not in the JSON body, because the body has not been
     read yet at this point and must not be: consumption happens before parsing precisely so an
     unbounded body cannot be parsed by an over-quota caller (the comment above MAX_BODY_BYTES).
     It is a client-supplied string and is treated as one — see the migration's header for the
     three things that make it safe to accept. */
  const turnId = String(req.headers.get("x-intmap-turn") || "").slice(0, MAX_TURN_KEY);
  /* (#R491) ...and the LANE, read here for the same reason: the body is not available yet. */
  const lane = String(req.headers.get("x-intmap-lane") || "").toLowerCase().slice(0, 16);
  const isGloss = lane === GLOSS_LANE;
  const glossLimit = GLOSS_PLAN_LIMITS[plan] ?? GLOSS_PLAN_LIMITS.free;
  /* (atlas-stream-replay) …and a RETRY's replay key, read here for the same reason, and acted on
     BEFORE the allowance: a retry whose answer is already held receives it without consume_ai_turn,
     so it neither charges nor spends one of TURN_MAX_CALLS. A first request still running is waited
     for (awaitAnswer reads the row; it never runs the request). Anything else — an observed failure,
     a run whose isolate stopped beating, nothing registered — falls through to the ordinary path
     below, which claims the key and runs (claim_ai_answer counts the attempt). */
  const replayHdr = String(req.headers.get("x-intmap-replay") || "").slice(0, MAX_TURN_KEY);
  if (replayHdr && REPLAY_KEY_OK.test(replayHdr) && turnId && !isGloss) {
    const held = await awaitAnswer(db, user.id, turnId, replayHdr);
    if (held && held.state === "done" && held.body) {
      const a = replayed(held.status, held.body, held.attempts);
      return json(a.body, a.status);
    }
  }

  // 3) Consume one use for TODAY, once per TURN (the developer is exempt — no consumption).
  let used = 0;
  let charged = false;
  let glossUsed = 0;
  if (isGloss) {
    /* (#R491) The gloss lane has no turns: one card is one call, and it pays from its own day. */
    if (!isDev) try {
      const { data: dec, error } = await db.rpc("consume_ai_gloss", { p_user: user.id, p_limit: glossLimit });
      if (error) throw error;
      const row = Array.isArray(dec) ? dec[0] : dec;
      glossUsed = row?.used ?? 0;
      charged = !!row?.allowed;
      /* /!\ ITS OWN ERROR CODE. "limit" means the reader is out of QUESTIONS, and telling someone
         that when their questions are untouched would be false - they are out of lookups. */
      if (!row?.allowed) return json({ error: "gloss_limit", glossUsed, glossLimit }, 429);
    } catch (_e) {
      return json({ error: "quota_unavailable", message: "The usage counter is unavailable - please try again." }, 500);
    }
  } else if (!isDev) try {
    /* (ai-one-ledger) through the shared door (_shared/ai-ledger.js openTurn → consume_ai_turn), with
       THIS function's turn bounds — the one door every charge goes through. */
    const row = await openTurn(db, account, { turn: turnId, maxCalls: TURN_MAX_CALLS, ttlSeconds: TURN_TTL_S });
    used = row.used;
    charged = row.charged;
    if (!row.allowed) {
      /* Two different 429s, and the client must be able to tell them apart: one means "come back
         tomorrow", the other means "this one request has asked enough times". */
      if (row.reason === "turn_calls") return json({ error: "turn_calls", used, limit, calls: row.calls }, 429);
      return json({ error: "limit", used, limit }, 429);
    }
  } catch (e) {
    /* ⚠ NOT the database error. `String(e.message)` from a PostgREST/RPC failure names the schema,
       the function signature and sometimes the row that tripped a constraint — openTurn throws a
       LedgerUnavailable that carries none of it. */
    if (!(e instanceof LedgerUnavailable)) try { console.error("ai-proxy ledger", String((e as Error)?.name || "")); } catch (_) { /* ignore */ }
    return json({ error: "quota_unavailable", message: "The usage counter is unavailable — please try again." }, 500);
  }
  /* ⚠ (#R318) A REFUND RELEASES THE CHARGE **AND** THE TURN. Refunding the use while leaving the
     turn row behind would make the user's retry look like a free continuation of a turn nobody
     paid for — the failure would end up costing less than nothing.
     ⚠ (#R801) …AND ONLY THE CALL THAT CHARGED MAY ASK FOR ONE. A continuation of a paid turn
     (`charged` false) has nothing to give back; asking anyway used to hand the FIRST call's charge
     back after its answer had been served — the audited «answer, then send a bad task under the
     same turn» sequence. The ledger refuses that on its own now (refund_ai_turn will not touch a
     turn that has settled), and this is the proxy not asking in the first place. The gloss lane has
     no turns: every gloss call charges, so every gloss failure refunds, as before. */
  const refund = async () => {
    if (isDev || !charged) return;
    try {
      if (isGloss) await db.rpc("refund_ai_gloss", { p_user: user.id });
      else await refundTurn(db, account, turnId);
      charged = false;
    } catch (_) { /* best-effort */ }
  };
  /* (#R801) THE OTHER HALF: the moment an answer exists, the turn is marked as having one, so no
     later failure under this turn key — from this call or another — can refund it. */
  const settle = async () => {
    if (isDev || isGloss || !turnId) return;
    await settleTurn(db, account, turnId);   /* best-effort: the refund guard in the proxy still holds */
  };
  /* (ai-one-ledger) WHAT THIS REQUEST COST. Every provider answer read below is added to `meter`; the
     total is written to the same ledger once the request is over, answered or failed — a failure the
     provider billed was still a cost (a refund returns the reader's use, not the provider's tokens).
     The gloss lane is recorded too, as account-day totals (it has no turn row). */
  /* (ai-quota-fairness) …and which part of the project ceiling it is drawn from: a newcomer's share,
     or the whole. Decided from the account's age as the auth server reports it (see NEWCOMER_SHARE). */
  const meter: Meter & ReturnType<typeof usageMeter> = Object.assign(usageMeter(), {
    ceiling: cohortOf(user.created_at, Date.now()) === NEWCOMER ? NEWCOMER_CEILING : CEILING,
  });
  const record = () => recordUsage(db, user.id, isGloss ? "" : turnId, meter.total());

  // Parse the request body.
  // (#R113) `task` + `webMode` let the proxy configure output budget, JSON mode and
  // web policy per feature — instead of one MAX_TOKENS / one boolean for everything.
  let payload: {
    prompt?: string; system?: string; images?: string[]; lang?: string;
    /* (#R540) the two attachment channels — extracted text, and documents the provider parses */
    files?: { name?: string; text?: string; truncated?: boolean }[];
    docs?: { name?: string; mime?: string; b64?: string }[];
    web?: boolean; webMode?: string; task?: string; requestedCount?: number; schema?: unknown; imageDetail?: string;
    effortHint?: string; turnId?: string;
    /* (#R722) developer-only, ignored for everyone else - see the block after the parse. */
    op?: string; provider?: string; model?: string;
    /* (atlas-native-tools) protocol 2 — see normalizeTurn */
    protocol?: number; input?: unknown[]; tools?: unknown[]; toolChoice?: string;
    /* (atlas-stream-replay) the key this request's answer is held under — see ANSWER_LEASE_S */
    replayKey?: string;
  } = {};
  /* ⚠ REFUSED BEFORE IT IS READ, when the caller declares a size — and CUT OFF WHILE IT IS READ when
     the caller does not. (#R801) This used to be `req.arrayBuffer()` followed by a length check,
     which is a check on what had already been buffered; readCapped cancels the stream at the ceiling. */
  {
    let raw: Uint8Array | null = null;
    try {
      raw = await readCapped(req, MAX_BODY_BYTES);
    } catch (e) {
      if (e instanceof RelayError && e.code === "upstream_too_large") {
        await refund();
        return json({ error: "too_large", message: "Request body is too large." }, 413);
      }
      raw = null;
    }
    try {
      payload = raw ? JSON.parse(new TextDecoder("utf-8").decode(raw)) : {};
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) payload = {};
    } catch (_) { payload = {}; }
  }

  /* == (#R722) THE DEVELOPER CHOOSES THE MODEL. NOBODY ELSE DOES, AND NOT ON THE CLIENT'S WORD ===
     The right being granted belongs to an ACCOUNT, so it is decided from the account - isDev, the
     immutable auth.users.id carried in the DEV_USER_IDS secret - and not from anything the browser
     says about itself. js/ai-core.js has an aiDev() that any reader can set in localStorage; it
     decides what the panel DRAWS and must never decide what the server RUNS (the same sentence is
     already written at js/auth-ui.js:445).
     A non-developer's model / provider is dropped in silence: it buys nothing, so there is nothing
     to report, and answering "you are not the developer" tells a prober what to look for. */
  const devPick = (() => {
    if (!isDev) return null;
    /* (atlas-quality-lab) the independent grader is never steered — see graderProvider below */
    if (TASKS.get(String(payload.task || "").toLowerCase())?.grader) return null;
    const pv = String(payload.provider || "").toLowerCase().trim();
    const md = String(payload.model || "").trim();
    const provider = PROVIDERS.includes(pv) ? pv : "";
    const model = MODEL_ID_OK.test(md) ? md : "";
    if (!provider && !model) return null;
    return { provider, model };
  })();

  /* The catalogue the panel offers. A POST like every other call (one code path for auth), developer
     only, and it costs no quota because the developer consumes none. */
  if (String(payload.op || "") === "models") {
    if (!isDev) return json({ error: "not_found" }, 404);
    const envProv = (Deno.env.get("AI_PROVIDER") || "anthropic").toLowerCase();
    return json({
      providers: await listModels(),
      /* What answers when the developer has chosen nothing - i.e. what every other reader gets, and
         what the unattended cron jobs get, since those carry no account and so no choice. */
      serverDefault: { provider: envProv, model: Deno.env.get("AI_MODEL") || PROVIDER_DEFAULT_MODEL[envProv] || "" },
      fallback: FALLBACK_CHAIN,
    });
  }

  const task = String(payload.task || "free_text").toLowerCase();
  if (!TASKS.has(task)) {
    await refund();
    return json({ error: "bad_task", message: "Unknown task." }, 400);
  }
  const spec = TASKS.get(task)!;   /* (atlas-core-split) everything this task decides — tasks/<task>.ts */
  /* == (#R491) THE LANE WAS A CLAIM ABOUT A BODY NOBODY HAD READ. HERE IS THE BODY. ============
     Both directions are wrong and both are refused: "lane: gloss" carrying an expensive task would
     buy `atlas_turn` out of the cheap counter, and `task: "gloss"` with no lane would charge a
     lookup against the reader's questions - the one thing this whole lane exists to prevent. */
  if (isGloss !== (spec.lane === GLOSS_LANE)) {
    await refund();
    return json({ error: "bad_lane", message: "The declared lane does not match the task." }, 400);
  }
  // (#R156) input_image detail — "high" is the small-text/maths OCR lever for vision_read; clamp to a safe set.
  const imageDetail = (payload.imageDetail === "high" || payload.imageDetail === "low") ? payload.imageDetail : "auto";
  const webMode = String(payload.webMode || (payload.web === true ? "auto" : "off")).toLowerCase();
  // (#R117) client complexity hint: a long / multi-clause / previously-failed request may ask the
  // PLANNER (and analysis) to think at "high". Bounded: only these two tasks, only one step up —
  // it cannot raise budgets elsewhere or be abused by other tasks.
  const effortHint = String(payload.effortHint || "").toLowerCase();
  const web = webMode === "auto" || webMode === "required";
  const requestedCount = typeof payload.requestedCount === "number" ? payload.requestedCount : undefined;
  const prompt = String(payload.prompt || "").slice(0, isGloss ? MAX_GLOSS_PROMPT : MAX_PROMPT);   /* (#R491) the cheap lane gets a cheap ceiling - a gloss is a phrase and the paragraph around it */
  const system = String(payload.system || "").slice(0, MAX_SYSTEM);   // (#R285) its own bound — see MAX_SYSTEM
  /* ⚠ (atlas-native-tools) …AND WHAT THOSE TWO SLICES CUT IS RETURNED, not only done. The prompt's cut is the one
     that took this turn's results off the end of every Atlas step; it still exists for a one-string
     caller, and the caller is now told how much of what it sent was read. */
  const promptSent = String(payload.prompt || "").length, systemSent = String(payload.system || "").length;
  const legacyTrim = (promptSent > prompt.length || systemSent > system.length)
    ? { ...(promptSent > prompt.length ? { promptChars: promptSent, promptKept: prompt.length } : {}), ...(systemSent > system.length ? { systemChars: systemSent, systemKept: system.length } : {}) }
    : null;
  /* (atlas-native-tools) protocol 2: the turn as items and functions — the Atlas turn only */
  const turnParsed = spec.protocol2 ? normalizeTurn(payload as Record<string, unknown>) : null;
  if (turnParsed && "error" in turnParsed) {
    await refund();
    return turnParsed.error === "too_large"
      ? json({ error: "too_large", message: "The turn is larger than the server accepts, even without the earlier conversation.", meta: { protocol: 2 } }, 413)
      : json({ error: "empty_turn", meta: { protocol: 2 } }, 400);   /* NOT "empty": that is the one-string request's code, and this is a protocol-2 request with nothing in it */
  }
  const turnReq: TurnReq | null = turnParsed;
  /* ⚠ THE PER-IMAGE CEILING IS IN parseDataUrl; THIS IS THE ONE FOR ALL OF THEM TOGETHER. Four
     images each just under the single-image limit is four times the single-image limit, and the
     provider request carries every one of them. */
  const imgs: ImgPart[] = [];
  {
    let total = 0;
    for (const d of (Array.isArray(payload.images) ? payload.images : [])) {
      if (imgs.length >= MAX_IMAGES) break;
      const part = typeof d === "string" ? parseDataUrl(d) : null;
      if (!part) continue;
      const n = b64Bytes(part.b64);
      if (total + n > MAX_IMAGES_BYTES) break;
      total += n;
      imgs.push(part);
    }
  }
  /* ⚠ (#R540) THESE DO NOT SHARE THE PROMPT'S CEILING. That sharing is the whole bug: the client
     used to paste file text into `prompt`, which is sliced to 24 kB. Each channel here counts its
     own items, bounds each item and stops on its own running total (the image loop's argument,
     applied to text and to documents). */
  const files: FilePart[] = [];
  {
    let total = 0;
    for (const f of (Array.isArray(payload.files) ? payload.files : [])) {
      if (files.length >= MAX_FILES) break;
      if (!f || typeof f !== "object") continue;
      const raw = String(f.text || "");
      const text = raw.slice(0, MAX_FILE_TEXT);
      if (!text) continue;                                   // an empty extraction is not an attachment
      if (total + text.length > MAX_FILES_TEXT) break;
      total += text.length;
      /* the client says whether IT cut the file; a cut made HERE is added to that claim rather than
         replacing it, because the model must be told about either one. */
      files.push({ name: String(f.name || "file").slice(0, 200), text, truncated: f.truncated === true || raw.length > text.length });
    }
  }
  const docs: DocPart[] = [];
  {
    let total = 0;
    for (const d of (Array.isArray(payload.docs) ? payload.docs : [])) {
      if (docs.length >= MAX_DOCS) break;
      if (!d || typeof d !== "object") continue;
      const mime = String(d.mime || "").toLowerCase();
      const b64 = String(d.b64 || "");
      /* the three questions parseDataUrl asks of an image, asked of a document: is it a format the
         providers read, is the payload actually base64, and is it a size somebody could have made. */
      if (!DOC_MIME.has(mime)) continue;
      if (b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) continue;
      const n = b64Bytes(b64);
      if (n > MAX_DOC_BYTES) continue;
      if (total + n > MAX_DOCS_BYTES) break;
      total += n;
      docs.push({ name: String(d.name || "document").slice(0, 200), mime, b64 });
    }
  }
  /* ⚠ (#R540) A REQUEST CAN NOW BE ALL ATTACHMENT. "Read this PDF" with the question in the file,
     or a dropped file with no typed text, is a real request — not an empty one. */
  if (!prompt && !imgs.length && !files.length && !docs.length && !turnReq) {
    await refund();
    return json({ error: "empty" }, 400);
  }
  /* (#R491) ...and what the cheap lane may NOT ask for. An image read or a hosted web search costs
     what `vision_read` and `brief` cost, and neither is a dictionary lookup.
     (#R540) Nor is reading a PDF or a spreadsheet: the attachment channels are the same kind of
     expensive input the images are, so the gloss lane takes text only. */
  if (isGloss && (imgs.length || docs.length || files.length || web)) {
    await refund();
    return json({ error: "bad_lane", message: "The gloss lane takes text only." }, 400);
  }

  const maxTokens = maxOutputFor(spec, requestedCount);
  // 4) Provider call with the server-held key. (Provider read BEFORE wantJson — see below.)
  /* ══ (atlas-quality-lab) THE GRADER IS NEVER THE ANSWERER ══════════════════════════════════════
     `atlas_grade` scores an Atlas reply against a verified answer (scripts/atlas-eval/grade.mjs). A model
     grading its own provider's answer shares its blind spots, so the provider here is chosen by the
     SERVER — the first one that is not AI_PROVIDER and whose key is set (graderProviderFor) — and a
     developer's pick does not apply to it: the pick exists to test a model, and pointing the grader at
     the answering model would make every grade it returns meaningless. With no second provider keyed,
     the task refuses (and refunds) rather than grading with the answerer. */
  const graderProvider = spec.grader
    ? graderProviderFor(Deno.env.get("AI_PROVIDER") || "anthropic", (pv: string) => !!Deno.env.get(pv === "openai" ? "OPENAI_API_KEY" : pv === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY"))
    : null;
  if (spec.grader && !graderProvider) {
    await refund();
    return json({ error: "no_independent_grader", message: "No provider other than the one answering Atlas is configured, so no independent grade can be given." }, 503);
  }
  const provider = (graderProvider || devPick?.provider || Deno.env.get("AI_PROVIDER") || "anthropic").toLowerCase();   /* devPick is null for atlas_grade (above) */
  // (#R115) On OpenAI, atlas_plan ALSO runs in JSON mode: the R113c exclusion was a GEMINI-latency
  // workaround (forced responseMimeType slowed the big planner prompt into 45s timeouts). OpenAI's
  // json_object format has no such issue and guarantees parseable plans — a large share of the
  // "Sorry, I could not interpret that" failures were the planner's JSON arriving malformed.
  const wantJson = spec.json || spec.jsonOn.includes(provider);   /* (#R406) atlas_turn is a JSON task (tasks/atlas_turn.ts), so its envelope is enforced on EVERY provider — the atlas_plan clause above it was openai-only (tasks/atlas_plan.ts jsonOn), which left Gemini and Anthropic parsing the plan out of prose */
  // Server owns the map_report schema; other JSON tasks may pass their own (validated shallowly).
  /* (atlas-core-split) map_report / analysis_structured / gloss / atlas_grade own theirs — each task's file */
  const responseSchema = spec.schema !== undefined ? spec.schema
    : (wantJson && payload.schema && typeof payload.schema === "object" && schemaOk(payload.schema) ? payload.schema : undefined);
  const searchEnabled = (Deno.env.get("GEMINI_SEARCH_ENABLED") || "").toLowerCase() === "true";
  /* (atlas-native-tools) WHICH MODEL ANSWERS, AS THE CODE DECIDES IT — this comment used to say «GPT-5.6 Sol
     (AI_MODEL secret = gpt-5.6-sol), Terra the FALLBACK_MODEL», which stopped being true at #R736:
     ① a developer's pick (devPick, below) → ② the AI_MODEL secret, when it is an id for the provider
     that is answering → ③ PROVIDER_DEFAULT_MODEL (OPENAI_DEFAULT_MODEL = gpt-5.6-terra). A 403/404
     model_not_found then walks FALLBACK_CHAIN (sol → luna) unless the developer chose the model.
     ⚠ The SECRET wins over the constant, so the constant names the model only while the secret is
     unset or agrees; meta.model / meta.modelServed report what was asked and what answered.
     /!\ (#R722) AI_MODEL IS AN ID FOR **ITS OWN** PROVIDER. It holds an OpenAI id, so a developer who
     switches the provider to gemini or anthropic must not inherit it - that would send
     "gpt-5.6-terra" to Google. A pick that names only the provider therefore falls to THAT
     provider's default, and only a pick that names a model overrides one. */
  const envProvider = (Deno.env.get("AI_PROVIDER") || "anthropic").toLowerCase();
  const envModel = provider === envProvider ? (Deno.env.get("AI_MODEL") || "") : "";
  /* (atlas-quality-lab) for the grader: devPick is null and envModel is "" (the grader is never
     AI_PROVIDER), so this is the grader provider's default model */
  const model = devPick?.model || envModel || PROVIDER_DEFAULT_MODEL[provider] || OPENAI_DEFAULT_MODEL;
  /* /!\ A CHOSEN MODEL DOES NOT FALL BACK. The fallback exists so that a model the PROJECT lost
     access to cannot blanket-kill Atlas for every reader - an unattended substitution is the right
     answer when nobody asked for this model in particular. When the developer asked for this model
     in particular, substituting another one silently answers a different question than the one being
     tested, and the panel would then report a model that never ran. The 403 is the answer. */
  const noFallbackForPick = !!devPick?.model;
  /* (atlas-native-tools) THE PROMPT-CACHE KEY: the same instructions and the same functions produce the same key,
     whoever is asking — it is derived from the prefix OpenAI caches, and names no account (nothing
     about the reader leaves in it; the privacy notice is unchanged). Requests that share a prefix are
     routed together, which is what makes the cache hit. */
  const cacheKey = turnReq ? "atlas_turn:" + await sha256Hex(cacheBasis(system, turnReq.tools)) : "";   /* (atlas-turn-engine) the fixed functions only — see cacheBasis */

  /* ══ (atlas-live-stream) THE ANSWER, AS A VALUE — sent as JSON, or as the last event of a stream ═══════
     Everything from the provider call to the refund was `try { … return json(…) } catch { … return json(…) }`.
     It is the same code returning { status, body } instead, so the plain request and the streamed one
     cannot answer differently: the stream's `done` event carries exactly this body under exactly this
     status. `sink` is null for every request that did not ask to stream. */
  const answer = async (sink: StreamSink | null): Promise<{ status: number; body: Record<string, unknown> }> => {
  try {
    let out: { text: string; finishReason: string; webAttached?: boolean; webUsed?: boolean; webCount?: number; citations?: WebCitation[]; schemaAttached?: boolean; served?: string; output?: TurnItem[] };
    if (provider === "openai") {
      const key = Deno.env.get("OPENAI_API_KEY");
      if (!key) throw new ProviderError("provider_unavailable", "OPENAI_API_KEY not set", 502, false, {});
      // (#R114) webMode:"required" → force the hosted web search so a latest-info task really runs it.
      let effort = spec.reasoning || "low";   // (#R116) planner/analysis think at "medium"
      if (effortHint === "high" && spec.effortHint) effort = "high";   // (#R117/#R156/#R350) complexity hint — the tasks whose file says effortHint (vision reading small text + maths earns "high")
      /* (#R397) The same `responseSchema` callGemini has had since #R113, in OpenAI's dialect.
         null = this schema cannot be expressed strictly → the call behaves exactly as it did before. */
      const oaFormat = (wantJson && responseSchema) ? openAiSchemaFormat(responseSchema, task) : null;
      try {
        out = await callOpenAI(model, key, prompt, system, imgs, files, docs, web, maxTokens, wantJson, webMode === "required", effort, imageDetail, noFallbackForPick, oaFormat, turnReq, cacheKey, meter, sink || undefined);
      } catch (e) {
        // (#R115) Responses can come back EMPTY/incomplete when invisible reasoning tokens eat the whole
        // max_output_tokens budget. That is retryable and budget-dependent → retry ONCE with a bigger
        // budget (still capped) instead of surfacing "empty response" to the user.
        if (e instanceof ProviderError && e.code === "provider_empty" && e.retryable) {
          out = await callOpenAI(model, key, prompt, system, imgs, files, docs, web, Math.min(HARD_MAX_OUTPUT, maxTokens + 1200), wantJson, webMode === "required", effort, imageDetail, false, oaFormat, turnReq, cacheKey, meter, sink || undefined);
        } else {
          throw e;
        }
      }
    } else if (provider === "gemini") {
      const key = Deno.env.get("GEMINI_API_KEY");
      if (!key) throw new ProviderError("provider_unavailable", "GEMINI_API_KEY not set", 502, false, {});
      if (turnReq) {
        /* (atlas-native-tools) the same MALFORMED rule as below, in the turn's terms: once more with calling turned
           off (the declarations stay — the conversation names them), so the model answers in words */
        try { out = await geminiRetry(() => callGeminiTurn(model, key, turnReq, system, imgs, files, docs, maxTokens, meter, sink || undefined)); }
        catch (e) {
          if (!(e instanceof ProviderError && e.code === "provider_malformed")) throw e;
          out = await callGeminiTurn(model, key, { ...turnReq, toolChoice: "none" }, system, imgs, files, docs, maxTokens, meter, sink || undefined);
        }
      } else try {
        out = await callGeminiRetry(model, key, prompt, system, imgs, files, docs, { meter, maxTokens, web, searchEnabled, wantJson, responseSchema });
      } catch (e) {
        // (#R113) MALFORMED_FUNCTION_CALL → retry ONCE with tools stripped, a hardened
        // "do not call functions" system suffix, and JSON mode forced. No further retries.
        if (e instanceof ProviderError && e.code === "provider_malformed") {
          const hardened = (system ? system + "\n\n" : "") +
            "No web-search or function-calling tool is attached to this request. Do NOT call tools or functions. " +
            "The action/type names in the instructions are plain JSON string values, not callable functions. " +
            "Return the final answer directly" + (wantJson ? " as valid JSON." : ".");
          out = await callGemini(model, key, prompt, hardened, imgs, files, docs, { meter, maxTokens, web: false, searchEnabled: false, wantJson, responseSchema, noTools: true });
        } else if (e instanceof ProviderError && responseSchema && e.meta && e.meta.providerStatus === 400) {
          // (#R113) A 400 while a responseSchema was attached is most likely a schema-dialect rejection by this
          // model — retry ONCE without the schema. responseMimeType:"application/json" still forces valid JSON,
          // and the prompt + client-side validation enforce the shape, so map_report keeps working either way.
          out = await callGemini(model, key, prompt, system, imgs, files, docs, { meter, maxTokens, web, searchEnabled, wantJson, responseSchema: undefined });
        } else {
          throw e;
        }
      }
    } else {
      const key = Deno.env.get("ANTHROPIC_API_KEY");
      if (!key) throw new ProviderError("provider_unavailable", "ANTHROPIC_API_KEY not set", 502, false, {});
      out = turnReq ? await callAnthropicTurn(model, key, turnReq, system, imgs, files, docs, web, maxTokens, meter, sink || undefined)
        : await callAnthropic(model, key, prompt, system, imgs, files, docs, web, maxTokens, meter);
    }
    // (#R350) 5a) A structured answer that will not parse is a TYPED failure, refunded like any
    // other provider failure — the client must never be handed prose it cannot audit.
    if (spec.accept && !spec.accept(out.text)) {
      throw new ProviderError("invalid_structured_output", "The answer did not arrive in the required shape.", 502, true, {});
    }
    // 5) Success. (#R801) Settled BEFORE the answer leaves, so the turn cannot be refunded after it.
    await record();   // (ai-one-ledger) what it cost — off the answer's path where the platform allows (EdgeRuntime.waitUntil)
    await settle();
    return { status: 200, body: {
      text: out.text,
      /* /!\ (#R491) A GLOSS RETURNS NO `used`/`limit`, ON PURPOSE. js/ai-core.js mirrors those two
         into the reader's QUESTION counter the moment it sees them (aiSetUsage), so sending the
         gloss numbers under those names would show "58 of 60 left" on a day when 10 was the real
         answer. The gloss lane names its own numbers and its own mirror reads them. */
      ...(isGloss
        ? { lane: GLOSS_LANE, glossUsed, glossLimit, glossRemaining: Math.max(0, glossLimit - glossUsed) }
        : { used, limit, remaining: Math.max(0, limit - used) }),
      /* (#R318) whether THIS call consumed a use. The UI shows the count honestly instead of
         letting the reader infer it from a number that sometimes moves and sometimes does not. */
      charged,
      // (#R114) webUsed = the search tool ACTUALLY ran this turn (not just attached); the client uses
      // it to keep "latest" features honest (never present a search-less answer as fresh intelligence).
      /* (#R397) `schemaAttached` is the same kind of fact as `webUsed`: whether the provider was
         actually held to the caller's shape on THIS call, or answered under the bare json_object
         because the strict dialect was rejected. The client reads it to decide whether a missing
         field is the model's doing or the ladder's. */
      /* (#R722) modelChosenBy: "developer" when this account picked the model, "server" when the
         AI_MODEL secret did. The panel prints it, so a pick that silently did not take effect is
         visible instead of being believed. */
      /* (#R722) `model` is what was ASKED for; `modelServed` is what the provider says ANSWERED.
         They differ exactly when the fallback chain walked, which is the thing nobody could see. */
      meta: { provider, model, modelServed: out.served || "", modelChosenBy: devPick?.model ? "developer" : "server", ...(graderProvider ? { independentGrader: true } : {}), task, webAttached: !!out.webAttached, webUsed: !!out.webUsed, webSearches: out.webCount || 0, schemaAttached: !!out.schemaAttached, finishReason: out.finishReason,
        /* (atlas-native-tools) which protocol answered (js/ai-core.js refuses an Atlas turn answered without 2), and what
           this function's own fence cut from the request — null when nothing was */
        protocol: turnReq ? 2 : 1, inputTrimmed: (turnReq ? turnReq.trim : legacyTrim) || undefined,
        streamed: sink ? true : undefined },   /* (atlas-live-stream) this body is the `done` event of a stream */
      /* (atlas-native-tools) the provider's items — reasoning to replay, what it wrote, the calls with their ids */
      ...(turnReq ? { output: Array.isArray(out.output) ? out.output : [] } : {}),
      // (#R131) Hosted web-search citation URLs (OpenAI url_citation annotations). The client shows
      // these as the primary, web-verified sources — separate from the client-gathered headlines.
      citations: Array.isArray(out.citations) ? out.citations : [],
    } };
  } catch (e) {
    await refund();   // a failed provider call never costs the user a use (dev never consumed one)
    await record();   // (ai-one-ledger) …but what the provider billed before failing is still a cost, and is recorded
    if (e instanceof ProviderError) {
      // Non-sensitive telemetry only (no prompt / key / JWT).
      try { console.error("ai-proxy provider fail", JSON.stringify({ provider, model, task, code: e.code, http: e.http, meta: e.meta })); } catch (_) { /* ignore */ }
      return { status: e.http, body: { error: e.code, message: e.message, retryable: e.retryable, meta: { provider, model, task, ...e.meta } } };
    }
    /* ⚠ AN UNCLASSIFIED FAILURE IS STILL NOT A PLACE TO PUT AN EXCEPTION MESSAGE. Anything that
       reaches here came from code that has the prompt, the provider key and the caller's JWT in
       scope, so the message is a generic one and the detail stays in the log line above. */
    try { console.error("ai-proxy unclassified fail", JSON.stringify({ provider, model, task, name: String((e as Error)?.name || "") })); } catch (_) { /* ignore */ }
    return { status: 502, body: { error: "provider_unavailable", message: "The AI provider could not be reached.", retryable: false, meta: { provider, model, task } } };
  }
  };

  /* ══ (atlas-stream-replay) ONE KEYED REQUEST, RUN ONCE ═══════════════════════════════════════════
     A protocol-2 turn that carries a replay key (the body's `replayKey`, or the retry's header — the
     same key) claims it before the provider is called:
       · claimed  → it runs; its {status, body} is stored before it is returned (and so before `done`
                    is sent), so a reader whose connection breaks at that moment still finds it. While
                    it runs, it renews its lease every heartbeat.
       · done     → another request with this key already answered: that answer, marked a replay.
       · running  → another request holds it and is alive: wait for it, then take its answer — or,
                    if it failed or its isolate stopped beating, claim again (one row lock decides
                    who runs, so two retries cannot both run it).
     A run after a failure says so: meta.replay {kind:"rerun", after, attempt}. The ledger was
     consulted for this request like any other, so a re-run after a refunded failure is charged like
     a first run and a re-run of a continuation is a continuation (consume_ai_turn decides, as before).
     A request without a key runs exactly as it did. */
  const replayKey = (() => {
    if (!turnReq || !turnId) return "";
    const k = String(payload.replayKey || replayHdr || "").slice(0, MAX_TURN_KEY);
    return REPLAY_KEY_OK.test(k) ? k : "";
  })();
  const keyedAnswer = async (sink: StreamSink | null): Promise<{ status: number; body: Record<string, unknown> }> => {
    if (!replayKey) return answer(sink);
    for (;;) {
      const c = await claimAnswer(db, user.id, turnId, replayKey);
      if (!c) {
        /* the ledger did not answer: run as before this table existed, and say the answer is not held */
        const a = await answer(sink);
        a.body.meta = { ...((a.body.meta as Record<string, unknown>) || {}), replay: { kind: "unheld" } };
        return a;
      }
      if (c.outcome === "done" && c.body) return replayed(c.status, c.body, c.attempts);
      if (c.outcome === "running") {
        const held = await awaitAnswer(db, user.id, turnId, replayKey);
        if (held && held.state === "done" && held.body) return replayed(held.status, held.body, held.attempts);
        continue;   /* failed / abandoned / expired: claim again — the claim, not this loop, decides who runs */
      }
      const beat = setInterval(() => { beatAnswer(db, user.id, turnId, replayKey, c.attempts); }, HEARTBEAT_MS);
      let a: { status: number; body: Record<string, unknown> };
      try { a = await answer(sink); } finally { clearInterval(beat); }
      await finishAnswer(db, user.id, turnId, replayKey, c.attempts, a);
      /* a first run says nothing; a run that is not the first says why it ran */
      if (c.attempts > 1 || replayHdr) {
        a.body.meta = { ...((a.body.meta as Record<string, unknown>) || {}),
          replay: { kind: "rerun", after: c.after || "absent", attempt: c.attempts } };
      }
      return a;
    }
  };

  /* ══ (atlas-live-stream) WHO IS WATCHING ══════════════════════════════════════════════════════════
     Only an Atlas turn may ask (`stream: true` with protocol 2); every other task is answered exactly as
     before. A stream opens with `open`, carries the provider's previews (_shared/ai-stream.js
     previewSink), keeps the connection alive with comments while the model is silent, and ends with ONE
     `done` event: {status, body} — what this request would have answered without streaming.
     ⚠⚠⚠ THE LEDGER IS NOT MOVED BY ANY OF THIS. The charge was taken above, before the body was read;
     `answer` settles before it returns, so `done` still leaves only after the turn is settled (#R801),
     and a provider failure still refunds. A preview is not an answer: a stream that ends without
     `done` is a failure the page reports, never a reply it keeps.
     ⚠ A READER WHO LEAVES DOES NOT STOP THE TURN'S BOOKKEEPING. If the connection closes, writes stop
     and the provider call runs to its end anyway, so the usage is recorded and the turn is settled or
     refunded exactly as it would have been — leaving cannot turn a charged call into a free one, nor
     a failed one into a charged one. EdgeRuntime.waitUntil keeps the isolate for it. */
  if (!(turnReq && (payload as Record<string, unknown>).stream === true)) {
    const a = await keyedAnswer(null);   /* (atlas-stream-replay) */
    return json(a.body, a.status);
  }
  const enc = new TextEncoder();
  const KEEP_ALIVE = ": keep-alive\n\n";   /* an SSE comment: the page's reader skips it */
  let live = true;
  let ctl: ReadableStreamDefaultController<Uint8Array> | null = null;
  let beat: number | undefined;
  const send = (event: string, data: unknown) => {
    if (!live || !ctl) return;
    try { ctl.enqueue(enc.encode(sseEncode(event, data))); } catch (_) { live = false; }
  };
  const finish = () => {
    if (beat !== undefined) { try { clearInterval(beat); } catch (_) { /* gone */ } beat = undefined; }
    if (live && ctl) { try { ctl.close(); } catch (_) { /* already closed */ } }
    live = false;
  };
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctl = c;
      send("open", { protocol: 2 });
      beat = setInterval(() => { if (!live || !ctl) return; try { ctl.enqueue(enc.encode(KEEP_ALIVE)); } catch (_) { live = false; } }, HEARTBEAT_MS);
      const work = keyedAnswer(previewSink(send))   /* (atlas-stream-replay) stored before `done` is sent */
        .then((a) => send("done", a))
        .catch(() => send("done", { status: 500, body: { error: "provider_unavailable", message: "The AI service hit an unexpected error — please try again.", retryable: true } }))
        .finally(finish);
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime;
      if (rt && typeof rt.waitUntil === "function") { try { rt.waitUntil(work); } catch (_) { /* the stream itself keeps it */ } }
    },
    cancel() { live = false; if (beat !== undefined) { try { clearInterval(beat); } catch (_) { /* gone */ } beat = undefined; } },
  });
  return new Response(stream, { status: 200, headers: { ...cors, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
