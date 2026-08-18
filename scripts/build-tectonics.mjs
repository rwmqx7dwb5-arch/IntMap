#!/usr/bin/env node
/* ============================================================================
 *  IntMap · WHERE ON EARTH IS THIS, TECTONICALLY  (#R263)
 * ----------------------------------------------------------------------------
 *  「プレート境界型・スラブ内・活断層・安定大陸などを位置・深さ・メカニズム・全球プレートデータから
 *    自動判定し、地震動モデルへ反映する。」
 *
 *  Every regional constant in a ground-motion model — the stress drop, the crustal Q, the near-surface
 *  κ — is a statement about a TECTONIC SETTING, not about a country. js/seismic.js carried one setting
 *  (an active shallow crust, southern-California Q) and applied it to the whole planet, so a craton
 *  earthquake and a subduction earthquake were the same earthquake with different coordinates.
 *
 *  This build ships the first half of the answer: the SURFACE regionalisation, from Bird (2003)
 *  PB2002 — the published global plate-boundary model, 5,824 steps each carrying its own class, plus
 *  13 orogen polygons marking the diffuse deformation the step model cannot draw as a line. The other
 *  half (is there a slab under this point, and how deep) is scripts/build-slab2.mjs.
 *
 *      data/tectonics.bin.gz   three 1440 × 720 (0.25°) byte planes, in this order
 *                              ① distance to the nearest PB2002 boundary step, encoded as
 *                                round(4·√(d/km)), so d = (v/4)² km — 0.06 km per step near a
 *                                boundary, 22 km per step at 2,000 km, and 4,064 km at 255. A LINEAR
 *                                byte cannot do both ends: 10 km/step saturates at 2,550 and the
 *                                measured maximum on this grid is 3,998 km (interior Antarctica),
 *                                while 20 km/step reaches it and throws away the near field, which
 *                                is the half every threshold in js/tectonics.js is written against.
 *                              ② the STEPCLASS of that nearest step:
 *                                0 none · 1 OSR · 2 OTF · 3 OCB · 4 CTF · 5 CRB · 6 CCB · 7 SUB
 *                              ③ 1 inside a PB2002 orogen polygon, 0 outside
 *      data/tectonics.json     the manifest (source, citation, layout, coverage, build time)
 *
 *  ── WHY A NEAREST-SOURCE SWEEP AND NOT A DISTANCE TRANSFORM ────────────────────────────────────
 *  A chamfer transform accumulates edge lengths, and on a sphere the edge length depends on latitude,
 *  so the error grows with the distance travelled — exactly where this raster is read (a craton is
 *  1,000+ km from anything). Instead every cell carries the INDEX of the boundary point it currently
 *  believes is nearest, and a sweep asks «is my neighbour's candidate better than mine» by measuring
 *  the true great-circle distance to that candidate. The distance is therefore always exact for
 *  whatever point won; only the SEARCH is approximate, and four sweeps over a 0.25° grid converge —
 *  verified below by re-running until nothing changes and printing the pass count.
 *  ⚠ THE GRID WRAPS IN LONGITUDE. A cell at 179.9°E has a neighbour at 179.9°W; without the wrap the
 *  Pacific rim would be measured the long way round.
 *
 *      node scripts/build-tectonics.mjs [--width 1440] [--cache <dir>]
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

const W = Number(arg('width', 1440));
const H = W / 2;
const CACHE = arg('cache', path.join(ROOT, '.cache', 'tectonics'));
const BASE = 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/';
const D = Math.PI / 180, RE = 6371.0;

/* PB2002's own class names, in the order the byte plane encodes them. `OCB` (oceanic convergent
   boundary) is in the model and is NOT the same thing as `SUB`; keeping them apart is the difference
   between the Macquarie Ridge and the Tonga trench. */
const CLASSES = ['none', 'OSR', 'OTF', 'OCB', 'CTF', 'CRB', 'CCB', 'SUB'];
const CODE = new Map(CLASSES.map((c, i) => [c, i]));

async function grab(name) {
  fs.mkdirSync(CACHE, { recursive: true });
  const dst = path.join(CACHE, name);
  if (fs.existsSync(dst) && fs.statSync(dst).size > 1024) return JSON.parse(fs.readFileSync(dst, 'utf8'));
  process.stdout.write('fetching ' + name + '\n');
  const r = await fetch(BASE + name, { headers: { 'User-Agent': 'IntMap/build-tectonics (+https://github.com/rwmqx7dwb5-arch/IntMap)' } });
  if (!r.ok) throw new Error(name + ': HTTP ' + r.status);
  const txt = await r.text();
  fs.writeFileSync(dst, txt);
  return JSON.parse(txt);
}

const steps = await grab('PB2002_steps.json');
const orogens = await grab('PB2002_orogens.json');

/* ── ① the boundary points, and the class each one carries ──────────────────────────────────────
   Every vertex of every step polyline is a candidate. PB2002's steps are already sampled finely
   (5,824 steps, ~30 km each, drawn with intermediate vertices), so no resampling is needed: the
   coarsest gap between consecutive vertices is well under this raster's own 28 km cell. */
const px = [], py = [], pc = [];
for (const f of steps.features) {
  const cls = CODE.get(String(f.properties.STEPCLASS || '').toUpperCase()) || 0;
  const g = f.geometry;
  const lines = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
  for (const ln of lines) for (const v of ln) {
    let lo = +v[0]; if (!isFinite(lo)) continue;
    lo = ((lo + 180) % 360 + 360) % 360 - 180;
    const la = Math.max(-90, Math.min(90, +v[1]));
    px.push(lo); py.push(la); pc.push(cls);
  }
}
const NP = px.length;
process.stdout.write('PB2002: ' + steps.features.length + ' steps → ' + NP + ' boundary vertices\n');

/* pre-computed unit vectors — the sweep does millions of distances and a dot product is the whole
   great-circle measurement (acos of the dot, times the Earth radius) */
const ux = new Float64Array(NP), uy = new Float64Array(NP), uz = new Float64Array(NP);
for (let i = 0; i < NP; i++) {
  const la = py[i] * D, lo = px[i] * D, c = Math.cos(la);
  ux[i] = c * Math.cos(lo); uy[i] = c * Math.sin(lo); uz[i] = Math.sin(la);
}

/* ── ② seed: the cell a boundary vertex falls in owns that vertex ───────────────────────────────*/
const own = new Int32Array(W * H).fill(-1);
const cellLon = new Float64Array(W), cellLat = new Float64Array(H);
for (let i = 0; i < W; i++) cellLon[i] = (i + 0.5) / W * 360 - 180;
for (let j = 0; j < H; j++) cellLat[j] = 90 - (j + 0.5) / H * 180;
const cx = new Float64Array(W * H), cy = new Float64Array(W * H), cz = new Float64Array(W * H);
for (let j = 0; j < H; j++) {
  const la = cellLat[j] * D, c = Math.cos(la), s = Math.sin(la);
  for (let i = 0; i < W; i++) {
    const lo = cellLon[i] * D, k = j * W + i;
    cx[k] = c * Math.cos(lo); cy[k] = c * Math.sin(lo); cz[k] = s;
  }
}
const dist = new Float64Array(W * H).fill(Infinity);
const dTo = (k, p) => {
  const dot = Math.max(-1, Math.min(1, cx[k] * ux[p] + cy[k] * uy[p] + cz[k] * uz[p]));
  return Math.acos(dot) * RE;
};
for (let p = 0; p < NP; p++) {
  let i = Math.floor((px[p] + 180) / 360 * W); if (i < 0) i = 0; else if (i >= W) i = W - 1;
  let j = Math.floor((90 - py[p]) / 180 * H); if (j < 0) j = 0; else if (j >= H) j = H - 1;
  const k = j * W + i, d = dTo(k, p);
  if (d < dist[k]) { dist[k] = d; own[k] = p; }
}

/* ── ③ sweep until nothing changes ──────────────────────────────────────────────────────────────*/
const relax = (k, kn) => {
  const p = own[kn]; if (p < 0) return 0;
  const d = dTo(k, p);
  if (d < dist[k] - 1e-9) { dist[k] = d; own[k] = p; return 1; }
  return 0;
};
let pass = 0, moved = 1;
while (moved && pass < 60) {
  moved = 0; pass++;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    moved += relax(k, j * W + ((i - 1 + W) % W));
    if (j > 0) { moved += relax(k, (j - 1) * W + i); moved += relax(k, (j - 1) * W + ((i - 1 + W) % W)); moved += relax(k, (j - 1) * W + ((i + 1) % W)); }
  }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
    const k = j * W + i;
    moved += relax(k, j * W + ((i + 1) % W));
    if (j < H - 1) { moved += relax(k, (j + 1) * W + i); moved += relax(k, (j + 1) * W + ((i + 1) % W)); moved += relax(k, (j + 1) * W + ((i - 1 + W) % W)); }
  }
  process.stdout.write('  pass ' + pass + ': ' + moved + ' cells improved\n');
}

/* ── ③b DID THE SWEEP ACTUALLY FIND THE NEAREST ONE? ────────────────────────────────────────────
   The sweep is a heuristic and the build must not ship on the assumption that it worked. 4,000 cells
   drawn on a fixed stride are re-solved by BRUTE FORCE against all 269,153 vertices, and the largest
   disagreement is printed and gated: a raster whose distances are wrong by more than a cell is not a
   distance raster. (A fixed stride rather than a random sample so the check is reproducible.) */
{
  const N = W * H, STRIDE = Math.max(1, Math.floor(N / 4000));
  let worst = 0, worstAt = -1, checked = 0;
  for (let k = 0; k < N; k += STRIDE) {
    let best = Infinity;
    for (let p = 0; p < NP; p++) { const d = dTo(k, p); if (d < best) best = d; }
    checked++;
    const err = dist[k] - best;
    if (err > worst) { worst = err; worstAt = k; }
  }
  const cellKm = 360 / W * 111.32;
  process.stdout.write('  verify: ' + checked + ' cells brute-forced · worst overshoot '
    + worst.toFixed(3) + ' km (cell ' + cellKm.toFixed(1) + ' km)\n');
  if (worst > cellKm) {
    console.error('nearest-boundary sweep did not converge: cell ' + worstAt + ' is ' + worst.toFixed(1)
      + ' km worse than the true nearest — refusing to ship it');
    process.exit(1);
  }
}

/* ── ④ the orogens: PB2002's diffuse deformation zones ──────────────────────────────────────────
   A step model draws a boundary as a line. Bird's own paper says that is a fiction across the
   Alpine-Himalayan belt, the Andes' back-arc and the Basin and Range, and ships 13 polygons saying
   so. A site inside one is deforming even if the nearest LINE is far away — which is exactly the
   case this raster exists to get right (Tibet is 400 km from the nearest step and is not a craton). */
const rings = [];
for (const f of orogens.features) {
  const g = f.geometry;
  const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
  for (const poly of polys) for (let r = 0; r < poly.length; r++) {
    const ring = poly[r];
    let lo0 = 180, lo1 = -180, la0 = 90, la1 = -90;
    for (const v of ring) { if (v[0] < lo0) lo0 = v[0]; if (v[0] > lo1) lo1 = v[0]; if (v[1] < la0) la0 = v[1]; if (v[1] > la1) la1 = v[1]; }
    rings.push({ ring, lo0, lo1, la0, la1, hole: r > 0 });
  }
}
function inRing(r, lo, la) {
  if (lo < r.lo0 || lo > r.lo1 || la < r.la0 || la > r.la1) return false;
  const c = r.ring; let inside = false;
  for (let a = 0, b = c.length - 1; a < c.length; b = a++) {
    const xa = c[a][0], ya = c[a][1], xb = c[b][0], yb = c[b][1];
    if ((ya > la) !== (yb > la) && lo < (xb - xa) * (la - ya) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}
const oro = new Uint8Array(W * H);
let oroCells = 0;
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const lo = cellLon[i], la = cellLat[j];
  let hit = false;
  for (const r of rings) { if (!inRing(r, lo, la)) continue; hit = !r.hole; if (r.hole) { hit = false; break; } }
  if (hit) { oro[j * W + i] = 1; oroCells++; }
}

/* ── ⑤ write ────────────────────────────────────────────────────────────────────────────────────*/
const out = Buffer.alloc(W * H * 3);
const hist = new Array(CLASSES.length).fill(0);
let dMax = 0;
for (let k = 0; k < W * H; k++) {
  const d = dist[k];
  out[k] = Math.max(0, Math.min(255, Math.round(4 * Math.sqrt(Math.max(0, d)))));
  const p = own[k];
  out[W * H + k] = p >= 0 ? pc[p] : 0;
  out[2 * W * H + k] = oro[k];
  if (p >= 0) hist[pc[p]]++;
  if (d > dMax && isFinite(d)) dMax = d;
}
const gz = zlib.gzipSync(out, { level: 9 });
fs.writeFileSync(path.join(ROOT, 'data', 'tectonics.bin.gz'), gz);
const manifest = {
  source: 'Bird (2003) PB2002 — a digital model of the plate boundaries (Geochem. Geophys. Geosyst. 4(3), 1027)',
  distribution: 'https://github.com/fraxen/tectonicplates (PB2002_steps.json, PB2002_orogens.json)',
  doi: '10.1029/2001GC000252',
  method: 'nearest PB2002 boundary vertex by great-circle distance, swept to convergence; orogen flag by point-in-polygon against the 13 PB2002 orogen polygons',
  width: W, height: H, degrees: 360 / W,
  projection: 'equirectangular, -180..180 × 90..-90, pixel centres at (i+0.5), (j+0.5)',
  planes: [
    { name: 'distSqrt4', bytes: 1, encoding: 'distance to the nearest plate-boundary step as round(4·sqrt(km)); decode km = (v/4)^2' },
    { name: 'stepClass', bytes: 1, encoding: CLASSES.map((c, i) => i + '=' + c).join(' ') },
    { name: 'orogen', bytes: 1, encoding: '1 inside a PB2002 orogen polygon, else 0' }
  ],
  steps: steps.features.length, boundaryVertices: NP, orogenRings: rings.length,
  orogenCells: oroCells, orogenCellFraction: +(oroCells / (W * H)).toFixed(4),
  sweepPasses: pass, maxDistanceKm: Math.round(dMax),
  classCells: Object.fromEntries(CLASSES.map((c, i) => [c, hist[i]])),
  bytes: gz.length, bytesRaw: out.length,
  built: new Date().toISOString()
};
fs.writeFileSync(path.join(ROOT, 'data', 'tectonics.json'), JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write('data/tectonics.bin.gz  ' + (gz.length / 1024).toFixed(1) + ' kB (raw ' + (out.length / 1048576).toFixed(1) + ' MB)\n');
process.stdout.write('  orogen cells ' + oroCells + ' · max distance ' + Math.round(dMax) + ' km · passes ' + pass + '\n');
