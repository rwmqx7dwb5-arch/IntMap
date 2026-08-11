#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUILD THE OCEAN-CURRENT LAYER — data/ocean-currents.json   (#R208)
 * ----------------------------------------------------------------------------
 *  「海流レイヤー（矢印・寒暖流を青赤・名前つき）」
 *
 *  ── ⚠ WHY THIS IS NOT THE DATASET THAT WAS ASKED FOR ────────────────────────────────────────
 *  #R207 stopped on licence: the "named major ocean currents" item that was pointed at is Maps.com
 *  material, *free for personal and educational use only*, which a public site may not carry. The
 *  Data Basin copy IS CC BY 3.0 and was approved — and then its API answered
 *  `allow_anonymous_download: false`. Downloading it needs an account, and creating accounts is not
 *  something this build may do. So neither of those two files is here.
 *
 *  What is here instead is the same claim built from a source that is unencumbered and, more to the
 *  point, MEASURED: the paths are traced through a real surface-velocity field rather than copied
 *  off a drawing. That is a better provenance for a map that says 「実測」 everywhere else, and it
 *  is checkable — the Gulf Stream is where the water goes, not where an atlas drew it.
 *
 *  ── SOURCES ─────────────────────────────────────────────────────────────────────────────────
 *  · NASA/JPL OSCAR (Ocean Surface Current Analysis Real-time), 1/3° L4 global, served by NOAA
 *    CoastWatch ERDDAP as `jplOscar`. U.S. Government work — public domain. Several 5-day composites
 *    are averaged, because a major current is a PERSISTENT feature and a single composite carries
 *    eddies and weather that are not the current.
 *  · The NAMES and one seed point each. A name is a fact about the world and cannot be derived from
 *    a velocity field; the seed is the published mid-latitude/longitude of the current's core, and
 *    it is used only to say WHERE TO START INTEGRATING. ⚠ THE GEOMETRY IS NOT COPIED FROM ANYTHING:
 *    every vertex comes from the field.
 *
 *  ── WARM OR COLD IS DERIVED, NOT ASSERTED ───────────────────────────────────────────────────
 *  The oceanographic definition is about where the water comes FROM: a current carrying water toward
 *  the pole is warm relative to the sea it flows through, and one carrying water toward the equator
 *  is cold. ⚠ THAT IS THE POLEWARD COMPONENT OF THE FLOW, NOT THE ENDPOINTS OF THE TRACE. The first
 *  version compared |latitude| at the two ends and got the Kuroshio ZONAL and the North Atlantic
 *  Drift COLD — because a trace runs BOTH WAYS from its seed, so its endpoints are roughly symmetric
 *  and their difference says nothing. What the definition is actually about is sign(lat)·v averaged
 *  along the path: positive is water moving toward its own pole (warm), negative toward the equator
 *  (cold), and near zero is genuinely zonal (the Antarctic Circumpolar, the equatorial currents),
 *  which is correct rather than a failure and is drawn in grey.
 *
 *      node scripts/build-ocean-currents.mjs
 * ==========================================================================*/
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'ocean-currents.json');
const CACHE = join(ROOT, 'node_modules', '.cache', 'intmap-currents');
const UA = 'IntMap/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap) ocean-current-build';
const BASE = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplOscar';

/* The composites to average. Spread across the year so no single season dominates, and taken from
   the end of the served record so they are all from the same era. */
const EPOCHS = 8;
const STRIDE = 3;                       /* 3 × 1/3° = one sample per degree */

/* ── the named currents: a name, a seed on its core, and nothing else ────────────────────────
   Seeds are the published centre of each current's core. They decide where the trace STARTS; the
   trace itself follows the measured field, so a seed that is slightly off simply starts a little
   further along the same stream. */
/* ⚠ (#R219) FIVE NAMES PER ROW, not two — standing rule 3. The row is
   [en, ja, de, ru, es, lng, lat]. */
const SEEDS = [
  ['Gulf Stream', 'メキシコ湾流', 'Golfstrom', 'Гольфстрим', 'Corriente del Golfo', -75.0, 35.0],
  ['North Atlantic Drift', '北大西洋海流', 'Nordatlantikstrom', 'Североатлантическое течение', 'Corriente del Atlántico Norte', -20.0, 53.0],
  ['Canary Current', 'カナリア海流', 'Kanarenstrom', 'Канарское течение', 'Corriente de Canarias', -20.0, 25.0],
  ['North Equatorial Current (Atlantic)', '北赤道海流（大西洋）', 'Nordäquatorialstrom (Atlantik)', 'Северное пассатное течение (Атлантика)', 'Corriente Ecuatorial del Norte (Atlántico)', -40.0, 10.0],
  ['South Equatorial Current (Atlantic)', '南赤道海流（大西洋）', 'Südäquatorialstrom (Atlantik)', 'Южное пассатное течение (Атлантика)', 'Corriente Ecuatorial del Sur (Atlántico)', -25.0, -5.0],
  ['Brazil Current', 'ブラジル海流', 'Brasilstrom', 'Бразильское течение', 'Corriente de Brasil', -46.0, -25.0],
  ['Benguela Current', 'ベンゲラ海流', 'Benguelastrom', 'Бенгельское течение', 'Corriente de Benguela', 12.0, -28.0],
  ['Labrador Current', 'ラブラドル海流', 'Labradorstrom', 'Лабрадорское течение', 'Corriente del Labrador', -52.0, 55.0],
  ['East Greenland Current', '東グリーンランド海流', 'Ostgrönlandstrom', 'Восточно-Гренландское течение', 'Corriente de Groenlandia Oriental', -30.0, 67.0],
  ['Kuroshio', '黒潮', 'Kuroshio', 'Куросио', 'Corriente de Kuroshio', 135.0, 32.0],
  ['Kuroshio Extension', '黒潮続流', 'Kuroshio-Ausläufer', 'Продолжение Куросио', 'Extensión de Kuroshio', 150.0, 35.0],
  ['Oyashio', '親潮', 'Oyashio', 'Оясио', 'Corriente de Oyashio', 150.0, 45.0],
  ['California Current', 'カリフォルニア海流', 'Kalifornienstrom', 'Калифорнийское течение', 'Corriente de California', -128.0, 38.0],
  ['North Pacific Current', '北太平洋海流', 'Nordpazifikstrom', 'Северо-Тихоокеанское течение', 'Corriente del Pacífico Norte', -170.0, 42.0],
  ['North Equatorial Current (Pacific)', '北赤道海流（太平洋）', 'Nordäquatorialstrom (Pazifik)', 'Северное пассатное течение (Тихий океан)', 'Corriente Ecuatorial del Norte (Pacífico)', -160.0, 12.0],
  ['South Equatorial Current (Pacific)', '南赤道海流（太平洋）', 'Südäquatorialstrom (Pazifik)', 'Южное пассатное течение (Тихий океан)', 'Corriente Ecuatorial del Sur (Pacífico)', -150.0, -5.0],
  ['Equatorial Counter Current', '赤道反流', 'Äquatorialer Gegenstrom', 'Экваториальное противотечение', 'Contracorriente Ecuatorial', -170.0, 6.0],
  ['Peru (Humboldt) Current', 'ペルー海流（フンボルト海流）', 'Humboldtstrom (Perustrom)', 'Перуанское течение (Гумбольдта)', 'Corriente de Humboldt (del Perú)', -80.0, -20.0],
  ['East Australian Current', '東オーストラリア海流', 'Ostaustralstrom', 'Восточно-Австралийское течение', 'Corriente de Australia Oriental', 154.0, -30.0],
  ['Agulhas Current', 'アガラス海流', 'Agulhasstrom', 'Течение Агульяс', 'Corriente de Agulhas', 32.0, -32.0],
  ['Somali Current', 'ソマリ海流', 'Somalistrom', 'Сомалийское течение', 'Corriente de Somalia', 52.0, 8.0],
  ['South Equatorial Current (Indian)', '南赤道海流（インド洋）', 'Südäquatorialstrom (Indik)', 'Южное пассатное течение (Индийский океан)', 'Corriente Ecuatorial del Sur (Índico)', 70.0, -12.0],
  ['West Australian Current', '西オーストラリア海流', 'Westaustralstrom', 'Западно-Австралийское течение', 'Corriente de Australia Occidental', 110.0, -31.0],
  ['Antarctic Circumpolar Current (Atlantic)', '南極周極流（大西洋区）', 'Antarktischer Zirkumpolarstrom (Atlantik)', 'Антарктическое циркумполярное течение (Атлантика)', 'Corriente Circumpolar Antártica (Atlántico)', -20.0, -52.0],
  ['Antarctic Circumpolar Current (Indian)', '南極周極流（インド洋区）', 'Antarktischer Zirkumpolarstrom (Indik)', 'Антарктическое циркумполярное течение (Индийский океан)', 'Corriente Circumpolar Antártica (Índico)', 80.0, -52.0],
  ['Antarctic Circumpolar Current (Pacific)', '南極周極流（太平洋区）', 'Antarktischer Zirkumpolarstrom (Pazifik)', 'Антарктическое циркумполярное течение (Тихий океан)', 'Corriente Circumpolar Antártica (Pacífico)', -160.0, -58.0],
];

async function grid(tSel) {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const p = join(CACHE, 'oscar-' + tSel.replace(/[^a-z0-9-]/gi,'') + '.csv');
  if (existsSync(p)) return readFileSync(p, 'utf8');
  /* ⚠ ERDDAP: the TIME axis is selected by INDEX (`last`, `last-8`), the others by VALUE — a `(-1)` is a coordinate, not an index, and answers 404. */
  const sel = `[${tSel}][(15.0)][(80):${STRIDE}:(-80)][(20):${STRIDE}:(419)]`;
  const url = `${BASE}.csv?u${sel},v${sel}`;
  process.stdout.write(`  epoch ${tSel} … `);
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('ERDDAP HTTP ' + r.status);
  const t = await r.text();
  writeFileSync(p, t);
  console.log((t.length / 1e6).toFixed(1) + ' MB');
  return t;
}

/* ── the mean field, on a 1° grid ─────────────────────────────────────────────────────────── */
function accumulate(csv, acc) {
  const lines = csv.split('\n');
  for (let i = 2; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length < 6) continue;
    const lat = +c[2], lon = +c[3], u = parseFloat(c[4]), v = parseFloat(c[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!Number.isFinite(u) || !Number.isFinite(v)) continue;      /* NaN = land, and land stays land */
    const key = Math.round(lat) + '/' + Math.round(((lon + 180) % 360 + 360) % 360 - 180);
    let a = acc.get(key);
    if (!a) { a = { lat: Math.round(lat), lng: Math.round(((lon + 180) % 360 + 360) % 360 - 180), u: 0, v: 0, n: 0 }; acc.set(key, a); }
    a.u += u; a.v += v; a.n++;
  }
}

function sampler(mean) {
  const at = (lng, lat) => {
    const la = Math.round(lat), lo = Math.round(((lng + 180) % 360 + 360) % 360 - 180);
    return mean.get(la + '/' + lo) || null;
  };
  /* bilinear over the four surrounding cells, skipping any that is land — so a trace beside a coast
     follows the water instead of being dragged to zero by the shore. */
  return (lng, lat) => {
    let su = 0, sv = 0, sw = 0;
    for (const dla of [0, 1]) for (const dlo of [0, 1]) {
      const la = Math.floor(lat) + dla, lo = Math.floor(lng) + dlo;
      const c = at(lo, la); if (!c) continue;
      const w = (1 - Math.abs(la - lat)) * (1 - Math.abs(lo - lng));
      if (w <= 0) continue;
      su += c.u * w; sv += c.v * w; sw += w;
    }
    return sw > 0.15 ? { u: su / sw, v: sv / sw } : null;
  };
}

/* ⚠ A SEED IS 'THE CURRENT IS AROUND HERE', NOT A VERTEX. Three of the published core positions land
   on a cell the 1° mean calls land, or in a lull beside the coast, and the trace stopped at one point.
   Rather than nudge the coordinates by hand until they work — which would be fitting the data to the
   seeds — the seed is SNAPPED to the strongest flow within a few degrees. The name still says which
   current it is; the field still says where it goes. */
function snap(sample, lng0, lat0, maxDeg = 5) {
  let best = null;
  for (let d = 0; d <= maxDeg; d += 1) {
    for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (d && Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const s = sample(lng0 + dx, lat0 + dy); if (!s) continue;
      const sp = Math.hypot(s.u, s.v); if (sp < 0.06) continue;
      if (!best || sp > best.sp) best = { lng: lng0 + dx, lat: lat0 + dy, sp };
    }
    if (best) return best;                       /* the nearest ring that has a current wins */
  }
  return null;
}

/* ── trace one current through the mean field ─────────────────────────────────────────────── */
function trace(sample, lng0, lat0) {
  const STEP_KM = 60, MAX = 90;
  const walk = (dir) => {
    const pts = []; let lng = lng0, lat = lat0;
    for (let i = 0; i < MAX; i++) {
      const s = sample(lng, lat); if (!s) break;
      const sp = Math.hypot(s.u, s.v);
      if (sp < 0.04) break;                       /* below 4 cm/s it is not a current any more */
      /* RK2: step to the midpoint, re-sample, then take the whole step with that velocity */
      const kmPerDegLat = 110.574, kmPerDegLng = 111.320 * Math.cos(lat * Math.PI / 180);
      const h = (STEP_KM / 2) * dir;
      const mlng = lng + (s.u / sp) * h / Math.max(1e-6, kmPerDegLng);
      const mlat = lat + (s.v / sp) * h / kmPerDegLat;
      const m = sample(mlng, mlat); if (!m) break;
      const msp = Math.hypot(m.u, m.v); if (msp < 0.04) break;
      const H = STEP_KM * dir;
      lng += (m.u / msp) * H / Math.max(1e-6, kmPerDegLng);
      lat += (m.v / msp) * H / kmPerDegLat;
      if (lat > 82 || lat < -82) break;
      lng = ((lng + 180) % 360 + 360) % 360 - 180;
      if (pts.length && Math.abs(lng - pts[pts.length - 1][0]) > 180) break;   /* do not draw across the seam */
      pts.push([+lng.toFixed(3), +lat.toFixed(3), +msp.toFixed(3), +(Math.sign(lat) * m.v).toFixed(4)]);
    }
    return pts;
  };
  const back = walk(-1).reverse(), fwd = walk(1);
  const seed = sample(lng0, lat0);
  return back.concat([[lng0, lat0, seed ? +Math.hypot(seed.u, seed.v).toFixed(3) : 0, seed ? +(Math.sign(lat0) * seed.v).toFixed(4) : 0]], fwd);
}

async function main() {
  console.log('OSCAR mean surface velocity, ' + EPOCHS + ' composites:');
  const acc = new Map();
  for (let k = 0; k < EPOCHS; k++) accumulate(await grid(k ? `last-${k * 8}` : `last`), acc);   /* last, and every 8th before it */
  const mean = new Map();
  for (const [k, a] of acc) if (a.n) mean.set(k, { lat: a.lat, lng: a.lng, u: a.u / a.n, v: a.v / a.n });
  console.log('  mean field: ' + mean.size.toLocaleString() + ' ocean cells on a 1° grid');

  const sample = sampler(mean);
  const named = [];
  for (const [en, ja, de, ru, es, lng0, lat0] of SEEDS) {
    const sn = snap(sample, lng0, lat0);
    if (!sn) { console.log('  ⚠ ' + en + ': no flow within 5° of the seed'); continue; }
    const path = trace(sample, sn.lng, sn.lat);
    if (path.length < 6) { console.log('  ⚠ ' + en + ': the field does not support a trace here (' + path.length + ' points)'); continue; }
    /* WARM / COLD: the mean POLEWARD component along the path (sign(lat)·v). See the header — the
       endpoints of a two-way trace cannot answer this, and the first version of it got the Kuroshio
       and the North Atlantic Drift wrong for exactly that reason. */
    const pole = path.reduce((a, q) => a + (q[3] || 0), 0) / path.length;
    const kind = pole > 0.012 ? 'warm' : (pole < -0.012 ? 'cold' : 'zonal');
    const speeds = path.map((p) => p[2]);
    named.push({ en, ja, de, ru, es, kind, polewardMs: +pole.toFixed(4),
      meanSpeed: +(speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(3),
      maxSpeed: +Math.max.apply(null, speeds).toFixed(3),
      seed: [lng0, lat0], seedSnappedTo: [sn.lng, sn.lat],
      path: path.map((p) => [p[0], p[1]]) });
  }

  /* the arrow field: every ocean cell that is actually moving, thinned to 2° so a global view is
     readable and a phone can hold it */
  const arrows = [];
  for (const c of mean.values()) {
    if (c.lat % 2 || c.lng % 2) continue;
    const sp = Math.hypot(c.u, c.v);
    if (sp < 0.05) continue;
    arrows.push([c.lng, c.lat, +(Math.atan2(c.u, c.v) * 180 / Math.PI).toFixed(1), +sp.toFixed(3)]);
  }

  const doc = {
    v: 1,
    built: new Date().toISOString().slice(0, 10),
    source: 'NASA/JPL OSCAR sea-surface velocity (1/3° L4), served by NOAA CoastWatch ERDDAP as jplOscar',
    attribution: 'Ocean surface currents: NASA/JPL OSCAR via NOAA CoastWatch ERDDAP (U.S. Government work, public domain). '
      + 'Paths traced through the measured mean velocity field; names and seed points are editorial.',
    method: 'mean of ' + EPOCHS + ' five-day composites on a 1° grid; named paths integrated (RK2, 60 km steps) '
      + 'from a published seed on each current\'s core; warm/cold derived from the net poleward change along the trace',
    fields: { named: ['en', 'ja', 'de', 'ru', 'es', 'kind', 'polewardMs', 'meanSpeed', 'maxSpeed', 'seed', 'seedSnappedTo', 'path'], arrows: ['lng', 'lat', 'bearingDeg', 'speedMs'] },
    named, arrows,
  };
  writeFileSync(OUT, JSON.stringify(doc));
  console.log('\nwrote data/ocean-currents.json — ' + named.length + ' named currents, '
    + arrows.length.toLocaleString() + ' arrows, ' + (readFileSync(OUT).length / 1024).toFixed(0) + ' kB');
  for (const n of named) {
    console.log('  ' + n.kind.padEnd(5) + ' ' + n.en.padEnd(42) + n.path.length + ' pts  '
      + n.meanSpeed.toFixed(2) + ' m/s mean, ' + n.maxSpeed.toFixed(2) + ' max, poleward ' + n.polewardMs.toFixed(3));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
