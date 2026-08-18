#!/usr/bin/env node
/* ============================================================================
 *  IntMap · IS THERE A SLAB UNDER THIS HYPOCENTRE — SLAB2 AS SHIPPED GEOMETRY  (#R263)
 * ----------------------------------------------------------------------------
 *  「プレート境界型・スラブ内・活断層・安定大陸などを位置・深さ・メカニズム・全球プレートデータから
 *    自動判定し」
 *
 *  The three settings that differ most in ground motion — a megathrust INTERFACE event, an INTRASLAB
 *  event inside the descending plate, and a CRUSTAL event in the overriding plate — can share a map
 *  pin to within a few kilometres. What separates them is the depth of the hypocentre relative to the
 *  SLAB SURFACE, and that surface is a published global model: Slab2 (Hayes et al. 2018, Science 362,
 *  58-61), which gives depth, strike and dip at 0.05° for all 27 active subduction zones.
 *
 *  With it, js/tectonics.js can ask the question the way a seismologist asks it — «how far is this
 *  hypocentre from the interface, and is it above it or inside the slab» — instead of guessing from a
 *  depth threshold that is wrong wherever the slab is unusually flat or unusually steep.
 *
 *      data/slab2.bin.gz   one region after another; each is a table of ny ROW RUNS followed by four
 *                          parallel planes over the run cells (`span` of them per region):
 *                          rows[j] = x0 Uint16 LE, n Uint16 LE   (n = 0 → this row has no slab)
 *                          plane ① depth  Int16 LE · the DIFFERENCE in depth counts from the previous
 *                                  cell of the same row (the first cell of a row differs from 0);
 *                                  depth_km = (Σ counts) / 20 − 5, i.e. 50 m per count
 *                          plane ② slab   Uint8 · 1 = there is a slab node here, 0 = a hole in the run
 *                          plane ③ dip    Uint8 · 0 = not published here, else degrees = v − 1
 *                          plane ④ strike Uint8 · 0 = not published here, else degrees = (v − 1) · 2
 *      data/slab2.json     the manifest, and the region table the reader indexes with
 *
 *  ⚠ THE DEPTH IS A DIFFERENCE, AND THAT IS WHAT MAKES THIS FILE AFFORDABLE. Absolute 16-bit depths
 *  are close to random in their low byte, and gzip could only take 3.86 MB down to 3.12 MB — 81 %,
 *  i.e. it found almost nothing. A slab surface is smooth, so the difference between two nodes 5.5 km
 *  apart is small and strongly peaked at zero, and the same 922,485 nodes then compress to a third of
 *  that. A hole inside a run keeps its neighbours' chain intact by contributing a difference of zero.
 *  ⚠ PRESENCE IS ITS OWN PLANE, and that is not redundancy. The first version of this encoding used
 *  «dip = 0» as the presence mask, on the assumption that Slab2's three grids are clipped to the same
 *  mask. The assertion written to check that assumption FAILED, and in the direction that matters:
 *  877 nodes have a published DIP and no published DEPTH. Reading presence off the dip plane would
 *  have claimed a slab at every one of them and then handed the reader whatever the delta chain
 *  happened to accumulate to. A plane of ones costs about a kilobyte after gzip, which is what an
 *  unambiguous answer is worth. (The manifest counts both directions.)
 *
 *  ⚠ SHIPPED AT SLAB2'S OWN 0.05°, AND STORED SPARSELY BECAUSE OF IT. The first cut of this build
 *  decimated to 0.1° to save four fifths of the bytes, and the verification below — which re-reads
 *  every full-resolution node and compares it against the bilinear interpolation of what the reader
 *  will see — MEASURED 6.17 km of lost depth in the Puysegur zone, whose slab is the steepest and the
 *  most tightly curved in the model. Six kilometres is the size of the whole window that separates an
 *  INTERFACE event from an INTRASLAB one, so the decimation was not free and the resolution went back
 *  to what Hayes et al. published. The bytes come back a different way: a slab fills about a fifth of
 *  its own bounding rectangle, so each row is stored as ONE RUN from its first slab node to its last
 *  instead of as a full-width array of mostly nothing.
 *  ⚠ LONGITUDES ARE KEPT AS SLAB2 STATES THEM (0…360 for the Pacific rim, −180…180 elsewhere). The
 *  reader tries both conventions; rewriting them here would tear the Aleutian and Kermadec grids in
 *  half at the antimeridian, which is the one place they must not be torn.
 *
 *      node scripts/build-slab2.mjs [--cache <dir>] [--step 2]
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const CACHE = arg('cache', path.join(ROOT, '.cache', 'slab2'));
const STEP = Number(arg('step', 1));                 /* 0.05° × STEP — read the ⚠ above before raising it */
const PARENT = '5aa1b00ee4b0b1c392e86467';
const SB = 'https://www.sciencebase.gov/catalog/';

const DEP_OFF = 5, DEP_SCALE = 20;                   /* depth_km = counts/DEP_SCALE - DEP_OFF (50 m a count) */

async function cachedFetch(url, dst) {
  if (fs.existsSync(dst) && fs.statSync(dst).size > 1024) return fs.readFileSync(dst);
  const r = await fetch(url, { headers: { 'User-Agent': 'IntMap/build-slab2 (+https://github.com/rwmqx7dwb5-arch/IntMap)' } });
  if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
  const b = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dst, b);
  return b;
}

fs.mkdirSync(CACHE, { recursive: true });
const kids = JSON.parse((await cachedFetch(
  SB + 'items?parentId=' + PARENT + '&format=json&max=100&fields=title,id',
  path.join(CACHE, '_index.json'))).toString('utf8'));

/* ── gather every region's three grids ─────────────────────────────────────────────────────────*/
const wanted = /_slab2_(dep|dip|str)_.*\.xyz$/;
const files = new Map();                              /* code → { dep, dip, str } local paths */
for (const k of kids.items) {
  const meta = JSON.parse((await cachedFetch(SB + 'item/' + k.id + '?format=json&fields=files',
    path.join(CACHE, '_item_' + k.id + '.json'))).toString('utf8'));
  for (const f of (meta.files || [])) {
    const m = wanted.exec(f.name || ''); if (!m) continue;
    const code = f.name.slice(0, 3);
    const dst = path.join(CACHE, f.name);
    process.stdout.write('  ' + f.name + (fs.existsSync(dst) ? ' (cached)' : ' …') + '\n');
    await cachedFetch(f.url, dst);
    (files.get(code) || files.set(code, {}).get(code))[m[1]] = dst;
  }
}
process.stdout.write('Slab2: ' + files.size + ' subduction zones\n');

/* Slab2 .xyz is `lon,lat,value` with NaN outside the clipping mask; the nodes are a complete
   rectangle at 0.05°, so the grid is recovered from the coordinate range rather than assumed. */
function readXYZ(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const rows = [];
  let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
  for (const line of txt.split('\n')) {
    if (!line) continue;
    const c = line.indexOf(','), c2 = line.indexOf(',', c + 1);
    if (c < 0 || c2 < 0) continue;
    const lo = +line.slice(0, c), la = +line.slice(c + 1, c2), v = +line.slice(c2 + 1);
    if (!isFinite(lo) || !isFinite(la)) continue;
    rows.push(lo, la, v);
    if (lo < lo0) lo0 = lo; if (lo > lo1) lo1 = lo;
    if (la < la0) la0 = la; if (la > la1) la1 = la;
  }
  const d = 0.05;
  const nx = Math.round((lo1 - lo0) / d) + 1, ny = Math.round((la1 - la0) / d) + 1;
  const g = new Float64Array(nx * ny).fill(NaN);
  for (let i = 0; i < rows.length; i += 3) {
    const ix = Math.round((rows[i] - lo0) / d), iy = Math.round((rows[i + 1] - la0) / d);
    if (ix < 0 || ix >= nx || iy < 0 || iy >= ny) continue;
    g[iy * nx + ix] = rows[i + 2];
  }
  return { lo0, la0, d, nx, ny, g };
}

const regions = [];
const chunks = [];
let offset = 0, nodes = 0, runNodes = 0, rectCells = 0;
let worstDep = 0, worstAt = '', noDip = 0, noStr = 0, dipNoDepth = 0;

for (const [code, f] of [...files.entries()].sort()) {
  if (!f.dep || !f.dip || !f.str) { process.stdout.write('  ! ' + code + ' incomplete, skipped\n'); continue; }
  const dep = readXYZ(f.dep), dip = readXYZ(f.dip), str = readXYZ(f.str);
  const NX = Math.floor((dep.nx - 1) / STEP) + 1, NY = Math.floor((dep.ny - 1) / STEP) + 1;
  const RD = dep.d * STEP;

  /* -- the runs: per row, the span from its first slab node to its last ------------------------ */
  const rows = Buffer.alloc(NY * 4);
  const payload = [];
  let n = 0, span = 0;
  for (let jy = 0; jy < NY; jy++) {
    let x0 = -1, x1 = -1;
    for (let jx = 0; jx < NX; jx++) {
      if (!isFinite(dep.g[(jy * STEP) * dep.nx + (jx * STEP)])) continue;
      if (x0 < 0) x0 = jx;
      x1 = jx;
    }
    if (x0 < 0) continue;                               /* rows Buffer is already zero = empty row */
    const len = x1 - x0 + 1;
    rows.writeUInt16LE(x0, jy * 4); rows.writeUInt16LE(len, jy * 4 + 2);
    const md = Buffer.alloc(len), dd = Buffer.alloc(len * 2), pd = Buffer.alloc(len), sd = Buffer.alloc(len);
    let prev = 0;
    for (let t = 0; t < len; t++) {
      const k = (jy * STEP) * dep.nx + ((x0 + t) * STEP);
      const z = dep.g[k];
      if (!isFinite(z)) { if (isFinite(dip.g[k])) dipNoDepth++; continue; }   /* a hole keeps delta 0 and slab 0 */
      /* Slab2 publishes ELEVATIONS (negative down); this model works in depth below sea level. */
      const cnt = Math.max(1, Math.round((-z + DEP_OFF) * DEP_SCALE));
      const d = cnt - prev;
      if (d < -32768 || d > 32767) throw new Error(code + ': depth delta ' + d + ' does not fit Int16');
      md[t] = 1; dd.writeInt16LE(d, t * 2); prev = cnt;
      const p = dip.g[k];
      if (isFinite(p)) pd[t] = Math.max(1, Math.min(255, Math.round(p) + 1)); else noDip++;
      const q = str.g[k];
      if (isFinite(q)) sd[t] = Math.max(1, Math.min(255, Math.round(((q % 360) + 360) % 360 / 2) + 1)); else noStr++;
      n++;
    }
    payload.push({ md, dd, pd, sd }); span += len;
  }
  /* the plane ORDER is an alignment constraint, not a taste: the reader mounts these as typed
     arrays over the shipped ArrayBuffer, and `new Int16Array(buf, off, n)` throws unless `off` is
     even. Putting the Int16 depth plane FIRST — straight after the 4-byte row headers — keeps it
     4-aligned whatever `span` is, and the three byte planes after it need no alignment at all. The
     region body is then padded to a multiple of four so the NEXT region starts aligned too. */
  const bodyRaw = Buffer.concat([rows, ...payload.map((x) => x.dd), ...payload.map((x) => x.md),
    ...payload.map((x) => x.pd), ...payload.map((x) => x.sd)]);
  const body = (bodyRaw.length % 4) ? Buffer.concat([bodyRaw, Buffer.alloc(4 - bodyRaw.length % 4)]) : bodyRaw;

  /* -- does what is shipped still describe the surface Slab2 published? ------------------------
     Every full-resolution node is re-read and compared against the bilinear interpolation of what
     the reader will actually get, DECODED OUT OF `body` by the same rules js/earth-structure.js
     applies -- so this checks the encoding and the run layout, not only the resolution. */
  const rowCell = new Int32Array(NY);
  { let acc = 0;
    for (let jy = 0; jy < NY; jy++) { rowCell[jy] = acc; acc += rows.readUInt16LE(jy * 4 + 2); } }
  const DEP0 = NY * 4, MSK0 = DEP0 + span * 2;
  const at = (jx, jy) => {
    if (jx < 0 || jy < 0 || jx >= NX || jy >= NY) return NaN;
    const x0 = rows.readUInt16LE(jy * 4), len = rows.readUInt16LE(jy * 4 + 2);
    if (!len || jx < x0 || jx >= x0 + len) return NaN;
    const c0 = rowCell[jy];
    if (!body[MSK0 + c0 + (jx - x0)]) return NaN;
    let cnt = 0;
    for (let t = 0; t <= jx - x0; t++) cnt += body.readInt16LE(DEP0 + (c0 + t) * 2);
    return cnt / DEP_SCALE - DEP_OFF;
  };
  const bil = (lo, la) => {
    const fx = (lo - dep.lo0) / RD, fy = (la - dep.la0) / RD;
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    let sum = 0, wsum = 0;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const v = at(ix + a, iy + b); if (!isFinite(v)) return NaN;
      const w = (a ? tx : 1 - tx) * (b ? ty : 1 - ty);
      sum += w * v; wsum += w;
    }
    return wsum > 0 ? sum / wsum : NaN;
  };
  for (let iy = 0; iy < dep.ny; iy++) for (let ix = 0; ix < dep.nx; ix++) {
    const z = dep.g[iy * dep.nx + ix]; if (!isFinite(z)) continue;
    const got = bil(dep.lo0 + ix * dep.d, dep.la0 + iy * dep.d);
    if (!isFinite(got)) continue;
    const e = Math.abs(got - (-z));
    if (e > worstDep) { worstDep = e; worstAt = code; }
  }

  regions.push({ code, lon0: +dep.lo0.toFixed(4), lat0: +dep.la0.toFixed(4), d: +RD.toFixed(4),
    nx: NX, ny: NY, offset, bytes: body.length, nodes: n });
  chunks.push(body);
  offset += body.length;
  nodes += n; runNodes += span; rectCells += NX * NY;
  process.stdout.write('  ' + code + ' ' + NX + 'x' + NY + ' . ' + n + ' slab nodes in ' + span + ' run cells\n');
}

const raw = Buffer.concat(chunks);
const gz = zlib.gzipSync(raw, { level: 9 });
fs.writeFileSync(path.join(ROOT, 'data', 'slab2.bin.gz'), gz);
fs.writeFileSync(path.join(ROOT, 'data', 'slab2.json'), JSON.stringify({
  source: 'Slab2 — Hayes, G.P., Moore, G.L., Portner, D.E., Hearne, M., Flamme, H., Furtney, M. & Smoczyk, G.M. (2018), Slab2, a comprehensive subduction zone geometry model, Science 362, 58-61',
  distribution: 'https://www.sciencebase.gov/catalog/item/' + PARENT,
  doi: '10.5066/F7PV6JNV',
  method: 'the published dep/dip/str grids at ' + (0.05 * STEP) + ' degrees, stored as one run per grid row',
  encoding: {
    depth: { type: 'int16le delta along the row', formula: 'depth_km = (sum of deltas from the run start) / ' + DEP_SCALE + ' - ' + DEP_OFF, note: 'depth BELOW SEA LEVEL, positive down (Slab2 publishes elevations, negative down)' },
    slab: { type: 'uint8', note: '1 = a slab node lives in this run cell, 0 = a hole in the run' },
    dip: { type: 'uint8', formula: 'deg = v - 1', absent: 0 },
    strike: { type: 'uint8', formula: 'deg = (v - 1) * 2', absent: 0 }
  },
  layout: 'per region at its own 4-aligned offset: ny row headers (x0 uint16le, n uint16le), then four parallel planes over the span run cells IN THIS ORDER - int16le depth deltas, uint8 presence, uint8 dip, uint8 strike - then zero padding to a multiple of 4',
  regions, regionCount: regions.length,
  slabNodes: nodes, runCells: runNodes, boundingRectCells: rectCells,
  slabNodesWithoutPublishedDip: noDip, slabNodesWithoutPublishedStrike: noStr,
  runCellsWithDipButNoDepth: dipNoDepth,
  runFill: +(nodes / runNodes).toFixed(3), rectFill: +(nodes / rectCells).toFixed(3),
  roundTripWorstDepthKm: +worstDep.toFixed(4), roundTripWorstRegion: worstAt,
  bytes: gz.length, bytesRaw: raw.length,
  built: new Date().toISOString()
}, null, 2) + '\n');
process.stdout.write('data/slab2.bin.gz  ' + (gz.length / 1024).toFixed(1) + ' kB (raw ' + (raw.length / 1048576).toFixed(2) + ' MB)\n');
process.stdout.write('  ' + regions.length + ' zones · ' + nodes + ' slab nodes in ' + runNodes
  + ' run cells (' + (100 * nodes / rectCells).toFixed(0) + ' % of the bounding rectangles) · worst round-trip '
  + worstDep.toFixed(4) + ' km (' + worstAt + ')\n');
if (worstDep > 0.5) { console.error('the shipped grid does not reproduce Slab2 to 0.5 km — refusing to ship it'); process.exit(1); }
process.stdout.write('  ' + noDip + ' slab nodes have no published dip, ' + noStr + ' no published strike\n');
