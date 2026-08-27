/* ============================================================================
 *  IntMap · R480 — 「デスクトップ版でMap/SatelliteとFlat/Globe/3Dを同じ行にまとめて。
 *                    また、方位磁針ボタンは分離し、三行目の右側に丸く配置。」
 * ----------------------------------------------------------------------------
 *  MEASURED on the built app at 1440x900 before the change — `.map-controls-top` is a flex COLUMN,
 *  so each direct child is one row, and there were three of them:
 *
 *      row 1  top:10  h:35   Map | Satellite
 *      row 2  top:49  h:39   Flat | Globe | ⛰️3D | compass      ← 39, not 35: the compass inflated it
 *      row 3  top:92  h:36   Measure ▾ | Share ▾ | Layers ▾
 *
 *  ══ ⚠⚠ A ROW IS A DIRECT CHILD, AND THAT IS THE ONLY THING THAT MAKES ONE ═══════════════════
 *  Two pills cannot share a line by being told to: the column decides. So "same row" is a claim
 *  about PARENTAGE — both `.map-view-group`s now hang off one `.map-view-row` — and ① checks it by
 *  walking the container's direct children rather than by matching a string that would still pass
 *  if the wrapper were dropped back into the column.
 *
 *  ══ ⚠⚠⚠ AND TWO PILLS ARE NOT ONE PILL ═════════════════════════════════════════════════════
 *  「まとめて」 asks for one ROW, and the tempting way to read it is one CONTAINER. It must not be:
 *  each `.map-view-group` is a segmented control holding exactly one `.view-btn.active`, and base
 *  map and projection are independent choices — Satellite AND Globe both ship `active`. Five
 *  buttons in one pill would paint two "selected" chips inside one segmented control, i.e. "2 of 5
 *  chosen". ② pins the count at two so a later tidy-up cannot collapse them.
 *
 *  ══ ⚠⚠ THE STACK IS MEASURED BY SOMEONE ELSE ═══════════════════════════════════════════════
 *  js/mobile-ui.js drops the place-search pill to `stackBottom + 10` when it cannot fit beside the
 *  controls. It found that bottom by naming `.map-view-group` — true only while every row happened
 *  to be one of those pills. Moving the compass OUT of a pill into a row of its own makes that
 *  selector blind to the lowest 42px of the stack, and the search field would have been laid out
 *  underneath a button the geometry says is not there. ⑤ is that selector; it now names the rows.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

/* ⚠ comments are stripped FIRST and everywhere. The markup this round added carries `id="btn-compass"`
   and the class names in its prose, so a check that greps the raw file would be reading its own
   explanation and calling it evidence.
   ⚠⚠ ONE PASS IS NOT ENOUGH, and CodeQL is right to say so (js/incomplete-multi-character-sanitization,
   raised against the first draft of this line). Deleting `<!-- … -->` once can SPLICE A NEW COMMENT
   OPENER TOGETHER out of the text either side of what was removed — `<!<!-- x -->-- y -->` collapses to
   `<!-- y -->`, which the single-pass version then hands back as if it were markup. Repeat until the
   text stops changing, which is the fixed point where no comment remains. */
const noComments = (html) => {
  let prev;
  do { prev = html; html = html.replace(/<!--[\s\S]*?-->/g, ''); } while (html !== prev);
  return html;
};

/* The direct children of `.map-controls-top`, in order — i.e. the ROWS of the stack.
   Only <div> and <button> nest here, so tracking those two is enough to know the depth; <svg>,
   <span>, <input>, <hr> and friends never open a row. */
function rowsOfStack() {
  const html = noComments(read('index.html'));
  const at = html.indexOf('<div class="map-controls-top">');
  assert.ok(at >= 0, 'index.html still owns the top-right control stack');
  const body = html.slice(html.indexOf('>', at) + 1);
  const depth = [];
  const rows = [];
  for (const m of body.matchAll(/<(\/?)(div|button)\b([^>]*)>/g)) {
    if (m[1] === '/') {
      if (!depth.length) return rows;        // the container's own </div> — the stack is complete
      depth.pop();
      continue;
    }
    if (!depth.length) rows.push({ tag: m[2], attrs: m[3] });
    depth.push(m[2]);
  }
  assert.fail('the control stack is never closed');
}

const cls = (row) => (/class="([^"]*)"/.exec(row.attrs) || [, ''])[1].split(/\s+/).filter(Boolean);
const idOf = (row) => (/id="([^"]*)"/.exec(row.attrs) || [, ''])[1];

const VIEW_IDS = ['btn-view-map', 'btn-view-sat', 'btn-view-flat', 'btn-view-globe', 'btn-view-3d'];

/* ── ① ONE ROW HOLDS BOTH SEGMENTED CONTROLS ─────────────────────────────────────────────────── */
test('R480 ① the base-map control and the projection control are the same row', () => {
  const rows = rowsOfStack();
  assert.ok(rows.length >= 2, `the stack should still have rows, found ${rows.length}`);

  /* the wrapper IS a row — a direct child — and it is the first one */
  assert.ok(cls(rows[0]).includes('map-view-row'),
    `the first row must be the .map-view-row wrapper, found class="${cls(rows[0]).join(' ')}"`);

  /* …and all five view buttons live inside it, so neither pill can become a row of its own again */
  const html = noComments(read('index.html'));
  const rowAt = html.indexOf('<div class="map-view-row">');
  const toolsAt = html.indexOf('id="map-tools-group"');
  assert.ok(rowAt >= 0 && toolsAt > rowAt, 'the wrapper precedes the tools row');
  const inside = html.slice(rowAt, toolsAt);
  for (const id of VIEW_IDS) {
    assert.ok(inside.includes(`id="${id}"`), `${id} must sit inside the shared row`);
  }
});

/* ── ② …AS TWO SEGMENTED CONTROLS, NOT ONE ───────────────────────────────────────────────────── */
test('R480 ② the five view buttons stay in two pills, one selection each', () => {
  const html = noComments(read('index.html'));
  const inside = html.slice(html.indexOf('<div class="map-view-row">'), html.indexOf('id="map-tools-group"'));
  const parts = inside.split('<div class="map-view-group">').slice(1);
  assert.equal(parts.length, 2,
    'base map and projection are independent choices — one pill each, or a segmented control shows two selections');

  /* exactly one `.view-btn.active` per pill, which is what makes each of them a segmented control */
  for (const p of parts) {
    const pill = p.slice(0, p.indexOf('</div>'));
    const active = (pill.match(/class="view-btn active"/g) || []).length;
    assert.equal(active, 1, `each pill ships exactly one pressed button, found ${active}`);
  }
  /* and between them they still own all five — none was dropped while regrouping */
  assert.equal(VIEW_IDS.filter((id) => inside.includes(`id="${id}"`)).length, 5, 'all five survive');
});

/* ── ③ THE COMPASS IS THE THIRD ROW, ON ITS OWN ──────────────────────────────────────────────── */
test('R480 ③ the compass is a row of the stack, not an item in a pill', () => {
  const rows = rowsOfStack();
  assert.equal(rows.length, 3, `three rows: views, tools, compass — found ${rows.length}`);
  assert.equal(idOf(rows[1]), 'map-tools-group', 'the tools row is the second');

  const last = rows[2];
  assert.equal(idOf(last), 'btn-compass', 'the compass is the third and last row');
  assert.equal(last.tag, 'button', 'and it is the button itself, not a wrapper');

  /* ⚠ `.view-btn` paints a transparent, borderless chip that only reads as a control INSIDE a pill.
     Standing alone the compass must not wear it, or it is an invisible button floating over the map. */
  assert.ok(!cls(last).includes('view-btn'), 'a standalone compass cannot use the in-pill chip class');
  assert.ok(cls(last).includes('compass-btn'), 'it carries its own class');
});

/* ── ④ ROUND, WITH A SURFACE OF ITS OWN, IN THE ONE SHARED MATERIAL ──────────────────────────── */
test('R480 ④ .compass-btn is a circle that draws its own glass', () => {
  const css = read('css/intmap.css');
  const m = /\n\s*\.compass-btn\{([\s\S]*?)\}/.exec(css);
  assert.ok(m, 'css/intmap.css declares .compass-btn');
  const rule = m[1];
  const px = (prop) => {
    const g = new RegExp(prop + ':(\\d+)px').exec(rule);
    return g ? Number(g[1]) : null;
  };
  assert.match(rule, /border-radius:50%/, 'round, per 「丸く配置」');
  const w = px('width'), h = px('height');
  assert.ok(w && h && w === h, `a circle needs equal sides, found ${w}x${h}`);
  assert.ok(w >= 36 && w <= 50, `sized between the 35px pills and the phone's 46px FAB, found ${w}`);

  /* ⚠⚠ IT MUST **NOT** RE-DECLARE WHAT THE GLASS LISTS OWN. .compass-btn is named in both lists
     checked below, and the shared --glass-fill one writes background-color / backdrop-filter /
     -webkit-backdrop-filter with `!important`, while the light/dark rule writes background + border
     unconditionally. So a background, backdrop-filter or border HERE is never applied — it is dead
     weight charged to the startup CSS budget, and this round had to move a ceiling for that budget.
     Measured after deleting the four: the compass's computed backgroundColor / borderTopColor /
     borderTopWidth / backdropFilter / boxShadow are IDENTICAL to a pill's; only borderRadius differs. */
  for (const dead of ['background:', 'backdrop-filter:', 'border:']) {
    assert.ok(!rule.includes(dead),
      `.compass-btn must not declare ${dead} — the glass lists set it, here it is dead weight`);
  }
  /* box-shadow is in NEITHER list, so this rule is the only place the compass can get one */
  assert.match(rule, /box-shadow:var\(--shadow\)/, 'the shadow is its own, because no list supplies one');

  /* the 34px needle is deliberately larger than a 24px icon box — the round border must not clip it */
  assert.match(rule, /overflow:visible/, 'the oversized needle is not clipped');

  /* ⚠ and it joins BOTH lists that make every floating surface one material. Being named in only one
     of them is exactly how a control ends up wearing a glass nobody else in the bar wears (#R244). */
  assert.match(css, /\.map-view-group, \.compass-btn\{ background:rgba\(255,255,255,0\.62\)/,
    'the light-mode top-bar glass names the compass beside the pills');
  assert.match(css, /\[data-theme="dark"\] \.map-view-group, \[data-theme="dark"\] \.compass-btn\{/,
    'and so does the dark one');
  assert.match(css, /\.data-legend,\.map-view-group,\.compass-btn,\.map-search,/,
    'and the shared --glass-fill material list');
});

/* ── ⑤ THE THING THAT MEASURES THE STACK COUNTS ROWS ─────────────────────────────────────────── */
test('R480 ⑤ the search-pill geometry measures every row, including the new one', () => {
  const js = read('js/mobile-ui.js');
  const m = /document\.querySelectorAll\('([^']*)'\)\.forEach\(el=>\{[^}]*stackBottom=Math\.max\(stackBottom,r\.bottom\)/.exec(js);
  assert.ok(m, 'js/mobile-ui.js still measures the right-hand stack for the search pill');
  const sel = m[1];
  assert.ok(/\.map-controls-top\s*>\s*\*/.test(sel),
    `the rows are the container's direct children; naming pills misses any row that is not one — found "${sel}"`);
  assert.ok(!/\.map-controls-top \.map-view-group/.test(sel),
    'the pill-only selector is what went blind to the compass row');
});

/* ── ⑥ EVERY CALLER STILL FINDS IT ───────────────────────────────────────────────────────────── */
test('R480 ⑥ moving the compass did not move its handles', () => {
  const html = noComments(read('index.html'));
  assert.match(html, /id="btn-compass"[^>]*data-i18n-title="ttlResetNorth"/,
    'the id and the translated tooltip survive the move');
  assert.match(html, /class="compass-svg"/, 'and the class the bearing rotation writes to');

  /* the seven consumers that address it, each by the handle it uses — none of them knows about rows */
  const app = read('js/app-body.js');
  assert.match(app, /getElementById\('btn-compass'\)\.onclick/, 'left-click resets north');
  assert.match(app, /const btn=document\.getElementById\('btn-compass'\)/, 'right-click opens the numeric popup (#R152)');
  assert.match(read('js/map-readout.js'), /querySelector\('\.compass-svg'\)/, 'the needle counter-rotates with the bearing');
  assert.match(read('js/mobile-ui.js'), /getElementById\('btn-compass'\)/, 'the phone FAB proxies to it');
  assert.match(read('js/atlas-console.js'), /clickId\('btn-compass'\)/, 'Atlas resetNorth');
  assert.match(read('js/keyboard-shortcuts.js'), /click\('btn-compass'\)/, 'the keyboard `0`');
  assert.match(read('js/workspace.js'), /clk\('btn-compass'\)/, 'the workspace menu');
});
