/* ============================================================================
 *  Atlas · turning a reply into what the reader reads — js/atlas-reply.js (mdMini, the reflow, the
 *  dedup, source cards), js/atlas-markdown.js, js/atlas-highlight.js and the panel stylesheet
 *  js/atlas-styles.js injects
 * ----------------------------------------------------------------------------
 *  (tests-by-topic) Gathered from seven round files; every test keeps the title it had there:
 *    · tests/r494-checks.test.mjs — the renderer stops being a chain of regular expressions
 *    · tests/r463-checks.test.mjs — a sentence never ends inside a URL, a markdown link or a number
 *    · tests/r149-checks.test.mjs #4, tests/r150-checks.test.mjs #4, tests/r151-checks.test.mjs #5 #11,
 *      tests/r156-checks.test.mjs #1 #2, tests/r159-checks.test.mjs #1 #2 — the typography and
 *      rendering decisions of R149–R159
 *  ⚠ (tests-by-topic) The R149–R159 checks asserted the TEXT of the renderer and of the stylesheet in
 *  the whole concatenated app source. Where the claim is about what is rendered, they now render
 *  (through the same makeAtlasReply instance #R494 uses); where it is about the stylesheet, they read
 *  the CSS js/atlas-styles.js actually injects (atlasPanelCSS()). What is left against the app source
 *  is either an ABSENCE across the whole app (a removed divider must not come back anywhere) or code
 *  inside js/atlas-console.js's closure, which needs the running page; each says so.
 * ==========================================================================*/
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
// R463 — Atlas reply rendering: a sentence never ends inside a URL, a markdown link or a number.
//
// The report: an answer about Liptovská Mara rendered "地図中心付近の49." and "10°N・19.54°E" on two
// paragraphs, and its source link came out as a dead anchor reading "https://liptovska-mara.".
// Root cause: js/atlas-reply.js has TWO sentence tokenizers — _atlStanza's SENT (reflow) and
// _dedupText's dedupLine (#R137 repeat-stripping) — and both treated every '.' as a possible
// sentence end, so a dotted host and a decimal were read as several sentences.
//
//   ① the reported paragraph: decimals intact, ONE anchor carrying the WHOLE url
//   ② the dedup side: the same url twice must not become a second, wrong, live destination
//   ③ the reflow itself is unchanged — atom-free prose still gets its ~2-sentence stanzas
//   ④ nothing leaks: no placeholder in the html, and mdMini's own code/math tokens still round-trip
//   ⑤ both tokenizers read the HELD string (a future edit back to the raw one fails here)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeAtlasReply } from '../js/atlas-reply.js';
import { makeAtlasHighlight } from '../js/atlas-highlight.js';
import { atlasPanelCSS } from '../js/atlas-styles.js';
import { appSource } from './app-source.mjs';
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
/* the app's whole source, for the absences and the console-closure spellings below (#R162) */
const html = appSource(new URL('../', import.meta.url));
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
  /* kept as a spelling: the claim is about the source — which string each tokenizer reads, and that exactly one renderer exists */
  const rep = read('js/atlas-reply.js');
  assert.match(rep, /_atlMd\.renderMarkdown\(_dedupText\(_atlStanza\(s\)\)\)/, 'mdMini delegates to the parser');
  assert.ok(!/replace\(\/\^#\{3,6\}/.test(rep), 'the old heading regexes are gone, not commented out');
  assert.ok(!/atl-gap/.test(rep), 'and so is the spacer they needed');
  assert.ok(!/<div class="atl-h"/.test(rep), 'no styled-div heading survives');
  /* the parser is reachable only through the factory — tests/r175 ③ enforces the same rule generally */
  assert.match(read('js/atlas-markdown.js'), /^export function makeAtlasMarkdown\(CTX\) \{/m, 'one entry point');
  assert.match(read('js/atlas-highlight.js'), /^export function makeAtlasHighlight\(\) \{/m, 'one entry point');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R463 (formerly tests/r463-checks.test.mjs) — one makeAtlasReply instance serves both rounds now:
   #R463 built its own with a narrower esc() and no document; the shared one escapes ' as well and has a
   document stub, and neither difference touches a URL, a decimal or a link label.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
const SRC = read('js/atlas-reply.js');
const anchors = (html) => [...html.matchAll(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: m[1], text: m[2] }));

const URL_FULL = 'https://liptovska-mara.slovakian-mountains.eu/?utm_source=openai';
/* the reported answer: one paragraph over the 230-char reflow gate, carrying three decimals and a link */
const REPORTED =
  'リプトフスカー・マラ（Liptovská Mara）はスロバキア北部の人造湖で、リプトフ盆地のヴァーフ川をせき止めて1975年に完成しました。'
  + '湛水面積はおよそ21.6平方キロメートル、最大水深は43メートルほどで、地図中心付近の49.10°N・19.54°Eに広がっています。'
  + '発電と洪水調節のほか、夏季にはヨットやウィンドサーフィンの拠点としても知られています。'
  + '詳しい観光情報は [liptovska-mara.slovakian-mountains.eu](' + URL_FULL + ') を参照してください。';

test('R463 ①: the reported paragraph keeps its decimals and its link', () => {
  const st = R._atlStanza(REPORTED);
  assert.ok(st.includes('\n\n'), 'the reflow still runs on this paragraph (otherwise ① proves nothing)');
  for (const n of ['21.6平方キロメートル', '49.10°N', '19.54°E']) {
    assert.ok(st.includes(n), 'decimal survives the sentence split: ' + n);
  }
  assert.ok(st.includes('[liptovska-mara.slovakian-mountains.eu](' + URL_FULL + ')'), 'the markdown link survives whole');

  const a = anchors(R.mdMini(REPORTED));
  assert.equal(a.length, 1, 'exactly one anchor');
  assert.equal(a[0].href, URL_FULL, 'the anchor carries the WHOLE url (was "https://liptovska-mara.")');
  assert.equal(a[0].text, 'liptovska-mara.slovakian-mountains.eu', 'the label is the label, not a url fragment');
  assert.ok(!/href="https:\/\/liptovska-mara\.[" ]/.test(R.mdMini(REPORTED)), 'the truncated host is gone');
});

test('R463 ②: a url repeated in one reply does not become a second, wrong destination', () => {
  /* dedupLine rejoins its tokens with '' so nothing shifts — it DELETES a repeated token instead.
     "slovakian-mountains." and "eu/tourism/index." were both seen in the first url, so the second
     url lost its middle and rendered as href="https://liptovska-mara.html": live, ordinary-looking
     and pointing somewhere else entirely. That is worse than a visibly broken link. */
  const u = 'https://liptovska-mara.slovakian-mountains.eu/tourism/index.html';
  const a = anchors(R.mdMini('公式サイトは ' + u + ' です。\n\n営業時間などの最新情報も ' + u + ' で確認できます。'));
  assert.equal(a.length, 2, 'both urls are still linked');
  for (const x of a) assert.equal(x.href, u, 'every anchor points at the real url');
});

test('R463 ③: the reflow, the dedup and the typography are otherwise untouched', () => {
  /* Guard against "fixed" meaning "disabled". Prose with no url and no number must reflow exactly as
     #R154 specified: a >230-char run-on becomes ~2-sentence stanzas separated by a blank line. */
  const p = '湖の面積は広く、周囲には集落が点在しています。ダムは発電と洪水調節の二つの目的を担っています。'
          + '夏には観光客が訪れます。冬の水位は下げられます。';
  const st = R._atlStanza(p + p);
  assert.ok(st.split('\n\n').length >= 3, 'a long atom-free run-on is still cut into stanzas');
  assert.equal(R._atlStanza('短い答えです。'), '短い答えです。', 'a one-line answer is still returned verbatim');
  assert.equal(R._atlStanza('## 見出し\n\n本文。' + p + p), '## 見出し\n\n本文。' + p + p, 'a model-authored ## reply is still untouched');
  const dup = '同じ文がここに書かれています。同じ文がここに書かれています。別の話がここから始まります。';
  assert.ok(!R.mdMini(dup).includes('同じ文がここに書かれています。同じ文がここに書かれています。'),
    '#R137 duplicate-sentence stripping still works');
});

test('R463 ④: no placeholder reaches the html, and mdMini keeps its own tokens', () => {
  /* the e-mail address and the scheme-less host sit inside a paragraph that IS over the reflow gate,
     so this asserts they survive a split rather than that no split happened. */
  const long = 'ダム湖の管理事務所は通年で開いており、見学の申し込みや水位の問い合わせを受け付けています。'
    + '連絡先は info@liptovska-mara.eu、案内図は www.example.org/a.b にあります。'
    + '週末は混み合うため、午前中の早い時間に訪れるのが確実です。冬季は路面が凍結することがあります。'
    + '公共交通で向かう場合はリプトフスキー・ミクラーシュ駅からバスに乗り換えます。';
  const html = R.mdMini(REPORTED + '\n\n' + long + '\n\n計算は `1.5 * 2` で、$x=1.25$ です。');
  assert.ok(!/[\uE000-\uE011]/.test(html), 'no private-use placeholder survives into the rendered html');
  assert.ok(html.includes('1.5 * 2'), 'inline code still renders its content');
  assert.ok(html.includes('info@liptovska-mara.eu'), 'an e-mail address is not cut at its dots');
  assert.ok(html.includes('www.example.org/a.b'), 'a scheme-less www host is not cut at its dots');
});

test('R463 ⑤: BOTH tokenizers read the held string', () => {
  /* kept as a spelling: the claim is about the source — which string each tokenizer reads, and that exactly one renderer exists */
  assert.match(SRC, /const _ATL_ATOM=/, 'the atom pattern exists');
  assert.match(SRC, /function _atlHold\(s\)\{/, 'the hold helper exists');
  assert.match(SRC, /function _atlFree\(s,A\)\{/, 'the restore helper exists');
  assert.match(SRC, /const dedupLine=\(line\)=>\{ const H=_atlHold\(line\);/, '_dedupText holds before tokenizing');
  assert.match(SRC, /const toks=H\.t\.match\(/, '_dedupText tokenizes the HELD string');
  assert.match(SRC, /const H=_atlHold\(p\);/, '_atlStanza holds before splitting');
  assert.match(SRC, /const sents=\(H\.t\.match\(SENT\)\|\|\[H\.t\]\)\.map\(x=>_atlFree\(x,H\.A\)\);/, '_atlStanza splits the HELD string');
  assert.ok(!/const toks=line\.match\(/.test(SRC), 'the raw-line tokenizer is gone');
  assert.ok(!/const sents=p\.match\(SENT\)/.test(SRC), 'the raw-paragraph splitter is gone');
  assert.match(SRC, /if\(\(p\.length\+pc\)>230\)\{ const H=_atlHold\(p\);/, 'the 230 gate still measures the REAL paragraph, not the held one');
});
test('R463 ⑥: a bare host or filename is held too — that is what the app actually cites', () => {
  /* js/atlas-answer-render.js runs stripModelUrls() over a structured answer and hands mdMini the bare
     host, so "reuters.com" is the commonest citation shape in the product — and it was rendering as
     "reuters." / "com" on two paragraphs long after a scheme-ful url would have been safe. */
  const p = 'この件は複数の媒体が報じています。一次情報の要約は reuters.com に、続報の詳細は apnews.com にまとまっています。'
    + '現地当局の発表は同日中に更新される見込みで、被害の規模はまだ確定していません。避難所の開設状況も随時変わります。'
    + '公式の資料は pdf ファイルとして index.html から辿れます。';
  const st = R._atlStanza(p);
  assert.ok(st.includes('\n\n'), 'the paragraph is over the gate, so this asserts a survival, not an absence of reflow');
  for (const h of ['reuters.com', 'apnews.com', 'index.html']) assert.ok(st.includes(h), 'bare host survives: ' + h);

  /* the TLD is required to be lowercase so ordinary English prose keeps its sentence boundaries; a long
     English paragraph must still reflow. (An ABBREVIATION — "U.S.", "e.g." — is deliberately not held:
     guessing at those is the design this fix refuses, and they behave exactly as they always have.) */
  const en = 'The reservoir was filled in 1975 and it serves both power generation and flood control. '
    + 'Sailing and windsurfing are popular here in summer. The water level is drawn down in winter. '
    + 'A visitor centre near the dam opens every day except Monday. Buses run from the nearest railway station. ';
  assert.ok(R._atlStanza(en + en).split('\n\n').length >= 3, 'English prose still reflows into stanzas');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   R149–R159 — the typography and rendering decisions (formerly tests/r149-, r150-, r151-, r156-, r159-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
test('R149 #4 Atlas typography: em-based heading hierarchy in mdMini', () => {
  // (#R154) headings differentiate by SIZE + SPACING only — NO colour ("目次を色分けするのはやめる")
  /* (tests-by-topic) the sizes are read from the stylesheet the panel injects (atlasPanelCSS()) */
  assert.match(CSS, /font-size:1\.9em;letter-spacing:\.012em/, 'h1 ~1.9em (R158)');
  assert.match(CSS, /font-size:1\.56em;line-height:1\.25;letter-spacing:\.006em/, 'h2 ~1.56em (R158)');
  assert.match(CSS, /font-size:1\.3em;line-height:1\.3;letter-spacing:\.004em/, 'h3 ~1.3em (R158)');
  /* an absence across the whole app: no rule anywhere may bring the coloured heading back */
  assert.ok(!/color:var\(--primary-color\);margin:1\.\d+em 0 [^;]*;font-size:1\.\d+em/.test(html), 'R154: heading rules no longer use --primary-color (size/spacing only)');
  /* (#R494) the same 1.5em rhythm, declared on the paragraph instead of emitted as an empty div */
  assert.match(CSS, /\.atl-p\{margin:0 0 1\.5em;/, 'paragraph gap ~1.5em (R158), now a margin');
  assert.ok(!/class="atl-gap"/.test(html), 'R494: the spacer ELEMENT is gone — spacing is a margin');
  // prompts mandate the structure — a spelling: the answer prompt is assembled in the console's closure
  assert.match(html, /FORMAT FOR READABILITY — REQUIRED for any answer longer than/, 'answer prompt mandates structure');
});

test('R150 #4 typography: flat prose gets code-side rhythm (stanza + sentence-end gap)', () => {
  /* ⚠ (tests-by-topic) THE REFLOW IS RUN, NOT READ. This matched the text of _atlStanza's declaration,
     the absence of one removed \`return raw;\` line and one kept regular expression. _atlStanza is on
     the object makeAtlasReply returns, so the three facts are asked of it directly. */
  assert.equal(typeof R._atlStanza, 'function', 'stanza grouping helper exists');
  // (R153) the ">1 newline → return raw" bail was the reason multi-paragraph flat prose stayed monotone; it is REMOVED.
  const flat = 'First paragraph sentence one is long enough. Second sentence of it continues here.\n'
    + 'Another paragraph line follows. And more text to make it long enough for the stanza rule to act on it at all, surely.\n'
    + 'Third paragraph with more words and more words and more words and more words.';
  assert.notEqual(R._atlStanza(flat), flat, 'R153: the >1-newline bail is gone (was why multi-paragraph prose stayed flat)');
  assert.ok(R._atlStanza(flat).includes('\n\n'), '…multi-paragraph flat prose is given stanza breaks');
  const structured = '## Heading\n' + flat;
  assert.equal(R._atlStanza(structured), structured, 'R153: only ALREADY-##-structured replies are left untouched');
  /* (#R494) the reflow still runs FIRST and on the placeholder-protected string — asked of mdMini's
     output: the flat reply above leaves it as several paragraphs, not one wall */
  assert.ok((R.mdMini(flat).match(/class="atl-p/g) || []).length >= 2, 'mdMini runs the stanza pass first (R156: on the placeholder-protected string)');
  assert.match(CSS, /\.atl-ps\{margin-bottom:\.82em;\}/, 'a sentence-end + single newline still gets the softer .82em gap (R158)');
});

test('R151 #5 Atlas typography: a standalone bold line becomes a real sub-heading', () => {
  /* (#R494) the rule moved into the block parser as RE_LEAD and now produces a real <h4 class="atl-hb">
     rather than a styled <div>; the shape it recognises — a whole line that is nothing but a bold run,
     with an optional trailing colon — is unchanged.
     ⚠ (tests-by-topic) RENDERED, NOT READ: this matched the source text of RE_LEAD itself. */
  assert.match(md('**Key findings**:\n\nText here.'), /<h4 class="atl-h atl-h4 atl-hb">Key findings<\/h4>/, 'standalone **bold line** → heading rule');
  assert.doesNotMatch(md('Some **bold** in a sentence.'), /atl-hb/, '…while bold inside a sentence is not a heading');
  assert.match(CSS, /\.atl-hb\{font-size:1\.28em;/, '…and it renders one step below a "## " section, as it always did');
  /* (#R494) the same 1.5em rhythm, declared once on the paragraph instead of emitted as an empty div */
  assert.match(CSS, /\.atl-p\{margin:0 0 1\.5em;/, 'generous explicit-paragraph gap (R158 1.5em)');
});

test('R156 #1 KaTeX is loaded (pinned, self-hosted) + math renderer with graceful fallback', () => {
  /* (#R175) KaTeX left the CDN for npm at the SAME pin, and left the critical path with it: the two
     jsDelivr tags became a dynamic import in src/vendor.js, so it arrives in its own chunk from our
     own origin. `defer` and the graceful fallback below were always the contract — an asynchronously
     available global that the renderer feature-detects — and a dynamic import keeps exactly that. */
  const pkg = JSON.parse(read('package.json'));
  /* ⚠ THE PROPERTY IS «EXACTLY PINNED», NOT «0.16.11». The literal went red the first time the pin
     MOVED — and it moved because 0.16.11 is inside GHSA-cg87-wmx4-v546 (\htmlData does not validate
     attribute names). A test that fails when a known-vulnerable version is replaced is asserting the
     opposite of what it says it is for. Exact pin + a floor at the fixed release. */
  assert.match(pkg.dependencies.katex, /^\d+\.\d+\.\d+$/, 'KaTeX pinned to an exact version (no range)');
  {
    const [maj, min, pat] = pkg.dependencies.katex.split('.').map(Number);
    const atLeast = (maj > 0) || (min > 16) || (min === 16 && pat >= 21);
    assert.ok(atLeast, 'KaTeX ' + pkg.dependencies.katex + ' is below the GHSA-cg87-wmx4-v546 fix (0.16.21)');
  }
  /* the loader half is bundle wiring (src/vendor.js) — a spelling */
  assert.match(html, /import\('katex'\)/, 'loaded off the critical path, as the deferred tag was');
  assert.match(html, /import\('katex\/dist\/katex\.min\.css'\)/, 'and its stylesheet with it');
  assert.ok(!/cdn\.jsdelivr\.net\/npm\/katex@/.test(html), 'no CDN copy is left behind to load twice');
  /* ⚠ (tests-by-topic) THE RENDERER IS RUN, NOT READ: the five spellings of _atlKatex became the two
     situations it exists for — KaTeX absent, and KaTeX present. */
  const had = globalThis.window.katex;
  try {
    delete globalThis.window.katex;
    const raw = md('Display $$x<y$$ end.');
    assert.match(raw, /atl-math-raw" data-tex="x&lt;y" data-display="1"><code>x&lt;y<\/code>/,
      'KaTeX-unavailable/broken → escaped raw LaTeX fallback (data-tex carried for late upgrade)');
    let seen = null;
    globalThis.window.katex = { renderToString: (tex, o) => { seen = { tex, o }; return '<span class="k">' + tex + '</span>'; } };
    const typeset = md('Display $$x^2$$ end.');
    assert.ok(seen, 'feature-detects KaTeX before using it — and uses it when it is there');
    assert.equal(seen.o.displayMode, true, 'display math is typeset as display');
    assert.equal(seen.o.throwOnError, false, 'throwOnError:false — one bad formula never breaks the reply');
    assert.match(typeset, /<span class="k">x\^2<\/span>/);
    globalThis.window.katex = { renderToString: () => { throw new Error('bad formula'); } };
    assert.match(md('Display $$\\bad{$$ end.'), /atl-math-raw/, 'a formula KaTeX throws on falls back to the raw text, not to nothing');
  } finally { if (had === undefined) delete globalThis.window.katex; else globalThis.window.katex = had; }
  /* the late-load upgrade walks the DOM — a spelling */
  assert.match(html, /function _atlTypesetMath\(root\)\{/, 'late-load upgrade of raw fallbacks');
});

test('R156 #2 unified renderer: code blocks, math, tables, inline code — placeholder-protected', () => {
  /* ⚠ (tests-by-topic) RENDERED, NOT READ. This held fourteen regular expressions over the renderer's
     own source — the exact text of each .replace() — and #R494 had already replaced that chain with a
     parser once. What the round promised is what comes out, so each construct is rendered. */
  const code = md('before\n\n' + '```' + 'js\nconst a = "<b>";\n' + '```' + '\n\nafter');
  assert.match(code, /<pre class="atl-codeblock"><code id="([^"]+)">/, 'fenced code protected first, into a code block');
  assert.match(code, /class="atl-codecopy" type="button" data-cid="[^"]+">Copy</, 'code block has a localized Copy button');
  assert.ok(!/<b>/.test(code) && code.includes('&lt;b&gt;'), 'code goes through the escaping highlighter, never raw');
  const math = md('Display $$x^2$$ and inline \\(y\\) end.');
  assert.match(math, /data-tex="x\^2" data-display="1"/, 'display math $$…$$ protected');
  assert.match(math, /data-tex="y" data-display="0"/, 'inline math \\(…\\) protected');
  assert.match(md('| a | b |\n|---|---|\n| 1 | 2 |\n'), /class="atl-tablewrap"><table class="atl-md-table">/, 'tables render into a scrollable wrapper');
  assert.match(md('use ' + '`' + 'a<b' + '`' + ' now'), /<code class="atl-code-i">a&lt;b<\/code>/, 'inline code renders, escaped');
  // the EXISTING R154/R155 heading/bullet/paragraph HTML is preserved verbatim
  /* (#R232) the MARGIN is not the property — it came down because the paragraph spacer beside a
     heading was being counted twice. Weight, colour and size are what this line protects. */
  /* (#R494) the heading style is a CSS rule on a real <h2> now, not an inline style on a <div>; the
     three properties this line exists to protect — weight, colour, size — are all still stated. */
  assert.match(CSS, /\.atl-h\{font-weight:600;color:var\(--text-main\);/, 'R159 heading weight + R154 monochrome');
  assert.match(CSS, /\.atl-h2\{font-size:1\.56em;/, 'R159 "## " heading size');
  assert.ok(!/border-top:[^;]*;?\s*\}?\s*'?\s*\/\*\s*\(#R155\)/.test(html), 'R159 no "## " divider rule');
  assert.ok(!/<b>|<strong>/.test(md('plain **bold** text')), 'R159 inline **bold** stripped to plain (no bold in Atlas replies)');
  // interactive wiring at document level (works in panel + sidebar tab + workspace) — a document-level listener, a spelling
  assert.match(html, /if\(!window\.__atlRenderWired\)\{ window\.__atlRenderWired=true;/, 'one-time document-level wiring for the Copy button');
  assert.match(CSS, /\.atl-codeblock\{margin:0;padding:10px 12px;overflow-x:auto;/, 'code block scrolls horizontally (mobile)');
  assert.match(CSS, /\.atl-math-b\{margin:\.55em 0;overflow-x:auto;/, 'display math scrolls horizontally (mobile)');
});

test('R159 #1 Atlas replies carry NO bold and NO divider lines', () => {
  /* ⚠ (tests-by-topic) RENDERED, NOT READ: the two .replace() calls this matched are asked what they
     do — a bold run inline and inside a table cell comes out as plain text. */
  assert.ok(!/<b>|<strong>/.test(md('the **key** point')), 'inline **bold** → plain (js/atlas-markdown.js)');
  /* (#R492) the cell formatter also annotates the cell (units / clocks / abbreviations), so it takes the
     options object as a second argument. The property THIS line protects — the bold strip — is unchanged. */
  const cell = md('| a | b |\n|---|---|\n| **x** | 1 |\n');
  assert.match(cell, /<td>x<\/td>/, 'table-cell **bold** → plain');
  assert.ok(!/<b>|<strong>/.test(cell));
  /* ⚠ (#R494) THREE ASSERTIONS USED TO NAME AN IMPLEMENTATION AND NOT A RULE. Each asserted the literal
     text of one `.replace()` call, so what they actually protected was that the renderer kept being
     written as a regex chain — and when #R494 replaced the chain with a parser, all three would have
     failed while the rule they exist for (weight 600, --text-main, no colour-coding) was untouched.
     The rule is stated once in CSS now, and once here. `atl-h` is on EVERY level, so one assertion
     covers what three could not: a level added later cannot skip it. */
  assert.match(CSS, /\.atl-h\{font-weight:600;color:var\(--text-main\);/, 'every heading level is semibold, not bold, and monochrome');
  for (const lv of [1, 2, 3, 4, 5, 6]) assert.ok(CSS.includes('.atl-h' + lv + '{font-size:'), 'h' + lv + ' has its own size');
  /* absences across the whole app: no rule anywhere may bring these back */
  assert.ok(!/\.atl-h\d?\{[^}]*font-weight:(750|800)/.test(html), 'no heading keeps the heavy 750/800 bold weight');
  assert.ok(!/\.atl-h[1-6]\{[^}]*color:var\(--primary-color\)/.test(html), 'R154: no heading is colour-coded');
  // the "## " section top-rule divider is removed ("区切りの横線はいらない")
  assert.ok(!html.includes('padding-top:.78em;border-top:1.5px solid rgba(128,128,128,.34)'), 'the ## hairline divider is gone');
  // and the repair-pass dashed divider between answer segments is gone (see #7)
  assert.ok(!html.includes('border-top:1px dashed var(--glass-border,rgba(128,128,128,0.25))'), 'the repair-pass dashed divider is gone');
});

/* #R159 #2 — a spelling: the source pile and the analyse reply are assembled in js/atlas-console.js's closure */
const ok = (s, msg) => assert.ok(html.includes(s), msg || ('missing: ' + s.slice(0, 90)));
const gone = (s, msg) => assert.ok(!html.includes(s), msg || ('should be removed: ' + s.slice(0, 90)));
test('R159 #2 redundant "その他の収集記事" source pile removed; never-zero fallback kept', () => {
  gone("L('Other gathered articles','その他の収集記事'", 'the "Other gathered articles"/その他の収集記事 label is gone');
  // the rest-links block now renders ONLY as the never-zero "Related articles" fallback when nothing was cited/verified
  /* (#R232) linkCards gained a `topic` argument — the relevance gate now judges against what the
     articles were FETCHED FOR, not only against the finished reply. The guard is unchanged. */
  /* ⚠ (#R350) THE NEVER-ZERO FALLBACK IS GONE FROM THE ANALYSE PATH, AND THE COMPLAINT IT ANSWERED
     IS ANSWERED BETTER. #R159 kept a 「Related articles」 bucket so a reply that cited nothing still
     showed something — which is, precisely, attaching articles to statements they do not support.
     #R350 forbids that and makes the opposite true instead: js/atlas-answer-audit.js fails an answer
     whose primary claims carry no evidence id, so when IntMap HAS sources the answer must cite them,
     and when it has none the honest outcome is a shorter answer rather than a pile of links. What
     survives from #R159 is the rule this test was really about — one answer per goal, no duplicate
     source piles — which is asserted above and by tests/r334-checks ⑦b. */
  gone("if(rest.length && !haveBasis){ const rc=linkCards(rest,txt,placeStr);", 'the un-cited "rest" bucket is back in the analyse reply');
  ok("class=\"atl-src-h\"", 'the source-card heading machinery is still there');
});
test('R151 #11 Atlas source cards drop SNS / UGC / shorteners / video hosts', () => {
  /* ⚠ (tests-by-topic) THE PREDICATE IS CALLED, NOT READ: _atlBadSourceHost and _atlCleanUrl are on the
     object makeAtlasReply returns, so the hosts the round named are handed to them. */
  assert.equal(typeof R._atlBadSourceHost, 'function', 'bad-source-host predicate exists');
  assert.equal(R._atlBadSourceHost('twitter.com'), true, 'X/Twitter in the drop list');
  assert.equal(R._atlBadSourceHost('x.com'), true);
  assert.equal(R._atlBadSourceHost('youtube.com'), true, 'YouTube in the drop list');
  assert.equal(R._atlBadSourceHost('youtu.be'), true);
  assert.equal(R._atlBadSourceHost('www.reuters.com'), false, '…and a newsroom is not');
  assert.equal(R._atlCleanUrl('https://twitter.com/a/b'), null, 'R153: _atlCleanUrl (used by linkCards AND the inline evidence links) drops bad hosts');
  assert.ok(R._atlCleanUrl('https://www.reuters.com/world/x'), '…and keeps a real source');
  assert.equal((R.linkCards([{ url: 'https://x.com/a', title: 'A', src: 'X' }, { url: 'https://www.reuters.com/a', title: 'B', src: 'Reuters' }]).match(/class="atl-lc"/g) || []).length, 1,
    'the source cards never show the dropped host');
  // prompt reinforcement — a spelling: the analysis prompt is assembled in the console's closure
  assert.match(html, /NEVER cite social media, user-generated forums, link shorteners or video platforms/, 'analysis prompt forbids SNS sources');
  // exposed for hermetic tests — IntMapAtlasDebug is built in the console's closure
  assert.match(html, /badSourceHost:function\(h\)\{/, 'exposed on IntMapAtlasDebug');
});

