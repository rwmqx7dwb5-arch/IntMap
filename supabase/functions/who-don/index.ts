// ============================================================================
//  IntMap · who-don — the case and death counts WHO holds only as prose  (Supabase Edge Function, Deno)
// ----------------------------------------------------------------------------
//  (#R590) 「感染症アウトブレイク。WHO の Disease Outbreak News を地理化。病原体 / 国・地域 /
//    発生日 / WHO 公表日 / 症例数 / 死亡数 のイベントレイヤー。」
//
//  ── WHY THIS DOES NOT RELAY THE FEED ─────────────────────────────────────────────────────────
//  Because the browser can read it. MEASURED 2026-09-09, with `Origin:` set to the Pages origin,
//  the WHO OData service answers `Access-Control-Allow-Origin: *`:
//
//      www.who.int/api/news/diseaseoutbreaknews   200  Access-Control-Allow-Origin: *   ← direct
//
//  So js/outbreaks.js fetches the live tail itself and the 3,195-item history is baked at build
//  time into data/who-don.json.gz by scripts/build-who-don.mjs. A relay that is not needed is one
//  more thing to be down (#R266), and this function deliberately is not one: it never forwards a
//  caller-named URL, it owns the one upstream it reads, and the feed does not pass through it.
//
//  ── WHY THE COUNTS, AND ONLY THE COUNTS, LIVE HERE ───────────────────────────────────────────
//  Of the six fields the layer needs, FIVE are structured fields in WHO's own API and travel with
//  the bundled corpus. The sixth does not exist as a field anywhere: case and death totals are
//  written in the `Overview` HTML, in English prose (measured: `Summary` is empty on 82 % of the
//  items, `Overview` is present on 100 %, mean 2,817 characters).
//
//  Reading that sentence is a judgement, not a match — the same paragraph states the number of
//  provinces, health zones, contacts traced and patients recovered, all integers of the same
//  shape, and no regular expression separates them across 3,195 documents
//  (.agents/rules/no-ad-hoc-hardcoding.md; the worked example is in _shared/who-don-extract.js).
//  ⇒ The judgement is asked of a model, and the model's answer is REFUSED unless it validates.
//  ⇒ The model needs a key. The key is here because a key must never be in the page — which is
//    the whole reason this function exists and the feed's own reader does not need one.
//  ⇒ The answer is written once, per DON, for every reader on Earth. Extraction is the only part
//    of this layer that costs money, so it is also the only part that is not done per reader.
//
//  GET   ?ids=<UrlName>,…      public, keyless, world-readable: the rows already extracted.
//                              ⚠ A DON WITH NO ROW IS `missing`, NOT ZERO. "we have not looked",
//                              "WHO states no total" and "WHO states 5,815" are three different
//                              facts and the payload keeps them apart (#R543 — a null coerced to
//                              0 becomes a bar on a chart that nobody measured).
//  POST  x-who-don-secret      the ingest step: read the prose, ask the model, validate, upsert.
//                              Fail-closed — no secret configured means 401, always.
//
//  Deploy:  supabase functions deploy who-don --project-ref vpekfwdpurzejrrmacac --use-api
//  Secrets: supabase secrets set WHO_DON_SECRET=<random>      (REQUIRED — POST is 401 without it)
//           supabase secrets set AI_PROVIDER=anthropic        (anthropic | openai | gemini)
//           supabase secrets set ANTHROPIC_API_KEY=sk-ant-... (or OPENAI_API_KEY / GEMINI_API_KEY)
//           supabase secrets set WHO_DON_MODEL=...            (optional — this job's own model)
//           supabase secrets set WHO_DON_EXTRACT=off          (optional kill-switch)
//  (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
//  ⚠ NO TYPE ANNOTATIONS. scripts/static-checks.mjs parses every committed .ts with acorn, so the
//  Edge Functions are plain JavaScript in .ts files — see the note at the top of alerts-relay.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { corsFor, fetchGuarded, relayFail } from "../_shared/relay-guard.js";
import {
  plainText, parseExtract, sourceHash, truncateForModel, EXTRACT_PROMPT, DEFAULT_MODEL_CHARS,
} from "../_shared/who-don-extract.js";

/* ⚠ `methodGate` from relay-guard is NOT used here, and the reason is a real difference rather
   than an oversight: it answers 405 to everything that is not GET, and this endpoint has two
   callers — the world, reading, and a scheduler, writing. The OPTIONS/405 shape below is the same
   one, widened to POST. */
const CORS = {
  ...corsFor("x-who-don-secret"),
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body, status, extra) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { ...CORS, "content-type": "application/json", ...(extra || {}) },
});

const TABLE = "who_don_extracts";
/* Bumped when the PROMPT or the validation changes meaning — a row extracted under an older
   algorithm can then be told apart from one extracted under this. */
const ALGORITHM_VERSION = 1;

/* ── the upstream ───────────────────────────────────────────────────────────────────────────── */
const WHO_API = "https://www.who.int/api/news/";
/* ⚠ MEASURED CEILING, NOT A PREFERENCE (scripts/build-who-don.mjs): $top=100 answers 200 and
   $top=200 answers 400. */
const PAGE = 100;
/* ⚠ `Python-urllib` IS BLOCKED (403) by WHO and an absent user-agent is not. Measured both ways
   this round, which is why this sends its own rather than relying on the default. */
const UA = "IntMap/who-don (+https://github.com/rwmqx7dwb5-arch/IntMap)";
const UPSTREAM_TIMEOUT_MS = 20000;
/* A page of 100 items each carrying an ~2.8 kB Overview is ~300 kB; four megabytes is an order of
   magnitude of headroom and still a bound. */
const UPSTREAM_MAX_BYTES = 4 * 1024 * 1024;
/* How far back a run without `ids` will look for work. 5 pages = the 500 most recently published
   DONs, which at WHO's measured rate (3,195 items since 1996) is years of publications — the
   backlog is filled by passing `ids` explicitly, not by walking the whole corpus every run. */
const MAX_SCAN_PAGES = 5;
/* ⚠ An OData $filter is a query string, and a query string that is too long is a 414 rather than
   an answer. Measured against nothing — this is a self-imposed bound well under every documented
   URL limit, and the batching loop below simply splits when it is reached. */
const MAX_FILTER_CHARS = 1600;

/* ── bounds on the caller ───────────────────────────────────────────────────────────────────── */
const MAX_IDS = 200;
const DEFAULT_LIMIT = 25;
/* Wall clock, like news-ingest: stop while there is still time to write, and leave the rest for
   the next run. Edge Functions are killed well after this. */
const DEFAULT_BUDGET_MS = 120000;
/* Enough left to finish the in-flight model call and write the row it produced. */
const RESERVE_MS = 20000;
/* WHO's slug charset, as it actually occurs in the corpus (`1996_01_22a-en`, `2026-DON123`, …).
   Anything else is not a DON name and is answered as `missing` rather than sent upstream. */
const SLUG_RE = /^[A-Za-z0-9._-]{1,120}$/;

/* (#R138-style) Constant-time comparison — a secret must not be recoverable one byte at a time.
   ⚠ The same eight lines are in monitor-run, refresh-news and news-ingest. They are not shared
   because relay-guard is the library for KEYLESS public relays and this is the one thing those
   functions must not import from a place that could ever answer "true" by default. */
function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/* ── the model ──────────────────────────────────────────────────────────────────────────────── */

/* ⚠⚠⚠ **`AI_MODEL` MUST NOT BE TRUSTED BLINDLY.** It is one secret set for Atlas that every AI
 *   function reads, and measured in production (2026-08-23) `AI_MODEL=gpt-5.6-terra` answers 403
 *   for this project's key. ai-proxy knows that and retries once against a known-good model
 *   (#R148/#R150); refresh-news did not, and that silence is exactly why `analyzed_by='ai'` was
 *   0 rows out of 1,651 (#R351). So: this job may name its OWN model (WHO_DON_MODEL), falls back
 *   to AI_MODEL, and on a 403/404 falls once to the model ai-proxy falls to. */
const OPENAI_FALLBACK_MODEL = "gpt-5.6-luna";

/* The provider contract, in the same shape news-ingest uses so the two cannot drift: a kill
   switch env, a model-override env, and the provider inferred from whichever key is present. */
function providerConfig(offEnv, modelEnv) {
  const flag = (Deno.env.get(offEnv) || "").toLowerCase();
  if (flag === "off") return null;
  let provider = (Deno.env.get("AI_PROVIDER") || "").toLowerCase();
  if (!provider) {
    if (Deno.env.get("ANTHROPIC_API_KEY")) provider = "anthropic";
    else if (Deno.env.get("OPENAI_API_KEY")) provider = "openai";
    else if (Deno.env.get("GEMINI_API_KEY")) provider = "gemini";
  }
  const pick = (fallback) => Deno.env.get(modelEnv) || Deno.env.get("AI_MODEL") || fallback;
  if (provider === "openai") { const key = Deno.env.get("OPENAI_API_KEY"); if (key) return { provider, key, model: pick(OPENAI_FALLBACK_MODEL) }; }
  if (provider === "gemini") { const key = Deno.env.get("GEMINI_API_KEY"); if (key) return { provider, key, model: pick("gemini-2.0-flash") }; }
  if (provider === "anthropic") { const key = Deno.env.get("ANTHROPIC_API_KEY"); if (key) return { provider, key, model: pick("claude-3-5-haiku-latest") }; }
  return null;
}

function extractConfig() { return providerConfig("WHO_DON_EXTRACT", "WHO_DON_MODEL"); }

/** One model call. Returns { text, usage:{in,out}, model } — ⚠ the usage the API actually
 *  reported, never an estimate: this is what lets a run say what it really cost. */
async function callProvider(cfg, sys, user, signal, _isFallback) {
  if (cfg.provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", signal,
      headers: { Authorization: "Bearer " + cfg.key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model, instructions: sys,
        input: [{ role: "user", content: [{ type: "input_text", text: user }] }],
        max_output_tokens: 600, reasoning: { effort: "low" }, store: false,
      }),
    });
    if (!r.ok) {
      if (!_isFallback && (r.status === 403 || r.status === 404) && cfg.model !== OPENAI_FALLBACK_MODEL) {
        return await callProvider({ ...cfg, model: OPENAI_FALLBACK_MODEL }, sys, user, signal, true);
      }
      throw new Error("openai " + r.status + " (" + cfg.model + ")");
    }
    const j = await r.json();
    const usage = { in: j?.usage?.input_tokens || 0, out: j?.usage?.output_tokens || 0 };
    if (typeof j?.output_text === "string" && j.output_text) return { text: j.output_text, usage, model: cfg.model };
    const arr = Array.isArray(j?.output) ? j.output : [];
    const text = arr.filter((it) => it?.type === "message")
      .flatMap((it) => (Array.isArray(it.content) ? it.content : []))
      .filter((p) => p?.type === "output_text").map((p) => p.text || "").join("");
    return { text, usage, model: cfg.model };
  }
  if (cfg.provider === "gemini") {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(cfg.model) + ":generateContent?key=" + encodeURIComponent(cfg.key), {
      method: "POST", signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: user }] }],
        systemInstruction: { parts: [{ text: sys }] },
        generationConfig: { temperature: 0, maxOutputTokens: 600 },
      }),
    });
    if (!r.ok) throw new Error("gemini " + r.status);
    const j = await r.json();
    const c = j?.candidates?.[0];
    return {
      text: (c?.content?.parts || []).map((p) => p.text || "").join(""),
      usage: { in: j?.usageMetadata?.promptTokenCount || 0, out: j?.usageMetadata?.candidatesTokenCount || 0 },
      model: cfg.model,
    };
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-api-key": cfg.key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: cfg.model, max_tokens: 600, temperature: 0, system: sys, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error("anthropic " + r.status);
  const j = await r.json();
  return {
    text: (j?.content || []).map((b) => b.text || "").join(""),
    usage: { in: j?.usage?.input_tokens || 0, out: j?.usage?.output_tokens || 0 },
    model: cfg.model,
  };
}

/* ── WHO's OData ────────────────────────────────────────────────────────────────────────────── */

async function odata(path, params) {
  const q = new URLSearchParams(params);
  /* the service wants literal `$` in the parameter names; URLSearchParams escapes it */
  const url = WHO_API + path + "?" + q.toString().replace(/%24/g, "$");
  const r = await fetchGuarded(url, {
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    maxBytes: UPSTREAM_MAX_BYTES,
    contentTypeRe: /json/i,
    headers: { accept: "application/json", "user-agent": UA },
  });
  if (!r.ok) throw new Error("who " + r.status);
  return JSON.parse(r.text());
}

const DON_SELECT = "Id,Title,DonId,UrlName,PublicationDateAndTime,Summary,Overview";

/** The newest DONs, page by page, newest first. */
async function recentDons(skip) {
  const d = await odata("diseaseoutbreaknews", {
    $select: DON_SELECT,
    $orderby: "PublicationDateAndTime desc",
    $top: String(PAGE),
    $skip: String(skip),
  });
  return Array.isArray(d.value) ? d.value : [];
}

/** Named DONs, by slug. Batched so no single $filter grows past MAX_FILTER_CHARS. */
async function donsByUrlName(ids) {
  const out = [];
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const filter = batch.map((s) => "UrlName eq '" + s.replace(/'/g, "''") + "'").join(" or ");
    const d = await odata("diseaseoutbreaknews", { $select: DON_SELECT, $filter: filter, $top: String(PAGE) });
    out.push(...(Array.isArray(d.value) ? d.value : []));
    batch = [];
  };
  for (const id of ids) {
    const len = batch.reduce((n, s) => n + s.length + 20, 0);
    if (batch.length >= PAGE || len > MAX_FILTER_CHARS) await flush();
    batch.push(id);
  }
  await flush();
  return out;
}

/* ── GET: what has already been extracted ───────────────────────────────────────────────────── */

/*  A reader asks about the DONs it is showing and gets back exactly the rows that exist.
    ⚠ THE ABSENT ROW IS NOT A ZERO ROW. `missing` is its own list precisely so the layer can say
    "not extracted" rather than draw nothing and let the reader infer "no cases". A row that IS
    present with cases:null is the third state — the prose was read and states no cumulative
    total, which is a fact about the report and not about the pipeline. */
async function handleGet(req) {
  const url = new URL(req.url);
  const raw = (url.searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ids = [];
  for (const s of raw) {
    if (ids.length >= MAX_IDS) break;
    if (SLUG_RE.test(s) && !ids.includes(s)) ids.push(s);
  }
  if (!ids.length) return json({ error: "ids_required", max: MAX_IDS }, 400);

  /* the ANON key, not the service key: this path only reads a table whose RLS grants anon
     `select`, and a read does not need the credential that can write. */
  const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
  });
  const { data, error } = await db.from(TABLE)
    .select("url_name,cases,deaths,as_of,scope,confidence,model,provider,extracted_at")
    .in("url_name", ids);
  if (error) throw new Error("db " + error.code);

  const rows = {};
  for (const r of (data || [])) {
    rows[r.url_name] = {
      cases: r.cases === null || r.cases === undefined ? null : Number(r.cases),
      deaths: r.deaths === null || r.deaths === undefined ? null : Number(r.deaths),
      asOf: r.as_of || null,
      scope: r.scope || null,
      confidence: r.confidence === null || r.confidence === undefined ? null : Number(r.confidence),
      model: r.model || null,
      provider: r.provider || null,
      at: r.extracted_at || null,
    };
  }
  const missing = ids.filter((id) => !(id in rows));
  return json({ source: "WHO Disease Outbreak News", rows, missing }, 200, {
    "cache-control": "public, max-age=300, s-maxage=900, stale-while-revalidate=86400",
    "x-intmap-rows": String(Object.keys(rows).length),
  });
}

/* ── POST: read the prose, ask, validate, write ─────────────────────────────────────────────── */

/** The prose a DON actually offers, already bounded to what the model will see. */
function proseOf(d) {
  const text = plainText(d.Overview) || plainText(d.Summary);
  return truncateForModel(text, DEFAULT_MODEL_CHARS);
}

/** Rows already held for these slugs, keyed by slug. */
async function existingRows(db, ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += MAX_IDS) {
    const chunk = ids.slice(i, i + MAX_IDS);
    const { data, error } = await db.from(TABLE).select("url_name,source_hash,attempts").in("url_name", chunk);
    if (error) throw new Error("db " + error.code);
    for (const r of (data || [])) out.set(r.url_name, r);
  }
  return out;
}

/** Which of these DONs still need extracting: no row at all, or a row whose prose has changed. */
async function selectTodo(db, dons, limit) {
  const ids = dons.map((d) => String(d.UrlName || "").trim()).filter(Boolean);
  const have = await existingRows(db, ids);
  const todo = [];
  for (const d of dons) {
    if (todo.length >= limit) break;
    const slug = String(d.UrlName || "").trim();
    if (!slug || !SLUG_RE.test(slug)) continue;
    const text = proseOf(d);
    const hash = await sourceHash(text);
    const prev = have.get(slug);
    /* ⚠ SAME PROSE, SAME ANSWER — AND NO SECOND BILL. This is also what keeps a document the
       model could not read from being re-asked for ever: its row is written with the hash of the
       prose that defeated it, so it is skipped until WHO rewrites the report. */
    if (prev && prev.source_hash === hash) continue;
    todo.push({ slug, don: d, text, hash, attempts: (prev && prev.attempts) || 0 });
  }
  return todo;
}

async function handlePost(req) {
  const t0 = Date.now();
  const secret = Deno.env.get("WHO_DON_SECRET") || "";
  /* fail-closed: an unconfigured secret is not an open door */
  if (!secret) return json({ error: "unauthorized" }, 401);
  const got = req.headers.get("x-who-don-secret") || "";
  if (!got || !timingSafeEqual(got, secret)) return json({ error: "unauthorized" }, 401);

  let body = {};
  try { body = await req.json(); } catch (_) { body = {}; }

  const cfg = extractConfig();
  if (!cfg) {
    /* WHO_DON_EXTRACT=off, or no provider key at all. Either way nothing is spent and the caller
       is told which, because "0 extracted" with no reason is the instrument #R334 warns about. */
    const off = (Deno.env.get("WHO_DON_EXTRACT") || "").toLowerCase() === "off";
    return json({ examined: 0, extracted: 0, empty: 0, failed: 0, ms: Date.now() - t0,
      skipped: off ? "kill_switch" : "no_provider_key" });
  }

  const limit = Math.max(1, Math.min(MAX_IDS, Number(body.limit) || DEFAULT_LIMIT));
  const dryRun = body.dryRun === true;
  const budgetMs = Math.max(30000, Math.min(300000, Number(body.budgetMs) || DEFAULT_BUDGET_MS));
  const left = () => budgetMs - (Date.now() - t0);

  const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  /* ── which DONs ── */
  let todo = [];
  let scanned = 0;
  const wanted = [];
  if (Array.isArray(body.ids)) {
    for (const s of body.ids) {
      const v = String(s || "").trim();
      if (wanted.length >= MAX_IDS) break;
      if (SLUG_RE.test(v) && !wanted.includes(v)) wanted.push(v);
    }
  }
  if (wanted.length) {
    const dons = await donsByUrlName(wanted);
    scanned = dons.length;
    todo = await selectTodo(db, dons, limit);
  } else {
    for (let page = 0; page < MAX_SCAN_PAGES && todo.length < limit && left() > RESERVE_MS; page++) {
      const dons = await recentDons(page * PAGE);
      scanned += dons.length;
      todo.push(...await selectTodo(db, dons, limit - todo.length));
      if (dons.length < PAGE) break;
    }
  }

  if (dryRun) {
    return json({ examined: todo.length, extracted: 0, empty: 0, failed: 0, scanned, dryRun: true,
      ms: Date.now() - t0, model: cfg.model, provider: cfg.provider, tokens: { input: 0, output: 0 },
      ids: todo.map((t) => t.slug) });
  }

  /* ── ask, validate, write ── */
  let extracted = 0, empty = 0, failed = 0, examined = 0, tin = 0, tout = 0;
  let usedModel = cfg.model;
  const reasons = {};
  const note = (why) => { reasons[why] = (reasons[why] || 0) + 1; };

  for (const item of todo) {
    if (left() < RESERVE_MS) break;
    examined++;
    let value = null;

    if (!item.text) {
      /* WHO published this DON with no readable prose. That is an answer about the document, and
         it is recorded with the hash of the (empty) prose so it is not asked again for free. */
      note("no_prose");
      empty++;
    } else {
      const user = "TITLE: " + String(item.don.Title || "").slice(0, 300) + "\n\nREPORT:\n" + item.text;
      let out = null;
      try {
        out = await callProvider(cfg, EXTRACT_PROMPT, user, AbortSignal.timeout(Math.min(60000, left())));
      } catch (e) {
        /* ⚠ The provider's message names the model and the status; it is logged, never returned. */
        console.error("[who-don] provider", String((e && e.message) || e).slice(0, 200));
        failed++;
        note("provider_error");
        /* nothing was learned about this document — do NOT write a row, or a transient 429 would
           be frozen as "WHO states no total" until the report is rewritten. */
        continue;
      }
      tin += out.usage.in; tout += out.usage.out;
      usedModel = out.model;
      const parsed = parseExtract(out.text);
      if (!parsed.ok) {
        note(parsed.why);
        failed++;
        /* the model answered and the answer did not validate: that IS knowledge about this
           document (it was read and produced nothing usable), so the row is written with null
           counts and attempts+1 rather than re-asked next run. */
      } else {
        value = parsed.value;
        if (value.cases === null && value.deaths === null) empty++; else extracted++;
      }
    }

    const row = {
      url_name: item.slug,
      don_id: String(item.don.DonId || "").trim() || null,
      cases: value ? value.cases : null,
      deaths: value ? value.deaths : null,
      as_of: value ? value.asOf : null,
      scope: value ? value.scope : null,
      confidence: value ? value.confidence : null,
      model: item.text ? usedModel : null,
      provider: item.text ? cfg.provider : null,
      algorithm_version: ALGORITHM_VERSION,
      source_hash: item.hash,
      attempts: item.attempts + 1,
      extracted_at: new Date().toISOString(),
    };
    const { error } = await db.from(TABLE).upsert(row, { onConflict: "url_name" });
    if (error) throw new Error("db " + error.code);
  }

  return json({
    examined, extracted, empty, failed, scanned, queued: todo.length,
    ms: Date.now() - t0,
    model: usedModel, provider: cfg.provider,
    /* ⚠ the provider's OWN usage numbers, summed — not a token estimate. What this run cost is a
       fact the operator is entitled to, and an estimate is not that fact. */
    tokens: { input: tin, output: tout },
    reasons,
  });
}

/* ── entry ──────────────────────────────────────────────────────────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method === "GET") return await handleGet(req);
    if (req.method === "POST") return await handlePost(req);
    return json({ error: "method_not_allowed" }, 405, { allow: "GET, POST, OPTIONS" });
  } catch (e) {
    /* ⚠ THE EXCEPTION IS NEVER THE MESSAGE (CodeQL js/stack-trace-exposure) — a database error
       names columns and a fetch error names hosts. The caller gets a code. */
    console.error("[who-don]", String((e && e.message) || e).slice(0, 300));
    return relayFail(e, CORS);
  }
});
