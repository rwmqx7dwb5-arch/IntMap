/* (hist-admin-coverage) `node scripts/hist-fidelity.mjs --gaps` — the area-weighted backlog the next
   fill is chosen from. Measured, not asserted: the ranking must be in km² (not cells), sorted, and every
   reason it prints must be one the ledger (data/hist-coverage-holes.json) defines, because both come
   from the one `holeWhy` — two readings of «why is this ground empty» is how a backlog and a ledger drift. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const run = () => execFileSync(process.execPath, ['scripts/hist-fidelity.mjs', '--gaps', '--from', '1800', '--top', '8'], { encoding: 'utf8', maxBuffer: 1 << 24 });

test('--gaps ranks uncovered land by area, with a reason the holes ledger knows', () => {
  const lines = run().trim().split('\n');
  assert.match(lines[0], /^uncovered land \(million km², summed over the measured years from 1800\)/);
  const rows = lines.slice(1).map((l) => l.match(/^ {2}(\S+)\s+(\S+)\s+([\d.]+)\s/));
  assert.equal(rows.length, 8);
  const reasons = Object.keys(JSON.parse(fs.readFileSync('data/hist-coverage-holes.json', 'utf8')).reasons);
  const sums = rows.map((m) => { assert.ok(m, 'a row is «ISO3 reason million-km²»'); assert.ok(reasons.includes(m[2]), 'unknown reason ' + m[2]); return +m[3]; });
  assert.deepEqual(sums, [...sums].sort((a, b) => b - a), 'sorted by area, largest first');
  assert.ok(sums[0] > 1, 'the largest gap is more than a million km²-years — a cell count would not be');
});
