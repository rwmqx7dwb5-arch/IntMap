#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THIS WEEK ON EARTH — a page and a feed entry for every week, and the drafts of the week's post   (weekly-earth)
 * ----------------------------------------------------------------------------
 *  「流入・再訪のエンジン」 (2026-10-04). The «on this day» pages answer a search for a DAY of history; people also look
 *  for what is happening NOW — «earthquakes this week», «今週の地震» — and a feed that brings one page a week back to
 *  a subscriber is how a reader returns. This writes, from data/weekly-earth.json (the archive
 *  scripts/build-weekly-earth.mjs keeps, read through js/weekly-earth.js):
 *    · weekly/<YYYY>-W<ww>/ and ja/weekly/<YYYY>-W<ww>/ — every week of the archive: its largest earthquake, every
 *      earthquake of M 5.5+ the USGS catalogue lists, every natural event NASA's EONET tracks with an observation in
 *      it, each opening the map on its place and day with the event as a pin, and a link that opens the whole week;
 *    · weekly/ and ja/weekly/ — the hub, newest week first;
 *    · weekly/feed.xml and ja/weekly/feed.xml — Atom 1.0 (RFC 4287), one entry per week (scripts/whats-new.mjs
 *      writes the site's other feed the same way); sitemap-weekly.xml, joined by sitemap-index.xml;
 *    · `--queue` — THE DRAFTS of the week's post (X, Bluesky, Threads; en and ja), each with the week's page and a
 *      checkbox for the person who approves it. ⚠ NOTHING IS POSTED, SENT OR SCHEDULED FROM HERE
 *      (docs/marketing/README.md, «承認が要ること»).
 *
 *  ⚠ THE WORDING OF AN EVENT IS NOT WRITTEN HERE: js/weekly-earth.js `describe` writes it, for this page and Atlas.
 *  ⚠ A week page is an entry the app counts (supabase/functions/usage-count/shape.js SITE_PAGES 'weekly'), so the
 *  drafts' links carry utm tags and a reader who goes on to the map arrives with the page as referrer.
 *
 *    node scripts/weekly-earth-pages.mjs --out <dir>              write the pages, the feeds and the sitemap into <dir>
 *    node scripts/weekly-earth-pages.mjs --queue [--week YYYY-Www] print the drafts for a week (default: the newest)
 *    node scripts/weekly-earth-pages.mjs --stats                  count; write nothing
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TEXT } from './weekly-earth-text.mjs';
import { SITE_TOKEN } from './site-url.mjs';
import { siteUrl } from '../supabase/functions/_shared/site-origin.js';
import { LANGS, HUB as HISTORY_HUB, shell, esc, fill, breadcrumbLd, siteImage } from './history-pages.mjs';
import { xWeight, CHANNELS } from './on-this-day-pages.mjs';   /* the same channels and X's weighting the daily drafts use */
import * as WE from '../js/weekly-earth.js';
import { campaignOf } from '../supabase/functions/usage-count/shape.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const WEEKLY_HUB = WE.HUB;
export const WEEKLY_SITEMAP = 'sitemap-weekly.xml';
export const FEED_FILE = 'feed.xml';

export const weekPath = (week, L) => WE.pagePath(week, L.dir);
export const hubPath = (L) => L.dir + WEEKLY_HUB;
export const feedPath = (L) => hubPath(L) + FEED_FILE;

/** the archive and what the pages are made of */
export function model(idx) {
  const I = idx || JSON.parse(readFileSync(join(ROOT, WE.INDEX_PATH), 'utf8'));
  return { idx: I, weeks: I.weeks };
}
const fmt = (v, L) => Number(v).toLocaleString(L.intl);
const W0 = (I, L) => ({ mag: String(I.rule.minMagnitude), ha: fmt(I.rule.wildfireMinHectares, L) });

/* the <link> a feed reader discovers the feed by, put into the shared head */
const withFeed = (html, L) => html.replace('</head>', `<link rel="alternate" type="application/atom+xml" title="${esc(TEXT[L.key].feedTitle)}" href="${esc(SITE_TOKEN + feedPath(L))}">\n</head>`);

/* ══ THE WEEK PAGE ═══════════════════════════════════════════════════════════════════════════════ */
function row(item, week, I, L, label) {
  const T = TEXT[L.key], D = WE.describe(item, I, L.key);
  const src = D.sources.map((s) => `<a href="${esc(s.url)}" rel="noopener">${esc(s.name)}</a>`).join(' · ');
  return `      <li class="otd-ev"><span class="otd-y">${esc(label)}</span><div><p class="otd-t">${esc(D.title)}</p><p class="otd-s">${esc(D.sub)}</p>`
    + `<p class="otd-s">${esc(T.sourceLink)}: ${src}</p>`
    + `<a class="lp-open" href="${esc('{up}' + WE.linkFor(item, week, I, L.key))}">${esc(T.open)} →</a></div></li>`;
}
function renderWeek(M, week, L) {
  const T = TEXT[L.key], lang = L.key, I = M.idx;
  const head = WE.headline(week);
  const H = head ? WE.describe(head, I, lang) : null;
  const words = WE.weekWords(week, lang);
  const summary = WE.summary(week, I, lang);
  const W = Object.assign(W0(I, L), { week: words, slug: week.w, summary, headline: H ? H.title : '' });
  const title = fill(T.weekTitle, W);
  const description = fill(H ? T.weekDescription : T.weekDescriptionNone, W);
  const crumbs = [{ name: T.crumb, path: hubPath(L) }, { name: words, path: weekPath(week, L) }];
  const i = M.weeks.indexOf(week);
  const newer = M.weeks[i - 1] || null, older = M.weeks[i + 1] || null;
  const day = (iso) => iso.slice(5, 10).replace('-', '/');
  const byCat = new Map();
  for (const e of week.events) { if (!byCat.has(e.cat)) byCat.set(e.cat, []); byCat.get(e.cat).push(e); }
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description, url: SITE_TOKEN + weekPath(week, L), inLanguage: L.tag,
      isPartOf: { '@type': 'WebSite', name: 'IntMap', url: SITE_TOKEN }, datePublished: week.to, dateModified: week.fetched,
      isBasedOn: [I.sources.usgs.query, I.sources.eonet.api] },
    breadcrumbLd(crumbs),
  ];
  const body = (up) => {
    const u = (s) => s.replace(/\{up\}/g, up);
    return `  <section class="lp-hero lp-hero-t hp-hero">
    <div class="lp-hero-text">
      <h1>${esc(T.weekH1)}</h1>
      <p class="lp-lede">${esc(fill(T.weekLede, W))}</p>
${H ? `      <h2>${esc(head.kind === 'quake' ? T.headlineH2 : T.headlineH2Event)}</h2>
      <p class="otd-t">${esc(H.title)}</p>
      <p class="otd-s">${esc(H.sub)}</p>
` : ''}      <p><a class="lp-btn" href="${up}${esc(WE.weekLink(week, I, lang))}">${esc(T.openWeek)}</a></p>
${week.provisional ? `      <p class="lp-note">${esc(T.provisional)}</p>\n` : ''}    </div>
  </section>

  <section class="lp-sec" id="earthquakes">
    <h2>${esc(fill(T.quakesH2, W))}</h2>
${week.quakes.length ? `    <ol class="otd-list">
${u(week.quakes.map((q) => row(Object.assign({ kind: 'quake' }, q), week, I, L, 'M' + q.m.toFixed(1))).join('\n'))}
    </ol>` : `    <p class="lp-note">${esc(fill(T.quakesNone, W))}</p>`}
  </section>

  <section class="lp-sec" id="events">
    <h2>${esc(T.eventsH2)}</h2>
${week.events.length ? [...byCat.entries()].map(([cat, list]) => `    <h3>${esc(WE.categoryWords(cat, I.categories[cat], lang))}</h3>
    <ol class="otd-list">
${u(list.map((e) => row(Object.assign({ kind: 'event' }, e), week, I, L, day(e.d1))).join('\n'))}
    </ol>`).join('\n') : `    <p class="lp-note">${esc(T.eventsNone)}</p>`}
${week.fewer && week.fewer.wildfires ? `    <p class="lp-note">${esc(fill(T.fewerWildfires, Object.assign({}, W, { n: fmt(week.fewer.wildfires, L) })))}</p>\n` : ''}    <p class="hp-nav">${older ? `<a rel="prev" href="${up}${weekPath(older, L)}">← ${esc(T.nav2.prev)}: ${esc(WE.weekWords(older, lang))}</a>` : '<span></span>'}${newer ? `<a rel="next" href="${up}${weekPath(newer, L)}">${esc(T.nav2.next)}: ${esc(WE.weekWords(newer, lang))} →</a>` : ''}</p>
    <p class="hp-chips"><a href="${up}${hubPath(L)}">${esc(T.nav2.hub)}</a> <a href="${up}${feedPath(L)}">${esc(T.nav2.feed)}</a> <a href="${up}${L.dir}${HISTORY_HUB}">${esc(T.nav2.history)}</a></p>
  </section>

  <section class="lp-sec" id="source">
    <h2>${esc(T.methodH2)}</h2>
${T.method.map((m) => `    <p class="lp-note">${esc(fill(m, W))}</p>`).join('\n')}
    <h2>${esc(T.sourceH2)}</h2>
    <p>${esc(T.usgsLine)} <a href="${esc(I.sources.usgs.licenceUrl)}" rel="noopener">${esc(I.sources.usgs.licence)}</a></p>
    <p>${esc(T.eonetLine)} <a href="${esc(I.sources.eonet.licenceUrl)}" rel="noopener">${esc(I.sources.eonet.licence)}</a></p>
    <p><a class="lp-open" href="${up}sources.html">${esc(T.sourcesLink)} →</a></p>
  </section>`;
  };
  return withFeed(shell({ image: M.siteImage }, L, { path: weekPath(week, L), pathFor: (l) => weekPath(week, l), title, description, crumbs, ld, body }), L);
}

/* ══ THE HUB ═════════════════════════════════════════════════════════════════════════════════════ */
function renderHub(M, L) {
  const T = TEXT[L.key], lang = L.key, I = M.idx;
  const latest = M.weeks[0], last = M.weeks[M.weeks.length - 1];
  const W = Object.assign(W0(I, L), { n: fmt(M.weeks.length, L), first: WE.weekWords(last, lang), last: WE.weekWords(latest, lang) });
  const title = T.hubTitle, description = fill(T.hubDescription, W);
  const crumbs = [{ name: T.crumb, path: hubPath(L) }];
  const H = WE.headline(latest);
  const line = (w) => `      <li class="otd-ev"><span class="otd-y">W${esc(w.w.slice(6))}</span><div><p class="otd-t"><a href="{up}${weekPath(w, L)}">${esc(WE.weekWords(w, lang))}</a></p><p class="otd-s">${esc(WE.summary(w, I, lang))}</p></div></li>`;
  const years = [...new Set(M.weeks.map((w) => w.w.slice(0, 4)))];
  const body = (up) => `  <section class="lp-hero lp-hero-t hp-hero">
    <div class="lp-hero-text">
      <h1>${esc(T.crumb)}</h1>
      <p class="lp-lede">${esc(fill(T.hubLede, W))}</p>
      <p class="hp-chips"><a href="${up}${feedPath(L)}">${esc(T.nav2.feed)}</a></p>
    </div>
  </section>
  <section class="lp-sec" id="latest">
    <h2>${esc(T.hubLatest)}: ${esc(WE.weekWords(latest, lang))}</h2>
    <p>${esc(WE.summary(latest, I, lang))}</p>
${H ? `    <p class="otd-t">${esc(WE.describe(H, I, lang).title)}</p>\n` : ''}    <p><a class="lp-btn" href="${up}${weekPath(latest, L)}">${esc(T.weekH1)} →</a></p>
  </section>
${years.map((y) => `  <section class="lp-sec">
    <h2>${esc(y)}</h2>
    <ol class="otd-list">
${M.weeks.filter((w) => w.w.startsWith(y)).map(line).join('\n').replace(/\{up\}/g, up)}
    </ol>
  </section>`).join('\n')}
  <p class="hp-chips"><a href="${up}${L.dir}${HISTORY_HUB}">${esc(T.nav2.history)}</a></p>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description, url: SITE_TOKEN + hubPath(L), inLanguage: L.tag,
    isPartOf: { '@type': 'WebSite', name: 'IntMap', url: SITE_TOKEN } }, breadcrumbLd(crumbs)];
  return withFeed(shell({ image: M.siteImage }, L, { path: hubPath(L), pathFor: (l) => hubPath(l), title, description, crumbs: null, ld, body }), L);
}

/* ══ THE FEED — Atom 1.0 (RFC 4287), one entry per week; its id is the week page's address, stable across builds ══ */
export function renderFeed(M, L) {
  const T = TEXT[L.key], lang = L.key, I = M.idx;
  const hub = SITE_TOKEN + hubPath(L);
  const at = (d) => d + 'T00:00:00Z';
  const updated = M.weeks.reduce((m, w) => (w.fetched > m ? w.fetched : m), '1970-01-01');
  const entry = (w) => {
    const H = WE.headline(w), page = SITE_TOKEN + weekPath(w, L);
    const text = WE.summary(w, I, lang) + (H ? (lang === 'jp' ? '。最大: ' : '. Largest: ') + WE.describe(H, I, lang).title : '');
    return `  <entry>
    <id>${esc(page)}</id>
    <title>${esc(fill(T.weekTitle, { week: WE.weekWords(w, lang) }))}</title>
    <published>${at(w.to)}</published>
    <updated>${at(w.fetched)}</updated>
    <link rel="alternate" type="text/html" href="${esc(page)}"/>
    <summary type="text">${esc(text)}</summary>
  </entry>`;
  };
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED by scripts/weekly-earth-pages.mjs from data/weekly-earth.json. -->
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${L.tag}">
  <id>${esc(hub)}</id>
  <title>${esc(T.feedTitle)}</title>
  <subtitle>${esc(T.feedSubtitle)}</subtitle>
  <updated>${at(updated)}</updated>
  <link rel="self" type="application/atom+xml" href="${esc(SITE_TOKEN + feedPath(L))}"/>
  <link rel="alternate" type="text/html" href="${esc(hub)}"/>
  <author><name>IntMap</name></author>
  <icon>${esc(SITE_TOKEN + 'IntMap.Icon.png')}</icon>
  <rights>${esc(T.usgsLine + ' ' + T.eonetLine)}</rights>
${M.weeks.map(entry).join('\n')}
</feed>
`;
}

function sitemap(M) {
  const paths = [(l) => hubPath(l), ...M.weeks.map((w) => (l) => weekPath(w, l))];
  const all = [];
  for (const pf of paths) for (const L of LANGS) {
    all.push(`  <url><loc>${esc(SITE_TOKEN + pf(L))}</loc>\n${LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.tag}" href="${esc(SITE_TOKEN + pf(l))}"/>`).join('\n')}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(SITE_TOKEN + pf(LANGS[0]))}"/>\n  </url>`);
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!-- GENERATED by scripts/weekly-earth-pages.mjs when the site is built. -->\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + all.join('\n') + '\n</urlset>\n';
}

/** path (relative to the site root) → file body, for every file this generator writes */
export function outputs(M) {
  M.siteImage = M.siteImage || siteImage();
  const out = {};
  for (const L of LANGS) {
    for (const w of M.weeks) out[weekPath(w, L) + 'index.html'] = renderWeek(M, w, L);
    out[hubPath(L) + 'index.html'] = renderHub(M, L);
    out[feedPath(L)] = renderFeed(M, L);
  }
  out[WEEKLY_SITEMAP] = sitemap(M);
  return out;
}

export function writeTo(dir) {
  const M = model();
  const out = outputs(M);
  for (const [rel, body] of Object.entries(out)) { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); }
  return { model: M, files: Object.keys(out).length };
}

/* ══ THE DRAFTS — a person approves and posts each; nothing leaves this machine from here ════════════ */
const CAMPAIGN = 'weekly-earth';
const X_MAX = 280;
export function draftsFor(M, week, site) {
  const out = [];
  const head = WE.headline(week);
  for (const L of LANGS) {
    const T = TEXT[L.key], lang = L.key;
    const H = head ? WE.describe(head, M.idx, lang).title : '';
    for (const ch of CHANNELS) {
      const link = site + weekPath(week, L) + '?utm_source=' + ch + '&utm_medium=social&utm_campaign=' + CAMPAIGN;
      let summary = WE.summary(week, M.idx, lang);
      const make = () => fill(T.post.x, { week: WE.weekWords(week, lang), headline: H, summary, link });
      let text = make();
      /* X counts a URL as 23 and a CJK character as 2: the summary is the part that gives way */
      while (ch === 'x' && xWeight(text) > X_MAX && summary.length > 20) { summary = summary.slice(0, summary.length - 8).replace(/[\s,、。;]+$/u, '') + '…'; text = make(); }
      out.push({ week: week.w, lang, channel: ch, text, link });
    }
  }
  return out;
}
function queueMarkdown(M, week, site) {
  const lines = ['# IntMap — 今週の地球: 投稿の下書き（承認待ち）', '',
    '> `node scripts/weekly-earth-pages.mjs --queue` が書いた。**投稿・予約・送信はしていない。** 1 行ずつ人が読み、承認したものだけを人が投稿する（docs/marketing/README.md）。', '',
    '## ' + week.w + '（' + week.from + ' – ' + week.to + '）', ''];
  for (const x of draftsFor(M, week, site)) lines.push('- [ ] 承認 · ' + x.channel + ' · ' + x.lang + (x.channel === 'x' ? ' · X 換算 ' + xWeight(x.text) + '/' + X_MAX : ''), '', '  ```', ...x.text.split('\n').map((t) => '  ' + t), '  ```', '');
  return lines.join('\n');
}

/** Vite plugin: write the pages and feeds into dist/ after the static copy, before the site URL is filled in — like
 *  scripts/on-this-day-pages.mjs, in a child process (js/ modules it reads install browser globals in Node) */
export function weeklyEarthPagesPlugin() {
  let outDir = null;
  return {
    name: 'intmap-weekly-earth-pages',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle: { sequential: true, async handler() {
      const { execFile } = await import('node:child_process');
      await new Promise((ok, fail) => execFile(process.execPath, [fileURLToPath(import.meta.url), '--out', outDir],
        { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (stdout) process.stdout.write(stdout);
          if (err) { fail(new Error('weekly-earth-pages failed: ' + (stderr || err.message))); return; }
          ok();
        }));
    } },
  };
}

/* ── main ─────────────────────────────────────────────────────────────────────────────────────── */
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const t0 = Date.now();
  if (arg('--out')) {
    const { model: M, files } = writeTo(resolve(arg('--out')));
    console.log('weekly-earth-pages: wrote ' + files + ' files (' + M.weeks.length + ' weeks × ' + LANGS.length + ' languages, 2 feeds) into ' + arg('--out') + ' in ' + (Date.now() - t0) + ' ms');
  } else if (process.argv.includes('--queue')) {
    const M = model();
    const week = WE.weekIn(M.idx, arg('--week'));
    if (!week) { console.error('weekly-earth-pages: the archive holds no week ' + arg('--week')); process.exit(1); }
    for (const ch of CHANNELS) if (campaignOf('?utm_source=' + ch + '&utm_medium=social&utm_campaign=' + CAMPAIGN).length !== 3) throw new Error('weekly-earth-pages: the tags for ' + ch + ' do not pass the counter\'s rule');
    process.stdout.write(queueMarkdown(M, week, siteUrl('')) + '\n');
  } else {
    const M = model();
    console.log('weekly-earth-pages: ' + M.weeks.length + ' weeks; ' + (M.weeks.length * LANGS.length + LANGS.length) + ' pages and ' + LANGS.length + ' feeds');
  }
}
