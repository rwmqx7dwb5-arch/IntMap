#!/usr/bin/env node
/* ============================================================================
 *  build-admin-stats.mjs — data/admin-stats.json.gz
 * ----------------------------------------------------------------------------
 *  A POPULATION FOR EVERY ADMINISTRATIVE UNIT THAT STATES ONE — WITH THE DATE, THE METHOD, AND
 *  THE UNIT'S OWN LIFESPAN, SO A JOIN CANNOT BE MADE ON THE YEAR ALONE.
 *
 *  IntMap shipped 4,515 first-level boundaries (data/admin1-world.json.gz) and not one number for
 *  them, so 「都道府県を人口で色分け」 was answered with a refusal. The numbers exist: Wikidata (CC0)
 *  holds P1082 (population) statements whose qualifiers say WHEN (P585 point in time) and HOW
 *  (P459 determination method: census, estimate, projection …).
 *
 *  ── FOUR KEYS, BECAUSE THE CODES ARE DIFFERENT THINGS ───────────────────────
 *    iso3166-2   P300   first-level units worldwide (JP-13, US-CA, DE-BY)   → joins to the shipped boundaries
 *    nuts        P605   EU/EFTA statistical regions, NUTS 1/2/3 (DE21, FR101)
 *    us-fips     P882   US states (2 digits) and counties (5 digits)
 *    jp-jis      P429   Japanese prefectures and municipalities (全国地方公共団体コード, 5 digits)
 *  A key names a unit; it does not make two units comparable. Wikidata's NUTS items carry one
 *  population per statement but the NUTS classification itself changes (2013 → 2016 → 2021), and a
 *  Japanese municipality code points at a different territory after a merger. So each unit keeps
 *    inc  P571 inception   · dis  P576 dissolved/abolished   — the unit's own lifespan
 *  and the reader (js/admin-stats.js) refuses to answer 「この年のこの単位」 outside it.
 *
 *  ── WHAT IS NOT CLAIMED ─────────────────────────────────────────────────────
 *  · A statement with no P585 keeps `t:null`: it is never assigned a year (a floor, a neighbour, the
 *    build date) — an undated figure cannot be coloured for a year, and says so.
 *  · The method is carried as Wikidata states it (a QID with its label); no method is invented.
 *  · Coverage is what Wikidata holds. `n` counts units; absence of a unit is 「Wikidata に無い」, not zero.
 *
 *      node scripts/build-admin-stats.mjs            # refresh from the Wikidata Query Service
 *      node scripts/build-admin-stats.mjs --check    # fail if the committed copy is missing / unreadable
 * ==========================================================================*/
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { WIKIDATA } from './lib/upstream-cadence.mjs';

const OUT = 'data/admin-stats.json.gz';
const ENDPOINT = 'https://query.wikidata.org/sparql';
const UA = 'IntMap/build-admin-stats (public repository build script)';

export const GOVERNANCE = {
  'data/admin-stats.json.gz': {
    publisher: 'Wikidata (Wikimedia Foundation) — population statements P1082 with point-in-time P585 and determination method P459',
    url: 'https://www.wikidata.org/wiki/Property:P1082',
    ...WIKIDATA,
    builtBy: 'scripts/build-admin-stats.mjs',
  },
};

/* one entry per key. `chunks` split a query so no single call times out (observed 2026-11-20: the whole
   iso3166-2 set is 30,703 statements, over what one call comfortably serves). */
const A = (s, n) => Array.from({ length: n }, (_, i) => String.fromCharCode(s.charCodeAt(0) + i));
const D2 = (a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(String(i).padStart(2, '0')); return o; };
export const KINDS = {
  'iso3166-2': { prop: 'P300', chunks: A('A', 26), note: 'first-level units, ISO 3166-2' },
  'nuts': { prop: 'P605', chunks: ['AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SE', 'SI', 'SK', 'TR', 'UK', 'AL'], note: 'Eurostat NUTS regions (levels 1-3)' },
  'us-fips': { prop: 'P882', chunks: D2(1, 78), note: 'US states and counties, FIPS' },
  'jp-jis': { prop: 'P429', chunks: D2(1, 47), note: 'Japanese prefectures and municipalities, JIS X 0401/0402' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function sparql(q) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(ENDPOINT, { method: 'POST', body: new URLSearchParams({ query: q }), headers: { accept: 'application/sparql-results+json', 'user-agent': UA } });
      if (r.ok) return (await r.json()).results.bindings;
      if (r.status !== 429 && r.status < 500) throw new Error('Wikidata ' + r.status);
    } catch (e) { if (attempt === 4) throw e; }
    await sleep(3000 * attempt);
  }
  throw new Error('Wikidata did not answer');
}
const v = (b, k) => (b[k] ? b[k].value : null);
const qid = (u) => (u ? u.replace('http://www.wikidata.org/entity/', '') : null);
const iso = (t) => { if (!t) return null; const m = /^(-?\d{4,})-(\d\d)-(\d\d)/.exec(t); return m ? m[1] + '-' + m[2] + '-' + m[3] : null; };

async function build() {
  const out = {};
  const methodQ = new Set();
  let statements = 0;
  for (const [kind, K] of Object.entries(KINDS)) {
    const units = (out[kind] = {});
    for (const c of K.chunks) {
      const rows = await sparql(`SELECT ?i ?code ?pop ?time ?method ?inc ?dis ?en ?ja WHERE {
        ?i wdt:${K.prop} ?code . FILTER(STRSTARTS(STR(?code),"${c}"))
        ?i p:P1082 ?st . ?st ps:P1082 ?pop .
        FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }
        OPTIONAL { ?st pq:P585 ?time } OPTIONAL { ?st pq:P459 ?method }
        OPTIONAL { ?i wdt:P571 ?inc } OPTIONAL { ?i wdt:P576 ?dis }
        OPTIONAL { ?i rdfs:label ?en . FILTER(LANG(?en)="en") } OPTIONAL { ?i rdfs:label ?ja . FILTER(LANG(?ja)="ja") }
      }`);
      for (const b of rows) {
        const code = v(b, 'code'), pop = Number(v(b, 'pop'));
        if (!code || !isFinite(pop) || pop < 0) continue;
        const u = (units[code] = units[code] || { q: qid(v(b, 'i')), s: [], seen: new Set() });
        if (u.q !== qid(v(b, 'i'))) continue; /* two items for one code: the first is kept, the clash is counted below */
        const t = iso(v(b, 'time')), m0 = qid(v(b, 'method')), m = /^Q[0-9]+$/.test(m0 || '') ? m0 : null; /* 'somevalue' arrives as a genid URI, not a QID: no method is stated */
        const key = t + '|' + pop + '|' + m;
        if (u.seen.has(key)) continue;
        u.seen.add(key);
        u.s.push([t, pop, m]); if (m) methodQ.add(m);
        if (v(b, 'en')) u.n = v(b, 'en'); if (v(b, 'ja')) u.nj = v(b, 'ja');
        const inc = iso(v(b, 'inc')), dis = iso(v(b, 'dis'));
        if (inc && (!u.inc || inc < u.inc)) u.inc = inc;
        if (dis && (!u.dis || dis > u.dis)) u.dis = dis;
        statements++;
      }
      await sleep(1200);
    }
    for (const u of Object.values(units)) { delete u.seen; u.s.sort((a, b) => (a[0] || '').localeCompare(b[0] || '')); }
    console.error(kind + ': ' + Object.keys(units).length + ' units');
  }
  /* method labels, one query */
  const methods = {};
  if (methodQ.size) {
    const rows = await sparql(`SELECT ?m ?en ?ja WHERE { VALUES ?m { ${[...methodQ].map((q) => 'wd:' + q).join(' ')} } OPTIONAL { ?m rdfs:label ?en FILTER(LANG(?en)="en") } OPTIONAL { ?m rdfs:label ?ja FILTER(LANG(?ja)="ja") } }`);
    for (const b of rows) methods[qid(v(b, 'm'))] = { en: v(b, 'en'), ja: v(b, 'ja') };
  }
  return {
    v: 1,
    source: 'Wikidata (CC0 1.0) — P1082 population; qualifiers P585 point in time, P459 determination method; unit items P571 inception / P576 dissolved',
    builtAt: new Date().toISOString().slice(0, 10),
    note: 's = [[date|null, population, methodQid|null], …] sorted by date; t:null is an UNDATED statement and is never given a year. inc/dis bound the unit’s own lifespan.',
    kinds: Object.fromEntries(Object.entries(KINDS).map(([k, K]) => [k, { prop: K.prop, note: K.note, units: Object.keys(out[k]).length }])),
    methods, statements, units: out,
  };
}

if (process.argv.includes('--check')) {
  if (!existsSync(OUT)) { console.error('missing ' + OUT); process.exit(1); }
  try { const j = JSON.parse(gunzipSync(readFileSync(OUT)).toString('utf8')); if (!j.units || !j.units['iso3166-2']) throw new Error('no iso3166-2'); console.log('ok ' + j.statements + ' statements'); }
  catch (e) { console.error('unreadable ' + OUT + ': ' + e.message); process.exit(1); }
} else if (process.argv[1] && process.argv[1].endsWith('build-admin-stats.mjs')) {
  const j = await build();
  writeFileSync(OUT, gzipSync(Buffer.from(JSON.stringify(j)), { level: 9 }));
  console.log('wrote ' + OUT + ' · ' + j.statements + ' statements');
}
