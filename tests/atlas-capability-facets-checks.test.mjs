/* ============================================================================
 *  capability-facets — a capability's nature is several facts, not one risk column
 *  js/atlas-capabilities.js (facetsOf) · js/atlas-cap-*.js (policy.asksUser / delegates) · js/atlas-console.js (classifyCapability)
 *  The defect: `dialog.ask` is risk 'read', writes nothing, confirms nothing — so the child-AI lane called it read-only and a
 *  child could put a question in front of the reader. Not changing data and not acting on the reader are different facts.
 *    ① dialog.ask is not a child-readable capability, and the lane says so (reproduction)
 *    ② every one of the registry's rows carries all six facets, each a boolean
 *    ③ facets agree with the row they are derived from (nothing hand-listed)
 *    ④ any entry whose run builds the choice picker declares asksUser (the implementation is the witness, not a list of ids)
 *    ⑤ asksUser / delegates name real capabilities only, and every 'read' child lane member has none of the six
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeAtlasCapabilities } from '../js/atlas-capabilities.js';
import { CAPABILITY_MODULES } from '../js/atlas-caps-modules.js';

const CAPS = makeAtlasCapabilities({}, { publish: false });
const CONSOLE = readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');
const FACETS = ['mutatesState', 'network', 'asksUser', 'showsUI', 'savesFile', 'delegates'];
const i = CONSOLE.indexOf('const classifyCapability = ');
const classify = new Function('CAPS', CONSOLE.slice(i, CONSOLE.indexOf('const runReadCapability', i)) + '\nreturn classifyCapability;')(CAPS);

test('① dialog.ask — writes nothing, still not something a child AI may run', () => {
  const c = CAPS.resolve('dialog.ask');
  assert.equal(c.risk, 'read-only'); assert.deepEqual(c.effects.writes, []); assert.equal(c.confirmation, 'none');   /* the shape that fooled the old rule */
  assert.equal(c.facets.asksUser, true);
  assert.equal(classify('dialog.ask'), 'other');
  assert.equal(classify('dialog.answer'), 'read', 'answering in text puts nothing on the reader’s screen');
});

test('② every row carries all six facets as booleans', () => {
  CAPS.all().forEach((c) => FACETS.forEach((k) => assert.equal(typeof c.facets[k], 'boolean', c.id + '.' + k)));
  assert.equal(CAPS.toJSON().capabilities.every((c) => c.facets), true, 'the audit JSON carries them');
});

test('③ the facets follow the row', () => {
  CAPS.all().forEach((c) => {
    assert.equal(c.facets.mutatesState, c.risk !== 'read-only' || c.effects.writes.length > 0, c.id);
    assert.equal(c.facets.savesFile, c.produces.includes('file'), c.id);
    assert.equal(c.facets.network, c.ingests === 'external' || c.risk === 'external', c.id);
    if (c.effects.writes.length) assert.equal(classify(c.id), 'other', c.id + ' writes');
  });
});

test('④ an entry that builds the choice picker declares asksUser', () => {
  const asking = [];
  Object.values(CAPABILITY_MODULES).flat().forEach((e) => { if (e.run && /atl-choice/.test(String(e.run))) asking.push(e.row[0]); });
  assert.ok(asking.includes('dialog.ask'), 'the witness sees the real implementation');
  asking.forEach((id) => assert.equal(CAPS.resolve(id).facets.asksUser, true, id + ' builds the picker but does not declare asksUser'));
});

test('⑤ the child lane admits nothing that asks, shows, saves, delegates or changes state', () => {
  const lane = CAPS.all().filter((c) => classify(c.id) === 'read');
  assert.ok(lane.length >= 5);
  lane.forEach((c) => ['mutatesState', 'asksUser', 'showsUI', 'savesFile', 'delegates'].forEach((k) => assert.equal(c.facets[k], false, c.id + '.' + k)));
  assert.equal(CAPS.resolve('research.delegate').facets.delegates, true);
});
