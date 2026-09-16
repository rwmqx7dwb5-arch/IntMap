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
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DL_RAW = readLF(join(ROOT, 'js/data-layers.js'));
const LD_RAW = readLF(join(ROOT, 'js/layer-dropdown.js'));
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

test('① 本番実測の配置で weather-panel と map-controls-top は 1 px² も重ならない', () => {
  const r = wxRun({ bar: PROD_BAR });
  assert.ok(Number.isFinite(r.top), 'no top was written');
  assert.equal(overlap(r.box, r.bar), 0,
    `panel ${JSON.stringify(r.box)} overlaps the control bar ${JSON.stringify(r.bar)} `
    + `by ${overlap(r.box, r.bar)} px² (production measured 17,649)`);
  assert.ok(r.box.top >= r.bar.bottom, 'the panel must clear the bar, not sit beside it by luck');
});

test('② バーが高い／低い／無いの 3 通りで、top はバーに追随する（無ければ 70px）', () => {
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
const DL_BODY = ['toggleLegendMin', 'ensureLegendMinimize', 'tileLegends'].map((n) => liftFunction(DL, n))
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

test('③ 容器に入りきらない凡例は畳まれる — 残るものは 1 列に収まり、畳まれたものは消えていない', () => {
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

test('④ _minimizeOpenLegends の母集合は tileLegends の母集合と同じ集合（片方にしか無い綴りが 0 件）', () => {
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

test('⑤ js/ の誰が呼んでも、js/data-layers.js が実際に公開した綴りである', () => {
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
