/* ============================================================================
 *  IntMap · THE COORDINATE SYSTEM — window.IntMapGisCrs   (#R732)
 * ----------------------------------------------------------------------------
 *  #R729 taught the import path to RECORD a coordinate system and nothing else. js/geo-import.js
 *  wrote one line —「RFC 7946 §4 fixes GeoJSON to WGS 84 … a delimited table states nothing」—
 *  and its own comment said why it stopped there: 「⚠ Not a re-projection — IntMap does not have
 *  one, and inventing a default would be the silent-wrong-answer this file exists to avoid.」
 *
 *  This file is the re-projection, so that sentence can go. Nothing about the refusals softens:
 *  a coordinate system this module cannot name is still refused BY NAME rather than drawn as if it
 *  were degrees.
 *
 *  ══ WHERE A DEFINITION MAY COME FROM — THREE RULES, NOT A TABLE ═══════════════════════════════
 *  .agents/rules/no-ad-hoc-hardcoding.md forbids 「名前・ID・綴りの埋め込み一覧で、実体から導ける
 *  もの」, and an EPSG list is exactly that: 6,000 rows of which any hand-copied subset is a
 *  photograph of somebody's afternoon. So there are three sources and all three are rules:
 *
 *    ① what proj4 itself already knows — asked with proj4.defs(code), never mirrored here.
 *       ⚠ MEASURED on proj4 2.19.10: that is more than the three names its README lists. It
 *       answers EPSG:4326 / 3857 / 900913 / 4269 / WGS84 AND the whole UTM block (EPSG:32601…32660,
 *       32701…32760), and it returns undefined for EPSG:32799 — i.e. it validates the zone itself.
 *    ② the UTM arithmetic, kept as a FALLBACK to ①. EPSG assigns 326NN to WGS 84 / UTM zone NN
 *       north and 327NN to zone NN south for NN = 01…60; that is a formula EPSG publishes, not a
 *       list, and the same code says which of the 60 meridians and which hemisphere. It is asked
 *       only when ① has already said it does not know, so there is never a second opinion in play.
 *       ⚠ Expires the day proj4 drops its UTM derivation — at which point this becomes the only
 *       answer instead of the unused one.
 *    ③ what the READER brought: define(code, text) takes the WKT in a .prj file or a proj string,
 *       and that text is the file's own statement about itself.
 *
 *  Anything else is `crs-unknown`. There is deliberately no nearest-match, no 「the numbers look
 *  like metres so it is probably Web Mercator」: a wrong datum is a silent 200 m, and #R515 is the
 *  round where a guessed coordinate put 宇部港 in 浜松市.
 *
 *  ══ THE AXIS ORDER IS MEASURED, NOT ASSUMED ═══════════════════════════════════════════════════
 *  EPSG defines 4326 as (latitude, longitude) and almost every file on earth writes (longitude,
 *  latitude), so a pair can arrive the other way round — from a WKT whose AXIS clause names
 *  northing first, or from a file whose author simply wrote them that way. A swap does not throw:
 *  the arithmetic succeeds and the feature is quietly somewhere else. So the OUTPUT IS CHECKED —
 *  this module emits [lng, lat] always, and a transform that produced |lat| > 90 is refused as
 *  `crs-axis-suspect` rather than drawn. ⚠ Measured on proj4 2.19.10: a lat-first pair through a
 *  GEOGCS whose AXIS is [Lat, Long] comes back lat-first, i.e. the library did NOT re-order it, and
 *  this check is the only thing between that and a map. It is a measurement of the ANSWER, so it
 *  holds whichever of the two caused the swap, and it expires for neither.
 *
 *  ══ BOTH DIRECTIONS, ONE ARITHMETIC (#R749) ══════════════════════════════════════════════════
 *  Until #R749 everything here pointed ONE WAY — into EPSG:4326 — because the only caller was an
 *  import, and an import has an obvious destination. A raster warp does not: it walks the OUTPUT
 *  grid and asks 「この経緯度の下にあるのは元の何画素目か」, which is 4326 → the projected grid, the
 *  direction that did not exist. So `toWgs84` / `fromWgs84` are here, they are the pair a warp
 *  needs, and `transformGeometry` now moves its positions through the SAME internal step
 *  (`movePoint`) rather than through a second copy of the P4 call and the axis check — one rule,
 *  two readers, which is the shape .agents/rules/no-ad-hoc-hardcoding.md §2-3 asks for.
 *  ⚠ THE AXIS CHECK BELONGS TO THE END THAT IS IN DEGREES, not to a function. Going OUT of 4326 it
 *  guards the INPUT (a 「latitude」 of 4,300,000 is a northing somebody passed in the wrong order);
 *  coming IN it guards the ANSWER, exactly as it always did.
 *
 *  ══ LAZY, LIKE THE CLIPPER ════════════════════════════════════════════════════════════════════
 *  proj4 arrives through a dynamic import the first time something is actually re-projected, the
 *  same contract js/gis-geometry.js has with polygon-clipping: a reader who never drops a file in a
 *  projected grid never downloads a projection engine, and `npm run check:perf` sees no new bytes
 *  on the boot path. It is NOT published through src/vendor.js for that reason — see the note there.
 *
 *  ══ THE PLANE A MEASUREMENT IS MADE ON (#R752) ═══════════════════════════════════════════════
 *  Everything above answers ONE question — 「この座標で届いたものを 4326 のどこに置くか」 — and it
 *  answers it by NAME, out of a registry. `docs/GIS-CORE.md` §6 recorded what that still leaves
 *  missing: 「解析用の座標系を選べない。…面積も距離も測地の km 固定」. A reader who wants an area in
 *  a Lambert or a UTM zone has nowhere to say so, and every km² the app prints comes off the sphere.
 *
 *  So there is a SECOND question here now, and it is deliberately a different one: 「どの面の上で
 *  測るか」. A plane is CHOSEN rather than read out of a file, so:
 *
 *    · it is built from ARITHMETIC IN THIS FILE, not from proj4. Three reasons, all measurable.
 *      ① An op measuring an area cannot await a dynamic import in the middle of a shoelace sum.
 *      ② The plane a local analysis wants — azimuthal equidistant on the centre of the reader's own
 *         data — has no EPSG code to look up; it has parameters.
 *      ③ [[intmap-declared-version-needs-a-keeper]]: a number a saved project reproduces must not
 *         depend on whether a library had finished loading when it was computed. Routing through
 *         proj4 when it happens to be there and through arithmetic when it is not is exactly the
 *         two-implementations-one-contract shape this project keeps paying for.
 *      ⚠ THAT IS A SECOND OPINION ABOUT EPSG:3857, and it is one on purpose: the door above moves a
 *      file INTO degrees, this builds a surface to MEASURE on. The two must agree, and 「must agree」
 *      is a thing to be measured — tests/r752 puts forward() against fromWgs84() rather than this
 *      comment asserting it.
 *    · it STATES WHERE IT MAY BE USED. A UTM zone is six degrees wide; an area measured two zones
 *      away is not refused by any arithmetic, it is simply wrong, and that is the silent-wrong-answer
 *      this file exists to refuse. So every plane carries `extent`, and `assess()` MEASURES how far
 *      a dataset leaves it — a count, an overshoot in degrees and the first position that did it,
 *      never a boolean.
 *    · it is MEASURED FOR DISTORTION RATHER THAN DESCRIBED. `distortionAt()` differentiates the
 *      projection itself (a Jacobian against the local metric of its own datum) and returns Tissot's
 *      two axes and the area scale. That is derived from the projection, so a plane added tomorrow is
 *      assessed by the same instrument and nobody writes 「Mollweide is equal-area」 into a table for
 *      it. `preserves` is only the THEORY; the numbers are the measurement.
 *    · ⚠ NOTHING HERE CHOOSES. `suggest()` ranks the declared planes by a measurement over the
 *      reader's own bounding box and hands back the specs with their numbers; the caller picks.
 *      .agents/rules/no-ad-hoc-hardcoding.md §2-2 — the code's job is to refuse what has no grounds,
 *      not to decide. A plane picked silently is a unit nobody said out loud.
 *    · ⚠ AND EVERY ANSWER CARRIES ITS UNIT. `areaOn` / `lengthOn` return {value, unit} because a bare
 *      number that used to be km² and is now m² is a defect no test can see
 *      ([[intmap-data-must-not-claim-an-author-it-lacks]] — a field being filled is not somebody
 *      having said it).
 *
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY (tests/r175 ③) and window.* is read at CALL time, so this
 *  module loads in Node with no DOM: ready() resolves false and every entry point answers `null` /
 *  a named refusal instead of throwing. looksProjected() needs no library at all — it is
 *  arithmetic on the numbers in the file — so it answers before and after ready() alike.
 * ==========================================================================*/

export function makeGisCrs() {
  return (function () {

    /* WGS 84 in the only axis order this module ever emits. Everything below transforms INTO this. */
    const WGS84 = 'EPSG:4326';

    /* Degrees, by definition of the unit — not a tolerance and not a tuning knob. A position
       outside these is not a degree pair, whatever the column was called. */
    const LON_MAX = 180, LAT_MAX = 90;

    /* ⚠ EVERY REFUSAL THIS MODULE CAN ANSWER WITH, ONCE. Until #R752 the codes were quoted at the
       eighteen places that raise them, which is fine while somebody is reading all eighteen and is a
       photograph the moment one is added — `refusals()` over a hand-written list would have gone
       stale and green, the shape [[intmap-discovered-list-is-a-photograph]] names. The list is
       Object.values of this, so the declaration IS the list (the same shape js/gis-ops.js uses for
       ORDER = Object.keys(DECL)). The spellings are unchanged: js/geo-import.js and js/gis-warp.js
       carry them to a reader and tests name them. */
    const WHY = Object.freeze({
      codeMissing: 'crs-code-missing',
      definitionMissing: 'crs-definition-missing',
      definitionUnreadable: 'crs-definition-unreadable',
      unavailable: 'crs-unavailable',
      unknown: 'crs-unknown',
      transformFailed: 'crs-transform-failed',
      axisSuspect: 'crs-axis-suspect',
      positionInvalid: 'crs-position-invalid',
      geometryMissing: 'crs-geometry-missing',
      featuresMissing: 'crs-features-missing',
      /* the analysis plane (#R752) */
      planeMissing: 'crs-plane-missing',
      planeUnknown: 'crs-plane-unknown',
      planeIsDegrees: 'crs-plane-is-degrees',
      planeParamsMissing: 'crs-plane-params-missing',
      planeSeamCrossed: 'crs-plane-seam-crossed',
      radiusUnavailable: 'crs-radius-unavailable',
      projectionFailed: 'crs-projection-failed',
      geometryNotAreal: 'crs-geometry-not-areal',
      geometryNotLinear: 'crs-geometry-not-linear',
      unitUnknown: 'crs-unit-unknown',
      purposeUnknown: 'crs-purpose-unknown',
      extentUnmeasurable: 'crs-extent-unmeasurable',
    });

    /* Sorted so two readers of the list never disagree about its order. */
    function refusals() { return Object.values(WHY).slice().sort(); }

    /* ── proj4, loaded once, on demand ────────────────────────────────────────────────────────── */

    let P4 = null, loading = null;
    /* code → the definition TEXT a reader handed us (③ above). Kept as text because that is what
       the reader can be shown and what a saved project can carry; proj4 keeps only its parse. */
    const brought = new Map();

    function ready() {
      if (P4) return Promise.resolve(true);
      if (loading) return loading;
      loading = import('proj4')
        .then((m) => {
          P4 = (m && (m.default || m)) || null;
          if (!P4 || typeof P4.defs !== 'function') { P4 = null; return false; }
          /* Definitions that arrived before the library did are registered now, so define() has the
             same meaning either side of the load. */
          for (const [code, text] of brought) { try { P4.defs(code, text); } catch (_) { } }
          return true;
        })
        .catch(() => { loading = null; return false; });
      return loading;
    }

    function available() { return !!(P4 && typeof P4.defs === 'function'); }

    /* ── the code itself ──────────────────────────────────────────────────────────────────────── */

    /* `epsg:3857`, ` EPSG:3857 ` and `EPSG::3857` are one code written three ways. The URN spelling
       is unwrapped by the caller that reads a file (js/geo-import.js) because it is a GeoJSON
       grammar rather than a property of the code; what arrives here is `AUTHORITY:CODE`. */
    function normalise(code) {
      const t = String(code == null ? '' : code).trim().toUpperCase();
      if (!t) return null;
      const m = /^EPSG:{1,2}(\d{3,6})$/.exec(t);
      return m ? ('EPSG:' + m[1]) : t;
    }

    /* ② — EPSG's own assignment, as arithmetic. 326NN north / 327NN south, NN = 01…60. Returns the
       proj string for that zone, or null when the number is not one of the 120 codes the rule
       covers (zone 0 and zone 61 exist in neither hemisphere). */
    function utmDefinition(code) {
      const m = /^EPSG:32(6|7)(\d\d)$/.exec(code || '');
      if (!m) return null;
      const zone = Number(m[2]);
      if (!(zone >= 1 && zone <= 60)) return null;
      const south = (m[1] === '7') ? ' +south' : '';
      return '+proj=utm +zone=' + zone + south + ' +datum=WGS84 +units=m +no_defs';
    }

    /* The definition TEXT this module holds for a code: what the reader brought, or what the UTM
       rule derives. ⚠ null here does NOT mean 「unknown」 — for the codes proj4 ships (①) there is
       no text to hand back, because proj4 stores a parsed object and not the string it came from
       (measured: proj4.defs('EPSG:4326') is {projName:'longlat', …}). known() is the question
       「can this be transformed」; resolve() is the question 「what text do we have for it」. */
    function resolve(code) {
      const c = normalise(code);
      if (!c) return null;
      if (brought.has(c)) return brought.get(c);
      return utmDefinition(c);
    }

    /* Registered with proj4 under its own name, so every entry point below can pass the CODE and
       none of them has to remember which of the three sources answered. */
    function register(code) {
      if (!available() || !code) return false;
      let known = null;
      try { known = P4.defs(code); } catch (_) { known = null; }
      if (known) return true;                       /* ① proj4 already knows it */
      const text = resolve(code);                   /* ② or ③ */
      if (!text) return false;
      try { P4.defs(code, text); } catch (_) { return false; }
      let after = null;
      try { after = P4.defs(code); } catch (_) { after = null; }
      return !!after;
    }

    function known(code) {
      const c = normalise(code);
      if (!c) return false;
      if (isWgs84(c)) return true;
      if (!available()) return false;
      return register(c);
    }

    /* ③ — the reader's own .prj or proj string. It is not parsed here: proj4 is the parser, and a
       second parser would be a second opinion about what a WKT means. The text is only checked for
       being one of the two grammars at all, so that a stray line of CSV is refused as text rather
       than accepted as an unusable definition. */
    function define(code, definition) {
      const c = normalise(code);
      if (!c) return { ok: false, why: WHY.codeMissing };
      const text = String(definition == null ? '' : definition).trim();
      if (!text) return { ok: false, why: WHY.definitionMissing };
      const isProj = /(^|\s)\+proj=/.test(text);
      const isWkt = /^\s*(PROJCS|GEOGCS|PROJCRS|GEOGCRS|BOUNDCRS|COMPD_CS|COMPOUNDCRS|ENGCRS|LOCAL_CS)\b/i.test(text);
      if (!isProj && !isWkt) return { ok: false, why: WHY.definitionUnreadable };
      if (!available()) { brought.set(c, text); return { ok: false, why: WHY.unavailable }; }
      const previous = brought.get(c);
      brought.set(c, text);
      try {
        P4.defs(c, text);
        /* Registered is not the same as usable: proj4 accepts a definition whose projName it does
           not implement and fails at the first transform. So it is transformed once, here, where
           the failure can still be given back as an answer instead of appearing over a map. */
        const probe = P4(c, WGS84, [0, 0]);
        if (!Array.isArray(probe) || !isFinite(probe[0]) || !isFinite(probe[1])) throw new Error('unusable');
      } catch (_) {
        if (previous == null) brought.delete(c); else brought.set(c, previous);
        return { ok: false, why: WHY.definitionUnreadable };
      }
      return { ok: true };
    }

    /* ── positions ────────────────────────────────────────────────────────────────────────────── */

    /* A POSITION is an array whose first two members are finite numbers. A list of positions has
       arrays there instead, which is the whole of the difference — so the walk below needs no table
       of geometry types, and a type this app has never seen travels through it unchanged. */
    function isPosition(a) {
      return Array.isArray(a) && a.length >= 2
        && typeof a[0] === 'number' && typeof a[1] === 'number'
        && isFinite(a[0]) && isFinite(a[1]);
    }

    /* Depth-first over `coordinates`, whatever its nesting. Returns null — never a half-converted
       tree — as soon as one position cannot be produced, because a caller handed half a shape has
       no way to tell which half. Members past the first two (elevation, measure) are carried
       through untouched: a re-projection is about x and y. */
    function mapPositions(node, fn) {
      if (isPosition(node)) return fn(node);
      if (!Array.isArray(node)) return null;
      const out = [];
      for (const child of node) {
        const m = mapPositions(child, fn);
        if (m === null) return null;
        out.push(m);
      }
      return out;
    }

    function eachPosition(node, fn) {
      if (isPosition(node)) { fn(node); return; }
      if (!Array.isArray(node)) return;
      for (const child of node) eachPosition(child, fn);
    }

    /* ── the transform ────────────────────────────────────────────────────────────────────────── */

    let lastWhy = null;
    function why() { return lastWhy; }

    /* A code, NAMED: normalised, recognised, and registered with proj4 if it had to be. This is the
       whole of 「can this be transformed」 and it is asked once per CALL rather than once per
       position, which is why it is separate from movePoint below. The order of the refusals is the
       order they were in when transformGeometry was the only caller — a code that is not a code, a
       code that IS 4326 (no work to do), no library, no definition. */
    /* 「is this code WGS 84 in degrees」, asked by name. The three spellings were already written out
       inline in four places in this file; js/gis-warp.js would have been the fifth, and a fifth copy
       of a list is the drift .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids. ⚠ It needs no
       library — it is a question about the CODE — so it answers before and after ready() alike. */
    function isWgs84(code) {
      const c = normalise(code);
      return c === WGS84 || c === 'CRS84' || c === 'WGS84';
    }

    function prepare(code) {
      const c = normalise(code);
      if (!c) return { ok: false, why: WHY.codeMissing };
      if (isWgs84(c)) return { ok: true, code: WGS84, wgs84: true };
      if (!available()) return { ok: false, why: WHY.unavailable };
      if (!register(c)) return { ok: false, why: WHY.unknown };
      return { ok: true, code: c, wgs84: false };
    }

    /* ⚠ THE ONE PLACE A PAIR OF NUMBERS IS ACTUALLY MOVED. Both codes are already prepared, so this
       is arithmetic and a measurement of the answer — nothing here decides what a code MEANS. The
       axis check runs when the DESTINATION is degrees, because that is the end at which |lat| > 90
       is proof of a swap; the opposite direction checks its input at the entrance instead. */
    function movePoint(from, to, x, y) {
      let q;
      try { q = P4(from, to, [x, y]); } catch (_) { q = null; }
      if (!Array.isArray(q) || !isFinite(q[0]) || !isFinite(q[1])) return { ok: false, why: WHY.transformFailed };
      if (to === WGS84 && Math.abs(q[1]) > LAT_MAX) return { ok: false, why: WHY.axisSuspect };
      return { ok: true, xy: [q[0], q[1]] };
    }

    function finite(v) { return typeof v === 'number' && isFinite(v); }

    /* ── the two point doors (#R749) ──────────────────────────────────────────────────────────
       [x, y] in `fromCode` → [lng, lat], and back. They answer `null` with why() naming the refusal,
       like transformGeometry, because a caller handed a pair cannot tell a failed transform from a
       position at the origin. ⚠ A pair already in 4326 is returned AS IT IS rather than round-tripped
       through proj4: re-projecting a thing onto itself is a no-op that costs float64 noise, and a
       warp walking millions of pixels would accumulate it. */
    function toWgs84(x, y, fromCode) {
      lastWhy = null;
      if (!finite(x) || !finite(y)) { lastWhy = WHY.positionInvalid; return null; }
      const p = prepare(fromCode);
      if (!p.ok) { lastWhy = p.why; return null; }
      if (p.wgs84) {
        if (Math.abs(y) > LAT_MAX) { lastWhy = WHY.axisSuspect; return null; }
        return [x, y];
      }
      const m = movePoint(p.code, WGS84, x, y);
      if (!m.ok) { lastWhy = m.why; return null; }
      return m.xy;
    }

    function fromWgs84(lon, lat, toCode) {
      lastWhy = null;
      if (!finite(lon) || !finite(lat)) { lastWhy = WHY.positionInvalid; return null; }
      /* ⚠ GUARDING THE INPUT, for the reason the header gives: going OUT of degrees there is no
         answer to measure — a northing handed over as a 「latitude」 projects to a perfectly finite
         pair that is simply somewhere else, and this is the last place it is still recognisable. */
      if (Math.abs(lat) > LAT_MAX) { lastWhy = WHY.axisSuspect; return null; }
      const p = prepare(toCode);
      if (!p.ok) { lastWhy = p.why; return null; }
      if (p.wgs84) return [lon, lat];
      const m = movePoint(WGS84, p.code, lon, lat);
      if (!m.ok) { lastWhy = m.why; return null; }
      return m.xy;
    }

    /* geometry → the same geometry in EPSG:4326, or null with why() naming the refusal.
       A geometry already in 4326 is returned as it is: re-projecting a thing onto itself is a
       no-op that costs float64 noise. */
    function transformGeometry(geometry, fromCode) {
      lastWhy = null;
      if (!geometry || typeof geometry !== 'object') { lastWhy = WHY.geometryMissing; return null; }
      const prep = prepare(fromCode);
      if (!prep.ok) { lastWhy = prep.why; return null; }
      if (prep.wgs84) return geometry;
      const c = prep.code;

      if (geometry.type === 'GeometryCollection') {
        const subs = [];
        for (const sub of (geometry.geometries || [])) {
          const t = transformGeometry(sub, c);
          if (t === null) return null;
          subs.push(t);
        }
        return Object.assign({}, geometry, { geometries: subs });
      }
      if (geometry.coordinates == null) { lastWhy = WHY.geometryMissing; return null; }

      let failed = null;
      const out = mapPositions(geometry.coordinates, (p) => {
        /* ⚠ THE AXIS CHECK LIVES IN movePoint, on the ANSWER rather than on the definition. A pair
           that arrived the other way round transforms without complaint — it is simply somewhere
           else afterwards. A latitude outside ±90 cannot be a latitude, so the measurement is what
           catches it, and it is the same measurement the two point doors above make. */
        const m = movePoint(c, WGS84, p[0], p[1]);
        if (!m.ok) { failed = failed || m.why; return null; }
        const r = [m.xy[0], m.xy[1]];
        for (let i = 2; i < p.length; i++) r.push(p[i]);
        return r;
      });
      if (out === null) { lastWhy = failed || WHY.transformFailed; return null; }
      return Object.assign({}, geometry, { coordinates: out });
    }

    /* features → {ok:true, features, moved} with every geometry in EPSG:4326, or a named refusal.
       `moved` counts the features whose coordinates actually changed hands, so a caller can say
       「2,431 件を EPSG:3857 から変換した」 rather than claiming a transform that was a no-op. */
    function transformFeatures(features, fromCode) {
      const list = Array.isArray(features) ? features : null;
      if (!list) return { ok: false, why: WHY.featuresMissing };
      const prep = prepare(fromCode);
      /* ⚠ THE DETAIL STILL CARRIES THE NORMALISED CODE for the two refusals that used to build it
         by hand, so a caller printing 「EPSG:6675 は読めない」 is handed the same string as before. */
      if (!prep.ok) {
        if (prep.why === WHY.codeMissing) return { ok: false, why: prep.why };
        return { ok: false, why: prep.why, detail: { crs: normalise(fromCode) } };
      }
      if (prep.wgs84) return { ok: true, features: list, moved: 0 };
      const c = prep.code;

      const out = [];
      let moved = 0;
      for (const f of list) {
        if (!f || !f.geometry) { out.push(f); continue; }
        const g = transformGeometry(f.geometry, c);
        /* ⚠ ONE BAD FEATURE FAILS THE FILE. Dropping it would leave the reader a map that is
           complete-looking and short, which is the shape this project keeps paying for; and an axis
           that is wrong for one feature is wrong for all of them. */
        if (g === null) return { ok: false, why: why() || WHY.transformFailed, detail: { crs: c, at: out.length } };
        out.push(Object.assign({}, f, { geometry: g }));
        moved++;
      }
      return { ok: true, features: out, moved: moved };
    }

    /* ── 「the file did not say」 is not 「the file is in degrees」 ────────────────────────────── */

    /* A delimited table states no coordinate system (js/geo-import.js § sourceCrs), and before this
       round its numbers went onto the map as if they were degrees. Whether they CAN be degrees is
       not a guess: |x| > 180 or |y| > 90 is outside the range of the unit, so one such position is
       proof that the pair is something else — a projected grid in metres, most often. That is a
       MEASUREMENT, and it is reported as one: the count, the total it was taken over, and the first
       position that failed, so the caller refuses with evidence rather than with an opinion.
       ⚠ It needs no library. The converse is NOT claimed anywhere: everything in range may still be
       a projected grid near its origin, and nothing here says otherwise. */
    function looksProjected(features) {
      const list = Array.isArray(features) ? features : [];
      let total = 0, outOfRange = 0, sample = null;
      for (const f of list) {
        const g = f && f.geometry;
        if (!g) continue;
        const walk = (node) => eachPosition(node, (p) => {
          total++;
          if (Math.abs(p[0]) > LON_MAX || Math.abs(p[1]) > LAT_MAX) {
            outOfRange++;
            if (!sample) sample = [p[0], p[1]];
          }
        });
        if (g.type === 'GeometryCollection') { for (const sub of (g.geometries || [])) if (sub) walk(sub.coordinates); }
        else walk(g.coordinates);
      }
      return { projected: outOfRange > 0, outOfRange: outOfRange, total: total, sample: sample };
    }

    /* ── 解析の平面 — the surface a measurement is made on (#R752) ───────────────────────────── */

    const D2R = Math.PI / 180, R2D = 180 / Math.PI;

    /* The DEFINING constants of WGS 84 (NIMA TR8350.2 / EPSG:7030 — a and 1/f are definitions of the
       datum, not measurements somebody took). They expire when the datum a code names stops being
       WGS 84, which for the 326NN/327NN block is never: the block IS 「WGS 84 / UTM zone NN」. */
    const ELL_A = 6378137, ELL_F = 1 / 298.257223563;

    /* The one radius this app has, asked of the module that owns it rather than written again here —
       js/gis-ops.js refuses to write 6371 for the same reason. ⚠ A refusal rather than a fallback:
       a sphere this file invented would silently disagree with every km² the rest of the app prints. */
    function sphereRadiusM() {
      let g = null;
      try { g = window.IntMapGeodesy; } catch (_) { g = null; }
      const km = g && g._R_EARTH_KM;
      return (typeof km === 'number' && isFinite(km) && km > 0) ? km * 1000 : null;
    }

    /* Into [-180, 180). ⚠ ITS JOB IS DIFFERENCES, not positions: a plane centred on the seam has to
       see 179.9 and -179.9 as two tenths apart rather than as most of the world. The two ends land on
       -180 together because they are one meridian; a plane that cares which side of the cut a
       position was written on must therefore NOT put a position through this — see the note in
       buildWebMercator().forward. */
    function wrapLon(d) {
      return ((d + 180) % 360 + 360) % 360 - 180;
    }
    function clamp1(v) { return v > 1 ? 1 : (v < -1 ? -1 : v); }

    /* ── the four planes, each one arithmetic ──────────────────────────────────────────────────
       ⚠ NO GRID-ZONE EXCEPTIONS. 32V being widened over south-west Norway and the 31X/33X/35X/37X
       merge over Svalbard are properties of the MGRS grid-zone designation, not of EPSG:326NN, whose
       area of use is the plain six-degree band. Writing them in here would be four cases in a
       formula — .agents/rules/no-ad-hoc-hardcoding.md §1 — and would disagree with the code's own
       definition. */

    function utmZoneOf(lon) {
      const z = Math.floor((wrapLon(lon) + 180) / 6) + 1;
      return z > 60 ? 60 : (z < 1 ? 1 : z);
    }
    function utmCode(zone, south) {
      return 'EPSG:32' + (south ? '7' : '6') + (zone < 10 ? '0' : '') + zone;
    }

    function buildUtm(params) {
      const zone = Math.round(Number(params.zone));
      if (!(zone >= 1 && zone <= 60)) return null;
      const south = !!params.south;
      /* EPSG's parameters for the block, the same ones utmDefinition() hands proj4 above. */
      const k0 = 0.9996, E0 = 500000, N0 = south ? 10000000 : 0;
      const lon0 = (zone - 1) * 6 - 177;
      const a = ELL_A, e2 = ELL_F * (2 - ELL_F), ep2 = e2 / (1 - e2);
      const e4 = e2 * e2, e6 = e4 * e2;
      /* Snyder (USGS PP1395) 8-, 9-. ⚠ MEASURED against proj4's etmerc over zone 54 on a 41×41
         lattice: 0.76 mm worst between 20°N and 60°N, 0.95 mm over the whole stated extent, and the
         forward/inverse round trip closes to 0.84 mm. The truncated series is what degrades away
         from the central meridian, which is what `extent` below is for; inside the zone it is
         smaller than any coordinate this app is ever handed. */
      const M0 = 1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256;
      const M2 = 3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024;
      const M4 = 15 * e4 / 256 + 45 * e6 / 1024;
      const M6 = 35 * e6 / 3072;
      const arc = (phi) => a * (M0 * phi - M2 * Math.sin(2 * phi) + M4 * Math.sin(4 * phi) - M6 * Math.sin(6 * phi));

      return {
        kind: 'utm', code: utmCode(zone, south), spec: { kind: 'utm', zone: zone, south: south },
        params: { zone: zone, south: south, lon0: lon0, k0: k0 },
        unit: 'm',
        /* EPSG's own area of use for the block: the six-degree band, equator to 84°N / 80°S to the
           equator. The band is arithmetic; the two latitudes are EPSG's statement about the block. */
        extent: [lon0 - 3, south ? -80 : 0, lon0 + 3, south ? 0 : 84],
        seamLon: null,
        preserves: { area: false, angle: true, distance: false },
        forward(lng, lat) {
          if (!finite(lng) || !finite(lat) || Math.abs(lat) > LAT_MAX) return null;
          const phi = lat * D2R, dl = wrapLon(lng - lon0) * D2R;
          const sp = Math.sin(phi), cp = Math.cos(phi), tp = Math.tan(phi);
          const N = a / Math.sqrt(1 - e2 * sp * sp), T = tp * tp, C = ep2 * cp * cp, A = cp * dl;
          const A2 = A * A, A3 = A2 * A, A4 = A2 * A2, A5 = A4 * A, A6 = A4 * A2;
          const x = E0 + k0 * N * (A + (1 - T + C) * A3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A5 / 120);
          const y = N0 + k0 * (arc(phi) + N * tp * (A2 / 2 + (5 - T + 9 * C + 4 * C * C) * A4 / 24
            + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A6 / 720));
          return (isFinite(x) && isFinite(y)) ? [x, y] : null;
        },
        inverse(x, y) {
          if (!finite(x) || !finite(y)) return null;
          const M = (y - N0) / k0, mu = M / (a * M0);
          const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
          const e1_2 = e1 * e1, e1_3 = e1_2 * e1, e1_4 = e1_2 * e1_2;
          const phi1 = mu + (3 * e1 / 2 - 27 * e1_3 / 32) * Math.sin(2 * mu)
            + (21 * e1_2 / 16 - 55 * e1_4 / 32) * Math.sin(4 * mu)
            + (151 * e1_3 / 96) * Math.sin(6 * mu) + (1097 * e1_4 / 512) * Math.sin(8 * mu);
          const sp = Math.sin(phi1), cp = Math.cos(phi1), tp = Math.tan(phi1);
          if (Math.abs(cp) < 1e-12) return null;              /* the pole has no inverse here */
          const C1 = ep2 * cp * cp, T1 = tp * tp;
          const N1 = a / Math.sqrt(1 - e2 * sp * sp);
          const R1 = a * (1 - e2) / Math.pow(1 - e2 * sp * sp, 1.5);
          const D = (x - E0) / (N1 * k0);
          const D2 = D * D, D3 = D2 * D, D4 = D2 * D2, D5 = D4 * D, D6 = D4 * D2;
          const phi = phi1 - (N1 * tp / R1) * (D2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D4 / 24
            + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D6 / 720);
          const dl = (D - (1 + 2 * T1 + C1) * D3 / 6
            + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D5 / 120) / cp;
          const latOut = phi * R2D, lngOut = wrapLon(lon0 + dl * R2D);
          if (!isFinite(latOut) || !isFinite(lngOut) || Math.abs(latOut) > LAT_MAX) return null;
          return [lngOut, latOut];
        },
        /* metres per radian along the parallel and along the meridian, on this plane's own
           ellipsoid — the denominator every distortion figure is measured against. */
        metric(lat) {
          const sp = Math.sin(lat * D2R), cp = Math.cos(lat * D2R), w = 1 - e2 * sp * sp;
          return [a / Math.sqrt(w) * cp, a * (1 - e2) / Math.pow(w, 1.5)];
        },
      };
    }

    function buildWebMercator() {
      /* ⚠ EPSG:3857 IS DEFINED ON A SPHERE OF THE WGS 84 SEMI-MAJOR AXIS while its coordinates are
         fed ellipsoidal latitudes — that mismatch is the definition of the code, not a shortcut, and
         is why the same position is ~20 km from EPSG:3395. Using the app's own radius here would be
         a different projection wearing this code's name. */
      const R = ELL_A;
      const latMax = (2 * Math.atan(Math.exp(Math.PI)) - Math.PI / 2) * R2D;   /* where y = ±πR — derived */
      return {
        kind: 'webmercator', code: 'EPSG:3857', spec: { kind: 'webmercator' },
        params: { lon0: 0, R: R }, unit: 'm',
        extent: [-180, -latMax, 180, latMax],
        seamLon: 180,
        preserves: { area: false, angle: true, distance: false },
        forward(lng, lat) {
          if (!finite(lng) || !finite(lat) || Math.abs(lat) >= LAT_MAX) return null;
          const y = R * Math.log(Math.tan(Math.PI / 4 + lat * D2R / 2));
          /* ⚠ THE LONGITUDE IS NOT WRAPPED, AND THAT IS MEASURED. x = Rλ is the whole of this
             projection, so wrapping first moves -180 to the far edge of the sheet: measured against
             fromWgs84() through proj4, wrapping disagreed by 4.01e7 m — a whole world — at exactly
             the antimeridian and by 4e-9 m everywhere else. It also breaks the one input that
             legitimately leaves the range: js/gis-geometry.js unwraps a ring across the seam before
             handing it on, and each of those positions is on the side it says it is on. */
          const x = R * lng * D2R;
          return (isFinite(x) && isFinite(y)) ? [x, y] : null;
        },
        inverse(x, y) {
          if (!finite(x) || !finite(y)) return null;
          /* The inverse DOES canonicalise, because what it returns is a position and this module
             emits positions in range. A sheet is periodic; ±180 come back as one meridian. */
          const lng = wrapLon(x / R * R2D), lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * R2D;
          if (!isFinite(lat) || Math.abs(lat) > LAT_MAX) return null;
          return [lng, lat];
        },
        metric(lat) { return [R * Math.cos(lat * D2R), R]; },
      };
    }

    function buildMollweide(params, R) {
      const lon0 = finite(params.lon0) ? wrapLon(params.lon0) : 0;
      const K = 2 * Math.SQRT2 / Math.PI;
      return {
        kind: 'mollweide',
        /* ESRI:54009 「World Mollweide」 is that authority's assignment for the central meridian at
           Greenwich. A plane centred anywhere else is the same projection and has no published code,
           so it says so by carrying null rather than borrowing one. */
        code: lon0 === 0 ? 'ESRI:54009' : null,
        spec: { kind: 'mollweide', lon0: lon0 },
        params: { lon0: lon0, R: R }, unit: 'm',
        extent: [-180, -90, 180, 90],
        seamLon: wrapLon(lon0 + 180),
        preserves: { area: true, angle: false, distance: false },
        forward(lng, lat) {
          if (!finite(lng) || !finite(lat) || Math.abs(lat) > LAT_MAX) return null;
          const phi = lat * D2R;
          let th;
          if (Math.abs(Math.abs(phi) - Math.PI / 2) < 1e-10) th = phi > 0 ? Math.PI / 2 : -Math.PI / 2;
          else {
            /* 2θ + sin 2θ = π sin φ has no closed form; Newton from θ = φ settles in ~5 steps away
               from the poles, and the pole is the case above where the derivative vanishes. */
            th = phi;
            for (let i = 0; i < 20; i++) {
              const d = 2 + 2 * Math.cos(2 * th);
              if (Math.abs(d) < 1e-12) break;
              const step = (2 * th + Math.sin(2 * th) - Math.PI * Math.sin(phi)) / d;
              th -= step;
              if (Math.abs(step) < 1e-14) break;
            }
          }
          const x = R * K * (wrapLon(lng - lon0) * D2R) * Math.cos(th);
          const y = R * Math.SQRT2 * Math.sin(th);
          return (isFinite(x) && isFinite(y)) ? [x, y] : null;
        },
        inverse(x, y) {
          if (!finite(x) || !finite(y)) return null;
          const s = y / (R * Math.SQRT2);
          if (Math.abs(s) > 1 + 1e-12) return null;
          const th = Math.asin(clamp1(s));
          const sinPhi = (2 * th + Math.sin(2 * th)) / Math.PI;
          if (Math.abs(sinPhi) > 1 + 1e-12) return null;
          const lat = Math.asin(clamp1(sinPhi)) * R2D;
          const c = Math.cos(th);
          if (Math.abs(c) < 1e-12) return [wrapLon(lon0), lat];
          const dl = (x / (R * K * c)) * R2D;
          /* ⚠ OUTSIDE THE ELLIPSE IS REFUSED, NOT WRAPPED. wrapLon() would fold a point that is on
             no part of this map into a perfectly ordinary longitude. */
          if (!isFinite(dl) || Math.abs(dl) > 180 + 1e-9) return null;
          return [wrapLon(lon0 + dl), lat];
        },
        metric(lat) { return [R * Math.cos(lat * D2R), R]; },
      };
    }

    function buildAeqd(params, R) {
      if (!finite(params.lon0) || !finite(params.lat0)) return null;
      const lon0 = wrapLon(params.lon0), lat0 = params.lat0;
      if (Math.abs(lat0) > LAT_MAX) return null;
      const p1 = lat0 * D2R, sp1 = Math.sin(p1), cp1 = Math.cos(p1);
      return {
        kind: 'aeqd', code: null, spec: { kind: 'aeqd', lon0: lon0, lat0: lat0 },
        params: { lon0: lon0, lat0: lat0, R: R }, unit: 'm',
        /* ⚠ THE WHOLE SPHERE, AND THAT IS NOT A CLAIM THAT IT IS EVERYWHERE SUITABLE. The extent of
           an azimuthal plane is not a box — distortion grows with distance from the centre and the
           antipode is a circle, not a point — so `assess()` will report 0 positions outside and the
           DISTORTION is the only measurement that means anything here. Both are in its answer. */
        extent: [-180, -90, 180, 90],
        seamLon: null,
        /* true along the radii through the centre, and nowhere else — a boolean would be a lie in
           one direction whichever way it was written. */
        preserves: { area: false, angle: false, distance: 'from-centre' },
        forward(lng, lat) {
          if (!finite(lng) || !finite(lat) || Math.abs(lat) > LAT_MAX) return null;
          const phi = lat * D2R, dl = wrapLon(lng - lon0) * D2R;
          const cosc = clamp1(sp1 * Math.sin(phi) + cp1 * Math.cos(phi) * Math.cos(dl));
          const c = Math.acos(cosc);
          if (Math.PI - c < 1e-9) return null;                 /* the antipode is a circle, not a point */
          const k = (c < 1e-12) ? 1 : c / Math.sin(c);
          const x = R * k * Math.cos(phi) * Math.sin(dl);
          const y = R * k * (cp1 * Math.sin(phi) - sp1 * Math.cos(phi) * Math.cos(dl));
          return (isFinite(x) && isFinite(y)) ? [x, y] : null;
        },
        inverse(x, y) {
          if (!finite(x) || !finite(y)) return null;
          const rho = Math.hypot(x, y);
          if (rho < 1e-12) return [wrapLon(lon0), lat0];
          const c = rho / R;
          if (c > Math.PI + 1e-9) return null;                 /* further than half the world away */
          const sc = Math.sin(c), cc = Math.cos(c);
          const lat = Math.asin(clamp1(cc * sp1 + y * sc * cp1 / rho)) * R2D;
          const lng = wrapLon(lon0 + Math.atan2(x * sc, rho * cc * cp1 - y * sc * sp1) * R2D);
          if (!isFinite(lat) || !isFinite(lng)) return null;
          return [lng, lat];
        },
        metric(lat) { return [R * Math.cos(lat * D2R), R]; },
      };
    }

    /* ⚠ ONE TABLE. `projections()` hands out its keys and `projection()` dispatches on the same
       keys, so a plane that is declared is a plane that can be built — the shape js/gis-ops.js uses
       for DECL/RUN, and the reason there is no second list for a panel to keep. `needs` is what a
       spec must carry beyond the kind; `sphere` says whether the plane is drawn on the app's radius
       (and therefore whether it can exist at all without js/geodesy.js). */
    const PLANES = {
      utm: { needs: ['zone', 'south'], sphere: false, build: (p) => buildUtm(p) },
      webmercator: { needs: [], sphere: false, build: () => buildWebMercator() },
      mollweide: { needs: [], sphere: true, build: (p, R) => buildMollweide(p, R) },
      aeqd: { needs: ['lon0', 'lat0'], sphere: true, build: (p, R) => buildAeqd(p, R) },
    };

    function projections() {
      return Object.keys(PLANES).map((kind) => ({
        kind: kind,
        needs: PLANES[kind].needs.slice(),
        /* built once so the catalogue states the THEORY from the same object a caller would get,
           rather than from a second description of it. A plane whose radius is unavailable still
           declares what it would preserve. */
        preserves: (function () {
          const probe = PLANES[kind].build(kind === 'utm' ? { zone: 1, south: false } : { lon0: 0, lat0: 0 }, sphereRadiusM() || 1);
          return probe ? probe.preserves : null;
        })(),
      }));
    }

    /* A code or a {kind, …} object → the parameters a plane is built from. ⚠ Codes are recognised by
       the RULE that assigns them (the 326NN/327NN arithmetic, ESRI's 54009, EPSG's 3857) and never by
       a near miss: an unrecognised code is `crs-plane-unknown`, the same way an unrecognised source
       code is `crs-unknown` above. */
    function planeSpec(spec) {
      if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
        const kind = String(spec.kind || '').toLowerCase();
        if (!PLANES[kind]) return { ok: false, why: WHY.planeUnknown };
        for (const need of PLANES[kind].needs) {
          if (spec[need] == null) return { ok: false, why: WHY.planeParamsMissing, detail: { kind: kind, needs: PLANES[kind].needs.slice() } };
        }
        return { ok: true, kind: kind, params: spec };
      }
      const c = normalise(spec);
      if (!c) return { ok: false, why: WHY.codeMissing };
      /* ⚠ DEGREES ARE NOT A PLANE. 4326 is the coordinate system everything here is expressed in,
         and measuring an area on it is the cos φ error docs/GIS-CORE.md §2.4 names — 「緯度 60° で
         半分」. Answering it as a plane would make that error selectable. */
      if (isWgs84(c)) return { ok: false, why: WHY.planeIsDegrees };
      const utm = /^EPSG:32(6|7)(\d\d)$/.exec(c);
      if (utm) {
        const zone = Number(utm[2]);
        if (!(zone >= 1 && zone <= 60)) return { ok: false, why: WHY.planeUnknown };
        return { ok: true, kind: 'utm', params: { zone: zone, south: utm[1] === '7' } };
      }
      if (c === 'EPSG:3857') return { ok: true, kind: 'webmercator', params: {} };
      if (c === 'ESRI:54009') return { ok: true, kind: 'mollweide', params: { lon0: 0 } };
      return { ok: false, why: WHY.planeUnknown };
    }

    /* spec → a plane, or null with why() naming the refusal — the contract the point doors above
       have, for the same reason: a caller handed a null cannot tell a missing library from a code
       nobody recognised, so the reason is asked for by name. */
    function projection(spec) {
      lastWhy = null;
      const s = planeSpec(spec);
      if (!s.ok) { lastWhy = s.why; return null; }
      const decl = PLANES[s.kind];
      let R = null;
      if (decl.sphere) {
        R = sphereRadiusM();
        if (R == null) { lastWhy = WHY.radiusUnavailable; return null; }
      }
      const P = decl.build(s.params, R);
      if (!P) { lastWhy = WHY.planeParamsMissing; return null; }
      P.plane = true;
      return P;
    }

    function isProjection(P) {
      return !!(P && P.plane === true && typeof P.forward === 'function' && typeof P.inverse === 'function'
        && typeof P.metric === 'function' && Array.isArray(P.extent));
    }

    /* ── how wrong is this plane HERE ──────────────────────────────────────────────────────────
       The Jacobian of the projection against the local metric of its own datum, by central
       difference. ⚠ DERIVED FROM THE PROJECTION rather than written down per projection: the day a
       fifth plane is added it is measured by this same instrument, and no table anywhere says what
       it preserves. Returns Tissot's two axes (max/min linear scale) and the area scale, all as
       ratios — 1 is 「true here」.
       h = 1e-6 rad ≈ 6 m: large enough that the difference of two ~1e6 m coordinates keeps ~9
       significant digits in float64, small enough that the second-order term is ~1e-12. Measured
       round-trip stability of areaScale against h = 1e-5 and 1e-7: agreement to 1e-9. */
    const JAC_H = 1e-6;
    function distortionAt(P, lng, lat) {
      if (!isProjection(P)) { lastWhy = WHY.planeMissing; return null; }
      if (!finite(lng) || !finite(lat)) { lastWhy = WHY.positionInvalid; return null; }
      const hDeg = JAC_H * R2D;
      const [hLon, hLat] = P.metric(lat);
      if (!(hLon > 0) || !(hLat > 0)) { lastWhy = WHY.extentUnmeasurable; return null; }   /* the poles */
      const pair = (a, b) => {
        const p = P.forward(a[0], a[1]), q = P.forward(b[0], b[1]);
        return (p && q) ? [(p[0] - q[0]), (p[1] - q[1])] : null;
      };
      const dLambda = pair([lng + hDeg, lat], [lng - hDeg, lat]);
      /* one-sided at the poles, where a centred difference would step off the sphere */
      const up = lat + hDeg > LAT_MAX, down = lat - hDeg < -LAT_MAX;
      const dPhi = (up || down)
        ? pair([lng, up ? lat : lat + hDeg], [lng, up ? lat - hDeg : lat])
        : pair([lng, lat + hDeg], [lng, lat - hDeg]);
      if (!dLambda || !dPhi) { lastWhy = WHY.projectionFailed; return null; }
      const span = (up || down) ? JAC_H : 2 * JAC_H;
      const xl = dLambda[0] / (2 * JAC_H), yl = dLambda[1] / (2 * JAC_H);
      const xp = dPhi[0] / span, yp = dPhi[1] / span;
      const k = Math.hypot(xl, yl) / hLon;                 /* along the parallel */
      const h = Math.hypot(xp, yp) / hLat;                 /* along the meridian */
      const det = Math.abs(xl * yp - yl * xp) / (hLon * hLat);
      if (!(k > 0) || !(h > 0) || !isFinite(det)) { lastWhy = WHY.extentUnmeasurable; return null; }
      const sinT = clamp1(det / (h * k));
      const aPlusB = Math.sqrt(Math.max(0, h * h + k * k + 2 * h * k * sinT));
      const aMinusB = Math.sqrt(Math.max(0, h * h + k * k - 2 * h * k * sinT));
      return {
        areaScale: det, maxScale: (aPlusB + aMinusB) / 2, minScale: (aPlusB - aMinusB) / 2,
        meridianScale: h, parallelScale: k, unit: 'ratio',
      };
    }

    /* ── what a dataset does to a plane, and what the plane does to it ─────────────────────────
       features[] | geometry | [w,s,e,n] → the positions' bounding box, because everything below is
       measured over the DATA rather than over the world. */
    function bboxOf(input) {
      if (Array.isArray(input) && input.length === 4 && input.every(finite)) {
        return { w: Math.min(input[0], input[2]), s: Math.min(input[1], input[3]), e: Math.max(input[0], input[2]), n: Math.max(input[1], input[3]), total: 4 };
      }
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity, total = 0;
      const take = (p) => { total++; if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; };
      const walkGeom = (g) => {
        if (!g) return;
        if (g.type === 'GeometryCollection') { for (const sub of (g.geometries || [])) walkGeom(sub); return; }
        eachPosition(g.coordinates, take);
      };
      if (Array.isArray(input)) for (const f of input) walkGeom(f && (f.geometry || (f.type ? f : null)));
      else walkGeom(input);
      if (!total) return null;
      return { w: w, s: s, e: e, n: n, total: total };
    }

    /* The 3×3 lattice over a box — corners, edge midpoints, centre. ⚠ NOT A SAMPLE SIZE SOMEBODY
       TYPED: for every plane here the distortion is monotone away from its centre or its standard
       line, so the extremes over a box are attained on its boundary, and this lattice touches every
       side and both diagonals of it. It is derived from the reader's own data. */
    function latticeOf(b) {
      const out = [];
      for (const lat of [b.s, (b.s + b.n) / 2, b.n]) {
        for (const lng of [b.w, (b.w + b.e) / 2, b.e]) out.push([lng, lat]);
      }
      return out;
    }

    /* ⚠ THE ANSWER IS A MEASUREMENT, NOT A VERDICT — the same shape looksProjected() has, and for the
       same reason: 「この投影でよいか」 is the caller's decision and nothing here may make it. It
       returns how many positions left the plane's stated area of use, by how far, which one first,
       and what the plane does to the data's own box.
       ⚠ `outside: 0` IS NOT A CLAIM OF SUITABILITY. A whole-world extent (Mollweide, azimuthal) can
       never report anything else; the distortion figures are the measurement that means something
       there, which is why both are in one answer and neither is returned alone. */
    function assess(P, input) {
      lastWhy = null;
      if (!isProjection(P)) { lastWhy = WHY.planeMissing; return null; }
      const box = bboxOf(input);
      if (!box) { lastWhy = WHY.geometryMissing; return null; }

      const ex = P.extent;
      const spanLon = ex[2] - ex[0];
      /* A plane whose extent is the whole turn has no outside to be on, and says so as 180 rather
         than as half of 360 — the wrap below folds every position into that half otherwise. */
      const halfLon = spanLon >= 360 ? 180 : spanLon / 2;
      const midLon = ex[0] + spanLon / 2;
      let total = 0, outside = 0, unprojectable = 0, sample = null;
      const beyond = { west: 0, east: 0, south: 0, north: 0 };
      const test = (p) => {
        total++;
        const dLon = wrapLon(p[0] - midLon);
        const overE = Math.max(0, dLon - halfLon), overW = Math.max(0, -dLon - halfLon);
        const overN = Math.max(0, p[1] - ex[3]), overS = Math.max(0, ex[1] - p[1]);
        if (overE > beyond.east) beyond.east = overE;
        if (overW > beyond.west) beyond.west = overW;
        if (overN > beyond.north) beyond.north = overN;
        if (overS > beyond.south) beyond.south = overS;
        if (overE > 0 || overW > 0 || overN > 0 || overS > 0) {
          outside++;
          if (!sample) sample = [p[0], p[1]];
        }
        if (!P.forward(p[0], p[1])) unprojectable++;
      };
      const walkGeom = (g) => {
        if (!g) return;
        if (g.type === 'GeometryCollection') { for (const sub of (g.geometries || [])) walkGeom(sub); return; }
        eachPosition(g.coordinates, test);
      };
      if (Array.isArray(input) && input.length === 4 && input.every(finite)) {
        for (const p of latticeOf(box)) test(p);
      } else if (Array.isArray(input)) {
        for (const f of input) walkGeom(f && (f.geometry || (f.type ? f : null)));
      } else walkGeom(input);

      const d = distortionOver(P, box);
      return {
        plane: P.code || P.kind, spec: P.spec,
        total: total, outside: outside, unprojectable: unprojectable,
        /* degrees, and they are the OVERSHOOT rather than the position — 「1.4° 東にはみ出している」
           is what a reader can act on, and the first offending position is there to look at. */
        beyond: beyond, beyondUnit: 'deg', sample: sample,
        bbox: [box.w, box.s, box.e, box.n], extent: P.extent.slice(),
        areaScale: d ? d.areaScale : null, scale: d ? d.scale : null,
        measuredAt: d ? d.at : 0,
      };
    }

    /* min/max of the distortion figures over the lattice of a box. Positions the plane cannot take
       are skipped and counted rather than zeroed: an antipode is not a distortion of 0. */
    function distortionOver(P, box) {
      let aMin = Infinity, aMax = -Infinity, sMin = Infinity, sMax = -Infinity, at = 0;
      for (const p of latticeOf(box)) {
        const d = distortionAt(P, p[0], p[1]);
        if (!d) continue;
        at++;
        if (d.areaScale < aMin) aMin = d.areaScale;
        if (d.areaScale > aMax) aMax = d.areaScale;
        if (d.minScale < sMin) sMin = d.minScale;
        if (d.maxScale > sMax) sMax = d.maxScale;
      }
      lastWhy = null;
      if (!at) return null;
      return { areaScale: { min: aMin, max: aMax }, scale: { min: sMin, max: sMax }, at: at };
    }

    /* ── 勧めるが、選ばない ────────────────────────────────────────────────────────────────────
       Every declared plane, parameterised from the reader's own data, ranked by a MEASUREMENT of the
       thing the caller said it is for. ⚠ It returns a ranked list and never a choice: the caller
       picks, and a plane picked silently is a unit nobody said out loud.
       `purpose` is 'area' (default) | 'shape' | 'distance', and it changes only what is measured —
       the score is |ln| of the relevant ratio at its worst over the lattice, so 0 is 「true
       everywhere over this data」 and the number is readable as a fractional error. */
    function suggest(input, options) {
      lastWhy = null;
      const opts = options || {};
      /* The three questions a plane can be true for, which is what `preserves` has three keys for.
         A fourth word is not a rounding of one of these — it is a caller meaning something this
         module cannot measure, and it is refused by its own name rather than answered. */
      const purpose = String(opts.purpose || 'area');
      if (['area', 'shape', 'distance'].indexOf(purpose) < 0) { lastWhy = WHY.purposeUnknown; return null; }
      const box = bboxOf(input);
      if (!box) { lastWhy = WHY.geometryMissing; return null; }
      const midLon = wrapLon(box.w + (box.e - box.w) / 2), midLat = (box.s + box.n) / 2;

      /* The parameters come from the data — the zone the middle of it falls in, the hemisphere it is
         in, the meridian it is centred on — so no candidate is a place somebody once wrote down. */
      const specs = Object.keys(PLANES).map((kind) => {
        if (kind === 'utm') return { kind: 'utm', zone: utmZoneOf(midLon), south: midLat < 0 };
        if (kind === 'mollweide') return { kind: 'mollweide', lon0: midLon };
        if (kind === 'aeqd') return { kind: 'aeqd', lon0: midLon, lat0: midLat };
        return { kind: kind };
      });

      const candidates = [];
      for (const spec of specs) {
        const P = projection(spec);
        if (!P) continue;                       /* e.g. a sphere plane with no radius available */
        const a = assess(P, [box.w, box.s, box.e, box.n]);
        if (!a || !a.areaScale) continue;
        let score;
        if (purpose === 'area') score = Math.max(Math.abs(Math.log(a.areaScale.min)), Math.abs(Math.log(a.areaScale.max)));
        else if (purpose === 'shape') score = Math.abs(Math.log(a.scale.max / a.scale.min));
        else score = Math.max(Math.abs(Math.log(a.scale.min)), Math.abs(Math.log(a.scale.max)));
        const reasons = [];
        if (a.outside > 0) reasons.push('outside-stated-extent');
        if (P.preserves[purpose === 'shape' ? 'angle' : purpose] === true) reasons.push('preserves-' + purpose);
        if (P.preserves.distance === 'from-centre') reasons.push('distance-true-from-centre-only');
        if (P.seamLon != null) reasons.push('has-seam');
        candidates.push({
          spec: P.spec, code: P.code, kind: P.kind, unit: P.unit,
          score: score, areaScale: a.areaScale, scale: a.scale,
          outside: a.outside, beyond: a.beyond,
          /* ⚠ MACHINE REASONS, NOT SENTENCES. A string here would be a user-visible string this
             module has no business authoring — CONSTITUTION.md §7 — and the panel that renders it
             owns the wording in the languages it owns. */
          reasons: reasons,
        });
      }
      /* A plane whose stated area of use the data leaves ranks below one it does not, however
         flattering its arithmetic is out there. */
      candidates.sort((x, y) => ((x.outside > 0) - (y.outside > 0)) || (x.score - y.score));
      return { bbox: [box.w, box.s, box.e, box.n], purpose: purpose, candidates: candidates };
    }

    /* ── measuring ON the plane ────────────────────────────────────────────────────────────────
       ⚠ THE UNIT IS IN THE ANSWER, ALWAYS. docs/GIS-CORE.md §2.4 has the app measuring in geodesic
       km²; these return whatever was asked for and say which it was, because a bare number that used
       to be km² and is now m² is a defect no test can see.
       ⚠ AND THE DISTORTION IS IN THE ANSWER TOO. A planar area is exactly as true as the plane is,
       and the caller cannot fail to receive that: `areaScale` comes back in the same object. */
    const AREA_UNITS = { m2: 1, km2: 1e6 };
    const LENGTH_UNITS = { m: 1, km: 1000 };

    /* A cylindrical plane has a meridian where the sheet is cut, and a ring that crosses it comes
       out as a shape spanning most of the map. The shoelace over that is a number — a wrong one, and
       a plausible one. So it is REFUSED, measured from the degrees where it is still visible.
       ⚠ Asked of the SEGMENT rather than of the box: a ring may span 350° of longitude legitimately
       (a polar cap), and the thing that breaks the sheet is an edge crossing the cut. */
    function crossesSeam(P, positions, closed) {
      if (P.seamLon == null) return null;
      const n = positions.length;
      /* ⚠ THE CLOSING EDGE COUNTS. shoelace() closes a ring whether or not the file did, so a ring
         written without its repeated first position would have one unexamined edge — and it is the
         edge most likely to be the long way round. */
      const last = closed && n > 2 ? n : n - 1;
      for (let i = 1; i <= last; i++) {
        const a = positions[i - 1], b = positions[i % n];
        const d = wrapLon(b[0] - a[0]);
        const u = wrapLon(P.seamLon - a[0]);
        if ((d > 0 && u > 0 && u < d) || (d < 0 && u < 0 && u > d)) return [b[0], b[1]];
      }
      return null;
    }

    /* Rings of a Polygon / MultiPolygon / GeometryCollection, flattened with their nesting kept:
       [[outer, hole…], …]. Anything that is not an area is refused by name rather than measured as 0. */
    function areaRings(geometry) {
      if (!geometry || typeof geometry !== 'object') return { ok: false, why: WHY.geometryMissing };
      if (geometry.type === 'GeometryCollection') {
        const all = [];
        for (const sub of (geometry.geometries || [])) {
          const r = areaRings(sub);
          if (!r.ok) return r;
          for (const poly of r.polygons) all.push(poly);
        }
        return { ok: true, polygons: all };
      }
      const c = geometry.coordinates;
      if (c == null) return { ok: false, why: WHY.geometryMissing };
      if (geometry.type === 'Polygon') return { ok: true, polygons: [c] };
      if (geometry.type === 'MultiPolygon') return { ok: true, polygons: c.slice() };
      return { ok: false, why: WHY.geometryNotAreal, detail: { type: geometry.type } };
    }

    function lineParts(geometry) {
      if (!geometry || typeof geometry !== 'object') return { ok: false, why: WHY.geometryMissing };
      if (geometry.type === 'GeometryCollection') {
        const all = [];
        for (const sub of (geometry.geometries || [])) {
          const r = lineParts(sub);
          if (!r.ok) return r;
          for (const part of r.parts) all.push(part);
        }
        return { ok: true, parts: all };
      }
      const c = geometry.coordinates;
      if (c == null) return { ok: false, why: WHY.geometryMissing };
      if (geometry.type === 'LineString') return { ok: true, parts: [c] };
      if (geometry.type === 'MultiLineString') return { ok: true, parts: c.slice() };
      return { ok: false, why: WHY.geometryNotLinear, detail: { type: geometry.type } };
    }

    function projectRing(P, ring) {
      const out = [];
      for (const p of (ring || [])) {
        if (!isPosition(p)) return { ok: false, why: WHY.positionInvalid };
        const q = P.forward(p[0], p[1]);
        if (!q) return { ok: false, why: WHY.projectionFailed, detail: { at: [p[0], p[1]] } };
        out.push(q);
      }
      if (out.length < 2) return { ok: false, why: WHY.geometryMissing };
      return { ok: true, xy: out };
    }

    function shoelace(xy) {
      let s = 0;
      for (let i = 0, n = xy.length; i < n; i++) {
        const a = xy[i], b = xy[(i + 1) % n];
        s += a[0] * b[1] - b[0] * a[1];
      }
      return Math.abs(s) / 2;
    }

    function areaOn(P, geometry, options) {
      lastWhy = null;
      if (!isProjection(P)) { lastWhy = WHY.planeMissing; return { ok: false, why: WHY.planeMissing }; }
      const unit = String((options && options.unit) || 'km2');
      if (!AREA_UNITS[unit]) { lastWhy = WHY.unitUnknown; return { ok: false, why: WHY.unitUnknown, detail: { unit: unit, known: Object.keys(AREA_UNITS) } }; }
      const rings = areaRings(geometry);
      if (!rings.ok) { lastWhy = rings.why; return rings.detail ? { ok: false, why: rings.why, detail: rings.detail } : { ok: false, why: rings.why }; }

      let m2 = 0;
      for (const poly of rings.polygons) {
        if (!Array.isArray(poly) || !poly.length) { lastWhy = WHY.geometryMissing; return { ok: false, why: WHY.geometryMissing }; }
        let outer = 0, holes = 0;
        for (let i = 0; i < poly.length; i++) {
          const seam = crossesSeam(P, poly[i] || [], true);
          if (seam) { lastWhy = WHY.planeSeamCrossed; return { ok: false, why: WHY.planeSeamCrossed, detail: { at: seam, seamLon: P.seamLon } }; }
          const pr = projectRing(P, poly[i]);
          if (!pr.ok) { lastWhy = pr.why; return { ok: false, why: pr.why, detail: pr.detail }; }
          const a = shoelace(pr.xy);
          if (i === 0) outer = a; else holes += a;
        }
        /* outer added, holes subtracted — the same rule ops.areaKm2 uses on the sphere. A hole
           bigger than its outer is a broken polygon, not a negative area. */
        m2 += Math.max(0, outer - holes);
      }
      const box = bboxOf(geometry);
      const d = box ? distortionOver(P, box) : null;
      lastWhy = null;
      return {
        ok: true, value: m2 / AREA_UNITS[unit], unit: unit,
        plane: P.code || P.kind, spec: P.spec,
        /* how true that number is HERE, measured rather than promised */
        areaScale: d ? d.areaScale : null, exact: P.preserves.area === true,
      };
    }

    function lengthOn(P, geometry, options) {
      lastWhy = null;
      if (!isProjection(P)) { lastWhy = WHY.planeMissing; return { ok: false, why: WHY.planeMissing }; }
      const unit = String((options && options.unit) || 'km');
      if (!LENGTH_UNITS[unit]) { lastWhy = WHY.unitUnknown; return { ok: false, why: WHY.unitUnknown, detail: { unit: unit, known: Object.keys(LENGTH_UNITS) } }; }
      const parts = lineParts(geometry);
      if (!parts.ok) { lastWhy = parts.why; return parts.detail ? { ok: false, why: parts.why, detail: parts.detail } : { ok: false, why: parts.why }; }

      let m = 0;
      for (const part of parts.parts) {
        const seam = crossesSeam(P, part || []);
        if (seam) { lastWhy = WHY.planeSeamCrossed; return { ok: false, why: WHY.planeSeamCrossed, detail: { at: seam, seamLon: P.seamLon } }; }
        const pr = projectRing(P, part);
        if (!pr.ok) { lastWhy = pr.why; return { ok: false, why: pr.why, detail: pr.detail }; }
        for (let i = 1; i < pr.xy.length; i++) m += Math.hypot(pr.xy[i][0] - pr.xy[i - 1][0], pr.xy[i][1] - pr.xy[i - 1][1]);
      }
      const box = bboxOf(geometry);
      const d = box ? distortionOver(P, box) : null;
      lastWhy = null;
      return {
        ok: true, value: m / LENGTH_UNITS[unit], unit: unit,
        plane: P.code || P.kind, spec: P.spec,
        scale: d ? d.scale : null, exact: false,
      };
    }

    /* (#R752) ⚠ THE VERSION OF THIS KERNEL. It was already an answer-bearing module — an import's
       coordinates are what this file transformed them into — and #R752 made it more so: `measure`
       asks it for areas and lengths on a plane the reader named, so a change to a projection's
       series changes numbers in a saved project. ⚠ The 4.01e7 m Web-Mercator seam defect found while
       writing that arithmetic is exactly the kind of edit this version exists to announce. The
       keeper is scripts/gis-kernel-versions.mjs. */
    const KERNEL_VERSION = 'crs-1';
    const API = {
      /* which implementation answered — see KERNEL_VERSION above */
      version: () => KERNEL_VERSION,
      ready, available,
      define, known, resolve, isWgs84,
      transformGeometry, transformFeatures, why,
      /* the two point doors js/gis-warp.js walks an output grid with (#R749) — a warp asks about
         POSITIONS, one per output pixel, and never about a geometry */
      toWgs84, fromWgs84,
      looksProjected,
      /* the analysis plane (#R752) — a surface to MEASURE on, chosen by the caller and never by
         this module. `projections()` is the catalogue, `projection()` builds one, `assess()` and
         `distortionAt()` measure how wrong it is over the reader's own data, `suggest()` ranks and
         does not choose, and the two measurements carry their unit. */
      projections, projection, isProjection,
      distortionAt, assess, suggest,
      areaOn, lengthOn,
      /* every code this module can refuse with, out of the one declaration that raises them */
      refusals,
      /* exposed because js/geo-import.js asks the same question about a code it read out of a file,
         and two spellings of 「is this 4326」 would drift — one rule, two readers */
      normalise, WGS84,
    };
    try { window.IntMapGisCrs = API; } catch (_) { }
    return API;
  })();
}
