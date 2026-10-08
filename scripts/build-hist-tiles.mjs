#!/usr/bin/env node
/* ============================================================================
 *  IntMap · the historical records as TIME-CUT TILES — dist/data/hvt/   (hist-vector-tiles)
 * ----------------------------------------------------------------------------
 *  The ring-pooled records under data/ (data/cshapes.js, data/hist-borders.js, data/hist-eras.js,
 *  data/hist-admin{1,2,3}.js and the two gap records spliced into the first tier) are 1-41 MB each,
 *  and the first travel into the past fetched them WHOLE — although one instant needs only the
 *  records in force on that day. MEASURED 2026-10-01 (dev-notes/2026-10-01-hist-vector-tiles.md):
 *  1900-06-15 needs 3.6 of cshapes' 12.9 MB of rings and 5.1 of hist-admin1's 39.8 MB.
 *
 *  This cuts every record into
 *    · an INDEX  (`<name>.idx.json`) — the head js/hist-bundles.js would have answered `open` with,
 *      every row's [start, end] as sortable ints, the chunk each row lives in, the chunks each row's
 *      rings live in, each era sheet's chunks, and every chunk's byte range;
 *    · an ARCHIVE (`<name>.jsonl.gz`) — independent gzip members, one JSON line each, so ONE member is
 *      readable on its own from a Range request, and the whole file is still an ordinary gzip of
 *      JSON Lines;
 *    · (place-through-time) a BOX FILE (`<name>.box.json`) — one outward-rounded box per row and per era-sheet
 *      polygon, and the ring chunks each sheet polygon names, so «which rows of all time hold this point»
 *      (the door's `contains`) reads only the chunks of the rows under the point. Proven like the rest
 *      (`verifyBoxes`: every coordinate inside its box, every ring in a listed chunk). See `boxRecord`.
 *  The door reads the index, asks its own job which chunks an instant needs, reads exactly those
 *  byte ranges and hands them to the same job — so every reader downstream receives the SAME rows
 *  and the SAME rings, by the same indices, that the whole file gave it.
 *
 *  ══ WHY THE SAME CODE BUILDS IT AND READS IT ══════════════════════════════════════════════════
 *  The head, the spans and the splice of the gap records are not re-implemented here: this file
 *  evaluates js/hist-bundles.js and asks ITS job (`open` for the head and spans, `openTiled` + `feed`
 *  to read the tiles back). A builder that wrote its own «head» would be a second copy of the rule
 *  that could disagree with the reader; this one cannot. The tile names come from the door's
 *  `tilesOf`, for the same reason.
 *
 *  ══ ORDER INSIDE THE ARCHIVE ══════════════════════════════════════════════════════════════════
 *  A chunk is read whole, so what shares a chunk should be needed together. Rows and rings are
 *  ordered by WHEN they are in force — the level of a segment tree (⌈log2 of the span in years⌉) and
 *  the bucket its midpoint falls in at that level, so a record in force for a decade sits beside
 *  other decade-long records of the same decade and a record in force for a millennium beside other
 *  millennia — then by start and end, then by WHERE (a 22.5° cell of its centroid), then by index.
 *  An instant then needs a few runs of adjacent chunks per level, which the door reads as a few
 *  Range requests. (`orderKey` has the measurement that chose this over the alternatives.)
 *
 *  ══ COORDINATES ═══════════════════════════════════════════════════════════════════════════════
 *  A ring is stored as integer deltas at the record's decimal scale (10^d, d the most decimals any
 *  coordinate of that record is written with) — but ONLY when every coordinate of that ring comes back
 *  as the identical double (`Object.is`); IEEE division is correctly rounded, so int/10^d IS the
 *  decimal the record wrote. Any ring that does not (a third ordinate, an exponent, a -0) is kept as
 *  written. MEASURED: no ring of the eight records needs that, and the delta form halves the gzip.
 *
 *  ══ EVERY BUILD PROVES ITS OUTPUT ═════════════════════════════════════════════════════════════
 *  After cutting, the tiles are read back THROUGH THE DOOR'S JOB (openTiled, then every chunk fed)
 *  and every row, ring, date and era sheet is compared with the record; a difference throws and the
 *  build fails. So the shipped tiles are the record, not a likeness of it.
 *
 *  ⚠ The records stay the source and stay shipped: the gates (check:cshapes, check:histborders,
 *  check:histadmin, check:histeras, check:histnames, check:wars, check:histfidelity,
 *  check:bordercoast) judge THEM, and the door falls back to the whole file when a server has no
 *  tiles (`npm run dev` serves the repository, where nothing is cut).
 *
 *  usage:  node scripts/build-hist-tiles.mjs [--out <dir>] [--check] [--no-cache]
 *          (the build runs it into dist/data/hvt — vite.config.js `histTiles()`)
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync, readdirSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { discoverBundles } from './build-border-coast.mjs';
import { storeRoot } from './data-assets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOOR = join(ROOT, 'js', 'hist-bundles.js');

/* ⚠ CHUNK_BYTES — the size a chunk is closed at, in bytes of its JSON before gzip (a single row or ring
   larger than this is a chunk of its own). OBSERVED 2026-10-01 on the eight records
   (dev-notes/2026-10-01-hist-vector-tiles.md): rings at 64 kB gzip to ~20 kB members — a few round
   trips' worth on a phone, small enough that an instant over-reads little at the edges of what it
   needs, large enough that 1900 is tens of requests rather than hundreds. Rows are smaller and far
   fewer bytes in all, so they close at a quarter of it. LAPSES if the door's GAP_BYTES or PARALLEL
   change, or the records' sizes change by an order of magnitude. */
const CHUNK_BYTES = { rings: 64 * 1024, rows: 16 * 1024 };

/* the door, evaluated as the page evaluates it (a classic script that sets window.IntMapHistBundles) */
export function loadDoor() {
  const win = {};
  vm.runInNewContext(readFileSync(DOOR, 'utf8'), { window: win, URL, TextDecoder, Blob, Response, DecompressionStream, Promise, Uint8Array, WeakMap, Map, Set, console }, { filename: DOOR });
  return win.IntMapHistBundles;
}

const yearOf = (k) => Math.floor(k / 10000);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/* the decimals a number is written with (JSON.stringify writes the shortest round-trip form) */
function decimalsOf(v) {
  const s = String(v);
  if (/e/i.test(s)) return Infinity;
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}
function encodeRing(ring, sc) {
  if (!Array.isArray(ring)) return null;
  const out = new Array(ring.length * 2);
  let px = 0, py = 0;
  for (let k = 0; k < ring.length; k++) {
    const c = ring[k];
    if (!Array.isArray(c) || c.length !== 2) return null;
    const X = Math.round(c[0] * sc), Y = Math.round(c[1] * sc);
    if (!Object.is(X / sc, c[0]) || !Object.is(Y / sc, c[1])) return null;
    out[2 * k] = X - px; out[2 * k + 1] = Y - py; px = X; py = Y;
  }
  return out;
}
/* segment-tree key of a [s, e] span in years: level, bucket of the midpoint at that level */
function timeKey(s, e) {
  if (!isFinite(s) || !isFinite(e)) return [99, 0];
  const L = Math.max(0, Math.ceil(Math.log2(Math.max(1, e - s + 1))));
  return [L, Math.floor((s + e) / 2 / 2 ** L)];
}
/* the archive order: segment level and bucket, then start and end, then place. MEASURED 2026-10-01 against
   four alternatives (dev-notes/2026-10-01-hist-vector-tiles.md): level/bucket then PLACE read 13.0 MB of
   hist-admin1 over the eight check years, pure (start, end) 19.1 MB, (end, start) 13.4 MB, and this
   8.9 MB — within a bucket, records that start together are needed together. */
export function orderKey(s, e, cell, i) { const t = timeKey(s, e); return [t[0], t[1], s, e, cell, i]; }
function cellOf(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const c of r || []) {
    if (!Array.isArray(c)) continue;
    if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1];
  }
  if (!isFinite(x0)) return 0;
  const cx = Math.min(15, Math.max(0, Math.floor(((x0 + x1) / 2 + 180) / 22.5)));
  const cy = Math.min(7, Math.max(0, Math.floor(((y0 + y1) / 2 + 90) / 22.5)));
  return cy * 16 + cx;
}
const byKey = (a, b) => { for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i]; return 0; };

/* ── one record → { index, archive } ─────────────────────────────────────────────────────────── */
export async function tileRecord(door, { file, global, bytes }, chunkBytes = CHUNK_BYTES, keyOf = orderKey) {
  const S = {};
  const head = await door.histJob(S, { op: 'open', global, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, () => {});
  const B = S[global], d = B.d, span = B.span;
  const feats = Array.isArray(d.feats) ? d.feats : [];
  const rings = d.rings;

  /* the door decodes a span back into Y, M, D (`partsOf`) for an inclusive end; that is exact only for
     a month and a day of two digits, so a record that writes anything else is refused, not rounded */
  for (let i = 0; i < feats.length; i++) {
    const f = feats[i];
    for (const j of [3, 4, 6, 7]) if (!Number.isInteger(f[j]) || f[j] < 0 || f[j] > 99) throw new Error(`${file}: row ${i} column ${j} is ${JSON.stringify(f[j])} — the span cannot be decoded exactly`);
    for (const j of [2, 5]) if (!Number.isInteger(f[j])) throw new Error(`${file}: row ${i} column ${j} is not an integer year`);
  }

  let dec = 0;
  for (const r of rings) for (const c of r || []) for (const v of (Array.isArray(c) ? c : [])) { const k = decimalsOf(v); if (k !== Infinity && k > dec) dec = k; }
  const scale = 10 ** Math.min(dec, 9);

  /* when each ring is needed: the union of the spans of the rows (or the era sheets) that name it */
  const rs = new Float64Array(rings.length).fill(Infinity), re = new Float64Array(rings.length).fill(-Infinity);
  const touch = (ri, s, e) => { if (s < rs[ri]) rs[ri] = s; if (e > re[ri]) re[ri] = e; };
  for (let i = 0; i < feats.length; i++) {
    const s = yearOf(span[2 * i]), e = yearOf(span[2 * i + 1]);
    for (const poly of feats[i][8] || []) for (const ri of poly) touch(ri, s, e);
  }
  const snaps = Array.isArray(d.snaps) ? d.snaps : [];
  snaps.forEach((sn) => {
    for (const x of sn.feats || []) for (const poly of x[2] || []) for (const ri of poly) touch(ri, sn.y, sn.y);
    /* a sheet's `blank` is a list of polygons, each a list of rings (one level deeper than a row's column 8) */
    for (const ps of sn.blank || []) for (const poly of ps) for (const ri of poly) touch(ri, sn.y, sn.y);
  });

  /* ⚠ AN OPEN END IS NOT A LONG SPAN. OpenHistoricalMap's «still in force» is written 9999-12-31, which
     made every unit created after 1800 a ten-millennium span in one giant bucket beside units that ended
     in 1810. Any end past the record's LAST START orders the same — from that year on, the set in force
     only shrinks — so ends are clamped there for ordering (never in the data). The horizon is the
     record's, not a date chosen here. */
  let horizon = -Infinity;
  for (let i = 0; i < feats.length; i++) horizon = Math.max(horizon, yearOf(span[2 * i]));
  for (const sn of snaps) horizon = Math.max(horizon, sn.y);
  const clampEnd = (e) => Math.min(e, horizon + 1);

  /* ── cut ── */
  const members = [];   /* { obj } in archive order */
  const close = (obj) => { obj.c = members.length; members.push(obj); return obj.c; };

  /* rows, with the dates the door ships beside them (`d.dates[row[10]]`) */
  const rowChunk = new Array(feats.length);
  const rowOrder = feats.map((f, i) => {
    return { i, k: keyOf(yearOf(span[2 * i]), clampEnd(yearOf(span[2 * i + 1])), cellOf((f[8] || []).flat().map((ri) => rings[ri])), i) };
  }).sort(byKey);
  let cur = null, size = 0;
  const flushRows = () => { if (cur) { const c = close(cur); for (const [i] of cur.f) rowChunk[i] = c; } cur = null; size = 0; };
  for (const { i } of rowOrder) {
    const row = feats[i], dt = (d.dates && row[10] != null && d.dates[row[10]] !== undefined) ? [row[10], d.dates[row[10]]] : null;
    const n = JSON.stringify(row).length + (dt ? JSON.stringify(dt).length : 0) + 8;
    if (cur && size + n > chunkBytes.rows) flushRows();
    if (!cur) cur = { f: [] };
    cur.f.push([i, row]);
    if (dt) (cur.d || (cur.d = [])).push(dt);
    size += n;
  }
  flushRows();

  /* era sheets: one member each — a sheet is asked for whole */
  const sheetChunk = snaps.map((sn, si) => close({ s: [[si, sn.feats === undefined ? null : sn.feats, sn.blank === undefined ? null : sn.blank, sn.blankPrecision === undefined ? null : sn.blankPrecision]] }));

  /* rings */
  const ringChunk = new Int32Array(rings.length).fill(-1);
  let kept = 0, verbatim = 0;
  const ringOrder = rings.map((r, ri) => {
    return { ri, k: keyOf(rs[ri], clampEnd(re[ri]), cellOf([r]), ri) };
  }).sort(byKey);
  cur = null; size = 0;
  const flushRings = () => { if (cur) { const c = close(cur); for (const [ri] of (cur.r || []).concat(cur.j || [])) ringChunk[ri] = c; } cur = null; size = 0; };
  for (const { ri } of ringOrder) {
    const enc = encodeRing(rings[ri], scale);
    const entry = enc ? [ri, enc] : [ri, rings[ri]];
    const n = JSON.stringify(entry).length + 1;
    if (cur && size + n > chunkBytes.rings) flushRings();
    if (!cur) cur = {};
    if (enc) { (cur.r || (cur.r = [])).push(entry); kept++; } else { (cur.j || (cur.j = [])).push(entry); verbatim++; }
    size += n;
  }
  flushRings();

  const ringsOf = (polys) => { const set = new Set(); for (const poly of polys || []) for (const ri of poly) set.add(ringChunk[ri]); return [...set].sort((a, b) => a - b); };
  const rowRings = feats.map((f) => ringsOf(f[8]));
  const snapChunks = snaps.map((sn, si) => {
    const set = new Set(ringsOf([...(sn.feats || []).flatMap((x) => x[2] || []), ...(sn.blank || []).flat()]));
    return [sheetChunk[si], ...[...set].sort((a, b) => a - b)];
  });

  /* ── write the archive: one gzip member per chunk, each one JSON line ── */
  const bufs = [], chunks = [];
  let off = 0;
  for (const obj of members) {
    const z = gzipSync(Buffer.from(JSON.stringify(obj) + '\n', 'utf8'), { level: 9 });
    z[9] = 255;   /* the gzip header's OS byte, «unknown» — the bytes must not depend on the machine that cut them */
    chunks.push([off, z.length]); bufs.push(z); off += z.length;
  }
  const archive = Buffer.concat(bufs);
  const idxRel = door.tilesOf('data/' + file);
  const archiveName = basename(idxRel).replace(/\.idx\.json$/, '.jsonl.gz');
  const index = {
    hvt: 1,
    global,
    source: { file: 'data/' + file, bytes: bytes.length, sha256: sha256(bytes) },
    builder: 'scripts/build-hist-tiles.mjs',
    archive: { file: archiveName, bytes: archive.length, members: members.length },
    head,
    scale,
    span,
    rowChunk,
    rowRings,
    snapChunks: snaps.length ? snapChunks : undefined,
    chunks,
    stats: { rows: feats.length, rings: rings.length, ringsAsDeltas: kept, ringsAsWritten: verbatim, sheets: snaps.length },
  };
  const boxes = boxRecord(door, file, global, feats, rings, snaps, ringChunk);
  return { index, archive, idxRel, archiveName, boxes };
}

/* ══ (place-through-time) THE BOX FILE — WHERE EACH ROW IS, SO ONE POINT NEED NOT READ THE WHOLE RECORD ═══════════
   «Which rows of all time hold this point» (js/hist-bundles.js `contains`) asks EVERY row, and a tiled record's
   rings are not on the thread until their chunks are read. The index orders chunks by time, so it cannot say which
   rows lie under a point; this file can: one box per row and per era-sheet polygon, as integers at BOX_SCALE,
   rounded OUTWARD and widened by one unit more, so floating-point rounding can only make a box larger than its row,
   never smaller (`verifyBoxes` proves every coordinate inside). A sheet polygon also lists the ring chunks it names,
   because the index lists a sheet's chunks only whole.
   ⚠ BOX_SCALE = 100 (0.01°, about 1.1 km): the prefilter only has to separate rows that are far apart — the exact
   test on the rings decides — and two decimals keep the largest file (Cliopatria's 12,868 rows) a few hundred kB.
   MEASURED on the build in dev-notes/2026-10-07-place-through-time.md. LAPSES if a record's rows become so fine
   that thousands of boxes overlap at 1 km (then a finer scale saves chunk reads); nothing else reads this number. */
const BOX_SCALE = 100;
/* the record as the door parses it: `window.<GLOBAL>=` and strict JSON */
function recordOf(bytes) { const t = Buffer.from(bytes).toString('utf8'), i = t.indexOf('='); return JSON.parse(t.slice(i + 1).replace(/;\s*$/, '')); }
function boxRecord(door, file, global, feats, rings, snaps, ringChunk) {
  const boxOf = (ringIds) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const ri of ringIds) for (const c of rings[ri] || []) {
      if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1];
    }
    /* a row with no coordinate holds no point: a box no point is in */
    if (!isFinite(x0)) return [1, 1, -1, -1];
    return [Math.floor(x0 * BOX_SCALE) - 1, Math.floor(y0 * BOX_SCALE) - 1, Math.ceil(x1 * BOX_SCALE) + 1, Math.ceil(y1 * BOX_SCALE) + 1];
  };
  const chunksOf = (ringIds) => [...new Set(ringIds.map((ri) => ringChunk[ri]))].sort((a, b) => a - b);
  const rows = [];
  for (const f of feats) rows.push(...boxOf((f[8] || []).flat()));
  const sheets = snaps.map((sn) => {
    const f = [], fc = [], b = [], bc = [];
    for (const x of sn.feats || []) { const ids = (x[2] || []).flat(); f.push(...boxOf(ids)); fc.push(chunksOf(ids)); }
    for (const ps of sn.blank || []) { const ids = ps.flat(); b.push(...boxOf(ids)); bc.push(chunksOf(ids)); }
    return { f, fc, b, bc };
  });
  const out = { hvt: 1, global, source: 'data/' + file, builder: 'scripts/build-hist-tiles.mjs', scale: BOX_SCALE, rows };
  if (snaps.length) out.sheets = sheets;
  return { rel: door.boxesOf('data/' + file), name: basename(door.boxesOf('data/' + file)), body: out };
}
/* every coordinate of every row and sheet polygon lies inside its box, and every ring a sheet polygon names is in a
   chunk its list names — a box that misses a coordinate would drop a row that holds a point, silently */
export function verifyBoxes(tiles, record) {
  const { index, archive, boxes } = tiles, B = boxes.body, s = B.scale, file = index.source.file;
  const inside = (j, flat, ring, what) => {
    for (const c of ring || []) if (!(c[0] >= flat[j] / s && c[1] >= flat[j + 1] / s && c[0] <= flat[j + 2] / s && c[1] <= flat[j + 3] / s)) throw new Error(`${file}: ${what} has [${c}] outside its box`);
  };
  const feats = record.feats || [], rings = record.rings;
  if (B.rows.length !== 4 * feats.length) throw new Error(`${file}: the box file has ${B.rows.length / 4} rows for ${feats.length}`);
  feats.forEach((f, i) => { for (const ri of (f[8] || []).flat()) inside(4 * i, B.rows, rings[ri], `row ${i} ring ${ri}`); });
  const where = new Map();
  index.chunks.forEach(([o, n], c) => {
    const obj = JSON.parse(gunzipSync(archive.subarray(o, o + n)).toString('utf8'));
    for (const [ri] of (obj.r || []).concat(obj.j || [])) where.set(ri, c);
  });
  (record.snaps || []).forEach((sn, si) => {
    const S = B.sheets[si];
    (sn.feats || []).forEach((x, k) => { for (const ri of (x[2] || []).flat()) { inside(4 * k, S.f, rings[ri], `sheet ${sn.y} feature ${k}`); if (!S.fc[k].includes(where.get(ri))) throw new Error(`${file}: sheet ${sn.y} feature ${k} ring ${ri} is in a chunk its list does not name`); } });
    (sn.blank || []).forEach((ps, k) => { for (const ri of ps.flat()) { inside(4 * k, S.b, rings[ri], `sheet ${sn.y} blank ${k}`); if (!S.bc[k].includes(where.get(ri))) throw new Error(`${file}: sheet ${sn.y} blank ${k} ring ${ri} is in a chunk its list does not name`); } });
  });
  return true;
}

/* ── read the tiles back through the door's job and compare with the record ──────────────────── */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function sameRing(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) {
    const p = a[k], q = b[k];
    if (!Array.isArray(p) || !Array.isArray(q) || p.length !== q.length) return false;
    for (let j = 0; j < p.length; j++) if (!Object.is(p[j], q[j])) return false;
  }
  return true;
}
export async function verifyRecord(door, tiles, bytes) {
  const { index, archive } = tiles, g = index.global;
  const W = {}, T = {};
  const headW = await door.histJob(W, { op: 'open', global: g, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, () => {});
  const headT = await door.histJob(T, { op: 'openTiled', global: g, dirs: [JSON.parse(JSON.stringify(index))] }, () => {});
  if (!same(headW, headT)) throw new Error(`${index.source.file}: the tiled head differs from the record's`);
  if (!same(W[g].span, T[g].span)) throw new Error(`${index.source.file}: the tiled spans differ from the record's`);
  const parts = index.chunks.map(([o, n], c) => ({ c, bytes: archive.buffer.slice(archive.byteOffset + o, archive.byteOffset + o + n) }));
  await door.histJob(T, { op: 'feed', global: g, parts }, () => {});
  const a = W[g].d, b = T[g].d;
  for (let i = 0; i < (a.feats || []).length; i++) if (!same(a.feats[i], b.feats[i])) throw new Error(`${index.source.file}: row ${i} does not come back`);
  for (let ri = 0; ri < a.rings.length; ri++) if (!sameRing(a.rings[ri], b.rings[ri])) throw new Error(`${index.source.file}: ring ${ri} does not come back exactly`);
  if (a.dates) {
    const want = {};
    for (const f of a.feats) if (f[10] != null && a.dates[f[10]] !== undefined) want[f[10]] = a.dates[f[10]];
    for (const k of Object.keys(want)) if (!same(want[k], b.dates[k])) throw new Error(`${index.source.file}: dates of ${k} do not come back`);
  }
  for (let si = 0; si < (a.snaps || []).length; si++) {
    const x = a.snaps[si], y = b.snaps[si];
    if (!same(x.feats || [], y.feats || []) || !same(x.blank || [], y.blank || []) || !same(x.blankPrecision || null, y.blankPrecision || null)) throw new Error(`${index.source.file}: era sheet ${x.y} does not come back`);
  }
  /* ⚠ AND THE INDEX SENDS THE DOOR TO THEM. Every chunk being right is not enough: the door reads only the
     chunks the index LISTS for a row or a sheet, so a ring listed nowhere would make that row's question
     fail at run time and fall back to the whole file — the same answer, so no comparison above can see it.
     (It happened: the era sheets' `blank` lists were read one level too shallow and listed `null`.) */
  const where = { row: new Map(), ring: new Map(), sheet: new Map() };
  index.chunks.forEach(([o, n], c) => {
    const obj = JSON.parse(gunzipSync(archive.subarray(o, o + n)).toString('utf8'));
    for (const [i] of obj.f || []) where.row.set(i, c);
    for (const [ri] of (obj.r || []).concat(obj.j || [])) where.ring.set(ri, c);
    for (const [si] of obj.s || []) where.sheet.set(si, c);
  });
  const covers = (list, c, what) => { if (!Array.isArray(list) || !list.every(Number.isInteger) || !list.includes(c)) throw new Error(`${index.source.file}: ${what} is in chunk ${c}, which its index entry ${JSON.stringify(list)} does not list`); };
  (a.feats || []).forEach((f, i) => {
    covers([index.rowChunk[i]], where.row.get(i), `row ${i}`);
    for (const poly of f[8] || []) for (const ri of poly) covers(index.rowRings[i], where.ring.get(ri), `ring ${ri} of row ${i}`);
  });
  (a.snaps || []).forEach((sn, si) => {
    const list = (index.snapChunks || [])[si];
    covers(list, where.sheet.get(si), `era sheet ${sn.y}`);
    for (const x of sn.feats || []) for (const poly of x[2] || []) for (const ri of poly) covers(list, where.ring.get(ri), `ring ${ri} of era sheet ${sn.y}`);
    for (const ps of sn.blank || []) for (const poly of ps) for (const ri of poly) covers(list, where.ring.get(ri), `blank ring ${ri} of era sheet ${sn.y}`);
  });
  return true;
}

/* ── every record under data/ ──────────────────────────────────────────────────────────────────
   The population is DISCOVERED (scripts/build-border-coast.mjs `discoverBundles`: a file that assigns
   one global carrying a pool of [lon, lat] rings), so a record added tomorrow is tiled the same day. */
export async function buildTiles({ dataDir = join(ROOT, 'data'), outDir, cache = true, log = console.log } = {}) {
  const door = loadDoor();
  const builderKey = sha256(Buffer.concat([readFileSync(fileURLToPath(import.meta.url)), readFileSync(DOOR)])).slice(0, 16);
  const cacheRoot = cache ? join(storeRoot(), 'hvt-cache') : null;
  if (outDir) { rmSync(outDir, { recursive: true, force: true }); mkdirSync(outDir, { recursive: true }); }
  const out = [];
  for (const rec of discoverBundles(dataDir)) {
    const bytes = readFileSync(join(dataDir, rec.file));
    const key = `${rec.global.replace(/^_+/, '')}-${sha256(bytes).slice(0, 16)}-${builderKey}`;
    const idxRel = door.tilesOf('data/' + rec.file);
    const idxName = basename(idxRel), arcName = idxName.replace(/\.idx\.json$/, '.jsonl.gz');
    const boxName = basename(door.boxesOf('data/' + rec.file));
    const hit = cacheRoot && existsSync(join(cacheRoot, key, idxName)) && existsSync(join(cacheRoot, key, arcName)) && existsSync(join(cacheRoot, key, boxName));
    let index, archive, boxes;
    const t0 = Date.now();
    if (hit) {
      index = JSON.parse(readFileSync(join(cacheRoot, key, idxName), 'utf8'));
      archive = readFileSync(join(cacheRoot, key, arcName));
      boxes = readFileSync(join(cacheRoot, key, boxName), 'utf8');
    } else {
      const t = await tileRecord(door, { file: rec.file, global: rec.global, bytes });
      await verifyRecord(door, t, bytes);
      verifyBoxes(t, recordOf(bytes));
      index = t.index; archive = t.archive; boxes = JSON.stringify(t.boxes.body);
      if (cacheRoot) {
        try {
          /* ⚠ (build-isolation) the store is ONE per machine and every worktree's build reads it, and a hit is
             «the three files exist». Written in place, a second build that looked while this one was writing
             could take a half-written archive for a hit and ship it, since a hit is read back unverified (not
             observed; the shape allows it). Each file is written beside its name and renamed onto it, so a
             name that exists is a complete file. */
          mkdirSync(join(cacheRoot, key), { recursive: true });
          for (const [name, body] of [[idxName, JSON.stringify(index)], [arcName, archive], [boxName, boxes]]) {
            const final = join(cacheRoot, key, name), part = `${final}.${process.pid}-${Date.now()}.part`;
            writeFileSync(part, body);
            try { renameSync(part, final); } catch (e) { rmSync(part, { force: true }); if (!existsSync(final)) throw e; /* another build put the same bytes there first */ }
          }
        } catch (e) { log(`  (cache not written: ${e.message})`); }
      }
    }
    if (outDir) {
      writeFileSync(join(outDir, idxName), JSON.stringify(index));
      writeFileSync(join(outDir, arcName), archive);
      writeFileSync(join(outDir, boxName), boxes);
    }
    out.push({ file: 'data/' + rec.file, global: rec.global, index: idxName, archive: arcName, boxes: boxName, boxBytes: boxes.length, indexBytes: JSON.stringify(index).length, archiveBytes: archive.length, chunks: index.chunks.length, cached: !!hit, ms: Date.now() - t0, stats: index.stats });
    log(`  ${rec.file} → hvt/${arcName}: ${index.chunks.length} chunks, ${(archive.length / 1e6).toFixed(2)} MB (index ${(JSON.stringify(index).length / 1e3).toFixed(0)} kB)${hit ? ', cached' : ''} ${Date.now() - t0} ms`);
  }
  return out;
}

if (process.argv[1] && join(process.argv[1]) === join(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const outDir = outAt >= 0 ? args[outAt + 1] : (args.includes('--check') ? null : join(ROOT, 'dist', 'data', 'hvt'));
  buildTiles({ outDir, cache: !args.includes('--no-cache') && !args.includes('--check') }).then((r) => {
    console.log(`hist tiles: ${r.length} records${outDir ? ' → ' + outDir : ' (checked, nothing written)'}`);
  }, (e) => { console.error('hist tiles: ' + (e && e.stack || e)); process.exit(1); });
}
