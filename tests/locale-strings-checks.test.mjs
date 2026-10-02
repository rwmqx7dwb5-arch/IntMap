/* ============================================================================
 *  IntMap · the locale tables, and the switch that waits for them
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r474-checks.test.mjs (decoration belongs to the markup, never to a
 *  translation), tests/r233-checks.test.mjs ①–④ (the language switch waits for its table; the five
 *  strings that were in no table; the screenshot label names the map) and tests/r395-checks.test.mjs
 *  ⑩–⑪ (what the Simplified-Chinese generator may and may not convert). Original headers follow.
 * ==========================================================================*/
/* ============================================================================
 *  IntMap · R474 — the markup drew one star, three languages drew a second one
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
/* #R233 (from its header):
// Guards this round's batch:
//   ①  changing the UI language WAITS for that language's strings — the reproduced 「言語が混在」
//   ②  …and a locale that lands by any other route repaints what is already on screen
//   ③  the five strings that were in no table at all (two legal links, two legal tabs, the
//       composer's image label) exist in EVERY locale, and no caller hand-writes a jp/en ternary
//   ④  the screenshot feature says it is about the MAP, in every language
   #R395 ⑩–⑪: see the note above each test. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';
import { codeOnly } from '../scripts/code-only.mjs';
import { importModule } from './helpers/import-module.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = path.join(ROOT, 'js', 'locales');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const { readLF } = await import('../scripts/eol.mjs');

/* ⚠ COMMENTS ARE STRIPPED BEFORE EVERY NEGATIVE CHECK — #R208/#R229/#R231/#R232 all hit the same
   trap: a note that QUOTES the thing it says was removed makes "it is gone" fail. Match syntax. */
const noJs = (s) => codeOnly(String(s));
const noHtml = (s) => codeOnly(String(s), { lang: 'html' });
/* every keyed UI table on disk (#R233) */
const UI_FILES = readdirSync(LOCALES).filter((f) => /^ui\.[A-Za-z0-9-]+\.js$/.test(f));

/* ══════════════════════════ #R474 · decoration is the markup's ══════════════════════════ */
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
      /* (icon-system) the decoration is an icon slot now — `<span data-icon="star"></span>` right before the
         translated element — which js/icons.js draws; it counts as the markup decorating this key */
      const slot = /<span\b[^>]*\sdata-icon="([^"]+)"[^>]*><\/span>\s*$/.exec(src.slice(Math.max(0, m.index - 160), m.index));
      const g = (slot ? ['icon:' + slot[1]] : []).concat(glyphs(before), glyphs(after));
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
  /* (module-graph) a locale file imports the registry it defines into, so it is parsed as the module it is */
  walk.simple(parse(readFileSync(p, 'utf8'), { ecmaVersion: 2022, sourceType: 'module' }), {
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
test('#R474 ① the decorated-heading universe is read out of the markup, and favLayers is in it', () => {
  const deco = decoratedKeys();
  assert.ok(deco.size >= 5,
    'the markup decorates at least five translated labels; found ' + deco.size
    + ' — if this collapsed, the reader stopped reading rather than the defects stopping ('
    + Array.from(deco.keys()).join(', ') + ')');
  const fav = deco.get('favLayers');
  assert.ok(fav, 'favLayers is decorated by the markup; universe: ' + Array.from(deco.keys()).join(', '));
  assert.equal(fav.glyphs, 'icon:star', 'and the star beside it is the markup’s own — js/icons.js «star», drawn into the slot');
});

/* ── ② the ceiling: a decorated key carries no decoration in any language ───────────────────────── */
test('#R474 ② no language repeats decoration the markup already prints', () => {
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
test('#R474 ③ the detector reports the three strings that were on production', () => {
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
test('#R474 ④ the two stars are different characters, so a byte comparison would have been green', () => {
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

/* ══════════════════════════ #R233 · the switch waits, and every locale answers ══════════════════════════ */
/* ── ① / ② the language switch is an awaited event ───────────────────────────────────────────── */
/* js/lang-switch.js, RUN against a language registry whose loading this test controls: which codes
   are loaded, and when (and whether) a fetch settles. Only the registry is a stand-in — the switch
   is the shipped file, evaluated. */
/* (module-graph) the switch IMPORTS the registry now, so the stand-in is handed at that import edge, and the
   shipped module is imported (not run from its text) with a fake window to publish IntMapLangSwitch on */
async function langSwitch(loaded) {
  const fetches = new Map(), hooks = [];
  const LANG = {
    normalise: (c) => String(c),
    isLoaded: (c) => loaded.includes(c),
    ensure: (c) => new Promise((ok, no) => fetches.set(c, { ok: () => { loaded.push(c); ok(); }, no })),
    onDefine: (fn) => { hooks.push(fn); },
  };
  const win = {};
  win.window = win;
  await importModule('js/lang-switch.js', { globals: { window: win }, mocks: { 'js/lang-registry.js': { IntMapLang: LANG } } });
  return { SW: win.IntMapLangSwitch, fetches, define: (c) => hooks.forEach((h) => h(c)) };
}
const settled = () => new Promise((r) => setTimeout(r, 0));

test('R233 i18n: switching language waits for that language\'s table before repainting', async () => {
  const { SW, fetches, define } = await langSwitch(['en']);
  assert.equal(typeof SW?.when, 'function', 'the module publishes the switch');

  let applied = 0;
  SW.when('en', () => { applied++; });
  assert.equal(applied, 1, 'an already-loaded language is still synchronous');

  let de = 0;
  SW.when('de', () => { de++; });
  assert.equal(de, 0, 'a language whose table has not arrived is NOT repainted yet — that was 「言語が混在」');
  assert.ok(fetches.has('de'), 'a missing locale is fetched');
  fetches.get('de').ok(); await settled();
  assert.equal(de, 1, '…and applied once it lands');

  let fr = 0;
  SW.when('fr', () => { fr++; });
  fetches.get('fr').no(new Error('offline')); await settled();
  assert.equal(fr, 1, 'a FAILED fetch applies too, or the pill would do nothing');

  /* ② a locale arriving by any other route (cold boot, prefetch, retry) repaints the document —
     but only when it is the language the app is showing */
  let repaints = 0;
  SW.bind(() => 'ko', () => { repaints++; });
  define('ru');
  assert.equal(repaints, 0, 'a table for a language nobody is reading repaints nothing');
  define('ko');
  assert.equal(repaints, 1, 'a locale arriving by any other route repaints the document');

  /* spelling kept below — setLang and the boot order live in the app shell (js/app-body.js, src/main.js),
     which cannot run outside a browser; what is pinned is that they route through the switch above */
  const body = noJs(read('js/app-body.js'));
  assert.match(body, /window\.IntMapLangSwitch\.when\(lang,/,
    'setLang goes through the switch rather than repainting immediately');
  /* the exact defect: currentLang assigned, then updateI18n(), with nothing awaited between them */
  /* (module-graph) the registry is an import in app-body now, so the repaint is spelt either way — both are refused */
  assert.doesNotMatch(body, /currentLang=lang;\s*\n?\s*try\{ (?:window\.)?IntMapLang\.codes\(\)/,
    'setLang must not assign the language and repaint before the strings can be read');

  assert.match(body, /IntMapLangSwitch\.bind\(\(\)=>currentLang, updateI18n\)/,
    'app-body registers the live language accessor and the repaint — one repaint, one owner');

  /* src/main.js must actually load it, before anything can call setLang */
  const main = read('src/main.js');
  assert.match(main, /import '\.\.\/js\/lang-switch\.js';/, 'the entry imports the switch');
  assert.ok(main.indexOf("js/lang-switch.js") > main.indexOf("js/i18n.js"),
    'it installs its onDefine hook after js/i18n.js has installed its own merge hook');
});

/* ── ③ the strings that were in no table ─────────────────────────────────────────────────────── */
test('R233 i18n: the five untranslated strings are keyed, and every locale answers them', () => {
  /* spelling kept — the locale half reads DATA; the composer label and the workspace button are DOM wiring inside app factories that need the whole host to run, so their call sites are read */
  const KEYS = ['lnkTerms', 'lnkPrivacy', 'legalTabTerms', 'legalTabPrivacy', 'commAddImage'];
  const html = noHtml(read('index.html'));
  for (const k of KEYS) {
    assert.match(html, new RegExp('data-i18n="' + k + '"'), `index.html marks ${k} for translation`);
  }
  const missing = [];
  for (const f of UI_FILES) {
    const src = read('js/locales/' + f);
    for (const k of KEYS) if (!new RegExp('"?' + k + '"?\\s*:').test(src)) missing.push(f + ':' + k);
  }
  assert.deepEqual(missing, [], 'every locale carries all five:\n' + missing.join('\n'));

  /* and the composer label is no longer a two-language ternary written at the call site */
  assert.match(read('js/community-board.js'), /compose-img-label'\)\.textContent=HOST\.t\('commAddImage'\)/,
    'the image label comes from the table');
  assert.doesNotMatch(noJs(read('js/community-board.js')), /compose-img-label'\)\.textContent=jp\?/,
    '…not from a jp/en ternary, which is English in the other seven languages');

  /* the workspace button writes its own label, so it must re-write it when the language changes */
  assert.match(read('js/workspace.js'), /addEventListener\('intmap-lang',syncModeBtn\)/,
    'a JS-written label that updateI18n() cannot reach must subscribe to the language event');
});

/* ── ④ the screenshot says it is about the map ───────────────────────────────────────────────── */
test('R233 the screenshot feature names the MAP in every language', () => {
  /* 「スクショ機能は地図をスクショする機能であることが分かる名称に。」 The label is `mScreenshot`;
     the word for "map" in that language has to be in it, or the rename did not reach that locale. */
  const MAP_WORD = {
    'ui.en.js': /Map screenshot/i, 'ui.jp.js': /地図の/, 'ui.de.js': /Karten/,
    'ui.ru.js': /карты/i, 'ui.es.js': /del mapa/i, 'ui.fr.js': /de la carte/i,
    'ui.ko.js': /지도/, 'ui.zh.js': /地圖/, 'ui.zh-hans.js': /地图/,
  };
  const bad = [];
  for (const f of UI_FILES) {
    const m = /mScreenshot\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(read('js/locales/' + f));
    if (!m) { bad.push(f + ': no mScreenshot'); continue; }
    const want = MAP_WORD[f];
    if (want && !want.test(m[1])) bad.push(f + ': ' + m[1]);
  }
  assert.deepEqual(bad, [], 'these still name a screenshot without naming the map:\n' + bad.join('\n'));
});
/* ══════════════════════════ #R395 · the Simplified generator ══════════════════════════ */
/* ── ⑩ the Simplified file carries mainland vocabulary, not converted Taiwanese vocabulary ── */
test('#R395 ⑩ the Simplified locale does not ship Taiwan-only wording for the new geography', () => {
  /* ⚠ BOTH generated Simplified files, because scripts/zh-hans.mjs derives both and a word can live
     in either — 俯冲板块 is in the reading pages' Slab2 sentence and nowhere in the UI table. Reading
     only one of them is how a term ships wrong in the file nobody checked. */
  const hans = readLF(join(ROOT, 'js', 'locales', 'ui.zh-hans.js'))
    + '\n' + readLF(join(ROOT, 'js', 'locales', 'pages.zh-hans.js'));
  /* left column: what character conversion alone would have produced. #R319/#R335's shape — the
     characters are already shared, so no orthography check can see the difference. */
  /* ⚠ (#R395 追記) THE LAST TWO CAME FROM PRODUCTION, not from the inventory: OpenCC's vocabulary
     profile does not carry these geology terms, so the twp→cn sweep passed them and the shipped
     Simplified chunk said 隐没带 / 分裂径迹 to a mainland reader. The inventory is a floor. */
  const PAIRS = [['索马利亚', '索马里'], ['维德角', '佛得角'], ['肯亚', '肯尼亚'], ['葛摩', '科摩罗'],
    ['万那杜', '瓦努阿图'], ['安地斯', '安第斯'], ['加拉巴哥', '加拉帕戈斯'], ['克马得', '克马德克'],
    ['民答那峨', '棉兰老'], ['皮特康', '皮特凯恩'], ['加里波底', '加里波第'], ['安地列斯', '安的列斯'],
    ['二氧化矽', '二氧化硅'], ['隐没带', '俯冲带'], ['隐没板块', '俯冲板块'],
    ['分裂径迹', '裂变径迹']];
  for (const [taiwan, mainland] of PAIRS) {
    assert.ok(hans.includes(mainland), `the generated Simplified files have lost «${mainland}» — scripts/zh-hans.mjs WORDS row missing?`);
    assert.ok(!hans.includes(taiwan), `a generated Simplified file still ships the Taiwan wording «${taiwan}»; the mainland word is «${mainland}»`);
  }
});

/* ── ⑪ an inline KEY is an identity, so the generator must not convert it ── */
test('#R395 ⑪ the Simplified generator leaves inline keys byte-identical, whatever they are written in', () => {
  /* ⚠ #R231 lifted keys out of the character conversion but matched an indent of exactly four
     spaces — the `ui` table's. The `inline` table is indented by two, so no inline key was ever
     protected; it was invisible only because every inline key was ASCII. JMA publishes its warnings
     in Japanese and the key IS what the agency said, so 「レベル２（火口周辺規制）」 came out as
     「…火口周辺规制）」 — a key no call site can ever produce. */
  const keysOf = (f) => [...readLF(join(ROOT, 'js', 'locales', f))
    .matchAll(/\n\s{2,}("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*:/g)].map((m) => m[1]);
  const hant = keysOf('ui.zh.js'), hans = keysOf('ui.zh-hans.js');
  assert.equal(hans.length, hant.length, 'the two Chinese locales no longer hold the same number of keys');
  const drift = hant.map((k, i) => [k, hans[i]]).filter(([a, b]) => a !== b);
  assert.equal(drift.length, 0,
    `${drift.length} key(s) were rewritten by the Simplified generator, so they identify nothing: ` +
    drift.slice(0, 4).map(([a, b]) => a + ' → ' + b).join(' | '));
  /* and the check is not vacuous: some of those keys really do contain Han characters */
  assert.ok(hant.filter((k) => /[㐀-鿿]/.test(k)).length >= 4, 'no inline key contains Han characters — ⑪ would pass without testing anything');
});

