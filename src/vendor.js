/* ============================================================================
 *  IntMap · VENDOR — the third-party libraries, and the globals the app knows them by  (#R175)
 * ----------------------------------------------------------------------------
 *  Before this round these arrived as seven <script src="https://unpkg.com/…"> / jsDelivr tags, each a
 *  separate DNS + TLS + round trip on a third party's uptime, and each defining a global the rest of the
 *  app reads by name. They are npm dependencies now, pinned to the SAME versions, bundled by Vite — and
 *  this file re-publishes exactly the globals those tags used to define, so not one call site changes:
 *
 *      maplibre-gl@5.24.0        → window.maplibregl     (pinned exactly since #R158 — camera-API behaviour)
 *      maplibre-contour@0.1.0    → window.mlcontour
 *      @turf/turf@6.5.0          → window.turf
 *      topojson-client@3.1.0     → window.topojson
 *      @supabase/supabase-js@2   → window.supabase + window.sb
 *      html2canvas@1.4.1         → window.html2canvas    (lazy — see below)
 *      katex@0.16.11             → window.katex + its CSS (lazy — see below)
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
import maplibregl from 'maplibre-gl';
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
import bbox from '@turf/bbox';
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
import union from '@turf/union';
import { featureCollection, lineString, point, polygon } from '@turf/helpers';
import * as topojson from 'topojson-client';
import { createClient } from '@supabase/supabase-js';

window.maplibregl = maplibregl;
window.mlcontour = mlcontour;
window.turf = {
  along, area, bbox, bboxClip, bearing, booleanPointInPolygon, center, centroid, circle,
  distance, featureCollection, greatCircle, kinks, length, lineString, point,
  pointOnFeature, polygon, union,
  /* ⚠ (#R209) …AND TWO THAT ARE NOT HERE YET. `convex` + `buffer` reach turf-jsts, which is 332 kB
     — 81% of everything left in this chunk after the umbrella import was named — and the app calls
     them from ONE place: the reachable-area hull in js/sims.js. So they arrive on their own chunk,
     and the one caller awaits this before drawing. It is a promise rather than a silent absence
     precisely so the hull is never quietly drawn unbuffered (the #R205 shape). */
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
};
window.topojson = topojson;

/* ── Supabase. Moved here verbatim from the inline <script> that used to sit between the SDK tag and
      the app: with the SDK bundled there is no CDN race left to lose, so the `document.write` fallback
      that guarded it is gone too (it could not have run from a module anyway — document.write after
      parsing wipes the document). The anon/publishable key is public on purpose; Row Level Security
      protects every table. `experimental.passkey` enables the passkey namespace and is inert until the
      dashboard's WebAuthn relying-party is configured, so it never breaks password auth (#R155). */
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
(function lazyVendors() {
  const load = () => {
    import('html2canvas').then((m) => { window.html2canvas = m.default || m; }).catch(() => {});
    import('katex').then(async (m) => {
      await import('katex/dist/katex.min.css');
      window.katex = m.default || m;
    }).catch(() => {});
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(load, { timeout: 6000 });
  else setTimeout(load, 2500);
})();
