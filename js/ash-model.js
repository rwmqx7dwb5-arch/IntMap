/* ============================================================================
 *  IntMap · THE VOLCANIC-ASH MODEL, AS PHYSICS — ASH  (science-instruments)
 * ----------------------------------------------------------------------------
 *  「もし今この火山が噴火したら、灰はどこへ行くか」— the question a volcano card could not answer.
 *  The card said what the volcano HAS done (GVP's record), what agencies SAY it is doing (the status
 *  ladder) and what aviation has IN FORCE (SIGMET). It could not say where the ash of an eruption
 *  starting now would go, because nothing in IntMap carried ash through the upper air.
 *
 *  js/ash-plume.js owns the panel, the layers and the animation. THIS file owns the model and
 *  touches no DOM and no window global, so the same code runs under `node --test`
 *  (tests/science-instruments-checks.test.mjs) — the js/radiation-model.js arrangement.
 *
 *  ══ WHAT IS PUBLISHED SCIENCE AND WHAT IS AN ASSUMPTION — each one is printed on screen ══════════
 *  PUBLISHED
 *   · Eruption source parameters (column height, duration, fine-ash fraction m63) — the eruption
 *     types of Mastin et al. (2009), J. Volcanol. Geotherm. Res. 186:10–21, Table 3. The table assigns
 *     S0 to silicic and M0 to mafic volcanoes by default; so does `styleForRock` below.
 *   · Mass eruption rate FROM column height — the same paper's fit H = 2.00·V^0.241 (H km above the
 *     vent, V dense-rock m³/s, ρ_DRE 2500 kg/m³). VAACs use exactly this to turn an observed height
 *     into a source strength. ⚠ The eruptions the fit is made from scatter around it by a factor of
 *     several, and the panel says so — the MER is the least certain number in the run.
 *   · Vertical distribution of the release — Suzuki (1983) with A = 4, λ = 1 (most mass in the upper
 *     quarter of the column, none at the top).
 *   · Settling — Ganser (1993) drag for non-spherical particles in the ICAO standard atmosphere.
 *   · Horizontal turbulence — HYSPLIT's deformation (Smagorinsky) diffusivity, c = 0.14, computed
 *     from the wind field's own shear at the particle's level (Draxler & Hess 1998).
 *   · Airborne concentration thresholds 0.2 / 2 / 4 mg/m³ and the flight-level bands SFC–FL200 /
 *     FL200–350 / FL350–550 — the London VAAC concentration charts introduced in 2010.
 *   · The distal fine-ash fraction 5 % of the erupted mass — Webster et al. (2012), JGR 117 D00U08,
 *     the value the UK Met Office's NAME model used for Eyjafjallajökull.
 *  ASSUMED (stated, adjustable or named in the report)
 *   · Grain-size distribution: Gaussian in φ, σφ = 2, with its median CHOSEN so that the fraction
 *     finer than 63 µm equals the type's m63 — so it is derived from the published m63, but the
 *     spread is ours.
 *   · Grain density: 1000 kg/m³ at φ ≤ −1 rising linearly to 2500 kg/m³ at φ ≥ 4 (vesicular pumice
 *     coarse, dense glass fine), sphericity ψ = 0.7.
 *   · Deposit bulk density 1000 kg/m³, so 1 kg/m² is 1 mm.
 *   · Pressure levels are placed at their ICAO standard-atmosphere heights (±~300 m in practice).
 *  NOT MODELLED (and therefore not claimed)
 *   · Aggregation: the fine ash that is not distal is not deposited by this model — it is reported
 *     as mass the run does not place. Wet removal by rain. Plume-wind interaction (bent-over plumes):
 *     the column is vertical. Gravitational spreading of the umbrella cloud.
 * ==========================================================================*/

export const ASH = (function () {
  'use strict';

  const G = 9.80665, R_AIR = 287.05, DEG_M = 111320;
  const RHO_DRE = 2500;          /* kg/m³ — Mastin et al. 2009 */
  const RHO_DEPOSIT = 1000;      /* kg/m³ — assumed bulk density of a fresh fall deposit */
  const SIGMA_PHI = 2;           /* assumed spread of the grain-size distribution */
  const SPHERICITY = 0.7;        /* assumed */
  const SUZUKI_A = 4, SUZUKI_L = 1;
  const SMAG_C = 0.14;           /* HYSPLIT */
  const KZ_FREE = 1;             /* m²/s — free-tropospheric vertical diffusivity, as js/radiation-model.js */
  const FT_M = 0.3048;

  /* ── the eruption types — Mastin et al. (2009) Table 3, the rows this panel offers ─────────────
     h km above the vent, hours of eruption, m63 the mass fraction finer than 63 µm. `ex` is the
     eruption the paper names as the type's example. The words a reader sees are js/ash-plume.js's (this file names no language). */
  const STYLES = {
    M1: { h: 2,  hours: 100, m63: 0.02, ex: 'Etna 2001' },
    M0: { h: 7,  hours: 60,  m63: 0.05, ex: 'Cerro Negro 1992' },
    S1: { h: 5,  hours: 12,  m63: 0.1,  ex: 'Ruapehu 1996' },
    S0: { h: 11, hours: 3,   m63: 0.4,  ex: 'Spurr 1992' },
    S3: { h: 15, hours: 8,   m63: 0.5,  ex: 'St Helens 1980-05-18' },
  };
  /* GVP's dominant-rock vocabulary (data/volcanoes_gvp.json `rocks`) → Mastin's composition class.
     Only the basaltic families are mafic; every other entry in that list is intermediate or silicic,
     which Mastin's assignment treats as silicic. A rock the list does not hold returns null — the
     panel then asks rather than picking. */
  function styleForRock(rock) {
    const s = String(rock || '').toLowerCase();
    if (!s) return null;
    if (/^(basalt|trachybasalt|foidite)/.test(s)) return 'M0';
    if (/(andesite|dacite|rhyolite|trachyte|phonolite|phono-tephrite|trachyandesite)/.test(s)) return 'S0';
    return null;
  }

  /* ── Mastin's fit, both ways ─────────────────────────────────────────────────────────────── */
  function merFromHeight(hKm) { const V = Math.pow(Math.max(0.1, hKm) / 2.0, 1 / 0.241); return V * RHO_DRE; }
  function heightFromMer(mer) { return 2.0 * Math.pow(Math.max(1e-9, mer) / RHO_DRE, 0.241); }

  /* ── the ICAO standard atmosphere ─────────────────────────────────────────────────────────── */
  function isa(z) {
    z = Math.max(-500, Math.min(32000, z));
    let T, p;
    if (z <= 11000) { T = 288.15 - 0.0065 * z; p = 1013.25 * Math.pow(T / 288.15, 5.25588); }
    else if (z <= 20000) { T = 216.65; p = 226.321 * Math.exp(-(z - 11000) * G / (R_AIR * T)); }
    else { T = 216.65 + 0.001 * (z - 20000); p = 54.7489 * Math.pow(T / 216.65, -34.1632); }
    const rho = p * 100 / (R_AIR * T), mu = 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4);
    return { T, p, rho, mu };
  }
  function pressureHeight(pHpa) {
    if (pHpa >= 226.321) return 288.15 / 0.0065 * (1 - Math.pow(pHpa / 1013.25, 1 / 5.25588));
    if (pHpa >= 54.7489) return 11000 + R_AIR * 216.65 / G * Math.log(226.321 / pHpa);
    return 20000 + 216.65 / 0.001 * (Math.pow(pHpa / 54.7489, -1 / 34.1632) - 1);
  }
  /* the levels asked of the provider — 850 hPa (~1.5 km) to 50 hPa (~20.6 km) */
  const LEVELS = [850, 700, 500, 400, 300, 250, 200, 150, 100, 70, 50];
  const LEVEL_Z = LEVELS.map(pressureHeight);

  /* ── settling: Ganser (1993) ──────────────────────────────────────────────────────────────── */
  const K1 = 1 / (1 / 3 + (2 / 3) / Math.sqrt(SPHERICITY));
  const K2 = Math.pow(10, 1.8148 * Math.pow(-Math.log10(SPHERICITY), 0.5743));
  function dragCoeff(Re) {
    const r = Math.max(1e-9, Re * K1 * K2);
    return K2 * (24 / r * (1 + 0.1118 * Math.pow(r, 0.6567)) + 0.4305 / (1 + 3305 / r));
  }
  function settlingVelocity(d, rhoP, z) {
    const a = isa(z), dr = Math.max(1, rhoP - a.rho);
    let lo = 0, hi = 400;
    for (let i = 0; i < 70; i++) {
      const v = (lo + hi) / 2, Re = a.rho * v * d / a.mu;
      const drag = 0.75 * dragCoeff(Re) * a.rho * v * v / d;
      if (drag > G * dr) hi = v; else lo = v;
    }
    return (lo + hi) / 2;
  }

  /* ── the grain-size distribution ──────────────────────────────────────────────────────────── */
  function erf(x) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
  const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
  function invPhi(p) { let lo = -8, hi = 8; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (Phi(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; }
  const phiToM = (phi) => Math.pow(2, -phi) / 1000;
  const grainDensity = (phi) => phi <= -1 ? 1000 : phi >= 4 ? 2500 : 1000 + (phi + 1) / 5 * 1500;
  /* bins of 1 φ. Coarse: −3…4 (8 mm–63 µm, the coarsest bin also takes everything coarser than 8 mm,
     which lands within a few kilometres of the vent). Fine: 4…8 (63–4 µm). */
  function tgsd(m63) {
    const m = Math.min(0.95, Math.max(0.005, +m63 || 0.05));
    const md = 4 - SIGMA_PHI * invPhi(1 - m);
    const cdf = (phi) => Phi((phi - md) / SIGMA_PHI);
    const coarse = [], fine = [];
    for (let a = -3; a < 4; a++) { const f = (a === -3 ? cdf(a + 1) : cdf(a + 1) - cdf(a)); const phi = a + 0.5;
      coarse.push({ phi, d: phiToM(phi), rho: grainDensity(phi), frac: f }); }
    for (let a = 4; a < 8; a++) { const f = (a === 7 ? 1 - cdf(a) : cdf(a + 1) - cdf(a)); const phi = a + 0.5;
      fine.push({ phi, d: phiToM(phi), rho: grainDensity(phi), frac: f }); }
    return { md, m63: m, coarse, fine };
  }

  /* ── Suzuki (1983) ────────────────────────────────────────────────────────────────────────── */
  function suzuki(x) { return x >= 1 ? 0 : Math.pow((1 - x) * Math.exp(SUZUKI_A * (x - 1)), SUZUKI_L); }
  const SUZUKI_MAX = suzuki(1 - 1 / SUZUKI_A);
  function sampleSuzuki(rnd) { for (;;) { const x = rnd(); if (rnd() * SUZUKI_MAX <= suzuki(x)) return x; } }

  /* ── seeded randomness: a run is a function of its arguments AND its seed, and the seed is printed */
  function rng(seed) { let s = (seed >>> 0) || 1;
    return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gaussFrom(rnd) { return function () { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }; }

  /* ── the grid plan ────────────────────────────────────────────────────────────────────────────
     Two nests, as in js/radiation-model.js: a fine inner one over the near field and an outer one
     sized from the upper-air wind the inner one measured. ⚠ The point counts are a BUDGET, measured:
     121 locations × 22 hourly pressure-level variables × 4 days answered in 10.3 s (1.6 MB) from
     this machine on 2026-10-03. Expires if Open-Meteo changes its billing or its latency. */
  const INNER = { n: 9, half: 3 };          /* 0.75° spacing */
  const OUTER_N = 11, OUTER_MAX_HALF = 30;
  function innerPlan(cx, cy) { return { n: INNER.n, half: INNER.half, cx, cy }; }
  function outerPlan(cx, cy, meanSpeed, hours) {
    const reachKm = Math.max(800, (meanSpeed || 15) * hours * 3.6 * 1.4);
    return { n: OUTER_N, half: Math.min(OUTER_MAX_HALF, Math.max(INNER.half * 2.5, reachKm / 111)), cx, cy };
  }
  function planPoints(plan) {
    const lons = [], lats = [], LO = [], LA = [];
    for (let i = 0; i < plan.n; i++) lons.push(plan.cx - plan.half + 2 * plan.half * i / (plan.n - 1));
    for (let j = 0; j < plan.n; j++) lats.push(Math.max(-89.5, Math.min(89.5, plan.cy - plan.half + 2 * plan.half * j / (plan.n - 1))));
    for (let j = 0; j < plan.n; j++) for (let i = 0; i < plan.n; i++) { LO.push(+lons[i].toFixed(3)); LA.push(+lats[j].toFixed(3)); }
    return { lons, lats, LO, LA };
  }
  function hourlyVars() { const v = []; for (const l of LEVELS) v.push('wind_speed_' + l + 'hPa', 'wind_direction_' + l + 'hPa'); return v.join(','); }
  function resolveStart(times, startISO) {
    if (!times || !times.length) return 0;
    const want = new Date(startISO).getTime(); let best = 0, bd = Infinity;
    for (let i = 0; i < times.length; i++) { const d = Math.abs(new Date(String(times[i]) + 'Z').getTime() - want); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  /* One nest from an Open-Meteo multi-location answer. Returns null when the provider answered
     without wind (a body of nulls is not a calm). */
  function buildNest(plan, json, h0, hN) {
    const arr = Array.isArray(json) ? json : [json];
    if (!arr.length || !arr[0] || !arr[0].hourly) return null;
    const { lons, lats } = planPoints(plan);
    const times = arr[0].hourly.time || [];
    const H = Math.max(0, Math.min(times.length - h0, hN));
    if (H < 2) return null;
    const N = plan.n * plan.n, L = LEVELS.length;
    const u = [], v = []; let seen = 0;
    for (let l = 0; l < L; l++) { const uh = [], vh = []; for (let h = 0; h < H; h++) { uh.push(new Float32Array(N)); vh.push(new Float32Array(N)); } u.push(uh); v.push(vh); }
    const elev = new Float32Array(N);
    arr.forEach((loc, idx) => {
      const hh = (loc && loc.hourly) || {};
      elev[idx] = isFinite(+loc.elevation) ? Math.max(0, +loc.elevation) : 0;
      for (let l = 0; l < L; l++) {
        const sp = hh['wind_speed_' + LEVELS[l] + 'hPa'] || [], dr = hh['wind_direction_' + LEVELS[l] + 'hPa'] || [];
        for (let h = 0; h < H; h++) {
          const s0 = sp[h0 + h], d0 = dr[h0 + h];
          if (s0 == null || d0 == null) continue; seen++;
          const s = +s0, d = +d0 * Math.PI / 180;
          u[l][h][idx] = -s * Math.sin(d); v[l][h][idx] = -s * Math.cos(d);
        }
      }
    });
    if (!seen) return null;
    return { n: plan.n, half: plan.half, lon0: lons[0], lat0: lats[0],
      dLon: 2 * plan.half / (plan.n - 1), dLat: (lats[plan.n - 1] - lats[0]) / (plan.n - 1), H, u, v, elev };
  }
  function locate(g, lng, lat) {
    const fx = (lng - g.lon0) / g.dLon, fy = (lat - g.lat0) / g.dLat;
    if (!(fx >= 0 && fx <= g.n - 1 && fy >= 0 && fy <= g.n - 1)) return null;
    const i0 = Math.min(g.n - 2, Math.floor(fx)), j0 = Math.min(g.n - 2, Math.floor(fy));
    return { i0, j0, tx: fx - i0, ty: fy - j0, fx, fy };
  }
  function bil(g, A, p) { const n = g.n, a = A[p.j0 * n + p.i0], b = A[p.j0 * n + p.i0 + 1], c = A[(p.j0 + 1) * n + p.i0], d = A[(p.j0 + 1) * n + p.i0 + 1];
    return a * (1 - p.tx) * (1 - p.ty) + b * p.tx * (1 - p.ty) + c * (1 - p.tx) * p.ty + d * p.tx * p.ty; }
  function blendOf(g, p) { return Math.max(0, Math.min(1, Math.min(p.fx, g.n - 1 - p.fx, p.fy, g.n - 1 - p.fy))); }
  function levelPair(z) {
    if (z <= LEVEL_Z[0]) return { l0: 0, l1: 0, w: 0 };
    const L = LEVELS.length; if (z >= LEVEL_Z[L - 1]) return { l0: L - 1, l1: L - 1, w: 0 };
    let l = 0; while (l < L - 2 && z > LEVEL_Z[l + 1]) l++;
    return { l0: l, l1: l + 1, w: (z - LEVEL_Z[l]) / (LEVEL_Z[l + 1] - LEVEL_Z[l]) };
  }
  /* The wind at a height (m above sea level) and the deformation diffusivity there. Held constant
     below 850 hPa and above 50 hPa — the panel reports how much mass ever stood above the top level. */
  /* The deformation diffusivity of one grid cell at one level and hour — computed once and kept
     (it is a property of the field, not of the particle), so a run pays for it per cell, not per step. */
  function cellKh(g, l, h, i, j, lat) {
    const key = (l * g.H + h) * g.n * g.n + j * g.n + i;
    if (!g.kh) g.kh = new Map();
    const hit = g.kh.get(key); if (hit !== undefined) return hit;
    const A = g.u[l][h], B = g.v[l][h], n = g.n;
    const dx = g.dLon * DEG_M * Math.max(0.05, Math.cos(lat * Math.PI / 180)), dy = Math.abs(g.dLat) * DEG_M;
    const dudx = ((A[j * n + i + 1] - A[j * n + i]) + (A[(j + 1) * n + i + 1] - A[(j + 1) * n + i])) / (2 * dx);
    const dvdx = ((B[j * n + i + 1] - B[j * n + i]) + (B[(j + 1) * n + i + 1] - B[(j + 1) * n + i])) / (2 * dx);
    const dudy = ((A[(j + 1) * n + i] - A[j * n + i]) + (A[(j + 1) * n + i + 1] - A[j * n + i + 1])) / (2 * dy);
    const dvdy = ((B[(j + 1) * n + i] - B[j * n + i]) + (B[(j + 1) * n + i + 1] - B[j * n + i + 1])) / (2 * dy);
    const D = Math.sqrt((dvdx + dudy) * (dvdx + dudy) + (dudx - dvdy) * (dudx - dvdy));
    const kh = Math.SQRT1_2 * (SMAG_C * SMAG_C * dx * dy) * D;
    g.kh.set(key, kh); return kh;
  }
  function sampleNest(g, lng, lat, hh, lp, out) {
    const p = locate(g, lng, lat); if (!p) return false;
    const h = hh < 0 ? 0 : (hh > g.H - 1 ? g.H - 1 : hh);
    const w = lp.w, u0 = bil(g, g.u[lp.l0][h], p), v0 = bil(g, g.v[lp.l0][h], p);
    out.u = w ? u0 * (1 - w) + bil(g, g.u[lp.l1][h], p) * w : u0;
    out.v = w ? v0 * (1 - w) + bil(g, g.v[lp.l1][h], p) * w : v0;
    out.kh = cellKh(g, w < 0.5 ? lp.l0 : lp.l1, h, p.i0, p.j0, g.lat0 + (p.j0 + 0.5) * g.dLat);
    out.ground = bil(g, g.elev, p); out.blend = blendOf(g, p);
    return true;
  }
  const _A = {}, _B = {};
  function windAt(F, lng, lat, h, z) {
    const lp = levelPair(z), hh = Math.floor(h);
    const a = sampleNest(F.inner, lng, lat, hh, lp, _A);
    if (a && _A.blend >= 1) return { u: _A.u, v: _A.v, kh: _A.kh, ground: _A.ground };
    const b = F.outer && F.outer !== F.inner ? sampleNest(F.outer, lng, lat, hh, lp, _B) : false;
    if (!a && !b) return null;
    if (!a) return { u: _B.u, v: _B.v, kh: _B.kh, ground: _B.ground };
    if (!b) return { u: _A.u, v: _A.v, kh: _A.kh, ground: _A.ground };
    const w = _A.blend, m = (x, y) => x * w + y * (1 - w);
    return { u: m(_A.u, _B.u), v: m(_A.v, _B.v), kh: m(_A.kh, _B.kh), ground: m(_A.ground, _B.ground) };
  }

  /* ── outputs: the ladders ─────────────────────────────────────────────────────────────────── */
  const CONC_BANDS = [0.2, 2, 4];                         /* mg/m³ — London VAAC 2010 */
  const FL_BANDS = [[0, 200], [200, 350], [350, 550]];    /* flight levels */
  const DEPOSIT_BANDS = [0.1, 1, 10, 100];                /* mm */
  const DEP_CELL = 0.05, CONC_CELL = 0.5;

  /* ══ THE SOLVE ══════════════════════════════════════════════════════════════════════════════
     opts: { lng, lat, ventM, hKm, hours (eruption duration), window (hours tracked), m63,
             distalFrac, seed, nCoarse, nFine, dtS }
     hooks.yieldEvery(fraction done) → a promise to await, so a page thread can stay responsive (the loop is cut
     by TIME, not by count — [[intmap-sync-loop-cannot-be-cancelled]]); hooks.cancelled() → true stops. */
  async function solve(F, opts, hooks) {
    hooks = hooks || {};
    const o = Object.assign({ hKm: 11, hours: 3, window: 24, m63: 0.4, distalFrac: 0.05, seed: 1, nCoarse: 12000, nFine: 8000, dtS: 600, ventM: 0 }, opts || {});
    const rnd = rng(o.seed), gauss = gaussFrom(rnd);
    const mer = merFromHeight(o.hKm), total = mer * o.hours * 3600;
    const dist = tgsd(o.m63);
    const distal = Math.min(o.distalFrac, dist.m63);
    const topZ = o.ventM + o.hKm * 1000;
    const steps = Math.ceil(o.window * 3600 / o.dtS);

    /* settling-velocity tables, every 500 m up to 32 km, per bin */
    const ZT = []; for (let z = 0; z <= 32000; z += 500) ZT.push(z);
    const vtab = (b) => ZT.map((z) => settlingVelocity(b.d, b.rho, z));
    const vsAt = (tab, z) => { const k = Math.max(0, Math.min(ZT.length - 1.001, z / 500)), i = Math.floor(k), t = k - i; return tab[i] * (1 - t) + tab[Math.min(ZT.length - 1, i + 1)] * t; };

    /* particles: coarse for the deposit, fine-distal for the cloud */
    const P = [];
    const coarseMass = total * (1 - dist.m63), fineMass = total * distal;
    const make = (bins, n, mass, kind) => {
      const fsum = bins.reduce((s, b) => s + b.frac, 0) || 1;
      for (const b of bins) {
        const k = Math.max(1, Math.round(n * b.frac / fsum)); const tab = vtab(b), m = mass * (b.frac / fsum) / k;
        for (let i = 0; i < k; i++) P.push({ kind, tab, m, phi: b.phi, t0: rnd() * o.hours * 3600,
          lng: o.lng, lat: o.lat, z: o.ventM + sampleSuzuki(rnd) * o.hKm * 1000, st: 0 });
      }
    };
    make(dist.coarse, o.nCoarse, coarseMass, 1);
    make(dist.fine, o.nFine, fineMass, 2);

    const dep = new Map();          /* cell → [kg, particles] */
    const snaps = [];               /* hourly: { h, cells: Map(key → [kg per band ×3, n per band ×3]) } */
    let depositedMass = 0, escapedMass = 0, aboveTopMass = 0;
    let lastYield = Date.now();
    const DEG = Math.PI / 180;
    for (let s = 0; s < steps; s++) {
      if (hooks.cancelled && hooks.cancelled()) return null;
      const t = s * o.dtS, hNow = t / 3600;
      for (const p of P) {
        if (p.st || p.t0 > t) continue;
        const dt = o.dtS;
        const w = windAt(F, p.lng, p.lat, hNow, p.z);
        if (!w) { p.st = 2; escapedMass += p.m; continue; }
        if (p.z > LEVEL_Z[LEVEL_Z.length - 1] && !p.above) { p.above = 1; aboveTopMass += p.m; }
        const sig = Math.sqrt(2 * Math.max(0, w.kh) * dt);
        const mLon = DEG_M * Math.max(0.05, Math.cos(p.lat * DEG));
        p.lng += (w.u * dt + gauss() * sig) / mLon; p.lat += (w.v * dt + gauss() * sig) / DEG_M;
        if (p.lng > 180) p.lng -= 360; else if (p.lng < -180) p.lng += 360;
        p.z += -vsAt(p.tab, p.z) * dt + gauss() * Math.sqrt(2 * KZ_FREE * dt);
        if (p.z <= w.ground) {
          p.st = 1; depositedMass += p.m;
          if (p.kind === 1) { const key = Math.floor(p.lng / DEP_CELL) + ':' + Math.floor(p.lat / DEP_CELL); const c = dep.get(key) || [0, 0]; c[0] += p.m; c[1]++; dep.set(key, c); }
        }
      }
      /* the hourly snapshot of the distal cloud */
      const tEnd = t + o.dtS;
      if (Math.floor(tEnd / 3600) > Math.floor(t / 3600)) {
        const cells = new Map();
        for (const p of P) {
          if (p.kind !== 2 || p.st || p.t0 > tEnd) continue;
          const fl = p.z / FT_M / 100; let b = -1;
          for (let k = 0; k < FL_BANDS.length; k++) if (fl >= FL_BANDS[k][0] && fl < FL_BANDS[k][1]) { b = k; break; }
          if (b < 0) continue;
          const key = Math.floor(p.lng / CONC_CELL) + ':' + Math.floor(p.lat / CONC_CELL);
          const c = cells.get(key) || [0, 0, 0, 0, 0, 0]; c[b] += p.m; c[3 + b]++; cells.set(key, c);
        }
        snaps.push({ h: Math.round(tEnd / 3600), cells });
      }
      if (hooks.yieldEvery && Date.now() - lastYield > 12) { await hooks.yieldEvery((s + 1) / steps); lastYield = Date.now(); }
    }

    /* deposit cells → mm */
    const depCells = []; let peak = null;
    for (const [key, c] of dep) {
      const [ix, iy] = key.split(':').map(Number);
      const latC = (iy + 0.5) * DEP_CELL, area = Math.pow(DEP_CELL * DEG_M, 2) * Math.max(0.05, Math.cos(latC * DEG));
      const mm = c[0] / area * 1000 / RHO_DEPOSIT;
      depCells.push({ ix, iy, mm, n: c[1] });
      if (c[1] >= 5 && (!peak || mm > peak.mm)) peak = { mm, n: c[1], lng: (ix + 0.5) * DEP_CELL, lat: latC };
    }
    const bandKm2 = DEPOSIT_BANDS.map((b) => depCells.reduce((s, c) => s + (c.mm >= b ? Math.pow(DEP_CELL * 111.32, 2) * Math.max(0.05, Math.cos((c.iy + 0.5) * DEP_CELL * DEG)) : 0), 0));
    /* concentration snapshots → mg/m³ per band */
    const thick = FL_BANDS.map((b) => (b[1] - b[0]) * 100 * FT_M);
    const concSnaps = snaps.map((sn) => {
      const out = []; let peakB = [0, 0, 0];
      for (const [key, c] of sn.cells) {
        const [ix, iy] = key.split(':').map(Number);
        const latC = (iy + 0.5) * CONC_CELL, area = Math.pow(CONC_CELL * DEG_M, 2) * Math.max(0.05, Math.cos(latC * DEG));
        const mg = [0, 1, 2].map((b) => c[b] * 1e6 / (area * thick[b]));
        out.push({ ix, iy, mg, n: [c[3], c[4], c[5]] });
        for (let b = 0; b < 3; b++) if (c[3 + b] >= 3) peakB[b] = Math.max(peakB[b], mg[b]);
      }
      return { h: sn.h, cells: out, peak: peakB };
    });
    let airborne = 0; for (const p of P) if (!p.st && p.t0 <= steps * o.dtS) airborne += p.m;
    return {
      ok: true, mer, totalKg: total, coarseKg: coarseMass, distalKg: fineMass,
      notPlacedKg: total * (dist.m63 - distal),   /* the non-distal fine ash: aggregation is not modelled */
      md: dist.md, distal, m63: dist.m63, topZ,
      depositedKg: depositedMass, escapedKg: escapedMass, airborneKg: airborne, aboveTopKg: aboveTopMass,
      deposit: depCells, peak, bandKm2, depCell: DEP_CELL,
      conc: concSnaps, concCell: CONC_CELL, steps, seed: o.seed,
      particles: P.length,
    };
  }

  /* What ground deposit a point stands under (mm) — exposure is read off the same cells the map draws. */
  function depositAt(res, lng, lat) {
    if (!res || !res._idx) { res._idx = new Map(); for (const c of res.deposit) res._idx.set(c.ix + ':' + c.iy, c); }
    const c = res._idx.get(Math.floor(lng / res.depCell) + ':' + Math.floor(lat / res.depCell));
    return c ? c.mm : 0;
  }

  return {
    STYLES, LEVELS, LEVEL_Z, CONC_BANDS, FL_BANDS, DEPOSIT_BANDS, RHO_DRE, RHO_DEPOSIT, SIGMA_PHI, SPHERICITY, SMAG_C,
    styleForRock, merFromHeight, heightFromMer, isa, pressureHeight, settlingVelocity, tgsd, suzuki, sampleSuzuki, rng,
    innerPlan, outerPlan, planPoints, hourlyVars, resolveStart, buildNest, windAt, solve, depositAt,
  };
})();
