#!/usr/bin/env node
/* ============================================================================
 *  IntMap · HOW SMOOTHLY THE MAP ANSWERS A WHEEL, A DRAG, A PINCH  (map-motion)
 * ----------------------------------------------------------------------------
 *  「地図の挙動を Google Earth 並に滑らかにしたい」——ズームとスクロールの動きの質。
 *
 *  Drives the BUILT app with real, trusted input — `page.mouse.wheel` notches, a mouse drag released
 *  at speed, a double click, and CDP `Input.dispatchTouchEvent` fingers (pan + fling, pinch, double
 *  tap) on a 375×812 phone — and reports, per gesture, from the browser itself
 *  (scripts/map-motion-probe.js):
 *
 *    frames   the interval between animation frames while the camera moves: p50 / p95 / max and
 *             how many exceeded 1.5 vsync (a frame the eye sees as a hitch)
 *    path     how even the camera's own trajectory is: the frame-to-frame change of zoom speed
 *             (wheel / pinch) or of pan speed (drag / fling), as a fraction of the mean speed. A map
 *             can draw at 60 fps and still lurch if each frame moves a different distance.
 *    js       milliseconds spent in renderer-event listeners, DOM input listeners and animation-
 *             frame callbacks during the gesture, by the SOURCE FILE that registered them
 *    long     longtask / long-animation-frame entries in the window
 *    tiles    the share of moving frames on which the renderer still waited for tiles, and the time
 *             from the camera stopping to every wanted tile being on screen
 *
 *  USAGE
 *    IM_SOURCEMAP=1 npx vite build --outDir dist-dev      # once: a build whose stacks can be named
 *    node scripts/map-motion.mjs [--dist dist-dev] [--profile desktop|mobile|both] [--reps 3]
 *                                [--only wheel,drag,…] [--json out.json] [--top 12] [--hermetic]
 *  ⚠ The network is LIVE by default (the tiles are part of what a reader waits for). `--hermetic`
 *    blocks every host but the app's own, which is what the spec gate does.
 *  ⚠ Numbers are for comparing two builds on one machine, minutes apart — never a phone's ms.
 * ==========================================================================*/
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { chromium } from '@playwright/test';
import { seededStorageState } from '../tests/helpers/session-seed.js';
import { PROBE, GESTURES, analyse, measure } from './map-motion-lib.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const val = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
/* one build, or several to compare in the SAME minutes: `--dist before,after` serves each on its own
   port and alternates them rep by rep (ABBA), so a machine whose load drifts drifts on both arms */
const DISTS = val('--dist', 'dist').split(',').filter(Boolean).map((d) => resolve(ROOT, d));
const REPS = Number(val('--reps', 3));
const TOP = Number(val('--top', 12));
const OUT = val('--json', null);
const ONLY = (val('--only', '') || '').split(',').filter(Boolean);
const PROFILES = (() => { const p = val('--profile', 'both'); return p === 'both' ? ['desktop', 'mobile'] : [p]; })();
const PORT = Number(val('--port', 4790));
const ARMS = DISTS.map((dist, i) => ({ dist, port: PORT + i, base: `http://127.0.0.1:${PORT + i}`, name: dist.split(/[\\/]/).pop() }));
const distOf = (url) => { try { const a = ARMS.find((x) => x.port === Number(new URL(url).port)); return a ? a.dist : ARMS[0].dist; } catch (_) { return ARMS[0].dist; } };
const HERMETIC = has('--hermetic');
const TRACE = has('--trace');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* the machine's own load over a span — frame times from a saturated machine are not comparable with a
   quiet one, so every report carries the CPU busy share it was measured under */
const cpuTimes = () => cpus().reduce((a, c) => { const t = c.times; a.busy += t.user + t.nice + t.sys + t.irq; a.all += t.user + t.nice + t.sys + t.irq + t.idle; return a; }, { busy: 0, all: 0 });
const busyShare = (a, b) => Math.round(100 * (b.busy - a.busy) / Math.max(1, b.all - a.all));

/* ── the server: the build under test, on a port of its own ── */
async function serve(arm) {
  try { const r = await fetch(arm.base + '/index.html'); if (r.ok) throw new Error(`port ${arm.port} already serves something — pick --port`); } catch (e) { if (/already/.test(e.message)) throw e; }
  const p = spawn(process.execPath, [join(ROOT, 'scripts', 'serve.mjs'), '--root', arm.dist, '--port', String(arm.port)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { await sleep(250); try { const r = await fetch(arm.base + '/index.html'); if (r.ok) return p; } catch (_) {} }
  throw new Error('no server for ' + arm.dist);
}

/* ── naming a registration stack: the first frame that is the app's, through the source map ── */
const maps = new Map();
function consumerFor(url) {
  if (maps.has(url)) return maps.get(url);
  let c = null;
  try {
    const p = join(distOf(url), new URL(url).pathname.replace(/^\//, '') + '.map');
    if (existsSync(p)) { const { SourceMapConsumer } = require('source-map-js'); c = new SourceMapConsumer(JSON.parse(readFileSync(p, 'utf8'))); }
  } catch (_) {}
  maps.set(url, c); return c;
}
function frames(stack) {
  const out = [];
  for (const line of String(stack || '').split('\n').slice(1)) {
    const m = /(https?:\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/.exec(line); if (!m) continue;
    const fn = (/at\s+(?:async\s+)?([^\s(]+)\s+\(/.exec(line) || [])[1] || '';
    const c = consumerFor(m[1]);
    if (c) { const o = c.originalPositionFor({ line: +m[2], column: +m[3] - 1 }); if (o && o.source) { out.push({ src: o.source.replace(/^(\.\.\/)+/, ''), line: o.line, fn: o.name || fn }); continue; } }
    out.push({ src: new URL(m[1]).pathname, line: +m[2], fn });
  }
  return out;
}
const isVendor = (s) => /node_modules|maplibre-gl/.test(s);
function owner(stack) {
  const fr = frames(stack);
  /* a listener the RENDERER registered is the renderer's, whoever constructed the renderer */
  if (fr[0] && isVendor(fr[0].src)) return `maplibre-gl(${(fr[0].src.split('/').pop() || '')}${fr[0].fn ? ' ' + fr[0].fn : ''})`;
  /* js/geo-engine.js is the adapter every caller registers THROUGH; name the caller behind it when
     there is one, and the adapter only when the registration is its own */
  const app = fr.find((f) => !isVendor(f.src) && !/geo-engine\.js$/.test(f.src)) || fr.find((f) => !isVendor(f.src));
  if (app) return `${app.src}:${app.line}`;
  const v = fr[0]; return v ? `maplibre-gl(${(v.src.split('/').pop() || '')}${v.fn ? ' ' + v.fn : ''})` : '(unknown)';
}

/* a long-animation-frame script names a character offset in a bundle; turn it into a source file */
const bundles = new Map();
function charToSource(url, pos) {
  try {
    const path = join(distOf(url), new URL(url).pathname.replace(/^\//, ''));
    let text = bundles.get(path); if (text == null) { text = existsSync(path) ? readFileSync(path, 'utf8') : ''; bundles.set(path, text); }
    if (!text || !(pos >= 0)) return null;
    const before = text.slice(0, pos), line = before.split('\n').length, col = pos - before.lastIndexOf('\n') - 1;
    const c = consumerFor(url); if (!c) return null;
    const o = c.originalPositionFor({ line, column: col });
    return o && o.source ? `${o.source.replace(/^(\.\.\/)+/, '')}:${o.line}${o.name ? ' ' + o.name : ''}` : null;
  } catch (_) { return null; }
}

async function newPage(browser, profile, arm) {
  const opts = profile === 'mobile'
    ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }
    : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
  const seeded = seededStorageState();
  seeded.origins.forEach((o) => { o.origin = arm.base; });
  const ctx = await browser.newContext({ ...opts, storageState: seeded, timezoneId: 'UTC', locale: 'en-US', serviceWorkers: 'block' });
  if (HERMETIC) await ctx.route('**/*', (r) => { const h = new URL(r.request().url()).hostname; return (h === '127.0.0.1' || h === 'localhost') ? r.continue() : r.abort('blockedbyclient'); });
  await ctx.addInitScript({ path: PROBE });
  const page = await ctx.newPage();
  await page.goto(arm.base + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && window.__imap.isStyleLoaded() && (!window.IntMapGeoEngine.canDraw || window.IntMapGeoEngine.canDraw()), null, { timeout: 90000 });
  await page.evaluate(() => new Promise((r) => { window.__imap.once('idle', r); setTimeout(r, 15000); }));
  await sleep(2500);
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp };
}

/* median of each numeric leaf across reps; the js table from the median rep */
function combine(runs) {
  const med = (xs) => { const a = xs.filter((x) => x != null && isFinite(x)).sort((p, r) => p - r); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
  const walk = (objs) => {
    const o0 = objs[0], out = {};
    for (const k of Object.keys(o0)) {
      if (k === 'js' || k === 'styleWriters' || k === 'loafScripts') continue;
      out[k] = (o0[k] && typeof o0[k] === 'object') ? walk(objs.map((o) => o[k])) : med(objs.map((o) => o[k]));
    }
    return out;
  };
  const out = walk(runs);
  const byJs = runs.slice().sort((a, b) => a.jsTotalMs - b.jsTotalMs);
  out.js = byJs[Math.floor((byJs.length - 1) / 2)].js;
  out.loafScripts = runs.flatMap((r) => r.loafScripts || []).sort((a, b) => b[1] - a[1]).slice(0, 6);
  out.styleWriters = byJs[Math.floor((byJs.length - 1) / 2)].styleWriters;
  return out;
}

const servers = [];
for (const arm of ARMS) servers.push(await serve(arm));
const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });
const report = { arms: ARMS.map((a) => a.dist), at: new Date().toISOString(), hermetic: HERMETIC, cpus: cpus().length, profiles: {} };
const line = (c) => `moving ${c.movingFrames} frames/${c.movingMs} ms · frame p50 ${c.frame.p50} p95 ${c.frame.p95} max ${c.frame.max} hitches ${c.frame.hitches}` +
  ` · path evenness ${c.path.evenness} handoff ${c.path.handoff} glide ${c.path.glideStart} stalls ${c.path.stalls} · long ${c.long.tasks}/${c.long.taskMs} ms loaf ${c.long.loaf} blocking ${c.long.blockingMs} ms` +
  ` · labels placements ${c.labels.placements} flips ${c.labels.flips} blinks ${c.labels.blinks} placement ${c.labels.placementMs} ms paint ${c.labels.paintMs} ms` +
  ` · tiles waiting ${c.tiles.waitingShare} settle ${c.tiles.settleMs} ms idle+${c.tiles.idleAfterInputMs} ms · body/html writes ${c.pageWrites} · js app ${c.jsAppMs} / all ${c.jsTotalMs} ms`;
try {
  for (const profile of PROFILES) {
    const opened = [];
    for (const arm of ARMS) opened.push(await newPage(browser, profile, arm));
    const gl = await opened[0].page.evaluate(() => { try { const g = window.__imap.painter.context.gl; const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; } catch (_) { return '?'; } });
    report.profiles[profile] = { gpu: gl, gestures: {} };
    console.log(`\n== ${profile}  (${gl})`);
    for (const [name, g] of Object.entries(GESTURES[profile])) {
      if (ONLY.length && !ONLY.includes(name)) continue;
      const runs = ARMS.map(() => []);
      const c0 = cpuTimes();
      for (let r = 0; r < REPS; r++) {
        const order = ARMS.map((_, i) => i); if (r % 2) order.reverse();   /* ABBA */
        for (const i of order) runs[i].push(analyse(await measure(opened[i].page, opened[i].cdp, g), g.kind, { owner, charToSource, trace: TRACE, top: TOP }));
      }
      const busy = busyShare(c0, cpuTimes());
      report.profiles[profile].gestures[name] = {};
      ARMS.forEach((arm, i) => {
        const c = combine(runs[i]); c.machineBusyPct = busy;
        report.profiles[profile].gestures[name][arm.name] = c;
        console.log(`-- ${name} · ${arm.name} [machine ${busy}% busy]: ${line(c)}`);
        if (c.loafScripts && c.loafScripts.length) console.log('     long-frame scripts: ' + c.loafScripts.map(([k, d]) => `${k} ${d}ms`).join('  |  '));
        if (c.styleWriters && c.styleWriters.length) console.log('     style/class writes: ' + c.styleWriters.map(([k, n]) => `${k}×${n}`).join('  '));
        for (const j of c.js) console.log(`     ${String(j.ms).padStart(7)} ms  ×${String(j.n).padStart(4)}  max ${String(j.max).padStart(5)}  ${j.who}`);
      });
    }
    for (const o of opened) await o.ctx.close();
  }
} finally {
  await browser.close();
  for (const sv of servers) if (sv) sv.kill();
}
if (OUT) { writeFileSync(OUT, JSON.stringify(report, null, 2)); console.log('\nwrote ' + OUT); }
