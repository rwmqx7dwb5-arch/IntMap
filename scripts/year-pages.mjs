#!/usr/bin/env node
/* ============================================================================
 *  IntMap · YEAR PAGES — «World map in 1914»: one entry page per chosen year, with the world drawn   (history-year-pages)
 * ----------------------------------------------------------------------------
 *  「新しい価値・新しい読者・新しい流通」 (2026-10-07, 第 3 波). People search for a YEAR: «world map 1914», «1900年
 *  世界地図», «map of the world 1648». IntMap draws every one of those worlds and a search engine could see none of them:
 *  the map's state lives in the address's fragment, and the region pages (scripts/history-pages.mjs) list names but show
 *  no map. This writes, into dist/ when the site is built:
 *    · history/years/<year>/ and ja/history/years/<year>/ — for each chosen year: the world on 1 July of that year,
 *      DRAWN (history/years/<year>/world-map.svg, one picture for both languages, scripts/lib/world-svg.mjs) from the
 *      collection the map draws; the named polities with the record that draws each and its Wikidata item where the
 *      record links one; what changed since the previous chosen year; the events the one dated-events index places in
 *      that year (js/time-index.js yearOf — the year its date names, not a span that runs through it), each with its source; and the link that opens the map on that date;
 *    · history/years/ and ja/history/years/ — the years, by century;
 *    · sitemap-years.xml, joined by sitemap-index.xml (scripts/history-pages.mjs writes the index).
 *  They live under history/ because they are the same family — the counter already counts history/ as the entry
 *  `history` (supabase/functions/usage-count/shape.js SITE_PAGES), and Privacy §1 already names those pages.
 *
 *  ══ WHICH YEARS — A RULE OVER THE RECORDS, NOT A LIST ═══════════════════════════════════════════════
 *  `chooseYears` takes the union of three sets, each read from data, and every page says which of them chose it:
 *    ① SHEET   every year the historical-basemaps atlas drew a world sheet for (data/hist-eras.js `snaps`): the years
 *              its cartographers chose to draw the whole world at.
 *    ② TURN    the year-to-year changes of the records the map dates by year or by day (Cliopatria, OpenHistoricalMap,
 *              CShapes — NOT the nearest-sheet fill, whose «change» is the switch between two sheets), sampled on 1 July
 *              of every year from the year before those records begin to the last year CShapes covers, counted as the
 *              names begun plus the names ended; a year is chosen when its change is in the top TURN_SHARE of the
 *              non-zero changes. A year where the set of records itself changes (1689 OHM begins, 1886 CShapes begins…)
 *              is a SEAM between records, not a change in the world, and is never counted.
 *    ③ EVENT   every year of an event of a POLITY kind in the index's Wikidata events (`events`, the kinds the dashboard
 *              colours them by — EVENT_KINDS), up to the last year the border records cover.
 *  ⚠ THE PAGES STATE ONLY WHAT THE MAP DRAWS. Names, records, areas and the picture come from mapReader (the map's own
 *  js/time-borders.js, instantiated) — the rule .agents/rules/historical-verification.md asks for, and the one
 *  scripts/history-pages.mjs states. A rule the map changes changes these pages on the next build.
 *  ⚠ BUILT, NOT COMMITTED — the reason scripts/history-pages.mjs gives («WHY THEY ARE BUILT, NOT COMMITTED»).
 *
 *    node scripts/year-pages.mjs --out <dir>   write the pages, the pictures and the sitemap into <dir>
 *    node scripts/year-pages.mjs --years       print the chosen years and why; write nothing
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TEXT } from './year-pages-text.mjs';
import { YEAR_HUB, YEAR_SITEMAP, TURN_SHARE, EVENT_KINDS, july1, readBundle, partsOfTier, recordOf, chooseYears } from './year-choice.mjs';
export { YEAR_HUB, YEAR_SITEMAP, TURN_SHARE, EVENT_KINDS, chooseYears };
import { TEXT as HISTORY_TEXT } from './history-pages-text.mjs';
import { SITE_TOKEN } from './site-url.mjs';
import { LANGS, HUB as HISTORY_HUB, REGIONS, mapReader, collect, shell, esc, fill, breadcrumbLd, siteImage, partKm2In, pagePath as historyPagePath,
  regionView, isoDay, yearWords, slugOf, tierWords, sitemap } from './history-pages.mjs';
import { COUNTRY_HUB } from './country-pages.mjs';
import { OTD_HUB, dayPath, model as otdModel } from './on-this-day-pages.mjs';
import { encode } from '../js/map-state.js';
import * as OTD from '../js/on-this-day.js';
import { records, yearOf, eventName, eventDesc, dateWords, sourceOf } from '../js/time-index.js';
import { decodeNECountries, neCountriesPath } from '../js/ne-countries.js';
import { draw as drawWorld } from './lib/world-svg.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAP_FILE = 'world-map.svg';

export const yearPath = (y, L) => L.dir + YEAR_HUB + slugOf(y) + '/';
export const hubPath = (L) => L.dir + YEAR_HUB;
export const mapPath = (y) => YEAR_HUB + slugOf(y) + '/' + MAP_FILE;

/* ══ THE MODEL ═════════════════════════════════════════════════════════════════════════════════════ */
/* the whole-world region of the history pages (read when used — see YEAR_HUB on the import cycle) */
const world = () => REGIONS.find((r) => r.id === 'world');
const partsOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

/**
 * @param {{ years?: number[] }} [opt]  a subset of the chosen years (for the checks); the choice itself always runs whole
 */
export async function model(opt = {}) {
  const R = await mapReader();
  const B = R.bands;
  const idx = JSON.parse(readFileSync(join(ROOT, OTD.INDEX_PATH), 'utf8'));
  const choice = await chooseYears(R, idx);
  const years = opt.years ? choice.years.filter((y) => opt.years.includes(y)) : choice.years;
  const sheetYears = new Set(readBundle('data/hist-eras.js').snaps.map((s) => s.y));
  /* the history pages' runs of the world (their own model), so each year links the page that lists the same names */
  const H = await collect({ regions: ['world'] });
  const worldRuns = H.byRegion.get('world') || [];
  const ne = decodeNECountries(JSON.parse(gunzipSync(readFileSync(join(ROOT, neCountriesPath('110m')))).toString('utf8')));
  const land = ne.features.map((f) => f.geometry);
  const all = records(idx);
  const days = new Set(otdModel(idx).days);
  const worldBox = world().boxes[0];
  const out = [];
  for (const y of years) {
    const r = await R.labelsAt(july1(y));
    if (!r || r.modern || !r.fc) throw new Error('year-pages: the map answered nothing for ' + isoDay(y) + ' — a record did not load');
    const parts = partsOfTier(r.tier);
    const isSheet = sheetYears.has(y);
    const names = new Map();
    let unnamed = 0;
    const drawn = [];
    r.fc.features.forEach((f, i) => {
      const p = f.properties || {};
      const rec = recordOf(p, parts);
      const en = r.labels.en[i], jp = r.labels.jp[i];
      drawn.push({ geometry: f.geometry, name: en || '', pale: rec === 'sheet' && !isSheet });
      const km = partsOf(f.geometry).reduce((s, part) => s + partKm2In(part, worldBox), 0);
      if (!en) { unnamed++; return; }
      let row = names.get(en);
      if (!row) { row = { en, jp: jp && jp !== en ? jp : null, km: 0, recs: new Set(), qids: new Set(), desc: !!p._desc }; names.set(en, row); }
      row.km += km;
      row.recs.add(rec);
      if (p._qid) row.qids.add(p._qid);
    });
    const list = [...names.values()].sort((a, b) => b.km - a.km || (a.en < b.en ? -1 : a.en > b.en ? 1 : 0));
    /* the names a change is counted over (TEXT changesSub says the rule to the reader) */
    const counted = (row, sheetOk) => [...row.recs].some((k) => k !== 'sheet' || sheetOk);
    const run = worldRuns.find((p) => p.years.includes(y)) || null;
    /* the records DATED to the year (their start), oldest first — an operation that began in 1939 and ran into 1945 is 1939's */
    const events = all.filter((rec) => yearOf(rec) === y).sort((a, b) => (String(a.d) < String(b.d) ? -1 : String(a.d) > String(b.d) ? 1 : 0));
    out.push({ y, isSheet, tier: r.tier, src: r.src, parts, names: list, unnamed, drawn, counted, why: choice.why.get(y), run, events });
  }
  /* neighbours and changes, among the chosen years (a subset model still neighbours within the subset) */
  out.forEach((p, i) => {
    p.prev = out[i - 1] || null; p.next = out[i + 1] || null;
    if (!p.prev) return;
    const sheetOk = p.isSheet && p.prev.isSheet;
    const a = new Map(p.prev.names.filter((n) => p.prev.counted(n, sheetOk)).map((n) => [n.en, n]));
    const b = new Map(p.names.filter((n) => p.counted(n, sheetOk)).map((n) => [n.en, n]));
    p.added = [...b.values()].filter((n) => !a.has(n.en));
    p.removed = [...a.values()].filter((n) => !b.has(n.en));
  });
  return { bands: B, choice, pages: out, land, idx, days, src: { snapshot: readBundle('data/hist-eras.js').src } };
}

/* ══ RENDER ══════════════════════════════════════════════════════════════════════════════════════ */
const fmt = (v, L) => v.toLocaleString(L.intl);
const km2Words = (km, L) => (km < 1 ? '<1' : km.toLocaleString(L.intl, { maximumSignificantDigits: 3 }));
const nameFor = (n, lang) => (lang === 'jp' && n.jp ? n.jp : n.en);
const joinL = (a, lang) => a.join(lang === 'jp' ? '、' : ', ');
/** the ISO 8601 year schema.org's temporalCoverage takes (astronomical; expanded with a sign outside 0000–9999) */
export function isoYear(y) { return y < 0 ? '-' + String(-y).padStart(4, '0') : String(y).padStart(4, '0'); }
const mapLink = (y) => 'index.html' + encode({ view: regionView(world()), time: { at: isoDay(y) } });
/** how many rows the table shows before «All n names» (the rest are on the page, folded) */
const TABLE_ROWS = 50;   /* ⚠ observation: a screenful-and-a-half on a phone; lapses: never — display only, every name is on the page */

/** the century (or, before 1000 BC, the millennium) a year falls in — the hub's sections */
export function eraOf(y) {
  if (y >= 1) return { k: 'c', n: Math.floor((y - 1) / 100) + 1 };
  const bc = 1 - y;
  if (bc <= 1000) return { k: 'cbc', n: Math.floor((bc - 1) / 100) + 1 };
  return { k: 'mbc', n: Math.floor((bc - 1) / 1000) + 1 };
}
const ordinal = (n) => { const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'; return n.toLocaleString('en-US') + s; };
function eraWords(e, lang) {
  const T = TEXT[lang];
  const n = lang === 'jp' ? String(e.n) : ordinal(e.n);
  return fill(e.k === 'c' ? T.centuryAD : e.k === 'cbc' ? T.centuryBC : T.millenniumBC, { n });
}

function recordWords(row, T) { return [...row.recs].map((k) => T.records[k] || k).join(' · '); }

function eventRow(ev, M, L, up) {
  const T = TEXT[L.key], lang = L.key;
  if (ev.src === 'wikidata') {
    const S = sourceOf(ev, M.idx);
    const desc = eventDesc(ev, lang);
    return `      <li class="otd-ev"><span class="otd-y">${esc(String(ev.d).match(/^-?\d+/)[0])}</span><div><p class="otd-t">${esc(eventName(ev, lang))}</p>${desc ? `<p class="otd-s">${esc(desc)}</p>` : ''}`
      + `<p class="otd-s">${esc(dateWords(ev, lang))} · <a href="${esc(S.cite.url)}" data-wikidata="${esc(ev.q)}">${esc(T.eventCite)} ${esc(ev.q)}</a></p></div></li>`;
  }
  const D = OTD.describe(ev, M.idx, lang);
  const md = OTD.mdOf(ev.d);
  const rec = D.war ? fill(T.recordWar, { war: D.war }) : T.recordBorder;
  return `      <li class="otd-ev"><span class="otd-y">${esc(D.year)}</span><div><p class="otd-t">${esc(D.text)}</p><p class="otd-s">${esc(rec)} · ${esc(ev.d2 ? ev.d + ' – ' + ev.d2 : ev.d)}</p>`
    + (md && M.days.has(md) ? `<a class="lp-open" href="${up}${dayPath(md, L)}" data-otd="${esc(ev.d)}">${esc(T.eventDay)}</a>` : '') + `</div></li>`;
}

function renderYear(M, p, L) {
  const T = TEXT[L.key], HT = HISTORY_TEXT[L.key], lang = L.key, B = M.bands;
  const when = yearWords(p.y, lang);
  const n = fmt(p.names.length, L);
  const tier = tierWords(p.tier, HT);
  const top = joinL(p.names.slice(0, 4).map((x) => nameFor(x, lang)), lang) + (p.names.length > 4 ? (lang === 'jp' ? 'など' : '…') : '');
  const W = { when, n, tier, top, prev: p.prev ? yearWords(p.prev.y, lang) : '' };
  const title = fill(T.title, W);
  const description = fill(p.prev ? T.description : T.descriptionFirst, W);
  const crumbs = [
    { name: HT.breadcrumbHistory, path: L.dir + HISTORY_HUB },
    { name: T.crumb, path: hubPath(L) },
    { name: when, path: yearPath(p.y, L) },
  ];
  const src = p.src || M.src.snapshot;
  const pic = SITE_TOKEN + mapPath(p.y);
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description, url: SITE_TOKEN + yearPath(p.y, L), inLanguage: L.tag,
      isPartOf: { '@type': 'WebSite', name: 'IntMap', url: SITE_TOKEN }, primaryImageOfPage: pic,
      mainEntity: { '@type': 'Map', name: fill(T.h1, W), description: fill(T.mapAlt, W), image: pic, url: SITE_TOKEN + mapLink(p.y),
        temporalCoverage: isoYear(p.y), spatialCoverage: { '@type': 'Place', name: HT.regions.world.name },
        isAccessibleForFree: true, isBasedOn: src, inLanguage: L.tag } },
    breadcrumbLd(crumbs),
  ];
  const showSource = lang === 'jp';
  const row = (x) => `      <tr><td>${esc(nameFor(x, lang))}${x.desc ? ` <span class="hp-desc">(${esc(T.described)})</span>` : ''}</td>${showSource ? `<td lang="en">${x.jp ? esc(x.en) : ''}</td>` : ''}`
    + `<td class="yp-rec">${esc(recordWords(x, T))}${[...x.qids].map((q) => ` <a href="https://www.wikidata.org/wiki/${esc(q)}" data-wikidata="${esc(q)}">${esc(q)}</a>`).join('')}</td><td class="hp-num">${km2Words(x.km, L)}</td></tr>`;
  const head = `      <tr><th>${esc(T.colName)}</th>${showSource ? `<th>${esc(T.colSource)}</th>` : ''}<th>${esc(T.colRecord)}</th><th class="hp-num">${esc(T.colArea)}</th></tr>`;
  const shown = p.names.slice(0, TABLE_ROWS), rest = p.names.slice(TABLE_ROWS);
  const names = (arr) => (arr.length ? arr.map((x) => esc(nameFor(x, lang))).join(lang === 'jp' ? '、' : ', ') : esc(T.none));
  const w = p.why || {};
  const whyRows = [
    w.sheet ? T.why.sheet : null,
    w.turn ? fill(T.why.turn, { k: fmt(w.turn, L), before: yearWords(p.y - 1, lang), when }) : null,
    w.event ? fill(T.why.event, { events: joinL(w.event.map((e) => eventName(e, lang)), lang) }) : null,
  ].filter(Boolean);
  const sheetNote = p.drawn.some((d) => d.pale);
  const body = (up) => `  <section class="lp-hero lp-hero-t hp-hero">
    <div class="lp-hero-text">
      <h1>${esc(fill(T.h1, W))}</h1>
      <p class="lp-lede">${esc(fill(T.lede, W))}${p.unnamed ? ' ' + esc(fill(T.unnamed, { k: fmt(p.unnamed, L) })) : ''}</p>
      <div class="lp-cta">
        <a class="lp-btn" href="${esc(up + mapLink(p.y))}" data-year-map="${esc(slugOf(p.y))}">${esc(fill(T.cta, W))}</a>
        <a class="lp-btn lp-btn-2" href="${up}${hubPath(L)}">${esc(T.ctaHub)}</a>
      </div>
    </div>
    <figure class="yp-map"><img src="${up}${mapPath(p.y)}" width="${M.pictures ? M.pictures.width : 1000}" height="${M.pictures ? M.pictures.height : 487}" alt="${esc(fill(T.mapAlt, W))}" decoding="async">
      <figcaption class="lp-note">${esc(fill(T.mapCaption, W))}${sheetNote ? ' ' + esc(fill(T.mapCaptionSheet, { sheet: yearWords(nearestSheet(M, p.y), lang) })) : ''}</figcaption></figure>
  </section>

  <section class="lp-sec" id="why">
    <h2>${esc(T.whyH2)}</h2>
${whyRows.map((s) => `    <p class="lp-sub">${esc(s)}</p>`).join('\n')}
  </section>

  <section class="lp-sec" id="names">
    <h2>${esc(T.namesH2)}</h2>
    <p class="lp-sub">${esc(T.namesSub)}</p>
    <div class="lp-tablewrap">
      <table class="yp-names" data-year-names="${p.names.length}">
${head}
${shown.map(row).join('\n')}
      </table>
    </div>
${rest.length ? `    <details class="yp-more"><summary>${esc(fill(T.namesMore, { n }))}</summary>
    <div class="lp-tablewrap">
      <table class="yp-names">
${head}
${rest.map(row).join('\n')}
      </table>
    </div>
    </details>
` : ''}  </section>

  <section class="lp-sec" id="changes">
${p.prev ? `    <h2>${esc(fill(T.changesH2, W))}</h2>
    <p class="lp-sub">${esc(T.changesSub)}</p>
    <div class="lp-grid2">
      <div class="lp-tile" data-added="${p.added.length}"><h3>${esc(fill(T.added, { k: fmt(p.added.length, L) }))}</h3><p>${names(p.added)}</p></div>
      <div class="lp-tile" data-removed="${p.removed.length}"><h3>${esc(fill(T.removed, { k: fmt(p.removed.length, L) }))}</h3><p>${names(p.removed)}</p></div>
    </div>` : `    <p class="lp-sub">${esc(T.changesFirst)}</p>`}
    <p class="hp-nav">${p.prev ? `<a rel="prev" href="${up}${yearPath(p.prev.y, L)}">← ${esc(T.earlier)}: ${esc(yearWords(p.prev.y, lang))}</a>` : ''}${p.next ? `<a rel="next" href="${up}${yearPath(p.next.y, L)}">${esc(T.later)}: ${esc(yearWords(p.next.y, lang))} →</a>` : ''}</p>
  </section>

  <section class="lp-sec" id="events">
    <h2>${esc(fill(T.eventsH2, W))}</h2>
${p.events.length ? `    <p class="lp-sub">${esc(T.eventsSub)}</p>
    <ol class="otd-list">
${p.events.map((ev) => eventRow(ev, M, L, up)).join('\n')}
    </ol>` : `    <p class="lp-sub">${esc(fill(T.eventsNone, W))}</p>`}
  </section>

  <section class="lp-sec" id="source">
    <h2>${esc(T.sourceH2)}</h2>
    <p>${esc(fill(T.sourceRecord, { src }))}</p>
${T.method.map((m) => `    <p class="lp-note">${esc(fill(m, { quantile: (TURN_SHARE * 100).toLocaleString(L.intl) + '%', csTo: String(B.csTo) }))}</p>`).join('\n')}
    <p class="hp-chips">${p.run ? `<a href="${up}${historyPagePath(p.run, L)}" data-history-run="${esc(slugOf(p.run.first))}">${esc(fill(T.nav.worldRun, { when }))}</a> ` : ''}<a href="${up}${L.dir}${HISTORY_HUB}">${esc(T.nav.history)}</a> <a href="${up}${L.dir}${COUNTRY_HUB}">${esc(T.nav.countries)}</a> <a href="${up}${L.dir}${OTD_HUB}">${esc(T.nav.onThisDay)}</a></p>
    <p><a class="lp-open" href="${up}sources.html">${esc(T.sourcesLink)} →</a></p>
  </section>`;
  return shell(M, L, { path: yearPath(p.y, L), pathFor: (l) => yearPath(p.y, l), title, description, crumbs, ld, body });
}
/** the sheet the composition borrows for a year (js/time-borders.js compositeAt: the nearest sheet year) */
function nearestSheet(M, y) {
  let best = null;
  for (const s of M.sheets) if (best == null || Math.abs(s - y) < Math.abs(best - y)) best = s;
  return best;
}

function renderHub(M, L) {
  const T = TEXT[L.key], HT = HISTORY_TEXT[L.key], lang = L.key;
  const ys = M.pages.map((p) => p.y);
  const W = { n: fmt(ys.length, L), first: yearWords(ys[0], lang), last: yearWords(ys[ys.length - 1], lang) };
  const title = fill(T.hubTitle, W), description = fill(T.hubDescription, W);
  const crumbs = [{ name: HT.breadcrumbHistory, path: L.dir + HISTORY_HUB }, { name: T.crumb, path: hubPath(L) }];
  const groups = [];
  for (const p of M.pages) {
    const e = eraOf(p.y), key = e.k + e.n;
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.pages.push(p); else groups.push({ key, e, pages: [p] });
  }
  const body = (up) => `  <section class="lp-hero lp-hero-t hp-hero">
    <div class="lp-hero-text">
      <h1>${esc(title)}</h1>
      <p class="lp-lede">${esc(fill(T.hubLede, W))}</p>
    </div>
  </section>
  <section class="lp-sec yp-eras">
${groups.map((g) => `    <div class="yp-era" data-era="${esc(g.key)}"><h2>${esc(eraWords(g.e, lang))}</h2><p class="hp-chips">${g.pages.map((p) => `<a href="${up}${yearPath(p.y, L)}">${esc(yearWords(p.y, lang))}</a>`).join(' ')}</p></div>`).join('\n')}
  </section>
  <p class="hp-chips"><a href="${up}${L.dir}${HISTORY_HUB}">${esc(T.nav.history)}</a> <a href="${up}${L.dir}${COUNTRY_HUB}">${esc(T.nav.countries)}</a> <a href="${up}${L.dir}${OTD_HUB}">${esc(T.nav.onThisDay)}</a></p>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description, url: SITE_TOKEN + hubPath(L), inLanguage: L.tag,
    isPartOf: { '@type': 'WebSite', name: 'IntMap', url: SITE_TOKEN } }, breadcrumbLd(crumbs)];
  return shell(M, L, { path: hubPath(L), pathFor: (l) => hubPath(l), title, description, crumbs, ld, body });
}

/** path (relative to the site root) → file body, for every file this generator writes */
export function outputs(M) {
  M.image = M.image || siteImage();
  M.sheets = M.sheets || readBundle('data/hist-eras.js').snaps.map((s) => s.y);
  const out = {};
  /* the pictures first: one per year, shared by both languages (the page states their size) */
  for (const p of M.pages) {
    const pic = drawWorld({ land: M.land, features: p.drawn, title: 'IntMap — ' + yearWords(p.y, 'en') + ' (1 July)' });
    M.pictures = { width: pic.width, height: pic.height };
    p.picture = { drawn: pic.drawn, skipped: pic.skipped, bytes: Buffer.byteLength(pic.svg) };
    out[mapPath(p.y)] = pic.svg;
  }
  for (const L of LANGS) {
    for (const p of M.pages) out[yearPath(p.y, L) + 'index.html'] = renderYear(M, p, L);
    out[hubPath(L) + 'index.html'] = renderHub(M, L);
  }
  out[YEAR_SITEMAP] = sitemap([(l) => hubPath(l), ...M.pages.map((p) => (l) => yearPath(p.y, l))], 'scripts/year-pages.mjs');
  return out;
}

export async function writeTo(dir, opt) {
  const M = await model(opt);
  const out = outputs(M);
  for (const [rel, body] of Object.entries(out)) { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); }
  return { model: M, files: Object.keys(out) };
}

/** Vite plugin: write the pages into dist/ after the history pages (whose world pages these link), before the site URL is
 *  filled in — in a child process, for the reason scripts/history-pages.mjs gives (the map's code installs a browser's
 *  globals on the process it runs in). */
export function yearPagesPlugin() {
  let outDir = null;
  return {
    name: 'intmap-year-pages',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle: { sequential: true, async handler() {
      const { execFile } = await import('node:child_process');
      await new Promise((ok, fail) => execFile(process.execPath, [fileURLToPath(import.meta.url), '--out', outDir],
        { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (stdout) process.stdout.write(stdout);
          if (err) { fail(new Error('year-pages failed: ' + (stderr || err.message))); return; }
          ok();
        }));
    } },
  };
}

/* ── main ─────────────────────────────────────────────────────────────────────────────────────── */
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
/* not a top-level await: scripts/history-pages.mjs collect() imports this module back (the same note as there) */
if (isMain) (async () => {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const t0 = Date.now();
  if (arg('--out')) {
    const { model: M, files } = await writeTo(resolve(arg('--out')));
    const bytes = M.pages.reduce((s, p) => s + p.picture.bytes, 0);
    console.log('year-pages: wrote ' + files.length + ' files (' + M.pages.length + ' years × ' + LANGS.length + ' languages, pictures ' + Math.round(bytes / 1024) + ' kB) into ' + arg('--out') + ' in ' + (Date.now() - t0) + ' ms');
  } else if (process.argv.includes('--years')) {
    const R = await mapReader();
    const idx = JSON.parse(readFileSync(join(ROOT, OTD.INDEX_PATH), 'utf8'));
    const C = await chooseYears(R, idx);
    for (const y of C.years) { const w = C.why.get(y); console.log(String(y).padStart(8) + '  ' + [w.sheet ? 'sheet' : '', w.turn ? 'turn ' + w.turn : '', w.event ? 'event ' + w.event.map((e) => e.name.en).join(' / ') : ''].filter(Boolean).join(' · ')); }
    console.log('year-pages: ' + C.years.length + ' years; turning points ≥ ' + C.turn.cut + ' names (top ' + (TURN_SHARE * 100) + '% of ' + C.turn.changes + ' changes from ' + C.turn.from + '); seams ' + C.turn.seams.map((s) => s.y).join(' ') + '; ' + (Date.now() - t0) + ' ms');
  } else console.log('usage: node scripts/year-pages.mjs --out <dir> | --years');
})().catch((e) => { console.error(e); process.exit(1); });
