#!/usr/bin/env node
/* ============================================================================
 *  IntMap · COUNTRY PAGES — one entry page per country, opening the map on it   (country-pages)
 * ----------------------------------------------------------------------------
 *  「修正でなく商品開発・マーケティング・営業」 (2026-10-04). The two static doors before this one answer a
 *  search for a PLACE AND A YEAR (scripts/history-pages.mjs, by region) and for a DAY (scripts/on-this-day-pages.mjs).
 *  The search people type most is the third axis — a COUNTRY: «map of Japan», «Japan population map», «日本 歴史
 *  地図». IntMap's map state lives in the address's fragment, which never reaches a search engine, so nothing could
 *  find the map opened on a country. This writes, into dist/ when the site is built:
 *    · countries/<code>/ and ja/countries/<code>/ — one per country of the universe the public API already serves
 *      (scripts/public-api.mjs countryUniverse: Natural Earth admin-0, the set the map's countries are), each with
 *        – a link that opens the map framed on the country (js/country-extent.js homeExtent — the app's own frame,
 *          which handles a country across 180° — fitted by js/on-this-day.js fitView, the one camera fit), and the
 *          same view with the population-density grid on;
 *        – the facts the country card shows (capital, area, currency, languages), only when the dataset holding them
 *          is offered for reuse, under the card's own labels (js/locales/ui.*.js), with its credit and licence;
 *        – the historical maps of the regions whose frame the outline overlaps (scripts/history-pages.mjs REGIONS,
 *          measured with its own partKm2In) — a statement about the PLACE, never that the country existed then;
 *        – the war record's dated events whose point falls inside the outline (point in polygon, never a name);
 *        – every offered dataset's terms for the country, and the link to api/v1/countries/<CODE>.json;
 *    · countries/ and ja/countries/ — the list, by name in each language's own order;
 *    · sitemap-countries.xml, joined by sitemap-index.xml (scripts/history-pages.mjs writes the index).
 *
 *  ⚠ NOTHING HERE DECIDES A LICENCE. A section is on the page only when public-api's `countryFile` carries it — that
 *  is, when its dataset is offered (scripts/public-api.mjs termsOf); a withheld dataset has no section to show. Values
 *  shown carry the credit their terms require, on the same page.
 *  ⚠ BUILT, NOT COMMITTED — the reason scripts/history-pages.mjs gives («WHY THEY ARE BUILT, NOT COMMITTED»): a page per
 *  country per language, rewritten whenever a dataset is rebuilt.
 *
 *    node scripts/country-pages.mjs --out <dir>   write the pages and their sitemap into <dir>
 *    node scripts/country-pages.mjs --stats       count; write nothing
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TEXT } from './country-pages-text.mjs';
import { TEXT as HISTORY_TEXT } from './history-pages-text.mjs';
import { SITE_TOKEN } from './site-url.mjs';
import { LANGS, HUB as HISTORY_HUB, REGIONS, shell, esc, fill, breadcrumbLd, siteImage, partKm2In, regionPath, sitemap } from './history-pages.mjs';
import { model as apiModel, countryUniverse, termsWords, API_DIR } from './public-api.mjs';
import { encode } from '../js/map-state.js';
import * as OTD from '../js/on-this-day.js';
import { OTD_HUB, dayPath } from './on-this-day-pages.mjs';
import { decodeNECountries, neCountriesPath } from '../js/ne-countries.js';
import { layerFor } from '../js/layer-manifest.js';
import { IntMapLang } from '../js/lang-registry.js';
import '../js/locales/ui.en.js';
import '../js/locales/ui.jp.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const COUNTRY_HUB = 'countries/';
export const COUNTRY_SITEMAP = 'sitemap-countries.xml';

export const countryPath = (code, L) => L.dir + COUNTRY_HUB + String(code).toLowerCase() + '/';
export const hubPath = (L) => L.dir + COUNTRY_HUB;

/* ══ WHAT THE PAGE SHOWS, DECLARED — each pairing is one the app already makes ════════════════════════════
   FACTS: the four fields of the country card (js/countries-ui.js renderCountryDetailBody: statCapital ← capital,
   statArea ← area, statCurrency ← currency, statLang ← languages), read from the dataset the card reads them from
   (data/country-facts.json, its `countries` table). The labels are the card's, from the app's locale files.
   ⚠ (no-ad-hoc-hardcoding §4) observation: the card's rows on 2026-10-04; lapses: when the card shows other fields
   from that file; canonical: js/countries-ui.js (the card), this table only names which of its rows a page repeats.
   POPULATION: the layer a «population map» opens — the 1 km population-density grid (js/layer-manifest.js `dl-popgrid`,
   a layer a shared link may carry). Checked against the manifest when the pages are built: a renamed or unshareable
   layer stops the build instead of writing a dead link. */
const FACTS = { dataset: 'country-facts', member: 'countries',
  rows: [['capital', 'statCapital'], ['area', 'statArea'], ['currency', 'statCurrency'], ['languages', 'statLang']] };
const POPULATION_LAYER = 'dl-popgrid';

/* ── the app's own pieces, loaded as the app loads them ──────────────────────────────────────────── */
/** js/country-extent.js is a classic script that defines into window — evaluated as such (tests/place-framing-checks does the same) */
function countryExtent() {
  const win = {};
  new Function('window', readFileSync(join(ROOT, 'js/country-extent.js'), 'utf8'))(win);
  return win.IntMapCountryExtent;
}
const ui = (lang, key) => {
  const t = IntMapLang._ui[lang] && IntMapLang._ui[lang][key];
  if (!t) throw new Error('country-pages: the app has no ' + lang + ' label ' + key);
  return t;
};

/* ── geometry ──────────────────────────────────────────────────────────────────────────────────── */
const polysOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
/** is [lon, lat] inside the geometry (in an outer ring and in none of its holes) */
export function pointIn(geometry, pt) {
  const [x, y] = pt;
  for (const poly of polysOf(geometry)) {
    if (!inRing(x, y, poly[0])) continue;
    if (!poly.slice(1).some((h) => inRing(x, y, h))) return true;
  }
  return false;
}
/** a region whose frame is the whole sphere says nothing about where a country is — every outline lies in it */
const isWholeSphere = (r) => r.boxes.some((b) => b[0] <= -180 && b[1] <= -90 && b[2] >= 180 && b[3] >= 90);

/** the view a country's page opens: its home extent (js/country-extent.js), fitted (js/on-this-day.js fitView) */
export function viewOf(ext) { return OTD.fitView(ext[0], ext[1], ext[2], ext[3]); }
export const mapLink = (view, layers) => 'index.html' + encode({ view, layers: layers || [] });

/* ══ THE MODEL ═════════════════════════════════════════════════════════════════════════════════════
   served(rel)       — is this path in the built site (the API's own question; the plugin asks dist/)
   hasRegion(id, L)  — is there a history page for this region (the plugin asks dist/; history-pages writes one for every
                       region with a page, and the checks count on that) */
export function model({ root = ROOT, served, hasRegion = () => true } = {}) {
  const pop = layerFor(POPULATION_LAYER);
  if (!pop || !pop.share) throw new Error('country-pages: ' + POPULATION_LAYER + ' is not a layer a link may carry (js/layer-manifest.js)');
  const api = apiModel(served ? { root, served } : { root });
  const universe = countryUniverse(root);
  const ne = decodeNECountries(JSON.parse(gunzipSync(readFileSync(join(root, neCountriesPath('10m')))).toString('utf8')));
  const CE = countryExtent();
  const byId = new Map(api.catalog.datasets.map((d) => [d.id, d]));
  const otd = JSON.parse(readFileSync(join(root, OTD.INDEX_PATH), 'utf8'));
  const placed = [];
  for (const [md, list] of Object.entries(otd.days)) for (const ev of list) if (Array.isArray(ev.at)) placed.push({ md, ev });
  const regions = REGIONS.filter((r) => !isWholeSphere(r));
  const countries = [];
  for (const row of api.countries.countries) {
    const u = universe.get(row.code);
    const f = ne.features[u.feature];
    const p = f.properties || {};
    const label = p.LABEL_X != null && p.LABEL_Y != null ? [+p.LABEL_X, +p.LABEL_Y] : null;
    const ext = CE.homeExtent(f.geometry, label);
    const full = CE.fullExtent(f.geometry);
    if (!ext || !full) throw new Error('country-pages: ' + row.code + ' has no outline to frame');
    const parts = polysOf(f.geometry);
    const inRegions = regions.map((r) => ({ id: r.id, km: parts.reduce((s, part) => s + r.boxes.reduce((t, b) => t + partKm2In(part, b), 0), 0) }))
      .filter((r) => r.km > 0).sort((a, b) => b.km - a.km);
    const events = placed.filter(({ ev }) => ev.at[0] >= full[0] && ev.at[0] <= full[2] && ev.at[1] >= full[1] && ev.at[1] <= full[3] && pointIn(f.geometry, ev.at))
      .sort((a, b) => (a.ev.d < b.ev.d ? -1 : a.ev.d > b.ev.d ? 1 : 0));
    const file = api.countryFile(row);
    countries.push({ code: row.code, name: row.name, ext, view: viewOf(ext), regions: inRegions, events, file });
  }
  return { api, byId, otd, countries, hasRegion };
}

/* ══ RENDER ══════════════════════════════════════════════════════════════════════════════════════ */
const nameIn = (c, L) => (L.key === 'jp' && c.name.jp) || c.name.en;
const fmt = (v, L) => v.toLocaleString(L.intl);
const list = (a, L) => a.join(L.key === 'jp' ? '・' : ', ');

/** the fact rows a page shows: the card's fields, from the offered section that holds them, with its terms */
export function factsOf(c) {
  const sec = c.file.sections.find((s) => s.dataset === FACTS.dataset && s.member === FACTS.member);
  if (!sec || !sec.value) return null;
  const rows = FACTS.rows.filter(([k]) => sec.value[k] != null && sec.value[k] !== '').map(([k, label]) => ({ k, label, v: sec.value[k] }));
  return rows.length ? { rows, dataset: FACTS.dataset } : null;
}
const factValue = (r, L) => (r.k === 'area' ? Number(Math.round(r.v)).toLocaleString(L.intl) + ' km²' : String(r.v));

/** a dataset's licences as links (the catalogue's own upstream rows) */
const licencesHtml = (d) => [...new Map(d.upstreams.map((u) => [u.licence, u])).values()]
  .map((u) => (u.licenceUrl ? `<a href="${esc(u.licenceUrl)}">${esc(u.licence)}</a>` : esc(u.licence))).join(', ');

function renderCountry(M, c, L) {
  const T = TEXT[L.key], H = HISTORY_TEXT[L.key], lang = L.key;
  const name = nameIn(c, L);
  const facts = factsOf(c);
  const regs = c.regions.filter((r) => M.hasRegion(r.id, L));
  const W = { name, code: c.code, regions: list(regs.map((r) => H.regions[r.id].name), L), facts: facts ? T.descriptionFacts : T.descriptionNoFacts };
  const parts = [T.titleParts.pop, regs.length ? T.titleParts.history : null, facts ? T.titleParts.facts : null].filter(Boolean);
  const title = fill(T.title, { ...W, parts: lang === 'jp' ? parts.join('・') : parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0] });
  const description = fill(regs.length ? T.description : T.descriptionNoRegion, W);
  const crumbs = [{ name: T.crumb, path: hubPath(L) }, { name, path: countryPath(c.code, L) }];
  const used = Object.keys(c.file.terms).map((id) => M.byId.get(id)).filter(Boolean);
  const factsData = facts ? M.byId.get(facts.dataset) : null;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description, url: SITE_TOKEN + countryPath(c.code, L), inLanguage: L.tag,
      isPartOf: { '@type': 'WebSite', name: 'IntMap', url: SITE_TOKEN }, about: { '@type': 'Country', name },
      isBasedOn: used.map((d) => d.files[0].url) },
    breadcrumbLd(crumbs),
  ];
  const apiFile = API_DIR + 'countries/' + c.code + '.json';
  const body = (up) => `  <section class="lp-hero lp-hero-t hp-hero">
    <div class="lp-hero-text">
      <h1>${esc(fill(T.h1, W))}</h1>
      <p class="lp-lede">${esc(fill(T.lede, W))}</p>
      <div class="lp-cta">
        <a class="lp-btn" href="${esc(up + mapLink(c.view))}" data-country-map="${esc(c.code)}">${esc(fill(T.cta, W))}</a>
        <a class="lp-btn lp-btn-2" href="${esc(up + mapLink(c.view, [POPULATION_LAYER]))}" data-country-map-layer="${esc(POPULATION_LAYER)}">${esc(fill(T.ctaPop, W))}</a>
      </div>
    </div>
  </section>
${facts ? `
  <section class="lp-sec" id="facts">
    <h2>${esc(T.factsH2)}</h2>
    <p class="lp-sub">${esc(T.factsSub)}</p>
    <div class="lp-tablewrap">
      <table data-country-facts="${esc(facts.dataset)}">
${facts.rows.map((r) => `      <tr><th>${esc(ui(lang, r.label))}</th><td${lang === 'jp' && r.k !== 'area' ? ' lang="en"' : ''}>${esc(factValue(r, L))}</td></tr>`).join('\n')}
      </table>
    </div>
    <p class="lp-note" data-credit-for="${esc(facts.dataset)}">${fill(esc(T.factsSource), { credit: esc(list(factsData.credit, L)), licences: licencesHtml(factsData) })}</p>
  </section>
` : ''}${regs.length ? `
  <section class="lp-sec" id="history">
    <h2>${esc(T.historyH2)}</h2>
    <p class="lp-sub">${esc(fill(T.historySub, W))}</p>
    <p class="hp-chips">${regs.map((r) => `<a href="${up}${regionPath(r.id, L)}" data-region="${esc(r.id)}">${esc(H.regions[r.id].mapOf)}</a>`).join(' ')}</p>
  </section>
` : ''}${c.events.length ? `
  <section class="lp-sec" id="events">
    <h2>${esc(T.eventsH2)}</h2>
    <p class="lp-sub">${esc(fill(T.eventsSub, W))}</p>
    <ol class="otd-list">
${c.events.map(({ md, ev }) => { const D = OTD.describe(ev, M.otd, lang); return `      <li class="otd-ev"><span class="otd-y">${esc(D.year)}</span><div><p class="otd-t">${esc(D.text)}</p><p class="otd-s">${esc(D.war ? D.war + ' · ' + D.record : D.record)}</p><a class="lp-open" href="${up}${dayPath(md, L)}" data-otd="${esc(ev.d)}">${esc(OTD.dayWords(md, lang))} →</a></div></li>`; }).join('\n')}
    </ol>
  </section>
` : ''}
  <section class="lp-sec" id="data">
    <h2>${esc(fill(T.dataH2, W))}</h2>
${used.length ? `    <p class="lp-sub">${esc(fill(T.dataSub, W))} <a href="${up}${apiFile}"><code>${esc(fill(T.dataFile, W))}</code></a></p>
    <div class="lp-grid2">
${used.map((d) => `      <div class="lp-tile" data-dataset="${esc(d.id)}"><h3><code>${esc(d.id)}</code></h3><p class="lp-note">${licencesHtml(d)} · ${esc(fill(T.terms, { terms: termsWords(d.terms, lang) }))}</p>${d.terms.credit ? `<p class="lp-note" data-credit-for="${esc(d.id)}">${esc(fill(T.credit, { credit: list(d.credit, L) }))}</p>` : ''}</div>`).join('\n')}
    </div>` : `    <p class="lp-sub">${esc(fill(T.dataNone, W))}</p>`}
  </section>

  <section class="lp-sec" id="source">
    <h2>${esc(T.methodH2)}</h2>
${T.method.map((m) => `    <p class="lp-note">${esc(m)}</p>`).join('\n')}
    <p class="hp-chips"><a href="${up}${hubPath(L)}">${esc(T.nav.hub)}</a> <a href="${up}${L.dir}${HISTORY_HUB}">${esc(T.nav.history)}</a> <a href="${up}${L.dir}${OTD_HUB}">${esc(T.nav.onThisDay)}</a> <a href="${up}${L.dir}developers.html">${esc(T.nav.developers)}</a></p>
    <p><a class="lp-open" href="${up}sources.html">${esc(T.sourcesLink)} →</a></p>
  </section>`;
  return shell(M, L, { path: countryPath(c.code, L), pathFor: (l) => countryPath(c.code, l), title, description, crumbs, ld, body });
}

/** the countries in a language's own order */
export function ordered(M, L) {
  const coll = new Intl.Collator(L.intl);
  return M.countries.slice().sort((a, b) => coll.compare(nameIn(a, L), nameIn(b, L)) || (a.code < b.code ? -1 : 1));
}

function renderHub(M, L) {
  const T = TEXT[L.key];
  const W = { n: fmt(M.countries.length, L) };
  const title = T.hubTitle, description = fill(T.hubDescription, W);
  const crumbs = [{ name: T.crumb, path: hubPath(L) }];
  const body = (up) => `  <section class="lp-hero lp-hero-t hp-hero">
    <div class="lp-hero-text">
      <h1>${esc(title)}</h1>
      <p class="lp-lede">${esc(fill(T.hubLede, W))}</p>
    </div>
  </section>
  <section class="lp-sec" id="countries">
    <p class="hp-chips">${ordered(M, L).map((c) => `<a href="${up}${countryPath(c.code, L)}">${esc(nameIn(c, L))}</a>`).join(' ')}</p>
  </section>
  <p class="hp-chips"><a href="${up}${L.dir}${HISTORY_HUB}">${esc(T.nav.history)}</a> <a href="${up}${L.dir}${OTD_HUB}">${esc(T.nav.onThisDay)}</a></p>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description, url: SITE_TOKEN + hubPath(L), inLanguage: L.tag,
    isPartOf: { '@type': 'WebSite', name: 'IntMap', url: SITE_TOKEN } }, breadcrumbLd(crumbs)];
  return shell(M, L, { path: hubPath(L), pathFor: (l) => hubPath(l), title, description, crumbs: null, ld, body });
}

/** path (relative to the site root) → file body, for every file this generator writes */
export function outputs(M) {
  M.image = M.image || siteImage();
  const out = {};
  for (const L of LANGS) {
    for (const c of M.countries) out[countryPath(c.code, L) + 'index.html'] = renderCountry(M, c, L);
    out[hubPath(L) + 'index.html'] = renderHub(M, L);
  }
  out[COUNTRY_SITEMAP] = sitemap([(l) => hubPath(l), ...M.countries.map((c) => (l) => countryPath(c.code, l))], 'scripts/country-pages.mjs');
  return out;
}

export function writeTo(dir) {
  const M = model({ served: (rel) => existsSync(join(dir, rel)), hasRegion: (id, L) => existsSync(join(dir, regionPath(id, L), 'index.html')) });
  const out = outputs(M);
  for (const [rel, body] of Object.entries(out)) { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); }
  return { model: M, files: Object.keys(out) };
}

/** Vite plugin: after the history pages and the public API (their region pages and api/v1/ are what these link to),
 *  write the pages into dist/, before the site URL is filled in — in a child process like the other two generators
 *  (the app's locale modules and window-defining scripts are loaded here, not in Vite's process). */
export function countryPagesPlugin() {
  let outDir = null;
  return {
    name: 'intmap-country-pages',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle: { sequential: true, async handler() {
      const { execFile } = await import('node:child_process');
      await new Promise((ok, fail) => execFile(process.execPath, [fileURLToPath(import.meta.url), '--out', outDir],
        { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (stdout) process.stdout.write(stdout);
          if (err) { fail(new Error('country-pages failed: ' + (stderr || err.message))); return; }
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
    console.log('country-pages: wrote ' + files.length + ' files (' + M.countries.length + ' countries × ' + LANGS.length + ' languages) into ' + arg('--out') + ' in ' + (Date.now() - t0) + ' ms');
  } else {
    const M = model();
    const n = (f) => M.countries.filter(f).length;
    console.log('country-pages: ' + M.countries.length + ' countries; with facts ' + n((c) => factsOf(c)) + ', with a history region ' + n((c) => c.regions.length)
      + ', with dated events ' + n((c) => c.events.length) + ' (' + M.countries.reduce((s, c) => s + c.events.length, 0) + ' events); '
      + (M.countries.length + 1) * LANGS.length + ' pages; ' + (Date.now() - t0) + ' ms');
  }
}
