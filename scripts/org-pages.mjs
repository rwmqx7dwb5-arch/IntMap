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
 *
 *    node scripts/org-pages.mjs --write    regenerate the eleven pages
 *    node scripts/org-pages.mjs --check    exit 1 if any differs from what --write would produce
 *                                          (tests/sales-channels-checks.test.mjs runs this)
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TEXT } from './org-pages-text.mjs';
import { facts } from './landing.mjs';
import { SHOWCASE, CAPTURED } from '../js/showcase.js';
import { EMBED_SIZES } from '../js/embed-mode.js';
import { PLANS, DEFAULT_PLAN } from '../supabase/functions/_shared/plans.js';
import { INQUIRY, INQUIRY_LIMITS } from '../supabase/functions/_shared/inquiry-shape.js';
import { withInlineHashes } from './csp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
function need(re, src, what) { const m = re.exec(src); if (!m) throw new Error('org-pages: cannot read ' + what); return m; }

export const PAGES = ['for-newsrooms', 'for-schools', 'for-research', 'contact', 'support'];
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
/* the contact form's preselection per page: ?for=<audience>&about=<purpose> */
const ASK = {
  'for-newsrooms': { for: 'newsroom', about: 'embed' },
  'for-schools': { for: 'education', about: 'classroom' },
  'for-research': { for: 'research', about: 'data' },
  support: { for: 'supporter', about: 'supporter_listing' },
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
    ...F, backend, anonKey, spamDays: +spamDays, keepDays: +keepDays,
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
const TALKS = new Set(['contact', 'support']);
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
      ${link('for-newsrooms', N.newsrooms)}
      ${link('for-schools', N.schools)}
      ${link('for-research', N.research)}
      ${link('support', N.support)}
      ${link('contact', N.contact)}
    </div>
    <a class="lp-lang" href="${toOther}" hreflang="${other.tag}" lang="${other.tag}" data-lp-lang="${other.tag}" aria-label="${esc(N.langLabel[k])}">${esc(N.lang[k])}</a>
    <a class="lp-btn lp-btn-sm" href="${L.up}index.html">${esc(N.open[k])}</a>
  </nav>
</header>`;
}

function footer(L) {
  const Fo = TEXT.footer, k = L.i;
  return `<footer class="lp-foot">
  <nav class="lp-foot-in">
    <a href="./teachers.html">${esc(Fo.teachers[k])}</a>
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
    <a class="lp-btn lp-btn-2" href="./teachers.html">${esc(T.lessonsLink[k])}</a>
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
        <textarea id="og-message" name="message" required maxlength="${M.message}" rows="7" aria-describedby="og-hint og-hint-sup"></textarea>
        <p class="og-hint" id="og-hint">${esc(T.messageHint[k])}</p>
        <p class="og-hint" id="og-hint-sup" hidden>${esc(T.supporterHint[k])}</p>
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

export function renderPage(F, page, L) {
  const body = page === 'contact' ? contactBody(F, L) : page === 'support' ? supportBody(F, L) : introBody(F, L, page);
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
   css/admin-inquiries.css. noindex: it is an operator's page, linked from nowhere public. */
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
<main id="aq-view-admin" class="hide">
  <div class="tabs">
    ${['new', 'replied', 'closed', 'spam', 'all'].map((f) => '<button class="tab" type="button" data-filter="' + f + '" data-effect="none">' + f[0].toUpperCase() + f.slice(1) + '</button>').join('\n    ')}
    <button class="tab" type="button" id="tab-sup" data-effect="none">Supporters</button>
  </div>
  <div id="list-inq"></div>
  <div id="list-sup" class="hide"></div>
</main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
</body>
</html>
`);
}

export function outputs(F = orgFacts()) {
  const out = {};
  for (const L of LANGS) for (const page of PAGES) out[pagePath(page, L)] = renderPage(F, page, L);
  out[ADMIN_PAGE] = renderAdmin(F);
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
