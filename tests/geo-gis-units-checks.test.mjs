/* ============================================================================
 *  GIS · EXPRESSIONS AND QUANTITIES — 式・単位・量の意味
 * ----------------------------------------------------------------------------
 *  js/gis-expr.js (the expression language a computed column is written in) and js/gis-units.js (what
 *  a number is a number OF): arithmetic that carries units, conversions, affine units, refusals of
 *  quantities that cannot be combined, and which aggregations a declared quantity allows.
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { isolate, read } from './helpers/geo-shared.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R738 · the expression language   (was tests/r738-gis-expr-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R738 · 式で計算列を作る — the expression reader (js/gis-expr.js)
 * ----------------------------------------------------------------------------
 *  What this round claimed, and therefore what has to stay true:
 *
 *    ① arithmetic means arithmetic — precedence, brackets and a unary minus
 *    ② a column is referable by name, including 「人 口」 — the names this data actually has
 *    ③ MISSING PROPAGATES AND IS NOT ZERO: 1 + null is null, and a blank column is not a column of 0
 *    ④ a zero-padded cell is a CODE: "01100" * 1 is null, and with no number rule handed over the
 *      module refuses by name instead of inventing one
 *    ⑤ a division by zero, and every non-finite result, is null — not Infinity in a reader's column
 *    ⑥ `+` adds; it does not join text quietly. concat() is how a reader asks for a join
 *    ⑦ a syntax error says WHERE, so the reader can fix the character they typed
 *    ⑧ the function list is ONE list: what functions() advertises is exactly what the parser takes
 *    ⑨ the string a reader types never becomes code — no host-language interpreter in this file
 *
 *  ⚠ ③ ④ ⑤ ARE THE DEFECTS, NOT THE FEATURES. A calculator that reads a blank as 0 answers every
 *  question with a number, and the number is 「少し小さい」 — the failure shape this repository has
 *  recorded often enough to make it a rule. A calculator that reads "01100" as 1100 undoes
 *  docs/GIS-CORE.md §1.1 in the one place a reader can write a municipality code by hand. Both pass
 *  every test that only asks 「is the answer a number」, so these ask for null BY NAME.
 *
 *  ⚠ ⑧ MEASURES THE ABSENCE OF A SECOND LIST. js/gis-ops.js #R732 is the measured precedent: an op
 *  declared in one table and missing from a second answered run() and never appeared on screen.
 * ==========================================================================*/
describe('§ #R738 · the expression language', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* No DOM, no window, no bundle: both modules publish onto `window` inside a try and answer in Node.
     The registry IS the number rule — asNumber, typeColumn and isEmpty are asked of it rather than
     re-spelled in js/gis-expr.js, so the checks below measure the rule the panel and the ops use. */
  async function boot() {
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisExpr } = await import('../js/gis-expr.js');
    return { data: makeGisDatasets(), expr: makeGisExpr() };
  }

  /* One value out of one expression over one row, or the failure that stopped it. */
  function val(expr, data, src, row) {
    const c = expr.compile(src, data);
    assert.equal(c.ok, true, `compile failed for ${src}: ${c.why} ${JSON.stringify(c.detail || {})}`);
    return c.fn(row || {});
  }

  test('#R738 ① 四則・優先順位・括弧・単項マイナス', async () => {
    const { data, expr } = await boot();
    const cases = [
      ['1 + 2 * 3', 7], ['(1 + 2) * 3', 9], ['2 * 3 + 1', 7],
      ['-2 + 1', -1], ['-(2 + 1)', -3], ['2 - -3', 5],
      ['10 / 4', 2.5], ['10 % 4', 2], ['1e3 / 4', 250], ['1.5 * 2', 3],
      ['2 * 3 = 6', true], ['1 < 2 and 2 < 1', false], ['1 < 2 or 2 < 1', true], ['not (1 = 1)', false],
      ['1 <> 2', true], ['1 != 1', false],
    ];
    for (const [src, want] of cases) {
      const r = val(expr, data, src);
      assert.equal(r.error, undefined, `${src} → ${JSON.stringify(r.error)}`);
      assert.equal(r.value, want, src);
    }
    /* The static description is part of the contract: a panel decides what kind of column it is about
       to write from `returns`, before a single row has been read. */
    assert.equal(expr.parse('1 + 2').returns, 'number');
    assert.equal(expr.parse('1 < 2').returns, 'boolean');
    assert.equal(expr.parse("'a'").returns, 'text');
    assert.equal(expr.parse('[x]').returns, 'mixed');
  });

  test('#R738 ② 括弧つきの列名と日本語の列名', async () => {
    const { data, expr } = await boot();
    const row = { '人 口': '1000', '面積': '50', 'name': '札幌' };

    const bracketed = expr.parse('[人 口] / [面積]');
    assert.equal(bracketed.ok, true);
    assert.deepEqual(bracketed.fields, ['人 口', '面積']);
    assert.equal(val(expr, data, '[人 口] / [面積]', row).value, 20);

    /* A name with no spaces needs no brackets, in Japanese as in English: the tokenizer reads Unicode
       letters, because 「面積」 is an ordinary column name in the data this app opens. */
    assert.equal(val(expr, data, '面積 * 2', row).value, 100);
    assert.equal(val(expr, data, "concat(name, '市')", row).value, '札幌市');
    assert.deepEqual(expr.parse('面積 * [人 口] + 面積').fields, ['面積', '人 口']);
  });

  test('#R738 ③ 欠損は伝播し、0 にならない', async () => {
    const { data, expr } = await boot();
    /* Four spellings of absence, one meaning. The empty string and the all-spaces cell are what a CSV
       actually delivers; `null` is what a GeoJSON property delivers; the missing key is what
       docs/GIS-CORE.md §1.2 says a GeoJSON file legitimately does per feature. */
    const row = { blank: '', spaces: '   ', nulled: null, pop: '100' };
    for (const src of ['1 + null', '1 + [blank]', '1 + [spaces]', '1 + [nulled]', '1 + [absent]',
      '[blank] * 2', '[blank] - 1', '[absent] / 2', '-[absent]', 'abs([absent])', 'round([blank], 2)']) {
      const r = val(expr, data, src, row);
      assert.equal(r.error, undefined, `${src} → ${JSON.stringify(r.error)}`);
      assert.equal(r.value, null, `${src} must be null`);
      assert.notEqual(r.value, 0, `${src} must not be 0`);
    }
    /* The reader who wants a blank counted as zero says so, and the claim is then theirs. */
    assert.equal(val(expr, data, 'coalesce([blank], 0) + 1', row).value, 1);
    assert.equal(val(expr, data, '[pop] + 1', row).value, 101);
    /* Ordering against a missing value is unknown, not false — and isnull() always answers. */
    assert.equal(val(expr, data, '[blank] > 500', row).value, null);
    assert.equal(val(expr, data, 'isnull([blank])', row).value, true);
    assert.equal(val(expr, data, 'isnull([pop])', row).value, false);
    /* min/max are for half-filled columns: a missing argument is skipped, not contagious. */
    assert.equal(val(expr, data, 'min([blank], 3, 9)', row).value, 3);
    assert.equal(val(expr, data, 'max([blank], [absent])', row).value, null);
  });

  test('#R738 ④ 先頭ゼロのセルは識別子であって数ではない／数の規則を渡さなければ断る', async () => {
    const { data, expr } = await boot();
    const row = { code: '01100', plain: '1100' };

    /* The verdict and the evidence both come from the registry: asNumber refuses "01100", typeColumn
       reports it as `padded`, and this module reads that as MISSING rather than as text. */
    assert.equal(val(expr, data, "'01100' * 1", row).value, null);
    assert.equal(val(expr, data, '[code] * 1', row).value, null);
    assert.equal(val(expr, data, '[code] + 0', row).value, null);
    assert.equal(val(expr, data, 'number([code])', row).value, null);
    /* The join this rule exists to prevent: the two cells are not the same row. */
    assert.equal(val(expr, data, '[code] = [plain]', row).value, false);
    /* And the digits are never lost — they are text, and text functions still read them. */
    assert.equal(val(expr, data, 'len([code])', row).value, 5);

    for (const env of [undefined, {}, { asNumber: data.asNumber }]) {
      const c = expr.compile('[code] * 1', env);
      assert.equal(c.ok, false);
      assert.equal(c.why, 'expr-no-number-rule');
      assert.ok(Array.isArray(c.detail.missing) && c.detail.missing.length > 0);
      const e = expr.evaluate(expr.parse('[code] * 1').ast, row, env);
      assert.equal(e.value, null);
      assert.equal(e.error.why, 'expr-no-number-rule');
    }
  });

  test('#R738 ⑤ 0 除算と非有限は null', async () => {
    const { data, expr } = await boot();
    for (const src of ['1 / 0', '0 / 0', '-1 / 0', '1 % 0', 'sqrt(-1)', 'ln(0)', 'log(0)', 'pow(10, 400)']) {
      const r = val(expr, data, src);
      assert.equal(r.error, undefined, `${src} → ${JSON.stringify(r.error)}`);
      assert.equal(r.value, null, `${src} must be null`);
    }
    /* Nothing non-finite reaches a column, by any route, including a hostile cell. */
    const r = val(expr, data, '[x] * 2', { x: Infinity });
    assert.equal(r.value, null);
    assert.equal(val(expr, data, '[x] + 1', { x: NaN }).value, null);
  });

  test('#R738 ⑥ `+` は数を足す。文字列の連結は concat が行う', async () => {
    const { data, expr } = await boot();
    const bad = val(expr, data, "'a' + 1");
    assert.equal(bad.value, null);
    assert.equal(bad.error.why, 'expr-type');
    assert.equal(val(expr, data, "'あ' * 2").error.why, 'expr-type');
    assert.equal(val(expr, data, '[t] + 1', { t: '12 km' }).error.why, 'expr-type');

    assert.equal(val(expr, data, "concat('a', 1)").value, 'a1');
    assert.equal(val(expr, data, "concat([a], '-', [b])", { a: '東京', b: '都' }).value, '東京-都');
    /* A text cell that reads as a number is still a number: a CSV delivers 「1000」 as a string, and
       refusing to add it would take arithmetic away from every imported table. */
    assert.equal(val(expr, data, '[a] + [b]', { a: '1000', b: '24' }).value, 1024);
    /* The text functions, measured once each, because a panel lists them. */
    assert.equal(val(expr, data, "upper('ab')").value, 'AB');
    assert.equal(val(expr, data, "lower('AB')").value, 'ab');
    assert.equal(val(expr, data, "trim('  a  ')").value, 'a');
    assert.equal(val(expr, data, "substr('札幌市中央区', 4, 3)").value, '中央区');
    assert.equal(val(expr, data, "contains('Tokyo', 'tok')").value, true);
    assert.equal(val(expr, data, "startswith('Tokyo', 'kyo')").value, false);
    assert.equal(val(expr, data, "text(12) ").value, '12');
    assert.equal(val(expr, data, "if([a] > 10, 'big', 'small')", { a: '11' }).value, 'big');
  });

  test('#R738 ⑦ 構文エラーは位置を返す', async () => {
    const { data, expr } = await boot();
    const cases = [
      ['1 +', 'expr-syntax', 3],
      ['foo(', 'expr-unknown-function', 0],
      ['[人口', 'expr-unterminated', 0],
      ["'abc", 'expr-unterminated', 0],
      ['abs(1', 'expr-syntax', 5],
      ['1 2', 'expr-syntax', 2],
      ['* 2', 'expr-syntax', 0],
      ['abs(1, 2)', 'expr-arity', 0],
      ['0123', 'expr-syntax', 0],
    ];
    for (const [src, why, at] of cases) {
      const p = expr.parse(src);
      assert.equal(p.ok, false, src);
      assert.equal(p.why, why, src);
      assert.equal(p.detail.at, at, `${src} → at ${p.detail.at}`);
      assert.equal(typeof p.detail.token, 'string', src);
      assert.ok(p.detail.expected !== undefined, src);
    }
    const empty = expr.parse('   ');
    assert.equal(empty.ok, false);
    assert.equal(empty.why, 'expr-empty');
    /* compile() reports the parse failure unchanged — a caller must not have to parse twice to learn
       where the reader's caret should go. */
    const c = expr.compile('1 +', data);
    assert.equal(c.ok, false);
    assert.equal(c.detail.at, 3);
  });

  test('#R738 ⑧ functions() の一覧とパーサが受け付ける関数名が一致する', async () => {
    const { expr } = await boot();
    const list = expr.functions();
    assert.ok(list.length >= 20);

    const declared = new Set();
    for (const f of list) {
      assert.equal(typeof f.name, 'string');
      assert.ok(Array.isArray(f.arity) && f.arity.length === 2 && typeof f.arity[0] === 'number');
      assert.ok(['number', 'text', 'boolean', 'same'].includes(f.returns), f.name);
      assert.ok(typeof f.doc === 'string' && f.doc.startsWith(f.name + '('), f.name);
      declared.add(f.name);
      /* Every advertised name parses with its advertised minimum arity, and one argument fewer is
         refused by the same declaration — the arity on screen is the arity enforced. */
      const args = new Array(f.arity[0]).fill('1').join(', ');
      const ok = expr.parse(`${f.name}(${args})`);
      assert.equal(ok.ok, true, `${f.name} with ${f.arity[0]} args: ${ok.why}`);
      if (f.arity[0] > 0) {
        const short = expr.parse(`${f.name}(${new Array(f.arity[0] - 1).fill('1').join(', ')})`);
        assert.equal(short.ok, false, `${f.name} accepted too few arguments`);
        assert.equal(short.why, 'expr-arity');
      }
      if (f.arity[1] != null) {
        const many = expr.parse(`${f.name}(${new Array(f.arity[1] + 1).fill('1').join(', ')})`);
        assert.equal(many.ok, false, `${f.name} accepted too many arguments`);
        assert.equal(many.why, 'expr-arity');
      }
    }

    /* And nothing the list does not advertise is accepted. These are the names a reader arriving from
       Excel, SQL or QGIS would try; each must be REFUSED BY NAME rather than read as a column that
       happens to be followed by a bracket. */
    for (const absent of ['sin', 'cos', 'sum', 'avg', 'count', 'replace', 'left', 'right', 'now',
      'year', 'nullif', 'iif', 'case', 'mod', 'int', 'str', 'format', 'area', 'length']) {
      if (declared.has(absent)) continue;
      const p = expr.parse(`${absent}(1)`);
      assert.equal(p.ok, false, `${absent}() parsed but is not in functions()`);
      assert.equal(p.why, 'expr-unknown-function', absent);
    }
    /* Case does not make a new function: ABS() is abs(). */
    assert.equal(expr.parse('ABS(1)').ok, true);
  });

  test('#R738 ⑨ 読者の文字列がコードになる経路が無い', () => {
    /* 綴りのまま: 主張が「2 つ目が無い／1 か所だけ」という構造の不在で、実行した答えからは不在を観測できない（eval／Function が無いこと）。 */
    const src = read('js/gis-expr.js');
    /* Measured on the source of this module, not on a promise in a comment: the two constructs that
       would turn a typed string into running code. `evaluate(` is not one of them — the needle is the
       call, not the letters. */
    assert.equal(/\beval\s*\(/.test(src), false, 'js/gis-expr.js must not call the host interpreter');
    assert.equal(/\bnew\s+Function\b/.test(src), false, 'js/gis-expr.js must not compile a string into a function');
    assert.equal(/\bFunction\s*\(\s*['"`]/.test(src), false, 'js/gis-expr.js must not compile a string into a function');
    assert.equal(/\bimport\s*\(/.test(src), false, 'js/gis-expr.js must not load code at all');
    /* The file is the factory and nothing else (tests/r175 ③ keeps globals out of js/). */
    assert.ok(/export function makeGisExpr\(\)/.test(src));
    assert.equal((src.match(/^export /gm) || []).length, 1);
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R774 · units in arithmetic   (was tests/r774-gis-units-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R774 · 単位の違う 2 つの量を、引き算してはならない
 * ----------------------------------------------------------------------------
 *  ⚠ MEASURED ON THE SHIPPED BUILD (2026-09-17, commit 5d5f9312), both `ok:true`:
 *      1000 m − 1 km    →   999      unit null
 *      10 °C − 283.15 K → −273.15    unit null
 *  Both differences are ZERO. js/gis-raster.js kept the unit when the two spellings were equal and
 *  wrote null when they were not — and subtracted the raw numbers either way. ⚠ DROPPING THE LABEL
 *  OFF A WRONG NUMBER REMOVES THE EVIDENCE, NOT THE ERROR ([[intmap-a-fix-that-removes-the-evidence]]),
 *  and every chart, zonal statistic and Atlas answer downstream then carried it with no caveat.
 *
 *  ⚠ WHAT IS MEASURED HERE IS THE ANSWER, NOT THE PLUMBING. Every test below runs the real op
 *  through the real registry and reads the REGISTERED RECORD — the values in the grid and the unit
 *  on the band — because the defect was never in the return shape.
 *
 *  ⚠ AND THE RULE IS MEASURED IN MORE THAN ONE CALLER ON PURPOSE. `rasterDiff`, `mosaic`, `compute`
 *  and `rasterCalc` all combine two quantities arithmetically; a fix that lived in `rasterDiff`
 *  would be the 「規則を関数に付ける」 shape .agents/rules/no-ad-hoc-hardcoding.md §3 forbids, and
 *  the only way to tell the two apart from outside is to ask each caller.
 * ==========================================================================*/
describe('§ #R774 · units in arithmetic', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = {};
    globalThis.window = w;
    new Function('window', read('js/geodesy.js'))(w);
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const { makeGisWarp } = await import('../js/gis-warp.js');
    const { makeGisCrs } = await import('../js/gis-crs.js');
    const { makeGisExpr } = await import('../js/gis-expr.js');
    const { makeGisUnits } = await import('../js/gis-units.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
    w.IntMapGisRaster = makeGisRaster(); w.IntMapGisWarp = makeGisWarp(); w.IntMapGisCrs = makeGisCrs();
    w.IntMapGisExpr = makeGisExpr(); w.IntMapGisUnits = makeGisUnits();
    await geometry.ready();
    return { w, data, ops, units: w.IntMapGisUnits };
  }

  const gridOf = (values, unit) => ({
    kind: 'raster', title: 'g', width: values.length, height: 1,
    grid: { west: 0, north: 10, pixelLng: 1, pixelLat: 1 },
    bands: [{ name: 'v', unit: unit === undefined ? null : unit, nodata: null }],
    read: () => Float64Array.from(values), time: null,
  });
  const rowsOf = (props) => ({
    title: 't',
    features: props.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: p })),
  });

  async function diff(ops, data, ua, va, ub, vb) {
    const a = data.add(gridOf(va, ua)), b = data.add(gridOf(vb, ub));
    return ops.run({ op: 'rasterDiff', inputs: [a.id, b.id], params: {} });
  }

  /* ══ ① 同じ量を違う綴りで述べた 2 枚は、換算されてから引かれる ═══════════════════════════════ */

  test('#R774 ① 1000 m − 1 km は 0 であって 999 ではない', async () => {
    const { data, ops } = await boot();
    const r = await diff(ops, data, 'm', [1000], 'km', [1]);
    assert.equal(r.ok, true, '拒まれた: ' + r.why);
    assert.equal(Array.from(r.dataset.read())[0], 0, '換算せずに生の数を引いている');
    /* 答えは A の単位で述べられる——B を A へ直したのだから。 */
    assert.equal(r.dataset.bands[0].unit, 'm', '換算したのに単位を落とした（証拠だけ消える）');
  });

  test('#R774 ① 10 °C − 283.15 K は 0 であって −273.15 ではない（アフィン単位）', async () => {
    const { data, ops } = await boot();
    const r = await diff(ops, data, '°C', [10], 'K', [283.15]);
    assert.equal(r.ok, true, '拒まれた: ' + r.why);
    const v = Array.from(r.dataset.read())[0];
    assert.ok(Math.abs(v) < 1e-9, '読みを差として換算している（オフセットが落ちている）: ' + v);
    assert.equal(r.dataset.bands[0].unit, '°C');
  });

  /* ══ ② 同じ量でないものは、名前を付けて拒む ═══════════════════════════════════════════════════ */

  test('#R774 ② m と kg は引けない — もっともらしい数を返さない', async () => {
    const { data, ops } = await boot();
    const r = await diff(ops, data, 'm', [5], 'kg', [2]);
    assert.equal(r.ok, false, '違う量どうしの差が ok:true で返った');
    assert.equal(r.why, 'unit-mismatch');
    assert.equal(r.detail.a, 'm');
    assert.equal(r.detail.b, 'kg');
    assert.equal(r.detail.verdict, 'incompatible', '読者に「別の量」と「読めない綴り」の区別が届かない');
  });

  test('#R774 ② 読めない綴りが 2 つ違っていたら拒む — 「わからない」は「同じ」ではない', async () => {
    const { data, ops } = await boot();
    const r = await diff(ops, data, 'NDVI', [5], 'EVI', [2]);
    assert.equal(r.ok, false);
    assert.equal(r.why, 'unit-mismatch');
    assert.equal(r.detail.verdict, 'unknown');
  });

  /* ══ ③ 沈黙は不一致ではない（ここを緩めないと、この app のほとんどの格子が拒まれる） ═════════ */

  test('#R774 ③ 片方または両方が単位を述べていなければ、今までどおり引ける', async () => {
    const { data, ops } = await boot();
    for (const [ua, ub] of [['m', null], [null, 'm'], [null, null]]) {
      const r = await diff(ops, data, ua, [5], ub, [2]);
      assert.equal(r.ok, true, ua + ' / ' + ub + ' が拒まれた: ' + r.why);
      assert.equal(Array.from(r.dataset.read())[0], 3);
      assert.equal(r.dataset.bands[0].unit, null, '誰も述べていない単位が出力に付いた');
    }
  });

  test('#R774 ③ 同じ綴りどうしは、この回の前とバイトで同じ答え', async () => {
    const { data, ops } = await boot();
    const r = await diff(ops, data, 'm', [5, 7], 'm', [2, 1]);
    assert.equal(r.ok, true, r.why);
    assert.deepEqual(Array.from(r.dataset.read()), [3, 6]);
    assert.equal(r.dataset.bands[0].unit, 'm');
  });

  /* ══ ④ 欠損の見分けが換算で変わらない ════════════════════════════════════════════════════════ */

  test('#R774 ④ 換算しても、欠損だった画素は欠損のまま（番兵が倍率で別の数にならない）', async () => {
    const { data, ops } = await boot();
    const a = data.add(gridOf([1000, 2000], 'm'));
    const b = data.add({
      kind: 'raster', title: 'b', width: 2, height: 1,
      grid: { west: 0, north: 10, pixelLng: 1, pixelLat: 1 },
      bands: [{ name: 'v', unit: 'km', nodata: -9999 }],
      read: () => Float64Array.from([1, -9999]), time: null,
    });
    const r = await ops.run({ op: 'rasterDiff', inputs: [a.id, b.id], params: {} });
    assert.equal(r.ok, true, r.why);
    const out = Array.from(r.dataset.read());
    assert.equal(out[0], 0, '換算された画素の差が 0 でない');
    assert.ok(Number.isNaN(out[1]), '番兵 −9999 が換算されて実測値になった: ' + out[1]);
    assert.equal(r.stats.nodata, 1, '欠損が 1 画素と数えられていない');
  });

  /* ══ ⑤ 規則は rasterDiff のものではない — 他の呼び手も同じ答えを返す ═════════════════════════ */

  test('#R774 ⑤ mosaic の mean も換算してから平均する', async () => {
    const { data, ops } = await boot();
    const a = data.add(gridOf([1000], 'm')), b = data.add(gridOf([1], 'km'));
    const r = await ops.run({ op: 'mosaic', inputs: [a.id, b.id], params: { overlap: 'mean', method: 'nearest' } });
    assert.equal(r.ok, true, r.why);
    assert.equal(Array.from(r.dataset.read())[0], 1000, '1000 m と 1 km の平均が 500.5 になっている');
    assert.equal(r.dataset.bands[0].unit, 'm');
  });

  test('#R774 ⑤ mosaic も違う量は拒む', async () => {
    const { data, ops } = await boot();
    const a = data.add(gridOf([1], 'm')), b = data.add(gridOf([1], 'kg'));
    const r = await ops.run({ op: 'mosaic', inputs: [a.id, b.id], params: { overlap: 'mean', method: 'nearest' } });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'unit-mismatch');
  });

  test('#R774 ⑤ compute の + と − も、2 列が別々の単位を述べていたら拒む', async () => {
    const { data, ops } = await boot();
    const ds = data.add(rowsOf([{ len: 1000, dist: 1 }]));
    data.declareField(ds.id, 'len', { unit: 'm' });
    data.declareField(ds.id, 'dist', { unit: 'km' });
    const r = await ops.run({ op: 'compute', inputs: [ds.id], params: { expr: 'len + dist', outName: 'out' } });
    assert.equal(r.ok, false, '「m + km」が列として登録された');
    assert.equal(r.why, 'unit-mismatch');
    assert.equal(r.detail.op, '+', 'どの演算子で衝突したのかが読者に届かない');
  });

  test('#R774 ⑤ rasterCalc の a − b も、2 バンドが別々の単位を述べていたら拒む', async () => {
    const { data, ops } = await boot();
    const a = data.add(gridOf([1000], 'm')), b = data.add(gridOf([1], 'km'));
    const r = await ops.run({ op: 'rasterCalc', inputs: [a.id, b.id], params: { expr: 'a - b', outName: 'd' } });
    assert.equal(r.ok, false, '読者の式の中で m と km が黙って引かれた');
    assert.equal(r.why, 'unit-mismatch');
  });

  /* ══ ⑥ 式の中では換算しない（読者の算術を黙って書き換えない） ═══════════════════════════════ */

  test('#R774 ⑥ compute はリテラルを中立に扱う — t − 273.15 は拒まれない', async () => {
    const { data, ops } = await boot();
    const ds = data.add(rowsOf([{ t: 300 }]));
    data.declareField(ds.id, 't', { unit: 'K' });
    const r = await ops.run({ op: 'compute', inputs: [ds.id], params: { expr: 't - 273.15', outName: 'c' } });
    assert.equal(r.ok, true, 'リテラルを単位ありとして扱っている: ' + r.why);
    assert.equal(r.dataset.features()[0].properties.c, 300 - 273.15);
  });

  test('#R774 ⑥ 同じ単位どうしの + は通り、その単位が出力の列に付く（#R759 が付けられなかった半分）', async () => {
    const { data, ops } = await boot();
    const ds = data.add(rowsOf([{ a: 1, b: 2 }]));
    data.declareField(ds.id, 'a', { unit: 'm' });
    data.declareField(ds.id, 'b', { unit: 'm' });
    const r = await ops.run({ op: 'compute', inputs: [ds.id], params: { expr: 'a + b', outName: 'sum' } });
    assert.equal(r.ok, true, r.why);
    const col = r.dataset.fields.find((f) => f.name === 'sum');
    assert.ok(col, '列が無い');
    assert.equal(col.unit, 'm', '和の単位が誰にも届いていない');
    /* 著者は op であって読者でも入力でもない。js/gis-datasets.js applyInherited が
       unitStated を 'inherited' にし、元の主張者を unitStatedAt に残す。 */
    assert.equal(col.unitStatedAt, 'derived');
    assert.equal(col.unitFrom, 'compute');
  });

  test('#R774 ⑥ × と ÷ は綴りを発明しない', async () => {
    const { data, ops } = await boot();
    const ds = data.add(rowsOf([{ pop: 100, area: 4 }]));
    data.declareField(ds.id, 'pop', { unit: '1' });
    data.declareField(ds.id, 'area', { unit: 'km2' });
    const r = await ops.run({ op: 'compute', inputs: [ds.id], params: { expr: 'pop / area', outName: 'dens' } });
    assert.equal(r.ok, true, r.why);
    const col = r.dataset.fields.find((f) => f.name === 'dens');
    assert.ok(col.unit == null, '誰も書いていない「1/km2」が列に付いた: ' + col.unit);
  });

  /* ══ ⑦ 換算表そのもの — 定数は SI の定義値で、この app が測ったものではない ═══════════════════ */

  test('#R774 ⑦ compare は 5 つの答えを返し分ける', async () => {
    const { units } = await boot();
    assert.equal(units.compare('m', 'm').verdict, 'identical');
    assert.equal(units.compare('m', 'km').verdict, 'convertible');
    assert.equal(units.compare('m', 'kg').verdict, 'incompatible');
    assert.equal(units.compare('NDVI', 'EVI').verdict, 'unknown');
    assert.equal(units.compare('m', null).verdict, 'unstated');
    assert.equal(units.compare('', 'm').verdict, 'unstated', '空文字は「無次元」ではなく「述べていない」');
  });

  test('#R774 ⑦ 合成した単位は表に並べず、解析される', async () => {
    const { units } = await boot();
    for (const [a, b] of [['mm/h', 'm/s'], ['km/h', 'kn'], ['m2', 'km2'], ['m²', 'm2'], ['hPa', 'Pa'], ['W/m2', 'kW/m2'], ['µg/m3', 'kg/m3']]) {
      assert.equal(units.compare(a, b).verdict, 'convertible', a + ' と ' + b + ' が同じ量と読めていない');
    }
    assert.equal(units.compare('m/s', 'm/s2').verdict, 'incompatible', '指数が読まれていない');
  });

  test('#R774 ⑦ 換算の値が定義どおり（測る対象の外に書いた期待値）', async () => {
    const { units } = await boot();
    const near = (got, want, why) => assert.ok(Math.abs(got - want) < 1e-9, why + ': ' + got);
    near(units.convert(1, 'km', 'm'), 1000, '1 km');
    near(units.convert(1, 'mi', 'm'), 1609.344, '1 mile — 1959 international agreement');
    near(units.convert(1, 'ft', 'm'), 0.3048, '1 foot');
    near(units.convert(1, 'lb', 'kg'), 0.45359237, '1 pound');
    near(units.convert(1, 'nmi', 'm'), 1852, '1 nautical mile');
    near(units.convert(1, 'atm', 'Pa'), 101325, 'standard atmosphere');
    near(units.convert(1, 'ha', 'm2'), 10000, '1 hectare');
    near(units.convert(212, '°F', '°C'), 100, '212 °F is boiling');
    near(units.convert(32, '°F', '°C'), 0, '32 °F is freezing');
    near(units.convert(0, '°C', 'K'), 273.15, '0 °C');
  });

  test('#R774 ⑦ 読みの換算と、差の換算は別（アフィン単位でだけ違う）', async () => {
    const { units } = await boot();
    assert.equal(units.convert(10, '°C', 'K'), 283.15);
    assert.equal(units.convert(10, '°C', 'K', { difference: true }), 10);
    /* 非アフィンではどちらも同じ。ここが違ったら difference が余計なことをしている。 */
    assert.equal(units.convert(1, 'km', 'm'), units.convert(1, 'km', 'm', { difference: true }));
  });

  test('#R774 ⑦ 合成の中のアフィン原子はオフセットを持たない（°C/km は気温減率）', async () => {
    const { units } = await boot();
    const p = units.parse('°C/km');
    assert.equal(p.affine, false, '減率にオフセットが効いている');
    assert.equal(p.off, 0);
    assert.equal(units.compare('°C/km', 'K/m').verdict, 'convertible');
  });

  /* ══ ⑧ 単位のカーネルが無いビルドでは、何も拒まず何も換算しない ═══════════════════════════════ */

  test('#R774 ⑧ js/gis-units.js が載っていなければ、この回の前と同じ答えに戻る（黙って「合っている」とは言わない）', async () => {
    const { w, data, ops } = await boot();
    delete w.IntMapGisUnits;
    const r = await diff(ops, data, 'm', [1000], 'km', [1]);
    assert.equal(r.ok, true, 'カーネルが無いのに拒んだ');
    assert.equal(Array.from(r.dataset.read())[0], 999, '載っていないモジュールが答えを変えている');
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R783 · quantity semantics   (was tests/r783-quantity-semantics-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R783 · 「わからない」は「無次元」ではない／単位だけでは量の意味は決まらない
 * ----------------------------------------------------------------------------
 *  外部監査 §4.1 / §4.2。⚠ 二つとも、直す前にこのファイルで実測してから書いた。
 *
 *  ① MEASURED 2026-09-17 on this checkout, before the fix — `len` は m、`dist` は km と宣言した列:
 *        abs(len)        → { ok:true, unit:null }      ← m と述べた列が、単位の無い列になる
 *        round(len, 2)   → { ok:true, unit:null }
 *        min(len, len)   → { ok:true, unit:null }
 *        coalesce(len,0) → { ok:true, unit:null }
 *        number(len)     → { ok:true, unit:null }
 *        len % len       → { ok:true, unit:null }
 *        len / len       → { ok:true, unit:null }      ← 無次元であることも言えていない
 *        len * dist      → { ok:true, unit:null }      ← 「導けなかった」が同じ null
 *        min(len, dist)  → { ok:true, unit:null }      ⚠⚠⚠ len + dist は拒むのに、拒まれない
 *     つまり **関数呼び出しは全部 unit:null** で、しかもその null が四つの別の事実
 *     （誰も述べていない／無次元／量ではない／導けなかった）を同じ顔で運んでいた。
 *     ⇒ 規則は関数の宣言そのもの（js/gis-expr.js の `unit:{rule}`）に持たせ、歩行は状態を返す。
 *
 *  ② 監査の指摘そのまま:「『人数』の格子でも、その数値がその画素全体の人数なのか、地点に割り当てた
 *     推計値なのかで、区域境界をまたいだときの扱いは変わります。『ミリメートル』の降水量も、1 時間の
 *     積算と 1 か月の積算を、同じ意味では比較できません。」
 *     ⇒ 単位の隣に **種類・空間的な意味・時間的な意味・許される集計** を表せる形を足した。
 *     ⚠ ここで測るのは **表現と検証と既定の扱い** であって、既存データの分類ではない（分類は供給元の
 *     宣言）。⚠ そして **未申告は「合計してよい」と読み替えない** ——それがこの半分の要点。
 *
 *  ⚠ 式はソースを読んで判定しない。全部 **実際に parse して歩かせ**、②は本物の op を通した列で見る。
 * ==========================================================================*/
describe('§ #R783 · quantity semantics', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = {};
    globalThis.window = w;
    new Function('window', read('js/geodesy.js'))(w);
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisExpr } = await import('../js/gis-expr.js');
    const { makeGisUnits } = await import('../js/gis-units.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
    w.IntMapGisExpr = makeGisExpr(); w.IntMapGisUnits = makeGisUnits();
    await geometry.ready();
    return { w, data, ops, expr: w.IntMapGisExpr, units: w.IntMapGisUnits };
  }

  /* 宣言された単位の表は測る対象の外に書く（式の中の綴りと、期待する答えを別に持つ）。 */
  const FIELD_UNITS = { len: 'm', dist: 'km', area: 'km2', share: '1', name: null, plain: null };

  /* 実際に parse して、実際に歩かせる。 */
  function unitOf(expr, units, src) {
    const p = expr.parse(src);
    assert.equal(p.ok, true, src + ' が parse できない: ' + p.why);
    return units.unitOfExpr(p.ast, (n) => (Object.prototype.hasOwnProperty.call(FIELD_UNITS, n) ? FIELD_UNITS[n] : null));
  }

  /* ══ ① すべての式について単位が導出されるか、導けないと述べられる ═══════════════════════════════ */

  test('#R783 ① 関数を通しても単位は落ちない（実測で unit:null だった 6 つ）', async () => {
    const { expr, units } = await boot();
    for (const src of ['abs(len)', 'round(len, 2)', 'min(len, len)', 'max(len, len, len)',
      'coalesce(len, 0)', 'number(len)', 'if(plain > 1, len, len)', 'len % len', '-len', 'abs(abs(len))']) {
      const r = unitOf(expr, units, src);
      assert.equal(r.ok, true, src + ' が拒まれた: ' + r.why);
      assert.equal(r.unit, 'm', src + ' の単位が導けていない: ' + JSON.stringify(r));
      assert.equal(r.state, 'stated');
      assert.equal(r.determined, true);
    }
  });

  test('#R783 ① 同じ量として扱われる n 個は、綴りが違えば拒まれる（+ だけの規則ではない）', async () => {
    const { expr, units } = await boot();
    /* 実測: この 4 つは fix 前は ok:true / unit:null で、len + dist だけが拒まれていた。 */
    for (const src of ['min(len, dist)', 'max(len, dist)', 'coalesce(len, dist)', 'if(plain > 1, len, dist)',
      'len % dist', 'len + dist', 'len > dist']) {
      const r = unitOf(expr, units, src);
      assert.equal(r.ok, false, src + ' が通った（m と km が一つの量として扱われている）');
      assert.equal(r.why, 'unit-mismatch');
      assert.equal(r.detail.a, 'm');
      assert.equal(r.detail.b, 'km');
      assert.ok(r.detail.op, 'どこで衝突したのかが読者に届かない: ' + JSON.stringify(r.detail));
    }
  });

  test('#R783 ① 「決まらない」と「無次元」と「誰も述べていない」と「量ではない」は別の答え', async () => {
    const { expr, units } = await boot();
    const st = (src) => unitOf(expr, units, src);

    /* 導けなかった——単位はあるが綴りが無い。 */
    for (const src of ['len * dist', 'sqrt(area)', 'pow(len, 2)', '1 / len', 'len * area']) {
      const r = st(src);
      assert.equal(r.ok, true, src);
      assert.equal(r.state, 'undetermined', src + ' が「決まらない」と述べていない: ' + JSON.stringify(r));
      assert.equal(r.determined, false, src);
      assert.ok(r.why, src + ': 理由が無い');
    }

    /* 無次元——導けた結果が純粋な数。⚠ 綴り '1' を持つので、沈黙と区別できる。 */
    for (const src of ['len / len', 'area / area', 'log(len)', 'ln(plain)', 'len(name)', 'share']) {
      const r = st(src);
      assert.equal(r.state, 'dimensionless', src + ' が無次元と述べていない: ' + JSON.stringify(r));
      assert.equal(r.unit, '1', src);
      assert.equal(r.determined, true, src);
    }

    /* 誰も述べていない——列は実在するが単位の宣言が無い。沈黙であって無次元ではない。 */
    const silent = st('plain + plain');
    assert.equal(silent.state, 'unstated');
    assert.equal(silent.unit, null);
    assert.notEqual(silent.state, 'dimensionless', '沈黙が無次元として扱われている');

    /* 量ではない——文字列と真偽。 */
    for (const src of ['upper(name)', 'concat(name, name)', 'isnull(len)', 'len > 1', 'plain > 1 and plain < 9']) {
      const r = st(src);
      assert.equal(r.state, 'non-quantity', src + ': ' + JSON.stringify(r));
      assert.equal(r.unit, null, src);
    }

    /* リテラルは中立——単位を主張もしないし、他を縛らない（#R774 の判断を壊していない）。 */
    assert.equal(st('2 * 3').state, 'neutral');
    assert.equal(st('len - 273.15').unit, 'm', 'リテラルが単位ありとして扱われている');

    /* ⚠ 四つの状態のうち三つは unit が null で、fix 前はその null しか無かった。 */
    const nulls = ['len * dist', 'plain + plain', 'upper(name)'].map((s) => st(s));
    assert.deepEqual(nulls.map((r) => r.unit), [null, null, null]);
    assert.equal(new Set(nulls.map((r) => r.state)).size, 3, '三つの別の事実が一つの答えに戻っている');
  });

  test('#R783 ① 単位の規則は関数の宣言そのものから来る（この file に名前の写しが無い）', async () => {
    const { w, expr, units } = await boot();
    const list = expr.functions();
    assert.ok(list.length >= 20);
    const rules = new Set();
    for (const f of list) {
      assert.ok(f.unit && typeof f.unit.rule === 'string', f.name + '() が単位の規則を宣言していない');
      rules.add(f.unit.rule);
      if (f.unit.args != null) assert.ok(Array.isArray(f.unit.args) && f.unit.args.length, f.name);
    }
    assert.ok(rules.size >= 3, '規則が 1 種類しか使われていない（宣言が形だけ）');

    /* ⚠ 写しが無いことを、ソースを読まずに測る: 宣言を差し替えたら答えが変わるなら、答えは宣言から
       来ている。差し替えを元に戻さないと他のテストに漏れるので、この test の中だけで戻す。 */
    const real = w.IntMapGisExpr;
    const parsed = expr.parse('abs(len)');
    w.IntMapGisExpr = {
      functions: () => real.functions().map((f) => (f.name === 'abs' ? Object.assign({}, f, { unit: { rule: 'dimensionless', args: null } }) : f)),
    };
    try {
      const swapped = units.unitOfExpr(parsed.ast, (n) => FIELD_UNITS[n] || null);
      assert.equal(swapped.state, 'dimensionless', 'js/gis-units.js が自前の関数一覧で答えている');
    } finally { w.IntMapGisExpr = real; }

    /* 規則を述べていない関数は「決まらない」——黙って無次元にしない。 */
    w.IntMapGisExpr = { functions: () => real.functions().map((f) => (f.name === 'abs' ? { name: 'abs', arity: [1, 1], returns: 'number', doc: 'abs(x)' } : f)) };
    try {
      const bare = units.unitOfExpr(parsed.ast, (n) => FIELD_UNITS[n] || null);
      assert.equal(bare.state, 'undetermined');
      assert.equal(bare.why, 'unit-rule-undeclared');
    } finally { w.IntMapGisExpr = real; }
  });

  test('#R783 ① 新しい関数は単位の規則を述べなければ載らない（宣言が形骸化しない）', async () => {
    /* js/gis-expr.js は構築時に自分の表を検める。規則の無い関数が一つでもあれば app は建たない。 */
    const src = read('js/gis-expr.js');
    assert.ok(/declares no unit rule/.test(src), '規則の無い関数を拒む番人が無い');
    const { makeGisExpr } = await import('../js/gis-expr.js');
    assert.doesNotThrow(() => makeGisExpr(), '現在の表が自分の番人を通っていない');
  });

  /* ══ ② 導いた単位は、本物の op を通った列に付く ═══════════════════════════════════════════════ */

  const rowsOf = (props) => ({
    title: 't',
    features: props.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: p })),
  });

  test('#R783 ② compute の出力列が、関数を通しても単位を持つ（実測では持っていなかった）', async () => {
    const { data, ops } = await boot();
    const ds = data.add(rowsOf([{ len: -5, dist: 2 }]));
    data.declareField(ds.id, 'len', { unit: 'm' });
    data.declareField(ds.id, 'dist', { unit: 'km' });

    const r = await ops.run({ op: 'compute', inputs: [ds.id], params: { expr: 'abs(len)', outName: 'a' } });
    assert.equal(r.ok, true, r.why);
    assert.equal(r.dataset.features()[0].properties.a, 5);
    const col = r.dataset.fields.find((f) => f.name === 'a');
    assert.equal(col.unit, 'm', '関数を通った列の単位が誰にも届いていない');
    assert.equal(col.unitStatedAt, 'derived');
    assert.equal(col.unitFrom, 'compute');

    /* そして m と km を一つの量として扱う式は、+ と同じ理由で拒まれる。 */
    const bad = await ops.run({ op: 'compute', inputs: [ds.id], params: { expr: 'min(len, dist)', outName: 'b' } });
    assert.equal(bad.ok, false, 'min(m, km) が列として登録された');
    assert.equal(bad.why, 'unit-mismatch');
    assert.equal(bad.detail.op, 'min');
  });

  /* ══ ③ 量の意味——単位の隣に何を持たせられるか ═══════════════════════════════════════════════ */

  test('#R783 ③ 語彙は公開され、宣言はその語彙で検証される', async () => {
    const { units } = await boot();
    const v = units.quantityVocabulary();
    for (const k of ['count', 'amount', 'density', 'intensity', 'ratio', 'category']) {
      assert.ok(v.kinds.some((x) => x.kind === k), k + ' が語彙に無い');
    }
    assert.deepEqual(v.spaces.slice().sort(), ['perArea', 'point', 'total']);
    assert.ok(v.times.some((t) => t.time === 'accumulated' && t.needsPeriod === true));
    assert.deepEqual(v.calendarPeriods, ['month', 'year'], '暦の期間は秒を持たないものとして別に運ばれる');

    /* 読めない語は名前を付けて拒む——黙って既定へ落とさない。 */
    assert.equal(units.quantity({ kind: 'people' }).why, 'quantity-kind-unreadable');
    assert.equal(units.quantity({ kind: 'count', space: 'cell' }).why, 'quantity-space-unreadable');
    assert.equal(units.quantity({ kind: 'count', time: 'daily' }).why, 'quantity-time-unreadable');
    assert.equal(units.quantity(null).why, 'quantity-undeclared');
    assert.equal(units.quantity({ unit: 'm' }).why, 'quantity-undeclared', '単位だけでは量の宣言にならない');

    /* 期間を要する時間的意味は、期間が無ければ宣言として不完全。 */
    assert.equal(units.quantity({ kind: 'amount', space: 'total', time: 'accumulated' }).why, 'quantity-period-missing');
    assert.equal(units.quantity({ kind: 'amount', space: 'total', time: 'accumulated', period: 'km' }).why, 'quantity-period-not-a-duration');
    const acc = units.quantity({ kind: 'amount', space: 'total', time: 'accumulated', period: 'h' });
    assert.equal(acc.ok, true, acc.why);
    assert.equal(acc.q.period.seconds, 3600);

    /* 種類が含意する空間的意味は訊き直さない。含意しないものは null のまま（下の ④ が要点）。 */
    assert.equal(units.quantity({ kind: 'density' }).q.space, 'perArea');
    assert.equal(units.quantity({ kind: 'density' }).q.spaceFrom, 'kind');
    assert.equal(units.quantity({ kind: 'count' }).q.space, null);
    assert.equal(units.quantity({ kind: 'count', space: 'total' }).q.spaceFrom, 'stated');

    /* 宣言が自分と矛盾していることは測れる。 */
    assert.equal(units.quantity({ kind: 'ratio', unit: 'm' }).why, 'quantity-unit-contradicts-kind');
    assert.equal(units.quantity({ kind: 'category', unit: 'm' }).why, 'quantity-unit-contradicts-kind');
    assert.equal(units.quantity({ kind: 'ratio', unit: '%' }).ok, true, '割合が % で述べられているのに拒まれた');
  });

  test('#R783 ③ 監査の例: 同じ「人数」でも、画素全体の量か地点の推計かで合計の可否が変わる', async () => {
    const { units } = await boot();
    const whole = { kind: 'count', space: 'total', unit: '1' };
    const atPoint = { kind: 'count', space: 'point', unit: '1' };

    assert.equal(units.aggregation(whole, 'sum').verdict, 'allowed');
    const pt = units.aggregation(atPoint, 'sum');
    assert.equal(pt.verdict, 'refused', '地点の推計値が黙って合計された');
    assert.equal(pt.why, 'summing-point-samples');
    assert.equal(pt.remedy, 'mean');

    /* 平均のほうは逆——地点の値は面積で重みを付けるべき、と述べる。 */
    assert.equal(units.aggregation(whole, 'mean').verdict, 'allowed');
    const m = units.aggregation(atPoint, 'mean');
    assert.equal(m.verdict, 'needs-weight');
    assert.equal(m.weight, 'area');
    assert.equal(m.remedy, 'areaWeightedMean');
  });

  test('#R783 ③ 密度の単純合計は拒まれ、総量への面積重み付けも拒まれる', async () => {
    const { units } = await boot();
    const dens = { kind: 'density', unit: '1/km2' };
    const s = units.aggregation(dens, 'sum');
    assert.equal(s.verdict, 'refused');
    assert.equal(s.why, 'summing-a-density');
    assert.equal(s.remedy, 'multiply-by-area-then-sum');
    assert.equal(units.aggregation(dens, 'areaWeightedMean').verdict, 'allowed');

    /* 逆向きの誤りも拒む: 画素全体の総量を面積で重み付けすると面積を二度数える。 */
    const t = units.aggregation({ kind: 'amount', space: 'total', unit: 'kg' }, 'areaWeightedMean');
    assert.equal(t.verdict, 'refused');
    assert.equal(t.why, 'weighting-a-total');
    assert.equal(t.remedy, 'sum');
  });

  test('#R783 ③ 割合とカテゴリ', async () => {
    const { units } = await boot();
    const ratio = { kind: 'ratio', unit: '%' };
    assert.equal(units.aggregation(ratio, 'sum').verdict, 'refused');
    assert.equal(units.aggregation(ratio, 'sum').why, 'summing-a-ratio');
    const rm = units.aggregation(ratio, 'mean');
    assert.equal(rm.verdict, 'needs-weight');
    assert.equal(rm.weight, 'denominator');

    const cat = { kind: 'category' };
    for (const m of ['sum', 'mean', 'areaWeightedMean', 'min', 'max', 'median']) {
      assert.equal(units.aggregation(cat, m).verdict, 'refused', 'カテゴリが ' + m + ' された');
    }
    assert.equal(units.aggregation(cat, 'majority').verdict, 'allowed');
    assert.equal(units.aggregation(cat, 'count').verdict, 'allowed', '行を数えることは値の集計ではない');
    assert.equal(units.aggregation({ kind: 'amount', space: 'total' }, 'majority').verdict, 'refused');
  });

  test('#R783 ③ 時間の軸は空間の軸と別の問い（瞬時値は時間方向に足せない）', async () => {
    const { units } = await boot();
    const temp = { kind: 'intensity', unit: '°C', time: 'instant' };
    const rainHour = { kind: 'amount', space: 'total', unit: 'mm', time: 'accumulated', period: 'h' };

    const tsum = units.aggregation(temp, 'sum', { over: 'time' });
    assert.equal(tsum.verdict, 'refused');
    assert.equal(tsum.why, 'summing-instantaneous');
    assert.equal(units.aggregation(rainHour, 'sum', { over: 'time' }).verdict, 'allowed');
    assert.equal(units.aggregation(rainHour, 'sum', { over: 'time' }).note, 'periods-must-match');
    assert.equal(units.aggregation(temp, 'mean', { over: 'time' }).verdict, 'allowed');
    /* 面積の重み付けは時間方向には意味を持たない。 */
    assert.equal(units.aggregation(rainHour, 'areaWeightedMean', { over: 'time' }).verdict, 'refused');
    /* 時間的意味を述べていなければ、時間方向の集計は「未申告」。 */
    assert.equal(units.aggregation({ kind: 'amount', space: 'total' }, 'sum', { over: 'time' }).verdict, 'undeclared');
  });

  test('#R783 ③ 監査の例: 1 時間の積算と 1 か月の積算は、単位が同じでも比べられない', async () => {
    const { units } = await boot();
    const hour = { kind: 'amount', space: 'total', unit: 'mm', time: 'accumulated', period: 'h' };
    const month = { kind: 'amount', space: 'total', unit: 'mm', time: 'accumulated', period: { count: 1, calendar: 'month' } };
    assert.equal(units.compare('mm', 'mm').verdict, 'identical', '単位は同じ——だから単位では見分けられない');
    assert.equal(units.comparableQuantity(hour, month).verdict, 'different-period');
    assert.equal(units.comparableQuantity(hour, hour).verdict, 'comparable');
    /* 1 か月 と 30 日 も「同じ」ではない（暦の単位は秒を持たない）。 */
    assert.equal(units.comparableQuantity(month, { kind: 'amount', space: 'total', unit: 'mm', time: 'accumulated', period: { count: 30, unit: 'd' } }).verdict, 'different-period');

    /* 空間的意味・種類が違えば、単位が同じでも比べられない。 */
    const whole = { kind: 'count', space: 'total', unit: '1' }, atPoint = { kind: 'count', space: 'point', unit: '1' };
    assert.equal(units.comparableQuantity(whole, atPoint).verdict, 'different-space');
    assert.equal(units.comparableQuantity(whole, { kind: 'amount', space: 'total', unit: '1' }).verdict, 'different-kind');
    /* 同じ量の違う綴りは、換算すれば比べられる——そう述べる。 */
    const km = { kind: 'amount', space: 'total', unit: 'km' }, m = { kind: 'amount', space: 'total', unit: 'm' };
    const c = units.comparableQuantity(km, m);
    assert.equal(c.verdict, 'comparable');
    assert.equal(c.unit, 'convertible');
    assert.equal(units.comparableQuantity(km, { kind: 'amount', space: 'total', unit: 'kg' }).verdict, 'different-unit');
  });

  /* ══ ④ ⚠⚠⚠ 未申告は「合計してよい」ではない ═══════════════════════════════════════════════════ */

  test('#R783 ④ 量の意味が未申告のものは、どの集計も allowed にならない（行を数えることを除く）', async () => {
    const { units } = await boot();
    /* 今日のこの app のほとんどの列・バンドがこれ——単位だけがあり、意味は誰も述べていない。 */
    for (const spec of [null, undefined, {}, { unit: 'mm' }, { unit: '1' }, 'people']) {
      const all = units.aggregations(spec);
      for (const m of Object.keys(all)) {
        if (m === 'count') { assert.equal(all[m].verdict, 'allowed'); continue; }
        assert.equal(all[m].verdict, 'undeclared',
          JSON.stringify(spec) + ' の ' + m + ' が ' + all[m].verdict + ' になった（沈黙が許可として読まれている）');
        assert.ok(all[m].why, m + ': 理由が無い');
      }
    }
  });

  test('#R783 ④ 種類だけ述べて空間的意味を述べていない「人数」も、合計は未申告のまま', async () => {
    const { units } = await boot();
    /* 監査の指摘そのもの: count は含意しない。density は含意するので訊き直さない。 */
    const bare = units.aggregation({ kind: 'count', unit: '1' }, 'sum');
    assert.equal(bare.verdict, 'undeclared');
    assert.equal(bare.why, 'quantity-space-undeclared');
    assert.equal(units.aggregation({ kind: 'density', unit: '1/km2' }, 'sum').verdict, 'refused');
    /* min / max / median は空間的意味に依らない（どの画素のどの値かを訊いていない）。 */
    assert.equal(units.aggregation({ kind: 'count', unit: '1' }, 'min').verdict, 'allowed');
  });

  test('#R783 ④ 集計の名前そのものが読めなければ、そう述べる（既定へ落ちない）', async () => {
    const { units } = await boot();
    const r = units.aggregation({ kind: 'count', space: 'total' }, 'total');
    assert.equal(r.verdict, 'unreadable');
    assert.equal(r.why, 'aggregation-method-unreadable');
    assert.ok(r.detail.known.includes('sum'));
    assert.equal(units.aggregation({ kind: 'count', space: 'total' }, null).verdict, 'unreadable');
  });

  /* ══ ⑤ 版 — この回は答えを変えたので、そう申告している ═══════════════════════════════════════ */

  test('#R783 ⑤ 単位カーネルの版が上がっている（拒否と導出が変わった）', async () => {
    const { units } = await boot();
    assert.equal(units.version(), 'units-2');
    /* ⚠ 拒否コードは増やしていない: quantity-* は ok:false で op へ返るものではなく、呼び手が読む verdict。 */
    assert.deepEqual(units.refusals(), ['unit-mismatch']);
  });

  ISOLATED.built();
});
