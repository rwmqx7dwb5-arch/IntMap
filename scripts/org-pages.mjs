#!/usr/bin/env node
/* ============================================================================
 *  IntMap · org-pages — the pages organisations and supporters land on, GENERATED   (sales-channels)
 * ----------------------------------------------------------------------------
 *  「求めるのは改善ではなく商品開発、マーケティング、営業。」 (2026-10-03). IntMap could be embedded
 *  (js/embed-mode.js) and taught with (teachers.html), but a newsroom, a school board or a research
 *  group had no page that spoke to them and nowhere to write; a donor had no page that said what the
 *  money is for and no way to be thanked by name. This file writes, in English and Japanese (ja/…):
 *
 *    for-newsrooms.html   embedding a sourced, interactive map in a story
 *    for-schools.html     what a school or district needs to know (the lesson itself is teachers.html)
 *    for-research.html    research groups and NGOs: own data, citing, embedding, adding a dataset
 *    contact.html         the enquiry form → reader-reports (kind 'inquiry') → public.org_inquiries
 *    support.html         what running IntMap costs, this month's AI use, giving, and the supporters
 *    press.html           (press-room) the material for writing ABOUT IntMap: the brand's descriptions to quote (each with a
 *                         Copy button), the facts, the logo and screenshots to download, the feed, and where to ask. It
 *                         carries NO words or numbers of its own about the product: scripts/brand-text.mjs owns the
 *                         descriptions, scripts/brand.mjs the numbers, js/showcase.js the screenshots.
 *    corrections.html     (community-next) the public log of map corrections: how to report, how a report is
 *                         checked, the counts, what was published, and this browser's own reports and answers
 *    curriculum.html      (curriculum-sales-kit) the unit map: the units of three curricula, quoted from their documents
 *                         (data/curriculum-units.json), each with the maps, classroom tours and quests IntMap opens for it
 *                         and «Make a tour for this unit»; a unit with none says «not covered yet» (scripts/curriculum-kit.mjs)
 *    school-handout.html  (curriculum-sales-kit) one A4 sheet for a school's leadership and IT staff — every fact on it is
 *                         another page's string or a number read from its owner
 *
 *  ══ WHY GENERATED (the same reasons as scripts/landing.mjs, whose facts() this file reuses) ═══════
 *    · the PROSE        → scripts/org-pages-text.mjs (en + jp, one place)
 *    · the EXAMPLES     → js/showcase.js (the captured example maps and their links)
 *    · the FACTS        → their owners: the layer count and the clock's floor (landing.mjs facts()),
 *                         the Atlas allowance (supabase/functions/_shared/plans.js), the embed sizes
 *                         (js/embed-mode.js EMBED_SIZES), the donation links (js/supporter.js via facts()),
 *                         the retention (the purge defaults in the org_inquiries migration), the base
 *                         map's free allowance (js/carto-basemap.js's header), the form's vocabulary
 *                         (supabase/functions/_shared/inquiry-shape.js INQUIRY) and the backend address
 *                         (src/vendor.js, where the app's own client is made).
 *  A number that cannot be read from its owner stops the generator — it is never typed here instead.
 *
 *  The live parts (sending the form, this month's AI use, the supporters list) are js/org-page.js, a
 *  plain script from this origin: these pages carry no inline script, so script-src is 'self' alone.
 *
 *    admin-inquiries.html (English, noindex) the operator's console for the enquiries and the supporters list
 *    admin-corrections.html (English, noindex) the operator's console for map corrections — on a map (community-next)
 *
 *    node scripts/org-pages.mjs --write    regenerate the eleven pages
 *    node scripts/org-pages.mjs --check    exit 1 if any differs from what --write would produce
 *                                          (tests/sales-channels-checks.test.mjs runs this)
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { load as yamlLoad } from 'js-yaml';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TEXT, ORG_NAV } from './org-pages-text.mjs';
import { facts, pageLinks } from './landing.mjs';
import { TEXT as LANDING_TEXT } from './landing-text.mjs';
import { SHOWCASE, CAPTURED } from '../js/showcase.js';
import { EMBED_SIZES } from '../js/embed-mode.js';
import { PLANS, DEFAULT_PLAN } from '../supabase/functions/_shared/plans.js';
import { INQUIRY, INQUIRY_LIMITS, INQUIRY_PIPELINE } from '../supabase/functions/_shared/inquiry-shape.js';
import { CORRECTION } from '../supabase/functions/_shared/correction-shape.js';
import { withInlineHashes } from './csp.mjs';
import { brandFacts, words as brandWords, factWords, jpegInfo } from './brand.mjs';   /* (press-room) the press room says what the brand says, filled the way brand.mjs fills it */
import { HUB as HISTORY_HUB } from './history-pages.mjs';
import { OTD_HUB } from './on-this-day-pages.mjs';
import { pagePath as updatesPath, feedPath as updatesFeed } from './whats-new.mjs';
import { readLedger } from './outbound-hosts.mjs';
import { SENDS_WORDS } from '../js/connections-panel.js';
import { MODEL as CURRICULUM_KIT } from './curriculum-kit.mjs';   /* (curriculum-sales-kit) the unit map's model — units, and the links the app's codecs write */
import { kindTitle } from '../js/quest-engine.js';                 /* (curriculum-sales-kit) a quest kind's name, the panel's own */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
function need(re, src, what) { const m = re.exec(src); if (!m) throw new Error('org-pages: cannot read ' + what); return m; }

export const PAGES = ORG_NAV.map(([page]) => page);   /* (teachers-and-entrances) the one list, scripts/org-pages-text.mjs */
const LANGS = [
  { key: 'en', i: 0, tag: 'en', dir: '', up: './', locale: 'en_US', num: 'en-US' },
  { key: 'jp', i: 1, tag: 'ja', dir: 'ja/', up: '../', locale: 'ja_JP', num: 'ja-JP' },
];
export const pagePath = (page, L) => L.dir + page + '.html';

/* Which example maps each introduction page shows — an editorial choice of what suits the reader, not a
   rule (no-ad-hoc-hardcoding §1 is about case-by-case fixes; this is the content of a page). An id that
   js/showcase.js withholds or has not captured is skipped, never shown without its picture and link. */
const EXAMPLES = {
  'for-newsrooms': ['cold-war-1985', 'korea-1950', 'ring-of-fire', 'ww2-1942'],
  'for-schools': ['europe-1914', 'japan-1900', 'world-100', 'koppen'],
  'for-research': ['world-3000bc', 'koppen', 'ring-of-fire', 'europe-1920'],
};
/* (press-room) the marks offered for download. Which files are marks is an editorial choice; that each exists, how big it is and
   that the build copies it are read from the file and from vite.config.js (tests/press-room-checks.test.mjs). The light-ground mark
   (IntMap.Icon_BW-inverted.png) is not offered: the build ships only its hashed copy (vite.config.js STATIC_EXCLUDE). */
const MARKS = [['IntMap.Icon.png', 'logoMark'], ['icons/icon-512.png', 'logoLarge'], ['icons/apple-touch-icon.png', 'logoSmall']];
/* the contact form's preselection per page: ?for=<audience>&about=<purpose> */
const ASK = {
  'for-newsrooms': { for: 'newsroom', about: 'embed' },
  'for-schools': { for: 'education', about: 'classroom' },
  curriculum: { for: 'education', about: 'classroom' },          /* (curriculum-sales-kit) */
  'school-handout': { for: 'education', about: 'classroom' },
  'for-research': { for: 'research', about: 'data' },
  support: { for: 'supporter', about: 'supporter_listing' },
  security: { for: 'other', about: 'security' },
};

/* ── the facts, from their owners ─────────────────────────────────────────────────────────── */
export function orgFacts() {
  const F = facts();
  const vendor = rd('src/vendor.js');
  const backend = need(/window\.SUPABASE_URL = '(https:\/\/[a-z0-9]+\.supabase\.co)';/, vendor, 'src/vendor.js SUPABASE_URL')[1];
  const anonKey = need(/window\.SUPABASE_ANON_KEY = '([A-Za-z0-9_.-]+)';/, vendor, 'src/vendor.js SUPABASE_ANON_KEY')[1];
  const mig = rd('supabase/migrations/20261003150000_org_inquiries.sql');
  const [, spamDays, keepDays] = need(/p_spam_days integer default (\d+), p_keep_days integer default (\d+)/, mig, 'the org_inquiries purge defaults');
  const carto = need(/Free to ([\d,]+) tile requests/, rd('js/carto-basemap.js'), 'js/carto-basemap.js free allowance');
  const plan = PLANS[DEFAULT_PLAN];
  if (!plan || !Number.isFinite(plan.aiTurnsPerDay)) throw new Error('org-pages: cannot read the default plan\'s aiTurnsPerDay');
  return {
    ...F, backend, anonKey, spamDays: +spamDays, keepDays: +keepDays, security: securityFacts(),
    cartoFree: Number(carto[1].replace(/,/g, '')), aiTurns: plan.aiTurnsPerDay,
    sizes: Object.values(EMBED_SIZES).filter((s) => typeof s.w === 'number').map((s) => [s.w, s.h]),
  };
}

function words(F, L) {
  const n = (v) => v.toLocaleString(L.num);
  const sizes = F.sizes.map(([w, h]) => w + '×' + h);
  return {
    layers: n(F.layers),
    floorBC: L.key === 'jp' ? '紀元前' + n(F.bcYears) + '年' : n(F.bcYears) + ' BC',
    aiTurns: n(F.aiTurns),
    sizes: L.key === 'jp' ? sizes.join('・') : sizes.slice(0, -1).join(', ') + ' or ' + sizes.at(-1),
    spamDays: n(F.spamDays), keepDays: n(F.keepDays), cartoFree: n(F.cartoFree),
  };
}
function fill(s, W) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in W)) throw new Error('org-pages: unknown placeholder ' + m + ' in «' + s + '»');
    return W[k];
  });
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── head ─────────────────────────────────────────────────────────────────────────────────── */
const FONT_CSS_ORIGIN = 'https://fonts.googleapis.com', FONT_FILE_ORIGIN = 'https://fonts.gstatic.com';
/* The policy is what the page loads: its own CSS, pictures and one script; the CJK face on a Japanese
   page; and IntMap's own backend ONLY on the two pages that talk to it (contact sends, support reads). */
function cspMeta({ webFonts, backend }) {
  return '<meta http-equiv="Content-Security-Policy" content="' + [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'", "form-action 'self'", "frame-src 'none'",
    "connect-src 'self'" + (backend ? ' ' + backend : ''), "img-src 'self' data:",
    "style-src 'self'" + (webFonts ? ' ' + FONT_CSS_ORIGIN : ''), "font-src 'self' data:" + (webFonts ? ' ' + FONT_FILE_ORIGIN : ''),
    "script-src 'self'",
  ].join('; ') + '">';
}
/* the pages that talk to the backend — the only ones whose connect-src names it (tests/sales-channels-checks.test.mjs ④) */
export const TALKS = new Set(['contact', 'support', 'corrections']);
const textKey = (page) => page.replace(/^for-/, '');

function head(F, L, page) {
  const T = TEXT[textKey(page)], k = L.i, W = words(F, L);
  const title = fill(T.title[k], W), desc = fill(T.description[k], W);
  const url = (l) => F.site + pagePath(page, l);
  const cjk = L.tag === 'ja';
  const ld = { '@context': 'https://schema.org', '@type': page === 'contact' ? 'ContactPage' : 'WebPage', name: title, url: url(L),
    description: desc, inLanguage: L.tag, isPartOf: { '@type': 'WebSite', name: 'IntMap', url: F.site } };
  return `<!DOCTYPE html>
<html lang="${L.tag}">
<head>
<meta charset="utf-8">
${cspMeta({ webFonts: cjk, backend: TALKS.has(page) ? F.backend : '' })}
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- GENERATED by scripts/org-pages.mjs from scripts/org-pages-text.mjs — edit those, not this file. -->
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url(L))}">
${LANGS.map((l) => `<link rel="alternate" hreflang="${l.tag}" href="${esc(url(l))}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${esc(url(LANGS[0]))}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="IntMap">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url(L))}">
<meta property="og:locale" content="${L.locale}">
<meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">${TALKS.has(page) ? `
<meta name="intmap-backend" content="${esc(F.backend)}">
<meta name="intmap-anon-key" content="${esc(F.anonKey)}">` : ''}
<link rel="icon" href="${L.up}IntMap.Icon.png">${cjk ? `
<link rel="preconnect" href="${FONT_CSS_ORIGIN}">
<link rel="preconnect" href="${FONT_FILE_ORIGIN}" crossorigin>
<link rel="stylesheet" href="${FONT_CSS_ORIGIN}/css2?family=Noto+Sans+JP:wght@400;500;600;700&amp;display=swap">` : ''}
<link rel="stylesheet" href="${L.up}css/fonts.css">
<link rel="stylesheet" href="${L.up}css/pages.css">
<link rel="stylesheet" href="${L.up}css/landing.css">
<link rel="stylesheet" href="${L.up}css/org-pages.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<script src="${L.up}js/org-page.js"></script>
</head>`;
}

function topbar(L, page) {
  const N = TEXT.nav, k = L.i;
  const other = LANGS.find((l) => l !== L);
  const toOther = (L.dir ? '../' : './') + pagePath(page, other);
  const link = (p, label) => `<a class="lp-top-link${p === page ? ' is-here' : ''}" href="./${p}.html"${p === page ? ' aria-current="page"' : ''}>${esc(label[k])}</a>`;
  return `<header class="lp-top">
  <nav class="lp-top-in" aria-label="IntMap">
    <a class="lp-brand" href="./about.html" aria-label="${esc(N.brandHome[k])}"><img src="${L.up}IntMap.Icon.png" alt="" width="28" height="28"><span>IntMap</span></a>
    <div class="og-nav">
${ORG_NAV.filter((r) => !(r[2] && r[2].bar === false)).map(([p, key]) => '      ' + link(p, N[key])).join('\n').trimStart()}
    </div>
    <a class="lp-lang" href="${toOther}" hreflang="${other.tag}" lang="${other.tag}" data-lp-lang="${other.tag}" aria-label="${esc(N.langLabel[k])}">${esc(N.lang[k])}</a>
    <a class="lp-btn lp-btn-sm" href="${L.up}index.html">${esc(N.open[k])}</a>
  </nav>
</header>`;
}

function footer(L) {
  const Fo = TEXT.footer, k = L.i;
  /* (curriculum-sales-kit) the organisation pages the top bar leaves out (ORG_NAV { bar: false }) are linked here */
  const offBar = ORG_NAV.filter((r) => r[2] && r[2].bar === false).map(([p, key]) => ({ href: './' + p + '.html', label: TEXT.nav[key][k] }));
  return `<footer class="lp-foot">
  <nav class="lp-foot-in">
${pageLinks(L, LANDING_TEXT[L.key], null).concat(offBar).map((e) => '    <a href="' + esc(e.href) + '">' + esc(e.label) + '</a>').join('\n')}
    <a href="${L.up}sources.html">${esc(Fo.sources[k])}</a>
    <a href="${L.up}science.html">${esc(Fo.science[k])}</a>
    <a href="${L.up}privacy.html">${esc(Fo.privacy[k])}</a>
    <a href="${L.up}terms.html">${esc(Fo.terms[k])}</a>
    <span class="lp-foot-mark">IntMap</span>
  </nav>
</footer>`;
}

/* pairs [h, p, h, p, …] → tiles */
function tiles(list, L, W) {
  const k = L.i, out = [];
  for (let i = 0; i < list.length; i += 2) out.push(`<div class="lp-tile"><h3>${esc(fill(list[i][k], W))}</h3><p>${esc(fill(list[i + 1][k], W))}</p></div>`);
  return out.join('\n      ');
}
function steps(list, L, W) {
  const k = L.i, out = [];
  for (let i = 0; i < list.length; i += 2) out.push(`<li><h3>${esc(fill(list[i][k], W))}</h3><p>${esc(fill(list[i + 1][k], W))}</p></li>`);
  return out.join('\n      ');
}
function faq(list, L, W) {
  const k = L.i, out = [];
  for (let i = 0; i < list.length; i += 2) out.push(`<details><summary>${esc(fill(list[i][k], W))}</summary><p>${esc(fill(list[i + 1][k], W))}</p></details>`);
  return out.join('\n      ');
}
function examples(page, L) {
  const C = TEXT.common, k = L.i;
  const shown = EXAMPLES[page].map((id) => SHOWCASE.find((s) => s.id === id)).filter((s) => s && CAPTURED[s.id] && CAPTURED[s.id].hash && CAPTURED[s.id].image);
  if (!shown.length) return '';
  return `<div class="lp-cards">
    ${shown.map((s) => {
      const href = L.up + 'index.html' + CAPTURED[s.id].hash;
      return `<article class="lp-card" data-showcase="${s.id}">
      <a class="lp-card-img" href="${esc(href)}" tabindex="-1" aria-hidden="true"><img src="${L.up}${CAPTURED[s.id].image}" alt="" width="1280" height="800" loading="lazy" decoding="async"></a>
      <div class="lp-card-body">
        <h3>${esc(s.title[k])}</h3>
        <p>${esc(s.blurb[k])}</p>
        <a class="lp-open" href="${esc(href)}" data-showcase-link="${s.id}">${esc(C.open[k])} →</a>
      </div>
    </article>`;
    }).join('\n    ')}
    </div>
    <p class="lp-note">${esc(C.exampleNote[k])}</p>`;
}
const contactHref = (page) => {
  const a = ASK[page];
  return './contact.html' + (a ? '?for=' + a.for + '&amp;about=' + a.about : '');
};
function commonTail(page, L) {
  const C = TEXT.common, k = L.i;
  return `<section class="lp-sec" id="price">
    <div class="lp-grid2">
      <div class="lp-tile"><h3>${esc(C.priceH[k])}</h3><p>${esc(C.price[k])}</p></div>
      <div class="lp-tile"><h3>${esc(C.licenceH[k])}</h3><p>${esc(C.licence[k])}</p><a class="lp-open" href="${L.up}sources.html">${esc(TEXT.footer.sources[k])} →</a></div>
    </div>
  </section>

  <section class="lp-sec" id="talk">
    <div class="lp-support">
      <h2>${esc(C.ctaH[k])}</h2>
      <p>${esc(C.cta[k])}</p>
      <a class="lp-btn" href="${contactHref(page)}">${esc(C.ctaBtn[k])}</a>
    </div>
  </section>`;
}

/* ── the three introduction pages ──────────────────────────────────────────────────────────── */
function introBody(F, L, page) {
  const T = TEXT[textKey(page)], k = L.i, W = words(F, L);
  const extra = page === 'for-newsrooms'
    ? `<section class="lp-sec" id="how">
    <h2>${esc(T.howH[k])}</h2>
    <ol class="lp-steps">
      ${steps(T.how, L, W)}
    </ol>
  </section>

  <section class="lp-sec" id="press">
    <div class="lp-tile"><h3>${esc(T.pressH[k])}</h3><p>${esc(T.press[k])}</p><a class="lp-open" href="./press.html">${esc(T.pressBtn[k])} →</a></div>
  </section>`
    : page === 'for-schools'
      ? `<section class="lp-sec" id="it">
    <h2>${esc(T.itH[k])}</h2>
    <div class="lp-grid2">
      ${tiles(T.it, L, W)}
    </div>
  </section>

  <section class="lp-sec" id="lessons">
    <h2>${esc(T.lessonsH[k])}</h2>
    <p class="lp-sub">${esc(T.lessons[k])}</p>
    <div class="lp-cta">
      <a class="lp-btn lp-btn-2" href="./teachers.html">${esc(T.lessonsLink[k])}</a>
      <a class="lp-btn lp-btn-2" href="./curriculum.html">${esc(T.unitsLink[k])}</a>
      <a class="lp-btn lp-btn-2" href="./school-handout.html">${esc(T.handoutLink[k])}</a>
    </div>
  </section>`
      : `<section class="lp-sec" id="your-data">
    <h2>${esc(T.dataH[k])}</h2>
    <p class="lp-sub">${esc(T.data[k])}</p>
  </section>`;
  return `<main class="lp-main">
  <section class="lp-hero lp-hero-t">
    <div class="lp-hero-text">
      <h1>${esc(T.h1[k])}</h1>
      <p class="lp-lede">${esc(fill(T.lede[k], W))}</p>
      <div class="lp-cta">
        <a class="lp-btn" href="${contactHref(page)}">${esc(TEXT.common.ctaBtn[k])}</a>
        <a class="lp-btn lp-btn-2" href="${L.up}index.html">${esc(TEXT.nav.open[k])}</a>
      </div>
    </div>
  </section>

  <section class="lp-sec" id="what">
    <h2>${esc(T.whatH[k])}</h2>
    <div class="lp-grid3">
      ${tiles(T.what, L, W)}
    </div>
  </section>

  ${extra}

  <section class="lp-sec" id="examples">
    <h2>${esc(T.examplesH[k])}</h2>
    ${examples(page, L)}
  </section>

  <section class="lp-sec" id="faq">
    <h2>${esc(T.faqH[k])}</h2>
    <div class="lp-faq">
      ${faq(T.faq, L, W)}
    </div>
  </section>

  ${commonTail(page, L)}
</main>`;
}

/* ── press (press-room) ───────────────────────────────────────────────────────────────────────── */
function fileInfo(rel) {
  const b = readFileSync(join(ROOT, rel));
  const png = b.length > 24 && b.toString('latin1', 1, 4) === 'PNG';
  const dim = png ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : jpegInfo(rel);
  if (!dim.width) throw new Error('org-pages: cannot read the size of ' + rel);
  return { w: dim.width, h: dim.height, kb: Math.max(1, Math.round(b.length / 1024)), type: png ? 'PNG' : 'JPEG' };
}
function pressBody(F, L) {
  const T = TEXT.press, C = TEXT.common, k = L.i;
  const BF = brandFacts(), B = brandWords(L.key, BF), S = factWords(BF, L.key);
  const copyBlock = (id, label, text) => `<div class="lp-tile og-copy-tile">
        <h3>${esc(label[k])}</h3>
        <p id="og-copy-${id}" class="og-copy-text">${esc(text)}</p>
        <button class="lp-btn lp-btn-2 lp-btn-sm og-copy" type="button" hidden data-copy="og-copy-${id}" data-label="${esc(T.copy[k])}" data-msg-copied="${esc(T.copied[k])}" data-msg-failed="${esc(T.copyFailed[k])}">${esc(T.copy[k])}</button>
      </div>`;
  const stat = (label, value) => `<div class="lp-tile"><h3>${esc(value)}</h3><p>${esc(label[k])}</p></div>`;
  const asset = (rel, label) => {
    const i = fileInfo(rel);
    return `<li><a class="lp-open" href="${L.up}${rel}" download>${esc(label)} →</a> <span class="og-muted">${i.type} · ${i.w}×${i.h} · ${i.kb.toLocaleString(L.num)} kB</span></li>`;
  };
  const shots = Object.keys(CAPTURED).map((id) => SHOWCASE.find((s) => s.id === id)).filter((s) => s && CAPTURED[s.id].image);
  return `<main class="lp-main">
  <section class="lp-hero lp-hero-t">
    <div class="lp-hero-text">
      <h1>${esc(T.h1[k])}</h1>
      <p class="lp-lede">${esc(T.lede[k])}</p>
      <div class="lp-cta">
        <a class="lp-btn" href="#descriptions">${esc(T.descH[k])}</a>
        <a class="lp-btn lp-btn-2" href="${L.up}index.html">${esc(TEXT.nav.open[k])}</a>
      </div>
    </div>
  </section>

  <section class="lp-sec" id="descriptions">
    <h2>${esc(T.descH[k])}</h2>
    <p class="lp-sub">${esc(T.quote[k])}</p>
    <div class="lp-grid2">
      ${copyBlock('category', T.categoryL, B.category)}
      ${copyBlock('tagline', T.oneH, B.tagline)}
      ${copyBlock('trust', T.trustL, B.trust)}
      ${copyBlock('short', T.shortL, B.pitch.short)}
      ${copyBlock('medium', T.mediumL, B.pitch.medium)}
      ${copyBlock('long', T.longL, B.pitch.long)}
    </div>
  </section>

  <section class="lp-sec" id="who">
    <h2>${esc(T.whoH[k])}</h2>
    <div class="lp-grid2">
      <div class="lp-tile"><h3>${esc(T.whoFor[k])}</h3><p>${esc(B.positioning.for)}</p></div>
      <div class="lp-tile"><h3>${esc(T.whoIs[k])}</h3><p>${esc(B.positioning.is)}</p></div>
      <div class="lp-tile"><h3>${esc(T.whoThat[k])}</h3><p>${esc(B.positioning.that)}</p></div>
      <div class="lp-tile"><h3>${esc(T.whoUnlike[k])}</h3><p>${esc(B.positioning.unlike)}</p></div>
    </div>
  </section>

  <section class="lp-sec" id="facts">
    <h2>${esc(T.factsH[k])}</h2>
    <p class="lp-sub">${esc(T.factsNote[k])}</p>
    <div class="lp-grid3 og-stat-grid">
      ${stat(T.statClock, S.floorBC)}
      ${stat(T.statSnapshots, S.snapshots)}
      ${stat(T.statLayers, S.layers)}
      ${stat(T.statLangs, S.langs)}
    </div>
    <h3 class="og-sub">${esc(T.proofH[k])}</h3>
    <ul class="og-list">
      ${B.proof.map((p) => '<li>' + esc(p) + '</li>').join('\n      ')}
    </ul>
    <a class="lp-open" href="${L.up}sources.html">${esc(T.sourcesLink[k])} →</a>
  </section>

  <section class="lp-sec" id="logo">
    <h2>${esc(T.assetsH[k])}</h2>
    <p class="lp-sub">${esc(T.assetsNote[k])}</p>
    <ul class="og-files">
      ${MARKS.map(([rel, key]) => asset(rel, T[key][k])).join('\n      ')}
    </ul>
  </section>

  <section class="lp-sec" id="screenshots">
    <h2>${esc(T.shotsH[k])}</h2>
    <p class="lp-sub">${esc(T.shotsNote[k])}</p>
    <div class="lp-cards">
      ${shots.map((s) => {
        const c = CAPTURED[s.id], i = fileInfo(c.image), href = L.up + 'index.html' + c.hash;
        return `<article class="lp-card" data-press-shot="${s.id}">
      <a class="lp-card-img" href="${L.up}${c.image}" download tabindex="-1" aria-hidden="true"><img src="${L.up}${c.thumb || c.image}" alt="" width="1280" height="800" loading="lazy" decoding="async"></a>
      <div class="lp-card-body">
        <h3>${esc(s.title[k])}</h3>
        <p>${esc(s.blurb[k])}</p>
        <a class="lp-open" href="${L.up}${c.image}" download>${esc(T.download[k])} (${i.w}×${i.h}, ${i.kb.toLocaleString(L.num)} kB) →</a>
        <a class="lp-open" href="${esc(href)}" data-showcase-link="${s.id}">${esc(C.open[k])} →</a>
      </div>
    </article>`;
      }).join('\n      ')}
    </div>
  </section>

  <section class="lp-sec" id="follow">
    <h2>${esc(T.followH[k])}</h2>
    <ul class="og-files">
      <li><a class="lp-open" href="${L.up}${updatesFeed(L)}">${esc(T.feed[k])} →</a></li>
      <li><a class="lp-open" href="${L.up}${updatesPath(L)}">${esc(T.feedPage[k])} →</a></li>
      <li><a class="lp-open" href="${L.up}${L.dir}${OTD_HUB}">${esc(T.otd[k])} →</a></li>
      <li><a class="lp-open" href="${L.up}${L.dir}${HISTORY_HUB}">${esc(T.history[k])} →</a></li>
    </ul>
  </section>

  <section class="lp-sec" id="more">
    <div class="lp-grid2">
      <div class="lp-tile"><h3>${esc(T.newsroomsH[k])}</h3><p>${esc(T.newsrooms[k])}</p><a class="lp-open" href="./for-newsrooms.html">${esc(T.newsroomsBtn[k])} →</a></div>
      <div class="lp-tile"><h3>${esc(T.askH[k])}</h3><p>${esc(T.ask[k])}</p><a class="lp-open" href="./contact.html">${esc(T.askBtn[k])} →</a></div>
    </div>
  </section>
</main>`;
}

/* ── contact ──────────────────────────────────────────────────────────────────────────────── */
function contactBody(F, L) {
  const T = TEXT.contact, k = L.i, W = words(F, L);
  const opts = (vocab, labels) => vocab.map((v) => {
    if (!labels[v]) throw new Error('org-pages: no label for the enquiry word «' + v + '» (scripts/org-pages-text.mjs)');
    return `<option value="${v}">${esc(labels[v][k])}</option>`;
  }).join('');
  for (const v of Object.keys(T.audiences)) if (!INQUIRY.audiences.includes(v)) throw new Error('org-pages: label for an audience the function refuses: ' + v);
  for (const v of Object.keys(T.purposes)) if (!INQUIRY.purposes.includes(v)) throw new Error('org-pages: label for a purpose the function refuses: ' + v);
  const M = INQUIRY_LIMITS;
  const field = (id, name, label, input) => `<div class="og-field"><label for="${id}">${esc(label[k])}</label>${input}</div>`;
  return `<main class="lp-main">
  <section class="lp-hero lp-hero-t">
    <div class="lp-hero-text">
      <h1>${esc(T.h1[k])}</h1>
      <p class="lp-lede">${esc(T.lede[k])}</p>
    </div>
  </section>

  <section class="lp-sec og-contact">
    <form class="og-form" id="og-form" novalidate data-effect="outward" data-lang="${L.key}"
      data-msg-sending="${esc(T.sending[k])}" data-msg-sent="${esc(T.sent[k])}" data-msg-failed="${esc(T.failed[k])}"
      data-msg-limited="${esc(T.limited[k])}" data-msg-invalid="${esc(T.invalid[k])}">
      <div class="og-row">
        ${field('og-audience', 'audience', T.audienceL, `<select id="og-audience" name="audience" required>${opts(INQUIRY.audiences, T.audiences)}</select>`)}
        ${field('og-purpose', 'purpose', T.purposeL, `<select id="og-purpose" name="purpose" required>${opts(INQUIRY.purposes, T.purposes)}</select>`)}
      </div>
      <div class="og-row">
        ${field('og-name', 'name', T.nameL, `<input id="og-name" name="name" required maxlength="${M.name}" autocomplete="name">`)}
        ${field('og-email', 'email', T.emailL, `<input id="og-email" name="email" type="email" required maxlength="${M.email}" autocomplete="email">`)}
      </div>
      <div class="og-row">
        ${field('og-org', 'organization', T.orgL, `<input id="og-org" name="organization" maxlength="${M.organization}" autocomplete="organization">`)}
        ${field('og-role', 'role', T.roleL, `<input id="og-role" name="role" maxlength="${M.role}" autocomplete="organization-title">`)}
      </div>
      <div class="og-row">
        ${field('og-website', 'website', T.websiteL, `<input id="og-website" name="website" type="url" maxlength="${M.website}" placeholder="https://" autocomplete="url">`)}
        ${field('og-country', 'country', T.countryL, `<input id="og-country" name="country" maxlength="${M.country}" autocomplete="country-name">`)}
      </div>
      <div class="og-field">
        <label for="og-message">${esc(T.messageL[k])}</label>
        <textarea id="og-message" name="message" required maxlength="${M.message}" rows="7" aria-describedby="og-hint og-hint-sup og-hint-sec"></textarea>
        <p class="og-hint" id="og-hint">${esc(T.messageHint[k])}</p>
        <p class="og-hint" id="og-hint-sup" data-hint-for="supporter_listing" hidden>${esc(T.supporterHint[k])}</p>
        <p class="og-hint" id="og-hint-sec" data-hint-for="security" hidden>${esc(T.securityHint[k])}</p>
      </div>
      <div class="og-trap" aria-hidden="true">
        <label for="og-wc">${esc(T.trapL[k])}</label>
        <input id="og-wc" name="${INQUIRY.honeypot}" tabindex="-1" autocomplete="off">
      </div>
      <label class="og-consent"><input type="checkbox" id="og-consent" name="consent" required> <span>${esc(T.consent[k])} <a href="${L.up}privacy.html">${esc(TEXT.footer.privacy[k])}</a></span></label>
      <div class="og-actions">
        <button class="lp-btn og-send" type="submit">${esc(T.send[k])}</button>
        <p class="og-status" id="og-status" role="status" aria-live="polite"></p>
      </div>
    </form>
  </section>

  <section class="lp-sec" id="storage">
    <h2>${esc(T.storeH[k])}</h2>
    <ul class="og-list">
      ${T.store.map((s) => `<li>${esc(fill(s[k], W))}</li>`).join('\n      ')}
    </ul>
  </section>
</main>`;
}

/* ── security (security-next) ─────────────────────────────────────────────────────────────────
   Every fact on the page is read from its owner here, and the generator stops if one cannot be read:
     · what the page sends, and to how many sites — scripts/outbound-hosts.json, the ledger check:datagov holds
       against the code and against Privacy §4 (only rows the browser requests: `disclosure`);
     · whether third-party analytics loads — index.html's own switch (window.INTMAP_ANALYTICS);
     · what the security policy allows — index.html's own Content-Security-Policy script-src;
     · the leaked-secret check — the ledger row that sends a `credential-prefix`;
     · (security-hardening) whether the libraries the browser is shipped are checked against published advisories —
       a workflow job in .github/workflows/ that runs `npm audit --omit=dev` on a schedule and on pull requests.
   The words for each «what is sent» are js/connections-panel.js SENDS_WORDS — the same sentences the in-map list
   uses, so the page and the list cannot describe one code two ways. */
export function securityFacts() {
  const ledger = readLedger();
  const stated = ledger.hosts.filter((r) => r.disclosure != null);
  if (!stated.length) throw new Error('org-pages: the host ledger states no requested host');
  const groups = Object.keys(SENDS_WORDS).map((code) => ({ code, hosts: stated.filter((r) => r.sends && r.sends.code === code).map((r) => r.host) })).filter((g) => g.hosts.length);
  const unworded = stated.filter((r) => !SENDS_WORDS[r.sends && r.sends.code]).map((r) => r.host);
  if (unworded.length) throw new Error('org-pages: no words for what these hosts are sent: ' + unworded.join(', '));
  const index = rd('index.html');
  const sw = need(/window\.INTMAP_ANALYTICS\s*=\s*(true|false)\s*;/, index, 'index.html window.INTMAP_ANALYTICS')[1];
  const csp = need(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/, index, 'index.html Content-Security-Policy')[1];
  const scriptSrc = need(/(?:^|;\s*)script-src ([^;]+)/, csp, 'index.html script-src')[1];
  return {
    stated: stated.length, groups,
    analytics: sw === 'true',
    inline: /'unsafe-inline'/.test(scriptSrc),
    unsafeEval: /'unsafe-eval'/.test(scriptSrc),
    leakCheckByPrefix: stated.some((r) => r.sends && r.sends.code === 'credential-prefix'),
    advisoryWatch: advisoryWatch(),
  };
}
/* (security-hardening) a job that audits the shipped (non-dev) dependencies from the lock, weekly and on every PR */
function advisoryWatch() {
  const dir = '.github/workflows';
  for (const f of readdirSync(join(ROOT, dir)).filter((n) => /\.ya?ml$/.test(n))) {
    const wf = yamlLoad(rd(dir + '/' + f)) || {};
    const on = wf.on || wf[true] || {};
    if (!on.schedule || !('pull_request' in on)) continue;
    for (const job of Object.values(wf.jobs || {})) {
      if ((job.steps || []).some((st) => /\bnpm audit\b/.test(st.run || '') && /--omit=dev/.test(st.run))) return true;
    }
  }
  return false;
}
function securityBody(F, L) {
  const T = TEXT.security, k = L.i, S = F.security;
  const n = (v) => v.toLocaleString(L.num);
  const W = { ...words(F, L), stated: n(S.stated) };
  const pair = (p) => `<div class="lp-tile"><h3>${esc(p[0][k])}</h3><p>${esc(fill(p[1][k], W))}</p></div>`;
  const sendTiles = S.groups.map((g) => `<div class="lp-tile" data-sends="${g.code}"><h3>${esc(SENDS_WORDS[g.code][k])}</h3><p><b>${esc(fill(T.sitesN[k], { n: n(g.hosts.length) }))}</b> — ${esc(g.hosts.join(', '))}</p></div>`);
  const guards = [S.analytics ? T.analyticsOn : T.analyticsOff, S.inline ? T.withInline : T.noInline];
  if (S.unsafeEval) guards.push(T.evalNote);
  if (S.leakCheckByPrefix) guards.push(T.leakCheck);
  if (S.advisoryWatch) guards.push(T.advisoryWatch);
  guards.push(T.yourData);
  const li = (list) => list.map((p) => `<li>${esc(p[k])}</li>`).join('\n        ');
  return `<main class="lp-main">
  <section class="lp-hero lp-hero-t">
    <div class="lp-hero-text">
      <h1>${esc(T.h1[k])}</h1>
      <p class="lp-lede">${esc(fill(T.lede[k], W))}</p>
      <div class="lp-cta">
        <a class="lp-btn" href="${L.up}index.html">${esc(TEXT.nav.open[k])}</a>
        <a class="lp-btn lp-btn-2" href="#report">${esc(T.reportBtn[k])}</a>
      </div>
    </div>
  </section>

  <section class="lp-sec" id="sends">
    <h2>${esc(T.sendsH[k])}</h2>
    <p class="lp-sub">${esc(T.sendsNote[k])} <a href="${L.up}privacy.html">${esc(TEXT.footer.privacy[k])} →</a></p>
    <div class="lp-grid3">
      ${sendTiles.join('\n      ')}
    </div>
  </section>

  <section class="lp-sec" id="see">
    <h2>${esc(T.seeH[k])}</h2>
    <ol class="lp-steps">
      ${steps(T.see, L, W)}
    </ol>
  </section>

  <section class="lp-sec" id="guards">
    <h2>${esc(T.guardsH[k])}</h2>
    <div class="lp-grid2">
      ${guards.map(pair).join('\n      ')}
    </div>
  </section>

  <section class="lp-sec" id="report">
    <div class="lp-support">
      <h2>${esc(T.reportH[k])}</h2>
      <p>${esc(T.report[k])}</p>
      <a class="lp-btn" href="${contactHref('security')}">${esc(T.reportBtn[k])}</a>
    </div>
    <div class="lp-grid2">
      <div class="lp-tile"><h3>${esc(T.inScopeH[k])}</h3><ul class="og-list">
        ${li(T.inScope)}
      </ul></div>
      <div class="lp-tile"><h3>${esc(T.notH[k])}</h3><ul class="og-list">
        ${li(T.not)}
      </ul></div>
    </div>
  </section>

  <section class="lp-sec" id="faq">
    <h2>${esc(T.faqH[k])}</h2>
    <div class="lp-faq">
      ${faq(T.faq, L, W)}
    </div>
  </section>
</main>`;
}

/* ── support ──────────────────────────────────────────────────────────────────────────────── */
function supportBody(F, L) {
  const T = TEXT.support, k = L.i, W = words(F, L);
  /* the JPY page for the Japanese page, the USD page for the English one — the same split as
     js/app-body.js stripeDonateURL(); both are offered on both pages, the page's own first */
  const jpy = `<a class="lp-btn${L.key === 'jp' ? '' : ' lp-btn-2'}" href="${esc(F.stripe.jp)}" rel="noopener">${esc(T.giveJpy[k])}</a>`;
  const usd = `<a class="lp-btn${L.key === 'jp' ? ' lp-btn-2' : ''}" href="${esc(F.stripe.en)}" rel="noopener">${esc(T.giveUsd[k])}</a>`;
  return `<main class="lp-main">
  <section class="lp-hero lp-hero-t">
    <div class="lp-hero-text">
      <h1>${esc(T.h1[k])}</h1>
      <p class="lp-lede">${esc(T.lede[k])}</p>
      <div class="lp-cta">${L.key === 'jp' ? jpy + usd : usd + jpy}</div>
    </div>
  </section>

  <section class="lp-sec" id="costs">
    <h2>${esc(T.costsH[k])}</h2>
    <p class="lp-sub">${esc(T.costsNote[k])}</p>
    <div class="lp-grid2">
      ${tiles(T.costs, L, W)}
    </div>
    <div class="lp-tile og-stats">
      <h3>${esc(T.statsH[k])}</h3>
      <p id="og-stats" data-lang="${L.key}" data-msg-loading="${esc(T.statsLoading[k])}" data-msg-failed="${esc(T.statsFail[k])}"
        data-msg-line="${esc(T.statsLine[k])}" data-msg-none="${esc(T.statsNone[k])}">${esc(T.statsLoading[k])}</p>
    </div>
  </section>

  <section class="lp-sec" id="give">
    <div class="lp-support">
      <h2>${esc(T.giveH[k])}</h2>
      <p>${esc(T.give[k])}</p>
      <div class="lp-cta">${L.key === 'jp' ? jpy + usd : usd + jpy}</div>
    </div>
  </section>

  <section class="lp-sec" id="thanks">
    <h2>${esc(T.thanksH[k])}</h2>
    <p class="lp-sub">${esc(T.thanksNote[k])}</p>
    <ul class="og-supporters" id="og-supporters" data-lang="${L.key}" data-msg-empty="${esc(T.thanksEmpty[k])}" data-msg-failed="${esc(T.thanksFail[k])}">
      <li class="og-muted">${esc(T.thanksLoading[k])}</li>
    </ul>
  </section>

  <section class="lp-sec" id="ask">
    <div class="lp-tile">
      <h3>${esc(T.askH[k])}</h3>
      <p>${esc(T.ask[k])}</p>
      <a class="lp-btn lp-btn-2" href="${contactHref('support')}">${esc(T.askBtn[k])}</a>
    </div>
  </section>
</main>`;
}

/* ── the unit map (curriculum-sales-kit) ──────────────────────────────────────────────────────────
   The model is scripts/curriculum-kit.mjs: units quoted from data/curriculum-units.json, every link written by the app's own
   codecs. This only lays it out. A row's main line is in the page's language — the quoted wording where the document is in
   it, IntMap's gloss where it is not — and the other is shown beside it, marked with its own `lang`. */
const COLON = (L) => (L.key === 'jp' ? '：' : ': ');
const PAREN = (L) => (L.key === 'jp' ? ['（', '）'] : [' (', ')']);
const LISTSEP = (L) => (L.key === 'jp' ? '・' : ', ');
const KIT_LANG = (L) => (L.key === 'jp' ? 'ja' : 'en');
function unitRow(F, L, f, u) {
  const T = TEXT.curriculum, k = L.i, n = (v) => v.toLocaleString(L.num);
  const own = f.quoted === L.key;
  const main = own ? u.label : u.gloss, other = own ? u.gloss : u.label;
  const otherLang = own ? (L.key === 'jp' ? 'en' : 'ja') : (f.quoted === 'jp' ? 'ja' : 'en');
  const app = (q) => esc(L.up + 'index.html' + q);
  const items = [];
  for (const m of u.maps) items.push(`<li><a href="${app(m.hash)}" data-unit-map="${m.kind === 'example' ? m.id : 'state'}">${esc(m.title[k])}</a> <span class="og-muted">${esc((m.kind === 'example' ? T.example : T.map)[k])}</span></li>`);
  for (const t of u.tours) items.push(`<li><a href="${app(t.query)}" data-unit-tour="${t.id}">${esc(T.tour[k])}${COLON(L)}${esc(t.title[k])}</a> <span class="og-muted">${esc(fill(T.steps[k], { n: n(t.steps) }))}</span></li>`);
  if (u.quest) items.push(`<li><a href="${app(u.quest.query)}" data-unit-quest="${u.quest.kind}">${esc(T.quest[k])}${COLON(L)}${esc(fill(T.questN[k], { kind: kindTitle(u.quest.kind, L.key), n: n(u.quest.n) }))}</a></li>`);
  const make = u.make[L.key]
    ? `<a class="lp-btn lp-btn-2 lp-btn-sm cu-make" href="${app(u.make[L.key].query)}" data-unit-make="${u.key}">${esc(T.make[k])}</a><span class="og-muted cu-make-n">${esc(fill(T.makeFrom[k], { n: n(u.make[L.key].steps) }))}</span>`
    : '';
  const open = u.covered
    ? `<ul class="cu-links">${items.join('')}</ul>`
    : `<span class="cu-none">${esc(T.notCovered[k])}</span>`;
  return `        <tr id="u-${u.key}" data-unit="${u.key}"${u.covered ? '' : ' data-uncovered=""'}><td><span class="cu-unit"${own ? ` lang="${KIT_LANG({ key: f.quoted })}"` : ''}>${u.codes ? esc(u.codes) + ' ' : ''}${esc(main)}</span><span class="cu-other" lang="${otherLang}">${esc(other)}</span>${u.basis ? `<span class="cu-basis">${esc(T.basis[k])} <q lang="${f.quoted === 'jp' ? 'ja' : 'en'}">${esc(u.basis)}</q></span>` : ''}</td><td>${open}</td><td>${make}</td></tr>`;
}
function curriculumBody(F, L) {
  const T = TEXT.curriculum, k = L.i, M = CURRICULUM_KIT;
  if (M.problems.length) throw new Error('org-pages: data/curriculum-units.json disagrees with the registries:\n  ' + M.problems.join('\n  '));
  const n = (v) => v.toLocaleString(L.num);
  const W = { units: n(M.counts.units), covered: n(M.counts.covered), open: n(M.counts.open) };
  const sourceLine = (s) => {
    const up = s.upstream;
    return `<p class="lp-note cu-source">${esc(T.source[k])} ${esc(up.publisher)}, <a href="${esc(up.url)}" target="_blank" rel="noopener">${esc(up.title)} ↗</a>${PAREN(L)[0]}${esc(fill(T.read[k], { date: up.retrievedAt }))}${up.via ? LISTSEP(L) + `<a href="${esc(up.via)}" target="_blank" rel="noopener">${esc(T.via[k])}</a>` : ''}${PAREN(L)[1]} · ${esc(up.licence)}</p>`;
  };
  const subject = (f, s) => {
    const rows = [];
    for (const g of s.groups) {
      const units = s.units.filter((u) => u.group === g.key);
      if (!units.length) continue;
      const own = f.quoted === L.key;
      rows.push(`        <tr class="cu-group" id="g-${g.key}"><th colspan="3"><span${own ? ` lang="${KIT_LANG({ key: f.quoted })}"` : ''}>${esc(own ? g.label : g.gloss)}</span> <span class="cu-other" lang="${own ? (L.key === 'jp' ? 'en' : 'ja') : (f.quoted === 'jp' ? 'ja' : 'en')}">${esc(own ? g.gloss : g.label)}</span></th></tr>`);
      for (const u of units) rows.push(unitRow(F, L, f, u));
    }
    return `<h3 class="og-sub" id="s-${s.id}">${esc(s.name[k])}</h3>
    <div class="lp-tablewrap cu-table">
      <table>
        <tr><th>${esc(T.colUnit[k])}</th><th>${esc(T.colOpen[k])}</th><th>${esc(T.colMake[k])}</th></tr>
${rows.join('\n')}
      </table>
    </div>
    ${sourceLine(s)}`;
  };
  const fw = M.frameworks.map((f) => `<section class="lp-sec" id="fw-${f.id}">
    <h2>${esc(f.title[k])}</h2>
    <p class="lp-sub">${esc(f.note[k])}</p>
    ${f.subjects.map((s) => subject(f, s)).join('\n    ')}
  </section>`).join('\n\n  ');
  return `<main class="lp-main">
  <section class="lp-hero lp-hero-t">
    <div class="lp-hero-text">
      <h1>${esc(T.h1[k])}</h1>
      <p class="lp-lede">${esc(fill(T.lede[k], W))}</p>
      <div class="lp-cta">
        <a class="lp-btn" href="#fw-${M.frameworks[0].id}">${esc(T.ctaFind[k])}</a>
        <a class="lp-btn lp-btn-2" href="./school-handout.html">${esc(T.ctaHandout[k])}</a>
      </div>
    </div>
  </section>

  <section class="lp-sec" id="how">
    <h2>${esc(T.howH[k])}</h2>
    <div class="lp-grid3">
      ${tiles(T.how, L, W)}
    </div>
    <p class="lp-note">${esc(T.suggestion[k])}</p>
    <nav class="cu-jump" aria-label="${esc(T.jump[k])}">${M.frameworks.map((f) => `<a class="lp-open" href="#fw-${f.id}">${esc(f.title[k])} →</a>`).join(' ')}</nav>
  </section>

  ${fw}

  <section class="lp-sec" id="not-covered">
    <div class="lp-support">
      <h2>${esc(T.openH[k])}</h2>
      <p>${esc(fill(T.open[k], W))}</p>
      <a class="lp-btn" href="${contactHref('curriculum')}">${esc(TEXT.common.ctaBtn[k])}</a>
    </div>
  </section>
</main>`;
}

/* ── the one-page handout (curriculum-sales-kit) — school-handout.html ─────────────────────────────
   For a school's leadership and IT staff, on ONE A4 sheet (css/org-pages.css `@page handout`; the print test holds it to one
   page). Its facts are other pages' strings, chosen the way those pages choose them — the price (TEXT.common), no student
   accounts and the devices (TEXT.schools), the analytics sentence the security page picks from index.html's own switch
   (securityFacts) — and the numbers come from their owners. The addresses are printed as text: on paper a link is what it says. */
function handoutBody(F, L) {
  const T = TEXT['school-handout'], C = TEXT.common, S = TEXT.schools, SEC = TEXT.security, k = L.i;
  const n = (v) => v.toLocaleString(L.num);
  const W = { ...words(F, L), stated: n(F.security.stated) };
  const tile = (h, p) => `<div class="lp-tile"><h3>${esc(fill(h[k], W))}</h3><p>${esc(fill(p[k], W))}</p></div>`;
  const analytics = F.security.analytics ? SEC.analyticsOn : SEC.analyticsOff;
  const abs = (rel) => F.site + L.dir + rel;
  const contact = abs('contact.html?for=' + ASK['school-handout'].for + '&about=' + ASK['school-handout'].about);
  return `<main class="lp-main og-handout-sheet">
  <section class="lp-hero lp-hero-t og-handout-head">
    <div class="lp-hero-text">
      <p class="og-handout-brand"><img src="${L.up}IntMap.Icon.png" alt="" width="28" height="28"> IntMap</p>
      <h1>${esc(T.h1[k])}</h1>
      <p class="lp-lede">${esc(fill(T.lede[k], W))}</p>
      <div class="lp-cta og-noprint">
        <button class="lp-btn og-print" type="button" data-print hidden>${esc(T.print[k])}</button>
        <a class="lp-btn lp-btn-2" href="./curriculum.html">${esc(T.unitMap[k])}</a>
      </div>
      <p class="lp-note og-noprint">${esc(T.printNote[k])}</p>
    </div>
  </section>

  <section class="lp-sec og-handout-facts">
    <div class="lp-grid2">
      ${tile(C.priceH, C.price)}
      ${tile(S.what[0], S.what[1])}
      ${tile(S.what[2], S.what[3])}
      ${tile(S.it[2], S.it[3])}
      ${tile(S.it[4], S.it[5])}
      <div class="lp-tile"><h3>${esc(T.privacyH[k])}</h3><p>${esc(analytics[1][k])}</p><p>${esc(fill(T.hostsLine[k], W))}</p></div>
    </div>
  </section>

  <section class="lp-sec og-handout-steps">
    <h2>${esc(T.stepsH[k])}</h2>
    <ol class="lp-steps">
      ${steps(T.steps, L, W)}
    </ol>
  </section>

  <section class="lp-sec og-handout-links">
    <h2>${esc(T.linksH[k])}</h2>
    <dl class="og-handout-dl">
      <dt>${esc(T.unitMap[k])}</dt><dd><a href="./curriculum.html">${esc(abs('curriculum.html'))}</a></dd>
      <dt>${esc(T.itPage[k])}</dt><dd><a href="./for-schools.html#it">${esc(abs('for-schools.html'))}</a></dd>
      <dt>${esc(TEXT.footer.privacy[k])}</dt><dd><a href="${L.up}privacy.html">${esc(F.site + 'privacy.html')}</a></dd>
      <dt>${esc(T.askH[k])}</dt><dd>${esc(T.ask[k])} <a href="${contactHref('school-handout')}">${esc(contact)}</a></dd>
    </dl>
  </section>
</main>`;
}

/* ── corrections (community-next) ─────────────────────────────────────────────────────────────
   The words a live value needs (kinds, statuses, the year's spelling) travel as data-* JSON on the element that shows
   it, so js/org-page.js holds no words; the vocabulary is _shared/correction-shape.js and every word must have a label. */
function correctionsBody(F, L) {
  const T = TEXT.corrections, k = L.i, W = words(F, L);
  for (const v of CORRECTION.kinds) if (!T.kinds[v]) throw new Error('org-pages: no label for the correction kind «' + v + '»');
  for (const v of CORRECTION.statuses.filter((x) => x !== 'spam').concat('closed')) if (!T.statuses[v]) throw new Error('org-pages: no label for the correction status «' + v + '»');
  const labels = (o) => esc(JSON.stringify(Object.fromEntries(Object.entries(o).map(([key, v]) => [key, v[k]]))));
  const common = `data-lang="${L.key}" data-kinds="${labels(T.kinds)}" data-statuses="${labels(T.statuses)}" data-year-bc="${esc(T.yearBC[k])}" data-year-ad="${esc(T.yearAD[k])}"`;
  return `<main class="lp-main">
  <section class="lp-hero lp-hero-t">
    <div class="lp-hero-text">
      <h1>${esc(T.h1[k])}</h1>
      <p class="lp-lede">${esc(fill(T.lede[k], W))}</p>
      <div class="lp-cta">
        <a class="lp-btn" href="${L.up}index.html">${esc(TEXT.nav.open[k])}</a>
        <a class="lp-btn lp-btn-2" href="#log">${esc(T.logH[k])}</a>
      </div>
    </div>
  </section>

  <section class="lp-sec" id="how">
    <h2>${esc(T.howH[k])}</h2>
    <ol class="lp-steps">
      ${steps(T.how, L, W)}
    </ol>
  </section>

  <section class="lp-sec" id="check">
    <h2>${esc(T.checkH[k])}</h2>
    <div class="lp-grid3">
      ${tiles(T.check, L, W)}
    </div>
  </section>

  <section class="lp-sec" id="record">
    <div class="lp-tile og-stats">
      <h3>${esc(T.statsH[k])}</h3>
      <p id="og-corr-stats" ${common} data-msg-loading="${esc(T.statsLoading[k])}" data-msg-failed="${esc(T.statsFail[k])}"
        data-msg-none="${esc(T.statsNone[k])}" data-msg-line="${esc(T.statsLine[k])}" data-msg-median="${esc(T.statsMedian[k])}">${esc(T.statsLoading[k])}</p>
    </div>
  </section>

  <section class="lp-sec" id="mine">
    <h2>${esc(T.mineH[k])}</h2>
    <p class="lp-sub">${esc(T.mineNote[k])}</p>
    <ul class="og-corr" id="og-corr-mine" ${common} data-msg-none="${esc(T.mineNone[k])}" data-msg-failed="${esc(T.mineFail[k])}" data-msg-gone="${esc(T.mineGone[k])}"
      data-msg-open="${esc(T.logOpen[k])}" data-msg-change="${esc(T.logChange[k])}">
      <li class="og-muted">${esc(T.logLoading[k])}</li>
    </ul>
  </section>

  <section class="lp-sec" id="log">
    <h2>${esc(T.logH[k])}</h2>
    <p class="lp-sub">${esc(T.logNote[k])}</p>
    <ul class="og-corr" id="og-corr-log" ${common} data-msg-empty="${esc(T.logEmpty[k])}" data-msg-failed="${esc(T.logFail[k])}"
      data-msg-open="${esc(T.logOpen[k])}" data-msg-change="${esc(T.logChange[k])}">
      <li class="og-muted">${esc(T.logLoading[k])}</li>
    </ul>
  </section>

  <section class="lp-sec" id="talk">
    <div class="lp-support">
      <h2>${esc(T.ctaH[k])}</h2>
      <p>${esc(T.cta[k])}</p>
      <a class="lp-btn" href="${L.up}index.html">${esc(TEXT.nav.open[k])}</a>
    </div>
  </section>
</main>`;
}

export function renderPage(F, page, L) {
  const body = page === 'contact' ? contactBody(F, L) : page === 'support' ? supportBody(F, L) : page === 'security' ? securityBody(F, L) : page === 'corrections' ? correctionsBody(F, L) : page === 'press' ? pressBody(F, L) : page === 'curriculum' ? curriculumBody(F, L) : page === 'school-handout' ? handoutBody(F, L) : introBody(F, L, page);
  return withInlineHashes(`${head(F, L, page)}
<body class="lp og-page" data-org-page="${page}">
${topbar(L, page)}
${body}
${footer(L)}
</body>
</html>
`);
}

/* ── the enquiries console (admin-inquiries.html) ─────────────────────────────────────────────
   English only, like admin.html. Generated here for ONE reason: it needs the backend address and the
   publishable key, and this file already reads them from their owner (src/vendor.js) — a hand-written
   page would be a third place that spells them. The behaviour is js/admin-inquiries.js; the look is
   css/admin-inquiries.css. noindex: it is an operator's page, linked from nowhere public.
   (sales-next) The triage words and the pipeline's stages are written into <main> as data-* from their one declaration
   (inquiry-shape.js INQUIRY_PIPELINE): js/admin-inquiries.js is a plain script that cannot import it, and a list it
   spelled itself would be the third copy of the table's CHECK. */
export const ADMIN_PAGE = 'admin-inquiries.html';
export function renderAdmin(F) {
  return withInlineHashes(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
${'<meta http-equiv="Content-Security-Policy" content="' + ["default-src 'self'", "base-uri 'self'", "object-src 'none'", "form-action 'self'", "frame-src 'none'",
    "connect-src 'self' " + F.backend, "img-src 'self' data:", "style-src 'self'", "font-src 'self' data:", "script-src 'self'"].join('; ') + '">'}
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="strict-origin-when-cross-origin">
<!-- GENERATED by scripts/org-pages.mjs — the behaviour is js/admin-inquiries.js, the look css/admin-inquiries.css. -->
<title>IntMap · Enquiries</title>
<meta name="intmap-backend" content="${esc(F.backend)}">
<meta name="intmap-anon-key" content="${esc(F.anonKey)}">
<link rel="icon" href="./IntMap.Icon.png">
<link rel="stylesheet" href="./css/admin-inquiries.css">
<script src="vendor/supabase-js.js"></script>
<script src="./js/safe-html.js"></script>
<script src="./js/admin-inquiries.js"></script>
</head>
<body>
<header>
  <h1>IntMap · Enquiries</h1>
  <div class="row"><a href="./admin.html">Admin console</a><span class="who" id="who"></span><button class="btn sec sm" id="aq-signout" type="button" data-effect="private">Sign out</button></div>
</header>
<div id="aq-view-auth" class="auth">
  <h2>Sign in as an administrator</h2>
  <input id="aq-auth-email" type="email" autocomplete="username" placeholder="Email">
  <input id="aq-auth-pass" data-effect="private" type="password" autocomplete="current-password" placeholder="Password">
  <button class="btn" id="aq-auth-submit" type="button" data-effect="private">Sign in</button>
  <p id="aq-auth-msg"></p>
</div>
<main id="aq-view-admin" class="hide" data-statuses="${esc(INQUIRY_PIPELINE.statuses.join(','))}" data-stages="${esc(INQUIRY_PIPELINE.stages.join(','))}" data-closed-stages="${esc(INQUIRY_PIPELINE.closedStages.join(','))}" data-not-lead-purposes="${esc(INQUIRY_PIPELINE.notLeads.purposes.join(','))}" data-not-lead-statuses="${esc(INQUIRY_PIPELINE.notLeads.statuses.join(','))}" data-next-step-max="${INQUIRY_PIPELINE.nextStepMax}">
  <div class="tabs">
    <button class="tab" type="button" id="tab-pipe" data-effect="none">Pipeline</button>
    ${[...INQUIRY_PIPELINE.statuses, 'all'].map((f) => '<button class="tab" type="button" data-filter="' + f + '" data-effect="none">' + f[0].toUpperCase() + f.slice(1) + '</button>').join('\n    ')}
    <button class="tab" type="button" id="tab-sup" data-effect="none">Supporters</button>
  </div>
  <div id="list-pipe" class="hide"></div>
  <div id="list-inq"></div>
  <div id="list-sup" class="hide"></div>
</main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
</body>
</html>
`);
}

/* ── the corrections console (admin-corrections.html, community-next) ─────────────────────────
   Generated here for the enquiries console's reason (the backend address and key from their owner), and so the
   vocabulary it offers is _shared/correction-shape.js's, written into data-* (js/admin-corrections.js restates none). */
export const ADMIN_CORRECTIONS_PAGE = 'admin-corrections.html';
export function renderAdminCorrections(F) {
  const filters = [['open', 'Open'], ['new', 'New'], ['confirmed', 'Confirmed'], ['answered', 'Answered'], ['historical', 'Historical'], ['published', 'Published'], ['spam', 'Spam'], ['all', 'All']];
  return withInlineHashes(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
${'<meta http-equiv="Content-Security-Policy" content="' + ["default-src 'self'", "base-uri 'self'", "object-src 'none'", "form-action 'self'", "frame-src 'none'",
    "connect-src 'self' " + F.backend, "img-src 'self' data:", "style-src 'self'", "font-src 'self' data:", "script-src 'self'"].join('; ') + '">'}
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="strict-origin-when-cross-origin">
<!-- GENERATED by scripts/org-pages.mjs — the behaviour is js/admin-corrections.js, the look css/admin-inquiries.css + css/admin-corrections.css. -->
<title>IntMap · Map corrections</title>
<meta name="intmap-backend" content="${esc(F.backend)}">
<meta name="intmap-anon-key" content="${esc(F.anonKey)}">
<link rel="icon" href="./IntMap.Icon.png">
<link rel="stylesheet" href="./css/admin-inquiries.css">
<link rel="stylesheet" href="./css/admin-corrections.css">
<script src="vendor/supabase-js.js"></script>
<script src="./js/safe-html.js"></script>
<script src="./js/admin-corrections.js"></script>
</head>
<body>
<header>
  <h1>IntMap · Map corrections</h1>
  <div class="row"><a href="./admin.html">Admin console</a><a href="./admin-inquiries.html">Enquiries</a><a href="./corrections.html">Public log</a><span class="who" id="who"></span><button class="btn sec sm" id="mc-signout" type="button" data-effect="private">Sign out</button></div>
</header>
<div id="mc-view-auth" class="auth">
  <h2>Sign in as an administrator</h2>
  <input id="mc-auth-email" type="email" autocomplete="username" placeholder="Email">
  <input id="mc-auth-pass" data-effect="private" type="password" autocomplete="current-password" placeholder="Password">
  <button class="btn" id="mc-auth-submit" type="button" data-effect="private">Sign in</button>
  <p id="mc-auth-msg"></p>
</div>
<main id="mc-view-admin" class="mc hide" data-statuses="${CORRECTION.statuses.join(',')}" data-open="${CORRECTION.open.join(',')}" data-publishable="${CORRECTION.publishable.join(',')}">
  <div class="tabs">
    ${filters.map(([f, label]) => '<button class="tab" type="button" data-filter="' + f + '" data-effect="none">' + label + '</button>').join('\n    ')}
  </div>
  <p class="mc-summary" id="mc-summary"></p>
  <div class="mc-grid">
    <div class="mc-mapwrap">
      <svg id="mc-map" role="img" aria-label="Reports on a world map" viewBox="-180 -90 360 180"></svg>
      <div class="mc-legend"><span><i class="k-new"></i>new</span><span><i class="k-confirmed"></i>confirmed / cannot fix</span><span><i class="k-fixed"></i>fixed</span><span><i class="k-closed"></i>not an error / duplicate</span><span><i class="k-spam"></i>spam</span>
        <button class="btn sec sm" id="mc-world" type="button" data-effect="none">Whole world</button><span>Land: Natural Earth (public domain)</span></div>
    </div>
    <div id="mc-list"></div>
  </div>
</main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
</body>
</html>
`);
}
export const ADMIN_PAGES = [ADMIN_PAGE, ADMIN_CORRECTIONS_PAGE];

export function outputs(F = orgFacts()) {
  const out = {};
  for (const L of LANGS) for (const page of PAGES) out[pagePath(page, L)] = renderPage(F, page, L);
  out[ADMIN_PAGE] = renderAdmin(F);
  out[ADMIN_CORRECTIONS_PAGE] = renderAdminCorrections(F);
  return out;
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const out = outputs();
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (process.argv.includes('--write')) {
    for (const [rel, text] of Object.entries(out)) {
      const p = join(ROOT, rel);
      mkdirSync(dirname(p), { recursive: true });
      if (!existsSync(p) || norm(readFileSync(p, 'utf8')) !== text) writeFileSync(p, text);
    }
    console.log('org-pages: wrote ' + Object.keys(out).length + ' pages');
  } else if (process.argv.includes('--check')) {
    const stale = Object.entries(out).filter(([rel, text]) => !existsSync(join(ROOT, rel)) || norm(readFileSync(join(ROOT, rel), 'utf8')) !== text).map(([rel]) => rel);
    if (stale.length) { console.error('org-pages: out of date — run node scripts/org-pages.mjs --write:\n  ' + stale.join('\n  ')); process.exit(1); }
    console.log('org-pages: ok — ' + Object.keys(out).length + ' pages match their sources');
  } else {
    console.log('usage: node scripts/org-pages.mjs --write | --check');
  }
}
