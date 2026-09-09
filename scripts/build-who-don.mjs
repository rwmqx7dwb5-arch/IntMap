#!/usr/bin/env node
/* ============================================================================
 *  IntMap · build-who-don — WHO Disease Outbreak News, as a bundled event corpus  (#R650)
 * ----------------------------------------------------------------------------
 *  「感染症アウトブレイク。WHOのDisease Outbreak Newsを地理化。病原体 / 国・地域 / 発生日 /
 *    WHO公表日 / 症例数 / 死亡数 のイベントレイヤー。WHO自身に現在JSON APIがあります。」
 *
 *  ══ WHAT WHO ACTUALLY HOLDS, MEASURED 2026-09-09 ═══════════════════════════════════════════════
 *  The API is Sitefinity's OData service at https://www.who.int/api/news/ and it is far better than
 *  a news feed: FIVE of the six fields the request names are STRUCTURED FIELDS, not prose.
 *
 *      病原体      EmergencyEvent.Title, verified  3,195 / 3,195 named — ⚠ but see `eventName` below:
 *                  and repaired from the title      the FIELD is present on 98.3 % and 2,700 of
 *                                                   those values are a BARE YEAR
 *      国・地域    regionscountries → countries    3,016 / 3,195 = 94.4 % resolve to an ISO code
 *      発生日      EmergencyEventStartDate         2019+ ≈ 88 %, before 2019 ≈ 0 %
 *      WHO公表日   PublicationDateAndTime          3,195 / 3,195 = 100 %
 *      症例数/死亡数  ── nowhere ──                 prose only; see supabase/functions/who-don
 *
 *  ⚠⚠ THE COUNTRY IS A JOIN, NOT A NAME MATCH, AND THAT IS THE WHOLE POINT. A DON carries
 *  `regionscountries`, a list of TAXON GUIDs. Those GUIDs are NOT country ids — every one of the
 *  3,233 references failed to resolve against `countries` by Id (measured). What resolves them is
 *  that a Country content item is TAGGED WITH THE SAME TAXON: `countries?$filter=regionscountries/
 *  any(x: x eq <guid>)` returns Democratic Republic of the Congo, `Code: "COD"`. So the country
 *  identity comes from WHO's own taxonomy joined to WHO's own ISO code, and this file contains no
 *  list of country names, no spelling table, and no rule of its own for reading a title — the one
 *  rule there is lives in js/outbreaks.js and this file evaluates that file for it (#R660)
 *  (.agents/rules/no-ad-hoc-hardcoding.md §1: an embedded list of names derivable from the data).
 *
 *  ⚠ A DON THAT RESOLVES TO NO COUNTRY IS KEPT WITH AN EMPTY LIST, NOT DROPPED AND NOT GUESSED.
 *  179 of them are genuinely not a country: «Yellow fever – Global», «Cholera – Multi-country»,
 *  «Oropouche virus disease – Region of the Americas». Putting those on a WHO region's centre would
 *  invent a precision that does not exist, so the layer lists them and draws nothing. The three
 *  states a reader must be able to tell apart are «placed», «WHO published this about no single
 *  country» and «we did not look» — the same three the warnings layer keeps (#R297).
 *
 *  ⚠ NO COORDINATES ARE BAKED IN. The file carries ISO-3166 alpha-3 codes; where a country IS on
 *  the map is the map's answer, and the map already has one (js/world-packs.js `centroidOf`, and
 *  turf.pointOnFeature over the same countryGeo). A coordinate frozen here would be a second copy
 *  of a fact the renderer already owns.
 *
 *  ⚠ NOT A RELAY. The browser can read this API itself — measured with `Origin:` set to the Pages
 *  origin, WHO answers `Access-Control-Allow-Origin: *` — so js/outbreaks.js fetches the recent tail
 *  live and there is no Edge Function in front of the feed (#R266: a relay that is not needed is one
 *  more thing to be down). This script exists because the HISTORY is 3,195 items at a hard page cap
 *  of 100, i.e. 32 round trips, which is a build-time cost and not a page-load one.
 *
 *  ⚠ `Python-urllib` IS BLOCKED (403) AND AN ABSENT USER-AGENT IS NOT (200). Measured both ways.
 *  The 403 is about the specific agent string, so this sends its own.
 *
 *  Usage:
 *      node scripts/build-who-don.mjs                 # rebuild data/who-don.json.gz
 *      node scripts/build-who-don.mjs --check         # exit 1 if the committed file is stale/broken
 *      node scripts/build-who-don.mjs --out <path>
 * ==========================================================================*/
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'who-don.json.gz');

/* The OData service root. Both entity sets live under it — `diseaseoutbreaknews` and the
   `countries` the taxon join needs. */
export const WHO_API = 'https://www.who.int/api/news/';
/* Every DON's public page is the service root's sibling plus the item's UrlName. ⚠ NOT DonId:
   `DonId` is empty on 1996-era items and `UrlName` is the slug the site actually serves
   (measured: .../item/1996_01_22a-en → 200, .../item/1996DON01 → 404). */
export const WHO_ITEM_BASE = 'https://www.who.int/emergencies/disease-outbreak-news/item/';
/* ⚠ MEASURED CEILING, NOT A PREFERENCE: $top=100 answers 200 and $top=200 answers 400. */
const PAGE = 100;
const UA = 'IntMap/build-who-don (+https://github.com/rwmqx7dwb5-arch/IntMap)';

/* v2 (#R660): the corpus now carries `places`, the vocabulary a title's tail is verified against.
   The browser needs it because js/outbreaks.js's live tail runs the same rule, and it cannot page
   WHO's 226 country items on every open to learn WHO's own spellings. */
const SCHEMA_VERSION = 2;

async function odata(path, params) {
  const q = new URLSearchParams(params);
  const url = WHO_API + path + '?' + q.toString().replace(/%24/g, '$');
  const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA } });
  if (!r.ok) throw new Error(`WHO ${path} → HTTP ${r.status}`);
  return r.json();
}

/* Page an entity set to exhaustion. The service has no continuation token; $skip is the contract. */
async function pageAll(path, params, onPage) {
  const out = [];
  for (let skip = 0; ; skip += PAGE) {
    const d = await odata(path, { ...params, $top: String(PAGE), $skip: String(skip) });
    const v = d.value || [];
    out.push(...v);
    if (onPage) onPage(out.length);
    if (v.length < PAGE) return out;
  }
}

/* ── the taxon → ISO-3166 alpha-3 join ───────────────────────────────────────────────────────────
   One taxon can carry more than one country item (measured: exactly one does), so the map is
   taxon → [iso3…] and a DON inherits the union. A country WHO has no ISO code for cannot be placed
   and is therefore not in the map at all — the join refuses rather than inventing a key. */
export function buildTaxonIndex(countries) {
  const byTaxon = new Map();
  const names = {};
  for (const c of countries) {
    const iso = String(c.Code || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(iso)) continue;
    names[iso] = String(c.Title || '').trim();
    for (const g of (c.regionscountries || [])) {
      const k = String(g).toLowerCase();
      if (!byTaxon.has(k)) byTaxon.set(k, []);
      if (!byTaxon.get(k).includes(iso)) byTaxon.get(k).push(iso);
    }
  }
  return { byTaxon, names };
}

/* ══ ⚠⚠⚠ THE EVENT NAME, AND WHY IT IS NOT SIMPLY `EmergencyEvent.Title` ═══════════════════════════
   The first version of this file read the pathogen straight out of `EmergencyEvent.Title` and its
   header said «98.3 %», which was true and useless: that is the rate at which the FIELD IS PRESENT,
   not the rate at which it says a disease. MEASURED on the built corpus: **2,700 of those 3,141
   values are a bare year** — every one of the 206 items published in 2014 had `EmergencyEvent.Title
   === '2014'`. The layer's pathogen filter therefore offered «2014 · 2013» as diseases, and
   tests/r650.spec.js ③ is what found it. That is #R534's shape exactly (a field's PRESENCE read as
   its MEANING), and it is why the check below counts named events rather than non-null ones.

   ⚠ WHO'S HEALTH-TOPIC TAXONOMY DOES NOT RESCUE THEM. `EmergencyEvent.healthtopics` joins to the
   `healthtopics` entity set the same way the country taxon joins to `countries` — measured, it
   resolves for 199 of 240 emergency events — but **all 25 year-titled events resolve to nothing**.
   The disease name for those items exists in exactly one place: the DON's own title.

   ⚠⚠⚠ THE RULE ITSELF IS NOT WRITTEN HERE ANY MORE (#R660). It is `window.IntMapWhoDonName` in
   `js/outbreaks.js`, and this script EVALUATES that file to get it — the same thing
   scripts/build-whs.mjs does with js/lang-registry.js. #R650 kept the rule here and asserted that
   the layer «never re-derives a name»; the layer's live tail was in fact taking
   `EmergencyEvent.Title` raw, so the two readers disagreed on 26 of WHO's newest 100 items and a
   corpus rebuild could not reach the one a reader actually saw. One implementation, two readers
   (.agents/rules/no-ad-hoc-hardcoding.md §2.3). */
const NAME = (() => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(readFileSync(join(ROOT, 'js', 'outbreaks.js'), 'utf8'), ctx,
    { filename: 'js/outbreaks.js' });
  const n = ctx.window.IntMapWhoDonName;
  if (!n || typeof n.eventName !== 'function' || typeof n.donName !== 'function') {
    throw new Error('js/outbreaks.js no longer publishes window.IntMapWhoDonName');
  }
  return n;
})();
export const NORM = NAME.NORM;
export const eventName = NAME.eventName;
export const donName = NAME.donName;

/* A DON row → the record the layer reads. Every field is either present in WHO's answer or null;
   nothing here derives a value from another. */
export function toEvent(d, byTaxon, places) {
  const ev = d.EmergencyEvent || null;
  const iso = [];
  for (const g of (d.regionscountries || [])) {
    for (const c of (byTaxon.get(String(g).toLowerCase()) || [])) if (!iso.includes(c)) iso.push(c);
  }
  const day = (s) => (typeof s === 'string' && s.length >= 10 ? s.slice(0, 10) : null);
  const url = String(d.UrlName || '').trim();
  if (!url) return null;                       /* no slug means no citable page — not an event */
  return {
    u: url,
    n: String(d.DonId || '').trim() || null,
    t: String(d.Title || '').trim(),
    p: day(d.PublicationDateAndTime) || day(d.PublicationDate),
    s: ev ? day(ev.EmergencyEventStartDate) : null,
    c: iso.sort(),
    /* ⚠ THE EVENT NAME IS CLEANED WHICHEVER SOURCE IT CAME FROM, and the CHOICE between the two
       sources is part of the rule rather than something each reader re-assembles — `donName` in
       js/outbreaks.js holds both, and the layer's live tail calls the very same function (#R660). */
    d: NAME.donName(d, places),
    e: ev && ev.EventId ? String(ev.EventId).trim() : null,
  };
}

export async function fetchCorpus(log) {
  const say = log || (() => { });
  say('countries…');
  const countries = await pageAll('countries', { $select: 'Id,Title,Code,regionscountries' });
  const { byTaxon, names } = buildTaxonIndex(countries);
  say(`  ${countries.length} countries, ${byTaxon.size} taxons`);

  /* the OTHER half of the place vocabulary a title is verified against — WHO's own six regions
     plus headquarters. Fetched, not written down (DECISIONS.md's rule about lists that rot). */
  say('who regions…');
  const regions = await pageAll('whoregions', { $select: 'Id,Title,WhoRegionCode' });
  const places = new Set([...countries.map((c) => NORM(c.Title)), ...regions.map((r) => NORM(r.Title))]);
  places.delete('');
  say(`  ${regions.length} regions, ${places.size} place names to verify a title's tail against`);

  say('disease outbreak news…');
  const rows = await pageAll('diseaseoutbreaknews', {
    $select: 'Id,Title,DonId,UrlName,PublicationDateAndTime,PublicationDate,regionscountries',
    $expand: 'EmergencyEvent',
    $orderby: 'PublicationDateAndTime desc',
  }, (n) => { if (n % 500 === 0) say(`  ${n}…`); });
  say(`  ${rows.length} items`);

  const events = rows.map((d) => toEvent(d, byTaxon, places)).filter(Boolean);
  /* Every country the taxon map can produce, not only the ones a past DON happens to name — the
     live tail can place an event in a country the archive has never mentioned. */
  const countryNames = {};
  Object.keys(names).sort().forEach((i) => { countryNames[i] = names[i]; });

  /* ⚠ THE TAXON MAP TRAVELS WITH THE FILE, AND THAT IS WHAT MAKES THE LIVE TAIL ONE REQUEST.
     js/outbreaks.js re-reads the newest page from WHO on every open so the layer is never staler
     than the last deploy; without this map it would have to page all 226 country items again just
     to learn that a fresh DON's taxon means COD. 206 keys, and it compresses to almost nothing.
     ⚠ A taxon minted after this build resolves to nothing, and the event is then LISTED AND NOT
     PLACED — the same honest state as «Global». It is not guessed from the title. */
  const taxa = {};
  [...byTaxon.entries()].sort().forEach(([g, iso]) => { taxa[g] = iso; });

  return {
    v: SCHEMA_VERSION,
    built: new Date().toISOString().slice(0, 10),
    /* ⚠ WHO'S OWN COUNTRY AND REGION TITLES, NORMALISED — not a spelling table anyone typed. It is
       the same Set this build verified 3,195 titles against, travelling so the live tail can verify
       the next one the same way. */
    places: [...places].sort(),
    source: 'WHO Disease Outbreak News',
    api: WHO_API + 'diseaseoutbreaknews',
    itemBase: WHO_ITEM_BASE,
    countries: countryNames,
    taxa,
    events,
  };
}

export function readCorpus(path) {
  return JSON.parse(gunzipSync(readFileSync(path || OUT)).toString('utf8'));
}

function summarise(c) {
  const placed = c.events.filter((e) => e.c.length).length;
  const withStart = c.events.filter((e) => e.s).length;
  const withPathogen = c.events.filter((e) => e.d).length;
  /* ⚠ THE CHECK THAT #R650's OWN FIRST VERSION FAILED: a name that is a bare year is not a name. */
  const yearNames = c.events.filter((e) => e.d && /^\d{4}$/.test(e.d)).length;
  const pct = (n) => (100 * n / c.events.length).toFixed(1) + '%';
  return [
    `events        ${c.events.length}`,
    `placed        ${placed} (${pct(placed)})`,
    `event name    ${withPathogen} (${pct(withPathogen)})` + (yearNames ? `  ⚠ ${yearNames} are a bare YEAR` : ''),
    `outbreak date ${withStart} (${pct(withStart)})`,
    `countries     ${Object.keys(c.countries).length}`,
  ].join('\n  ');
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
  process.argv[1] && process.argv[1].endsWith('build-who-don.mjs')) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const outAt = args.indexOf('--out');
  const out = outAt >= 0 ? args[outAt + 1] : OUT;

  if (check) {
    /* ⚠ --check does NOT go to the network. A build gate that depends on WHO being up is a gate
       that fails for a reason that has nothing to do with the commit. It asks only whether the
       committed file is a corpus this reader understands. */
    if (!existsSync(out)) { console.error(`who-don: ${out} is missing — run node scripts/build-who-don.mjs`); process.exit(1); }
    let c;
    try { c = readCorpus(out); } catch (e) { console.error('who-don: unreadable —', e.message); process.exit(1); }
    const bad = [];
    if (c.v !== SCHEMA_VERSION) bad.push(`schema v${c.v} ≠ v${SCHEMA_VERSION}`);
    if (!Array.isArray(c.events) || c.events.length < 3000) bad.push(`only ${c.events && c.events.length} events`);
    if (!c.events.every((e) => e.u && e.p && Array.isArray(e.c))) bad.push('an event is missing u/p/c');
    const yr = c.events.filter((e) => e.d && /^\d{4}$/.test(e.d)).length;
    if (yr) bad.push(`${yr} event name(s) are a bare year — EmergencyEvent.Title was trusted without being read`);
    if (bad.length) { console.error('who-don: ' + bad.join('; ')); process.exit(1); }
    console.log('who-don ok\n  ' + summarise(c));
    process.exit(0);
  }

  const corpus = await fetchCorpus((s) => console.log(s));
  const gz = gzipSync(Buffer.from(JSON.stringify(corpus)), { level: 9 });
  writeFileSync(out, gz);
  console.log(`\nwrote ${out}  ${(gz.length / 1024).toFixed(0)} kB gz\n  ` + summarise(corpus));
}
