/* ============================================================================
 *  IntMap · WHAT EACH ROUTER CAN ACTUALLY DO — window.IntMapRouteProviders   (#R291)
 * ----------------------------------------------------------------------------
 *  「UIは、実際に対応している機能だけを有効にしてください。」
 *  「対応しない設定を表示して、押しても何も変わらない状態は禁止です。」
 *
 *  ══ WHY A TABLE AND NOT AN `if` ════════════════════════════════════════════════════════════════
 *  The three routers this app uses disagree about almost everything, and before this round each
 *  disagreement was a condition buried in the request builder:
 *
 *    · the public OSRM demo REJECTS `exclude=`, so «avoid tolls» had to go to Valhalla (#R132);
 *    · …and it returns NO alternatives once there is a via point, so the request simply stopped
 *      asking for them (`(via.length?'':'&alternatives=3')`) and nothing told the reader why they
 *      were suddenly looking at one route;
 *    · Valhalla honours `exclude_polygons` and `use_tolls/use_highways/use_ferry` but returns ONE
 *      route, so choosing it for an avoid request silently costs the alternatives;
 *    · MOTIS takes departure AND arrival times and publishes real-time legs; OSRM and Valhalla take
 *      neither, so a departure time on a road route is an arithmetic offset and nothing else.
 *
 *  Written as conditions, those facts are invisible to the UI, which is how a button that does
 *  nothing gets shipped. Written as DATA they answer the question the panel actually has — «may I
 *  offer this?» — and the answer is the same one the request builder uses, so the two cannot drift.
 *
 *  ⚠ EVERY FLAG BELOW IS A MEASURED CLAIM ABOUT A LIVE SERVER, not a reading of documentation.
 *  The measurements are in the round notes; where a flag says `false` it is because the server was
 *  asked and refused, and where it says `true` it is because the answer changed when the parameter
 *  was sent (Valhalla: Munich, one 2 km keep-out box across the direct line, 4.675 km/725 s →
 *  5.444 km/834 s — #R184).
 *
 *  ⚠ NO `liveTraffic: true` ANYWHERE, AND THAT IS THE POINT. None of the three carries traffic, so
 *  the panel may never print 「渋滞考慮」 — §7.2 — and the flag is what stops a future edit from
 *  adding the words without adding the data.
 *
 *  Pure data + pure functions: no DOM, no renderer, no fetch. Verified in Node.
 * ==========================================================================*/
window.IntMapRouteProviders = (function () {
  'use strict';

  var LIST = [
    {
      id: 'osrm', name: 'OSRM', attribution: 'OpenStreetMap',
      host: { driving: 'router.project-osrm.org', walking: 'routing.openstreetmap.de/routed-foot', cycling: 'routing.openstreetmap.de/routed-bike' },
      modes: ['driving', 'walking', 'cycling'],
      alternatives: 3,
      /* ⚠ MEASURED: the demo returns `alternatives` only for a plain A→B. With a via point the
         array comes back with one entry however many are asked for. */
      alternativesWithVia: false,
      via: true, maxPoints: 25,
      avoid: [], avoidAreas: false,
      departAt: false, arriveBy: false, liveTraffic: false, realtimeTransit: false,
      timeoutMs: 20000, steps: true, lanes: true,
    },
    {
      id: 'valhalla', name: 'Valhalla (FOSSGIS)', attribution: 'OpenStreetMap',
      host: { driving: 'valhalla1.openstreetmap.de', walking: 'valhalla1.openstreetmap.de', cycling: 'valhalla1.openstreetmap.de' },
      modes: ['driving', 'walking', 'cycling'],
      alternatives: 1, alternativesWithVia: false,
      via: true, maxPoints: 20,
      /* the three the costing options really move. `motorway` is `use_highways`, which is a
         PREFERENCE (0.1) rather than a prohibition — the reply says so. */
      avoid: ['toll', 'motorway', 'ferry'], avoidAreas: true,
      departAt: false, arriveBy: false, liveTraffic: false, realtimeTransit: false,
      timeoutMs: 22000, steps: true, lanes: false,
    },
    {
      id: 'motis', name: 'Transitous / MOTIS', attribution: 'open GTFS feeds',
      host: { transit: 'api.transitous.org' },
      modes: ['transit'],
      alternatives: 5, alternativesWithVia: false,
      via: false, maxPoints: 2,
      avoid: [], avoidAreas: false,
      departAt: true, arriveBy: true, liveTraffic: false, realtimeTransit: true,
      timeoutMs: 32000, steps: false, lanes: false,
    },
    {
      /* the curated intercity-Japan bridge (#R125). Not a server — a registry plus Dijkstra — but it
         answers a route request, so the UI has to be able to ask what it can do. Its times are
         frequency-based estimates and it says so; `estimatesOnly` is what makes the reply say it. */
      id: 'jr-bridge', name: 'Shinkansen registry (published timetables)', attribution: 'operator timetables',
      modes: ['transit'], alternatives: 1, alternativesWithVia: false,
      via: false, maxPoints: 2, avoid: [], avoidAreas: false,
      departAt: false, arriveBy: false, liveTraffic: false, realtimeTransit: false,
      estimatesOnly: true, timeoutMs: 32000, steps: false, lanes: false,
    },
  ];

  var byId = {};
  LIST.forEach(function (p) { byId[p.id] = p; });

  /* ══ WHICH PROVIDER SERVES THIS REQUEST, AND WHAT IT COSTS ═════════════════════════════════════
     Provider selection is BY CAPABILITY, not by preference: an avoid list or a drawn keep-out area
     can only be honoured by Valhalla, so a request carrying either goes there — and `lost` names
     what choosing it gives up, so the reply can say «one route, because you asked for a keep-out
     area» instead of quietly showing one route. */
  function forRequest(req) {
    req = req || {};
    var mode = String(req.mode || 'driving');
    var viaN = (req.via && req.via.length) || 0;
    if (mode === 'transit') {
      return { provider: byId.motis, fallback: byId['jr-bridge'], lost: viaN ? ['via'] : [], unmet: viaN ? ['via'] : [] };
    }
    var needsAvoid = !!(req.avoid && req.avoid.length);
    var needsArea = !!(req.avoidAreas && req.avoidAreas.length);
    var p = (needsAvoid || needsArea) ? byId.valhalla : byId.osrm;
    var lost = [], unmet = [];
    if (p.id === 'valhalla') lost.push('alternatives');
    if (p.id === 'osrm' && viaN && !p.alternativesWithVia) lost.push('alternatives');
    if (needsAvoid && mode !== 'driving') unmet.push('avoid');            /* the chips are driving-only */
    if (req.departAt && !p.departAt) unmet.push('departAt');
    if (req.arriveBy && !p.arriveBy) unmet.push('arriveBy');
    return { provider: p, fallback: (p.id === 'valhalla') ? byId.osrm : null, lost: lost, unmet: unmet };
  }

  /** may this mode offer this option at all? — the question the panel asks before drawing a chip */
  function supports(mode, feature) {
    var pool = LIST.filter(function (p) { return p.modes.indexOf(mode) >= 0; });
    if (!pool.length) return false;
    if (feature === 'avoid') return pool.some(function (p) { return p.avoid.length > 0; }) && mode === 'driving';
    if (feature === 'avoidAreas') return pool.some(function (p) { return p.avoidAreas; });
    if (feature === 'via') return pool.some(function (p) { return p.via; });
    if (feature === 'departAt') return pool.some(function (p) { return p.departAt; });
    if (feature === 'arriveBy') return pool.some(function (p) { return p.arriveBy; });
    if (feature === 'liveTraffic') return pool.some(function (p) { return p.liveTraffic; });
    if (feature === 'realtimeTransit') return pool.some(function (p) { return p.realtimeTransit; });
    if (feature === 'transitModes') return mode === 'transit';
    if (feature === 'alternatives') return pool.some(function (p) { return p.alternatives > 1; });
    return false;
  }

  /** the largest number of points any provider for this mode accepts — the ONLY cap on stops (§5.2) */
  function maxPoints(mode) {
    var pool = LIST.filter(function (p) { return p.modes.indexOf(mode) >= 0; });
    return pool.reduce(function (m, p) { return Math.max(m, p.maxPoints || 0); }, 0);
  }
  function maxVia(mode) { return Math.max(0, maxPoints(mode) - 2); }

  return {
    list: function () { return LIST.map(function (p) { return p; }); },
    byId: function (id) { return byId[id] || null; },
    forRequest: forRequest, supports: supports, maxPoints: maxPoints, maxVia: maxVia,
  };
})();
