// ============================================================================
//  IntMap · news-ingest — Source Registry から取り込み、出来事に載せる (#R351)
// ----------------------------------------------------------------------------
//  #R334 は器を作った。8 表・pgVector・RLS・pgTAP 123 件、そして 18 媒体 / 33 フィードの
//  Source Registry が本番に入っている。**しかし news_articles は 0 行だった**
//  （2026-08-23 実測）——中身を入れるものが無かったからである。これがそれ。
//
//  ⚠⚠ `refresh-news` と `current_news` を 1 バイトも触らない。あれは article mode の
//    fallback として生きており (docs/NEWS-EVENTS.md §4)、UI が今も読むのはそちらの経路
//    である。この関数は**別の表に**書く。Phase D まで、利用者に見える挙動は変わらない。
//
//  段（POST の body で選べる。既定は全部）:
//    fetch      33 フィードを取得 → 正規化 → 帰属 → 地点 → news_articles へ upsert
//    assign     未割り当ての記事を候補 Event へ増分で載せる（総当たりしない）
//    translate  Event の代表見出しを日本語へ（news_event_i18n に永続キャッシュ）
//    prune      記事 72 時間 / Event 30 日 / ★保存 Event は無期限
//  どの段も**壁時計の予算**を見て、足りなければそこで止めて次の run に残す。
//  ⚠ `refresh-news` は AbortSignal を 1 つも持っていない（上流が黙れば isolate ごと待つ）。
//    こちらは `_shared/relay-guard.js` の fetchGuarded で期限・バイト上限・content-type を掛ける。
//
//  Deploy:  supabase functions deploy news-ingest --project-ref vpekfwdpurzejrrmacac
//  Secrets: supabase secrets set NEWS_INGEST_SECRET=<random>   (REQUIRED — fail-closed)
//           # 日本語訳は ai-proxy / refresh-news と同じサーバー保持の鍵を使う
//           supabase secrets set AI_PROVIDER=anthropic         (anthropic | openai | gemini)
//           supabase secrets set ANTHROPIC_API_KEY=sk-ant-...  (or OPENAI_API_KEY / GEMINI_API_KEY)
//           supabase secrets set NEWS_TRANSLATE=off            (optional kill-switch)
//  (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
//
//  NOTE: written WITHOUT TypeScript annotations, like sv-cov / cable-geo / news-relay —
//  scripts/static-checks.mjs runs `node --check` over every committed .ts.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { fetchGuarded } from "../_shared/relay-guard.js";
// 地点解析は既存の決定論エンジン。⚠ 第二の実装を作らない——このファイルは
// js/newsgeo.js と 1 バイト同一で、同一性ゲートが scripts/static-checks.mjs §7 にある。
import "../_shared/newsgeo.js";
import { personaPrompt } from "../_shared/atlas-persona.js";
import {
  buildRegistry, parseFeed, toArticleRow, buildCandidateIndex, placeArticle,
  summariseEvent, clusterConfidence, sha256Hex, retentionCutoffs, RETENTION,
} from "../_shared/news-ingest.js";
import { DEFAULTS } from "../_shared/news-cluster.js";

const NEWSGEO = globalThis.IntMapNewsGeo || null;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-news-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALGORITHM_VERSION = 1;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const FEED_TIMEOUT_MS = 15000;
const FEED_MAX_BYTES = 6 * 1024 * 1024;
const FEED_LANES = 8;
/* 壁時計の既定。Edge Function の上限より十分手前で切り上げ、残りは次の run に回す。 */
const DEFAULT_BUDGET_MS = 240000;
/* PostgREST の 1 応答あたりの行数上限（既定 1000）。読み出しは必ずページで回す。 */
const PAGE = 1000;
const WRITE_CHUNK = 250;
/* 1 run に翻訳する Event の上限（費用の天井。docs/NEWS-EVENTS.md §14）。 */
const TRANSLATE_CAP = 80;
const TRANSLATE_BATCH = 20;

const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200, headers: { ...CORS, "Content-Type": "application/json" },
});

/* (#R138-style) 定数時間比較 — 秘密を 1 バイトずつ復元させない。 */
function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/* ── 読み書きの小道具 ────────────────────────────────────────────────────── */

/** PostgREST は 1 応答に PAGE 行しか返さない。**全部要るときは全部取りに行く。** */
async function selectAll(q, build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(q()).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function insertChunked(db, table, rows, opts) {
  const out = [];
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const chunk = rows.slice(i, i + WRITE_CHUNK);
    let q = db.from(table);
    q = opts && opts.onConflict ? q.upsert(chunk, { onConflict: opts.onConflict }) : q.insert(chunk);
    if (opts && opts.select) q = q.select(opts.select);
    const { data, error } = await q;
    if (error) throw new Error(table + ": " + error.message);
    if (data) out.push(...data);
  }
  return out;
}

/** 共有 URL と Atlas の参照が生き残る外向きの ID。merge しても変わらない。 */
function makePublicId() {
  return "e" + Date.now().toString(36) + crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

/* ── 段 1: 取得と正規化 ──────────────────────────────────────────────────── */
async function stageFetch(db, budget, runStartedAt) {
  const t0 = Date.now();
  const sources = await selectAll(() => db.from("news_sources"), (q) => q.select("*").eq("enabled", true));
  const feeds = await selectAll(() => db.from("news_source_feeds"), (q) => q.select("*").eq("enabled", true).order("id"));
  const registry = buildRegistry(sources);
  const live = new Set(sources.map((s) => s.id));
  const use = feeds.filter((f) => live.has(f.source_id));

  const rejects = {};
  const bump = (k) => { rejects[k] = (rejects[k] || 0) + 1; };
  const byFp = new Map();
  const feedState = [];
  let itemsFetched = 0, feedsOk = 0;
  const nowIso = new Date().toISOString();
  /* 72 時間より古い記事は保存しない (CONSTITUTION.md §5)。入れても prune が即消す。 */
  const cut = retentionCutoffs(Date.now());

  let next = 0;
  const lane = async () => {
    while (next < use.length && budget.left() > 15000) {
      const feed = use[next++];
      let items = [], err = null;
      try {
        const r = await fetchGuarded(feed.url, {
          timeoutMs: FEED_TIMEOUT_MS,
          maxBytes: FEED_MAX_BYTES,
          contentTypeRe: /xml|rss|text\//i,
          headers: {
            "user-agent": UA,
            accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
            "accept-language": "en",
          },
        });
        if (!r.ok) err = "http_" + r.status;
        else {
          const txt = r.text();
          /* ⚠ フィードでないものをフィードとして数えない（news-relay と同じ判定）。 */
          if (!(txt.includes("<rss") || txt.includes("<feed") || txt.includes("<rdf:RDF"))) err = "not_a_feed";
          else items = parseFeed(txt);
        }
      } catch (e) {
        err = (e && e.code) || "upstream_unreachable";
      }
      if (err) {
        feedState.push({ id: feed.id, last_error_at: nowIso, last_error: String(err).slice(0, 200) });
        continue;
      }
      feedsOk++;
      itemsFetched += items.length;
      feedState.push({ id: feed.id, last_success_at: nowIso, last_item_count: items.length, last_error: null });

      for (const it of items) {
        const out = await toArticleRow(it, feed, registry, NEWSGEO);
        if (!out.row) { bump(out.reject); continue; }
        if (out.row.published_at < cut.articles) { bump("older_than_window"); continue; }
        /* ⚠ 同じ run の中で同じ指紋を 2 行送ると
           「ON CONFLICT DO UPDATE command cannot affect row a second time」で
           **その chunk 全体が落ちる**。窓口で 1 本に畳む。 */
        if (byFp.has(out.row.url_fingerprint)) { bump("duplicate_in_batch"); continue; }
        byFp.set(out.row.url_fingerprint, out.row);
      }
    }
  };
  await Promise.all(Array.from({ length: FEED_LANES }, lane));

  /* フィードの鮮度は news_source_feeds が持つ（telemetry に写さない）。 */
  for (const st of feedState) {
    const { error } = await db.from("news_source_feeds").update(st).eq("id", st.id);
    if (error) console.warn("[news-ingest] feed state:", error.message);
  }

  const rows = [...byFp.values()];
  const saved = await insertChunked(db, "news_articles", rows,
    { onConflict: "url_fingerprint", select: "id,url_fingerprint,first_seen_at" });
  const fresh = saved.filter((r) => r.first_seen_at >= runStartedAt).length;

  return {
    ms: Date.now() - t0,
    feeds_total: use.length, feeds_ok: feedsOk, items_fetched: itemsFetched,
    articles_new: fresh, articles_seen: saved.length, rejects,
  };
}

/* ── 段 2: Event への増分割り当て ────────────────────────────────────────── */
const ARTICLE_COLS =
  "id,source_id,title,title_fingerprint,description,published_at,provider_category," +
  "subject_lng,subject_lat,subject_type,subject_name_en,subject_confidence,subject_reasons,entities," +
  "news_event_articles(event_id,relation,assignment_score)";

async function stageAssign(db, budget) {
  const t0 = Date.now();
  const sources = await selectAll(() => db.from("news_sources"), (q) => q.select("id,source_family"));
  const family = new Map(sources.map((s) => [s.id, s.source_family]));

  /* 記事は保持期間が 72 時間なので、`status='active'` の全部がそのまま窓である。 */
  const raw = await selectAll(() => db.from("news_articles"),
    (q) => q.select(ARTICLE_COLS).eq("status", "active").order("published_at", { ascending: true }));
  if (!raw.length) return { ms: Date.now() - t0, articles_assigned: 0, events_created: 0, events_updated: 0, evictions: 0, window: 0 };

  /* merge された Event は「行き先」に解決する。#R334 が merged_into を残したのは
     保存・共有 URL・Atlas の参照が古い ID から辿れるようにするため——
     **新しい記事を merge 済みの側に足してはならない。** */
  const evIds = new Set();
  for (const a of raw) for (const l of a.news_event_articles || []) if (l.event_id) evIds.add(l.event_id);
  const evMeta = new Map();
  if (evIds.size) {
    const ids = [...evIds];
    for (let i = 0; i < ids.length; i += PAGE) {
      const { data, error } = await db.from("news_events")
        .select("id,merged_into,status,manual_lock,category_override,location_override")
        .in("id", ids.slice(i, i + PAGE));
      if (error) throw new Error("news_events: " + error.message);
      for (const e of data || []) evMeta.set(e.id, e);
    }
  }
  const resolve = (id) => {
    let cur = id;
    for (let i = 0; i < 5; i++) {
      const m = evMeta.get(cur);
      if (!m || !m.merged_into) return cur;
      cur = m.merged_into;
    }
    return cur;
  };

  const arts = raw.map((a) => {
    const link = (a.news_event_articles || []).find((l) => l.relation === "same_event" || l.relation === "update");
    return {
      ...a,
      source_family: family.get(a.source_id) || a.source_id,
      tags: (a.entities && a.entities.tags) || [],
      event_id: link ? resolve(link.event_id) : null,
      _wasEvent: link ? resolve(link.event_id) : null,
      /* ⚠ 前の run で結ばれた辺の強さを DB から戻す。戻さないと、既存メンバーだけの
         Event を数え直したときに cluster_confidence が null に落ちる
         ——「確信が無い」ではなく「読み込んでいない」を保存することになる。 */
      _score: link && Number.isFinite(link.assignment_score) ? link.assignment_score : null,
    };
  });

  const index = buildCandidateIndex(arts);
  /* store は placeArticle() が読む形。既存の Event はそのまま、新しいものは負の仮 ID。 */
  const store = new Map();
  for (const a of index.arts) {
    if (!a.event_id) continue;
    let e = store.get(a.event_id);
    if (!e) store.set(a.event_id, (e = { members: [] }));
    e.members.push(a);
  }
  let temp = -1;
  const newEventId = () => temp--;

  const decisions = [];
  let evictions = 0, placed = 0;
  const perMs = [];
  for (const a of index.arts) {
    if (a.event_id) continue;
    if (budget.left() < 20000) break;
    const s = Date.now();
    const p = placeArticle(a, index, store, newEventId, DEFAULTS);
    perMs.push(Date.now() - s);
    placed++;
    if (p.evicted) evictions++;
    decisions.push({ article_id: a.id, place: p });
  }

  /* ── 書き出し ──
     ⚠ 最後にまとめて差分を取る。途中で書くと、同じ run の中で追い出された記事が
       DB に 2 回現れる（あるいは古い割り当てが残る）。 */
  const finalOf = new Map();
  for (const [eid, ev] of store) for (const m of ev.members) finalOf.set(m.id, eid);

  const created = [...store.keys()].filter((k) => k < 0);
  const realOf = new Map();
  if (created.length) {
    const rows = created.map((tid) => {
      const s = summariseEvent(store.get(tid).members, index.idf);
      return {
        public_id: makePublicId(),
        representative_article_id: s.representative_article_id,
        representative_title: s.representative_title,
        primary_category: s.primary_category,
        secondary_categories: s.secondary_categories,
        category_confidence: s.category_confidence,
        category_evidence: s.category_evidence,
        classifier_version: s.classifier_version,
        rep_lng: s.rep_lng, rep_lat: s.rep_lat, rep_place_name_en: s.rep_place_name_en,
        location_confidence: s.location_confidence, location_evidence: s.location_evidence,
        first_published_at: s.first_published_at, last_article_at: s.last_article_at,
        materially_updated_at: new Date().toISOString(),
        article_count: s.article_count, independent_source_count: s.independent_source_count,
        cluster_confidence: clusterConfidence(store.get(tid).members.map((m) => m._score)),
        algorithm_version: ALGORITHM_VERSION,
      };
    });
    const back = await insertChunked(db, "news_events", rows, { select: "id,public_id" });
    const byPub = new Map(back.map((r) => [r.public_id, r.id]));
    created.forEach((tid, i) => realOf.set(tid, byPub.get(rows[i].public_id)));
    /* 仮 ID を実 ID に置き換える（store も finalOf も、以降は実 ID だけを見る）。 */
    for (const tid of created) {
      const real = realOf.get(tid);
      if (real == null) continue;
      store.set(real, store.get(tid));
      store.delete(tid);
    }
    for (const [aid, eid] of finalOf) if (eid < 0) finalOf.set(aid, realOf.get(eid));
  }

  const wasOf = new Map(arts.map((a) => [a.id, a._wasEvent]));
  const moved = [...finalOf.entries()].filter(([aid, eid]) => wasOf.get(aid) !== eid && eid != null);
  /* 移った記事は古い所属を先に外す（1 記事 1 primary の部分 unique index があるため）。 */
  const relink = moved.filter(([aid]) => wasOf.get(aid) != null).map(([aid]) => aid);
  for (let i = 0; i < relink.length; i += WRITE_CHUNK) {
    const { error } = await db.from("news_event_articles")
      .delete().in("article_id", relink.slice(i, i + WRITE_CHUNK))
      .in("relation", ["same_event", "update"]);
    if (error) throw new Error("unlink: " + error.message);
  }

  const decByArticle = new Map(decisions.map((d) => [d.article_id, d.place]));
  const links = moved.map(([aid, eid]) => {
    const p = decByArticle.get(aid);
    const d = p && p.decision;
    return {
      event_id: eid, article_id: aid, relation: "same_event",
      assignment_score: d && d.assignment_score != null ? d.assignment_score : null,
      deterministic_features: (d && d.features) || null,
      assigned_by: "deterministic",
      decision_reason: (d && d.reasons) || (p && p.created ? "new event (no candidate matched)" : null),
      algorithm_version: ALGORITHM_VERSION,
    };
  });
  await insertChunked(db, "news_event_articles", links, { onConflict: "event_id,article_id" });

  /* ── 触れた Event を数え直す ── */
  const dirty = new Set();
  for (const [aid, eid] of moved) { dirty.add(eid); const w = wasOf.get(aid); if (w != null) dirty.add(w); }
  /* ⚠ **今この run で作った Event を数え直さない。** insert が完全な要約を持って書かれており、
     そのあと 1 件も足されていない。実測 (2026-08-23・本番): 外していたら 806 本の初回取り込みで
     **638 件の無駄な UPDATE 往復**が走り、割り当ての段が 15.1 秒かかっていた。 */
  const justCreated = new Set(realOf.values());
  let updated = 0;
  const updates = [];
  for (const eid of dirty) {
    if (eid < 0 || justCreated.has(eid)) continue;
    const ev = store.get(eid);
    const meta = evMeta.get(eid) || {};
    if (!ev || !ev.members.length) continue;
    const s = summariseEvent(ev.members, index.idf);
    const row = {
      id: eid,
      first_published_at: s.first_published_at,
      last_article_at: s.last_article_at,
      materially_updated_at: new Date().toISOString(),
      article_count: s.article_count,
      independent_source_count: s.independent_source_count,
      cluster_confidence: clusterConfidence(ev.members.map((m) => m._score)),
      updated_at: new Date().toISOString(),
    };
    /* ⚠ 運用者が直したものを自動処理が上書きしない (docs/NEWS-EVENTS.md §11)。
       manual_lock は「この Event はもう見た」の意味なので、**観測された事実（件数と時刻）
       だけ**を更新し、代表・分類・地点は人が決めた値のままにする。 */
    if (!meta.manual_lock) {
      row.representative_article_id = s.representative_article_id;
      row.representative_title = s.representative_title;
      if (!meta.category_override) {
        row.primary_category = s.primary_category;
        row.secondary_categories = s.secondary_categories;
        row.category_confidence = s.category_confidence;
        row.category_evidence = s.category_evidence;
        row.classifier_version = s.classifier_version;
      }
      if (!meta.location_override) {
        row.rep_lng = s.rep_lng; row.rep_lat = s.rep_lat;
        row.rep_place_name_en = s.rep_place_name_en;
        row.location_confidence = s.location_confidence;
        row.location_evidence = s.location_evidence;
      }
    }
    updates.push(row);
    updated++;
  }
  for (const row of updates) {
    const { id, ...rest } = row;
    const { error } = await db.from("news_events").update(rest).eq("id", id);
    if (error) console.warn("[news-ingest] event update:", error.message);
  }

  /* ── なぜその判定になったか（監査） ── */
  const audit = decisions.map((d) => {
    const p = d.place;
    const scores = (p.decision && p.decision.scores) || {};
    const real = {};
    for (const k of Object.keys(scores)) real[String(realOf.get(Number(k)) ?? k)] = scores[k];
    return {
      article_id: d.article_id,
      candidate_event_ids: ((p.decision && p.decision.candidates) || [])
        .map((x) => realOf.get(x) ?? x).filter((x) => x > 0),
      scores: real,
      chosen_event_id: finalOf.get(d.article_id) ?? null,
      relation: "same_event",
      deterministic_evidence: {
        created: p.created,
        evicted: p.evicted ? { article_id: p.evicted.article_id } : null,
        features: (p.decision && p.decision.features) || null,
        reasons: (p.decision && p.decision.reasons) || null,
      },
      algorithm_version: ALGORITHM_VERSION,
    };
  });
  await insertChunked(db, "news_cluster_decisions", audit);

  const q = (xs, p) => { const s = [...xs].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
  return {
    ms: Date.now() - t0, window: arts.length,
    articles_assigned: placed, events_created: created.length, events_updated: updated,
    evictions, per_article_p50: q(perMs, 0.5), per_article_p95: q(perMs, 0.95),
  };
}

/* ── 段 3: 日本語訳 ──────────────────────────────────────────────────────
 *  docs/NEWS-EVENTS.md §7: 一次措置は日本語のみ。サーバー側で生成して永続キャッシュ
 *  するので、クライアントの AI 枠を消費せず、未ログインでも読める。
 *  ⚠ 代表見出しは記事が増えると変わる。**変わったときだけ**払う（source_title_fp）。
 * ────────────────────────────────────────────────────────────────────── */

/* ⚠⚠⚠ **`AI_MODEL` を無条件に信じてはならない。** これは Atlas 用に設定された 1 つの secret で、
 *   9 本の Function が同じ値を読む。実測 (2026-08-23・本番): `AI_MODEL=gpt-5.6-terra` は
 *   このプロジェクトの鍵で **403** を返す。`ai-proxy` はそれを知っていて 403/404 のとき
 *   `gpt-5.6-luna` へ 1 回だけ retry する (#R148/#R150) ので Atlas は動き続ける。
 *   **`refresh-news` にはその retry が無い**——#R334 が測った「`analyzed_by='ai'` が
 *   1,651 行中 0 件」は、cron の不調でもモデルの質でもなく、これである。
 *   ⇒ ここでは ① 翻訳のモデルを `NEWS_TRANSLATE_MODEL` で**独立に**選べるようにし
 *     （見出しの翻訳に Atlas と同じ推論モデルを使う理由が無い）、② それでも 403/404 なら
 *     `ai-proxy` と同じ既知の代替へ 1 回だけ落ちる。 */
const OPENAI_FALLBACK_MODEL = "gpt-5.6-luna";

/* 日本語の見出しに入りうない書記体系（デーヴァナーガリー・アラビア・ヘブライ・タイ・
 * ベンガル・タミル・テルグ）。外国の人名・地名はカタカナかラテン文字で書かれるので、
 * これらが混ざっているのは訳ではなく模型の事故である。 */
const WRONG_SCRIPT = /[ऀ-ॿ؀-ۿ֐-׿฀-๿ঀ-৿஀-௿ఀ-౿]/;

function aiConfig() {
  if ((Deno.env.get("NEWS_TRANSLATE") || "").toLowerCase() === "off") return null;
  let provider = (Deno.env.get("AI_PROVIDER") || "").toLowerCase();
  if (!provider) {
    if (Deno.env.get("ANTHROPIC_API_KEY")) provider = "anthropic";
    else if (Deno.env.get("OPENAI_API_KEY")) provider = "openai";
    else if (Deno.env.get("GEMINI_API_KEY")) provider = "gemini";
  }
  const pick = (fallback) => Deno.env.get("NEWS_TRANSLATE_MODEL") || Deno.env.get("AI_MODEL") || fallback;
  if (provider === "openai") { const key = Deno.env.get("OPENAI_API_KEY"); if (key) return { provider, key, model: pick(OPENAI_FALLBACK_MODEL) }; }
  if (provider === "gemini") { const key = Deno.env.get("GEMINI_API_KEY"); if (key) return { provider, key, model: pick("gemini-2.0-flash") }; }
  if (provider === "anthropic") { const key = Deno.env.get("ANTHROPIC_API_KEY"); if (key) return { provider, key, model: pick("claude-3-5-haiku-latest") }; }
  return null;
}

/* (#R285) 人格の正本は js/atlas-persona.js の 1 本だけ。ここでも書き足さない。
   この呼び出しは利用者に読まれる文（見出しの訳）を作るが、対話ではないので internal。 */
const TRANSLATE_SYS = personaPrompt("translating world-news headlines into Japanese for IntMap", { mode: "internal" }) +
  "Translate each numbered English news headline into natural Japanese. " +
  "RULES: (1) Keep it a HEADLINE — no trailing period, no added commentary, no explanation. " +
  "(2) Do not add facts the English headline does not state, and do not drop named people, places, organisations or numbers. " +
  "(3) Keep proper nouns in their established Japanese form where one exists; otherwise keep the Latin spelling. " +
  "(4) Translate EVERY item you are given, and return the SAME id for each. " +
  "Reply with ONLY a JSON array: [{\"i\":<id>,\"ja\":\"<Japanese headline>\"}]. No commentary, no code fences.";

async function callProvider(cfg, sys, user, signal, _isFallback) {
  if (cfg.provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", signal,
      headers: { Authorization: "Bearer " + cfg.key, "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.model, instructions: sys, input: [{ role: "user", content: [{ type: "input_text", text: user }] }], max_output_tokens: 3000, reasoning: { effort: "low" }, store: false }),
    });
    if (!r.ok) {
      /* 設定されたモデルにこのプロジェクトの鍵が届かない (403/404 model_not_found)。
         ai-proxy と同じ 1 回だけの retry。⚠ 再帰しないよう _isFallback で止める。 */
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
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: user }] }], systemInstruction: { parts: [{ text: sys }] }, generationConfig: { temperature: 0, maxOutputTokens: 3000 } }),
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
    body: JSON.stringify({ model: cfg.model, max_tokens: 3000, system: sys, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error("anthropic " + r.status);
  const j = await r.json();
  return {
    text: (j?.content || []).map((b) => b.text || "").join(""),
    usage: { in: j?.usage?.input_tokens || 0, out: j?.usage?.output_tokens || 0 },
    model: cfg.model,
  };
}

/* 見積のための概算単価（Haiku 級 / $ per 1M tokens）。実額は請求が正本で、
   これは「今日いくら使ったか」を桁で知るための計器である。 */
const PRICE = { in: 1.0, out: 5.0 };

async function stageTranslate(db, budget) {
  const t0 = Date.now();
  const cfg = aiConfig();
  if (!cfg) return { ms: Date.now() - t0, translations: 0, skipped: "not_configured" };

  /* ⚠ ここは selectAll を使わない（range と limit を同時に掛けると矛盾する）。
     新しく動いた Event から順に、1 ページぶんだけ見れば TRANSLATE_CAP には十分足りる。 */
  const { data: events, error: evErr } = await db.from("news_events")
    .select("id,representative_title,news_event_i18n(lang,source_title_fp)")
    .eq("status", "active")
    .order("materially_updated_at", { ascending: false, nullsFirst: false })
    .range(0, PAGE - 1);
  if (evErr) throw new Error("news_events: " + evErr.message);

  const todo = [];
  for (const e of events || []) {
    if (!e.representative_title) continue;
    const fp = await sha256Hex(e.representative_title);
    const ja = (e.news_event_i18n || []).find((x) => x.lang === "ja");
    if (ja && ja.source_title_fp === fp) continue;
    todo.push({ id: e.id, title: e.representative_title, fp });
    if (todo.length >= TRANSLATE_CAP) break;
  }
  if (!todo.length) return { ms: Date.now() - t0, translations: 0 };

  let tin = 0, tout = 0, usedModel = cfg.model, badScript = 0;
  const rows = [];
  /* ⚠⚠⚠ **黙って 0 件になる AI 経路を、もう一度作らない。** #R334 の実測: `refresh-news` の
     AI 地点解析は本番 1,651 行に対して `analyzed_by='ai'` を **1 件も**産出していなかった
     ——cron は健全で、例外は握り潰され、どこにも「なぜ 0 件か」が残っていなかった。
     ここでは最後の失敗を持ち帰り、応答と telemetry の両方に出す。 */
  let lastError = null;
  for (let i = 0; i < todo.length; i += TRANSLATE_BATCH) {
    if (budget.left() < 30000) break;
    const chunk = todo.slice(i, i + TRANSLATE_BATCH);
    const user = "Headlines:\n" + chunk.map((c) => c.id + ". " + c.title).join("\n");
    let out;
    try {
      out = await callProvider(cfg, TRANSLATE_SYS, user, AbortSignal.timeout(Math.min(60000, budget.left())));
    } catch (e) {
      lastError = String((e && e.message) || e).slice(0, 200);
      console.warn("[news-ingest] translate:", lastError);
      continue;
    }
    tin += out.usage.in; tout += out.usage.out;
    usedModel = out.model || cfg.model;   /* fallback が効いたなら、記録するのは実際に答えたモデル */
    let arr = [];
    try {
      const txt = (out.text || "").replace(/```json/gi, "").replace(/```/g, "");
      const lo = txt.indexOf("["), hi = txt.lastIndexOf("]");
      if (lo < 0 || hi < lo) {
        lastError = "no_json_array_in_reply len=" + (out.text || "").length;
        continue;
      }
      arr = JSON.parse(txt.slice(lo, hi + 1));
    } catch (e) {
      lastError = "unparsable_reply: " + String((e && e.message) || e).slice(0, 120);
      continue;
    }
    /* ⚠ **モデルの返答をそのまま採らない。** id が今回渡したものであること、文字列であること、
       空でないこと、長すぎないことをサーバー側で確かめる (docs/NEWS-EVENTS.md §5.2 と同じ規律)。 */
    const want = new Map(chunk.map((c) => [c.id, c]));
    for (const e of Array.isArray(arr) ? arr : []) {
      const id = Number(e && e.i);
      const ja = typeof (e && e.ja) === "string" ? e.ja.trim() : "";
      const c = want.get(id);
      if (!c || !ja || ja.length > 400) continue;
      /* ⚠ **書記体系が混ざった訳は採らない。** 実測 (2026-08-23・79 件): 1 件が
         「101 रन のリード」——`run` がデーヴァナーガリーで返っていた。日本語の見出しに
         これらの文字が出ることは無いので、機械的に落とせる。訳が付かなかった Event は
         次の run でもう一度候補になる（英語の見出しが出るだけで、壊れた訳は残らない）。 */
      if (WRONG_SCRIPT.test(ja)) { badScript++; continue; }
      rows.push({
        event_id: id, lang: "ja", title: ja,
        translator: cfg.provider + ":" + usedModel,
        translated_at: new Date().toISOString(),
        source_title_fp: c.fp,
      });
      want.delete(id);
    }
  }
  if (rows.length) await insertChunked(db, "news_event_i18n", rows, { onConflict: "event_id,lang" });
  return {
    ms: Date.now() - t0, translations: rows.length, considered: todo.length,
    error: lastError, rejected_wrong_script: badScript,
    llm_tokens_in: tin, llm_tokens_out: tout,
    estimated_cost_usd: Math.round(((tin * PRICE.in + tout * PRICE.out) / 1e6) * 1e6) / 1e6,
    provider: cfg.provider, model: usedModel, configured_model: cfg.model,
  };
}

/* ── 段 4: 保持期間 ──────────────────────────────────────────────────────
 *  docs/NEWS-EVENTS.md §8 / CONSTITUTION.md §5:
 *    記事 72 時間 ／ Event 30 日 ／ ★保存した Event は無期限 ／ 判定の記録 30 日。
 *  ⚠ **消してよいのは記事だけで、出来事ではない。** Event を記事と同じ 72 時間で消すと、
 *    ★保存も共有 URL も Atlas の参照も merge/split の履歴も 72 時間で失われる。
 *  ⚠ **merge の redirect は消さない。** `status='merged'` の行と、他の行の `merged_into` が
 *    指している行は、古い ID から新しい ID へ辿るための道そのものである。
 * ────────────────────────────────────────────────────────────────────── */
async function stagePrune(db) {
  const t0 = Date.now();
  const cut = retentionCutoffs(Date.now());
  const out = { ms: 0, pruned_articles: 0, pruned_events: 0, pruned_decisions: 0 };

  /* ⚠ 消した行そのものは要らない——要るのは件数である。`select('id')` にすると
     数千行を Edge Function まで運ぶことになる。 */
  const a = await db.from("news_articles").delete({ count: "exact" }).lt("published_at", cut.articles);
  if (a.error) console.warn("[news-ingest] prune articles:", a.error.message);
  else out.pruned_articles = a.count || 0;

  const d = await db.from("news_cluster_decisions").delete({ count: "exact" }).lt("created_at", cut.decisions);
  if (d.error) console.warn("[news-ingest] prune decisions:", d.error.message);
  else out.pruned_decisions = d.count || 0;

  /* Event は 3 つの理由で守られる: ★保存されている / merge の行き先である / 自身が merged。 */
  const old = await selectAll(() => db.from("news_events"),
    (q) => q.select("id").eq("status", "active").is("merged_into", null).lt("last_article_at", cut.events));
  if (old.length) {
    const ids = old.map((e) => e.id);
    const keep = new Set();
    for (let i = 0; i < ids.length; i += PAGE) {
      const slice = ids.slice(i, i + PAGE);
      const s = await db.from("saved_news_events").select("event_id").in("event_id", slice);
      for (const r of s.data || []) keep.add(r.event_id);
      const m = await db.from("news_events").select("merged_into").in("merged_into", slice);
      for (const r of m.data || []) keep.add(r.merged_into);
    }
    const drop = ids.filter((x) => !keep.has(x));
    for (let i = 0; i < drop.length; i += WRITE_CHUNK) {
      const r = await db.from("news_events").delete({ count: "exact" }).in("id", drop.slice(i, i + WRITE_CHUNK));
      if (r.error) console.warn("[news-ingest] prune events:", r.error.message);
      else out.pruned_events += r.count || 0;
    }
  }
  out.ms = Date.now() - t0;
  return out;
}

/* ── 入口 ────────────────────────────────────────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  /* GET はやらせない: 秘密が URL（＝アクセスログ）に載りうるし、この仕事は
     取得と有料の翻訳と service_role の書き込みを伴う（refresh-news と同じ理由）。 */
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("NEWS_INGEST_SECRET") || "";
  if (!secret) {
    return json({ error: "not_configured", message: "news-ingest is disabled: NEWS_INGEST_SECRET is not set." }, 503);
  }
  const got = req.headers.get("x-news-ingest-secret") || "";
  if (!got || !timingSafeEqual(got, secret)) return json({ error: "unauthorized" }, 401);

  let body = {};
  try { body = await req.json(); } catch (_) { body = {}; }
  const want = Array.isArray(body.stages) && body.stages.length
    ? body.stages.filter((s) => ["fetch", "assign", "translate", "prune"].includes(s))
    : ["fetch", "assign", "translate", "prune"];

  const budgetMs = Math.max(30000, Math.min(300000, Number(body.budgetMs) || DEFAULT_BUDGET_MS));
  const start = Date.now();
  const budget = { left: () => budgetMs - (Date.now() - start) };
  const startedAt = new Date(start).toISOString();

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const result = { stages: want, retention: RETENTION };
  let ok = true;
  try {
    if (want.includes("fetch")) result.fetch = await stageFetch(db, budget, startedAt);
    if (want.includes("assign")) result.assign = await stageAssign(db, budget);
    if (want.includes("translate")) result.translate = await stageTranslate(db, budget);
    if (want.includes("prune")) result.prune = await stagePrune(db);
  } catch (e) {
    ok = false;
    result.error = String((e && e.message) || e).slice(0, 300);
    console.error("[news-ingest]", result.error);
  }

  /* ── 計測 (docs/NEWS-EVENTS.md §13) ── */
  const f = result.fetch || {}, g = result.assign || {}, t = result.translate || {}, p = result.prune || {};
  try {
    await db.from("news_ingest_runs").insert({
      started_at: startedAt, finished_at: new Date().toISOString(), stages: want, ok,
      feeds_total: f.feeds_total || 0, feeds_ok: f.feeds_ok || 0, items_fetched: f.items_fetched || 0,
      articles_new: f.articles_new || 0, articles_seen: f.articles_seen || 0, rejects: f.rejects || {},
      articles_assigned: g.articles_assigned || 0, events_created: g.events_created || 0,
      events_updated: g.events_updated || 0, evictions: g.evictions || 0,
      translations: t.translations || 0, llm_tokens_in: t.llm_tokens_in || 0,
      llm_tokens_out: t.llm_tokens_out || 0, estimated_cost_usd: t.estimated_cost_usd || 0,
      pruned_articles: p.pruned_articles || 0, pruned_events: p.pruned_events || 0,
      pruned_decisions: p.pruned_decisions || 0,
      timings: {
        total_ms: Date.now() - start, fetch_ms: f.ms || 0, assign_ms: g.ms || 0,
        translate_ms: t.ms || 0, prune_ms: p.ms || 0,
        assign_p50_ms: g.per_article_p50 || 0, assign_p95_ms: g.per_article_p95 || 0,
      },
      notes: {
        window: g.window || 0, translate_considered: t.considered || 0,
        translate_skipped: t.skipped || null, translate_error: t.error || null,
        translate_rejected_wrong_script: t.rejected_wrong_script || 0,
        /* ⚙ 単価は推定であって請求ではない。使った単価を一緒に残すと、
           あとから「どの数字を信じていいか」を言える。 */
        cost_rate_usd_per_mtok: PRICE,
        provider: t.provider || null, model: t.model || null,
        budget_ms: budgetMs, budget_left_ms: budget.left(), error: result.error || null,
      },
      algorithm_version: ALGORITHM_VERSION,
    });
  } catch (e) {
    console.warn("[news-ingest] telemetry:", (e && e.message) || e);
  }

  result.ok = ok;
  result.total_ms = Date.now() - start;
  return json(result, ok ? 200 : 500);
});
