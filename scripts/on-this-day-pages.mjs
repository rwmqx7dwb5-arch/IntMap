#!/usr/bin/env node
/* ============================================================================
 *  IntMap · ON THIS DAY — a page and a picture for every day of the year, and the drafts of the day's post   (marketing-next)
 * ----------------------------------------------------------------------------
 *  「次の流入エンジン」 (2026-10-03). The historical-map entry pages (scripts/history-pages.mjs) answer a search for a
 *  PLACE and a YEAR. People also look for a DAY — «on this day in history», «10月3日 何の日» — every day of the year,
 *  and the feeds that post one map a day are how a map is shared. This writes, from data/on-this-day.json (one index,
 *  computed by the map's own code — scripts/build-on-this-day.mjs):
 *    · on-this-day/<MM-DD>/ and ja/on-this-day/<MM-DD>/ — every event the records date to that day, in every year
 *      they cover, each opening the map on that very day (its date, its place, for a war its layer, and the event as
 *      the link's title); a day with no event has no page (the hub says so instead of publishing an empty one);
 *    · on-this-day/<MM-DD>/card.png — the day's link card, drawn from the border record (scripts/lib/map-card.mjs):
 *      the outlines on the headline's date with what changed coloured, and the date in figures, so one picture
 *      serves both languages;
 *    · on-this-day/ and ja/on-this-day/ — the calendar; sitemap-on-this-day.xml, joined by sitemap-index.xml;
 *    · `--queue` — THE DRAFTS of a daily post (X, Bluesky, Threads; en and ja) for a run of dates, each with the day's
 *      page, its picture and a checkbox for the person who approves it. ⚠ NOTHING IS POSTED, SENT OR SCHEDULED FROM
 *      HERE: the queue is text for a person (docs/marketing/README.md, «承認が要ること»).
 *
 *  ⚠ THE WORDING OF AN EVENT IS NOT WRITTEN HERE: js/on-this-day.js `describe` writes it, for this page, the app's
 *  sheet and Atlas alike. ⚠ The links into the day pages carry utm tags in the drafts because a day page is an entry
 *  the app counts (supabase/functions/usage-count/shape.js SITE_PAGES 'on-this-day'): a reader who goes on to the map
 *  arrives with the page as referrer, and the app reads that page's tags (js/usage-counts.js arrivalRows).
 *
 *    node scripts/on-this-day-pages.mjs --out <dir>                 write the pages, the cards and the sitemap into <dir>
 *    node scripts/on-this-day-pages.mjs --queue [--from YYYY-MM-DD] [--days N]   print the drafts (default: 14 days from today)
 *    node scripts/on-this-day-pages.mjs --stats                     count; write nothing
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TEXT } from './on-this-day-text.mjs';
import { SITE_TOKEN } from './site-url.mjs';
import { siteUrl } from '../supabase/functions/_shared/site-origin.js';   /* the one site address (scripts/site-url.mjs reads the same) */
import { LANGS, HUB as HISTORY_HUB, shell, esc, fill, breadcrumbLd, siteImage } from './history-pages.mjs';
import * as OTD from '../js/on-this-day.js';
import { campaignOf } from '../supabase/functions/usage-count/shape.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OTD_HUB = 'on-this-day/';
export const OTD_SITEMAP = 'sitemap-on-this-day.xml';
export const CARD_FILE = 'card.png';

export const dayPath = (md, L) => L.dir + OTD_HUB + md + '/';
export const hubPath = (L) => L.dir + OTD_HUB;
export const cardPath = (md) => OTD_HUB + md + '/' + CARD_FILE;

/** the index and what the pages are made of */
export function model(idx) {
  const I = idx || JSON.parse(readFileSync(join(ROOT, OTD.INDEX_PATH), 'utf8'));
  const all = OTD.allDays();
  const days = all.filter((md) => OTD.eventsOn(I, md).length);
  return { idx: I, all, days };
}
const nOf = (I) => Object.values(I.days).reduce((a, l) => a + l.length, 0);
const fmt = (v, L) => v.toLocaleString(L.intl);
const warNames = (I, lang) => Object.values(I.wars).map((w) => (lang === 'jp' && w.jp) || w.en).join(lang === 'jp' ? '・' : ', ');

/** the card a day's page names, as the drawing takes it (scripts/lib/map-card.mjs drawCard) */
export function cardSpec(I, md) {
  const h = OTD.headline(OTD.eventsOn(I, md)) || OTD.eventsOn(I, md)[0];
  const gws = (l) => (l || []).flatMap((p) => p.gw || []);
  return { date: h.d, box: OTD.boxOf(h), appeared: gws(h.appeared), redrawn: gws(h.redrawn), ended: gws(h.ended), point: h.src === 'wars' ? (h.at || null) : null, label: h.d, event: h };
}

/* ══ THE DAY PAGE ════════════════════════════════════════════════════════════════════════════════ */
function renderDay(M, md, L) {
  const T = TEXT[L.key], lang = L.key, I = M.idx;
  const list = OTD.eventsOn(I, md);
  const day = OTD.dayWords(md, lang);
  const head = OTD.headline(list) || list[0];
  const H = OTD.describe(head, I, lang);
  const years = list.map((e) => OTD.describe(e, I, lang).year);
  const W = { day, n: fmt(list.length, L), first: String(Math.min(...years)), last: String(Math.max(...years)) };
  const title = fill(T.dayTitle, W);
  const description = list.length > 1 ? fill(T.dayDescription, { ...W, year: String(H.year), headline: H.text, more: fmt(list.length - 1, L) })
    : fill(T.dayDescriptionOne, { year: String(H.year), headline: H.text });
  const crumbs = [{ name: T.crumb, path: hubPath(L) }, { name: day, path: dayPath(md, L) }];
  const recordOf = (D) => (D.war ? fill(T.record.war, { war: D.war }) : T.record.border);
  const row = (ev) => {
    const D = OTD.describe(ev, I, lang);
    return `      <li class="otd-ev"><span class="otd-y">${esc(D.year)}</span><div><p class="otd-t">${esc(D.text)}</p><p class="otd-s">${esc(recordOf(D))}${ev.d2 ? ' · ' + esc(ev.d + ' – ' + ev.d2) : ''}</p>`
      + `<a class="lp-open" data-otd="${esc(ev.d)}" href="${esc('{up}' + OTD.linkFor(ev, I, lang))}">${esc(T.open)} →</a></div></li>`;
  };
  const dated = list.filter((e) => !e.maybeYearOnly), yearOnly = list.filter((e) => e.maybeYearOnly);
  const i = M.days.indexOf(md);
  const prev = M.days[(i - 1 + M.days.length) % M.days.length], next = M.days[(i + 1) % M.days.length];
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description, url: SITE_TOKEN + dayPath(md, L), inLanguage: L.tag,
      isPartOf: { '@type': 'WebSite', name: 'IntMap', url: SITE_TOKEN }, primaryImageOfPage: SITE_TOKEN + cardPath(md),
      isBasedOn: [I.src.cshapes, I.src.wars] },
    breadcrumbLd(crumbs),
  ];
  const body = (up) => {
    const u = (s) => s.replace(/\{up\}/g, up);
    return `  <section class="lp-hero lp-hero-t hp-hero">
    <div class="lp-hero-text">
      <h1>${esc(fill(T.dayH1, W))}</h1>
      <p class="lp-lede">${esc(fill(T.dayLede, W))}</p>
    </div>
    <figure class="otd-card"><img src="${up}${cardPath(md)}" width="1200" height="630" alt="${esc(fill(T.pictureAlt, { date: head.d, headline: H.text }))}" loading="eager" decoding="async"></figure>
  </section>

  <section class="lp-sec" id="events">
    <ol class="otd-list">
${u(dated.map(row).join('\n'))}
    </ol>
${yearOnly.length ? `    <h2>${esc(T.yearOnlyH2)}</h2>
    <p class="lp-sub">${esc(T.yearOnlyNote)}</p>
    <ol class="otd-list">
${u(yearOnly.map(row).join('\n'))}
    </ol>
` : ''}    <p class="hp-nav"><a rel="prev" href="${up}${dayPath(prev, L)}">← ${esc(T.nav.prev)}: ${esc(OTD.dayWords(prev, lang))}</a><a rel="next" href="${up}${dayPath(next, L)}">${esc(T.nav.next)}: ${esc(OTD.dayWords(next, lang))} →</a></p>
    <p class="hp-chips"><a href="${up}${hubPath(L)}">${esc(T.nav.hub)}</a> <a href="${up}${L.dir}${HISTORY_HUB}">${esc(T.nav.history)}</a></p>
  </section>

  <section class="lp-sec" id="source">
    <h2>${esc(T.methodH2)}</h2>
${T.method.map((m) => `    <p class="lp-note">${esc(fill(m, { wars: warNames(I, lang) }))}</p>`).join('\n')}
    <h2>${esc(T.sourceH2)}</h2>
    <p>${esc(I.src.cshapes)}</p>
    <p>${esc(I.src.wars)}</p>
    <p><a class="lp-open" href="${up}sources.html">${esc(T.sourcesLink)} →</a></p>
  </section>`;
  };
  return shell({ image: { path: cardPath(md), width: 1200, height: 630 } }, L, { path: dayPath(md, L), pathFor: (l) => dayPath(md, l), title, description, crumbs, ld, body });
}

/* ══ THE CALENDAR ════════════════════════════════════════════════════════════════════════════════ */
function renderHub(M, L, image) {
  const T = TEXT[L.key], lang = L.key, I = M.idx;
  const W = { n: fmt(nOf(I), L), d: fmt(M.days.length, L), from: String(I.span.from), to: String(I.span.to), cshapes: I.src.cshapes };
  const title = T.hubTitle, description = fill(T.hubDescription, W);
  const crumbs = [{ name: T.crumb, path: hubPath(L) }];
  const months = [];
  for (let m = 1; m <= 12; m++) months.push(M.all.filter((md) => +md.slice(0, 2) === m));
  const monthName = (m) => new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString(L.intl, { month: 'long', timeZone: 'UTC' });
  const body = (up) => `  <section class="lp-hero lp-hero-t hp-hero">
    <div class="lp-hero-text">
      <h1>${esc(title)}</h1>
      <p class="lp-lede">${esc(fill(T.hubLede, W))}</p>
    </div>
  </section>
${months.map((mds, k) => `  <section class="lp-sec otd-month">
    <h2>${esc(monthName(k + 1))}</h2>
    <p class="hp-chips">${mds.map((md) => (M.days.includes(md) ? `<a href="${up}${dayPath(md, L)}">${esc(String(+md.slice(3)))}</a>` : `<span class="otd-none">${esc(String(+md.slice(3)))}</span>`)).join(' ')}</p>
  </section>`).join('\n')}
  <p class="lp-note">${esc(T.hubEmpty)}</p>
  <p class="hp-chips"><a href="${up}${L.dir}${HISTORY_HUB}">${esc(T.nav.history)}</a></p>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description, url: SITE_TOKEN + hubPath(L), inLanguage: L.tag,
    isPartOf: { '@type': 'WebSite', name: 'IntMap', url: SITE_TOKEN } }, breadcrumbLd(crumbs)];
  return shell({ image }, L, { path: hubPath(L), pathFor: (l) => hubPath(l), title, description, crumbs: null, ld, body });
}

function sitemap(M) {
  const paths = [(l) => hubPath(l), ...M.days.map((md) => (l) => dayPath(md, l))];
  const all = [];
  for (const pf of paths) for (const L of LANGS) {
    all.push(`  <url><loc>${esc(SITE_TOKEN + pf(L))}</loc>\n${LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.tag}" href="${esc(SITE_TOKEN + pf(l))}"/>`).join('\n')}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(SITE_TOKEN + pf(LANGS[0]))}"/>\n  </url>`);
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!-- GENERATED by scripts/on-this-day-pages.mjs when the site is built. -->\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + all.join('\n') + '\n</urlset>\n';
}

/** path (relative to the site root) → file body, for every TEXT file this generator writes (the cards are `writeTo`'s) */
export function outputs(M) {
  const out = {};
  /* the calendar's picture is today's site card — a calendar has no one day to draw */
  const hubImage = M.siteImage || siteImage();
  for (const L of LANGS) {
    for (const md of M.days) out[dayPath(md, L) + 'index.html'] = renderDay(M, md, L);
    out[hubPath(L) + 'index.html'] = renderHub(M, L, hubImage);
  }
  out[OTD_SITEMAP] = sitemap(M);
  return out;
}

export async function writeTo(dir, opt) {
  const M = Object.assign(model(), { siteImage: siteImage() });
  const out = outputs(M);
  for (const [rel, body] of Object.entries(out)) { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); }
  const days = opt && opt.days ? M.days.filter((d) => opt.days.includes(d)) : M.days;
  await drawCards(M, dir, days);
  return { model: M, files: Object.keys(out).length + days.length };
}
/* the cards are the slow part (≈0.25–1 s each, CPU only), so a long run is split over child processes — one share of
   the days each, the same function in each. ⚠ the number of children is the machine's (os.availableParallelism) less
   one for the build itself, at most 4: past that the 13 MB record each child parses costs more than it saves. */
async function drawCards(M, dir, days, here) {
  const os = await import('node:os');
  const k = Math.max(1, Math.min(4, ((os.availableParallelism && os.availableParallelism()) || 2) - 1));
  if (here || days.length < 16 || k === 1) {   /* `here`: a child draws its own share and spawns nothing */
    const { drawCard } = await import('./lib/map-card.mjs');
    for (const md of days) { const p = join(dir, cardPath(md)); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, await drawCard(cardSpec(M.idx, md))); }
    return;
  }
  const { execFile } = await import('node:child_process');
  const shares = Array.from({ length: k }, (_, i) => days.filter((_, j) => j % k === i));
  await Promise.all(shares.map((share) => new Promise((ok, fail) => execFile(process.execPath, [fileURLToPath(import.meta.url), '--cards', dir, '--only', share.join(',')],
    { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 }, (err, _o, stderr) => (err ? fail(new Error('on-this-day cards: ' + (stderr || err.message))) : ok())))));
}

/* ══ THE DRAFTS — a person approves and posts each; nothing leaves this machine from here ════════════ */
/* the channels a daily map is posted to, and the utm_source each link carries (shape.js campaignOf checks the tags) */
export const CHANNELS = ['x', 'bluesky', 'threads'];
const CAMPAIGN = 'on-this-day';
/** X counts a URL as 23 and a CJK character as 2 (its documented weighting); the other two channels allow more */
export function xWeight(s) {
  let n = 0;
  for (const part of String(s).split(/(https?:\/\/\S+)/)) {
    if (/^https?:\/\//.test(part)) { n += 23; continue; }
    for (const ch of part) n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1;
  }
  return n;
}
const X_MAX = 280;
export function draftsFor(M, md, site) {
  const out = [];
  const list = OTD.eventsOn(M.idx, md);
  const head = OTD.headline(list);
  if (!head) return out;
  for (const L of LANGS) {
    const T = TEXT[L.key], D = OTD.describe(head, M.idx, L.key);
    for (const ch of CHANNELS) {
      const link = site + dayPath(md, L) + '?utm_source=' + ch + '&utm_medium=social&utm_campaign=' + CAMPAIGN;
      let headline = D.text, text = fill(T.post.x, { year: String(D.year), day: OTD.dayWords(md, L.key), headline, link });
      while (ch === 'x' && xWeight(text) > X_MAX && headline.length > 20) {
        headline = headline.slice(0, headline.length - 8).replace(/[\s,、。;]+$/u, '') + '…';
        text = fill(T.post.x, { year: String(D.year), day: OTD.dayWords(md, L.key), headline, link });
      }
      out.push({ md, lang: L.key, channel: ch, text, link, image: site + cardPath(md), event: head.d });
    }
  }
  return out;
}
function queueMarkdown(M, from, days, site) {
  const lines = ['# IntMap — この日の歴史地図: 投稿の下書き（承認待ち）', '',
    '> `node scripts/on-this-day-pages.mjs --queue` が書いた。**投稿・予約・送信はしていない。** 1 行ずつ人が読み、承認したものだけを人が投稿する（docs/marketing/README.md）。', ''];
  const d = new Date(from + 'T12:00:00Z');
  for (let k = 0; k < days; k++) {
    const md = OTD.mdOf(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const iso = d.toISOString().slice(0, 10);
    const drafts = draftsFor(M, md, site);
    lines.push('## ' + iso + '（' + md + '）', '');
    if (!drafts.length) lines.push('- この日は記録に出来事がない — 投稿しない', '');
    for (const x of drafts) lines.push('- [ ] 承認 · ' + x.channel + ' · ' + x.lang + (x.channel === 'x' ? ' · X 換算 ' + xWeight(x.text) + '/' + X_MAX : ''), '', '  ```', ...x.text.split('\n').map((t) => '  ' + t), '  ```', '  画像: ' + x.image, '');
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return lines.join('\n');
}

/** Vite plugin: write the pages and cards into dist/ after the static copy, before the site URL is filled in — like
 *  scripts/history-pages.mjs historyPagesPlugin, in a child process (the cards are CPU work Vite's process need not hold) */
export function onThisDayPagesPlugin() {
  let outDir = null;
  return {
    name: 'intmap-on-this-day-pages',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle: { sequential: true, async handler() {
      const { execFile } = await import('node:child_process');
      await new Promise((ok, fail) => execFile(process.execPath, [fileURLToPath(import.meta.url), '--out', outDir],
        { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (stdout) process.stdout.write(stdout);
          if (err) { fail(new Error('on-this-day-pages failed: ' + (stderr || err.message))); return; }
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
  if (arg('--cards')) {
    const M = model();
    await drawCards(M, resolve(arg('--cards')), (arg('--only') || '').split(',').filter((md) => M.days.includes(md)), true);
  } else if (arg('--out')) {
    const { model: M, files } = await writeTo(resolve(arg('--out')));
    console.log('on-this-day-pages: wrote ' + files + ' files (' + M.days.length + ' days × ' + LANGS.length + ' languages, ' + M.days.length + ' cards) into ' + arg('--out') + ' in ' + (Date.now() - t0) + ' ms');
  } else if (process.argv.includes('--queue')) {
    const from = arg('--from') || new Date().toISOString().slice(0, 10);
    const days = Math.max(1, Math.min(366, +(arg('--days') || 14)));
    const site = siteUrl('');
    for (const ch of CHANNELS) if (campaignOf('?utm_source=' + ch + '&utm_medium=social&utm_campaign=' + CAMPAIGN).length !== 3) throw new Error('on-this-day-pages: the tags for ' + ch + ' do not pass the counter\'s rule');
    process.stdout.write(queueMarkdown(model(), from, days, site) + '\n');
  } else {
    const M = model();
    console.log('on-this-day-pages: ' + M.days.length + ' days with events of ' + M.all.length + ', ' + nOf(M.idx) + ' events; ' + (M.days.length * LANGS.length + LANGS.length) + ' pages, ' + M.days.length + ' cards');
  }
}
