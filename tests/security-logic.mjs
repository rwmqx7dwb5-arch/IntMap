// ============================================================================
//  IntMap — security-logic tests (#R138). Pure Node (node:test), no Deno runtime
//  required (CI has none). Three kinds of assertion:
//    1. UNIT tests of behaviour that can run here: the constant-time secret
//       comparison refresh-news uses, and the admin console's data-literal PARSER.
//    2. SOURCE regression guards: the security-critical Edge Functions, the service
//       worker and the two HTML pages are read and asserted to still hold their
//       invariants, so a future edit cannot silently reintroduce the fail-OPEN
//       refresh-news guard, a URL-query secret, an unauthenticated ai-proxy, an
//       uncapped prompt/image input, an unbounded relay, a cache-first service
//       worker that trusts a path on any host, or admin.html's eval.
//    3. SUPPLY-CHAIN guards: every remote GitHub Action pinned to a full-length
//       commit SHA, and no third-party CDN in the operator console's auth path.
//  ⚠ EVERY ASSERTION HERE IS A RELATION, NEVER THIS ROUND'S LITERAL. Eight tests in
//  this repo went red on the hardening they were written to protect because they
//  pinned an expression instead of the property; that lesson applies here first.
//  Run: node --test tests/security-logic.mjs   (also part of `npm test`).
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* ⚠ COMMENTS ARE NOT CODE, AND THIS FILE HAS BEEN CAUGHT BY THAT ELEVEN TIMES (see
   memory/intmap-recurring-lessons.md). Notes that DESCRIBE a removed construct would otherwise match
   the grep that checks the construct is gone, so anything asserting an absence reads code only. */
/* ⚠ AND IT WAS CAUGHT BY ITS OWN TWELFTH INSTANCE ON THE FIRST RUN. The naive block-comment rule
   `/\*[\s\S]*?\*\/` OPENS on the `/*` inside `https://*.supabase.co` — a CSP host pattern in
   admin.html's <meta> — and closed 12,076 characters later on the first real comment terminator,
   swallowing the SDK <script> tag that this file then reported as missing. So: HTML comments first,
   and a block comment may not begin immediately after a `/` or a `:`, which is what a URL looks like. */
const codeOnly = (s) => s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/(^|[^:/])\/\*[\s\S]*?\*\//g, '$1 ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const refreshNews = read('supabase/functions/refresh-news/index.ts');
const aiProxy = read('supabase/functions/ai-proxy/index.ts');
const relayGuard = read('supabase/functions/_shared/relay-guard.js');
const sw = read('sw.js');
const adminHtml = read('admin.html');
const indexHtml = read('index.html');
const RELAYS = ['alerts-relay', 'cable-geo', 'news-relay', 'sv-cov'];
const FUNCTIONS = ['ai-proxy', 'alerts-relay', 'aviation-feed', 'cable-geo', 'delete-account', 'monitor-run', 'news-relay', 'refresh-news', 'routing-relay', 'sv-cov'];

// ---- Mirror of refresh-news timingSafeEqual (kept in lock-step; unit-tested here) ----
function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

test('timingSafeEqual: equal strings compare true', () => {
  assert.equal(timingSafeEqual('s3cr3t-token', 's3cr3t-token'), true);
  assert.equal(timingSafeEqual('', ''), true);
});

test('timingSafeEqual: any difference compares false', () => {
  assert.equal(timingSafeEqual('s3cr3t-token', 's3cr3t-tokeX'), false); // last byte differs
  assert.equal(timingSafeEqual('Xs3cr3t-token', 's3cr3t-token'), false); // length differs
  assert.equal(timingSafeEqual('secret', ''), false);
  assert.equal(timingSafeEqual('secret', 'secret ') , false);            // trailing space
});

test('timingSafeEqual: the mirror matches the source (same algorithm shape)', () => {
  // The source must implement a constant-time compare (no early-return === on the secret).
  assert.match(refreshNews, /function timingSafeEqual/);
  assert.match(refreshNews, /diff \|=/);            // accumulates, no early break
  assert.doesNotMatch(refreshNews, /got !== secret/); // the old timing-unsafe compare is gone
});

test('refresh-news is FAIL-CLOSED: unset REFRESH_SECRET refuses every request (503)', () => {
  // With the secret unset the function must return 503 "not_configured" and never run.
  assert.match(refreshNews, /const secret = Deno\.env\.get\("REFRESH_SECRET"\) \|\| ""/);
  assert.match(refreshNews, /if \(!secret\)/);
  assert.match(refreshNews, /not_configured/);
  assert.match(refreshNews, /status: 503/);
});

test('refresh-news reads the secret ONLY from a header, never a URL query string', () => {
  assert.match(refreshNews, /req\.headers\.get\("x-refresh-secret"\)/);
  // The old query-string channel (leaks the secret into access logs) must be gone.
  assert.doesNotMatch(refreshNews, /searchParams\.get\(\s*["']secret["']\s*\)/);
});

test('refresh-news only runs on POST (GET/others rejected)', () => {
  assert.match(refreshNews, /req\.method !== "POST"/);
  assert.match(refreshNews, /method_not_allowed/);
});

test('ai-proxy REQUIRES a valid JWT (login) before doing any work', () => {
  assert.match(aiProxy, /auth\.getUser\(\)/);
  assert.match(aiProxy, /if \(!user\) return json\(\{ error: "auth"/);
});

test('ai-proxy enforces the per-user daily quota via the SECURITY DEFINER RPC', () => {
  assert.match(aiProxy, /increment_ai_usage/);
  assert.match(aiProxy, /error: "limit"/);
  assert.match(aiProxy, /}, 429\)/);           // over-quota → 429
});

test('ai-proxy caps prompt and image input (no unbounded request)', () => {
  assert.match(aiProxy, /MAX_PROMPT = \d/);
  assert.match(aiProxy, /MAX_IMAGES = \d/);
  assert.match(aiProxy, /\.slice\(0, MAX_PROMPT\)/);
  /* ⚠ «THE IMAGE LIST IS BOUNDED» IS THE PROPERTY. `.slice(0, MAX_IMAGES)` was one way to hold it, and
     it was the WEAK way: four images each just under the per-image limit is four times the per-image
     limit, and slicing a list says nothing about how big its members are. The loop that replaced it
     stops on the count AND on the running total, so this asserts both bounds exist and are used. */
  assert.match(aiProxy, /imgs\.length >= MAX_IMAGES/, 'the number of images is not bounded');
  assert.match(aiProxy, /total \+ n > MAX_IMAGES_BYTES/, 'the total decoded size is not bounded');
});

/* ── the bounds ai-proxy grew, each one measured against what the client actually sends ────────── */
test('ai-proxy bounds the REQUEST, not just the parsed fields', () => {
  /* the old order was `await req.json()` first and MAX_* afterwards, i.e. the whole body was read and
     parsed before anything limited it */
  assert.match(aiProxy, /MAX_BODY_BYTES\s*=/, 'no ceiling on the request body');
  assert.match(aiProxy, /content-length[\s\S]{0,200}MAX_BODY_BYTES/, 'a declared length is not refused up front');
  assert.match(aiProxy, /byteLength > MAX_BODY_BYTES/, 'an undeclared length is not refused after reading');
  const bodyRead = aiProxy.indexOf('req.arrayBuffer()');
  assert.ok(bodyRead > 0, 'the body is not read as bytes, so it cannot be measured before parsing');
});

test('ai-proxy validates images: MIME allow-list, base64 alphabet, decoded size', () => {
  const proxyCode = codeOnly(aiProxy);
  assert.match(proxyCode, /IMAGE_MIME = new Set\(\[/, 'any image/* subtype is accepted');
  /* svg is a DOCUMENT format with script in it; the old regex `image/[a-zA-Z0-9.+-]+` said yes to it */
  assert.ok(!/["']image\/svg/.test(proxyCode), 'svg is an accepted image type');
  assert.match(proxyCode, /\[A-Za-z0-9\+\/\]\+=\{0,2\}/, 'the base64 payload is not constrained to the base64 alphabet');
  assert.match(aiProxy, /b64Bytes\(b64\) > MAX_IMAGE_BYTES/, 'a single image has no decoded-size ceiling');
});

test('ai-proxy accepts only known tasks and bounded schemas', () => {
  assert.match(aiProxy, /const TASKS = new Set\(\[/, 'task is still an arbitrary string');
  assert.match(aiProxy, /!TASKS\.has\(task\)/, 'an unknown task is not refused');
  assert.match(aiProxy, /MAX_SCHEMA_BYTES|MAX_SCHEMA_DEPTH|MAX_SCHEMA_KEYS/, 'a caller schema has no bounds');
  assert.match(aiProxy, /schemaOk\(payload\.schema\)/, 'the schema bounds are declared but not applied');
  /* prototype-pollution keys must not survive into a provider request */
  assert.match(aiProxy, /__proto__[\s\S]{0,60}constructor/, 'schema keys are not screened for prototype names');
});

test('ai-proxy never returns or logs the upstream body', () => {
  const code = codeOnly(aiProxy);
  assert.ok(!/bodySnippet/.test(code), 'a slice of the provider error body is still carried in meta');
  assert.match(code, /bodyLen/, 'the replacement (a length, not a body) is missing');
  /* the two places that used to hand an exception message to the caller */
  assert.ok(!/message: String\(\(e as Error\)\?\.message \|\| e\)/.test(code),
    'an exception message is still returned to the caller');
});

test('ai-proxy grants the developer override by USER ID, not by e-mail', () => {
  const code = codeOnly(aiProxy);
  assert.ok(!/DEFAULT_DEV_EMAILS/.test(code), 'a hard-coded developer e-mail list is back');
  assert.ok(!/@privaterelay\.appleid\.com/.test(code), 'a real e-mail address is compiled into a public repo');
  assert.ok(!/user\.email/.test(code), 'the privilege still depends on a mutable e-mail field');
  assert.match(code, /DEV_USER_IDS/, 'the id-based override is missing');
});

/* ── delete-account: one transaction, and the auth user only after it succeeds ─────────────────── */
test('delete-account purges data transactionally and is fail-CLOSED', () => {
  const fn = codeOnly(read('supabase/functions/delete-account/index.ts'));
  assert.match(fn, /rpc\("delete_account_data"/, 'the per-table loop is back');
  assert.ok(!/OWNED_BY_USER_ID/.test(fn), 'the hard-coded table list is back');
  /* the point of no return must be AFTER the purge, and guarded by its result */
  const purge = fn.indexOf('delete_account_data');
  const authDel = fn.indexOf('auth.admin.deleteUser');
  assert.ok(purge > 0 && authDel > purge, 'the auth user is deleted before/without the data purge');
  assert.match(fn.slice(purge, authDel), /return json\(\{ error: "delete_failed"/,
    'a failed purge does not stop the auth deletion');
});

test('delete_account_data discovers its tables and verifies nothing survives', () => {
  const mig = readdirSync(join(ROOT, 'supabase/migrations'))
    .map((f) => read('supabase/migrations/' + f))
    .find((t) => t.includes('function public.delete_account_data'));
  assert.ok(mig, 'the transactional purge function is not in a migration');
  assert.match(mig, /security definer/i, 'it cannot reach RLS-protected tables');
  assert.match(mig, /set search_path = ''/, 'a definer function without a pinned search_path');
  assert.match(mig, /pg_catalog\.pg_constraint/, 'the owned tables are listed rather than discovered');
  assert.match(mig, /raise exception[\s\S]{0,120}rows left/i, 'it does not verify that nothing survives');
  assert.match(mig, /revoke execute on function public\.delete_account_data\(uuid\) from public, anon, authenticated/i,
    'any logged-in caller can erase another account');
});

/* ── the four keyless public relays share one set of bounds ────────────────────────────────────── */
test('every keyless relay is GET-only, bounded, and typed', () => {
  assert.match(relayGuard, /AbortSignal\.timeout\(timeoutMs\)/, 'the shared fetch has no deadline');
  assert.match(relayGuard, /maxBytes/, 'the shared fetch has no byte ceiling');
  assert.match(relayGuard, /reader\.cancel\(\)/, 'an oversized body is drained instead of cut off');
  assert.match(relayGuard, /contentTypeRe/, 'the shared fetch cannot require a content type');
  for (const fn of RELAYS) {
    const s = read(`supabase/functions/${fn}/index.ts`);
    assert.match(s, /_shared\/relay-guard\.js/, `${fn}: not using the shared bounds`);
    assert.match(s, /req\.method !== "GET"|methodGate\(req/, `${fn}: not GET-only`);
    assert.match(s, /maxBytes/, `${fn}: no response-size ceiling`);
  }
});

test('no keyless relay echoes an upstream exception message', () => {
  for (const fn of RELAYS) {
    const s = codeOnly(read(`supabase/functions/${fn}/index.ts`));
    assert.ok(!/error: String\(/.test(s), `${fn}: an exception message is returned to the caller`);
    assert.ok(!/e\.message/.test(s), `${fn}: an exception message is returned to the caller`);
  }
});

test('alerts-relay dedupes and keeps the caller-sized country cap', () => {
  const s = read('supabase/functions/alerts-relay/index.ts');
  /* js/world-packs.js asks for MA_PER_TICK = 6 at most; the relay used to allow 40, each up to ~10 MB */
  assert.match(s, /MA_MAX_COUNTRIES = (\d+)/, 'the country cap is not named');
  const cap = +(/MA_MAX_COUNTRIES = (\d+)/.exec(s) || [0, 0])[1];
  const perTick = +(/MA_PER_TICK\s*=\s*(\d+)/.exec(read('js/world-packs.js')) || [0, 0])[1];
  assert.ok(perTick > 0, 'the client no longer states how many it asks for');
  assert.equal(cap, perTick, `the relay cap (${cap}) must equal what the client asks for (${perTick})`);
  assert.match(s, /new Set\([\s\S]{0,240}MA_MAX_COUNTRIES/, 'repeated country names are not deduplicated');
});

test('sv-cov validates the tile coordinate against the pyramid', () => {
  const s = read('supabase/functions/sv-cov/index.ts');
  assert.match(s, /Math\.pow\(2, \+z\)/, 'x/y are only checked for being digits');
  assert.match(s, /\+v >= span/, 'x/y are not compared against 2^z');
});

/* ── the service worker ────────────────────────────────────────────────────────────────────────── */
test('the service worker matches hosts on a dot boundary, never a bare suffix', () => {
  const code = codeOnly(sw);
  assert.match(code, /function hostMatches\(h, list\)/, 'the shared host test is gone');
  assert.match(code, /h === t \|\| h\.endsWith\('\.' \+ t\)/, 'the dot boundary is gone');
  assert.ok(!/h\.endsWith\(t\)/.test(code), 'a dotless suffix test is back (notapi.mapbox.com matches api.mapbox.com)');
});

test('the service worker will not cache a path match on an arbitrary host', () => {
  const code = codeOnly(sw);
  assert.match(code, /TILE_PATH_RULES/, 'the path rules are not host-scoped');
  assert.match(code, /r\.hosts\.indexOf\(h\) !== -1 && u\.pathname\.indexOf\(r\.path\)/,
    'a path rule can match a host that is not on its own list');
  assert.ok(!/TILE_PATHS\.some\(\(p\) => u\.pathname\.indexOf\(p\)/.test(code),
    'the host-free path match is back — any origin serving /terrarium/ becomes cacheable');
});

test('the prefetch port verifies the sender, the URLs, and its own limits', () => {
  const code = codeOnly(sw);
  assert.match(code, /senderIsOurWindow/, 'any sender is accepted');
  assert.match(code, /self\.clients\.get\(src\.id\)/, 'the sender is not resolved to a real client');
  assert.match(code, /if \(!isTileRequest\(u\)\) continue/, 'the tile allow-list is not applied to prefetch URLs');
  assert.match(code, /PREFETCH_URL_MAX/, 'a URL of any length is queued');
  assert.match(code, /credentials: 'omit'/, "a prefetch can carry the reader's cookies");
  assert.match(code, /MAX_ENTRY_BYTES/, 'a single response has no size ceiling');
  assert.match(code, /MAX_CACHE_BYTES/, 'the cache has no capacity ceiling');
});

/* ── admin.html ────────────────────────────────────────────────────────────────────────────────── */
test('the admin console runs no chosen file as code, and loads its SDK first-party', () => {
  const code = codeOnly(adminHtml);
  assert.ok(!/\beval\s*\(/.test(code), 'the starter-dataset import is executing the file again');
  assert.ok(!/document\.write\s*\(/.test(code), 'a script tag is being written into the parser again');
  assert.ok(!/cdn\.jsdelivr\.net/.test(code), 'a third-party CDN is back in the admin auth path');
  assert.match(code, /src="vendor\/supabase-js\.js"/, 'the vendored SDK is not loaded');
  assert.match(code, /IntMapAdminLiteral/, 'the data-literal parser is not used');
  const csp = /content="([^"]*default-src[^"]*)"/.exec(adminHtml);
  assert.ok(csp, 'admin.html has no CSP');
  assert.ok(!/unsafe-eval/.test(csp[1]), "admin.html's CSP still grants 'unsafe-eval'");
  assert.ok(!/jsdelivr/.test(csp[1]), "admin.html's CSP still allows a CDN script host");
});

/* The parser itself — a real unit test, not a grep. It sets a global when imported (it is a classic
   script in the browser), which is why this is an await import() rather than a named import. */
test('the admin data-literal parser reads data and refuses everything else', async () => {
  await import('../js/admin-literal.js');
  const P = globalThis.IntMapAdminLiteral;
  assert.ok(P && typeof P.parse === 'function', 'js/admin-literal.js published no parser');

  /* the shapes the historical intmap.html datasets are written in — all must still parse */
  assert.deepEqual(P.parse("{a:1,b:'x',c:[1,2,3,],d:{e:true,f:null}}"), { a: 1, b: 'x', c: [1, 2, 3], d: { e: true, f: null } });
  assert.deepEqual(P.parse("[1,-2,+3,0x10,1e3,.5]"), [1, -2, 3, 16, 1000, 0.5]);
  assert.deepEqual(P.parse("{ 'q-k':1, 2:'two', ident:3 }"), { 'q-k': 1, 2: 'two', ident: 3 });
  assert.deepEqual(P.parse("{ /* c */ a:1 // line\n }"), { a: 1 });
  assert.deepEqual(P.parse("{loc:[139.69,35.68],name:{en:'Tokyo',jp:'\u6771\u4eac'}}"), { loc: [139.69, 35.68], name: { en: 'Tokyo', jp: '\u6771\u4eac' } });
  assert.deepEqual(P.parse("['a\\nb','\\u0041',\"it's\"]"), ['a\nb', 'A', "it's"]);
  assert.deepEqual(P.parse("{a:`multi\nline`}"), { a: 'multi\nline' });

  /* …and everything that is not data is a SyntaxError, not a behaviour */
  for (const bad of [
    '{a:[].constructor}', '{a:alert(1)}', '{a:1}()', '`a${1}b`', '{...x}', '[1,,2]',
    '{get x(){return 1}}', '{a:(function(){return 1})()}', 'x', '{a:1};alert(1)',
  ]) {
    assert.throws(() => P.parse(bad), SyntaxError, `parsed something that is not data: ${bad}`);
  }
  /* __proto__ must not reach an object literal — that is a prototype write, not a key */
  assert.throws(() => P.parse('{__proto__:{polluted:1}}'), SyntaxError);
  assert.throws(() => P.parse('{"__proto__":{"polluted":1}}'), SyntaxError);
  assert.equal({}.polluted, undefined, 'Object.prototype was polluted');
});

/* ── index.html: the policy and the telemetry ──────────────────────────────────────────────────── */
test("index.html's CSP names every fetch directive it relies on", () => {
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(indexHtml);
  assert.ok(csp, 'index.html has no CSP');
  const p = csp[1];
  for (const d of ['default-src', 'base-uri', 'object-src', 'form-action', 'frame-src',
    'worker-src', 'connect-src', 'img-src', 'style-src', 'font-src', 'script-src']) {
    assert.ok(p.includes(d + ' '), `CSP does not name ${d}`);
  }
  assert.match(p, /default-src 'self'/, 'an unnamed directive falls back to nothing');
  assert.match(p, /object-src 'none'/);
  /* the only external stylesheet and font host in the tree */
  assert.match(p, /style-src[^;]*fonts\.googleapis\.com/);
  assert.match(p, /font-src[^;]*fonts\.gstatic\.com/);
  /* jsDelivr is only ever a fetch() target here; nothing loads a <script> from it any more */
  assert.ok(!/script-src[^;]*jsdelivr/.test(p), 'a CDN script host nothing uses is still allowed');
});

test('session replay does not start while an auth credential is in the URL', () => {
  /* GA was already given a scrubbed page_location; Clarity records the URL and a DOM replay, and an
     OAuth/magic-link return carries code/access_token/token_hash for the length of a round trip. */
  assert.match(indexHtml, /__imScrubAuthUrl/, 'the GA scrubber is gone');
  /* the WHOLE tag block, not a byte window around the URL — a window is a magic number that breaks the
     next time a comment is written above the code it is trying to read (tests/r230-checks ⑥ did). */
  const at = indexHtml.indexOf('clarity.ms/tag/');
  const clarity = indexHtml.slice(indexHtml.lastIndexOf('<script', at), indexHtml.indexOf('</script>', at));
  assert.match(clarity, /access_token|token_hash/, 'the Clarity tag does not check the URL for a credential');
  assert.match(clarity, /if\(!authy\(\)\)/, 'the Clarity tag is inserted without the check');
});

/* ── supply chain ──────────────────────────────────────────────────────────────────────────────── */
/* ⚠ THE SHA-PINNING CHECK IS NOT HERE. It lives in scripts/static-checks.mjs, which already parses
   every workflow — this round's first draft added a second copy here, which is the accumulation the
   repo's own budget rules exist to stop. One rule, one home, and this note so the next round does not
   re-add it. */
test('every Edge Function in the tree is declared in config.toml, and _shared is not one', () => {
  const cfg = read('supabase/config.toml');
  const dirs = readdirSync(join(ROOT, 'supabase/functions'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name).sort();
  assert.deepEqual(dirs, FUNCTIONS, 'the set of Edge Functions changed — update config.toml and this list');
  for (const fn of dirs) assert.match(cfg, new RegExp(`\\[functions\\.${fn}\\]`), `${fn} is not declared in config.toml`);
  assert.ok(!/\[functions\._shared\]/.test(cfg), '_shared is a library directory, not a deployable function');
});

test('no Edge Function resolves a dependency from a third-party CDN', () => {
  for (const fn of FUNCTIONS) {
    const dir = join(ROOT, 'supabase/functions', fn);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts') && !f.endsWith('.js')) continue;
      const s = readFileSync(join(dir, f), 'utf8');
      assert.ok(!/from "https:\/\//.test(s), `${fn}/${f} imports over http — pin it in that function's deno.json`);
    }
    const dj = join(dir, 'deno.json');
    if (existsSync(dj)) {
      const map = JSON.parse(readFileSync(dj, 'utf8'));
      for (const [k, v] of Object.entries(map.imports || {})) {
        assert.match(v, /^npm:.*@\d+\.\d+\.\d+$/, `${fn}: ${k} is not pinned to an exact npm version`);
      }
    }
  }
});

test('the production build publishes no source maps', () => {
  const vite = read('vite.config.js');
  assert.ok(!/sourcemap:\s*true/.test(codeOnly(vite)), 'sourcemap: true republishes every original source');
  assert.match(vite, /sourcemap: process\.env\.IM_SOURCEMAP/, 'source maps are not opt-in');
});

test('ai-proxy does not log the prompt / provider key / JWT', () => {
  // Telemetry logging must be metadata-only. Assert the prompt variable is never passed to console.*.
  const logCalls = [...aiProxy.matchAll(/console\.(?:error|log|warn|info)\(([^\n]*)/g)].map((m) => m[1]);
  for (const c of logCalls) {
    assert.doesNotMatch(c, /\bprompt\b/, `a console call references prompt: ${c}`);
    assert.doesNotMatch(c, /\bkey\b/, `a console call references key: ${c}`);
    assert.doesNotMatch(c, /authHeader|Authorization|jwt/i, `a console call references the JWT: ${c}`);
  }
});
