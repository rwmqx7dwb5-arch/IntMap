/* ============================================================================
 *  #R335 — the character converter does not convert vocabulary, ONE ROUND LATER
 * ----------------------------------------------------------------------------
 *  #R319 found 紐西蘭 and 玻里尼西亞 shipping to Simplified readers as 纽西兰 / 玻里尼西亚: words
 *  whose characters are ALREADY shared between the two orthographies, so OpenCC `tw→cn` converts
 *  them to themselves and every orthography check in the project reads them as perfectly correct.
 *  「社群」 was the next one — the Taiwanese word for a community, shipped in the airplanes.live
 *  source description and in the Community tab, where the mainland word is 「社區」.
 *
 *  ⚠ THE POINT OF THIS FILE IS NOT THE ONE WORD. A hand-kept vocabulary table has no way to say
 *  what it is MISSING (the same shape as #R251's character map and [[intmap-recurring-lessons]] G),
 *  so this round stopped reading and asked a published table: OpenCC's SECOND Taiwan profile,
 *  twp→cn, converts vocabulary as well as orthography. Run OUTSIDE the pipeline — where #R251
 *  correctly refuses to run it, because inside it double-converts this project's own output — it is
 *  not a converter but an INVENTORY. 96 distinct disagreements over 8,321 Han runs; 49 survived
 *  being read one at a time, and they are the rows tagged (#R335) in scripts/zh-hans.mjs.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as acorn from 'acorn';
import * as OpenCC from 'opencc-js';
import { readLF } from '../scripts/eol.mjs';

/* ⚠ (#R283/#R317) READ THROUGH readLF. A check written against the bytes a checkout happened to
   produce says something different on Windows and in CI, and tests/r313 ⑤ was red on one platform
   for its whole life because of it. */
const root = new URL('../', import.meta.url);
const read = (p) => readLF(new URL(p, root));

const TRAD = ['js/locales/ui.zh.js', 'js/locales/pages.zh-hant.js'];
const HANS = ['js/locales/ui.zh-hans.js', 'js/locales/pages.zh-hans.js'];
const cn = OpenCC.Converter({ from: 'tw', to: 'cn' });

/* ⚠ (#R323) THE TABLE IS READ FROM THE AST, NOT WITH A REGEX OVER THE FILE. A pattern that can
   match anywhere in a file answers a different question from the one being asked — #R323 spent a
   round on exactly that. And it must not be `import`ed either: scripts/zh-hans.mjs REWRITES the two
   generated files as a top-level side effect, so importing it here would make this test the thing
   that keeps them in sync. tests/r224 ④ is what checks they are in sync. */
function tableOf(name) {
  const src = read('scripts/zh-hans.mjs');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  let node = null;
  for (const n of ast.body) {
    const d = n.type === 'ExportNamedDeclaration' ? n.declaration : null;
    if (d && d.type === 'VariableDeclaration' && d.declarations[0].id.name === name) node = d.declarations[0].init;
  }
  assert.ok(node && node.type === 'ArrayExpression', name + ' is one exported array literal');
  return node.elements.map((el) => (el.type === 'Literal' ? el.value
    : el.elements.map((x) => { assert.equal(x.type, 'Literal', name + ' holds literals only'); return x.value; })));
}

/* ── ① NO LEFT-HAND SIDE OF THE TABLE SURVIVES INTO THE FILES THE READER GETS ────────────────────
   This is the defect stated in general, and it is the assertion 社群 needed for the months it
   shipped. Every Taiwanese word the table names is spelled the way the character layer WOULD have
   spelled it (紐西蘭 → 纽西兰, 社群 → 社群) and then looked for in the generated output. A row
   deleted, a row that stopped being applied, or a new Traditional string carrying a word the table
   already knows about all land here. */
test('R335 ① no word the vocabulary table names reaches the Simplified reader', () => {
  const WORDS = tableOf('WORDS'), PINNED = tableOf('PINNED');
  assert.ok(WORDS.length >= 170, 'the table has ' + WORDS.length + ' rows');
  const out = HANS.map(read).join('\n');
  const survived = [];
  for (const [a] of WORDS) {
    /* ⚠ the single character 著 is the aspect marker, and the PINNED words (著名/顯著/乾坤…) keep
       it on purpose — a one-character row is a statement about characters, not about vocabulary. */
    if (a.length < 2 || PINNED.some((p) => p.includes(a))) continue;
    const spelled = cn(a);
    const n = out.split(spelled).length - 1;
    if (n) survived.push(a + ' (would ship as ' + spelled + ') x' + n);
  }
  assert.deepEqual(survived, [], 'Taiwanese vocabulary reached the Simplified files');
});

/* ── ② 社群 AT BOTH ENDS ──────────────────────────────────────────────────────────────────────────
   The fix is a DERIVATION, not an edit of the translation: the Taiwan reader keeps 社群, which is
   their word, and only the derived file changes. Both halves of that have to be true, or the next
   round "fixes" it by rewriting ui.zh.js and takes the Traditional reader's word away. */
test('R335 ② 社群 stays in Traditional and becomes 社区 in Simplified', () => {
  const trad = TRAD.map(read).join('\n');
  assert.ok(trad.split('社群').length - 1 >= 6, 'the Traditional sources still say 社群');
  assert.ok(!trad.includes('社區 ADS-B'), 'the Traditional page was not rewritten');
  const ui = read('js/locales/ui.zh-hans.js'), pages = read('js/locales/pages.zh-hans.js');
  assert.ok(!ui.includes('社群') && !pages.includes('社群'), '社群 must not survive into Simplified');
  assert.ok(ui.includes('tabCommunity:"社区"'), 'the Community tab');
  assert.ok(pages.includes('社区 ADS-B'), 'the source description this was found in');
  assert.ok(pages.includes('OpenStreetMap 社区'), 'and the sources page prose');
  /* the pre-existing 社區 («about a neighbourhood») is untouched — it was already the right word */
  assert.ok(ui.includes('"约一个社区"'), 'the neighbourhood string still reads 社区');
});

/* ── ③ ONE SPELLING, TWO PLACES: 喬治亞 ──────────────────────────────────────────────────────────
   The corpus carries both Georgias. The US state is 佐治亞州 to a mainland reader and the country
   is 格魯吉亞, so a single row would have been wrong for one of them whichever way it was written.
   The table states BOTH, and the longest-first sort in toHans() is what makes the state's row win
   inside 「美國喬治亞州」. Checked on the shipped output, which is what a reader actually sees. */
test('R335 ③ the state and the country get different names', () => {
  const ui = read('js/locales/ui.zh-hans.js');
  assert.ok(ui.includes('美国佐治亚州'), 'the US state');
  assert.ok(ui.includes('格鲁吉亚'), 'the country');
  assert.ok(!ui.includes('乔治亚'), 'and the Taiwan spelling is gone from both');
  const lhs = tableOf('WORDS').map(([a]) => a);
  assert.ok(lhs.includes('喬治亞州') && lhs.includes('喬治亞'), 'both rows exist');
  assert.ok('喬治亞州'.length > '喬治亞'.length, 'so the sort in toHans() reaches the state first');
});

/* ── ④ THE TABLE DOES NOT FEED ITSELF ─────────────────────────────────────────────────────────────
   Every row is applied to the same string, so a right-hand side that a LATER row rewrites would
   turn one stated word choice into a second, unstated one — which is the exact failure #R251
   measured when OpenCC's twp profile ran INSIDE the pipeline (檔案 → 文件 → 文档). Stated here as
   a property of the table rather than as a list of the words it happened to be true for. */
test('R335 ④ no row rewrites another row-s answer, and no word is claimed twice', () => {
  const WORDS = tableOf('WORDS');
  const seen = new Map();
  for (const [a, b] of WORDS) {
    assert.ok(!seen.has(a), a + ' is stated twice (-> ' + seen.get(a) + ' and -> ' + b + ')');
    seen.set(a, b);
  }
  const sorted = [...WORDS].sort((x, y) => y[0].length - x[0].length);
  const apply = (t) => { let s = t; for (const [a, b] of sorted) s = s.split(a).join(b); return s; };
  const chained = WORDS.filter(([, b]) => apply(b) !== b).map(([a, b]) => a + '->' + b + ' becomes ' + apply(b));
  assert.deepEqual(chained, [], 'a right-hand side is rewritten by another row');
});

/* ── ⑤ NO TWO ROWS FIGHT OVER THE SAME CHARACTERS ────────────────────────────────────────────────
   Rows of EQUAL length are applied in array order, so two left-hand sides that overlap partially in
   the corpus make the answer depend on where somebody happened to type the row. Exactly one such
   pair exists and it is NOT this round's: 圖資→地圖數據 and 資料→數據 both match inside
   「地圖資料」, and only because 資料 is written first does that come out as 地圖數據 — the other
   order produces 「地地圖數據料」. Measured, and named here so a second one cannot arrive quietly.
   ⚠ Fixing it is not this round's scope; making it visible is. */
test('R335 ⑤ the only pair of rows that overlap in the corpus is the pre-existing one', () => {
  const corpus = TRAD.map(read).join('\n');
  const lhs = tableOf('WORDS').map(([a]) => a).filter((a) => a.length > 1);
  const spans = new Map(lhs.map((w) => {
    const out = []; let i = corpus.indexOf(w);
    while (i >= 0) { out.push([i, i + w.length]); i = corpus.indexOf(w, i + 1); }
    return [w, out];
  }));
  const pairs = new Set();
  for (const a of lhs) for (const b of lhs) {
    if (a === b) continue;
    for (const [s1, e1] of spans.get(a)) for (const [s2, e2] of spans.get(b)) {
      const nested = (s2 >= s1 && e2 <= e1) || (s1 >= s2 && e1 <= e2);
      if (s1 < e2 && s2 < e1 && !nested) pairs.add([a, b].sort().join(' x '));
    }
  }
  assert.deepEqual([...pairs].sort(), ['圖資 x 資料'], 'a new pair of rows can be applied in either order');
});

/* ── ⑥ THE THREE THAT WERE LEFT OUT ON PURPOSE ───────────────────────────────────────────────────
   The same sweep found three more real differences whose left-hand side carries TWO senses in this
   corpus, so a bare word swap would break one of them — the 複製 shape #R322 recorded (Taiwan's
   word for cloning is also the ordinary word for «copy», and 18 of its 19 lines were the Copy
   button). 擷取 is 截取 in 「螢幕擷取」 but 抓取 in 「擷取標題」; 向量 is 矢量 for a vector tile
   and stays 向量 for a vector mean; 數位 has a single bare site whose sense the string does not
   settle. They need a narrower left-hand side, not a row — and this records that their absence is
   a decision rather than an oversight. */
test('R335 ⑥ the three two-sense words are deliberately not rows', () => {
  const lhs = new Set(tableOf('WORDS').map(([a]) => a));
  for (const w of ['擷取', '向量', '數位']) {
    assert.ok(!lhs.has(w), w + ' carries two senses here — it needs a narrower left-hand side');
  }
  /* …and they are still IN the corpus, so this is a live decision and not a stale note */
  const corpus = TRAD.map(read).join('\n');
  for (const w of ['擷取', '向量', '數位']) assert.ok(corpus.includes(w), w + ' left the corpus — revisit');
});
