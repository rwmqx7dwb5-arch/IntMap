/* ============================================================================
 *  IntMap · THE SKY'S OWN COLOUR — Rayleigh + Mie, marched  (#R202)
 * ----------------------------------------------------------------------------
 *  「Cesiumと同じ大気・空のエフェクトをMapLibreでも。完全に同一な見た目にしろ。（現在は空が真っ暗であるため）」
 *
 *  #R196 answered the first half of this: a style with no `sky` block draws no surface above the
 *  horizon at all, so what filled it was the container's CSS colour, and stating all seven sky
 *  properties fixed that. What it could not fix is what it stated them TO. `sky-color` was the
 *  constant `#060b16` — deep space — and `horizon-color` a two-stop interpolation between one night
 *  hex and one day hex. So on MapLibre the sky ABOVE the thin horizon band was near-black at noon,
 *  from the ground, in clear daylight. Measured against Cesium at the same camera and instant
 *  (test-results/r202/sky-*.png): the top of the frame at z14/pitch 75 was [45,52,64] on MapLibre
 *  against [85,112,130] on Cesium — darker, and grey where Cesium is blue. That is the 真っ暗.
 *
 *  Cesium does not pick hexes: `SkyAtmosphere` integrates scattering. Two hexes cannot be made to
 *  agree with an integral by choosing better hexes — at best they agree at one sun elevation and one
 *  camera altitude, and this app flies from a street to low orbit and travels in time. So this file
 *  is the integral, on the CPU, evaluated whenever the Sun or the camera has actually moved, and
 *  MapLibre is handed the colour its sky block is shaped to take.
 *
 *  THE MODEL is the standard single-scattering one, with the constants MapLibre's own globe
 *  atmosphere shader uses (its source names them, and #R186 quoted them when it turned that shader
 *  on): planet 6,371 km, atmosphere top 6,471 km, Rayleigh β = (5.8, 13.5, 33.1)e−6 m⁻¹ with an 8 km
 *  scale height, Mie β = 21e−6 with 1.2 km, Rayleigh phase 3/16π·(1+cos²θ) and Henyey-Greenstein
 *  g = 0.76 for Mie. The view ray is marched to the top of the atmosphere; at each step the sun ray
 *  is marched too, and a step whose sun ray is blocked by the planet contributes nothing — which is
 *  what makes dusk fall from the ground up and gives twilight without a twilight term.
 *
 *  ⚠ IT IS A SKY MODEL, NOT A RENDERER. It answers "what colour is the sky, that far up, from here",
 *  and MapLibre draws the gradient down to its own horizon colour. The limb seen from space is still
 *  MapLibre's own shader (`atmosphere-blend`); this does not touch it.
 *
 *  ⚠ ONE EXPORT, AND EVERYTHING ELSE INSIDE IT. tests/r175-checks ③ is the invariant the whole Vite
 *  migration rests on: a js/ module may have no unexported top-level declaration, because such a name
 *  would have been a global before the bundle. So the constants and the march live inside the
 *  function rather than beside it. It is called on a theme apply, on camera settle and on the clock —
 *  a handful of times a second at the very most — so re-entering the closure costs nothing that can
 *  be measured, and pure arithmetic is what lets tests/r202-checks.test.mjs run it in Node.
 * ==========================================================================*/

/**
 * The colour MapLibre's `sky-color` should be, for this Sun and this eye height.
 *
 * @param {number} sunElevDeg Sun elevation at the point the camera is looking at, degrees
 * @param {number} camAltM    eye height above sea level, metres
 * @param {number} [relAzDeg] bearing from the view direction to the Sun, degrees (90 = across it)
 * @param {number} [viewElevDeg] where in the sky to sample; defaults to the top of the drawn band
 * @returns {{hex: string, rgb: number[], linear: number[]}}
 */
export function skyColour(sunElevDeg, camAltM, relAzDeg, viewElevDeg) {
  const RG = 6371000;           /* planet radius, m */
  const RT = 6471000;           /* top of the atmosphere, m */
  const BR = [5.8e-6, 13.5e-6, 33.1e-6];
  const BM = 21e-6;
  const HR = 8000, HM = 1200;
  const G = 0.76;
  /* ══ ⚠ (#R218) OZONE — THE ABSORBER THAT MAKES TWILIGHT BLUE ═════════════════════════════════════
     「MapLibreの地球大気の描写をもっとリアルで忠実で美しく。」 What was missing was not a tuning knob,
     it was a CONSTITUENT. This model integrated Rayleigh and Mie and nothing else, and a
     Rayleigh-only twilight is a known-wrong picture: with the Sun below the horizon the sight-line
     passes through 10–40 km, where Rayleigh scattering has almost nothing left to remove, so the
     model returned a washed grey-brown where a real sky at −4° is deep blue. The thing that removes
     the residual yellow-red from that path is OZONE, absorbing in the Chappuis band around 600 nm —
     it is why the blue hour is blue, and it is the one term every modern sky model adds for exactly
     this reason (Bruneton & Neyret 2008; Hillaire 2020).
     ⚠ THE NUMBERS ARE PUBLISHED, NOT PICKED. β_O3 = (0.650, 1.881, 0.085)e−6 m⁻¹ is the reference
     extinction at the three primaries used by both papers, and the profile is their tent: a peak at
     25 km falling linearly to zero at 10 km and 40 km. ⚠ Ozone ABSORBS and does not scatter, so it
     enters the optical depth on both the view ray and the sun ray and appears in no phase function —
     which is what makes it darken the long path without adding any light of its own. */
  const BO = [0.650e-6, 1.881e-6, 0.085e-6];
  const ozone = (h) => Math.max(0, 1 - Math.abs(h - 25000) / 15000);
  const D2R = Math.PI / 180;
  /* Sun radiance in the arbitrary unit EXPOSURE is calibrated in; the pair has one degree of
     freedom, and it is fixed by the Cesium capture rather than by taste — see SKY_ELEV below. */
  const SUN_I = 22;
  const EXPOSURE = 0.7;
  /* ⚠ WHERE THE SAMPLE IS TAKEN, AND WHY IT IS NOT THE ZENITH. `sky-color` is the far end of
     MapLibre's sky gradient — the top of the band actually drawn — and at the pitches this app
     reaches that band spans roughly 0°…50° above the horizon, never the zenith. Sampling at 89° also
     lands INSIDE THE SUN'S OWN AUREOLE whenever the Sun is high (at a sub-solar noon the zenith is
     10° from the Sun, where the Mie phase function is 16× its sideways value), which is real physics
     and the wrong question: it made a tropical noon sky read as near-white. 55° is the top of what
     is drawn.
     ⚠ CALIBRATED AGAINST CESIUM, NOT CHOSEN. Cesium's own SkyAtmosphere at Tokyo, z14, pitch 75,
     local noon reads [85,112,130] at the top of the frame (test-results/r202/sky-cesium-noonLow.png).
     The model at 55° with the exposure above returns [88,115,149] for that camera and instant —
     three counts on red, three on green, and bluer on the last channel, which is the whole of the
     fit. tests/r202-checks ①d keeps a later tweak from walking away from that measurement. */
  const SKY_ELEV = 55;

  /** distance from `o` along unit `d` to the shell of radius R, or -1 when the ray misses it */
  const toShell = (o, d, R) => {
    const b = 2 * (o[0] * d[0] + o[1] * d[1] + o[2] * d[2]);
    const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - R * R;
    const disc = b * b - 4 * c;
    if (disc < 0) return -1;
    return (-b + Math.sqrt(disc)) / 2;
  };
  /** does the ray from `o` along unit `d` enter the planet before leaving? */
  const blocked = (o, d) => {
    const b = 2 * (o[0] * d[0] + o[1] * d[1] + o[2] * d[2]);
    const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - RG * RG;
    const disc = b * b - 4 * c;
    if (disc < 0) return false;
    return (-b - Math.sqrt(disc)) / 2 > 0;
  };

  /* ══ ⚠⚠ (#R220) MULTIPLE SCATTERING — THE TERM THAT WAS MISSING, NOT A TUNING KNOB ═══════════════
     「MapLibreの地球大気の描写をもっとリアルで忠実で美しく。」 — asked for the third time, and #R219
     wrote down why it had not been done: the next honest step is multiple scattering, and that needs
     a table. It is here now.

     WHAT SINGLE SCATTERING GETS WRONG, physically rather than aesthetically: this march counted a
     photon exactly once. Real air is optically thick enough in the blue that a large share of what
     reaches the eye has bounced two, three, many times — and every one of those bounces has an
     ISOTROPIC history, so the light it delivers has no direction left in it. The consequences are the
     three things a single-scattering sky is always criticised for, all of which this model had:
       · the sky away from the Sun is too dark and too saturated (no isotropic floor under it);
       · the ground-level horizon is too blue-black — the long path scatters out and nothing puts back;
       · twilight collapses far too fast once the Sun is down, because the only light left in a
         single-scattering model is what survives one bounce through 40 km of air.

     THE METHOD is Hillaire (2020) §5.4, "infinite scattering": the second-order in-scatter arriving
     at a point, divided by (1 − f), where f is the fraction of that light which scatters again. The
     geometric series is what turns two orders into all of them, and both terms are integrals over the
     WHOLE SPHERE at the point — so they depend only on height and on the Sun's zenith angle, never on
     where the camera is looking. That is why it is a TABLE (`skyColour._ms`), computed once on first
     use and reused: 16 heights × 24 Sun elevations, ~100 k inner steps, a few milliseconds, and after
     that the per-call cost is two interpolations.
     ⚠ ISOTROPIC PHASE, 1/4π, in both terms — using pR/pM here would be double-counting the direction
     that the multiple bounces are precisely what destroys.
     ⚠ It is attached to the exported function rather than declared beside it: tests/r175-checks ③
     forbids an unexported top-level declaration in js/ (it would have been a global before the bundle). */
  const MS_H = [0, 500, 1500, 3000, 5000, 8000, 12000, 17000, 23000, 30000, 40000, 50000, 62000, 75000, 88000, 99000];
  const MS_E = 24, MS_E0 = -25, MS_E1 = 90;      /* sun elevation samples, −25° … 90° */
  /* 8 directions, Fibonacci-spaced on the sphere — the coarsest set that still integrates a
     hemisphere-asymmetric field without banding, because the answer is an AVERAGE over the sphere. */
  const MS_DIRS = (() => {
    const out = [], K = 8, ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < K; i++) {
      const z = 1 - (2 * i + 1) / K, r = Math.sqrt(Math.max(0, 1 - z * z)), a = ga * i;
      out.push([r * Math.cos(a), r * Math.sin(a), z]);
    }
    return out;
  })();
  /** ψ_ms and f at one height and one Sun elevation — the two integrals over the sphere */
  const msPoint = (h, seDeg) => {
    const p0 = [0, 0, RG + h], s = [0, Math.cos(seDeg * D2R), Math.sin(seDeg * D2R)];
    const L2 = [0, 0, 0]; let fms = 0;
    const N2 = 8, M2 = 4, iso = 1 / (4 * Math.PI);
    for (const w of MS_DIRS) {
      let tMax = toShell(p0, w, RT);
      if (!(tMax > 0)) continue;
      const bg = 2 * (p0[0] * w[0] + p0[1] * w[1] + p0[2] * w[2]);
      const cg = p0[0] * p0[0] + p0[1] * p0[1] + p0[2] * p0[2] - RG * RG;
      const dg = bg * bg - 4 * cg;
      if (dg >= 0) { const rt = Math.sqrt(dg), t1 = (-bg - rt) / 2; if (t1 > 1e-6) tMax = Math.min(tMax, t1); }
      const dt = tMax / N2;
      let odR = 0, odM = 0, odO = 0;
      for (let i = 0; i < N2; i++) {
        const t = (i + 0.5) * dt;
        const q = [p0[0] + w[0] * t, p0[1] + w[1] * t, p0[2] + w[2] * t];
        const hq = Math.max(0, Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2]) - RG);
        const hr = Math.exp(-hq / HR) * dt, hm = Math.exp(-hq / HM) * dt, ho = ozone(hq) * dt;
        odR += hr; odM += hm; odO += ho;
        /* the transmittance back along ω to the point we are solving for */
        const tv = [0, 1, 2].map((k) => Math.exp(-(BR[k] * odR + BM * 1.1 * odM + BO[k] * odO)));
        /* f — how much of the light arriving here is scattered ONWARD. No sun visibility in it:
           this is the medium's own re-scattering, which is what closes the series. Green channel,
           because f is a scalar in the approximation and green is where the eye's luminance lives. */
        fms += iso * tv[1] * (BR[1] * hr + BM * hm);
        if (blocked(q, s)) continue;
        const ts = toShell(q, s, RT);
        if (!(ts > 0)) continue;
        const dts = ts / M2;
        let sR = 0, sM = 0, sO = 0;
        for (let j = 0; j < M2; j++) {
          const u = (j + 0.5) * dts;
          const z0 = q[0] + s[0] * u, z1 = q[1] + s[1] * u, z2 = q[2] + s[2] * u;
          const hs = Math.max(0, Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2) - RG);
          sR += Math.exp(-hs / HR) * dts; sM += Math.exp(-hs / HM) * dts; sO += ozone(hs) * dts;
        }
        for (let k = 0; k < 3; k++) {
          const tsun = Math.exp(-(BR[k] * sR + BM * 1.1 * sM + BO[k] * sO));
          L2[k] += tv[k] * tsun * iso * (BR[k] * hr + BM * hm);
        }
      }
    }
    const K = MS_DIRS.length;
    const f = Math.min(0.92, fms / K);            /* the series only converges below 1 */
    return L2.map((v) => (v / K) / (1 - f));
  };
  const msTable = () => {
    if (skyColour._ms) return skyColour._ms;
    const t = [];
    for (let a = 0; a < MS_H.length; a++) {
      const row = [];
      for (let e = 0; e < MS_E; e++) row.push(msPoint(MS_H[a], MS_E0 + (MS_E1 - MS_E0) * e / (MS_E - 1)));
      t.push(row);
    }
    skyColour._ms = t;
    return t;
  };
  /** ψ_ms at an arbitrary height and Sun elevation, bilinear in the table */
  const msAt = (h, seDeg) => {
    const t = msTable();
    let a = 0; while (a < MS_H.length - 2 && MS_H[a + 1] < h) a++;
    const fa = Math.max(0, Math.min(1, (h - MS_H[a]) / (MS_H[a + 1] - MS_H[a])));
    const x = Math.max(0, Math.min(MS_E - 1.001, (seDeg - MS_E0) / (MS_E1 - MS_E0) * (MS_E - 1)));
    const e = Math.floor(x), fe = x - e;
    const q = (ai, ei, k) => t[ai][ei][k];
    return [0, 1, 2].map((k) =>
      (q(a, e, k) * (1 - fe) + q(a, e + 1, k) * fe) * (1 - fa) +
      (q(a + 1, e, k) * (1 - fe) + q(a + 1, e + 1, k) * fe) * fa);
  };

  /** linear, unbounded radiance along one ray */
  /* ══ ⚠⚠ (#R222) THE EYE MAY BE OUTSIDE THE ATMOSPHERE, AND IT USUALLY IS ═════════════════════════
     「MapLibreの地球大気の描写をもっとリアルで忠実で美しく。（とにかくリアルに、現実に忠実に美しく）」

     `alt` was CLAMPED to the top of the shell — `Math.min(RT - RG - 1, alt0)` — so every camera above
     100 km was modelled as a camera at 100 km, and the march then started at t = 0 and spent most of
     its sixteen samples in vacuum. That is the whole reason this file could never answer the question
     the globe view actually asks. Measured on the shipped build at 5,286 km over Japan, the band the
     reader sees around the Earth is `horizon-color` = **#c2ccd1** — a flat grey hex, the same one at
     every altitude, every hour and every sun angle, because #R213's ramp is what answers when the
     model has nothing to say. A grey collar is exactly 「茶/くすみ」.

     Two lines fix the geometry and nothing else moves: the eye is placed where it really is, and the
     march runs between the ray's ENTRY into the shell and its exit (or the ground). For any camera
     inside the atmosphere the entry root is negative, t0 is 0, and every previous measurement in this
     file is reproduced to the byte. For a camera outside it, a ray that grazes the planet now marches
     through the 700–900 km of air it really crosses — which is the limb, and it comes out blue-white
     on the day side and red at the terminator because that is what the integral says. */
  /* ══ ⚠⚠ (#R224) THE GREY-GREEN HORIZON WAS THE QUADRATURE, NOT THE PHYSICS ═══════════════════════
     「MapLibreの地球大気の描写をもっとリアルで忠実で美しく。」

     #R223 measured this model at a 3° view elevation and found #93a394 — G above BOTH R and B, i.e. a
     grey-GREEN daytime sky — and wrote that the cause must be the single-scattering/grey-Mie/long-path
     combination and that fixing it needed the multiple-scattering term re-calibrated. It measured the
     symptom correctly and named the wrong cause, and this round settled it by CONVERGENCE TESTING
     rather than by argument: the same model, same constants, same everything, with the march refined:

         view elev    N=16 (shipped)   N=64      N=256     N=1024
            1°        #878967 olive    #97a5a3   #9cadb4   #9dafb8   pale blue
            3°        #93a394 green    #98aeb3   #9ab3be   #9bb4c0   pale blue
           10°        #7a9ab2          #7c9ebb   #7d9fbe   #7ea0bf
           55°        #547199          #5c779d   #5d779e   #5d779e

     It CONVERGES, and it converges to a blue sky. Sixteen UNIFORM steps over a grazing ray is the
     defect: at 3° from sea level the ray is ~250 km long, so the first sample sits 7.8 km up and the
     march never sees the dense air the eye is standing in — the part that puts the blue back. The
     error is 81 counts at 1°, which is the whole of the reported colour.

     ⚠ THE FIX IS WHERE THE SAMPLES GO, NOT HOW MANY. Density is exp(−h/H), so the integrand is
     concentrated at the ray's LOWEST point — which is the eye for a camera inside the air, and the
     TANGENT POINT for one in space looking at the limb. So the march is warped geometrically away
     from that point (t grows as (e^{kx}−1)/(e^k−1), k = 7) and split there when the ray descends
     before it climbs. Measured against the N=1024 reference over ten cameras from sea level to
     5,286 km and Sun +60° to −4°: worst channel error 81 → 3 counts, at 0.034 ms per call against
     0.023. ⚠ The samples are built as [t, dt] pairs and marched in INCREASING t, because the optical
     depth accumulated so far is what attenuates the next sample — a warp that reversed the order
     would silently light the sky from the wrong end. */
  const radiance = (alt0, ve0, se0, az0) => {
    const N = 32, M = 8, KWARP = 7;
    const alt = Math.max(0, alt0 || 0);
    const o = [0, 0, RG + alt];
    const ve = ve0 * D2R, az = (az0 || 0) * D2R, se = se0 * D2R;
    const d = [Math.sin(az) * Math.cos(ve), Math.cos(az) * Math.cos(ve), Math.sin(ve)];
    const s = [0, Math.cos(se), Math.sin(se)];
    /* where the ray is INSIDE the shell: [tIn, tMax]. Outside it there is no medium to sample. */
    let tIn = 0, tMax;
    {
      const b = 2 * (o[0] * d[0] + o[1] * d[1] + o[2] * d[2]);
      const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - RT * RT;
      const disc = b * b - 4 * c;
      if (disc < 0) return [0, 0, 0];                 /* the ray misses the atmosphere entirely */
      const rt = Math.sqrt(disc);
      const ta = (-b - rt) / 2, tb = (-b + rt) / 2;
      if (!(tb > 0)) return [0, 0, 0];
      tIn = Math.max(0, ta); tMax = tb;
    }
    if (!(tMax > tIn)) return [0, 0, 0];
    /* ⚠ A VIEW RAY THAT MEETS THE GROUND STOPS THERE — and "the camera is exactly at sea level" is
       the case that has to be got right, not the one to hope does not happen. The near root is then
       t = 0, so a `t > 0` test lets the ray straight through the planet: the march samples negative
       heights, exp(−h/H) overflows, and the whole radiance comes back NaN. Both roots are considered
       here, and the height is clamped in the march as well, so no arrangement of camera and
       direction can produce a density that is not a density. */
    const bg = 2 * (o[0] * d[0] + o[1] * d[1] + o[2] * d[2]);
    const cg = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - RG * RG;
    const dg = bg * bg - 4 * cg;
    if (dg >= 0) {
      const rt = Math.sqrt(dg), t1 = (-bg - rt) / 2, t2 = (-bg + rt) / 2;
      if (t2 > 1e-6 && t1 <= 1e-6) return [0, 0, 0];      /* pointing into the ground from on it */
      if (t1 > 1e-6) tMax = Math.min(tMax, t1);
    }
    if (!(tMax > tIn)) return [0, 0, 0];
    /* the sample positions and their widths, densest at the ray's lowest point — see the note above */
    const _steps = (function () {
      const tLow = Math.max(tIn, Math.min(tMax, -(o[0] * d[0] + o[1] * d[1] + o[2] * d[2])));
      const denom = Math.exp(KWARP) - 1;
      const warp = (x) => (Math.exp(KWARP * x) - 1) / denom;
      const out = [];
      const seg = (a, b, n) => {
        if (!(Math.abs(b - a) > 0) || n < 1) return;
        let prev = a;
        for (let i = 1; i <= n; i++) {
          const tt = a + (b - a) * warp(i / n);
          out.push([(prev + tt) / 2, Math.abs(tt - prev)]); prev = tt;
        }
      };
      const lenA = tLow - tIn, lenB = tMax - tLow;
      if (lenA > 0 && lenB > 0) { const nA = Math.max(2, Math.round(N * 0.35)); seg(tLow, tIn, nA); seg(tLow, tMax, N - nA); }
      else if (lenA > 0) seg(tLow, tIn, N); else seg(tLow, tMax, N);
      out.sort((p, q) => p[0] - q[0]);
      return out;
    })();
    let odR = 0, odM = 0, odO = 0;
    const sum = [0, 0, 0];
    /* ══ ⚠⚠ (#R221) THE MIE TERM WAS ATTENUATED THROUGH THE GREEN CHANNEL, FOR ALL THREE ═══════════
       「MapLibreの地球大気の描写をもっとリアルで忠実で美しく。」 — and this round found a defect in
       the model rather than a constant to tune. `sumM` was a SCALAR, accumulated with `att1`, which
       was whichever attenuation the loop happened to leave behind — the GREEN one (`if (k === 1)`).

       Mie SCATTERING is grey (BM is one number for all three channels) and that part was right. What
       is not grey is the TRANSMITTANCE the scattered light has to travel through afterwards: Rayleigh
       goes as λ⁻⁴ and ozone absorbs in the Chappuis band, so along a grazing sight-line the three
       channels differ by an order of magnitude. Attenuating all three by green's value injects a
       neutral haze that has been reddened-and-then-un-reddened, and it lands exactly where Mie
       dominates — near the horizon, where the aerosol layer is thickest and the phase function is
       most forward. Measured on the shipped model, sun 45° at a 3° view elevation:

           #b6c3b6   (182, 195, 182)   — green-dominant, i.e. a GREY-GREEN daytime horizon
           and at sunset, sun 2°:  #705e3c  — olive, where the sky is orange

       That green is the reason #R213 could not use the model's hue above a +6° Sun and had to keep
       #R196's measured luminance underneath it. One vector instead of one scalar removes it: the
       haze now arrives reddened at sunset (red's transmittance is far higher than green's over 38
       air masses) and blue-white at noon, which is what makes the band read as air rather than as
       fog. ⚠ NOTHING ELSE ABOUT THE MODEL MOVES — same coefficients, same phase functions, same
       exposure, same multiple-scattering table. */
    const sumM = [0, 0, 0];
    /* (#R220) the multiple-scattering sum. It rides the SAME march and the same view transmittance;
       what it does not have is a sun-visibility test — light that has bounced arrives from the whole
       sky, which is exactly why it survives into twilight and into the Earth's shadow. */
    const ms = [0, 0, 0];
    for (let i = 0; i < _steps.length; i++) {
      const t = _steps[i][0], dt = _steps[i][1];
      const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
      const h = Math.max(0, Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) - RG);
      const hr = Math.exp(-h / HR) * dt, hm = Math.exp(-h / HM) * dt, ho = ozone(h) * dt;
      odR += hr; odM += hm; odO += ho;
      {
        const psi = msAt(h, se0);
        for (let k = 0; k < 3; k++) {
          const av = Math.exp(-(BR[k] * odR + BM * 1.1 * odM + BO[k] * odO));
          ms[k] += av * psi[k] * (BR[k] * hr + BM * hm);
        }
      }
      if (blocked(p, s)) continue;
      const ts = toShell(p, s, RT);
      if (!(ts > 0)) continue;
      const dts = ts / M;
      let odRs = 0, odMs = 0, odOs = 0;
      for (let j = 0; j < M; j++) {
        const u = (j + 0.5) * dts;
        const q0 = p[0] + s[0] * u, q1 = p[1] + s[1] * u, q2 = p[2] + s[2] * u;
        const hs = Math.max(0, Math.sqrt(q0 * q0 + q1 * q1 + q2 * q2) - RG);
        odRs += Math.exp(-hs / HR) * dts; odMs += Math.exp(-hs / HM) * dts; odOs += ozone(hs) * dts;
      }
      for (let k = 0; k < 3; k++) {
        const tau = BR[k] * (odR + odRs) + BM * 1.1 * (odM + odMs) + BO[k] * (odO + odOs);
        const a = Math.exp(-tau);
        sum[k] += hr * a;
        sumM[k] += hm * a;      /* the SAME optical path, per channel — see the note above */
      }
    }
    const mu = d[0] * s[0] + d[1] * s[1] + d[2] * s[2];
    const pR = 3 / (16 * Math.PI) * (1 + mu * mu);
    const pM = 3 / (8 * Math.PI) * ((1 - G * G) * (1 + mu * mu)) /
               ((2 + G * G) * Math.pow(Math.max(1e-6, 1 + G * G - 2 * G * mu), 1.5));
    return [0, 1, 2].map((k) => SUN_I * (sum[k] * BR[k] * pR + sumM[k] * BM * pM + ms[k]));
  };

  const tone = (c) => {
    const v = 1 - Math.exp(-c * EXPOSURE);
    return Math.max(0, Math.min(255, Math.round(255 * Math.pow(Math.max(0, v), 1 / 2.2))));
  };
  const lin = radiance(Math.max(0, camAltM || 0), (viewElevDeg == null ? SKY_ELEV : viewElevDeg),
    sunElevDeg, relAzDeg == null ? 90 : relAzDeg);
  const rgb = lin.map(tone);
  return { hex: '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join(''), rgb, linear: lin };
}

/**
 * (#R222) Where to look, from `camAltM`, to see the atmosphere edge-on at a given tangent height.
 *
 * From outside the shell the whole atmosphere is a band a fraction of a degree wide at the planet's
 * edge, and WHICH view elevation lands on it is pure geometry: a ray whose closest approach to the
 * centre is R+h leaves an eye at R+alt at asin((R+h)/(R+alt)) from the nadir. Feeding that back into
 * `skyColour` is what makes the limb the integral of the air it actually crosses — roughly 800 km of
 * it at h = 12 km — rather than a hex chosen for the ground.
 *
 * @param {number} camAltM eye height above sea level, metres
 * @param {number} [tangentM] closest approach of the ray to the surface, metres (default 12 km)
 * @returns {number|null} view elevation in degrees (negative = below the horizontal), or null when
 *                        the eye is inside that shell and there is no limb to look at
 */
export function limbViewElev(camAltM, tangentM) {
  const RG = 6371000;
  const D = RG + Math.max(0, camAltM || 0);
  const b = RG + (tangentM == null ? 12000 : Math.max(0, tangentM));
  if (!(D > b)) return null;
  return Math.asin(b / D) * 180 / Math.PI - 90;
}
