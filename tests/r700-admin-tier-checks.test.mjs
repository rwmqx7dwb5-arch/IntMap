/* ============================================================================
 *  tests/r700-admin-tier-checks.test.mjs — 親の許容幅が子より粗いことは、
 *  読者の画面に現れるのか（#R700）
 * ----------------------------------------------------------------------------
 *  報告は「admin1（0.02°）が admin2（0.012°）より粗い。県の輪郭が、その中の郡の
 *  輪郭より粗い」。実測すると**逆転は本物**（中央セグメント長 8.44 km 対 5.02 km）
 *  だが、**束の線は既定では1本も描かれていない**——#R604 以降、時代の境界線は
 *  OpenHistoricalMap のベクタタイルで、束のリングはラベルの錨・クリックの答え・
 *  被覆件数である。だからこの検査が守るのは「0.02° であること」ではない。
 *
 *    ① 2つの束が**自分で宣言している** `tolerance` と、**実際に格納している
 *       ジオメトリ**が一致すること（片方だけ焼き直せば比が壊れる）。
 *    ② **束の線が既定では描かれない**という、js/time-admin1.js に書いた判断が
 *       依存している事実。⚠ ソースを読まず、**ファクトリを実際に評価して**
 *       可視性を読み戻す（#R505・#R488）。
 *    ③ 散文（モジュール自身の段落・9言語の出典ページ・docs/FILES.md・CI の説明）
 *       が述べる数が、**いま同梱されているバイト**と一致すること。
 *
 *  ⚠ 数は1つもこのファイルに書かない。すべて data/ を評価して得る——書き写した
 *  数は、次の焼き直しで黙って古くなる（#R500）。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/** 改行設定に依存しないバイト数——git が持ち、読者が受け取る形（LF）で数える。 */
const lfBytes = (p) => Buffer.byteLength(
  fs.readFileSync(path.join(ROOT, p), 'latin1').split('\r\n').join('\n'), 'latin1');
const TA = read('js/time-admin1.js');

/* ── 層の一覧は、**モジュール自身の `makeTier(…)` 呼び出しから数え上げる**。
   手で並べた一覧は、3つ目の層が足された日に黙ってそれを落とす（#R680）。 */
function tiers() {
  const out = [];
  const re = /makeTier\(\{([\s\S]*?)\}\);/g;
  let m;
  while ((m = re.exec(TA))) {
    const body = m[1], get = (k) => { const g = new RegExp(k + ":\\s*'([^']+)'").exec(body); return g ? g[1] : null; };
    const num = (k) => { const g = new RegExp(k + ':\\s*(-?\\d+)').exec(body); return g ? +g[1] : null; };
    out.push({ key: get('key'), file: get('file'), global: get('global'), src: get('src'),
               line: get('line'), vtLine: get('vtLine'), lbl: get('lbl'),
               lo: num('lo'), hi: num('hi'), deep: /deep:\s*true/.test(body) });
  }
  return out;
}

/* ── 束は JS リテラルなので、評価して読む（JSON ではない） ───────────────── */
const _bundles = new Map();
function bundle(t) {
  if (_bundles.has(t.global)) return _bundles.get(t.global);
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(read(t.file), ctx, { filename: t.file });
  const d = ctx.window[t.global];
  _bundles.set(t.global, d);
  return d;
}
const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
/* 緯度で縮む経度を勘定に入れた、辺の実長（km） */
function segmentsKm(rings) {
  const out = [];
  for (const r of rings) for (let i = 1; i < r.length; i++) {
    const [a, b] = r[i - 1], [c, d] = r[i];
    const km = Math.hypot((c - a) * 111.32 * Math.cos((b + d) / 2 * Math.PI / 180), (d - b) * 110.57);
    if (km > 0) out.push(km);
  }
  return out;
}
const inForce = (d, y, m, dd) => {
  const k = (Y, M, D) => Y * 10000 + M * 100 + D, t = k(y, m, dd);
  return d.feats.filter((f) => !(k(f[2], f[3], f[4]) > t || k(f[5], f[6], f[7]) < t)).length;
};
/* 桁区切りは言語ごとに違う（4,820 / 4.820 / 4 820）。数そのものを訊きたいので、
   数字と数字の間の区切りだけを落としてから探す。綴りではなく値を測るため。 */
const digits = (s) => s.replace(/(\d)[.,   ](?=\d\d\d(\D|$))/g, '$1');
const has = (s, n) => digits(s).includes(String(n));

/* ── ① 束が宣言した許容幅は、束が実際に格納したジオメトリと一致する ─────────
   守るのは「0.02°」という値ではない——値は動いてよい。守るのは、**宣言と中身が
   同じことを言っている**こと。片方の層だけを焼き直して散文を直さなければ、辺長の
   比が宣言の比から離れてここが落ちる。 */
test('① 各層の宣言 tolerance と、格納されたジオメトリの粗さが一致する', () => {
  const T = tiers();
  assert.ok(T.length >= 2, 'js/time-admin1.js から層が数え上げられない');
  const seen = [];
  for (const t of T) {
    const d = bundle(t);
    assert.equal(typeof d.tolerance, 'number', `${t.file} は自分の tolerance を宣言していない`);
    assert.ok(d.tolerance > 0, `${t.file} の tolerance が正でない`);
    assert.equal(typeof d.since, 'number', `${t.file} は自分の since を宣言していない`);
    assert.equal(JSON.stringify(d.levels), JSON.stringify([t.lo, t.hi]), `${t.file} の levels と、モジュールが読む lo/hi が違う`);
    /* 量子化の格子が許容幅を支配していないこと（3桁なら 0.001°、4桁なら 0.0001°）。
       格子のほうが粗ければ、宣言された tolerance はもう効いていない。 */
    let dec = 0;
    for (let i = 0; i < Math.min(d.rings.length, 500); i++)
      for (const p of d.rings[i]) for (const v of p) {
        const s = String(v), k = s.includes('.') ? s.split('.')[1].length : 0; if (k > dec) dec = k;
      }
    assert.ok(Math.pow(10, -dec) * 2 < d.tolerance, `${t.file}: ${dec} 桁の格子が tolerance ${d.tolerance}° を飲み込んでいる`);
    seen.push({ t, d, med: median(segmentsKm(d.rings)) });
  }
  /* 層どうし: 宣言が粗いほうが、実際に粗く描かれていること。⚠ 頂点密度で訊いては
     ならない——Douglas–Peucker は直線区間に頂点を残さないので、密度は地形を報告する
     （実測 11.50 対 11.82＝差 3%、辺長では 1.68 倍）。 */
  for (let i = 1; i < seen.length; i++) {
    const a = seen[i - 1], b = seen[i];
    const tolRatio = a.d.tolerance / b.d.tolerance, segRatio = a.med / b.med;
    assert.ok(Math.sign(tolRatio - 1) === Math.sign(segRatio - 1),
      `${a.t.file} と ${b.t.file}: 宣言は ${a.d.tolerance}/${b.d.tolerance} なのに、描かれる辺の中央値は ${a.med.toFixed(2)}/${b.med.toFixed(2)} km`);
    const q = segRatio / tolRatio;
    assert.ok(q > 0.5 && q < 2, `宣言された許容幅の比 ${tolRatio.toFixed(2)} と、実際の辺長の比 ${segRatio.toFixed(2)} が離れている（${q.toFixed(2)} 倍）`);
  }
});

/* ── ② 束の線は既定では描かれない（評価して測る） ─────────────────────────
   js/time-admin1.js の #R700 の段落は、この事実の上に立っている。これが変われば
   （タイルが常に来ない・minzoom が消える）判断そのものを測り直す必要がある。 */
function harness(opts = {}) {
  const layers = new Map(), sources = new Map(), handlers = new Map();
  const state = { zoom: opts.zoom == null ? 7 : opts.zoom, painted: 0 };
  const L = {
    hasSource: (id) => sources.has(id),
    addSource: (id, spec) => sources.set(id, { spec, data: null }),
    setSourceData: (id, d) => { if (sources.has(id)) sources.get(id).data = d; },
    has: (id) => layers.has(id),
    add: (spec) => layers.set(spec.id, { spec, visibility: (spec.layout && spec.layout.visibility) || 'visible' }),
    setLayout: (id, k, v) => { if (layers.has(id) && k === 'visibility') layers.get(id).visibility = v; },
    setFilter: () => {}
  };
  const bus = {
    on: (n, f) => handlers.set(n, (handlers.get(n) || []).concat(f)),
    once: (n, f) => bus.on(n, f), off: () => {},
    emit: (n) => { for (const f of (handlers.get(n) || [])) f(); }
  };
  const GE = { hasRenderer: () => true, ready: () => true, layers: L, events: bus,
               camera: { getZoom: () => state.zoom },
               coords: { queryRenderedFeatures: () => new Array(state.painted).fill({}) } };
  /* 合成の束（同梱の 26 MB は読まない——ここで測るのは可視性の規則であって記録ではない） */
  const synth = (n) => {
    const rings = [], feats = [];
    for (let i = 0; i < n; i++) {
      rings.push([[10 + i, 40], [11 + i, 40], [11 + i, 41], [10 + i, 41], [10 + i, 40]]);
      feats.push(['U' + i, 4, 1800, 1, 1, 1950, 12, 31, [[i]], { en: 'U' + i }, 1000 + i]);
    }
    return { v: 1, src: 'synthetic', since: 1, tolerance: 0.02, levels: [3, 4], rings, feats };
  };
  const win = {}; win.window = win; win.addEventListener = () => {};
  win.IntMapGeoEngine = GE; win.IntMapModules = {};
  win.IntMapTime = { on: (f) => { win.__clock = f; }, min: 1 };
  win.IntMapLang = { pickArgs: () => ((...a) => a), pick: () => ({ arr: (a) => a[0] }), htmlTag: () => 'en' };
  win.IntMapMemBudget = { deviceIsPhone: () => true };
  win.IntMapBorderCoast = { marks: () => null, lineGeom: () => null, load: () => Promise.resolve(null),
                            onArrive: () => {}, wholeLines: () => ({ type: 'FeatureCollection', features: [] }) };
  for (const t of tiers()) win[t.global] = synth(3);
  const box = () => ({ checked: opts.layerOff ? false : true, closest: () => null });
  const ctx = {
    window: win, console, navigator: {},
    document: { getElementById: () => box(), createElement: () => ({ style: {} }), head: { appendChild: () => {} } },
    setTimeout: (f, ms) => { const h = setTimeout(f, ms); if (h.unref) h.unref(); return h; },
    clearTimeout, Promise, Math, JSON, Number, Array, Date, Set, Map, isFinite,
    fetch: () => Promise.reject(new Error('offline'))
  };
  vm.createContext(ctx);
  /* 猶予時間（GRACE_MS）を跨ぐために時計を進められるようにする。実時間で待たない。 */
  vm.runInContext('globalThis.__NOW = Date.now(); const _RD = Date; globalThis.Date = class extends _RD { static now() { return globalThis.__NOW; } };', ctx);
  vm.runInContext(read('js/hist-scale.js'), ctx, { filename: 'hist-scale.js' });
  vm.runInContext(TA, ctx, { filename: 'time-admin1.js' });
  const mod = win.IntMapModules.timeAdmin1({ canDraw: () => true, lang: 'en', isMobile: () => true });
  return {
    mod, bus, state, layers,
    travel: (y) => mod._go(vm.runInContext(`new Date(Date.UTC(${y}, 5, 15))`, ctx)),
    advance: (ms) => vm.runInContext(`globalThis.__NOW += ${ms};`, ctx),
    vis: (id) => (layers.has(id) ? layers.get(id).visibility : null),
    minzoom: (id) => (layers.has(id) ? layers.get(id).spec.minzoom : null)
  };
}
const settle = async (n = 16) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

test('② 束の線は「タイルが来ない」と実証されるまで描かれない（評価）', async () => {
  const T = tiers(), H = harness();
  H.travel(1900);
  await settle();
  for (const t of T) {
    assert.equal(H.vis(t.vtLine), 'visible', `${t.vtLine}: 時代の線はタイルであるはず`);
    assert.equal(H.vis(t.line), 'none', `${t.line}: 束の線が既定で描かれている——#R700 の判断はこれに依っている`);
  }
  /* 猶予時間が過ぎてもタイルが1枚も描かなければ、そこで初めて束が立つ */
  H.advance(60000); H.bus.emit('idle');
  await settle();
  assert.equal(H.mod.tileState(), 'absent', 'タイルが描かないまま猶予を過ぎても absent にならない');
  for (const t of T) assert.equal(H.vis(t.line), 'visible', `${t.line}: 実証された欠落でも束が立たない`);
  /* 1枚でも描けば、粗い線は引っ込む */
  H.state.painted = 3; H.bus.emit('idle');
  await settle();
  assert.equal(H.mod.tileState(), 'live');
  for (const t of T) assert.equal(H.vis(t.line), 'none', `${t.line}: タイルが戻っても粗い線が残る`);
});

test('③ 深い層は縮尺で閉じている——2本の束の線が同時に出る条件の一つ', async () => {
  const T = tiers(), deep = T.filter((t) => t.deep);
  assert.ok(deep.length, '深い層が1つも見つからない');
  const H = harness();
  H.travel(1900);
  await settle();
  const z = H.mod.deepZoom();
  assert.equal(typeof z, 'number');
  for (const t of deep) {
    assert.equal(H.minzoom(t.line), z, `${t.line}: minzoom が deepZoom() と違う`);
    assert.equal(H.minzoom(t.vtLine), z, `${t.vtLine}: minzoom が deepZoom() と違う`);
  }
  for (const t of T.filter((x) => !x.deep)) assert.equal(H.minzoom(t.line), undefined, `${t.line}: 第1級の線に縮尺の下限が付いた`);
});

test('④ レイヤーを切った読者には、時代の区分線は1本も出ない', async () => {
  const H = harness({ layerOff: true });
  H.travel(1900);
  await settle();
  H.advance(60000); H.bus.emit('idle');
  await settle();
  for (const t of tiers()) {
    assert.equal(H.vis(t.line), 'none', `${t.line}`);
    assert.equal(H.vis(t.vtLine), 'none', `${t.vtLine}`);
  }
});

/* ── ⑤ 散文の数は、同梱されているバイトと一致する ───────────────────────── */
test('⑤ js/time-admin1.js 自身の段落が述べる数が、束の実測と一致する', () => {
  const T = tiers();
  for (const t of T) {
    const d = bundle(t);
    assert.ok(TA.includes(String(d.tolerance) + '°'), `${t.file} の tolerance ${d.tolerance}° を、モジュールはどこにも述べていない`);
    /* ⚠⚠⚠ (#R700) `statSync().size` はチェックアウトの改行設定を測っていて、束の大きさを測っていない。
       実測: このマシン（`core.autocrlf=true`）では 10,433,200 B、CI（LF）では **10,433,199 B**——
       末尾の 1 バイト。**ローカルで緑・CI で赤**になり、両方が同じ 1 つの事実を述べているのに
       食い違った。⇒ 改行を正規化してから測る。読者が受け取るのも、git が持つのも、この数である。 */
    assert.ok(has(TA, lfBytes(t.file)), `${t.file} の実バイト数を、モジュールの段落が述べていない`);
    let verts = 0; for (const r of d.rings) verts += r.length;
    assert.ok(has(TA, verts), `${t.file} の頂点数 ${verts} を、モジュールの段落が述べていない`);
  }
  /* 第1級の件数と、ある6月に有効な件数（ヘッダの表） */
  const first = T.find((t) => !t.deep), d1 = bundle(first);
  assert.ok(has(TA, d1.feats.length), `第1級の件数 ${d1.feats.length} を、ヘッダが述べていない`);
  for (const y of [1, 1000, 1500, 1800]) assert.ok(has(TA, inForce(d1, y, 6, 15)), `${y} 年 6 月に有効な ${inForce(d1, y, 6, 15)} 件を、ヘッダが述べていない`);
});

test('⑥ 出典ページは9言語とも、いま同梱されている記録の数を述べる', () => {
  const dir = path.join(ROOT, 'js/locales');
  const files = fs.readdirSync(dir).filter((f) => /^pages\..+\.js$/.test(f));
  assert.ok(files.length >= 9, `出典ページが ${files.length} 言語しかない`);
  const first = tiers().find((t) => !t.deep), d = bundle(first);
  const units = d.feats.length, force1900 = inForce(d, 1900, 6, 15);
  for (const f of files) {
    const s = read('js/locales/' + f);
    if (!s.includes('hist-admin1.js')) continue;          /* その言語がこの記録に触れていないなら、述べる数も無い */
    assert.ok(has(s, units), `${f}: 第1級の件数が ${units} ではない`);
    assert.ok(has(s, force1900), `${f}: 1900 年に有効な件数が ${force1900} ではない`);
    assert.ok(s.includes(String(d.tolerance)) || s.includes(String(d.tolerance).replace('.', ',')),
      `${f}: 簡略化の許容幅 ${d.tolerance}° を述べていない`);
  }
});

test('⑦ docs/FILES.md と CI の説明が述べる数が、同梱のバイトと一致する', () => {
  const FILES = read('docs/FILES.md'), CI = read('.github/workflows/ci.yml');
  for (const t of tiers()) {
    const d = bundle(t), bytes = lfBytes(t.file);   /* 改行設定に依存しない——上の ⑤ を参照 */
    assert.ok(has(FILES, d.feats.length), `docs/FILES.md: ${t.file} の件数が ${d.feats.length} ではない`);
    assert.ok(has(FILES, d.rings.length), `docs/FILES.md: ${t.file} の rings が ${d.rings.length} ではない`);
    assert.ok(FILES.includes((bytes / 1048576).toFixed(2) + ' MB'), `docs/FILES.md: ${t.file} の大きさが ${(bytes / 1048576).toFixed(2)} MB ではない`);
  }
  /* CI が「全環を焼き直す」と言うときの環の数は、印の記録が自分で数えている数 */
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(read('data/border-coast.js'), ctx, { filename: 'border-coast.js' });
  const sets = ctx.window.__IMBCOAST.sets;
  const rings = Object.keys(sets).reduce((a, k) => a + sets[k].rings, 0);
  assert.ok(has(CI, rings), `.github/workflows/ci.yml: 再導出される環は ${rings} 本`);
});
