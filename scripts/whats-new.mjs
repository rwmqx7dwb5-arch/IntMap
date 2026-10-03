#!/usr/bin/env node
/* ============================================================================
 *  IntMap · whats-new — 「更新情報」/ What's new, GENERATED FROM THE RECORD OF EACH MERGE   (ops-next)
 * ----------------------------------------------------------------------------
 *  「求めるのは改善ではなく商品開発、マーケティング、営業。」 (2026-10-03). On 2026-10-02 and 10-03 alone
 *  some forty changes reached the site — a rebuilt phone layout, an offline map, a tour builder, a status
 *  page — and a person using IntMap was told about none of them: the only account of what changed was
 *  dev-notes/, written in Japanese for the next engineer, and the pull-request titles on GitHub. A product
 *  that improves every day and never says so looks, from outside, exactly like one that stopped.
 *
 *  THE SOURCE IS THE RECORD EVERY MERGE ALREADY WRITES. A dev-notes/<date>-<slug>.md that changed something
 *  a reader can see carries one line for them, `newsen:` and `newsjp:` in its front matter (the rules are
 *  scripts/dev-notes.mjs newsProblems, gated by `node scripts/dev-notes.mjs --check`). Nothing here is
 *  written by hand and nothing is generated from a title written for engineers: a record without the two
 *  lines is internal and is not announced. From those lines this file writes, into dist/ when the site is
 *  built:
 *
 *    whats-new.json        the entries, newest first — read by the app (js/whats-new.js: Settings ▸ 「新着」,
 *                          the unread mark, and Atlas's `system.whatsNew`)
 *    updates.html          the page, in English     ja/updates.html  the page, in Japanese
 *    updates.xml           an Atom feed, in English ja/updates.xml   an Atom feed, in Japanese — so a feed
 *                          reader, a newsroom's monitor or a teacher's RSS tool follows IntMap without
 *                          visiting it (the distribution half: nothing is POSTED anywhere — readers subscribe)
 *    sitemap-updates.xml   the two pages, joined to sitemap-index.xml by scripts/history-pages.mjs
 *
 *  ══ WHY BUILT, NOT COMMITTED ═════════════════════════════════════════════════════════════════════
 *  Every merge adds a record. Committed, the generated pages would be rewritten by every pull request,
 *  and two pull requests landing the same day would conflict on files neither author wrote. Built, the
 *  pages are always exactly the record on main. tests/ops-next-checks.test.mjs evaluates the generator.
 *
 *  ⚠ THE DATE IS THE RECORD'S DATE (the day the work was written down, in its file name), not a deployment
 *  time this file cannot know; the page says so. The pull request is linked when the record names one and
 *  the repository can be read (GITHUB_REPOSITORY in CI, else the `origin` remote) — never guessed.
 *
 *    node scripts/whats-new.mjs --out <dir>   write the files into <dir>
 *    node scripts/whats-new.mjs --print       the entries as JSON; write nothing
 * ==========================================================================*/
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { entries, newsProblems } from './dev-notes.mjs';
import { SITE_TOKEN } from './site-url.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const JSON_PATH = 'whats-new.json';
export const SITEMAP = 'sitemap-updates.xml';
export const SCHEMA = 'intmap-whats-new/1';
export const LANGS = [
  { key: 'en', tag: 'en', dir: '', up: './', locale: 'en-US' },
  { key: 'jp', tag: 'ja', dir: 'ja/', up: '../', locale: 'ja-JP' },
];
export const pagePath = (L) => L.dir + 'updates.html';
export const feedPath = (L) => L.dir + 'updates.xml';

/* the only words around the entries (en + jp, CONSTITUTION.md §7) — plain text, escaped by the writer */
export const TEXT = {
  en: {
    title: 'What’s new in IntMap',
    description: 'Every change to IntMap a reader can see, as it reaches the site — new maps, new tools, fixes.',
    lede: 'Each line is written when the change is merged. The date is the day the change was recorded.',
    feed: 'Follow with a feed reader (Atom)',
    open: 'Open the map',
    lang: '日本語', langLabel: 'Read this page in Japanese',
    pr: 'Change #{n}',
    none: 'Nothing has been announced yet.',
    status: 'IntMap, now — what is working',
    sources: 'Data sources', science: 'Science & logic', privacy: 'Privacy', terms: 'Terms',
  },
  jp: {
    title: 'IntMap の更新情報',
    description: 'IntMap に加わった、読者に見える変更の一覧。新しい地図・道具・修正を、サイトに届いた順に。',
    lede: '各行は変更が取り込まれたときに書かれます。日付はその変更が記録された日です。',
    feed: 'フィードリーダーで購読（Atom）',
    open: '地図を開く',
    lang: 'English', langLabel: 'このページを英語で読む',
    pr: '変更 #{n}',
    none: 'まだお知らせはありません。',
    status: 'IntMap のいま — 何が動いているか',
    sources: 'データの出典', science: '科学とロジック', privacy: 'プライバシー', terms: '利用規約',
  },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** the repository's web address, from CI's own variables or the `origin` remote — null when neither says */
export function repoUrl(root = ROOT, env = process.env) {
  if (env.GITHUB_REPOSITORY) return (env.GITHUB_SERVER_URL || 'https://github.com') + '/' + env.GITHUB_REPOSITORY;
  try {
    const u = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(u);
    return m ? 'https://github.com/' + m[1] + '/' + m[2] : null;
  } catch { return null; }
}

/** the announced entries, newest first — and the problems of any line that would not be shown */
export function collect(root = ROOT, { repo = repoUrl(root) } = {}) {
  const items = [], problems = [];
  for (const e of entries(root)) {
    if (e.kind !== 'dated' || !e.news) continue;
    const p = newsProblems({ newsen: e.news.en, newsjp: e.news.jp });
    if (p.length) { problems.push(e.file + ': ' + p.join('; ')); continue; }
    items.push({ id: e.date + '-' + e.slug, date: e.date, pr: e.pr ? Number(e.pr) : null, en: e.news.en, jp: e.news.jp,
      url: e.pr && repo ? repo + '/pull/' + e.pr : null });
  }
  return { schema: SCHEMA, builtBy: 'scripts/whats-new.mjs', from: 'dev-notes/ (front matter newsen / newsjp)', repo, entries: items, problems };
}

/** a date as this page's reader reads it */
function dayWords(iso, L) {
  const [y, m, d] = iso.split('-').map(Number);
  try { return new Intl.DateTimeFormat(L.locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d)); }
  catch { return iso; }
}

const FONT_CSS_ORIGIN = 'https://fonts.googleapis.com', FONT_FILE_ORIGIN = 'https://fonts.gstatic.com';
/* the policy of the other generated pages that run nothing (scripts/history-pages.mjs) */
function cspMeta(webFonts) {
  const css = webFonts ? ' ' + FONT_CSS_ORIGIN : '', files = webFonts ? ' ' + FONT_FILE_ORIGIN : '';
  return '<meta http-equiv="Content-Security-Policy" content="' + [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'", "form-action 'self'", "frame-src 'none'",
    "connect-src 'self'", "img-src 'self' data:", "style-src 'self'" + css, "font-src 'self' data:" + files, "script-src 'self'",
  ].join('; ') + '">';
}

export function renderPage(M, L) {
  const T = TEXT[L.key], up = L.up, other = LANGS.find((l) => l !== L);
  const url = (l) => SITE_TOKEN + pagePath(l);
  const cjk = L.tag === 'ja'
    ? `\n<link rel="preconnect" href="${FONT_CSS_ORIGIN}">\n<link rel="preconnect" href="${FONT_FILE_ORIGIN}" crossorigin>\n<link rel="stylesheet" href="${FONT_CSS_ORIGIN}/css2?family=Noto+Sans+JP:wght@400;500;600;700&amp;display=swap">`
    : '';
  const byDay = [];
  for (const e of M.entries) {
    const last = byDay[byDay.length - 1];
    if (last && last.date === e.date) last.items.push(e); else byDay.push({ date: e.date, items: [e] });
  }
  const list = byDay.length ? byDay.map((d) => `    <section class="wn-day" aria-labelledby="d-${d.date}">
      <h2 id="d-${d.date}"><time datetime="${d.date}">${esc(dayWords(d.date, L))}</time></h2>
      <ul class="wn-list">
${d.items.map((e) => `        <li id="${esc(e.id)}"><p>${esc(e[L.key])}</p>${e.url ? `<a class="wn-pr" href="${esc(e.url)}" rel="noopener">${esc(T.pr.replace('{n}', e.pr))}</a>` : ''}</li>`).join('\n')}
      </ul>
    </section>`).join('\n') : `    <p class="lp-note">${esc(T.none)}</p>`;
  return `<!DOCTYPE html>
<html lang="${L.tag}">
<head>
<meta charset="utf-8">
${cspMeta(!!cjk)}
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- GENERATED by scripts/whats-new.mjs from the newsen / newsjp lines of dev-notes/ — edit those, not this file. -->
<title>${esc(T.title)}</title>
<meta name="description" content="${esc(T.description)}">
<link rel="canonical" href="${esc(url(L))}">
${LANGS.map((l) => `<link rel="alternate" hreflang="${l.tag}" href="${esc(url(l))}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${esc(url(LANGS[0]))}">
<link rel="alternate" type="application/atom+xml" title="${esc(T.title)}" href="${esc(SITE_TOKEN + feedPath(L))}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="IntMap">
<meta property="og:title" content="${esc(T.title)}">
<meta property="og:description" content="${esc(T.description)}">
<meta property="og:url" content="${esc(url(L))}">
<meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${up}IntMap.Icon.png">${cjk}
<link rel="stylesheet" href="${up}css/fonts.css">
<link rel="stylesheet" href="${up}css/pages.css">
<link rel="stylesheet" href="${up}css/landing.css">
<link rel="stylesheet" href="${up}css/whats-new.css">
</head>
<body class="lp wn-page">
<header class="lp-top">
  <nav class="lp-top-in" aria-label="IntMap">
    <a class="lp-brand" href="${up}${L.dir}about.html"><img src="${up}IntMap.Icon.png" alt="" width="28" height="28"><span>IntMap</span></a>
    <span class="lp-top-spacer"></span>
    <a class="lp-lang" href="${up}${pagePath(other)}" hreflang="${other.tag}" lang="${other.tag}" aria-label="${esc(T.langLabel)}">${esc(T.lang)}</a>
    <a class="lp-btn lp-btn-sm" href="${up}index.html">${esc(T.open)}</a>
  </nav>
</header>
<main class="lp-main wn-main">
  <section class="lp-hero lp-hero-t">
    <div class="lp-hero-text">
      <h1>${esc(T.title)}</h1>
      <p class="lp-lede">${esc(T.lede)}</p>
      <p class="wn-feed"><a href="${up}${feedPath(L)}">${esc(T.feed)}</a></p>
    </div>
  </section>
${list}
</main>
<footer class="lp-foot">
  <nav class="lp-foot-in">
    <a href="${up}sources.html">${esc(T.sources)}</a>
    <a href="${up}science.html">${esc(T.science)}</a>
    <a href="${up}privacy.html">${esc(T.privacy)}</a>
    <a href="${up}terms.html">${esc(T.terms)}</a>
    <span class="lp-foot-mark">IntMap</span>
  </nav>
</footer>
</body>
</html>
`;
}

/** an Atom 1.0 feed (RFC 4287) of one language — one entry per announced line, its id stable across builds */
export function renderFeed(M, L) {
  const T = TEXT[L.key];
  const page = SITE_TOKEN + pagePath(L);
  const updated = (M.entries[0] ? M.entries[0].date : '1970-01-01') + 'T00:00:00Z';
  const entry = (e) => `  <entry>
    <id>${esc(page + '#' + e.id)}</id>
    <title>${esc(e[L.key])}</title>
    <updated>${e.date}T00:00:00Z</updated>
    <link rel="alternate" type="text/html" href="${esc(page + '#' + e.id)}"/>${e.url ? `\n    <link rel="related" href="${esc(e.url)}"/>` : ''}
    <content type="text">${esc(e[L.key])}</content>
  </entry>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED by scripts/whats-new.mjs from the newsen / newsjp lines of dev-notes/. -->
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${L.tag}">
  <id>${esc(page)}</id>
  <title>${esc(T.title)}</title>
  <subtitle>${esc(T.description)}</subtitle>
  <updated>${updated}</updated>
  <link rel="self" type="application/atom+xml" href="${esc(SITE_TOKEN + feedPath(L))}"/>
  <link rel="alternate" type="text/html" href="${esc(page)}"/>
  <author><name>IntMap</name></author>
  <icon>${esc(SITE_TOKEN + 'IntMap.Icon.png')}</icon>
${M.entries.map(entry).join('\n')}
</feed>
`;
}

function sitemap() {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!-- GENERATED by scripts/whats-new.mjs when the site is built. -->\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    + LANGS.map((L) => `  <url><loc>${esc(SITE_TOKEN + pagePath(L))}</loc>\n${LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.tag}" href="${esc(SITE_TOKEN + pagePath(l))}"/>`).join('\n')}\n  </url>`).join('\n')
    + '\n</urlset>\n';
}

/** the JSON the app reads — the entries without the build's own bookkeeping */
export function appJson(M) {
  return JSON.stringify({ schema: M.schema, builtBy: M.builtBy, from: M.from, entries: M.entries }) + '\n';
}

/** path (relative to the site root) → file body */
export function outputs(M) {
  const out = { [JSON_PATH]: appJson(M), [SITEMAP]: sitemap() };
  for (const L of LANGS) { out[pagePath(L)] = renderPage(M, L); out[feedPath(L)] = renderFeed(M, L); }
  return out;
}

export function writeTo(dir, M = collect()) {
  if (M.problems.length) throw new Error('whats-new: a reader\'s line would not be shown:\n  ' + M.problems.join('\n  '));
  const out = outputs(M);
  for (const [rel, body] of Object.entries(out)) { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); }
  return Object.keys(out);
}

/** Vite plugin. Build: write the files into dist/ after the static copy and before the site URL and the
 *  page policies are filled in (both `post`, later in vite.config.js's list). Dev: answer /whats-new.json
 *  from the record as it is on disk, so the in-app list works under `vite` too. */
export function whatsNewPlugin() {
  let outDir = null;
  return {
    name: 'intmap-whats-new',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || req.url.split('?')[0] !== '/' + JSON_PATH) return next();
        try { const M = collect(); res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(appJson(M)); }
        catch (e) { next(e); }
      });
    },
    closeBundle: { sequential: true, handler() {
      if (!outDir) return;
      const files = writeTo(outDir);
      console.log('whats-new: wrote ' + files.length + ' files into ' + outDir);
    } },
  };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const M = collect();
  if (arg('--out')) { const f = writeTo(resolve(arg('--out')), M); console.log('whats-new: ' + M.entries.length + ' entries, ' + f.length + ' files into ' + arg('--out')); }
  else if (process.argv.includes('--print')) console.log(JSON.stringify(M, null, 2));
  else { console.log('whats-new: ' + M.entries.length + ' announced entries' + (M.problems.length ? ', ' + M.problems.length + ' problem(s):\n  ' + M.problems.join('\n  ') : '')); if (M.problems.length) process.exit(1); }
}
