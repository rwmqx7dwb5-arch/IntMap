/* ============================================================================
 *  IntMap · scripts/lib/share-targets.mjs — where a READER can share a generated entry page from   (marketing-growth)
 * ----------------------------------------------------------------------------
 *  The generated entry pages (history/, history/years/, on-this-day/, countries/, weekly/ — one shell,
 *  scripts/history-pages.mjs `shell`) are what a search brings a stranger to, and until now the only way to pass one on
 *  was to copy the address by hand. Each page now ends with a row of plain links, one per service, each opening that
 *  service's own «compose» or «share» screen with the page's address (and, where the service takes one, the page's
 *  title) filled in.
 *
 *  ⚠ NOTHING IS SENT BY IntMap. These are <a href> links: no script, no button that posts, no request until the reader
 *  presses one, and then it is the reader's browser opening the service — the reader decides whether to post. That is
 *  why this needs no approval while IntMap's own posting does (docs/marketing/README.md «承認が要ること»).
 *  ⚠ NOT THE SAME LIST AS scripts/on-this-day-pages.mjs CHANNELS. That one is where IntMap's OWNER would post the
 *  daily drafts; this one is where a READER may share, which is a different question (LINE is how links travel in
 *  Japan, and a reader is not posting as IntMap anywhere).
 *  ⚠ THE LINK CARRIES utm TAGS (utm_source = the service, utm_medium=social, utm_campaign=CAMPAIGN), so a person who
 *  arrives by a shared page and goes on to the map is counted by the app's anonymous counter under that service
 *  (supabase/functions/usage-count/shape.js campaignOf / SITE_PAGES — the entry pages are entries it counts).
 *  Each address below is the service's documented share endpoint, observed 2026-10-08; it lapses when a service retires
 *  its endpoint (the link would then open the service's home page — nothing breaks on IntMap's side).
 * ==========================================================================*/

export const CAMPAIGN = 'share-page';
const enc = encodeURIComponent;

/** id = the utm_source the link carries; name = the service's own name (a proper noun, not translated) */
export const SHARE_TARGETS = Object.freeze([
  { id: 'x', name: 'X', href: (url, title) => 'https://x.com/intent/post?text=' + enc(title) + '&url=' + url },
  { id: 'bluesky', name: 'Bluesky', href: (url, title) => 'https://bsky.app/intent/compose?text=' + enc(title + ' ') + url },
  { id: 'threads', name: 'Threads', href: (url, title) => 'https://www.threads.net/intent/post?text=' + enc(title + ' ') + url },
  { id: 'facebook', name: 'Facebook', href: (url) => 'https://www.facebook.com/sharer/sharer.php?u=' + url },
  { id: 'line', name: 'LINE', href: (url) => 'https://social-plugins.line.me/lineit/share?url=' + url },
  { id: 'reddit', name: 'Reddit', href: (url, title) => 'https://www.reddit.com/submit?url=' + url + '&title=' + enc(title) },
]);

/**
 * The share links of one page.
 * @param {string} site  the site's address or its build-time token (scripts/site-url.mjs SITE_TOKEN) — written as it is,
 *   because the token is replaced after the build with the site's own address (whose characters are all legal in a query)
 * @param {string} path  the page's path from the site root
 * @param {string} title the page's title (the services that take a text get it)
 * @returns {{ id: string, name: string, href: string }[]}
 */
export function shareLinks(site, path, title) {
  return SHARE_TARGETS.map((t) => {
    /* the page's own query, encoded as ONE value of the service's query, so its «&» do not split the service's */
    const url = site + enc(path + '?utm_source=' + t.id + '&utm_medium=social&utm_campaign=' + CAMPAIGN);
    return { id: t.id, name: t.name, href: t.href(url, title) };
  });
}
