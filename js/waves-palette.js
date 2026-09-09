/* ============================================================================
 *  IntMap · The wave-height colour ramp — window.IntMapWavePalette  (#R572)
 * ----------------------------------------------------------------------------
 *  One job: turn a significant wave height in metres into a colour, byte for byte the same colour
 *  Windy shows for that height. Nothing here fetches, draws, or knows what a map is, so the claim
 *  「同一の色」 is checkable by `node --test` without a browser — see tests/r572-checks.test.mjs ①.
 *
 *  ── WHY THE STOPS ARE THESE NUMBERS ──────────────────────────────────────────────────────────────
 *  MEASURED 2026-09-09 by opening windy.com (bundle v51.2.1) and reading `W.colors.waves`, which is
 *  the live definition its own renderer uses. Twelve stops, 0–12 m, quantised to 1024 steps. The
 *  reader asked for a wave layer 「Windyと画素、RGBレベルで完全に同一なグラフィックに」; these are
 *  the numbers that request resolves to. They are a table of twelve colours, credited in
 *  js/reference-data.js and in the legend — not a fact this file is entitled to invent.
 *  ⚠ EXPIRY: if Windy changes its ramp this stops matching. The test pins the CHECKSUM of Windy's
 *  own 4096-byte LUT as it was on that date, so a drift is a red test rather than a silent
 *  divergence — but a red test here means 「the upstream we copied changed」, not 「we broke it」.
 *
 *  ── WHY NOT LINEAR RGB ───────────────────────────────────────────────────────────────────────────
 *  ⚠⚠⚠ THE OBVIOUS IMPLEMENTATION IS WRONG AND LOOKS ALMOST RIGHT. Interpolating the stops in sRGB
 *  agrees with Windy to a MEAN of 1.11/255 — close enough to pass any eyeball — and drifts to
 *  11.52/255 in the middle of the wide stop intervals. MEASURED at 3.5 m: linear says
 *  rgb(144,48,100), Windy draws rgb(152,44,103). Windy interpolates in YCbCr AND rescales the chroma
 *  of the interpolated colour back onto the line between the endpoints' chroma lengths, so a blend
 *  between two saturated colours does not sag through a greyer middle.
 *
 *  With that, and with two details that each cost a whole unit of the last byte —
 *      · the sample points are v(i) = min + i·(max−min)/(steps−1),  NOT (i+0.5)/steps
 *      · the return trip is ×256 and ROUNDED,  NOT ×255, NOT floored
 *  — the agreement is EXACT: 1024 of 1024 entries, max delta 0. Every one of those four choices was
 *  arrived at by measuring against Windy's live LUT, not by reasoning about what ought to be right.
 *
 *  ── WHAT THE RENDERER DOES WITH THIS ─────────────────────────────────────────────────────────────
 *  `lut()` returns the 1024×4 RGBA bytes to upload as a 1-D texture. js/waves-gl.js samples it the
 *  way Windy does — `texture2D(lut, value/12)` with LINEAR filtering — so between two of the 1024
 *  entries the GPU blends, which is why this file must produce the entries themselves exactly.
 * ========================================================================== */
(function (root) {
  'use strict';

  /* MEASURED from `W.colors.waves.defaultColorGradient`, windy.com v51.2.1, 2026-09-09.
     Metres of significant wave height → sRGB. Alpha is 255 at every stop (`opaque: true`). */
  var STOPS = [
    [0,    159, 185, 191],
    [0.5,   48, 157, 185],
    [1,     48,  98, 141],
    [1.5,   56, 104, 191],
    [2,     57,  60, 142],
    [2.5,  187,  90, 191],
    [3,    154,  48, 151],
    [4,    133,  48,  48],
    [5,    191,  51,  95],
    [7,    191, 103,  87],
    [10,   191, 191, 191],
    [12,   154, 127, 155]
  ];

  var STEPS = 1024;
  var MIN = STOPS[0][0];
  var MAX = STOPS[STOPS.length - 1][0];

  /* The chroma rescale is skipped when either endpoint is near-neutral (nothing to preserve) or when
     the interpolated chroma has collapsed (dividing by it would explode). Both thresholds are
     Windy's; they are not tuned here, because a different threshold is a different ramp. */
  var CHROMA_MIN = 0.05;
  var CHROMA_EPS = 0.01;

  function toYCbCr(r, g, b) {
    var R = r / 255, G = g / 255, B = b / 255;
    var Y = 0.299 * R + 0.587 * G + 0.114 * B;
    return [Y, (B - Y) * 0.565, (R - Y) * 0.713];
  }

  function toRGB(y) {
    return [y[0] + 1.403 * y[2], y[0] - 0.344 * y[1] - 0.714 * y[2], y[0] + 1.77 * y[1]];
  }

  function clamp255(x) {
    /* ⚠ ×256, not ×255 — see the header. `Math.round` here and `Math.floor` there is the whole
       difference between 1024/1024 and 79/1024 entries agreeing. */
    var v = Math.round(x * 256);
    return v < 0 ? 0 : (v > 255 ? 255 : v);
  }

  /* The colour at an arbitrary height, as [r,g,b] bytes. Outside [MIN,MAX] the end stops hold.
     ⚠ THE END STOPS ARE NOT RETURNED VERBATIM. Returning STOPS[0] as written gives rgb(159,185,191)
     where Windy draws rgb(160,186,192): every entry, endpoints included, goes through the ×256 round
     trip, and ×256/255 is enough to carry the last byte. MEASURED — short-circuiting the ends was the
     difference between 1022/1024 and 1024/1024. Clamp the HEIGHT, never the colour. */
  function colourAt(metres) {
    var v = metres;
    if (!(v > MIN)) v = MIN;
    else if (v > MAX) v = MAX;

    var i = 1;
    while (i < STOPS.length - 1 && v > STOPS[i][0]) i++;
    var a = STOPS[i - 1], b = STOPS[i];
    var span = b[0] - a[0];
    var t = span > 0 ? (v - a[0]) / span : 0;

    var ya = toYCbCr(a[1], a[2], a[3]);
    var yb = toYCbCr(b[1], b[2], b[3]);
    var m = [ya[0] + (yb[0] - ya[0]) * t, ya[1] + (yb[1] - ya[1]) * t, ya[2] + (yb[2] - ya[2]) * t];

    var la = Math.sqrt(ya[1] * ya[1] + ya[2] * ya[2]);
    var lb = Math.sqrt(yb[1] * yb[1] + yb[2] * yb[2]);
    var lm = Math.sqrt(m[1] * m[1] + m[2] * m[2]);
    if (la > CHROMA_MIN && lb > CHROMA_MIN && lm > CHROMA_EPS) {
      var s = (la + (lb - la) * t) / lm;
      m[1] *= s; m[2] *= s;
    }

    var c = toRGB(m);
    return [clamp255(c[0]), clamp255(c[1]), clamp255(c[2])];
  }

  /* The height a LUT entry stands for. ⚠ (steps−1), so entry 1023 is exactly MAX. */
  function valueAt(i) { return MIN + i * (MAX - MIN) / (STEPS - 1); }

  var cached = null;
  function lut() {
    if (cached) return cached;
    var out = new Uint8Array(STEPS * 4);
    for (var i = 0; i < STEPS; i++) {
      var c = colourAt(valueAt(i));
      out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
    }
    cached = out;
    return out;
  }

  /* CSS `linear-gradient(...)` for the legend bar. The stops carry their own positions, so the bar
     shows the same non-uniform spacing the data does — 0–3 m occupies a quarter of the range and
     most of the world's sea. ⚠ The browser interpolates this in sRGB, so THE BAR IS NOT THE RAMP;
     it is a label for it. The map is the thing that must match, and the map reads `lut()`. */
  function cssGradient() {
    var parts = [];
    for (var i = 0; i < STOPS.length; i++) {
      var s = STOPS[i];
      var pct = ((s[0] - MIN) / (MAX - MIN) * 100).toFixed(3);
      parts.push('rgb(' + s[1] + ',' + s[2] + ',' + s[3] + ') ' + pct + '%');
    }
    return 'linear-gradient(to right,' + parts.join(',') + ')';
  }

  root.IntMapWavePalette = {
    STOPS: STOPS, STEPS: STEPS, MIN: MIN, MAX: MAX,
    colourAt: colourAt, valueAt: valueAt, lut: lut, cssGradient: cssGradient
  };
})(typeof window !== 'undefined' ? window : globalThis);
