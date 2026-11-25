// ============================================================================
//  IntMap · _shared/ai-provider.js — the one door to a paid AI provider  (edge-spend-and-models)
// ----------------------------------------------------------------------------
//  WHAT WAS FOUND (audit of supabase/functions, 2026-09-29):
//    ① The default model of each provider was spelled in five functions, and the five had drifted:
//       ai-proxy said gemini-3.5-flash while the area-monitor runner (since retired) / news-ingest /
//       refresh-news / who-don said
//       gemini-2.0-flash, and every Anthropic default was claude-3-5-haiku-latest. A default spelled
//       in five places is five defaults (.agents/rules/no-ad-hoc-hardcoding.md §1 «既にある仕組みの写し»).
//    ② Three private copies of «fetch a provider under a deadline» (ai-proxy, its unwired backup,
//       the area-monitor runner), and three functions calling the provider with a bare fetch and no byte ceiling.
//    ③ the area-monitor runner concatenated `r.text().slice(0,200)` — the provider's own error body —
//       into the Error it stored for the monitor's owner to read. The body is not
//       a controlled surface: it can echo the request, name an organisation or carry an account id.
//       ai-proxy had the same shape and #R801 cut it to a length; the other four still carried it.
//    ④ No function that holds a paid key except atlas-embed had a PROJECT-WIDE ceiling. ai-proxy
//       bounded each account (PLAN_LIMITS) — so N accounts meant N times the bill, with no N.
//
//  WHAT THIS FILE OWNS, so that each of those is one thing in one place:
//    · the model table                 (PROVIDER_DEFAULT_MODEL, OPENAI_DEFAULT_MODEL, FALLBACK_CHAIN; prices
//                                       MODEL_PRICE_USD_PER_MTOK; output ceilings MODEL_MAX_OUTPUT_TOKENS)
//    · the provider-answer ceilings    (PROVIDER_TIMEOUT_MS, PROVIDER_MAX_BYTES)
//    · what a provider failure carries (ProviderFail / providerFail: a status and a LENGTH, never a body)
//    · the spend ceiling               (spendCeiling: the project-wide bucket `<fn>:global:day`;
//                                       shareCeiling: a cohort's share of it, `<fn>:<share>:day`)
//    · the door                        (providerFetch: no ceiling → no request; no receipt → no request)
//
//  ⚠⚠ THE CEILING IS A FENCE ON THE INVOICE, NOT ON ATLAS (CONSTITUTION.md §5). It does not decide how
//  many steps a turn may take or which tools Atlas may call — the turn's spend fences and the plan limits are
//  untouched. It is the last fence against a runaway: a loop, a leaked scheduler secret, a thousand
//  fresh accounts. Its numbers are set well above every day this project has measured, and each
//  function writes beside its number the observation it came from and when it stops being true.
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — scripts/static-checks.mjs parses every committed .js/.ts as
//  plain JavaScript, and the node tests import this module directly (tests/edge-spend-and-models-checks).
// ============================================================================

import { fetchBounded, RelayError } from "./relay-guard.js";
import { makeLimiter, restRpcClient } from "./rate-limit.js";
import { secretKey } from "./supabase-keys.js";

/* ══ ① THE MODEL TABLE ═════════════════════════════════════════════════════════════════════════
   The canonical place for «which model answers when nobody chose one». Every function that calls a
   chat model reads its default from here; a function-specific secret (NEWS_GEO_MODEL, WHO_DON_MODEL, …) and then the shared AI_MODEL secret still win over it, exactly
   as before — this table is only what answers when both are unset.

   (#R736) OpenAI = GPT-5.6 Terra, on the user's instruction, for every reader and the developer
   account. The AI_MODEL secret is set to the same id (2026-09-15); tests/atlas-ai-proxy-models-checks.test.mjs #R722 ⑦ holds this constant
   and Architecture.md to each other, and atlas-native-tools ⑦ holds it to ai-proxy's deploy header.
   (edge-spend-and-models) The other two rows used to be ai-proxy's alone (gemini-3.5-flash,
   claude-3-5-haiku-latest) while the four background functions spelled older ids. Anthropic's row is
   the light model — every Anthropic caller here is a batch job or a dormant provider switch, and the
   provider's own current light model is claude-haiku-4-5-20251001 (Anthropic's model list, read
   2026-09-29). It expires when that id is retired; the developer's model picker (ai-proxy `op:
   "models"`) lists what the provider offers today, so the replacement is read there, not guessed. */
/* (atlas-gpt6-models) …AND IT IS GPT-6.2 SOL NOW (was 6.1 until 2026-11-18), with GPT-6.1 Terra and GPT-6 Luna under it — the user's
   instruction of 2026-11-16: 「Sol→Terra→luna の順番かつ、それぞれの最新番号に」. Read from OpenAI's own model
   pages and pricing that day: gpt-6.1-sol $2/$10 (the 6.2 price was not read), gpt-6.1-terra $1/$5, gpt-6-luna $0.1/$0.5 per 1M tokens
   (input/output) — gpt-5.6-terra, the model it replaces, was $2/$12. All three take reasoning effort
   low/medium/high (the only values callOpenAI sends) and the Responses API's hosted web_search.
   Expires when OpenAI ships a newer point release of any of the three. */
export const OPENAI_DEFAULT_MODEL = "gpt-6.2-sol";
/* (#R722) What answers when the default cannot, IN ORDER — ai-proxy walks it one step per 403/404
   model_not_found. ⚠ ORDER IS THE POLICY: newest first, oldest-and-known-good last. */
export const FALLBACK_CHAIN = ["gpt-6.1-terra", "gpt-6-luna"];
/* The last rung — the model this project has never lost access to (measured 2026-08-23 and
   2026-09-15). The background jobs take ONE fallback step and it is this one: they are unattended,
   and a single step to the known-good model is the whole of what #R148/#R351 asked of them. */
export const OPENAI_LAST_RESORT_MODEL = FALLBACK_CHAIN[FALLBACK_CHAIN.length - 1];
/* (news-event-history) The embedding model news-ingest prefers when the OpenAI key cannot reach an embedding model
   (measured 2026-11-20: 403, no embedding id in the key's list). It is a PREFERENCE: the stage asks the provider's own
   model list and falls back to whichever embedding model that list names. One table for every model id (edge-spend-and-models ①). */
export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
export const PROVIDER_DEFAULT_MODEL = Object.freeze({
  openai: OPENAI_DEFAULT_MODEL,
  gemini: "gemini-3.5-flash",
  anthropic: "claude-haiku-4-5-20251001",
});

/* ══ ①b WHAT A MODEL COSTS — the price table a turn family's spend is reckoned in (atlas-delegation) ══
   USD per 1M tokens: input (uncached), cached input, output. The ledger records tokens (usageMeter);
   this turns them into money, which is the unit the per-turn cap (ai-proxy config.ts TURN_COST_CAP_USD)
   is stated in — a call count says nothing about whether a call read 2k tokens or 300k.
   Observation:
     · gpt-6.1-sol $2 / $0.20 / $10, gpt-6.1-terra $1 / – / $5, gpt-6-luna $0.1 / – / $0.5 — OpenAI's
       pricing as read 2026-11-16 (the comment at OPENAI_DEFAULT_MODEL); the cached-input price of
       sol ($0.20, a tenth of input) was read 2026-11-18 from OpenAI's help-centre table for GPT-6 Sol.
       Terra's and Luna's cached prices were not read: they are taken at the full input price, which
       can only over-count.
     · claude-haiku-4-5-20251001 $1 / $0.10 / $5 — Anthropic's pricing page.
   ⚠ A MODEL NOT IN THIS TABLE IS PRICED AT THE MOST EXPENSIVE ROW (priceOf → `known:false`). That is
   gpt-6.2-sol today: its price was not found on 2026-11-18 (only third-party tables, all for 6/6.1 Sol).
   An unknown price can make a family reach its cap early; it can never let one spend past it.
   Expires: whenever a model in FALLBACK_CHAIN / PROVIDER_DEFAULT_MODEL changes, or a provider changes
   its prices — add or correct the row here, the one place every function reads. */
export const MODEL_PRICE_USD_PER_MTOK = Object.freeze({
  "gpt-6.1-sol": Object.freeze({ input: 2, cached: 0.2, output: 10 }),
  "gpt-6-sol": Object.freeze({ input: 2, cached: 0.2, output: 10 }),
  /* gpt-6.2-sol (the production default): OpenAI's standard short-context pricing as the owner's review read it 2026-11-25 — $2 / $0.10 cached / $10 (https://developers.openai.com/api/docs/pricing). Expires: when OpenAI reprices or the default moves. Before this row the model was priced at the table's most expensive cell, cached input at $1. */
  "gpt-6.2-sol": Object.freeze({ input: 2, cached: 0.1, output: 10 }),
  "gpt-6.1-terra": Object.freeze({ input: 1, cached: 1, output: 5 }),
  "gpt-6-luna": Object.freeze({ input: 0.1, cached: 0.1, output: 0.5 }),
  "claude-haiku-4-5-20251001": Object.freeze({ input: 1, cached: 0.1, output: 5 }),
});
const PRICE_CEILING = Object.freeze(Object.values(MODEL_PRICE_USD_PER_MTOK).reduce((m, p) => ({
  input: Math.max(m.input, p.input), cached: Math.max(m.cached, p.cached), output: Math.max(m.output, p.output),
}), { input: 0, cached: 0, output: 0 }));
/* ══ ①c THE MOST A MODEL CAN WRITE IN ONE ANSWER — the provider's own documented ceiling (atlas-unbounded-turns) ══
   An Atlas turn or worker may ask for a larger output budget than its task's default (ai-proxy ask.ts, payload
   maxOutputHint on a task whose file says `outputHint`). The budget is raised up to THIS — never past what the
   provider says the model can produce — and a model with no row here is not raised past HARD_MAX_OUTPUT at all.
   No number here is ours: each is the provider's documentation, read 2026-11-24.
     · gpt-6.2-sol / gpt-6.1-sol / gpt-6-sol / gpt-6.1-terra / gpt-6-luna — 128,000 «max output tokens» on each
       model's page, https://developers.openai.com/api/docs/models/<id> (OpenAI counts reasoning tokens inside it).
     · claude-haiku-4-5-20251001 — 64K «Max output», https://docs.anthropic.com/en/docs/about-claude/models/overview
     · gemini-3.5-flash — 65,536 «Output token limit», https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash
   Expires: whenever a model is added to the offered set (FALLBACK_CHAIN / PROVIDER_DEFAULT_MODEL / the price table)
   or a provider changes a model's ceiling — add or correct the row here, from the provider's page. */
export const MODEL_MAX_OUTPUT_TOKENS = Object.freeze({
  "gpt-6.2-sol": 128_000,
  "gpt-6.1-sol": 128_000,
  "gpt-6-sol": 128_000,
  "gpt-6.1-terra": 128_000,
  "gpt-6-luna": 128_000,
  "claude-haiku-4-5-20251001": 64_000,
  "gemini-3.5-flash": 65_536,
});
/* outputCeilingOf(model) → the documented maximum output tokens, or null when this table cannot cite one */
export function outputCeilingOf(model) {
  const k = String(model || "");
  return Object.prototype.hasOwnProperty.call(MODEL_MAX_OUTPUT_TOKENS, k) ? MODEL_MAX_OUTPUT_TOKENS[k] : null;
}
/* priceOf(model) → { input, cached, output, known } */
export function priceOf(model) {
  const p = Object.prototype.hasOwnProperty.call(MODEL_PRICE_USD_PER_MTOK, String(model || "")) ? MODEL_PRICE_USD_PER_MTOK[String(model)] : null;
  return p ? { ...p, known: true } : { ...PRICE_CEILING, known: false };
}
/* costMicros(model, usage) — micro-dollars for a usageMeter total ({ input, cached_read, cache_write, output }).
   ⚠ `input` IS ALWAYS THE UNCACHED REMAINDER, for every provider: normalizeUsage (ai-usage.js) already took the cached part
   out of OpenAI's and Gemini's whole prompt, and Anthropic reports it that way natively. This used to subtract cached_read
   AGAIN for OpenAI/Gemini, so every cache hit was priced at zero uncached input as well (measured: input 4,000 uncached + 6,000
   cached read as $0.006 instead of $0.014 at sol prices) — the figure the card, the turn cap and the day cap all read.
   A caller holding a provider's WHOLE prompt count must subtract the cached part first (atlas-jobs does, at its one reader). */
export function costMicros(model, usage, provider) {
  const u = usage || {};
  const p = priceOf(model);
  const cached = Math.max(0, Number(u.cached_read) || 0);
  const uncached = Math.max(0, Number(u.input) || 0) + (String(provider || "").toLowerCase() === "anthropic" ? Math.max(0, Number(u.cache_write) || 0) : 0);
  const out = Math.max(0, Number(u.output) || 0);
  return Math.ceil(uncached * p.input + cached * p.cached + out * p.output);   /* USD per 1M tokens × tokens = micro-dollars */
}

/* ══ ② WHAT A PROVIDER MAY TAKE AND SEND BACK ════════════════════════════════════════════════════
   (#R113b) A hung provider must not run the isolate into the wall-clock limit (an opaque 546).
   (#R801) The ceiling on an answer: the largest this project asks for is a few hundred KB of JSON
   plus citations; 16 MiB is two orders of magnitude above that and one below the isolate's memory.
   Expires if a task starts asking for binary output (images, audio), which none does today.
   These used to be written in ai-proxy and the area-monitor runner separately and held equal by a
   test; they are one number now. */
export const PROVIDER_TIMEOUT_MS = 55000;
export const PROVIDER_MAX_BYTES = 16 * 1024 * 1024;

/* ══ THE ONLY CLOCK A READER'S REQUEST ANSWERS TO IS THE PLATFORM'S, NOT A NUMBER OF OURS ═══════════
   MEASURED 2026-11-20 on production: a screenshot attached to «same angle, zoom and place as this»
   made the vision read run 57 s, and the fixed PROVIDER_TIMEOUT_MS above cut it — 503 provider_unavailable
   {"The AI provider timed out.", meta.timeout:true, task:"vision_read"}. The model was working; nothing
   was wrong with it. A cut at a number we chose, with no answer behind it, is a refusal the reader
   cannot act on, and an agent that thinks for minutes would hit it on every turn.
   What a request may genuinely run for is the platform's (https://supabase.com/docs/guides/functions/limits,
   read 2026-11-20):
     · a response must START within 150 s or the gateway answers 504 — a streamed answer (the page
       asked to watch: SSE, with a keep-alive comment every 15 s) has started, so it is not bound by this;
     · the worker lives for 400 s on a paid plan (150 s on the free one). This project is on the Pro plan
       (docs/SECURITY-ARCHITECTURE.md).
   Expires if the plan changes or Supabase moves either number — they are one place, here.
   The margin is what the request still has to do after the provider answers (settle the ledger, write
   the reply); without it the isolate would be killed mid-settlement, which is an opaque 546 and a
   charge that is not returned. The budget is shared by every provider request of ONE reader request
   (a ladder rung, a fallback), so a second attempt gets what is left, never a fresh window. */
export const EDGE_RESPONSE_START_MS = 150000;
export const EDGE_WALL_CLOCK_MS = 400000;
export const EDGE_SETTLE_MARGIN_MS = 30000;
/* providerBudgetMs(streaming, startedAt, now) → the ms this provider request may still take.
   `startedAt` is when the reader's request began (absent → the whole window); never below 1 so an
   exhausted budget fails as a timeout at once instead of waiting on a number that is already spent. */
export function providerBudgetMs(streaming, startedAt, now) {
  const window = streaming ? EDGE_WALL_CLOCK_MS : EDGE_RESPONSE_START_MS;
  const used = (Number(startedAt) > 0 && Number(now) > 0) ? Math.max(0, Number(now) - Number(startedAt)) : 0;
  return Math.max(1, window - EDGE_SETTLE_MARGIN_MS - used);
}

/* The hosts a paid key is sent to. The door refuses any other host, so it cannot be used as a
   general fetch; the regression test refuses a bare fetch to any of these outside the door. A new
   provider is added HERE, and the test then holds every function to the door for it too. */
export const PROVIDER_HOSTS = Object.freeze(["api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com"]);

/* ══ ③ A PROVIDER FAILURE CARRIES A STATUS AND A LENGTH ══════════════════════════════════════════
   ⚠ THE UPSTREAM BODY IS NOT OURS TO REPEAT. Every one of these functions stores or returns what a
   failure says — news_ingest_runs.notes (admins),
   a scheduler's JSON answer, a console line. A provider error body can echo the prompt, name the
   organisation or project, or carry an account identifier. What anyone downstream can act on is the
   status; whether there was a body at all is the only other part worth keeping.
   `code` is one of:
     http                — the provider answered with a non-2xx status (`status`, `bodyLen`)
     timeout / too_large / unreachable / redirect — the transport failed (relay-guard's codes)
     spend_ceiling       — the project-wide bucket is empty; no request was made
     share_ceiling       — the caller's cohort has spent its share of the project bucket (shareCeiling);
                           no request was made, and the rest of the project bucket is untouched
     limiter_unavailable — the bucket could not be consulted; no request was made (fail closed)
     no_ceiling          — a caller reached the door without a ceiling; no request was made
     not_a_provider      — the URL is not a provider this door serves; no request was made */
export class ProviderFail extends Error {
  constructor(code, status, bodyLen) {
    const c = String(code || "unreachable");
    const s = Number.isFinite(+status) ? Math.floor(+status) : 0;
    const n = Number.isFinite(+bodyLen) ? Math.max(0, Math.floor(+bodyLen)) : 0;
    super(c === "http" ? "provider HTTP " + s + " (" + n + "-byte body not kept)" : "provider " + c);
    this.name = "ProviderFail";
    this.code = c;
    this.status = s;
    this.bodyLen = n;
  }
}

/* The one constructor for «the provider said no». Takes the LENGTH of the body, not the body — the
   signature is the rule: there is no argument through which a body could travel. */
export function providerFail(status, bodyLength) {
  return new ProviderFail("http", status, bodyLength);
}

/* Read a failed answer to the end and keep only how long it was. The body is consumed (so the
   connection is released) and dropped here, so a caller that only needs to throw never holds it. */
export async function bodyLength(res) {
  try { return (await res.text()).length; } catch (_) { return 0; }
}

/* ══ ④ THE SPEND CEILING ══════════════════════════════════════════════════════════════════════
   One project-wide bucket per function, `<fn>:global:day`, in public.relay_rate_buckets through
   public.relay_take (migration 20260918100000 — it accepts any scope name, so a new ceiling needs
   no migration). It refills continuously at perDay/86400 per second, like routing-relay's, so it is
   a rate over a day rather than a counter that resets at midnight.
   ⚠ IT FAILS CLOSED. A limiter that cannot be consulted cannot say the invoice is bounded, so the
   paid request is not made — the direction rate-limit.js gives every project-wide bucket.
   The environment may move a function's number without a deploy: `<FN>_GLOBAL_PER_DAY`
   (e.g. AI_PROXY_GLOBAL_PER_DAY), a positive integer; anything else is ignored. The canonical
   default is the function's own, written beside the code that knows what one of its days is. */
function envPositive(env, name, fallback) {
  let v = NaN;
  try { v = Number((typeof env === "function" ? env(name) : "") || ""); } catch (_) { v = NaN; }
  return (Number.isFinite(v) && v >= 1) ? Math.floor(v) : fallback;
}

export function ceilingEnvName(fn) {
  return String(fn || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_") + "_GLOBAL_PER_DAY";
}

/* A scheduled function's day is known: its schedule × the most one run can ask. The ceiling is that
   maximum times SCHEDULE_HEADROOM.
   SCHEDULE_HEADROOM = 2 is an ESTIMATE, not a measurement: a day the schedule can produce on its own
   must never meet the ceiling, and on top of it an operator may run the job by hand (a backfill, a
   «run now») about as much again. A runaway — a loop, a cron mis-set to every minute (twenty times
   an every-20-minutes schedule), a leaked scheduler secret — meets it within the day. It expires the first time a
   legitimate day is refused (`spend_ceiling` in the run's record with nothing else wrong); then the
   function's `<FN>_GLOBAL_PER_DAY` moves without a deploy, and if that becomes routine, this number. */
export const SCHEDULE_HEADROOM = 2;
export function scheduleCeiling(runsPerDay, requestsPerRun) {
  return Math.max(1, Math.ceil((+runsPerDay || 0) * (+requestsPerRun || 0) * SCHEDULE_HEADROOM));
}

/* Receipts: proof that the bucket said yes. Minted ONLY by a ceiling's take() below, kept in a
   module-private WeakSet, so an object a caller builds is not one — the door can tell a receipt
   from a look-alike without trusting any field of it. */
const RECEIPTS = new WeakSet();

/* spendCeiling({ fn, perDay, env }) → { fn, scope, perDay, take(cost) → { ok, code?, receipt? } }
   `env` is `(name) => string` (Deno.env.get in a function) so this file stays free of Deno globals.
   The RPC client is built per take from the platform-injected env, the way routing-relay builds
   it: a module that throws on a missing env answers 500 to everyone (#R505); here a missing env is
   «the limiter did not answer», which fails closed. */
export function spendCeiling(o) {
  const opts = o || {};
  const fn = String(opts.fn || "");
  const env = typeof opts.env === "function" ? opts.env : () => "";
  const perDay = envPositive(env, ceilingEnvName(fn), Math.max(1, Math.floor(+opts.perDay || 1)));
  const scope = fn + ":global:day";
  return {
    fn, scope, perDay,
    async take(cost) {
      const n = Math.max(1, Math.floor(cost == null ? 1 : +cost || 1));
      if (!fn) return { ok: false, code: "no_ceiling" };
      const db = restRpcClient({ url: env("SUPABASE_URL") || "", serviceKey: secretKey(env) });
      const r = await makeLimiter({ db }).take(scope, "*", {
        capacity: perDay, refillPerSec: perDay / 86400, cost: n, onUnavailable: "deny",
      });
      if (r.source !== "db") return { ok: false, code: "limiter_unavailable" };
      if (!r.allowed) return { ok: false, code: "spend_ceiling" };
      const receipt = Object.freeze({ scope, cost: n, remaining: r.remaining });
      RECEIPTS.add(receipt);
      return { ok: true, receipt };
    },
  };
}

/* ══ ④b A SHARE OF THE CEILING — so that one cohort cannot spend the whole  (ai-quota-fairness) ══
   WHAT WAS FOUND (audit, 2026-10-01): a project ceiling is ONE bucket that every caller drains, and
   each account is bounded only by its plan. So the number of accounts it takes to empty the day is
   the ceiling divided by one account's plan maximum — ai-proxy's own comment said «~16 free
   accounts» — and when it is empty EVERY reader's AI stops, the ones who had been using it for
   months included. An account costs an e-mail address to make.
   shareCeiling({ fn, share, of, perDay, env }) is a second bucket, `<fn>:<share>:day`, that a cohort
   takes from FIRST and then from the whole (`of`, a spendCeiling). The whole still bounds everyone;
   the share bounds what that cohort can take OUT of the whole, so
       reserved for everyone else  =  of.perDay − share.perDay
   holds whatever the cohort does. Nobody's plan changes, and a caller outside the cohort takes from
   the whole exactly as before — this adds no step and no limit to it.
   ⚠ IT IS NOT A LIMIT ON ATLAS (CONSTITUTION.md §5): no step, tool or plan number changes. It decides
   only WHOSE day the invoice fence protects when many new accounts arrive at once.
   · `perDay` is the share's default; `<FN>_<SHARE>_PER_DAY` (e.g. AI_PROXY_NEWCOMER_PER_DAY) moves it
     without a deploy. It is clamped to the whole: a share larger than the whole would reserve nothing
     and claim otherwise.
   · The share is taken before the whole, so a refused share never spends a unit of the reserve. The
     one unit it can lose is its own, on a request the WHOLE then refuses — a day the ceiling itself
     is spent, when nothing is sent to anyone.
   · It fails closed like the whole: a share that cannot be consulted cannot say the reserve holds. */
export function shareEnvName(fn, share) {
  return String(fn || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_") + "_" +
    String(share || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_") + "_PER_DAY";
}

export function shareCeiling(o) {
  const opts = o || {};
  const whole = opts.of;
  const fn = String(opts.fn || "");
  const share = String(opts.share || "");
  const env = typeof opts.env === "function" ? opts.env : () => "";
  const wholeDay = whole && whole.perDay > 0 ? whole.perDay : 1;
  const perDay = Math.min(wholeDay, envPositive(env, shareEnvName(fn, share), Math.max(1, Math.floor(+opts.perDay || 1))));
  const scope = fn + ":" + share + ":day";
  return {
    fn, share, scope, perDay, reserved: wholeDay - perDay,
    async take(cost) {
      const n = Math.max(1, Math.floor(cost == null ? 1 : +cost || 1));
      if (!fn || !share || !whole || typeof whole.take !== "function" || whole.fn !== fn) return { ok: false, code: "no_ceiling" };
      const db = restRpcClient({ url: env("SUPABASE_URL") || "", serviceKey: secretKey(env) });
      const r = await makeLimiter({ db }).take(scope, "*", {
        capacity: perDay, refillPerSec: perDay / 86400, cost: n, onUnavailable: "deny",
      });
      if (r.source !== "db") return { ok: false, code: "limiter_unavailable" };
      if (!r.allowed) return { ok: false, code: "share_ceiling" };
      return whole.take(n);
    },
  };
}

/* ══ ⑤ THE DOOR ══════════════════════════════════════════════════════════════════════════════
   providerFetch(url, init, { ceiling | receipt, timeoutMs, maxBytes, cost, onChunk }) → Response

   · `ceiling` — take `cost` (default 1) from it now; one request is one unit, which is how every
     function here counts its day. A refusal throws ProviderFail and nothing is sent.
   · `receipt` — the bucket was already asked for this operation as a whole (atlas-embed charges a
     seed for every document up front, then embeds them in batches). Only a receipt this module
     minted is accepted.
   · neither — ProviderFail("no_ceiling"). There is no way through this function that did not ask.
   The request itself is relay-guard's fetchBounded: one deadline over headers AND body, a byte
   ceiling while the body streams, redirects refused. A non-2xx status is RETURNED, not thrown — the
   caller classifies it (ai-proxy reads the body for its quota class) and throws providerFail. */
export async function providerFetch(url, init, opts) {
  const o = opts || {};
  let host = "";
  try { host = new URL(String(url)).hostname; } catch (_) { host = ""; }
  if (!PROVIDER_HOSTS.includes(host)) throw new ProviderFail("not_a_provider");
  if (o.receipt !== undefined) {
    if (!o.receipt || typeof o.receipt !== "object" || !RECEIPTS.has(o.receipt)) throw new ProviderFail("no_ceiling");
  } else {
    if (!o.ceiling || typeof o.ceiling.take !== "function") throw new ProviderFail("no_ceiling");
    const t = await o.ceiling.take(o.cost == null ? 1 : o.cost);
    if (!t || !t.ok) throw new ProviderFail((t && t.code) || "limiter_unavailable");
  }
  try {
    return await fetchBounded(url, init, {
      timeoutMs: (o.timeoutMs > 0) ? o.timeoutMs : PROVIDER_TIMEOUT_MS,
      maxBytes: (o.maxBytes > 0) ? o.maxBytes : PROVIDER_MAX_BYTES,
      onChunk: o.onChunk,   /* (atlas-live-stream) a 2xx body, as it arrives — _shared/ai-stream.js */
    });
  } catch (e) {
    const c = (e instanceof RelayError) ? e.code : "";
    throw new ProviderFail(
      c === "upstream_timeout" ? "timeout"
        : c === "upstream_too_large" ? "too_large"
        : c === "upstream_redirect" ? "redirect"
        : "unreachable");
  }
}
