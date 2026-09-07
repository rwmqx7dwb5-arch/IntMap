/* ============================================================================
 *  IntMap · ASKING A VISION MODEL WHERE THE SKY STOPS — globalThis.IntMapPhotoVision   (#R547)
 * ----------------------------------------------------------------------------
 *  js/photo-geo-skyline.js finds the boundary from PIXELS. This file asks a model that has seen a
 *  hundred million photographs instead. Both remain, because they fail differently and the reader
 *  is the one who can tell which failure they are looking at.
 *
 *  ── WHY A MODEL AT ALL ──────────────────────────────────────────────────────────────────────────
 *  The measured failure of #R527 was not the arithmetic downstream; it was the trace. Of twelve
 *  evaluated photographs nine produced no answer, and the recorded reason (docs/PHOTO-GEOLOCATION.md
 *  §9.1) is that the trace followed a TREE LINE, a roof, or a cloud sitting on the ridge. Those are
 *  not edges the edge detector can tell apart from a ridge — they are all a dark thing under a
 *  bright thing. Knowing that a row of conifers is not a mountain is not an image-processing
 *  question, it is a recognition question, so it is asked of something that recognises.
 *
 *  ── WHAT THE MODEL IS ASKED FOR, AND WHAT IT IS NOT ─────────────────────────────────────────────
 *  A POLYLINE, not a value per column. A vision model asked for 900 numbers returns 900 numbers of
 *  which most are invented; asked for forty points it returns forty points it can actually see. The
 *  per-column trace the rest of the feature needs is then made by INTERPOLATION here, and snapped to
 *  the real edge by the dynamic program in js/photo-geo-skyline.js under a hard band — so the model
 *  says WHERE the ridge is and the pixels say EXACTLY where. Neither half can drag the answer across
 *  the frame on its own: the model cannot, because the band is narrow; the pixels cannot, because
 *  they are never consulted outside it.
 *  It is also asked which stretches are HIDDEN — foreground trees, a roof, cloud on the ridge — and
 *  those columns are excluded from scoring rather than traced and forgiven, exactly as a reader's
 *  own mask is (js/photo-geo-skyline.js maskColumns).
 *
 *  ── AND IT IS ALLOWED TO SAY THERE IS NO SKYLINE ────────────────────────────────────────────────
 *  `hasSkyline:false` is a first-class answer and produces NO trace. #R527 §5.3 measured that this
 *  feature's most valuable property is refusing to answer about a photograph of a cat; a detector
 *  that always returns a curve destroys that property, so a reply that claims no boundary, too few
 *  points, or points spanning too little of the frame is rejected HERE, with a reason.
 *
 *  ── ⚠ THE PHOTOGRAPH LEAVES THE DEVICE ON THIS PATH, AND EVERY CLAIM ABOUT THAT COMES FROM HERE ──
 *  #R527 promised, in the panel and in the policy, that the picture never left the browser. On this
 *  path it does. That promise therefore cannot be a sentence someone remembers to change: the
 *  provenance line the reader is shown is DERIVED from which detector produced the trace
 *  (`privacyNote`), and the send is refused until consent has been recorded (`gate`). A claim about
 *  where the photograph went is computed from the fact, not written beside it.
 * ==========================================================================*/
(function () {
  'use strict';

  /* The model answers in a 0–1000 box rather than in pixels: the reply must not depend on the size
     of the copy that happened to be sent, and integers in a fixed box are what these models place
     most reliably. Scaling back to analysis pixels happens in `normalise`. */
  var BOX = 1000;

  /* A reply with fewer points than this is not a traced ridge, it is a guess at one. */
  var MIN_POINTS = 4;
  /* …and one spanning less of the width than this describes a corner of the picture, not its
     skyline. 0.2 is the fraction below which the downstream match has nothing to work with anyway:
     js/photo-geo-match.js needs 24 usable columns of ~900 to run at all. */
  var MIN_SPAN_FRAC = 0.2;

  /* How far the pixel-level refinement may move the boundary away from the model's polyline, as a
     fraction of image height. Wide enough to reach the true edge the model pointed near, narrow
     enough that it cannot leave the ridge for the tree line below it — which is the whole failure
     this path exists to avoid. */
  var BAND_FRAC = 0.035;

  var SCHEMA = {
    type: 'object',
    properties: {
      hasSkyline: { type: 'boolean' },
      confidence: { type: 'number' },
      points: {
        type: 'array',
        items: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' } },
          required: ['x', 'y'],
          additionalProperties: false
        }
      },
      excluded: {
        type: 'array',
        items: {
          type: 'object',
          properties: { x0: { type: 'number' }, x1: { type: 'number' }, why: { type: 'string' } },
          required: ['x0', 'x1', 'why'],
          additionalProperties: false
        }
      },
      note: { type: 'string' }
    },
    /* ⚠ every property is required and additionalProperties is false throughout, because that is
       what ai-proxy's strict-JSON-schema conversion accepts; a schema it cannot convert is silently
       downgraded to «any JSON object» and the reply stops being checked at all. */
    required: ['hasSkyline', 'confidence', 'points', 'excluded', 'note'],
    additionalProperties: false
  };

  var SYSTEM =
    'You trace the SKYLINE in a landscape photograph: the boundary where the sky meets the land — ' +
    'mountain ridges, hill crests, the horizon over the sea.\n' +
    'Coordinates are integers in a ' + BOX + '×' + BOX + ' box over the whole image: x=0 is the left edge, ' +
    'x=' + BOX + ' the right edge, y=0 the top, y=' + BOX + ' the bottom. Report the boundary as a left-to-right ' +
    'polyline in `points`, using enough points to follow every peak and saddle that is actually ' +
    'visible (typically 20–60; more where the ridge is intricate, fewer where it is a straight ' +
    'horizon).\n' +
    'Rules that decide whether this is useful at all:\n' +
    '· Trace the DISTANT land against the sky. Do NOT trace the top of a foreground tree, a roof, a ' +
    'pole, a person, or a cloud, even when that is the highest dark thing in the column.\n' +
    '· Where the true land/sky boundary is HIDDEN — foreground trees or buildings in front of it, ' +
    'cloud or fog resting on the ridge, lens flare — do not invent it. Put that stretch in ' +
    '`excluded` as {x0,x1} with a short `why`, and leave your polyline out of it or passing ' +
    'through it unweighted.\n' +
    '· If the photograph has no sky/land boundary at all (an interior, a close-up, a portrait, ' +
    'pure sky, pure sea, an aerial or satellite view), set hasSkyline=false and return an empty ' +
    '`points`. That is a correct and useful answer; a guessed curve is not.\n' +
    '· `confidence` is 0–1: how sure you are that the polyline follows the real land/sky boundary.\n' +
    '· `note` is one short sentence naming what you traced (e.g. "a snowy ridge across the upper ' +
    'third, hidden behind conifers on the right").';

  function prompt(meta) {
    var m = meta || {};
    var s = 'Trace the skyline of this photograph.';
    if (m.width && m.height) s += ' The image is ' + m.width + '×' + m.height + ' pixels; report in the ' + BOX + '-box regardless.';
    return s;
  }

  /* ── the reply, checked ─────────────────────────────────────────────────────────────────────────
     Every rejection carries a reason the panel shows, because «the model failed» and «this photo has
     no skyline» are different facts and the reader acts on them differently. */
  function normalise(reply, w, h) {
    if (!reply || typeof reply !== 'object') return { ok: false, why: 'unreadable' };
    if (reply.hasSkyline === false) {
      return { ok: false, why: 'no_skyline', note: typeof reply.note === 'string' ? reply.note : '' };
    }
    var raw = Array.isArray(reply.points) ? reply.points : [];
    var pts = [];
    for (var i = 0; i < raw.length; i++) {
      var p = raw[i];
      if (!p || typeof p !== 'object') continue;
      var x = +p.x, y = +p.y;
      if (!isFinite(x) || !isFinite(y)) continue;
      x = Math.max(0, Math.min(BOX, x)) / BOX * (w - 1);
      y = Math.max(0, Math.min(BOX, y)) / BOX * (h - 1);
      pts.push([x, y]);
    }
    pts.sort(function (a, b) { return a[0] - b[0]; });
    /* two points in the same column are one point; the mean is the only answer that does not depend
       on which of the two the model happened to emit first */
    var merged = [];
    for (var k = 0; k < pts.length;) {
      var j = k, sy = 0, n = 0;
      while (j < pts.length && Math.round(pts[j][0]) === Math.round(pts[k][0])) { sy += pts[j][1]; n++; j++; }
      merged.push([Math.round(pts[k][0]), sy / n]);
      k = j;
    }
    if (merged.length < MIN_POINTS) return { ok: false, why: 'too_few_points', points: merged.length };
    var span = merged[merged.length - 1][0] - merged[0][0];
    if (span < MIN_SPAN_FRAC * w) return { ok: false, why: 'too_narrow', spanFrac: span / w };

    var ex = [];
    var rex = Array.isArray(reply.excluded) ? reply.excluded : [];
    for (var e = 0; e < rex.length; e++) {
      var q = rex[e];
      if (!q || typeof q !== 'object') continue;
      var a = +q.x0, b = +q.x1;
      if (!isFinite(a) || !isFinite(b)) continue;
      a = Math.max(0, Math.min(BOX, a)) / BOX * (w - 1);
      b = Math.max(0, Math.min(BOX, b)) / BOX * (w - 1);
      ex.push({ x0: Math.round(Math.min(a, b)), x1: Math.round(Math.max(a, b)), why: typeof q.why === 'string' ? q.why : '' });
    }
    var conf = +reply.confidence;
    return {
      ok: true,
      points: merged,
      excluded: ex,
      confidence: isFinite(conf) ? Math.max(0, Math.min(1, conf)) : null,
      note: typeof reply.note === 'string' ? reply.note : ''
    };
  }

  /* ── polyline → one guide row per column ───────────────────────────────────────────────────────
     Columns outside the polyline's span get -1, which js/photo-geo-skyline.js reads as «no opinion
     here»: the dynamic program is free there and the column is not counted as evidence. A column
     inside an excluded stretch is guided (so the trace stays sane across it) but marked unusable. */
  function toGuide(norm, w, h) {
    var guide = new Int32Array(w), use = new Uint8Array(w);
    for (var i = 0; i < w; i++) guide[i] = -1;
    var p = norm.points;
    for (var s = 0; s < p.length - 1; s++) {
      var x0 = Math.max(0, Math.min(w - 1, p[s][0])), x1 = Math.max(0, Math.min(w - 1, p[s + 1][0]));
      var y0 = p[s][1], y1 = p[s + 1][1];
      if (x1 <= x0) { guide[x0] = clampY(y0, h); use[x0] = 1; continue; }
      for (var x = x0; x <= x1; x++) {
        var t = (x - x0) / (x1 - x0);
        guide[x] = clampY(y0 + (y1 - y0) * t, h);
        use[x] = 1;
      }
    }
    for (var e = 0; e < norm.excluded.length; e++) {
      var a = Math.max(0, Math.min(w - 1, norm.excluded[e].x0));
      var b = Math.max(0, Math.min(w - 1, norm.excluded[e].x1));
      for (var xx = a; xx <= b; xx++) use[xx] = 0;
    }
    return { guide: guide, use: use, bandPx: Math.max(3, Math.round(h * BAND_FRAC)) };
  }
  function clampY(y, h) { return Math.max(0, Math.min(h - 1, Math.round(y))); }

  /* ── ⚠ THE TWO CLAIMS THAT MUST NOT BE WRITTEN BY HAND ────────────────────────────────────────
     `gate` decides whether the photograph may be sent, and `privacyNote` decides what the reader is
     told afterwards. Both are computed from the same facts the code acts on, so a path that sends
     the picture cannot also display «it stayed on this device» — the sentence is not available to
     it. #R536 is the round where a claim written beside the code, instead of derived from it,
     stayed true in prose and false in production. */
  function gate(st) {
    var s = st || {};
    if (!s.consent) return { allowed: false, why: 'needs_consent' };
    if (!s.online) return { allowed: false, why: 'offline' };
    return { allowed: true, why: null };
  }
  function privacyNote(source) { return source === 'llm' ? 'sent_to_provider' : 'stayed_on_device'; }

  var API = {
    BOX: BOX, MIN_POINTS: MIN_POINTS, MIN_SPAN_FRAC: MIN_SPAN_FRAC, BAND_FRAC: BAND_FRAC,
    SCHEMA: SCHEMA, SYSTEM: SYSTEM, prompt: prompt,
    normalise: normalise, toGuide: toGuide, gate: gate, privacyNote: privacyNote,
    /* what js/photo-geo.js hands to askAIJSONEnvelope — one place, so the task, the effort and the
       detail cannot drift apart from the schema they belong to */
    callOptions: function () {
      return { task: 'vision_read', imageDetail: 'high', effortHint: 'high', webMode: 'off', schema: SCHEMA };
    }
  };
  if (typeof globalThis !== 'undefined') globalThis.IntMapPhotoVision = API;
  else if (typeof window !== 'undefined') window.IntMapPhotoVision = API;
})();
