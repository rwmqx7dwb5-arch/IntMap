/* ============================================================================
 *  The floating map controls, measured the same way by the spec that guards them
 *  (tests/map-chrome-layout.spec.js) and by whoever re-takes its baseline
 *  (tests/map-chrome-layout-baseline.json — see its `taken` field).
 * ==========================================================================*/

/* the surfaces whose place and size a reader sees — each by the element that draws it */
export const CHROME_PARTS = {
  search: '#map-search',
  stack: '.map-controls-top',
  viewRow: '.map-view-row',
  tools: '#map-tools-group',
  compass: '#btn-compass',
  locate: '#btn-locate',
  chronos: '#news-timeline',
};

/** put the shell in a state and wait until nothing that moves the chrome is still moving */
export async function setChromeState(page, { left = 'closed', right = false, theme = 'light' } = {}) {
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
    const els = ['#map-frame', '#sidebar', '#layer-sidebar-r', '.map-column', '.map-controls-top', '#news-timeline', '#map-search']
      .map((s) => document.querySelector(s)).filter(Boolean);
    return !els.some((el) => el.getAnimations().some((a) => a.playState === 'running'));
  }, null, { timeout: 10_000 }).catch(() => { });
  /* the animations are over; two frames let the layout that follows them land (no fixed sleep — it was most of the spec's time) */
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
}

/** the rect of every part that is drawn, rounded to 0.1 px */
export function measureChrome(page) {
  return page.evaluate((PARTS) => {
    const out = {};
    for (const [k, s] of Object.entries(PARTS)) {
      const el = document.querySelector(s); if (!el) continue;
      const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
      let shown = true;
      for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n); if (c.display === 'none' || c.visibility === 'hidden') { shown = false; break; } }
      if (!shown) continue;
      const q = (v) => Math.round(v * 10) / 10;
      out[k] = { x: q(r.left), y: q(r.top), w: q(r.width), h: q(r.height) };
    }
    return out;
  }, CHROME_PARTS);
}
