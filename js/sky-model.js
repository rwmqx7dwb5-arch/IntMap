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

  /** linear, unbounded radiance along one ray */
  const radiance = (alt0, ve0, se0, az0) => {
    const N = 16, M = 8;
    const alt = Math.max(0, Math.min(RT - RG - 1, alt0 || 0));
    const o = [0, 0, RG + alt];
    const ve = ve0 * D2R, az = (az0 || 0) * D2R, se = se0 * D2R;
    const d = [Math.sin(az) * Math.cos(ve), Math.cos(az) * Math.cos(ve), Math.sin(ve)];
    const s = [0, Math.cos(se), Math.sin(se)];
    let tMax = toShell(o, d, RT);
    if (!(tMax > 0)) return [0, 0, 0];
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
    const dt = tMax / N;
    let odR = 0, odM = 0, odO = 0, sumM = 0;
    const sum = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) * dt;
      const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
      const h = Math.max(0, Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) - RG);
      const hr = Math.exp(-h / HR) * dt, hm = Math.exp(-h / HM) * dt, ho = ozone(h) * dt;
      odR += hr; odM += hm; odO += ho;
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
      let att1 = 1;
      for (let k = 0; k < 3; k++) {
        const tau = BR[k] * (odR + odRs) + BM * 1.1 * (odM + odMs) + BO[k] * (odO + odOs);
        const a = Math.exp(-tau);
        sum[k] += hr * a;
        if (k === 1) att1 = a;
      }
      sumM += hm * att1;
    }
    const mu = d[0] * s[0] + d[1] * s[1] + d[2] * s[2];
    const pR = 3 / (16 * Math.PI) * (1 + mu * mu);
    const pM = 3 / (8 * Math.PI) * ((1 - G * G) * (1 + mu * mu)) /
               ((2 + G * G) * Math.pow(Math.max(1e-6, 1 + G * G - 2 * G * mu), 1.5));
    return [0, 1, 2].map((k) => SUN_I * (sum[k] * BR[k] * pR + sumM * BM * pM));
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
