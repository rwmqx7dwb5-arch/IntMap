#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE GROUND UNDER THE GROUND — CRUST1.0 AS A SHIPPED VELOCITY PROFILE  (#R263)
 * ----------------------------------------------------------------------------
 *  「全球の堆積層厚・岩質・地殻構造を取り込み、Vs30だけでは表現できない盆地効果・地盤増幅を
 *    世界共通で扱う。」
 *
 *  Vs30 is one number about the top thirty metres. It is the right number for the frequencies whose
 *  quarter wavelength is thirty metres — around 3 Hz on rock — and it says NOTHING about the rest of
 *  the band, which is where a sedimentary basin lives: a 2 km basin resonates near 0.4 Hz, and the
 *  quarter wavelength at 0.4 Hz is two kilometres of section that Vs30 never saw. That is why a
 *  Vs30-only site term cannot produce a basin effect at all, however fine its raster is (#R223).
 *
 *  The published global answer is CRUST1.0 (Laske, Masters, Ma & Pasyanos 2013) — a 1° × 1° model of
 *  the whole Earth's crust in eight layers (water, ice, three sediment layers, three crystalline
 *  layers) plus the uppermost mantle, each with its own Vs, density and boundary depth. It is the
 *  reference crustal model, it is global, and it is ONE model everywhere: no regional patch, no
 *  country-specific grid, which is the standing constraint on this whole round.
 *
 *      data/crust1.bin.gz    64,800 cells (360 × 180, 1°), three planes:
 *                            ① 9 boundary elevations, Int16 LE, units of 10 m, positive up
 *                               (top of water · bottom of water · bottom of ice · bottom of sed 1·2·3
 *                                · bottom of cryst 1·2·3 = Moho)
 *                            ② 9 shear velocities, Uint8, units of 0.025 km/s (0 = layer absent)
 *                            ③ 9 densities,        Uint8, units of 0.02 g/cm³
 *                            36 bytes a cell, 2.33 MB raw
 *      data/crust1.json      the manifest
 *
 *  ⚠ VP IS NOT SHIPPED. The site amplification this feeds (js/seismic-site.js) is a SHEAR-wave
 *  quarter-wavelength integral, so it needs Vs and ρ and nothing else. Shipping Vp would be 20 % more
 *  bytes for a column no reader has.
 *  ⚠ 1° IS 111 km, AND THAT IS THE HONEST LIMIT OF THIS LAYER. It resolves the Ganges, the West
 *  Siberian and the Amazon basins; it does not resolve the Kanto or Los Angeles basins as individual
 *  features. js/seismic-site.js therefore builds the SHALLOW half of every profile from the Vs30
 *  raster (0.05°, scripts/build-vs30.mjs) and only the DEEP half from here — which is the resolution
 *  each half deserves, because the deep half controls long periods and long periods are broad.
 *
 *      node scripts/build-crust1.mjs [--cache <dir>]
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const CACHE = arg('cache', path.join(ROOT, '.cache', 'crust1'));
const SRC = 'https://igppweb.ucsd.edu/~gabi/crust1/crust1.0.tar.gz';

const NLON = 360, NLAT = 180, NLAY = 9, NCELL = NLON * NLAT;

/* ── the archive, cached ─────────────────────────────────────────────────────────────────────────
   crust1.0.tar.gz is 1.1 MB of plain tar; three of its members are wanted and the reader below is
   the whole of tar: 512-byte headers, a name, an octal size, and the payload padded to 512. Using
   the system `tar` would make this build depend on a shell, and on Windows a path beginning `C:` is
   read by GNU tar as a REMOTE HOST — the exact failure this project has written down before. */
function untar(buf) {
  const out = new Map();
  let p = 0;
  while (p + 512 <= buf.length) {
    const name = buf.toString('ascii', p, p + 100).replace(/\0.*$/, '');
    if (!name) { p += 512; continue; }
    const size = parseInt(buf.toString('ascii', p + 124, p + 136).replace(/[^0-7]/g, ''), 8) || 0;
    const type = String.fromCharCode(buf[p + 156]);
    p += 512;
    if (type === '0' || type === '\0') out.set(path.basename(name), buf.subarray(p, p + size));
    p += Math.ceil(size / 512) * 512;
  }
  return out;
}

async function members() {
  fs.mkdirSync(CACHE, { recursive: true });
  const tgz = path.join(CACHE, 'crust1.0.tar.gz');
  if (!fs.existsSync(tgz) || fs.statSync(tgz).size < 100000) {
    process.stdout.write('fetching ' + SRC + '\n');
    const r = await fetch(SRC, { headers: { 'User-Agent': 'IntMap/build-crust1 (+https://github.com/rwmqx7dwb5-arch/IntMap)' } });
    if (!r.ok) throw new Error('CRUST1.0: HTTP ' + r.status);
    fs.writeFileSync(tgz, Buffer.from(await r.arrayBuffer()));
  }
  return untar(zlib.gunzipSync(fs.readFileSync(tgz)));
}

const mem = await members();
const need = ['crust1.bnds', 'crust1.vs', 'crust1.rho'];
for (const n of need) if (!mem.has(n)) throw new Error('crust1.0.tar.gz is missing ' + n);

/* Each file is 64,800 lines of nine free-format reals. The model runs 89.5 N → −89.5 N with
   longitude as the inner loop starting at 179.5 W, which is the same row-major, north-first
   ordering every other raster in data/ uses — so the cell index is j*360 + i with no remapping. */
function table(name) {
  const lines = mem.get(name).toString('ascii').split('\n').filter((s) => s.trim().length);
  if (lines.length !== NCELL) throw new Error(name + ': ' + lines.length + ' lines, expected ' + NCELL);
  const v = new Float64Array(NCELL * NLAY);
  for (let k = 0; k < NCELL; k++) {
    const parts = lines[k].trim().split(/\s+/);
    if (parts.length !== NLAY) throw new Error(name + ' line ' + (k + 1) + ': ' + parts.length + ' values');
    for (let l = 0; l < NLAY; l++) v[k * NLAY + l] = parseFloat(parts[l]);
  }
  return v;
}

const bnds = table('crust1.bnds');
const vs = table('crust1.vs');
const rho = table('crust1.rho');

const B_SCALE = 100;       /* Int16, units of 10 m */
const V_SCALE = 0.025;     /* Uint8, km/s per count */
const R_SCALE = 0.02;      /* Uint8, g/cm³ per count */

const bOut = Buffer.alloc(NCELL * NLAY * 2);
const vOut = Buffer.alloc(NCELL * NLAY);
const rOut = Buffer.alloc(NCELL * NLAY);
let bMin = Infinity, bMax = -Infinity, vMax = 0, rMax = 0;
let clipped = 0;
for (let k = 0; k < NCELL * NLAY; k++) {
  const b = bnds[k];
  if (b < bMin) bMin = b; if (b > bMax) bMax = b;
  const bi = Math.round(b * B_SCALE);
  if (bi < -32768 || bi > 32767) { clipped++; }
  bOut.writeInt16LE(Math.max(-32768, Math.min(32767, bi)), k * 2);
  const v = vs[k]; if (v > vMax) vMax = v;
  vOut[k] = Math.max(0, Math.min(255, Math.round(v / V_SCALE)));
  const r = rho[k]; if (r > rMax) rMax = r;
  rOut[k] = Math.max(0, Math.min(255, Math.round(r / R_SCALE)));
}
if (clipped) throw new Error(clipped + ' boundary depths do not fit in Int16 at ' + B_SCALE + ' counts/km');

/* ── what the model says about itself, so the manifest is a measurement and not a claim ─────────*/
let land = 0, sedSum = 0, sedMax = 0, mohoSum = 0, mohoMax = 0;
for (let k = 0; k < NCELL; k++) {
  const o = k * NLAY;
  const surf = bnds[o];                                  /* topography, km, positive up */
  const waterKm = bnds[o] - bnds[o + 1];
  if (waterKm > 0.5) continue;                           /* ocean cell — measured over land only */
  land++;
  const sed = bnds[o + 2] - bnds[o + 5];                 /* bottom of ice → bottom of sediment 3 */
  sedSum += sed; if (sed > sedMax) sedMax = sed;
  const moho = surf - bnds[o + 8];
  mohoSum += moho; if (moho > mohoMax) mohoMax = moho;
}

const raw = Buffer.concat([bOut, vOut, rOut]);
const gz = zlib.gzipSync(raw, { level: 9 });
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'crust1.bin.gz'), gz);
fs.writeFileSync(path.join(ROOT, 'data', 'crust1.json'), JSON.stringify({
  source: 'CRUST1.0 — Laske, G., Masters, G., Ma, Z. & Pasyanos, M. (2013), Update on CRUST1.0: a 1-degree global model of Earth\'s crust, Geophys. Res. Abstr. 15, EGU2013-2658',
  distribution: SRC,
  home: 'https://igppweb.ucsd.edu/~gabi/crust1.html',
  layers: ['water', 'ice', 'upper sediments', 'middle sediments', 'lower sediments',
    'upper crystalline crust', 'middle crystalline crust', 'lower crystalline crust', 'uppermost mantle'],
  nlon: NLON, nlat: NLAT, nlayers: NLAY, degrees: 1,
  projection: 'equirectangular 1°, cell CENTRES 89.5N…-89.5N × -179.5E…179.5E, longitude the inner loop',
  planes: [
    { name: 'bounds', type: 'int16le', count: NLAY, scale: 1 / B_SCALE, unit: 'km, elevation positive up', note: 'top of water · bottom of water · bottom of ice · bottom of sed 1·2·3 · bottom of cryst 1·2·3 (= Moho)' },
    { name: 'vs', type: 'uint8', count: NLAY, scale: V_SCALE, unit: 'km/s', note: '0 = layer absent' },
    { name: 'rho', type: 'uint8', count: NLAY, scale: R_SCALE, unit: 'g/cm3' }
  ],
  boundsRangeKm: [+bMin.toFixed(2), +bMax.toFixed(2)],
  maxVsKms: +vMax.toFixed(2), maxRhoGcc: +rMax.toFixed(2),
  landCells: land,
  meanSedimentKm: +(sedSum / land).toFixed(3), maxSedimentKm: +sedMax.toFixed(2),
  meanMohoKm: +(mohoSum / land).toFixed(2), maxMohoKm: +mohoMax.toFixed(2),
  bytes: gz.length, bytesRaw: raw.length,
  built: new Date().toISOString()
}, null, 2) + '\n');
process.stdout.write('data/crust1.bin.gz  ' + (gz.length / 1024).toFixed(1) + ' kB (raw ' + (raw.length / 1048576).toFixed(2) + ' MB)\n');
process.stdout.write('  land cells ' + land + ' · mean sediment ' + (sedSum / land).toFixed(2) + ' km (max '
  + sedMax.toFixed(1) + ') · mean Moho ' + (mohoSum / land).toFixed(1) + ' km (max ' + mohoMax.toFixed(1) + ')\n');
