/* ============================================================================
 *  IntMap · VENDOR — the third-party libraries, and the globals the app knows them by  (#R175)
 * ----------------------------------------------------------------------------
 *  Before this round these arrived as seven <script src="https://unpkg.com/…"> / jsDelivr tags, each a
 *  separate DNS + TLS + round trip on a third party's uptime, and each defining a global the rest of the
 *  app reads by name. They are npm dependencies now (pinned at #R175 to the versions the tags carried,
 *  and moved since only through package.json), bundled by Vite — and this file re-publishes exactly the
 *  globals those tags used to define, so not one call site changes. Each line names the package's
 *  MAJOR version only: the exact version is package.json's and package-lock.json's to state, and a
 *  copy of it here went stale on every patch bump (tests/r175-checks compares each major with
 *  package.json, so a major bump still has to be written here):
 *
 *      maplibre-gl@6             → window.maplibregl     (a namespace object — v6 has no default export)
 *      maplibre-contour@0        → window.mlcontour
 *      @turf/turf@7              → window.turf
 *      topojson-client@3         → window.topojson
 *      @supabase/supabase-js@2   → window.supabase + window.sb
 *      html2canvas@1             → window.html2canvas    (lazy — see below)
 *      katex@0                   → window.katex + its CSS (lazy — see below)
 *
 *  ── WHY TWO OF THEM ARE STILL LAZY ─────────────────────────────────────────────────────────
 *  html2canvas is only reachable from the screenshot button and KaTeX only from an Atlas reply that
 *  contains mathematics, and together they are larger than everything else here. They were `defer`red
 *  CDN tags precisely because they must never hold up boot, and both call sites already feature-detect
 *  their global and degrade (the Atlas renderer falls back to the escaped LaTeX source). Dynamic
 *  `import()` keeps that exact contract — asynchronously available, gracefully absent — while moving
 *  them into their own chunks on our own origin, so they cost nothing until first paint is done.
 *  Deliberately NOT converted to awaited imports at the call sites: that would turn a graceful
 *  degradation into a hard dependency.
 * ==========================================================================*/
/* ══ MAPLIBRE 6 IS ESM-ONLY, AND ITS WORKER IS A REAL FILE ═══════════════════════════════════
   v6 publishes no default export (`import * as` is the documented form) and no longer carries its
   worker as a string it turns into a blob: the worker is dist/maplibre-gl-worker.mjs, which imports
   its sibling maplibre-gl-shared.mjs by relative path. A bundler has to be told where the built
   worker lives (setWorkerUrl) — without it MapLibre resolves the file against its own module URL,
   which inside our bundle is the hashed renderer chunk, and the map mounts but no tile ever loads.
   `?worker&url` is Vite's worker pipeline: it builds the worker WITH its shared sibling into one
   self-contained file among the other assets and hands back its URL. (A plain `?url` copies the
   worker verbatim WITHOUT the sibling, and it dies on its first import — MapLibre's own install
   notes say the same.) Same-origin, so the CSP's `worker-src 'self'` already admits it.
   Set once, here, before any Map exists: MapLibre starts its worker pool with the first Map. */
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'virtual:maplibre-gl-worker-url';
import 'maplibre-gl/dist/maplibre-gl.css';
import mlcontour from 'maplibre-contour';
/* ══ (#R209) TURF IS IMPORTED BY NAME, NOT AS A NAMESPACE ══════════════════════════════════════
   `import * as turf` asks the bundler for EVERY function in the umbrella package, and
   `window.turf = turf` then makes all of them reachable by a computed name, so nothing can be
   dropped. Measured on this branch: that put 644 kB (166 kB gzipped) of @turf/turf into the boot
   path — more than any single first-party file, and more than the eight modules this round moved
   out of it — for the twenty-one functions the app actually calls.

   ⚠ AND NAMING THEM FROM THE UMBRELLA WAS NOT ENOUGH — MEASURED. `import { point, … } from
   '@turf/turf'` still shipped every one of the ~100 modules the index re-exports (turf-jsts, whose
   only caller is `buffer`, and concaveman, whose only caller is `convex`, were both still in the
   chunk with neither function imported), because the package declares no `sideEffects: false` and
   Rollup must assume a re-exported module might do something. Importing each function from its OWN
   sub-package is what actually removes them; the sub-packages are the same 6.5.0 release the
   umbrella pins, and they are declared in package.json rather than reached transitively.
   The published object has the same shape and every call site is unchanged.

   ⚠ AND THE LIST IS CHECKED, NOT TRUSTED. `turf.somethingElse(…)` would now be `undefined is not a
   function` at runtime instead of working — precisely the silent-hole shape this project keeps
   paying for — so tests/r209-checks.test.mjs sweeps js/ and src/ for every `turf.<name>` the source
   contains and fails if one of them is missing from this object. Add a call, add it here. */
import along from '@turf/along';
import area from '@turf/area';
import turfBbox from '@turf/bbox';
import bboxClip from '@turf/bbox-clip';
import bearing from '@turf/bearing';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import center from '@turf/center';
import centroid from '@turf/centroid';
import circle from '@turf/circle';
import distance from '@turf/distance';
import greatCircle from '@turf/great-circle';
import kinks from '@turf/kinks';
import length from '@turf/length';
import pointOnFeature from '@turf/point-on-feature';
import { featureCollection, lineString, point, polygon } from '@turf/helpers';
import * as topojson from 'topojson-client';
import { createClient } from '@supabase/supabase-js';

/* ⚠ (Turf 7) `bbox` NOW TRUSTS A DECLARED `bbox` MEMBER. 7.x returns `geojson.bbox` unread whenever the
   object carries one, unless `{recompute:true}` is passed; 6.5 always measured the coordinates. Every
   caller here (the imported-file fit in js/map-ui.js, the smallest-containing-country picks, the sims'
   clip grid) asks "where are these coordinates", and a `bbox` member on a reader's own GeoJSON file is
   a claim nobody checked — so the one published `bbox` keeps 6.5's contract for every caller at once
   rather than each call site remembering the flag. */
function bbox(geojson, options) { return turfBbox(geojson, Object.assign({}, options, { recompute: true })); }

maplibregl.setWorkerUrl(maplibreWorkerUrl);
window.maplibregl = maplibregl;
window.mlcontour = mlcontour;
window.turf = {
  along, area, bbox, bboxClip, bearing, booleanPointInPolygon, center, centroid, circle,
  distance, featureCollection, greatCircle, kinks, length, lineString, point,
  pointOnFeature, polygon,
  /* ⚠ (#R209) …AND TWO THAT ARE NOT HERE YET. `convex` + `buffer` reach turf-jsts, which is 332 kB
     — 81% of everything left in this chunk after the umbrella import was named — and the app calls
     them from ONE place: the reachable-area hull in js/sims.js. So they arrive on their own chunk,
     and the one caller awaits this before drawing. It is a promise rather than a silent absence
     precisely so the hull is never quietly drawn unbuffered (the #R205 shape).
     (Turf 7: the engine is `@turf/jsts` now, 272 kB raw — still the reason, and vite.config.js now
     DISCOVERS that it is off the boot path instead of listing its name.) */
  ensureHeavy() {
    if (!window.turf._heavyP) {
      /* ⚠ THE TWO SUB-PACKAGES, NOT THE UMBRELLA. Measured: `import('@turf/turf')` here re-merges
         the whole index back into the eager chunk (644.9 kB — exactly what it was before), because
         it is the same module id the static import above already reaches. */
      window.turf._heavyP = Promise.all([import('@turf/convex'), import('@turf/buffer')]).then((m) => {
        window.turf.convex = m[0].default || m[0]; window.turf.buffer = m[1].default || m[1]; return true;
      }).catch(() => false);
    }
    return window.turf._heavyP;
  },
  /* ⚠⚠ (Turf 7) …AND `union` IS BEHIND ITS OWN LOADER NOW. 6.5's union was a thin wrapper over
     polygon-clipping; 7.x's is polyclip-ts, which brings bignumber.js and splaytree-ts with it.
     MEASURED on this branch with union still in the object above: the eager geo chunk carried
     bignumber.js 84.6 kB + polyclip-ts 39.2 kB + splaytree-ts 11.5 kB (raw) for a function the app
     calls from ONE place — js/time-borders.js dissolving Tibet into China (≥1951) and East Prussia
     into Germany (the 1920/1930 snapshots), both inside the async snapshot fetch. So it arrives on
     its own chunk, and that fetch awaits this before correcting a snapshot. A promise rather than a
     silent absence for the same reason as ensureHeavy: without it the merge falls back to the
     rename-only path and the pre-1951 border line stays drawn. A failed load is forgotten so the
     next snapshot asks again — a real failure is the one case a second request is owed. */
  ensureUnion() {
    if (!window.turf._unionP) {
      window.turf._unionP = import('@turf/union').then((m) => {
        window.turf.union = m.default || m.union; return true;
      }).catch(() => { window.turf._unionP = null; return false; });
    }
    return window.turf._unionP;
  },
};
window.topojson = topojson;

/* ── Supabase. Moved here verbatim from the inline <script> that used to sit between the SDK tag and
      the app: with the SDK bundled there is no CDN race left to lose, so the `document.write` fallback
      that guarded it is gone too (it could not have run from a module anyway — document.write after
      parsing wipes the document). The anon/publishable key is public on purpose; Row Level Security
      protects every table. `experimental.passkey` enables the passkey namespace and is inert until the
      dashboard's WebAuthn relying-party is configured, so it never breaks password auth (#R155).
      ⚠ (supabase-js 2.117) the flag is now IGNORED — auth-js enables passkeys by default and keeps the
      option only so existing code compiles (its own type says so; removed at the next major). It stays
      written because tests/r175-checks pins these options verbatim, and saying it does nothing is
      truer than a silent removal. What decides whether a passkey control is SHOWN is js/auth-ui.js
      (_passkeysAvailable / _pkFailure), which feature-detects the SDK and withdraws the controls on
      an origin the project's relying party refuses.
      ⚠ AND THE STORAGE / FUNCTIONS CLIENTS ARE NOT IN THIS BUNDLE: vite.config.js points
      @supabase/storage-js and @supabase/functions-js at src/supabase-unbundled-stub.js (the app uses
      neither — why, and what happens if something ever reaches for them, is written there). */
window.SUPABASE_URL = 'https://vpekfwdpurzejrrmacac.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_yI9Rf2s4nzrIuqFyUq4OOA_h83PrRd0';
window.supabase = { createClient };
try {
  window.sb = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, experimental: { passkey: true } },
  });
} catch (e) {
  window.sb = null;
  console.error('[IntMap] Supabase client could not be created.', e);
}

/* ── the two lazy ones. Failures are swallowed on purpose: both features already handle "the global is
      not there" and saying so twice would only add a console error to a working page. */
/* ⚠ (#R193) …AND "LAZY" HAS TO MEAN LATER, NOT JUST SEPARATELY. The comment above says these
      "cost nothing until first paint is done", and measured on a cold load that was not true: being
      their own chunks put them on their own requests, but the requests were issued the instant this
      module evaluated — katex 258 KB and html2canvas 198 KB, both starting at 373 ms, ahead of the
      first base-map tile. Splitting a bundle only helps if the split half is also DEFERRED.
      So the same two dynamic imports, behind the browser's own idle signal, with a ceiling so a
      permanently busy page still ends up with them. The contract at the call sites is unchanged:
      asynchronously available, gracefully absent, never awaited. */
/* ══ ⚠⚠ (#R224) "AT IDLE" IS STILL "EVERY SESSION" — THESE TWO ARE ON DEMAND NOW ═══════════════════
   「モバイル版がまだ劇的に遅い…ブラウザが落ちることもある。」

   #R193 moved these off first paint and behind requestIdleCallback with a 6 s ceiling, which was the
   right fix for what it measured. It is still 456 KB fetched, parsed and compiled ON EVERY SESSION —
   measured on a clean phone-viewport first load this round, katex 258 KB and html2canvas 198 KB both
   arriving at t = 1.04 s — for two features most sessions never touch: html2canvas runs when the
   reader presses 📷 Screenshot, and katex when an Atlas answer contains LaTeX. An idle callback with a
   ceiling is not laziness, it is a delay.

   So the same two dynamic imports, keyed by their FIRST USE. `window.IntMapVendor.html2canvas()` and
   `.katex()` return a promise for the library, memoised, and the call sites await it — which they can,
   because both are already inside async paths. ⚠ THE GLOBALS ARE STILL SET when the module lands, so
   every existing `if (window.katex)` guard keeps its exact meaning: absent until first use, present
   after it, never half-loaded. */
window.IntMapVendor = (function () {
  let _h2c = null, _katex = null;
  return {
    html2canvas() {
      if (!_h2c) _h2c = import('html2canvas')
        .then((m) => { window.html2canvas = m.default || m; return window.html2canvas; })
        .catch((e) => { _h2c = null; throw e; });
      return _h2c;
    },
    katex() {
      if (!_katex) _katex = import('katex')
        .then(async (m) => { await import('katex/dist/katex.min.css'); window.katex = m.default || m; return window.katex; })
        .catch((e) => { _katex = null; throw e; });
      return _katex;
    },
  };
})();
