/* ============================================================================
 *  IntMap · ONE PICTURE OF THE VIEW, FOR WHOEVER ASKS FOR IT  (#R493)
 * ----------------------------------------------------------------------------
 *  「Atlas自身が地図画像を添付できるようにする」
 *
 *  Atlas has read IntMap's INSIDE since #R318: camera, viewport, which layers are on, whether they
 *  actually painted, the selection, the pins, the Chronos clock, the open panels. What it had never
 *  had is the OUTSIDE — the pixels. So 「この境界線なんか変じゃない？」「今画面に見えてるこの黄色い
 *  帯は何？」「このラベル何て書いてある？」 reached something that could recite the layer list and
 *  could not look.
 *
 *  ⚠ THIS FILE IS NOT A NEW CAPTURE. It is the capture js/screenshot.js has performed since #R200,
 *  lifted out so that the screenshot button and Atlas take the SAME picture by running the SAME
 *  code. Writing a second one would have meant two answers to "what does the reader see" — and the
 *  two would have drifted the way #R231 measured them drifting inside one file, where the map layer
 *  was sized from the renderer's backing store and the overlay layer from the container's CSS box.
 *  That fix lives below, once, and both callers inherit it.
 *
 *  TWO PICTURES, BECAUSE THEY ANSWER DIFFERENT QUESTIONS — and Atlas chooses which:
 *    · include:'screen' — the map PLUS the DOM that sits on it (legends, scale, markers, the news
 *      band, the timebar), controls hidden, exactly what the screenshot button saves. This is the
 *      one that can answer a question about a legend or a band, because those are not in the
 *      renderer's canvas at all.
 *    · include:'map'   — the renderer's frame alone. No html2canvas (198 kB, fetched on demand) and
 *      no overlay pass, so it is the cheap one: right for 「この赤いのは何？」 about the data itself.
 *
 *  ⚠ THE WEBGL FRAME IS READ INSIDE A RENDER TICK. `preserveDrawingBuffer` is deliberately OFF on
 *  the map (js/app-body.js: it costs a copy every frame and flickers on resize), and a WebGL
 *  drawing buffer is only guaranteed readable in the frame it was drawn. Hence `events.once('render')`
 *  + `triggerRepaint()`, with a timer behind it for the case where no render event ever comes.
 *
 *  ⚠ NO IMPORTS, NO HOST, NO GLOBALS OF ITS OWN. Everything it needs arrives in the options object,
 *  so tests/r493-checks.test.mjs can read this file's surface without a browser.
 *
 *  ⚠ AND THE FRAME LEDGER IS HERE TOO, NOT IN js/atlas-console.js. That file is under #R199's
 *  SHRINK-ONLY ceiling (4,910 lines, one line of headroom when #R419 measured it), and the rule is
 *  that the kernel shrinks by MOVING a subject out — never that the ceiling moves up. The subject
 *  is «the picture», and the buffer, the record and the prompt block are all of it. What stays in
 *  the console is the five lines that BIND it.
 * ==========================================================================*/

/**
 * makeViewCapture(deps) -> { CAPTURE_CLASS, captureCanvas, captureFrame, urls, promptBlock, reset, SENT }
 *
 * deps: { GE, L, esc, snapshot(), waitIdle(ms) } — all injected, so nothing here reaches a global.
 * The screenshot button needs only `GE` and `waitIdle`; the rest is the ledger's.
 *
 * ⚠ ONE EXPORT, AND THAT IS A RULE RATHER THAN A TASTE. tests/r175-checks ③ requires every named
 * export in js/ to be imported BY NAME somewhere — a dead export is dead code. js/screenshot.js
 * reaches this module with a DYNAMIC import (it rides the eager bundle, and the capture must not),
 * and a dynamic import satisfies nothing that check can see. So the module has exactly one door,
 * js/atlas-console.js imports THAT by name, and the button opens the same one at the moment it is
 * pressed. Publishing the three pieces separately would have made two of them look dead.
 */
export function makeViewCapture(deps) {
  deps = deps || {};
  var GE = deps.GE, L = deps.L, esc = deps.esc, snapshot = deps.snapshot, waitIdle = deps.waitIdle;

  /* the class js/screenshot.js has always used to take the controls out of the picture and leave the
     legends in. Reused rather than re-declared: a second spelling would hide a different set. */
  const CAPTURE_CLASS = 'capture-mode';

  /**
   * captureCanvas(o) -> Promise<{canvas, live}>
   *
   * o: { GE, include:'screen'|'map', waitIdle?(ms), waitIdleMs?, markCapture? }
   *
   * `canvas` is null when there was nothing to capture. `live` is true only when the renderer's frame
   * came out of a real render tick — see `grabRendererFrame` inside for why that distinction has to
   * survive to the caller.
   *
   * `markCapture:false` leaves document.body alone — js/screenshot.js manages the class itself
   * (it must survive its own flash + download), so it opts out and this does not fight it.
   */
  async function captureCanvas(o) {
    /* ⚠ DECLARED INSIDE, NOT AT THE TOP OF THE FILE. tests/r175-checks ③ allows a top-level
       declaration in js/ only when it is exported AND imported by name; a private helper is exactly
       what that rule forbids — the same reason js/atlas-attach.js keeps its opener's closer inside it.
       Read the renderer's frame, composited with the two animated-wind 2D canvases that draw beside it
       rather than into it. Resolves {canvas, live}: `canvas` is null when the frame could not be read,
       `live` says whether it came from a real render tick or from the timer behind it.
       ⚠⚠⚠ `live` IS NOT A DETAIL. A WebGL drawing buffer with `preserveDrawingBuffer:false` holds
       nothing once the frame it was drawn in has passed, so the timeout path returns a canvas that is
       entirely BLACK — measured, in a browser tab whose hidden flag is set: requestAnimationFrame
       fires zero times in 700 ms, no 'render' event arrives, and the read produces 628/628 sampled
       pixels of (0,0,0). A black rectangle handed to a vision model is not a failed capture, it is a
       CONFIDENT WRONG ANSWER — «the map is dark». The caller has to be able to tell the two apart. */
    const grabRendererFrame = (GE2) => new Promise((res) => {
      let done = false;
      const grab = (live) => {
        if (done) return; done = true;
        try {
          const c = GE2().render.canvas();
          const g = document.createElement('canvas');
          g.width = c.width; g.height = c.height;
          const cx = g.getContext('2d');
          cx.drawImage(c, 0, 0);
          try { const wb = document.getElementById('wind-bg-canvas'); if (wb && wb.style.display !== 'none' && wb.width) cx.drawImage(wb, 0, 0, g.width, g.height); } catch (_) { /* the wind layer is optional */ }
          try { const wc = document.getElementById('wind-canvas'); if (wc && wc.style.display !== 'none' && wc.width) cx.drawImage(wc, 0, 0, g.width, g.height); } catch (_) { /* idem */ }
          res({ canvas: g, live: !!live });
        } catch (_) { res({ canvas: null, live: false }); }
      };
      try { GE2().events.once('render', () => grab(true)); GE2().render.triggerRepaint(); } catch (_) { grab(false); }
      setTimeout(() => grab(false), 1200);   /* the safety net: a renderer that never fires 'render' must not hang the caller */
    });
    o = o || {};
    const GE = o.GE;
    const include = (o.include === 'map') ? 'map' : 'screen';
    if (typeof GE !== 'function') return { canvas: null, live: false };
    try { if (!GE().hasRenderer()) return { canvas: null, live: false }; } catch (_) { return { canvas: null, live: false }; }
    const cont = document.getElementById('map-container');
    if (!cont) return { canvas: null, live: false };
    /* controls out, legends in — but only for the picture that HAS overlays in it */
    const mark = (include === 'screen') && (o.markCapture !== false) && !document.body.classList.contains(CAPTURE_CLASS);
    if (mark) document.body.classList.add(CAPTURE_CLASS);
    try {
      /* let in-flight tiles finish so the picture is of a finished frame rather than a half-loaded one */
      if (typeof o.waitIdle === 'function') { try { await o.waitIdle(o.waitIdleMs || 2500); } catch (_) { /* idle is a courtesy, not a precondition */ } }
      const grabbed = await grabRendererFrame(GE);
      const mapCv = grabbed.canvas;
      /* ══ ⚠⚠ (#R231, kept verbatim) ONE COORDINATE SYSTEM, TAKEN FROM THE BOX BOTH LAYERS OCCUPY ══
         The output was sized from the RENDERER'S BACKING STORE while the overlay pass was scaled from
         the CONTAINER'S CSS BOX, on the unstated assumption that the two have the same aspect ratio.
         On iOS they routinely do not — `.map-container` is 100dvh and 100dvh changes the moment
         Safari's URL bar collapses, while the renderer resizes its buffer on its own schedule — so
         every legend, label and scale bar was stretched to an aspect ratio that was not its own.
         The container's CSS box is what the reader is looking at, so that is the output, at the
         renderer's own density, with BOTH layers drawn into it. */
      const out = document.createElement('canvas');
      const cw = Math.max(1, cont.clientWidth), ch = Math.max(1, cont.clientHeight);
      const scale = Math.max(1, mapCv ? (mapCv.width / cw) : (window.devicePixelRatio || 1));
      out.width = Math.round(cw * scale); out.height = Math.round(ch * scale);
      const ctx = out.getContext('2d');
      if (mapCv) ctx.drawImage(mapCv, 0, 0, mapCv.width, mapCv.height, 0, 0, out.width, out.height);
      if (include === 'screen') {
        /* (#R224) FETCHED HERE, NOT AT BOOT. html2canvas is 198 kB that only a capture needs. The
           overlay pass is SKIPPED if it cannot be had — a map-only picture is a smaller answer, not
           a failed one. */
        try { if (window.IntMapVendor) await window.IntMapVendor.html2canvas(); } catch (_) { /* offline / blocked */ }
        if (typeof html2canvas !== 'undefined') {
          try {
            const ov = await html2canvas(cont, { backgroundColor: null, useCORS: true, logging: false, scale,
              ignoreElements: (el) => el.tagName === 'CANVAS' || (el.classList && el.classList.contains('maplibregl-canvas')) });
            ctx.drawImage(ov, 0, 0, out.width, out.height);
          } catch (_) { /* the map alone is still a picture */ }
        }
      }
      return { canvas: out, live: grabbed.live };
    } finally {
      /* ⚠ IN `finally`, NOT ON THE HAPPY PATH (#R231): a capture abandoned mid-way must never leave
         every control on the map hidden. */
      if (mark) { try { document.body.classList.remove(CAPTURE_CLASS); } catch (_) { /* torn-down document */ } }
    }
  }

  /**
   * downscaleToDataURL(canvas, maxDim, quality) -> data URL | null
   *
   * What travels to a vision model is not the reader's 3,000-pixel retina frame: it is re-encoded to
   * a bounded longest edge as JPEG, which is what the model reads and what the byte ceilings in
   * supabase/functions/ai-proxy (MAX_IMAGES / MAX_IMAGES_BYTES) are sized for.
   */
  function downscaleToDataURL(canvas, maxDim, quality) {
    try {
      if (!canvas || !canvas.width || !canvas.height) return null;
      const w = canvas.width, h = canvas.height;
      const s = Math.min(1, (maxDim || 1024) / Math.max(w, h));
      if (s >= 1) return canvas.toDataURL('image/jpeg', quality || 0.85);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', quality || 0.85);
    } catch (_) { return null; }
  }

  /* ══ THE FRAME LEDGER — captureFrame / urls / promptBlock / reset / SENT ═══════════════════════
     ⚠⚠⚠ THE PIXELS AND THE RECORD TRAVEL SEPARATELY, AND THAT IS THE WHOLE DESIGN.
     js/atlas-agent.js hands every tool result back to the model as JSON inside the PROMPT TEXT
     (`'IntMap observed: '+JSON.stringify(m.content)`). A data URL put there is not an image — it is
     half a megabyte of base64 that the model reads as characters, filling the turn's context to say
     nothing. So `captureFrame()` returns a SMALL record for the transcript and keeps the image here;
     `urls()` hands the images to the vision channel js/ai-core.js already has (and
     supabase/functions/ai-proxy turns into `input_image`), and `promptBlock()` writes the sentences
     that tie image N to the instant it shows. Neither half pretends to be the other. */

    /* ⚠ supabase/functions/ai-proxy caps ONE call at MAX_IMAGES = 4. Atlas may inspect more often
       than that in a turn — look, move, look again is the point — so the MOST RECENT frames are the
       ones attached and `promptBlock()` says plainly which earlier ones were not. A silent drop reads
       to the model as «you were shown all of them», which is the one thing it must not believe.
       tests/r493-checks.test.mjs reads this number and the server's out of the two files. */
    var SENT = 3;
    var frames = [];

    function reset() { frames = []; }
    function urls() { return frames.length ? frames.slice(-SENT).map(function (f) { return f.url; }) : null; }

    /* captureFrame(a) -> {ok:true, html, facts} | {ok:false, message}
       `a` is the validated action: {include?:'screen'|'map', reason?:string}. */
    async function captureFrame(a) {
      a = a || {};
      try {
        if (!GE().hasRenderer()) return { ok: false, message: L('The map is not running, so there is nothing to look at.', '地図が動作していないため、見るものがありません。', 'Die Karte läuft nicht — es gibt nichts zu sehen.', 'Карта не запущена — смотреть нечего.', 'El mapa no está en ejecución, no hay nada que mirar.') };
      } catch (_) { /* fall through to the capture, which answers for itself */ }
      var inc = (String(a.include || '').trim() === 'map') ? 'map' : 'screen';
      var shot = { canvas: null, live: false };
      try { shot = await captureCanvas({ GE: GE, include: inc, waitIdle: waitIdle, waitIdleMs: 2200 }) || shot; } catch (_) { /* answered below, as a refusal rather than a black rectangle */ }
      var cv = shot.canvas;
      /* ⚠⚠⚠ A FRAME THAT DID NOT COME FROM A RENDER TICK IS NOT A PICTURE OF THE MAP — it is an
         undrawn WebGL buffer, which reads as solid black (see grabRendererFrame). Measured in a tab
         whose hidden flag is set: 0 requestAnimationFrame callbacks in 700 ms, no 'render' event,
         628/628 sampled pixels (0,0,0). Handing that to a vision model does not fail — it produces a
         confident wrong answer about a dark map. So the refusal is the honest result, and it says
         WHY, because 'the page is in the background' is something Atlas can act on. */
      if (cv && !shot.live) cv = null;
      var url = cv ? downscaleToDataURL(cv, 1280, 0.82) : null;
      /* a full-viewport retina raster is tens of megabytes; let it go the moment it is encoded — the
         refused one too, which is why this releases `shot.canvas` rather than the narrowed `cv`. */
      try { if (shot.canvas) { shot.canvas.width = shot.canvas.height = 0; } } catch (_) { /* already collected */ }
      if (!url) return { ok: false, message: (shot.canvas && !shot.live)
        ? L('The map was not drawing when I looked — the page is in the background, so there was no frame to capture. Ask again with IntMap in front.', '見に行った時点で地図が描画されていませんでした（ページが背面にあるため、取得できるフレームがありません）。IntMap を前面にしてもう一度お尋ねください。', 'Die Karte hat nicht gezeichnet — die Seite ist im Hintergrund, es gab kein Bild aufzunehmen.', 'В момент съёмки карта не отрисовывалась — страница в фоне, кадра не было.', 'El mapa no estaba dibujando: la página está en segundo plano y no había fotograma que capturar.')
        : L('Could not read the map frame — the renderer gave nothing back.', '地図のフレームを読み取れませんでした（レンダラから画像が返りませんでした）。', 'Der Kartenframe konnte nicht gelesen werden — der Renderer gab nichts zurück.', 'Не удалось прочитать кадр карты — рендерер ничего не вернул.', 'No se pudo leer el fotograma del mapa: el renderizador no devolvió nada.') };

      /* the machine reading of the SAME instant, so the image never has to be measured */
      var cam = null, vp = null, layers = null, tm = null;
      try {
        var s = snapshot ? snapshot() : null; cam = s && s.camera; vp = s && s.viewport; tm = s && s.time;
        layers = (s && Array.isArray(s.activeLayers))
          ? s.activeLayers.map(function (l) { return l && l.label; }).filter(Boolean) : null;
      } catch (_) { /* the ledger is a courtesy here; the picture is the point */ }

      var facts = {
        frame: 'view-frame-' + (frames.length + 1), include: inc, capturedAt: new Date().toISOString(),
        reason: String(a.reason || '').slice(0, 300) || undefined,
        bbox: (vp && isFinite(vp.west)) ? { west: +vp.west, south: +vp.south, east: +vp.east, north: +vp.north } : undefined,
        center: (cam && isFinite(cam.lat)) ? { lat: +cam.lat, lng: +cam.lng } : undefined,
        zoom: (cam && isFinite(cam.zoom)) ? +(+cam.zoom).toFixed(2) : undefined,
        bearing: (cam && isFinite(cam.bearing)) ? Math.round(+cam.bearing) : undefined,
        pitch: (cam && isFinite(cam.pitch)) ? Math.round(+cam.pitch) : undefined,
        base: (cam && cam.base) || undefined, projection: (cam && cam.projection) || undefined,
        layersOn: (layers && layers.length) ? layers : undefined,
        chronos: (tm && tm.travelDate) || undefined
      };
      frames.push({ url: url, facts: facts });

      /* ⚠ THE READER SEES WHAT ATLAS WAS GIVEN. A capability that reads the screen and says nothing
         about having done so is one nobody can audit — and an answer that turns on «the east half is
         red» should show the half it means. It is small on purpose: evidence, not a second map. */
      var capTxt = L('Atlas looked at the map', 'Atlas が地図を見ました', 'Atlas hat auf die Karte geschaut', 'Atlas посмотрел на карту', 'Atlas miró el mapa')
        + ((inc === 'map') ? (' · ' + L('map only', '地図のみ', 'nur Karte', 'только карта', 'solo el mapa')) : '');
      var html = '<div class="atl-viewframe"><img src="' + esc(url) + '" alt="' + esc(capTxt) + '" loading="lazy">'
        + '<div class="atl-viewframe-cap">' + esc(capTxt) + (facts.reason ? (' — ' + esc(facts.reason)) : '') + '</div></div>';
      return { ok: true, html: html, facts: facts };
    }

    /* The sentences that name the attached images. Every number here was READ FROM THE APP at the
       instant of the capture, not off the picture — which is why the closing line tells Atlas to take
       quantities from the text and appearance from the image. A picture is a poor ruler. */
    function promptBlock() {
      var take = frames.slice(-SENT);
      if (!take.length) return '';
      var dropped = frames.length - take.length;
      var p = '[VIEW FRAMES ATTACHED TO THIS MESSAGE — real screenshots of IntMap, taken by your own inspect calls, in this order]\n';
      take.forEach(function (fr, i) {
        var f = fr.facts, bits = [];
        if (f.bbox) bits.push('visible bounds W ' + f.bbox.west.toFixed(2) + ', S ' + f.bbox.south.toFixed(2) + ', E ' + f.bbox.east.toFixed(2) + ', N ' + f.bbox.north.toFixed(2));
        if (f.center) bits.push('centre ' + f.center.lat.toFixed(2) + ',' + f.center.lng.toFixed(2));
        if (f.zoom != null) bits.push('zoom ' + f.zoom);
        if (f.bearing != null) bits.push('bearing ' + f.bearing + '°');
        if (f.pitch != null) bits.push('pitch ' + f.pitch + '°');
        if (f.base) bits.push(f.base + ' base');
        if (f.projection) bits.push(f.projection + ' projection');
        if (f.layersOn) bits.push('layers ON: ' + f.layersOn.join(', '));
        if (f.chronos) bits.push('Chronos date ' + f.chronos);
        p += 'image ' + (i + 1) + ' = ' + f.frame + ' ('
          + ((f.include === 'map') ? 'renderer frame only — no legends, no DOM overlays'
            : 'the whole screen: map + legends, scale, markers, bands, timebar; controls hidden') + ')'
          + (f.reason ? (' · you asked for it to: ' + f.reason) : '') + (bits.length ? (' · ' + bits.join(' · ')) : '') + '\n';
      });
      if (dropped > 0) p += '(' + dropped + ' earlier frame' + (dropped === 1 ? ' is' : 's are') + ' NOT attached — only the '
        + take.length + ' most recent are. Their records are in the turn log below.)\n';
      p += 'Read these images for what the map LOOKS like — colour, shape, density, arrangement, overlap, what a label says, whether something actually rendered. Take every QUANTITY (coordinates, zoom, layer names, dates) from the lines above and from the state block, never by measuring the picture.\n\n';
      return p;
    }

    return { CAPTURE_CLASS: CAPTURE_CLASS, captureCanvas: captureCanvas,
             captureFrame: captureFrame, urls: urls, promptBlock: promptBlock, reset: reset, SENT: SENT };
}
