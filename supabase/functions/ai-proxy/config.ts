// ============================================================================
//  IntMap · ai-proxy · config — the bounds and the ceilings this function holds
// ----------------------------------------------------------------------------
//  (atlas-core-split) Moved out of index.ts unchanged: every number below is the one the function
//  enforced before the split, with the note that says where it came from and when it expires.
//  Read by ask.ts (the request), turn.ts / media.ts (the bounds on what a request carries),
//  provider-call.ts (the ceiling every provider request takes from) and replay.ts (the leases).
// ============================================================================

/* (supporter-funnel) every value that differs by plan is one column of _shared/plans.js */
import { planColumn } from "../_shared/plans.js";
import { HEARTBEAT_MS } from "../_shared/ai-stream.js";
import { FALLBACK_CHAIN, PROVIDER_DEFAULT_MODEL, spendCeiling, shareCeiling } from "../_shared/ai-provider.js";
import { NEWCOMER } from "../_shared/ai-ledger.js";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  /* (#R318) x-intmap-turn — the turn key. It is a HEADER because the quota is consumed before the
     body is read (see the consumption step), and a preflight that does not name it makes the whole
     request fail in the browser rather than merely dropping the field. */
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-intmap-turn, x-intmap-lane, x-intmap-replay",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/* ---- Plan → daily free-use limit: PLAN_LIMITS in _shared/ai-ledger.js (ai-one-ledger). It lived here
   until a second caller (monitor-run's «Run now») had to charge the same allowance — one table, read
   by both, rather than a copy in each. */
/* == (#R491) THE TERM GLOSS IS A SEPARATE LANE, NOT A BIGGER ALLOWANCE =========================
   Selecting a phrase inside an Atlas answer and asking what it means is a different kind of call
   from asking Atlas a question: a short prompt, ~700 tokens out, no tools and no web search. Put
   on PLAN_LIMITS it would have been unusable for what it is FOR - free is 10/day, so a reader who
   looked up three terms while reading ONE answer would have no questions left.
   Its counter is public.ai_gloss_usage and it is genuinely separate in both directions: spending
   the gloss budget cannot stop the reader asking a question, and spending their questions cannot
   stop them looking a word up.
   /!\ THE LANE ARRIVES IN A HEADER FOR THE REASON THE TURN KEY DOES - quota is consumed before the
   body is parsed. Which makes the header a claim about a body nobody has read yet, so it is
   VERIFIED against `task` once the body IS parsed, and a mismatch refunds and 400s. Without that
   check "x-intmap-lane: gloss" would be a cheap door into the expensive tasks. */
/* (supporter-funnel) the numbers are the plan table's `aiGlossPerDay` column (_shared/plans.js), not a
   second table here — a plan added there is a plan this lane knows. */
export const GLOSS_PLAN_LIMITS: Record<string, number> = planColumn("aiGlossPerDay");
export const GLOSS_LANE = "gloss";
export const MAX_GLOSS_PROMPT = 8_000;   // the selection + the sentence around it + the question that produced the answer
/* (#R318) ONE USER TURN = ONE USE. Atlas finishes one request with up to three calls (planner +
   two bounded repairs, or a vision read + its self-check re-read), and charging three for one
   question is a bill the user never agreed to. The client stamps a turn key; the FIRST call
   carrying it pays, the rest are free — bounded HERE, not by the client:
     · TURN_MAX_CALLS  — how many calls one key may carry. Above it: 429 {error:"turn_calls"}.
     · TURN_TTL_S      — how long a key stays alive. A replayed old key opens a new, charged turn.
   Both are constants in this file precisely so a caller cannot raise them. */
/* (#R413) 6 → 12. One REQUEST still costs the reader one unit of their daily quota — that is what
   this block is for and it is unchanged. What 6 was additionally doing was capping how many steps
   Atlas could take inside that one paid turn, and js/atlas-agent.js had shrunk its own ceiling to 4
   to stay clear of it, so a turn that had to look something up, act on it and then speak had no room
   left to fix a mistake. Twelve is the same protection against a runaway loop without deciding for
   Atlas how much thinking one answer is allowed. */
export const TURN_MAX_CALLS = 12;
export const TURN_TTL_S = 900;
export const MAX_TURN_KEY = 120;
/* ══ (atlas-stream-replay) A BROKEN STREAM IS RECEIVED AGAIN, NOT COMPUTED AGAIN ═══════════════════
   A streamed Atlas request carries a REPLAY KEY (js/ai-core.js mints one per streamed request; its
   retry after a stream that broke before `done` sends the same key in the x-intmap-replay header).
   The answer of a keyed request is held in public.ai_turn_answers (migration 20261001090000) until the
   turn key expires, so the retry receives the answer the first request produced — no provider call,
   no charge, no second answer that may differ from the first. A retry re-runs ONLY after an observed
   failure (the first run stored `failed`) or a run whose isolate stopped beating (`abandoned`), and
   says so (meta.replay) — one-pass-or-a-reason §5.
     · ANSWER_LEASE_S — two heartbeats of the stream (HEARTBEAT_MS, _shared/ai-stream.js): the running
       request renews its lease every heartbeat, so one late renewal is tolerated and an isolate that
       died is recognised within two. Moves with HEARTBEAT_MS; canonical place: that constant.
     · ANSWER_POLL_MS — how often a retry that found the first request still running reads the row
       again. ESTIMATE, not a measurement: an Atlas provider round-trip is measured in seconds
       (dev-notes/2026-10-01-atlas-live-stream.md: the first visible character at 6.9–71.5 s), so a
       one-second read adds at most a second to a wait that is already that long, at one indexed row
       read a second. Expires if a provider round-trip becomes sub-second.
     · The answer is kept for TURN_TTL_S, the turn key's own lifetime: after it the same turn key opens
       a new turn, so an older answer has no turn to be replayed into.
   ⚠ NOT A LIMIT (CONSTITUTION.md §5): nothing is refused, TURN_MAX_CALLS is untouched, and a replay
   that finds a stored answer returns before consume_ai_turn, so it does not use up one of the calls. */
export const ANSWER_LEASE_S = Math.ceil((2 * HEARTBEAT_MS) / 1000);
export const ANSWER_POLL_MS = 1000;
export const REPLAY_KEY_OK = /^[A-Za-z0-9._:-]{8,120}$/;

/* ══ (edge-spend-and-models) THE PROJECT-WIDE CEILING — a fence on the invoice, not on Atlas ══════
   Everything above bounds ONE ACCOUNT: PLAN_LIMITS a day of turns, TURN_MAX_CALLS the calls one turn
   may carry. Nothing bounded the PROJECT, and an account costs nothing to make
   (config.toml: enable_signup, no confirmation) — so N accounts were N times the bill with no N.
   This is the ceiling on the whole: every request this function sends to a provider takes one unit
   from `ai-proxy:global:day` (_shared/ai-provider.js → public.relay_take) before it is sent —
   fallback steps, retries and the developer's own calls included, because each is a request on the
   same invoice. It FAILS CLOSED: a limiter that cannot be consulted cannot say the invoice is bounded.
   ⚠ IT IS NOT A LIMIT ON WHAT ATLAS MAY DO (CONSTITUTION.md §5). TURN_MAX_CALLS, the plans and every
   capability are unchanged; a reader meets this only on a day the project as a whole has spent many
   times what it has ever spent, and is refunded the use (the provider-failure path refunds).
   THE NUMBER (no-ad-hoc-hardcoding §4):
     · Observation — the production ledger read 2026-09-29 (public.ai_turns, public.ai_usage): the
       busiest recorded day is 2026-09-17 with 114 provider calls in 43 charged turns; on no recorded
       day did more than two accounts use AI; 56 accounts exist. The developer account is exempt from
       the ledger, so its calls are not in those numbers — the margin below is what covers them (a
       production probe session of the #R742 kind is a few hundred calls).
     · 3000 is ~26× the busiest recorded day, and the whole plan maximum of ~16 free accounts
       (10 turns × TURN_MAX_CALLS 12 + the 60 glosses = 180 requests an account a day).
     · Expires the first time a reader meets `provider_quota` with meta.ceiling = "project_day" on a
       day that was readers — then AI_PROXY_GLOBAL_PER_DAY moves it without a deploy. It is not a
       statement of price (the provider bills by token, and this counts requests).
     · Canonical place: THIS constant; the environment may move it, never define it. */
export const GLOBAL_PER_DAY = 3000;
export const CEILING = spendCeiling({ fn: "ai-proxy", perDay: GLOBAL_PER_DAY, env: (k: string) => Deno.env.get(k) || "" });

/* ══ (ai-quota-fairness) …AND WHOSE DAY IT PROTECTS — a newcomer's requests come out of a share ═════
   The ceiling above is one bucket, and each account is bounded only by its plan (at most 10 turns ×
   TURN_MAX_CALLS 12 + 60 glosses = 180 requests a day). So about 17 accounts could empty it, and an
   empty bucket stops EVERY reader's AI — the month-old reader's as much as the account factory's.
   An account costs one confirmed e-mail address (production auth, read 2026-10-01:
   mailer_autoconfirm false, anonymous sign-in off).
   So an account younger than NEWCOMER_AGE_DAYS (_shared/ai-ledger.js cohortOf — auth.users.created_at,
   which no request can move) takes each provider request from `ai-proxy:newcomer:day` first and then
   from the project bucket (_shared/ai-provider.js shareCeiling). Whatever the newcomers do, they
   cannot take more than their share out of the day; the rest is held for accounts that are older.
   ⚠ NOTHING HERE LOWERS ANYONE'S LIMIT (CONSTITUTION.md §5, one-pass-or-a-reason §3). GLOBAL_PER_DAY,
   PLAN_LIMITS, the gloss lane and TURN_MAX_CALLS are unchanged, an established account takes from the
   project bucket exactly as before, and a newcomer keeps its whole plan — only which part of the
   invoice fence its requests come from is decided here. A refusal is `provider_quota` with
   meta.ceiling "newcomer_day", and the use is refunded like the project ceiling's.
   NEWCOMER_SHARE = 1/3 of the project ceiling (no-ad-hoc-hardcoding §4):
     · Observation — production ledger, read 2026-10-01: at most 9 accounts under a week old used AI
       on one day, 16 turns between them; the busiest turn carried 12 requests and the busiest day of
       the whole project 114. A third of 3000 is 1000 requests: 62× that newcomer day even if every
       one of its turns had used all 12 calls (192), and five fresh accounts at their plan maximum.
     · What it holds back: 2000 a day that no batch of new accounts can reach — 17× the busiest day
       the project has recorded, for accounts a week old or more.
     · A FRACTION, so that AI_PROXY_GLOBAL_PER_DAY moving the whole moves the share and the reserve
       with it (a fixed share larger than a lowered whole would reserve nothing).
       AI_PROXY_NEWCOMER_PER_DAY sets the share in requests directly, without a deploy.
     · Expires the first time a newcomer meets `provider_quota` / meta.ceiling "newcomer_day" on a
       day that was readers, not a factory — then the share moves (the env), not the age.
     · Canonical place: THIS constant and NEWCOMER_AGE_DAYS in _shared/ai-ledger.js. */
export const NEWCOMER_SHARE = 1 / 3;
export const NEWCOMER_CEILING = shareCeiling({
  fn: "ai-proxy", share: NEWCOMER, of: CEILING,
  perDay: Math.max(1, Math.floor(CEILING.perDay * NEWCOMER_SHARE)),
  env: (k: string) => Deno.env.get(k) || "",
});
/* Read by tests/edge-spend-and-models-checks and tests/ai-quota-fairness-checks, which evaluate this
   module (Deno.serve stubbed). */
export const SPEND = { ceiling: CEILING, schedule: [], shares: { [NEWCOMER]: NEWCOMER_CEILING } };

/* (#R722) OpenAI model = GPT-5.6 SOL, with Terra as the fallback, on the user's instruction.
   ⚠ WHAT "THE MODEL IS X" MEANT BEFORE THIS ROUND, MEASURED. #R150 set AI_MODEL=gpt-5.6-terra and
   this constant with it — and on 2026-09-15, asking OpenAI with this project's own key, BOTH
   gpt-5.6-terra and gpt-5.6-sol answered 403 «Project proj_… does not have access to model» while
   Luna answered 200. So from #R150 until today every Atlas answer came from the FALLBACK, and the
   setting named a model that had not run in months. The fallback did its job so well that nothing
   ever said so — which is why meta.modelChosenBy and the panel's «Chosen: …» line exist now.
   The access was granted the same day; re-measured through this proxy, sol / terra / luna /
   gpt-6-astra all answer 200, and sol was the model until #R736 moved it to Terra. A 403/404
   model_not_found walks FALLBACK_CHAIN, so losing a model can never blanket-kill Atlas again. */
/* (#R736) …AND IT IS TERRA NOW, ON THE USER'S INSTRUCTION — for every reader, and for the developer
   account too (the developer's "Server default" IS this value; js/ai-core.js paints it by name).
   ⚠ THE SECRET STILL WINS OVER THIS CONSTANT (`AI_MODEL`, read below), so the two were set together:
   #R722 measured what happens when they disagree — the setting named a model that had not run in
   months. Both say gpt-5.6-terra as of 2026-09-15.
   (edge-spend-and-models) The constant is _shared/ai-provider.js's OPENAI_DEFAULT_MODEL now — one
   table for every function that calls a model, imported above. */
/* (#R722) …and what answers when it cannot, IN ORDER: sol → terra → luna. One fallback was enough
   while the only way to lose a model was to lose access to it; this project has now measured two
   models 403 at the same time (sol and terra, 2026-09-15), and a single fallback in that state is a
   second attempt at nothing. The chain is walked ONE step per failure by position — a model that is
   already in it resumes from where it sits, so the walk terminates at the end of the array and
   needs no separate recursion guard. ⚠ ORDER IS THE POLICY: newest first, oldest-and-known-good
   last. Luna is last because it is the model this project has never lost access to. */
/* (#R736) terra → sol → luna: the policy above is unchanged (newest first, oldest-and-known-good
   last), only the head of the ladder moved. FALLBACK_CHAIN is _shared/ai-provider.js's. */
export const FALLBACK_MODEL = FALLBACK_CHAIN[0];   /* the first step — named for the documents that state it */
/* (#R722) ...and the DEFAULTS for the other two providers, which used to be written inline at the one
   place that read them. They are read twice now - by the call and by the model list - and a default
   that two readers each spell for themselves is the #R515 shape.
   (edge-spend-and-models) …and five FUNCTIONS each spelling it for themselves was the same shape one
   level up: four background jobs said gemini-2.0-flash while this file said gemini-3.5-flash.
   PROVIDER_DEFAULT_MODEL is _shared/ai-provider.js's, read here and by those four. */
export const PROVIDERS = Object.keys(PROVIDER_DEFAULT_MODEL);
/* A provider id and a model id, as the upstreams spell them. NOT an allow-list of model names: the
   names are discovered from each provider's own catalogue (listModels below), because a hand-kept
   list here would silently drop whatever the provider shipped this morning. */
export const MODEL_ID_OK = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,79}$/;
/* (#R736) THE ONE THING THE PICKER IS ALLOWED TO SAY THAT THE PROVIDER DID NOT — A WITHDRAWAL.
   `listModels` discovers the catalogue and may name no model (the paragraph above it says why, and
   tests/atlas-ai-proxy-models-checks.test.mjs #R722 ② holds it to that), so the owner's decision not to OFFER a model lives here instead,
   next to the other model constants, as one named set. The owner asked for gpt-6-astra not to be
   offered (2026-09-15).
   ⚠ IT IS NOT A CAPABILITY BOUNDARY. The proxy still calls whatever model id it is given, so nothing
   that answered yesterday stops answering — what changes is what is OFFERED (CONSTITUTION.md §0.3).
   js/ai-core.js drops a STORED pick the catalogue no longer offers, so an account that had already
   chosen one returns to the server default rather than keeping a choice its panel cannot show. */
export const WITHDRAWN_MODELS = new Set(["gpt-6-astra"]);

export const MAX_PROMPT = 24_000;     // hard caps so a single call can't be abused
/* ══ ⚠⚠⚠ (#R285) THE PLANNER'S CATALOGUE WAS BEING CUT IN HALF, IN PRODUCTION, SILENTLY ═══════════
   `system` used to share MAX_PROMPT with `prompt`. But `system` is not user text — it is the Atlas
   prompt the app itself builds, and the planner's is the action CATALOGUE: every button, layer,
   panel and setting described to the model. Measured on the deployed build (v46): that string is
   ~91 kB, so `.slice(0, 24_000)` threw away roughly two thirds of it, mid-word, inside the `engine`
   action's description. Everything documented after that point — several dozen actions, the layer
   list, the module list, the control list — DID NOT EXIST for the planner.
   ⚠ AND THE GATE THAT WAS SUPPOSED TO CATCH THIS COULD NOT SEE IT. scripts/atlas-catalog.mjs
   (#R278) checks that every dispatch capability is described in function SYS() — it reads the
   SOURCE, and the source was complete. What was incomplete was the part that arrived. A catalogue
   gate that stops at the client is measuring the letter, not the delivery.
   The cap stays a cap: `prompt` — the half that carries user text — keeps 24 kB, and `system` gets
   a bound of its own, set well above the real maximum rather than below it. */
export const MAX_SYSTEM = 160_000;
export const MAX_IMAGES = 4;

/* ══ ⚠⚠ THE REQUEST ITSELF HAD NO SIZE ═══════════════════════════════════════════════════════════
   MAX_PROMPT and MAX_IMAGES were applied AFTER `await req.json()`, i.e. after the whole body had
   already been read into the isolate and parsed. `{"images":[<400 MB of base64>]}` was therefore
   accepted, buffered and parsed in full before the code that limits it to four ever ran — and the
   caller only needs to be logged in, because the quota is consumed a step earlier. Every bound below
   is measured against what the CLIENT actually sends, so none of them can be reached by normal use:
     · js/atlas-console.js compresses each picked image with compressImage(f, 2000, 0.9) — a 2000 px
       JPEG at q=0.9, i.e. ~0.5-2 MB, base64'd to ~0.7-2.7 MB — and slices the list to 4.
     · the prompt string is already clamped to MAX_PROMPT (24 kB) and, since #R285, the system string
       to MAX_SYSTEM (160 kB) — together still four orders of magnitude under the body ceiling below.
   (#R540) Attachments changed that arithmetic: a request may now also carry up to MAX_DOCS_BYTES of
   PDF and MAX_FILES_TEXT of extracted text, and base64 costs a third on top. The ceiling is 32 MB —
   the figure Anthropic itself puts on ONE Messages request, deliberately not a byte above it. It is
   a real bound rather than a notional one: filling the raster channel (12 MB decoded → ~16 MB
   base64) AND the document channel (12 MB → ~16 MB) in the same request does not fit, and such a
   request is refused before it is read rather than after it is parsed. */
export const MAX_BODY_BYTES = 32 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;        // ONE decoded image (2000 px q0.9 JPEG is well under)
export const MAX_IMAGES_BYTES = 12 * 1024 * 1024;      // …and all of them together
/* The four raster formats the providers accept. The old regex was `image/[a-zA-Z0-9.+-]+`, which also
   said yes to image/svg+xml — a document format with script in it — and to any string shaped like a
   MIME type, for a value that is pasted straight into the provider request. */
export const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
/* ══ ⚠⚠⚠ (#R540) AN ATTACHMENT IS ITS OWN CHANNEL, AND IT GETS ITS OWN BOUND ══════════════════════
   The only attachment that ever reached this function was an image. A text file was pasted by the
   client INTO `prompt` as an «[ATTACHED FILE …]» section — and `prompt` is sliced to MAX_PROMPT
   (24 kB), while the client will read 60 kB from each of four files. So most of what the reader
   attached was cut, mid-word, with nothing said about it to the reader OR to the model, which then
   answered about the part that survived as though it were the whole. That is exactly the shape
   #R285 found in `system`, and it has the same fix: the field that carries the user's TYPED text
   keeps its 24 kB, and every other channel is given a bound of ITS OWN.
     · files — text THIS app extracted (txt/csv/md/json/docx/xlsx/…); the provider sees it as text.
     · docs  — bytes the PROVIDER parses. PDF is what all three read as a document (Anthropic
       `document`, OpenAI `input_file`, Gemini `inline_data`), in the same sense that png/jpeg/webp/
       gif is what all three read as a raster. DOC_MIME states that upstream fact; it is not a list
       of cases, and a format is added to it only when all three providers accept it.
   OBSERVED (2026-09-07, provider documentation): Anthropic's Messages API caps one REQUEST at 32 MB
   and one PDF at 600 pages (100 on the 200k-context models). 8 MB sits well inside a single PDF's
   share of that, and four documents plus four images stay inside MAX_BODY_BYTES above.
   EXPIRES WHEN: a provider moves its request ceiling, or a second document format becomes readable
   by all three — then these numbers and DOC_MIME are re-measured, not extended case by case.
   CANONICAL: here. The client holds the same numbers in js/atlas-attach.js `ATL_FILE.LIMITS`
   (images/files/docs, textPerFile/textTotal, docBytes/docsBytes) and tests/atlas-attach-checks.test.mjs (#R540) asserts the two are
   EQUAL rather than re-stating either — a client that trims to a wider bound than the server
   enforces is precisely how an attachment gets cut silently again. */
export const MAX_FILES = 8;                             // text attachments in ONE request
export const MAX_FILE_TEXT = 120_000;                   // ONE extracted file
export const MAX_FILES_TEXT = 400_000;                  // …and all of them together
export const MAX_DOCS = 4;                              // provider-native documents in ONE request
export const MAX_DOC_BYTES = 8 * 1024 * 1024;           // ONE document, decoded
export const MAX_DOCS_BYTES = 12 * 1024 * 1024;         // …and all of them together, decoded
export const DOC_MIME = new Set(["application/pdf"]);   // what all three providers read AS a document
