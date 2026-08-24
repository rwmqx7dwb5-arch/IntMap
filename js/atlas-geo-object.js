/* ============================================================================
 *  IntMap · ATLAS — ONE SHAPE FOR A PLACE, AND WHERE ITS COORDINATE CAME FROM  (#R397)
 * ----------------------------------------------------------------------------
 *  「正しい座標を取得しているのに回答後に地名を再ジオコードして『未配置』にしてしまう」
 *
 *  That report is not a geocoder bug. It is a MISSING FIELD, and the field is missing in three
 *  places at once, so the coordinate had nowhere to travel:
 *
 *    · `ANSWER_SCHEMA.places` (js/atlas-answer-contract.js) is `{name, country, kind, claimIds}`.
 *      No lat. No lng.
 *    · `RESEARCH_MAP_SCHEMA.items` (js/atlas-console.js) is the same, and its prompt says
 *      «DO NOT output latitude/longitude — the app resolves locationName+country itself».
 *    · `_pinReplyPlaces()` maps every incoming place through
 *      `{name, country, kind, summary, src}` — it does not READ a coordinate even when the caller
 *      has one — and then re-resolves each name from scratch.
 *
 *  So a `mapReport` item whose position came out of an evidence record, a quake from the USGS feed,
 *  a volcano from the GVP feed, an aircraft, a company facility — all of them arrive at the pinning
 *  step as a bare string, are geocoded again, and land as 「本文に登場したが未配置」 whenever the
 *  second lookup is stricter than the first. The name-only match against pins already on the map
 *  (`preKeys`) makes it worse: it compares NORMALISED NAMES, so «Kahramanmaraş» and
 *  «14 km SSW of Kahramanmaraş» are two different places to it.
 *
 *  ⚠ THE FIX IS NOT «LET THE MODEL EMIT COORDINATES». That rule is correct and it stays
 *  (DECISIONS.md: 座標・URL・出典をモデルに生成させない). A language model's latitude is a
 *  plausible number, which is the one kind of number a map must never draw. What changes is that
 *  CODE's coordinates stop being thrown away.
 *
 *  ══ PROVENANCE IS THE POINT, NOT THE COORDINATE ═══════════════════════════════════════════════
 *  A coordinate with no history is the second half of the same defect: 「ジオコーダが返した国・地域の
 *  代表座標を、ユーザー指定地点としてAI promptへ渡してはいけない」. The centroid of Kenya is a real
 *  number that is not a place anybody chose — feeding it to a prompt as «the point the user means»
 *  produces a confident answer about a spot in a national park. So every coordinate here carries
 *  WHERE IT CAME FROM, and the classes are ordered by how much they license:
 *
 *    user_specified          the reader clicked, dropped a pin, or typed the numbers. Only this one
 *                            may ever be described to the model as the point the user specified.
 *    map_click               a click that has not been confirmed as a subject (still a real point).
 *    feed_coordinate         a coordinate a data feed published for this object (USGS, GVP, ADS-B).
 *    event_location          the position an event record carries.
 *    geocoded_point          a gazetteer hit for a NAME that resolves to a point (a station, a port).
 *    resolved_place_centroid a representative point STANDING IN for an area. NOT a location.
 *    model_named             a name the model produced and nothing has resolved yet. lat/lng null.
 *
 *  `POINT_LIKE` is the set that may be treated as «this exact spot». `resolved_place_centroid` is
 *  deliberately outside it, and `describesUserPoint()` is the single predicate every prompt builder
 *  asks before it writes a coordinate into a sentence.
 *
 *  Pure: no DOM, no globals, no network — so tests/r397-checks.test.mjs can hand it wrong inputs and
 *  watch it refuse. Consumed by js/atlas-answer-contract.js and js/atlas-console.js.
 * ==========================================================================*/

export function makeAtlasGeoObject() {
  return (function () {

    var GEO_OBJECT_VERSION = 1;

    /* Ordered most-specific-first: `best()` prefers an earlier class when two records describe the
       same object, so a feed coordinate is never replaced by a centroid for the same name. */
    var PROVENANCE = ['user_specified', 'map_click', 'feed_coordinate', 'event_location',
      'geocoded_point', 'resolved_place_centroid', 'model_named'];

    /* The classes that denote an actual spot. A centroid denotes an AREA and is excluded on purpose. */
    var POINT_LIKE = ['user_specified', 'map_click', 'feed_coordinate', 'event_location', 'geocoded_point'];

    /* Only a coordinate the reader themselves supplied may be called theirs. */
    var USER_POINT = ['user_specified', 'map_click'];

    var CONFIDENCE = ['high', 'medium', 'low'];

    var str = function (v, n) { return String(v == null ? '' : v).slice(0, n || 200); };
    var arr = function (v) { return Array.isArray(v) ? v : []; };
    /* ⚠ `Number(null)` IS 0, AND SO IS `Number('')`. Writing this as `isFinite(Number(v))` made
       `placed({lng:null,lat:null})` answer TRUE — an object at the intersection of the equator and
       the prime meridian — which then made `mergeKnown` skip the merge, because it only fills in a
       coordinate for an object that does not have one. The first self-check of this file caught it:
       the reported bug survived my own fix for one revision. Null Island is not a location. */
    var num = function (v) {
      if (v == null || v === '' || typeof v === 'boolean') return null;
      var x = Number(v);
      return isFinite(x) ? x : null;
    };

    function inSet(v, set, dflt) { return set.indexOf(String(v == null ? '' : v)) >= 0 ? String(v) : dflt; }

    /** A coordinate pair is only a coordinate pair when both halves are real and in range. */
    function validLngLat(lng, lat) {
      var a = num(lng), b = num(lat);
      return a != null && b != null && a >= -180 && a <= 180 && b >= -90 && b <= 90;
    }

    /**
     * geoObject(src) — the one shape. Coordinates survive; a coordinate with no declared provenance
     * does NOT become `user_specified` by default — it becomes the weakest class that still admits a
     * point, because guessing upward is exactly the defect this file exists to stop.
     */
    function geoObject(src, opts) {
      src = (src && typeof src === 'object') ? src : {};
      opts = opts || {};
      var lng = num(src.lng != null ? src.lng : src.lon), lat = num(src.lat);
      var has = validLngLat(lng, lat);
      var prov = inSet(src.provenance, PROVENANCE, '');
      /* ⚠ AN UNDECLARED COORDINATE DEFAULTS TO THE CENTROID CLASS, NOT A POINT CLASS. A caller that
         knows its coordinate is an exact spot has to say so. Defaulting the other way would let any
         coordinate whose origin nobody recorded be described to the model as an exact position —
         which is the failure this file's provenance column exists to prevent. */
      if (!prov) prov = has ? inSet(opts.defaultProvenance, PROVENANCE, 'resolved_place_centroid') : 'model_named';
      /* A record with no usable coordinate cannot claim a positional provenance. */
      if (!has) prov = 'model_named';
      return {
        v: GEO_OBJECT_VERSION,
        id: str(src.id || opts.id || '', 80),
        name: str(src.name || src.locationName || src.n || '', 160),
        country: str(src.country || src.c || '', 90),
        kind: str(src.kind || src.k || '', 60),
        lng: has ? lng : null,
        lat: has ? lat : null,
        provenance: prov,
        sourceId: str(src.sourceId || src.evidenceId || '', 80),
        at: str(src.at || src.dateOrPeriod || src.date || '', 60),
        confidence: inSet(src.confidence, CONFIDENCE, has ? 'high' : 'low'),
        summary: str(src.summary || src.s || src.sum || '', 400),
        claimIds: arr(src.claimIds).map(function (x) { return str(x, 40); }),
      };
    }

    /** placed(o) — does this object know where it is? The only test the pinning step should apply. */
    function placed(o) { return !!(o && validLngLat(o.lng, o.lat)); }

    /** pointLike(o) — may this be treated as one exact spot (rather than a stand-in for an area)? */
    function pointLike(o) { return placed(o) && POINT_LIKE.indexOf(String(o && o.provenance)) >= 0; }

    /**
     * describesUserPoint(o) — may a prompt say «the point the user specified» about this?
     * ⚠ THE WHOLE REASON THIS PREDICATE EXISTS. A geocoded country centroid is a number, not an
     * intention, and a prompt that presents it as the reader's choice gets a confident answer about
     * a spot nobody picked.
     */
    function describesUserPoint(o) { return placed(o) && USER_POINT.indexOf(String(o && o.provenance)) >= 0; }

    /** rank(o) — position in PROVENANCE, for choosing between two records of the same object. */
    function rank(o) {
      var i = PROVENANCE.indexOf(String((o && o.provenance) || ''));
      return i < 0 ? PROVENANCE.length : i;
    }

    /**
     * mergeKnown(modelPlaces, known) — the seam the reported bug lives in.
     *
     * `modelPlaces` are what the model named (strings, no coordinates — by design). `known` are the
     * objects CODE already resolved this turn, with real coordinates and real provenance. A model
     * place that matches a known object ADOPTS its coordinate instead of being geocoded again.
     *
     * Matching is by id first, then by normalised name, then — and this is the part name-only
     * matching could never do — by the known object's name CONTAINING the model's name or vice
     * versa, so «Kahramanmaraş» meets «14 km SSW of Kahramanmaraş».
     */
    function normName(s) {
      return String(s == null ? '' : s).toLowerCase()
        .replace(/[‘’“”'".,()]/g, '')
        .replace(/\s+/g, ' ').trim();
    }
    function mergeKnown(modelPlaces, known) {
      var out = [];
      var kn = arr(known).map(function (k) { return geoObject(k); });
      var byId = Object.create(null), byName = Object.create(null);
      kn.forEach(function (k) {
        if (k.id) byId[k.id] = k;
        var n = normName(k.name);
        /* keep the STRONGEST provenance per name rather than the last one seen */
        if (n && (!byName[n] || rank(k) < rank(byName[n]))) byName[n] = k;
      });
      arr(modelPlaces).forEach(function (p) {
        var o = geoObject(p);
        var hit = (o.id && byId[o.id]) || byName[normName(o.name)] || null;
        if (!hit && o.name) {
          var n = normName(o.name);
          if (n.length >= 3) {
            var names = Object.keys(byName);
            for (var i = 0; i < names.length; i++) {
              if (names[i].indexOf(n) >= 0 || n.indexOf(names[i]) >= 0) { hit = byName[names[i]]; break; }
            }
          }
        }
        if (hit && placed(hit) && !placed(o)) {
          o.lng = hit.lng; o.lat = hit.lat; o.provenance = hit.provenance;
          o.sourceId = o.sourceId || hit.sourceId;
          o.at = o.at || hit.at;
          o.confidence = hit.confidence;
          if (!o.id) o.id = hit.id;
        }
        out.push(o);
      });
      /* Known objects the model never named still belong to the turn — they are already on the map. */
      kn.forEach(function (k) {
        if (!placed(k)) return;
        var n = normName(k.name);
        var seen = out.some(function (o) { return (o.id && k.id && o.id === k.id) || (n && normName(o.name) === n); });
        if (!seen) out.push(k);
      });
      return out;
    }

    var API = { CONFIDENCE, GEO_OBJECT_VERSION, POINT_LIKE, PROVENANCE, USER_POINT,
      describesUserPoint, geoObject, mergeKnown, normName, placed, pointLike, rank, validLngLat };
    try { window.IntMapGeoObject = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}
