/* layer-click-polish — the lit clicked line (js/feature-highlight.js), evaluated, not grepped */
import test from 'node:test';
import assert from 'node:assert/strict';
import { identityOf, collectSame, wholeLegs, highlight, clearHighlight as clear, currentOwner } from '../js/feature-highlight.js';

const line = (coords, props, id) => ({ type: 'Feature', id, properties: props || {}, geometry: { type: 'LineString', coordinates: coords } });

/* a recording engine: the sources and layers it was asked for, and the data last written */
function fakeGE({ rendered = [] } = {}) {
  const sources = new Map(), layers = new Map(), calls = { move: 0 };
  const ge = {
    hasRenderer: () => true,
    layers: {
      hasSource: (id) => sources.has(id), addSource: (id, d) => sources.set(id, d.data),
      setSourceData: (id, d) => { if (!sources.has(id)) throw new Error('no source'); sources.set(id, d); },
      has: (id) => layers.has(id), add: (d) => layers.set(d.id, d), move: () => { calls.move++; },
    },
    coords: { queryRenderedFeatures: (g, o) => rendered.filter((f) => !o.layers || o.layers.includes(f.layer.id)) },
  };
  return { GE: () => ge, sources, layers, calls };
}

test('identity: explicit key beats feature id beats the property set', () => {
  assert.equal(identityOf(line([[0, 0], [1, 1]], { id: 'a', name: 'x' }, 7), 'id'), 'p:a');
  assert.equal(identityOf(line([[0, 0], [1, 1]], { name: 'x' }, 7)), 'i:7');
  assert.equal(identityOf(line([[0, 0], [1, 1]], { b: 2, a: 1 })), identityOf(line([[5, 5], [6, 6]], { a: 1, b: 2 })));
  assert.equal(identityOf(line([[0, 0], [1, 1]], {})), null);
});

test('collectSame joins the tile pieces of one cable and leaves other cables out', () => {
  const seed = line([[0, 0], [1, 1]], { id: 'c1' });
  const pool = [seed, line([[1, 1], [2, 2]], { id: 'c1' }), line([[9, 9], [8, 8]], { id: 'c2' }), line([[0, 0], [1, 1]], { id: 'c1' })];
  const fc = collectSame(seed, pool, 'id');
  assert.equal(fc.type, 'FeatureCollection');
  assert.equal(fc.features.length, 2, 'two distinct pieces of c1; the duplicate geometry and c2 are not drawn');
  assert.deepEqual(fc.features[1].geometry.coordinates, [[1, 1], [2, 2]]);
});

test('collectSame: a point or an unjoinable line is drawn as itself only', () => {
  assert.equal(collectSame({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }, [], 'id').features.length, 0);
  const lone = line([[0, 0], [1, 1]], {});
  assert.equal(collectSame(lone, [lone, line([[3, 3], [4, 4]], {})], 'id').features.length, 1);
});

test('highlight draws the whole viewport line in one source, glow under core, and a second click moves it', () => {
  const a1 = line([[0, 0], [1, 1]], { id: 'A' }), a2 = line([[1, 1], [2, 2]], { id: 'A' }), b = line([[5, 5], [6, 6]], { id: 'B' });
  for (const f of [a1, a2, b]) f.layer = { id: 'lyr-subcables' };
  const { GE, sources, layers } = fakeGE({ rendered: [a1, a2, b] });
  assert.equal(highlight(GE, 'subcable-info', a1, { hits: [a1], layerIds: ['lyr-subcables'], key: 'id' }), 2);
  assert.deepEqual([...layers.keys()], ['lyr-feature-hl-glow', 'lyr-feature-hl']);
  assert.equal(sources.get('src-feature-hl').features.length, 2);
  assert.equal(currentOwner(), 'subcable-info');
  assert.equal(highlight(GE, 'border-provenance', b, { hits: [b], layerIds: ['lyr-subcables'], key: 'id' }), 1);
  assert.equal(sources.get('src-feature-hl').features.length, 1, 'one highlight on the map, never two');
  assert.equal(layers.size, 2, 'layers are not duplicated');
});

test('clear is owner-scoped and idempotent', () => {
  const a = line([[0, 0], [1, 1]], { id: 'A' }); a.layer = { id: 'L' };
  const { GE, sources } = fakeGE({ rendered: [a] });
  highlight(GE, 'card', a, { hits: [a], layerIds: ['L'], key: 'id' });
  clear(GE, 'someone-else');
  assert.equal(sources.get('src-feature-hl').features.length, 1, 'a stale owner cannot clear another card\'s line');
  clear(GE, 'card'); clear(GE, 'card'); clear(GE);
  assert.equal(sources.get('src-feature-hl').features.length, 0);
  assert.equal(currentOwner(), null);
});

test('a missing renderer or a vanished style never throws', () => {
  const dead = { hasRenderer: () => false };
  assert.equal(highlight(() => dead, 'x', line([[0, 0], [1, 1]], {})), 0);
  const gone = { hasRenderer: () => true, layers: { hasSource: () => { throw new Error('style gone'); } }, coords: { queryRenderedFeatures: () => { throw new Error('x'); } } };
  assert.equal(highlight(() => gone, 'x', line([[0, 0], [1, 1]], {})), 0);
  assert.doesNotThrow(() => clear(() => gone, 'x'));
});

/* ── the rows during which the globe has no air: their own declaration, read through the manifest ── */
import { noAirItems } from '../js/layer-manifest.js';
import { descriptorProblems } from '../scripts/lib/layer-descriptor.mjs';
import fs from 'node:fs';

test('noAir: the manifest returns exactly the rows whose own file declares it', async () => {
  const declared = [];
  for (const f of fs.readdirSync(new URL('../js/layers/', import.meta.url))) {
    if (!/^[a-z].*\.js$/.test(f)) continue;
    const d = (await import('../js/layers/' + f)).default;
    if (d && d.noAir === true) declared.push(d.id);
  }
  assert.deepEqual(noAirItems().slice().sort(), declared.sort());
  /* the reader's six (2026-11-18): Night Lights, Wind, Temperature, Precipitation (forecast), Sea-level pressure, Wind gusts */
  for (const id of ['dl-nightsat', 'dl-wind', 'dl-ec-temp', 'dl-ec-precip', 'dl-ec-slp', 'dl-ec-gust']) assert.ok(noAirItems().includes(id), id);
});

test('noAir: written only when true, like every other row flag', () => {
  const shelves = new Set(['lyrGrpClimate']);
  assert.deepEqual(descriptorProblems({ id: 'dl-x', shelf: 'lyrGrpClimate', order: 1, noAir: true }, 'dl-x.js', shelves), []);
  assert.ok(descriptorProblems({ id: 'dl-x', shelf: 'lyrGrpClimate', order: 1, noAir: false }, 'dl-x.js', shelves).some((m) => /noAir/.test(m)));
});

test('wholeLegs: the whole legs of the clicked cable from its source, not the clipped seed', () => {
  const seed = line([[-40, 45], [-35, 47]], { id: 'havfrueaec-2' });   /* a tile clipping */
  const src = [line([[-74, 40], [-66, 38]], { id: 'havfrueaec-2' }), line([[-66, 38], [-16, 55]], { id: 'havfrueaec-2' }), line([[0, 0], [1, 1]], { id: 'other' })];
  const fc = wholeLegs(seed, src, 'id');
  assert.equal(fc.features.length, 2);
  assert.ok(fc.features.every((x) => x.geometry.coordinates[0][0] !== -40));
  assert.equal(wholeLegs(line([[0, 0], [1, 1]], {}), src, 'id').features.length, 0);
});
