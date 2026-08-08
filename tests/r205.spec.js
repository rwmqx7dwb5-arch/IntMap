/* ============================================================================
 *  IntMap · R205 browser regressions
 * ----------------------------------------------------------------------------
 *  ⚠ ONE CONTEXT, ONE LOAD, AND IT HAS TO BE CHEAP. #R205 removed the "the current round's spec is
 *  core whatever it costs" exception from scripts/tiers.mjs after measuring that 49 of the gate's
 *  173 seconds were `r204.spec.js` alone. This file is written to the same price it imposes: one
 *  page, no per-test boot, and nothing that waits on a network the assertion does not need.
 *
 *  What is here is what a source check cannot see — the four defects this round REPRODUCED in a
 *  browser before changing anything:
 *    ① a plain click on the map added a white station circle instead of moving the epicentre
 *    ② the plate NAME was painted at text-opacity 0.3 (nothing in its own layer set that)
 *    ③ the light day side measured [252,253,254] with 97.4 % of the globe above luminance 235
 *    ④ the right-click menu showed twenty rows
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { BASE } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto(BASE + '/?rafshim=1');
  await page.waitForFunction(() => window.__imBoot && window.__imBoot.isDone(), null, { timeout: 60000 });
});
test.afterAll(async () => { await page.close(); });

/* ⚠ #R182's rule, as a helper: a gesture that lands on a panel is not a gesture the map ever sees.
   Every click in this file asks what is actually on top of the point first. */
async function canvasPoint(fxs = [0.72, 0.8, 0.62], fys = [0.55, 0.42, 0.68]) {
  const pt = await page.evaluate(([FX, FY]) => {
    const mc = document.getElementById('map-container').getBoundingClientRect();
    for (const fx of FX) for (const fy of FY) {
      const x = Math.round(mc.x + mc.width * fx), y = Math.round(mc.y + mc.height * fy);
      const top = document.elementsFromPoint(x, y)[0];
      if (top && top.tagName === 'CANVAS') return { x, y };
    }
    return null;
  }, [fxs, fys]);
  expect(pt, 'no point on the map is reachable — something is covering the canvas').not.toBeNull();
  return pt;
}

/* ── ① 「別の震源地を選びなおせない。地図に白い丸が出るだけ」 ───────────────────────────────── */
test('R205 ① a plain map click moves the epicentre; the station table is the other half of a switch', async () => {
  const before = await page.evaluate(async () => {
    window.IntMapGeoEngine.camera.jumpTo({ center: [140, 35], zoom: 4 });
    await new Promise(r => setTimeout(r, 450));
    window.IntMapSeismic.open({ lng: 140, lat: 35, mw: 7.5, depth: 20 });
    await new Promise(r => setTimeout(r, 450));
    return window.IntMapSeismic.state();
  });
  expect(before.clickMode).toBe('epi');            /* the DEFAULT is the epicentre, which is the report */
  expect(before.epi[0]).toBeCloseTo(140, 3);

  const pt = await canvasPoint();
  const px = pt.x, py = pt.y;
  await page.mouse.click(px, py);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => { const s = window.IntMapSeismic.state(); return { epi: s.epi, stations: s.stations }; });
  expect(Math.abs(after.epi[0] - before.epi[0]) + Math.abs(after.epi[1] - before.epi[1])).toBeGreaterThan(0.05);
  expect(after.stations).toBe(0);                  /* …and it did NOT drop a white circle */

  /* the observation-point table is preserved, one tap away */
  await page.evaluate(() => document.querySelector('#sq-panel .sq-cm-sta').click());
  await page.mouse.click(px, py + 60);
  await page.waitForTimeout(350);
  const sta = await page.evaluate(() => { const s = window.IntMapSeismic.state(); return { stations: s.stations, mode: s.clickMode, epi: s.epi }; });
  expect(sta.mode).toBe('station');
  expect(sta.stations).toBe(1);
  expect(sta.epi[0]).toBeCloseTo(after.epi[0], 6); /* and it left the epicentre alone */
  await page.evaluate(() => window.IntMapSeismic.close());
});

/* ── ② 「プレート境界レイヤーのプレート名は透過するな」 ──────────────────────────────────────── */
test('R205 ② the plate name is opaque, and stays opaque when the layer opacity slider moves', async () => {
  const r = await page.evaluate(async () => {
    const G = window.IntMapGeoEngine;
    const cb = document.getElementById('eco-dl-plates');
    if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    for (let i = 0; i < 80; i++) { await new Promise(r2 => setTimeout(r2, 150)); if (G.layers.has('eco-plates-lbl')) break; }
    await new Promise(r2 => setTimeout(r2, 250));
    const g = (id, k) => { try { return window.__imap.getPaintProperty(id, k); } catch (_) { return 'ERR'; } };
    const out = { text: g('eco-plates-lbl', 'text-opacity'), halo: g('eco-plates-lbl', 'text-halo-color'), fill: g('eco-plates-fill', 'fill-opacity') };
    try { window._applyGenericOpacity(window._opacityTargets['eco-plates'] || [], 0.5); } catch (_) { }
    await new Promise(r2 => setTimeout(r2, 200));
    out.textAfter = g('eco-plates-lbl', 'text-opacity');
    out.fillAfter = g('eco-plates-fill', 'fill-opacity');
    return out;
  });
  expect(r.text).toBe(1);
  expect(r.textAfter).toBe(1);              /* the slider governs the polygon, never the name */
  expect(String(r.halo)).toMatch(/,\s*1\)$|^#|rgb\(/);   /* the halo does not let the map through either */
  expect(r.fillAfter).toBeCloseTo(0.5, 3);  /* …and it still governs the polygon */
});

/* ── ③ 「地図を右クリックしたときのポップアップが煩雑」 ─────────────────────────────────────── */
test('R205 ③ the right-click menu opens collapsed, and loses no entry', async () => {
  const rp = await canvasPoint();
  await page.mouse.click(rp.x, rp.y, { button: 'right' });
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => {
    const m = document.getElementById('ctx-menu');
    const shown = [...m.querySelectorAll('button[data-act]')].filter(b => !b.closest('.ctx-sec[hidden]'));
    return { groups: m.querySelectorAll('.ctx-grp').length, actions: m.querySelectorAll('button[data-act]').length, shown: shown.length, coord: !!m.querySelector('.ctx-coord'), h: Math.round(m.getBoundingClientRect().height) };
  });
  expect(closed.groups).toBeGreaterThanOrEqual(4);
  expect(closed.actions).toBeGreaterThanOrEqual(15);   /* nothing was removed to shorten it */
  expect(closed.shown).toBe(0);                        /* …and none of them is standing there */
  expect(closed.coord).toBe(true);                     /* the coordinate is still readable while collapsed */
  const open = await page.evaluate(() => {
    document.querySelector('#ctx-menu .ctx-grp[data-grp="1"]').click();
    const m = document.getElementById('ctx-menu');
    return { shown: [...m.querySelectorAll('button[data-act]')].filter(b => !b.closest('.ctx-sec[hidden]')).length, taller: Math.round(m.getBoundingClientRect().height) };
  });
  expect(open.shown).toBeGreaterThan(0);
  expect(open.taller).toBeGreaterThan(closed.h);
  await page.evaluate(() => { document.getElementById('ctx-menu').style.display = 'none'; });
});

/* ── ④ 「ライトモードかつMapを選択した場合、昼の箇所がまぶしすぎて何も見えない」 ─────────────── */
test('R205 ④ the light day side is a map, not a white field', async () => {
  /* Playwright's contexts are colorScheme light and the app's map colour follows the theme, so this
     page IS the reported configuration — light mode on the Map basemap. The blend RAMP is pinned by
     tests/r205-checks ③; what only a browser can answer is what the day side actually looks like.
     Read INSIDE a render tick — a canvas with no preserveDrawingBuffer is
     all zeroes anywhere else (#R197), which is the trap #R204 fell into twice. */
  const px = await page.evaluate(async () => {
    const G = window.IntMapGeoEngine;
    const d = new Date(), u = d.getUTCHours() + d.getUTCMinutes() / 60;
    G.camera.jumpTo({ center: [(12 - u) * 15, 20], zoom: 3 });
    await new Promise(r => setTimeout(r, 900));
    return new Promise((res) => {
      let done = false;
      const grab = () => {
        if (done) return; done = true;
        const cv = G.render.canvas(), c2 = document.createElement('canvas');
        c2.width = cv.width; c2.height = cv.height;
        const cx = c2.getContext('2d'); cx.drawImage(cv, 0, 0);
        const im = cx.getImageData(0, 0, c2.width, c2.height).data;
        let n = 0, hot = 0;
        for (let i = 0; i < im.length; i += 4 * 11) {
          if (im[i + 3] < 10) continue;            /* space around the globe is not the day side */
          n++; if (0.2126 * im[i] + 0.7152 * im[i + 1] + 0.0722 * im[i + 2] > 235) hot++;
        }
        res({ n, hotPct: n ? 100 * hot / n : 0 });
      };
      try { G.events.once('render', grab); } catch (_) { }
      try { G.render.triggerRepaint && G.render.triggerRepaint(); } catch (_) { }
      setTimeout(grab, 800);
    });
  });
  expect(px.n).toBeGreaterThan(1000);
  expect(px.hotPct).toBeLessThan(70);     /* 97.4 % was the report; the basemap alone measures 40.9 % */
});
