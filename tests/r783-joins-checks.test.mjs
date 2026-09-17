/* ============================================================================
 *  #R783 · 異なるデータを組み合わせる — 空間結合・最近傍・時間結合・単位換算・集計の可否
 * ----------------------------------------------------------------------------
 *  The outside review's §9 named four things the ops layer could not do, and all four are about
 *  COMBINING records rather than about computing one:
 *
 *    「汎用空間結合（区域内の施設・災害範囲と地物を、相手の属性付きで。1 対多を明示的に）」
 *    「最近傍結合（各地物から最寄りの対象を、距離と対象 ID 付きで）」
 *    「時点・期間に基づく結合（当時の区域・観測時点の統計・期間が重なるイベント）」
 *    「明示的な単位変換（手作業の倍率計算ではなく、換算前後の単位と変換をレシピに残す）」
 *
 *  …and §9 also said the two ops that AGGREGATE were not reading js/gis-units.js's verdict about
 *  whether the arithmetic means anything for the quantity.
 *
 *    ① 1 対多が、取りこぼしも重複もなく返る（件数と ID の集合で測る）
 *    ② 1 対多のとき何が起きるかは呼び手が述べる — 既定で黙って先頭を採らない
 *    ③ 最近傍は本当に最寄り — 索引ありの答えを全探索の答えと突き合わせる
 *    ④ 時点結合が境界の瞬間で正しい（開始日・終了日そのもの・裸の年・半開）
 *    ⑤ 空の結果と「できなかった」は別の答え
 *    ⑥ 換算前後の単位と使った変換が、レシピを読み返すと在る
 *    ⑦ 換算できない組は、係数を掛けずに理由のある拒否になる
 *    ⑧ 集計の可否は js/gis-units.js に訊かれ、未申告は黙って allowed にならない
 *    ⑨ 宣言と実行が食い違わない（新しい op に runner があり、面と語彙を述べている）
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* js/geodesy.js publishes onto `window` and exports nothing — evaluated the way a browser does. */
function installWindow() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  return w;
}

/* `opts.without` leaves a kernel unmounted, which is how ⑤ and ⑦ tell 「訊けなかった」 from
   「0 件」. ⚠ EACH FACTORY PUBLISHES ITSELF onto `window` as its last act (js/gis-core.js is the
   only mounting point in the product), so a kernel is left out by NOT BUILDING IT — skipping the
   assignment would leave the module mounted anyway and this file would be measuring nothing. */
async function boot(opts) {
  const o = opts || {};
  const without = Array.isArray(o.without) ? o.without : [];
  const has = (k) => without.indexOf(k) < 0;
  const w = installWindow();
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets();
  let geometry = null, index = null, units = null;
  if (has('geometry')) { geometry = (await import('../js/gis-geometry.js')).makeGisGeometry(); }
  if (has('index')) { index = (await import('../js/gis-index.js')).makeGisIndex(); }
  if (has('units')) { units = (await import('../js/gis-units.js')).makeGisUnits(); }
  const ops = makeGisOps();
  w.IntMapData = data;
  w.IntMapGisOps = ops;
  if (geometry) await geometry.ready();
  return { w, data, ops, geometry, index, units };
}

const pt = (lng, lat, props) => ({ type: 'Feature', properties: props || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });
const poly = (ring, props) => ({ type: 'Feature', properties: props || {}, geometry: { type: 'Polygon', coordinates: [ring] } });
const box = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const rowOnly = (props) => ({ type: 'Feature', properties: props, geometry: null });

/* ══ ① 1 対多が、取りこぼしも重複もなく返る ═══════════════════════════════════════════════ */

test('R783 ① a one-to-many spatial join loses nothing and duplicates nothing', async () => {
  const { data, ops } = await boot();

  /* Two wards, and clinics whose ward is known BY CONSTRUCTION — so the expected pairs are a fact
     about the fixture rather than a second run of the thing being measured. */
  const wards = data.add({
    title: 'Wards',
    features: [
      poly(box(0, 0, 1, 1), { ward: 'west' }),
      poly(box(1, 0, 2, 1), { ward: 'east' }),
    ],
  });
  const clinicRows = [];
  const expected = { west: [], east: [] };
  for (let i = 0; i < 40; i++) {
    const west = (i % 3) !== 0;
    const lng = west ? (0.05 + (i % 9) * 0.1) : (1.05 + (i % 9) * 0.1);
    const id = 'c' + i;
    clinicRows.push(pt(lng, 0.2 + (i % 7) * 0.1, { id: id, beds: 10 + i }));
    expected[west ? 'west' : 'east'].push(id);
  }
  /* One clinic outside both wards: it must appear in NO pair. */
  clinicRows.push(pt(5, 5, { id: 'far', beds: 1 }));
  const clinics = data.add({ title: 'Clinics', features: clinicRows });

  const res = await ops.run({
    op: 'spatialJoin', inputs: [wards.id, clinics.id],
    params: { predicate: 'intersects', cardinality: 'all', prefix: 'c_' },
  });
  assert.equal(res.ok, true, 'spatialJoin refused: ' + res.why + ' ' + JSON.stringify(res.detail));

  const rows = data.get(res.dataset.id).features();
  /* ⚠ 件数で測るだけでは「取りこぼし」と「重複」が打ち消し合う。ID の集合で測る。 */
  assert.equal(rows.length, expected.west.length + expected.east.length, 'the pair count is not the number of pairs the fixture has');
  const got = { west: [], east: [] };
  for (const r of rows) got[r.properties.ward].push(r.properties.c_id);
  for (const ward of ['west', 'east']) {
    const a = got[ward].slice().sort(), b = expected[ward].slice().sort();
    assert.deepEqual(a, b, ward + ': the partners are not exactly the ones inside it');
    assert.equal(new Set(a).size, a.length, ward + ': a clinic was handed over twice');
  }
  /* The count of partners rides on the row, so 'first' cannot look like 1-to-1 (see ②). */
  assert.equal(rows.filter((r) => r.properties.ward === 'west')[0].properties._joinPartners, expected.west.length);
  assert.equal(res.stats.pairs, rows.length);
  assert.equal(res.stats.matched, 2);
  assert.equal(res.stats.unmatched, 0);
  assert.equal(res.stats.oneToMany, 2);

  /* ⚠ AND THE INDEXED AND UNINDEXED PATHS ANSWER THE SAME THING. An index that dropped a true pair
     would make this count quietly smaller (js/gis-index.js's own promise), and an agreement between
     two readers of one wrong rule is not a measurement — so the reference is the walk without it. */
  const plain = await boot({ without: ['index'] });
  const w2 = plain.data.add({ title: 'Wards', features: data.get(wards.id).features() });
  const c2 = plain.data.add({ title: 'Clinics', features: data.get(clinics.id).features() });
  const res2 = await plain.ops.run({
    op: 'spatialJoin', inputs: [w2.id, c2.id],
    params: { predicate: 'intersects', cardinality: 'all', prefix: 'c_' },
  });
  assert.equal(res2.ok, true, 'the unindexed walk refused: ' + res2.why);
  assert.equal(res.stats.indexed, true, 'the indexed run did not use the index');
  assert.equal(res2.stats.indexed, false, 'the reference run used an index');
  const ids = (d, recs) => recs.features().map((r) => r.properties.ward + '/' + r.properties.c_id).sort();
  assert.deepEqual(ids(data, data.get(res.dataset.id)), ids(plain.data, plain.data.get(res2.dataset.id)),
    'the index changed which pairs exist');
});

/* ══ ② 1 対多のとき何が起きるかは、呼び手が述べる ═════════════════════════════════════════ */

test('R783 ② the cardinality is stated, and `first` is input 1s first row rather than the index order', async () => {
  const { data, ops } = await boot();
  const zone = data.add({ title: 'Zone', features: [poly(box(0, 0, 1, 1), { z: 'z' })] });
  const inside = data.add({
    title: 'Inside',
    features: [pt(0.9, 0.9, { id: 'a' }), pt(0.1, 0.1, { id: 'b' }), pt(0.5, 0.5, { id: 'c' })],
  });

  /* ⚠ NO DEFAULT. A silently-picked cardinality makes the row count depend on data the reader has
     not looked at, and the refusal carries the set so the caller needs no second attempt. */
  const nude = await ops.run({ op: 'spatialJoin', inputs: [zone.id, inside.id], params: { predicate: 'intersects' } });
  assert.equal(nude.ok, false);
  assert.equal(nude.why, 'missing-param');
  assert.equal(nude.detail.param, 'cardinality');
  assert.deepEqual(nude.detail.values, ['all', 'first', 'refuse']);

  const refused = await ops.run({ op: 'spatialJoin', inputs: [zone.id, inside.id], params: { predicate: 'intersects', cardinality: 'refuse' } });
  assert.equal(refused.ok, false);
  assert.equal(refused.why, 'join-one-to-many');
  assert.equal(refused.detail.partners, 3);
  assert.equal(refused.dataset, undefined, 'a refused join registered a dataset anyway');

  const first = await ops.run({ op: 'spatialJoin', inputs: [zone.id, inside.id], params: { predicate: 'intersects', cardinality: 'first', prefix: 'p_' } });
  assert.equal(first.ok, true, 'spatialJoin refused: ' + first.why);
  const rows = data.get(first.dataset.id).features();
  assert.equal(rows.length, 1);
  /* 'a' is the first ROW of input 1 and the furthest point from the zone's origin — so an
     implementation that took whichever partner the grid visited first would answer 'b' or 'c'. */
  assert.equal(rows[0].properties.p_id, 'a', "'first' is not input 1's first matching row");
  assert.equal(rows[0].properties._joinPartners, 3, "'first' hid the fact that there were three");
});

/* ══ ③ 最近傍は本当に最寄り ═══════════════════════════════════════════════════════════════ */

test('R783 ③ the nearest join answers the true nearest — measured against the exhaustive walk', async () => {
  const { data, ops, geometry } = await boot();

  /* 400 targets in a grid plus a handful far away, and 60 subjects scattered over and past them:
     enough that js/gis-index.js is really doing the work, and coarse enough to run in a test. */
  const targets = [];
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) targets.push(pt(0.37 * i, 0.29 * j, { id: 't' + i + '_' + j }));
  targets.push(pt(60, 40, { id: 'far1' }));
  targets.push(pt(-70, -20, { id: 'far2' }));
  const stations = data.add({ title: 'Stations', features: targets });

  const subjects = [];
  for (let k = 0; k < 60; k++) {
    subjects.push(pt(-1 + (k * 0.191) % 9, -1 + (k * 0.137) % 7, { id: 's' + k }));
  }
  const homes = data.add({ title: 'Homes', features: subjects });

  const res = await ops.run({
    op: 'nearestJoin', inputs: [homes.id, stations.id],
    params: { idField: 'id', fields: ['id'], prefix: 'n_' },
  });
  assert.equal(res.ok, true, 'nearestJoin refused: ' + res.why + ' ' + JSON.stringify(res.detail));
  const rows = data.get(res.dataset.id).features();
  assert.equal(rows.length, subjects.length, 'the join changed the row count of a 1-to-1 op');

  /* ⚠ THE EXPECTED ANSWER IS THE FULL WALK, NOT THE INDEXED ONE. Comparing the index against
     itself measures the index's consistency and not its correctness (#R743). */
  for (let k = 0; k < subjects.length; k++) {
    let best = Infinity, bestId = null;
    for (const t of targets) {
      const d = geometry.distanceKm(subjects[k].geometry, t.geometry);
      if (d != null && d < best) { best = d; bestId = t.properties.id; }
    }
    const row = rows[k];
    assert.equal(row.properties.id, 's' + k, 'the rows came back in a different order');
    assert.equal(row.properties._nearestId, bestId,
      's' + k + ': the join says ' + row.properties._nearestId + ' and the exhaustive walk says ' + bestId);
    assert.ok(Math.abs(row.properties._nearestKm - best) < 1e-9,
      's' + k + ': the distance is ' + row.properties._nearestKm + ' and the walk measured ' + best);
    assert.equal(typeof row.properties._nearestRow, 'number', 'the answer does not say which row it measured to');
  }

  /* ⚠ `maxKm` IS A LIMIT AND NOT A SEARCH RADIUS: a subject with nothing inside it has NO partner,
     which is a different answer from 「一番近いのは遠かった」. */
  const lonely = data.add({ title: 'Lonely', features: [pt(120, 60, { id: 'x' })] });
  const near = await ops.run({ op: 'nearestJoin', inputs: [lonely.id, stations.id], params: { maxKm: 10, prefix: 'n_' } });
  assert.equal(near.ok, true, 'nearestJoin refused: ' + near.why);
  const lone = data.get(near.dataset.id).features()[0];
  assert.equal(lone.properties._nearestKm, undefined, 'a row with nothing within 10 km was given a partner');
  assert.equal(near.stats.unmatched, 1);
  assert.equal(near.stats.matched, 0);

  /* …and the same row DOES get a partner with no limit, so the check above is not passing on an
     implementation that never matches anything. */
  const any = await ops.run({ op: 'nearestJoin', inputs: [lonely.id, stations.id], params: { prefix: 'm_' } });
  assert.equal(any.ok, true, 'nearestJoin refused: ' + any.why);
  assert.equal(data.get(any.dataset.id).features()[0].properties._nearestKm > 10, true);

  /* A tie is reported rather than silently broken: the lowest row of input 1 wins. */
  const mid = data.add({ title: 'Mid', features: [pt(0, 0, { id: 'm' })] });
  const two = data.add({ title: 'Two', features: [pt(-1, 0, { id: 'left' }), pt(1, 0, { id: 'right' })] });
  const tie = await ops.run({ op: 'nearestJoin', inputs: [mid.id, two.id], params: { idField: 'id', fields: ['id'], prefix: 't_' } });
  assert.equal(tie.ok, true, 'nearestJoin refused: ' + tie.why);
  assert.equal(tie.stats.ties, 1, 'a tie was not reported');
  assert.equal(data.get(tie.dataset.id).features()[0].properties._nearestId, 'left', 'the tie was not broken by input 1s order');
});

/* ══ ④ 時点結合が、境界の瞬間で正しい ═════════════════════════════════════════════════════ */

test('R783 ④ the temporal join reads the boundary half-open — the day belongs to the successor', async () => {
  const { data, ops } = await boot();

  /* 廃藩置県: the 国 ends on 1871-08-29 and the 県 begins on 1871-08-29. Both upstreams state that
     same day, and 「その日の区域」 has one answer under [from, to) and two under [from, to]. */
  const units = data.add({
    title: 'Units',
    features: [
      rowOnly({ unit: 'kuni', from: '1868-01-01', to: '1871-08-29' }),
      rowOnly({ unit: 'ken', from: '1871-08-29', to: '' }),
    ],
    time: { kind: 'interval', startField: 'from', endField: 'to' },
  });
  const obs = data.add({ title: 'Obs', features: [rowOnly({ id: 'o1' })] });

  const ask = (at, ends) => ops.run({
    op: 'timeJoin', inputs: [obs.id, units.id],
    params: { at: at, ends: ends, cardinality: 'all', fields: ['unit'], prefix: 'u_' },
  });

  const onTheDay = await ask('1871-08-29', 'exclusive');
  assert.equal(onTheDay.ok, true, 'timeJoin refused: ' + onTheDay.why + ' ' + JSON.stringify(onTheDay.detail));
  assert.deepEqual(data.get(onTheDay.dataset.id).features().map((f) => f.properties.u_unit), ['ken'],
    'the stated end instant was counted as still holding');

  const before = await ask('1871-08-28', 'exclusive');
  assert.deepEqual(data.get(before.dataset.id).features().map((f) => f.properties.u_unit), ['kuni'],
    'the day before the end is not inside the span');

  /* ⚠ AND THE OTHER READING IS REACHABLE AND DIFFERENT. A check that only ever sees one answer
     cannot tell a half-open implementation from one that hard-codes the successor. */
  const inclusive = await ask('1871-08-29', 'inclusive');
  assert.deepEqual(data.get(inclusive.dataset.id).features().map((f) => f.properties.u_unit).sort(), ['ken', 'kuni'],
    'the inclusive reading did not keep the row whose last instant that is');
  assert.equal(onTheDay.stats.ends, 'exclusive');
  assert.equal(onTheDay.stats.endsRead.statedEnd > 0, true, 'the answer does not say how the ends were read');

  /* 裸の年はその年 1 年 — and its exclusive bound is the first instant of the next year. */
  const years = data.add({
    title: 'Years',
    features: [rowOnly({ era: 'meiji4', from: '1871', to: '1871' })],
    time: { kind: 'interval', startField: 'from', endField: 'to' },
  });
  const yearAt = (at) => ops.run({
    op: 'timeJoin', inputs: [obs.id, years.id],
    params: { at: at, cardinality: 'all', fields: ['era'], prefix: 'y_' },
  });
  const lastDay = await yearAt('1871-12-31');
  assert.equal(data.get(lastDay.dataset.id).features()[0].properties.y_era, 'meiji4', 'a bare year did not cover its own 31 December');
  const nextDay = await yearAt('1872-01-01');
  assert.equal(nextDay.stats.matched, 0, 'a bare year reached into the next one');
  assert.equal(nextDay.ok, true, 'a year that does not match is a refusal rather than an answer');

  /* A window, and the same half-open rule for the reader's own `to`. */
  const win = await ops.run({
    op: 'timeJoin', inputs: [obs.id, units.id],
    params: { from: '1871-08-01', to: '1871-08-29', cardinality: 'all', fields: ['unit'], prefix: 'w_' },
  });
  assert.deepEqual(data.get(win.dataset.id).features().map((f) => f.properties.w_unit), ['kuni'],
    'the window included the instant it stops at');

  /* 期間が重なるイベント: both sides read from their own axes, and `within`/`contains` are exact. */
  const events = data.add({
    title: 'Events',
    features: [rowOnly({ ev: 'long', from: '1869', to: '1875' }), rowOnly({ ev: 'short', from: '1870-06-01', to: '1870-06-10' })],
    time: { kind: 'interval', startField: 'from', endField: 'to' },
  });
  const spans = data.add({
    title: 'Spans',
    features: [rowOnly({ sp: '1870', from: '1870', to: '1870' })],
    time: { kind: 'interval', startField: 'from', endField: 'to' },
  });
  const overlaps = await ops.run({ op: 'timeJoin', inputs: [events.id, spans.id], params: { relation: 'overlaps', cardinality: 'all', fields: ['sp'], prefix: 's_' } });
  assert.equal(overlaps.stats.matched, 2, 'both events overlap 1870');
  const within = await ops.run({ op: 'timeJoin', inputs: [events.id, spans.id], params: { relation: 'within', cardinality: 'all', fields: ['sp'], prefix: 'v_' } });
  assert.equal(within.stats.matched, 1, 'only the ten-day event is inside 1870');
  assert.deepEqual(data.get(within.dataset.id).features().filter((f) => f.properties.v_sp).map((f) => f.properties.ev), ['short']);

  /* An axis is REQUIRED of the side being asked when it holds, and the refusal says which input. */
  const noAxis = await ops.run({ op: 'timeJoin', inputs: [obs.id, obs.id], params: { at: '1871', cardinality: 'all' } });
  assert.equal(noAxis.ok, false);
  assert.equal(noAxis.why, 'time-not-declared');
  assert.equal(noAxis.detail.input, 1);
  const noLeft = await ops.run({ op: 'timeJoin', inputs: [obs.id, units.id], params: { cardinality: 'all' } });
  assert.equal(noLeft.ok, false);
  assert.equal(noLeft.why, 'time-not-declared');
  assert.equal(noLeft.detail.input, 0, 'a left side with neither an axis nor a stated moment was accepted');
});

/* ══ ⑤ 空の結果と「できなかった」は別の答え ═══════════════════════════════════════════════ */

test('R783 ⑤ nothing matched, no partner to match against, and could not be asked are three answers', async () => {
  const { data, ops } = await boot();
  const here = data.add({ title: 'Here', features: [poly(box(0, 0, 1, 1), { a: 1 })] });
  const there = data.add({ title: 'There', features: [pt(50, 50, { b: 2 })] });

  /* ⑴ a real answer of zero: the run worked and the data does not meet. */
  const none = await ops.run({ op: 'spatialJoin', inputs: [here.id, there.id], params: { predicate: 'intersects', cardinality: 'all', prefix: 'x_' } });
  assert.equal(none.ok, true, 'a join that matched nothing was reported as a failure');
  assert.equal(none.stats.matched, 0);
  assert.equal(none.stats.unmatched, 1);
  assert.equal(data.get(none.dataset.id).count, 1, 'the unmatched row was dropped without being asked to be');
  const dropped = await ops.run({ op: 'spatialJoin', inputs: [here.id, there.id], params: { predicate: 'intersects', cardinality: 'all', unmatched: 'drop', prefix: 'y_' } });
  assert.equal(data.get(dropped.dataset.id).count, 0, 'unmatched:drop kept the row');

  /* ⑵ the right-hand input has no geometry at all — a fact about the inputs, not about the data. */
  const table = data.add({ title: 'Table', features: [rowOnly({ code: '01100' })] });
  const noGeom = await ops.run({ op: 'spatialJoin', inputs: [here.id, table.id], params: { predicate: 'intersects', cardinality: 'all' } });
  assert.equal(noGeom.ok, false);
  assert.ok(noGeom.why === 'no-features' || noGeom.why === 'input-has-no-geometry', 'a table joined spatially answered ' + noGeom.why);

  /* ⑶ the kernel that decides the relation is not mounted: 「訊けなかった」, by name, and NOT an
     empty success. */
  const blind = await boot({ without: ['geometry'] });
  const h2 = blind.data.add({ title: 'Here', features: [poly(box(0, 0, 1, 1), { a: 1 })] });
  const t2 = blind.data.add({ title: 'There', features: [pt(0.5, 0.5, { b: 2 })] });
  const unasked = await blind.ops.run({ op: 'spatialJoin', inputs: [h2.id, t2.id], params: { predicate: 'intersects', cardinality: 'all', prefix: 'z_' } });
  assert.equal(unasked.ok, false, 'a join with no geometry kernel answered with rows');
  assert.ok(unasked.why === 'geometry-missing' || unasked.why === 'geometry-unavailable', 'the refusal is ' + unasked.why);
});

/* ══ ⑥ 換算前後の単位と使った変換が、レシピに残る ═════════════════════════════════════════ */

test('R783 ⑥ the conversion states what it was in, what it is in, and the transform — in the recipe', async () => {
  const { data, ops } = await boot();
  const ds = data.add({
    title: 'Roads',
    features: [pt(0, 0, { name: 'a', len: 1500 }), pt(1, 1, { name: 'b', len: 250 })],
    fieldStatements: { len: { unit: 'm', unitStated: 'reader' } },
  });
  assert.equal(data.get(ds.id).fields.find((f) => f.name === 'len').unit, 'm', 'the fixture did not carry a unit');

  const res = await ops.run({ op: 'convert', inputs: [ds.id], params: { field: 'len', to: 'km', outName: 'len_km' } });
  assert.equal(res.ok, true, 'convert refused: ' + res.why + ' ' + JSON.stringify(res.detail));
  const rows = data.get(res.dataset.id).features();
  assert.equal(rows[0].properties.len_km, 1.5, 'the values were not converted');
  assert.equal(rows[1].properties.len_km, 0.25);
  assert.equal(rows[0].properties.len, 1500, 'the source column was rewritten');

  /* ⚠ READ BACK OFF THE RECORD, not off the return value: `stats` is printed for this turn and
     written nowhere (#R763), so a manifest holding only `params` would never say what the column
     had been in — the reader states only the TARGET, because the source is on the column. */
  const prov = data.get(res.dataset.id).provenance;
  assert.equal(prov.kind, 'op');
  assert.equal(prov.op, 'convert');
  assert.ok(prov.resolved, 'the recipe does not record what the run resolved');
  assert.equal(prov.resolved.from, 'm', 'the recipe does not say what the column was in');
  assert.equal(prov.resolved.to, 'km');
  assert.equal(prov.resolved.fromStatedBy, 'column');
  assert.equal(prov.resolved.transform.slope, 0.001, 'the recipe does not carry the transform that was used');
  assert.equal(prov.resolved.transform.intercept, 0);
  assert.equal(prov.resolved.transform.kind, 'factor');
  /* …and the output column carries the unit it is now in, authored by the op. */
  const col = data.get(res.dataset.id).fields.find((f) => f.name === 'len_km');
  assert.equal(col.unit, 'km', 'the converted column does not state its own unit');

  /* An affine pair is a map and not a 倍率, and which reading was used is in the recipe too. */
  const temps = data.add({
    title: 'Temps', features: [pt(0, 0, { t: 10 })],
    fieldStatements: { t: { unit: '°C', unitStated: 'reader' } },
  });
  const reading = await ops.run({ op: 'convert', inputs: [temps.id], params: { field: 't', to: 'K', outName: 'tK' } });
  assert.equal(reading.ok, true, 'convert refused: ' + reading.why + ' ' + JSON.stringify(reading.detail));
  assert.ok(Math.abs(data.get(reading.dataset.id).features()[0].properties.tK - 283.15) < 1e-9, 'a 10 °C reading is 283.15 K');
  const rp = data.get(reading.dataset.id).provenance.resolved;
  assert.equal(rp.transform.kind, 'affine');
  assert.equal(rp.difference, false);
  const gap = await ops.run({ op: 'convert', inputs: [temps.id], params: { field: 't', to: 'K', outName: 'dK', difference: true } });
  assert.equal(data.get(gap.dataset.id).features()[0].properties.dK, 10, 'a 10 °C difference is 10 K');
  assert.equal(data.get(gap.dataset.id).provenance.resolved.difference, true);

  /* `replace` keeps the name and moves the unit with the values. */
  const inPlace = await ops.run({ op: 'convert', inputs: [ds.id], params: { field: 'len', to: 'km', replace: true } });
  assert.equal(inPlace.ok, true, 'convert refused: ' + inPlace.why);
  const rec = data.get(inPlace.dataset.id);
  assert.equal(rec.features()[0].properties.len, 1.5);
  assert.equal(rec.fields.find((f) => f.name === 'len').unit, 'km', 'the replaced column still claims the old unit');
});

/* ══ ⑦ 換算できない組は、係数を掛けずに理由のある拒否になる ═══════════════════════════════ */

test('R783 ⑦ a pair that cannot be converted is refused by name, never multiplied anyway', async () => {
  const { data, ops } = await boot();
  const ds = data.add({
    title: 'Mixed',
    features: [pt(0, 0, { len: 1500, mass: 2, code: '01100', plain: 5 })],
    fieldStatements: { len: { unit: 'm', unitStated: 'reader' }, mass: { unit: 'kg', unitStated: 'reader' }, code: { unit: 'm', unitStated: 'reader' } },
  });

  const cases = [
    [{ field: 'len', to: 'kg', outName: 'x' }, 'unit-incompatible'],
    [{ field: 'len', to: 'furlong', outName: 'x' }, 'unit-unreadable'],
    [{ field: 'plain', to: 'km', outName: 'x' }, 'unit-not-stated'],
    [{ field: 'len', from: 'km', to: 'm', outName: 'x' }, 'unit-from-contradicts-column'],
    [{ field: 'nope', to: 'km', outName: 'x' }, 'unknown-field'],
    [{ field: 'len', to: 'km' }, 'missing-param'],
    [{ field: 'len', to: 'km', outName: 'mass' }, 'output-column-in-use'],
    [{ field: 'code', to: 'km', outName: 'x' }, 'convert-nothing-numeric'],
  ];
  for (const [params, why] of cases) {
    const r = await ops.run({ op: 'convert', inputs: [ds.id], params: params });
    assert.equal(r.ok, false, JSON.stringify(params) + ' was answered instead of refused');
    assert.equal(r.why, why, JSON.stringify(params) + ' was refused as ' + r.why);
    assert.equal(r.dataset, undefined, JSON.stringify(params) + ' registered a dataset');
  }

  /* ⚠ AND WITH NO UNIT KERNEL IT DOES NOT FALL BACK TO ARITHMETIC OF ITS OWN — a factor invented
     here is the one thing this op exists to stop. */
  const blind = await boot({ without: ['units'] });
  const d2 = blind.data.add({
    title: 'Mixed', features: [pt(0, 0, { len: 1500 })],
    fieldStatements: { len: { unit: 'm', unitStated: 'reader' } },
  });
  const r = await blind.ops.run({ op: 'convert', inputs: [d2.id], params: { field: 'len', to: 'km', outName: 'x' } });
  assert.equal(r.ok, false);
  assert.equal(r.why, 'units-unavailable');
});

/* ══ ⑧ 集計の可否は js/gis-units.js に訊かれる ════════════════════════════════════════════ */

test('R783 ⑧ aggregate reads the unit kernels verdict, and an undeclared quantity is not permission', async () => {
  const { data, ops } = await boot();
  const zone = data.add({ title: 'Zone', features: [poly(box(0, 0, 4, 4), { z: 'z' })] });
  /* Two areal members of different sizes, so the plain mean and the area-weighted one differ. */
  const members = data.add({
    title: 'Members',
    features: [poly(box(0, 0, 1, 1), { v: 10, cover: 'forest' }), poly(box(2, 2, 3.8, 3.8), { v: 20, cover: 'urban' })],
  });

  /* ⑴ 未申告 — the run is what it always was, and the verdict is RECORDED rather than read as
     permission ([[intmap-data-must-not-claim-an-author-it-lacks]]). */
  const plain = await ops.run({ op: 'aggregate', inputs: [zone.id, members.id], params: { stat: 'mean', field: 'v' } });
  assert.equal(plain.ok, true, 'aggregate refused: ' + plain.why + ' ' + JSON.stringify(plain.detail));
  assert.equal(data.get(plain.dataset.id).features()[0].properties.mean_v, 15, 'the undeclared mean stopped being the plain mean');
  assert.equal(plain.stats.aggregation.verdict, 'undeclared', 'an undeclared quantity was recorded as ' + plain.stats.aggregation.verdict);
  assert.equal(data.get(plain.dataset.id).provenance.resolved, undefined,
    'a run over an undeclared quantity wrote a rule into the recipe it had not been given');

  /* ⑵ refused — a real contradiction, with the kernel's own remedy. */
  const cat = await ops.run({
    op: 'aggregate', inputs: [zone.id, members.id],
    params: { stat: 'mean', field: 'cover', quantity: { kind: 'category' } },
  });
  assert.equal(cat.ok, false, 'the mean of a category was answered with a number');
  assert.equal(cat.why, 'aggregation-refused');
  assert.equal(cat.detail.remedy, 'majority', 'the refusal does not carry the remedy the kernel gave');

  /* ⑶ needs-weight — the refusal names the method that HAS the weight, and that method exists. */
  const density = { kind: 'density', space: 'perArea', unit: 'kg/m2' };
  const needs = await ops.run({
    op: 'aggregate', inputs: [zone.id, members.id],
    params: { stat: 'mean', field: 'v', quantity: density },
  });
  assert.equal(needs.ok, false, 'the unweighted mean of a density was answered');
  assert.equal(needs.why, 'aggregation-needs-weight');
  assert.equal(needs.detail.weight, 'area');
  assert.equal(needs.detail.remedy, 'areaWeightedMean');
  const stats = ops.op('aggregate').params.find((p) => p.name === 'stat');
  assert.ok(stats.values.indexOf(needs.detail.remedy) >= 0,
    'the remedy the refusal points at is not a stat this op offers — the door #R752 kept finding missing');

  /* …and the remedy really answers: Σ(v·km²)/Σkm² over the members, each weighted by its own area. */
  const weighted = await ops.run({
    op: 'aggregate', inputs: [zone.id, members.id],
    params: { stat: 'areaWeightedMean', field: 'v', quantity: density, outName: 'awm' },
  });
  assert.equal(weighted.ok, true, 'areaWeightedMean refused: ' + weighted.why + ' ' + JSON.stringify(weighted.detail));
  const a1 = ops.areaKm2(data.get(members.id).features()[0].geometry);
  const a2 = ops.areaKm2(data.get(members.id).features()[1].geometry);
  const expect = (10 * a1 + 20 * a2) / (a1 + a2);
  const row = data.get(weighted.dataset.id).features()[0];
  assert.ok(Math.abs(row.properties.awm - expect) < 1e-9, 'the weighted mean is ' + row.properties.awm + ' and Σ(v·km²)/Σkm² is ' + expect);
  assert.ok(Math.abs(row.properties.awm - 15) > 0.5, 'the weighted mean came out as the plain mean — the weights are not being used');
  assert.equal(row.properties._weightKm2 > 0, true, 'the weight used is not beside the number it produced');
  /* 実行した規則はレシピに残る。 */
  const rule = data.get(weighted.dataset.id).provenance.resolved;
  assert.ok(rule && rule.aggregation, 'the recipe does not record the rule that ran');
  assert.equal(rule.aggregation.verdict, 'allowed');
  assert.equal(rule.aggregation.weight, 'area');
  assert.equal(rule.aggregation.method, 'areaWeightedMean');

  /* ⚠ A MEMBER WITH NO GROUND CARRIES NO WEIGHT, AND IS COUNTED. */
  const pts = data.add({ title: 'Points', features: [pt(1, 1, { v: 7 })] });
  const noArea = await ops.run({
    op: 'aggregate', inputs: [zone.id, pts.id],
    params: { stat: 'areaWeightedMean', field: 'v', quantity: density, outName: 'awm2' },
  });
  assert.equal(noArea.ok, true, 'areaWeightedMean refused: ' + noArea.why);
  const r2 = data.get(noArea.dataset.id).features()[0];
  assert.equal(r2.properties.awm2, null, 'a zone whose members have no area was given a weighted mean anyway');
  assert.equal(r2.properties._statNoWeight, 1, 'the member that could not be weighted was not counted');

  /* `count` is a question about the ROWS, so it is answerable for a quantity nobody declared —
     and a build with no unit kernel says 「訊けなかった」 rather than 「よい」. */
  const counted = await ops.run({ op: 'aggregate', inputs: [zone.id, members.id], params: { stat: 'count' } });
  assert.equal(counted.ok, true, 'count refused: ' + counted.why);
  assert.equal(counted.stats.aggregation.verdict, 'allowed');
  const blind = await boot({ without: ['units'] });
  const z2 = blind.data.add({ title: 'Zone', features: [poly(box(0, 0, 4, 4), { z: 'z' })] });
  const m2 = blind.data.add({ title: 'Members', features: [poly(box(0, 0, 1, 1), { v: 10 })] });
  const unasked = await blind.ops.run({ op: 'aggregate', inputs: [z2.id, m2.id], params: { stat: 'mean', field: 'v' } });
  assert.equal(unasked.ok, true, 'a build with no unit kernel stopped aggregating: ' + unasked.why);
  assert.equal(unasked.stats.aggregation.verdict, 'unasked', 'a missing unit kernel was recorded as ' + unasked.stats.aggregation.verdict);
});

/* ══ ⑨ 宣言と実行が食い違わない ═══════════════════════════════════════════════════════════ */

test('R783 ⑨ the new ops are declared the way every other one is, and each has a runner', async () => {
  const { ops } = await boot();
  const src = read('js/gis-ops.js');
  const declared = ops.ops().map((d) => d.id);
  for (const id of ['spatialJoin', 'nearestJoin', 'timeJoin', 'convert']) {
    assert.ok(declared.indexOf(id) >= 0, id + ' is not declared');
  }
  /* ⚠ MEASURED AGAINST THE DISPATCH TABLE, not against a list written here: an op in DECL with no
     runner answers `op-not-wired`, which is a refusal nobody would see until they asked for it. */
  const runBlock = src.slice(src.indexOf('const RUN = {'), src.indexOf('const runner = RUN['));
  for (const id of declared) {
    assert.ok(new RegExp('(^|\\s)' + id + ':').test(runBlock), 'declared op with no runner: ' + id);
  }
  const vocab = ops.surfaces();
  for (const d of ops.ops()) {
    assert.ok(Array.isArray(d.surface), d.id + ' does not say which surface it computes on');
    for (const s of d.surface) assert.ok(vocab.indexOf(s) >= 0, d.id + ' names a surface nothing implements: ' + s);
  }
  /* The two joins that can produce a one-to-many both require the choice, and the enum they offer
     is the one the refusals quote. */
  for (const id of ['spatialJoin', 'timeJoin']) {
    const p = ops.op(id).params.find((x) => x.name === 'cardinality');
    assert.ok(p && p.required === true, id + ' does not require the cardinality to be stated');
    assert.deepEqual(p.values, ['all', 'first', 'refuse']);
    assert.equal(p.default, undefined, id + ' supplies a default cardinality — the silent choice the parameter exists to remove');
  }
  /* `disjoint` is true of everything a feature does not touch, so it cannot carry attributes. */
  const pred = ops.op('spatialJoin').params.find((x) => x.name === 'predicate');
  assert.equal(pred.values.indexOf('disjoint'), -1, 'the spatial join offers a relation with no partner to bring columns from');
  for (const p of ops.predicates()) {
    if (p === 'disjoint') continue;
    assert.ok(pred.values.indexOf(p) >= 0, 'a relate predicate the join does not offer: ' + p);
  }
});
