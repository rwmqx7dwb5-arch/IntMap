/* ============================================================================
 *  shell-layer-panel-checks — the layer panel and Tools rows in js/map-ui.js, and the preview queue that paints them
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r252-checks.test.mjs
 *  tests/r296-checks.test.mjs
 *  tests/r666-checks.test.mjs
 *  tests/r309-checks.test.mjs
 *  tests/r483-checks.test.mjs
 *  tests/r670-checks.test.mjs
 *  tests/r766-gis-entrance-checks.test.mjs
 *  tests/r408-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { codeOnly, codeOnly as code, codeOnly as nocomment } from '../scripts/code-only.mjs';
import { publishedList } from './helpers/layer-groups.mjs';
import { capsSource, capabilityEntry } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R252 · from r252-checks.test.mjs ═══════════════════════ */
/* (#R252 — the round's own account of why these checks exist heads its other half, in tests/shell-map-labels-checks.test.mjs) */
{

/* ── ② ONE BACKGROUND, TWO ELEMENTS ──────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('#R252 ② the Active-layers bar reads the layer sidebar’s own background variable', () => {
  const mu = code(read('js/map-ui.js'));

  const panel = /#layer-sidebar-r\{background:var\((--[a-z-]+),var\((--[a-z-]+)\)\)/.exec(
    mu.replace(/[\s\S]*?body:not\(\.sidebar-translucent\):not\(\.sidebar-glass2\) /, ''));
  assert.ok(panel, 'the solid-mode rule that paints #layer-sidebar-r was not found — re-derive this check');

  const bar = /#layer-sidebar-r #layer-active-section\{[^}]*background:var\((--[a-z-]+),var\((--[a-z-]+)\)\)/.exec(mu);
  assert.ok(bar, 'the Active-layers bar does not paint itself from a variable PAIR — it is a single colour again');
  assert.equal(bar[1], panel[1], 'the bar and the panel read different primary background variables');
  assert.equal(bar[2], panel[2], 'the bar and the panel read different fallback background variables');

  /* #R115: opaque in the frosted modes too — the fallback is what keeps that true */
  assert.equal(bar[2], '--card-bg', 'the frosted-mode fallback must stay the opaque card colour (#R115)');
});
}

/* ═══════════════════════ #R296 · from r296-checks.test.mjs ═══════════════════════ */
/* (#R296 — the round's own account of why these checks exist heads its other half, in tests/shell-weather-packs-routing-checks.test.mjs) */
{
/* comments out, so an assertion about code cannot be satisfied by prose about code */

/* ═══ ⑦ THE CLASSIC DROPDOWN CANNOT BE SHOWN ═════════════════════════════════════════════════
   「レイヤー選択欄はclassic dropdownを完全削除。（右サイドバー形式に一本化し、設定から該当項目を削除。）」
   ⚠ THE ELEMENT STAYS, AND THAT IS NOT A HEDGE. Counted before touching it: `#layer-dropdown` is
   referenced 71 times across 20 files and is where EVERY layer checkbox in this program lives — the
   right sidebar is built by walking it (`rowsFromDropdown`), as are the presets, Atlas's layer
   catalogue and the share links. Deleting the node would not have removed a dropdown; it would have
   removed the layers. What is removed is the SURFACE. */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R296 ⑦ the classic layer dropdown has no way to be shown, and no setting', () => {
  const css = read('css/intmap.css');
  assert.doesNotMatch(css, /\.layer-dropdown\.show\{/, 'the class that displayed it is gone');
  /* ⚠ anchored at the start of a line: `.map-controls-top .layer-dropdown{pointer-events:auto}` comes
     first in the file and would otherwise be read as the panel's own rule. */
  const base = /\n\s*\.layer-dropdown\{([^}]*)\}/.exec(css);
  assert.ok(base, 'the base rule is still there (it styles the registry inside the phone sheet)');
  assert.match(base[1], /display:none/, 'and it is display:none');

  const dd = code(read('js/layer-dropdown.js'));
  assert.doesNotMatch(dd, /classList\.toggle\('show'\)/, 'nothing toggles it open');
  assert.doesNotMatch(dd, /classList\.remove\('show'\)/, 'and nothing dismisses it, because nothing opens it');
  assert.match(dd, /window\.IntMapLayerSidebar\) window\.IntMapLayerSidebar\.toggle\(\)/, 'the button has ONE destination');

  /* the setting is gone from the markup, from the save, from the load and from the commit */
  const html = read('index.html');
  assert.doesNotMatch(html, /id="setting-layerpanel"/, 'the Settings row is gone');
  const body = code(read('js/app-body.js'));
  assert.doesNotMatch(body, /setting-layerpanel/, 'nothing reads the control');
  assert.doesNotMatch(body, /layerPanelSet/, 'nothing records an explicit choice');
  assert.match(body, /window\.imLayerPanel='right';/, "and the one value is still declared");

  /* the search box that only existed inside it went with it */
  assert.doesNotMatch(code(read('js/map-extras.js')), /IntMapModules\.layerSearch\s*=/, 'the classic search module is gone');
  assert.doesNotMatch(body, /IntMapModules\.layerSearch\(/, 'and is not instantiated');
});

/* ═══ ⑧ THE FOUR TOOL ROWS, AND WHERE EACH FEATURE WENT ══════════════════════════════════════ */
/* spelling kept: browser script (js/map-ui.js, js/map-tools.js, js/viewshed.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R296 ⑧ nothing lost a feature when four rows were removed', () => {
  const ui = read('js/map-ui.js');
  for (const dead of ['sim.disaster', 'sim.transitReach', 'sim.rf', 'sim.earthReplay', 'sim.tsunami'])
    assert.ok(!ui.includes("id:'" + dead + "'"), dead + ' has no row');

  /* 到達圏: one tool, four transports, and the rail model is the one answering the fourth */
  const mt = read('js/map-tools.js');
  assert.match(mt, /transit:'transit',rail:'transit'/, 'the reachable-area panel knows the transport');
  assert.match(mt, /const TR=\(\)=>window\.IntMapTransitReach\|\|null;/, 'and reaches the rail model');
  assert.match(mt, /if\(cost==='transit'\)\{/, 'with a branch of its own');
  assert.match(mt, /t\.open\(\{lng:center\.lng,lat:center\.lat\},budget\)/, 'that calls it rather than re-implementing it');
  /* the two drawings are two sources, so closing has to take BOTH off */
  /* ⚠ js/map-tools.js holds several `function clear()`; this is the reachable-area one, so it is
     found from inside that module rather than by the first match in the file. */
  const iso = mt.slice(mt.indexOf('window.IntMapIsochrone='), mt.indexOf('window.IntMapArc3D='));
  const clear = /function clear\(\)\{([\s\S]*?)panel\.style\.display='none'; \}/.exec(iso);
  assert.ok(clear, 'the reachable-area clear() must be findable');
  assert.match(clear[1], /const t=TR\(\); if\(t&&t\.clear\) t\.clear\(\)/, 'clearing takes the rail drawing too');

  /* 電波・通信圏: a mode of the viewshed, which is the richer of the two models */
  const vs = read('js/viewshed.js');
  assert.match(vs, /let losMode='los';/, 'the viewshed has an analysis mode');
  assert.match(vs, /const horizonKm=\(h\)=>4\.12\*\(Math\.sqrt\(Math\.max\(1,h\)\)\+Math\.sqrt\(2\)\)/, 'the 4/3-earth horizon came across…');
  assert.match(vs, /const fsplKm=\(dbm,mhz\)=>/, '…and so did the free-space link budget');
  assert.match(vs, /setMode:\(m\)=>/, 'and the mode can be set from outside (Atlas uses it)');
  assert.match(code((read('js/atlas-console.js') + '\n' + capsSource())), /L2\.setMode\(\/\^\(los\|lineOfSight\|viewshed\)\$\/\.test/, 'rfCoverage picks the radio analysis');

  /* the three modules are gone from js/sims.js, with their factories */
  const sims = code(read('js/sims.js'));
  for (const g of ['IntMapRF', 'IntMapDisaster', 'IntMapEarthReplay'])
    assert.doesNotMatch(sims, new RegExp('window\\.' + g + '='), g + ' is gone');
  const body = code(read('js/app-body.js'));
  for (const g of ['rf', 'disaster', 'earthReplay'])
    assert.doesNotMatch(body, new RegExp('IntMapModules\\.' + g + '\\(IM_HOST\\)'), g + ' is not instantiated');
  /* …and transitReach STAYS, because the reachable-area panel calls it */
  assert.match(body, /IntMapModules\.transitReach\(IM_HOST\)/, 'the rail model still loads');
});
}

/* ═══════════════════════ #R666 · from r666-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  R666 · 「LayersのToolsからアクセスできるように。」 — AND THE MOBILITY THAT CARRIES THE OUTBREAK
 * ----------------------------------------------------------------------------
 *  Two things, one round. The first is a door: the pandemic simulator was one of four cards inside
 *  the Playground hub, so it cost two taps and a screen about three other things. The second is the
 *  audit's PHASE 2 — the destination of an international importation was drawn UNIFORMLY, so
 *  Tuvalu and India were equally likely to receive the world's next outbreak.
 *
 *  The door checks read source, because a button's id and the command behind it are facts about the
 *  shipped files; the mobility checks RUN the model, because a distribution is not something a
 *  regular expression can see (#R505).
 * ==========================================================================*/
{
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

/* ── ① the command ─────────────────────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/app-body.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R666 ①: the pandemic simulator is an OS action, not three copies of an open sequence', () => {
  const s = nocomment(read('js/app-body.js'));
  assert.match(s, /IntMapOS\.register\('sim\.pandemic'/, 'sim.pandemic is registered beside sim.seismic');
  assert.match(s, /IntMapOS\.register\('sim\.pandemic'[\s\S]{0,400}?IntMapLazy\.need\('playground'\)/,
    'and it fetches the lazy module rather than assuming it is here');
  assert.match(s, /IntMapOS\.register\('sim\.pandemic'[\s\S]{0,400}?window\._pgPandemic\(\)/,
    'and presses the simulator itself, not the hub');
  assert.match(s, /IntMapOS\.register\('sim\.pandemic'[\s\S]{0,500}?btn:'btn-pandemic-sim'/,
    'and names the button the Layers strip builds');
});

/* ── ② the row in Layers ▸ Tools ───────────────────────────────────────────────────────────── */
/* spelling kept: browser script (js/data-layers.js, js/analysis-panels.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R666 ②: Layers ▸ Tools has a row of its own for the pandemic simulator', () => {
  const s = read('js/data-layers.js');
  assert.match(s, /b\.id='btn-pandemic-sim'/, 'the button is built…');
  assert.match(s, /const _pan=_panBtn\(\);/, '…once per rebuild, like _seisBtn…');
  assert.match(s, /if\(_pan\) tools\.appendChild\(_pan\);/, '…and appended to the Tools strip');
  /* the press goes through the command; the direct call is only the fallback for a kernel that is
     not up yet — the same two-step `_seisBtn` uses */
  const body = s.slice(s.indexOf("const _panBtn=()=>{"), s.indexOf("order.push(mkHr());", s.indexOf("const _panBtn=()=>{")));
  assert.match(body, /OS\.exec\('sim\.pandemic',\{source:'ui'\}\)/, 'one press = one command');
  assert.match(body, /IntMapLazy\.need\('playground'\)[\s\S]*?_pgPandemic/, 'with a fallback that still opens the simulator');
  /* the label is the name the hub card already carries, so the four locale packs need no new key */
  assert.match(body, /IntMapLang\.t\(lang,'Pandemic Simulator'/, 'one thing, one name');
  /* ⚠ THE HUB IS NOT REPLACED — 「Playground ハブは残す」 */
  assert.match(read('js/analysis-panels.js'), /id="btn-edu"/, 'the Playground hub keeps its button');
});

/* ── ③ the dead wiring ─────────────────────────────────────────────────────────────────────── */
/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R666 ③: nothing binds a handler to #btn-playground, an id nothing creates', () => {
  /* MEASURED before this round: js/app-body.js bound an onclick to `#btn-playground` and no file in
     the repository — no .js, no .html — ever created that id. Settings ▸ Playground was that button
     until #R30 moved the hub to the Tools strip. */
  const src = ['js/app-body.js', 'js/analysis-panels.js', 'js/data-layers.js', 'js/atlas-console.js', 'index.html']
    .map((f) => nocomment(read(f))).join('\n');
  assert.ok(!src.includes('btn-playground'), 'the id is gone from the code (comments may still explain it)');
});

/* ── ④ Atlas asks for the module before it asks which mode ─────────────────────────────────── */
/* spelling kept: browser script (js/atlas-console.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R666 ④: "open the pandemic simulator" does not answer with the hub on a cold page', () => {
  /* MEASURED: the pandemic arm tested `window._pgPandemic`, which js/playground.js's factory installs
     and #R209 made that factory run only on demand — so before anyone had opened the Playground the
     arm was false and the request fell through to the `else`, which opened the four-card hub. */
  const s = nocomment((read('js/atlas-console.js') + '\n' + capsSource()));
  const c = nocomment((capabilityEntry('playground') || {}).run || '');   /* (atlas-capability-modules) the run of panel.playground */
  const arm = c.indexOf('_pgPandemic');
  const load = c.indexOf("IntMapLazy.need('playground')");
  assert.ok(load >= 0 && load < arm, 'the loader is awaited BEFORE the mode arms are tested');
  assert.ok(c.indexOf('_openPlayground') > arm, 'and the hub is still the fallback, not the answer');
});
}

/* ═══════════════════════ #R309 · from r309-checks.test.mjs ═══════════════════════ */
/* (#R309 — the round's own account of why these checks exist heads its other half, in tests/shell-map-labels-checks.test.mjs) */
{
/* (layer-manifest) the lists are views of js/layer-manifest.js */

/* the comments in this project carry the reasoning, and several of them QUOTE the spellings that
   were replaced — a check that greps them proves nothing (23 rounds of exactly that) */
const code = (p) => codeOnly(read(p));

/* the body of a named function declaration, brace-balanced (#R228 / #R307) */
function fnBody(src, name) {
  /* the three shapes this repository declares a function in — a declaration, a property assignment
     and an arrow — so a check does not go red because the author picked a different one */
  let start = src.indexOf('function ' + name + '(');
  if (start < 0) { const m = new RegExp('\\b' + name + '\\s*=\\s*(?:function\\s*\\(|\\([^)]*\\)\\s*=>)').exec(src); if (m) start = m.index; }
  assert.notEqual(start, -1, 'a function called ' + name + ' exists');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}

/* ══ ⑥ 「Base map & labels」は1つの一覧であり、数える側は全部それを引く ══════════════════════════ */
const DL = code('js/data-layers.js');

/* spelling kept: browser script (js/data-layers.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r309 ⑥ the base-map section is ONE published list, and it covers every row in the section', () => {
  /* ⚠ both halves are on `window`: js/data-layers.js is a module, so a top-level `const` would be
     private to it and js/widget-core.js could not subtract the same list (tests/r175 ③ fails the
     shape outright, which is how the first attempt at this was caught). */
  /* (layer-manifest) the section is the manifest's `base` shelf; publishedList checks js/data-layers.js still
     publishes it FROM there (window.IntMapBasicLayerRows=basicRows();) and returns the value */
  const cbIds = publishedList('IntMapBasicLayerRows');
  assert.ok(cbIds, 'js/data-layers.js publishes IntMapBasicLayerRows');
  /* ⚠⚠ (#R469) THE FLOOR IS 9, AND WHAT IT PROTECTS IS UNCHANGED. This number is not a count of
     the section — it is a guard against the list being quietly emptied, which is the shape #R309
     found (four hand-written copies of this membership, disagreeing). `cb-countries` left it by
     instruction (「国境・国情報レイヤーは完全削除して」, narrowed by the reader to 「レイヤー行だけ隠す」),
     so it is now in `window.IntMapHiddenLayerRows` instead: the checkbox is still in the registry
     and the layer still works, it simply has no row.
     ⚠ AND ONE INVARIANT WAS DELIBERATELY GIVEN UP, so it is written down rather than left to be
     inferred from a smaller number: `cb-countries` is no longer SUBTRACTED from the layer counters
     either. #R309's rule was 「Base map & labels のオン数をレイヤーのオン数にみなすな」, and that still
     holds for the nine rows this section draws — but a layer with no row and no chip cannot be
     switched off at all, so the 「表示中のレイヤー」 chip is now its only handle and it has to count. */
  assert.ok(cbIds.length >= 9, 'the checkbox half of the section is there (' + cbIds.length + ')');
  const all = publishedList('IntMapBasicLayers');
  assert.deepEqual(all.slice(0, cbIds.length), cbIds, 'window.IntMapBasicLayers is those rows plus the ones that were moved in');
  const extra = all.slice(cbIds.length);

  /* ⚠ THE GUARD THAT WOULD HAVE CAUGHT #R271 AND #R273. `reorganizeLayerPanel` builds the section by
     pushing rows until the first divider; every `rowFor('x')` in that stretch is a member. Two of
     them were added in later rounds and no counter learned about them. */
  const from = DL.indexOf('const order=[];');
  const to = DL.indexOf('order.push(mkHr())', from);
  assert.ok(from > 0 && to > from, 'the section-building stretch is identifiable');
  const keys = [...DL.slice(from, to).matchAll(/rowFor\('([a-z0-9]+)'\)/g)].map((m) => m[1]);
  assert.equal(keys.length, extra.length, 'every row pushed into the section is published (' + keys.join(', ') + ')');
  for (const k of keys) {
    assert.equal(extra.filter((id) => id.includes(k)).length, 1, "'" + k + "' is in window.IntMapBasicLayers exactly once");
  }
});

/* spelling kept: browser script (js/widget-core.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r309 ⑥ every counter subtracts that list, and none keeps a copy of it', () => {
  const counter = fnBody(DL, '_refreshActiveLayers');
  assert.ok(/IntMapBasicLayers/.test(counter), 'the "Active layers (N)" counter reads the published list');
  /* the copy it replaced was a Set of ten-plus `'cb-…'` literals; a new one must not appear */
  const literals = (counter.match(/'cb-[a-z0-9]+'/g) || []).length;
  assert.ok(literals === 0, 'the counter holds no hand-written copy of the section (' + literals + ' found)');

  const WC = code('js/widget-core.js');
  const active = WC.slice(WC.indexOf('WC.activeLayers'), WC.indexOf('WC.setLayer'));
  assert.ok(/IntMapBasicLayers/.test(active), 'the widget deck\'s layer count subtracts the same list');
});

/* spelling kept: browser script (js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r309 ⑥ the base-map section is drawn as switch rows with no thumbnail', () => {
  const MU = code('js/map-ui.js');
  const build = fnBody(MU, 'buildTiles');
  assert.ok(/lst-rows/.test(build), 'buildTiles gives the basics section its own container class');
  assert.ok(/secName===basics/.test(build), 'the row shape is chosen by the section, not by a second id list');
  assert.ok(/tileFor\(r,\s*\w+\)/.test(build), 'the shape is passed to the one tile builder');

  const tile = fnBody(MU, 'tileFor');
  assert.ok(/asRow/.test(tile), 'tileFor knows the row shape');
  /* the thumbnail must be unreachable in the row shape: its creation sits in the else branch */
  const prevAt = tile.indexOf("className='lst-prev'");
  const elseAt = tile.indexOf('else{');
  assert.ok(prevAt > 0 && elseAt > 0 && prevAt > elseAt, 'the preview element is only built for the tile shape');
  assert.ok(/lst-sw/.test(tile), 'the row carries a switch');
  assert.ok(/role','switch'/.test(tile) && /aria-checked/.test(tile), 'the row is a switch to a screen reader too');

  /* both mounts, exactly as .lst-toolrow does it — the phone sheet builds through the same function */
  const css = read('js/map-ui.js');
  for (const sel of ['.lst-grid.lst-rows', '.lst-tile.lst-row', '.lst-sw']) {
    const line = css.split('\n').find((l) => l.includes("#layer-sidebar-r " + sel + '{') || l.includes("#layer-sidebar-r " + sel + ','));
    assert.ok(line, 'the sidebar rule for ' + sel + ' exists');
    assert.ok(line.includes('.lsr-mount ' + sel), 'the phone sheet gets ' + sel + ' in the same rule');
  }
});

/* ══ ⑦ タイルのサムネイル — 参照とファイルが双方向で一致する ═══════════════════════════════════ */
/* spelling kept: browser script (js/layer-previews.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r309 ⑦ every preview the module names exists, and every preview on disk is named', () => {
  const src = read('js/layer-previews.js');
  const refs = [...new Set((src.match(/'preview_[a-z0-9_]+\.png'/g) || []).map((s) => s.slice(1, -1)))].sort();
  const files = readdirSync(ROOT).filter((f) => /^preview_.*\.png$/.test(f)).sort();
  assert.ok(refs.length >= 28, 'the module names the whole set (' + refs.length + ')');
  for (const r of refs) assert.ok(existsSync(resolve(ROOT, r)), r + ' is in the repository');
  /* the other direction is the one that rots: a file nothing references is dead weight in a deploy
     that copies EVERY root-level png (vite.config.js ROOT_PNG) */
  for (const f of files) assert.ok(refs.includes(f), f + ' is referenced by js/layer-previews.js');
});

/* spelling kept: browser script (js/layer-previews.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r309 ⑦ the previews are the tile\'s own aspect ratio, so `cover` crops nothing', () => {
  /* the tile canvas declares its own geometry; read it rather than restating 240/121 here */
  const src = read('js/layer-previews.js');
  const m = /const W=(\d+),H=(\d+)/.exec(src);
  assert.ok(m, 'js/layer-previews.js declares the preview canvas size');
  const want = Number(m[1]) / Number(m[2]);
  for (const f of readdirSync(ROOT).filter((x) => /^preview_.*\.png$/.test(x))) {
    const b = readFileSync(resolve(ROOT, f));
    assert.equal(b.toString('ascii', 12, 16), 'IHDR', f + ' is a PNG');
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    assert.ok(w >= 2 * Number(m[1]), f + ' is at least 2x the tile width (' + w + ')');
    assert.ok(Math.abs(w / h - want) / want < 0.02, f + ' is the tile aspect ratio (' + w + 'x' + h + ')');
  }
});
}

/* ═══════════════════════ #R483 · from r483-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  R483 — カスタムの選択肢を縮める / お気に入りを棚にする / 送信メッセージをガラスにする
 * ----------------------------------------------------------------------------
 *  3つの依頼はどれも「見た目」に見えるが、壊れ方はどれも見た目では出ない。
 *
 *  ⚠⚠⚠ ① **共有された寸法を、片方の都合で縮めてはならない。**
 *    `.lst-sw`（42×26・20px のつまみ・16px の移動）は `js/map-ui.js` 自身のコメントが
 *    「ウィジェット群の `.wgt-sw` と**同じ1つの物**」と宣言しているスイッチである。
 *    「基本表示のカスタムの行を縮めて」に対して base の `.lst-sw` を縮めれば、依頼と無関係な
 *    ウィジェット側のスイッチが**黙って一緒に縮む**。だから縮むのは `.lst-basic` に限る。
 *
 *  ⚠⚠⚠ ② **同じレイヤーのタイルが2枚になった瞬間、「枚数で建て直しを決める門」が壊れる。**
 *    #R469 が書き残したとおり、`open()` / `mountInto()` は
 *    「描かれたタイル数 ≠ `rowsFromDropdown().length`」で全体を組み直す（#R72 の遅さの門）。
 *    お気に入りの棚は**同じレイヤーの2枚目**を作るので、その2枚目が数に入ると
 *    **両者は永久に一致せず、開くたびにパネル全体が建て直される**——見た目には何も起きない。
 *    だから4本の門はすべて `[data-fav="1"]` を引く。**4本のうち1本でも漏れたら同じ症状になる。**
 *
 *  ⚠⚠⚠ ③ **★を書き換える口は2つあり、片方だけが知らせれば片方の面が古いまま残る。**
 *    `js/map-ui.js` のタイルの★と `js/layer-favs.js` の classic 行の★は、どちらも
 *    `window.imLayerFavs` を直接触る。棚を建て直す合図（`intmap-layerfavs`）を撃つのが片方だけだと、
 *    もう片方から星を付けたときに棚が更新されない。
 *
 *  ⚠⚠⚠ ④ **白い文字は、下地が不透明でなくなった瞬間に読めなくなる。**
 *    吹き出しは `#fff` on `--atlas-grad`（実測 4.0:1）だった。ガラスにすると下地の実効輝度が上がり、
 *    白は消える。だから文字は `--text-main` へ移す。**同じ理由で、吹き出しの中で白を前提にしていた
 *    ファイルチップ（`rgba(255,255,255,0.16)` の地に `#fff`）も一緒に移さなければならない**——
 *    ここを忘れると「白地に白文字のチップ」だけが残る。
 *
 *  ⚠ **コメントは剥がして読む。** 上の説明はどれも、禁じている綴りそのものを含んでいる
 *    （`#fff`・`--atlas-grad`・`data-fav`・`.lst-sw`）。#R345 の `codeOnly` を通さない検査は、
 *    よく説明されたファイルほど大きな声で嘘をつく。
 * ==========================================================================*/
{
const code = (p) => codeOnly(read(p));

/** every CSS declaration block this source spells for `sel`, comments already stripped */
function rulesFor(src, sel) {
  const out = [];
  const needle = sel + '{';
  let i = 0;
  while ((i = src.indexOf(needle, i)) >= 0) {
    const end = src.indexOf('}', i);
    if (end < 0) break;
    out.push(src.slice(i + needle.length, end));
    i = end;
  }
  return out;
}
const px = (decls, prop) => {
  const m = new RegExp('(?:^|;)' + prop + ':([0-9.]+)px').exec(decls);
  return m ? parseFloat(m[1]) : null;
};

/* ═══ ① 縮むのは「カスタムの選択肢」だけ ══════════════════════════════════════════════ */
/* spelling kept: browser script (js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R483 ① カスタムの11行は縦に縮み、共有スイッチの寸法は1バイトも動かない', () => {
  const ui = code('js/map-ui.js');

  /* 一般の行の寸法（3択のモード行とツール行が今も使う） */
  const rowRules = rulesFor(ui, '#layer-sidebar-r .lst-tile.lst-row,.lsr-mount .lst-tile.lst-row');
  assert.equal(rowRules.length, 1, 'the generic row keeps exactly one geometry rule');
  const rowH = px(rowRules[0], 'min-height');
  assert.equal(rowH, 46, 'the generic row is untouched at 46px — only the sub-options shrink');

  /* カスタムの選択肢の寸法 */
  const basicRules = rulesFor(ui, '#layer-sidebar-r .lst-tile.lst-row.lst-basic,.lsr-mount .lst-tile.lst-row.lst-basic');
  assert.equal(basicRules.length, 1, 'the 基本表示 sub-options carry their own geometry rule');
  const basicH = px(basicRules[0], 'min-height');
  assert.ok(basicH !== null && basicH < rowH, `the sub-option row (${basicH}px) is shorter than the generic row (${rowH}px)`);
  const genPad = /(?:^|;)padding:([0-9]+)px/.exec(rowRules[0]);
  const basPad = /(?:^|;)padding:([0-9]+)px/.exec(basicRules[0]);
  assert.ok(genPad && basPad && Number(basPad[1]) < Number(genPad[1]), 'and its vertical padding is tighter too');

  /* ⚠ 行間は grid の `gap` なので子ごとに変えられない。隣り合う選択肢の間だけを詰める規則が要る。 */
  assert.match(ui, /\.lst-tile\.lst-basic\+\.lst-tile\.lst-basic[^}]*margin-top:-/,
    'consecutive sub-options pull together — the flex gap alone cannot differ per child');

  /* ⚠⚠ 共有スイッチ: base の寸法は動いていない（`.wgt-sw` と同一の物であるという宣言） */
  const swRules = rulesFor(ui, '#layer-sidebar-r .lst-sw,.lsr-mount .lst-sw');
  assert.equal(swRules.length, 1, 'one base switch rule');
  assert.equal(px(swRules[0], 'width'), 42, 'the shared switch is still 42px wide');
  assert.equal(px(swRules[0], 'height'), 26, 'and 26px tall');
  const knob = rulesFor(ui, '#layer-sidebar-r .lst-sw i,.lsr-mount .lst-sw i');
  assert.equal(px(knob[0], 'width'), 20, 'the shared knob is still 20px');
  assert.match(ui, /#layer-sidebar-r \.lst-tile\.on \.lst-sw i,\.lsr-mount \.lst-tile\.on \.lst-sw i\{transform:translateX\(16px\)/,
    'and its throw is still 16px');

  /* 縮んだスイッチは、同じ 3px の余白を保った小さい実例であること（34-3-15-3 = 13） */
  const bSw = rulesFor(ui, '#layer-sidebar-r .lst-tile.lst-row.lst-basic .lst-sw,.lsr-mount .lst-tile.lst-row.lst-basic .lst-sw');
  const bKnob = rulesFor(ui, '#layer-sidebar-r .lst-tile.lst-row.lst-basic .lst-sw i,.lsr-mount .lst-tile.lst-row.lst-basic .lst-sw i');
  assert.equal(bSw.length, 1); assert.equal(bKnob.length, 1);
  const w = px(bSw[0], 'width'), h = px(bSw[0], 'height'), kw = px(bKnob[0], 'width');
  const thr = /\.lst-basic\.on \.lst-sw i[^}]*translateX\((\d+)px\)/.exec(ui);
  assert.ok(thr, 'the smaller switch declares its own throw');
  assert.equal(w - kw - 2 * 3, Number(thr[1]), 'the knob lands 3px from the far edge, as it does at full size');
  assert.equal(h, kw + 2 * 3, 'and sits 3px from top and bottom');
  assert.ok(w < 42 && h < 26, 'and it really is the smaller instance');
});

/* ═══ ② お気に入りは「ほかと同じ棚」で、しかも枚数の門には数えられない ══════════════════ */
/* spelling kept: browser script (js/map-ui.js, js/locales, js/locales/) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R483 ② お気に入りの棚は基本表示の直後に建ち、名前は既訳キーから来る', () => {
  const ui = code('js/map-ui.js');

  assert.match(ui, /className='lst-grid lst-favgrid'/, 'the favourites grid exists and is a .lst-grid like every other category');
  assert.match(ui, /className='lst-sech'\+\(closed\?' closed':''\)/, 'and it is introduced by the same section header shape');

  /* 「基本表示のあと」— 位置ではなく、3択の行を持つグリッドを目印にして挿す */
  assert.match(ui, /querySelectorAll\('\.lst-grid'\)\)\.find\(x=>x\.querySelector\('\.lst-mode'\)\)/,
    'the insertion point is FOUND (the grid holding the three mode rows), not assumed to be index 0');
  assert.match(ui, /insertAdjacentElement\('afterend'/, 'and the favourites grid goes after it');

  /* ⚠ 名前は新しいリテラルではなく、9言語すべてに既にあるキーから引く */
  assert.match(ui, /keyed\(HOST\.lang\)\['favLayers'\]/, 'the label reads the existing favLayers key');
  const locales = fs.readdirSync(path.join(ROOT, 'js/locales')).filter(f => /^ui\..*\.js$/.test(f));
  assert.ok(locales.length >= 9, `all nine locale files are present (found ${locales.length})`);
  for (const f of locales) {
    assert.match(read('js/locales/' + f), /["']?favLayers["']?\s*:/, `${f} already carries favLayers — no new string to translate`);
  }
});

/* spelling kept: browser script (js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R483 ② 複製されたタイルは、建て直しを決める4本の門のどれにも数えられない', () => {
  const ui = code('js/map-ui.js');
  const gates = ui.match(/\.lst-tile\[data-lid\][^']*/g) || [];
  assert.equal(gates.length, 4, 'the four rebuild guards #R469 named are still four');
  for (const g of gates) {
    assert.match(g, /:not\(\[data-fav="1"\]\)/,
      'every one of them subtracts the favourites copies — one that does not rebuilds the whole panel on every open');
  }
  assert.match(ui, /t2\.dataset\.fav='1'/, 'and the copies are what carry that mark');
});

/* spelling kept: browser script (js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R483 ② 同じレイヤーの2枚のタイルは、両方が地図の状態に追従する', () => {
  const ui = code('js/map-ui.js');
  /* ⚠ 単数形の querySelector は最初の1枚しか触らない＝2枚目が古いまま残る */
  assert.doesNotMatch(ui, /const tile=h\.querySelector\(sel\)/,
    'the live-sync listener no longer stops at the first matching tile');
  assert.match(ui, /h\.querySelectorAll\(sel\)\.forEach\(tile=>(?:tile\.classList\.toggle\('on'|tileOn\(tile,)/,   /* (a11y-shared-dialog) tileOn writes the class AND aria-checked */
    'it toggles every tile standing for that checkbox');
});

/* ═══ ③ ★を書き換える口が2つある以上、合図も2つ要る ═══════════════════════════════════ */
/* spelling kept: browser script (js/map-ui.js, js/layer-favs.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R483 ③ タイルの★と classic 行の★は、どちらも棚に「動いた」と知らせる', () => {
  for (const f of ['js/map-ui.js', 'js/layer-favs.js']) {
    assert.match(code(f), /dispatchEvent\(new Event\('intmap-layerfavs'\)\)/,
      `${f} announces a change to window.imLayerFavs`);
  }
  assert.match(code('js/map-ui.js'), /addEventListener\('intmap-layerfavs'/,
    'and the tile browser listens for it');
  /* ⚠ 依存の向きは片方向: layer-favs.js は map-ui.js を import しない */
  assert.doesNotMatch(code('js/layer-favs.js'), /map-ui/, 'layer-favs.js does not learn about the tile browser');
});
}

/* ═══════════════════════ #R670 · from r670-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  R670 · A TOOL IS REACHABLE WHEN IT IS IN THE LIST THE PANEL A READER OPENS IS BUILT FROM
 * ----------------------------------------------------------------------------
 *  #R666 answered 「LayersのToolsからアクセスできるように。」 by appending a button to `#layer-tools`.
 *  MEASURED on the shipped R666 build: the button existed, its handler opened the simulator, the OS
 *  action answered — and its bounding rect was 0×0, because `#layer-tools` lives inside
 *  `#layer-dropdown`, the CLASSIC dropdown, and `imLayerPanel` has defaulted to `'right'` since
 *  #R154. The reader's Tools list had ten rows and none of them was the pandemic simulator.
 *
 *  ⚠⚠⚠ THAT IS THE SECOND TIME THE SAME ANSWER WAS GIVEN TO THE SAME INSTRUCTION — #R242 did it for
 *  the earthquake simulator and #R243 had to re-do it. Two rounds, one shape. #R258 ⑨ and #R261 ⑨
 *  already assert that certain simulations have a row here, but they do it from a HAND-WRITTEN LIST
 *  of ids, so a simulation added afterwards is invisible to them: a list written by hand cannot
 *  notice the thing that was not added to it. The check below does not carry a list. It DISCOVERS
 *  the simulations — every `sim.*` command the app registers with the kernel — and requires each of
 *  them to be in the registry the visible panel is built from.
 * ==========================================================================*/
{
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

/* ── ① every simulation the kernel knows has a row in the list the reader sees ─────────────── */
/* spelling kept: browser script (js/app-body.js, js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R670 ①: every sim.* command is a row in the registry the visible Tools panel draws', () => {
  /* The two places a `sim.*` command is registered: js/map-ui.js's own SIM_TOOLS loop, and the ones
     js/app-body.js registers beside the kernel because their module is lazy. Only the second kind can
     drift, which is exactly the drift #R666 shipped. */
  const shell = nocomment(read('js/app-body.js'));
  const ui = nocomment(read('js/map-ui.js'));

  const registered = [...shell.matchAll(/IntMapOS\.register\('(sim\.[a-zA-Z]+)'/g)].map((m) => m[1]);
  assert.ok(registered.length >= 2,
    'the shell registers at least the two lazy simulations; found ' + JSON.stringify(registered));

  for (const id of registered) {
    assert.ok(ui.includes("id:'" + id + "'"),
      id + ' is registered with the kernel but has no row in js/map-ui.js — the reader cannot reach it. '
      + '#R666 shipped exactly this: a button in `#layer-tools`, which the default panel does not draw.');
  }
});

/* ── ② …and the pandemic simulator in particular, since that is what was asked for ─────────── */
/* spelling kept: browser script (js/map-ui.js, js/playground.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R670 ②: the pandemic simulator is a Tools row, with a name, a hint and a second press', () => {
  const ui = read('js/map-ui.js');
  const row = ui.slice(ui.indexOf("{ id:'sim.pandemic'"), ui.indexOf("{ id:'sim.pandemic'") + 1400);
  assert.ok(row.startsWith("{ id:'sim.pandemic'"), 'the row exists');
  assert.match(row, /mod:'IntMapPandemic'/, 'it names the module, so the row lights while the run is on');
  assert.match(row, /run:null/, 'and the open is the OS action, not a second copy of the open sequence');
  assert.match(row, /label:\(\)=>T\('Pandemic Simulator'/, 'it has the name the hub card already uses');
  assert.match(row, /hint:\(\)=>T\('Seed an outbreak/, 'and a hint, like every other row');
  assert.match(row, /keys:'[^']*pandemic[^']*パンデミック/, 'and search keys in more than one language');

  /* the contract `_toolOn` / `_toolOff` ask for — published by the module, from inside its own door */
  const pg = read('js/playground.js');
  assert.match(pg, /window\.IntMapPandemic=\{ isOpen:\(\)=>!!document\.getElementById\('pg-pan-hud'\), close:/,
    'js/playground.js publishes isOpen/close for the row to ask');
  const decl = pg.indexOf('window.IntMapPandemic=');
  const door = pg.indexOf('window._pgPandemic=function');
  assert.ok(door >= 0 && decl > door,
    'and publishes it from INSIDE the door, so drawing the row cannot make the lazy module load (#R209)');
});

/* ── ③ the classic dropdown's button is not removed, and not the thing being relied on ──────── */
/* spelling kept: browser script (js/data-layers.js, js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R670 ③: #btn-pandemic-sim stays for the classic panel, and is not the reachability claim', () => {
  /* ⚠ NOT DELETED. `imLayerPanel` still has a `classic` setting and `#layer-tools` is what that
     setting draws — the earthquake simulator keeps its button there for the same reason (#R242).
     What changed is what the repository CLAIMS: reachability is the row in js/map-ui.js. */
  assert.match(read('js/data-layers.js'), /b\.id='btn-pandemic-sim'/, 'the classic panel keeps its button');
  assert.match(read('js/map-ui.js'), /id:'sim\.pandemic'/, '…and the default panel has the row');
});
}

/* ═══════════════════════ #R766 · from r766-gis-entrance-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  R766 — 「データと分析」を開くボタンが、試したどの幅でも押せなかった
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ THE REACHABILITY ITSELF IS NOT MEASURED HERE. It is measured in the browser, in
 *  `tests/smoke.spec.js` (R766 ①②③), because 「a finger landing on this button reaches it」 is a
 *  question only a laid-out page can answer — `document.elementFromPoint`, per
 *  [[intmap-visible-is-not-unoccluded]]. Reading the source is exactly how this defect survived
 *  three rounds and every gate: the button was in the document, its handler was right, its OS
 *  action was registered, and its rect was 0×0 at all 18 widths measured on production R765.
 *
 *  What is here is the handful of facts a source can actually answer, kept because they are cheap
 *  and they fail LOUDLY where the browser test would fail confusingly:
 *
 *    ① a node CARRIED into a container must be rescued before that container is thrown away
 *    ② the twin-dedupe must stay COMPUTED from two declarations, never a written pairing of ids
 *    ③ every declaration must name a command that exists, or the dedupe silently stops matching
 * ==========================================================================*/
{
const mapUi = read('js/map-ui.js');
const dataLayers = read('js/data-layers.js');

/* ① `#layer-tools` is a REAL node moved into the tile browser's tools section, not a copy of one.
   `buildTiles` replaces the whole `.lst-root`, so the strip has to be lifted out BEFORE that or it
   is detached — and a detached node is one `document.getElementById` can no longer find, which is
   how #btn-correlate / #edu-mount / #lyr-presets vanished for the rest of the session on a 375px
   phone while this round was being written. The rescue is worth pinning as an ORDER because the
   order is the whole of it: the same two statements the other way round lose the strip every time.
   ⚠ This reads textual order in one statement sequence, which here IS the evaluation order — it is
   not the kind of claim #R505 warns about (a source check cannot see which BRANCH runs). */
/* spelling kept: browser script (js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R766 ① the carried strip is lifted out before the root that holds it is discarded', () => {
  const discard = mapUi.indexOf("old.replaceWith(root)");
  assert.ok(discard > 0, 'buildTiles still replaces the tile root');
  const before = mapUi.slice(0, discard);
  const rescue = before.lastIndexOf("querySelector('#layer-tools')");
  assert.ok(rescue > 0,
    'the strip is looked for before the root is replaced — without this the carried node is detached');
  /* and the rescue must belong to THIS replacement, not to something far above it */
  assert.ok(discard - rescue < 600,
    'the rescue sits with the replacement it protects, not several blocks above it');
  /* it is parked somewhere invisible, never in document.body where it would be drawn on the map */
  const near = mapUi.slice(rescue, discard);
  assert.match(near, /getElementById\('layer-dropdown'\)/,
    'the rescued strip is parked in the classic dropdown (hidden), not in document.body');
});

/* ② The two surfaces over the same commands must agree by COMPUTATION. #R242→#R243 and
   #R666→#R670 each answered this instruction by naming one more id, and naming ids is what made
   the third round necessary (`.agents/rules/no-ad-hoc-hardcoding.md` §1). So the overlap is read
   off `data-os-act` (on the button) and `data-act` (on the row) at run time. */
/* spelling kept: browser script (js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R766 ② the twin-dedupe is computed from declarations, not from a written pairing of ids', () => {
  assert.match(mapUi, /querySelectorAll\('\.lst-toolrow\[data-act\]'\)/,
    'the rows are asked which command they press');
  assert.match(mapUi, /querySelectorAll\('\[data-os-act\]'\)/,
    'the strip buttons are asked which command they press');
  /* the failure this guards: a pairing written as a literal id-to-id map anywhere in the placement */
  const place = mapUi.slice(mapUi.indexOf('window._placeLayerTools'), mapUi.indexOf('window._placeLayerTools') + 1800);
  assert.ok(place.length > 200, 'the placement function is still here');
  assert.ok(!/btn-seismic-sim|btn-pandemic-sim|btn-gis-panel|btn-compare|btn-edu|lp-save/.test(place),
    'the placement names no button by id — it would rescue that one and leave the next one dark');
});

/* ③ A declaration that names a command nobody registers silences nothing, and it does so QUIETLY:
   the twin simply appears twice. So every `data-os-act` must match a tool row's own `id:`. */
/* spelling kept: browser script (js/map-ui.js, js/data-layers.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R766 ③ every data-os-act names a command the tile browser actually offers', () => {
  const declared = [...dataLayers.matchAll(/dataset\.osAct\s*=\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(declared.length > 0, 'the buttons that have a twin declare the command they press');
  const rowIds = new Set([...mapUi.matchAll(/\{\s*id:\s*'([a-zA-Z][\w.]*)'/g)].map((m) => m[1]));
  for (const act of declared) {
    assert.ok(rowIds.has(act),
      `${act} is declared on a button but no tool row offers it — the twin would be shown twice`);
  }
});

/* ④ The placement has to run after every path that can move or detach the strip. Naming the call
   sites is naming a list, so what is pinned is the WEAKER, honest fact: each of the three places
   that re-append or discard the strip is followed by a placement call. */
/* spelling kept: browser script (js/map-ui.js, js/data-layers.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R766 ④ the strip is re-placed after each rebuild that moves it', () => {
  assert.match(dataLayers, /_placeLayerTools/,
    'reorganizeLayerPanel re-appends the strip into the dropdown, so it must re-place it after');
  const calls = (mapUi.match(/window\._placeLayerTools&&window\._placeLayerTools\(\)/g) || []).length;
  assert.ok(calls >= 3,
    `the tile browser re-places the strip after a rebuild, an open and a close (found ${calls})`);
});
}

/* ═══════════════════════ #R408 · from r408-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  #R408 — 「起動したあと、誰も見ていないうちに済ませていた仕事」の回帰テスト
 * ----------------------------------------------------------------------------
 *  外部の監査が「スマホで遅い」の原因を6つ挙げた。実測して残ったのは、どれも**大きさ**ではなく
 *  **誰も頼んでいない仕事**だった。この回が塞いだのは4つで、4つとも「無かった」のではなく
 *  「**あるのに使われていなかった / 見ていなかった**」である:
 *
 *    · `js/runtime.js` の `every()`（＝hidden なタブでは動かない1本のタイマーホイール）は
 *      #R234 から在って、**呼び出し元が0件**だった。ファイル冒頭は「39本の `setInterval` を
 *      1本にする」と宣言しており、実際には js/ に生の `setInterval` が **43か所**あった。
 *      宣言と実体が食い違ったまま174ラウンド。#R394 の「走っていない機構を名乗る列」と同じ形。
 *    · `js/layer-previews.js` の `_openQueue` は canvas ペインタ **33件**を1回の同期 forEach で
 *      流し切る。パネルを一度も開かなくても起動直後に走る。`deadline.timeRemaining()` は
 *      このファイルに0件で、入力による中断もモバイル抑止も無い。
 *      ⚠ そして**自分の見積りが古びていた**——`:709` のコメントは取得量を「約950 KB」と言うが、
 *      それは #R193 当時の6枚ぶんで、実体は **28枚 / 4,051,978 B**（#R268/#R309 が22枚足した）。
 *      監査はこのコメントを孫引きして「950 KB」と報告した。**古いコメントは古い測定を配る。**
 *    · `js/tile-warm.js` の予測先読みは、発火**前**なら `clearTimeout` で潰れるが、発火**後**は
 *      止まらない（`AbortController` も世代カウンタも0件）。次の操作が始まっても、もう見ない
 *      場所のタイルを取り続ける。
 *    · `js/world-packs.js` の斜線カットは、キャッシュの鍵に**視野の矩形**（0.25度丸め）を
 *      持っていた。0.25度は指が動かすどんなパンより細かいので、**パンのたびに必ず外す**。
 *      外したあとに走るのは数千地物からの一覧・10度の格子・整列で、肝心の引き算だけが
 *      `cutMemo` で無料——そして #R344 の出力署名が「変わっていない」と結果を捨てる。
 *    · `src/main.js` の「プログラムが持つ全ファクトリの一覧」から **5件**が落ちていた
 *      （`worldPacks` / `facilities` / `insolation` / `space` / `aircraftPoints`）。
 *      一覧の目的は「消えた・改名されたファイルに、欠けるための場所を与える」ことなので、
 *      載っていない5件は改名しても起動ガードが黙る。#R280 の形。
 *
 *  だからここで検査するのは「今そうなっていること」ではなく、**戻したら赤くなること**である。
 *
 *    ① プレビューのキューが deadline で区切られ、入力で止まり、モバイルでは起動時に走らない
 *    ② js/ に生の `setInterval` が1つも無く、ホイールに**実際に呼び出し元がある**
 *    ③ 先読みが世代で打ち切られ、打ち切った URL を「頼んだ」と記憶しない
 *    ④ ファクトリの一覧が**導出で照合**される（手書きの完全性を信じない）
 *    ⑤ 斜線カットの鍵が視野の矩形ではなく「視野に入っている tier 0 の国の集合」である
 * ==========================================================================*/
{
const rd = read;

/* ── ① THE PREVIEW QUEUE IS SLICED, YIELDS TO THE READER, AND DOES NOT OPEN ITSELF ON A PHONE ──*/
/* spelling kept: browser script (js/layer-previews.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R408 ①a: canvas のキューが deadline で区切られ、1スライスで必ず1件は進む', () => {
  const s = rd('js/layer-previews.js');
  /* ⚠ 「無いこと」を主張するときは必ずコメントを剥がしてから見る。この検査は最初、旧コードを
     説明している散文（`_paintQ.splice(0).forEach(...)` と書いてある行）に当たって赤くなった。
     このリポジトリで検査が自分の散文に当たるのは13回目である。 */
  assert.ok(!/_paintQ\.splice\(0\)/.test(stripComments(s)),
    'キューを splice で全部取り出すと、その時点で「1回の同期 forEach」に戻る');
  assert.match(s, /const job=_paintQ\.shift\(\);/,
    'ジョブは前から1件ずつ取る — 届かなかったジョブは配列に残る当人である');
  assert.match(s, /dl\.timeRemaining\(\)>0/, 'idle の残り時間を見ている');
  assert.match(s, /const _SLICE_MS=\d+;/, '1スライスの予算が名前のある定数である');
  const slice = +/const _SLICE_MS=(\d+);/.exec(s)[1];
  assert.ok(slice >= 4 && slice <= 8, `1スライス ${slice} ms — 4〜8 ms の帯の外`);

  /* ⚠⚠⚠ 予算を「毎回」見ると、予算より長いジョブ（実測 statChoro 85 ms）で**1件も進まず**
     永久に再予約する。だから最初の1件は無条件に走る——停止性はここが担保している。 */
  assert.match(s, /while\(_paintQ\.length\)\{\s*if\(ran\)\{/,
    '予算判定は2件目から — 1スライスで必ず1件は減る');
  /* requestIdleCallback が無い環境でも同じ予算で区切る（黙って一気に流さない）。 */
  assert.match(s, /_drainH=setTimeout\(\(\)=>_paintSlice\(null\),\d+\)/,
    'rIC の無い環境は時計だけで同じ予算を守る');
});

/* spelling kept: browser script (js/layer-previews.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R408 ①b: 入力が来たら次のスライスを止め、静かになったら必ず再開する', () => {
  const s = rd('js/layer-previews.js');
  for (const ev of ['pointerdown', 'touchstart', 'wheel', 'keydown']) {
    assert.ok(s.includes(`'${ev}'`), `${ev} で中断する`);
  }
  assert.match(s, /_INPUT_OPT=\{passive:true,capture:true\}/,
    'リスナは passive かつ capture — 中断機構が指の動きを遅らせない');
  /* ⚠ 中断は「捨てる」ではない。取り消すのは予約だけで、キューには触らない。 */
  assert.match(s, /function _cancelDrain\(\)\{[^}]*_drainPend=false;/, '取り消すのは予約だけ');
  assert.ok(!/_cancelDrain[\s\S]{0,200}_paintQ\s*=\s*\[\]/.test(s), '中断でキューを空にしていない');
  assert.match(s, /_quietH=setTimeout\(\(\)=>\{ _quietH=0; _drainHold=false; _scheduleDrain\(\); \},_INPUT_QUIET_MS\)/,
    '最後の入力から _INPUT_QUIET_MS で必ず再開する');
  /* 張りっぱなしにしない: キューが空になったら外す。 */
  assert.match(s, /if\(_paintQ\.length\) _scheduleDrain\(\); else _wireInput\(false\);/,
    'キューが空になった時点でリスナを外す');
});

/* spelling kept: browser script (js/layer-previews.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R408 ①c: 携帯では起動経路が門を開かない。ただしパネルを開けば全部出る', () => {
  const s = rd('js/layer-previews.js');
  assert.match(s, /const _bootMobile=\(\)=>\{[\s\S]{0,200}window\.IntMapDevice\.compact\(\)/,
    '携帯判定はアプリ自身の答え（js/ui-device.js の 768px 境界）と同じ');
  assert.match(s, /if\(_bootMobile\(\)\) return;[\s\S]{0,400}setTimeout\(go,6000\)/,
    '起動 IIFE は携帯で早期 return し、idle+400ms も 6 秒天井も張らない');
  /* ⚠⚠⚠ CONSTITUTION §0.3 — 機能を減らしていないこと。パネル経由の入口 kick() は無傷で、
     `_openQueue` は同じキューを同じ順で全部出す。ここが壊れたら「携帯だけプレビューが出ない」
     という退行になり、それは今回いちばんやってはいけない失敗である。 */
  assert.match(s, /function kick\(/, 'パネルから開く入口が残っている');
  const kick = s.slice(s.indexOf('function kick('), s.indexOf('function kick(') + 400);
  assert.match(kick, /_openQueue\(\)/, 'kick() は今までどおり門を開く');
  assert.ok(!/_bootMobile\(\)/.test(kick), 'kick() の側に携帯の抑止は入っていない');
});

/* spelling kept: browser script (js/layer-previews.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R408 ①d: 自分の見積りを書き直した — コメントの数が実測と一致する', () => {
  const s = rd('js/layer-previews.js');
  /* ⚠ #R193 のコメントは「~950 KB」のまま22枚ぶん古びており、外部の監査がそれを孫引きした。
     古いコメントは古い測定を配る。だから**コメントの数をディスクと突き合わせる**——「950 が
     書かれていないこと」ではない（旧値を「これは古い」と断って引用するのは正しい書き方で、
     それを禁じると次の書き手は経緯を消す）。効くのは下の2本の等式のほうである。 */
  assert.match(s, /4,572,977|4572977/, '自ホスト画像の実バイトが書かれている');
  const imgs = readdirSync(ROOT).filter((f) => /^preview_.*\.png$/.test(f));
  assert.equal(imgs.length, 35, `preview_*.png は ${imgs.length} 枚 — コメントの35枚と食い違う`);
  const bytes = imgs.reduce((n, f) => n + statSync(join(ROOT, f)).size, 0);
  assert.equal(bytes, 4572977, `実測 ${bytes} B — コメントの数と食い違う`);
});

/* コメントを外してから読む。⚠ この回の調査用スクリプトは最初これを忘れ、散文の中の
   「#R280's shape」のアポストロフィを引用符と読んで、存在しないファクトリを3件報告した。 */
function stripComments(src) { return codeOnly(src); }

/* ── ⑥ (#R408 追記) THE BOOT GATE IS ONLY SHUT IF EVERY WAY IN RESPECTS IT ────────────────────
   #R408 shut the boot path inside js/layer-previews.js and PRODUCTION STILL DOWNLOADED THE PICTURES:
   27–35 `preview_*.png` from 2.1 s on a 375×812 load, with the sheet measurably shut. The gate was
   never reached — `js/mobile-ui.js` mounts the tile grid at boot, and `mountInto` kicked the queue
   unconditionally. ⚠ THE SHAPE TO REMEMBER: a gate is only as shut as its least careful caller, and
   the caller that walked past it was in a DIFFERENT FILE from the one the round was about. */
/* spelling kept: browser script (js/mobile-ui.js, js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R408 追記 ⑥a: パネルを組み立てる経路は、画面に出ているときだけプレビューの門を開く', () => {
  const s = rd('js/map-ui.js');
  const i = s.indexOf('function mountInto(');
  assert.ok(i > 0, 'mountInto が居る');
  /* ⚠ 6000: 理由を書いたコメントが長いので、3000 では guard の手前（3,064 バイト目）で切れる。
     切れた検査は「その主張が無い」と言うので、最初に書いたときは実装が正しいのに赤くなった。 */
  const body = s.slice(i, i + 6000);
  assert.match(body, /if\(!_hostShown\(host\)\)\{ if\(i\+1<at\.length\) go\(i\+1\); return; \}/,
    'mountInto の kick は、格子を載せているシートが表示されていることを確かめる');
  assert.match(body, /window\.IntMapLayerPreviews\.kick\(host\)/, '確かめたうえで、今までどおり kick する');

  /* ⚠⚠⚠ 問いは「このシートは表示されているか」であって「この箱は視界にあるか」ではない。
     間違った答えを2つ試し、**2つ目は実測で機能を壊した**:
       · `display` 系（offsetParent / getClientRects().length / checkVisibility）は、閉じたシートにも
         「見えている」と答える——閉じたシートは非表示ではなく**折り返しの下に駐車**しているだけ
         （本番実測: 812px の視界に top 879px）。
       · **視界との交差**は、読者がいま開いたシートに「いいえ」と答える——タイル格子はスクロールする
         シートの中の長い一覧で、peek/half では上端が折り返しの下にある（実測: `m-sheet show` で
         host top 1026px / 視界 812px）。この判定だと**門が二度と開かず、携帯にサムネイルが1枚も
         出ない**——#R72→#R73 が作った当の退行である。 */
  const os = s.slice(s.indexOf('function _hostShown('), s.indexOf('function _hostShown(') + 700);
  assert.match(os, /closest\('\.m-sheet'\)/, '格子を載せているシートを見る');
  assert.match(os, /return sheet\.classList\.contains\('show'\)/, '表示されているかで判定する');
  assert.match(os, /if\(!sheet\) return true;/, 'シートの中に無いもの（デスクトップの側柱）は対象外');
  assert.ok(!/offsetParent|checkVisibility|getClientRects|getBoundingClientRect/.test(os),
    '閉じたシートを「見えている」と答える判定も、開いたシートを「見えていない」と答える判定も使わない');
  /* ⚠ 読めなければ true。プレビューが二度と出ないほうが、早く出るより重い欠陥である。 */
  assert.match(os, /\}catch\(_\)\{ return true; \}/, '判定できないときは今までどおり門を開く');
});

/* spelling kept: browser script (js/layer-previews.js, js/mobile-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R408 追記 ⑥b: 門は必ず開く——シートを開く経路が .show を付けてから組み立てを呼ぶ', () => {
  /* ⚠⚠⚠ これが逆順だと、⑥a のせいで**携帯でプレビューが二度と出ない**。#R72→#R73 が
     IntersectionObserver で同じ門を置き換えて、画面外で組まれた行が二度と見直されなかったのと
     同じ壊れ方で、`js/layer-previews.js` はその教訓を「門は必ず開く」と書いている。 */
  const m = rd('js/mobile-ui.js');
  const i = m.indexOf('function openSheet(');
  assert.ok(i > 0, 'openSheet が居る');
  const body = m.slice(i, m.indexOf('function closeSheet('));
  const show = body.indexOf("el.classList.add('show')");
  const mount = body.indexOf('mountInto(moMountLayers)');
  assert.ok(show > 0, 'openSheet はシートを表示する');
  assert.ok(mount > 0, 'openSheet はタイル格子を組み直す');
  assert.ok(show < mount,
    '.show を付ける前に mountInto を呼ぶと、⑥a の判定が偽になり携帯でプレビューが出なくなる');

  /* そして起動時の経路（applyLayout）は、シートを表示しないまま mountInto を呼ぶ——それでよい。
     グリッドは用意され、絵だけが読者の操作を待つ。 */
  const apply = m.slice(m.indexOf('function applyLayout('), m.indexOf('function applyLayout(') + 4000);
  assert.match(apply, /mountInto\(moMountLayers\)/, '起動時も格子は組む（行は用意されている）');
  assert.ok(!/classList\.add\('show'\)/.test(apply), '起動時にシートを表示していない');
});

/* spelling kept: browser script (js/map-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R408 追記 ⑥c: デスクトップの入口は今までどおり無条件に開く', () => {
  const s = rd('js/map-ui.js');
  const i = s.indexOf('function open(');
  assert.ok(i > 0, 'open() が居る');
  /* ⚠⚠ (#R483) 窓は「先頭から固定 2,500 バイト」だった。それは open() の本体ではなく
     **改行コードとコメント量に依存する近似**で、二重に脆い:
       ① 作業コピーは CRLF・CI は LF（`.gitattributes` は js/*.js に eol=lf を課していない）。
          この窓の中には改行が 21 行あるので、**同じ commit が手元で 2,512・CI で 2,491** になる。
       ② 中身が育つと黙って端が落ちる。#R483 が open() 内の1行に 20 バイト足しただけで
          LF の余白は 29 → 9 バイトになり、CRLF では 12 バイト**超過して赤くなった**
          ——しかも報告は「サイドバーを開いたら kick する」＝**製品が壊れたと名乗る**。
     ⇒ 次の関数宣言までを本体とする。改行コードに依らず、育っても切れず、
     しかも下の否定アサーションは **open() 全体**に効くようになる（2,500 バイト目以降に
     `_onScreen(sb)` が足されても捕まる）＝緩めたのではなく、正確にした。 */
  const j = s.indexOf('function close(', i);
  assert.ok(j > i, 'open() の次に close() が居る（本体の終端をそこで採る）');
  const body = s.slice(i, j);
  assert.match(body, /IntMapLayerPreviews\.kick\(sb\)/, 'サイドバーを開いたら kick する');
  assert.ok(!/_onScreen\(sb\)/.test(body),
    'デスクトップの入口に判定を足さない — 開いた直後は遷移中で矩形が定まらないことがあり、そこで拒むと絵が出なくなる');
});
}
