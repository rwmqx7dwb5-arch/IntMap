#!/usr/bin/env node
/**
 * IntMap · perf-compare — TWO ARMS, INTERLEAVED, WITH A NOISE FLOOR (#R322)
 * ---------------------------------------------------------------------------------------------
 *  「AとBを別々の時刻・別々の条件で測る」 is the way a performance claim gets made without being
 *  true, and this repository has produced one before: #R314 measured the same page twice and got
 *  1.6 s and 6.8 s apart, entirely from run-to-run drift. So this instrument does three things the
 *  single-arm profiler cannot:
 *
 *    ① ONE BROWSER PROCESS, ARMS ALTERNATED (A B A B …). Chromium's HTTP cache, its JIT state and
 *       the machine's thermal state all drift over a run. Alternating pairs the arms against the
 *       same drift instead of letting the second arm inherit the first arm's warm machine.
 *    ② AN A/A CONTROL. Before A is compared with B, A is compared with ITSELF over the same number
 *       of reps. The spread of that comparison is the NOISE FLOOR, and a difference inside it is
 *       reported as 「差は測定できない」 rather than as an improvement.
 *    ③ REPLAY COVERAGE IS PART OF THE RESULT. A run whose external requests were blocked drew less
 *       map than a real one and is faster for a reason that has nothing to do with the change
 *       (#R311). The miss and blocked counts are printed and written, not hidden.
 *
 *  The two arms are QUERY STRINGS on one build, not two builds. One build cannot differ from itself
 *  by chunk hashing, by build order or by which files happened to be on disk — so whatever moves,
 *  moved because of the flag. (Two different builds can be compared by passing two full URLs.)
 *
 *  Usage
 *    node scripts/perf-compare.mjs --a "" --b "?cmdskip=sourceData" --reps 8
 *    node scripts/perf-compare.mjs --a "?x=1" --b "?y=1" --scenario boot,sweep --reps 6 --desktop
 *    …plus every flag frame-profile.mjs understands: --base --cache --desktop|--mobile --cpu N --sat
 *
 *  Scenarios
 *    boot   first map pixel, interaction-ready, FCP, long tasks, heap, nodes, listeners
 *    sweep  frame time over the scripted zoom + hover (mean and p95)
 *    mem    heap / nodes / listeners after N open-close cycles of a named feature
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  chromium, newContext, throttle, heap, sweep, stats, BASE, CPU, MOBILE, avg, q, val, has,
} from './frame-profile.mjs';

const ARM_A = val('--a', '');
const ARM_B = val('--b', null);
const REPS = Number(val('--reps', 6));
const SCEN = String(val('--scenario', 'boot')).split(',').map((s) => s.trim()).filter(Boolean);
const OUT = val('--json', null);
const MD = val('--md', null);
const MEM_CMD = val('--cmd', 'seismic');
const CYCLES = Number(val('--cycles', 6));

if (ARM_B === null) {
  console.error('perf-compare: --b is required (the other arm). --a defaults to the bare URL.');
  process.exit(1);
}

const url = (arm) => BASE + '/' + (arm || '');

/* ── one rep of one scenario, in a context of its own ─────────────────────── */
async function openArm(browser, arm) {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await page.goto(url(arm), { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(
    () => window.IntMapGeoEngine && window.IntMapGeoEngine.canDraw && window.IntMapGeoEngine.canDraw(),
    null, { timeout: 120_000 },
  );
  const shimmed = await page.evaluate(() => String(requestAnimationFrame).includes('setTimeout'));
  if (shimmed) throw new Error('the rAF shim is installed — every frame time would be a 33 ms timer');
  const cdp = await throttle(ctx, page);
  return { ctx, page, cdp };
}

/* first map pixel and interaction-ready come from the app's own boot milestones (index.html
   __imBoot), which is where #R311 put them; reading them here rather than re-deriving them keeps
   the two instruments answering the same question. */
/* ⚠ the two milestones are measured EXACTLY as frame-profile.mjs --boot measures them: wall time
   from navigation to `canDraw()` (the first painted map) and to `__imBoot.isDone()` (the launch
   screen is gone and the app is usable). Two instruments that name the same metric and derive it
   differently produce two answers to one question, which is worse than having one instrument. */
async function bootRep(browser, arm) {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const cdp = await throttle(ctx, page);
  const t0 = Date.now();
  await page.goto(url(arm), { waitUntil: 'domcontentloaded', timeout: 180_000 });
  const dom = Date.now() - t0;
  await page.waitForFunction(
    () => window.IntMapGeoEngine && window.IntMapGeoEngine.canDraw && window.IntMapGeoEngine.canDraw(),
    null, { timeout: 180_000 },
  );
  const firstPixel = Date.now() - t0;
  let ready = null;
  try {
    await page.waitForFunction(() => window.__imBoot && window.__imBoot.isDone(), null, { timeout: 60_000 });
    ready = Date.now() - t0;
  } catch (_) { /* a boot that never signals is recorded as such, not thrown */ }
  const m = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource');
    const js = res.filter((r) => /\.js(\?|$)/.test(r.name));
    const lt = (window.__imLT || []).slice();
    const cmd = (window.IntMapGeoEngine && window.IntMapGeoEngine.render.commands)
      ? window.IntMapGeoEngine.render.commands() : null;
    return {
      jsKB: Math.round(js.reduce((s, r) => s + (r.encodedBodySize || 0), 0) / 1024),
      requests: res.length,
      fcp: Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0),
      lt50: lt.filter((x) => x >= 50).length, ltMax: lt.length ? Math.max(...lt) : 0,
      ltTotal: lt.reduce((a, b) => a + b, 0),
      cmdSent: cmd ? Object.keys(cmd.totals).reduce((a, k) => a + cmd.totals[k].sent, 0) : null,
    };
  });
  const h = await heap(cdp);
  const row = {
    firstPixel, ready, dom, ...m,
    heapMB: h.heapMB, nodes: h.nodes, listeners: h.listeners,
  };
  await ctx.close();
  return row;
}

async function sweepRep(browser, arm) {
  const { ctx, page } = await openArm(browser, arm);
  const f = (await sweep(page)).frames;
  const row = { mean: +avg(f).toFixed(2), p95: +q(f, 0.95).toFixed(2), median: +q(f, 0.5).toFixed(2), n: f.length };
  await ctx.close();
  return row;
}

/* open / close a feature N times through the SAME public door a person uses, then look at what
   did not come back. The command names are IntMapOS commands (#R311's --mem takes the same). */
async function memRep(browser, arm) {
  const { ctx, page, cdp } = await openArm(browser, arm);
  const before = await heap(cdp);
  for (let i = 0; i < CYCLES; i++) {
    await page.evaluate(async (cmd) => {
      const OS = window.IntMapOS;
      if (OS && OS.run) { try { await OS.run(cmd + '.open'); } catch (_) { } }
      await new Promise((r) => setTimeout(r, 600));
      if (OS && OS.run) { try { await OS.run(cmd + '.close'); } catch (_) { } }
      await new Promise((r) => setTimeout(r, 400));
    }, MEM_CMD);
  }
  const after = await heap(cdp);
  const row = {
    heapMB: after.heapMB, dHeapMB: +(after.heapMB - before.heapMB).toFixed(2),
    nodes: after.nodes, dNodes: after.nodes - before.nodes,
    listeners: after.listeners, dListeners: after.listeners - before.listeners,
  };
  await ctx.close();
  return row;
}

const RUNNERS = { boot: bootRep, sweep: sweepRep, mem: memRep };

/* ── statistics: paired, and honest about what a pair can say ──────────────── */
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const sd = (a) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
};

function compare(A, B, keys) {
  const out = {};
  for (const k of keys) {
    const a = A.map((r) => r[k]).filter((x) => typeof x === 'number' && isFinite(x));
    const b = B.map((r) => r[k]).filter((x) => typeof x === 'number' && isFinite(x));
    if (!a.length || !b.length) { out[k] = null; continue; }
    out[k] = {
      a: +mean(a).toFixed(2), b: +mean(b).toFixed(2), d: +(mean(b) - mean(a)).toFixed(2),
      aSd: +sd(a).toFixed(2), bSd: +sd(b).toFixed(2), n: Math.min(a.length, b.length),
    };
  }
  return out;
}

async function runScenario(browser, name) {
  const run = RUNNERS[name];
  if (!run) throw new Error('unknown scenario: ' + name);
  const A = [], B = [], A2 = [];
  /* one warm-up per arm, discarded: the first document in a process pays for code the rest reuse */
  await run(browser, ARM_A); await run(browser, ARM_B);
  for (let i = 0; i < REPS; i++) {
    A.push(await run(browser, ARM_A));
    B.push(await run(browser, ARM_B));
    A2.push(await run(browser, ARM_A));            /* the control arm — A measured against itself */
    process.stdout.write(`  ${name} ${i + 1}/${REPS}\r`);
  }
  const keys = Object.keys(A[0]).filter((k) => typeof A[0][k] === 'number');
  return { scenario: name, keys, A, B, A2, ab: compare(A, B, keys), aa: compare(A, A2, keys) };
}

const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });
const results = [];
for (const s of SCEN) results.push(await runScenario(browser, s));
await browser.close();

const lines = [];
lines.push(`# perf-compare  ·  A \`${ARM_A || '(bare)'}\`  vs  B \`${ARM_B}\``);
lines.push('');
lines.push(`base \`${BASE}\` · ${MOBILE ? 'mobile' : 'desktop'} · cpu ×${CPU} · reps ${REPS} · replay ${stats.hit} hit / ${stats.miss} miss / ${stats.blocked} blocked`);
if (stats.miss > 0) lines.push('');
if (stats.miss > 0) lines.push(`> ⚠ ${stats.miss} external requests were NOT in the replay cache and were blocked. Both arms drew less map than a real session; re-record before quoting these numbers.`);
for (const r of results) {
  lines.push('');
  lines.push(`## ${r.scenario}`);
  lines.push('');
  lines.push('| Metric | A | B | B − A | A/A noise floor | Verdict |');
  lines.push('|---|---:|---:|---:|---:|---|');
  for (const k of r.keys) {
    const ab = r.ab[k], aa = r.aa[k];
    if (!ab) continue;
    const floor = aa ? Math.max(Math.abs(aa.d), aa.aSd, aa.bSd) : NaN;
    const verdict = !isFinite(floor) ? '—'
      : Math.abs(ab.d) <= floor ? '差は測定できない'
        : (ab.d < 0 ? 'B faster' : 'B slower');
    lines.push(`| ${k} | ${ab.a} | ${ab.b} | ${ab.d > 0 ? '+' : ''}${ab.d} | ±${isFinite(floor) ? floor.toFixed(2) : '?'} | ${verdict} |`);
  }
}
const md = lines.join('\n');
console.log('\n' + md);
if (MD) { mkdirSync(dirname(MD), { recursive: true }); writeFileSync(MD, md + '\n'); console.log(`  → ${MD}`); }
if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    a: ARM_A, b: ARM_B, base: BASE, mobile: MOBILE, cpu: CPU, reps: REPS,
    cache: { ...stats }, results,
  }, null, 2));
  console.log(`  → ${OUT}`);
}
