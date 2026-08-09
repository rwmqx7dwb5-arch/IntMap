/* ============================================================================
 *  IntMap · THE ONE SAVED SESSION THE SUITE BOOTS WITH  (#R201)
 * ----------------------------------------------------------------------------
 *  #R186 seeds `intmap_session2` so the ~350 tests that are not ABOUT the default layers do not pay
 *  9,160 ms of Köppen raster and submarine cables on every boot, and #R189 records what happened
 *  when the generation stamp inside it was forgotten: the app healed the "absence" back into
 *  presence and three CI runs died. The value therefore has to be in exactly one place.
 *
 *  It was in playwright.config.js — which only covers contexts Playwright creates for the `page`
 *  fixture. A spec that opens its own `browser.newContext(...)` (tests/r197.spec.js does, and so
 *  does tests/r201.spec.js, because sharing ONE page across a describe is how those files stay
 *  cheap) silently got the UNSEEDED boot: the slow one this seed exists to avoid.
 *
 *  ⚠ BUMP `defv` WITH THE GENERATION IN js/app-body.js. An unstamped session predates #R188's
 *  imAutoOff fix, so the app treats its absences as an outage's poison rather than as a choice and
 *  heals them once — which puts every default layer back on. See #R189.
 * ==========================================================================*/
export const SESSION_KEY = 'intmap_session2';
/* WARN (#R210) `right:false` IS NOT COSMETIC. js/map-ui.js opens the right layer panel when the
 *  saved session has NO ANSWER for it — the first-visit behaviour asked for this round. Every
 *  context here carries a saved session WITHOUT that key, so leaving it out would silently make
 *  ~350 tests measure a canvas 300 px narrower than the one they were written against: exactly
 *  the shape #R207 warned about when one default moved and four deep specs fell over.
 *  The suite is not ABOUT first-visit behaviour, so it states the answer it wants; the
 *  unanswered case is covered on purpose by tests/r210.spec.js. */
export const SESSION_VALUE = '{"v":2,"defv":190,"layers":[],"lsrOpen":false}';
export const PORT = Number(process.env.PORT || 4173);
export const BASE = `http://127.0.0.1:${PORT}`;

/**
 * The storageState a context must carry to boot the way the suite expects.
 * @param {Array<{name: string, value: string}>} [extra] additional localStorage entries
 */
export function seededStorageState(extra) {
  return {
    cookies: [],
    origins: [{ origin: BASE, localStorage: [{ name: SESSION_KEY, value: SESSION_VALUE }].concat(extra || []) }],
  };
}
