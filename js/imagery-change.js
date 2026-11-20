/* ============================================================================
 *  IntMap · 画像から分かる変化 — 異なる撮影日の観測を同じ格子に載せて比べる   (js/imagery-change.js)
 * ----------------------------------------------------------------------------
 *  衛星画像を「背景」ではなく「観測データ」として扱う統一の形。光学（Sentinel-2）・SAR（Sentinel-1 RTC）・
 *  土地被覆（Impact Observatory 年次）・衛星埋め込み（AlphaEarth Foundations 年次）のどれも、次の同じ手順を通る:
 *
 *    ① 撮影日の違う 2 つの観測を、呼び出し側が述べた同じ格子（範囲・画素数）に読む（js/gis-cog.js。再標本化は nearest で
 *       値を作らない）。② 使えない画素（雲・雲の影・欠測・飽和）を落とす。③ 画素ごとの差（または埋め込みの距離）を
 *       求め、**差の分布そのものから**変化の閾値を決める。④ 結果を数え、どの画像から何を言ったか（根拠）を 1 つの形で返す。
 *
 *  このファイルは純粋で、ネットワークも DOM も持たない（node で評価できる）。画像の探索と読み出しは
 *  js/imagery-change-io.js、Atlas の扉は js/atlas-cap-geo.js。
 *
 *  ⚠ 出てくる数字は**画像から推定した値であって、地上の事実ではない**。変化は原因を示さない（雲の残り・季節・潮位・
 *  太陽高度・撮影角でも画素は変わる）。`evidenceOf` の `limits` は、回答が必ず述べる制約の正本。
 *  ⚠ 閾値の定数は無い。`robustThresholds` は差の中央値と MAD（中央絶対偏差）から決める: 変化していない画素が大多数で
 *  ある限り、中央値は季節・太陽高度・大気の違いによる全体のずれを、MAD はその散らばりを表す。k = 3 は
 *  「頑健な z 値が 3 を超えたものを外れ値とする」という統計の慣用で、呼び出し側が上書きできる（`k`）。
 *  変化した画素が過半を占めるときは中央値が動くので、`stats.changedFraction` が高いときの回答は「全面的な変化」か
 *  「撮影条件の違い」かを区別できないと述べる。
 * ==========================================================================*/

/* ── Sentinel-2 L2A のシーン分類（SCL）。ESA Sen2Cor の分類表（0 欠測／1 飽和・欠陥／2 暗部／3 雲の影／4 植生／5 裸地／
   6 水／7 未分類／8 雲（中）／9 雲（高）／10 薄い巻雲／11 雪氷）。画素を落とすのは、地表が見えていない 1・3・8・9・10 と欠測 0。
   2（地形の影）・7・11 は地表が見えているので残す（雪氷は変化の原因として意味があり、回答が雪氷の画素数を別に述べる）。 */
export const SCL = Object.freeze({ NODATA: 0, SATURATED: 1, DARK: 2, SHADOW: 3, VEG: 4, BARE: 5, WATER: 6, UNCLASSIFIED: 7, CLOUD_MED: 8, CLOUD_HIGH: 9, CIRRUS: 10, SNOW: 11 });
const SCL_BLOCKED = new Set([0, 1, 3, 8, 9, 10]);
export function sclUsable(v) { return Number.isFinite(v) && !SCL_BLOCKED.has(v); }

/* 正規化差指数 (a−b)/(a+b)。assets は Earth Search の資産名。式は各指数の原論文の定義。 */
export const INDICES = Object.freeze({
  ndvi: { bands: ['nir', 'red'], label: 'NDVI (vegetation)', labelJp: 'NDVI（植生）', cite: 'Rouse et al. 1974' },
  ndwi: { bands: ['green', 'nir'], label: 'NDWI (open water)', labelJp: 'NDWI（開水面）', cite: 'McFeeters 1996' },
  nbr: { bands: ['nir', 'swir22'], label: 'NBR (burn / canopy loss)', labelJp: 'NBR（焼失・樹冠の消失）', cite: 'Key & Benson 2006' },
  ndbi: { bands: ['swir16', 'nir'], label: 'NDBI (built-up)', labelJp: 'NDBI（市街地）', cite: 'Zha et al. 2003' },
});

/* STAC の `raster:bands` が述べる scale / offset で反射率にする。述べていない資産は DN のまま使わず null を返す
   （offset を黙って 0 にすると、2022-01-25 以降の処理基準 04.00 の −1000 が落ちて指数が系統的にずれる）。 */
export function reflectanceOf(values, asset) {
  const rb = asset && asset['raster:bands'] && asset['raster:bands'][0];
  if (!rb || !Number.isFinite(rb.scale)) return null;
  const sc = rb.scale, off = Number.isFinite(rb.offset) ? rb.offset : 0, nd = Number.isFinite(rb.nodata) ? rb.nodata : null;
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) { const v = values[i]; out[i] = (!Number.isFinite(v) || (nd !== null && v === nd)) ? NaN : v * sc + off; }
  return out;
}

/* 正規化差。分母が 0 に近い画素は値を作らず NaN。mask（任意）が偽の画素も NaN。 */
export function normalisedDifference(a, b, mask) {
  const n = a.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i], s = x + y;
    out[i] = (mask && !mask[i]) || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(s) < 1e-9 ? NaN : (x - y) / s;
  }
  return out;
}

/* ── 頑健な統計 ── */
function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}
export function robustStats(values) {
  const v = []; for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) v.push(values[i]);
  v.sort((x, y) => x - y);
  const median = quantile(v, 0.5);
  const dev = v.map((x) => Math.abs(x - median)).sort((x, y) => x - y);
  const mad = quantile(dev, 0.5);
  return { n: v.length, median, mad, sigma: 1.4826 * mad, p05: quantile(v, 0.05), p95: quantile(v, 0.95) };
}
/* 閾値は分布から: 中央値 ± k·σ（σ = 1.4826·MAD は正規分布での標準偏差に一致する尺度）。 */
export function robustThresholds(stats, k) {
  const kk = Number.isFinite(k) && k > 0 ? k : 3;
  return { k: kk, low: stats.median - kk * stats.sigma, high: stats.median + kk * stats.sigma };
}

/* 2 時点の同じ長さの配列（NaN = 使えない）の差 after − before と、その分布から決めた変化の印。
   flag: 1 = 増えた／−1 = 減った／0 = 変化なし／NaN ではなく 0 と区別するため valid を別に持つ。
   pixelKm2 は 1 画素の面積（面積の概算に使う。呼び出し側が格子から導く）。 */
export function pairedChange(before, after, opt) {
  const o = opt || {}, n = before.length;
  if (after.length !== n) throw new Error('pairedChange: lengths differ (' + n + ' vs ' + after.length + ')');
  const diff = new Float64Array(n), valid = new Uint8Array(n);
  let nValid = 0;
  for (let i = 0; i < n; i++) {
    const d = after[i] - before[i];
    if (Number.isFinite(d)) { diff[i] = d; valid[i] = 1; nValid++; } else diff[i] = NaN;
  }
  const st = robustStats(diff);
  if (!(st.n >= 30)) return { ok: false, code: 'TOO_FEW_VALID', valid: nValid, total: n, minimum: 30 };
  /* σ が 0 の分布（全画素が同じ差）は閾値が作れない: 何も「外れて」いないので変化なしと述べる */
  const th = robustThresholds(st, o.k);
  const flag = new Int8Array(n);
  let up = 0, down = 0;
  if (st.sigma > 0) for (let i = 0; i < n; i++) {
    if (!valid[i]) continue;
    if (diff[i] > th.high) { flag[i] = 1; up++; } else if (diff[i] < th.low) { flag[i] = -1; down++; }
  }
  const px = Number.isFinite(o.pixelKm2) ? o.pixelKm2 : null;
  return {
    ok: true, diff, flag, valid,
    stats: {
      total: n, valid: nValid, validFraction: nValid / n, median: st.median, sigma: st.sigma, mad: st.mad, p05: st.p05, p95: st.p95,
      k: th.k, thresholdLow: th.low, thresholdHigh: th.high, increase: up, decrease: down,
      changedFraction: (up + down) / nValid, increaseFraction: up / nValid, decreaseFraction: down / nValid,
      degenerate: !(st.sigma > 0),
      increaseKm2: px === null ? null : up * px, decreaseKm2: px === null ? null : down * px,
    },
  };
}

/* ── 土地被覆: 前後の分類（整数コード）の遷移 ──
   classes は { code: 名前 }。コード 0（欠測）と classes に無いコード（雲など、述べられた分類でないもの）は数えず、
   その数を `unusable` に残す。同じ分類のままの画素は遷移表の対角に入る。 */
export function classTransitions(before, after, classes, opt) {
  const o = opt || {}, n = before.length, codes = Object.keys(classes).map(Number);
  const known = new Set(codes);
  const m = new Map(); let usable = 0, unusable = 0, changed = 0;
  const flag = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const a = before[i], b = after[i];
    if (!known.has(a) || !known.has(b)) { unusable++; continue; }
    usable++;
    const key = a + '>' + b; m.set(key, (m.get(key) || 0) + 1);
    if (a !== b) { changed++; flag[i] = 1; }
  }
  const px = Number.isFinite(o.pixelKm2) ? o.pixelKm2 : null;
  const rows = [...m.entries()].map(([k, c]) => { const [a, b] = k.split('>').map(Number); return { from: a, to: b, fromName: classes[a], toName: classes[b], count: c, km2: px === null ? null : c * px, same: a === b }; })
    .sort((x, y) => y.count - x.count);
  const byClass = {};
  for (const c of codes) byClass[c] = { name: classes[c], before: 0, after: 0 };
  for (const r of rows) { byClass[r.from].before += r.count; byClass[r.to].after += r.count; }
  for (const c of codes) byClass[c].net = byClass[c].after - byClass[c].before;
  return { ok: usable >= 30, code: usable >= 30 ? 'OK' : 'TOO_FEW_VALID', usable, unusable, total: n, changed, changedFraction: usable ? changed / usable : 0, flag, transitions: rows.filter((r) => !r.same), stable: rows.filter((r) => r.same), byClass };
}

/* ── 衛星埋め込み（AlphaEarth Foundations） ──
   COG は符号つき 8 ビット整数（nodata −128）。復元は「127.5 で割り、2 乗し、元の符号を掛ける」（Google の記述。
   復元後の各画素のベクトルは長さ 1）。 */
export function aefDecode(v) { return v === -128 || !Number.isFinite(v) ? NaN : ((v / 127.5) ** 2) * Math.sign(v); }
export const AEF_DIMS = 64;

/* bandsRaw: dims 本の Float64Array（量子化された整数）。画素 i のベクトルは全帯域が有限のときだけ有効。
   戻り値: Float32Array(n·dims)（画素ごとに連続）と valid マスク。 */
export function aefVectors(bandsRaw) {
  const dims = bandsRaw.length, n = bandsRaw[0].length;
  const vec = new Float32Array(n * dims), valid = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let ok = true;
    for (let d = 0; d < dims; d++) { const x = aefDecode(bandsRaw[d][i]); if (Number.isNaN(x)) { ok = false; break; } vec[i * dims + d] = x; }
    if (ok) valid[i] = 1;
  }
  return { vec, valid, dims, n };
}

/* 領域の埋め込み = 有効画素のベクトルの平均を長さ 1 に戻したもの（Google の概要図の作り方と同じ: 平均してから再正規化）。 */
export function meanEmbedding(v) {
  const { vec, valid, dims, n } = v, sum = new Float64Array(dims); let k = 0;
  for (let i = 0; i < n; i++) if (valid[i]) { k++; for (let d = 0; d < dims; d++) sum[d] += vec[i * dims + d]; }
  if (!k) return null;
  let nn = 0; for (let d = 0; d < dims; d++) nn += sum[d] * sum[d];
  nn = Math.sqrt(nn);
  if (!(nn > 0)) return null;
  return { vector: Array.from(sum, (x) => x / nn), pixels: k, coverage: k / n, meanLength: nn / k };
}
/* 画素の長方形 [x0,x1)×[y0,y1) の埋め込みの平均（meanEmbedding と同じ作り方）。1 回読んだ広い窓を区画に切り分けるのに使う。 */
export function meanEmbeddingIn(v, width, rect) {
  const { vec, valid, dims } = v, sum = new Float64Array(dims); let k = 0, total = 0;
  for (let y = rect.y0; y < rect.y1; y++) for (let x = rect.x0; x < rect.x1; x++) {
    total++; const i = y * width + x;
    if (!valid[i]) continue;
    k++; for (let d = 0; d < dims; d++) sum[d] += vec[i * dims + d];
  }
  if (!k) return null;
  let nn = 0; for (let d = 0; d < dims; d++) nn += sum[d] * sum[d];
  nn = Math.sqrt(nn);
  return nn > 0 ? { vector: Array.from(sum, (x) => x / nn), pixels: k, coverage: k / total, meanLength: nn / k } : null;
}
export function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na > 0 && nb > 0 ? d / Math.sqrt(na * nb) : NaN;
}

/* 同じ場所の 2 年の埋め込みの画素ごとの距離（1 − cos）。値が大きいほど、その画素が衛星から見た時間的な軌跡を変えた。
   閾値は分布から（上側だけ: 距離は 0 以上なので、小さいことは「変化が小さい」であって変化ではない）。 */
export function embeddingChange(a, b, opt) {
  const o = opt || {};
  if (a.dims !== b.dims || a.n !== b.n) throw new Error('embeddingChange: shapes differ');
  const { dims, n } = a, dist = new Float64Array(n); let nValid = 0;
  for (let i = 0; i < n; i++) {
    if (!a.valid[i] || !b.valid[i]) { dist[i] = NaN; continue; }
    let d = 0, na = 0, nb = 0;
    for (let k = 0; k < dims; k++) { const x = a.vec[i * dims + k], y = b.vec[i * dims + k]; d += x * y; na += x * x; nb += y * y; }
    dist[i] = 1 - d / Math.sqrt(na * nb); nValid++;
  }
  /* ⚠ 閾値は距離そのものでなく**角度** θ = √(2(1−cos)) の分布で決める。1−cos ≈ θ²/2 なので距離は強く右に歪み、
     中央値 ± k·σ をそのまま当てると変化していない画素の裾を大量に拾う（合成データで 40 画素の変化に 98 画素が印になった）。
     θ は小さな摂動の大きさに比例するので、頑健な z 値の慣用が成り立つ。報告する閾値は距離に戻す（θ²/2）。 */
  const theta = new Float64Array(n);
  for (let i = 0; i < n; i++) theta[i] = Number.isFinite(dist[i]) ? Math.sqrt(Math.max(0, 2 * dist[i])) : NaN;
  const st0 = robustStats(theta);
  if (!(st0.n >= 30)) return { ok: false, code: 'TOO_FEW_VALID', valid: nValid, total: n, minimum: 30 };
  const th0 = robustThresholds(st0, o.k), th = { k: th0.k, high: (th0.high * th0.high) / 2 };
  const st = robustStats(dist); st.sigma = st0.sigma;
  const flag = new Int8Array(n); let up = 0;
  if (st0.sigma > 0) for (let i = 0; i < n; i++) if (Number.isFinite(theta[i]) && theta[i] > th0.high) { flag[i] = 1; up++; }
  const px = Number.isFinite(o.pixelKm2) ? o.pixelKm2 : null;
  return { ok: true, diff: dist, flag, stats: { total: n, valid: nValid, validFraction: nValid / n, median: st.median, sigma: st.sigma, mad: st.mad, p95: st.p95, k: th.k, thresholdHigh: th.high, increase: up, decrease: 0, changedFraction: up / nValid, degenerate: !(st.sigma > 0), increaseKm2: px === null ? null : up * px, decreaseKm2: null } };
}

/* SAR の後方散乱（線形の強度）→ dB。0 以下は値を作らず NaN。 */
export function toDecibel(values) {
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) { const v = values[i]; out[i] = Number.isFinite(v) && v > 0 ? 10 * Math.log10(v) : NaN; }
  return out;
}

/* 範囲 [w,s,e,n] の 1 画素の面積(km²)。幅・高さは画素数。緯度で経度方向が縮む分を中央緯度で測る（小さな範囲の近似）。 */
export function pixelAreaKm2(bounds, width, height) {
  const KM = 111.32, lat = (bounds[1] + bounds[3]) / 2;
  return ((bounds[2] - bounds[0]) * KM * Math.cos(lat * Math.PI / 180) / width) * ((bounds[3] - bounds[1]) * KM / height);
}

/* ── 根拠 ──
   画像から推定した値の根拠は、(1) どの画像（ID・撮影日・出典・利用条件）を使ったか、(2) どの手順・どの閾値か、
   (3) 何画素が使えたか、(4) 何を言ってはいけないか、の 4 つ。回答・データセットの provenance・Atlas のメタに同じ形で付く。 */
export const LIMITS = Object.freeze({
  en: [
    'This is an estimate made from images; it is not a ground observation.',
    'A change in the images is not a cause: clouds, haze, season, tide, sun angle and viewing angle also change pixels.',
    'The threshold comes from the distribution of differences in this window (median ± k·σ); it is not a calibrated "real change" level.',
  ],
  jp: [
    '画像から推定した値であって、地上での観測ではありません。',
    '画像の変化は原因を示しません。雲・もや・季節・潮位・太陽高度・撮影角でも画素は変わります。',
    '閾値はこの範囲の差の分布から決めたもの（中央値 ± k·σ）で、「本当の変化」を較正した水準ではありません。',
  ],
});
export function evidenceOf(o) {
  return {
    basis: 'image-derived',
    kind: o.kind,                 /* 'optical' | 'sar' | 'landcover' | 'embedding' */
    scenes: (o.scenes || []).map((s) => ({
      role: s.role, id: s.id, datetime: s.datetime || null, cloudCover: s.cloudCover == null ? null : s.cloudCover, grid: s.grid || null,
      collection: s.collection || null, href: s.href || null, source: s.source || null, license: s.license || null, attribution: s.attribution || null,
    })),
    method: o.method, params: o.params || {}, lattice: o.lattice || null,
    quality: o.quality || {}, limits: LIMITS, caveats: o.caveats || [],
  };
}

/* 数の表し方（回答用）。 */
export const pct = (f) => (f * 100 >= 10 ? (f * 100).toFixed(0) : (f * 100).toFixed(1)) + '%';
