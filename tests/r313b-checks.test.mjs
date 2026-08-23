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
  /* ⚠ (#R313 追記2) this used to require a CLDR call. The browser has no M49 names, so that call was
     doing nothing where it mattered — the resolver reads a table this repository ships. See ②. */
  assert.match(sub, /SUB\[s\]/, 'and that resolver reads the names this repository ships');
  assert.match(sub, /return s;/, '…falling back to the upstream string for anything not in it');
});

/* =========================================================================
   (2) the subregion names are SHIPPED STRINGS - not something an engine may or may not have
   ======================================================================= */
test('R313 追記2 ② every subregion is a literal L() in the source, and nothing is looked up at runtime', () => {
  const src = read('js/atlas-examples.js');
  const ex = code('js/atlas-examples.js');

  /* ⚠⚠⚠ WHY THIS TEST WAS REWRITTEN. 追記1 mapped each subregion to its UN M49 code and asked
     `Intl.DisplayNames({type:'region'})` for the name. That resolves all 22 codes in all nine
     languages in NODE — and NOT ONE of them in the browser. MEASURED on production: `of('030')` is
     undefined in Chromium and 「東アジア」 in Node; 0/22 in ja, en, ko and de; `of('JP')` still answers
     and `of('419')` answers, so it is not a stripped ICU — V8's region table holds COUNTRIES, not the
     M49 macro-regions. Every reader kept seeing 「モンゴル国はEastern Asiaの…」 while THIS FILE'S OWN
     CHECK stayed green, because it measured the runtime the test runs in rather than the one that
     ships. ⚠ So the property is no longer «the platform can name it» but «the name is in our source»,
     which is the same in every engine. */
  const table = /const SUB=\{[\s\S]*?\r?\n {4}\};/.exec(src);
  assert.ok(table, 'the subregion names are a table in this file');
  const entries = [...table[0].matchAll(/'([^']+)':\(\)=>L\('([^']*)','([^']*)','([^']*)','([^']*)','([^']*)'\)/g)];
  assert.ok(entries.length >= 20, 'it names the subregions the country table ships (' + entries.length + ')');

  for (const [, key, en, ja, de, ru, es] of entries) {
    assert.equal(en, key, key + ': the English argument IS the key the four keyed languages resolve by');
    for (const [lang, v] of [['ja', ja], ['de', de], ['ru', ru], ['es', es]]) {
      assert.ok(v, key + ' has a ' + lang + ' name');
    }
    /* \u26a0 THE STRONG CHECK IS SCRIPT, NOT DIFFERENCE. 'Melanesia' really is the Spanish for Melanesia,
       so \u00abdiffers from English\u00bb is a FALSE property for a Latin-script language and asserting it would
       make this test wrong rather than strict. Japanese and Russian cannot coincide with English, so
       those two are checked exactly; the Latin pair is checked in bulk below. */
    assert.ok(/[\u3040-\u30ff\u4e00-\u9fff]/.test(ja), key + ': the Japanese name is written in Japanese');
    assert.ok(/[\u0400-\u04ff]/.test(ru), key + ': the Russian name is written in Cyrillic');
  }

  /* \u2026and for the Latin-script pair, most entries must still differ \u2014 a table copied wholesale from
     English would pass the per-row check above on the handful of genuine coincidences alone. */
  for (const [lang, idx] of [['de', 3], ['es', 5]]) {
    const n = entries.filter((e) => e[idx] !== e[2]).length;
    assert.ok(n >= entries.length - 4,
      lang + ' is a real translation, not English copied across (' + n + '/' + entries.length + ' differ)');
  }

  /* ⚠ AND NOTHING IS ASKED OF THE PLATFORM. A runtime lookup is exactly what differed between the two
     engines, so the resolver must not contain one. */
  assert.ok(!/Intl\.DisplayNames/.test(ex), 'the chips do not ask Intl for a region name');
  assert.ok(!/_imCldrRegion/.test(ex), 'nor the CLDR helper, which cannot answer for a macro-region');
  const sub = ex.slice(ex.indexOf('function subName('), ex.indexOf('function fill('));
  assert.match(sub, /SUB\[s\]/, 'subName reads the shipped table');
  assert.match(sub, /return s;/, '…and falls back to the upstream string for anything not in it');

  /* the helper it used to lean on is back to the codes it can actually answer for */
  assert.match(code('js/countries-ui.js'), /a2\.length!==2/,
    'window._imCldrRegion takes two-letter countries again — it was widened for a lookup that never worked');

  /* ⚠ `{sub}` sits in a parenthetical apposition so no language governs a case over it (#R309) */
  const chip = src.slice(src.indexOf("k:'subregion'"), src.indexOf("k:'subregion'") + 900);
  assert.match(chip, /\(\{sub\}\)/, 'the region name is an apposition in parentheses, not a governed noun');
});
