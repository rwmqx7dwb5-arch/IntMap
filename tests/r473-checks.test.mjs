/* ============================================================================
 *  IntMap · R473 — the markup drew one star, three languages drew a second one
 * ----------------------------------------------------------------------------
 *  Measured on production (build R466/R467), the Favourite-layers heading in the layer panel:
 *
 *      ru  ⭐ ★ Избранное          en       ⭐ Favorite layers
 *      es  ⭐ ★ Favoritos          ja       ⭐ お気に入りレイヤー
 *      de  ⭐ ★ Favoriten          zh-Hans  ⭐ 常用图层
 *
 *  index.html owns the decoration —
 *
 *      <div class="layer-fav-title">⭐ <span data-i18n="favLayers">Favorite layers</span></div>
 *
 *  — and `favLayers` in js/locales/ui.{de,es,ru}.js carried a star of its OWN, so those three
 *  readers got the heading twice-starred. Six of the nine languages were already right, which is
 *  what kept it looking like a rendering fault rather than three rows of data.
 *
 *  ══ ⚠⚠⚠ WHY NOTHING CAUGHT IT, AND WHY THE GATE BELOW IS «NO GLYPH AT ALL» ═══════════════════
 *  The two stars are NOT the same character:
 *
 *      markup   ⭐  U+2B50  WHITE MEDIUM STAR
 *      locale   ★  U+2605  BLACK STAR
 *
 *  So any comparison that asks «does the translation repeat the markup's character?» is GREEN on
 *  the exact bytes that shipped — the reader sees two stars, the instrument sees two different
 *  characters. Nor could scripts/i18n-*.mjs see it: every one of those measures whether a string is
 *  TRANSLATED, and 「★ Избранное」 is a perfectly good Russian translation. Nothing was wrong with
 *  the words. What was wrong is that the translation carried DECORATION, and the decoration is the
 *  markup's — that string is used in no other place.
 *
 *  Hence the rule this file gates, and it is a ceiling of zero rather than a comparison:
 *
 *      if the markup already prints a decoration glyph beside a `data-i18n` key,
 *      then NO language's value for that key may print a decoration glyph at all.
 *
 *  ⚠ AND THE UNIVERSE IS DERIVED FROM THE MARKUP, NOT LISTED HERE. Six keys qualify today
 *  (🌐 aiTranslateTitles, 📐 measureMenuBtn, 📷 mScreenshot, 🔗 shareLinkBtn, ⭐ favLayers,
 *  🖼 commAddImage) and a seventh decorated heading is covered the day somebody writes one, without
 *  anybody having to remember this file exists.
 *
 *  ⚠ THE RENDERED heading, in all nine languages, is measured by tests/r251-langs.spec.js ③ — a
 *  static reader can only prove the tables are clean, not that the reader sees one star. That claim
 *  needs a booted app and a switch through every language, and #R251 already walks exactly that, so
 *  it rides there rather than paying for a second boot (scripts/test-budget.mjs records the price).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = path.join(ROOT, 'js', 'locales');

/* ── what counts as DECORATION ──────────────────────────────────────────────────────────────────
   Anything a reader sees as a picture rather than as a letter, a digit or punctuation: emoji, plus
   the four symbol blocks this app decorates with — arrows (U+2190…, → ←), misc technical
   (U+2300…, ⌀ ⏰), geometric shapes and dingbats (U+25A0…, ★ ▸ ✓), and misc symbols and arrows
   (U+2B00…, ⭐ ⬡). U+FE0F is the variation selector that trails an emoji, not a glyph of its own. */
const DECO = /[\p{Extended_Pictographic}←-⇿⌀-⏿■-➿⬀-⯿]/gu;
const glyphs = (s) => (String(s == null ? '' : s).match(DECO) || []).filter((c) => c !== '️');

/* ── the universe: every `data-i18n` key the MARKUP already decorates ───────────────────────────
   The decoration sits in the text node beside the translated span, so that is what is read — the
   character run between the previous tag and this one, and the run after this element closes. */
function decoratedKeys() {
  const out = new Map();                                   /* key -> { file, line, glyphs } */
  for (const f of readdirSync(ROOT).filter((n) => n.endsWith('.html'))) {
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    const re = /<([a-z][\w-]*)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>/gi;
    let m;
    while ((m = re.exec(src))) {
      const tag = m[1], key = m[2];
      const prevGt = src.lastIndexOf('>', m.index);
      const before = prevGt >= 0 ? src.slice(prevGt + 1, m.index) : '';
      const close = src.indexOf('</' + tag + '>', re.lastIndex);
      let after = '';
      if (close >= 0) {
        const from = close + tag.length + 3;
        const nextLt = src.indexOf('<', from);
        after = src.slice(from, nextLt < 0 ? from : nextLt);
      }
      const g = glyphs(before).concat(glyphs(after));
      if (!g.length) continue;
      out.set(key, { file: f, line: src.slice(0, m.index).split('\n').length, glyphs: g.join('') });
    }
  }
  return out;
}

/* ── the keyed tables, parsed rather than grepped ───────────────────────────────────────────────
   The same reader scripts/i18n-keyed-audit.mjs uses: the `ui` object literal each locale declares. */
function keyedTable(code) {
  const p = path.join(LOCALES, 'ui.' + code + '.js');
  const out = new Map();
  if (!existsSync(p)) return out;
  walk.simple(parse(readFileSync(p, 'utf8'), { ecmaVersion: 2022 }), {
    Property(n) {
      if (!(n.key && (n.key.name === 'ui' || n.key.value === 'ui')
        && n.value && n.value.type === 'ObjectExpression')) return;
      for (const pr of n.value.properties) {
        if (pr.type !== 'Property' || pr.value.type !== 'Literal' || typeof pr.value.value !== 'string') continue;
        out.set(pr.key.name != null ? pr.key.name : pr.key.value, pr.value.value);
      }
    },
  });
  return out;
}

const CODES = JSON.parse(/window\.IntMapLangCodes\s*=\s*(\[[^\]]*\])/
  .exec(readFileSync(path.join(LOCALES, '_langs.js'), 'utf8'))[1]);

/* ── ① the universe is real, and the subject is in it ──────────────────────────────────────────── */
test('#R473 ① the decorated-heading universe is read out of the markup, and favLayers is in it', () => {
  const deco = decoratedKeys();
  assert.ok(deco.size >= 5,
    'the markup decorates at least five translated labels; found ' + deco.size
    + ' — if this collapsed, the reader stopped reading rather than the defects stopping ('
    + Array.from(deco.keys()).join(', ') + ')');
  const fav = deco.get('favLayers');
  assert.ok(fav, 'favLayers is decorated by the markup; universe: ' + Array.from(deco.keys()).join(', '));
  assert.equal(fav.glyphs, '⭐', 'and the star beside it is the markup’s ⭐ (U+2B50)');
});

/* ── ② the ceiling: a decorated key carries no decoration in any language ───────────────────────── */
test('#R473 ② no language repeats decoration the markup already prints', () => {
  const deco = decoratedKeys();
  const tables = new Map(CODES.map((c) => [c, keyedTable(c)]));
  const bad = [];
  for (const [key, site] of deco) {
    for (const [code, table] of tables) {
      if (!table.has(key)) continue;
      const g = glyphs(table.get(key));
      if (g.length) {
        bad.push(code + '.' + key + ' = ' + JSON.stringify(table.get(key)) + ' carries ' + g.join('')
          + ' while ' + site.file + ':' + site.line + ' already prints ' + site.glyphs);
      }
    }
  }
  assert.deepEqual(bad, [],
    'decoration is the markup’s job — a translation that repeats it draws the glyph twice');
});

/* ── ③ the instrument fires on what actually shipped ────────────────────────────────────────────
   ⚠ A gate that reads zero proves nothing until it has been shown the defect. These three strings
   are byte-for-byte what js/locales/ui.{de,es,ru}.js carried on production. */
test('#R473 ③ the detector reports the three strings that were on production', () => {
  const SHIPPED = { de: '★ Favoriten', es: '★ Favoritos', ru: '★ Избранное' };
  for (const code of Object.keys(SHIPPED)) {
    assert.deepEqual(glyphs(SHIPPED[code]), ['★'],
      'the ' + code + ' value that shipped is reported as decorated');
  }
  /* …and the corrected rows are not — the star went, the words stayed */
  for (const code of ['de', 'es', 'ru']) {
    const v = keyedTable(code).get('favLayers');
    assert.ok(v && v.trim(), code + ' still HAS a translation of favLayers');
    assert.deepEqual(glyphs(v), [], code + ' = ' + JSON.stringify(v) + ' draws no star of its own');
    assert.ok(!/^\s/.test(v), code + ' has no leading space left behind where the star was');
  }
});

/* ── ④ why the rule is «no glyph», not «not the SAME glyph» ─────────────────────────────────────── */
test('#R473 ④ the two stars are different characters, so a byte comparison would have been green', () => {
  const MARKUP = '⭐';     /* ⭐ WHITE MEDIUM STAR — index.html */
  const SHIPPED = '★';    /* ★ BLACK STAR        — the three locale files */
  assert.notEqual(MARKUP, SHIPPED,
    'if these were ever the same character, this test is what is wrong rather than the rule');
  assert.deepEqual(glyphs(MARKUP), [MARKUP], 'both are decoration to this detector…');
  assert.deepEqual(glyphs(SHIPPED), [SHIPPED], '…which is exactly what comparing codepoints could not say');
  /* and words are never decoration — a translation must not be reported for being a translation */
  const WORDS = ['Favorite layers', 'Favoriten', 'Favoritos', 'Избранное',
    'お気に入りレイヤー', '常用图层',
    '즐겨찾는 레이어', 'Calques favoris'];
  for (const s of WORDS) assert.deepEqual(glyphs(s), [], JSON.stringify(s) + ' is words, and words are not decoration');
});
