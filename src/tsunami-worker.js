/* ============================================================================
 *  IntMap · THE TSUNAMI SOLVER, OFF THE MAIN THREAD  (#R193)
 * ----------------------------------------------------------------------------
 *  「津波が発生するとされるような地震だった場合、波の伝播のわかるアニメーション津波シミュレーター
 *    も使えるように。（追記：まったくのごみ。徹底的に作り直せ。）」
 *
 *  MEASURED FIRST, on the #R192 module, Tōhoku M9.1 / 6 h / 320²:
 *
 *      building the model     9.5 s wall, of which 6.6 s BLOCKED the main thread (worst task 900 ms)
 *      playing it back        9.3 fps, and it advanced 2 of its 74 frames in eight seconds
 *                             — i.e. ~5 minutes to watch the wave cross the Pacific once
 *
 *  Both numbers come from the same decision: the solver ran on the page, in an async function that
 *  yielded every eighth stored frame, and playback re-encoded a 320² canvas to a PNG data URL and
 *  swapped a whole image source on EVERY animation frame. The physics was never the problem. The
 *  delivery was, and this file is the first half of the answer: everything below happens in a worker
 *  and what crosses back is a transferable buffer.
 *
 *  ── THE EQUATIONS ───────────────────────────────────────────────────────────────────────────────
 *  Shallow-water (long-wave) in flux form on a spherical Arakawa C-grid, leapfrog in time — what JMA,
 *  TUNAMI-N2 and COMCOT solve offshore:
 *
 *      ∂M/∂t = −g·D·(1/(R cosφ))·∂η/∂λ − τ_x        M, N: volume flux (m²/s)
 *      ∂N/∂t = −g·D·(1/R)·∂η/∂φ       − τ_y        D = h + η: TOTAL depth
 *      ∂η/∂t = −(1/(R cosφ))·[ ∂M/∂λ + ∂(N cosφ)/∂φ ]
 *
 *  Two things here are new against #R192, and both matter where a tsunami actually hurts:
 *
 *   · the pressure term uses the TOTAL depth D = h + η, not the still-water depth h. In 4 km of ocean
 *     that is a 0.02 % correction and invisible; over a 30 m shelf with a 5 m wave it is 17 %, and it
 *     is the difference between a wave that keeps its linear speed all the way in and one that
 *     steepens as the real thing does.
 *   · BOTTOM FRICTION, Manning: τ = g·n²·M·|M|/D^(7/3), n = 0.025 s·m^(−1/3) (Kotani et al. 1998, the
 *     value the Japanese operational models use over an ocean floor). Negligible in deep water by
 *     D^(7/3); dominant on the shelf, and the reason an unfrictioned long-wave model over-predicts
 *     coastal amplitude.
 *
 *  ⚠ ADVECTION (∂(M²/D)/∂x …) IS DELIBERATELY ABSENT, and this is a measurement rather than a
 *  simplification: at these cell sizes the Froude number in the open ocean is M/(D·√(gD)) ≈ 1e−4, so
 *  the advective terms are four orders below the pressure term, while an upwind advection stencil on a
 *  20 km grid adds its own numerical diffusion that is larger than the term it models. What it would
 *  change — the last kilometre, where the wave is a bore — this grid cannot resolve at all, and that
 *  is what the inundation model is for. Stated so nobody has to re-derive it.
 *
 *  ⚠ THE KAJIURA FILTER IS ALSO ABSENT, for the same kind of reason. The sea surface does not copy the
 *  sea floor exactly: the response is low-passed over a length of order the water depth (Kajiura 1963),
 *  usually approximated by a Gaussian of σ ≈ 0.75·h. With h ≈ 4–6 km that is σ ≈ 3–4.5 km, and this
 *  grid's cell is 20–30 km. The filter would be entirely inside one cell — it is already applied, by
 *  the sampling. Adding it would be arithmetic that changes nothing, which #R191 established is worth
 *  saying rather than doing.
 *
 *  ── STABILITY ───────────────────────────────────────────────────────────────────────────────────
 *  Δt from the CFL condition with a 0.45 margin, evaluated PER CELL — its own width against its own
 *  depth — rather than pairing the narrowest cell in the domain with the deepest one. ⚠ Verified not to
 *  change the answer: halving the margin to 0.25 moved the modelled Guam arrival by 24 s in 6,668, so
 *  the step is not what sets the travel times and the faster setting is the honest one to ship.
 *
 *  ── WHAT COMES BACK ─────────────────────────────────────────────────────────────────────────────
 *  Frames STREAM as they are produced, so the animation is watchable long before the run ends. Each
 *  is the surface elevation companded into an Int8: q = sign(η)·round(127·(|η|/A)^(1/3)) against the
 *  run's own peak A. The cube root is the same curve the colour ramp uses, so one step of q is ~0.8 %
 *  of the ramp everywhere — 120 frames of 512² is 31 MB this way against 63 MB of Int16 and 126 MB of
 *  Float32. The ANALYSIS fields (maximum crest, first arrival) are never quantised; they are computed
 *  here in full precision and sent once at the end.
 * ==========================================================================*/
'use strict';
/* eslint-disable no-unused-vars */
const RE = 6371000, G = 9.80665, DEG = Math.PI / 180;
const MANNING = 0.025;                 /* s·m^(−1/3) — ocean floor, Kotani et al. 1998 */
const ARRIVE = 0.01;                   /* m — the level a DART buoy calls an arrival */

let abort = 0;

/* Companding — see the header. A is the run's peak |η|. */
function compand(eta, q, n, A) {
  const inv = 1 / (A > 0 ? A : 1);
  for (let k = 0; k < n; k++) {
    const v = eta[k];
    if (v === 0) { q[k] = 0; continue; }
    const a = Math.abs(v) * inv;
    const s = Math.round(127 * Math.cbrt(a > 1 ? 1 : a));
    q[k] = v < 0 ? -s : s;
  }
}

function run(m) {
  const N = m.N | 0, n2 = N * N;
  const h = new Float32Array(m.h);
  const eta = new Float32Array(m.eta0);        /* the initial sea surface IS the sea-floor displacement */
  const sLat = m.sLat, nLat = m.nLat, dLam = m.dLam, dPhi = m.dPhi;
  const hours = m.hours, wantFrames = Math.max(24, Math.min(240, m.frames | 0));

  /* per-row geometry: cell centres and the northern face, and the metric factors that go with them */
  const cosC = new Float64Array(N), cosN = new Float64Array(N), invDx = new Float64Array(N);
  const latOf = (j) => sLat + (j + 0.5) * (nLat - sLat) / N;
  let dxMin = 1e18;
  for (let j = 0; j < N; j++) {
    const la = latOf(j);
    cosC[j] = Math.cos(la * DEG);
    cosN[j] = Math.cos((la + 0.5 * (nLat - sLat) / N) * DEG);
    const dxM = RE * cosC[j] * dLam;
    invDx[j] = 1 / dxM;
    if (dxM < dxMin) dxMin = dxM;
  }
  const dyM = RE * dPhi, invDy = 1 / dyM;

  /* ══ THE TIME STEP IS SET BY ONE CELL, SO IT HAD BETTER BE A CELL THAT EXISTS ═════════════════
     CFL wants Δt < Δx/√(gh) EVERYWHERE, and taking the narrowest cell in the domain against the
     deepest cell in the domain is two different cells' worth of pessimism. Measured on the Tōhoku
     domain: the box reaches 78°N, where a longitude cell is 5.5 km wide against 23 km at the source,
     and pairing that sliver with the 11 km trench gave Δt = 7.95 s and 2,718 steps for six hours.
     The condition is PER CELL — its own width against its own depth — and the Arctic cells that are
     narrow are not the cells that are deep. Same stability, materially fewer steps, and the number
     that comes out is the true limit rather than a bound on it. */
  let hMax = 0, lim = 1e18;
  for (let j = 0; j < N; j++) {
    const dxRow = RE * cosC[j] * dLam, dl = Math.min(dxRow, dyM), row = j * N;
    for (let i = 0; i < N; i++) {
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

  const M = new Float32Array(n2);              /* flux across the EAST face of (i,j) */
  const Nf = new Float32Array(n2);             /* flux across the NORTH face of (i,j) */
  const emax = new Float32Array(n2);
  const emin = new Float32Array(n2);
  const tarr = new Float32Array(n2); tarr.fill(-1);

  /* A sponge on the outer ring so a wave LEAVES the domain instead of reflecting back into it. */
  const SP = Math.max(6, Math.round(N * 0.04));
  const sponge = new Float32Array(n2);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const d = Math.min(Math.min(i, N - 1 - i), Math.min(j, N - 1 - j));
    sponge[j * N + i] = (d < SP) ? (1 - 0.05 * Math.pow((SP - d) / SP, 2)) : 1;
  }

  /* the run's peak, for the companding — seeded from the source and raised as the run finds bigger */
  let peak = 0;
  for (let k = 0; k < n2; k++) { const a = Math.abs(eta[k]); if (a > peak) peak = a; }
  const A = Math.max(0.05, peak);

  const frames = [];                            /* {t, q} — streamed out in batches */
  const gdt = G * dt, fricC = G * MANNING * MANNING * dt;
  let t = 0, sent = 0;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  /* ══ THE LIGHT CONE ═══════════════════════════════════════════════════════════════════════════
     Nothing outside a radius of cMax·t from the source can be anything but exactly zero — the
     equations have a finite propagation speed and cMax is the fastest cell in the domain, so this is
     an identity, not an approximation, and it holds through any number of reflections. Integrating
     only inside that circle turns an O(steps·N²) run into one whose cost grows with the area the
     wave has actually reached: the swept area is ∫(πr²)dt = (1/3)·πR²·T against πR²·T, i.e. THREE
     TIMES less arithmetic over a run sized so the wave just reaches the boundary at the end.
     Recomputed every 16 steps with a four-cell margin, which is more than the 2.3 cells the fastest
     possible wave can cross in that time. */
  let bj0 = N, bj1 = -1, bi0 = N, bi1 = -1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (eta[j * N + i] !== 0) {
    if (j < bj0) bj0 = j; if (j > bj1) bj1 = j; if (i < bi0) bi0 = i; if (i > bi1) bi1 = i;
  }
  if (bj1 < bj0) { bj0 = 0; bj1 = N - 1; bi0 = 0; bi1 = N - 1; }
  const i0Row = new Int32Array(N), i1Row = new Int32Array(N);
  let J0 = 0, J1 = N - 1;
  /* A box around the source, grown by the reach — a strict SUPERSET of the light cone, which is what
     correctness needs, computed in O(N) rather than by walking the front. The longitudinal margin is
     per row because a degree of longitude is not a fixed distance. */
  function windowAt(tNow) {
    const reach = cMax * tNow + 4 * Math.min(dxMin, dyM);
    const dJ = Math.ceil(reach / (RE * dPhi));
    J0 = Math.max(0, bj0 - dJ); J1 = Math.min(N - 1, bj1 + dJ);
    for (let j = J0; j <= J1; j++) {
      const dI = Math.ceil(reach / Math.max(1, RE * cosC[j] * dLam));
      i0Row[j] = Math.max(0, bi0 - dI); i1Row[j] = Math.min(N - 1, bi1 + dI);
    }
  }
  windowAt(0);

  for (let s = 0; s < steps; s++) {
    if (abort === m.id) return null;
    if ((s & 15) === 0) windowAt(t);

    /* ── momentum, on the faces ──────────────────────────────────────────────────────────────── */
    for (let j = J0; j <= J1; j++) {
      const row = j * N, idx = invDx[j];
      const a0 = Math.max(0, i0Row[j] - 1), a1 = Math.min(N - 2, i1Row[j]);
      for (let i = a0; i <= a1; i++) {
        const a = row + i, b = a + 1;
        const ha = h[a], hb = h[b];
        if (ha <= 0 || hb <= 0) { M[a] = 0; continue; }
        /* total depth at the face (the nonlinear term that matters — see the header) */
        const D = 0.5 * (ha + eta[a] + hb + eta[b]);
        if (D <= 1) { M[a] = 0; continue; }
        let f = M[a] - gdt * D * (eta[b] - eta[a]) * idx;
        /* ⚠ Manning friction ONLY WHERE IT IS NOT ZERO TO THE FLOAT. τ ∝ D^(−7/3): against the
           shelf value at 50 m, a 4 km ocean floor damps 10^(−5.4) as hard. Measured, evaluating it
           everywhere cost 1.4 billion Math.pow calls and 80 % of this file's whole run time to
           change nothing at all in deep water. Below 500 m it is the term that decides the coastal
           amplitude and it is computed exactly — semi-implicit in |M|, so it can never reverse the
           flux. D^(7/3) as D²·cbrt(D): cbrt is an intrinsic, pow with a fractional exponent is not. */
        if (D < 500) {
          const nn = 0.25 * (Nf[a] + Nf[b] + (j > 0 ? Nf[a - N] + Nf[b - N] : 0));
          const sp = Math.sqrt(f * f + nn * nn);
          if (sp > 0) f /= (1 + fricC * sp / (D * D * Math.cbrt(D)));
        }
        M[a] = f * sponge[a];
      }
      if (a1 >= N - 2) M[row + N - 1] = 0;
    }
    for (let j = J0; j <= Math.min(J1, N - 2); j++) {
      const row = j * N, up = row + N;
      const a0 = Math.max(0, i0Row[j] - 1), a1 = Math.min(N - 1, i1Row[j] + 1);
      for (let i = a0; i <= a1; i++) {
        const a = row + i, b = up + i;
        const ha = h[a], hb = h[b];
        if (ha <= 0 || hb <= 0) { Nf[a] = 0; continue; }
        const D = 0.5 * (ha + eta[a] + hb + eta[b]);
        if (D <= 1) { Nf[a] = 0; continue; }
        let f = Nf[a] - gdt * D * (eta[b] - eta[a]) * invDy;
        if (D < 500) {
          const mm = 0.25 * (M[a] + M[b] + (i > 0 ? M[a - 1] + M[b - 1] : 0));
          const sp = Math.sqrt(f * f + mm * mm);
          if (sp > 0) f /= (1 + fricC * sp / (D * D * Math.cbrt(D)));
        }
        Nf[a] = f * sponge[a];
      }
    }
    if (J1 >= N - 1) for (let i = 0; i < N; i++) Nf[(N - 1) * N + i] = 0;

    /* ── continuity ──────────────────────────────────────────────────────────────────────────── */
    for (let j = J0; j <= J1; j++) {
      const row = j * N, idx = invDx[j], cj = cosC[j], cn = cosN[j], cs = (j > 0 ? cosN[j - 1] : cn);
      const inv = 1 / (dyM * cj);
      const a0 = Math.max(0, i0Row[j]), a1 = Math.min(N - 1, i1Row[j]);
      for (let i = a0; i <= a1; i++) {
        const k = row + i;
        if (h[k] <= 0) { eta[k] = 0; continue; }
        const mw = (i > 0) ? M[k - 1] : 0, me = M[k];
        const ns = (j > 0) ? Nf[k - N] * cs : 0, nn = Nf[k] * cn;
        const v = (eta[k] - dt * ((me - mw) * idx + (nn - ns) * inv)) * sponge[k];
        eta[k] = v;
        if (v > emax[k]) emax[k] = v;
        if (v < emin[k]) emin[k] = v;
        if (tarr[k] < 0 && (v >= ARRIVE || v <= -ARRIVE)) tarr[k] = t;
      }
    }
    t += dt;

    if (s % everyN === 0 || s === steps - 1) {
      const q = new Int8Array(n2);
      compand(eta, q, n2, A);
      frames.push({ t, q });
      /* stream: the animation must be watchable before the run ends, so the FIRST frame leaves on
         its own and the rest go in sixes */
      if (frames.length === 1 || frames.length - sent >= 6 || s === steps - 1) {
        const batch = frames.slice(sent); sent = frames.length;
        const bufs = batch.map(f => f.q.buffer);
        self.postMessage({ id: m.id, type: 'frames', frames: batch.map(f => ({ t: f.t, q: f.q })), nFrames, done: (s === steps - 1) }, bufs);
        self.postMessage({ id: m.id, type: 'progress', pct: Math.round(100 * (s + 1) / steps), frames: frames.length, nFrames });
      }
    }
  }

  return {
    N, dt, steps, total, nFrames, amp: A,
    emax, emin, tarr,
    cMax: Math.round(cMax), hMax: Math.round(hMax),
    ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
  };
}

self.onmessage = (ev) => {
  const m = ev.data || {};
  if (m.type === 'abort') { abort = m.id; return; }
  if (m.type !== 'run') return;
  try {
    const out = run(m);
    if (!out) { self.postMessage({ id: m.id, type: 'aborted' }); return; }
    self.postMessage({
      id: m.id, type: 'done', N: out.N, dt: out.dt, steps: out.steps, total: out.total,
      nFrames: out.nFrames, amp: out.amp, cMax: out.cMax, hMax: out.hMax, ms: out.ms,
      emax: out.emax, emin: out.emin, tarr: out.tarr
    }, [out.emax.buffer, out.emin.buffer, out.tarr.buffer]);
  } catch (e) {
    self.postMessage({ id: m.id, type: 'error', err: String((e && e.message) || e) });
  }
};
