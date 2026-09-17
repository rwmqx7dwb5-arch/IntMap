/* ============================================================================
 *  IntMap · THE EXPRESSION READER — window.IntMapGisExpr   (#R738)
 * ----------------------------------------------------------------------------
 *  docs/GIS-CORE.md §6 says what is missing in its own words: 「式で計算列を作る op も無い」.
 *  This file is the reader of that expression — the tokenizer, the parser and the arithmetic. The op
 *  that writes a column with it lives in js/gis-ops.js; this module registers nothing, draws nothing
 *  and knows no UI, so the whole language can be MEASURED (js/pandemic-model.js is the round that
 *  showed why: six real defects were each one invariant away from being caught, and none of them was
 *  caught, because the arithmetic was inside a DOM closure where no check could reach it).
 *
 *  ══ THE STRING A READER TYPES NEVER BECOMES CODE ══════════════════════════════════════════════
 *  No interpreter of the host language is invoked here — not the global one, not the constructor
 *  that compiles a string into a function. Everything below is a hand-written tokenizer and a
 *  recursive-descent parser over a closed grammar. That is not only the CSP: a path from 「読者が
 *  打った文字列」 to 「このページで走る任意のコード」 is a path this product must not have, and the
 *  check in tests/r737-gis-expr-checks.test.mjs ⑨ reads this file to keep it absent.
 *
 *  ══ FOUR RULES OF MEANING, AND THE DEFECT EACH ONE REFUSES ════════════════════════════════════
 *  ① EMPTY IS NOT ZERO. null, undefined and a blank cell are MISSING, and missing propagates:
 *     `1 + null` is null, not 1. Reading a blank as 0 is the shape this repository keeps recording —
 *     「少し小さい数」 — because the reader who averages a half-filled column would be handed a
 *     smaller answer with nothing on screen saying so. A reader who genuinely wants blanks counted
 *     as zero writes `coalesce(x, 0)`: the claim is then THEIRS, and it is visible in the recipe.
 *  ② A ZERO-PADDED CELL IS A CODE, NOT A NUMBER (docs/GIS-CORE.md §1.1). `"01100" * 1` is null, not
 *     1100. ⚠ AND THAT RULE IS NOT COPIED HERE. It is asked of the registry — `asNumber` for the
 *     verdict and `typeColumn` for the evidence (`padded`), the same two functions the panel and
 *     js/gis-ops.js ask. A private parseFloat in this file would produce the exact drift
 *     .agents/rules/no-ad-hoc-hardcoding.md describes: a column comparable in the filter panel and
 *     not comparable in an expression. With no rule handed over, this module REFUSES BY NAME
 *     (`expr-no-number-rule`) instead of inventing one.
 *  ③ DIVISION BY ZERO IS NULL, AND SO IS EVERY NON-FINITE RESULT. Infinity written into a column is
 *     a value that makes every later sum, mean and min/max of that column unusable, and it arrives
 *     looking like a measurement.
 *  ④ `+` ADDS NUMBERS. It never joins text quietly: `'a' + 1` is `expr-type`, and the reader who
 *     wants a join says `concat('a', 1)`. Note what this does NOT do — it does not refuse `"01100"`,
 *     because a numeral the registry rejected for its leading zero is an IDENTIFIER, i.e. something
 *     that is missing as a number (rule ②), while 「あ」 is text that was never a number at all.
 *     The two answers are different because the two situations are different.
 *
 *  ══ THE FUNCTION LIST IS ONE LIST ═════════════════════════════════════════════════════════════
 *  `FUNCS` below is the only place a function name exists: the parser accepts what is in it, the
 *  arity check reads its `arity`, the evaluator calls its `fn`, and `functions()` is that same table
 *  with the implementations stripped for a UI to draw. js/gis-ops.js #R732 is the measured reason —
 *  a second list (`ORDER`) sat one line under the comment forbidding second lists, and an op added
 *  to one and not the other answered run() while never appearing on screen.
 *
 *  ⚠ `doc` IS A SIGNATURE, NOT A SENTENCE. Prose here would be English-only prose inside a module
 *  that has no business knowing which UI it is in — the same reason refusals are codes
 *  (docs/GIS-CORE.md §2.2). A panel drawing this list carries its own wording, keyed by name.
 *
 *  ══ EACH FUNCTION SAYS WHAT IT DOES TO A UNIT (#R783) ═════════════════════════════════════════
 *  MEASURED before this round: `abs([len])` over a column stating metres derived NO unit, and so did
 *  `round`, `min`, `max`, `if`, `coalesce` and `number` — js/gis-units.js walked into a call node and
 *  answered `unit:null` for every one of them. Two different facts were wearing one answer: 「無次元
 *  だ」 and 「導けなかった」. Worse, `min([m], [km])` was not even refused, while `[m] + [km]` was.
 *  ⚠ THE RULE IS DECLARED HERE, BESIDE THE IMPLEMENTATION, AND NOWHERE ELSE. A table of function
 *  names inside js/gis-units.js would be the hand-written list .agents/rules/no-ad-hoc-hardcoding.md
 *  §2-4 forbids: a function added here and not there would silently lose its unit. `unit` rides on
 *  the same declaration as `arity` and `fn`, travels out through `functions()`, and a name whose rule
 *  this file cannot read never reaches the app (the loop under FUNCS refuses to build).
 *  ⚠ THIS FILE STILL CONVERTS NOTHING AND REFUSES NOTHING ON UNIT GROUNDS. It states what its own
 *  arithmetic does to a quantity; the verdict, the comparison table and the refusal are
 *  js/gis-units.js's, because that is the one place that knows whether two spellings are one quantity.
 *
 *  ══ WHAT IS RETURNED, ALWAYS ══════════════════════════════════════════════════════════════════
 *      parse(src)             → { ok:true, ast, fields:[…], returns }  |  { ok:false, why, detail }
 *      evaluate(ast,row,env)  → { value }  |  { value:null, error:{ why, detail } }   — never throws
 *      compile(src,env)       → { ok:true, fn(row) → {value,error?}, ast, fields, returns }
 *                             |  { ok:false, why, detail }
 *      functions()            → [{ name, arity:[min,max], returns, doc, unit:{rule,args?} }]
 *
 *  A parse failure carries WHERE: `detail.at` is the character offset, `detail.token` what was found,
 *  `detail.expected` what would have been accepted — so a panel can write one sentence the reader
 *  can act on instead of 「式が不正です」.
 *
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY (tests/r175 ③): an unexported top-level declaration in js/
 *  would be a global before the bundle, and this file may not reintroduce one.
 * ==========================================================================*/

export function makeGisExpr() {
  return (function () {

    /* ── what is borrowed, resolved per call ──────────────────────────────────────────────────
       Held as a lookup rather than captured at construction time: this module may be built before
       js/gis-datasets.js publishes, and a captured `undefined` would be permanent. */
    function registry() { try { return (typeof window !== 'undefined' && window.IntMapData) || null; } catch (_) { return null; } }

    /* The number rule is three functions, not one: the verdict (`asNumber`), the evidence that a
       refused numeral was a code rather than text (`typeColumn` → `padded`), and what counts as an
       empty cell (`isEmpty`). All three already exist in js/gis-datasets.js and all three are asked
       rather than re-spelled. */
    const NUMBER_RULE = ['asNumber', 'typeColumn', 'isEmpty'];

    function numberRule(env) {
      const R = env || registry();
      const missing = [];
      for (const k of NUMBER_RULE) { if (!R || typeof R[k] !== 'function') missing.push(k); }
      if (missing.length) return { ok: false, why: 'expr-no-number-rule', detail: { missing } };
      return { ok: true, R };
    }

    /* ── errors: one shape, thrown internally, never escaping ─────────────────────────────────── */

    /* ⚠ THE CODES THIS KERNEL CAN ANSWER WITH, DECLARED (#R738). js/gis-ops.js hands these back to the
       reader verbatim through `compute`, and tests/r729-gis-core-checks ④ measures that every code
       that can reach a reader has a sentence in js/gis-panel.js — by SCANNING the sources. A scan
       finds the spellings it was taught (`why:'…'`, `fail('…')`); these are raised through a
       constructor, so the scan would have found none of them and the gate would have been green over
       nine wordless refusals. Declaring them is the fact the gate can read, and mk() refusing an
       undeclared code is what keeps the declaration from drifting away from the throws. */
    const REFUSALS = ['expr-empty', 'expr-syntax', 'expr-unterminated', 'expr-unknown-function', 'expr-arity',
      'expr-no-number-rule', 'expr-type', 'expr-bad-ast', 'expr-internal'];
    function mk(why, detail) {
      if (REFUSALS.indexOf(why) < 0) throw new Error('gis-expr: undeclared refusal code ' + why);
      const e = new Error(why); e.__gisExpr = { why, detail: detail || {} }; return e;
    }
    function shape(e) {
      if (e && e.__gisExpr) return e.__gisExpr;
      /* An unexpected failure is still an answer, not a throw: evaluate() promises never to throw,
         because it runs once per row and a row that breaks must not take the other rows with it. */
      return { why: 'expr-internal', detail: { message: String((e && e.message) || e) } };
    }

    /* ══ the functions — ONE table ═══════════════════════════════════════════════════════════════
       `arity` is [min, max] with max === null meaning 「いくつでも」. `returns` is the static type a
       call produces, or 'same' when it is whatever its branches are (resolved by the parser).
       `fn(vals, R)` receives already-evaluated arguments; `lazy(nodes, ev)` receives the argument
       NODES, for the three forms that must not evaluate a branch they are not going to use.
       `unit` is what the call does to the unit of its arguments (see the header):
         · keeps          — the answer is in the same unit as the arguments named by `args`, which
                            therefore have to be ONE quantity (js/gis-units.js refuses them if not);
                            `args` omitted means every argument.
         · dimensionless  — the answer is a pure number ('1') whatever went in. ⚠ A JUDGEMENT SITS
                            HERE: strict dimensional analysis requires the ARGUMENT of a logarithm to
                            be dimensionless and would refuse `log([pop])`. Readers write that
                            constantly and the number they get is the one they meant, so it is
                            allowed and only the ANSWER is called dimensionless.
         · no-unit        — the answer is not a quantity at all (text, or a yes/no).
         · changes        — the answer has a unit and no SPELLING for it can be derived. `sqrt(m2)`
                            is metres and `pow(m, 3)` is m³, but deriving either means inventing a
                            spelling nobody wrote — the same line × and ÷ draw in js/gis-units.js.
                            ⚠ 'changes' IS NOT 'no unit': js/gis-units.js answers 「決まらない」,
                            which a reader can be told, instead of silence that reads as 「無次元」. */
    const UNIT_RULES = ['keeps', 'dimensionless', 'no-unit', 'changes'];
    const FUNCS = {
      abs:   { arity: [1, 1], returns: 'number', doc: 'abs(x)', unit: { rule: 'keeps' }, fn: (v, R) => arith1(v[0], R, 'abs', Math.abs) },
      floor: { arity: [1, 1], returns: 'number', doc: 'floor(x)', unit: { rule: 'keeps' }, fn: (v, R) => arith1(v[0], R, 'floor', Math.floor) },
      ceil:  { arity: [1, 1], returns: 'number', doc: 'ceil(x)', unit: { rule: 'keeps' }, fn: (v, R) => arith1(v[0], R, 'ceil', Math.ceil) },
      sqrt:  { arity: [1, 1], returns: 'number', doc: 'sqrt(x)', unit: { rule: 'changes' }, fn: (v, R) => arith1(v[0], R, 'sqrt', Math.sqrt) },
      /* ⚠ log is base 10 and ln is natural, stated by having BOTH: one name `log` would be read as
         whichever the reader's previous tool meant, and a column whose meaning depends on who reads
         it is the defect docs/GIS-CORE.md §1.1 names for dates. */
      log:   { arity: [1, 1], returns: 'number', doc: 'log(x)', unit: { rule: 'dimensionless' }, fn: (v, R) => arith1(v[0], R, 'log', Math.log10) },
      ln:    { arity: [1, 1], returns: 'number', doc: 'ln(x)', unit: { rule: 'dimensionless' }, fn: (v, R) => arith1(v[0], R, 'ln', Math.log) },
      pow:   { arity: [2, 2], returns: 'number', doc: 'pow(x, y)', unit: { rule: 'changes', args: [0] }, fn: (v, R) => arith2(v[0], v[1], R, 'pow', (a, b) => Math.pow(a, b)) },
      /* round(x) and round(x, digits). Half-way values go up, as Math.round does; digits scale by a
         power of ten, so round(2.675, 2) is 2.68 or 2.67 according to the binary representation of
         the input — that is float64, not a choice this file makes. */
      round: {
        arity: [1, 2], returns: 'number', doc: 'round(x[, digits])',
        /* ⚠ `args:[0]` — the digit count is a COUNT, not a length: a unit rule over every argument
           would make round([len], 2) two quantities being mixed. */
        unit: { rule: 'keeps', args: [0] },
        fn: (v, R) => {
          const x = toNumber(v[0], R, 'round');
          if (x == null) return null;
          const dRaw = v.length > 1 ? toNumber(v[1], R, 'round') : 0;
          if (dRaw == null) return null;
          const d = Math.max(0, Math.min(15, Math.trunc(dRaw)));
          const f = Math.pow(10, d);
          return finite(Math.round(x * f) / f);
        },
      },
      /* min/max skip missing values and answer null when everything was missing — the alternative
         (a missing cell dragging the answer to null) would make the two useless on the half-filled
         columns they exist for. A reader who wants missing to win says coalesce(x, …) first. */
      min: { arity: [1, null], returns: 'number', doc: 'min(a, b, …)', unit: { rule: 'keeps' }, fn: (v, R) => extremum(v, R, 'min', -1) },
      max: { arity: [1, null], returns: 'number', doc: 'max(a, b, …)', unit: { rule: 'keeps' }, fn: (v, R) => extremum(v, R, 'max', 1) },
      /* ⚠ if() and coalesce() evaluate only the branch they answer with. Eager evaluation would let
         `if(isnull([x]), 0, [x] * 2)` fail on the very rows the reader wrote the guard for. */
      if: {
        arity: [3, 3], returns: 'same', doc: 'if(cond, a, b)',
        /* The condition is a yes/no and carries no quantity; the two BRANCHES are the answer. */
        unit: { rule: 'keeps', args: [1, 2] }, lazy: (nodes, ev, R) => {
          const c = asBool(ev(nodes[0]), 'if', R);
          if (c == null) return null;                     /* an unknown condition has an unknown answer */
          return ev(c ? nodes[1] : nodes[2]);
        },
      },
      coalesce: {
        arity: [1, null], returns: 'same', doc: 'coalesce(a, b, …)', unit: { rule: 'keeps' }, lazy: (nodes, ev, R) => {
          for (const n of nodes) { const v = ev(n); if (v != null) return v; }
          return null;
        },
      },
      /* number() is the reader's way to say 「これは数として読んでよい」: it answers null where the
         arithmetic operators would refuse with expr-type, and it obeys the same registry rule, so
         number('01100') is null too. */
      number: { arity: [1, 1], returns: 'number', doc: 'number(x)', unit: { rule: 'keeps' }, fn: (v, R) => (R.isEmpty(v[0]) ? null : (typeof v[0] === 'number' ? finite(v[0]) : (typeof v[0] === 'string' ? R.asNumber(v[0]) : null))) },
      text:   { arity: [1, 1], returns: 'text', doc: 'text(x)', unit: { rule: 'no-unit' }, fn: (v, R) => toText(v[0], R) },
      len:    { arity: [1, 1], returns: 'number', doc: 'len(x)', unit: { rule: 'dimensionless' }, fn: (v, R) => { const t = toText(v[0], R); return t == null ? null : chars(t).length; } },
      upper:  { arity: [1, 1], returns: 'text', doc: 'upper(x)', unit: { rule: 'no-unit' }, fn: (v, R) => { const t = toText(v[0], R); return t == null ? null : t.toUpperCase(); } },
      lower:  { arity: [1, 1], returns: 'text', doc: 'lower(x)', unit: { rule: 'no-unit' }, fn: (v, R) => { const t = toText(v[0], R); return t == null ? null : t.toLowerCase(); } },
      trim:   { arity: [1, 1], returns: 'text', doc: 'trim(x)', unit: { rule: 'no-unit' }, fn: (v, R) => { const t = toText(v[0], R); return t == null ? null : t.trim(); } },
      /* concat is the ONLY join, and it reads a missing value as nothing rather than poisoning the
         whole result: 「県名＋市名」 over a table where some rows have no 市 is the ordinary case, and
         answering null for those rows would be answering a question nobody asked. */
      concat: { arity: [1, null], returns: 'text', doc: 'concat(a, b, …)', unit: { rule: 'no-unit' }, fn: (v, R) => v.map((x) => { const t = toText(x, R); return t == null ? '' : t; }).join('') },
      /* substr counts from 1, like the 「◯文字目」 a reader means, and counts CODE POINTS, so a name
         written in kanji or with an emoji is not cut in half. Positions before 1 clamp to 1; there is
         no negative indexing, because 「末尾から」 is a different request and inventing it here would
         be guessing at one. */
      substr: {
        arity: [2, 3], returns: 'text', doc: 'substr(x, start[, len])', unit: { rule: 'no-unit' },
        fn: (v, R) => {
          const t = toText(v[0], R);
          if (t == null) return null;
          const s = toNumber(v[1], R, 'substr');
          if (s == null) return null;
          const cs = chars(t);
          const from = Math.max(0, Math.trunc(s) - 1);
          if (v.length < 3) return cs.slice(from).join('');
          const n = toNumber(v[2], R, 'substr');
          if (n == null) return null;
          return cs.slice(from, from + Math.max(0, Math.trunc(n))).join('');
        },
      },
      /* Case-insensitive, exactly as the `contains` of the filter op is (js/gis-ops.js evalCondition):
         a reader typing a word is choosing a word, not a capitalisation, and the same word must find
         the same rows in the panel and in an expression. */
      contains:   { arity: [2, 2], returns: 'boolean', doc: 'contains(haystack, needle)', unit: { rule: 'no-unit' }, fn: (v, R) => textPair(v, R, (h, n) => h.indexOf(n) >= 0) },
      startswith: { arity: [2, 2], returns: 'boolean', doc: 'startswith(haystack, prefix)', unit: { rule: 'no-unit' }, fn: (v, R) => textPair(v, R, (h, n) => h.indexOf(n) === 0) },
      /* isnull is the one function that never answers null: it is the question 「欠けているか」 and
         that question always has an answer. */
      isnull: { arity: [1, 1], returns: 'boolean', doc: 'isnull(x)', unit: { rule: 'no-unit' }, fn: (v, R) => (v[0] == null || R.isEmpty(v[0])) },
    };

    /* ⚠ A FUNCTION WITHOUT A READABLE UNIT RULE DOES NOT SHIP. The alternative to refusing here is
       the one measured defect this declaration exists to end: a call node whose unit nobody stated,
       answering 「無次元」-looking silence to every reader downstream. This throws at construction, so
       it is one deterministic failure at the first test rather than a quiet wrong number in a column;
       `args` is checked against the declared arity for the same reason (`keeps` over an argument that
       cannot exist would silently name nothing). */
    for (const name of Object.keys(FUNCS)) {
      const u = FUNCS[name].unit;
      if (!u || UNIT_RULES.indexOf(u.rule) < 0) throw new Error('gis-expr: ' + name + '() declares no unit rule');
      if (u.args != null) {
        const max = FUNCS[name].arity[1];
        if (!Array.isArray(u.args) || !u.args.length) throw new Error('gis-expr: ' + name + '() unit.args is not a list of positions');
        for (const i of u.args) {
          if (!Number.isInteger(i) || i < 0 || (max != null && i >= max)) throw new Error('gis-expr: ' + name + '() unit.args names position ' + i + ', which its arity has not got');
        }
      }
    }

    /* ── values ───────────────────────────────────────────────────────────────────────────────── */

    function finite(n) { return (typeof n === 'number' && isFinite(n)) ? n : null; }
    function chars(s) { return Array.from(s); }

    /* Evidence, asked of the registry, that a string it refused as a number was a NUMERAL with a
       leading zero (i.e. an identifier) rather than text. typeColumn() over a single cell reports it
       as `padded`, so the verdict comes from the one implementation of the rule. Memoised per
       registry because a filter over 40,000 rows asks the same handful of shapes over and over. */
    const CODE_CACHE = new WeakMap();
    function isCodeNumeral(R, s) {
      let m = CODE_CACHE.get(R.typeColumn);
      if (!m) { m = new Map(); CODE_CACHE.set(R.typeColumn, m); }
      if (m.has(s)) return m.get(s);
      let v = false;
      try { const col = R.typeColumn('', [s]); v = !!(col && col.padded === 1); } catch (_) { v = false; }
      m.set(s, v);
      return v;
    }

    /* The whole of rule ① ② ④ for one operand. null means MISSING; a throw means 「これは数では
       ないし、数のつもりで書かれてもいない」. */
    function toNumber(v, R, op) {
      if (v == null || R.isEmpty(v)) return null;
      if (typeof v === 'number') return finite(v);
      if (typeof v === 'string') {
        const n = R.asNumber(v);
        if (n != null) return n;
        if (isCodeNumeral(R, v)) return null;              /* 「01100」: an identifier, absent as a number */
        throw mk('expr-type', { op, value: v, got: 'text' });
      }
      throw mk('expr-type', { op, value: String(v), got: typeof v });
    }

    function toText(v, R) {
      if (v == null || R.isEmpty(v)) return null;
      return String(v);
    }

    function asBool(v, op, R) {
      if (v == null || (R && R.isEmpty(v))) return null;
      if (typeof v === 'boolean') return v;
      /* ⚠ No truthiness. `if(1, …)` and `if('', …)` are refused rather than guessed at, because the
         two languages a reader might be coming from disagree about both, and the one this file picked
         would be invisible in the result. */
      throw mk('expr-type', { op, value: String(v), got: typeof v, expected: 'boolean' });
    }

    function arith1(v, R, op, f) { const a = toNumber(v, R, op); return a == null ? null : finite(f(a)); }
    function arith2(a, b, R, op, f) {
      const x = toNumber(a, R, op), y = toNumber(b, R, op);
      if (x == null || y == null) return null;
      return finite(f(x, y));
    }
    function extremum(vals, R, op, sign) {
      let best = null;
      for (const v of vals) {
        const n = toNumber(v, R, op);
        if (n == null) continue;
        if (best == null || (sign > 0 ? n > best : n < best)) best = n;
      }
      return best;
    }
    function textPair(vals, R, f) {
      const h = toText(vals[0], R), n = toText(vals[1], R);
      if (h == null || n == null) return null;
      return f(h.toLowerCase(), n.toLowerCase());
    }

    /* ── comparison: the same pairing js/gis-ops.js filters with ──────────────────────────────────
       Numbers when BOTH sides read as numbers by the registry's rule, text otherwise. Two pairing
       rules would drift, and the drift would appear as a row the filter panel keeps and a computed
       column disagrees with. */
    function cmpPair(R, a, b) {
      const x = R.asNumber(a), y = R.asNumber(b);
      if (x != null && y != null) return { num: true, a: x, b: y };
      return { num: false, a: String(a), b: String(b) };
    }

    function compare(R, op, a, b) {
      const ea = (a == null || R.isEmpty(a)), eb = (b == null || R.isEmpty(b));
      if (op === '=' || op === '!=' || op === '<>') {
        /* Equality against a missing value is the question 「空か」 and it has an answer — the same
           answer evalCondition gives, so `x = null` is true exactly where the filter's `==` with an
           empty operand is true. */
        const c = (ea || eb) ? null : cmpPair(R, a, b);
        const eq = c ? (c.a === c.b) : (ea && eb);
        return op === '=' ? eq : !eq;
      }
      /* Ordering against a missing value is UNKNOWN, not false: `[pop] > 500` on a row with no
         population has no answer, and an expression that answered false would be stating one. (The
         filter op answers false because it must decide whether to keep the row; that is a different
         question with a different obligation.) */
      if (ea || eb) return null;
      const c = cmpPair(R, a, b);
      if (op === '<') return c.a < c.b;
      if (op === '<=') return c.a <= c.b;
      if (op === '>') return c.a > c.b;
      return c.a >= c.b;
    }

    /* ══ tokenizer ═══════════════════════════════════════════════════════════════════════════════
       ⚠ Identifiers are Unicode letters: 「人口」 and 「面積」 are ordinary column names in the data
       this app reads, and a tokenizer built on [A-Za-z_] would make the bracket form compulsory for
       most of Japan. Names with spaces, punctuation or a leading digit take the [ … ] form. */
    const KEYWORDS = new Set(['and', 'or', 'not', 'true', 'false', 'null']);
    const ID_START = /[\p{L}_]/u;
    const ID_PART = /[\p{L}\p{N}_]/u;
    const TWO_CHAR = ['!=', '<>', '<=', '>='];
    const ONE_CHAR = new Set(['+', '-', '*', '/', '%', '(', ')', ',', '=', '<', '>']);

    function tokenize(src) {
      const t = [];
      let i = 0;
      const n = src.length;
      while (i < n) {
        const ch = src[i];
        if (/\s/.test(ch)) { i++; continue; }
        const at = i;

        if (ch === '[') {
          const end = src.indexOf(']', i + 1);
          if (end < 0) throw mk('expr-unterminated', { at, token: '[', expected: ']' });
          const name = src.slice(i + 1, end).trim();
          if (!name) throw mk('expr-syntax', { at, token: '[]', expected: 'column name' });
          t.push({ k: 'field', v: name, at });
          i = end + 1;
          continue;
        }

        if (ch === "'" || ch === '"') {
          let j = i + 1, out = '';
          for (;;) {
            if (j >= n) throw mk('expr-unterminated', { at, token: ch, expected: ch });
            const c = src[j];
            if (c === '\\') {
              const nx = src[j + 1];
              /* Only the three escapes that are needed to write the two quote characters and the
                 backslash itself. `\n` is NOT a newline here: a reader who typed it would get a
                 letter n, and silently turning it into something else is a guess about intent. */
              if (nx !== '\\' && nx !== "'" && nx !== '"') throw mk('expr-syntax', { at: j, token: '\\' + (nx == null ? '' : nx), expected: '\\\\ \\\' \\"' });
              out += nx; j += 2; continue;
            }
            if (c === ch) { j++; break; }
            out += c; j++;
          }
          t.push({ k: 'str', v: out, at });
          i = j;
          continue;
        }

        if (ch >= '0' && ch <= '9') {
          const m = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i));
          const lit = m[0];
          /* ⚠ The same notation rule as the cells (docs/GIS-CORE.md §1.1), applied to what the reader
             typed: decimal notation carries no insignificant leading zero, so `01100` in an
             expression was written as an IDENTIFIER. Reading it as 1100 here would let the one place
             a reader can write a code by hand be the one place it turns into a number. */
          if (/^0\d/.test(lit)) throw mk('expr-syntax', { at, token: lit, expected: 'number without a leading zero' });
          t.push({ k: 'num', v: Number(lit), at });
          i += lit.length;
          continue;
        }

        if (ID_START.test(ch)) {
          let j = i + 1;
          while (j < n && ID_PART.test(src[j])) j++;
          const word = src.slice(i, j);
          const low = word.toLowerCase();
          t.push(KEYWORDS.has(low) ? { k: 'kw', v: low, at } : { k: 'ident', v: word, at });
          i = j;
          continue;
        }

        const two = src.slice(i, i + 2);
        if (TWO_CHAR.indexOf(two) >= 0) { t.push({ k: 'op', v: two, at }); i += 2; continue; }
        if (ONE_CHAR.has(ch)) { t.push({ k: 'op', v: ch, at }); i++; continue; }
        throw mk('expr-syntax', { at, token: ch, expected: 'value, column or operator' });
      }
      t.push({ k: 'end', v: null, at: n });
      return t;
    }

    /* ══ parser (recursive descent, lowest precedence first) ══════════════════════════════════════
           or → and → not → comparison → + - → * / % → unary - → primary                            */
    function parseTokens(t) {
      let p = 0;
      const peek = () => t[p];
      const isOp = (v) => t[p].k === 'op' && t[p].v === v;
      const isKw = (v) => t[p].k === 'kw' && t[p].v === v;
      function want(v, expected) {
        if (!isOp(v)) throw mk('expr-syntax', { at: t[p].at, token: String(t[p].v == null ? '<end>' : t[p].v), expected: expected || v });
        p++;
      }

      function parseOr() {
        let node = parseAnd();
        while (isKw('or')) { p++; node = { t: 'bin', op: 'or', a: node, b: parseAnd() }; }
        return node;
      }
      function parseAnd() {
        let node = parseNot();
        while (isKw('and')) { p++; node = { t: 'bin', op: 'and', a: node, b: parseNot() }; }
        return node;
      }
      function parseNot() {
        if (isKw('not')) { p++; return { t: 'un', op: 'not', a: parseNot() }; }
        return parseComparison();
      }
      function parseComparison() {
        let node = parseAdditive();
        while (t[p].k === 'op' && ['=', '!=', '<>', '<', '<=', '>', '>='].indexOf(t[p].v) >= 0) {
          const op = t[p].v; p++;
          node = { t: 'bin', op: op === '<>' ? '!=' : op, a: node, b: parseAdditive() };
        }
        return node;
      }
      function parseAdditive() {
        let node = parseMultiplicative();
        while (isOp('+') || isOp('-')) { const op = t[p].v; p++; node = { t: 'bin', op, a: node, b: parseMultiplicative() }; }
        return node;
      }
      function parseMultiplicative() {
        let node = parseUnary();
        while (isOp('*') || isOp('/') || isOp('%')) { const op = t[p].v; p++; node = { t: 'bin', op, a: node, b: parseUnary() }; }
        return node;
      }
      function parseUnary() {
        if (isOp('-')) { p++; return { t: 'un', op: '-', a: parseUnary() }; }
        return parsePrimary();
      }
      function parsePrimary() {
        const tok = peek();
        if (tok.k === 'num') { p++; return { t: 'num', v: tok.v }; }
        if (tok.k === 'str') { p++; return { t: 'str', v: tok.v }; }
        if (tok.k === 'field') { p++; return { t: 'field', name: tok.v }; }
        if (tok.k === 'kw') {
          if (tok.v === 'true' || tok.v === 'false') { p++; return { t: 'bool', v: tok.v === 'true' }; }
          if (tok.v === 'null') { p++; return { t: 'null' }; }
          throw mk('expr-syntax', { at: tok.at, token: tok.v, expected: 'value, column or (' });
        }
        if (tok.k === 'ident') {
          p++;
          if (isOp('(')) {
            const name = tok.v.toLowerCase();
            /* The parser knows exactly the names FUNCS declares — there is no second list to fall
               out of step with, and an unknown name is named rather than treated as a column that
               happens to be followed by a bracket. */
            const decl = Object.prototype.hasOwnProperty.call(FUNCS, name) ? FUNCS[name] : null;
            if (!decl) throw mk('expr-unknown-function', { at: tok.at, token: tok.v, expected: 'a function in functions()' });
            p++;
            const args = [];
            if (!isOp(')')) {
              for (;;) {
                args.push(parseOr());
                if (isOp(',')) { p++; continue; }
                break;
              }
            }
            want(')', ')');
            const [min, max] = decl.arity;
            if (args.length < min || (max != null && args.length > max)) {
              throw mk('expr-arity', { at: tok.at, token: tok.v, expected: max == null ? (min + '+') : (min === max ? String(min) : (min + '..' + max)), got: args.length });
            }
            return { t: 'call', name, args };
          }
          return { t: 'field', name: tok.v };
        }
        if (tok.k === 'op' && tok.v === '(') {
          p++;
          const inner = parseOr();
          want(')', ')');
          return inner;
        }
        throw mk('expr-syntax', { at: tok.at, token: String(tok.v == null ? '<end>' : tok.v), expected: 'value, column or (' });
      }

      const ast = parseOr();
      if (t[p].k !== 'end') throw mk('expr-syntax', { at: t[p].at, token: String(t[p].v), expected: '<end>' });
      return ast;
    }

    /* ── static description of a parsed expression ────────────────────────────────────────────── */

    function collectFields(node, out, seen) {
      if (!node || typeof node !== 'object') return;
      if (node.t === 'field') { if (!seen.has(node.name)) { seen.add(node.name); out.push(node.name); } return; }
      if (node.t === 'un') return collectFields(node.a, out, seen);
      if (node.t === 'bin') { collectFields(node.a, out, seen); collectFields(node.b, out, seen); return; }
      if (node.t === 'call') { for (const a of node.args) collectFields(a, out, seen); }
    }

    const ARITH = new Set(['+', '-', '*', '/', '%']);
    const LOGIC = new Set(['and', 'or']);
    const COMPARISON = new Set(['=', '!=', '<', '<=', '>', '>=']);

    function unify(types) {
      let t = null;
      for (const x of types) {
        if (x === 'mixed') return 'mixed';
        if (t == null) t = x;
        else if (t !== x) return 'mixed';
      }
      return t == null ? 'mixed' : t;
    }

    /* 「この式は何を作る列か」. A column reference is 'mixed' because only the data knows — the panel
       that wants a verdict types the RESULT with IntMapData.typeColumn, which is the one typing rule
       (docs/GIS-CORE.md §1.1); this is the static hint, not a claim about the values. */
    function typeOf(node) {
      switch (node.t) {
        case 'num': return 'number';
        case 'str': return 'text';
        case 'bool': return 'boolean';
        case 'null': return 'mixed';
        case 'field': return 'mixed';
        case 'un': return node.op === 'not' ? 'boolean' : 'number';
        case 'bin':
          if (ARITH.has(node.op)) return 'number';
          if (LOGIC.has(node.op) || COMPARISON.has(node.op)) return 'boolean';
          return 'mixed';
        case 'call': {
          const decl = FUNCS[node.name];
          if (!decl) return 'mixed';
          if (decl.returns !== 'same') return decl.returns;
          const branches = node.name === 'if' ? [node.args[1], node.args[2]] : node.args;
          return unify(branches.map(typeOf));
        }
        default: return 'mixed';
      }
    }

    /* ── the public three ─────────────────────────────────────────────────────────────────────── */

    function parse(src) {
      const text = (src == null) ? '' : String(src);
      if (!text.trim()) return { ok: false, why: 'expr-empty', detail: { at: 0, token: '', expected: 'an expression' } };
      try {
        const ast = parseTokens(tokenize(text));
        const fields = [];
        collectFields(ast, fields, new Set());
        return { ok: true, ast, fields, returns: typeOf(ast) };
      } catch (e) {
        const s = shape(e);
        return { ok: false, why: s.why, detail: s.detail };
      }
    }

    function evalNode(node, row, R) {
      if (!node || typeof node !== 'object') throw mk('expr-bad-ast', { node: String(node) });
      switch (node.t) {
        case 'num': return node.v;
        case 'str': return node.v;
        case 'bool': return node.v;
        case 'null': return null;
        case 'field': {
          const raw = (row && typeof row === 'object') ? row[node.name] : undefined;
          /* ⚠ A blank cell becomes MISSING here, once, so every operator below sees one spelling of
             absence instead of four (undefined, null, '', '   '). */
          return (raw === undefined || raw === null || R.isEmpty(raw)) ? null : raw;
        }
        case 'un': {
          if (node.op === '-') { const a = toNumber(evalNode(node.a, row, R), R, '-'); return a == null ? null : finite(-a); }
          if (node.op === 'not') { const b = asBool(evalNode(node.a, row, R), 'not', R); return b == null ? null : !b; }
          throw mk('expr-bad-ast', { op: String(node.op) });
        }
        case 'bin': {
          const op = node.op;
          if (op === 'and') {
            const a = asBool(evalNode(node.a, row, R), 'and', R);
            if (a === false) return false;                 /* false wins, even over unknown */
            const b = asBool(evalNode(node.b, row, R), 'and', R);
            if (b === false) return false;
            return (a == null || b == null) ? null : true;
          }
          if (op === 'or') {
            const a = asBool(evalNode(node.a, row, R), 'or', R);
            if (a === true) return true;                   /* true wins, even over unknown */
            const b = asBool(evalNode(node.b, row, R), 'or', R);
            if (b === true) return true;
            return (a == null || b == null) ? null : false;
          }
          const a = evalNode(node.a, row, R);
          const b = evalNode(node.b, row, R);
          if (COMPARISON.has(op)) return compare(R, op, a, b);
          if (!ARITH.has(op)) throw mk('expr-bad-ast', { op: String(op) });
          const x = toNumber(a, R, op), y = toNumber(b, R, op);
          if (x == null || y == null) return null;         /* rule ①: missing propagates, it is not 0 */
          if (op === '+') return finite(x + y);
          if (op === '-') return finite(x - y);
          if (op === '*') return finite(x * y);
          /* rule ③: a division by zero is not a measurement. Infinity in a column would survive into
             every later sum and mean of it, looking exactly like one. */
          if (y === 0) return null;
          return finite(op === '/' ? x / y : x % y);
        }
        case 'call': {
          const decl = Object.prototype.hasOwnProperty.call(FUNCS, node.name) ? FUNCS[node.name] : null;
          if (!decl) throw mk('expr-unknown-function', { token: String(node.name) });
          const args = Array.isArray(node.args) ? node.args : [];
          const [min, max] = decl.arity;
          if (args.length < min || (max != null && args.length > max)) {
            throw mk('expr-arity', { token: node.name, expected: max == null ? (min + '+') : (min === max ? String(min) : (min + '..' + max)), got: args.length });
          }
          if (decl.lazy) return decl.lazy(args, (n) => evalNode(n, row, R), R);
          return decl.fn(args.map((n) => evalNode(n, row, R)), R);
        }
        default: throw mk('expr-bad-ast', { node: String(node.t) });
      }
    }

    function evaluate(ast, row, env) {
      const rule = numberRule(env);
      if (!rule.ok) return { value: null, error: { why: rule.why, detail: rule.detail } };
      try {
        const v = evalNode(ast, row, rule.R);
        return { value: v === undefined ? null : v };
      } catch (e) {
        const s = shape(e);
        return { value: null, error: { why: s.why, detail: s.detail } };
      }
    }

    function compile(src, env) {
      const p = parse(src);
      if (!p.ok) return p;
      const rule = numberRule(env);
      if (!rule.ok) return { ok: false, why: rule.why, detail: rule.detail };
      const R = rule.R;
      return {
        ok: true,
        ast: p.ast,
        fields: p.fields,
        returns: p.returns,
        /* One row in, one answer out — and the answer carries its own failure, because a single bad
           cell must not stop the 39,999 rows around it. */
        fn: (row) => {
          try { const v = evalNode(p.ast, row, R); return { value: v === undefined ? null : v }; }
          catch (e) { const s = shape(e); return { value: null, error: { why: s.why, detail: s.detail } }; }
        },
      };
    }

    /* The list a UI draws. Derived from FUNCS, with the implementations removed — a panel with its
       own list of names would be exactly the hand-written list this file was built not to have. */
    function functions() {
      return Object.keys(FUNCS).map((name) => ({
        name,
        arity: FUNCS[name].arity.slice(),
        returns: FUNCS[name].returns,
        doc: FUNCS[name].doc,
        /* (#R783) Copied, not handed over: js/gis-units.js reads this list to decide what a call does
           to a unit, and a shared object would let a caller edit the declaration this file enforces. */
        unit: { rule: FUNCS[name].unit.rule, args: FUNCS[name].unit.args ? FUNCS[name].unit.args.slice() : null },
      }));
    }

    /* (#R752) ⚠ WHAT THIS FILE DECIDES IS AN ANSWER, SO IT DECLARES WHICH ONE. `compute` saves its
       expression as a recipe and js/gis-project.js replays it, so a change here — an operator's
       precedence, what a missing cell propagates to, whether a leading zero is arithmetic — silently
       rewrites the numbers in a project a reader saved last week. Until this round the record asked
       two kernels and this was not one of them. The keeper is scripts/gis-kernel-versions.mjs. */
    const KERNEL_VERSION = 'expr-1';

    const API = { parse, evaluate, compile, functions, version: () => KERNEL_VERSION, refusals: () => REFUSALS.slice() };
    try { window.IntMapGisExpr = API; } catch (_) { }
    return API;
  })();
}
