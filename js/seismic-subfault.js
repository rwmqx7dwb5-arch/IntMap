/* ============================================================================
 *  IntMap · A RUPTURE IS NOT ONE SLIPPING RECTANGLE — window.IntMapSubfault  (#R263)
 * ----------------------------------------------------------------------------
 *  「有限断層をsubfault化し、均一すべりではなく、総モーメントを保存した現実的なheterogeneous slip・
 *    rupture time・rise timeを持たせる。」
 *
 *  ══ WHAT THE MODEL SAID BEFORE ══════════════════════════════════════════════════════════════════
 *  #R224 turned a drawn outline into a fault PLANE (length, width, dip, depth extent) and #R232 gave
 *  it a rupture DIRECTION. But the plane radiated as a single object: one moment, one corner
 *  frequency, one distance — the closest point of the outline — and one Doppler factor for the whole
 *  thing. Two consequences, and both are visible in any real record:
 *    · a site 40 km along a 400 km megathrust was given the whole moment at 40 km, when in fact the
 *      far end of that rupture is 360 km away and contributes almost nothing at high frequency;
 *    · every part of the fault slipped the same amount, so there were no asperities — and asperities
 *      are what actually control the near-field peaks.
 *
 *  ══ WHAT THIS BUILDS ════════════════════════════════════════════════════════════════════════════
 *  The plane is cut into subfaults, each of which is a point source in its own right with its own
 *  position, its own moment, its own rupture time and its own rise time. js/seismic.js then sums
 *  their spectra incoherently — Σ|Aᵢ(f)|², the stochastic finite-fault method (Motazedian & Atkinson
 *  2005; Boore 2009) — instead of asking one point for the whole earthquake.
 *
 *  ① SLIP — the k⁻² model (Herrero & Bernard 1994). Observed slip distributions have a Fourier
 *     amplitude spectrum that is flat below a corner wavenumber set by the fault dimension and falls
 *     as k⁻² above it; that is the shape that makes a finite fault radiate an ω⁻² far-field spectrum,
 *     which is the same spectrum js/seismic.js's source already assumes. So the slip model and the
 *     source model are the SAME statement, not two.
 *     ⚠ HOW ROUGH — one number, and it is taken from a published statistic rather than chosen to look
 *     good. Somerville et al. (1999) characterise real slip inversions by their ASPERITIES: the area
 *     slipping at least 1.5× the fault-average is about 22 % of the rupture. For slip = 1 + σ·X with
 *     X standard normal, that is P(X > 0.5/σ) = 0.22, i.e. 0.5/σ = 0.7722, i.e. σ = 0.648. Nothing
 *     else about the roughness is free.
 *     ⚠ AND IT IS DETERMINISTIC. The phases come from a seeded generator keyed on the fault geometry,
 *     so the same rupture always produces the same slip — a field that reshuffled itself on every
 *     rebuild would make the intensity map flicker and would make this model untestable.
 *
 *  ② MOMENT IS CONSERVED, EXACTLY. The slip field is normalised so Σ μ·Aᵢ·Dᵢ = M₀ to the last bit,
 *     whatever the roughness did. That is the standing requirement 「総モーメントを保存した」 and it
 *     is asserted rather than assumed — tests/r263-checks ⑤ re-adds the subfault moments.
 *
 *  ③ RUPTURE TIME — the tear runs out from the hypocentre across the plane at Vr, so subfault i
 *     starts at |rᵢ − r_hypo| / Vr measured ON THE FAULT, not through the ground. Vr is the same
 *     0.75·β the wavefront envelope has used since #R189; one constant, one meaning.
 *     ⚠ THIS IS WHERE DIRECTIVITY COMES FROM NOW, and it comes for free. A site ahead of the rupture
 *     receives the subfault arrivals compressed in time and a site behind it receives them stretched,
 *     because arrival = rupture time + travel time and the two terms cancel forward and add backward.
 *     #R232/#R234's X·cos θ factor is a closed-form approximation to exactly this; with real subfault
 *     arrival times the approximation is not needed and js/seismic.js stops applying it (applying
 *     both would count the same Doppler shift twice).
 *
 *  ④ RISE TIME — how long one point on the fault keeps slipping: τ = 2.03 × 10⁻⁹ · M₀^(1/3) with M₀
 *     in dyne·cm (Somerville et al. 1999), which is 2.0 s at Mw 7.3 and 15 s at Mw 9.0. It bounds the
 *     subfault source duration from below: a subfault cannot radiate for less time than it slips.
 *
 *  ⚠ PURE ARITHMETIC — no DOM, no renderer, no fetch, no app state, and no dependency on
 *  js/seismic.js. That is what lets tests/r263-checks verify moment conservation, the asperity
 *  fraction and the rupture-time field in Node, the same contract js/fault-geometry.js states.
 * ==========================================================================*/
window.IntMapSubfault = (function () {
  'use strict';

  const D = Math.PI / 180;
  const SIGMA = 0.648;                 /* see ① — Somerville et al. (1999), 22 % asperity area */
  const ASPERITY_RATIO = 1.5;          /* …the threshold that statistic is defined at */
  const ASPERITY_FRAC = 0.22;

  /* ── a deterministic generator ────────────────────────────────────────────────────────────────
     mulberry32: 32 bits of state, uniform to well past what a phase needs, and — the point — the
     same sequence for the same seed on every machine and every rebuild. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* keyed on the geometry, so «the same fault» means «the same slip» and a different fault does not
     accidentally inherit it */
  function seedOf(f) {
    let h = 2166136261 >>> 0;
    const mix = (v) => { h ^= Math.round((+v || 0) * 1000) >>> 0; h = Math.imul(h, 16777619) >>> 0; };
    mix(f.lengthKm); mix(f.widthKm); mix(f.dipDeg); mix(f.strikeDeg);
    mix(f.zTopKm); mix(f.M0 ? Math.log(f.M0) * 1e6 : 0);
    mix(f.centroid ? f.centroid[0] : 0); mix(f.centroid ? f.centroid[1] : 0);
    mix(f.hypo ? f.hypo[0] : 0); mix(f.hypo ? f.hypo[1] : 0);
    return h >>> 0;
  }

  /* ── ① the k⁻² slip field ─────────────────────────────────────────────────────────────────────
     Built as a truncated Fourier series rather than through an FFT: the grid is at most a few
     thousand cells and the series IS the definition — amplitude 1/(1 + (k/k_c)²)^(1/2) per mode so
     that the POWER falls as k⁻², random phase, k_c the fundamental of the fault itself. A transform
     would give the same field and would need a power-of-two grid the fault does not have. */
  function slipField(nl, nw, seed) {
    const r = rng(seed);
    const f = new Float64Array(nl * nw);
    const NM = 12;                                    /* modes per axis — see the ⚠ in `build` */
    for (let m = 0; m <= NM; m++) {
      for (let n = 0; n <= NM; n++) {
        if (!m && !n) continue;
        const k = Math.sqrt(m * m + n * n);
        const amp = 1 / (1 + k * k);                  /* |D(k)| ∝ k⁻² above the corner k = 1 */
        const ph1 = r() * 2 * Math.PI, ph2 = r() * 2 * Math.PI;
        for (let b = 0; b < nw; b++) {
          const sy = Math.cos(Math.PI * n * (b + 0.5) / nw + ph2);
          for (let a = 0; a < nl; a++) {
            f[b * nl + a] += amp * Math.cos(Math.PI * m * (a + 0.5) / nl + ph1) * sy;
          }
        }
      }
    }
    /* to zero mean and unit variance, so SIGMA means what ① says it means */
    let mean = 0; for (let i = 0; i < f.length; i++) mean += f[i]; mean /= f.length;
    let v = 0; for (let i = 0; i < f.length; i++) { f[i] -= mean; v += f[i] * f[i]; }
    const sd = Math.sqrt(v / Math.max(1, f.length)) || 1;
    for (let i = 0; i < f.length; i++) f[i] /= sd;
    return f;
  }

  /* ── the plane, and where a subfault sits on it ───────────────────────────────────────────────*/
  function destKm(lng, lat, brgDeg, dKm) {
    const kx = 111.320 * Math.cos(lat * D) || 1e-6, ky = 110.574;
    const b = brgDeg * D;
    return [lng + (dKm * Math.sin(b)) / kx, lat + (dKm * Math.cos(b)) / ky];
  }

  /* `f` is what js/fault-geometry.js's solve() returns, plus:
        centroid [lng,lat] · hypo [lng,lat] · hypoDepthKm · muPa (optional) · maxSubfaults (optional)
     Returns null when there is nothing to cut up. */
  function build(f) {
    if (!f) return null;
    const L = +f.lengthKm, W = +f.widthKm, dip = +f.dipDeg, strike = +f.strikeDeg;
    const M0 = +f.M0, zTop = Math.max(0, +f.zTopKm || 0);
    if (!(L > 0 && W > 0 && M0 > 0) || !isFinite(dip) || !isFinite(strike)) return null;
    const c = f.centroid, hy = f.hypo || f.centroid;
    if (!c || !isFinite(c[0]) || !isFinite(c[1])) return null;

    /* ⚠ THE SUBFAULT IS SIZED, NOT COUNTED. A fixed count would make a 20 km fault's subfaults 1 km
       across and a 1,300 km fault's 65 km across — and the whole point of the sum is that a subfault
       is small enough to be a point source at the distances that matter. The target edge is a fixed
       fraction of the DOWN-DIP WIDTH (the short axis, so the cells stay roughly square), with a cap
       so that a megathrust does not cost 40,000 spectra. */
    const target = Math.max(2, W / 6);
    const cap = Math.max(16, Math.min(1200, +f.maxSubfaults || 600));
    let nl = Math.max(1, Math.round(L / target)), nw = Math.max(1, Math.round(W / target));
    while (nl * nw > cap) { if (nl >= nw) nl--; else nw--; if (nl < 1 || nw < 1) break; }
    nl = Math.max(1, nl); nw = Math.max(1, nw);
    const dl = L / nl, dw = W / nw;
    const areaKm2 = dl * dw;

    const field = (nl * nw > 1) ? slipField(nl, nw, seedOf(f)) : new Float64Array(1);

    /* where the hypocentre sits on the plane, in along-strike and down-dip kilometres */
    const sinD = Math.sin(dip * D), cosD = Math.cos(dip * D);
    const brgAlong = strike, brgDown = (strike + 90) % 360;
    const kx = 111.320 * Math.cos(c[1] * D) || 1e-6, ky = 110.574;
    const dxKm = (hy[0] - c[0]) * kx, dyKm = (hy[1] - c[1]) * ky;
    const sa = Math.sin(brgAlong * D), ca = Math.cos(brgAlong * D);
    /* ⚠ THE NUCLEATION POINT IS ON THE PLANE, BY DEFINITION — so both coordinates are CLAMPED to it.
       The down-dip one always was; the along-strike one was not, and an epicentre that projects
       outside the ends (a reader who moved the hypocentre away from the rupture they drew, or a
       catalogue whose epicentre sits off its own published rectangle) then put the start of the tear
       off the fault. Every subfault's rupture time is measured from that point, so instead of one
       end breaking at t = 0 the WHOLE fault broke late and nearly simultaneously — which silently
       removes the directivity this file exists to produce. Caught by tests/r263-checks ③. */
    const u0 = Math.max(-L / 2, Math.min(L / 2, dxKm * sa + dyKm * ca));
    const zH = isFinite(f.hypoDepthKm) ? +f.hypoDepthKm : (zTop + W * sinD / 2);
    const w0 = Math.max(0, Math.min(W, sinD > 1e-3 ? (zH - zTop) / sinD : W / 2)) - W / 2;

    const mu = +f.muPa > 0 ? +f.muPa : 3.3075e10;
    const riseS = 2.03e-9 * Math.pow(M0 * 1e7, 1 / 3);       /* Somerville et al. 1999; M0 → dyne·cm */
    const vr = +f.vrKms > 0 ? +f.vrKms : 2.625;              /* 0.75·β, β = 3.5 km/s */

    /* ② the weights, normalised so the moments sum to M0 exactly */
    const wgt = new Float64Array(nl * nw);
    let wsum = 0;
    for (let b = 0; b < nw; b++) for (let a = 0; a < nl; a++) {
      const i = b * nl + a;
      wgt[i] = Math.max(0, 1 + SIGMA * field[i]);
      wsum += wgt[i];
    }
    if (!(wsum > 0)) { for (let i = 0; i < wgt.length; i++) wgt[i] = 1; wsum = wgt.length; }

    const subs = new Array(nl * nw);
    let mSum = 0, sMax = 0, tMax = 0;
    for (let b = 0; b < nw; b++) for (let a = 0; a < nl; a++) {
      const i = b * nl + a;
      const u = (a + 0.5) * dl - L / 2;                      /* along strike, from the centroid */
      const w = (b + 0.5) * dw - W / 2;                      /* down dip, from the centroid */
      const p1 = destKm(c[0], c[1], brgAlong, u);
      const p2 = destKm(p1[0], p1[1], brgDown, w * cosD);
      const depthKm = Math.max(0, zTop + ((b + 0.5) * dw) * sinD);
      const m0 = M0 * wgt[i] / wsum;
      const slipM = m0 / (mu * areaKm2 * 1e6);
      const tRupS = Math.hypot(u - u0, w - w0) / vr;
      mSum += m0; if (slipM > sMax) sMax = slipM; if (tRupS > tMax) tMax = tRupS;
      subs[i] = { lng: p2[0], lat: p2[1], depthKm, M0: m0, slipM, tRupS, riseS, areaKm2 };
    }

    /* the asperity statistic ① is calibrated against, measured on the field that was actually built
       — so a reader (and tests/r263-checks) can see whether the calibration held for this rupture */
    const meanSlip = M0 / (mu * areaKm2 * 1e6 * subs.length);
    let asp = 0; for (const s of subs) if (s.slipM >= ASPERITY_RATIO * meanSlip) asp++;

    return { subs, nl, nw, dlKm: dl, dwKm: dw, areaKm2, M0, M0Sum: mSum,
      meanSlipM: meanSlip, maxSlipM: sMax, maxRupTimeS: tMax, riseS, vrKms: vr,
      asperityFraction: asp / subs.length, sigma: SIGMA,
      hypoAlongKm: u0, hypoDownDipKm: w0, lengthKm: L, widthKm: W, dipDeg: dip, strikeDeg: strike,
      zTopKm: zTop, seed: seedOf(f) };
  }

  return { build, slipField, rng, seedOf, SIGMA, ASPERITY_RATIO, ASPERITY_FRAC };
})();
