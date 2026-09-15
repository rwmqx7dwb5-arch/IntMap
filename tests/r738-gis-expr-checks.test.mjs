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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

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

test('① 四則・優先順位・括弧・単項マイナス', async () => {
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

test('② 括弧つきの列名と日本語の列名', async () => {
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

test('③ 欠損は伝播し、0 にならない', async () => {
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

test('④ 先頭ゼロのセルは識別子であって数ではない／数の規則を渡さなければ断る', async () => {
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

test('⑤ 0 除算と非有限は null', async () => {
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

test('⑥ `+` は数を足す。文字列の連結は concat が行う', async () => {
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

test('⑦ 構文エラーは位置を返す', async () => {
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

test('⑧ functions() の一覧とパーサが受け付ける関数名が一致する', async () => {
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

test('⑨ 読者の文字列がコードになる経路が無い', () => {
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
