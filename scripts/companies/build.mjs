/* ============================================================================
 *  IntMap · company BUILD — manifest identities  ->  index.json + profiles/*.json
 * ----------------------------------------------------------------------------
 *  Everything a user reads about a company is produced here, from four upstreams
 *  and nothing else (docs/COMPANIES.md §10):
 *
 *    WDQS / wbgetentities   identity, headquarters, industry, officers, org tree,
 *                           products, and every facility with a coordinate
 *    data.sec.gov           US filers' revenue / operating income / net income /
 *                           total assets, with the fiscal year and currency the
 *                           filing itself states
 *    api.gleif.org          LEI and the registered legal address
 *
 *  THE RULE THIS FILE EXISTS TO ENFORCE: a value that no upstream supplied is
 *  ABSENT, not zero, not "N/A", not carried over from a sibling company. Every
 *  emitted number carries a currency and a period; every emitted facility carries
 *  a source and a position precision. `npm run check:companies` fails the build
 *  if any of that is missing, so the honest path is also the only path that ships.
 *
 *  Usage
 *    node scripts/companies/build.mjs                 build everything (cached)
 *    node scripts/companies/build.mjs --only apple,toyota
 *    node scripts/companies/build.mjs --limit 25      first N of the manifest
 *    node scripts/companies/build.mjs --no-sec        skip EDGAR
 *    node scripts/companies/build.mjs --no-gleif      skip GLEIF
 * ==========================================================================*/
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, sparql, entities, httpJSON, claims, best, dvItem, dvStr, dvCoord, dvQuantity,
  qualItem, qualStr, qualTime, qualQuantity, wdDate, timeYear, label, labelMap, qid, val, chunk, cacheGet, cachePut, SEC_UA,
} from './wd.mjs';
import { loadManifest, curatedRows } from './manifest.mjs';
import { typeIndex, pickType, GROUP_OF, PRESENCE_KIND } from './facility-types.mjs';
import { resolveAll } from './resolve.mjs';
import { osmFacilities, OSM_SOURCE } from './osm.mjs';
import { countryIndex, countryAt } from './geo.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ONLY = (arg('--only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const LIMIT = Number(arg('--limit', '0')) || 0;
const OUT_DIR = join(ROOT, 'data', 'companies');
const PROFILE_DIR = join(OUT_DIR, 'profiles');
const STORE_DIR = join(OUT_DIR, 'stores');
/* ⚠ docs/COMPANIES.md §8. A retail network is not a list of corporate sites and
   must not be loaded with one: Walmart alone is 2,342 OSM elements. Above this
   many stores the network moves to its own file and the profile keeps a summary,
   so opening Walmart costs the same as opening ASML. */
const STORE_THRESHOLD = 40;
const TODAY = new Date().toISOString().slice(0, 10);
const log = (...a) => console.log(...a);

/* ── source registry ──────────────────────────────────────────────────────
   `src` on a value is an INDEX into the profile's own sources[]. The URL is
   written once per profile rather than once per field: 500 companies with the
   URL repeated on every number would be larger than the index itself, and two
   copies of a URL are two things to get out of date. */
class Sources {
  constructor() { this.list = []; this.key = new Map(); }
  add(name, url) {
    const k = name + '|' + url;
    if (this.key.has(k)) return this.key.get(k);
    const i = this.list.length;
    this.list.push({ name, url, retrievedAt: TODAY });
    this.key.set(k, i);
    return i;
  }
}

/* ── Wikidata property ids we read ───────────────────────────────────────── */
const P = {
  instanceOf: 'P31', country: 'P17', hq: 'P159', coord: 'P625', inception: 'P571',
  website: 'P856', logo: 'P154', industry: 'P452', ceo: 'P169', chair: 'P488', director: 'P1037',
  employees: 'P1128', revenue: 'P2139', operIncome: 'P3362', netProfit: 'P2295',
  totalAssets: 'P2403', marketCap: 'P2226', legalForm: 'P1454', exchange: 'P414',
  isin: 'P946', lei: 'P1278', parent: 'P749', subsidiary: 'P355', ownerOf: 'P1830',
  product: 'P1056', address: 'P6375', admin: 'P131', dissolved: 'P576', closedOn: 'P3999',
  pointInTime: 'P585', startTime: 'P580', endTime: 'P582', ticker: 'P249', currencyQ: 'P38',
  isoCurrency: 'P498', iso3: 'P298', partOf: 'P361',
};

const asMoney = (q, curMap) => {
  if (!q || !Number.isFinite(q.amount)) return null;
  const cur = curMap.get(q.unit);
  if (!cur) return null;                    /* no currency -> no number (docs §4.2) */
  return { value: q.amount, currency: cur };
};

/* A financial value must state its period. Wikidata puts it in P585 (point in
   time); a claim without one is DROPPED rather than printed as timeless. */
function periodOf(c) {
  const t = qualTime(c, P.pointInTime) || qualTime(c, P.endTime);
  const y = timeYear(t);
  return y ? String(y) : null;
}

/* ⚠ A YEAR, OR NOTHING — AND `Number(null)` IS 0, WHICH IS A YEAR.
   periodOf() correctly returns null for a claim with no point in time. The
   comment below said "a claim with no period cannot win at all"; the code said
   `Number(periodOf(c))`, and Number(null) is 0, and isFinite(0) is true, and
   0 > -1. So a claim with NO PERIOD won, and shipped as fiscalYear "0".
   MEASURED IN PRODUCTION after #R354: 69 rows across 57 companies printed a
   figure stamped «USD · 0» — al Rajhi Bank's revenue, Fanuc's net income,
   Rosneft's market cap, and 48 employee counts. The same trap this round's own
   notes record for facility headcounts, one level up. */
const plausibleYear = (p) => { const y = Number(p); return (Number.isFinite(y) && y >= 1000 && y <= 2200) ? y : null; };
function moneyClaim(e, prop, curMap, srcIdx) {
  const list = claims(e, prop);
  if (!list.length) return null;
  let bestC = null;
  let bestY = -1;
  for (const c of list) {
    const y = plausibleYear(periodOf(c));
    if (y === null) continue;
    if (y > bestY) { bestY = y; bestC = c; }
  }
  if (!bestC) return null;
  const m = asMoney(dvQuantity(bestC), curMap);
  if (!m) return null;
  return { value: m.value, currency: m.currency, fiscalYear: String(bestY), src: srcIdx };
}

function countClaim(e, prop, srcIdx) {
  const list = claims(e, prop);
  let bestC = null;
  let bestY = -1;
  for (const c of list) {
    const y = plausibleYear(periodOf(c));   /* see moneyClaim: Number(null) is 0 */
    if (y === null) continue;
    if (y > bestY) { bestY = y; bestC = c; }
  }
  if (!bestC) return null;
  const q = dvQuantity(bestC);
  if (!q || !Number.isFinite(q.amount)) return null;
  return { value: Math.round(q.amount), asOf: String(bestY), src: srcIdx };
}

/* ── SEC EDGAR ───────────────────────────────────────────────────────────── */
const SEC_TAGS = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'],
  operatingIncome: ['OperatingIncomeLoss'],
  netIncome: ['NetIncomeLoss'],
  totalAssets: ['Assets'],
};
let _secTickers = null;
async function secTickerMap() {
  if (_secTickers) return _secTickers;
  const cached = cacheGet('sec', 'company_tickers', 7 * 24 * 3600 * 1000);
  const j = cached || cachePut('sec', 'company_tickers', await httpJSON('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': SEC_UA } }));
  const m = new Map();
  for (const k of Object.keys(j || {})) {
    const r = j[k];
    if (r && r.ticker) m.set(String(r.ticker).toUpperCase(), String(r.cik_str).padStart(10, '0'));
  }
  _secTickers = m;
  return m;
}
async function secConcept(cik, tag) {
  const key = cik + '/' + tag;
  const hit = cacheGet('sec', key, 30 * 24 * 3600 * 1000);
  if (hit !== null) return hit;
  let j = null;
  try {
    j = await httpJSON('https://data.sec.gov/api/xbrl/companyconcept/CIK' + cik + '/us-gaap/' + tag + '.json', { retries: 2, headers: { 'User-Agent': SEC_UA } });
  } catch (_) { j = null; }
  cachePut('sec', key, j || false);
  return j;
}
/** Latest annual (FY, 10-K) figure with its own fiscal year and currency. */
function secLatestAnnual(concept) {
  if (!concept || !concept.units) return null;
  for (const cur of Object.keys(concept.units)) {
    /* ⚠ NOT EVERY UNIT BUCKET IS A LIST. Measured mid-run: one filer's concept
       came back with a non-array under a unit key and the whole build died on
       `.filter is not a function` — after forty minutes of upstream work. A
       malformed bucket is one company's missing number, never the run. */
    if (!Array.isArray(concept.units[cur])) continue;
    const rows = concept.units[cur].filter((u) => u && u.fp === 'FY' && u.form && String(u.form).indexOf('10-K') === 0 && u.end);
    if (!rows.length) continue;
    /* ⚠ TWO SHAPES. Income-statement facts are DURATIONS (start..end) and only a
       ~365-day one is the annual figure; balance-sheet facts (Assets) are
       INSTANTS and carry no `start` at all. Requiring `start` silently dropped
       every balance-sheet tag — measured on Apple, where totalAssets fell back to
       a 2021 Wikidata value while revenue was FY2025 from the filing. */
    const durations = rows.filter((u) => u.start);
    const annual = durations.length
      ? durations.filter((u) => { const d = (Date.parse(u.end) - Date.parse(u.start)) / 86400000; return d > 300 && d < 400; })
      : rows;
    const pick = (annual.length ? annual : rows).sort((a, b) => (a.fy - b.fy) || (Date.parse(a.end) - Date.parse(b.end))).pop();
    if (!pick) continue;
    return { value: pick.val, currency: cur, fiscalYear: 'FY' + pick.fy, end: pick.end };
  }
  return null;
}

/* ── GLEIF ───────────────────────────────────────────────────────────────── */
async function gleifByLei(lei) {
  const key = 'lei/' + lei;
  const hit = cacheGet('gleif', key, 30 * 24 * 3600 * 1000);
  if (hit !== null) return hit;
  let j = null;
  try { j = await httpJSON('https://api.gleif.org/api/v1/lei-records/' + encodeURIComponent(lei), { retries: 2 }); } catch (_) { j = null; }
  cachePut('gleif', key, j || false);
  return j;
}

/* ── facilities ──────────────────────────────────────────────────────────── */
const FACILITY_QUERY = (values) => (
  'SELECT ?co ?f ?type ?coord ?cc ?adm ?opened ?closed ?addr WHERE {\n'
  + '  VALUES ?co { ' + values + ' }\n'
  + '  { ?f wdt:P127 ?co } UNION { ?f wdt:P137 ?co } UNION { ?co wdt:P1830 ?f } UNION { ?f wdt:P749 ?co }\n'
  + '  ?f wdt:P625 ?coord ; wdt:P31 ?type .\n'
  + '  OPTIONAL { ?f wdt:P17 ?ccI . ?ccI wdt:P298 ?cc }\n'
  + '  OPTIONAL { ?f wdt:P131 ?adm }\n'
  + '  OPTIONAL { ?f wdt:P571 ?opened }\n'
  + '  OPTIONAL { ?f wdt:P3999 ?closed }\n'
  + '  OPTIONAL { ?f wdt:P6375 ?addr }\n'
  + '} LIMIT 6000');

/* One extra hop, through DIRECT subsidiaries only.
   ⚠ NOT `wdt:P749*`. Measured on Toyota: the transitive form reaches JR Central
   and returns the stations of the Tokaido Main Line as Toyota "facilities" — 300
   rows, all of them railway stations. One hop plus the type gate returns 22. */
const SUB_FACILITY_QUERY = (values) => (
  'SELECT ?co ?f ?type ?coord ?cc ?adm ?opened ?closed ?addr WHERE {\n'
  + '  VALUES ?co { ' + values + ' }\n'
  + '  { ?sub wdt:P749 ?co } UNION { ?co wdt:P355 ?sub }\n'
  + '  { ?f wdt:P127 ?sub } UNION { ?f wdt:P137 ?sub }\n'
  + '  ?f wdt:P625 ?coord ; wdt:P31 ?type .\n'
  + '  OPTIONAL { ?f wdt:P17 ?ccI . ?ccI wdt:P298 ?cc }\n'
  + '  OPTIONAL { ?f wdt:P131 ?adm }\n'
  + '  OPTIONAL { ?f wdt:P571 ?opened }\n'
  + '  OPTIONAL { ?f wdt:P3999 ?closed }\n'
  + '  OPTIONAL { ?f wdt:P6375 ?addr }\n'
  + '} LIMIT 6000');

function parsePoint(wkt) {
  const m = /^Point\(\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s*\)$/.exec(String(wkt || ''));
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  if (lon === 0 && lat === 0) return null;                 /* Null Island is "no value" */
  return [lon, lat];
}

async function facilityRows(coQids) {
  const rows = [];
  for (const grp of chunk(coQids, 22)) {
    const values = grp.map((q) => 'wd:' + q).join(' ');
    for (const q of [FACILITY_QUERY(values), SUB_FACILITY_QUERY(values)]) {
      try { rows.push(...await sparql(q, { maxAgeMs: 21 * 24 * 3600 * 1000 })); }
      catch (e) { console.warn('  ! facility query failed for a batch: ' + e.message); }
    }
  }
  return rows;
}

/* ── main ────────────────────────────────────────────────────────────────── */
async function main() {
  log('IntMap · company build');
  const manifest = loadManifest();
  /* The Japanese names in js/companies.js are hand-checked and better than the
     ja label on Wikidata (which for Apple is the English string). Read them from
     the same table the manifest was derived from — do not copy them here. */
  const curatedJa = new Map();
  {
    const byName = new Map();
    for (const r of curatedRows()) if (r.nameJa) byName.set(r.ticker, r.nameJa);
    for (const c of manifest.companies) if (c.ticker && byName.get(c.ticker)) curatedJa.set(c.id, byName.get(c.ticker));
  }
  let rows = manifest.companies;
  if (ONLY.length) rows = rows.filter((r) => ONLY.includes(r.id));
  if (LIMIT) rows = rows.slice(0, LIMIT);
  log('  manifest rows: ' + rows.length);

  /* 1 ── identity resolution for anything the manifest did not pin */
  const needResolve = rows.filter((r) => !r.wikidata);
  let resolved = new Map();
  let unresolved = [];
  if (needResolve.length) {
    const res = await resolveAll(needResolve, { log: (m) => log('    ' + m) });
    resolved = res.resolved;
    unresolved = res.unresolved;
    log('  resolved ' + resolved.size + '/' + needResolve.length + ' by evidence; ' + unresolved.length + ' unresolved');
  }
  const coQid = new Map();
  for (const r of rows) {
    const q = r.wikidata || resolved.get(r.id);
    if (q) coQid.set(r.id, q);
  }

  /* ⚠ TWO ROWS, ONE COMPANY. discover.mjs de-duplicates against the curated table
     by domain and by slug, and both tests miss the same firm under two names with
     two sites — MEASURED: `toyota-motor` (curated, toyota.com) and `toyota`
     (discovered, global.toyota) both resolve to Q53268. The identity is the only
     thing that settles it, and the identity is not known until here. The curated
     row wins, because it is the one the existing product already shows. */
  {
    const byQ = new Map();
    for (const r of rows) {
      const q = coQid.get(r.id);
      if (!q) continue;
      if (!byQ.has(q)) byQ.set(q, []);
      byQ.get(q).push(r);
    }
    const dropped = [];
    for (const [q, list] of byQ) {
      if (list.length < 2) continue;
      const keep = list.find((r) => r.origin === 'curated') || list[0];
      for (const r of list) if (r !== keep) { coQid.delete(r.id); dropped.push(r.id + '->' + keep.id + ' (' + q + ')'); }
    }
    if (dropped.length) log('  collapsed ' + dropped.length + ' duplicate identities: ' + dropped.slice(0, 8).join(', ') + (dropped.length > 8 ? ' …' : ''));
  }
  log('  companies with an identity: ' + coQid.size + '/' + rows.length);

  /* 2 ── the company entities themselves */
  const ents = await entities([...coQid.values()]);

  /* 3 ── every item those entities REFER to, so we can print labels not QIDs */
  const refs = new Set();
  const refProps = [P.industry, P.ceo, P.chair, P.director, P.legalForm, P.exchange,
    P.parent, P.subsidiary, P.product, P.hq, P.country, P.admin, P.ownerOf];
  for (const q of coQid.values()) {
    const e = ents[q];
    if (!e) continue;
    for (const p of refProps) for (const c of claims(e, p)) { const v = dvItem(c); if (v) refs.add(v); }
    for (const c of claims(e, P.revenue).concat(claims(e, P.netProfit), claims(e, P.operIncome), claims(e, P.totalAssets), claims(e, P.marketCap))) {
      const v = dvQuantity(c);
      if (v && v.unit) refs.add(v.unit);
    }
  }
  log('  referenced items: ' + refs.size);
  const refEnts = await entities([...refs]);

  /* currency unit QID -> ISO 4217, and admin/HQ items -> their own coordinates */
  const curMap = new Map();
  for (const q of refs) {
    const e = refEnts[q];
    const code = e ? (claims(e, P.isoCurrency).map(dvStr).filter(Boolean)[0] || null) : null;
    if (code) curMap.set(q, code);
  }
  const iso3 = new Map();
  for (const q of Object.keys(refEnts)) {
    const c = claims(refEnts[q], P.iso3).map(dvStr).filter(Boolean)[0];
    if (c) iso3.set(q, c);
  }

  /* HQ places need their own coordinates and their own country. */
  const placeIds = new Set();
  for (const q of coQid.values()) {
    const e = ents[q];
    if (!e) continue;
    for (const c of claims(e, P.hq)) { const v = dvItem(c); if (v) placeIds.add(v); }
  }
  /* ⚠ RECALL. Ownership edges alone gave Apple three facilities and one country.
     A multinational's presence is mostly recorded as ITS SUBSIDIARIES' registered
     headquarters — "Apple Israel, headquarters location Herzliya" is a real,
     sourced Apple office and no ownership edge points at a building. So every
     direct subsidiary's P159 becomes a facility too, typed `subsidiary_office`. */
  for (const q of coQid.values()) {
    const e = ents[q];
    if (!e) continue;
    for (const sc of claims(e, P.subsidiary)) {
      const sub = dvItem(sc);
      const se = sub ? refEnts[sub] : null;
      if (!se) continue;
      for (const hc of claims(se, P.hq)) { const v = dvItem(hc); if (v) placeIds.add(v); }
    }
  }
  const placeEnts = await entities([...placeIds]);
  const refLabel = (q, langs) => label(refEnts[q] || placeEnts[q] || ents[q], langs || ['en', 'ja', 'de', 'fr', 'es']);

  /* 4 ── facilities */
  log('  querying facilities…');
  const idx = await typeIndex();
  log('    facility class allow-list: ' + idx.size + ' classes, deny-list ' + idx.denyIds.size);
  const facRows = await facilityRows([...coQid.values()]);
  log('    raw facility rows: ' + facRows.length);

  /* group rows -> one record per (company, facility) with all of its P31 values */
  const facByCo = new Map();
  const facAdmin = new Set();
  for (const r of facRows) {
    const co = qid(val(r, 'co'));
    const f = qid(val(r, 'f'));
    if (!co || !f) continue;
    if (!facByCo.has(co)) facByCo.set(co, new Map());
    const m = facByCo.get(co);
    if (!m.has(f)) {
      m.set(f, {
        q: f, types: new Set(), coord: parsePoint(val(r, 'coord')), cc: val(r, 'cc') || '',
        adm: qid(val(r, 'adm')) || '', opened: val(r, 'opened') || '', closed: val(r, 'closed') || '',
        addr: val(r, 'addr') || '',
      });
    }
    const rec = m.get(f);
    rec.types.add(qid(val(r, 'type')));
    if (!rec.coord) rec.coord = parsePoint(val(r, 'coord'));
    if (!rec.cc && val(r, 'cc')) rec.cc = val(r, 'cc');
    if (!rec.adm && val(r, 'adm')) rec.adm = qid(val(r, 'adm'));
    if (!rec.opened && val(r, 'opened')) rec.opened = val(r, 'opened');
    if (!rec.closed && val(r, 'closed')) rec.closed = val(r, 'closed');
    if (!rec.addr && val(r, 'addr')) rec.addr = val(r, 'addr');
    if (rec.adm) facAdmin.add(rec.adm);
  }
  /* names + admin labels for everything that survived the type gate */
  const keptIds = new Set();
  for (const m of facByCo.values()) {
    for (const rec of m.values()) {
      const t = pickType([...rec.types], idx);
      if (!t) continue;
      if ([...rec.types].every((x) => idx.isDenied(x))) continue;
      rec.type = t;
      keptIds.add(rec.q);
    }
  }
  log('    facilities passing the type gate: ' + keptIds.size);
  const facEnts = await entities([...keptIds, ...facAdmin]);

  /* 4b ── OpenStreetMap, the second facility source (scripts/companies/osm.mjs) */
  const geoIdx = await countryIndex();
  log('    country polygons: ' + geoIdx.length);
  let osmBy = new Map();
  {
    /* ⚠ --no-osm means "do not ASK", not "forget what we already have". The
       responses on disk are facts that were fetched; skipping them would throw
       away real facilities and mark companies pending that are not. */
    const offline = has('--no-osm');
    log(offline ? '  OpenStreetMap: cache only (--no-osm)' : '  querying OpenStreetMap…');
    osmBy = await osmFacilities([...new Set(coQid.values())], { log, offline });
    let tot = 0;
    for (const v of osmBy.values()) tot += v.length;
    log('    OSM elements explicitly linked to a company: ' + tot);
    if (osmBy.failed && osmBy.failed.size) {
      log('    ⚠ ' + osmBy.failed.size + ' companies ship WITHOUT OpenStreetMap enrichment — marked osmPending');
    }
  }

  /* 5 ── SEC + GLEIF, per company */
  const secMap = has('--no-sec') ? new Map() : await secTickerMap();

  /* 6 ── emit */
  if (!existsSync(PROFILE_DIR)) mkdirSync(PROFILE_DIR, { recursive: true });
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
  const indexRows = [];
  const report = { full: 0, core: 0, basic: 0, stub: 0, noIdentity: 0, facilities: 0 };
  let n = 0;

  for (const row of rows) {
    const q = coQid.get(row.id);
    if (!q || !ents[q]) { report.noIdentity++; continue; }
    const e = ents[q];
    const S = new Sources();
    const wdSrc = S.add('Wikidata', 'https://www.wikidata.org/wiki/' + q);

    /* identity */
    /* ⚠ P856 often carries one statement PER COUNTRY EDITION. Taking [0] gave
       Apple "https://apple.com/at/" — the Austrian site — as its official URL.
       Prefer the preferred-rank statement, then one with no language qualifier
       (or English), then the shortest path, which is the canonical entry. */
    const website = (function () {
      const list = claims(e, P.website).filter((c) => dvStr(c));
      if (!list.length) return '';
      const pref = list.filter((c) => c.rank === 'preferred');
      const pool = pref.length ? pref : list;
      const scored = pool.map((c) => {
        const url = dvStr(c);
        const lang = qualItem(c, 'P407');
        let sc = 0;
        if (!lang) sc -= 2;                       /* no language stated = the main site */
        if (lang === 'Q1860') sc -= 1;            /* English */
        try { sc += new URL(url).pathname.replace(/\/$/, '').length; } catch (_) { sc += 40; }
        return { url, sc };
      }).sort((a, b) => a.sc - b.sc);
      return scored[0].url;
    }());
    const logoClaim = best(claims(e, P.logo));
    const logoFile = logoClaim ? dvStr(logoClaim) : null;
    const inceptionC = best(claims(e, P.inception));
    const industry = claims(e, P.industry).map(dvItem).filter(Boolean).map((x) => refLabel(x)).filter(Boolean);
    const exchanges = claims(e, P.exchange).map((c) => {
      const ex = dvItem(c);
      const tk = qualStr(c, P.ticker);
      const name = ex ? refLabel(ex) : null;
      return (name || tk) ? { name: name || '', ticker: tk || '' } : null;
    }).filter(Boolean);
    const isin = claims(e, P.isin).map(dvStr).filter(Boolean)[0] || '';
    let lei = claims(e, P.lei).map(dvStr).filter(Boolean)[0] || '';
    const legalForm = claims(e, P.legalForm).map(dvItem).filter(Boolean).map((x) => refLabel(x)).filter(Boolean)[0] || '';
    const ccQ = claims(e, P.country).map(dvItem).filter(Boolean)[0];
    const country = (ccQ && iso3.get(ccQ)) || row.country || '';

    /* headquarters — the statement first (it may carry exact coordinates and a
       street address), then the place item, and the PRECISION says which. */
    let hqFac = null;
    const hqC = best(claims(e, P.hq));
    if (hqC) {
      const placeQ = dvItem(hqC);
      const exact = (() => { try { return hqC.qualifiers[P.coord][0].datavalue.value; } catch (_) { return null; } })();
      const addr = qualStr(hqC, P.address) || '';
      const placeE = placeQ ? placeEnts[placeQ] : null;
      const placeCoord = placeE ? (dvCoord(best(claims(placeE, P.coord))) || null) : null;
      const coord = exact ? [exact.longitude, exact.latitude] : placeCoord;
      if (coord && Number.isFinite(coord[0]) && Number.isFinite(coord[1]) && !(coord[0] === 0 && coord[1] === 0)) {
        const placeCc = placeE ? (claims(placeE, P.country).map(dvItem).map((x) => iso3.get(x)).filter(Boolean)[0] || '') : '';
        const admQ = placeE ? claims(placeE, P.admin).map(dvItem).filter(Boolean)[0] : null;
        hqFac = {
          id: row.id + '-hq',
          name: (label(e, ['en']) || row.name) + ' headquarters',
          type: 'headquarters', group: 'hq',
          cc: placeCc || country, region: admQ ? (refLabel(admQ) || '') : '',
          city: placeQ ? (refLabel(placeQ) || '') : '',
          address: addr,
          lon: coord[0], lat: coord[1],
          precision: exact ? 'exact' : 'city',
          opened: null, closed: null, status: 'operating',
          role: 'corporate headquarters', products: [], research: [], employees: null,
          src: wdSrc,
        };
      }
    }

    /* scale — Wikidata first, then EDGAR overwrites for US filers because a
       filing is a primary source and Wikidata is a secondary one. */
    const scale = {};
    const empl = countClaim(e, P.employees, wdSrc);
    if (empl) scale.employees = empl;
    const rev = moneyClaim(e, P.revenue, curMap, wdSrc);
    if (rev) scale.revenue = rev;
    const oi = moneyClaim(e, P.operIncome, curMap, wdSrc);
    if (oi) scale.operatingIncome = oi;
    const ni = moneyClaim(e, P.netProfit, curMap, wdSrc);
    if (ni) scale.netIncome = ni;
    const ta = moneyClaim(e, P.totalAssets, curMap, wdSrc);
    if (ta) scale.totalAssets = ta;
    const mc = moneyClaim(e, P.marketCap, curMap, wdSrc);
    if (mc) { scale.marketCap = { value: mc.value, currency: mc.currency, asOf: mc.fiscalYear, src: wdSrc }; }

    const usTicker = (row.ticker && !/\./.test(row.ticker)) ? row.ticker.replace('-', '.').toUpperCase() : '';
    const cik = usTicker ? secMap.get(usTicker) || secMap.get(usTicker.replace('.', '-')) : null;
    if (cik && !has('--no-sec')) {
      const secSrc = S.add('SEC EDGAR company facts', 'https://data.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=' + cik);
      for (const [field, tags] of Object.entries(SEC_TAGS)) {
        for (const tag of tags) {
          const got = secLatestAnnual(await secConcept(cik, tag));
          if (got) { scale[field] = { value: got.value, currency: got.currency, fiscalYear: got.fiscalYear, src: secSrc }; break; }
        }
      }
    }

    /* GLEIF — the LEI, the REGISTERED LEGAL NAME, and the registered address */
    let legalAddress = null;
    let gleifLegalName = '';
    if (lei && !has('--no-gleif')) {
      const g = await gleifByLei(lei);
      const a = g && g.data && g.data.attributes && g.data.attributes.entity;
      if (a) {
        const gSrc = S.add('GLEIF LEI record', 'https://search.gleif.org/#/record/' + lei);
        try { gleifLegalName = String(a.legalName && a.legalName.name ? a.legalName.name : '').trim(); } catch (_) { gleifLegalName = ''; }
        const hq = a.headquartersAddress || a.legalAddress;
        if (hq) {
          legalAddress = {
            lines: (hq.addressLines || []).filter(Boolean), city: hq.city || '', region: hq.region || '',
            country: hq.country || '', postalCode: hq.postalCode || '', src: gSrc,
          };
        }
      }
    }

    /* leadership — the CURRENT holder of each role.
       ⚠ Wikidata keeps a predecessor's statement open when a successor is added,
       so "no end time" is not "in post": measured on Apple, which returned two
       CEOs. The latest start time wins, preferred rank beats it, and a person
       with an explicit end time is out. Names are read in English first — the
       generic label reader falls through to Japanese and printed one officer in
       katakana next to another in Latin script. */
    const leadership = [];
    const pushLead = (prop, roleEn) => {
      const live = claims(e, prop).filter((c) => !qualTime(c, P.endTime) && dvItem(c));
      if (!live.length) return;
      const pref = live.filter((c) => c.rank === 'preferred');
      const pool = pref.length ? pref : live;
      const pick = pool.slice().sort((a, b) => (timeYear(qualTime(a, P.startTime)) || 0) - (timeYear(qualTime(b, P.startTime)) || 0)).pop();
      const who = dvItem(pick);
      const nm = label(refEnts[who], ['en']) || refLabel(who);
      if (!nm) return;
      const sy = timeYear(qualTime(pick, P.startTime));
      leadership.push({ role: roleEn, name: nm, since: sy ? String(sy) : null });
    };
    pushLead(P.ceo, 'CEO');
    pushLead(P.chair, 'Chair');
    if (!leadership.length) pushLead(P.director, 'Director');

    /* business */
    const products = claims(e, P.product).map(dvItem).filter(Boolean).map((x) => refLabel(x)).filter(Boolean);

    /* organisation */
    const parentQ = claims(e, P.parent).map(dvItem).filter(Boolean)[0];
    const org = {
      parent: parentQ ? { name: refLabel(parentQ) || '', wikidata: parentQ } : null,
      subsidiaries: claims(e, P.subsidiary).map(dvItem).filter(Boolean).map((x) => ({
        name: refLabel(x) || '', wikidata: x,
      })).filter((s) => s.name).slice(0, 60),
      affiliates: [],
    };

    /* facilities */
    const facs = [];
    if (hqFac) facs.push(hqFac);
    const seenPos = new Set();
    if (hqFac) seenPos.add(hqFac.lon.toFixed(5) + ',' + hqFac.lat.toFixed(5));
    for (const rec of (facByCo.get(q) || new Map()).values()) {
      if (!rec.type || !rec.coord) continue;
      const fe = facEnts[rec.q];
      const nm = fe ? label(fe, ['en', 'ja', 'de', 'fr', 'es']) : null;
      if (!nm) continue;
      const key = rec.coord[0].toFixed(5) + ',' + rec.coord[1].toFixed(5);
      if (seenPos.has(key)) continue;                        /* same spot, already published */
      seenPos.add(key);
      const closedYear = timeYear(rec.closed);
      const admName = rec.adm ? (label(facEnts[rec.adm], ['en', 'ja']) || '') : '';
      facs.push({
        id: rec.q.toLowerCase(),
        name: nm,
        type: rec.type,
        group: GROUP_OF[rec.type] || 'other',
        cc: rec.cc || '', region: admName, city: '',
        address: rec.addr || '',
        lon: rec.coord[0], lat: rec.coord[1],
        precision: 'exact',
        opened: timeYear(rec.opened) ? String(timeYear(rec.opened)) : null,
        closed: closedYear ? String(closedYear) : null,
        status: closedYear ? 'closed' : 'operating',
        role: '', products: [], research: [], employees: null,
        src: wdSrc,
      });
    }
    /* OpenStreetMap facilities. Stores are separated here, not drawn from the
       same list — see STORE_THRESHOLD. */
    const osmList = osmBy.get(q) || [];
    let osmSrc = -1;
    const storeRows = [];
    const byCcRetail = new Map();
    for (const o of osmList) {
      const key3 = o.lon.toFixed(5) + ',' + o.lat.toFixed(5);
      const cc3 = countryAt(geoIdx, o.lon, o.lat) || geoIdx.alpha2.get(o.cc) || '';
      /* Retail outlets, and everything reached only through `brand:wikidata`, are
         retail presence and never a corporate facility (see osm.mjs). */
      if (o.type === 'store' || o.link === 'brand') {
        storeRows.push({ n: o.name, lon: Number(o.lon.toFixed(5)), lat: Number(o.lat.toFixed(5)), cc: cc3, osm: o.osm, l: o.link });
        continue;
      }
      if (seenPos.has(key3)) continue;
      seenPos.add(key3);
      if (osmSrc < 0) osmSrc = S.add(OSM_SOURCE.name, OSM_SOURCE.url);
      facs.push({
        id: 'osm-' + o.osm.replace('/', '-'),
        name: o.name,
        type: o.type,
        group: GROUP_OF[o.type] || 'other',
        cc: cc3, region: '', city: o.city || '',
        address: o.street || '',
        lon: Number(o.lon.toFixed(6)), lat: Number(o.lat.toFixed(6)),
        precision: 'exact',
        opened: o.opened, closed: null, status: 'operating',
        role: '', products: [], research: [], employees: null,
        src: osmSrc,
      });
    }
    let storeNetwork = null;
    if (storeRows.length) {
      /* brand-linked outlets are ALWAYS a network, never facilities, so they are
         not folded back into the profile even when there are only a few */
      const ownStores = storeRows.filter((r) => r.l !== 'brand');
      if (storeRows.length >= STORE_THRESHOLD || ownStores.length !== storeRows.length) {
        const sSrc = S.add(OSM_SOURCE.name, OSM_SOURCE.url);
        const retailCc = [...new Set(storeRows.map((r) => r.cc).filter(Boolean))];
        storeNetwork = {
          count: storeRows.length, operated: ownStores.length, branded: storeRows.length - ownStores.length,
          countries: retailCc.length, src: sSrc, retrievedAt: TODAY,
        };
        writeFileSync(join(STORE_DIR, row.id + '.json'), JSON.stringify({
          schema: 1, id: row.id, generatedAt: TODAY, count: storeRows.length,
          source: OSM_SOURCE, stores: storeRows,
        }));
        for (const cc of retailCc) byCcRetail.set(cc, true);
      } else {
        if (osmSrc < 0) osmSrc = S.add(OSM_SOURCE.name, OSM_SOURCE.url);
        for (const st of ownStores) {
          const k = st.lon.toFixed(5) + ',' + st.lat.toFixed(5);
          if (seenPos.has(k)) continue;
          seenPos.add(k);
          facs.push({
            id: 'osm-' + st.osm.replace('/', '-'), name: st.n, type: 'store', group: 'other',
            cc: st.cc, region: '', city: '', address: '', lon: st.lon, lat: st.lat,
            precision: 'exact', opened: null, closed: null, status: 'operating',
            role: '', products: [], research: [], employees: null, src: osmSrc,
          });
        }
      }
    }

    /* subsidiary headquarters -> offices (see the note above the place fetch) */
    for (const sc of claims(e, P.subsidiary)) {
      const sub = dvItem(sc);
      const se = sub ? refEnts[sub] : null;
      if (!se) continue;
      if (claims(se, P.dissolved).length) continue;
      const hc2 = best(claims(se, P.hq));
      if (!hc2) continue;
      const placeQ2 = dvItem(hc2);
      const exact2 = (function () { try { return hc2.qualifiers[P.coord][0].datavalue.value; } catch (_) { return null; } }());
      const pe2 = placeQ2 ? placeEnts[placeQ2] : null;
      const pc2 = pe2 ? (dvCoord(best(claims(pe2, P.coord))) || null) : null;
      const coord2 = exact2 ? [exact2.longitude, exact2.latitude] : pc2;
      if (!coord2 || !Number.isFinite(coord2[0]) || !Number.isFinite(coord2[1])) continue;
      if (coord2[0] === 0 && coord2[1] === 0) continue;
      const key2 = coord2[0].toFixed(5) + ',' + coord2[1].toFixed(5);
      if (seenPos.has(key2)) continue;
      seenPos.add(key2);
      const subName = label(se, ['en']) || refLabel(sub);
      if (!subName) continue;
      const cc2 = claims(se, P.country).map(dvItem).map((x) => iso3.get(x)).filter(Boolean)[0]
        || (pe2 ? claims(pe2, P.country).map(dvItem).map((x) => iso3.get(x)).filter(Boolean)[0] : '') || '';
      facs.push({
        id: String(sub).toLowerCase() + '-hq',
        name: subName,
        type: 'subsidiary_office', group: 'office',
        cc: cc2, region: '', city: placeQ2 ? (label(placeEnts[placeQ2], ['en', 'ja']) || '') : '',
        address: qualStr(hc2, P.address) || '',
        lon: coord2[0], lat: coord2[1],
        precision: exact2 ? 'exact' : 'city',
        opened: null, closed: null, status: 'operating',
        role: 'subsidiary registered office', products: [], research: [], employees: null,
        src: wdSrc,
      });
    }

    report.facilities += facs.length;

    /* ⚠ A facility with no country cannot appear in "which countries does this
       company operate in", which is the question §5 of the brief is about. The
       coordinate always answers it, so a missing P17 is filled from the polygon
       rather than left blank. */
    for (const f of facs) if (!f.cc) f.cc = countryAt(geoIdx, f.lon, f.lat) || '';

    /* presence — countries where an operation actually exists */
    const presence = [];
    const byCc = new Map();
    for (const f of facs) {
      if (!f.cc) continue;
      if (!byCc.has(f.cc)) byCc.set(f.cc, { cc: f.cc, facilities: 0, kinds: new Set() });
      const p = byCc.get(f.cc);
      p.facilities++;
      p.kinds.add(PRESENCE_KIND[f.group] || 'corporate');
    }
    for (const p of byCc.values()) presence.push({ cc: p.cc, facilities: p.facilities, kinds: [...p.kinds].sort() });
    for (const cc of byCcRetail.keys()) {
      const existing = presence.find((p) => p.cc === cc);
      if (existing) { if (existing.kinds.indexOf('retail') < 0) { existing.kinds.push('retail'); existing.kinds.sort(); } }
      else presence.push({ cc, facilities: 0, kinds: ['retail'] });
    }
    presence.sort((a, b) => b.facilities - a.facilities);

    /* coverage (docs/COMPANIES.md §6) */
    const groups = new Set(facs.map((f) => f.group));
    const nonHqGroups = [...groups].filter((g) => g !== 'hq').length;
    const hasCore = !!(website && industry.length && hqFac);
    const hasFull = hasCore && !!inceptionC && leadership.length > 0 && !!scale.employees
      && (!!scale.revenue || !!scale.netIncome) && nonHqGroups >= 2;
    const cov = hasFull ? 'full' : (hasCore && facs.length >= 2 ? 'core' : (hqFac ? 'basic' : 'stub'));
    report[cov]++;

    const profile = {
      schema: 1,
      id: row.id,
      generatedAt: TODAY,
      identity: {
        /* The curated table is the name the product already shows; Wikidata's
           English label is then the LEGAL name when the two differ ("Apple" vs
           "Apple Inc."). Neither overwrites the other. */
        name: row.origin === 'curated' ? row.name : (label(e, ['en']) || row.name),
        legalName: (function () {
          const dn = row.origin === 'curated' ? row.name : (label(e, ['en']) || row.name);
          const g = gleifLegalName;
          if (g && g.toLowerCase() !== String(dn).toLowerCase()) return g;
          return '';
        }()),
        local: (function () { const m = labelMap(e); if (curatedJa.get(row.id)) m.ja = curatedJa.get(row.id); return m; }()),
        country,
        sector: row.sector || 'other',
        industry,
        founded: wdDate(inceptionC),
        website,
        logo: logoFile ? ('https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(logoFile)) : '',
        legalForm,
        listed: exchanges.length > 0,
        exchanges,
        isin, lei,
        wikidata: q,
      },
      legalAddress,
      leadership,
      scale,
      business: { products: [...new Set(products)].slice(0, 40), services: [], brands: [], segments: [] },
      org,
      presence,
      storeNetwork,
      /* ⚠ "no OSM sites" and "OSM was never asked" are different claims, and only one
         of them is ours to make. A company whose Overpass query never succeeded is
         marked, so the profile never implies an absence the build did not establish;
         re-running the build clears it (docs/COMPANIES.md §11). */
      osmPending: !!(osmBy.failed && osmBy.failed.has(q)),
      facilities: facs,
      coverage: cov,
      sources: S.list,
    };

    writeFileSync(join(PROFILE_DIR, row.id + '.json'), JSON.stringify(profile));
    indexRows.push({
      id: row.id,
      n: profile.identity.name,
      ln: profile.identity.legalName || '',
      loc: profile.identity.local,
      cc: country,
      sec: row.sector || 'other',
      tk: row.ticker || '',
      dom: row.domain || '',
      hq: hqFac ? [Number(hqFac.lon.toFixed(5)), Number(hqFac.lat.toFixed(5))] : null,
      hqc: hqFac ? hqFac.city : '',
      fac: facs.length,
      ctry: presence.length,
      cov,
      wd: q,
    });
    if (++n % 50 === 0) log('  built ' + n + '/' + rows.length);
  }

  /* prune profiles for companies that are no longer in the index */
  const keep = new Set(indexRows.map((r) => r.id + '.json'));
  if (!ONLY.length && !LIMIT) {
    for (const f of readdirSync(PROFILE_DIR)) {
      if (f.endsWith('.json') && !keep.has(f)) rmSync(join(PROFILE_DIR, f));
    }
  }

  indexRows.sort((a, b) => a.id.localeCompare(b.id));
  const indexPath = join(OUT_DIR, 'index.json');
  let existing = { companies: [] };
  if ((ONLY.length || LIMIT) && existsSync(indexPath)) {
    try { existing = JSON.parse(readFileSync(indexPath, 'utf8')); } catch (_) {}
    const byId = new Map(existing.companies.map((c) => [c.id, c]));
    indexRows.forEach((r) => byId.set(r.id, r));
    indexRows.length = 0;
    indexRows.push(...[...byId.values()].sort((a, b) => a.id.localeCompare(b.id)));
  }
  writeFileSync(indexPath, JSON.stringify({ schema: 1, generatedAt: TODAY, companies: indexRows }));

  log('  wrote ' + indexRows.length + ' index rows and ' + n + ' profiles');
  log('  coverage: full ' + report.full + ' / core ' + report.core + ' / basic ' + report.basic + ' / stub ' + report.stub);
  log('  facilities published: ' + report.facilities);
  if (report.noIdentity) log('  ⚠ ' + report.noIdentity + ' manifest rows had no confirmable identity and did NOT ship');
  if (unresolved.length) {
    log('  unresolved identities (not shipped): ' + unresolved.slice(0, 12).map((u) => u.id).join(', ') + (unresolved.length > 12 ? ' …' : ''));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
