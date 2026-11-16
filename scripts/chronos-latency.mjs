#!/usr/bin/env node
/* ============================================================================
 *  IntMap · HOW LONG THE MAP TAKES TO SHOW THE INSTANT THE CLOCK MOVED TO (chronos-prefetch)
 * ----------------------------------------------------------------------------
 *  「時計を動かしてから、地図が新しい時点で描き終わるまでの時間を、国境・都市名・地方区分ごとに測る」
 *
 *  Opens the BUILT site (the history records are read as time-cut tiles only there — vite.config.js
 *  `histTiles()`), moves the master clock one step at a time the way the Chronos stepper does, and for
 *  every step reads three things:
 *    · per layer, the time from the clock's move to the moment the DRAWER declared it had handed the map
 *      that instant (js/chronos.js `drawn` / `drawnState` — borders, `subdivisions:a1`, cities). The
 *      instrument never infers «drawn» from a source's feature count: an empty source and a source still
 *      holding the last instant look the same to such an observer, and the declaration is the drawer's.
 *    · `painted` — the first map `idle` after every layer has declared (MapLibre has parsed and drawn it).
 *    · the history bytes and Range reads that step cost (js/hist-bundles.js `counts`).
 *
 *  USAGE
 *    node scripts/chronos-latency.mjs                      # builds nothing: serves ./dist on a free port
 *    node scripts/chronos-latency.mjs --base http://127.0.0.1:4415
 *    node scripts/chronos-latency.mjs --before            # the same build without the read-ahead and the hand-over warm
 *    node scripts/chronos-latency.mjs --cpu 4 --reps 3 --pause 1000 --json <path>   (--swiftshader: headless's software GPU)
 *  A number from this script is a local, desktop-Chromium number; it is not the production site's.
 * ==========================================================================*/
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installHermeticRouting } from '../tests/helpers/network.js';
import { seededStorageState } from '../tests/helpers/session-seed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CPU = Number(arg('--cpu', 1));
const REPS = Number(arg('--reps', 1));
const STEP_TIMEOUT_MS = Number(arg('--timeout', 30000));
const JSON_OUT = arg('--json', null);
const BEFORE = process.argv.includes('--before');
export const LAYERS = ['borders', 'subdivisions:a1', 'cities'];

/* the walks: each is a start instant (the cold arrival, reported apart) and the years the stepper then
   visits one at a time. They cover the three record bands js/time-borders.js `collectionAt` reads —
   CShapes (1886–2019), OpenHistoricalMap (to 1885), the composed deep past — and both directions. */
export const WALKS = [
  { name: 'cshapes-forward', from: 1900, years: [1901, 1902, 1903, 1904, 1905, 1906] },
  { name: 'cshapes-back', from: 1925, years: [1924, 1923, 1922, 1921, 1920, 1919] },
  { name: 'ohm-forward', from: 1750, years: [1751, 1752, 1753, 1754, 1755, 1756] },
  { name: 'deep-decades', from: 1200, years: [1210, 1220, 1230, 1240, 1250, 1260] },
];

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

async function serveDist() {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs'), '--root', path.join(ROOT, 'dist'), '--port', String(port)], { stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { const r = await fetch(base + '/index.html'); if (r.ok) return { base, stop: () => child.kill() }; } catch (_) { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
  child.kill(); throw new Error('serve.mjs did not answer on ' + base);
}

/* one clock move, measured on the page: resolves when every layer declared THIS instant and the map went idle */
async function step(page, year) {
  return page.evaluate(async ({ year, layers, timeout }) => {
    const T = window.IntMapTime, HB = window.IntMapHistBundles, map = window.__imap;
    const c0 = HB.counts();
    T.setYear(year, { source: 'chronos-latency' });
    const s0 = T.drawnState(), moved = s0.movedAt, iso = T.iso();
    const out = { year, iso, layers: {}, painted: null };
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = () => {
        const s = T.drawnState();
        for (const l of layers) { const r = s.layers[l]; if (out.layers[l] == null && r && r.at >= moved && r.iso === iso) out.layers[l] = +(r.at - moved).toFixed(1); }
        if (layers.every((l) => out.layers[l] != null) || performance.now() - t0 > timeout) return res();
        setTimeout(tick, 5);
      };
      tick();
    });
    /* painted: MapLibre has taken what was handed and has nothing left to draw */
    await new Promise((res) => { let done = false; const fin = () => { if (done) return; done = true; out.painted = +(performance.now() - moved).toFixed(1); res(); };
      try { map.once('idle', fin); map.triggerRepaint(); } catch (_) { fin(); } setTimeout(() => { if (!done) { done = true; res(); } }, timeout); });
    const c1 = HB.counts();
    out.rangeBytes = c1.rangeBytes - c0.rangeBytes; out.ranges = c1.ranges - c0.ranges;
    out.prefetchBytes = (c1.prefetchBytes || 0) - (c0.prefetchBytes || 0);
    return out;
  }, { year, layers: LAYERS, timeout: STEP_TIMEOUT_MS });
}

/* the reader's pause on a year before the next step — a fixed time, NOT «until the page is quiet»: waiting
   for quiet would hand any background work all the time it wants, which is not what a reader gives it.
   ESTIMATE: one press of the stepper per second. The cold arrival is followed by a wait for quiet (the
   first journey's reads are not the steps' subject). */
const PAUSE_MS = Number(arg('--pause', 1000));
async function quiet(page, cold) {
  if (cold) await page.waitForFunction(() => { const c = window.IntMapHistBundles.counts(); return c.inFlight === 0 && c.reading === 0; }, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(PAUSE_MS);
}

export async function measure({ base, cpu = CPU, walks = WALKS } = {}) {
  /* ⚠ THE MACHINE'S GPU, NOT HEADLESS CHROMIUM'S SOFTWARE ONE. Measured 2026-11-16 on this repository's Windows
     machine: under the default SwiftShader renderer the page thread spent ~4.5 s of a one-year step in native
     drawing and the borders came 2.6 s after the move; with the GPU (ANGLE Direct3D 11) 0.9 s. A reader's browser
     draws on a GPU, so the software renderer measured the renderer. `--swiftshader` keeps the old one (CI has no GPU). */
  const browser = await chromium.launch(process.argv.includes('--swiftshader') ? {} : { args: [process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=default', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const runs = [];
  try {
    for (const walk of walks) {
      const ctx = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1280, height: 800 } });
      await installHermeticRouting(ctx);
      const page = await ctx.newPage();
      if (cpu > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
      await page.goto(base + '/index.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => { try { return !!window.__imap && window.IntMapGeoEngine.canDraw() && !!window.IntMapTime.drawnState; } catch (_) { return false; } }, null, { timeout: 90000 });
      await page.evaluate(() => { window.__imap.jumpTo({ center: [12, 48], zoom: 4 }); });
      /* --before: the same build as it was before chronos-prefetch — js/hist-bundles.js reads nothing one step ahead
         (the speculation verdict it asks, js/mem-budget.js `maySpeculate`, answers «no», as on a metered connection)
         and the subdivisions do not `warm` their instant at the borders' hand-over. Set after boot, so the boot and
         the intent's index warm-up are the same in both arms; only the walk differs. */
      if (BEFORE) await page.evaluate(() => { window.IntMapMemBudget.maySpeculate = () => false; });
      await page.waitForTimeout(1500);
      const cold = await step(page, walk.from);
      if (BEFORE) await page.evaluate(async () => { const HB = window.IntMapHistBundles;
        for (const g of ['__HISTADM1', '__HISTADM2', '__HISTADM3']) if (HB.loaded(g)) { const h = await HB.open({ global: g }); if (h) h.warm = () => Promise.resolve(); } });
      await quiet(page, true);
      const steps = [];
      for (const y of walk.years) { steps.push(await step(page, y)); await quiet(page); }
      runs.push({ walk: walk.name, cold, steps });
      await ctx.close();
    }
  } finally { await browser.close(); }
  return runs;
}

const med = (a) => { const v = a.filter((x) => typeof x === 'number').sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const max = (a) => { const v = a.filter((x) => typeof x === 'number'); return v.length ? Math.max(...v) : null; };
export function summarise(runs) {
  const rows = [];
  for (const r of runs) {
    const col = (k) => r.steps.map((s) => (k in s.layers ? s.layers[k] : s[k]));
    const missing = r.steps.filter((s) => LAYERS.some((l) => s.layers[l] == null)).length;
    rows.push({ walk: r.walk, cold: r.cold, median: Object.fromEntries([...LAYERS, 'painted'].map((k) => [k, med(col(k))])),
      worst: Object.fromEntries([...LAYERS, 'painted'].map((k) => [k, max(col(k))])),
      bytes: r.steps.reduce((n, s) => n + (s.rangeBytes || 0), 0), prefetchBytes: r.steps.reduce((n, s) => n + (s.prefetchBytes || 0), 0), missing });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:')}` || process.argv[1].endsWith('chronos-latency.mjs')) {
  const own = arg('--base', null) ? null : await serveDist();
  const base = arg('--base', null) || own.base;
  try {
    const all = [];
    for (let i = 0; i < REPS; i++) all.push(...(await measure({ base })));
    const sum = summarise(all);
    console.log(`chronos-latency · ${base} · ${BEFORE ? 'BEFORE (no read-ahead, no warm)' : 'as built'} · cpu ×${CPU} · ${REPS} rep(s) · ms from the clock's move (median / worst of the steps)`);
    for (const s of sum) {
      const f = (k) => `${k.padEnd(16)} ${String(s.median[k]).padStart(8)} / ${String(s.worst[k]).padStart(8)}`;
      console.log(`\n${s.walk}  (cold arrival: ${LAYERS.map((l) => l + '=' + s.cold.layers[l]).join(' ')} painted=${s.cold.painted})`);
      for (const k of [...LAYERS, 'painted']) console.log('  ' + f(k));
      console.log(`  range bytes in steps ${s.bytes}  prefetched ${s.prefetchBytes}  steps not declared ${s.missing}`);
    }
    if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ base, cpu: CPU, reps: REPS, runs: all, summary: sum }, null, 1));
  } finally { if (own) own.stop(); }
}
