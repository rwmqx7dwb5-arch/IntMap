/* ============================================================================
 *  Atlas · the capability index says what each id is FOR  (atlas-index-purpose)
 * ----------------------------------------------------------------------------
 *  MEASURED (production, 2026-11-24): [WHAT INTMAP CAN DO] listed research.delegate, jobs.start,
 *  model.run, compute.run, siting.compare by id only; Atlas never looked them up (research.delegate
 *  0 uses, durable jobs 0 uses). The index now carries one short purpose per id, DERIVED from the
 *  capability's own catalogue entry (js/atlas-capabilities.js purposeOf). These checks drive the
 *  real registry and the real catalogue text; no expectation here is a typed list of purposes.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');

const caps = makeAtlasCapabilities({}, { publish: false });
const bare = makeAtlasCapabilities({}, { publish: false }).index();   /* no catalogue bound = no words to read = the old shape */
caps.bindRuntime({ docs: makeAtlasCatalogText({}, {}) });
const text = caps.index();

/* the entries of one index line, as the model reads them: `id` or `id (purpose)` */
function entries(t) {
  const out = new Map();
  String(t).split('\n').slice(1).forEach((line) => {
    const colon = line.indexOf(': ');
    if (colon < 0) return;
    line.slice(colon + 2).split('; ').forEach((e) => {
      const m = /^(\S+?)(?: \((.*)\))?\.?$/.exec(e.trim());
      if (m) out.set(m[1], m[2] || '');
    });
  });
  return out;
}
const shown = entries(text);

test('research.delegate carries words from its own catalogue entry', () => {
  assert.ok(shown.has('research.delegate'));
  const purpose = shown.get('research.delegate');
  assert.ok(purpose.length > 10, 'research.delegate has a purpose line, got: ' + JSON.stringify(purpose));
  const own = caps.catalogText(['research.delegate']).replace(/\s+/g, ' ').toLowerCase();
  const probe = purpose.replace(/…$/, '').toLowerCase();
  assert.ok(own.includes(probe), 'the purpose is a quotation of the documentation of research.delegate');
});

test('an id with no description stays bare', () => {
  const bareIds = [...shown].filter(([, p]) => !p).map(([id]) => id);
  assert.ok(bareIds.length > 0, 'some capability has no extractable purpose, and it must not be given an invented one');
  const probe = bareIds[0];
  const items = text.split(String.fromCharCode(10)).flatMap((line) => line.split(': ').slice(1).join(': ').split('; '));
  assert.ok(items.some((e) => e === probe || e === probe + '.'), probe + ' is listed as a bare id');
});

test('with no catalogue bound the index is the bare-id shape', () => {
  const b = entries(bare);
  assert.ok(b.size > 100);
  assert.ok([...b.values()].every((p) => p === ''), 'no purposes without a documentation source');
  assert.deepEqual([...b.keys()].sort(), [...shown.keys()].sort(), 'same ids either way');
});

test('byte-stable: two calls give identical bytes', () => {
  assert.equal(caps.index(), text);
  assert.equal(caps.index(['view.flyTo']), caps.index(['view.flyTo']));
});

test('base tools passed in are absent, withdrawn ids are absent', () => {
  const direct = ['research.delegate', 'view.flyTo'];
  const t = entries(caps.index(direct));
  direct.forEach((id) => assert.ok(!t.has(id), id + ' is already in hand and must not be listed'));
  caps.withdrawn().forEach((id) => assert.ok(!shown.has(id), id + ' is withdrawn'));
  const victim = caps.all().find((c) => !c.withdrawn && shown.has(c.id));
  victim.withdrawn = { why: 'fixture' };
  assert.ok(!entries(caps.index()).has(victim.id));
  delete victim.withdrawn;
});

test('every purpose is a single short line inside the size bound', () => {
  [...shown].forEach(([id, p]) => {
    assert.ok(!/[\n;]/.test(p), id + ' purpose must stay on one line and not contain the separator');
    assert.ok(p.length <= 62, id + ' purpose is ' + p.length + ' chars');   /* PURPOSE_MAX_CHARS 60 + the ellipsis */
  });
  assert.ok(text.length < 16000, 'the index is ' + text.length + ' chars; it is a prompt prefix paid every turn');
});
