#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE FOUR FACTS THE COUNTRY CARD USED TO ASK A DEAD SERVER FOR  (#R451)
 * ----------------------------------------------------------------------------
 *  js/countries-ui.js `enrichCountry()` fetched restcountries.com at run time for every country
 *  card. MEASURED on production 2026-08-25 (build R443): every one of those requests fails, and
 *  it is not a rate limit or a bad field list — the whole API is GONE.
 *
 *      GET https://restcountries.com/v3.1/alpha/USA?fields=…
 *        → 301 Location: https://files-03.restcountries.com/countries.00/legacy.json?fields=…
 *          (the 301 itself carries NO Access-Control-Allow-Origin, which is the browser's error)
 *        → 261 bytes: {"success":false,"errors":[{"message":"This API version has been
 *                       deprecated. Please … migrate to our new version (v5)."}]}
 *
 *  ⚠ EVERY path answers that one file — /v3.1/alpha/USA, /v3.1/all AND /v5/alpha/USA — so this is
 *  not a version this project can move to by editing a URL: v5 wants an account and an
 *  `Authorization: Bearer` key. A Supabase relay would therefore have relayed the deprecation
 *  notice, and the four fields would still never arrive.
 *
 *  ⚠⚠⚠ AND THE ROWS THOSE FIELDS FED WERE THE ONLY WITNESS. `sec()` drops a row whose value is
 *  null, so a card with no Neighbours row and no Timezones row looks exactly like a card for a
 *  country that has neither — the USA card shipped 16 rows and nobody could tell. #R262's rule
 *  again: «an empty answer» and «no answer» must not be the same value.
 *
 *  ⚠⚠⚠ AND IT IS NOT ONLY THE TWO MISSING ROWS. `enrichCountry()` supplied NINE fields, and three
 *  of them are the fallback for a hand-written table in js/tables.js that does not cover the code
 *  set. MEASURED against ne_10m_admin_0_countries.geojson (252 codes) on 2026-08-25:
 *
 *      60 codes have no CAPITAL   (Uruguay's neighbours' size and below: PSE, KOS, DOM, TGO, GRL,
 *                                  NCL, PRI, BHR, MAC, the Channel Islands, the Faroes …)
 *     100 codes have no CURRENCY  (Monaco, Andorra, San Marino, Vatican City, Bahrain, Eswatini,
 *                                  Liberia, Angola, Djibouti, Barbados, Cape Verde …)
 *     115 codes have no LANGS     (Uruguay, Estonia, Latvia, North Macedonia, Montenegro,
 *                                  Honduras, El Salvador, Belize, Suriname, Guyana, Bhutan …)
 *
 *  Every one of those cards has been printing «—» on the Capital / Currency / Languages rows since
 *  the API went away, for the same single reason, and nothing said so either. So this file carries
 *  EVERY field enrichCountry consumed that still has a supplier, in the same precedence the
 *  function already used (`if(!s.capital) …`) — the repair is «put the supplier back», not «add
 *  new rows».
 *
 *  SO THE FACTS ARE SHIPPED, NOT FETCHED. Nothing about them is live — a land border, a capital, a
 *  country's standard-time offsets and UN membership change on the order of once a decade — so a
 *  run-time request to a third party bought nothing but a way to fail. This script builds them
 *  ONCE, at build time, from the two upstreams that actually hold them, and the browser reads
 *  `data/country-facts.json` from its own origin. No key, no CORS, no third party at run time.
 *
 *  ⚠ FIVE OF THE FOURTEEN FALLBACK LINES ARE NOT HERE, BECAUSE THEY CANNOT FIRE. Measured over the
 *  same 252 codes: `region` and `subregion` are never empty at ANY Natural Earth scale (#R424 and
 *  #R443 measured this one field at a time; both halves of the Region row are covered), LABEL_X /
 *  LABEL_Y are present on every feature so `latlng` is always set, and the only codes with an
 *  empty ISO_A2 (so a fallback `flag`) or POP_EST 0 (so a fallback `population`) are Natural
 *  Earth's own disputed-ground codes, which have no ISO row here to fall back TO. mledoze carries
 *  no population field at all. A line that cannot fire is deleted rather than fed.
 *
 *  SOURCES
 *    · mledoze/countries (ODbL 1.0) — https://github.com/mledoze/countries
 *      `borders`, `unMember`, `independent`, `demonyms.eng`, `capital`, `currencies`, `languages`,
 *      `area`. ⚠ THIS IS RESTCOUNTRIES' OWN
 *      UPSTREAM: restcountries was a server in front of this file, so the shipped values are the
 *      same values the card printed before the API was withdrawn.
 *    · IANA Time Zone Database (public domain) — https://data.iana.org/time-zones/tzdb/zone.tab
 *      `timezones`. mledoze carries NO timezone field (measured: 0 of 250 rows), so the offsets
 *      are derived here: every zone.tab zone of the country, resolved to its STANDARD offset
 *      through the platform's own ICU. Standard, not current: DST only ever ADDS to the base
 *      offset, so min(January, July) is the standard one in both hemispheres — measured
 *      Australia/Sydney +11/+10 → +10, America/Santiago -3/-4 → -4, Australia/Lord_Howe
 *      +11/+10:30 → +10:30.
 *    · Natural Earth admin-0 (public domain) — the KEY SET. The file is keyed by the code
 *      js/countries-ui.js itself derives (`ISO_A3_EH || ISO_A3 || ADM0_A3`), not by ISO 3166-1,
 *      because a key the app never computes is a row the app can never read.
 *
 *  ⚠⚠⚠ THE BUILD REFUSES WHEN THE TWO CODE UNIVERSES STOP MATCHING. Natural Earth carries 252
 *  codes and mledoze 250, and they are not the same 250: NE has thirteen codes of its own for
 *  disputed and undefined ground (Bir Tawil, Spratly, Siachen …) and mledoze has eleven ISO codes
 *  whose land Natural Earth folds into a parent polygon (the French DOMs, Svalbard, Tokelau …).
 *  Kosovo is in NEITHER list because the alias below resolves it — which is the point of stating
 *  the difference as a measurement rather than a hand-kept exclusion list.
 *  Both lists are DECLARED below and asserted, so the day an upstream changes shape the build
 *  stops with the difference printed — rather than quietly writing a file that is short some
 *  countries, which is the failure this whole round exists to remove.
 *
 *  USAGE
 *    node scripts/build-country-facts.mjs            write data/country-facts.json
 *    node scripts/build-country-facts.mjs --check    re-derive and compare with the committed file
 *
 *  ⚠ NOT IN `npm test`. It needs the network (jsDelivr + IANA); the committed file is validated
 *  OFFLINE by tests/r451-checks.test.mjs, and that the rows actually REACH THE SCREEN is
 *  tests/r424.spec.js. Three different questions, three different places.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'country-facts.json');

const NE = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/';
const MLEDOZE = 'https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json';
const ZONE_TAB = 'https://data.iana.org/time-zones/tzdb/zone.tab';

/* ⚠ NATURAL EARTH'S OWN CODES FOR GROUND NO ISO CODE DESCRIBES. Not an exclusion list — a
   DECLARATION of what the difference is allowed to be. A code appearing here that Natural Earth
   no longer carries, or one it carries that is not here, fails the build. */
const NE_ONLY = ['BJN', 'BRT', 'CNM', 'CYN', 'ESB', 'KAS', 'PGA', 'SCR', 'SER', 'SOL', 'SPI', 'USG', 'WSB'];

/* …and the ISO codes whose land Natural Earth draws inside a parent polygon rather than as a
   feature of its own, so the app never computes the code and never asks for the row. */
const ISO_ONLY = ['BES', 'BVT', 'CCK', 'CXR', 'GLP', 'GUF', 'MTQ', 'MYT', 'REU', 'SJM', 'TKL'];

/* ⚠ ONE ALIAS, AND IT IS A REAL COUNTRY. Natural Earth calls Kosovo `KOS`; mledoze and the ISO
   user-assigned range call it `UNK` (IntMap's own CAPITAL table says `XKX` — three spellings of
   one place). Without this line the Kosovo card would silently lose all four facts, which is the
   exact shape of the defect being fixed. Borders naming UNK are rewritten to KOS with it. */
const ALIAS = { UNK: 'KOS' };

/* ⚠⚠ ONE DECLARED CORRECTION TO THE UPSTREAM, WITH ITS REASON — the rule
   data/subcable-overrides.json already follows: a correction is DATA, and it is written down.
   mledoze marks 194 rows `unMember:true`. The United Nations has 193 member states; the Holy See
   is a Permanent Observer State, not a member (UN GA res. 58/314). Shipping «UN member: Yes» on
   the Vatican City card would be a visible factual error on a world map. */
const UN_FIX = { VAT: { un: false, why: 'Holy See is a UN Permanent Observer State, not a member (UN GA res. 58/314)' } };
const UN_MEMBER_COUNT = 193;

/* ⚠⚠ …AND ONE MORE, FOUND BY THE SYMMETRY CHECK BELOW RATHER THAN BY READING THE DATA.
   mledoze's Sri Lanka row lists `IND` while India's row does not list `LKA` — the ONLY asymmetric
   pair in all 250 rows. Sri Lanka is an island: the Palk Strait, ~30 km at its narrowest, is what
   lies between them, so there is no land border and India's row is the correct one. Dropped here
   rather than by loosening the check, because the check is what found it. */
const BORDER_FIX = {
  LKA: { drop: ['IND'], why: 'Sri Lanka is an island — the Palk Strait, not a land border, separates it from India' },
};

async function grabJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
  return await r.json();
}
async function grabText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
  return await r.text();
}

/* the code js/countries-ui.js derives for a Natural Earth feature — copied deliberately, and
   tests/r451-checks.test.mjs ② compares this rule with the one the app uses. */
function neCode(p) {
  const c = (p.ISO_A3_EH && p.ISO_A3_EH !== '-99') ? p.ISO_A3_EH
    : ((p.ISO_A3 && p.ISO_A3 !== '-99') ? p.ISO_A3 : (p.ADM0_A3 || ''));
  return (c && c !== '-99') ? String(c) : '';
}

const OFF_JAN = Date.UTC(2026, 0, 15), OFF_JUL = Date.UTC(2026, 6, 15);
const offMinutes = (s) => { const m = /([+-])(\d\d):(\d\d)/.exec(s); return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0; };
function zoneOffset(zone, when) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(when);
  const v = (parts.find((p) => p.type === 'timeZoneName') || {}).value || '';
  if (v === 'GMT') return 'UTC+00:00';
  if (!/^GMT[+-]\d\d:\d\d$/.test(v)) throw new Error('unparsable offset "' + v + '" for ' + zone);
  return v.replace(/^GMT/, 'UTC');
}

async function build() {
  const [ne110, ne10, iso, zoneTab] = await Promise.all([
    grabJSON(NE + 'ne_110m_admin_0_countries.geojson'),
    grabJSON(NE + 'ne_10m_admin_0_countries.geojson'),
    grabJSON(MLEDOZE),
    grabText(ZONE_TAB),
  ]);

  /* ── the key set: every code the app can ever compute, from both scales it loads ───────────── */
  const appCodes = new Set();
  for (const g of [ne110, ne10]) for (const f of (g.features || [])) { const c = neCode(f.properties || {}); if (c) appCodes.add(c); }

  /* ── the ISO side, re-keyed onto the app's codes ───────────────────────────────────────────── */
  const byCode = new Map(), a2ToCode = new Map();
  for (const c of iso) {
    const code = ALIAS[c.cca3] || c.cca3;
    byCode.set(code, c);
    if (c.cca2) a2ToCode.set(c.cca2, code);
  }

  /* ⚠ THE TWO DECLARED DIFFERENCES, ASSERTED IN BOTH DIRECTIONS. */
  const neOnly = [...appCodes].filter((c) => !byCode.has(c)).sort();
  const isoOnly = [...byCode.keys()].filter((c) => !appCodes.has(c)).sort();
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (!same(neOnly, [...NE_ONLY].sort())) {
    throw new Error('NE_ONLY is stale.\n  declared: ' + [...NE_ONLY].sort().join(' ') + '\n  measured: ' + neOnly.join(' '));
  }
  if (!same(isoOnly, [...ISO_ONLY].sort())) {
    throw new Error('ISO_ONLY is stale.\n  declared: ' + [...ISO_ONLY].sort().join(' ') + '\n  measured: ' + isoOnly.join(' '));
  }

  /* ── timezones: zone.tab's ISO 3166-1 alpha-2 → this project's code → standard offsets ─────── */
  const zonesByCode = new Map();
  for (const line of zoneTab.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const p = line.split('\t');
    const code = a2ToCode.get(p[0]), zone = p[2];
    if (!code || !zone) continue;
    if (!zonesByCode.has(code)) zonesByCode.set(code, []);
    zonesByCode.get(code).push(zone);
  }

  const countries = {};
  for (const code of [...appCodes].sort()) {
    const c = byCode.get(code);
    if (!c) continue;                       /* one of NE_ONLY — no ISO row exists to describe it */
    const rec = {};
    const zones = zonesByCode.get(code) || [];
    if (zones.length) {
      const set = new Set();
      for (const z of zones) {
        const a = zoneOffset(z, OFF_JAN), b = zoneOffset(z, OFF_JUL);
        set.add(offMinutes(a) <= offMinutes(b) ? a : b);   /* standard time = the smaller offset */
      }
      rec.tz = [...set].sort((x, y) => offMinutes(x) - offMinutes(y));
    }
    const drop = (BORDER_FIX[code] && BORDER_FIX[code].drop) || [];
    const borders = (c.borders || []).map((b) => ALIAS[b] || b)
      .filter((b) => appCodes.has(b) && !drop.includes(b)).sort();
    if (borders.length) rec.borders = borders;
    rec.un = UN_FIX[code] ? UN_FIX[code].un : !!c.unMember;
    rec.ind = !!c.independent;
    const eng = c.demonyms && c.demonyms.eng;
    const dem = eng && (eng.m || eng.f);
    if (dem) rec.dem = dem;
    /* ⚠ THE THREE THAT STAND IN FOR A HAND-WRITTEN TABLE, in the SHAPE enrichCountry() already
       built from them — first capital, currency as «CODE (name)», languages joined with «, » —
       so the row reads identically to the way it read while restcountries answered. */
    if (c.capital && c.capital.length) rec.capital = c.capital[0];
    const cur = c.currencies && Object.entries(c.currencies)[0];
    if (cur) rec.currency = cur[0] + ((cur[1] && cur[1].name) ? ' (' + cur[1].name + ')' : '');
    if (c.languages && Object.keys(c.languages).length) rec.languages = Object.values(c.languages).join(', ');
    if (c.area != null) rec.area = c.area;
    countries[code] = rec;
  }

  const unCount = Object.values(countries).filter((r) => r.un).length;
  if (unCount !== UN_MEMBER_COUNT) {
    throw new Error('UN member count is ' + unCount + ', expected ' + UN_MEMBER_COUNT +
      ' — the upstream list moved, or UN_FIX is stale.');
  }

  /* ⚠ SYMMETRY IS A PROPERTY OF A LAND BORDER, so it is checked rather than assumed. An
     asymmetric pair means one side of a real border is about to print without the other. */
  const asym = [];
  for (const [code, rec] of Object.entries(countries)) {
    for (const b of (rec.borders || [])) {
      const other = countries[b];
      if (!other || !(other.borders || []).includes(code)) asym.push(code + '\u2192' + b);
    }
  }
  if (asym.length) throw new Error('asymmetric land borders: ' + asym.join(' '));

  return {
    '//': 'BUILT FILE — do not edit by hand. Regenerate with `npm run build:countryfacts`. See scripts/build-country-facts.mjs for why these facts are shipped rather than fetched.',
    built: new Date().toISOString().slice(0, 10),
    sources: [
      { n: 'mledoze/countries', u: 'https://github.com/mledoze/countries', licence: 'ODbL 1.0', fields: 'capital, currency, languages, area, borders, un, ind, dem' },
      { n: 'IANA Time Zone Database', u: 'https://www.iana.org/time-zones', licence: 'public domain', fields: 'tz' },
      { n: 'Natural Earth admin-0', u: 'https://www.naturalearthdata.com/', licence: 'public domain', fields: 'the code set' },
    ],
    corrections: [
      ...Object.entries(UN_FIX).map(([code, f]) => ({ code, un: f.un, why: f.why })),
      ...Object.entries(BORDER_FIX).map(([code, f]) => ({ code, dropBorders: f.drop, why: f.why })),
    ],
    neOnlyCodes: [...NE_ONLY].sort(),
    isoOnlyCodes: [...ISO_ONLY].sort(),
    /* ⚠ THE ABSENCE IS DECLARED RATHER THAN LEFT AS AN ABSENCE — the whole point of the round.
       A code here has a row and no `tz` because the IANA database assigns it no zone (Kosovo has
       no XK entry in zone.tab or zone1970.tab; Heard & McDonald is uninhabited), NOT because the
       build dropped it. tests/r451-checks.test.mjs ⑤ holds the two apart. */
    withoutTimezone: Object.keys(countries).filter((k) => !countries[k].tz).sort(),
    countries,
  };
}

const text = (o) => JSON.stringify(o, null, 1) + '\n';

const check = process.argv.includes('--check');
const built = await build();
const out = text(built);
if (check) {
  const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  /* `built` is a date stamp — the rest of the file is what must not drift.
     ⚠ AND LINE ENDINGS ARE NOT PART OF THE CONTENT. This repository is checked out with
     core.autocrlf=true, so a fresh clone has this file with CRLF while the text built above always
     has LF; comparing the bytes as they sit on disk would fail on every machine but the one that
     last ran the writer. */
  const strip = (s) => s.replace(/\r\n/g, '\n').replace(/^\s*"built":\s*"[^"]*",\s*$/m, '');
  if (strip(have) !== strip(out)) {
    console.error('data/country-facts.json is STALE — re-run `npm run build:countryfacts`.');
    process.exit(1);
  }
  console.log('country-facts: committed file matches the upstreams (' + Object.keys(built.countries).length + ' codes).');
} else {
  fs.writeFileSync(OUT, out);
  const withTz = Object.values(built.countries).filter((r) => r.tz).length;
  const withB = Object.values(built.countries).filter((r) => r.borders).length;
  console.log('data/country-facts.json  ' + Object.keys(built.countries).length + ' codes  ' +
    withTz + ' with timezones  ' + withB + ' with land borders  ' +
    Object.values(built.countries).filter((r) => r.un).length + ' UN members  ' +
    (Buffer.byteLength(out) / 1024).toFixed(1) + ' KB');
}
