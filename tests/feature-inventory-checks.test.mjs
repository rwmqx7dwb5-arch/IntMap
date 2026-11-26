/* (feature-inventory) the inventory says «unknown» where nothing was measured, and a declared screen entry must be
   a control the page builds. Each rule is handed the defect and must catch it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capabilityEntries } from '../js/atlas-caps.js';
import { inventory, totals } from '../scripts/feature-inventory.mjs';
import { uiEntriesUnbuilt } from '../scripts/atlas-capability-audit.mjs';

const row = (id) => [id, id.split('.').pop(), '', 'map', 'paint', 'map.x', 'map', 'session', 'none', '', ''];
const entry = (id, extra) => ({ row: row(id), schema: () => ({ type: 'object', properties: {} }), run() {}, ...extra });

test('an entry with no `ui` is reported unknown — never as reachable', () => {
  const es = capabilityEntries({ t: [entry('t.a'), entry('t.b', { ui: { at: ['#b'] } }), entry('t.c', { ui: { none: '2026-11-16' } }), entry('t.d', { ui: { at: ['#d'], login: true } })] });
  const rows = inventory(es, []);
  assert.deepEqual(rows.map((r) => r.screen), ['unknown', 'yes', 'none', 'login']);
  assert.deepEqual(totals(rows), { all: 4, yes: 1, login: 1, none: 1, unknown: 1, untested: 4 });
  assert.ok(rows.every((r) => r.production === 'unknown'));
});

test('a malformed `ui` is refused by the entry validator', () => {
  for (const ui of [{ at: [] }, { at: ['#a, #b'] }, { at: ['button'] },{ none: 'yesterday' }, { at: ['#x'], none: '2026-11-16' }, { at: ['#x'], login: 'yes' }, 'x']) {
    assert.throws(() => capabilityEntries({ t: [entry('t.a', { ui })] }), /`ui`/, JSON.stringify(ui));
  }
});

test('a test that names the id is counted; one that does not is not', () => {
  const es = capabilityEntries({ t: [entry('t.a'), entry('t.b')] });
  const rows = inventory(es, [{ src: "run('t.a')" }]);
  assert.deepEqual(rows.map((r) => r.tests), [1, 0]);
});

test('㉔ catches a declared control the page never builds, and passes one it does', () => {
  const src = `<button id="lyr-btn"></button> el.setAttribute('data-act','share'); b.className='lst-tile on'`;
  assert.deepEqual(uiEntriesUnbuilt([{ id: 'x', at: ['#lyr-btn', '[data-act="share"]', '#lyr-btn .lst-tile[data-act]'] }], src).bad, []);
  assert.equal(uiEntriesUnbuilt([{ id: 'x', at: ['#gone'] }], src).bad.length, 1);
  assert.equal(uiEntriesUnbuilt([{ id: 'x', at: ['[data-act="print"]'] }], src).bad.length, 1);
  assert.equal(uiEntriesUnbuilt([{ id: 'x', at: ['.lst'] }], src).bad.length, 1, 'a class is a whole word, not a prefix');
});

/* (atlas-capability-inputs) the other direction: a product module that publishes a window global no Atlas file names */
test('unreachedFromAtlas lists a module whose window global no js/atlas-*.js names, and leaves the named one out', async () => {
  const { unreachedFromAtlas } = await import('../scripts/feature-inventory.mjs');
  const got = unreachedFromAtlas([
    { file: 'js/elevation-thing.js', src: 'window.IntMapElevThing = {};' },
    { file: 'js/named-thing.js', src: 'window.IntMapNamed = {};' },
    { file: 'js/plain.js', src: 'export const x = 1;' },
    { file: 'js/atlas-cap-x.js', src: 'const n = window.IntMapNamed;' },
  ]);
  assert.deepEqual(got.map((x) => x.file), ['js/elevation-thing.js']);
});
