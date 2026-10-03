/* ============================================================================
 *  IntMap · map-motion — the gestures, the measurement and its arithmetic, shared by the instrument
 *  (scripts/map-motion.mjs) and the gate (tests/map-motion.spec.js). The in-page half is
 *  scripts/map-motion-probe.js; PROBE is its path, for `context.addInitScript({ path })`.
 * ==========================================================================*/
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROBE = join(dirname(fileURLToPath(import.meta.url)), 'map-motion-probe.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── statistics ── */
const q = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const r1 = (x) => (isFinite(x) ? Math.round(x * 10) / 10 : null);
const r3 = (x) => (isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const mx = (lng) => (lng + 180) / 360;
const my = (lat) => { const s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };

/* `opts`: { owner(stack) → name, charToSource(url,pos) → name, trace: bool, top: n } — the naming is
   the instrument's (it needs the build's source maps); the gate passes nothing and reads the numbers */
export function analyse(raw, kind, opts = {}) {
  raw = Object.assign({ cost: [], long: [], loaf: [], mutations: [], placements: 0, flips: 0, blinks: 0, t1: Infinity }, raw);
  const owner = opts.owner || (() => ''), charToSource = opts.charToSource || (() => null), TRACE = !!opts.trace, TOP = opts.top || 12;
  const F = raw.frames.filter((f) => isFinite(f.z));
  const mark = (n) => (raw.marks.find((m) => m.name === n) || {}).t;
  const tIn = mark('in'), tOut = mark('out'), tIdle = mark('idle');
  /* the moving span: from the first frame whose camera differs from the one before it to the last */
  let first = -1, last = -1;
  for (let i = 1; i < F.length; i++) {
    const a = F[i - 1], b = F[i];
    if (Math.abs(a.z - b.z) > 1e-6 || Math.abs(a.lng - b.lng) > 1e-9 || Math.abs(a.lat - b.lat) > 1e-9) { if (first < 0) first = i - 1; last = i; }
  }
  const mov = first >= 0 ? F.slice(first, last + 1) : [];
  const dts = []; for (let i = 1; i < mov.length; i++) dts.push(mov[i].t - mov[i - 1].t);
  const vsync = q(dts, 0.25) || 16.7;
  /* trajectory evenness: per-frame camera speed, and how much it changes frame to frame */
  const sp = [];
  for (let i = 1; i < mov.length; i++) {
    const a = mov[i - 1], b = mov[i], dt = Math.max(1, b.t - a.t);
    if (kind === 'zoom') sp.push(Math.abs(b.z - a.z) / dt);
    else { const ws = 512 * Math.pow(2, b.z); sp.push(Math.hypot((mx(b.lng) - mx(a.lng)) * ws, (my(b.lat) - my(a.lat)) * ws) / dt); }
  }
  const mean = sp.reduce((s, x) => s + x, 0) / Math.max(1, sp.length);
  /* the HANDOFF: camera speed just after the finger/button lets go over speed just before it. 1 is a
     glide that carries on at the speed it was released at; well under 1 is a visible brake at release */
  const spAt = (lo, hi) => { const v = []; for (let i = 1; i < mov.length; i++) if (mov[i].t > lo && mov[i].t <= hi) v.push(sp[i - 1]); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
  const handoff = (kind === 'pan' && tOut != null) ? spAt(tOut, tOut + 70) / spAt(tOut - 70, tOut) : NaN;
  /* …and the GLIDE START, which the window above smears: the first frame that moves after the release,
     over the median speed of the drag's last 120 ms. The release frame itself (no input) is skipped,
     because what a reader sees as a brake is the speed the glide comes back at. */
  let glideStart = NaN;
  if (tOut != null) {   /* a pinch's glide too: the zoom speed after the fingers lift over the speed before */
    const before = []; for (let i = 1; i < mov.length; i++) if (mov[i].t > tOut - 120 && mov[i].t <= tOut && sp[i - 1] > 0) before.push(sp[i - 1]);
    let g = NaN; for (let i = 1; i < mov.length; i++) if (mov[i].t > tOut && sp[i - 1] > 0) { g = sp[i - 1]; break; }
    glideStart = before.length ? g / q(before, 0.5) : NaN;
  }
  /* …and how far the glide carried the camera after the release, in screen pixels */
  let glidePx = NaN;
  if (kind === 'pan' && tOut != null) { glidePx = 0; for (let i = 1; i < mov.length; i++) if (mov[i].t > tOut + 20) glidePx += sp[i - 1] * (mov[i].t - mov[i - 1].t); }
  if (TRACE) console.log('     trace ' + kind + ' (speed per frame): ' + sp.map((x) => (kind === 'zoom' ? x * 1000 : x).toFixed(2)).join(' '));
  const jerk = []; for (let i = 1; i < sp.length; i++) jerk.push(Math.abs(sp[i] - sp[i - 1]));
  /* a STALL is a frame on which a camera that was moving the frame before did not move */
  let stalls = 0; for (let i = 1; i < sp.length - 1; i++) if (sp[i] === 0 && sp[i - 1] > 0 && sp[i + 1] > 0) stalls++;
  const camStop = mov.length ? mov[mov.length - 1].t : tOut;
  /* tiles as seen: share of ideal-tile·frames blank / blurry while moving, and from the camera stopping
     until no ideal tile is blank, and until every one is sharp */
  const cov = (fs) => { const a = { sharp: 0, blurry: 0, blank: 0 }; for (const f of fs) if (f.cover) { a.sharp += f.cover.sharp; a.blurry += f.cover.blurry; a.blank += f.cover.blank; } const n = a.sharp + a.blurry + a.blank; return n ? { blank: a.blank / n, blurry: a.blurry / n } : { blank: NaN, blurry: NaN }; };
  const movCov = cov(mov);
  const postStop = F.filter((f) => f.t >= camStop && f.cover);
  const firstNoBlank = postStop.find((f) => f.cover.blank === 0), firstSharp = postStop.find((f) => f.cover.blank === 0 && f.cover.blurry === 0);
  /* the area under the curve: ms × share of ideal tiles not sharp, from the first input to all-sharp */
  let unsharpMs = 0, blankMs = 0;
  for (let i = 1; i < F.length; i++) { const c = F[i].cover; if (!c || F[i].t < (tIn ?? 0)) continue; const n = c.sharp + c.blurry + c.blank; if (!n) continue; const dt = F[i].t - F[i - 1].t; unsharpMs += dt * (c.blurry + c.blank) / n; blankMs += dt * c.blank / n; }
  const unloaded = mov.filter((f) => f.loaded === false).length;
  const after = F.filter((f) => f.t >= camStop);
  const firstLoaded = after.find((f) => f.loaded === true);
  /* who ran */
  const by = new Map();
  for (const c of raw.cost) {
    if (!c.stack) { const e = by.get(c.kind) || { ms: 0, n: 0, max: 0 }; e.ms += c.ms; e.n += c.n; e.max = Math.max(e.max, c.max); by.set(c.kind, e); continue; }
    const k = c.kind.replace(/:(render|move|zoom|rotate|pitch|drag|wheel|data|sourcedata|styledata|idle|moveend|zoomend|movestart|zoomstart|dragstart|dragend)$/, ':$1') + ' ' + owner(c.stack);
    const e = by.get(k) || { ms: 0, n: 0, max: 0 }; e.ms += c.ms; e.n += c.n; e.max = Math.max(e.max, c.max); by.set(k, e);
  }
  const js = [...by].map(([k, e]) => ({ who: k, ms: r1(e.ms), n: e.n, max: r1(e.max) })).sort((a, b) => b.ms - a.ms);
  const appJs = js.filter((x) => !/maplibre-gl\(|^renderer:/.test(x.who));
  const rc = (k) => r1((js.find((x) => x.who === k) || { ms: 0 }).ms);
  const inWin = (e) => e.t >= (tIn ?? 0) && e.t <= raw.t1;
  return {
    movingFrames: mov.length,
    movingMs: r1(mov.length ? mov[mov.length - 1].t - mov[0].t : 0),
    frame: { p50: r1(q(dts, 0.5)), p95: r1(q(dts, 0.95)), max: r1(dts.length ? Math.max(...dts) : NaN), hitches: dts.filter((d) => d > 1.5 * vsync).length, vsync: r1(vsync) },
    path: { handoff: r3(handoff), glideStart: r3(glideStart), glidePx: r1(glidePx), evenness: r3(mean > 0 ? (jerk.reduce((s, x) => s + x, 0) / Math.max(1, jerk.length)) / mean : NaN), stalls },
    long: { tasks: raw.long.filter(inWin).length, taskMs: r1(raw.long.filter(inWin).reduce((s, e) => s + e.d, 0)),
      loaf: raw.loaf.filter(inWin).length, blockingMs: r1(raw.loaf.filter(inWin).reduce((s, e) => s + e.block, 0)) },
    seen: { blankWhileMoving: r3(movCov.blank), blurryWhileMoving: r3(movCov.blurry),
      noBlankAfterStopMs: r1(firstNoBlank ? firstNoBlank.t - camStop : NaN), sharpAfterStopMs: r1(firstSharp ? firstSharp.t - camStop : NaN),
      blankMs: r1(blankMs), unsharpMs: r1(unsharpMs),
      by: Object.entries(raw.coverBy || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => k + '×' + n).join(' ') },
    tiles: { waitingShare: r3(mov.length ? unloaded / mov.length : NaN), settleMs: r1(firstLoaded ? firstLoaded.t - camStop : NaN), idleAfterInputMs: r1(tIdle != null && tOut != null ? tIdle - tOut : NaN) },
    labels: { placementShare: r3(mov.length ? raw.placements / mov.length : NaN), placements: raw.placements, flips: raw.flips, blinks: raw.blinks, placementMs: rc('renderer:placement'), paintMs: rc('renderer:paint') },
    loafScripts: (() => { const m = new Map();
      for (const e of raw.loaf.filter(inWin)) for (const sc of e.scripts) { if (!(sc.d > 0)) continue;
        const k = (sc.src && charToSource(sc.src, sc.pos)) || `${sc.inv || ''} ${sc.fn || ''} ${(sc.src || '').split('/').pop()}`;
        m.set(k, (m.get(k) || 0) + sc.d); }
      return [...m].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, d]) => [k, r1(d)]); })(),
    styleWrites: raw.mutations.reduce((a, m) => a + m[1], 0),
    pageWrites: raw.mutations.filter(([k]) => /^(body|html)(?![\w-])/.test(k)).reduce((a, m) => a + m[1], 0),
    styleWriters: raw.mutations,
    jsAppMs: r1(appJs.reduce((s, x) => s + x.ms, 0)),
    jsTotalMs: r1(js.reduce((s, x) => s + x.ms, 0)),
    js: js.slice(0, TOP),
  };
}

/* ── the gestures ── */
export async function canvasBox(page) {
  return page.evaluate(() => { const r = window.__imap.getCanvas().getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
}
export async function jump(page, view) {
  await page.evaluate((v) => new Promise((res) => { const m = window.__imap; m.jumpTo(v); let done = false; const f = () => { if (!done) { done = true; res(); } }; m.once('idle', f); setTimeout(f, 12000); }), view);
  await sleep(600);
}
/* ── input at a steady cadence ──
   A real digitiser reports at 60–120 Hz whatever the page is doing. Awaiting each CDP round trip
   instead paces the input by the machine's load (measured: one move per THREE frames on a busy
   machine), which turns every pan into a staircase that is the driver's, not the map's. So events
   are issued on a fixed clock — spun to the millisecond in node, not slept to the OS timer's 15.6 ms
   — and NOT awaited one by one; CDP keeps them in order. */
export const spinUntil = (t) => { while (performance.now() < t) { /* spin: the timer is too coarse */ } };
export async function paced(n, everyMs, fn) {
  const t0 = performance.now() + 2, sent = [];
  for (let i = 0; i < n; i++) { spinUntil(t0 + i * everyMs); sent.push(fn(i)); await new Promise((r) => setImmediate(r)); }
  await Promise.all(sent);
}
export const mouse = (cdp, type, x, y, extra) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...(extra || {}) });
const wheelAt = (cdp, x, y, dy) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy });
export const touch = (cdp, type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
export const FRAME = 1000 / 60;
export const GESTURES = {
  desktop: {
    /* eight notches of a mouse wheel at a brisk 45 ms, in, a short pause, then eight out */
    wheel: { kind: 'zoom', view: { center: [139.7, 35.68], zoom: 5, pitch: 0, bearing: 0 }, async run(page, b, cdp) {
      const x = b.x + b.w * 0.6, y = b.y + b.h * 0.45;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await paced(8, 45, () => wheelAt(cdp, x, y, -100));
      await sleep(350);
      await paced(8, 45, () => wheelAt(cdp, x, y, 100));
    } },
    /* a drag at 60 Hz, released at speed — the glide after release is the inertia */
    drag: { kind: 'pan', view: { center: [2.35, 48.85], zoom: 6, pitch: 0, bearing: 0 }, async run(page, b, cdp) {
      const x0 = b.x + b.w * 0.7, y0 = b.y + b.h * 0.5;
      await mouse(cdp, 'mouseMoved', x0, y0, { buttons: 0 }); await mouse(cdp, 'mousePressed', x0, y0);
      /* the release is the next beat of the same clock — a hand lets go within a frame of its last move */
      await paced(25, FRAME, (i) => (i < 24 ? mouse(cdp, 'mouseMoved', x0 - 16 * (i + 1), y0 - 4 * (i + 1)) : mouse(cdp, 'mouseReleased', x0 - 16 * 24, y0 - 4 * 24)));
    } },
    dblclick: { kind: 'zoom', view: { center: [-74.0, 40.7], zoom: 8, pitch: 0, bearing: 0 }, async run(page, b) {
      await page.mouse.dblclick(b.x + b.w * 0.55, b.y + b.h * 0.5);
    } },
    /* the globe: a world-scale wheel in */
    /* a wheel zoom OUT across z5.4, where the satellite basemap's night side is built (js/night-side.js),
       and 2.5 s after it for the idle work that build leaves */
    wheelOut: { kind: 'zoom', view: { center: [100, 20], zoom: 6.6, pitch: 0, bearing: 0 }, after: 2500, async run(page, b, cdp) {
      const x = b.x + b.w * 0.5, y = b.y + b.h * 0.5;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await paced(8, 45, () => wheelAt(cdp, x, y, 100));
    } },
    /* a long drag at city zoom into ground the camera has not seen, released at speed */
    longDrag: { kind: 'pan', view: { center: [139.7, 35.68], zoom: 12, pitch: 0, bearing: 0 }, async run(page, b, cdp) {
      const x0 = b.x + b.w * 0.85, y0 = b.y + b.h * 0.5;
      await mouse(cdp, 'mouseMoved', x0, y0, { buttons: 0 }); await mouse(cdp, 'mousePressed', x0, y0);
      await paced(37, FRAME, (i) => (i < 36 ? mouse(cdp, 'mouseMoved', x0 - 22 * (i + 1), y0 - 3 * (i + 1)) : mouse(cdp, 'mouseReleased', x0 - 22 * 36, y0 - 3 * 36)));
    } },
    globeWheel: { kind: 'zoom', view: { center: [20, 25], zoom: 1.6, pitch: 0, bearing: 0 }, async run(page, b, cdp) {
      const x = b.x + b.w * 0.5, y = b.y + b.h * 0.5;
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await paced(10, 45, () => wheelAt(cdp, x, y, -100));
    } },
  },
  mobile: {
    pan: { kind: 'pan', view: { center: [139.7, 35.68], zoom: 11, pitch: 0, bearing: 0 }, async run(page, b, cdp) {
      const x0 = b.x + b.w * 0.75, y0 = b.y + b.h * 0.45;
      await touch(cdp, 'touchStart', [{ x: x0, y: y0, id: 0 }]);
      await paced(19, FRAME, (i) => (i < 18 ? touch(cdp, 'touchMove', [{ x: x0 - 13 * (i + 1), y: y0 + 3 * (i + 1), id: 0 }]) : touch(cdp, 'touchEnd', [])));
    } },
    pinch: { kind: 'zoom', view: { center: [139.7, 35.68], zoom: 6, pitch: 0, bearing: 0 }, async run(page, b, cdp) {
      const cx = b.x + b.w / 2, cy = b.y + b.h * 0.42;
      const pts = (r) => [{ x: cx - r, y: cy, id: 0 }, { x: cx + r, y: cy, id: 1 }];
      await touch(cdp, 'touchStart', pts(40));
      await paced(31, FRAME, (i) => (i < 30 ? touch(cdp, 'touchMove', pts(40 + 4.5 * (i + 1))) : touch(cdp, 'touchEnd', [])));
    } },
    /* over open ocean: a tap on a place label opens its card (the label owns the tap) and the zoom is
       then not what is being measured — measured at New York z8, 0 moving frames in both builds */
    doubletap: { kind: 'zoom', view: { center: [-40.0, 30.0], zoom: 5, pitch: 0, bearing: 0 }, async run(page, b, cdp) {
      const x = b.x + b.w / 2, y = b.y + b.h * 0.42;
      /* Playwright's tap, not two raw CDP touches: measured, the raw pair (40 ms down, 110 ms apart)
         produced two clicks and NO dblclick in Chromium's touch emulation, so the zoom never ran */
      await page.touchscreen.tap(x, y); await sleep(120); await page.touchscreen.tap(x, y);
    } },
  },
};

/* `rep` moves the gesture somewhere the renderer has not been (REP_SHIFT_DEG of longitude per rep):
   a repeat in the same place is drawn from the tile cache and says nothing about arriving tiles */
export const REP_SHIFT_DEG = 9;
export async function measure(page, cdp, g, rep = 0) {
  const c = g.view.center;
  await jump(page, Object.assign({}, g.view, { center: [((c[0] + rep * REP_SHIFT_DEG + 540) % 360) - 180, c[1]] }));
  const b = await canvasBox(page);
  await page.evaluate(() => { window.__mm.start(); window.__mm.mark('in'); });
  await g.run(page, b, cdp);
  await page.evaluate(() => window.__mm.mark('out'));
  await page.evaluate(() => new Promise((res) => {
    const m = window.__imap; let done = false;
    const fin = () => { if (done) return; done = true; window.__mm.mark('idle'); res(); };
    const wait = () => { if (m.isMoving()) return setTimeout(wait, 30); m.once('idle', fin); if (m.loaded() && m.areTilesLoaded() && !m.isMoving()) setTimeout(() => { if (!m.isMoving() && m.areTilesLoaded()) fin(); }, 60); };
    wait(); setTimeout(fin, 12000);
  }));
  await sleep(g.after || 250);   /* work a gesture leaves behind (an idle callback) is part of its cost */
  return page.evaluate(() => window.__mm.stop());
}


/* ── the same gestures in the RENDERER'S time ──
   A runner with no GPU draws a frame every 50–100 ms, and on such a runner the camera's trajectory
   is a picture of the frame clock, not of the map: the real-time numbers above cannot gate there.
   So the gate also runs each gesture against a FROZEN renderer clock (maplibregl.setNow — the clock
   MapLibre's wheel, drag, inertia and ease all read, and js/geo-engine.js's wheel spring with them),
   advanced 1000/60 ms per step, with the input delivered by CDP at its scheduled step and one real
   frame rendered per step. The result is the trajectory a 60 Hz display would show, whatever the
   machine — and it is the real app and the real renderer computing it. */
export const STEP = 1000 / 60;
async function renderedAt(page, t) {
  return page.evaluate((t) => new Promise((res) => {
    const m = window.__imap; window.maplibregl.setNow(t); m.triggerRepaint();
    const raf = window.__mm && window.__mm.rawRAF ? window.__mm.rawRAF : requestAnimationFrame;
    raf(() => raf(() => { const c = m.getCenter(); res({ t, z: m.getZoom(), lng: c.lng, lat: c.lat }); }));
  }), t);
}
/* `events(k, box)` → the CDP calls to make at step k (an array of thunks); `steps` the number of steps;
   `marks` names steps: { out: k } is the release */
export async function virtualRun(page, cdp, g, plan) {
  await jump(page, g.view);
  const b = await canvasBox(page);
  const t0 = await page.evaluate(() => Math.ceil(performance.now()) + 100000);
  const frames = [];
  try {
    for (let k = 0; k < plan.steps; k++) {
      const t = t0 + k * STEP;
      /* an event is a thunk (delivered at the frame's own time) or { at, call } with `at` the ms since
         the start — input does not arrive on frame boundaries, and WHERE between two frames it lands
         is exactly what a handler that restarts its clock per event is sensitive to */
      for (const e of plan.events(k, b)) {
        const at = typeof e === 'function' ? t : t0 + e.at;
        await page.evaluate((x) => window.maplibregl.setNow(x), at);
        await (typeof e === 'function' ? e : e.call)(cdp);
      }
      await page.evaluate((t) => window.maplibregl.setNow(t), t);
      frames.push(await renderedAt(page, t));
    }
  } finally { await page.evaluate(() => window.maplibregl.restoreNow()); }
  return { frames, marks: [{ name: 'in', t: t0 }, { name: 'out', t: t0 + (plan.out == null ? plan.steps : plan.out) * STEP - 1 }] };
}
export const PLANS = {
  /* eight notches 45 ms apart, each delivered at ITS time — between frames, where a real one lands */
  wheel: (dy = -100) => ({ steps: 46, events: (k, b) => {
    const due = []; for (let i = 0; i < 8; i++) if (Math.ceil(i * 45 / STEP) === k) due.push(i);
    return due.map((i) => ({ at: i * 45, call: (cdp) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: b.x + b.w * 0.6, y: b.y + b.h * 0.45, deltaX: 0, deltaY: dy }) }));
  } }),
  /* press, twenty moves of 16 px one per step, release on the next step, then 30 steps of glide */
  drag: () => ({ steps: 52, out: 21, events: (k, b) => {
    const x0 = b.x + b.w * 0.7, y0 = b.y + b.h * 0.5;
    if (k === 0) return [(c) => mouse(c, 'mouseMoved', x0, y0, { buttons: 0 }), (c) => mouse(c, 'mousePressed', x0, y0)];
    if (k <= 20) return [(c) => mouse(c, 'mouseMoved', x0 - 16 * k, y0 - 4 * k)];
    if (k === 21) return [(c) => mouse(c, 'mouseReleased', x0 - 16 * 20, y0 - 4 * 20)];
    return [];
  } }),
  /* two fingers spreading at 60 Hz (radius 40 → 175 px), both lifted on the next step, then the glide */
  pinch: () => ({ steps: 56, out: 31, events: (k, b) => {
    const cx = b.x + b.w / 2, cy = b.y + b.h * 0.42;
    const pts = (r) => [{ x: cx - r, y: cy, id: 0 }, { x: cx + r, y: cy, id: 1 }];
    if (k === 0) return [(c) => touch(c, 'touchStart', pts(40))];
    if (k <= 30) return [(c) => touch(c, 'touchMove', pts(40 + 4.5 * k))];
    if (k === 31) return [(c) => touch(c, 'touchEnd', [])];
    return [];
  } }),
  /* a finger: down, eighteen moves of 13 px, lift on the next step, then the glide */
  pan: () => ({ steps: 50, out: 19, events: (k, b) => {
    const x0 = b.x + b.w * 0.75, y0 = b.y + b.h * 0.45;
    if (k === 0) return [(c) => touch(c, 'touchStart', [{ x: x0, y: y0, id: 0 }])];
    if (k <= 18) return [(c) => touch(c, 'touchMove', [{ x: x0 - 13 * k, y: y0 + 3 * k, id: 0 }])];
    if (k === 19) return [(c) => touch(c, 'touchEnd', [])];
    return [];
  } }),
};
