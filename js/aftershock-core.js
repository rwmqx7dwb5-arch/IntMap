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
 *                   Mc(t) = max(magCat, F·Mm − G − H·log10 t) — the catalogue misses small events in the first hours —
 *                   where magCat is the network's floor OR, when the sequence's own magnitudes show the catalogue
 *                   incomplete above it, the maximum-curvature estimate + 0.2 (Woessner & Wiemer 2005);
 *    ⑤ the update   the Bayesian posterior over a GRID OF a, p AND c (as OAF's sequence-specific model learns them): the
 *                   regime's Normal prior on a, Normal priors on p and log10 c around the regime's values (widths: how
 *                   far the regimes' own values spread), and the likelihood of the aftershock times,
 *                   log L(a, p, c) = n·a·ln10 − p·Σ ln(tᵢ + c) − 10^a·K(p, c),  K = ∫ 10^(b(Mm−Mc(t)))(t+c)^−p dt;
 *    ⑥ the forecast for each window and magnitude, the probability of at least one and the 2.5 / 50 / 97.5 % of the
 *                   number, over the posterior mixture of Poisson counts — the numbers USGS's products print.
 *  ⚠ THE 95 % IS THE MODEL'S, NOT A MEASURED RATE. With p and c fixed the ranges were too narrow (the test of 2026-10-12:
 *    the M5+ count fell inside 117 of 137 over a month, 105 over a year); learning the decay widens them where it is
 *    uncertain. How often the real count fell inside is measured by scripts/build-aftershock-hindcast.mjs, and the card
 *    and Atlas show that measurement beside the range.
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
   · WINDOWS — USGS's: 1, 7, 31 and 366 DAYS from the issue time, fixed day counts and not calendar arithmetic (its
     forecast.json read 2026-11-16, issued 2026-11-09T16:00Z: the year ends 2027-11-10T16:00Z, 366 days on, where a
     calendar year would have ended after 365). Unmade if USGS's products change their windows.
   · MIN_MAIN 5 — below it the WORLD completeness (magCat 4.6) leaves the sequence nothing to learn from and USGS issues no
     forecast; unmade if the catalogue's global completeness falls.
   · CAP 20000 — the FDSN event service's own `maxAllowed` per query (its count answer says so).
   · LIST_DAYS / LIST_MIN — the chooser offered with no earthquake named: the 30-day M4.5+ summary feed USGS already serves
     (the earthquakes layer reads it), shown from M5.5 so the list stays a page long (measured 2026-10-13: 13 events).
   · NEAR_KM — the circle a named place is searched in: the earthquake record's own radius (QH.DEFAULT_RADIUS is the canon).
   · MC_BIN / MC_CORR — the maximum-curvature completeness: the mode of the 0.1-unit magnitude histogram (ComCat states
     magnitudes to 0.1 or finer) plus 0.2, the correction Woessner & Wiemer (2005) found MAXC needs (it underestimates Mc).
   · MC_MIN_EVENTS 50 — AN ESTIMATE, not a cited value: below it the mode of a 0.1-unit histogram is decided by single
     events. Unmade if the hindcast shows a different floor changes which sequences are estimated and how they score.
   · TESTED — the rule that chooses the hindcast's set (scripts/build-aftershock-hindcast.mjs reads it from here): every M7+
     from 2015 through 2024, issued one day after. A sequence older than it whose completeness cannot be estimated from its
     own magnitudes stands outside what the network floor was tested on, and is forecast from the prior alone.
   · DEEP_KM 70 — the conventional boundary between shallow and intermediate-depth earthquakes (USGS's glossary: shallow
     0–70 km, intermediate 70–300, deep 300–700). The regime is looked up by the epicentre, never by depth.
   · P_NODES / C_NODES / SHAPE_SPAN — the shape prior's grid: p on 33 nodes and log10 c on 9 nodes, each over ±4 σ (steps of
     σ/4 and σ; the mass outside ±4 σ is 6·10⁻⁵). The c grid is coarser because c moves the forecast windows (a day and
     longer) far less than p does; the hindcast is the measurement (scripts/build-aftershock-hindcast.mjs).
   · HINDCAST — the shipped test the card and Atlas quote the measured coverage from. */
export const AS = Object.freeze({
  ENDPOINT: 'https://earthquake.usgs.gov/fdsnws/event/1/',
  LIST_FEED: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson',
  DATA: 'data/aftershock-regimes.json.gz',
  MAGS: Object.freeze([3, 5, 6, 7]),
  WINDOWS: Object.freeze([
    Object.freeze({ key: 'day', days: 1 }),
    Object.freeze({ key: 'week', days: 7 }),
    Object.freeze({ key: 'month', days: 31 }),
    Object.freeze({ key: 'year', days: 366 }),
  ]),
  MIN_MAIN: 5,
  CAP: 20000,
  LIST_DAYS: 30,
  LIST_MIN: 5.5,
  NEAR_KM: QH.DEFAULT_RADIUS,
  MC_BIN: 0.1,
  MC_CORR: 0.2,
  MC_MIN_EVENTS: 50,
  TESTED: Object.freeze({ minMag: 7, from: '2015-01-01', to: '2025-01-01', issueDays: 1 }),
  DEEP_KM: 70,
  P_NODES: 33,
  C_NODES: 9,
  SHAPE_SPAN: 4,
  HINDCAST: 'data/aftershock-hindcast.json',
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
  return Object.assign({}, bundle, { decoded: decodeRows(bundle.rows), spread: spreadOf(bundle.params) });
}
/** spreadOf(params) — the widths of the shape prior: the standard deviations of the generic p and of log10 c over all the
    parameter sets the bundle carries (p 0.136 and log10 c 0.210 over its 19 sets, measured 2026-11-16). AN ESTIMATE of
    how little a regime alone says about one sequence's decay — the regimes' own values disagree by this much. Derived
    from the bundle, so it follows a rebuilt one. */
function spreadOf(params) {
  const sd = (xs) => { if (xs.length < 2) return 0; const m = xs.reduce((q, v) => q + v, 0) / xs.length; return Math.sqrt(xs.reduce((q, v) => q + (v - m) * (v - m), 0) / (xs.length - 1)); };
  const vs = Object.values(params || {});
  return { p: sd(vs.map((v) => v && v.p).filter(finite)), logc: sd(vs.map((v) => v && v.c).filter((c) => finite(c) && c > 0).map(Math.log10)) };
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
/** shapePrior(P, par) — the prior over the decay's shape on its grid: p ~ Normal(the regime's p, spread.p) on AS.P_NODES
    nodes and log10 c ~ Normal(log10 of the regime's c, spread.logc) on AS.C_NODES nodes, each over ±AS.SHAPE_SPAN σ
    (non-positive p dropped); nodes [{p, c, w}] with weights summing to 1. With no spread, the regime's p and c alone
    (the fixed-shape model). */
export function shapePrior(P, par) {
  const sp = (P && P.spread) || {}, sdP = finite(sp.p) ? sp.p : 0, sdC = finite(sp.logc) ? sp.logc : 0;
  const axis = (n, sd) => { if (!(sd > 0) || n < 2) return [[0, 1]]; const out = []; for (let i = 0; i < n; i++) { const z = -AS.SHAPE_SPAN + 2 * AS.SHAPE_SPAN * i / (n - 1); out.push([z * sd, Math.exp(-0.5 * z * z)]); } return out; };
  const nodes = []; let tot = 0;
  for (const [dp, wp] of axis(AS.P_NODES, sdP)) {
    const p = +(par.p + dp).toFixed(6); if (!(p > 0)) continue;
    for (const [dc, wc] of axis(AS.C_NODES, sdC)) { const c = +(par.c * Math.pow(10, dc)).toPrecision(6); nodes.push({ p, c, w: wp * wc }); tot += wp * wc; }
  }
  for (const n of nodes) n.w /= tot;
  return { p: { mean: par.p, sd: +sdP.toFixed(4) }, c: { mean: par.c, sdLog10: +sdC.toFixed(4) }, nodes };
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
/** flatFrom(mc, Mm) — the instant (days) from which Page's Mc(t) has fallen to magCat: F·Mm − G − H·log10 t = magCat */
function flatFrom(mc, Mm) {
  return mc.H > 0 ? Math.pow(10, (mc.F * Mm - mc.G - mc.magCat) / mc.H) : (mc.F * Mm - mc.G <= mc.magCat ? 0 : Infinity);
}
/** estimateMc(mags, readMin) — the maximum-curvature completeness of a set of magnitudes: the mode of the AS.MC_BIN
    histogram + AS.MC_CORR (ties go to the larger magnitude — the cautious side). { mc: null } with the reason when it
    cannot say: 'few' (under AS.MC_MIN_EVENTS) or 'at-floor' (the mode is the read's own lowest bin — the histogram is
    cut there, so it shows no incompleteness above the floor, and no value either). */
export function estimateMc(mags, readMin) {
  const ms = mags.filter(finite);
  if (ms.length < AS.MC_MIN_EVENTS) return { mc: null, n: ms.length, reason: 'few' };
  const bin = (m) => Math.round(m / AS.MC_BIN + 1e-9);
  const count = new Map();
  for (const m of ms) { const k = bin(m); count.set(k, (count.get(k) || 0) + 1); }
  let mode = null, best = -1;
  for (const [k, c] of count) if (c > best || (c === best && k > mode)) { best = c; mode = k; }
  const modeMag = +(mode * AS.MC_BIN).toFixed(2);
  if (finite(readMin) && mode <= bin(readMin)) return { mc: null, n: ms.length, mode: modeMag, reason: 'at-floor' };
  return { mc: +(modeMag + AS.MC_CORR).toFixed(2), n: ms.length, mode: modeMag, reason: null };
}
/** completenessOf(base, main, inZone, issueMs, readMin) — the completeness the run uses: the network's rules at the
    epicentre (`base`), with magCat raised to the sequence's own maximum-curvature estimate when that is higher. The
    estimate reads only what was recorded by the issue time, after Page's Mc(t) has fallen to the floor (the incomplete
    first hours would push it up for the wrong reason). When it cannot be made and the mainshock is older than the set
    the floor was tested on (AS.TESTED), the forecast is the prior alone (`priorOnly`) — refused nothing, claimed nothing. */
function completenessOf(base, main, inZone, issueMs, readMin) {
  const t0 = main.t + flatFrom(base, main.mag) * DAY;
  const est = estimateMc(inZone.filter((e) => e.mag != null && e.t > t0 && e.t <= issueMs && (!finite(readMin) || e.mag >= readMin)).map((e) => e.mag), readMin);
  const raised = est.mc != null && est.mc > base.magCat;
  const tested = main.t >= Date.parse(AS.TESTED.from);
  return Object.assign({}, base, {
    magCat: raised ? est.mc : base.magCat, networkMagCat: base.magCat, source: raised ? 'sequence' : 'network',
    estimate: est, priorOnly: est.mc == null && est.reason === 'few' && !tested,
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
export function kIntegral(par, mc, Mm, t1, t2, p = par.p, c = par.c, steps = 2048) {
  if (!(t2 > t1)) return 0;
  /* the instant from which Mc(t) is magCat */
  const tFlat = flatFrom(mc, Mm);
  let K = 0;
  const from = Math.max(t1, tFlat);
  if (t2 > from) K += Math.pow(10, par.b * (Mm - mc.magCat)) * omoriIntegral(p, c, from, t2);
  const lo = t1, hi = Math.min(t2, tFlat);
  if (hi > lo) {
    /* the integrand vanishes as t → 0 (it goes as t^(b·H)), so the log-time integral starts where it is negligible */
    const u0 = Math.log(Math.max(lo, hi * 1e-9)), u1 = Math.log(hi), n = steps, h = (u1 - u0) / n;
    const f = (u) => { const t = Math.exp(u); return Math.pow(10, par.b * (Mm - mcAt(mc, Mm, t))) * Math.pow(t + c, -p) * t; };
    let s = f(u0) + f(u1);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(u0 + i * h);
    K += s * h / 3;
  }
  return K;
}
/** posterior(par, Mm, n, K, opts) — the posterior over the grid of a and the shape nodes, as cells { a[], k[] (the node's
    index), w[] } with normalised weights: prior Normal(aMean, σ(Mm)) on a × the shape prior (`opts.nodes`: [{p, c, w}],
    default the regime's p and c alone) × the likelihood of the n complete aftershocks,
    log L = n·a·ln10 − p·Σ ln(tᵢ + c) − 10^a·K(p, c). `opts.sumLn(c)` is Σ ln(tᵢ + c) (a number when c is one value);
    `K` a number or a function of the node. n = 0 and K = 0 return the prior itself (the forecast before any data).
    Cells under 10⁻¹² of the mass are dropped. `mean`/`sd` are a's marginal, `pMean`/`pSd` and `cMean` p's and c's. */
export function posterior(par, Mm, n, K, opts = {}) {
  const ag = aGrid(par), s = aSigma(par, Mm), nodes = opts.nodes || [{ p: par.p, c: par.c, w: 1 }];
  const sumLn = typeof opts.sumLn === 'function' ? opts.sumLn : () => (finite(opts.sumLn) ? opts.sumLn : 0);
  const A = [], Kx = [], LW = [];
  let max = -Infinity;
  nodes.forEach((node, j) => {
    const k = typeof K === 'function' ? K(node, j) : K, lp = Math.log(node.w) - node.p * sumLn(node.c);
    for (let i = 0; i < ag.length; i++) {
      const z = (ag[i] - par.aMean) / s, l = -0.5 * z * z + lp + n * ag[i] * LN10 - Math.pow(10, ag[i]) * k;
      A.push(ag[i]); Kx.push(j); LW.push(l); if (l > max) max = l;
    }
  });
  let tot = 0; for (let i = 0; i < LW.length; i++) { LW[i] = Math.exp(LW[i] - max); tot += LW[i]; }
  const a = [], k = [], w = [];
  for (let i = 0; i < LW.length; i++) { const x = LW[i] / tot; if (x > 1e-12) { a.push(A[i]); k.push(Kx[i]); w.push(x); } }
  const wt = w.reduce((q, x) => q + x, 0); for (let i = 0; i < w.length; i++) w[i] /= wt;
  const moments = (f) => { let m = 0; for (let i = 0; i < w.length; i++) m += w[i] * f(i); let q = 0; for (let i = 0; i < w.length; i++) q += w[i] * (f(i) - m) * (f(i) - m); return [m, Math.sqrt(q)]; };
  const [am, as] = moments((i) => a[i]), [pm, ps] = moments((i) => nodes[k[i]].p), [lcm] = moments((i) => Math.log10(nodes[k[i]].c));
  let pp = 0, pv = 0; for (const node of nodes) pp += node.w * node.p; for (const node of nodes) pv += node.w * (node.p - pp) * (node.p - pp);
  return { a, k, w, nodes, delta: par.aDelta, mean: +am.toFixed(4), sd: +as.toFixed(4), pMean: +pm.toFixed(4), pSd: +ps.toFixed(4), cMean: +Math.pow(10, lcm).toPrecision(3),
    priorMean: par.aMean, priorSd: +s.toFixed(4), pPriorMean: +pp.toFixed(4), pPriorSd: +Math.sqrt(pv).toFixed(4), n, K: typeof K === 'function' ? null : K };
}
/** weightedQuantiles(pairs, qs) — [value, weight][] (weights summing to 1) → the value at each cumulative fraction */
function weightedQuantiles(pairs, qs) {
  const s = pairs.slice().sort((x, y) => x[0] - y[0]), out = [];
  let c = 0, i = 0;
  for (const q of qs) { while (i < s.length - 1 && c + s[i][1] < q) { c += s[i][1]; i++; } out.push(s.length ? s[i][0] : 0); }
  return out;
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
/* Both the series and the continued fraction need about √s terms where x is near s (the terms shrink as e^(−i²/2s)), so
   the number of terms they may take grows with √max(s, x) instead of stopping at a fixed count — a fixed 1000 left
   Q(10⁶, 10⁶) at 0.659 instead of ½. Above QUAD_S (10⁴: ~1,200 terms at most below it) the integral is taken directly,
   Numerical Recipes 3rd ed. §6.2.1 `gammpapprox`: Gauss–Legendre over the few √s on either side of x where the
   integrand t^(s−1)e^(−t) lives — a fixed cost at any s, checked against the exact sum in tests/wave4-refine-aftershock-checks. */
const QUAD_S = 1e4;
const termsFor = (s, x) => Math.ceil(50 + 12 * Math.sqrt(Math.max(s, x)));
/** GL — the 64-point Gauss–Legendre nodes and weights on [0, 1], computed once (Newton on Pₙ, NR §4.6 `gauleg`) */
const GL = (() => {
  const n = 64, y = new Array(n), w = new Array(n);
  for (let i = 0; i < (n + 1) >> 1; i++) {
    let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), pp = 0;
    for (let it = 0; it < 100; it++) {
      let p1 = 1, p2 = 0;
      for (let j = 0; j < n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j + 1) * z * p2 - j * p3) / (j + 1); }
      pp = n * (z * p1 - p2) / (z * z - 1);
      const z1 = z; z = z1 - p1 / pp; if (Math.abs(z - z1) < 1e-15) break;
    }
    y[i] = (1 - z) / 2; y[n - 1 - i] = (1 + z) / 2;
    w[i] = w[n - 1 - i] = 1 / ((1 - z * z) * pp * pp);
  }
  return { y, w };
})();
function gammaQQuad(s, x) {
  const a1 = s - 1, la1 = Math.log(a1), sq = Math.sqrt(a1);
  const xu = x > a1 ? Math.max(a1 + 11.5 * sq, x + 6 * sq) : Math.max(0, Math.min(a1 - 7.5 * sq, x - 5 * sq));
  let sum = 0;
  for (let j = 0; j < GL.y.length; j++) { const t = x + (xu - x) * GL.y[j]; sum += GL.w[j] * Math.exp(-(t - a1) + a1 * (Math.log(t) - la1)); }
  const ans = sum * (xu - x) * Math.exp(a1 * (la1 - 1) - lnGamma(s));
  /* above the peak the integral IS Q; below it, it is minus the mass between xu and x and Q = 1 + it (decided by the side,
     not by the sign of a result that underflows to −0 far from the peak) */
  return Math.max(0, Math.min(1, x > a1 ? ans : 1 + ans));
}
export function gammaQ(s, x) {
  if (x <= 0) return 1;
  if (s >= QUAD_S) return gammaQQuad(s, x);
  const gl = lnGamma(s), N = termsFor(s, x);
  if (x < s + 1) {
    let sum = 1 / s, del = sum, ap = s;
    for (let i = 0; i < N; i++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
    return Math.max(0, 1 - sum * Math.exp(-x + s * Math.log(x) - gl));
  }
  let b = x + 1 - s, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < N; i++) {
    const an = -i * (i - s); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.min(1, Math.exp(-x + s * Math.log(x) - gl) * h);
}
/** poissonCdf(k, λ) — P(N ≤ k) */
export const poissonCdf = (k, lam) => (k < 0 ? 0 : lam <= 0 ? 1 : gammaQ(k + 1, lam));

/** windows(issueMs) — USGS's four windows from an issue instant: [{key, days, start, end}] (fixed day counts) */
export function windows(issueMs) {
  return AS.WINDOWS.map((w) => ({ key: w.key, days: w.days, start: issueMs, end: issueMs + w.days * DAY }));
}
/** mixture(post, gain) — the posterior predictive of a count whose expectation is 10^a·gain(node) (`gain` a number or
    a function of the shape node {p, c}): probability of ≥ 1 and the 2.5 / 50 / 97.5 % fractiles (the lowest k whose cumulative probability
    reaches each). The (a, p) cells are gathered onto a lattice of log10 λ at the a-grid's own step (each cell's weight
    shared linearly between its two neighbours), so the sums run over a few hundred λ, not every cell; lattice weights
    below 1e-12 are dropped. */
export function mixture(post, gain) {
  const g = typeof gain === 'function' ? gain : () => gain, d = post.delta || 0.01;
  const lg = new Map(), lat = new Map(); let zero = 0;
  for (let i = 0; i < post.a.length; i++) {
    let L = lg.get(post.k[i]);
    if (L === undefined) { const v = g(post.nodes[post.k[i]]); L = v > 0 ? Math.log10(v) : -Infinity; lg.set(post.k[i], L); }
    if (L === -Infinity) { zero += post.w[i]; continue; }
    const x = (post.a[i] + L) / d, j = Math.floor(x), f = x - j;
    lat.set(j, (lat.get(j) || 0) + post.w[i] * (1 - f)); lat.set(j + 1, (lat.get(j + 1) || 0) + post.w[i] * f);
  }
  const nodes = [];
  if (zero > 1e-12) nodes.push([zero, 0]);
  for (const [j, w] of lat) if (w > 1e-12) nodes.push([w, Math.pow(10, j * d)]);
  /* the kept weights are renormalised (what was dropped is under 1e-12 per node), so the cumulative reaches 1 and the
     search for each fractile always ends */
  const tot = nodes.reduce((q, [w]) => q + w, 0); for (const n of nodes) n[0] /= tot;
  let p0 = 0, mean = 0;
  for (const [w, lam] of nodes) { p0 += w * Math.exp(-lam); mean += w * lam; }
  const cdf = (k) => { let s = 0; for (const [w, lam] of nodes) s += w * poissonCdf(k, lam); return s; };
  const frac = (q) => {
    if (cdf(0) >= q) return 0;
    let lo = 0, hi = Math.max(1, Math.ceil(nodes.reduce((m, [, l]) => Math.max(m, l), 0) * 3 + 30));
    while (cdf(hi) < q - 1e-12) { lo = hi; hi *= 2; }
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (cdf(mid) >= q - 1e-12) hi = mid; else lo = mid; }
    return hi;
  };
  return { probability: Math.max(0, Math.min(1, 1 - p0)), expected: mean, lo: frac(0.025), median: frac(0.5), hi: frac(0.975) };
}
/** forecast(post, par, Mm, tMainMs, issueMs, mags) — the table: for each window (from the issue time) and each magnitude
    (plus «≥ Mm», the mainshock's own size), the probability of at least one and the 95 % range of the number */
function forecast(post, par, Mm, tMainMs, issueMs, mags = AS.MAGS) {
  const all = mags.concat([Mm]);
  return windows(issueMs).map((w) => {
    const t1 = (w.start - tMainMs) / DAY, t2 = (w.end - tMainMs) / DAY, I = new Map();
    const omori = (nd) => { let v = I.get(nd); if (v === undefined) { v = omoriIntegral(nd.p, nd.c, t1, t2); I.set(nd, v); } return v; };
    return Object.assign({}, w, { bins: all.map((m, j) => Object.assign({ mag: m, asLarge: j === all.length - 1 }, mixture(post, (nd) => Math.pow(10, par.b * (Mm - m)) * omori(nd)))) });
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
  const inZone = within(events, zone.centre, zone.radiusKm).filter((e) => e.id !== main.id && e.t > main.t);
  const tIssue = (issueMs - main.t) / DAY;
  /* the read's own floor (what the histogram is cut at): the caller's, else the one the builder and the card read at */
  const readMin = finite(opts.readMin) ? opts.readMin : Math.min(zone.mc.magCat, zone.mc.magCentroid);
  const mc = completenessOf(zone.mc, main, inZone, issueMs, readMin);
  const shape = shapePrior(P, par);
  const used = mc.priorOnly ? [] : completeAfter(inZone, main, mc, 0, tIssue);
  const ts = used.map((e) => (e.t - main.t) / DAY), lnSum = new Map();
  const sumLn = (c) => { let v = lnSum.get(c); if (v === undefined) { v = ts.reduce((q, t) => q + Math.log(t + c), 0); lnSum.set(c, v); } return v; };
  const Kn = shape.nodes.map((nd) => (mc.priorOnly ? 0 : kIntegral(par, mc, main.mag, 0, tIssue, nd.p, nd.c)));
  const post = posterior(par, main.mag, used.length, (nd, j) => Kn[j], { nodes: shape.nodes, sumLn });
  const table = forecast(post, par, main.mag, main.t, issueMs);
  /* the answer check: the windows that ended before the present, at the magnitudes the catalogue records completely —
     none at all when the completeness itself is unknown (priorOnly) */
  const after = inZone.filter((e) => e.t > issueMs && e.mag != null);
  const check = table.map((w) => {
    if (w.end > now) return { key: w.key, state: 'open' };
    const obsMcMax = mcAt(mc, main.mag, Math.max(tIssue, 1e-9));
    return { key: w.key, state: 'closed', bins: w.bins.map((b) => {
      if (mc.priorOnly || b.mag < mc.magCat || b.mag < obsMcMax) return { mag: b.mag, asLarge: b.asLarge, checkable: false };
      const n = after.filter((e) => e.t <= w.end && e.mag >= b.mag).length;
      return { mag: b.mag, asLarge: b.asLarge, checkable: true, observed: n, verdict: n < b.lo ? 'below' : n > b.hi ? 'above' : 'within' };
    }) };
  });
  /* the cumulative curve the card draws: the expected count of complete aftershocks to t over the posterior cells —
     its median and 2.5 / 97.5 % (the parameter band, a and p together) */
  const expectedBand = (tDays) => {
    /* a drawing, not a forecast: the early incomplete part integrated in 256 steps (under 10⁻³ of the 2048-step value) */
    const k = new Map();
    const pairs = post.a.map((a, i) => { let v = k.get(post.k[i]); if (v === undefined) { const nd = post.nodes[post.k[i]]; v = kIntegral(par, mc, main.mag, 0, tDays, nd.p, nd.c, 256); k.set(post.k[i], v); } return [Math.pow(10, a) * v, post.w[i]]; });
    const [lo, mid, hi] = weightedQuantiles(pairs, [0.025, 0.5, 0.975]);
    return { lo, mid, hi };
  };
  return {
    main, issueMs, tIssueDays: tIssue, regime: reg, params: par, zone, completeness: mc, priorOnly: mc.priorOnly,
    deep: finite(main.depthKm) && main.depthKm >= AS.DEEP_KM,
    used: used.length, usedEvents: used, inZone, after,
    largestAfter: inZone.filter((e) => e.t <= issueMs && e.mag != null).reduce((b, e) => (!b || e.mag > b.mag ? e : b), null),
    posterior: { mean: post.mean, sd: post.sd, priorMean: post.priorMean, priorSd: post.priorSd, pMean: post.pMean, pSd: post.pSd, pPriorMean: post.pPriorMean, pPriorSd: post.pPriorSd, cMean: post.cMean, cPriorSdLog10: shape.c.sdLog10 },
    forecast: table, check, expectedBand,
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
    the point rounded and the radius widened (AS.NEAR_KM + SLACK_KM), the exact circle applied by `pickNear` */
export function nearUrl(lng, lat, endMs) {
  const c = roundedCentre(lng, lat), p = new URLSearchParams();
  p.set('format', 'geojson'); p.set('eventtype', 'earthquake');
  p.set('latitude', String(c.lat)); p.set('longitude', String(c.lng));
  p.set('maxradiuskm', String(Math.round(AS.NEAR_KM + SLACK_KM)));
  p.set('minmagnitude', String(AS.MIN_MAIN));
  p.set('starttime', new Date(endMs - AS.LIST_DAYS * DAY).toISOString().slice(0, 19));
  p.set('endtime', new Date(endMs).toISOString().slice(0, 19));
  p.set('orderby', 'magnitude'); p.set('limit', '200');
  return AS.ENDPOINT + 'query?' + p.toString();
}
/** pickNear(fc, centre, endMs) — the largest of them within the exact circle (the latest of equals), or null */
export function pickNear(fc, centre, endMs) {
  const ev = within(((fc && fc.features) || []).map(normalise).filter((e) => e && e.mag != null && e.mag >= AS.MIN_MAIN && e.t <= endMs), centre, AS.NEAR_KM);
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
    mainshock: { id: r.main.id, magnitude: r.main.mag, time: new Date(r.main.t).toISOString(), place: r.main.place, lng: r.main.lng, lat: r.main.lat, depthKm: r.main.depthKm },
    issued: new Date(r.issueMs).toISOString(), daysAfterMainshock: +r.tIssueDays.toFixed(3),
    regime: r.regime.regime, regimeSource: r.regime.source === 'region' ? 'USGS California region' : 'García et al. (2012) regionalization',
    parameters: { aPriorMean: r.posterior.priorMean, aPriorSd: r.posterior.priorSd, aPosteriorMean: r.posterior.mean, aPosteriorSd: r.posterior.sd,
      pPriorMean: r.posterior.pPriorMean, pPriorSd: r.posterior.pPriorSd, pPosteriorMean: r.posterior.pMean, pPosteriorSd: r.posterior.pSd, cPrior: r.params.c, cPriorSdLog10: r.posterior.cPriorSdLog10, cPosteriorMean: r.posterior.cMean, b: r.params.b },
    zone: { centre: r.zone.centre, radiusKm: r.zone.radiusKm }, completenessMagnitude: r.completeness.magCat,
    completeness: { magnitude: r.completeness.magCat, source: r.completeness.source === 'sequence' ? 'estimated from this sequence (maximum curvature + ' + AS.MC_CORR + ')' : 'the network floor for the region (' + r.completeness.region + ')',
      networkFloor: r.completeness.networkMagCat, estimate: r.completeness.estimate },
    priorOnly: r.priorOnly || undefined,
    aftershocksUsed: r.used,
    largestAftershockSoFar: r.largestAfter ? { magnitude: r.largestAfter.mag, time: new Date(r.largestAfter.t).toISOString() } : null,
    forecast: r.forecast.map((w) => ({ window: w.key, from: new Date(w.start).toISOString(), to: new Date(w.end).toISOString(),
      bins: w.bins.map((b) => ({ magnitudeAtLeast: b.mag, asLargeAsMainshock: b.asLarge || undefined, probabilityPercent: pct(b.probability), countMedian: b.median, count95: [b.lo, b.hi] })) })),
    answerCheck: r.check.filter((c) => c.state === 'closed').map((c) => ({ window: c.key, bins: c.bins.filter((b) => b.checkable).map((b) => ({ magnitudeAtLeast: b.mag, observed: b.observed, verdict: b.verdict })) })),
    caveat: 'Not an official forecast: the Reasenberg–Jones model with USGS generic parameters (Page et al. 2016), updated with this sequence\'s own aftershocks. Probabilities are for the circle, not one site, and say nothing about which day. The ranges are the model\'s 95 %; how often real counts fell inside them in the published test is under «tested». Follow the national agency.',
    notes: notesOf(r),
  };
}
/** notesOf(r) — what the reader must know about THIS run, as codes with their facts (the card and Atlas word them) */
function notesOf(r) {
  const out = [];
  if (r.priorOnly) out.push({ code: 'prior-only', events: r.completeness.estimate.n, testedFrom: AS.TESTED.from });
  if (r.completeness.source === 'sequence') out.push({ code: 'completeness-raised', magnitude: r.completeness.magCat, networkFloor: r.completeness.networkMagCat, events: r.completeness.estimate.n });
  if (r.deep) out.push({ code: 'deep', depthKm: r.main.depthKm, boundaryKm: AS.DEEP_KM });
  return out;
}
/** testedCoverage(hindcast) — from the shipped test (AS.HINDCAST): per window and magnitude, how often the observed count
    fell inside the model's 95 % range ({ window, mag, n, inside, below, above }; inside is a fraction). Null if unreadable. */
export function testedCoverage(hc) {
  if (!hc || !Array.isArray(hc.score) || !hc.set) return null;
  return { sequences: hc.set.count, minMag: hc.set.minMag, from: hc.set.from, to: hc.set.to, issueDays: hc.set.issueDays,
    rows: hc.score.filter((z) => typeof z.mag === 'number').map((z) => ({ window: z.window, mag: z.mag, n: z.n, inside: z.n ? z.within / z.n : null, below: z.below, above: z.above })) };
}
