/* ============================================================================
 *  nightly-observers-after-boot — the deep tier's three reds of 2026-09-26 were the observers
 * ----------------------------------------------------------------------------
 *  ① a stub for an upstream matches the upstream whether the page asks it directly or through a
 *    relay of ours (tests/r170 had been reading the live AAPL price from production)
 *  記録: dev-notes/2026-09-27-nightly-observers-after-boot.md
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upstreamOf } from './helpers/network.js';

test('① upstreamOf unwraps a relay of ours and leaves everything else alone', async () => {
  const up = 'https://query1.finance.yahoo.com/v8/finance/spark?symbols=AAPL&range=1d';
  /* the relay URL is built by the page's own router, not spelled here */
  globalThis.window = globalThis.window || {};
  globalThis.window.SUPABASE_URL = 'https://example.supabase.co';
  const pf = await import('../js/proxy-fetch.js');
  const relayed = pf.ownRelayUrl(up);
  assert.ok(relayed && relayed !== up, `the page routes this upstream through a relay (${relayed})`);
  assert.equal(upstreamOf(relayed), up);
  assert.equal(upstreamOf(up), up, 'a direct request is its own upstream');
  assert.equal(upstreamOf('https://example.supabase.co/functions/v1/news-relay'), 'https://example.supabase.co/functions/v1/news-relay', 'a relay call with no `u` is not unwrapped');
  assert.equal(upstreamOf('not a url'), 'not a url');
});
