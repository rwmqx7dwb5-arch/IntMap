/* ============================================================================
 *  R512 — the instruments that rank every layer and every view under one finger
 * ----------------------------------------------------------------------------
 *  ① scripts/layer-sweep.mjs and scripts/view-matrix.mjs borrow mobile-trace's harness instead of
 *     copying it — the exports exist, and neither file defines a second finger / boot / snapshot.
 *  ② the sweep walks the ONE layer registry (#layer-dropdown), not an id-prefix spelling that keeps
 *     44 of 163 boxes.
 *  ③ the sweep never drives a box through el.click() — the dropdown cancels it in the capture phase
 *     and the reader's route costs one wasted second per row, 163 times.
 *  ④ the sweep measures a default-ON row by switching it OFF (the sign is the finding), and reports
 *     the renderer's word (__imLayerPainted) rather than the box's.
 *  ⑤ view-matrix switches basemap and projection through the app's own commands, and carries the
 *     antimeridian cell that reproduces maplibre-gl-js#7672.
 *  ⑥ both scripts are ledgered where a reader looks for instruments (docs/FILES.md, docs/TESTING.md).
 * ========================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* comments off, so a sentence ABOUT el.click() is not mistaken for a call to it (#R229's rule) */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');

const TRACE = read('scripts/mobile-trace.mjs');
const SWEEP = read('scripts/layer-sweep.mjs');
const MATRIX = read('scripts/view-matrix.mjs');

test('R512 ① mobile-trace exports the harness the two new instruments borrow', () => {
  const m = TRACE.match(/export\s*\{([\s\S]*?)\};/);
  assert.ok(m, 'mobile-trace.mjs has an export list');
  const names = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const n of ['launch', 'cdpFor', 'newContext', 'settle', 'waitFor', 'pan', 'zoom', 'touchPan', 'touchPinch',
    'touchMetersOn', 'touchMetersOff', 'snap', 'framesBetween', 'deadline', 'ensureServer', 'phaseOf', 'PROBE', 'BASE', 'CPU', 'stats', 'has', 'val']) {
    assert.ok(names.includes(n), `mobile-trace exports ${n}`);
  }
});

test('R512 ① …and neither instrument re-implements the finger, the boot or the snapshot', () => {
  for (const [name, src] of [['layer-sweep', SWEEP], ['view-matrix', MATRIX]]) {
    const c = code(src);
    assert.match(c, /from '\.\/mobile-trace\.mjs'/, `${name} imports from mobile-trace`);
    for (const fn of ['touchPan', 'touchPinch', 'launch', 'newContext', 'settle', 'phaseOf', 'ensureServer', 'touchMetersOn']) {
      assert.doesNotMatch(c, new RegExp(`(async\\s+)?function\\s+${fn}\\s*\\(`), `${name} does not define its own ${fn}()`);
    }
    assert.doesNotMatch(c, /Input\.dispatchTouchEvent/, `${name} sends no touch of its own`);
  }
});

test('R512 ② the sweep walks #layer-dropdown — the one registry — not an id-prefix spelling', () => {
  const c = code(SWEEP);
  assert.match(c, /querySelectorAll\('#layer-dropdown input\[type="checkbox"\]\[id\]'\)/);
  assert.doesNotMatch(c, /input\[id\^="dl-"\]/, 'the 44-of-163 spelling is gone');
  assert.match(c, /IntMapBasicLayers/, 'basic rows are marked, not dropped');
});

test('R512 ③ the sweep drives a box the way the app\'s own command does — never el.click(), never a 3 s detour', () => {
  const c = code(SWEEP);
  assert.doesNotMatch(c, /\.click\(\)/);
  assert.match(c, /el\.checked = want; el\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/, 'checked + change, both directions');
  assert.doesNotMatch(c, /OS\.exec\(/, 'the command is the same operation and cost 3 s per flip on the smoke run');
});

test('R512 ③ …and the baseline is a median of three, taken again as the browser ages', () => {
  const c = code(SWEEP);
  assert.match(c, /const gs = \[await gesture\(page, cdp\), await gesture\(page, cdp\), await gesture\(page, cdp\)\];/);
  assert.match(c, /i % REBASE === 0/, 're-baselined every REBASE rows');
  assert.match(c, /row\.baselineAt = /, 'every row says which baseline it was read against');
  assert.match(c, /row\.dRectPerMove/, 'rect/move is read against the renderer\'s own floor, not against 0');
});

test('R512 ④ a default-ON row is flipped OFF, and the renderer is asked whether an ON row painted', () => {
  const c = code(SWEEP);
  assert.match(c, /const flip = L\.checked \? 'off' : 'on';/);
  assert.match(c, /setLayer\(page, L\.id, flip === 'on'\)/);
  assert.match(c, /setLayer\(page, L\.id, flip !== 'on'\)/, 'and flipped back');
  assert.match(c, /__imLayerPainted/);
  assert.match(c, /layers\.filter\(\(l\) => !l\.disabled && !WITH\.includes\(l\.id\)\)/, 'checked rows are in the sweep, not filtered out');
});

test('R512 ④ …and the idle window counts attempts, not successes', () => {
  const c = code(SWEEP);
  assert.match(c, /window\.fetch = function \(\) \{ C\.fetch\+\+;/, 'fetch is counted on the way OUT');
  assert.match(c, /m\.on\('styledata'/);
  assert.match(c, /P\.setData = function \(\) \{ C\.setData\+\+;/, 'GeoJSONSource.setData is counted on the prototype');
  for (const f of ['idle-fetch', 'idle-styledata', 'idle-setData', 'after-off', 'unpainted']) assert.match(c, new RegExp(`'${f}'`), `flag ${f}`);
});

test('R512 ⑤ view-matrix switches through the app\'s commands and carries the antimeridian cell', () => {
  const c = code(MATRIX);
  for (const cmd of ['view.base.map', 'view.base.sat', 'view.proj.flat', 'view.proj.globe']) assert.match(c, new RegExp(`'${cmd.replace(/\./g, '\\.')}'`), cmd);
  assert.match(c, /pitch: 50/, 'pitch past 40°');
  assert.match(c, /center: \[179\.5, 25\]/, 'looking across the date line');
  assert.match(c, /zoom: 6/, 'zoom above 5');
  assert.match(c, /cell\.first = /, 'the first gesture on a fresh style is measured and NOT the one kept');
});

test('R512 ⑥ the profiler samples at rest when asked, and its server serves the build it was told to', () => {
  const c = code(read('scripts/phase-profile.mjs'));
  assert.match(c, /from '\.\/mobile-trace\.mjs'/);
  assert.match(c, /val\('--rest', 0\)/);
  assert.match(c, /if \(REST\) await page\.waitForTimeout\(REST\); else await touchPan\(page, cdp, TPAN_SMALL\);/);
  assert.match(c, /val\('--dist', 'dist'\)/);
  assert.match(c, /Profiler\.setSamplingInterval/);
  assert.match(read('.gitignore'), /^dist-dev\/$/m, 'the unminified build is ignored');
});

test('R512 ⑥ all three instruments are ledgered', () => {
  const files = read('docs/FILES.md'), testing = read('docs/TESTING.md');
  for (const n of ['layer-sweep.mjs', 'view-matrix.mjs', 'phase-profile.mjs']) {
    assert.match(files, new RegExp(n.replace('.', '\\.')), `docs/FILES.md names ${n}`);
    assert.match(testing, new RegExp(n.replace('.', '\\.')), `docs/TESTING.md names ${n}`);
  }
});
