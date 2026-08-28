/* ============================================================================
 *  IntMap · company DISCOVERY — build data/companies/manifest.json
 * ----------------------------------------------------------------------------
 *  Which 500+ companies does a world atlas cover? Typing a list from memory is
 *  exactly the failure mode AGENTS.md §3.3 forbids, so the list is DERIVED:
 *
 *    1. Wikidata is asked which companies it reports as large — by revenue
 *       (P2139) and, for names that report no revenue, by market cap (P2226).
 *    2. Each candidate must survive an evidence filter: it is an organisation,
 *       it is not dissolved, it has a country, an official website, and a
 *       headquarters we can put on a map.
 *    3. Selection is by QUOTA, per country and per sector, so the result spans
 *       the regions and industries the brief names rather than 400 US tech firms.
 *       Ranking happens INSIDE a (country, reporting-currency) bucket, so no
 *       exchange rate is ever invented in order to compare two companies.
 *    4. The 190 curated rows in js/companies.js are force-included, whatever the
 *       quota says. They are the existing product and are never dropped.
 *
 *  Usage:  node scripts/companies/discover.mjs [--target 520] [--out <path>]
 * ==========================================================================*/
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT, sparql, entities, claims, best, dvItem, dvStr, dvQuantity, qid, val, label } from './wd.mjs';
import { curatedManifest, slugify, uniqueSlug } from './manifest.mjs';
import { hostOf, orgClasses } from './resolve.mjs';

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const TARGET = Number(arg('--target', '520'));
const OUT = arg('--out', join(ROOT, 'data', 'companies', 'manifest.json'));

/* ── regions the brief asks to span (docs/COMPANIES.md §2) ───────────────── */
export const REGION = {
  'North America': ['USA', 'CAN', 'MEX'],
  'Latin America': ['BRA', 'ARG', 'CHL', 'COL', 'PER', 'URY', 'PAN'],
  'Western Europe': ['GBR', 'FRA', 'DEU', 'NLD', 'CHE', 'ITA', 'ESP', 'BEL', 'IRL', 'AUT', 'PRT', 'LUX'],
  'Northern Europe': ['SWE', 'NOR', 'DNK', 'FIN', 'ISL'],
  'Eastern Europe': ['RUS', 'POL', 'CZE', 'HUN', 'ROU', 'UKR', 'GRC'],
  'Middle East': ['SAU', 'ARE', 'QAT', 'ISR', 'TUR', 'KWT', 'OMN', 'BHR'],
  Africa: ['ZAF', 'NGA', 'EGY', 'MAR', 'KEN', 'DZA'],
  'Greater China': ['CHN', 'HKG', 'TWN'],
  Japan: ['JPN'],
  Korea: ['KOR'],
  India: ['IND'],
  'South-East Asia': ['SGP', 'IDN', 'THA', 'MYS', 'VNM', 'PHL'],
  Oceania: ['AUS', 'NZL'],
};
const REGION_OF = (() => { const m = {}; for (const [r, cs] of Object.entries(REGION)) for (const c of cs) m[c] = r; return m; })();

/* Per-region ceilings. They exist so the atlas is a world atlas; the curated
   rows are added on top and are never counted out. */
const REGION_QUOTA = {
  'North America': 150, 'Latin America': 24, 'Western Europe': 110, 'Northern Europe': 24,
  'Eastern Europe': 20, 'Middle East': 20, Africa: 14, 'Greater China': 70, Japan: 55,
  Korea: 22, India: 26, 'South-East Asia': 22, Oceania: 16,
};
const PER_SECTOR_IN_REGION = 16;   /* no single industry may eat a region's quota */

/* Wikidata industry (P452) -> the sector keys js/tables.js already names.
 *
 * ⚠ MEASURED, NOT GUESSED. The first draft of this table mapped Q126793 to
 * "payments"; Q126793 is `retail`, and 31 retailers were being filed as payment
 * companies. The keys below are the industries that actually occur in the size
 * pool, read off it in descending frequency (scripts/companies/discover.mjs was
 * run with a frequency dump to build this list) and labelled from Wikidata.
 * Anything unmapped keeps 'other', and the UI then prints the plain industry
 * label from Wikidata instead of pretending to classify. */
export const SECTOR_BY_QID = {
  Q126793: 'retail', Q15825471: 'retail', Q220695: 'retail', Q601401: 'retail', Q3559462: 'retail',
  Q837171: 'finance', Q57774188: 'finance', Q29584334: 'finance', Q4290: 'finance', Q10757701: 'finance',
  Q806718: 'bank', Q22687: 'bank',
  Q2518196: 'finance', Q43183: 'finance', Q2143354: 'finance',
  Q190117: 'auto', Q1420: 'auto',
  Q862571: 'energy', Q1349660: 'energy', Q21328659: 'energy', Q2151621: 'energy', Q1803786: 'energy',
  Q2316331: 'energy', Q383973: 'energy', Q1326624: 'energy', Q1341477: 'energy', Q1951366: 'energy',
  Q2401742: 'telecom', Q418: 'telecom', Q56598901: 'telecom', Q11492876: 'telecom',
  Q187939: 'industrial', Q101333: 'industrial', Q778575: 'industrial', Q385378: 'industrial',
  Q13405640: 'industrial', Q1957908: 'industrial', Q3565868: 'industrial', Q7590: 'industrial',
  Q112166038: 'industrial', Q112165992: 'industrial', Q334453: 'industrial',
  Q207652: 'materials', Q2285982: 'materials', Q1924906: 'materials', Q1048894: 'materials',
  Q44497: 'materials', Q1945600: 'materials', Q11467: 'materials', Q4063722: 'materials',
  Q12144907: 'materials', Q607081: 'materials',
  Q392933: 'aerospace', Q3477363: 'aerospace', Q1875606: 'aerospace', Q765633: 'aerospace',
  Q1757562: 'aerospace', Q16955053: 'aerospace', Q2729047: 'aerospace', Q474200: 'aerospace',
  Q507443: 'pharma', Q7108: 'pharma',
  Q31207: 'health', Q15067276: 'health', Q63383285: 'health',
  Q540912: 'staples', Q4899370: 'staples', Q1187656: 'staples', Q11451: 'staples',
  Q396622: 'staples', Q907703: 'staples', Q12752882: 'staples', Q3246832: 'staples',
  Q880371: 'software', Q638608: 'software', Q3510521: 'software',
  Q2986369: 'semi', Q132898730: 'semi',
  Q11650: 'tech', Q5358497: 'tech', Q11661: 'tech', Q110702998: 'tech', Q73768396: 'tech', Q1326885: 'tech',
  Q484847: 'ecommerce',
  Q56611700: 'internet',
  Q177777: 'industrial',
  Q56611639: 'media', Q941594: 'media', Q16023725: 'media',
  Q9323634: 'consumer', Q49389: 'consumer', Q695829: 'consumer',
};

const num = (x) => (Number.isFinite(x) ? x : 0);

async function pool() {
  /* Two pools, unioned. Revenue is the primary signal; market cap catches the
     names that report no revenue figure on Wikidata at all. */
  const revRows = await sparql(
    'SELECT ?c (MAX(?rev) AS ?m) WHERE { ?c wdt:P2139 ?rev . FILTER(?rev > 12000000000) ?c wdt:P856 ?s . } GROUP BY ?c',
    { maxAgeMs: 14 * 24 * 3600 * 1000 });
  const capRows = await sparql(
    'SELECT ?c (MAX(?cap) AS ?m) WHERE { ?c wdt:P2226 ?cap . FILTER(?cap > 20000000000) ?c wdt:P856 ?s . } GROUP BY ?c',
    { maxAgeMs: 14 * 24 * 3600 * 1000 });
  const ids = new Set();
  for (const r of revRows) ids.add(qid(val(r, 'c')));
  for (const r of capRows) ids.add(qid(val(r, 'c')));
  return [...ids];
}

/* A single global revenue floor is a rich-country filter: at 12 G units it lets
   in mid-sized European firms and excludes the largest companies in Indonesia or
   Nigeria. So regions that come up short get a SECOND, country-scoped pass with
   a floor low enough to reach their own upper tier. The floor is still a real
   published figure — only the cut-off moves, never the number. */
async function poolForCountries(iso3List, floor) {
  /* ⚠ ONE COUNTRY PER QUERY. Forty ISO codes in a single VALUES block made WDQS
     return 502 every time (measured): the union of two unbounded quantity scans
     against a forty-way country join does not fit the public query budget. Split,
     it is forty small queries — and each caches on its own, so re-running after
     an edit costs nothing. */
  const out = new Set();
  for (const code of iso3List) {
    let rows = [];
    try {
      rows = await sparql(
        'SELECT DISTINCT ?c WHERE {\n'
        + '  ?cc wdt:P298 ' + JSON.stringify(code) + ' . ?c wdt:P17 ?cc ; wdt:P856 ?s ; wdt:P159 ?hq .\n'
        + '  { ?c wdt:P2139 ?rev . FILTER(?rev > ' + floor + ') } UNION { ?c wdt:P2226 ?cap . FILTER(?cap > ' + floor + ') }\n'
        + '} LIMIT 900', { maxAgeMs: 14 * 24 * 3600 * 1000 });
    } catch (e) {
      console.warn('  ! top-up query failed for ' + code + ': ' + e.message);
      continue;
    }
    rows.forEach((r) => out.add(qid(val(r, 'c'))));
  }
  return [...out];
}

async function currencyCodes(unitQids) {
  const uniq = [...new Set(unitQids)].filter((q) => /^Q\d+$/.test(q));
  if (!uniq.length) return new Map();
  const rows = await sparql(
    'SELECT ?u ?code WHERE { VALUES ?u { ' + uniq.map((q) => 'wd:' + q).join(' ') + ' } ?u wdt:P498 ?code }',
    { maxAgeMs: 90 * 24 * 3600 * 1000 });
  return new Map(rows.map((r) => [qid(val(r, 'u')), val(r, 'code')]));
}

async function iso3Map(countryQids) {
  const uniq = [...new Set(countryQids)].filter((q) => /^Q\d+$/.test(q));
  const out = new Map();
  for (let i = 0; i < uniq.length; i += 300) {
    const grp = uniq.slice(i, i + 300);
    const rows = await sparql(
      'SELECT ?c ?code WHERE { VALUES ?c { ' + grp.map((q) => 'wd:' + q).join(' ') + ' } ?c wdt:P298 ?code }',
      { maxAgeMs: 90 * 24 * 3600 * 1000 });
    for (const r of rows) out.set(qid(val(r, 'c')), val(r, 'code'));
  }
  return out;
}

/** Evidence filter: turn candidate QIDs into rows that carry enough to ship. */
async function vet(candIds, log) {
  const ents = await entities(candIds);
  const orgSet = await orgClasses();

  const ccQids = [];
  const unitQids = [];
  for (const q of candIds) {
    const e = ents[q];
    if (!e) continue;
    claims(e, 'P17').map(dvItem).filter(Boolean).forEach((x) => ccQids.push(x));
    const rc = best(claims(e, 'P2139'));
    if (rc) { const v = dvQuantity(rc); if (v) unitQids.push(v.unit); }
  }
  const iso3 = await iso3Map(ccQids);
  const cur = await currencyCodes(unitQids);

  const rows = [];
  const rejected = { notOrg: 0, dissolved: 0, noCountry: 0, noSite: 0, noHq: 0, noName: 0 };
  for (const q of candIds) {
    const e = ents[q];
    if (!e || e.missing !== undefined) continue;
    const types = claims(e, 'P31').map(dvItem).filter(Boolean);
    if (!types.length || !types.some((t) => orgSet.has(t))) { rejected.notOrg++; continue; }
    if (claims(e, 'P576').length) { rejected.dissolved++; continue; }
    const ccQ = claims(e, 'P17').map(dvItem).filter(Boolean).map((x) => iso3.get(x)).filter(Boolean);
    if (!ccQ.length) { rejected.noCountry++; continue; }
    const site = claims(e, 'P856').map(dvStr).filter(Boolean)[0];
    if (!site) { rejected.noSite++; continue; }
    if (!claims(e, 'P159').length && !claims(e, 'P625').length) { rejected.noHq++; continue; }
    const name = label(e, ['en', 'ja', 'de', 'fr', 'es']);
    if (!name) { rejected.noName++; continue; }

    const revC = best(claims(e, 'P2139'));
    const rev = revC ? dvQuantity(revC) : null;
    const capC = best(claims(e, 'P2226'));
    const cap = capC ? dvQuantity(capC) : null;
    const industry = claims(e, 'P452').map(dvItem).filter(Boolean);
    let sector = 'other';
    for (const iq of industry) { if (SECTOR_BY_QID[iq]) { sector = SECTOR_BY_QID[iq]; break; } }

    rows.push({
      wikidata: q,
      name,
      country: ccQ[0],
      sector,
      domain: hostOf(site),
      rev: rev ? num(rev.amount) : 0,
      revCur: rev ? (cur.get(rev.unit) || rev.unit) : '',
      cap: cap ? num(cap.amount) : 0,
    });
  }
  log('  survived evidence filter: ' + rows.length + '  (rejected ' + JSON.stringify(rejected) + ')');
  return rows;
}

/** Quota selection over vetted rows, skipping anything already taken. */
function select(rows, skipDomains, skipNames, alreadyPerRegion) {
  /* rank inside (country, currency) so no exchange rate is invented */
  const bucket = new Map();
  for (const r of rows) {
    const k = r.country + '|' + r.revCur;
    if (!bucket.has(k)) bucket.set(k, []);
    bucket.get(k).push(r);
  }
  for (const list of bucket.values()) {
    list.sort((a, b) => (b.rev - a.rev) || (b.cap - a.cap));
    list.forEach((r, i) => { r.rankInBucket = i; });
  }

  const byRegion = new Map();
  for (const r of rows) {
    const reg = REGION_OF[r.country];
    if (!reg) continue;
    if (!byRegion.has(reg)) byRegion.set(reg, []);
    byRegion.get(reg).push(r);
  }

  const picked = [];
  for (const [reg, list] of byRegion) {
    list.sort((a, b) => (a.rankInBucket - b.rankInBucket) || (b.cap - a.cap) || (b.rev - a.rev));
    const quota = (REGION_QUOTA[reg] || 10) - (alreadyPerRegion.get(reg) || 0);
    if (quota <= 0) continue;
    const perSector = new Map();
    const perCountry = new Map();
    let taken = 0;
    for (const r of list) {
      if (taken >= quota) break;
      if (skipDomains.has(r.domain) || skipNames.has(slugify(r.name))) continue;
      const s = perSector.get(r.sector) || 0;
      if (s >= PER_SECTOR_IN_REGION) continue;
      const c = perCountry.get(r.country) || 0;
      if (c >= Math.max(6, Math.ceil((REGION_QUOTA[reg] || 10) * 0.72))) continue;
      perSector.set(r.sector, s + 1);
      perCountry.set(r.country, c + 1);
      picked.push(r);
      skipDomains.add(r.domain);
      skipNames.add(slugify(r.name));
      taken++;
    }
  }
  return picked;
}

async function main() {
  const log = (...a) => console.log(...a);
  log('IntMap · company discovery');

  const curated = curatedManifest();
  log('  curated rows (js/companies.js): ' + curated.length);

  const candIds = await pool();
  log('  Wikidata size pool: ' + candIds.length + ' candidates');
  const rows = await vet(candIds, log);

  const skipDomains = new Set(curated.map((c) => (c.domain || '').toLowerCase()).filter(Boolean));
  const skipNames = new Set(curated.map((c) => slugify(c.name)));
  const already = new Map();
  for (const c of curated) { const r = REGION_OF[c.country]; if (r) already.set(r, (already.get(r) || 0) + 1); }

  const picked = select(rows, skipDomains, skipNames, already);
  for (const p of picked) { const r = REGION_OF[p.country]; if (r) already.set(r, (already.get(r) || 0) + 1); }
  log('  first-pass picks: ' + picked.length);

  /* top-up: any region still below its quota gets a lower, country-scoped floor */
  const short = Object.keys(REGION_QUOTA).filter((r) => (already.get(r) || 0) < REGION_QUOTA[r]);
  if (short.length) {
    log('  regions below quota: ' + short.map((r) => r + ' ' + (already.get(r) || 0) + '/' + REGION_QUOTA[r]).join(', '));
    const codes = [].concat(...short.map((r) => REGION[r]));
    const extraIds = await poolForCountries(codes, 1500000000);
    log('  top-up pool: ' + extraIds.length + ' candidates across ' + codes.length + ' countries');
    const extraRows = await vet(extraIds.filter((q) => !candIds.includes(q)), log);
    const extraPicks = select(extraRows, skipDomains, skipNames, already);
    log('  top-up picks: ' + extraPicks.length);
    picked.push(...extraPicks);
  }
  log('  discovered picks: ' + picked.length);

  const taken = new Set(curated.map((c) => c.id));
  const out = curated.slice();
  for (const r of picked) {
    if (out.length >= TARGET) break;
    out.push({
      id: uniqueSlug(r.name, taken, r.country),
      name: r.name,
      country: r.country,
      sector: r.sector,
      ticker: '',
      domain: r.domain,
      wikidata: r.wikidata,
      origin: 'discovered',
    });
  }

  const manifest = {
    schema: 1,
    note: 'Identities only. Every attribute a user sees is fetched by scripts/companies/build.mjs from the sources in docs/COMPANIES.md.',
    target: TARGET,
    generatedAt: new Date().toISOString().slice(0, 10),
    companies: out,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(manifest, null, 1) + '\n');
  log('  wrote ' + OUT + ' — ' + out.length + ' companies');

  const regCount = {};
  for (const c of out) { const r = REGION_OF[c.country] || '(other)'; regCount[r] = (regCount[r] || 0) + 1; }
  log('  by region: ' + Object.entries(regCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', '));
  const secCount = {};
  for (const c of out) secCount[c.sector] = (secCount[c.sector] || 0) + 1;
  log('  by sector: ' + Object.entries(secCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', '));
}

main().catch((e) => { console.error(e); process.exit(1); });
