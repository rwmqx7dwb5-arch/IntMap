/* ============================================================================
 *  IntMap · 地理空間 ML の一連作業 — 複数年の変化・地域の意味分類・変化の解釈・予測モデル   (js/geo-ml.js)
 * ----------------------------------------------------------------------------
 *  4 つの仕事を 1 つの純粋な部品にする（網にも DOM にも触れず、node で評価できる）:
 *
 *    A. 複数年の変化   admitObservations / selectForTime / seriesStats / analyzeRasterSeries
 *       2 時点の差ではなく、N 時点の系列から「いつ（撮影日で挟んだ区間）・どれだけ速く・どちらへ」を測る。
 *       ⚠ 撮影日を**観測として**述べていない画像は系列に入れない（ファイル名・取得日・背景タイルの年は撮影日ではない）。
 *         Chronos が指した日の画像として扱えるのも、撮影日が確かな画像だけ（selectForTime）。
 *    B. 意味分類       classifyRegion / fitPrototypes / classifyWith
 *       OSM の種類別密度（js/geo-similar.js の FEATURES）と土地被覆の割合から、工業・住居・商業・港湾・農業・自然に分ける。
 *       事前の原型は「タグの意味」であって較正した水準ではない。利用者が正解を渡せば、その地域の正解から原型を学び、
 *       1 つ抜き検証の正答率を添える。証拠が足りない地域は「描かれていない」であって「農村」ではない。
 *    C. 変化の解釈     interpretChange
 *       変化した場所と時期に、施設・統計・ニュースを結び付ける。結ぶのは「場所と時期の一致」までで、原因とは言わない。
 *       変化の後に起きたものは、説明に使えないと名指しする。
 *    D. 予測モデル     assembleTable / crossValidate / fitAndPredict
 *       目的変数 + 地理空間データから特徴量を作り、ridge と木の集まりで学習し、**空間ブロック**と**時間**で評価し、
 *       分割共形の区間（空間 CV の残差）つきで地図へ戻す。ランダム分割の点数も並べて、空間的な自己相関による水増しを見せる。
 *
 *  ⚠ ここの数は全部、与えられた観測から導く。閾値の「定数」は 1 つも置かない（帰無分布は simulate、区間は残差の分位）。
 *    置いた既定（分割数・木の数・λの候補）は各関数の冒頭に由来を書いた。
 * ==========================================================================*/

/* ── 共通 ── */
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const isNum = (v) => typeof v === 'number' && isFinite(v);
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
function quantile(sorted, q) { if (!sorted.length) return NaN; const p = (sorted.length - 1) * q, i = Math.floor(p), f = p - i; return i + 1 < sorted.length ? sorted[i] * (1 - f) + sorted[i + 1] * f : sorted[i]; }
const median = (a) => quantile(a.slice().sort((x, y) => x - y), 0.5);
function normal(rng) { let u = 0, v = 0; while (u === 0) u = rng(); v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
/* 標準正規の両側 p（Abramowitz–Stegun 7.1.26。誤差 < 1.5e-7） */
function pTwoSided(z) { const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return 1 - y; }
const KM_PER_DEG = 111.32;
function haversineKm(lat1, lng1, lat2, lng2) { const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r, a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(a))); }

/* ══════════════ A. 複数年の変化 ══════════════ */

/* 日付 → 小数の年。'YYYY-MM-DD'・'YYYY-MM'・'YYYY'。解けなければ null */
export function toYear(d) {
  if (d == null) return null;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(String(d).trim());
  if (!m) return null;
  const y = +m[1], mo = m[2] ? +m[2] : 1, da = m[3] ? +m[3] : 1;
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  const t = Date.UTC(y, mo - 1, da), a = Date.UTC(y, 0, 1), b = Date.UTC(y + 1, 0, 1);
  return y + (t - a) / (b - a);
}

/* 観測として数えてよい日付の根拠。ここに無い basis（unknown・file-name・upload・background-tile・stated …）は撮影日ではない。
   'acquired' = センサーが撮った日（STAC の datetime 等）。'composite' = 期間の合成で、期間の中央を日付とする（期間を持つこと）。 */
export const OBSERVATION_BASES = Object.freeze(['acquired', 'composite']);

/* obs: [{id?, date, endDate?, dateBasis, ...}]。系列に入れてよいものと、入れないものと理由を返す。 */
export function admitObservations(obs) {
  const admitted = [], rejected = [];
  (obs || []).forEach((o, i) => {
    const id = (o && o.id != null) ? o.id : i;
    if (!o || o.date == null || o.date === '') { rejected.push({ id, reason: 'no-date' }); return; }
    if (!OBSERVATION_BASES.includes(o.dateBasis)) { rejected.push({ id, reason: 'date-not-an-observation', detail: String(o.dateBasis || 'unstated') }); return; }
    const a = toYear(o.date);
    if (a == null) { rejected.push({ id, reason: 'date-unparseable', detail: String(o.date) }); return; }
    let t = a;
    if (o.dateBasis === 'composite') {
      const b = o.endDate != null ? toYear(o.endDate) : null;
      if (b == null || b <= a) { rejected.push({ id, reason: 'composite-needs-a-period', detail: 'endDate' }); return; }
      t = (a + b) / 2;
    }
    admitted.push(Object.assign({}, o, { id, t }));
  });
  admitted.sort((x, y) => x.t - y.t);
  return { admitted, rejected };
}

/* Chronos が指した日（asOf: 'YYYY-MM-DD'）に使ってよい観測。撮影日が確かなものだけから、最も近いものを toleranceDays 以内で。
   無ければ obs:null と理由を返す（近い年の別の画像を黙って当てない）。 */
export function selectForTime(obs, asOf, opt) {
  const tol = (opt && opt.toleranceDays != null ? +opt.toleranceDays : 30) / 365.25, target = toYear(asOf);
  if (target == null) return { obs: null, reason: 'asOf-unparseable' };
  const { admitted, rejected } = admitObservations(obs);
  let best = null;
  for (const o of admitted) { const d = Math.abs(o.t - target); if (best == null || d < best.d) best = { o, d }; }
  if (!best) return { obs: null, reason: 'no-dated-observation', rejected };
  if (best.d > tol) return { obs: null, reason: 'nothing-within-tolerance', nearestDays: Math.round(best.d * 365.25), rejected };
  return { obs: best.o, offsetDays: Math.round((best.o.t - target) * 365.25), rejected };
}

/* 段差の統計量 gain = 1 − SSE(2 区間の平均)/SSE(全体の平均) の最大値。帰無（独立な正規雑音）の分布は n だけで決まる（比なので尺度に依らない）。
   観測の位置は入らないので、n ごとに simulate して分位を持つ（固定の閾値ではない）。シードは固定＝再現可能。 */
function bestStep(y, minSeg) {
  const n = y.length, ps = [0]; for (let i = 0; i < n; i++) ps.push(ps[i] + y[i]);
  const pq = [0]; for (let i = 0; i < n; i++) pq.push(pq[i] + y[i] * y[i]);
  const sse = (a, b) => { const m = b - a, s = ps[b] - ps[a]; return (pq[b] - pq[a]) - s * s / m; };
  const tot = sse(0, n); if (!(tot > 1e-12)) return { gain: 0, k: -1 };
  let best = { gain: -1, k: -1 };
  for (let k = minSeg; k <= n - minSeg; k++) { const g = 1 - (sse(0, k) + sse(k, n)) / tot; if (g > best.gain) best = { gain: g, k }; }
  return best;
}
const NULL_CACHE = new Map();
export function stepCritical(n, alpha) {
  const key = n + ':' + alpha; if (NULL_CACHE.has(key)) return NULL_CACHE.get(key);
  const rng = mulberry32(1234567 + n), gains = [], sims = 1500;
  for (let s = 0; s < sims; s++) { const y = new Array(n); for (let i = 0; i < n; i++) y[i] = normal(rng); gains.push(bestStep(y, 2).gain); }
  gains.sort((a, b) => a - b); const c = quantile(gains, 1 - alpha); NULL_CACHE.set(key, c); return c;
}

/* 1 画素（または 1 地域の指標）の系列。ts は小数の年（昇順でなくてよい）、ys は値（欠測は null/NaN）。
   slope = Theil–Sen（単位/年。外れ値に強い）・olsSlope・Mann–Kendall の z と p（同順位の補正つき）。
   step = 平均の段差が最大になる位置。timing は**撮影日で挟んだ区間**（段差がどの観測の間で起きたかまでしか言えない）。
   pattern: insufficient（n < minObs）/ stable / gradual（単調な傾向が有意で、直線のほうが段差より当てはまる）/ abrupt（段差が帰無より有意で、段差のほうが直線より当てはまる）。 */
export function seriesStats(ts, ys, opt) {
  opt = opt || {};
  const alpha = opt.alpha != null ? +opt.alpha : 0.05, minObs = opt.minObs != null ? +opt.minObs : 5;
  const pts = []; for (let i = 0; i < ts.length; i++) if (isNum(ts[i]) && isNum(ys[i])) pts.push([ts[i], ys[i]]);
  pts.sort((a, b) => a[0] - b[0]);
  const n = pts.length, out = { n, pattern: 'insufficient', direction: 0 };
  if (n < minObs) return out;
  const t = pts.map((p) => p[0]), y = pts.map((p) => p[1]);
  /* Theil–Sen と OLS */
  const sl = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (t[j] > t[i]) sl.push((y[j] - y[i]) / (t[j] - t[i]));
  const ts_ = sl.length ? median(sl) : 0;
  const tm = mean(t), ym = mean(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (t[i] - tm) * (y[i] - ym); sxx += (t[i] - tm) ** 2; syy += (y[i] - ym) ** 2; }
  const ols = sxx > 0 ? sxy / sxx : 0, r2 = (sxx > 0 && syy > 0) ? (sxy * sxy) / (sxx * syy) : 0;
  /* Mann–Kendall */
  let S = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) S += Math.sign(y[j] - y[i]);
  const ties = new Map(); y.forEach((v) => ties.set(v, (ties.get(v) || 0) + 1));
  let tieTerm = 0; ties.forEach((c) => { if (c > 1) tieTerm += c * (c - 1) * (2 * c + 5); });
  const varS = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  const z = varS > 0 ? (S === 0 ? 0 : (S - Math.sign(S)) / Math.sqrt(varS)) : 0, p = varS > 0 ? pTwoSided(z) : 1;
  const st = bestStep(y, 2), k = st.k;
  let step = null;
  if (k > 0) {
    const before = mean(y.slice(0, k)), after = mean(y.slice(k));
    step = { gain: st.gain, critical: stepCritical(n, alpha), before, after, delta: after - before, between: [t[k - 1], t[k]] };
  }
  Object.assign(out, { slope: ts_, olsSlope: ols, linearR2: r2, mk: { z, p, S }, step, t0: t[0], t1: t[n - 1] });
  const stepSig = step && step.gain > step.critical, trendSig = p < alpha;
  if (stepSig && step.gain > r2) { out.pattern = 'abrupt'; out.direction = Math.sign(step.delta); }
  else if (trendSig) { out.pattern = 'gradual'; out.direction = Math.sign(ts_) || Math.sign(S); }
  else out.pattern = 'stable';
  return out;
}

const PATTERN_CODE = { insufficient: 0, stable: 1, gradual: 2, abrupt: 3 };
export const PATTERNS = Object.freeze(Object.keys(PATTERN_CODE));

/* 同じ格子の N 枚のラスターから、画素ごとの変化を測る。
   layers: [{id, date, endDate?, dateBasis, data}]（data は row-major の数値配列。nodata は opt.nodata か NaN）。
   撮影日を観測として述べていない層は系列に入れず、rejected に理由つきで返す。
   戻り値: bands（slope・p・breakFrom・breakTo・delta・pattern・n）と summary（型の割合・段差が起きた年の分布・速さの分位）。 */
export function analyzeRasterSeries(spec, opt) {
  opt = opt || {};
  const { admitted, rejected } = admitObservations(spec.layers);
  const W = spec.width, H = spec.height, N = W * H;
  const need = opt.minObs != null ? +opt.minObs : 5;
  if (admitted.length < need) return { ok: false, code: 'TOO_FEW_DATED_OBSERVATIONS', have: admitted.length, need, rejected, admitted: admitted.map((o) => o.id) };
  for (const l of admitted) if (!l.data || l.data.length !== N) return { ok: false, code: 'GRID_MISMATCH', detail: { id: l.id, length: l.data && l.data.length, expected: N } };
  const ts = admitted.map((o) => o.t), nd = opt.nodata;
  const slope = new Float32Array(N).fill(NaN), pv = new Float32Array(N).fill(NaN), bf = new Float32Array(N).fill(NaN), bt = new Float32Array(N).fill(NaN), dl = new Float32Array(N).fill(NaN);
  const pat = new Uint8Array(N), cnt = new Uint16Array(N);
  const tally = { insufficient: 0, stable: 0, gradual: 0, abrupt: 0 }, dirs = { up: 0, down: 0 };
  const speeds = [], breakYears = new Map();
  const ys = new Array(admitted.length);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < admitted.length; k++) { const v = admitted[k].data[i]; ys[k] = (isNum(v) && v !== nd) ? v : null; }
    const r = seriesStats(ts, ys, opt);
    cnt[i] = r.n; pat[i] = PATTERN_CODE[r.pattern]; tally[r.pattern]++;
    if (r.pattern === 'insufficient') continue;
    slope[i] = r.slope; pv[i] = r.mk.p;
    if (r.step) { dl[i] = r.step.delta; if (r.pattern === 'abrupt') { bf[i] = r.step.between[0]; bt[i] = r.step.between[1]; const yr = Math.floor((r.step.between[0] + r.step.between[1]) / 2); breakYears.set(yr, (breakYears.get(yr) || 0) + 1); } }
    if (r.pattern !== 'stable') { speeds.push(Math.abs(r.pattern === 'abrupt' ? 0 : r.slope)); if (r.direction > 0) dirs.up++; else if (r.direction < 0) dirs.down++; }
  }
  const valid = N - tally.insufficient;
  const frac = (c) => valid ? c / valid : null;
  const gs = []; for (let i = 0; i < N; i++) if (pat[i] === 2) gs.push(Math.abs(slope[i])); gs.sort((a, b) => a - b);
  return {
    ok: true, width: W, height: H, nObservations: admitted.length, span: [admitted[0].t, admitted.at(-1).t],
    admitted: admitted.map((o) => ({ id: o.id, date: o.date, endDate: o.endDate || null, basis: o.dateBasis, t: o.t })), rejected,
    bands: { slope, p: pv, breakFrom: bf, breakTo: bt, delta: dl, pattern: pat, n: cnt },
    patternCodes: PATTERN_CODE,
    summary: {
      pixels: N, analysed: valid, share: { stable: frac(tally.stable), gradual: frac(tally.gradual), abrupt: frac(tally.abrupt) },
      direction: dirs, gradualSpeedPerYear: { median: gs.length ? quantile(gs, 0.5) : null, p90: gs.length ? quantile(gs, 0.9) : null },
      abruptByYear: Array.from(breakYears.entries()).sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ year, count })),
      /* 偽陽性の目安: 雑音だけなら、この割合は alpha を超えない（段差・傾向の帰無は simulate で決めている）。 */
      alpha: opt.alpha != null ? +opt.alpha : 0.05,
    },
    caveats: ['timing-bracketed-by-observation-dates', 'change-is-not-cause', 'seasonality-not-removed-unless-same-season'],
  };
}

/* 季節を揃える: 同じ季節の観測だけを残す（年ごとに 1 枚、中心の日付に最も近いもの）。季節差を変化と取り違えないため。 */
export function sameSeason(obs, centerMonthDay, windowDays) {
  const [m, d] = String(centerMonthDay).split('-').map(Number), w = (windowDays != null ? +windowDays : 45) / 365.25;
  const { admitted, rejected } = admitObservations(obs), byYear = new Map();
  for (const o of admitted) {
    const y = Math.floor(o.t), c = toYear(y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0')), dist = Math.abs(o.t - c);
    if (dist > w) continue;
    const cur = byYear.get(y); if (!cur || dist < cur.dist) byYear.set(y, { o, dist });
  }
  return { kept: Array.from(byYear.values()).map((v) => v.o).sort((a, b) => a.t - b.t), rejected };
}

/* ══════════════ B. 意味分類 ══════════════ */

/* 原型 = 各クラスを特徴づける OSM 特徴と土地被覆の重み。事前知識（タグの意味）であって、較正した水準ではない。
   観測: 2026-11-20 の geo.similar の特徴の定義（js/geo-similar.js FEATURES の id）に対応。
   失効条件: FEATURES の id が変わる／土地被覆の語彙が変わる。 */
export const CLASS_PROTOTYPES = Object.freeze({
  port:        { label: 'port / harbour', labelJa: '港湾', w: { port: 3, port_land: 3, cranes: 3, industrial: 1, water: 1 } },
  industrial:  { label: 'industrial / logistics', labelJa: '工業・物流', w: { industrial: 3, roads_major: 1, rail: 1, cranes: 0.5 } },
  commercial:  { label: 'commercial / central', labelJa: '商業・業務', w: { commercial: 2, offices: 3, shops: 2, food: 1.5, stations: 1, tourism: 1 } },
  residential: { label: 'residential', labelJa: '住宅', w: { residential: 3, roads_local: 1, education: 1, health: 0.5, green: 0.5 } },
  agricultural:{ label: 'agricultural / rural', labelJa: '農業・農村', w: { farmland: 4, crops: 4 } },
  natural:     { label: 'natural / open', labelJa: '自然・緑地', w: { green: 1, water: 1, forest: 3, trees: 3 } },
});

/* 証拠: counts（FEATURES の順）・areaKm2・landcover（{crops, built, trees, water, ...} の面積割合 0..1。任意）・farmland（OSM の農地の件数。任意）。
   各クラスの得点 = 重み付き log1p 密度（件数は面積で割る）の和 ÷ 重みのノルム（特徴の多いクラスが薄まらない）。土地被覆の割合は密度ではなく 0..1 を 1 倍して足す。
   「描かれていない」を農村にしない: OSM 件数が 0 で、土地被覆も無いなら unclassified（mapped-nothing）。 */
export function classifyRegion(ev, opt) {
  opt = opt || {};
  const feats = opt.features || [], dens = {};
  feats.forEach((f, j) => { dens[f.id] = Math.log1p((ev.counts && ev.counts[j] || 0) / Math.max(1e-6, ev.areaKm2 || 1)); });
  if (ev.farmland != null) dens.farmland = Math.log1p(ev.farmland / Math.max(1e-6, ev.areaKm2 || 1));
  const lc = ev.landcover || {};
  for (const k of Object.keys(lc)) if (isNum(lc[k])) dens[k] = (dens[k] || 0) + 2 * lc[k];
  const total = Object.values(dens).reduce((a, b) => a + b, 0);
  const protos = opt.prototypes || CLASS_PROTOTYPES;
  const scores = Object.keys(protos).map((c) => {
    const w = protos[c].w; let num = 0, den = 0; const parts = [];
    for (const id of Object.keys(w)) { const v = dens[id] || 0; num += w[id] * v; den += w[id] * w[id]; if (v > 0) parts.push({ id, value: v, weight: w[id] }); }
    return { cls: c, score: den ? num / Math.sqrt(den) : 0, parts: parts.sort((a, b) => b.value * b.weight - a.value * a.weight).slice(0, 4) };
  }).sort((a, b) => b.score - a.score);
  const top = scores[0], second = scores[1], minEv = opt.minEvidence != null ? +opt.minEvidence : 0.15;
  if (!(total > 0)) return { cls: 'unclassified', why: 'mapped-nothing', scores, note: 'OSM にも土地被覆にも証拠が無い。農村・自然とは言わない（描かれていないだけかもしれない）。' };
  if (top.score < minEv) return { cls: 'unclassified', why: 'weak-evidence', scores };
  const margin = top.score - second.score;
  return { cls: margin < (opt.minMargin != null ? +opt.minMargin : 0.05) * Math.max(1, top.score) ? 'mixed' : top.cls, top: top.cls, second: second.cls, margin, scores, because: top.parts };
}

/* 利用者が正解（クラス名）を渡した地域から原型を学ぶ。標準化は地域の集合の中（js/geo-similar.js standardise と同じ規則）。
   1 つ抜き検証の正答率を返す。クラスごとに最低 2 件、全体で 6 件に満たなければ refuse。 */
export function fitPrototypes(rows, labels, opt) {
  const n = rows.length;
  if (n !== labels.length) return { ok: false, code: 'LENGTH_MISMATCH' };
  const by = new Map(); labels.forEach((l, i) => { if (!by.has(l)) by.set(l, []); by.get(l).push(i); });
  const small = Array.from(by.entries()).filter(([, v]) => v.length < 2).map(([k]) => k);
  if (n < 6 || by.size < 2 || small.length) return { ok: false, code: 'TOO_FEW_LABELLED', n, classes: by.size, underfilled: small };
  const dim = rows[0].length, mu = new Array(dim).fill(0), sd = new Array(dim).fill(0);
  for (let j = 0; j < dim; j++) { mu[j] = mean(rows.map((r) => r[j])); sd[j] = Math.sqrt(mean(rows.map((r) => (r[j] - mu[j]) ** 2))) || 1; }
  const Z = rows.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
  const centroid = (idx) => { const c = new Array(dim).fill(0); idx.forEach((i) => Z[i].forEach((v, j) => { c[j] += v / idx.length; })); return c; };
  const dist = (a, b) => Math.sqrt(a.reduce((s, v, j) => s + (v - b[j]) ** 2, 0));
  const cents = {}; by.forEach((idx, k) => { cents[k] = centroid(idx); });
  let correct = 0; const conf = {};
  for (let i = 0; i < n; i++) {
    let bestC = null, bd = Infinity;
    by.forEach((idx, k) => { const c = centroid(idx.filter((x) => x !== i)); const d = dist(Z[i], c); if (d < bd) { bd = d; bestC = k; } });
    if (bestC === labels[i]) correct++;
    conf[labels[i] + '>' + bestC] = (conf[labels[i] + '>' + bestC] || 0) + 1;
  }
  return { ok: true, model: { mu, sd, centroids: cents, classes: Array.from(by.keys()) }, looAccuracy: correct / n, majorityBaseline: Math.max(...Array.from(by.values()).map((v) => v.length)) / n, confusion: conf, n };
}
export function classifyWith(model, row) {
  const z = row.map((v, j) => (v - model.mu[j]) / model.sd[j]);
  const ds = model.classes.map((k) => ({ cls: k, d: Math.sqrt(z.reduce((s, v, j) => s + (v - model.centroids[k][j]) ** 2, 0)) })).sort((a, b) => a.d - b.d);
  return { cls: ds[0].cls, distances: ds, margin: ds[1] ? ds[1].d - ds[0].d : null };
}

/* ══════════════ C. 変化の解釈 ══════════════ */

/* change: { bbox:[w,s,e,n], from, to (小数の年。段差の挟む区間か、系列の範囲), direction?, kind? }
   context: { facilities:[{id?,name,kind?,lat,lng,openedAt?,source}], news:[{title,date,lat?,lng?,url?,source}], stats:[{name,series:[{year,value}],source}], changeSeries?:[{year,value}] }
   戻り値: 場所と時期が一致した順の証拠。関係は 'coincides' までで、因果は述べない。
   ・時期: 変化の区間 [from,to] の前後 tolYears に入るか。区間より後のものは 'followed-the-change'（説明に使えない）。
   ・場所: bbox の中、または中心から nearKm 以内。
   ・日付の無い施設は 'date-unknown'（場所は一致しても時期を結べない）。 */
export function interpretChange(change, context, opt) {
  opt = opt || {};
  const tol = opt.toleranceYears != null ? +opt.toleranceYears : 1, nearKm = opt.nearKm != null ? +opt.nearKm : 2;
  const [w, s, e, n] = change.bbox, cLat = (s + n) / 2, cLng = (w + e) / 2;
  const where = (lat, lng) => {
    if (!isNum(lat) || !isNum(lng)) return { rel: 'unlocated', km: null };
    if (lng >= w && lng <= e && lat >= s && lat <= n) return { rel: 'inside', km: 0 };
    const km = haversineKm(cLat, cLng, lat, lng); return { rel: km <= nearKm ? 'near' : 'far', km };
  };
  const when = (t) => {
    if (t == null) return { rel: 'date-unknown' };
    if (t < change.from - tol) return { rel: 'before-the-window', yearsBefore: change.from - t };
    if (t <= change.to + tol) return { rel: 'in-the-window' };
    return { rel: 'followed-the-change', yearsAfter: t - change.to };
  };
  const ev = [];
  for (const f of (context.facilities || [])) {
    const wh = where(+f.lat, +f.lng); if (wh.rel === 'far' || wh.rel === 'unlocated') continue;
    const t = toYear(f.openedAt), wn = when(t);
    ev.push({ type: 'facility', name: f.name, kind: f.kind || null, source: f.source || null, where: wh, when: wn, usable: wn.rel === 'in-the-window' || wn.rel === 'before-the-window' });
  }
  for (const nw of (context.news || [])) {
    const wh = (nw.lat != null && nw.lng != null) ? where(+nw.lat, +nw.lng) : { rel: 'unlocated', km: null };
    if (wh.rel === 'far') continue;
    const wn = when(toYear(nw.date));
    ev.push({ type: 'news', name: nw.title, url: nw.url || null, source: nw.source || null, where: wh, when: wn, usable: wh.rel !== 'unlocated' && wn.rel === 'in-the-window' });
  }
  for (const st of (context.stats || [])) {
    const ser = (st.series || []).filter((r) => isNum(r.year) && isNum(r.value));
    const cs = (context.changeSeries || []).filter((r) => isNum(r.year) && isNum(r.value));
    let rho = null, m = 0;
    if (cs.length && ser.length) {
      const pairs = ser.map((r) => { const c = cs.find((x) => x.year === r.year); return c ? [r.value, c.value] : null; }).filter(Boolean); m = pairs.length;
      if (m >= 5) rho = spearman(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
    }
    ev.push({ type: 'statistic', name: st.name, source: st.source || null, where: { rel: 'region-level', km: null }, when: { rel: 'series' }, rho, nYears: m, usable: rho != null && Math.abs(rho) >= 0.7 && m >= 5, note: rho == null ? 'series does not overlap the change series in ≥5 years: no association measured' : 'rank correlation over overlapping years; correlation is not cause' });
  }
  const rank = (x) => (x.usable ? 0 : 2) + (x.where.rel === 'inside' ? 0 : 1);
  ev.sort((a, b) => rank(a) - rank(b));
  return {
    change: { bbox: change.bbox, from: change.from, to: change.to, direction: change.direction || null },
    evidence: ev, usable: ev.filter((x) => x.usable).length,
    caveats: ['coincidence-in-place-and-time-is-not-cause', 'facilities-without-a-stated-date-cannot-be-tied-to-timing', 'things-that-followed-the-change-cannot-explain-it', 'absence-from-this-list-is-not-evidence-of-absence'],
  };
}
function spearman(a, b) {
  const rk = (v) => { const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]), r = new Array(v.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; };
  const ra = rk(a), rb = rk(b), ma = mean(ra), mb = mean(rb); let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < ra.length; i++) { sab += (ra[i] - ma) * (rb[i] - mb); saa += (ra[i] - ma) ** 2; sbb += (rb[i] - mb) ** 2; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null;
}

/* ══════════════ D. 予測モデル ══════════════ */

/* ── 特徴量づくり（宣言から数へ）。どれも (point)=>{名前: 値} を返す関数を作る。値が取れない所は NaN（0 にしない）── */
export function rasterFeature(name, r, opt) {
  const rad = opt && opt.radiusPx != null ? +opt.radiusPx : 0;
  const at = (lng, lat) => { const c = Math.floor((lng - r.grid.west) / r.grid.pixelLng), rw = Math.floor((r.grid.north - lat) / r.grid.pixelLat); return (c >= 0 && c < r.width && rw >= 0 && rw < r.height) ? [c, rw] : null; };
  const v = (c, rw) => { const x = r.data[rw * r.width + c]; return (isNum(x) && x !== r.nodata) ? x : NaN; };
  return (p) => {
    const px = at(p.lng, p.lat), o = {}; if (!px) { o[name] = NaN; if (rad > 0) o[name + '_mean' + rad] = NaN; return o; }
    o[name] = v(px[0], px[1]);
    if (rad > 0) { const vs = []; for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const c = px[0] + dx, rw = px[1] + dy; if (c >= 0 && c < r.width && rw >= 0 && rw < r.height) { const q = v(c, rw); if (isFinite(q)) vs.push(q); } } o[name + '_mean' + rad] = vs.length ? mean(vs) : NaN; }
    return o;
  };
}
export function pointCountFeature(name, pts, radiiKm) {
  return (p) => { const o = {}; for (const R of radiiKm) { let c = 0; for (const q of pts) if (haversineKm(p.lat, p.lng, q.lat, q.lng) <= R) c++; o[name + '_n' + R + 'km'] = c; } return o; };
}
export function nearestDistanceFeature(name, pts) {
  return (p) => { let d = Infinity; for (const q of pts) { const x = haversineKm(p.lat, p.lng, q.lat, q.lng); if (x < d) d = x; } const o = {}; o[name + '_km'] = isFinite(d) ? d : NaN; return o; };
}
export function insidePolygonFeature(name, rings) {
  const inRing = (ring, x, y) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  return (p) => { const o = {}; o[name] = rings.some((r) => inRing(r, p.lng, p.lat)) ? 1 : 0; return o; };
}

/* 目的変数の表 + 特徴量の関数 → 学習表。
   points: [{id?, lat, lng, y, t?}]。y が数でない行・座標が無い行は落として数える。
   全行が NaN の列・分散 0 の列は落として名前を返す（黙って次元を減らさない）。 */
export function assembleTable(points, featureFns, opt) {
  opt = opt || {};
  const keep = [], dropped = { rows: 0 };
  for (const p of points) { if (isNum(p.y) && isNum(p.lat) && isNum(p.lng)) keep.push(p); else dropped.rows++; }
  const raw = keep.map((p) => { const x = {}; for (const f of featureFns) Object.assign(x, f(p)); if (opt.coords) { x.lat = p.lat; x.lng = p.lng; } return x; });
  const names = Array.from(new Set(raw.flatMap((x) => Object.keys(x)))), droppedCols = [];
  const good = names.filter((nm) => { const vs = raw.map((x) => x[nm]).filter(isNum); if (!vs.length) { droppedCols.push({ name: nm, why: 'no-value-anywhere' }); return false; } if (Math.max(...vs) === Math.min(...vs)) { droppedCols.push({ name: nm, why: 'constant' }); return false; } return true; });
  const missing = {}; good.forEach((nm) => { missing[nm] = raw.filter((x) => !isNum(x[nm])).length; });
  return {
    rows: keep.map((p, i) => ({ id: p.id != null ? p.id : i, lat: p.lat, lng: p.lng, y: p.y, t: p.t != null ? p.t : null, x: good.map((nm) => (isNum(raw[i][nm]) ? raw[i][nm] : NaN)) })),
    names: good, droppedRows: dropped.rows, droppedColumns: droppedCols, missing,
  };
}

/* ── モデル ── */
function impute(rows, med) { return rows.map((r) => r.map((v, j) => (isNum(v) ? v : med[j]))); }
function columnStats(X) { const p = X[0].length, med = [], mu = [], sd = []; for (let j = 0; j < p; j++) { const col = X.map((r) => r[j]).filter(isNum); med.push(col.length ? median(col) : 0); } const Xi = impute(X, med); for (let j = 0; j < p; j++) { const c = Xi.map((r) => r[j]); mu.push(mean(c)); sd.push(Math.sqrt(mean(c.map((v) => (v - mu[j]) ** 2))) || 1); } return { med, mu, sd, lo: Array.from({ length: p }, (_, j) => Math.min(...Xi.map((r) => r[j]))), hi: Array.from({ length: p }, (_, j) => Math.max(...Xi.map((r) => r[j]))) }; }

function solve(A, b) { const n = b.length, M = A.map((r, i) => r.concat([b[i]])); for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; const d = M[i][i] || 1e-12; for (let r = i + 1; r < n; r++) { const f = M[r][i] / d; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; } } const x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c]; x[i] = s / (M[i][i] || 1e-12); } return x; }

export function fitRidge(X, y, lambda) {
  const cs = columnStats(X), Z = impute(X, cs.med).map((r) => r.map((v, j) => (v - cs.mu[j]) / cs.sd[j])), p = Z[0].length, ym = mean(y);
  const A = Array.from({ length: p }, () => new Array(p).fill(0)), b = new Array(p).fill(0);
  for (let i = 0; i < Z.length; i++) for (let a = 0; a < p; a++) { b[a] += Z[i][a] * (y[i] - ym); for (let c = 0; c < p; c++) A[a][c] += Z[i][a] * Z[i][c]; }
  for (let a = 0; a < p; a++) A[a][a] += lambda;
  const beta = solve(A, b);
  return { kind: 'ridge', cs, beta, ym, lambda, predict: (Xn) => impute(Xn, cs.med).map((r) => ym + r.reduce((s, v, j) => s + beta[j] * (v - cs.mu[j]) / cs.sd[j], 0)) };
}

function growTree(X, y, idx, depth, o, rng) {
  const n = idx.length, ym = mean(idx.map((i) => y[i]));
  if (depth >= o.maxDepth || n < 2 * o.minLeaf) return { v: ym };
  const p = X[0].length, cand = []; const pool = Array.from({ length: p }, (_, j) => j);
  for (let k = 0; k < o.mtry && pool.length; k++) cand.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  let best = null;
  for (const j of cand) {
    const order = idx.slice().sort((a, b) => X[a][j] - X[b][j]); let sl = 0, sr = 0, ql = 0, qr = 0;
    for (const i of order) { sr += y[i]; qr += y[i] * y[i]; }
    for (let k = 0; k < n - 1; k++) {
      const i = order[k]; sl += y[i]; ql += y[i] * y[i]; sr -= y[i]; qr -= y[i] * y[i];
      if (X[order[k + 1]][j] === X[i][j]) continue; const nl = k + 1, nr = n - nl; if (nl < o.minLeaf || nr < o.minLeaf) continue;
      const sse = (ql - sl * sl / nl) + (qr - sr * sr / nr);
      if (!best || sse < best.sse) best = { sse, j, thr: (X[i][j] + X[order[k + 1]][j]) / 2 };
    }
  }
  if (!best) return { v: ym };
  const L = idx.filter((i) => X[i][best.j] <= best.thr), R = idx.filter((i) => X[i][best.j] > best.thr);
  return { j: best.j, thr: best.thr, l: growTree(X, y, L, depth + 1, o, rng), r: growTree(X, y, R, depth + 1, o, rng) };
}
const walk = (t, x) => { while (t.j != null) t = x[t.j] <= t.thr ? t.l : t.r; return t.v; };

/* 木の集まり。既定は Breiman の慣行: mtry = ⌊p/3⌋（回帰）・葉の最小 3・深さ 8・木 100 本（本数は分散を下げるだけで、増やして悪くならない）。 */
export function fitForest(X, y, opt) {
  opt = opt || {}; const cs = columnStats(X), Xi = impute(X, cs.med), p = Xi[0].length, rng = mulberry32(opt.seed != null ? opt.seed : 7);
  const o = { maxDepth: opt.maxDepth || 8, minLeaf: opt.minLeaf || 3, mtry: opt.mtry || Math.max(1, Math.floor(p / 3)) }, T = opt.trees || 100, trees = [];
  for (let b = 0; b < T; b++) { const idx = Array.from({ length: Xi.length }, () => Math.floor(rng() * Xi.length)); trees.push(growTree(Xi, y, idx, 0, o, rng)); }
  return { kind: 'forest', cs, trees, predict: (Xn) => impute(Xn, cs.med).map((r) => mean(trees.map((t) => walk(t, r)))), spread: (Xn) => impute(Xn, cs.med).map((r) => { const v = trees.map((t) => walk(t, r)), m = mean(v); return Math.sqrt(mean(v.map((q) => (q - m) ** 2))); }) };
}

function fitOne(kind, X, y, opt) { return kind === 'ridge' ? fitRidge(X, y, opt.lambda != null ? opt.lambda : 1) : kind === 'forest' ? fitForest(X, y, opt) : (() => { const m = mean(y); return { kind: 'mean', predict: (Xn) => Xn.map(() => m) }; })(); }

/* ── 分割 ── */
function toKm(rows) { const lat0 = mean(rows.map((r) => r.lat)), c = Math.cos(lat0 * Math.PI / 180); return rows.map((r) => [r.lng * KM_PER_DEG * c, r.lat * KM_PER_DEG]); }
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* 空間ブロック分割。格子の 1 ブロックは全部同じ fold に入る（近い点が学習と評価に割れない）。
   blockKm 既定 = 範囲の長辺の 1/4（少なくとも 16 ブロック程度に割れる）。bufferKm > 0 なら、評価の点から bufferKm 以内の点を学習から外す。 */
export function spatialFolds(rows, opt) {
  opt = opt || {}; const k = opt.folds || 5, xy = toKm(rows);
  const ext = Math.max(Math.max(...xy.map((p) => p[0])) - Math.min(...xy.map((p) => p[0])), Math.max(...xy.map((p) => p[1])) - Math.min(...xy.map((p) => p[1])));
  const blockKm = opt.blockKm > 0 ? +opt.blockKm : Math.max(ext / 4, 1e-6), x0 = Math.min(...xy.map((p) => p[0])), y0 = Math.min(...xy.map((p) => p[1]));
  const blocks = new Map(); xy.forEach((p, i) => { const key = Math.floor((p[0] - x0) / blockKm) + ':' + Math.floor((p[1] - y0) / blockKm); if (!blocks.has(key)) blocks.set(key, []); blocks.get(key).push(i); });
  if (blocks.size < k) return { ok: false, code: 'TOO_FEW_BLOCKS', blocks: blocks.size, folds: k, blockKm };
  const rng = mulberry32(opt.seed != null ? opt.seed : 11), keys = Array.from(blocks.keys()).sort(); for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
  const folds = Array.from({ length: k }, () => ({ test: [], train: [] })); keys.forEach((key, i) => folds[i % k].test.push(...blocks.get(key)));
  const buf = opt.bufferKm > 0 ? +opt.bufferKm : 0;
  folds.forEach((f) => { const ts = new Set(f.test); for (let i = 0; i < rows.length; i++) { if (ts.has(i)) continue; if (buf > 0 && f.test.some((j) => dist2(xy[i], xy[j]) <= buf)) continue; f.train.push(i); } });
  return { ok: true, folds: folds.filter((f) => f.test.length && f.train.length >= 3), blockKm, blocks: blocks.size, bufferKm: buf };
}
export function randomFolds(rows, opt) { const k = (opt && opt.folds) || 5, rng = mulberry32((opt && opt.seed) || 13), idx = rows.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } const f = Array.from({ length: k }, () => ({ test: [], train: [] })); idx.forEach((i, n) => f[n % k].test.push(i)); f.forEach((g) => { const ts = new Set(g.test); g.train = idx.filter((i) => !ts.has(i)); }); return f; }
export function temporalSplit(rows, cutoff) {
  const ts = Array.from(new Set(rows.map((r) => r.t).filter(isNum))).sort((a, b) => a - b); if (ts.length < 2) return { ok: false, code: 'NO_TIME_AXIS' };
  const cut = cutoff != null ? +cutoff : ts[Math.max(1, Math.floor(ts.length * 0.75))];
  const train = [], test = []; rows.forEach((r, i) => { if (!isNum(r.t)) return; (r.t < cut ? train : test).push(i); });
  if (train.length < 3 || test.length < 1) return { ok: false, code: 'SPLIT_EMPTY', train: train.length, test: test.length, cutoff: cut };
  return { ok: true, cutoff: cut, train, test };
}

/* ── 評価 ── */
export function metrics(y, yhat, baseline) {
  const n = y.length, e = y.map((v, i) => v - yhat[i]), rmse = Math.sqrt(mean(e.map((v) => v * v))), mae = mean(e.map(Math.abs)), ym = mean(y);
  const sst = y.reduce((s, v) => s + (v - ym) ** 2, 0), r2 = sst > 0 ? 1 - e.reduce((s, v) => s + v * v, 0) / sst : null;
  const bRmse = baseline ? Math.sqrt(mean(y.map((v, i) => (v - baseline[i]) ** 2))) : null;
  return { n, rmse, mae, r2, baselineRmse: bRmse, skill: bRmse > 0 ? 1 - rmse / bRmse : null };
}
function oof(kind, X, y, folds, opt) {
  const pred = new Array(y.length).fill(NaN), base = new Array(y.length).fill(NaN);
  for (const f of folds) { const m = fitOne(kind, f.train.map((i) => X[i]), f.train.map((i) => y[i]), opt), bm = mean(f.train.map((i) => y[i])), P = m.predict(f.test.map((i) => X[i])); f.test.forEach((i, k) => { pred[i] = P[k]; base[i] = bm; }); }
  return { pred, base, folds: folds.map((f) => f.test) };
}
function scored(y, o) { const wins = (o.folds || []).filter((te) => { const ok = te.filter((i) => isNum(o.pred[i])); if (!ok.length) return false; return mean(ok.map((i) => (y[i] - o.pred[i]) ** 2)) < mean(ok.map((i) => (y[i] - o.base[i]) ** 2)); }).length; const ix = y.map((_, i) => i).filter((i) => isNum(o.pred[i])); return Object.assign(metrics(ix.map((i) => y[i]), ix.map((i) => o.pred[i]), ix.map((i) => o.base[i])), { covered: ix.length, foldWins: wins, foldCount: (o.folds || []).length }); }

/* 並べて評価する。table = assembleTable の結果。
   spatial: 空間ブロック CV（本命）／random: ランダム CV（比較のため。空間的な自己相関で点が良く見える分を見せる）／temporal: t が全行にあるとき、cutoff より後で評価。
   モデル候補は ridge（λ は空間 CV の RMSE で選ぶ。候補 0.01〜100 は標準化後の尺度で 1 を中心にした 4 桁）・forest・mean（基準）。 */
export function crossValidate(table, opt) {
  opt = opt || {}; const rows = table.rows, y = rows.map((r) => r.y), X = rows.map((r) => r.x);
  if (rows.length < (opt.minRows || 20)) return { ok: false, code: 'TOO_FEW_ROWS', n: rows.length, need: opt.minRows || 20 };
  if (!table.names.length) return { ok: false, code: 'NO_USABLE_FEATURES', droppedColumns: table.droppedColumns };
  const sp = spatialFolds(rows, opt); if (!sp.ok) return Object.assign({ ok: false }, sp);
  const rnd = randomFolds(rows, opt), out = { ok: true, n: rows.length, design: { blockKm: sp.blockKm, blocks: sp.blocks, folds: sp.folds.length, bufferKm: sp.bufferKm }, models: {} };
  const kinds = [['mean', {}], ['forest', { seed: opt.seed }]]; for (const l of (opt.lambdas || [0.01, 0.1, 1, 10, 100])) kinds.push(['ridge', { lambda: l }]);
  const res = kinds.map(([kind, o]) => { const sO = oof(kind, X, y, sp.folds, o); return { kind, o, spatialOof: sO, spatial: scored(y, sO) }; });
  const bestRidge = res.filter((r) => r.kind === 'ridge').sort((a, b) => a.spatial.rmse - b.spatial.rmse)[0];
  const chosen = [res.find((r) => r.kind === 'mean'), res.find((r) => r.kind === 'forest'), bestRidge];
  for (const r of chosen) {
    const label = r.kind === 'ridge' ? 'ridge' : r.kind, rO = oof(r.kind, X, y, rnd, r.o);
    out.models[label] = { options: r.o, spatial: r.spatial, random: scored(y, rO), inflation: (isNum(scored(y, rO).rmse) && r.spatial.rmse > 0) ? 1 - scored(y, rO).rmse / r.spatial.rmse : null };
    out.models[label]._oof = r.spatialOof;
  }
  const tp = rows.every((r) => isNum(r.t)) ? temporalSplit(rows, opt.cutoff) : { ok: false, code: 'NO_TIME_AXIS' };
  out.temporal = { ok: tp.ok, code: tp.code || null };
  if (tp.ok) { out.temporal.cutoff = tp.cutoff; out.temporal.models = {}; for (const r of chosen) { const m = fitOne(r.kind, tp.train.map((i) => X[i]), tp.train.map((i) => y[i]), r.o), P = m.predict(tp.test.map((i) => X[i])), b = mean(tp.train.map((i) => y[i])); out.temporal.models[r.kind] = metrics(tp.test.map((i) => y[i]), P, P.map(() => b)); out.temporal.train = tp.train.length; out.temporal.test = tp.test.length; } }
  const cand = ['forest', 'ridge'].filter((k) => out.models[k]); cand.sort((a, b) => out.models[a].spatial.rmse - out.models[b].spatial.rmse);
  out.best = cand[0]; out.bestOptions = out.models[out.best].options;
  return out;
}

/* 分割共形の区間: 空間 CV の残差の絶対値から、(n+1)(1−α) 番目の分位。coverage は「他の fold の分位を当てた fold の実測」。 */
export function conformal(y, oofPred, folds, alpha) {
  const a = alpha != null ? +alpha : 0.1, res = y.map((v, i) => Math.abs(v - oofPred[i]));
  const q = (idxs) => { const s = idxs.map((i) => res[i]).filter(isNum).sort((p, r) => p - r), n = s.length; if (!n) return NaN; const k = Math.ceil((n + 1) * (1 - a)); return k > n ? Infinity : s[k - 1]; };
  const all = y.map((_, i) => i).filter((i) => isNum(oofPred[i])), half = q(all);
  let hit = 0, tot = 0; for (const f of folds) { const other = all.filter((i) => !f.test.includes(i)), h = q(other); for (const i of f.test) if (isNum(res[i])) { tot++; if (res[i] <= h) hit++; } }
  return { level: 1 - a, halfWidth: half, empiricalCoverage: tot ? hit / tot : null, n: all.length };
}

/* 学習して、新しい点へ予測する。newRows: [{lat,lng,x:[…]}]（table.names と同じ順の特徴）。
   各点に pred・lo・hi と、予測の外挿の印（学習の範囲外の特徴・学習点からの距離）を付ける。範囲外の点の区間は検証の外にあるので extrapolating で述べる。 */
export function fitAndPredict(table, newRows, opt) {
  opt = opt || {}; const cv = crossValidate(table, opt); if (!cv.ok) return cv;
  const rows = table.rows, y = rows.map((r) => r.y), X = rows.map((r) => r.x), sp = spatialFolds(rows, opt);
  const model = fitOne(cv.best, X, y, cv.bestOptions), oofP = cv.models[cv.best]._oof.pred;
  const cf = conformal(y, oofP, sp.folds, opt.alpha), P = model.predict(newRows.map((r) => r.x)), cs = columnStats(X);
  const trainXY = toKm(rows), lat0 = mean(rows.map((r) => r.lat)), c = Math.cos(lat0 * Math.PI / 180);
  const preds = newRows.map((r, i) => {
    const out = []; r.x.forEach((v, j) => { if (isNum(v) && (v < cs.lo[j] || v > cs.hi[j])) out.push(table.names[j]); });
    const p = [r.lng * KM_PER_DEG * c, r.lat * KM_PER_DEG]; let d = Infinity; for (const q of trainXY) { const x = dist2(p, q); if (x < d) d = x; }
    return { id: r.id != null ? r.id : i, lat: r.lat, lng: r.lng, pred: P[i], lo: P[i] - cf.halfWidth, hi: P[i] + cf.halfWidth, outOfRange: out, distToTrainKm: d, extrapolating: out.length > 0 || d > cv.design.blockKm };
  });
  const warnings = [], sk = cv.models[cv.best].spatial.skill;
  const mm = cv.models[cv.best].spatial; if (!(sk > 0 && mm.foldWins === mm.foldCount)) warnings.push('does-not-beat-the-mean-under-spatial-validation');
  if (cv.models[cv.best].inflation > 0.15) warnings.push('random-split-flatters-the-model (spatial autocorrelation)');
  if (cf.empiricalCoverage != null && cf.empiricalCoverage < cf.level - 0.1) warnings.push('interval-undercovers-in-held-out-blocks');
  if (cv.temporal.ok && cv.temporal.models[cv.best] && !(cv.temporal.models[cv.best].skill > 0)) warnings.push('does-not-beat-the-mean-on-the-future');
  if (!cv.temporal.ok) warnings.push('no-temporal-validation (' + cv.temporal.code + ')');
  const imp = importance(model, X, y, sp.folds, table.names, cv.best, cv.bestOptions);
  return { ok: true, model: { kind: cv.best, options: cv.bestOptions }, features: table.names, validation: stripOof(cv), interval: cf, importance: imp, predictions: preds, warnings, dropped: { rows: table.droppedRows, columns: table.droppedColumns } };
}
function stripOof(cv) { const c = JSON.parse(JSON.stringify(cv, (k, v) => (k === '_oof' ? undefined : v))); return c; }
/* 置換重要度: 空間 CV の評価 fold で、1 特徴を並べ替えたときの RMSE の増加。 */
function importance(_m, X, y, folds, names, kind, o) {
  const rng = mulberry32(99), base = [], per = names.map(() => []);
  for (const f of folds) {
    const m = fitOne(kind, f.train.map((i) => X[i]), f.train.map((i) => y[i]), o), Xt = f.test.map((i) => X[i]), yt = f.test.map((i) => y[i]);
    const rm = (P) => Math.sqrt(mean(yt.map((v, i) => (v - P[i]) ** 2))), b = rm(m.predict(Xt)); base.push(b);
    names.forEach((_, j) => { const col = Xt.map((r) => r[j]); for (let i = col.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [col[i], col[k]] = [col[k], col[i]]; } const Xp = Xt.map((r, i) => { const q = r.slice(); q[j] = col[i]; return q; }); per[j].push(rm(m.predict(Xp)) - b); });
  }
  return names.map((nm, j) => ({ name: nm, rmseIncrease: mean(per[j]) })).sort((a, b) => b.rmseIncrease - a.rmseIncrease);
}

/* 地図へ戻す GeoJSON（点）。lo/hi/extrapolating を列に持つので、不確実性が着色・フィルタに使える。 */
export function predictionFeatures(result) {
  return (result.predictions || []).map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { id: p.id, prediction: p.pred, lower: p.lo, upper: p.hi, halfWidth: (p.hi - p.lo) / 2, extrapolating: p.extrapolating ? 1 : 0, distToTrainKm: p.distToTrainKm } }));
}

/* ── 農地の件数（FEATURES に農地が無いので、分類のためだけに 1 区画 1 リクエストで足す）。OSM の landuse の語彙。 */
export function farmlandCountQuery(bbox) {
  const b = bbox[1].toFixed(6) + ',' + bbox[0].toFixed(6) + ',' + bbox[3].toFixed(6) + ',' + bbox[2].toFixed(6);
  return '[out:json][timeout:60];\n(nwr["landuse"~"^(farmland|orchard|vineyard|meadow|greenhouse_horticulture|farmyard|plant_nursery)$"](' + b + '););out count;';
}
export function parseFarmland(json) {
  const c = ((json && json.elements) || []).find((e) => e && e.type === 'count');
  if (!c) throw new Error('Overpass returned no count for farmland');
  return +((c.tags && c.tags.total) || 0);
}
