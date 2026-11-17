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
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

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

/* put the shell in a state and wait until nothing that moves the chrome is still moving */
async function setState(left, right, theme) {
  await page.evaluate(({ left, right, theme }) => {
    document.documentElement.setAttribute('data-theme', theme);
    const frosted = left === 'frosted';
    document.body.classList.toggle('sidebar-glass', frosted);
    document.body.classList.toggle('sidebar-translucent', frosted);
    const sb = document.getElementById('sidebar');
    const wantOpen = left !== 'closed';
    if (sb.classList.contains('collapsed') === wantOpen) document.getElementById('btn-toggle-sidebar').click();
    if (right) window.IntMapLayerSidebar.open(); else window.IntMapLayerSidebar.close();
    document.activeElement?.blur?.();
  }, { left, right, theme });
  await page.waitForFunction(() => {
    const moving = ['#map-frame', '#sidebar', '#layer-sidebar-r', '.map-column']
      .map((s) => document.querySelector(s)).filter(Boolean)
      .some((el) => el.getAnimations({ subtree: false }).some((a) => a.playState === 'running'));
    return !moving;
  }, null, { timeout: 10_000 }).catch(() => { });
  await page.waitForTimeout(250);
}

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
    await page.waitForTimeout(400);
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
  }));
  expect(m.phone).toBe(true);
  expect(m.frame, 'the frame is no box on a phone').toBe('contents');
  expect(m.stack, 'the floating stack is not drawn on a phone').toBe('none');
  expect(m.searchHome, 'the search is lent into the sheet head').toBe('m-search-slot');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => document.getElementById('map-search').parentElement.id), 'and handed back to the frame').toBe('map-frame');
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
