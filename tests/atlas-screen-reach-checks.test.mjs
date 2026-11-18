// (atlas-screen-reach) page → Atlas. Each test here is a hole that really existed (dev-notes/2026-11-19-atlas-screen-reach.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEntries } from '../scripts/atlas-caps.mjs';
import { uiUndeclared } from '../scripts/atlas-capability-audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const jsFiles = () => fs.readdirSync(path.join(ROOT, 'js')).filter((n) => n.endsWith('.js')).map((n) => 'js/' + n);

test('ui-declared: every live capability says how a reader reaches it (13 had said nothing)', async () => {
  const entries = await loadEntries(ROOT);
  const live = entries.filter((e) => !(e.policy && e.policy.withdrawn));
  assert.ok(live.length > 200, 'the registry was read');
  assert.deepEqual(uiUndeclared(live.map((e) => ({ id: e.id, has: !!e.ui }))), []);
});

test('ui-declared can go red: an entry with no `ui` is named', () => {
  const bad = uiUndeclared([{ id: 'x.a', has: true }, { id: 'x.b', has: false }]);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /^x\.b: no `ui`/);
});

const EMPTY = /window\.(IntMap\w+)\s*=\s*\{[^{}]*?\b(\w+)\s*:\s*function\s*\(\s*\)\s*\{\s*\}/g;

test('no published window.IntMap* door is an empty function (the retired widgets stub: W and Atlas called it and reported success)', () => {
  const found = [];
  for (const f of jsFiles()) {
    const src = read(f);
    for (const m of src.matchAll(EMPTY)) found.push(`${f}: window.${m[1]}.${m[2]} is an empty function`);
  }
  assert.deepEqual(found, []);
});

test('the empty-door scan can go red', () => {
  assert.equal([...'window.IntMapWidgets={ toggle:function(){}, refresh:function(){} };'.matchAll(EMPTY)].length, 1);
});

test('a capability that reports ok observes an effect, not that it called something (panel.widgets / W)', () => {
  assert.doesNotMatch(read('js/atlas-cap-panel.js'), /IntMapWidgets\.toggle\(\); ok=true/);
  assert.match(read('js/atlas-cap-panel.js'), /ok=W\.isOpen\(\)/);
  assert.doesNotMatch(read('js/keyboard-shortcuts.js'), /btn-widgets/, 'no key falls back to a button that does not exist');
});

test('the page measures itself against the selector `control` actually uses (one list, two readers)', () => {
  const src = read('js/atlas-controls.js');
  assert.match(src, /const _CTL_SEL=/);
  assert.match(src, /querySelectorAll\(_CTL_SEL\)/, 'findControl reads the shared selector');
  assert.match(src, /el\.matches\(_CTL_SEL\)/, 'IntMapUIAudit.reach() tests the same selector');
  for (const role of ['option', 'switch', 'radio', 'tab', 'menuitem']) {
    assert.ok(src.includes(`[role="${role}"]`), `control reaches role=${role} (missed on production: 80 options, 175 switches)`);
  }
});
