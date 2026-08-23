/* ============================================================================
 *  IntMap · aviation-live — the live-aircraft layer, end to end  (#R341)
 * ----------------------------------------------------------------------------
 *  This is the controller that sits between three things that do not know about each other:
 *
 *      src/aviation-worker.js  (owns the aircraft)  ──►  this  ──►  GE().layers.*AircraftCloud
 *                                                         │
 *                                                         └──►  IntMapAircraftPanel (the card)
 *
 *  WHAT IT DELIBERATELY DOES NOT DO
 *  --------------------------------
 *  · It never holds a per-aircraft JavaScript object. The worker's packed buffers go straight to
 *    the engine; the only aircraft this file ever materialises is the SELECTED one, for the card.
 *  · It never stops fetching because of zoom. The layer this replaces set `planesData=[]` below
 *    z2 and showed "Zoom in to load live aircraft" — measured in production at z1 while 270
 *    aircraft were on screen, which is the two-lists-disagree shape all over again. Zoom changes
 *    the DETAIL here (see sizeForZoom) and never the fleet.
 *  · It never invents an aircraft. There is no synthetic fallback in this path; a failed poll
 *    keeps the last real data and says so through status().
 *
 *  THE TWO CHANNELS
 *  ----------------
 *  `world` is every aircraft the feed knows about, refreshed slowly. `view` is the current
 *  viewport, refreshed quickly. They write into the SAME store, so an aircraft the viewport poll
 *  has just refreshed is simply fresher than its world copy — there is no seam between them and
 *  nothing to reconcile. Which of the two is worth asking for depends on zoom, and that is the
 *  only thing zoom decides.
 * ==========================================================================*/
/* The MapLibre GPU primitive travels in THIS chunk, not in the entry. js/orbit-points.js is
   imported eagerly by src/main.js because the satellite layer's contract is reachable from boot;
   the aircraft cloud is not reachable until something asks for this module, so importing it here
   keeps every byte of it behind the same door (§23.6). GE().addAircraftCloud looks for
   window.IntMapModules.aircraftPoints, which this import has published by the time any function
   below can run. */
import './aircraft-points.js';
/* ⚠ AND THE CODEC, ON THE PAGE. src/aviation-worker.js imports it too, but a worker's module graph
   is a DIFFERENT graph: nothing the worker imports exists on the main thread. Without this line
   `globalThis.IntMapAviationCodec` is undefined here, `hexOf()` returns null, and pick() answers
   null even when it has found the aircraft — measured (#R341): stage 1 returned 4 candidates,
   stage 2 projected them correctly, and the click still did nothing. It costs ~1 kB in a chunk
   that is already downloaded, and it is what turns a found aircraft into a name. */
import './aviation-codec.js';

window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.aviationLive = function (HOST) {
  'use strict';

  const GE = () => window.IntMapGeoEngine;
  const W = () => window.IntMapAviationWorker;

  const CLOUD_ID = 'lyr-aircraft-cloud';

  /* Polling. The world channel is slow because the server's own refresh is slow (its TTL is 30 s);
     asking faster would only re-serve the same bytes. The viewport channel is fast because that is
     the sky the user is actually looking at. */
  const WORLD_POLL_MS = 20000;
  const VIEW_POLL_MS = 12000;
  /* Above this zoom the viewport is a small enough patch of sky that asking about it specifically
     is worth a request; below it the viewport IS most of the world and the world channel already
     answers. Not a gate on drawing — a choice of which question to ask. */
  const VIEW_ZOOM_MIN = 3.5;

  const PICK_PX = 16;

  /* ── LOD (§11) ────────────────────────────────────────────────────────────
     Zoom changes how BIG and how detailed an aircraft is, never whether it is there. Below ~5 px
     the shader draws a dot instead of a dart (js/aircraft-points.js), so these are also the
     thresholds at which the silhouette appears. */
  const SIZE_RAMP = [[0, 3.5], [2, 5.5], [5, 9], [8, 14], [11, 19], [14, 24]];
  function sizeForZoom(z) {
    if (!(z >= 0)) return 9;
    const R = SIZE_RAMP;
    if (z <= R[0][0]) return R[0][1];
    if (z >= R[R.length - 1][0]) return R[R.length - 1][1];
    for (let i = 1; i < R.length; i++) {
      if (z <= R[i][0]) {
        const t = (z - R[i - 1][0]) / (R[i][0] - R[i - 1][0]);
        return R[i - 1][1] + (R[i][1] - R[i - 1][1]) * t;
      }
    }
    return 9;
  }

  /* ── state ────────────────────────────────────────────────────────────── */
  const ST = {
    on: false,
    endpoint: '',
    opacity: 0.9,
    lift: true,
    selected: null,
    /* the last frame's packed positions, kept ONLY so a pick can find what is drawn. These are the
       very arrays the GPU is reading; nothing here mutates them. */
    frame: null,
    ids: null,
    lastFrameAt: 0,
    worldTimer: 0, viewTimer: 0,
    status: {
      provider: '', attribution: '', coverage: '', serverAgeMs: 0, oldestObservationMs: 0, seq: 0,
      total: 0, rendered: 0, lastPollAt: 0, lastOkAt: 0,
      failures: 0, lastError: '', decodeMs: 0, applyMs: 0, packMs: 0, bytes: 0,
    },
  };

  /* ── the cloud layer ──────────────────────────────────────────────────── */
  function ensureLayer() {
    const E = GE();
    if (!E || !E.hasRenderer()) return false;
    if (E.layers.hasAircraftCloud && E.layers.hasAircraftCloud(CLOUD_ID)) return true;
    /* The engine answers false when it cannot draw this primitive (no WebGL2, or an adapter that
       does not implement it). The caller must be able to tell — see start(). */
    return !!E.layers.addAircraftCloud(CLOUD_ID);
  }

  function pushFrame(m) {
    ST.frame = m.buffers;
    ST.ids = m.ids;
    ST.lastFrameAt = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    ST.status.rendered = m.n;
    ST.status.total = m.total;
    ST.status.seq = m.seq;
    if (m.provider) ST.status.provider = m.provider;
    if (m.attribution) ST.status.attribution = m.attribution;
    if (m.coverage) ST.status.coverage = m.coverage;
    if (m.serverAgeMs != null) ST.status.serverAgeMs = m.serverAgeMs;
    if (m.oldestObservationMs != null) ST.status.oldestObservationMs = m.oldestObservationMs;
    if (m.packMs != null) ST.status.packMs = m.packMs;
    if (m.stat) {
      ST.status.decodeMs = m.stat.decodeMs;
      ST.status.applyMs = m.stat.applyMs;
      ST.status.bytes = m.stat.bytes;
      ST.status.lastOkAt = Date.now();
    }
    const E = GE();
    if (!E || !ST.on) return;
    let z = 0; try { z = E.camera.getZoom(); } catch (_) { }
    E.layers.setAircraftCloud(CLOUD_ID, {
      buffers: m.buffers,
      t0: ST.lastFrameAt,
      visible: true,
      opacity: ST.opacity,
      sizePx: sizeForZoom(z),
    });
  }

  /* ── polling ──────────────────────────────────────────────────────────── */
  function bboxQuery() {
    try {
      const b = GE().camera.getBounds();
      if (!b) return null;
      const w = b.getWest(), s = b.getSouth(), e = b.getEast(), n = b.getNorth();
      if (![w, s, e, n].every((v) => isFinite(v))) return null;
      return '&bbox=' + [w, s, e, n].map((v) => v.toFixed(3)).join(',');
    } catch (_) { return null; }
  }

  async function pollWorld() {
    if (!ST.on) return;
    ST.status.lastPollAt = Date.now();
    try { await W().poll('world'); }
    catch (e) {
      /* ⚠ A FAILED POLL CHANGES NOTHING ON SCREEN. The worker still holds every aircraft it had;
         all that happens is that they age, fade and eventually drop. That is the honest picture —
         emptying the layer would say "there are no aircraft", which is a different claim (§25.2). */
      ST.status.failures++;
      ST.status.lastError = (e && e.message) || 'poll_failed';
    }
  }

  async function pollView() {
    if (!ST.on) return;
    let z = 0; try { z = GE().camera.getZoom(); } catch (_) { }
    if (z < VIEW_ZOOM_MIN) return;
    const q = bboxQuery();
    if (!q) return;
    ST.status.lastPollAt = Date.now();
    try { await W().poll('view', q); }
    catch (e) {
      ST.status.failures++;
      ST.status.lastError = (e && e.message) || 'poll_failed';
    }
  }

  /* ── picking ──────────────────────────────────────────────────────────────
     Two stages, because neither alone is affordable at 50,000 aircraft:

       1. a MERCATOR pre-cull — one linear pass over the packed Float32Array, no projection, no
          allocation. It keeps only aircraft that could possibly land within PICK_PX of the
          pointer once projected.
       2. the engine's BATCHED projection over what survives — the same arithmetic the shader
          uses (GE().layers.projectMercAlt), so what can be clicked is what is drawn. #R186's rule.

     The pre-cull radius carries an ALTITUDE ALLOWANCE: a lifted aircraft is drawn away from its
     ground position, so culling on ground distance alone would make high aircraft unclickable —
     which is exactly the defect #R174 found in the layer this replaces. */
  function pick(pt) {
    const E = GE();
    if (!pt || !E || !ST.frame || !ST.ids || !ST.ids.length) return null;
    const B = ST.frame;
    const n = ST.ids.length;

    let ll = null;
    try { ll = E.coords.unproject(pt); } catch (_) { }
    if (!ll) return null;

    let world = 0;
    try { world = E.coords.worldSize(); } catch (_) { }
    if (!(world > 0)) world = 512 * Math.pow(2, (E.camera.getZoom() || 0));

    const px = (180 + ll.lng) / 360;
    const p = Math.max(-89.9999, Math.min(89.9999, ll.lat)) * Math.PI / 180;
    const py = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + p / 2))) / 360;

    /* The worst-case apparent displacement altitude can produce, in mercator units. alt·ms is
       exactly what the shader adds, so this bound cannot be too small. */
    let altAllow = 0;
    if (ST.lift) {
      for (let i = 0; i < n; i++) {
        const a = B.alt[i] * B.ms[i];
        if (a > altAllow) altAllow = a;
      }
    }
    const rad = (PICK_PX * 3) / world + altAllow;
    const rad2 = rad * rad;

    /* stage 1 — no allocation, no projection */
    const cand = [];
    for (let i = 0; i < n; i++) {
      let dx = B.pos[i * 2] - px;
      /* an antimeridian crossing is not half a world away */
      if (dx > 0.5) dx -= 1; else if (dx < -0.5) dx += 1;
      const dy = B.pos[i * 2 + 1] - py;
      if (dx * dx + dy * dy <= rad2) cand.push(i);
      if (cand.length >= 6000) break;   /* a bound, not a policy — see status().pickTruncated */
    }
    ST.status.pickCandidates = cand.length;
    if (!cand.length) return null;

    /* stage 2 — the renderer's own projection, in one batch */
    const xy = new Float64Array(cand.length * 3);
    for (let k = 0; k < cand.length; k++) {
      const i = cand[k];
      xy[k * 3] = B.pos[i * 2];
      xy[k * 3 + 1] = B.pos[i * 2 + 1];
      xy[k * 3 + 2] = ST.lift ? B.alt[i] : 0;
    }
    const scr = E.layers.projectMercAlt(xy);
    if (!scr) return null;

    let best = -1, bestD = PICK_PX * PICK_PX;
    for (let k = 0; k < cand.length; k++) {
      const sx = scr[k * 2], sy = scr[k * 2 + 1];
      if (!(sx === sx) || !(sy === sy)) continue;    /* NaN = behind the camera, or the far side */
      const dx = sx - pt.x, dy = sy - pt.y;
      const q = dx * dx + dy * dy;
      if (q < bestD) { bestD = q; best = cand[k]; }
    }
    if (best < 0) return null;
    return hexOf(ST.ids[best]);
  }

  function hexOf(num) {
    const C = globalThis.IntMapAviationCodec;
    return C ? C.numToHex(num) : null;
  }

  /* ── selection ────────────────────────────────────────────────────────── */
  async function select(hex) {
    ST.selected = hex || null;
    try { await W().select(hex || ''); } catch (_) { }
    return ST.selected;
  }

  async function detail(hex) {
    try {
      const r = await W().detail(hex);
      return r && r.detail;
    } catch (_) { return null; }
  }

  /* ── lifecycle ────────────────────────────────────────────────────────── */
  async function start(opts) {
    if (ST.on) return true;
    const o = opts || {};
    if (o.endpoint) ST.endpoint = o.endpoint;
    if (o.opacity != null) ST.opacity = o.opacity;
    if (o.lift != null) ST.lift = !!o.lift;

    if (!W() || !W().available()) return false;
    if (!ensureLayer()) return false;

    W().onFrame(pushFrame);
    try {
      await W().config({ endpoint: ST.endpoint, liftAltitude: ST.lift });
    } catch (_) { return false; }

    ST.on = true;
    /* Ask immediately, then on a timer. The first world answer is what fills an empty map. */
    pollWorld();
    pollView();
    ST.worldTimer = setInterval(pollWorld, WORLD_POLL_MS);
    ST.viewTimer = setInterval(pollView, VIEW_POLL_MS);
    return true;
  }

  function stop() {
    ST.on = false;
    if (ST.worldTimer) { clearInterval(ST.worldTimer); ST.worldTimer = 0; }
    if (ST.viewTimer) { clearInterval(ST.viewTimer); ST.viewTimer = 0; }
    const E = GE();
    try { if (E) E.layers.setAircraftCloud(CLOUD_ID, { visible: false }); } catch (_) { }
  }

  function destroy() {
    stop();
    const E = GE();
    try { if (E) E.layers.removeAircraftCloud(CLOUD_ID); } catch (_) { }
    try { if (W()) W().onFrame(null); } catch (_) { }
    ST.frame = null; ST.ids = null;
  }

  /* ── the knobs the existing UI already has ────────────────────────────── */
  function setOpacity(v) {
    ST.opacity = Math.max(0, Math.min(1, +v || 0));
    const E = GE();
    try { if (E && ST.on) E.layers.setAircraftCloud(CLOUD_ID, { opacity: ST.opacity }); } catch (_) { }
  }

  async function setLift(on) {
    ST.lift = !!on;
    try { await W().lift(ST.lift); } catch (_) { }
  }

  async function setFilter(f) {
    try { await W().filter(f || {}); } catch (_) { }
  }

  /* Re-sizing on zoom needs no repack — the size is a uniform, so this is one number per zoom
     change rather than a walk over the fleet. */
  function onZoom() {
    const E = GE();
    if (!E || !ST.on) return;
    let z = 0; try { z = E.camera.getZoom(); } catch (_) { }
    try { E.layers.setAircraftCloud(CLOUD_ID, { sizePx: sizeForZoom(z) }); } catch (_) { }
  }

  /* ── §24's measurement surface ────────────────────────────────────────── */
  /* (#R341) A SMALL SAMPLE OF WHAT IS ON SCREEN, for the layer-preview thumbnail. It reads the
     very buffers the GPU is reading — no second copy, no fetch, and nothing at all when the layer
     is off, which is what stops a thumbnail from becoming a per-visit request to the provider. */
  function snapshotFor(limit) {
    if (!ST.frame || !ST.ids || !ST.ids.length) return [];
    const B = ST.frame, n = Math.min(ST.ids.length, limit || 700);
    const out = [];
    for (let i = 0; i < n; i++) {
      const mx = B.pos[i * 2], my = B.pos[i * 2 + 1];
      if (!(mx === mx) || !(my === my)) continue;
      out.push({
        /* ⚠ (#R352) THE HEX WAS MISSING, and the caller could not tell. Production verification
           asked this API for aircraft identities and got back four geometry fields, so it had to
           fall back to firing pick() at a screen grid to obtain any. The store has the hex in
           ST.ids[i] — withholding it made the method look like it answered while answering
           something else. */
        hex: hexOf(ST.ids[i]),
        lon: mx * 360 - 180,
        lat: (Math.atan(Math.exp((0.5 - my) * 2 * Math.PI)) * 2 - Math.PI / 2) * 180 / Math.PI,
        altFt: B.alt[i] ? B.alt[i] / 0.3048 : 0,
        track: B.form[i * 2 + 1] * 180 / Math.PI,
      });
    }
    return out;
  }

  function status() {
    const s = ST.status;
    const now = Date.now();
    return {
      enabled: ST.on,
      provider: s.provider,
      /* what the UI must credit — ODbL 1.0 for the default provider (§22.4) */
      attribution: s.attribution,
      coverage: s.coverage,
      seq: s.seq,
      aircraftReceived: s.total,
      aircraftRendered: s.rendered,
      /* Three different ages, kept apart because §22.2 says they are three different facts. */
      /* how old the ANSWER is … */
      serverAgeMs: s.serverAgeMs,
      /* … and how old the OLDEST OBSERVATION in it is. Two facts, two fields (§22.2). */
      oldestObservationMs: s.oldestObservationMs,
      sinceLastPollMs: s.lastPollAt ? now - s.lastPollAt : null,
      sinceLastOkMs: s.lastOkAt ? now - s.lastOkAt : null,
      decodeMs: s.decodeMs, applyMs: s.applyMs, packMs: s.packMs,
      snapshotBytes: s.bytes,
      failures: s.failures,
      lastError: s.lastError,
      pickCandidates: s.pickCandidates || 0,
      /* §24: what the pick actually has to work with. A pick that answers null because the frame
         never arrived and a pick that answers null because nothing is under the pointer are two
         different faults, and without these two numbers they look identical. */
      frameLen: ST.frame && ST.frame.pos ? ST.frame.pos.length >> 1 : 0,
      idsLen: ST.ids ? ST.ids.length : 0,
      selected: ST.selected,
      liftAltitude: ST.lift,
      opacity: ST.opacity,
      endpoint: ST.endpoint,
      /* "updating" is a claim about the FEED, not about the store. A layer with 20,000 aircraft
         and a dead feed is showing real aircraft that are getting old — which is what the UI has
         to be able to say (§22.1). */
      updating: !!(s.lastOkAt && now - s.lastOkAt < WORLD_POLL_MS * 3),
    };
  }

  function workerStats() {
    try { return W().stats().then((r) => r && r.stats); } catch (_) { return Promise.resolve(null); }
  }

  return {
    CLOUD_ID,
    /* §24 names this `stats()`. It is the synchronous half — everything the page itself knows.
       The deeper counters live in the worker and are one round trip away (workerStats). */
    stats: status,
    start, stop, destroy,
    pollWorld, pollView,
    pick, select, detail, snapshotFor,
    setOpacity, setLift, setFilter, onZoom,
    sizeForZoom,
    status, workerStats,
    isOn: () => ST.on,
    selected: () => ST.selected,
  };
};
