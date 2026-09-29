/* ============================================================================
 *  IntMap · the Köppen legend — every one of the 30 zones fits, in every language
 * ----------------------------------------------------------------------------
 *  Consolidated from the Köppen items of four UX batches: tests/r152-checks.test.mjs #1,
 *  tests/r153-checks.test.mjs #1, tests/r154-checks.test.mjs #1 and tests/r155-checks.test.mjs
 *  ("Köppen legend: border-box…"). From their headers:
 * ==========================================================================*/
//   #1  Köppen legend — single-line rows (nowrap + ellipsis, code always visible) so all 30 zones fit the screen
//   #1  Köppen legend — widened to 264px (full names read, no ellipsis clip) + shorter 30-row block (padding 0) so
//       the LAST zone is reachable on a laptop; RU/ES climate names added (were English fallback)
//   #1  Köppen — width now HUGS the content per language (_fitKoppenLegend measures the widest row, clamps 172–340),
//       ending both "行の幅が狭すぎる" (clipping) and "テキスト以上に横幅伸ばして…行の幅変わってない" (dead space)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const index = html;             /* #R155's name for the same concatenation */
/* ⚠ WHY THESE READ THE SOURCE. The legend is CSS plus a measuring pass (`_fitKoppenLegend`) that needs
   laid-out DOM — the widths it sets exist only in a browser; the climate table lives inside the
   6,000-line map-host closure of js/data-layers.js. What is pinned is the rule text each round set. */
test('R152 #1 Köppen rows are single-line (nowrap) with an always-visible code + ellipsised name', () => {
  /* spelling kept — CSS plus a DOM measuring pass; the widths exist only in a laid-out browser page (see the note above) */
  assert.match(html, /\.kl-item\{[^}]*white-space:nowrap;/, 'kl-item nowrap (kills the 2-line wrap)');
  assert.match(html, /\.kl-item \.kl-code\{ flex-shrink:0;/, 'code never shrinks / stays visible');
  assert.match(html, /\.kl-item \.kl-nm\{ flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis;/, 'name ellipsises on one line');
  assert.match(html, /\.koppen-legend\{[^}]*width:220px; min-width:180px; max-width:460px;/, 'legend width is now dynamic per-language (R154: hugs content, clamped 172–340; _fitKoppenLegend sets the exact px)');
  // the build template splits code + name and adds a full-text title tooltip
  assert.match(html, /<span class="kl-code">\$\{code\}<\/span>/, 'row template emits .kl-code');
  assert.match(html, /title="\$\{code\}\$\{_knm\?' · '\+_knm:''\}"/, 'row has full-text title tooltip');
});

test('R153 #1 Köppen legend dynamic per-language width + shorter rows + RU/ES names', () => {
  /* spelling kept — CSS plus a DOM measuring pass; the widths exist only in a laid-out browser page (see the note above) */
  assert.match(html, /\.koppen-legend\{[^}]*width:220px; min-width:180px; max-width:460px;/, 'R154: dynamic per-language width (clamped 172–340), replacing the fixed 264px lock');
  assert.match(html, /lg\.style\.width=w\+'px';/, 'R154: _fitKoppenLegend measures the widest row and sets the exact width');
  assert.match(html, /\.kl-item\{[^}]*padding:0 4px;[^}]*line-height:1\.2;/, 'row block shortened (padding 0, line-height 1.2) so the last zone is reachable');
  /* ⚠ (#R245) the four tables became ONE. `_kru`/`_kes` were patch passes over an `{en,jp}` literal —
     the two-lists defect and #R244's eleventh translation shape at the same time. What this test is
     about is that Russian and Spanish climate names EXIST and reach the reader, so it now asks the
     one table for them. */
  assert.match(html, /Cfb:LA\('Oceanic','西岸海洋性','Ozeanisch','Океанический','Oceánico'\)/,
    'one table, five languages per climate');
  assert.match(html, /window\.kName=function\(code\)/, 'and one accessor every reader goes through');
  assert.match(html, /Влажный тропический лес/, 'a real Russian climate name is present');
  assert.match(html, /Selva tropical/, 'a real Spanish climate name is present');
});

test('R154 #1 Köppen legend width hugs the content per language', () => {
  /* spelling kept — CSS plus a DOM measuring pass; the widths exist only in a laid-out browser page (see the note above) */
  assert.match(html, /\.koppen-legend\{[^}]*width:220px; min-width:180px; max-width:460px;/, 'fixed 264px lock replaced by a dynamic width (172–340 clamp)');
  assert.match(html, /WIDTH HUGS THE CONTENT \(per language\)/, 'fit-to-content width logic present in _fitKoppenLegend');
  assert.match(html, /m\.style\.fontWeight='600'; m\.textContent=cd\?cd\.textContent:'';/, 'measures each row (code weight 600 + name) with an off-screen span');
  assert.match(html, /const w=Math\.max\(190, Math\.min\(460, room>200\?room:460, contentW\)\);/, 'R155: width clamped 190–460 (raised from 324 so DE/RU names fit) and to the room right of the panel');
  assert.match(html, /lg\.style\.width=w\+'px';/, 'the measured width is applied');
});

test('#R155 Köppen legend: border-box + correct chrome + higher clamp', () => {
  /* spelling kept — CSS plus a DOM measuring pass; the widths exist only in a laid-out browser page (see the note above) */
  assert.match(index, /\.koppen-legend\{ box-sizing:border-box;/, 'legend is border-box');
  assert.match(index, /mx \+ 11 \+ 12 \+ 8 \+ 15 \+ 22 \+ 6/, 'width formula folds in padding+border (22)');
  assert.match(index, /Math\.min\(460, room>200\?room:460, contentW\)/, 'max-width clamp raised to 460');
});
