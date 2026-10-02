#!/usr/bin/env node
/* ============================================================================
 *  IntMap · landing — the landing page, the teacher page, the sitemap and robots.txt, GENERATED
 * ----------------------------------------------------------------------------
 *  「求めるのは改善ではなく商品開発・マーケティング・営業」 (2026-10-01). The pages a visitor who has
 *  never opened the app lands on: what IntMap is (about.html), how to teach with it (teachers.html),
 *  each in English and Japanese (ja/…), and what a search engine reads (sitemap.xml, robots.txt).
 *
 *  ══ WHY THE PAGES ARE GENERATED, NOT HAND-WRITTEN ══════════════════════════════════════════════
 *  Three things on them are owned by other files, and a copy of any of them is the drift this
 *  repository keeps paying for:
 *    · the PROSE        → scripts/landing-text.mjs (en + jp, one place)
 *    · the EXAMPLES     → js/showcase.js (the same declaration Atlas and the spec read)
 *    · the TOURS        → js/tours.js (the classroom tours the app's player and Atlas open)
 *    · the FACTS        → the files that own them: the clock's floor (js/hist-scale.js FLOOR), the
 *                         era snapshots (data/hist-eras.js), the border bands (js/time-borders.js
 *                         HB_MIN/HB_MAX/CS_MIN/CS_MAX), the layer count (js/layer-manifest.js
 *                         LAYERS), the site's address (NOT written here: see SITE below), and
 *                         the donation links (js/supporter.js
 *                         STRIPE_DONATE).
 *  Every page is a real HTML document with its words in it — readable with scripts off, and by a
 *  crawler without rendering — so the language versions are separate URLs (hreflang), not a
 *  runtime switch.
 *
 *    node scripts/landing.mjs --write    regenerate the pages, sitemap.xml and robots.txt
 *    node scripts/landing.mjs --check    exit 1 if any of them differs from what --write would
 *                                        produce, or if a captured example link no longer says what
 *                                        its intent says (tests/landing-showcase-checks.test.mjs runs this)
 *    node scripts/landing.mjs --facts    print the derived facts
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TEXT } from './landing-text.mjs';
import { SHOWCASE, WITHHELD, CAPTURED, CURRICULUM, RECORD_ANSWERED } from '../js/showcase.js';
import { TOURS, CAPTURED_STEPS, tourSteps, tourCover, tourLink } from '../js/tours.js';   /* (classroom-tours) the tours section of the teacher pages */
import { LAYERS, sharedIds } from '../js/layer-manifest.js';
import { SITE_BASE_PATH } from '../supabase/functions/_shared/site-origin.js';
import { SITE_TOKEN } from './site-url.mjs';
import { STRIPE_DONATE } from '../js/supporter.js';
import { withInlineHashes } from './csp.mjs';   /* (csp-without-inline) the pages' script policy */   /* the donation links' one owner (supporter-funnel) */

/* ══ THE SITE'S ADDRESS IS NOT WRITTEN INTO THE PAGES — A TOKEN IS ═══════════════════════════════════
   canonical, hreflang, og:url, og:image and the sitemap's <loc> need ABSOLUTE addresses, and the address
   has one owner (supabase/functions/_shared/site-origin.js; scripts/site-url.mjs refuses it spelled
   anywhere else). So the generated files carry SITE_TOKEN and the build fills it in — the copied pages
   by scripts/site-url.mjs fillSiteToken (siteUrlPlugin), the same token and value index.html's social
   card uses. Moving the site is then one value, and these pages follow without being regenerated.
   robots.txt needs the base PATH as well, which is site-origin.js's own SITE_BASE_PATH. */
const SITE = SITE_TOKEN;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── the facts, from their owners ─────────────────────────────────────────────────────────────── */
function need(re, src, what) { const m = re.exec(src); if (!m) throw new Error('landing: cannot read ' + what); return m; }
export function facts() {
  const hs = rd('js/hist-scale.js');
  const floor = +need(/const FLOOR = (-?\d+);/, hs, 'js/hist-scale.js FLOOR')[1];
  const tb = rd('js/time-borders.js');
  const [, hbMin, hbMax] = need(/const HB_MIN=(\d+), HB_MAX=(\d+);/, tb, 'js/time-borders.js HB_MIN/HB_MAX');
  const [, csMin, csMax] = need(/const CS_MIN=(\d+), CS_MAX=(\d+);/, tb, 'js/time-borders.js CS_MIN/CS_MAX');
  const er = rd('data/hist-eras.js');
  const eras = JSON.parse(er.slice(er.indexOf('=') + 1).replace(/;\s*$/, ''));
  const site = SITE;
  const stripeEn = STRIPE_DONATE.en, stripeJp = STRIPE_DONATE.jp;
  return {
    floor, bcYears: 1 - floor,                    /* astronomical year y ≤ 0 is (1 − y) BC */
    snapshots: eras.snaps.length, firstSnap: eras.snaps[0].y,
    ohmFrom: +hbMin, ohmTo: +hbMax, csFrom: +csMin, csTo: +csMax,
    layers: LAYERS.length,
    site, stripe: { en: stripeEn, jp: stripeJp },
  };
}

/* the facts, written in each language */
function factWords(F, lang) {
  const n = (v) => v.toLocaleString(lang === 'jp' ? 'ja-JP' : 'en-US');
  return {
    floorBC: lang === 'jp' ? '紀元前' + n(F.bcYears) + '年' : n(F.bcYears) + ' BC',
    snapshots: n(F.snapshots), ohmFrom: String(F.ohmFrom), ohmTo: String(F.ohmTo),
    csFrom: String(F.csFrom), csTo: String(F.csTo), layers: n(F.layers),
  };
}
function fill(s, W) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in W)) throw new Error('landing: unknown placeholder ' + m + ' in «' + s + '»');
    return W[k];
  });
}

/* ── HTML ─────────────────────────────────────────────────────────────────────────────────────── */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LANGS = [
  /* `i` is the position of the language in an LA(en, jp) tuple (js/showcase.js) */
  { key: 'en', i: 0, tag: 'en', dir: '', up: './', locale: 'en_US' },
  { key: 'jp', i: 1, tag: 'ja', dir: 'ja/', up: '../', locale: 'ja_JP' },
];
export const PAGES = ['about', 'teachers'];
const HERO_EXAMPLE = 'europe-1914';
export const pagePath = (page, L) => L.dir + page + '.html';

function linkFor(id) { const c = CAPTURED[id]; return c && c.hash ? 'index.html' + c.hash : null; }

/* ══ THE PAGES' CONTENT-SECURITY-POLICY (csp-without-inline) ══════════════════════════════════════════
   Derived from what the page this file writes actually loads, in the same place that writes it:
   stylesheets, images and the icon from this origin; the one inline <script> (PAGE_SCRIPT, or the share
   page's redirect) admitted by its sha256 — withInlineHashes fills those in when outputs() finishes the
   page, so the hash is of the text shipped; Google Fonts only on the page that links it (the Japanese
   pages' CJK face). Nothing is fetched, framed or submitted, so connect/frame/form are this origin or
   nothing. No 'unsafe-inline' anywhere: these pages set no style attribute and run no event attribute
   (scripts/csp.mjs holds both). Placed straight after <meta charset>, before anything it governs. */
const FONT_CSS_ORIGIN = 'https://fonts.googleapis.com', FONT_FILE_ORIGIN = 'https://fonts.gstatic.com';
function cspMeta({ webFonts }) {
  const css = webFonts ? ' ' + FONT_CSS_ORIGIN : '', files = webFonts ? ' ' + FONT_FILE_ORIGIN : '';
  return '<meta http-equiv="Content-Security-Policy" content="' + [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'", "form-action 'self'", "frame-src 'none'",
    "connect-src 'self'", "img-src 'self' data:", "style-src 'self'" + css, "font-src 'self' data:" + files,
    "script-src 'self'",
  ].join('; ') + '">';
}

function head(F, L, page, T) {
  const P = T[page];
  const W = factWords(F, L.key);
  const title = fill(P.title, W), desc = fill(P.description, W);
  const url = (l) => F.site + pagePath(page, l);
  const img = F.site + CAPTURED[HERO_EXAMPLE].image;
  const ld = page === 'about'
    ? { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'IntMap', url: F.site,
      description: desc, applicationCategory: 'EducationalApplication', operatingSystem: 'Any (web browser)',
      browserRequirements: 'Requires a modern web browser with WebGL', inLanguage: ['en', 'ja'], isAccessibleForFree: true,
      image: img, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }
    : { '@context': 'https://schema.org', '@type': 'WebPage', name: title, url: url(L), description: desc,
      inLanguage: L.tag, isPartOf: { '@type': 'WebSite', name: 'IntMap', url: F.site },
      audience: { '@type': 'EducationalAudience', educationalRole: 'teacher' } };
  const cjk = L.tag === 'ja'
    ? `\n<link rel="preconnect" href="${FONT_CSS_ORIGIN}">\n<link rel="preconnect" href="${FONT_FILE_ORIGIN}" crossorigin>\n<link rel="stylesheet" href="${FONT_CSS_ORIGIN}/css2?family=Noto+Sans+JP:wght@400;500;600;700&amp;display=swap">`
    : '';
  return `<!DOCTYPE html>
<html lang="${L.tag}">
<head>
<meta charset="utf-8">
${cspMeta({ webFonts: !!cjk })}
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- GENERATED by scripts/landing.mjs from scripts/landing-text.mjs and js/showcase.js — edit those, not this file. -->
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
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="800">
<meta property="og:locale" content="${L.locale}">
${LANGS.filter((l) => l !== L).map((l) => `<meta property="og:locale:alternate" content="${l.locale}">`).join('\n')}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${L.up}IntMap.Icon.png">${cjk}
<link rel="stylesheet" href="${L.up}css/fonts.css">
<link rel="stylesheet" href="${L.up}css/pages.css">
<link rel="stylesheet" href="${L.up}css/landing.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<script>${PAGE_SCRIPT}</script>
</head>`;
}

function topbar(L, page, T) {
  const N = T.nav;
  const other = LANGS.find((l) => l !== L);
  const toOther = (L.dir ? '../' : './') + pagePath(page, other);
  const here = (p) => './' + (p + '.html');
  return `<header class="lp-top">
  <nav class="lp-top-in" aria-label="IntMap">
    <a class="lp-brand" href="${here('about')}"><img src="${L.up}IntMap.Icon.png" alt="" width="28" height="28"><span>IntMap</span></a>
    <span class="lp-top-spacer"></span>
    <a class="lp-top-link" href="${here('about')}#examples">${esc(N.examples)}</a>
    <a class="lp-top-link${page === 'teachers' ? ' is-here' : ''}" href="${here('teachers')}"${page === 'teachers' ? ' aria-current="page"' : ''}>${esc(N.teachers)}</a>
    <a class="lp-lang" href="${toOther}" hreflang="${other.tag}" lang="${other.tag}" data-lp-lang="${other.tag}" aria-label="${esc(N.langLabel)}">${esc(N.lang)}</a>
    <a class="lp-btn lp-btn-sm" href="${L.up}index.html">${esc(N.open)}</a>
  </nav>
</header>`;
}

function picture(id, L, alt, eager) {
  const c = CAPTURED[id];
  return `<img src="${L.up}${c.image}" alt="${esc(alt)}" width="1280" height="800"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}>`;
}

function card(s, L, E, withQuestion) {
  const k = L.i;
  const href = L.up + linkFor(s.id);
  const fits = (s.curriculum || []).map((c) => CURRICULUM[c]).filter(Boolean);
  return `<article class="lp-card" id="ex-${s.id}" data-showcase="${s.id}">
      <a class="lp-card-img" href="${esc(href)}" tabindex="-1" aria-hidden="true">${picture(s.id, L, '', false)}</a>
      <div class="lp-card-body">
        <h3>${esc(s.title[k])}</h3>
        <p>${esc(s.blurb[k])}</p>${withQuestion ? `
        <p class="lp-q"><span class="lp-q-h">${esc(E.question)}</span>${esc(s.question[k])}</p>${fits.length ? `
        <p class="lp-fits"><span class="lp-q-h">${esc(E.fits)}</span>${fits.map((f) => esc(f.subject[k] + ' ' + f.item[k])).join(' / ')}</p>` : ''}` : ''}
        <a class="lp-open" href="${esc(href)}" data-showcase-link="${s.id}">${esc(E.open)} →</a>
      </div>
    </article>`;
}

function footer(L, T) {
  const Fo = T.footer;
  return `<footer class="lp-foot">
  <nav class="lp-foot-in">
    <a href="${L.up}sources.html">${esc(Fo.sources)}</a>
    <a href="${L.up}science.html">${esc(Fo.science)}</a>
    <a href="${L.up}privacy.html">${esc(Fo.privacy)}</a>
    <a href="${L.up}terms.html">${esc(Fo.terms)}</a>
    <span class="lp-foot-mark">IntMap</span>
  </nav>
</footer>`;
}

function aboutBody(F, L, T) {
  const A = T.about, W = factWords(F, L.key);
  const shown = SHOWCASE.filter((s) => s.audience.includes('curious'));
  return `<main class="lp-main">
  <section class="lp-hero">
    <div class="lp-hero-text">
      <h1>${esc(fill(A.hero.h1, W))}</h1>
      <p class="lp-lede">${esc(fill(A.hero.sub, W))}</p>
      <div class="lp-cta">
        <a class="lp-btn" href="${L.up}index.html">${esc(A.hero.ctaOpen)}</a>
        <a class="lp-btn lp-btn-2" href="#examples">${esc(A.hero.ctaExamples)}</a>
      </div>
      <p class="lp-note">${esc(A.hero.note)}</p>
    </div>
    <a class="lp-hero-img" href="${esc(L.up + linkFor(HERO_EXAMPLE))}">${picture(HERO_EXAMPLE, L, A.hero.imgAlt, true)}</a>
  </section>

  <section class="lp-sec" id="why">
    <h2>${esc(A.why.h2)}</h2>
    <div class="lp-grid3">
${A.why.items.map((it) => `      <div class="lp-tile"><h3>${esc(it.h)}</h3><p>${esc(fill(it.p, W))}</p></div>`).join('\n')}
    </div>
  </section>

  <section class="lp-sec" id="who">
    <h2>${esc(A.who.h2)}</h2>
    <div class="lp-grid2">
      <div class="lp-tile lp-who"><h3>${esc(A.who.curious.h)}</h3><p>${esc(A.who.curious.p)}</p><a class="lp-open" href="#examples">${esc(A.who.curious.cta)} →</a></div>
      <div class="lp-tile lp-who"><h3>${esc(A.who.teachers.h)}</h3><p>${esc(A.who.teachers.p)}</p><a class="lp-open" href="./teachers.html">${esc(A.who.teachers.cta)} →</a></div>
    </div>
  </section>

  <section class="lp-sec" id="examples">
    <h2>${esc(A.examples.h2)}</h2>
    <p class="lp-sub">${esc(A.examples.sub)}</p>
    <div class="lp-cards">
    ${shown.map((s) => card(s, L, A.examples, false)).join('\n    ')}
    </div>
  </section>

  <section class="lp-sec lp-support" id="support">
    <h2>${esc(A.support.h2)}</h2>
    <p>${esc(A.support.p)}</p>
    <a class="lp-btn" href="${esc(F.stripe[L.key])}" target="_blank" rel="noopener">${esc(A.support.cta)} ↗</a>
  </section>

  <section class="lp-sec" id="faq">
    <h2>${esc(A.faq.h2)}</h2>
    <div class="lp-faq">
${A.faq.items.map((it) => `      <details><summary>${esc(it.q)}</summary><p>${esc(it.a)}${it.link ? ` <a href="${L.up}${it.link.href}">${esc(it.link.label)} →</a>` : ''}</p></details>`).join('\n')}
    </div>
  </section>
</main>`;
}

/* (classroom-tours) the tours, each with its picture (the first of its steps that is an example), its steps
   by title, the course headings it fits, and the address that starts it in the classroom mode — js/tours.js
   tourLink, whose fragment is the first step's captured link, so the map opens on it from the boot */
function toursSection(L, P) {
  const k = L.i, Tt = P.tours;
  const cards = TOURS.map((tour) => {
    const href = L.up + tourLink(tour.id, 1).replace(/^\.\//, '');
    const cover = tourCover(tour);
    const fits = (tour.curriculum || []).map((c) => CURRICULUM[c]).filter(Boolean);
    return `<article class="lp-card lp-tour" id="tour-${tour.id}" data-tour="${tour.id}">
      <a class="lp-card-img" href="${esc(href)}" tabindex="-1" aria-hidden="true"><img src="${L.up}${cover}" alt="" width="1280" height="800" loading="lazy" decoding="async"></a>
      <div class="lp-card-body">
        <h3>${esc(tour.title[k])}</h3>
        <p>${esc(tour.blurb[k])}</p>
        <ol class="lp-tour-steps">
${tourSteps(tour).map((st) => `          <li>${esc(st.title[k])}</li>`).join('\n')}
        </ol>${fits.length ? `
        <p class="lp-fits"><span class="lp-q-h">${esc(P.examples.fits)}</span>${fits.map((f) => esc(f.subject[k] + ' ' + f.item[k])).join(' / ')}</p>` : ''}
        <a class="lp-open" href="${esc(href)}" data-tour-link="${tour.id}">${esc(Tt.start)} →</a>
      </div>
    </article>`;
  });
  return `  <section class="lp-sec" id="tours">
    <h2>${esc(Tt.h2)}</h2>
    <p class="lp-sub">${esc(Tt.sub)}</p>
    <div class="lp-cards">
    ${cards.join('\n    ')}
    </div>
    <p class="lp-note">${esc(Tt.note)}</p>
  </section>`;
}

function teachersBody(F, L, T) {
  const P = T.teachers, W = factWords(F, L.key), k = L.i;
  const shown = SHOWCASE.filter((s) => s.audience.includes('teachers'));
  const rows = Object.keys(CURRICULUM).map((key) => {
    const c = CURRICULUM[key];
    const ex = shown.filter((s) => (s.curriculum || []).includes(key));
    if (!ex.length) return '';
    return `        <tr><td>${esc(c.subject[k] + ' ' + c.item[k])}</td><td>${ex.map((s) => `<a href="#ex-${s.id}">${esc(s.title[k])}</a>`).join('<br>')}</td></tr>`;
  }).filter(Boolean);
  return `<main class="lp-main">
  <section class="lp-hero lp-hero-t">
    <div class="lp-hero-text">
      <h1>${esc(P.hero.h1)}</h1>
      <p class="lp-lede">${esc(P.hero.sub)}</p>
      <div class="lp-cta">
        <a class="lp-btn" href="#plan">${esc(P.hero.ctaPlan)}</a>
        <a class="lp-btn lp-btn-2" href="#tours">${esc(P.hero.ctaTours)}</a>
        <a class="lp-btn lp-btn-2" href="#examples">${esc(P.hero.ctaExamples)}</a>
      </div>
    </div>
  </section>

  <section class="lp-sec" id="plan">
    <h2>${esc(P.plan.h2)}</h2>
    <p class="lp-sub">${esc(P.plan.sub)}</p>
    <ol class="lp-steps">
${P.plan.steps.map((st) => `      <li><h3>${esc(st.h)}</h3><p>${esc(st.p)}</p></li>`).join('\n')}
    </ol>
    <p class="lp-note">${esc(P.plan.note)}</p>
  </section>

${toursSection(L, P)}

  <section class="lp-sec" id="examples">
    <h2>${esc(P.examples.h2)}</h2>
    <div class="lp-cards">
    ${shown.map((s) => card(s, L, P.examples, true)).join('\n    ')}
    </div>
  </section>

  <section class="lp-sec" id="curriculum">
    <h2>${esc(P.curriculum.h2)}</h2>
    <p class="lp-sub">${esc(P.curriculum.sub)}</p>
    <div class="lp-tablewrap">
      <table>
        <tr><th>${esc(P.curriculum.colItem)}</th><th>${esc(P.curriculum.colExamples)}</th></tr>
${rows.join('\n')}
      </table>
    </div>
    <p class="lp-note">${esc(P.curriculum.source)} <a href="${MEXT_URL}" target="_blank" rel="noopener">${esc(P.curriculum.sourceLabel)} ↗</a></p>
  </section>

  <section class="lp-sec" id="trust">
    <h2>${esc(P.trust.h2)}</h2>
    <div class="lp-grid2">
${P.trust.items.map((it) => `      <div class="lp-tile"><h3>${esc(it.h)}</h3><p>${esc(fill(it.p, W))}</p>${it.link ? `<a class="lp-open" href="${L.up}${it.link.href}">${esc(it.link.label)} →</a>` : ''}</div>`).join('\n')}
    </div>
  </section>
</main>`;
}
/* ══ THE ONE SCRIPT THESE PAGES RUN — inline, so it acts before the first paint ═════════════════
   Every word is in the HTML; the pages read the same with this absent. It does two things a static
   file cannot:
   1. THE THEME. A reader who set the map to light or dark gets the same here: the app's setting is
      copied onto <html data-theme>, which css/pages.css (and css/landing.css on it) already read —
      the rule js/page-i18n.js applyTheme follows. Inline, so a dark-mode reader sees no white flash.
   2. THE LANGUAGE A READER ALREADY CHOSE. The languages are separate URLs (hreflang), so a crawler and
      a shared link get exactly the one they name. Only a reader who has CHOSEN Japanese — in the app's
      settings (intmap_settings.lang === 'jp', the app's own spelling) or with this page's switch
      (remembered as intmap_lp_lang) — and arrives at the other language is taken to the twin page
      the page itself names in <link rel=alternate>. A visitor with no saved choice is never moved.
   ⚠ Not a file in js/: a js/ module is held to the app's import graph (scripts/js-reachability.mjs),
   and these pages are not part of the app. ⚠ No back-ticks inside (CONSTITUTION.md §2). */
const PAGE_SCRIPT = "(function(){var d=document.documentElement,s={};try{s=JSON.parse(localStorage.getItem('intmap_settings')||'{}')||{};}catch(e){}"
  + "if(s.theme==='light'||s.theme==='dark')d.setAttribute('data-theme',s.theme);"
  + "var here=(d.getAttribute('lang')||'en').toLowerCase(),c=null;try{c=localStorage.getItem('intmap_lp_lang');}catch(e){}"
  + "if(!c&&s.lang==='jp')c='ja';"
  + "var alt=document.querySelector('link[rel=\"alternate\"][hreflang=\"'+(here==='ja'?'en':'ja')+'\"]');"
  + "if(alt&&c&&c!==here&&!/[?&]lang=/.test(location.search)){try{var leaf=new URL(alt.getAttribute('href')).pathname.split('/').pop();"
  + "var p=location.pathname,base=p.slice(0,p.lastIndexOf('/')+1);if(here==='ja')base=base.slice(0,-3);"
  + "location.replace(base+(here==='ja'?'':'ja/')+leaf+location.hash);return;}catch(e){}}"
  + "document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[data-lp-lang]'):null;"
  + "if(a){try{localStorage.setItem('intmap_lp_lang',a.getAttribute('data-lp-lang'));}catch(_){}}});})();";
/* the document the curriculum headings are quoted from (read 2026-10-01) — see js/showcase.js CURRICULUM */
const MEXT_URL = 'https://www.mext.go.jp/content/20230120-mxt_kyoiku02-100002604_03.pdf';

/* ══ THE SHARE PAGES — one per example, per language: s/<id>.html and ja/s/<id>.html ══════════════════
   「SNS 投稿の主力素材」. A link posted to a social network is unfurled by a crawler that reads the HTML
   and runs nothing, and the app's own address cannot describe one example: index.html#v=… carries its
   state in the fragment, which never reaches a server, so every example would unfurl as the same
   generic card. (A Supabase Edge Function cannot serve text/html, so the card cannot be made on
   request either.) So each example gets a static page whose <head> IS its card — title, sentence and
   the 1200×630 picture the app took of it (scripts/showcase-capture.mjs) — and whose body sends a
   person straight on to the map: a meta refresh (no script needed), location.replace (no history
   entry left behind) and a plain link for anyone whose browser does neither.
   ⚠ The picture's size is READ FROM THE PICTURE (jpegSize), not typed: og:image:width/height are a
   claim about a file, and the file is the authority. */
export const shareDir = (L) => L.dir + 's/';
export const sharePath = (id, L) => shareDir(L) + id + '.html';
/** a baseline/progressive JPEG's pixel size, from its SOF marker */
export function jpegSize(rel) {
  const b = readFileSync(join(ROOT, rel));
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  throw new Error('landing: no frame header in ' + rel);
}
function sharePage(F, s, L) {
  const up = L.up + '../';                                   /* s/ is one level below the page's language root */
  const target = up + 'index.html' + CAPTURED[s.id].hash;
  const T = TEXT[L.key];
  const title = s.title[L.i], desc = s.blurb[L.i];
  const url = (l) => F.site + sharePath(s.id, l);
  const card = CAPTURED[s.id].card, size = jpegSize(card);
  return `<!DOCTYPE html>
<html lang="${L.tag}">
<head>
<meta charset="utf-8">
${cspMeta({ webFonts: false })}
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- GENERATED by scripts/landing.mjs from js/showcase.js — edit the example there, not this file. -->
<title>${esc(title)} — IntMap</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url(L))}">
${LANGS.map((l) => `<link rel="alternate" hreflang="${l.tag}" href="${esc(url(l))}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${esc(url(LANGS[0]))}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="IntMap">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url(L))}">
<meta property="og:image" content="${esc(F.site + card)}">
<meta property="og:image:width" content="${size.width}">
<meta property="og:image:height" content="${size.height}">
<meta property="og:image:alt" content="${esc(title)}">
<meta property="og:locale" content="${L.locale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(F.site + card)}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<link rel="icon" href="${up}IntMap.Icon.png">
<link rel="stylesheet" href="${up}css/fonts.css">
<link rel="stylesheet" href="${up}css/pages.css">
<link rel="stylesheet" href="${up}css/landing.css">
<script>location.replace(new URL(${JSON.stringify(target).replace(/</g, '\\u003c')}, location.href).href);</script>
</head>
<body class="lp lp-share">
<main class="lp-main lp-share-main">
  <h1>${esc(title)}</h1>
  <p class="lp-lede">${esc(desc)}</p>
  <p><a class="lp-btn" href="${esc(target)}" data-share-target="${s.id}">${esc(T.about.examples.open)} →</a></p>
  <p class="lp-note"><a href="${up}${L.dir}about.html">${esc(T.nav.about)}</a></p>
</main>
</body>
</html>
`;
}

export function renderPage(F, page, L) {
  const T = TEXT[L.key];
  const body = page === 'about' ? aboutBody(F, L, T) : teachersBody(F, L, T);
  return head(F, L, page, T) + '\n<body class="lp lp-' + page + '">\n' + topbar(L, page, T) + '\n' + body + '\n' + footer(L, T) + '\n</body>\n</html>\n';
}

/* ── sitemap.xml and robots.txt ───────────────────────────────────────────────────────────────── */
function sitemap(F) {
  const u = [];
  u.push(`  <url><loc>${esc(F.site)}</loc></url>`);
  for (const page of PAGES) for (const L of LANGS) {
    u.push(`  <url><loc>${esc(F.site + pagePath(page, L))}</loc>\n${LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.tag}" href="${esc(F.site + pagePath(page, l))}"/>`).join('\n')}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(F.site + pagePath(page, LANGS[0]))}"/>\n  </url>`);
  }
  for (const s of SHOWCASE) for (const L of LANGS) {
    u.push(`  <url><loc>${esc(F.site + sharePath(s.id, L))}</loc>\n${LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.tag}" href="${esc(F.site + sharePath(s.id, l))}"/>`).join('\n')}\n  </url>`);
  }
  for (const p of ['sources.html', 'science.html', 'privacy.html', 'terms.html']) u.push(`  <url><loc>${esc(F.site + p)}</loc></url>`);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!-- GENERATED by scripts/landing.mjs — edit the generator, not this file. -->\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + u.join('\n') + '\n</urlset>\n';
}
function robots(F) {
  const path = SITE_BASE_PATH;   /* '/IntMap/' on GitHub Pages; '/' on a domain of its own (site-origin.js) */
  return '# GENERATED by scripts/landing.mjs — edit the generator, not this file.\n'
    + '# ⚠ Crawlers read robots.txt only at the root of a host. While the site is served from a\n'
    + '#   sub-path (' + path + '), this file is not read there; submit the sitemap in Search Console.\n'
    + 'User-agent: *\n'
    + 'Disallow: ' + path + 'admin.html\n'
    + 'Allow: ' + path + '\n'
    + '\nSitemap: ' + F.site + 'sitemap.xml\n';
}

export function outputs(F = facts()) {
  const out = {};
  for (const page of PAGES) for (const L of LANGS) out[pagePath(page, L)] = withInlineHashes(renderPage(F, page, L));
  for (const s of SHOWCASE) for (const L of LANGS) if (CAPTURED[s.id] && CAPTURED[s.id].card) out[sharePath(s.id, L)] = withInlineHashes(sharePage(F, s, L));
  out['sitemap.xml'] = sitemap(F);
  out['robots.txt'] = robots(F);
  return out;
}

/* ══ WHICH EXAMPLES THE RECORD ITSELF CAN ANSWER FOR — without a browser ════════════════════════════
   tests/landing-showcase.spec.js asks the running map whether an example's `drawn` names are there. That
   costs a browser restore per example, and the suite's whole time may only go down (scripts/test-budget.mjs,
   #R205). An example whose claim can be answered from the record the map draws from, read the way the map
   reads it, does not need to pay for it: the answer is asked here instead (tests/landing-showcase-checks).
   It qualifies only when nothing about it needs the page:
     · no layer (whether a layer PAINTS is a fact about the page);
     · names only, no first-level units (their tiers are assembled in js/time-admin1.js);
     · a date the record answers EXACTLY: an era sheet whose own year is the date (which sheet a year
       BETWEEN two sheets shows is the page's rule, not restated here), or a day-dated record in force;
     · every name spelled in the record as the map labels it (CShapes's own «Turkey (Ottoman Empire)» is
       labelled «Ottoman Empire» by a table in js/time-borders.js — such an example stays in the browser
       rather than this file copying that table).
   Everything else is opened in the browser. The partition is DERIVED here, so a new example lands on
   the side its own facts put it on. Returns { names } — the names the record holds for the date — or null. */
const RECORD_CACHE = new Map();
const readBundle = (rel) => {
  if (!RECORD_CACHE.has(rel)) { const t = rd(rel); RECORD_CACHE.set(rel, JSON.parse(t.slice(t.indexOf('=') + 1).replace(/;\s*$/, ''))); }
  return RECORD_CACHE.get(rel);
};
export function recordNamesFor(s) {
  const want = (s.drawn && s.drawn.labels) || [];
  if (s.layers.length || s.at == null || !want.length || (s.drawn.admin && s.drawn.admin.length)) return null;
  const m = /^(-?\d+)-(\d{2})-(\d{2})$/.exec(s.at); const y = +m[1], mo = +m[2], d = +m[3];
  const F = facts();
  const cmp = (a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] !== b[1] ? a[1] - b[1] : a[2] - b[2]);
  const inForce = (f) => cmp([f[2], f[3], f[4]], [y, mo, d]) <= 0 && cmp([y, mo, d], [f[5], f[6], f[7]]) < 0;
  const nm = (v) => (typeof v === 'string' ? v : (v && v.en) || '');
  let names = null;
  if (y >= F.csFrom && y <= F.csTo) names = readBundle('data/cshapes.js').feats.filter(inForce).map((f) => nm(f[0]));
  else if (y >= F.ohmFrom && y <= F.ohmTo) names = readBundle('data/hist-borders.js').feats.filter(inForce).map((f) => nm(f[0]));
  else if (y < F.ohmFrom) {
    const sheet = readBundle('data/hist-eras.js').snaps.find((x) => x.y === y);
    if (sheet) names = sheet.feats.map((f) => nm(f[0]));
  }
  if (!names || !want.every((n) => names.includes(n))) return null;
  return { names };
}

/* the generated list in js/showcase.js — what the spec reads instead of data/ */
const RA_BEGIN = '/* ⚠ GENERATED RECORD-ANSWERED — BEGIN (node scripts/landing.mjs --write; DO NOT EDIT) */';
const RA_END = '/* ⚠ GENERATED RECORD-ANSWERED — END */';
export const recordAnswered = () => SHOWCASE.filter((s) => recordNamesFor(s)).map((s) => s.id);
function writeRecordAnswered(ids) {
  const p = join(ROOT, 'js/showcase.js'); const t = readFileSync(p, 'utf8'); const eol = t.includes('\r\n') ? '\r\n' : '\n';
  const a = t.indexOf(RA_BEGIN), b = t.indexOf(RA_END);
  if (a < 0 || b < 0) throw new Error('landing: the RECORD-ANSWERED markers are gone from js/showcase.js');
  writeFileSync(p, t.slice(0, a + RA_BEGIN.length) + eol + 'export const RECORD_ANSWERED = ' + JSON.stringify(ids) + ';' + eol + t.slice(b));
}

/* ── the captured examples, held to their intent ──────────────────────────────────────────────── */
/* ONE reading of «does this captured link say what its intent says, and nothing more» — the examples and the
   tour steps are both held to it (an intent is { view, base, at, layers }) */
export function linkProblems(id, s, hash) {
  const bad = [];
  const q = new URLSearchParams(String(hash).replace(/^#/, ''));
  const extra = [...q.keys()].filter((k) => !['v', 'l', 'tt', 'sat'].includes(k));
  if (extra.length) bad.push(id + ': the link carries state the intent does not declare: ' + extra.join(', '));
  const v = String(q.get('v') || '').split(',');
  const near = (a, b, tol) => Math.abs(+a - +b) <= tol;
  if (!(near(v[0], s.view.lng, 1e-4) && near(v[1], s.view.lat, 1e-4) && near(v[2], s.view.zoom, 0.005))) bad.push(id + ': the link\'s camera ' + v.slice(0, 3).join(',') + ' is not the declared view');
  if (v[5] !== s.view.proj) bad.push(id + ': the link\'s projection ' + v[5] + ' is not ' + s.view.proj);
  if ((q.get('sat') === '1') !== (s.base === 'sat')) bad.push(id + ': the link\'s base map is not ' + s.base);
  const l = (q.get('l') || '').split(',').filter(Boolean).sort().join(',');
  if (l !== [...s.layers].sort().join(',')) bad.push(id + ': the link\'s layers «' + l + '» are not the declared «' + s.layers.join(',') + '»');
  if ((q.get('tt') || null) !== s.at) bad.push(id + ': the link\'s date ' + q.get('tt') + ' is not ' + s.at);
  return bad;
}

/* (classroom-tours) the tours, held to their declarations: every step resolves (an `example` step names an
   example that is SHOWN — a withheld one would open differently from its words), carries its words in both
   languages, and an own step's captured link says what its intent says (linkProblems, the examples' rule) */
export function tourProblems(captured = CAPTURED_STEPS) {
  const bad = [];
  const shared = new Set(sharedIds());
  const tourIds = new Set(), stepIds = new Set(SHOWCASE.map((s) => s.id).concat(WITHHELD.map((s) => s.id)));
  const own = new Set();
  const tuple = (who, f, v) => [0, 1].forEach((i) => { if (!(Array.isArray(v) && String(v[i] || '').trim())) bad.push(who + ': ' + f + ' has no ' + ['en', 'jp'][i] + ' text'); });
  for (const tour of TOURS) {
    if (tourIds.has(tour.id)) bad.push(tour.id + ': duplicate tour id');
    tourIds.add(tour.id);
    tuple(tour.id, 'title', tour.title); tuple(tour.id, 'blurb', tour.blurb);
    for (const c of tour.curriculum || []) if (!CURRICULUM[c]) bad.push(tour.id + ': unknown curriculum key ' + c);
    if (!(tour.steps && tour.steps.length >= 2)) bad.push(tour.id + ': a tour has at least two steps');
    if (!tourCover(tour)) bad.push(tour.id + ': no step is an example, so the tour has no picture for the teacher page');
    (tour.steps || []).forEach((st, i) => {
      const who = tour.id + ' step ' + (i + 1);
      tuple(who, 'say', st.say); tuple(who, 'ask', st.ask);
      if (st.example) {
        if (!SHOWCASE.some((s) => s.id === st.example)) bad.push(who + ': names «' + st.example + '», which is not a shown example' + (WITHHELD.some((w) => w.id === st.example) ? ' (it is withheld)' : ''));
        return;
      }
      if (!st.id) { bad.push(who + ': an own step needs an id'); return; }
      if (stepIds.has(st.id)) bad.push(who + ': the id ' + st.id + ' is already an example or another step');
      stepIds.add(st.id); own.add(st.id);
      tuple(who, 'title', st.title);
      for (const id of st.layers || []) if (!shared.has(id)) bad.push(who + ': ' + id + ' is not a layer a link can carry (js/layer-manifest.js share)');
      const c = captured[st.id];
      if (!c || !c.hash) { bad.push(who + ' (' + st.id + '): not captured — run node scripts/showcase-capture.mjs --only ' + st.id); return; }
      bad.push(...linkProblems(st.id, st, c.hash));
    });
  }
  for (const id of Object.keys(captured)) if (!own.has(id)) bad.push(id + ': a captured tour step that is no longer declared');
  return bad;
}

export function showcaseProblems(captured = CAPTURED) {
  const bad = [];
  const ids = new Set();
  const shared = new Set(sharedIds());
  for (const s of SHOWCASE) {
    if (ids.has(s.id)) bad.push(s.id + ': duplicate id');
    ids.add(s.id);
    for (const f of ['title', 'blurb', 'question']) [0, 1].forEach((i) => { if (!(Array.isArray(s[f]) && String(s[f][i] || '').trim())) bad.push(s.id + ': ' + f + ' has no ' + ['en', 'jp'][i] + ' text'); });
    for (const c of s.curriculum || []) if (!CURRICULUM[c]) bad.push(s.id + ': unknown curriculum key ' + c);
    for (const id of s.layers) if (!shared.has(id)) bad.push(s.id + ': ' + id + ' is not a layer a link can carry (js/layer-manifest.js share)');
    const c = captured[s.id];
    if (!c) { bad.push(s.id + ': not captured — run node scripts/showcase-capture.mjs'); continue; }
    if (!existsSync(join(ROOT, c.image))) bad.push(s.id + ': ' + c.image + ' is missing');
    if (!c.card || !existsSync(join(ROOT, c.card))) bad.push(s.id + ': the share card picture is missing — run node scripts/showcase-capture.mjs');
    else { const z = jpegSize(c.card); if (z.width !== 1200 || z.height !== 630) bad.push(s.id + ': the share card is ' + z.width + '×' + z.height + ', not the 1200×630 Open Graph asks for'); }
    bad.push(...linkProblems(s.id, s, c.hash));
  }
  for (const w of WITHHELD) if (!String(w.withheld).trim()) bad.push(w.id + ': withheld without a reason');
  const kept = new Set(WITHHELD.map((w) => w.id));
  for (const id of Object.keys(captured)) if (!ids.has(id) && !kept.has(id)) bad.push(id + ': captured but no longer declared');
  if (!captured[HERO_EXAMPLE]) bad.push('the hero example ' + HERO_EXAMPLE + ' is not captured');
  return bad;
}

/* ── main ─────────────────────────────────────────────────────────────────────────────────────── */
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const mode = process.argv.includes('--write') ? 'write' : process.argv.includes('--facts') ? 'facts' : 'check';
  const F = facts();
  if (mode === 'facts') { console.log(JSON.stringify(F, null, 2)); process.exit(0); }
  const bad = [...showcaseProblems(), ...tourProblems()];
  const out = outputs(F);
  /* the share directories are the generator's own: a page there that it no longer writes (an example
     withdrawn or withheld) is stale, and a stale share page is a card for a map nobody vouches for */
  const stale = LANGS.flatMap((L) => { const d = join(ROOT, shareDir(L)); return existsSync(d) ? readdirSync(d).map((n) => shareDir(L) + n).filter((rel) => !(rel in out)) : []; });
  const answered = recordAnswered();
  if (mode === 'write') {
    writeRecordAnswered(answered);
    for (const rel of stale) rmSync(join(ROOT, rel));
    for (const [rel, body] of Object.entries(out)) { mkdirSync(dirname(join(ROOT, rel)), { recursive: true }); writeFileSync(join(ROOT, rel), body); }
    console.log('landing: wrote ' + Object.keys(out).join(', '));
  } else {
    for (const [rel, body] of Object.entries(out)) {
      const p = join(ROOT, rel);
      /* compared with line endings normalised: the checkout may be CRLF, the generator writes LF */
      if (!existsSync(p)) bad.push(rel + ' is missing — run node scripts/landing.mjs --write');
      else if (readFileSync(p, 'utf8').replace(/\r\n/g, '\n') !== body) bad.push(rel + ' differs from what scripts/landing.mjs generates — run --write');
    }
    for (const rel of stale) bad.push(rel + ' is not generated any more — run --write (it removes it)');
    if (JSON.stringify(RECORD_ANSWERED) !== JSON.stringify(answered)) bad.push('js/showcase.js RECORD_ANSWERED says ' + JSON.stringify(RECORD_ANSWERED) + ', the record says ' + JSON.stringify(answered) + ' — run --write');
  }
  if (bad.length) { console.error('landing: ' + bad.length + ' problem(s)\n  ' + bad.join('\n  ')); process.exit(1); }
  if (mode === 'check') console.log('landing: ' + Object.keys(out).length + ' generated files in step · ' + SHOWCASE.length + ' examples and ' + TOURS.length + ' tours held to their intent');
}
