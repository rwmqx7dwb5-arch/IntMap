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
 *  ── (#R311) THREE THINGS THE INSTRUMENT COULD NOT SEE ──────────────────────────────────────────
 *  「first map pixel」と「interaction-ready」を分けて測れ、long taskを数えろ、メモリを測れ.
 *  `--boot` reported first draw, FCP and JS bytes. None of those is when the app becomes USABLE:
 *  the launch screen is dismissed by real milestones (index.html's __imBoot), and the gap between
 *  the first painted map and that moment is where a startup regression hides. So --boot now also
 *  records __imBoot's own milestones, the long tasks the main thread ran while booting (a
 *  PerformanceObserver installed before the first script — buffered:true is not enough, `longtask`
 *  entries predate any observer added later), and the heap after a forced collection.
 *
 *  `--mem` is new and answers a different question: 「機能を10回開閉しても、heapとresource数が
 *  一方向に増え続けないこと」. It drives the app through window.IntMapOS — the same commands the
 *  buttons and Atlas run, never a private entry point (#R304's lesson, four times over) — and
 *  reports heap, DOM nodes and listeners after each cycle, each preceded by a real GC.
 *
 *  USAGE
 *    node scripts/frame-profile.mjs --boot            start-up: first draw, ready, long tasks, heap
 *    node scripts/frame-profile.mjs --sweep           frame time over a scripted zoom + hover
 *    node scripts/frame-profile.mjs --mem             heap / nodes / listeners over N open-close cycles
 *    node scripts/frame-profile.mjs --commands       renderer commands per phase: attempted vs already-there
 *    node scripts/frame-profile.mjs --lifecycle      activate/suspend x10 then dispose, per capability
 *    node scripts/frame-profile.mjs --attribute --base http://127.0.0.1:5173
 *                                                     self time per js/ file over the boot (dev server)
 *    …with  --desktop | --mobile (default)  --sat  --cpu N  --net fast4g|slow4g|none  --reps N
 *           --base http://127.0.0.1:4173   --cache <dir>   --record (allow cache misses to fetch)
 *           --cycles N (--mem, default 10)   --cmd a,b (--mem, the OS commands to alternate)
 *           --json <path>  write the run as JSON as well as printing it
 * ==========================================================================*/
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  /* (#R311) ⚠ BEFORE THE FIRST SCRIPT, not inside the page afterwards. `longtask` entries are not
     kept in the performance buffer the way marks are, so an observer created after boot sees an
     empty list and would report "0 long tasks" for a boot that stalled the main thread for a
     second. addInitScript runs in every new document ahead of everything else. */
  await ctx.addInitScript(() => {
    window.__imLT = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__imLT.push(Math.round(e.duration)); })
        .observe({ type: 'longtask', buffered: true });
    } catch (_) { /* Safari has no longtask observer; the number is simply absent there */ }
  });
  return ctx;
}
async function throttle(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  if (NETS[NET]) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NETS[NET] }); }
  try { await cdp.send('Performance.enable'); } catch (_) {}
  /* ══ ⚠ (#R311) A NEW CONTEXT IS NOT A COLD BROWSER ══════════════════════════════════════════════
     `browser.newContext()` gives a fresh cookie jar and a fresh Cache Storage, but Chromium's HTTP
     cache is per PROCESS, so the app's own chunks stay cached across reps. MEASURED: inside a single
     five-rep run the same page fetched 3,282 kB of JS in one rep and 1,792 kB in the next, and
     "first draw" moved by half a second with it. Two builds compared under that are not being
     compared at all — the arms differ by which reps happened to be warm.
     `--boot` therefore disables the HTTP cache unless `--warm` says otherwise: a start-up
     measurement is a COLD-start measurement, and the returning-visitor case is a different question
     that has to be asked deliberately. It does NOT weaken the replay cache — third-party bytes still
     come off disk through route(), which is what makes the external half deterministic. */
  if (!has('--warm')) {
    try { await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); } catch (_) {}
  }
  return cdp;
}
/* (#R311) heap AFTER a real collection — `usedJSHeapSize` without one measures garbage that has
   not been swept yet, which drifts by tens of MB between runs and hides the trend --mem looks for.
   Nodes / JSEventListeners / Documents come from the same call: a leak that keeps a detached
   subtree alive shows up in Nodes long before it is visible in the heap total. */
async function heap(cdp) {
  try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) {}
  let m = { metrics: [] };
  try { m = await cdp.send('Performance.getMetrics'); } catch (_) {}
  const g = (n) => (m.metrics.find((x) => x.name === n) || {}).value || 0;
  return {
    heapMB: +(g('JSHeapUsedSize') / 1048576).toFixed(2),
    nodes: g('Nodes'), listeners: g('JSEventListeners'), documents: g('Documents'),
  };
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
    const cdp = await throttle(ctx, page);
    const t0 = Date.now();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180_000 });
    const tDom = Date.now() - t0;
    await page.waitForFunction(() => window.IntMapGeoEngine && window.IntMapGeoEngine.canDraw && window.IntMapGeoEngine.canDraw(), null, { timeout: 180_000 });
    const tDraw = Date.now() - t0;
    /* (#R311) …and then the milestone the READER waits for. The launch screen covers the map until
       __imBoot decides the app is up, so "first draw" is not "usable". A boot that never signals is
       recorded as such rather than throwing — index.html's own failsafe reveals the app at 20 s. */
    let ready = null;
    try {
      await page.waitForFunction(() => window.__imBoot && window.__imBoot.isDone(), null, { timeout: 60_000 });
      ready = Date.now() - t0;
    } catch (_) { /* left null — printed as "—" */ }
    const d = await page.evaluate(() => {
      const res = performance.getEntriesByType('resource');
      const js = res.filter((r) => /\.js(\?|$)/.test(r.name));
      const lt = (window.__imLT || []).slice();
      return {
        jsFiles: js.length, jsBytes: Math.round(js.reduce((s, r) => s + (r.encodedBodySize || 0), 0) / 1024),
        reqs: res.length,
        fcp: Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0),
        lt50: lt.filter((x) => x >= 50).length, lt100: lt.filter((x) => x >= 100).length,
        ltMax: lt.length ? Math.max(...lt) : 0, ltTotal: lt.reduce((a, b) => a + b, 0),
        marks: (window.__imBoot && window.__imBoot.marks) ? window.__imBoot.marks() : {},
      };
    });
    const h = await heap(cdp);
    rows.push({ tDom, tDraw, ready, ...d, ...h });
    console.log(`  rep${i + 1}${i < 2 ? ' (warm-up)' : '         '}  draw ${String(tDraw).padStart(6)} ms  ready ${String(ready ?? '—').padStart(6)}  FCP ${String(d.fcp).padStart(5)}  JS ${d.jsFiles}f/${d.jsBytes}kB  reqs ${String(d.reqs).padStart(3)}  LT ${d.lt50}/${d.lt100} max ${String(d.ltMax).padStart(4)}  heap ${String(h.heapMB).padStart(6)} MB`);
    await ctx.close();
  }
  const keep = rows.slice(2);
  const mean = (f) => Math.round(avg(keep.map((r) => r[f] || 0)));
  const meanF = (f) => +avg(keep.map((r) => r[f] || 0)).toFixed(2);
  console.log(`\nBOOT  mobile=${MOBILE} cpu=${CPU} net=${NET}  first draw ${mean('tDraw')} ms · ready ${mean('ready')} ms · FCP ${mean('fcp')} ms · DOM ${mean('tDom')} ms`);
  console.log(`      JS ${mean('jsBytes')} kB over ${keep[0].jsFiles} files · ${mean('reqs')} requests · long tasks ${meanF('lt50')}≥50ms ${meanF('lt100')}≥100ms max ${mean('ltMax')} ms total ${mean('ltTotal')} ms`);
  console.log(`      heap ${meanF('heapMB')} MB · ${mean('nodes')} nodes · ${mean('listeners')} listeners`);
  console.log(`      milestones (last rep): ${JSON.stringify(keep[keep.length - 1].marks)}`);
  console.log(`cache: ${stats.hit} replayed, ${stats.miss} missed, ${stats.blocked} blocked`);
  writeJson({ mode: 'boot', mobile: MOBILE, cpu: CPU, net: NET, reps: keep });
  await browser.close();
}

/* ── (#R311) --mem: does closing a feature give the memory back? ────────────
   「機能を10回開閉しても、heapとresource数が一方向に増え続けないことを確認してください。」
   Driven through IntMapOS.exec, which is the SAME path the button and Atlas take — measuring a
   private entry point measures code the app never runs (#R304 §r184-drone). A pair of commands is
   alternated `cycles` times; heap, nodes and listeners are read after a forced GC each time, and
   the verdict is the SLOPE across the second half (the first cycles legitimately allocate caches
   that a re-open is supposed to reuse — a flat line after warm-up is the property, not a flat line
   from the first cycle). */
async function runMem() {
  const CYCLES = Number(val('--cycles', 10));
  const pair = String(val('--cmd', 'view.base.sat,view.base.map')).split(',').map((s) => s.trim()).filter(Boolean);
  const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });
  const ctx = await newContext(browser);
  const page = await open(ctx);
  const cdp = await throttle(ctx, page);
  const known = await page.evaluate(() => (window.IntMapOS && window.IntMapOS.list) ? window.IntMapOS.list() : []);
  const missing = pair.filter((c) => !known.includes(c));
  if (missing.length) { console.log(`⚠ not registered commands, nothing was exercised: ${missing.join(', ')}\n  available: ${known.join(' ')}`); await browser.close(); return; }
  await page.waitForTimeout(4000);
  const base = await heap(cdp);
  console.log(`  baseline            heap ${String(base.heapMB).padStart(7)} MB  nodes ${String(base.nodes).padStart(6)}  listeners ${String(base.listeners).padStart(5)}`);
  const rows = [];
  for (let i = 0; i < CYCLES; i++) {
    for (const cmd of pair) {
      await page.evaluate((c) => window.IntMapOS.exec(c, { source: 'ui' }), cmd);
      await page.waitForTimeout(1200);
    }
    const h = await heap(cdp);
    rows.push(h);
    console.log(`  cycle ${String(i + 1).padStart(2)}            heap ${String(h.heapMB).padStart(7)} MB  nodes ${String(h.nodes).padStart(6)}  listeners ${String(h.listeners).padStart(5)}`);
  }
  const half = rows.slice(Math.floor(rows.length / 2));
  const slope = (f) => +((half[half.length - 1][f] - half[0][f]) / Math.max(1, half.length - 1)).toFixed(2);
  console.log(`\nMEM  ${pair.join(' ⇄ ')} ×${CYCLES}  drift per cycle over the second half: heap ${slope('heapMB')} MB · nodes ${slope('nodes')} · listeners ${slope('listeners')}`);
  console.log(`     total since baseline: heap ${(rows[rows.length - 1].heapMB - base.heapMB).toFixed(2)} MB · nodes ${rows[rows.length - 1].nodes - base.nodes} · listeners ${rows[rows.length - 1].listeners - base.listeners}`);
  writeJson({ mode: 'mem', cmds: pair, cycles: CYCLES, baseline: base, rows });
  await browser.close();
}

/* ── (#R311) --attribute: WHICH FILE spends the boot ───────────────────────
   「profiler上の証拠」. A CPU profile of the interval from navigation to the moment __imBoot
   declares the app up, aggregated as SELF time per script URL and per function.

   ⚠ POINT IT AT THE DEV SERVER (`npm run dev`, --base http://127.0.0.1:5173). In a production
   build every js/ file is inside one hashed chunk, so every sample says `main-XXXX.js` and the
   answer is "the bundle" — true and useless. Vite's dev server serves each module at its own URL,
   which is what turns a sample into a file name. That makes this an ATTRIBUTION instrument, not a
   timing one: dev is unminified and unbundled, so the absolute milliseconds are NOT the production
   milliseconds and must not be quoted as such. What transfers is the RANKING. */
async function runAttribute() {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const cdp = await throttle(ctx, page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180_000 });
  try { await page.waitForFunction(() => window.__imBoot && window.__imBoot.isDone(), null, { timeout: 120_000 }); }
  catch (_) { console.log('  ⚠ never became ready — profiling what it did in the time it had'); }
  const { profile } = await cdp.send('Profiler.stop');

  /* self time = (hits on this node) × (average sample interval over the whole profile) */
  const total = profile.endTime - profile.startTime;
  const hits = profile.nodes.reduce((a, n) => a + (n.hitCount || 0), 0) || 1;
  const per = total / hits / 1000;
  const byUrl = new Map(); const byFn = new Map();
  for (const n of profile.nodes) {
    const h = n.hitCount || 0; if (!h) continue;
    const cf = n.callFrame || {};
    const url = (cf.url || '(no url)').replace(/^https?:\/\/[^/]+/, '').split('?')[0] || '(inline)';
    byUrl.set(url, (byUrl.get(url) || 0) + h * per);
    const fn = `${cf.functionName || '(anonymous)'}  ${url}:${(cf.lineNumber ?? -1) + 1}`;
    byFn.set(fn, (byFn.get(fn) || 0) + h * per);
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  console.log(`\nATTRIBUTION  ${(total / 1000).toFixed(0)} ms of wall clock, ${hits} samples, cpu=${CPU}, base=${BASE}`);
  console.log('\n  self time by script:');
  for (const [u, ms] of top(byUrl, 30)) console.log(`   ${ms.toFixed(1).padStart(8)} ms  ${u}`);
  console.log('\n  self time by function:');
  for (const [f, ms] of top(byFn, 25)) console.log(`   ${ms.toFixed(1).padStart(8)} ms  ${f}`);
  writeJson({ mode: 'attribute', base: BASE, totalMs: total / 1000, byUrl: top(byUrl, 200), byFn: top(byFn, 200) });
  await browser.close();
}

function writeJson(obj) {
  const p = val('--json', null);
  if (!p) return;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj, null, 2));
  console.log(`  → ${p}`);
}

/* ── (#R315) --commands: HOW MANY RENDERER COMMANDS SAY NOTHING NEW ─────────
   「MapLibreへ同じ命令を繰り返す無駄を、実測に基づいて消す」 — and the first half of that
   sentence is a measurement, not an assumption. The adapter tallies every setSourceData /
   setFilter / setPaint / setLayout / setFeatureState it is handed, and marks each one
   `applied` or `same` using the SAME comparison MapLibre uses internally (js/geo-engine.js).
   This drives the app through named phases and reads the tally after each, so a cache is
   only ever added to an operation that was shown to repeat itself.

   ⚠ The phase is DECLARED here, not inferred in the adapter: nothing inside a setPaint call
   can know whether it is happening because the language changed or because the map moved.
   A phase that could not be driven is reported as `ran:false` rather than as zero — a
   scenario that did not happen is not a scenario that cost nothing. */
async function runCommands() {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const SKIP = val('--skip', null);   /* e.g. --skip sourceData   → the OTHER arm of the A/B */
  await page.goto(BASE + '/?cmdlog=1' + (SKIP ? '&cmdskip=' + SKIP : ''), { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.IntMapGeoEngine && window.IntMapGeoEngine.canDraw && window.IntMapGeoEngine.canDraw(), null, { timeout: 120_000 });
  await throttle(ctx, page);
  const cfg = await page.evaluate(() => window.IntMapGeoEngine.render.commandConfig());
  if (!cfg || !cfg.on) { await browser.close(); throw new Error('the command log did not switch on — ?cmdlog=1 was not honoured'); }

  /* settle, then take the boot slice */
  await page.waitForTimeout(6000);
  const phases = [];
  const take = async (name) => {
    const r = await page.evaluate(() => {
      const s = window.IntMapGeoEngine.render.commands();
      window.IntMapGeoEngine.render.commandsReset();
      return s;
    });
    /* top rows PER OPERATION — a single global slice sorted by `same` hides setSourceData
       entirely, because that operation never reports `same` until a skip is switched on. */
    const per = {};
    for (const row of (r.byId || [])) (per[row.op] || (per[row.op] = [])).push(row);
    const byId = [];
    for (const op of Object.keys(per)) byId.push(...per[op].sort((x, y) => y.attempted - x.attempted).slice(0, 10));
    return { phase: name, ran: true, totals: r.totals, byId };
  };
  const mark = (name) => page.evaluate((n) => window.IntMapGeoEngine.render.commandConfig({ phase: n }), name);

  phases.push(await take('boot'));

  const step = async (name, fn, settle = 2500) => {
    await mark(name);
    let ran = true;
    try { ran = await page.evaluate(fn); } catch (e) { ran = false; }
    await page.waitForTimeout(settle);
    const r = await take(name);
    r.ran = ran !== false;
    phases.push(r);
  };

  await step('pan', async () => {
    const E = window.IntMapGeoEngine; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    E.camera.jumpTo({ center: [2.35, 48.86], zoom: 5, pitch: 0, bearing: 0 }); await sleep(1200);
    for (let i = 0; i < 12; i++) { const c = E.camera.get(); E.camera.jumpTo({ center: [c.center.lng + 1.5, c.center.lat], zoom: c.zoom, pitch: c.pitch, bearing: c.bearing }); await sleep(120); }
    return true;
  });
  await step('zoom', async () => {
    const E = window.IntMapGeoEngine; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let z = 5; z <= 9; z += 0.5) { const c = E.camera.get(); E.camera.jumpTo({ center: c.center, zoom: z, pitch: c.pitch, bearing: c.bearing }); await sleep(120); }
    for (let z = 9; z >= 5; z -= 0.5) { const c = E.camera.get(); E.camera.jumpTo({ center: c.center, zoom: z, pitch: c.pitch, bearing: c.bearing }); await sleep(120); }
    return true;
  });
  await step('layerPanel', async () => {
    const b = document.getElementById('btn-layers'); if (!b) return false; b.click();
    await new Promise((r) => setTimeout(r, 900)); b.click(); return true;
  });
  await step('hover', async () => {
    const cv = document.querySelector('#map canvas'); if (!cv) return false;
    const r = cv.getBoundingClientRect(); const sleep = (ms) => new Promise((z) => setTimeout(z, ms));
    for (let i = 0; i <= 30; i++) {
      cv.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + (r.width * i) / 30, clientY: r.top + r.height * (0.35 + 0.3 * Math.sin(i / 3)), bubbles: true }));
      await sleep(60);
    }
    return true;
  }, 1500);
  await step('chronos', async () => {
    if (!(window.IntMapTime && window.IntMapTime.setYear)) return false;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.IntMapTime.setYear(1995, { source: 'perf' }); await sleep(1500);
    window.IntMapTime.setNow({ source: 'perf' }); return true;
  }, 3500);
  await step('language', async () => {
    const s = document.getElementById('setting-lang'); if (!s) return false;
    const was = s.value;
    const opts = Array.from(s.options).map((o) => o.value);
    const other = opts.find((v) => v !== was);
    if (!other) return false;
    s.value = other; s.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 1800));
    s.value = was; s.dispatchEvent(new Event('change', { bubbles: true })); return true;
  }, 3500);
  await step('theme', async () => {
    const s = document.getElementById('setting-theme'); if (!s) return false;
    const was = s.value, opts = Array.from(s.options).map((o) => o.value);
    const other = opts.find((v) => v !== was); if (!other) return false;
    s.value = other; s.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 1800));
    s.value = was; s.dispatchEvent(new Event('change', { bubbles: true })); return true;
  }, 3500);

  const grand = {};
  for (const k of ['sourceData', 'filter', 'paint', 'layout', 'featureState']) grand[k] = { attempted: 0, sent: 0, applied: 0, same: 0, absent: 0, sameRef: 0, sameShape: 0, sameContent: 0, repeatBytes: 0, msCall: 0, msCmp: 0 };
  for (const p of phases) for (const k in p.totals) for (const f in grand[k]) grand[k][f] += p.totals[k][f] || 0;

  console.log('\nRENDERER COMMANDS  (attempted / sent / redundant / absent)   skip=' + JSON.stringify(cfg.skip));
  for (const p of phases) {
    const parts = Object.keys(p.totals).filter((k) => p.totals[k].attempted)
      .map((k) => `${k} ${p.totals[k].attempted}/${p.totals[k].sent}/${p.totals[k].same}/${p.totals[k].absent}`);
    console.log(`  ${p.phase.padEnd(11)}${p.ran ? '' : '(NOT DRIVEN) '}${parts.join('  ') || '—'}`);
  }
  console.log('  ' + '─'.repeat(70));
  for (const k of Object.keys(grand)) {
    const g = grand[k];
    if (!g.attempted) { console.log(`  ${k.padEnd(13)} 0 calls`); continue; }
    const extra = (k === 'sourceData') ? `  sameRef ${g.sameRef}  sameShape ${g.sameShape}  sameContent ${g.sameContent} (${(100 * g.sameContent / g.attempted).toFixed(1)}%, ${(g.repeatBytes / 1048576).toFixed(2)} MB re-sent)` : '';
    console.log(`  ${k.padEnd(13)} attempted ${String(g.attempted).padStart(6)}   SENT ${String(g.sent).padStart(6)}   redundant ${String(g.same).padStart(6)} (${(100 * g.same / g.attempted).toFixed(1)}%)   absent ${g.absent}   ms call ${g.msCall.toFixed(1)} + cmp ${g.msCmp.toFixed(1)}${extra}`);
  }
  console.log(`cache: ${stats.hit} replayed, ${stats.miss} missed, ${stats.blocked} blocked`);
  writeJson({ mode: 'commands', base: BASE, mobile: MOBILE, cpu: CPU, sat: SAT, cfg, phases, grand, cache: { ...stats } });
  await browser.close();
}

/* ── (#R315) --lifecycle: DOES CLOSING IT GIVE ANYTHING BACK, AND CAN IT BE OPENED AGAIN ───
   `--mem` (#R311) asks the same question of a pair of IntMapOS commands. The three capabilities
   connected this round have no OS command — they are reached from the Layers panel and from
   Atlas — but they DO have a register entry now, and the register is the public owner: the
   panel's own `open()` goes through `activate` (see js/tsunami.js openPublic). So this drives
   the same door the reader does, N times, and then asks for the resources back.

   Three things are counted that a heap number alone cannot separate:
     · the runtime's own registers (frame tasks, camera subscribers, timers) — a feature that
       forgot to unsubscribe shows here one cycle after it happens, not fifty MB later;
     · DOM nodes and listeners — a detached subtree kept alive is visible here long before the
       heap total moves;
     · whether `activate` works AFTER `dispose`. That is the failure this round found in the
       register itself, and a memory test that never re-opens would have passed over it. */
async function runLifecycle() {
  const CYCLES = Number(val('--cycles', 10));
  const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });
  const ctx = await newContext(browser);
  const page = await open(ctx);
  const cdp = await throttle(ctx, page);

  /* two of the three live behind the lazy loader; nothing defines a capability it has not loaded */
  await page.evaluate(async () => {
    await Promise.all([window.IntMapLazy.need('tsunami'), window.IntMapLazy.need('satellitesLive')]);
  });
  await page.waitForTimeout(3000);

  const caps = await page.evaluate(() => (window.IntMapRuntime ? window.IntMapRuntime.capabilities() : []));
  console.log(`\nLIFECYCLE  capabilities registered: ${caps.join(', ') || '(none)'}`);
  const want = ['wx.wind', 'sim.tsunami', 'sat.live'].filter((c) => caps.includes(c));
  const absent = ['wx.wind', 'sim.tsunami', 'sat.live'].filter((c) => !caps.includes(c));
  if (absent.length) console.log(`  ⚠ NOT REGISTERED, nothing was exercised for: ${absent.join(', ')}`);

  const snap = async () => {
    const h = await heap(cdp);
    const rt = await page.evaluate(() => {
      const s = window.IntMapRuntime.stats();
      const E = window.IntMapGeoEngine;
      const st = E.render.sceneStats() || {};
      return {
        frameReads: s.reads, frameWrites: s.writes, camera: s.camera, timers: s.timers,
        suspended: s.suspended, layers: st.layers || 0, sources: st.sources || 0,
        tsuWorker: !!(window.IntMapTsunamiWorker && window.IntMapTsunamiWorker.state().available),
        tsuPending: (window.IntMapTsunamiWorker && window.IntMapTsunamiWorker.state().running) || 0,
      };
    });
    return { ...h, ...rt };
  };

  const out = {};
  for (const cap of want) {
    const rows = [];
    const base = await snap();
    console.log(`\n  ${cap}`);
    console.log(`    baseline   heap ${String(base.heapMB).padStart(7)} MB  nodes ${String(base.nodes).padStart(6)}  listeners ${String(base.listeners).padStart(5)}  timers ${base.timers}  camera ${base.camera}  layers ${base.layers}`);
    for (let i = 0; i < CYCLES; i++) {
      await page.evaluate(async (c) => { await window.IntMapRuntime.activate(c); }, cap);
      await page.waitForTimeout(900);
      await page.evaluate((c) => { window.IntMapRuntime.suspend(c); }, cap);
      await page.waitForTimeout(500);
      const h = await snap();
      rows.push(h);
      console.log(`    cycle ${String(i + 1).padStart(2)}   heap ${String(h.heapMB).padStart(7)} MB  nodes ${String(h.nodes).padStart(6)}  listeners ${String(h.listeners).padStart(5)}  timers ${h.timers}  camera ${h.camera}  layers ${h.layers}`);
    }
    /* the verdict is the SLOPE over the second half — the first cycles legitimately fill caches a
       re-open is supposed to reuse, and calling that a leak is how a real one gets missed */
    const half = rows.slice(Math.floor(rows.length / 2));
    const slope = (f) => +((half[half.length - 1][f] - half[0][f]) / Math.max(1, half.length - 1)).toFixed(2);

    /* …then ask for it all back, and then ask for it again */
    await page.evaluate((c) => { window.IntMapRuntime.dispose(c); }, cap);
    await page.waitForTimeout(1200);
    const after = await snap();
    const state = await page.evaluate((c) => window.IntMapRuntime.stateOf(c), cap);
    const reopened = await page.evaluate(async (c) => {
      try { await window.IntMapRuntime.activate(c); } catch (_) { return 'threw'; }
      return window.IntMapRuntime.stateOf(c);
    }, cap);
    await page.evaluate((c) => { window.IntMapRuntime.suspend(c); }, cap);

    console.log(`    dispose    heap ${String(after.heapMB).padStart(7)} MB  nodes ${String(after.nodes).padStart(6)}  listeners ${String(after.listeners).padStart(5)}  timers ${after.timers}  camera ${after.camera}  layers ${after.layers}  worker ${after.tsuWorker}`);
    console.log(`    drift/cycle (2nd half): heap ${slope('heapMB')} MB · nodes ${slope('nodes')} · listeners ${slope('listeners')} · timers ${slope('timers')} · camera ${slope('camera')}`);
    console.log(`    state after dispose: ${state}   ·   re-open: ${reopened}${reopened === 'active' ? '  ✓' : '  ✗ THE FEATURE CANNOT BE OPENED AGAIN'}`);
    out[cap] = { baseline: base, rows, after, state, reopened, slope: { heapMB: slope('heapMB'), nodes: slope('nodes'), listeners: slope('listeners'), timers: slope('timers'), camera: slope('camera') } };
  }
  console.log(`cache: ${stats.hit} replayed, ${stats.miss} missed, ${stats.blocked} blocked`);
  writeJson({ mode: 'lifecycle', cycles: CYCLES, capabilities: out, cache: { ...stats } });
  await browser.close();
}

/* (#R315) …and the pieces a SECOND instrument needs, so an A/B runner does not grow its own
   replay cache. A cache that two harnesses fill differently makes the two arms differ by the
   cache as well as by the change, which is the one thing an A/B may not do. */
export { chromium, newContext, throttle, heap, sweep, stats, BASE, CACHE, CPU, MOBILE, avg, q, val, has, writeJson };

/* run only when this file IS the command; importing it must not start a browser */
const INVOKED = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (INVOKED) {
  if (has('--boot')) await runBoot();
  else if (has('--mem')) await runMem();
  else if (has('--attribute')) await runAttribute();
  else if (has('--commands')) await runCommands();
  else if (has('--lifecycle')) await runLifecycle();
  else await runSweep();
}
