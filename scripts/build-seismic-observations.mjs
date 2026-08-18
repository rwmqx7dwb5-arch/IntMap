#!/usr/bin/env node
/* ============================================================================
 *  IntMap · WHAT THE GROUND ACTUALLY DID — THE VALIDATION SET  (#R263)
 * ----------------------------------------------------------------------------
 *  「東北2011、スマトラ2004、チリ1960、アラスカ1964、阪神1995など世界各地の観測震度・PGA・PGVと
 *    自動比較するvalidationを作り、平均誤差・bias・±0.5震度以内率などを数値化する。」
 *
 *  A validation set is only worth having if the observations in it are OBSERVATIONS. Numbers typed in
 *  from memory — «Sendai was 6強» — are the one thing this project's standing instructions forbid
 *  most explicitly, and they are also useless: they cannot be re-derived, they carry no station
 *  coordinate, and half of them turn out to be the intensity somebody else's model predicted.
 *
 *  So the set is BUILT, from the USGS ShakeMap station lists — the recorded peak ground motion at
 *  real instruments, with real coordinates, distributed by the agency that collected them:
 *
 *      https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=<id>&format=geojson
 *          → products.shakemap[0].contents['download/stationlist.json']
 *
 *  ⚠ ONLY `seismic` CHANNELS ARE KEPT, never `macroseismic`. A DYFI entry is somebody's questionnaire
 *  converted to an intensity; a seismic entry is an accelerometer's PGA in %g and PGV in cm/s. The
 *  model predicts ground MOTION, so it is scored against ground motion.
 *  ⚠ AND THE INTENSITY IN THE FILE IS NOT AN INDEPENDENT OBSERVATION. ShakeMap derives a station's
 *  intensity from that station's PGA/PGV through a GMICE — for many stations the SAME Worden et al.
 *  (2012) relation js/seismic.js uses — so scoring intensity against it partly scores a conversion
 *  against itself. It is carried because 「観測震度」 was asked for, and the harness reports it
 *  SEPARATELY from PGA and PGV and says so in its output. PGA and PGV are the real test.
 *
 *  ⚠ WHY SOME OF THE NAMED EARTHQUAKES CANNOT BE IN IT. Chile 1960 and Alaska 1964 predate strong-
 *  motion networks: their ShakeMap station lists are macroseismic reconstructions, not recordings.
 *  The build does not quietly drop them — it records them in `excluded` with the reason, because
 *  «the great earthquakes are missing» is a fact about the validation set that its reader must have.
 *
 *      node scripts/build-seismic-observations.mjs [--per-event 120] [--cache <dir>]
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PER = Number(arg('per-event', 120));
const CACHE = arg('cache', path.join(ROOT, '.cache', 'shakemap'));
const API = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

/* The events, named by WHAT THEY ARE rather than by an id — ids are resolved from the catalogue so a
   typo cannot silently fetch a different earthquake. The list spans every regime the model
   classifies and every inhabited continent, which is the point: a global model validated on one
   subduction zone has been validated on nothing. */
const EVENTS = [
  { key: 'tohoku2011', name: 'Tōhoku, Japan', day: '2011-03-11', minMag: 8.9, box: [140, 35, 145, 40] },
  { key: 'sumatra2004', name: 'Sumatra–Andaman', day: '2004-12-26', minMag: 8.9, box: [92, 0, 100, 8] },
  { key: 'chile1960', name: 'Valdivia, Chile', day: '1960-05-22', minMag: 9.0, box: [-76, -42, -70, -35] },
  { key: 'alaska1964', name: 'Prince William Sound, Alaska', day: '1964-03-28', minMag: 9.0, box: [-150, 58, -144, 63] },
  { key: 'kobe1995', name: 'Kobe (Hyōgo-ken Nanbu), Japan', day: '1995-01-16', minMag: 6.7, box: [134, 33, 136, 36] },
  { key: 'maule2010', name: 'Maule, Chile', day: '2010-02-27', minMag: 8.5, box: [-75, -38, -70, -33] },
  { key: 'northridge1994', name: 'Northridge, California', day: '1994-01-17', minMag: 6.5, box: [-120, 33, -117, 35] },
  { key: 'michoacan1985', name: 'Michoacán, Mexico', day: '1985-09-19', minMag: 7.9, box: [-104, 17, -101, 20] },
  { key: 'chichi1999', name: 'Chi-Chi, Taiwan', day: '1999-09-20', minMag: 7.5, box: [120, 23, 122, 25] },
  { key: 'christchurch2011', name: 'Christchurch, New Zealand', day: '2011-02-21', minMag: 6.0, box: [172, -44, 173, -43] },
  { key: 'laquila2009', name: "L'Aquila, Italy", day: '2009-04-06', minMag: 6.1, box: [12, 41, 15, 43] },
  { key: 'nepal2015', name: 'Gorkha, Nepal', day: '2015-04-25', minMag: 7.7, box: [84, 27, 87, 29] },
  { key: 'turkey2023', name: 'Kahramanmaraş, Türkiye', day: '2023-02-06', minMag: 7.7, box: [36, 36, 39, 39] },
  { key: 'iquique2014', name: 'Iquique, Chile', day: '2014-04-01', minMag: 8.1, box: [-72, -21, -69, -18] },
  { key: 'tohokuAfter2011', name: 'Miyagi-oki aftershock, Japan', day: '2011-04-07', minMag: 7.0, box: [140, 37, 144, 40] },
  { key: 'nisqually2001', name: 'Nisqually, Washington (in-slab)', day: '2001-02-28', minMag: 6.7, box: [-124, 46, -122, 48] },
  { key: 'hokkaido2018', name: 'Eastern Iburi, Hokkaidō', day: '2018-09-05', minMag: 6.5, box: [141, 42, 143, 43.5] },
  { key: 'noto2024', name: 'Noto Peninsula, Japan', day: '2024-01-01', minMag: 7.4, box: [136, 36, 138, 38] }
];

async function cached(url, name) {
  fs.mkdirSync(CACHE, { recursive: true });
  const dst = path.join(CACHE, name);
  if (fs.existsSync(dst) && fs.statSync(dst).size > 40) return fs.readFileSync(dst, 'utf8');
  const r = await fetch(url, { headers: { 'User-Agent': 'IntMap/build-seismic-observations (+https://github.com/rwmqx7dwb5-arch/IntMap)' } });
  if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
  const t = await r.text();
  fs.writeFileSync(dst, t);
  return t;
}

const q0mag = (d) => d.properties.mag;
const next = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

const out = [], excluded = [];
for (const e of EVENTS) {
  let ev = null;
  try {
    const q = API + '?format=geojson&starttime=' + e.day + '&endtime=' + next(e.day, 2)
      + '&minmagnitude=' + e.minMag
      + '&minlongitude=' + e.box[0] + '&minlatitude=' + e.box[1]
      + '&maxlongitude=' + e.box[2] + '&maxlatitude=' + e.box[3];
    const cat = JSON.parse(await cached(q, e.key + '-cat.json'));
    const feats = (cat.features || []).sort((a, b) => b.properties.mag - a.properties.mag);
    ev = feats[0] || null;
  } catch (err) { excluded.push({ key: e.key, name: e.name, reason: 'catalogue query failed: ' + err.message }); continue; }
  if (!ev) { excluded.push({ key: e.key, name: e.name, reason: 'no catalogue entry matched' }); continue; }

  let detail;
  try { detail = JSON.parse(await cached(API + '?eventid=' + ev.id + '&format=geojson', e.key + '-ev.json')); }
  catch (err) { excluded.push({ key: e.key, name: e.name, id: ev.id, reason: 'detail query failed' }); continue; }
  const sm = (detail.properties.products || {}).shakemap;
  if (!sm || !sm[0].contents['download/stationlist.json']) {
    excluded.push({ key: e.key, name: e.name, id: ev.id, reason: 'no ShakeMap station list published' });
    continue;
  }
  let list;
  try { list = JSON.parse(await cached(sm[0].contents['download/stationlist.json'].url, e.key + '-stations.json')); }
  catch (err) { excluded.push({ key: e.key, name: e.name, id: ev.id, reason: 'station list fetch failed' }); continue; }

  const q = detail.properties;
  const [elng, elat, edep] = detail.geometry.coordinates;
  const feats = list.features || [];
  const rows = [];
  let macro = 0;
  for (const f of feats) {
    const p = f.properties || {};
    if (p.station_type !== 'seismic') { macro++; continue; }
    const c = f.geometry && f.geometry.coordinates; if (!c) continue;
    let pga = null, pgv = null;
    for (const ch of (p.channels || [])) for (const am of (ch.amplitudes || [])) {
      const v = +am.value;
      if (!isFinite(v) || v <= 0) continue;
      if (am.name === 'pga' && (pga == null || v > pga)) pga = v;      /* %g, the larger horizontal */
      if (am.name === 'pgv' && (pgv == null || v > pgv)) pgv = v;      /* cm/s */
    }
    if (pga == null && pgv == null) continue;
    rows.push({ lng: +(+c[0]).toFixed(4), lat: +(+c[1]).toFixed(4),
      code: String(p.code || p.name || '').slice(0, 24),
      pgaPctG: pga, pgvCms: pgv, mmi: (+p.intensity > 0) ? +p.intensity : null });
  }
  /* keep a spread over DISTANCE rather than the first N, or a dense urban network decides the score */
  const D = Math.PI / 180;
  for (const r of rows) {
    const dla = (r.lat - elat) * D / 2, dlo = (r.lng - elng) * D / 2;
    const h = Math.sin(dla) ** 2 + Math.cos(elat * D) * Math.cos(r.lat * D) * Math.sin(dlo) ** 2;
    r.repiKm = +(2 * Math.asin(Math.min(1, Math.sqrt(h))) * 6371).toFixed(1);
  }
  rows.sort((a, b) => a.repiKm - b.repiKm);
  /* ⚠ AN EVENT WITH NO INSTRUMENT IS NOT AN EVENT WITH NO ERROR. Chile 1960, Alaska 1964 and
     Sumatra 2004 all publish a ShakeMap station list and all three are ENTIRELY macroseismic —
     0 seismic channels against 21, 207 and 233 questionnaire entries. Keeping them as events with
     an empty station array would let the harness report «18 events validated» while three of them
     contributed nothing, so they are moved to `excluded` with the count that disqualified them. */
  if (!rows.length) {
    excluded.push({ key: e.key, name: e.name, id: ev.id, mw: q0mag(detail),
      reason: 'ShakeMap publishes ' + macro + ' macroseismic entries and no instrumental recordings — '
        + 'the event predates a strong-motion network in this region' });
    continue;
  }
  const keep = rows.length <= PER ? rows : Array.from({ length: PER }, (_, i) => rows[Math.floor(i * rows.length / PER)]);

  out.push({
    key: e.key, name: e.name, id: ev.id,
    time: new Date(q.time).toISOString(),
    mw: q.mag, magType: q.magType,
    lng: +(+elng).toFixed(4), lat: +(+elat).toFixed(4), depthKm: +(+edep).toFixed(1),
    stationsPublished: feats.length, seismicStations: rows.length, macroseismicSkipped: macro,
    stations: keep
  });
  process.stdout.write('  ' + e.key.padEnd(18) + ' M' + q.mag + '  ' + rows.length
    + ' seismic stations (' + macro + ' macroseismic skipped) -> keeping ' + keep.length + '\n');
}

for (const x of excluded) process.stdout.write('  ! ' + x.key.padEnd(18) + ' ' + x.reason + '\n');

const doc = {
  source: 'USGS ShakeMap station lists (download/stationlist.json), via the USGS FDSN event web service',
  api: API,
  licence: 'U.S. Geological Survey — public domain (https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits)',
  note: 'seismic (instrumental) channels only; macroseismic/DYFI entries are excluded. pgaPctG is percent g, pgvCms is cm/s, both the larger horizontal component as ShakeMap publishes them. `mmi` is ShakeMap\'s own station intensity and is NOT independent of pga/pgv — see the header of scripts/build-seismic-observations.mjs.',
  perEventCap: PER,
  events: out.length, excluded,
  totalStations: out.reduce((a, b) => a + b.stations.length, 0),
  built: new Date().toISOString(),
  data: out
};
fs.mkdirSync(path.join(ROOT, 'tests', 'fixtures'), { recursive: true });
const dst = path.join(ROOT, 'tests', 'fixtures', 'seismic-observations.json');
fs.writeFileSync(dst, JSON.stringify(doc, null, 1) + '\n');
process.stdout.write('tests/fixtures/seismic-observations.json  ' + (fs.statSync(dst).size / 1024).toFixed(0)
  + ' kB · ' + out.length + ' events · ' + doc.totalStations + ' stations · ' + excluded.length + ' excluded\n');
