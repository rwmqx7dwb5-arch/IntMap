// developer-embed — the browser half of tests/developer-embed-checks.test.mjs: what only a real page with a real frame
// can answer. A host page imports js/embed-client.js BY URL, the way another site would, mounts a map and steers it:
//   ① `ready` arrives once the frame has applied its link, carrying that link's state; `setTime` and `setView` reach the
//     frame's own clock and camera (read from inside the frame); a date the clock cannot read is refused with a reason;
//     the reader's own drag is reported as a `state` with cause 'reader'; and the host page's history does not grow
//     (a frame's history is the host's — a command must not make Back step the map).
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const HASH = '#v=13.4000,52.5000,4.00,0,0,f&tt=1914-07-01';
/* the host page, served from the site's origin under a path the site does not have */
const HOST = `<!doctype html><html><head><meta charset="utf-8"><title>host</title></head><body>
<div id="m"></div>
<script type="module">
  import { mount } from './js/embed-client.js';
  window.__log = [];
  const m = mount('#m', { hash: ${JSON.stringify(HASH)}, width: 720, height: 460, title: 'test map' });
  window.__m = m;
  m.on('state', (s) => window.__log.push({ cause: s.cause, view: s.state.view, time: s.state.time }));
  m.ready.then((s) => { window.__ready = s; });
</script></body></html>`;

test('developer-embed ① a host page steers an embedded map and hears where the reader takes it', async ({ browser }) => {
  test.setTimeout(150_000);
  const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1100, height: 760 } });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  try {
    await page.route('**/__embed-host.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HOST }));
    await page.goto('/__embed-host.html', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const history0 = await page.evaluate(() => history.length);
    /* ready: the link the frame was opened with, applied */
    await page.waitForFunction(() => !!window.__ready, null, { timeout: 90_000 });
    const ready = await page.evaluate(() => window.__ready);
    expect(ready.state.view.lng).toBeCloseTo(13.4, 3);
    expect(ready.state.view.zoom).toBeCloseTo(4, 2);
    expect(ready.state.time && ready.state.time.at, JSON.stringify(ready.state.time)).toMatch(/^1914-07-01/);
    expect(ready.link).toContain('tt=1914-07-01');
    expect(ready.link).not.toContain('embed=1');   /* the link opens the full app, as the frame's own button does */
    const frame = page.frames().find((f) => /[?&]embed=1/.test(f.url()));
    expect(frame, 'the mounted frame').toBeTruthy();

    /* setTime → the frame's own clock */
    await page.evaluate(() => window.__m.setTime('1939-09-01'));
    await expect.poll(() => frame.evaluate(() => window.IntMapBookmark.state().time && window.IntMapBookmark.state().time.at), { timeout: 15_000 }).toMatch(/^1939-09-01/);
    /* setView → the frame's own camera; the clock it was just given stays */
    await page.evaluate(() => window.__m.setView({ lng: 139.69, lat: 35.69, zoom: 6 }));
    const v = await frame.evaluate(() => window.IntMapBookmark.state());
    expect(v.view.lng).toBeCloseTo(139.69, 2);
    expect(v.view.lat).toBeCloseTo(35.69, 2);
    expect(v.time.at).toMatch(/^1939-09-01/);
    /* a date the clock cannot read is refused, with the reason, and changes nothing */
    const refused = await page.evaluate(() => window.__m.setTime('not a date').then(() => null, (e) => e.message));
    expect(refused).toContain('not a date the clock can read');
    expect((await frame.evaluate(() => window.IntMapBookmark.state())).time.at).toMatch(/^1939-09-01/);
    /* get answers the state as it is */
    const got = await page.evaluate(() => window.__m.get());
    expect(got.hash).toContain('tt=1939-09-01');

    /* the reader drags the map: reported with cause 'reader' */
    await page.evaluate(() => { window.__log.length = 0; });
    const box = await page.locator('#m iframe').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(cx - i * 25, cy + i * 6);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__log.filter((x) => x.cause === 'reader').length), { timeout: 10_000 }).toBeGreaterThan(0);
    const moved = await page.evaluate(() => window.__log.filter((x) => x.cause === 'reader').pop());
    expect(moved.view.lng).toBeGreaterThan(139.69);   /* dragged left: the camera moved east */

    /* no history entry was made by any of it */
    expect(await page.evaluate(() => history.length)).toBe(history0);
  } finally {
    await ctx.close();
  }
});

// ② the developer page as BUILT: the catalogue table the build filled in, on a phone without sideways scrolling, and the
//    files it names are served — catalog.json, a country file and the embed protocol, as JSON, from the site itself.
test('developer-embed ② the built developer page carries the catalogue, and the API files it names are served', async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  try {
    for (const p of ['/developers.html', '/ja/developers.html']) {
      await page.goto(p, { waitUntil: 'load' });
      expect(await page.locator('[data-api-catalog] tbody tr').count(), p + ': the build filled the table').toBeGreaterThan(5);
      expect(await page.locator('[data-api-withheld] tbody tr').count(), p + ': what is not offered is listed').toBeGreaterThan(0);
      expect(await page.evaluate(() => document.body.innerHTML.includes('intmap:public-api-catalog')), p + ': the marker is gone').toBe(false);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, p + ': the page scrolls sideways on a phone').toBeLessThanOrEqual(0);
    }
    const got = await page.evaluate(async () => {
      const j = async (u) => { const r = await fetch(u); return { status: r.status, json: r.ok ? await r.json() : null }; };
      return { cat: await j('/api/v1/catalog.json'), jp: await j('/api/v1/countries/JPN.json'), embed: await j('/api/v1/embed.json') };
    });
    expect(got.cat.status).toBe(200);
    expect(got.cat.json.datasets.length).toBeGreaterThan(5);
    /* every dataset file the catalogue names is in the site */
    const sample = got.cat.json.datasets.map((d) => new URL(d.files[0].url).pathname.replace(/^\/IntMap\//, '/'));
    const statuses = await page.evaluate(async (paths) => Promise.all(paths.map((u) => fetch(u, { method: 'HEAD' }).then((r) => r.status))), sample);
    expect(statuses.every((s) => s === 200), JSON.stringify(sample.filter((_, i) => statuses[i] !== 200))).toBe(true);
    expect(got.jp.status).toBe(200);
    expect(got.jp.json.name.jp).toBe('日本');
    expect(got.jp.json.sections.length).toBeGreaterThan(0);
    expect(got.embed.json.protocol.name).toBe('intmap-embed');
  } finally {
    await ctx.close();
  }
});
