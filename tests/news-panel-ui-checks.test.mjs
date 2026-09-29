/* ============================================================================
 *  IntMap · side panels — the dock, the search boxes, the object list
 * ----------------------------------------------------------------------------
 *  パネルに収めた凡例（js/window-manager.js の dock）、検索欄のスクロール、オブジェクト一覧の開閉。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { generatedStampProblems } from './helpers/build-stamp.mjs';
import { npmTestRunsScript } from './helpers/ci-reach.mjs';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { readLF } from '../scripts/eol.mjs';

/* ════════ #R239 — from tests/r239-checks.test.mjs (5 of its 16 tests) ════════ */
{
/* ============================================================================
 *  #R239 — the translation gate, the dock, and the rupture's trailing front
 * ----------------------------------------------------------------------------
 *  ⚠ EVERY TEST HERE WAS RUN AGAINST THE UNFIXED CODE FIRST (#R228's rule). The three that do NOT
 *  fail on the old tree are marked where they are, and each is a proof rather than a diff: they
 *  state a property the new code has to keep, not a line it happens to contain.
 * ==========================================================================*/
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(join(ROOT, p), 'utf8');
/* (#R208/#R215) comments quote the instruction, and the instruction contains the very strings these
   tests look for — so every syntax check reads the file with its comments stripped. */
const code = (p) => R(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const run = (f, ...a) => execFileSync(process.execPath, [join(ROOT, 'scripts', f), ...a],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/* ══ ② THE DOCK ═════════════════════════════════════════════════════════════════════════════════
   「パネル内のポップアップや凡例は×可能だがドラッグ可能にはしないように。」
   「タップしたらどんどん消えていく現象ふざけるな。」
   「勝手に透明度選択とかの凡例の機能削除してんじゃねーよボケ。」
   「パネルに入れるのは現在オンしてるレイヤーや機能の凡例やポップアップのみです。」 */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('#R239 ② a docked panel refuses BOTH drag implementations', () => {
  const wm = code('js/window-manager.js');
  /* #R47's drag, and #R47's edge-resize */
  const drags = wm.match(/isDocked\(panel\)/g) || [];
  assert.ok(drags.length >= 3, `makeDraggable (mouse + touch) and addEdgeResize all ask (${drags.length})`);
  /* ⚠ and the OTHER one: js/data-layers.js has had its own delegated legend drag since #R19 */
  const dl = code('js/data-layers.js');
  assert.match(dl, /classList\.contains\('im-docked'\)/,
    'the legends’ own drag (js/data-layers.js wireDrag) refuses a docked legend too');
});

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('#R239 ② docking strips the geometry and keeps everything the panel says about itself', () => {
  const wm = code('js/window-manager.js');
  const dockOne = wm.slice(wm.indexOf('function _dockOne'), wm.indexOf('function _restoreGeom'));
  assert.doesNotMatch(dockOne, /removeAttribute\('style'\)/,
    'the whole inline style is no longer thrown away (that is what cropped the opacity slider)');
  assert.match(dockOne, /_flatten\(el\)/, 'only the geometry is removed');
  assert.match(wm, /const GEOM\s*=\s*\[/, 'a named list of geometry properties is removed instead');
  for (const p of ['position', 'left', 'top', 'width', 'height', 'transform', 'z-index'])
    assert.ok(wm.includes(`'${p}'`), `${p} is stripped`);
  assert.ok(!/GEOM\s*=\s*\[[^\]]*'display'/.test(wm), 'display is NOT stripped — the layer switch writes it');
  /* and the stylesheet no longer forces one either */
  const css = R('css/intmap.css');
  const block = css.slice(css.indexOf('.im-docked{'), css.indexOf('#docked-feed .dock-empty'));
  assert.ok(!/display:\s*block\s*!important/.test(block), '.im-docked does not force display:block');
});

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('#R239 ② undocking is the exact inverse of docking (or the panel resurrects itself)', () => {
  const wm = code('js/window-manager.js');
  assert.match(wm, /function _restoreGeom/, 'only the geometry is put back');
  assert.match(wm, /_restoreGeom\(el,\s*s\.css\)/, 'from the stored string');
  assert.doesNotMatch(wm, /setAttribute\('style',\s*s\.css\)/,
    'the whole stored style is NOT re-applied — that re-showed a panel the reader had switched off');
});

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('#R239 ② membership is «switched on», in both directions', () => {
  const wm = code('js/window-manager.js');
  assert.match(wm, /function _isOn\(el\)/, 'there is a definition of on');
  assert.match(wm, /el\.style\s*&&\s*el\.style\.display/, 'and it reads the owner’s own inline display');
  assert.match(wm, /_dockables\(\)\{[\s\S]*_isOn\(el\)/, 'only switched-on things are collected');
  assert.match(wm, /if\(!_isOn\(el\)\)\s*_undockOne\(el\)/, 'and switching one off takes it back out');
  assert.match(wm, /attributeFilter:\['style','class','hidden'\]/, 'watched by attribute, not by polling');
  /* ⚠⚠ (#R239b) MEASURED ON PRODUCTION: a legend that was already switched on when the mode was
     turned on stayed in the tab after its layer was switched off, because `setDocked(true)` docked
     everything first and armed the observer second — by then those elements were in #docked-feed,
     where neither `mc.querySelectorAll(DOCK_SEL)` nor `__winReg` finds them. The watch therefore
     happens in `_dockOne`, which is the one place that sees every docked element, and the observer
     is armed before the first pass. */
  assert.match(wm, /_watchEl\(el\);[\s\S]{0,8}el\.classList\.add\('im-docked'\)/,
    'every docked element is watched, at the moment it is docked');
  assert.match(wm, /if\(on\) _dockWatch\(true\);[\s\S]{0,8}if\(on\)\{ _dockables\(\)\.forEach\(_dockOne\)/,
    'and the observer exists before the first pass runs');
  assert.match(wm, /__attrBusy/, 'and the observer does not react to its own writes');
});

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('#R239 ② the ✕ stays, the drag affordance does not', () => {
  const css = R('css/intmap.css');
  assert.match(css, /\.im-docked \.kl-drag[^{]*\{[^}]*display:none/, 'the ⋮⋮ grip is hidden when docked');
  assert.ok(!/\.im-docked[^{]*\.layer-popup-x[^{]*\{[^}]*display:\s*none/.test(css), 'the ✕ is not');
});
}

/* ════════ #R290 — from tests/r290-checks.test.mjs (1 of its 16 tests) ════════ */
{
/* ============================================================================
 *  IntMap · #R290 source checks — the two silences, the weight, and the clocks
 * ----------------------------------------------------------------------------
 *  Fifteen instructions arrived in one message. The ones with a shape a source-level check can
 *  hold are here; the rest were measured in a real browser while the round was being written and
 *  the numbers are recorded in DEV-NOTES.md.
 *
 *  ⚠ SOURCES ARE READ THROUGH scripts/eol.mjs — line endings belong to the CHECKOUT, not to the
 *  file (#R283). A check that spelt a line break literally would be red on one platform and green
 *  on the other, for a reason that is not its subject.
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY «X IS GONE» SEARCH. This round's own notes quote the exact
 *  shapes it removed — `openClock`, `unitsOf(c)?2:1`, `fillRect(0,0,S,S)`, `C.on(_followClock)` —
 *  so a check reading the raw file would fail on the sentence explaining the fix. That mistake has
 *  been made sixteen times in this project ([[intmap-recurring-lessons]]).
 * ==========================================================================*/
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(resolve(ROOT, p));
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));

/* ── ⑯ 「レイヤー検索欄に入力があったり変更があったら、最上部の位置に自動的に」 ──────────────── */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R290 ⑯ both search boxes scroll themselves to the top on input', () => {
  const ui = codeOnly(read('js/map-ui.js'));
  assert.equal((ui.match(/window\.IntMapSearchToTop=function\(el\)\{/g) || []).length, 1,
    'ONE definition — #R239’s lesson is a defect fixed in one of two copies');
  assert.match(ui, /if\(\/\(auto\|scroll\)\/\.test\(cs\.overflowY\)&&sc\.scrollHeight>sc\.clientHeight\+2\) break;/,
    'it walks up to the nearest ancestor that actually scrolls');
  assert.match(ui, /sc\.scrollTo\(\{top:top,behavior:'smooth'\}\)/);
  /* ⚠ it scrolls a PANEL. The camera is untouched — CONSTITUTION §3. */
  const fn = ui.slice(ui.indexOf('window.IntMapSearchToTop=function'), ui.indexOf('window.IntMapPlaceClear='));
  assert.ok(!/camera|flyTo|easeTo|jumpTo/.test(fn), 'and it never touches the map');
  assert.equal((ui.match(/window\.IntMapSearchToTop\(ev\.target\.closest\('\.lsr-search'\)\|\|ev\.target\)/g) || []).length, 2,
    'both tile-grid search boxes call it');
  /* ⚠ (#R296) THERE IS ONLY ONE LAYER-SEARCH BOX NOW — 「レイヤー選択欄はclassic dropdownを完全削除」.
     #R239's lesson (a defect fixed in one of two copies and left in the other) is what made these
     checks assert BOTH boxes; deleting one copy is the strongest possible answer to it, so the
     assertion becomes 「the classic one is gone」 rather than 「it matches」. */
  assert.doesNotMatch(codeOnly(read('js/map-extras.js')), /window\.IntMapSearchToTop\(/,
    'and the classic panel’s box, which also had to, is gone');
});
}

/* ════════ #R293 — from tests/r293-checks.test.mjs (1 of its 16 tests) ════════ */
{
/* ============================================================================
 *  IntMap · #R293 — source-level checks
 * ----------------------------------------------------------------------------
 *  The round's report, in one paragraph, so a reader of this file knows what it is guarding:
 *
 *    Six of the sentences this round answers had been answered before, and every one of them
 *    turned out to be a DIFFERENT SURFACE of the same complaint — the shape [[intmap-recurring-
 *    lessons]] calls 「再送は『自分の診断が違った』から始めろ」. So nothing here was written from the
 *    text of the request; every test below pins something that was MEASURED on production first:
 *
 *      · 「警報レイヤーが重すぎる」 — the steady state was already 60 fps (frame p50 16.7 ms, the same
 *        as with the layer off). The page froze for 7,597 ms while it parsed boundary sets it was
 *        downloading TWICE: 23.07 MB of per-country geoBoundaries beside the 2.27 MB world index
 *        #R290 shipped to make those unnecessary. → ADM2 only after ADM1 leaves something unplaced,
 *        one concurrency gate, and Cache Storage. Longest task 1,240 ms; second visit pays nothing.
 *      · 「Chronosポップアップの『過去表示中』」 — #R290 taught the COLLAPSED button to read the
 *        instant. The badge INSIDE the panel is a different element and still said 「過去」 for a
 *        future instant. Measured: both in the same frame, disagreeing.
 *      · 「地図中心の標準時、機能していない」 — third round, third cause. The accessor works; the only
 *        caller of `ensure()` was the <select>'s change handler, so a preference RESTORED from
 *        localStorage never fetched the data and fell silently to the device clock.
 *      · 「透明度100%は全然100%ではない」 — measured, both weather layers ARE fully opaque at 100 %
 *        (identical pixels over a light and a dark basemap). What was false was the WORD: the same
 *        control is 「Opacity」 in en/de/es/fr/ko/zh and was 「透明度」 / 「Прозрачность」 — the
 *        opposite quantity — in ja and ru.
 *      · 「Windyと完全に同じ風速と色の対応に」 — the shipped table borrowed Windy's breakpoints and
 *        invented the colours; measured divergence up to 133/255. And windy.com's own `RGBA()` does
 *        not equal a linear interpolation of its declared gradient (#R288's finding, again).
 *      · 「日本の特別警報の凡例だけ図形の形が違う」 — nothing chose a different shape. Every swatch
 *        carried a border, and a border's contrast is against the FILL: the JMA's #0c000c is the
 *        only chip darker than that grey, so it alone read as a ring. (And the panel held three
 *        swatch sizes for one idea.)
 * ==========================================================================*/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* ⚠ comments are stripped before every claim about code — this project has now written a test
   that matched its own explanation nineteen times (see #R288 ⑪ this round for the twentieth). */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const WP = () => codeOnly(read('js/world-packs.js'));
const WX = () => codeOnly(read('js/weather.js'));
const EC = () => codeOnly(read('js/wx-ecmwf.js'));
const TL = () => codeOnly(read('js/news-timeline.js'));
const DL = () => codeOnly(read('js/data-layers.js'));
const MT = () => codeOnly(read('js/map-tools.js'));

/* ── ⑬ 「オブジェクト一覧は、数がゼロになったら自動的に消える」 ─────────────────────────────── */
/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R293 ⑬ the object list closes on the transition to zero, not on being empty', () => {
  const s = MT();
  assert.match(s, /if\(!_objs\.length&&_had>0&&panel\.style\.display!=='none'\)\{ _had=0; close\(\); return; \}/,
    'the edge is what closes it — opening it with nothing still explains what it is for');
  assert.match(s, /if\(!n&&_had>0&&openState&&panel&&panel\.style\.display!=='none'\)\{ _had=0; close\(\); \}/,
    'and the periodic tick sees the emptying whoever did it');
  assert.equal((s.match(/_had=0; close\(\)/g) || []).length, 2, 'both doors, one rule');
});
}
