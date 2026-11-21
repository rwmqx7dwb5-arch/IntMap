/* first-run-share: a phone reader can reach Share, and the link carries every data layer (measured on production 2026-11-21) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('first-run-share ① the phone Tools sheet has a Share tile that reaches the real button, and closes the sheet', () => {
  const html = read('index.html');
  const sheet = html.slice(html.indexOf('id="tools-sheet"'), html.indexOf('<!-- (#R175) VITE ENTRY'));
  assert.match(sheet, /data-proxy="btn-share"/, 'the Tools sheet proxies #btn-share');
  assert.ok(html.includes('id="btn-share"'), 'the real button the tile proxies exists');
  const mobile = read('js/mobile-ui.js');
  assert.match(mobile, /btn-\(tool-\|share\$\)/, 'the sheet closes after the proxy so the Share panel is not under it');
});

test('first-run-share ② every data layer is carried by the link (not only the rows an old id prefix matched)', async () => {
  const M = await import('../js/layer-manifest.js');
  const data = M.dataLayers().map((l) => l.id);
  assert.deepEqual(M.sharedIds(), data);
  assert.ok(data.length > 150 && M.sharedIds().includes('bx-eq'), 'earthquakes are carried');
});
