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
 *  nothing to reconcile. BOTH are asked at every zoom (#R401): the floor that used to keep the
 *  viewport channel above z3.5 is gone, because the measurement it rested on — 「the world channel
 *  already answers down there」 — was false outside Europe. See VIEW_POLL_MS below for the numbers.
 *  Zoom now decides only how big the mark is (sizeForZoom), never what is asked or what is drawn.
 * ==========================================================================*/
/* The MapLibre GPU primitive travels in THIS chunk, not in the entry. js/orbit-points.js is
   imported eagerly by src/main.js because the satellite layer's contract is reachable from boot;
   the aircraft cloud is not reachable until something asks for this module, so importing it here
   keeps every byte of it behind the same door (§23.6). GE().addAircraftCloud looks for
   window.IntMapModules.aircraftPoints, which this import has published by the time any function
   below can run. */
import './aircraft-points.js';
/* (#R379) …and the mark, because SIZE_RAMP below reads its size table. It arrives through the line
   above anyway; naming it here is what makes the dependency a fact of the module graph rather than
   an assumption about somebody else's imports. */
import './plane-glyph.js';
/* ⚠ AND THE CODEC, ON THE PAGE. src/aviation-worker.js imports it too, but a worker's module graph
   is a DIFFERENT graph: nothing the worker imports exists on the main thread. Without this line
   `globalThis.IntMapAviationCodec` is undefined here, `hexOf()` returns null, and pick() answers
   null even when it has found the aircraft — measured (#R341): stage 1 returned 4 candidates,
   stage 2 projected them correctly, and the click still did nothing. It costs ~1 kB in a chunk
   that is already downloaded, and it is what turns a found aircraft into a name. */
import './aviation-codec.js';
/* ⚠ (#R783) …AND THE MODEL, FOR THE SAME REASON, WHICH IS WHY IT HAD TO BE MEASURED RATHER THAN
   ASSUMED. `js/aviation-model.js` was imported by src/aviation-worker.js and by NOBODY ELSE — so on
   the main thread `window.IntMapAviationModel` did not exist at all, and the acquisition door below
   (which asks it for the feed's address, for the bbox query and for the reach sentence) would have
   answered `map-unavailable` on every call in the shipped app while every check stayed green. This
   is the trap the codec's own note two lines up describes, met a second time by the second half of
   the pair: a worker's module graph is a DIFFERENT graph. */
import './aviation-model.js';
/* (#R408) …and the one timer wheel, so the two polls below are entries in it rather than two more
   independent wake-ups in a backgrounded tab — see js/runtime.js. */
import { everyTick, stopTick } from './runtime.js';

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
  /* ── (#R401) THE VIEWPORT CHANNEL IS ASKED AT EVERY ZOOM ─────────────────────────────────────
     「より低ズームでもより多くの航空機が表示されるように。」
     #R341 put a floor of z3.5 here with the reason 「below it the viewport IS most of the world and
     the world channel already answers」. MEASURED against production, parked over North America
     for 45 seconds with the layer on:

         z3.2   requests issued: ?ch=world ×3          aircraft on screen:   4 →   4
         z4.2   requests issued: ?ch=view ×4, world ×3 aircraft on screen:   0 → 177

     The world channel does NOT answer for most of the world: its set is the union of the lattice
     slices the sweeper has paid for and the viewports other people have looked at, and outside
     Europe that is nearly nothing (measured: 4 aircraft across the whole of North America). So the
     floor was not choosing between two answers — below it there was no second answer, and crossing
     z3.5 was the whole difference between an empty continent and a busy one.
     ⚠ ASKING COSTS NO MORE AT LOW ZOOM THAN AT HIGH. The server bounds a viewport read at
     VIEW_MAX_TILES tiles whatever the box, rounds the cache key to half a degree so nearby views
     share one upstream read, and only goes upstream when the box's own sky is stale — none of
     which this change touches. What it does change is that a low-zoom session now contributes to
     the shared world set instead of only consuming it.
     ⚠ THERE IS NO REPLACEMENT CONSTANT. A floor of zero is a gate that can never fire, and this
     project has met that shape often enough to know it reads as a live rule for the next reader
     (#R317: 「常に赤い検査は走っていない検査」). pollView() below simply asks. */

  const PICK_PX = 16;

  /* ── LOD (§11) ────────────────────────────────────────────────────────────
     Zoom changes how BIG and how detailed an aircraft is, never whether it is there. Below ~5 px
     the shader draws a dot instead of the silhouette (js/aircraft-points.js), so these are also the
     thresholds at which the aeroplane appears. The number is the SPRITE BOX in CSS pixels — the
     mark itself reaches 92 % of it, the rest being the margin an anti-aliased edge needs.

     ⚠ (#R379) THE TOP OF THIS RAMP IS THE ORIGINAL MARK'S OWN SIZE, NOT A NUMBER CHOSEN HERE.
     Restoring the plan-form silhouette without restoring how big it was drawn would put the old
     shape back at a third of the old size, which is a different picture again — measured, the
     glyph was 26.8 CSS px long at z5 and 36.1 from z9 up, against this ramp's 9 and 19. So from z8
     the box is `IntMapPlaneGlyph.boxPx(z)`, the artwork box the symbol layer's `icon-size` used to
     produce, and above z9 it is FLAT because the original ramp's last stop is z9 — an aeroplane
     that keeps growing to z14 was never part of the mark.
     ⚠ …and the low end is untouched. At z0–5 the world holds tens of thousands of aircraft and the
     old layer never had to draw them (it capped at 4,000 and switched off below z2); a 22-px mark
     each would be a smear rather than a fleet. Zoom in and the mark becomes the one that shipped. */
  const G = window.IntMapPlaneGlyph;
  const SIZE_RAMP = [[0, 3.5], [2, 5.5], [5, 9], [8, G.boxPx(8)], [9, G.boxPx(9)]];
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
    /* (#R506) the page's callback for "the selected aircraft's observed track has more fixes".
       ⚠ THE WORKER HAS BEEN RECORDING THIS SINCE #R341 AND NOBODY EVER ASKED FOR IT. src/
       aviation-worker.js keeps a ring buffer per aircraft (TRACK, 2,000 × 64 fixes, viewport
       channel only) precisely so that selecting an aeroplane shows where it has already been —
       #R341 wrote that the behaviour "is kept, it is a real feature and CONSTITUTION §0.3 forbids
       shrinking one". What it did not keep was the OTHER end: the drawing, the card's Show/Hide
       row and Atlas's layers.aircraftTrack all still read the OLD layer's planeTracks, which the
       old sweep stopped filling the moment this platform replaced it. So the fixes accumulated in
       the worker and nothing on the map or in the card could reach them (reported: 「前までトラック
       もあったんですが、なくなってしまいました」). This is the missing wire. */
    onTrack: null,
    /* (#R783) the acquisition receipt — the last attempt at the camera-free door, successful or not.
       See the ACQUISITION section below for why a failed attempt has to leave one behind. */
    reach: null,
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
    /* (#R506) …and hand the page the selected aircraft's track. A frame IS the moment a new fix
       can exist, so this is one worker round trip per publish and ONLY while something is
       selected — not a timer of its own, and nothing at all for the 99 % of sessions that never
       click an aeroplane. */
    if (ST.selected && ST.onTrack) {
      W().track(ST.selected)
        .then((r) => { if (ST.selected && ST.onTrack) ST.onTrack(ST.selected, (r && r.track) || []); })
        .catch(() => { });
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
  /* THE DRAWING'S OWN CHANNEL, and this is the one place in the file where the camera is the
     window — because the picture IS the camera. ⚠ (#R783) THE QUERY STRING IS BUILT IN ONE PLACE
     (MODEL.bboxParam): the acquisition door below asks for a box a caller named, this asks for the
     box the reader is looking at, and two spellings of `&bbox=` would drift into two cache keys. */
  function bboxQuery() {
    try {
      const b = GE().camera.getBounds();
      if (!b) return null;
      return window.IntMapAviationModel.bboxParam({ w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() });
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
    const q = bboxQuery();
    if (!q) return;
    ST.status.lastPollAt = Date.now();
    try { await W().poll('view', q); }
    catch (e) {
      ST.status.failures++;
      ST.status.lastError = (e && e.message) || 'poll_failed';
    }
  }

  /* ══ ⚠⚠⚠ (#R783) ACQUISITION: A WINDOW, NOT A CAMERA ═════════════════════════════════════════
     The external audit's completion condition for a live supplier is 「カメラを別地域へ移しても、
     指定した範囲・期間の分析入力が変わらないこと」, and until this round nothing in this module could
     satisfy it — not because the upstream cannot answer a box, but because NOTHING EVER ASKED IT FOR
     ONE. Every read in this file went through pollView(), whose box is `GE().camera.getBounds()`, and
     the analysis layer reached the aircraft only through the renderer: js/gis-layers.js supplierFor()
     refuses a row that declares `viewBound:true` (js/map-ui.js's aircraft row does, correctly, about
     the DRAWN source), so js/gis-sources.js fell back to reading what happened to be on screen.

     MEASURED against production before writing this (the table in js/aviation-model.js's reach
     section has the numbers): the feed's `?ch=view&bbox=w,s,e,n` executes the box exactly — 0 of
     15,116 records outside it across four windows, and two disjoint windows share no aircraft — so
     the window IS askable and the camera is simply not in the path.

     WHAT THIS DOOR CLAIMS, AND WHAT IT REFUSES TO CLAIM
     ---------------------------------------------------
     · `bbox`  — executed by the feed, and re-checked here against the decoded records.
     · `limit` — NOT claimed, so js/gis-sources.js cuts the answer itself and states a truthful
                 `available` (askSupplier passes a limit only to a supplier that claims one). One
                 implementation of paging is enough, and it is not this one.
     · `where` / `cursor` / `fields` — NOT claimed, so they are refused BY NAME at the door. That is
                 exactly what they did before this round (prepare() refuses them for an id with no
                 supplier), so nothing a reader could do yesterday is taken away; what WOULD take
                 something away is claiming them and not doing them, which is the #R783 defect one
                 file over.
     · `time`  — the feed answers for NOW and for nothing else. Nothing is stated about it, so
                 js/gis-sources.js answers a timed request `partial / time-not-established` instead
                 of handing today's sky back for a question about last Tuesday.
     · COMPLETENESS — never. `coverage.complete` is the feed's own `x-intmap-coverage` sentence read
                 by MODEL.readReach, which is `false` while the lattice is short of its 980 tiles and
                 `null` otherwise. 「取れないことを取れるように宣言する」 is the failure the audit
                 named; this is the opposite end of it.

     ⚠ AND IT LEAVES A RECEIPT EVEN WHEN IT FAILS ([[intmap-background-work-needs-a-receipt]]). A door
     that is never reached and a door that was reached and refused look identical from outside, so
     every attempt — the box, the count, the reach, the age, and the refusal if there was one — lands
     in ST.reach and comes back out through reach() and through status().acquire. */

  const WORLD_BOX = { w: -180, s: -90, e: 180, n: 90 };
  const ACQUIRE_ID = 'aircraft';

  /* The feed's address, asked of the model (which owns the function name) and of the page (which
     owns the project ref). ⚠ ST.endpoint WINS: js/data-layers.js hands it to start(), and a session
     configured to a different endpoint must not have this door quietly read the default one. */
  function endpointUrl() {
    if (ST.endpoint) return ST.endpoint;
    try { return window.IntMapAviationModel.feedUrl(window.SUPABASE_URL); } catch (_) { return ''; }
  }

  function readBox(b) {
    if (!b) return null;
    /* both spellings the app uses: {w,s,e,n} and [[w,s],[e,n]] (js/gis-sources.js asBox) */
    const o = Array.isArray(b) ? { w: b[0] && b[0][0], s: b[0] && b[0][1], e: b[1] && b[1][0], n: b[1] && b[1][1] } : b;
    const w = +o.w, s = +o.s, e = +o.e, n = +o.n;
    if (![w, s, e, n].every((v) => isFinite(v))) return null;
    return { w: w, s: Math.min(s, n), e: e, n: Math.max(s, n) };
  }

  /* ⚠ ONE READ PER CALL, AND NO STORE. This does not touch the worker, the renderer or ST.frame: the
     acquisition answer is built from the bytes that came back for the box that was asked for, so two
     callers asking about two boxes cannot overwrite each other's answer — which is what 「カメラを
     動かしても同じ」 actually requires. It costs the same one request pollView() costs; the server's
     own 15 s cache and its burst budget are unchanged by the question arriving from here. */
  async function acquire(req) {
    const q = req || {};
    const box = readBox(q.bbox) || WORLD_BOX;
    const url = endpointUrl();
    const receipt = { at: Date.now(), box: box, ok: false, why: '', count: null, reach: null, ageMs: null, oldestMs: null };
    const done = (r) => { ST.reach = receipt; return r; };
    if (!url) {
      receipt.why = 'aviation-endpoint-unset';
      return done({ ok: false, why: 'map-unavailable', detail: { id: ACQUIRE_ID, needs: 'window.SUPABASE_URL' } });
    }
    const C = globalThis.IntMapAviationCodec;
    const M = window.IntMapAviationModel;
    if (!C || !M) {
      receipt.why = 'codec-or-model-absent';
      return done({ ok: false, why: 'map-unavailable', detail: { id: ACQUIRE_ID, needs: 'IntMapAviationCodec / IntMapAviationModel' } });
    }
    let r;
    try {
      r = await fetch(url + '?ch=view' + M.bboxParam(box), {
        headers: { accept: 'application/octet-stream' },
        signal: q.signal || null,
      });
    } catch (e) {
      /* ⚠ THE RECEIPT IS WRITTEN AND THEN IT THROWS. js/gis-sources.js names a thrown supplier
         `supplier-failed` and carries the message — that is its vocabulary, and a code its REFUSALS
         list does not name comes back marked `undeclared`, so inventing one here would be inventing
         a sentence nobody can translate. What must not be lost is that the attempt HAPPENED. */
      receipt.why = (e && e.name === 'AbortError') ? 'aborted' : ('fetch_failed: ' + ((e && e.message) || ''));
      ST.reach = receipt;
      throw e;
    }
    if (!r.ok) {
      receipt.why = 'http_' + r.status;
      ST.reach = receipt;
      throw new Error('aviation-feed http_' + r.status);
    }
    let msg;
    try { msg = C.decode(new Uint8Array(await r.arrayBuffer())); }
    catch (e) {
      receipt.why = 'decode_failed: ' + ((e && e.message) || '');
      ST.reach = receipt;
      throw e;
    }
    const reach = M.readReach(r.headers.get('x-intmap-coverage'));
    const ageMs = Number(r.headers.get('x-intmap-age-ms')) || 0;
    const now = Date.now();
    const built = M.featuresFromSnapshot(msg, now, C, box);
    /* the moment the feed assembled the answer, not the moment its oldest position was observed —
       every feature carries its own (js/aviation-model.js ③) */
    const asOf = new Date(now - ageMs).toISOString();

    receipt.ok = true;
    receipt.count = built.features.length;
    receipt.reach = reach;
    receipt.ageMs = ageMs;
    receipt.oldestMs = Number(r.headers.get('x-intmap-oldest-ms')) || 0;
    receipt.skippedNoPosition = built.skippedNoPosition;
    receipt.droppedOutsideBox = built.droppedOutsideBox;
    receipt.provider = r.headers.get('x-intmap-provider') || '';
    receipt.attribution = r.headers.get('x-intmap-attribution') || '';
    receipt.oldestObservedAt = built.oldestObservedAt;
    receipt.newestObservedAt = built.newestObservedAt;
    receipt.asOf = asOf;
    /* the door's own statement about what it holds, refreshed from what the feed has just said */
    try { declareHolding(reach, asOf); } catch (_) { }

    if (typeof q.onProgress === 'function') {
      try { q.onProgress({ done: built.features.length, total: built.features.length }); } catch (_) { }
    }
    return done({
      ok: true,
      features: built.features,
      coverage: M.coverageFor({ box: box, count: built.features.length, asOf: asOf, reach: reach }),
    });
  }

  /* ⚠ THE DECLARATION IS RE-STATED, NOT SET ONCE. `complete` is the feed's own sentence and the feed
     says something different as its lattice fills, so a declaration written at registration time
     would be a photograph ([[intmap-discovered-list-is-a-photograph]]). Before the first read there
     is no reach and the declaration says so — the world as an extent, `complete:false`, no `asOf`,
     which reads as 「範囲は世界、全部とは言っていない」 and never as 「全部」. */
  function declareHolding(reach, asOf) {
    const S = window.IntMapGisSources;
    const M = window.IntMapAviationModel;
    if (!S || typeof S.declare !== 'function' || !M) return false;
    const r = S.declare(ACQUIRE_ID, M.holdsFor(reach || null, asOf || null));
    return !!(r && r.ok);
  }

  /* ⚠ REGISTRATION COSTS NO REQUEST. supply() and declare() are statements; the first byte moves when
     somebody acquires. So this runs at module construction — the door has to exist before the layer
     is switched on, because 「表示していなくても取れる」 is the whole point of it.
     ⚠ AND IT OVERRIDES js/map-ui.js's ROW ON PURPOSE. That row says `viewBound:true`, which is true
     of the DRAWN source and false of this door; js/gis-sources.js declarationOf() prefers an explicit
     declare() precisely because the module holding the data is the stronger claimant (#R756). While
     this module has not loaded, the row's statement stands and it is the correct one. */
  function register() {
    const S = window.IntMapGisSources;
    if (!S || typeof S.supply !== 'function') return false;
    const sup = S.supply(ACQUIRE_ID, {
      fetch: acquire,
      /* it answers with a promise, so js/gis-sources.js's synchronous door refuses it by name
         (`supplier-is-async`) rather than firing the request and discarding the answer */
      sync: false,
      /* what it does NOT claim is the load-bearing half — see the section header */
      where: false, cursor: false, fields: false, limit: false,
    });
    /* the standing statement, before any read has happened */
    declareHolding(null, null);
    return !!(sup && sup.ok);
  }

  function reach() { return ST.reach ? Object.assign({}, ST.reach) : null; }

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

  /* (#R506) THE OBSERVED TRACK — what this browser has actually received, never the shader's
     extrapolation (§17.1). Fixes are recorded for the VIEWPORT channel only, which is the same
     scope the old sweep had, so nothing that used to have a history loses one. */
  async function track(hex) {
    try {
      const r = await W().track(hex || ST.selected || '');
      return (r && r.track) || [];
    } catch (_) { return []; }
  }

  /* …and "which aircraft does this name mean", so `layers.aircraftTrack` can be given a callsign.
     The worker owns the identity table; asking it is what keeps Atlas and a click on the map
     resolving to the SAME aeroplane (#R82). */
  async function find(q) {
    try {
      const r = await W().search(q, 1);
      const hit = r && r.results && r.results[0];
      return hit ? hit.hex : null;
    } catch (_) { return null; }
  }

  function onTrack(fn) { ST.onTrack = (typeof fn === 'function') ? fn : null; }

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
    ST.worldTimer = everyTick('aviation-live:poll-world', WORLD_POLL_MS, pollWorld);
    ST.viewTimer = everyTick('aviation-live:poll-view', VIEW_POLL_MS, pollView);
    return true;
  }

  function stop() {
    ST.on = false;
    if (ST.worldTimer) { stopTick(ST.worldTimer); ST.worldTimer = 0; }
    if (ST.viewTimer) { stopTick(ST.viewTimer); ST.viewTimer = 0; }
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
      /* (#R783) 「範囲を指定した取得は、いつ・何を・どこまで答えたのか」 — null before the door has
         ever been used, which is a different fact from an attempt that failed. */
      acquire: reach(),
    };
  }

  function workerStats() {
    try { return W().stats().then((r) => r && r.stats); } catch (_) { return Promise.resolve(null); }
  }

  /* ⚠ AT CONSTRUCTION, NOT AT start(). A reader who has never switched the layer on must still be
     able to ask for a window (that is the whole of 「表示していないレイヤーを読む」), and this costs
     one supply() and one declare() — no request, no timer, no renderer. */
  register();

  return {
    CLOUD_ID,
    /* §24 names this `stats()`. It is the synchronous half — everything the page itself knows.
       The deeper counters live in the worker and are one round trip away (workerStats). */
    stats: status,
    start, stop, destroy,
    pollWorld, pollView,
    pick, select, detail, snapshotFor,
    /* (#R783) the camera-free door, its receipt, and the registration that publishes it. `acquire`
       is the supplier js/gis-sources.js calls; nothing else should call it directly — going through
       the contract is what puts a `coverage` on the answer. */
    acquire, reach, register, endpointUrl,
    track, find, onTrack,
    setOpacity, setLift, setFilter, onZoom,
    sizeForZoom,
    status, workerStats,
    isOn: () => ST.on,
    selected: () => ST.selected,
  };
};
