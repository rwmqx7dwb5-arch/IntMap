/* ============================================================================
 *  IntMap · WHICH DATES EACH NASA GIBS RASTER ACTUALLY HAS   (#R268)
 * ----------------------------------------------------------------------------
 *  「年を変えることに意味があるレイヤーは一つ残らずすべて、変えられるようにしろ。」
 *
 *  The seven GIBS science rasters in js/layer-packs.js were pinned to «today minus two days» with
 *  no way to ask for any other date — while sea-ice concentration, the SST anomaly, NDVI, soil
 *  moisture, CO and the aerosol index are exactly the layers whose whole point is how they differ
 *  from one year to the next. Adding a date picker needs one thing this app must not guess: WHICH
 *  DATES EACH PRODUCT HAS. A picker whose range is invented shows an empty map and calls it data.
 *
 *  GIBS answers **404** for a date outside a layer's temporal extent and **200** inside it —
 *  measured, e.g. GHRSST MUR sea ice: 2002-05-01 → 404 (196 B), 2002-06-01 → 200 (1,532 B). So the
 *  extent is found by BISECTION on real requests rather than copied out of anybody's memory:
 *
 *    node scripts/probe-gibs-range.mjs        → data/gibs-range.json
 *
 *  `period` is the product's own cadence in days (1 for the daily products, 8 for MODIS 8-day
 *  composites, whose only served dates are the period start days). It is CHECKED here too: an
 *  8-day layer is probed on an off-period day and must answer 404.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/';

/* the same seven ids js/layer-packs.js draws, with the level and extension it uses */
const LAYERS = [
  { id: 'gxndvi', gibs: 'MODIS_Terra_NDVI_8Day', lvl: 9, ext: 'png', period: 8 },
  { id: 'gxseaice', gibs: 'GHRSST_L4_MUR_Sea_Ice_Concentration', lvl: 7, ext: 'png', period: 1 },
  { id: 'gxsstanom', gibs: 'GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies', lvl: 7, ext: 'png', period: 1 },
  { id: 'gxsoil', gibs: 'AMSRU2_Soil_Moisture_SCA_Day', lvl: 6, ext: 'png', period: 1 },
];

const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const doy = (t) => Math.floor((t - Date.UTC(new Date(t).getUTCFullYear(), 0, 1)) / DAY) + 1;
/* an 8-day composite is served on its PERIOD START days only: DOY 1, 9, 17 … of each year */
function snap(t, period) {
  if (period <= 1) return t;
  const y = new Date(t).getUTCFullYear();
  const d = doy(t);
  return Date.UTC(y, 0, 1) + (Math.floor((d - 1) / period) * period) * DAY;
}

async function has(L, t) {
  const u = BASE + L.gibs + '/default/' + iso(t) + '/GoogleMapsCompatible_Level' + L.lvl + '/2/1/2.' + L.ext;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u);
      await r.arrayBuffer();
      if (r.status === 200) return true;
      if (r.status === 404) return false;
    } catch (_) { }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return null;              /* the network, not the archive — never recorded as an edge */
}

const out = {};
const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
for (const L of LAYERS) {
  process.stdout.write(L.id);
  /* ── the LATEST date. Doubling back from today, then bisecting between the last 404 and the
     first 200 — because a product can stop being produced without being withdrawn: MEASURED,
     AMSRU2_Soil_Moisture_SCA_Day answers 404 for every date in 2026 and 200 for 2024-06-15, so
     the layer as shipped (today − 2 days) has been drawing NOTHING. A walk of a few days finds
     the ordinary lag; only this finds that. ── */
  let last = null, lo0 = null;
  for (let step = 0; step <= 4096; step = step ? step * 2 : 1) {
    const t = snap(today - step * DAY, L.period);
    if (await has(L, t)) { last = t; break; }
    lo0 = t;
    if (step > 4096) break;
  }
  if (last == null) { console.log(' — no date in the last 11 years answered; skipped'); continue; }
  if (lo0 != null && last < lo0) {
    let a = last, b = lo0;                          /* a = available, b = not */
    while (b - a > DAY * L.period) {
      const mid = snap(a + Math.floor((b - a) / (2 * DAY)) * DAY, L.period);
      if (mid <= a || mid >= b) break;
      const ok = await has(L, mid);
      if (ok === null) break;
      if (ok) a = mid; else b = mid;
    }
    last = a;
  }
  last = iso(last);
  /* ── the FIRST date: bisect between 1980-01-01 (certainly before) and `last` ── */
  let lo = Date.UTC(1980, 0, 1), hi = Date.parse(last + 'T00:00:00Z');
  if (await has(L, snap(lo, L.period))) { /* the archive really does start before 1980 */ }
  else {
    while (hi - lo > DAY * L.period) {
      const mid = snap(lo + Math.floor((hi - lo) / (2 * DAY)) * DAY, L.period);
      if (mid <= lo || mid >= hi) break;
      const ok = await has(L, mid);
      if (ok === null) break;
      if (ok) hi = mid; else lo = mid;
    }
  }
  const first = iso(hi);
  /* ── and the cadence claim is CHECKED, not asserted ── */
  let periodOk = true;
  if (L.period > 1) {
    const mid = Date.parse(last + 'T00:00:00Z') - DAY;            /* one day off a period start */
    const r = await has(L, mid);
    periodOk = (r === false);
  }
  out[L.id] = { gibs: L.gibs, from: first, to: last, period: L.period, periodChecked: periodOk };
  console.log(' ' + first + ' … ' + last + ' · every ' + L.period + ' d' + (periodOk ? '' : ' (cadence check inconclusive)'));
}

const f = path.join(ROOT, 'data', 'gibs-range.json');
fs.writeFileSync(f, JSON.stringify({
  source: 'NASA EOSDIS GIBS — temporal extent measured by tile probe (404 outside the archive, 200 inside)',
  probed: new Date().toISOString().slice(0, 10),
  layers: out,
}, null, 1));
console.log('wrote', f, fs.statSync(f).size, 'bytes');
