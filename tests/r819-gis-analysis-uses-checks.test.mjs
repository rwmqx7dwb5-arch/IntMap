/* ============================================================================
 *  #R819 · 「取れる」から「比べられる」まで — 3 つの用途と、窓で書き出した結果の再利用
 * ----------------------------------------------------------------------------
 *  ⚠ ここで測るのは実装の形ではなく、読者が失うものである。
 *
 *  ① 任意の区域について複数のデータを評価する — 単発の寄せ集めではなく、**同じ区域・同じ条件**で
 *     比べられる 1 つの表になること。各列は自分の出典・算術・対象時点を隣に持つ。
 *  ② どの集計になるかは**量の意味**が決める。密度の「合計」は Σ value ではなく Σ value·km² で、
 *     その規則の名前は js/gis-ops.js に 1 つも書かれていない（js/gis-raster.js が公開し、合わない
 *     規則の拒否が正しい規則を教える）。分類に平均は出さない。
 *  ③ 答えられなかったものは**空欄にならない**。null の列は「そこには何も無かった」と読めるので、
 *     値の列は作られず、理由の列が書かれる。
 *  ④ 区域区分が変わっているとき: 対応表・交差面積・按分の仮定・**比べられない部分**が、次の処理に
 *     渡せる 1 つのデータセットとして返ること。述べられていない時点は述べられていないままである
 *     （.agents/rules/historical-verification.md §2-3）。
 *  ⑤ 到達圏: 施設ごとの値に加えて、**重なりの地面**が測られること——それが無い表は、足し上げた
 *     読者が同じ人間を二度数えていることに気づけない。
 *  ⑥ 予算を超える warp は窓で書き出され、その窓は結果キャッシュの鍵の下に残る。同じ条件の 2 度目は
 *     計算されない。⚠ 中止した run の途中結果は、完成した答えとして覚えられない。
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

async function boot(opts) {
  const o = opts || {};
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisUnits } = await import('../js/gis-units.js');
  const { makeGisIndex } = await import('../js/gis-index.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), raster = makeGisRaster(), ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisRaster = raster; w.IntMapGisOps = ops;
  w.IntMapGisUnits = makeGisUnits();
  try { w.IntMapGisIndex = makeGisIndex(); } catch (_) { /* 索引は頼むもので、要るものではない */ }
  const out = { w, data, geometry, raster, ops, units: w.IntMapGisUnits };
  if (o.warp) {
    const { makeGisCrs } = await import('../js/gis-crs.js');
    const { makeGisWarp } = await import('../js/gis-warp.js');
    const { makeGisProject } = await import('../js/gis-project.js');
    w.IntMapGisCrs = makeGisCrs();
    const warp = makeGisWarp();
    out.warpCalls = { n: 0 };
    /* 「使い回した」が主張になるのは、「走らなかった」が測れるときだけである。 */
    w.IntMapGisWarp = Object.assign({}, warp, { resample: (g, t, op) => { out.warpCalls.n++; return warp.resample(g, t, op); } });
    /* 予算の正本は js/gis-worker.js の budgetBytes()。ここでは**その扉だけ**を立てる——
       別スレッドが使えるかどうかと、この機械が何バイト抱えてよいかは別の事実である。 */
    w.IntMapGisWorker = { budgetBytes: () => o.budgetBytes };
    w.IntMapGisProject = makeGisProject();
    out.project = w.IntMapGisProject;
  }
  await geometry.ready();
  return out;
}

const feat = (g, p, id) => { const f = { type: 'Feature', properties: p || {}, geometry: g }; if (id != null) f.id = id; return f; };
const pt = (lng, lat, p) => feat({ type: 'Point', coordinates: [lng, lat] }, p);
const box = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });

/* 赤道の近くの 2 つの区域。下の期待値はどれも op 自身が報告した面積から導かれるので、
   地球半径が変われば固定値と期待値が一緒に動く。 */
const ZONES = () => ({ title: 'zones', features: [feat(box(0, 0, 1, 1), { n: 'west' }, 'w'), feat(box(1, 0, 2, 1), { n: 'east' }, 'e')] });

/* 1 度セルの格子。row 0 が北。 */
function grid(vals, width, height, west, north, step, band) {
  return {
    kind: 'raster', width: width, height: height,
    grid: { west: west, north: north, pixelLng: step, pixelLat: step },
    bands: [band || { name: 'v', unit: null, nodata: null }],
    read: () => Float64Array.from(vals),
  };
}

const DENSITY = { kind: 'density', space: 'perArea', time: 'instant', unit: '1/km2' };
const PER_PIXEL = { kind: 'amount', space: 'total', time: 'instant', unit: '1' };
const CATEGORY = { kind: 'category', space: 'point', unit: null };

/* ══ ① 同じ区域・同じ条件で、複数の出典が 1 つの表になる ═══════════════════════════════════ */

test('R819 ① 2 つの出典が、同じ区域の上で比べられる 1 つの表になる', async () => {
  const { data, ops } = await boot();
  const zones = data.add(ZONES());
  /* 2 列 × 1 行、値は 100 /km²。 */
  const dens = data.add(Object.assign(grid([100, 100], 2, 1, 0, 1, 1, { name: 'pop', unit: '1/km2', quantity: DENSITY }), { title: 'density', time: { kind: 'constant', start: '2020', end: '2020' } }));
  const sites = data.add({ title: 'sites', features: [pt(0.5, 0.5, { kind: 'school' }), pt(0.6, 0.5, { kind: 'school' }), pt(1.5, 0.5, { kind: 'clinic' })] });

  const a = await ops.run({ op: 'profile', inputs: [zones.id, dens.id], params: { outName: 'pop', asOf: '2020' } });
  assert.equal(a.ok, true, JSON.stringify(a));
  /* 密度は intensive なので、述べなければ読み方は「典型値」——面積で重み付けた平均である。 */
  assert.equal(a.stats.profile.reading, 'typical');
  assert.equal(a.stats.profile.method, 'mean');
  assert.equal(a.stats.profile.quantityStatedBy, 'band');
  assert.equal(a.stats.profile.timeMatch, 'covers', '対象時点と出典の時点が突き合わされていない');

  /* 2 つ目の出典を、同じ区域の表の上に重ねる。 */
  const b = await ops.run({ op: 'profile', inputs: [a.dataset.id, sites.id], params: { outName: 'sites' } });
  assert.equal(b.ok, true, JSON.stringify(b));
  assert.equal(b.stats.profile.reading, 'presence', '読む値が無いなら「いくつあるか」');
  assert.equal(b.stats.profile.method, 'count');

  const rows = b.dataset.features();
  assert.equal(rows.length, 2, '同じ区域のままでなければ比べられない');
  const west = rows.find((f) => f.properties.n === 'west').properties;
  const east = rows.find((f) => f.properties.n === 'east').properties;
  /* ⚠ 1 つの表に、出典ごとの列の群が並ぶ。値の隣に、その値が何であるかが載っている。 */
  assert.ok(Math.abs(west.pop - 100) < 1e-6, '密度の平均が 100 /km² でない: ' + west.pop);
  assert.equal(west.sites, 2);
  assert.equal(east.sites, 1);
  assert.equal(west.pop_source, dens.id);
  assert.equal(west.sites_source, sites.id);
  assert.equal(west.pop_method, 'mean');
  assert.equal(west.sites_method, 'count');
  assert.equal(west.pop_quantityFrom, 'band');
  assert.equal(west.sites_quantityFrom, null, '誰も述べていない量に著者を発明しない');
  assert.equal(west.pop_why, null);
  assert.equal(west.pop_asOf, '2020');
  assert.deepEqual(west.pop_time, { kind: 'constant', start: dens.time.start, end: dens.time.end });
  assert.equal(west.sites_time, null, '述べていない時点を、今日でも隣の出典でも埋めない');
  assert.equal(east.sites, 1);

  /* 条件はレシピの隣にも残る——月をまたいで表を見る読者が読むのはそこである。 */
  const resolved = b.dataset.provenance.resolved.profile;
  assert.equal(resolved.source, sites.id);
  assert.equal(resolved.column, 'sites');
  assert.equal(resolved.answered, true);

  /* ⚠ 2 つ目が 1 つ目を上書きしないこと。同じ名前をもう一度使えば、拒否される。 */
  const clash = await ops.run({ op: 'profile', inputs: [b.dataset.id, sites.id], params: { outName: 'sites' } });
  assert.equal(clash.ok, false);
  assert.equal(clash.why, 'output-column-in-use');
});

/* ══ ② 集計方法は量が決める ═══════════════════════════════════════════════════════════════ */

test('R819 ② 密度の「合計」は Σ value·km²、画素の総量の「合計」は Σ value', async () => {
  const { data, ops } = await boot();
  const zones = data.add(ZONES());
  const dens = data.add(Object.assign(grid([100, 100], 2, 1, 0, 1, 1, { name: 'pop', unit: '1/km2', quantity: DENSITY }), { title: 'density' }));

  const total = await ops.run({ op: 'profile', inputs: [zones.id, dens.id], params: { reading: 'total', outName: 'people' } });
  assert.equal(total.ok, true, JSON.stringify(total));
  /* ⚠ 「密度は足せない、面積を掛けてから足せ」は拒否ではなく処方である。規則の名前はこの層に
     書かれておらず、js/gis-raster.js が公開している集合の中から選ばれている。 */
  assert.ok(total.stats.profile.total, '密度の合計が、規則の名前を述べずに出ている');
  assert.ok(ops.ops().find((d) => d.id === 'zonal').params.find((p) => p.name === 'total').values.indexOf(total.stats.profile.total) >= 0,
    '使われた規則が、格子の kernel が公開している集合の外にある');
  const row = total.dataset.features()[0].properties;
  /* 100 /km² × その区域の地面 ＝ その区域の人口。分母は op 自身が報告した面積である。 */
  assert.ok(Math.abs(row.people / row._valueAreaKm2 - 100) < 1e-6, '密度の積分になっていない: ' + row.people + ' / ' + row._valueAreaKm2);
  assert.equal(row._totalTimesAreaKm2, true);
  assert.equal(row.people_method, total.stats.profile.total);

  /* 同じ「合計」でも、画素自身の総量なら面積を掛けてはならない。 */
  const counts = data.add(Object.assign(grid([7, 9], 2, 1, 0, 1, 1, { name: 'houses', unit: '1', quantity: PER_PIXEL }), { title: 'houses' }));
  const sum = await ops.run({ op: 'profile', inputs: [zones.id, counts.id], params: { reading: 'total', outName: 'houses' } });
  assert.equal(sum.ok, true, JSON.stringify(sum));
  const west = sum.dataset.features().find((f) => f.properties.n === 'west').properties;
  assert.equal(west.houses, 7, '画素の総量に面積が掛かっている');
  assert.equal(sum.stats.profile.total, null, '掛ける必要のないものに規則を当てている');

  /* 分類の格子は、述べなければ「構成」——平均ではない。 */
  const codes = data.add(Object.assign(grid([3, 5], 2, 1, 0, 1, 1, { name: 'lc', unit: null, quantity: CATEGORY }), { title: 'landcover' }));
  const comp = await ops.run({ op: 'profile', inputs: [zones.id, codes.id], params: { outName: 'lc' } });
  assert.equal(comp.ok, true, JSON.stringify(comp));
  assert.equal(comp.stats.profile.reading, 'composition');
  assert.equal(comp.stats.profile.method, 'classes');
  const lc = comp.dataset.features().find((f) => f.properties.n === 'west').properties.lc;
  assert.ok(lc && typeof lc === 'object', '分類ごとの面積が返っていない');
  assert.ok(Object.keys(lc).indexOf('3') >= 0, '西の区域に載っている分類は 3 のはず: ' + JSON.stringify(lc));
});

/* ══ ③ 答えられなかったものは、空欄ではなく理由を持つ ═══════════════════════════════════════ */

test('R819 ③ 分類を足せと言われた出典は、null の列ではなく理由の列を返す', async () => {
  const { data, ops } = await boot();
  const zones = data.add(ZONES());
  const parcels = data.add({
    title: 'parcels',
    features: [feat(box(0, 0, 0.5, 0.5), { use: 3 }), feat(box(1, 0, 1.5, 0.5), { use: 5 })],
  });
  /* 読者が「この列は分類である」と述べたうえで、その合計を求めた。 */
  const r = await ops.run({
    op: 'profile', inputs: [zones.id, parcels.id],
    params: { field: 'use', quantity: CATEGORY, reading: 'total', outName: 'use' },
  });
  assert.equal(r.ok, true, '出典 1 つが答えられないことは、段全体の失敗ではない: ' + JSON.stringify(r));
  assert.equal(r.stats.profile.answered, false);
  assert.equal(r.stats.profile.why, 'aggregating-a-category');
  assert.equal(r.stats.profile.remedy, 'majority');

  const rows = r.dataset.features();
  assert.equal(rows.length, 2, '区域は残る');
  const p = rows[0].properties;
  /* ⚠ 値の列は**作られない**。null の列は「そこには何も無かった」と読めてしまう。 */
  assert.equal(Object.prototype.hasOwnProperty.call(p, 'use'), false, '答えていない列が表に現れた');
  assert.equal(p.use_why, 'aggregating-a-category');
  assert.equal(p.use_method, null);
  assert.equal(p.use_source, parcels.id);
  /* その列が表の列として見えること——読者は表を見るのであって stats を見るのではない。 */
  assert.ok(r.dataset.fields.find((f) => f.name === 'use_why'), '理由が列になっていない');
});

/* ══ ④ 区域区分が変わっているとき ═══════════════════════════════════════════════════════════ */

test('R819 ④ 対応表・按分の仮定・比べられない部分が、1 つのデータセットで返る', async () => {
  const { data, ops } = await boot();
  /* 1889 年の 2 つの村（人口つき）と、後の 1 つの町＋どちらでもない地面。 */
  const old = data.add({
    title: 'villages', time: { kind: 'constant', start: '1889', end: '1889' },
    features: [feat(box(0, 0, 1, 1), { pop: 100 }, 'a1'), feat(box(1, 0, 2, 1), { pop: 200 }, 'a2')],
  });
  const now = data.add({
    title: 'town',
    features: [feat(box(0, 0, 2, 1), {}, 'b1'), feat(box(3, 0, 4, 1), {}, 'b2')],
  });
  const r = await ops.run({
    op: 'compareZones', inputs: [old.id, now.id],
    params: { field: 'pop', quantity: { kind: 'amount', space: 'total', time: 'instant', unit: '1' } },
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.stats.matched, 2);

  const rows = r.dataset.features();
  const matches = rows.filter((f) => f.properties._compare === 'match');
  assert.equal(matches.length, 2);
  const a1 = matches.find((f) => f.properties._compareA === 'a1').properties;
  assert.equal(a1._compareB, 'b1', '両側の身元が無ければ対応表ではない');
  assert.ok(Math.abs(a1._compareShareOfA - 1) < 1e-9, '古い村は丸ごと町の中にある');
  assert.ok(Math.abs(a1._compareShareOfB - 0.5) < 1e-3, '町から見た取り分が半分でない: ' + a1._compareShareOfB);
  /* 按分は行われ、その**仮定**が行に載る。 */
  assert.ok(Math.abs(a1.pop_apportioned - 100) < 1e-6);
  assert.equal(a1._compareApportionBy, 'area-share');
  assert.equal(a1._compareApportionAssumption, 'uniform-within-source-unit');
  /* 時点は述べられたものだけ。片方の日付をもう片方に代入しない。 */
  assert.equal(a1._compareTimeA.kind, 'constant');
  assert.equal(a1._compareTimeB, null);
  assert.equal(r.stats.time.b, null);

  /* 比べられない部分——B にしかない地面が、面積つきの行として返る。 */
  const unmatchedB = rows.filter((f) => f.properties._compare === 'unmatched-b');
  assert.equal(unmatchedB.length, 1, 'B にしかない地面が返っていない');
  const extra = ops.areaKm2(box(3, 0, 4, 1));
  assert.ok(Math.abs(unmatchedB[0].properties._areaKm2 - extra) < extra * 1e-6);
  assert.equal(rows.filter((f) => f.properties._compare === 'unmatched-a').length, 0, 'A の地面は全部 B の中にある');

  /* 区分が本当に分割かどうかは ① の coverage が測る——重複 0・隙間 0。 */
  assert.equal(r.stats.partition.a.counts.tolerated, 0);
  assert.equal(r.stats.partition.a.asked.overlaps, 'report', '重なりを違反として数えてはならない');
});

test('R819 ④b 足せない量は按分されず、その理由が行に残る', async () => {
  const { data, ops } = await boot();
  const old = data.add({ title: 'a', features: [feat(box(0, 0, 1, 1), { d: 50 }, 'a1')] });
  const now = data.add({ title: 'b', features: [feat(box(0, 0, 2, 1), {}, 'b1')] });
  const r = await ops.run({ op: 'compareZones', inputs: [old.id, now.id], params: { field: 'd', quantity: DENSITY } });
  assert.equal(r.ok, true, JSON.stringify(r));
  const p = r.dataset.features().find((f) => f.properties._compare === 'match').properties;
  assert.equal(Object.prototype.hasOwnProperty.call(p, 'd_apportioned'), false, '密度を面積で配ってはならない');
  assert.equal(p._compareApportionWhy, 'summing-a-density');
  assert.equal(r.stats.apportioned, false);
});

/* ══ ⑤ 到達圏は、重なりを測ってはじめて比べられる ═══════════════════════════════════════════ */

test('R819 ⑤ 施設ごとの到達圏は、重なりの地面つきで返る', async () => {
  const { data, ops } = await boot();
  /* 2 つの到達圏が 1 度ぶん重なっている。 */
  const reach = data.add({
    title: 'catchments',
    provenance: { kind: 'op', op: 'isochrone', params: { minutes: 15 } },
    features: [feat(box(0, 0, 2, 1), { site: 'A' }, 'A'), feat(box(1, 0, 3, 1), { site: 'B' }, 'B')],
  });
  const people = data.add({ title: 'people', features: [pt(0.5, 0.5, {}), pt(1.5, 0.5, {}), pt(2.5, 0.5, {})] });
  const r = await ops.run({ op: 'reach', inputs: [reach.id, people.id], params: { outName: 'served' } });
  assert.equal(r.ok, true, JSON.stringify(r));

  const rows = r.dataset.features();
  const A = rows.find((f) => f.properties.site === 'A').properties;
  const B = rows.find((f) => f.properties.site === 'B').properties;
  /* 評価そのものは profile と同じ 1 本を通る——同じ列、同じ条件の述べ方。 */
  assert.equal(A.served, 2);
  assert.equal(B.served, 2);
  assert.equal(A.served_source, people.id);
  /* ⚠ 足し上げれば 4 人。実際には 3 人しかいない——その理由が測られて載っていること。 */
  const shared = ops.areaKm2(box(1, 0, 2, 1));
  assert.ok(Math.abs(A._reachOverlapKm2 - shared) < shared * 1e-6, '重なりの地面が測られていない: ' + A._reachOverlapKm2);
  assert.ok(Math.abs(A._reachExclusiveKm2 - (A._areaKm2 - shared)) < shared * 1e-6);
  assert.equal(r.stats.reach.sumDoubleCounts, true);
  assert.equal(r.stats.reach.overlapping, 2);
  /* 到達圏そのものの由来（レシピ）が、答えの隣で述べられる。 */
  assert.equal(r.stats.reach.recipe.op, 'isochrone');
  assert.equal(A._reachFrom, 'isochrone');
  assert.equal(A._reachOf, 'A');

  assert.equal(r.stats.reach.aligned, true);

  /* ⚠ 地面を持たない行があると、評価した runner はその行を落とす。重なりの地面が**隣の施設**の
     行に載っていないこと——身元で確かめる。 */
  const withHole = data.add({
    title: 'mixed',
    features: [
      feat(null, { site: 'X' }, 'X'),
      feat(box(0, 0, 2, 1), { site: 'A' }, 'A'),
      feat(box(1, 0, 3, 1), { site: 'B' }, 'B'),
    ],
  });
  const r3 = await ops.run({ op: 'reach', inputs: [withHole.id, people.id], params: { outName: 'served' } });
  assert.equal(r3.ok, true, JSON.stringify(r3));
  assert.equal(r3.stats.reach.aligned, true);
  const rows3 = r3.dataset.features();
  assert.equal(rows3.length, 2, '地面を持たない行は評価から落ちる');
  for (const f of rows3) assert.equal(f.properties._reachOf, f.properties.site, '重なりが別の施設の行に載っている');
  assert.ok(Math.abs(rows3[0].properties._reachOverlapKm2 - shared) < shared * 1e-6);

  /* 重ならない到達圏では、同じ欄が「二重に数えていない」と述べる。 */
  const apart = data.add({ title: 'apart', features: [feat(box(0, 0, 1, 1), { site: 'A' }, 'A'), feat(box(2, 0, 3, 1), { site: 'B' }, 'B')] });
  const r2 = await ops.run({ op: 'reach', inputs: [apart.id, people.id], params: { outName: 'served' } });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.equal(r2.stats.reach.sumDoubleCounts, false);
  assert.equal(r2.dataset.features()[0].properties._reachOverlapKm2, 0);
});

/* ══ ⑥ 予算を超える warp は窓で書き出され、同じ条件の 2 度目は計算されない ═══════════════════ */

/* 4×4 の原格子と、その上の 8×8 の要求。出力だけで 8·8·8 バイト＝512 B。 */
function warpFixture(data) {
  const vals = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) vals.push(r * 4 + c);
  const src = data.add(Object.assign(grid(vals, 4, 4, 0, 4, 1, { name: 'v', unit: null, nodata: null }), { id: 'src', title: 'src' }));
  const target = data.add(Object.assign(grid(new Array(64).fill(0), 8, 8, 0, 4, 0.5, { name: 'v', unit: null, nodata: null }), { id: 'tgt', title: 'tgt' }));
  return { src, target };
}

test('R819 ⑥ 予算の内側では、今日とまったく同じ 1 本を通る', async () => {
  const B = await boot({ warp: true, budgetBytes: 64 * 1024 * 1024 });
  const { src, target } = warpFixture(B.data);
  const r = await B.ops.run({ op: 'resample', inputs: [src.id, target.id], params: { method: 'nearest' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.stats.windows, undefined, '予算の内側の要求に、窓の受領証が付いた');
  assert.equal(B.warpCalls.n, 1);
  assert.equal(B.project.cache.stats().stored, 0, '予算の内側で何かが覚えられている');
});

test('R819 ⑥b 予算を超える要求は窓で書き出され、2 度目は計算されない', async () => {
  /* 出力 512 B に対して予算 256 B——「出力だけで予算を食う」という、warp 自身が
     `output-resident-no-sink` と名指す状態。 */
  const B = await boot({ warp: true, budgetBytes: 256 });
  const { src, target } = warpFixture(B.data);
  const step = { op: 'resample', inputs: [src.id, target.id], params: { method: 'nearest' } };

  const first = await B.ops.run(step);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.stats.windows.overBudget, true);
  assert.equal(first.stats.windows.windowed, true, '予算を超えたのに出力を丸ごと抱えた');
  assert.equal(first.stats.windows.reused, false);
  assert.equal(first.stats.windows.stored, true, '窓が覚えられていない');
  assert.equal(first.stats.memory.outputHeld, 'window', 'warp の峰が下がっていない');
  assert.equal(B.warpCalls.n, 1);

  const band0 = Array.from(first.dataset.read(0));
  assert.equal(band0.length, 64);

  /* ⚠ 2 度目。同じ条件・同じ窓なので、warp は走らない。 */
  const again = await B.ops.run(step);
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.equal(again.stats.windows.reused, true, '同じ条件の同じ窓がもう一度計算された');
  assert.equal(B.warpCalls.n, 1, 'warp が 2 度走った');
  /* 使い回した答えは、計算した答えと 1 ビットも違わない。 */
  assert.deepEqual(Array.from(again.dataset.read(0)), band0);
  assert.equal(again.dataset.width, first.dataset.width);
  assert.equal(again.dataset.height, first.dataset.height);

  /* 条件が動けば、鍵も動く——同じ窓は使われない。 */
  const other = await B.ops.run({ op: 'resample', inputs: [src.id, target.id], params: { method: 'bilinear' } });
  assert.equal(other.ok, true, JSON.stringify(other));
  assert.equal(other.stats.windows.reused, false, '方式を変えたのに前の窓が使われた');
  assert.equal(B.warpCalls.n, 2);
});

test('R819 ⑥c キャッシュが無い構築では、予算超過の陳述がそのまま運ばれる', async () => {
  const B = await boot({ warp: true, budgetBytes: 256 });
  /* 結果キャッシュを切る＝断片を置く場所が無い。⚠ 黙って縮めず、warp の陳述を運ぶ。 */
  B.project.cache.setEnabled(false);
  const { src, target } = warpFixture(B.data);
  const r = await B.ops.run({ op: 'resample', inputs: [src.id, target.id], params: { method: 'nearest' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.stats.windows.windowed, false);
  assert.equal(r.stats.windows.reason, 'cache-unavailable');
  assert.equal(r.stats.memory.overBudget, true);
  assert.equal(r.stats.memory.reason, 'output-resident-no-sink', '予算を超えたことが述べられていない');
  assert.equal(r.stats.memory.outputHeld, 'whole');
});

test('R819 ⑥d 中止した run の途中結果は、完成した答えとして覚えられない', async () => {
  const B = await boot({ warp: true, budgetBytes: 256 });
  const { src, target } = warpFixture(B.data);
  const step = { op: 'resample', inputs: [src.id, target.id], params: { method: 'nearest' } };

  const ac = new AbortController();
  ac.abort();
  const stopped = await B.ops.run(step, { signal: ac.signal });
  assert.equal(stopped.ok, false, '中止された run が答えを返した');

  /* ⚠ 覚えられているとすれば、それは「一覧（plan）」である——それが無ければ、置かれた窓は
     どの読み手からも参照されない。次の run は計算する。 */
  const calls = B.warpCalls.n;
  const done = await B.ops.run(step);
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.equal(done.stats.windows.reused, false, '中止した run の途中結果が、完成した答えとして使われた');
  assert.equal(B.warpCalls.n, calls + 1);
});
