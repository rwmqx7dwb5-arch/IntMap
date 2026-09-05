#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE SAME FINGER ON FOUR MAPS  (#R512)
 * ----------------------------------------------------------------------------
 *  「Satellite / Vector、Flat / Globe を4条件で同じgesture比較。Satelliteだけ速い→symbol placement。
 *   Flatだけ速い→globe renderer。両方遅い→GPU pixel fill / UI composite / touch path。」
 *
 *  Four cells — {vector, satellite} × {flat, globe} — and a fifth that is not a cell but a known
 *  renderer defect: MapLibre 5.24 has an open issue where a globe tilted past ~40° above zoom 5,
 *  looking across the antimeridian, drops to single-digit fps in a bare map with no app on top.
 *  If IntMap's number there is the same shape, that cost belongs to the renderer and the round's
 *  answer is an upgrade, not an optimisation. Every cell gets the identical finger (mobile-trace's
 *  pan + pinch) after the identical settle, at the identical camera; the antimeridian cell moves
 *  the camera on purpose and says so.
 *
 *  Switching is done through the app's own commands — `view.base.sat` / `view.base.map`,
 *  `view.proj.globe` / `view.proj.flat` (js/app-body.js, js/map-projection.js) — so what is
 *  measured is the map a reader gets from the sidebar, not a style the harness assembled.
 *
 *    node scripts/view-matrix.mjs [--cpu 4] [--reps 2] [--json out.json] [--record]
 * ========================================================================== */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  launch, cdpFor, newContext, settle, waitFor, pan, zoom, touchPan, touchPinch, touchMetersOn, touchMetersOff,
  snap, framesBetween, deadline, ensureServer, phaseOf, PROBE, BASE, CPU, stats, has, val,
} from './mobile-trace.mjs';

const REPS = Number(val('--reps', 2));
const OUT = val('--json', null);

const CELLS = [
  { name: 'vector/flat', base: 'view.base.map', proj: 'view.proj.flat' },
  { name: 'vector/globe', base: 'view.base.map', proj: 'view.proj.globe' },
  { name: 'satellite/flat', base: 'view.base.sat', proj: 'view.proj.flat' },
  { name: 'satellite/globe', base: 'view.base.sat', proj: 'view.proj.globe' },
  /* maplibre/maplibre-gl-js#7672: globe · pitch ≳ 40° · zoom > 5 · looking across the date line */
  { name: 'vector/globe · dateline pitch 50', base: 'view.base.map', proj: 'view.proj.globe', camera: { center: [179.5, 25], zoom: 6, pitch: 50, bearing: 90 } },
];

async function exec(page, cmd, params) {
  return page.evaluate(([c, p]) => {
    try { const OS = window.IntMapOS; if (!OS || !OS.exec) return { ok: false, why: 'no IntMapOS' };
      Promise.resolve(OS.exec(c, p || {})).catch(() => {}); return { ok: true }; } catch (e) { return { ok: false, why: String(e) }; }
  }, [cmd, params || null]);
}
const view = (page) => page.evaluate(() => {
  try {
    const E = window.IntMapGeoEngine, m = E.raw(); const c = E.camera.get();
    let proj = null; try { proj = m.getProjection && m.getProjection(); } catch (_) {}
    const st = m.getStyle(); const sat = (st.layers || []).some((l) => /sat|imagery|esri|aerial/i.test(l.id) && m.getLayoutProperty(l.id, 'visibility') !== 'none');
    return { center: [+c.center.lng.toFixed(3), +c.center.lat.toFixed(3)], zoom: +c.zoom.toFixed(2), pitch: +(c.pitch || 0).toFixed(1), bearing: +(c.bearing || 0).toFixed(1), projection: proj && (proj.type || proj), satelliteLayerVisible: sat, layers: (st.layers || []).length };
  } catch (e) { return { error: String(e) }; }
});
async function cameraTo(page, cam) {
  await page.evaluate(async (c) => {
    const E = window.IntMapGeoEngine, m = E.raw();
    await new Promise((res) => {
      let done = false; const fin = () => { if (done) return; done = true; try { m.off('moveend', fin); } catch (_) {} res(); };
      m.on('moveend', fin); setTimeout(fin, 6000);
      try { E.camera.easeTo(Object.assign({ duration: 800 }, c)); } catch (_) { fin(); }
    });
  }, cam);
}
async function gesture(page, cdp) {
  const a = await snap(page);
  await touchMetersOn(page, false);
  await touchPan(page, cdp);
  await touchPinch(page, cdp);
  const touch = await touchMetersOff(page);
  const b = await snap(page);
  const p = phaseOf(a, b, await framesBetween(page, a, b));
  return { busyMs: p.busyMs, fps: p.fps, worstMs: p.worstFrameMs, frames: p.frames, placement: p.self.placement, render: p.self.render, mapRender: p.self.mapRender, decode: p.self.decode, texUpload: p.self.texUpload, otherMs: p.otherMs, latP95: touch && touch.latP95, rectPerMove: touch && touch.rectPerMove };
}

const server = await ensureServer(BASE);
const stopServer = () => { if (server) { try { server.kill(); } catch (_) {} } };
process.on('exit', stopServer); process.on('SIGINT', () => { stopServer(); process.exit(130); });

const runs = [];
for (let rep = 1; rep <= REPS; rep++) {
  const browser = await launch('chromium');
  const ctx = await newContext(browser);
  await ctx.addInitScript({ path: PROBE });
  const page = await ctx.newPage();
  const cdp = await cdpFor('chromium', ctx, page);
  if (!cdp) throw new Error('no CDP session — the finger needs Chromium');
  const t0 = Date.now();
  const cells = [];
  try {
    process.stdout.write(`  rep${rep} navigate …`);
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180_000 });
    const bootOk = await waitFor(page, () => window.__imBoot && window.__imBoot.isDone(), 120_000);
    process.stdout.write(` boot ${Date.now() - t0} ms (ready=${bootOk})\n`);
    await deadline(page.evaluate(() => window.__imTrace.attachMap()), 'attachMap');
    await settle(page, 2500);
    await pan(page); await zoom(page, +1); await zoom(page, -1);
    await touchPan(page, cdp); await touchPinch(page, cdp);
    const home = await view(page);
    for (const C of CELLS) {
      const t = Date.now();
      process.stdout.write(`    · ${C.name.padEnd(34)} `);
      const cell = { name: C.name };
      try {
        cell.set = { base: await exec(page, C.base), proj: await exec(page, C.proj) };
        await settle(page, 3000);
        if (C.camera) { await cameraTo(page, C.camera); await settle(page, 2500); }
        else { await cameraTo(page, { center: home.center, zoom: home.zoom, pitch: 0, bearing: 0 }); await settle(page, 1500); }
        cell.view = await view(page);
        /* first gesture on a fresh style is the slow one (#R202) — measured twice, second kept */
        cell.first = await deadline(gesture(page, cdp), `first ${C.name}`);
        cell.g = await deadline(gesture(page, cdp), `gesture ${C.name}`);
        console.log(`busy ${String(cell.g.busyMs).padStart(6)} · ${String(cell.g.fps).padStart(5)} fps · worst ${String(cell.g.worstMs).padStart(6)} · placemt ${String(cell.g.placement).padStart(5)} render ${String(cell.g.render).padStart(5)} mapRnd ${String(cell.g.mapRender).padStart(5)} decode ${String(cell.g.decode).padStart(5)} · first ${cell.first.fps} fps · ${cell.view.projection || '?'} sat=${cell.view.satelliteLayerVisible} z${cell.view.zoom} p${cell.view.pitch}  ${Date.now() - t} ms`);
      } catch (err) { cell.error = String((err && err.message) || err).slice(0, 160); console.log(`⚠ ${cell.error}`); }
      cells.push(cell);
    }
    /* back to the default map, so a rep ends where it started */
    await exec(page, 'view.proj.flat'); await exec(page, 'view.base.map');
  } finally { try { await ctx.close(); } catch (_) {} try { await browser.close(); } catch (_) {} }
  runs.push({ rep, cells, totalMs: Date.now() - t0 });
}

/* medians across reps */
const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const pad = (s, n) => String(s == null ? '—' : s).padStart(n);
console.log(`\n  MEDIAN OF ${REPS} (pan + pinch, cpu ×${CPU})`);
console.log(`  ${'cell'.padEnd(34)} ${pad('busy', 6)} ${pad('fps', 5)} ${pad('worst', 6)} ${pad('placemt', 7)} ${pad('render', 6)} ${pad('mapRnd', 6)} ${pad('decode', 6)} ${pad('texUpl', 6)} ${pad('other', 6)} ${pad('latP95', 6)} ${pad('1st fps', 7)}`);
const table = [];
for (const C of CELLS) {
  const gs = runs.map((r) => (r.cells.find((c) => c.name === C.name) || {})).filter((c) => c.g);
  const m = (k) => med(gs.map((c) => c.g[k]));
  const row = { name: C.name, busyMs: m('busyMs'), fps: m('fps'), worstMs: m('worstMs'), placement: m('placement'), render: m('render'), mapRender: m('mapRender'), decode: m('decode'), texUpload: m('texUpload'), otherMs: m('otherMs'), latP95: m('latP95'), firstFps: med(gs.map((c) => c.first && c.first.fps)), n: gs.length };
  table.push(row);
  console.log(`  ${C.name.padEnd(34)} ${pad(row.busyMs, 6)} ${pad(row.fps, 5)} ${pad(row.worstMs, 6)} ${pad(row.placement, 7)} ${pad(row.render, 6)} ${pad(row.mapRender, 6)} ${pad(row.decode, 6)} ${pad(row.texUpload, 6)} ${pad(row.otherMs, 6)} ${pad(row.latP95, 6)} ${pad(row.firstFps, 7)}${row.n < REPS ? `  (${row.n}/${REPS} reps)` : ''}`);
}
console.log(`\n  cache: ${stats.hit} replayed, ${stats.miss} missed, ${stats.blocked} blocked${stats.miss && !has('--record') ? '  ⚠ MISSES WERE BLOCKED — re-run once with --record' : ''}`);
console.log('  ⚠ desktop silicon, Chromium, replayed bytes: cells are comparable with EACH OTHER, not with a phone.');
if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ mode: 'view-matrix', cpu: CPU, reps: REPS, base: BASE, cells: CELLS, runs, table }, null, 2));
  console.log(`  → ${OUT}`);
}
stopServer();
