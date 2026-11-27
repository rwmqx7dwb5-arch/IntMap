/* ============================================================================
 *  IntMap · the size of ONE Atlas turn's input, client and server, in one place   (atlas-input-limits)
 * ----------------------------------------------------------------------------
 *  Two readers: js/atlas-agent.js composeInput (the page spends the budget item by item and says what it gave
 *  up) and supabase/functions/ai-proxy/turn.ts normalizeTurn (the server's last fence). They used to hold their
 *  numbers apart — 240,000 / 48,000 in the page, 480,000 / 96,000 / 600 items in the proxy — and the page
 *  counted characters only. MEASURED 2026-11-27 (external audit, main@638897c): 12 results of 45,000
 *  characters each composed to 540,700 characters with `cut:false` and the proxy answered `too_large`, because
 *  the latest step's results were never squeezed; and a turn of 4 calls × 75 steps was 604 items (about 19,000
 *  characters) — the proxy kept `slice(0, 600)`, so the last two calls' answers and the current state were the
 *  part that went. The page now keeps BOTH measures under the CLIENT numbers below, and the proxy reads the
 *  SERVER numbers from this same object, so neither can move without the other.
 *
 *  ⚠ NO IMPORTS, NO GLOBALS — evaluated unchanged in a browser, in node and in Deno.
 *
 *  OBSERVED / ESTIMATED: CLIENT.item 48,000 keeps every one of 20 measured find_capability results whole (max
 *  39,235, 2026-09-25); CLIENT.total 240,000 is an ESTIMATE (six such results, a full 48-line history and the
 *  state blocks inside a 400k-token context at ~1 character per token for CJK text). CLIENT.items 300: a turn of
 *  48 history lines + 8 steps of 8 calls with reasoning is ~200 items, so 300 is that with room; it is HALF of
 *  the server's 600, the same ratio the character fences keep.
 *  EXPIRES WHEN: find_capability's documentation grows past CLIENT.item, or a model's context window changes.
 *  tests/atlas-native-tools-checks.test.mjs and tests/atlas-child-loop-reuse-checks.test.mjs hold SERVER ≥ 2 × CLIENT.
 * ==========================================================================*/

export const INPUT_LIMITS = Object.freeze({
  CLIENT: Object.freeze({ total: 240000, item: 48000, squeezed: 4000, items: 300 }),
  SERVER: Object.freeze({ chars: 480000, item: 96000, items: 600 }),
});
