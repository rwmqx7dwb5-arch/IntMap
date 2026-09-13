import test from 'node:test';
import assert from 'node:assert/strict';
import { detailPolys, refreshTopology, topologyErrors } from '../scripts/build-hist-admin1.mjs';
import { geometryOf } from '../scripts/histborders/precision.mjs';

const shell = [[0, 0], [8, 0], [8, 8], [0, 8], [0, 0]];
const island = [[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]];
const relation = { type: 'relation', id: 42, members: [shell, island].map(r => ({
  type: 'way', role: 'outer', geometry: r.map(([lon, lat]) => ({ lon, lat }))
})) };
// Published fixture: the former parser classified an explicit outer as a hole.
const baseline = { ringsOf: () => [shell, island], polysOf: rings => [rings] };
const bundle = () => ({ tolerance: 0, decimals: 4, src: 'fixture', dates: { 42: { source: 'exact' } },
  rings: [shell, island], feats: [['name', 4, 1800, 1, 1, 1900, 1, 1, [[0, 1]], { ja: '名前' }, 42]] });

test('topology refresh restores explicit outer without changing one vertex or identity field', () => {
  const before = bundle(), snapshot = JSON.stringify(before);
  const { data, stats } = refreshTopology(before, () => relation, baseline);
  assert.equal(stats.changed, 1);
  assert.equal(stats.unchangedVertices, 1);
  assert.equal(stats.retained, 0);
  assert.equal(data.rings, before.rings, 'pool and all coastline ring indices stay identical');
  assert.deepEqual(geometryOf(data, data.feats[0]), [[shell], [island]]);
  assert.deepEqual(data.feats[0].slice(0, 8), before.feats[0].slice(0, 8));
  assert.deepEqual(data.feats[0].slice(9), before.feats[0].slice(9));
  assert.deepEqual(data.dates, before.dates);
  assert.equal(JSON.stringify(before), snapshot, 'input is not mutated');
});

test('unreproducible corrected geometry and missing/wrong sources retain published shapes', () => {
  const before = bundle(); before.rings[1] = island.map(([x, y]) => [x + 0.25, y]);
  const corrected = refreshTopology(before, () => relation, baseline);
  assert.equal(corrected.stats.unreproducible, 1);
  assert.deepEqual(geometryOf(corrected.data, corrected.data.feats[0]), geometryOf(before, before.feats[0]));
  for (const source of [null, { ...relation, id: 43 }]) {
    const result = refreshTopology(bundle(), () => source, baseline);
    assert.equal(result.stats.unavailable, 1);
    assert.equal(result.stats.changed, 0);
  }
});

test('a different ring inventory cannot pass as a topology-only correction', () => {
  const source = { ...relation, members: relation.members.slice(0, 1) };
  const result = refreshTopology(bundle(), () => source, baseline);
  assert.equal(result.stats.changedVertices, 1);
  assert.equal(result.stats.retained, 1);
  assert.deepEqual(geometryOf(result.data, result.data.feats[0]), [[shell, island]]);
});

test('explicit source reassembly accepts matched geometry changes, repools, and is idempotent', () => {
  const source = { ...relation, members: relation.members.slice(0, 1) };
  const before = bundle();
  const result = refreshTopology(before, () => source, baseline, { reassembleSource: true });
  assert.equal(result.stats.reassembled, 1);
  assert.equal(result.stats.changed, 1);
  assert.equal(result.stats.retained, 0);
  assert.equal(result.stats.changedVertices, 0);
  assert.deepEqual(geometryOf(result.data, result.data.feats[0]), [[shell]]);
  assert.equal(result.data.rings.length, 1, 'unused rings are removed when the pool is rebuilt');
  assert.deepEqual(result.data.feats[0].slice(9), before.feats[0].slice(9));
  assert.deepEqual(result.data.dates, before.dates);
  const again = refreshTopology(result.data, () => source, baseline, { reassembleSource: true });
  assert.equal(again.stats.alreadyCurrent, 1);
  assert.equal(again.stats.changed, 0);
  assert.deepEqual(again.data, result.data);
});

test('reassembly still preserves corrections and refuses an empty source candidate', () => {
  const before = bundle(); before.rings[1] = island.map(([x, y]) => [x + 0.25, y]);
  const corrected = refreshTopology(before, () => relation, baseline, { reassembleSource: true });
  assert.equal(corrected.stats.unreproducible, 1);
  assert.deepEqual(geometryOf(corrected.data, corrected.data.feats[0]), geometryOf(before, before.feats[0]));
  const empty = refreshTopology(bundle(), () => ({ ...relation, members: [] }), baseline, { reassembleSource: true });
  assert.equal(empty.stats.empty, 1);
  assert.equal(empty.stats.retained, 1);
  assert.deepEqual(geometryOf(empty.data, empty.data.feats[0]), [[shell, island]]);
});

test('a collapsed shell never promotes its surviving interior to land', () => {
  const collapsed = [[0, 0], [0.00001, 0], [0, 0.00001], [0, 0]];
  assert.deepEqual(detailPolys(null, 0, 4, [[collapsed, island]]), []);
  assert.deepEqual(detailPolys(null, 0, 4, [[shell, collapsed]]), [[shell]]);
});

test('refresh requires an explicit baseline parser', () => {
  assert.throws(() => refreshTopology(bundle(), () => relation), /baseline parser/);
});

test('offline topology ledger gate rejects corrupt digests and inconsistent accounting', () => {
  const result = refreshTopology(bundle(), () => relation, baseline);
  const good = { ...result.data, topology: { ...result.stats, baselineParserSha256: 'a'.repeat(64), semantics: 'source-matched ring regrouping' } };
  assert.deepEqual(topologyErrors(good), []);
  assert.deepEqual(topologyErrors(bundle()), [], 'older bundles without a refresh ledger remain readable');
  for (const patch of [
    { baselineParserSha256: 'not-a-digest' },
    { changed: -1 }, { retained: 0.5 }, { matched: undefined },
    { matched: 2 }, { retained: 1 }, { unchangedVertices: 0 },
    { changed: 2 }, { semantics: '' }, { reassembled: 1 }, { alreadyCurrent: 2 }
  ]) assert.ok(topologyErrors({ ...good, topology: { ...good.topology, ...patch } }).length, JSON.stringify(patch));
  assert.ok(topologyErrors({ ...good, topology: null }).length);
  const rebuilt = refreshTopology(bundle(), () => ({ ...relation, members: relation.members.slice(0, 1) }), baseline, { reassembleSource: true });
  assert.deepEqual(topologyErrors({ ...rebuilt.data, topology: { ...good.topology, ...rebuilt.stats } }), []);
});
