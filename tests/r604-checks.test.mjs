/* ============================================================================
 *  R604 — 全時代に届くか、線は上流の解像度か（ブラウザ無しで測れる分）
 * ----------------------------------------------------------------------------
 *  「歴史的地方区分の境界線のcoverageがくそ。全時代、全地域で完璧に網羅しろ。
 *    線の解像度も低すぎる。」
 *
 *  ⚠⚠⚠ **ここは全部「評価」であって「ソースの読み取り」ではない**（#R505）。
 *  綴りを固定する検査は、死んだ規則を緑のまま通す（#R488）。だから時計は実際に
 *  `setYear(1)` を呼んで**帰ってきた年**を読み、フィルタは実際に**レコードを通して**
 *  可否を読み、レールは実際に**往復**させる。
 *
 *  ⚠ ブラウザが要るもの（タイルが本当に描くか・束の予備と入れ替わるか）は
 *  `tests/r530.spec.js` に足してある。spec を1本足すと `scripts/test-budget.mjs` の
 *  天井（上げてはならない）に当たるので、**主張は既存の spec に畳み、測れるものは
 *  ここ（無料）で測る**。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* それぞれのファイルを、それが本当に必要とするものだけを与えて評価する。 */
function evalGlobal(file) {
  const ctx = { window: {}, document: undefined, console };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(read(file), ctx, { filename: file });
  return ctx.window;
}

const HS = evalGlobal('js/hist-scale.js').IntMapHistScale;

/* ── ① 時計は本当に西暦1年へ行くか ────────────────────────────────────────────
   ⚠⚠⚠ これが「1850 → 1 と書き換えた」だけの検査ではないのは、`Date.UTC(1,0,1)` が
   **1901年**だからである（ECMA-262 の2桁年規則）。`YMIN=1` と書いただけの実装は
   `min === 1` を満たしたまま、地図を1901年へ連れて行く。だから読むのは定数ではなく
   **設定したあとの年**。 */
test('① Chronos は西暦1年に到達する（Date.UTC の2桁年規則に落ちない）', () => {
  const T = evalGlobal('js/chronos.js').IntMapTime;
  assert.equal(T.min, 1, 'the kernel floor is year 1');
  for (const y of [1, 5, 50, 99, 100, 1500, 1850]) {
    T.setYear(y);
    assert.equal(T.year(), y, `setYear(${y}) landed in ${T.year()}`);
    assert.equal(T.iso().slice(0, 4), String(y).padStart(4, '0'), `iso() disagrees for ${y}`);
  }
  /* 下限より前は下限に丸められる（未来は LIVE に戻る、という既存の対称) */
  T.set(new Date('0000-06-15T00:00:00Z'));
  assert.equal(T.year(), 1, 'below the floor clamps to the floor');
  T.setNow();
  assert.equal(T.isLive(), true, 'setNow releases every subscriber');
});

/* ── ② 10進年は OHM が書いている数と同じか ────────────────────────────────────
   実測: 伊豆国 (relation 2687374) は end_date 1871-08-29、タイルの end_decdate は
   1871.6589。閏年の扱いを間違えると1日ぶんずれ、「廃止された翌日にまだ描く」になる。 */
test('② decYear は OHM の decdate と一致する', () => {
  /* ⚠ 上流 103,093 件に当てて選んだ規約 = 年 + (通日 − 0.5)/年の長さ（その日の**中点**）。
     1日の**始まり**にすると、始まったその日にだけ描かれない不具合が全ユニットに出る。 */
  assert.ok(Math.abs(HS.decYear(1871, 8, 29) - 1871.6589) < 1e-4,
    `decYear(1871-08-29) = ${HS.decYear(1871, 8, 29)}, upstream writes 1871.6589`);
  assert.ok(HS.decYear(1900, 1, 1) > 1900 && HS.decYear(1900, 1, 1) - 1900 < 2 / 365,
    'the first day of a year sits just inside it, at the day midpoint');
  /* 始まった当日に「まだ始まっていない」と判定されないこと —— 半日ずれの現れ方そのもの */
  const born = HS.decYear(1871, 8, 29);
  assert.ok(HS.inForce({ type: 'administrative', admin_level: 4, start_decdate: 1871.6589 }, 3, 4, born), true);
  /* 閏年: 2000-03-01 は 60/366、非閏年 1900-03-01 は 59/365 —— 同じ日付が違う値になる */
  assert.ok(HS.decYear(2000, 3, 1) - 2000 > HS.decYear(1900, 3, 1) - 1900 - 1e-9,
    'a leap year must not be measured with 365 days');
  /* 単調 —— 年内のどの2日も順序が保たれる */
  let prev = -1;
  for (let m = 1; m <= 12; m++) for (const d of [1, 15, 28]) {
    const v = HS.decYear(1600, m, d);
    assert.ok(v > prev, `decYear went backwards at 1600-${m}-${d}`);
    prev = v;
  }
});

/* ── ③ フィルタは何を通し、何を拒むか ────────────────────────────────────────
   `ohmFilter` が組む式そのものは描画器のものだが、**同じ規則**を `inForce` が評価する。
   ここで測るのはその規則で、⚠ 両者が離れないことは ④ が測る。 */
test('③ 日付・階層・海の規則（境界のあるレコードだけが通る）', () => {
  const t = HS.decYear(1870, 6, 15);
  const izu = { type: 'administrative', admin_level: 4, end_decdate: 1871.6589 };
  assert.equal(HS.inForce(izu, 3, 4, t), true, '伊豆国 is in force in 1870');
  assert.equal(HS.inForce(izu, 3, 4, HS.decYear(1880, 6, 15)), false, 'and gone in 1880');
  assert.equal(HS.inForce(izu, 5, 6, t), false, 'a level-4 unit is not the deeper tier');
  /* ⚠ 端が無いことは「いま始まる」でも「決して始まらない」でもない —— 制約しない */
  assert.equal(HS.inForce({ type: 'administrative', admin_level: 3 }, 3, 4, HS.decYear(1, 6, 15)), true,
    'a record with no dates at all must not be deleted from every map');
  assert.equal(HS.inForce({ type: 'administrative', admin_level: 4, start_decdate: 1500 }, 3, 4, HS.decYear(1400, 6, 15)), false,
    'a unit must not be drawn before it started');
  /* ⚠ 海上の run は上流が自分で印を付けている —— #R564 が Natural Earth に対して導出した判断 */
  assert.equal(HS.inForce({ type: 'administrative', admin_level: 4, maritime: 'yes' }, 3, 4, t), false,
    'a maritime run is a coast, not a border');
  /* ⚠ 年になり得ない数は「日付」ではなく「日付が無い」。実測で 106,173 件中 3,080 件が
     こうなっており、素直に `>= t` に掛けると**全ての時代から消える**。 */
  assert.equal(HS.inForce({ type: 'administrative', admin_level: 4, end_decdate: 6e-154 }, 3, 4, t), true,
    'a bound that cannot be a year must constrain nothing, not delete the record');
  assert.equal(HS.inForce({ type: 'administrative', admin_level: 4, start_decdate: 3.8e180 }, 3, 4, t), true,
    'and the same at the other end of implausible');
  assert.equal(HS.inForce({ type: 'boundary', admin_level: 4 }, 3, 4, t), false, 'only administrative boundaries');
});

/* ── ④ 式と述語が同じことを言うか ────────────────────────────────────────────
   ⚠ **これが「規則が2か所ある」を捕まえる唯一の検査である**（#R536/#R515 の形）。
   `ohmFilter` は描画器が読む式、`inForce` は検査が読む述語。片方だけ直したら、
   地図とテストが別のことを言い始め、しかも両方緑になる。式を**実際に評価して**
   突き合わせる。 */
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
test('④ ohmFilter の式と inForce の述語は、同じレコードに同じ答えを返す', () => {
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

/* ── ⑤ 年レールは往復し、後戻りせず、精度を近代に置くか ────────────────────── */
test('⑤ Chronos の年レールは可逆・単調で、近代に精度を残す', () => {
  const MIN = 1, MAX = 2026, POS = HS.rail.POS;
  for (const y of [1, 100, 500, 1000, 1500, 1600, 1850, 1900, 1950, 2000, 2025, MAX]) {
    const back = HS.rail.toYear(HS.rail.toPos(y, MIN, MAX), MIN, MAX);
    assert.ok(Math.abs(back - y) <= 3, `year ${y} round-tripped to ${back}`);
  }
  let prev = -Infinity;
  for (let p = 0; p <= POS; p++) {
    const y = HS.rail.toYear(p, MIN, MAX);
    assert.ok(y >= prev, `the rail ran backwards at position ${p}`);
    prev = y;
  }
  assert.equal(HS.rail.toYear(0, MIN, MAX), MIN, 'the left stop is the floor');
  assert.equal(HS.rail.toYear(POS, MIN, MAX), MAX, 'the right stop is now');
  /* ⚠ 直線レールを直した理由そのもの: 1850 以降が半分を占める */
  assert.equal(HS.rail.toPos(1850, MIN, MAX), POS / 2, '1850 sits at the middle of the rail');
  const modern = HS.rail.toYear(POS, MIN, MAX) - HS.rail.toYear(POS - 1, MIN, MAX);
  assert.ok(modern <= 1, `a step near now moves ${modern} years — the precision the linear rail lost`);
  /* 床を上げても壊れない（将来 IntMapTime.min が動いてもレールは動くだけ） */
  assert.equal(HS.rail.toYear(0, 1900, MAX), 1900, 'a floor above every breakpoint still starts at the floor');
  assert.equal(HS.rail.toYear(POS, 1900, MAX), MAX, 'and still ends at now');
});

/* ── ⑥ ラベルの束は本当に全時代を持つか ──────────────────────────────────────
   ⚠ 線はタイルから来るが、**九言語の名前はタイルに無い**（`name` 一つだけ）。
   だからラベルは束が答える。束が 1850 以降しか持たなければ、古い年は線だけの
   無名の地図になる —— それは「全時代」ではない。 */
function bundle(file, global) {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(read(file), ctx, { filename: file });
  return ctx.window[global];
}
const inForceAt = (D, y) => {
  const t = y * 10000 + 615;
  return D.feats.filter(f => (f[2] * 10000 + f[3] * 100 + f[4]) <= t && (f[5] * 10000 + f[6] * 100 + f[7]) >= t).length;
};
test('⑥ 第1層の束は西暦1年から現在まで、どの世紀にも単位を持つ', () => {
  const D = bundle('data/hist-admin1.js', '__HISTADM1');
  assert.equal(D.since, HS.FLOOR, `the bundle floor ${D.since} must follow the clock floor ${HS.FLOOR}`);
  assert.ok(/OpenHistoricalMap/.test(D.src) && /CC0/.test(D.src), `src does not name the source and licence: ${D.src}`);
  assert.ok(D.feats.length > 4000, `only ${D.feats.length} units — the all-eras rebuild did not land`);
  /* ⚠ 数は「増えた」ではなく「どの世紀にもある」で測る。増分は上流次第だが、
     空の世紀があれば「全時代」は成り立たない。 */
  for (const y of [1, 500, 1000, 1500, 1700, 1800, 1850, 1900, 1950]) {
    assert.ok(inForceAt(D, y) > 0, `no dated subdivision at all is in force in ${y}`);
  }
  assert.ok(inForceAt(D, 1500) > 100, `only ${inForceAt(D, 1500)} units in 1500`);
  /* 令制国は 1871-08-29 に廃止される —— 束の日付が本当に日単位であることの実例 */
  const izu = D.feats.find(f => f[9] && f[9].ja === '伊豆国');
  assert.ok(izu, '伊豆国 is not in the record');
  assert.deepEqual([izu[5], izu[6], izu[7]], [1871, 8, 29], '廃藩置県 is not day-exact in the bundle');
  assert.ok(inForceAt(D, 1870) > inForceAt(D, 1) , 'sanity: the record thickens towards the present');
});

/* ── ⑦ どの束が、どの名前を名乗るか ────────────────────────────────────────────
   ⚠⚠⚠ **これは実際に起きた**（#R604、2026-09-10）。ビルドは `--global` を渡し忘れると
   `__HISTADM1` を既定にしていたので、第2層を焼いたら **`data/hist-admin2.js` の中身が
   `window.__HISTADM1=` で始まる 15 MB のファイル**になった。読み込みは成功し、エラーも警告も
   出ず、`js/time-admin1.js` が第2層を `<script>` で注入した瞬間に**第1層の記録が第2層に
   置き換わる**。ビルド側は名前を出力ファイル名から導くようにしたが、規約は**出荷物の側でも**
   測る——導出を直しても、次に誰かが `--global` で上書きできるのだから。 */
test('⑦ 各束は、自分のファイル名が示す global だけを名乗る', () => {
  for (const [file, want, other] of [['data/hist-admin1.js', '__HISTADM1', '__HISTADM2'],
                                     ['data/hist-admin2.js', '__HISTADM2', '__HISTADM1']]) {
    const ctx = { window: {} }; vm.createContext(ctx);
    vm.runInContext(read(file), ctx, { filename: file });
    assert.ok(ctx.window[want], `${file} does not define window.${want}`);
    assert.equal(ctx.window[other], undefined,
      `${file} defines window.${other} as well — loading it would replace the other tier's record`);
    assert.equal(ctx.window[want].since, HS.FLOOR, `${file} was not built for the clock range`);
  }
});

/* ── ⑧ 年になり得ない年を作らない ────────────────────────────────────────────
   ⚠⚠⚠ **このラウンドで同じ罠を4か所踏んだ**——カーネル（`js/chronos.js`）・Chronos パネルの
   下限（`floorMs`）・直接入力が作る瞬間（`zInstant`）・時間帯オフセットの逆算（`tzOffMs`）。
   最初の1つを直したときには「直した」と書いたコメントまで添えたが、残り3つは生きていて、
   4つ目は**入力欄の `min` 属性を 1901 と名乗らせていた**（実測。`IntMapTime.min` は 1）。
   だから規則の持ち主は1つで、ここではその持ち主を**評価して**測る——ソースを読む検査では
   `Date.UTC` を書いた5か所目を見つけられない。 */
test('⑧ utcAt は2桁年規則に落ちない（規則の持ち主は1つ）', () => {
  for (const y of [1, 5, 19, 50, 99, 100, 1850, 2026]) {
    const d = HS.utcAt(y, 0, 1, 0, 0, 0);
    assert.equal(d.getUTCFullYear(), y, `utcAt(${y}) landed in ${d.getUTCFullYear()}`);
  }
  /* 月・日・時分も落とさない（`Date.UTC` の置き換えとして使われている以上、同じ引数を取る） */
  const d = HS.utcAt(19, 2, 2, 13, 45, 0);
  assert.equal(d.toISOString(), '0019-03-02T13:45:00.000Z');
  /* そして `Date.UTC` は本当にそこが違う——この検査自身が罠を再現できることの証明 */
  assert.notEqual(new Date(Date.UTC(19, 2, 2)).getUTCFullYear(), 19,
    'Date.UTC no longer applies the two-digit-year rule — this check has lost its subject');
});
