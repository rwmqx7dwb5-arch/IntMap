/* (atlas-context-diet) find_capability hands back the prose of the capabilities that matched, not of every capability that shares a block with
   them, and spells out only the matches the ranker itself calls strong. Both are checked on the REAL registry with the REAL catalogue bound. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');

const docs = makeAtlasCatalogText({}, {});
const caps = makeAtlasCapabilities({ docs });
caps.bindRuntime({ docs });
const surface = makeAtlasToolSurface({ capabilities: caps, schemas: makeAtlasSchemas(), runAction: async () => ({}) });

test('exact text is the heading plus the asked capabilities\' own fragments — a subset of the block, never different words', () => {
  const blocks = docs.blocks();
  const multi = blocks.find((b) => b.ids.length > 3);
  assert.ok(multi, 'the catalogue has a block that documents several capabilities');
  const id = multi.ids[0];
  const full = docs.text([id]), exact = docs.text([id], { exact: true });
  assert.ok(exact.length > 0 && exact.length < full.length, 'the exact reading is smaller than the whole block (' + exact.length + ' < ' + full.length + ')');
  // every character run of the exact text occurs in the whole block, in order
  let at = 0;
  for (const piece of exact.split(/(?<=\.) /)) { const i = full.indexOf(piece, at); assert.ok(i >= 0, 'exact text is quoted from the block'); at = i; }
  assert.deepEqual(docs.text(null), docs.text(null, { exact: true }), 'asking for everything is unchanged');
});

test('every capability the exact reading was asked for keeps its own words, and its neighbours are named, not dropped', () => {
  for (const b of docs.blocks().slice(0, 12)) {
    const id = b.ids[0], exact = docs.text([id], { exact: true });
    assert.ok(exact.length > 0, id + ' still has documentation');
    const sib = docs.siblings([id]);
    assert.ok(b.ids.filter((x) => x !== id).every((x) => sib.includes(x)), id + ': the other capabilities of its block are listed as siblings');
  }
});

test('find_capability: a query answers with the strong matches whole and the rest as one line, and only the whole ones become tools', async () => {
  const res = await surface.find('compare GDP of G7', {});
  const whole = res.matches.filter((m) => m.schema !== undefined), line = res.matches.filter((m) => m.schema === undefined);
  assert.ok(line.length > 0, 'a wide ranking has one-line matches');
  assert.ok(line.every((m) => m.id && m.summary !== undefined && m.detail), 'a one-line match keeps its id, summary and says how to read on');
  const promoted = surface.promotionsOf(res).map((t) => t.capabilityId);
  assert.ok(line.every((m) => !promoted.includes(m.id)), 'a one-line match is not promoted');
  assert.ok(JSON.stringify(res).length < 60000, 'the result is bounded by what matched (' + JSON.stringify(res).length + ')');
});

test('nothing is withheld: the bare id of a one-line match returns its schema and documentation', async () => {
  const res = await surface.find('compare GDP of G7', {});
  const line = res.matches.find((m) => m.schema === undefined);
  const again = await surface.find(line.id, {});
  const mine = again.matches.find((m) => m.id === line.id);
  assert.ok(mine && mine.schema !== undefined, line.id + ' comes back with its schema when asked for by id');
});

test('with no ranker confidence every match arrives whole', () => {
  const ids = ['view.locate', 'time.travel'];
  const r = surface.describe('x', ids, 'lexical', undefined);
  assert.ok(r.matches.every((m) => m.schema !== undefined));
});
