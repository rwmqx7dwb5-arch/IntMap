/* ============================================================================
 *  Legends: how they are stacked, folded, titled and kept inside the map, and the legend year control
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r708-legend-clock-lifecycle-checks.test.mjs, tests/r740-legend-stack-checks.test.mjs, tests/r742-legend-occlusion-checks.test.mjs, tests/r266-checks.test.mjs, tests/r268-checks.test.mjs, tests/r499-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { codeOnly } from '../scripts/code-only.mjs';
import { readLF } from '../scripts/eol.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r708-legend-clock-lifecycle-checks.test.mjs — 6 of its 6 test(s) ══════════ */
{
/* (#R708) the original file carried no header note */

const source = readFileSync(new URL('../js/data-layers.js', import.meta.url), 'utf8');
const begin = source.indexOf('    let _syncYearHints=');
const end = source.indexOf('    try{ window._legendClockYear=', begin);
assert.ok(begin >= 0 && end > begin);

// A DOM fixture for the actual legend builder, including numeric constraint validation.
// The browser before/after measurement covers native node memory; these tests cover its ownership.
function harness() {
  let elements = 0, live = true, year = new Date().getFullYear();
  const subscriptions = [], writes = [], timers = [];
  function element(tag = 'div') {
    elements++;
    const attrs = {}, handlers = {};
    const el = { tagName: tag.toUpperCase(), children: [], parentNode: null, style: {}, dataset: {},
      className: '', value: '', min: '', max: '', step: '', type: '', reported: 0,
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); this.parentNode = null; },
      setAttribute(name, value) { attrs[name] = String(value); if (name === 'class') this.className = String(value); },
      getAttribute(name) { return attrs[name] ?? null; },
      removeAttribute(name) { delete attrs[name]; },
      addEventListener(name, fn) { (handlers[name] ||= []).push(fn); },
      dispatch(name) { for (const fn of handlers[name] || []) fn({ target: this }); if (this['on' + name]) this['on' + name]({ target: this }); },
      querySelectorAll(selector) {
        const all = this.children.flatMap(c => [c, ...c.querySelectorAll('*')]);
        if (selector === '*') return all;
        if (selector.startsWith('.')) return all.filter(c => c.className.split(/\s+/).includes(selector.slice(1)));
        return all.filter(c => c.tagName === selector.toUpperCase());
      },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      checkValidity() {
        if (this.value === '') return !this.required;
        const n = Number(this.value);
        return Number.isFinite(n) && (this.min === '' || n >= +this.min)
          && (this.max === '' || n <= +this.max) && (this.step !== '1' || Number.isInteger(n));
      },
      reportValidity() { this.reported++; return this.checkValidity(); }
    };
    el.classList = { add(cls) { el.className += ' ' + cls; }, remove(cls) { el.className = el.className.split(/\s+/).filter(c => c !== cls).join(' '); },
      toggle(cls, on) { this.remove(cls); if (on) this.add(cls); } };
    Object.defineProperty(el, 'valueAsNumber', { get: () => el.value === '' ? NaN : Number(el.value) });
    Object.defineProperty(el, 'validity', { get: () => ({ valid: el.checkValidity() }) });
    Object.defineProperty(el, 'innerHTML', { set(html) {
      this.children = [];
      for (const match of String(html).matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
        assert.ok(elements < 1000, 'a year range must not allocate a node per year');
        const child = element(match[1]);
        for (const a of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) {
          child.setAttribute(a[1], a[2]);
          if (['value', 'min', 'max', 'step', 'type'].includes(a[1])) child[a[1]] = a[2];
        }
        this.appendChild(child);
      }
    } });
    return el;
  }
  const body = element();
  const clock = {
    on(fn) { subscriptions.push(fn); return () => { const i = subscriptions.indexOf(fn); if (i >= 0) subscriptions.splice(i, 1); }; },
    isLive: () => live, year: () => year,
    setYear(y, opts) { live = false; year = y; writes.push({ y, source: opts.source }); this.emit(); },
    setNow(opts) { live = true; writes.push({ now: true, source: opts.source }); this.emit(); },
    emit() { for (const fn of [...subscriptions]) fn(); }
  };
  const HOST = { lang: 'en' };
  const context = vm.createContext({ HOST, document: { createElement: element, querySelectorAll: s => body.querySelectorAll(s) },
    window: { IntMapTime: clock, IntMapLang: { t: (lang, en, jp) => lang === 'jp' ? jp : en } },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); }, escapeHtml: s => s });
  vm.runInContext(source.slice(begin, end), context);
  return { body, HOST, clock, writes, subscriptions, timers, get elements() { return elements; },
    setHints(fn) { context.nextHints = fn; vm.runInContext('_syncYearHints=nextHints;', context); },
    registerHints() {
      const at = source.indexOf('      if(!_legendHintsSubscribed)');
      assert.ok(at >= 0, 'hint subscriptions must have one lifecycle owner');
      vm.runInContext(source.slice(at, source.indexOf('\n', at)), context);
    },
    build(opts, host) { host ||= body.appendChild(element()); return { host, row: context.legendClockYear(host, opts) }; }
  };
}

test('#R708 deep-time legend keeps its whole year range with constant DOM size', () => {
  const h = harness(), { row } = h.build({ min: -122999, max: 2025 });
  const input = row.querySelector('.dl-clockyear');
  assert.equal(input.tagName, 'INPUT'); assert.equal(input.type, 'number');
  assert.equal(+input.min, -122999); assert.equal(+input.max, 2025);
  assert.equal(row.querySelectorAll('option').length, 0); assert.ok(h.elements < 10);
  for (const year of [-122999, -100000, -1, 0, 1, 1850, 2025]) {
    input.value = String(year); input.dispatch('change');
    assert.equal(h.writes.at(-1).y, year); assert.equal(h.writes.at(-1).source, 'layer-legend');
  }
});

test('#R708 Now and external clock changes synchronize all live legends', () => {
  const h = harness();
  const a = h.build({ min: -122999 }).row, b = h.build({ min: -122999 }).row;
  h.clock.setYear(-44, { source: 'test' });
  for (const row of [a, b]) assert.equal(row.querySelector('.dl-clockyear').value, '-44');
  a.querySelector('.dl-clocknow').dispatch('click');
  assert.equal(h.clock.isLive(), true); assert.equal(h.writes.at(-1).source, 'layer-legend');
  for (const row of [a, b]) assert.equal(row.querySelector('.dl-clockyear').value, '');
  h.clock.setYear(2000, { source: 'test' });
  const input = b.querySelector('.dl-clockyear'); input.value = ''; input.dispatch('change');
  assert.equal(h.clock.isLive(), true, 'clearing the field preserves the previous Now choice');
});

test('#R708 invalid years do not write or clamp the master clock', () => {
  const h = harness(), { row } = h.build({ min: -100, max: 2020 });
  const input = row.querySelector('.dl-clockyear');
  h.clock.setYear(2000, { source: 'test' }); const before = h.writes.length;
  for (const value of ['-101', '2021', '2.5', 'NaN']) {
    input.value = value; input.dispatch('change');
    assert.equal(h.writes.length, before); assert.equal(input.value, '2000');
  }
});

test('#R708 updating a legend changes its bounds and language without stale closures', () => {
  const h = harness(), { host, row } = h.build({ min: 1960, max: 2020 });
  h.HOST.lang = 'jp'; h.build({ min: 0, max: 2025 }, host);
  const input = row.querySelector('.dl-clockyear');
  assert.equal(+input.min, 0); assert.equal(+input.max, 2025);
  assert.equal(row.querySelector('.dl-clocklbl').textContent, '年');
  assert.equal(row.querySelector('.dl-clocknow').textContent, '現在');
  input.value = '0'; input.dispatch('change'); assert.equal(h.writes.at(-1).y, 0);
  assert.equal(h.subscriptions.length, 1);
});

test('#R708 rebuilding removed legends retains one clock listener and visits only live rows', () => {
  const h = harness();
  for (let i = 0; i < 20; i++) {
    const { host, row } = h.build({ min: -122999, max: 2025 });
    const input = row.querySelector('.dl-clockyear');
    h.clock.setYear(1900, { source: 'test' }); host.remove();
    h.clock.setYear(2000, { source: 'test' });
    assert.equal(input.value, '1900', 'removed controls must no longer receive clock updates');
    assert.equal(h.subscriptions.length, 1, 'rebuilds must not accumulate retained legend closures');
  }
  assert.equal(h.body.querySelectorAll('.dl-clockrow').length, 0);
});

test('#R708 delayed legend hints keep one subscription and use the current rebuild callback', () => {
  const h = harness(); let retired = 0, current = 0;
  h.setHints(() => retired++);
  for (let i = 0; i < 20; i++) h.registerHints();
  assert.equal(h.subscriptions.length, 1);
  h.clock.emit();
  assert.deepEqual(h.timers.map(t => t.delay), [420, 2500], 'preserve both existing refresh timings');
  h.setHints(() => current++); // A language rebuild occurs while the timers are pending.
  for (const timer of h.timers) timer.fn();
  assert.equal(retired, 0); assert.equal(current, 2);
  h.setHints(null);
  assert.doesNotThrow(() => h.timers[0].fn());
});
}

/* ══════════ from tests/r740-legend-stack-checks.test.mjs — 7 of its 7 test(s) ══════════ */
{
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
const SRC = codeOnly(readLF(join(ROOT, 'js/data-layers.js')));
/* ⚠ with legendShown: the ONE answer to «is this legend on screen», which tileLegends and
   _minimizeOpenLegends both read (tests/cesium-koppen-and-boot-probe-checks.test.mjs ③) */
const BODY = liftFunction(SRC, 'legendShown') + '\n' + liftFunction(SRC, 'tileLegends');

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

test('#R740 ① 本番実測の 4 枚（合計 1,028 px / 容器 900 px）が 1 枚も容器の外に出ない', () => {
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

test('#R740 ② その 4 枚は 1 組も重ならない（クランプで潰していない・#R276）', () => {
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

test('#R740 ③ 1〜2 枚のときは今までどおり左端の 1 列・bottom 140 から（退行させない）', () => {
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

test('#R740 ④ 読者が動かした凡例（dataset.dragged）は 1 バイトも動かされない', () => {
  const legends = PROD.mark(PROD());
  legends[1].dataset.dragged = '1';
  legends[1].style.top = '17px'; legends[1].style.left = '999px';
  const before = JSON.stringify(legends[1].style);
  run({ legends });
  assert.equal(JSON.stringify(legends[1].style), before);
});

test('#R740 ⑤ 容器より高い 1 枚は位置では救えない — 上端は容器の中に留まり、スクローラが付く', () => {
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

test('#R740 ⑥ 同じ欠陥は ws モードにも携帯にも無い（同じ placer が 3 つの dock を置く）', () => {
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

test('#R740 ⑦ data-grow-down の凡例は top で置かれ、その top も容器の中にある', () => {
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
}

/* ══════════ from tests/r742-legend-occlusion-checks.test.mjs — 5 of its 5 test(s) ══════════ */
{
/* ============================================================================
 *  #R742 — 地図の上に浮くパネルが地図の 40.3% を隠していた（本番実測）
 * ----------------------------------------------------------------------------
 *  2026-09-15、本番 (窓 1512×945 / 地図領域 1112×923 / サイドバー 400px) で Atlas に 16 問
 *  したあと、地図の上に 7 枚のパネルが残り、その和が地図面積の 40.3% を覆っていた:
 *
 *      map-controls-top     389×113 @(1113, 10)
 *      weather-panel        333×349 @(1157, 70)   ← 上のバーと 333×53 = 17,649 px² 重なる
 *      data-legend-eq       199×106 @( 424,145)
 *      data-legend-wind     199×252 @( 424,261)
 *      data-legend-nightsat 199×259 @( 424,524)
 *      data-legend-volc2    199×389 @( 635, 17)
 *      data-legend-rail2    199×367 @( 635,416)
 *
 *  欠陥は 4 つで、どれも「誰かが数を決め打ちした」か「一覧を手で書いた」形:
 *    U2b  weather の top が定数 70。`.map-controls-top` は中身の行数で伸びる（実測 113px）。
 *    U2a  展開したままの凡例に上限が無く、遮蔽を見るコードが 1 行も無い。
 *    U2c  js/layer-dropdown.js が `window.tileLegends` を呼ぶが公開名は `window._tileLegends`。
 *    U2d  `_minimizeOpenLegends` の母集合が手書きの 18 変数で、画面上の 5 枚のうち 4 枚が外。
 *
 *  ⚠ 読解ではなく評価 (#R505)。出荷される js から関数の本体を `liftFunction` で切り出し、
 *    偽の DOM に対して**実際に実行**して、書かれた位置・畳まれた状態・母集合を測る。
 *  ⚠ 綴りを固定しない (#R488)。⑤ は両方のファイルから名前を**導出して**突き合わせる。
 * ==========================================================================*/
const DL_RAW = readLF(join(ROOT, 'js/data-layers.js'));
const DL = codeOnly(DL_RAW);
const WX = codeOnly(readLF(join(ROOT, 'js/weather.js')));

/* ══════════════════════════════════════════════════════════════════════════════════════════
   ① / ②  the weather panel and the control bar
   ────────────────────────────────────────────────────────────────────────────────────────── */

/* `place()` and the function it asks for a top. Both ship in js/weather.js §weather panel. */
const WX_BODY = liftFunction(WX, 'wxTopBelowControls') + '\n' + liftFunction(WX, 'place');

/* the two boxes as production measured them; the fixture reports them the way a browser does. */
function wxRun({ bar, mapRect = { top: 0, left: 400, width: 1112, height: 923 }, panelW = 333, panelH = 349, mobile = false, dragged = false }) {
  const rect = (r) => ({ ...r, bottom: r.top + r.height, right: r.left + r.width });
  const panel = { dataset: dragged ? { dragged: '1' } : {}, style: {}, offsetWidth: panelW };
  const mc = { clientWidth: mapRect.width, getBoundingClientRect: () => rect(mapRect) };
  const barEl = bar ? { getBoundingClientRect: () => rect(bar) } : null;
  const document = {
    getElementById: (id) => (id === 'map-container' ? mc : null),
    querySelector: (sel) => (sel === '.map-controls-top' ? barEl : null),
  };
  const window = { matchMedia: (q) => ({ matches: q === '(max-width:768px)' ? mobile : false }) };
  /* eslint-disable no-new-func */
  const make = new Function('document', 'window', 'panel', WX_BODY + '\nreturn place;');
  make(document, window, panel)();
  const top = parseFloat(panel.style.top), left = parseFloat(panel.style.left);
  /* the panel is positioned inside #map-container, so its viewport box adds the container's origin */
  return {
    panel,
    top,
    box: Number.isFinite(top) ? rect({ top: mapRect.top + top, left: mapRect.left + left, width: panelW, height: panelH }) : null,
    bar: bar ? rect(bar) : null,
  };
}

const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/* the bar as measured: 389×113 at (1113,10) — 113 px tall because of how many rows it holds. */
const PROD_BAR = { top: 10, left: 1113, width: 389, height: 113 };

test('#R742 ① 本番実測の配置で weather-panel と map-controls-top は 1 px² も重ならない', () => {
  const r = wxRun({ bar: PROD_BAR });
  assert.ok(Number.isFinite(r.top), 'no top was written');
  assert.equal(overlap(r.box, r.bar), 0,
    `panel ${JSON.stringify(r.box)} overlaps the control bar ${JSON.stringify(r.bar)} `
    + `by ${overlap(r.box, r.bar)} px² (production measured 17,649)`);
  assert.ok(r.box.top >= r.bar.bottom, 'the panel must clear the bar, not sit beside it by luck');
});

test('#R742 ② バーが高い／低い／無いの 3 通りで、top はバーに追随する（無ければ 70px）', () => {
  /* 高い: a bar with more rows pushes the panel further down — the point of the whole fix. */
  const tall = wxRun({ bar: { ...PROD_BAR, height: 200 } });
  assert.ok(tall.top > wxRun({ bar: PROD_BAR }).top, 'a taller bar did not move the panel');
  assert.equal(overlap(tall.box, tall.bar), 0);

  /* 低い: a one-row bar leaves the panel where it has always been — nothing regresses. */
  const short = wxRun({ bar: { ...PROD_BAR, height: 20 } });
  assert.equal(overlap(short.box, short.bar), 0);

  /* 非表示 / 不在: the pre-#R742 position, 70 — a page without the bar must not move at all. */
  assert.equal(wxRun({ bar: null }).top, 70, 'no bar: the panel must keep its historical top');
  assert.equal(wxRun({ bar: { ...PROD_BAR, height: 0 } }).top, 70, 'an invisible bar is not a bar');
  assert.equal(short.top, 70, 'a bar shorter than the historical top must not raise the panel');

  /* 読者が動かしたパネルは 1 バイトも動かされない（既存の挙動） */
  const moved = wxRun({ bar: PROD_BAR, dragged: true });
  assert.equal(moved.panel.style.top, undefined);
  /* 携帯は今までどおり即 return（CSS が下端に貼り付ける） */
  assert.equal(wxRun({ bar: PROD_BAR, mobile: true }).panel.style.top, undefined);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
   ③ / ④  the legend stack: the container decides how many stay expanded, and there is one
           opinion in js/data-layers.js about what a legend is.
   ────────────────────────────────────────────────────────────────────────────────────────── */

const LGD = ['lgdHDI', 'lgdDem', 'lgdPop', 'lgdEEZ', 'lgdThermal', 'lgdRadar', 'lgdSST', 'lgdPopGrid',
  'lgdRelief', 'lgdSeaLevel', 'lgdGdppc', 'lgdTfr', 'lgdMil', 'lgdMilGDP', 'lgdSnow', 'lgdAod', 'lgdNightsat'];
const STUBS = ['ensureLegendOpacity', 'ensureContourSwitch', 'ensureContourDensity'];

/* ⚠ the fold, the minimise button and the tiler all ship here, and all three are EVALUATED:
   a fold that did not go through the reader's own toggle would show up as a legend that is
   `display:none`, or as one with no way back. `window._minimizeOpenLegends=function(…)` is a
   function EXPRESSION, so it is renamed into a declaration for the shared brace matcher rather
   than matched by a second, private one (#R531). */
const DL_DECL = DL.replace('window._minimizeOpenLegends=function(', 'function minimizeOpenLegends(');
/* ⚠ `legendShown` is lifted with them: it is the ONE answer to «is this legend on screen» that the
   tiler and _minimizeOpenLegends both read (tests/cesium-koppen-and-boot-probe-checks.test.mjs ③). */
const DL_BODY = ['legendShown', 'toggleLegendMin', 'ensureLegendMinimize', 'tileLegends'].map((n) => liftFunction(DL, n))
  .concat([liftFunction(DL_DECL, 'minimizeOpenLegends')]).join('\n');

/* ── the fixture DOM ─────────────────────────────────────────────────────────────────────
   A legend is a title bar plus a body. Folding it hides the body, so its height falls to the
   title bar's — which is what makes "does the expanded stack fit?" a question with an answer. */
const HEADER_H = 34;
function makeLegend({ id, h, w = 199, display = 'block', generic = false, ec = false, lgd = false, docked = false }) {
  const cls = new Set(docked ? ['im-docked'] : []);
  const children = [
    { tagName: 'H4', classList: { contains: () => false }, style: {} },
    { tagName: 'DIV', classList: { contains: () => false }, style: {} },
  ];
  const el = {
    id, generic, ec, lgd, dataset: {}, children, style: { display },
    classList: {
      contains: (c) => cls.has(c), add: (c) => cls.add(c), remove: (c) => cls.delete(c),
      toggle: (c) => { if (cls.has(c)) { cls.delete(c); return false; } cls.add(c); return true; },
    },
    appendChild: (c) => children.push(c),
    querySelector: (sel) => children.find((c) => c.classList.contains(sel.replace('.', ''))) || null,
    get folded() { return children[1].style.display === 'none'; },
    get natural() { return el.folded ? HEADER_H : h; },
    get scrollHeight() { return el.natural; },
    getBoundingClientRect() {
      const cap = parseFloat(el.style.maxHeight);
      return { height: isFinite(cap) ? Math.min(el.natural, cap) : el.natural, width: w };
    },
  };
  return el;
}

function legendRun({ legends, mcH = 923, mcW = 1112, mobile = false, ws = false }) {
  const byId = new Map(legends.map((el) => [el.id, el]));
  const container = { getBoundingClientRect: () => ({ height: mcH, width: mcW }) };
  const document = {
    getElementById: (id) => (id === 'map-container' ? container : byId.get(id) || null),
    querySelectorAll: (sel) => {
      if (sel === '[id^="data-legend-ec-"]') return legends.filter((el) => el.ec);
      if (sel === '.data-legend.generic-legend') return legends.filter((el) => el.generic);
      return [];
    },
    querySelector: () => null,
    createElement: () => {
      const e = { tagName: 'BUTTON', className: '', style: {}, textContent: '', title: '' };
      e.classList = { contains: (c) => String(e.className).split(/\s+/).includes(c) };
      return e;
    },
    body: { classList: { contains: (c) => (c === 'ws-mode' ? ws : false) } },
  };
  const window = {
    innerHeight: mcH, innerWidth: mcW,
    matchMedia: (q) => ({ matches: q === '(max-width:768px)' ? mobile : false }),
    IntMapLang: { t: (...a) => a[1] },
  };
  const args = ['document', 'window', 'getComputedStyle', 'HOST', ...LGD, ...STUBS];
  /* eslint-disable no-new-func */
  const make = new Function(...args, DL_BODY + '\nreturn { tileLegends, minimizeOpenLegends };');
  const api = make(document, window, () => ({ display: 'block' }), { lang: 'en' },
    ...LGD.map((n) => legends.find((el) => el.lgd === n) || null), ...STUBS.map(() => () => {}));
  api.tileLegends();
  return { api, mcH, mcW };
}

function placed(el, mcH) {
  const px = (v) => (v === undefined || v === 'auto' || v === '' ? null : parseFloat(v));
  const r = el.getBoundingClientRect();
  const top = px(el.style.top), bottom = px(el.style.bottom);
  const y = top !== null ? top : mcH - bottom - r.height;
  return { y, bottom: y + r.height, x: px(el.style.left), right: px(el.style.left) + r.width, h: r.height };
}

/* the five legends production had on screen, in the heights it measured them at. */
const PROD_LEGENDS = () => [
  makeLegend({ id: 'data-legend-eq', h: 106, generic: true }),
  makeLegend({ id: 'data-legend-wind', h: 252 }),
  makeLegend({ id: 'data-legend-nightsat', h: 259, lgd: 'lgdNightsat' }),
  makeLegend({ id: 'data-legend-volc2', h: 389, generic: true }),
  makeLegend({ id: 'data-legend-rail2', h: 367, generic: true }),
];

test('#R742 ③ 容器に入りきらない凡例は畳まれる — 残るものは 1 列に収まり、畳まれたものは消えていない', () => {
  const legends = PROD_LEGENDS();
  const { mcH, mcW } = legendRun({ legends });
  const DOCK_START = 140, GAP = 10;                    /* the desktop dock's own origin and spacing */
  const room = mcH - DOCK_START - 8;                   /* one column, as tileLegends measures it */

  const open = legends.filter((el) => !el.folded);
  const shut = legends.filter((el) => el.folded);
  assert.ok(open.length >= 1, 'everything was folded — the newest legend must stay readable');
  assert.ok(shut.length >= 1, `nothing was folded, so ${legends.length} legends still cover the map`);

  /* what stays expanded fits the container — the ceiling is the room, not a count */
  const used = open.reduce((a, el) => a + el.getBoundingClientRect().height + GAP, 0);
  assert.ok(used <= room, `the expanded stack is ${used}px in a ${room}px column`);

  /* ⚠ NOTHING WAS CLOSED. The layer is on, the element is visible, and the reader's own toggle
     is what was used — so the body is hidden and the title bar is not. */
  for (const el of shut) {
    assert.equal(el.style.display, 'block', `${el.id} was hidden instead of folded`);
    assert.ok(el.classList.contains('legend-collapsed'), `${el.id} is not folded, it is gone`);
    assert.notEqual(el.children[0].style.display, 'none', `${el.id}: its title bar went away too`);
    assert.ok(el.querySelector('.legend-min'), `${el.id}: no way back — there is no – button`);
  }

  /* and the whole stack is still inside the container, in one column (nothing wrapped sideways) */
  for (const el of legends) {
    const r = placed(el, mcH);
    assert.ok(r.y >= 0 && r.bottom <= mcH, `${el.id}: ${r.y}..${r.bottom} leaves 0..${mcH}`);
    assert.ok(r.x >= 0 && r.right <= mcW, `${el.id}: ${r.x}..${r.right} leaves 0..${mcW}`);
  }
  assert.equal(new Set(legends.map((el) => el.style.left)).size, 1,
    'the folded stack still needs more than one column of the map');

  /* 読者がもう一度開いたら、次の呼び出しで畳み返されない（fold は 1 回きり） */
  const reopened = shut[0];
  reopened.classList.remove('legend-collapsed');
  reopened.children[1].style.display = '';
  legendRun({ legends });
  assert.ok(!reopened.folded, `${reopened.id}: the reader re-opened it and the tiler shut it again`);
});

test('#R742 ④ _minimizeOpenLegends の母集合は tileLegends の母集合と同じ集合（片方にしか無い綴りが 0 件）', () => {
  const legends = [
    makeLegend({ id: 'koppen-legend', h: 120 }),
    makeLegend({ id: 'data-legend-nightsat', h: 130, lgd: 'lgdNightsat' }),
    makeLegend({ id: 'data-legend-wind', h: 140 }),
    makeLegend({ id: 'data-legend-ec-slp', h: 150, ec: true }),
    makeLegend({ id: 'data-legend-eq', h: 160, generic: true }),
    makeLegend({ id: 'data-legend-docked', h: 170, generic: true, docked: true }),
  ];
  const { api } = legendRun({ legends });

  /* what the tiler discovers — asked of the shipped function, never re-listed here */
  const discovered = new Set((api.tileLegends() || []).filter(Boolean).map((el) => el.id));
  assert.ok(discovered.size >= legends.length, `the tiler saw ${discovered.size} of ${legends.length}`);

  legends.forEach((el) => { el.classList.remove('legend-collapsed'); el.children[1].style.display = ''; });
  api.minimizeOpenLegends();
  const collapsed = new Set(legends.filter((el) => el.folded).map((el) => el.id));

  /* the docked one is deliberately exempt (#R240): it is not over the map. Everything else the
     tiler can see is something this function can see. */
  const expected = new Set(legends.filter((el) => !el.classList.contains('im-docked')).map((el) => el.id));
  const onlyTiler = [...expected].filter((id) => !collapsed.has(id));
  const onlyMin = [...collapsed].filter((id) => !expected.has(id));
  assert.deepEqual(onlyTiler, [], `invisible to _minimizeOpenLegends: ${onlyTiler.join(', ')}`);
  assert.deepEqual(onlyMin, [], `collapsed something the tiler does not call a legend: ${onlyMin.join(', ')}`);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
   ⑤  one spelling, derived from both files
   ────────────────────────────────────────────────────────────────────────────────────────── */

test('#R742 ⑤ js/ の誰が呼んでも、js/data-layers.js が実際に公開した綴りである', () => {
  /* what js/data-layers.js publishes: `window.<name>=<function declared in this file>` */
  const published = new Map();
  for (const m of DL.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=\s*(?:function\s*\(|([A-Za-z_$][\w$]*)\s*;)/g)) {
    if (m[2] && !new RegExp('function\\s+' + m[2] + '\\s*\\(').test(DL)) continue;
    published.set(m[1].replace(/^_+/, '').toLowerCase(), m[1]);
  }
  assert.ok(published.size > 0, 'js/data-layers.js publishes nothing at all — the reading is wrong');

  /* ⚠ THE POPULATION IS EVERY CALLER, NOT THE ONE THAT WAS REPORTED. #R742 found the wrong spelling
     in js/layer-dropdown.js, fixed it there, and then found FOUR MORE of the same call in
     js/workspace.js — the workspace re-tile had been a silent no-op just as long. A guard written
     `window.X && window.X()` is false for ever when the spelling is off and says nothing, so the
     rule belongs to the fact (no js/ file calls a name data-layers did not publish), never to the
     file the defect happened to be reported in (.agents/rules/no-ad-hoc-hardcoding.md §3). */
  const wrong = [];
  for (const f of readdirSync(join(ROOT, 'js')).filter((n) => n.endsWith('.js'))) {
    const src = codeOnly(readLF(join(ROOT, 'js', f)));
    for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*\(/g)) {
      const real = published.get(m[1].replace(/^_+/, '').toLowerCase());
      if (real && real !== m[1] && !wrong.some((w) => w.file === f && w.name === m[1])) wrong.push({ file: f, name: m[1], real });
    }
  }
  assert.deepEqual(wrong, [], wrong.map((x) => `${x.file} calls window.${x.name}, published as window.${x.real}`).join('; '));
});
}

/* ══════════ from tests/r266-checks.test.mjs — 1 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が CSS・HTML・文書・設定ファイルで、そのテキスト自体が出荷物である・js/ocean-currents.js と js/industry-web.js の凡例 HTML は DOM に閉じたファクトリの中で組まれる */
/* (#R266) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */

test('R266 ⑩: the long legends fold, and the developer-facing failure text is gone', () => {
  assert.match(read('js/ocean-currents.js'), /<details class="im-more">/);
  const iw = read('js/industry-web.js');
  assert.match(iw, /<details class="im-more"/);
  assert.match(iw, /class="iw-retry"/, 'the failure gives the reader nothing to do');
  assert.ok(!iw.includes("esc(L('Nothing is drawn"), 'the developer-facing sentence is back');
  assert.match(read('css/intmap.css'), /\.im-more > summary\{/, 'the disclosure has no styling');
});
}

/* ══════════ from tests/r268-checks.test.mjs — 1 of its 19 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない */
/* (#R268) the round's header note is kept with its largest block, in tests/layer-packs-rasters-checks.test.mjs */
/* ⚠ (#R267) COUNT IN CODE, NOT IN COMMENTS. This file's own prose names the strings it checks for,
   which is how an audit ends up catching itself (nine rounds and counting). Comments are stripped
   before any «does X still exist» question is asked. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ⑤ the legend title took a string where a name table was wanted ────────────────────────── */
test('R268 ⑤ a legend name that is a bare string is one name, not one letter per language', () => {
  const s = codeOnly(read('js/data-layers.js'));
  assert.match(s, /if\(typeof names==='string'\) names=\[names,names,names,names,names\];/,
    'ensureGenericLegend must normalise a string');
  const p = codeOnly(read('js/precip-annual.js'));
  assert.match(p, /_registerLayerOpacity\('annprecip', NM,/, 'the caller must pass the NAME TABLE');
  assert.doesNotMatch(p, /_registerLayerOpacity\('annprecip', NAME\(\)/, 'never the resolved string');
});
}

/* ══════════ from tests/r499-checks.test.mjs — 2 of its 20 test(s) ══════════ */
{
/* (#R499) the round's header note is kept with its largest block, in tests/layer-pointer-performance-checks.test.mjs */
const R = (p) => readLF(join(ROOT, p));
const CODE = (p) => codeOnly(R(p));

/** the source of the balanced region that starts at `i` (#R498's cutter, reused) */
function balanced(src, i, open, close) {
  let d = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === open) d++;
    else if (c === close) { d--; if (!d) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced from ' + i);
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ⑨ js/data-layers.js tileLegends() — every height read before the first position written
   ══════════════════════════════════════════════════════════════════════════════════════════════
   THE SITE --attribute NAMED. 5,724 of the 5,852 `getBoundingClientRect` calls in one eight-second
   finger pan (phone profile, weather + warnings on) came from one line of this function's `mobile`
   branch — because it placed a legend and then measured it, N times, and thirty-one sites call it.
   The rig below records the ORDER of reads and writes, which is the only thing that distinguishes
   a forced layout from a cheap one. */
function tilerRig({ mobile = true, n = 4 } = {}) {
  const log = [];
  const mk = (id) => {
    const style = new Proxy({}, {
      set(t, k, v) { log.push('w'); t[k] = v; return true; },
      get(t, k) { return t[k]; },
    });
    return { id, style, dataset: {}, classList: { contains: () => false, add() { }, toggle: () => false },
      querySelector: () => null, appendChild() { }, children: [],
      getBoundingClientRect() { log.push('r'); return { height: 100, width: 178 }; } };
  };
  const boxes = Array.from({ length: n }, (_, i) => { const e = mk('lgd' + i); e.style.display = 'block'; return e; });
  log.length = 0;   /* the `display` writes above are the rig's, not the tiler's */

  const src = CODE('js/data-layers.js');
  /* ⚠ (#R742) THE SIGNATURE IS NOT THE SUBJECT. This read `indexOf("function tileLegends(){")`,
     so the day tileLegends took a parameter the rig reported 「no longer a named function」 about a
     function that was right there — #R488's shape, in the reading rather than in the rule. Worse, the
     next line then rebuilt the header by hand, which would have dropped the parameter and turned the
     new self-recall into unbounded recursion inside this rig. Find the declaration and carry the
     signature the file actually ships. */
  const i = src.search(/function tileLegends\(/);
  assert.ok(i > 0, 'tileLegends() is no longer a named function in js/data-layers.js');
  const fn = src.slice(i, src.indexOf('{', i)) + balanced(src, src.indexOf('{', i), '{', '}');
  /* ⚠ …and the declaration it reads for «is this legend on screen», shared with _minimizeOpenLegends
     (tests/cesium-koppen-and-boot-probe-checks.test.mjs ③) — found the same way */
  const j = src.search(/function legendShown\(/);
  assert.ok(j > 0, 'legendShown() is no longer a named function in js/data-layers.js');
  const shownFn = src.slice(j, src.indexOf('{', j)) + balanced(src, src.indexOf('{', j), '{', '}');

  const g = { Math, console, Object, Array, parseFloat, isFinite, String, Number };
  g.window = g;
  g.window.innerHeight = 844;
  g.window.matchMedia = (q) => ({ matches: mobile && /max-width:768px/.test(q) });
  g.window.IntMapRuntime = null;
  g.document = {
    body: { classList: { contains: () => false } },
    getElementById: () => null,
    querySelectorAll: () => [],
  };
  vm.createContext(g);
  vm.runInContext(`let lgdHDI,lgdDem,lgdPop,lgdEEZ,lgdThermal,lgdRadar,lgdSST,lgdPopGrid,lgdRelief,lgdSeaLevel,lgdGdppc,lgdTfr,lgdMil,lgdMilGDP,lgdSnow,lgdAod,lgdNightsat;
    function ensureLegendOpacity(){} function ensureContourSwitch(){} function ensureContourDensity(){} function ensureLegendMinimize(){}
    globalThis.__setBoxes = (b) => { [lgdHDI,lgdDem,lgdPop,lgdEEZ]=b; };
    ${shownFn}
    ${fn}
    globalThis.__tile = tileLegends;`, g, { filename: 'data-layers-tile.js' });
  g.__setBoxes(boxes);
  return { log, tile: g.__tile, boxes };
}

test('R499 ⑨ the legend tiler reads every height before it writes the first position', () => {
  const rig = tilerRig({ n: 4 });
  rig.tile();
  const s = rig.log.join('');
  assert.ok(/^r+w+$/.test(s),
    `the tiler interleaved reads and writes — ${s}\n`
    + 'a write between two reads is a forced synchronous layout, once per legend, on every one of the '
    + 'thirty-one call sites');
  assert.equal((s.match(/r/g) || []).length, 4, 'one height per visible legend, and no more');
});

test('R499 ⑨ …and a call that changes nothing writes nothing', () => {
  const rig = tilerRig({ n: 4 });
  rig.tile();
  const writes = rig.log.filter((c) => c === 'w').length;
  assert.ok(writes > 0, 'the first call must actually place the legends');
  rig.log.length = 0;
  for (let i = 0; i < 30; i++) rig.tile();
  assert.equal(rig.log.filter((c) => c === 'w').length, 0,
    'thirty repeat calls rewrote positions that had not moved — a write invalidates layout even when '
    + 'it assigns the string that was already there (#R311), which is what made the reads forced');
  /* …and the stack is still a stack: 64, 64+108, 64+216, 64+324 (#R15d's origin and gap) */
  assert.deepEqual(rig.boxes.map((b) => b.style.top), ['64px', '172px', '280px', '388px']);
  assert.deepEqual(rig.boxes.map((b) => b.style.left), ['6px', '6px', '6px', '6px']);
});
}
