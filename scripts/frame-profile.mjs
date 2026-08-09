/* ============================================================================
 *  IntMap · THE FRAME-TIME INSTRUMENT  (#R209)
 * ----------------------------------------------------------------------------
 *  「地図のホバー、ズームのfpsを劇的に高くしろ。」
 *
 *  #R203 tried two fps hypotheses and MEASURED BOTH WORSE. #R206 shipped a prefetch fix and could
 *  not see it at all (23.4 ms vs 23.3 ms). #R208 wrote a fix, measured it worse, and took it back
 *  out. Three rounds of that is not bad luck — it is what happens when the instrument is weaker
 *  than the effect, and #R208 §15b said so plainly: the profiler pulled tiles from the real
 *  network, so radio variance swamped everything.
 *
 *  So this round measured the instrument before the subject (#R202's lesson, for the third time).
 *  This file is what came out of it. It is a standalone node runner and NOT a *.spec.js, on purpose:
 *  a spec would join the tier lists, the shard plan and the 5,201 s budget, and a measurement is not
 *  a gate.
 *
 *  ── WHAT MAKES IT AN A/B INSTRUMENT ────────────────────────────────────────────────────────────
 *   1. EVERY BYTE COMES OFF DISK. A replay cache keyed by URL answers each tile, glyph and sprite
 *      with the same bytes every run; a miss is fetched once and stored. Verified separately that
 *      `context.route` DOES intercept fetches issued from inside a dedicated Worker, so the
 *      satellite path (#R205 moved it into src/sat-worker.js) is covered — R205's "0 resource
 *      entries" was a fact about page-side observability, not about interception.
 *      ⚠ The fixtures are REAL images. Answering with synthetic bytes deletes the JPEG decode and
 *      the texture upload, which #R206 measured as 58.4 % of a satellite frame — an instrument built
 *      that way measures a different machine from the one the user is complaining about.
 *   2. THE FIRST TWO REPS ARE THROWN AWAY, MEASURED RATHER THAN ASSUMED. On a cold cache the first
 *      replay lands a whole vsync quantum slower (33.3 vs 16.7 ms median). After a build whose
 *      chunk hashes changed, the cache is cold again — which is exactly how this round nearly
 *      recorded an 8.0 s boot regression that was 4.7 s once the new hashes were in the cache.
 *   3. THE MEDIAN IS NOT THE STATISTIC. A frame either makes the vsync deadline or waits for the
 *      next one, so the median can only take the values 16.7 / 33.3 / 50.0 and moves in steps.
 *      MEAN and p95 move continuously; measured across four warm reps they held inside ±2 %.
 *   4. A/B IS ALTERNATED BY THE HARNESS, NOT BY DISCIPLINE — ABAB…, reporting the median of the
 *      PAIRED differences. #R206 watched a control leave at 24.4 ms and come back at 20.8; paired
 *      differences cancel that drift, "n of A then n of B" does not.
 *   5. AN A-VS-A NULL RUN IS MANDATORY and prints the noise floor. If |Δ(A,B)| ≤ |Δ(A,A)| the run
 *      says "no measurable difference" and refuses to name a winner.
 *
 *  ⚠ AND THE HARNESS SETS A MOBILE USER-AGENT, WHICH IS NOT A DETAIL. This repo has TWO definitions
 *  of "mobile": width-based (`matchMedia('(max-width:768px)')`, js/app-body.js) and UA-based
 *  (js/gazetteer.js's 12,000-row cap, js/sat-proto.js's tile caches, the image-concurrency cap).
 *  A 390×844 viewport alone takes the DESKTOP branch for all three — #R208 §15b's "mobile" profile
 *  registered all 147,924 gazetteer rows instead of 12,000, which is visible in its own slice
 *  counts (37 = ceil(147924/4000), not ceil(12000/4000) = 3).
 *
 *  USAGE
 *    node scripts/frame-profile.mjs --boot            start-up: first draw, FCP, JS bytes
 *    node scripts/frame-profile.mjs --sweep           frame time over a scripted zoom + hover
 *    …with  --desktop | --mobile (default)  --sat  --cpu N  --net fast4g|slow4g|none  --reps N
 *           --base http://127.0.0.1:4173   --cache <dir>   --record (allow cache misses to fetch)
 * ==========================================================================*/
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = require(join(ROOT, 'node_modules', 'playwright-core', 'index.js'));

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

const CACHE = val('--cache', join(ROOT, '.frame-cache'));
const BASE = val('--base', 'http://127.0.0.1:4173');
const MOBILE = !has('--desktop');
const SAT = has('--sat');
const CPU = Number(val('--cpu', MOBILE ? 4 : 1));
const REPS = Number(val('--reps', 5));
const NET = val('--net', 'none');
const RECORD = has('--record');

/* An iPhone 13's UA — see the header: three mobile caps in this app are gated on it, not on width. */
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const NETS = {
  none: null,
  fast4g: { downloadThroughput: (9000 * 1024) / 8, uploadThroughput: (1500 * 1024) / 8, latency: 85 },
  slow4g: { downloadThroughput: (1600 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 300 },
};

mkdirSync(CACHE, { recursive: true });
const key = (u) => createHash('sha1').update(u).digest('hex');
const stats = { hit: 0, miss: 0, blocked: 0 };

async function replay(route) {
  const u = route.request().url();
  if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
  const k = join(CACHE, key(u));
  if (existsSync(k + '.json')) {
    stats.hit++;
    const meta = JSON.parse(readFileSync(k + '.json', 'utf8'));
    if (meta.failed) { stats.blocked++; return route.abort('blockedbyclient'); }
    return route.fulfill({ status: meta.status, headers: { ...meta.headers, 'access-control-allow-origin': '*' }, body: readFileSync(k + '.bin') });
  }
  stats.miss++;
  if (!RECORD) { stats.blocked++; return route.abort('blockedbyclient'); }
  try {
    const res = await route.fetch({ timeout: 20_000 });
    const body = await res.body(); const h = res.headers();
    delete h['content-encoding']; delete h['content-length'];
    writeFileSync(k + '.bin', body);
    writeFileSync(k + '.json', JSON.stringify({ status: res.status(), headers: h }));
    return route.fulfill({ status: res.status(), headers: { ...h, 'access-control-allow-origin': '*' }, body });
  } catch {
    writeFileSync(k + '.json', JSON.stringify({ failed: true }));
    writeFileSync(k + '.bin', Buffer.alloc(0));
    return route.abort('blockedbyclient');
  }
}

async function newContext(browser) {
  /* ⚠ set explicitly rather than inherited: playwright.config.js's `use` only reaches contexts the
     test runner creates, and `serviceWorkers` is the one that made #R206 blind — a warm sw.js
     answers every tile from Cache Storage, so both arms of an A/B see zero network by construction. */
  const ctx = await browser.newContext({
    serviceWorkers: 'block',
    viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: MOBILE ? 3 : 1,
    isMobile: MOBILE, hasTouch: MOBILE,
    userAgent: MOBILE ? MOBILE_UA : undefined,
    timezoneId: 'UTC', locale: 'en-US',
  });
  await ctx.route('**/*', replay);
  return ctx;
}
async function throttle(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  if (NETS[NET]) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NETS[NET] }); }
  return cdp;
}
/* ⚠ `/?rafshim=1` replaces requestAnimationFrame with a 33 ms timer (index.html) and
   tests/helpers/engine.js supplies it BY DEFAULT — reusing that helper here would silently make
   every answer 33 ms. Load the bare URL and assert the shim is absent rather than trusting it. */
async function open(ctx) {
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.IntMapGeoEngine && window.IntMapGeoEngine.canDraw && window.IntMapGeoEngine.canDraw(), null, { timeout: 120_000 });
  const shimmed = await page.evaluate(() => /rafshim=1/.test(location.search) || String(requestAnimationFrame).includes('setTimeout'));
  if (shimmed) throw new Error('the rAF shim is installed — every frame time would be a 33 ms timer, not the renderer');
  return page;
}

const q = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * p)))];
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

async function sweep(page) {
  return page.evaluate(async () => {
    const E = window.IntMapGeoEngine;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    E.camera.jumpTo({ center: [139.767, 35.681], zoom: 9, pitch: 0, bearing: 0 });
    await sleep(2500);
    const frames = []; let last = performance.now(), stop = false;
    const tick = (t) => { frames.push(t - last); last = t; if (!stop) requestAnimationFrame(tick); };
    requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); });
    const steps = [];
    for (let z = 9; z <= 13; z += 0.25) steps.push(z);
    for (let z = 13; z >= 9; z -= 0.25) steps.push(z);
    for (const z of steps) {
      const c = E.camera.get();
      E.camera.jumpTo({ center: c.center, zoom: z, pitch: c.pitch, bearing: c.bearing });
      await sleep(50);
    }
    const cv = document.querySelector('#map canvas');
    if (cv) {
      const r = cv.getBoundingClientRect();
      for (let i = 0; i <= 40; i++) {
        cv.dispatchEvent(new MouseEvent('mousemove', {
          clientX: r.left + (r.width * i) / 40,
          clientY: r.top + r.height * (0.35 + 0.3 * Math.sin(i / 3)), bubbles: true,
        }));
        await sleep(25);
      }
    }
    stop = true; await sleep(100);
    const f = frames.slice(5).filter((x) => x > 0 && x < 5000).sort((a, b) => a - b);
    return { frames: f, gazetteer: (window.IntMapNewsGeo && window.IntMapNewsGeo.size) ? window.IntMapNewsGeo.size() : null };
  });
}

async function runSweep() {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });   /* #R202: the real GPU, not SwiftShader */
  const rows = [];
  for (let i = 0; i < REPS + 2; i++) {
    const ctx = await newContext(browser);
    const p = await open(ctx);
    await throttle(ctx, p);
    if (SAT) { await p.evaluate(() => { const b = document.getElementById('btn-view-sat'); if (b) b.click(); }); await p.waitForTimeout(6000); }
    const f = (await sweep(p)).frames;
    rows.push({ mean: +avg(f).toFixed(2), p95: +q(f, 0.95).toFixed(2), median: +q(f, 0.5).toFixed(2), n: f.length });
    console.log(`  rep${i + 1}${i < 2 ? ' (warm-up)' : '         '}  mean ${String(rows[i].mean).padStart(7)} ms  p95 ${String(rows[i].p95).padStart(7)}  median ${String(rows[i].median).padStart(6)}  frames ${rows[i].n}`);
    await ctx.close();
  }
  const keep = rows.slice(2);
  const m = keep.map((r) => r.mean), p = keep.map((r) => r.p95);
  const spread = (a) => (((Math.max(...a) - Math.min(...a)) / avg(a)) * 100).toFixed(1);
  console.log(`\nSWEEP  mobile=${MOBILE} sat=${SAT} cpu=${CPU}  MEAN ${avg(m).toFixed(2)} ms (±${spread(m)}%)  p95 ${avg(p).toFixed(2)} ms (±${spread(p)}%)  n=${keep.length}`);
  console.log(`cache: ${stats.hit} replayed, ${stats.miss} missed, ${stats.blocked} blocked${stats.miss && !RECORD ? '  ⚠ MISSES WERE BLOCKED — re-run once with --record to fill the cache, or the map drew less than it should have' : ''}`);
  await browser.close();
}

async function runBoot() {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });
  const rows = [];
  for (let i = 0; i < REPS + 2; i++) {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await throttle(ctx, page);
    const t0 = Date.now();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180_000 });
    const tDom = Date.now() - t0;
    await page.waitForFunction(() => window.IntMapGeoEngine && window.IntMapGeoEngine.canDraw && window.IntMapGeoEngine.canDraw(), null, { timeout: 180_000 });
    const tDraw = Date.now() - t0;
    const d = await page.evaluate(() => {
      const js = performance.getEntriesByType('resource').filter((r) => /\.js(\?|$)/.test(r.name));
      return {
        jsFiles: js.length, jsBytes: Math.round(js.reduce((s, r) => s + (r.encodedBodySize || 0), 0) / 1024),
        fcp: Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0),
      };
    });
    rows.push({ tDom, tDraw, ...d });
    console.log(`  rep${i + 1}${i < 2 ? ' (warm-up)' : '         '}  first draw ${String(tDraw).padStart(6)} ms  DOM ${String(tDom).padStart(6)}  FCP ${String(d.fcp).padStart(5)}  JS ${d.jsFiles} files / ${d.jsBytes} kB`);
    await ctx.close();
  }
  const keep = rows.slice(2);
  const mean = (f) => Math.round(avg(keep.map((r) => r[f])));
  console.log(`\nBOOT  mobile=${MOBILE} cpu=${CPU} net=${NET}  first draw ${mean('tDraw')} ms · FCP ${mean('fcp')} ms · DOM ${mean('tDom')} ms · JS ${mean('jsBytes')} kB over ${keep[0].jsFiles} files`);
  console.log(`cache: ${stats.hit} replayed, ${stats.miss} missed, ${stats.blocked} blocked`);
  await browser.close();
}

if (has('--boot')) await runBoot();
else await runSweep();
