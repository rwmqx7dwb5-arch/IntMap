// @ts-check
/* ============================================================================================
 *  layer-ownership — which renderer layers a Layers box owns, learned from what the box itself did
 * --------------------------------------------------------------------------------------------
 *  The reconciler in js/data-layers.js (IntMapLayerAudit) compares each Layers box with the layers it
 *  owns. Id tables name them for ~30 boxes; the rest (146 of 177 at boot, measured 2026-10-05) are
 *  LEARNED, and this is the learner.
 *
 *  ⚠⚠⚠ APPEARING IN THE SAME SECONDS IS NOT OWNERSHIP. The first learner (#R81) diffed the style 0.5 /
 *  1.8 / 4 s after a box went ON and gave the box every layer that had appeared meanwhile — whoever had
 *  added it. MEASURED (production 2026-10-05, build 076f908, reproduced locally): «Historical city
 *  populations» was ticked while the map pane was hidden; when the map could draw, the held ticks were
 *  delivered, the clock-driven era borders (imtb-*) and provinces (imta-*) were added in the same seconds,
 *  and the box was given them. Unticked, the audit hid the era borders every time they were drawn — 1890 had
 *  no borders. A fresh boot gave «Railways» the world-capitals and night-side layers the same way. The only
 *  defence was a hand-kept pattern of prefixes to skip, which named neither imtb- nor imta-.
 *
 *  ⇒ OWNERSHIP IS A CAUSAL FACT: the layers a box's own `change` handlers took OFF THE MAP (a drawn layer
 *  hidden or removed) while that box's OFF was being dispatched. The engine reports every visibility write
 *  synchronously (GE().layers.onVisibility, js/geo-engine.js), with whether the layer was drawn before it;
 *  a write belongs to the innermost Layers-box change event whose dispatch has not returned (`eventPhase
 *  !== 0`, the DOM's own «still being dispatched»). A clock tick, the renderer becoming drawable, a fetch
 *  landing or Atlas drawing cannot run inside that synchronous dispatch, so none of them can be attributed
 *  to a box — whatever its layer is called, and with no list to keep.
 *    · Only a write that took a DRAWN layer off counts: a shared pass the handler calls may re-hide what is
 *      already hidden (measured: the place-name boxes' OFF re-asserts the era-hidden country names), and
 *      that changed nothing.
 *    · Only the OFF side is learned. «When I am off, these are off» is exactly what the audit's hide branch
 *      re-asserts (an async ON callback landing after the OFF, #R36); the ON side can call shared passes that
 *      show layers the box does not own (js/app-body.js _applyBorders shows the era borders whenever the
 *      clock travels).
 *  ⚠ A box learns at its first OFF; until then it owns nothing here, and the audit's check() answers null
 *    («no id table»), which every reader already reads as «nothing to judge».
 *  ⚠ A box whose OFF hides its layers only after awaiting something (a lazily loaded module) is not learned
 *    from a synthetic dispatch — measured: beta-dl-volcso2. An id table (or _registerLayerOpacity's cbId)
 *    covers such a box.
 *  The precedence of the id tables over this (a layer a table gives another box is never this box's) is
 *  applied where both are read — `owned()` in js/data-layers.js.
 * ========================================================================================== */

/**
 * @param {Record<string, Set<string>>} store  box id → the layer ids its own OFF took off the map
 * @returns {{ dispatching(e: Event): void, wrote(id: string, shown: boolean, was: boolean): void }}
 *   `dispatching` — call it for a Layers box's `change` event as its dispatch begins (a capture listener on window);
 *   `wrote` — subscribe it to the engine's onVisibility.
 */
export function ownershipLearner(store) {
  /** @type {Event[]} change events whose dispatch has not returned yet, innermost last */
  const live = [];
  const prune = () => { for (let i = live.length - 1; i >= 0; i--) { if (live[i].eventPhase === 0) live.splice(i, 1); } };
  return {
    dispatching(e) { prune(); live.push(e); },
    wrote(id, shown, was) {
      if (shown || !was || !live.length) return;
      prune();
      const e = live[live.length - 1]; if (!e) return;
      const box = /** @type {any} */ (e.target);
      if (!box || box.checked || !box.id) return;   /* only a box going OFF states what is off with it */
      (store[box.id] = store[box.id] || new Set()).add(id);
    },
  };
}
