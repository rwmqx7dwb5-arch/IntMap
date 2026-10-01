// ============================================================================
//  IntMap · _shared/site-origin.js — WHERE THE SITE IS. The one place the production address is written.
// ----------------------------------------------------------------------------
//  WHY (domain-portable): the address was spelled out by hand in 69 tracked files — the Edge Functions'
//  User-Agent (13 times in alerts-relay alone), the origin the error log accepts, index.html's social
//  card, four workflows, the smoke tests, the agents' role sheets and the docs. The site is going to
//  move to a domain of its own, and on that day every one of those spellings would have been a
//  separate edit, each of which could be forgotten without anything turning red.
//
//  THE RULE: everything that needs the address DERIVES it from this file, and
//  scripts/site-url.mjs (`check:static`) refuses the address spelled anywhere else in the tracked
//  tree. The two exceptions are stated there, with their reasons.
//
//  ⚠ ONE FILE, EVERY READER, NO MIRROR. It lives beside client-error-shape.js for the reason that file
//  does: plain ESM with no dependency and no type annotation, so the Edge Functions import it relatively
//  (an Edge Function bundle can only carry files under supabase/functions/), Vite bundles it into the
//  page, and node scripts, tests and the build import it directly. A workflow cannot import, so it runs
//  `node scripts/site-url.mjs`, which prints what this file says.
//
//  ── TO MOVE THE SITE TO ITS OWN DOMAIN ─────────────────────────────────────────────────────
//  Set CUSTOM_DOMAIN below and nothing else. The whole procedure — DNS, the Pages setting, HTTPS,
//  Supabase Auth, Search Console, passkeys — is docs/RELEASE.md «Moving the site to its own domain».
// ============================================================================

/* The address GitHub Pages gives this repository: https://<owner>.github.io/<repo>/. It is not a choice
   — it follows from the repository's name (tests/domain-portable-checks.test.mjs re-derives it from the
   git remote with scripts/release-state.mjs pagesUrlFromRemote and fails if the two disagree). It stays
   ours after a custom domain is set: MEASURED 2026-10-01 on two project sites that have one
   (jekyll.github.io/jekyll/…, twbs.github.io/bootstrap/…), Pages answers the old address with a 301 to
   the custom domain, drops the /<repo>/ prefix, and keeps the rest of the path and the query. */
export const PAGES_URL = "https://rwmqx7dwb5-arch.github.io/IntMap/";

/* ⚠ THE ONE VALUE TO CHANGE. The bare host name, e.g. "intmap.example" or "www.intmap.example" — no
   scheme, no path, no trailing dot (an internationalised name in its Punycode form, which is what the
   Pages setting requires). "" means the site has no domain of its own and is served at PAGES_URL. */
export const CUSTOM_DOMAIN = "";

if (CUSTOM_DOMAIN && !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(CUSTOM_DOMAIN)) {
  throw new Error(`site-origin.js: CUSTOM_DOMAIN must be a lower-case host name, got ${JSON.stringify(CUSTOM_DOMAIN)}`);
}

/* The address a reader opens. A custom domain serves the site at its ROOT (no /IntMap/ prefix) —
   which is why nothing in the page may assume a base path (vite.config.js `base: './'`, sw.js
   registered by a relative URL). */
export const SITE_URL = CUSTOM_DOMAIN ? `https://${CUSTOM_DOMAIN}/` : PAGES_URL;

const _site = new URL(SITE_URL);
export const SITE_ORIGIN = _site.origin;       // scheme + host, what a browser sends as Origin
export const SITE_HOST = _site.host;           // what WebAuthn's relying-party id and hostname checks see
export const SITE_BASE_PATH = _site.pathname;  // "/IntMap/" on Pages, "/" on a custom domain

/* Every origin a page of OURS can be served from: the site, and — once it has a domain of its own —
   the Pages address too. ⚠ NOT A MIGRATION WINDOW WITH AN END DATE: the Pages address cannot be
   given to anybody else while this repository exists, and a reader whose service worker or tab
   predates the move is still on it. Accepting it costs nothing; refusing it drops that reader's
   error reports. It stops being ours only if the repository is renamed or transferred — and then
   PAGES_URL changes with it (the test above). */
export const SITE_ORIGINS = Object.freeze([...new Set([SITE_ORIGIN, new URL(PAGES_URL).origin])]);

/* What our servers tell an upstream about who is asking (the `+URL` is the contact convention
   OSM / NWS / Nominatim ask for). */
export const SITE_USER_AGENT = `IntMap/1.0 (+${SITE_URL})`;

/** An absolute URL of a page or asset of the site, from a path relative to its root
 *  (`siteUrl('terms.html')`). A leading slash is refused rather than resolved, because it would
 *  silently drop the /IntMap/ prefix on Pages — the exact assumption this file exists to remove. */
export function siteUrl(path = "") {
  const p = String(path);
  if (p.startsWith("/")) throw new Error(`siteUrl(): ${JSON.stringify(p)} is root-absolute; pass a path relative to the site`);
  return new URL(p, SITE_URL).href;
}

/** Is `origin` one this site is served from? */
export function isSiteOrigin(origin) {
  return SITE_ORIGINS.includes(String(origin || ""));
}
