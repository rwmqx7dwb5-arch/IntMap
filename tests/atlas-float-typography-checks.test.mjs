/* Atlas floating card: glyph glow only (no rectangle stands in for it), a frosted-pane switch with a squarer, more transparent pane, and a roomier answer rhythm. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../js/' + p, import.meta.url), 'utf8');
const float = read('atlas-float.js'), styles = read('atlas-styles.js');

test('the glow is a text-shadow on the glyphs; the reader\'s own message keeps its bubble', () => {
  assert.match(float, /#atlas-float:not\(\.bg\) #atlas-panel \*,[^']*\{text-shadow:var\(--atl-glow\);\}/);
});

test('the pane is more transparent and squarer than before, and the glow is off while it is on', () => {
  const m = /#atlas-float\.bg #atlas-panel \.atl-chat\{[^}]*\}/.exec(float)[0];
  assert.match(m, /text-shadow:none/);
  assert.ok(Number(/popup-bg\) (\d+)%/.exec(m)[1]) <= 40, 'the pane is mostly see-through');
  assert.ok(Number(/border-radius:(\d+)px/.exec(m)[1]) <= 16, 'rounded, but not a pill');
});

test('the answer rhythm: items breathe more than the lines inside them', () => {
  const li = Number(/\.atl-li\{margin:([\d.]+)em/.exec(styles)[1]);
  assert.ok(li >= 0.4);
  assert.match(styles, /\.atl-md\{font-size:15px;line-height:1\.7;\}/);
});

test('the «drawn» chips and the 「Map as it was」 label are gone', () => {
  assert.doesNotMatch(read('atlas-answer-sources.js'), /atl-arts|data-atl-art/);
  assert.doesNotMatch(read('atlas-msg-tools.js'), /当時の地図/);
});
