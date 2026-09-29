/* ============================================================================
 *  THE DOCK AND THE WINDOW MANAGER — js/window-manager.js
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. js/window-manager.js and the stylesheet are the page's
 *    DOM manager and CSS — a Node test has no layout to ask; the specs measure it on screen.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r238-checks.test.mjs (tests #13, #14, #15, #16 of 16) ═══
    R238 — the air that was still missing, the front that could only be a circle, the panel that
    read as three alternatives, and the floating things that now have somewhere to go.
    ⚠ EVERY TEST HERE WAS RUN AGAINST THE UNFIXED CODE FIRST (#R228's rule). A test that cannot fail
    is a comment with a runner attached. Where a check pins a RELATION rather than a value, it says
    so — #R237's chip constant is exactly what happens when a measurement of one browser is written
    into the source as if it were a fact about all of them. */
{
/* strip comments so a rule is never satisfied by prose ABOUT the rule — the trap that has now been
   hit nine times across #R208…#R237. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ── 8 · ④ the dock — every floating thing, and only the floating things ────────────────────────── */
test('R238 dock: membership is the window registry plus map-level legends', () => {
  const s = code(read('js/window-manager.js'));
  assert.match(s, /function\s+setDocked\s*\(on\)/, 'the mode exists');
  assert.match(s, /__winReg\.forEach/, 'every registered window is a member');
  /* ⚠ DIRECT CHILDREN ONLY. A descendant match pulled in the twelve lyrrow-* rows of the layer
     panel — dismantling a control rather than docking a legend. */
  assert.match(s, /const\s+DOCK_SEL\s*=\s*':scope > \[class\*="legend"\], :scope > \[id\*="legend"\]'/,
    'legends are matched as direct children of the map container');
  assert.doesNotMatch(s, /observe\(mc,\{childList:true,subtree:true\}\)/,
    'the observer must not walk the renderer\'s whole subtree');
});

test('R238 dock: what is moved is restored exactly, including the dragged geometry', () => {
  const s = code(read('js/window-manager.js'));
  assert.match(s, /__docked\.set\(el,\{\s*parent:el\.parentNode,\s*next:el\.nextSibling,\s*css:el\.getAttribute\('style'\)\|\|''\s*\}\)/,
    'the parent, the sibling AND the inline geometry are remembered');
  /* ⚠⚠ (#R239) THE RESTORE IS NARROWER NOW, AND THAT IS THE FIX, NOT A REGRESSION. #R238 docked a
     panel by deleting its whole inline style and undocked it by writing the stored string back.
     Both halves were wrong once membership came to mean «switched on»: the strip took the
     `display:flex` a legend is opened with (its opacity slider was then cropped by
     `display:block !important`), and the restore put an old `display` back — so switching a docked
     layer OFF undocked it, revived it, and the observer docked it again. Only the GEOMETRY moves in
     either direction now. The claim this test makes — that what was moved comes back exactly where
     it was — is unchanged, and `_restoreGeom` reads it out of the same stored string. */
  assert.match(s, /function _restoreGeom\(el,css\)/, 'and the geometry is put back');
  assert.match(s, /_restoreGeom\(el,s\.css\)/, 'from that stored string');
  assert.doesNotMatch(s, /el\.setAttribute\('style',\s*s\.css\)/,
    'but NOT the whole style — that resurrected panels the reader had switched off');
  assert.match(s, /el\.classList\.remove\('im-docked'\)/, 'the flattening class comes off');
});

test('R238 dock: it is a saved setting, off by default, with a tab that only exists when it is on', () => {
  const app = code(read('js/app-body.js'));
  assert.match(app, /window\.imDockPanels\s*=\s*'off'/, 'the default is off');
  assert.match(app, /if\(s\.dockPanels==='on'\|\|s\.dockPanels==='off'\)\s*window\.imDockPanels=s\.dockPanels/, 'it is restored');
  assert.match(app, /dockPanels:window\.imDockPanels/, 'and it is saved');
  /* ⚠ the glue is in js/window-manager.js, NOT in app-body: tests/r168 #8 budgets the app shell at
     8,200 lines and this feature put it at 8,232, so the feature moved out rather than the ceiling
     moving up. app-body keeps only the one call that hands over what its closure owns. */
  assert.match(app, /IM_WINMGR\.wireDock\(\{/, 'app-body hands the glue over to the window manager');
  const wm = code(read('js/window-manager.js'));
  assert.match(wm, /b\.style\.display=on\?'':'none'/, 'the tab is shown only while the mode is on');
  /* leaving the mode while the dock tab is open must not strand the reader on a tab that is gone */
  assert.match(wm, /if\(!on&&ops\.mode&&ops\.mode\(\)==='docked'\)/, 'switching it off leaves the dock tab');
  const html = read('index.html');
  assert.match(html, /id="btn-docked"[^>]*style="display:none;"/, 'the tab starts hidden');
  assert.match(html, /id="docked-feed"/, 'the dock has a container');
  assert.match(html, /id="setting-dock-panels"/, 'and the setting is in the dialog');
});

/* ── 9 · the strings this round added exist in every language ────────────────────────────────────
   #R231/#R232/#R236/#R237 each found a shape the audit could not see. This checks the KEYS added
   this round, in the table each language actually reads. */
test('R238 i18n: the dock strings are present in all nine languages', () => {
  /* ⚠ (#R239) THE CLAIM IS UNCHANGED; THE PLACE IT IS MADE MOVED. These five keys used to live in
     js/i18n-late.js as `Object.assign(i18n.en,{…})` / `Object.assign(i18n.jp,{…})`, and this test
     read that file for en and jp. #R239 moved every keyed string into js/locales/ui.<code>.js —
     because that file shape is five languages by construction, and fr/ko/zh were silently falling
     back to English for ~170 keys declared that way (scripts/i18n-keyed-audit.mjs). So the loop is
     now nine locale files, and the en/jp occurrence-count check is gone with the shared file that
     made it necessary. #R203's rule: move the assertion, say why. */
  const keys = ['tabDocked', 'lblDockPanels', 'dockPanelsOff', 'dockPanelsOn', 'dockPanelsHint'];
  for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
    const f = 'js/locales/ui.' + c + '.js';
    const s = read(f);
    for (const k of keys) assert.ok(s.indexOf(k + ':') >= 0, c + ' is missing ' + k + ' (' + f + ')');
  }
});
}

/* ═══ from tests/r240-checks.test.mjs (tests #6 of 9) ═══
    IntMap · R240 source-level checks
    Every assertion below is written against the MECHANISM that was wrong, not against a value this
    round happened to pick (#R203's rule). Each one fails on the tree as it stood before this round. */
{
const R = read;
/* comments out, so a claim in prose can never satisfy a check about code (#R166) */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ══ ④ THE DOCK ════════════════════════════════════════════════════════════════════════════════ */
test('R240 ④ a docked panel expands, arrives open, and runs edge to edge on a phone', () => {
  const css = R('css/intmap.css');
  assert.match(css, /\.im-docked \[class\$="-scroll"\]/, 'every inner scroller, not two named ones');
  assert.match(css, /\.im-docked \[class\$="-body"\]/);
  assert.match(css, /#docked-feed\{ margin-left:-16px; margin-right:-16px;/, 'the feed cancels the sheet padding');
  /* ⚠ (#R241) THE RAIL IS BACK, AND IT IS THE HALF OF THIS TEST THE READER OVERRULED.
     「サイドバーのパネル内モバイル版で、左に合ったスクロールバーが消えているから、つけて。」
     Cancelling the sheet's 16 px inset (the line above) is what stopped the rail being drawn over a
     legend; deleting the rail as well was a second change with no report behind it. What this test
     keeps asserting is the part that was asked for — the feed runs edge to edge — and tests/r241 ③
     pins the rail's return. */
  assert.match(css, /#docked-feed::-webkit-scrollbar\{ width:10px/, 'and the column still has a rail');
  assert.match(css, /--sheet-h:86dvh/, 'the sheet is shorter, and its height has one owner');
  assert.match(css, /height:var\(--sheet-h\)/);
  assert.match(css, /translateY\(var\(--sheet-ty,calc\(var\(--sheet-h\) - 196px\)\)\)/, 'the default detent follows it');

  const dl = code(R('js/data-layers.js'));
  assert.match(dl, /const inDock=\(window\.imDockPanels==='on'\)/, 'the phone auto-collapse knows about the dock');
  assert.match(dl, /window\._legendExpand=function\(el\)/, 'and the dock can open one');
  assert.match(dl, /!el\.classList\.contains\('im-docked'\) && !el\.classList\.contains\('legend-collapsed'\)/,
    'tapping the map does not collapse the sidebar column');
  assert.match(R('js/data-layers.js'), /\.koppen-legend:not\(\.im-docked\)\{ width:min\(66vw,252px\)/,
    'the run-time phone width applies over the map only');
  const wm = code(R('js/window-manager.js'));
  assert.match(wm, /window\._legendExpand&&window\._legendExpand\(el\)/, 'docking opens a collapsed legend');
});
}

/* ═══ from tests/r241-checks.test.mjs (tests #6 of 11) ═══
    R241 — six reports, and the one that has now been sent five times
    ① 「簡体、繁体、フランス語、韓国語、ドイツ語、ロシア語、スペイン語について、すべての面において
       対応が完璧かどうか点検し、未了点があれば修正して。いつまでたっても言語対応の漏れが見つかる
       ことは許されない。」
    ② 「地震シミュレータの地震波伝播は断層破壊を考慮していない。震央からほぼ同心円状に広がるだけ。」
       → 「いや破壊速度 Vr ≤ 波速 Vだから同心円でオッケーですってどんな理屈やねんアホ」
    ③ 「サイドバーのパネル内モバイル版で、左に合ったスクロールバーが消えているから、つけて。」
    ④ 「MapLibreで大気にもやがかかりすぎ。地図をちゃんと見せろ。それに、ある程度までズームしたら
       いきなりもやが消えるものさらに不自然。」＋「衛生写真ではあっても、標準マップでは大気はなし」
    ⑤ 「各地の表内のJMAの背景の四角は、JMAで大きさをそろえるように。MMIはまた別の幅。」
       → 「左右に大きすぎに見えただけ。（テキストがとっている幅の割に）」
    ⑥ 「地震シミュレータの地点表が左右方向にスクロールできなくなっている。」

    ⚠ Every assertion here is written against a MECHANISM, and comments are stripped before the
    source is matched (`code()`), because this file quotes the instructions it is testing —
    [[intmap-recurring-lessons]] E, eight rounds running. */
{
const R = read;

/* ══ ③ THE MOBILE COLUMN GETS ITS RAIL BACK ════════════════════════════════════════════════════ */

test('R241 ③ the docked column on a phone has a scrollbar again', () => {
  /* ⚠ the stylesheet is committed with CRLF; normalise before slicing on a newline, or this test
     silently reads from index −1 (i.e. the WHOLE file) and passes on any rule anywhere. */
  const css = R('css/intmap.css').replace(/\r\n/g, '\n');
  const i = css.indexOf('@media(max-width:768px){\n  #docked-feed{');
  assert.ok(i > 0, 'the phone block for the dock was not found');
  const blk = css.slice(i);
  const head = blk.slice(0, 900);
  assert.match(head, /scrollbar-width:thin/, 'the rail is drawn');
  assert.doesNotMatch(head, /scrollbar-width:none/, '#R240 deleted it; it is back');
  assert.match(head, /#docked-feed::-webkit-scrollbar\{ width:10px; \}/, 'and it has a width');
  assert.match(head, /#docked-feed::-webkit-scrollbar-thumb\{ background:rgba\(140,142,150,0\.5\)/,
    '⚠ a phone has no hover, so the thumb cannot be the auto-hiding one');
  /* the half of #R240 that WAS asked for stays: the column still runs edge to edge */
  assert.match(head, /margin-left:-16px; margin-right:-16px/, 'the feed still cancels the sheet inset');
});
}

/* ═══ from tests/r242-checks.test.mjs (tests #1, #2, #3, #4, #5 of 20) ═══
    IntMap · #R242 — source-level contracts for this round
    Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
    which is the only thing that makes a green suite mean anything (#R228).
    Comments are stripped before matching wherever a test looks for a fragment that this file's own
    prose could contain ([[intmap-recurring-lessons]] E, eight rounds running). */
{
/* strip block and line comments — a test must match CODE, never a note quoting the instruction */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ① Atlas is never docked, and it says so where the panel is born ──────────────────────────── */
test('R242 ① the Atlas panel opts out of the dock at creation, not at settings time', () => {
  const c = code(read('js/atlas-console.js'));
  const ensure = c.slice(c.indexOf("panel.id='atlas-panel'"), c.indexOf("panel.id='atlas-panel'") + 400);
  assert.ok(/dataset\.nodock\s*=\s*'1'/.test(ensure),
    'js/atlas-console.js must set data-nodock where #atlas-panel is created — applyDockMode runs at boot, before the lazy panel exists');
  /* …and window-manager must NOT be the one that writes it, or there are two owners again */
  assert.ok(!/getElementById\('atlas-panel'\)[^\n]*nodock/.test(code(read('js/window-manager.js'))),
    'js/window-manager.js must not write the Atlas opt-out: the panel does, at creation');
});

test('R242 ① the dock stylesheet no longer caters for a docked Atlas', () => {
  const css = read('css/intmap.css');
  assert.ok(!/\.im-docked\s+\.atl-chat/.test(css) && !/\.im-docked\s+\.atl-ex/.test(css),
    '.im-docked .atl-chat / .atl-ex only existed because Atlas was being docked — both must be gone');
});

/* ── ② the dock's empty line is a readout of the count ────────────────────────────────────────── */
test('R242 ② the "legends will appear here" line follows the docked count in both directions', () => {
  const wm = code(read('js/window-manager.js'));
  for (const fn of ['_dockOne', '_undockOne', 'setDocked', 'dockRefresh']) {
    const i = wm.indexOf('function ' + fn);
    assert.ok(i > 0, fn + ' must exist');
    assert.ok(wm.slice(i, i + 1400).includes('_dockEmptySync()'),
      fn + ' must re-sync the empty line — otherwise closing the last panel leaves a blank column');
  }
  assert.ok(/window\._dockEmptyRender\s*=/.test(code(read('js/news-ui.js'))),
    'js/news-ui.js owns the WORDS (it knows the language) and must publish the renderer');
});

test('R242 ② a panel that arrives on its own brings its tab forward', () => {
  const wm = code(read('js/window-manager.js'));
  assert.ok(/function _reveal\(/.test(wm), '_reveal must exist');
  assert.ok(/if\(!__dockBulk\)\s*_reveal\(el\)/.test(wm),
    'only a panel that docks OUTSIDE a bulk sweep may pull the tab forward');
  assert.ok(/OS\.exec\('tab\.docked'/.test(wm), 'the tab is opened through the OS action, not by poking currentMode');
});

/* ── ③ the phone's rail gets its own 10 px ────────────────────────────────────────────────────── */
test('R242 ③ #docked-feed reserves the scrollbar width on a phone', () => {
  /* ⚠ the sheet is CRLF: slice by INDEX, never by a literal containing \n — #R241 shipped an
     always-green test that way — and assert on the rule inside the phone block only. */
  const css = read('css/intmap.css').replace(/\r/g, '');
  /* the phone rule is the ONE `#docked-feed{…}` that cancels the sheet's inset — matching on that
     pair identifies it without depending on which @media block happens to come first in the file. */
  const rules = [...css.matchAll(/#docked-feed\{([^}]*)\}/g)].map((m) => m[1]);
  const phone = rules.filter((r) => /margin-left:-16px/.test(r));
  assert.equal(phone.length, 1, 'exactly one full-bleed #docked-feed rule (the phone one)');
  assert.ok(/padding-right:10px/.test(phone[0]),
    'the overlay scrollbar is painted inside the feed; without a gutter it lands on the panel');
});
}

/* ═══ from tests/r243-checks.test.mjs (tests #3, #4, #5, #6 of 17) ═══
    IntMap · #R243 — source-level contracts for this round
    Every test here fails on the code as it was BEFORE the change it guards (checked one at a time),
    which is the only thing that makes a green suite mean anything (#R228).
    Comments are stripped before matching wherever a test looks for a fragment that this file's own
    prose could contain ([[intmap-recurring-lessons]] E, nine rounds running). */
{
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ② a docked panel is placed by the column, not by the rule that floats it over a phone's map ─ */
test('R243 ② the dock geometry reset is scoped to #docked-feed, so it outranks the float rules', () => {
  const css = read('css/intmap.css');
  assert.ok(/#docked-feed \.im-docked\{\s*\n?\s*position:relative !important/.test(css)
    || /#docked-feed \.im-docked\{[\s\S]{0,80}position:relative !important/.test(css),
    'the geometry reset must be `#docked-feed .im-docked` (1,1,0) — bare `.im-docked` (0,1,0) loses to '
    + '`.koppen-legend:not([data-dragged])` (0,2,0), which is where the 64 px / 6 px offsets came from');
  /* …and the rule it has to beat is still there, unchanged: this is a specificity fix, not a deletion */
  assert.ok(/\.koppen-legend:not\(\[data-dragged\]\)[^{]*\{[^}]*left:6px !important/.test(css),
    'the phone float placement must be untouched — it is correct for a legend that floats over the map');
  /* every geometry-adjacent .im-docked rule carries the id, or the next class rule wins again */
  const bare = (css.match(/(^|\n)\s*\.im-docked[^\n]*\{/g) || []).filter((r) => !/#docked-feed/.test(r));
  assert.equal(bare.length, 0, 'no bare `.im-docked{…}` rule may remain:\n' + bare.join('\n'));
});

/* ── ③ a panel that appears has to be somewhere the reader is looking ─────────────────────────── */
test('R243 ③ revealing a docked panel opens the sidebar / raises the sheet, tab state aside', () => {
  const wm = code(read('js/window-manager.js'));
  const rev = wm.slice(wm.indexOf('function _reveal('), wm.indexOf('function _reveal(') + 1200);
  assert.ok(/ui\.sidebar\.open/.test(rev), '_reveal must open a collapsed desktop sidebar');
  assert.ok(/__setDetent\('half'\)/.test(rev), "_reveal must raise a phone's sheet to 'half'");
  /* both are unconditional now: «is the right tab up» and «is the column visible» are different questions */
  assert.ok(!/!already&&window\.matchMedia/.test(rev),
    'the detent must not be gated on `already` — the reported case is the Panels tab already selected with the sheet at peek');
  assert.ok(/IntMapOS\.register\('ui\.sidebar\.open'/.test(code(read('js/app-body.js'))),
    'the sidebar open must be an OS action so it goes through applySidebarStyle + the resize event + the session save');
});

test('R243 ③ the reveal arms on the first input, so a restored session does not scroll itself', () => {
  const wm = code(read('js/window-manager.js'));
  assert.ok(/__revealArmed/.test(wm) && /pointerdown[\s\S]{0,80}once:true/.test(wm),
    'legends created while a saved session restores are not popups somebody opened');
});

/* ── ④ the empty line is derived from the column, not from a Map that can go stale ─────────────── */
test('R243 ④ the docked count is read off #docked-feed and the feed is watched', () => {
  const wm = code(read('js/window-manager.js'));
  const sync = wm.slice(wm.indexOf('function _dockEmptySync('), wm.indexOf('function _dockEmptySync(') + 500);
  assert.ok(/querySelectorAll\(':scope > \.im-docked'\)/.test(sync),
    'the count must come from the DOM — a panel removed while docked leaves `__docked` stale and the line never returns');
  assert.ok(/_feedWatch/.test(wm) && /observe\(host,\{childList:true\}\)/.test(wm),
    '#docked-feed childList must be observed so a removal by any route puts the line back');
});
}

/* ═══ from tests/r244-checks.test.mjs (tests #12 of 15) ═══
    #R244 — source-level checks
    Every one of these was written against the UNFIXED source first and observed to FAIL (#R228's
    standing rule). Each names the defect it pins rather than the code that fixes it. */
{
/* comments stripped, so a note that QUOTES a pattern cannot satisfy or trip a check
   ([[intmap-recurring-lessons]] E — this has cost eight rounds) */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ⑫ 「全凡例はパネルにいくように。（パネル設定時）」 — a second, independent path into the same sweep,
   so the column cannot depend on one MutationObserver having been armed at the right moment. */
test('r244 ⑫ a layer toggle re-runs the dock sweep', () => {
  const src = code('js/window-manager.js');
  assert.ok(/dl-\|gx-\|eco-dl-/.test(src), 'the layer-checkbox ids the listener watches');
  assert.ok(/setTimeout\(\(\)=>\{ try\{ dockRefresh\(\); \}catch\(_\)\{\} \},260\)/.test(src), 'and it calls the ONE sweep');
});
}

/* ═══ from tests/r245-checks.test.mjs (tests #5 of 10) ═══
    IntMap · #R245 — source-level checks
    Seven instructions. Each test below is written against the ROOT CAUSE that was measured, not
    against the symptom, so it fails on the shipped code that produced the report.

    ⚠ Every test strips comments before matching (`code()`), because this file's own subject matter
    quotes the strings it forbids — [[intmap-recurring-lessons]] E, eight rounds running. */
{
/* comments out, string literals kept — the same helper every round since #R208 */
const code = (p) => {
  const src = read(p);
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = (e < 0 ? src.length : e + 2); continue; }
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); i = (e < 0 ? src.length : e); continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; let j = i + 1;
      while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
};

/* ── ⑤ the dock watch cannot go stale ───────────────────────────────────────────────────────────
   「ケッペンの気候区分レイヤの凡例はパネルにいかない。全凡例はパネルにいくように。」 The flag saying
   «this element is already watched» lived ON THE ELEMENT and was cleared only for `__winReg`, which
   never holds a legend — so after mode off→on the new observer watched nothing. The invariant is
   «watched by THIS observer», so the set must live and die with it. */
test('r245 ⑤ the dock observer owns its own watched set', () => {
  const src = code('js/window-manager.js');
  assert.ok(!/__imDockWatched/.test(src), 'no per-element flag that can outlive the observer');
  assert.ok(/let __dockWatched=null;/.test(src), 'the set is a variable beside the observer');
  assert.ok(/__dockWatched=new WeakSet\(\);/.test(src), '…created with it');
  assert.ok(/__dockObs=null; \} __dockWatched=null;/.test(src), '…and thrown away with it');
});
}

/* ═══ from tests/r255-checks.test.mjs (tests #4 of 13) ═══
    #R255 — source-level checks
    Each test pins the CAUSE this round measured, not the symptom, so the next
    round cannot re-introduce the same shape somewhere else and pass.

   (layer-manifest) which layers exist, and their facts */
{
/* comments carry the reasoning and quote the very strings under test — strip them first */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/* ── ④ front-most follows any operation, and never marks the map shell ───────────────────────── */
test('#R255 ④ the raise fires on wheel and focus too, and cannot lift the map container', () => {
  const mu = code(read('js/map-ui.js'));
  assert.match(mu, /addEventListener\('wheel'/, 'scrolling inside a panel does not raise it');
  assert.match(mu, /addEventListener\('focusin'/, 'typing inside a panel does not raise it');
  assert.match(mu, /_NOT_PANEL=/, 'the map shell is not excluded from panelOf');
  ['#map', '#map-container', '.operation-room'].forEach((sel) =>
    assert.ok(new RegExp(sel.replace('.', '\\.').replace('#', '#')).test(mu.match(/_NOT_PANEL='([^']*)'/)[1]),
      `${sel} is a positioned ancestor and would be marked .im-front — lifting the whole map over the sidebar`));
});
}

/* ═══ from tests/r258-checks.test.mjs (tests #11, #12 of 16) ═══
    #R258 — source-level checks
    Each test below pins ONE defect this round measured, in the form the
    measurement took. They are source assertions (no browser), which is what the
    `tests/r*-checks` family is for: the browser specs cost minutes, these cost
    milliseconds, and a defect that has a shape in the source belongs here. */
{

/* ── ⑧ who is in front ─────────────────────────────────────────────────────────────────────── */
test('R258 ⑧: the front-most band covers every panel, including the compare window', () => {
  const cmp = read('js/compare.js');
  assert.match(cmp, /#compare-window\{position:fixed;[^}]*z-index:2200;/,
    'the compare window is in the card band, not above the sidebars at 4000');
  const ui = read('js/map-ui.js');
  assert.match(ui, /document\.addEventListener\('keydown',\(e\)=>\{ try\{ act\(e\.target,false\); \}catch\(_\)\{\} \},true\);/,
    'typing counts as an operation');
  assert.match(ui, /if\(\(p==='relative'\|\|p==='sticky'\)&&z&&z!=='auto'\) return n;/,
    'a panel positioned relative WITH a z-index is a panel, not a reason to demote');
  assert.ok(ui.includes(".sidebar,#sidebar,#layer-sidebar-r'"),
    'the two sidebars are the shell this band is measured against, never a panel inside it');
});
/* ⚠⚠⚠ the one that actually defeated three rounds of the `.im-front` machinery: #R47's window
   manager wrote an INLINE z-index from 4300 up onto EVERY managed floating window on pointerdown.
   `.im-front` (!important) beat it while it was set, and the moment the reader clicked the sidebar
   the class came off and the inline 4301 put the window back in front — permanently. MEASURED:
   `#compare-window` computed 4301 against the sidebar's 2600 after a pointerdown on the sidebar;
   after this change it computes 2201/2202 there and 2650 while it is the panel in use. */
test('R258 ⑧b: click-to-front orders the windows inside the band, not above it', () => {
  const wm = read('js/window-manager.js');
  assert.match(wm, /const WIN_Z_BASE=2200, WIN_Z_CAP=2599;/,
    'the window stack starts in the card band and stops below the sidebar');
  assert.doesNotMatch(wm, /let __winZ=4300;/, 'the 4300 base is back — it sits above both sidebars');
  assert.match(wm, /__winZ=Math\.min\(WIN_Z_CAP,Math\.max\(__winZ,mx\)\+1\)/,
    'the counter is capped by the band, not by 5999');
});
}
