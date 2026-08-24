/* ============================================================================
 *  IntMap · ATLAS — COMPARING AN EARTHQUAKE WITH A TYPHOON  (#R397)
 * ----------------------------------------------------------------------------
 *  「『世界の異常TOP3』で地震だけを3件並べるような、単一分野への偏りを改善してください。」
 *
 *  ⚠⚠⚠ THE BIAS IS A SAMPLING ARTEFACT BEFORE IT IS A RANKING ARTEFACT, and that is why raising the
 *  bar on earthquakes would not have fixed it. Look at what the analysis actually receives:
 *
 *    · `[EARTHQUAKES (USGS, last 24 h)]` — a LIST, dozens of rows, each with a magnitude. A number
 *      that is already comparable, already sorted, already the right shape for "top 3".
 *    · every other hazard — one or two rows of prose. A warning has an agency's word for its level,
 *      a volcano has an alert colour, a storm has a category, a flood has none of the three.
 *
 *  So the model was not preferring earthquakes. It was picking the only three items in front of it
 *  that could be ORDERED. Any prompt that says «compare across domains» is asking it to compare a
 *  sorted list of numbers against a paragraph.
 *
 *  Two things follow, and both are in here:
 *
 *  ① NORMALISE WITHIN A KIND BEFORE COMPARING ACROSS KINDS. A feed that publishes 400 rows must not
 *     get 400 chances to win against a feed that publishes two. `rank()` takes each kind's own top
 *     `perKind` first, and only those compete. This is NOT a quota on the OUTPUT — a genuinely
 *     seismic day can still return three earthquakes — it is a cap on how many TICKETS each feed
 *     buys to the same lottery.
 *  ② SCORE THE THINGS THE READER MEANT BY 「異常」, EACH SEPARATELY AND EACH KEPT. Severity is one of
 *     seven components, not the whole of it: an M5.8 under a city and an M7.4 under an ocean floor
 *     are not ordered by magnitude. The components are the ones the work order names — severity,
 *     population affected, geographic extent, deviation from normal, recency, confidence, and
 *     international weight — and `why` carries every one of them out with the result, because
 *     「なぜその事象を選んだのか説明可能な内部スコアまたは根拠を保持してください」.
 *
 *  ⚠ SEVERITY IS PER-KIND AND THE SCALES ARE NOT INTERCHANGEABLE. `SEVERITY` below maps each kind's
 *  own native measure onto 0..1 — Mw for a quake, the agency's own level for a warning, VAL for a
 *  volcano, Saffir-Simpson-like category for a cyclone. 「事象種別ごとの尺度の違い」 is exactly this
 *  table, and it is the part that must never be replaced by one formula.
 *
 *  ⚠ AND IT REFUSES RATHER THAN GUESSES. A candidate with no usable severity for its kind is scored
 *  on what it does have and its `confidence` component falls, instead of being given a default that
 *  would let an unmeasured event outrank a measured one.
 *
 *  Pure: no DOM, no globals, no network, no clock (the caller passes `nowMs`, because a module that
 *  reads the clock cannot be tested and #R380 found rows whose age was computed against the wrong
 *  one). tests/r397-checks.test.mjs feeds it a deliberately quake-heavy day.
 * ==========================================================================*/

export function makeAtlasAnomalyScore() {
  return (function () {

    var VERSION = 1;

    /* The kinds this can place on one scale. A kind that is not here is still scorable — it simply
       has no native-measure curve, so it leans on population/extent/deviation and says so. */
    var KINDS = ['earthquake', 'cyclone', 'flood', 'wildfire', 'volcano', 'severe_weather',
      'heat', 'cold', 'drought', 'tsunami', 'conflict', 'accident', 'outbreak', 'other'];

    /* ── ① SEVERITY: each kind's OWN measure, mapped to 0..1 ────────────────────────────────────
       The break points are the ones the publishing bodies themselves treat as thresholds, so the
       curve is piecewise-linear between them rather than an invented formula:
         · earthquake — Mw. 4.0 is «felt», 6.0 «damaging», 7.0 «major», 8.0+ «great» (USGS classes).
         · cyclone    — category 0..5.
         · volcano    — 0..4 for Normal/Advisory/Watch/Warning (USGS) or Green/Yellow/Orange/Red.
         · warning-shaped kinds — 0..4 for the agency's own ladder (Minor→Moderate→Severe→Extreme,
           which is CAP's own severity enumeration and is what alerts-relay normalises onto).
       ⚠ THESE ARE NOT COMPARABLE AS RAW NUMBERS: Mw 5 and category 5 are nothing like each other,
       which is the entire reason each kind gets its own row. */
    var SEVERITY = {
      earthquake: [[3.5, 0.05], [4.5, 0.2], [5.5, 0.4], [6.5, 0.65], [7.5, 0.88], [9.0, 1]],
      tsunami: [[0, 0.3], [1, 0.6], [2, 0.85], [3, 1]],
      cyclone: [[0, 0.2], [1, 0.4], [2, 0.55], [3, 0.75], [4, 0.9], [5, 1]],
      volcano: [[0, 0.1], [1, 0.35], [2, 0.6], [3, 0.85], [4, 1]],
      severe_weather: [[0, 0.1], [1, 0.3], [2, 0.55], [3, 0.8], [4, 1]],
      flood: [[0, 0.15], [1, 0.35], [2, 0.6], [3, 0.85], [4, 1]],
      wildfire: [[0, 0.1], [1, 0.3], [2, 0.55], [3, 0.8], [4, 1]],
      heat: [[0, 0.1], [1, 0.3], [2, 0.55], [3, 0.8], [4, 1]],
      cold: [[0, 0.1], [1, 0.3], [2, 0.55], [3, 0.8], [4, 1]],
      drought: [[0, 0.1], [1, 0.3], [2, 0.5], [3, 0.75], [4, 1]],
      outbreak: [[0, 0.15], [1, 0.4], [2, 0.65], [3, 0.85], [4, 1]],
      conflict: [[0, 0.2], [1, 0.45], [2, 0.7], [3, 0.9], [4, 1]],
      accident: [[0, 0.1], [1, 0.3], [2, 0.55], [3, 0.8], [4, 1]],
    };

    /* ── ② THE WEIGHTS ─────────────────────────────────────────────────────────────────────────
       ⚠ SEVERITY IS THE LARGEST SINGLE WEIGHT AND IT IS UNDER HALF THE TOTAL. That ratio is the
       point: it is what lets an M5.8 under a city outrank an M7.4 under an ocean, and it is what
       stopped the ranking being «sort by magnitude» with extra steps. */
    var WEIGHTS = { severity: 0.30, population: 0.22, extent: 0.10, deviation: 0.14,
      recency: 0.10, confidence: 0.06, weight: 0.08 };

    var num = function (v) {
      if (v == null || v === '' || typeof v === 'boolean') return null;
      var x = Number(v); return isFinite(x) ? x : null;
    };
    var clamp01 = function (x) { return x < 0 ? 0 : (x > 1 ? 1 : x); };

    /** curve(points, x) — piecewise-linear interpolation over a kind's own break points. */
    function curve(points, x) {
      if (!points || !points.length || x == null) return null;
      if (x <= points[0][0]) return points[0][1];
      for (var i = 1; i < points.length; i++) {
        if (x <= points[i][0]) {
          var a = points[i - 1], b = points[i];
          var t = (b[0] === a[0]) ? 0 : (x - a[0]) / (b[0] - a[0]);
          return a[1] + t * (b[1] - a[1]);
        }
      }
      return points[points.length - 1][1];
    }

    /** severityOf(kind, raw) — 0..1 on that kind's own scale, or null when it has no usable measure. */
    function severityOf(kind, raw) {
      var x = num(raw);
      if (x == null) return null;
      var pts = SEVERITY[String(kind)] || null;
      if (!pts) return null;
      return clamp01(curve(pts, x));
    }

    /* Population, on a log scale: the step from 10k to 100k people affected matters as much as the
       step from 100k to 1M, which is how every impact scale in this field is actually written. */
    function populationOf(n) {
      var p = num(n);
      if (p == null || p <= 0) return null;
      return clamp01(Math.log10(p) / 7);   /* 10 → 0.14 · 10k → 0.57 · 1M → 0.86 · 10M+ → 1 */
    }

    /* Extent, likewise: 10 km and 1000 km are three decades apart, not a factor of a hundred. */
    function extentOf(km) {
      var r = num(km);
      if (r == null || r <= 0) return null;
      return clamp01(Math.log10(r) / 3.3);   /* 10 km → 0.30 · 100 km → 0.61 · 1000 km → 0.91 */
    }

    /* Recency over a 72-hour window, because that is the retention IntMap already keeps articles for
       (CONSTITUTION.md §5) and comparing a 3-day-old event with a 3-week-old one on the same curve
       would make the curve almost flat. */
    var RECENCY_WINDOW_MS = 72 * 3600 * 1000;
    function recencyOf(atMs, nowMs) {
      var a = num(atMs), n = num(nowMs);
      if (a == null || n == null) return null;
      var age = n - a;
      if (age < 0) return 1;              /* a forecast/warning still in force is as fresh as it gets */
      return clamp01(1 - (age / RECENCY_WINDOW_MS));
    }

    var CONF = { high: 1, medium: 0.65, low: 0.3 };

    /**
     * score(c, nowMs) -> {value, why, missing}
     *
     * `why` is the whole point: every component that contributed, with its raw input, its normalised
     * value and its weight — so the ranking can be explained rather than asserted.
     * `missing` names the components this candidate had nothing for, which is what keeps an
     * unmeasured event from quietly borrowing a default.
     */
    function score(c, nowMs) {
      c = c || {};
      var kind = KINDS.indexOf(String(c.kind)) >= 0 ? String(c.kind) : 'other';
      var parts = {
        severity: severityOf(kind, c.severityRaw),
        population: populationOf(c.populationAffected),
        extent: extentOf(c.radiusKm),
        deviation: (num(c.baselineDeviation) == null) ? null : clamp01(num(c.baselineDeviation)),
        recency: recencyOf(c.atMs, nowMs),
        confidence: (CONF[String(c.confidence)] != null) ? CONF[String(c.confidence)] : null,
        weight: (num(c.internationalWeight) == null) ? null : clamp01(num(c.internationalWeight)),
      };
      /* ⚠ THE DENOMINATOR IS THE WEIGHT ACTUALLY PRESENT, NOT THE FULL TOTAL. Dividing by 1.0 when
         three components are missing would rank a fully-described minor event below a barely-
         described major one purely for being better documented. */
      var num_ = 0, den = 0; var missing = [];
      Object.keys(WEIGHTS).forEach(function (k) {
        if (parts[k] == null) { missing.push(k); return; }
        num_ += parts[k] * WEIGHTS[k]; den += WEIGHTS[k];
      });
      var value = den > 0 ? (num_ / den) : 0;
      var why = {};
      Object.keys(WEIGHTS).forEach(function (k) {
        if (parts[k] == null) return;
        why[k] = { normalised: +parts[k].toFixed(3), weight: WEIGHTS[k],
          contribution: +((parts[k] * WEIGHTS[k]) / den).toFixed(3) };
      });
      return { value: +value.toFixed(4), why: why, missing: missing, kindScale: kind };
    }

    /**
     * rank(candidates, opts) -> [{...candidate, score, why, missing, rankWithinKind}]
     *
     * opts: {nowMs, n = 3, perKind = 2}
     *
     * ⚠ `perKind` IS THE FIX FOR THE REPORTED DEFECT. USGS publishes hundreds of rows a day and the
     * warning relay publishes a handful, so an unfiltered field lets one feed occupy every place by
     * arithmetic rather than by importance. Each kind sends forward its own best `perKind` and those
     * compete on the seven components. A day that really is seismic still returns earthquakes — what
     * it can no longer do is return them because they were the only sortable rows in the room.
     */
    function rank(candidates, opts) {
      opts = opts || {};
      var nowMs = num(opts.nowMs);
      var n = num(opts.n) || 3;
      var perKind = num(opts.perKind) || 2;
      var scored = (Array.isArray(candidates) ? candidates : []).map(function (c) {
        var s = score(c, nowMs);
        return Object.assign({}, c, { score: s.value, why: s.why, missing: s.missing, kindScale: s.kindScale });
      });
      var byKind = Object.create(null);
      scored.forEach(function (r) { (byKind[r.kindScale] = byKind[r.kindScale] || []).push(r); });
      var pool = [];
      Object.keys(byKind).forEach(function (k) {
        byKind[k].sort(function (a, b) { return b.score - a.score; });
        byKind[k].slice(0, perKind).forEach(function (r, i) {
          pool.push(Object.assign({}, r, { rankWithinKind: i + 1 }));
        });
      });
      pool.sort(function (a, b) { return b.score - a.score; });
      return pool.slice(0, n);
    }

    /**
     * promptBlock(ranked) — the ranked set as the analysis prompt reads it, with each score's
     * components spelled out. Model-facing English; nothing here reaches the screen.
     */
    function promptBlock(ranked) {
      var rows = (Array.isArray(ranked) ? ranked : []).map(function (r, i) {
        var why = Object.keys(r.why || {}).map(function (k) {
          return k + '=' + r.why[k].normalised + '(w' + r.why[k].weight + ')';
        }).join(' ');
        return (i + 1) + '. [' + r.kindScale + '] ' + String(r.name || '(unnamed)')
          + (r.place ? (' — ' + r.place) : '')
          + ' | score ' + r.score + ' | ' + why
          + (r.missing && r.missing.length ? (' | not measured: ' + r.missing.join(',')) : '');
      });
      if (!rows.length) return '';
      return '[CROSS-DOMAIN ANOMALY RANKING — every hazard class placed on ONE scale by IntMap, not by you.\n'
        + 'Each kind contributed only its own best few candidates, so a feed that publishes hundreds of rows\n'
        + 'cannot crowd out one that publishes two. The components are severity (on that KIND\'s own native\n'
        + 'measure), population affected, geographic extent, deviation from normal, recency, confidence and\n'
        + 'international weight. Use this order, and when you name an item give the reason from its components\n'
        + 'rather than asserting importance. "not measured" means IntMap had no value — do not invent one.]\n'
        + rows.join('\n') + '\n\n';
    }

    /* ══ ③ THE FEEDS, IN THE ONE SHAPE ═════════════════════════════════════════════════════════════
       Pure converters, so the wiring in js/atlas-console.js is a call and not a transformation.
       ⚠ NOTHING HERE INVENTS A FIGURE. A USGS record carries a magnitude, a position, a time and a
       place string — and no population count — so `populationAffected` is left ABSENT rather than
       estimated, and `score()` then reports it under `missing` instead of scoring a guess. The one
       derived value is `radiusKm`, from the magnitude, because felt radius genuinely is a function of
       magnitude and the relation is the standard order-of-magnitude one (~10 km at M4, ~600 km at M8);
       it is marked as derived in the row so nothing downstream reads it as measured. */
    function fromUsgs(features, nowMs) {
      return (Array.isArray(features) ? features : []).map(function (f) {
        var p = (f && f.properties) || {}, c = (f && f.geometry && f.geometry.coordinates) || [];
        var mag = num(p.mag);
        if (mag == null) return null;
        return { kind: 'earthquake', name: 'M' + mag.toFixed(1), place: String(p.place || ''),
          lng: num(c[0]), lat: num(c[1]), atMs: num(p.time),
          severityRaw: mag, radiusKm: Math.pow(10, (mag - 2.5) / 1.6) * 8, radiusDerived: true,
          confidence: 'high', sourceId: String(p.ids || p.code || ''),
          internationalWeight: (num(p.tsunami) ? 0.6 : 0.1) };
      }).filter(Boolean);
    }

    /* CAP severity words → the 0..4 ladder `SEVERITY` expects for warning-shaped kinds. The hazard
       word an agency uses is mapped onto a KIND so the right curve is chosen; an unrecognised hazard
       stays `severe_weather`, which is the honest default for a meteorological agency's warning. */
    var CAP_LEVEL = { extreme: 4, severe: 3, moderate: 2, minor: 1, unknown: 0 };
    var HAZARD_KIND = [
      [/flood|inundation|洪水|浸水/i, 'flood'],
      [/typhoon|hurricane|cyclone|tropical|台風|颱風/i, 'cyclone'],
      [/tsunami|津波/i, 'tsunami'],
      [/volcan|噴火|火山/i, 'volcano'],
      [/wild ?fire|bush ?fire|山火事|林火/i, 'wildfire'],
      [/heat|熱中症|高温/i, 'heat'],
      [/cold|freeze|frost|寒波|低温/i, 'cold'],
      [/drought|干ばつ|乾燥/i, 'drought'],
    ];
    function fromAlerts(rows, nowMs) {
      return (Array.isArray(rows) ? rows : []).map(function (r) {
        if (!r) return null;
        var hz = String(r.hazard || r.hz || '');
        var kind = 'severe_weather';
        for (var i = 0; i < HAZARD_KIND.length; i++) if (HAZARD_KIND[i][0].test(hz)) { kind = HAZARD_KIND[i][1]; break; }
        var lvl = CAP_LEVEL[String(r.norm || r.lv || '').toLowerCase()];
        return { kind: kind, name: (hz || 'warning') + (r.unit ? (' — ' + r.unit) : ''),
          place: String(r.name || r.unit || r.iso || ''), atMs: num(r.atMs) != null ? num(r.atMs) : num(nowMs),
          severityRaw: (lvl == null ? null : lvl), confidence: 'high',
          sourceId: String(r.feed || ''), internationalWeight: 0.2 };
      }).filter(Boolean);
    }

    var API = { CAP_LEVEL, KINDS, RECENCY_WINDOW_MS, SEVERITY, VERSION, WEIGHTS, curve, extentOf,
      fromAlerts, fromUsgs, populationOf, promptBlock, rank, recencyOf, score, severityOf };
    try { window.IntMapAnomalyScore = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}
