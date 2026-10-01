#!/usr/bin/env node
/* ============================================================================
 *  IntMap · showcase-capture — the example maps' links and pictures, taken FROM THE APP
 * ----------------------------------------------------------------------------
 *  js/showcase.js states what each example IS (camera, date, layers, base map). This script is the
 *  only thing that turns that into a link and a picture, and it does both by asking the running
 *  application — never by typing either:
 *
 *    1. boot the BUILT site (the same dist/ GitHub Pages publishes) in Chromium, with the real
 *       network, so the picture shows the tiles a visitor would get;
 *    2. put the session into the intent through the app's own doors: the projection and base-map
 *       buttons (#btn-view-*), each share-carried layer's checkbox and its `change` event (exactly
 *       what js/map-ui.js `restore()` does with a link), the renderer contract's camera, and
 *       Chronos (`IntMapTime.set` / `setNow`);
 *    3. wait for the state «nothing is held» (js/layer-rows.js IntMapLayerHold) and for the map to
 *       stop fetching, then read `IntMapBookmark.link()` — the app's own encoder (js/map-ui.js
 *       `encode()`) — and take the screenshot in the same instant;
 *    4. write the generated region of js/showcase.js and img/showcase/<id>.jpg.
 *
 *  The pictures are screenshots of the real application at that moment, not mock-ups. They are
 *  re-taken whenever this runs; the links change only if the app's encoding or the intent does.
 *
 *    npm run build && node scripts/serve.mjs --port 4237 --root dist      (in another shell)
 *    node scripts/showcase-capture.mjs --base http://127.0.0.1:4237 [--only europe-1914]
 *
 *  ⚠ NEEDS A SERVER AND THE NETWORK, so it is not a gate. `node scripts/landing.mjs --check` is the
 *  gate: it holds what this wrote to the intent, offline. tests/landing-showcase.spec.js then opens
 *  every captured link in a hermetic browser and asks the map whether it drew what the text says.
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { SHOWCASE } from '../js/showcase.js';
import { sharedIds } from '../js/layer-manifest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', null);
const ONLY = arg('--only', null);
if (!BASE) { console.error('usage: node scripts/showcase-capture.mjs --base http://127.0.0.1:<port> [--only <id>]'); process.exit(2); }

/* the picture: a 16:10 desktop frame — the size the landing page shows it at, twice over for a
   high-density screen, and the size social cards crop from. JPEG at 82 keeps each under ~250 kB. */
const VIEWPORT = { width: 1280, height: 800 };
const CARD = { width: 1200, height: 630 };   /* Open Graph's recommended 1.91:1 */
const IMG_DIR = 'img/showcase';
const FILE = join(ROOT, 'js/showcase.js');
const BEGIN = '/* ⚠ GENERATED SHOWCASE — BEGIN (node scripts/showcase-capture.mjs; DO NOT EDIT) */';
const END = '/* ⚠ GENERATED SHOWCASE — END */';

/* the seed the test suite uses (tests/helpers/session-seed.js): a returning reader's session, so the
   first-visit tour and the default-on heavy layers do not sit in the picture. Every share-carried
   layer is then set explicitly below, so the seed decides nothing that ends up in the link. */
const { seededStorageState } = await import('../tests/helpers/session-seed.js');

/** the session `at` names, as an instant — `setUTCFullYear` because Date.UTC maps years 0–99 to 19xx */
function instantOf(at) {
  const m = /^(-?\d{4,6})-(\d{2})-(\d{2})$/.exec(String(at));
  if (!m) throw new Error('showcase `at` is not YYYY-MM-DD: ' + at);
  return { y: +m[1], mo: +m[2] - 1, d: +m[3] };
}

async function capture(browser, s) {
  const storage = seededStorageState();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, serviceWorkers: 'block',
    storageState: { cookies: [], origins: storage.origins.map((o) => ({ ...o, origin: BASE })) } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { try { return !!window.__imap && window.IntMapGeoEngine.canDraw(); } catch (_) { return false; } }, null, { timeout: 90000 });

  /* projection and base map through their own buttons — the encoder reads HOST.proj / HOST.mapType */
  await page.evaluate(({ proj, base }) => {
    const click = (id) => { const b = document.getElementById(id); if (b) b.click(); };
    click(proj === 'g' ? 'btn-view-globe' : 'btn-view-flat');
    click(base === 'sat' ? 'btn-view-sat' : 'btn-view-map');
  }, { proj: s.view.proj, base: s.base });

  /* every layer a link can carry: exactly the declared ones on, everything else off */
  await page.evaluate(({ ids, want }) => {
    const W = new Set(want);
    for (const id of ids) {
      const cb = document.getElementById(id);
      if (!cb) continue;
      const on = W.has(id);
      if (cb.checked !== on) { cb.checked = on; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  }, { ids: sharedIds(), want: s.layers });
  const missing = await page.evaluate((want) => want.filter((id) => { const cb = document.getElementById(id); return !(cb && cb.checked); }), s.layers);
  if (missing.length) throw new Error(s.id + ': layer(s) could not be switched on: ' + missing.join(', '));

  /* the clock, then the camera LAST — a layer whose data lives in one region frames it once on its
     first activation (js/layer-home.js), and the example's own view must win over that */
  await page.waitForTimeout(1500);
  await page.evaluate((at) => {
    if (at == null) { window.IntMapTime.setNow({ source: 'ui' }); return; }
    const t = new Date(0); t.setUTCFullYear(at.y, at.mo, at.d); t.setUTCHours(12, 0, 0, 0);
    window.IntMapTime.set(t, { source: 'ui' });
  }, s.at == null ? null : instantOf(s.at));
  await page.waitForTimeout(1500);
  await page.evaluate((v) => { window.IntMapGeoEngine.camera.jumpTo({ center: [v.lng, v.lat], zoom: v.zoom, bearing: 0, pitch: 0 }); }, s.view);

  /* settle: nothing held back, then the network quiet for a moment (tiles, the era bundles) */
  await page.waitForFunction(() => { try { return window.IntMapGeoEngine.canDraw() && window.IntMapLayerHold.pending().length === 0; } catch (_) { return false; } }, null, { timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);
  /* the past-date notice (js/layer-time-kernel.js #data-legend-worldtime) is folded with ITS OWN
     minimise control, as a reader would — it stays on the map, one tap from open, and it is open
     again for anyone who follows the link (folding is not part of the link) */
  if (s.at != null) {
    await page.waitForSelector('#data-legend-worldtime .legend-min', { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => {
      const box = document.getElementById('data-legend-worldtime');
      const b = box && box.querySelector('.legend-min');
      if (b && !box.classList.contains('legend-collapsed')) b.click();
    });
    await page.waitForTimeout(600);
  }

  const link = await page.evaluate(() => window.IntMapBookmark.link());
  const hash = link.slice(link.indexOf('#'));
  /* ⚠ A LINK THAT SAYS MORE THAN THE INTENT IS NOT WRITTEN. The encoder also packs every registered
     simulator's state into `s=` (js/map-ui.js IntMapShareState), and MEASURED 2026-10-01 the ECMWF
     module (js/weather.js shareIO) writes its forecast hour whenever its index is off «now» — with no
     weather layer on at all — so one capture of ww2-1942 carried `s={"weatherEC":{"t":"2026-10-01T14:00Z"}}`
     and the next did not. An example declares no simulator state, so such a link is refused here
     (and by `node scripts/landing.mjs --check`) rather than shipped with a forecast hour nobody chose. */
  const extra = [...new URLSearchParams(hash.slice(1)).keys()].filter((k) => !['v', 'l', 'tt', 'sat'].includes(k));
  if (extra.length) { await ctx.close(); throw new Error(s.id + ': the app encoded state the example does not declare (' + extra.join(', ') + '): ' + hash); }
  mkdirSync(join(ROOT, IMG_DIR), { recursive: true });
  const image = IMG_DIR + '/' + s.id + '.jpg';
  await page.screenshot({ path: join(ROOT, image), type: 'jpeg', quality: 82 });
  /* the social card (og:image of s/<id>.html): 1200×630, the size Open Graph and X's large card ask for.
     The sidebar is folded with ITS OWN button first, so the card is the map; the camera does not move
     (folding is not part of the link, and the link above was read before it). */
  await page.evaluate(() => { const b = document.getElementById('btn-toggle-sidebar'); if (b) b.click(); });
  await page.waitForTimeout(900);
  const card = IMG_DIR + '/' + s.id + '-card.jpg';
  await page.screenshot({ path: join(ROOT, card), type: 'jpeg', quality: 82, clip: { x: (VIEWPORT.width - CARD.width) / 2, y: 85, width: CARD.width, height: CARD.height } });
  await ctx.close();
  if (errors.length) console.warn('  page errors while capturing ' + s.id + ':\n    ' + errors.join('\n    '));
  return { hash, image, card };
}

/* ── the generated region ─────────────────────────────────────────────────────────────────────── */
function readCaptured(src) {
  const a = src.indexOf(BEGIN), b = src.indexOf(END);
  if (a < 0 || b < 0) throw new Error('js/showcase.js: the generated region markers are gone');
  const body = src.slice(a + BEGIN.length, b);
  const m = /export const CAPTURED = (\{[\s\S]*\});/.exec(body);
  return m ? JSON.parse(m[1]) : {};
}
function writeCaptured(src, captured) {
  const a = src.indexOf(BEGIN), b = src.indexOf(END);
  const ordered = {};
  for (const s of SHOWCASE) if (captured[s.id]) ordered[s.id] = captured[s.id];
  const json = JSON.stringify(ordered, null, 2);
  return src.slice(0, a + BEGIN.length) + '\nexport const CAPTURED = ' + json + ';\n' + src.slice(b);
}

const src = readFileSync(FILE, 'utf8');
const captured = readCaptured(src);
const browser = await chromium.launch();
try {
  for (const s of SHOWCASE) {
    if (ONLY && s.id !== ONLY) continue;
    process.stdout.write('capturing ' + s.id + ' … ');
    captured[s.id] = await capture(browser, s);
    console.log(captured[s.id].hash);
  }
} finally { await browser.close(); }
/* keep the file's own line endings */
const eol = src.includes('\r\n') ? '\r\n' : '\n';
writeFileSync(FILE, writeCaptured(src, captured).replace(/\r?\n/g, eol));
console.log('wrote ' + Object.keys(captured).length + ' captured example(s) into js/showcase.js');
