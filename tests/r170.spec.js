// R170 behavioural checks in a real browser.
//
// Source-level checks (tests/r170-checks.test.mjs) can prove the code SAYS the right thing. These
// prove it DOES it, for the three claims that a reader would otherwise have to take on faith:
//
//   1. The layer-toggle fix. The bug was never "the layer never appears" — it was "the same click
//      sometimes takes 4 s". A test that just waits for the layer would have passed BEFORE the fix.
//      So this measures the latency while the map is deliberately busy, which is the state the old
//      gate could not handle (measured before the fix: 4497 / 3171 ms; after: 95 / 71 / 107 ms).
//   2. The 3-D volume tool, driven through the real UI (menu → map clicks → the panel's inputs),
//      including the paint properties actually handed to the renderer — the number a user types has
//      to survive all the way to fill-extrusion-base, and with 3-D terrain on it must be REDUCED by
//      the ground elevation, or the box would float above the mountain instead of above the sea.
//   3. The requested defaults, observed on a fresh profile: no ticker, no workspace, Countries open.
import { test, expect } from '@playwright/test';

const boot = async page => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__imap.isStyleLoaded(), null, { timeout: 60000 }).catch(() => {});
};

test('a freshly ticked layer paints promptly even while the map is busy', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);

  const busy = await page.evaluate(async () => {
    // the state the old gate could not handle: tiles in flight, so isStyleLoaded() is false
    const m = window.__imap;
    m.easeTo({ center: [12.5, 41.9], zoom: 6.5, duration: 2500 });
    await new Promise(r => setTimeout(r, 250));
    return !m.isStyleLoaded();
  });

  const results = await page.evaluate(async () => {
    const m = window.__imap, out = [];
    const painted = id => { try { return !!m.getLayer(id) && m.getLayoutProperty(id, 'visibility') !== 'none'; } catch (_) { return false; } };
    for (const [cb, lyr] of [['dl-sst', 'lyr-sst'], ['dl-snow', 'lyr-snow'], ['dl-aod', 'lyr-aod']]) {
      const box = document.getElementById(cb);
      if (!box) { out.push({ cb, ms: -1, note: 'no checkbox' }); continue; }
      m.easeTo({ center: [10 + Math.random() * 20, 30 + Math.random() * 20], zoom: 5.5, duration: 2000 });
      await new Promise(r => setTimeout(r, 150));
      const wasBusy = !m.isStyleLoaded();
      const t0 = performance.now();
      box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true }));
      let ms = -1;
      for (let i = 0; i < 120; i++) { if (painted(lyr)) { ms = Math.round(performance.now() - t0); break; } await new Promise(r => setTimeout(r, 25)); }
      out.push({ cb, ms, wasBusy });
      box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 350));
    }
    return out;
  });

  expect(busy, 'the probe must actually catch the map mid-load, or it proves nothing').toBe(true);
  for (const r of results) {
    expect(r.ms, `${r.cb} never painted`).toBeGreaterThanOrEqual(0);
    // the pre-fix path bottomed out at the 150 ms whenStyleReady poll and typically took 3-4.5 s
    expect(r.ms, `${r.cb} took ${r.ms} ms — the isStyleLoaded gate is back`).toBeLessThan(1500);
  }
});

test('the layer-state reconciler runs while the map is busy', async ({ page }) => {
  await boot(page);
  // audit() used to early-return on isStyleLoaded(), so the self-heal was asleep exactly when needed
  const ok = await page.evaluate(async () => {
    const m = window.__imap;
    m.easeTo({ center: [-58, -34], zoom: 7, duration: 2000 });
    await new Promise(r => setTimeout(r, 300));
    return { busy: !m.isStyleLoaded(), canDraw: window.IntMapCanDraw(), engine: window.IntMapGeoEngine.canDraw() };
  });
  expect(ok.busy).toBe(true);
  expect(ok.canDraw, 'canDraw must be true while tiles stream — that is the whole fix').toBe(true);
  expect(ok.engine).toBe(true);
});

test('fresh desktop profile: normal mode, Countries open, no ticker', async ({ page }) => {
  await boot(page);
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => ({
    ws: document.body.classList.contains('ws-mode'),
    ticker: window.imTicker,
    tickerVisible: (() => { const t = document.getElementById('ticker-bar'); return !!(t && getComputedStyle(t).display !== 'none'); })(),
    countriesActive: !!document.getElementById('btn-stats')?.classList.contains('active'),
    rows: document.querySelectorAll('#stats-feed .stat-row, #countries-feed .stat-row').length,
  }));
  expect(st.ws, 'desktop must boot into normal mode').toBe(false);
  expect(st.ticker).toBe('off');
  expect(st.tickerVisible).toBe(false);
  expect(st.countriesActive, 'the Countries tab must be selected on a fresh boot').toBe(true);
});

test('the place-search pill sits level with the top-right controls', async ({ page }) => {
  await boot(page);
  const box = await page.evaluate(() => {
    const s = document.getElementById('map-search').getBoundingClientRect();
    const c = document.querySelector('.map-controls-top').getBoundingClientRect();
    return { search: Math.round(s.top), controls: Math.round(c.top) };
  });
  expect(Math.abs(box.search - box.controls), 'search pill and the view controls should share a row').toBeLessThanOrEqual(6);
});

test('Measure ▸ 3-D volume draws a real-scale box and honours the typed altitudes', async ({ page }) => {
  test.setTimeout(150000);
  await boot(page);
  await page.evaluate(async () => {
    window.__imap.setProjection({ type: 'mercator' });
    window.__imap.jumpTo({ center: [138.7274, 35.30], zoom: 10, pitch: 70, bearing: 0 });
    await new Promise(r => setTimeout(r, 2000));
  });

  await page.click('#btn-measure-menu');
  await page.click('#btn-tool-volume');
  await expect(page.locator('.tp-title')).toContainText('3');

  const canvas = await page.locator('canvas.maplibregl-canvas').boundingBox();
  for (const [fx, fy] of [[0.42, 0.55], [0.58, 0.55], [0.58, 0.66], [0.42, 0.66]]) {
    await page.mouse.click(canvas.x + canvas.width * fx, canvas.y + canvas.height * fy);
    await page.waitForTimeout(200);
  }

  await page.fill('#v3d-base', '2000');
  await page.fill('#v3d-top', '6000');
  await page.waitForTimeout(500);

  const st = await page.evaluate(() => window.IntMapVolume3D.state());
  expect(st.points).toBe(4);
  expect(st.base).toBe(2000);
  expect(st.top).toBe(6000);
  expect(st.thickness).toBe(4000);
  expect(st.areaM2).toBeGreaterThan(1e6);
  // volume = footprint x thickness, and the panel must show the same number
  expect(Math.abs(st.volumeM3 - st.areaM2 * 4000)).toBeLessThan(1);
  expect(st.painted).toBe(true);
  expect(st.err).toBeNull();

  // terrain OFF → the renderer gets the ALTITUDES unchanged (they are already above sea level)
  const paintOff = await page.evaluate(() => ({
    base: window.__imap.getPaintProperty('imv3d-vol', 'fill-extrusion-base'),
    height: window.__imap.getPaintProperty('imv3d-vol', 'fill-extrusion-height'),
  }));
  expect(paintOff.base).toBe(2000);
  expect(paintOff.height).toBe(6000);

  // terrain ON → MapLibre measures from the ground, so the module must subtract the DEM height
  await page.click('#btn-view-3d');
  /* (#R171) Wait for the DEM to have actually ANSWERED, not merely for a non-null reading. This test fell
     into the very trap #R170's notes describe: queryTerrainElevation returns 0 for the first moment after
     terrain is switched on, and 0 is both "still loading" and "sea level" — so `ground != null` was
     satisfied instantly, and the assertions below then read the box while it was still uncompensated.
     Measured on main: 3 failures in 3 runs here, and 2 in 3 on the branch, for that reason alone.
     Over Mt Fuji a reading of 0 m is not plausible, so a positive value IS the "settled" signal, and
     chaseGround() re-paints within a second of the real tile arriving. */
  await page.waitForFunction(() => window.IntMapVolume3D.state().ground > 0, null, { timeout: 30000 });
  const on = await page.evaluate(() => ({
    st: window.IntMapVolume3D.state(),
    base: window.__imap.getPaintProperty('imv3d-vol', 'fill-extrusion-base'),
    height: window.__imap.getPaintProperty('imv3d-vol', 'fill-extrusion-height'),
  }));
  expect(on.st.terrain).toBe(true);
  expect(on.st.ground).toBeGreaterThan(0);
  expect(on.st.base, 'the altitudes the user typed must not change').toBe(2000);
  expect(on.st.top).toBe(6000);
  expect(Math.abs(on.base - (2000 - on.st.ground)), 'base must be reduced by the ground elevation').toBeLessThan(1.5);
  expect(Math.abs(on.height - (6000 - on.st.ground))).toBeLessThan(1.5);

  // closing the tool removes the box
  await page.click('#tool-panel .tp-close');
  await page.waitForTimeout(400);
  const gone = await page.evaluate(() => window.IntMapVolume3D.state().painted);
  expect(gone).toBe(false);
});

test('Atlas can draw a 3-D volume over a named place', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const res = await page.evaluate(() => window.IntMapConsole.dispatch({ type: 'volume3d', place: 'Paris', km: 8, base: 1500, top: 4000 }));
  expect(res.ok).toBe(true);
  expect(res.html).toContain('1,500');
  const st = await page.evaluate(() => window.IntMapVolume3D.state());
  expect(st.base).toBe(1500);
  expect(st.top).toBe(4000);
  expect(st.painted).toBe(true);
  expect(st.areaM2).toBeGreaterThan(5e7);   // an 8 km square is ~64 km²
});

test('every Companies figure is printed with the date it is from', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => window.IntMapOS.exec('tab.info', { source: 'test' }));
  await page.waitForSelector('.co-row', { timeout: 30000 });
  await page.waitForTimeout(2500);

  const rows = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.co-row').forEach(r => {
      const v = r.querySelector('.stat-val'); if (!v) return;
      const chip = v.querySelector('.co-asof');
      out.push({ val: (v.childNodes[0] && v.childNodes[0].textContent || '').trim(), asof: chip ? chip.textContent.trim() : null, title: chip ? chip.title : null });
    });
    return out;
  });
  expect(rows.length).toBeGreaterThan(20);
  const withValue = rows.filter(r => r.val && r.val !== '—');
  expect(withValue.length).toBeGreaterThan(10);
  for (const r of withValue) {
    expect(r.asof, `"${r.val}" has no as-of stamp`).toBeTruthy();
    // a date, a date-time, or the curated fiscal-year basis — never an empty or bare label
    expect(r.asof).toMatch(/(\d{4}-\d{2}-\d{2})|(FY\d{4})|(\d{4})/);
    expect(r.title, 'the stamp must explain itself on hover').toBeTruthy();
  }

  // The detail overlay dates every numeric row too. It opens on a DOUBLE click (a single click
  // toggles compare) and the row handler distinguishes them with a 250 ms timer, so this has to be
  // a real dblclick — two dispatched clicks 400 ms apart read as two singles.
  await page.locator('.co-row').first().dblclick();
  await page.waitForSelector('.co-detail-rows', { timeout: 15000 });
  const detail = await page.evaluate(() => [...document.querySelectorAll('.co-drow')].map(d => ({
    label: d.querySelector('span')?.textContent.trim(),
    asof: d.querySelector('.co-asof')?.textContent.trim() || null })));
  const dated = detail.filter(d => d.asof);
  expect(dated.length, 'market cap, price, P/E, revenue, net income and employees must all be dated').toBeGreaterThanOrEqual(5);
});

test('a live price is stamped with the quote\'s OWN time, not the fetch time', async ({ page }) => {
  test.setTimeout(120000);
  // The keyless Yahoo feed reaches the browser through a CORS-proxy ladder that is regularly
  // unavailable (verified against production: direct Yahoo is CORS-blocked, corsproxy.io answers
  // 400/503, allorigins fails — the news RSS is down the same way). When it is, Companies correctly
  // falls back to the reported snapshot and stamps it with the dataset's compile date. That is the
  // honest outcome, but it means the LIVE branch never runs, so this stubs one batched spark
  // response with a known quote timestamp and checks the stamp is that timestamp — the difference
  // between "priced at 14:32" and "we fetched something at 14:32" is the whole point of priceTexact.
  const QUOTE_MS = Date.UTC(2026, 6, 24, 20, 0, 0);          // a fixed, recognisable quote time
  await page.route('**/v8/finance/spark**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({
      spark: {
        result: [{ symbol: 'AAPL', response: [{ timestamp: [QUOTE_MS / 1000], indicators: { quote: [{ close: [225.5] }] }, meta: { regularMarketPrice: 225.5 } }] }],
      },
    }),
  }));
  await boot(page);
  await page.evaluate(() => window.IntMapOS.exec('tab.info', { source: 'test' }));
  await page.waitForSelector('.co-row', { timeout: 30000 });
  await page.waitForFunction(() => window.IntMapCompanies.DATA.some(c => c.price > 0), null, { timeout: 40000 });

  const r = await page.evaluate((ms) => {
    const c = window.IntMapCompanies.DATA.find(x => x.tk === 'AAPL');
    const d = new Date(ms);
    const two = n => (n < 10 ? '0' : '') + n;
    return {
      price: c.price, exact: !!c.priceTexact, t: c.priceT, want: ms,
      expectLocal: d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()),
    };
  }, QUOTE_MS);
  expect(r.price).toBe(225.5);
  expect(r.exact, 'the stamp must be flagged as the quote time, not the fetch time').toBe(true);
  expect(r.t).toBe(QUOTE_MS);

  // …and it must reach the UI, rendered in the viewer's local time. The list re-render is debounced
  // (~350 ms after prices land), so poll rather than reading the instant the model updates.
  const chipOf = () => page.evaluate(() => {
    const row = [...document.querySelectorAll('.co-row')].find(r => r.getAttribute('data-tk') === 'AAPL');
    return row ? (row.querySelector('.co-asof')?.textContent.trim() || null) : null;
  });
  await expect.poll(chipOf, { timeout: 20000, message: 'the row chip must switch from the snapshot date to the quote time' })
    .toBe(r.expectLocal);
});

test('the flight simulator pre-flight screen defaults to an airborne start', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => window.IntMapFlightSim.setup({}));
  await page.waitForSelector('#fs-setup', { timeout: 20000 });
  const sel = await page.evaluate(() => {
    const on = document.querySelector('#fs-setup .fss-m.on');
    return { mode: on && on.getAttribute('data-m'), label: on && on.textContent.trim() };
  });
  expect(sel.mode, 'the pre-flight screen must preselect the airborne start').toBe('air');
  await page.evaluate(() => document.querySelector('#fs-setup .fss-cancel').click());
});
