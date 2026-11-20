/* ============================================================================
 *  IntMap · A VIDEO, AS ONE PICTURE THE MODEL CAN READ   (atlas-multimodal)
 * ----------------------------------------------------------------------------
 *  「動画を渡したら、映っている地形や場所を Atlas が読めるように」
 *
 *  WHY FRAMES AND NOT THE FILE. The one request path (ai-proxy) reads PNG/JPEG/WebP/GIF as images and
 *  PDF as a document — that is what ALL the configured providers accept (supabase/functions/
 *  ai-proxy/config.ts, DOC_MIME's argument). Gemini can take a raw video (inline < 100 MB, or its File
 *  API), but OpenAI's Responses API and Anthropic's Messages API take images, so a video sent as
 *  bytes would work on one provider and be refused on the others — a capability that depends on
 *  which provider happened to answer. Frames work on every one of them.
 *
 *  WHY ONE SHEET AND NOT N IMAGES. A request carries at most MAX_IMAGES (4) images, and the server
 *  and the client hold that same number (tests/atlas-attach-checks). Spending all four on a clip
 *  leaves nothing for the reader's other photo — and "compare this ground photo with the satellite
 *  view" needs both. A contact sheet is ONE image: up to 9 frames, each stamped with its time, so
 *  the model can say WHEN something appears and order the frames without being told.
 *
 *  WHAT THIS DOES NOT DO — and says so: it does not hear the clip. The sound track is not sent; the
 *  caption the model receives (`caption()`) states that, so an answer never implies it was heard.
 *
 *  THE PURE PARTS (frameTimes / sheetLayout / fmtTime / caption) take numbers and return numbers or
 *  strings. The one part that needs a browser (`extract`) takes its `document` as an argument, so
 *  tests/atlas-video-frames-checks.test.mjs drives it with a fake <video> and a real browser run
 *  drives it with a real clip.
 * ==========================================================================*/

/* Observation 2026-11-20: 9 tiles of 640 px = 1920 px wide at 3 columns, which is the width the image
   channel already encodes at (compressImage(x, 2000, 0.9)) and the ceiling the providers downscale
   to; more tiles would be resampled by the provider and only look sharper to us. EXPIRES WHEN: the
   provider image-size ceilings change (the same number as js/atlas-attach.js's image encode). */
export const VIDEO = { maxFrames: 9, defaultFrames: 6, cols: 3, tileW: 640, maxClipBytes: 600 * 1048576, seekMs: 6000, metaMs: 8000 };

/** n sample instants, each at the CENTRE of an equal slice of the clip (never 0 s: that is a title card or
    a black frame in most footage, and never the last instant: end-of-file seeks often fail). */
export function frameTimes(duration, n) {
  const d = +duration, k = Math.max(1, Math.min(VIDEO.maxFrames, Math.floor(+n) || VIDEO.defaultFrames));
  if (!(d > 0) || !isFinite(d)) return [0];
  const out = [];
  for (let i = 0; i < k; i++) out.push(+(d * (i + 0.5) / k).toFixed(3));
  return out;
}

/** the grid for n tiles: {cols, rows, w, h} given the tile size */
export function sheetLayout(n, tileW, tileH) {
  const cols = Math.min(VIDEO.cols, Math.max(1, n)), rows = Math.ceil(n / cols);
  return { cols: cols, rows: rows, w: cols * tileW, h: rows * tileH };
}

export function fmtTime(s) {
  s = Math.max(0, +s || 0);
  const m = Math.floor(s / 60), r = s - m * 60;
  return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
}

/** the sentence the model reads with the sheet — what the picture IS, in what order, and what it lacks */
export function caption(name, res) {
  return 'Attached video "' + String(name || 'video') + '" (' + fmtTime(res.duration) + ' long) is shown as ONE contact-sheet image of ' + res.times.length
    + ' frames, read left to right then top to bottom, each stamped with its time in the clip: ' + res.times.map(fmtTime).join(', ')
    + '. These are still frames sampled evenly from the clip; the sound track was NOT provided, so nothing may be claimed about what was said or heard, and motion between frames is inferred, not observed.';
}

function once(el, ok, bad, ms) {
  return new Promise(function (resolve) {
    let done = false;
    const fin = function (v) { if (done) return; done = true; try { el.removeEventListener(ok, onOk); el.removeEventListener(bad, onBad); } catch (_) { /* detached */ } clearTimeout(tm); resolve(v); };
    const onOk = function () { fin(true); }, onBad = function () { fin(false); };
    const tm = setTimeout(function () { fin(false); }, ms);
    el.addEventListener(ok, onOk); el.addEventListener(bad, onBad);
  });
}

/**
 * extract(file, {doc, URLApi, n}) -> {dataUrl, times, duration, w, h} | null
 * `doc` is the document (createElement), `URLApi` is URL (createObjectURL / revokeObjectURL). null = this browser could not
 * decode the clip (codec) — the caller says so; it never gets a blank sheet.
 */
export async function extract(file, opts) {
  opts = opts || {};
  const doc = opts.doc || (typeof document !== 'undefined' ? document : null), U = opts.URLApi || (typeof URL !== 'undefined' ? URL : null);
  if (!doc || !U || !file) return null;
  const video = doc.createElement('video');
  video.muted = true; video.preload = 'auto'; video.playsInline = true; try { video.setAttribute('playsinline', ''); } catch (_) { /* fake element */ }
  const url = U.createObjectURL(file);
  try {
    video.src = url;
    if (!(await once(video, 'loadedmetadata', 'error', VIDEO.metaMs))) return null;
    let duration = video.duration;
    /* a clip recorded by MediaRecorder reports Infinity until the end has been seen; seeking far past the end makes the
       decoder find it. (Observed on Chromium, 2026-11-20.) */
    if (!isFinite(duration)) {
      const ready = once(video, 'durationchange', 'error', VIDEO.seekMs);
      try { video.currentTime = 1e101; } catch (_) { /* some engines throw; the wait below times out */ }
      await ready; duration = video.duration;
    }
    if (!(duration > 0) || !isFinite(duration)) return null;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!(vw > 0 && vh > 0)) return null;           /* audio-only container, or nothing decodable */
    const times = frameTimes(duration, opts.n || VIDEO.defaultFrames);
    const tileW = Math.min(VIDEO.tileW, vw), tileH = Math.round(tileW * vh / vw);
    const L = sheetLayout(times.length, tileW, tileH);
    const cv = doc.createElement('canvas'); cv.width = L.w; cv.height = L.h;
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, L.w, L.h);
    const got = [];
    for (let i = 0; i < times.length; i++) {
      const seeked = once(video, 'seeked', 'error', VIDEO.seekMs);
      video.currentTime = times[i];
      if (!(await seeked)) continue;             /* a frame that did not arrive is left black AND is not counted */
      const x = (i % L.cols) * tileW, y = Math.floor(i / L.cols) * tileH;
      g.drawImage(video, x, y, tileW, tileH);
      /* the time stamp is burned in so the order and the moment survive any crop or recompression */
      const label = fmtTime(times[i]), fs = Math.max(14, Math.round(tileW / 24));
      g.font = 'bold ' + fs + 'px sans-serif'; g.textBaseline = 'top';
      const tw = g.measureText(label).width;
      g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(x + 6, y + 6, tw + 12, fs + 8);
      g.fillStyle = '#fff'; g.fillText(label, x + 12, y + 10);
      got.push(times[i]);
    }
    if (!got.length) return null;
    return { dataUrl: cv.toDataURL('image/jpeg', 0.88), times: got, duration: duration, w: L.w, h: L.h };
  } finally {
    try { U.revokeObjectURL(url); } catch (_) { /* already revoked */ }
    try { video.removeAttribute('src'); video.load(); } catch (_) { /* fake element */ }
  }
}
