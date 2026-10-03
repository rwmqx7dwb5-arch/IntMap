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
 *    web_verified            a point a LIVE WEB SEARCH vouched for, for a name no gazetteer holds
 *                            (#R515). It denotes a spot, so it is POINT_LIKE — but it is weaker than a
 *                            gazetteer feature and must stay distinguishable from one.
 *    resolved_place_centroid a representative point STANDING IN for an area. NOT a location.
 *    model_named             a name the model produced and nothing has resolved yet. lat/lng null.
 *
 *  `POINT_LIKE` is the set that may be treated as «this exact spot». `resolved_place_centroid` is
 *  deliberately outside it, and `describesUserPoint()` is the single predicate every prompt builder
 *  asks before it writes a coordinate into a sentence.
 *
 *  Pure: no DOM, no globals, no network — so tests/atlas-console-observers-checks.test.mjs (#R397) can hand it wrong inputs and
 *  watch it refuse. Consumed by js/atlas-answer-contract.js and js/atlas-console.js.
 * ==========================================================================*/

export function makeAtlasGeoObject() {
  return (function () {

    var GEO_OBJECT_VERSION = 1;
    var WORLD_OBJECT_VERSION = 1;   /* (world-objects) the shape `worldObject()` adds on top of a place record */

    /* Ordered most-specific-first: `best()` prefers an earlier class when two records describe the
       same object, so a feed coordinate is never replaced by a centroid for the same name. */
    var PROVENANCE = ['user_specified', 'map_click', 'feed_coordinate', 'event_location',
      'geocoded_point', 'web_verified', 'resolved_place_centroid', 'model_named'];   /* (#R515) */

    /* The classes that denote an actual spot. A centroid denotes an AREA and is excluded on purpose. */
    var POINT_LIKE = ['user_specified', 'map_click', 'feed_coordinate', 'event_location', 'geocoded_point', 'web_verified'];

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


    /* ══ (world-objects) THE REAL-WORLD OBJECT — a place record that also knows WHAT it is, WHEN, and
       WHAT ELSE IT IS TIED TO ═══════════════════════════════════════════════════════════════════════
       An earthquake, a news event, a facility, a company, a volcano and a place profile each came back
       from their capability in a different shape, so «this earthquake» could not be followed to the
       articles about it or the plant beside it — each answer was a dead end. The ties were always
       there (a coordinate, a time, an article id, an evidence id); they had nowhere to be written.

       ⚠ THIS IS NOT A SECOND PLACE RECORD. It is `geoObject()` plus six columns, built by calling it:
       the coordinate keeps its PROVENANCE class (a centroid still can never become «the exact spot»),
       and every reader of `geoObject` keeps working unchanged (GEO_OBJECT_VERSION stays 1).

         type         what KIND of thing — the vocabulary below. Free-ended like the ledger's KINDS: a type
                      outside it is kept verbatim (a second opinion about the field would disagree with
                      whatever supplied it). `kind` stays geoObject's own free sub-type («nuclear power plant»).
         ref          `type:id` — the ONE reference by which any capability, card or follow-up names the object.
                      Empty when the object has no id: an object nobody can name cannot be followed.
         bounds       [west,south,east,north] when the thing HAS an extent (an electoral district, a volcano's
                      area of effect); null for a point. Never invented from a point.
         time         { atMs, endMs } — when it happened / was reported. null when the source states none —
                      ⚠ a timeless object (a facility) is NOT «now»: no clock floor is substituted
                      (.agents/rules/historical-verification.md §2-3).
         articleIds   the articles that report it (the news store's article ids)
         evidenceIds  the records of the per-call evidence registry (js/atlas-evidence.js) that vouch for it
         sources      [{name,url,licence}] — who published the object, as the source wrote it
         links        [{rel,ref}] — typed edges to other objects: `within_impact_of`, `reported_by`, `site_of` …
         facts        small scalar values the source gave (magnitude, depth, VEI, article count) — never prose */
    var WORLD_TYPES = ['earthquake', 'news_event', 'article', 'facility', 'company', 'volcano',
      'city', 'electoral_district', 'place_profile', 'place'];

    var MAX_IDS = 40, MAX_LINKS = 40, MAX_SOURCES = 6;

    function worldRef(type, id) {
      var t = str(type, 40), i = str(id, 120);
      return (t && i) ? (t + ':' + i) : '';
    }

    /** [w,s,e,n] only when all four are real, in range and ordered; else null. */
    function validBounds(b) {
      if (!Array.isArray(b) || b.length !== 4) return null;
      var w = num(b[0]), s = num(b[1]), e = num(b[2]), n = num(b[3]);
      if (w == null || s == null || e == null || n == null) return null;
      if (!validLngLat(w, s) || !validLngLat(e, n) || s > n) return null;
      return [w, s, e, n];
    }

    /** A time from a number of milliseconds or a string Date can read; null otherwise (never `now`). */
    function timeMs(v) {
      if (v == null || v === '' || typeof v === 'boolean') return null;
      var x = (typeof v === 'number') ? v : Date.parse(String(v));
      return isFinite(x) ? x : null;
    }

    function uniq(list, n, max) {
      var out = [];
      arr(list).forEach(function (x) { var s = str(x, n); if (s && out.indexOf(s) < 0 && out.length < max) out.push(s); });
      return out;
    }

    function worldObject(src, opts) {
      src = (src && typeof src === 'object') ? src : {};
      opts = opts || {};
      var base = geoObject(src, opts);
      var type = str(src.type || opts.type || '', 40) || 'place';
      var atMs = timeMs(src.atMs != null ? src.atMs : (src.time && src.time.atMs != null ? src.time.atMs : src.at));
      var endMs = timeMs(src.endMs != null ? src.endMs : (src.time && src.time.endMs));
      if (atMs == null && endMs != null) { atMs = endMs; }
      if (endMs != null && atMs != null && endMs < atMs) endMs = atMs;
      var facts = {};
      if (src.facts && typeof src.facts === 'object') Object.keys(src.facts).slice(0, 20).forEach(function (k) {
        var v = src.facts[k];
        if (typeof v === 'number' ? isFinite(v) : (typeof v === 'string' || typeof v === 'boolean')) facts[str(k, 40)] = typeof v === 'string' ? str(v, 160) : v;
      });
      var o = Object.assign(base, {
        wv: WORLD_OBJECT_VERSION,
        type: type,
        ref: worldRef(type, base.id),
        bounds: validBounds(src.bounds),
        time: atMs == null ? null : { atMs: atMs, endMs: endMs == null ? atMs : endMs },
        articleIds: uniq(src.articleIds, 120, MAX_IDS),
        evidenceIds: uniq(src.evidenceIds, 80, MAX_IDS),
        sources: arr(src.sources).slice(0, MAX_SOURCES).map(function (s) {
          s = (s && typeof s === 'object') ? s : {};
          return { name: str(s.name || s.publisher, 80), url: /^https?:\/\//i.test(String(s.url || '')) ? str(s.url, 400) : '', licence: str(s.licence, 80) };
        }).filter(function (s) { return s.name || s.url; }),
        links: arr(src.links).slice(0, MAX_LINKS).map(function (l) {
          l = (l && typeof l === 'object') ? l : {};
          return { rel: str(l.rel, 40), ref: str(l.ref, 160) };
        }).filter(function (l) { return l.rel && l.ref; }),
        facts: facts,
      });
      /* `at` (the display string geoObject keeps) is derived from the number when the caller gave only the number */
      if (!o.at && o.time) o.at = new Date(o.time.atMs).toISOString();
      return o;
    }

    /** isWorldObject(o) — built by worldObject() (carries the version), not merely shaped like one. */
    function isWorldObject(o) { return !!(o && typeof o === 'object' && o.wv === WORLD_OBJECT_VERSION && typeof o.type === 'string'); }

    var API = { CONFIDENCE, GEO_OBJECT_VERSION, POINT_LIKE, PROVENANCE, USER_POINT, WORLD_OBJECT_VERSION, WORLD_TYPES,
      describesUserPoint, geoObject, isWorldObject, mergeKnown, normName, placed, pointLike, rank, timeMs, validBounds, validLngLat, worldObject, worldRef };
    return API;
  })();
}
