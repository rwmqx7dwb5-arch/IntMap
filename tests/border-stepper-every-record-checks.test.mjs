/* ============================================================================
 *  border-stepper-every-record — Chronos's ‹ › stops wherever the drawn world changes, whatever record
 *  changes it (js/time-borders.js `_EDGES`, read by changeAfter / changeBefore / changeDates / changePrecision)
 * ----------------------------------------------------------------------------
 *  The coast pieces (data/hist-coast-snap.js) are judged again where the sheet the map shows changes, so
 *  1 July 150 and 1 July 151 draw Han, Mahan, the Goths … tens of km² apart (dev-notes/2026-10-08-hist-product.md
 *  §2). The stepper's edge list named its records one by one and did not name that one: 151 was in no list, and
 *  ‹ › stepped over it. The map itself is evaluated here (scripts/history-pages.mjs `mapReader` instantiates
 *  js/time-borders.js over the real bundles) — no copy of its rule.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const readBundle = (rel) => { const t = readFileSync(join(ROOT, rel), 'utf8'); return JSON.parse(t.slice(t.indexOf('=') + 1).replace(/;\s*$/, '')); };
const { mapReader } = await import('../scripts/history-pages.mjs');
const R = await mapReader();
const at = (y, m = 7, d = 1) => { const t = new Date(2000, m - 1, d, 12); t.setFullYear(y); return t; };

test('① every year a coast piece begins or ends is a change the stepper lists, once the map has drawn from them', async () => {
  await R.labelsAt(at(150));   /* the map opens the coast pieces when it composes an instant that has them */
  const listed = new Set((await R.api.changeDates()).map((d) => d.getFullYear()));
  const snap = readBundle('data/hist-coast-snap.js');
  const years = new Set();
  for (const f of snap.feats) { years.add(f[2]); years.add(f[5]); }
  const missing = [...years].filter((y) => !listed.has(y));
  assert.ok(snap.feats.length > 0, 'the fixture: the coast pieces have rows');
  assert.deepEqual(missing.slice(0, 20), [], `${missing.length} coast-piece years the stepper does not stop at`);
});

test('② the measured case: from 1 July 150, ‹ › next reaches 151 — the year the drawn area changes', async () => {
  await R.labelsAt(at(150));
  const next = await R.api.changeAfter(at(150));
  assert.ok(next, 'there is a next change');
  assert.ok(next.getFullYear() <= 151, `the next change after 150 is ${next.getFullYear()}, past 151`);
  const back = await R.api.changeBefore(at(151, 7, 1));
  assert.ok(back && back.getFullYear() >= 151 - 1, 'and ‹ goes back to it');
});

test('③ a change only a coast piece states is printed at the precision of a year, not as a stated day', async () => {
  await R.labelsAt(at(150));
  const next = await R.api.changeAfter(at(150));
  assert.equal(R.api.changePrecision(next), 'year', 'a sheet-era instant is a year: 1 January is not a date anyone stated');
});

test('④ the panel names the world the stepper stopped on: changeAt at 151 is 151, not the Cliopatria edge before it', async () => {
  await R.labelsAt(at(151));
  const born = await R.api.changeAt(at(151, 7, 1));
  assert.ok(born, 'there is a day the drawn world began');
  assert.equal(born.getFullYear(), 151, `the panel would read ${born.getFullYear()} while the map stands on the world of 151`);
  /* and the label prints such a change as the year (js/news-timeline.js reads changePrecision) */
  const NT = readFileSync(join(ROOT, 'js/news-timeline.js'), 'utf8');
  const lbl = NT.slice(NT.indexOf('function syncBorderStep'), NT.indexOf('function _bsStep'));
  assert.match(lbl, /changePrecision\(r\[0\]\)==='year'/, 'the stepper label asks the precision before printing a day');
});
