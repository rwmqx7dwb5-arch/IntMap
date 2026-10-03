/* ============================================================================
 *  IntMap · the shell's host, for the doors that are opened by a URL or a delegated tap   (mobile-next)
 * ----------------------------------------------------------------------------
 *  js/app-body.js fills `hostDoor.host` with its IM_HOST the moment that object exists. The modules that are
 *  imported on demand by something that has no host in hand — the page opened from the phone's share sheet
 *  (src/main.js → js/share-inbox.js) and the «Here, now» row under the empty search field (js/search-geocode.js
 *  → js/here-now.js) — read it here, and wait for it with `whenHost()` if the shell has not built it yet.
 *  ⚠ A LEAF ON PURPOSE (the rule js/narrator-api.js states): it imports nothing, so being shared between the
 *  start-up graph and a lazy chunk folds it into main without adding a request.
 * ==========================================================================*/
export const hostDoor = { host: null };
const waiting = [];
/** the shell set its host — called once, by js/app-body.js */
export function setHost(h) { hostDoor.host = h; while (waiting.length) { try { waiting.shift()(h); } catch (_) { /* a waiter's failure is its own */ } } }
/** → Promise<IM_HOST>, resolved now if the shell has built it, else when it does */
export function whenHost() { return hostDoor.host ? Promise.resolve(hostDoor.host) : new Promise((r) => waiting.push(r)); }
