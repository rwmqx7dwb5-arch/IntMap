// R233 source-level regression checks (deterministic, no browser).
// Guards this round's batch:
//   ①  changing the UI language WAITS for that language's strings — the reproduced 「言語が混在」
//   ②  …and a locale that lands by any other route repaints what is already on screen
//   ③  the five strings that were in no table at all (two legal links, two legal tabs, the
//       composer's image label) exist in EVERY locale, and no caller hand-writes a jp/en ternary
//   ④  the screenshot feature says it is about the MAP, in every language
//   ⑤  Population & economy is the seven layers the instruction names, and nothing else
//   ⑥  day/night shading is a basic-display switch, not a hazard overlay
//   ⑦  the locate badge means 「ピッタリ」, and the satellite globe is surrounded by space in
//       light mode too
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

/* ⚠ COMMENTS ARE STRIPPED BEFORE EVERY NEGATIVE CHECK — #R208/#R229/#R231/#R232 all hit the same
   trap: a note that QUOTES the thing it says was removed makes "it is gone" fail. Match syntax. */
const noJs = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const noHtml = (s) => String(s).replace(/<!--[\s\S]*?-->/g, ' ');

const LOCALES = readdirSync(new URL('js/locales/', ROOT))
  .filter((f) => /^ui\.[A-Za-z0-9-]+\.js$/.test(f));

/* ── ① / ② the language switch is an awaited event ───────────────────────────────────────────── */
test('R233 i18n: switching language waits for that language\'s table before repainting', () => {
  const sw = read('js/lang-switch.js');
  assert.match(sw, /window\.IntMapLangSwitch\s*=/, 'the module publishes the switch');
  assert.match(sw, /LANG\.isLoaded\(c\)/, 'an already-loaded language is still synchronous');
  assert.match(sw, /LANG\.ensure\(c\)\.then\(go,\s*go\)/,
    'a missing locale is fetched — and a FAILED fetch applies too, or the pill would do nothing');

  const body = noJs(read('js/app-body.js'));
  assert.match(body, /window\.IntMapLangSwitch\.when\(lang,/,
    'setLang goes through the switch rather than repainting immediately');
  /* the exact defect: currentLang assigned, then updateI18n(), with nothing awaited between them */
  assert.doesNotMatch(body, /currentLang=lang;\s*\n?\s*try\{ window\.IntMapLang\.codes\(\)/,
    'setLang must not assign the language and repaint before the strings can be read');

  assert.match(sw, /onDefine\(function \(code\)/,
    'a locale arriving by any other route (cold boot, prefetch, retry) repaints the document');
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
  const KEYS = ['lnkTerms', 'lnkPrivacy', 'legalTabTerms', 'legalTabPrivacy', 'commAddImage'];
  const html = noHtml(read('index.html'));
  for (const k of KEYS) {
    assert.match(html, new RegExp('data-i18n="' + k + '"'), `index.html marks ${k} for translation`);
  }
  const missing = [];
  for (const f of LOCALES) {
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
  for (const f of LOCALES) {
    const m = /mScreenshot\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(read('js/locales/' + f));
    if (!m) { bad.push(f + ': no mScreenshot'); continue; }
    const want = MAP_WORD[f];
    if (want && !want.test(m[1])) bad.push(f + ': ' + m[1]);
  }
  assert.deepEqual(bad, [], 'these still name a screenshot without naming the map:\n' + bad.join('\n'));
});

/* ── ⑤ Population & economy is the seven that were named ─────────────────────────────────────── */
test('R233 layers: Population & economy is the seven named layers, the rest fell to beta', () => {
  const dl = read('js/data-layers.js');
  const m = /\['lyrGrpDemo',\[([^\]]*)\]\]/.exec(dl);
  assert.ok(m, 'the group is still built from a list');
  const ids = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  /* ⚠ (#R254) 'energy' JOINED THE SEVEN, BY INSTRUCTION — 「エネルギー構成レイヤーは昇格」, and the
     reader chose this group when asked which one. So the assertion is «the seven #R233 named, plus
     whatever a later instruction promoted», not a frozen set: freezing it would make the next
     promotion look like a regression. The seven are still asserted individually, which is what
     #R233's own report was about (nothing else may fall back IN by accident). */
  const SEVEN = ['cpi', 'dem', 'gdppc', 'hdi', 'lifeexp', 'popgrid', 'tfr'];
  SEVEN.forEach((id) => assert.ok(ids.includes(id),
    `${id} left 人口・経済; #R233 named 人口密度(1kmグリッド)/1人当たりGDP/合計特殊出生率/HDI/民主主義指数/汚職指標/平均寿命`));
  assert.deepEqual(ids.filter((i) => !SEVEN.includes(i)), ['energy'],
    'something other than the promoted energy-mix row appeared in 人口・経済 — #R233 demoted everything else on purpose');
  /* ⚠ THE DEMOTED ROWS MUST STILL EXIST — 「betaに降格」 is a section change, not a deletion, and a
     regression that quietly dropped them would look identical in the panel. Their owners are spread
     across js/ (data-layers builds `pop`, layer-packs and wb-layers build the World-Bank set), so the
     question is asked of the whole directory rather than of one file. */
  const all = readdirSync(new URL('js/', ROOT))
    .filter((f) => f.endsWith('.js')).map((f) => read('js/' + f)).join('\n');
  for (const id of ['pop', 'unemp', 'internet', 'wbgini', 'wbschool']) {
    assert.ok(new RegExp("'" + id + "'").test(all), `${id} is demoted, not deleted`);
  }
});

/* ── ⑥ day/night is a basic-display switch ───────────────────────────────────────────────────── */
test('R233 the day/night shading sits in the basic-display block, exactly once', () => {
  const dl = read('js/data-layers.js');
  assert.match(dl, /const nsRow=rowFor\('nightside'\);/, 'it is placed with the always-there view switches');
  assert.match(dl, /if\(nsRow\) placed\.add\(nsRow\);/,
    'and marked placed, or the safety sweep would file it under Others (beta) as well');
  const hz = /\['lyrGrpHazard',\[([^\]]*)\]\]/.exec(dl);
  assert.ok(hz && !/nightside/.test(hz[1]), 'it is no longer a hazard overlay — one row, one owner');
});

/* ── ⑧ the Atlas picture viewer ──────────────────────────────────────────────────────────────── */
test('R233 Atlas: the full-screen picture zooms, and its ✕ is a square', () => {
  const a = read('js/atlas-attach.js');
  /* every input a viewer is expected to answer */
  assert.match(a, /addEventListener\('wheel'/, 'wheel zooms');
  assert.match(a, /addEventListener\('dblclick'/, 'double-click toggles');
  assert.match(a, /pts\.size >= 2/, 'two fingers pinch');
  assert.match(a, /pointermove/, '…and one finger pans');
  /* zoom is about the POINTER — the arithmetic that keeps the pixel under the finger fixed */
  assert.match(a, /TX = dx - \(dx - TX\) \* \(s2 \/ S\)/, 'the point under the cursor stays put');
  /* a pan that ends over the backdrop must not be read as "close" */
  assert.match(a, /if \(moved\) \{ moved = false; return; \}/, 'dragging a zoomed picture cannot dismiss it');
  /* the pinch has to reach the element rather than the browser's page zoom */
  assert.match(a, /touch-action:none/, 'the image owns its own touch gestures');

  /* 「×ボタンは丸ではなく四角に。」 — the circle is gone from the ✕ rule specifically */
  const xRule = /\.atl-lightbox \.atl-lb-x\{([^}]*)\}/.exec(a);
  assert.ok(xRule, 'the close button still has a rule');
  assert.doesNotMatch(xRule[1], /border-radius:50%/, 'the ✕ is not a circle any more');
  assert.match(xRule[1], /border-radius:\d+px/, '…it is a rounded square');
});

/* ── ⑦ the two small ones ────────────────────────────────────────────────────────────────────── */
test('R233 the locate badge is ピッタリ, and the satellite globe has space around it in light mode', () => {
  const mx = read('js/map-extras.js');
  const px = /const _CENTER_PX=(\d+);/.exec(mx);
  assert.ok(px, 'the badge is still decided by a pixel distance');
  assert.ok(+px[1] <= 8, `the locate badge lights within ${px[1]} px of the fix — 「ピッタリ」 is not 44`);

  const sky = read('js/space-sky.js');
  assert.match(sky, /function _satBase\(\)/, 'the satellite basemap is a question this file can ask');
  assert.match(noJs(sky), /data-theme'\)!=='dark' && !_satBase\(\)/,
    'light mode + satellite draws the star field — the surround of a photographed Earth is space');
  /* asked of the renderer, the same way js/night-side.js asks it — not a second copy of the state */
  assert.match(sky, /getLayout\('layer-sat','visibility'\)==='visible'/, 'one predicate, shared shape');
});
