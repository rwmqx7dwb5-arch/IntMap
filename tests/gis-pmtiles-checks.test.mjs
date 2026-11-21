/* ============================================================================
 *  GIS · PMTILES — js/gis-pmtiles.js reads an archive WITHOUT the rest of the file
 * ----------------------------------------------------------------------------
 *  ① the tile id is the spec's Hilbert order: a bijection per zoom, and consecutive ids are neighbours
 *  ② a window asks for the tiles that cover it and no others — counted in range requests over a
 *    supply that refuses to hand over more than it was asked
 *  ③ a tile is found through a LEAF directory (the deeper path), not only the root
 *  ④ points, lines, polygons-with-a-hole come back at the right longitude/latitude
 *  ⑤ every refusal has its own code, and the set of codes the module can return is the set it lists
 *
 *  ⚠ THE FIXTURES ARE ENCODED HERE AND NOTHING BINARY IS COMMITTED: a tile writer (protobuf by hand),
 *  and an archive writer following the published spec. A reader tested against a writer written by
 *  the same hand can agree with it about a wrong rule, so ① is checked against the properties of
 *  the curve itself (bijection, adjacency) and the known first ids (spec: z1 order is 1,2,3,4 =
 *  (0,0),(0,1),(1,1),(1,0)), not against the writer.
 * ==========================================================================*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { makeGisPmtiles } from '../js/gis-pmtiles.js';

const P = makeGisPmtiles();

/* ── protobuf / MVT writer ──────────────────────────────────────────────────────────────────── */
const vi = (n) => { const o = []; while (n >= 128) { o.push((n % 128) | 128); n = Math.floor(n / 128); } o.push(n); return o; };
const tag = (f, w) => vi(f * 8 + w);
const lenField = (f, bytes) => [...tag(f, 2), ...vi(bytes.length), ...bytes];
const str = (s) => [...Buffer.from(s, 'utf8')];
const zz = (n) => (n < 0 ? -n * 2 - 1 : n * 2);
function geom(rings, closed) { // rings: arrays of [x,y] tile units
  const out = []; let cx = 0, cy = 0;
  for (const r of rings) {
    out.push(1 | (1 << 3)); out.push(zz(r[0][0] - cx), zz(r[0][1] - cy)); cx = r[0][0]; cy = r[0][1];
    const rest = r.slice(1);
    if (rest.length) { out.push(2 | (rest.length << 3)); for (const p of rest) { out.push(zz(p[0] - cx), zz(p[1] - cy)); cx = p[0]; cy = p[1]; } }
    if (closed) out.push(7 | (1 << 3));
  }
  return out;
}
function mvt(layerName, feats, extent = 4096) {
  const keys = [], vals = [];
  const feat = (f) => {
    const tags = [];
    for (const [k, v] of Object.entries(f.props || {})) {
      let ki = keys.indexOf(k); if (ki < 0) { ki = keys.length; keys.push(k); }
      const val = typeof v === 'string' ? lenField(1, str(v)) : (Number.isInteger(v) ? [...tag(5, 0), ...vi(v)] : [...tag(3, 1), ...Buffer.from(new Float64Array([v]).buffer)]);
      let vj = vals.findIndex((x) => Buffer.compare(Buffer.from(x), Buffer.from(val)) === 0); if (vj < 0) { vj = vals.length; vals.push(val); }
      tags.push(ki, vj);
    }
    const g = geom(f.rings, f.type === 3);
    return [...(tags.length ? lenField(2, tags.flatMap(vi)) : []), ...tag(3, 0), ...vi(f.type), ...lenField(4, g.flatMap(vi))];
  };
  const layer = [...lenField(1, str(layerName)), ...feats.flatMap((f) => lenField(2, feat(f))),
    ...keys.flatMap((k) => lenField(3, str(k))), ...vals.flatMap((v) => lenField(4, v)), ...tag(5, 0), ...vi(extent), ...tag(15, 0), ...vi(2)];
  return Uint8Array.from(lenField(3, layer));
}

/* ── archive writer (spec v3) ───────────────────────────────────────────────────────────────── */
function dirBytes(entries) { // entries: {tileId, offset, length, run}
  const o = [...vi(entries.length)];
  let last = 0; for (const e of entries) { o.push(...vi(e.tileId - last)); last = e.tileId; }
  for (const e of entries) o.push(...vi(e.run));
  for (const e of entries) o.push(...vi(e.length));
  entries.forEach((e, i) => { o.push(...vi(i > 0 && e.offset === entries[i - 1].offset + entries[i - 1].length ? 0 : e.offset + 1)); });
  return Uint8Array.from(o);
}
function archive({ tiles, zmin, zmax, bounds, leaf = false, tileCompression = 2, internalCompression = 2, type = 1 }) {
  // tiles: [{z,x,y,bytes}] ; stored gzip'd, ordered by tile id
  const sorted = tiles.map((t) => ({ id: P.zxyToTileId(t.z, t.x, t.y), data: tileCompression === 2 ? gzipSync(t.bytes) : t.bytes })).sort((a, b) => a.id - b.id);
  let off = 0; const entries = [];
  const blob = []; for (const t of sorted) { entries.push({ tileId: t.id, offset: off, length: t.data.length, run: 1 }); blob.push(t.data); off += t.data.length; }
  const zip = (b) => (internalCompression === 2 ? gzipSync(b) : Buffer.from(b));
  let root, leafBytes = Buffer.alloc(0);
  if (leaf) {
    // everything goes into ONE leaf directory; the root holds a pointer to it (run 0)
    leafBytes = zip(dirBytes(entries));
    root = zip(dirBytes([{ tileId: entries[0].tileId, offset: 0, length: leafBytes.length, run: 0 }]));
  } else root = zip(dirBytes(entries));
  const meta = zip(Buffer.from(JSON.stringify({ name: 'fixture' })));
  const tileData = Buffer.concat(blob.map((b) => Buffer.from(b)));
  const rootOff = 127, metaOff = rootOff + root.length, leafOff = metaOff + meta.length, dataOff = leafOff + leafBytes.length;
  const h = Buffer.alloc(127); h.write('PMTiles', 0, 'latin1'); h[7] = 3;
  const w64 = (o, v) => { h.writeUInt32LE(v % 4294967296, o); h.writeUInt32LE(Math.floor(v / 4294967296), o + 4); };
  w64(8, rootOff); w64(16, root.length); w64(24, metaOff); w64(32, meta.length); w64(40, leafOff); w64(48, leafBytes.length);
  w64(56, dataOff); w64(64, tileData.length); w64(72, tiles.length); w64(80, tiles.length); w64(88, tiles.length);
  h[96] = 1; h[97] = internalCompression; h[98] = tileCompression; h[99] = type; h[100] = zmin; h[101] = zmax;
  h.writeInt32LE(Math.round(bounds[0] * 1e7), 102); h.writeInt32LE(Math.round(bounds[1] * 1e7), 106);
  h.writeInt32LE(Math.round(bounds[2] * 1e7), 110); h.writeInt32LE(Math.round(bounds[3] * 1e7), 114);
  return new Uint8Array(Buffer.concat([h, root, meta, leafBytes, tileData]));
}
/* a supply that answers ranges and counts what it was asked */
function supplyOf(u) {
  const s = { size: u.length, requests: 0, bytesAsked: 0, log: [], async read(off, len) { s.requests++; s.bytesAsked += len; s.log.push([off, len]); return u.subarray(off, off + len); } };
  return s;
}

/* a 4096-extent tile whose features are easy to place: the whole tile square, a point in its middle */
const square = (a, b) => [[a, a], [b, a], [b, b], [a, b], [a, a]];
const fixtureTile = (name) => mvt(name, [
  { type: 3, rings: [square(0, 4096), [[1000, 1000], [1000, 3000], [3000, 3000], [3000, 1000], [1000, 1000]]], props: { name: 'Ring', pop: 12, share: 0.5 } },
  { type: 1, rings: [[[2048, 2048]]], props: { name: 'Mid' } },
  { type: 2, rings: [[[0, 2048], [4096, 2048]]], props: { name: 'Line' } },
]);

/* tiles that do not gzip to nothing: scattered points, so a 16-tile archive is bigger than the first block the reader takes */
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const padded = (name) => mvt(name, Array.from({ length: 900 }, (_, i) => ({ type: 1, rings: [[[Math.floor(rnd() * 4096), Math.floor(rnd() * 4096)]]], props: { name: 'p' + i } })));

test('① tile ids are the Hilbert order: bijection per zoom, neighbours in sequence, known first ids', () => {
  assert.deepEqual([[0, 0, 0], [1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]].map((a) => P.zxyToTileId(...a)), [0, 1, 2, 3, 4]);
  for (const z of [1, 2, 3, 4]) {
    const n = 1 << z, byId = new Map();
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) byId.set(P.zxyToTileId(z, x, y), [x, y]);
    const base = (4 ** z - 1) / 3;
    assert.equal(byId.size, n * n, 'z' + z + ' not injective');
    for (let i = 0; i < n * n; i++) assert.ok(byId.has(base + i), 'z' + z + ' id ' + (base + i) + ' missing — not onto');
    for (let i = 1; i < n * n; i++) {
      const [ax, ay] = byId.get(base + i - 1), [bx, by] = byId.get(base + i);
      assert.equal(Math.abs(ax - bx) + Math.abs(ay - by), 1, 'z' + z + ' ids ' + (base + i - 1) + ',' + (base + i) + ' are not adjacent');
    }
  }
});

test('② a window reads only the tiles that cover it — measured in bytes asked of the supply', async () => {
  // 16 tiles at z2, each ~1 KB of padding-free content; ask for ONE of them
  const tiles = []; for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) tiles.push({ z: 2, x, y, bytes: padded('L' + x + y) });
  const file = archive({ tiles, zmin: 2, zmax: 2, bounds: [-180, -85, 180, 85] });
  const full = supplyOf(file);
  const r = await P.readSource(full, { bbox: [-179, 10, -91, 84], zoom: 2 }); // x=0, y=0..? (lat 10..84 → y 0..1)
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.stats.tilesWanted, 2);
  assert.equal(r.stats.tiles, 2);
  assert.ok(file.length > 3 * 16384, 'fixture too small to prove anything: ' + file.length);
  assert.ok(full.bytesAsked < file.length / 2, `asked ${full.bytesAsked} of ${file.length} bytes`);
  assert.ok(r.stats.clipped === true && r.stats.zoom === 2);
});

test('③ a tile behind a LEAF directory is found, and the answer is the same as through the root', async () => {
  const tiles = []; for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) tiles.push({ z: 1, x, y, bytes: fixtureTile('t') });
  const a = await P.readBytes(archive({ tiles, zmin: 1, zmax: 1, bounds: [-180, -85, 180, 85] }), { zoom: 1 });
  const b = await P.readBytes(archive({ tiles, zmin: 1, zmax: 1, bounds: [-180, -85, 180, 85], leaf: true }), { zoom: 1 });
  assert.ok(a.ok && b.ok, JSON.stringify([a, b]));
  assert.deepEqual(b.fc, a.fc);
  assert.equal(a.stats.tiles, 4);
});

test('④ geometry lands at the right place: the tile centre, the hole is a hole, properties keep their types', async () => {
  const file = archive({ tiles: [{ z: 1, x: 1, y: 0, bytes: fixtureTile('places') }], zmin: 1, zmax: 1, bounds: [0, 0, 180, 85], tileCompression: 1, internalCompression: 1 });
  const r = await P.readBytes(file, { zoom: 1 });
  assert.ok(r.ok, JSON.stringify(r));
  const byName = Object.fromEntries(r.fc.features.map((f) => [f.properties.name, f]));
  // z1 x=1 y=0 is lon 0..180, lat ~0..85.05; the middle of it:
  const mid = byName.Mid.geometry.coordinates;
  assert.ok(Math.abs(mid[0] - 90) < 1e-9, 'lon ' + mid[0]);
  const expectLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * 0.25))) * 180 / Math.PI;
  assert.ok(Math.abs(mid[1] - expectLat) < 1e-9, 'lat ' + mid[1]);
  assert.equal(byName.Ring.geometry.type, 'Polygon');
  assert.equal(byName.Ring.geometry.coordinates.length, 2, 'the hole must stay a hole, not a second polygon');
  assert.equal(byName.Ring.properties.pop, 12);
  assert.equal(byName.Ring.properties.share, 0.5);
  assert.equal(byName.Ring.properties._layer, 'places');
  assert.equal(byName.Line.geometry.type, 'LineString');
});

test('⑤ a zoom is chosen by the tile budget, and an over-budget window is refused with the count', async () => {
  const tiles = []; for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) tiles.push({ z: 2, x, y, bytes: fixtureTile('t') });
  const file = archive({ tiles, zmin: 0, zmax: 2, bounds: [-180, -85, 180, 85] });
  const r = await P.readBytes(file, { maxTiles: 4 });
  assert.ok(r.ok && r.stats.zoom === 1 && r.stats.zoomStated === false, JSON.stringify(r.stats));
  const big = await P.readBytes(file, { zoom: 2, maxTiles: 4 });
  assert.equal(big.why, 'pmtiles-too-many-tiles');
  assert.equal(big.detail.tiles, 16);
});

test('⑥ refusals carry their own code', async () => {
  const good = archive({ tiles: [{ z: 0, x: 0, y: 0, bytes: fixtureTile('t') }], zmin: 0, zmax: 0, bounds: [-180, -85, 180, 85] });
  const bump = (i, v) => { const c = Uint8Array.from(good); c[i] = v; return c; };
  const why = async (bytes, o) => (await P.readBytes(bytes, o)).why;
  assert.equal(await why(new Uint8Array(200)), 'pmtiles-not-pmtiles');
  assert.equal(await why(bump(7, 2)), 'pmtiles-version');
  assert.equal(await why(good.subarray(0, 100)), 'pmtiles-truncated');
  assert.equal(await why(good.subarray(0, good.length - 5)), 'pmtiles-truncated');
  assert.equal(await why(bump(97, 3)), 'pmtiles-compression');
  assert.equal(await why(bump(98, 4)), 'pmtiles-compression');
  assert.equal(await why(bump(99, 9)), 'pmtiles-tile-type');
  assert.equal(await why(bump(99, 2)), 'pmtiles-raster');
  assert.equal(await why(good, { zoom: 5 }), 'pmtiles-zoom');
  assert.equal(await why(good, { bbox: [10, 10, 5, 20] }), 'pmtiles-bbox');
  const corruptTile = archive({ tiles: [{ z: 0, x: 0, y: 0, bytes: Uint8Array.from([0x1a, 0x7f, 1, 2]) }], zmin: 0, zmax: 0, bounds: [-180, -85, 180, 85] });
  assert.equal(await why(corruptTile), 'pmtiles-mvt');
});

test('⑦ every code the module can return is one it lists, and each is worded in js/map-ui.js', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/gis-pmtiles.js', import.meta.url), 'utf8');
  const used = new Set([...src.matchAll(/(?:fail|bad)\('(pmtiles-[a-z-]+)'/g)].map((m) => m[1]));
  const listed = new Set(P.refusals());
  assert.deepEqual([...used].sort(), [...listed].sort());
  const ui = readFileSync(new URL('../js/map-ui.js', import.meta.url), 'utf8');
  for (const c of listed) assert.ok(ui.includes("'" + c + "'"), c + ' has no sentence in js/map-ui.js');
});
