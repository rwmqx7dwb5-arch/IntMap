/* (pages-listing-pipe) A step that runs under `set -o pipefail` must not pipe an unbounded listing into `head`.
 * MEASURED 2026-10-03 (run 37104326436, #934): «ls -la _site | head -30» in the Pages assembly step failed with
 * «ls: write error: Broken pipe» and exit 2 once the site held the history entry pages (3,382 files) — head closes
 * the pipe after 30 lines, ls is killed by SIGPIPE, and pipefail turns that into the step's failure. Production
 * publishing stopped. `sed -n '1,30p'` reads to the end and prints the same 30 lines. The rule is found in every
 * workflow file, not in a list of them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, '.github/workflows');

test('pages-listing-pipe ① no workflow pipes a directory listing into head (SIGPIPE under pipefail)', () => {
  const bad = [];
  for (const f of readdirSync(DIR).filter((n) => /\.ya?ml$/.test(n))) {
    readFileSync(join(DIR, f), 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*#/.test(line)) return;
      if (/\bls\b[^|#]*\|\s*head\b/.test(line)) bad.push(f + ':' + (i + 1) + '  ' + line.trim());
    });
  }
  assert.deepEqual(bad, [], 'a listing piped into head is killed by SIGPIPE when the listing outgrows it — use sed -n "1,Np"');
});
