// R494 — the Atlas reply renderer stops being a chain of regular expressions.
//
// ⚠ EVERY TEST HERE RENDERS. #R494 replaced twelve `.replace()` calls with a parser, and the tests
// that broke on the way were, almost without exception, tests that asserted the TEXT OF THOSE CALLS
// — so what they were actually protecting was that the renderer kept being written as a regex chain.
// (tests/r488 recorded the same shape one round earlier: a check that fixes a spelling cannot notice
// when the rule behind the spelling dies.) These ask the renderer questions and read its answers.
//
//   ①  block structure: real <p>/<h1..h6>/<ul>/<ol>/<blockquote>/<hr>, and NO spacer elements
//   ②  nested + ordered lists — the two things the div-with-a-bullet could not express
//   ③  a list item is a container: second paragraph, sub-list, code block
//   ④  multi-line "> " is ONE blockquote
//   ⑤  escaped markdown is literal text
//   ⑥  the #R159/#R154 decisions survive: no bold in the body, headings monochrome and weight 600
//   ⑦  code never becomes markup, highlighted or not
//   ⑧  the heading ladder is a ladder: six distinct sizes
//   ⑨  table columns wrap by CONTENT, and an escaped pipe stays inside its cell
//   ⑩  the seventh source is rendered, not dropped
//   ⑪  Japanese line breaking asks for the strict rule set, not break-word
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeAtlasReply } from '../js/atlas-reply.js';
import { makeAtlasHighlight } from '../js/atlas-highlight.js';
import { atlasPanelCSS } from '../js/atlas-styles.js';

const ROOT = join(fileURLToPath(new URL('../', import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* js/atlas-reply.js wires a document-level click handler at construction. It is fully guarded, but a
   stub keeps the intent visible: this file tests text in → HTML out and touches no DOM. */
globalThis.window = globalThis.window || { addEventListener() {} };
globalThis.document = globalThis.document || {
  addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  createElement() { return { style: {}, appendChild() {}, remove() {} }; },
};

const R = makeAtlasReply({}, {
  L: (en) => en, esc, fitTo: (x) => x, fmtVal: (x) => x, highlight: (x) => x, note: () => {}, warn: () => {},
});
const CSS = atlasPanelCSS();
/* a leading "## " keeps _atlStanza's reflow out of the way, so each test asserts about the PARSER */
const md = (src) => R.mdMini('## _\n\n' + src);

/* ── ① ─────────────────────────────────────────────────────────────────────────────────────── */
test('R494 ① the reply is semantic DOM, and carries no spacer elements', () => {
  const h = md('段落その一。\n\n段落その二。\n\n### 見出し\n\n- 箇条\n\n> 引用\n\n---\n');
  for (const tag of ['<p class="atl-p">', '<h3 class="atl-h atl-h3">', '<ul class="atl-ul">',
    '<li class="atl-li">', '<blockquote class="atl-bq">', '<hr class="atl-hr">']) {
    assert.ok(h.includes(tag), 'renders ' + tag);
  }
  assert.ok(!/atl-gap|style="height:[\d.]+em"/.test(h), 'no empty div is used as vertical space');
  assert.ok(!/<div class="atl-h"/.test(h), 'a heading is a heading element, not a styled div');
  /* the rhythm those spacers used to carry is now a margin that CAN collapse against a heading's */
  assert.match(CSS, /\.atl-p\{margin:0 0 1\.5em;/, 'paragraph gap 1.5em (#R158)');
  assert.match(CSS, /\.atl-ps\{margin-bottom:\.82em;\}/, 'soft (sentence-end) gap .82em (#R150)');
});

/* ── ② ─────────────────────────────────────────────────────────────────────────────────────── */
test('R494 ② nested lists nest, and a numbered list keeps its numbers', () => {
  const h = md('1. 一つめ\n2. 二つめ\n   - 入れ子\n   - もうひとつ\n3. 三つめ\n');
  assert.ok(h.includes('<ol class="atl-ol">'), 'an ordered list is an <ol>, not bullets');
  assert.ok(/<li class="atl-li">二つめ<ul class="atl-ul">/.test(h), 'the sub-list is INSIDE its parent item');
  assert.equal((h.match(/<li class="atl-li">/g) || []).length, 5, 'three items and two sub-items');

  /* ⚠ THE UNSTRUCTURED PATH IS THE ONE THAT WAS BROKEN. _atlStanza reflows a reply the model did not
     structure, and until #R494 it (a) trimmed every line, which destroyed the indent that makes a
     sub-item a sub-item, and (b) rewrote «1.» and «①» to «- », which threw the numbering away. */
  const flat = R.mdMini('前置きの文がここにあります。\n1. 一つめ\n2. 二つめ\n   - 入れ子\n3. 三つめ\n最後の文。');
  assert.ok(flat.includes('<ol class="atl-ol">'), '…including when the reply had no headings at all');
  assert.ok(flat.includes('<ul class="atl-ul">'), '…and the indent survived the reflow');

  const circled = R.mdMini('前置きの文がここにあります。\n① 一つめ\n② 二つめ\n③ 三つめ\n最後の文。');
  assert.ok(circled.includes('<ol class="atl-ol">'), '①-⑳ are an ordered list too');

  const from3 = md('3. 三つめから\n4. 四つめ\n');
  assert.ok(from3.includes('start="3"'), 'a list that does not start at 1 says so');
});

/* ── ③ ─────────────────────────────────────────────────────────────────────────────────────── */
test('R494 ③ a list item is a container, not a line', () => {
  const h = md('- 一つめの段落\n\n  二つめの段落\n\n  ```js\n  const a = 1;\n  ```\n- 次の項目\n');
  const item = h.slice(h.indexOf('<li class="atl-li">'), h.indexOf('</li>'));
  assert.equal((item.match(/<p class="atl-p">/g) || []).length, 2, 'both paragraphs are inside the item');
  assert.ok(item.includes('atl-codeblock'), 'and so is the code block');
  /* the fence was indented to the item's content column; the code must not inherit that indent */
  assert.ok(!/<code id="[^"]*">\s{2,}<span/.test(item), 'the code is dedented to its own left margin');
});

/* ── ④ ─────────────────────────────────────────────────────────────────────────────────────── */
test('R494 ④ consecutive "> " lines are ONE blockquote', () => {
  const h = md('> 一行目\n> 二行目\n> 三行目\n');
  assert.equal((h.match(/<blockquote/g) || []).length, 1, 'one quote, not one per line');
  for (const s of ['一行目', '二行目', '三行目']) assert.ok(h.includes(s), 'keeps ' + s);
  const two = md('> A\n\n通常の段落。\n\n> B\n');
  assert.equal((two.match(/<blockquote/g) || []).length, 2, 'a blank line still ends a quote');
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────────────────────── */
test('R494 ⑤ escaped markdown is literal text', () => {
  const h = md('これは \\*強調ではない\\* し、\\# も \\_下線\\_ も文字です。');
  assert.ok(h.includes('*強調ではない*'), 'the asterisks survive as characters');
  assert.ok(!h.includes('<i>'), '…and produce no italics');
  assert.ok(h.includes('#') && h.includes('_下線_'), 'hashes and underscores too');
  /* ⚠ `\[…\]` IS NOT AN ESCAPED BRACKET PAIR HERE, AND MUST NOT BECOME ONE. #R156 made it LaTeX
     display math, which is what it means in every reply Atlas actually writes; the protection pass
     claims it before the parser ever sees it. A LONE `\[` with no closing `\]` is still a literal
     bracket, which is the case markdown escaping exists for. */
  assert.ok(md('式は \\[x=1\\] です。').includes('data-tex="x=1"'), '\\[…\\] stays display math (#R156)');
  assert.ok(md('片方だけの \\[ は文字。').includes('['), 'an unpaired \\[ is a literal bracket');
});

/* ── ⑥ ─────────────────────────────────────────────────────────────────────────────────────── */
test('R494 ⑥ the #R154 / #R159 decisions survive the rewrite', () => {
  const h = md('**強調は平文になる** の途中と、*斜体* は残る。');
  assert.ok(h.includes('強調は平文になる') && !/<b>|<strong>|font-weight:(7|8)/.test(h),
    '#R159: the reply body carries no bold');
  assert.ok(h.includes('<i>斜体</i>'), '…but italic still renders');
  assert.match(CSS, /\.atl-h\{font-weight:600;color:var\(--text-main\);/, '#R154/#R159: monochrome, semibold');
  /* the BASE .atl-h rule states the one colour; no per-LEVEL rule may add another */
  assert.ok(!/\.atl-h[1-6]\{[^}]*color:/.test(CSS), '#R154: no level introduces a hue of its own');
});

/* ── ⑦ ─────────────────────────────────────────────────────────────────────────────────────── */
test('R494 ⑦ code never becomes markup — highlighted or not', () => {
  const H = makeAtlasHighlight();
  const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>';
  for (const lang of ['html', 'js', 'python', 'nosuchlang', '']) {
    const out = H.highlightCode(evil, lang);
    /* ⚠ THE CLAIM IS EXACT: the only tags in the output are the spans this file wrote itself.
       Asserting «no <script>» would pass on an output that had smuggled in some other element. */
    assert.ok(!/<(?!\/?span[ >])/.test(out), 'the only markup is our own spans, for lang="' + lang + '"');
    assert.ok(out.includes('&lt;script'), 'the source is still readable for lang="' + lang + '"');
  }
  assert.equal(H.highlightCode('const a = 1;', ''), 'const a = 1;', 'an unlabelled fence is not guessed at');
  assert.ok(H.highlightCode('const a = 1;', 'js').includes('class="hl-k"'), 'a labelled one is coloured');
  assert.equal(H.highlightLang('typescript'), 'js', 'aliases resolve');
  assert.equal(H.highlightLang('brainfuck'), '', 'an unknown label resolves to nothing');
  /* rendered end to end, through the real code-block builder */
  const h = md('```html\n<script>alert(1)</script>\n```');
  assert.ok(!/<script/.test(h), 'and nothing executable reaches the reply');
  assert.ok(h.includes('atl-codewrapbtn'), 'the Wrap toggle is offered beside Copy');
});

/* ── ⑧ ─────────────────────────────────────────────────────────────────────────────────────── */
test('R494 ⑧ six heading levels, six distinct sizes', () => {
  const sizes = new Map();
  for (let lv = 1; lv <= 6; lv++) {
    const m = new RegExp('\\.atl-h' + lv + '\\{font-size:([\\d.]+)em').exec(CSS);
    assert.ok(m, 'h' + lv + ' has a size');
    sizes.set(lv, parseFloat(m[1]));
  }
  /* ⚠ BEFORE #R494 H3–H6 WERE ONE RULE AT 1.3em, so a reply that nested three levels rendered the
     third, fourth and fifth as the same thing. Strictly descending is the whole claim. */
  for (let lv = 2; lv <= 6; lv++) {
    assert.ok(sizes.get(lv) < sizes.get(lv - 1),
      'h' + lv + ' (' + sizes.get(lv) + 'em) is smaller than h' + (lv - 1) + ' (' + sizes.get(lv - 1) + 'em)');
  }
  assert.match(CSS, /\.atl-h\{[^}]*text-wrap:balance/, 'a two-line heading is balanced, not left with an orphan');
  assert.match(CSS, /\.atl-p\{[^}]*text-wrap:pretty/, '…and body paragraphs ask for pretty');
});

/* ── ⑨ ─────────────────────────────────────────────────────────────────────────────────────── */
test('R494 ⑨ table columns wrap by content, and an escaped pipe stays in its cell', () => {
  const h = md('| 国 | 値 | 説明 |\n|---|--:|---|\n'
    + '| 日本 | 1.2 | ここには説明の文章が入るので、この列だけは折り返さないと表が横に伸びます |\n');
  const cells = [...h.matchAll(/<t[hd]([^>]*)>([^<]*)</g)].map((m) => ({ attrs: m[1], text: m[2] }));
  const wrapped = cells.filter((c) => c.attrs.includes('atl-c-wrap')).map((c) => c.text);
  assert.ok(wrapped.includes('説明'), 'the prose column wraps');
  assert.ok(!wrapped.includes('値'), 'the numeric column does not');
  assert.ok(!wrapped.includes('日本'), 'nor does a column of short labels');
  assert.match(CSS, /\.atl-md-table \.atl-c-wrap\{white-space:normal;/, 'and the class means what it says');

  /* ⚠ `split('|')` cut the row at the very character GFM's escape exists to protect, shifting every
     later cell one column left — silently, and only in rows that used it. */
  const esc2 = md('| a | b |\n|---|---|\n| x \\| y | 1 |\n');
  assert.ok(esc2.includes('<td>x | y</td>'), 'an escaped pipe is one cell containing a pipe');
  assert.equal((esc2.match(/<td/g) || []).length, 2, '…and the row still has two cells');
});

/* ── ⑩ ─────────────────────────────────────────────────────────────────────────────────────── */
test('R494 ⑩ the seventh source is rendered, not silently dropped', () => {
  const list = Array.from({ length: 9 }, (_, i) => ({
    url: 'https://example' + i + '.org/a', title: 'Article ' + i, src: 'Example ' + i,
  }));
  const h = R.linkCards(list);
  assert.equal((h.match(/class="atl-lc"/g) || []).length, 9, 'every card is in the DOM');
  assert.ok(h.includes('class="atl-lc-rest" hidden'), 'the overflow starts hidden');
  assert.ok(/class="atl-lc-more"[^>]*>\+3</.test(h), 'and a chip says how many there are');
  const six = R.linkCards(list.slice(0, 6));
  assert.ok(!six.includes('atl-lc-more'), 'six or fewer needs no chip');
});

/* ── ⑪ ─────────────────────────────────────────────────────────────────────────────────────── */
test('R494 ⑪ Japanese breaks by the strict rule set, not between any two characters', () => {
  const bubble = /#atlas-panel \.atl-b\{([^}]*)\}/.exec(CSS);
  assert.ok(bubble, 'the bubble rule exists');
  assert.match(bubble[1], /line-break:strict/, 'strict kinsoku');
  assert.match(bubble[1], /word-break:normal/, 'no breaking inside a word');
  assert.match(bubble[1], /overflow-wrap:anywhere/, '…but a long unbreakable run still breaks rather than overflows');
  assert.ok(!/word-break:break-word/.test(bubble[1]),
    'break-word is gone — it permitted a line to begin with 、 。 ）');
  assert.match(bubble[1], /font-size:13\.5px;line-height:1\.62/, 'the bubble is 13.5px/1.62 (was 12.8/1.6)');
  assert.match(CSS, /\.atl-md\{font-size:14px;line-height:1\.62;\}/, 'and the reply body is a NAMED class');
});

/* ── ⑫ the round did not leave a second renderer behind ────────────────────────────────────── */
test('R494 ⑫ there is exactly one place that turns a reply into blocks', () => {
  const rep = read('js/atlas-reply.js');
  assert.match(rep, /_atlMd\.renderMarkdown\(_dedupText\(_atlStanza\(s\)\)\)/, 'mdMini delegates to the parser');
  assert.ok(!/replace\(\/\^#\{3,6\}/.test(rep), 'the old heading regexes are gone, not commented out');
  assert.ok(!/atl-gap/.test(rep), 'and so is the spacer they needed');
  assert.ok(!/<div class="atl-h"/.test(rep), 'no styled-div heading survives');
  /* the parser is reachable only through the factory — tests/r175 ③ enforces the same rule generally */
  assert.match(read('js/atlas-markdown.js'), /^export function makeAtlasMarkdown\(CTX\) \{/m, 'one entry point');
  assert.match(read('js/atlas-highlight.js'), /^export function makeAtlasHighlight\(\) \{/m, 'one entry point');
});
