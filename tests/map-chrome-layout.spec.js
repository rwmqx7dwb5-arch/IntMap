/* ============================================================================
 *  IntMap · map-chrome-layout — what floats on the map stays on the part of the map you can see
 * ----------------------------------------------------------------------------
 *  「右サイドバーを開いた状態でブラウザのズームを大きくすると、検索バーと Chronos が崩れる。以前から
 *    何度も右サイドバー開閉時のボタン類の問題があった。直すなら根本的に。」
 *  MEASURED before the change (built app, 1152×720 = a 1440×900 screen at 125 %, both panels open): the
 *  search pill spanned 436–1138 px while the right panel began at 852, and elementFromPoint at the Search
 *  button returned a layer tile; in solid mode Chronos began at 293 px, under the left panel (0–400).
 *
 *  A browser zoom is a narrower CSS viewport, so each zoom is a viewport here: a 1440×900 screen at
 *  100 / 125 / 150 % and a 1920×1080 screen at 200 % (960×540). For every one of them, with the left panel
 *  closed / open beside the map (solid) / open over the map (frosted), the right layer panel closed / open,
 *  and the light and the dark theme, the defect is asked of the page as it stands — not of a rule:
 *    ① every floating control is inside the visible map (the frame) and inside the window;
 *    ② none of them intersects an open side panel;
 *    ③ no two of them intersect each other;
 *    ④ elementFromPoint at the middle of each control returns that control — nothing covers it.
 *  ⑤ at 200 % of a 1440 screen (720×450) the app is in its phone layout, where these controls live in
 *    the sheet: the floating stack is not drawn over the map at all.
 *  ⑥ the compact shapes are still the same controls: the search button opens the field, and the view menu
 *    reaches all five view buttons.
 *  ⑦ AT THE WIDTHS THAT WERE NOT BROKEN NOTHING MOVED: at 1440×900 and 1280×800, right panel closed / open, light and
 *    dark, every part's place and size equals tests/map-chrome-layout-baseline.json (what fonts cannot move: tops,
 *    heights, right edges, the stylesheet-sized parts whole; labelled rows within a font's difference), measured on the build of
 *    the commit before this change with the same measurer (tests/helpers/map-chrome.js). The narrow shapes are
 *    allowed only where the layout used to break.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';
import { setChromeState, measureChrome } from './helpers/map-chrome.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE = JSON.parse(readFileSync(join(import.meta.dirname, 'map-chrome-layout-baseline.json'), 'utf8'));

test.describe.configure({ mode: 'serial' });

const ZOOMS = [
  { name: '1440@100%', width: 1440, height: 900 },
  { name: '1440@125%', width: 1152, height: 720 },
  { name: '1440@150%', width: 960, height: 600 },
  { name: '1920@200%', width: 960, height: 540 },
];
const LEFT = ['closed', 'solid', 'frosted'];
const THEMES = ['light', 'dark'];

/* the controls, each by the element a reader presses — measured only while it is drawn */
const CONTROLS = {
  search: '#ms-btn',
  viewMenu: '#btn-view-menu',
  viewMap: '#btn-view-map',
  viewGlobe: '#btn-view-globe',
  tools: '#btn-measure-menu',
  share: '#btn-share-menu',
  layers: '#btn-layers',
  compass: '#btn-compass',
  locate: '#btn-locate',
  chronos: '#ntl-toggle',
};
/* the surfaces those buttons sit on, for the overlap test (a button inside the stack is not «overlapping» the stack) */
const SURFACES = { search: '#map-search', stack: '.map-controls-top', chronos: '#news-timeline' };

let page, diag;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: seededStorageState() });
  await installHermeticRouting(context);
  await context.addInitScript(() => { try { localStorage.setItem('intmap_ws4', JSON.stringify({ on: false })); } catch { /* ignore */ } });
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => typeof window.IntMapLayerSidebar !== 'undefined' && !!window.__imap && !!document.getElementById('map-frame'), null, { timeout: 60_000 });
  await page.waitForTimeout(1500);
});

test.afterAll(async () => { await page?.context()?.close(); });

const setState = (left, right, theme) => setChromeState(page, { left, right, theme });

function measure() {
  return page.evaluate(({ CONTROLS, SURFACES }) => {
    const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
      for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return false; } return true; };
    const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const frame = box(document.getElementById('map-frame'));
    const panels = {};
    const sb = document.getElementById('sidebar');
    if (sb && !sb.classList.contains('collapsed') && shown(sb)) panels.left = box(sb);
    const lsr = document.querySelector('#layer-sidebar-r.open');
    if (lsr && shown(lsr)) panels.right = box(lsr);
    const controls = {}, hits = {};
    for (const [k, s] of Object.entries(CONTROLS)) {
      const el = document.querySelector(s); if (!shown(el)) continue;
      controls[k] = box(el);
      const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      hits[k] = t && el.contains(t) ? 'ok' : (t ? (t.id || String(t.className) || t.tagName).slice(0, 60) : 'nothing');
    }
    const surfaces = {};
    for (const [k, s] of Object.entries(SURFACES)) { const el = document.querySelector(s); if (shown(el)) surfaces[k] = box(el); }
    /* the stack's rows, so the search can be tested against each of them and not against the stack's empty corners */
    const rows = [...document.querySelectorAll('.map-controls-top > *')].filter(shown).map(box);
    return { frame, panels, controls, hits, surfaces, rows, vw: innerWidth, vh: innerHeight, phone: matchMedia('(max-width:768px)').matches };
  }, { CONTROLS, SURFACES });
}

const inter = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
const fmt = (b) => `[${Math.round(b.l)},${Math.round(b.t)} – ${Math.round(b.r)},${Math.round(b.b)}]`;

for (const z of ZOOMS) {
  test(`① – ④ the floating controls stay on the visible map at ${z.name} (${z.width}×${z.height})`, async () => {
    await page.setViewportSize({ width: z.width, height: z.height });
    const problems = [];
    for (const theme of THEMES) for (const left of LEFT) for (const right of [false, true]) {
      await setState(left, right, theme);
      const m = await measure();
      const tag = `${theme} · left ${left} · right ${right ? 'open' : 'closed'}`;
      if (!Object.keys(m.controls).length) { problems.push(`${tag}: no control is drawn at all`); continue; }
      for (const [k, c] of Object.entries(m.controls)) {
        /* ① inside the frame and the window (half a pixel for sub-pixel layout) */
        if (c.l < m.frame.l - 0.5 || c.r > m.frame.r + 0.5 || c.t < m.frame.t - 0.5 || c.b > m.frame.b + 0.5) problems.push(`${tag}: ${k} ${fmt(c)} leaves the visible map ${fmt(m.frame)}`);
        if (c.l < -0.5 || c.r > m.vw + 0.5 || c.t < -0.5 || c.b > m.vh + 0.5) problems.push(`${tag}: ${k} ${fmt(c)} leaves the window`);
        /* ② not under a panel */
        for (const [p, pb] of Object.entries(m.panels)) if (inter(c, pb) > 0.5) problems.push(`${tag}: ${k} ${fmt(c)} is under the ${p} panel ${fmt(pb)}`);
        /* ④ nothing covers it */
        if (m.hits[k] !== 'ok') problems.push(`${tag}: elementFromPoint at the middle of ${k} returned «${m.hits[k]}»`);
      }
      /* ③ no two surfaces meet: the search against every row of the stack, Chronos against both */
      const s = m.surfaces;
      if (s.search) for (const row of m.rows) if (inter(s.search, row) > 0.5) problems.push(`${tag}: the search ${fmt(s.search)} overlaps a control row ${fmt(row)}`);
      if (s.chronos && s.stack && inter(s.chronos, s.stack) > 0.5) problems.push(`${tag}: Chronos ${fmt(s.chronos)} overlaps the control stack ${fmt(s.stack)}`);
      if (s.chronos && s.search && inter(s.chronos, s.search) > 0.5) problems.push(`${tag}: Chronos ${fmt(s.chronos)} overlaps the search ${fmt(s.search)}`);
      /* a pill that is a field is a field: wide enough to type into, or folded into its button */
      if (s.search) {
        const w = s.search.r - s.search.l;
        const folded = await page.evaluate(() => document.getElementById('ms-input').getBoundingClientRect().width < 1);
        if (!folded && w < 150) problems.push(`${tag}: the search field is a ${Math.round(w)} px sliver`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
    expect(diag.pageErrors, `pageerror(s):\n${diag.pageErrors.join('\n---\n')}`).toHaveLength(0);
  });
}

test('⑤ at 200 % of a 1440 screen (720×450) the phone layout holds the controls and nothing floats over the map', async () => {
  await page.setViewportSize({ width: 720, height: 450 });
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => ({
    phone: matchMedia('(max-width:768px)').matches,
    stack: getComputedStyle(document.querySelector('.map-controls-top')).display,
    frame: getComputedStyle(document.getElementById('map-frame')).display,
    searchHome: document.getElementById('map-search').parentElement.id,
    inFrame: !!document.getElementById('map-search').closest('#map-frame'),
  }));
  expect(m.phone).toBe(true);
  expect(m.frame, 'the frame is no box on a phone').toBe('contents');
  expect(m.stack, 'the floating stack is not drawn on a phone').toBe('none');
  expect(m.searchHome, 'the search is lent into the sheet head').toBe('m-search-slot');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => !!document.getElementById('map-search').closest('#map-frame')), 'and handed back to the frame').toBe(true);
});

test('⑥ the compact shapes are the same controls — the search button opens the field, the menu reaches every view button', async () => {
  await page.setViewportSize({ width: 960, height: 600 });
  await setState('frosted', true, 'light');   /* 960 − 400 − 300 = a 260 px frame */
  const before = await page.evaluate(() => ({ field: document.getElementById('ms-input').getBoundingClientRect().width, menu: getComputedStyle(document.getElementById('btn-view-menu')).display }));
  expect(before.field, 'the search is folded into its button').toBeLessThan(1);
  expect(before.menu, 'the view pills are folded behind the menu').not.toBe('none');
  await page.click('#ms-btn');
  const open = await page.evaluate(() => ({ focused: document.activeElement?.id, field: document.getElementById('ms-input').getBoundingClientRect().width }));
  expect(open.focused, 'an empty press puts the caret in the field').toBe('ms-input');
  expect(open.field, 'and the field opens to be typed in').toBeGreaterThan(120);
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.click('#btn-view-menu');
  const ids = ['btn-view-map', 'btn-view-sat', 'btn-view-flat', 'btn-view-globe', 'btn-view-3d'];
  const reach = await page.evaluate((ids) => ids.map((id) => { const el = document.getElementById(id); const r = el.getBoundingClientRect();
    const t = r.width ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null; return [id, !!t && el.contains(t)]; }), ids);
  for (const [id, ok] of reach) expect(ok, `${id} is on top and pressable inside the open menu`).toBe(true);
  expect(await page.getAttribute('#btn-view-menu', 'aria-expanded')).toBe('true');
  await page.click('#btn-view-flat');
  expect(await page.evaluate(() => document.querySelector('.map-view-row').classList.contains('open')), 'a choice closes the menu').toBe(false);
  await page.click('#btn-view-menu');
  await page.click('#btn-view-globe');   /* put the projection back for whatever runs next */
  expect(diag.pageErrors, `pageerror(s):\n${diag.pageErrors.join('\n---\n')}`).toHaveLength(0);
});

test('⑦ at 1440×900 and 1280×800 every control is exactly where, and as big as, it was before the frame', async () => {
  const off = [];
  for (const [key, want] of Object.entries(BASELINE.states)) {
    const [size, right, theme] = key.split('|');
    const [w, h] = size.split('x').map(Number);
    await page.setViewportSize({ width: w, height: h });
    await setChromeState(page, { left: 'closed', right: right === 'right-open', theme });
    const got = await measureChrome(page);
    /* ⚠ THE BASELINE WAS MEASURED WITH ONE MACHINE'S FONTS. A row of labelled buttons is as wide as its words, and the
       words are narrower on the CI runner than on the machine that took the baseline — MEASURED on CI: the tools row
       368.8 px against 383.4, so the stack's left edge and the lane-centred pill moved with it while nothing in this
       change did. So what is compared is what the font cannot move: every part's top, height and RIGHT edge (they are
       anchored to the right), the full rect of the parts whose size is set by the stylesheet, and for the labelled rows
       a width that stays theirs (within 6 % — a row folded into the compact shapes loses far more). The pill's left edge
       follows the stack only where it stands in the lane, by half of the stack's shift — the lane's own rule. */
    const FIXED = new Set(['search', 'compass', 'locate', 'chronos']);
    const stackShift = got.stack && want.stack ? got.stack.x - want.stack.x : 0;
    for (const [part, r] of Object.entries(want)) {
      const g = got[part];
      if (!g) { off.push(`${key}: ${part} is not drawn (was ${JSON.stringify(r)})`); continue; }
      const near = (a, b) => Math.abs(a - b) <= 1;   /* the old watcher rounded the pill's anchors to whole pixels, the grid does not */
      if (!near(g.y, r.y)) off.push(`${key}: ${part}.y ${g.y} — was ${r.y}`);
      if (!near(g.h, r.h)) off.push(`${key}: ${part}.h ${g.h} — was ${r.h}`);
      if (FIXED.has(part)) {
        if (!near(g.w, r.w)) off.push(`${key}: ${part}.w ${g.w} — was ${r.w}`);
        const inLane = part === 'search' && want.stack && r.y > want.stack.y;
        const wantX = r.x + (inLane ? stackShift / 2 : 0);
        if (!near(g.x, wantX)) off.push(`${key}: ${part}.x ${g.x} — was ${r.x}${inLane ? ` (+ half the stack's font shift = ${wantX.toFixed(1)})` : ''}`);
      } else {
        if (!near(g.x + g.w, r.x + r.w)) off.push(`${key}: ${part} right edge ${(g.x + g.w).toFixed(1)} — was ${(r.x + r.w).toFixed(1)}`);
        if (Math.abs(g.w - r.w) > r.w * 0.06) off.push(`${key}: ${part}.w ${g.w} — was ${r.w} (more than a font's difference)`);
      }
    }
  }
  expect(off, `baseline from ${BASELINE.taken.commit}:\n` + off.join('\n')).toEqual([]);
});

/* ⑧ (map-chrome-search-expand) THE OPEN FIELD IS AS WIDE AS THE FRAME ALLOWS, AND ESCAPE SHUTS IT.
   MEASURED in production at 1152×720 with both panels open (a 452 px frame): the open field took only the lane the folded
   stack left — 146 px, an input of 49 px whose placeholder read «Searcl», a result list 134 px wide for rows that need 223.
   For frames on both sides of the compact threshold (≈640 px) and at 452 / 260 px: open the field the way a reader does,
   and the field must span the frame's top row, its input must hold the placeholder, and a result row must fit the list.
   Then Escape: the list closes first, then the field folds back and the caret is on the button. */
test('⑧ the open search field spans the frame and its list fits; Escape folds it back to the button', async () => {
  const problems = [];
  for (const [vw, vh] of [[1352, 760], [1328, 760], [1152, 720], [960, 640]]) {
    await page.setViewportSize({ width: vw, height: vh });
    await setChromeState(page, { left: 'frosted', right: true, theme: 'light' });   /* frame = vw − 400 − 300 */
    const frameW = await page.evaluate(() => document.getElementById('map-frame').getBoundingClientRect().width);
    const folded = await page.evaluate(() => getComputedStyle(document.querySelector('.map-frame-top')).getPropertyValue('--ms-folds').trim() === '1');
    if (folded) await page.click('#ms-btn'); else await page.click('#ms-input');
    await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    /* the placeholder is measured on the empty field; the list is the one the app draws for what a reader types */
    const ph = await page.evaluate(() => { const inp = document.getElementById('ms-input'); const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(inp);
      c.font = [cs.fontStyle, cs.fontWeight, cs.fontSize, cs.fontFamily].join(' ');
      return { need: c.measureText(inp.placeholder).width + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0), have: inp.getBoundingClientRect().width }; });
    await page.keyboard.type('Tokyo');
    await page.waitForFunction(() => document.getElementById('ms-results').style.display === 'block' && !!document.querySelector('#ms-results .ms-item'), null, { timeout: 15_000 }).catch(() => { });
    const m = await page.evaluate(() => {
      const box = document.getElementById('map-search'), inp = document.getElementById('ms-input'), res = document.getElementById('ms-results');
      const out = { field: box.getBoundingClientRect().width, rows: res.querySelectorAll('.ms-item').length, listW: res.clientWidth, listScroll: res.scrollWidth,
        focused: document.activeElement?.id };
      return out;
    });
    const tag = `${vw}×${vh} (frame ${Math.round(frameW)} px${folded ? ', folded tier' : ''})`;
    if (m.focused !== 'ms-input') problems.push(`${tag}: the caret is not in the field (${m.focused})`);
    if (folded && m.field < frameW - 2 * 6 - 1) problems.push(`${tag}: the open field is ${Math.round(m.field)} px of a ${Math.round(frameW)} px frame`);
    if (ph.have + 0.5 < ph.need) problems.push(`${tag}: the input is ${Math.round(ph.have)} px, the placeholder needs ${Math.round(ph.need)}`);
    if (!m.rows) problems.push(`${tag}: typing «Tokyo» drew no result rows`);
    if (m.listScroll > m.listW + 1) problems.push(`${tag}: the result list overflows (${m.listScroll} px of content in ${m.listW})`);
    /* Escape: the list first, then the field */
    await page.keyboard.press('Escape');
    const afterOne = await page.evaluate(() => ({ list: document.getElementById('ms-results').style.display, focused: document.activeElement?.id }));
    if (afterOne.list !== 'none') problems.push(`${tag}: the first Escape left the result list open`);
    await page.keyboard.press('Escape');
    const afterTwo = await page.evaluate(() => ({ focused: document.activeElement?.id, input: document.getElementById('ms-input').getBoundingClientRect().width, leftOpen: !document.getElementById('sidebar').classList.contains('collapsed') }));
    if (!afterTwo.leftOpen) problems.push(`${tag}: the Escape that folded the field also shut the left panel`);
    if (folded && (afterTwo.focused !== 'ms-btn' || afterTwo.input >= 1)) problems.push(`${tag}: the second Escape did not fold the field back to its button (focus ${afterTwo.focused}, input ${Math.round(afterTwo.input)} px)`);
    if (!folded && afterTwo.focused !== 'ms-input') problems.push(`${tag}: a wide pill does not fold, so Escape must leave the caret where it was (${afterTwo.focused})`);
    await page.evaluate(() => { const i = document.getElementById('ms-input'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('ms-results').style.display = 'none'; document.activeElement?.blur?.(); });
  }
  expect(problems, problems.join('\n')).toEqual([]);
});

/* ⑨ (map-search-reopen) THE FOLDED SEARCH, WALKED THROUGH EVERY STATE A READER CAN PUT IT IN.
   MEASURED in production (1152×720 and 960×640, both panels open): after Escape had folded a field that still held words,
   neither the button nor Enter opened it again (it stayed 45 px; only Shift+Tab got back in), the search they ran instead
   put 12 results in a 44 px list, and closing that list with Escape also shut the left panel. Each step below is what a
   reader does next, and after each one the field, the list, the caret and the left panel are asked where they are. */
test('⑨ open → type → results → Escape → fold → reopen by click and by Enter, and the left panel never moves', async () => {
  const problems = [];
  const look = () => page.evaluate(() => {
    const inp = document.getElementById('ms-input'), res = document.getElementById('ms-results');
    const rr = res.getBoundingClientRect(), rs = getComputedStyle(res);
    return { input: inp.getBoundingClientRect().width, value: inp.value, focused: document.activeElement?.id,
      listShown: rs.display !== 'none' && rr.width > 0 && rr.height > 0, listW: res.clientWidth, listScroll: res.scrollWidth,
      leftOpen: !document.getElementById('sidebar').classList.contains('collapsed') };
  });
  const frames = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  for (const [vw, vh] of [[1152, 720], [960, 640]]) {
    await page.setViewportSize({ width: vw, height: vh });
    await setChromeState(page, { left: 'frosted', right: true, theme: 'light' });
    const tag = `${vw}×${vh}`;
    const step = async (name, want) => {
      await frames(); const s = await look();
      if (!s.leftOpen) problems.push(`${tag} · ${name}: the left panel shut`);
      for (const [k, test] of Object.entries(want)) if (!test(s)) problems.push(`${tag} · ${name}: ${k} (${JSON.stringify(s)})`);
      return s;
    };
    await step('folded at rest', { 'folded': (s) => s.input < 1 });
    await page.click('#ms-btn');
    await step('button opens the field', { 'open': (s) => s.input > 150, 'caret in the field': (s) => s.focused === 'ms-input' });
    await page.keyboard.type('Tokyo');
    await page.waitForFunction(() => !!document.querySelector('#ms-results .ms-item') && document.getElementById('ms-results').style.display === 'block', null, { timeout: 15_000 }).catch(() => { });
    await step('typing shows results that fit', { 'list shown': (s) => s.listShown, 'list fits': (s) => s.listScroll <= s.listW + 1 });
    await page.keyboard.press('Escape');
    await step('Escape closes the list only', { 'list closed': (s) => !s.listShown, 'still open': (s) => s.input > 150 });
    await page.keyboard.press('Escape');
    await step('Escape folds the field, words kept', { 'folded': (s) => s.input < 1, 'caret on the button': (s) => s.focused === 'ms-btn', 'words kept': (s) => s.value === 'Tokyo' });
    await page.waitForTimeout(700);   /* a search that answers late must not open a list under the folded button */
    await step('no list under a folded field', { 'no list': (s) => !s.listShown });
    await page.click('#ms-btn');
    await step('the button reopens it over the words', { 'open': (s) => s.input > 150, 'caret in the field': (s) => s.focused === 'ms-input', 'words kept': (s) => s.value === 'Tokyo' });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await step('folded again', { 'folded': (s) => s.input < 1, 'caret on the button': (s) => s.focused === 'ms-btn' });
    await page.keyboard.press('Enter');
    await step('Enter on the button reopens it', { 'open': (s) => s.input > 150, 'caret in the field': (s) => s.focused === 'ms-input' });
    await page.evaluate(() => { const i = document.getElementById('ms-input'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('ms-results').style.display = 'none'; document.activeElement?.blur?.(); });
  }
  expect(problems, problems.join('\n')).toEqual([]);
});
