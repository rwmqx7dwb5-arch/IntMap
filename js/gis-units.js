/* ============================================================================
 *  IntMap · WHAT A NUMBER IS OF — window.IntMapGisUnits   (#R774)
 * ----------------------------------------------------------------------------
 *  docs/GIS-CORE.md §3.1 already says units TRAVEL: a column that named one keeps naming it through
 *  an op, with `unitStated:'inherited'` and the first author recorded. That is about REMEMBERING a
 *  unit. Nothing in this app ever USED one.
 *
 *  ⚠⚠⚠ MEASURED 2026-09-17 on the shipped build, twice, both `ok:true`:
 *      1000 m − 1 km    →   999   (unit null)
 *      10 °C − 283.15 K → −273.15 (unit null)
 *  Both differences are ZERO. js/gis-raster.js diffResult keeps the unit when the two spellings are
 *  equal and writes null when they are not — and then subtracts the raw numbers either way. ⚠ THE
 *  NULL DOES NOT MAKE THE NUMBER HONEST: dropping the label off a wrong number removes the evidence,
 *  not the error, which is the shape [[intmap-a-fix-that-removes-the-evidence]] records.
 *
 *  ══ WHAT THIS MODULE IS, AND WHAT IT IS NOT ═══════════════════════════════════════════════════
 *  It answers ONE question — 「この 2 つの量は、足し引きできるか。できるなら換算は何か」 — and it
 *  answers it for every caller, because the rule belongs to the FACT (two quantities are being
 *  combined arithmetically) and not to any one op (.agents/rules/no-ad-hoc-hardcoding.md §2-3).
 *  It measures nothing, draws nothing and holds no state.
 *
 *  ⚠ IT IS NOT A UNIT MENU. js/gis-crs.js AREA_UNITS/LENGTH_UNITS is the list of units `measure`
 *  will REPORT IN — which spellings a reader may ask an answer to be expressed in. That is a
 *  different question from 「この 2 つは同じ量か」 and the two lists are not copies of each other.
 *
 *  ══ THE TABLE IS SI, AND IT SAYS SO ═══════════════════════════════════════════════════════════
 *  .agents/rules/no-ad-hoc-hardcoding.md §4 requires three things of a constant:
 *    · OBSERVATION — every factor below is an exact defining value from the SI and from the
 *      international yard-and-pound agreement of 1959 (1 in = 25.4 mm exactly, 1 lb = 0.45359237 kg
 *      exactly), except the two marked as conventional (nautical mile 1852 m, standard atmosphere
 *      101325 Pa), which are exact by definition of their own standards. Nothing here was measured
 *      by this app or tuned to its data.
 *    · EXPIRY — these do not expire. A redefinition of the SI base units would not move any ratio
 *      written here, because every entry is a ratio BETWEEN units, not a measurement of the world.
 *    · CANONICAL SOURCE — this file. Any other place in this app that needs to know whether two
 *      units are the same quantity asks here.
 *  ⚠ THE SET IS DELIBERATELY SMALL, AND ITS SMALLNESS IS SAFE, because an unknown spelling is not
 *  guessed at: it is UNKNOWN, and two different unknown spellings cannot be shown to be the same
 *  quantity, so they are refused rather than subtracted. Adding an atom below can only turn a
 *  refusal into an answer, never an answer into a different answer.
 *
 *  ══ COMPOSITION, SO THE TABLE DOES NOT HAVE TO LIST EVERY PRODUCT ═════════════════════════════
 *  `mm/h`, `kg/m^2`, `µg/m³`, `W/m2`, `km/h` are parsed, not listed: a unit is a product of atoms
 *  with integer exponents, so the table holds ATOMS and the parser holds the arithmetic. `m2` and
 *  `km2` (the spelling js/gis-crs.js uses) and `m²`/`m³` are the same expression written three ways.
 *
 *  ══ AFFINE UNITS, AND WHY A DIFFERENCE IS NOT A READING ═══════════════════════════════════════
 *  °C and °F carry an OFFSET. 10 °C is 283.15 K; a difference of 10 °C is a difference of 10 K.
 *  So conversion has two modes and the caller says which (`difference:true`), because this module
 *  cannot see whether the number it is handed is a reading or a gap between two readings.
 *  ⚠ An offset atom inside a COMPOUND (`°C/km` — a lapse rate) is a difference per length: the
 *  offset does not apply and the parser drops it, with the affine flag saying so.
 *
 *  ══ WHAT THE EXPRESSION WALK DOES, AND THE TWO JUDGEMENTS IN IT ═══════════════════════════════
 *  `unitOfExpr` walks a js/gis-expr.js AST so that `compute` and `rasterCalc` get the same verdict
 *  from the same place. Two decisions in it are judgements rather than measurements, and are
 *  written here so a later reader can overturn them knowingly:
 *    · A LITERAL IS NEUTRAL. `temp - 273.15` is not refused. Strict dimensional analysis refuses it;
 *      readers write it constantly, and the number they get is the one they meant. What a literal
 *      cannot do is make two STATED units compatible with each other.
 *    · + AND − REQUIRE THE SAME SPELLING, not merely a convertible one. The evaluator in
 *      js/gis-expr.js converts nothing, so naming `m` on the output of `a + b` where b is in km
 *      would be this project's 「誰も述べていない主張」 with a label on it. The reader converts
 *      explicitly — `a + b * 1000` — and the claim is then theirs and visible in the recipe.
 *  ⚠ × and ÷ derive no spelling. A composed answer (`km·kg`) would be a unit nobody wrote, and the
 *  reader names the output unit for those.
 * ==========================================================================*/

export function makeGisUnits() {
  return (function () {

    /* dimension vector: length, mass, time, temperature, angle. Everything below is built from
       these five; a sixth would be added here and nowhere else. */
    const DIMS = ['L', 'M', 'T', 'K', 'A'];
    const dim = (L, M, T, K, A) => ({ L: L || 0, M: M || 0, T: T || 0, K: K || 0, A: A || 0 });

    /* atom → { f: how many SI base units one of these is, d: dimension, off: offset to SI, added
       AFTER the factor (only the two affine temperatures have one) }. */
    const ATOMS = {
      /* length (SI exact; the imperial four are the 1959 international agreement, exact) */
      m: { f: 1, d: dim(1) }, km: { f: 1e3, d: dim(1) }, cm: { f: 1e-2, d: dim(1) },
      mm: { f: 1e-3, d: dim(1) }, 'µm': { f: 1e-6, d: dim(1) }, 'μm': { f: 1e-6, d: dim(1) },
      mi: { f: 1609.344, d: dim(1) }, ft: { f: 0.3048, d: dim(1) },
      in: { f: 0.0254, d: dim(1) }, yd: { f: 0.9144, d: dim(1) },
      nmi: { f: 1852, d: dim(1) },                      /* conventional: SI-accepted, exact */
      /* area and volume that are NOT a power of a length spelling */
      ha: { f: 1e4, d: dim(2) }, acre: { f: 4046.8564224, d: dim(2) },
      L: { f: 1e-3, d: dim(3) }, l: { f: 1e-3, d: dim(3) },
      /* mass */
      kg: { f: 1, d: dim(0, 1) }, g: { f: 1e-3, d: dim(0, 1) }, mg: { f: 1e-6, d: dim(0, 1) },
      'µg': { f: 1e-9, d: dim(0, 1) }, 'μg': { f: 1e-9, d: dim(0, 1) },
      t: { f: 1e3, d: dim(0, 1) }, lb: { f: 0.45359237, d: dim(0, 1) },
      /* time. ⚠ NO YEAR AND NO MONTH: neither has one length, and a unit whose size depends on
         which one you meant cannot be a factor here. */
      s: { f: 1, d: dim(0, 0, 1) }, min: { f: 60, d: dim(0, 0, 1) },
      h: { f: 3600, d: dim(0, 0, 1) }, d: { f: 86400, d: dim(0, 0, 1) },
      /* temperature */
      K: { f: 1, d: dim(0, 0, 0, 1) },
      '°C': { f: 1, off: 273.15, d: dim(0, 0, 0, 1) },
      '°F': { f: 5 / 9, off: 273.15 - 160 / 9, d: dim(0, 0, 0, 1) },
      /* speed spellings that are not a quotient of two atoms already here */
      kn: { f: 1852 / 3600, d: dim(1, 0, -1) }, kt: { f: 1852 / 3600, d: dim(1, 0, -1) },
      mph: { f: 1609.344 / 3600, d: dim(1, 0, -1) },
      /* pressure (Pa = kg·m⁻¹·s⁻²) */
      Pa: { f: 1, d: dim(-1, 1, -2) }, hPa: { f: 100, d: dim(-1, 1, -2) },
      kPa: { f: 1e3, d: dim(-1, 1, -2) }, mbar: { f: 100, d: dim(-1, 1, -2) },
      bar: { f: 1e5, d: dim(-1, 1, -2) },
      atm: { f: 101325, d: dim(-1, 1, -2) },            /* conventional: standard atmosphere, exact */
      /* energy and power (J = kg·m²·s⁻², W = J/s) */
      J: { f: 1, d: dim(2, 1, -2) }, kJ: { f: 1e3, d: dim(2, 1, -2) },
      W: { f: 1, d: dim(2, 1, -3) }, kW: { f: 1e3, d: dim(2, 1, -3) }, MW: { f: 1e6, d: dim(2, 1, -3) },
      /* angle */
      rad: { f: 1, d: dim(0, 0, 0, 0, 1) }, '°': { f: Math.PI / 180, d: dim(0, 0, 0, 0, 1) },
      deg: { f: Math.PI / 180, d: dim(0, 0, 0, 0, 1) },
      /* dimensionless ratios. ⚠ '1' AND '' ARE NOT THE SAME THING: '' is 「述べていない」 and never
         reaches this table (see stated()); '1' is 「無次元だと述べた」. */
      '1': { f: 1, d: dim() }, '%': { f: 0.01, d: dim() },
      ppm: { f: 1e-6, d: dim() }, ppb: { f: 1e-9, d: dim() },
    };

    /* Superscript digits and the two ASCII spellings of an exponent, so m², m^2 and m2 are one. */
    const SUP = { '¹': 1, '²': 2, '³': 3, '⁴': 4, '⁰': 0 };

    const isNum = (v) => typeof v === 'number' && isFinite(v);
    /* 「述べた」 — an absent, empty or whitespace-only unit is silence, not a unit. */
    function stated(u) {
      if (u == null) return null;
      const s = String(u).trim();
      return s === '' ? null : s;
    }

    function dimAdd(a, b, k) {
      const out = {};
      for (const d of DIMS) out[d] = a[d] + b[d] * k;
      return out;
    }
    function dimEq(a, b) { for (const d of DIMS) if (a[d] !== b[d]) return false; return true; }
    function dimZero(a) { for (const d of DIMS) if (a[d] !== 0) return false; return true; }

    /* One factor of a unit expression: an atom, then an optional exponent written as ², ^2 or a
       trailing digit. ⚠ THE TRAILING-DIGIT FORM IS TRIED LAST and only when the whole token is not
       itself an atom, so `m2` is metres squared and `ppm` is not `pp` to the m. */
    function atomOf(token) {
      let t = token.trim();
      if (!t) return null;
      let exp = 1;
      const last = t.charAt(t.length - 1);
      if (Object.prototype.hasOwnProperty.call(SUP, last)) { exp = SUP[last]; t = t.slice(0, -1); }
      else {
        const hat = /\^(-?\d+)$/.exec(t);
        if (hat) { exp = Number(hat[1]); t = t.slice(0, hat.index); }
        else if (!Object.prototype.hasOwnProperty.call(ATOMS, t)) {
          const tail = /^(.*?)(\d)$/.exec(t);
          if (tail && Object.prototype.hasOwnProperty.call(ATOMS, tail[1])) { exp = Number(tail[2]); t = tail[1]; }
        }
      }
      if (!Object.prototype.hasOwnProperty.call(ATOMS, t)) return null;
      return { atom: ATOMS[t], exp: exp, name: t };
    }

    /* `unit` → { f, d, off, affine } or null when any factor is unknown. ⚠ NULL IS 「わからない」,
       never 「無次元」 — the callers below turn it into a refusal, not into an assumption. */
    function parse(unit) {
      const s = stated(unit);
      if (s == null) return null;
      const parts = s.split(/([*/·⋅])/);
      let f = 1, d = dim(), sign = 1, atoms = 0, off = 0, solo = true;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (p === '/') { sign = -1; continue; }
        if (p === '*' || p === '·' || p === '⋅') { sign = 1; continue; }
        const a = atomOf(p);
        if (!a) return null;
        const power = a.exp * sign;
        f *= Math.pow(a.atom.f, power);
        d = dimAdd(d, a.atom.d, power);
        if (a.atom.off) off = a.atom.off;
        atoms++;
        if (!(atoms === 1 && power === 1)) solo = false;
      }
      if (!atoms) return null;
      /* An offset only means anything for the bare affine atom; in a compound it is a per-something
         difference and the offset is dropped WITH the affine flag saying so. */
      return { f: f, d: d, off: solo ? off : 0, affine: !!(solo && off), spelling: s };
    }

    /* The whole question, in one verdict word:
         'unstated'     — at least one side said nothing. Nothing is claimed and nothing is refused.
         'identical'    — the same spelling. No conversion, and no table was consulted.
         'convertible'  — same quantity, different size. convert() says by how much.
         'incompatible' — both parse and they are different quantities.
         'unknown'      — different spellings and at least one is not in the table. ⚠ THIS IS A
                          REFUSAL, not a shrug: two spellings this file cannot read cannot be shown
                          to be the same quantity, and combining them would be a claim with no
                          author. */
    function compare(a, b) {
      const sa = stated(a), sb = stated(b);
      if (sa == null || sb == null) return { verdict: 'unstated', a: sa, b: sb };
      if (sa === sb) return { verdict: 'identical', a: sa, b: sb };
      const pa = parse(sa), pb = parse(sb);
      if (!pa || !pb) return { verdict: 'unknown', a: sa, b: sb, unreadable: !pa ? sa : sb };
      if (!dimEq(pa.d, pb.d)) return { verdict: 'incompatible', a: sa, b: sb };
      return { verdict: 'convertible', a: sa, b: sb };
    }

    /* v in `from`, expressed in `to`. null when it cannot be done — including when either side said
       nothing, because 「単位を述べていない値を K に直す」 is not a thing this file can do.
       `opts.difference:true` — v is a GAP between two readings, so offsets cancel. */
    function convert(v, from, to, opts) {
      if (!isNum(v)) return null;
      const sa = stated(from), sb = stated(to);
      if (sa == null || sb == null) return null;
      if (sa === sb) return v;
      const pa = parse(sa), pb = parse(sb);
      if (!pa || !pb || !dimEq(pa.d, pb.d)) return null;
      const diff = !!(opts && opts.difference);
      if (diff || (!pa.affine && !pb.affine)) return v * (pa.f / pb.f);
      return ((v * pa.f + pa.off) - pb.off) / pb.f;
    }

    /* ── the expression walk ──────────────────────────────────────────────────────────────────── */

    const ADDITIVE = new Set(['+', '-']);
    const COMPARING = new Set(['<', '<=', '>', '>=', '=', '==', '!=', '<>']);

    /* `unitOf(name)` → what that field/band says its unit is, or null. Returns
       { ok:true, unit } or { ok:false, why:'unit-mismatch', detail:{op, a, b, verdict} }.
       ⚠ THE REFUSAL NAMES THE OPERATOR AND BOTH SPELLINGS, because a reader who is told only
       「単位が合いません」 about a twelve-term expression has been told nothing actionable. */
    function unitOfExpr(ast, unitOf) {
      const of = (typeof unitOf === 'function') ? unitOf : (() => null);
      function walk(n) {
        if (!n || typeof n !== 'object') return { ok: true, unit: null };
        if (n.t === 'field') return { ok: true, unit: stated(of(n.name)) };
        if (n.t === 'num' || n.t === 'str' || n.t === 'bool' || n.t === 'null') return { ok: true, unit: null };
        if (n.t === 'un') return n.op === '-' ? walk(n.a) : { ok: true, unit: null };
        if (n.t === 'bin') {
          const a = walk(n.a); if (!a.ok) return a;
          const b = walk(n.b); if (!b.ok) return b;
          if (ADDITIVE.has(n.op) || COMPARING.has(n.op)) {
            const c = compare(a.unit, b.unit);
            if (c.verdict === 'incompatible' || c.verdict === 'unknown' || c.verdict === 'convertible') {
              return { ok: false, why: 'unit-mismatch', detail: { op: n.op, a: c.a, b: c.b, verdict: c.verdict } };
            }
            return { ok: true, unit: COMPARING.has(n.op) ? null : (a.unit || b.unit) };
          }
          /* × ÷ % — one side carrying no unit lets the other through; otherwise no spelling is
             invented for the reader (see the header). */
          if (a.unit && b.unit) return { ok: true, unit: null };
          if (n.op === '*') return { ok: true, unit: a.unit || b.unit };
          return { ok: true, unit: b.unit ? null : a.unit };
        }
        if (n.t === 'call') {
          const args = Array.isArray(n.args) ? n.args : [];
          for (const x of args) { const r = walk(x); if (!r.ok) return r; }
          return { ok: true, unit: null };
        }
        return { ok: true, unit: null };
      }
      return walk(ast);
    }

    /* ⚠ (#R774) THE VERSION IS DECLARED BECAUSE THIS FILE CHANGES ANSWERS. A recipe saved today
       replays against these rules: a refusal here is a step that does not run, and a conversion here
       is a different number. scripts/gis-kernel-versions.mjs is the keeper. */
    const KERNEL_VERSION = 'units-1';
    const REFUSALS = ['unit-mismatch'];

    const API = {
      parse, compare, convert, unitOfExpr, stated,
      atoms: () => Object.keys(ATOMS).slice(),
      dimensionless: (u) => { const p = parse(u); return p ? dimZero(p.d) : false; },
      version: () => KERNEL_VERSION,
      refusals: () => REFUSALS.slice(),
    };
    try { window.IntMapGisUnits = API; } catch (_) { }
    return API;
  })();
}
