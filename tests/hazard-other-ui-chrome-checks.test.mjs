/* ============================================================================
 *  THE APP CHROME — panels, sidebars, search, bookmark, widgets and the phone
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. Stylesheet rules and page-closure markup; the specs
 *    measure them on screen.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r191-checks.test.mjs (tests #3, #4 of 11) ═══
    R191 — source-level checks for the round's eight reports.
    Node's own test runner; no browser. The things that need a real renderer or
    live pixels are in tests/r191.spec.js. */
{

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readLF(join(ROOT, f))).join('\n')
  : readLF(join(ROOT, p)));

/* ── 3 · no magnifier emoji in the desktop strings ───────────────────────────────────────────── */
test('R191 UI: the desktop chrome carries no magnifier emoji', () => {
  for (const f of ['js/i18n.js', 'js/data-layers.js', 'js/map-extras.js']) {
    assert.ok(!read(f).includes('\u{1F50D}'), `${f} has no \u{1F50D}`);
  }
  /* ⚠ (#R231) …AND THE PHONE NO LONGER KEEPS ONE EITHER. This block used to REQUIRE the magnifier
     inside the mobile media query. 「地名検索ボタンの絵文字は、絵文字ではなく独自のシンプルなアイコンに置換して」
     reverses that, so the requirement is INVERTED rather than deleted — a check that merely
     disappears is a hole, and the app must not grow the glyph back on either breakpoint. What
     replaces it (the drawn <svg>, the word/mark swap, the two display rules) is asserted in
     tests/r231-checks.test.mjs ②. */
  const css = read('css/intmap.css');
  /* ⚠ COMMENTS STRIPPED FIRST. The notes that record the removal quote the glyph, and a negative
     check that reads prose fails on a correct tree — #R208's and #R229's recurring defect. */
  const cssCode = codeOnly(css, { lang: 'css' });
  assert.ok(!cssCode.includes('\u{1F50D}'), 'no magnifier in any rule, the mobile block included');
});

/* ── 4 · the layer sidebar follows the appearance setting ────────────────────────────────────── */
test('R191 UI: the layer sidebar is solid in Solid mode and frosted in the frosted modes', () => {
  const src = read('js/map-ui.js');
  assert.match(src, /body:not\(\.sidebar-translucent\):not\(\.sidebar-glass2\) #layer-sidebar-r\{background:var\(--panel-bg,var\(--card-bg\)\);backdrop-filter:none;-webkit-backdrop-filter:none;\}/,
    'Solid paints the opaque panel tone and drops the blur');
  /* the frosted material is still there for the other two modes */
  assert.match(src, /#layer-sidebar-r\{position:absolute;[^}]*background:var\(--sidebar-bg\);backdrop-filter:blur\(25px\)/,
    'the frosted base rule is untouched');
});
}

/* ═══ from tests/r202-checks.test.mjs (tests #11 of 17) ═══
    R202 — the sky is computed, the source is integrated, and the far plane reaches the horizon
    Twelve instructions, and the ones with physics or arithmetic behind them are checked by RUNNING
    that arithmetic rather than by asserting on the text that contains it:

      ① js/sky-model.js is pure — no DOM, no renderer — so the scattering integral runs here.
      ② src/tsunami-worker.js loads into a Node vm (the harness tests/r197-checks.test.mjs built), so
         the cell-averaged source is compared against the centre sample it replaces.

    The rest are seam checks of the kind this suite has used since #R162: a capability that is
    declared must be implemented, a contract method that is called must exist, and a value that two
    files have to agree on is derived from one of them rather than written down twice. */
{
const rd = read;

test('R202 ③d the selected mobile segment is white on black, in both themes', () => {
  const css = rd('css/intmap.css');
  const light = css.match(/\.m-seg-btn\.active\{([^}]*)\}/);
  const dark = css.match(/\[data-theme="dark"\] \.m-seg-btn\.active\{([^}]*)\}/);
  assert.ok(light && dark, 'both rules exist');
  for (const [name, m] of [['light', light], ['dark', dark]]) {
    assert.match(m[1], /background:#fff/, `${name}: white background`);
    assert.match(m[1], /color:#000/, `${name}: black text`);
  }
});
}

/* ═══ from tests/r232-checks.test.mjs (tests #13, #14, #15, #16, #17 of 18) ═══
   R232 source-level regression checks (deterministic, no browser).
   Guards this round's batch:
     ①  a language is ONE FILE — the locale directory is the list, and the generated list follows it
     ②  …and the locales are LAZY: only English is eager, the reader's own is awaited on the boot barrier
     ③  the day/night SHADING replaced the flat night layer, and one owner writes the boolean
     ④  the seismic simulator: past-earthquake presets, rupture directivity, named wavefronts,
         observation points that are major cities which actually shake
     ⑤  Atlas: the place name is printed once, headings do not double-count their spacing, and a
         source card must be about the topic
     ⑥  the phone's layer sheet is the desktop's tile grid, not a second implementation
     ⑦  「戻る」 returns to the tab you came from, the readout stays out of screenshots, and the
         locate button is outlined until it is following you */
{
const ROOT = new URL('../', import.meta.url);
/* ⚠ (#R283) THE CONTENT OF A FILE, NOT THE BYTES THIS CHECKOUT PRODUCED — scripts/eol.mjs. ① also
   runs the generator's own staleness gate, which compared js/locales/_langs.js byte for byte with
   what it renders and therefore called the committed copy stale on every CRLF working copy. */
const noHtml = (s) => codeOnly(String(s), { lang: 'html' });
const noCss = (s) => codeOnly(String(s), { lang: 'css' });

/* ── ⑥ the phone's layer sheet ───────────────────────────────────────────────────────────────── */
test('R232 mobile: the layer sheet is the SAME tile grid the desktop browses with', () => {
  const ui = read('js/map-ui.js');
  assert.match(ui, /function mountInto\(container\)/, 'the grid can be mounted anywhere');
  assert.match(ui, /const _hosts=\[\]/, '…and every mounted grid stays in sync');
  assert.match(read('js/mobile-ui.js'), /IntMapLayerSidebar\.mountInto\(moMountLayers\)/, 'the sheet mounts it');
  assert.match(read('js/mobile-ui.js'), /classList\.add\('m-lyr-tiles'\)/, 'the classic rows become the data source');
  const css = noCss(read('css/intmap.css'));
  assert.match(css, /body\.m-lyr-tiles \.m-sheet #layer-dropdown \.lyr-row/, 'the rows are hidden, not removed');
  /* (#R233) 「モバイル版のレイヤー選択欄は、横に3つタイルを置く形式に。」 — #R232 pinned TWO here and
     argued three would put the caption below readable width. Three is what was asked for, so the pin
     follows the instruction; the gap tightens with it (9px → 7px) to buy the tiles back some width. */
  assert.match(css, /\.m-sheet \.lsr-mount \.lst-grid\{ display:grid; grid-template-columns:repeat\(3,minmax\(0,1fr\)\); /,
    'three columns on a phone, per #R233');
});

/* ── ⑦ the three small ones ──────────────────────────────────────────────────────────────────── */
test('R232 「戻る」 returns to the tab the reader came from', () => {
  const pi = read('js/page-i18n.js');
  assert.match(pi, /window\.opener && !window\.opener\.closed/, 'rung ①: the map is in the opener');
  assert.match(pi, /window\.close\(\)/, '…so this tab closes');
  assert.match(pi, /history\.back\(\)/, 'rung ②: a same-tab navigation still goes back');
  /* and index.html must hand the opener over, or rung ① can never fire */
  const idx = noHtml(read('index.html'));
  for (const id of ['link-sources', 'link-science', 'sources-page-link']) {
    assert.match(idx, new RegExp(`<a id="${id}"[^>]*rel="opener"`), `${id} hands over the opener`);
  }
});

test('R232 the coordinate readout stays out of screenshots', () => {
  assert.match(noCss(read('css/intmap.css')), /body\.capture-mode \.coord-readout\{ visibility:hidden !important; \}/);
});

test('R232 the locate button is outlined until the map is ON the fix', () => {
  const css = noCss(read('css/intmap.css'));
  assert.match(css, /\.m-fab-locate svg polygon\{ fill:none;/, 'not following → outline');
  assert.match(css, /\.m-fab-locate\.on svg polygon\{ fill:currentColor; \}/, 'following → solid');
  assert.match(noHtml(read('index.html')), /<polygon points="20\.6,3\.4 3\.4,10\.2 11\.1,12\.9 13\.8,20\.6" fill="none"/,
    'the markup no longer hard-codes the fill');
  assert.match(read('js/map-extras.js'), /E0\.events\.on\('moveend',_syncFab\)/,
    'the badge updates when the CAMERA moves, not only when the fix does');
});

test('R232 Companies and Countries do not drift sideways', () => {
  assert.match(noCss(read('css/intmap.css')),
    /#countries-feed, #info-dashboard\{ overflow-x:hidden; overscroll-behavior-x:contain; \}/);
});
}

/* ═══ from tests/r235-checks.test.mjs (tests #8 of 9) ═══
    R235 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).
    Where the claim is arithmetic it is COMPUTED here rather than pinned to a
    number this round happened to produce (#R203/#R229).

   (layer-manifest) the lists are views of js/layer-manifest.js */
{
/* ⚠ comments quote the instructions, and the instructions quote the strings the checks look for
   (#R208/#R215/#R231/#R232/#R234 — SEVEN rounds of a check hitting its own explanation). Strip the
   comments and match the SYNTAX. */

/* ── 8 · the phone's layer sheet is the desktop's ───────────────────────────────────────────── */
test('R235 mobile: the layer sheet is the desktop panel, without the compare/imagery furniture', () => {
  const m = code(read('js/mobile-ui.js'));
  assert.doesNotMatch(m, /if\(isM\)\{ moveTo\(layerDropdown,moMountLayers\); moveTo\(satController,moMountSat\);/,
    'the imagery-provider panel is no longer moved into the sheet');
  assert.match(m, /if\(isM\)\{ moveTo\(layerDropdown,moMountLayers\);/, 'the dropdown still is — it is the data source');
  assert.match(m, /restoreHome\(satController\)/, 'and widening still restores it, for a session that was narrow before');
  const css = read('css/intmap.css');
  for (const sel of ['#cmp-mount', '#mo-mount-sat']) {
    assert.ok(css.includes('body.m-lyr-tiles .m-sheet ' + sel), sel + ' is hidden in the phone sheet');
  }
  /* ⚠⚠ `#layer-tools` must be hidden by a selector that OUT-SPECIFIES the existing
     `#mo-mount-layers .layer-dropdown > #layer-tools{display:flex !important}` (2,1,0). A rule of
     the `body.m-lyr-tiles .m-sheet #layer-tools` shape is (1,2,1) and loses — measured: the strip
     stayed `display:flex` with the hide rule matching it. Assert the winning shape, not the intent. */
  assert.ok(css.includes('body.m-lyr-tiles #mo-mount-layers .layer-dropdown > #layer-tools{ display:none !important; }'),
    'the tools strip is hidden by a rule with at least as many ids as the one that shows it');
  /* and the losing shape must NOT be what is relied on */
  assert.ok(!/body\.m-lyr-tiles \.m-sheet #layer-tools\b/.test(css),
    'the under-specific selector is gone, so nobody re-learns this the hard way');
  const idCount = (s) => (s.match(/#/g) || []).length;
  assert.ok(idCount('body.m-lyr-tiles #mo-mount-layers .layer-dropdown > #layer-tools')
    >= idCount('#mo-mount-layers .layer-dropdown > #layer-tools'), 'specificity is not lower than the rule it overrides');
});
}

/* ═══ from tests/r243-checks.test.mjs (tests #14 of 17) ═══
    IntMap · #R243 — source-level contracts for this round
    Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
    which is the only thing that makes a green suite mean anything (#R228).
    Comments are stripped before matching wherever a test looks for a fragment that this file's own
    prose could contain ([[intmap-recurring-lessons]] E, nine rounds running). */
{

/* ── ⑧ the UV widget's sub-line is three answers, not one run-on ───────────────────────────────── */
test('R243 ⑧ the UV card states the peak, the time and the qualifiers on their own lines', () => {
  /* ⚠ (#R292) SAME REQUIREMENT, STRUCTURAL INSTEAD OF STRING-BUILT. The complaint was that the UV
     card ran its three answers together into one interpunct-separated line. The card no longer
     assembles a line at all: the peak is the value, the two readings are rows of a `<dl>` fact grid,
     and the qualifier is its own element — so they cannot be concatenated back together, and the
     bracket-per-script problem the old code hand-coded does not arise because no bracket is typed. */
  const c = code(read('js/widget-defs-data.js'));
  const uv = c.slice(c.indexOf("id: 'env.uv'"), c.indexOf("function peakUV("));
  assert.ok(uv.length > 500, 'the UV definition was found');
  assert.ok(/R\.facts\(\[/.test(uv), 'the readings are separate rows, not one run-on line');
  assert.ok(/R\.where\(/.test(uv), 'and the qualifier is its own line');
  /* ⚠ THREE ELEMENTS, NOT THREE SUBSTRINGS. The old defect was a single `wgt-s` line carrying the
     peak, the time and the qualifiers joined by interpuncts; what makes that impossible now is that
     the value, the readings and the qualifier are three separate NODES. (An interpunct still joins
     the place to «clear sky» INSIDE the qualifier line — two facts on one line was never the
     complaint; three answers crushed into one was.) */
  assert.ok(/R\.value\(\{[\s\S]{0,220}unit: 'UV'/.test(uv), 'the peak is the card value');
  assert.ok((uv.match(/R\.facts\(\[/g) || []).length >= 1 && /k: L\('Now'/.test(uv),
    'the current and peak readings are labelled rows');
});
}

/* ═══ from tests/r244-checks.test.mjs (tests #6, #7, #11 of 15) ═══
    #R244 — source-level checks
    Every one of these was written against the UNFIXED source first and observed to FAIL (#R228's
    standing rule). Each names the defect it pins rather than the code that fixes it. */
{
/* comments stripped, so a note that QUOTES a pattern cannot satisfy or trip a check
   ([[intmap-recurring-lessons]] E — this has cost eight rounds) */
const code = (p) => codeOnly(read(p));

/* ══ ⑥ THE ADDRESS THE READER OPENED IS READ BEFORE ANYTHING CAN OVERWRITE IT ═════════════════════
   「再読み込み時に情報が保持されなくなっている。」 `save()` is armed on `moveend` with a 400 ms timer
   and `restore()` waits for the renderer's `load`, so the default camera was written over the hash
   before the restorer parsed it (measured: `intmap_restore_try` held the DEFAULT hash). */
test('r244 ⑥ the bookmark restores from the boot hash and writes nothing before it', () => {
  const src = code('js/map-ui.js');
  assert.ok(/const BOOT_HASH=\(function\(\)\{ try\{ return location\.hash/.test(src), 'the opened address is captured at evaluation time');
  assert.ok(/function save\(\)\{ if\(!booted \|\| restoring/.test(src), 'nothing is written before the boot restore has run');
  assert.ok(/const H=\(opts&&opts\.shared===true\)\?location\.hash:\(bootDone\?location\.hash:BOOT_HASH\)/.test(src), 'the boot pass parses BOOT_HASH');
  /* …and every read inside restore() goes through it — a stray `location.hash` there is the bug back */
  const body = src.slice(src.indexOf('function restore(opts){'), src.indexOf('GE().events.on(\'moveend\''));
  const strays = (body.match(/location\.hash/g) || []).length;
  assert.equal(strays, 2, 'only the two in the `H` line itself');
});

/* ⑦ 「左右のサイドバーの開閉持ち手部分の色味が統一されていない」 — measured: the left handle computed
   to rgb(28,28,30) + saturate(1.5) blur(16px), the right to rgba(28,28,30,0.85) + blur(20px),
   because the shared glass-material rule named one and not the other. */
test('r244 ⑦ both sidebar handles read the one glass material', () => {
  const css = read('css/intmap.css');
  /* (#R430) anchored on .btn-toggle-sidebar: the list used to start with the dead
     .ai-view-summary-btn, so removing that corpse would have failed this test on an
     indexOf(-1) — the assertion below is about the two HANDLES, not about that button. */
  const rule = css.slice(css.indexOf('.btn-toggle-sidebar,#lsr-toggle'));
  const decl = rule.slice(0, rule.indexOf('}'));
  assert.ok(/#lsr-toggle/.test(decl), 'the right sidebar’s handle is in the material list');
  assert.ok(/\.btn-toggle-sidebar/.test(decl), '…and so is the left one');
});

/* ⑪ 「郵便番号で地点検索したら、その範囲が、地名ラベルをクリックした時みたいにハイライトされるように。」
   ⚠ and the #R59 rule holds: no polygon ⇒ nothing is drawn (never a rectangle). */
test('r244 ⑪ a postcode search outlines its real boundary and never a box', () => {
  const src = code('js/search-geocode.js');
  assert.ok(/postalcode='\+encodeURIComponent\(code\)/.test(src), 'the structured postcode query, not free text');
  /* ⚠ and BOUNDED to where the search landed: `postalcode=10115` alone returns Zagreb, Manhattan,
     Gimpo and Bouira before it ever reaches the Berlin the reader picked (measured). */
  assert.ok(/bounded=1&viewbox='\+\(lng-d\)/.test(src), 'bounded to the point that was flown to');
  assert.ok(/if\(!polys\.length\) return;/.test(src), 'no real boundary → draw NOTHING');
  assert.ok(/IntMapOutline && window\.IntMapOutline\.clear/.test(src), 'closing the card clears the outline');
});
}

/* ═══ from tests/r247-checks.test.mjs (tests #9 of 9) ═══
    R247 — the five things this round changed, stated as contracts
    ① the SDF atlas speaks the server `top` convention (the news band's real defect)
    ② the far intensity raster's edge is a SURFACE distance, and the box is the only ownership test
    ③ the field ends in a fade, through ONE function both rasters call
    ④ the aircraft ramp is the original stops at 1.25×, still stated once
    ⑤ the thirteenth translation shape — a helper ternary with ARRAY arms — is measured and gone */
{
/* ⚠ comments are stripped before matching — this file's own prose quotes the instruction, and a
   negative check that reads its own comment is [[intmap-recurring-lessons]] E, eight rounds running. */

/* ── ⑤b THE FEEDBACK TYPES ────────────────────────────────────────────────────────────────────
   「Feedbackの選べるtypeの種類が少なすぎる。」 Three choices sorted nothing. ⚠ And the reader of the
   list was on the wrong shape: #R243 turned these tuples into `LA(…)` CALLS, which return an ARRAY,
   and `submit()` still read `.en` off them — so every row since has been stored as 「[undefined]」. */
test('r247 ⑤b the feedback type list is the app\'s own subjects, and its English label is readable', () => {
  const f = code(read('js/feedback.js'));
  const ids = [...f.matchAll(/\[\s*'([a-z]+)'\s*,\s*LA\(/g)].map((m) => m[1]);
  assert.ok(ids.length >= 14, `only ${ids.length} feedback types — the reported defect was that there are too few`);
  for (const must of ['general', 'idea', 'bug', 'map', 'data', 'news', 'ai', 'sim', 'perf', 'lang', 'other']) {
    assert.ok(ids.includes(must), `the '${must}' type is missing`);
  }
  assert.match(f, /const catEN=\(CATS\.find\(x=>x\[0\]===cat\)\|\|\[,\['General'\]\]\)\[1\]\[0\];/,
    'the stored English label is read off the tuple as an ARRAY (LA returns one), not as an object');
  assert.doesNotMatch(f, /\)\[1\]\.en/, 'nothing reads `.en` off a pickArgs tuple any more');
});
}

/* ═══ from tests/r255-checks.test.mjs (tests #5 of 13) ═══
    #R255 — source-level checks
    Each test pins the CAUSE this round measured, not the symptom, so the next
    round cannot re-introduce the same shape somewhere else and pass.

   (layer-manifest) which layers exist, and their facts */
{
/* comments carry the reasoning and quote the very strings under test — strip them first */

/* ── ⑤ both layer-search boxes have a clear button ───────────────────────────────────────────── */
test('#R255 ⑤ the clear button exists on BOTH search inputs', () => {
  /* ⚠ (#R296) THERE IS ONLY ONE LAYER-SEARCH BOX NOW — 「レイヤー選択欄はclassic dropdownを完全削除」.
     #R239's lesson (a defect fixed in one of two copies and left in the other) is what made these
     checks assert BOTH boxes; deleting one copy is the strongest possible answer to it, so the
     assertion becomes 「the classic one is gone」 rather than 「it matches」. */
  assert.doesNotMatch(code(read('js/map-extras.js')), /class="ls-clear"/, 'the classic panel search is gone, button and all');
  const mu = code(read('js/map-ui.js'));
  assert.match(mu, /function wireSearchClear\(/, 'the tile grid search has no clear button');
  /* every mount calls it — the sidebar and the phone sheet (#R239: one of two copies is the trap) */
  assert.equal((mu.match(/wireSearchClear\(/g) || []).length, 3,
    'wireSearchClear is defined but not called from every host that has a search box');
});
}

/* ═══ from tests/r261-checks.test.mjs (tests #7 of 13) ═══
    #R261 — source-level checks
    One test per defect this round measured, in the shape the measurement took.
    Source assertions (no browser): the browser specs cost minutes, these cost
    milliseconds, and a defect that has a shape in the source belongs here.

    ⚠ (#R283) EVERY ASSERTION BELOW IS ABOUT THE CONTENT OF A FILE, SO IT READS THE
    CONTENT. This file used to read the bytes the checkout produced, and ③ demands a
    line break at a named place — which on a CRLF working copy has a carriage return
    in front of it, so ③ has been red on Windows and green in CI ever since #R275 gave
    it that shape. See scripts/eol.mjs: the line break ③ requires is still required,
    and nothing else moved.

   (layer-manifest) which layers exist, and their facts */
{

/* ── ⑦ the reachable-area panel is opaque by default and still follows the setting ──────────────
   「Reachable areaのポップアップはデフォルト透過するな。」 It was the only floating panel with a
   translucent fill and NO backdrop-filter, and it was named in neither frosted-mode list. */
test('R261 ⑦: #iso-panel is opaque by default and joins the two frosted-mode lists', () => {
  const js = read('js/map-tools.js');
  assert.match(js, /id='iso-panel'[\s\S]{0,1600}background:var\(--card-bg,#1c1c1e\)/,
    'the default fill is the opaque card background');
  assert.doesNotMatch(js, /panel\.style\.cssText='position:fixed;left:20px;top:80px;[^']*var\(--popup-bg/,
    'the translucent token is gone from the inline style');
  const css = read('css/intmap.css');
  assert.match(css, /body\.sidebar-translucent #iso-panel, body\.sidebar-glass2 #iso-panel\{/,
    'it follows 「フロストガラス」/「より透明」 like every other floating surface');
});
}
