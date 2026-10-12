/* ============================================================================
 *  IntMap · «is this year the present?» is asked of the one clock  (one-present-year)
 * ----------------------------------------------------------------------------
 *  Six callers each wrote `year >= new Date().getFullYear()` to decide that a year folds into live —
 *  and js/time-lapse.js wrote it with getUTCFullYear(), so it disagreed with the clock for the hours
 *  around New Year. The decision is now js/chronos.js `isPresentYear(y)` (the clock's own local year).
 *  The clock is EVALUATED here; the «no second copy» fact is measured over every file in js/.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { importModule } from './helpers/import-module.mjs';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { ROOT } from './helpers/geo-shared.mjs';

const jsFiles = () => readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f);

/* the shape: a year compared with a fresh «this year» read — `>=` (is it the present?) or `<` (is it the past?), one
   question either way round. Counted by call, not by name list. */
const FOLD = /(?:>=|<)\s*\(?new Date\(\)\)?\.get(?:UTC)?FullYear\(\)(?!\s*[-+])/g;   /* not `- 2`: a recency window is not «the present» */

test('no file but the clock itself decides whether a year is the present', () => {
  const offenders = [];
  for (const f of jsFiles()) {
    if (f === 'js/chronos.js') continue;
    const n = (codeOnly(readLF(f)).match(FOLD) || []).length;
    if (n) offenders.push(f + ' x' + n);
  }
  assert.deepEqual(offenders, [], 'ask IntMapTime.isPresentYear(y) instead of re-deriving the present year');
});

test('chronos.isPresentYear: this year and next are the present, last year is not', async () => {
  const { IntMapTime } = await importModule('js/chronos.js', { globals: { window: {}, document: undefined } });
  const y = new Date().getFullYear();
  assert.equal(IntMapTime.isPresentYear(y), true);
  assert.equal(IntMapTime.isPresentYear(y + 1), true);
  assert.equal(IntMapTime.isPresentYear(y - 1), false);
  IntMapTime.setYear(y + 3, { source: 'test' });
  assert.equal(IntMapTime.isLive(), true, 'setYear folds a present-or-later year into live through the same predicate');
  IntMapTime.setYear(y - 1, { source: 'test' });
  assert.equal(IntMapTime.isLive(), false);
});
