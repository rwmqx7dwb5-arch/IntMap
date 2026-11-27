/* atlas-answer-panel — the answer panel (sidebar and floating card): numbered references, source chips, the scroll's owner,
   the floating card's reachability and ink, the frosted popups, the language of the glossary card, the reasoning-effort menu. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeAtlasMapCompose } from '../js/atlas-map-compose.js';
import { makeAtlasMarkdown } from '../js/atlas-markdown.js';
import { makeAtlasAnswerSources } from '../js/atlas-answer-sources.js';
import '../js/safe-html.js';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const C = makeAtlasMapCompose({ GE: () => ({ layers: { hasSource: () => false, has: () => false }, events: { onLayer() {}, on() {} }, render: { canvas: () => ({ style: {} }), claim() {} }, camera: {} }) });
const rec = (id, n, s) => ({ id, n, color: '#0a84ff', name: s, spellings: [s], placed: true });

test('① a mention the model already numbered is ONE badge, not the numeral and a badge after it', () => {
  const out = C.linkProse('<p>国境地帯を北西の⑥ロシア領カリーニングラード州と南東の⑦ベラルーシが挟む。</p>', [rec('k', 6, 'カリーニングラード州'), rec('b', 7, 'ベラルーシ')]);
  assert.ok(!/⑥/.test(out) && !/⑦/.test(out), 'the model\'s own numeral is taken into the badge');
  assert.equal((out.match(/atl-geo-n/g) || []).length, 2, 'one badge per object');
  assert.match(out, /カリーニングラード州<span class="atl-geo-n"[^>]*>6<\/span>/);
});

test('① the numbered mention wins over an earlier plain one', () => {
  const out = C.linkProse('<p>ウィーンは古都です。地図では①ウィーンが東にあります。</p>', [rec('v', 1, 'ウィーン')]);
  assert.ok(/data-geo="v"[^>]*>ウィーン<span class="atl-geo-n"[^>]*>1<\/span>/.test(out));
  assert.ok(out.indexOf('古都') < out.indexOf('atl-geo-ref') === false || out.indexOf('ウィーン<span') > out.indexOf('古都'), 'the badge is on the later, numbered mention');
});

test('② a name that is half a phrase is widened to the phrase, so the badge never splits it', () => {
  const out = C.linkProse('<p>スヴァウキ回廊が重要です。</p>', [rec('s', 1, 'スヴァウキ')]);
  assert.match(out, /スヴァウキ回廊<span class="atl-geo-n"[^>]*>1<\/span><\/span>が重要/);
  assert.ok(!/スヴァウキ<span class="atl-geo-n"/.test(out), 'no badge inside the phrase');
});

test('③ a source chip alone in its paragraph continues the paragraph before it', () => {
  const md = makeAtlasMarkdown({ esc, L: (a) => a });
  const core = makeAtlasAnswerSources({ esc });
  const html = core.chipSources(md.renderMarkdown('長さです。\n\n([mlit.go.jp](https://www.mlit.go.jp/a))\n\n次の段落。')).html;
  assert.match(html, /<p class="atl-p">長さです。 <span class="atl-scs">/, 'the chip follows the sentence');
  assert.equal((html.match(/<p class="atl-p/g) || []).length, 2, 'the chip no longer has a paragraph of its own');
  const first = core.chipSources(md.renderMarkdown('([mlit.go.jp](https://www.mlit.go.jp/a))\n\n本文。')).html;
  assert.match(first, /^<p class="atl-p"><span class="atl-scs">/, 'a first paragraph has nothing to join');
});

test('④ the scroll has ONE owner: the reply landing asks the follow rule instead of writing scrollTop', () => {
  const mt = read('js/atlas-msg-tools.js'), con = read('js/atlas-console.js');
  assert.ok(!/CTX\.chat\(\)\.scrollTop\s*=/.test(mt), 'atlas-msg-tools writes no scroll position');
  assert.match(mt, /CTX\.follow\(\)/);
  assert.match(con, /follow:\(\)=>_followChat\(\)/, 'the kernel hands over its follow rule');
  assert.match(con, /chatEl\.addEventListener\('scroll'/, 'a scroll the follow rule did not make is the reader taking it');
});

test('⑥⑦⑧ the floating conversation is reachable, white-with-glow, and has a background switch', () => {
  const fl = read('js/atlas-float.js');
  assert.match(fl, /\.atl-chat>\.atl-b,#atlas-float #atlas-panel \.atl-chat>\.atl-msgt/, 'bubbles and their tool bars take the pointer');
  assert.ok(!/\.atl-chat>\.atl-b\{pointer-events:none;\}/.test(fl), 'no rule hands the bubbles back to the map');
  assert.match(fl, /--text-muted:#fff/, 'no grey ink');
  assert.match(fl, /#atlas-float:not\(\.bg\) #atlas-panel \*,[^']*\{text-shadow:var\(--atl-glow\);\}/, 'every glyph of the card carries the glow');
  assert.match(fl, /atl-float-bg/); assert.match(fl, /#atlas-float\.bg #atlas-panel \.atl-chat\{[^}]*text-shadow:none[^}]*backdrop-filter/, 'background on = frosted pane and no glow');
  assert.ok(!/(?<!svg)\{filter:drop-shadow|box-shadow[^;]*#atlas-float #atlas-panel \.atl-chat\{/.test(fl), 'the glow is on glyphs, not on a rectangle');
  assert.match(read('js/locales/ui.en.js'), /atlFloatBg:/); assert.match(read('js/locales/ui.jp.js'), /atlFloatBg:/);
});

test('⑤ the popups are frosted glass', () => {
  for (const [p, sel] of [['js/atlas-gloss.js', '.atl-gloss{'], ['js/atlas-answer-sources.js', '.atl-scard{']]) {
    const src = read(p), at = src.indexOf(sel), block = src.slice(at, src.indexOf('}', at));
    assert.match(block, /backdrop-filter:saturate\(170%\) blur\(22px\)/, p);
    assert.match(block, /color-mix\(in srgb,var\(--popup-bg/, p + ' uses the popup token, translucent');
  }
});

test('⑤ the glossary card follows the passage\'s language, not the setting\'s', () => {
  const g = read('js/atlas-gloss.js');
  assert.ok(!/_aiLangLine\(\)/.test(g), 'the interface-language lock is gone');
  assert.match(g, /LANGUAGE OF THE CARD: write every field in the language the reader is reading/);
  assert.ok(!/HOST\.lang \|\| 'en'/.test(g), 'the cache does not key on the setting');
});

test('⑨ the reasoning-effort choice sits in the input row, which every arrangement of the panel shows', () => {
  const e = read('js/atlas-effort.js');
  assert.match(e, /panel\.querySelector\('\.atl-inbar'\)/);
  assert.ok(!/querySelector\('\.atl-btns'\)/.test(e), 'not the header, which the tab and the card hide');
  assert.match(read('js/atlas-styles.js'), /body:not\(\.ws-mode\) #atlas-panel\.atl-tab \.atl-head\{display:none/, 'the premise: the tab hides the header');
});

test('⑤ the sidebar tab\'s panel reaches the bottom of the sidebar (its own 24px padding no longer sits under the input)', () => {
  assert.match(read('js/atlas-styles.js'), /#atlas-feed\{[^}]*margin:0 -24px -24px;/);
});
