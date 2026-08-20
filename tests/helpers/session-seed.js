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
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SESSION_KEY = 'intmap_session2';
/* WARN (#R210) `right:false` IS NOT COSMETIC. js/map-ui.js opens the right layer panel when the
 *  saved session has NO ANSWER for it — the first-visit behaviour asked for this round. Every
 *  context here carries a saved session WITHOUT that key, so leaving it out would silently make
 *  ~350 tests measure a canvas 300 px narrower than the one they were written against: exactly
 *  the shape #R207 warned about when one default moved and four deep specs fell over.
 *  The suite is not ABOUT first-visit behaviour, so it states the answer it wants; the
 *  unanswered case is covered on purpose by tests/r210.spec.js. */
/* ⚠⚠ (#R225) THE BASE TOGGLES HAVE TO BE IN HERE NOW, AND THAT IS THE POINT OF THE CHANGE.
 *  This seed said `"layers":[]` and meant «no THEMATIC layer is on, so the suite does not pay for the
 *  Köppen raster and the cables». Until #R225 the restore only ever turned OFF the ids in
 *  IntMapDefaultLayers, so the seven base toggles index.html ships CHECKED were unaffected by the
 *  omission — which is exactly the defect the reader reported («base map & labelsも勝手に全部オンに
 *  なる»): a base toggle switched off was saved as absent and then silently restored to its HTML
 *  default. Now that «absent» means «the reader switched it off» for EVERY default-on id, an empty
 *  list means «switch everything off», and tests/r211.spec.js ③ caught it in CI on the first run.
 *  So the seed states what it always meant: the base map and its labels are on, the thematic layers
 *  are not. ⚠ Keep this list in step with window.IntMapDefaultOn's base half (js/data-layers.js). */
/* The base half of window.IntMapDefaultOn (js/data-layers.js) — the toggles index.html ships CHECKED.
 * A spec that writes its OWN session and is not about the base map must include these, or (#R225) it
 * is saying «the reader switched the whole base map off» and will spend the restore doing that. */
export const BASE_LAYERS = ['cb-names', 'cb-geolabels', 'cb-poi', 'cb-borders', 'cb-admin1', 'cb-roads', 'cb-rail2'];
/** A session snapshot that keeps the base map and adds whatever thematic layers a spec wants on. */
export function sessionWith(layers, extra) {
  return JSON.stringify(Object.assign({ v: 2, defv: 190, layers: BASE_LAYERS.concat(layers || []), lsrOpen: false }, extra || {}));
}
export const SESSION_VALUE = '{"v":2,"defv":190,"layers":["cb-names","cb-geolabels","cb-poi","cb-borders","cb-admin1","cb-roads","cb-rail2"],"lsrOpen":false}';
/* ── THE PORT IS PER-CHECKOUT, BECAUSE SESSIONS RUN IN PARALLEL  (#R282 追記) ───────────────────
   This was `process.env.PORT || 4173` for every checkout on the machine, and playwright.config.js
   sets `reuseExistingServer: !isCI`. Together that means two Claude Code sessions testing at the
   same time SHARE ONE dev server, and both ways it goes wrong are silent:

     · the second run skips its own `npm run build` and tests the OTHER session's dist/ — green,
       and meaningless, because it never looked at the code that was changed;
     · when the first run finishes and takes the server down, the second dies mid-suite with
       «net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/» for no reason of its own.
       MEASURED: 2 failed / 25 did not run, on a tree whose own tests all pass.

   So the port follows the CHECKOUT. A linked worktree's `.git` is a FILE that points at the main
   repository, while the main worktree's is a DIRECTORY — one stat, no subprocess, no config. The
   main worktree therefore keeps 4173 exactly as the documents say (and so does CI, which checks
   out normally), and every worktree gets its own stable port derived from its path.
   ⚠ `PORT` in the environment still wins, for the times you want to pin it. */
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const isLinkedWorktree = (root) => {
  try { return statSync(join(root, '.git')).isFile(); } catch { return false; }
};
/* pure, so tests/r282 ⑦ can ask it about paths this machine does not have */
export const portForPath = (root, linked) => {
  if (!linked) return 4173;
  let h = 0;
  for (const ch of String(root).toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 4174 + (h % 200);            // 4174–4373, stable for this path
};
export const PORT = Number(process.env.PORT || portForPath(REPO_ROOT, isLinkedWorktree(REPO_ROOT)));
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
