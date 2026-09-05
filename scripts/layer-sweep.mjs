#!/usr/bin/env node
/* ============================================================================
 *  IntMap · EVERY LAYER, ONE AT A TIME, UNDER THE SAME FINGER  (#R512)
 * ----------------------------------------------------------------------------
 *  「`scripts/mobile-trace.mjs` でレイヤー二分探索。全OFF→半分ON→さらに半分、とやれば、R499型の
 *   暴走レイヤーは非常に速く見つかります。styledata/sec, setData/sec, add/removeLayer/sec,
 *   panel redraw/sec, fetch attempts/sec も一緒に記録するべきです。」
 *
 *  mobile-trace.mjs measures TWO layers (wind, alerts) because those were the two a report named.
 *  This sweeps every layer the reader can switch on, and asks each the same questions:
 *
 *    · what does ONE finger pan + ONE pinch cost with this layer on, against the same gesture with
 *      nothing extra on (busy ms, fps, worst frame, placement / render / decode buckets);
 *    · what does the layer do while the map is IDLE — fetch attempts, `styledata`, `setData`,
 *      add/removeLayer, per second. A layer that keeps the style busy while nobody touches the map
 *      is the #R499 shape (a retry loop that turns at microtask speed when a feed does not answer),
 *      and it is caught HERE, by a counter, not by a reader's thumb;
 *    · what it leaves behind after it is switched OFF — the same counters over a short window. A
 *      layer that keeps fetching or mutating the style after its box is unchecked is a leak.
 *
 *  ⚠ NOT A BISECTION. Halving finds ONE culprit in log₂ N steps and says nothing about the other
 *  N−1; a linear sweep costs N gestures (~10 s each) and produces a ranked table — which is what a
 *  round acts on. Layers can interact (two symbol layers compete for placement; two raster layers
 *  share the decode queue), so a layer's row here is its MARGINAL cost over the default set, not
 *  its cost in every combination. `--with <id,id>` keeps a fixed set on for the whole sweep so a
 *  combination can be measured too.
 *
 *  Everything that is not the sweep — boot, context, the finger, the snapshot arithmetic — is
 *  IMPORTED from mobile-trace.mjs (#R387/#R498), so the two instruments cannot drift: a busy
 *  millisecond here is the same busy millisecond there. Chromium only (real touch needs CDP).
 *
 *    node scripts/layer-sweep.mjs [--cpu 4] [--only <regex>] [--skip <regex>] [--limit N]
 *                                 [--with id,id] [--idle 3000] [--json out.json] [--record]
 *
 *  ⚠ The default is CPU ×1 (mobile-trace's default). --cpu 4 is the historical mobile figure.
 * ========================================================================== */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  launch, cdpFor, newContext, settle, waitFor, pan, zoom, touchPan, touchPinch, touchMetersOn, touchMetersOff,
  snap, framesBetween, deadline, ensureServer, phaseOf, PROBE, BASE, CPU, stats, has, val,
} from './mobile-trace.mjs';

const ONLY = val('--only', null) ? new RegExp(val('--only')) : null;
const SKIP = val('--skip', null) ? new RegExp(val('--skip')) : null;
const LIMIT = Number(val('--limit', 0)) || 0;
const WITH = (val('--with', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const IDLE_MS = Number(val('--idle', 3000));
const POST_MS = Number(val('--post', 1500));
const OUT = val('--json', null);
const ATTRIB = has('--attribute');

/* ── the counters the gesture cannot see ───────────────────────────────────
   Installed once, on the live map instance (own properties shadow the prototype, so every caller
   that goes through the engine's `_m().addLayer(...)` is counted), plus `window.fetch` and XHR for
   attempts — ATTEMPTS, not successes: the #R499 loop was invisible to any success-side meter. */
async function installCounters(page) {
  return page.evaluate(() => {
    if (window.__imSweep) return { ok: true, again: true };
    const C = window.__imSweep = {
      styledata: 0, sourcedata: 0, setData: 0, addLayer: 0, removeLayer: 0, setLayout: 0, setPaint: 0, setFilter: 0,
      addSource: 0, removeSource: 0, qrf: 0, fetch: 0, xhr: 0, longtasks: 0, longtaskMs: 0, hooks: {},
    };
    const m = window.IntMapGeoEngine && window.IntMapGeoEngine.raw && window.IntMapGeoEngine.raw();
    if (!m) return { ok: false, why: 'no raw map' };
    try { m.on('styledata', () => { C.styledata++; }); m.on('sourcedata', () => { C.sourcedata++; }); C.hooks.events = true; } catch (_) {}
    const wrapOwn = (obj, k, key) => {
      const o = obj[k]; if (typeof o !== 'function') return false;
      obj[k] = function () { C[key]++; return o.apply(this, arguments); };
      return true;
    };
    for (const [k, key] of [['addLayer', 'addLayer'], ['removeLayer', 'removeLayer'], ['setLayoutProperty', 'setLayout'],
      ['setPaintProperty', 'setPaint'], ['setFilter', 'setFilter'], ['addSource', 'addSource'], ['removeSource', 'removeSource'],
      ['queryRenderedFeatures', 'qrf']]) C.hooks[key] = wrapOwn(m, k, key);
    /* GeoJSONSource.setData lives on the source prototype; wrap it on the first geojson source
       that exists, and on the next addSource if none exists yet */
    const wrapSetData = () => {
      if (C.hooks.setData) return;
      try {
        const srcs = (m.getStyle() || {}).sources || {};
        for (const id of Object.keys(srcs)) {
          if (srcs[id].type !== 'geojson') continue;
          const s = m.getSource(id); if (!s) continue;
          const P = Object.getPrototypeOf(s); const o = P.setData; if (typeof o !== 'function') continue;
          P.setData = function () { C.setData++; return o.apply(this, arguments); };
          C.hooks.setData = true; return;
        }
      } catch (_) {}
    };
    wrapSetData();
    const AS = m.addSource;
    m.addSource = function () { C.addSource++; const r = AS.apply(this, arguments); wrapSetData(); return r; };
    try { const F = window.fetch; window.fetch = function () { C.fetch++; return F.apply(this, arguments); }; C.hooks.fetch = true; } catch (_) {}
    try { const O = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function () { C.xhr++; return O.apply(this, arguments); }; C.hooks.xhr = true; } catch (_) {}
    try {
      const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) { C.longtasks++; C.longtaskMs += e.duration; } });
      po.observe({ type: 'longtask', buffered: false }); C.hooks.longtask = true;
    } catch (_) {}
    return { ok: true, hooks: C.hooks };
  });
}
const counters = (page) => page.evaluate(() => {
  const C = window.__imSweep; const o = {};
  for (const k of Object.keys(C)) if (typeof C[k] === 'number') o[k] = C[k];
  o.t = performance.now(); return o;
});
function diff(a, b) {
  const o = {}; for (const k of Object.keys(b)) if (k !== 't') o[k] = (b[k] || 0) - (a[k] || 0);
  o.ms = Math.round(b.t - a.t); return o;
}
const perSec = (d, k) => (d.ms ? +((d[k] || 0) * 1000 / d.ms).toFixed(2) : 0);

/* ── which boxes exist ─────────────────────────────────────────────────────
   `#layer-dropdown input[type=checkbox]` is the ONE registry every other reader of the layer list
   walks — Atlas's layerCatalog(), layer-favs, session-tabs, feedback (docs/MAP-LAYERS.md) — so it
   is walked here too rather than a list kept in this file: a layer added next round is swept next
   run. ⚠ NOT `input[id^="dl-"]`: that spelling drops wp-dl-/fac-dl-/bx-/gx-/ox-/l9-dl-/eco-dl-/
   beta-dl-/cb- and keeps 44 of the 163. The basic rows (place names, borders, roads …) are kept:
   they are on by default and their cost is the cost of the DEFAULT map, which is the number the
   report is about. */
async function enumerate(page) {
  return page.evaluate(() => {
    const out = [];
    const basic = new Set(window.IntMapBasicLayers || []);
    for (const el of document.querySelectorAll('#layer-dropdown input[type="checkbox"][id]')) {
      const id = el.id;
      let label = '';
      try {
        const l = document.querySelector(`label[for="${CSS.escape(id)}"]`) || el.closest('label') || el.closest('.lyr-row');
        label = (l && l.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      } catch (_) {}
      let group = '';
      try {
        let n = el.closest('.lyr-row, label, .layer-option') || el;
        for (let i = 0; i < 400 && n; i++) { n = n.previousElementSibling; if (n && n.classList && n.classList.contains('lyr-head')) { group = (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28); break; } }
      } catch (_) {}
      out.push({ id, label, group, checked: !!el.checked, disabled: !!el.disabled, basic: basic.has(id) });
    }
    return out;
  });
}

/* ── switching a box, either way ───────────────────────────────────────────
   mobile-trace's layerOn tries the reader's `el.click()` first and reports which route worked,
   because for TWO layers a weaker statement is worth a second of waiting. Here that second would be
   paid 163 times for a route that is known to fail every time: js/data-layers.js cancels the
   dropdown's click in the capture phase and toggles from pointerup instead, so a synthetic click
   flips the box and is flipped straight back. The app's own command (`IntMapOS.exec('layer.on'|'layer.off')`,
   js/session-tabs.js) IS `checked = …` + `change{bubbles}` — so that operation is performed
   directly, which is what every one of the fifteen builders listens for on the input itself.
   ⚠ MEASURED on the smoke run: going through the command first cost the full 3 s poll on every
   flip and then fell through to this route anyway (the command is gated on its way in and the box
   never moved inside the window) — 6 s per row, 163 rows, for the same change event. */
async function setLayer(page, id, on) {
  return page.evaluate(async ([cb, want]) => {
    const el = document.getElementById(cb);
    if (!el || el.type !== 'checkbox') return { ran: false, why: 'absent' };
    if (!!el.checked === want) return { ran: true, already: true };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const done = async (ms) => { for (let i = 0; i < ms / 100; i++) { const n = document.getElementById(cb); if (n && !!n.checked === want) return i * 100; await wait(100); } return -1; };
    let waited = -1;
    try { el.checked = want; el.dispatchEvent(new Event('change', { bubbles: true })); waited = await done(3000); } catch (_) {}
    return waited >= 0 ? { ran: true, via: 'change', waitedMs: waited } : { ran: false, why: want ? 'stayed-off' : 'stayed-on', disabled: !!el.disabled };
  }, [id, !!on]);
}
/* the renderer's word, not the box's (#R353): js/data-layers.js publishes __imLayerPainted(cbId) */
const painted = (page, id) => page.evaluate((cb) => { try { return typeof window.__imLayerPainted === 'function' ? window.__imLayerPainted(cb) : null; } catch (_) { return null; } }, id);

/* how many of the app's own renderer layers are visible right now — the renderer's opinion, not the box's */
const visibleAppLayers = (page) => page.evaluate(() => {
  try {
    const m = window.IntMapGeoEngine.raw(); const s = m.getStyle(); let n = 0, all = 0;
    for (const l of (s.layers || [])) { if (!/^(lyr-|im-|wp-|dl-)/.test(l.id)) continue; all++; if (m.getLayoutProperty(l.id, 'visibility') !== 'none') n++; }
    return { visible: n, all, total: (s.layers || []).length };
  } catch (_) { return null; }
});

/* ── one measurement: idle window → gesture → numbers ─────────────────────── */
async function gesture(page, cdp) {
  const c0 = await counters(page);
  const a = await snap(page);
  await touchMetersOn(page, ATTRIB);
  await touchPan(page, cdp);
  await touchPinch(page, cdp);
  const touch = await touchMetersOff(page);
  const b = await snap(page);
  const c1 = await counters(page);
  const frames = await framesBetween(page, a, b);
  const ph = phaseOfLite(a, b, frames);
  return { ph, touch, c: diff(c0, c1) };
}
/* phaseOf's full shape is what mobile-trace prints; a lighter one reads better in a 100-row table */
function phaseOfLite(a, b, frames) {
  const p = phaseOf(a, b, frames);
  return { wallMs: p.wallMs, busyMs: p.busyMs, fps: p.fps, worstMs: p.worstFrameMs, frames: p.frames,
    placement: p.self.placement, render: p.self.render, mapRender: p.self.mapRender, decode: p.self.decode, texUpload: p.self.texUpload, otherMs: p.otherMs };
}
/* ⚠ IN TWO HALVES. A layer that fires a hundred fetches in the first seconds after ON and none
   afterwards is loading; one that fires at the same rate in the second half of the window is
   looping. One number over the whole window cannot tell them apart — the alerts row read 16/s over
   3 s and 6.9/s over 15 s, which is either a decaying burst or a steady loop, and the difference
   is the whole question. `half2` carries the second half's rates. */
async function idle(page, ms) {
  const c0 = await counters(page);
  const a = await snap(page);
  await page.waitForTimeout(Math.floor(ms / 2));
  const c05 = await counters(page);
  await page.waitForTimeout(ms - Math.floor(ms / 2));
  const b = await snap(page);
  const c1 = await counters(page);
  const d = diff(c0, c1);
  const h2 = diff(c05, c1);
  return Object.assign(d, { busyMs: Math.round((b.busy || 0) - (a.busy || 0)), half2: { fetch: perSec(h2, 'fetch'), styledata: perSec(h2, 'styledata'), setData: perSec(h2, 'setData'), ms: h2.ms } });
}

/* ── run ──────────────────────────────────────────────────────────────────── */
const server = await ensureServer(BASE);
const stopServer = () => { if (server) { try { server.kill(); } catch (_) {} } };
process.on('exit', stopServer); process.on('SIGINT', () => { stopServer(); process.exit(130); });

const browser = await launch('chromium');
const ctx = await newContext(browser);
await ctx.addInitScript({ path: PROBE });
const page = await ctx.newPage();
const cdp = await cdpFor('chromium', ctx, page);
if (!cdp) throw new Error('no CDP session — the finger needs Chromium');
const t0 = Date.now();
const rows = [];
let baseline = null, floor = null, layers = [];
let baselines = [];
try {
  process.stdout.write(`  navigate ${BASE} …`);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180_000 });
  const bootOk = await waitFor(page, () => window.__imBoot && window.__imBoot.isDone(), 120_000);
  process.stdout.write(` boot ${Date.now() - t0} ms (ready=${bootOk})\n`);
  const hooks = await deadline(page.evaluate(() => window.__imTrace.attachMap()), 'attachMap');
  console.log(`  probe hooks: ${JSON.stringify(hooks)}`);
  await settle(page, 2500);
  /* warm the map the way mobile-trace does, so the sweep never measures a first gesture — and then
     let it SIT: on the smoke run the baseline read 6,962 ms and the third row 2,867 ms with less on,
     because the default map was still fetching and decoding while the baseline was taken */
  await pan(page); await zoom(page, +1); await zoom(page, -1);
  await touchPan(page, cdp); await touchPinch(page, cdp);
  await settle(page, Number(val('--warm', 10000)));
  const inst = await installCounters(page);
  console.log(`  sweep counters: ${JSON.stringify(inst.hooks || inst)}`);

  layers = await enumerate(page);
  const on0 = layers.filter((l) => l.checked).map((l) => l.id);
  console.log(`  ${layers.length} layer switches found · ${on0.length} already on by default: ${on0.join(' ')}`);
  for (const id of WITH) { const r = await setLayer(page, id, true); console.log(`  --with ${id}: ${JSON.stringify(r)}`); }
  if (WITH.length) await settle(page, IDLE_MS);

  /* ⚠ THE BASELINE IS A MEDIAN OF THREE, AFTER A THROW-AWAY GESTURE — the first gesture after a
     boot is the slow one (#R202: 15.9 → 23.5 → 39.2 fps across three identical sweeps), and a
     baseline taken there would flatter every row after it. MEASURED on the smoke run: a single
     second gesture read 6,962 ms against 4,526 ms for a row with nothing extra on. And it DRIFTS —
     a browser that has swept forty layers is not the browser that measured the baseline — so it
     is taken again every REBASE rows and each row is read against the most recent one. */
  const REBASE = Number(val('--rebase', 12));
  const medianOf = (xs, k) => { const v = xs.map((x) => x.ph[k]).sort((a, b) => a - b); return v[Math.floor((v.length - 1) / 2)]; };
  async function measureBaseline() {
    await gesture(page, cdp);
    const gs = [await gesture(page, cdp), await gesture(page, cdp), await gesture(page, cdp)];
    const mid = gs.slice().sort((a, b) => a.ph.busyMs - b.ph.busyMs)[1];
    mid.ph = Object.assign({}, mid.ph, { busyMs: medianOf(gs, 'busyMs'), fps: medianOf(gs, 'fps'), worstMs: medianOf(gs, 'worstMs') });
    mid.spread = { busyMs: gs.map((g) => g.ph.busyMs), fps: gs.map((g) => g.ph.fps) };
    return mid;
  }
  baseline = await measureBaseline();
  baseline.idle = await idle(page, IDLE_MS);
  baseline.scene = await visibleAppLayers(page);
  baselines = [{ at: 0, ph: baseline.ph, spread: baseline.spread }];
  console.log(`  baseline (default set${WITH.length ? ' + ' + WITH.join(',') : ''}): busy ${baseline.ph.busyMs} ms (3 reps ${baseline.spread.busyMs.join('/')}) · ${baseline.ph.fps} fps · worst ${baseline.ph.worstMs} ms · rect/move ${baseline.touch && baseline.touch.rectPerMove} · idle fetch ${perSec(baseline.idle, 'fetch')}/s styledata ${perSec(baseline.idle, 'styledata')}/s · scene ${JSON.stringify(baseline.scene)}`);

  let todo = layers.filter((l) => !l.disabled && !WITH.includes(l.id));
  if (ONLY) todo = todo.filter((l) => ONLY.test(l.id) || ONLY.test(l.label));
  if (SKIP) todo = todo.filter((l) => !(SKIP.test(l.id) || SKIP.test(l.label)));
  if (LIMIT) todo = todo.slice(0, LIMIT);
  /* ⚠ THE DEFAULT-ON ROWS GO LAST. On the full run they were rows 1-11, read against the first
     baseline — the one taken in a browser still warming (4,570 → 1,390 ms twelve rows later) — so
     every one of them reported a Δ of −3,000 ms that was the browser, not the layer. */
  todo = todo.filter((l) => !l.checked).concat(todo.filter((l) => l.checked));
  console.log(`  sweeping ${todo.length} layers · idle window ${IDLE_MS} ms · post-off window ${POST_MS} ms · cpu ×${CPU}\n`);

  for (let i = 0; i < todo.length; i++) {
    const L = todo[i];
    if (i && REBASE && i % REBASE === 0) {
      const b = await deadline(measureBaseline(), `re-baseline at ${i}`);
      baselines.push({ at: i, ph: b.ph, spread: b.spread });
      baseline = Object.assign({}, baseline, { ph: b.ph, touch: b.touch, spread: b.spread });
      console.log(`  ── baseline again at row ${i}: busy ${b.ph.busyMs} ms (${b.spread.busyMs.join('/')}) · ${b.ph.fps} fps · worst ${b.ph.worstMs} ms`);
    }
    const t = Date.now();
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${todo.length}] ${(L.checked ? '−' : '+') + L.id.padEnd(33)} `);
    /* ⚠ A ROW IS THE COST OF FLIPPING THE BOX AWAY FROM ITS DEFAULT. For the 150-odd rows that are
       off by default that is on → gesture → off, and Δbusy is what the layer ADDS. For the rows on
       by default (place names, borders, roads, the night side …) it is off → gesture → on, and
       Δbusy is NEGATIVE by the amount the default map is paying for it — same column, read with
       the sign. `flip` says which way the row was taken. */
    const flip = L.checked ? 'off' : 'on';
    const row = { id: L.id, label: L.label, group: L.group, basic: !!L.basic, flip };
    try {
      row.on = await deadline(setLayer(page, L.id, flip === 'on'), `${flip} ${L.id}`);
      if (!row.on.ran) { row.skipped = row.on.why || 'not driven'; console.log(`— not driven: ${JSON.stringify(row.on)}`); rows.push(row); continue; }
      row.idle = await deadline(idle(page, IDLE_MS), `idle ${L.id}`);
      row.scene = await visibleAppLayers(page);
      row.painted = flip === 'on' ? await painted(page, L.id) : null;
      const g = await deadline(gesture(page, cdp), `gesture ${L.id}`);
      row.ph = g.ph; row.touch = g.touch; row.c = g.c;
      row.off = await deadline(setLayer(page, L.id, flip !== 'on'), `un${flip} ${L.id}`);
      row.post = await deadline(idle(page, POST_MS), `post ${L.id}`);
      row.dBusy = row.ph.busyMs - baseline.ph.busyMs;
      row.dFps = +(row.ph.fps - baseline.ph.fps).toFixed(1);
      row.baselineAt = baselines[baselines.length - 1].at;
      row.flags = [];
      if (perSec(row.idle, 'fetch') >= 2) row.flags.push('idle-fetch');
      if (perSec(row.idle, 'styledata') >= 1) row.flags.push('idle-styledata');
      if (perSec(row.idle, 'setData') >= 1) row.flags.push('idle-setData');
      /* still at it in the second half of the window: a loop, not a load */
      if (row.idle.half2.fetch >= 1 || row.idle.half2.styledata >= 0.5 || row.idle.half2.setData >= 0.5) row.flags.push('still-busy-at-rest');
      if (row.post.fetch >= 2 || row.post.styledata >= 2 || row.post.setData >= 1) row.flags.push('after-off');
      /* the renderer's own DOM.getScale is ~7 rect calls per move (#R499: 252 of 254 were MapLibre's);
         the flag is for a layer that ADDS layout reads to the finger, not for the renderer's floor */
      const rectFloor = (baseline.touch && baseline.touch.rectPerMove) || 0;
      row.dRectPerMove = row.touch ? +(row.touch.rectPerMove - rectFloor).toFixed(2) : null;
      if (row.dRectPerMove != null && row.dRectPerMove > 1.5) row.flags.push('rect/move');
      if (!row.off.ran) row.flags.push('stuck-' + flip);
      if (flip === 'on' && row.painted === false) row.flags.push('unpainted');
      console.log(`busy ${String(row.ph.busyMs).padStart(6)} (${(row.dBusy >= 0 ? '+' : '') + row.dBusy}) · ${String(row.ph.fps).padStart(5)} fps · worst ${String(row.ph.worstMs).padStart(6)} · idle f${perSec(row.idle, 'fetch')}/s sd${perSec(row.idle, 'styledata')}/s (2nd half f${row.idle.half2.fetch} sd${row.idle.half2.styledata} setD${row.idle.half2.setData}) · g styledata ${row.c.styledata} setData ${row.c.setData} qrf ${row.c.qrf} · rect/mv ${row.touch ? row.touch.rectPerMove : '—'} · ${flip} via ${row.on.via || 'already'}/${row.off.via || (row.off.ran ? 'already' : 'STUCK')}${row.painted === false ? ' UNPAINTED' : ''}${row.flags.length ? ' ⚠ ' + row.flags.join(',') : ''}  ${Date.now() - t} ms`);
    } catch (err) {
      row.error = String((err && err.message) || err).slice(0, 160);
      console.log(`⚠ ${row.error}`);
      /* a wedged page ends the sweep: the rows so far are still written */
      if (/wedged/.test(row.error)) { rows.push(row); break; }
    }
    rows.push(row);
  }

  /* ── the renderer's own floor, measured LAST, in the warmest browser of the run ────────────
     every app layer hidden through the engine (what perf-hud's `layers` switch does), and the
     default set measured once more right before it so the two are read against each other */
  const last = await deadline(measureBaseline(), 'final baseline');
  baselines.push({ at: todo.length, ph: last.ph, spread: last.spread });
  console.log(`  ── baseline at the end: busy ${last.ph.busyMs} ms (${last.spread.busyMs.join('/')}) · ${last.ph.fps} fps · worst ${last.ph.worstMs} ms`);
  const hid = await page.evaluate(() => {
    try {
      const E = window.IntMapGeoEngine, st = E.render.sceneStats(); const hidden = [];
      for (const id of (st && st.ids) || []) { if (!/^(lyr-|im-|wp-|dl-)/.test(id)) continue; hidden.push(id); E.layers.setVisible(id, false); }
      window.__imSweepHidden = hidden; return hidden.length;
    } catch (e) { return String(e); }
  });
  await settle(page, 1500);
  floor = await deadline(measureBaseline(), 'floor');
  floor.hidden = hid;
  floor.against = last.ph;
  await page.evaluate(() => { try { const E = window.IntMapGeoEngine; for (const id of window.__imSweepHidden || []) E.layers.setVisible(id, true); } catch (_) {} });
  console.log(`  floor (${hid} app layers hidden — basemap + UI only): busy ${floor.ph.busyMs} ms (${floor.spread.busyMs.join('/')}) · ${floor.ph.fps} fps · worst ${floor.ph.worstMs} ms · placement ${floor.ph.placement} · render ${floor.ph.render} — the default map's own layers cost ${last.ph.busyMs - floor.ph.busyMs} ms of that gesture`);
} finally {
  try { await ctx.close(); } catch (_) {}
  try { await browser.close(); } catch (_) {}
}

/* ── the table a round acts on ────────────────────────────────────────────── */
const ok = rows.filter((r) => r.ph);
ok.sort((x, y) => y.dBusy - x.dBusy);
const pad = (s, n) => String(s == null ? '—' : s).padStart(n);
console.log(`\n  RANKED BY MARGINAL BUSY (pan+pinch, cpu ×${CPU}) — baseline busy ${baseline ? baseline.ph.busyMs : '—'} ms / ${baseline ? baseline.ph.fps : '—'} fps · floor ${floor ? floor.ph.busyMs : '—'} ms / ${floor ? floor.ph.fps : '—'} fps`);
console.log(`  ${'layer'.padEnd(34)} ${pad('Δbusy', 7)} ${pad('busy', 6)} ${pad('fps', 5)} ${pad('worst', 6)} ${pad('placemt', 7)} ${pad('render', 6)} ${pad('decode', 6)} │ ${pad('idle f/s', 8)} ${pad('sd/s', 5)} ${pad('setD/s', 6)} │ ${pad('g:sd', 5)} ${pad('setD', 4)} ${pad('qrf', 4)} ${pad('rect/mv', 7)} ${pad('latP95', 6)} │ flags`);
for (const r of ok) {
  console.log(`  ${(r.flip === 'off' ? '−' : '+') + r.id.padEnd(33)} ${pad((r.dBusy >= 0 ? '+' : '') + r.dBusy, 7)} ${pad(r.ph.busyMs, 6)} ${pad(r.ph.fps, 5)} ${pad(r.ph.worstMs, 6)} ${pad(r.ph.placement, 7)} ${pad(r.ph.render, 6)} ${pad(r.ph.decode, 6)} │ ${pad(perSec(r.idle, 'fetch'), 8)} ${pad(perSec(r.idle, 'styledata'), 5)} ${pad(perSec(r.idle, 'setData'), 6)} │ ${pad(r.c.styledata, 5)} ${pad(r.c.setData, 4)} ${pad(r.c.qrf, 4)} ${pad(r.touch ? r.touch.rectPerMove : null, 7)} ${pad(r.touch ? r.touch.latP95 : null, 6)} │ ${(r.flags || []).join(',')}`);
}
const skipped = rows.filter((r) => !r.ph);
if (skipped.length) console.log(`\n  not measured (${skipped.length}): ` + skipped.map((r) => `${r.id} (${r.skipped || r.error})`).join(' · '));
console.log(`\n  ${rows.length} rows (Δbusy < 0 on a "−" row is what the default map pays for it) · ${Math.round((Date.now() - t0) / 1000)} s · cache: ${stats.hit} replayed, ${stats.miss} missed, ${stats.blocked} blocked${stats.miss && !has('--record') ? '  ⚠ MISSES WERE BLOCKED — re-run once with --record' : ''}`);
console.log('  ⚠ desktop silicon, Chromium, replayed bytes: a RANKING, not a phone number. Idle counters are attempts, not successes.');

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ mode: 'layer-sweep', cpu: CPU, base: BASE, idleMs: IDLE_MS, postMs: POST_MS, with: WITH, baseline, baselines, floor, layers, rows }, null, 2));
  console.log(`  → ${OUT}`);
}
stopServer();
