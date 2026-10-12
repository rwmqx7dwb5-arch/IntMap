#!/usr/bin/env node
/* ============================================================================
 *  IntMap · POLITY PAGES — «Mongol Empire map»: one entry page per polity the map draws, through its whole life   (polity-pages)
 * ----------------------------------------------------------------------------
 *  「検索・SNS から新しい読者が流入する、実データから自動生成され続ける資産」 (2026-10-13, 第 4 波 マーケティング).
 *  The most common way people look for a historical map is by a POLITY: «Mongol Empire map», «Roman Empire at its
 *  height», «オスマン帝国 最大版図». IntMap already answers that question in the app — «Rise and fall» (js/polity-arc.js,
 *  data/polity-arcs.json: 2,112 polities the dated records draw, each with the area drawn under its name at every instant
 *  the records change it) — but only behind the app's fragment, which no search engine and no link preview reaches. The
 *  entry pages by region (scripts/history-pages.mjs), by year (scripts/year-pages.mjs) and by day (on-this-day) do not
 *  answer it: none of them follows ONE polity across time. This writes, into dist/ when the site is built:
 *    · history/polities/<slug>/ and ja/history/polities/<slug>/ — for each polity the DATED records draw (the app's own
 *      rule, js/polity-arc.js `largest`): when the map begins and stops drawing it (and whether that edge is the polity's
 *      or a record's), its drawn area year by year as the app's own chart (`chartSvg`), the year that area is largest,
 *      the records that draw it with their licences, the Wikidata items they link, the other names linked to the same
 *      item, the year pages of its life, the «on this day» days on which the border record begins / stops drawing it,
 *      and links that open the map in its largest, first and last year on its own box;
 *    · history/polities/<slug>/card.png — the page's link card: the map on 1 July of the year the shape is largest, the
 *      polity filled among every outline drawn that day, the year in figures (scripts/lib/page-card.mjs drawPolityCard);
 *    · history/polities/ and ja/history/polities/ — every polity, by the century the map first draws it, largest first;
 *    · sitemap-polities.xml, joined by sitemap-index.xml (scripts/history-pages.mjs writes the index).
 *  They live under history/ because they are the same family — the counter already counts history/<a>/<b>/ as the entry
 *  `history` (supabase/functions/usage-count/shape.js SITE_PAGES), and Privacy §1 already names those pages.
 *  `--queue` prints «<polity> on the map» post drafts, one per page (nothing is posted from here).
 *
 *  ⚠ THE PAGES STATE ONLY WHAT THE MAP DRAWS (.agents/rules/historical-verification.md). Every fact is read from the index
 *  through the reader the app's sheet uses (js/polity-arc.js describe / valueAt / related / chartSvg — exported for this,
 *  never copied), and the card from the map's own code (scripts/history-pages.mjs mapReader). An area is the area of the
 *  drawn shape, never a claim about control; an edge that is a record's begins or hand-over is said to be one.
 *  ⚠ BUILT, NOT COMMITTED — the reason scripts/history-pages.mjs gives («WHY THEY ARE BUILT, NOT COMMITTED»).
 *
 *    node scripts/polity-pages.mjs --out <dir>      write the pages, the cards and the sitemap into <dir>
 *    node scripts/polity-pages.mjs --list           print every polity's page path; write nothing
 *    node scripts/polity-pages.mjs --queue [--only mongol-empire,ottoman-empire]   print the post drafts; send nothing
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, renameSync, rmSync, utimesSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Worker, isMainThread, workerData, parentPort, threadId } from 'node:worker_threads';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TEXT } from './polity-pages-text.mjs';
import { TEXT as HISTORY_TEXT } from './history-pages-text.mjs';
import { SITE_TOKEN } from './site-url.mjs';
import { LANGS, HUB as HISTORY_HUB, shell, esc, fill, breadcrumbLd, isoDay, yearWords, slugOf } from './history-pages.mjs';
import { YEAR_HUB, july1, partsOfTier, recordOf, chooseYears } from './year-choice.mjs';
import { POLITY_HUB, POLITY_SITEMAP, slugBase, assignSlugs, readIndex } from './polity-choice.mjs';
export { POLITY_HUB, POLITY_SITEMAP, slugBase, assignSlugs, readIndex };   /* the addresses live in scripts/polity-choice.mjs (imported by the other generators without a cycle) */
import { eraOf, eraWords, isoYear } from './year-pages.mjs';
import { OTD_HUB, dayPath, model as otdModel, CHANNELS, xWeight } from './on-this-day-pages.mjs';
import { siteUrl } from '../supabase/functions/_shared/site-origin.js';
import { campaignOf } from '../supabase/functions/usage-count/shape.js';
import { encode } from '../js/map-state.js';
import * as OTD from '../js/on-this-day.js';
import { describe, valueAt, related, chartSvg, largest } from '../js/polity-arc.js';
import { DATED } from './build-polity-arcs.mjs';
import { CARD, CARD_FILE } from './lib/page-card.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const polityPath = (slug, L) => L.dir + POLITY_HUB + slug + '/';
export const hubPath = (L) => L.dir + POLITY_HUB;
export const cardPath = (slug) => POLITY_HUB + slug + '/' + CARD_FILE;

/* ══ THE MODEL ═════════════════════════════════════════════════════════════════════════════════════ */


/** the «on this day» record's border events, by the English name of the polity they name: [{ d, md, kind }] */
function otdByName(otd) {
  const by = new Map();
  for (const list of Object.values(otd.days || {})) for (const ev of list) {
    if (ev.src === 'wars') continue;
    for (const kind of ['appeared', 'ended', 'redrawn']) for (const p of ev[kind] || []) {
      if (!by.has(p.en)) by.set(p.en, []);
      by.get(p.en).push({ d: ev.d, md: OTD.mdOf(ev.d), kind, maybeYearOnly: !!ev.maybeYearOnly });
    }
  }
  for (const l of by.values()) l.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return by;
}

/**
 * @param {{ only?: string[], years?: number[] }} [opt]  a subset of the pages, by address (for the checks and --queue);
 *   the addresses and the year pages are always worked out over the whole index. `years`: the year pages' years, when the
 *   caller already has them (else they are chosen here, as scripts/year-pages.mjs chooses them).
 */
export async function model(opt = {}) {
  const idx = readIndex();
  const all = largest(idx, Infinity);
  const slugs = assignSlugs(idx, all);
  const otd = JSON.parse(readFileSync(join(ROOT, OTD.INDEX_PATH), 'utf8'));
  let years = opt.years;
  if (!years) {
    const { mapReader } = await import('./history-pages.mjs');
    years = (await chooseYears(await mapReader(), otd)).years;
  }
  const days = new Set(otdModel(otd).days);
  const otdNames = otdByName(otd);
  const want = opt.only ? new Set(opt.only) : null;
  const pages = [];
  for (const arc of all) {
    const slug = slugs.get(arc);
    if (want && !want.has(slug)) continue;
    const D = describe(idx, arc);
    const drawnIn = (y) => { const v = valueAt(idx, arc, y); return !!(v && v.recs.some((r) => DATED.includes(r))); };
    pages.push({
      arc, slug, D,
      years: years.filter((y) => y >= D.first.y && (D.last.y == null || y <= D.last.y) && drawnIn(y)),
      days: (otdNames.get(arc.n) || []).filter((e) => e.md && days.has(e.md)),
    });
  }
  if (want) for (const s of want) if (!pages.some((p) => p.slug === s)) throw new Error('polity-pages: no polity has the address ' + s);
  return { idx, all, slugs, pages };
}

/* ══ RENDER ══════════════════════════════════════════════════════════════════════════════════════ */
const nameOf = (arc, lang) => (lang === 'jp' && arc.j ? arc.j : arc.n);
const km2Words = (km, L) => (km < 1 ? '<1' : km.toLocaleString(L.intl, { maximumSignificantDigits: 3 }));
const spanWords = (D, lang) => {
  const a = yearWords(D.first.y, lang), b = yearWords(D.last.y, lang);
  return a === b ? a : a + (lang === 'jp' ? '〜' : '–') + b;
};
const recWords = (rec, T) => T.records[rec] || rec;
/** the stretches of years the map draws the name in — a 0 point closes one (data/polity-arcs.json), and a polity still drawn
 *  runs to the last year the records cover: [{ a, b }] with both years drawn */
export function stretchesOf(D, to) {
  const out = [];
  let open = null;
  for (const p of D.points) {
    if (p.km > 0 && open == null) open = p.y;
    else if (!(p.km > 0) && open != null) { out.push({ a: open, b: p.y - 1 }); open = null; }
  }
  if (open != null) out.push({ a: open, b: to });
  return out;
}
/** the camera the map opens on for a polity: its box at its largest, fitted the way an «on this day» border event is fitted
 *  to the polities it names (js/on-this-day.js viewOf — the same fit and the same closest zoom; one camera rule) */
const viewFor = (bb) => OTD.viewOf({ src: 'polity', appeared: [{ bb }] });
const mapLink = (arc, D, y, lang) => 'index.html' + encode({ view: viewFor(D.peak.bb || arc.bb), time: { at: isoDay(y) }, title: nameOf(arc, lang) + ' · ' + yearWords(y, lang) });

/** the words every part of a page fills its placeholders from */
function wordsOf(p, L) {
  const lang = L.key, D = p.D;
  return { name: nameOf(p.arc, lang), first: yearWords(D.first.y, lang), last: yearWords(D.last.y, lang), peak: yearWords(D.peak.y, lang),
    km: km2Words(D.peak.km, L), span: spanWords(D, lang) };
}
function edgeWords(D, side, T, lang, dayFrom) {
  const x = D[side];
  const y = yearWords(x.y, lang);
  if (x.edge === 'today') return fill(T.edge.today, { y });
  if (x.edge === 'reach' && side === 'first') return fill(T.edge.reach, { y, rec: recWords(x.rec, T) });
  if (x.edge === 'reach') return fill(T.edge.reachLast, { next: yearWords(x.y + 1, lang), rec: recWords(x.rec, T), by: recWords(x.by, T) });
  const day = x.y >= dayFrom;   /* read on 1 July of every year from here: the edge lies between two readings */
  return fill(side === 'first' ? (day ? T.edge.statedDay : T.edge.stated) : (day ? T.edge.statedLastDay : T.edge.statedLast), { y });
}

function renderPolity(M, p, L) {
  const T = TEXT[L.key], HT = HISTORY_TEXT[L.key], lang = L.key, D = p.D, arc = p.arc;
  const W = wordsOf(p, L);
  const title = fill(T.title, W);
  const description = fill(D.last.edge === 'today' ? T.descriptionToday : T.description, W);
  const crumbs = [
    { name: HT.breadcrumbHistory, path: L.dir + HISTORY_HUB },
    { name: T.crumb, path: hubPath(L) },
    { name: W.name, path: polityPath(p.slug, L) },
  ];
  const card = SITE_TOKEN + cardPath(p.slug);
  const sameAs = (arc.q || []).map((q) => 'https://www.wikidata.org/wiki/' + q);
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description, url: SITE_TOKEN + polityPath(p.slug, L), inLanguage: L.tag,
      isPartOf: { '@type': 'WebSite', name: 'IntMap', url: SITE_TOKEN }, primaryImageOfPage: card,
      about: { '@type': 'Thing', name: W.name, ...(lang === 'jp' && arc.j ? { alternateName: arc.n } : {}), ...(sameAs.length ? { sameAs } : {}) },
      mainEntity: { '@type': 'Map', name: fill(T.h1, W), description: fill(T.cardAlt, W), image: card, url: SITE_TOKEN + mapLink(arc, D, D.peak.y, lang),
        temporalCoverage: isoYear(D.first.y) + '/' + isoYear(D.last.y), isAccessibleForFree: true, inLanguage: L.tag,
        isBasedOn: D.records.map((r) => M.idx.src[r]).filter(Boolean) } },
    breadcrumbLd(crumbs),
  ];
  const chart = chartSvg(M.idx, arc, D, lang, null);
  const stretches = stretchesOf(D, M.idx.instants.to);
  const fact = (k, v) => `      <dt>${esc(T.facts[k])}</dt><dd>${v}</dd>`;
  const wd = (arc.q || []).map((q) => `<a href="https://www.wikidata.org/wiki/${esc(q)}" data-wikidata="${esc(q)}">${esc(q)}</a>`).join(' · ');
  const others = related(M.idx, arc, lang);
  const linkOther = (o, up) => { const s = M.slugs.get(o.arc); const D2 = describe(M.idx, o.arc); const n = esc(nameOf(o.arc, lang)) + ' <span class="pp-span">' + esc(spanWords(D2, lang)) + '</span>'; return s ? `<a href="${up}${polityPath(s, L)}" data-polity="${esc(s)}">${n}</a>` : `<span class="pp-plain">${n}</span>`; };
  const body = (up) => `  <section class="lp-hero lp-hero-t hp-hero">
    <div class="lp-hero-text">
      <h1>${esc(fill(T.h1, W))}</h1>
      <p class="lp-lede">${esc(fill(T.lede, W))}</p>
      <div class="lp-cta">
        <a class="lp-btn" href="${esc(up + mapLink(arc, D, D.peak.y, lang))}" data-polity-map="peak">${esc(fill(T.ctaPeak, W))}</a>
        <a class="lp-btn lp-btn-2" href="${up}${hubPath(L)}">${esc(T.ctaHub)}</a>
      </div>
    </div>
    <figure class="otd-card"><img src="${up}${cardPath(p.slug)}" width="${CARD.width}" height="${CARD.height}" alt="${esc(fill(T.cardAlt, W))}" decoding="async">
      <figcaption class="lp-note">${esc(fill(T.cardCaption, W))}</figcaption></figure>
  </section>

  <section class="lp-sec" id="facts">
    <h2>${esc(T.factsH2)}</h2>
    <dl class="pp-facts">
${fact('first', esc(W.first) + `<span class="pp-edge">${esc(edgeWords(D, 'first', T, lang, M.idx.instants.dayFrom))}</span>`)}
${fact('last', esc(W.last) + `<span class="pp-edge">${esc(edgeWords(D, 'last', T, lang, M.idx.instants.dayFrom))}</span>`)}
${stretches.length > 1 ? fact('stretches', esc(fill(T.stretchesValue, { n: stretches.length.toLocaleString(L.intl), list: stretches.map((x) => spanWords({ first: { y: x.a }, last: { y: x.b } }, lang)).join(lang === 'jp' ? '、' : ', ') }))) + '\n' : ''}${fact('peak', esc(fill(T.peakValue, W)))}
${fact('changes', esc(fill(T.changesValue, { n: D.points.filter((x) => x.km > 0).length.toLocaleString(L.intl) })))}
${fact('records', esc(D.records.map((r) => recWords(r, T)).join(' · ')))}
${wd ? fact('wikidata', wd) + '\n' : ''}    </dl>
    <p class="hp-chips"><a href="${esc(up + mapLink(arc, D, D.first.y, lang))}" data-polity-map="first">${esc(fill(T.ctaFirst, W))}</a> <a href="${esc(up + mapLink(arc, D, D.last.y, lang))}" data-polity-map="last">${esc(fill(T.ctaLast, W))}</a></p>
  </section>

  <section class="lp-sec" id="chart">
    <h2>${esc(T.chartH2)}</h2>
    <p class="lp-sub">${esc(T.chartSub)}</p>
    <figure class="pp-chart" data-points="${D.points.length}">${chart}
      <figcaption class="pa-key">${D.records.map((r) => `<span><i class="pa-${esc(r)}"></i>${esc(recWords(r, T))}</span>`).join(' ')}</figcaption></figure>
  </section>
${p.years.length ? `
  <section class="lp-sec" id="years">
    <h2>${esc(T.yearsH2)}</h2>
    <p class="lp-sub">${esc(T.yearsSub)}</p>
    <p class="hp-chips">${p.years.map((y) => `<a href="${up}${L.dir}${YEAR_HUB}${slugOf(y)}/" data-year="${y}">${esc(yearWords(y, lang))}</a>`).join(' ')}</p>
  </section>
` : ''}${p.days.length ? `
  <section class="lp-sec" id="on-this-day">
    <h2>${esc(T.otdH2)}</h2>
    <p class="lp-sub">${esc(T.otdSub)}</p>
    <ol class="otd-list">
${p.days.map((e) => `      <li class="otd-ev"><span class="otd-y">${esc(e.d.slice(0, e.d.lastIndexOf('-', e.d.length - 4)))}</span><div><p class="otd-t">${esc(T.otdKinds[e.kind])}</p><p class="otd-s">${esc(e.d)}${e.maybeYearOnly ? ' · ' + esc(T.otdYearOnly) : ''}</p><a class="lp-open" href="${up}${dayPath(e.md, L)}" data-otd="${esc(e.d)}">${esc(OTD.dayWords(e.md, lang))} →</a></div></li>`).join('\n')}
    </ol>
  </section>
` : ''}${others.length ? `
  <section class="lp-sec" id="related">
    <h2>${esc(T.relatedH2)}</h2>
    <p class="lp-sub">${esc(T.relatedSub)}${others.some((o) => o.why === 'name') && T.relatedJpSub ? ' ' + esc(T.relatedJpSub) : ''}</p>
    <p class="hp-chips pp-related">${others.map((o) => linkOther(o, up)).join(' ')}</p>
  </section>
` : ''}
  <section class="lp-sec" id="source">
    <h2>${esc(T.sourceH2)}</h2>
${D.records.map((r) => `    <p>${esc(fill(T.sourceRecord, { src: M.idx.src[r] || r }))}</p>`).join('\n')}
${T.method.map((m) => `    <p class="lp-note">${esc(fill(m, { ohmFrom: String(M.idx.instants.dayFrom), csTo: String(M.idx.instants.to) }))}</p>`).join('\n')}
    <p class="hp-chips"><a href="${up}${hubPath(L)}">${esc(T.nav.hub)}</a> <a href="${up}${L.dir}${YEAR_HUB}">${esc(T.nav.years)}</a> <a href="${up}${L.dir}${HISTORY_HUB}">${esc(T.nav.history)}</a> <a href="${up}${L.dir}${OTD_HUB}">${esc(T.nav.onThisDay)}</a></p>
    <p><a class="lp-open" href="${up}sources.html">${esc(T.sourcesLink)} →</a></p>
  </section>`;
  const image = { path: cardPath(p.slug), width: CARD.width, height: CARD.height, alt: fill(T.cardAlt, W) };
  return shell({ ...M, image }, L, { path: polityPath(p.slug, L), pathFor: (l) => polityPath(p.slug, l), title, description, crumbs, ld, body });
}

/* ⚠ (no-ad-hoc-hardcoding §4) display only: how many of the largest the hub names above the centuries — a screenful on a
   phone (observed 2026-10-13); lapses: never, every polity is listed again in its century; canonical: here. */
const LARGEST_SHOWN = 24;
function renderHub(M, L) {
  const T = TEXT[L.key], HT = HISTORY_TEXT[L.key], lang = L.key;
  const pages = M.pages;
  const firsts = pages.map((p) => p.D.first.y), lasts = pages.map((p) => p.D.last.y);
  const W = { n: pages.length.toLocaleString(L.intl), first: yearWords(Math.min(...firsts), lang), last: yearWords(Math.max(...lasts), lang) };
  const title = fill(T.hubTitle, W), description = fill(T.hubDescription, W);
  const crumbs = [{ name: HT.breadcrumbHistory, path: L.dir + HISTORY_HUB }, { name: T.crumb, path: hubPath(L) }];
  /* by the century (or millennium) the map first draws each, oldest first; within one, largest drawn first (the index's order) */
  const groups = new Map();
  for (const p of [...pages].sort((a, b) => a.D.first.y - b.D.first.y)) {
    const e = eraOf(p.D.first.y), key = e.k + e.n;
    if (!groups.has(key)) groups.set(key, { e, pages: [] });
    groups.get(key).pages.push(p);
  }
  for (const g of groups.values()) g.pages.sort((a, b) => b.D.peak.km - a.D.peak.km);
  const chip = (p, up) => `<a href="${up}${polityPath(p.slug, L)}" data-polity="${esc(p.slug)}">${esc(nameOf(p.arc, lang))} <span class="pp-span">${esc(fill(T.hubItem, { span: spanWords(p.D, lang), peak: yearWords(p.D.peak.y, lang) }))}</span></a>`;
  const body = (up) => `  <section class="lp-hero lp-hero-t hp-hero">
    <div class="lp-hero-text">
      <h1>${esc(title)}</h1>
      <p class="lp-lede">${esc(fill(T.hubLede, W))}</p>
    </div>
  </section>
  <section class="lp-sec" id="largest">
    <h2>${esc(T.largestH2)}</h2>
    <p class="hp-chips pp-list">${pages.slice(0, LARGEST_SHOWN).map((p) => chip(p, up)).join(' ')}</p>
  </section>
  <section class="lp-sec yp-eras">
${[...groups.entries()].map(([key, g]) => `    <div class="yp-era" data-era="${esc(key)}"><h2>${esc(eraWords(g.e, lang))}</h2><p class="hp-chips pp-list">${g.pages.map((p) => chip(p, up)).join(' ')}</p></div>`).join('\n')}
  </section>
  <p class="hp-chips"><a href="${up}${L.dir}${YEAR_HUB}">${esc(T.nav.years)}</a> <a href="${up}${L.dir}${HISTORY_HUB}">${esc(T.nav.history)}</a> <a href="${up}${L.dir}${OTD_HUB}">${esc(T.nav.onThisDay)}</a></p>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description, url: SITE_TOKEN + hubPath(L), inLanguage: L.tag,
    isPartOf: { '@type': 'WebSite', name: 'IntMap', url: SITE_TOKEN } }, breadcrumbLd(crumbs)];
  /* the hub has no card of its own: it names the site's picture, as the other hubs do */
  return shell(M, L, { path: hubPath(L), pathFor: (l) => hubPath(l), title, description, crumbs, ld, body });
}

/** path (relative to the site root) → file body, for every page and the sitemap (the cards are drawn by drawCards) */
export async function outputs(M) {
  const { siteImage, sitemap } = await import('./history-pages.mjs');
  M.image = M.image || siteImage();
  const out = {};
  for (const L of LANGS) {
    for (const p of M.pages) out[polityPath(p.slug, L) + 'index.html'] = renderPolity(M, p, L);
    out[hubPath(L) + 'index.html'] = renderHub(M, L);
  }
  out[POLITY_SITEMAP] = sitemap([(l) => hubPath(l), ...M.pages.map((p) => (l) => polityPath(p.slug, l))], 'scripts/polity-pages.mjs');
  return out;
}

/* ══ THE CARDS ═════════════════════════════════════════════════════════════════════════════════════
   A card needs the shapes the map draws on 1 July of the polity's largest year, so it is drawn by the map's own code
   (mapReader), one read per distinct year, every polity largest in that year drawn from the one read.
   ⚠ BUILT ONCE PER CONTENT — the way the build keeps its other heavy derived files (scripts/build-hist-tiles.mjs hvt-cache):
     outside the checkout, beside the data store (scripts/data-assets.mjs storeRoot + «-cards»: %LOCALAPPDATA%\intmap-data-cards
     on Windows, ~/.cache/intmap-data-cards elsewhere — see cardStoreOf for why beside), kept between CI runs by its own
     actions/cache entry (.github/workflows/ci.yml), one file per card named by the digest of what its pixels depend on: the drawing code (scripts/lib/page-card.mjs drawerKey), every
     outline drawn that day, the polity's own outline, the frame and the figures. Written beside its name and renamed onto it,
     so two builds never read half a card. A store that cannot be used (inside OneDrive) is no cache, not an error.
   ⚠ IN WORKER THREADS, one per available CPU less one for the build (os.availableParallelism — the machine's count, not a
     number written here), never more than there are years nor than the free memory holds (READER_BYTES each). Each worker instantiates its own map (mapReader installs a
     browser's globals on ITS thread's global, which is why the map never runs on the build's own thread) and takes the next
     year from a queue, so a worker drawing small polities does not wait on one drawing the Russian Empire. */
const partsOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
/** the polygons the map draws under a polity's name on 1 July of year `y`, as the index measured them (the outlines the map
 *  names it on, drawn by a dated record, not a description), and every outline drawn that day — from one read `r` of the map */
export function shapesAt(r, name) {
  const parts = partsOfTier(r.tier);
  const polity = [];
  r.fc.features.forEach((f, i) => { const pr = f.properties || {}; if (r.labels.en[i] === name && !pr._desc && DATED.includes(recordOf(pr, parts))) polity.push(...partsOf(f.geometry)); });
  return { polity, context: r.fc.features.map((f) => partsOf(f.geometry)) };
}
/** the card cache's directory, or null when the store cannot be used */
export async function cacheDir() {
  try { const { storeRoot } = await import('./data-assets.mjs'); return cardStoreOf(storeRoot()); } catch (_) { return null; }
}
/** the card store beside a data store: «<store>-cards». Beside, not inside — the data store is what
 *  .github/actions/data-assets restores and saves under its own key, and the cards have their own (.github/workflows/ci.yml);
 *  two caches over one path would each save the other's files. tests/polity-pages-checks.test.mjs ⑧ reads ci.yml against this. */
export const cardStoreOf = (store) => store.replace(/[\\/]+$/, '') + '-cards';
/** THE ONE RULE FOR WHAT THE CARD STORE KEEPS: after a build that drew every page's card, a card file (or a half-written one)
 *  older than that build's start was not asked for and is removed. A hit touches its file (drawYear), so a card in use is never
 *  older than the build that used it. Run by drawCards on this machine and on CI alike (CI saves the store after the build).
 *  ⚠ (no-ad-hoc-hardcoding §4) SLACK_MS: file systems keep mtimes to 2 s at the coarsest (FAT; NTFS and ext4 are finer) —
 *  a card touched in the build's first instant is never taken for an old one. lapses: never; canonical: here.
 *  → the number of files removed */
const SLACK_MS = 2000;
export function pruneUnused(dir, startedAt) {
  if (!dir || !existsSync(dir)) return 0;
  let n = 0;
  for (const sub of readdirSync(dir, { withFileTypes: true })) {
    if (!sub.isDirectory()) continue;
    const d = join(dir, sub.name);
    for (const f of readdirSync(d)) {
      const path = join(d, f);
      try { if (statSync(path).mtimeMs < startedAt - SLACK_MS) { rmSync(path, { force: true }); n++; } } catch (_) { /* another build removed it */ }
    }
  }
  return n;
}
/** the jobs of one year — what a worker needs to draw that year's cards (the page model stays on the build's thread) */
const jobsOf = (M, y) => M.pages.filter((p) => p.D.peak.y === y).map((p) => ({ name: p.arc.n, file: cardPath(p.slug), box: p.D.peak.bb || p.arc.bb, label: yearWords(y, 'en') }));
/** the cache key of a card: the digest of everything its pixels depend on */
function digest(parts) {
  const h = createHash('sha256');
  for (const x of parts) h.update(typeof x === 'string' ? x : JSON.stringify(x)).update('\n');
  return h.digest('hex');
}
export const cardKey = (drawer, day, polity, box, label) => digest([drawer, day, digest(polity), JSON.stringify(box), label]);

/** one year's cards, on a thread that owns a map reader → { drawn, cached } */
async function drawYear(R, y, jobs, dir, cache, drawer) {
  const { drawPolityCard } = await import('./lib/page-card.mjs');
  const r = await R.labelsAt(july1(y));
  if (!r || r.modern || !r.fc) throw new Error('polity-pages: the map answered nothing for ' + isoDay(y));
  const day = digest(r.fc.features.map((f) => partsOf(f.geometry)));
  const n = { drawn: 0, cached: 0 };
  for (const j of jobs) {
    const { polity, context } = shapesAt(r, j.name);
    if (!polity.length) throw new Error('polity-pages: the map draws no «' + j.name + '» on ' + isoDay(y) + ', the year the index says it is largest');
    const path = join(dir, j.file);
    mkdirSync(dirname(path), { recursive: true });
    const key = cardKey(drawer, day, polity, j.box, j.label);
    const kept = cache ? join(cache, key.slice(0, 2), key + '.png') : null;
    if (kept && existsSync(kept)) {
      copyFileSync(kept, path); n.cached++;
      /* a hit marks the card as used (pruneUnused keeps what a build touched) */
      try { const now = new Date(); utimesSync(kept, now, now); } catch (_) { /* read-only store: still a hit */ }
      continue;
    }
    const png = await drawPolityCard({ box: j.box, polity, context, label: j.label });
    writeFileSync(path, png);
    n.drawn++;
    if (kept) {
      try {
        mkdirSync(dirname(kept), { recursive: true });
        const part = kept + '.' + process.pid + '-' + threadId + '-' + Date.now() + '.part';
        writeFileSync(part, png);
        try { renameSync(part, kept); } catch (e) { rmSync(part, { force: true }); if (!existsSync(kept)) throw e; /* another build put the same bytes there first */ }
      } catch (_) { /* a cache that cannot be written only makes the next build slower */ }
    }
  }
  return n;
}
/* ⚠ (no-ad-hoc-hardcoding §4) observation: 2026-10-13, one mapReader after reads in six eras (500 BC … 1950) grew a process's
   RSS from 67 MB to 798 MB. lapses: when the records the map loads grow or shrink; canonical: here. Measured, not a cap on CPUs. */
const READER_BYTES = 800e6;
/** draw every page's card into `dir` → { files, drawn, cached, workers, cache } */
export async function drawCards(M, dir) {
  const years = [...new Set(M.pages.map((p) => p.D.peak.y))].sort((a, b) => a - b);
  const startedAt = Date.now();
  const cache = await cacheDir();
  const { drawerKey } = await import('./lib/page-card.mjs');
  const drawer = await drawerKey();
  const os = await import('node:os');
  const cpus = (os.availableParallelism && os.availableParallelism()) || os.cpus().length;
  /* …and never more than the free memory holds: each worker carries a whole map */
  const k = Math.max(1, Math.min(years.length, cpus - 1, Math.floor(os.freemem() / READER_BYTES)));
  /* the years with the most cards first, so the queue ends on short jobs */
  const queue = [...years].sort((a, b) => jobsOf(M, b).length - jobsOf(M, a).length || a - b);
  const total = { drawn: 0, cached: 0 };
  await Promise.all(Array.from({ length: k }, () => new Promise((ok, fail) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { polityCards: true, dir, cache, drawer } });
    const next = () => { const y = queue.shift(); w.postMessage(y == null ? null : { y, jobs: jobsOf(M, y) }); };
    w.on('message', (m) => { if (!m.ready) { total.drawn += m.drawn; total.cached += m.cached; } next(); });
    w.on('error', fail);
    w.on('exit', (code) => (code ? fail(new Error('polity-pages: a card worker exited with ' + code)) : ok()));
  })));
  /* only a build that asked for every page knows which cards are unused (a subset — the checks, --only — removes nothing) */
  const pruned = cache && M.all && M.pages.length === M.all.length ? pruneUnused(cache, startedAt) : 0;
  return { files: M.pages.map((p) => cardPath(p.slug)), ...total, workers: k, cache, pruned };
}
/* a worker thread started by drawCards: its own map, then one year at a time until the queue sends null.
   Not a top-level await: scripts/history-pages.mjs imports this module back (the note at the foot of this file). */
if (!isMainThread && workerData && workerData.polityCards) (async () => {
  const { dir, cache, drawer } = workerData;
  const { mapReader } = await import('./history-pages.mjs');
  const R = await mapReader();
  parentPort.on('message', (m) => {
    if (!m) { parentPort.close(); return; }
    drawYear(R, m.y, m.jobs, dir, cache, drawer).then((n) => parentPort.postMessage(n), (e) => { throw e; });
  });
  parentPort.postMessage({ ready: true });
})();

export async function writeTo(dir, opt) {
  const M = await model(opt);
  const out = await outputs(M);
  for (const [rel, body] of Object.entries(out)) { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); }
  const cards = await drawCards(M, dir);
  return { model: M, files: Object.keys(out).concat(cards.files), cards };
}

/* ══ THE DRAFTS — «<polity> on the map», one post per page; a person approves and posts each ══════════════════
   Nothing leaves this machine from here (docs/marketing/README.md «承認が要ること»). The channels and X's weighting are the
   «on this day» drafts' (one list of where IntMap's owner posts). A polity page is an entry the app counts (shape.js
   SITE_PAGES 'history'), so the link carries utm tags; the picture is the page's own card. Every fact is the page's. */
export const POST_CAMPAIGN = 'rise-and-fall';
const X_MAX = 280;
export function draftsFor(M, p, site) {
  const out = [];
  for (const L of LANGS) {
    const T = TEXT[L.key];
    for (const ch of CHANNELS) {
      const link = site + polityPath(p.slug, L) + '?utm_source=' + ch + '&utm_medium=social&utm_campaign=' + POST_CAMPAIGN;
      const text = fill(T.post.x, { ...wordsOf(p, L), link });
      out.push({ slug: p.slug, lang: L.key, channel: ch, text, link, image: site + cardPath(p.slug), fits: ch !== 'x' || xWeight(text) <= X_MAX });
    }
  }
  return out;
}
function queueMarkdown(M, site) {
  const lines = ['# IntMap — 政体の盛衰: 投稿の下書き（承認待ち）', '',
    '> `node scripts/polity-pages.mjs --queue` が書いた。**投稿・予約・送信はしていない。** 1 行ずつ人が読み、承認したものだけを人が投稿する（docs/marketing/README.md）。', ''];
  for (const p of M.pages) {
    lines.push('## ' + nameOf(p.arc, 'jp') + '（' + p.arc.n + '）', '');
    for (const x of draftsFor(M, p, site)) lines.push('- [ ] 承認 · ' + x.channel + ' · ' + x.lang + (x.channel === 'x' ? ' · X 換算 ' + xWeight(x.text) + '/' + X_MAX + (x.fits ? '' : ' ⚠ 超過——人が縮める') : ''), '', '  ```', ...x.text.split('\n').map((s) => '  ' + s), '  ```', '  画像: ' + x.image, '');
  }
  return lines.join('\n');
}

/* the Vite plugin that runs this file is scripts/polity-choice.mjs polityPagesPlugin (vite.config.js imports that module, not this one) */

/* ── main ─────────────────────────────────────────────────────────────────────────────────────── */
const isMain = isMainThread && !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;   /* a card worker runs this file too */
/* not a top-level await: scripts/history-pages.mjs imports this module back for the sitemap index (the same note as there) */
if (isMain) (async () => {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const t0 = Date.now();
  if (arg('--out')) {
    const { model: M, files, cards: C } = await writeTo(resolve(arg('--out')));
    console.log('polity-pages: wrote ' + files.length + ' files (' + M.pages.length + ' polities × ' + LANGS.length + ' languages, and their cards: ' + C.drawn + ' drawn, ' + C.cached + ' from the cache' + (C.cache ? ', ' + C.pruned + ' unused removed' : ' (no cache)') + ', ' + C.workers + ' worker threads) into ' + arg('--out') + ' in ' + (Date.now() - t0) + ' ms');
  } else if (process.argv.includes('--queue')) {
    const M = await model(arg('--only') ? { only: arg('--only').split(',') } : {});
    for (const ch of CHANNELS) if (campaignOf('?utm_source=' + ch + '&utm_medium=social&utm_campaign=' + POST_CAMPAIGN).length !== 3) throw new Error('polity-pages: the tags for ' + ch + ' do not pass the counter\'s rule');
    process.stdout.write(queueMarkdown(M, siteUrl('')) + '\n');
  } else if (process.argv.includes('--list')) {
    const idx = readIndex(), all = largest(idx, Infinity), slugs = assignSlugs(idx, all);
    for (const a of all) console.log(polityPath(slugs.get(a), LANGS[0]) + '\t' + a.n);
    console.log('polity-pages: ' + all.length + ' polities');
  } else console.log('usage: node scripts/polity-pages.mjs --out <dir> | --list | --queue [--only <slug>,…]');
})().catch((e) => { console.error(e); process.exit(1); });
