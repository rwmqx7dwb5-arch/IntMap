/* ============================================================================
 *  IntMap · the plume model's answer-check — what it said against what was measured (js/radiation-hindcast.js)
 * ----------------------------------------------------------------------------
 *  Pure functions, no DOM and no network, so the gate (tests/radiation-hindcast-checks.test.mjs), the
 *  builder (scripts/build-radiation-hindcast.mjs) and the reader's panel (js/sims.js) all use THE SAME
 *  arithmetic. A comparison that the builder computed one way and the page displayed another way would
 *  be two answers to "how good is it".
 *
 *  THE UNIT OF COMPARISON IS THE OBSERVATION'S CELL. The survey reports one mean deposit per 0.05°
 *  cell (data/radiation-hindcast.json `obs`); the model deposits on a finer grid (0.01°). Each model
 *  member is summed into the observation's cells FIRST (mass over area, not a mean of densities), and
 *  only then are the percentiles taken across members — the percentile of a regridded map, which is
 *  the map a reader would draw, not a regridding of percentile maps.
 *
 *  THE MEASURES ARE IN LOG SPACE, BECAUSE DEPOSITION SPANS FIVE DECADES. A Pearson r on raw Bq/m² is
 *  decided by the dozen hottest cells; the one on log10 asks whether the model ranks and scales the
 *  whole field. They are the standard ones of atmospheric-transport evaluation (Chang & Hanna 2004:
 *  fractional bias, FAC2; and the figure of merit in space).
 * ==========================================================================*/
const DEG_M = 111320;
/* A model density below this is read as this. OBSERVED: the survey's smallest cell mean is 53 Bq/m²; a
   floor of 100 Bq/m² keeps log10 finite for a model cell the plume never reached without letting the
   "nothing" cell look like a near miss. Expires when the survey bundle is replaced by one with a
   different smallest value (the gate re-reads it). */
export const FLOOR_BQ_M2 = 100;
const L10 = (x) => Math.log10(Math.max(FLOOR_BQ_M2, x));

function quantile(sorted, p) {
  const h = (sorted.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

/* One simulate() result -> Float64Array of Bq/m2 in each observation cell.
   `obs` = [[lng, lat, bq_m2, n], ...]; `obsRes` the observation's cell size in degrees.
   A cell's area is the cell's own (cos at its centre latitude), never the sum of the model cells that
   happened to be non-empty — empty ones are part of the area the mass is spread over. */
export function regrid(res, obs, obsRes) {
  const dr = res.depRes, per = Math.round(obsRes / dr);   /* model cells per observation cell, per side */
  const half = Math.floor(per / 2);
  const bq = new Map();
  for (let k = 0; k < res.keys.length; k++) bq.set(res.keys[k], res.bq[k]);
  const out = new Float64Array(obs.length);
  for (let i = 0; i < obs.length; i++) {
    const ix = Math.round(obs[i][0] / dr), iy = Math.round(obs[i][1] / dr);
    let s = 0;
    for (let a = -half; a <= half; a++) for (let b = -half; b <= half; b++) {
      const v = bq.get((ix + a) * 100000 + (iy + b)); if (v) s += v;
    }
    const areaM2 = obsRes * DEG_M * Math.cos(obs[i][1] * Math.PI / 180) * obsRes * DEG_M;
    out[i] = s / areaM2;
  }
  return out;
}

/* Members (arrays of Bq/m2 per observation cell) -> p10 / p50 / p90 per cell. */
export function percentiles(members) {
  const n = members[0].length, p10 = new Float64Array(n), p50 = new Float64Array(n), p90 = new Float64Array(n);
  const v = new Float64Array(members.length);
  for (let i = 0; i < n; i++) {
    for (let m = 0; m < members.length; m++) v[m] = members[m][i];
    const s = Array.from(v).sort((x, y) => x - y);
    p10[i] = quantile(s, 0.1); p50[i] = quantile(s, 0.5); p90[i] = quantile(s, 0.9);
  }
  return { p10, p50, p90 };
}

function ranks(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]), r = new Array(a.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const m = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = m; i = j + 1;
  }
  return r;
}
function pearson(x, y) {
  const n = x.length; let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

/* The measures. `obs` = Bq/m2 per cell (the survey), `model` = {p10,p50,p90} per cell (Bq/m2),
   `areaKm2` per cell (for the figure of merit), `fmsThresholds` in Bq/m2.
   Every field is a number the gate can compare to a recorded one, and none is a verdict. */
export function compare(obs, model, areaKm2, fmsThresholds) {
  const n = obs.length, lo = [], lm = [];
  let sumLog = 0, fac2 = 0, fac5 = 0, inBand = 0, zero = 0, abs = 0;
  for (let i = 0; i < n; i++) {
    const o = L10(obs[i]), m = L10(model.p50[i]);
    lo.push(o); lm.push(m); sumLog += m - o; abs += Math.abs(m - o);
    const ratio = Math.pow(10, m - o);
    if (ratio >= 0.5 && ratio <= 2) fac2++;
    if (ratio >= 0.2 && ratio <= 5) fac5++;
    if (obs[i] >= model.p10[i] && obs[i] <= model.p90[i]) inBand++;
    if (model.p50[i] < FLOOR_BQ_M2) zero++;
  }
  const fms = {};
  for (const T of fmsThresholds || []) {
    let both = 0, either = 0;
    for (let i = 0; i < n; i++) { const a = obs[i] >= T, b = model.p50[i] >= T; if (a && b) both += areaKm2[i]; if (a || b) either += areaKm2[i]; }
    fms[T] = either > 0 ? both / either : null;
  }
  return {
    cells: n,
    pearsonLog: pearson(lo, lm),
    spearman: pearson(ranks(lo), ranks(lm)),
    /* mean of log10(model/obs): 0 is unbiased, +0.3 is a factor 2 too high */
    biasLog10: sumLog / n,
    meanAbsLog10: abs / n,
    fac2: fac2 / n, fac5: fac5 / n,
    /* share of cells whose measured value lies inside the model's p10-p90 band */
    bandCoverage: inBand / n,
    modelBelowFloor: zero / n,
    fms,
  };
}

/* ══ DRAWING IT ═════════════════════════════════════════════════════════════════════════════════
   The reader sees three maps of the same cells: what was measured, what the model said (p50), and
   where they disagree. Measured and model use ONE ladder — the simulator's own for a nuclide that has
   no deposition law (RAD.PLAIN_ZONES, decades of kBq/m²), passed in by the caller so this file does not
   import the model. A policy word (「強制移住」) must not be printed over a Japanese map, and the plain
   ladder carries none.
   The ratio map's edges are the metric's own: ±0.3 in log10 is the FAC2 criterion (a factor of 2),
   ±1 a decade, ±2 two decades — so a cell is "neutral" on the map exactly when it counts as a hit. */
export const RATIO_LADDER = Object.freeze([
  { max: -2,        c: '#08306b', k: 'r-lo2' },
  { max: -1,        c: '#2171b5', k: 'r-lo1' },
  { max: -0.3,      c: '#9ecae1', k: 'r-lo0' },
  { max: 0.3,       c: '#d9d9d9', k: 'r-ok' },
  { max: 1,         c: '#fdae6b', k: 'r-hi0' },
  { max: 2,         c: '#e6550d', k: 'r-hi1' },
  { max: Infinity,  c: '#a63603', k: 'r-hi2' },
]);
export function ratioBand(log10Ratio) { for (const b of RATIO_LADDER) if (log10Ratio < b.max || b.max === Infinity) return b; return RATIO_LADDER[RATIO_LADDER.length - 1]; }
function bandOf(kBq, bands) { for (const b of bands) if (kBq >= b.min) return b; return null; }

/* view: 'obs' | 'model' | 'ratio'. `bands` = the plain ladder ({min in kBq/m2, c, k}). Cells below the ladder's
   lowest band are not drawn, as in the simulator. In 'ratio' every cell is drawn: a cell the model left
   empty where something was measured is the loudest disagreement there is, and it reads as the floor. */
export function cellFeatures(bundle, view, bands) {
  const cells = bundle.obs.cells, res = bundle.conditions.obsRes, h = res / 2, out = [];
  for (let i = 0; i < cells.length; i++) {
    const [lng, lat, bq] = cells[i], m = bundle.model.cells[i];
    let c, props;
    if (view === 'ratio') {
      const lr = L10(m[1]) - L10(bq), b = ratioBand(lr);
      c = b.c; props = { c, k: b.k, log10Ratio: +lr.toFixed(2), obs: bq, model: m[1] };
    } else {
      const v = view === 'obs' ? bq : m[1], b = bandOf(v / 1000, bands);
      if (!b) continue;
      c = b.c; props = { c, k: b.k, bq_m2: v, ...(view === 'obs' ? { n: cells[i][3] } : { p10: m[0], p90: m[2] }) };
    }
    out.push({ type: 'Feature', properties: props,
      geometry: { type: 'Polygon', coordinates: [[[lng - h, lat - h], [lng + h, lat - h], [lng + h, lat + h], [lng - h, lat + h], [lng - h, lat - h]]] } });
  }
  return out;
}

/* ══ (science-next) THE ATTRIBUTION LADDER ═══════════════════════════════════════════════════════
   The bundle carries the preset's comparison at the top level (what a reader's run of the simulator gets)
   and, under `variants`, the same comparison with one stated change per rung (scripts/radiation-hindcast-config.mjs
   says which). The rung ids are the bundle's own — this file lists none, so a rung added by the builder is
   drawable without touching the panel or Atlas. `rungOf` hands back a bundle-shaped view of one rung, which is
   what cellFeatures() draws; an unknown id is null, never the preset in disguise. */
export function rungIds(bundle) { return ['preset'].concat(((bundle && bundle.variants) || []).map((v) => v.id)); }
export function rungOf(bundle, id) {
  if (!bundle) return null;
  if (id == null || id === 'preset') return { ...bundle, rung: 'preset' };
  const v = (bundle.variants || []).find((x) => x.id === id);
  return v ? { ...bundle, rung: v.id, model: v.model, metrics: v.metrics, rungConditions: v.conditions } : null;
}
