/* ============================================================================
 *  IntMap · THE SITE TERM IS A FUNCTION OF FREQUENCY — window.IntMapSiteAmp  (#R263)
 * ----------------------------------------------------------------------------
 *  「全球の堆積層厚・岩質・地殻構造を取り込み、Vs30だけでは表現できない盆地効果・地盤増幅を
 *    世界共通で扱う。」
 *
 *  ══ WHAT Vs30 ALONE CANNOT SAY ══════════════════════════════════════════════════════════════════
 *  js/seismic.js has amplified every site by √(ρ_src·β_src / ρ·Vs30) since #R189. That number is not
 *  wrong — it is the quarter-wavelength amplification (Joyner, Warrick & Fumal 1981; Boore 2003)
 *  EVALUATED AT ONE DEPTH, thirty metres. A quarter wavelength is thirty metres at
 *
 *        f = Vs30 / (4 × 30 m)   →   1.5 Hz on soft soil, 6.3 Hz on rock
 *
 *  so the model was applying the 1.5-Hz answer to the whole band, from the 10 Hz that carries PGA to
 *  the 0.3 Hz that carries the shaking of a tall building. At high frequency that is exactly right
 *  and stays right (see below). At LOW frequency it is wrong in both directions at once:
 *    · on a soft site that is only a thin skin over rock it OVER-amplifies, because a 0.5 Hz wave
 *      samples 700 m of section and most of that section is not soft;
 *    · in a deep sedimentary basin it UNDER-amplifies, because the section stays soft for kilometres
 *      and the long periods keep being amplified all the way down. That is the basin effect, and a
 *      model whose site term is one scalar cannot produce it AT ALL, however fine the Vs30 raster is.
 *
 *  ══ THE GENERALISATION, NOT A REPLACEMENT ═══════════════════════════════════════════════════════
 *  The quarter-wavelength method says: at frequency f, find the depth z(f) whose one-way travel time
 *  is a quarter period, take the travel-time-average velocity and the depth-average density over it,
 *  and the amplification is the square root of the impedance ratio against the source region.
 *
 *        ∫₀^z(f) dz'/β(z')  =  1/(4f)        β̄(f) = 4·f·z(f)
 *        A(f) = √( ρ_src·β_src / (ρ̄(f)·β̄(f)) )
 *
 *  ⚠ AT HIGH FREQUENCY THIS RETURNS TODAY'S NUMBER EXACTLY, and that is a property of the
 *  construction rather than a calibration. The top thirty metres of the profile below is a single
 *  layer at exactly Vs30 — which is what Vs30 MEANS, the travel-time average over 30 m — so for every
 *  f whose quarter wavelength is 30 m or less, β̄ = Vs30 and ρ̄ = ρ(Vs30), and A(f) is
 *  √(ρ_src·β_src/(ρ·Vs30)) to the last bit. tests/r263-checks ② asserts that against the old
 *  expression. Everything this file adds happens BELOW that frequency.
 *
 *  ══ WHERE THE PROFILE BELOW 30 m COMES FROM ═════════════════════════════════════════════════════
 *  CRUST1.0 (Laske et al. 2013, shipped by scripts/build-crust1.mjs): three sediment layers and three
 *  crystalline layers, each with its own Vs, density and thickness, everywhere on Earth. Between the
 *  30 m that Vs30 owns and the mid-depth of CRUST1.0's first layer there is no measurement, so the
 *  profile is a POWER LAW through the two of them — log Vs linear in log z. That introduces no
 *  constant: the exponent is determined by the two endpoints, and a power law is the form a
 *  compacting sediment column actually takes.
 *  ⚠ NO VELOCITY INVERSIONS ARE INVENTED. Vs is clamped so it never falls below Vs30 going down.
 *  Real inversions exist; a proxy has no way to know where, and a proxy that guesses one is worse
 *  than a proxy that stays monotone.
 *  ⚠ 1° IS 111 km AND THE BASIN HALF INHERITS THAT. This file does not pretend otherwise; the
 *  shallow half is read at 0.05° (data/vs30.png) or off the DEM at ~1 km, and the deep half is as
 *  coarse as CRUST1.0 is. The manifest says so and so does the panel.
 *
 *  ⚠ PURE ARITHMETIC — no DOM, no renderer, no fetch, no app state. That is what lets
 *  tests/r263-checks verify it in Node against published profiles instead of against a screenshot,
 *  the same contract js/fault-geometry.js states.
 * ==========================================================================*/
window.IntMapSiteAmp = (function () {
  'use strict';

  /* the reference the amplification is measured AGAINST — the source region of js/seismic.js.
     Passed in by the caller so there is one definition of it, not two (#R190's drift rule). */
  const DEF_RHO_SRC = 2700, DEF_BETA_SRC = 3500;

  /* ── ρ(Vs30), byte-for-byte js/seismic.js's `ampOf` ──────────────────────────────────────────
     Kept HERE as the single definition so the two cannot drift; js/seismic.js calls this one. */
  function rhoOfVs30(vs30) {
    const v = Math.max(150, Math.min(1500, +vs30 || 760));
    return 1800 + (v - 180) / (1500 - 180) * (2600 - 1800);
  }
  /* …and the scalar amplification the model used before this file existed. This is the f → ∞ limit
     of ampSpectrum() below, and tests/r263-checks ② is the assertion that it still is. */
  function ampScalar(vs30, rhoSrc, betaSrc) {
    const v = Math.max(150, Math.min(1500, +vs30 || 760));
    return Math.sqrt(((rhoSrc || DEF_RHO_SRC) * (betaSrc || DEF_BETA_SRC)) / (rhoOfVs30(v) * v));
  }

  const TOP_M = 30;                       /* the depth Vs30 is defined over */
  const MAX_M = 60000;                    /* the profile is built this deep — 0.015 Hz on rock */

  /* ── the profile ──────────────────────────────────────────────────────────────────────────────
     `crust` is one CRUST1.0 cell as js/earth-structure.js hands it over:
        { surfaceKm, bottomKm:[9], vsKms:[9], rhoGcc:[9] }   layers 0..8, layer 8 = uppermost mantle
     Layers with zero thickness or zero Vs (water, ice, absent sediments) are skipped: they are not
     part of the SOLID column a shear wave travels up.
     Returns a sampled profile — `zM` the bottom of each sample, `vs` m/s, `rho` kg/m³, and the
     cumulative one-way travel time `tt` (s) at each sample bottom, which is what the quarter-
     wavelength search actually indexes. */
  function buildProfile(vs30, crust, opts) {
    const o = opts || {};
    const v30 = Math.max(120, Math.min(2500, +vs30 || 760));
    const r30 = rhoOfVs30(v30);

    /* the control points below 30 m: the mid-depth of each solid CRUST1.0 layer that exists */
    const ctlZ = [], ctlV = [], ctlR = [];
    /* ⚠ THE PAIRING IS [bnds[i], bnds[i+1]] WITH vs[i], AND THE OFF-BY-ONE IS NOT COSMETIC.
       CRUST1.0 ships NINE boundaries for EIGHT layers plus the mantle: bnds[0] is the top of the
       water and bnds[i+1] is the bottom of layer i, so layer i occupies [bnds[i], bnds[i+1]] and
       carries vs[i]. Pairing an interval with the NEXT layer's velocity shifts the whole column down
       one layer, which handed the sediments the crystalline crust's velocity — measured: a site over
       8 km of basin fill came out amplifying LESS at 0.2 Hz than the same site on bare rock, which is
       backwards, and is what caught it. */
    if (crust && crust.bottomKm && crust.vsKms) {
      const surf = +crust.surfaceKm || 0;
      for (let i = 0; i < 8; i++) {
        const top = crust.bottomKm[i], bot = crust.bottomKm[i + 1];
        if (!isFinite(top) || !isFinite(bot)) continue;
        const v = crust.vsKms[i] * 1000;
        const topD = (surf - top) * 1000, botD = (surf - bot) * 1000;    /* depth below the SURFACE, m */
        if (!(v > 0) || !(botD > topD)) continue;                        /* absent layer, or water/ice */
        const mid = 0.5 * (Math.max(0, topD) + botD);
        if (!(mid > TOP_M)) continue;                                    /* already inside the Vs30 layer */
        ctlZ.push(mid); ctlV.push(v);
        ctlR.push((crust.rhoGcc && crust.rhoGcc[i] > 0 ? crust.rhoGcc[i] : 2.6) * 1000);
        if (mid > MAX_M) break;
      }
      /* …and the uppermost mantle below the Moho, which only the very longest periods ever reach */
      const moho = crust.bottomKm[8];
      if (isFinite(moho) && crust.vsKms[8] > 0) {
        const z = (surf - moho) * 1000 + 20000;
        if (z > TOP_M && (!ctlZ.length || z > ctlZ[ctlZ.length - 1])) {
          ctlZ.push(z); ctlV.push(crust.vsKms[8] * 1000);
          ctlR.push((crust.rhoGcc && crust.rhoGcc[8] > 0 ? crust.rhoGcc[8] : 3.3) * 1000);
        }
      }
    }
    /* with no crustal model at all the profile is the half-space Vs30 — i.e. exactly what the model
       did before, at every frequency. A missing dataset must not invent a basin. */
    if (!ctlZ.length) { ctlZ.push(MAX_M); ctlV.push(Math.max(v30, 3500)); ctlR.push(2700); }

    const lz = [Math.log(TOP_M)], lv = [Math.log(v30)], rr = [r30];
    for (let i = 0; i < ctlZ.length; i++) {
      if (ctlZ[i] <= Math.exp(lz[lz.length - 1])) continue;
      lz.push(Math.log(ctlZ[i])); lv.push(Math.log(Math.max(ctlV[i], v30))); rr.push(ctlR[i]);
    }
    const vAt = (z) => {
      if (z <= TOP_M) return v30;
      const t = Math.log(z);
      if (t >= lz[lz.length - 1]) return Math.exp(lv[lv.length - 1]);
      let k = 1; while (k < lz.length - 1 && lz[k] < t) k++;
      const f = (t - lz[k - 1]) / (lz[k] - lz[k - 1] || 1);
      return Math.exp(lv[k - 1] + f * (lv[k] - lv[k - 1]));
    };
    const rAt = (z) => {
      if (z <= TOP_M) return r30;
      const t = Math.log(z);
      if (t >= lz[lz.length - 1]) return rr[rr.length - 1];
      let k = 1; while (k < lz.length - 1 && lz[k] < t) k++;
      const f = (t - lz[k - 1]) / (lz[k] - lz[k - 1] || 1);
      return rr[k - 1] + f * (rr[k] - rr[k - 1]);
    };

    /* sampled log-uniformly below 30 m, which puts the samples where the quarter wavelengths are:
       every doubling of frequency halves the depth, so a log grid is a uniform grid in frequency */
    const N = +o.samples > 0 ? +o.samples : 160;
    const zM = new Float64Array(N + 1), vs = new Float64Array(N + 1),
      rho = new Float64Array(N + 1), tt = new Float64Array(N + 1);
    zM[0] = TOP_M; vs[0] = v30; rho[0] = r30; tt[0] = TOP_M / v30;
    const l0 = Math.log(TOP_M), l1 = Math.log(MAX_M);
    for (let i = 1; i <= N; i++) {
      const z = Math.exp(l0 + (l1 - l0) * i / N), zp = zM[i - 1];
      const zc = 0.5 * (z + zp);
      zM[i] = z; vs[i] = vAt(zc); rho[i] = rAt(zc);
      tt[i] = tt[i - 1] + (z - zp) / vs[i];
    }
    return { vs30: v30, rho30: r30, zM, vs, rho, tt, n: N };
  }

  /* ── the quarter-wavelength answer at one frequency ───────────────────────────────────────────*/
  function quarterWavelength(p, f) {
    const need = 1 / (4 * Math.max(1e-4, f));
    if (need <= p.tt[0]) {                                     /* inside the Vs30 layer: β̄ = Vs30 */
      return { zM: need * p.vs30, vsBar: p.vs30, rhoBar: p.rho30 };
    }
    let i = 1; while (i < p.n && p.tt[i] < need) i++;
    if (p.tt[i] < need) return { zM: p.zM[i], vsBar: p.zM[i] / p.tt[i], rhoBar: p.rho[i] };
    const over = (need - p.tt[i - 1]) * p.vs[i];               /* how far into sample i the time runs */
    const z = p.zM[i - 1] + over;
    /* ρ̄ is the DEPTH average over the same column — Boore (2003) §4.3; β̄ is the TRAVEL-TIME
       average, which is what z/need is. The two averages are different averages on purpose. */
    let m = p.rho30 * Math.min(z, p.zM[0]);
    for (let k = 1; k <= i; k++) {
      const a = p.zM[k - 1], b = Math.min(z, p.zM[k]);
      if (b > a) m += p.rho[k] * (b - a);
      if (p.zM[k] >= z) break;
    }
    return { zM: z, vsBar: z / need, rhoBar: m / Math.max(1e-6, z) };
  }

  /* A(f) over a whole frequency grid. One pass: the grid is walked from HIGH frequency to LOW so
     the quarter-wavelength depth only ever moves downward, which makes the search a single sweep
     rather than 400 independent binary searches. */
  function ampSpectrum(p, freqs, opts) {
    const o = opts || {};
    const rhoSrc = +o.rhoSrc > 0 ? +o.rhoSrc : DEF_RHO_SRC;
    const betaSrc = +o.betaSrc > 0 ? +o.betaSrc : DEF_BETA_SRC;
    const n = freqs.length, out = new Float64Array(n);
    const num = rhoSrc * betaSrc;
    for (let k = 0; k < n; k++) {
      const q = quarterWavelength(p, freqs[k]);
      out[k] = Math.sqrt(num / Math.max(1e-6, q.rhoBar * q.vsBar));
    }
    return out;
  }

  /* ── the two depths every basin term in the literature is written against ─────────────────────
     Z1.0 and Z2.5 are the depths to Vs = 1.0 and 2.5 km/s. Nothing in this model consumes them —
     the amplification above is the physics — but they are what a reader who knows GMPEs will ask
     for, and the panel prints them so the profile can be checked against a published one. */
  function depthToVs(p, target) {
    if (p.vs30 >= target) return 0;
    for (let i = 1; i <= p.n; i++) {
      if (p.vs[i] >= target) {
        const v0 = i > 1 ? p.vs[i - 1] : p.vs30, z0 = p.zM[i - 1], z1 = p.zM[i];
        if (!(p.vs[i] > v0)) return z0;
        return z0 + (z1 - z0) * (target - v0) / (p.vs[i] - v0);
      }
    }
    return p.zM[p.n];
  }

  return { buildProfile, quarterWavelength, ampSpectrum, ampScalar, rhoOfVs30, depthToVs,
    z1000: (p) => depthToVs(p, 1000), z2500: (p) => depthToVs(p, 2500),
    TOP_M, MAX_M, DEF_RHO_SRC, DEF_BETA_SRC };
})();
