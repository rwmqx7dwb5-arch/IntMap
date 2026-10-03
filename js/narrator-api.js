/* ============================================================================
 *  IntMap · the narrator's doors for the lazy readers   (keyboard-and-offline)
 * ----------------------------------------------------------------------------
 *  js/map-narrator.js (eager) fills this in when the shell builds it; js/map-reader.js and js/offline-maps.js (lazy) read it:
 *    say        write the one live region (the narrator is its only writer)
 *    summarise  the narrator's short paragraph for the view as it is now
 *    enrich     set while the reading mode is on: turns the settled summary into the fuller paragraph
 *    resettle   ask the narrator to speak again once the view has settled
 *    host       the shell's IM_HOST (its `lang` is the reader's language)
 *    engine     the renderer, as the shell handed it to the narrator (a function — the same one it calls)
 *  ⚠ A LEAF ON PURPOSE. It imports nothing. A lazy module that imported js/map-narrator.js made the narrator a module shared with a
 *  lazy chunk, and every edge from it to another shared module (runtime, chronos, lang-registry, bus) then had to be folded into the
 *  entry by the bundler without a cycle — it could not, geo-engine stayed out, and every reader paid one more request at start-up
 *  (scripts/perf-budget.mjs eager.requests 9 → 10; the rule is written up at «THE UNNAMED EAGER MODULES REACH main BY A MERGE» in
 *  vite.config.js). A leaf shared with a lazy chunk folds into main with nothing to refuse.
 * ==========================================================================*/
export const narratorApi = { say: null, summarise: null, enrich: null, host: null, engine: null, resettle: null };
