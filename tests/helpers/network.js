// Test networking policy + error classification, shared by the smoke and QA specs.
//
// Why intercept at all? Three of the commission's requirements at once:
//   1. Determinism / speed — the test must not depend on GDELT / Overpass / Wikidata /
//      tile servers being up, and must not flake when they rate-limit.
//   2. Safety — CI must NEVER touch production Supabase, consume AI quota, or hammer
//      external APIs (§5.3, §11). Blocking every non-boot host guarantees that.
//   3. Honest failure classification (§4.4) — a blocked external fetch is EXPECTED and
//      harmless; only an error coming from IntMap's own code should fail the build.
//
// Boot policy: the app cannot start without its core libraries, which production loads
// from unpkg + jsDelivr. We allow exactly those two hosts through (same libraries the
// live site uses) and BLOCK every other external host. Same-origin (the local static
// server) is always allowed.

// Hosts required to boot the app (core JS/CSS libraries). Everything else is blocked.
const BOOT_CDN_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net'];

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}
function isLocal(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '';
}
function isBootCdn(host) {
  return BOOT_CDN_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}

/**
 * Block all external network except same-origin + the two boot CDNs.
 * Returns a list of blocked hosts (for debugging) that the caller may inspect.
 *
 * (#R201) `allow` names further hosts a spec genuinely needs. Determinism is the point of this
 * helper, but a spec ABOUT a layer that only exists when its tiles arrive cannot be made hermetic
 * — it can only be made to pass without testing anything. tests/r201.spec.js ② asserts what a tap
 * on an OpenFreeMap `place` label does, so it lets that one host through and nothing else.
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string[]} [allow] extra hostnames (exact or parent domain) to let through
 */
export async function installHermeticRouting(context, allow) {
  const blockedHosts = new Set();
  const extra = allow || [];
  const isAllowed = (h) => extra.some((a) => h === a || h.endsWith('.' + a));
  await context.route('**/*', (route) => {
    const host = hostOf(route.request().url());
    if (isLocal(host) || isBootCdn(host) || isAllowed(host)) return route.continue();
    blockedHosts.add(host);
    // Abort with a network-failure code the app's fetch/XHR handlers already expect.
    return route.abort('blockedbyclient');
  });
  return blockedHosts;
}

// Console errors that are EXPECTED given our hermetic policy (a blocked external host)
// or are known-benign app-handled conditions. Anything NOT matching these — i.e. an
// error originating in IntMap's own logic — fails the smoke test.
const BENIGN_CONSOLE = [
  /Failed to load resource/i,
  /net::ERR_/i,
  /ERR_(FAILED|ABORTED|BLOCKED|BY_CLIENT|NETWORK_CHANGED|NAME_NOT_RESOLVED|CONNECTION_)/i,
  /blockedbyclient/i,
  /Failed to fetch/i,
  /NetworkError|network error/i,
  /load.*(tile|glyph|sprite|source image)/i,          // MapLibre reacting to blocked tiles/glyphs
  /Could not load image/i,                            // MapLibre image (sprite/marker/flag) blocked by hermetic policy
  /(supported image type|SVGs are not supported)/i,   // same MapLibre image-load path
  /AbortError|The operation was aborted|signal is aborted/i,
  /Supabase SDK failed to load/i,                      // handled fallback path (both local+CDN unreachable)
  /\b(429|5\d\d|403|404)\b.*(gdelt|overpass|wikidata|nominatim|supabase|gibs|open-meteo|arcgis|carto)/i,
];

// Is this console/error text harmless under the hermetic policy?
export function isBenign(text) {
  const t = String(text || '');
  return BENIGN_CONSOLE.some((re) => re.test(t));
}

/**
 * Attach listeners that collect page diagnostics. Returns an object with live arrays:
 *   pageErrors    — uncaught exceptions (ALWAYS a failure)
 *   consoleErrors — console.error messages that are NOT benign (a failure)
 *   benignErrors  — console.error messages that were classified benign (informational)
 *   navigations   — main-frame navigations (to catch an infinite reload loop)
 */
export function collectPageDiagnostics(page) {
  const d = { pageErrors: [], consoleErrors: [], benignErrors: [], navigations: [] };
  page.on('pageerror', (err) => {
    d.pageErrors.push(String(err && err.stack ? err.stack : err));
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isBenign(text)) d.benignErrors.push(text);
    else d.consoleErrors.push(text);
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) d.navigations.push(frame.url());
  });
  return d;
}
