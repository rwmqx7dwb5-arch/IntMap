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

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

import {
  parseFeed, stripHtml, decodeXml, isLinkList, normHost, hostOf, buildRegistry, attribute,
  displayTitle, headlineReject, titleWordCount, MIN_TITLE_WORDS, MIN_DESC_WORDS,
  classifySpecial, classifyByTags, categorise, normaliseTags, tagsOf,
  buildCandidateIndex, candidateEvents, placeArticle, findOutlier, attachEvent,
  summariseEvent, clusterConfidence, toArticleRow, retentionCutoffs, RETENTION, INDEX,
} from '../supabase/functions/_shared/news-ingest.js';
import {
  geoClass, DEFAULTS, buildIdf, normaliseUrl, tokenise,
} from '../supabase/functions/_shared/news-cluster.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(path.join(ROOT, p));
/* ⚠ 注釈の中の語で検査してはならない。「current_news を触らない」と**書いてある**ことを
 *   「触らない」の証拠にすると、その注釈を消しただけで検査が動く。見るのはコードだけ
 *   （#R285 の codeOnly と同じ形）。 */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

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
test('① the registry says www.bbc.co.uk and the normalised article says bbc.co.uk — they must still meet', () => {
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
test('② attribution is exact-host only — Sky News does not own sky.com, and CNN does not own an affiliate ad', () => {
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
test('③ a Google News redirect is not a canonical URL, and the real publisher comes from <source url>', () => {
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
test('④ RSS 2.0, RDF and Atom all parse, and <items><rdf:Seq> is not an item', () => {
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
test('⑤ escaped HTML is decoded BEFORE tags are stripped — the other order strips nothing', () => {
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
test('⑥ a title too short to say what happened needs the publisher\'s own summary AND a canonical URL', () => {
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
test('⑦ two stories resolved to the same ORGANISATION are not a tight geographic match', () => {
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

test('⑧ a cluster that grew around the wrong seed drops the seed, not the three that agree', () => {
  const idf = buildIdf(SAMSUNG.map((a) => ({ ...a })));
  const members = SAMSUNG.map((a) => ({ ...a }));
  const bad = findOutlier(members, idf);
  assert.equal(bad, 0, 'the odd one out is the SDI share sale, which happened to arrive first');
  /* 3 件未満では追い出さない——「誰が余計か」を言えない。 */
  assert.equal(findOutlier(members.slice(0, 2), idf), -1);
  /* 全員が合っていれば誰も出さない。 */
  assert.equal(findOutlier(members.slice(1), idf), -1);
});

test('⑧b placeArticle evicts the seed as the cluster grows, and the evicted one gets its own event', () => {
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
test('⑨ candidate generation is bounded — it never walks every event', () => {
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
test('⑩ the representative headline is the medoid — a 2-word tag page never wins it', () => {
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
test('⑪ counts are of independent voices, and a single article has no cluster confidence to state', () => {
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
test('⑫ the feed section decides, and only world/blank is ever overridden', () => {
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

test('⑫b military stories are not "society", and one repeated word is not evidence', () => {
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

test('⑫c an entity tag is not a section tag', () => {
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
test('⑬ one item becomes one row: fingerprints, tags, geo reasons — and first_seen_at is never sent', async () => {
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

test('⑬b the geo engine\'s why[] is kept — #R334 measured that analyzeContext threw it away', async () => {
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
test('⑭ articles 72h, events 30d, decisions 30d — and saved events have no deadline at all', () => {
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
test('⑮ the ingest logic is server-only and reaches no client bundle', () => {
  for (const f of ['src/main.js', 'src/vendor.js', 'index.html']) {
    assert.ok(!rd(f).includes('news-ingest'), f + ' must not reference news-ingest.js — it is server-only');
  }
  let hits = '';
  try {
    hits = execFileSync('git', ['grep', '-l', 'news-ingest', '--', 'js/', 'src/'],
      { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) { hits = (e.status === 1) ? '' : String(e.message); }
  assert.equal(hits, '', 'js/ or src/ references news-ingest.js: ' + hits);
});

/* ── ⑯ Edge Function が守ると言っていることを、実際に守っている ───────────── */
test('⑯ news-ingest is fail-closed, deadline-bounded, and touches neither current_news nor refresh-news', () => {
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
  assert.match(fn, /AbortSignal\.timeout/, 'the LLM call needs a deadline of its own');
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
test('⑰ the ingest migration only adds, and it grants the writer explicitly', () => {
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

/* ── ⑱ 段は 4 つあり、どれも名前で選べる ────────────────────────────────── */
test('⑱ the stages exist and are individually runnable', () => {
  const fn = rd('supabase/functions/news-ingest/index.ts');
  /* ⚠ (#R386) SIX now: `embed` (make the material for the second, semantic pass) and `link`
     (join clusters that have already grown into each other) joined the four. The ORDER is the
     subject of the assertion below, not just the membership — `embed` before `assign` (nothing
     to add without embeddings) and `link` after it (so events created this run are in scope). */
  for (const s of ['fetch', 'embed', 'assign', 'link', 'translate', 'prune']) {
    assert.ok(fn.includes('stage' + s[0].toUpperCase() + s.slice(1)), 'stage ' + s + ' is missing');
  }
  assert.match(fn, /\["fetch", "embed", "assign", "link", "translate", "prune"\]/);
  /* 計測は docs/NEWS-EVENTS.md §13 の置き場へ入る。 */
  assert.match(fn, /news_ingest_runs/);
  assert.match(fn, /estimated_cost_usd/);
});
