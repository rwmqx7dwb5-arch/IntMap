/* ============================================================================
 *  news-events-eval.mjs — 出来事パイプラインを**実データで**測る (#R351)
 * ----------------------------------------------------------------------------
 *  docs/NEWS-EVENTS.md §13 は「実装前に baseline を測り、実装後も同じ corpus で比較する」
 *  と決めている。このスクリプトはその測定器で、**本番の Edge Function と同じ論理**を
 *  同じファイルから import して回す——評価だけが別の実装を持つと、測ったものと動くものが
 *  別になる（#R334 が「fixture の精度は精度の測定になっていない」で踏んだ形の一般形）。
 *
 *  ⚠ **`clusterArticles()` では測らない。** あれは総当たりで、本番は候補生成 →
 *    `pairVerdict` の増分である。測るのは本番が通る経路のほう。
 *
 *  使い方:
 *      node scripts/news-events-eval.mjs --fetch --cache <path>   # 33 フィードを取得して保存
 *      node scripts/news-events-eval.mjs --cache <path>           # 保存済みで測り直す
 *      node scripts/news-events-eval.mjs --cache <p> --dump 3     # n>=3 の塊を全部出す（目視用）
 *      node scripts/news-events-eval.mjs --cache <p> --json <p2>  # 全結果を JSON で
 *      node scripts/news-events-eval.mjs --from-db --dump 3       # **本番が実際に作った Event** を読む
 *      node scripts/news-events-eval.mjs --from-db --link          # `link` 段が**何を結ぶか**を、結ぶ前に読む
 *      node scripts/news-events-eval.mjs --from-db --diffs         # 媒体間で食い違っている数量を全部出す
 *
 *  ⚠ `--from-db` は「もう一度計算し直した結果」ではなく **本番の表そのもの**を測る。
 *    パイプラインの検算（同じ入力で同じ答えが出るか）は上の経路、**出荷されている物の
 *    品質**を測るのはこちらである。#R333 の教訓——リポジトリを自分自身と比べる検査は、
 *    本番が壊れていても緑を再現する。
 *
 *  ⚠ registry（18 媒体 / 33 フィード）は**本番の表から**読む。seed SQL を再解析すると
 *    「本番がいま何を収集しているか」ではなく「migration が何を主張したか」を測ることになる。
 * ========================================================================== */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import '../supabase/functions/_shared/newsgeo.js';
import {
  parseFeed, buildRegistry, toArticleRow, buildCandidateIndex, attachEvent,
  placeArticle, summariseEvent, clusterConfidence, eventPairCandidates, eventsAgree, INDEX,
} from '../supabase/functions/_shared/news-ingest.js';
import { buildIdf, tokenise, DEFAULTS } from '../supabase/functions/_shared/news-cluster.js';
/* (#R394) 「媒体間で食い違っている数量」の規則。⚠ **UI が使うのと同じ 1 本**——
   #R386 はこれを js/news-events.js の factory の奥に書いたので、ブラウザの外から
   誰も呼べず、歩留まりも精度も測れなかった。 */
import { makeNewsClaims } from '../js/news-claims.js';

const SUPA = 'https://vpekfwdpurzejrrmacac.supabase.co';
const ANON = 'sb_publishable_yI9Rf2s4nzrIuqFyUq4OOA_h83PrRd0';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const val = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const CACHE = val('--cache', null);
const DUMP = Number(val('--dump', 0)) || 0;
const JSONOUT = val('--json', null);

async function rest(path) {
  const r = await fetch(SUPA + '/rest/v1/' + path, { headers: { apikey: ANON } });
  if (!r.ok) throw new Error('rest ' + r.status + ' ' + path);
  return r.json();
}

async function fetchFeed(feed) {
  const t0 = Date.now();
  try {
    const r = await fetch(feed.url, {
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8' },
      signal: AbortSignal.timeout(25000),
      redirect: 'follow',
    });
    const txt = await r.text();
    if (!r.ok) return { feed, ms: Date.now() - t0, status: r.status, xml: '', error: 'http_' + r.status };
    if (!(txt.includes('<rss') || txt.includes('<feed') || txt.includes('<rdf:RDF'))) {
      return { feed, ms: Date.now() - t0, status: r.status, xml: '', error: 'not_a_feed' };
    }
    /* ⚠ **解析結果ではなく生の XML を保存する。** 解析器を直したあとに同じ corpus で
       測り直せないと、「直したら良くなった」を言うたびに別のデータで比べることになる。 */
    return { feed, ms: Date.now() - t0, status: r.status, xml: txt, error: null };
  } catch (e) {
    return { feed, ms: Date.now() - t0, status: 0, xml: '', error: String((e && e.name) || e).slice(0, 40) };
  }
}

async function collect() {
  const [sources, feeds] = await Promise.all([
    rest('news_sources?select=*'),
    rest('news_source_feeds?select=*&order=id'),
  ]);
  const enabledSources = new Set(sources.filter((s) => s.enabled).map((s) => s.id));
  const use = feeds.filter((f) => f.enabled && enabledSources.has(f.source_id));
  const results = [];
  const LANES = 8;
  let next = 0;
  await Promise.all(Array.from({ length: LANES }, async () => {
    while (next < use.length) results.push(await fetchFeed(use[next++]));
  }));
  return { at: new Date().toISOString(), sources, feeds, results };
}

/* ── --from-db: 本番が実際に作った Event をそのまま読む ───────────── */
async function restPaged(pathBase) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(SUPA + '/rest/v1/' + pathBase, {
      headers: { apikey: ANON, Range: from + '-' + (from + 999) },
    });
    if (!r.ok) throw new Error('rest ' + r.status + ' ' + pathBase);
    const page = await r.json();
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

if (flag('--from-db')) {
  const [sources, events, articles] = await Promise.all([
    rest('news_sources?select=id,source_family'),
    restPaged('news_events?select=id,public_id,representative_title,primary_category,category_confidence,category_evidence,rep_lng,rep_lat,rep_place_name_en,location_confidence,location_evidence,first_published_at,last_article_at,article_count,independent_source_count,cluster_confidence,status&status=eq.active&order=id'),
    restPaged('news_articles?select=id,source_id,title,description,embedding_model,published_at,provider_category,subject_lng,subject_lat,subject_type,subject_name_en,subject_confidence,subject_reasons,canonical_url,news_event_articles(event_id,relation,assignment_score,assigned_by)&status=eq.active&order=id'),
  ]);
  const fam = new Map(sources.map((s) => [s.id, s.source_family]));
  const byEvent = new Map(events.map((e) => [e.id, { ...e, _members: [] }]));
  let orphan = 0;
  for (const a of articles) {
    const link = (a.news_event_articles || []).find((l) => l.relation === 'same_event' || l.relation === 'update');
    if (!link) { orphan++; continue; }
    const e = byEvent.get(link.event_id);
    if (!e) { orphan++; continue; }
    e._members.push({ ...a, source_family: fam.get(a.source_id) || a.source_id });
  }
  const list = [...byEvent.values()].sort((x, y) => y.article_count - x.article_count);
  const pct2 = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);
  const cats = {};
  for (const e of list) cats[e.primary_category] = (cats[e.primary_category] || 0) + 1;
  const line2 = (t) => process.stdout.write(t + '\n');
  line2('');
  line2('IntMap · news events — **本番の表**をそのまま測る');
  line2('');
  line2('  記事        ' + articles.length + '件（どの Event にも属さない ' + orphan + '）');
  line2('  Event       ' + list.length + '件 · 圧縮 ' + (list.length ? Math.round((articles.length / list.length) * 100) / 100 : 0) + '倍 · 最大 ' + (list[0] ? list[0].article_count : 0));
  line2('              単独 ' + list.filter((e) => e.article_count === 1).length +
        ' · 独立2媒体以上 ' + list.filter((e) => e.independent_source_count >= 2).length +
        ' · 3媒体以上 ' + list.filter((e) => e.independent_source_count >= 3).length);
  line2('              地点あり ' + pct2(list.filter((e) => e.rep_lng != null).length, list.length) + '%' +
        ' · 記事側の地点あり ' + pct2(articles.filter((a) => a.subject_lng != null).length, articles.length) + '%');
  line2('              カテゴリ: ' + Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · '));
  const byWho = {};
  for (const e of list) { const w = (e.category_evidence && e.category_evidence.by) || 'none'; byWho[w] = (byWho[w] || 0) + 1; }
  line2('              分類を決めた段: ' + Object.entries(byWho).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · '));
  line2('');

  /* ══ (#R394) 監査の整合性 — 走っていない機構の名前が入っていないか ═══════════════
     ⚠⚠⚠ **実測 (2026-08-24): 埋め込みを持つ記事は 0 行なのに、`assigned_by='embedding'`
       の辺が 23 本あった。** `news_event_merge_into` が機械の merge に無条件でその名前を
       書いていたためで、#R386 が入れた 1 行である。#R334 がこの列に 4 値を置いたのは
       「どの段が何件を運んだか」を数えられるようにするためだから、走っていない機構の
       名前が入っていると、その列は情報ではなく**嘘**を持つ。
     ⇒ 数える側をここに置く。**この行が 0 でなくなった日が、また同じことが起きた日である。** */
  {
    const byWho = {};
    let liar = 0;
    for (const a of articles) {
      for (const l of (a.news_event_articles || [])) {
        if (l.relation !== 'same_event' && l.relation !== 'update') continue;
        const w = l.assigned_by || 'null';
        byWho[w] = (byWho[w] || 0) + 1;
        if (w === 'embedding' && !a.embedding_model) liar++;
      }
    }
    const embedded = articles.filter((a) => a.embedding_model).length;
    line2('  何が結んだか: ' + Object.entries(byWho).sort((x, y) => y[1] - x[1]).map(([k, v]) => k + ' ' + v).join(' · '));
    line2('  埋め込みを持つ記事: ' + embedded + ' / ' + articles.length);
    line2('  ⚠ 走っていない機構を名乗る辺: ' + liar + (liar ? '   ← 0 でなければならない' : ''));
    line2('');
  }
  if (DUMP) {
    line2('── n>=' + DUMP + ' の塊（目視で「1 つの出来事か」を判定する）──');
    for (const e of list.filter((x) => x.article_count >= DUMP)) {
      line2('');
      line2('#' + e.id + '  n=' + e.article_count + ' src=' + e.independent_source_count +
            ' cat=' + e.primary_category + '(' + e.category_confidence + '/' + ((e.category_evidence || {}).by || '-') + ')' +
            ' geo=' + (e.rep_place_name_en || '—') + ' conf=' + e.cluster_confidence);
      line2('   代表: ' + e.representative_title);
      for (const m of e._members) line2('     · [' + m.source_id + '] ' + m.title);
    }
    line2('');
  }
  /* ── `link` 段の空撃ち（Phase C）────────────────────────────────────────
     ⚠⚠⚠ **結ぶ前に読む。** 塊どうしを結ぶ操作は、間違えると #R76 の 43 件クラスタと
       同じ壊れ方を**本番の表の上で**作る。`docs/NEWS-EVENTS.md` §13 が「実装前に
       baseline を測り、実装後も同じ corpus で比較する」と決めているのはこのためである。
     ⚠ ここが呼ぶのは Edge Function が呼ぶのと**同じ 2 つの関数**
       （`eventPairCandidates` / `eventsAgree`）。測るものと動くものを別にしない。 */
  /* ── 媒体間で食い違っている数量（#R394）────────────────────────────────
     ⚠⚠⚠ **これが無かったので、#R386 は歩留まりを 0 件だと思い込んでいた。** 実際には
       ブラウザに載る直近 200 件の外に 2 件あり、しかも**そのうち 1 件は誤り**だった
       （香港の上場: Shein の IPO と Alibaba の売出が同じ Event に入っており、別々の
       数字が「媒体の食い違い」として並んでいた）。規則をモジュールへ出したので、
       ここが同じ 1 本を本番のデータで測る。 */
  if (flag('--diffs')) {
    const CLAIMS = makeNewsClaims();
    const famOf = new Map(sources.map((x) => [x.id, x.source_family || x.id]));
    let withQty = 0, qty = 0, hits = 0;
    const lines = [];
    for (const e of list) {
      const ms = e._members.map((m) => ({
        title: m.title, description: m.description || '',
        source: m.source_id, family: famOf.get(m.source_id) || m.source_id,
      }));
      const q = ms.reduce((n, m) => n + CLAIMS.quantities(m.title + ' — ' + m.description).length, 0);
      qty += q;
      if (q) withQty++;
      const d = CLAIMS.differences(ms);
      if (!d.length) continue;
      hits++;
      lines.push('#' + e.id + '  ' + String(e.representative_title).slice(0, 66)
        + '   [' + ms.length + ' articles / ' + e.independent_source_count + ' outlets]');
      for (const x of d) {
        const vals = x.claims.map((c) => c.value);
        const ratio = Math.min(...vals) / Math.max(...vals);
        lines.push('   ' + x.kind + '  (min/max ' + ratio.toFixed(3) + ')');
        for (const c of x.claims) lines.push('     [' + c.source + '] "' + c.text + '"   …' + c.context + '…');
      }
      lines.push('');
    }
    line2('── 媒体間で食い違っている数量 ──');
    line2('  events                    ' + list.length);
    line2('  carrying any quantity     ' + withQty + ' (' + qty + ' quantities)');
    line2('  WITH A DISAGREEMENT       ' + hits);
    line2('  same-quantity ratio       ' + CLAIMS.DEFAULTS.sameQuantityRatio + '  (2 つの値が同じ量の別々の説明でありうる下限)');
    line2('');
    for (const l of lines) line2(l);
  }

  if (flag('--link')) {
    const membersOf = new Map();
    for (const e of list) if (e._members.length) membersOf.set(e.id, e._members);
    const idf = buildIdf(articles.map((a) => ({ title: a.title })));
    const cands = eventPairCandidates(membersOf, idf, INDEX, Number(val('--link-cap', 400)));
    const titleOf = (id) => (byEvent.get(id) || {}).representative_title || '?';
    let would = 0;
    line2('── `link` 段の空撃ち — 候補 ' + cands.length + ' 対 / Event ' + membersOf.size + ' 件 ──');
    line2('');
    for (const c of cands) {
      const ma = membersOf.get(c.event_a) || [], mb = membersOf.get(c.event_b) || [];
      if (!ma.length || !mb.length) continue;
      const v = eventsAgree(ma, mb, idf, DEFAULTS, null, INDEX.maxMembers);
      if (!v.same) continue;
      would++;
      line2('MERGE  #' + c.event_a + ' (n=' + ma.length + ')  ←→  #' + c.event_b + ' (n=' + mb.length + ')' +
            '   share ' + v.share + ' (' + v.matched + '/' + v.pairs + ')  w=' + c.weight +
            (v.top ? '  via ' + v.top.code + ' j=' + v.top.j + ' geo=' + v.top.geo + (v.top.km == null ? '' : ' ' + v.top.km + 'km') : ''));
      line2('   A: ' + titleOf(c.event_a));
      for (const m of ma) line2('      · [' + m.source_id + '] ' + m.title);
      line2('   B: ' + titleOf(c.event_b));
      for (const m of mb) line2('      · [' + m.source_id + '] ' + m.title);
      line2('');
    }
    line2('→ ' + would + ' 対が結ばれる（候補 ' + cands.length + ' 対のうち）');
    line2('');
  }
  if (JSONOUT) { mkdirSync(dirname(JSONOUT), { recursive: true }); writeFileSync(JSONOUT, JSON.stringify({ events: list, orphan }, null, 1)); line2('JSON → ' + JSONOUT); }
  process.exit(0);
}

/* ── 取得 or 読み出し ─────────────────────────────────────────────────────── */
let snap;
if (flag('--fetch') || !CACHE || !existsSync(CACHE)) {
  process.stderr.write('fetching feeds…\n');
  snap = await collect();
  if (CACHE) { mkdirSync(dirname(CACHE), { recursive: true }); writeFileSync(CACHE, JSON.stringify(snap)); }
} else {
  snap = JSON.parse(readFileSync(CACHE, 'utf8'));
}

const GEO = globalThis.IntMapNewsGeo;
const registry = buildRegistry(snap.sources);

/* ── ① 正規化と帰属 ───────────────────────────────────────────────────────── */
const feedReport = [];
const rows = [];
const rejects = new Map();
const seenFp = new Map();
let dupInBatch = 0;

for (const r of snap.results) {
  let accepted = 0;
  const rej = {};
  r.items = r.xml ? parseFeed(r.xml) : (r.items || []);
  for (const it of r.items) {
    const out = await toArticleRow(it, r.feed, registry, GEO);
    if (!out.row) {
      rej[out.reject] = (rej[out.reject] || 0) + 1;
      rejects.set(out.reject, (rejects.get(out.reject) || 0) + 1);
      continue;
    }
    if (seenFp.has(out.row.url_fingerprint)) { dupInBatch++; continue; }
    seenFp.set(out.row.url_fingerprint, out.row);
    out.row.id = rows.length + 1;
    out.row._feed = r.feed.url;
    out.row._attribution = out.attribution;
    rows.push(out.row);
    accepted++;
  }
  feedReport.push({
    url: r.feed.url, source: r.feed.source_id, category: r.feed.category,
    collection: r.feed.collection, ms: r.ms, status: r.status, error: r.error,
    items: r.items.length, accepted, rejected: rej,
  });
}

/* 実データの窓に合わせる: 72 時間より古い記事は保存しない (CONSTITUTION.md §5)。 */
const NOW = Date.parse(snap.at);
const WINDOW_H = 72;
const fresh = rows.filter((a) => NOW - Date.parse(a.published_at) <= WINDOW_H * 3600e3 &&
                                  Date.parse(a.published_at) <= NOW + 6 * 3600e3);
const tooOld = rows.length - fresh.length;

/* source_family を配る（独立媒体数はここで数える単位）。 */
const famOf = new Map(snap.sources.map((s) => [s.id, s.source_family]));
for (const a of fresh) a.source_family = famOf.get(a.source_id) || a.source_id;

/* ── ② 増分割り当て（本番と同じ経路） ────────────────────────────────────── */
/* ⚠ 本番の窓は「直近 48 時間の記事全部」。ここも同じにする。 */
const CLUSTER_WINDOW_H = 48;
const inWindow = fresh.filter((a) => NOW - Date.parse(a.published_at) <= CLUSTER_WINDOW_H * 3600e3);
inWindow.sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at));

const index = buildCandidateIndex(inWindow.map((a) => ({ ...a, event_id: null })));
const events = new Map();          /* eventId → { members:[] } — placeArticle() が持つ形 */
let nextEventId = 1;
const decisions = [];
const t0 = Date.now();
const perArticleMs = [];
let evictions = 0;

for (const a of inWindow) {
  const s = Date.now();
  const cand = { ...a, _tk: tokenise(a.title) };
  const p = placeArticle(cand, index, events, () => nextEventId++);
  if (p.evicted) evictions++;
  decisions.push({
    article_id: a.id, chosen: p.event_id, created: p.created,
    candidates: p.decision.candidates, scores: p.decision.scores, evicted: p.evicted || null,
  });
  perArticleMs.push(Date.now() - s);
}
const assignMs = Date.now() - t0;

/* ── ③ Event の要約 ─────────────────────────────────────────────────────── */
const idf = buildIdf(inWindow.map((a) => ({ ...a })));
const summaries = [];
for (const [eid, ev] of events) {
  const s = summariseEvent(ev.members, idf);
  s.id = eid;
  s.cluster_confidence = clusterConfidence(ev.members.map((m) => m._score));
  s._members = ev.members;
  summaries.push(s);
}
summaries.sort((a, b) => b.article_count - a.article_count);

/* ── ④ 指標 ─────────────────────────────────────────────────────────────── */
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);
const q = (xs, p) => { const s = [...xs].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };

const catCount = {};
for (const s of summaries) catCount[s.primary_category] = (catCount[s.primary_category] || 0) + 1;
const located = summaries.filter((s) => s.rep_lng != null).length;
const multi = summaries.filter((s) => s.independent_source_count >= 3).length;
const multi2 = summaries.filter((s) => s.independent_source_count >= 2).length;
const biggest = summaries[0] ? summaries[0].article_count : 0;
const artLocated = inWindow.filter((a) => a.subject_lng != null).length;

const report = {
  at: snap.at,
  feeds: {
    total: snap.results.length,
    ok: feedReport.filter((f) => !f.error).length,
    failed: feedReport.filter((f) => f.error).map((f) => ({ url: f.url, error: f.error, status: f.status })),
    itemsFetched: feedReport.reduce((n, f) => n + f.items, 0),
    p50ms: q(feedReport.map((f) => f.ms), 0.5),
    p95ms: q(feedReport.map((f) => f.ms), 0.95),
  },
  articles: {
    accepted: rows.length,
    duplicateInBatch: dupInBatch,
    olderThanWindow: tooOld,
    stored: fresh.length,
    inClusterWindow: inWindow.length,
    rejected: Object.fromEntries([...rejects.entries()].sort((a, b) => b[1] - a[1])),
    locatedPct: pct(artLocated, inWindow.length),
  },
  events: {
    count: summaries.length,
    compression: inWindow.length && summaries.length ? Math.round((inWindow.length / summaries.length) * 100) / 100 : 0,
    biggest,
    singletons: summaries.filter((s) => s.article_count === 1).length,
    withTwoPlusSources: multi2,
    withThreePlusSources: multi,
    locatedPct: pct(located, summaries.length),
    categories: catCount,
    assignMsTotal: assignMs,
    evictions,
    perArticleP50: q(perArticleMs, 0.5),
    perArticleP95: q(perArticleMs, 0.95),
  },
  feedReport,
};

/* ── 出力 ────────────────────────────────────────────────────────────────── */
const line = (s) => process.stdout.write(s + '\n');
line('');
line('IntMap · news events — 実データでの測定  (' + snap.at + ')');
line('');
line('  フィード      ' + report.feeds.ok + '/' + report.feeds.total + ' 稼働 · ' + report.feeds.itemsFetched + ' 件取得 · p50 ' + report.feeds.p50ms + 'ms / p95 ' + report.feeds.p95ms + 'ms');
for (const f of report.feeds.failed) line('     ⚠ ' + f.error + '  ' + f.url);
line('  記事          ' + report.articles.accepted + ' 受理 / ' + report.articles.duplicateInBatch + ' 同一 run 内重複 / ' + report.articles.olderThanWindow + ' 窓外 → ' + report.articles.stored + ' 保存');
line('                却下: ' + Object.entries(report.articles.rejected).map(([k, v]) => k + ' ' + v).join(' · '));
line('                地点あり ' + report.articles.locatedPct + '%');
line('  Event         ' + report.events.count + ' 件 · 圧縮 ' + report.events.compression + '倍 · 最大 ' + report.events.biggest + ' · 単独 ' + report.events.singletons);
line('                独立2媒体以上 ' + report.events.withTwoPlusSources + ' · 3媒体以上 ' + report.events.withThreePlusSources + ' · 地点あり ' + report.events.locatedPct + '%');
line('                カテゴリ: ' + Object.entries(catCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · '));
line('                塊の検算で外した記事 ' + evictions + ' 件');
line('                割り当て ' + assignMs + 'ms（' + inWindow.length + ' 本・1本あたり p50 ' + report.events.perArticleP50 + 'ms / p95 ' + report.events.perArticleP95 + 'ms）');
line('');

if (DUMP) {
  line('── n>=' + DUMP + ' の塊（目視で「1 つの出来事か」を判定する） ──');
  for (const s of summaries.filter((x) => x.article_count >= DUMP)) {
    line('');
    line('#' + s.id + '  n=' + s.article_count + ' src=' + s.independent_source_count +
         ' cat=' + s.primary_category + '(' + s.category_confidence + ')' +
         ' geo=' + (s.rep_place_name_en || '—') + ' conf=' + s.cluster_confidence);
    line('   代表: ' + s.representative_title);
    for (const m of s._members) line('     · [' + m.source_id + '] ' + m.title);
  }
  line('');
}

if (JSONOUT) {
  mkdirSync(dirname(JSONOUT), { recursive: true });
  writeFileSync(JSONOUT, JSON.stringify({
    report,
    events: summaries.map((s) => ({
      ...s,
      _members: s._members.map((m) => ({
        id: m.id, source_id: m.source_id, title: m.title, published_at: m.published_at,
        provider_category: m.provider_category, subject_name_en: m.subject_name_en,
        subject_type: m.subject_type, subject_confidence: m.subject_confidence,
        subject_reasons: m.subject_reasons, canonical_url: m.canonical_url,
      })),
    })),
    decisions,
  }, null, 1));
  line('JSON → ' + JSONOUT);
}

export { report };
