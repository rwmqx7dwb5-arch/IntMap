/* ============================================================================
 *  test-code-only-one — the source-reading instruments have ONE canonical form
 * ----------------------------------------------------------------------------
 *  scripts/code-only.mjs answers every question the 635 copied sites were written to ask (lang, offsets,
 *  literals, parser); tests/helpers/ast.mjs parses the way every AST check needs; and
 *  scripts/comment-strippers.mjs finds a new copy by its shape and holds the rest to a ledger that
 *  only goes down. Each clause below is fed a fixture with the defect present — a rule nobody has
 *  seen fail proves nothing.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codeOnly } from '../scripts/code-only.mjs';
import { commentKind, scanSource, commentStripperProblems } from '../scripts/comment-strippers.mjs';
import { parseSource, walkSource } from './helpers/ast.mjs';

test('code-only: the default is unchanged — comments go, strings, templates and regexes stay', () => {
  const src = "const u = 'https://x.y/*z*/'; // note\nconst r = /[/*]/g; /* a\nb */ f(`${a} // b`);";
  assert.equal(codeOnly(src), "const u = 'https://x.y/*z*/'; \nconst r = /[/*]/g;  \n  f(`${a} // b`);");
});

test('code-only offsets: every index into the result is an index into the source', () => {
  const src = 'a(); /* one\r\ntwo */ b(); // tail\nc();';
  const out = codeOnly(src, { offsets: true });
  assert.equal(out.length, src.length, 'same length');
  assert.equal(out.indexOf('b()'), src.indexOf('b()'), 'code keeps its offset');
  assert.equal(out.split('\n').length, src.split('\n').length, 'same lines');
  assert.ok(!/one|two|tail/.test(out), 'the comment text is gone');
  assert.ok(out.includes('\r\n'), 'a line terminator inside a comment is kept as it was');
});

test('code-only lang: css keeps a url\'s slashes, html only knows <!-- -->, sql knows --', () => {
  /* the JS reading of CSS: `//` in url() is not a comment, and `/` after `%` does not open a regex */
  const css = '.a{background:url(//cdn.x/y.png);width:calc(100% / 3)}/* gone */.b{c:d}';
  assert.equal(codeOnly(css, { lang: 'css' }), '.a{background:url(//cdn.x/y.png);width:calc(100% / 3)}  .b{c:d}');
  assert.notEqual(codeOnly(css), codeOnly(css, { lang: 'css' }), 'and the js reading really does differ on it');
  const html = '<p>keep // this</p><!-- old\nmarkup --><script>/* js */</script>';
  assert.equal(codeOnly(html, { lang: 'html' }), '<p>keep // this</p> \n <script>/* js */</script>');
  const sql = "select '--not a comment', 1 -- a comment\n/* block */ from t; -- it's\n";
  assert.equal(codeOnly(sql, { lang: 'sql' }), "select '--not a comment', 1 \n   from t; \n");
  assert.throws(() => codeOnly('x', { lang: 'cobol' }), /unknown lang/);
});

test('code-only literals:"blank" + parser:"acorn" is the grammar\'s answer, offsets kept', () => {
  const src = "window.A = 1; const s = 'window.B = 2'; /* window.C = 3 */ const t = `x${window.D = 4}y`;";
  const out = codeOnly(src, { parser: 'acorn', literals: 'blank' });
  assert.equal(out.length, src.length);
  assert.match(out, /window\.A = 1/);
  assert.match(out, /window\.D = 4/, 'a substitution is code');
  assert.doesNotMatch(out, /window\.B|window\.C/, 'a quoted word and a comment are not');
  assert.throws(() => codeOnly('const = ;', { parser: 'acorn' }), 'a file the grammar cannot read throws — the caller decides');
  assert.equal(codeOnly('a /* x */ + b', { literals: 'blank' }), codeOnly('a /* x */ + b', { parser: 'acorn', literals: 'blank' }),
    'the scanner and the grammar agree on the ordinary case');
});

test('comment-strippers: every shape a copy took is found, whatever it is called', () => {
  /* the regex pair, inline and unnamed */
  const inline = "const code = read('x').replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ').replace(/(^|[^:])\\/\\/[^\\n]*/g, '$1 ');";
  assert.deepEqual(scanSource(inline).map((s) => s.shape), ['regex', 'regex']);
  /* a scanner written by hand */
  const scanner = "function strip(s){ let o=''; for (let i=0;i<s.length;i++){ const c=s[i], d=s[i+1]; if (c === '/' && d === '*') i = s.indexOf('*/', i); else o += c; } return o; }";
  assert.deepEqual(scanSource(scanner).map((s) => s.shape), ['scanner']);
  /* acorn, blanking the offsets */
  const viaParser = 'acorn.parse(s, { onComment: (b, t, start, end) => spans.push([start, end]) });';
  assert.deepEqual(scanSource(viaParser).map((s) => s.shape), ['parser']);
  /* …and what is NOT a stripper: a URL regex, reading a comment's text, a regex only tested */
  const notOne = "s.replace(/https?:\\/\\/[^/]+/, ''); acorn.parse(s, { onComment: (b, text) => notes.push(text) }); /\\/\\*[\\s\\S]*?\\*\\//.test(s);";
  assert.deepEqual(scanSource(notOne), []);
  assert.equal(commentKind(String.raw`<!--[\s\S]*?-->`), 'html');
  assert.equal(commentKind(String.raw`--[^\n]*`), 'sql');
  assert.equal(commentKind(String.raw`^https?:\/\/`), null);
});

test('comment-strippers: the ledger only goes down, in both directions', () => {
  const measured = { 'tests/a.test.mjs': [{ shape: 'regex', line: 3 }, { shape: 'regex', line: 3 }] };
  assert.deepEqual(commentStripperProblems({ measured, ledger: { pending: { 'tests/a.test.mjs': 2 }, kept: {} } }), []);
  assert.match(commentStripperProblems({ measured, ledger: { pending: { 'tests/a.test.mjs': 1 }, kept: {} } })[0], /allows 1/);
  assert.match(commentStripperProblems({ measured: {}, ledger: { pending: { 'tests/a.test.mjs': 2 }, kept: {} } })[0], /lower the ledger/);
  assert.match(commentStripperProblems({ measured: { 'tests/new.test.mjs': measured['tests/a.test.mjs'] }, ledger: { pending: {}, kept: {} } })[0],
    /import \{ codeOnly \}/, 'a new file with a copy is told where the canonical one is');
});

test('comment-strippers: the tree agrees with its ledger, and every kept entry says why', () => {
  assert.deepEqual(commentStripperProblems(), []);
  const ledger = JSON.parse(readFileSync(new URL('../scripts/comment-strippers-ledger.json', import.meta.url), 'utf8'));
  for (const [f, k] of Object.entries(ledger.kept || {})) assert.ok(k.why && k.why.length > 40, `${f}: a kept stripper says why`);
});

test('helpers/ast: one parse configuration, module then script, and a walk that sees every node', () => {
  const mod = parseSource('import x from "y"; export const a = 1;');
  assert.equal(mod.sourceType, 'module');
  const script = parseSource('with (o) { f(); }');
  assert.equal(script.sourceType, 'script', 'sloppy-mode syntax falls back to a script');
  assert.equal(parseSource('const = ;', { orNull: true }), null);
  assert.throws(() => parseSource('const = ;'));
  const calls = [];
  walkSource('a(); b(() => c());', { CallExpression: (n) => calls.push(n.callee.name) });
  assert.deepEqual(calls.sort(), ['a', 'b', 'c']);
});
