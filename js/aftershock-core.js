/* ============================================================================
 *  IntMap · js/aftershock-core.js — THE AFTERSHOCK FORECAST OF ONE EARTHQUAKE  (wave4-science)
 * ----------------------------------------------------------------------------
 *  After a large earthquake the question everyone asks next is «will there be more, and how big?». Seismology has a
 *  quantitative answer that has been issued operationally since Reasenberg & Jones (1989): the rate of aftershocks
 *  decays with time as the modified Omori law and their sizes follow the Gutenberg–Richter law,
 *
 *      λ(t, M) = 10^(a + b·(Mm − M)) · (t + c)^(−p)          (aftershocks per day of magnitude ≥ M, t days after)
 *
 *  and the productivity `a` of THIS sequence is learned, as it unfolds, from its own aftershocks — starting from what
 *  sequences in the same tectonic setting did (a prior). USGS published the global version of that recipe and its
 *  parameters (Page et al. 2016; the OpenSHA OAF code, CC0) but issues forecasts for a few sequences only (11 of the
 *  106 earthquakes of M6+ in 2026 to 2026-10-13 carry a USGS `oaf` product, measured). This file is the recipe, run for any
 *  earthquake in the USGS catalogue, by the same rules USGS's own code applies:
 *
 *    ① the regime   the mainshock's tectonic regime: the five California polygons first, else the García et al.
 *                   (2012) 0.05° regionalization (data/aftershock-regimes.json.gz, built from OAF's own files);
 *    ② the prior    the regime's generic a-value: Normal(mean, σ(Mm)) with σ(M)² = σ0² + σ1²/10^max(M,6), on OAF's grid;
 *    ③ the zone     a circle of the Wells & Coppersmith (1994) median rupture length (clipped as OAF clips it) around
 *                   the spherical centroid of the mainshock and its M≥magCentroid aftershocks;
 *    ④ the data     the aftershocks in the zone at or above the time-dependent completeness of Page et al. (2016),
 *                   Mc(t) = max(magCat, F·Mm − G − H·log10 t) — the catalogue misses small events in the first hours;
 *    ⑤ the update   the Bayesian combination with p and c fixed at the regime's values (OAF's RJ_AftershockModel_Bayesian
 *                   with a generic model whose p and c are single values): log L(a) = n·a·ln10 − 10^a·K, K = ∫ 10^(b(Mm−Mc(t)))(t+c)^−p dt;
 *    ⑥ the forecast for each window and magnitude, the probability of at least one and the 2.5 / 50 / 97.5 % of the
 *                   number, over the posterior mixture of Poisson counts — the numbers USGS's products print.
 *
 *  No DOM, no network, no clock of its own: node evaluates every function here (tests/wave4-science-checks.test.mjs);
 *  js/aftershock.js fetches, paints and words it.
 *  ⚠ A FORECAST IS A PROBABILITY, NOT A PREDICTION, AND THIS ONE IS NOT OFFICIAL. The card says so above the table and
 *    points to the national agency; where USGS has published its own forecast (it now uses an ETAS model) the card
 *    shows USGS's numbers beside these, never merged.
 *  ⚠ THE UNCERTAINTY IS PART OF THE ANSWER. Every probability comes with the 95 % range of the number, and the posterior
 *    of `a` is a distribution, not a point — a sequence with three aftershocks is forecast with the prior's width.
 *  ⚠ «COULD NOT CHECK» IS NOT «WRONG». A forecast issued in the past (the master clock) is compared with what the
 *    catalogue recorded after it, but only at magnitudes the catalogue records completely (≥ magCat) and only for
 *    windows that have ended — a smaller magnitude is said to be uncheckable, not scored.
 * ==========================================================================*/
import { haversineKm } from '../supabase/functions/_shared/great-circle.js';
/* a PLACE named by the reader (Atlas «aftershocks near Kumamoto») is sent the way the earthquake record of a place sends it: rounded to
   whole degrees and the radius widened to cover the rounding — one privacy rule, not a second one (js/quake-history-core.js) */
import { QH, roundedCentre, SLACK_KM } from './quake-history-core.js';

/* ⚠ EVERY NUMBER HERE SAYS WHERE IT CAME FROM (.agents/rules/no-ad-hoc-hardcoding.md §4).
   · MAGS 3/5/6/7 — the magnitudes USGS's public forecasts tabulate (the `observations` of its oaf products, read 2026-10-13);
     «at least as large as the mainshock» is added beside them (the number a reader asks for first).
   · WINDOWS — USGS's: 1 day, 1 week, 1 calendar month, 1 calendar year from the issue time (its forecast.json, read
     2026-10-13: 1, 7, 31 and 366 days from 2026-10-12, i.e. calendar arithmetic).
   · MIN_MAIN 5 — below it the WORLD completeness (magCat 4.6) leaves the sequence nothing to learn from and USGS issues no
     forecast; unmade if the catalogue's global completeness falls.
   · CAP 20000 — the FDSN event service's own `maxAllowed` per query (its count answer says so).
   · LIST_DAYS / LIST_MIN — the chooser offered with no earthquake named: the 30-day M4.5+ summary feed USGS already serves
     (the earthquakes layer reads it), shown from M5.5 so the list stays a page long (measured 2026-10-13: 13 events). */
export const AS = Object.freeze({
  ENDPOINT: 'https://earthquake.usgs.gov/fdsnws/event/1/',
  LIST_FEED: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson',
  DATA: 'data/aftershock-regimes.json.gz',
  MAGS: Object.freeze([3, 5, 6, 7]),
  WINDOWS: Object.freeze([
    Object.freeze({ key: 'day', add: (d) => d.setUTCDate(d.getUTCDate() + 1) }),
    Object.freeze({ key: 'week', add: (d) => d.setUTCDate(d.getUTCDate() + 7) }),
    Object.freeze({ key: 'month', add: (d) => d.setUTCMonth(d.getUTCMonth() + 1) }),
    Object.freeze({ key: 'year', add: (d) => d.setUTCFullYear(d.getUTCFullYear() + 1) }),
  ]),
  MIN_MAIN: 5,
  CAP: 20000,
  LIST_DAYS: 30,
  LIST_MIN: 5.5,
  PARAM: 'as',
});
const DAY = 86400000;
const LN10 = Math.LN10;
const finite = (v) => typeof v === 'number' && isFinite(v);

/* ── ① the regime ─────────────────────────────────────────────────────────────────────────────── */

/** decodeRows(rows) — the bundle's run-length rows back to [[firstColumn, regimeIndex], …] per row of latitude
    (the same reading scripts/build-aftershock-regimes.mjs checks the bundle with) */
export function decodeRows(rows) {
  const out = []; let prev = null;
  for (const s of rows) {
    if (s === '') { out.push(prev); continue; }
    const runs = []; const re = /([A-Z])([0-9a-z]*)/g; let m;
    while ((m = re.exec(s))) runs.push([m[2] === '' ? 0 : parseInt(m[2], 36), m[1].charCodeAt(0) - 65]);
    out.push(runs); prev = runs;
  }
  return out;
}
/** prepare(bundle) — the bundle with its rows decoded once (what every lookup below reads) */
export function prepare(bundle) {
  if (!bundle || bundle.v !== 1 || !Array.isArray(bundle.rows)) throw Object.assign(new Error('not an aftershock-regimes bundle'), { reason: 'parse' });
  return Object.assign({}, bundle, { decoded: decodeRows(bundle.rows) });
}
/* OAF's regions are SphRegionMercPolygon: straight edges in the Mercator plane, so the test is made there */
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + Math.max(-89.9, Math.min(89.9, lat)) * Math.PI / 360));
function inMercPolygon(poly, lng, lat) {
  const y = mercY(lat); let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = mercY(poly[i][1]), xj = poly[j][0], yj = mercY(poly[j][1]);
    if ((yi > y) !== (yj > y) && lng < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/* OAFParameterSet nudges a point off the date line and the poles before testing regions */
const nudge = (lng, lat) => [Math.max(-179.995, Math.min(179.995, lng)), Math.max(-89.995, Math.min(89.995, lat))];
function wrapLng(x) { let v = +x; while (v > 180) v -= 360; while (v < -180) v += 360; return v; }

/** gridRegime(P, lng, lat) — the García regime index at a point: TectonicRegimeTable.get_domain_index (nearest grid node) */
function gridRegime(P, lng, lat) {
  const g = P.grid;
  const row = Math.max(0, Math.min(g.rows - 1, Math.round((Math.max(-90, Math.min(90, lat)) - g.latMin) / g.step)));
  let col = Math.round((wrapLng(lng) - g.lonMin) / g.step);
  if (col < 0) col = g.cols - 1; else if (col >= g.cols) col = 0;
  const runs = P.decoded[row];
  let lo = 0, hi = runs.length;
  while (hi - lo > 1) { const mid = (hi + lo) >> 1; if (runs[mid][0] <= col) lo = mid; else hi = mid; }
  return runs[lo][1];
}
/** regimeAt(P, lng, lat) — { regime (the key of P.params), source: 'region' | 'grid', strec, garcia } */
export function regimeAt(P, lng, lat) {
  const [x, y] = nudge(wrapLng(lng), lat);
  for (const r of P.paramRegions) if (inMercPolygon(r.poly, x, y)) return { regime: r.regime, source: 'region', strec: null, garcia: null };
  const k = gridRegime(P, x, y), R = P.regimes[k];
  return { regime: R.garcia, source: 'grid', strec: R.strec, garcia: R.garcia };
}
/** completenessAt(P, lng, lat) — the network's completeness rules at a point (the first region that contains it, else WORLD) */
export function completenessAt(P, lng, lat) {
  const [x, y] = nudge(wrapLng(lng), lat);
  for (const r of P.magCompRegions) if (inMercPolygon(r.poly, x, y)) return Object.assign({ region: r.regime }, P.magComp[r.regime]);
  return Object.assign({ region: 'WORLD' }, P.magComp.WORLD);
}

/* ── ② the prior ─────────────────────────────────────────────────────────────────────────────── */

/** aSigma(par, Mm) — GenericRJ_Parameters.get_aValueSigma(magnitude): σ0² + σ1²/10^M, with M held at 6 below M6 */
export function aSigma(par, Mm) {
  if (!(par.aSigma1 > 0)) return par.aSigma;
  return Math.sqrt(par.aSigma0 * par.aSigma0 + par.aSigma1 * par.aSigma1 / Math.pow(10, Math.max(6, Mm)));
}
/** aGrid(par) — OAF's a-value grid (aMin … aMax by aDelta) */
function aGrid(par) {
  const n = Math.round((par.aMax - par.aMin) / par.aDelta) + 1, out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = +(par.aMin + i * par.aDelta).toFixed(6);
  return out;
}

/* ── ③ the zone ──────────────────────────────────────────────────────────────────────────────── */

/** wcLengthKm(M) — Wells & Coppersmith (1994) median surface rupture length, all slip types: 10^(−3.22 + 0.69 M) */
const wcLengthKm = (M) => Math.pow(10, -3.22 + 0.69 * M);
/** radius(mc, Mm, which) — SearchRadiusFnWCClip.getRadius: the WC length × multiplier, clipped to [min, max] */
export function radius(mc, Mm, which) {
  const mult = which === 'centroid' ? mc.centroidMult : mc.radiusMult;
  const lo = which === 'centroid' ? mc.centroidMin : mc.radiusMin, hi = which === 'centroid' ? mc.centroidMax : mc.radiusMax;
  return Math.min(hi, Math.max(lo, wcLengthKm(Mm) * mult));
}
/** sphCentroid(points) — AftershockStatsCalc.getSphCentroid: the normalised mean of unit vectors ({lng, lat}[]) */
function sphCentroid(points) {
  let x = 0, y = 0, z = 0;
  for (const p of points) {
    const la = p.lat * Math.PI / 180, lo = p.lng * Math.PI / 180;
    x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la);
  }
  const h = Math.hypot(x, y);
  return { lng: +(Math.atan2(y, x) * 180 / Math.PI).toFixed(5), lat: +(Math.atan2(z, h) * 180 / Math.PI).toFixed(5) };
}
/** ring(centre, km, n) — the circle as a closed [lng, lat] line on the sphere */
export function ring(centre, km, n = 96) {
  const R = 6371.0088, d = km / R, la1 = centre.lat * Math.PI / 180, lo1 = centre.lng * Math.PI / 180, out = [];
  for (let i = 0; i <= n; i++) {
    const br = 2 * Math.PI * i / n;
    const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
    const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
    out.push([+wrapLng(lo2 * 180 / Math.PI).toFixed(5), +(la2 * 180 / Math.PI).toFixed(5)]);
  }
  return out;
}

/* ── ④ the data ──────────────────────────────────────────────────────────────────────────────── */

/** mcAt(mc, Mm, tDays) — MagCompFnPage.getMagCompleteness: max(magCat, F·Mm − G − H·log10 t) */
export function mcAt(mc, Mm, tDays) {
  return Math.max(mc.magCat, mc.F * Mm - mc.G - mc.H * Math.log10(Math.max(tDays, Number.MIN_VALUE)));
}
/** normalise(feature) — one ComCat GeoJSON feature to { id, t, mag, lng, lat, depthKm, place, url, magType } (null if unusable) */
export function normalise(f) {
  if (!f || !f.properties || !f.geometry || !Array.isArray(f.geometry.coordinates)) return null;
  const p = f.properties, c = f.geometry.coordinates;
  const id = String(f.id || ((p.net || '') + (p.code || '')) || String(p.ids || '').split(',').filter(Boolean)[0] || '');
  if (!id || !finite(+p.time) || !finite(+c[0]) || !finite(+c[1])) return null;
  return { id, t: +p.time, mag: p.mag == null || !finite(+p.mag) ? null : +p.mag, lng: +c[0], lat: +c[1],
    depthKm: finite(+c[2]) ? +c[2] : null, place: p.place || p.title || '', url: p.url || '', magType: p.magType || '', type: p.type || 'earthquake' };
}
/** within(events, centre, km) — the events inside the circle, each with its distance */
export function within(events, centre, km) {
  const out = [];
  for (const e of events) { if (!e) continue; const d = haversineKm(centre.lat, centre.lng, e.lat, e.lng); if (d <= km) out.push(Object.assign({}, e, { km: Math.round(d) })); }
  return out;
}
/** completeAfter(events, main, mc, t0, t1) — the aftershocks the likelihood uses: in (t0, t1] days after the mainshock and
    at or above the completeness of their own instant (SequenceSpecific: `rup.getMag() >= magMin`) */
function completeAfter(events, main, mc, t0Days, t1Days) {
  return events.filter((e) => {
    if (e.id === main.id || e.mag == null) return false;
    const t = (e.t - main.t) / DAY;
    return t > t0Days && t <= t1Days && e.mag >= mcAt(mc, main.mag, t);
  });
}

/* ── ⑤ the update ────────────────────────────────────────────────────────────────────────────── */

/** omoriIntegral(p, c, t1, t2) — ∫ (t + c)^−p dt over [t1, t2] days */
export function omoriIntegral(p, c, t1, t2) {
  if (!(t2 > t1)) return 0;
  if (Math.abs(p - 1) < 1e-9) return Math.log((t2 + c) / (t1 + c));
  return (Math.pow(t2 + c, 1 - p) - Math.pow(t1 + c, 1 - p)) / (1 - p);
}
/** kIntegral(par, mc, Mm, t1, t2) — K = ∫ 10^(b·(Mm − Mc(t))) (t + c)^−p dt over [t1, t2]: the expected count of complete
    aftershocks is 10^a·K (AftershockStatsCalc.getPageExpectedNumEvents with the a-factor taken out). Where Mc(t) is the
    constant magCat the integral is closed-form; the early, incomplete part is integrated in log time (Simpson, 2048 steps). */
export function kIntegral(par, mc, Mm, t1, t2) {
  if (!(t2 > t1)) return 0;
  /* the instant from which Mc(t) is magCat: F·Mm − G − H·log10 t = magCat */
  const tFlat = mc.H > 0 ? Math.pow(10, (mc.F * Mm - mc.G - mc.magCat) / mc.H) : (mc.F * Mm - mc.G <= mc.magCat ? 0 : Infinity);
  let K = 0;
  const flatFrom = Math.max(t1, tFlat);
  if (t2 > flatFrom) K += Math.pow(10, par.b * (Mm - mc.magCat)) * omoriIntegral(par.p, par.c, flatFrom, t2);
  const lo = t1, hi = Math.min(t2, tFlat);
  if (hi > lo) {
    /* the integrand vanishes as t → 0 (it goes as t^(b·H)), so the log-time integral starts where it is negligible */
    const u0 = Math.log(Math.max(lo, hi * 1e-9)), u1 = Math.log(hi), n = 2048, h = (u1 - u0) / n;
    const f = (u) => { const t = Math.exp(u); return Math.pow(10, par.b * (Mm - mcAt(mc, Mm, t))) * Math.pow(t + par.c, -par.p) * t; };
    let s = f(u0) + f(u1);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(u0 + i * h);
    K += s * h / 3;
  }
  return K;
}
/** posterior(par, Mm, n, K) — the a-value grid with normalised weights: prior Normal(aMean, σ(Mm)) × Poisson likelihood
    (log L = n·a·ln10 − 10^a·K). n = 0 and K = 0 return the prior itself (the forecast before any data). */
export function posterior(par, Mm, n, K) {
  const a = aGrid(par), s = aSigma(par, Mm), lw = new Array(a.length);
  let max = -Infinity;
  for (let i = 0; i < a.length; i++) {
    const z = (a[i] - par.aMean) / s;
    lw[i] = -0.5 * z * z + n * a[i] * LN10 - Math.pow(10, a[i]) * K;
    if (lw[i] > max) max = lw[i];
  }
  let tot = 0; const w = lw.map((v) => { const x = Math.exp(v - max); tot += x; return x; });
  for (let i = 0; i < w.length; i++) w[i] /= tot;
  let mean = 0; for (let i = 0; i < a.length; i++) mean += w[i] * a[i];
  let v = 0; for (let i = 0; i < a.length; i++) v += w[i] * (a[i] - mean) * (a[i] - mean);
  return { a, w, mean: +mean.toFixed(4), sd: +Math.sqrt(v).toFixed(4), priorMean: par.aMean, priorSd: +s.toFixed(4), n, K };
}
/** aQuantile(post, q) — the a-value below which a fraction q of the posterior lies */
function aQuantile(post, q) {
  let c = 0;
  for (let i = 0; i < post.a.length; i++) { c += post.w[i]; if (c >= q) return post.a[i]; }
  return post.a[post.a.length - 1];
}

/* ── ⑥ the forecast ──────────────────────────────────────────────────────────────────────────── */

/* ln Γ (Lanczos, g = 7, n = 9) and the regularised upper incomplete gamma Q(s, x) (series / continued fraction,
   Numerical Recipes §6.2) — the Poisson CDF is P(N ≤ k) = Q(k + 1, λ) */
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
function lnGamma(z) {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1; let x = LANCZOS[0]; const t = z + 7.5;
  for (let i = 1; i < 9; i++) x += LANCZOS[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
export function gammaQ(s, x) {
  if (x <= 0) return 1;
  const gl = lnGamma(s);
  if (x < s + 1) {
    let sum = 1 / s, del = sum, ap = s;
    for (let i = 0; i < 1000; i++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
    return Math.max(0, 1 - sum * Math.exp(-x + s * Math.log(x) - gl));
  }
  let b = x + 1 - s, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - s); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.min(1, Math.exp(-x + s * Math.log(x) - gl) * h);
}
/** poissonCdf(k, λ) — P(N ≤ k) */
export const poissonCdf = (k, lam) => (k < 0 ? 0 : lam <= 0 ? 1 : gammaQ(k + 1, lam));

/** windows(issueMs) — USGS's four windows from an issue instant: [{key, start, end}] (calendar arithmetic, UTC) */
export function windows(issueMs) {
  return AS.WINDOWS.map((w) => { const d = new Date(issueMs); w.add(d); return { key: w.key, start: issueMs, end: d.getTime() }; });
}
/** mixture(post, gain) — the posterior predictive of a count whose expectation is 10^a·gain: probability of ≥ 1 and the
    2.5 / 50 / 97.5 % fractiles (the lowest k whose cumulative probability reaches each). Weights below 1e-9 of the
    total are dropped (their mass is under one part in 10^7 of the grid's ~400 nodes). */
export function mixture(post, gain) {
  const nodes = [];
  for (let i = 0; i < post.a.length; i++) if (post.w[i] > 1e-9) nodes.push([post.w[i], Math.pow(10, post.a[i]) * gain]);
  let p0 = 0, mean = 0;
  for (const [w, lam] of nodes) { p0 += w * Math.exp(-lam); mean += w * lam; }
  const cdf = (k) => { let s = 0; for (const [w, lam] of nodes) s += w * poissonCdf(k, lam); return s; };
  const frac = (q) => {
    if (cdf(0) >= q) return 0;
    let lo = 0, hi = Math.max(1, Math.ceil(nodes.reduce((m, [, l]) => Math.max(m, l), 0) * 3 + 30));
    while (cdf(hi) < q) hi *= 2;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cdf(mid) >= q) hi = mid; else lo = mid; }
    return hi;
  };
  return { probability: Math.max(0, Math.min(1, 1 - p0)), expected: mean, lo: frac(0.025), median: frac(0.5), hi: frac(0.975) };
}
/** forecast(post, par, Mm, tMainMs, issueMs, mags) — the table: for each window (from the issue time) and each magnitude
    (plus «≥ Mm», the mainshock's own size), the probability of at least one and the 95 % range of the number */
function forecast(post, par, Mm, tMainMs, issueMs, mags = AS.MAGS) {
  const all = mags.concat([Mm]);
  return windows(issueMs).map((w) => {
    const t1 = (w.start - tMainMs) / DAY, t2 = (w.end - tMainMs) / DAY, I = omoriIntegral(par.p, par.c, t1, t2);
    return Object.assign({}, w, { bins: all.map((m, j) => Object.assign({ mag: m, asLarge: j === all.length - 1 }, mixture(post, Math.pow(10, par.b * (Mm - m)) * I))) });
  });
}

/* ── the whole run ───────────────────────────────────────────────────────────────────────────── */

/** zoneOf(P, main, nearby, issueMs) — ③: the centroid of the mainshock and its M≥magCentroid aftershocks (to the issue
    time) within the centroid radius of the epicentre, and the sampling radius around it */
function zoneOf(P, main, nearby, issueMs) {
  const mc = completenessAt(P, main.lng, main.lat);
  const rC = radius(mc, main.mag, 'centroid');
  const near = within(nearby, main, rC).filter((e) => e.id !== main.id && e.mag != null && e.mag >= mc.magCentroid && e.t > main.t && e.t <= issueMs);
  const centre = sphCentroid([main].concat(near));
  return { centre, radiusKm: +radius(mc, main.mag, 'sample').toFixed(1), centroidRadiusKm: +rC.toFixed(1), centroidFrom: near.length, mc };
}
/** run(P, main, events, issueMs, opts) — everything the card shows for one mainshock at one issue instant.
    `events`: the normalised catalogue around the zone (from the mainshock to the end of the answer-check window, or now).
    `opts.now`: the present (an answer-check window must have ended before it). */
export function run(P, main, events, issueMs, opts = {}) {
  if (!main || !finite(main.mag)) throw Object.assign(new Error('no magnitude'), { reason: 'no-magnitude' });
  if (main.mag < AS.MIN_MAIN) throw Object.assign(new Error('below M' + AS.MIN_MAIN), { reason: 'too-small' });
  const now = finite(opts.now) ? opts.now : issueMs;
  const reg = regimeAt(P, main.lng, main.lat), par = P.params[reg.regime];
  const zone = opts.zone || zoneOf(P, main, events, issueMs);
  const mc = zone.mc;
  const inZone = within(events, zone.centre, zone.radiusKm).filter((e) => e.id !== main.id && e.t > main.t);
  const tIssue = (issueMs - main.t) / DAY;
  const used = completeAfter(inZone, main, mc, 0, tIssue);
  const K = kIntegral(par, mc, main.mag, 0, tIssue);
  const post = posterior(par, main.mag, used.length, K);
  const prior = posterior(par, main.mag, 0, 0);
  const table = forecast(post, par, main.mag, main.t, issueMs);
  /* the answer check: the windows that ended before the present, at the magnitudes the catalogue records completely */
  const after = inZone.filter((e) => e.t > issueMs && e.mag != null);
  const check = table.map((w) => {
    if (w.end > now) return { key: w.key, state: 'open' };
    const obsMcMax = mcAt(mc, main.mag, Math.max(tIssue, 1e-9));
    return { key: w.key, state: 'closed', bins: w.bins.map((b) => {
      if (b.mag < mc.magCat || b.mag < obsMcMax) return { mag: b.mag, asLarge: b.asLarge, checkable: false };
      const n = after.filter((e) => e.t <= w.end && e.mag >= b.mag).length;
      return { mag: b.mag, asLarge: b.asLarge, checkable: true, observed: n, verdict: n < b.lo ? 'below' : n > b.hi ? 'above' : 'within' };
    }) };
  });
  /* the cumulative curve the card draws: the complete aftershocks against the expected count, to the issue time and
     (for an answer check) beyond it, with the expected count's 95 % parameter band */
  const aLo = aQuantile(post, 0.025), aMid = aQuantile(post, 0.5), aHi = aQuantile(post, 0.975);
  return {
    main, issueMs, tIssueDays: tIssue, regime: reg, params: par, zone, completeness: mc,
    used: used.length, usedEvents: used, inZone, after,
    largestAfter: inZone.filter((e) => e.t <= issueMs && e.mag != null).reduce((b, e) => (!b || e.mag > b.mag ? e : b), null),
    posterior: { mean: post.mean, sd: post.sd, priorMean: prior.mean, priorSd: prior.sd, aLo, aMid, aHi },
    forecast: table, check,
    expectedAt: (tDays, a) => Math.pow(10, a) * kIntegral(par, mc, main.mag, 0, tDays),
  };
}

/* ── the USGS product (its own forecast, shown beside, never merged) ─────────────────────────── */

/** readOaf(eventGeoJSON) — the URL of the event's USGS forecast.json, or null when USGS published none */
export function oafUrl(ev) {
  const prods = ev && ev.properties && ev.properties.products;
  const o = prods && prods.oaf && prods.oaf[0];
  const c = o && o.contents && o.contents['forecast.json'];
  return c && c.url ? String(c.url) : null;
}
/** readOafForecast(j) — USGS's forecast.json to { issued, model, windows: [{label, start, end, bins:[{mag, probability, lo, median, hi}]}] } */
export function readOafForecast(j) {
  if (!j || !Array.isArray(j.forecast)) return null;
  return {
    issued: finite(+j.creationTime) ? +j.creationTime : null,
    model: (j.model && j.model.name) || '',
    params: (j.model && j.model.parameters) || null,
    windows: j.forecast.map((w) => ({ label: String(w.label || ''), start: +w.timeStart, end: +w.timeEnd,
      bins: (w.bins || []).map((b) => ({ mag: +b.magnitude, probability: +b.probability, lo: +b.p95minimum, median: +b.median, hi: +b.p95maximum })) })),
  };
}

/* ── requests and links ──────────────────────────────────────────────────────────────────────── */

export const eventUrl = (id) => AS.ENDPOINT + 'query?format=geojson&eventid=' + encodeURIComponent(String(id));
/** catalogUrl(kind, { lng, lat, radiusKm, minMag, startMs, endMs }) — the FDSN request around a point: 'count' or 'query'.
    The point is an earthquake's own catalogue position (never the reader's) — the card asks about a quake, not a place. */
export function catalogUrl(kind, o) {
  const p = new URLSearchParams();
  p.set('format', 'geojson');
  p.set('eventtype', 'earthquake');
  p.set('latitude', (+o.lat).toFixed(4));
  p.set('longitude', (+o.lng).toFixed(4));
  p.set('maxradiuskm', String(Math.ceil(+o.radiusKm)));
  p.set('minmagnitude', String(+o.minMag));
  p.set('starttime', new Date(o.startMs).toISOString().slice(0, 19));
  p.set('endtime', new Date(o.endMs).toISOString().slice(0, 19));
  if (kind === 'query') { p.set('orderby', 'time-asc'); p.set('limit', String(AS.CAP)); }
  return AS.ENDPOINT + (kind === 'count' ? 'count' : 'query') + '?' + p.toString();
}
/** listRecent(feature collection, nowMs) — the chooser: the summary feed's earthquakes of M≥LIST_MIN in the last LIST_DAYS */
export function listRecent(fc, nowMs) {
  const from = nowMs - AS.LIST_DAYS * DAY;
  return ((fc && fc.features) || []).map(normalise).filter((e) => e && e.type === 'earthquake' && e.mag != null && e.mag >= AS.LIST_MIN && e.t >= from && e.t <= nowMs)
    .sort((a, b) => b.t - a.t);
}
/** nearUrl(lng, lat, endMs) — the earthquakes of M≥MIN_MAIN in the LIST_DAYS before `endMs` around a place the reader named:
    the point rounded and the radius widened (QH.DEFAULT_RADIUS + SLACK_KM), the exact circle applied by `pickNear` */
export function nearUrl(lng, lat, endMs) {
  const c = roundedCentre(lng, lat), p = new URLSearchParams();
  p.set('format', 'geojson'); p.set('eventtype', 'earthquake');
  p.set('latitude', String(c.lat)); p.set('longitude', String(c.lng));
  p.set('maxradiuskm', String(Math.round(QH.DEFAULT_RADIUS + SLACK_KM)));
  p.set('minmagnitude', String(AS.MIN_MAIN));
  p.set('starttime', new Date(endMs - AS.LIST_DAYS * DAY).toISOString().slice(0, 19));
  p.set('endtime', new Date(endMs).toISOString().slice(0, 19));
  p.set('orderby', 'magnitude'); p.set('limit', '200');
  return AS.ENDPOINT + 'query?' + p.toString();
}
/** pickNear(fc, centre, endMs) — the largest of them within the exact circle (the latest of equals), or null */
export function pickNear(fc, centre, endMs) {
  const ev = within(((fc && fc.features) || []).map(normalise).filter((e) => e && e.mag != null && e.mag >= AS.MIN_MAIN && e.t <= endMs), centre, QH.DEFAULT_RADIUS);
  return ev.sort((a, b) => (b.mag - a.mag) || (b.t - a.t))[0] || null;
}
export function encodeLink(id) { return AS.PARAM + '=' + encodeURIComponent(String(id)); }
/** decodeLink(search) — the ComCat id in `?as=<id>` (letters, digits and the separators ComCat ids use), or null */
export function decodeLink(search) {
  const m = new RegExp('[?&]' + AS.PARAM + '=([^&#]+)').exec(String(search || ''));
  if (!m) return null;
  let v = ''; try { v = decodeURIComponent(m[1]); } catch (_) { return null; }
  return /^[A-Za-z0-9_.:-]{4,40}$/.test(v) ? { eventId: v } : null;
}

/** forAtlas(r) — what Atlas is handed: the regime, the zone, the data, the posterior and the table (probabilities as %),
    with the caveat it must carry */
export function forAtlas(r) {
  const pct = (p) => +(100 * p).toFixed(p < 0.01 ? 2 : 1);
  return {
    mainshock: { id: r.main.id, magnitude: r.main.mag, time: new Date(r.main.t).toISOString(), place: r.main.place, lng: r.main.lng, lat: r.main.lat },
    issued: new Date(r.issueMs).toISOString(), daysAfterMainshock: +r.tIssueDays.toFixed(3),
    regime: r.regime.regime, regimeSource: r.regime.source === 'region' ? 'USGS California region' : 'García et al. (2012) regionalization',
    parameters: { aPriorMean: r.posterior.priorMean, aPriorSd: r.posterior.priorSd, aPosteriorMean: r.posterior.mean, aPosteriorSd: r.posterior.sd, b: r.params.b, p: r.params.p, c: r.params.c },
    zone: { centre: r.zone.centre, radiusKm: r.zone.radiusKm }, completenessMagnitude: r.completeness.magCat,
    aftershocksUsed: r.used,
    largestAftershockSoFar: r.largestAfter ? { magnitude: r.largestAfter.mag, time: new Date(r.largestAfter.t).toISOString() } : null,
    forecast: r.forecast.map((w) => ({ window: w.key, from: new Date(w.start).toISOString(), to: new Date(w.end).toISOString(),
      bins: w.bins.map((b) => ({ magnitudeAtLeast: b.mag, asLargeAsMainshock: b.asLarge || undefined, probabilityPercent: pct(b.probability), countMedian: b.median, count95: [b.lo, b.hi] })) })),
    answerCheck: r.check.filter((c) => c.state === 'closed').map((c) => ({ window: c.key, bins: c.bins.filter((b) => b.checkable).map((b) => ({ magnitudeAtLeast: b.mag, observed: b.observed, verdict: b.verdict })) })),
    caveat: 'Not an official forecast: the Reasenberg–Jones model with USGS generic parameters (Page et al. 2016), updated with this sequence\'s own aftershocks. Probabilities are for the circle, not one site, and say nothing about which day. Follow the national agency.',
  };
}
