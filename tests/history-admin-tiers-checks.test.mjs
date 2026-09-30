/* ============================================================================
 *  IntMap · the historical subdivision layer at run time — the tiers, their dates, their labels,
 *  and the tile rule that draws their lines  (js/time-admin1.js · js/hist-scale.js ohmFilter/inForce)
 *  (consolidated from tests/r604 ③④⑥⑦, r700-admin-tier, r705-chronos-admin-dates and
 *   r707-chronos-labelorder; each test keeps its round tag)
 * ----------------------------------------------------------------------------
 *  Boundaries reach the screen by TWO readers (.agents/rules/historical-verification.md §2b): the
 *  bundled records (labels, clicks, counts — data/hist-admin{1,2,3}.js through js/time-admin1.js) and
 *  OpenHistoricalMap's vector tiles (the lines — js/hist-scale.js `ohmFilter`, whose rule `inForce`
 *  states). ⚠ #R730: at 1900 Japan rendered 436 tile lines and 317 of them STATED NO START; the rule
 *  now places a record in time only where somebody placed it. #R604 ④ is the check that the two
 *  spellings of that rule (the renderer's expression and the predicate) agree on every record shape.
 *
 *  #R700 — the parent tier's tolerance is coarser than the child's, and that is only harmless because
 *  the bundle's own lines are NOT drawn by default (tiles are); ② evaluates that. #R707 — which name
 *  survives a label collision was decided by the upstream's row order (Spearman +0.076 / −0.061 with
 *  area): the layers now carry an area-ordered `symbol-sort-key`, evaluated here with MapLibre's parser.
 *
 *  ⚠ THE FACTORY IS EVALUATED, NOT READ (#R505): js/time-admin1.js is run in a vm context against a
 *  recording engine, and its layer specs, visibilities and source data are read back. Where a test
 *  reads source it says why. ⚠ The tier list is DISCOVERED from the module's own `makeTier({…})`
 *  calls (#R680: a hand list drops the third tier the day it is added).
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
/** 改行設定に依存しないバイト数——git が持ち、読者が受け取る形（LF）で数える。 */
const lfBytes = (p) => Buffer.byteLength(
  fs.readFileSync(path.join(ROOT, p), 'latin1').split('\r\n').join('\n'), 'latin1');
const TA = read('js/time-admin1.js');
const settle = async (n = 16) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

/* a browser-script file evaluated against a fresh `window` */
function evalGlobal(file) {
  const ctx = { window: {}, document: undefined, console };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(read(file), ctx, { filename: file });
  return ctx.window;
}
const HS = evalGlobal('js/hist-scale.js').IntMapHistScale;

/* ── the tiers, enumerated from the module's own `makeTier(…)` calls ─────────────────────────── */
function tiers() {
  const out = [];
  const re = /makeTier\(\{([\s\S]*?)\}\);/g;
  let m;
  while ((m = re.exec(TA))) {
    const body = m[1], get = (k) => { const g = new RegExp(k + ":\\s*'([^']+)'").exec(body); return g ? g[1] : null; };
    const num = (k) => { const g = new RegExp(k + ':\\s*(-?\\d+)').exec(body); return g ? +g[1] : null; };
    /* (#R719) …and its OWN minimum zoom: the module stopped sharing one `DEEP_Z` when a third tier arrived */
    const mz = (new RegExp('minZ:' + String.raw`\s*([A-Za-z0-9_]+)`).exec(body) || [])[1];
    const minZ = mz == null ? null : (/^\d+$/.test(mz) ? +mz : +((new RegExp('const ' + mz + String.raw` = (\d+);`).exec(TA) || [])[1]));
    out.push({ key: get('key'), file: get('file'), global: get('global'), src: get('src'),
               line: get('line'), vtLine: get('vtLine'), lbl: get('lbl'),
               lo: num('lo'), hi: num('hi'), minZ, deep: /deep:\s*true/.test(body) });
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
const inForceRows = (d, y, m, dd) => {
  const k = (Y, M, D) => Y * 10000 + M * 100 + D, t = k(y, m, dd);
  return d.feats.filter((f) => !(k(f[2], f[3], f[4]) > t || k(f[5], f[6], f[7]) < t)).length;
};
/* 桁区切りは言語ごとに違う（4,820 / 4.820 / 4 820）。数そのものを訊くため、数字間の区切りだけを落とす。 */
const digits = (s) => s.replace(/(\d)[.,   ](?=\d\d\d(\D|$))/g, '$1');
const has = (s, n) => digits(s).includes(String(n));

/* ══ the tile rule (js/hist-scale.js) — what the tile layer draws ═══════════════════════════ */

/* ── (#R604 ③) 日付・階層・海の規則 ─────────────────────────────────────────────
   `ohmFilter` が組む式そのものは描画器のものだが、同じ規則を `inForce` が評価する。両者が離れないことは ④ が測る。 */
test('#R604 ③ 日付・階層・海の規則（境界のあるレコードだけが通る）', () => {
  const t = HS.decYear(1870, 6, 15);
  /* ══ ⚠⚠⚠ (#R730) THREE OF THESE ASSERTIONS USED TO REQUIRE THE DEFECT. They said a record stating
     only an END is in force at every earlier date, and that «a record with no dates at all must not
     be deleted from every map» — which is how 伊豆国 and the circuits of the 五畿七道 were drawn in
     every year the clock reaches (at 1900, 317 of Japan's 436 tile lines stated no start).
     ⇒ a record is placed in time where SOMEBODY PLACED IT. An absent END still means «still in
     force» — that IS a statement — but an absent START is not. */
  const izuUndated = { type: 'administrative', admin_level: 4, end_decdate: 1871.6589 };
  assert.equal(HS.inForce(izuUndated, 3, 4, t), false,
    'a record that states only an end was drawn in every year before it');
  const izu = { type: 'administrative', admin_level: 4, start_date: '0701-01-01', start_decdate: 701, end_decdate: 1871.6589 };
  assert.equal(HS.inForce(izu, 3, 4, t), true, '伊豆国 is in force in 1870 once a start is stated');
  assert.equal(HS.inForce(izu, 3, 4, HS.decYear(1880, 6, 15)), false, 'and gone in 1880');
  assert.equal(HS.inForce(izu, 3, 4, HS.decYear(600, 6, 15)), false, 'and absent before it started');
  assert.equal(HS.inForce(izu, 5, 6, t), false, 'a level-4 unit is not the deeper tier');
  assert.equal(HS.inForce({ type: 'administrative', admin_level: 3 }, 3, 4, HS.decYear(1, 6, 15)), false,
    'a record with no dates at all was being drawn in every year of the map');
  assert.equal(HS.inForce({ type: 'administrative', admin_level: 4, start_date: '1500', start_decdate: 1500 }, 3, 4, HS.decYear(1400, 6, 15)), false,
    'a unit must not be drawn before it started');
  /* ⚠ 海上の run は上流が自分で印を付けている —— #R564 が Natural Earth に対して導出した判断 */
  assert.equal(HS.inForce({ type: 'administrative', admin_level: 4, maritime: 'yes', start_date: '1500', start_decdate: 1500 }, 3, 4, t), false,
    'a maritime run is a coast, not a border');
  /* ⚠ 年になり得ない数は「日付」ではなく「日付が無い」。実測で 106,173 件中 3,080 件。
     ⚠ (#R730) AND THOSE 3,080 SIT BESIDE A PERFECTLY GOOD `*_date` STRING — that string is the
     statement, so the record is kept; what is dropped is the record that states nothing. */
  assert.equal(HS.inForce({ type: 'administrative', admin_level: 4, start_date: '1600', start_decdate: 1600, end_decdate: 6e-154 }, 3, 4, t), true,
    'a bound that cannot be a year must constrain nothing, not delete the record');
  assert.equal(HS.inForce({ type: 'administrative', admin_level: 4, start_date: '1600-01-01', start_decdate: 3.8e180 }, 3, 4, t), true,
    'and the same at the other end of implausible, when the date string states the bound');
  assert.equal(HS.inForce({ type: 'administrative', admin_level: 4, start_decdate: 3.8e180 }, 3, 4, t), false,
    'an unusable number with no date string beside it states nothing');
  assert.equal(HS.inForce({ type: 'boundary', admin_level: 4 }, 3, 4, t), false, 'only administrative boundaries');
});

/* ── (#R604 ④) 式と述語が同じことを言うか ──────────────────────────────────────
   ⚠ これが「規則が2か所ある」を捕まえる唯一の検査である（#R536/#R515）。片方だけ直したら、地図と
   テストが別のことを言い始め、しかも両方緑になる。式を**実際に評価して**突き合わせる。
   ⚠ (#R730 §2b) 一致の検査は規則の検査の代わりにならない——規則そのものは ③ が測る。 */
const evalExpr = (e, p) => {
  if (!Array.isArray(e)) return e;
  const [op, ...a] = e;
  const V = x => evalExpr(x, p);
  switch (op) {
    case 'all': return a.every(V);
    case 'any': return a.some(V);
    case '!': return !V(a[0]);
    case 'get': return p[a[0]] === undefined ? null : p[a[0]];
    case 'has': return Object.prototype.hasOwnProperty.call(p, a[0]) && p[a[0]] != null;
    case 'to-number': { const v = V(a[0]); const n = Number(v); return (v == null || v === '' || Number.isNaN(n)) ? (a.length > 1 ? V(a[1]) : 0) : n; }
    case 'to-string': { const v = V(a[0]); return v == null ? '' : String(v); }
    case 'abs': return Math.abs(V(a[0]));
    case '==': return V(a[0]) === V(a[1]);
    case '!=': return V(a[0]) !== V(a[1]);
    case '<=': return V(a[0]) <= V(a[1]);
    case '>=': return V(a[0]) >= V(a[1]);
    case '>': return V(a[0]) > V(a[1]);
    default: throw new Error('the filter grew an operator this check cannot evaluate: ' + op);
  }
};
test('#R604 ④ ohmFilter の式と inForce の述語は、同じレコードに同じ答えを返す', () => {
  const cases = [];
  for (const type of ['administrative', 'boundary'])
    for (const lv of [2, 3, 4, 5, 6, 8])
      for (const mar of [undefined, 'yes', 'no'])
        for (const s of [undefined, 1500, 1900, 6e-154])
          for (const e of [undefined, 1600, 1871.6589, 6e-154, 3.8e180])
            cases.push(Object.assign({ type, admin_level: lv },
              mar === undefined ? {} : { maritime: mar },
              s === undefined ? {} : { start_decdate: s },
              e === undefined ? {} : { end_decdate: e }));
  for (const [lo, hi] of [[3, 4], [5, 6]])
    for (const y of [1, 1000, 1550, 1871, 1900, 2000]) {
      const t = HS.decYear(y, 6, 15), expr = HS.ohmFilter(lo, hi, t);
      for (const p of cases) {
        assert.equal(evalExpr(expr, p), HS.inForce(p, lo, hi, t),
          `expression and predicate disagree at ${y} on ${JSON.stringify(p)}`);
      }
    }
  assert.ok(cases.length >= 200, `only ${cases.length} records exercised`);
});

test('#R705 OHM tile expression and evaluator exclude the end instant', () => {
  const c = vm.createContext({ window: {} });
  vm.runInContext(read('js/hist-scale.js'), c);
  const h = c.window.IntMapHistScale;
  const p = { type: 'administrative', admin_level: 4, start_decdate: 1800, end_decdate: 1900 };
  assert.equal(h.inForce(p, 3, 4, 1900), false);
  assert.equal(h.inForce(p, 3, 4, 1899.99), true);
  assert.equal(h.inForce({ ...p, end_decdate: undefined }, 3, 4, 1900), true);
  /* the expression's end comparison is strict — its SHAPE, since #R604 ④ proves it agrees with inForce */
  assert.match(JSON.stringify(h.ohmFilter(3, 4, 1900)), /\[">",\["to-number",\["get","end_decdate"\]/);
});

test('#R705 tile one-day events require raw day precision and only survive on that day', () => {
  const c = vm.createContext({ window: {} });
  vm.runInContext(read('js/hist-scale.js'), c);
  const h = c.window.IntMapHistScale;
  const t = h.decYear(1900, 2, 28);
  const p = { type: 'administrative', admin_level: 4, start_date: '1900-02-28', end_date: '1900-02-28', start_decdate: t, end_decdate: t };
  assert.equal(h.inForce(p, 3, 4, t), true);
  assert.equal(h.inForce(p, 3, 4, h.decYear(1900, 2, 27)), false);
  assert.equal(h.inForce(p, 3, 4, h.decYear(1900, 3, 1)), false);
  for (const raw of [undefined, '1900', '1900-02', '1900-02-28?']) {
    assert.equal(h.inForce({ ...p, start_date: raw, end_date: raw }, 3, 4, t), false);
  }
});

/* ══ the bundles the labels read ════════════════════════════════════════════════════════════ */

/* ── (#R604 ⑥) ラベルの束は本当に全時代を持つか ────────────────────────────────
   ⚠ 線はタイルから来るが、九言語の名前はタイルに無い（`name` 一つだけ）。だからラベルは束が答える。 */
const inForceAt = (D, y) => {
  const t = y * 10000 + 615;
  return D.feats.filter(f => (f[2] * 10000 + f[3] * 100 + f[4]) <= t && (f[5] * 10000 + f[6] * 100 + f[7]) >= t).length;
};
test('#R604 ⑥ 第1層の束は西暦1年から現在まで、どの世紀にも単位を持つ', () => {
  const D = evalGlobal('data/hist-admin1.js').__HISTADM1;
  assert.equal(D.since, HS.FLOOR, `the bundle floor ${D.since} must follow the clock floor ${HS.FLOOR}`);
  assert.ok(/OpenHistoricalMap/.test(D.src) && /CC0/.test(D.src), `src does not name the source and licence: ${D.src}`);
  assert.ok(D.feats.length > 4000, `only ${D.feats.length} units — the all-eras rebuild did not land`);
  /* ⚠ 数は「増えた」ではなく「どの世紀にもある」で測る */
  for (const y of [1, 500, 1000, 1500, 1700, 1800, 1850, 1900, 1950]) {
    assert.ok(inForceAt(D, y) > 0, `no dated subdivision at all is in force in ${y}`);
  }
  assert.ok(inForceAt(D, 1500) > 100, `only ${inForceAt(D, 1500)} units in 1500`);
  /* 令制国は 1871-08-29 に廃止される —— 束の日付が本当に日単位であることの実例 */
  const izu = D.feats.find(f => f[9] && f[9].ja === '伊豆国');
  assert.ok(izu, '伊豆国 is not in the record');
  assert.deepEqual([izu[5], izu[6], izu[7]], [1871, 8, 29], '廃藩置県 is not day-exact in the bundle');
  assert.ok(inForceAt(D, 1870) > inForceAt(D, 1), 'sanity: the record thickens towards the present');
});

/* ── (#R604 ⑦) どの束が、どの名前を名乗るか ─────────────────────────────────────
   ⚠⚠⚠ これは実際に起きた（2026-09-10）。`--global` を渡し忘れると第2層が `window.__HISTADM1=` で始まる
   15 MB になり、js/time-admin1.js が注入した瞬間に第1層の記録が第2層に置き換わった。規約は出荷物の側でも測る。 */
test('#R604 ⑦ 各束は、自分のファイル名が示す global だけを名乗る', () => {
  for (const [file, want, other] of [['data/hist-admin1.js', '__HISTADM1', '__HISTADM2'],
                                     ['data/hist-admin2.js', '__HISTADM2', '__HISTADM1']]) {
    const w = evalGlobal(file);
    assert.ok(w[want], `${file} does not define window.${want}`);
    assert.equal(w[other], undefined,
      `${file} defines window.${other} as well — loading it would replace the other tier's record`);
    assert.equal(w[want].since, HS.FLOOR, `${file} was not built for the clock range`);
  }
});

/* ══ #R700 — 親の許容幅が子より粗いことは、読者の画面に現れるのか ═══════════════════════════
   報告は「admin1（0.02°）が admin2（0.012°）より粗い」。逆転は本物（中央セグメント長 8.44 km 対 5.02 km）
   だが、束の線は既定では1本も描かれていない。だから守るのは「0.02° であること」ではなく、① 宣言と中身の
   一致、② 束の線が既定では描かれないという事実（評価して）、③ 散文の数と同梱バイトの一致。
   ⚠ 数は1つもこのファイルに書かない（#R500）。 */

test('#R700 ① 各層の宣言 tolerance と、格納されたジオメトリの粗さが一致する', () => {
  const T = tiers();
  assert.ok(T.length >= 2, 'js/time-admin1.js から層が数え上げられない');
  const seen = [];
  for (const t of T) {
    const d = bundle(t);
    assert.equal(typeof d.tolerance, 'number', `${t.file} は自分の tolerance を宣言していない`);
    assert.ok(d.tolerance > 0, `${t.file} の tolerance が正でない`);
    assert.equal(typeof d.since, 'number', `${t.file} は自分の since を宣言していない`);
    /* ⚠ (#R719) 集合として照合する——1レベルだけの層が出て初めて継ぎ目が見えた。
       ⚠ 束は vm の別 realm で作られた配列なので、こちらの realm の配列に写してから比べる。 */
    const want = []; for (let v = t.lo; v <= t.hi; v++) want.push(v);
    assert.deepEqual(Array.from(d.levels).sort((a, b) => a - b), want,
      `${t.file} の levels ${JSON.stringify(d.levels)} と、モジュールが読む lo/hi ${t.lo}–${t.hi} が違う集合を指している`);
    /* 量子化の格子が許容幅を支配していないこと */
    let dec = 0;
    for (let i = 0; i < Math.min(d.rings.length, 500); i++)
      for (const p of d.rings[i]) for (const v of p) {
        const s = String(v), k = s.includes('.') ? s.split('.')[1].length : 0; if (k > dec) dec = k;
      }
    assert.ok(Math.pow(10, -dec) * 2 < d.tolerance, `${t.file}: ${dec} 桁の格子が tolerance ${d.tolerance}° を飲み込んでいる`);
    seen.push({ t, d, med: median(segmentsKm(d.rings)) });
  }
  /* 層どうし: 宣言が粗いほうが、実際に粗く描かれていること。⚠ 頂点密度で訊いてはならない
     （Douglas–Peucker は直線区間に頂点を残さないので、密度は地形を報告する）。 */
  for (let i = 1; i < seen.length; i++) {
    const a = seen[i - 1], b = seen[i];
    const tolRatio = a.d.tolerance / b.d.tolerance, segRatio = a.med / b.med;
    assert.ok(tolRatio === 1 || Math.sign(tolRatio - 1) === Math.sign(segRatio - 1),
      `${a.t.file} と ${b.t.file}: 宣言は ${a.d.tolerance}/${b.d.tolerance} なのに、描かれる辺の中央値は ${a.med.toFixed(2)}/${b.med.toFixed(2)} km`);
    const q = segRatio / tolRatio;
    assert.ok(q > 0.5 && q < 2, `宣言された許容幅の比 ${tolRatio.toFixed(2)} と、実際の辺長の比 ${segRatio.toFixed(2)} が離れている（${q.toFixed(2)} 倍）`);
  }
});

/* the factory, EVALUATED against a recording engine (#R700 built it; `zoom`, `layerOff` and the
   painted-tile count are the knobs). 合成の束（同梱の 26 MB は読まない——ここで測るのは可視性の規則）. */
function tierHarness(opts = {}) {
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
  vm.runInContext(read('js/hist-bundles.js'), ctx, { filename: 'hist-bundles.js' });   /* (hist-bundles-off-main) the door the tiers open their records through */
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

test('#R700 ② 束の線は「タイルが来ない」と実証されるまで描かれない（評価）', async () => {
  /* ⚠ (#R719) カメラは**いちばん深い層が立つ縮尺**に置く。固定の 7 のままだと z8 から立つ第3階層は
     レイヤーが1枚も作られず、`vis()` が `null` を返して「見えていない」と読めてしまう。 */
  const T = tiers(), H = tierHarness({ zoom: Math.max.apply(null, T.map((t) => t.minZ || 0)) });
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

test('#R700 ③ 深い層は縮尺で閉じている——2本の束の線が同時に出る条件の一つ', async () => {
  const T = tiers(), deep = T.filter((t) => t.deep);
  assert.ok(deep.length, '深い層が1つも見つからない');
  const H = tierHarness({ zoom: Math.max.apply(null, T.map((t) => t.minZ || 0)) });
  H.travel(1900);
  await settle();
  /* ⚠ (#R719) 下限は**その層自身のもの**である——1つの数に揃えることは、第3階層を描けない縮尺に置くか、
     第2階層を読めない縮尺に引きずり下ろすかのどちらかになる。 */
  assert.equal(typeof H.mod.deepZoom(), 'number', 'deepZoom() が数を返さない');
  for (const t of deep) {
    assert.ok(Number.isFinite(t.minZ) && t.minZ > 0, `${t.line}: 深い層が自分の minZ を宣言していない`);
    assert.equal(H.minzoom(t.line), t.minZ, `${t.line}: minzoom が自分の minZ と違う`);
    assert.equal(H.minzoom(t.vtLine), t.minZ, `${t.vtLine}: minzoom が自分の minZ と違う`);
  }
  const zs = deep.map((t) => t.minZ);
  assert.equal(new Set(zs).size, zs.length, '2つの深い層が同じ縮尺を名乗っている——どちらかは自分の中央値から導かれていない');
  for (const t of T.filter((x) => !x.deep)) assert.equal(H.minzoom(t.line), undefined, `${t.line}: 第1級の線に縮尺の下限が付いた`);
});

test('#R700 ④ レイヤーを切った読者には、時代の区分線は1本も出ない', async () => {
  const H = tierHarness({ layerOff: true, zoom: Math.max.apply(null, tiers().map((t) => t.minZ || 0)) });
  H.travel(1900);
  await settle();
  H.advance(60000); H.bus.emit('idle');
  await settle();
  for (const t of tiers()) {
    assert.equal(H.vis(t.line), 'none', `${t.line}`);
    assert.equal(H.vis(t.vtLine), 'none', `${t.vtLine}`);
  }
});

/* ── ⑤⑥⑦ 散文の数は、同梱されているバイトと一致する ─────────────────────────── */
test('#R700 ⑤ js/time-admin1.js 自身の段落が述べる数が、束の実測と一致する', () => {
  const T = tiers();
  for (const t of T) {
    const d = bundle(t);
    assert.ok(TA.includes(String(d.tolerance) + '°'), `${t.file} の tolerance ${d.tolerance}° を、モジュールはどこにも述べていない`);
    /* ⚠⚠⚠ (#R700) `statSync().size` はチェックアウトの改行設定を測っていて、束の大きさを測っていない
       （ローカル 10,433,200 B・CI 10,433,199 B）。⇒ 改行を正規化してから測る。 */
    assert.ok(has(TA, lfBytes(t.file)), `${t.file} の実バイト数を、モジュールの段落が述べていない`);
    let verts = 0; for (const r of d.rings) verts += r.length;
    assert.ok(has(TA, verts), `${t.file} の頂点数 ${verts} を、モジュールの段落が述べていない`);
  }
  /* 第1級の件数と、ある6月に有効な件数（ヘッダの表） */
  const first = T.find((t) => !t.deep), d1 = bundle(first);
  assert.ok(has(TA, d1.feats.length), `第1級の件数 ${d1.feats.length} を、ヘッダが述べていない`);
  for (const y of [1, 1000, 1500, 1800]) assert.ok(has(TA, inForceRows(d1, y, 6, 15)), `${y} 年 6 月に有効な ${inForceRows(d1, y, 6, 15)} 件を、ヘッダが述べていない`);
});

test('#R700 ⑥ 出典ページは9言語とも、いま同梱されている記録の数を述べる', () => {
  const dir = path.join(ROOT, 'js/locales');
  const files = fs.readdirSync(dir).filter((f) => /^pages\..+\.js$/.test(f));
  assert.ok(files.length >= 9, `出典ページが ${files.length} 言語しかない`);
  const first = tiers().find((t) => !t.deep), d = bundle(first);
  const units = d.feats.length, force1900 = inForceRows(d, 1900, 6, 15);
  for (const f of files) {
    const s = read('js/locales/' + f);
    if (!s.includes('hist-admin1.js')) continue;          /* その言語がこの記録に触れていないなら、述べる数も無い */
    assert.ok(has(s, units), `${f}: 第1級の件数が ${units} ではない`);
    assert.ok(has(s, force1900), `${f}: 1900 年に有効な件数が ${force1900} ではない`);
    assert.ok(s.includes(String(d.tolerance)) || s.includes(String(d.tolerance).replace('.', ',')),
      `${f}: 簡略化の許容幅 ${d.tolerance}° を述べていない`);
  }
});

test('#R700 ⑦ docs/FILES.md と CI の説明が述べる数が、同梱のバイトと一致する', () => {
  const FILES = read('docs/FILES.md'), CI = read('.github/workflows/ci.yml');
  for (const t of tiers()) {
    const d = bundle(t), bytes = lfBytes(t.file);   /* 改行設定に依存しない——上の ⑤ を参照 */
    assert.ok(has(FILES, d.feats.length), `docs/FILES.md: ${t.file} の件数が ${d.feats.length} ではない`);
    assert.ok(has(FILES, d.rings.length), `docs/FILES.md: ${t.file} の rings が ${d.rings.length} ではない`);
    assert.ok(FILES.includes((bytes / 1000000).toFixed(2) + ' MB'), `docs/FILES.md: ${t.file} の大きさが ${(bytes / 1000000).toFixed(2)} MB ではない`);
  }
  /* CI が「全環を焼き直す」と言うときの環の数は、印の記録が自分で数えている数 */
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(read('data/border-coast.js'), ctx, { filename: 'border-coast.js' });
  const sets = ctx.window.__IMBCOAST.sets;
  const rings = Object.keys(sets).reduce((a, k) => a + sets[k].rings, 0);
  assert.ok(has(CI, rings), `.github/workflows/ci.yml: 再導出される環は ${rings} 本`);
});

/* ══ #R705 — the dates of a subdivision, from the record to the popup ═══════════════════════
   js/time-admin1.js's date arithmetic is LIFTED by its braces and run; the module's own constants are
   READ rather than retyped (#R536: a value this harness invented could disagree with the shipped one). */
function fn(name, source = TA) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  for (; depth; end++) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; }
  return source.slice(start, end);
}
function constOf(name, source = TA) {
  let k = -1;
  for (let p = source.indexOf(name); p >= 0; p = source.indexOf(name, p + 1)) {
    const before = p === 0 ? ' ' : source[p - 1];
    if (/[A-Za-z0-9_$]/.test(before)) continue;
    let q = p + name.length;
    while (q < source.length && source[q] === ' ') q++;
    if (source[q] !== '=' || source[q + 1] === '=') continue;
    k = q + 1; break;
  }
  assert.ok(k >= 0, 'js/time-admin1.js: no declaration of ' + name);
  let e = k;
  while (e < source.length && source[e] !== ',' && source[e] !== ';') e++;
  return source.slice(k, e).trim();
}
function runtime() {
  /* ⚠ (hist-bundles-off-main) `fcAt` asks its handle which rows are in force and `bounds` is what `load()`
     was handed by the thread that holds the record — so `load` is LIFTED too and run against the REAL
     js/hist-bundles.js, over a record published on `window` (the door reads it where it is). The rule
     under test is therefore the shipped one on both sides of the door. */
  const ctx = vm.createContext({ window: { IntMapHistScale: { FLOOR: -123000 } }, cfg: { key: 'a1', file: 'data/x.js', global: '__TESTADM' }, nameOf: f => f[0], geomOf: () => null, Math, Map });
  vm.runInContext(read('js/hist-bundles.js'), ctx);
  /* ⚠ `fcAt` stamps the collision order of the name on every feature, so the three names that ordering
     is made of are LIFTED from the shipped module, not stubbed (#R621). `geomOf` stays null because
     the SUBJECT here is the clock, and `areaKm2` answers 0 for a geometry that is not there. */
  vm.runInContext('const _ymd=(y,m,d)=>y*10000+m*100+d; let _bnd=null, _D=null, _P=null, _H=null; const _area=new Map(); const SORT_PROP=' + constOf('SORT_PROP') + '; '
    + ['areaKm2', 'sortKeyOf', 'areaOf', 'bounds', 'epoch', 'load'].map(n => fn(n)).join('\n') + '\nasync ' + fn('fcAt'), ctx);
  /* publish the record and open it — what `go()` does before it asks anything */
  ctx.use = async (data) => { ctx.window.__TESTADM = data; ctx.data = await vm.runInContext('load()', ctx); };
  return ctx;
}
const row = (name, start, end) => [name, 4, ...start, ...end, [], {}, 123];

test('#R705 OHM changeover day removes the previous polygon and advances the epoch', async () => {
  const c = runtime();
  await c.use({ since: 1, feats: [row('old', [1, 1, 1], [99, 2, 28]), row('new', [99, 2, 28], [100, 1, 1])] });
  assert.equal(await vm.runInContext('fcAt(data,99,2,28).then(fc=>fc.features.map(f=>f.properties.NAME).join())', c), 'new');
  assert.equal(vm.runInContext('epoch(data,99,2,28)', c), 990228);
  assert.equal(await vm.runInContext('fcAt(data,99,2,27).then(fc=>fc.features[0].properties.NAME)', c), 'old');
});
test('#R705 ended units without successors vanish at their end, including early leap years', async () => {
  const c = runtime();
  await c.use({ since: 1, feats: [row('unit', [1, 1, 1], [4, 2, 29])] });
  assert.equal(await vm.runInContext('fcAt(data,4,2,29).then(fc=>fc.features.length)', c), 0);
  assert.equal(vm.runInContext('epoch(data,4,2,29)', c), 40229);
});
test('#R705 epoch floor follows the time kernel for bundles with no declared since', async () => {
  const c = runtime();
  await c.use({ feats: [row('unit', [-500, 1, 1], [-400, 1, 1])] });
  assert.equal(vm.runInContext('epoch(data,-400,1,1)', c), -3999899);
});
test('#R705 KUNI uses the same abolition date contract as its OHM neighbours', async () => {
  const c = runtime();
  const f = row('kuni', [-199, 1, 1], [1871, 8, 29]); f[10] = null;
  await c.use({ since: 1, feats: [f] });
  assert.equal(await vm.runInContext('fcAt(data,1871,8,28).then(fc=>fc.features.length)', c), 1);
  assert.equal(await vm.runInContext('fcAt(data,1871,8,29).then(fc=>fc.features.length)', c), 0);
});
test('#R705 rendered features retain raw date precision instead of publishing normalized bounds as facts', async () => {
  const c = runtime();
  const dates = { start: { raw: '1800', precision: 'year', qualified: false }, end: { raw: '1900-02', precision: 'month', qualified: false } };
  await c.use({ since: 1, dateSemantics: 'exclusive-end', dates: { 123: dates }, feats: [row('unit', [1800, 1, 1], [1900, 3, 1])] });
  const p = await vm.runInContext('fcAt(data,1900,2,28).then(fc=>fc.features[0].properties)', c);
  assert.deepEqual(p.dates, dates);
  assert.equal(p.dateSemantics, 'exclusive-end');
  assert.equal(await vm.runInContext('fcAt(data,1900,3,1).then(fc=>fc.features.length)', c), 0);
});

test('#R705 province popup shows only original source dates, including qualification and unknown endpoints', () => {
  const ui = read('js/map-ui.js');
  const c = vm.createContext({ HOST: { lang: 'jp' }, window: {} });
  vm.runInContext(read('js/lang-registry.js'), c);
  vm.runInContext(fn('_eraSourceDates', ui), c);
  c.props = { dates: JSON.stringify({ start: { raw: null }, end: { raw: '1871-08~', precision: 'month', qualified: true } }) };
  assert.equal(vm.runInContext('_eraSourceDates(props)', c), '出典の日付: ? – 1871-08~');
  c.HOST.lang = 'en';
  assert.equal(vm.runInContext('_eraSourceDates({})', c), 'Source dates: ? – ?');
});
test('#R705 province label click carries source-date supplement; exact hit delegates to it and padded hit preserves it', () => {
  const ui = read('js/map-ui.js');
  let shown;
  const c = vm.createContext({ HOST: { lang: 'en' }, window: { IntMapTimeAdmin1: { geomAt: () => ({ type: 'Polygon' }), geomFullAt: () => null } },
    _ownedByOther: () => false, _deferLabel: (e, cb) => cb(), labelAnchor: () => [0, 0], _bothNames: (p, n) => n,
    readPlace: () => false, // This fixture is the ordinary province reader; source-owned place arbitration is exercised by R709.
    showPopup: (...args) => { shown = args[3]; } });
  vm.runInContext(read('js/lang-registry.js'), c);
  vm.runInContext(['_eraSourceDates', '_eraGeom', 'onLabel'].map(n => fn(n, ui)).join('\n'), c);
  c.e = { features: [{ layer: { id: 'imta-lbl' }, properties: { name: 'Province', _ix: 0, dates: { start: { raw: '1800' }, end: { raw: null } } } }] };
  vm.runInContext('onLabel(false)(e)', c);
  assert.equal(shown.sub, 'Source dates: 1800 – ?');
  assert.equal(shown.geojson.type, 'Polygon');
  /* ⚠ SPELLING, ON PURPOSE: the exact-hit early return is one line of map-ui's click dispatch, which
     is the whole label-popup closure (tests/history-click-ownership-checks runs that closure). */
  assert.match(ui, /if\(hit.length\) return;/, 'exact hits use the same per-layer handler');
  const call = ui.slice(ui.indexOf('if(nm){ showPopup(labelAnchor(near[0],e)'));
  const invocation = call.slice(call.indexOf('showPopup('), call.indexOf(';') + 1);
  Object.assign(c, { near: c.e.features, nm: 'Province', lid: 'imta-lbl', geoLbl: false, ttl: 'Province' });
  vm.runInContext('const peg=_eraGeom(near[0]);' + invocation, c);
  assert.equal(shown.sub, 'Source dates: 1800 – ?');
});

/* ══ #R707 — 歴史行政区分のラベルが衝突したとき、消えるものを決めているのは何か ═══════════════════
   `imta-lbl` / `imta2-lbl` は `text-optional: true` を持つ——衝突した名前は黙って消える。`symbol-sort-key` が
   無いと優先順位は上流 Overpass が答えた行順（面積との順位相関 +0.076 / −0.061 ＝雑音）。守るのは性質:
   ① 順位の式があり feature の値を読む ② 行順ではない ③ 向きが正しい ④ 2つの層が同じ規則 ⑤ 絞り込みではない
   ⑥ 面積は区分ごとに1度だけ測られる。式は `createExpression`（描画器と同じパーサ）で実際に評価する。 */

/* ⚠ 面積を行順にぴったり従わせる（1 行目が最小・最終行が最大）。正しい順位＝面積の降順は行順の
   ちょうど逆になるので、「順位が無い」も「向きが逆」も同じ一つの記録で赤くなる。 */
function synthOrder(n, counts) {
  const rings = [], feats = [];
  for (let i = 0; i < n; i++) {
    const w = i + 1, x0 = -170 + i * 20;
    const ring = [[x0, 0], [x0 + w, 0], [x0 + w, w], [x0, w], [x0, 0]];
    /* ⑥ のための計器: この環の座標が「読まれた」回数（実装の内部を覗かずに訊く唯一の外からの手段） */
    rings.push(counts ? new Proxy(ring, {
      get(t, k) { if (typeof k === 'string' && /^\d+$/.test(k)) counts[i] = (counts[i] || 0) + 1; return t[k]; }
    }) : ring);
    /* ⚠ 最小の区分だけが 1901-01-01 に終わる——1900 年と 1901 年が別のエポックになり fcAt が作り直される */
    const end = (i === 0) ? [1901, 1, 1] : [1950, 12, 31];
    feats.push(['U' + i, (i % 2) ? 3 : 4, 1800, 1, 1, end[0], end[1], end[2], [[i]], { en: 'U' + i }, 1000 + i]);
  }
  return { v: 1, src: 'synthetic', since: 1, tolerance: 0.02, levels: [3, 4], rings, feats };
}
/* the factory again, at z8 with real Date and no tile-state knobs (#R707's own scaffold) */
function orderHarness(n, counted) {
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
  for (const t of tiers()) { counts[t.key] = []; win[t.global] = synthOrder(n, counted ? counts[t.key] : null); }
  const ctx = {
    window: win, console, navigator: {},
    document: { getElementById: () => ({ checked: true, closest: () => null }),
                createElement: () => ({ style: {} }), head: { appendChild: () => {} } },
    setTimeout: (f, ms) => { const h = setTimeout(f, ms); if (h.unref) h.unref(); return h; },
    clearTimeout, Promise, Math, JSON, Number, Array, Date, Set, Map, isFinite
  };
  vm.createContext(ctx);
  vm.runInContext(read('js/hist-scale.js'), ctx, { filename: 'hist-scale.js' });
  vm.runInContext(read('js/hist-bundles.js'), ctx, { filename: 'hist-bundles.js' });   /* (hist-bundles-off-main) the door the tiers open their records through */
  vm.runInContext(TA, ctx, { filename: 'time-admin1.js' });
  const mod = win.IntMapModules.timeAdmin1({ canDraw: () => true, lang: 'en', isMobile: () => true });
  return {
    mod, layers, counts,
    travel: (y) => mod._go(vm.runInContext(`new Date(Date.UTC(${y}, 5, 15))`, ctx)),
    layer: (id) => (layers.has(id) ? layers.get(id).spec : null),
    data: (id) => (sources.has(id) ? sources.get(id).data : null)
  };
}
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
  const Rk = 6371.0088, D = Math.PI / 180;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let a = 0;
  for (const poly of polys) for (let k = 0; k < poly.length; k++) {
    let s = 0; const r = poly[k];
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      s += (r[i][0] - r[j][0]) * D * (2 + Math.sin(r[j][1] * D) + Math.sin(r[i][1] * D));
    const A = Math.abs(s * Rk * Rk / 2); a += (k === 0) ? A : -A;
  }
  return a;
}
async function drawn() {
  const H = orderHarness(9);
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

test('#R707 ① 名前の層は衝突の順位を持ち、それは feature ごとに違う', async () => {
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

test('#R707 ② 順位の順序は、ソースの行順ではない', async () => {
  for (const { t, spec, feats } of await drawn()) {
    const k = keyer(spec);
    const byKey = feats.map((f, i) => i).sort((a, b) => k(feats[a]) - k(feats[b]));
    const rowOrder = feats.map((f, i) => i);
    assert.notDeepEqual(byKey, rowOrder,
      `${t.lbl}: 順位の順序がソースの行順と同じ——記録のファイル順が、読者に見える名前を決めている`);
  }
});

test('#R707 ③ 先に置かれるのは大きい区分（MapLibre は小さい鍵が先）', async () => {
  for (const { t, spec, feats } of await drawn()) {
    const k = keyer(spec);
    const byKey = feats.slice().sort((a, b) => k(a) - k(b));
    const byArea = feats.slice().sort((a, b) => areaOf(b.geometry) - areaOf(a.geometry));
    assert.deepEqual(byKey.map((f) => f.properties.NAME), byArea.map((f) => f.properties.NAME),
      `${t.lbl}: 順位の順序が、描かれる面積の降順と一致しない（向きを逆にすると大きい区分が全部消える）`);
  }
});

/* ⚠ 式の綴りを比べているのではない——**同じ feature に同じ順位を返すか**を比べる。 */
test('#R707 ④ 両方の層が、同じ feature に同じ順位を与える', async () => {
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

test('#R707 ⑤ 順位は絞り込みではない——有効な区分は1件も減らない', async () => {
  const n = 9;
  for (const { t, spec, feats } of await drawn()) {
    assert.equal(spec.filter, undefined, `${t.lbl}: 名前の層に filter が付いた——順位は何を描くかを変えてはならない`);
    assert.equal(feats.length, n, `${t.lbl}: 合成記録の ${n} 件のうち ${feats.length} 件しか届いていない`);
  }
});

/* ⚠ 面積は区分の性質であって、その瞬間の性質ではない。別のエポックへ移って `fcAt` が作り直されたとき、
   両方の日付で有効な区分の座標は1度も読み直されないこと（環そのものが読まれた回数を数える proxy）。 */
test('#R707 ⑥ 面積は区分ごとに1度だけ測られる（別のエポックへ移っても測り直さない）', async () => {
  const T = tiers(), H = orderHarness(9, true);
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
    const i = +String(nm).slice(1);   /* 合成記録では区分 i の環は i 番（synthOrder を参照） */
    assert.equal(after[i], before[i],
      `${nm}: 別のエポックへ移っただけで座標が読み直されている（${before[i]} → ${after[i]}）——面積が描画のたびに測り直されている`);
  }
});
