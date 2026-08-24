/* ============================================================================
 *  R424 — 国名の下のサブ行は、歴史上の国だけ英語のままだった
 * ----------------------------------------------------------------------------
 *  報告（本番・日本語・1916年）:
 *    歴史上の行  「イギリス領インド帝国 / South Asia / Calcutta / New Delhi」
 *                「大日本帝国 / East Asia / Tokyo」
 *    現代の行    「北アメリカ」「ヨーロッパ」   ——同じ一覧の、同じ位置。
 *
 *  #R251 は `s.region` を `_regionName()` に通した。その表は **Natural Earth の CONTINENT** だけを
 *  写した閉じた集合で、`s.region` の**産地はそれ一つではなかった**。表に無い値は `return r` に落ち、
 *  九言語すべてで生の英語のまま出る。しかも**どの計器も見えない**——tests/r251-langs.spec.js は
 *  「IntMap がその文字列の訳を**持っている**とき」だけ鳴るので、訳が無い語には沈黙する。
 *
 *  産地は二つあった。
 *    ① js/history.js の `STATES` は**準大陸の語彙**を持つ（Eurasia / Middle East / South Asia /
 *       Southeast Asia / East Asia）。大陸は一つも無い。これが報告された欠陥。
 *    ② Natural Earth には**八つ目の CONTINENT 値**がある。実測（この app が取りに行く三つの縮尺）:
 *       ne_110m ＝既定の起動が読む file が «Seven seas (open ocean)» を ATF に与えており、
 *       ATF は `sov:true` なので**一覧に出る行**である。ne_50m / ne_10m ではモルディブ・
 *       モーリシャス・セーシェル・セントヘレナ・BIOT・南ジョージア・ハード島・クリッパートンも
 *       そこに入る。つまり**歴史側だけの欠陥ではなかった**。
 *
 *  ⚠ この検査は「表に何が書いてあるか」ではなく「**表が語彙を覆っているか**」を訊く。①②が
 *  それで、js/history.js に州を足した誰かが訳の無い region を黙って持ち込めなくなる。
 *  ④ は表の形ではなく **app 自身の解決器を実行して**九言語ぶんの答えを見る。
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const root = new URL('../', import.meta.url);
const rd = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const abs = (p) => new URL(p, root).pathname;

const COUNTRIES = 'js/countries-ui.js';
const HISTORY = 'js/history.js';

/* ── the `_REGIONS` table, read as a TREE rather than as text ───────────────────────────────────
   A regex over the source would also match this file's own prose in the header above, which is
   [[intmap-recurring-lessons]]'s «the check says yes to its own explanation». acorn answers about
   the object that is actually assigned. */
function regionTable() {
  const ast = parse(rd(COUNTRIES), { ecmaVersion: 2022 });
  let obj = null;
  walk.simple(ast, {
    AssignmentExpression(n) {
      if (n.left.type === 'Identifier' && n.left.name === '_REGIONS' && n.right.type === 'ObjectExpression') obj = n.right;
    },
  });
  assert.ok(obj, `${COUNTRIES}: no _REGIONS object is assigned anywhere`);
  return obj.properties.map((p) => ({
    key: p.key.type === 'Literal' ? p.key.value : p.key.name,
    call: p.value,
  }));
}

/** every `region:'…'` STRING literal js/history.js declares (its `region:S.region` is not one) */
function historyRegions() {
  const ast = parse(rd(HISTORY), { ecmaVersion: 2022 });
  const out = new Set();
  walk.simple(ast, {
    Property(n) {
      const k = n.key.type === 'Literal' ? n.key.value : n.key.name;
      if (k === 'region' && n.value.type === 'Literal' && typeof n.value.value === 'string' && n.value.value) out.add(n.value.value);
    },
  });
  return out;
}

/* ⚠ MEASURED, NOT REMEMBERED — 2026-08-25, over the three files loadCountryData() fetches from
   nvkelso/natural-earth-vector: ne_110m (177 features), ne_50m (242) and ne_10m (258). The union of
   their CONTINENT values is these eight, and the eighth is not a continent at all. 0 features carry
   an empty CONTINENT at any scale, which is also why the restcountries fallback in enrichCountry()
   («Americas» / «Antarctic») is unreachable in practice and is not listed here. */
const NE_CONTINENTS = [
  'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica',
  'Seven seas (open ocean)',
];

/* ══ ① the vocabulary js/history.js DECLARES is covered by the table that translates it ═════════ */
test('R424 ① every region js/history.js declares has an entry in the country table', () => {
  const keys = new Set(regionTable().map((r) => r.key));
  const missing = [...historyRegions()].filter((r) => !keys.has(r)).sort();
  assert.deepEqual(missing, [],
    `js/history.js declares ${missing.length} region(s) that _REGIONS in ${COUNTRIES} does not translate — `
    + `they print as raw English in all nine languages: ${missing.join(', ')}`);

  /* …and the gate is not vacuous: this vocabulary is NOT the continents, which is the whole reason
     #R251's table missed it. If a later round genuinely folds these into continents, delete this
     assertion deliberately rather than letting the one above go quietly true for a new reason. */
  const outside = [...historyRegions()].filter((r) => !NE_CONTINENTS.includes(r));
  assert.ok(outside.length >= 5,
    'js/history.js used to carry five sub-continental regions no Natural Earth continent covers; '
    + `it now carries ${outside.length}`);
});

/* ══ ② …and so is Natural Earth's own, including the value that is not a continent ═════════════ */
test('R424 ② every Natural Earth CONTINENT value has an entry in the country table', () => {
  const keys = new Set(regionTable().map((r) => r.key));
  const missing = NE_CONTINENTS.filter((r) => !keys.has(r));
  assert.deepEqual(missing, [],
    `Natural Earth puts these on real rows of the Countries list and ${COUNTRIES} cannot name them: ${missing.join(', ')}`);
});

/* ══ ③ every entry is a five-argument call — the shape every instrument in scripts/i18n-*.mjs sees ═ */
test('R424 ③ every region is a five-argument L(…) call whose first argument is its own key', () => {
  for (const { key, call } of regionTable()) {
    assert.equal(call.type, 'CallExpression', `${key}: the table value must be a call, not a literal array (#R241)`);
    assert.equal(call.arguments.length, 5, `${key}: expected 5 positional arguments, got ${call.arguments.length}`);
    for (const [i, a] of call.arguments.entries()) {
      assert.equal(a.type, 'Literal', `${key}: argument ${i} must be a string literal`);
      assert.ok(typeof a.value === 'string' && a.value.trim(), `${key}: argument ${i} is empty`);
    }
    assert.equal(call.arguments[0].value, key,
      `${key}: argument 0 IS the lookup key — fr / ko / zh resolve through the inline table by it (js/lang-registry.js)`);
  }
});

/* ══ ④ …AND THE APP'S OWN RESOLVER IS ASKED, IN ALL NINE LANGUAGES ══════════════════════════════
   Not «is there a table row» — that is a shape, and a shape is what walked past this from #R251 onwards.
   js/lang-registry.js and the four inline locale files are LOADED and RUN here, and each region is
   resolved exactly the way js/countries-ui.js resolves it. de / ru / es come from the call's own
   arguments; fr / ko / zh / zh-hans come from `inline`, keyed by the English string. */
function resolver() {
  const ctx = { console, Intl };
  ctx.window = ctx;
  ctx.document = {
    documentElement: { setAttribute() {}, getAttribute() { return null; } },
    querySelectorAll() { return []; },
    getElementById() { return null; },
  };
  vm.createContext(ctx);
  const run = (p) => vm.runInContext(rd(p), ctx, { filename: abs(p) });
  run('js/locales/_langs.js');        /* the language list, before the registry reads it */
  run('js/lang-registry.js');
  for (const c of ['fr', 'ko', 'zh', 'zh-hans']) run(`js/locales/ui.${c}.js`);
  return ctx;
}

/* ⚠ THREE PAIRS ARE GENUINELY THE SAME WORD, and each is a claim about ONE language — the same rule
   scripts/i18n-positional-audit.mjs states for its own SAME_AS_EN set. «Asia» and «Eurasia» are the
   Spanish spellings (RAE); «Europe» is the French one. Everything else must differ. */
const SAME_AS_EN = { es: ['Asia', 'Eurasia'], fr: ['Europe'] };

test('R424 ④ every region resolves in all nine languages, through the app’s own resolver', () => {
  const ctx = resolver();
  const codes = ctx.IntMapLang.list().map((r) => r.code);
  assert.equal(codes.length, 9, `the locale directory declares nine languages; it declared ${codes.join(',')}`);

  let lang = 'en';
  const pick = ctx.IntMapLang.pick(() => lang);
  const bad = [];
  for (const { key, call } of regionTable()) {
    const args = call.arguments.map((a) => a.value);
    for (const code of codes) {
      lang = code;
      const got = pick.apply(null, args);
      assert.ok(got && String(got).trim(), `${key} resolved to nothing in ${code}`);
      if (code === 'en') { assert.equal(got, key, `${key}: English must be the key itself`); continue; }
      const allowed = (SAME_AS_EN[code] || []).includes(key);
      if (got === key && !allowed) bad.push(`${code}  ${key}`);
    }
  }
  assert.deepEqual(bad, [],
    `${bad.length} region(s) still resolve to the English string — a reader of that language sees English `
    + `under the country's name:\n  ${bad.join('\n  ')}`);
});

/* ══ ⑤ BOTH surfaces that print the field go through the table ══════════════════════════════════
   #R251 routed the list's sub-line and left the country card printing `s.region` raw, so the row a
   reader clicked said 「ヨーロッパ」 and the card it opened said «Europe / Western Europe».
   ⚠ Code-shaped needles only — this file's own header names the field and the spellings. */
test('R424 ⑤ the list sub-line and the country card both name the region through _regionName', () => {
  const src = rd(COUNTRIES).replace(/\/\*[\s\S]*?\*\//g, '');   /* comments are not the program */

  assert.match(src, /const subline=[^\n]*_regionName\(s\.region\)/,
    'the Countries list sub-line must resolve the region, not print it');
  assert.match(src, /statRegion'\)[^\n]*_regionName\(s\.region\)/,
    'the country card’s Region row must resolve the region, not print it');

  assert.doesNotMatch(src, /\$\{s\.region\}/, 'a raw ${s.region} is English in nine languages');
  assert.doesNotMatch(src, /\(s\.region\|\|'—'\)/, 'the shape #R424 removed from the country card is back');

  /* the capital is a PLACE NAME and stays untranslated on BOTH kinds of row — that is what makes the
     region the only inconsistency the reader saw, and it was measured before deciding: modern rows
     print CAPITAL[code] («Washington, D.C.»), historical rows print _STINFO's («Tokyo»). */
  assert.match(src, /const subline=[^\n]*s\.capital\|\|''/,
    'the sub-line still prints the capital as it stands (#R251)');
});
