/* hist-fidelity-sheet-rule — the gate measures the sheet the PAGE draws.
   It used to pick «latest at or before the year» and so measured sheet -599 where the page drew -499
   (and -199 for -99). The rule has one owner now (js/hist-sheet-pick.js); this evaluates the page's own
   `nearest` against the gate's composition, year by year. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { politiesAt, eraContext } from '../scripts/hist-fidelity.mjs';
import { nearestSheet } from '../js/hist-sheet-pick.js';

test('the sheet the gate measures is the sheet the page draws, for every year below CShapes', async () => {
  const { api } = await eraContext();
  const txt = fs.readFileSync(new URL('../data/hist-eras-rest.js', import.meta.url), 'utf8');
  const years = JSON.parse(txt.slice(txt.indexOf('=') + 1).replace(/;\s*$/, '')).snaps.map((s) => s.y);
  let differing = 0;
  for (let y = -3000; y < 1886; y += 7) {
    const sheets = new Set(politiesAt(y).filter((p) => /^sheet /.test(p.rec || '')).map((p) => +p.rec.slice(6)));
    const page = api._nearest(y, years);
    if (sheets.size) assert.deepEqual([...sheets], [page], `year ${y}: gate measured ${[...sheets]}, page draws ${page}`);
    if (page !== Math.max(...years.filter((s) => s <= y), -Infinity)) differing++;
  }
  assert.ok(differing > 0, 'the span must include years where closest differs from latest-at-or-before, or this test proves nothing');
});

test('the two named years from the survey: -500 draws -499, -100 draws -99', () => {
  const rec = (y) => [...new Set(politiesAt(y).filter((p) => /^sheet /.test(p.rec || '')).map((p) => p.rec))];
  assert.deepEqual(rec(-500), ['sheet -499']);
  assert.deepEqual(rec(-100), ['sheet -99']);
});

test('the gate does not carry its own copy of the rule', () => {
  const src = fs.readFileSync(new URL('../scripts/hist-fidelity.mjs', import.meta.url), 'utf8');
  assert.match(src, /nearestSheet\(/);
  assert.doesNotMatch(src, /s\.y <= y && \(!sb/);
  assert.equal(typeof nearestSheet, 'function');
});
