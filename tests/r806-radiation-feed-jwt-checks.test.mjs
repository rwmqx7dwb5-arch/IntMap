/* ============================================================================
 *  R806 — every Edge Function block in supabase/config.toml states verify_jwt, right under its header
 * ----------------------------------------------------------------------------
 *  Production measured radiation-feed answering 401 (UNAUTHORIZED_NO_AUTH_HEADER) to every reader:
 *  `supabase functions list` showed verify_jwt=true although #R585 had written `verify_jwt = false`.
 *  #R590 inserted who-don's comment block between `[functions.radiation-feed]` and that line, so the
 *  line became who-don's and radiation-feed was deployed with the default. Nothing in the repository
 *  could see it: the roster gate counts headers, not the setting each header owns.
 *  So the property is stated structurally: a header owns the `verify_jwt =` that follows it, and the
 *  FIRST non-blank, non-comment line after every header must be that setting — a comment cannot be
 *  wedged in between without this going red.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const toml = readFileSync(join(ROOT, 'supabase', 'config.toml'), 'utf8').split(/\r?\n/);

test('every [functions.*] header is followed directly by its own verify_jwt line', () => {
  const problems = [];
  let n = 0;
  toml.forEach((line, i) => {
    const m = /^\[functions\.([a-z0-9-]+)\]\s*$/.exec(line);
    if (!m) return;
    n++;
    let j = i + 1;
    while (j < toml.length && (/^\s*$/.test(toml[j]) || /^\s*#/.test(toml[j]))) j++;
    const next = toml[j] || '';
    if (!/^\s*verify_jwt\s*=\s*(true|false)\b/.test(next)) problems.push(`${m[1]} (line ${i + 1}): the first setting after the header is "${next.trim().slice(0, 60)}" — verify_jwt must come first, so a comment inserted above it cannot hand it to the next function`);
  });
  assert.ok(n >= 5, 'the roster was read (' + n + ' functions)');
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('radiation-feed is public: verify_jwt = false (its readers send no Authorization)', () => {
  const i = toml.findIndex((l) => /^\[functions\.radiation-feed\]/.test(l));
  assert.ok(i >= 0);
  let j = i + 1; while (/^\s*$/.test(toml[j]) || /^\s*#/.test(toml[j])) j++;
  assert.match(toml[j], /^\s*verify_jwt\s*=\s*false\b/);
  /* the client really does send no Authorization — the core's fetch is handed nothing */
  const core = readFileSync(join(ROOT, 'js', 'radiation-obs-core.js'), 'utf8');
  assert.ok(!/Authorization/.test(core), 'js/radiation-obs-core.js sends no Authorization header, so the function must not require one');
});
