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
      if (!c) return { ok: false, why: 'crs-code-missing' };
      const text = String(definition == null ? '' : definition).trim();
      if (!text) return { ok: false, why: 'crs-definition-missing' };
      const isProj = /(^|\s)\+proj=/.test(text);
      const isWkt = /^\s*(PROJCS|GEOGCS|PROJCRS|GEOGCRS|BOUNDCRS|COMPD_CS|COMPOUNDCRS|ENGCRS|LOCAL_CS)\b/i.test(text);
      if (!isProj && !isWkt) return { ok: false, why: 'crs-definition-unreadable' };
      if (!available()) { brought.set(c, text); return { ok: false, why: 'crs-unavailable' }; }
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
        return { ok: false, why: 'crs-definition-unreadable' };
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
      if (!c) return { ok: false, why: 'crs-code-missing' };
      if (isWgs84(c)) return { ok: true, code: WGS84, wgs84: true };
      if (!available()) return { ok: false, why: 'crs-unavailable' };
      if (!register(c)) return { ok: false, why: 'crs-unknown' };
      return { ok: true, code: c, wgs84: false };
    }

    /* ⚠ THE ONE PLACE A PAIR OF NUMBERS IS ACTUALLY MOVED. Both codes are already prepared, so this
       is arithmetic and a measurement of the answer — nothing here decides what a code MEANS. The
       axis check runs when the DESTINATION is degrees, because that is the end at which |lat| > 90
       is proof of a swap; the opposite direction checks its input at the entrance instead. */
    function movePoint(from, to, x, y) {
      let q;
      try { q = P4(from, to, [x, y]); } catch (_) { q = null; }
      if (!Array.isArray(q) || !isFinite(q[0]) || !isFinite(q[1])) return { ok: false, why: 'crs-transform-failed' };
      if (to === WGS84 && Math.abs(q[1]) > LAT_MAX) return { ok: false, why: 'crs-axis-suspect' };
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
      if (!finite(x) || !finite(y)) { lastWhy = 'crs-position-invalid'; return null; }
      const p = prepare(fromCode);
      if (!p.ok) { lastWhy = p.why; return null; }
      if (p.wgs84) {
        if (Math.abs(y) > LAT_MAX) { lastWhy = 'crs-axis-suspect'; return null; }
        return [x, y];
      }
      const m = movePoint(p.code, WGS84, x, y);
      if (!m.ok) { lastWhy = m.why; return null; }
      return m.xy;
    }

    function fromWgs84(lon, lat, toCode) {
      lastWhy = null;
      if (!finite(lon) || !finite(lat)) { lastWhy = 'crs-position-invalid'; return null; }
      /* ⚠ GUARDING THE INPUT, for the reason the header gives: going OUT of degrees there is no
         answer to measure — a northing handed over as a 「latitude」 projects to a perfectly finite
         pair that is simply somewhere else, and this is the last place it is still recognisable. */
      if (Math.abs(lat) > LAT_MAX) { lastWhy = 'crs-axis-suspect'; return null; }
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
      if (!geometry || typeof geometry !== 'object') { lastWhy = 'crs-geometry-missing'; return null; }
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
      if (geometry.coordinates == null) { lastWhy = 'crs-geometry-missing'; return null; }

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
      if (out === null) { lastWhy = failed || 'crs-transform-failed'; return null; }
      return Object.assign({}, geometry, { coordinates: out });
    }

    /* features → {ok:true, features, moved} with every geometry in EPSG:4326, or a named refusal.
       `moved` counts the features whose coordinates actually changed hands, so a caller can say
       「2,431 件を EPSG:3857 から変換した」 rather than claiming a transform that was a no-op. */
    function transformFeatures(features, fromCode) {
      const list = Array.isArray(features) ? features : null;
      if (!list) return { ok: false, why: 'crs-features-missing' };
      const prep = prepare(fromCode);
      /* ⚠ THE DETAIL STILL CARRIES THE NORMALISED CODE for the two refusals that used to build it
         by hand, so a caller printing 「EPSG:6675 は読めない」 is handed the same string as before. */
      if (!prep.ok) {
        if (prep.why === 'crs-code-missing') return { ok: false, why: prep.why };
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
        if (g === null) return { ok: false, why: why() || 'crs-transform-failed', detail: { crs: c, at: out.length } };
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

    const API = {
      ready, available,
      define, known, resolve, isWgs84,
      transformGeometry, transformFeatures, why,
      /* the two point doors js/gis-warp.js walks an output grid with (#R749) — a warp asks about
         POSITIONS, one per output pixel, and never about a geometry */
      toWgs84, fromWgs84,
      looksProjected,
      /* exposed because js/geo-import.js asks the same question about a code it read out of a file,
         and two spellings of 「is this 4326」 would drift — one rule, two readers */
      normalise, WGS84,
    };
    try { window.IntMapGisCrs = API; } catch (_) { }
    return API;
  })();
}
