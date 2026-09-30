/* ============================================================================
 *  flag-value-owner — one field with two meanings has one reader that tells them apart
 * ----------------------------------------------------------------------------
 *  `countryStats[*].flag` is an emoji (text) for a modern country and, for a former state, the inline-SVG
 *  image js/history.js / js/time-borders.js build (markup). The output-taint round escaped it at four
 *  sinks, and production printed `<img class="hist-flag" …` as text in 13 of 211 rows of the 1900 country
 *  list (MEASURED 2026-09-30). Other readers inserted it raw — safe only because every value was ours.
 *  window.IntMapSafe.flag is the one reader: the exact image shape is rebuilt from its parsed data: URI,
 *  anything else is escaped text. RUN on the shipped js/safe-html.js and the shipped flag builders.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const G = {};
new Function('globalThis', read('js/safe-html.js'))(G);
const { flag } = G.IntMapSafe;

/* the builders' own expression, lifted from each file that makes a flag image */
function builderOf(file) {
  const src = read(file);
  const m = /const (\w+)=\(inner\)=>('<img class="hist-flag" alt="" src="data:image\/svg\+xml,'\+encodeURIComponent\([^;]*\)\+'">');/.exec(src);
  assert.ok(m, file + ' no longer builds its flag image the way js/safe-html.js recognises it');
  const svgU = (inner) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20">' + inner + '</svg>';
  return new Function('svgU', 'return (inner)=>' + m[2] + ';')(svgU);
}

test('a flag image the builders make comes back as that image; an emoji comes back as text', () => {
  for (const file of ['js/history.js', 'js/time-borders.js']) {
    const img = builderOf(file)('<rect width="30" height="20" fill="#DD0000"/><path d="M0,0 L1,1" stroke="#fff"/>');
    assert.equal(flag(img), img, file + ': the image was not passed through as markup');
  }
  assert.equal(flag('🇯🇵'), '🇯🇵');
  assert.equal(flag('', '🏳️'), '🏳️');
  assert.equal(flag(null), '');
});

test('anything else is text, however close to the image it looks', () => {
  const evil = [
    '<img src=x onerror=alert(1)>',
    '<img class="hist-flag" alt="" src="data:image/svg+xml,%3Csvg%3E" onerror="alert(1)">',
    '<img class="hist-flag" alt="" src="javascript:alert(1)">',
    '<img class="hist-flag" alt="" src="data:image/svg+xml,<svg onload=alert(1)>">',
    '<img class="hist-flag" alt="" src="data:image/svg+xml,%3Csvg%3E">x<script>1</script>',
  ];
  for (const v of evil) assert.ok(!/</.test(flag(v)), 'rendered as markup: ' + v);
});

test('every reader of a flag value goes through the one reader', () => {
  /* the sinks that render countryStats flags: none may escape it (double escape) or insert it raw */
  const files = ['js/countries-ui.js', 'js/data-layers.js', 'js/stats-compare.js', 'js/app-body.js', 'js/atlas-cap-data.js', 'js/map-ui.js'];
  for (const f of files) {
    const s = read(f);
    assert.doesNotMatch(s, /escC?\((?:s2?|s&&s)\.flag/, f + ' escapes a flag value — a former state prints its image as text');
    assert.doesNotMatch(s, /\$\{s2?\.flag(?:\|\||\?s2?\.flag)|\+\(s2?\.flag(?:\?s2?\.flag|\|\|)|\+opts\.flag\+/, f + ' inserts a flag value raw');
  }
});
