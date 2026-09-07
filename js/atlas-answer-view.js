/* ============================================================================
 *  IntMap · Atlas — THE VIEW AN ANSWER WAS DRAWN IN  (#R543)
 * ----------------------------------------------------------------------------
 *  window.IntMapAnswerView — put the map back the way it was when a particular reply drew it.
 *
 *  ══ WHAT WAS ALREADY THERE, AND WHAT WAS NOT ══════════════════════════════════════════════════
 *  #R118/#R122/#R125 already give every Atlas reply its own overlay snapshot and a chip that paints
 *  it again, with independent coexistence and clone layers. So «show me that answer's shapes again»
 *  has worked for a long time. What the snapshot never carried is the VIEW those shapes were drawn
 *  in — where the camera was, what the clock was set to, which layers were on, which basemap and
 *  projection. Turning the chip back on therefore repainted the geometry over WHEREVER the reader
 *  had since moved to, and — this is the part that matters for this app — over WHATEVER YEAR the
 *  clock had since been moved to. IntMap's subject is largely historical: a reply about 1950 whose
 *  shapes are repainted over a 2026 basemap is not that reply's map, it is a different claim.
 *
 *  ⚠ SO THIS IS NOT A SECOND MECHANISM. The capture is one more field on the same bubble the
 *  overlay snapshot already hangs from (js/atlas-console.js), and it is `IntMapAtlasState.snapshot`
 *  — the state observer that has read camera, time and activeLayers since #R397 — rather than a
 *  private reader that could drift from it. This file is only the half that observer never had: an
 *  applier.
 *
 *  ══ ⚠⚠ ADDITIVE ON LAYERS, EXACT ON EVERYTHING ELSE ═══════════════════════════════════════════
 *  Camera, clock, basemap and projection are restored exactly: they are single-valued, the reader
 *  asked for this, and every one of them is reversible by the same controls that set them.
 *  LAYERS ARE TURNED ON AND NEVER OFF. Switching off a layer the reader enabled after that answer
 *  is destroying work they did, to reach a state they did not ask to be returned to in that
 *  respect — and unlike the camera, nothing on screen tells them it happened or how to undo it.
 *  `apply()` therefore reports what it turned on AND what is on that the answer did not have, so
 *  the caller can say so rather than pretend the view is identical.
 *
 *  ⚠ AND IT NEVER CLAIMS MORE THAN IT DID. Every step is reported in `applied` or `skipped` with a
 *  reason; a renderer that is not loaded, a clock that is not present and a layer whose checkbox no
 *  longer exists are all `skipped`, not silent successes.
 *
 *  ══ ⚠ WHY THIS FILE EXPORTS NOTHING ═══════════════════════════════════════════════════════════
 *  A lazily-loaded module registers its factory on `window.IntMapModules` and exports no name, the
 *  way js/atlas-query.js does. The alternative fails a real invariant rather than a style rule:
 *  tests/r175 ③ requires every `export` in js/ to be imported BY NAME by some other js/ module, and
 *  the only file that could do that here is js/atlas-console.js — whose static import would fold
 *  this whole module back into its chunk, which is the 4,901-byte ceiling this round went out of
 *  its way to stay under. So the door is the registration, and a node check reaches the factory
 *  through `window.IntMapModules` after setting `globalThis.window` — which is also how it proves
 *  the module EVALUATES rather than merely parses (#R505).
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.atlasAnswerView = function (HOST, CTX) {
  CTX = CTX || {};
  const G = (n) => { try { return window[n]; } catch (_) { return null; } };
  const GE = CTX.GE || (() => G('IntMapGeoEngine'));
  const TIME = () => (CTX.time || G('IntMapTime'));
  const OS = () => (CTX.os || G('IntMapOS'));
  const DOC = () => (CTX.doc || (typeof document !== 'undefined' ? document : null));

  /* the app records base and projection as `active` on its own view buttons — the same reading
     js/atlas-state.js's camera provider takes, so capture and restore cannot disagree about it */
  const BTN = { satellite: 'btn-view-sat', '3d-terrain': 'btn-view-3d', flat: 'btn-view-flat' };
  function isActive(id) { const d = DOC(); const e = d && d.getElementById(id); return !!(e && e.classList && e.classList.contains('active')); }
  function click(id) { const d = DOC(); const e = d && d.getElementById(id); if (!e || !e.click) return false; try { e.click(); return true; } catch (_) { return false; } }

  /* ── what an answer's view snapshot is: exactly the three sections the state observer already
        provides. Kept as a named list so the capture site and this file cannot drift apart. ───── */
  const SECTIONS = ['camera', 'time', 'activeLayers'];

  function apply(snap, opts) {
    opts = opts || {};
    const applied = [], skipped = [];
    const note = (list, what, why) => list.push(why ? (what + ': ' + why) : what);
    if (!snap || typeof snap !== 'object') return { ok: false, applied, skipped: ['no snapshot'] };

    /* 1) BASEMAP and PROJECTION first — both restyle the map, and doing them after the camera move
          would make the fly land and then flicker. */
    const cam = snap.camera || null;
    if (cam && cam.base) {
      const wantSat = cam.base === 'satellite';
      if (wantSat !== isActive(BTN.satellite)) (click(BTN.satellite) ? note(applied, 'basemap') : note(skipped, 'basemap', 'control not found'));
    }
    if (cam && cam.projection) {
      const want = cam.projection;
      /* three states, two buttons: reaching `globe` means switching OFF whichever is on */
      if (want === 'globe') {
        if (isActive(BTN['3d-terrain'])) (click(BTN['3d-terrain']) ? note(applied, 'projection') : note(skipped, 'projection', 'control not found'));
        else if (isActive(BTN.flat)) (click(BTN.flat) ? note(applied, 'projection') : note(skipped, 'projection', 'control not found'));
      } else if (BTN[want] && !isActive(BTN[want])) {
        (click(BTN[want]) ? note(applied, 'projection') : note(skipped, 'projection', 'control not found'));
      }
    }

    /* 2) THE CLOCK. For this app this is the half that makes the restoration mean anything: the
          shapes of 1950 over the basemap of 2026 are not the answer's map. */
    const T = TIME(), t = snap.time || null;
    if (t) {
      if (!T || typeof T.set !== 'function') note(skipped, 'time', 'clock unavailable');
      else if (t.live) { try { (T.setNow ? T.setNow() : T.set(new Date(), { source: 'ui' })); note(applied, 'time'); } catch (_) { note(skipped, 'time', 'clock refused'); } }
      else {
        const iso = t.instant || t.travelDate;
        const d = iso ? new Date(iso) : null;
        if (!d || isNaN(d.getTime())) note(skipped, 'time', 'no readable instant');
        else { try { T.set(d, { source: 'ui' }); note(applied, 'time'); } catch (_) { note(skipped, 'time', 'clock refused'); } }
      }
    }

    /* 3) LAYERS — ON only. See the header: switching one off destroys work the reader did after
          this answer, silently and with nothing on screen saying it happened. */
    const os = OS(), want = Array.isArray(snap.activeLayers) ? snap.activeLayers : [];
    const wantIds = {}; let turnedOn = 0, missing = 0;
    want.forEach((l) => {
      const id = l && l.id; if (!id) return;
      wantIds[id] = 1;
      const d = DOC(); const cb = d && d.getElementById(id);
      if (!cb) { missing++; return; }
      if (cb.checked) return;                         /* already on: nothing to do, and not a claim */
      if (os && typeof os.exec === 'function') { try { os.exec('layer.on', { params: { id } }); turnedOn++; return; } catch (_) { /* fall through */ } }
      try { cb.click(); turnedOn++; } catch (_) { missing++; }
    });
    if (turnedOn) note(applied, 'layers +' + turnedOn);
    if (missing) note(skipped, 'layers', missing + ' no longer exist');

    /* what is on now that this answer did not have — reported, never switched off */
    const extra = [];
    try {
      const d = DOC();
      if (d) Array.prototype.forEach.call(d.querySelectorAll('#layer-dropdown input[type=checkbox]'), (cb) => {
        if (cb.checked && !wantIds[cb.id]) extra.push(cb.id);
      });
    } catch (_) { /* the panel is not open; nothing to report */ }

    /* 4) THE CAMERA last, so the flight lands on the map the steps above have finished building. */
    if (cam && isFinite(cam.lat) && isFinite(cam.lng)) {
      const E = GE(); const C = E && E.camera;
      if (!C || typeof C.flyTo !== 'function') note(skipped, 'camera', 'renderer unavailable');
      else {
        try {
          C.flyTo({ center: [+cam.lng, +cam.lat], zoom: +cam.zoom, bearing: +cam.bearing || 0, pitch: +cam.pitch || 0,
            duration: opts.duration == null ? 900 : opts.duration });
          note(applied, 'camera');
        } catch (_) { note(skipped, 'camera', 'renderer refused'); }
      }
    }

    return { ok: applied.length > 0, applied, skipped, extraLayers: extra };
  }

  return { apply, SECTIONS };
};
