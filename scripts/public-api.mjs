#!/usr/bin/env node
/* ============================================================================
 *  IntMap · public-api — the OPEN DATA a developer may take, as a static API   (developer-embed)
 * ----------------------------------------------------------------------------
 *  「静的に配れる公開データ API と開発者向けページ。ライセンス上再配布できないデータは出さない（台帳で判定）。」
 *  IntMap ships ~80 datasets under data/ to every visitor's browser, and a developer, a teacher or a
 *  journalist who wanted one of them had no way to know which file it was, what it holds, and — the
 *  question that decides whether they may use it at all — under what terms. This writes that answer as
 *  files GitHub Pages serves next to the site (no server, no key, CORS open):
 *
 *      api/v1/catalog.json            every dataset offered for reuse: its files (absolute URLs, bytes),
 *                                     its licence AS ITS SOURCE STATES IT, what that licence requires
 *                                     (credit / share-alike / non-commercial), the credit line to show,
 *                                     the publisher, as-of and cadence — and every dataset WITHHELD, with why
 *      api/v1/countries.json          the countries (Natural Earth's code set, en + ja names) and which
 *                                     offered datasets say something about each
 *      api/v1/countries/<CODE>.json   one country: every offered per-country table's row for it, each
 *                                     section carrying its own dataset's terms
 *      api/v1/embed.json              the embed API — the URL grammar and the postMessage protocol
 *                                     (js/embed-client.js PROTOCOL), as data
 *
 *  ══ ⚠⚠⚠ THE TERMS ARE THE LEDGER'S, AS VALUES — NOTHING HERE DECIDES THEM ═══════════════════════════
 *  Which licence a dataset is under is read by scripts/data-governance.mjs rightsTable() — the same
 *  reading `npm run check:datagov` gates (the record a bundle states in-band, else what the builders that
 *  write it declare in `export const GOVERNANCE`, both through js/data-governance.js read()). This file adds
 *  ONE judgement, and it is about LICENCES, not about datasets: LICENCES below says what each licence
 *  identifier permits. A dataset is offered only when EVERY upstream it states names a licence that
 *  vocabulary recognises as permitting redistribution; otherwise it is withheld and the catalogue says why:
 *    licence-not-stated      an upstream states no licence as a value (silence is not permission —
 *                            js/data-governance.js read(): 「一つも述べていない」 does not become 「不要」)
 *    licence-not-recognised  a licence is stated, and LICENCES does not know it to permit redistribution
 *                            (it is printed verbatim, so the reader sees which)
 *    credit-not-stated       a licence makes credit a condition and the record names nothing to credit (no source row,
 *                            credit text, publisher or address) — the reader would be handed an obligation they cannot meet
 *    not-served              none of the dataset's files is in the built site (vite.config.js STATIC_EXCLUDE)
 *  The strictest obligation wins across upstreams (a file is only as reusable as its least permissive part —
 *  js/data-governance.js read()): credit if any requires it, share-alike if any, commercial use only if all allow.
 *  ⚠ A DATASET IS NEVER OFFERED BECAUSE IT IS ALREADY PUBLIC. Every file under data/ is already fetchable from
 *  the site — the browser has to fetch it to draw the map — and that is IntMap's use, under each licence. Offering
 *  it for REUSE is a different statement, and it is made only where a licence says so.
 *
 *  ══ THE COUNTRY TABLES ARE DISCOVERED, NOT LISTED ════════════════════════════════════════════════════
 *  A «per-country table» is any object, at the top of an offered JSON dataset or one member down, whose keys are
 *  mostly country codes of the universe (Natural Earth admin-0: ISO_A3_EH, else ADM0_A3 — the code set
 *  data/country-facts.json says it uses). A dataset added next year joins the country files by stating a licence;
 *  nobody adds it here. Keys outside the universe (the World Bank's regional aggregates — AFE, AFW, …) are
 *  counted and reported, never invented into countries.
 *
 *  ══ BUILT, NOT COMMITTED ═════════════════════════════════════════════════════════════════════════════
 *  `publicApiPlugin` (vite.config.js) writes into dist/ after the static copy: the files a dataset lists are the
 *  ones that are in dist/ (measured on the build's own output, so a file the copy excludes is never advertised).
 *  It also fills the catalogue table into the developer pages (scripts/landing.mjs writes CATALOG_MARK there),
 *  so the table is in the HTML — readable by a crawler and with scripts off.
 *
 *    node scripts/public-api.mjs --out <dir>   write api/v1/ into <dir> (and fill <dir>/developers.html, ja/)
 *    node scripts/public-api.mjs --stats       print what would be offered and withheld; write nothing
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rightsTable } from './data-governance.mjs';
import { SITE_URL } from '../supabase/functions/_shared/site-origin.js';
import { buildStamp } from './build-stamp.mjs';
import { PROTOCOL } from '../js/embed-client.js';
import { TEXT as LANDING_TEXT } from './landing-text.mjs';   /* the words for each message, the developer page's own */
import { EMBED_SIZES } from '../js/embed-mode.js';
import { countryPath } from './country-pages.mjs';   /* (country-pages) each country's entry page, en and ja (a cycle: read only when the model is built) */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const API_DIR = 'api/v1/';
/* the marker scripts/landing.mjs writes into developers.html where the catalogue table goes */
export const CATALOG_MARK = '<!-- intmap:public-api-catalog -->';

/* ══ THE LICENCE VOCABULARY ═══════════════════════════════════════════════════════════════════════════
   What each licence permits, by the licence's own text. A spelling is matched after normalising case, dashes and
   spaces (`CC-BY-4.0` and `CC BY 4.0` are one identifier). Every licence here permits redistribution; a licence
   that does not is simply not here, and a dataset under it is withheld as «not recognised».
   ⚠ (no-ad-hoc-hardcoding §4) OBSERVATION: these are the licence values the governance records under data/ state,
   read 2026-10-03 with rightsTable() (public domain ×12 spellings incl. U.S. Government works, CC0 1.0, CC BY 3.0 /
   4.0, ODbL 1.0, CC BY-NC-SA 3.0 IGO / 4.0, IntMap's own LICENSE; «© UNESCO» was the one that is not a licence to
   redistribute). EXPIRES: a dataset stating a licence not here is withheld and listed by name in the catalogue and
   by `--stats` — the loud failure, never a silent offer. CANON: this table; js/data-governance.js owns how a record
   is read, this owns what a licence permits.
   `credit`     naming the source is a condition of reuse
   `shareAlike` a redistributed or adapted copy must carry the same licence
   `commercial` commercial reuse is permitted */
export const LICENCES = Object.freeze([
  { id: 'public-domain', match: /^(public domain|u\.s\. government work (public domain|not subject to copyright))$/,
    url: null, credit: false, shareAlike: false, commercial: true },
  { id: 'CC0-1.0', match: /^cc0( 1\.0)?( universal)?$/, url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    credit: false, shareAlike: false, commercial: true },
  { id: 'CC-BY-3.0', match: /^cc by 3\.0$/, url: 'https://creativecommons.org/licenses/by/3.0/', credit: true, shareAlike: false, commercial: true },
  { id: 'CC-BY-4.0', match: /^cc by 4\.0$/, url: 'https://creativecommons.org/licenses/by/4.0/', credit: true, shareAlike: false, commercial: true },
  { id: 'ODbL-1.0', match: /^odbl( 1\.0)?$/, url: 'https://opendatacommons.org/licenses/odbl/1-0/', credit: true, shareAlike: true, commercial: true },
  { id: 'CC-BY-NC-SA-3.0-IGO', match: /^cc by nc sa 3\.0 igo$/, url: 'https://creativecommons.org/licenses/by-nc-sa/3.0/igo/',
    credit: true, shareAlike: true, commercial: false },
  { id: 'CC-BY-NC-SA-4.0', match: /^cc by nc sa 4\.0$/, url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/', credit: true, shareAlike: true, commercial: false },
  /* (sales-pro-audiences) the GNU GPL v3, which aourednik/historical-basemaps states for its sheets (data/hist-eras.js —
     the repository's LICENSE, read 2026-09-10). Observed 2026-10-08: the first record under data/ to state it as a value.
     It permits copying, adapting and commercial use (§2, §4–§6), requires the notices and the licence to travel with a
     copy (§4 — credit) and an adapted copy to be under the same licence (§5c — share-alike). */
  { id: 'GPL-3.0', match: /^gpl 3\.0( only| or later)?$/, url: 'https://www.gnu.org/licenses/gpl-3.0.html', credit: true, shareAlike: true, commercial: true },
  /* IntMap's own files (the status page's record, the offline-sources table): LICENSE §2 grants use and copying for
     personal and research/educational use, §3 forbids commercial use, §4 requires the notice to be kept */
  { id: 'IntMap-Personal-Research', match: /^intmap personal & research use license( \(license\))?$/, url: 'LICENSE',
    credit: true, shareAlike: false, commercial: false },
]);
export const normaliseLicence = (s) => String(s).toLowerCase().replace(/[‐-―−-]+/g, ' ').replace(/\s+/g, ' ').trim();
export function licenceOf(text) {
  if (text == null) return null;
  const n = normaliseLicence(text);
  return LICENCES.find((l) => l.match.test(n)) || null;
}

/* ── the terms of one dataset, from what it states ──────────────────────────────────────────────────── */
/* The record a dataset's terms are read from: the declarations of the builders that write it (`export const GOVERNANCE`
   — values check:datagov reads and holds), every upstream of each; else the record the file states in-band.
   ⚠ THE DECLARATION FIRST, BECAUSE IT IS THE FULLER STATEMENT, MEASURED: data/country-facts.json states its upstreams
   in-band in the DATA_SOURCES spelling ({ n, u, licence }), which js/data-governance.js read() does not take as a
   publisher, while scripts/build-country-facts.mjs declares the same three upstreams with `publisher` and `url` (one
   table, UPSTREAMS, behind both). Read in-band first, the file would be offered as «ODbL — credit required» with
   nobody named to credit. */
function upstreamsOf(b) {
  const states = (r) => r && (r.licence != null || (r.upstreams && r.upstreams.some((u) => u.licence != null)));
  const decl = b.declared.map((d) => d.record).filter(states);
  const pick = decl.length ? decl : (states(b.inBand) ? [b.inBand] : []);
  if (!pick.length) return { from: null, ups: [] };
  const ups = [];
  for (const r of pick) {
    /* (sales-pro-audiences) read() normalises each upstream to the shared vocabulary; what a record states about its PART
       in the file (`cite`, `contributes`, `rowsFrom` — see termsOf) is outside it, so it is taken from the same upstream's
       verbatim record, matched by position — only when the verbatim list is the one read() normalised */
    const list = r.upstreams && r.upstreams.length ? r.upstreams : [r];
    const raws = (r.upstreams && r.raw && Array.isArray(r.raw.upstreams) && r.raw.upstreams.length === list.length) ? r.raw.upstreams : null;
    const own = !(r.upstreams && r.upstreams.length) && r.raw ? r.raw : null;   /* a record that is its own one upstream */
    list.forEach((u, i) => ups.push(raws ? Object.assign({ part: raws[i] || {} }, u) : own ? Object.assign({ part: own }, u) : u));
  }
  return { from: decl.length ? 'builder' : 'bundle', rec: pick[0], ups };
}
export function termsOf(b) {
  const { from, rec, ups } = upstreamsOf(b);
  if (!ups.length) return { offered: false, why: 'licence-not-stated', detail: b.inBandReason || 'no governance record states a licence' };
  const silent = ups.filter((u) => u.licence == null);
  if (silent.length) return { offered: false, why: 'licence-not-stated', detail: silent.length + ' of ' + ups.length + ' upstream(s) state no licence' };
  const known = ups.map((u) => ({ u, l: licenceOf(u.licence) }));
  const unknown = known.filter((k) => !k.l).map((k) => String(k.u.licence));
  if (unknown.length) return { offered: false, why: 'licence-not-recognised', detail: [...new Set(unknown)].join(' · ') };
  /* a licence that makes credit a condition, and a record that gives nothing to credit: offering it would hand the reader
     an obligation they cannot meet */
  const owed = known.filter((k) => (k.l.credit || k.u.creditRequired === true) && !(k.u.paidBy || k.u.credit || k.u.publisher || k.u.url));
  if (owed.length) return { offered: false, why: 'credit-not-stated', detail: owed.map((k) => String(k.u.licence)).join(' · ') + ' requires credit and the record names no source to credit' };
  return {
    offered: true, from,
    credit: known.some((k) => k.l.credit || k.u.creditRequired === true),
    shareAlike: known.some((k) => k.l.shareAlike),
    commercial: known.every((k) => k.l.commercial),
    upstreams: known.map((k) => ({
      publisher: k.u.publisher || null, url: k.u.url || null,
      licence: String(k.u.licence), licenceId: k.l.id, licenceUrl: k.u.licenceUrl || (k.l.url === 'LICENSE' ? SITE_URL + 'LICENSE' : k.l.url),
      /* the line to show: the DATA_SOURCES row the record names, else its own credit text, else its publisher; a record
         that names none of them is cited by what it does state — its address and its licence */
      credit: k.u.paidBy || k.u.credit || k.u.publisher || (k.u.url ? k.u.url + ' (' + k.u.licence + ')' : null),
      /* (sales-pro-audiences) what a record states about ITS PART in a composed file, passed on only when stated:
         `cite` the reference its publisher asks for (in the publisher's words); `contributes: 'outline'` it shaped the edges
         only (its ground was cut away), not the names, dates or identifiers; `rowsFrom` the first day it can have shaped a
         row. js/border-extract.js reads them row by row, so a row a record never touched is not held to its terms. */
      ...(k.u.part && k.u.part.cite ? { cite: String(k.u.part.cite) } : {}),
      ...(k.u.part && k.u.part.contributes ? { contributes: String(k.u.part.contributes) } : {}),
      ...(k.u.part && k.u.part.rowsFrom ? { rowsFrom: String(k.u.part.rowsFrom) } : {}),
    })),
    asOf: (rec && rec.asOf) || null, generatedAt: (rec && (rec.generatedAt || rec.retrievedAt)) || null, cadence: (rec && rec.cadence) || null,
  };
}

/* ── what the sources page says about a DATA_SOURCES row (en + ja), for the credit a dataset names ─────── */
function sourceUse() {
  const g = globalThis.window;
  if (!g || !g.IntMapPageI18N) globalThis.window = Object.assign(g || {}, {});
  const out = { en: {}, jp: {} };
  for (const [key, file, code] of [['en', 'js/locales/pages.en.js', 'en'], ['jp', 'js/locales/pages.ja.js', 'ja']]) {
    try {
      /* the pages' locale files are classic scripts that define into window.IntMapPageI18N — evaluated as such */
      new Function('window', readFileSync(join(ROOT, file), 'utf8'))(globalThis.window);
      const d = globalThis.window.IntMapPageI18N && globalThis.window.IntMapPageI18N.doc(code);
      out[key] = (d && d.sourceUse) || {};
    } catch (_) { out[key] = {}; }
  }
  return out;
}

/* ── the country universe: Natural Earth admin-0 (public domain), the code set the map's countries use ── */
export function countryUniverse(root = ROOT) {
  const j = JSON.parse(gunzipSync(readFileSync(join(root, 'data/ne-countries/ne_10m_admin_0_countries.json.gz'))).toString('utf8'));
  const out = new Map();
  (j.features || []).forEach((f, i) => {
    const p = f.p || f.properties || {};
    const code = p.ISO_A3_EH && p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : p.ADM0_A3;
    if (!/^[A-Z]{3}$/.test(String(code || ''))) return;
    /* a code two features share (Brazil and the Brazilian Island) names the feature whose own ADM0 code it is */
    if (out.has(code) && p.ADM0_A3 !== code) return;
    /* `feature`: the index of the feature in the file, so a reader that needs its outline (scripts/country-pages.mjs)
       decodes the same file and takes the same feature — this one rule decides which feature a code is */
    out.set(code, { code, en: p.NAME_EN || p.NAME || code, jp: p.NAME_JA || null, feature: i });
  });
  return out;
}

/* the per-country tables of one parsed dataset: the object itself or a member one level down whose keys are
   mostly codes of the universe (more than half — a table of countries is one whose keys are countries) */
export function countryTables(json, universe) {
  const out = [];
  const isTable = (o) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const ks = Object.keys(o); if (!ks.length) return null;
    const hit = ks.filter((k) => universe.has(k)).length;
    return hit * 2 > ks.length ? { hit, outside: ks.filter((k) => !universe.has(k)) } : null;
  };
  const top = isTable(json);
  if (top) { out.push({ member: null, table: json, outside: top.outside }); return out; }
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    for (const [k, v] of Object.entries(json)) { const t = isTable(v); if (t) out.push({ member: k, table: v, outside: t.outside }); }
  }
  return out;
}
function parseJson(rel, root) {
  const buf = readFileSync(join(root, rel));
  const text = (rel.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8');
  return JSON.parse(text);
}

/* a shard directory keeps its slash: data/planets.json and data/planets/ are two datasets */
const idOf = (subject) => subject.replace(/^data\//, '');

/* ══ THE MODEL ═════════════════════════════════════════════════════════════════════════════════════════
   served(rel) — is this repository path in the built site? (the plugin asks dist/; --stats asks the tree) */
export function model({ root = ROOT, served = (rel) => existsSync(join(root, rel)), table = rightsTable() } = {}) {
  const site = SITE_URL;
  const use = sourceUse();
  const universe = countryUniverse(root);
  const datasets = [], withheld = [];
  for (const b of table.bundles) {
    const id = idOf(b.subject);
    const t = termsOf(b);
    /* (sales-pro-audiences) a withheld entry names its files too, so a reader holding a path (js/border-extract.js) can say
       which entry withheld it and why, by the same join an offered entry is found by */
    if (!t.offered) { withheld.push({ id, reason: t.why, detail: t.detail, paths: (b.members || []).slice() }); continue; }
    const files = (b.members || []).filter((m) => served(m));
    if (!files.length) { withheld.push({ id, reason: 'not-served', detail: 'none of its files is in the built site', paths: (b.members || []).slice() }); continue; }
    const shard = b.kind === 'shard';
    /* a shard directory is listed by its index when it has one that is served; one without (data/planets/) lists its files */
    const idx = shard && b.index && served(b.index) ? b.index : null;
    const listed = idx ? [idx] : files;
    const bytes = files.reduce((n, m) => { try { return n + statSync(join(root, m)).size; } catch (_) { return n; } }, 0);
    const credit = [...new Set(t.upstreams.map((u) => u.credit).filter(Boolean))];
    const about = { en: null, jp: null };
    for (const c of credit) { if (!about.en && use.en[c]) about.en = use.en[c]; if (!about.jp && use.jp[c]) about.jp = use.jp[c]; }
    datasets.push({
      id,
      files: listed.map((m) => ({ path: m, url: site + m, bytes: statSync(join(root, m)).size })),
      ...(shard ? { shards: { count: files.length, bytes, index: idx ? site + idx : null } } : {}),
      bytes,
      terms: { credit: t.credit, shareAlike: t.shareAlike, commercial: t.commercial },
      licences: [...new Set(t.upstreams.map((u) => u.licenceId))],
      upstreams: t.upstreams,
      credit,
      about,
      asOf: t.asOf, generatedAt: t.generatedAt, cadence: t.cadence,
      statedBy: t.from,
    });
  }
  datasets.sort((a, b) => (a.id < b.id ? -1 : 1));
  withheld.sort((a, b) => (a.id < b.id ? -1 : 1));

  /* the per-country files: every offered JSON dataset's country tables */
  const sections = new Map();   /* code → [{ dataset, member, value }] */
  const tables = [];
  for (const d of datasets) {
    for (const f of d.files) {
      if (!/\.json(\.gz)?$/.test(f.path)) continue;
      let json; try { json = parseJson(f.path, root); } catch (_) { continue; }
      for (const t of countryTables(json, universe)) {
        tables.push({ dataset: d.id, file: f.path, member: t.member, countries: Object.keys(t.table).length - t.outside.length, outside: t.outside });
        for (const [code, value] of Object.entries(t.table)) {
          if (!universe.has(code)) continue;
          if (!sections.has(code)) sections.set(code, []);
          sections.get(code).push({ dataset: d.id, member: t.member, value });
        }
      }
    }
  }
  const byId = new Map(datasets.map((d) => [d.id, d]));
  const countries = [...universe.values()].sort((a, b) => (a.code < b.code ? -1 : 1)).map((c) => ({
    code: c.code, name: { en: c.en, jp: c.jp }, url: site + API_DIR + 'countries/' + c.code + '.json',
    /* the human page that opens the map on the country (scripts/country-pages.mjs writes one for every code here) */
    page: { en: site + countryPath(c.code, { dir: '' }), ja: site + countryPath(c.code, { dir: 'ja/' }) },
    datasets: [...new Set((sections.get(c.code) || []).map((s) => s.dataset))],
  }));
  const countryFile = (c) => {
    const secs = sections.get(c.code) || [];
    const used = [...new Set(secs.map((s) => s.dataset))].map((id) => byId.get(id));
    return {
      schema: 'intmap.country/1', code: c.code, name: c.name,
      sections: secs.map((s) => ({ dataset: s.dataset, member: s.member, value: s.value })),
      /* each section's terms, so a page that keeps one section knows what that one requires */
      terms: Object.fromEntries(used.map((d) => [d.id, { ...d.terms, licences: d.licences, creditLine: d.credit, source: d.files[0] ? d.files[0].url : null }])),
      catalog: site + API_DIR + 'catalog.json',
    };
  };
  const catalog = {
    schema: 'intmap.catalog/1', site, built: buildStamp(root),
    rule: 'A dataset is offered when every upstream it states names a licence that permits redistribution (scripts/public-api.mjs LICENCES); the strictest obligation of its upstreams applies to the whole file.',
    licences: LICENCES.map((l) => ({ id: l.id, url: l.url === 'LICENSE' ? site + 'LICENSE' : l.url, credit: l.credit, shareAlike: l.shareAlike, commercial: l.commercial })),
    datasets, withheld,
    countries: site + API_DIR + 'countries.json',
    embed: site + API_DIR + 'embed.json',
  };
  const embed = {
    schema: 'intmap.embed/1', site,
    url: { pattern: site + 'index.html?embed=1[&interactive=0]#<share-link fragment>',
      params: { embed: '1 — the read-only embed view', interactive: '0 — a still picture (no pan, no zoom)' },
      sizes: EMBED_SIZES },
    client: site + 'js/embed-client.js',
    protocol: PROTOCOL,
    does: LANDING_TEXT.en.developers.api.does,
  };
  return { catalog, embed, countries: { schema: 'intmap.countries/1', site, countries }, countryFile, tables };
}

/* ══ THE CATALOGUE AS HTML — the table the developer pages carry (en / jp) ═══════════════════════════════ */
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const WORDS = {
  en: { id: 'Dataset', licence: 'Licence', terms: 'Requires', size: 'Size', credit: 'Credit to show', withheld: 'Withheld', why: 'Why',
    creditY: 'credit', sa: 'share-alike', nc: 'non-commercial', none: 'nothing', file: 'files', countries: 'countries',
    reasons: { 'licence-not-stated': 'no licence is stated as a value yet', 'licence-not-recognised': 'the stated terms are not known to permit redistribution', 'credit-not-stated': 'its licence requires credit and its record names nothing to credit', 'not-served': 'not in the built site' },
    summary: (o, w) => o + ' datasets offered for reuse · ' + w + ' withheld' },
  jp: { id: 'データセット', licence: 'ライセンス', terms: '条件', size: '大きさ', credit: '表示する出典', withheld: '出していないもの', why: '理由',
    creditY: '出典表示', sa: '継承（同じライセンス）', nc: '非営利', none: 'なし', file: 'ファイル', countries: 'か国',
    reasons: { 'licence-not-stated': 'ライセンスがまだ値として述べられていない', 'licence-not-recognised': '述べられた条件が再配布を許すと確認できない', 'credit-not-stated': 'ライセンスが出典表示を求めるのに、記録が表示する出典を述べていない', 'not-served': 'ビルドされたサイトに無い' },
    summary: (o, w) => '再利用できるデータセット ' + o + ' 件 · 出していないもの ' + w + ' 件' },
};
/** the obligations of a dataset's terms in words (en / jp) — the catalogue's column, and the country pages' (scripts/country-pages.mjs) */
export function termsWords(t, lang) {
  const W = WORDS[lang] || WORDS.en;
  return [t.credit ? W.creditY : null, t.shareAlike ? W.sa : null, !t.commercial ? W.nc : null].filter(Boolean).join(' · ') || W.none;
}
const size = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n >= 1e3 ? Math.round(n / 1e3) + ' kB' : n + ' B');
export function catalogHtml(catalog, lang) {
  const W = WORDS[lang] || WORDS.en;
  const terms = (t) => termsWords(t, lang);
  const rows = catalog.datasets.map((d) => `      <tr><td><a href="${esc(d.files[0].url)}"><code>${esc(d.id)}</code></a>${d.shards ? ` <span class="lp-note">(${d.shards.count} ${esc(W.file)})</span>` : ''}</td>`
    + `<td>${d.upstreams.map((u) => u.licenceUrl ? `<a href="${esc(u.licenceUrl)}">${esc(u.licence)}</a>` : esc(u.licence)).filter((v, i, a) => a.indexOf(v) === i).join('<br>')}</td>`
    + `<td>${esc(terms(d.terms))}</td><td>${esc(size(d.bytes))}</td><td>${d.credit.map(esc).join('<br>')}</td></tr>`).join('\n');
  const held = catalog.withheld.map((w) => `      <tr><td><code>${esc(w.id)}</code></td><td>${esc(W.reasons[w.reason] || w.reason)}${w.reason === 'licence-not-recognised' ? ': ' + esc(w.detail) : ''}</td></tr>`).join('\n');
  return `<p class="lp-sub" data-api-summary>${esc(W.summary(catalog.datasets.length, catalog.withheld.length))}</p>
    <div class="lp-tablewrap"><table data-api-catalog>
      <thead><tr><th>${esc(W.id)}</th><th>${esc(W.licence)}</th><th>${esc(W.terms)}</th><th>${esc(W.size)}</th><th>${esc(W.credit)}</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table></div>
    <h3>${esc(W.withheld)}</h3>
    <div class="lp-tablewrap"><table data-api-withheld>
      <thead><tr><th>${esc(W.id)}</th><th>${esc(W.why)}</th></tr></thead>
      <tbody>
${held}
      </tbody>
    </table></div>`;
}

/* ══ WRITING ══════════════════════════════════════════════════════════════════════════════════════════ */
export function writeTo(out, opts = {}) {
  const served = opts.served || ((rel) => existsSync(join(out, rel)));
  const M = model({ served, ...opts });
  const files = [];
  const put = (rel, body) => { const p = join(out, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); files.push(rel); };
  put(API_DIR + 'catalog.json', JSON.stringify(M.catalog, null, 1) + '\n');
  put(API_DIR + 'embed.json', JSON.stringify(M.embed, null, 1) + '\n');
  put(API_DIR + 'countries.json', JSON.stringify(M.countries) + '\n');
  for (const c of M.countries.countries) put(API_DIR + 'countries/' + c.code + '.json', JSON.stringify(M.countryFile(c)) + '\n');
  /* the developer pages' catalogue table */
  for (const [rel, lang] of [['developers.html', 'en'], ['ja/developers.html', 'jp']]) {
    const p = join(out, rel);
    if (!existsSync(p)) continue;
    const html = readFileSync(p, 'utf8');
    if (!html.includes(CATALOG_MARK)) throw new Error('public-api: ' + rel + ' has no ' + CATALOG_MARK + ' — scripts/landing.mjs writes it');
    writeFileSync(p, html.replace(CATALOG_MARK, catalogHtml(M.catalog, lang)));
    files.push(rel);
  }
  return { model: M, files };
}

/** Vite plugin: after the static copy (vite.config.js copyStatic), write api/v1/ into dist/. */
export function publicApiPlugin() {
  let outDir = null;
  return {
    name: 'intmap-public-api',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle: { sequential: true, async handler() {
      const { execFile } = await import('node:child_process');
      await new Promise((ok, fail) => execFile(process.execPath, [fileURLToPath(import.meta.url), '--out', outDir],
        { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (stdout) process.stdout.write(stdout);
          if (err) { fail(new Error('public-api failed: ' + (stderr || err.message))); return; }
          ok();
        }));
    } },
  };
}

/* ── main ─────────────────────────────────────────────────────────────────────────────────────────── */
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const t0 = Date.now();
  if (arg('--out')) {
    const { model: M, files } = writeTo(resolve(arg('--out')));
    console.log('public-api: ' + M.catalog.datasets.length + ' datasets offered, ' + M.catalog.withheld.length + ' withheld, '
      + M.countries.countries.length + ' country files from ' + M.tables.length + ' per-country tables — wrote ' + files.length + ' files in ' + (Date.now() - t0) + ' ms');
  } else {
    const M = model();
    console.log('offered (' + M.catalog.datasets.length + '):');
    for (const d of M.catalog.datasets) console.log('  ' + d.id.padEnd(26) + d.licences.join(', ').padEnd(40) + (d.terms.credit ? 'credit ' : '') + (d.terms.shareAlike ? 'SA ' : '') + (d.terms.commercial ? '' : 'NC'));
    console.log('withheld (' + M.catalog.withheld.length + '):');
    for (const w of M.catalog.withheld) console.log('  ' + w.id.padEnd(26) + w.reason + ' — ' + w.detail);
    console.log('per-country tables (' + M.tables.length + '):');
    for (const t of M.tables) console.log('  ' + (t.dataset + (t.member ? '.' + t.member : '')).padEnd(32) + t.countries + ' countries' + (t.outside.length ? ' · ' + t.outside.length + ' keys outside the universe' : ''));
  }
}
