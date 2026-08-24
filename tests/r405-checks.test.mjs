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

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

import { parseFeed } from '../supabase/functions/_shared/news-ingest.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readLF(path.join(ROOT, p));

const MIGRATION = 'supabase/migrations/20260824220000_r405_news_feeds.sql';

/* 記事として成立する最低限（parseFeed は link と title の無い item を落とす）。 */
const HEAD = '<title>Tariffs take effect as the two governments break off talks</title>' +
             '<link>https://x.test/a</link><pubDate>Mon, 24 Aug 2026 08:00:00 GMT</pubDate>';
const rss = (inner) => '<rss><channel><item>' + HEAD + inner + '</item></channel></rss>';

/* ══ ① content:encoded ═══════════════════════════════════════════════════════ */
test('① <content:encoded> だけを持つ item から本文が返る（綴りが在るかではなく、食わせて確かめる）', () => {
  const xml = rss('<content:encoded><![CDATA[<p>The prime minister said the new tariffs ' +
                  'would take effect on Sept. 8 unless the talks resume.</p>]]></content:encoded>');
  const [item] = parseFeed(xml);
  assert.equal(item.description,
    'The prime minister said the new tariffs would take effect on Sept. 8 unless the talks resume.',
    '<description> を持たない item は本文を持たない記事として保存されていた');
});

/* ══ ② Atom の <content> ═════════════════════════════════════════════════════ */
test('② Atom の <content> でも同じ — <content:encoded> は </content> で閉じない', () => {
  const xml = '<feed><entry><title>A ceasefire holds for a second day in the capital</title>' +
    '<link href="https://at.test/1"/><published>2026-08-24T08:00:00Z</published>' +
    '<content type="html">&lt;p&gt;Both sides said the truce would hold while ' +
    'the mediators met.&lt;/p&gt;</content></entry></feed>';
  const [item] = parseFeed(xml);
  assert.equal(item.link, 'https://at.test/1');
  assert.equal(item.description, 'Both sides said the truce would hold while the mediators met.');
});

/* ══ ③ 長いほうを採る（両向き） ═══════════════════════════════════════════════ */
test('③ 剥がしたあとに長いほうが本文になる — content が長ければ content、description が長ければ description', () => {
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
test('④ Google のリンク一覧は content 側に入っていても捨てられる', () => {
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
function stripSqlComments(sql) {
  let out = '', inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (inStr) {
      out += c;
      if (c === "'") { if (sql[i + 1] === "'") out += sql[++i]; else inStr = false; }
      continue;
    }
    if (c === "'") { inStr = true; out += c; continue; }
    if (c === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; out += '\n'; continue; }
    out += c;
  }
  return out;
}
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
test('⑤ migration は Bloomberg の直接フィード 5 本を足し、google_news_site の 1 本（本番 id 31）を止める', () => {
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
test('⑥ migration は CNN（本番 feed 15）の enabled を変えない — 書き込むのは last_error だけ', () => {
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

/* ── ⑦ 上流の定型を落とし、原文の文だけを残す ────────────────────────────── */
test('⑦ the boilerplate measured in production is stripped, and truncated tails are dropped', () => {
  /* 実測 109 本: The Guardian の末尾。
     ⚠⚠⚠ **短い定型で試すな。** 最初に書いた fixture は «… review. Continue reading...» で、
       TAIL を丸ごと外しても緑のままだった——「Continue reading...」は 18 字なので
       `minSentence` の 40 字に届かず、**長さフィルタのほうが落としていた**。つまりこの検査は
       TAIL を一度も試していなかった（変異試験で実測）。⇒ 40 字を超える定型で試し、
       本数だけでなく**中身**も見る。 */
  const g = B.sentences('Ministers agreed the new limit on Tuesday after a two-year review. Continue reading our full coverage of the bill and what happens next in parliament.');
  assert.equal(g.length, 1, '末尾の配信の宣伝が文として残っている: ' + JSON.stringify(g));
  assert.ok(g.every((s) => !/Continue reading/.test(s)), '「Continue reading」を含む文を採っている');
  const post = B.sentences('The council approved the plan on Monday evening after four hours of debate. The post Council approves the riverside plan appeared first on Example News and was filed by our local government correspondent.');
  assert.ok(post.every((s) => !/appeared first/.test(s)), '「The post … appeared first」の定型を採っている: ' + JSON.stringify(post));

  /* 実測 85 本: Yonhap / AFP 型のデートライン。 */
  const y = B.sentences('SEOUL, Aug. 24 (Yonhap) -- The prime minister ordered a review of every open case.');
  assert.equal(y.length, 1);
  assert.ok(y[0].startsWith('The prime minister'), 'デートラインが剥がれていない: ' + y[0]);

  /* 実測 89 本: 末尾が切れているもの。完全な文だけを採る。 */
  const t = B.sentences('The court sentenced both defendants on Monday morning in Seoul. The judge said the pair had planned the attack for weeks in ad');
  assert.equal(t.length, 1, '切れている最後の断片を文として採っている');

  /* 略語で切らない。 */
  const a = B.sentences('The U.S. Treasury said the sanctions would take effect on Sept. 1 without further notice.');
  assert.equal(a.length, 1, 'U.S. / Sept. で文を割ってしまっている: ' + JSON.stringify(a));
});

/* ── ⑧ 1 系列 1 文 ────────────────────────────────────────────────────────
   同じ通信社の速報を 3 本並べると「3 媒体が報じた」に見える。 */
test('⑧ one sentence per ownership group, two only when a single group is all there is', () => {
  const wire = [
    m({ id: 1, sourceId: 'a1', sourceName: 'A1', family: 'agency', description: 'The first bulletin said the bridge had collapsed at dawn on Tuesday. A second span fell an hour later according to the ministry.' }),
    m({ id: 2, sourceId: 'a2', sourceName: 'A2', family: 'agency', description: 'Rescue teams reached the eastern bank shortly before midday on Tuesday. Divers were still searching the channel after nightfall.' }),
  ];
  const solo = B.gist(wire);
  assert.equal(new Set(solo.map((s) => s.family)).size, 1);
  assert.equal(solo.length, 2, '単独系列のときは同じ記事から 2 文まで採るはず');

  const two = wire.concat([m({ id: 3, sourceId: 'b', sourceName: 'B', family: 'other', description: 'The regional governor declared a state of emergency across the whole province on Tuesday evening.' })]);
  const mixed = B.gist(two);
  const perFam = {};
  for (const s of mixed) perFam[s.family] = (perFam[s.family] || 0) + 1;
  assert.ok(Object.values(perFam).every((n) => n === 1), '複数系列あるのに 1 系列から 2 文採っている: ' + JSON.stringify(perFam));
});

/* ── ⑨ 同じ配信原稿を「2 媒体が報じた」に見せない ─────────────────────────
   ⚠ 実測 526 組のうち c>=0.9 は 1 組だけ。0.8 帯には**落としてはいけない**ものが並ぶ。 */
test('⑨ syndicated copy is collapsed, and independent reporting at 0.8 is not', () => {
  /* 本物の重複（実測 c=0.957・違いは英米綴りと U+2060 だけ）。 */
  const dupe = [
    m({ id: 1, sourceId: 'g', sourceName: 'G', family: 'g', description: 'The bill would require social media platforms to take reasonable steps to verify users\u2019 ages, including by utilising existing account information and facial technology.' }),
    m({ id: 2, sourceId: 'j', sourceName: 'J', family: 'j', description: 'The bill would require social media platforms to take reasonable steps to verify users\u0027 ages, including by utilizing existing account information and facial technology.' }),
  ];
  const d = B.build(dupe);
  assert.equal(d.gist.length, 1, '同じ配信原稿が 2 文並んでいる');
  assert.equal(d.syndicated, 1, '落とした本数を数えていない');

  /* ⚠⚠⚠ **落としてはいけない側は「短い文 ⊂ 長い文」の形で来る。** 実測 526 組で c が
       0.8 を超えた 3 組は全部これだった（NPR 79 字「米が 50% の関税」⊂ France 24 133 字
       「カナダが報復関税」＝**別の事実**）。だから重複の条件は c だけでなく**長さの比 ≥ 0.6**
       を併せて要求している。
     ⚠ 最初に書いた fixture は包含 0.60 しか無く、その 0.8 帯を一度も踏んでいなかった
       ——`dupeLenRatio` を 0 にしても緑のままだった（変異試験で実測）。⇒ 包含が **1.0** に
       なる対で試し、長さの比だけが両者を分けている状態を作る。 */
  const shortText = 'The government imposed 50 percent tariffs on Canadian steel and aluminium exports.';
  const longText = 'Canada announced sweeping retaliatory measures against Washington on Tuesday evening after the government imposed 50 percent tariffs on Canadian steel and aluminium exports, the prime minister said.';
  const wordsOf = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1));
  const WA = wordsOf(shortText); const WB = wordsOf(longText);
  const contain = [...WA].filter((w) => WB.has(w)).length / Math.min(WA.size, WB.size);
  assert.ok(contain >= 0.9, 'fixture が意図した帯に無い（包含 ' + contain.toFixed(2) + '）— この検査は何も守っていない');
  const indep = [
    m({ id: 1, sourceId: 'n', sourceName: 'N', family: 'n', description: shortText }),
    m({ id: 2, sourceId: 'f', sourceName: 'F', family: 'f', description: longText }),
  ];
  const i = B.build(indep);
  assert.equal(i.gist.length, 2, '語がすべて重なっていても長さが倍違うものを同一配信として捨てている');
  assert.equal(i.syndicated, 0);
});

/* ── ⑩ 「読めない」を「読み込み失敗」に見せない ───────────────────────────
   実測 48.7% の Event が本文を 1 文字も持たない。 */
test('⑩ status separates "no text" from "text but no sentences" from "figures only"', () => {
  const none = B.build([m({ id: 1, title: 'Rangers 1B leaves game with wrist contusion', description: '' })]);
  assert.equal(none.status, 'none');
  assert.equal(none.reason, 'no_text', '上流が配っていないのか、在るが使えないのかを区別していない');

  const unusable = B.build([m({ id: 1, title: 'Some headline', description: 'Read more' })]);
  assert.equal(unusable.reason, 'unusable_text');

  /* ⚠ 実測で見つけた不整合: 本文は無いが**見出しに数量がある**。ここで none を返すと、
     UI は「見出しだけです」と言った下に金額を出す。 */
  const facts = B.build([
    m({ id: 1, title: 'Vietnam approves additional $3 billion spending for China rail link', description: '', sourceId: 'r', family: 'r', sourceName: 'R' }),
    m({ id: 2, title: 'Vietnam clears $3 billion more for the China rail link', description: '', sourceId: 'b', family: 'b', sourceName: 'B' }),
  ]);
  assert.equal(facts.status, 'facts', '文が無くても数量が読めるときに none を返している');
  assert.ok(facts.figures.length >= 1);
  assert.equal(facts.agreements.length, 1, '別々の系列が同じ値を言っているのに一致として出していない');
});

/* ── ⑪ 「最新で更新された点」は「最後に届いた記事」ではない ───────────── */
test('⑪ the update section needs a real gap and something actually new', () => {
  const base = { description: 'A landslide at a waste site in the capital buried several homes before dawn.', sourceId: 'a', family: 'a', sourceName: 'A' };
  /* 同じ分に届いた 2 本目は「更新」ではない。 */
  const same = B.build([
    m({ id: 1, ...base, publishedAt: '2026-08-24T01:00:00Z' }),
    m({ id: 2, ...base, sourceId: 'b', family: 'b', sourceName: 'B', publishedAt: '2026-08-24T01:05:00Z' }),
  ]);
  assert.equal(same.latest, null, '5 分後の転載を「更新」と呼んでいる');

  /* 1 時間以上あとに、初めて出た数量を持つ記事。 */
  const upd = B.build([
    m({ id: 1, ...base, publishedAt: '2026-08-24T01:00:00Z' }),
    m({ id: 2, sourceId: 'c', family: 'c', sourceName: 'C', publishedAt: '2026-08-24T05:00:00Z', description: 'The government said the collapse killed 30 people and that the search was continuing.' }),
  ]);
  assert.ok(upd.latest, '4 時間後の続報を「更新」として出していない');
  assert.equal(upd.latest.source, 'C');
  assert.ok(upd.latest.figures.some((f) => f.kind === 'dead' && f.value === 30), '続報で初めて出た数量を拾っていない');
});

/* ── ⑫ 数量は「食い違ったとき」だけでなく常に出す ─────────────────────────
   ⚠ #R386 の表示規則では本番 1,211 Event 中 2 件しか数字が出なかった。 */
test('⑫ figures are surfaced even when the outlets agree', () => {
  const one = B.build([m({ id: 1, title: 'Blast kills 12 at market', description: 'The explosion killed 12 people and wounded 40 others in the market district on Sunday.' })]);
  assert.ok(one.figures.some((f) => f.kind === 'dead' && f.value === 12), '死者数を出していない');
  assert.ok(one.figures.some((f) => f.kind === 'injured' && f.value === 40), '負傷者数を出していない');
  assert.equal(one.differences.length, 0, '1 媒体しかないのに「相違」を主張している');
});

/* ── ⑬ 規則は表示の層に無く、ブラウザの外から測れる ─────────────────────── */
test('⑬ the rules live in a pure module and the measurement instrument calls the same one', () => {
  const brief = rd('js/news-brief.js');
  assert.doesNotMatch(brief, /\bdocument\b|\bwindow\b|HOST\./, 'js/news-brief.js が DOM か HOST に触っている（#R386 と同じ穴）');
  const ui = rd('js/news-events.js');
  assert.match(ui, /import \{ makeNewsBrief \} from '\.\/news-brief\.js'/, 'UI が規則を自前で持っている');
  const evalScript = rd('scripts/news-events-eval.mjs');
  assert.match(evalScript, /import \{ makeNewsBrief \} from '\.\.\/js\/news-brief\.js'/, '測定器が UI と別の実装を測っている');
  assert.match(evalScript, /--brief/, '--brief で測れると書いてあるのに実装が無い');
});

/* ── ⑭ サーバーの統合文は、根拠を照合してからしか保存されない ─────────── */
test('⑭ the LLM summary is span-verified server-side and rejected whole', () => {
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

/* ── ⑮ クライアントは、いま画面に無い媒体を引用した統合文を出さない ─────── */
test('⑮ a stored summary whose cited outlet is no longer a member is not shown', () => {
  const ui = rd('js/news-events.js');
  assert.match(ui, /if \(!s \|\| typeof s\.text !== 'string' \|\| !here\.has\(s\.outlet\)\) return null;/,
    '引用元がいまの構成記事に在るかを確かめずに統合文を出している');
  /* 日本語訳の読み出しは外れている。 */
  assert.doesNotMatch(ui, /from\('news_event_i18n'\)/, 'ニュースは英語と決めたのに ja の読み出しが残っている');
  /* カードの「記事を読む」は Event 側だけで外す（記事モードは触らない）。 */
  assert.match(ui, /const read = foot\.querySelector\('\.btn-read'\);/, 'Event カードから「記事を読む」を外していない');
  const list = rd('js/news-ui.js');
  assert.match(list, /btn-read/, '記事モードのカードからも「記事を読む」が消えている');
  /* ⚠⚠⚠ **実測で踏んだ罠（2026-08-24）。** `decorate()` はカードの配線より**前**に走るので、
     そこで外した要素を後段が無防備に触ると **null に代入して TypeError** になり、
     `appendNewsBatch` の forEach ごと落ちて **News が丸ごと記事フィードへ落ちる**。画面には
     記事が 30 件並び、コンソールに 1 行出るだけで、**ソースの形を見る門は全部緑**だった
     （この直上の assert も緑のまま）——「外す行が在る」は「外したあとも動く」ではない。
     ⚠ ブラウザ側の証拠は `tests/r405.spec.js` ①。ここはその静的な裏取りである。 */
  assert.doesNotMatch(list, /card\.querySelector\('\.btn-read'\)\.onclick/,
    'decorate() が外しうる要素に、取れた確認なしで onclick を代入している');
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
test('⑯ cron を触る migration は cron.job を直接 UPDATE しない（API の role には権限が無い）', () => {
  const dir = path.join(ROOT, "supabase", "migrations");
  const offenders = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
    /* ⚠ **散文に当たらせない。** stripSqlComments が外すのは行コメントだけなので、
       この規則の理由を説明したブロックコメントの中の «update cron.job» に検査が答えて
       しまう（このリポジトリで 13 回目の形）。⇒ ブロックコメントも先に外す。 */
    const sql = stripSqlComments(readLF(path.join(dir, f))).replace(/\/\*[\s\S]*?\*\//g, " ");
    /* `update cron.job …` と `insert into cron.job …` / `delete from cron.job …` */
    if (/\b(?:update|delete\s+from|insert\s+into)\s+cron\.job\b/i.test(sql)) offenders.push(f);
  }
  assert.deepEqual(offenders, [],
    "cron.job を直接書き換える migration は本番で permission denied になる: " + offenders.join(", "));
  /* このラウンドの migration が、実際に使ってよい関数のほうを呼んでいること。 */
  const mine = stripSqlComments(rd(MIGRATION)).replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.match(mine, /perform\s+cron\.schedule\(/, "cron.schedule を呼んでいない");
  assert.match(mine, /perform\s+cron\.unschedule\(/, "古い job を外していない");
});
