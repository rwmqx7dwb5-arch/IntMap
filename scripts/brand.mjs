#!/usr/bin/env node
/* ============================================================================
 *  IntMap · brand — what IntMap says it is, written out to every place a stranger reads it
 * ----------------------------------------------------------------------------
 *  The words are scripts/brand-text.mjs (and the launch drafts scripts/launch-text.mjs); the numbers in
 *  them are the facts scripts/landing.mjs reads from the files that own them. This writes:
 *
 *    index.html                    the GENERATED BRAND HEAD block — title, description, canonical, Open
 *                                  Graph, the X card, JSON-LD (WebApplication)
 *    js/locales/ui.en.js, ui.jp.js docTitle / docDesc — js/lang-registry.js writes them over the head at run
 *                                  time (and a crawler that runs scripts reads them), so they say the same
 *    manifest.webmanifest          scripts/build-app-manifest.mjs derives it from that head; re-derived here
 *    README.md                     the tagline line between the brand markers
 *    docs/marketing/press-kit.md   descriptions, positioning, facts, pictures, logo — for whoever writes
 *    docs/marketing/launch-posts.md  the per-channel drafts
 *
 *    node scripts/brand.mjs --write          write all of the above
 *    node scripts/brand.mjs --check          exit 1 if any differs from what --write produces
 *    node scripts/brand.mjs --print <id>     one launch post, ready to paste: the site's address and the
 *                                            channel's utm tags filled in (ids: --print list)
 *
 *  ⚠ NOTHING HERE POSTS, SUBMITS OR SENDS ANYTHING. Publishing a post or submitting a sitemap is a
 *  person's act (docs/marketing/README.md lists what needs the owner's approval).
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BRAND } from './brand-text.mjs';
import { POSTS } from './launch-text.mjs';
import { facts } from './landing.mjs';
import { SITE_TOKEN } from './site-url.mjs';
import { siteUrl } from '../supabase/functions/_shared/site-origin.js';
import { langRegistry } from './lib/import-module.mjs';
import { SHOWCASE, CAPTURED } from '../js/showcase.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
export const LANGS = ['en', 'jp'];

/* ── the facts the words are filled with ─────────────────────────────────────────────────────── */
export function brandFacts() {
  const F = facts();
  const L = langRegistry();
  return { ...F, langs: L.codes().length, langTags: L.codes().map((c) => L.htmlTag(c)) };
}
export function factWords(F, lang) {
  const n = (v) => v.toLocaleString(lang === 'jp' ? 'ja-JP' : 'en-US');
  return {
    floorBC: lang === 'jp' ? '紀元前' + n(F.bcYears) + '年' : n(F.bcYears) + ' BC',
    snapshots: n(F.snapshots), ohmFrom: String(F.ohmFrom), ohmTo: String(F.ohmTo),
    csFrom: String(F.csFrom), csTo: String(F.csTo), layers: n(F.layers), langs: n(F.langs),
  };
}
/* `{date:<id>}` / `{image:<id>}`: an example map's date and picture, from js/showcase.js (the declaration the
   landing pages, Atlas and the spec read) — a post that names «Europe on 27 June 1914» names that example */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function exampleWords(kind, id, lang) {
  const s = SHOWCASE.find((x) => x.id === id), c = CAPTURED[id];
  if (!s || !c) throw new Error('brand: no shown, captured example «' + id + '» (js/showcase.js)');
  if (kind === 'image') return c.image;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s.at || ''));
  if (!m) throw new Error('brand: example «' + id + '» has no day-exact date of the common era to name');
  return lang === 'jp' ? +m[1] + '年' + +m[2] + '月' + +m[3] + '日' : +m[3] + ' ' + MONTHS[+m[2] - 1] + ' ' + +m[1];
}
/* ⚠ EVERY brace pair is a placeholder and must resolve: a spelling the filler does not know is refused, never
   passed through — `{date:x}` once went out verbatim because the pattern only matched `{word}` */
function fill(s, W, lang = 'en') {
  return String(s).replace(/\{([^{}]*)\}/g, (m, body) => {
    const ex = /^(date|image):([\w-]+)$/.exec(body);
    if (ex) return exampleWords(ex[1], ex[2], lang);
    if (!/^\w+$/.test(body) || !(body in W)) throw new Error('brand: unknown placeholder ' + m + ' in «' + s + '»');
    return W[body];
  });
}
/** every string of BRAND[lang], filled (arrays and nested objects kept in shape) */
export function words(lang, F = brandFacts()) {
  const W = factWords(F, lang);
  const walk = (v) => (typeof v === 'string' ? fill(v, W) : Array.isArray(v) ? v.map(walk) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])));
  return walk(BRAND[lang]);
}

/* ── the picture a shared link unfolds into: its size and type READ FROM THE FILE ─────────────── */
export const SOCIAL_IMAGE = 'og-image.jpg';
export function jpegInfo(rel) {
  const b = readFileSync(join(ROOT, rel));
  if (!(b[0] === 0xff && b[1] === 0xd8)) return { jpeg: false, bytes: b.length };
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { jpeg: true, width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5), bytes: b.length };
    i += 2 + len;
  }
  return { jpeg: false, bytes: b.length };
}

/* ══ index.html — the generated head ══════════════════════════════════════════════════════════════ */
export const HEAD_BEGIN = '<!-- ⚠ GENERATED BRAND HEAD — BEGIN (node scripts/brand.mjs --write; DO NOT EDIT — the words are scripts/brand-text.mjs) -->';
export const HEAD_END = '<!-- ⚠ GENERATED BRAND HEAD — END -->';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function headBlock(F = brandFacts()) {
  const E = words('en', F);
  const img = jpegInfo(SOCIAL_IMAGE);
  if (!img.jpeg) throw new Error('brand: ' + SOCIAL_IMAGE + ' is not a JPEG — the head would describe a file the crawler cannot read as one');
  const ld = {
    '@context': 'https://schema.org', '@type': 'WebApplication', name: 'IntMap', url: SITE_TOKEN,
    description: E.description, applicationCategory: 'EducationalApplication', operatingSystem: 'Any (web browser)',
    browserRequirements: 'Requires a modern web browser with WebGL', inLanguage: F.langTags, isAccessibleForFree: true,
    image: SITE_TOKEN + SOCIAL_IMAGE, screenshot: SITE_TOKEN + SOCIAL_IMAGE,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
  const I = '  ';
  return [
    HEAD_BEGIN,
    `<!-- What IntMap says it is, to a search engine and to a link preview. The app is ONE address in ${F.langs} languages
       switched at run time (js/lang-registry.js rewrites the title and the description from docTitle/docDesc), so there
       is no other-language URL for hreflang to name: the bilingual entry pages (about.html ↔ ja/about.html, the
       history/ pages) carry hreflang, this one carries the canonical. og:image's size is read from the file. -->`,
    `<title>${esc(E.title)}</title>`,
    `<meta name="description" content="${esc(E.description)}">`,
    `<link rel="canonical" href="${SITE_TOKEN}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="IntMap">`,
    `<meta property="og:title" content="${esc(E.title)}">`,
    `<meta property="og:description" content="${esc(E.social)}">`,
    `<meta property="og:url" content="${SITE_TOKEN}">`,
    `<meta property="og:image" content="${SITE_TOKEN}${SOCIAL_IMAGE}">`,
    `<meta property="og:image:type" content="image/jpeg">`,
    `<meta property="og:image:width" content="${img.width}">`,
    `<meta property="og:image:height" content="${img.height}">`,
    `<meta property="og:image:alt" content="${esc(E.imageAlt)}">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(E.title)}">`,
    `<meta name="twitter:description" content="${esc(E.social)}">`,
    `<meta name="twitter:image" content="${SITE_TOKEN}${SOCIAL_IMAGE}">`,
    `<meta name="twitter:image:alt" content="${esc(E.imageAlt)}">`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
    HEAD_END,
  ].map((l) => I + l).join('\n');
}
function spliceBetween(text, begin, end, block, file) {
  const a = text.indexOf(begin), b = text.indexOf(end);
  if (a < 0 || b < 0 || b < a) throw new Error('brand: the markers are gone from ' + file);
  const lineStart = text.lastIndexOf('\n', a) + 1;
  return text.slice(0, lineStart) + block + text.slice(b + end.length);
}

/* ══ the app's own document strings ═══════════════════════════════════════════════════════════════ */
const LOCALE = { en: 'js/locales/ui.en.js', jp: 'js/locales/ui.jp.js' };
function localeText(lang, F) {
  const W = words(lang, F);
  let t = rd(LOCALE[lang]);
  const put = (key, val) => {
    if (/["\\]/.test(val)) throw new Error('brand: ' + key + ' cannot carry a quote or backslash in a locale literal');
    const re = new RegExp('(\\b' + key + ':)"[^"]*"');
    if (!re.test(t)) throw new Error('brand: ' + LOCALE[lang] + ' declares no ' + key);
    t = t.replace(re, (m, k) => k + '"' + val + '"');
  };
  put('docTitle', W.title);
  put('docDesc', W.description);
  return t;
}

/* ══ README.md — the tagline line ═════════════════════════════════════════════════════════════════ */
export const README_BEGIN = '<!-- brand:tagline (node scripts/brand.mjs --write) -->';
export const README_END = '<!-- /brand:tagline -->';
function readmeText(F) {
  const t = rd('README.md');
  return spliceBetween(t, README_BEGIN, README_END, README_BEGIN + '\n### ' + words('en', F).tagline + '\n' + README_END, 'README.md');
}

/* ══ the launch material ══════════════════════════════════════════════════════════════════════════ */
const UTM = (source) => 'utm_source=' + source + '&utm_medium=social&utm_campaign=launch';
/** the address a post links to. ⚠ THE UTM TAGS GO ONLY ON A LINK INTO THE APP: they are read by js/usage-counts.js
    (supabase/functions/usage-count/shape.js campaignOf), which runs in the app and nowhere else — a static page
    (about, history/) has no reader for them, and the reader who goes on from it to the map arrives with this
    site as the referrer and no tags. A tag nothing counts would only make the post look measured. */
export const countsCampaign = (post) => post.path === '';
export function postUrl(post, site = siteUrl('')) {
  return site + post.path + (post.utm && countsCampaign(post) ? '?' + UTM(post.utm) : '');
}
/** the definition-link key a document writes instead of the address (scripts/site-url.mjs owns the spelling) */
const siteRef = (path) => '[site:' + path + ']';
const siteDef = (path) => '[site:' + path + ']: ' + siteUrl(path);
function postText(post, F, url) {
  const W = { ...factWords(F, post.lang), url };
  return {
    fields: Object.entries(post.fields || {}).map(([k, v]) => [k, fill(v, W, post.lang)]),
    body: post.body ? fill(post.body, W, post.lang) : null,
    thread: post.thread ? post.thread.map((x) => fill(x, W, post.lang)) : null,
  };
}
export function renderPost(post, F, url) {
  const P = postText(post, F, url);
  const out = [];
  for (const [k, v] of P.fields) out.push(k + ': ' + v);
  if (P.fields.length) out.push('');
  if (P.body) out.push(P.body);
  if (P.thread) P.thread.forEach((x, i) => { out.push('[' + (i + 1) + '/' + P.thread.length + '] ' + x); out.push(''); });
  return out.join('\n').replace(/\n+$/, '') + '\n';
}

const GENERATED_MD = '<!-- GENERATED by scripts/brand.mjs --write from scripts/brand-text.mjs and scripts/launch-text.mjs — edit those, not this file. -->';
function pressKit(F) {
  const E = words('en', F), J = words('jp', F);
  const links = ['', 'about.html', 'ja/about.html', 'teachers.html', 'ja/teachers.html', 'history/', 'ja/history/', 'sources.html'];
  const pics = SHOWCASE.filter((s) => CAPTURED[s.id] && CAPTURED[s.id].image)
    .map((s) => '| `' + CAPTURED[s.id].image + '` | `' + CAPTURED[s.id].card + '` | ' + s.title[0] + ' | ' + s.title[1] + ' |');
  return `${GENERATED_MD}
# IntMap — プレスキット (Press kit)

> 外部に出す説明文の**正本の写し**。文言は \`scripts/brand-text.mjs\`、数は実装の持ち主のファイル
> （\`scripts/landing.mjs\` の \`facts()\`）から \`node scripts/brand.mjs --write\` が書く。ここを手で直さない。
> リンク先のアドレスは末尾の \`[site:…]\` 定義（\`scripts/site-url.mjs\` が持ち主）。

## 1. 名前とタグライン

| | English | 日本語 |
|---|---|---|
| 名前（ワードマーク・翻訳しない） | IntMap | IntMap |
| タグライン | ${E.tagline} | ${J.tagline} |
| ページ題 | ${E.title} | ${J.title} |

## 2. 説明文

### 一文 (short)
- EN: ${E.pitch.short}
- JA: ${J.pitch.short}

### 短い段落 (medium)
- EN: ${E.pitch.medium}
- JA: ${J.pitch.medium}

### 長い段落 (long)
EN: ${E.pitch.long}

JA: ${J.pitch.long}

### 検索結果の一行 (meta description)
- EN: ${E.description}
- JA: ${J.description}

### リンクのカード (Open Graph / X)
- EN: ${E.social}
- JA: ${J.social}

## 3. ポジショニング

| | English | 日本語 |
|---|---|---|
| 誰のために | ${E.positioning.for} | ${J.positioning.for} |
| 何であるか | ${E.positioning.is} | ${J.positioning.is} |
| 何をするか | ${E.positioning.that} | ${J.positioning.that} |
| 何と違うか | ${E.positioning.unlike} | ${J.positioning.unlike} |

### 裏付け (proof points)
${E.proof.map((p, i) => '- EN: ' + p + '\n  JA: ' + J.proof[i]).join('\n')}

## 4. 数字とその持ち主

| 数 | 値 | 読んでいるファイル |
|---|---|---|
| 時計の下限 | ${factWords(F, 'en').floorBC} | \`js/hist-scale.js\` \`FLOOR\` |
| 歴史スナップショット | ${factWords(F, 'en').snapshots} | \`data/hist-eras.js\` |
| OpenHistoricalMap の範囲 | ${F.ohmFrom}–${F.ohmTo} | \`js/time-borders.js\` \`HB_MIN\`/\`HB_MAX\` |
| CShapes 2.0 の範囲（日単位） | ${F.csFrom}–${F.csTo} | \`js/time-borders.js\` \`CS_MIN\`/\`CS_MAX\` |
| レイヤーの数（基本表示を除く） | ${factWords(F, 'en').layers} | \`js/layer-manifest.js\` \`dataLayers()\` |
| 画面の言語 | ${F.langs} | \`js/locales/_langs.js\` |

⚠ 文中の数はすべてこの表から入る。数が変わったら \`node scripts/brand.mjs --write\` で全部が追従する。

## 5. 無料のもの・ログインが要るもの

- 無料・登録不要: 地図、すべてのレイヤー、時計、共有リンク、埋め込み（\`?embed=1\`）、紹介ページと歴史地図の入口ページ。
- ログインで加わるもの: Atlas（AI アシスタント。アカウントごとに 1 日の上限）、設定の同期。
- 有料プランは無い。運営費は寄付（Stripe）。

## 6. 画像

アプリの画面をそのまま撮った見本（\`js/showcase.js\` の宣言と \`scripts/showcase-capture.mjs\` が撮ったもの）。
本体は 1280×800、カード用は 1200×630。

| 画面 (1280×800) | カード (1200×630) | 題 (EN) | 題 (JA) |
|---|---|---|---|
${pics.join('\n')}

- リンクのカードの絵（\`${SOCIAL_IMAGE}\`, ${jpegInfo(SOCIAL_IMAGE).width}×${jpegInfo(SOCIAL_IMAGE).height}）は \`index.html\` の head が名指す。
- **新しく撮るとき**: 見本を \`js/showcase.js\` に宣言し、ローカルのサーバ（\`npm run serve\` など）を立てて
  \`node scripts/showcase-capture.mjs --base http://127.0.0.1:<port> --only <id>\` を走らせる。
  リンク・本体・カードの 3 つが一度に揃い、\`node scripts/landing.mjs --check\` がリンクと宣言の一致を見る。
  手で撮った画面は、どの日付・レイヤーかを言えないので使わない。

## 7. ロゴ

| ファイル | 大きさ | 用途 |
|---|---|---|
| \`IntMap.Icon.png\` | 384×384 | 暗い地のマーク（原画） |
| \`icons/icon-512.png\` | 512×512 | 大きく使うとき（原画からの拡大。\`scripts/build-app-manifest.mjs\`） |
| \`icons/apple-touch-icon.png\` | 180×180 | 小さく使うとき |
| \`IntMap.Icon_BW-inverted.png\` | 1254×1254 | 明るい地のマーク |

- 名前は **IntMap**（I と M が大文字、間に空白なし）。どの言語でも訳さない・カタカナにしない。
- AI アシスタントの名前は **Atlas**。これも訳さない。
- マークの色や比率を変えない。

## 8. リンク

${links.map((p) => '- ' + siteRef(p)).join('\n')}

## 9. 連絡先

- アプリの中の Feedback（フィードバック）から。
- 不具合は GitHub の Issues（\`README.md\` の「Report an issue」）。

${links.map(siteDef).join('\n')}
`;
}
function launchPosts(F) {
  const paths = [...new Set(POSTS.map((p) => p.path))];
  return `${GENERATED_MD}
# IntMap — ローンチ投稿の下書き (Launch post drafts)

> **下書きであって投稿ではない。** どれも利用者の承認を経てから、人が投稿する（\`docs/marketing/README.md\`）。
> 文言は \`scripts/launch-text.mjs\`、数は実装から（\`node scripts/brand.mjs --write\`）。
> 下の本文の \`<URL>\` は、**貼るときに** \`node scripts/brand.mjs --print <id>\` を使うと、サイトのアドレスと
> チャネルごとの utm（\`utm_source=<チャネル>&utm_medium=social&utm_campaign=launch\`）が入った完成形が出る。
> 各コミュニティの規則（自己宣伝の可否・画像投稿の条件）は**投稿の直前に必ず読む**——ここには書き写さない。

${POSTS.map((post) => `## ${post.channel} — \`${post.id}\`

- 言語: ${post.lang === 'jp' ? '日本語' : 'English'} · リンク先: ${siteRef(post.path)} · utm_source: \`${post.utm}\`

\`\`\`text
${renderPost(post, F, '<URL>').replace(/\n$/, '')}
\`\`\`
`).join('\n')}
${paths.map(siteDef).join('\n')}
`;
}

/* ══ write / check ════════════════════════════════════════════════════════════════════════════════ */
export async function outputs(F = brandFacts()) {
  const out = {};
  out['index.html'] = spliceBetween(rd('index.html'), HEAD_BEGIN, HEAD_END, headBlock(F), 'index.html');
  for (const lang of LANGS) out[LOCALE[lang]] = localeText(lang, F);
  out['README.md'] = readmeText(F);
  out['docs/marketing/press-kit.md'] = pressKit(F);
  out['docs/marketing/launch-posts.md'] = launchPosts(F);
  return out;
}
/* the manifest is derived from index.html by its own script; it is re-derived from the head written above */
async function manifestFor(indexHtml) {
  const M = await import('./build-app-manifest.mjs');
  const doc = M.readDocument(indexHtml);
  const cur = JSON.parse(rd(M.MANIFEST_FILE));
  return JSON.stringify({ ...cur, name: doc.name, short_name: doc.name, description: doc.description, lang: doc.lang }, null, 2) + '\n';
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const F = brandFacts();
  if (argv.includes('--print')) {
    const id = argv[argv.indexOf('--print') + 1];
    const post = POSTS.find((p) => p.id === id);
    if (!post) { console.log('ids: ' + POSTS.map((p) => p.id).join(', ')); process.exit(id && id !== 'list' ? 1 : 0); }
    process.stdout.write(renderPost(post, F, postUrl(post)));
    process.exit(0);
  }
  const out = await outputs(F);
  out['manifest.webmanifest'] = await manifestFor(out['index.html']);
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (argv.includes('--write')) {
    for (const [rel, body] of Object.entries(out)) {
      const p = join(ROOT, rel);
      mkdirSync(dirname(p), { recursive: true });
      /* keep the checkout's line endings: a CRLF checkout must not see every line change */
      const eol = existsSync(p) && readFileSync(p, 'utf8').includes('\r\n') ? '\r\n' : '\n';
      writeFileSync(p, eol === '\r\n' ? norm(body).replace(/\n/g, '\r\n') : norm(body));
    }
    console.log('brand: wrote ' + Object.keys(out).join(', '));
  } else {
    const bad = [];
    for (const [rel, body] of Object.entries(out)) {
      const p = join(ROOT, rel);
      if (!existsSync(p)) bad.push(rel + ' is missing — run node scripts/brand.mjs --write');
      else if (norm(readFileSync(p, 'utf8')) !== norm(body)) bad.push(rel + ' differs from what scripts/brand.mjs writes — run --write');
    }
    if (bad.length) { console.error('brand: ' + bad.length + ' problem(s)\n  ' + bad.join('\n  ')); process.exit(1); }
    console.log('brand: ' + Object.keys(out).length + ' files say what scripts/brand-text.mjs says');
  }
}
