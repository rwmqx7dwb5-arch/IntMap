/* ============================================================================
 *  #R533 — the Companies tab stops asking a host that no longer exists
 * ----------------------------------------------------------------------------
 *  Two upstreams of the Companies tab were failing on the live site (measured 2026-09-07):
 *
 *    · logo.clearbit.com — 189 × ERR_NAME_NOT_RESOLVED per visit. Clearbit's free Logo API was
 *      deprecated 2025-03-18 and shut down 2025-12-08; the host is gone from DNS (8.8.8.8,
 *      1.1.1.1 and 9.9.9.9 all return the clearbit.com SOA and no A, no CNAME).
 *    · the tab's own three-rung CORS-proxy ladder — Yahoo answers 200 with no ACAO, corsproxy.io
 *      answered 403 and api.allorigins.win answered 522, all at the same time.
 *
 *  The liveness half of this is in tests/prod-smoke.spec.js, where it belongs: a host either
 *  answers or it does not, and only the network can say. What is checked here is the half that can
 *  be decided from the tree — that the structures which produced those two failures are gone, and
 *  that the answer this project already had is the one the code now reaches for.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── ① no shipped code REQUESTS the dead host ─────────────────────────────────────────────────
   Over the whole of js/, not over the one file that had it: #R429's lesson is that a check written
   at one file guards that file and nothing else.

   ⚠ IT ASKS «DOES ANYTHING REQUEST IT», NOT «IS THE NAME PRESENT». The first draft banned the
   spelling outright and went red on nine locale files — which name the host in PROSE, to tell
   readers which source went away and when. A check that bans a name turns the honest explanation
   of a dead source into a test failure, and the pressure it creates is to delete the explanation.
   What separates asking from explaining is the scheme: a URL the code will fetch carries
   `https://`, and the prose says `logo.clearbit.com`. Comments are stripped for the same reason —
   this repository's own notes are allowed to remember what was removed. */
test('① no shipped code requests logo.clearbit.com', () => {
  const files = globSync('js/**/*.js', { cwd: ROOT });
  assert.ok(files.length > 50, 'found js/ modules to scan (got ' + files.length + ')');
  const guilty = files.filter((f) => /https:\/\/logo\.clearbit\.com/.test(stripComments(read(f))));
  assert.deepEqual(guilty, [], 'these still build a URL for the dead Clearbit host: ' + guilty.join(', '));
  /* …and the rung that replaced it reads the shipped index rather than another stranger */
  assert.match(read('js/companies-ui.js'), /function _coLogoSrc\(tk,dom\)\{[\s\S]*?IntMapCompanyData\.logoFor/,
    'the first rung reads the logo out of the shipped company index');
});

/* ── ② the logo the list draws is the one this repository already resolved ─────────────────────
   scripts/companies/build.mjs reads Wikidata P154 and writes a Commons URL. The failure was that
   it only reached profiles/<id>.json, which the list never fetches. */
test('② the shipped company index carries the build-time Commons logo', () => {
  const rows = JSON.parse(read('data/companies/index.json')).companies;
  assert.ok(rows.length > 400, 'index holds companies');
  const withLogo = rows.filter((c) => c.lg);
  assert.ok(withLogo.length > 300, 'most companies ship a logo (got ' + withLogo.length + ')');
  const bad = withLogo.filter((c) => !c.lg.startsWith('https://commons.wikimedia.org/wiki/Special:FilePath/'));
  assert.deepEqual(bad.map((c) => c.id), [], 'every shipped logo is a Commons file path');
  /* and it is the profile's own string, not a second construction of the same URL */
  let compared = 0;
  for (const c of withLogo) {
    const pf = join(ROOT, 'data/companies/profiles', c.id + '.json');
    if (!existsSync(pf)) continue;
    assert.equal(c.lg, JSON.parse(readFileSync(pf, 'utf8')).identity.logo,
      c.id + ': the index logo and the profile logo must be the same string');
    compared++;
  }
  assert.ok(compared > 300, 'compared against the profiles (got ' + compared + ')');
});

/* ── ③ the builder keeps writing it ───────────────────────────────────────────────────────────
   ② measures today's artefact; without this the next full rebuild would silently drop the field
   and ② would only notice after the data had already been regenerated. */
test('③ scripts/companies/build.mjs emits the logo into the index row', () => {
  assert.match(read('scripts/companies/build.mjs'), /lg:\s*profile\.identity\.logo/,
    'the index row takes the logo from the profile it just wrote');
});

/* ── ④ a company with no known logo makes NO request ───────────────────────────────────────────
   The whole defect was 189 requests that could not succeed. The monogram is the answer when the
   index has not landed or holds nothing, and a speculative URL is not. */
test('④ the list falls back to the monogram, never to a guessed logo URL', () => {
  const s = read('js/companies-ui.js');
  assert.match(s, /const src=r\|\|_coLogoSrc\(tk,d\);[\s\S]{0,80}?if\(!src\) return mono\(\);/,
    'an unknown logo yields the monogram rather than an <img> with a guessed src');
  assert.match(s, /if\(s===0&&dom\)\{[^}]*google\.com\/s2\/favicons/,
    'the favicon fallback survives, and only for a company we have a domain for');
});

/* ── ⑤ the private proxy ladder is gone ────────────────────────────────────────────────────────
   `no-ad-hoc-hardcoding` §2.3: the judgement already existed in js/proxy-fetch.js. */
test('⑤ js/companies.js uses the shared relay ladder, not a copy of one', () => {
  const s = read('js/companies.js');
  assert.doesNotMatch(stripComments(s), /corsproxy\.io|allorigins\.win/,
    'no private proxy list survives outside the comments that explain its removal');
  assert.match(s, /HOST\.fetchViaProxy\(u,\s*\{as:'json'/, 'quotes go through the shared ladder');
});

/* ── ⑥ …and the shared ladder offers the new relay for the URLs this file builds ───────────────*/
test('⑥ the shared ladder offers quotes-relay for the URLs companies.js builds', () => {
  const m = /const OWN_RELAYS = \[([\s\S]*?)\n {2}\];/.exec(read('js/proxy-fetch.js'));
  assert.ok(m, 'proxy-fetch publishes a relay table');
  const rows = [...m[1].matchAll(/fn: '([a-z-]+)',\s*test: \(u\) => (\/[^\n]*?\/)\.test\(u\)/g)];
  assert.ok(rows.length >= 2, 'the table holds both relays (got ' + rows.length + ')');
  const quotes = rows.find(([, fn]) => fn === 'quotes-relay');
  assert.ok(quotes, 'quotes-relay is in the table');
  const re = new RegExp(quotes[2].slice(1, -1));

  /* the URLs the app actually builds, taken from the file rather than retyped */
  const built = yahooPrefixes();
  assert.ok(built.length >= 3, 'companies.js builds Yahoo URLs (got ' + built.length + ')');
  for (const u of built) assert.ok(re.test(u), 'quotes-relay would be offered for ' + u);
});

/* Every Yahoo URL js/companies.js builds, with the concatenated values filled in so the string is
   a URL rather than a prefix. Taken from the source so that a new call site joins these checks
   without anyone remembering to add it. */
function yahooPrefixes() {
  const co = read('js/companies.js');
  const out = [];
  for (const m of co.matchAll(/'(https:\/\/query[12]\.finance\.yahoo\.com\/[^']*)'/g)) {
    out.push(m[1]
      .replace(/symbols=$/, 'symbols=AAPL,MSFT')
      .replace(/chart\/$/, 'chart/AAPL')
      .replace(/[?&]period1=$/, '?period1=100&period2=200&interval=1mo'));
  }
  return out;
}

/* ── ⑦ the function on the other side accepts exactly those ────────────────────────────────────
   The browser-side table and the relay's own allow-list are two halves of one rule. A URL the app
   builds, offered to a relay that refuses it, is a wasted round trip that looks like an outage.
   ⚠ The predicate is EVALUATED, not read: #R505 — a check that reads source cannot see what the
   code does. */
test('⑦ quotes-relay accepts the URLs the app builds and refuses everything else', () => {
  const src = read('supabase/functions/quotes-relay/index.ts');
  const body = src.slice(src.indexOf('const SYMBOL_RE'), src.indexOf('Deno.serve'));
  assert.ok(body.includes('function allowed'), 'found the allow-list predicate');
  const allowed = new Function(body + '\nreturn allowed;')();

  for (const u of [
    'https://query1.finance.yahoo.com/v8/finance/spark?symbols=AAPL,MSFT&range=1mo&interval=1d',
    'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d',
    'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?period1=100&period2=200&interval=1mo',
    /* ⚠ BEFORE 1970 IS A REAL WINDOW, AND THE FIRST ALLOW-LIST REFUSED IT. The compare view's time
       series goes back to 1962, so period1/period2 are negative there. Production measured 112 of
       135 calls answered 400 for exactly this, with the graph still drawing because the public
       relays picked up what our own relay had refused — a defect that hides behind its fallback. */
    'https://query1.finance.yahoo.com/v8/finance/chart/KO?period1=-473385600&period2=-441936000&interval=1mo',
  ]) assert.ok(allowed(u), 'should relay ' + u);

  for (const u of [
    'https://query1.finance.yahoo.com/v7/finance/download/AAPL',         // a different endpoint
    'https://finance.yahoo.com/v8/finance/chart/AAPL',                   // a different host
    'http://query1.finance.yahoo.com/v8/finance/chart/AAPL',             // not https
    'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?cookie=x',   // an unlisted parameter
    'https://query1.finance.yahoo.com/v8/finance/spark?range=1mo',       // spark with no symbols
    'https://evil.example/v8/finance/spark?symbols=AAPL',
  ]) assert.ok(!allowed(u), 'must NOT relay ' + u);

  /* and it accepts what the app builds — the same list ⑥ used, so the two halves cannot drift */
  for (const u of yahooPrefixes()) assert.ok(allowed(u), 'the function accepts ' + u);
});

/* ── ⑧ the batch size is the upstream's stated limit, in both halves ───────────────────
   Yahoo answers a 24-symbol spark request with 400 and «Number of symbols needs to be less than or
   equal to 20» (measured 2026-09-07). js/companies.js had been asking for 40, so every batched
   quote 400'd and the tab fell through to ~150 single-symbol requests — the failure #R353's
   production verification recorded as 「ライブ株価の最初の数手は必ず失敗する」 and blamed on the proxies.
   The number appears twice because two processes enforce it; this is what keeps them equal. */
test('⑧ the spark batch size matches the relay cap, and both are the upstream limit', () => {
  const app = /const SPARK_MAX_SYMBOLS\s*=\s*(\d+)/.exec(read('js/companies.js'));
  const fn = /const SPARK_MAX_SYMBOLS\s*=\s*(\d+)/.exec(read('supabase/functions/quotes-relay/index.ts'));
  assert.ok(app, 'js/companies.js names its batch size');
  assert.ok(fn, 'quotes-relay names its cap');
  assert.equal(app[1], fn[1], 'the app batches exactly what the relay will accept');
  assert.equal(Number(app[1]), 20, "Yahoo's stated limit for /v8/finance/spark");
  /* and the batcher actually uses it, rather than naming it beside a literal */
  assert.match(read('js/companies.js'), /const B=SPARK_MAX_SYMBOLS;/,
    'the batch loop uses the constant');
});

/* ── ⑨ the relay is declared, or it does not exist in production ───────────────────────────────
   Asked of the DISK rather than of a hand-written roster (#R529): the set of functions is
   discovered, and config.toml must name exactly it. */
test('⑨ every Edge Function on disk is declared in supabase/config.toml, and vice versa', () => {
  const toml = read('supabase/config.toml');
  assert.match(toml, /^\[functions\.quotes-relay\]/m, 'quotes-relay is declared');
  const declared = [...toml.matchAll(/^\[functions\.([a-z0-9-]+)\]/gm)].map((m) => m[1]).sort();
  const onDisk = globSync('supabase/functions/*/index.ts', { cwd: ROOT })
    .map((p) => p.split(/[\\/]/)[2]).sort();
  assert.ok(onDisk.length >= 15, 'found the functions on disk (got ' + onDisk.length + ')');
  assert.deepEqual(declared, onDisk,
    '_shared/ is a library, not a function — every directory with an index.ts is declared');
});
