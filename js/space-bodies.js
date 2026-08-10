/* ============================================================================
 *  IntMap · WHAT ELSE IS OUT THERE — window.IntMapSpaceBodies  (#R213)
 * ----------------------------------------------------------------------------
 *  「宇宙を探索では、Voyager 1 / 2、New Horizons、Parker Solar Probe、各種惑星探査機といった
 *    地球周回衛星以外の衛星の位置を見れるように。」
 *  「宇宙を探索に小惑星、彗星も追加して。」
 *  「太陽系外のはるか遠くまでズームアウトできるように。（太陽系のさらに外の宇宙も見れるように）」
 *
 *  Three populations that js/ephemeris.js does not and should not carry, because none of them is a
 *  closed-form series the way the planets are:
 *
 *    · SPACECRAFT   — sampled trajectories from JPL Horizons (scripts/build-spacecraft.mjs),
 *                     interpolated with a cubic Hermite through position AND velocity.
 *    · SMALL BODIES — osculating Keplerian elements from JPL SBDB (scripts/build-smallbodies.mjs),
 *                     propagated two-body, elliptic OR hyperbolic depending on e.
 *    · DEEP SKY     — SIMBAD positions with MEASURED distances (scripts/build-deepsky.mjs), which is
 *                     what lets the camera keep pulling back past the star catalogue and still see
 *                     something real.
 *
 *  ⚠ WHY THIS IS A SEPARATE FILE FROM js/space.js. js/space.js is the RENDERER — a WebGL context, a
 *  camera and a frame loop. Everything here is arithmetic on a date, has no canvas, and is the part
 *  that has to be verifiable without a browser (tests/r213-checks.test.mjs re-runs the propagation
 *  against published positions). Keeping them apart is also what keeps js/space.js under the #R200
 *  line ceiling.
 *
 *  ⚠ AND THE DATA IS FETCHED ON DEMAND. Nothing here is loaded until the user switches one of these
 *  populations on: the three files are ~950 KB together, which is a fair price for asking to see the
 *  fleet and an unfair one for opening a map.
 * ==========================================================================*/
window.IntMapSpaceBodies = (function () {
  'use strict';

  const D2R = Math.PI / 180;
  const AU_PER_PC = 206264.806;          /* the definition of the parsec, in AU */
  const K_GAUSS = 0.01720209895;         /* Gaussian gravitational constant, rad·AU^1.5/day */
  const OBLIQ = 23.4392911 * D2R;        /* mean obliquity at J2000 (IAU 1976) */

  /* ══ LOADING ═══════════════════════════════════════════════════════════════════════════════════
     One promise per file, kept, so a second switch-on costs nothing and a failure is remembered as
     a failure rather than retried forever. `state()` reports loading/ok/error per population — the
     #R212 rule: a layer that cannot say "still fetching" will eventually print "there is nothing
     there" about data it simply has not got yet. */
  const FILES = { craft: 'data/spacecraft.json', small: 'data/small-bodies.json', deep: 'data/deep-sky.json' };
  const store = { craft: null, small: null, deep: null };
  const status = { craft: 'idle', small: 'idle', deep: 'idle' };
  const pending = {};

  function url(rel) {
    try { return new URL(rel, document.baseURI).toString(); } catch (_) { return rel; }
  }
  function load(which) {
    if (store[which]) return Promise.resolve(store[which]);
    if (pending[which]) return pending[which];
    status[which] = 'loading';
    pending[which] = fetch(url(FILES[which]))
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(j => { store[which] = j; status[which] = 'ok'; prepare(which, j); return j; })
      .catch(e => { status[which] = 'error'; store[which] = null; pending[which] = null; throw e; });
    return pending[which];
  }
  const state = (which) => status[which];
  const ready = (which) => !!store[which];
  const manifest = (which) => store[which] ? {
    source: store[which].source, attribution: store[which].attribution, built: store[which].built,
    method: store[which].method, warn: store[which].warn, count: store[which].count || (store[which].craft || []).length,
  } : null;

  /* one-time derived fields, done at load rather than per frame */
  function prepare(which, j) {
    if (which === 'small') {
      for (const b of j.bodies) {
        /* the mean motion, in degrees/day, derived once. SBDB's `per` is the more accurate figure
           when it is there; Kepler's third law covers the rows where it is not. */
        b._n = (b.per > 0) ? 360 / b.per
          : (b.a > 0 ? (K_GAUSS / Math.pow(b.a, 1.5)) / D2R : null);
        b._rot = rotator(b.i, b.om, b.w);
      }
    } else if (which === 'deep') {
      for (const o of j.objects) o._dir = eqToEcl(o.ra, o.dec);
    }
  }

  /* ══ FRAME ═════════════════════════════════════════════════════════════════════════════════════
     Right ascension / declination are EQUATORIAL. Everything in js/space.js is J2000 ECLIPTIC,
     because that is the frame the planets are computed in. One rotation by the obliquity connects
     them, and doing it here — once, at load — is why nothing downstream has to remember which frame
     a number arrived in. */
  function eqToEcl(raDeg, decDeg) {
    const ra = raDeg * D2R, dec = decDeg * D2R, cd = Math.cos(dec);
    const x = cd * Math.cos(ra), y = cd * Math.sin(ra), z = Math.sin(dec);
    const c = Math.cos(OBLIQ), s = Math.sin(OBLIQ);
    return [x, y * c + z * s, -y * s + z * c];
  }

  /* the classical rotation from the orbital plane into the ecliptic: argument of perihelion,
     inclination, longitude of ascending node. Precomputed per body — it does not depend on time. */
  function rotator(iDeg, omDeg, wDeg) {
    const i = (iDeg || 0) * D2R, om = (omDeg || 0) * D2R, w = (wDeg || 0) * D2R;
    const cw = Math.cos(w), sw = Math.sin(w), co = Math.cos(om), so = Math.sin(om),
      ci = Math.cos(i), si = Math.sin(i);
    return [
      cw * co - sw * so * ci, -sw * co - cw * so * ci,
      cw * so + sw * co * ci, -sw * so + cw * co * ci,
      sw * si, cw * si,
    ];
  }
  const applyRot = (R, xp, yp) => [R[0] * xp + R[1] * yp, R[2] * xp + R[3] * yp, R[4] * xp + R[5] * yp];

  /* ══ KEPLER ════════════════════════════════════════════════════════════════════════════════════
     Three branches, because e < 1, e = 1 and e > 1 are three different curves and pretending
     otherwise is how an interstellar object ends up drawn on an ellipse.

     ⚠ The elliptic solver is Newton with a starting guess that survives e → 1. The naive E₀ = M
     diverges for the near-parabolic comets that make up much of the numbered-comet list, so the
     first guess is Danby's, and a bisection-flavoured clamp keeps a step from throwing E across the
     apse. js/ephemeris.js has its own `kepler()` for the PLANETS, where e ≤ 0.25 and the simple
     iteration is exact enough; these orbits are not that. */
  const wrap2pi = (x) => { const t = x % (2 * Math.PI); return t < 0 ? t + 2 * Math.PI : t; };

  function keplerE(M, e) {
    M = wrap2pi(M);
    let E = (e < 0.8) ? M : Math.PI;
    if (e >= 0.8) {  /* Danby's start — the one that does not fall over near e = 1 */
      const s = Math.sign(Math.sin(M)) || 1;
      E = M + s * 0.85 * e;
    }
    for (let k = 0; k < 60; k++) {
      const f = E - e * Math.sin(E) - M;
      const fp = 1 - e * Math.cos(E);
      let d = -f / (fp || 1e-12);
      if (d > 0.9) d = 0.9; else if (d < -0.9) d = -0.9;
      E += d;
      if (Math.abs(d) < 1e-12) break;
    }
    return E;
  }
  function keplerH(M, e) {
    /* e·sinh H − H = M */
    let H = (Math.abs(M) < 6) ? M / (e - 1 || 1e-6) : Math.sign(M) * Math.log(2 * Math.abs(M) / e + 1.8);
    if (!isFinite(H)) H = Math.sign(M) || 1;
    for (let k = 0; k < 80; k++) {
      const f = e * Math.sinh(H) - H - M;
      const fp = e * Math.cosh(H) - 1;
      let d = -f / (fp || 1e-12);
      if (d > 1) d = 1; else if (d < -1) d = -1;
      H += d;
      if (Math.abs(d) < 1e-12) break;
    }
    return H;
  }

  /* Heliocentric ecliptic position of one small body at a Julian date, in AU.
     Returns null when the row cannot support a propagation rather than guessing one. */
  function smallPos(b, jd) {
    const e = b.e;
    if (!(e >= 0)) return null;
    const R = b._rot || (b._rot = rotator(b.i, b.om, b.w));
    if (Math.abs(e - 1) < 1e-8) {
      /* PARABOLIC — Barker's equation. q and tp are the only meaningful elements here. */
      if (!(b.q > 0) || !isFinite(b.tp)) return null;
      const W = 3 * K_GAUSS / Math.SQRT2 * (jd - b.tp) / Math.pow(b.q, 1.5);
      const y = Math.cbrt(W / 2 + Math.sqrt(W * W / 4 + 1));
      const tanHalf = y - 1 / y;
      const r = b.q * (1 + tanHalf * tanHalf);
      const v = 2 * Math.atan(tanHalf);
      return applyRot(R, r * Math.cos(v), r * Math.sin(v));
    }
    if (e > 1) {
      /* HYPERBOLIC — unbound. No period, no mean anomaly: only q and tp mean anything. */
      if (!(b.q > 0) || !isFinite(b.tp)) return null;
      const a = b.q / (1 - e);                       /* negative, by construction */
      const n = K_GAUSS / Math.sqrt(-a * a * a);     /* rad/day */
      const H = keplerH(n * (jd - b.tp), e);
      const xp = a * (Math.cosh(H) - e);
      const yp = -a * Math.sqrt(e * e - 1) * Math.sinh(H);
      return applyRot(R, xp, yp);
    }
    /* ELLIPTIC. Time of perihelion is preferred over (ma, epoch): it is the reference a comet's
       element set is quoted around, and it stays right when the two disagree. */
    if (!(b.a > 0)) return null;
    const n = b._n || (b._n = 360 / (b.per || (2 * Math.PI / (K_GAUSS / Math.pow(b.a, 1.5))))); /* deg/day */
    let Mdeg;
    if (isFinite(b.tp)) Mdeg = n * (jd - b.tp);
    else if (isFinite(b.ma) && isFinite(b.ep)) Mdeg = b.ma + n * (jd - b.ep);
    else return null;
    const E = keplerE(Mdeg * D2R, e);
    const xp = b.a * (Math.cos(E) - e);
    const yp = b.a * Math.sqrt(1 - e * e) * Math.sin(E);
    return applyRot(R, xp, yp);
  }

  /* ══ HERMITE ═══════════════════════════════════════════════════════════════════════════════════
     A trajectory sample carries position AND velocity, so the interpolant can match both ends'
     slope. That is the whole reason the bundled file is small: a chord between two 90-day Voyager
     samples would cut a visible corner; a Hermite through the velocities does not. */
  function hermite(s, jd) {
    const n = s.length;
    if (!n) return null;
    if (jd <= s[0][0]) return { p: [s[0][1], s[0][2], s[0][3]], edge: -1 };
    if (jd >= s[n - 1][0]) return { p: [s[n - 1][1], s[n - 1][2], s[n - 1][3]], edge: 1 };
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid][0] <= jd) lo = mid; else hi = mid; }
    const A = s[lo], B = s[hi], h = B[0] - A[0];
    if (!(h > 0)) return { p: [A[1], A[2], A[3]], edge: 0 };
    const t = (jd - A[0]) / h, t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    const p = [0, 0, 0];
    for (let k = 0; k < 3; k++) p[k] = h00 * A[1 + k] + h10 * h * A[4 + k] + h01 * B[1 + k] + h11 * h * B[4 + k];
    return { p, edge: 0 };
  }

  /* ══ PUBLIC — SPACECRAFT ═══════════════════════════════════════════════════════════════════════ */
  function craftAt(jd) {
    const j = store.craft; if (!j) return [];
    const out = [];
    for (const c of j.craft) {
      const h = hermite(c.s, jd);
      if (!h) continue;
      /* ⚠ OUTSIDE THE KERNEL IS NOT A POSITION. Horizons' SPK covers a stated interval; past its end
         the honest answer is "this file does not say", not the last sample repeated silently. It is
         still returned — with `edge` set — so the UI can grey it and say why. */
      out.push({
        key: c.key, en: c.en, ja: c.ja, agency: c.agency, launched: c.launched, contact: c.contact,
        en_note: c.en_note, ja_note: c.ja_note, spanFrom: c.spanFrom, spanTo: c.spanTo,
        pos: h.p, outside: h.edge !== 0,
        au: Math.hypot(h.p[0], h.p[1], h.p[2]),
      });
    }
    out.sort((a, b) => a.au - b.au);
    return out;
  }
  /* the flown path, as scene-ready AU points — the samples themselves, clipped to a window, because
     the samples ARE the trajectory and re-deriving them would only add error */
  function craftTrail(key, jdFrom, jdTo) {
    const j = store.craft; if (!j) return null;
    const c = j.craft.find(x => x.key === key); if (!c) return null;
    const pts = [];
    for (const s of c.s) { if (s[0] < jdFrom || s[0] > jdTo) continue; pts.push([s[1], s[2], s[3]]); }
    return pts.length > 1 ? pts : null;
  }
  const craftList = () => (store.craft ? store.craft.craft.map(c => ({ key: c.key, en: c.en, ja: c.ja, contact: c.contact })) : []);

  /* ══ PUBLIC — SMALL BODIES ═════════════════════════════════════════════════════════════════════
     `kinds` selects populations, `limit` caps how many are returned, and the cap is applied to a
     list already sorted by absolute magnitude so "the first 400" means "the 400 biggest", not
     "whatever the file happened to list first". */
  function smallAt(jd, opt) {
    const j = store.small; if (!j) return [];
    const o = opt || {};
    const kinds = o.kinds ? new Set([].concat(o.kinds)) : null;
    const rows = [];
    for (const b of j.bodies) {
      if (kinds && !kinds.has(b.kind)) continue;
      if (o.pickOnly && !b.pick) continue;
      const p = smallPos(b, jd);
      if (!p) continue;
      rows.push({ id: b.id, full: b.full, name: b.name, kind: b.kind, cls: b.cls,
        H: b.H, d: b.d, alb: b.alb, a: b.a, e: b.e, i: b.i, per: b.per, q: b.q, pick: !!b.pick,
        pos: p, au: Math.hypot(p[0], p[1], p[2]) });
    }
    /* brightest (smallest H) first; a body with no H sorts last rather than at the top */
    rows.sort((x, y) => (x.H == null ? 99 : x.H) - (y.H == null ? 99 : y.H));
    return (o.limit > 0) ? rows.slice(0, o.limit) : rows;
  }
  /* one orbit as a closed curve, sampled in TRUE anomaly so the fast perihelion end is not sparse.
     Unbound orbits have no closed curve: they get an arc around the epoch instead, and say so. */
  function smallOrbit(b, jd, N) {
    const n = N || 180;
    const R = b._rot || rotator(b.i, b.om, b.w);
    const pts = [];
    if (b.e < 1 && b.a > 0) {
      for (let k = 0; k <= n; k++) {
        const E = k / n * 2 * Math.PI;
        pts.push(applyRot(R, b.a * (Math.cos(E) - b.e), b.a * Math.sqrt(1 - b.e * b.e) * Math.sin(E)));
      }
      return { pts, closed: true };
    }
    if (!(b.q > 0) || !isFinite(b.tp)) return null;
    const span = 3650;   /* ten years either side of the date being shown */
    for (let k = 0; k <= n; k++) {
      const p = smallPos(b, jd - span + 2 * span * k / n);
      if (p) pts.push(p);
    }
    return pts.length > 1 ? { pts, closed: false } : null;
  }
  const smallFind = (id) => (store.small ? store.small.bodies.find(b => b.id === id) || null : null);
  const smallCounts = () => {
    const j = store.small; if (!j) return null;
    const k = {}; for (const b of j.bodies) k[b.kind] = (k[b.kind] || 0) + 1; return k;
  };

  /* ══ PUBLIC — DEEP SKY ═════════════════════════════════════════════════════════════════════════
     Position in AU from the Sun, from a MEASURED distance. Objects SIMBAD has no distance for are
     returned with au:null and a unit direction — the renderer puts them on the sphere, which is the
     truthful place for "we know where it is, not how far". */
  function deepSky() {
    const j = store.deep; if (!j) return [];
    return j.objects.map(o => ({
      main: o.main, alias: o.alias, cls: o.cls, otype: o.otype, maj: o.maj,
      dir: o._dir || (o._dir = eqToEcl(o.ra, o.dec)),
      pc: o.pc, dn: o.dn, q1: o.q1, q3: o.q3,
      au: o.pc > 0 ? o.pc * AU_PER_PC : null,
      label: (o.alias.find(a => /^M\s+\d+$/.test(a)) || o.alias[0] || o.main).replace(/\s+/g, ' '),
    }));
  }
  /* the furthest MEASURED object, in AU — what the camera's reach is allowed to be, so the ceiling
     is a property of the data rather than a number somebody liked */
  function deepFarAu() {
    const j = store.deep; if (!j) return 0;
    let m = 0; for (const o of j.objects) if (o.pc > 0 && o.pc * AU_PER_PC > m) m = o.pc * AU_PER_PC;
    return m;
  }

  return {
    load, state, ready, manifest,
    craftAt, craftTrail, craftList,
    smallAt, smallOrbit, smallFind, smallCounts,
    deepSky, deepFarAu,
    /* exposed for tests: the arithmetic, without any data */
    _kepler: { keplerE, keplerH, smallPos, hermite, eqToEcl, rotator }, AU_PER_PC,
  };
})();
