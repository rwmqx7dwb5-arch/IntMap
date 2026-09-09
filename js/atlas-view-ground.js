/* ============================================================================
 *  IntMap · WHAT THE MAP CAN ACTUALLY SAY IS THERE  (#R574)
 * ----------------------------------------------------------------------------
 *  「これなに」 asked over a satellite view of a 355,000 m² logistics warehouse in 名古屋市中村区
 *  was answered 「これはおそらく、名古屋市中村区の八田フランテ館です。建物内にはアスティスポーツ
 *  クラブ八田が入っています。(mapion.co.jp)」 — a supermarket that is not there, a tenant that is not
 *  there, and a citation that was never fetched. Measured cause, not a guess:
 *
 *    · view.inspect handed the model a JPEG and eleven camera numbers. Nothing else. No name, no
 *      label, no lookup — js/atlas-view-capture.js built `facts` out of the camera and stopped.
 *    · the one coordinate it did hand over was rounded to two decimals. At that latitude two
 *      decimals is a 1.1 km square. The building is 400 m across. The model was structurally unable
 *      to know WHICH building it was looking at, so the only thing left to do with the question was
 *      to answer it from the one label that happened to be legible near the edge of the frame.
 *
 *  ⚠⚠⚠ THE FIX IS NOT A BETTER PROMPT AND IT IS NOT A LIST OF PLACES. It is that a capability which
 *  looks at the map must also ASK the map, and must hand over what came back — including, and
 *  especially, «nothing came back», because an empty ground block is the sentence that stops the
 *  invention. A model that is told the map has no name for the object at the centre can say so. A
 *  model that is told nothing at all has only the picture to go on, and a picture of a large grey
 *  roof next to a legible 「アスティスポーツクラブ」 label genuinely does look like an answer.
 *
 *  ⚠⚠ THIS FILE DECIDES NOTHING AND NAMES NOTHING. It ranks; Atlas chooses. That separation is the
 *  whole point of .agents/rules/no-ad-hoc-hardcoding.md §2.2 — the code's job is to refuse the
 *  ungrounded, not to adjudicate. Every candidate below carries its OSM tags and its measured
 *  coverage so that Atlas can see for itself that `highway=unclassified` is a road and not a thing
 *  the reader is pointing at. There is no tag allow-list here, and there must not become one: a
 *  hand-written list of «kinds worth reporting» silently drops whatever is added to OSM next.
 *
 *  ⚠ WHY FRAMED COVERAGE AND NOT A REVERSE GEOCODE. Measured 2026-09-10 against Nominatim /reverse
 *  at every zoom 12–18, at three unrelated places:
 *      ロジポート名古屋      → the correct name at z15 ONLY; z16/z17 return an unnamed road.
 *      東京スカイツリー      → never returned, at any zoom.
 *      Heathrow Terminal 5  → never returned, at any zoom.
 *  Reverse geocoding answers «what is the nearest addressable thing to this point», which is a
 *  different question from «what is the object filling this frame», and the two coincide only by
 *  luck. Framed coverage answers the question that was actually asked: of the named features
 *  overlapping the view, which are the size of the view. The same measurement at the same three
 *  places put ロジポート名古屋 first at 0.29 of the frame, and found 東京ソラマチ and 東京スカイツリー.
 * ==========================================================================*/

/* ⚠ ONE EXPORTED FACTORY, EVERYTHING ELSE NESTED — the shape js/atlas-evidence.js and
   js/atlas-answer-audit.js already use, and the shape tests/r175-checks ③ requires: a js/ module may
   have NO unexported top-level declaration (it would have been a global) and NO export that nobody
   imports by name (it would be dead). A bag of six exports would have had to satisfy the second rule
   six times over, so the door is one function and the pieces come back on its return value. */
export function makeViewGround() {

  /* ── THE COORDINATE HAS TO BE FINER THAN THE PICTURE ────────────────────────────────────────────
     Not a taste; an arithmetic floor. A web-mercator tile is 256 px, so one pixel at zoom z spans
     360/(256·2^z) degrees, and a coordinate written coarser than that names a point the reader cannot
     even distinguish in the frame we attached. Two decimals — what this used to print at EVERY zoom —
     is only enough out to about zoom 6; at the zoom 16 that produced the wrong answer it is 1.1 km,
     roughly forty city blocks. Expires if the tile size stops being 256 px.
     The floor of 2 keeps a world view from printing a precision it does not have; the ceiling of 7 is
     below the ~1 cm at which a float round-trip through the renderer stops being meaningful. */
  function coordDecimals(zoom) {
    var z = Number(zoom);
    if (!isFinite(z)) return 5;              /* an unknown zoom is not a reason to round to a kilometre */
    var degPerPixel = 360 / (256 * Math.pow(2, Math.max(0, z)));
    var d = Math.ceil(-Math.log10(degPerPixel));
    return Math.min(7, Math.max(2, d));
  }

  /* the frame, as a plain rectangle — the shape everything below measures against */
  function frameArea(f) {
    if (!f || !isFinite(f.west) || !isFinite(f.east) || !isFinite(f.south) || !isFinite(f.north)) return 0;
    return Math.abs(f.north - f.south) * Math.abs(f.east - f.west);
  }

  /* ── HOW MUCH OF THE VIEW IS THIS THING, AND HOW MUCH OF THIS THING IS IN THE VIEW ──────────────
     Two numbers, because either one alone is a trap in a way that showed up immediately in real data:
       · `cover`  — the fraction of the FRAME the footprint spans. A thing the question is about is
                    the size of the view; a parked car is not.
       · `inView` — the fraction of the FEATURE that is inside the frame. 1.0 means the reader can see
                    all of it. The 東京スカイツリー measurement returned a district-heating service
                    area spanning 1.43 frames — larger than the entire view, so `cover` alone ranks it
                    first, and it is plainly not what anyone framed. `inView` tells the two apart.
     Both are reported. Neither is thresholded here: a threshold would be this file deciding. */
  function measureFraming(bounds, frame) {
    var fa = frameArea(frame);
    if (!fa || !bounds || !isFinite(bounds.minlat)) return null;
    var ba = Math.abs(bounds.maxlat - bounds.minlat) * Math.abs(bounds.maxlon - bounds.minlon);
    var ow = Math.max(0, Math.min(bounds.maxlon, frame.east) - Math.max(bounds.minlon, frame.west));
    var oh = Math.max(0, Math.min(bounds.maxlat, frame.north) - Math.max(bounds.minlat, frame.south));
    var overlap = ow * oh;
    if (overlap <= 0) return null;           /* touches the frame only at an edge: not in the picture */
    return {
      cover: overlap / fa,                   /* ⚠ of the OVERLAP, not of the footprint — a feature ten
                                                frames wide covers exactly 1.0 of the frame, not 10 */
      inView: ba > 0 ? (overlap / ba) : 1,
      spans: ba / fa                         /* footprint ÷ frame: >1 is bigger than the whole view */
    };
  }

  /* ── THE RANKING ────────────────────────────────────────────────────────────────────────────────
     Ordered by how much of the frame the feature occupies while still being something the frame
     contains. `cover · inView` is that product and nothing more: a feature that fills the view and is
     wholly inside it scores 1; one that fills the view because it is a prefecture scores its own small
     inView; one that is a shed in the corner scores its own small cover.
     ⚠ `limit` is a PROMPT BUDGET, not a judgement about relevance. Measured at zoom 16 over central
     名古屋, an unfiltered named-feature query returns a few hundred elements and the tail is car parks
     and apartment blocks; twelve lines is what fits beside the image without displacing the rest of
     the turn. Everything dropped is dropped from the BOTTOM of a measured order, and the block below
     says how many were dropped, so the model knows the list is a head and not the whole world. */
  function rankFramed(elements, frame, limit) {
    var n = (limit == null) ? 12 : limit;
    var out = [];
    (elements || []).forEach(function (el) {
      if (!el) return;
      var tags = el.tags || {};
      if (!tags.name) return;                /* an unnamed footprint cannot answer «what is this» */
      var m = measureFraming(el.bounds, frame);
      if (!m) return;
      out.push({
        name: String(tags.name),
        /* every tag that says WHAT it is, verbatim from OSM, so Atlas can see that a road is a road.
           ⚠ do not reduce this to one «kind» string: the reduction is where a tag list gets born. */
        tags: tags,
        osm: (el.type || '') + '/' + (el.id || ''),
        cover: m.cover, inView: m.inView, spans: m.spans,
        score: m.cover * m.inView
      });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    var kept = out.slice(0, Math.max(0, n));
    return { kept: kept, dropped: Math.max(0, out.length - kept.length), total: out.length };
  }

  /* ── THE QUERY ──────────────────────────────────────────────────────────────────────────────────
     Every NAMED way and relation overlapping the frame. No selector on WHAT KIND of thing it is —
     deliberately, see the header: the filtering IS the ranking, and the ranking is a measurement. The
     one condition below is about GEOMETRY, not about kind, and it is there because the measurement
     cannot make it itself from a bounding box. `out tags bb` returns
     tags and a bounding box but no geometry, which is what keeps this affordable — geometry for every
     named way in a dense city block is hundreds of kilobytes and none of it changes the ordering.
     Nodes are not asked for: a POI node has no footprint to measure, and the ones that matter are
     already on screen as drawn labels, which cost nothing at all to read. */
  /* ── WHEN THE QUESTION IS NOT ABOUT AN OBJECT ANY MORE ────────────────────────────────────────
     A frame the size of a metropolitan area has no «this» in it to identify by footprint, and asking
     Overpass for every named way inside one is both slow and rude to a shared free service.

     ⚠⚠ THIS IS A LATENCY-AND-POLITENESS BUDGET, NOT A MEASUREMENT, AND IT IS LABELLED AS ONE. What
     WAS measured is only the left-hand column: the area a 1280×800 viewport spans at each zoom.
         zoom 17 → 9.6e-5    zoom 15 → 1.5e-3    zoom 13 → 2.5e-2    zoom 11 → 3.9e-1  (deg²)
         zoom 16 → 3.8e-4    zoom 14 → 6.1e-3    zoom 12 → 9.8e-2
     0.03 deg² therefore admits zoom 14 and above and, just, zoom 13 — a frame about 17 × 8 km, which
     still contains single objects (an airport, a port, a refinery) — and stops at zoom 12, where the
     view is a metropolitan area and «what is this one thing» has no footprint answer.
     ⚠ WHAT IS *NOT* MEASURED is the cost of the query at each of those sizes. The attempt to measure
     it ran into an Overpass rate-limit ban earlier in the same round and never completed, so this
     number is a deliberately conservative guess and is written down as a guess.
     ⚠ EXPIRES on either half: if the cost is ever actually measured (raise or lower it to fit), or if
     a cheaper source of named footprints appears — the OpenFreeMap vector tiles carry no `name` on
     landuse today, which is exactly why the warehouse was invisible to the free channel.
     ⚠ Exceeding it is reported as «not looked up», never as «nothing is there» — see groundBlock. */
  function framedBudget(frame) {
    var a = frameArea(frame);
    if (!a) return { ok: false, reason: 'no viewport bounds' };
    if (a > 0.03) return { ok: false, reason: 'the view is too wide to ask what single object is in it' };
    return { ok: true };
  }

  function overpassFramedQuery(frame, timeoutS) {
    var t = Math.max(5, Math.min(60, Number(timeoutS) || 25));
    var bb = [frame.south, frame.west, frame.north, frame.east]
      .map(function (v) { return (+v).toFixed(6); }).join(',');
    /* ⚠⚠⚠ RELATIONS ARE ASKED FOR ONLY WHERE THE SCHEMA SAYS THEY ARE AREAS, AND THAT IS NOT A TAG
       ALLOW-LIST. Measured live over the 名古屋 frame: an unrestricted relation query put SIX bus
       routes (`type=route`, 名古屋市営バス 中村11 / 名駅22 / 名駅23) into the top eleven, each with
       cover 1.00, because a route that crosses the view has a bounding box the size of the view. A
       route is a LINE; its bbox is not a footprint, and `measureFraming` has no way to tell the two
       apart from a bounding box alone. `type=multipolygon|boundary` is OSM's own definition of «this
       relation is an area» — the question the measurement needs answered, asked of the schema rather
       than decided here. Ways need no such filter: a linear way's bbox is long and thin, so `inView`
       already ranks it below anything the frame contains (近畿日本鉄道名古屋線 scored 0.21 against
       ロジポート名古屋's 0.29 in the same measurement, which is the correct order). */
    return '[out:json][timeout:' + t + '];(way[name](' + bb + ');'
      + 'relation[name][type~"^(multipolygon|boundary)$"](' + bb + '););out tags bb;';
  }

  /* ── THE LABELS THE RENDERER ACTUALLY DREW ──────────────────────────────────────────────────────
     Free, instantaneous, and the only source that knows what the reader can literally read on screen.
     Deduplicated by name because one POI is drawn by several style layers (icon, dot, halo) and three
     identical lines teach the model nothing. Ordered by distance from the centre in pixels, because
     «this» means the middle of the frame. */
  function shapeDrawnLabels(features, centrePx, limit) {
    var n = (limit == null) ? 20 : limit;
    var seen = new Set(), rows = [];
    (features || []).forEach(function (f) {
      var p = (f && f.properties) || {};
      var name = p.name || p['name:latin'] || p['name:en'];
      if (!name) return;
      var key = String(name);
      if (seen.has(key)) return;
      seen.add(key);
      var d = null;
      if (centrePx && f.px && isFinite(f.px.x)) d = Math.hypot(f.px.x - centrePx.x, f.px.y - centrePx.y);
      rows.push({ name: key, kind: p.class || p.subclass || (f.sourceLayer || ''), dPx: d });
    });
    rows.sort(function (a, b) {
      if (a.dPx == null && b.dPx == null) return 0;
      if (a.dPx == null) return 1;
      if (b.dPx == null) return -1;
      return a.dPx - b.dPx;
    });
    return { kept: rows.slice(0, n), dropped: Math.max(0, rows.length - n), total: rows.length };
  }

  /* ── THE SENTENCES ──────────────────────────────────────────────────────────────────────────────
     ⚠⚠⚠ THE EMPTY CASE IS THE IMPORTANT ONE, AND IT IS WHY THIS FUNCTION EXISTS. Returning '' when the
     lookup found nothing puts the model back in exactly the state that produced 「八田フランテ館」: a
     picture, a question, and no way to tell «I was not told» from «there is nothing». So the no-result
     branch below is a POSITIVE statement, printed with the same weight a result would get. */
  function groundBlock(g) {
    if (!g) return '';
    var p = '';
    if (g.drawn && g.drawn.kept && g.drawn.kept.length) {
      p += 'labels the renderer actually drew in this frame, nearest the centre first: '
        + g.drawn.kept.map(function (r) { return r.name + (r.kind ? (' [' + r.kind + ']') : ''); }).join(' · ')
        + (g.drawn.dropped ? (' (+' + g.drawn.dropped + ' more not listed)') : '') + '\n';
    } else {
      p += 'the renderer drew NO named label in this frame.\n';
    }
    if (g.framed && g.framed.kept && g.framed.kept.length) {
      p += 'named OpenStreetMap features overlapping this frame, largest-in-view first — «cover» is how much of the FRAME the footprint takes, «inView» how much of the FEATURE is on screen:\n';
      g.framed.kept.forEach(function (r) {
        var tag = Object.keys(r.tags)
          .filter(function (k) { return k !== 'name' && k.indexOf('name:') !== 0; })
          .slice(0, 6).map(function (k) { return k + '=' + r.tags[k]; }).join(', ');
        p += '  · ' + r.name + ' — cover ' + r.cover.toFixed(2) + ', inView ' + r.inView.toFixed(2)
          + ' — ' + (tag || '(no descriptive tags)') + ' — OSM ' + r.osm + '\n';
      });
      if (g.framed.dropped) {
        p += '  (' + g.framed.dropped + ' lower-ranked feature'
          + (g.framed.dropped === 1 ? '' : 's') + ' not listed)\n';
      }
    } else if (g.framedError) {
      p += 'the OpenStreetMap lookup for this frame did NOT complete (' + g.framedError
        + '), so nothing is known here about what is in it.\n';
    } else {
      p += 'OpenStreetMap has NO named feature overlapping this frame.\n';
    }
    /* ⚠ the instruction has to name the failure mode, because «be careful» does not survive a
       confident-looking picture. This is the sentence the wrong answer needed and did not have. */
    p += '⚠ The two lists above are EVERYTHING IntMap knows about what is in this frame. If the object the reader is asking about is not in them, then IntMap does not know its name — say so plainly and describe what it looks like instead. Do NOT name a building, business, tenant, brand or facility that is absent from those lists, and do NOT write a source or a site name you did not actually retrieve this turn.\n';
    return p;
  }
  return { coordDecimals: coordDecimals, measureFraming: measureFraming, rankFramed: rankFramed,
           framedBudget: framedBudget,
           overpassFramedQuery: overpassFramedQuery, shapeDrawnLabels: shapeDrawnLabels,
           groundBlock: groundBlock };
}
