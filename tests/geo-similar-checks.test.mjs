/* js/geo-similar.js — 地域の特徴ベクトルによる類似検索（純粋部分を評価で測る）。
   外部への問い合わせは countFor に注入するので、網に触れず node で走る。実データでの検証は
   dev-notes/2026-11-20-geo-similar.md に測定として残す（網に依存する検査を CI に置かない）。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, bboxAreaKm2, squareAround, gridCells, buildCountQuery, parseCounts, standardise, rankSimilar, measureCells, findSimilar } from '../js/geo-similar.js';

const N = FEATURES.length, idx = (id) => FEATURES.findIndex((f) => f.id === id);
const vec = (o) => FEATURES.map((f) => o[f.id] || 0);
const row = (o, name) => ({ counts: vec(o), areaKm2: 4, name });

test('the query asks one count per feature, in the vector order, and refuses a short answer', () => {
  const q = buildCountQuery([113.9, 22.5, 113.95, 22.55]);
  assert.equal((q.match(/out count;/g) || []).length, N);
  assert.ok(q.includes('(22.500000,113.900000,22.550000,113.950000)'), 'south,west,north,east order');
  assert.throws(() => parseCounts({ elements: [{ type: 'count', tags: { total: '3' } }] }), /counts for/);
  const ok = parseCounts({ elements: FEATURES.map((_, i) => ({ type: 'count', tags: { total: String(i) } })) });
  assert.deepEqual(ok, FEATURES.map((_, i) => i));
});

test('a district like the query ranks above a different one, and the contributions sum to the score', () => {
  const q = row({ buildings: 900, offices: 120, food: 200, roads_local: 60 });
  const near = row({ buildings: 800, offices: 100, food: 180, roads_local: 55 }, 'near');
  const port = row({ industrial: 300, port: 40, port_land: 5, cranes: 12, buildings: 100 }, 'port');
  const park = row({ green: 30, water: 8, buildings: 5 }, 'park');
  const r = rankSimilar(q, [port, near, park], { k: 3 });
  assert.equal(r.results[0].cell.name, 'near');
  assert.ok(r.results[0].score > r.results[1].score);
  const top = r.results[0];
  assert.ok(top.because.length > 0 && top.because.every((b) => b.share > 0), 'because lists positive contributors only');
  assert.ok(r.results.at(-1).differs.length > 0, 'the least similar one says what differs');
  /* the explanation is not decoration: the shares are the terms of the score */
  const st = standardise([q, near, port, park]);
  const zq = st.Z[0], zc = st.Z[1], dot = zq.reduce((s, v, i) => s + v * zc[i], 0);
  const cos = dot / (Math.hypot(...zq) * Math.hypot(...zc));
  assert.ok(Math.abs(cos - top.score) < 1e-9);
});

test('a feature nobody in the set differs on is dropped and said, never silently', () => {
  const rows = [row({ buildings: 10, water: 0 }), row({ buildings: 50, water: 0 }), row({ buildings: 90, water: 0 })];
  const st = standardise(rows);
  assert.ok(st.dropped.includes('water'));
  assert.equal(st.keep[idx('water')], false);
  assert.ok(!st.dropped.includes('buildings'));
});

test('an unmapped reference is measured as below the set, so the emptiest candidate is its nearest — and a reference equal to the set mean is an error', () => {
  const empty = row({});
  const r = rankSimilar(empty, [row({ buildings: 500, food: 80, name: 'dense' }, 'dense'), row({ buildings: 2 }, 'sparse'), row({ buildings: 90, food: 9 }, 'mid')]);
  assert.equal(r.results[0].cell.name, 'sparse');
  const mean = rankSimilar(row({ buildings: 10 }), [row({ buildings: 10 }), row({ buildings: 10 })]);
  assert.equal(mean.error, 'QUERY_FLAT');
});

test('density, not count: the same district at half the size ranks as the same', () => {
  const q = { counts: vec({ buildings: 800, food: 100 }), areaKm2: 4 };
  const half = { counts: vec({ buildings: 400, food: 50 }), areaKm2: 2, name: 'half' };
  const other = { counts: vec({ buildings: 40, food: 2, green: 90 }), areaKm2: 4, name: 'other' };
  const r = rankSimilar(q, [other, half, { counts: vec({ buildings: 300, food: 10 }), areaKm2: 4, name: 'mid' }]);
  assert.equal(r.results[0].cell.name, 'half');
});

test('geometry: squares have the asked area, the grid is centre-first and says when it truncated', () => {
  const b = squareAround(22.54, 113.95, 2);
  assert.ok(Math.abs(bboxAreaKm2(b) - 4) < 0.05);
  const g = gridCells([113.8, 22.4, 114.0, 22.6], 2, 10);
  assert.equal(g.cells.length, 10);
  assert.ok(g.truncated && g.total > 10);
  const cx = 113.9, cy = 22.5, d = (c) => (c.lng - cx) ** 2 + (c.lat - cy) ** 2;
  assert.ok(d(g.cells[0]) <= d(g.cells[9]));
});

test('a cell the source did not answer is reported as failed, and counts as neither similar nor dissimilar', async () => {
  const cells = [0, 1, 2].map((i) => ({ bbox: squareAround(10 + i, 10, 2), lat: 10 + i, lng: 10 }));
  let n = 0;
  const m = await measureCells(cells, async () => { if (n++ === 1) throw new Error('http 429'); return vec({ buildings: 5 }); });
  assert.equal(m.rows.length, 2);
  assert.equal(m.failed.length, 1);
  assert.match(m.failed[0].reason, /429/);
});

test('a source that never answers is given up on after a few failures, the rest reported as not asked; a reference that cannot be read asks no candidate at all', async () => {
  const cells = Array.from({ length: 10 }, (_, i) => ({ bbox: squareAround(10 + i, 10, 2), lat: 10 + i, lng: 10 }));
  let asked = 0;
  const m = await measureCells(cells, async () => { asked++; throw new Error('down'); }, { concurrency: 1, giveUpAfter: 3 });
  assert.equal(asked, 3);
  assert.equal(m.notAsked, 7);
  let askedQ = 0;
  const r = await findSimilar({ query: { lat: 1, lng: 1 }, within: [0.9, 0.9, 1.3, 1.3], cellKm: 2 }, async () => { askedQ++; throw new Error('down'); });
  assert.equal(r.code, 'QUERY_UNREAD');
  assert.equal(askedQ, 1);
});

test('findSimilar: coverage names what was scanned, an unreadable reference is not "no similar region"', async () => {
  const fake = async (bbox) => {
    const lat = (bbox[1] + bbox[3]) / 2;
    return vec({ buildings: Math.round(100 + 40 * Math.sin(lat * 50)), food: Math.round(20 + 10 * Math.cos(lat * 50)), industrial: Math.round(5 * Math.abs(Math.sin(lat * 7))) });
  };
  const r = await findSimilar({ query: { lat: 22.54, lng: 113.95 }, within: [113.85, 22.44, 114.05, 22.64], cellKm: 2, maxCells: 20, k: 4 }, fake);
  assert.equal(r.ok, true);
  assert.equal(r.results.length, 4);
  assert.equal(r.coverage.measured, 20);
  assert.ok(r.coverage.truncated && r.coverage.total > 20, 'the scan was capped and the answer says so');
  const none = await findSimilar({ query: { lat: 1, lng: 1 }, within: [0.9, 0.9, 1.1, 1.1], cellKm: 2 }, async () => { throw new Error('down'); });
  assert.equal(none.ok, false);
  assert.equal(none.code, 'QUERY_UNREAD');
  const named = await findSimilar({ query: { lat: 22.54, lng: 113.95 }, candidates: [{ name: 'a', lat: 22.6, lng: 114 }, { name: 'b', lat: 22.7, lng: 114.1 }, { name: 'c', lat: 22.3, lng: 113.9 }, { name: 'd', lat: 22.5, lng: 114.2 }], cellKm: 2 }, fake);
  assert.equal(named.results[0].cell.name != null, true, 'named candidates keep their names');
});
