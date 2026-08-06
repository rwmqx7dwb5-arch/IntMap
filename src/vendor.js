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
import * as turf from '@turf/turf';
import * as topojson from 'topojson-client';
import { createClient } from '@supabase/supabase-js';

window.maplibregl = maplibregl;
window.mlcontour = mlcontour;
window.turf = turf;
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
