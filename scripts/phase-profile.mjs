#!/usr/bin/env node
/* ============================================================================
 *  IntMap · WHO IS RUNNING WHILE THE FINGER MOVES  (#R512)
 * ----------------------------------------------------------------------------
 *  mobile-trace's buckets say WHAT kind of work a phase was (placement, render, decode …) and its
 *  `other` column says how much was none of those. `--attribute` names the callers of layout reads.
 *  Neither names the JavaScript functions that make up `other`. This does: it boots the same map
 *  through the same harness, switches a set of layers on, moves the camera where a reader meets
 *  them, and runs the CDP sampling profiler across ONE finger pan — then prints self time by
 *  function, with the bundle offset so a minified frame can be looked up.
 *
 *  ⚠ RUN AGAINST AN UNMINIFIED BUILD or the names are one letter (#R202): build with
 *    `npx vite build --minify false --outDir dist-dev` and pass `--dist dist-dev`.
 *  ⚠ The sampler costs a little; the numbers are a RANKING of functions, not a phone's ms.
 *
 *    node scripts/phase-profile.mjs --with wp-dl-alerts --zoom 11 [--cpu 4] [--dist dist-dev] [--json out.json]
 *    node scripts/phase-profile.mjs --with wp-dl-alerts --zoom 0 --rest 20000     # what it costs at rest
 * ========================================================================== */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  launch, cdpFor, newContext, settle, waitFor, pan, zoom, zoomTo, touchPan, deadline, PROBE, BASE, CPU, has, val, TPAN_SMALL, ensureServer, servingOurDist,
} from './mobile-trace.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WITH = (val('--with', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const ZOOM = Number(val('--zoom', 11));
const DIST = val('--dist', 'dist');
const OUT = val('--json', null);
const TOP = Number(val('--top', 30));

/* mobile-trace's ensureServer serves ROOT/dist; an unminified build lives elsewhere, so a server
   for it is started here on the same port when the port is free */
async function serverFor(dist) {
  if (dist === 'dist') return ensureServer(BASE);
  const port = new URL(BASE).port;
  const p = spawn(process.execPath, [join(ROOT, 'scripts', 'serve.mjs'), '--root', join(ROOT, dist), '--port', port], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { const r = await fetch(BASE + '/index.html'); if (r.ok) { console.log(`  serving ${join(ROOT, dist)} at ${BASE}`); return p; } } catch (_) {}
  }
  throw new Error('no server came up for ' + dist);
}
const setLayer = (page, id, on) => page.evaluate(async ([cb, want]) => {
  const el = document.getElementById(cb); if (!el || el.type !== 'checkbox') return { ran: false, why: 'absent' };
  if (!!el.checked === want) return { ran: true, already: true };
  el.checked = want; el.dispatchEvent(new Event('change', { bubbles: true }));
  for (let i = 0; i < 30; i++) { if (!!document.getElementById(cb).checked === want) return { ran: true, waitedMs: i * 100 }; await new Promise((r) => setTimeout(r, 100)); }
  return { ran: false, why: 'stayed' };
}, [id, !!on]);

const server = await serverFor(DIST);
const stopServer = () => { if (server) { try { server.kill(); } catch (_) {} } };
process.on('exit', stopServer); process.on('SIGINT', () => { stopServer(); process.exit(130); });

const browser = await launch('chromium');
const ctx = await newContext(browser);
await ctx.addInitScript({ path: PROBE });
const page = await ctx.newPage();
const cdp = await cdpFor('chromium', ctx, page);
if (!cdp) throw new Error('no CDP');
let result = null;
try {
  const t0 = Date.now();
  process.stdout.write(`  navigate ${BASE} …`);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180_000 });
  const ok = await waitFor(page, () => window.__imBoot && window.__imBoot.isDone(), 120_000);
  process.stdout.write(` boot ${Date.now() - t0} ms (ready=${ok})\n`);
  await deadline(page.evaluate(() => window.__imTrace.attachMap()), 'attachMap');
  await settle(page, 2500);
  await pan(page); await zoom(page, +1); await zoom(page, -1);
  for (const id of WITH) console.log(`  ${id}: ${JSON.stringify(await setLayer(page, id, true))}`);
  await settle(page, 6000);
  if (ZOOM) { await zoomTo(page, ZOOM); await settle(page, 2500); }
  await touchPan(page, cdp, TPAN_SMALL);           /* the first gesture on the new set is the slow one */
  await settle(page, 1500);

  /* `--rest <ms>` samples the map at REST instead of under a finger: what a layer costs while the
     reader is only looking — the alerts row of the sweep was busy 21 of 30 idle seconds (cpu ×4) */
  const REST = Number(val('--rest', 0));
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  const a = await page.evaluate(() => window.__imTrace.snap());
  if (REST) await page.waitForTimeout(REST); else await touchPan(page, cdp, TPAN_SMALL);
  const b = await page.evaluate(() => window.__imTrace.snap());
  const { profile } = await cdp.send('Profiler.stop');

  const total = profile.endTime - profile.startTime;
  const hits = profile.nodes.reduce((s, n) => s + (n.hitCount || 0), 0) || 1;
  const per = total / hits / 1000;                 /* ms per sample */
  const byFn = new Map();
  const byUrl = new Map();
  for (const n of profile.nodes) {
    const h = n.hitCount || 0; if (!h) continue;
    const cf = n.callFrame || {};
    const url = String(cf.url || '').replace(/^https?:\/\/[^/]+/, '') || '(native)';
    const key = `${cf.functionName || '(anonymous)'}  ${url}:${(cf.lineNumber || 0) + 1}:${(cf.columnNumber || 0) + 1}`;
    byFn.set(key, (byFn.get(key) || 0) + h * per);
    const u = url.replace(/-[A-Za-z0-9_-]{6,}\.js/, '-*.js');
    byUrl.set(u, (byUrl.get(u) || 0) + h * per);
  }
  const fns = [...byFn.entries()].sort((x, y) => y[1] - x[1]);
  const urls = [...byUrl.entries()].sort((x, y) => y[1] - x[1]);
  const busy = Math.round((b.busy || 0) - (a.busy || 0));
  console.log(`\n  SAMPLED ${(total / 1000).toFixed(0)} ms across ${REST ? `${REST} ms at REST` : 'one small finger pan'} · probe busy ${busy} ms · layers ${WITH.join(',') || '(default)'} · z${ZOOM} · cpu ×${CPU}`);
  console.log(`\n  BY FILE`);
  for (const [u, ms] of urls.slice(0, 10)) console.log(`    ${String(ms.toFixed(0)).padStart(7)} ms  ${u}`);
  console.log(`\n  BY FUNCTION (self time, top ${TOP})`);
  for (const [k, ms] of fns.slice(0, TOP)) console.log(`    ${String(ms.toFixed(1)).padStart(8)} ms  ${k}`);
  result = { with: WITH, zoom: ZOOM, cpu: CPU, dist: DIST, sampledMs: total / 1000, busyMs: busy, byFile: urls, byFunction: fns.slice(0, 200) };
} finally { try { await ctx.close(); } catch (_) {} try { await browser.close(); } catch (_) {} }
if (OUT) { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, JSON.stringify(result, null, 2)); console.log(`  → ${OUT}`); }
stopServer();
