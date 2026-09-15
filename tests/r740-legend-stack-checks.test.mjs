/* ============================================================================
 *  #R740 — 凡例の積み上げが容器の外へ出ていた（本番実測）
 * ----------------------------------------------------------------------------
 *  2026-09-15、本番 (1440×900) で Atlas に「ヨーロッパの気温をGFSモデルで表示して、等圧線も
 *  重ねて。風のパーティクルも」と頼んだ。レイヤーは全部正しく点き、開いた凡例 4 枚の
 *  `getBoundingClientRect()` は:
 *
 *      data-legend-eq       x=424  y=-291  w=199  h=106   ← 下端でも y=-185。1 px も見えない
 *      data-legend-ec-slp   x=424  y=-175  w=199  h=337   ← 不透明度スライダも日付も画面の外
 *      data-legend-ec-temp  x=424  y= 172  w=199  h=303
 *      data-legend-wind     x=424  y= 485  w=199  h=252
 *
 *  積み上げは 1,028 px、ビューポートは 900 px。`tileLegends()` の 3 つの枝はどれも
 *  `bottom += h + gap` と数えるだけで、容器の高さに対する上限を持っていなかった。
 *
 *  ⚠ 読解ではなく評価 (#R505)。ここは出荷される `js/data-layers.js` から `tileLegends` の
 *  本体を `liftFunction` で切り出し、偽の DOM に対して**実際に実行**して、書かれた
 *  `style.bottom` / `top` / `left` / `maxHeight` を測る。綴りを grep する検査は、
 *  「クランプは書いてある」（`data-grow-down` の枝にはあった）を根拠に緑になってしまう。
 *
 *  ⚠ 主張は「凡例は容器の中にある」という**事実**に対して測る。id にも枝にも紐づけない。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = codeOnly(readLF(join(ROOT, 'js/data-layers.js')));
const BODY = liftFunction(SRC, 'tileLegends');

/* the identifiers tileLegends closes over in js/data-layers.js §legends. The seventeen `lgd*`
   boxes are legends like any other, so the fixture hands them in as ordinary elements. */
const LGD = ['lgdHDI', 'lgdDem', 'lgdPop', 'lgdEEZ', 'lgdThermal', 'lgdRadar', 'lgdSST', 'lgdPopGrid',
  'lgdRelief', 'lgdSeaLevel', 'lgdGdppc', 'lgdTfr', 'lgdMil', 'lgdMilGDP', 'lgdSnow', 'lgdAod', 'lgdNightsat'];
const HELPERS = ['ensureLegendOpacity', 'ensureContourSwitch', 'ensureContourDensity', 'ensureLegendMinimize'];

/* ── the fixture DOM ──────────────────────────────────────────────────────────────────────────
   A legend is a box with a natural content height. `getBoundingClientRect().height` honours an
   inline `max-height` the way a browser does, and `scrollHeight` reports the CONTENT height
   whatever the clamp — so a second call sees exactly what the shipped code would see. */
function makeLegend({ id, h, w = 199, display = 'block', dragged = false, growDown = false }) {
  const el = {
    id, natural: h, dataset: {}, classList: { contains: () => false },
    style: { display },
    get scrollHeight() { return el.natural; },
    getBoundingClientRect() {
      const cap = parseFloat(el.style.maxHeight);
      return { height: isFinite(cap) ? Math.min(el.natural, cap) : el.natural, width: w };
    },
  };
  if (dragged) el.dataset.dragged = '1';
  if (growDown) el.dataset.growDown = '1';
  return el;
}

function run({ legends, mcH = 900, mcW = 1440, mobile = false, ws = false, calls = 1 }) {
  const byId = new Map(legends.map((el) => [el.id, el]));
  const container = { getBoundingClientRect: () => ({ height: mcH, width: mcW }) };
  const document = {
    getElementById: (id) => (id === 'map-container' ? container : byId.get(id) || null),
    querySelectorAll: (sel) => {
      if (sel === '[id^="data-legend-ec-"]') return legends.filter((el) => el.id.startsWith('data-legend-ec-'));
      if (sel === '.data-legend.generic-legend') return legends.filter((el) => el.generic);
      return [];
    },
    querySelector: () => null,
    body: { classList: { contains: (c) => (c === 'ws-mode' ? ws : false) } },
  };
  const window = {
    innerHeight: mcH, innerWidth: mcW,
    matchMedia: (q) => ({ matches: q === '(max-width:768px)' ? mobile : false }),
  };
  const args = ['document', 'window', 'getComputedStyle', ...LGD, ...HELPERS];
  /* eslint-disable no-new-func */
  const make = new Function(...args, BODY + '\nreturn tileLegends;');
  const fn = make(document, window, () => ({ display: 'block' }),
    ...LGD.map(() => null), ...HELPERS.map(() => () => {}));
  for (let i = 0; i < calls; i++) fn();
  return { mcH, mcW };
}

/* the placed box in container coordinates, from what the function WROTE (never from the fixture). */
function placed(el, mcH) {
  const px = (v) => (v === undefined || v === 'auto' || v === '' ? null : parseFloat(v));
  const h = el.getBoundingClientRect().height, w = el.getBoundingClientRect().width;
  const top = px(el.style.top), bottom = px(el.style.bottom);
  const y = top !== null ? top : mcH - bottom - h;
  return { y, bottom: y + h, x: px(el.style.left), right: px(el.style.left) + w, h, w };
}

/* the production stack: four legends, 1,028 px of them, in a 900 px map. */
const PROD = () => [
  makeLegend({ id: 'data-legend-eq', h: 106 }),
  makeLegend({ id: 'data-legend-ec-slp', h: 337 }),
  makeLegend({ id: 'data-legend-ec-temp', h: 303 }),
  makeLegend({ id: 'data-legend-wind', h: 252 }),
];
PROD.mark = (l) => { l[0].generic = true; return l; };

test('① 本番実測の 4 枚（合計 1,028 px / 容器 900 px）が 1 枚も容器の外に出ない', () => {
  const legends = PROD.mark(PROD());
  const { mcH, mcW } = run({ legends });
  for (const el of legends) {
    const r = placed(el, mcH);
    assert.ok(Number.isFinite(r.y), `${el.id}: no position was written`);
    assert.ok(r.y >= 0, `${el.id}: top edge at ${r.y} is above the container (production wrote -291)`);
    assert.ok(r.bottom <= mcH, `${el.id}: bottom edge at ${r.bottom} is below the container ${mcH}`);
    assert.ok(r.x >= 0 && r.right <= mcW, `${el.id}: ${r.x}..${r.right} leaves the container sideways`);
  }
});

test('② その 4 枚は 1 組も重ならない（クランプで潰していない・#R276）', () => {
  const legends = PROD.mark(PROD());
  const { mcH } = run({ legends });
  const R = legends.map((el) => placed(el, mcH));
  for (let i = 0; i < R.length; i++) {
    for (let j = i + 1; j < R.length; j++) {
      const a = R[i], b = R[j];
      const ov = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x))
        * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
      assert.equal(ov, 0, `${legends[i].id} overlaps ${legends[j].id} by ${ov} px²`);
    }
  }
});

test('③ 1〜2 枚のときは今までどおり左端の 1 列・bottom 140 から（退行させない）', () => {
  const one = [makeLegend({ id: 'data-legend-eq', h: 106 })];
  one[0].generic = true;
  run({ legends: one });
  assert.equal(one[0].style.bottom, '140px');
  assert.equal(one[0].style.top, 'auto');
  assert.equal(one[0].style.left, '24px');

  /* both generic, so the order the tiler sees is the order written here — the shipped `all` list
     puts the wind box and the ECMWF boxes ahead of the generic ones. */
  const two = [makeLegend({ id: 'data-legend-eq', h: 106 }), makeLegend({ id: 'data-legend-vol', h: 252 })];
  two[0].generic = true; two[1].generic = true;
  run({ legends: two });
  assert.equal(two[0].style.bottom, '140px');
  assert.equal(two[1].style.bottom, '256px');          /* 140 + 106 + 10 — the gap is unchanged */
  assert.equal(two[0].style.left, two[1].style.left);  /* one column */
  assert.equal(two[0].style.left, '24px');
});

test('④ 読者が動かした凡例（dataset.dragged）は 1 バイトも動かされない', () => {
  const legends = PROD.mark(PROD());
  legends[1].dataset.dragged = '1';
  legends[1].style.top = '17px'; legends[1].style.left = '999px';
  const before = JSON.stringify(legends[1].style);
  run({ legends });
  assert.equal(JSON.stringify(legends[1].style), before);
});

test('⑤ 容器より高い 1 枚は位置では救えない — 上端は容器の中に留まり、スクローラが付く', () => {
  const legends = [makeLegend({ id: 'data-legend-eq', h: 1200 })];
  legends[0].generic = true;
  const { mcH } = run({ legends, calls: 2 });                  /* 2 回呼んでも暴れないこと */
  const r = placed(legends[0], mcH);
  assert.ok(r.y >= 0 && r.bottom <= mcH, `tall legend placed at ${r.y}..${r.bottom} in ${mcH}`);
  assert.ok(parseFloat(legends[0].style.maxHeight) > 0, 'no max-height was written');
  assert.equal(legends[0].style.overflowY, 'auto');
  const cap = legends[0].style.maxHeight;
  run({ legends, calls: 1 });
  assert.equal(legends[0].style.maxHeight, cap, 'the clamp flip-flops between calls');
});

test('⑥ 同じ欠陥は ws モードにも携帯にも無い（同じ placer が 3 つの dock を置く）', () => {
  for (const mode of [{ ws: true }, { mobile: true }]) {
    const legends = PROD.mark(PROD());
    const { mcH } = run({ legends, ...mode });
    for (const el of legends) {
      const r = placed(el, mcH);
      assert.ok(r.y >= 0 && r.bottom <= mcH,
        `${JSON.stringify(mode)} ${el.id}: ${r.y}..${r.bottom} is outside 0..${mcH}`);
    }
  }
});

test('⑦ data-grow-down の凡例は top で置かれ、その top も容器の中にある', () => {
  const legends = [
    makeLegend({ id: 'data-legend-eq', h: 106 }),
    makeLegend({ id: 'data-legend-ec-slp', h: 337 }),
    makeLegend({ id: 'data-legend-ec-temp', h: 303 }),
    makeLegend({ id: 'data-legend-wind', h: 252, growDown: true }),
  ];
  legends[0].generic = true;
  const { mcH } = run({ legends });
  assert.equal(legends[3].style.bottom, 'auto');
  const t = parseFloat(legends[3].style.top);
  assert.ok(t >= 0 && t + 252 <= mcH, `grow-down legend top ${t} leaves the container`);
});
