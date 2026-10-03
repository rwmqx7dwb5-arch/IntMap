/* ============================================================================
 *  volcano-feed-weekly — the weekly report's publisher refused the relay; that is said, not crashed
 * ----------------------------------------------------------------------------
 *  Measured 2026-10-03: `volcano-feed?feed=weekly` answered 502 {"error":"upstream_error"} on every
 *  call, and every volcano card put a console error behind it. The cause was neither a moved URL nor a
 *  broken parse: volcano.si.edu answers every non-browser client 403 with `cf-mitigated: challenge`
 *  (a human-verification page), the RSS URL and the site root alike.
 *
 *  The function is EVALUATED (its Deno.serve handler is captured and called with a stubbed upstream),
 *  not read as text (intmap-edge-function-must-be-evaluated).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let HANDLER = null;
globalThis.Deno = { env: { get: () => '' }, serve: (h) => { HANDLER = h; } };
await import(pathToFileURL(join(ROOT, 'supabase/functions/volcano-feed/index.ts')).href);
assert.equal(typeof HANDLER, 'function', 'the function did not reach Deno.serve');

const ask = async (upstream, feed = 'weekly') => {
  globalThis.fetch = async (input) => {
    const u = String((input && input.url) || input);
    if (!u.startsWith('https://volcano.si.edu/') && !u.startsWith('https://aviationweather.gov/')) throw new Error('unexpected host ' + u);
    return upstream();
  };
  return HANDLER(new Request('https://edge.test/functions/v1/volcano-feed?feed=' + feed));
};
const challenge = () => new Response('<html><title>Smithsonian request verification</title></html>',
  { status: 403, headers: { 'content-type': 'text/html; charset=UTF-8', 'cf-mitigated': 'challenge' } });

test('① a refused weekly report is a 200 that says it was refused, with status and time', async () => {
  const res = await ask(challenge);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.deepEqual(j.rows, []);
  assert.equal(j.unavailable.status, 403);
  assert.equal(j.unavailable.reason, 'upstream_http_403');
  assert.ok(!Number.isNaN(Date.parse(j.unavailable.checkedAt)), 'checkedAt is not a time');
  /* not cached for an hour: the publisher may lift the check */
  assert.match(res.headers.get('cache-control'), /s-maxage=600\b/);
});

test('② a network failure is still the relay\'s own 502, not "unavailable"', async () => {
  const res = await ask(() => { throw new TypeError('connection reset'); });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, 'upstream_unreachable');
});

test('③ the ash feed\'s refusal is untouched (it is a safety claim, not this change)', async () => {
  const res = await ask(challenge, 'ash');
  assert.equal(res.status, 502);
});

test('④ the reader treats it as its own state and the card says so', () => {
  const js = readFileSync(join(ROOT, 'js/volcano-intel.js'), 'utf8');
  assert.ok(/j&&j\.unavailable\)\s*mark\(k,null,null,j\.unavailable\)/.test(js), 'pull() does not route unavailable');
  assert.ok(/state='unavailable'/.test(js), 'no unavailable state');
  assert.ok(/FEEDS\.weekly\.state==='unavailable'/.test(js), 'the card does not state the refusal');
});
