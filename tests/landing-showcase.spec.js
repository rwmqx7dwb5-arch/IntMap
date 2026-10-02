/* ============================================================================
 *  landing-showcase — every example map opens as its page says, and the pages hold together
 * ----------------------------------------------------------------------------
 *  js/showcase.js declares the example maps; about.html / teachers.html (and ja/) show them with a
 *  picture, a sentence and a link. The sentence is a claim about the map, so it is asked OF THE MAP:
 *
 *  ① EVERY EXAMPLE THE RECORD CANNOT ANSWER FOR, OPENED FROM ITS LINK (the rest: js/showcase.js RECORD_ANSWERED). The first one is opened the way a visitor from the landing
 *     page opens it — a new page at `index.html#v=…`; every following one in the same tab through the
 *     share link's FULL restore (`IntMapBookmark.restore({shared:true})` on the link's address — the
 *     path Atlas's `panel.showcase` takes). ⚠ Not `location.hash = …`: MEASURED 2026-10-02, js/map-ui.js's
 *     `hashchange` handler returns while the previous restore's 3.5 s `restoring` window is open, so a
 *     second link pasted within it is silently dropped (the clock stayed at 1942-11-01 for the 1985
 *     example) — reported, not worked around in the product here. For each, after the restore:
 *       · the clock is at the declared date (or live, for a «now» example);
 *       · the camera is where the example says;
 *       · exactly the declared share-carried layers are on, and each of them has painted;
 *       · `drawn.labels` — the polity names the text relies on — are labels the time machinery holds
 *         for that date (imtb-lbl-src), and `drawn.admin` are first-level units it holds (imta*).
 *     The network is hermetic (tests/helpers/network.js): everything asked here comes from the
 *     bundles the site ships, which is also why it can be asserted.
 *  ② THE FOUR PAGES: every same-origin link and picture resolves, every in-page anchor exists, every
 *     example card's link is the captured one, and at a phone's width nothing is wider than the screen.
 *     THE TWENTY SHARE PAGES (s/<id>.html, ja/s/<id>.html): each carries its own card (og:image = this
 *     example's 1200×630 picture, summary_large_image) and sends a person to its own map — with a script
 *     and, with scripts off, by the meta refresh alone.
 *  ③ A reader who chose Japanese in the app is taken to ja/; a reader with no choice is not moved.
 *  (classroom-tours) THE FIRST EXAMPLE IS OPENED THE WAY A TEACHER OPENS IT: from the address of a tour that
 *     passes through it (`?tour=<id>&step=<n>` + its link — js/tours.js tourLink, what the teacher page links),
 *     so the same boot asks the classroom mode too — the panel shows that step, → moves to the next step
 *     (its address and camera are the step's), Esc leaves (the mode is gone and the address names no tour).
 *     It costs one camera move, not a boot (no new spec: the suite's time may only go down, #R205).
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState, BASE } from './helpers/session-seed.js';
import { SHOWCASE, CAPTURED, RECORD_ANSWERED } from '../js/showcase.js';
import { TOURS, tourSteps, tourLink } from '../js/tours.js';
import { sharedIds } from '../js/layer-manifest.js';
import { decode } from '../js/map-state.js';   /* (map-state-store) the codec the app writes the link with */
import { SITE_URL } from '../supabase/functions/_shared/site-origin.js';
import { SITE_TOKEN } from '../scripts/site-url.mjs';

const PAGES = ['about.html', 'teachers.html', 'ja/about.html', 'ja/teachers.html'];
const SHARE = SHOWCASE.flatMap((s) => [['s/' + s.id + '.html', s], ['ja/s/' + s.id + '.html', s]]);

/* what the map holds for the open date: polity labels and first-level units, every spelling a label can use */
const HELD = () => {
  /* the source's whole collection for the date (serialize), not the features in the tiles loaded so far:
     the claim is what the map holds for that date, and tile loading is a timing, not a fact (MEASURED: a 1985
     run read the previous date's tiles while the collection already held «West Germany») */
  const names = (src) => { try { const d = window.__imap.getSource(src).serialize().data; return ((d && d.features) || []).flatMap((f) => {
    const p = f.properties || {}; return [p._locName, p._modName, p.NAME, p.name, p.n, p.nm].filter(Boolean).map(String); }); } catch (_) { return []; } };
  const srcs = Object.keys((window.__imap.getStyle() || {}).sources || {});
  return { labels: [...new Set(names('imtb-lbl-src'))], admin: [...new Set(srcs.filter((s) => /^imta\d?-(src|gap-src)$/.test(s)).flatMap(names))] };
};

async function settled(page) {
  await page.waitForFunction(() => { try { return window.IntMapGeoEngine.canDraw() && window.IntMapLayerHold.pending().length === 0; } catch (_) { return false; } }, null, { timeout: 60000 });
}

async function assertExample(page, s) {
  const at = s.at;
  /* the clock — the restore sets it at +900 ms */
  await page.waitForFunction((at) => { try { const st = window.IntMapTime.state(); return at == null ? !!st.isLive : (!st.isLive && st.iso === at); } catch (_) { return false; } }, at, { timeout: 20000 })
    .catch(async () => { throw new Error(s.id + ": the clock did not reach " + at + " — it reads " + JSON.stringify(await page.evaluate(() => window.IntMapTime.state()))); });
  /* the layers — the restore ticks them at +700 / +1800 / +3200 ms; wait for the declared set exactly */
  await page.waitForFunction(({ ids, want }) => ids.every((id) => { const cb = document.getElementById(id); return !cb || cb.checked === want.includes(id); }), { ids: sharedIds(), want: s.layers }, { timeout: 20000 });
  await settled(page);
  const cam = await page.evaluate(() => { const c = window.IntMapGeoEngine.camera.getCenter(); return { lng: c.lng, lat: c.lat, z: window.IntMapGeoEngine.camera.getZoom() }; });
  expect(Math.abs(cam.lng - s.view.lng), s.id + ' camera lng').toBeLessThan(1e-3);
  expect(Math.abs(cam.lat - s.view.lat), s.id + ' camera lat').toBeLessThan(1e-3);
  expect(Math.abs(cam.z - s.view.zoom), s.id + ' camera zoom').toBeLessThan(0.02);
  /* (map-state-store) …and the map's one state reads the same map back: the link the app would share NOW names this
     example's view, instant and layers — the store's projection of the live map, decoded by the same codec that read
     the captured link (js/map-state.js). */
  const shared = decode(new URL(await page.evaluate(() => window.IntMapBookmark.link())).hash), linked = decode(CAPTURED[s.id].hash);
  expect([shared.view.lng, shared.view.lat, shared.view.zoom, shared.view.proj], s.id + ': the store view').toEqual([linked.view.lng, linked.view.lat, linked.view.zoom, linked.view.proj]);
  expect(shared.time, s.id + ': the store instant').toEqual(linked.time);
  expect(shared.layers.slice().sort(), s.id + ': the store layers').toEqual(linked.layers.slice().sort());
  /* (basic-display-not-layers) every example link was written before `d=` and names no map display item, which has
     always meant «off» — the restore turned day & night and 3-D buildings off, so the link the app shares back
     carries no `d=` either (js/map-state.js `display`) */
  expect(shared.display, s.id + ': the map display the store reads back').toBeNull();
  for (const id of s.layers) {
    await page.waitForFunction((id) => { try { return !!window.__imLayerPainted(id); } catch (_) { return false; } }, id, { timeout: 60000 })
      .catch(() => {});
    expect(await page.evaluate((id) => { try { return !!window.__imLayerPainted(id); } catch (_) { return false; } }, id), s.id + ': layer ' + id + ' painted').toBe(true);
  }
  const want = s.drawn || {};
  if ((want.labels && want.labels.length) || (want.admin && want.admin.length)) {
    await page.waitForFunction(({ fn, want }) => {
      const h = (0, eval)('(' + fn + ')')();
      return (want.labels || []).every((n) => h.labels.includes(n)) && (want.admin || []).every((n) => h.admin.includes(n));
    }, { fn: HELD.toString(), want }, { timeout: 60000 }).catch(() => {});
    const held = await page.evaluate(HELD);
    for (const n of want.labels || []) expect(held.labels, s.id + ': the map holds the label «' + n + '» for ' + at).toContain(n);
    for (const n of want.admin || []) expect(held.admin, s.id + ': the map holds the unit «' + n + '» for ' + at).toContain(n);
  }
}

test('every example the record cannot answer for opens from its link, at its date, with its layers and the names its text claims', async ({ browser }) => {
  test.setTimeout(900000);   /* the examples; each wait is on a condition and bounded at 60 s for a shared, loaded machine */
  expect(SHOWCASE.length).toBeGreaterThanOrEqual(8);
  const ctx = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
  /* the «now» examples first: a link with no `tt` leaves the clock where it is (js/map-ui.js restore()
     sets the clock only when the link names one), so they are opened on the fresh page — where the clock
     is live — and the dated ones follow. Atlas's panel.showcase returns the clock to now itself. */
  /* (test-budget, #R205) only the examples the record cannot answer for by itself are opened here; the
     others — no layer, names only, a date the record states exactly — are asked of the record in
     tests/landing-showcase-checks.test.mjs (scripts/landing.mjs recordNamesFor). The split is derived there
     and DECLARED in js/showcase.js RECORD_ANSWERED, which this reads — the browser job has no data/. */
  const inPage = SHOWCASE.filter((s) => !RECORD_ANSWERED.includes(s.id));
  expect(inPage.length, 'at least one example needs the page').toBeGreaterThan(0);
  const ordered = inPage.filter((s) => s.at == null).concat(inPage.filter((s) => s.at != null));
  const [first, ...rest] = ordered;
  /* (classroom-tours) a tour that passes through the first example, with a step after it the classroom mode can move to */
  const via = TOURS.map((t) => ({ t, steps: tourSteps(t) })).map(({ t, steps }) => ({ t, steps, i: steps.findIndex((st) => st.example === first.id) }))
    .find((x) => x.i >= 0 && x.i < x.steps.length - 1);
  await page.goto(via ? tourLink(via.t.id, via.i + 1).replace(/^\./, '') : '/index.html' + CAPTURED[first.id].hash, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await assertExample(page, first);
  if (via) {
    const here = via.steps[via.i], then = via.steps[via.i + 1];
    await expect(page.locator('html')).toHaveAttribute('data-classroom', '1');
    const panel = page.locator('#im-tour');
    await expect(panel, 'the classroom panel shows the step it opened on').toContainText(here.say[0]);
    await expect(panel).toContainText((via.i + 1) + ' / ' + via.steps.length);
    await expect(page.locator('#sidebar'), 'everything but the map is put away').toBeHidden();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction((h) => location.hash === h && /[?&]step=/.test(location.search), then.hash, { timeout: 15000 });
    expect(new URL(page.url()).searchParams.get('step'), 'the address names the step on screen').toBe(String(via.i + 2));
    await expect(panel).toContainText(then.say[0]);
    const cam = await page.evaluate(() => { const c = window.IntMapGeoEngine.camera.getCenter(); return { lng: c.lng, lat: c.lat }; });
    expect(Math.abs(cam.lng - then.view.lng) + Math.abs(cam.lat - then.view.lat), 'the camera is the next step\'s').toBeLessThan(2e-3);
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-classroom', '1');
    await expect(panel).toHaveCount(0);
    expect(new URL(page.url()).search, 'leaving the tour leaves no tour in the address').toBe('');
  }
  for (const s of rest) {
    await page.evaluate((h) => { history.replaceState(null, '', location.pathname + location.search + h); window.IntMapBookmark.restore({ shared: true }); }, CAPTURED[s.id].hash);
    await assertExample(page, s);
  }
  expect(errors, 'no uncaught error while opening the examples').toEqual([]);
  await ctx.close();
});

test('the landing and teacher pages: links, pictures, anchors and the captured example links', async ({ browser }) => {
  const ctx = await browser.newContext();
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  const checked = new Set();
  for (const p of PAGES) {
    await page.goto('/' + p, { waitUntil: 'load' });
    expect(page.url(), p + ' is not redirected for a reader with no saved choice').toBe(BASE + '/' + p);
    const facts = await page.evaluate(() => ({
      hrefs: [...document.querySelectorAll('a[href]')].map((a) => ({ raw: a.getAttribute('href'), abs: a.href, sc: a.getAttribute('data-showcase-link') })),
      imgs: [...document.querySelectorAll('img')].map((i) => i.currentSrc || i.src),
      ids: [...document.querySelectorAll('[id]')].map((e) => e.id),
    }));
    for (const h of facts.hrefs) {
      const u = new URL(h.abs);
      if (u.origin !== new URL(BASE).origin) continue;   /* Stripe, the Course of Study PDF: not ours to serve */
      if (h.raw.startsWith('#')) { expect(facts.ids, p + ': anchor ' + h.raw).toContain(h.raw.slice(1)); continue; }
      if (h.sc) expect(u.hash, p + ': the card link of ' + h.sc + ' is its captured link').toBe(CAPTURED[h.sc].hash);
      const key = u.pathname;
      if (checked.has(key)) continue;
      checked.add(key);
      const r = await page.request.get(u.origin + u.pathname);
      expect(r.status(), p + ' → ' + h.raw).toBe(200);
    }
    for (const src of facts.imgs) {
      const r = await page.request.get(src);
      expect(r.status(), p + ' picture ' + src).toBe(200);
    }
    const broken = await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('img')];
      await Promise.all(imgs.map((i) => { i.loading = 'eager'; return i.decode().catch(() => {}); }));
      return imgs.filter((i) => !(i.naturalWidth > 0)).map((i) => i.src);
    });
    expect(broken, p + ': every picture decodes').toEqual([]);
  }
  /* AS SERVED, the address is absolute and the site's own (the build filled SITE_TOKEN — scripts/site-url.mjs
     fillSiteToken): canonical, hreflang, og:url / og:image, the sitemap's <loc> and robots.txt's Sitemap */
  for (const rel of [...PAGES, 'sitemap.xml', 'robots.txt', SHARE[0][0], SHARE[SHARE.length - 1][0]]) {
    const body = await (await page.request.get('/' + rel)).text();
    expect(body.includes(SITE_TOKEN), rel + ' still carries the token as served').toBe(false);
    const abs = rel.endsWith('.txt') ? /Sitemap: (\S+)/.exec(body)[1]
      : rel.endsWith('.xml') ? /<loc>([^<]+)<\/loc>/.exec(body)[1]
        : /<link rel="canonical" href="([^"]+)"/.exec(body)[1];
    expect(abs.startsWith(SITE_URL), rel + ' names the site’s own address: ' + abs).toBe(true);
    if (rel.endsWith('.html')) expect(/<meta property="og:url" content="([^"]+)"/.exec(body)[1], rel + ' og:url').toBe(SITE_URL + rel);
  }
  /* the share pages: each one's card, as a crawler reads it (no script), and the way on — with a script
     (location.replace) and without one (the meta refresh) — to its own example's map */
  for (const [rel, s] of SHARE) {
    const html = await (await page.request.get('/' + rel)).text();
    const meta = (p) => { const m = new RegExp('<meta (?:property|name)="' + p + '" content="([^"]*)"').exec(html); return m && m[1]; };
    /* the card is the one the app took of THIS example, at the site address the page itself declares */
    expect(meta('og:image'), rel).toBe(meta('og:url').slice(0, meta('og:url').length - rel.length) + CAPTURED[s.id].card);
    expect(meta('twitter:card'), rel).toBe('summary_large_image');
    expect(meta('og:title') && meta('og:description') && meta('og:url'), rel).toBeTruthy();
    const card = await page.request.get('/' + CAPTURED[s.id].card);
    expect(card.status(), rel + ' card picture').toBe(200);
  }
  for (const js of [true, false]) {
    const c = await browser.newContext({ javaScriptEnabled: js });
    await installHermeticRouting(c);
    const p = await c.newPage();
    const [rel, s] = SHARE[js ? 0 : SHARE.length - 1];
    /* stop at the map's own document: what is asserted is WHERE the page sends a person */
    await p.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>map</title>' }));
    await p.goto('/' + rel, { waitUntil: 'commit' });
    await p.waitForURL((u) => u.pathname.endsWith('/index.html'), { timeout: 15000 });
    expect(new URL(p.url()).hash, rel + (js ? ' (script)' : ' (no script: meta refresh)')).toBe(CAPTURED[s.id].hash);
    await c.close();
  }
  await ctx.close();
});

test('at a phone’s width no page is wider than the screen, and a Japanese reader lands on ja/', async ({ browser }) => {
  for (const width of [320, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
    await installHermeticRouting(ctx);
    const page = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto('/' + p, { waitUntil: 'load' });
      const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, vw: window.innerWidth }));
      expect(Math.max(w.doc, w.body), p + ' at ' + width + ' px').toBeLessThanOrEqual(w.vw);
    }
    await ctx.close();
  }
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [{ origin: BASE, localStorage: [{ name: 'intmap_settings', value: JSON.stringify({ lang: 'jp' }) }] }] } });
  await installHermeticRouting(ctx);
  const page = await ctx.newPage();
  await page.goto('/about.html#examples', { waitUntil: 'load' });
  await expect(page).toHaveURL(BASE + '/ja/about.html#examples');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await ctx.close();
});
