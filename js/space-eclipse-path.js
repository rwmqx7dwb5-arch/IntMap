/* ============================================================================
 *  IntMap · WHERE A SOLAR ECLIPSE FALLS ON THE GROUND — window.IntMapEclipsePath
 * ----------------------------------------------------------------------------
 *  js/space-events.js finds every solar eclipse in the app's own ephemeris and, by its own admission,
 *  stops at the geocentric event (`localCircumstances:false`): it knows THAT the Sun is eclipsed and how
 *  deeply the shadow axis passes the Earth, not WHERE. This file is the missing half — the track of the
 *  Moon's shadow across the ellipsoid and the eclipse as seen from one point on it.
 *
 *  ── HOW, AND FROM WHAT ─────────────────────────────────────────────────────────────────────────
 *  Nothing is tabulated: there is no list of eclipse dates, paths or Besselian elements anywhere in this
 *  file. The computation is the geometry those elements summarise, done directly:
 *
 *    · the Sun and the Moon as geocentric vectors WITH DISTANCE, from js/ephemeris.js (JPL approximate
 *      elements for the Earth–Moon barycentre; the truncated ELP-2000/82 of Meeus ch. 47 for the Moon);
 *    · the shadow axis runs from the Sun's centre through the Moon's; the umbral and penumbral cones are
 *      the two families of lines tangent to both spheres (half-angles asin((R☉ ∓ R☾)/|☾−☉|));
 *    · each cone and the axis are intersected with the WGS-84 ellipsoid (flattening included — the z
 *      axis is rescaled by a/b so the ellipsoid becomes a sphere and every line stays a line);
 *    · the intersection, an inertial (mean equator and equinox of date) vector, is turned to longitude
 *      and geodetic latitude by Greenwich mean sidereal time — js/space-sky.js `gmstDeg`, read through
 *      window.IntMapSky, not a second copy of the series.
 *
 *  The limits of the umbral path and of the partial eclipse are found as ENVELOPES, not as outlines
 *  drawn at fixed instants: a ground point lies on a limit at time t exactly when it is on the cone's
 *  edge AND the edge is moving tangentially past it (d/dt of «distance from axis − cone radius» = 0).
 *  That condition is solved for the position angle around the axis at every step, so the limit lines are
 *  where the shadow's edge GRAZES, with the Earth's rotation included.
 *
 *  ── THREE CORRECTIONS js/ephemeris.js DOES NOT MAKE, AND WHY THEY ARE HERE ──────────────────────
 *  At the Moon's distance an error of 1″ in the DIRECTION of the Sun or the Moon moves the shadow by
 *  384 400 km × 4.85e-6 ≈ 1.9 km on the ground, so corrections that do not matter to a sunrise matter
 *  here:
 *    1. ΔT. The ephemeris is a dynamical-time theory; the clock and the sidereal angle are UT. Positions
 *       are taken at TT = UT + ΔT (Espenak & Meeus polynomials, `deltaTSeconds` below). Leaving it out
 *       turns the Earth by 15″/s × ~70 s ≈ 0.29° under the shadow — about 30 km at mid-latitudes.
 *    2. The Earth–Moon barycentre. The JPL table's third row is the BARYCENTRE ("EM Bary"); the Earth
 *       sits up to 4 670 km from it, a 6.4″ swing in the Sun's direction (≈ 12 km of shadow). The
 *       geocentre is recovered with the Moon this file already has: ☉_geo = ☉_EMB + μ/(1+μ)·☾_geo,
 *       μ = M☾/M⊕ = 1/81.30056907 (IAU 2009 system of astronomical constants).
 *    3. Annual aberration of the Sun, −20.4898″/R in longitude (Meeus ch. 25): the shadow is cast by
 *       the Sun where its light left it, not where it is. ≈ 38 km if omitted.
 *  Nutation is NOT applied: it moves the Sun and the Moon by the same angle, and GMST (mean) is used with
 *  the mean equator and equinox, so the frame is consistent to the ~9″ of nutation in obliquity — a rigid
 *  rotation of the whole geometry about the geocentre, ≈ 0.3 km on the ground.
 *
 *  ── ⚠ HOW GOOD IT IS, MEASURED AND THEN DERIVED ─────────────────────────────────────────────────
 *  MEASURED 2026-11-17 against JPL Horizons (apparent ecliptic longitude of date, geocentre; this file's
 *  values given the nutation and, for the Sun, the aberration Horizons includes) at five instants
 *  2024-04 … 2026-08:
 *    · the Moon (truncated ELP-2000/82): −4.5″ … +5.8″ in longitude, ≤ 0.5″ in latitude;
 *    · the Sun (JPL approximate elements, the EMB row): −13″ … +35″ in longitude. THIS dominates.
 *  An error ε in the direction of either body moves the shadow axis at the Earth by D☾·ε ≈ 1.86 km per
 *  arcsecond, so the budget of a path point is ≈ (35 + 6) × 1.86 ≈ 77 km at worst, mostly ALONG the track
 *  (the Sun's error is in longitude, and solar eclipse tracks run roughly along the ecliptic). The same 41″
 *  over the Moon's motion relative to the Sun (≈ 0.5″/s) is ≈ 80 s in the instant of greatest eclipse;
 *  ΔT adds ≤ 5 s (the 2005–2050 polynomial gives 73.9 s for 2024 against the observed ≈ 69.2 s).
 *  What depends on DISTANCES rather than directions — path width, duration of totality — is far better:
 *  ELP's distance error (~30 km) moves the umbral radius at the Earth by 30 km × tan f ≈ 0.14 km. What does
 *  move a width is the slant of the ground under the shadow, which the position error tilts by Δ/R — a
 *  path of width w at solar altitude h by w·cot(h)·Δ/R (≈ 7 km for 2026-08-12, the Sun 26° up).
 *  The Moon's limb profile and centre-of-figure offset (NASA's ΔL/ΔB, 0.5″-class) are not modelled.
 *  OBSERVED against NASA's published circumstances (eclipse.gsfc.nasa.gov, SEdecade2021, TD → UT by ΔT):
 *  greatest eclipse 0–41 s, greatest point 28–37 km, γ ±0.0025, width ≤ 3 km, duration ≤ 1 s.
 *  tests/space-almanac-checks.test.mjs holds each to the budget above, not to the observation.
 *
 *  ⚠ The Moon's radius takes the two values the NASA eclipse canon uses (Espenak & Meeus): k = 0.2725076
 *  Earth radii (IAU, the mean limb) for the penumbra and partial contacts, k = 0.272281 (the limb valleys)
 *  for the umbra, totality and annularity. The Sun's radius is the 959.63″ at 1 AU js/space-events.js
 *  also uses (Meeus ch. 54 / the Explanatory Supplement).
 * ==========================================================================*/
import './ephemeris.js';      /* window.IntMapEphemeris — the Sun, the Moon, their distances */
import './space-sky.js';      /* window.IntMapSky.gmstDeg — Greenwich mean sidereal time (IAU 1982) */

const EPH = () => window.IntMapEphemeris;
const SKY = () => window.IntMapSky;
const D2R = Math.PI / 180, R2D = 180 / Math.PI, DAY = 86400000;
const AS = D2R / 3600;

/* WGS-84 */
const A_KM = 6378.137, F = 1 / 298.257223563, B_KM = A_KM * (1 - F), E2 = F * (2 - F);
const ZS = A_KM / B_KM;                            /* z-rescale that turns the ellipsoid into a sphere of radius a */
/* the Moon's radius, two values, see the header */
const K_PEN = 0.2725076, K_UMB = 0.272281;
const RM_PEN = K_PEN * A_KM, RM_UMB = K_UMB * A_KM;
/* μ = M☾/M⊕ (IAU 2009), the share of the Moon's vector by which the geocentre sits off the barycentre */
const MU_FRAC = (1 / 81.30056907) / (1 + 1 / 81.30056907);

/* ── ΔT = TT − UT, seconds ───────────────────────────────────────────────────────────────────────
   Espenak & Meeus, "Polynomial expressions for Delta T", Five Millennium Canon of Solar Eclipses
   (NASA/TP-2006-214141), the same piecewise fit NASA's eclipse pages use. `y` is the decimal year.
   ⚠ Outside the observed record (before ~1600, after the present) ΔT is an extrapolation of the
   Earth's rotation and the fit says so itself; its uncertainty grows to hours by 3000 BC, which is a
   longitude uncertainty of the whole path, not of its shape. */
export function deltaTSeconds(y) {
  let t, u;
  if (y < -500) { u = (y - 1820) / 100; return -20 + 32 * u * u; }
  if (y < 500) { u = y / 100;
    return 10583.6 - 1014.41 * u + 33.78311 * u ** 2 - 5.952053 * u ** 3 - 0.1798452 * u ** 4 + 0.022174192 * u ** 5 + 0.0090316521 * u ** 6; }
  if (y < 1600) { u = (y - 1000) / 100;
    return 1574.2 - 556.01 * u + 71.23472 * u ** 2 + 0.319781 * u ** 3 - 0.8503463 * u ** 4 - 0.005050998 * u ** 5 + 0.0083572073 * u ** 6; }
  if (y < 1700) { t = y - 1600; return 120 - 0.9808 * t - 0.01532 * t * t + t ** 3 / 7129; }
  if (y < 1800) { t = y - 1700; return 8.83 + 0.1603 * t - 0.0059285 * t * t + 0.00013336 * t ** 3 - t ** 4 / 1174000; }
  if (y < 1860) { t = y - 1800;
    return 13.72 - 0.332447 * t + 0.0068612 * t * t + 0.0041116 * t ** 3 - 0.00037436 * t ** 4 + 0.0000121272 * t ** 5 - 0.0000001699 * t ** 6 + 0.000000000875 * t ** 7; }
  if (y < 1900) { t = y - 1860; return 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * t ** 3 - 0.0004473624 * t ** 4 + t ** 5 / 233174; }
  if (y < 1920) { t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
  if (y < 1941) { t = y - 1920; return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t ** 3; }
  if (y < 1961) { t = y - 1950; return 29.07 + 0.407 * t - t * t / 233 + t ** 3 / 2547; }
  if (y < 1986) { t = y - 1975; return 45.45 + 1.067 * t - t * t / 260 - t ** 3 / 718; }
  if (y < 2005) { t = y - 2000;
    return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
  if (y < 2050) { t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
  if (y < 2150) { u = (y - 1820) / 100; return -20 + 32 * u * u - 0.5628 * (2150 - y); }
  u = (y - 1820) / 100; return -20 + 32 * u * u;
}
const yearOf = (ms) => 1970 + ms / (365.2425 * DAY);
/** the ephemeris' Julian day (TT) for a UTC instant */
export function jdTT(ms) { return EPH().julianDay(ms) + deltaTSeconds(yearOf(ms)) / 86400; }

/* ── small vector kit ─────────────────────────────────────────────────────────────────────────── */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.sqrt(dot(a, a));
const unit = (a) => mul(a, 1 / norm(a));
const sph = (lonDeg, latDeg, r) => { const l = lonDeg * D2R, b = latDeg * D2R; return [r * Math.cos(b) * Math.cos(l), r * Math.cos(b) * Math.sin(l), r * Math.sin(b)]; };
const rotZ = (v, deg) => { const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R); return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]]; };
const ecl2eq = (v, epsDeg) => { const c = Math.cos(epsDeg * D2R), s = Math.sin(epsDeg * D2R); return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]]; };
const wrap180 = (d) => ((d + 180) % 360 + 360) % 360 - 180;

/* ── the Sun and the Moon, geocentric, equatorial of date, km ──────────────────────────────────── */
const posCache = new Map();
/** {S, M} inertial (mean equator/equinox of date) vectors in km for a UTC instant, with the three
 *  corrections of the header applied */
function sunMoon(ms) {
  const key = Math.round(ms);
  const hit = posCache.get(key); if (hit) return hit;
  const E = EPH(), jd = jdTT(ms), AU = E.AU_KM;
  const m = E.geocentric('moon', jd), s = E.geocentric('sun', jd);
  const Mecl = sph(m.lonDeg, m.latDeg, m.distAU * AU);
  /* (2) barycentre → geocentre */
  let Secl = add(sph(s.lonDeg, s.latDeg, s.distAU * AU), mul(Mecl, MU_FRAC));
  /* (3) aberration: rotate the Sun's longitude by −20.4898″/R */
  const R = norm(Secl) / AU;
  const lon = Math.atan2(Secl[1], Secl[0]) * R2D - 20.4898 / 3600 / R;
  const lat = Math.asin(Secl[2] / norm(Secl)) * R2D;
  Secl = sph(lon, lat, norm(Secl));
  const eps = E.obliquityDeg(jd);
  const out = { S: ecl2eq(Secl, eps), M: ecl2eq(Mecl, eps), jd };
  if (posCache.size > 4000) posCache.clear();
  posCache.set(key, out);
  return out;
}
const gmst = (ms) => SKY().gmstDeg(ms);
const eciToEcef = (v, ms) => rotZ(v, -gmst(ms));
const ecefToEci = (v, ms) => rotZ(v, gmst(ms));

/* geodetic ↔ ECEF (km) */
function geodeticToEcef(latDeg, lngDeg, hKm) {
  const p = latDeg * D2R, l = lngDeg * D2R, sp = Math.sin(p);
  const N = A_KM / Math.sqrt(1 - E2 * sp * sp);
  return [(N + hKm) * Math.cos(p) * Math.cos(l), (N + hKm) * Math.cos(p) * Math.sin(l), (N * (1 - E2) + hKm) * sp];
}
/* a point ON the ellipsoid → [lng, geodetic lat] */
function ecefToLngLat(v) {
  const lng = Math.atan2(v[1], v[0]) * R2D;
  const lat = Math.atan2(v[2], (1 - F) * (1 - F) * Math.hypot(v[0], v[1])) * R2D;
  return [lng, lat];
}
/* the geodetic upward normal at a point on the ellipsoid */
function upAt(v) { return unit([v[0], v[1], v[2] * ZS * ZS]); }

/* first intersection of the line P + s·u (s growing towards the Earth) with the ellipsoid, or null */
function hitEllipsoid(P, u) {
  const p = [P[0], P[1], P[2] * ZS], d = [u[0], u[1], u[2] * ZS];
  const a = dot(d, d), b = 2 * dot(p, d), c = dot(p, p) - A_KM * A_KM;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = (-b - Math.sqrt(disc)) / (2 * a);
  if (s < 0) return null;
  return add(P, mul(u, s));
}

/* ── the shadow geometry at an instant ─────────────────────────────────────────────────────────── */
function shadowAt(ms) {
  const { S, M } = sunMoon(ms);
  const SM = sub(M, S), D = norm(SM), d = mul(SM, 1 / D);
  const Rs = EPH().AU_KM * Math.sin(959.63 * AS);
  const fu = Math.asin((Rs - RM_UMB) / D), fp = Math.asin((Rs + RM_PEN) / D);
  /* a basis across the axis: e2 is celestial north projected off the axis (the Besselian η direction),
     e1 completes it (ξ, towards the east) */
  const n = [0, 0, 1];
  const e2 = unit(sub(n, mul(d, dot(n, d)))), e1 = cross(e2, d);
  return { ms, S, M, d, D, Rs, fu, fp, e1, e2 };
}
/* for an inertial point P: how far inside the umbra (gU) and the penumbra (gP) it is, km; negative = inside */
function shadowG(sh, P) {
  const w = sub(P, sh.M), z = dot(w, sh.d);
  const rho = norm(sub(w, mul(sh.d, z)));
  const Lu = RM_UMB / Math.cos(sh.fu) - z * Math.tan(sh.fu);   /* > 0 umbra (total), < 0 antumbra (annular) */
  const Lp = RM_PEN / Math.cos(sh.fp) + z * Math.tan(sh.fp);
  return { gU: rho - Math.abs(Lu), gP: rho - Lp, Lu, Lp, rho, z };
}
/* the ground point on the edge of a cone at position angle θ (radians from e1 towards e2) */
function edgePoint(sh, theta, umbra) {
  const u = add(mul(sh.e1, Math.cos(theta)), mul(sh.e2, Math.sin(theta)));
  if (umbra) {
    /* the umbral vertex lies downstream of the Moon; one line through it covers the umbra (upstream of
       the vertex, at angle θ) and the antumbra (downstream, at θ+π) — the generator for θ is that line
       traversed sunwards-first */
    const V = add(sh.M, mul(sh.d, RM_UMB / Math.sin(sh.fu)));
    const g = sub(mul(sh.d, Math.cos(sh.fu)), mul(u, Math.sin(sh.fu)));
    /* start back at the Moon (sunwards of the Earth in both cases) and intersect forwards. For an annular
       eclipse the line has crossed the vertex before it lands, so the point is at θ+π — which side of the
       axis a point is on is therefore read from the point itself (limitPointsAt), never from θ */
    return hitEllipsoid(sub(V, mul(g, norm(sub(V, sh.M)))), g);
  }
  const V = sub(sh.M, mul(sh.d, RM_PEN / Math.sin(sh.fp)));
  const g = add(mul(sh.d, Math.cos(sh.fp)), mul(u, Math.sin(sh.fp)));
  return hitEllipsoid(V, g);
}
/* the shadow axis meets the ground here, or null */
function axisPoint(sh) { return hitEllipsoid(sh.M, sh.d); }
/* γ: the axis' least distance from the geocentre, in equatorial Earth radii */
function gammaAt(ms) {
  const sh = shadowAt(ms);
  return norm(sub(sh.M, mul(sh.d, dot(sh.M, sh.d)))) / A_KM;
}

/* ── one-dimensional searches ──────────────────────────────────────────────────────────────────── */
function goldenMin(f, a, b, tol) {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  while (b - a > tol) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}
function bisect(f, a, b, tol) {
  let fa = f(a);
  for (let i = 0; i < 80 && b - a > tol; i++) {
    const m = (a + b) / 2, fm = f(m);
    if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}
/* minimise f over [a,b] by sampling every `step` then golden section around the best sample */
function scanMin(f, a, b, step, tol) {
  let best = a, fb = Infinity;
  for (let t = a; t <= b; t += step) { const v = f(t); if (v < fb) { fb = v; best = t; } }
  return goldenMin(f, Math.max(a, best - step), Math.min(b, best + step), tol);
}

/* the instant the axis passes closest to the geocentre, near a seed (UTC ms) */
function greatestNear(seedMs) {
  return scanMin(gammaAt, seedMs - 6 * 3600e3, seedMs + 6 * 3600e3, 300e3, 50);
}

/* ── the limit lines, as envelopes ─────────────────────────────────────────────────────────────── */
const DT_DERIV = 5000;     /* ms — the half-step of the time derivative; the edge moves ~0.5–2 km/s */
function limitPointsAt(ms, umbra) {
  const sh = shadowAt(ms), shA = shadowAt(ms - DT_DERIV), shB = shadowAt(ms + DT_DERIV);
  const key = umbra ? 'gU' : 'gP';
  const N = 72, pts = [];
  const sample = (th) => {
    const X = edgePoint(sh, th, umbra); if (!X) return null;
    const Xe = eciToEcef(X, ms);
    const a = shadowG(shA, ecefToEci(Xe, ms - DT_DERIV))[key], b = shadowG(shB, ecefToEci(Xe, ms + DT_DERIV))[key];
    return { X, Xe, h: (b - a) / (2 * DT_DERIV) };
  };
  let prev = sample(0), prevTh = 0;
  for (let i = 1; i <= N; i++) {
    const th = (i / N) * 2 * Math.PI, cur = sample(th);
    if (prev && cur && (prev.h < 0) !== (cur.h < 0)) {
      const root = bisect((t) => { const s = sample(t); return s ? s.h : NaN; }, prevTh, th, 1e-5);
      const r = sample(root);
      if (r) pts.push({ theta: root, north: dot(sub(r.X, sh.M), sh.e2) > 0, lngLat: ecefToLngLat(r.Xe), Xe: r.Xe });
    }
    prev = cur; prevTh = th;
  }
  return pts;
}
/* keep a line's longitudes continuous across ±180° (they may then run past 180; MapLibre draws them) */
function unwrap(coords) {
  for (let i = 1; i < coords.length; i++) {
    const d = coords[i][0] - coords[i - 1][0];
    if (d > 180) coords[i][0] -= 360 * Math.round(d / 360);
    else if (d < -180) coords[i][0] += 360 * Math.round(-d / 360);
  }
  return coords;
}
/* runs of consecutive samples → LineString / MultiLineString / null */
function lineOf(runs) {
  const ok = runs.filter((r) => r.length >= 2).map((r) => unwrap(r.map((p) => p.slice())));
  if (!ok.length) return null;
  return ok.length === 1 ? { type: 'LineString', coordinates: ok[0] } : { type: 'MultiLineString', coordinates: ok };
}
function traceLimits(t0, t1, step, umbra) {
  const north = [], south = [];
  let runN = [], runS = [];
  for (let t = t0; t <= t1; t += step) {
    const pts = limitPointsAt(t, umbra);
    const n = pts.find((p) => p.north), s = pts.find((p) => !p.north);
    if (n) runN.push([n.lngLat[0], n.lngLat[1], Math.round(t)]); else if (runN.length) { north.push(runN); runN = []; }
    if (s) runS.push([s.lngLat[0], s.lngLat[1], Math.round(t)]); else if (runS.length) { south.push(runS); runS = []; }
  }
  if (runN.length) north.push(runN);
  if (runS.length) south.push(runS);
  return { north, south };
}

/* ── the path ──────────────────────────────────────────────────────────────────────────────────── */
const CENTRAL_STEP = 60e3, UMBRA_STEP = 60e3, PEN_STEP = 120e3;
const SPAN = 4 * 3600e3;   /* every phase of a solar eclipse on the Earth lies within ±4 h of greatest (the
                              penumbra's whole passage is at most ~6 h, the umbra's ~3.5 h) */

/**
 * The ground track of the solar eclipse whose greatest phase is nearest `when`.
 * @param {number} when  a UTC ms instant, or a Julian day (anything below 1e8 is read as a JD in UT) — a seed:
 *                       the instant of greatest eclipse is searched within ±6 h of it
 * @param {{steps?:{centralS?:number,umbraS?:number,penumbraS?:number}}} [opts]
 */
function solarEclipsePath(when, opts) {
  opts = opts || {};
  const seedMs = when < 1e8 ? EPH().msOfJD(when) : when;
  const stepC = ((opts.steps && opts.steps.centralS) || CENTRAL_STEP / 1000) * 1000;
  const stepU = ((opts.steps && opts.steps.umbraS) || UMBRA_STEP / 1000) * 1000;
  const stepP = ((opts.steps && opts.steps.penumbraS) || PEN_STEP / 1000) * 1000;
  const tg = greatestNear(seedMs);
  const shg = shadowAt(tg), gamma = gammaAt(tg);
  const source = 'computed from js/ephemeris.js (JPL approx elements + truncated ELP-2000/82)';

  /* the greatest point: the axis on the ground, or (non-central) the surface point nearest the axis */
  let gp = axisPoint(shg), central = !!gp;
  if (!gp) {
    const Q = sub(shg.M, mul(shg.d, dot(shg.M, shg.d)));
    const q = unit([Q[0], Q[1], Q[2] * ZS]);                 /* nearest direction, in the sphere-scaled frame */
    gp = [q[0] * A_KM, q[1] * A_KM, q[2] * A_KM / ZS];
  }
  const gg = shadowG(shg, gp);
  if (gg.gP > 0) return { jdMax: EPH().julianDay(tg), ms: tg, kind: null, gamma, source,
    reason: 'the penumbra does not reach the Earth near this instant — there is no solar eclipse here' };
  const gpE = eciToEcef(gp, tg), [gLng, gLat] = ecefToLngLat(gpE);

  /* the central line, its ends found by bisection on «the axis meets the ground» */
  const line = [], kinds = new Set();
  let tStart = null, tEnd = null;
  if (central) {
    const hits = (t) => (axisPoint(shadowAt(t)) ? -1 : 1);
    let t = tg; while (t > tg - SPAN && hits(t - stepC) < 0) t -= stepC;
    tStart = t > tg - SPAN ? bisect(hits, t - stepC, t, 200) : t;
    t = tg; while (t < tg + SPAN && hits(t + stepC) < 0) t += stepC;
    tEnd = t < tg + SPAN ? bisect((x) => -hits(x), t, t + stepC, 200) : t;
    const times = [tStart + 1];
    for (let x = Math.ceil(tStart / stepC) * stepC; x < tEnd; x += stepC) times.push(x);
    times.push(tEnd - 1);
    for (const x of times) {
      const sh = shadowAt(x), P = axisPoint(sh); if (!P) continue;
      const [lng, lat] = ecefToLngLat(eciToEcef(P, x));
      line.push([lng, lat, Math.round(x)]);
      kinds.add(shadowG(sh, P).Lu > 0 ? 'total' : 'annular');
    }
    unwrap(line);
  }
  let kind;
  if (central) kind = kinds.size > 1 ? 'hybrid' : [...kinds][0];
  else kind = gg.gU < 0 ? (gg.Lu > 0 ? 'total' : 'annular') : 'partial';

  /* the duration of the central phase at the greatest point, and the path width there */
  let durationS = null, widthKm = null, umbra = null, nonCentral = !central && kind !== 'partial';
  if (kind !== 'partial') {
    const gU = (t) => shadowG(shadowAt(t), ecefToEci(gpE, t)).gU;
    if (gU(tg) < 0) {
      let a = tg; while (a > tg - 900e3 && gU(a) < 0) a -= 30e3;
      let b = tg; while (b < tg + 900e3 && gU(b) < 0) b += 30e3;
      const c2 = bisect((t) => -gU(t), a, a + 30e3, 20), c3 = bisect(gU, b - 30e3, b, 20);
      durationS = (c3 - c2) / 1000;
    }
    const lims = traceLimits((tStart != null ? tStart : tg) - 20 * 60e3, (tEnd != null ? tEnd : tg) + 20 * 60e3, stepU, true);
    const pick = (runs) => runs.reduce((a, r) => (r.length > a.length ? r : a), []);
    const N = pick(lims.north), S = pick(lims.south);
    if (N.length >= 2 && S.length >= 2) {
      const ring = unwrap([...N.map((p) => [p[0], p[1]]), ...S.slice().reverse().map((p) => [p[0], p[1]])]);
      ring.push(ring[0].slice());
      umbra = { type: 'Polygon', coordinates: [ring] };
    }
    if (central) {
      /* width: the two limit points at greatest, measured across the ground direction of the central line */
      const lp = limitPointsAt(tg, true), n = lp.find((p) => p.north), s = lp.find((p) => !p.north);
      if (n && s) {
        const a2 = axisPoint(shadowAt(tg - 30e3)), b2 = axisPoint(shadowAt(tg + 30e3));
        const up = upAt(gpE);
        let along = a2 && b2 ? sub(eciToEcef(b2, tg + 30e3), eciToEcef(a2, tg - 30e3)) : null;
        if (along) {
          along = unit(sub(along, mul(up, dot(along, up))));
          const left = cross(up, along);
          widthKm = Math.abs(dot(sub(n.Xe, gpE), left)) + Math.abs(dot(sub(s.Xe, gpE), left));
        }
      }
    }
  }
  const pen = traceLimits(tg - SPAN, tg + SPAN, stepP, false);
  return {
    jdMax: EPH().julianDay(tg), ms: tg, kind, gamma, nonCentral,
    greatest: { lng: gLng, lat: gLat, durationS, widthKm, sunAltDeg: sunAltitudeAt(gpE, tg) },
    central: line,
    centralSpan: central ? { from: tStart, to: tEnd } : null,
    umbra,
    penumbraNorth: lineOf(pen.north), penumbraSouth: lineOf(pen.south),
    steps: { centralS: stepC / 1000, umbraS: stepU / 1000, penumbraS: stepP / 1000, positionAngles: 72 },
    deltaTSeconds: deltaTSeconds(yearOf(tg)),
    source,
    /* the geometric conventions a reader of the polygon needs */
    notes: 'longitudes are kept continuous along each line (they may pass ±180°); the umbral polygon is closed by straight '
      + 'segments where the path meets sunrise/sunset; altitudes are geometric (no refraction)',
  };
}

/* the Sun's geometric altitude at a ground point (ECEF km) at an instant, degrees */
function sunAltitudeAt(Pe, ms) {
  const { S } = sunMoon(ms);
  const P = ecefToEci(Pe, ms), up = ecefToEci(upAt(Pe), ms);
  return Math.asin(dot(unit(sub(S, P)), up)) * R2D;
}

/* ── the eclipse from one place ────────────────────────────────────────────────────────────────── */
function overlapFraction(rs, rm, c) {
  /* the share of the Sun's disc (radius rs) covered by the Moon's (rm) at centre separation c */
  if (c >= rs + rm) return 0;
  if (c <= Math.abs(rm - rs)) return rm >= rs ? 1 : (rm * rm) / (rs * rs);
  const a = Math.acos((c * c + rs * rs - rm * rm) / (2 * c * rs)), b = Math.acos((c * c + rm * rm - rs * rs) / (2 * c * rm));
  const area = rs * rs * (a - Math.sin(2 * a) / 2) + rm * rm * (b - Math.sin(2 * b) / 2);
  return area / (Math.PI * rs * rs);
}

/**
 * The solar eclipse nearest `when` as seen from one place.
 * @returns {{magnitude:number, obscuration:number, c1:number|null, c2:number|null, max:number|null,
 *   c3:number|null, c4:number|null, sunAltAtMax:number|null, sunAltAt:object, kind:string|null,
 *   durationS:number|null, visible:{ms,magnitude,sunAltDeg}|null}}
 *   times are UTC ms; magnitude is the fraction of the Sun's DIAMETER covered (may exceed 1 in totality),
 *   obscuration the fraction of its AREA; c2/c3 are null unless the place sees totality or annularity.
 *   The contacts are geometric and hold whether or not the Sun is up; `visible` is the part that is seen.
 */
export function localCircumstances(when, lat, lng, elevM) {
  const seedMs = when < 1e8 ? EPH().msOfJD(when) : when;
  const Pe = geodeticToEcef(+lat, +lng, (+elevM || 0) / 1000);
  const upE = upAt(geodeticToEcef(+lat, +lng, 0));
  const geom = (t) => {
    const { S, M } = sunMoon(t), P = ecefToEci(Pe, t);
    const vs = sub(S, P), vm = sub(M, P), ds = norm(vs), dm = norm(vm);
    const Rs = EPH().AU_KM * Math.sin(959.63 * AS);
    const c = Math.acos(Math.max(-1, Math.min(1, dot(vs, vm) / (ds * dm))));
    return { c, rs: Math.asin(Rs / ds), rmP: Math.asin(RM_PEN / dm), rmU: Math.asin(RM_UMB / dm),
      sunAlt: Math.asin(dot(vs, ecefToEci(upE, t)) / ds) * R2D };
  };
  const tg = greatestNear(seedMs);
  const tmax = scanMin((t) => geom(t).c, tg - SPAN, tg + SPAN, 120e3, 50);
  const g = geom(tmax);
  const magnitude = (g.rs + g.rmP - g.c) / (2 * g.rs);
  const none = { magnitude: Math.max(0, magnitude), obscuration: 0, c1: null, c2: null, max: null, c3: null, c4: null,
    sunAltAtMax: g.sunAlt, sunAltAt: {}, kind: null, durationS: null, visible: null };
  if (magnitude <= 0) return Object.assign(none, { reason: 'the Moon does not reach the Sun\'s disc from this place' });
  const fP = (t) => { const x = geom(t); return x.c - (x.rs + x.rmP); };
  const fU = (t) => { const x = geom(t); return x.c - Math.abs(x.rs - x.rmU); };
  const outward = (f, from, dir) => {
    let t = from; const step = 60e3;
    while (Math.abs(t - from) < SPAN && f(t + dir * step) < 0) t += dir * step;
    return dir < 0 ? bisect((x) => -f(x), t - step, t, 50) : bisect(f, t, t + step, 50);
  };
  const c1 = outward(fP, tmax, -1), c4 = outward(fP, tmax, +1);
  let c2 = null, c3 = null, kind = 'partial';
  if (fU(tmax) < 0) {
    c2 = outward(fU, tmax, -1); c3 = outward(fU, tmax, +1);
    kind = g.rmU >= g.rs ? 'total' : 'annular';
  }
  const alt = (t) => (t == null ? null : geom(t).sunAlt);
  /* The geometry above treats the Earth as transparent: a place on the night side still gets a magnitude.
     What can be SEEN is the eclipse while the Sun is above the horizon — its upper limb at the geometric
     altitude −50′ (34′ refraction + 16′ semidiameter, Meeus ch. 15; the dip of an elevated observer,
     1.76′·√h, lowers it). Sampled every 30 s from c1 to c4, the greatest magnitude so seen and its instant;
     null when the Sun is down throughout. */
  const hz = -50 / 60 - ((+elevM || 0) > 0 ? (1.76 / 60) * Math.sqrt(+elevM) : 0);
  let visible = null;
  const consider = (t) => {
    const x = geom(t); if (x.sunAlt <= hz) return;
    const mg = (x.rs + x.rmP - x.c) / (2 * x.rs);
    if (mg > 0 && (!visible || mg > visible.magnitude)) visible = { ms: t, magnitude: mg, sunAltDeg: x.sunAlt };
  };
  for (let t = c1; t < c4; t += 30e3) consider(t);
  consider(tmax); consider(c4 - 1);
  return {
    magnitude, obscuration: overlapFraction(g.rs, g.rmP, g.c), kind,
    c1, c2, max: tmax, c3, c4, sunAltAtMax: g.sunAlt,
    sunAltAt: { c1: alt(c1), c2: alt(c2), max: g.sunAlt, c3: alt(c3), c4: alt(c4) },
    durationS: c2 != null ? (c3 - c2) / 1000 : null,
    visible,
  };
}

const api = { solarEclipsePath, localCircumstances, deltaTSeconds, jdTT, sunMoon,
  state: () => ({ source: 'js/ephemeris.js + js/space-sky.js gmstDeg', ellipsoid: 'WGS-84',
    moonK: { penumbra: K_PEN, umbra: K_UMB }, deltaT: 'Espenak & Meeus 2006 polynomials' }) };
window.IntMapEclipsePath = api;
export const IntMapEclipsePath = api;
