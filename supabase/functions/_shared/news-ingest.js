/* ============================================================================
 *  news-ingest.js — フィードから届いた1件を「記事」にし、記事を「出来事」に載せる (#R351)
 * ----------------------------------------------------------------------------
 *  #R334 は器（8 表）と判定（news-cluster.js）を作ったが、**中身が 1 行も無かった**
 *  （本番実測 2026-08-23: news_sources 18 / news_source_feeds 33 / news_articles 0）。
 *  このファイルはその間を埋める側の**論理だけ**を持つ——HTTP も DB も Deno も知らない。
 *
 *  ⚠ これもサーバー専用である。news-cluster.js と同じ理由でブラウザのバンドルに入れない
 *    (docs/NEWS-EVENTS.md §12・tests/r351-checks ⑫ が js/ と src/ からの参照を禁じる)。
 *
 *  ⚠⚠ **「そのフィードから来た」は「その媒体が書いた」ではない。**
 *    実測 (#R334): CNN の World RSS 29 件のうち **6 件が CNN の記事ではなかった**
 *    ——fool.com のクレジットカード広告 3 件と lendingtree.com の住宅ローン広告 3 件で、
 *    見出しには 2022 年・2024 年が残っていた。だから attribute() は canonical URL の
 *    **ホストを完全一致**で突き合わせる。接尾辞一致にしてはならない——Sky News
 *    (news.sky.com) が Sky の物販ページ (sky.com) まで自分のものだと主張する。
 *
 *  ⚠⚠ **domains 列は `www.` 付きで入っているが、normaliseUrl() はホストの `www.` を落とす。**
 *    実測: registry は `www.bbc.co.uk`、正規化後の記事 URL は `bbc.co.uk`。**素で比べると
 *    18 媒体すべてが「自分の記事ではない」と判定され、ingest は 0 行を書く。**
 *    ⇒ 突き合わせる前に**両側を同じ関数で正規化する**（normHost）。
 * ========================================================================== */

import {
  normaliseTitle, normaliseUrl, tokenise, buildIdf, pairVerdict,
  countIndependentSources, CATEGORIES, DEFAULTS, lngOf, latOf, haversineKm,
} from './news-cluster.js';
import { NEWS_GEO_KINDS } from './news-geo-prompt.js';

/* ─────────────────────────────────────────────────────────────────────────────
 *  1. XML — フィードは3つの方言で届く
 * ----------------------------------------------------------------------------
 *  実測 (2026-08-23・33 本): RSS 2.0 が 32 本、RDF (RSS 1.0) が 1 本 (DW の
 *  rss.dw.com/rdf/rss-en-all)。Atom は 0 本だが `<entry>` も読む——読める形を
 *  1 つ増やす費用は数行で、読めなかった日に気づく費用はフィード 1 本ぶんの沈黙である。
 *  ⚠ `<items><rdf:Seq>` は `<item[ >]` に当たらない（`<items>` の次の文字が `s`）。
 * ────────────────────────────────────────────────────────────────────────── */

export function decodeXml(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
function safeCodePoint(n) {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return '';
  try { return String.fromCodePoint(n); } catch (_) { return ''; }
}

/**
 * ⚠ **順序が逆だと何も剥がれない。** `refresh-news` の stripHtml は
 *   「タグを消す → 実体参照を戻す」の順で、フィードが `&lt;a href=…&gt;` のように
 *   **HTML を XML の実体参照で包んで**いると、タグ消しの時点では `<` がまだ `&lt;` なので
 *   1 文字も消えず、そのあと実体参照を戻すので **生の HTML が本文として残る**。
 *   実測 (2026-08-23): Google News 経由の 300 件近くの description が
 *   `<a href="https://news.google.com/rss/articles/CBMi…">…</a>` そのものだった。
 *   ⇒ **戻してから剥がす。** 剥がしたあともう一度戻す（二重にくるまれた実体参照のため）。
 */
export function stripHtml(s) {
  return decodeXml(decodeXml(String(s || '')).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/* ⚠ Google News の `<description>` は要約ではなく**リンクの一覧**である（記事見出しの
 *   アンカーと媒体名だけ）。剥がせば文字は残るが、それは見出しの写しであって説明ではない。
 *   要約として保存すれば、分類器が見出しを二度数え、UI は同じ文を 2 回見せる。 */
const GOOGLE_LINK_LIST = /<a\s+href="https:\/\/news\.google\.com\/rss\/articles\//i;
export function isLinkList(rawDescription) {
  return GOOGLE_LINK_LIST.test(decodeXml(String(rawDescription || '')));
}

function pickTag(block, tag) {
  const m = block.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i'));
  return m ? decodeXml(m[1]).trim() : '';
}
function attrOf(block, tag, attr) {
  const m = block.match(new RegExp('<' + tag + '\\b[^>]*\\b' + attr + '\\s*=\\s*"([^"]*)"', 'i'));
  return m ? decodeXml(m[1]).trim() : '';
}

/** フィード 1 本を項目の配列にする。返すのは生の文字列だけ——判断はしない。 */
export function parseFeed(xml) {
  const doc = String(xml || '');
  const out = [];
  const blocks = [];
  for (const part of doc.split(/<item(?=[\s>])/i).slice(1)) blocks.push({ raw: part.split(/<\/item>/i)[0], atom: false });
  for (const part of doc.split(/<entry(?=[\s>])/i).slice(1)) blocks.push({ raw: part.split(/<\/entry>/i)[0], atom: true });

  for (const b of blocks) {
    const body = b.raw;
    /* Atom は <link href="…"/>、RSS は <link>…</link>。RDF は両方持たず
       `<item rdf:about="…">` だけのことがある。3 つとも見る。 */
    let link = pickTag(body, 'link');
    if (!link) link = attrOf(body, 'link', 'href');
    if (!link) link = (body.match(/^[^>]*\brdf:about\s*=\s*"([^"]*)"/i) || [])[1] || '';
    link = decodeXml(link).trim();
    if (!link) continue;

    const title = pickTag(body, 'title');
    if (!title) continue;

    const when = pickTag(body, 'pubDate') || pickTag(body, 'published') ||
                 pickTag(body, 'dc:date') || pickTag(body, 'updated') || '';
    const rawDesc = (body.match(/<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/i) ||
                     body.match(/<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>/i) || [])[1] || '';
    const desc = isLinkList(rawDesc) ? '' : stripHtml(rawDesc);
    /* Google News は各 item に <source url="https://www.reuters.com">Reuters</source> を付ける。
       ⚠ 実測 (#R334): WORLD 70/70・BUSINESS 70/70 の item が持っていた。**本当の発信元は
       ここにある**ので、リダイレクト URL からは分からない媒体をこれで解決する。 */
    const sm = body.match(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/i);
    /* ⚠ **項目ごとの `<category>` は、媒体自身がその 1 本に付けた分類である**——フィード全体の
     *  セクションより細かく、こちらの見出しキーワードより強い証拠。実測 (2026-08-23):
     *  Guardian は `domain="…/world/africa"` 付きの slug、NYT は `nyt_geo`/`nyt_per`/`des` の
     *  4 種類の taxonomy、The Japan Times は `SOCCER` / `CULTURE` / `ASIA PACIFIC` の素の節名、
     *  France 24 は `Africa`。BBC・Yonhap・Google News は 1 つも出さない。
     *  ⇒ **出す媒体からは受け取る。出さない媒体のために捨てない。** */
    const cats = [];
    for (const cm of body.matchAll(/<category(\s[^>]*)?>([\s\S]*?)<\/category>/gi)) {
      const text = decodeXml(cm[2]).trim();
      if (!text || text.length > 80) continue;
      const dom = (cm[1] || '').match(/domain\s*=\s*"([^"]*)"/i);
      cats.push({ text, domain: dom ? decodeXml(dom[1]) : '' });
      if (cats.length >= 16) break;
    }
    out.push({
      title: decodeXml(title).trim(),
      link,
      published: when,
      description: desc.slice(0, 2000),
      sourceName: sm ? decodeXml(sm[1]).trim() : '',
      sourceUrl: attrOf(body, 'source', 'url'),
      guid: pickTag(body, 'guid'),
      categories: cats,
    });
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  2. 媒体の帰属 — 完全一致でしか名乗らせない
 * ────────────────────────────────────────────────────────────────────────── */

/** normaliseUrl() がホストに施すのと同じ正規化。**両側に同じものを掛けるためだけに在る。** */
export function normHost(h) {
  return String(h || '').trim().toLowerCase().replace(/^www\./, '').replace(/^amp\./, '').replace(/\.$/, '');
}
export function hostOf(url) {
  try { return normHost(new URL(String(url)).hostname); } catch (_) { return ''; }
}

/** news_sources の配列から「正規化ホスト → source」の索引を作る。 */
export function buildRegistry(sources) {
  const byHost = new Map(), byId = new Map();
  for (const s of sources || []) {
    byId.set(s.id, s);
    for (const d of s.domains || []) {
      const h = normHost(d);
      if (h && !byHost.has(h)) byHost.set(h, s);
    }
  }
  return { byHost, byId };
}

/**
 * この項目は「どの登録媒体の記事か」。
 * ⚠ **フィードの持ち主は答えではない。** 答えは canonical URL のホストであり、
 *   それが Google News のリダイレクトなら `<source url>` のホストである。
 *   どちらも registry に無ければ **その記事は登録媒体のものではない**——
 *   捨てる（数えない）。それが CNN の World RSS に混ざっていた広告 6 件の扱いである。
 */
export function attribute(item, norm, registry) {
  const host = norm.canonical ? hostOf(norm.url) : '';
  if (host) {
    const s = registry.byHost.get(host);
    if (s) return { source: s, via: 'canonical_host', host };
    return { source: null, via: 'host_not_registered', host };
  }
  /* 集約リダイレクト。媒体は <source url> が言っている。 */
  const ph = hostOf(item.sourceUrl || '');
  if (ph) {
    const s = registry.byHost.get(ph);
    if (s) return { source: s, via: 'provider_source_host', host: ph };
    return { source: null, via: 'provider_host_not_registered', host: ph };
  }
  return { source: null, via: 'unattributable', host: '' };
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  3. 見出しと時刻
 * ────────────────────────────────────────────────────────────────────────── */

/** 表示用の見出し。⚠ 比較用の normaliseTitle() とは別物——こちらは人が読む。 */
export function displayTitle(rawTitle, sourceName) {
  let t = String(rawTitle || '').replace(/\s+/g, ' ').trim();
  /* Google News の "Headline - Publisher" は媒体名が分かっているときだけ外す
     （分かっていないのに末尾を削ると本文の一部を落とす）。 */
  const p = String(sourceName || '').trim();
  if (p.length > 2) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp('\\s*[-–—|]\\s*' + esc + '\\s*$'), '');
  }
  return t;
}

/* ── 見出しか、索引ページの表題か ─────────────────────────────────────────────
 *  ⚠⚠ **「その媒体が書いた」は「それは記事である」ではない。** #R334 は CNN の World RSS に
 *    混ざったアフィリエイト広告 6 件を見つけて `domains` の完全一致を要求した。実データで
 *    動かすと、同じ形が**一段上**で出た——Google News の `site:` 検索は「そのホストで索引
 *    されている何か」を返すので、**節見出し・タグページ・記者ページ・企業データベースの
 *    ページ**が記事として届く。
 *
 *  実測 (2026-08-23・受理された 1,212 本):
 *    · 語数 5 未満は **63 本**。その内訳を 1 本ずつ読むと 3 群に分かれた:
 *        - Google News 経由の索引ページ **36 本** — AP の記者ページ (`HILLEL ITALIE` /
 *          `CHAN HO-HIM`)・タグページ (`Joe Biden` / `Hong Kong` / `Milwaukee Brewers` /
 *          `Formula One`)・節見出し (`Press Releases` / `Our Stories` / `Trending News`)・
 *          Bloomberg の企業ページ (`Emepa SA` / `Title365 Holding Co`)・Reuters の
 *          銘柄コード (`FEIA.DE` / `XQBT.N`)、そして**見出しが空の 4 本**。
 *        - 直接 RSS の非記事 **18 本** — BBC のポッドキャスト回
 *          (`BBC Inside Science` / `Tech Life` / `Tech Now` / `Business Daily`) と
 *          Yonhap の定期物 (`Yonhap News Summary` / `Today in Korean history`)。
 *          **この 18 本は `<description>` が 1 文字も無い。**
 *        - NYT の短い特集見出し **9 本** — `A New Inferno` / `Early-Onset El Niño` /
 *          `What Is Treatment-Resistant Depression?`。**この 9 本は 11〜27 語の要約を持つ。**
 *    · 語数 5 以上の非記事は Bloomberg の `…: Profile and Biography` **34 本**だけ
 *      （＝ Bloomberg の寄与 99 本の 34%）。
 *
 *  ⇒ 3 つの独立した根拠で決める（どれか 1 つでは 3 群を分けられない）:
 *    ① **語数 5 未満**は、見出しだけでは何が起きたか言えていない。
 *    ② ただし **媒体自身の要約が 8 語以上あれば**、言えていないのは見出しだけである ⇒ 通す。
 *    ③ ただし **canonical URL が無い**（集約リダイレクト）なら、それは媒体の記事 URL ではなく
 *       集約側の索引リンクである ⇒ 通さない。
 *    ④ 測って見つかった**定型の表題**を名指しで落とす。
 *  実測の結果: 63 本のうち **54 本を落として 9 本（NYT の特集）を通す**。
 *  ⚠ これは近似である。だから**落とした数と理由を telemetry に出す**——効きすぎたときも、
 *    効かなくなったときも、次のラウンドが数字で見られるように (docs/NEWS-EVENTS.md §13)。
 *  ⚠ 実測で見つかっていない形を「ありそうだから」で足さない（当たらない規則は、
 *    「網羅されている」という誤った安心だけを作る）。 */
export const MIN_TITLE_WORDS = 5;
export const MIN_DESC_WORDS = 8;
const NOT_A_HEADLINE = [
  /:\s*profile and biography\s*$/i,          /* Bloomberg の人物データベース。実測 34 本 */
  /^about .+\([a-z0-9]{1,6}\.[a-z]{1,3}\)\s*$/i,  /* Reuters の ETF/銘柄ページ「About … (HBF.TO)」 */
  /^[a-z0-9]{1,6}\.[a-z]{1,3}\s*-\s*\|/i,        /* 同「HBF.TO - | Stock Price & Latest News」 */
  /^\(editorial from .+\)\s*$/i,             /* Yonhap が他紙の社説を指すスタブ。実測 3 本 */
  /* ⚠⚠⚠ (#R394) **索引ページは 3 本ではなく 43 本あった。** #R351 が書いた上の 2 本は
     «About … (HBF.TO)» と «HBF.TO - | Stock Price…» という 2 つの綴りだけを見ていたが、
     Reuters は **«(IBX.N) | Stock Price & Latest News»**（先頭が括弧・`-` が無い）でも出す。
     実測 (2026-08-24・本番の active 1,367 本): この形が **Reuters 33 本・AP 10 本 = 43 本
     （3.1%）**混ざっており、8 つの Event を汚していた（#1221 は 3 本とも NBA の索引ページ）。
     ⇒ 見るのは「最後の `|` のあとが**記事の見出し**か**配信の宣伝**か」。
     ⚠⚠ **`|` そのものを門にしてはならない。** 実測: The Guardian は署名記事を
       «Time has lost all meaning | Dave Schilling» の形で出す。`|` だけで落とすと
       **本物の論説 4 本**を捨てる。だから `|` のあとに Latest / Breaking / Stock Price /
       Scores / Stats / Live updates という**配信の語**があるときだけ落とす。
     ⚠ 実測でこの規則は、`|` を持たない見出しに **1 本も当たらない**。 */
  /\|[^|]*\b(latest|breaking|stock price|scores|stats|live updates)\b/i,
];

/* ⚠⚠⚠ **1 本の記事が 3 つの出来事について書いていることがある。**
 *  実測 (2026-08-23・本番 809 本) で誤って結ばれた塊 4 件のうち 1 件はこれが原因だった:
 *  Reuters の «PODCAST: Trump tariffs hit Canada, ballroom reprieve, Stars and Stripes and
 *  Somali piracy» が、**カナダ関税**と**ソマリア海賊**という無関係な 2 つの塊の橋になり、
 *  NYT の «2 Hijackings in 4 Days: Somali Piracy Rises» が Quebec の分離独立の記事と
 *  同じ Event に入った。#R334 が閾値 ×0.70 で観測した「両方に触れた 1 本が橋になる」の、
 *  閾値ではなく**入力側**の形である。
 *  ⇒ 要約記事・ニュースレター・ポッドキャストの回は **1 つの出来事についての報道ではない**。
 *    実測で見つかった 3 つの型だけを落とす（合計 6 本 / 809）。
 *  ⚠ 落とすのは惜しい——本物の報道ではある。だから理由を別の名前で数え、telemetry に出す。 */
const MULTI_EVENT_DIGEST = [
  /,\s+more\s*$/i,                          /* Bloomberg のニュースレター「…, Trump's Ballroom, More」実測 3 本 */
  /^podcast:/i,                             /* Reuters の音声回。実測 1 本 */
  /,\s+and other [a-z ]{3,30} developments\s*$/i,  /* AP の地域まとめ。実測 2 本 */
  /* (#R394) NPR の «Up First» 型——«<出来事A>. And, <出来事B>»。実測 (2026-08-24・
     active 1,367 本) でこの綴りに当たるのは **1 本だけ**で、それが
     «Trump declares economic warfare on Iran. And, SCOTUS to rule on White House ballroom»。
     イランの経済制裁の塊（#708）に入り込んでいた。 */
  /\.\s+And,\s/,
];
/* ⚠ **見出しでは分からず、要約が名乗る digest がある。** 通信社の索引記事は
 *   «Yonhap News Summary» / «Top headlines in major S. Korean newspapers» のように
 *   見出しが短く、要約が «The following is the second summary of major stories moved by
 *   Yonhap News Agency» と**自分が一覧であることを言う**。実測 (2026-08-23・本番 779 本):
 *   4 本。見出しは 3〜6 語なので語数の門に当たりそうだが、**要約が 14〜15 語ある**ので
 *   「短い見出し＋実のある要約」の抜け道を通っていた（そして日ごとの索引どうしが
 *   互いにクラスタになっていた）。 */
const MULTI_EVENT_DIGEST_DESC = [
  /* ⚠ 先頭にデートラインが付くことがある——「SEOUL, Aug. 22 (Yonhap) -- The following are…」。
     行頭に固定した最初の版は 4 本中 2 本しか当たらなかった（実測）。
     実測: 本番 777 本に対してこの形に当たるのは **2 本だけ**で、どちらも Yonhap の索引記事。 */
  /^(?:.{0,80}?--\s*)?the following (is|are)\b/i,
];
export function titleWordCount(title) {
  const s = String(title || '');
  /* CJK には語境界が無いので文字数で見る（現在の収集は英語のみだが、規則を言語に依存させない）。 */
  if (/[぀-ヿ㐀-鿿가-힯]/.test(s)) return s.replace(/\s+/g, '').length >= 12 ? MIN_TITLE_WORDS : 1;
  return (s.match(/[A-Za-z][A-Za-z0-9'’-]*/g) || []).length;
}
export function headlineReject(title, description, canonical) {
  for (const re of NOT_A_HEADLINE) if (re.test(String(title))) return 'title_not_an_article';
  for (const re of MULTI_EVENT_DIGEST) if (re.test(String(title))) return 'multi_event_digest';
  for (const re of MULTI_EVENT_DIGEST_DESC) if (re.test(String(description || '').trim())) return 'multi_event_digest';
  if (titleWordCount(title) >= MIN_TITLE_WORDS) return null;
  if (!canonical) return 'title_too_short';
  const dw = (String(description || '').match(/[A-Za-z][A-Za-z0-9'’-]*/g) || []).length;
  return dw >= MIN_DESC_WORDS ? null : 'title_too_short';
}

/** RFC822 / ISO / dc:date のいずれか。読めなければ null（時刻不明の記事は結ばない）。 */
export function parseWhen(s) {
  const t = Date.parse(String(s || ''));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/* SHA-256 の 16 進。Deno も Node 24 も globalThis.crypto.subtle を持つ。 */
export async function sha256Hex(s) {
  const buf = new TextEncoder().encode(String(s));
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  4. カテゴリ — フィードが言えることは分類器に言わせない
 * ----------------------------------------------------------------------------
 *  実測 (#R334): キーワード規則だけでは英語見出しの **50.6% が未分類**。一方
 *  セクション別フィードは 15/15 稼働し、world 16 / business 5 / science_health 5 /
 *  technology 4 / climate_weather 2 / politics 1 を**フィード自身が持っている**。
 *  ⚠⚠ **`disasters` と `society` を出すフィードは 33 本中 0 本**なので、
 *    この 2 つだけは分類器が埋めなければ**永久に 0 件**である
 *    (docs/NEWS-EVENTS.md §6)。だから分類器の仕事はこの 2 つに限る。
 *
 *  ⚠ **上書きしてよいのは `world` と空だけ。** business / technology / science_health /
 *    climate_weather / politics のフィードは「編集部がそう分類した」という強い証拠で、
 *    見出しの単語より強い。`world` は「国際面」であって主題ではないので、そこだけ譲る。
 *
 *  ⚠ **precision 優先**（docs/NEWS-EVENTS.md §13）。強い語 1 つ、または中位語 2 つ以上に
 *    文脈語が付いたときだけ発火し、相手クラスに 2 点差以上で勝つことを要求する。
 * ────────────────────────────────────────────────────────────────────────── */

export const CLASSIFIER_VERSION = 1;

/* ── ①.5 媒体自身のタグ ─────────────────────────────────────────────────────
 *  フィード全体の `category` と見出しキーワードの**あいだ**に、もう一段ある。
 *  ⚠ ここで見るのは **disasters と society を名指すタグだけ**。business / technology /
 *    politics 等のタグは `news_source_feeds.category` がすでに決めており、二重に判定
 *    させると「どちらが決めたのか」が説明できなくなる（分類器が要るのは 2 つだけ）。
 *  ⚠ タグ文字列は語単位で見る。`domain` 属性の URL も同じ扱い——Guardian は
 *    `https://www.theguardian.com/football/…` のように**節がパスに入っている**。 */
const TAG_SOCIETY = [
  'sport', 'sports', 'soccer', 'football', 'olympics', 'olympic', 'tennis', 'cricket', 'rugby',
  'baseball', 'basketball', 'golf', 'motorsport', 'formulaone', 'boxing', 'athletics',
  'crime', 'law', 'courts', 'police', 'justice', 'prisons', 'education', 'schools',
  'religion', 'catholicism', 'islam', 'christianity', 'buddhism',
  'society', 'culture', 'arts', 'art', 'film', 'movies', 'music', 'books', 'theatre', 'television',
  'lifestyle', 'obituaries', 'obituary', 'media', 'immigration', 'migration', 'refugees',
  'housing', 'inequality', 'community', 'entertainment', 'celebrity', 'royals', 'royal', 'weddings',
];
const TAG_DISASTERS = [
  'disaster', 'disasters', 'earthquake', 'earthquakes', 'wildfire', 'wildfires', 'flooding',
  'floods', 'flood', 'hurricane', 'hurricanes', 'typhoon', 'cyclone', 'tornado', 'volcano',
  'volcanoes', 'tsunami', 'landslide', 'avalanche', 'accidents', 'airdisasters', 'emergency',
];
const TAG_S = new Set(TAG_SOCIETY), TAG_D = new Set(TAG_DISASTERS);

/** 記事行からタグを読む口を 1 つにする（DB の行は entities.jsonb、作りたての行は同じ形）。 */
export const tagsOf = (m) => (m && (m.tags || (m.entities && m.entities.tags))) || [];

/** 保存用に切り詰めたタグ。`domain` はパスだけ（ホストは情報を持たない）。 */
export function normaliseTags(categories) {
  const out = [];
  for (const c of categories || []) {
    const text = String(c.text || '').trim().slice(0, 60);
    if (!text) continue;
    let domain = String(c.domain || '');
    try { domain = domain ? new URL(domain).pathname : ''; } catch (_) { domain = domain.slice(0, 60); }
    out.push(domain ? { text, domain: domain.slice(0, 60) } : { text });
    if (out.length >= 12) break;
  }
  return out;
}

/* ⚠⚠ **実体のタグは節のタグではない。** NYT は 4 種類の taxonomy を同じ `<category>` で出す:
 *   `des`（主題）・`nyt_geo`（地名）・`nyt_per`（人名）・`nyt_org`（組織名）。実測で外した 1 件は
 *   これが原因だった——「Turkey Requests Netanyahu's Arrest」に付いた `nyt_org` のタグが
 *   **`Interpol (International Criminal Police Organization)`** で、その中の `police` を
 *   節名として読んで society に落としていた。政治の記事である。
 *   ⇒ **実体を名指す taxonomy は分類に使わない。**（保存はする——§5.2 の「共有 entity」） */
const ENTITY_TAXONOMY = /(nyt_geo|nyt_per|nyt_org|per_facet|geo_facet|org_facet)$/i;

/** タグ文字列（＋ domain の URL パス）から語を取り出す。`US immigration` → us, immigration。 */
function tagWords(cat) {
  if (ENTITY_TAXONOMY.test(String(cat.domain || ''))) return [];
  const src = String(cat.text || '') + ' ' + String(cat.domain || '').replace(/^https?:\/\/[^/]+/i, '').replace(/[/-]/g, ' ');
  return (src.toLowerCase().match(/[a-z][a-z0-9]*/g) || []);
}

/** 媒体自身のタグが disasters / society を名指しているか。名指していなければ null。 */
export function classifyByTags(categories) {
  let d = 0, s = 0;
  const hitD = [], hitS = [];
  for (const c of categories || []) {
    for (const w of tagWords(c)) {
      if (TAG_D.has(w)) { d++; if (hitD.length < 4) hitD.push(c.text); }
      if (TAG_S.has(w)) { s++; if (hitS.length < 4) hitS.push(c.text); }
    }
  }
  if (!d && !s) return null;
  if (d >= s) return { cls: 'disasters', hits: [...new Set(hitD)], n: d };
  return { cls: 'society', hits: [...new Set(hitS)], n: s };
}

/* 語はすべて **normaliseTitle 済みの本文に対する語境界一致**で見る（大文字小文字を持たない）。 */
const D_STRONG = ['earthquake', 'earthquakes', 'quake', 'aftershock', 'tsunami', 'volcano', 'volcanic',
  'eruption', 'erupts', 'erupted', 'hurricane', 'typhoon', 'cyclone', 'tornado', 'twister',
  'wildfire', 'wildfires', 'bushfire', 'bushfires', 'landslide', 'landslides', 'mudslide', 'mudslides',
  'avalanche', 'derailment', 'derailed', 'capsized', 'capsizes', 'shipwreck', 'magnitude',
  'floodwaters', 'sinkhole', 'stampede', 'blizzard', 'monsoon', 'wildfire'];
const D_MEDIUM = ['flood', 'floods', 'flooding', 'flooded', 'blaze', 'inferno', 'evacuation', 'evacuations',
  'evacuated', 'evacuate', 'rescuers', 'rubble', 'debris', 'shelters', 'aid', 'relief',
  'quarantine', 'outbreak', 'wreckage', 'crash', 'crashes', 'collision', 'collapsed', 'collapse'];
/* ⚠ `aid` は入れない——「対外援助」で政治面に大量に出る語で、災害の証拠にならない。 */
const D_CONTEXT = ['death', 'toll', 'casualties', 'killed', 'dead', 'injured', 'missing', 'survivors',
  'trapped', 'emergency', 'disaster', 'devastated', 'destroyed', 'displaced'];
/* ⚠ 戦闘は disasters ではない (Politics & Conflict)。「爆発」「死者数」は両方に出るので、
 *   軍事の語が居るときは disasters を名乗らせない。 */
const D_VETO = ['airstrike', 'airstrikes', 'missile', 'missiles', 'shelling', 'artillery', 'militant',
  'militants', 'insurgent', 'insurgents', 'rebel', 'rebels', 'troops', 'soldiers', 'army', 'military',
  'war', 'warplane', 'ceasefire', 'offensive', 'terrorist', 'terror', 'jihadist', 'hostages',
  'airstrike', 'drone', 'bombardment', 'sanctions', 'invasion'];

const S_STRONG = ['sentenced', 'convicted', 'acquitted', 'indicted', 'verdict', 'guilty', 'manslaughter', 'homicide',
  'murder', 'rape', 'kidnapping', 'abduction', 'arson', 'burglary', 'jailed', 'prison', 'inmate',
  'school', 'schools', 'university', 'universities', 'students', 'teachers', 'classroom',
  'church', 'mosque', 'synagogue', 'temple', 'pope', 'bishop', 'pilgrimage',
  'refugee', 'refugees', 'asylum', 'migrants', 'migrant', 'homeless', 'homelessness',
  'wedding', 'funeral', 'obituary', 'museum', 'festival', 'novel', 'painting', 'sculpture',
  'olympics', 'olympic', 'championship', 'tournament', 'marathon', 'footballer', 'striker'];
const S_MEDIUM = ['police', 'prosecutors', 'arrested', 'arrest', 'trial', 'court', 'charged',
  'community', 'residents', 'families', 'housing', 'rents', 'discrimination', 'racism',
  'protest', 'protests', 'rally', 'vigil', 'union', 'unions', 'walkout', 'picket', 'workers',
  'artist', 'singer', 'actor', 'actress', 'director', 'album', 'concert', 'exhibition',
  'football', 'soccer', 'cricket', 'rugby', 'tennis', 'athlete', 'athletes', 'coach',
  /* 曖昧さの無い競技語だけ。実測で society に落ちなかった sport の残りは
     「Premier League return」「Dutch GP sprint」のように**チーム名と大会名しか無い**
     見出しで、語の一覧では届かない（Phase C の embedding の仕事）。 */
  'fifa', 'uefa', 'nba', 'nfl', 'mlb', 'nhl', 'motogp', 'playoff', 'playoffs',
  'semifinal', 'semifinals', 'quarterfinal', 'wicket', 'innings', 'touchdown',
  'goalkeeper', 'midfielder', 'batsman', 'grandslam'];
/* ⚠ 政治は society ではない。国政の語が居るときは society を名乗らせない。
 * ⚠⚠ **軍事も society ではない。** 実測で外した 2 件はどちらもこれだった——
 *   「Putin says Ukraine opened 'Pandora's box' with **strikes** on economic targets」と
 *   「Fourteen killed in **strike** on Myanmar monastery」が society に落ちていた。原因は
 *   `strike`／`strikes` を労働争議の語として S_MEDIUM に入れていたこと。⇒ **その 2 語は
 *   一覧から外し**（労働側は union/walkout/picket/workers が担う）、軍事語を veto に足した。 */
const S_VETO = ['president', 'parliament', 'election', 'elections', 'minister', 'senate', 'congress',
  'treaty', 'diplomat', 'summit', 'ballot', 'coalition', 'cabinet', 'referendum', 'chancellor',
  'sanctions', 'tariffs', 'ceasefire', 'nato', 'kremlin', 'impeachment',
  'strike', 'strikes', 'airstrike', 'airstrikes', 'missile', 'missiles', 'shelling', 'artillery',
  'troops', 'soldiers', 'military', 'war', 'warplane', 'militants', 'rebels', 'insurgents',
  'offensive', 'invasion', 'bombardment', 'drone', 'drones'];

const SET = (a) => new Set(a);
const D_S = SET(D_STRONG), D_M = SET(D_MEDIUM), D_C = SET(D_CONTEXT), D_V = SET(D_VETO);
const S_S = SET(S_STRONG), S_M = SET(S_MEDIUM), S_V = SET(S_VETO);

function wordsOf(text) {
  return (normaliseTitle(text).match(/[a-z][a-z0-9']*/g) || []);
}

/**
 * disasters / society だけを判定する。返すのは {cls, score, terms} か null。
 * ⚠ 見出しは説明文の 2 倍で数える。実測の理由: 説明文は媒体の定型文（"Read more…"、
 *   媒体名、購読案内）を含み、見出しにしかない語のほうが出来事を名指している。
 */
export function classifySpecial(title, description) {
  const tw = wordsOf(title), dw = wordsOf(description).slice(0, 60);
  const hit = { d: [], s: [] };
  let d = 0, s = 0, dVeto = false, sVeto = false, dStrong = false, sStrong = false;
  const scan = (arr, weight) => {
    for (const w of arr) {
      if (D_V.has(w)) dVeto = true;
      if (S_V.has(w)) sVeto = true;
      if (D_S.has(w)) { d += 3 * weight; hit.d.push(w); dStrong = true; }
      else if (D_M.has(w)) { d += 2 * weight; hit.d.push(w); }
      else if (D_C.has(w)) { d += 1 * weight; hit.d.push(w); }
      if (S_S.has(w)) { s += 3 * weight; hit.s.push(w); sStrong = true; }
      else if (S_M.has(w)) { s += 2 * weight; hit.s.push(w); }
    }
  };
  scan(tw, 1);
  scan(dw, 0.5);
  if (dVeto) { d = 0; dStrong = false; }
  if (sVeto) { s = 0; sStrong = false; }
  const best = d >= s ? { cls: 'disasters', score: d, terms: hit.d, other: s, strong: dStrong }
                      : { cls: 'society', score: s, terms: hit.s, other: d, strong: sStrong };
  const distinct = new Set(best.terms).size;
  /* 発火の条件: 4 点以上 かつ 相手に 2 点差以上 かつ
   * ⚠ **強い語 1 つ、または別々の語 2 つ**。
   *   実測で外した 1 件はここだった——「Indiana **residents** endure 11th day without power
   *   after storms」は `residents` **1 語が見出しと要約に出ただけ**で 4 点に届き、
   *   停電の記事が society になっていた。**同じ語をもう一度数えるのは、証拠が増えることではない。** */
  if (best.score < 4 || best.score - best.other < 2) return null;
  if (!best.strong && distinct < 2) return null;
  return { cls: best.cls, score: Math.round(best.score * 10) / 10, terms: [...new Set(best.terms)].slice(0, 6) };
}

/**
 * Event のカテゴリ。① 構成記事のフィード分類の多数決 → ② world/空のときだけ分類器。
 * members: [{ title, description, provider_category }]
 */
export function categorise(members) {
  const votes = new Map();
  for (const m of members) {
    const c = m.provider_category;
    if (c && CATEGORIES.includes(c)) votes.set(c, (votes.get(c) || 0) + 1);
  }
  let feedCat = null, feedN = 0;
  for (const [c, n] of votes) {
    /* 同数なら「world 以外」を採る。world は国際面であって主題ではない。 */
    if (n > feedN || (n === feedN && feedCat === 'world' && c !== 'world')) { feedCat = c; feedN = n; }
  }
  const total = members.length || 1;
  const secondary = [...votes.keys()].filter((c) => c !== feedCat);

  if (!feedCat || feedCat === 'world') {
    const rest = [...new Set(feedCat ? [feedCat, ...secondary] : secondary)];
    /* ①.5 媒体自身のタグ。**過半の記事が同じ側を名指したときだけ**採る——1 本の
     *  「Africa」タグで塊全体の分類を決めない。 */
    const tagVotes = { disasters: 0, society: 0 };
    const tagHits = [];
    for (const m of members) {
      const t = classifyByTags(tagsOf(m));
      if (!t) continue;
      tagVotes[t.cls]++;
      if (tagHits.length < 6) tagHits.push(...t.hits);
    }
    const tagged = members.filter((m) => tagsOf(m).length).length;
    for (const cls of ['society', 'disasters']) {
      if (tagged && tagVotes[cls] > tagged / 2 && tagVotes[cls] >= 1 && tagVotes[cls] >= tagVotes[cls === 'society' ? 'disasters' : 'society']) {
        return {
          primary_category: cls,
          secondary_categories: rest,
          category_confidence: Math.round((tagVotes[cls] / tagged) * 100) / 100,
          classifier_version: CLASSIFIER_VERSION,
          evidence: { by: 'publisher_tags', tags: [...new Set(tagHits)].slice(0, 6), of: tagged, feed: feedCat },
        };
      }
    }
    /* ② 見出しの語。タグを出さない媒体（BBC・Yonhap・Google News 経由）のための段。 */
    const text = members.map((m) => m.title).join(' \n ');
    const desc = members.map((m) => m.description || '').join(' \n ');
    const sp = classifySpecial(text, desc);
    if (sp) {
      return {
        primary_category: sp.cls,
        secondary_categories: rest,
        category_confidence: Math.round(Math.min(1, sp.score / 8) * 100) / 100,
        classifier_version: CLASSIFIER_VERSION,
        evidence: { by: 'classifier', terms: sp.terms, score: sp.score, feed: feedCat },
      };
    }
  }
  return {
    primary_category: feedCat || 'world',
    secondary_categories: secondary,
    /* フィードが決めたときの確度は「何割の記事が同じ面から来たか」。 */
    category_confidence: feedCat ? Math.round((feedN / total) * 100) / 100 : null,
    classifier_version: CLASSIFIER_VERSION,
    evidence: { by: feedCat ? 'feed' : 'default', votes: Object.fromEntries(votes) },
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  5. 候補生成 — 全 Event と総当たりしない
 * ----------------------------------------------------------------------------
 *  ⚠⚠ #R76 は 600 件で **179,700 ペア**を回して破綻した。増分処理の相手は
 *    「その語を共有している記事が属する Event」だけである。
 *  ⚠ IDF は**窓（直近 48 時間の記事全部）**から作る (news-cluster.js の注記)。
 *    抜粋から作ると珍しさを過小評価する。
 *  ⚠ 頻出語は索引に入れない。`state` や `trump` の投稿リストは窓の大半になり、
 *    「候補を絞る」という索引の仕事を止める。
 * ────────────────────────────────────────────────────────────────────────── */

export const INDEX = {
  /* 投稿リストに載せる語の上限 df。窓の 4% を超える語は「珍しくない」。 */
  maxDfRatio: 0.04,
  maxDfAbs: 40,
  /* 1 記事あたりが見る候補 Event の上限（IDF 質量の大きい順）。 */
  maxCandidates: 12,
  /* 1 Event あたり照合するメンバーの上限（新しい順）。 */
  maxMembers: 20,
};

/**
 * 窓の記事から転置索引を作る。
 * windowArticles: [{ id, title, title_fingerprint, published_at, subject_*, source_family, event_id }]
 */
export function buildCandidateIndex(windowArticles, opt = INDEX) {
  const arts = windowArticles.map((a) => ({ ...a, _tk: tokenise(a.title) }));
  const I = buildIdf(arts);
  const df = new Map();
  for (const a of arts) for (const t of a._tk) df.set(t, (df.get(t) || 0) + 1);
  const cap = Math.max(2, Math.min(opt.maxDfAbs, Math.ceil(arts.length * opt.maxDfRatio)));
  const post = new Map();     /* token → [index into arts] */
  arts.forEach((a, i) => {
    for (const t of a._tk) {
      if ((df.get(t) || 0) > cap) continue;
      let p = post.get(t);
      if (!p) post.set(t, (p = []));
      p.push(i);
    }
  });
  const byFp = new Map();     /* title_fingerprint → [index] */
  arts.forEach((a, i) => {
    if (!a.title_fingerprint) return;
    let p = byFp.get(a.title_fingerprint);
    if (!p) byFp.set(a.title_fingerprint, (p = []));
    p.push(i);
  });
  const byId = new Map(arts.map((a, i) => [a.id, i]));
  return { arts, idf: I, post, byFp, byId, df, cap, opt };
}

/**
 * 索引の中のその記事に Event を結び付ける。
 * ⚠ **同じ run の中で作られた Event にも、あとの記事が載れるようにするため。** これが無いと
 *   1 回の取り込みで同じ出来事が「新規 Event」を何件も作り、次の run でようやく合流する
 *   ——`materially_updated_at` が実際の続報ではなく取り込みの都合で動くことになる。
 */
export function attachEvent(index, articleId, eventId) {
  const i = index.byId.get(articleId);
  if (i == null) return false;
  index.arts[i].event_id = eventId;
  return true;
}

/**
 * 1 本の新着に対する候補 Event（IDF 質量の大きい順）。
 *
 * `neighbours`: embedding の近傍 [{ neighbour_id, event_id, similarity }]（Phase C・任意）。
 * ⚠ **候補に足すだけで、統合は決めない。** 決めるのは `pairVerdict` で、地理と時刻の門は
 *   そのまま通る（docs/NEWS-EVENTS.md §5.2）。#R76 が壊れたのは候補が多かったからではなく
 *   「近い」の意味を緩めたからである。
 * ⚠ 語で見つかった候補を **押しのけない**。近傍は語の質量の順の**後ろ**に足し、
 *   maxCandidates はそのあとで切る——embedding が語より優先されると、決定論で強く
 *   一致している Event が候補から落ちうる。
 */
export function candidateEvents(article, index, neighbours = null) {
  const tk = article._tk || (article._tk = tokenise(article.title));
  const mass = new Map();     /* eventId → 共有した語の IDF 合計 */
  const add = (i, w) => {
    const a = index.arts[i];
    if (!a || a.id === article.id || !a.event_id) return;
    mass.set(a.event_id, (mass.get(a.event_id) || 0) + w);
  };
  for (const t of tk) {
    const p = index.post.get(t);
    if (!p) continue;
    const w = index.idf.idf.get(t) ?? index.idf.fallback;
    for (const i of p) add(i, w);
  }
  /* ⚠ 同一字面の転載は語の索引を通らないことがある（stopword だけの短い見出し）。
     title_fingerprint は無条件に候補へ入れる——転載は地理も時間も見ずに同じ出来事である。 */
  if (article.title_fingerprint) {
    for (const i of index.byFp.get(article.title_fingerprint) || []) add(i, 1e6);
  }
  const byWord = [...mass.entries()].sort((a, b) => b[1] - a[1]);
  /* embedding の近傍が指す Event のうち、語では出てこなかったものを後ろに足す。 */
  const extra = [];
  if (Array.isArray(neighbours) && neighbours.length) {
    const bestSim = new Map();
    for (const n of neighbours) {
      if (!n || n.event_id == null || !Number.isFinite(n.similarity)) continue;
      if (mass.has(n.event_id)) continue;
      const prev = bestSim.get(n.event_id);
      if (prev == null || n.similarity > prev) bestSim.set(n.event_id, n.similarity);
    }
    for (const [event_id, similarity] of [...bestSim.entries()].sort((a, b) => b[1] - a[1])) {
      extra.push({ event_id, weight: 0, similarity });
    }
  }
  const cap = index.opt.maxCandidates;
  return byWord.slice(0, cap).map(([event_id, weight]) => ({ event_id, weight }))
    .concat(extra.slice(0, cap));
}

/* 対の強さ。clusterArticles() が edge を並べるのに使う量と同じものにしてある
 * （2 か所で別の式を使うと、評価と本番が別のことを測る）。 */
export function pairScore(v) {
  if (!v || !v.same) return 0;
  if (v.code === 'reprint') return 3;
  /* ⚠ embedding の入口で通った対は、語の一致が小さい（それがこの入口の存在理由である）。
     3 つの語の量だけで採点すると **0 に近い強さ**になり、`assignArticle` が「最も強い
     候補」を選ぶときに必ず負ける——正しく見つけた言い換えが、弱い語一致に押しのけられる。
     ⇒ 意味の類似そのものを強さとして数える。⚠ **語で通った対の点は 1 ミリも変えない**
     （`assignment_score` は DB に保存され `clusterConfidence` の材料になる。式を全体に
     足すと、過去の行と今の行が別の尺度で比較されることになる）。 */
  const base = (v.j || 0) + (v.containment || 0) + (v.weighted || 0);
  return v.code === 'embedding' ? base + (v.sim || 0) : base;
}

/**
 * 新着 1 本をどの Event に載せるか決める。
 * membersOf(eventId) → [article]（新しい順・呼び出し側が DB から供給する）
 *
 * ⚠ **代表 1 本と合っただけでは載せない。** #R76 は素の Union-Find で推移を無条件に信じ、
 *   43 件の塊を作った。ここでは Event の**メンバーの過半**（DEFAULTS.transitivity）と
 *   合うことを要求する。
 */
export function assignArticle(article, index, membersOf, opt = DEFAULTS, neighboursOf = null) {
  /* ⚠ 近傍は 1 本の関数から取り、そこから**候補の追加**と**対ごとの類似度**の両方を作る。
     2 つの入口を別々に渡すと、片方だけを配線した呼び出し側が「候補には出るのに
     判定には類似度が届かない」という静かな状態を作れてしまう。 */
  const nb = (typeof neighboursOf === 'function' && neighboursOf(article.id)) || [];
  const simByArticle = new Map();
  for (const n of nb) {
    if (!Number.isFinite(n.similarity)) continue;
    const prev = simByArticle.get(n.neighbour_id);
    if (prev == null || n.similarity > prev) simByArticle.set(n.neighbour_id, n.similarity);
  }
  const cands = candidateEvents(article, index, nb);
  const scores = {};
  let best = null;
  const sim = (id) => {
    const s = simByArticle.get(id);
    return Number.isFinite(s) ? s : null;
  };
  for (const c of cands) {
    const members = (membersOf(c.event_id) || []).slice(0, index.opt.maxMembers);
    if (!members.length) continue;
    let ok = 0, sum = 0, top = null;
    const evidence = [];
    for (const m of members) {
      const v = pairVerdict(article, m, opt, index.idf, sim(m.id));
      const sc = pairScore(v);
      if (v.same) { ok++; sum += sc; if (!top || sc > pairScore(top.v)) top = { v, m }; }
      if (evidence.length < 3) evidence.push({ article_id: m.id, same: v.same, code: v.code, j: r3(v.j), c: r3(v.containment), w: r3(v.weighted) });
    }
    const share = ok / members.length;
    scores[c.event_id] = { share: r3(share), matched: ok, of: members.length, mean: r3(ok ? sum / ok : 0) };
    if (!ok || share < opt.transitivity) continue;
    const strength = sum / ok;
    if (!best || strength > best.strength) best = { event_id: c.event_id, strength, share, top, evidence };
  }
  if (!best) return { event_id: null, scores, candidates: cands.map((c) => c.event_id) };
  const v = best.top.v;
  return {
    event_id: best.event_id,
    relation: 'same_event',
    assignment_score: r3(pairScore(v)),
    share: r3(best.share),
    scores,
    candidates: cands.map((c) => c.event_id),
    features: {
      code: v.code, j: r3(v.j), containment: r3(v.containment), weighted: r3(v.weighted),
      interWeight: r3(v.interWeight), dtH: r3(v.dtH), km: r3(v.km), geo: v.geo,
      overlap: v.overlap, matched_share: r3(best.share), against: best.top.m.id,
    },
    reasons: (v.reasons || []).join(' · '),
  };
}
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

/**
 * 塊が育ったあとの再検証 — **最初の 1 本は誰にも検算されていない。**
 *
 * ⚠⚠⚠ 実測で見つけた欠陥 (2026-08-23・実データ 646 本):
 *   Yonhap の 4 本が 1 つの Event になっていた。3 本は同じ発表の続報
 *   （URGENT → LEAD → 2nd LD「Samsung Electronics が株主還元に最大 110 兆ウォン」）
 *   だが、**種になった 1 本は別の発表**（「Samsung SDI が Samsung Display 株を
 *   4.45 兆ウォンで売却」）だった。決定の履歴がそのまま原因を言っている:
 *
 *     592 SDI      → 新規 Event（メンバー 1）
 *     591 URGENT   → SDI と一致 1/1 = 100%  ⇒ 参加
 *     590 LEAD     → 2 件中 1 件と一致 50%   ⇒ 参加
 *     588 2nd LD   → 3 件中 2 件と一致 67%   ⇒ 参加
 *
 *   **メンバーが 1 件のとき、`transitivity`（34%）は 1 本の辺で必ず満たされる**
 *   ——つまり推移の検算が効いていない。#R76 が素の Union-Find で踏んだのと同じ形が、
 *   増分の側から入ってきた。
 *
 * ⇒ docs/NEWS-EVENTS.md §5.3 が「edge を結んだ後に **cluster 全体**で再検証する」と
 *   書いているのはこの段のことである。新しい定数は足さない——**同じ `transitivity` を、
 *   今度は全員に当てる**。他のメンバーの 34% 未満としか合わない者は、その塊の一員ではない。
 *
 * 返すのは「追い出すべきメンバーの添字」か -1。
 * ⚠ 一度に 1 人だけ（最悪の 1 人）。⚠ 残りが 2 件を下回るなら追い出さない
 *   ——全員が弱く結ばれた塊は「誰が余計か」を言えないので、判断を Phase C の
 *   review queue に残すほうが正しい。
 */
export function findOutlier(members, idf, opt = DEFAULTS) {
  if (!members || members.length < 3) return -1;
  const n = members.length;
  const share = new Array(n).fill(0);
  const same = [];
  for (let i = 0; i < n; i++) same.push(new Array(n).fill(false));
  for (let i = 0; i < n; i++) {
    for (let k = i + 1; k < n; k++) {
      const v = pairVerdict(members[i], members[k], opt, idf);
      same[i][k] = same[k][i] = !!v.same;
    }
  }
  for (let i = 0; i < n; i++) {
    let ok = 0;
    for (let k = 0; k < n; k++) if (k !== i && same[i][k]) ok++;
    share[i] = ok / (n - 1);
  }
  let worst = -1;
  for (let i = 0; i < n; i++) {
    if (share[i] >= opt.transitivity) continue;
    if (worst < 0 || share[i] < share[worst]) worst = i;
  }
  return worst;
}

/**
 * 塊どうしの候補を、**珍しい語の共有だけ**から作る（Phase C の `link` 段）。
 *
 * ⚠⚠⚠ **embedding が使えなくてもこの段は動かなければならない。** 実測 (2026-08-24):
 *   このプロジェクトの鍵は `/v1/models` に **1 件しか返さず**、その 1 件は埋め込み
 *   モデルではない（`text-embedding-3-small` は 403 `model_not_found`）。埋め込みだけを
 *   入口にすると、Phase C の recall の段は**鍵が変わる日まで 1 件も動かない**。
 *
 * ⚠ **これは `assign` のやり直しではない。** `assign` は「新着 1 本 対 その時点の塊」を
 *   見る。ここは「育ったあとの塊 対 育ったあとの塊」を見る——同じ規則でも答えが変わる
 *   のは、**どちらの塊もあとから増えた**場合である（§5.3 の塊全体での再検証）。
 *
 * membersByEvent: Map<eventId, [article]>
 * 返す: [{ event_a, event_b, weight }]（IDF 質量の大きい順）
 */
export function eventPairCandidates(membersByEvent, idf, opt = INDEX, limit = 400) {
  /* Event ごとの語集合（メンバーの見出しの和集合）。 */
  const tokensOf = new Map();
  for (const [eid, members] of membersByEvent) {
    const set = new Set();
    for (const m of members.slice(0, opt.maxMembers)) {
      for (const t of (m._tk || (m._tk = tokenise(m.title)))) set.add(t);
    }
    tokensOf.set(eid, set);
  }
  /* 語 → その語を持つ Event。⚠ 頻出語の投稿リストは窓の大半になり、「候補を絞る」という
     索引の仕事を止める——`buildCandidateIndex` と同じ理由で df に天井をつける。 */
  const post = new Map();
  for (const [eid, set] of tokensOf) {
    for (const t of set) {
      let p = post.get(t);
      if (!p) post.set(t, (p = []));
      p.push(eid);
    }
  }
  const cap = Math.max(2, Math.min(opt.maxDfAbs, Math.ceil(tokensOf.size * opt.maxDfRatio)));
  const mass = new Map();      /* "a:b" → IDF 合計 */
  for (const [t, evs] of post) {
    if (evs.length < 2 || evs.length > cap) continue;
    const w = idf.idf.get(t) ?? idf.fallback;
    for (let i = 0; i < evs.length; i++) {
      for (let k = i + 1; k < evs.length; k++) {
        const a = evs[i] < evs[k] ? evs[i] : evs[k];
        const b = evs[i] < evs[k] ? evs[k] : evs[i];
        const key = a + ':' + b;
        mass.set(key, (mass.get(key) || 0) + w);
      }
    }
  }
  return [...mass.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, limit)
    .map(([key, weight]) => {
      const [a, b] = key.split(':');
      return { event_a: Number(a), event_b: Number(b), weight: r3(weight) };
    });
}

/**
 * 塊どうしが同じ出来事か（Phase C の `link` 段・docs/NEWS-EVENTS.md §5.3）。
 *
 * ⚠⚠⚠ **新しい定数を足さない。** 新着 1 本を Event に載せる条件は「メンバーの
 *   `transitivity`（34%）以上と一致すること」だった。塊どうしにも**同じ規則**を当てる
 *   ——交差する対のうち `transitivity` 以上が「同じ」と言えば同じ出来事である。
 *   #R351 が `findOutlier` で学んだのと同じ形: 別の閾値を作ると、2 つの規則が別々に
 *   ずれていく。
 *
 * ⚠ **`far` の対は embedding の入口が閉じているので、地理が食い違う塊は語だけで
 *   結ばれることになる。** それが意図である（#R351: PODCAST がカナダ関税とソマリア
 *   海賊をつないだ形を、embedding で通しやすくしてはならない）。
 *
 * simOf(idA, idB) → number|null。無ければ語だけで判定する。
 */
export function eventsAgree(membersA, membersB, idf, opt = DEFAULTS, simOf = null, cap = 20) {
  const A = (membersA || []).slice(0, cap), B = (membersB || []).slice(0, cap);
  if (!A.length || !B.length) return { same: false, share: 0, pairs: 0, matched: 0 };
  let matched = 0, best = null, sum = 0;
  for (const a of A) {
    for (const b of B) {
      const s = typeof simOf === 'function' ? simOf(a.id, b.id) : null;
      const v = pairVerdict(a, b, opt, idf, Number.isFinite(s) ? s : null);
      if (!v.same) continue;
      matched++;
      const sc = pairScore(v);
      sum += sc;
      if (!best || sc > pairScore(best.v)) best = { v, a: a.id, b: b.id };
    }
  }
  const pairs = A.length * B.length;
  const share = matched / pairs;
  /* ⚠ 割合だけでは足りない。分母が小さいと 1 本の辺で満たされる——`linkMinMatched` の
     由来は news-cluster.js の DEFAULTS にある実測表を見ること。
     ⚠ 未設定の opt（古い呼び出し側）では 1 になり、**振る舞いが変わらない**。 */
  const minMatched = Math.max(1, opt.linkMinMatched != null ? opt.linkMinMatched : 1);
  return {
    same: share >= opt.transitivity && matched >= minMatched,
    share: r3(share), pairs, matched, mean: r3(matched ? sum / matched : 0),
    top: best ? { article_a: best.a, article_b: best.b, code: best.v.code, j: r3(best.v.j),
                  sim: r3(best.v.sim), km: r3(best.v.km), geo: best.v.geo } : null,
  };
}

/**
 * 1 本を置く — 候補を引き、載せるか新しい塊を作り、育った塊を検算する。
 *
 * ⚠ **本番と評価はこの 1 つの関数を通る。** #R334 は「ラベル付き fixture の精度は精度の
 *   測定になっていなかった」を踏んだ。測るものと動くものが別の関数になれば、同じ形の
 *   間違いをもう一度する。
 *
 * store: Map<eventId, { members: [article] }>（呼び出し側が持つ。DB でも memory でもよい）
 * newEventId(): 新しい Event の id を返す（DB なら insert、評価なら連番）
 */
export function placeArticle(article, index, store, newEventId, opt = DEFAULTS, neighboursOf = null) {
  const d = assignArticle(article, index, (id) => {
    const e = store.get(id);
    return e ? e.members.slice().reverse() : [];
  }, opt, neighboursOf);

  let created = false, eid = d.event_id;
  if (eid == null) { eid = newEventId(); store.set(eid, { members: [] }); created = true; }
  const ev = store.get(eid);
  article._score = created ? null : d.assignment_score;
  ev.members.push(article);
  attachEvent(index, article.id, eid);

  /* ── 育った塊の検算（§5.3） ── */
  let evicted = null;
  if (!created && ev.members.length >= 3) {
    const cap = index.opt.maxMembers;
    const scope = ev.members.length > cap ? ev.members.slice(-cap) : ev.members;
    const off = ev.members.length - scope.length;
    const bad = findOutlier(scope, index.idf, opt);
    if (bad >= 0 && ev.members.length - 1 >= 2) {
      const m = ev.members[off + bad];
      ev.members.splice(off + bad, 1);
      const nid = newEventId();
      m._score = null;
      store.set(nid, { members: [m] });
      attachEvent(index, m.id, nid);
      evicted = { article_id: m.id, from: eid, to: nid };
    }
  }
  return { event_id: eid, created, decision: d, evicted };
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  6. Event の要約 — 代表見出し・代表地点・件数・確度
 * ----------------------------------------------------------------------------
 *  ⚠ 代表見出しは「最初の 1 本」でも「一番新しい 1 本」でもない。**塊の中心（medoid）**
 *    ——他のメンバーとの IDF 重み付き重なりが最大の見出しを採る。実測の理由: 最初に
 *    届く 1 本は速報の断片（"Blast reported in Kyiv"）で、塊が何の出来事かを最もよく
 *    言い表しているのは中心の見出しである。同点は published_at の早い順で決める
 *    （決定論——同じ入力は常に同じ代表を返す）。
 *  ⚠ 代表地点は「多数決」ではなく **具体性 × 支持**。国の代表点は「その国のどこか」と
 *    しか言っておらず、同じ出来事を都市に解決した 1 本のほうが多い 3 本より情報がある。
 * ────────────────────────────────────────────────────────────────────────── */

/* 具体性の順。newsgeo の KIND_LOCAL と同じ並び（あちらは同点の解決、こちらは代表の選択）。 */
const KIND_RANK = { seat: 6, flashpoint: 5, city: 4, feature: 3, admin1: 2, country: 1, org: 1 };

export function summariseEvent(members, idf) {
  const arts = members.map((m) => ({ ...m, _tk: m._tk || tokenise(m.title) }));
  /* ── 代表見出し ──
   * ⚠ **`inter / sa` で測ってはならない（実測で外した）。** 分母を自分の重みだけにすると
   *   **短い見出しほど有利**になる。実測 (2026-08-23): AP のタグページ見出し「Hong Kong」が
   *   天安門追悼集会の塊の代表に選ばれた——2 語しか無いので、どの相手に対しても包含率が
   *   1.0 になる。⇒ 分母は **max(自分, 相手)** にして対称にする。 */
  const wOf = (t) => (idf ? (idf.idf.get(t) ?? idf.fallback) : 1);
  const mass = new Map(arts.map((a) => [a, [...a._tk].reduce((n, t) => n + wOf(t), 0)]));
  let rep = null, repScore = -1;
  for (const a of arts) {
    let s = 0;
    for (const b of arts) {
      if (a === b) continue;
      let inter = 0;
      for (const t of a._tk) if (b._tk.has(t)) inter += wOf(t);
      const denom = Math.max(mass.get(a), mass.get(b));
      s += denom ? inter / denom : 0;
    }
    /* 同点は published_at の早い順（決定論——同じ入力は常に同じ代表を返す）。 */
    const better = s > repScore + 1e-9 ||
      (rep && Math.abs(s - repScore) <= 1e-9 &&
       Date.parse(a.published_at || 0) < Date.parse(rep.published_at || 0));
    if (!rep || better) { rep = a; repScore = s; }
  }
  /* ── 代表地点 ── */
  const places = new Map();
  for (const a of arts) {
    const lng = lngOf(a), lat = latOf(a);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const key = (a.subject_name_en || '') + '|' + lng.toFixed(3) + ',' + lat.toFixed(3);
    const cur = places.get(key) || {
      lng, lat, name: a.subject_name_en || null, kind: a.subject_type || null,
      n: 0, conf: 0, reasons: a.subject_reasons || [],
      /* (#R404) 何が置いた地点なのか。同じ座標に AI と辞書の両方が着いたなら 'ai'
         ——弱いほうを名乗ると、あとで「AI はどこまで効いているか」を数えられない。 */
      by: null,
    };
    cur.n++;
    cur.conf = Math.max(cur.conf, Number(a.subject_confidence) || 0);
    if (a.subject_located_by === 'ai' || (!cur.by && a.subject_located_by)) cur.by = a.subject_located_by;
    places.set(key, cur);
  }
  let place = null, placeScore = -1;
  for (const p of places.values()) {
    /* 具体性が主・支持が従。同じ具体性なら支持の多いほう、それも同じなら確度。 */
    const s = (KIND_RANK[p.kind] || 0) * 10 + Math.min(9, p.n) + p.conf;
    if (s > placeScore) { place = p; placeScore = s; }
  }
  const located = arts.filter((a) => Number.isFinite(lngOf(a)) && Number.isFinite(latOf(a))).length;

  /* ── 時刻・件数 ── */
  const times = arts.map((a) => Date.parse(a.published_at)).filter(Number.isFinite);
  const cat = categorise(arts);

  return {
    representative_article_id: rep.id ?? null,
    representative_title: rep.title,
    rep_lng: place ? place.lng : null,
    rep_lat: place ? place.lat : null,
    rep_place_name_en: place ? place.name : null,
    location_confidence: place ? Math.round(Math.min(1, place.conf) * 100) / 100 : null,
    location_evidence: place
      ? { kind: place.kind, supporting: place.n, of: arts.length, located, why: (place.reasons || []).slice(0, 8),
          alternatives: [...places.values()].length - 1,
          /* (#R404) 代表地点を置いたのは AI か決定論エンジンか、そして
             この Event の記事のうち何本が AI 解析済みか。 */
          by: place.by || null,
          ai_articles: arts.filter((a) => a.subject_located_by === 'ai').length }
      : { located: 0, of: arts.length },
    first_published_at: times.length ? new Date(Math.min(...times)).toISOString() : null,
    last_article_at: times.length ? new Date(Math.max(...times)).toISOString() : null,
    article_count: arts.length,
    independent_source_count: countIndependentSources(arts),
    primary_category: cat.primary_category,
    secondary_categories: cat.secondary_categories,
    category_confidence: cat.category_confidence,
    classifier_version: cat.classifier_version,
    category_evidence: cat.evidence,
  };
}

/**
 * 塊の確からしさ。**単独記事には無い**（何も統合していないので、確信する対象が無い）。
 * 2 件以上なら「一番弱い辺」を 0〜1 に写す——塊は最弱の辺の強さでしか信用できない。
 */
export function clusterConfidence(assignmentScores) {
  const xs = (assignmentScores || []).filter((x) => Number.isFinite(x));
  if (!xs.length) return null;
  return Math.round(Math.min(1, Math.min(...xs) / 1.5) * 100) / 100;
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  7. 保持期間 (docs/NEWS-EVENTS.md §8 / CONSTITUTION.md §5)
 * ----------------------------------------------------------------------------
 *  ⚠ **消してよいのは記事だけで、出来事ではない。** Event を 72 時間で消すと
 *    ★保存も共有 URL も Atlas の参照も merge/split の履歴も 72 時間で失われる。
 * ────────────────────────────────────────────────────────────────────────── */
export const RETENTION = {
  articleHours: 72,
  eventDays: 30,
  decisionDays: 30,
  /* saved_news_events が指す Event は無期限。ここに数字は無い——「無い」が仕様である。 */
};

export function retentionCutoffs(nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  return {
    articles: new Date(now - RETENTION.articleHours * 3600e3).toISOString(),
    events: new Date(now - RETENTION.eventDays * 86400e3).toISOString(),
    decisions: new Date(now - RETENTION.decisionDays * 86400e3).toISOString(),
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  8. 1 項目 → 1 記事行
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * 生の項目を news_articles の行にする。捨てるべきものは null と理由を返す。
 * geo は呼び出し側が渡す（Edge Function は IntMapNewsGeo、評価スクリプトも同じもの）。
 * ⚠ **第二の地点解析を作らない**——`_shared/newsgeo.js` は `js/newsgeo.js` と 1 バイト同一で、
 *   同一性ゲートが 2 か所ある (scripts/static-checks.mjs §7 / tests/r161)。
 */
export async function toArticleRow(item, feed, registry, geo) {
  const norm = normaliseUrl(item.link);
  const att = attribute(item, norm, registry);
  if (!att.source) return { row: null, reject: att.via, host: att.host };
  if (!att.source.enabled) return { row: null, reject: 'source_disabled', host: att.host };

  const title = displayTitle(item.title, item.sourceName || att.source.name);
  const bad = headlineReject(title, item.description, norm.canonical);
  if (bad) return { row: null, reject: bad, host: att.host };

  const published = parseWhen(item.published);
  /* ⚠ 時刻の無い記事は Event に載せられない（pairVerdict が no_time で必ず落とす）。
     載せられないものを記事として保存すると、永久に単独の Event を作り続ける。 */
  if (!published) return { row: null, reject: 'no_published_at', host: att.host };

  const cmp = normaliseTitle(title);
  const [urlFp, titleFp] = await Promise.all([sha256Hex(norm.url), sha256Hex(cmp)]);

  let g = null;
  if (geo) {
    try { g = geo.analyze(title, { desc: item.description || '', publisher: att.source.name, lang: 'en' }).result; }
    catch (_) { g = null; }
  }

  return {
    row: {
      source_id: att.source.id,
      feed_id: feed.id,
      canonical_url: norm.url,
      /* ⚠ 集約リダイレクトは canonical ではない。捨てずに provider_url に残す——
         あとで「どこから届いたか」を説明できないと、誤帰属を直せない。 */
      provider_url: norm.canonical ? null : norm.url,
      url_fingerprint: urlFp,
      title,
      title_fingerprint: titleFp,
      description: (item.description || '').slice(0, 1000) || null,
      language: 'en',
      published_at: published,
      provider_category: feed.category || null,
      /* ⚠ `entities` は #R334 が用意して**誰も書いていなかった**列である。媒体自身が
         その 1 本に付けたタグは、① 分類器より強い分類の証拠であり、② docs/NEWS-EVENTS.md
         §5.2 が候補生成の材料に挙げている「共有 entity」そのものである。捨てない。
         ⚠ `domain` 属性はパスだけ残す（NYT の namespace URL はホストが長く、
            必要な情報は `nyt_geo` / `nyt_per` のような taxonomy 名のほうにある）。 */
      entities: { tags: normaliseTags(item.categories) },
      subject_lng: g ? g.lng : null,
      subject_lat: g ? g.lat : null,
      subject_name_en: g ? (g.name && g.name.en) || null : null,
      subject_type: g ? g.kind : null,
      subject_confidence: g ? g.confidence : null,
      /* ⚠ #R334 の実測: `analyzeContext` は why[] を受け取らずに捨てており、
         「なぜその地点か」を後から説明できなかった。ここで拾う。 */
      subject_reasons: g && Array.isArray(g.why) ? g.why.slice(0, 12) : [],
      /* ⚠ (#R404) **何が決めたかは、決めたものが書く。** #R394 の実測:
         `assigned_by='embedding'` が 23 本あって、埋め込みを持つ記事は 0 行だった
         ——無条件に書いていたからである。ここは決定論エンジンの経路なので、
         **答えが出たときだけ** 'dict'、出なければ 'none'。AI の段は別の場所で
         'ai' に上書きする（そして `subject_locator` に答えたモデルを書く）。 */
      subject_located_by: g ? 'dict' : 'none',
      last_seen_at: new Date().toISOString(),
      /* ⚠ first_seen_at は**送らない**。upsert は送った列だけを更新するので、
         送れば「初めて見た時刻」が毎 run 上書きされる（`current_news.fetched_at` が
         まさにそれで、最初に観測した時刻が原理的に復元できなくなっていた）。 */
    },
    reject: null,
    host: att.host,
    attribution: att.via,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 *  9. AI の地点解析の返答を、採るか捨てるか (#R404)
 * ----------------------------------------------------------------------------
 *  ⚠ **ここは第二の地点解析ではない。** 場所を決めるのは AI（第一手段）と
 *    `newsgeo.js`（フォールバック）の 2 つだけで、この関数がするのは
 *    「返ってきた答えを採ってよいか」の判定と、確度の**観測**である。
 *
 *  ⚠⚠⚠ **模型の返答をそのまま採らない。** #R386 の実測（翻訳の段）: 79 件のうち
 *    1 件が別の書記体系で返ってきた。座標も同じで、静かに壊れた答えのほうが
 *    落ちた答えより高くつく——地図の上では、間違った場所は「無い」より悪い。
 *
 *  ⚠⚠ **確度を模型に自己申告させない。** 較正されていない数字が
 *    `location_confidence` として UI に出てしまう。代わりに、独立に走っている
 *    決定論エンジンと一致したかを**測る**——2 つの別々の仕組みが同じ場所を
 *    指したことは、後から人が確かめられる本物の証拠であり、食い違った行は
 *    そのまま運用者の待ち行列になる (docs/NEWS-EVENTS.md §11)。
 * ────────────────────────────────────────────────────────────────────────── */

const GEO_KIND_SET = new Set(NEWS_GEO_KINDS);

/** 決定論エンジンと AI が「同じ場所」とみなす距離 (km)。 */
export const GEO_AGREE_KM = 50;

/**
 * AI の 1 バッチぶんの返答を検証する。
 * @param {string} text     模型が返した生テキスト（コードフェンス込みでよい）
 * @param {Array}  articles このバッチで渡した記事
 *   （`{id, subject_lng, subject_lat, subject_name_en}` を読む）
 * @returns {{ok:boolean, error:string|null, placed:Array, omitted:Array, rejected:Object,
 *            agreed:number, differed:number, noDict:number}}
 *   `ok:false` のときは **omitted も空**——返答が届かなかったバッチで
 *   「AI は見た」の印を押すと、一度も見られていない記事が永久に候補から外れる。
 */
export function parseAiPlaces(text, articles, opts = {}) {
  const agreeKm = Number.isFinite(opts.agreeKm) ? opts.agreeKm : GEO_AGREE_KM;
  const rejected = { bad_coords: 0, null_island: 0, no_name: 0, unknown_id: 0, bad_kind: 0 };
  const fail = (error) => ({ ok: false, error, placed: [], omitted: [], rejected, agreed: 0, differed: 0, noDict: 0 });

  let arr;
  try {
    const txt = String(text || '').replace(/```json/gi, '').replace(/```/g, '');
    const lo = txt.indexOf('['), hi = txt.lastIndexOf(']');
    if (lo < 0 || hi < lo) return fail('no_json_array_in_reply len=' + String(text || '').length);
    arr = JSON.parse(txt.slice(lo, hi + 1));
  } catch (e) {
    return fail('unparsable_reply: ' + String((e && e.message) || e).slice(0, 120));
  }
  if (!Array.isArray(arr)) return fail('reply_is_not_an_array');

  const want = new Map(articles.map((a) => [a.id, a]));
  const placed = [];
  let agreed = 0, differed = 0, noDict = 0;

  for (const e of arr) {
    const id = Number(e && e.i);
    const a = want.get(id);
    /* 渡していない id は捨てる。**渡した id を 2 度返してきた場合も 2 度目は捨てる**
       （1 度目で want から抜いてあるので、ここに落ちる）。 */
    if (!a) { rejected.unknown_id++; continue; }
    const lat = Number(e && e.lat), lng = Number(e && e.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      rejected.bad_coords++; continue;
    }
    /* ⚠ (0,0) はギニア湾の海上で、模型が「わからない」を返すときの既定値でもある。
       本当にそこで起きた出来事はニュースにならない。 */
    if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) { rejected.null_island++; continue; }
    const name = String((e && e.name) || '').trim().slice(0, 80);
    if (!name) { rejected.no_name++; continue; }

    /* 種別の語彙は `js/newsgeo.js` の KIND_LOCAL と同じでなければならない——
       知らない語を入れると summariseEvent の具体性が 0 になり、AI が置いた
       都市が、決定論エンジンの置いた国に代表を譲る。 */
    const k = String((e && e.kind) || '').trim().toLowerCase();
    const kind = GEO_KIND_SET.has(k) ? k : null;
    if (!kind) rejected.bad_kind++;

    /* ⚠⚠ **`Number(null)` は 0 である**（#R394/#R397 が 2 度払った代金）。地点の無い記事を
       `Number(a.subject_lng)` で読むと**ギニア湾に置いた記事**になり、AI の答えは
       「決定論エンジンと大きく食い違った」と誤って記録される。読む口は 1 つ——
       `lngOf`/`latOf` は変換せずにそのまま返すので、null は null のまま落ちる。 */
    const dLng = lngOf(a), dLat = latOf(a);
    const hadDict = Number.isFinite(dLng) && Number.isFinite(dLat);
    const km = hadDict ? haversineKm(lng, lat, dLng, dLat) : null;
    let confidence, reasons;
    if (!hadDict) {
      noDict++; confidence = 0.8; reasons = ['ai', 'gazetteer-had-no-answer'];
    } else if (km <= agreeKm) {
      agreed++; confidence = 0.95; reasons = ['ai', 'agrees-with-gazetteer', Math.round(km) + 'km'];
    } else {
      differed++; confidence = 0.7;
      reasons = ['ai', 'differs-from-gazetteer', (a.subject_name_en || '?') + ' ' + Math.round(km) + 'km'];
    }

    placed.push({ id, lng, lat, name, kind, confidence, reasons, km });
    want.delete(id);
  }

  /* ⚠ 残ったものは「AI が場所の無い記事だと判断した」ぶんである。
     **決定論エンジンの答えは消さない**——上書きするのは AI が場所を返したときだけ
     （#R29 と同じ意味）。ここが返すのは id だけで、呼び出し側は「見た」印だけを押す。 */
  return {
    ok: true, error: null, placed, omitted: [...want.keys()],
    rejected, agreed, differed, noDict,
  };
}

export { CATEGORIES, DEFAULTS };
