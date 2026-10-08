#!/usr/bin/env node
/* ============================================================================
 *  IntMap · history-pages — the historical-map ENTRY PAGES, generated from what the map draws
 * ----------------------------------------------------------------------------
 *  「求めるのは改善ではなく商品開発、マーケティング、営業。」 (2026-10-03, marketing-engine). A search
 *  engine reads static HTML and runs nothing, and IntMap's map state lives in the address's fragment,
 *  which never reaches a server — so «map of Europe in 1914» could never find the one place that
 *  draws it. These pages are the door: one per region and per DATE AT WHICH WHAT THE MAP DRAWS THERE
 *  CHANGES, in English (history/<region>/<when>/) and Japanese (ja/history/<region>/<when>/), each
 *  listing the names the map draws there and opening the map on that date and that view.
 *
 *  ══ ⚠⚠⚠ THE PAGES STATE ONLY WHAT THE MAP DRAWS — THEY ARE COMPUTED BY THE MAP'S OWN CODE ══════════
 *  .agents/rules/historical-verification.md: a page that names a year and a place makes a claim about
 *  history, and the only claim IntMap can stand behind is «this is what our map draws there, from
 *  this record». So nothing here reads the bundles its own way. js/time-borders.js is INSTANTIATED
 *  (scripts/histeras/time-borders.mjs, the harness hist-fidelity already gates the map through) and
 *  asked `collectionAt(date)` — the one chain the map and the comparison window use (CShapes day by
 *  day, then OpenHistoricalMap, then the historical-basemaps sheets, with every span-fidelity rule
 *  applied) — and `eraLocName` for the Japanese label the map writes. A rule the map changes changes
 *  these pages on the next build; there is no second copy of it to fall behind.
 *    · NAMES      the feature's NAME (CShapes's are already the era names js/time-borders.js gives
 *                 a state-system code at that date — «German Empire», not today's «Germany»);
 *                 Japanese from the record's own `_i18n.jp`, else the map's name tables, else the
 *                 source's spelling, as the map does (CONSTITUTION.md §7).
 *    · WHERE      a name is listed for a region when its outline has area inside the region's box.
 *                 The area is the drawn outline's, clipped to the box, on the sphere — a fact about
 *                 the map, labelled as approximate on the page, never offered as a historical area.
 *    · WHEN       below the OpenHistoricalMap floor (js/time-borders.js HB_MIN) the map shows one
 *                 sheet per year, so there is one page per sheet; from the floor to the last CShapes
 *                 year the map is day by day, and it is sampled on 1 July of every year (the instant
 *                 the app's own year links open on). A page covers a RUN of years whose names in the
 *                 region are the same — so two neighbouring pages always differ, and every page says
 *                 which years it covers and links each of them.
 *    · SOURCE     the record the tier came from, with its licence, read from the bundle's own `src`.
 *
 *  ══ WHY THEY ARE BUILT, NOT COMMITTED ═════════════════════════════════════════════════════════════
 *  ~1,600 pages per language. Committed, every rebuild of a historical record would rewrite thousands
 *  of tracked files. They are written into dist/ by `historyPagesPlugin` (vite.config.js) after the
 *  static copy and before the site URL is filled in, and gated by tests/marketing-engine-checks.test.mjs.
 *  Their sitemap is a file of its own (sitemap-history.xml) beside the hand-run one, joined by
 *  sitemap-index.xml — scripts/landing.mjs owns sitemap.xml and robots.txt.
 *
 *    node scripts/history-pages.mjs --out <dir>   write the pages, the two sitemaps, into <dir>
 *    node scripts/history-pages.mjs --stats       count pages per region and tier; write nothing
 *    node scripts/history-pages.mjs --list        every page path
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TEXT } from './history-pages-text.mjs';
import { SITE_TOKEN } from './site-url.mjs';
import { encode } from '../js/map-state.js';
import { SITEMAP as UPDATES_SITEMAP } from './whats-new.mjs';   /* (ops-next) the updates pages' sitemap, joined here */
import { fitView } from '../js/on-this-day.js';   /* (marketing-next) the one camera fit */
import { OTD_SITEMAP } from './on-this-day-pages.mjs';   /* (marketing-next) the third generator's sitemap, joined by the index (a cycle: read only when the index is written) */
import { COUNTRY_HUB, COUNTRY_SITEMAP } from './country-pages.mjs';   /* (country-pages) the country pages' hub and sitemap (a cycle, read only when a page or the index is written) */
import { TEXT as COUNTRY_TEXT } from './country-pages-text.mjs';
import { WEEKLY_SITEMAP } from './weekly-earth-pages.mjs';   /* (weekly-earth) the weekly digest's sitemap, joined the same way (the same cycle, read only when the index is written) */
import { YEAR_HUB, YEAR_SITEMAP, chooseYears } from './year-choice.mjs';   /* (history-year-pages) the year pages' hub, sitemap and choice — a module that imports nothing from here */
import { TEXT as YEAR_TEXT } from './year-pages-text.mjs';
import { shareLinks } from './lib/share-targets.mjs';   /* (marketing-growth) the reader's share links at the foot of every page */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ══ THE REGIONS — the scope of a page, declared, and printed on every page it scopes ══════════════════
   A region is not a historical claim: it is the frame a reader asks for («Europe», «East Asia») and the
   frame the map opens on. Each is one or more lon/lat boxes (west, south, east, north); regions overlap
   where the conventional names do (Turkey is in Europe's frame and the Middle East's). The box is the
   whole rule — the page prints it — so a reader can see why a name is or is not listed. Changing a box
   changes which pages exist; nothing else has to follow. Oceania is three boxes because a box cannot
   cross 180°.
   ⚠ (no-ad-hoc-hardcoding §4) observation: drawn around the land each conventional name covers, on
   today's coastlines; lapses: never — they are definitions of a page's scope, not measurements;
   canonical: here, and only here (the pages, the sitemap and the tests read REGIONS). */
export const REGIONS = [
  { id: 'world', boxes: [[-180, -90, 180, 90]] },
  { id: 'europe', boxes: [[-25, 34, 45, 72]] },
  { id: 'middle-east', boxes: [[25, 12, 63, 42]] },
  { id: 'africa', boxes: [[-20, -36, 52, 38]] },
  { id: 'south-asia', boxes: [[60, 5, 98, 37]] },
  { id: 'east-asia', boxes: [[73, 18, 150, 54]] },
  { id: 'southeast-asia', boxes: [[92, -11, 141, 24]] },
  { id: 'central-asia', boxes: [[46, 35, 90, 56]] },
  { id: 'north-america', boxes: [[-170, 24, -52, 72]] },
  { id: 'central-america', boxes: [[-118, 7, -59, 33]] },
  { id: 'south-america', boxes: [[-82, -56, -34, 13]] },
  { id: 'oceania', boxes: [[110, -50, 180, -10], [129, -10, 180, 25], [-180, -50, -125, 25]] },
];

/* the window the map is framed for (the size the example screenshots are taken at) and MapLibre's tile are
   js/on-this-day.js's FRAME and TILE — its fitView is the one camera fit both generators use */

/* ── languages ──────────────────────────────────────────────────────────────────────────────── */
export const LANGS = [
  { key: 'en', tag: 'en', dir: '', locale: 'en_US', intl: 'en-US' },
  { key: 'jp', tag: 'ja', dir: 'ja/', locale: 'ja_JP', intl: 'ja-JP' },
];
export const HUB = 'history/';
export const SITEMAP = 'sitemap-history.xml';
export const SITEMAP_INDEX = 'sitemap-index.xml';
/* scripts/landing.mjs's sitemap, joined by the index (it is not this file's to write) */
const LANDING_SITEMAP = 'sitemap.xml';

/* ══ THE MAP, INSTANTIATED ══════════════════════════════════════════════════════════════════════════
   The harness takes a fetch; this one serves the repository's own files, the way the deployed site
   serves them to the page. */
function repoFetch(root) {
  return async (u) => {
    const rel = String(u).replace(/^[a-z]+:\/\/[^/]+\//i, '').replace(/^\.?\//, '').split(/[?#]/)[0];
    const p = join(root, rel);
    const ok = existsSync(p);
    const b = ok ? readFileSync(p) : Buffer.alloc(0);
    return { ok, status: ok ? 200 : 404,
      arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      json: async () => JSON.parse(b.toString('utf8')), text: async () => b.toString('utf8') };
  };
}
const readBundle = (rel) => { const t = readFileSync(join(ROOT, rel), 'utf8'); return JSON.parse(t.slice(t.indexOf('=') + 1).replace(/;\s*$/, '')); };
function need(re, src, what) { const m = re.exec(src); if (!m) throw new Error('history-pages: cannot read ' + what); return m; }

/** The bands of the map's clock, from the files that own them (the numbers scripts/landing.mjs reads too). */
export function bands() {
  const tb = readFileSync(join(ROOT, 'js/time-borders.js'), 'utf8');
  const [, hbMin, hbMax] = need(/const HB_MIN=(\d+), HB_MAX=(\d+);/, tb, 'js/time-borders.js HB_MIN/HB_MAX');
  const [, csMin, csMax] = need(/const CS_MIN=(\d+), CS_MAX=(\d+);/, tb, 'js/time-borders.js CS_MIN/CS_MAX');
  const hs = readFileSync(join(ROOT, 'js/hist-scale.js'), 'utf8');
  const floor = +need(/const FLOOR = (-?\d+);/, hs, 'js/hist-scale.js FLOOR')[1];
  return { floor, ohmFrom: +hbMin, ohmTo: +hbMax, csFrom: +csMin, csTo: +csMax };
}

/* ── geometry: parts, area on the sphere, clipping to a box ──────────────────────────────────── */
const R_KM = 6371.0088;   /* the IUGG mean Earth radius */
const RAD = Math.PI / 180;
const partsOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
/** a ring's area on the sphere, km² (the spherical-excess sum d3-geo and turf use) */
function ringKm2(ring) {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    s += (b[0] - a[0]) * RAD * (2 + Math.sin(a[1] * RAD) + Math.sin(b[1] * RAD));
  }
  return Math.abs(s) * R_KM * R_KM / 2;
}
function bboxOf(ring) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of ring) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
  return b;
}
/** Sutherland–Hodgman against the four edges of an axis-aligned box */
function clipRing(ring, box) {
  let out = ring;
  const edges = [
    [(p) => p[0] >= box[0], (a, b) => [box[0], a[1] + (b[1] - a[1]) * (box[0] - a[0]) / (b[0] - a[0])]],
    [(p) => p[0] <= box[2], (a, b) => [box[2], a[1] + (b[1] - a[1]) * (box[2] - a[0]) / (b[0] - a[0])]],
    [(p) => p[1] >= box[1], (a, b) => [a[0] + (b[0] - a[0]) * (box[1] - a[1]) / (b[1] - a[1]), box[1]]],
    [(p) => p[1] <= box[3], (a, b) => [a[0] + (b[0] - a[0]) * (box[3] - a[1]) / (b[1] - a[1]), box[3]]],
  ];
  for (const [inside, cut] of edges) {
    const inp = out; out = [];
    if (!inp.length) break;
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) { if (!pi) out.push(cut(prev, cur)); out.push(cur); } else if (pi) out.push(cut(prev, cur));
    }
  }
  return out;
}
const PART = new WeakMap();   /* part → { bb, km, by: Map(boxKey → km² inside) } */
function partInfo(part) {
  let p = PART.get(part);
  if (!p) {
    const km = Math.max(0, ringKm2(part[0]) - part.slice(1).reduce((s, h) => s + ringKm2(h), 0));
    p = { bb: bboxOf(part[0]), km, by: new Map() };
    PART.set(part, p);
  }
  return p;
}
/** km² of one polygon part inside one box */
export function partKm2In(part, box) {
  const info = partInfo(part);
  const bb = info.bb;
  if (bb[2] < box[0] || bb[0] > box[2] || bb[3] < box[1] || bb[1] > box[3]) return 0;
  if (bb[0] >= box[0] && bb[2] <= box[2] && bb[1] >= box[1] && bb[3] <= box[3]) return info.km;
  const k = box.join(',');
  if (!info.by.has(k)) {
    const outer = clipRing(part[0], box);
    const holes = part.slice(1).map((h) => clipRing(h, box));
    const km = outer.length >= 3 ? Math.max(0, ringKm2(outer) - holes.reduce((s, h) => s + (h.length >= 3 ? ringKm2(h) : 0), 0)) : 0;
    info.by.set(k, km);
  }
  return info.by.get(k);
}

/* ── the camera for a region: the boxes' union, unwrapped across 180°, fitted into the frame (js/on-this-day.js fitView) ── */
export function regionView(region) {
  /* choose, for each box, the copy (−360, 0, +360) that keeps the union narrowest */
  let best = null;
  const boxes = region.boxes;
  const tries = boxes.length === 1 ? [[0]] : (function combos(i) { if (i === boxes.length) return [[]]; const rest = combos(i + 1); return [-360, 0, 360].flatMap((s) => rest.map((r) => [s, ...r])); })(0);
  for (const shift of tries) {
    const w = Math.min(...boxes.map((b, i) => b[0] + shift[i])), e = Math.max(...boxes.map((b, i) => b[2] + shift[i]));
    if (!best || e - w < best.e - best.w) best = { w, e };
  }
  const s = Math.min(...boxes.map((b) => b[1])), n = Math.max(...boxes.map((b) => b[3]));
  return fitView(best.w, s, best.e, n);   /* (marketing-next) the one fit, js/on-this-day.js — the same frame the «on this day» links open in */
}

/* ── dates ──────────────────────────────────────────────────────────────────────────────────── */
/** the instant 1 July of an astronomical year, local time — what collectionAt reads (getFullYear) */
function july1(y) { const d = new Date(2000, 6, 1, 12, 0, 0); d.setFullYear(y); return d; }
/** the app's own date grammar for `tt`: ECMA's extended ISO year (js/hist-scale.js ymd states the same) */
export function isoDay(y, m = 7, d = 1) {
  const t = new Date(Date.UTC(2000, m - 1, d)); t.setUTCFullYear(y);
  return t.toISOString().slice(0, t.toISOString().indexOf('T'));
}
/** astronomical year → what a reader is shown (year 0 is 1 BC) */
export function yearWords(y, lang) {
  const intl = lang === 'jp' ? 'ja-JP' : 'en-US';
  if (y <= 0) { const bc = (1 - y).toLocaleString(intl); return lang === 'jp' ? '紀元前' + bc + '年' : bc + ' BC'; }
  return lang === 'jp' ? y + '年' : String(y);
}
const dayWords = (y, lang) => (lang === 'jp' ? yearWords(y, lang) + '7月1日' : '1 July ' + yearWords(y, lang));
export const slugOf = (y) => (y <= 0 ? (1 - y) + '-bc' : String(y));

/* ══ THE MAP, INSTANTIATED, WITH THE LABELS IT WRITES ══════════════════════════════════════════════════
   (marketing-next) One reader for every generator that states what the map draws on a date — these pages and the
   «on this day» record (scripts/build-on-this-day.mjs) — so the two cannot name the same outline differently.
   `labelsAt(date)` answers what js/time-borders.js `collectionAt` answers (the record chosen for the instant, its
   features) and the name the map writes on each feature in each language (the `tagSame` pass, as below). */
export async function mapReader() {
  const B = bands();
  const { timeBorders } = await import('./histeras/time-borders.mjs');
  /* `countryStats` — the app's country table, which the label pass reads for two things: the present-day name
     of a country whose outline has not changed (so 1913's Spain is labelled as today's Spain is, スペイン in
     Japanese), and the former states the Countries list is standing over (Russian Empire, Austria-Hungary …).
     ① THE MODERN ROWS are built from the file the app builds them from (Natural Earth admin-0, the 10 m scale
        js/countries-ui.js ends on), with the four fields the label pass reads, read the way js/countries-ui.js
        `_mkStat` reads them (the region code `a2` too) — tests/marketing-engine-checks.test.mjs holds those expressions to that file.
     ② THE FORMER-STATE ROWS are what js/history.js histStates.apply puts there for the date: a state active on
        it, under its own era name. The app adds a row only when the state's successors have data; every state
        in STATES has present-day successors in the country table, so every active one is added. */
  const NE = await import('../js/ne-countries.js');
  const { gunzipSync } = await import('node:zlib');
  const ne10 = NE.decodeNECountries(JSON.parse(gunzipSync(readFileSync(join(ROOT, NE.neCountriesPath('10m')))).toString('utf8')));
  const modern = {};
  for (const f of ne10.features) {
    const q = f.properties || {};
    const code = String(q.ADM0_A3 || q.ISO_A3 || q.NAME || '');
    if (!code || modern[code]) continue;
    const type = String(q.TYPE || '');
    const isCountry = /^(sovereign country|country)$/i.test(type);
    const nonSov = (type === 'Indeterminate') || (!isCountry && /indetermin|unrecogn/i.test(String(q.FCLASS_TLC || q.featurecla || q.FEATURECLA || '')));
    const a2 = (q.ISO_A2_EH && q.ISO_A2_EH !== '-99') ? q.ISO_A2_EH : q.ISO_A2;   /* the region code the label pass reads a PLACE's name by (js/time-borders.js _placeLoc) */
    modern[code] = { nameEn: q.NAME_EN || q.ADMIN || q.NAME || code, nameJp: q.NAME_JA || q.NAME_EN || q.ADMIN || code, a2: a2 || '', sov: !nonSov };
  }
  const stats = Object.assign({}, modern);
  /* the clock the module reads (IntMapTime.year — js/time-borders.js asks it which of two states sharing a name
     is the era-correct one) follows the instant being asked: the harness reads `clock.year` on every call */
  const clock = { lang: 'en', fetch: repoFetch(ROOT), year: B.ohmFrom, countryStats: stats };
  const { api, window: w, host } = await timeBorders(clock);
  /* the two tables the label pass reads off `window` in the page (js/app-body.js publishes them): the era
     identities of single countries (js/history.js histId — a pure function of the year) and the Maddison
     floor below which the Countries list, and so the labels, keep the modern names */
  const { importModule } = await import('./lib/import-module.mjs');
  const H = await importModule('js/history.js');
  w.IntMapHistId = H.histId({});
  w.IntMapMaddison = H.maddison();
  await w.IntMapMaddison.load();
  const HS = w.IntMapHistStates;
  const formerFor = (y) => {
    for (const S of HS.STATES) if (stats[S.code] && stats[S.code]._hist) delete stats[S.code];
    if (y < w.IntMapMaddison.minYear) return;   /* below the Countries list's floor the app applies no former state */
    for (const S of HS.activeAt(y + '-07-01T00:00:00Z')) stats[S.code] = { _hist: true, name: S.name, nameEn: w.IntMapHistName(S.name, 0), nameJp: w.IntMapHistName(S.name, 1), sov: true };
  };

  /** what the map draws on `when` (a Date), and the name it writes on each feature in each language */
  async function labelsAt(when) {
    const y = when.getFullYear();
    clock.year = y;
    formerFor(y);
    const r = await api.collectionAt(when);
    if (!r || r.modern || !r.fc) return r ? { modern: !!r.modern, tier: r.tier || null, fc: null, labels: null } : null;
    /* what the map writes on each outline, in each language: the pass `apply` runs before the name layers
       are fed (js/time-borders.js tagSame) — `_same` names take `_modName`, the rest `_locName` or NAME,
       exactly the two layers' text-field. A `_corrected` outline is drawn as part of its NAME and carries
       no label of its own, so it is counted under that NAME. */
    const labels = {};
    for (const L of LANGS) {
      host.lang = L.key;
      api.tagSame(r.fc, y);
      labels[L.key] = r.fc.features.map((f) => {
        const p = f.properties || {};
        const v = p._corrected ? (p.NAME || p.name) : p._same === 1 ? (p._modName || p.NAME || p.name) : (p._locName || p.NAME || p.name);
        return String(v || '').trim();
      });
    }
    /* (hist-coverage-expansion) a composed answer is named by the records it is composed of, in order —
       «cshapes+clio» from 1886, «ohm+clio+sheet» before — and cites them in their own words */
    const tier = (r.tier === 'composite' && r.record && r.record.parts) ? 'composite:' + r.record.parts.map((x) => x.tier).join('+') : r.tier;
    return { modern: false, tier, src: (r.record && r.record.src) || null, fc: r.fc, labels };
  }
  return { bands: B, api, labelsAt };
}

/** the words for the record(s) a page's borders come from — a composed tier lists its records in order */
export function tierWords(tier, T) {
  if (String(tier).indexOf('composite:') !== 0) return T.tiers[tier];
  return String(tier).slice(10).split('+').map((k) => T.records[k] || k).join(T.recordsJoin) + T.recordsComposed;
}

/* ══ COLLECT — ask the map what it draws, at every instant a page could stand for ════════════════════ */
/**
 * @param {{ years?: number[], regions?: string[] }} [opt]  a subset, for the checks; default everything
 * @returns {Promise<object>} the model the pages are rendered from
 */
export async function collect(opt = {}) {
  const R = await mapReader();
  const { bands: B, labelsAt } = R;
  const sheetYears = readBundle('data/hist-eras.js').snaps.map((s) => s.y).filter((y) => y < B.ohmFrom).sort((a, b) => a - b);
  const all = [...sheetYears];
  for (let y = B.ohmFrom; y <= B.csTo; y++) all.push(y);
  const years = opt.years ? all.filter((y) => opt.years.includes(y)) : all;
  const regions = REGIONS.filter((r) => !opt.regions || opt.regions.includes(r.id));
  const src = {
    snapshot: readBundle('data/hist-eras.js').src, ohm: readBundle('data/hist-borders.js').src, cshapes: readBundle('data/cshapes.js').src,
  };
  const samples = [];   /* per instant: { y, sheet, tier, per: { regionId → { names: Map(en → row), unnamed } } } */
  for (const y of years) {
    const r = await labelsAt(july1(y));
    if (!r || r.modern || !r.fc) throw new Error('history-pages: the map answered nothing for ' + isoDay(y) + ' — a record did not load');
    const labels = r.labels;
    const per = {};
    for (const reg of regions) per[reg.id] = { names: new Map(), unnamed: 0 };
    r.fc.features.forEach((f, i) => {
      const p = f.properties || {};
      const parts = partsOf(f.geometry);
      if (!parts.length) return;
      const en = labels.en[i], jp = labels.jp[i];
      for (const reg of regions) {
        let km = 0;
        for (const part of parts) for (const box of reg.boxes) km += partKm2In(part, box);
        if (!(km > 0)) continue;
        const slot = per[reg.id];
        if (!en) { slot.unnamed++; continue; }
        const row = slot.names.get(en);
        if (row) { row.km += km; continue; }
        slot.names.set(en, { en, jp: jp && jp !== en ? jp : null, km, desc: !!p._desc });
      }
    });
    samples.push({ y, sheet: y < B.ohmFrom, tier: r.tier, src: r.src || null, per });
  }
  /* the runs: a new page where the names (or the record) change; a sheet is always its own page */
  const pages = [];
  for (const reg of regions) {
    let cur = null;
    for (const s of samples) {
      const slot = s.per[reg.id];
      const names = [...slot.names.values()].sort((a, b) => b.km - a.km || a.en.localeCompare(b.en));
      const key = s.tier + '|' + names.map((n) => n.en).sort().join('\u0001');
      if (!names.length) { cur = null; continue; }   /* nothing drawn here: no page (and the next run starts fresh) */
      if (cur && !s.sheet && !cur.sheet && cur.key === key && cur.last === s.y - 1) { cur.last = s.y; cur.years.push(s.y); continue; }
      cur = { region: reg.id, key, sheet: s.sheet, tier: s.tier, src: s.src, first: s.y, last: s.y, years: [s.y], names, unnamed: slot.unnamed };
      pages.push(cur);
    }
  }
  /* neighbours, changes, and the same date elsewhere */
  const byRegion = new Map();
  for (const p of pages) (byRegion.get(p.region) || byRegion.set(p.region, []).get(p.region)).push(p);
  for (const list of byRegion.values()) {
    list.forEach((p, i) => {
      p.prev = list[i - 1] || null; p.next = list[i + 1] || null;
      if (p.prev) {
        const a = new Set(p.prev.names.map((n) => n.en)), b = new Set(p.names.map((n) => n.en));
        p.added = p.names.filter((n) => !a.has(n.en));
        p.removed = p.prev.names.filter((n) => !b.has(n.en));
      }
    });
  }
  const covering = (regionId, y) => (byRegion.get(regionId) || []).find((q) => y >= q.first && y <= q.last) || null;
  for (const p of pages) p.elsewhere = regions.filter((r) => r.id !== p.region).map((r) => covering(r.id, p.first)).filter(Boolean);
  /* (history-year-pages) the years scripts/year-pages.mjs writes a page for — its own rule, asked here so a world page links them */
  const yearPages = new Set((await chooseYears(R, JSON.parse(readFileSync(join(ROOT, 'data/on-this-day.json'), 'utf8')))).years);
  return { bands: B, src, regions, pages, byRegion, yearPages };
}

/* ══ RENDER ══════════════════════════════════════════════════════════════════════════════════════ */
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function fill(s, W) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in W)) throw new Error('history-pages: unknown placeholder ' + m + ' in «' + s + '»');
    return W[k];
  });
}
export const pagePath = (p, L) => L.dir + HUB + p.region + '/' + slugOf(p.first) + '/';
export const regionPath = (regionId, L) => L.dir + HUB + regionId + '/';
export const hubPath = (L) => L.dir + HUB;
/* the relative way back to the site's root from a directory path */
export const upFrom = (dirPath) => '../'.repeat(dirPath.split('/').filter(Boolean).length);

function whenWords(p, lang) {
  if (p.sheet || p.first === p.last) return yearWords(p.first, lang);
  return lang === 'jp' ? p.first + '〜' + p.last + '年' : p.first + '–' + p.last;
}
function boxWords(region, lang) {
  const lon = (x) => (x === 0 ? '0°' : lang === 'jp' ? (x < 0 ? '西経' : '東経') + Math.abs(x) + '度' : Math.abs(x) + '°' + (x < 0 ? 'W' : 'E'));
  const lat = (y) => (y === 0 ? (lang === 'jp' ? '赤道' : '0°') : lang === 'jp' ? (y < 0 ? '南緯' : '北緯') + Math.abs(y) + '度' : Math.abs(y) + '°' + (y < 0 ? 'S' : 'N'));
  return region.boxes.map((b) => (lang === 'jp'
    ? lon(b[0]) + '〜' + lon(b[2]) + '・' + lat(b[1]) + '〜' + lat(b[3])
    : lon(b[0]) + '–' + lon(b[2]) + ', ' + lat(b[1]) + '–' + lat(b[3]))).join(lang === 'jp' ? '、' : '; ');
}
const nameFor = (n, lang) => (lang === 'jp' && n.jp ? n.jp : n.en);
const fmt = (v, L) => v.toLocaleString(L.intl);
const km2Words = (km, L) => (km < 1 ? '<1' : km.toLocaleString(L.intl, { maximumSignificantDigits: 3 }));

/** the address that opens the map on this page's region and first date */
export function mapLink(p, region) {
  return 'index.html' + encode({ view: regionView(region), time: { at: isoDay(p.first) } });
}

const FONT_CSS_ORIGIN = 'https://fonts.googleapis.com', FONT_FILE_ORIGIN = 'https://fonts.gstatic.com';
/* the same policy scripts/landing.mjs writes for its pages, minus the inline script these pages do not run:
   nothing here executes, so script-src is this origin only and there is no hash to compute */
function cspMeta(webFonts) {
  const css = webFonts ? ' ' + FONT_CSS_ORIGIN : '', files = webFonts ? ' ' + FONT_FILE_ORIGIN : '';
  return '<meta http-equiv="Content-Security-Policy" content="' + [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'", "form-action 'self'", "frame-src 'none'",
    "connect-src 'self'", "img-src 'self' data:", "style-src 'self'" + css, "font-src 'self' data:" + files, "script-src 'self'",
  ].join('; ') + '">';
}
const ldJson = (o) => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>';

/* (marketing-growth) every page of the family ends with the reader's share links (scripts/lib/share-targets.mjs) — plain
   links that open a service's own compose screen; nothing is sent from the page. An image with `alt` also states it to
   Open Graph and X (the year and country pages' own cards, scripts/lib/page-card.mjs). */
/* (marketing-next) exported: the «on this day» pages (scripts/on-this-day-pages.mjs) are the same family — one head, one nav, one footer */
export function shell(M, L, o) {
  const T = TEXT[L.key];
  const up = upFrom(o.path);
  const other = LANGS.find((l) => l !== L);
  const url = (l) => SITE_TOKEN + o.pathFor(l);
  const cjk = L.tag === 'ja'
    ? `\n<link rel="preconnect" href="${FONT_CSS_ORIGIN}">\n<link rel="preconnect" href="${FONT_FILE_ORIGIN}" crossorigin>\n<link rel="stylesheet" href="${FONT_CSS_ORIGIN}/css2?family=Noto+Sans+JP:wght@400;500;600;700&amp;display=swap">`
    : '';
  return `<!DOCTYPE html>
<html lang="${L.tag}">
<head>
<meta charset="utf-8">
${cspMeta(!!cjk)}
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- GENERATED by scripts/history-pages.mjs from what js/time-borders.js draws — edit the generator or its words (scripts/history-pages-text.mjs). -->
<title>${esc(o.title)} | IntMap</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(url(L))}">
${LANGS.map((l) => `<link rel="alternate" hreflang="${l.tag}" href="${esc(url(l))}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${esc(url(LANGS[0]))}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="IntMap">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(url(L))}">
<meta property="og:image" content="${esc(SITE_TOKEN + M.image.path)}">
<meta property="og:image:width" content="${M.image.width}">
<meta property="og:image:height" content="${M.image.height}">
${M.image.alt ? `<meta property="og:image:alt" content="${esc(M.image.alt)}">
<meta name="twitter:image:alt" content="${esc(M.image.alt)}">
` : ''}<meta property="og:locale" content="${L.locale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${up}IntMap.Icon.png">${cjk}
<link rel="stylesheet" href="${up}css/fonts.css">
<link rel="stylesheet" href="${up}css/pages.css">
<link rel="stylesheet" href="${up}css/landing.css">
<link rel="stylesheet" href="${up}css/history-pages.css">
${o.ld.map(ldJson).join('\n')}
</head>
<body class="lp lp-hist">
<header class="lp-top">
  <nav class="lp-top-in" aria-label="IntMap">
    <a class="lp-brand" href="${up}${L.dir}about.html"><img src="${up}IntMap.Icon.png" alt="" width="28" height="28"><span>IntMap</span></a>
    <span class="lp-top-spacer"></span>
    <a class="lp-top-link" href="${up}${hubPath(L)}">${esc(T.breadcrumbHistory)}</a>
    <a class="lp-lang" href="${up}${o.pathFor(other)}" hreflang="${other.tag}" lang="${other.tag}" aria-label="${esc(T.nav.langLabel)}">${esc(T.nav.lang)}</a>
    <a class="lp-btn lp-btn-sm" href="${up}index.html">${esc(T.nav.open)}</a>
  </nav>
</header>
<main class="lp-main">
${o.crumbs ? `<nav class="hp-crumbs" aria-label="breadcrumb">${o.crumbs.map((c, i) => (i < o.crumbs.length - 1 ? `<a href="${up}${c.path}">${esc(c.name)}</a>` : `<span aria-current="page">${esc(c.name)}</span>`)).join(' <span class="hp-sep">/</span> ')}</nav>` : ''}
${o.body(up)}
  <section class="lp-sec hp-share" id="share">
    <h2>${esc(T.share.h2)}</h2>
    <p class="hp-chips">${shareLinks(SITE_TOKEN, o.pathFor(L)).map((s) => `<a href="${esc(s.href)}" data-share="${esc(s.id)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>`).join(' ')}</p>
    <p class="lp-note">${esc(T.share.note)}</p>
  </section>
</main>
<footer class="lp-foot">
  <nav class="lp-foot-in">
    <a href="${up}sources.html">${esc(T.footer.sources)}</a>
    <a href="${up}science.html">${esc(T.footer.science)}</a>
    <a href="${up}privacy.html">${esc(T.footer.privacy)}</a>
    <a href="${up}terms.html">${esc(T.footer.terms)}</a>
    <span class="lp-foot-mark">IntMap</span>
  </nav>
</footer>
</body>
</html>
`;
}

export function breadcrumbLd(crumbs) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE_TOKEN + c.path })) };
}

function renderPage(M, p, L) {
  const T = TEXT[L.key], lang = L.key;
  const region = M.regions.find((r) => r.id === p.region);
  const RN = T.regions[p.region];
  const when = whenWords(p, lang);
  const n = fmt(p.names.length, L);
  const tier = tierWords(p.tier, T);
  const W = { mapOf: RN.mapOf, region: RN.name, when, n, tier, date: dayWords(p.first, lang),
    first: yearWords(p.first, lang), last: yearWords(p.last, lang) };
  const single = p.sheet || p.first === p.last;
  const title = fill(single ? T.titleOne : T.titleSpan, W);
  const whenPhrase = fill(p.sheet ? T.whenPhraseSheet : single ? T.whenPhraseDay : T.whenPhraseSpan, W);
  const top = p.names.slice(0, 4).map((x) => nameFor(x, lang)).join(lang === 'jp' ? '、' : ', ') + (p.names.length > 4 ? (lang === 'jp' ? 'など' : '…') : '');
  const description = fill(T.description, { ...W, whenPhrase, top });
  const lede = fill(p.sheet ? T.ledeSheet : single ? T.ledeDay : T.ledeSpan, W);
  const crumbs = [
    { name: T.breadcrumbHistory, path: hubPath(L) },
    { name: RN.mapOf, path: regionPath(p.region, L) },
    { name: when, path: pagePath(p, L) },
  ];
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description, url: SITE_TOKEN + pagePath(p, L), inLanguage: L.tag,
      isPartOf: { '@type': 'WebSite', name: 'IntMap', url: SITE_TOKEN },
      about: { '@type': 'Place', name: RN.name }, isBasedOn: p.src || M.src[p.tier] },
    breadcrumbLd(crumbs),
  ];
  const showSource = lang === 'jp';
  const rows = p.names.map((x) => `      <tr><td>${esc(nameFor(x, lang))}${x.desc ? ` <span class="hp-desc">(${esc(T.described)})</span>` : ''}</td>${showSource ? `<td lang="en">${x.jp ? esc(x.en) : ''}</td>` : ''}<td class="hp-num">${km2Words(x.km, L)}</td></tr>`).join('\n');
  const list = (arr) => (arr.length ? arr.map((x) => esc(nameFor(x, lang))).join(lang === 'jp' ? '、' : ', ') : esc(T.none));
  const body = (up) => `  <section class="lp-hero lp-hero-t hp-hero">
    <div class="lp-hero-text">
      <h1>${esc(title)}</h1>
      <p class="lp-lede">${esc(lede)}${p.unnamed ? ' ' + esc(fill(T.unnamed, { k: fmt(p.unnamed, L) })) : ''}</p>
      <div class="lp-cta">
        <a class="lp-btn" href="${esc(up + mapLink(p, region))}" data-history-map="${esc(p.region + '/' + slugOf(p.first))}">${esc(T.cta)}</a>
        <a class="lp-btn lp-btn-2" href="${up}${regionPath(p.region, L)}">${esc(fill(T.ctaRegion, W))}</a>
      </div>
    </div>
  </section>

  <section class="lp-sec" id="names">
    <h2>${esc(T.namesH2)}</h2>
    <p class="lp-sub">${esc(T.namesSub)}</p>
    <div class="lp-tablewrap">
      <table>
      <tr><th>${esc(T.colName)}</th>${showSource ? `<th>${esc(T.colSource)}</th>` : ''}<th class="hp-num">${esc(T.colArea)}</th></tr>
${rows}
      </table>
    </div>
  </section>
${single ? '' : `
  <section class="lp-sec" id="years">
    <h2>${esc(T.yearsH2)}</h2>
    <p class="hp-chips">${p.years.map((y) => `<a href="${esc(up + 'index.html' + encode({ view: regionView(region), time: { at: isoDay(y) } }))}">${esc(yearWords(y, lang))}</a>`).join(' ')}</p>
  </section>
`}
  <section class="lp-sec" id="changes">
${p.prev ? `    <h2>${esc(fill(T.changesH2, { prev: whenWords(p.prev, lang) }))}</h2>
    <div class="lp-grid2">
      <div class="lp-tile"><h3>${esc(T.added)}</h3><p>${list(p.added)}</p></div>
      <div class="lp-tile"><h3>${esc(T.removed)}</h3><p>${list(p.removed)}</p></div>
    </div>` : `    <p class="lp-sub">${esc(fill(T.changesFirst, W))}</p>`}
    <p class="hp-nav">${p.prev ? `<a rel="prev" href="${up}${pagePath(p.prev, L)}">← ${esc(T.earlier)}: ${esc(whenWords(p.prev, lang))}</a>` : ''}${p.next ? `<a rel="next" href="${up}${pagePath(p.next, L)}">${esc(T.later)}: ${esc(whenWords(p.next, lang))} →</a>` : ''}</p>
  </section>
${p.region === 'world' && M.yearPages && p.years.some((y) => M.yearPages.has(y)) ? `
  <section class="lp-sec" id="year-pages">
    <p class="hp-chips">${p.years.filter((y) => M.yearPages.has(y)).map((y) => `<a href="${up}${L.dir}${YEAR_HUB}${slugOf(y)}/" data-year-page="${esc(slugOf(y))}">${esc(fill(T.yearPage, { when: yearWords(y, lang) }))}</a>`).join(' ')}</p>
  </section>
` : ''}${p.elsewhere.length ? `
  <section class="lp-sec" id="elsewhere">
    <h2>${esc(T.elsewhereH2)}</h2>
    <p class="hp-chips">${p.elsewhere.map((q) => `<a href="${up}${pagePath(q, L)}">${esc(T.regions[q.region].mapOf)} · ${esc(whenWords(q, lang))}</a>`).join(' ')}</p>
  </section>
` : ''}
  <section class="lp-sec" id="source">
    <h2>${esc(T.sourceH2)}</h2>
    <p>${esc(fill(T.sourceRecord, { src: p.src || M.src[p.tier] }))}</p>
    <p class="lp-note">${esc(fill(T.method, { box: boxWords(region, lang) }))} ${esc(T.methodNames)}</p>
    <p><a class="lp-open" href="${up}sources.html">${esc(T.sourcesLink)} →</a></p>
  </section>`;
  return shell(M, L, { path: pagePath(p, L), pathFor: (l) => pagePath(p, l), title, description, crumbs, ld, body });
}

function periodOf(p, B) { return p.sheet ? 'sheets' : p.first <= B.ohmTo ? 'ohm' : 'cs'; }
function renderRegion(M, regionId, L) {
  const T = TEXT[L.key], lang = L.key, B = M.bands;
  const list = M.byRegion.get(regionId) || [];
  const RN = T.regions[regionId];
  const BW = { ohmFrom: String(B.ohmFrom), ohmTo: String(B.ohmTo), csFrom: String(B.csFrom), csTo: String(B.csTo) };
  const W = { region: RN.name, n: fmt(list.length, L), from: yearWords(list[0].first, lang), to: yearWords(list[list.length - 1].last, lang), ...BW, snapshot: T.tiers.snapshot };
  const title = fill(T.regionTitle, W);
  const description = fill(T.regionDescription, W);
  const crumbs = [{ name: T.breadcrumbHistory, path: hubPath(L) }, { name: RN.mapOf, path: regionPath(regionId, L) }];
  const groups = ['sheets', 'ohm', 'cs'].map((k) => [k, list.filter((p) => periodOf(p, B) === k)]).filter(([, g]) => g.length);
  const head = { sheets: T.periodSheets, ohm: T.periodOhm, cs: T.periodCs };
  const body = (up) => `  <section class="lp-hero lp-hero-t hp-hero">
    <div class="lp-hero-text">
      <h1>${esc(title)}</h1>
      <p class="lp-lede">${esc(fill(T.regionLede, W))}</p>
    </div>
  </section>
${groups.map(([k, g]) => `
  <section class="lp-sec">
    <h2>${esc(fill(head[k], BW))}</h2>
    <p class="hp-chips">${g.map((p) => `<a href="${up}${pagePath(p, L)}">${esc(whenWords(p, lang))}</a>`).join(' ')}</p>
  </section>`).join('\n')}
  <p class="lp-note"><a href="${up}${hubPath(L)}">${esc(T.hubLink)} →</a></p>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description, url: SITE_TOKEN + regionPath(regionId, L), inLanguage: L.tag,
    isPartOf: { '@type': 'WebSite', name: 'IntMap', url: SITE_TOKEN } }, breadcrumbLd(crumbs)];
  return shell(M, L, { path: regionPath(regionId, L), pathFor: (l) => regionPath(regionId, l), title, description, crumbs, ld, body });
}

function renderHub(M, L) {
  const T = TEXT[L.key], lang = L.key, B = M.bands;
  const floorBC = yearWords(B.floor, lang);
  const W = { floorBC, csTo: String(B.csTo), ohmFrom: String(B.ohmFrom), ohmTo: String(B.ohmTo), csFrom: String(B.csFrom),
    snapshot: T.tiers.snapshot, ohm: T.tiers.ohm, cshapes: T.tiers.cshapes };
  const title = T.hubTitle;
  const description = fill(T.hubDescription, W);
  const crumbs = [{ name: T.breadcrumbHistory, path: hubPath(L) }];
  const body = (up) => `  <section class="lp-hero lp-hero-t hp-hero">
    <div class="lp-hero-text">
      <h1>${esc(title)}</h1>
      <p class="lp-lede">${esc(fill(T.hubLede, W))}</p>
    </div>
  </section>
  <section class="lp-sec">
    <h2>${esc(T.hubRegions)}</h2>
    <div class="lp-grid3">
${M.regions.filter((r) => M.byRegion.has(r.id)).map((r) => { const list = M.byRegion.get(r.id); return `      <a class="lp-tile hp-region" href="${up}${regionPath(r.id, L)}"><h3>${esc(T.regions[r.id].mapOf)}</h3><p>${esc(yearWords(list[0].first, lang))} – ${esc(yearWords(list[list.length - 1].last, lang))} · ${esc(fill(T.hubCount, { n: fmt(list.length, L) }))}</p></a>`; }).join('\n')}
    </div>
  </section>
  <p class="hp-chips"><a href="${up}${L.dir}${YEAR_HUB}">${esc(YEAR_TEXT[L.key].crumb)}</a> <a href="${up}${L.dir}${COUNTRY_HUB}">${esc(COUNTRY_TEXT[L.key].nav.hub)}</a></p>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description, url: SITE_TOKEN + hubPath(L), inLanguage: L.tag,
    isPartOf: { '@type': 'WebSite', name: 'IntMap', url: SITE_TOKEN } }, breadcrumbLd(crumbs)];
  return shell(M, L, { path: hubPath(L), pathFor: (l) => hubPath(l), title, description, crumbs: null, ld, body });
}

/* ── sitemaps ───────────────────────────────────────────────────────────────────────────────── */
/* (country-pages) exported with the generator's name, so the country pages write the same sitemap form */
export function sitemap(paths, by = 'scripts/history-pages.mjs') {
  /* every language version is a <url> of its own, each listing the whole set (Google's sitemap hreflang rule) */
  const all = [];
  for (const pf of paths) for (const L of LANGS) {
    all.push(`  <url><loc>${esc(SITE_TOKEN + pf(L))}</loc>\n${LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.tag}" href="${esc(SITE_TOKEN + pf(l))}"/>`).join('\n')}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(SITE_TOKEN + pf(LANGS[0]))}"/>\n  </url>`);
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!-- GENERATED by ' + by + ' when the site is built. -->\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + all.join('\n') + '\n</urlset>\n';
}
export function sitemapIndex() {   /* exported: tests/weekly-earth-checks.test.mjs reads the index the build writes */
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!-- GENERATED by scripts/history-pages.mjs: the site\'s sitemaps, one per generator. -->\n'
    + '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + [LANDING_SITEMAP, SITEMAP, UPDATES_SITEMAP, OTD_SITEMAP, COUNTRY_SITEMAP, WEEKLY_SITEMAP, YEAR_SITEMAP].map((s) => `  <sitemap><loc>${esc(SITE_TOKEN + s)}</loc></sitemap>`).join('\n') + '\n</sitemapindex>\n';
}

/* the social picture every generated page names: the site's own, its size read from the file */
export function siteImage() {
  const path = 'og-image.jpg';
  const b = readFileSync(join(ROOT, path));
  if (!(b[0] === 0xff && b[1] === 0xd8)) throw new Error('history-pages: ' + path + ' is not a JPEG');
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { path, width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  throw new Error('history-pages: no frame header in ' + path);
}

/** path (relative to the site root) → file body, for every file this generator writes */
export function outputs(M) {
  M.image = M.image || siteImage();
  const out = {};
  for (const L of LANGS) {
    for (const p of M.pages) out[pagePath(p, L) + 'index.html'] = renderPage(M, p, L);
    for (const id of M.byRegion.keys()) out[regionPath(id, L) + 'index.html'] = renderRegion(M, id, L);
    out[hubPath(L) + 'index.html'] = renderHub(M, L);
  }
  const paths = [(l) => hubPath(l), ...[...M.byRegion.keys()].map((id) => (l) => regionPath(id, l)), ...M.pages.map((p) => (l) => pagePath(p, l))];
  out[SITEMAP] = sitemap(paths);
  out[SITEMAP_INDEX] = sitemapIndex();
  return out;
}

export async function writeTo(dir, opt) {
  const M = await collect(opt);
  const out = outputs(M);
  for (const [rel, body] of Object.entries(out)) { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); }
  return { model: M, files: Object.keys(out) };
}

/** Vite plugin: write the pages into dist/ after the static copy (vite.config.js copyStatic), before the
 *  site URL is filled in (scripts/site-url.mjs siteUrlPlugin runs `post` and walks the same tree).
 *  ⚠ IN A CHILD PROCESS: instantiating js/time-borders.js installs a browser's globals (window, document,
 *  fetch …) on the process it runs in (scripts/lib/import-module.mjs installGlobals). Vite's own process
 *  is not the place for them, so the build runs this file's CLI and waits for it. */
export function historyPagesPlugin() {
  let outDir = null;
  return {
    name: 'intmap-history-pages',
    apply: 'build',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    closeBundle: { sequential: true, async handler() {
      const { execFile } = await import('node:child_process');
      await new Promise((ok, fail) => execFile(process.execPath, [fileURLToPath(import.meta.url), '--out', outDir],
        { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (stdout) process.stdout.write(stdout);
          if (err) { fail(new Error('history-pages failed: ' + (stderr || err.message))); return; }
          ok();
        }));
    } },
  };
}

/* ── main ─────────────────────────────────────────────────────────────────────────────────────── */
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
/* (history-year-pages) not a top-level await: collect() imports scripts/year-pages.mjs, which imports this
   module back; a top-level await here keeps this module unevaluated while that import waits for it, and the
   two wait on each other ("unsettled top-level await"). */
if (isMain) (async () => {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const t0 = Date.now();
  if (arg('--out')) {
    const { model, files } = await writeTo(resolve(arg('--out')));
    console.log('history-pages: wrote ' + files.length + ' files (' + model.pages.length + ' pages per language) into ' + arg('--out') + ' in ' + (Date.now() - t0) + ' ms');
  } else {
    const M = await collect();
    if (process.argv.includes('--list')) { for (const p of M.pages) console.log(pagePath(p, LANGS[0])); }
    else {
      for (const r of M.regions) {
        const list = M.byRegion.get(r.id) || [];
        const by = (t) => list.filter((p) => p.tier === t).length;
        console.log(r.id.padEnd(16) + String(list.length).padStart(5) + '   sheets ' + by('snapshot') + ' · ohm ' + by('ohm') + ' · cshapes ' + by('cshapes'));
      }
      console.log('history-pages: ' + M.pages.length + ' pages per language, ' + (Date.now() - t0) + ' ms');
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
