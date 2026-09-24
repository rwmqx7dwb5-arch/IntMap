// ============================================================================
//  IntMap · _shared/read-budget.js — the leaky bucket every upstream read of a feed is drawn from
// ----------------------------------------------------------------------------
//  This is aviation-feed's #R504 bucket (`refillTokens` / `takeTokens`), moved here so that a
//  second feed can draw from the same arithmetic instead of a copy of it. WHY a second feed needs
//  one (#R801, external audit): ais-feed let anyone say `?refresh=1` and `?ws=20000`, and every such
//  request opened two Digitraffic reads and a 20-second aisstream socket — upstream work
//  proportional to the number of callers, which is the shape the aviation bucket was written to
//  remove. The aviation rule is the right one for both: every upstream read passes through
//  `take()`, what a query parameter may ASK for is clamped, and what the bucket GRANTS is the
//  bound. A caller that is granted nothing is served what the function already holds and is told
//  how old it is.
//
//  ⚠ IT IS ISOLATE STATE. Two warm isolates hold two buckets, so the bound is per isolate, and a
//  cold isolate starts full unless the feed `seed()`s the clock from something every isolate shares
//  (aviation-feed does, from its sweep ledger). What the bucket bounds is «how much one address of
//  this function will ask upstream per unit time», which is what a request amplifier needs bounded;
//  it is not a per-caller quota (that is _shared/rate-limit.js, which lives in the database).
//
//  The arithmetic is unchanged from #R504 and tests/r801-relay-input-checks runs it: an empty bucket
//  grants floor(elapsed · rate), a day of quiet still fills only `burst`, and the long-run average
//  never exceeds `rate`.
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — the repo's static gate parses every committed .ts/.js as
//  plain JavaScript (see relay-guard.js).
// ============================================================================

export function makeReadBudget(opts) {
  const o = opts || {};
  const rate = Math.max(0, +o.ratePerSec || 0);
  const burst = Math.max(1, +o.burst || 1);
  /* `at` is the clock the bucket last refilled against; 0 means «never», and a bucket that has never
     refilled holds its full burst — the #R504 behaviour, which `seed()` exists to override. */
  const b = { tokens: burst, at: 0 };

  function refill(now) {
    const at = b.at || now;
    if (now > at) b.tokens = Math.min(burst, b.tokens + ((now - at) / 1000) * rate);
    b.at = now;
  }

  return {
    ratePerSec: rate,
    burst,
    refill,
    /* how many of `want` the bucket grants right now; 0 is an answer, not an error */
    take(want, now) {
      refill(now);
      const n = Math.min(want | 0, Math.floor(b.tokens));
      if (n > 0) b.tokens -= n;
      return n;
    },
    /* hand tokens back — a read that was granted and then refused upstream did not happen */
    refund(n) {
      b.tokens = Math.min(burst, b.tokens + Math.max(0, n | 0));
    },
    /* adopt a clock every isolate agrees on: empty as of `atMs`, refilled from there */
    seed(atMs) {
      b.at = +atMs || 0;
      b.tokens = 0;
    },
    /* the balance as of `now`, without refilling — for a meta answer that must not spend anything */
    peek(now) {
      const at = b.at || now;
      return Math.min(burst, b.tokens + (now > at ? ((now - at) / 1000) * rate : 0));
    },
    /* the balance as of the last refill — for a note written right after a take() */
    tokens() { return b.tokens; },
  };
}
