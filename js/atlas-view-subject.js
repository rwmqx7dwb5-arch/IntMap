/* ============================================================================
 *  IntMap · Atlas — what the reader is actually looking at  (#R392)
 * ----------------------------------------------------------------------------
 *  ══ ⚠⚠⚠ THE SAME REPORT, A FOURTH TIME ═══════════════════════════════════════════════════════
 *  「Atlasにはプリセットの送信文が用意されていますが、それは今地図で見ている地域に応じて用意して
 *    変えるようにして。（追記：まだほぼ定型文みたいなものしかない。もっとその場所にあったものに。）」
 *
 *  #R309 answered it with four fixed sentences and the country's name substituted in. #R313 called
 *  that a mail merge and built a POOL of candidates gated on facts. #R337 measured that every
 *  candidate in that pool was gated on a WORLD EXTREME — which admits ten countries — and added 26
 *  more along axes that partition the whole world. Three rounds, each one a real improvement, and
 *  the reader sent the identical sentence back a fourth time.
 *
 *  ⚠ SO THE WORDING WAS NEVER THE DEFECT. All three rounds varied the PREDICATE over a fixed
 *  SUBJECT, and the subject is what is wrong. `exFacts()` reduced the entire view to
 *  `codeAtPoint(centre)` — the country the centre PIXEL falls in — and threw everything else away.
 *  js/atlas-examples.js said so itself, as if it were a feature:
 *
 *      「The guard above means a pan that stays inside one country costs one `codeAtPoint`
 *        and redraws nothing.」
 *
 *  and `exKey` proved it: `code|lang|live/year|layers` names no position and no zoom. Measured
 *  consequences, all four confirmed on production before this module was written:
 *    · Shibuya at z=14 and Wakkanai at z=10 and the whole of Japan at z=5 are handed the SAME four
 *      questions, byte for byte, because they are the same country.
 *    · A reader looking at one city block is asked 「Japan is one of the most crowded countries on
 *      Earth — how does it absorb that?」. The sentence is true. It is not about what is on screen.
 *    · Panning never redraws at all: the guard short-circuits on an unchanged key.
 *    · Open water resolves to no country, so the Pacific, the Atlantic and the Sea of Japan all fall
 *      to the four generic world sentences — the mail merge with the name taken out.
 *
 *  A question is about THIS view when it is about something true of this view and not of the next
 *  one. So this module answers 「what is the reader looking at」 from the view itself, and every
 *  claim it makes is MEASURED from the map rather than looked up from the country:
 *
 *    · WHICH COUNTRIES ARE IN VIEW — a grid of sample points through the real country polygons, not
 *      one centre pixel. `CTX.geo` is the SAME FeatureCollection js/atlas-console.js already holds and
 *      `codeAtPoint` already reads, passed in rather than re-fetched, so this costs no network.
 *      one centre pixel. Two countries in view is a BORDER, three is a tri-point, and neither is a
 *      fact any country-level table can hold. The same sweep yields how much of the view is land,
 *      which separates an inland view from a coast from open ocean.
 *    · WHICH NAMED WATER IS IN VIEW — the curated gazetteer this app already ships and already has
 *      in memory (`window.SEA_LABELS`, 120 rows, js/tables.js, eager). Selected by the SAME rank the
 *      shipped label layer filters on, so 「which water body is this view about」 gets the answer the
 *      map itself would print.
 *    · WHAT IS NAMED ON THE GROUND — the vector tiles already fetched for this viewport, read with
 *      `querySourceFeatures` exactly as js/place-labels.js's own harvester reads them. Settlements
 *      and peaks, with their elevations.
 *    · HOW BIG THE VIEW IS, in kilometres — because 「what is this place for」 is a different question
 *      at 20 km than at 2,000 km, and the register has to follow the reader's zoom.
 *
 *  ⚠ NOTHING HERE FETCHES. Every source is either already in memory (`SEA_LABELS`, the country
 *  polygons Atlas already holds) or already on the GPU (the tiles being drawn). js/atlas-examples.js
 *  is in the async `atlas-console` chunk, so this module costs the startup path zero bytes — which
 *  matters, because `npm run check:perf`'s eager ratchet is at exactly zero headroom.
 *
 *  ⚠ AND EVERY CLAIM REFUSES RATHER THAN GUESSES (#R337's rule, kept). A box that crosses the
 *  antimeridian is refused every longitudinal claim; a water body too small for the view is refused
 *  rather than named; a view whose tiles have not arrived reports nothing on the ground rather than
 *  reporting emptiness. `null` is a real answer here and the pool is written to expect it.
 * ==========================================================================*/

export function makeAtlasViewSubject(CTX) {
  const GE = CTX.GE, geo = CTX.geo, countryStats = CTX.countryStats, cName = CTX.cName;

  /* ══ ⚠ (#R175 ③) THESE LIVE INSIDE THE FACTORY, AND THAT IS THE RULE RATHER THAN A STYLE ═══════
     A js/ module may have NO unexported top-level declaration (a classic script's top-level `const`
     is a global; the whole migration rests on there being none), and every export it DOES have must
     be imported by name by some other js/ module or it is dead code. Exporting these five helpers so
     that only the round's own checks could import them satisfied neither half: `WATER_KIND` was an
     unexported top-level declaration, and the five exports were dead by that definition, because the
     walk only reads js/ and a test is not js/. They are handed back on the returned object instead,
     which is how the checks drive them and how the rule stays a rule. ══════════════════════════ */

  /* ⚠ THE GAZETTEER IS 120 CURATED ROWS AND 33 OF THEM ARE FRESH WATER. Measured, on the shipped
     table: 7 oceans, 54 seas, 14 gulfs, 5 bays, 2 straits, 2 channels, 1 passage — and 33 lakes and
     one reservoir. A question about what crosses an ocean, asked of Lake Bled, is the defect this
     round exists to remove, so the kind is decided FIRST and fresh water gets its own question.
     ⚠ `Lake` is tested before `Sea`: the Caspian and the Aral are named 「Sea」 and are neither, but
     they are marine in every way this pool asks about (contested, navigated, shrinking), so they stay
     on the marine side deliberately. What must not happen is Lake Superior being asked who patrols it.
     ⚠ THE FAMOUS CHOKEPOINTS ARE NOT IN THIS TABLE. Gibraltar, Hormuz, Malacca, Dover and the
     Bosphorus have no row, so this module does NOT try to recognise a strait by name — the two rows
     that say 「Strait」 are Bass and Davis. Those views are answered instead by the thing that is
     actually measurable about them: two countries in view with the view mostly water. */
  const WATER_KIND = [
    [/\b(?:Lake|Reservoir)\b/i, 'lake'],
    [/\bOcean\b/i, 'ocean'],
    [/\b(?:Strait|Straits|Channel|Passage|Sound)\b/i, 'narrows'],
    [/\b(?:Gulf|Bay|Bight)\b/i, 'gulf'],
    [/\bSea\b/i, 'sea']
  ];
  function waterKind(name) {
    const s = String(name || '');
    for (const [re, k] of WATER_KIND) if (re.test(s)) return k;
    return 'other';
  }

  /* ⚠ THE REACH IS THE TABLE'S OWN RANK, NOT A NUMBER TYPED HERE. `z` is the zoom at which the
     shipped label layer starts drawing the row (js/place-labels.js: `['<=',['get','z'],['+',['zoom']…`),
     so it already encodes how big the water is: 0.5 for the oceans, 2.5–3.5 for the great seas,
     4–4.5 for the gulfs, 5.5–7.5 for the lakes. A tile at zoom z is 40075/2^z km across, and half of
     that is the distance the row's single label point can honestly answer for. */
  function waterReachKm(z) { return 0.5 * 40075 / Math.pow(2, Math.max(0, +z || 0)); }

  /* Which row is THIS view about? Among the rows close enough to be in it, the most specific one that
     is still big enough for it — so Lake Geneva answers a 30 km view and the Sea of Japan answers a
     2,000 km one, and neither answers the other's. Handed back on the returned object so the
     round's checks can drive it without a map. */
  /* ⚠⚠⚠ MEASURED IN A REAL BROWSER, AND THE FIRST VERSION OF THIS FUNCTION WAS WRONG IN BOTH
     DIRECTIONS. It admitted every row whose OWN reach covered the distance, then preferred the most
     specific of them. Two failures, both observed on the shipped build before this was rewritten:
       · Shibuya at z=14 — a view about 2 km across — was told 「Lake Kasumigaura: what lives in it…」.
         Kasumigaura is 60 km away and not on the screen at all. Its reach (156 km) covered the
         distance, and being the smallest reach it won.
       · The tropical Pacific at (−150°, 10°) was told 「Arctic Ocean: what crosses it here…」, because
         the Arctic's reach (11,516 km) is smaller than the North Pacific's (28,336 km) and both
         covered the distance.
     The row's reach answers 「is this water big enough to be what a view this size is about」. It does
     NOT answer 「is it here」, and using it for both is what produced a lake 60 km outside the frame.
     So the two questions are asked separately, and the winner is the NEAREST of the rows that pass
     both — a view is about the water it is on, not about the most obscure water within range. */
  function pickWater(rows, centre, spanKm, box) {
    if (!rows || !rows.length || !centre) return null;
    const ok = [];
    for (const r of rows) {
      const reach = waterReachKm(r.z);
      /* ① BIG ENOUGH FOR THIS VIEW — a pond cannot be what a continent-wide view is about */
      if (!(reach >= spanKm * 0.5)) continue;
      /* ② ACTUALLY HERE — inside the frame, or within one frame-width of its centre so that a view
         sitting just inland of a coast can still name the sea it is looking at. The 25 km floor keeps
         a very tight view able to name the bay it is standing on.
         ⚠ …OR WELL INSIDE THE WATER'S OWN BODY. A gazetteer row is ONE label point, and for an ocean
         that point is nowhere near most of the ocean: measured, a click on the open Pacific at
         (−150°, 10°) sits 2,600 km from the 「North Pacific Ocean」 label and was told about no water
         at all, falling back to the generic world row. A quarter of the row's own reach is the
         distance at which it is still plainly the same body of water — 7,084 km for the Pacific, and
         only 39 km for Lake Kasumigaura, which is what keeps the 60 km lake out of a 2 km view. */
      const inBox = !!(box && r.lng >= box.w && r.lng <= box.e && r.lat >= box.s && r.lat <= box.n);
      const d = haversineKm(centre, r);
      if (!inBox && !(d <= Math.max(spanKm, 25)) && !(d <= reach * 0.25)) continue;
      ok.push({ r: r, reach: reach, d: d, inBox: inBox });
    }
    if (!ok.length) return null;
    /* ⚠⚠⚠ IN-BOX IS A SORT KEY, NOT A DISTANCE OF ZERO. This collapsed every row inside the frame to
       `d = 0`, which threw away exactly the information 「nearest wins」 needs — and MEASURED on
       production, a view of the whole of Japan at z=5 was told 「This is where Japan meets East China
       Sea」. Both the Sea of Japan (452 km away) and the East China Sea (1,501 km) have their label
       points inside that frame, so both scored 0, both are rank z=3 so the reach tie-break was equal
       too, and the winner was decided by which row js/tables.js happens to list first.
       ⇒ a row inside the frame still beats one outside it, and among either group the real distance
       decides. The most specific of two equally close rows breaks what is left. */
    ok.sort((a, b) => (Number(b.inBox) - Number(a.inBox)) || (a.d - b.d) || (a.reach - b.reach));
    const hit = ok[0];
    return { name: hit.r.name, kind: waterKind(hit.r.en != null ? hit.r.en : hit.r.name),
             z: hit.r.z, km: Math.round(hit.d) };
  }

  function haversineKm(a, b) {
    const R = 6371, d = Math.PI / 180;
    const dLa = (b.lat - a.lat) * d, dLo = (b.lng - a.lng) * d;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* ⚠ THE REGISTER IS MEASURED IN KILOMETRES, NOT READ OFF THE ZOOM NUMBER. A zoom level means a
     different width at the equator than at 70°N, and the reader is looking at a width. These bands are
     what decides whether 「this place」 means a country, a region, a city or a street — and the pool
     below is written so that a view at `street` is never handed a question about the country. */
  function scaleOf(spanKm) {
    if (!(spanKm > 0)) return 'world';
    if (spanKm >= 5000) return 'world';
    if (spanKm >= 1500) return 'continent';
    if (spanKm >= 400) return 'country';
    if (spanKm >= 80) return 'region';
    if (spanKm >= 15) return 'city';
    return 'street';
  }

  /* ── the box the reader is looking at ─────────────────────────────────────────────────────
     ⚠ `getBounds()` IS NOT THE FRUSTUM (#R325 measured the other direction of the same gap: the
     frustum reaches outside the bounds). Under tilt, and on the globe, it can also come back
     spanning most of the planet. Both failures are handled the same way — a box wider than 180° is
     refused and rebuilt from the centre and the zoom, which cannot lie about its own width. */
  function viewBox() {
    let c = null, z = 0;
    try { c = GE().camera.getCenter(); z = GE().camera.getZoom(); } catch (_) { return null; }
    if (!c || !isFinite(c.lng) || !isFinite(c.lat)) return null;
    let w, s, e, n, viaBounds = false;
    /* ⚠ `getBounds()` RETURNS THE RENDERER'S BOUNDS OBJECT, NOT A PLAIN BOX — MapLibre's
       LngLatBounds, or the Cesium adapter's stand-in for it. js/atlas-state.js's `viewport` provider
       unpacks it through `getWest/getSouth/getEast/getNorth`, and so does this: `getSouthWest()`
       exists on MapLibre's and NOT on the adapter's, so reading the corners would work on one engine
       and silently return nothing on the other. */
    try {
      const b = GE().camera.getBounds();
      if (b && typeof b.getWest === 'function') {
        const bw = +b.getWest(), bs = +b.getSouth(), be = +b.getEast(), bn = +b.getNorth();
        if (isFinite(bw) && isFinite(bs) && isFinite(be) && isFinite(bn)) {
          w = bw; s = bs; e = be; n = bn; viaBounds = true;
        }
      }
    } catch (_) {}
    if (!viaBounds || !(e - w > 0) || (e - w) >= 180 || !(n - s > 0)) {
      /* a square-ish window derived from the zoom — the width of the map at this scale */
      const halfDeg = Math.min(80, 180 / Math.pow(2, Math.max(0, z)));
      w = c.lng - halfDeg; e = c.lng + halfDeg;
      s = Math.max(-85, c.lat - halfDeg); n = Math.min(85, c.lat + halfDeg);
      viaBounds = false;
    }
    const midLat = (s + n) / 2;
    const kmLon = (e - w) * 111.32 * Math.cos(midLat * Math.PI / 180);
    const kmLat = (n - s) * 110.57;
    const spanKm = Math.max(kmLon, kmLat);
    return { w: w, s: s, e: e, n: n, lng: c.lng, lat: c.lat, z: z,
             spanKm: spanKm, scale: scaleOf(spanKm), viaBounds: viaBounds };
  }

  /* ── which countries are actually in view, and how much of it is land ────────────────────
     ⚠ `codeAtPoint` HAS NO BBOX PRE-FILTER (js/atlas-console.js): it ray-casts every ring of every
     country until something hits, so a point over open sea costs the whole table. Sampling a grid
     with it directly would put a long task on every pan. The country's own `bbox` (#R185) is already
     in `countryStats`, so the cheap rectangle test runs first and the ray-cast only settles the one
     or two candidates that survive — which is also why the bbox is never allowed to ANSWER: an
     extent is not a location (#R337 追記), it is only a way of not asking. */
  function landInView(box) {
    const out = { codes: [], landFrac: 0, samples: 0 };
    if (!box) return out;
    let feats = null;
    try { const g = geo(); feats = (g && g.features) || null; } catch (_) {}
    if (!feats || !feats.length) return out;
    /* 6×6 across the box, inset half a cell so the samples describe the interior rather than the
       edges — a border view must not be decided by a pixel on the frame */
    const K = 6, hit = Object.create(null);
    let land = 0, tot = 0;
    for (let i = 0; i < K; i++) {
      for (let j = 0; j < K; j++) {
        const lng = box.w + (box.e - box.w) * ((i + 0.5) / K);
        const lat = box.s + (box.n - box.s) * ((j + 0.5) / K);
        if (!isFinite(lng) || !isFinite(lat) || lat > 85 || lat < -85) continue;
        tot++;
        let code = null;
        for (const f of feats) {
          const st = countryStats ? countryStats[String(f.id)] : null;
          /* ⚠ (#R426) THE SUPERSET, NOT THE FRAME. `bbox` is the country's HOME extent now — the
             parts that read as the country — and a refusal built from it would answer «that point
             cannot be in Norway» over Bouvet Island, which is Norwegian. `bboxAll` is the union
             this line has always used, under the name that says so. */
          const bb = (st && st.bboxAll && st.bboxAll.length === 4) ? st.bboxAll : null;
          /* the cheap refusal first; a wrapped ring's bbox is useless so it goes to the ray-cast */
          if (bb && (bb[2] - bb[0]) < 180 &&
              (lng < bb[0] || lng > bb[2] || lat < bb[1] || lat > bb[3])) continue;
          if (pipFeat(lng, lat, f.geometry)) { code = String(f.id); break; }
        }
        if (code) { land++; hit[code] = (hit[code] || 0) + 1; }
      }
    }
    out.samples = tot;
    out.landFrac = tot ? (land / tot) : 0;
    /* ⚠ ORDERED BY HOW MUCH OF THE VIEW EACH ONE HOLDS, so 「the border between A and B」 names the
       two that are actually there and not whichever the polygon list happened to reach first. A
       country holding a single sample out of 36 is a sliver on the frame, not a subject. */
    out.codes = Object.keys(hit)
      .filter((c) => hit[c] >= 2 || Object.keys(hit).length === 1)
      .sort((a, b) => hit[b] - hit[a]);
    out.share = hit;
    return out;
  }
  function pipRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)) inside = !inside;
    }
    return inside;
  }
  function pipPoly(x, y, poly) {
    if (!poly || !poly.length || !pipRing(x, y, poly[0])) return false;
    for (let i = 1; i < poly.length; i++) if (pipRing(x, y, poly[i])) return false;
    return true;
  }
  function pipFeat(x, y, gm) {
    if (!gm) return false;
    if (gm.type === 'Polygon') return pipPoly(x, y, gm.coordinates);
    if (gm.type === 'MultiPolygon') return gm.coordinates.some((p) => pipPoly(x, y, p));
    return false;
  }

  /* ── the named water this view is about ──────────────────────────────────────────────────── */
  function waterInView(box) {
    if (!box) return null;
    let rows = null;
    try { rows = window.SEA_LABELS || null; } catch (_) {}
    if (!rows || !rows.length) return null;
    /* ⚠⚠⚠ THE ROW IS RESOLVED THROUGH `pick().arr()`, NOT THROUGH A COLUMN MAP. The first version
       indexed the five positional columns with `{en:3, jp:4, de:5, ru:6, es:7}` — which
       `npm run check:i18n` refuses as 「a translation tuple held as data instead of as a call」, and
       it is right to: a hand-written column map reaches FIVE languages, so fr / ko / zh-Hant /
       zh-Hans readers would have been handed the ENGLISH name of the sea in the middle of a
       translated sentence. `IntMapLang.pick()` is the same door js/place-labels.js:466 opens for
       these very rows, and `arr()` falls through to the inline table for the other four.
       ⚠ THE ENGLISH COLUMN IS STILL CARRIED SEPARATELY as `en`, because `waterKind` is written
       against the English spellings and must never be handed a translated one. */
    let L = null;
    try { L = window.IntMapLang.pick(() => (CTX.lang ? CTX.lang() : 'en')); } catch (_) {}
    const list = [];
    for (const r of rows) {
      if (!r || r.length < 4 || !isFinite(r[0]) || !isFinite(r[1])) continue;
      let nm = r[3];
      if (L && L.arr) { try { nm = L.arr([r[3], r[4], r[5], r[6], r[7]]) || r[3]; } catch (_) {} }
      list.push({ lng: +r[0], lat: +r[1], z: +r[2], en: r[3], name: nm });
    }
    return pickWater(list, { lng: box.lng, lat: box.lat }, box.spanKm, box);
  }

  /* ── what is named on the ground inside this view ─────────────────────────────────────────
     ⚠ `querySourceFeatures`, NOT `queryRenderedFeatures`. The label layers ship with
     `visibility:'none'` and follow the reader's own 「地名」/「地形」 checkboxes, so asking what is
     RENDERED would make the chips depend on whether labels are switched on — a reader who turned
     names off is still looking at Osaka. The source answers from the tiles that were fetched for
     this viewport either way, which is the same thing js/place-labels.js's harvester asks.
     ⚠ AND THE TILES ARE A CACHE, NOT A TRUTH: they cover more than the viewport and arrive late, so
     everything is filtered back to the box and an empty answer is reported as 「not known」 rather
     than as 「nothing there」 (`known:false`). The pool's 「no settlement in this view」 question is
     gated on `known`, because otherwise it would fire on every slow network. */
  function groundInView(box) {
    const out = { places: [], peaks: [], known: false };
    if (!box) return out;
    let has = false;
    try { has = !!GE().layers.hasSource('ofm'); } catch (_) {}
    if (!has) return out;
    const inBox = (co) => co && isFinite(co[0]) && isFinite(co[1]) &&
      co[0] >= box.w && co[0] <= box.e && co[1] >= box.s && co[1] <= box.n;
    const anchor = (g) => {
      if (!g) return null;
      if (g.type === 'Point') return g.coordinates;
      if (g.type === 'LineString' && g.coordinates.length) return g.coordinates[Math.floor(g.coordinates.length / 2)];
      if (g.type === 'MultiLineString' && g.coordinates.length && g.coordinates[0].length) {
        const ln = g.coordinates[0]; return ln[Math.floor(ln.length / 2)];
      }
      return null;
    };
    /* ⚠⚠⚠ THE NAME IS RESOLVED THE WAY THE MAP'S OWN LABELS RESOLVE IT. Reading `p.name` gives the
       raw OSM local name, and MEASURED in a real browser that produced chips reading
       「Tanger ⵟⴰⵏⵊⴰ طنجة」, 「خصب」 and 「珠穆朗玛峰 ཇོ་མོ་གླང་མ། सगरमाथा」 — three scripts in one label for a
       reader who asked for English. js/place-labels.js already publishes the key order its label
       layers use (`window.IntMapOsmNameKeys(lang)` → `name:<lang>`, `name:en`, `name:latin`,
       `name_int`), so the chips ask the same question and get the same answer as the map. */
    const nameOf = (p) => {
      let keys = null;
      try { keys = window.IntMapOsmNameKeys ? window.IntMapOsmNameKeys(CTX.lang ? CTX.lang() : 'en') : null; } catch (_) {}
      if (!keys || !keys.length) keys = ['name:en', 'name:latin', 'name_int'];
      for (const k of keys) if (p[k]) return String(p[k]);
      return p.name ? String(p.name) : '';
    };
    /* settlements. `class` is OpenMapTiles' own grading, and `rank` its own importance — both are
       read rather than re-derived, so 「the biggest place in view」 is the tiles' answer.
       ⚠ THE DENSE-CITY CLASSES ARE INCLUDED. MEASURED: Shibuya at z=14 and central Tokyo at z=16
       found NO place at all, because the only `place` features inside a 5 km box are graded
       `quarter` / `neighbourhood` / `borough` — Tokyo's own city point sits outside the frame. */
    try {
      const seen = Object.create(null);
      const feats = GE().coords.querySourceFeatures('ofm', { sourceLayer: 'place' }) || [];
      for (const f of feats) {
        const p = (f && f.properties) || {};
        const cls = String(p.class || '');
        if (!/^(city|town|village|suburb|hamlet|borough|quarter|neighbourhood)$/.test(cls)) continue;
        const nm = nameOf(p);
        if (!nm) continue;
        const co = anchor(f.geometry);
        if (!inBox(co)) continue;
        /* ⚠ THE SAME PLACE ARRIVES ONCE PER TILE (#R344 measured the identical duplication in
           `queryRenderedFeatures` at tile seams) — keyed on the name so it is counted once. */
        const key = nm.toLowerCase();
        if (seen[key]) continue;
        seen[key] = 1;
        out.places.push({ name: nm, cls: cls, rank: isFinite(+p.rank) ? +p.rank : 99 });
      }
      /* ⚠⚠⚠ 「THE TILES ANSWERED」 IS NOT 「THE CALL RETURNED」. This flag was set unconditionally,
         which made an empty tile cache indistinguishable from an empty landscape — and MEASURED in a
         real browser they are not the same thing at all: four seconds after jumping to Shibuya the
         source held ZERO features, and four seconds later it held 1,437. A chip reading 「there is
         not one named settlement in this view」 would have fired over central Tokyo.
         The honest test is whether the cache returned ANYTHING anywhere. Features outside the box
         still prove the tiles arrived, which is exactly what the Gobi needs: its loaded tiles do
         name places, just none inside the frame. */
      out.known = feats.length > 0;
    } catch (_) {}
    /* peaks carry a real measured elevation, which is the rare case of a number worth substituting */
    try {
      const seen2 = Object.create(null);
      const feats = GE().coords.querySourceFeatures('ofm', { sourceLayer: 'mountain_peak' }) || [];
      for (const f of feats) {
        const p = (f && f.properties) || {};
        const nm = nameOf(p);
        if (!nm) continue;
        const co = anchor(f.geometry);
        if (!inBox(co)) continue;
        const key = nm.toLowerCase();
        if (seen2[key]) continue;
        seen2[key] = 1;
        const ele = isFinite(+p.ele) ? Math.round(+p.ele) : null;
        out.peaks.push({ name: nm, ele: ele });
      }
    } catch (_) {}
    /* the tiles' own ordering is arbitrary; 「the place this view is about」 is the highest-graded
       one, and 「the mountain this view is about」 is the tallest that states a height */
    const ORD = { city: 0, town: 1, borough: 2, suburb: 3, quarter: 4, neighbourhood: 5,
                  village: 6, hamlet: 7 };
    out.places.sort((a, b) => ((ORD[a.cls] == null ? 9 : ORD[a.cls]) - (ORD[b.cls] == null ? 9 : ORD[b.cls]))
                              || (a.rank - b.rank));
    out.peaks.sort((a, b) => (b.ele || 0) - (a.ele || 0));
    return out;
  }

  /* ⚠⚠⚠ WHAT COUNTS AS 「the place this view is about」 DEPENDS ON HOW BIG THE VIEW IS. Measured: a
     546 km view of Lake Baikal was described by 「Усть-Ордынский」, a village — true, present, and
     not what anybody looking at half of Siberia is asking about. A settlement is the subject only
     when it is significant AT THIS SCALE, so the wider the frame the higher the grade required. */
  const CLS_FOR = {
    street: /^(city|town|borough|suburb|quarter|neighbourhood|village|hamlet)$/,
    city:   /^(city|town|borough|suburb|quarter|neighbourhood|village)$/,
    region: /^(city|town)$/,
    continent: /^city$/,
    country: /^city$/,
    world: /^city$/
  };
  function cityFor(places, scale) {
    const re = CLS_FOR[scale] || CLS_FOR.region;
    for (const p of places) if (re.test(p.cls)) return p;
    return null;
  }

  /* ⚠ A BOX AROUND AN EXPLICIT POINT, for the OTHER set of preset prompts. Clicking the map opens
     Atlas with three questions about 「this spot」 (js/atlas-console.js `askHere`), and those three
     were fixed sentences with no knowledge of where the click landed — the purest form of the very
     complaint this round is answering, fired by the most location-specific gesture in the app.
     ⚠ IT DOES NOT READ THE CAMERA, because `askHere` flies to the point and the flight takes 900 ms:
     asking the camera would describe wherever the reader was BEFORE the click. The clicked point is
     on screen by definition, so the tiles `groundInView` reads are the ones already loaded. */
  function boxAt(lng, lat, z) {
    if (!isFinite(lng) || !isFinite(lat)) return null;
    const halfDeg = Math.min(80, 180 / Math.pow(2, Math.max(0, +z || 5)));
    const s = Math.max(-85, lat - halfDeg), n = Math.min(85, lat + halfDeg);
    const midLat = (s + n) / 2;
    const kmLon = (2 * halfDeg) * 111.32 * Math.cos(midLat * Math.PI / 180);
    const kmLat = (n - s) * 110.57;
    const spanKm = Math.max(kmLon, kmLat);
    return { w: lng - halfDeg, s: s, e: lng + halfDeg, n: n, lng: lng, lat: lat, z: +z || 5,
             spanKm: spanKm, scale: scaleOf(spanKm), viaBounds: false };
  }

  /* ── the 143 places this app already calls strategic ──────────────────────────────────────
     `window.IntMapRefData.dashCards` (js/reference-data.js) is a curated table that is EAGER — it is
     already in memory when the chips first draw — and it holds exactly the places a reader zooms to
     on purpose: 16 maritime chokepoints (Hormuz, Malacca, Suez, Panama, Bab-el-Mandeb, the
     Bosphorus, the Taiwan Strait…), 39 ports and naval facilities, 37 military installations, 16
     spaceports and tracking stations, 15 technology clusters, 13 energy sites.

     ⚠⚠⚠ THE TYPE IS USED AND THE NAME IS NOT, AND THAT IS DELIBERATE. Each card carries
     `title:{en,jp}` — TWO languages out of nine. #R313 追記 hit precisely this and removed the
     capital's name from its chip, because a table with an English-only column substituted into a
     translated sentence gives a German reader an English noun in the middle of German. So the chip
     is gated on the card's `type` and names nothing: 「this is one of the world's maritime
     chokepoints」 is a question about sixteen places on Earth and about no others, and it is a
     literal `L()` in all nine languages with nothing interpolated.

     ⚠ AND IT ONLY ANSWERS WHEN THE READER IS ACTUALLY THERE. At world zoom most of the 143 are
     inside the frame and none of them is what the reader is looking at, so the whole table is
     refused above the country register. */
  const SITE_RANK = ['choke', 'space', 'energy', 'tech', 'maritime', 'mil', 'geo', 'hub'];
  function sitesInView(box) {
    if (!box || !/^(country|region|city|street)$/.test(box.scale)) return [];
    let rows = null;
    try { rows = (window.IntMapRefData && window.IntMapRefData.dashCards) || null; } catch (_) {}
    if (!rows || !rows.length) return [];
    const hit = [];
    for (const r of rows) {
      const lo = r && r.loc;
      if (!lo || !isFinite(lo[0]) || !isFinite(lo[1])) continue;
      if (lo[0] < box.w || lo[0] > box.e || lo[1] < box.s || lo[1] > box.n) continue;
      hit.push({ type: String(r.type || ''), cat: String(r.cat || ''), id: String(r.id || '') });
    }
    hit.sort((a, b) => {
      const ia = SITE_RANK.indexOf(a.type), ib = SITE_RANK.indexOf(b.type);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return hit;
  }

  /* ── the whole answer ─────────────────────────────────────────────────────────────────────
     One sweep per redraw. Everything downstream reads this object and nothing re-measures. */
  function subject(explicitBox) {
    const box = explicitBox || viewBox();
    if (!box) return null;
    const land = landInView(box);
    const water = waterInView(box);
    const ground = groundInView(box);
    const sites = sitesInView(box);
    const names = land.codes.map((c) => {
      const st = countryStats ? countryStats[c] : null;
      return st ? cName(st) : '';
    }).filter(Boolean);
    return {
      box: box, scale: box.scale, spanKm: box.spanKm,
      codes: land.codes, countryNames: names, nCountries: land.codes.length,
      landFrac: land.landFrac,
      water: water,
      places: ground.places, peaks: ground.peaks, groundKnown: ground.known,
      city: cityFor(ground.places, box.scale),
      peak: ground.peaks.length ? ground.peaks[0] : null,
      nPlaces: ground.places.length,
      sites: sites, siteType: sites.length ? sites[0].type : null,
      hasSite: (t) => sites.some((s) => s.type === t)
    };
  }

  /* the signature a redraw guard can compare. ⚠ IT HAS TO NAME THE VIEW, which is the whole defect
     this round removes — but not so finely that a one-pixel drift redraws. The centre is quantised
     to a fraction of the view's own span, so the chips change when the reader has actually moved to
     somewhere else and not when they nudged the map. */
  function viewKey(sub) {
    if (!sub) return 'x';
    const q = Math.max(0.02, sub.spanKm / 4000);
    const r = (v) => Math.round(v / q) * q;
    return sub.scale + '|' + r(sub.box.lng).toFixed(3) + ',' + r(sub.box.lat).toFixed(3) +
           '|' + sub.codes.join('+') + '|' + Math.round(sub.landFrac * 4) +
           '|' + ((sub.water && sub.water.name) || '') +
           '|' + ((sub.city && sub.city.name) || '') + '|' + ((sub.peak && sub.peak.name) || '') +
           '|' + (sub.siteType || '');
  }

  return { subject: subject, viewBox: viewBox, boxAt: boxAt, viewKey: viewKey,
           landInView: landInView, waterInView: waterInView, groundInView: groundInView,
           /* the pure ones, for the round's checks — see the note above */
           waterKind: waterKind, waterReachKm: waterReachKm, pickWater: pickWater,
           haversineKm: haversineKm, scaleOf: scaleOf };
}
