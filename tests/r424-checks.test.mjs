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
 *
 *  ── #R443 追記（⑥〜⑩）──────────────────────────────────────────────────────────────
 *  **同じ行の残り半分**。⑤ が「カードは region を解決している」と言った隣で、`s.subregion` は
 *  生のまま出続けた——日本語で「北アメリカ / Northern America」、de/ru/es/fr/ko/zh-Hant/
 *  zh-Hans も同じ。#R424 はそれを一文で見送っている（「表に無いので英語のまま」）が、
 *  **表は二つ在った**: js/atlas-examples.js が 22 値（#R313 追記2）、残る 2 値は `_REGIONS`。
 *
 *  だから ⑥〜⑩ は「二つ目の表が在るか」ではなく「**一つだけ在って・語彙を覆っていて・
 *  重なる所で食い違わないか**」を訊く。⑩ が、元の欠陥そのものを捕まえる段——
 *  **面ごとに写しがあり、片方だけ直る**という形を、js/*.js 全体を数えて禁じる。
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
   the object that is actually assigned.
   ⚠ (#R443) `sourceType` stays SCRIPT — see ⑩. Four harnesses run this file through
   `new Function(src)`, so it must remain parseable as a classic script, and this parse is the same
   claim made cheaply. */
const countriesAst = () => parse(rd(COUNTRIES), { ecmaVersion: 2022 });

/** the properties of an ObjectExpression, as {key, call} — the shape ③ and ④ read */
const entriesOf = (obj) => obj.properties.map((p) => ({
  key: p.key.type === 'Literal' ? p.key.value : p.key.name,
  call: p.value,
}));

function regionTable() {
  const ast = countriesAst();
  let obj = null;
  walk.simple(ast, {
    AssignmentExpression(n) {
      if (n.left.type === 'Identifier' && n.left.name === '_REGIONS' && n.right.type === 'ObjectExpression') obj = n.right;
    },
  });
  assert.ok(obj, `${COUNTRIES}: no _REGIONS object is assigned anywhere`);
  return entriesOf(obj);
}

/* ── (#R443) …and the SUBREGION table beside it, read the same way ─────────────────────────────
   It is cached on the published function itself (`window._imSubregionName._t = {…}`), which is the
   shape `window._imCldrRegion._c` in the same file already uses: no unexported top-level
   declaration, and nothing built while the file is evaluated. */
function subregionTable() {
  const ast = countriesAst();
  let obj = null;
  walk.simple(ast, {
    AssignmentExpression(n) {
      const l = n.left;
      if (l.type === 'MemberExpression' && !l.computed && l.property.name === '_t'
        && l.object.type === 'MemberExpression' && l.object.property.name === '_imSubregionName'
        && n.right.type === 'ObjectExpression') obj = n.right;
    },
  });
  assert.ok(obj, `${COUNTRIES}: no window._imSubregionName._t object is assigned anywhere`);
  return entriesOf(obj);
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

/* ⚠ (#R443) MEASURED THE SAME WAY, THE SAME DAY, over the same three files: the union of their
   SUBREGION values is these 24. ne_110m — the file every default boot reads — carries 22 of them;
   ne_50m and ne_10m add «Micronesia» and «Polynesia». 0 features carry an empty SUBREGION at any
   scale, so `enrichCountry()`'s restcountries fallback for this field is unreachable in practice,
   exactly as #R424 found for CONTINENT. ⚠ THREE OF THESE ARE ALSO CONTINENT VALUES — that is not a
   mistake in the list, it is why ⑨ exists. */
const NE_SUBREGIONS = [
  'Antarctica', 'Australia and New Zealand', 'Caribbean', 'Central America', 'Central Asia',
  'Eastern Africa', 'Eastern Asia', 'Eastern Europe', 'Melanesia', 'Micronesia', 'Middle Africa',
  'Northern Africa', 'Northern America', 'Northern Europe', 'Polynesia', 'Seven seas (open ocean)',
  'South America', 'South-Eastern Asia', 'Southern Africa', 'Southern Asia', 'Southern Europe',
  'Western Africa', 'Western Asia', 'Western Europe',
];

/* ⚠ (#R443) the four groups of rows where Natural Earth's CONTINENT and its SUBREGION name the SAME
   place. English keeps «North America / Northern America» apart; every other language spells both
   halves identically, which is why the card compares RESOLVED strings rather than these keys. */
const COLLIDING = [
  ['North America', 'Northern America'], ['South America', 'South America'],
  ['Antarctica', 'Antarctica'], ['Seven seas (open ocean)', 'Seven seas (open ocean)'],
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

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 *  R443 — …AND THE OTHER HALF OF THE VERY SAME LINE
 * ----------------------------------------------------------------------------------------------
 *  ⑤ above says the card resolves `s.region`. It printed `s.subregion` RAW beside it for another
 *  nineteen rounds — 「北アメリカ / Northern America」 in Japanese, and the same in de/ru/es/fr/
 *  ko/zh-Hant/zh-Hans — because #R424 deferred it in one sentence: «it has no entry in any table
 *  to be shown instead». It had two. js/atlas-examples.js held 22 of the 24 values as shipped
 *  `L(…)` calls (#R313 追記2), and the other two were already `_REGIONS` keys.
 *
 *  ⚠ SO THESE CHECKS ARE NOT «is there a second table» — they are «is there exactly ONE, does it
 *  cover the vocabulary, and do the two tables agree where they overlap». ⑩ is the part that
 *  would have caught the original defect: a copy per surface, corrected on one of them.
 * ══════════════════════════════════════════════════════════════════════════════════════════════*/

/* ⚠ ONE CLAIM PER LANGUAGE, read against the RAE the same way ④'s set was: Spanish spells both
   Oceanian subregions exactly as English does, and scripts/i18n-positional-audit.mjs has carried
   that same pair since #R309. Everything else in the 24 must differ. */
const SAME_AS_EN_SUB = { es: ['Melanesia', 'Micronesia'] };

/* ══ ⑥ the table IS Natural Earth's SUBREGION vocabulary — no gap, and no invented key ═════════ */
test('R443 ⑥ subregionName covers exactly Natural Earth’s 24 SUBREGION values', () => {
  const keys = subregionTable().map((r) => r.key).sort();
  assert.deepEqual(keys, [...NE_SUBREGIONS].sort(),
    'a value Natural Earth puts on a real row of the Countries list prints as raw English in all '
    + 'nine languages, or the table carries a key nothing upstream can produce');
});

/* ══ ⑦ …in the five-argument shape every instrument in scripts/i18n-*.mjs can see ══════════════ */
test('R443 ⑦ every subregion is a five-argument call whose first argument is its own key', () => {
  for (const { key, call } of subregionTable()) {
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

/* ══ ⑧ …AND THE APP'S OWN RESOLVER IS ASKED, IN ALL NINE LANGUAGES ════════════════════════════ */
test('R443 ⑧ every subregion resolves in all nine languages, through the app’s own resolver', () => {
  const ctx = resolver();
  const codes = ctx.IntMapLang.list().map((r) => r.code);
  let lang = 'en';
  const pick = ctx.IntMapLang.pick(() => lang);
  const bad = [];
  for (const { key, call } of subregionTable()) {
    const args = call.arguments.map((a) => a.value);
    for (const code of codes) {
      lang = code;
      const got = pick.apply(null, args);
      assert.ok(got && String(got).trim(), `${key} resolved to nothing in ${code}`);
      if (code === 'en') { assert.equal(got, key, `${key}: English must be the key itself`); continue; }
      if (got === key && !(SAME_AS_EN_SUB[code] || []).includes(key)) bad.push(`${code}  ${key}`);
    }
  }
  assert.deepEqual(bad, [],
    `${bad.length} subregion(s) still resolve to the English string — a reader of that language sees `
    + `English on the card’s Region row:\n  ${bad.join('\n  ')}`);
});

/* ══ ⑨ the two tables agree where the same place is in both, and that is what the card collapses ═ */
test('R443 ⑨ CONTINENT and SUBREGION never disagree about a place they both name', () => {
  const reg = new Map(regionTable().map((r) => [r.key, r.call.arguments.map((a) => a.value)]));
  const sub = new Map(subregionTable().map((r) => [r.key, r.call.arguments.map((a) => a.value)]));

  /* ① the three keys that are literally in both tables must be the same five arguments. Two copies
        of one spelling is how the defect this round fixed was born, one level up. */
  const shared = [...sub.keys()].filter((k) => reg.has(k));
  assert.ok(shared.length >= 3,
    `«Antarctica», «South America» and «Seven seas (open ocean)» are Natural Earth CONTINENT values AND `
    + `SUBREGION values; the tables share ${shared.length} keys, so this check has stopped asserting anything`);
  for (const k of shared) {
    assert.deepEqual(sub.get(k), reg.get(k),
      `${k}: the same place is spelled two ways in the two tables — the card would print both`);
  }

  /* ② …and the card's collapse compares RESOLVED strings, so measure them. Every language except
        English spells both halves of all four pairs identically; English keeps «North America»
        apart from «Northern America», which is the one row of this table that must NOT collapse. */
  const ctx = resolver();
  const codes = ctx.IntMapLang.list().map((r) => r.code);
  let lang = 'en';
  const pick = ctx.IntMapLang.pick(() => lang);
  const rows = [];
  for (const [r, s] of COLLIDING) {
    assert.ok(reg.has(r), `${r} is a CONTINENT value with no entry in _REGIONS`);
    assert.ok(sub.has(s), `${s} is a SUBREGION value with no entry in subregionName`);
    for (const code of codes) {
      lang = code;
      const a = pick.apply(null, reg.get(r)), b = pick.apply(null, sub.get(s));
      rows.push({ code, r, s, same: a === b, a, b });
    }
  }
  const notSame = rows.filter((x) => !x.same).map((x) => `${x.code}  ${x.a} / ${x.b}`);
  assert.deepEqual(notSame, ['en  North America / Northern America'],
    'the card doubles a place name for a reader of these languages — or English has stopped being '
    + `the one pair that legitimately differs:\n  ${notSame.join('\n  ')}`);
});

/* ══ ⑩ ONE TABLE, TWO READERS — the shape that would have caught the original defect ═══════════ */
test('R443 ⑩ the card resolves the subregion, and no second copy of the table exists in js/', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');   /* comments are not the program (#R345) */
  const src = strip(rd(COUNTRIES));

  assert.match(src, /statRegion'\)[^\n]*_imSubregionName\(s\.subregion,\s*HOST\.lang\)/,
    'the country card’s Region row must resolve the subregion, not print Natural Earth’s English');
  assert.doesNotMatch(src, /\(s\.subregion\?' \/ '\+s\.subregion:''\)/,
    'the shape #R443 removed from the country card is back — the raw SUBREGION beside a translated region');
  assert.match(src, /const _regRow=\(a,b\)=>[^\n]*b!==a/,
    'the collapse must compare the two RESOLVED strings; comparing the English keys collapses none of the four');

  /* the table is DECLARED once. A `'Australia and New Zealand':` key is this vocabulary and nothing
     else; js/locales/ui.*.js hold the same words as INLINE entries, which is a different mechanism
     (keyed by the English string, for the four languages past the positional five) and is not js/*.js. */
  const jsDir = new URL('js/', root);
  const holders = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'))
    .filter((f) => /'Australia and New Zealand'\s*:/.test(strip(fs.readFileSync(new URL(f, jsDir), 'utf8'))));
  assert.deepEqual(holders, ['countries-ui.js'],
    'the 24 SUBREGION names are declared in more than one js/ module — a correction made on one of '
    + `them leaves the other wrong, which is exactly how this round’s defect was built: ${holders.join(', ')}`);

  const atlas = strip(rd('js/atlas-examples.js'));
  assert.match(atlas, /window\._imSubregionName\(s,\s*HOST\.lang\)/,
    'Atlas’s {sub} slot must resolve through the one shared table, with its own language');

  /* ⚠⚠ AND THE BRIDGE IS `window`, NOT `export`, FOR A REASON THAT IS MEASURED HERE RATHER THAN
     REMEMBERED. Several harnesses run js/countries-ui.js as a CLASSIC SCRIPT through
     `new Function(src)` so they can exercise the real `_mkStat` and the real 10 m upgrade pass over
     synthetic Natural Earth features. One `export` keyword is a SyntaxError to every one of them —
     measured: 16 tests red across tests/r375, r392, r423 and r337 on a file whose behaviour had not
     changed. ⚠ The count below is COUNTED, not written down, and the property those harnesses depend
     on is stated directly — so a future round learns it from one parse error here, not from sixteen
     somewhere else, and the day nothing runs this file as a script the first assertion says so. */
  const here = 'r424-checks.test.mjs';
  const tDir = new URL('tests/', root);
  const runners = fs.readdirSync(tDir)
    .filter((f) => f.endsWith('.test.mjs') && f !== here)
    .filter((f) => { const t = fs.readFileSync(new URL(f, tDir), 'utf8'); return t.includes('countries-ui.js') && t.includes('new Function('); });
  assert.ok(runners.length >= 3,
    `only ${runners.length} harness(es) still run js/countries-ui.js as a script — if that is now zero, `
    + 'this constraint is gone and the table may become a named export');
  assert.doesNotThrow(() => parse(rd(COUNTRIES), { ecmaVersion: 2022 }),
    `${COUNTRIES} must stay parseable as a classic script: ${runners.join(', ')} run it with new Function()`);
});
