/* the card's glow rules live at the ROOT (one rule on every descendant), not in a list of the parts known today — the browser measurement is tests/atlas-float-text-glow.spec.js */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const float = readFileSync(new URL('../js/atlas-float.js', import.meta.url), 'utf8');
test('glow is one root-level rule on every descendant, and the reader\'s bubble uses the same tint in both modes', () => {
  assert.match(float, /#atlas-float #atlas-panel \*,[^']*\{text-shadow:var\(--atl-glow\);\}/);
  assert.match(float, /#atlas-float #atlas-panel \.atl-b\.u\{--atlas-glass:linear-gradient/);
});
