/* spacetime-train-3 — the registry rows are the entries, whatever the previous generated table repeats.
   MEASURED 2026-10-08: integrating #1044 with the branch it had been cut from left «time.polityArc» twice in
   js/atlas-capabilities.js's generated table, and capabilityRows carried the repeat forward (223 rows for 222 entries). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capabilityRows } from '../js/atlas-caps.js';
import { namespaceFiles, namespaceOfFile } from '../scripts/atlas-caps.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

test('capabilityRows takes an id once even when the previous table holds it twice', async () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
  const modules = {};
  for (const f of namespaceFiles(root)) modules[namespaceOfFile(f)] = (await import(pathToFileURL(path.join(root, f)).href)).default;
  const ids = capabilityRows(modules, []).map((r) => r[0]);
  assert.equal(new Set(ids).size, ids.length, 'the entries themselves name each id once');
  const doubled = capabilityRows(modules, [ids[0], ids[1], ids[0], ids[1]]).map((r) => r[0]);
  assert.equal(doubled.length, ids.length, 'a repeated id in the previous table is not a second row');
  assert.deepEqual(doubled.slice().sort(), ids.slice().sort());
});
