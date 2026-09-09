/* ============================================================================
 *  IntMap · THE RADIOACTIVE-PLUME MODEL, AS PHYSICS — RAD  (#R568)
 * ----------------------------------------------------------------------------
 *  js/sims.js owns the panel, the map layers and the animation. THIS file owns the model: the
 *  wind field, the Lagrangian solve, the deposition grid and the dose arithmetic. It touches no
 *  DOM and no window global, because the very same code runs in src/radiation-worker.js — the
 *  js/photo-geo-search.js arrangement (see the note at the top of that file), for the same reason:
 *  one copy of the judgement, two places it can execute.
 *
 *  ⚠ WHAT THIS ROUND CHANGED, AND WHY EACH ONE WAS NOT A TUNING KNOB ──────────────────────────
 *  A reader reported that the old model was a good *picture* and a bad *number*. Every item below
 *  was a place where the code produced a figure it had no way to have known.
 *
 *  ① THE CLOCK. `startHour` was 0 unless a date was typed, and Open-Meteo's hourly forecast starts
 *     at 00:00 UTC of the current day. A run started at 22:05 JST therefore blew the plume with the
 *     wind of 09:00 JST — thirteen hours stale — and said nothing. The start is now an INSTANT
 *     (`startISO`, defaulting to now) resolved against the returned `time[]`, and the fetch asks for
 *     enough days to cover `start + window` instead of a fixed three.
 *
 *  ② THE HEIGHT. Particles were released at 200–800 m and then advected with `wind_speed_10m`.
 *     Ten-metre wind is not the wind at 500 m: measured on the probe that opened this round
 *     (Fukushima, 2026-09-09T00Z) 10 m = 2.0 m/s and 180 m = 4.9 m/s — a factor of 2.5, and the
 *     direction differs too. The field now carries 10/80/180 m (forecast) or 10/100 m (ERA5) and
 *     `windAt` interpolates in log z between them, so a particle is blown by the air it is in.
 *
 *  ③ THE RESOLUTION. One 6×6 grid over ±2.6° is ~1.04° ≈ 100 km spacing. Deposition gradients near
 *     the source are far sharper than that. There are two nested grids now — a fine inner one over
 *     the near field and a coarse outer one sized to where the plume can actually reach — which is
 *     what a real model does with a nest, and it buys resolution where it changes the answer
 *     without asking the upstream API for hundreds of points.
 *
 *  ④ THE EDGE. `sample()` clamped the coordinate to the grid, so a particle that left the box was
 *     pushed by the boundary's wind for ever while the report still printed a reach of up to 900 km.
 *     Particles that leave the outer grid are now RETIRED and counted; the run reports the fraction
 *     that left, and the reach is measured from the particles instead of `speed × hours`.
 *
 *  ⑤ THE TURBULENCE. `stab = 0.6 + (T − 5)/25` is air temperature standing in for stability, which
 *     it cannot do: a 20 °C night and a 20 °C convective afternoon are not the same atmosphere. The
 *     diffusivities are now built from the friction velocity and the boundary-layer depth
 *     (Hanna 1982 scaling), and the boundary layer is a LID the particles reflect off.
 *
 *  ⑥ THE ENDING. The old run finished by putting HALF of everything still airborne onto the ground,
 *     on a line whose own comment called it «settle the remainder» — so the final deposition map
 *     depended on when the operator stopped watching, and a 48 h and an 80 h run of the same release
 *     disagreed about the past. It is gone. What is airborne at the end is reported as airborne.
 *
 *  ⑦ THE NOISE. 2,600 particles carrying 8.5e16 Bq means one particle is 1.8e13 Bq, and a peak cell
 *     is then a coin toss. Two things fix it: particles now deposit CONTINUOUSLY (each one loses a
 *     fraction of its mass per step, as in FLEXPART, instead of dying whole), so every particle
 *     contributes to many cells; and each cell counts how many distinct particles fed it, which is
 *     what the peak's error bar is computed from and what suppresses a peak nobody sampled.
 *
 *  ⑧ THE SOURCE TERM. `Chernobyl` was 8.5e16 Bq whichever isotope was chosen — but 8.5e16 Bq is
 *     specifically the Cs-137 release. The presets are a source × isotope TABLE now.
 *
 *  ⑨ THE ZONES. 37/185/555/1480 kBq/m² are the post-Chernobyl Cs-137 zoning thresholds and mean
 *     nothing applied to I-131 or Sr-90. They are offered for the isotopes they exist for; the
 *     others get density bands with no policy words on them.
 *
 *  ⑩ THE DOSE. An annual dose was `peak µSv/h × 8766 × 0.5`, i.e. "this rate holds all year" — for
 *     I-131, whose half-life is eight days. The dose is a time integral over decay and weathering.
 * ==========================================================================*/

export const RAD = (function () {
  'use strict';

  const HOUR = 3600, DEG_M = 111320, OMEGA = 7.2921159e-5;

  /* Wet scavenging Λ = A·I^B, rain rate I in mm/h, Λ in 1/s — the standard aerosol form. */
  const WET_A = 1.0e-4, WET_B = 0.79;

  /* Free-tropospheric vertical diffusivity above the mixing height — small, because the turbulence
     that mixes the boundary layer is exactly what stops at its top. */
  const FREE_KZ = 1;

  /* ── ISOTOPES ───────────────────────────────────────────────────────────────────────────────
     `hl` half-life in HOURS. `vd` dry-deposition velocity (m/s) for the physical form the nuclide
     travels as. `weather` the environmental decay of the dose rate from a deposit that is NOT
     radioactive decay (migration into soil, run-off), as {f, hl} with half-lives in HOURS.

     ⚠⚠⚠ `gsh` — GROUND SHINE, AND WHICH CONVENTION IT IS. Sv/h per Bq/m², adult, standing on an
     infinite contaminated plane. Derived from Federal Guidance Report 15 (EPA 402-R-25-001, July
     2025) adult effective-dose coefficients for the soil-surface scenario, with the PARENT's
     short-lived progeny added in (Cs-137 + 0.947 × Ba-137m; Sr-90 + Y-90 at secular equilibrium),
     because FGR tabulates parents only — and with the SKIN term removed.
     ⚠ The skin removal is the whole reason this table can be read at all. FGR-15 is ICRP 103, whose
     effective dose INCLUDES skin at w_T = 0.01 — and for the pure beta emitters that one term is
     92–97 % of the published coefficient, so FGR-15's raw «effective dose» makes Sr-90 + Y-90 come
     out at 30 % of Cs-137's ground shine. That is a real number about skin, and it is not what a
     survey meter reads, not what an evacuation criterion is written on, and not what this model's
     µSv/h means. Penetrating-only, Sr-90 + Y-90 is ~1/120 of Cs-137 + Ba-137m, which is the
     relationship the literature and the intuition both have.
     ⚠ DO NOT «UPDATE» THESE FROM EPA 402-R-19-002. That edition is withdrawn: EPA states its dose
     tables contained errors, and its adult Cs-137 soil-surface value is 26× the current one.
     Expires when: EPA revises FGR-15 again, or the model starts reporting a skin-inclusive quantity
     (in which case the numbers change AND so must the wording that presents them).
     Sourcing in full: docs/RADIATION-MODEL.md §2. */
  const ISOTOPES = {
    cs137: {
      n: 'Cs-137', hl: 30.08 * 365.25 * 24,
      gsh: 1.27e-12, vd: 1.0e-3, form: 'aerosol',
      /* Cs-137 deposition density is what the post-Chernobyl zoning statutes are written on. */
      zoning: 'cs137',
      weather: [{ f: 0.45, hl: 1.5 * 365.25 * 24 }, { f: 0.55, hl: 50 * 365.25 * 24 }],
    },
    cs134: {
      n: 'Cs-134', hl: 2.0652 * 365.25 * 24,
      gsh: 3.50e-12, vd: 1.0e-3, form: 'aerosol', zoning: null,
      weather: [{ f: 0.45, hl: 1.5 * 365.25 * 24 }, { f: 0.55, hl: 50 * 365.25 * 24 }],
    },
    i131: {
      n: 'I-131', hl: 8.0252 * 24,
      /* Iodine travels as a mixture of particulate, elemental and organic forms; the deposition
         velocity is the mixture's, and it is why an iodine plume grounds faster than a caesium one. */
      gsh: 8.57e-13, vd: 5.0e-3, form: 'iodine', zoning: null,
      weather: [{ f: 1, hl: 30 * 24 }],
    },
    sr90: {
      n: 'Sr-90', hl: 28.79 * 365.25 * 24,
      /* ⚠ Sr-90 → Y-90 are pure beta emitters. Their PENETRATING ground shine is ~1/120 of
         Cs-137's, and it is not what makes Sr-90 dangerous — ingestion and bone-seeking are, which
         no external-dose figure describes. `externalMinor` is what makes the report say so instead
         of printing a µSv/h that would be read as the hazard. */
      gsh: 1.08e-14, vd: 1.0e-3, form: 'aerosol', zoning: 'sr90', externalMinor: true,
      weather: [{ f: 0.45, hl: 1.5 * 365.25 * 24 }, { f: 0.55, hl: 50 * 365.25 * 24 }],
    },
  };

  /* ── SOURCE TERMS, source × isotope ─────────────────────────────────────────────────────────
     Bq released to the ATMOSPHERE. `lo`/`hi` are the reported range where the assessment gives one;
     `bq` is the central estimate the preset uses. `rise` is the height (m) the release is mixed
     through before transport starts — the buoyant plume of a burning core is not a vent release,
     and it is the single biggest control on where the material lands, so it is a preset value the
     reader can override rather than a hidden constant.
     ⚠ (#R568) THIS TABLE IS THE FIX FOR ⑧: the old presets carried ONE activity per accident and
     handed it to whichever isotope was selected, so «Chernobyl + I-131» ran 85 PBq of iodine —
     twenty times too little — and «Chernobyl + Sr-90» ran eight times too much. */
  const SOURCE_TERMS = {
    chernobyl: {
      n: 'Chernobyl-scale', ll: [30.0997, 51.3892], rise: 1500, emitHours: 240,
      /* UNSCEAR 2008 Vol. II Annex D, Table 1 / Table A1 — total release TO THE ATMOSPHERE,
         decay-corrected to 26 April 1986. Ranges are the spread across the 1996 evaluations
         compared in UNSCEAR 2000 Annex J Table 2.
         ⚠ Cs-134 is 47 PBq, not the 54 PBq that is still widely quoted: UNSCEAR 2008 revised it,
         deriving it from a Cs-134/Cs-137 ratio of 0.55 at 26 April 1986. */
      iso: {
        i131: { bq: 1.76e18, lo: 1.2e18, hi: 1.8e18 },
        cs137: { bq: 8.5e16, lo: 7.4e16, hi: 8.6e16 },
        cs134: { bq: 4.7e16, lo: 4.4e16, hi: 5.0e16 },
        sr90: { bq: 1.0e16 },
      },
    },
    fukushima: {
      n: 'Fukushima-scale', ll: [141.0329, 37.4211], rise: 300, emitHours: 120,
      /* UNSCEAR 2020/21 Vol. II Annex B, Table 1 — the source term it now recommends is Terada et
         al. (2020): I-131 120 PBq, Cs-137 10 PBq, decay-corrected to shutdown (14:46 JST,
         11 March 2011). The ranges are UNSCEAR's own and were unchanged from the 2013 assessment.
         Cs-134 is DERIVED, not measured: Cs-137 × 1.03, the Units 1–3 inventory ratio at shutdown. */
      iso: {
        i131: { bq: 1.2e17, lo: 1.0e17, hi: 5.0e17 },
        cs137: { bq: 1.0e16, lo: 6.0e15, hi: 2.0e16 },
        cs134: { bq: 1.03e16 },
        /* ⚠⚠⚠ ATMOSPHERIC Sr-90 FROM FUKUSHIMA IS NOT QUANTIFIED BY UNSCEAR OR THE IAEA. The IAEA
           states that the lack of near-site measurements does not allow a consistent analysis of the
           source term. The one number that exists is NISA's 6 June 2011 accident-progression
           calculation, whose I/Cs figures were later superseded — so it is a different methodology
           from the two above and is marked `provisional`, which is what makes the report say so
           instead of presenting it as UNSCEAR's. Deleting the entry instead would have been worse:
           the preset would silently fall through to a default nobody chose. */
        sr90: { bq: 1.4e14, provisional: 'nisa2011' },
      },
    },
    /* The two generic scales keep one activity across isotopes because that is what they ARE — a
       stated quantity of one nuclide, not a reconstruction of a particular accident's inventory. */
    dirtybomb: { n: 'Dirty bomb (RDD)', rise: 100, emitHours: 0.25, flat: 3.7e13 },
    research: { n: 'Small/research', rise: 30, emitHours: 1, flat: 1e12 },
  };

  function sourceTerm(sourceKey, isoKey) {
    const s = SOURCE_TERMS[String(sourceKey || '').toLowerCase()];
    if (!s) return null;
    if (s.flat != null) return { bq: s.flat, rise: s.rise, emitHours: s.emitHours, exact: false };
    const e = s.iso && s.iso[String(isoKey || '').toLowerCase()];
    if (!e) return null;
    return { bq: e.bq, lo: e.lo, hi: e.hi, rise: s.rise, emitHours: s.emitHours, exact: true, provisional: e.provisional || null };
  }

  /* ── the grid plan ──────────────────────────────────────────────────────────────────────────
     Two nests. The inner one is fixed and fine (the near field, where the deposition gradient is);
     the outer one is sized to where the plume can plausibly get in the window, from the wind the
     inner grid already measured — which is why `outerPlan` takes a speed rather than guessing.
     ⚠ The point counts are a BUDGET, not a preference: Open-Meteo is billed per location × variable
     and IntMap's shared quota breaker (js/wx-source.js) is in front of it, so this is the resolution
     that fits, stated as such. */
  const INNER = { n: 7, half: 0.75 };          /* 7×7 over ±0.75° → 0.25° ≈ 25 km */
  /* ⚠ THE OUTER NEST GROWS IN BOTH DIRECTIONS AT ONCE, and that is the whole of the tension
     between ③ and ④. Widening the domain to follow an 80-hour plume while keeping 9×9 points makes
     the spacing 5° ≈ 450 km — FIVE TIMES COARSER THAN THE ±2.6° BOX THIS ROUND REPLACED, i.e. ④
     bought at ③'s expense. So the point count grows with the domain, and BOTH are capped, by
     something measured rather than chosen: against the live API (2026-09-09, 4 forecast days, the
     nine hourly variables this model asks for) 121 locations answered in 6.9 s and 169 in 6.9 s,
     but 225 took 21.5 s — so 13×13 is the last size a reader will wait through. At its widest that
     is ±15° with 2.5° spacing; a plume that outruns even that is reported as having LEFT the domain
     (escapedFrac) rather than being transported by an interpolation between two far-apart points. */
  const OUTER_MIN_N = 9, OUTER_MAX_N = 13, OUTER_MAX_HALF = 15, OUTER_MAX_SPACING = 2.5;

  function innerPlan(cx, cy) { return { n: INNER.n, half: INNER.half, cx, cy }; }

  function outerPlan(cx, cy, meanSpeedMs, hours) {
    /* Reach = mean transport speed × window, with 1.6× headroom for a wind that strengthens and for
       the cross-wind spread; floored so the outer nest always contains the inner one with room. */
    const reachKm = Math.max(120, (meanSpeedMs || 5) * hours * HOUR / 1000 * 1.6);
    const half = Math.min(OUTER_MAX_HALF, Math.max(INNER.half * 3, reachKm / 111));
    const n = Math.max(OUTER_MIN_N, Math.min(OUTER_MAX_N, Math.ceil(2 * half / OUTER_MAX_SPACING) + 1));
    return { n, half, cx, cy };
  }

  function planPoints(plan) {
    const lons = [], lats = [], LO = [], LA = [];
    for (let i = 0; i < plan.n; i++) lons.push(plan.cx - plan.half + (2 * plan.half) * i / (plan.n - 1));
    for (let j = 0; j < plan.n; j++) lats.push(plan.cy - plan.half + (2 * plan.half) * j / (plan.n - 1));
    for (let j = 0; j < plan.n; j++) for (let i = 0; i < plan.n; i++) { LO.push(+lons[i].toFixed(4)); LA.push(+lats[j].toFixed(4)); }
    return { lons, lats, LO, LA };
  }

  /* ── the field ──────────────────────────────────────────────────────────────────────────────
     One nest's worth of parsed Open-Meteo hourly response. Everything is a typed array so the whole
     field can be structured-cloned into the worker without a copy of the JSON going with it. */
  function buildNest(plan, json, levels, hours0, hoursN) {
    const arr = Array.isArray(json) ? json : [json];
    if (!arr.length || !arr[0].hourly) return null;
    const { lons, lats } = planPoints(plan);
    const times = arr[0].hourly.time || [];
    const H = Math.max(1, Math.min(times.length - hours0, hoursN));
    if (H <= 0) return null;
    const N = plan.n * plan.n, L = levels.length;
    const u = [], v = [];
    for (let l = 0; l < L; l++) { const uh = [], vh = []; for (let h = 0; h < H; h++) { uh.push(new Float32Array(N)); vh.push(new Float32Array(N)); } u.push(uh); v.push(vh); }
    const pr = [], tp = [], pbl = [];
    for (let h = 0; h < H; h++) { pr.push(new Float32Array(N)); tp.push(new Float32Array(N)); pbl.push(new Float32Array(N)); }
    let pblSeen = false;
    arr.forEach((loc, idx) => {
      const hh = loc.hourly || {};
      for (let l = 0; l < L; l++) {
        const sp = hh['wind_speed_' + levels[l] + 'm'] || [], dr = hh['wind_direction_' + levels[l] + 'm'] || [];
        for (let h = 0; h < H; h++) {
          const s = +sp[hours0 + h] || 0, d = (+dr[hours0 + h] || 0) * Math.PI / 180;
          /* meteorological direction is where the wind comes FROM */
          u[l][h][idx] = -s * Math.sin(d); v[l][h][idx] = -s * Math.cos(d);
        }
      }
      const pp = hh.precipitation || [], tt = hh.temperature_2m || [], bb = hh.boundary_layer_height || [];
      for (let h = 0; h < H; h++) {
        pr[h][idx] = +pp[hours0 + h] || 0;
        tp[h][idx] = (tt[hours0 + h] != null ? +tt[hours0 + h] : 15);
        const b = bb[hours0 + h];
        if (b != null && isFinite(+b)) { pbl[h][idx] = +b; pblSeen = true; } else pbl[h][idx] = 0;
      }
    });
    return {
      n: plan.n, half: plan.half, lon0: lons[0], lat0: lats[0],
      dLon: (2 * plan.half) / (plan.n - 1), dLat: (2 * plan.half) / (plan.n - 1),
      H, levels, u, v, pr, tp, pbl, pblSeen,
    };
  }

  /* Is (lng,lat) inside this nest, and where? Returns null when it is NOT — the caller must decide,
     which is the whole point: the old `sample()` clamped, and a clamp is a silent extrapolation. */
  function locate(g, lng, lat) {
    const fx = (lng - g.lon0) / g.dLon, fy = (lat - g.lat0) / g.dLat;
    if (!(fx >= 0 && fx <= g.n - 1 && fy >= 0 && fy <= g.n - 1)) return null;
    const i0 = Math.min(g.n - 2, Math.floor(fx)), j0 = Math.min(g.n - 2, Math.floor(fy));
    return { i0, j0, tx: fx - i0, ty: fy - j0, fx, fy };
  }

  function bil(g, A, p) {
    const id = (i, j) => j * g.n + i;
    const a = A[id(p.i0, p.j0)], b = A[id(p.i0 + 1, p.j0)], c = A[id(p.i0, p.j0 + 1)], d = A[id(p.i0 + 1, p.j0 + 1)];
    return a * (1 - p.tx) * (1 - p.ty) + b * p.tx * (1 - p.ty) + c * (1 - p.tx) * p.ty + d * p.tx * p.ty;
  }

  /* How much the inner nest is trusted at this point: 1 well inside it, falling to 0 over the
     outermost cell so the two nests do not meet at a step. */
  function nestBlend(g, p) {
    const t = Math.min(p.fx, g.n - 1 - p.fx, p.fy, g.n - 1 - p.fy);
    return Math.max(0, Math.min(1, t));
  }

  /* Wind at a HEIGHT. Interpolated in log z between the levels the field carries, held constant
     above the top level, and taken to the log-law below the lowest one. */
  function windAt(F, lng, lat, h, z) {
    const hi = Math.max(0, Math.min(F.inner.H - 1, Math.floor(h)));
    const lev = F.inner.levels, L = lev.length;
    const zc = Math.max(2, z);
    let l0 = 0;
    while (l0 < L - 2 && zc > lev[l0 + 1]) l0++;
    let w;
    if (zc <= lev[0]) w = 0;                                     /* below the lowest level */
    else { const a = Math.log(zc / lev[l0]), b = Math.log(lev[l0 + 1] / lev[l0]); w = Math.max(0, Math.min(1, a / b)); }

    const pick = (g, arrU, arrV) => {
      const p = locate(g, lng, lat); if (!p) return null;
      const hh = Math.max(0, Math.min(g.H - 1, hi));
      const u0 = bil(g, arrU[l0][hh], p), v0 = bil(g, arrV[l0][hh], p);
      if (zc <= lev[0]) {
        /* log profile down to z0 = 0.1 m: u(z)/u(10) = ln(z/z0)/ln(10/z0) */
        const f = Math.log(Math.max(0.2, zc) / 0.1) / Math.log(10 / 0.1);
        return { u: u0 * f, v: v0 * f, blend: nestBlend(g, p) };
      }
      const l1 = Math.min(L - 1, l0 + 1);
      const u1 = bil(g, arrU[l1][hh], p), v1 = bil(g, arrV[l1][hh], p);
      return { u: u0 + (u1 - u0) * w, v: v0 + (v1 - v0) * w, blend: nestBlend(g, p) };
    };

    const inn = pick(F.inner, F.inner.u, F.inner.v);
    const out = pick(F.outer, F.outer.u, F.outer.v);
    if (!inn && !out) return null;
    if (!inn) return { u: out.u, v: out.v };
    if (!out) return { u: inn.u, v: inn.v };
    const b = inn.blend;
    return { u: inn.u * b + out.u * (1 - b), v: inn.v * b + out.v * (1 - b) };
  }

  /* Precipitation, temperature and the boundary-layer depth at a point. `pblEstimated` says whether
     the depth came from the provider or from the neutral Rossby-number relation below — the ERA5
     archive does not carry boundary_layer_height (measured 2026-09-09: the key comes back with
     nulls), and a model that quietly invented it would be claiming to know the mixing depth of a
     day in 1986. */
  function envAt(F, lng, lat, h) {
    const hi = Math.max(0, Math.min(F.inner.H - 1, Math.floor(h)));
    const pick = (g) => {
      const p = locate(g, lng, lat); if (!p) return null;
      const hh = Math.max(0, Math.min(g.H - 1, hi));
      return { pr: bil(g, g.pr[hh], p), tp: bil(g, g.tp[hh], p), pbl: bil(g, g.pbl[hh], p), blend: nestBlend(g, p) };
    };
    const inn = pick(F.inner), out = pick(F.outer);
    let e;
    if (inn && out) { const b = inn.blend; e = { pr: inn.pr * b + out.pr * (1 - b), tp: inn.tp * b + out.tp * (1 - b), pbl: inn.pbl * b + out.pbl * (1 - b) }; }
    else e = inn || out;
    if (!e) return null;
    return e;
  }

  /* Friction velocity from the 10 m wind over a land roughness of 0.1 m (Stull §9.7):
     u* = k·U(10) / ln(10/z0), k = 0.4. */
  function frictionVelocity(u10) { return Math.max(0.03, 0.4 * Math.max(0.3, u10) / Math.log(10 / 0.1)); }

  /* Neutral boundary-layer depth when the provider has none: h = c · u_star / f, c ≈ 0.2 (Rossby–Montgomery).
     Clamped to a physically possible band and to a minimum latitude so f does not blow up at the
     equator, where the relation does not hold anyway. */
  function neutralPBL(ustar, lat) {
    const f = 2 * OMEGA * Math.sin(Math.max(10, Math.abs(lat)) * Math.PI / 180);
    return Math.max(150, Math.min(2500, 0.2 * ustar / f));
  }

  /* ⚠⚠⚠ (#R568 ①) THE START IS AN INSTANT, NOT ZERO. Open-Meteo's hourly forecast begins at
     00:00 UTC of the current day, and the old code left the start hour at 0 whenever no date was
     typed — so a run launched at 22:05 JST was blown by the wind of 09:00 JST, thirteen hours stale,
     and said nothing about it. The start defaults to NOW and is resolved against the hours the
     provider actually returned, which is also why it lives here: it is the one line of ① that a
     test can evaluate without a browser. Times come back as 'YYYY-MM-DDTHH:MM' with timezone=GMT. */
  function resolveStart(times, startISO) {
    if (!times || !times.length) return 0;
    const want = new Date(startISO).getTime();
    let best = 0, bd = Infinity;
    for (let i = 0; i < times.length; i++) {
      const t = new Date(String(times[i]) + 'Z').getTime();
      const d = Math.abs(t - want);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  const gauss = (function () {
    let spare = null;
    return function () {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let u, v, s;
      do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
      const m = Math.sqrt(-2 * Math.log(s) / s);
      spare = v * m; return u * m;
    };
  })();

  /* ── the Lagrangian solve ───────────────────────────────────────────────────────────────────
     Particles carry MASS, not life and death. Each step every particle loses a fraction of its mass
     to dry deposition (well-mixed box: v_d/h_mix), to wet scavenging when it is under rain, and to
     radioactive decay; what it loses to the ground goes into the deposition cell it is over. That is
     both the physically standard treatment and the reason the answer stops being a coin toss at the
     peak: a particle contributes to every cell it crosses instead of to exactly one.
     ⚠ THERE IS NO SETTLING OF THE REMAINDER AT THE END. What is airborne when the window closes is
     reported as airborne. */
  function simulate(F, src, opts, onProgress) {
    const iso = ISOTOPES[String(opts.isotope || 'cs137').toLowerCase()] || ISOTOPES.cs137;
    const hours = Math.max(1, opts.hours), emitHours = Math.max(0.05, Math.min(hours, opts.emitHours));
    const N = Math.max(200, opts.particles | 0);
    const dt = Math.max(120, Math.min(1800, opts.dtSec || 600));
    const steps = Math.max(6, Math.round(hours * HOUR / dt));
    const depRes = opts.depRes || 0.03;
    const base = opts.startHour || 0;
    const halfLifeH = opts.halfLifeHours > 0 ? opts.halfLifeHours : iso.hl;
    const decayPerStep = Math.pow(0.5, (dt / HOUR) / halfLifeH);
    /* Only a fraction of a reactor release is ground-depositable particulate; the noble gases are
       not and never land. It is a property of the material, so it lives with the isotope's form. */
    const depFrac = iso.form === 'iodine' ? 0.75 : 0.55;
    const q0 = opts.bq * depFrac / N;
    const riseTop = Math.max(20, opts.releaseHeight || 300), riseBot = riseTop * 0.25;

    const lng = new Float64Array(N), lat = new Float64Array(N), z = new Float32Array(N), mass = new Float64Array(N);
    const live = new Uint8Array(N), lastCell = new Int32Array(N);
    lastCell.fill(-1);

    const cell = new Map();          /* key → {bq, n} */
    /* gx is at most ±6,000 and gy at most ±3,000 at depRes = 0.03°, so a 100,000 stride keeps the
       pair injective (including negative gy) and the key inside Int32 — which is what lets the whole
       grid go back across the worker boundary as a transferable typed array. */
    const keyOf = (lo, la) => Math.round(lo / depRes) * 100000 + Math.round(la / depRes);

    let emitted = 0, escaped = 0, escapedMass = 0;
    const perStep = Math.max(1, Math.ceil(N / Math.max(1, emitHours * HOUR / dt)));
    let maxDistKm = 0;

    for (let st = 0; st <= steps; st++) {
      const simH = st * dt / HOUR;
      if (simH <= emitHours && emitted < N) {
        const want = Math.min(N - emitted, perStep);
        for (let k = 0; k < want; k++) {
          const i = emitted++;
          lng[i] = src.lng + (Math.random() - 0.5) * 0.01;
          lat[i] = src.lat + (Math.random() - 0.5) * 0.01;
          z[i] = riseBot + Math.random() * (riseTop - riseBot);
          mass[i] = 1; live[i] = 1;
        }
      }
      for (let i = 0; i < emitted; i++) {
        if (!live[i]) continue;
        const w = windAt(F, lng[i], lat[i], base + simH, z[i]);
        const e = w ? envAt(F, lng[i], lat[i], base + simH) : null;
        if (!w || !e) { live[i] = 0; escaped++; escapedMass += mass[i]; continue; }

        const u10 = Math.hypot(w.u, w.v) * 0.6 + 0.5;          /* a 10 m-equivalent for u* */
        const ust = frictionVelocity(u10);
        const pbl = (F.inner.pblSeen && e.pbl > 20) ? e.pbl : neutralPBL(ust, lat[i]);

        /* Hanna (1982) neutral scaling: σ_w = 1.3 u*, σ_u = σ_v = 2.0 u*, with Lagrangian
           timescales T_Lw = 0.5 h/σ_w and T_Lu = 0.15 h/σ_u. K = σ² T_L. */
        const sw = 1.3 * ust, su = 2.0 * ust;
        const tlw = Math.max(30, 0.5 * pbl / sw), tlu = Math.max(60, 0.15 * pbl / su);
        const Kz = sw * sw * tlw, Kh = su * su * tlu;

        const mLat = DEG_M, mLon = DEG_M * Math.cos(lat[i] * Math.PI / 180) || 1;
        const sh = Math.sqrt(2 * Kh * dt);
        lng[i] += (w.u * dt + gauss() * sh) / mLon;
        lat[i] += (w.v * dt + gauss() * sh) / mLat;

        /* ── vertical ───────────────────────────────────────────────────────────────────────
           ⚠⚠⚠ THE BOUNDARY LAYER IS A LID, AND A LID HAS TWO SIDES. An earlier draft of this
           clamped every particle into [0, h], which quietly made the release height stop mattering:
           a plume put 1,500 m up by a burning core was pulled into an 800 m boundary layer on its
           very first step, mixed to the same mean height as a 30 m vent release, and travelled the
           same distance — measured 592 vs 593 km, i.e. ② fixed in `windAt` and undone here.
           A release ABOVE the mixing height is decoupled from the ground: it diffuses feebly, it
           cannot dry-deposit (there is no turbulent path to the surface), and it re-enters only when
           the boundary layer grows up to it — which the next step's own `pbl` handles. Inside the
           layer, particles reflect off 0 and off h and mix as before. */
        const inMix = z[i] <= pbl;
        const vs = iso.form === 'iodine' ? 1e-4 : 3e-5;
        let nz = z[i] + gauss() * Math.sqrt(2 * (inMix ? Kz : FREE_KZ) * dt) - vs * dt;
        if (nz < 0) nz = -nz;
        if (inMix && nz > pbl) nz = 2 * pbl - nz;      /* reflect off the lid from below */
        z[i] = Math.max(1, nz);

        /* Decay first, then what is left is what can be deposited this step — so a step never
           deposits activity that had already decayed, nor decays activity already in the ground. */
        mass[i] *= decayPerStep;
        /* dry deposition as a well-mixed box: the loss rate of a species mixed through depth h with
           surface velocity v_d is v_d/h. No arbitrary «below 40 m counts as landed» rule survives —
           and above the lid there is no such loss at all. */
        let keep = inMix ? Math.exp(-iso.vd * dt / Math.max(50, pbl)) : 1;
        /* wet scavenging: Λ = A·I^B with the rain rate I in mm/h */
        if (e.pr > 0.02) keep *= Math.exp(-(WET_A * Math.pow(e.pr, WET_B)) * dt);
        const grounded = mass[i] * (1 - keep);
        mass[i] *= keep;

        if (grounded > 0) {
          const kk = keyOf(lng[i], lat[i]);
          let c = cell.get(kk);
          if (!c) { c = { bq: 0, n: 0 }; cell.set(kk, c); }
          c.bq += grounded * q0;
          if (lastCell[i] !== kk) { c.n++; lastCell[i] = kk; }
        }
        const dk = Math.hypot((lng[i] - src.lng) * mLon, (lat[i] - src.lat) * mLat) / 1000;
        if (dk > maxDistKm) maxDistKm = dk;
      }
      if (onProgress && (st % 12 === 0)) onProgress(st / steps);
    }

    let airborne = 0;
    for (let i = 0; i < emitted; i++) if (live[i]) airborne += mass[i];
    /* Out of the Map and into typed arrays, so the result can be TRANSFERRED out of the worker
       rather than serialised. `report` reads this shape, and reads exactly the same shape whether
       the solve ran in the worker or on the page. */
    const M = cell.size;
    const keys = new Int32Array(M), bq = new Float64Array(M), cnt = new Uint32Array(M);
    let w = 0;
    cell.forEach((c, kk) => { keys[w] = kk; bq[w] = c.bq; cnt[w] = c.n; w++; });
    return {
      keys, bq, cnt, depRes, q0, emitted, particles: N,
      /* ⚠ (#R568 ⑥) fractions of the DEPOSITABLE source term, reported rather than swept into the
         ground at the end of the run. They sum to ~1 with what decayed while airborne. */
      airborneFrac: emitted ? airborne / emitted : 0,
      escapedFrac: emitted ? escaped / emitted : 0,
      escapedMassFrac: emitted ? escapedMass / emitted : 0,
      maxDistKm, isotope: opts.isotope, dtSec: dt, steps,
      pblEstimated: !F.inner.pblSeen,
    };
  }

  /* ── zones ──────────────────────────────────────────────────────────────────────────────────
     The four Cs-137 thresholds are the post-Chernobyl zoning law's, in kBq/m². They exist for
     Cs-137 and are meaningless on an I-131 or Sr-90 deposit, so `zonesFor` hands those isotopes
     bands that are the SAME numbers of magnitude without the policy words — a legend that says how
     much is there and does not pretend to say what a government would do about it. */
  const CS_ZONES = {
    legal: true, jurisdiction: null,   /* the four are IDENTICAL in the Russian, Ukrainian and
                                          Belarusian statutes, so no jurisdiction has to be named */
    bands: [
      { min: 1480, c: '#8a0f0f', k: 'z-exclusion', ci: 40, legal: true },
      { min: 555, c: '#ff453a', k: 'z-evacuation', ci: 15, legal: true },
      { min: 185, c: '#ff9f0a', k: 'z-relocation', ci: 5, legal: true },
      { min: 37, c: '#ffd60a', k: 'z-monitoring', ci: 1, legal: true },
      { min: 2, c: '#b7f7b0', k: 'z-trace', legal: false },
    ],
  };
  /* Sr-90 zoning EXISTS but is not the same in the three countries (Russia legislates one threshold,
     Belarus four, Ukraine three); these are Ukraine's, and the legend says so rather than presenting
     one country's ladder as «the» law. */
  const SR_ZONES = {
    legal: true, jurisdiction: 'ua',
    bands: [
      { min: 111, c: '#8a0f0f', k: 'z-sr-mandatory', ci: 3.0, legal: true },
      { min: 5.55, c: '#ff9f0a', k: 'z-sr-voluntary', ci: 0.15, legal: true },
      { min: 0.74, c: '#ffd60a', k: 'z-sr-control', ci: 0.02, legal: true },
      { min: 0.05, c: '#b7f7b0', k: 'z-trace', legal: false },
    ],
  };
  /* ⚠ I-131 and Cs-134 have NO deposition-density zoning anywhere — the post-Chernobyl statutes
     enumerate Cs-137, Sr-90 and plutonium and nothing else, and the international emergency system
     triggers on dose RATE and on food concentration instead. So these isotopes get plain decades:
     bands that say how much is on the ground and claim nothing about what anyone would do. */
  const PLAIN_ZONES = {
    legal: false, jurisdiction: null,
    bands: [
      { min: 1e4, c: '#8a0f0f', k: 'd-1e4', legal: false }, { min: 1e3, c: '#ff453a', k: 'd-1e3', legal: false },
      { min: 1e2, c: '#ff9f0a', k: 'd-1e2', legal: false }, { min: 10, c: '#ffd60a', k: 'd-1e1', legal: false },
      { min: 1, c: '#b7f7b0', k: 'd-1e0', legal: false },
    ],
  };
  function zonesFor(isoKey) {
    const iso = ISOTOPES[String(isoKey || '').toLowerCase()];
    if (!iso || !iso.zoning) return PLAIN_ZONES;
    return iso.zoning === 'sr90' ? SR_ZONES : CS_ZONES;
  }

  /* ── dose ───────────────────────────────────────────────────────────────────────────────────
     Ḋ(0) is the ground-shine dose rate the deposit starts at. The dose accumulated over T is the
     integral of that rate against BOTH decays — the nuclide's own and the environment's — which is
     the whole of ⑩: the old code multiplied by 8,766 h and halved, i.e. asserted that an I-131
     deposit with an eight-day half-life keeps shining for a year. */
  function doseRate(densityBqM2, isoKey) {
    const iso = ISOTOPES[String(isoKey || '').toLowerCase()] || ISOTOPES.cs137;
    return { svH: densityBqM2 * iso.gsh, externalMeaningful: !iso.externalMinor };
  }

  /* ∫₀ᵀ exp(−λ_r t) · Σ f_i exp(−λ_i t) dt, in HOURS, times the occupancy/shielding factor. */
  function doseIntegralHours(isoKey, hoursT, occupancy) {
    const iso = ISOTOPES[String(isoKey || '').toLowerCase()] || ISOTOPES.cs137;
    const lr = Math.LN2 / iso.hl;
    let acc = 0;
    for (const w of iso.weather) {
      const l = lr + Math.LN2 / w.hl;
      acc += w.f * (1 - Math.exp(-l * hoursT)) / l;
    }
    return acc * (occupancy == null ? 0.5 : occupancy);
  }

  /* ── the report ─────────────────────────────────────────────────────────────────────────────
     Turns the cell map into polygons and the numbers the panel and Atlas print — including, for the
     first time, how well sampled the peak is. A cell that one particle passed through is not a
     measurement, and `peakRelSE` is what says so. */
  function report(res, isoKey) {
    const { keys, bq: cellBq, cnt, depRes } = res;
    const zs = zonesFor(isoKey), zones = zs.bands;
    const feats = [], zoneKm2 = zones.map(() => 0);
    let peak = 0, peakLL = null, peakN = 0, totBq = 0;
    for (let k = 0; k < keys.length; k++) {
      const kk = keys[k];
      const gx = Math.round(kk / 100000), gy = kk - gx * 100000;
      const lng = gx * depRes, lat = gy * depRes;
      const wM = depRes * DEG_M * Math.cos(lat * Math.PI / 180), hM = depRes * DEG_M;
      const areaM2 = Math.max(1, wM * hM);
      const kBq = (cellBq[k] / areaM2) / 1000;
      totBq += cellBq[k];
      if (kBq > peak) { peak = kBq; peakLL = [lng, lat]; peakN = cnt[k]; }
      let zi = -1;
      for (let i = 0; i < zones.length; i++) if (kBq >= zones[i].min) { zi = i; break; }
      if (zi < 0) continue;
      zoneKm2[zi] += areaM2 / 1e6;
      const h = depRes / 2;
      feats.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[lng - h, lat - h], [lng + h, lat - h], [lng + h, lat + h], [lng - h, lat + h], [lng - h, lat - h]]] },
        properties: { c: zones[zi].c, z: zi, d: kBq, n: cnt[k] },
      });
    }
    /* Monte-Carlo error on the peak cell: the estimator is a sum over the distinct particles that
       fed it, so its relative standard error is ~1/√n. Below MIN_PEAK_N the cell is a sample of a
       handful of trajectories and the model must not print a figure for it as though it were one. */
    const MIN_PEAK_N = 30;
    const peakRelSE = peakN > 0 ? 1 / Math.sqrt(peakN) : 1;
    const dr = doseRate(peak * 1000, isoKey);
    return {
      feats, zones, zoneKm2, peak, peakLL, peakN, peakRelSE,
      zonesAreLegal: zs.legal, zoneJurisdiction: zs.jurisdiction,
      peakWellSampled: peakN >= MIN_PEAK_N,
      minPeakN: MIN_PEAK_N,
      peakDoseUSvH: dr.svH * 1e6,
      externalMeaningful: dr.externalMeaningful,
      /* first-year external dose from the peak deposit, integrated rather than extrapolated */
      firstYearMSv: dr.svH * 1000 * doseIntegralHours(isoKey, 365.25 * 24),
      totBq,
    };
  }

  return {
    ISOTOPES, SOURCE_TERMS, sourceTerm, zonesFor,
    innerPlan, outerPlan, planPoints, buildNest,
    windAt, envAt, frictionVelocity, neutralPBL, resolveStart,
    simulate, report, doseRate, doseIntegralHours,
    CS_ZONES, SR_ZONES, PLAIN_ZONES,
  };
})();
