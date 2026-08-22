/* ============================================================================
 *  IntMap · #R313 追記 — source-level checks
 * ----------------------------------------------------------------------------
 *  Production verification of #R313 found a defect #R313 itself introduced:
 *
 *    「Ulaanbaatarで起きていることのうち、モンゴル国の外にまで効くのは？」
 *    「モンゴル国はEastern Asiaの他の国とどこが違う？」
 *
 *  A fully translated sentence with an UNTRANSLATED VALUE dropped into the middle of it, in six of
 *  six countries measured in ja. `{place}` was localised (cName → CLDR); `{capital}` and `{sub}` were
 *  not — they came straight out of `countryStats`, which holds Natural Earth's English strings.
 *
 *  ⚠⚠⚠ `npm run check:i18n` CANNOT SEE THIS, AND THAT IS THE POINT OF THIS FILE. The gate measures
 *  TEMPLATES, and all nine templates were complete — it was the substitution that was English. A
 *  round can therefore ship a 100 % green i18n gate and a chip that reads half in one language. So
 *  the property asserted here is not «the strings are translated» but «every token a chip can carry
 *  is resolved through something that speaks the reader's language, or it is not carried at all».
 *
 *  ⚠ EVERY ASSERTION IS A RELATION BETWEEN TWO PLACES, NOT A SPELLING (#R310's rule). ① compares the
 *  tokens the templates USE with the tokens `fill()` can RESOLVE — so a seventh token added to a chip
 *  without a resolver goes red on its own. ② runs the shipped M49 table through Intl in all nine
 *  languages rather than trusting the table.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ═════════════════════════════════════════════════════════════════════════
   ① no chip can carry a token that nothing resolves in the reader's language
   ═══════════════════════════════════════════════════════════════════════ */
test('R313 追記 ① every token the chips use is resolved by fill(), and every resolver speaks the reader’s language', () => {
  const ex = code('js/atlas-examples.js');

  /* what the templates ask for … */
  const used = new Set([...ex.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]));
  /* … and what the substitution step can answer */
  const fill = ex.slice(ex.indexOf('function fill('), ex.indexOf('function examples('));
  const resolved = new Set([...fill.matchAll(/replace\(\/\\\{([a-z]+)\\\}\/g/g)].map((m) => m[1]));

  for (const t of used) {
    assert.ok(resolved.has(t),
      'a chip uses {' + t + '} but fill() does not resolve it — it would reach the reader as a literal token');
  }
  for (const t of resolved) {
    assert.ok(used.has(t), 'fill() resolves {' + t + '} that no chip asks for — dead substitution');
  }

  /* ⚠ THE DEFECT ITSELF: {capital} came from an ENGLISH-ONLY table (CAPITAL in js/tables.js — CLDR
     has no city names). The chip lost the name it could not translate rather than printing it. */
  assert.ok(!used.has('capital'),
    'no chip names a capital city: the app holds those names only in English (js/tables.js CAPITAL)');
  assert.match(read('js/tables.js'), /const CAPITAL=\{/,
    'and that table is still there — the data was not deleted, only the claim that it was translated');

  /* {place} and {sub} both go through something that takes the reader's language as an argument */
  assert.match(fill, /\{place\\\}\/g,\(f&&f\.name\)/, '{place} is the CLDR name cName() resolved');
  assert.match(fill, /\{sub\\\}\/g,subName\(st\)/, '{sub} goes through a resolver, not through the raw field');
  const sub = ex.slice(ex.indexOf('function subName('), ex.indexOf('function fill('));
  assert.match(sub, /_imCldrRegion\(c,\s*HOST\.lang\)/,
    'and that resolver asks CLDR in the reader’s language');
  assert.match(sub, /return s;/, '…falling back to the upstream string when CLDR has no name for it');
});

/* ═════════════════════════════════════════════════════════════════════════
   ② the M49 table is a CODE table — prove it against Intl, in all nine
   ═══════════════════════════════════════════════════════════════════════ */
test('R313 追記 ② every mapped subregion resolves in all nine languages, and English is the upstream string', () => {
  const src = read('js/atlas-examples.js');
  const lit = /const M49=\{[\s\S]*?\};/.exec(src);
  assert.ok(lit, 'the table is a plain object literal this test can lift out');
  const M49 = new Function('return (' + lit[0].replace('const M49=', '').replace(/;$/, '') + ')')();

  const n = Object.keys(M49).length;
  assert.ok(n >= 20, 'the table names the UN M49 macro-regions (' + n + ')');

  /* the nine tags js/lang-registry.js resolves to, read from the registry rather than written here */
  const reg = read('js/lang-registry.js');
  assert.match(reg, /function locale\(/, 'the registry still owns the language→tag mapping');
  /* ⚠ EN IS NOT IN THIS LIST ON PURPOSE — see the English assertion below. */
  const tags = ['ja-JP', 'de-DE', 'ru-RU', 'es-ES', 'fr', 'ko', 'zh-Hant', 'zh-Hans'];

  const unresolved = [];
  for (const [name, cd] of Object.entries(M49)) {
    assert.match(cd, /^[0-9]{3}$/, name + ' maps to a three-digit M49 code, not to a translation');
    for (const tag of tags) {
      let got = '';
      try { got = new Intl.DisplayNames([tag], { type: 'region', fallback: 'none' }).of(cd) || ''; } catch (_) {}
      if (!got) unresolved.push(tag + '/' + name);
    }
  }
  assert.deepEqual(unresolved, [], 'every mapped subregion has a CLDR name in every language');

  /* ⚠⚠ ENGLISH IS NOT ROUTED THROUGH CLDR AT ALL, AND THAT IS DELIBERATE. `_imCldrRegion` returns ''
     for 'en' (js/countries-ui.js), so `subName` falls back to the upstream string — which matters,
     because CLDR's English is NOT the same wording for three of these: 035 is 'Southeast Asia' where
     Natural Earth says 'South-Eastern Asia', 053 is 'Australasia' not 'Australia and New Zealand',
     and 057 is 'Micronesian Region' not 'Micronesia'. Routing en through CLDR would silently reword
     the one language that never needed translating. This asserts the short-circuit is still there. */
  assert.match(code('js/countries-ui.js'), /tag==='en'\) return ''/,
    "English short-circuits before CLDR, so it keeps the upstream spelling");
  const enDiff = Object.entries(M49).filter(([n, c]) =>
    new Intl.DisplayNames(['en'], { type: 'region' }).of(c) !== n);
  assert.ok(enDiff.length > 0,
    'and that short-circuit is load-bearing: CLDR en differs from the upstream spelling for '
    + enDiff.length + ' of these');

  /* the door it goes through has to accept a three-digit code — it used to demand exactly two */
  const cu = code('js/countries-ui.js');
  assert.match(cu, /\[0-9\]\{3\}/, 'window._imCldrRegion accepts M49 codes as well as country codes');
  assert.match(cu, /window\._imCldrRegion=function\(a2,lang\)/, 'and it is still the one CLDR surface');
});
