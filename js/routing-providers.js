/* ============================================================================
 *  IntMap · WHAT EACH ROUTER CAN ACTUALLY DO — window.IntMapRouteProviders   (#R291, #R347)
 * ----------------------------------------------------------------------------
 *  「UIは、実際に対応している機能だけを有効にしてください。」
 *  「対応しない設定を表示して、押しても何も変わらない状態は禁止です。」
 *  (#R347) 「UIがProvider実装と独立して勝手に機能を表示してはいけません。Capability Registryを正本に。」
 *
 *  ══ WHY A TABLE AND NOT AN `if` ════════════════════════════════════════════════════════════════
 *  The routers this app uses disagree about almost everything, and before #R291 each disagreement
 *  was a condition buried in the request builder:
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
 *  ══ (#R347) EVERY PROVIDER DECLARES EVERY CAPABILITY, AND A GATE COUNTS THEM ═══════════════════
 *  #R323's lesson was that two tables describing the same thing drift unless something compares
 *  them KEY BY KEY, and that a missing key reads as `false` while meaning «nobody asked». So `VOCAB`
 *  below is the whole vocabulary, `assertComplete()` refuses a provider that omits any of it, and
 *  tests/r347-providers.test.mjs walks the vocabulary rather than a hand-written list.
 *  ⚠ CAPABILITIES AND PROBES ARE DIFFERENT KINDS. Everything in `VOCAB` is a fact about the server,
 *  answerable yes/no or by a number, and `can()` reads it. Things that must be COMPUTED (which
 *  provider serves this request, what it costs to choose it) are functions, and they are not in the
 *  vocabulary — #R323 shipped a table where a function-valued key made `can()` permanently true.
 *
 *  ══ (#R347) `evidence` — HOW WE KNOW ═══════════════════════════════════════════════════════════
 *  #R291 wrote «EVERY FLAG BELOW IS A MEASURED CLAIM ABOUT A LIVE SERVER, not a reading of
 *  documentation», and that was true of three servers anyone can call without a key. It cannot be
 *  true of a provider whose key this project does not yet hold: those flags come from the vendor's
 *  own reference, and calling that «measured» would be the exact dishonesty the original sentence
 *  was written to prevent. So each provider carries `evidence`, and a `documented` provider's flags
 *  are BELIEVED BUT NOT ADVERTISED — `available()` is false until the relay answers, so nothing is
 *  offered to a reader on the strength of a document.
 * ==========================================================================*/
window.IntMapRouteProviders = (function () {
  'use strict';

  /* ══ THE VOCABULARY (§3) ═══════════════════════════════════════════════════════════════════════
     Grouped for reading only — the gate treats it as one flat set. `n` marks the numeric ones (a
     count or a limit); everything else is a boolean. */
  var VOCAB = {
    /* shape of the answer */
    alternatives: 'n', alternativesWithVia: 'b', maxWaypoints: 'n',
    /* traffic */
    traffic: 'b', historicalTraffic: 'b', predictedTraffic: 'b', trafficPolyline: 'b',
    incidents: 'b', closures: 'b', roadRestrictions: 'b',
    /* time */
    departAt: 'b', arriveBy: 'b', timeDependentRouting: 'b',
    /* instructions */
    turnByTurn: 'b', lanes: 'b', roadNames: 'b', exitNumbers: 'b', signage: 'b',
    /* money */
    tolls: 'b', tollPrice: 'b', tollPasses: 'b',
    /* speed */
    speedLimits: 'b', typicalSpeed: 'b',
    /* planning */
    waypointOptimization: 'b', routeMatrix: 'b',
    /* electric */
    evRouting: 'b', chargingStops: 'b', energyEstimate: 'b',
    /* vehicles */
    motorcycle: 'b', truck: 'b',
    /* transit */
    realtimeTransit: 'b', transitAlerts: 'b', transitOccupancy: 'b',
    /* avoidance */
    avoidTolls: 'b', avoidMotorways: 'b', avoidFerries: 'b', avoidIndoor: 'b', avoidAreas: 'b',
    /* navigation */
    routeRefresh: 'b', rerouting: 'b',
    /* destination */
    accessPoints: 'b',
  };
  var VOCAB_KEYS = Object.keys(VOCAB);

  /** every provider must answer every question — silence is not `false` (see the header) */
  function assertComplete(p) {
    var missing = [], extra = [];
    for (var i = 0; i < VOCAB_KEYS.length; i++) if (!Object.prototype.hasOwnProperty.call(p.caps, VOCAB_KEYS[i])) missing.push(VOCAB_KEYS[i]);
    for (var k in p.caps) if (Object.prototype.hasOwnProperty.call(p.caps, k) && !Object.prototype.hasOwnProperty.call(VOCAB, k)) extra.push(k);
    if (missing.length || extra.length) throw new Error('IntMapRouteProviders: ' + p.id + ' caps mismatch — missing [' + missing + '] unknown [' + extra + ']');
    return p;
  }

  /* the capabilities every open router lacks — written once so a new open provider cannot forget
     one and accidentally claim it. ⚠ THIS IS A DEFAULT, NOT AN OVERRIDE: each provider below still
     spells out what it DOES have, and `assertComplete` proves the union covers the vocabulary. */
  function none(over) {
    var c = {};
    for (var i = 0; i < VOCAB_KEYS.length; i++) c[VOCAB_KEYS[i]] = (VOCAB[VOCAB_KEYS[i]] === 'n') ? 0 : false;
    for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) c[k] = over[k];
    return c;
  }

  var LIST = [
    assertComplete({
      id: 'osrm', name: 'OSRM', attribution: 'OpenStreetMap',
      host: { driving: 'router.project-osrm.org', walking: 'routing.openstreetmap.de/routed-foot', cycling: 'routing.openstreetmap.de/routed-bike' },
      modes: ['driving', 'walking', 'cycling'],
      evidence: 'measured', keyed: false, tier: 'open',
      timeoutMs: 20000,
      caps: none({
        /* ⚠ MEASURED: the demo returns `alternatives` only for a plain A→B. With a via point the
           array comes back with one entry however many are asked for. */
        alternatives: 3, alternativesWithVia: false, maxWaypoints: 25,
        /* ⚠ MEASURED (#R347, Tokyo→Yokohama, overview=full&steps=true): 26 steps, 20 with a road
           name, 17 with a ref or destination, and 8 intersections carrying real `lanes` arrays with
           `indications` and `valid`. `exitNumbers` is false because that same route returned NONE —
           OSRM populates `exits` only where OSM tags them, which in Japan it largely does not. */
        turnByTurn: true, lanes: true, roadNames: true, signage: true, exitNumbers: false,
        rerouting: true,
      }),
    }),
    assertComplete({
      id: 'valhalla', name: 'Valhalla (FOSSGIS)', attribution: 'OpenStreetMap',
      host: { driving: 'valhalla1.openstreetmap.de', walking: 'valhalla1.openstreetmap.de', cycling: 'valhalla1.openstreetmap.de' },
      modes: ['driving', 'walking', 'cycling'],
      evidence: 'measured', keyed: false, tier: 'open',
      timeoutMs: 22000,
      caps: none({
        alternatives: 1, alternativesWithVia: false, maxWaypoints: 20,
        /* the three the costing options really move (#R184: Munich, one 2 km keep-out box across the
           direct line, 4.675 km/725 s → 5.444 km/834 s). `avoidMotorways` is `use_highways`, which is
           a PREFERENCE (0.1) rather than a prohibition — the reply says so. */
        avoidTolls: true, avoidMotorways: true, avoidFerries: true, avoidAreas: true,
        turnByTurn: true, roadNames: true, signage: true,
        rerouting: true,
      }),
    }),
    assertComplete({
      id: 'motis', name: 'Transitous / MOTIS', attribution: 'open GTFS feeds',
      host: { transit: 'api.transitous.org' },
      modes: ['transit'],
      evidence: 'measured', keyed: false, tier: 'open',
      timeoutMs: 32000,
      caps: none({
        alternatives: 5, alternativesWithVia: false, maxWaypoints: 2,
        departAt: true, arriveBy: true, timeDependentRouting: true,
        realtimeTransit: true, transitAlerts: true,
        roadNames: true,
        rerouting: true,
      }),
    }),
    assertComplete({
      /* the curated intercity-Japan bridge (#R125). Not a server — a registry plus Dijkstra — but it
         answers a route request, so the UI has to be able to ask what it can do. Its times are
         frequency-based estimates and it says so; `estimatesOnly` is what makes the reply say it. */
      id: 'jr-bridge', name: 'Shinkansen registry (published timetables)', attribution: 'operator timetables',
      modes: ['transit'],
      evidence: 'measured', keyed: false, tier: 'open', estimatesOnly: true,
      timeoutMs: 32000,
      caps: none({ alternatives: 1, maxWaypoints: 2, roadNames: true }),
    }),

    /* ══ (#R347) THE FIRST PROVIDER THAT CARRIES TRAFFIC ═══════════════════════════════════════════
       §5: 「現在の『リアルタイム交通量は未反映』という状態を、本当に解消できるProviderが利用可能な
       環境では解消してください。」 — and §4: 「他社APIもライセンス条件を確認してください」.

       ⚠ THE LICENCE DECIDED THIS, NOT THE FEATURE LIST. The candidates were checked against their
       own published terms before any code was written:
         · Google Routes API — maps-service-terms §19.2 «Customer must not use Google Maps Content
           from the Routes API in conjunction with a non-Google map». IntMap's map is MapLibre + OSM,
           so this provider is UNUSABLE HERE however good it is. §4 named it and the answer is no.
         · GraphHopper — terms §5 «You are allowed to use the Directions API with and without showing
           a map», unambiguous and permissive; but its own OpenAPI spec has NO traffic parameter on
           /route at all («Traffic data is not yet available for openstreetmap»), so it cannot answer
           the question §5 asks.
         · TomTom and HERE — their terms pages redirect to documents that could not be retrieved, and
           a licence that has not been read is not a licence that permits. NOT ADOPTED, and that is a
           gap to close rather than a verdict against them.
         · Mapbox — Product Terms confine the «Mapbox Map» requirement to Boundaries (§2.2), POI
           results (§2.7.5) and Studio (§2.11); the Navigation APIs are not among them, and Mapbox's
           own attribution guide addresses «using Mapbox services on a non-Mapbox map» directly.

       ⚠ THREE OF ITS OWN TERMS ARE ENCODED HERE AS FIELDS, NOT AS COMMENTS, because a comment does
       not stop an edit:
         · `noStore` — Product Terms §2.10.1 forbids exporting, downloading, CACHING or storing the
           results of a Navigation API request. js/routing-traffic.js honours it and the Edge Function
           sends `Cache-Control: no-store`; every other relay in this repo sets `s-maxage`.
         · `aiContent: false` — §1.5(ii) forbids using the Service Offerings to train, operate or
           improve AI. Atlas is this app's control plane, so «send the route to the model» is a thing
           this codebase does by default; this flag is what stops it for THIS provider's content.
           Atlas may still COMMAND routing and read its own state — it may not forward this
           provider's returned content to the AI proxy.
         · `logoRequired` — §1.4.1 requires the Mapbox wordmark for any Service Offering.

       ⚠ `evidence: 'documented'`. No key is configured in this repository, so none of these flags has
       been observed. `available()` is false until the relay says otherwise, and until then nothing in
       the UI offers a single one of them. */
    assertComplete({
      id: 'mapbox', name: 'Mapbox Directions', attribution: 'Mapbox, OpenStreetMap',
      host: { driving: 'relay', walking: 'relay', cycling: 'relay' },
      modes: ['driving', 'walking', 'cycling'],
      evidence: 'documented', keyed: true, tier: 'traffic',
      relay: 'routing-relay', profile: { driving: 'mapbox/driving-traffic', walking: 'mapbox/walking', cycling: 'mapbox/cycling' },
      noStore: true, aiContent: false, logoRequired: true,
      timeoutMs: 20000,
      caps: none({
        alternatives: 3, alternativesWithVia: false, maxWaypoints: 25,
        traffic: true, historicalTraffic: true, predictedTraffic: true, trafficPolyline: true,
        incidents: true, closures: true, roadRestrictions: true,
        departAt: true, arriveBy: true, timeDependentRouting: true,
        turnByTurn: true, lanes: true, roadNames: true, exitNumbers: true, signage: true,
        /* ⚠ `tolls: true` BUT `tollPrice: false`. Mapbox reports toll ROADS and toll-collection
           points; it does not price them. §24 forbids showing an own estimate as «the toll», so the
           panel may say «this route uses toll roads» and may not say what they cost. */
        tolls: true, tollPrice: false, tollPasses: false,
        speedLimits: true, typicalSpeed: true,
        waypointOptimization: true, routeMatrix: true,
        evRouting: true, chargingStops: true, energyEstimate: true,
        avoidTolls: true, avoidMotorways: true, avoidFerries: true, avoidAreas: true,
        routeRefresh: true, rerouting: true, accessPoints: true,
      }),
    }),
  ];

  var byId = {};
  LIST.forEach(function (p) { byId[p.id] = p; });

  /* ══ AVAILABILITY (§57) ═════════════════════════════════════════════════════════════════════════
     A keyed provider is DECLARED here and USABLE only when the relay says a key is configured. There
     was no mechanism for this in the app — `aiReady()` answers «is the proxy URL assemblable», which
     is always yes and says nothing about the key — so this is one:
       · keyless providers are available the moment the app boots;
       · a keyed provider is `null` (unknown) until something asks the relay, then true or false.
     ⚠ UNKNOWN IS NOT AVAILABLE. `available()` returns false for `null`, so the UI never offers a
     traffic option on the strength of a probe that has not come back. js/routing-traffic.js owns the
     probe and calls `setAvailable()`; nothing else may. */
  var avail = {};
  LIST.forEach(function (p) { avail[p.id] = p.keyed ? null : true; });

  function available(id) { return avail[id] === true; }
  function availability(id) { return avail[id]; }          /* true | false | null (unknown) */
  function setAvailable(id, v) {
    if (!byId[id]) return false;
    avail[id] = (v === null || v === undefined) ? null : !!v;
    return true;
  }

  /** the providers that could serve this mode AND are usable right now */
  function usable(mode) {
    return LIST.filter(function (p) { return p.modes.indexOf(mode) >= 0 && available(p.id); });
  }

  /* ══ WHICH PROVIDER SERVES THIS REQUEST, AND WHAT IT COSTS ═════════════════════════════════════
     Provider selection is BY CAPABILITY, not by preference: an avoid list or a drawn keep-out area
     can only be honoured by Valhalla, so a request carrying either goes there — and `lost` names
     what choosing it gives up, so the reply can say «one route, because you asked for a keep-out
     area» instead of quietly showing one route.

     (#R347) The reply is now a CHAIN (§43): 「Provider障害で経路機能全体を落とさないでください」.
     `chain[0]` is the best answer available; each later entry is a provider that can still answer the
     question with less. ⚠ AND `degrades` SAYS WHAT EACH STEP DOWN COSTS, so a fallback that loses
     traffic reports 「Traffic data unavailable; standard routing used.」 rather than quietly
     producing a number that looks the same and means something else. */
  function forRequest(req) {
    req = req || {};
    var mode = String(req.mode || 'driving');
    var viaN = (req.via && req.via.length) || 0;

    if (mode === 'transit') {
      return {
        provider: byId.motis, fallback: byId['jr-bridge'],
        chain: [byId.motis, byId['jr-bridge']],
        degrades: { 'jr-bridge': ['realtimeTransit'] },
        lost: viaN ? ['via'] : [], unmet: viaN ? ['via'] : [],
      };
    }

    var needsAvoid = !!(req.avoid && req.avoid.length);
    var needsArea = !!(req.avoidAreas && req.avoidAreas.length);
    var wantsTraffic = req.traffic !== false;   /* traffic is the default when it is to be had */

    /* the ladder, best first. Only providers that can answer the request AT ALL go on it. */
    var chain = [];
    var mb = byId.mapbox;
    var canMapbox = available('mapbox') && mb.modes.indexOf(mode) >= 0
      && (!needsArea || mb.caps.avoidAreas) && (!needsAvoid || mb.caps.avoidTolls);
    if (canMapbox && (wantsTraffic || needsAvoid || needsArea)) chain.push(mb);
    if ((needsAvoid || needsArea) && byId.valhalla.modes.indexOf(mode) >= 0) chain.push(byId.valhalla);
    if (byId.osrm.modes.indexOf(mode) >= 0 && !needsArea) chain.push(byId.osrm);
    if (chain.indexOf(byId.valhalla) < 0 && byId.valhalla.modes.indexOf(mode) >= 0) chain.push(byId.valhalla);
    if (!chain.length) chain.push(byId.osrm);

    var p = chain[0];
    var degrades = {};
    for (var i = 1; i < chain.length; i++) degrades[chain[i].id] = lostBetween(chain[0], chain[i]);

    var lost = [], unmet = [];
    if (p.caps.alternatives <= 1) lost.push('alternatives');
    if (p.id === 'osrm' && viaN && !p.caps.alternativesWithVia) lost.push('alternatives');
    if (needsAvoid && mode !== 'driving') unmet.push('avoid');            /* the chips are driving-only */
    if (needsAvoid && !p.caps.avoidTolls && !p.caps.avoidMotorways && !p.caps.avoidFerries) unmet.push('avoid');
    if (needsArea && !p.caps.avoidAreas) unmet.push('avoidAreas');
    if (req.departAt && !p.caps.departAt) unmet.push('departAt');
    if (req.arriveBy && !p.caps.arriveBy) unmet.push('arriveBy');
    if (wantsTraffic && !p.caps.traffic) unmet.push('traffic');

    return {
      provider: p,
      fallback: chain[1] || null,
      chain: chain, degrades: degrades,
      lost: lost, unmet: unmet,
    };
  }

  /** the capabilities `from` has that `to` does not — what a step down the chain costs */
  function lostBetween(from, to) {
    var out = [];
    for (var i = 0; i < VOCAB_KEYS.length; i++) {
      var k = VOCAB_KEYS[i];
      if (VOCAB[k] === 'n') { if ((+from.caps[k] || 0) > (+to.caps[k] || 0)) out.push(k); }
      else if (from.caps[k] && !to.caps[k]) out.push(k);
    }
    return out;
  }

  /** may this mode offer this option at all? — the question the panel asks before drawing a chip */
  function supports(mode, feature) {
    var pool = usable(mode);
    if (!pool.length) return false;
    /* the four spellings the panel used before the vocabulary existed, kept working */
    if (feature === 'avoid') return mode === 'driving' && pool.some(function (p) { return p.caps.avoidTolls || p.caps.avoidMotorways || p.caps.avoidFerries; });
    if (feature === 'via') return pool.some(function (p) { return p.caps.maxWaypoints > 2; });
    if (feature === 'transitModes') return mode === 'transit';
    if (feature === 'liveTraffic') feature = 'traffic';
    if (feature === 'alternatives') return pool.some(function (p) { return p.caps.alternatives > 1; });
    if (Object.prototype.hasOwnProperty.call(VOCAB, feature)) {
      return pool.some(function (p) { return VOCAB[feature] === 'n' ? (+p.caps[feature] > 0) : !!p.caps[feature]; });
    }
    return false;
  }

  /** does THIS provider have it — the question a result asks when it is deciding what to print */
  function can(id, feature) {
    var p = byId[id];
    if (!p || !Object.prototype.hasOwnProperty.call(VOCAB, feature)) return false;
    return VOCAB[feature] === 'n' ? (+p.caps[feature] > 0) : !!p.caps[feature];
  }

  /** the largest number of points any USABLE provider for this mode accepts — the ONLY cap on stops (§5.2) */
  function maxPoints(mode) {
    var pool = usable(mode);
    if (!pool.length) pool = LIST.filter(function (p) { return p.modes.indexOf(mode) >= 0; });
    return pool.reduce(function (m, p) { return Math.max(m, p.caps.maxWaypoints || 0); }, 0);
  }
  function maxVia(mode) { return Math.max(0, maxPoints(mode) - 2); }

  /* ══ ATTRIBUTION IS A LICENCE OBLIGATION, NOT A CREDIT ═════════════════════════════════════════
     ⚠ (#R347) FOUND WHILE READING THE PROVIDERS' OWN TERMS, AND IT PREDATES THIS ROUND. FOSSGIS —
     which serves `routing.openstreetmap.de` (walking, cycling) and `valhalla1.openstreetmap.de`
     (every avoid/keep-out request) — requires the attribution to carry ODbL, CC-BY-SA and a link to
     openstreetmap.org/fixthemap. The repository contained NO occurrence of `fixthemap`, so that
     third requirement was simply unmet for as long as those servers have been used.
     It is fixed here rather than in the panel because the panel prints whatever this table says, and
     a requirement written in one place cannot drift from the server it belongs to.
     ⚠ TWO OTHER FOSSGIS REQUIREMENTS ARE **NOT** MET AND ARE **NOT** FIXED HERE, deliberately:
       · «a valid HTTP User-Agent identifying the application» — a browser forbids scripts from
         setting User-Agent, and a custom header (`X-Client-Id`) on a cross-origin GET adds a CORS
         preflight these servers are not known to answer. Sending one to find out could take routing
         off the air, which is a worse outcome than the gap; it needs a measured round of its own.
       · «URLs should not be hardcoded» and «high-traffic sites are generally not permitted» — those
         are decisions about which servers this project should depend on at all, not edits.
     Both are recorded in DEV-NOTES rather than guessed at. */
  var TERMS = {
    osrm: { url: 'https://www.openstreetmap.org/copyright', fixmap: true, licence: 'ODbL' },
    valhalla: { url: 'https://www.openstreetmap.org/copyright', fixmap: true, licence: 'ODbL' },
    motis: { url: 'https://www.openstreetmap.org/copyright', fixmap: false, licence: 'per-feed' },
    'jr-bridge': { url: '', fixmap: false, licence: 'operator timetables' },
    mapbox: { url: 'https://www.mapbox.com/about/maps/', fixmap: false, licence: 'Mapbox Product Terms' },
  };

  /** the attribution every currently-usable provider requires — §Q of the licence review */
  function attributions(ids) {
    var seen = [], out = [];
    (ids || LIST.map(function (p) { return p.id; })).forEach(function (id) {
      var p = byId[id]; if (!p) return;
      String(p.attribution || '').split(/\s*,\s*/).forEach(function (a) { if (a && seen.indexOf(a) < 0) { seen.push(a); out.push(a); } });
    });
    return out;
  }

  /** the links a reply MUST carry when this provider answered it */
  function terms(id) { return TERMS[id] || null; }
  function needsFixMap(id) { return !!(TERMS[id] && TERMS[id].fixmap); }

  /** may this provider's returned content be handed to the AI proxy? — see the Mapbox note */
  function allowsAI(id) { var p = byId[id]; return !p ? true : p.aiContent !== false; }
  /** must this provider's results never be cached or persisted? */
  function noStore(id) { var p = byId[id]; return !!(p && p.noStore); }

  return {
    VOCAB: VOCAB, VOCAB_KEYS: VOCAB_KEYS.slice(),
    list: function () { return LIST.map(function (p) { return p; }); },
    byId: function (id) { return byId[id] || null; },
    forRequest: forRequest, supports: supports, can: can, maxPoints: maxPoints, maxVia: maxVia,
    available: available, availability: availability, setAvailable: setAvailable, usable: usable,
    lostBetween: lostBetween, attributions: attributions, allowsAI: allowsAI, noStore: noStore,
    terms: terms, needsFixMap: needsFixMap, TERMS: TERMS,
    _pure: { none: none, assertComplete: assertComplete },
  };
})();
