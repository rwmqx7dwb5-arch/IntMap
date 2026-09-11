/* ============================================================================
 *  tests/r707-chronos-labelorder-checks.test.mjs — 歴史行政区分のラベルが
 *  衝突したとき、消えるものを決めているのは何か（#R707）
 * ----------------------------------------------------------------------------
 *  `imta-lbl` / `imta2-lbl` は `text-optional: true` を持つ——衝突した名前は
 *  **黙って消える**。`symbol-sort-key` が無いと、その優先順位はソース内の feature
 *  の到着順、すなわち `data/hist-admin{1,2}.js` の**行順**（＝上流 Overpass が
 *  答えた順）で決まる。実測: 行の添字と、その行が描く面積との Spearman 順位相関は
 *  +0.076（admin1・4,839 行）と −0.061（admin2・22,708 行）＝**行順は雑音**。
 *
 *  ⚠ この検査は綴りを固定しない（#R488）。守るのは**性質**:
 *    ① 名前の層には順位の式があり、それが定数ではなく feature の値を読む。
 *    ② その式が誘導する順序は、**行順ではない**（行順と逆に並べた合成記録で、
 *       順位が行順と食い違い、面積の降順と一致する）。
 *    ③ 向きが正しい（MapLibre は**小さいほど先**なので、大きい区分が先に来る）。
 *    ④ 2つの層が**同じ規則**を使う（片方だけ直す改変を落とす）。
 *    ⑤ 順位は「何を描くか」を変えない——feature は1件も減らない。
 *
 *  ⚠ ソースを文字列で読まない（#R505）。ファクトリを**評価**して層の仕様を読み戻し、
 *  式は `createExpression`（描画器と同じパーサ）で**実際に評価する**。
 *  ⚠ 数はこのファイルに書かない——順序は合成記録の面積から**導いて**比べる。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const TA = read('js/time-admin1.js');

/* ── 層の一覧はモジュール自身の `makeTier(…)` から数え上げる（手書きの一覧は3つ目の
      層が足された日にそれを黙って落とす・#R680）。 */
function tiers() {
  const out = [];
  const re = /makeTier\(\{([\s\S]*?)\}\);/g;
  let m;
  while ((m = re.exec(TA))) {
    const body = m[1], get = (k) => { const g = new RegExp(k + ":\\s*'([^']+)'").exec(body); return g ? g[1] : null; };
    out.push({ key: get('key'), global: get('global'), src: get('src'), lbl: get('lbl'),
               deep: /deep:\s*true/.test(body) });
  }
  return out;
}

/* ── 合成記録 ───────────────────────────────────────────────────────────────
   ⚠ **面積を行順にぴったり従わせる**（1 行目が最小・最終行が最大）。正しい順位＝面積の
   降順は、このとき行順の**ちょうど逆**になるので、「順位が無い」も「向きが逆」も同じ
   一つの記録で赤くなる。同梱の記録（相関 ≈ 0）でこれを測ると、行順と面積の順序が
   たまたま近いか遠いかを測ることになり、規則を測ったことにならない。 */
function synth(n, counts) {
  const rings = [], feats = [];
  for (let i = 0; i < n; i++) {
    /* 一辺 (i+1) 度の正方形を、赤道上の重ならない場所に置く（緯度依存を避けるため
       南北は赤道をまたがせない——面積の大小だけを操作したい）。 */
    const w = i + 1, x0 = -170 + i * 20;
    const ring = [[x0, 0], [x0 + w, 0], [x0 + w, w], [x0, w], [x0, 0]];
    /* ⑥ のための計器: この環の座標が「読まれた」回数。実装の内部を覗かずに
       「同じ区分を二度測っていないか」を訊く唯一の外からの手段（#R505）。 */
    rings.push(counts ? new Proxy(ring, {
      get(t, k) { if (typeof k === 'string' && /^\d+$/.test(k)) counts[i] = (counts[i] || 0) + 1; return t[k]; }
    }) : ring);
    /* ⚠ 最小の区分だけが 1901-01-01 に終わる。これで 1900 年と 1901 年が**別のエポック**
       になり（`bounds()` は各行の開始と終了を境界にする）、`fcAt` が作り直される——
       作り直しても面積を測り直さないことが ⑥ の主張。 */
    const end = (i === 0) ? [1901, 1, 1] : [1950, 12, 31];
    feats.push(['U' + i, (i % 2) ? 3 : 4, 1800, 1, 1, end[0], end[1], end[2], [[i]], { en: 'U' + i }, 1000 + i]);
  }
  return { v: 1, src: 'synthetic', since: 1, tolerance: 0.02, levels: [3, 4], rings, feats };
}

/* ── ファクトリを評価する（tests/r700-admin-tier-checks.test.mjs と同じ足場） ── */
function harness(n, counted) {
  const layers = new Map(), sources = new Map(), handlers = new Map(), counts = {};
  const L = {
    hasSource: (id) => sources.has(id),
    addSource: (id, spec) => sources.set(id, { spec, data: null }),
    setSourceData: (id, d) => { if (sources.has(id)) sources.get(id).data = d; },
    has: (id) => layers.has(id),
    add: (spec) => layers.set(spec.id, { spec }),
    setLayout: () => {}, setFilter: () => {}
  };
  const bus = { on: (k, f) => handlers.set(k, (handlers.get(k) || []).concat(f)), once: (k, f) => bus.on(k, f),
                off: () => {}, emit: (k) => { for (const f of (handlers.get(k) || [])) f(); } };
  const GE = { hasRenderer: () => true, ready: () => true, layers: L, events: bus,
               camera: { getZoom: () => 8 }, coords: { queryRenderedFeatures: () => [] } };
  const win = {}; win.window = win; win.addEventListener = () => {};
  win.IntMapGeoEngine = GE; win.IntMapModules = {};
  win.IntMapTime = { on: () => {}, min: 1 };
  win.IntMapLang = { pickArgs: () => ((...a) => a), pick: () => ({ arr: (a) => a[0] }), htmlTag: () => 'en' };
  win.IntMapMemBudget = { deviceIsPhone: () => true };
  win.IntMapBorderCoast = { marks: () => null, lineGeom: () => null, load: () => Promise.resolve(null),
                            onArrive: () => {}, wholeLines: () => ({ type: 'FeatureCollection', features: [] }) };
  for (const t of tiers()) { counts[t.key] = []; win[t.global] = synth(n, counted ? counts[t.key] : null); }
  const ctx = {
    window: win, console, navigator: {},
    document: { getElementById: () => ({ checked: true, closest: () => null }),
                createElement: () => ({ style: {} }), head: { appendChild: () => {} } },
    setTimeout: (f, ms) => { const h = setTimeout(f, ms); if (h.unref) h.unref(); return h; },
    clearTimeout, Promise, Math, JSON, Number, Array, Date, Set, Map, isFinite
  };
  vm.createContext(ctx);
  vm.runInContext(read('js/hist-scale.js'), ctx, { filename: 'hist-scale.js' });
  vm.runInContext(TA, ctx, { filename: 'time-admin1.js' });
  const mod = win.IntMapModules.timeAdmin1({ canDraw: () => true, lang: 'en', isMobile: () => true });
  return {
    mod, layers, counts,
    travel: (y) => mod._go(vm.runInContext(`new Date(Date.UTC(${y}, 5, 15))`, ctx)),
    layer: (id) => (layers.has(id) ? layers.get(id).spec : null),
    data: (id) => (sources.has(id) ? sources.get(id).data : null)
  };
}
const settle = async (k = 16) => { for (let i = 0; i < k; i++) await Promise.resolve(); };

/** 描画器と同じパーサで順位式を評価する。式が無ければ null。 */
function keyer(spec) {
  const e = (spec.layout || {})['symbol-sort-key'];
  if (e == null) return null;
  const c = createExpression(e, { type: 'number', 'property-type': 'data-driven',
                                  expression: { interpolated: false, parameters: ['zoom', 'feature'] } });
  assert.equal(c.result, 'success', 'symbol-sort-key が MapLibre の式として解釈できない: ' + JSON.stringify(c.value));
  return (f) => c.value.evaluate({ zoom: 8 }, f);
}
/** 実面積（球面過剰）——モジュールの実装とは独立に、ここで測り直す。 */
function areaOf(geom) {
  const R = 6371.0088, D = Math.PI / 180;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let a = 0;
  for (const poly of polys) for (let k = 0; k < poly.length; k++) {
    let s = 0; const r = poly[k];
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      s += (r[i][0] - r[j][0]) * D * (2 + Math.sin(r[j][1] * D) + Math.sin(r[i][1] * D));
    const A = Math.abs(s * R * R / 2); a += (k === 0) ? A : -A;
  }
  return a;
}

async function drawn() {
  const H = harness(9);
  H.travel(1900);
  await settle();
  const out = [];
  for (const t of tiers()) {
    const spec = H.layer(t.lbl);
    assert.ok(spec, `${t.lbl} が描かれていない——足場が層を作れていない`);
    const fc = H.data(t.src);
    assert.ok(fc && fc.features && fc.features.length > 2, `${t.src} に feature が届いていない`);
    out.push({ t, spec, feats: fc.features });
  }
  return out;
}

/* ── ① 順位が存在し、feature を読む ────────────────────────────────────────── */
test('① 名前の層は衝突の順位を持ち、それは feature ごとに違う', async () => {
  for (const { t, spec, feats } of await drawn()) {
    assert.equal((spec.layout || {})['text-optional'], true,
      `${t.lbl}: 衝突しても消えないなら、この検査の前提が変わっている`);
    const k = keyer(spec);
    assert.ok(k, `${t.lbl}: symbol-sort-key が無い——衝突の勝者はソースの行順、すなわち上流の答えた順で決まる`);
    const vals = feats.map(k);
    assert.ok(vals.every(Number.isFinite), `${t.lbl}: 順位が数にならない feature がある`);
    assert.ok(new Set(vals).size > 1, `${t.lbl}: 順位が全 feature で同じ＝定数であり、順位ではない`);
  }
});

/* ── ②③ 順位が誘導する順序は、行順ではなく面積の降順 ───────────────────────
   合成記録は行順と面積を逆相関させてあるので、行順のままなら②で落ち、向きを
   間違えれば③で落ちる。 */
test('② 順位の順序は、ソースの行順ではない', async () => {
  for (const { t, spec, feats } of await drawn()) {
    const k = keyer(spec);
    const byKey = feats.map((f, i) => i).sort((a, b) => k(feats[a]) - k(feats[b]));
    const rowOrder = feats.map((f, i) => i);
    assert.notDeepEqual(byKey, rowOrder,
      `${t.lbl}: 順位の順序がソースの行順と同じ——記録のファイル順が、読者に見える名前を決めている`);
  }
});

test('③ 先に置かれるのは大きい区分（MapLibre は小さい鍵が先）', async () => {
  for (const { t, spec, feats } of await drawn()) {
    const k = keyer(spec);
    const byKey = feats.slice().sort((a, b) => k(a) - k(b));
    const byArea = feats.slice().sort((a, b) => areaOf(b.geometry) - areaOf(a.geometry));
    assert.deepEqual(byKey.map((f) => f.properties.NAME), byArea.map((f) => f.properties.NAME),
      `${t.lbl}: 順位の順序が、描かれる面積の降順と一致しない（向きを逆にすると大きい区分が全部消える）`);
  }
});

/* ── ④ 2つの層が同じ規則を使う（片方だけ直す改変を落とす） ─────────────────
   ⚠ 式の綴りを比べているのではない——**同じ feature に同じ順位を返すか**を比べる。
   どちらかの層が別の量に切り替われば、ここが落ちる。 */
test('④ 両方の層が、同じ feature に同じ順位を与える', async () => {
  const all = await drawn();
  assert.ok(all.length >= 2, '層が2つ数え上げられない');
  const probe = all[0].feats;
  const ks = all.map(({ spec }) => keyer(spec));
  for (const f of probe) {
    const v = ks.map((k) => k(f));
    assert.ok(v.every((x) => x === v[0]),
      `同じ区分に層ごとに違う順位が付いている（${v.join(' / ')}）——規則が2か所にある`);
  }
});

/* ── ⑤ 順位は「何を描くか」を変えない ──────────────────────────────────────
   sort-key は「どれを先に試すか」であって、絞り込みではない。層に filter が足されて
   いないこと、そして有効な区分が1件も落ちていないことを、記録から導いて確かめる。 */
test('⑤ 順位は絞り込みではない——有効な区分は1件も減らない', async () => {
  const n = 9;
  for (const { t, spec, feats } of await drawn()) {
    assert.equal(spec.filter, undefined, `${t.lbl}: 名前の層に filter が付いた——順位は何を描くかを変えてはならない`);
    assert.equal(feats.length, n, `${t.lbl}: 合成記録の ${n} 件のうち ${feats.length} 件しか届いていない`);
  }
});

/* ── ⑥ 順位に使う量は、時計が動くたびに測り直されない ───────────────────────
   面積は**区分の**性質であって、その瞬間の性質ではない。記録のスクラブは数十の
   エポックを跨ぐので、エポックごとに測り直せば、その費用は区分の数×エポックの数。
   ⚠ 実装の内部変数を覗かない——記録の環そのものを、座標が読まれた回数を数える
   proxy にしてある。別のエポックへ移って `fcAt` が作り直されたとき、**両方の日付で
   有効な区分の座標は1度も読み直されない**こと。 */
test('⑥ 面積は区分ごとに1度だけ測られる（別のエポックへ移っても測り直さない）', async () => {
  const T = tiers(), H = harness(9, true);
  H.travel(1900);
  await settle();
  const src = T[0].src, key = T[0].key;
  const a = H.data(src).features.map((f) => f.properties.NAME);
  assert.ok(a.length > 2, '最初のエポックに feature が届いていない');
  const before = H.counts[key].slice();
  assert.ok(before.some((c) => c > 0), '環の座標が1度も読まれていない——計器が繋がっていない');
  const epoch0 = H.mod.current();
  H.travel(1901);
  await settle();
  assert.notEqual(H.mod.current(), epoch0, '1901 が 1900 と同じエポックに落ちた——作り直しが起きていない');
  const b = H.data(src).features.map((f) => f.properties.NAME);
  const both = a.filter((nm) => b.includes(nm));
  assert.ok(both.length > 1, '両方の日付で有効な区分が足りない');
  const after = H.counts[key];
  for (const nm of both) {
    const i = +String(nm).slice(1);   /* 合成記録では区分 i の環は i 番（synth を参照） */
    assert.equal(after[i], before[i],
      `${nm}: 別のエポックへ移っただけで座標が読み直されている（${before[i]} → ${after[i]}）——面積が描画のたびに測り直されている`);
  }
});
