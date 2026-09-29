/* ============================================================================
 *  The terrain & water simulator (js/terrain-water.js)
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r187-checks.test.mjs, tests/r188-checks.test.mjs, tests/r190-checks.test.mjs, tests/r268-checks.test.mjs, tests/r271-checks.test.mjs, tests/r277-checks.test.mjs, tests/r284-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { uiLocale } from './helpers/layer-locale-tables.mjs';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r187-checks.test.mjs — 1 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/terrain-water.js はパネル DOM・DEM タイル・キャンバスを前提に組み立てるファクトリで node では組み立てられない */
/* (#R187) the round's header note is kept with its largest block, in tests/layer-globe-rendering-checks.test.mjs */

/* ── 6. the water draws water ────────────────────────────────────────────────────────────────── */
test('R187 water: the traced course is a raster of water, not a polyline', () => {
  const src = read('js/terrain-water.js');
  assert.ok(!/id:'tw-flow'/.test(src), "the cyan guide line must be gone");
  assert.ok(!/id:'tw-flow-case'/.test(src), 'and so must its casing');
  assert.ok(!/properties:\{kind:'flow'\}/.test(src), 'and the feature that fed them');
  /* ⚠⚠⚠ (#R267) #R187'S CLAIM IS «THE COURSE IS WATER, NOT A LINE», AND IT SURVIVES BY BEING MADE
     TRUE OF THE MODEL RATHER THAN OF A SECOND RASTER. There is no `flowImage` and no per-trace
     sampling to pin, because there is no trace: the water beyond the working rectangle is the SAME
     depth field on the SAME lattice, drawn into the SAME image as the water inside it. Asserting the
     old function name here would have made deleting the second raster look like deleting the
     feature — the shape this file has produced for six rounds running. */
  assert.equal((src.match(/paintImg\(IMG_WATER/g) || []).length, 1, 'water is painted in exactly one place');
  assert.ok(!/tw-flowimg'/.test(src.replace(/GONE_FLOW=\[[^\]]*\]/, '')),
    'the second water overlay is gone except from the line that removes it');
  assert.match(src, /const blk=Math\.max\(1,Math\.ceil\(Math\.max\(bNX,bNY\)\/DRAW_MAX_PX\)\);/,
    'one canvas, sized from the lattice it draws');
  /* ⚠ (#R211) TWO OF THESE THREE WERE REVERSED BY A LATER INSTRUCTION, AND THAT IS RECORDED HERE
     RATHER THAN DELETED. #R187 kept the working rectangle and the per-pond markers because they
     were not the guide line that round was told to remove. #R211 was told to remove them by name:
       「水を配置すると謎の点線長方形が出る」   → the dashed rectangle (tw-area)
       「流れの途中の水色ピンを大量に置くのをやめる」 → the light-blue pond pins (kind:'lake')
     Both are now asserted as ABSENCES, which is the stronger claim: they cannot come back by
     accident, and the reason they went is in the file. The end label — the one thing the picture
     cannot carry — still stays. */
  assert.ok(!/id:'tw-area'/.test(src), 'the working rectangle is gone (#R211)');
  assert.ok(!/kind:'lake'\}/.test(src), 'and so are the per-pond pins (#R211) — the ponds are drawn as water');
  assert.match(src, /kind:'end'/, 'the end label stays');
  /* and the retired overlay is still cleaned up, so a style that has it loses it (#R267) */
  assert.match(src, /GONE_FLOW=\['tw-flowimg','tw-flow-src'\]/, 'wipe() must clear the retired overlay too');
  assert.match(src, /function wipe\(\)\{ \[\[LYR_WATER,IMG_WATER\],\[LYR_TERR,IMG_TERR\],GONE_FLOW\]/);
});
}

/* ══════════ from tests/r188-checks.test.mjs — 1 of its 7 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/terrain-water.js はパネル DOM・DEM タイル・キャンバスを前提に組み立てるファクトリで node では組み立てられない */
/* (#R188) the round's header note is kept with its largest block, in tests/layer-aircraft-checks.test.mjs */

/* ── 5. terrain & water: the water's own edges, not a stroke ─────────────────────────────────── */
test('R188 water: the drawn body is measured from the ground, not from one width', () => {
  const src = read('js/terrain-water.js');
  /* ══ ⚠⚠⚠ (#R267) THE CLAIM SURVIVES; THE MACHINE THAT MADE IT TRUE IS GONE ═════════════════════
     #R188's claim was that the far field's width comes from the DEM (a transect solved at the level
     continuity asks for) rather than from one stroke width. Every assertion in the original version
     of this test pinned that machinery by its source text: `channelSections`, `geom(m,h)`, `atQ`,
     the 26-step bisection, `stamp(lng,lat,nx,ny,wl,wr,dep,cellM)`, the canvas sizing.

     #R267 was told 「上流から下流まで全部同じモデル、描画にしろ」 and there is no far field any more —
     the water beyond the working rectangle is the same shallow-water field on the same lattice. Its
     width is not solved from a transect at all: it is however many cells hold water, which is a
     stronger form of the same claim (the ground decides the width, cell by cell, every step). So
     the test asserts the property and, positively, that no width is ever written as a constant.
     ⚠ THIS IS THE SEVENTH ROUND IN A ROW IN WHICH THE PREVIOUS ROUND'S TESTS MADE A CORRECT CHANGE
     LOOK LIKE A REGRESSION ([[intmap-recurring-lessons]]). The rule that keeps coming out of it:
     assert what must be TRUE of the answer, not the text that produced it. */
  assert.ok(!/lineWidth=/.test(src), 'nothing about the water is drawn as a stroke of any width');
  assert.ok(!/widthPx/.test(src), 'and no width in pixels survives');
  /* the drawn extent is the wet set of the solver, cell by cell */
  assert.match(src, /if\(d>0\.02\)\{ const c=waterRGBA\(d\);/, 'a cell is drawn because it holds water');
  assert.match(src, /const bb=basinBBox\(\);/, 'over the lattice the model actually covers');
  /* a claim finer than the data is still counted, never passed off as measurement (#R185) */
  assert.match(src, /drawBlock>1/, 'and a picture coarser than the model says so');
  /* and the second silent no-op #R188 fixed: a click before the grid exists */
  assert.ok(!/function onClick\(e\)\{ if\(!opened\|\|!G\) return;/.test(src),
    'a click with no grid yet must not be discarded');
  assert.match(src, /if\(!G\)\{ if\(mode==='source'\) onClickNoGrid\(lng,lat\);/,
    'it must build and then place the water');
});
}

/* ══════════ from tests/r190-checks.test.mjs — 1 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/terrain-water.js はパネル DOM・DEM タイル・キャンバスを前提に組み立てるファクトリで node では組み立てられない */
/* (#R190) the round's header note is kept with its largest block, in tests/layer-simulators-checks.test.mjs */

/* ── 4 · water: below sea level on land is not an ending ─────────────────────────────────────── */
test('R190 water: a course under 0 m on land keeps going, and edits re-trace it', () => {
  const src = read('js/terrain-water.js');
  /* the sea test still runs, and its NEGATIVE answer still does not stop anything (#R267: the
     water simply keeps flowing, because there is nothing but the water) */
  assert.match(src, /async function seaCheck\(lng,lat\)\{/, 'the connectedness test is still the decider');
  assert.match(src, /course\.checking=true;/, 'bounded — it costs a DEM window, so one at a time');
  /* ⚠ (#R267) the ending is decided on the WATER's leading cell now, not on a walk's last step,
     but #R190's rule is unchanged and is what is asserted: elevation alone never says «the sea». */
  assert.match(src, /if\(v&&v\.sea\) end='sea';/, 'only a verified sea ends the course');
  assert.match(src, /if\(f\.bedM<=0\)\{/, '…and it is only asked where the ground is at or below 0 m');
  assert.doesNotMatch(src, /end='sink'; endInfo=\{ depthM:null/, 'the below-sea-level "sink" ending is gone');
  /* ⚠⚠ (#R267) 「他の操作をすれば、水の流れは再描画して」 — #R190 met this with a debounced re-trace
     because the course was a separate object that could go stale. It cannot go stale now: an edit
     changes the bed the SAME field is integrating on, so the next step already runs on the new
     ground and the next draw already shows it. What still has to be true is that every edit reaches
     the model, which is what is asserted — plus that the ending is re-read after a solve. */
  assert.match(src, /draw\(\);\s*courseSoon\(\);\s*return result;/, 'solve() re-reads where the water got to');
  assert.match(src, /simBedStamp!==editStamp/, 'and an edit rewrites the bed the water is running on');
  assert.ok(!/function _retrace\(\)\{/.test(src), 'there is no separate course to keep in step any more');
  /* and the DEM refusal is a last resort behind a resolution ladder */
  assert.match(src, /if\(miss<=MISS_MAX\|\|z<=7\|\|tries>=6\) break;/, 'a coarser level is tried first');
  assert.match(src, /const _DEM_FAIL=\(\)=>L\(/, 'one message, in one place');
  /* the old wording survives only in the note that quotes the report it came from */
  assert.equal((src.match(/elevation data for this area could not be read/gi) || []).length, 1,
    'and it no longer blames the place for a level that did not arrive');
});
}

/* ══════════ from tests/r268-checks.test.mjs — 3 of its 19 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/terrain-water.js はパネル DOM・DEM タイル・キャンバスを前提に組み立てるファクトリで node では組み立てられない */
/* (#R268) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */
/* ⚠ (#R267) COUNT IN CODE, NOT IN COMMENTS. This file's own prose names the strings it checks for,
   which is how an audit ends up catching itself (nine rounds and counting). Comments are stripped
   before any «does X still exist» question is asked. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ① 地形をリセット did nothing at all ───────────────────────────────────────────────────── */
test('R268 ① the terrain reset is ONE function, and it marks the ground dirty', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  assert.match(s, /function resetTerrainNow\(\)/, 'the single reset must exist');
  /* the panel button and the Atlas door both go through it */
  assert.match(s, /\.tw-resetT'\)\.onclick=\(\)=>\{\s*resetTerrainNow\(\);/, 'the button must call it');
  assert.match(s, /resetTerrain\(\)\{\s*return resetTerrainNow\(\);/, 'the Atlas door must call it');
  /* and it bumps the memoised field, which is the whole defect */
  const body = s.slice(s.indexOf('function resetTerrainNow'), s.indexOf('function resetTerrainNow') + 400);
  assert.ok(/editDirty\(\)/.test(body), 'resetTerrainNow must call editDirty()');
  /* no OTHER handler may clear `sculpt` without it */
  const clears = s.split(/sculpt=new Float32Array/).length - 1;
  const withDirty = s.split(/sculpt=new Float32Array[^;]*;[^]{0,200}?editDirty\(\)/).length - 1;
  assert.equal(clears, withDirty, 'every path that clears the sculpt must reach editDirty()');
});

/* ── ② the basin grew past the elevation cache ─────────────────────────────────────────────── */
test('R268 ② the growing basin reads elevation one tile-block at a time', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  /* ⚠ the budget is PER PLATFORM, because the LRU is: 140 tiles on a phone against 560 on a desktop.
     Comparing one number against the smaller cap is what caught the first version of this. */
  const bm = /GROW_TILE_BUDGET=\(\)=>[\s\S]{0,90}?\?(\d+):(\d+)/.exec(s);
  assert.ok(bm, 'the per-block tile budget must exist and must depend on the platform');
  const [bMobile, bDesktop] = [+bm[1], +bm[2]];
  const cm = /const _DEM_CACHE_MAX=[^;]*?(\d+)\s*:\s*(\d+)/.exec(codeOnly(read('js/app-body.js')));
  const [capMobile, capDesktop] = [+cm[1], +cm[2]];
  assert.ok(bMobile < capMobile, `a phone block (${bMobile}) must fit inside its LRU (${capMobile})`);
  assert.ok(bDesktop < capDesktop, `a desktop block (${bDesktop}) must fit inside its LRU (${capDesktop})`);
  /* the fixed 28-samples-per-axis probe is what missed two tiles in three */
  assert.doesNotMatch(s, /Math\.round\(Math\.max\(nNX,nNY\)\/28\)/, 'the fixed 28-sample lattice must be gone');
  /* cells per tile are derived from the zoom, not typed */
  assert.match(s, /const tw=1\/Math\.pow\(2,z\)/, 'the tile size must come from the zoom');
  /* and a hole is counted AND printed */
  assert.match(s, /basinVoid\+=voids/, 'voids must be accumulated');
  assert.match(s, /result\.sim&&result\.sim\.voids/, 'voids must be reported in the panel');
});

/* ── ③ the raise/lower tint is a switch ────────────────────────────────────────────────────── */
test('R268 ③ the sculpt tint can be turned off, and only the tint', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  assert.match(s, /let tintEdits=/, 'the state must exist');
  assert.match(s, /function setTint\(v\)/, 'the setter must exist');
  assert.match(s, /class="tw-tint"/, 'the panel must carry the checkbox');
  /* the gate is in the DRAWING loop only — the solver must not see it */
  assert.match(s, /for\(let k=0;k<NX\*NY&&tintEdits;k\+\+\)/, 'the tint gates the terrain raster loop');
  const solve = s.slice(s.indexOf('function solve()'), s.indexOf('function solve()') + 4000);
  assert.doesNotMatch(solve, /tintEdits/, 'the solver must not depend on a display preference');
});
}

/* ══════════ from tests/r271-checks.test.mjs — 2 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/terrain-water.js はパネル DOM・DEM タイル・キャンバスを前提に組み立てるファクトリで node では組み立てられない */
/* (#R271) the round's header note is kept with its largest block, in tests/layer-warnings-drawing-checks.test.mjs */
/* ⚠ (#R267) read CODE, not comments — this file's own prose names the things it checks for, and a
   check that matches its own explanation is the failure this project has paid for eleven times. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ⑤ one column in the terrain & water panel ──────────────────────────────────────────────── */
test('R271 ⑤ the panel’s scrollbar width is measured and given to the panes that do not scroll', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  assert.match(s, /function _squareColumn\(\)/, 'the measurement must have a name');
  assert.match(s, /offsetWidth-b\.clientWidth/, 'the scrollbar width is read off the element');
  assert.match(s, /paddingRight/, '…and written where an inline style cannot outrank it');
  assert.match(s, /scrollbar-gutter:stable/, 'so the column does not change width as content grows');
  /* the section heading and the row it labels start at the same inset */
  /* (#R273) 12, not 11: a row lives inside a card whose 1 px border pushes its text to x+12, so a
     caption inset by 11 started ONE pixel left of every word it labels (measured 440.0 vs 441.0). */
  /* ⚠ (#R275) the inset and the row height are DECLARATIONS now (`TW_INSET`, `TW_ROW`) rather than
     numbers repeated at each rule, which is what makes 「one left edge」 and 「one rhythm」 checkable
     rather than coincidental — and it is what let the panel be rescaled to the legends' size
     without any of them drifting apart. */
  assert.match(s, /\.tw-cap\{[^}]*padding:0 '\+TW_INSET\+'px/, 'a section heading is inset like the rows under it');
  assert.match(s, /\.tw-note > summary\{[^}]*padding:0 '\+TW_INSET\+'px/, '…and so is a disclosure');
  /* a one-line prose block is a row, not something shorter than one */
  assert.match(s, /\.tw-blk\{[^}]*min-height:'\+TW_ROW\+'/, 'a prose block must sit on the row rhythm');
});

/* ── ⑥ a new source must not restart the water that is already flowing ──────────────────────── */
test('R271 ⑥ placing a source extends the basin instead of rebuilding the grid', () => {
  const s = codeOnly(read('js/terrain-water.js'));
  assert.match(s, /function padsToReach\(/, 'how much lattice it would take must be computed');
  assert.match(s, /async function extendToPoint\(/, 'and the basin extended, not the rectangle moved');
  assert.match(s, /basinMaxCells\(\)/, 'the extension is budgeted');
  /* the tap tries the basin first, and only then falls back to the rebuild that DOES reset */
  const oc = /function onClick\(e\)\{[\s\S]*?\n    \}/.exec(s);
  assert.ok(oc, 'onClick must exist');
  const m = /else if\(mode==='source'\)\{([\s\S]*)$/.exec(oc[0]);
  assert.ok(m, 'the source branch of onClick must exist');
  assert.match(m[1], /basinCellOf\(lng,lat\)/, 'a point the basin already covers needs nothing at all');
  assert.match(m[1], /extendToPoint\(lng,lat\)/, 'and a point just outside it is reached by growing');
  assert.ok(m[1].indexOf('extendToPoint') < m[1].indexOf('rebuildAround'),
    'the rebuild is the last resort, not the first move');
  /* …and the programmatic door takes the same route (#R255/#R258/#R268: one entry, not two) */
  const a = /async addSource\(lng,lat,m3,o\)\{([\s\S]*?)courseSoon\(\); return r; \}/.exec(s);
  assert.ok(a, 'addSource must exist');
  assert.match(a[1], /extendToPoint/, 'the Atlas door must reach the point the same way the tap does');
});
}

/* ══════════ from tests/r277-checks.test.mjs — 2 of its 12 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/terrain-water.js はパネル DOM・DEM タイル・キャンバスを前提に組み立てるファクトリで node では組み立てられない */
/* (#R277) the round's header note is kept with its largest block, in tests/layer-warnings-drawing-checks.test.mjs */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const TW = () => codeOnly(read('js/terrain-water.js'));

/* ── ① the tool strip is ONE ROW, pinned, and everything else scrolls ───────────────────────────
   MEASURED before the fix, on the built page (desktop): `.tw-tools` was 131.7 px of a 591.7 px
   panel — a caption, a 2×2 picker and the 「着色」 checkbox — i.e. #R275 pinned the right element
   and left three rows above the scroller. After: 46.7 px, one child, all four buttons at the same
   y, `scrollWidth === clientWidth` on every one of them. */
test('R277 ① the terrain tool picker is one pinned row and nothing else', () => {
  const s = TW();
  const iH = s.indexOf('panel.innerHTML=');
  const html = s.slice(iH, s.indexOf('class="tw-foot"', iH));
  const iT = html.indexOf('class="tw-tools"');
  const iB = html.indexOf('class="tw-body"');
  assert.ok(iT > 0 && iB > iT, 'head · tools · body, in that order');
  const tools = html.slice(iT, iB);
  /* the ONLY thing between the two markers is the picker: no caption, no card, no second control */
  assert.match(tools, /class="tw-segwrap tw-modes"/, 'the picker is what is pinned');
  assert.ok(!/tw-cap/.test(tools), 'no caption row above the scroller');
  assert.ok(!/tw-card/.test(tools), 'no settings card above the scroller');
  /* four across, not two by two — that is what 「一行」 means and it is one declaration */
  assert.match(s, /\.tw-modes\{display:grid;grid-template-columns:repeat\(4,1fr\);\}/,
    'the four tools are one row of four');
  /* the long name is not lost: it is on `title` and it is the caption of the block the tool opens */
  assert.match(s, /function modeName\(m\)\{/, 'one declaration of the full tool names');
  assert.match(s, /title="'\+_at\(m\[2\]\)\+'"/, '…carried by every button');
  assert.ok(!/p\.innerHTML=cap\(L\('Levee \/ dam'/.test(s), 'the params caption reads that declaration');
  assert.equal((s.match(/p\.innerHTML=cap\(modeName\(mode\)\)/g) || []).length, 3,
    '…in all three tool modes');
  /* and the tint setting moved INTO the scroller rather than being deleted */
  assert.match(html.slice(iB), /class="tw-tint"/, 'the tint checkbox still exists, in the body');
});

/* ── ② one rate, one total, and a sentence that says what they do together ──────────────────────
   MEASURED in the code before the fix: `placeSource` did `rate:(flowM3s!=null?flowM3s:pourRate)`
   and `srcRate` fell back to `pourRate` — so 「注水量」 and 「流量」 were ONE quantity written by two
   boxes, and the panel showed both plus the volume. 「何が何かわからない」 is what two controls for
   one number look like. */
test('R277 ② the one-shot source has exactly two numbers, and they are different kinds', () => {
  const s = TW();
  const iP = s.indexOf("L('Next source'");
  const params = s.slice(iP, s.indexOf('function setMode(', iP));
  const nums = params.match(/class="tw-num tw-[a-z]{2}"/g) || [];
  assert.deepEqual([...new Set(nums)].sort(), ['class="tw-num tw-pr"', 'class="tw-num tw-sv"'],
    'a total (m³) and a rate (m³/s) — and no third box');
  assert.match(params, /tw-sv[^]{0,200}m³<\/span>/, 'the total is a volume');
  assert.match(params, /tw-pr[^]{0,200}m³\/s<\/span>/, 'the rate is a speed');
  /* the panel does the division rather than leaving the reader to do it */
  assert.match(s, /function pourNote\(\)\{/, 'the pair is explained in words');
  assert.match(s, /const sec=Math\.max\(0,srcM3\)\/Math\.max\(1,pourRate\);/,
    '…and the explanation is the total divided by the rate');
  assert.match(s, /class="tw-blk tw-pnote"/, '…printed under the two boxes');
  assert.match(s, /function syncPourNote\(\)\{/, '…and kept in step when either number changes');
  /* ONE writer for the discharge, and it reaches every tap (this is #R189's requirement, kept) */
  assert.match(s, /function setRate\(v\)\{/, 'one writer');
  assert.match(s, /pourRate=n; sources\.forEach\(x=>\{ x\.rate=pourRate; \}\);/, '…for every source');
  assert.ok(!/let flowM3s/.test(s), 'the second state for the same number is gone');
});
}

/* ══════════ from tests/r284-checks.test.mjs — 1 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/terrain-water.js はパネル DOM・DEM タイル・キャンバスを前提に組み立てるファクトリで node では組み立てられない */
/* (#R284) the round's header note is kept with its largest block, in tests/layer-weather-ecmwf-checks.test.mjs */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const TW = () => codeOnly(read('js/terrain-water.js'));

/* ── ⑤ 「ここに水」 → 「水源」 ─────────────────────────────────────────────────────────────── */
test('#R284 ⑤ the water tool is named for what it places', () => {
  const src = TW();
  assert.match(src, /m==='source'\?L\('Water source','水源'/, 'the full name is the new one');
  assert.ok(!/'Water here'/.test(src), 'the old name is gone from the code');
  /* the other three tools are untouched — a rename must not become a redesign */
  for (const [en, ja] of [['Raise', '盛る'], ['Lower', '削る'], ['Levee / dam', '堤防・ダム']])
    assert.ok(src.includes("L('" + en + "','" + ja + "'"), en + ' is unchanged');
  /* every language the keyed tables hold has the new key */
  /* (consolidation) EVALUATED: the English-keyed inline table each language hands to IntMapLang.define */
  for (const c of ['fr', 'ko', 'zh', 'zh-hans']) {
    const v = uiLocale(c).inline['Water source'];
    assert.ok(typeof v === 'string' && v.length > 0, 'ui.' + c + '.js translates it');
  }
});
}
