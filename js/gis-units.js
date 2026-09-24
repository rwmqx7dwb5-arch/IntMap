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
 *  reader names the output unit for those — EXCEPT where the two units cancel exactly (`[m]/[m]`),
 *  which is a pure number and is labelled '1' rather than left looking unstated (#R783).
 *
 *  ══ (#R783) 「わからない」 AND 「無次元」 STOPPED SHARING AN ANSWER ═══════════════════════════════
 *  MEASURED before this round, every one `ok:true` with `unit:null`: `abs([len])`, `round([len],2)`,
 *  `min([len],[len])`, `if(…,[len],[len])`, `coalesce([len],0)`, `number([len])`, `[len] % [len]`
 *  — a column stating metres went through a function and came out stating nothing. And
 *  `min([m],[km])` was not even refused, while `[m] + [km]` was, because the rule had been written
 *  at the two operators instead of at the fact 「n 個の量が 1 つの量として扱われている」.
 *  ⇒ Every function now declares what it does to a unit ON ITS OWN DECLARATION in js/gis-expr.js
 *  (`unit:{rule}` beside `arity` and `fn`), this file asks for that list rather than keeping a copy
 *  of the function names, and the walk answers a STATE — 'stated' / 'dimensionless' / 'neutral' /
 *  'unstated' / 'non-quantity' / 'undetermined' — so 「導けなかった」 can be told to a reader instead
 *  of arriving as the same silence as 「誰も述べていない」.
 *
 *  ══ (#R783) AND THE UNIT IS NOT THE WHOLE MEANING ═════════════════════════════════════════════
 *  A second half of this file answers 「その集計をしてよいか」 from the quantity's kind, spatial meaning,
 *  temporal meaning and period — see the block above `quantity()`, which states what that vocabulary
 *  is for, what it refuses, and the three things it deliberately does not do.
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
    const LOGICAL = new Set(['and', 'or']);

    /* (#R783) SIX STATES, BECAUSE `null` WAS ANSWERING FOR FIVE OF THEM:
         'stated'       — a spelling somebody wrote (`unit` is it).
         'dimensionless'— derived to be a pure number, and it says so with the spelling '1'
                          (`[m] / [m]`, `len(…)`, `log(…)`).
         'neutral'      — a literal. It claims nothing and it constrains nothing (see the header).
         'unstated'     — a real quantity whose unit NOBODY has stated. Silence, not dimensionless.
         'non-quantity' — the answer is text or a yes/no, so a unit is not a thing it could have.
         'undetermined' — the answer HAS a unit and none can be derived (`[km] * [kg]`, `sqrt([m2])`,
                          a function whose rule this file cannot read).
       ⚠ THE LAST TWO USED TO BE THE SAME `null` AS 'neutral' AND 'unstated', which is why a column
       computed as `abs([len])` shipped with no unit and a column computed as `[km] * [kg]` shipped
       with no unit — 「誰も述べていない」 and 「導けなかった」 written identically. `unit` is still
       null for all four, so a caller that only reads `unit` behaves exactly as it did; a caller that
       wants to TELL the reader which of the four it is reads `state`. */
    const STATE_WEAKEST = ['undetermined', 'unstated', 'non-quantity', 'neutral', 'dimensionless'];
    const res = (unit, state, extra) => Object.assign({ ok: true, unit: unit || null, state: state, determined: state !== 'undetermined' }, extra || {});
    function weakest(states) {
      for (const s of STATE_WEAKEST) if (states.indexOf(s) >= 0) return s;
      return 'neutral';
    }

    /* The one rule for 「この n 個は 1 つの量か。だとして何の量か」, used by + − , by every comparison
       and by every function declaring `keeps`. ⚠ IT IS ONE FUNCTION ON PURPOSE: `[m] + [km]` was
       refused and `min([m], [km])` was not, which is the same arithmetic getting two answers because
       the rule was written at the operator instead of at the fact. */
    function combineKeeps(parts, opName) {
      if (parts.some((p) => p.state === 'undetermined')) {
        return res(null, 'undetermined', { why: 'unit-not-derived', detail: { op: opName, cause: 'operand' } });
      }
      const named = parts.filter((p) => p.unit != null);
      for (let i = 1; i < named.length; i++) {
        const c = compare(named[0].unit, named[i].unit);
        /* 'identical' passes. Everything else is refused, INCLUDING 'convertible': nothing in this
           app converts inside a reader's own expression (see the header), so naming one of the two
           spellings on the answer would be a claim the arithmetic does not support. */
        if (c.verdict !== 'identical') {
          return { ok: false, why: 'unit-mismatch', detail: { op: opName, a: c.a, b: c.b, verdict: c.verdict } };
        }
      }
      if (named.length) return res(named[0].unit, named[0].unit === '1' ? 'dimensionless' : 'stated');
      return res(null, weakest(parts.map((p) => p.state)));
    }

    /* × and ÷ — the ONE case where a spelling can be derived without inventing one: the two units
       cancel exactly. `[m] / [m]` and `[m2] / [m2]` are pure numbers and saying so costs nothing.
       ⚠ IT HAS TO CANCEL EXACTLY. `[m] / [mm]` is dimensionless too, but its VALUE is out by 1000
       because the evaluator converts nothing, so it is undetermined rather than labelled '1'. An
       affine atom is excluded: `[°C] / [°C]` is a ratio of two offset readings, not of two
       quantities. */
    function cancels(op, ua, ub) {
      const pa = parse(ua), pb = parse(ub);
      if (!pa || !pb || pa.affine || pb.affine) return false;
      const d = dimAdd(pa.d, pb.d, op === '*' ? 1 : -1);
      const f = op === '*' ? pa.f * pb.f : pa.f / pb.f;
      return dimZero(d) && Math.abs(f - 1) < 1e-12;
    }

    /* What each function declares it does to a unit, asked of js/gis-expr.js — the file the function
       is implemented in. ⚠ NOT A TABLE OF NAMES HERE (.agents/rules/no-ad-hoc-hardcoding.md §2-4):
       a list in this file would go out of date the first time a function is added over there, and the
       new function would lose its unit silently. A build with no expression kernel, or a name this
       walk cannot find, yields 'undetermined' — which is an answer a reader can be given. */
    function funcRules() {
      let list = null;
      try { const X = (typeof window !== 'undefined') && window.IntMapGisExpr; list = X && typeof X.functions === 'function' ? X.functions() : null; } catch (_) { list = null; }
      const m = new Map();
      for (const f of (list || [])) if (f && f.name) m.set(String(f.name), (f.unit && f.unit.rule) ? f.unit : null);
      return m;
    }

    /* `unitOf(name)` → what that field/band says its unit is, or null. Returns
       { ok:true, unit, state, determined } or { ok:false, why:'unit-mismatch', detail:{op,a,b,verdict} }.
       ⚠ THE REFUSAL NAMES THE OPERATOR AND BOTH SPELLINGS, because a reader who is told only
       「単位が合いません」 about a twelve-term expression has been told nothing actionable. */
    function unitOfExpr(ast, unitOf) {
      const of = (typeof unitOf === 'function') ? unitOf : (() => null);
      const rules = funcRules();
      function walk(n) {
        if (!n || typeof n !== 'object') return res(null, 'undetermined', { why: 'unit-node-unreadable', detail: { node: String(n) } });
        if (n.t === 'field') { const u = stated(of(n.name)); return u == null ? res(null, 'unstated', { detail: { field: String(n.name) } }) : res(u, u === '1' ? 'dimensionless' : 'stated'); }
        if (n.t === 'num') return res(null, 'neutral');
        if (n.t === 'null') return res(null, 'neutral');
        if (n.t === 'str' || n.t === 'bool') return res(null, 'non-quantity');
        if (n.t === 'un') {
          if (n.op === '-') return walk(n.a);
          const a = walk(n.a); if (!a.ok) return a;              /* `not x` — the operand still walks */
          return res(null, 'non-quantity');
        }
        if (n.t === 'bin') {
          const a = walk(n.a); if (!a.ok) return a;
          const b = walk(n.b); if (!b.ok) return b;
          if (ADDITIVE.has(n.op)) return combineKeeps([a, b], n.op);
          if (COMPARING.has(n.op)) {
            /* The comparison is refused on the same grounds as the subtraction it stands for — and
               then the ANSWER is a yes/no, which has no unit rather than an unknown one. */
            const c = combineKeeps([a, b], n.op);
            return c.ok ? res(null, 'non-quantity') : c;
          }
          if (LOGICAL.has(n.op)) return res(null, 'non-quantity');
          /* × ÷ % */
          if (a.state === 'undetermined' || b.state === 'undetermined') return res(null, 'undetermined', { why: 'unit-not-derived', detail: { op: n.op } });
          if (n.op === '%') {
            /* A remainder is in the unit of the LEFT operand, and the right has to be the same
               quantity for the operation to mean anything. */
            if (b.unit == null) return res(a.unit, a.unit ? (a.unit === '1' ? 'dimensionless' : 'stated') : weakest([a.state, b.state]));
            return combineKeeps([a, b], n.op);
          }
          if (a.unit && b.unit) {
            if (cancels(n.op, a.unit, b.unit)) return res('1', 'dimensionless');
            return res(null, 'undetermined', { why: 'unit-not-derived', detail: { op: n.op, a: a.unit, b: b.unit } });
          }
          /* One side carries no unit. × lets the other through; ÷ does too when the DIVISOR is the
             bare one, and answers 「決まらない」 when the divisor is the one with the unit, because
             `1 / km` is a spelling nobody wrote (see the header). */
          if (n.op === '*') { const u = a.unit || b.unit; return u ? res(u, u === '1' ? 'dimensionless' : 'stated') : res(null, weakest([a.state, b.state])); }
          if (b.unit) return res(null, 'undetermined', { why: 'unit-not-derived', detail: { op: n.op, a: a.unit, b: b.unit } });
          return a.unit ? res(a.unit, a.unit === '1' ? 'dimensionless' : 'stated') : res(null, weakest([a.state, b.state]));
        }
        if (n.t === 'call') {
          const args = Array.isArray(n.args) ? n.args : [];
          const parts = [];
          for (const x of args) { const r = walk(x); if (!r.ok) return r; parts.push(r); }
          const decl = rules.has(n.name) ? rules.get(n.name) : undefined;
          if (!decl) {
            return res(null, 'undetermined', {
              why: decl === undefined ? 'unit-rule-unreachable' : 'unit-rule-undeclared',
              detail: { fn: String(n.name) },
            });
          }
          /* `args` names which arguments carry the quantity — round(x, digits) and if(cond, a, b)
             have arguments that are not part of the answer's unit at all. */
          const chosen = Array.isArray(decl.args) && decl.args.length ? decl.args.filter((i) => i < parts.length).map((i) => parts[i]) : parts;
          if (decl.rule === 'keeps') return combineKeeps(chosen.length ? chosen : parts, n.name);
          if (decl.rule === 'dimensionless') return res('1', 'dimensionless');
          if (decl.rule === 'no-unit') return res(null, 'non-quantity');
          if (decl.rule === 'changes') {
            /* A unit-changing function over operands that carry no unit has nothing to change, so it
               stays as neutral as they were; over a stated one it has a unit and no spelling. */
            if (chosen.some((p) => p.unit != null)) return res(null, 'undetermined', { why: 'unit-not-derived', detail: { fn: String(n.name), from: chosen.filter((p) => p.unit != null).map((p) => p.unit) } });
            return res(null, weakest(chosen.map((p) => p.state)));
          }
          return res(null, 'undetermined', { why: 'unit-rule-unreadable', detail: { fn: String(n.name), rule: String(decl.rule) } });
        }
        return res(null, 'undetermined', { why: 'unit-node-unreadable', detail: { node: String(n.t) } });
      }
      return walk(ast);
    }

    /* ══ ② 単位だけでは量の意味は決まらない (#R783) ═══════════════════════════════════════════════
       A grid of 「人数」 in a cell can be THE NUMBER OF PEOPLE IN THAT CELL or AN ESTIMATE AT THAT
       POINT, and the two behave differently the moment a zone boundary crosses the cell: the first
       is summed, the second is averaged. A column in 「ミリメートル」 of rain can be an hour's
       accumulation or a month's, and those two are not comparable however identical their unit is.
       ⚠ NOTHING ABOVE THIS LINE CAN TELL THEM APART, and nothing in this app could: a unit was the
       only thing a record carried about what its numbers MEAN.

       So a quantity here is four statements plus the unit:
         · kind   — 何の種類の量か (count / amount / density / intensity / ratio / index / category)
         · space  — 空間的な意味: 'total' (その画素・その図形全体の量), 'point' (その地点の値),
                    'perArea' (面積あたり)
         · time   — 時間的な意味: 'instant' (瞬時値), 'accumulated' (期間の積算), 'mean' (期間の平均),
                    and the two that are not instants carry the PERIOD
         · period — 1 h, 1 d, 1 month … ⚠ month と year は秒数を持たない（ATOMS が両者を持たない
                    のと同じ理由）ので、暦の単位として別に運ぶ
       and from those four this file answers 「その集計をしてよいか」 — which is the question Atlas
       has to answer when a reader says 「合計して」.

       ⚠⚠⚠ THREE THINGS THIS DELIBERATELY DOES NOT DO.
       ⑴ IT DOES NOT CLASSIFY ANY EXISTING DATA. Every value in this app keeps the meaning it has
          today; this is the vocabulary a SUPPLIER (js/gis-datasets.js's declarations, a loader, a
          reader) will state a quantity in. Deciding that a particular bundled column is a density is
          that supplier's statement to make, not this file's guess.
       ⑵ IT NEVER READS SILENCE AS PERMISSION. An undeclared quantity answers 'undeclared' for every
          method, and 'undeclared' is not 'allowed': 「宣言されていないものを合計してよい」 is exactly
          the claim with no author this repository keeps finding ([[intmap-data-must-not-claim-an-
          author-it-lacks]]). A caller that wants to sum anyway is welcome to — but it is then the
          caller's claim, made knowingly, and the verdict said so.
       ⑶ IT IMPLIES A SPACE ONLY WHERE THE KIND ENTAILS ONE. A density is per-area by definition, so
          it is not asked twice. A COUNT IS NOT: 「この画素の人数」 and 「この地点の推計人数」 are both
          counts, which is the audit's own example, so a count whose space nobody stated leaves `sum`
          undeclared rather than allowed. */

    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

    /* kind → how it behaves under aggregation. `impliesSpace` is a definitional entailment, not a
       default: null means the supplier has to say. */
    const QUANTITY_KINDS = {
      count:     { measure: 'extensive', impliesSpace: null, ordered: true },
      amount:    { measure: 'extensive', impliesSpace: null, ordered: true },
      density:   { measure: 'intensive', impliesSpace: 'perArea', ordered: true },
      intensity: { measure: 'intensive', impliesSpace: 'point', ordered: true },
      ratio:     { measure: 'intensive', impliesSpace: 'point', ordered: true, weight: 'denominator' },
      index:     { measure: 'intensive', impliesSpace: 'point', ordered: true, constructed: true },
      category:  { measure: 'nominal', impliesSpace: 'point', ordered: false },
    };
    const SPACES = { total: { extensive: true }, point: { extensive: false }, perArea: { extensive: false } };
    const TIMES = { instant: { needsPeriod: false }, accumulated: { needsPeriod: true }, mean: { needsPeriod: true } };
    /* ⚠ month と year は原子ではない（ATOMS のコメントと同じ理由——どちらも一つの長さを持たない）。
       比較は「同じ暦の単位で同じ個数か」で行い、秒に直さない。 */
    const CALENDAR_UNITS = ['month', 'year'];
    const METHODS = ['sum', 'mean', 'areaWeightedMean', 'weightedMean', 'min', 'max', 'median', 'majority', 'count'];

    function normPeriod(p) {
      if (p == null) return { ok: true, value: null };
      const raw = (typeof p === 'string') ? { count: 1, unit: p } : p;
      if (!raw || typeof raw !== 'object') return { ok: false, why: 'quantity-period-unreadable', detail: { period: String(p) } };
      const count = raw.count == null ? 1 : Number(raw.count);
      if (!isNum(count) || count <= 0) return { ok: false, why: 'quantity-period-unreadable', detail: { count: String(raw.count) } };
      const named = stated(raw.calendar != null ? raw.calendar : raw.unit);
      if (named == null) return { ok: false, why: 'quantity-period-unreadable', detail: { period: 'no unit and no calendar' } };
      if (CALENDAR_UNITS.indexOf(named) >= 0) return { ok: true, value: { count: count, unit: named, calendar: named, seconds: null } };
      if (raw.calendar != null) return { ok: false, why: 'quantity-period-unreadable', detail: { calendar: named, known: CALENDAR_UNITS.slice() } };
      const pu = parse(named);
      if (!pu || !dimEq(pu.d, dim(0, 0, 1))) return { ok: false, why: 'quantity-period-not-a-duration', detail: { unit: named } };
      return { ok: true, value: { count: count, unit: named, calendar: null, seconds: count * pu.f } };
    }

    function periodsEqual(a, b) {
      if (a == null || b == null) return a == null && b == null;
      if (a.seconds != null && b.seconds != null) return Math.abs(a.seconds - b.seconds) < 1e-9;
      if (a.calendar && b.calendar) return a.calendar === b.calendar && a.count === b.count;
      return false;                     /* 1 month と 30 d は「同じ」ではない——比べられない、が答え */
    }

    /* A declared quantity, normalised — or a named reason it is not one. ⚠ `space` may be null in an
       `ok:true` answer: the kind was readable and the spatial meaning was not stated. That is the
       honest shape, and `aggregation` below turns it into 'undeclared' for the methods that need it
       rather than into a guess. */
    function quantity(spec) {
      if (spec == null || typeof spec !== 'object' || Array.isArray(spec)) {
        return { ok: false, why: 'quantity-undeclared', detail: { have: spec == null ? 'nothing' : typeof spec } };
      }
      const kind = stated(spec.kind);
      if (kind == null) return { ok: false, why: 'quantity-undeclared', detail: { missing: 'kind' } };
      if (!has(QUANTITY_KINDS, kind)) return { ok: false, why: 'quantity-kind-unreadable', detail: { kind: kind, known: Object.keys(QUANTITY_KINDS) } };
      const K = QUANTITY_KINDS[kind];
      const spaceStated = stated(spec.space);
      if (spaceStated != null && !has(SPACES, spaceStated)) return { ok: false, why: 'quantity-space-unreadable', detail: { space: spaceStated, known: Object.keys(SPACES) } };
      const time = stated(spec.time);
      if (time != null && !has(TIMES, time)) return { ok: false, why: 'quantity-time-unreadable', detail: { time: time, known: Object.keys(TIMES) } };
      const per = normPeriod(spec.period);
      if (!per.ok) return { ok: false, why: per.why, detail: per.detail };
      if (time != null && TIMES[time].needsPeriod && per.value == null) return { ok: false, why: 'quantity-period-missing', detail: { time: time } };
      const unit = stated(spec.unit);
      /* ⚠ (#R819) 割合の分母は「別の列の名前」であって、この核が読める量ではない。A ratio's rule here
         is already 「分母で重み付けろ」 (`weight:'denominator'`, and `aggregation` hands that word
         back as the remedy) — and the word was the whole of it: NOTHING could say WHICH column the
         denominator is, so a caller receiving the remedy had no way to act on it without inventing a
         second place to keep the association. It is carried as a NAME and never resolved here: this
         file knows nothing about datasets or columns, and resolving it would be this kernel growing
         a reader of somebody else's record.
         ⚠ IT CHANGES NO VERDICT. A quantity that states one and a quantity that does not are judged
         identically by `aggregation` and by `comparableQuantity`; the name travels so that the
         layer holding the columns can act on the remedy this file already gave. */
      const denominator = stated(spec.denominator);
      /* Two contradictions that can be MEASURED rather than trusted. Both are 「宣言が自分と矛盾して
         いる」, not 「読めない」: a share cannot be in metres and a category cannot be in anything. */
      if (kind === 'ratio' && unit != null) { const pu = parse(unit); if (pu && !dimZero(pu.d)) return { ok: false, why: 'quantity-unit-contradicts-kind', detail: { kind: kind, unit: unit } }; }
      if (kind === 'category' && unit != null) return { ok: false, why: 'quantity-unit-contradicts-kind', detail: { kind: kind, unit: unit } };
      return {
        ok: true,
        q: {
          kind: kind, measure: K.measure, ordered: K.ordered,
          space: spaceStated != null ? spaceStated : K.impliesSpace,
          spaceFrom: spaceStated != null ? 'stated' : (K.impliesSpace ? 'kind' : null),
          time: time, period: per.value, unit: unit,
          weight: K.weight || null,
          denominator: denominator,
        },
      };
    }

    /* 「その集計をしてよいか」. Verdicts, and what each one obliges the caller to do:
         'allowed'      — the method means what the reader thinks it means.
         'needs-weight' — the plain method is wrong and the weighted one is right; `weight` names
                          what to weight BY ('area' or 'denominator').
         'refused'      — the answer would not be a quantity of anything. `remedy` names the way out.
         'undeclared'   — nobody has said enough about this quantity to know. ⚠ NOT 'allowed'.
         'unreadable'   — the method itself is not one of `methods()`.
       `opts.over` is 'space' (the default — combining places) or 'time' (combining moments), because
       they are different questions: an hourly accumulation sums over time and a temperature does not. */
    function aggregation(spec, method, opts) {
      const m = stated(method);
      const over = (opts && stated(opts.over) === 'time') ? 'time' : 'space';
      const base = { method: m, over: over };
      if (m == null || METHODS.indexOf(m) < 0) return Object.assign({ verdict: 'unreadable', why: 'aggregation-method-unreadable', detail: { method: m, known: METHODS.slice() } }, base);
      /* ⚠ ASKED BEFORE THE QUANTITY IS EVEN READ. Counting the features is a question about the ROWS,
         so it is answerable for a quantity nobody has declared — and answering 'undeclared' to it
         would make the verdict look like it depends on something it does not. */
      if (m === 'count') return Object.assign({ verdict: 'allowed', why: null }, base);
      const parsed = quantity(spec);
      if (!parsed.ok) return Object.assign({ verdict: 'undeclared', why: parsed.why, detail: parsed.detail }, base);
      const q = parsed.q;
      const out = (verdict, why, extra) => Object.assign({ verdict: verdict, why: why || null, quantity: q }, base, extra || {});

      if (m === 'majority') return q.measure === 'nominal' ? out('allowed') : out('refused', 'majority-of-a-measurement', { remedy: 'mean' });
      if (q.measure === 'nominal') return out('refused', 'aggregating-a-category', { remedy: 'majority' });
      if (m === 'min' || m === 'max' || m === 'median') return out('allowed');

      if (m === 'weightedMean') return out('allowed', null, { weight: q.weight || 'caller' });

      if (m === 'areaWeightedMean') {
        if (over === 'time') return out('refused', 'area-weighting-over-time', { remedy: 'mean' });
        if (q.space == null) return out('undeclared', 'quantity-space-undeclared', { detail: { kind: q.kind } });
        /* Weighting a per-cell TOTAL by that cell's area counts the area twice: the total already is
           the cell's. What a reader wants over totals is the sum. */
        if (q.space === 'total') return out('refused', 'weighting-a-total', { remedy: 'sum' });
        return out('allowed', null, { weight: 'area' });
      }

      if (m === 'sum') {
        if (q.kind === 'ratio') return out('refused', 'summing-a-ratio', { remedy: 'weightedMean', weight: 'denominator' });
        if (q.kind === 'index') return out('refused', 'summing-an-index', { remedy: 'mean' });
        if (over === 'time') {
          if (q.time == null) return out('undeclared', 'quantity-time-undeclared');
          if (q.time === 'accumulated') return out('allowed', null, { note: 'periods-must-match' });
          return out('refused', q.time === 'instant' ? 'summing-instantaneous' : 'summing-means-over-time', { remedy: 'mean' });
        }
        if (q.space == null) return out('undeclared', 'quantity-space-undeclared', { detail: { kind: q.kind } });
        if (q.space === 'total') return out('allowed');
        if (q.space === 'perArea') return out('refused', 'summing-a-density', { remedy: 'multiply-by-area-then-sum' });
        return out('refused', 'summing-point-samples', { remedy: 'mean' });
      }

      if (m === 'mean') {
        if (q.kind === 'ratio') return out('needs-weight', 'mean-of-a-ratio', { weight: 'denominator', remedy: 'weightedMean' });
        if (over === 'time') {
          if (q.time == null) return out('undeclared', 'quantity-time-undeclared');
          return out('allowed', null, q.time === 'accumulated' ? { note: 'periods-must-match' } : null);
        }
        if (q.space == null) return out('undeclared', 'quantity-space-undeclared', { detail: { kind: q.kind } });
        /* The mean of per-cell totals over cells of unequal size is a per-cell average, which is what
           it says; the mean of a density or of point samples over unequal cells is not the area's
           mean, and the area-weighted one is. */
        if (q.space === 'total') return out('allowed');
        return out('needs-weight', 'mean-of-an-intensive-quantity', { weight: 'area', remedy: 'areaWeightedMean' });
      }

      /* Unreachable while METHODS and the branches above agree; it is here so that adding a method to
         the list without a rule answers 「決まらない」 instead of falling off the end as undefined. */
      return out('undeclared', 'aggregation-rule-undeclared');
    }

    function aggregations(spec, opts) {
      const out = {};
      for (const m of METHODS) out[m] = aggregation(spec, m, opts);
      return out;
    }

    /* 「この 2 つの量は、比べられるか」 — the audit's 1 時間の積算 vs 1 か月の積算, which have the
       same unit and are not the same quantity. The unit is the LAST thing asked, because two
       quantities can agree on every spelling and still be different measurements. */
    function comparableQuantity(a, b) {
      const qa = quantity(a), qb = quantity(b);
      if (!qa.ok) return { verdict: 'undeclared', side: 'a', why: qa.why, detail: qa.detail };
      if (!qb.ok) return { verdict: 'undeclared', side: 'b', why: qb.why, detail: qb.detail };
      const A = qa.q, B = qb.q;
      if (A.kind !== B.kind) return { verdict: 'different-kind', a: A.kind, b: B.kind };
      if (A.space !== B.space) return { verdict: 'different-space', a: A.space, b: B.space, why: (A.space == null || B.space == null) ? 'quantity-space-undeclared' : null };
      if (A.time !== B.time) return { verdict: 'different-time', a: A.time, b: B.time, why: (A.time == null || B.time == null) ? 'quantity-time-undeclared' : null };
      if (!periodsEqual(A.period, B.period)) return { verdict: 'different-period', a: A.period, b: B.period };
      const c = compare(A.unit, B.unit);
      if (c.verdict === 'incompatible' || c.verdict === 'unknown') return { verdict: 'different-unit', why: c.verdict, a: c.a, b: c.b };
      /* 'convertible' is comparable AFTER convert(); the factor is not returned here because an
         affine pair has no factor and a number labelled 「倍率」 for °C→K would be wrong. */
      return { verdict: 'comparable', unit: c.verdict, convert: c.verdict === 'convertible' ? { from: A.unit, to: B.unit } : null };
    }

    /* ⚠ (#R774) THE VERSION IS DECLARED BECAUSE THIS FILE CHANGES ANSWERS. A recipe saved today
       replays against these rules: a refusal here is a step that does not run, and a conversion here
       is a different number. scripts/gis-kernel-versions.mjs is the keeper. */
    /* (#R783) units-1 -> units-2: TWO ANSWERS MOVED. ⑴ `min([m], [km])`, `max`, `if` and `coalesce`
       over two columns stating different units are now refused with `unit-mismatch` — the same
       refusal `+` and `−` already gave, which is what they always should have been (a step that ran
       yesterday can refuse today). ⑵ A computed column now CARRIES a unit where the walk used to
       derive none: `abs([len])`, `round([len], 2)`, `min([len], [len])`, `[len] % [len]` inherit the
       operand's spelling, and an expression that cancels exactly (`[m] / [m]`, `len(…)`, `log(…)`)
       is labelled '1'. A recipe replayed after this round registers a record stating a unit where
       the same recipe registered silence before, which is the difference this number announces. */
    /* (#R819) units-2 IS DELIBERATELY NOT RAISED, and the choice is the one that gate exists to
       force. `quantity()` now CARRIES a declared `denominator` — the name of the column a ratio is a
       share of — and nothing reads it here: every verdict `aggregation`, `aggregations` and
       `comparableQuantity` return for a spec that states one is the verdict they returned for the
       same spec without it, and no conversion factor moves. A saved recipe replays to the same
       numbers and the same refusals. */
    const KERNEL_VERSION = 'units-2';
    /* ⚠ ONLY THE CODES THAT LEAVE HERE AS `ok:false`. The `quantity-*` and `summing-*` codes below
       are VERDICTS a caller reads and reports in its own words — they are not this kernel refusing an
       op, and declaring them here would tell tests/r729 ④ to look for a sentence in js/gis-panel.js
       for a refusal js/gis-ops.js never hands back. */
    const REFUSALS = ['unit-mismatch'];

    const API = {
      parse, compare, convert, unitOfExpr, stated,
      atoms: () => Object.keys(ATOMS).slice(),
      dimensionless: (u) => { const p = parse(u); return p ? dimZero(p.d) : false; },
      /* ② 量の意味 — the vocabulary is published so that a supplier declaring a quantity, and a panel
         drawing the choice, read the SAME list this file judges with. */
      quantity, aggregation, aggregations, comparableQuantity,
      quantityVocabulary: () => ({
        kinds: Object.keys(QUANTITY_KINDS).map((k) => Object.assign({ kind: k }, QUANTITY_KINDS[k])),
        spaces: Object.keys(SPACES).slice(),
        times: Object.keys(TIMES).map((t) => ({ time: t, needsPeriod: TIMES[t].needsPeriod })),
        calendarPeriods: CALENDAR_UNITS.slice(),
        methods: METHODS.slice(),
        /* ⚠ (#R819) 宣言の欄そのもの。A supplier writing a declaration and a panel drawing one both
           need to know WHICH KEYS make one up, and the only alternative to publishing it is each of
           them keeping a list of its own — the shape .agents/rules/no-ad-hoc-hardcoding.md §1 names.
           `denominator` is here because it is declarable, not because this file interprets it. */
        specFields: ['kind', 'space', 'time', 'period', 'unit', 'denominator'],
      }),
      version: () => KERNEL_VERSION,
      refusals: () => REFUSALS.slice(),
    };
    try { window.IntMapGisUnits = API; } catch (_) { }
    return API;
  })();
}
