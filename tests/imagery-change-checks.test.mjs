/* ============================================================================
 *  画像から分かる変化 — 2 時点を同じ格子に載せて比べる統一経路
 *  (js/imagery-change.js・js/imagery-change-io.js・js/imagery-change-atlas.js・js/geo-similar.js の埋め込み版・
 *   js/gis-geotiff.js の zstd／下端原点／多帯域読み)
 * ----------------------------------------------------------------------------
 *  主張と、それが崩れたとき何が起きるか:
 *    ① 変化の閾値は定数でなく分布から決まる: 全面のずれ（季節・太陽）は変化にならず、局所の変化だけが印になる
 *    ② 使えない画素（雲・雲の影・欠測）は差に入らない／スケールを述べない資産から反射率を作らない
 *    ③ AlphaEarth の COG（zstd・下端原点・1 面 1 帯域）を、向きと値が合ったまま読める（Google 公表の復元式で長さ 1）
 *    ④ 埋め込み索引（約 800 MB）はバイト範囲の二分探索で (UTM 帯, 年) の塊だけを読み、並びが想定と違えば名指しで止まる
 *    ⑤ 光学の組は同じ MGRS 格子を優先し、雲だらけの候補を飛ばす（取得は注入した fetch／readWindow で固定）
 *    ⑥ 回答は画像から推定した値であることの制約と根拠（画像 id・利用条件）を常に持つ
 *    ⑦ geo.similar の埋め込み版は基準が読めないとき「似た地域なし」と言わない
 *  ⚠ ネットワークは使わない。実データでの測定は dev-notes/2026-11-20-satellite-change-analysis.md に残した。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as E from '../js/imagery-change.js';
import { makeImageryChange, periodOf, latticeFor } from '../js/imagery-change-io.js';
import { findSimilarEmbedding } from '../js/geo-similar.js';
import { makeGisGeotiff } from '../js/gis-geotiff.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* 決定的な疑似乱数（検査が走るたびに同じ値） */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const noise = (r) => (r() + r() + r() - 1.5) * 0.02;

test('① the threshold comes from the distribution: a window-wide shift is removed, a local change is flagged', () => {
  const n = 4000, r = rng(1), before = new Float64Array(n), after = new Float64Array(n);
  for (let i = 0; i < n; i++) { before[i] = 0.5 + noise(r); after[i] = before[i] + 0.15 + noise(r); }   /* 季節の違い: 全画素が +0.15 */
  for (let i = 100; i < 160; i++) after[i] -= 0.6;                                                      /* 本当の局所変化 60 画素 */
  const c = E.pairedChange(before, after, { pixelKm2: 0.001 });
  assert.equal(c.ok, true);
  assert.ok(Math.abs(c.stats.median - 0.15) < 0.01, 'the median is the global shift: ' + c.stats.median);
  assert.ok(c.stats.decrease >= 58 && c.stats.decrease <= 70, 'the 60 changed pixels are found: ' + c.stats.decrease);
  assert.ok(c.stats.increase < 15, 'the uniform shift is not a change: ' + c.stats.increase);
  assert.equal(c.flag[120], -1);
  assert.equal(c.flag[500], 0);
  assert.ok(Math.abs(c.stats.decreaseKm2 - c.stats.decrease * 0.001) < 1e-12);
  /* 同じ配列 = 差が全部 0: 閾値が作れないので変化なしと述べる（0 除算で全画素を変化にしない） */
  const same = E.pairedChange(before, before);
  assert.equal(same.ok, true); assert.equal(same.stats.degenerate, true); assert.equal(same.stats.changedFraction, 0);
  /* 有効画素が少なすぎるときは名指しで拒む */
  const few = E.pairedChange(new Float64Array(100).fill(NaN), new Float64Array(100).fill(1));
  assert.equal(few.ok, false); assert.equal(few.code, 'TOO_FEW_VALID');
});

test('② cloud / shadow / no-data pixels are dropped; a reflectance needs a stated scale', () => {
  for (const v of [0, 1, 3, 8, 9, 10]) assert.equal(E.sclUsable(v), false, 'SCL ' + v + ' hides the ground');
  for (const v of [2, 4, 5, 6, 7, 11]) assert.equal(E.sclUsable(v), true, 'SCL ' + v + ' shows the ground');
  const a = Float64Array.from([1000, 2000, 0]), b = Float64Array.from([3000, 2000, 0]);
  const asset = { 'raster:bands': [{ scale: 0.0001, offset: -0.1, nodata: 0 }] };
  const ra = E.reflectanceOf(a, asset);
  assert.ok(Math.abs(ra[0] - 0) < 1e-12 && Math.abs(ra[1] - 0.1) < 1e-12, 'offset applied (baseline 04.00 reflectance = DN·scale + offset)');
  assert.ok(Number.isNaN(ra[2]), 'nodata becomes NaN, not reflectance −0.1');
  assert.equal(E.reflectanceOf(a, { 'raster:bands': [{}] }), null, 'no stated scale → no reflectance (not DN passed off as reflectance)');
  assert.equal(E.reflectanceOf(a, {}), null);
  const mask = [1, 0, 1], nd = E.normalisedDifference(Float64Array.from([0.5, 0.5, 0.2]), Float64Array.from([0.1, 0.1, 0.2]), mask);
  assert.ok(Math.abs(nd[0] - (0.4 / 0.6)) < 1e-12); assert.ok(Number.isNaN(nd[1]), 'masked pixel has no value'); assert.equal(nd[2], 0);
  assert.ok(Number.isNaN(E.normalisedDifference([0], [0])[0]), '0/0 is not a value');
  assert.ok(Number.isNaN(E.toDecibel([0, -1, 1])[0]) && E.toDecibel([100])[0] === 20);
});

test('classes: a transition table counts only stated classes, and says how many it could not use', () => {
  const before = Float64Array.from([2, 2, 2, 7, 7, 1, 10, 0, ...new Array(40).fill(5)]), after = Float64Array.from([7, 2, 2, 7, 1, 1, 2, 2, ...new Array(40).fill(5)]);
  const t = E.classTransitions(before, after, { 1: 'Water', 2: 'Trees', 5: 'Crops', 7: 'Built area' }, { pixelKm2: 0.01 });
  assert.equal(t.ok, true);
  assert.equal(t.unusable, 2, 'class 10 (clouds) and 0 (no data) are not classes');
  assert.equal(t.changed, 2);
  assert.deepEqual(t.transitions.map((x) => x.fromName + '>' + x.toName).sort(), ['Built area>Water', 'Trees>Built area']);
  assert.equal(t.byClass[2].net, -1); assert.equal(t.byClass[1].net, 1);
  assert.ok(Math.abs(t.transitions[0].km2 - 0.01) < 1e-12);
});

test('③ a zstd, bottom-up, one-plane-per-band COG is read upright and with the right values (the AlphaEarth layout)', async () => {
  const W = 8, H = 8, T = 4, BANDS = 3, x0 = 10, ySouth = 40, px = 0.01;
  const val = (b, r, c) => b * 40 + r * 5 + c;                /* r = the FILE row, south first */
  const chunks = [];
  for (let b = 0; b < BANDS; b++) for (let ty = 0; ty < H / T; ty++) for (let tx = 0; tx < W / T; tx++) {
    const raw = Buffer.alloc(T * T);
    for (let r = 0; r < T; r++) for (let c = 0; c < T; c++) raw.writeInt8(val(b, ty * T + r, tx * T + c), r * T + c);
    chunks.push(zlib.zstdCompressSync(raw));
  }
  const E_ = [];
  const add = (tag, type, v) => E_.push({ tag, type, v });
  add(256, 3, [W]); add(257, 3, [H]); add(258, 3, [8, 8, 8]); add(259, 3, [50000]); add(262, 3, [1]); add(277, 3, [BANDS]); add(284, 3, [2]);
  add(322, 3, [T]); add(323, 3, [T]); add(324, 4, new Array(chunks.length).fill(0)); add(325, 4, chunks.map((c) => c.length)); add(339, 3, [2, 2, 2]);
  add(34264, 12, [px, 0, 0, x0, 0, px, 0, ySouth, 0, 0, 0, 0, 0, 0, 0, 1]);          /* positive y scale = bottom-up */
  add(34735, 3, [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326]);
  add(42113, 2, [...Buffer.from('-128'), 0]);
  E_.sort((p, q) => p.tag - q.tag);
  const SZ = { 2: 1, 3: 2, 4: 4, 12: 8 }, n = E_.length;
  let p = 8 + 2 + 12 * n + 4;
  const where = E_.map((e) => { const s = SZ[e.type] * e.v.length; if (s > 4) { const at = p; p += s + (s & 1); return at; } return -1; });
  let q = p + (p & 1); const offs = [];
  for (const c of chunks) { offs.push(q); q += c.length; }
  E_.find((e) => e.tag === 324).v = offs;
  const buf = Buffer.alloc(q), put = (at, type, v) => { if (type === 2) buf.writeUInt8(v, at); else if (type === 3) buf.writeUInt16LE(v, at); else if (type === 4) buf.writeUInt32LE(v, at); else buf.writeDoubleLE(v, at); };
  buf.write('II', 0); buf.writeUInt16LE(42, 2); buf.writeUInt32LE(8, 4); buf.writeUInt16LE(n, 8);
  E_.forEach((e, i) => {
    const base = 10 + i * 12, s = SZ[e.type] * e.v.length;
    buf.writeUInt16LE(e.tag, base); buf.writeUInt16LE(e.type, base + 2); buf.writeUInt32LE(e.v.length, base + 4);
    if (s > 4) { buf.writeUInt32LE(where[i], base + 8); e.v.forEach((v, k) => put(where[i] + k * SZ[e.type], e.type, v)); } else e.v.forEach((v, k) => put(base + 8 + k * SZ[e.type], e.type, v));
  });
  chunks.forEach((c, i) => c.copy(buf, offs[i]));

  const T_ = makeGisGeotiff(), o = await T_.read(new Uint8Array(buf), {});
  assert.equal(o.ok, true, JSON.stringify(o.why) + JSON.stringify(o.detail));
  const g = o.grid;
  assert.equal(g.flipY, true);
  assert.ok(Math.abs(g.affine.y0 - (ySouth + H * px)) < 1e-9, 'y0 is the NORTH edge once the height is known: ' + g.affine.y0);
  const full = await g.readRegion({ x: 0, y: 0, width: W, height: H, bands: [0, 1, 2] });
  assert.equal(full.ok, true, JSON.stringify(full.why) + JSON.stringify(full.detail));
  for (let b = 0; b < BANDS; b++) for (let r = 0; r < H; r++) for (let c = 0; c < W; c++)
    assert.equal(full.region.valuesByBand[b][r * W + c], val(b, H - 1 - r, c), 'band ' + b + ' north-up row ' + r + ' col ' + c);
  /* a bbox is answered in north-up space: the northernmost 2 rows, columns 2..5 */
  const eps = px * 0.1, bb = [x0 + 2 * px + eps, ySouth + (H - 2) * px + eps, x0 + 6 * px - eps, ySouth + H * px - eps];   /* inset: the reader floors/ceils in floating point */
  const part = await g.readRegion({ bbox: bb, bands: [1] });
  assert.equal(part.ok, true);
  assert.equal(part.region.width, 4); assert.equal(part.region.height, 2);
  assert.equal(part.region.valuesByBand[0][0], val(1, 7, 2)); assert.equal(part.region.valuesByBand[0][4], val(1, 6, 2));
  assert.equal(g.read(0)[0], val(0, 7, 0), 'the synchronous door is upright too');
});

test('AlphaEarth decoding: (v/127.5)²·sign(v), nodata −128, every decoded pixel has length 1', () => {
  assert.ok(Number.isNaN(E.aefDecode(-128)));
  assert.equal(E.aefDecode(0), 0); assert.ok(Math.abs(E.aefDecode(127.5) - 1) < 1e-12); assert.ok(Math.abs(E.aefDecode(-51) + 0.16) < 1e-12);
  /* 長さ 1 のベクトルを量子化したものを復元すると、長さがほぼ 1 に戻る（量子化の誤差の範囲） */
  const r = rng(7), dims = 64, bands = Array.from({ length: dims }, () => new Float64Array(3));
  for (let px = 0; px < 3; px++) {
    const v = Array.from({ length: dims }, () => r() - 0.5), nn = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    v.forEach((x, d) => { const u = x / nn; bands[d][px] = Math.round(Math.sign(u) * Math.sqrt(Math.abs(u)) * 127.5); });
  }
  bands[5][2] = -128;                                                                 /* 3 つ目は 1 帯域が欠測 → その画素は無効 */
  const v = E.aefVectors(bands);
  assert.deepEqual([...v.valid], [1, 1, 0]);
  for (let px = 0; px < 2; px++) { let s = 0; for (let d = 0; d < dims; d++) s += v.vec[px * dims + d] ** 2; assert.ok(Math.abs(Math.sqrt(s) - 1) < 0.03, 'length ' + Math.sqrt(s)); }
  const m = E.meanEmbedding(v);
  assert.equal(m.pixels, 2); assert.ok(Math.abs(Math.sqrt(m.vector.reduce((s, x) => s + x * x, 0)) - 1) < 1e-9, 'the mean is renormalised to length 1');
});

test('embedding change: identical years are distance ~0; a planted change is flagged from the distribution', () => {
  const dims = 8, n = 2000, r = rng(11), make = () => ({ vec: new Float32Array(n * dims), valid: new Uint8Array(n).fill(1), dims, n });
  const A = make(), B = make();
  for (let i = 0; i < n; i++) {
    const v = Array.from({ length: dims }, () => r() - 0.5), nn = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    for (let d = 0; d < dims; d++) { A.vec[i * dims + d] = v[d] / nn; B.vec[i * dims + d] = (v[d] + (r() - 0.5) * 0.04) / nn; }
  }
  for (let i = 300; i < 340; i++) for (let d = 0; d < dims; d++) B.vec[i * dims + d] = -A.vec[i * dims + d];  /* 40 画素の信号が反転 */
  const c = E.embeddingChange(A, B, { pixelKm2: 0.01 });
  assert.equal(c.ok, true);
  assert.ok(c.stats.median < 0.02, 'unchanged pixels sit near 0: ' + c.stats.median);
  let hit = 0; for (let i = 300; i < 340; i++) hit += c.flag[i];
  assert.equal(hit, 40, 'every inverted pixel is flagged');
  assert.ok((c.stats.increase - hit) / (n - 40) < 0.03, 'the false-positive tail stays under 3% of the unchanged pixels: ' + (c.stats.increase - hit));
  assert.equal(c.flag[320], 1); assert.equal(c.flag[10], 0);
  assert.ok(Math.abs(E.cosine([1, 0], [1, 0]) - 1) < 1e-12 && Math.abs(E.cosine([1, 0], [0, 1])) < 1e-12);
  assert.throws(() => E.embeddingChange(A, { dims: 4, n, vec: new Float32Array(n * 4), valid: new Uint8Array(n) }), /shapes differ/);
});

test('periods and the lattice: a year is the whole year, a day is a window, and a big window enlarges pixels (and says so)', () => {
  assert.deepEqual(periodOf('2024'), { from: '2024-01-01', to: '2024-12-31', mid: '2024-07-01', year: 2024 });
  assert.deepEqual(periodOf('2025-06-15', 10), { from: '2025-06-05', to: '2025-06-25', mid: '2025-06-15' });
  assert.deepEqual(periodOf({ from: '2025-01-01', to: '2025-01-31' }).from, '2025-01-01');
  assert.equal(periodOf('last spring'), null); assert.equal(periodOf(null), null);
  const small = latticeFor([139.74, 35.66, 139.78, 35.70], 40, 262144);
  assert.equal(small.enlarged, false); assert.ok(small.width > 80 && small.width < 100, 'about 3.6 km / 40 m: ' + small.width);
  const big = latticeFor([139, 35, 141, 37], 10, 262144);
  assert.equal(big.enlarged, true); assert.ok(big.width * big.height <= 262144 * 1.05); assert.equal(big.requestedPixelM, 10); assert.ok(big.pixelM > 10);
});

/* ── ⑤ 光学: 注入した STAC と readWindow で、選び方を固定する ── */
function s2Item(id, cloud, grid, bbox) {
  const asset = (n) => ({ href: 'https://x.example/' + id + '/' + n + '.tif', 'raster:bands': [{ scale: 0.0001, offset: -0.1, nodata: 0 }] });
  return { id, bbox, properties: { datetime: id.slice(-8, -4) + '-06-15T01:00:00Z', 'eo:cloud_cover': cloud, 'grid:code': grid }, assets: { red: asset('B04'), nir: asset('B08'), scl: { href: 'https://x.example/' + id + '/SCL.tif' } } };
}
test('⑤ optical: a cloudy candidate is skipped, the same MGRS grid is preferred, and every pixel the clouds hide is dropped', async () => {
  const bounds = [139.74, 35.66, 139.78, 35.70], wide = [139.0, 35.0, 140.5, 36.5];
  const cands = {
    before: [s2Item('S2A_54SUE_20190617_0_L2A', 5, 'MGRS-54SUE', wide)],
    after: [s2Item('S2B_54SUE_20250610_0_L2A', 8, 'MGRS-54SUE', wide), s2Item('S2A_54SUE_20250615_0_L2A', 40, 'MGRS-54SUE', wide), s2Item('S2A_53SUE_20250620_0_L2A', 1, 'MGRS-53SUE', wide)],
  };
  const seen = []; let lat = null;
  const fetch = async (url, init) => { const body = JSON.parse(init.body); seen.push(body); const which = body.datetime.startsWith('2019') ? 'before' : 'after'; return { ok: true, json: async () => ({ features: cands[which] }) }; };
  const readWindow = async (url, o) => {
    lat = o; const n = o.width * o.height, v = new Float64Array(n), id = url.split('/')[3];
    if (url.endsWith('SCL.tif')) { const cloudy = id.includes('20250610'); v.fill(cloudy ? 9 : 4); if (!cloudy && id.includes('2019')) for (let i = 0; i < n / 10; i++) v[i] = 9; }
    else if (url.endsWith('B04.tif')) v.fill(id.includes('2019') ? 1500 : 1500);
    else v.fill(id.includes('2019') ? 4000 : 4000);
    const g = { read: () => v, width: o.width, height: o.height };
    return { ok: true, raster: g, coverage: { completeness: 'all', reason: 'ok' } };
  };
  const io = makeImageryChange({ fetch, readWindow });
  const r = await io.optical({ bounds, before: '2019-06-15', after: '2025-06-15', index: 'ndvi', pixelM: 40 });
  /* 全画素が同じ NDVI なので「差が全部 0」: 有効画素の数と選ばれた画像だけを検査する */
  assert.equal(r.ok, true, JSON.stringify(r.why) + JSON.stringify(r.detail));
  const ids = r.evidence.scenes.map((s) => s.id);
  assert.deepEqual(ids, ['S2A_54SUE_20190617_0_L2A', 'S2B_54SUE_20250610_0_L2A'].map((x, i) => (i ? 'S2A_54SUE_20250615_0_L2A' : x)).slice(0, 1).concat(ids[1]));
  assert.equal(ids[1] === 'S2B_54SUE_20250610_0_L2A', false, 'the fully clouded scene (SCL 9 everywhere) was skipped');
  assert.equal(ids[1], 'S2A_54SUE_20250615_0_L2A', 'the same MGRS grid beats the cloud-free scene on another grid: it overlays without resampling');
  assert.equal(r.evidence.quality.sameGrid, true);
  assert.ok(Math.abs(r.evidence.quality.beforeUsable - 0.9) < 0.02, '10% of the before window is cloud: ' + r.evidence.quality.beforeUsable);
  assert.ok(r.change.stats.validFraction < 0.95 && r.change.stats.validFraction > 0.85, 'masked pixels are not in the difference: ' + r.change.stats.validFraction);
  assert.equal(r.evidence.basis, 'image-derived');
  assert.ok(r.evidence.scenes.every((s) => s.license && s.attribution), 'every scene carries its licence and attribution');
  assert.ok(r.evidence.limits.en.length >= 3 && r.evidence.limits.jp.length >= 3, '⑥ the limits travel with the evidence');
  assert.ok(seen[0].query['eo:cloud_cover'].lte === 60 && seen[0].collections[0] === 'sentinel-2-l2a');
  /* スケールを述べない資産では、DN を反射率として使わず名指しで止まる */
  const noScale = s2Item('S2A_54SUE_20190617_0_L2A', 5, 'MGRS-54SUE', wide); noScale.assets.red = { href: 'https://x.example/a/B04.tif' };
  const io2 = makeImageryChange({ fetch: async () => ({ ok: true, json: async () => ({ features: [noScale] }) }), readWindow });
  const r2 = await io2.optical({ bounds, before: '2019-06-15', after: '2019-06-16', pixelM: 40 });
  assert.equal(r2.ok, false); assert.equal(r2.why, 'scale-not-stated');
  /* 期間に画像が無い → 名指し */
  const io3 = makeImageryChange({ fetch: async () => ({ ok: true, json: async () => ({ features: [] }) }), readWindow });
  assert.equal((await io3.optical({ bounds, before: '2019-06-15', after: '2025-06-15' })).why, 'no-scene');
  assert.ok(lat.width > 0);
});

/* ── ④ AlphaEarth の索引: 並び順どおりの合成 CSV を、Range に答える偽の配信元で返す ── */
function fakeIndex() {
  const rows = [];
  const zones = [['N', 30], ['N', 31], ['N', 32], ['S', 10], ['S', 11]];
  for (const [hem, z] of zones) for (const year of [2017, 2018, 2019, 2020]) for (let t = 0; t < 60; t++) {
    const w = (z - 31) * 6 + t * 0.5, s = (hem === 'N' ? 10 : -20) + t * 0.5, e = w + 0.5, n = s + 0.5;
    const poly = 'POLYGON((' + [[w, s], [e, s], [e, n], [w, n], [w, s]].map((p) => p.join(' ')).join(',') + '))';
    rows.push('"' + poly + '",EPSG:326' + z + ',s3://us-west-2.opendata.source.coop/tge-labs/aef/v1/annual/' + year + '/' + z + hem + '/x' + z + hem + year + 't' + t + '-0000000000-0000000000.tiff,' + year + ',' + z + hem + ',0,0,1,1,' + [w, s, e, n].join(','));
  }
  return 'WKT,crs,path,year,utm_zone,utm_west,utm_south,utm_east,utm_north,wgs84_west,wgs84_south,wgs84_east,wgs84_north\n' + rows.join('\n') + '\n';
}
function fakeFetch(text, counters) {
  const bytes = Buffer.from(text);
  return async (url, init) => {
    counters.n++;
    if (init && init.method === 'HEAD') return { ok: true, status: 200, headers: { get: (h) => (h.toLowerCase() === 'content-length' ? String(bytes.length) : null) } };
    const m = /bytes=(\d+)-(\d+)/.exec(init.headers.Range);
    const from = +m[1], to = Math.min(bytes.length - 1, +m[2]); counters.bytes += to - from + 1;
    return { ok: true, status: 206, text: async () => bytes.subarray(from, to + 1).toString() };
  };
}
test('④ the AlphaEarth index is searched by byte range: only the (zone, year) block is read, and a wrong order is named', async () => {
  const text = fakeIndex(), c = { n: 0, bytes: 0 };
  const io = makeImageryChange({ fetch: fakeFetch(text, c), readWindow: async () => ({ ok: false, why: 'unused' }) });
  /* 帯 31N は経度 0〜6。t = 3 の区画は w = 1.5, s = 11.5 */
  const hit = await io.aefLocate([1.6, 11.6, 1.8, 11.8], 2019);
  assert.equal(hit.ok, true, JSON.stringify(hit));
  assert.match(hit.tile.url, /^https:\/\/data\.source\.coop\/tge-labs\/aef\/v1\/annual\/2019\/31N\/x31N2019t3-/, 'the s3 path is turned into the https data host');
  assert.equal(hit.tile.covers, true);
  assert.ok(c.bytes < text.length, 'the whole index was not downloaded (' + c.bytes + ' of ' + text.length + ' bytes)');
  assert.equal((await io.aefLocate([1.6, 11.6, 1.8, 11.8], 2030)).why, 'year-out-of-range');
  /* 帯が索引に無い場所（北半球 40N 帯…）は、別の帯を黙って返さずに名指しで拒む */
  const none = await io.aefLocate([-120.1, 30.1, -120.0, 30.2], 2019);
  assert.equal(none.ok, false); assert.ok(['index-order-unexpected', 'no-tile'].includes(none.why), none.why);
  /* 並びが壊れた索引（年が降順）: 想定した (帯, 年) の行が見つからず名指しで止まる */
  const lines = text.trim().split('\n'), head = lines.shift(), shuffled = [head, ...lines.reverse()].join('\n') + '\n';
  const io2 = makeImageryChange({ fetch: fakeFetch(shuffled, { n: 0, bytes: 0 }), readWindow: async () => ({ ok: false, why: 'unused' }) });
  const bad = await io2.aefLocate([1.6, 11.6, 1.8, 11.8], 2019);
  assert.equal(bad.ok, false, 'a reversed index must not return a tile from the wrong block'); assert.ok(['index-order-unexpected', 'no-tile'].includes(bad.why));
});

/* ── ⑦ geo.similar の埋め込み版 ── */
test('⑦ geo.similar by embedding ranks by cosine, reports the pool spread, and never turns an unread reference into "no similar region"', async () => {
  const unit = (a) => { const n = Math.hypot(...a); return a.map((x) => x / n); };
  const ref = unit([1, 0, 0, 0]);
  const vecs = [unit([1, 0.1, 0, 0]), unit([0, 1, 0, 0]), unit([0.5, 0.5, 0, 0]), unit([0.9, 0, 0.3, 0]), unit([0, 0, 1, 0])];
  const embedMany = async (boxes) => boxes.map((b, i) => (i === 0 ? { embedding: { vector: ref, coverage: 1 } } : { embedding: { vector: vecs[(i - 1) % vecs.length], coverage: 0.9 } }));
  const r = await findSimilarEmbedding({ query: { lat: 10, lng: 10 }, cellKm: 2, maxCells: 8, k: 3 }, embedMany);
  assert.equal(r.ok, true); assert.equal(r.results.length, 3);
  assert.ok(r.results[0].score >= r.results[1].score && r.results[1].score >= r.results[2].score);
  assert.ok(r.results[0].score > 0.99 && r.poolMin < r.results[0].score && r.poolMedian <= r.poolMax);
  const unread = await findSimilarEmbedding({ query: { lat: 10, lng: 10 }, maxCells: 8 }, async (boxes) => boxes.map(() => ({ reason: 'index-unreadable' })));
  assert.equal(unread.ok, false); assert.equal(unread.code, 'QUERY_UNREAD', 'an unreadable reference is not "nothing is similar"');
  const few = await findSimilarEmbedding({ query: { lat: 10, lng: 10 }, maxCells: 8 }, async (boxes) => boxes.map((b, i) => (i < 3 ? { embedding: { vector: ref, coverage: 1 } } : { reason: 'x' })));
  assert.equal(few.code, 'POOL_TOO_SMALL');
});

test('the capability is in the table, documented, and its schema names the arguments the engine reads', () => {
  const caps = read('js/atlas-cap-geo.js'), rows = read('js/atlas-capabilities.js');
  assert.match(rows, /\["geo\.imageChange","geoImageChange"/);
  assert.match(caps, /geo\.imageChange/); assert.match(caps, /signal: str\(\), year: int\(2017, 2025\)/);
  for (const k of ['optical', 'sar', 'landcover', 'embedding']) assert.ok(caps.includes('kind "' + k + '"'), 'the doc teaches kind ' + k);
  assert.match(caps, /Night-time light is NOT available/, 'the doc says what is not covered instead of implying it');
  const run = read('js/imagery-change-atlas.js');
  for (const k of ['optical', 'sar', 'landcover', 'embedding']) assert.ok(run.includes(k + ':'), 'the answer has a label for ' + k);
});
