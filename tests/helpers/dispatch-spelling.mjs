/* ── which dispatch case a spelling reaches — asked of the shipped registry, not read off a label ───────────────
   (atlas-one-declaration) js/atlas-console.js switches on `CAPS.dispatchName(a.type)`, so a case carries only the
   capability's column-1 spelling and every other spelling reaches it because its row in js/atlas-capabilities.js
   declares it. A check that used to assert `case 'space': case 'solarSystem':` now asks this instead — the SAME
   function the dispatch calls — so the question 「does `solarSystem` still open the space explorer」 is answered by
   running the resolver, and a label list cannot drift from it. */
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../../js/atlas-capabilities.js');
const CAPS = makeAtlasCapabilities({});

/** the case label the dispatch answers `spelling` with */
export function dispatchName(spelling) { return CAPS.dispatchName(spelling); }
