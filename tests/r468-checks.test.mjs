/* ============================================================================
 *  R468 — A DIAGNOSTIC HEADER THAT THE BROWSER CANNOT READ IS NOT A DIAGNOSTIC
 * ----------------------------------------------------------------------------
 *  #R464 added `x-intmap-gdelt-cache` / `-age-ms` / `-store` to supabase/functions/gdelt-relay for
 *  one stated reason: a cache that silently fails to persist looks EXACTLY like a cache that is
 *  working — every request becomes a "miss" that returns real data, so the reader sees answers and
 *  only the upstream notices. It proved itself within the hour, reporting `http400:AccessDenied`
 *  the first time the write path ran against production.
 *
 *  Then production verification of #R464 could not read one of them. MEASURED from the live origin,
 *  four fetches of the endpoint: 200 each time, 14 articles each time, and of the response headers
 *  JavaScript could see only the three CORS-safelisted ones — cache-control, content-length,
 *  content-type. The values existed: the same requests issued with curl returned
 *  `x-intmap-gdelt-cache: stale` and `x-intmap-gdelt-age-ms: 5941649`.
 *
 *  ⚠ A browser may not read a response header the server does not name in
 *  `Access-Control-Expose-Headers`, and this function named none. So the diagnostic was present
 *  everywhere except the one surface where the app runs and where the round is verified.
 *
 *  ⚠⚠ AND THE 502 CARRIED NO DIAGNOSTIC AT ALL — which made the outcome a reader actually complains
 *  about the outcome nobody could explain. Measured: an uncached query spent 12.7-14.8 s and
 *  answered 502 with no `x-intmap-*` header of any kind, so 「the cache had nothing」 and 「GDELT
 *  refused a refresh of something we had」 were indistinguishable from outside.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* ⚠ (#R345) a comment that describes the defect is not the defect — this file explains at length
   what used to be missing, and a raw-text search would happily find the words in the explanation */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const RELAY = code('supabase/functions/gdelt-relay/index.ts');

/* Every `x-intmap-…` header the function actually SETS, taken from the source rather than from a
   list this test keeps — a header added later must be exposed too, or this goes red on its own. */
const emitted = [...new Set(
  [...RELAY.matchAll(/["']((?:x-intmap-)[a-z0-9-]+)["']\s*:/gi)].map((m) => m[1].toLowerCase()),
)];

test('R468 ①: every x-intmap header the relay sets is named in Access-Control-Expose-Headers', () => {
  assert.ok(emitted.length >= 3,
    `the relay must still emit its diagnostics (found ${emitted.length}: ${emitted.join(', ')})`);

  const expose = /["']Access-Control-Expose-Headers["']\s*:\s*([\s\S]*?),?\n\s*\}/.exec(RELAY)
    || /["']Access-Control-Expose-Headers["']\s*:\s*((?:[^,]|,(?=\s*["']))*)/.exec(RELAY);
  assert.ok(expose, 'gdelt-relay must declare Access-Control-Expose-Headers at all');
  const exposed = expose[1].toLowerCase();

  emitted.forEach((h) => {
    assert.ok(exposed.includes(h),
      `«${h}» is set on the response but not exposed, so a browser cannot read it. Measured on the `
      + 'live site: four fetches, 200 each, and JavaScript saw only cache-control / content-length / '
      + 'content-type. A diagnostic that is invisible where the app runs is not a diagnostic');
  });
});

test('R468 ②: the failure answer says WHY, the same way the successes do', () => {
  /* the 502 branch — the one a reader actually notices */
  const fail = /return new Response\(JSON\.stringify\(\{ error: "upstream_unavailable" \}\)[\s\S]*?\n {4}\}\);/.exec(RELAY);
  assert.ok(fail, 'the cold-and-refused branch must still exist');
  assert.match(fail[0], /x-intmap-gdelt-cache["']\s*:\s*["']cold["']/,
    'a 502 must say the cache was COLD — otherwise "we had nothing" and "GDELT refused a refresh of '
    + 'something we had" look identical from outside, and only one of them is worth retrying');
  assert.match(fail[0], /\.\.\.CORS/,
    'the failure answer must carry the same CORS block, or the browser cannot read its diagnostic either');
});

test('R468 ③: the exposure list is not a hand-written copy that can drift', () => {
  /* Both aviation-feed and this relay declare the header; the point of ① is that the list is
     checked against what the code EMITS. Guard the shape that makes that check meaningful. */
  assert.match(RELAY, /Access-Control-Expose-Headers/,
    'the header must be declared in gdelt-relay itself');
  const guard = code('supabase/functions/_shared/relay-guard.js');
  assert.ok(!/Access-Control-Expose-Headers/.test(guard),
    'corsFor() deliberately does NOT expose anything: each relay names its own headers, so a shared '
    + 'default cannot quietly expose a header some other function did not mean to publish');
});
