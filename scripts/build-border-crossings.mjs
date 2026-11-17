#!/usr/bin/env node
/* ============================================================================
 *  IntMap · scripts/build-border-crossings.mjs — WHERE A BORDER CAN BE CROSSED, AND ON WHAT TERMS   (geopolitics-layers)
 * ----------------------------------------------------------------------------
 *  The reader asked for 「国境検問所・開閉状況: 実際に越境できる場所と通過条件」. OpenStreetMap maps border control
 *  posts as `barrier=border_control` (9,582 nodes and ways worldwide, counted 2026-11-17) and states on them what a
 *  reader needs to know before going there:
 *
 *    opening_hours          when it is open (548 «24/7», 102 «closed», and schedules — 1,019 crossings state it)
 *    access:citizenship     who may cross: «international», «all», «local», «interstate» (citizens of the two states
 *                           only), or a list of ISO 3166 codes («RU;KZ», «EU;EEA;CH;interstate»)
 *    foot bicycle motorcar motorcycle motor_vehicle hgv bus goods vehicle horse access
 *                           which ways of travelling are let through
 *    border_control         the kind of control (international, maritime, immigration, customs, local…)
 *    name, name:en, operator, website, description, check_date
 *  Every crossing is written with exactly the tags it carries; a tag it does not carry is ABSENT, which the card says
 *  as «not stated in OpenStreetMap» — never «allowed» or «24 hours».
 *
 *  ⚠ «OPEN NOW» NEEDS THE CROSSING'S LOCAL TIME. opening_hours is written in local time, and 1,019 schedules on
 *  borders that span time zones (Russia–Kazakhstan, the US–Mexico border, China's western borders) cannot be read in
 *  the reader's zone. Each crossing is therefore given the IANA zone that contains it — from Evan Siroky's
 *  timezone-boundary-builder (ODbL, built from OpenStreetMap; release «2026f», the «with oceans, now» file) — and
 *  js/opening-hours.js evaluates the schedule in that zone at the clock's instant. A crossing exactly on a zone line
 *  takes the zone whose polygon contains it first in the file's order; the card names the zone it used.
 *
 *  ⚠ NOT LIVE. No source with terms IntMap can use publishes the live state of the world's crossings. The U.S. CBP
 *  border wait-time feed (bwt.cbp.gov) states «Open/Closed» for U.S. land ports, but it answers no cross-origin
 *  request (no Access-Control-Allow-Origin, measured 2026-11-17) and carries no coordinates, so a reader's browser
 *  cannot read it and it could not be placed on the map without a second, name-matched table. What this layer states is
 *  what OpenStreetMap states: the published schedule, evaluated — and the card says so.
 *
 *  OUTPUT — data/border-crossings.json: { v, …provenance, tz:{publisher, release, url, licence}, count,
 *    crossings:[{ x, y, i, n?, en?, tz?, oh?, cz?, bc?, m?:{foot:'yes'…}, op?, w?, d?, cd? }] }
 *
 *  USAGE
 *    node scripts/build-border-crossings.mjs                         Overpass + the time-zone release, derive, write
 *    node scripts/build-border-crossings.mjs --osm <json> --tz <geojson>   the same from local copies
 *  ⚠ NOT IN `npm test` (it needs the network). tests/geopolitics-layers-checks.test.mjs validates the committed file.
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { OPENSTREETMAP } from './lib/upstream-cadence.mjs';
import { fetchChecked, USER_AGENT } from './lib/upstream.mjs';
import { agreeOrRefuse } from './lib/gov-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = 'data/border-crossings.json';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const QUERY = '[out:json][timeout:250];(node["barrier"="border_control"];way["barrier"="border_control"];);out center tags;';
const TZ = {
  publisher: 'Evan Siroky — timezone-boundary-builder (built from OpenStreetMap)',
  release: '2026f',
  url: 'https://github.com/evansiroky/timezone-boundary-builder/releases/tag/2026f',
  file: 'https://github.com/evansiroky/timezone-boundary-builder/releases/download/2026f/timezones-with-oceans-now.geojson.zip',
  licence: 'ODbL 1.0',
  licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
};

/* ⚠ 出自は値である（js/data-governance.js の read() と npm run check:datagov が読む）。上流が述べることだけを書く。 */
export const GOVERNANCE = {
  'data/border-crossings.json': {
    upstreams: [
      { publisher: 'OpenStreetMap contributors', url: 'https://overpass-api.de/api/interpreter', licence: 'ODbL', licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: true, creditRequired: true,
        fields: 'barrier=border_control nodes and ways — name, name:en, opening_hours, access:citizenship, the transport-mode access tags, border_control, operator, website, description, check_date',
        paidBy: 'Border crossings — OpenStreetMap (barrier=border_control, Overpass API)' },
      { publisher: 'Evan Siroky — timezone-boundary-builder (built from OpenStreetMap)', url: 'https://github.com/evansiroky/timezone-boundary-builder/releases/tag/2026f', licence: 'ODbL', licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: true, creditRequired: true,
        fields: 'the IANA zone (tzid) of the polygon that contains each crossing — release 2026f, timezones-with-oceans-now',
        paidBy: 'Time zone boundaries — timezone-boundary-builder (ODbL, built from OpenStreetMap)' },
    ],
    /* the file as a whole: both upstreams are ODbL and both make credit a condition */
    publisher: 'OpenStreetMap contributors · Evan Siroky (timezone-boundary-builder)',
    url: 'https://www.openstreetmap.org/copyright',
    licence: 'ODbL 1.0',
    licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attribution: true,
    paidBy: 'Border crossings — OpenStreetMap (barrier=border_control, Overpass API)',
    priority: { rank: ['OpenStreetMap', 'timezone-boundary-builder'],
      over: 'OpenStreetMap states every crossing and every tag; the time-zone record only names the zone a crossing lies in, and states nothing about the crossing' },
    ...OPENSTREETMAP,
    /* ⚠ LITERALS THE GATE CAN READ WITHOUT RUNNING THIS FILE; main() refuses to write a bundle that disagrees (scripts/lib/gov-stamp.mjs) */
    retrievedAt: '2026-11-17',
    generatedAt: '2026-11-17',
    asOf: '2026-11-17',
    /* measured on crossings[]: key i (the OpenStreetMap id); x, y in degrees; every one has a zone */
    quality: { rows: 9582, missing: { x: 0, y: 0, i: 0, tz: 0 }, outOfRange: { x: 0, y: 0 }, duplicates: 0 },
    schema: 'scripts/build-border-crossings.mjs (crossings: x y i n en tz oh cz bc m op w d cd) — read by js/geopolitics-core.js and js/opening-hours.js; tests/geopolitics-layers-checks.test.mjs',
    builtBy: 'scripts/build-border-crossings.mjs',
  },
};

const MODES = ['access', 'foot', 'bicycle', 'horse', 'motorcycle', 'motorcar', 'motor_vehicle', 'vehicle', 'bus', 'hgv', 'goods'];
const cut = (s, n) => (s == null ? undefined : String(s).slice(0, n) || undefined);

/** one crossing as the bundle carries it — only the tags OpenStreetMap states */
export function crossingOf(el, zoneAt) {
  const t = el.tags || {};
  const lon = el.lon != null ? el.lon : el.center && el.center.lon;
  const lat = el.lat != null ? el.lat : el.center && el.center.lat;
  if (lon == null || lat == null) return null;
  const m = {};
  for (const k of MODES) if (t[k]) m[k] = t[k];
  const o = {
    x: Math.round(lon * 1e5) / 1e5, y: Math.round(lat * 1e5) / 1e5, i: el.type[0] + el.id,
    n: cut(t.name, 120), en: t['name:en'] && t['name:en'] !== t.name ? cut(t['name:en'], 120) : undefined,
    tz: zoneAt ? zoneAt(lon, lat) || undefined : undefined,
    oh: cut(t.opening_hours, 400), cz: cut(t['access:citizenship'], 80), bc: cut(t.border_control, 40),
    m: Object.keys(m).length ? m : undefined, op: cut(t.operator, 120), w: cut(t.website || t['contact:website'], 200),
    d: cut(t.description || t.note, 300), cd: cut(t.check_date || t['check_date:opening_hours'], 20),
  };
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/** the zone reader: bbox prefilter, then point-in-polygon, in the file's order */
export function zoneIndex(fc) {
  const zones = fc.features.map((f) => {
    let w = 180, s = 90, e = -180, n = -90;
    const walk = (c) => { if (typeof c[0] === 'number') { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; } else c.forEach(walk); };
    walk(f.geometry.coordinates);
    return { f, tz: f.properties.tzid, b: [w, s, e, n] };
  });
  return (lon, lat) => {
    for (const z of zones) {
      if (lon < z.b[0] || lon > z.b[2] || lat < z.b[1] || lat > z.b[3]) continue;
      if (booleanPointInPolygon([lon, lat], z.f)) return z.tz;
    }
    return null;
  };
}

async function main() {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const osm = arg('--osm') ? JSON.parse(readFileSync(arg('--osm'), 'utf8'))
    : await fetchChecked(OVERPASS, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: 'data=' + encodeURIComponent(QUERY) },
      { as: 'json', attempts: 3, timeoutMs: 300000, validate: (j) => (j && Array.isArray(j.elements) && j.elements.length > 5000 ? null : 'too few border controls') });
  let tzPath = arg('--tz'), tmp = null;
  if (!tzPath) {
    tmp = mkdtempSync(join(tmpdir(), 'intmap-tz-'));
    const zip = await fetchChecked(TZ.file, { headers: { 'user-agent': USER_AGENT } }, { as: 'buffer', attempts: 3, timeoutMs: 600000 });
    writeFileSync(join(tmp, 'tz.zip'), zip);
    /* `unzip` (Info-ZIP) is on the PATH of Git for Windows and of the CI image; the release is one GeoJSON inside one zip */
    execFileSync('unzip', ['-o', '-q', join(tmp, 'tz.zip'), '-d', tmp]);
    tzPath = join(tmp, 'combined-with-oceans-now.json');
  }
  const zoneAt = zoneIndex(JSON.parse(readFileSync(tzPath, 'utf8')));
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  const crossings = osm.elements.map((el) => crossingOf(el, zoneAt)).filter(Boolean)
    .sort((a, b) => (a.i < b.i ? -1 : a.i > b.i ? 1 : 0));
  const noZone = crossings.filter((c) => !c.tz).length;
  const today = new Date().toISOString().slice(0, 10);
  const g = agreeOrRefuse(GOVERNANCE[OUT], crossings, { fields: { x: { min: -180, max: 180 }, y: { min: -90, max: 90 }, i: {}, tz: {} }, key: ['i'] }, today);
  const base = (osm.osm3s && String(osm.osm3s.timestamp_osm_base || '').slice(0, 10)) || today;
  if (base !== g.asOf) throw new Error(g.builtBy + ': restate GOVERNANCE — the OpenStreetMap edition is ' + base + ', declared ' + g.asOf);
  const out = {
    v: 1, ...g, query: QUERY,
    tz: { publisher: TZ.publisher, release: TZ.release, url: TZ.url, licence: TZ.licence, licenceUrl: TZ.licenceUrl },
    count: crossings.length, crossings,
  };
  writeFileSync(join(ROOT, OUT), JSON.stringify(out));
  console.log('wrote', OUT, JSON.stringify(out).length, 'bytes ·', crossings.length, 'crossings ·', crossings.filter((c) => c.oh).length, 'with opening_hours ·', noZone, 'without a zone');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
