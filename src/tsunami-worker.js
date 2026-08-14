/* ============================================================================
 *  IntMap · THE TSUNAMI SOLVER, OFF THE MAIN THREAD  (#R193, made GLOBAL in #R197)
 * ----------------------------------------------------------------------------
 *  「津波シミュレータのシミュレート範囲は全球に。また、精度と忠実性を根本的に大幅に強化して。」
 *
 *  #R193 moved the solve off the page. #R197 moves the MODEL off the page — the sea floor, the fault
 *  and the initial sea surface are built here too — and makes the domain the whole planet.
 *
 *  ── WHAT WAS WRONG WITH A BOX ───────────────────────────────────────────────────────────────────
 *  Up to #R196 the domain was a lat/lon box around the epicentre, sized from the run length, capped
 *  at ±52° of latitude and ±170° of longitude and clipped to ±78°. Three things follow from that,
 *  and all three are errors in the answer rather than in the picture:
 *
 *   · a wave that reaches the edge is GONE. The Pacific is 160° wide; a Chilean source with a 6 h
 *     box never contains Japan, and a 24 h box that does contain it is 340° wide — nearly the globe,
 *     but built as if the two edges were unrelated;
 *   · the two edges ARE the same meridian, and the sponge that stopped them reflecting also removed
 *     energy that should have kept going. Every trans-Pacific arrival was low;
 *   · the box was re-cut per run, so the cell size changed with the length of the run — 22 km for a
 *     6 h Tōhoku run, 40 km for 24 h. The model's resolution depended on how long you asked to watch.
 *
 *  Now: −180…180 by −80…80 at 0.25°, 1440 × 640, and LONGITUDE IS PERIODIC. Column NX−1's eastern
 *  neighbour is column 0, in every one of the three equations. There is no edge in longitude, so
 *  nothing reflects off one and nothing leaves through one; a wave that crosses the Pacific arrives,
 *  keeps going, and comes back.
 *
 *  ── THE EQUATIONS ───────────────────────────────────────────────────────────────────────────────
 *  Shallow-water (long-wave) in flux form on a spherical Arakawa C-grid, leapfrog in time — what JMA,
 *  TUNAMI-N2 and COMCOT solve offshore:
 *
 *      ∂M/∂t − f·N = −g·D·(1/(R cosφ))·∂η/∂λ − τ_x     M, N: volume flux (m²/s)
 *      ∂N/∂t + f·M = −g·D·(1/R)·∂η/∂φ       − τ_y     D = h + η: TOTAL depth
 *      ∂η/∂t = −(1/(R cosφ))·[ ∂M/∂λ + ∂(N cosφ)/∂φ ]
 *
 *   · the pressure term uses the TOTAL depth D = h + η, not the still-water depth h. In 4 km of ocean
 *     that is a 0.02 % correction and invisible; over a 30 m shelf with a 5 m wave it is 17 %, and it
 *     is the difference between a wave that keeps its linear speed all the way in and one that
 *     steepens as the real thing does.
 *   · BOTTOM FRICTION, Manning: τ = g·n²·M·|M|/D^(7/3), n = 0.025 s·m^(−1/3) (Kotani et al. 1998, the
 *     value the Japanese operational models use over an ocean floor). Negligible in deep water by
 *     D^(7/3); dominant on the shelf, and the reason an unfrictioned long-wave model over-predicts
 *     coastal amplitude.
 *   · (#R197) CORIOLIS, f = 2Ω·sinφ. It was absent while the domain was a box a few hours wide, where
 *     it is a rounding error. Over a run that is now allowed to be thirty hours and to cross a whole
 *     ocean it is not: f⁻¹ at mid-latitude is about 3 h, so the far field of a trans-Pacific tsunami
 *     is rotated by an angle of order one. It is carried explicitly — f·Δt ≈ 4×10⁻³ here, four orders
 *     inside the explicit stability limit, so it costs two multiplies and no time step.
 *
 *  ⚠ ADVECTION (∂(M²/D)/∂x …) IS DELIBERATELY ABSENT, and this is a measurement rather than a
 *  simplification: at these cell sizes the Froude number in the open ocean is M/(D·√(gD)) ≈ 1e−4, so
 *  the advective terms are four orders below the pressure term, while an upwind advection stencil on a
 *  28 km grid adds its own numerical diffusion that is larger than the term it models. What it would
 *  change — the last kilometre, where the wave is a bore — this grid cannot resolve at all.
 *
 *  ⚠ THE KAJIURA FILTER IS ALSO ABSENT, for the same kind of reason. The sea surface does not copy the
 *  sea floor exactly: the response is low-passed over a length of order the water depth (Kajiura 1963),
 *  usually approximated by a Gaussian of σ ≈ 0.75·h. With h ≈ 4–6 km that is σ ≈ 3–4.5 km, and this
 *  grid's cell is 28 km. The filter would be entirely inside one cell — it is already applied, by the
 *  sampling. Adding it would be arithmetic that changes nothing, which #R191 established is worth
 *  saying rather than doing.
 *
 *  ⚠ FREQUENCY DISPERSION IS ALSO ABSENT, AND HERE IS THE SIZE OF IT — stated because a global model
 *  is exactly where it would accumulate. The shortest wave this grid carries is about 4Δx ≈ 112 km;
 *  in 4 km of water its true phase speed is √(tanh(kh)/kh) = 0.992 of the long-wave speed, so after
 *  10,000 km it lags the modelled front by ~80 km, i.e. about 6 minutes in 13 hours. The leading
 *  wave, which is what an arrival time is read off, is much longer than that and lags by less. A
 *  Boussinesq term would be an implicit solve at every step for a correction smaller than the
 *  bathymetry's own uncertainty at 0.25°.
 *
 *  ── ⚠ THE POLES, AND WHY THE TIME STEP DOES NOT COLLAPSE ────────────────────────────────────────
 *  A lat/lon cell narrows as cosφ. At 80° it is 4.8 km against 27.8 km at the equator, and the CFL
 *  condition would take Δt down by the same factor — 11,500 steps for a 30 h run instead of 4,000,
 *  for cells that are almost all land or ice. The standard answer, and the one used here, is a POLAR
 *  FILTER (Arakawa & Lamb 1977): poleward of 60° the field is smoothed ALONG each latitude circle
 *  with a circular box filter whose width is cos(60°)/cosφ cells, applied twice so the filter's own
 *  sidelobes do not survive. That removes exactly the zonal wavenumbers whose phase speed would
 *  break the step, and the step is then set by the cell at 60°.
 *
 *  ⚠ It is an approximation, so it is CHECKED rather than trusted: the run carries a bound on |η| and
 *  returns an error instead of a picture if the field ever leaves it. A model that blew up quietly
 *  would look like a tsunami.
 *
 *  ── STABILITY ───────────────────────────────────────────────────────────────────────────────────
 *  Δt from the CFL condition with a 0.45 margin, evaluated PER CELL — its own width against its own
 *  depth — rather than pairing the narrowest cell in the domain with the deepest one, and with the
 *  width poleward of the filter latitude taken as the filter's own effective width.
 *
 *  ── WHAT COMES BACK ─────────────────────────────────────────────────────────────────────────────
 *  Frames STREAM as they are produced, so the animation is watchable long before the run ends. Each
 *  is the surface elevation companded into an Int8: q = sign(η)·round(127·(|η|/A)^(1/3)) against the
 *  run's own peak A. The cube root is the same curve the colour ramp uses, so one step of q is ~0.8 %
 *  of the ramp everywhere.
 *
 *  ⚠ THE FRAMES ARE DECIMATED AND THE ANALYSIS IS NOT. 1440 × 640 Int8 is 921 KB a frame and 140 of
 *  them is 126 MB, which is not a thing to hold in a tab. The picture is decimated by `dec` (2 on a
 *  desktop → 720 × 320, 31 MB for the whole run) by AREA AVERAGE, which is what drawing the same
 *  field at half the resolution means. The maximum crest, the minimum trough and the first-arrival
 *  time are never quantised and never decimated: they are computed here in full precision on the full
 *  grid and sent once at the end, because they are what gets read as numbers.
 * ==========================================================================*/
'use strict';
/* eslint-disable no-unused-vars */
const RE = 6371000, G = 9.80665, DEG = Math.PI / 180;
const MANNING = 0.025;                 /* s·m^(−1/3) — ocean floor, Kotani et al. 1998 */
const ARRIVE = 0.01;                   /* m — the level a DART buoy calls an arrival */
const OMEGA = 7.2921159e-5;            /* rad/s — Earth's rotation rate, for the Coriolis parameter */
const SANE = 500;                      /* m — |η| above this is not a tsunami, it is a divergence */
const MU = 3.0e10;                     /* Pa — rigidity, for the seismic moment */

let abort = 0;

/* ══ OKADA (1985) — the vertical surface displacement of one rectangular dislocation ═══════════════
   Moved here from js/tsunami.js in #R197 so the whole model is built off the main thread. Unchanged
   from #R192, which verified it against the published test case (L=3, W=2, d=4, δ=70°, observation
   (2,3): dip-slip uz = −3.5639e−2 against Okada's −3.564e−2 — tests/r197-checks.test.mjs runs that
   case against THIS file rather than asserting on its text).
   ⚠ arctan OF A RATIO, not atan2 — see the note inside. */
/* ══ ⚠ (#R223) THE SAME FORMULA, WITHOUT THE WORK IT WAS REPEATING ══════════════════════════════════
   「地震と津波シミュレータの計算速度を爆速にして。ただし品質は一切落とさないように。」 MEASURED on the
   shipped build (M9 off Tōhoku, 6 h, global grid): the run takes 31.1 s wall, of which the SOLVER is
   15.8 s — the other 15.2 s is the model build, and almost all of that is this function. It is called
   ~4.7 million times for one M9 (the 5×5 cell quadrature inside 1.5 rupture lengths, 24 tapered
   sub-faults each), and every single one of those calls was:
     · recomputing sin(δ) and cos(δ) for a dip that is the same constant for the whole run;
     · recomputing `q = y·sinδ − d·cosδ` FOUR times — once inside each corner of the Chinnery
       difference — although it does not depend on the corner at all;
     · allocating a closure for `f`.
   None of that is the physics; all of it is per-call overhead. The arithmetic that remains is
   identical, in the same order, so the answer is unchanged to the last bit — the published test case
   (L=3, W=2, d=4, δ=70°, at (2,3) → −3.5639e−2) is re-run against THIS file by
   tests/r197-checks.test.mjs, and #R223 adds a direct old-form/new-form comparison over a grid.
   ⚠ THE DIP MEMO IS A SINGLE SLOT, not a map: every call in a run shares one dip, so a one-entry
   cache hits every time and can never grow. */
let _okDip = NaN, _okSd = 0, _okCd = 0, _okCdS = 1, _okVert = false, _ok2cdS = 0;
function okadaUz(x, y, depth, L2, W2, dipDeg, slip) {
  if (dipDeg !== _okDip) {
    _okDip = dipDeg;
    const dip = dipDeg * DEG;
    _okSd = Math.sin(dip); _okCd = Math.cos(dip);
    _okVert = Math.abs(_okCd) < 1e-6;
    _okCdS = _okVert ? 1e-6 : _okCd;                      /* vertical faults are a limit, not a case */
    _ok2cdS = 2 / _okCdS;
  }
  const sd = _okSd, cd = _okCd, cdS = _okCdS;
  const p = y * cd + depth * sd;
  const q = y * sd - depth * cd;                          /* ⚠ corner-independent — hoisted out of f */
  const qq = q * q, sdcdS = sd * cdS;
  /* ⚠ PRINCIPAL value. The two-argument form adds ±π wherever the numerator and denominator change
     sign, and the Chinnery difference then keeps that jump as a plateau: measured before #R192
     fixed it, a constant −5.14 m of "subsidence" 400 km behind the fault, which is exactly
     slip·sinδ. Deformation must decay to zero away from a finite source. */
  const f = (xi, eta) => {
    const R = Math.sqrt(xi * xi + eta * eta + qq); if (!(R > 0)) return 0;
    const dt = eta * sd - q * cd;
    const X = Math.sqrt(xi * xi + qq);
    const den = xi * (R + X) * cdS;
    const I5 = _okVert ? (-0.5 * xi * q / ((R + dt) * (R + dt)))
      : ((Math.abs(den) < 1e-12) ? 0 : (0.5 * _ok2cdS * Math.atan((eta * (X + q * cdS) + X * (R + X) * sd) / den)));
    const t1 = (R + xi) !== 0 ? dt * q / (R * (R + xi)) : 0;
    const t2 = sd * ((Math.abs(q * R) > 1e-12) ? Math.atan(xi * eta / (q * R)) : 0);
    return t1 + t2 - I5 * sdcdS;
  };
  const pw = p - W2, xl = x - L2;
  const v = f(x, p) - f(x, pw) - f(xl, p) + f(xl, pw);
  return -(slip / (2 * Math.PI)) * v;
}

/* Wells & Coppersmith (1994), reverse faulting: subsurface rupture length and down-dip width from the
   moment magnitude, and the average slip that carries the moment over that area. */
function faultGeom(M) {
  const Lk = Math.pow(10, 0.58 * M - 2.42), Wk = Math.min(Lk, Math.pow(10, 0.41 * M - 1.61));
  const M0 = Math.pow(10, 1.5 * M + 9.1);
  const slip = M0 / (MU * Lk * 1000 * Wk * 1000);
  return { L: Lk * 1000, W: Wk * 1000, slip, M0 };
}

/* ══ (#R212) A HAND-DRAWN RUPTURE AREA, TURNED INTO THE SAME FAULT PLANE ════════════════════════════
   「津波シミュレータ時は、フリー描画震源域の地震にも対応するようにして。」 The model has always taken its
   plane from `faultGeom` — a length and a width regressed from the magnitude — and its strike from the
   sea floor's gradient. Both are stand-ins for something the user may have drawn explicitly.
   Given the ring, three of the four numbers come from the drawing itself and nothing is invented:
     · STRIKE  = the bearing of the ring's major principal axis (the eigenvector of its 2-D covariance
                 in a local metre frame), which is what «along the trench» means for a drawn shape.
     · L : W   = the extents along that axis and across it, i.e. the oriented bounding box.
     · L · W   = rescaled to the polygon's own spherical area, because a bounding box is bigger than
                 the shape inside it and the AREA is the quantity the moment is computed from.
     · SLIP    = the panel's average slip D̄, so M₀ = μ·A·D̄ — byte for byte the moment js/seismic.js
                 reports for the same rupture. The dip stays 15°: nothing in a drawn outline says how
                 steeply the plane goes down, and inventing one would be fabrication. */
function rupturePlane(rp, refLat) {
  const ring = rp && rp.ring;
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const mLat = 111320, mLng = 111320 * Math.cos(refLat * DEG);
  let cx = 0, cy = 0;
  for (const p of ring) { cx += +p[0]; cy += +p[1]; }
  cx /= ring.length; cy /= ring.length;
  const P = ring.map((p) => {
    let dl = +p[0] - cx; while (dl > 180) dl -= 360; while (dl < -180) dl += 360;
    return [dl * mLng, (+p[1] - cy) * mLat];
  });
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of P) { sxx += p[0] * p[0]; sxy += p[0] * p[1]; syy += p[1] * p[1]; }
  sxx /= P.length; sxy /= P.length; syy /= P.length;
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);          /* major axis, counter-clockwise from east */
  const ca = Math.cos(th), sa = Math.sin(th);
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const p of P) {
    const a = p[0] * ca + p[1] * sa, b = -p[0] * sa + p[1] * ca;
    if (a < a0) a0 = a; if (a > a1) a1 = a; if (b < b0) b0 = b; if (b > b1) b1 = b;
  }
  let L = Math.max(5000, a1 - a0), W = Math.max(5000, b1 - b0);
  const A = Math.max(1e7, (+rp.areaKm2 || 0) * 1e6);        /* the polygon's own area, in m² */
  const s = Math.sqrt(A / (L * W)); L *= s; W *= s;
  if (W > L) { const t = L; L = W; W = t; }                 /* length is the long one, by definition */
  const slip = Math.max(0.05, +rp.slipM || 1);
  const M0 = MU * L * W * slip;
  const strike = ((90 - th / DEG) % 360 + 360) % 360;       /* bearing, clockwise from north */
  return { L, W, slip, M0, strike, mw: (Math.log10(M0) - 9.1) / 1.5 };
}

/* ══ THE SOURCE IS A TAPERED SUB-FAULT GRID, NOT ONE RECTANGLE (#R193) ═════════════════════════════
   A uniform-slip rectangle puts the same displacement everywhere and steps to zero at the edge. Real
   ruptures taper. Splitting the plane into SUB_S × SUB_W sub-faults, weighting each by a raised taper
   along strike and down dip, and RE-NORMALISING so Σ(slip·area) is exactly M0/μ, keeps the magnitude
   honest while giving the peaked centre and the soft edges an inversion recovers. */
const SUB_S = 8, SUB_W = 3;
/* ⚠ √sin, NOT sin. Transcribing this into the worker for #R197 I wrote a plain raised sine, which is
   a different — narrower — slip distribution, and tests/r193-checks.test.mjs caught it by recomputing
   the taper independently. The published form this module was verified with is the square root of the
   raised sine, and the clamp keeps the endpoints off the zeros. */
function taper(s){ return Math.sqrt(Math.sin(Math.PI*Math.max(0.001,Math.min(0.999,s)))); }
function subFaults(g, dipDeg, topDepth) {
  const dl = g.L / SUB_S, dw = g.W / SUB_W, out = [], wts = [];
  let wsum = 0;
  for (let a = 0; a < SUB_S; a++) for (let b = 0; b < SUB_W; b++) {
    const w = taper((a + 0.5) / SUB_S) * taper((b + 0.5) / SUB_W);
    wts.push(w); wsum += w;
  }
  const norm=(SUB_S*SUB_W)/Math.max(1e-9,wsum);
  let k = 0;
  for (let a = 0; a < SUB_S; a++) for (let b = 0; b < SUB_W; b++) {
    /* ⚠ the sub-fault's own top edge, measured down dip from the plane's top — the shallow strips
       must sit shallow. Both forms reduce to the correct single rectangle when SUB_W is 1, which is
       exactly why an earlier version that got this wrong survived the first look. */
    out.push({
      x0: a * dl, y0: (g.W - (b + 1) * dw) * Math.cos(dipDeg * DEG),
      d0: topDepth + (b + 1) * dw * Math.sin(dipDeg * DEG),
      L: dl, W: dw, slip: g.slip * wts[k++] * norm
    });
  }
  return out;
}

/* ── the bundled sea floor → this grid ──────────────────────────────────────────────────────────
   data/bathymetry.png is 0.25° equirectangular over the whole globe: R*256+G is the mean depth of the
   cell's SEA samples in metres and B is the cell's sea fraction × 255 (scripts/build-bathymetry.mjs).
   The model grid is the same 0.25° in longitude, so a cell maps to a cell and there is no resampling
   at all at dec 1; at coarser grids the block is averaged.

   ⚠ WET/DRY IS THE SEA FRACTION, NOT THE MEAN ELEVATION. A cell that is 60 % ocean is ocean, at the
   depth of its ocean part. Deciding it from an average that includes a 2,000 m mountain would make
   every steep coast a wall two cells out to sea, and Green's law would then shoal the wave on a shelf
   that is not there. */
/* ══ (#R205) …AND A MEASURED FLOOR AROUND THE SOURCE, WHERE THE WAVE IS MADE ══════════════════════
   「津波シミュレータのシミュレーションの精度をもっと高く。特に震源付近は高解像度シミュレーションに。」

   #R204 refined the GRID near the source (9.3 km) and wrote down, correctly, that it had not refined
   the FLOOR: every cell in that band still read the same bundled 0.25° image, so nine model cells
   shared one depth and the coastline stayed a 27.8 km staircase. A finer grid over a coarser floor
   buys numerics, not accuracy — and accuracy is what was asked for.

   `fine` is an optional local patch in the SAME cell-average form the bundled image is in, built on
   the main thread from the terrarium DEM around the epicentre (js/tsunami.js fineFloor):

       d[]  depth in metres, 0 = at or above sea level      k[] 1 = the DEM answered for this sample

   A model cell that is COVERED by the patch takes its wet/dry fraction and its mean depth from it;
   everything else is byte-for-byte the old path. The two are the same quantity measured at different
   scales, so no cell can disagree with itself, and a patch that failed to load is simply absent.
   ⚠ `k` is separate rather than folded into the depth: a sample the DEM did not answer for and a
   sample that is exactly at sea level are different facts, and averaging the first as "0 m of water"
   would drown a coastline in the direction of land. */
function seaFloor(bathy, nx, ny, lat0, lat1, fine) {
  const bw = bathy.w, bh = bathy.h, px = bathy.rgb;
  const h = new Float32Array(nx * ny), land = new Uint8Array(nx * ny), depth = new Int16Array(nx * ny);
  let seaCells = 0, fineCells = 0;
  const stepX = bw / nx, stepY = (bh * (lat1 - lat0) / 180) / ny;
  const row0 = bh * (90 - lat1) / 180;
  const dLat = (lat1 - lat0) / ny, dLng = 360 / nx;
  const F = (fine && fine.w > 1 && fine.h > 1) ? fine : null;
  const fdLat = F ? (F.lat1 - F.lat0) / F.h : 0, fdLng = F ? (F.lng1 - F.lng0) / F.w : 0;
  for (let j = 0; j < ny; j++) {
    /* model row j is at latitude lat0 + (j+0.5)·dφ, counting NORTH; the image counts SOUTH from 90 */
    const jy0 = row0 + (ny - 1 - j) * stepY, jy1 = jy0 + stepY;
    const b0 = Math.max(0, Math.floor(jy0)), b1 = Math.min(bh - 1, Math.max(b0, Math.ceil(jy1) - 1));
    const cLat0 = lat0 + j * dLat, cLat1 = cLat0 + dLat;
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let frac = null, d = null;
      /* ── the patch first, when this cell is inside it ─────────────────────────────────────── */
      if (F && cLat0 >= F.lat0 && cLat1 <= F.lat1) {
        const cLng0 = -180 + i * dLng;
        /* the patch may straddle ±180 — its lng0/lng1 are NOT normalised, so try the cell at each
           of the three equivalent longitudes rather than normalising the patch */
        let base = null;
        for (const sh of [0, 360, -360]) { const a = cLng0 + sh; if (a >= F.lng0 && a + dLng <= F.lng1) { base = a; break; } }
        if (base != null) {
          const fx0 = Math.max(0, Math.floor((base - F.lng0) / fdLng));
          const fx1 = Math.min(F.w - 1, Math.max(fx0, Math.ceil((base + dLng - F.lng0) / fdLng) - 1));
          /* the patch counts rows SOUTH from lat1, like the bundled image */
          const fy0 = Math.max(0, Math.floor((F.lat1 - cLat1) / fdLat));
          const fy1 = Math.min(F.h - 1, Math.max(fy0, Math.ceil((F.lat1 - cLat0) / fdLat) - 1));
          let sd = 0, nSea = 0, nKnown = 0;
          for (let fy = fy0; fy <= fy1; fy++) {
            const fb = fy * F.w;
            for (let fx = fx0; fx <= fx1; fx++) {
              if (!F.k[fb + fx]) continue;
              nKnown++; const dv = F.d[fb + fx];
              if (dv > 0) { sd += dv; nSea++; }
            }
          }
          /* one sample is not a cell average — require enough of the cell to have answered */
          if (nKnown >= 4) { frac = nSea / nKnown; d = nSea ? sd / nSea : 0; fineCells++; }
        }
      }
      /* ── otherwise the bundled 0.25° floor, exactly as before ─────────────────────────────── */
      if (frac == null) {
        const ix0 = i * stepX, ix1 = ix0 + stepX;
        const a0 = Math.max(0, Math.floor(ix0)), a1 = Math.min(bw - 1, Math.max(a0, Math.ceil(ix1) - 1));
        let sd = 0, sf = 0, n = 0;
        for (let by = b0; by <= b1; by++) {
          const base = by * bw;
          for (let bx = a0; bx <= a1; bx++) {
            const o = (base + bx) * 3;
            sd += px[o] * 256 + px[o + 1];
            sf += px[o + 2];
            n++;
          }
        }
        frac = n ? (sf / n) / 255 : 0;
        d = n ? sd / n : 0;
      }
      /* wet if the majority of the cell is sea AND that sea is deeper than the grid can carry as
         water — under 10 m over a 28 km cell is a beach, and it is a wall for this model */
      if (frac >= 0.5 && d > 10) { h[k] = d; depth[k] = Math.min(32000, Math.round(d)); seaCells++; }
      else { h[k] = 0; land[k] = 1; depth[k] = 0; }
    }
  }
  return { h, land, depth, seaCells, fineCells };
}

/* Companding — see the header. A is the run's peak |η|. */
function compand(src, q, n, A) {
  const inv = 1 / (A > 0 ? A : 1);
  for (let k = 0; k < n; k++) {
    const v = src[k];
    if (v === 0) { q[k] = 0; continue; }
    const a = Math.abs(v) * inv;
    const s = Math.round(127 * Math.cbrt(a > 1 ? 1 : a));
    q[k] = v < 0 ? -s : s;
  }
}

function post(o, t) { self.postMessage(o, t || []); }

function run(m) {
  const id = m.id;
  const nx = m.nx | 0, ny = m.ny | 0, n2 = nx * ny;
  const lat0 = m.lat0, lat1 = m.lat1;
  const dLam = (2 * Math.PI) / nx;                      /* the whole circle — this is the global grid */
  const dPhi = ((lat1 - lat0) / ny) * DEG;
  const hours = Math.max(0.25, Math.min(30, m.hours));
  const wantFrames = Math.max(24, Math.min(240, m.frames | 0));
  const dec = Math.max(1, m.dec | 0);
  /* ══ ⚠⚠⚠ (#R242) THE PICTURE MAY BE A WINDOW ON THE GRID, NOT THE WHOLE CIRCLE ═══════════════════
   *  「津波シミュレータの波伝播のアニメーションの解像度を爆発的に上げろ。全部が無理なら半径1000km
   *    以内のみ。」
   *  The near-source scope already solves a 4,320-wide band — the whole circle, because longitude is
   *  wraps and #R204 would not change the solver. The PICTURE never needed the whole
   *  circle: a 1,000 km radius is ±9° of longitude, i.e. a fortieth of it, and the other 39/40 of
   *  every frame is exactly zero for the entire run. Sending the window instead of the circle is what
   *  buys `dec:1` — the animation stops being decimated at all and the frame is SMALLER than the
   *  decimated whole-circle one it replaces (measured below in js/tsunami.js).
   *  ⚠ `wi0` is a GRID column and `wnx` a count of them; both are multiples of `dec` so the block
   *  average below stays aligned, and the read wraps at nx. */
  const wnxReq = Math.max(0, m.winNx | 0);
  const winNx = (wnxReq && wnxReq < nx) ? Math.floor(wnxReq / dec) * dec : nx;
  const winI0 = winNx === nx ? 0 : ((((m.winI0 | 0) % nx) + nx) % nx);
  const filtLat = (m.filtLat != null ? m.filtLat : 60);

  /* ── 1. the sea floor ─────────────────────────────────────────────────────────────────────── */
  const sf = seaFloor(m.bathy, nx, ny, lat0, lat1, m.fine);
  const h = sf.h, land = sf.land, depth = sf.depth;
  if (!(sf.seaCells > 0)) return { err: 'nosea' };
  post({ id, type: 'progress', pct: 8, phase: 'floor' });
  if (abort === id) return null;

  /* ── 2. the fault ─────────────────────────────────────────────────────────────────────────── */
  const lng0 = m.src.lng, srcLat = m.src.lat, mw = m.src.mw, depthKm = m.src.depthKm;
  const latOf = (j) => lat0 + (j + 0.5) * (lat1 - lat0) / ny;
  const lngOf = (i) => -180 + (i + 0.5) * 360 / nx;
  const colOf = (lo) => { let c = Math.floor((((lo + 180) % 360) + 360) % 360 / 360 * nx); return c >= nx ? nx - 1 : c; };
  const rowOf = (la) => { let r = Math.floor((la - lat0) / (lat1 - lat0) * ny); return r < 0 ? 0 : (r >= ny ? ny - 1 : r); };

  /* the strike, read off the sea floor: a subduction interface runs along the isobaths, so ∇h gives
     the down-dip direction and the strike is 90° from it. Sampled from the model's own depth field. */
  const depthAtLL = (lo, la) => {
    const r = rowOf(la), c = colOf(lo);
    return h[r * nx + c];
  };
  const eps = 0.6;
  const dHx = depthAtLL(lng0 + eps, srcLat) - depthAtLL(lng0 - eps, srcLat);
  const dHy = depthAtLL(lng0, srcLat + eps) - depthAtLL(lng0, srcLat - eps);
  let dipAz = Math.atan2(dHx, dHy) / DEG; if (!isFinite(dipAz)) dipAz = 90;
  const dipDeg = 15;                                    /* a subduction interface at tsunami depths */
  /* (#R212) the drawn rupture wins over the regression when there is one — see rupturePlane */
  const drawn = rupturePlane(m.src.rupture, srcLat);
  const strike = drawn ? drawn.strike : ((dipAz + 90 + 360) % 360);
  const g = drawn ? { L: drawn.L, W: drawn.W, slip: drawn.slip, M0: drawn.M0 } : faultGeom(mw);
  const topDepth = Math.max(2000, depthKm * 1000 - g.W * Math.sin(dipDeg * DEG) / 2);
  const botDepth = topDepth + g.W * Math.sin(dipDeg * DEG);
  const subs = subFaults(g, dipDeg, topDepth);
  /* (#R223) the model build is half of a run's wall clock and this loop is almost all of it — so it
     is TIMED and the count is reported, rather than being the part nobody can see. */
  const _tSrc = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let _okCalls = 0;
  const sA = Math.sin(strike * DEG), cA = Math.cos(strike * DEG);
  const mPerLat = 111320, mPerLngAt = (la) => 111320 * Math.cos(la * DEG);

  /* ══ WHERE THE SOURCE STOPS, AND WHY IT MAY NOT STOP ABRUPTLY (#R193) ══════════════════════════
     ⚠ MEASURED THE HARD WAY. The sub-fault sum is 24 Okada evaluations a cell, so a window of SIX
     rupture lengths — 4,326 km each way for an M9 — is 13.5 million evaluations. Narrowing it to
     2.2 L looked obviously right and was obviously wrong: at 1,586 km an M9's static field is still
     ~1 cm, so cutting there left a STEP in the initial sea surface, and a step is broadband. It
     radiated a sharp front at √(gh) that tripped the 1 cm arrival threshold long before the real
     long-period wave built up — the modelled first arrival at Guam fell from 3 h 11 to 1 h 51
     against an observed 3–4 h. So the window stays wide, and the cost is dealt with where it lives:
     past about two rupture lengths the static field of a finite source depends only on its moment,
     so one equivalent rectangle carrying the same M0 gives the same answer as twenty-four tapered
     strips for a twenty-fourth of the arithmetic, blended across a band so nothing is discontinuous. */
  const eta = new Float32Array(n2);
  const nearM = 2.2 * g.L, farM = Math.max(6 * g.L, 2500e3);
  const blend0 = nearM, blend1 = 2.6 * g.L;
  const cosW = (g.W * Math.cos(dipDeg * DEG)) / 2;
  const one = (xs, ys) => { _okCalls++; return okadaUz(xs + g.L / 2, ys + cosW, botDepth, g.L, g.W, dipDeg, g.slip); };
  const many = (xs, ys) => {
    let u = 0;
    for (let s2 = 0; s2 < subs.length; s2++) {
      const f = subs[s2];
      const v = okadaUz(xs + g.L / 2 - f.x0, ys + cosW - f.y0, f.d0, f.L, f.W, dipDeg, f.slip);
      _okCalls++;
      if (isFinite(v)) u += v;
    }
    return u;
  };
  /* (#R202) how far the cell average is taken, and how finely — see the block in the loop below.
     ⚠ SUB_N = 3 IS WHERE IT CONVERGES, and that was measured rather than assumed. The worker was run
     in Node over a flat 4,000 m ocean (the harness tests/r197-checks.test.mjs already uses) at three
     magnitudes, varying only the quadrature; the number is the model's own reported amplitude, m:

         Mw 7.5   1×1 0.9117   3×3 0.7516   5×5 0.7430   7×7 0.7406
         Mw 8.2   1×1 2.8780   3×3 2.7142   5×5 2.6954   7×7 2.6904
         Mw 9.0   1×1 6.6819   3×3 6.9523   5×5 6.9763   7×7 6.9797

     Two things follow. The centre sample is off by 23% at Mw 7.5 and by 4% at Mw 9 — bigger where
     the rupture is small against a 28 km cell, which is the signature of quantisation — and it errs
     in BOTH directions, so it was never a bias that could be corrected with a factor. And 3×3 lands
     within 1.5% of 7×7 everywhere, at a ninth of the arithmetic.
     ⚠ (#R204) 3 → 5, AND THE TABLE ABOVE IS THE ARGUMENT. 「津波シミュレータのシミュレーションの精度を
     もっと高く。特に震源付近は高解像度シミュレーションに。」 — the residual of 3×3 against the converged
     7×7 is +1.5 % / +0.9 % / −0.4 % at the three magnitudes; 5×5 leaves +0.3 % / +0.2 % / −0.05 %,
     i.e. it removes about four fifths of what is left, for 2.8× of an arithmetic that only runs
     inside a disc of 1.5 rupture lengths. It is the cheapest accuracy in this file and it is spent
     exactly where the instruction points — at the source. */
  const SUB_N = 5, subR = 1.5 * g.L;
  const cellLatM = ((lat1 - lat0) / ny) * mPerLat;
  let upMax = 0, downMax = 0;
  /* only the rows and columns the window can reach — on a global grid the source is a small patch */
  const jS = rowOf(srcLat - farM / mPerLat - 1), jN = rowOf(srcLat + farM / mPerLat + 1);
  const srcCol = colOf(lng0), srcRow = rowOf(srcLat);
  for (let j = jS; j <= jN; j++) {
    const la = latOf(j), mpl = Math.max(1, mPerLngAt(la));
    const dI = Math.min(nx >> 1, Math.ceil(farM / (mpl * 360 / nx)) + 1);
    for (let c = -dI; c <= dI; c++) {
      let i = (srcCol + c) % nx; if (i < 0) i += nx;
      const lo = lngOf(i);
      const dx = (((lo - lng0 + 540) % 360) - 180) * mpl, dy = (la - srcLat) * mPerLat;
      const r = Math.max(Math.abs(dx), Math.abs(dy));
      if (r > farM) continue;
      const xs = dx * sA + dy * cA;                     /* into the fault frame: x along strike */
      const ys = -dx * cA + dy * sA;
      let uz;
      if (r <= subR) {
        /* ══ (#R202) THE SOURCE IS INTEGRATED OVER THE CELL, NOT SAMPLED AT ITS CENTRE ══════════
           「津波シミュレータのシミュレーションの精度をもっと高く。特に震源付近は高解像度に。」
           A cell here is ~28 km across and the static field of a rupture varies over kilometres, so
           taking ONE Okada value at the cell centre is point sampling a function that is not close
           to constant across the cell — the peak lands wherever the grid happens to fall, and the
           DISPLACED VOLUME (which is what sets the far-field amplitude) inherits that aliasing.
           Inside SUB_R the cell is averaged over SUB_N × SUB_N points instead, which is a proper
           midpoint quadrature of the same field: the initial sea surface stops depending on where
           the grid lines happen to sit relative to the fault.
           ⚠ THE COST IS BOUNDED BY WHERE IT IS SPENT. The sub-sampled disc is 1.5 rupture lengths;
           beyond it one sample per cell is already resolving the field, and past 2.2 L the model has
           been using a single equivalent rectangle since #R193 for exactly that reason. */
        let acc = 0;
        for (let a = 0; a < SUB_N; a++) {
          const fy = ((a + 0.5) / SUB_N - 0.5) * cellLatM;
          for (let b = 0; b < SUB_N; b++) {
            const fx = ((b + 0.5) / SUB_N - 0.5) * (360 / nx) * mpl;
            const v = many((dx + fx) * sA + (dy + fy) * cA, -(dx + fx) * cA + (dy + fy) * sA);
            if (isFinite(v)) acc += v;
          }
        }
        uz = acc / (SUB_N * SUB_N);
      }
      else if (r <= blend0) uz = many(xs, ys);
      else if (r >= blend1) uz = one(xs, ys);
      else { const w = (r - blend0) / (blend1 - blend0); uz = (1 - w) * many(xs, ys) + w * one(xs, ys); }
      if (!isFinite(uz)) continue;
      eta[j * nx + i] = uz;
      if (uz > upMax) upMax = uz; if (uz < downMax) downMax = uz;
    }
    if ((j & 63) === 0) { if (abort === id) return null; }
  }
  const _srcMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _tSrc);
  post({ id, type: 'progress', pct: 18, phase: 'source', ms: _srcMs, calls: _okCalls });
  if (abort === id) return null;

  /* ── 3. geometry, the time step, and the polar filter ─────────────────────────────────────── */
  const cosC = new Float64Array(ny), cosN = new Float64Array(ny), invDx = new Float64Array(ny);
  const cor = new Float64Array(ny), filtW = new Int32Array(ny);
  const cosFilt = Math.cos(filtLat * DEG);
  let dxMin = 1e18;
  for (let j = 0; j < ny; j++) {
    const la = latOf(j);
    cosC[j] = Math.cos(la * DEG);
    cosN[j] = Math.cos((la + 0.5 * (lat1 - lat0) / ny) * DEG);
    const dxM = RE * cosC[j] * dLam;
    invDx[j] = 1 / dxM;
    cor[j] = 2 * OMEGA * Math.sin(la * DEG);
    /* the filter's width in cells, odd, and 1 (= no filter) equatorward of filtLat */
    let w = 1;
    if (Math.abs(la) > filtLat) { w = Math.round(cosFilt / Math.max(1e-6, cosC[j])); if (w < 3) w = 3; if (!(w & 1)) w++; if (w > nx) w = nx | 1; }
    filtW[j] = w;
    /* the EFFECTIVE width for the CFL: a filtered row behaves like a row of the filter's own width */
    const dxEff = dxM * (w > 1 ? w : 1);
    if (dxEff < dxMin) dxMin = dxEff;
  }
  const dyM = RE * dPhi, invDy = 1 / dyM;

  let hMax = 0, lim = 1e18;
  for (let j = 0; j < ny; j++) {
    const dxRow = RE * cosC[j] * dLam * (filtW[j] > 1 ? filtW[j] : 1);
    const dl = Math.min(dxRow, dyM), row = j * nx;
    for (let i = 0; i < nx; i++) {
      const d = h[row + i]; if (d <= 0) continue;
      if (d > hMax) hMax = d;
      const c = Math.sqrt(G * d);
      const v = dl / c; if (v < lim) lim = v;
    }
  }
  const cMax = Math.sqrt(G * Math.max(1, hMax));
  const dt = Math.max(0.5, 0.45 * lim);
  const total = hours * 3600, steps = Math.ceil(total / dt);
  const everyN = Math.max(1, Math.floor(steps / wantFrames));
  const nFrames = Math.floor((steps - 1) / everyN) + 1;
  const cellKm = Math.round(RE * Math.cos(srcLat * DEG) * dLam / 1000);

  const fx = Math.floor(winNx / dec), fy = Math.floor(ny / dec);
  const wcol = (i, a) => { const c = winI0 + i * dec + a; return c < nx ? c : c - nx; };   /* (#R242) the read wraps at nx */
  const landD = new Uint8Array(fx * fy);
  for (let j = 0; j < fy; j++) for (let i = 0; i < fx; i++) {
    let wet = 0;
    for (let b = 0; b < dec; b++) for (let a = 0; a < dec; a++) if (!land[(j * dec + b) * nx + wcol(i, a)]) wet++;
    landD[j * fx + i] = wet ? 0 : 1;
  }
  /* the window's own longitude extent, so the client can place the image without re-deriving it */
  const winLng0 = -180 + (winI0 * 360) / nx, winLng1 = winLng0 + (winNx * 360) / nx;

  post({
    id, type: 'model', nx, ny, fx, fy, dec, lat0, lat1, dt, steps, total, nFrames, cellKm,
    winI0, winNx, lng0: winLng0, lng1: winLng1,   /* (#R242) the picture's longitude window */
    strike, dipDeg, faultL: g.L, faultW: g.W, slip: g.slip, M0: g.M0, drawnFault: !!drawn,
    eta0Up: upMax, eta0Down: downMax, seaCells: sf.seaCells, fineCells: sf.fineCells, hMax: Math.round(hMax), cMax: Math.round(cMax),
    sourceMs: _srcMs, okadaCalls: _okCalls,
    land, depth, landD
  }, [land.buffer, depth.buffer, landD.buffer]);
  if (abort === id) return null;

  /* ── 4. the run ───────────────────────────────────────────────────────────────────────────── */
  const M = new Float32Array(n2);              /* flux across the EAST face of (i,j) */
  const Nf = new Float32Array(n2);             /* flux across the NORTH face of (i,j) */
  const emax = new Float32Array(n2);
  const emin = new Float32Array(n2);
  const tarr = new Float32Array(n2); tarr.fill(-1);

  /* ⚠ THE ONLY SPONGE LEFT IS AT THE TWO LATITUDE WALLS. #R193 damped all four edges of its box; on a
     global grid the two meridional "edges" are the same meridian and are stitched instead. The 80°
     walls are still walls, and a wave that reaches them would reflect, so the outermost rows absorb.
     It is a per-ROW factor now, not a per-cell field: 640 numbers rather than 921,600. */
  const SP = Math.max(4, Math.round(ny * 0.03));
  const spongeRow = new Float64Array(ny);
  for (let j = 0; j < ny; j++) {
    const d = Math.min(j, ny - 1 - j);
    spongeRow[j] = (d < SP) ? (1 - 0.05 * Math.pow((SP - d) / SP, 2)) : 1;
  }
  /* which latitude circles contain any water at all — Antarctica's interior and the high Arctic are
     whole rows of nothing, and skipping them costs one byte a row to know */
  const rowSea = new Uint8Array(ny);
  for (let j = 0; j < ny; j++) { const row = j * nx; for (let i = 0; i < nx; i++) if (h[row + i] > 0) { rowSea[j] = 1; break; } }

  let peak = 0;
  for (let k = 0; k < n2; k++) { const a = Math.abs(eta[k]); if (a > peak) peak = a; }
  const A = Math.max(0.05, peak);

  const gdt = G * dt, fricC = G * MANNING * MANNING * dt;
  let t = 0, sent = 0, framesOut = 0;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const batch = [];

  /* ══ THE LIGHT CONE ═══════════════════════════════════════════════════════════════════════════
     Nothing outside a radius of cMax·t from the source can be anything but exactly zero — the
     equations have a finite propagation speed and cMax is the fastest cell in the domain, so this is
     an identity, not an approximation. Integrating only inside that circle turns an O(steps·nx·ny)
     run into one whose cost grows with the area the wave has reached.
     ⚠ ON A PERIODIC GRID the column window is an ARC, not an interval: it is kept as a start column
     and a length, and it stops growing at nx (the whole circle). */
  let bj0 = ny, bj1 = -1, bc0 = 0, bc1 = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (eta[j * nx + i] !== 0) {
    if (j < bj0) bj0 = j; if (j > bj1) bj1 = j;
    let d = i - srcCol; if (d > nx / 2) d -= nx; if (d < -nx / 2) d += nx;
    if (d < bc0) bc0 = d; if (d > bc1) bc1 = d;
  }
  if (bj1 < bj0) { bj0 = srcRow; bj1 = srcRow; }
  const cs = new Int32Array(ny), cl = new Int32Array(ny);
  let J0 = 0, J1 = ny - 1;
  function windowAt(tNow) {
    const reach = cMax * tNow + 4 * Math.min(dxMin, dyM);
    const dJ = Math.ceil(reach / dyM);
    J0 = Math.max(0, bj0 - dJ); J1 = Math.min(ny - 1, bj1 + dJ);
    for (let j = J0; j <= J1; j++) {
      /* ⚠ A FILTERED ROW IS ALWAYS TAKEN WHOLE. The polar filter spreads a value along the latitude
         circle faster than the physical wave crosses the same cells (two box passes of half-width
         (w−1)/2 against 0.45·w cells a step), so a light cone drawn from the wave speed alone would
         no longer be a superset of the support and the filter would push energy out through its own
         edge. Those rows are a quarter of the grid at most and they only enter the window once the
         wave has actually reached 60°, which is late in any run. */
      if (filtW[j] > 1) { cs[j] = 0; cl[j] = nx; continue; }
      const dI = Math.ceil(reach / Math.max(1, RE * cosC[j] * dLam));
      const len = (bc1 - bc0 + 1) + 2 * dI;
      if (len >= nx) { cs[j] = 0; cl[j] = nx; }
      else { let s0 = (srcCol + bc0 - dI) % nx; if (s0 < 0) s0 += nx; cs[j] = s0; cl[j] = len; }
    }
  }
  windowAt(0);

  /* the polar filter, applied in place along one latitude circle — a circular running mean, twice */
  const fbuf = new Float32Array(nx);
  function zonalFilter(arr, row, w) {
    const half = (w - 1) >> 1, inv = 1 / w;
    for (let pass = 0; pass < 2; pass++) {
      let sum = 0;
      for (let k = -half; k <= half; k++) { let i = k % nx; if (i < 0) i += nx; sum += arr[row + i]; }
      for (let i = 0; i < nx; i++) {
        fbuf[i] = sum * inv;
        let out = i - half; if (out < 0) out += nx;
        let inn = i + half + 1; if (inn >= nx) inn -= nx;
        sum += arr[row + inn] - arr[row + out];
      }
      for (let i = 0; i < nx; i++) arr[row + i] = fbuf[i];
    }
  }

  let diverged = false;
  /* (#R223) has this latitude circle ever carried a non-zero η? — see the polar-filter note below */
  const wet = new Uint8Array(ny);
  const fbufD = new Float32Array(fx * fy);      /* hoisted: 140 frames is 140 allocations otherwise */
  for (let s = 0; s < steps; s++) {
    if (abort === id) return null;
    if ((s & 15) === 0) windowAt(t);

    /* ── momentum: the zonal flux, on the EAST face ────────────────────────────────────────── */
    for (let j = J0; j <= J1; j++) {
      if (!rowSea[j]) continue;                 /* a latitude circle with no water in it at all */
      const row = j * nx, idx = invDx[j], f = cor[j], sp = spongeRow[j];
      const south = (j > 0) ? -nx : 0;          /* hoisted: the row below, or this one at j = 0 */
      const len = cl[j], st = cs[j];
      let i = st === 0 && len === nx ? 0 : ((st - 1 + nx) % nx);
      const count = (len === nx) ? nx : len + 1;
      for (let c = 0; c < count; c++) {
        const ip = (i + 1 === nx) ? 0 : i + 1;
        const a = row + i, b = row + ip;
        const ha = h[a], hb = h[b];
        if (ha <= 0 || hb <= 0) { M[a] = 0; i = ip; continue; }
        const D = 0.5 * (ha + eta[a] + hb + eta[b]);
        if (D <= 1) { M[a] = 0; i = ip; continue; }
        /* the meridional flux at this face, for Coriolis and for the friction speed */
        const nn = 0.25 * (Nf[a] + Nf[b] + Nf[a + south] + Nf[b + south]);
        let fl = M[a] - gdt * D * (eta[b] - eta[a]) * idx + dt * f * nn;
        /* ⚠ Manning friction ONLY WHERE IT IS NOT ZERO TO THE FLOAT. τ ∝ D^(−7/3): against the shelf
           value at 50 m, a 4 km ocean floor damps 10^(−5.4) as hard. Measured, evaluating it
           everywhere cost 1.4 billion Math.pow calls and 80 % of this file's run time to change
           nothing in deep water. Below 500 m it decides the coastal amplitude and is computed
           exactly — semi-implicit in |M|, so it can never reverse the flux. D^(7/3) as D²·cbrt(D):
           cbrt is an intrinsic, pow with a fractional exponent is not. */
        if (D < 500) {
          const spd = Math.sqrt(fl * fl + nn * nn);
          if (spd > 0) fl /= (1 + fricC * spd / (D * D * Math.cbrt(D)));
        }
        M[a] = fl * sp;
        i = ip;
      }
    }
    /* ── momentum: the meridional flux, on the NORTH face ──────────────────────────────────── */
    for (let j = J0; j <= Math.min(J1, ny - 2); j++) {
      if (!rowSea[j] && !rowSea[j + 1]) continue;
      const row = j * nx, up = row + nx, f = cor[j], sp = spongeRow[j];
      const len = cl[j], st = cs[j];
      let i = st === 0 && len === nx ? 0 : ((st - 1 + nx) % nx);
      const count = (len === nx) ? nx : len + 2;
      for (let c = 0; c < count; c++) {
        const a = row + i, b = up + i;
        const ha = h[a], hb = h[b];
        if (ha <= 0 || hb <= 0) { Nf[a] = 0; i = (i + 1 === nx) ? 0 : i + 1; continue; }
        const D = 0.5 * (ha + eta[a] + hb + eta[b]);
        if (D <= 1) { Nf[a] = 0; i = (i + 1 === nx) ? 0 : i + 1; continue; }
        const im = (i === 0) ? nx - 1 : i - 1;
        const mm = 0.25 * (M[a] + M[b] + M[row + im] + M[up + im]);
        let fl = Nf[a] - gdt * D * (eta[b] - eta[a]) * invDy - dt * f * mm;
        if (D < 500) {
          const spd = Math.sqrt(fl * fl + mm * mm);
          if (spd > 0) fl /= (1 + fricC * spd / (D * D * Math.cbrt(D)));
        }
        Nf[a] = fl * sp;
        i = (i + 1 === nx) ? 0 : i + 1;
      }
    }
    if (J1 >= ny - 1) { const r = (ny - 1) * nx; for (let i = 0; i < nx; i++) Nf[r + i] = 0; }

    /* ── continuity ──────────────────────────────────────────────────────────────────────────── */
    for (let j = J0; j <= J1; j++) {
      if (!rowSea[j]) continue;
      const row = j * nx, idx = invDx[j], cj = cosC[j], cn = cosN[j], cs2 = (j > 0 ? cosN[j - 1] : cn);
      const inv = 1 / (dyM * cj), sp = spongeRow[j];
      const south = (j > 0) ? -nx : 0, csS = (j > 0) ? cs2 : 0;
      const len = cl[j], st = cs[j];
      let i = st;
      for (let c = 0; c < len; c++) {
        const k = row + i;
        if (h[k] <= 0) { eta[k] = 0; i = (i + 1 === nx) ? 0 : i + 1; continue; }
        const im = (i === 0) ? nx - 1 : i - 1;
        const mwf = M[row + im], me = M[k];
        const ns = Nf[k + south] * csS, nnf = Nf[k] * cn;
        /* ⚠ (#R197) NO BRANCH AROUND THE ANALYSIS UPDATE, AND THE REASON IS A MEASUREMENT ABOUT THE
           MEASUREMENT. Guarding these three reads on "did anything happen in this cell" looks like an
           obvious saving, and the first timing said it cost 39 % (14.6 s → 20.3 s). Repeating the
           same build three times gave 13.2 / 16.3 / 14.9 s — the ±20 % is this machine, not the code,
           and the "regression" was noise. Neither form is measurably faster than the other, so the
           simpler one stays. Written down because the next person to look at this loop will have the
           same idea, and the answer is "it does not matter — do not spend the day on it". */
        const v = (eta[k] - dt * ((me - mwf) * idx + (nnf - ns) * inv)) * sp;
        eta[k] = v;
        if (v > emax[k]) emax[k] = v;
        else if (v < emin[k]) emin[k] = v;
        if ((v >= ARRIVE || v <= -ARRIVE) && tarr[k] < 0) tarr[k] = t;
        i = (i + 1 === nx) ? 0 : i + 1;
      }
      /* ══ ⚠ (#R223) THE POLAR FILTER ONLY RUNS ON ROWS THE WAVE HAS ACTUALLY REACHED ═══════════
         「地震と津波シミュレータの計算速度を爆速にして。ただし品質は一切落とさないように。」
         Poleward of 60° every row in the window is filtered twice, for two fields, over the WHOLE
         latitude circle — 4·nx reads and writes per field per row per step. At nx = 1440 that is
         ~11,500 operations a row a step, and about a quarter of the grid's rows are up there: for
         an 872-step run it is of the same order as the entire rest of the solver.
         A row whose η has been exactly zero for the whole run has an exactly zero M as well (the
         only thing that drives M is ∂η/∂λ within the row, and M starts at zero), and a running
         mean of zeros is zeros. So the filter is skipped until the row is first excited, and from
         then on it runs every step exactly as before — the flag is STICKY, never cleared, so a row
         that has gone quiet again is still filtered and nothing about the answer can drift.
         ⚠ This is an identity, not a tolerance: the skipped work provably writes the values that
         are already there. */
      const w = filtW[j];
      if (w > 1) { if (!wet[j]) { for (let c = 0, i2 = st; c < len; c++) { if (eta[row + i2] !== 0) { wet[j] = 1; break; } i2 = (i2 + 1 === nx) ? 0 : i2 + 1; } }
        if (wet[j]) { zonalFilter(eta, row, w); zonalFilter(M, row, w); } }
    }
    t += dt;

    if (s % everyN === 0 || s === steps - 1) {
      /* the picture: an AREA AVERAGE over dec×dec, then companded */
      if (dec === 1 && winNx === nx) fbufD.set(eta);
      else if (dec === 1) {
        /* (#R242) a full-resolution WINDOW: one row copy per row, wrapping at the antimeridian */
        for (let j = 0; j < fy; j++) {
          const row = j * nx, out = j * fx;
          if (winI0 + fx <= nx) fbufD.set(eta.subarray(row + winI0, row + winI0 + fx), out);
          else { const head = nx - winI0;
            fbufD.set(eta.subarray(row + winI0, row + nx), out);
            fbufD.set(eta.subarray(row, row + (fx - head)), out + head); }
        }
      }
      else {
        /* ⚠ (#R223) ONLY THE ROWS INSIDE THE LIGHT CONE. Outside it η is exactly zero — that is what
           the cone means — so those output rows are zero, and `fbufD` is zeroed once at the start
           and only ever written by rows that are inside a cone that only grows. Same picture, and
           for an early frame it is a few per cent of the reads. */
        const invD = 1 / (dec * dec);
        const fj0 = Math.max(0, (J0 / dec) | 0), fj1 = Math.min(fy - 1, ((J1 + dec) / dec) | 0);
        for (let j = fj0; j <= fj1; j++) {
          for (let i = 0; i < fx; i++) {
            let acc = 0;
            for (let b = 0; b < dec; b++) { const r = (j * dec + b) * nx; for (let a = 0; a < dec; a++) acc += eta[r + wcol(i, a)]; }
            fbufD[j * fx + i] = acc * invD;
          }
        }
      }
      let mx = 0;
      for (let k = 0; k < fbufD.length; k++) { const v = fbufD[k] < 0 ? -fbufD[k] : fbufD[k]; if (v > mx) mx = v; }
      if (!(mx < SANE)) { diverged = true; break; }
      const q = new Int8Array(fx * fy);
      compand(fbufD, q, fx * fy, A);
      batch.push({ t, q });
      framesOut++;
      /* stream: the animation must be watchable before the run ends, so the FIRST frame leaves on its
         own and the rest go in sixes */
      if (framesOut === 1 || batch.length >= 6 || s === steps - 1) {
        const out = batch.splice(0, batch.length);
        post({ id, type: 'frames', frames: out, nFrames, fx, fy, done: (s === steps - 1) }, out.map(f => f.q.buffer));
        post({ id, type: 'progress', pct: 18 + Math.round(82 * (s + 1) / steps), frames: framesOut, nFrames });
        sent = framesOut;
      }
    }
  }
  if (diverged) return { err: 'diverged' };

  return {
    nx, ny, dt, steps, total, nFrames: framesOut, amp: A,
    emax, emin, tarr,
    cMax: Math.round(cMax), hMax: Math.round(hMax),
    ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
  };
}

/* ⚠ GUARDED so Node can load this file and call run()/okadaUz() directly — tests/r197-checks.test.mjs
   verifies Okada against the published case and integrates a small analytic basin without a browser. */
const onMsg = (ev) => {
  const m = ev.data || {};
  if (m.type === 'abort') { abort = m.id; return; }
  if (m.type !== 'run') return;
  try {
    if (m.bathy && m.bathy.rgb && !(m.bathy.rgb instanceof Uint8Array)) m.bathy.rgb = new Uint8Array(m.bathy.rgb);
    /* (#R205) the local high-resolution floor arrives as transferred buffers — see seaFloor */
    if (m.fine && m.fine.d && !(m.fine.d instanceof Uint16Array)) m.fine.d = new Uint16Array(m.fine.d);
    if (m.fine && m.fine.k && !(m.fine.k instanceof Uint8Array)) m.fine.k = new Uint8Array(m.fine.k);
    const out = run(m);
    if (!out) { post({ id: m.id, type: 'aborted' }); return; }
    if (out.err) { post({ id: m.id, type: 'error', err: out.err }); return; }
    post({
      id: m.id, type: 'done', nx: out.nx, ny: out.ny, dt: out.dt, steps: out.steps, total: out.total,
      nFrames: out.nFrames, amp: out.amp, cMax: out.cMax, hMax: out.hMax, ms: out.ms,
      emax: out.emax, emin: out.emin, tarr: out.tarr
    }, [out.emax.buffer, out.emin.buffer, out.tarr.buffer]);
  } catch (e) {
    post({ id: m.id, type: 'error', err: String((e && e.message) || e) });
  }
};
if (typeof self !== 'undefined' && self && typeof self.postMessage === 'function') self.onmessage = onMsg;
