/* ============================================================================
 *  IntMap · news-ingest — feeds in, articles located, events built, nothing claimed that did not happen
 * ----------------------------------------------------------------------------
 *  supabase/functions/news-ingest と _shared/news-ingest.js（#R351 以降）、その migration と計器。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { parseFeed, stripHtml, decodeXml, isLinkList, normHost, hostOf, buildRegistry, attribute, displayTitle, headlineReject, titleWordCount, MIN_TITLE_WORDS, MIN_DESC_WORDS, classifySpecial, classifyByTags, categorise, normaliseTags, tagsOf, buildCandidateIndex, candidateEvents, placeArticle, findOutlier, attachEvent, summariseEvent, clusterConfidence, toArticleRow, retentionCutoffs, RETENTION, INDEX, parseAiPlaces, GEO_AGREE_KM, eventsAgree, eventPairCandidates, pairScore } from '../supabase/functions/_shared/news-ingest.js';
import { geoClass, DEFAULTS, buildIdf, normaliseUrl, tokenise, pairVerdict } from '../supabase/functions/_shared/news-cluster.js';
import { NEWS_GEO_RULES, NEWS_GEO_KINDS, NEWS_GEO_KIND_LINE } from '../supabase/functions/_shared/news-geo-prompt.js';
import fs from 'node:fs';
import { LAZY_REGISTRY, LAZY_NAMES } from '../js/lazy-modules.js';
import { codeOnly } from '../scripts/code-only.mjs';
import { makeNewsClaims } from '../js/news-claims.js';

/* ════════ #R351 — from tests/r351-checks.test.mjs ════════ */
{
/* ============================================================================
 *  R351 — 記事が実際に入り、出来事に載る。その途中で外した所を押さえる
 * ----------------------------------------------------------------------------
 *  #R334 は 8 表と判定論理を入れたが `news_articles` は 0 行だった。#R351 で
 *  `supabase/functions/news-ingest/` が中身を入れる。**実データで動かして初めて
 *  分かった欠陥が 6 つあった**ので、この検査はそれを 1 つずつ固定する。
 *
 *    ① registry の `www.bbc.co.uk` と正規化後の `bbc.co.uk` が出会わない
 *       ⇒ **18 媒体すべてが「自分の記事ではない」と判定され、ingest は 0 行を書く**
 *    ② `kind:'org'` に解決した subject は距離ゼロ ⇒ #R76 と同じ緩和が組織で開いていた
 *    ③ メンバーが 1 件の Event では推移の検算（34%）が 1 本の辺で必ず満たされる
 *    ④ 代表見出しを `inter/自分の重み` で選ぶと**短い見出しが必ず勝つ**
 *    ⑤ タグを消してから実体参照を戻すと、`&lt;a href=…&gt;` は 1 文字も剥がれない
 *    ⑥ NYT の `nyt_org` タグ（Interpol …Police…）を節名として読むと政治が society になる
 *
 *  ⚠ 数字はすべて 2026-08-23 の実データ（33 フィード・1,365 件）で測った値である。
 * ========================================================================== */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(path.join(ROOT, p));
/* ⚠ 注釈の中の語で検査してはならない。「current_news を触らない」と**書いてある**ことを
 *   「触らない」の証拠にすると、その注釈を消しただけで検査が動く。見るのはコードだけ
 *   （#R285 の codeOnly と同じ形）。 */

/* 本番 registry と同じ形（`domains` は `www.` 付きで入っている）。 */
const SOURCES = [
  { id: 'bbc', name: 'BBC', domains: ['www.bbc.co.uk', 'www.bbc.com'], source_family: 'bbc', enabled: true },
  { id: 'skynews', name: 'Sky News', domains: ['news.sky.com'], source_family: 'skynews', enabled: true },
  { id: 'cnn', name: 'CNN', domains: ['www.cnn.com', 'edition.cnn.com'], source_family: 'cnn', enabled: true },
  { id: 'reuters', name: 'Reuters', domains: ['www.reuters.com'], source_family: 'reuters', enabled: true },
  { id: 'xinhua', name: 'Xinhua', domains: ['www.xinhuanet.com'], source_family: 'xinhua', enabled: false },
];
const REG = buildRegistry(SOURCES);
const FEED = { id: 1, source_id: 'bbc', category: 'world', collection: 'direct_rss' };

/* ── ① registry のホストと、正規化後の記事のホストは同じ土俵に乗る ─────────
 * これが噛み合わないと ingest は 1 行も書かない。**沈黙で失敗する**種類の欠陥なので、
 * 実際に突き合わせて確かめる。 */
test('#R351 ① the registry says www.bbc.co.uk and the normalised article says bbc.co.uk — they must still meet', () => {
  const norm = normaliseUrl('https://www.bbc.co.uk/news/world-1234?utm_source=x');
  assert.equal(hostOf(norm.url), 'bbc.co.uk', 'normaliseUrl drops the www. — that is the whole trap');
  assert.equal(normHost('www.bbc.co.uk'), 'bbc.co.uk');
  const a = attribute({}, norm, REG);
  assert.equal(a.source && a.source.id, 'bbc', 'the registry domain and the article host did not meet');
  assert.equal(a.via, 'canonical_host');
  /* 素の（正規化しない）突き合わせが本当に外れることを見せる——これが直した defect である。 */
  const naive = new Set(SOURCES.flatMap((s) => s.domains));
  assert.equal(naive.has(hostOf(norm.url)), false, 'a raw comparison finds nothing: that was the bug');
});

/* ── ② 帰属は完全一致だけ。接尾辞にしない ────────────────────────────────── */
test('#R351 ② attribution is exact-host only — Sky News does not own sky.com, and CNN does not own an affiliate ad', () => {
  const shop = normaliseUrl('https://www.sky.com/shop/broadband');
  assert.equal(attribute({}, shop, REG).source, null, 'news.sky.com must not claim sky.com');
  assert.equal(attribute({}, shop, REG).via, 'host_not_registered');
  /* 実測 (#R334): CNN の World RSS 29 件のうち 6 件がこれだった。 */
  const ad = normaliseUrl('https://www.fool.com/the-ascent/credit-cards/best-cash-back/');
  assert.equal(attribute({}, ad, REG).source, null, 'an affiliate ad in CNN\'s feed is not a CNN article');
  /* 既定オフの媒体は帰属はするが記事にはしない。 */
  const xin = normaliseUrl('https://www.xinhuanet.com/english/2026/x.htm');
  assert.equal(attribute({}, xin, REG).source.id, 'xinhua');
});

/* ── ③ 集約リダイレクトは canonical ではない。媒体は <source url> が言う ──── */
test('#R351 ③ a Google News redirect is not a canonical URL, and the real publisher comes from <source url>', () => {
  const g = normaliseUrl('https://news.google.com/rss/articles/CBMiswFBVV95cUxQ?oc=5');
  assert.equal(g.canonical, false);
  const viaSource = attribute({ sourceUrl: 'https://www.reuters.com' }, g, REG);
  assert.equal(viaSource.source.id, 'reuters');
  assert.equal(viaSource.via, 'provider_source_host');
  /* 登録していない媒体は、Google が何と言おうと登録媒体の記事ではない。 */
  const unknown = attribute({ sourceUrl: 'https://www.example-news.test' }, g, REG);
  assert.equal(unknown.source, null);
  assert.equal(unknown.via, 'provider_host_not_registered');
});

/* ── ④ フィードは 3 つの方言で届く ───────────────────────────────────────── */
test('#R351 ④ RSS 2.0, RDF and Atom all parse, and <items><rdf:Seq> is not an item', () => {
  const rss = '<rss><channel><title>Feed</title><link>https://x.test</link>' +
    '<item><title>A real headline about something</title><link>https://x.test/a</link>' +
    '<pubDate>Fri, 21 Aug 2026 08:00:00 GMT</pubDate><description>Body</description>' +
    '<category domain="https://x.test/world/africa">Africa</category></item></channel></rss>';
  const a = parseFeed(rss);
  assert.equal(a.length, 1);
  assert.equal(a[0].link, 'https://x.test/a');
  assert.deepEqual(a[0].categories, [{ text: 'Africa', domain: 'https://x.test/world/africa' }]);

  /* DW の rss.dw.com/rdf/rss-en-all はこの形。⚠ <items> は <item[ >] に当たらない。 */
  const rdf = '<rdf:RDF><channel><items><rdf:Seq><rdf:li rdf:resource="https://dw.test/1"/></rdf:Seq></items></channel>' +
    '<item rdf:about="https://dw.test/1"><title>Something happened in a place today</title>' +
    '<link>https://dw.test/1</link><dc:date>2026-08-21T08:00:00Z</dc:date></item></rdf:RDF>';
  const b = parseFeed(rdf);
  assert.equal(b.length, 1, '<items><rdf:Seq> must not be read as an <item>');
  assert.equal(b[0].published, '2026-08-21T08:00:00Z');

  const atom = '<feed><entry><title>An Atom entry with a proper headline</title>' +
    '<link href="https://at.test/1"/><published>2026-08-21T08:00:00Z</published></entry></feed>';
  const c = parseFeed(atom);
  assert.equal(c.length, 1);
  assert.equal(c[0].link, 'https://at.test/1');
});

/* ── ⑤ 実体参照を戻してから剥がす ────────────────────────────────────────── */
test('#R351 ⑤ escaped HTML is decoded BEFORE tags are stripped — the other order strips nothing', () => {
  const escaped = '&lt;a href="https://x.test"&gt;Some headline&lt;/a&gt;&nbsp;&nbsp;BBC';
  assert.equal(stripHtml(escaped), 'Some headline BBC');
  /* 逆順（#refresh-news の実装）だと生の HTML がそのまま本文になる、という対照。 */
  const wrongOrder = decodeXml(escaped.replace(/<[^>]+>/g, ' '));
  assert.match(wrongOrder, /<a href=/, 'the wrong order leaves the markup in the body — that was the defect');

  /* Google News の description は要約ではなくリンクの一覧。要約として保存しない。 */
  const linkList = '&lt;a href="https://news.google.com/rss/articles/CBMiXk"&gt;Headline&lt;/a&gt;';
  assert.equal(isLinkList(linkList), true);
  assert.equal(isLinkList('&lt;p&gt;A genuine summary of the story.&lt;/p&gt;'), false);
  const feed = '<rss><item><title>A headline with at least five words</title><link>https://x.test/a</link>' +
    '<pubDate>Fri, 21 Aug 2026 08:00:00 GMT</pubDate><description>' + linkList + '</description></item></rss>';
  assert.equal(parseFeed(feed)[0].description, '', 'a link list is not a summary');
});

/* ── ⑥ 見出しか、索引ページの表題か ──────────────────────────────────────── */
test('#R351 ⑥ a title too short to say what happened needs the publisher\'s own summary AND a canonical URL', () => {
  assert.equal(MIN_TITLE_WORDS, 5);
  assert.equal(titleWordCount('Hong Kong'), 2);
  /* 実測で落としたもの（Google News 経由の索引ページ・BBC のポッドキャスト回・Yonhap の定期物）。 */
  assert.equal(headlineReject('Hong Kong', 'Hong Kong AP News', false), 'title_too_short');
  assert.equal(headlineReject('BBC Inside Science', '', true), 'title_too_short');
  assert.equal(headlineReject('Yonhap News Summary', '', true), 'title_too_short');
  /* 実測で通したもの（NYT の短い特集見出し。要約が何が起きたかを言っている）。 */
  const nyt = 'Firefighters in Phoenix race to save lives in a city that is only getting hotter each year';
  assert.equal(headlineReject('A New Inferno', nyt, true), null);
  assert.ok(nyt.split(/\s+/).length >= MIN_DESC_WORDS);
  /* 実測で落としたもの（Bloomberg の人物データベース。34 本 ＝ Bloomberg の寄与の 34%）。 */
  assert.equal(headlineReject('Mr Ankit, Duncan Engineering Ltd: Profile and Biography', '', true), 'title_not_an_article');
  /* 普通の見出しは通る。 */
  assert.equal(headlineReject('Canada says will match new US 50% tariffs dollar for dollar', '', true), null);
});

/* ── ⑦ 組織の本部座標は「同じ場所」ではない（#R76 と同じ穴が org で開いていた） ── */
test('#R351 ⑦ two stories resolved to the same ORGANISATION are not a tight geographic match', () => {
  assert.ok(DEFAULTS.representativeKinds.includes('org'), 'org must be a representative point, not a place');
  assert.ok(DEFAULTS.representativeKinds.includes('country'));
  assert.ok(DEFAULTS.representativeKinds.includes('admin1'));
  for (const k of ['city', 'seat', 'flashpoint', 'feature']) {
    assert.ok(!DEFAULTS.representativeKinds.includes(k), k + ' IS a place — it must not be docked');
  }
  const hq = { lng: 127.05, lat: 37.25, subject_type: 'org' };
  assert.equal(geoClass(hq, { ...hq }).cls, 'countrySame',
    'same-org, distance 0 must NOT be "tight" — that is exactly how #R76 fused 43 articles');
  assert.equal(geoClass({ lng: -95, lat: 31, subject_type: 'admin1' }, { lng: -95, lat: 31, subject_type: 'admin1' }).cls,
    'countrySame', 'two unrelated Texas stories are 0 km apart too');
  /* 本物の地点どうしは今までどおり tight。 */
  assert.equal(geoClass({ lng: 139.69, lat: 35.69, subject_type: 'city' },
                        { lng: 139.70, lat: 35.68, subject_type: 'city' }).cls, 'tight');
  /* そして代表点の段は near より **厳しい**（#R334 ②の不変条件をここでも押さえる）。 */
  assert.ok(DEFAULTS.thr.countrySame >= DEFAULTS.thr.near);
});

/* ── ⑧ 最初の 1 本は誰にも検算されていない ──────────────────────────────────
 * 実データで見つけた形をそのまま入れる: Yonhap の続報 3 本＋無関係な 1 本。 */
const SAMSUNG = [
  { id: 1, title: 'Samsung SDI to sell 4.45 tln won worth of Samsung Display shares to fund facility investment',
    published_at: '2026-08-21T08:23:47Z', source_family: 'yonhap', subject_type: 'org', subject_lng: 127.05, subject_lat: 37.25 },
  { id: 2, title: '(URGENT) Samsung Electronics expects funds worth up to 110 tln won for shareholder returns this year',
    published_at: '2026-08-21T08:24:07Z', source_family: 'yonhap', subject_type: 'org', subject_lng: 127.05, subject_lat: 37.25 },
  { id: 3, title: '(LEAD) Samsung Electronics expects up to 110 tln won for shareholder returns this year',
    published_at: '2026-08-21T08:39:32Z', source_family: 'yonhap', subject_type: 'org', subject_lng: 127.05, subject_lat: 37.25 },
  { id: 4, title: '(2nd LD) Samsung Electronics expects up to 110 tln won for shareholder returns this year',
    published_at: '2026-08-21T09:21:43Z', source_family: 'yonhap', subject_type: 'org', subject_lng: 127.05, subject_lat: 37.25 },
];

test('#R351 ⑧ a cluster that grew around the wrong seed drops the seed, not the three that agree', () => {
  const idf = buildIdf(SAMSUNG.map((a) => ({ ...a })));
  const members = SAMSUNG.map((a) => ({ ...a }));
  const bad = findOutlier(members, idf);
  assert.equal(bad, 0, 'the odd one out is the SDI share sale, which happened to arrive first');
  /* 3 件未満では追い出さない——「誰が余計か」を言えない。 */
  assert.equal(findOutlier(members.slice(0, 2), idf), -1);
  /* 全員が合っていれば誰も出さない。 */
  assert.equal(findOutlier(members.slice(1), idf), -1);
});

test('#R351 ⑧b placeArticle evicts the seed as the cluster grows, and the evicted one gets its own event', () => {
  /* ⚠ **4 本だけの窓では試験にならない。** 転置索引は「窓の 4% を超える語」を投稿リストから
   *   外すので、n=4 では上限が 2 になり、`samsung` も `won` も共通語として弾かれ、候補が
   *   1 件も出ない。本番の窓は数百本である——実測 648 本のとき上限は 26 だった。
   *   だから無関係な記事で窓の大きさを作ってから測る（これが実データで起きたことの再現）。 */
  const filler = [];
  for (let i = 0; i < 120; i++) {
    filler.push({ id: 1000 + i, event_id: null, source_family: 'f' + i,
      published_at: '2026-08-21T08:00:00Z',
      title: 'Unrelated report number ' + i + ' concerning matters elsewhere entirely' });
  }
  const arts = SAMSUNG.map((a) => ({ ...a, event_id: null })).concat(filler);
  const index = buildCandidateIndex(arts);
  const store = new Map();
  let next = 100;
  let evicted = null;
  for (const a of index.arts) {
    const p = placeArticle(a, index, store, () => next++);
    if (p.evicted) evicted = p.evicted;
  }
  assert.ok(evicted, 'nothing was evicted — the 1-member transitivity hole is back');
  assert.equal(evicted.article_id, 1, 'the SDI share sale must be the one that leaves');
  const samsung = [...store.values()].map((e) => e.members.map((m) => m.id).filter((x) => x < 10))
    .filter((ids) => ids.length).map((ids) => ids.sort((a, b) => a - b));
  samsung.sort((a, b) => b.length - a.length);
  assert.deepEqual(samsung, [[2, 3, 4], [1]],
    'three updates of one announcement, plus the unrelated one on its own');
});

/* ── ⑨ 全 Event と総当たりしない ─────────────────────────────────────────── */
test('#R351 ⑨ candidate generation is bounded — it never walks every event', () => {
  /* 200 本の互いに無関係な記事 ＝ 200 個の Event。1 本あたりの候補は上限で頭打ちになる。 */
  const arts = [];
  for (let i = 0; i < 200; i++) {
    arts.push({
      id: i + 1, title: 'Something notable happened in place number ' + i + ' today reports say',
      published_at: '2026-08-21T08:00:00Z', source_family: 's' + i, event_id: i + 1,
    });
  }
  const index = buildCandidateIndex(arts);
  const probe = { id: 999, title: 'Something notable happened in place number 7 today reports say', published_at: '2026-08-21T08:00:00Z' };
  const cands = candidateEvents(probe, index);
  assert.ok(cands.length <= INDEX.maxCandidates, 'candidates exceeded the cap: ' + cands.length);
  assert.ok(cands.length < 200, 'candidate generation degenerated into all-pairs');
  /* 頻出語は投稿リストに入らない（それが「絞る」ということ）。 */
  assert.ok(!index.post.has('happen') || index.post.get('happen').length === 0,
    'a token in 200 of 200 articles must not have a posting list');
});

/* ── ⑩ 代表見出しは中心であって、最短ではない ────────────────────────────── */
test('#R351 ⑩ the representative headline is the medoid — a 2-word tag page never wins it', () => {
  const members = [
    { id: 1, title: 'Tiananmen Square vigil organisers in Hong Kong found guilty of inciting subversion',
      published_at: '2026-08-21T10:00:00Z', source_family: 'guardian' },
    { id: 2, title: 'Former Hong Kong vigil organizer strives to mark Tiananmen crackdown despite convictions',
      published_at: '2026-08-21T11:00:00Z', source_family: 'apnews' },
    /* 実測で代表に選ばれてしまった AP のタグページ見出し。 */
    { id: 3, title: 'Hong Kong', published_at: '2026-08-21T12:00:00Z', source_family: 'apnews' },
  ];
  const idf = buildIdf(members.map((m) => ({ ...m })));
  const s = summariseEvent(members.map((m) => ({ ...m })), idf);
  assert.notEqual(s.representative_title, 'Hong Kong',
    'the shortest title won again — the medoid denominator is back to inter/self');
  assert.match(s.representative_title, /Tiananmen/);
  assert.equal(s.article_count, 3);
});

/* ── ⑪ 独立媒体数と、単独 Event の確度 ───────────────────────────────────── */
test('#R351 ⑪ counts are of independent voices, and a single article has no cluster confidence to state', () => {
  const two = [
    { id: 1, title: 'A thing happened somewhere important', published_at: '2026-08-21T08:00:00Z', source_family: 'sinclair' },
    { id: 2, title: 'A thing happened somewhere important', published_at: '2026-08-21T08:05:00Z', source_family: 'sinclair' },
    { id: 3, title: 'Reports say a thing happened somewhere important', published_at: '2026-08-21T08:10:00Z', source_family: 'bbc' },
  ];
  const idf = buildIdf(two.map((a) => ({ ...a })));
  const s = summariseEvent(two.map((a) => ({ ...a })), idf);
  assert.equal(s.article_count, 3);
  assert.equal(s.independent_source_count, 2, 'two syndicated copies are one voice');
  /* 何も統合していない Event に「確信」は無い。0 ではなく null。 */
  assert.equal(clusterConfidence([null]), null);
  assert.equal(clusterConfidence([]), null);
  assert.equal(clusterConfidence([3, 1.5, 2]), 1);
  assert.ok(clusterConfidence([0.6]) < 1, 'a weak weakest-link must not read as full confidence');
});

/* ── ⑫ カテゴリ — フィードが言えることは分類器に言わせない ────────────────── */
test('#R351 ⑫ the feed section decides, and only world/blank is ever overridden', () => {
  const quake = (cat) => ([{ title: 'Magnitude 5.9 earthquake rattles Tokyo and eastern Kanto region',
    description: 'A strong quake injured dozens', provider_category: cat, tags: [] }]);
  assert.equal(categorise(quake('world')).primary_category, 'disasters');
  assert.equal(categorise(quake(null)).primary_category, 'disasters');
  /* 編集部が business/technology と言っているものを、見出しの語で奪わない。 */
  assert.equal(categorise(quake('business')).primary_category, 'business');
  assert.equal(categorise(quake('science_health')).primary_category, 'science_health');
  /* 分類器が要るのは 2 つだけ——他のカテゴリを名乗らせない。 */
  for (const t of ['Markets rally as the central bank holds rates steady', 'A new phone launches with a faster chip']) {
    const r = classifySpecial(t, '');
    assert.ok(!r || r.cls === 'disasters' || r.cls === 'society', 'the classifier invented a third category');
  }
});

test('#R351 ⑫b military stories are not "society", and one repeated word is not evidence', () => {
  /* 実測で外した 2 件（`strike`/`strikes` を労働争議の語として数えていた）。 */
  assert.equal(classifySpecial("Putin says Ukraine opened 'Pandora's box' with strikes on economic targets", ''), null);
  assert.equal(classifySpecial('Fourteen killed in strike on Myanmar monastery',
    'Myanmar military airstrike kills 14 at a Buddhist monastery, reports say'), null);
  /* 実測で外した 1 件（`residents` 1 語が見出しと要約に出ただけで 4 点に届いていた）。 */
  assert.equal(classifySpecial('Indiana residents endure 11th day without power after storms topple power lines',
    'Residents in Indiana are still waiting'), null);
  /* 別々の語が 2 つあれば発火する。 */
  const ok = classifySpecial('Tiananmen Square vigil organisers in Hong Kong found guilty of inciting subversion', '');
  assert.ok(ok && ok.cls === 'society', 'two distinct society terms must still fire');
});

test('#R351 ⑫c an entity tag is not a section tag', () => {
  /* 実測で外した 1 件: NYT の nyt_org タグ「Interpol (International Criminal Police Organization)」の
     中の `police` を節名として読み、政治の記事を society にしていた。 */
  const entity = normaliseTags([{ text: 'Interpol (International Criminal Police Organization)',
    domain: 'http://www.nytimes.com/namespaces/keywords/nyt_org' }]);
  assert.equal(classifyByTags(entity), null, 'an organisation name must not classify the story');
  /* 主題の taxonomy（des）と、Guardian のセクション slug は今までどおり効く。 */
  const des = normaliseTags([{ text: 'Deaths (Obituaries)', domain: 'http://www.nytimes.com/namespaces/keywords/des' }]);
  assert.equal(classifyByTags(des).cls, 'society');
  const guardian = normaliseTags([{ text: 'Sport', domain: 'https://www.theguardian.com/sport/football' }]);
  assert.equal(classifyByTags(guardian).cls, 'society');
  /* 保存する形: domain はパスだけ（NYT の namespace URL はホストが無駄に長い）。 */
  assert.equal(des[0].domain, '/namespaces/keywords/des');
});

/* ── ⑬ 1 項目 → 1 行（帰属・指紋・地点の根拠・first_seen_at を送らないこと） ── */
test('#R351 ⑬ one item becomes one row: fingerprints, tags, geo reasons — and first_seen_at is never sent', async () => {
  const item = {
    title: 'Canada says it will match new US 50% tariffs dollar for dollar',
    link: 'https://www.bbc.co.uk/news/world-99?utm_source=x',
    published: 'Fri, 21 Aug 2026 08:00:00 GMT',
    description: 'Ottawa announced counter-tariffs after trade talks collapsed.',
    categories: [{ text: 'Business', domain: 'https://www.bbc.co.uk/business' }],
  };
  const out = await toArticleRow(item, FEED, REG, null);
  assert.equal(out.reject, null);
  const r = out.row;
  assert.equal(r.source_id, 'bbc');
  assert.equal(r.canonical_url, 'https://bbc.co.uk/news/world-99', 'tracking parameters survived normalisation');
  assert.equal(r.provider_url, null, 'a real article URL has no aggregator provider_url');
  assert.match(r.url_fingerprint, /^[0-9a-f]{64}$/);
  assert.match(r.title_fingerprint, /^[0-9a-f]{64}$/);
  assert.notEqual(r.url_fingerprint, r.title_fingerprint);
  assert.equal(r.provider_category, 'world');
  assert.deepEqual(tagsOf(r), [{ text: 'Business', domain: '/business' }]);
  /* ⚠ first_seen_at を送ると upsert が毎 run 上書きし、「最初に観測した時刻」が
     原理的に復元できなくなる（`current_news.fetched_at` がまさにそれだった）。 */
  assert.ok(!('first_seen_at' in r), 'first_seen_at must not be in the upsert payload');
  assert.ok('last_seen_at' in r);
  /* 時刻の無い記事は Event に載せられないので、記事にもしない。 */
  const noTime = await toArticleRow({ ...item, published: 'not a date' }, FEED, REG, null);
  assert.equal(noTime.reject, 'no_published_at');
  /* 既定オフの媒体は取り込まない。 */
  const off = await toArticleRow({ ...item, link: 'https://www.xinhuanet.com/english/a.htm' }, FEED, REG, null);
  assert.equal(off.reject, 'source_disabled');
});

test('#R351 ⑬b the geo engine\'s why[] is kept — #R334 measured that analyzeContext threw it away', async () => {
  await import('../supabase/functions/_shared/newsgeo.js');
  const geo = globalThis.IntMapNewsGeo;
  const out = await toArticleRow({
    title: 'Explosions rock Kyiv as Russia launches ballistic missiles at the capital',
    link: 'https://www.bbc.co.uk/news/world-1',
    published: 'Fri, 21 Aug 2026 08:00:00 GMT', description: '', categories: [],
  }, FEED, REG, geo);
  assert.equal(out.reject, null);
  assert.ok(Number.isFinite(out.row.subject_lng) && Number.isFinite(out.row.subject_lat));
  assert.ok(out.row.subject_reasons.length > 0, 'why[] was dropped again — nobody can explain the pin');
  assert.ok(out.row.subject_type, 'subject_type feeds geoClass — without it every pair looks tight');
});

/* ── ⑭ 保持期間は 3 つに分かれ、★保存には期限が無い ──────────────────────── */
/* 綴りのまま: 対象は CI の workflow・文書で、実行されるのは GitHub 上（ここでは記述を確かめるしかない） */
test('#R351 ⑭ articles 72h, events 30d, decisions 30d — and saved events have no deadline at all', () => {
  assert.equal(RETENTION.articleHours, 72);
  assert.equal(RETENTION.eventDays, 30);
  assert.equal(RETENTION.decisionDays, 30);
  assert.ok(!('savedDays' in RETENTION), 'a number here would be a deadline where the constitution says none');
  const now = Date.parse('2026-08-23T12:00:00Z');
  const c = retentionCutoffs(now);
  assert.equal(c.articles, '2026-08-20T12:00:00.000Z');
  assert.equal(c.events, '2026-07-24T12:00:00.000Z');
  /* CONSTITUTION.md §5 と docs/NEWS-EVENTS.md §8 が同じことを言っている。 */
  const con = rd('CONSTITUTION.md');
  assert.match(con, /記事は 72 時間、Event は 30 日/);
  assert.match(rd('docs/NEWS-EVENTS.md'), /\*\*72時間\*\*/);
});

/* ── ⑮ この論理はブラウザに配られない ────────────────────────────────────── */
/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
test('#R351 ⑮ the ingest logic is server-only and reaches no client bundle', () => {
  for (const f of ['src/main.js', 'src/vendor.js', 'index.html']) {
    assert.ok(!rd(f).includes('news-ingest'), f + ' must not reference news-ingest.js — it is server-only');
  }
  /* ⚠ (#R404) 探しているのは **モジュールへの参照**（import / パス）であって、散文が
     `news-ingest` という語を出したかどうかではない。素の語で引くと、プライバシーポリシーの
     注釈が「どのコードがその挙動を行うか」を名指しただけで落ちる——**名指しをやめさせる**
     ほうへ直したくなる圧力がかかり、それは監査可能性を下げる。パスで引けば、
     `import … from '../supabase/functions/_shared/news-ingest.js'` は今までどおり捕まる。 */
  let hits = '';
  try {
    hits = execFileSync('git', ['grep', '-lE', 'news-ingest\.js|_shared/news-ingest', '--', 'js/', 'src/'],
      { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) { hits = (e.status === 1) ? '' : String(e.message); }
  assert.equal(hits, '', 'js/ or src/ references news-ingest.js: ' + hits);
});

/* ── ⑯ Edge Function が守ると言っていることを、実際に守っている ───────────── */
/* 綴りのまま: 対象は Deno の Edge Function（Deno.serve・npm: import）で、Node からは読み込めない */
test('#R351 ⑯ news-ingest is fail-closed, deadline-bounded, and touches neither current_news nor refresh-news', () => {
  const fn = codeOnly(rd('supabase/functions/news-ingest/index.ts'));
  /* 秘密が無ければ何もしない（refresh-news / monitor-run と同じ形）。 */
  assert.match(fn, /NEWS_INGEST_SECRET/);
  assert.match(fn, /if \(!secret\)/, 'not fail-closed: an unset secret must refuse every request');
  assert.match(fn, /timingSafeEqual\(got, secret\)/);
  assert.match(fn, /x-news-ingest-secret/);
  assert.ok(!/searchParams\.get\("secret"\)/.test(fn), 'the secret must never come from the query string');
  assert.match(fn, /method !== "POST"/, 'GET would make a paid job trivially triggerable');
  /* ⚠ refresh-news は AbortSignal を 1 つも持っていない。こちらは期限つきで取りに行く。 */
  assert.match(fn, /fetchGuarded/, 'feeds must be fetched through the shared bounds (deadline/bytes/type)');
  assert.match(fn, /budget\.left\(\)/, 'no wall-clock budget: a slow run would be killed mid-write');
  /* (edge-spend-and-models) the deadline is the shared door's timeoutMs now, still capped by the budget */
  assert.match(fn, /AbortSignal\.timeout|callProvider\(cfg, [A-Z_]+, user, Math\.min\(\d+, budget\.left\(\)\)\)/, 'the LLM call needs a deadline of its own');
  /* article mode の経路に触れない。 */
  assert.ok(!fn.includes('current_news'), 'news-ingest must not read or write current_news');
  /* 第二の地点解析を作らない・第二のクラスタリングを作らない。 */
  assert.match(fn, /_shared\/newsgeo\.js/);
  assert.match(fn, /_shared\/news-ingest\.js/);
  assert.ok(!/function\s+(analyze|locate)Context/.test(fn), 'a second locator appeared');
  /* 人格の正本は 1 つ (#R285)。 */
  assert.match(fn, /personaPrompt\(/);
  /* 宣言されていない Edge Function は存在しないのと同じ (#R333)。 */
  const toml = rd('supabase/config.toml');
  assert.match(toml, /\[functions\.news-ingest\]/);
  const block = toml.split('[functions.news-ingest]')[1] || '';
  assert.match(block.split('[functions.')[0], /verify_jwt\s*=\s*false/);
});

/* ── ⑰ migration は加算だけ。service_role の grant を明示している ────────── */
/* 綴りのまま: 対象は SQL migration で Node からは評価できない（適用と実行は supabase db reset / test db の仕事） */
test('#R351 ⑰ the ingest migration only adds, and it grants the writer explicitly', () => {
  /* SQL の注釈は `--`。ここでも「書いてある」ではなく「してある」を見る。 */
  const sql = rd('supabase/migrations/20260823130100_news_events_ingest.sql')
    .split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join(' ');
  assert.match(sql, /add column if not exists source_title_fp/);
  assert.match(sql, /add column if not exists category_evidence/);
  assert.match(sql, /create table if not exists public\.news_ingest_runs/);
  /* ⚠ baseline の grant はスナップショットで、あとから作った表には届かない (#R334)。 */
  assert.match(sql, /grant select, insert, update, delete on public\.news_ingest_runs to service_role/);
  assert.match(sql, /grant usage, select on sequence public\.news_ingest_runs_id_seq to service_role/);
  assert.match(sql, /alter table public\.news_ingest_runs enable row level security/);
  /* 運用の記録であって公開データではない。 */
  assert.match(sql, /revoke all on public\.news_ingest_runs from anon, authenticated/);
  assert.ok(!/drop table/i.test(sql), 'this migration must not drop anything');
  assert.ok(!/alter table public\.current_news/i.test(sql), 'current_news is not this pipeline\'s business');
  /* ⚠ 空の表に ivfflat を張らない（リストを学習できない）。 */
  assert.ok(!/ivfflat|hnsw/i.test(sql), 'the ANN index waits until embeddings exist');
});

/* ── ⑱ 段はすべて在り、どれも名前で選べる ──────────────────────────────── */
/* 綴りのまま: 対象は Deno の Edge Function（Deno.serve・npm: import）で、Node からは読み込めない */
test('#R351 ⑱ the stages exist and are individually runnable', () => {
  const fn = rd('supabase/functions/news-ingest/index.ts');
  /* ⚠ (#R386) SIX now: `embed` (make the material for the second, semantic pass) and `link`
     (join clusters that have already grown into each other) joined the four. The ORDER is the
     subject of the assertion below, not just the membership — `embed` before `assign` (nothing
     to add without embeddings) and `link` after it (so events created this run are in scope).
     ⚠ (#R405) EIGHT (with #R404 locate): `summarise` writes what an event says, and it comes AFTER `link` so that
     an event about to absorb another one is summarised once, from all its articles, instead of
     twice. (It would not be left stale either way — the evidence fingerprint covers the member
     list, so absorbing articles changes it and the next run pays again. The ordering buys the
     cheaper of two correct outcomes, not correctness itself.) */
  /* (news-intelligence) NINE: `entities` (which company each article names → news_event_entities) comes AFTER
     `link`, so an event about to be absorbed is not given companies that would then sit on a merged row. */
  for (const s of ['fetch', 'locate', 'embed', 'assign', 'link', 'entities', 'summarise', 'translate', 'prune']) {
    assert.ok(fn.includes('stage' + s[0].toUpperCase() + s.slice(1)), 'stage ' + s + ' is missing');
  }
  /* ⚠⚠⚠ **`\\[` と書くと、これは「バックスラッシュ + 文字クラス」になって別の理由で通る。**
     `fn` には `\s` や `\d` がいくらでもあるので、順序が何であっても緑になる（#R405 で実際に
     1 度書いてしまい、変異させて気づいた）。⇒ `\[` は 1 本。 */
  assert.match(fn, /\["fetch", "locate", "embed", "assign", "link", "entities", "summarise", "translate", "prune"\]/);

  /* 計測は docs/NEWS-EVENTS.md §13 の置き場へ入る。 */
  assert.match(fn, /news_ingest_runs/);
  assert.match(fn, /estimated_cost_usd/);
});
}

/* ════════ #R404 — from tests/r404-checks.test.mjs ════════ */
{
/* ============================================================================
 *  R404 — ニュースの地点解析に AI を戻す。戻したものが**本当に効く**ことを押さえる
 * ----------------------------------------------------------------------------
 *  依頼は「ニュースの地点解析システムは AI を使うようにしろ。復活です」。
 *  着手時の実測 (2026-08-24・本番):
 *    · `current_news` 1,548 行のうち `analyzed_by='ai'` は **0 件**
 *      （`AI_MODEL` の 403。#R351 が特定済み。`refresh-news` に 403 リトライが無く、
 *        例外は握り潰されていた）＝ #R29 の AI 経路は**書かれた日から一度も成功していない**
 *    · UI が実際に読むのは `news_events`（`news-ingest`）で、そちらは AI を 1 度も呼んでいない
 *  ⇒ 生きている経路（`news-ingest`）に「AI が第一手段・決定論エンジンがフォールバック」を戻す。
 *
 *  この検査が押さえるのは、**戻し方を間違えると静かに無効化される 5 か所**である。
 *    ① 返答の検証（模型の答えをそのまま採ると、間違った場所は「無い」より悪い）
 *    ② 壊れた batch で「AI は見た」の印を押すと、その記事は**永久に候補から外れる**
 *    ③ `fetch` の upsert が AI の座標を **20 分ごとに踏み潰す**（#R404 の一番危ない罠）
 *    ④ 記事の座標だけ直しても、Event を数え直さなければ**地図には一生出ない**
 *    ⑤ 種別の語彙が `js/newsgeo.js` とずれると、AI の都市が辞書の国に代表を譲る
 * ========================================================================== */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(path.join(ROOT, p));
/* 注釈の中の語を証拠にしない（#R285 の codeOnly と同じ形）。 */

const INGEST = 'supabase/functions/news-ingest/index.ts';
const SHARED = 'supabase/functions/_shared/news-ingest.js';
const MIGRATION = 'supabase/migrations/20260824210000_news_geo_ai.sql';

/* 東京の記事 1 本。決定論エンジンは東京（139.69, 35.69）に置いた、という前提。 */
const art = (over) => ({
  id: 1, title: 'Quake felt in Tokyo', description: '',
  subject_lng: 139.69, subject_lat: 35.69, subject_name_en: 'Tokyo', ...over,
});
const reply = (objs) => JSON.stringify(objs);

/* ── ① 素直な返答を採り、決定論エンジンとの一致を確度に写す ─────────────── */
test('#R404 ① well-formed reply is taken, and confidence is MEASURED against the gazetteer', () => {
  const arts = [art({ id: 1 }), art({ id: 2, subject_lng: -0.13, subject_lat: 51.5, subject_name_en: 'London' })];
  const v = parseAiPlaces(reply([
    { i: 1, name: 'Tokyo', kind: 'city', lat: 35.68, lng: 139.76 },      /* 東京と一致 */
    { i: 2, name: 'Kyiv', kind: 'city', lat: 50.45, lng: 30.52 },        /* London とは別 */
  ]), arts);

  assert.equal(v.ok, true, v.error || '');
  assert.equal(v.placed.length, 2);
  assert.equal(v.omitted.length, 0);

  const [a, b] = v.placed;
  assert.equal(a.name, 'Tokyo');
  assert.equal(a.kind, 'city');
  assert.ok(a.km < GEO_AGREE_KM, 'Tokyo↔Tokyo should be inside the agreement radius');
  assert.equal(a.confidence, 0.95);
  assert.ok(a.reasons.includes('agrees-with-gazetteer'));
  assert.equal(v.agreed, 1);

  assert.equal(b.confidence, 0.7, 'a place far from the gazetteer answer must not claim high confidence');
  assert.ok(b.reasons.includes('differs-from-gazetteer'));
  assert.ok(b.reasons.some((r) => r.includes('London')), 'the reason must name what it disagreed WITH');
  assert.equal(v.differed, 1);
});

test('#R404 ①b when the gazetteer had no answer the AI still places it, at its own confidence', () => {
  const v = parseAiPlaces(reply([{ i: 1, name: 'Kyiv', kind: 'city', lat: 50.45, lng: 30.52 }]),
    [art({ subject_lng: null, subject_lat: null, subject_name_en: null })]);
  assert.equal(v.placed.length, 1);
  assert.equal(v.noDict, 1);
  assert.equal(v.placed[0].confidence, 0.8);
  assert.ok(v.placed[0].reasons.includes('gazetteer-had-no-answer'));
  assert.equal(v.placed[0].km, null, 'there is nothing to measure a distance against');
});

/* ── ② 模型の答えをそのまま採らない ──────────────────────────────────── */
test('#R404 ② (0,0) is refused — it is the Gulf of Guinea, and the model\'s way of saying "I do not know"', () => {
  const v = parseAiPlaces(reply([{ i: 1, name: 'Somewhere', kind: 'city', lat: 0, lng: 0 }]), [art()]);
  assert.equal(v.placed.length, 0);
  assert.equal(v.rejected.null_island, 1);
  assert.deepEqual(v.omitted, [1], 'a refused answer still counts as "the AI looked at this one"');
});

test('#R404 ②b coordinates outside the real world are refused', () => {
  for (const bad of [{ lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: 'north', lng: 12 }, {}]) {
    const v = parseAiPlaces(reply([{ i: 1, name: 'X', kind: 'city', ...bad }]), [art()]);
    assert.equal(v.placed.length, 0, JSON.stringify(bad));
    assert.equal(v.rejected.bad_coords, 1, JSON.stringify(bad));
  }
});

test('#R404 ②c an id we never sent is refused, and the same id twice is taken once', () => {
  const v = parseAiPlaces(reply([
    { i: 99, name: 'Nowhere', kind: 'city', lat: 10, lng: 10 },
    { i: 1, name: 'Tokyo', kind: 'city', lat: 35.68, lng: 139.76 },
    { i: 1, name: 'Osaka', kind: 'city', lat: 34.69, lng: 135.5 },
  ]), [art()]);
  assert.equal(v.placed.length, 1);
  assert.equal(v.placed[0].name, 'Tokyo', 'the first answer for an id wins; the second is not a second article');
  assert.equal(v.rejected.unknown_id, 2, 'both the never-sent id and the repeat land here');
});

test('#R404 ②d an empty name is refused (a pin with no label is not an answer)', () => {
  const v = parseAiPlaces(reply([{ i: 1, name: '   ', kind: 'city', lat: 35.68, lng: 139.76 }]), [art()]);
  assert.equal(v.placed.length, 0);
  assert.equal(v.rejected.no_name, 1);
});

/* ── ③ 壊れた返答で「見た」印を押さない ────────────────────────────────── */
test('#R404 ③ a reply that never arrived marks NOTHING as seen — otherwise those articles are lost forever', () => {
  for (const broken of ['', 'I am sorry, I cannot do that.', '[{"i":1,', '{"i":1,"name":"Tokyo"}']) {
    const v = parseAiPlaces(broken, [art(), art({ id: 2 })]);
    assert.equal(v.ok, false, JSON.stringify(broken));
    assert.equal(v.placed.length, 0);
    assert.deepEqual(v.omitted, [], 'omitted must be empty when the batch failed: ' + JSON.stringify(broken));
    assert.ok(v.error, 'the failure must carry a reason — a silent 0 is what #R334 measured');
  }
});

test('#R404 ③b a reply that arrived but omitted an item marks THAT item as seen (and only it)', () => {
  const v = parseAiPlaces(reply([{ i: 2, name: 'Kyiv', kind: 'city', lat: 50.45, lng: 30.52 }]),
    [art({ id: 1 }), art({ id: 2 }), art({ id: 3 })]);
  assert.equal(v.ok, true);
  assert.deepEqual(v.omitted.sort(), [1, 3]);
});

/* ── ④ 種別の語彙は js/newsgeo.js と同じでなければならない ────────────── */
test('#R404 ④ the kind vocabulary is DERIVED from js/newsgeo.js, not written down twice', () => {
  const src = rd('js/newsgeo.js');
  const m = src.match(/var\s+KIND_LOCAL\s*=\s*\{([^}]*)\}/);
  assert.ok(m, 'KIND_LOCAL is gone from js/newsgeo.js — this check needs rewriting');
  const engineKinds = [...m[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1]).sort();
  assert.deepEqual([...NEWS_GEO_KINDS].sort(), engineKinds,
    'the AI is offered a different vocabulary than the engine uses — a kind the engine does not rank ' +
    'scores 0 in summariseEvent, so an AI-located city loses the event\'s pin to a dictionary-located country');
  /* 語彙は実際にプロンプトへ渡されていること（定数だけ揃っていても意味が無い）。 */
  for (const k of NEWS_GEO_KINDS) {
    assert.ok(NEWS_GEO_KIND_LINE.includes('"' + k + '"'), 'kind not offered to the model: ' + k);
  }
});

test('#R404 ④b an unknown kind does not throw the answer away, but is counted', () => {
  const v = parseAiPlaces(reply([{ i: 1, name: 'Tokyo', kind: 'metropolis', lat: 35.68, lng: 139.76 }]), [art()]);
  assert.equal(v.placed.length, 1, 'the coordinates are still the answer');
  assert.equal(v.placed[0].kind, null);
  assert.equal(v.rejected.bad_kind, 1);
});

/* ── ⑤ 出どころは、決めたものが書く（#R394 の形） ───────────────────── */
test('#R404 ⑤ toArticleRow stamps subject_located_by from the OUTCOME, never unconditionally', async () => {
  const feed = { id: 1, source_id: 'bbc', category: 'world', collection: 'direct_rss' };
  const registry = buildRegistry([{ id: 'bbc', name: 'BBC', domains: ['www.bbc.co.uk'], source_family: 'bbc', enabled: true }]);
  const item = {
    title: 'Heavy rain floods Osaka overnight, dozens evacuated from riverside homes',
    link: 'https://www.bbc.co.uk/news/world-1234', description: 'Rescue teams worked through the night in the city.',
    published: new Date().toUTCString(), categories: [],
  };
  const placed = await toArticleRow(item, feed, registry, { analyze: () => ({ result: { lng: 135.5, lat: 34.69, name: { en: 'Osaka' }, kind: 'city', confidence: 0.9, why: ['title'] } }) });
  assert.equal(placed.row.subject_located_by, 'dict');
  const blank = await toArticleRow(item, feed, registry, { analyze: () => ({ result: null }) });
  assert.equal(blank.row.subject_located_by, 'none');
  assert.equal(blank.row.subject_lng, null);
});

test('#R404 ⑤b summariseEvent says WHICH mechanism placed the pin, and how many articles the AI has seen', () => {
  const base = (o) => ({ title: 'Quake felt in Tokyo tonight', published_at: '2026-08-24T00:00:00Z', source_id: 's1', source_family: 's1', ...o });
  const members = [
    base({ id: 1, subject_lng: 139.76, subject_lat: 35.68, subject_name_en: 'Tokyo', subject_type: 'city', subject_confidence: 0.95, subject_located_by: 'ai' }),
    base({ id: 2, subject_lng: 138.0, subject_lat: 36.0, subject_name_en: 'Japan', subject_type: 'country', subject_confidence: 0.6, subject_located_by: 'dict' }),
  ];
  const s = summariseEvent(members, buildIdf(members));
  assert.equal(s.rep_place_name_en, 'Tokyo', 'specificity first — the city must win the country');
  assert.equal(s.location_evidence.by, 'ai');
  assert.equal(s.location_evidence.ai_articles, 1);
});

/* ── ⑥ fetch の upsert が AI の座標を踏み潰さない ──────────────────────── */
/* 綴りのまま: 対象は Deno の Edge Function（Deno.serve・npm: import）で、Node からは読み込めない */
test('#R404 ⑥ the fetch upsert must NOT rewrite the subject of an article the AI already placed', () => {
  const fn = codeOnly(rd(INGEST));
  assert.match(fn, /subject_located_by["']\s*,\s*["']ai["']|eq\("subject_located_by",\s*"ai"\)/,
    'stageFetch does not look up which fingerprints the AI has already placed');
  assert.match(fn, /const SUBJECT_COLS\s*=\s*\[/, 'the stripped column list is gone');

  /* ⚠ 一覧を手で書くと、`toArticleRow` が subject_* をもう 1 列足した日に穴が開く。
     **toArticleRow が実際に書いている subject_* の全部**が剥がれることを確かめる。 */
  const shared = rd(SHARED);
  const body = shared.slice(shared.indexOf('export async function toArticleRow'));
  const written = [...new Set([...body.slice(0, body.indexOf('\n}')).matchAll(/^\s{6}(subject_\w+):/gm)].map((m) => m[1]))];
  assert.ok(written.length >= 6, 'expected toArticleRow to write several subject_* columns, found ' + written.length);
  const listed = (fn.match(/const SUBJECT_COLS\s*=\s*\[([\s\S]*?)\]/) || [, ''])[1];
  for (const col of written) {
    assert.ok(listed.includes('"' + col + '"'),
      col + ' is written by toArticleRow but not stripped before the upsert — every 20 minutes the ' +
      'deterministic result would overwrite what the AI placed');
  }

  /* ⚠⚠ (#R404 本番で実測) **指紋を `.in(…)` に詰めない。** 1 ページぶん 1,000 件を渡すと
     PostgREST への URL が約 65,000 文字（指紋は 64 桁）になり、上流が 400 を返して
     **`fetch` 段が丸ごと落ちる＝1 行も取り込めない**。逆から訊く（AI 済みの指紋を全部もらう）。
     ⚠ 数の少ない bigint の `.in(…)` は問題ないので、禁じるのは**この列だけ**。 */
  assert.ok(!/\.in\(\s*["']url_fingerprint["']/.test(fn),
    'the AI-fingerprint lookup packs 64-char fingerprints into a URL — it 400s in production');
  assert.match(fn, /selectAll\([\s\S]{0,200}subject_located_by["']\s*,\s*["']ai["']/,
    'the AI-fingerprint set must be read with the paged reader, not one filtered request');

  /* 鍵の揃わないオブジェクトを 1 回の upsert に混ぜない（欠けた鍵は既定値/NULL で埋まる）。 */
  assert.match(fn, /insertChunked\(db,\s*"news_articles",\s*plain,[\s\S]{0,120}insertChunked\(db,\s*"news_articles",\s*keepAi,/,
    'the two shapes must be sent as two homogeneous upserts');
});

/* ── ⑦ 記事の地点が変われば Event を数え直す ───────────────────────────── */
/* 綴りのまま: 対象は Deno の Edge Function（Deno.serve・npm: import）で、Node からは読み込めない */
test('#R404 ⑦ relocating an article re-summarises its event — otherwise the AI answer never reaches the map', () => {
  const fn = codeOnly(rd(INGEST));
  assert.match(fn, /async function stageLocate\(db,\s*budget,\s*relocated\)/);
  assert.match(fn, /async function stageAssign\(db,\s*budget,\s*relocated\)/);
  assert.match(fn, /relocated\.add\(/, 'stageLocate never records which articles it moved');
  /* dirty に入る経路が存在すること。**finalOf**（実 ID に解決済み）から引くこと。 */
  const dirty = fn.slice(fn.indexOf('const dirty = new Set()'));
  assert.match(dirty.slice(0, 900), /relocated\.has\(aid\)/, 'the relocated set is never folded into dirty');
  assert.match(dirty.slice(0, 900), /for \(const \[aid, eid\] of finalOf\)/,
    'dirty must be keyed off finalOf — a temporary negative event id would update nothing');
  /* 同じ run の中で locate → assign の順であること。
     ⚠ (#R405) **配列を丸ごと固定しない。** この検査が名指ししている主張は下の 2 行
       （locate は fetch の後・assign の前）であって、段の本数ではない。丸ごと固定すると、
       段が 1 つ増えるたびに**本題と無関係に赤くなり**、直す人は関係を読まずに配列を
       書き換える——それは検査が守っていたものを静かに捨てることになる。
       段の一覧そのものの正本は `tests/news-ingest-checks.test.mjs #R351 ⑱`。 */
  const order = (fn.match(/const ORDER = \[([^\]]*)\]/) || [, ''])[1].replace(/["'\s]/g, '').split(',');
  for (const s of ['fetch', 'locate', 'assign']) assert.ok(order.includes(s), 'stage ' + s + ' left the ORDER');
  assert.ok(order.indexOf('locate') > order.indexOf('fetch'), 'locate must see the articles fetch just wrote');
  assert.ok(order.indexOf('locate') < order.indexOf('assign'), 'events must be built on the AI coordinates');
});

/* ── ⑧ cron が新しい段を呼ぶ（呼ばれない段は存在しない段） ──────────────── */
/* 綴りのまま: 対象は SQL migration で Node からは評価できない（適用と実行は supabase db reset / test db の仕事） */
test('#R404 ⑧ the migration adds `locate` to the running cron job, and never writes the secret', () => {
  const sql = rd(MIGRATION);
  const fn = codeOnly(rd(INGEST));
  const order = (fn.match(/const ORDER = \[([^\]]*)\]/) || [, ''])[1].replace(/["'\s]/g, '').split(',');

  const m = sql.match(/replace\(\s*j\.command,\s*'([^']+)',\s*'([^']+)'\s*\)/);
  assert.ok(m, 'the cron rewrite is gone — the tick job would keep running the old stage list');
  const before = JSON.parse('{' + m[1] + '}').stages;
  const after = JSON.parse('{' + m[2] + '}').stages;
  assert.ok(!before.includes('locate'), 'the search string already contains locate — it will never match production');
  assert.deepEqual(after, before.slice(0, 1).concat(['locate'], before.slice(1)),
    'locate must be inserted right after fetch, leaving the other stages untouched');
  for (const s of after) assert.ok(order.includes(s), 'cron asks for a stage the function does not have: ' + s);
  assert.deepEqual(after, order.filter((s) => after.includes(s)),
    'the cron list must be in the same relative order the function runs them');

  /* ⚠ public なリポジトリなので、cron の command を書き直してはならない（秘密が入っている）。 */
  assert.match(sql, /perform cron\.alter_job\([^)]*command\s*:=\s*newcmd\)/);
  assert.ok(!/x-news-ingest-secret\s*'\s*,\s*'/.test(sql), 'the migration must not spell out the secret header value');
  assert.match(sql, /to_regclass\('cron\.job'\) is null/, 'a machine without pg_cron (db reset / CI) must not fail here');
});

/* ── ⑨ 規則の正本は 1 本（散文を 2 か所に置かない） ──────────────────── */
/* 綴りのまま: 対象は Deno の Edge Function（Deno.serve・npm: import）で、Node からは読み込めない */
test('#R404 ⑨ the AI geolocation rules live in ONE file — both functions import them', () => {
  const ingest = rd(INGEST), refresh = rd('supabase/functions/refresh-news/index.ts');
  for (const [name, src] of [['news-ingest', ingest], ['refresh-news', refresh]]) {
    assert.match(src, /from "\.\.\/_shared\/news-geo-prompt\.js"/, name + ' does not import the shared rules');
    /* 規則 (2) の実文を自分で持っていないこと（＝写しが 2 つある状態） */
    assert.ok(!src.includes('NOT where someone merely SPOKE about it'),
      name + ' still carries its own copy of the rules — one of the two will drift');
  }
  assert.ok(NEWS_GEO_RULES.includes('NOT where someone merely SPOKE about it'),
    'the shared rules lost the dateline clause that #R161 and #R29 both exist to solve');
  /* 返し方は共有しない——書き込み先の列が違う (refresh-news には種別の列が無い)。 */
  assert.ok(!NEWS_GEO_RULES.includes('Reply with ONLY'), 'the reply shape is the caller\'s, not the rules\'');
  assert.ok(ingest.includes('\\"kind\\"'), 'news-ingest must ask for the kind — summariseEvent ranks on it');
});

/* ── ⑩ 「0 件」の理由が残る（#R334 の形をもう一度作らない） ─────────────── */
/* 綴りのまま: 対象は Deno の Edge Function（Deno.serve・npm: import）で、Node からは読み込めない */
test('#R404 ⑩ the locate stage can never fail silently', () => {
  const fn = codeOnly(rd(INGEST));
  const st = fn.slice(fn.indexOf('async function stageLocate'), fn.indexOf('async function stageEmbed'));
  assert.match(st, /skipped:/, 'a stage that did nothing because it is switched off must say so');
  assert.match(st, /lastError/, 'the last upstream failure must be carried out of the loop');
  /* (edge-spend-and-models) the deadline is the shared door's timeoutMs now, still capped by the budget */
  assert.match(st, /AbortSignal\.timeout|callProvider\(cfg, [A-Z_]+, user, Math\.min\(\d+, budget\.left\(\)\)\)/, 'the LLM call needs a deadline of its own');
  assert.match(st, /budget\.left\(\)/, 'the stage must stop before the wall-clock budget does');
  for (const k of ['located', 'omitted', 'considered', 'batches', 'error'])
    assert.ok(new RegExp('\\b' + k + '\\b').test(st), 'the stage does not report ' + k);
  /* 応答だけでなく `news_ingest_runs` にも出ること。 */
  assert.match(fn, /located_ai:\s*L\.located/);
  assert.match(fn, /locate_error:\s*L\.error/);
  assert.match(rd(MIGRATION), /add column if not exists located_ai\b/);
  /* kill-switch とモデル上書きが段ごとに独立していること。
     ⚠ (#R405) 3 つ目の引数 `defaultOn` が足された（**既定で止まっている段**を表す）ので、
       ここは「この段の旗が自分の env 名で引かれていること」だけを見る。引数の**数**を
       固定すると、段が 1 つ増えるたびにこの検査が本題と無関係に赤くなる。
       ⚠ 既定が on か off かの正本は `tests/news-ingest-checks.test.mjs #R405 ⑭` で、そちらは 3 引数を綴りで見る。 */
  assert.match(fn, /providerConfig\("NEWS_GEO_AI",\s*"NEWS_GEO_MODEL"[,)]/);
  assert.match(fn, /providerConfig\("NEWS_TRANSLATE",\s*"NEWS_TRANSLATE_MODEL"[,)]/);
});

/* ── ⑪ 出どころの列は「見た」と「置いた」を分ける ─────────────────────── */
/* 綴りのまま: 対象は SQL migration で Node からは評価できない（適用と実行は supabase db reset / test db の仕事） */
test('#R404 ⑪ "the AI looked at it" and "the AI placed it" are different columns', () => {
  const sql = rd(MIGRATION);
  assert.match(sql, /add column if not exists subject_located_by\b/);
  assert.match(sql, /add column if not exists subject_ai_at\b/);
  assert.match(sql, /check \(subject_located_by in \('ai', 'dict', 'none'\)\)/);
  /* 未処理の記事を引く索引は `subject_ai_at is null` でなければならない——
     `subject_located_by <> 'ai'` で引くと、AI が「場所が無い」と判断した記事を
     毎 run 送り直し、上限を使い切って新しい記事に届かない。 */
  assert.match(sql, /where status = 'active' and subject_ai_at is null/);
  const fn = codeOnly(rd(INGEST));
  assert.match(fn, /\.is\("subject_ai_at",\s*null\)/, 'the todo query does not use the "has the AI seen it" column');
  /* 既存行の出どころは、実際にそうであるとおりに埋める（無条件に 'dict' にしない）。 */
  assert.match(sql, /set subject_located_by = 'dict'[\s\S]{0,200}subject_lng is not null/);
});
}

/* ════════ #R405 — from tests/r405-checks.test.mjs (8 of its 16 tests) ════════ */
{
/* ============================================================================
 *  R405 — 本文は 4 つの綴りで届くのに、2 つしか読んでいなかった
 * ----------------------------------------------------------------------------
 *  #R351 の `parseFeed()` は `<description>` と `<summary>` だけを本文として読み、
 *  **RSS 2.0 で本文を運ぶ最大の口である `<content:encoded>` と Atom の `<content>` を
 *  リポジトリ全体で一度も解析していなかった**（実測 2026-08-24: どちらの綴りも 0 か所）。
 *  読めない綴りで届いた記事は「要約を持たない記事」として保存される——分類にも UI にも
 *  見出ししか残らないが、**フィードは 200 を返し、item も返っている**ので、どの計器も赤に
 *  ならない。
 *
 *  ⚠ 実測 2026-08-24（seed の 33 本 ＋ Bloomberg の直接 RSS 5 本＝38 本を実際に取得）:
 *    · `content:encoded` を今日出しているのは **NPR の 2 本だけ**（20 item 中 13 item で
 *      本文が伸びた）。The Guardian / BBC / NYT の 3 本は 1 つも出していない。
 *    · つまりこの検査が守るのは「今日の取りこぼし」ではなく、**明日どれかのフィードが
 *      綴りを変えた日に、本文が黙って消えないこと**である。
 *
 *  ⚠⚠ そして本文が 0 文字だった本当の理由は綴りではなく**経路**だった。Bloomberg は
 *    `google_news_site` 経由で集めており、Google はこの経路の `<description>` に
 *    **リンクの一覧**を入れる。実測: その URL は 100 item を返し、40 文字以上の本文を持つ
 *    item は **0 本**（本番の Bloomberg 記事 62 本がすべて本文 0 文字）。⇒ migration
 *    `20260824220000_r405_news_feeds.sql` が媒体自身の RSS 5 本へ移し、Google 経由を止める。
 *
 *  ⚠⚠ CNN の direct_rss は 200 と 29 item を返すが**最新の記事が 1,071 日前**である。
 *    これは「壊れている」とは違い、止めるかどうかは別の判断なので、**enabled は触らない**。
 *    ⑥ はその約束のほうを見張る——次のラウンドが「古いから落とす」を静かに足さないため。
 * ==========================================================================*/
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(path.join(ROOT, p));

const MIGRATION = 'supabase/migrations/20260824220000_r405_news_feeds.sql';

/* 記事として成立する最低限（parseFeed は link と title の無い item を落とす）。 */
const HEAD = '<title>Tariffs take effect as the two governments break off talks</title>' +
             '<link>https://x.test/a</link><pubDate>Mon, 24 Aug 2026 08:00:00 GMT</pubDate>';
const rss = (inner) => '<rss><channel><item>' + HEAD + inner + '</item></channel></rss>';

/* ══ ① content:encoded ═══════════════════════════════════════════════════════ */
test('#R405 ① <content:encoded> だけを持つ item から本文が返る（綴りが在るかではなく、食わせて確かめる）', () => {
  const xml = rss('<content:encoded><![CDATA[<p>The prime minister said the new tariffs ' +
                  'would take effect on Sept. 8 unless the talks resume.</p>]]></content:encoded>');
  const [item] = parseFeed(xml);
  assert.equal(item.description,
    'The prime minister said the new tariffs would take effect on Sept. 8 unless the talks resume.',
    '<description> を持たない item は本文を持たない記事として保存されていた');
});

/* ══ ② Atom の <content> ═════════════════════════════════════════════════════ */
test('#R405 ② Atom の <content> でも同じ — <content:encoded> は </content> で閉じない', () => {
  const xml = '<feed><entry><title>A ceasefire holds for a second day in the capital</title>' +
    '<link href="https://at.test/1"/><published>2026-08-24T08:00:00Z</published>' +
    '<content type="html">&lt;p&gt;Both sides said the truce would hold while ' +
    'the mediators met.&lt;/p&gt;</content></entry></feed>';
  const [item] = parseFeed(xml);
  assert.equal(item.link, 'https://at.test/1');
  assert.equal(item.description, 'Both sides said the truce would hold while the mediators met.');
});

/* ══ ③ 長いほうを採る（両向き） ═══════════════════════════════════════════════ */
test('#R405 ③ 剥がしたあとに長いほうが本文になる — content が長ければ content、description が長ければ description', () => {
  const SHORT = 'A short teaser line.';
  const LONG = 'The full opening paragraph, which says who did what and where, and is ' +
               'therefore the part a summary can actually be built from.';

  const contentWins = parseFeed(rss(
    '<description>' + SHORT + '</description>' +
    '<content:encoded><![CDATA[<p>' + LONG + '</p>]]></content:encoded>'))[0];
  assert.equal(contentWins.description, LONG, 'content のほうが長いのに短い description を採っている');

  const descWins = parseFeed(rss(
    '<description>' + LONG + '</description>' +
    '<content:encoded><![CDATA[<p>' + SHORT + '</p>]]></content:encoded>'))[0];
  assert.equal(descWins.description, LONG, 'description のほうが長いのに短い content を採っている');

  /* content が無いフィード（実測では BBC・NYT・Guardian を含む 36/38 本）では、
     #R351 と 1 文字も変わらないこと。 */
  assert.equal(parseFeed(rss('<description>' + LONG + '</description>'))[0].description, LONG);
});

/* ══ ④ リンクの一覧は、どちらの綴りに入っていても本文ではない ═══════════════════ */
test('#R405 ④ Google のリンク一覧は content 側に入っていても捨てられる', () => {
  const LINKS = '&lt;a href="https://news.google.com/rss/articles/CBMiXk"&gt;Headline&lt;/a&gt;' +
                '&lt;font color="#6f6f6f"&gt;Bloomberg&lt;/font&gt;';
  const REAL = 'A genuine opening paragraph about what happened, written by the publisher.';

  assert.equal(parseFeed(rss('<content:encoded>' + LINKS + '</content:encoded>'))[0].description, '',
    'リンクの一覧は要約ではない——見出しの写しを本文として保存してはならない');

  /* 片側だけがリンク一覧なら、もう片方の本物が残る（両向き）。 */
  assert.equal(parseFeed(rss(
    '<description>' + REAL + '</description>' +
    '<content:encoded>' + LINKS + '</content:encoded>'))[0].description, REAL);
  assert.equal(parseFeed(rss(
    '<description>' + LINKS + '</description>' +
    '<content:encoded><![CDATA[<p>' + REAL + '</p>]]></content:encoded>'))[0].description, REAL);
});

/* ─────────────────────────────────────────────────────────────────────────────
 *  migration を読む道具。⚠ `--` の除去は**文字列リテラルの中では止める**——
 *  除去する側が壊れると、以下の検査は「何も書いていない SQL」を見て静かに緑になる。
 * ────────────────────────────────────────────────────────────────────────── */
/* (test-code-only-one) the shared reader's SQL mode: `--` AND block comments, stopping at '…' —
   the scanner that stood here knew only `--`, and the cron.job check below had to strip the block
   comments a second time with the JS regex to stop answering its own explanation. */
const stripSqlComments = (sql) => codeOnly(sql, { lang: 'sql' });
function statements(sql) {
  const src = stripSqlComments(sql);
  const out = [];
  let cur = '', inStr = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      cur += c;
      if (c === "'") { if (src[i + 1] === "'") cur += src[++i]; else inStr = false; }
      continue;
    }
    if (c === "'") { inStr = true; cur += c; continue; }
    if (c === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** UPDATE の SET 句だけ（WHERE の述語を「書き換えている列」と読み違えないため）。 */
function setClause(stmt) {
  const m = stmt.match(/\bset\b([\s\S]*?)\bwhere\b/i);
  return m ? m[1] : stmt.replace(/^[\s\S]*?\bset\b/i, '');
}

/* ══ ⑤ Bloomberg — 直接 RSS 5 本を足し、Google 経由を止める ═══════════════════ */
/* 綴りのまま: 対象は SQL migration で Node からは評価できない（適用と実行は supabase db reset / test db の仕事） */
test('#R405 ⑤ migration は Bloomberg の直接フィード 5 本を足し、google_news_site の 1 本（本番 id 31）を止める', () => {
  const sql = rd(MIGRATION);
  const st = statements(sql);

  const inserts = st.filter((s) => /^insert\s+into\s+public\.news_source_feeds\b/i.test(s));
  assert.ok(inserts.length >= 1, 'news_source_feeds への insert が無い');

  const rows = [];
  for (const s of inserts) {
    for (const m of s.matchAll(/\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(true|false)\s*\)/gi)) {
      rows.push({ source: m[1], url: m[2], collection: m[3], category: m[4], enabled: /^true$/i.test(m[5]) });
    }
  }

  /* 2026-08-24 に実際に 200 と item を返し、link のホストが www.bloomberg.com で
     news_sources.domains と完全一致した 5 本。category はフィード自身の節である。 */
  const EXPECT = [
    ['https://feeds.bloomberg.com/markets/news.rss', 'business'],
    ['https://feeds.bloomberg.com/politics/news.rss', 'politics'],
    ['https://feeds.bloomberg.com/technology/news.rss', 'technology'],
    ['https://feeds.bloomberg.com/industries/news.rss', 'business'],
    ['https://feeds.bloomberg.com/economics/news.rss', 'business'],
  ];
  for (const [url, category] of EXPECT) {
    const r = rows.find((x) => x.url === url);
    assert.ok(r, '直接フィードが足されていない: ' + url);
    assert.equal(r.source, 'bloomberg', url);
    assert.equal(r.collection, 'direct_rss', url);
    assert.equal(r.category, category, url);
    assert.equal(r.enabled, true, url);
  }

  /* 測って**採らなかった** 3 本が紛れ込んでいないこと（wealth は item 0・green は 404・
     business は item 20 のうち 40 文字以上の本文が 3 本だけ）。 */
  for (const url of ['https://feeds.bloomberg.com/wealth/news.rss',
                     'https://feeds.bloomberg.com/green/news.rss',
                     'https://feeds.bloomberg.com/business/news.rss']) {
    assert.ok(!rows.some((x) => x.url === url), '実測で採らないと決めたフィードが入っている: ' + url);
  }

  const disables = st.filter((s) => /^update\s+public\.news_source_feeds\b/i.test(s) &&
                                    /\benabled\s*=\s*false\b/i.test(setClause(s)));
  assert.equal(disables.length, 1, 'enabled を false にする文はちょうど 1 つ（Google 経由の Bloomberg）であるべき');
  const d = disables[0];
  const targetsGoogleBloomberg =
    /\bid\s*=\s*31\b/.test(d) ||
    (/source_id\s*=\s*'bloomberg'/i.test(d) && /collection\s*=\s*'google_news_site'/i.test(d)) ||
    /news\.google\.com\/rss\/search\?q=[^']*site:bloomberg\.com/i.test(d);
  assert.ok(targetsGoogleBloomberg, '止めた行が「Bloomberg の google_news_site」を指していない: ' + d);

  /* ⚠ 行は消さない。news_articles.feed_id がこの行を参照しており、
     消せば「どこから届いたか」を後から説明できなくなる。 */
  assert.ok(!/\bdelete\s+from\s+public\.news_source_feeds\b/i.test(stripSqlComments(sql)),
    'フィードの行を削除してはならない（news_articles.feed_id が参照している）');
});

/* ══ ⑥ CNN — 事実は書くが、enabled は触らない ════════════════════════════════ */
/* 綴りのまま: 対象は SQL migration で Node からは評価できない（適用と実行は supabase db reset / test db の仕事） */
test('#R405 ⑥ migration は CNN（本番 feed 15）の enabled を変えない — 書き込むのは last_error だけ', () => {
  const sql = rd(MIGRATION);
  const st = statements(sql);
  const CNN = /rss\.cnn\.com|'cnn'|\bid\s*=\s*15\b/i;

  for (const s of st) {
    if (!/^update\b/i.test(s)) continue;
    if (!/\benabled\s*=/i.test(setClause(s))) continue;
    assert.ok(!CNN.test(s),
      'CNN の行の enabled を触っている——「取れているが古い」を止めるかどうかは別の判断である: ' + s);
  }

  const cnn = st.filter((s) => CNN.test(s));
  assert.equal(cnn.length, 1, 'CNN の行に触る文はちょうど 1 つ（last_error への書き込み）であるべき');
  assert.match(setClause(cnn[0]), /\blast_error\s*=/i, '実測した事実を last_error に書いていない');
  assert.doesNotMatch(setClause(cnn[0]), /\benabled\b/i, 'その 1 文が enabled も書き換えている');
  /* 何を測ったかが行に残っていること（「古い」ではなく日数で言う）。 */
  assert.match(cnn[0], /1071 days old/, '「どれだけ古いか」を実測値で書いていない');
});


/* ============================================================================
 *  R405 (続き) — 出来事の中身が、IntMap の中で読めること
 * ----------------------------------------------------------------------------
 *  #R386 が出荷した Event UI は、構成記事の `description` を**取ってきておきながら
 *  1 文字も出していなかった**（`desc: ''` が固定・読者は `differences()` ただ 1 人で
 *  本番 1,069 Event 中 2 件しか発火しない）。⇒ 外部記事を開かない限り、IntMap の中では
 *  何が起きたか分からない。
 *
 *  ⚠ 下の検査は「綴りが在るか」ではなく**規則が実際にそう振る舞うか**を見る。
 *    `js/news-brief.js` は純粋なモジュールなので、Node から本物の入力を食わせられる。
 * ==========================================================================*/

const { makeNewsClaims } = await import('../js/news-claims.js');
const { makeNewsBrief } = await import('../js/news-brief.js');
const B = makeNewsBrief(makeNewsClaims());

const m = (o) => ({
  id: o.id || 1, title: o.title || '', description: o.description || '', url: o.url || '',
  sourceId: o.sourceId || 'x', sourceName: o.sourceName || 'X', family: o.family || o.sourceId || 'x',
  publishedAt: o.publishedAt || '2026-08-24T00:00:00Z',
});

/* ── ⑭ サーバーの統合文は、根拠を照合してからしか保存されない ─────────── */
/* 綴りのまま: 対象は Deno の Edge Function（Deno.serve・npm: import）で、Node からは読み込めない */
test('#R405 ⑭ the LLM summary is span-verified server-side and rejected whole', () => {
  const fn = rd('supabase/functions/news-ingest/index.ts');
  /* ⚠ **60 KB のファイルに `assert.match` を使わない。** 落ちたときに全文を印字するので、
     何が起きたか読めなくなる（このリポジトリが何度も払っている形）。`includes` で見る。 */
  const has = (needle, why) => assert.ok(fn.includes(needle), why + "  — 見つからない綴り: " + needle);
  /* 断片が原文に在ることを確かめている。 */
  has("haystack.get(outlet).includes(normSpan(span))", "根拠の断片を原文と照合していない");
  /* 1 文でも通らなければ Event 丸ごと捨てる（部分採用しない）。 */
  has("if (bad) { note(bad); rejected++; continue; }", "検証に落ちた返答を部分採用している");
  /* 独立 2 媒体以上にしか払わない。 */
  has("if (outlets.size < 2) continue;", "単独媒体の Event にも LLM を通している");
  /* 捨てた数と理由が計測に残る（黙って 0 件になる AI 経路を作らない）。 */
  has("summarise_reject_reasons", "捨てた理由を telemetry に出していない");
  /* ⚠ 翻訳は**既定で止まっている**。#R404 の `providerConfig(offEnv, modelEnv, defaultOn)` に
     3 つ目の引数として乗せてある——同じ結論へ別の道で着いたので、先に入っていた側を採った。 */
  has('providerConfig("NEWS_TRANSLATE", "NEWS_TRANSLATE_MODEL", false)', "日本語訳が既定で走ったままになっている");
  /* 要約は要約自身の kill-switch を持つ（1 本の旗が AI 経路ぜんぶの門にならないように）。 */
  has('providerConfig("NEWS_SUMMARY", "NEWS_SUMMARY_MODEL")', "要約の kill-switch が翻訳と同じ旗になっている");
});

/* ── ⑯ cron は API から動かせる書き方で書く ──────────────────────────────
   ⚠⚠⚠ **実測 (2026-08-24・本番)**: migration を Management API から適用する経路
   (`supabase db query --file … --linked`) の login role は `cron.job` に**直接
   UPDATE できない** —— `permission denied for table job` で **migration ごと
   ロールバックする**。適用は 1 トランザクションなので部分適用にはならないが、
   「CI では緑・本番では 1 行も入らない」という形になる（CI に pg_cron は無いので、
   その do-block は `to_regclass` で自分を飛ばして通ってしまう）。
   ⇒ cron を触る migration は `cron.schedule` / `cron.unschedule` /
     `cron.alter_job` だけを使う。⚠ #R404 の migration も同じ規則で書かれている。
   ⚠ この検査は「本番で通るか」を測れない——測れるのは**通らないと分かっている書き方を
     していないこと**である。そこは正直に言っておく。 */
/* 綴りのまま: 対象は SQL migration で Node からは評価できない（適用と実行は supabase db reset / test db の仕事） */
test('#R405 ⑯ cron を触る migration は cron.job を直接 UPDATE しない（API の role には権限が無い）', () => {
  const dir = path.join(ROOT, "supabase", "migrations");
  const offenders = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
    /* ⚠ **散文に当たらせない。** 行コメントだけを外すと、この規則の理由を説明した
       ブロックコメントの中の «update cron.job» に検査が答えてしまう（このリポジトリで 13 回目の形）。
       ⇒ ブロックコメントも外す——共有の SQL 読み（codeOnly の lang:'sql'）は両方を外す。 */
    const sql = stripSqlComments(readLF(path.join(dir, f)));
    /* `update cron.job …` と `insert into cron.job …` / `delete from cron.job …` */
    if (/\b(?:update|delete\s+from|insert\s+into)\s+cron\.job\b/i.test(sql)) offenders.push(f);
  }
  assert.deepEqual(offenders, [],
    "cron.job を直接書き換える migration は本番で permission denied になる: " + offenders.join(", "));
  /* このラウンドの migration が、実際に使ってよい関数のほうを呼んでいること。 */
  const mine = stripSqlComments(rd(MIGRATION));
  assert.match(mine, /perform\s+cron\.schedule\(/, "cron.schedule を呼んでいない");
  assert.match(mine, /perform\s+cron\.unschedule\(/, "古い job を外していない");
});
}

/* ════════ #R386 — from tests/r386-checks.test.mjs (11 of its 19 tests) ════════ */
{
/* ============================================================================
 *  R386 — 出来事を利用者に届ける（Phase C / D / E）
 * ----------------------------------------------------------------------------
 *  #R334 が表を敷き、#R351 がパイプラインを本番で回した。それでも **`news_events` は
 *  本番に 892 行あるのに、配信バンドルからそこへ到達する経路が 1 本も無かった**
 *  （#R351 追記の本番検証）。このラウンドが足したのは 3 つ:
 *
 *    C  recall（塊どうしを結ぶ `link` 段）と運用者の Merge/Split/Reassign/undo
 *    D  出来事の一覧・カテゴリ chips・詳細（媒体ごとの相違）・1 出来事 1 ピン・★
 *    E  Atlas の capability と state provider、そして既定の切り替え
 *
 *  ⚠ 実データで測って初めて分かったことが 3 つあり、この検査はそれを固定する:
 *    ① **この鍵は埋め込みモデルに届かない**（実測 2026-08-24: `/v1/models` が 1 件しか
 *       返さず、`text-embedding-3-small` は 403 `model_not_found`）。⇒ `link` 段は
 *       **埋め込みが 1 本も無くても動かなければならない**。
 *    ② **割合だけの推移の検算は、分母が小さいと 1 本の辺で満たされる。** 空撃ちで出た
 *       17 対を人が読むと 15 正 / 2 誤で、誤りはどちらも合致 1〜2 本だった。
 *    ③ **本番の `public.is_admin` は引数を取る。** リポジトリの baseline が宣言する
 *       引数なしの版は本番に存在しない ⇒ migration はそれを呼んではならない。
 * ========================================================================== */
   /* (#R394) 相違の規則は表示の層から出た */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(path.join(ROOT, p));

/* 記事 1 本ぶんの形。地点は `subject_*`、種類は `subject_type`（DB の列名と同じ）。 */
let _id = 0;
const art = (title, o = {}) => ({
  id: ++_id, title,
  title_fingerprint: o.fp || null,
  published_at: o.at || '2026-08-24T09:00:00Z',
  subject_lng: o.lng, subject_lat: o.lat, subject_type: o.kind,
  source_family: o.fam || ('fam' + _id),
  source_id: o.src || o.fam || ('src' + _id),
  description: o.desc || '',
});

/* ══ ① `link` 段は埋め込みが 1 本も無くても候補を出す ═══════════════════════════════
   ⚠ これは「あれば良い」ではなく**この鍵での唯一の経路**である。埋め込みだけを入口に
     した最初の実装は、本番で 1 対も出せなかった（403 model_not_found）。 */
test('#R386 ① 塊どうしの候補は、埋め込みが 1 本も無くても珍しい語の共有から出る', () => {
  const A = [art('Carney says Canada will impose retaliatory tariffs on various US sectors', { lng: -106, lat: 56, kind: 'country', fam: 'reuters' })];
  const B = [art('Canada readies retaliatory tariffs as Carney calls trade talks collapsed', { lng: -106, lat: 56, kind: 'country', fam: 'npr' })];
  const C = [art('Chinese robot beats Usain Bolt 100m world record at Beijing humanoid games', { lng: 116, lat: 40, kind: 'city', fam: 'bbc' })];
  const members = new Map([[1, A], [2, B], [3, C]]);
  const idf = buildIdf([...A, ...B, ...C]);
  const pairs = eventPairCandidates(members, idf, INDEX, 50);
  const key = (a, b) => Math.min(a, b) + ':' + Math.max(a, b);
  const got = new Set(pairs.map((p) => key(p.event_a, p.event_b)));
  assert.ok(got.has(key(1, 2)), 'the two Canada events must be a candidate pair');
  /* ロボットの塊とは語を共有していないので候補にならない。 */
  assert.ok(!got.has(key(1, 3)) && !got.has(key(2, 3)), 'unrelated events must not become candidates');
  /* 埋め込みの列は 1 つも読んでいない（引数にも無い）。 */
  assert.equal(eventPairCandidates.length >= 2, true);
});

/* ══ ② 1 本の辺だけで塊を結ばない ═════════════════════════════════════════════════
   実測（2026-08-24・本番 898 Event）で誤って結ばれた 2 対は、どちらも合致が 1〜2 本
   だった。`transitivity` は割合なので、分母が小さいと 1 本で満たされる。 */
test('#R386 ② 合致した対が 1 本しかない塊どうしは結ばない（linkMinMatched）', () => {
  /* ⚠⚠⚠ **この組み立ては「1 対だけが合致する」ことを先に確かめてから使う。** 最初に書いた
     fixture は 1 対も合致しておらず、検査は**理由のない緑**だった（このリポジトリが何度も
     払ってきた形そのもの）。だから下の 2 行が先にある。 */
  const g = { lng: -119.8, lat: 39.5, kind: 'city' };
  const a1 = art('Wildfire approaches Reno Nevada forcing thousands to evacuate neighbourhoods', { ...g, fam: 'apnews' });
  const a2 = art('Nevada casino regulators approve new licence for downtown operator', { ...g, fam: 'kolo' });
  const b1 = art('Fast-moving wildfire in Reno Nevada forces thousands to evacuate homes', { ...g, fam: 'guardian' });
  const idf = buildIdf([a1, a2, b1]);
  assert.equal(pairVerdict(a1, b1, DEFAULTS, idf).same, true, 'fixture: a1 and b1 must agree');
  assert.equal(pairVerdict(a2, b1, DEFAULTS, idf).same, false, 'fixture: a2 and b1 must NOT agree');

  const v = eventsAgree([a1, a2], [b1], idf, DEFAULTS, null, INDEX.maxMembers);
  assert.equal(v.matched, 1);
  assert.equal(v.pairs, 2);
  /* ⚠ 割合の規則は**満たされている**（0.5 ≥ 0.34）。止めているのは対の本数のほうである。 */
  assert.ok(v.share >= DEFAULTS.transitivity, 'the ratio rule alone would have said yes');
  assert.equal(v.same, false, 'a single matching pair must not merge two clusters');

  /* 門を外すと同じ入力が通る＝この検査は門を測っている。 */
  const loose = eventsAgree([a1, a2], [b1], idf, { ...DEFAULTS, linkMinMatched: 1 }, null, INDEX.maxMembers);
  assert.equal(loose.same, true, 'with the guard removed the same input merges — the guard is what decides');

  /* 定数は 1 つで、`transitivity` はそのまま使われている（第 2 の推移規則を作っていない）。 */
  assert.equal(DEFAULTS.linkMinMatched, 3);
  assert.equal(DEFAULTS.transitivity, 0.34);
});

test('#R386 ②b 十分な数の対が合致する塊どうしは結ぶ', () => {
  const mk = (t, fam) => art(t, { lng: -106, lat: 56, kind: 'country', fam });
  const A = [mk('Canada says it will match new US 50% tariffs dollar for dollar', 'france24'),
             mk('Canada to match US tariffs dollar for dollar PM Carney says', 'aljazeera'),
             mk('America has changed Canada to match Trump tariffs dollar for dollar', 'skynews')];
  const B = [mk('Canada vows dollar for dollar response as US puts 50% tariffs on some goods', 'guardian'),
             mk('Canada hits back on US tariffs as Carney says at war on trade', 'bloomberg')];
  const idf = buildIdf([...A, ...B]);
  const v = eventsAgree(A, B, idf, DEFAULTS, null, INDEX.maxMembers);
  assert.equal(v.same, true, 'the measured true-positive from production must still merge');
  assert.ok(v.matched >= DEFAULTS.linkMinMatched);
});

/* ══ ③ 埋め込みの入口は、既存の呼び出し側の答えを 1 ビットも変えない ═══════════════ */
test('#R386 ③ sim を渡さない pairVerdict は #R351 と同じ答えを返す', () => {
  const a = art('Wildfire approaches Reno Nevada forcing thousands to evacuate', { lng: -119.8, lat: 39.5, kind: 'city' });
  const b = art('Fast-moving wildfire in Reno Nevada forces thousands to evacuate homes', { lng: -119.8, lat: 39.5, kind: 'city' });
  const idf = buildIdf([a, b]);
  const four = pairVerdict(a, b, DEFAULTS, idf);
  const five = pairVerdict(a, b, DEFAULTS, idf, null);
  assert.equal(four.same, five.same);
  assert.equal(four.code, five.code);
  assert.notEqual(four.code, 'embedding', 'a verdict with no similarity must never be credited to embedding');
});

test('#R386 ③b `far` では埋め込みの入口を開かない（まとめ記事が橋になる形を通しやすくしない）', () => {
  assert.equal(DEFAULTS.embed.far, null, 'the embedding entrance must stay closed for geographically disagreeing pairs');
  const a = art('Podcast Trump tariffs hit Canada ballroom reprieve and Somali piracy', { lng: -106, lat: 56, kind: 'country' });
  const b = art('Somali pirates seize tanker off Puntland coast', { lng: 48, lat: 8, kind: 'city' });
  const idf = buildIdf([a, b]);
  const v = pairVerdict(a, b, DEFAULTS, idf, 0.99);   /* 意味的にはいくら近くても */
  assert.notEqual(v.code, 'embedding');
  assert.ok(String(v.reasons.join(' ')).includes('closed for far'), 'the verdict must say the entrance was closed, not stay silent');
});

test('#R386 ③c 埋め込みで通った対は、語の量ではなく意味の近さで採点される', () => {
  const byWords = { same: true, code: 'jaccard', j: 0.5, containment: 0.4, weighted: 0.3 };
  const byEmbed = { same: true, code: 'embedding', j: 0, containment: 0, weighted: 0, sim: 0.88 };
  assert.equal(pairScore(byWords), 1.2);
  assert.equal(pairScore(byEmbed), 0.88, 'an embedding match must not score 0 — it would always lose the best-candidate race');
});

/* ══ ④ 埋め込みの候補は、語の候補を押しのけない ════════════════════════════════════ */
test('#R386 ④ 語で見つかった候補が先に来て、埋め込みの候補はその後ろに足される', () => {
  const win = [];
  for (let i = 0; i < 6; i++) win.push(art('unrelated filler headline number ' + i + ' zzz' + i, { fam: 'f' + i }));
  const inEvent = art('Evergrande founder sentenced to life in Shenzhen court', { lng: 114, lat: 22.5, kind: 'city', fam: 'reuters' });
  inEvent.event_id = 11;
  const farAway = art('Completely different wording about a property developer verdict', { lng: 114, lat: 22.5, kind: 'city', fam: 'bbc' });
  farAway.event_id = 22;
  const fresh = art('Chinese court sentences Evergrande founder to life', { lng: 114, lat: 22.5, kind: 'city', fam: 'apnews' });
  const index = buildCandidateIndex([...win, inEvent, farAway, fresh]);

  const withEmbed = candidateEvents(fresh, index,
    [{ neighbour_id: farAway.id, event_id: 22, similarity: 0.93 }]);
  assert.equal(withEmbed[0].event_id, 11, 'the word candidate must stay first');
  assert.ok(withEmbed.some((c) => c.event_id === 22), 'the embedding candidate must be added');
  /* 埋め込みを渡さなければ、答えは #R351 と同じ。 */
  const without = candidateEvents(fresh, index);
  assert.deepEqual(without.map((c) => c.event_id), [11]);
});

/* ══ ⑤ migration は本番に存在しない関数を呼ばない ════════════════════════════════
   実測 2026-08-24: 本番の `public.is_admin` は `(uid uuid)` だけで、引数なしの版は無い。
   #R334 の migration が本番に通ったのは、述語をインラインで書いていたからである。 */
/* 綴りのまま: 対象は SQL migration で Node からは評価できない（適用と実行は supabase db reset / test db の仕事） */
test('#R386 ⑤ Phase C の migration は public.is_admin() を呼ばず、admin を述語で確かめる', () => {
  const sql = rd('supabase/migrations/20260824090000_news_events_phase_c.sql');
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.ok(!/public\.is_admin\s*\(/.test(code),
    'production has is_admin(uid uuid) only — calling the repository baseline’s zero-argument form fails there');
  /* 4 つの入口すべてが admin を確かめている（grant は「呼べる」であって「やってよい」ではない）。 */
  for (const fn of ['news_event_merge', 'news_event_reassign', 'news_event_update_meta', 'news_event_undo']) {
    const i = code.indexOf('function public.' + fn + '(');
    assert.ok(i > 0, fn + ' must exist');
    const body = code.slice(i, code.indexOf('$$;', i));
    assert.ok(/profiles p where p\.id = \(select auth\.uid\(\)\) and p\.is_admin/.test(body),
      fn + ' must check the admin predicate itself');
  }
  /* 機械の口（`link` 段）は admin を要求しない代わりに service_role にしか grant されない。 */
  assert.ok(/grant execute on function public\.news_event_merge_into\([^)]*\) to service_role;/.test(code));
  assert.ok(!/news_event_merge_into\([^)]*\) to authenticated/.test(code));
});

/* 綴りのまま: 対象は SQL migration で Node からは評価できない（適用と実行は supabase db reset / test db の仕事） */
test('#R386 ⑤b 運用者は「どの記事がどの Event に属するか」だけを直せる', () => {
  const sql = codeOnly(rd('supabase/migrations/20260824090000_news_events_phase_c.sql'), { lang: 'sql' });
  /* 上流が何と言ったかと、機械が何を根拠に判定したかは書き換えさせない。 */
  assert.ok(!/update\s+public\.news_articles\b(?![^;]*embedding)/i.test(sql),
    'no operator path may rewrite an article');
  assert.ok(!/update\s+public\.news_cluster_decisions/i.test(sql),
    'no operator path may rewrite the machine’s audit of its own decision');
});

/* ══ ⑭ #R351 が守っているものを壊していない ═════════════════════════════════════ */
/* 綴りのまま: 対象は Deno の Edge Function（Deno.serve・npm: import）で、Node からは読み込めない */
test('#R386 ⑭ current_news と refresh-news には触れていない', () => {
  const fn = codeOnly(rd('supabase/functions/news-ingest/index.ts'));
  assert.ok(!fn.includes('current_news'));
  assert.ok(!fn.includes('refresh-news'));
  /* 段は 7 つになった（#R405 が `summarise` を足した）が、cron が body で段を選ぶ形は
     変わっていない——**この検査が見張っているのは段の本数ではなく、この関数が
     `current_news` と `refresh-news` に触れていないこと**である。順序の正本は
     `tests/news-ingest-checks.test.mjs #R351 ⑱`。 */
  assert.match(fn, /\["fetch", "locate", "embed", "assign", "link", "entities", "summarise", "translate", "prune"\]/);
});

/* 綴りのまま: 対象は Deno の Edge Function（Deno.serve・npm: import）で、Node からは読み込めない */
test('#R386 ⑮ 埋め込みが使えないことは、応答に必ず出る', () => {
  const fn = rd('supabase/functions/news-ingest/index.ts');
  /* 黙って 0 件になる AI 経路をもう一度作らない（#R334 が測り #R351 が突き止めた形）。 */
  assert.ok(fn.includes('available_embedding_models'), 'the stage must report what the key CAN reach');
  assert.ok(fn.includes('configured_model'), 'and what it was asked for');
  assert.ok(/skipped: cfg\.off/.test(fn), 'and say when it was switched off rather than failing');
  /* 次元が合わないベクトルを黙って入れない。 */
  assert.ok(fn.includes('rejected_wrong_dim'));
  assert.ok(fn.includes('EMBED_DIM'));
});
}

/* ════════ #R394 — from tests/r394-checks.test.mjs (7 of its 12 tests) ════════ */
{
/* ============================================================================
 *  R394 — 監査が嘘をついていた／一度も発火していなかった門
 * ----------------------------------------------------------------------------
 *  #R386 が出来事を利用者に届けたあと、本番の表を読み直して分かったこと:
 *
 *   ⚠⚠⚠ ① **埋め込みを持つ記事は 0 行なのに、`assigned_by='embedding'` の辺が 23 本**
 *          あった。`news_event_merge_into` が機械の merge に無条件でその名前を書いて
 *          いたためで、`link` 段の候補は**語からしか出ていない**（この鍵は埋め込み
 *          モデルに届かない）。監査の列が情報ではなく**嘘**を持っていた。
 *   ⚠⚠⚠ ② **#R351 が書いた索引記事の門は、一度も発火していなかった。**
 *          `…the following (is|are)\b` の `\b` が**バックスペース文字 1 個**（0x08）に
 *          潰れていた。JavaScript としては妥当なので `node --check` も lint も黙る。
 *   ⚠⚠⚠ ③ **索引ページは 3 本ではなく 43 本あった**（Reuters の銘柄ページ 33・AP の
 *          話題ページ 10）。8 つの Event を汚し、#1221 は 3 本とも NBA の索引ページ。
 *   ⚠⚠  ④ **「値が違う」を「食い違っている」と読ませていた。** 香港の上場の塊で
 *          Shein の $1.8B/$27B と Alibaba の $10B/$10.2B が並び、「媒体が食い違って
 *          いる」と表示されていた——同じ数字についての相違ではない。
 *
 *  数字はすべて 2026-08-24 の本番データ（active 1,367〜1,377 本 / Event 1,069〜1,076）で
 *  測った値である。
 * ========================================================================== */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(path.join(ROOT, p));

const DESC = 'a long enough description with plenty of words in it so the short-title gate does not fire';

/* ══ ① 索引ページの門 — 実測した綴りで落ち、実測した本物は残る ═══════════════════ */
test('#R394 ① 通信社の索引ページは落ち、署名記事は落ちない（実測した綴りだけで判定する）', () => {
  /* 本番に実在した索引ページ（Reuters 33 本・AP 10 本の代表）。 */
  for (const t of [
    '(IBX.N) | Stock Price & Latest News',
    '(CLEMO.ST) | Stock Price & Latest News',
    'Weather, Hurricanes and Storms | Latest News & Updates',
    'Australia News | Latest News in Australia',
    'Europe News | Breaking European News Today',
    'NBA Scores & Daily News | NBA Stats, Scores & News Today',
    'Volodymyr Zelenskiy News | Today’s Latest Stories',
  ]) assert.equal(headlineReject(t, DESC, 'https://x/y'), 'title_not_an_article', t);

  /* ⚠⚠ **`|` そのものを門にしてはならない。** The Guardian は署名記事をこの形で出す。
     実測: `|` を持つ見出し 47 本のうち、本物はこの 4 本だった。 */
  for (const t of [
    'Stores are selling Halloween stuff in August. Time has lost all meaning | Dave Schilling',
    'An AI ‘debt bomb’ crisis? No. This isn’t Enron 2.0 | Gene Marks',
    'Is this why close encounters with intelligent aliens have so far eluded us? | Letters',
    'Canada-U.S. Trade War Escalates as Talks Collapse',
  ]) assert.equal(headlineReject(t, DESC, 'https://x/y'), null, t);
});

test('#R394 ①b NPR の «…. And, …» 型は 1 つの出来事についての報道ではない', () => {
  assert.equal(
    headlineReject('Trump declares economic warfare on Iran. And, SCOTUS to rule on White House ballroom', DESC, 'https://x/y'),
    'multi_event_digest');
  /* 普通の見出しの «and» は当たらない（コンマの無い and、文中の and）。 */
  for (const t of ['Canada and the US fall deeper into a trade war as talks collapse',
                   'Robot boxing, football and sprinting at World Humanoid Games'])
    assert.equal(headlineReject(t, DESC, 'https://x/y'), null, t);
});

/* ══ ② 一度も発火していなかった門 ═══════════════════════════════════════════════ */
test('#R394 ② #R351 の索引記事の門が、いま実際に発火する', () => {
  /* ⚠ これは新しい規則ではない。#R351 が書いたものが、`\\b` の潰れで**死んでいた**。
     ここが赤くなるのは、また誰かが同じ潰し方をした日である。 */
  const yon = headlineReject(
    'Yonhap News Summary',
    'SEOUL, Aug. 22 (Yonhap) -- The following is the second summary of major stories moved by Yonhap News Agency on Friday.',
    'https://x/y');
  assert.equal(yon, 'multi_event_digest', "#R351's own rule is dead again");
});

test('#R394 ②b 正規表現の中に生の制御文字が 1 つも無い（潰れたエスケープを門が見張る）', () => {
  /* 走らせるのは `scripts/static-checks.mjs` の規則そのもの——検査が第二の実装を持たない。
     ⚠ (tests-by-topic) 以前はスクリプト全体を子プロセスで走らせていた（58 秒）。そのため無関係な
     規則が 1 つ赤いだけでこの検査も赤くなり（execFileSync は非ゼロ終了で throw する）、しかも
     「規則が本当に落ちる」ほうは、この検査の中に書いた**規則の写し**で確かめていた。いまは規則の
     ブロックそのものをソースから取り出して評価し、同じ 1 本に ①実際の木 ②壊れた形の見本 ③意図的な
     区切り文字 を食わせる。規則が書き換わればここもそれを走らせる。 */
  const sc = fs.readFileSync(path.join(ROOT, 'scripts/static-checks.mjs'), 'utf8');
  const at = sc.indexOf('const isCtrl');
  assert.ok(at > 0, 'the regex-control-char rule is no longer where this check reads it');
  const open = sc.lastIndexOf('{', at);
  let depth = 0, close = -1;
  for (let k = open; k < sc.length; k++) {
    if (sc[k] === '{') depth++;
    else if (sc[k] === '}' && !--depth) { close = k; break; }
  }
  const block = sc.slice(open, close + 1);
  assert.ok(block.includes("err('regex-control-char'"), 'the lifted block is the rule that reports regex-control-char');
  const runRule = (files, read) => {
    const errs = [];
    new Function('textFiles', 'read', 'err', block)(files, read, (check, msg) => errs.push({ check, msg }));
    return errs;
  };
  const NL = String.fromCharCode(10);
  /* ① the real tree — every JS/TS file git would show (tracked, and untracked-but-not-ignored) */
  const rels = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', '*.js', '*.mjs', '*.ts'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split(NL).map((l) => l.trim()).filter(Boolean);
  assert.ok(rels.length > 500, 'the tree was listed (' + rels.length + ' files)');
  const found = runRule(rels.map((rel) => ({ rel, abs: path.join(ROOT, rel) })), (fl) => {
    try { return fs.readFileSync(fl.abs, 'utf8'); } catch { return ''; }
  });
  assert.deepEqual(found.map((e) => e.msg), [], 'a regular expression carries a raw control character');
  /* ② ⚠ 門が本当に落ちることを、同じ規則に壊れた形を食わせて確かめる。 */
  const CTRL = String.fromCharCode(8);
  const bad = runRule([{ rel: 'fixture.js' }], () => '  const re = /the following (is|are)' + CTRL + '/i;' + NL);
  assert.deepEqual(bad.map((e) => e.check), ['regex-control-char'],
    'the rule the gate uses would not catch the very shape it exists for');
  /* ③ …and a control character used deliberately as a separator in a STRING is not flagged */
  const sep = runRule([{ rel: 'fixture.js' }], () => "  const SEP = '" + String.fromCharCode(1) + "';" + NL);
  assert.deepEqual(sep, [], 'a separator in a string literal is flagged — the rule would forbid js/world-packs.js');
});

/* ══ ④ 機械の merge は、実際に決めたものの名前を書く ═══════════════════════════════ */
/* 綴りのまま: 対象は Deno の Edge Function（Deno.serve・npm: import）で、Node からは読み込めない */
test('#R394 ④ link 段は「何が決めたか」を渡し、無かった cos を 0 と書かない', () => {
  const fn = codeOnly(rd('supabase/functions/news-ingest/index.ts'));
  assert.match(fn, /p_decided_by: decidedBy/, 'the merge call must pass what decided it');
  assert.match(fn, /verdict\.top && verdict\.top\.code === "embedding"/, 'and derive it from the verdict');
  /* ⚠ `Number(null).toFixed(3)` は "0.000"。無かったものを 0 と書くのは、無かったと
     書くことではない——本番の監査に「cos 0.000」が 11 行残っていた。 */
  assert.ok(!/Number\(p2\.similarity\)\.toFixed/.test(fn), 'a missing cosine is being printed as 0.000 again');
  assert.match(fn, /no embedding \(candidate came from shared rare words\)/, 'the note must say there was no cosine');

  const sql = rd('supabase/migrations/20260824190000_news_event_decided_by.sql');
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.match(code, /p_decided_by text default 'deterministic'/, 'the mechanism must take it as an argument');
  assert.ok(!/else 'embedding' end/.test(code), 'the machine still hardcodes a mechanism name');
  /* 呼び出し側が嘘をつけないよう、値そのものを確かめている。 */
  assert.match(code, /p_decided_by not in \('deterministic','embedding','llm'\)/);
  /* ⚠ 4 引数の古い形が残ると、知らない呼び出し側がそちらに解決して直した経路が迂回される。 */
  assert.match(code, /drop function if exists public\.news_event_merge_into\(bigint, bigint, uuid, text\);/);
});

/* 綴りのまま: 対象は SQL migration で Node からは評価できない（適用と実行は supabase db reset / test db の仕事） */
test('#R394 ④b 直すのは「名札」だけで、判定には触れない', () => {
  const sql = rd('supabase/migrations/20260824190000_news_event_decided_by.sql');
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  /* 名札を直す UPDATE は、**その機構の入力が存在しないことが証明できる行だけ**を見る。 */
  const i = code.indexOf("set assigned_by = 'deterministic'");
  assert.ok(i > 0, 'the relabel is gone');
  const stmt = code.slice(i, code.indexOf(';', i));
  assert.match(stmt, /l\.assigned_by = 'embedding'/);
  assert.match(stmt, /a\.embedding is null/, 'it must only touch links whose article provably has no embedding');
  /* ⚠ **名札を直す文が、どの Event に属するかを動かしていない**ことを、その文だけを見て
     確かめる。migration の他の場所（merge の機構）は当然 `event_id` を動かす——そこまで
     禁じる検査は、直したい対象ではなく仕組みそのものを禁じてしまう。 */
  assert.ok(!stmt.includes('event_id'), 'the relabel statement is moving articles between events');
  assert.ok(!stmt.includes('status'), 'the relabel statement is changing an article status');
});

/* ══ ⑥ 計器が本番を測れる ═══════════════════════════════════════════════════════ */
/* 綴りのまま: 対象は本番の表を読む計測 CLI（scripts/news-events-eval.mjs）で、ここでは走らせない */
test('#R394 ⑥ 計測器は「走っていない機構を名乗る辺」を数える', () => {
  const s = rd('scripts/news-events-eval.mjs');
  assert.match(s, /走っていない機構を名乗る辺/, 'the integrity line is gone');
  assert.match(s, /embedding_model/, 'it must read whether an embedding actually exists');
  assert.match(s, /--diffs/, 'the differences mode is gone');
  /* ⚠ 計器が UI と違うものを測らない: 要約まで読む（見出しだけだと歩留まりが半分になる）。 */
  assert.match(s, /news_articles\?select=id,source_id,title,description,embedding_model/,
    'the instrument is not fetching the descriptions the UI reads');
});
}
