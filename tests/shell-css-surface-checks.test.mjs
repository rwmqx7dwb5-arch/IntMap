/* ============================================================================
 *  shell-css-surface-checks — the stylesheet as the reader sees it — glass, scrim, credits, bars, bands, capture mode
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r230-checks.test.mjs
 *  tests/r231-checks.test.mjs
 *  tests/r485-checks.test.mjs
 *  tests/r508-checks.test.mjs
 *  tests/r504-checks.test.mjs
 *  tests/r170-checks.test.mjs
 *  tests/r221-checks.test.mjs
 *  tests/r253-checks.test.mjs
 *  tests/r309-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';
import { resolveValue as zResolve, tokens as zTokens } from '../scripts/z-layers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R230 · from r230-checks.test.mjs ═══════════════════════ */
/* (#R230 — the round's own account of why these checks exist heads its other half, in tests/shell-tiles-perf-checks.test.mjs) */
{
/* The declaration block of a rule whose selector list is EXACTLY `selector`.
   ⚠ Written this way because the loose version got it wrong on the first run, in the direction that
   makes a test lie: `.m-scrim` also appears as the last name in `.m-fab-stack, .m-sheet, .m-scrim{
   display:none; }` (the desktop rule) and again on its own in the reduced-motion block, so "a rule
   mentioning .m-scrim" is three different rules. `mustContain` picks the intended one. */
function cssRule(src, selector, mustContain) {
  const hits = [];
  /* ⚠ comments FIRST: a selector group is "everything since the last brace", so the long note above
     `.m-scrim` was being read as part of its selector and nothing matched. Same reason `code()`
     exists for the JS files. */
  const flat = codeOnly(src, { lang: 'css' });
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(flat))) {
    if (m[1].trim().replace(/\s+/g, ' ') !== selector) continue;
    if (mustContain && m[2].indexOf(mustContain) < 0) continue;
    hits.push(m[2]);
  }
  assert.ok(hits.length, 'CSS rule `' + selector + '`' + (mustContain ? ' containing `' + mustContain + '`' : '') + ' exists');
  return hits[0];
}

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R230 ① the mobile scrim is not painted while it is shut', () => {
  const css = read('css/intmap.css');
  const shut = cssRule(css, '.m-scrim', 'backdrop-filter');
  const shown = cssRule(css, '.m-scrim.show', 'visibility');

  /* THE DEFECT: `display:block` + a full-viewport `backdrop-filter` + `opacity:0`. An opacity-0 box
     is still painted, so the compositor blurred 100 % of the viewport on every frame of every
     gesture, for a thing no reader has ever seen. `visibility:hidden` is not painted at all. */
  assert.match(shut, /visibility\s*:\s*hidden/,
    'the shut scrim is `visibility:hidden` — `opacity:0` alone leaves a full-viewport backdrop-filter '
    + 'being composited on every frame (the #R228 shape of defect: invisible, but drawn)');
  assert.match(shown, /visibility\s*:\s*visible/,
    'and `.show` puts it back, or opening a sheet would dim nothing');

  /* it must still BE a blur when shown — this round was not allowed to remove any frosting
     (「見た目は一切落とすな」), only to stop paying for it while it is invisible */
  assert.match(shut, /backdrop-filter\s*:\s*blur/,
    'the blur itself is untouched: the fix is when it is painted, not whether it exists');
});

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R230 ② …and it stays painted for the whole fade-out', () => {
  const css = read('css/intmap.css');
  const shut = cssRule(css, '.m-scrim', 'backdrop-filter');
  const shown = cssRule(css, '.m-scrim.show', 'visibility');

  /* `visibility` is not an animatable value, so it flips at its DELAY. Shut must delay it by the
     full opacity duration (or the scrim vanishes instead of fading); shown must not delay it at all
     (or the fade-in starts on an unpainted element). Asserted as the RELATION between the two
     numbers in the same rule, not as "0.32s". */
  const opDur = shut.match(/transition\s*:[^;]*?opacity\s+([\d.]+)s/);
  const visDelay = shut.match(/transition\s*:[^;]*?visibility\s+0s[^,;]*?\s([\d.]+)s/);
  assert.ok(opDur, 'the shut rule transitions opacity over a stated duration');
  assert.ok(visDelay, 'the shut rule delays the visibility flip');
  assert.equal(visDelay[1], opDur[1],
    'the visibility delay equals the opacity duration — a shorter one un-paints the scrim mid-fade, '
    + 'which WOULD be a visible change');
  assert.match(shown, /transition\s*:[^;]*visibility\s+0s\s+\w+\s+0s/,
    '`.show` flips visibility with NO delay, so the fade-in is the fade-in it always was');

  /* reduced motion overrides transition-DURATION; the delay is a different property and needs its
     own override or an instant close leaves the blur painted for the length of the old fade.
     ⚠ found by SELECTOR, not by slicing from the first `prefers-reduced-motion` — the boot splash
     declares one of those too, several hundred lines earlier, and the slice landed in it. */
  assert.match(cssRule(css, '.m-scrim', 'transition-delay'), /transition-delay\s*:\s*0s\s*!important/,
    'the reduced-motion block zeroes the scrim delay too (it only overrides transition-duration)');
});
}

/* ═══════════════════════ #R231 · from r231-checks.test.mjs ═══════════════════════ */
/* (#R231 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
/* CRLF is what git hands these files out as on Windows (#R215): compare TEXT, never line endings */
const flat = (p) => read(p).split('\r').join('');

/* ── ⑬ nothing in this round quietly lowered the picture ────────────────────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R231 quality: the round changed no rendering setting', () => {
  /* 「見た目ゼロ変更のみ」 — the two levers named in the brief were NOT taken, and this records that
     so a later round cannot take them by accident and call it a #R231 follow-up. */
  const app = flat('js/app-body.js');
  assert.ok(!/glass-motion|render-scale/.test(codeOnly(app)), 'the two withdrawn quality-reducers stay withdrawn (#R229)');
  const css = read('css/intmap.css');
  const blurs = (css.match(/backdrop-filter:/g) || []).length;
  assert.ok(blurs > 40, 'the frosted material is untouched — a round that thins it must say so here');
});
}

/* ═══════════════════════ #R485 · from r485-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  R485 — 「DOM に在って viewport の中」は「読者に見えている」ではない
 * ----------------------------------------------------------------------------
 *  #R479 は CARTO の規約が求める帰属表示を地図の上に出した。**出したつもりだった。**
 *  本番で実測すると、右下に絶対配置したその pill は
 *
 *      desktop 1280 / 1920 : #lst-root（レイヤーパネル・x 993–1268）の下
 *      phone   390         : 下部ツールバー（btn-news / btn-info / btn-stats）の下
 *
 *  で、`elementFromPoint` は自分自身の3点すべてで**別の要素**を返した。
 *
 *  ⚠⚠⚠ **#R479 の検査は弱い問いしかしていなかった。** `display !== 'none'`・
 *  `visibility === 'visible'`・`opacity > 0.5`・「viewport の中」は**全部通る**——
 *  上に不透明な板が乗っていても。#R477（海岸線が不透明ラスタの9層下）と #R455
 *  （レイヤーの箱が入っている≠地図に在る）と同じ形が、もう一段上で再発した。
 *  ⇒ **問うべきは「その要素が最前面か」であって「その要素が可視か」ではない。**
 *
 *  ⚠⚠ **そして、移せる角は無かった。** 座標読み取り（x 409–780。地図モードでも
 *  マウスが地図上にあれば出る）・国情報パネル（x 424–718・bottom 60–174）・展開した
 *  Chronos（x 630–970）・レイヤーパネル（x≥993）を全部立てた状態で、175×26 が収まる
 *  矩形を地図カラム全面に走査して**ゼロ**だった。浮かせる限り保証はできない。
 *
 *  ⇒ **帯はオーバーレイをやめてレイアウトの1行になった。** `.map-column` が縦 flex で、
 *  地図がその上を取り、帯が下の行になる。**どのオーバーレイの包含ブロックも届かない行は、
 *  覆われようがない。**（`.map-container` は `position:relative` のままなので、既存の
 *  HUD は座標を1つも変えていない——`tests/r252` が固定する 9/9 も無傷。）
 *
 *  ⚠ 地図が `position:fixed`／`absolute` で流れを離れる2つのモード（携帯・sidebar-glass）
 *  だけは行が存在しえないので pill のまま。携帯の位置は**実測で露出を確認した**
 *  シート連動オフセットで、座標読み取りと Chronos が既に使っているものと同じ。
 * ==========================================================================*/
{
/* ── ① the credit is a SIBLING of the map, not a child of it ─────────────────────────────────── */
/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R485 ① the credit sits outside the map container, in the map column', () => {
  const html = read('index.html');
  const col = html.indexOf('<div class="map-column">');
  assert.ok(col > 0, 'the map column wrapper exists');

  const mcOpen = html.indexOf('<div class="map-container" id="map-container">');
  const credit = html.indexOf('<div id="map-credit" class="map-credit"></div>');
  assert.ok(mcOpen > col, 'the map container is inside the column');
  assert.ok(credit > mcOpen, 'the credit comes after the map container opens');

  /* the decisive property: the credit is NOT inside #map-container. Walk the tags between the
     container's opening tag and the credit and check the depth has returned to zero. */
  const between = html.slice(mcOpen + '<div class="map-container" id="map-container">'.length, credit);
  const opens = (between.match(/<div\b/g) || []).length;
  const closes = (between.match(/<\/div>/g) || []).length;
  assert.equal(closes - opens, 1,
    'the credit must be a SIBLING of #map-container — inside it, every map overlay can cover it (that was #R479)');
});

/* ── ② the column is a flex column and the map yields the strip's height ─────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R485 ② the map column is a flex column and the map gives up the row', () => {
  const css = codeOnly(read('css/intmap.css'), { lang: 'css' });
  assert.match(css, /\.map-column\{[^}]*display:flex[^}]*\}/, 'the column is a flex container');
  assert.match(css, /\.map-column\{[^}]*flex-direction:column[^}]*\}/, 'stacked vertically');
  assert.match(css, /\.map-column > \.map-container\{[^}]*flex:1 1 auto[^}]*\}/,
    'the map takes the space above the strip');
  assert.match(css, /\.map-column > \.map-container\{[^}]*height:auto[^}]*\}/,
    'height:100% would make the map overflow the column by exactly the strip height');
});

/* ── ③ the strip is a row, not an overlay ───────────────────────────────────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R485 ③ the base .map-credit rule is layout, not position', () => {
  const css = codeOnly(read('css/intmap.css'), { lang: 'css' });
  const base = /\n\s*\.map-credit\{([^}]*)\}/.exec(css);
  assert.ok(base, 'the base rule exists');
  assert.ok(!/position:absolute|position:fixed/.test(base[1]),
    'the base rule must not position the credit — a positioned credit is a credit something can cover');
  assert.match(base[1], /flex:0 0 auto/, 'it is a fixed-height row of the column');
  assert.ok(!/display:none/.test(base[1]), 'and it is not shipped hidden');

  /* ⚠ GLASS MODE STAYS A ROW. The map goes position:absolute;inset:0 there, so instead of turning
     the credit into a differently-shaped pill, the MAP stops one strip-height short — one number,
     named once, so the two can never disagree. */
  assert.match(css, /\.map-column\{[^}]*--credit-h:\d+px/, 'the strip height has a name');
  assert.match(css, /\.map-credit\{[^}]*height:var\(--credit-h\)/, 'and the strip uses it');
  assert.match(css, /body\.sidebar-glass \.map-column > \.map-container\{[^}]*bottom:var\(--credit-h\)/,
    'glass mode pulls the map up by exactly the strip height rather than re-styling the credit');
  assert.ok(!/body\.sidebar-glass \.map-credit\{/.test(css),
    'glass mode must not need its own credit styling — that would be a second shape to keep in step');

  /* ⚠ THE PHONE IS THE ONE PLACE A PILL IS RIGHT: the map is fixed over the whole viewport and the
     bottom of it belongs to the sheet and the toolbar (MEASURED: every offset below ~150px is
     covered). The offset used is the one the coord readout and Chronos already share. */
  assert.match(css, /@media\(max-width:768px\)[\s\S]*?\.map-credit\{[^}]*position:fixed[^}]*bottom:calc\(var\(--sheet-cover, var\(--peek-h\)\) \+ 12px\)/,
    'the phone keeps the MEASURED sheet-aware offset — the same var the coord readout and Chronos use');
});

/* ── ④ capture mode still does not take the attribution away ─────────────────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R485 ④ the attribution survives capture mode', () => {
  const css = codeOnly(read('css/intmap.css'), { lang: 'css' });
  assert.ok(!/body\.capture-mode[^{]*\.map-credit/.test(css),
    'a screenshot of the map is exactly the artefact the attribution has to travel with');
});

/* ── ⑤ the transient HUD did NOT move ────────────────────────────────────────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R485 ⑤ nothing else in the map column was moved to make room', () => {
  const css = codeOnly(read('css/intmap.css'), { lang: 'css' });
  /* (#R504) moved 9 → 6 on request; the POINT of the assertion is unchanged — this round's strip
     did not move it, and tests/r252 ⑥ still pins the same pair of numbers. */
  assert.match(css, /\.coord-readout\{[^}]*bottom:6px; left:6px/,
    'the coord readout keeps the coordinates tests/r252 pins — the strip made room by shortening the MAP');
  assert.match(css, /\.news-timeline\{[^}]*right:14px; bottom:54px/, 'and Chronos keeps its own');
  assert.match(css, /\.country-info\{[^}]*bottom:60px; left:24px/, 'and so does the country panel');
});
}

/* ═══════════════════════ #R508 · from r508-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  IntMap · #R508 source checks
 * ----------------------------------------------------------------------------
 *  One report: 「Terms of Service · Privacy Policy をクリックして読もうとしても、設定に邪魔されて
 *  読めない。」 The behaviour itself is measured in tests/r508.spec.js, because it is a computed
 *  z-index and no source file holds it. What CAN be held here is the pair of facts that made the
 *  defect possible, and the one that makes the fix work:
 *
 *  ① the number in js/map-ui.js and the number in css/intmap.css are the SAME number
 *     — the fix compares a panel's z-index against `.im-front`'s own level, so a build where the
 *       CSS moved and the JS did not is a build where the guard silently stops guarding;
 *  ② the guard runs BEFORE the machinery, and it is asked of the layout rather than of a list of
 *     dialog ids — a name list is the shape #R253 already refused;
 *  ③ the dialogs are still above the band, i.e. the fix did not "solve" this by demoting them.
 *
 *  ⚠ Assertions that match on TEXT read the source with COMMENTS STRIPPED — this round's own note
 *  in js/map-ui.js quotes `.im-front`, `2650` and `#legal-modal` while explaining the defect.
 * ==========================================================================*/
{

/* ── ① ONE NUMBER, TWO FILES ─────────────────────────────────────────────────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
/* (ui-layer-owner) THERE IS ONE COPY NOW. js/map-ui.js kept `_FRONT_Z=2650` beside the stylesheet's
   own, and this check existed to catch the two drifting. The guard moved to js/ui-stack.js, which
   READS the level (`level('front')` → the --z-front custom property), and the stylesheet applies that
   same token — so what is asserted is that there is nothing left to drift. */
test('#R508 ① the front-band level the guard compares with is the level css/intmap.css applies', () => {
  const css = read('css/intmap.css');
  const fromCssM = /\.im-front\{\s*z-index:([^;!}]+?)\s*!important/.exec(css);
  assert.ok(fromCssM, '.im-front no longer sets a z-index — the guard has nothing to compare against');
  assert.equal(fromCssM[1].trim(), 'var(--z-front)', '.im-front applies a number of its own instead of the --z-front layer the guard reads');
  assert.ok(Number.isInteger(zTokens(css)['--z-front']), '--z-front is not declared in :root');

  const ui = code(read('js/ui-stack.js'));
  assert.match(ui, /const F = level\('front'\);/, 'the guard no longer READS the front level from the stylesheet');
  assert.doesNotMatch(ui, /_FRONT_Z|2650/, 'a copy of the front level is back in js/');
  assert.doesNotMatch(code(read('js/map-ui.js')), /_FRONT_Z/, 'js/map-ui.js keeps its own copy again');
});

/* ── ② THE GUARD IS ASKED OF THE LAYOUT, AND IT RUNS FIRST ───────────────────────────────────── */
/* spelling kept: browser script (js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R508 ② a layer above the band is exempted, by measurement rather than by name', () => {
  /* (ui-layer-owner) the guard lives in js/ui-stack.js now; its behaviour is also EVALUATED there
     (tests/ui-layer-owner-checks.test.mjs ①: a 9999 dialog is neither marked on wheel nor on pointerdown) */
  const ui = code(read('js/ui-stack.js'));

  const guard = /function aboveBand\(el\) \{([\s\S]*?)\n  \}/.exec(ui);
  assert.ok(guard, 'the aboveBand walk is gone');
  assert.match(guard[1], /cs\(n\)[^\n]*\.zIndex/,
    'the guard no longer READS the resolved z-index — a hand-written list of dialog ids is the shape #R253 refused');
  assert.match(guard[1], /> F\)/,
    'the comparison is not strictly above the band: a panel already wearing .im-front computes to exactly that level and must stay demotable');
  assert.match(guard[1], /contains\('im-front'\)/,
    'the walk no longer skips the mark it set itself — a raised panel would exempt itself for ever');

  /* it has to be the FIRST thing act() does: below the demote branch it would still clear the mark */
  const act = /function act\(t, mayDemote\) \{([\s\S]*?)front\(p\);\n  \}/.exec(ui);
  assert.ok(act, 'act() no longer has the shape this check was written against');
  const iGuard = act[1].indexOf('aboveBand(t)');
  const iPanel = act[1].indexOf('panelOf(t)');
  assert.ok(iGuard >= 0, 'act() no longer consults _aboveBand — the machinery is back to marking dialogs');
  assert.ok(iGuard < iPanel, 'the guard runs after the panel is chosen; it has to run before anything else in act()');
  assert.match(act[1].slice(iGuard, iGuard + 60), /return/,
    'the guard does not RETURN — a dialog would still fall through to the demote branch');
});

/* ── ③ THE DIALOGS ARE STILL ABOVE THE BAND ──────────────────────────────────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('#R508 ③ the fix did not lower the dialogs into the band to get out of the way', () => {
  const css = read('css/intmap.css');
  const bandM = /\.im-front\{\s*z-index:([^;!}]+?)\s*!important/.exec(css);
  const band = bandM ? zResolve(bandM[1], zTokens(css)) : NaN;
  const overlayM = /\.modal-overlay\{[^}]*?z-index:([^;}]+)/.exec(css);
  assert.ok(overlayM, '.modal-overlay no longer carries a z-index');
  const overlay = [overlayM[0], zResolve(overlayM[1], zTokens(css))];
  assert.ok(+overlay[1] > band,
    `.modal-overlay is at ${overlay[1]}, at or below the front band (${band}) — a dialog must outrank every panel, and the exemption in js/ui-stack.js is written for that`);
});
}

/* ═══════════════════════ #R504 · from r504-checks.test.mjs ═══════════════════════ */
/* (#R504 — the round's own account of why these checks exist heads its other half, in tests/shell-data-layers-checks.test.mjs) */
{
const rd = read;

/* ── ⑩⑪⑫ 余白 ─────────────────────────────────────────────────────────────────────────────── */
const cssRule = (css, sel) => {
  const m = new RegExp('\\n\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([\\s\\S]*?)\\}').exec(css);
  assert.ok(m, 'css/intmap.css declares ' + sel);
  return m[1];
};
const px = (decl, prop) => {
  const m = new RegExp('(?:^|[;{ ])' + prop + ':(-?[\\d.]+)px').exec(decl);
  assert.ok(m, prop + ' is a plain px value in: ' + decl.slice(0, 90));
  return Number(m[1]);
};

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R504 ⑩ the top bars got shorter without the type getting smaller', () => {
  const css = rd('css/intmap.css');

  /* the pills: 12 px type, less padding around it */
  const btn = cssRule(css, '.view-btn');
  assert.match(btn, /font-size:12px/, 'the label is still 12 px — this was a padding change, not a type change');
  assert.ok(px(btn, 'padding') < 7,
    'the pill row keeps its old vertical padding; 「縦幅を詰めて」 asked for less');

  /* the search bar: 14 px field, less padding, and a radius that is still half the height */
  const bar = cssRule(css, '.map-search');
  const input = cssRule(css, '.map-search input');
  const go = cssRule(css, '.map-search>button');
  assert.match(input, /font-size:14px/, 'the field is still 14 px');
  const shellPad = px(bar, 'padding');
  const fieldPad = px(input, 'padding');
  assert.ok(fieldPad < 8 && shellPad < 4, 'the search bar keeps its old vertical padding');
  assert.ok(px(go, 'padding') === fieldPad,
    'the Search button and the field must breathe the same, or the bar grows to the taller of them');

  /* ⚠ THE RADIUS IS HALF THE HEIGHT, AND THAT IS WHAT MAKES IT A PILL. Derived from the shipped
     numbers rather than written down, so shortening the bar again cannot quietly square it off.
     The field's line box is the tallest thing inside; 14 px type measures ~17 px. */
  const height = 17 + fieldPad * 2 + shellPad * 2 + 2 /* 1 px border, both sides */;
  const radius = px(bar, 'border-radius');
  assert.ok(Math.abs(radius - height / 2) <= 2.5,
    'the pill radius (' + radius + ') no longer tracks half the bar height (~' + (height / 2).toFixed(1) + ')');
});

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R504 ⑪ the two bottom corners share one inset', () => {
  const css = rd('css/intmap.css');
  const readout = cssRule(css, '.coord-readout');
  /* the frosted rule is the one that positions Chronos in the shipping app; the base rule above it
     is overridden by it, which is why this reads the LAST .news-timeline{...} in the file. */
  const all = [...css.matchAll(/\n\s*\.news-timeline\{([\s\S]*?)\}/g)]
    .map((m) => m[1])
    /* ⚠ ONLY THE RULES THAT REALLY PLACE IT ON A DESKTOP. The phone's rule sets the same two
       properties with !important and a calc() that tracks the bottom sheet, which is a different
       question with a different answer; picking it up here would compare a corner inset against a
       sheet offset. */
    .filter((b) => /(?:^|[;{ ])right:\d+(?:\.\d+)?px/.test(b)
                && /(?:^|[;{ ])bottom:\d+(?:\.\d+)?px/.test(b)
                && !/!important/.test(b));
  assert.ok(all.length >= 2, 'the frosted rule that actually positions Chronos is still there');
  const chronos = all[all.length - 1];

  const left = px(readout, 'left'), bottomL = px(readout, 'bottom');
  const right = px(chronos, 'right'), bottomR = px(chronos, 'bottom');

  assert.equal(left, bottomL, 'the readout sits the same distance from the two edges it touches');
  assert.equal(right, bottomR, '…and so does Chronos');
  /* ⚠ THIS IS THE ASSERTION THE REQUEST ACTUALLY MADE. 「隙間だけ同じように詰める」 is a statement
     about the PAIR, so what is pinned is that the two numbers are the same — not what they are.
     Moving one corner and forgetting the other is exactly the failure this catches (#R500). */
  assert.equal(left, right, 'the two bottom corners must share one inset — found ' + left + ' and ' + right);
  assert.ok(left < 9, 'and it must actually be tighter than the 9 px it was');
});
}

/* ═══════════════════════ #R170 · from r170-checks.test.mjs ═══════════════════════ */
/* (#R170 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{
/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language (see js/lang-registry.js). Asking this
   reader for js/i18n.js therefore hands back the whole table, which is what these assertions mean. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const R = (f) => (String(f).endsWith('js/i18n.js')
  ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
  : readFileSync(new URL('../' + f, import.meta.url), 'utf8'));

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('#R170 the place-search pill sits at the top of the map', () => {
  const css = R('css/intmap.css');
  assert.match(css, /\.map-search\{ position:absolute; top:10px;/, 'the search pill must sit level with .map-controls-top (both 10px)');
});
}

/* ═══════════════════════ #R221 · from r221-checks.test.mjs ═══════════════════════ */
/* (#R221 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n')
  : readFileSync(join(ROOT, p), 'utf8'));

/* ── ⑥ THE FROSTED GLASS SUPPRESSION IS GONE, AND MUST NOT COME BACK (#R229) ──────────────────────
   This test used to assert that js/glass-motion.js existed, was mobile-only and released on moveend.
   The module took the frosting off every panel while the camera moved. #R221 built it, #R225 widened
   its gate, and #R228 reported it as healthy — and NONE of those rounds asked whether it was wanted:

       「いやガラス抑止なんて余計なものつけてんじゃねーよ」
       「それって品質に影響しますか？」→ yes, it does. Frames during a gesture are frames.
       「外せ　良いわけないだろうが　なぜ確認しなかった　再発防止しろ」

   So the check is inverted. It is not «performance work needs a test», it is that this particular
   thing was never agreed to and is not to be reintroduced quietly. */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('#R221 ⑥ the gesture-time glass suppression is gone (#R229) and stays gone', () => {
  /* (tests-by-topic) FOLDED HERE: 'R225 ① the gesture-time glass suppression is gone (#R229)' asserted the
     same two facts (no `body.im-moving .im-glass{` rule, no js/glass-motion.js) — a subset of this test.
     Its account, kept: #R225 measured nineteen backdrop-filter elements covering 383 % of a 375 × 812
     viewport, all dropping out during a move — but only when the gate said «phone», and the gate was
     `max-width: 768px`, FALSE on a phone held sideways. ⚠ (#R229) that round widened a mechanism that
     should not have existed: the thing being gated was #R221 taking the frosting off every panel during
     a gesture, which was never agreed to, and fixing the gate made the unwanted behaviour MORE reliable. */
  assert.ok(!existsSync(join(ROOT, 'js/glass-motion.js')), 'js/glass-motion.js must not exist');
  const css = read('css/intmap.css');
  assert.ok(!/body\.im-moving\s+\.im-glass\s*\{/.test(css),
    'no rule may strip backdrop-filter while the camera moves');
  /* ⚠ the SYNTAX, not the mention — the comments left behind name what they removed, on purpose */
  assert.doesNotMatch(read('js/label-occlusion.js'), /IntMapModules\.glassMotion\s*\(/, 'nothing mounts it');
  assert.doesNotMatch(read('src/main.js'), /import\s+['"][^'"]*glass-motion\.js['"]/, 'nothing imports it');
});
}

/* ═══════════════════════ #R253 · from r253-checks.test.mjs ═══════════════════════ */
/* (#R253 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{

/* ── ④ THE OPEN SIDEBAR IS IN FRONT ─────────────────────────────────────────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('#R253 ④ an open sidebar out-ranks the floating panels, and the pointer moves that rank', () => {
  const css = code(read('css/intmap.css'), { lang: 'css' });
  const m = /body:not\(\.im-float-front\)\s*\.sidebar,\s*body:not\(\.im-float-front\)\s*#layer-sidebar-r\{\s*z-index:([^;}]+)/.exec(css);
  assert.ok(m, 'the front-most band for the two sidebars is gone');
  const z = zResolve(m[1], zTokens(read('css/intmap.css')));   /* (map-a11y-structure) a named layer, resolved */
  /* it must clear the whole map-surface band and stay under the modal layer */
  assert.ok(z > 2500, `the sidebar band is ${z}; the context menu is 2500 and the country card 2200, so it still paints through`);
  assert.ok(z < 9999, `the sidebar band is ${z}; the modal overlay is 9999 and must never go behind a sidebar`);
  assert.match(css, /@media\(min-width:769px\)\{[^}]*body:not\(\.im-float-front\)/s,
    'the band is not scoped to desktop — on a phone the bottom sheet (1700) has to stay above the panel');

  /* (ui-layer-owner) the machinery is js/ui-stack.js's now (window.IntMapStack) */
  const ui = code(read('js/ui-stack.js'));
  /* ⚠ (#R255) the pointerdown handler delegates to `act()`, which `wheel` and `focusin` also call
     — scrolling or typing inside a panel is 「なんらかの操作」 too and used to raise nothing. The
     property #R253 asserted is unchanged: a pointer gesture is what sets and clears the class. */
  assert.match(ui, /addEventListener\('pointerdown', \(e\) => \{[^\n]*act\(e\.target, true\)/,
    'nothing toggles im-float-front on a pointer, so the class can never change');
  assert.match(ui, /im-float-front/, 'the demotion class is gone entirely');
  /* ⚠ (#R255) …and the exclusion is a NAMED LIST now, because the canvas was not the only trap:
     #map / #map-container / .operation-room are position:relative, so anything inside the map shell
     that is not itself positioned resolved to the SHELL — marking that .im-front lifts the whole map
     (and the sidebars inside .operation-room) into one 2650 box. */
  assert.match(ui, /const NOT_PANEL = /, 'the map shell exclusion list is gone');
  assert.match(ui, /maplibregl-canvas-container/,
    'the map canvas is not excluded — clicking the map would raise the map itself over the sidebar');
  assert.match(ui, /,\s*true\s*\)/, 'the listener is not in the capture phase — a handler that stops propagation would hide the gesture');
});
}

/* ═══════════════════════ #R309 · from r309-checks.test.mjs ═══════════════════════ */
/* (#R309 — the round's own account of why these checks exist heads its other half, in tests/shell-map-labels-checks.test.mjs) */
{
/* ⚠ A CSS RULE IS NOT A LINE. #R306 lost a round to a check that measured a byte window; this one
   would have lost it to a check that assumed the author kept a selector and its declarations on one
   line. Split the stylesheet into real rules and ask each rule about itself. */
function cssRules(src, fromJs) {
  const flat = codeOnly(src, { lang: 'css' });
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(flat))) {
    let sel = m[1].replace(/\s+/g, ' ').trim();
    /* a stylesheet injected from JS arrives as `…' +'<selector>{…}'` — everything up to the last
       quote is the concatenation, not the selector */
    if (fromJs) { const q = sel.lastIndexOf("'"); if (q >= 0) sel = sel.slice(q + 1).trim(); }
    out.push({ sel, body: m[2].replace(/\s+/g, ' ').trim() });
  }
  return out;
}

/* ══ ①④⑤ フロストガラス — 三つとも「二度塗り」と「詳細度」の問題である ═══════════════════════════ */
const RULES = cssRules(read('css/intmap.css'));
/* the frosted modes, as the stylesheet spells them */
const FROSTED = /body\.sidebar-translucent|body\.sidebar-glass2/;
const frostedFor = (needle) => RULES.filter((r) => FROSTED.test(r.sel) && r.sel.includes(needle));

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('r309 ① the Countries sort bar paints nothing extra on the glass', () => {
  const rs = frostedFor('#countries-feed .stats-toolbar');
  assert.ok(rs.length, 'there is a frosted-only rule for the sort bar');
  assert.ok(rs.some((r) => /background:\s*transparent/.test(r.body)), 'it removes the fill rather than re-tinting it');
  /* ⚠ #R40 recorded that a SECOND backdrop-filter over an already-frosted panel is what draws the
     「四角い枠」 — the very thing this report is about. The rule must not add one. */
  assert.ok(rs.some((r) => /backdrop-filter:\s*none/.test(r.body)), 'and it does not re-blur what the sidebar already blurred');
  /* the solid-mode declaration is untouched: it still falls back through --panel-bg */
  const solid = RULES.find((r) => r.sel === '#countries-feed .stats-toolbar');
  assert.ok(solid && /var\(--panel-bg/.test(solid.body), 'the opaque mode still uses the panel tone');
});

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('r309 ① the same double-paint is gone from its siblings too', () => {
  /* 「3か所すべて直す」 — the reader asked for the sibling bars as well, so this asks for the whole
     CLASS rather than for three selectors.
     ⚠ THE CLASS IS NOT "everything that paints --glass-fill". `.measure-dropdown`, `.layer-dropdown`
     and the big frosted-surface list float over the MAP, where that fill is the element's own
     material and is exactly right. The defect is a strip that paints it while sitting INSIDE a
     surface that has already painted it — i.e. a bar in one of the sidebar's feed containers. Two
     shapes qualify: a `position:sticky` strip, and a rule whose selector names a feed. */
  /* ⚠ AND NOT ONLY css/intmap.css. Two of the strips in this class are injected from JS — the
     compare headers in js/stats-compare.js and js/companies-ui.js — and they were the only LIVE
     ones left (measured: both came out `rgba(255,255,255,0.34)`, the sidebar's own fill). A check
     that reads one stylesheet would have called the class clean while the visible case remained. */
  const ALL = RULES.concat(...['js/stats-compare.js', 'js/companies-ui.js'].map((f) => cssRules(read(f), true)));
  const feeds = [...read('index.html').matchAll(/class="content-area"\s+id="([a-z-]+)"/g)].map((m) => '#' + m[1]);
  assert.ok(feeds.length >= 4, 'the sidebar feed containers are identifiable (' + feeds.join(' ') + ')');
  const paintsPanelFill = (b) => /background:\s*var\(--glass-fill\)/.test(b) || /background:\s*var\(--panel-bg,\s*var\(--glass-fill\)\)/.test(b);
  const inside = ALL.filter((r) => !FROSTED.test(r.sel) && paintsPanelFill(r.body)
    && (/position:\s*sticky/.test(r.body) || feeds.some((f) => r.sel.includes(f))));
  assert.ok(inside.length >= 5, 'every strip in the class is found (' + inside.length + ')');
  for (const r of inside) {
    const cover = ALL.filter((c) => FROSTED.test(c.sel) && c.sel.includes(r.sel));
    assert.ok(cover.length, r.sel + ' has a frosted-only rule so it does not repaint the panel fill');
    assert.ok(cover.some((c) => /background:\s*transparent/.test(c.body)), r.sel + ' drops the fill in the frosted modes');
    /* ⚠ and does NOT answer it with a second backdrop-filter — that is the 「四角い枠」 of #R40 */
    assert.ok(cover.every((c) => !/backdrop-filter:\s*(saturate|blur)/.test(c.body)), r.sel + ' does not re-blur an already-frosted surface');
  }
});

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('r309 ④ the search fields are glass in the frosted modes', () => {
  const rs = frostedFor('.search-bar');
  assert.ok(rs.length, 'the three search bars have a frosted-only material');
  assert.ok(rs.some((r) => /backdrop-filter/.test(r.body)), '…which is a material, not just a colour');
  /* ⚠ NOT the panel's own fill: layering --glass-fill inside an element that already has it is
     defect ① one file along. The recipe is #R39's neutral translucent fill. */
  for (const r of rs) assert.ok(!/var\(--glass-fill\)/.test(r.body), 'it does not repaint the sidebar\'s own fill');
  /* the focus ring has to survive being restated */
  assert.ok(rs.some((r) => /:focus-within/.test(r.sel) && /--primary-color/.test(r.body)), 'a focused field still shows where the caret went');
  /* and Atlas's prompt box — the other half of the same report. Its BASE rule is injected from
     js/atlas-console.js; the frosted override sits here, beside the #R39 recipe it copies. */
  const atl = RULES.filter((r) => FROSTED.test(r.sel) && /\.atl-in\b/.test(r.sel));
  assert.ok(atl.length, 'the Atlas input has a frosted-only material too');
  assert.ok(atl.some((r) => /backdrop-filter/.test(r.body)), 'built from the same recipe as the search bars');
  for (const r of atl) assert.ok(!/var\(--glass-fill\)/.test(r.body), 'and it does not repaint the panel fill either');
});

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('r309 ⑤ the place-search pill keeps its width when both sidebars are open', () => {
  const centring = RULES.filter((r) => /\.map-search/.test(r.sel) && /:has\(\.sidebar:not\(\.collapsed\)\)/.test(r.sel));
  assert.ok(centring.length, 'the frosted centring rule is still there');
  /* ⚠ THE DEFECT: that selector is (0,4,1) and `body.ms-narrow .map-search` is (0,2,1), so it won
     `left` while the JS-computed `right` survived — and --ms-left / --ms-right only mean anything as
     a PAIR. Measured at 1440x900 with both sidebars open: left 920px, right 619px, width 18px. */
  for (const r of centring) assert.ok(/:not\(\.ms-narrow\)/.test(r.sel), 'it stands down when the JS watcher owns the geometry');
  /* …and when it does apply, it has to know about the RIGHT sidebar too */
  const withRight = centring.filter((r) => /lsr-open/.test(r.sel));
  assert.ok(withRight.length, 'the centring accounts for the right sidebar');
  assert.ok(withRight.every((r) => /--lsr-w/.test(r.body)), 'by subtracting its width from the centre AND from the cap');
});
}
