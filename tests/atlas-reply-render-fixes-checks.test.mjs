// Atlas reply rendering — regressions reported 2026-11-17. Each test uses the input shape that failed
// IN PRODUCTION: no "## " heading (the shared helper in atlas-reply-render-checks adds one, which hid the
// reflow path), and KaTeX NOT preloaded (tests/r156.spec.js preloads it, which hid the lazy-load defect).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAtlasReply } from '../js/atlas-reply.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
globalThis.window = globalThis.window || { addEventListener() {} };
globalThis.document = globalThis.document || {
  addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  createElement() { return { style: {}, appendChild() {}, remove() {} }; },
};
const R = makeAtlasReply({}, {
  L: (en) => en, esc, fitTo: (x) => x, fmtVal: (x) => x, highlight: (x) => x, note: () => {}, warn: () => {},
});
const PUA = new RegExp("[\uE000-\uF8FF]");

test('KaTeX is requested when the first formula appears, once, and retried after a failure', async () => {
  const w = globalThis.window;
  delete w.katex;
  let calls = 0, fail = true;
  w.IntMapVendor = { katex() { calls++; return fail ? Promise.reject(new Error('net')) : Promise.resolve().then(() => { w.katex = { renderToString: (t) => '<span class="katex">' + t + '</span>' }; return w.katex; }); } };
  const a = R.mdMini('答えは次のとおりです。\n\n\\[x^2+y^2=z^2\\]\n\n以上です。');
  R.mdMini('もう一つの式 $a+b$ です。');                       /* a second answer while the first load is in flight */
  assert.equal(calls, 1, 'one shared load, started by the render itself');
  assert.match(a, /atl-math-raw/, 'raw until the library arrives');
  await new Promise((r) => setTimeout(r, 10));                  /* the failed load clears itself */
  fail = false;
  R.mdMini('再表示 \\(x\\)');
  assert.equal(calls, 2, 'a render after a failed load retries');
  await new Promise((r) => setTimeout(r, 10));
  const b = R.mdMini('式 \\[x\\]');
  assert.match(b, /class="katex"/, 'once loaded, later answers render directly');
  assert.equal(calls, 2, 'no further loads once present');
  delete w.katex; delete w.IntMapVendor;
});

test('a quote and a list item\'s second paragraph survive a reply without headings', () => {
  const q = R.mdMini('前置きの文がここにあります。\n\n> 一行目の引用\n> 二行目の引用\n\n最後の文です。');
  assert.equal((q.match(/<blockquote/g) || []).length, 1, 'consecutive quote lines are ONE quote');
  const l = R.mdMini('手順は次のとおりです。\n\n1. 最初の項目\n\n   項目の第二段落\n\n2. 次の項目\n\n以上です。');
  assert.equal((l.match(/<ol/g) || []).length, 1, 'one ordered list');
  assert.match(l, /<li[^>]*>[\s\S]*最初の項目[\s\S]*項目の第二段落[\s\S]*<\/li>/, 'the second paragraph is inside its item');
  assert.ok(l.indexOf('項目の第二段落') < l.indexOf('次の項目'), 'and stays before the next item');
});

test('code syntax shown as code is not eaten by the math protection', () => {
  const h = R.mdMini('数式は ``$$x^2$$`` や `\\[y\\]` と書きます。');
  assert.ok(!PUA.test(h), 'no internal placeholder reaches the html');
  assert.ok(h.includes('$$x^2$$') && h.includes('\\[y\\]'), 'the syntax is shown literally');
  assert.equal((h.match(/atl-code-i/g) || []).length, 2);
});

test('table cells go through the shared inline parser; edge pipes are optional', () => {
  const t = R.mdMini('比較です。\n\n名称 | 値\n--- | ---\n*注記* | [リンク](https://example.com/a)\nA | 12\n\n以上。');
  assert.match(t, /<table/, 'a GFM table without outer pipes is a table');
  assert.match(t, /<i>注記<\/i>/, 'inline emphasis in a cell');
  assert.match(t, /<a href="https:\/\/example\.com\/a"/, 'a link in a cell');
  assert.match(t, /<td[^>]*>12<\/td>/, 'the data row stays in the body');
  const m = R.mdMini('| 名称 | 値 |\n|---|---|\nA | 12\n');
  assert.match(m, /<tbody><tr><td[^>]*>A<\/td><td[^>]*>12<\/td>/, 'a body row without outer pipes belongs to the table');
  assert.ok(!/<table/.test(R.mdMini('a | b\n---\nc')), 'a rule under a one-column line is not a table');
});

test('a url with parentheses keeps its whole destination', () => {
  const u = 'https://en.wikipedia.org/wiki/Thing_(test)';
  const h = R.mdMini('参考は [記事](' + u + ') です。 裸のURL ' + u + ' もあります。');
  const hrefs = [...h.matchAll(/<a href="([^"]*)"/g)].map((x) => x[1]);
  assert.deepEqual(hrefs, [u, u]);
  assert.ok(!/<\/a>\)/.test(h), 'no stray parenthesis after the link');
});

test('a longer fence may contain a shorter one', () => {
  const h = R.mdMini('書き方の例です。\n\n````md\n```js\nlet a = 1;\n```\n````\n\n以上。');
  assert.equal((h.match(/class="atl-codewrap"/g) || []).length, 1, 'one code block, not several');
  assert.ok(h.includes('```js'), 'the inner fence is shown as text');
});
