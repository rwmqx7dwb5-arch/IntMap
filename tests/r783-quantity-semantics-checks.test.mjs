/* ============================================================================
 *  #R783 · 「わからない」は「無次元」ではない／単位だけでは量の意味は決まらない
 * ----------------------------------------------------------------------------
 *  外部監査 §4.1 / §4.2。⚠ 二つとも、直す前にこのファイルで実測してから書いた。
 *
 *  ① MEASURED 2026-09-17 on this checkout, before the fix — `len` は m、`dist` は km と宣言した列:
 *        abs(len)        → { ok:true, unit:null }      ← m と述べた列が、単位の無い列になる
 *        round(len, 2)   → { ok:true, unit:null }
 *        min(len, len)   → { ok:true, unit:null }
 *        coalesce(len,0) → { ok:true, unit:null }
 *        number(len)     → { ok:true, unit:null }
 *        len % len       → { ok:true, unit:null }
 *        len / len       → { ok:true, unit:null }      ← 無次元であることも言えていない
 *        len * dist      → { ok:true, unit:null }      ← 「導けなかった」が同じ null
 *        min(len, dist)  → { ok:true, unit:null }      ⚠⚠⚠ len + dist は拒むのに、拒まれない
 *     つまり **関数呼び出しは全部 unit:null** で、しかもその null が四つの別の事実
 *     （誰も述べていない／無次元／量ではない／導けなかった）を同じ顔で運んでいた。
 *     ⇒ 規則は関数の宣言そのもの（js/gis-expr.js の `unit:{rule}`）に持たせ、歩行は状態を返す。
 *
 *  ② 監査の指摘そのまま:「『人数』の格子でも、その数値がその画素全体の人数なのか、地点に割り当てた
 *     推計値なのかで、区域境界をまたいだときの扱いは変わります。『ミリメートル』の降水量も、1 時間の
 *     積算と 1 か月の積算を、同じ意味では比較できません。」
 *     ⇒ 単位の隣に **種類・空間的な意味・時間的な意味・許される集計** を表せる形を足した。
 *     ⚠ ここで測るのは **表現と検証と既定の扱い** であって、既存データの分類ではない（分類は供給元の
 *     宣言）。⚠ そして **未申告は「合計してよい」と読み替えない** ——それがこの半分の要点。
 *
 *  ⚠ 式はソースを読んで判定しない。全部 **実際に parse して歩かせ**、②は本物の op を通した列で見る。
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisExpr } = await import('../js/gis-expr.js');
  const { makeGisUnits } = await import('../js/gis-units.js');
  const { makeGisOps } = await import('../js/gis-ops.js');
  const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
  w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
  w.IntMapGisExpr = makeGisExpr(); w.IntMapGisUnits = makeGisUnits();
  await geometry.ready();
  return { w, data, ops, expr: w.IntMapGisExpr, units: w.IntMapGisUnits };
}

/* 宣言された単位の表は測る対象の外に書く（式の中の綴りと、期待する答えを別に持つ）。 */
const FIELD_UNITS = { len: 'm', dist: 'km', area: 'km2', share: '1', name: null, plain: null };

/* 実際に parse して、実際に歩かせる。 */
function unitOf(expr, units, src) {
  const p = expr.parse(src);
  assert.equal(p.ok, true, src + ' が parse できない: ' + p.why);
  return units.unitOfExpr(p.ast, (n) => (Object.prototype.hasOwnProperty.call(FIELD_UNITS, n) ? FIELD_UNITS[n] : null));
}

/* ══ ① すべての式について単位が導出されるか、導けないと述べられる ═══════════════════════════════ */

test('① 関数を通しても単位は落ちない（実測で unit:null だった 6 つ）', async () => {
  const { expr, units } = await boot();
  for (const src of ['abs(len)', 'round(len, 2)', 'min(len, len)', 'max(len, len, len)',
    'coalesce(len, 0)', 'number(len)', 'if(plain > 1, len, len)', 'len % len', '-len', 'abs(abs(len))']) {
    const r = unitOf(expr, units, src);
    assert.equal(r.ok, true, src + ' が拒まれた: ' + r.why);
    assert.equal(r.unit, 'm', src + ' の単位が導けていない: ' + JSON.stringify(r));
    assert.equal(r.state, 'stated');
    assert.equal(r.determined, true);
  }
});

test('① 同じ量として扱われる n 個は、綴りが違えば拒まれる（+ だけの規則ではない）', async () => {
  const { expr, units } = await boot();
  /* 実測: この 4 つは fix 前は ok:true / unit:null で、len + dist だけが拒まれていた。 */
  for (const src of ['min(len, dist)', 'max(len, dist)', 'coalesce(len, dist)', 'if(plain > 1, len, dist)',
    'len % dist', 'len + dist', 'len > dist']) {
    const r = unitOf(expr, units, src);
    assert.equal(r.ok, false, src + ' が通った（m と km が一つの量として扱われている）');
    assert.equal(r.why, 'unit-mismatch');
    assert.equal(r.detail.a, 'm');
    assert.equal(r.detail.b, 'km');
    assert.ok(r.detail.op, 'どこで衝突したのかが読者に届かない: ' + JSON.stringify(r.detail));
  }
});

test('① 「決まらない」と「無次元」と「誰も述べていない」と「量ではない」は別の答え', async () => {
  const { expr, units } = await boot();
  const st = (src) => unitOf(expr, units, src);

  /* 導けなかった——単位はあるが綴りが無い。 */
  for (const src of ['len * dist', 'sqrt(area)', 'pow(len, 2)', '1 / len', 'len * area']) {
    const r = st(src);
    assert.equal(r.ok, true, src);
    assert.equal(r.state, 'undetermined', src + ' が「決まらない」と述べていない: ' + JSON.stringify(r));
    assert.equal(r.determined, false, src);
    assert.ok(r.why, src + ': 理由が無い');
  }

  /* 無次元——導けた結果が純粋な数。⚠ 綴り '1' を持つので、沈黙と区別できる。 */
  for (const src of ['len / len', 'area / area', 'log(len)', 'ln(plain)', 'len(name)', 'share']) {
    const r = st(src);
    assert.equal(r.state, 'dimensionless', src + ' が無次元と述べていない: ' + JSON.stringify(r));
    assert.equal(r.unit, '1', src);
    assert.equal(r.determined, true, src);
  }

  /* 誰も述べていない——列は実在するが単位の宣言が無い。沈黙であって無次元ではない。 */
  const silent = st('plain + plain');
  assert.equal(silent.state, 'unstated');
  assert.equal(silent.unit, null);
  assert.notEqual(silent.state, 'dimensionless', '沈黙が無次元として扱われている');

  /* 量ではない——文字列と真偽。 */
  for (const src of ['upper(name)', 'concat(name, name)', 'isnull(len)', 'len > 1', 'plain > 1 and plain < 9']) {
    const r = st(src);
    assert.equal(r.state, 'non-quantity', src + ': ' + JSON.stringify(r));
    assert.equal(r.unit, null, src);
  }

  /* リテラルは中立——単位を主張もしないし、他を縛らない（#R774 の判断を壊していない）。 */
  assert.equal(st('2 * 3').state, 'neutral');
  assert.equal(st('len - 273.15').unit, 'm', 'リテラルが単位ありとして扱われている');

  /* ⚠ 四つの状態のうち三つは unit が null で、fix 前はその null しか無かった。 */
  const nulls = ['len * dist', 'plain + plain', 'upper(name)'].map((s) => st(s));
  assert.deepEqual(nulls.map((r) => r.unit), [null, null, null]);
  assert.equal(new Set(nulls.map((r) => r.state)).size, 3, '三つの別の事実が一つの答えに戻っている');
});

test('① 単位の規則は関数の宣言そのものから来る（この file に名前の写しが無い）', async () => {
  const { w, expr, units } = await boot();
  const list = expr.functions();
  assert.ok(list.length >= 20);
  const rules = new Set();
  for (const f of list) {
    assert.ok(f.unit && typeof f.unit.rule === 'string', f.name + '() が単位の規則を宣言していない');
    rules.add(f.unit.rule);
    if (f.unit.args != null) assert.ok(Array.isArray(f.unit.args) && f.unit.args.length, f.name);
  }
  assert.ok(rules.size >= 3, '規則が 1 種類しか使われていない（宣言が形だけ）');

  /* ⚠ 写しが無いことを、ソースを読まずに測る: 宣言を差し替えたら答えが変わるなら、答えは宣言から
     来ている。差し替えを元に戻さないと他のテストに漏れるので、この test の中だけで戻す。 */
  const real = w.IntMapGisExpr;
  const parsed = expr.parse('abs(len)');
  w.IntMapGisExpr = {
    functions: () => real.functions().map((f) => (f.name === 'abs' ? Object.assign({}, f, { unit: { rule: 'dimensionless', args: null } }) : f)),
  };
  try {
    const swapped = units.unitOfExpr(parsed.ast, (n) => FIELD_UNITS[n] || null);
    assert.equal(swapped.state, 'dimensionless', 'js/gis-units.js が自前の関数一覧で答えている');
  } finally { w.IntMapGisExpr = real; }

  /* 規則を述べていない関数は「決まらない」——黙って無次元にしない。 */
  w.IntMapGisExpr = { functions: () => real.functions().map((f) => (f.name === 'abs' ? { name: 'abs', arity: [1, 1], returns: 'number', doc: 'abs(x)' } : f)) };
  try {
    const bare = units.unitOfExpr(parsed.ast, (n) => FIELD_UNITS[n] || null);
    assert.equal(bare.state, 'undetermined');
    assert.equal(bare.why, 'unit-rule-undeclared');
  } finally { w.IntMapGisExpr = real; }
});

test('① 新しい関数は単位の規則を述べなければ載らない（宣言が形骸化しない）', async () => {
  /* js/gis-expr.js は構築時に自分の表を検める。規則の無い関数が一つでもあれば app は建たない。 */
  const src = read('js/gis-expr.js');
  assert.ok(/declares no unit rule/.test(src), '規則の無い関数を拒む番人が無い');
  const { makeGisExpr } = await import('../js/gis-expr.js');
  assert.doesNotThrow(() => makeGisExpr(), '現在の表が自分の番人を通っていない');
});

/* ══ ② 導いた単位は、本物の op を通った列に付く ═══════════════════════════════════════════════ */

const rowsOf = (props) => ({
  title: 't',
  features: props.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: p })),
});

test('② compute の出力列が、関数を通しても単位を持つ（実測では持っていなかった）', async () => {
  const { data, ops } = await boot();
  const ds = data.add(rowsOf([{ len: -5, dist: 2 }]));
  data.declareField(ds.id, 'len', { unit: 'm' });
  data.declareField(ds.id, 'dist', { unit: 'km' });

  const r = await ops.run({ op: 'compute', inputs: [ds.id], params: { expr: 'abs(len)', outName: 'a' } });
  assert.equal(r.ok, true, r.why);
  assert.equal(r.dataset.features()[0].properties.a, 5);
  const col = r.dataset.fields.find((f) => f.name === 'a');
  assert.equal(col.unit, 'm', '関数を通った列の単位が誰にも届いていない');
  assert.equal(col.unitStatedAt, 'derived');
  assert.equal(col.unitFrom, 'compute');

  /* そして m と km を一つの量として扱う式は、+ と同じ理由で拒まれる。 */
  const bad = await ops.run({ op: 'compute', inputs: [ds.id], params: { expr: 'min(len, dist)', outName: 'b' } });
  assert.equal(bad.ok, false, 'min(m, km) が列として登録された');
  assert.equal(bad.why, 'unit-mismatch');
  assert.equal(bad.detail.op, 'min');
});

/* ══ ③ 量の意味——単位の隣に何を持たせられるか ═══════════════════════════════════════════════ */

test('③ 語彙は公開され、宣言はその語彙で検証される', async () => {
  const { units } = await boot();
  const v = units.quantityVocabulary();
  for (const k of ['count', 'amount', 'density', 'intensity', 'ratio', 'category']) {
    assert.ok(v.kinds.some((x) => x.kind === k), k + ' が語彙に無い');
  }
  assert.deepEqual(v.spaces.slice().sort(), ['perArea', 'point', 'total']);
  assert.ok(v.times.some((t) => t.time === 'accumulated' && t.needsPeriod === true));
  assert.deepEqual(v.calendarPeriods, ['month', 'year'], '暦の期間は秒を持たないものとして別に運ばれる');

  /* 読めない語は名前を付けて拒む——黙って既定へ落とさない。 */
  assert.equal(units.quantity({ kind: 'people' }).why, 'quantity-kind-unreadable');
  assert.equal(units.quantity({ kind: 'count', space: 'cell' }).why, 'quantity-space-unreadable');
  assert.equal(units.quantity({ kind: 'count', time: 'daily' }).why, 'quantity-time-unreadable');
  assert.equal(units.quantity(null).why, 'quantity-undeclared');
  assert.equal(units.quantity({ unit: 'm' }).why, 'quantity-undeclared', '単位だけでは量の宣言にならない');

  /* 期間を要する時間的意味は、期間が無ければ宣言として不完全。 */
  assert.equal(units.quantity({ kind: 'amount', space: 'total', time: 'accumulated' }).why, 'quantity-period-missing');
  assert.equal(units.quantity({ kind: 'amount', space: 'total', time: 'accumulated', period: 'km' }).why, 'quantity-period-not-a-duration');
  const acc = units.quantity({ kind: 'amount', space: 'total', time: 'accumulated', period: 'h' });
  assert.equal(acc.ok, true, acc.why);
  assert.equal(acc.q.period.seconds, 3600);

  /* 種類が含意する空間的意味は訊き直さない。含意しないものは null のまま（下の ④ が要点）。 */
  assert.equal(units.quantity({ kind: 'density' }).q.space, 'perArea');
  assert.equal(units.quantity({ kind: 'density' }).q.spaceFrom, 'kind');
  assert.equal(units.quantity({ kind: 'count' }).q.space, null);
  assert.equal(units.quantity({ kind: 'count', space: 'total' }).q.spaceFrom, 'stated');

  /* 宣言が自分と矛盾していることは測れる。 */
  assert.equal(units.quantity({ kind: 'ratio', unit: 'm' }).why, 'quantity-unit-contradicts-kind');
  assert.equal(units.quantity({ kind: 'category', unit: 'm' }).why, 'quantity-unit-contradicts-kind');
  assert.equal(units.quantity({ kind: 'ratio', unit: '%' }).ok, true, '割合が % で述べられているのに拒まれた');
});

test('③ 監査の例: 同じ「人数」でも、画素全体の量か地点の推計かで合計の可否が変わる', async () => {
  const { units } = await boot();
  const whole = { kind: 'count', space: 'total', unit: '1' };
  const atPoint = { kind: 'count', space: 'point', unit: '1' };

  assert.equal(units.aggregation(whole, 'sum').verdict, 'allowed');
  const pt = units.aggregation(atPoint, 'sum');
  assert.equal(pt.verdict, 'refused', '地点の推計値が黙って合計された');
  assert.equal(pt.why, 'summing-point-samples');
  assert.equal(pt.remedy, 'mean');

  /* 平均のほうは逆——地点の値は面積で重みを付けるべき、と述べる。 */
  assert.equal(units.aggregation(whole, 'mean').verdict, 'allowed');
  const m = units.aggregation(atPoint, 'mean');
  assert.equal(m.verdict, 'needs-weight');
  assert.equal(m.weight, 'area');
  assert.equal(m.remedy, 'areaWeightedMean');
});

test('③ 密度の単純合計は拒まれ、総量への面積重み付けも拒まれる', async () => {
  const { units } = await boot();
  const dens = { kind: 'density', unit: '1/km2' };
  const s = units.aggregation(dens, 'sum');
  assert.equal(s.verdict, 'refused');
  assert.equal(s.why, 'summing-a-density');
  assert.equal(s.remedy, 'multiply-by-area-then-sum');
  assert.equal(units.aggregation(dens, 'areaWeightedMean').verdict, 'allowed');

  /* 逆向きの誤りも拒む: 画素全体の総量を面積で重み付けすると面積を二度数える。 */
  const t = units.aggregation({ kind: 'amount', space: 'total', unit: 'kg' }, 'areaWeightedMean');
  assert.equal(t.verdict, 'refused');
  assert.equal(t.why, 'weighting-a-total');
  assert.equal(t.remedy, 'sum');
});

test('③ 割合とカテゴリ', async () => {
  const { units } = await boot();
  const ratio = { kind: 'ratio', unit: '%' };
  assert.equal(units.aggregation(ratio, 'sum').verdict, 'refused');
  assert.equal(units.aggregation(ratio, 'sum').why, 'summing-a-ratio');
  const rm = units.aggregation(ratio, 'mean');
  assert.equal(rm.verdict, 'needs-weight');
  assert.equal(rm.weight, 'denominator');

  const cat = { kind: 'category' };
  for (const m of ['sum', 'mean', 'areaWeightedMean', 'min', 'max', 'median']) {
    assert.equal(units.aggregation(cat, m).verdict, 'refused', 'カテゴリが ' + m + ' された');
  }
  assert.equal(units.aggregation(cat, 'majority').verdict, 'allowed');
  assert.equal(units.aggregation(cat, 'count').verdict, 'allowed', '行を数えることは値の集計ではない');
  assert.equal(units.aggregation({ kind: 'amount', space: 'total' }, 'majority').verdict, 'refused');
});

test('③ 時間の軸は空間の軸と別の問い（瞬時値は時間方向に足せない）', async () => {
  const { units } = await boot();
  const temp = { kind: 'intensity', unit: '°C', time: 'instant' };
  const rainHour = { kind: 'amount', space: 'total', unit: 'mm', time: 'accumulated', period: 'h' };

  const tsum = units.aggregation(temp, 'sum', { over: 'time' });
  assert.equal(tsum.verdict, 'refused');
  assert.equal(tsum.why, 'summing-instantaneous');
  assert.equal(units.aggregation(rainHour, 'sum', { over: 'time' }).verdict, 'allowed');
  assert.equal(units.aggregation(rainHour, 'sum', { over: 'time' }).note, 'periods-must-match');
  assert.equal(units.aggregation(temp, 'mean', { over: 'time' }).verdict, 'allowed');
  /* 面積の重み付けは時間方向には意味を持たない。 */
  assert.equal(units.aggregation(rainHour, 'areaWeightedMean', { over: 'time' }).verdict, 'refused');
  /* 時間的意味を述べていなければ、時間方向の集計は「未申告」。 */
  assert.equal(units.aggregation({ kind: 'amount', space: 'total' }, 'sum', { over: 'time' }).verdict, 'undeclared');
});

test('③ 監査の例: 1 時間の積算と 1 か月の積算は、単位が同じでも比べられない', async () => {
  const { units } = await boot();
  const hour = { kind: 'amount', space: 'total', unit: 'mm', time: 'accumulated', period: 'h' };
  const month = { kind: 'amount', space: 'total', unit: 'mm', time: 'accumulated', period: { count: 1, calendar: 'month' } };
  assert.equal(units.compare('mm', 'mm').verdict, 'identical', '単位は同じ——だから単位では見分けられない');
  assert.equal(units.comparableQuantity(hour, month).verdict, 'different-period');
  assert.equal(units.comparableQuantity(hour, hour).verdict, 'comparable');
  /* 1 か月 と 30 日 も「同じ」ではない（暦の単位は秒を持たない）。 */
  assert.equal(units.comparableQuantity(month, { kind: 'amount', space: 'total', unit: 'mm', time: 'accumulated', period: { count: 30, unit: 'd' } }).verdict, 'different-period');

  /* 空間的意味・種類が違えば、単位が同じでも比べられない。 */
  const whole = { kind: 'count', space: 'total', unit: '1' }, atPoint = { kind: 'count', space: 'point', unit: '1' };
  assert.equal(units.comparableQuantity(whole, atPoint).verdict, 'different-space');
  assert.equal(units.comparableQuantity(whole, { kind: 'amount', space: 'total', unit: '1' }).verdict, 'different-kind');
  /* 同じ量の違う綴りは、換算すれば比べられる——そう述べる。 */
  const km = { kind: 'amount', space: 'total', unit: 'km' }, m = { kind: 'amount', space: 'total', unit: 'm' };
  const c = units.comparableQuantity(km, m);
  assert.equal(c.verdict, 'comparable');
  assert.equal(c.unit, 'convertible');
  assert.equal(units.comparableQuantity(km, { kind: 'amount', space: 'total', unit: 'kg' }).verdict, 'different-unit');
});

/* ══ ④ ⚠⚠⚠ 未申告は「合計してよい」ではない ═══════════════════════════════════════════════════ */

test('④ 量の意味が未申告のものは、どの集計も allowed にならない（行を数えることを除く）', async () => {
  const { units } = await boot();
  /* 今日のこの app のほとんどの列・バンドがこれ——単位だけがあり、意味は誰も述べていない。 */
  for (const spec of [null, undefined, {}, { unit: 'mm' }, { unit: '1' }, 'people']) {
    const all = units.aggregations(spec);
    for (const m of Object.keys(all)) {
      if (m === 'count') { assert.equal(all[m].verdict, 'allowed'); continue; }
      assert.equal(all[m].verdict, 'undeclared',
        JSON.stringify(spec) + ' の ' + m + ' が ' + all[m].verdict + ' になった（沈黙が許可として読まれている）');
      assert.ok(all[m].why, m + ': 理由が無い');
    }
  }
});

test('④ 種類だけ述べて空間的意味を述べていない「人数」も、合計は未申告のまま', async () => {
  const { units } = await boot();
  /* 監査の指摘そのもの: count は含意しない。density は含意するので訊き直さない。 */
  const bare = units.aggregation({ kind: 'count', unit: '1' }, 'sum');
  assert.equal(bare.verdict, 'undeclared');
  assert.equal(bare.why, 'quantity-space-undeclared');
  assert.equal(units.aggregation({ kind: 'density', unit: '1/km2' }, 'sum').verdict, 'refused');
  /* min / max / median は空間的意味に依らない（どの画素のどの値かを訊いていない）。 */
  assert.equal(units.aggregation({ kind: 'count', unit: '1' }, 'min').verdict, 'allowed');
});

test('④ 集計の名前そのものが読めなければ、そう述べる（既定へ落ちない）', async () => {
  const { units } = await boot();
  const r = units.aggregation({ kind: 'count', space: 'total' }, 'total');
  assert.equal(r.verdict, 'unreadable');
  assert.equal(r.why, 'aggregation-method-unreadable');
  assert.ok(r.detail.known.includes('sum'));
  assert.equal(units.aggregation({ kind: 'count', space: 'total' }, null).verdict, 'unreadable');
});

/* ══ ⑤ 版 — この回は答えを変えたので、そう申告している ═══════════════════════════════════════ */

test('⑤ 単位カーネルの版が上がっている（拒否と導出が変わった）', async () => {
  const { units } = await boot();
  assert.equal(units.version(), 'units-2');
  /* ⚠ 拒否コードは増やしていない: quantity-* は ok:false で op へ返るものではなく、呼び手が読む verdict。 */
  assert.deepEqual(units.refusals(), ['unit-mismatch']);
});
