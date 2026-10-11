/* ============================================================================
 *  stepper-waits-for-borders — Chronos's ‹ › and its label answer for the world the map has finished opening
 *  (js/news-timeline.js syncBorderStep / _bsStep, waiting on js/time-borders.js settled())
 * ----------------------------------------------------------------------------
 *  The stepper's answers come from the records the map has OPENED, and the map opens them while it composes
 *  the instant. MEASURED on production 2026-10-11 at 1 July 150: `›` went to 154 for the first ~7 s (151 is a
 *  coast-piece edge, and that record had not arrived), and the label stayed «Borders» for 148 s (changeAt answered
 *  null while the records were on their way, and nothing asked again). The shipped functions are evaluated here
 *  against a map whose records open only when its turn settles.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liftFunction } from './helpers/lift-function.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NT = codeOnly(readFileSync(join(ROOT, 'js/news-timeline.js'), 'utf8'));
const READY = (/const _bsReady=[^\n]*;/.exec(NT) || [''])[0];   /* absent before the fix — the behaviour below is what fails then */

/* a map whose records are open only once the turn this instant opened has settled */
function fakeMap() {
  let open = false, settle;
  const turn = new Promise((r) => { settle = () => { open = true; r(); }; });
  const asked = [];
  const day = (y) => { const d = new Date(2000, 0, 1, 0, 0, 0); d.setFullYear(y); return d; };
  const TB = {
    settled: () => turn,
    range: () => ({ min: -3000, max: 2019 }),
    changeAt: async () => { asked.push(['at', open]); return open ? day(127) : null; },
    changeBefore: async () => { asked.push(['before', open]); return day(127); },
    changeAfter: async () => { asked.push(['after', open]); return day(open ? 151 : 154); },
    changePrecision: () => 'year',
  };
  return { TB, asked, settle };
}
function harness(TB, set) {
  const el = () => ({ textContent: '', style: {}, disabled: false });
  const ctx = {
    window: { IntMapTimeBorders: TB }, bStep: el(), bStepLbl: el(), bStepPrev: el(), bStepNext: el(), _bsSeq: 0,
    L5: () => 'Borders', yLabel: (y) => String(y), _dateText: (d) => d.toISOString(),
    IntMapTime: { state: () => ({ when: new Date(150, 6, 1) }), set },
  };
  vm.createContext(ctx);
  vm.runInContext([
    'const _TB=()=>window.IntMapTimeBorders;', 'const _bsWord=()=>L5();', READY,
    liftFunction(NT, '_bsInRange'), liftFunction(NT, 'syncBorderStep'), liftFunction(NT, '_bsStep'),
    'this.sync=syncBorderStep; this.step=_bsStep;',
  ].join('\n'), ctx);
  return ctx;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('① the label is written once the borders of the instant have settled — with the year, not left at «Borders»', async () => {
  const M = fakeMap(), H = harness(M.TB, () => {});
  H.sync({ isLive: false, year: 150, when: new Date(150, 6, 1) });
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(H.bStepLbl.textContent, 'Borders', 'named at once, before any answer');
  assert.deepEqual(M.asked, [], 'nothing is asked of a half-open world');
  M.settle();
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(H.bStepLbl.textContent, 'Borders · 127', 'MEASURED before: «Borders» for 148 s');
  assert.ok(M.asked.every(([, open]) => open), 'every answer came from the opened records');
});

test('② ‹ › steps on the settled world: 151, not the 154 a half-open world answers', async () => {
  const M = fakeMap(); let went = null;
  const H = harness(M.TB, (d) => { went = d; });
  H.step(1);
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(went, null, 'the step waits for the borders of the instant');
  M.settle();
  for (let i = 0; i < 5; i++) await tick();
  assert.ok(went, 'and then moves the clock');
  assert.equal(went.getFullYear(), 151, 'MEASURED before: 154 for the first ~7 s');
});
