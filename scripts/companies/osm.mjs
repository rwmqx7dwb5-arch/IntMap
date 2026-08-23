/* ============================================================================
 *  IntMap · OpenStreetMap as the SECOND facility source
 * ----------------------------------------------------------------------------
 *  Wikidata records a company's ownership of a building only when somebody has
 *  modelled that building as an item. MEASURED: for TSMC that is three offices
 *  and no fab at all; OSM has TSMC Arizona Fab 21. For Walmart, Wikidata has a
 *  headquarters and OSM has thousands of stores. The two sources are
 *  complementary, and OSM is the one that knows where things physically are.
 *
 *  The link is an EXPLICIT TAG, never a name match: `operator:wikidata`,
 *  `owner:wikidata` or `brand:wikidata` must equal the company's QID. A plant
 *  called "Toyota …" that nobody has linked is NOT claimed as Toyota's — that
 *  would be inference, and docs/COMPANIES.md §1 forbids shipping inference as
 *  fact.
 *
 *  ⚠ AND THE THREE TAGS DO NOT MEAN THE SAME THING. `operator` / `owner` say the
 *  company runs or owns the place. `brand` says only that the place SELLS that
 *  brand — measured: every German "Autohaus …" carrying brand:wikidata=Q53268 is
 *  an independent dealership, several with their own `operator`. Publishing those
 *  as Toyota facilities would have claimed 5,262 Toyota offices that Toyota does
 *  not have. `link` records which tag it was; the build files brand links as
 *  retail presence and never as a corporate site.
 *
 *  ══ TWO THINGS THIS FILE LEARNED THE EXPENSIVE WAY ═══════════════════════════
 *
 *  ⚠ ONE COMPANY PER QUERY, MATCHED EXACTLY. The first version put eight QIDs in
 *  a regex — ["operator:wikidata"~"^(Q1|Q2|…)$"] — because 67 requests sounded
 *  cheaper than 533. A regex cannot use the tag-value index, so every one of
 *  those queries scanned the planet: MEASURED at ~2 minutes each, and a 40-QID
 *  regex answered 500 after 44 s on both instances. The same question asked as
 *  ["operator:wikidata"="Q95"] uses the index and MEASURED 2.1 SECONDS. Eight
 *  times the requests, sixty times less work.
 *
 *  ⚠ AND THE TRANSPORT IS curl, NOT fetch. While measuring the above, Node's
 *  fetch stopped reaching overpass-api.de entirely — "TypeError: fetch failed",
 *  a connect timeout after 11 s — while curl against the same URL, from the same
 *  machine, in the same second, returned 200 in 2.1 s. Overpass was never the
 *  slow part. undici is bypassed here; fetch stays as the fallback so this still
 *  works on a machine with no curl.
 * ==========================================================================*/
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { httpJSON, cacheGet, cachePut, ROOT } from './wd.mjs';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const UA = 'IntMap-company-pipeline/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap; intmapofficial@gmail.com)';

/* The main instance publishes its own limit at /api/status — "Rate limit: 2".
   Three in flight did not return 429; it refused the connection, which reads
   like a network fault. Two is what the server offers, so two is what we take.
   ⚠ Endpoint order is FIXED: the kumi mirror answered 500 to /api/status itself
   while the main instance was healthy, so trying it first would spend 45 s per
   query discovering that. It stays the fallback it was. */
const OVERPASS_CONCURRENCY = 2;

/* OSM tags -> our facility vocabulary (docs/COMPANIES.md §5.1). First match wins. */
const RULES = [
  /* ⚠ RETAIL IS DECIDED FIRST, and `shop` beats every industrial tag on the same
     element. Two measured failures forced this order:
       · a car dealership tagged shop=car standing on landuse=industrial reached
         the industrial catch-all and shipped as a FACTORY;
       · Walmart Supercenter #2026 in Ponce carries power=generator for the SOLAR
         PANELS ON ITS ROOF, and shipped as a POWER PLANT.
     A `shop` tag says what the place IS; the others describe equipment that
     happens to sit on it. */
  [(t) => t.shop || t.landuse === 'retail' || t.amenity === 'fast_food' || t.amenity === 'restaurant'
    || t.amenity === 'cafe' || t.amenity === 'bank' || t.amenity === 'pharmacy' || t.amenity === 'fuel'
    || t.amenity === 'charging_station' || t.amenity === 'car_rental', 'store'],
  [(t) => t.man_made === 'works' || t.industrial === 'factory' || t.building === 'factory', 'factory'],
  [(t) => t.industrial === 'semiconductor' || t.industrial === 'electronics', 'factory'],
  [(t) => t.industrial === 'refinery', 'refinery'],
  [(t) => t.industrial === 'shipyard', 'shipyard'],
  [(t) => t.industrial === 'mine' || t.landuse === 'quarry', 'mine'],
  [(t) => t.power === 'plant' || t.power === 'generator', 'power_plant'],
  [(t) => t.craft === 'brewery' || t.industrial === 'brewery', 'brewery'],
  [(t) => t.telecom === 'data_center' || t.man_made === 'data_center' || t.building === 'data_center'
    || t.industrial === 'data_center' || t.industrial === 'data_centre', 'data_center'],
  [(t) => t.industrial === 'warehouse' || t.building === 'warehouse' || t.landuse === 'warehouse', 'warehouse'],
  [(t) => t.industrial === 'distribution' || t.industrial === 'logistics' || t.landuse === 'logistics', 'distribution_center'],
  [(t) => t.office === 'research' || t.amenity === 'research_institute' || t.building === 'research', 'research'],
  [(t) => t.office === 'company' || t.office === 'it' || t.building === 'office' || t.office, 'office'],
  /* `industrial=<value>` names what the site makes. Bare `landuse=industrial` or
     `industrial=yes` says only "industry happens here" — not evidence of a
     factory, so it yields NO type and the element is not published. */
  [(t) => t.industrial && t.industrial !== 'yes', 'factory'],
  [(t) => t.tourism === 'museum', 'museum'],
];

export function typeFromTags(tags) {
  const t = tags || {};
  for (const [test, name] of RULES) { try { if (test(t)) return name; } catch (_) { /* odd tag shape */ } }
  return null;
}

const nameOf = (t) => (t && (t['name:en'] || t.name || t.brand || t.operator)) || '';

export function query(qid) {
  return '[out:json][timeout:180];\n('
    + '  nwr["operator:wikidata"="' + qid + '"];\n'
    + '  nwr["brand:wikidata"="' + qid + '"];\n'
    + '  nwr["owner:wikidata"="' + qid + '"];\n'
    + ');\nout center tags;';
}

/* ── transport ───────────────────────────────────────────────────────────── */
let _curlOk = null;
function curlPost(url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const args = ['-s', '-S', '--max-time', String(Math.ceil(timeoutMs / 1000)),
      '-X', 'POST', '--data-binary', '@-',
      '-H', 'Content-Type: text/plain', '-H', 'User-Agent: ' + UA,
      '-w', '\n%{http_code}', url];
    let out = '';
    let err = '';
    let p;
    try { p = spawn('curl', args, { windowsHide: true }); }
    catch (e) { reject(e); return; }
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) { reject(new Error('curl exit ' + code + ' ' + err.slice(0, 160))); return; }
      const nl = out.lastIndexOf('\n');
      const status = Number(out.slice(nl + 1).trim());
      const text = out.slice(0, nl);
      if (status !== 200) { reject(new Error('HTTP ' + status + ' ' + text.slice(0, 120))); return; }
      try { resolve(JSON.parse(text)); } catch (_) { reject(new Error('bad JSON from overpass: ' + text.slice(0, 120))); }
    });
    p.stdin.on('error', () => {});
    p.stdin.end(body);
  });
}

async function overpass(body) {
  let lastErr = null;
  for (const ep of ENDPOINTS) {
    if (_curlOk !== false) {
      try { const j = await curlPost(ep, body, 200000); _curlOk = true; return j; }
      catch (e) {
        lastErr = e;
        if (/ENOENT|exit 127/.test(String(e))) _curlOk = false;   /* no curl here — fall through to fetch */
        else continue;
      }
    }
    try {
      return await httpJSON(ep, {
        method: 'POST', body, retries: 2, timeoutMs: 200000,
        headers: { 'Content-Type': 'text/plain' },
      });
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('overpass unavailable');
}

/** One OSM element -> {qid, record}, or null when it is not usable. */
function readElement(el, known) {
  const t = el.tags || {};
  const opQ = t['operator:wikidata'] || t['owner:wikidata'];
  const brQ = t['brand:wikidata'];
  const q = known.has(opQ) ? opQ : (known.has(brQ) ? brQ : null);
  if (!q) return null;
  const link = (q === opQ) ? (t['operator:wikidata'] ? 'operator' : 'owner') : 'brand';
  const lon = el.type === 'node' ? el.lon : (el.center && el.center.lon);
  const lat = el.type === 'node' ? el.lat : (el.center && el.center.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lon === 0 && lat === 0) return null;
  const type = typeFromTags(t);
  if (!type) return null;
  const name = nameOf(t);
  if (!name) return null;
  return {
    q,
    rec: {
      osm: el.type + '/' + el.id,
      link,
      name,
      type,
      lon,
      lat,
      cc: (t['addr:country'] || '').toUpperCase(),
      city: t['addr:city'] || '',
      street: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '),
      opened: /^\d{4}/.test(t.start_date || '') ? String(t.start_date).slice(0, 4) : null,
    },
  };
}

/**
 * Every OSM element explicitly linked to one of these QIDs.
 * Returns Map<qid, Array<record>>; `.failed` is the set of companies whose query
 * never succeeded, so the build can say "not fetched" instead of "no sites".
 */
export async function osmFacilities(qids, opts = {}) {
  const log = opts.log || (() => {});
  const list = [...new Set(qids)].filter(Boolean);
  const out = new Map();
  list.forEach((q) => out.set(q, []));

  const absorb = (j) => {
    for (const el of (j.elements || [])) {
      const r = readElement(el, out);
      if (r) out.get(r.q).push(r.rec);
    }
  };

  /* ⚠ A CIRCUIT BREAKER, because the upstream really does go away. MEASURED: mid-run,
     overpass-api.de stopped answering even /api/status, and with a retry ladder on two endpoints
     each company then costs minutes to fail. 533 of those is a build that never ends — and a build
     that never ends is worse than one that says what it could not get, because nobody can ship it.
     After BREAK_AFTER consecutive live failures the remaining companies are marked failed WITHOUT
     being attempted; they ship as osmPending, and the next run (cache-warm, seconds for everything
     already fetched) picks them up. Any success resets the counter. */
  const BREAK_AFTER = 12;
  /* ⚠ THE CACHE IS KEYED BY THE QUESTION; THE DATA IS KEYED BY THE COMPANY.
     When this file changed from one regex query per eight companies to one exact
     query per company, every cached answer became unreachable — the new key never
     matches the old one — and 300 companies' worth of already-fetched facilities
     sat on disk while the upstream was down. So before asking anything, read every
     response we have ever stored and index its elements by QID. An element carries
     the company it belongs to; which query happened to return it is not part of
     that fact.
     ⚠ It does NOT clear osmPending on its own: a company with no element in an old
     batch may have been in that batch and genuinely have none, or may never have
     been asked. Only its OWN exact query answers that, so asked{} is tracked
     separately below. */
  const harvested = new Set();
  try {
    const dir = join(ROOT, '.cache', 'companies', 'osm');
    let files = [];
    try { files = readdirSync(dir).filter((f) => f.endsWith('.json')); } catch (_) { files = []; }
    for (const f of files) {
      let v = null;
      try { v = JSON.parse(readFileSync(join(dir, f), 'utf8')).v; } catch (_) { continue; }
      if (!v || !Array.isArray(v.elements)) continue;
      for (const el of v.elements) {
        const r = readElement(el, out);
        if (!r) continue;
        out.get(r.q).push(r.rec);
        harvested.add(r.q);
      }
    }
    if (harvested.size) log('  recovered ' + harvested.size + ' companies from responses already on disk');
  } catch (_) { /* the cache is an optimisation, never a requirement */ }

  const asked = new Set();
  const failed = [];
  let next = 0;
  let done = 0;
  let consecutive = 0;
  let broken = false;
  const worker = async () => {
    for (;;) {
      const k = next++;
      if (k >= list.length) return;
      const q = list[k];
      const body = query(q);
      let j = cacheGet('osm', body, 21 * 24 * 3600 * 1000);
      if (j) { asked.add(q); absorb(j); if (++done % 50 === 0) log('  overpass ' + done + '/' + list.length + ' companies'); continue; }
      if (broken) { failed.push(q); continue; }            /* upstream is down — do not ask again */
      try { j = await overpass(body); cachePut('osm', body, j); consecutive = 0; }
      catch (_) {
        failed.push(q); done++;
        if (++consecutive >= BREAK_AFTER && !broken) {
          broken = true;
          log('  ⚠ overpass failed ' + consecutive + ' times in a row — giving up on the rest of this run');
        }
        continue;
      }
      asked.add(q);
      absorb(j);
      if (++done % 50 === 0) log('  overpass ' + done + '/' + list.length + ' companies');
    }
  };
  await Promise.all(Array.from({ length: Math.min(OVERPASS_CONCURRENCY, list.length) }, () => worker()));

  /* ⚠ A DEAD QUERY LOOKS EXACTLY LIKE "THIS COMPANY HAS NO SITES". Measured: one
     run printed "OSM elements: 0" for five real companies because the transport
     was broken and the loop simply continued. Failures get one more try, and
     whatever still fails is REPORTED BY NAME so the build can mark those profiles
     rather than publish an absence it never established. */
  if (failed.length && !broken) {
    log('  overpass: ' + failed.length + ' companies failed — one retry each');
    const stillDead = [];
    for (const q of failed) {
      const body = query(q);
      let j = cacheGet('osm', body, 21 * 24 * 3600 * 1000);
      if (!j) {
        try { j = await overpass(body); cachePut('osm', body, j); }
        catch (_) { stillDead.push(q); continue; }
      }
      absorb(j);
    }
    if (stillDead.length) {
      log('  ⚠ OSM UNAVAILABLE for ' + stillDead.length + ' companies: ' + stillDead.slice(0, 15).join(', '));
      out.failed = new Set(stillDead);
    }
  } else if (failed.length) {
    /* a company whose own query never ran, but whose facilities came out of an
       older stored response, is NOT pending — we have its sites */
    const pending = failed.filter((q) => !asked.has(q) && !harvested.has(q));
    if (pending.length) {
      log('  ⚠ OSM UNAVAILABLE for ' + pending.length + ' companies (upstream down; re-run to fill them in)');
      out.failed = new Set(pending);
    }
  }
  return out;
}

export const OSM_SOURCE = {
  name: 'OpenStreetMap contributors (ODbL)',
  url: 'https://www.openstreetmap.org/copyright',
};
