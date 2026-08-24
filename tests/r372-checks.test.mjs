/* ============================================================================
 *  IntMap · #R372 source checks — the audit's A tier, minus the phone
 * ----------------------------------------------------------------------------
 *  Seven findings from a full-repo/CI/Supabase/production audit. What they had in common was
 *  not a broken feature — every gate was green. It was that each one had an instrument pointed
 *  slightly away from the thing that was wrong:
 *
 *    A2  a redeploy 404s the chunks an open tab names, `vite:preloadError` was listened for
 *        NOWHERE, and need() memoised the failure for the life of the tab.
 *    A3  the nightly deep tier had been green ZERO times in sixteen scheduled runs; three of
 *        those never ran at all (cancelled by a merge sharing its concurrency group), and
 *        deep-alarm keyed on junit `classname` — a FILE name — so it could not name one test.
 *    A4  check:i18n printed «OPEN GAP 143» three lines under «every language is complete» and
 *        exited 0. The 143 turned out to be unreachable code, which is the ONLY reason they are
 *        harmless — so the gate now measures the unreachability, not just the count.
 *    A5  the bundled satellite catalogue was fourteen days old because a PR opened by
 *        github-actions[bot] parks its checks at `action_required` and nobody clicked.
 *    A6  the FX primary returned 429 every load: firstOf() dropped the classification, so the
 *        scheduler's rate-limit ladder was unreachable and the app spent its own 61/h quota.
 *    A7  `Style is not done loading.` × 2 per boot, both addSource('src-climate'): the one
 *        default-on layer with no retry ladder.
 *    +   tests/r209 ① was red for a REAL reason — `newsEvents` came down on boot, against what
 *        js/lazy-modules.js and docs/NEWS-EVENTS.md §12 both promise.
 *
 *  ⚠ THE SOURCE IS READ THROUGH readLF AND STRIPPED THROUGH THE SHARED codeOnly (#R317, #R345):
 *  a `\n`-anchored regex on a CRLF checkout is permanently red on Windows and permanently green
 *  in CI, and a check that reads its own explanatory comment is the shape this project has paid
 *  for eleven times. Every assertion below is against CODE, never against a comment.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raw = (p) => readLF(resolve(ROOT, p));
const code = (p) => codeOnly(raw(p));

/* ── A2 the redeploy ───────────────────────────────────────────────────────────────────────── */

test('R372 ① a chunk that 404s reaches a reader — vite:preloadError is listened for', () => {
  const html = code('index.html');
  assert.match(html, /addEventListener\(\s*['"]vite:preloadError['"]/,
    'nothing listened for it before this round, so 404ing chunks were silent');
  /* ⚠ the import MUST still reject — js/lazy-modules.js learns the module is missing from the
     rejection, so a preventDefault() here would trade a visible prompt for a dead entry point. */
  const idx = html.indexOf('vite:preloadError');
  assert.ok(!/preventDefault/.test(html.slice(idx, idx + 400)),
    'the event is observed, not consumed');
});

test('R372 ② the reload prompt is PRESSABLE — it is not the pointer-events:none toast', () => {
  const css = raw('css/intmap.css');
  /* .sat-toast is deliberately pointer-events:none so a toast never eats a map drag. A button
     inside one cannot be clicked, which is why this prompt has a class of its own. */
  assert.match(css, /\.sat-toast\b[^{]*\{[^}]*pointer-events\s*:\s*none/,
    'the toast is still click-through (that is what it is for)');
  const m = /\.im-reload\s*\{([^}]*)\}/.exec(css);
  assert.ok(m, 'the reload prompt has its own class');
  assert.ok(!/pointer-events\s*:\s*none/.test(m[1]), 'and it is not click-through');
  assert.match(m[1], /z-index\s*:\s*(\d+)/, 'it declares a stacking order');
  /* a chunk that 404s DURING boot leaves the launch screen up, so the prompt has to be above it */
  const zPrompt = +/z-index\s*:\s*(\d+)/.exec(m[1])[1];
  const splash = /\.boot-splash\s*\{([^}]*)\}/.exec(css);
  if (splash && /z-index\s*:\s*(\d+)/.test(splash[1])) {
    assert.ok(zPrompt > +/z-index\s*:\s*(\d+)/.exec(splash[1])[1],
      'above the launch screen, or a boot-time failure is invisible');
  }
});

test('R372 ③ a DOWNLOAD failure is forgotten; a failure after the file arrived is not', () => {
  /* ⚠ MEASURED, AND IT BOUNDS WHAT THIS CAN CLAIM: in Chromium, after one 404 the SAME URL keeps
     failing even once the server recovers — the failure lives in the module map, per spec — and only
     a different URL (`?r=1`) succeeds. Vite needs literal specifiers for code-splitting, so we cannot
     add one. Forgetting the memo therefore does NOT recover a 404'd chunk; what it buys is that one
     404 stops answering `false` for the life of the tab, and that failures recorded BEFORE the module
     map (a dependency, our own checks) become retryable. The reload prompt in ① is the actual cure. */
  const js = code('js/lazy-modules.js');
  /* Before this round `P[name]` kept the promise that resolved false and nothing ever deleted an
     entry, so ONE 404 answered false to every later click for the life of the tab. */
  assert.match(js, /delete\s+P\[\s*name\s*\]/,
    'the download failure is dropped from the memo so a retry is possible');
  assert.match(js, /FAILED\s*\[\s*name\s*\]\s*=/, 'and a short window keeps a render loop from hammering');
  /* ⚠ hint() must not decide for need(): a preload that missed used to kill the click behind it. */
  const hint = /function\s+hint\s*\([^)]*\)\s*\{[^}]*\}/.exec(js);
  assert.ok(hint, 'hint() is still there');
  assert.ok(!/\bneed\s*\(/.test(hint[0]),
    'hint() no longer goes through the public need() door, so its failures are marked as preloads');
  /* the public door takes ONE argument, so a stray .map(need) cannot mark a real click as a preload */
  assert.match(js, /function\s+need\s*\(\s*name\s*\)\s*\{\s*return\s+demand\s*\(\s*name\s*,\s*false\s*\)/,
    'need() is the 1-arg door');
});

/* ── A3 the nightly ───────────────────────────────────────────────────────────────────────── */

test('R372 ④ the nightly cannot be cancelled by a merge — and push/PR are byte-for-byte unchanged', () => {
  for (const [f, tag] of [['.github/workflows/ci.yml', 'nightly'], ['.github/workflows/security.yml', 'weekly']]) {
    const y = raw(f);
    const g = /^concurrency:\s*\n\s*group:\s*(.+)$/m.exec(y);
    assert.ok(g, `${f} declares a concurrency group`);
    assert.match(g[1], /github\.event_name\s*==\s*'schedule'/, `${f}: a schedule gets its own group`);
    assert.ok(g[1].includes(`'${tag}'`), `${f}: …named ${tag}`);
    /* ⚠ THE OTHER HALF OF THE ASSERTION. Every other event must still fall through to github.ref,
       or this "fix" would stop a new commit from superseding an in-flight run on the same branch. */
    assert.match(g[1], /\|\|\s*github\.ref/, `${f}: everything else still keys on github.ref`);
    assert.match(y, /cancel-in-progress:\s*true/, `${f}: newer commits still supersede older runs`);
  }
});

test('R372 ⑤ the deep-tier alarm can name a failing TEST, not just a file', () => {
  const js = code('scripts/deep-alarm.mjs');
  /* Playwright's junit reporter writes `classname` = the spec FILE and `name` = the test title,
     so a key of classname alone collapses every test in a file into one entry — and the AND-fold
     below it then reports the file only when ALL of its tests are red. Measured on a real CI
     junit.xml: 96 testcases, 16 distinct classnames, 96 distinct classname+name. */
  /* the literal `\bname="` — the \b is IN the source regex, to stop it matching `classname="` */
  assert.match(js, /\\bname="/, 'the name attribute is read, anchored so classname cannot satisfy it');
  assert.ok(/›/.test(js), 'and joined to the classname to make a per-test key');
  /* It must stay non-fatal: the alarm REPORTS, it does not decide the build — a nightly that fails
     its own alarm job would hide the failure it was built to publish. The one non-zero exit is the
     usage guard, which is a wiring mistake rather than a test result. */
  const bad = [...js.matchAll(/process\.exit\(\s*([1-9]\d*)\s*\)/g)];
  assert.equal(bad.length, 1, 'exactly one non-zero exit');
  const at = js.indexOf(bad[0][0]);
  assert.match(js.slice(Math.max(0, at - 300), at), /usage:/, 'and it is the usage guard, not a verdict');
});

/* ── A4 the honest gate ───────────────────────────────────────────────────────────────────── */

test('R372 ⑥ the i18n gate measures WHY the 143 are exempt, not just how many', () => {
  const js = code('scripts/i18n-audit.mjs');
  /* The 143 adjacent-data tuples in js/reference-data.js are tolerable for exactly one reason:
     renderDashboard() returns renderCompanies() before the code that would draw them. A ceiling
     that counts only the number cannot notice that reason going away. */
  assert.match(js, /companies-ui/, 'the gate reads the file that holds the delegation');
  assert.match(js, /renderCompanies/, 'and looks for the delegation itself');
  /* and it must still be a two-way ratchet on the count */
  assert.match(js, /PAIR_CEILING/, 'the count ratchet survives');
  assert.ok(/pairs\.total\s*>\s*PAIR_CEILING/.test(js) && /pairs\.total\s*<\s*PAIR_CEILING/.test(js),
    'in both directions');
});

test('R372 ⑦ the delegation the exemption rests on is still the first statement', () => {
  /* This is the fact the gate above measures, asserted here too so that a change to either one
     is visible on its own. If the Information dashboard ever comes back, BOTH go red and the
     143 rows need real text in nine languages. */
  const js = code('js/companies-ui.js');
  const m = /function\s+renderDashboard\s*\(\s*\)\s*\{([\s\S]{0,400})/.exec(js);
  assert.ok(m, 'renderDashboard() exists');
  assert.match(m[1], /^\s*try\s*\{\s*return\s+renderCompanies\s*\(\s*\)\s*;?\s*\}\s*catch/,
    'it still delegates before anything else — the reason the OPEN GAP is not a live English fallback');
});

test('R372 ⑧ Architecture.md §10.1 states the MEASURED open gap', () => {
  /* #R334 found these numbers stale, and they were stale again here (275 across two files, when
     one of the two had been at zero for rounds). scripts/doc-facts.mjs now compares them, so this
     check exists to say that the rule is wired up rather than to re-copy the numbers. */
  const df = code('scripts/doc-facts.mjs');
  assert.match(df, /i18n-open-gap/, 'check:docs owns the comparison');
  assert.match(df, /i18n-pair-audit/, 'against the audit, not against a number copied into the script');
  const arch = raw('Architecture.md');
  assert.ok(!/analysis-panels\.js`?\s*132/.test(arch),
    'the file that reached zero is no longer listed as carrying 132');
});

/* ── A5 the catalogue ─────────────────────────────────────────────────────────────────────── */

test('R372 ⑨ the TLE snapshot finishes the job it starts', () => {
  const y = raw('.github/workflows/tle-refresh.yml');
  /* Opening the PR was never the last step: a PR authored by github-actions[bot] has its checks
     parked at `action_required`, so EVERY scheduled run from 2026-08-01 came back at 0 s and the
     three that ever landed landed because a person clicked Approve. */
  assert.match(y, /actions:\s*write/, 'it may approve the runs it caused');
  assert.match(y, /actions\/runs\/\$\{?RUN\}?\/approve/, 'and does');
  assert.match(y, /gh pr merge/, 'and lands the catalogue rather than leaving it open');
  /* ⚠ a cancelled run is NOT a red one — ci.yml cancels in-progress runs when the branch moves,
     and the aggregating job reports `core: cancelled` as exit 1. Measured while writing this. */
  assert.match(y, /cancelled/, 'it tells a cancellation apart from a failure');
  assert.match(y, /gh run rerun/, 'and re-runs rather than refusing the catalogue');
  /* it must NOT merge a red PR */
  assert.match(y, /::error::the pull request's checks are red/, 'red still stops the merge');
});

/* ── A6 the exchange rate ─────────────────────────────────────────────────────────────────── */

test('R372 ⑩ a rate-limited candidate is skipped, not re-asked every minute', () => {
  const js = code('js/widget-defs-data.js');
  /* getJSON() classified the 429 all along; firstOf()'s catch threw the classification away and
     fell to the next URL, so the scheduler's rate-limited state was structurally unreachable and
     the widget kept spending a 61/h keyless quota on a 60 s timer. */
  assert.match(js, /rateLimited/, 'the classification exists');
  assert.match(js, /coolUntil|coolingMs/, 'and a cooled URL is remembered');
  const fo = /function\s+firstOf\s*\([\s\S]*?\n\s{0,2}\}/.exec(js);
  assert.ok(fo, 'firstOf() is still the ladder');
  assert.ok(/cool/i.test(fo[0]), 'and it consults the cooldown before asking');
});

test('R372 ⑪ the FX card names the provider that ANSWERED', () => {
  const js = code('js/widget-defs-markets.js');
  /* A fixed literal 'fxratesapi / er-api' printed the first name even on the loads where the
     fallback answered — the #R352 shape: a source line that is not a measurement. */
  assert.ok(!/source:\s*['"]fxratesapi \/ er-api['"]/.test(js), 'the fixed literal is gone');
  assert.match(js, /fxProvider/, 'the source is derived from the URL that resolved');
  /* er-api is the primary now: fxratesapi has no key and a 61/h quota. Assert the ORDER. */
  const loader = /requestKey:\s*function[\s\S]{0,1200}?fxProvider/.exec(js) || [js];
  const iEr = loader[0].indexOf('open.er-api.com'), iFx = loader[0].indexOf('api.fxratesapi.com');
  assert.ok(iEr > -1 && iFx > -1, 'both candidates are still there — fxratesapi was demoted, not deleted');
  assert.ok(iEr < iFx, 'and er-api is asked first');
});

test('R372 ⑫ the ticker does not re-send a refused URL through the proxy ladder', () => {
  const js = code('js/map-ui.js');
  /* fjson() walked corsproxy.io and allorigins.win with the SAME dead URL because it only looked
     at r.ok — so one 429 cost three requests. A proxy is the answer to "CORS blocked us", not to
     "the upstream said 429". */
  const f = /async function fjson\(url\)\{.*/.exec(js);
  assert.ok(f, 'fjson() is still the ladder');
  assert.match(f[0], /PEER_REFUSED/, 'a refusal from the peer stops the ladder');
  /* ⚠ only the DIRECT attempt (i===0) may conclude «the peer refused» — a relay's own status is
     ambiguous (the relay itself may be the one that is busy), so the ladder still walks past those. */
  assert.match(f[0], /i\s*===\s*0\s*&&/, 'and only the direct attempt is read that way');
  assert.match(js, /PEER_REFUSED\s*=\s*new Set\(\[[^\]]*429/, '429 is one of the refusals');
});

/* ── the invariant tests/r209 ① was defending ─────────────────────────────────────────────── */

test('R372 ⑬ news is not fetched for a reader who has not asked for it', () => {
  const body = code('js/app-body.js');
  /* js/lazy-modules.js and docs/NEWS-EVENTS.md §12 both promise the Event module does not arrive
     until the News surface is opened. It arrived on every cold load, because the boot called
     fetchData() and the Event branch reached need('newsEvents') unconditionally. */
  assert.match(body, /fetchData\(\s*\{\s*background:\s*true\s*\}\s*\)/, 'the boot pass is marked background');
  assert.match(body, /setInterval\(\s*\(\)\s*=>\s*fetchData\(\s*\{\s*background:\s*true\s*\}\s*\)/,
    'and so is the three-minute timer');

  const feed = code('js/news-feed.js');
  const fd = /async function fetchData\(\s*opts\s*\)\s*\{([\s\S]{0,900})/.exec(feed);
  assert.ok(fd, 'fetchData takes the option');
  assert.match(fd[1], /opts\s*&&\s*opts\.background/, 'and honours it');
  /* ⚠ THE EARLY RETURN MUST COME BEFORE THE EVENT BRANCH *AND* BEFORE THE RSS PATH. Moving the
     need() call alone would not have helped: the Event branch RETURNS on success, so skipping it
     falls through to the self-relay plus four public proxies — ~50 requests — for a reader who
     never opened the News tab. */
  const iReturn = fd[1].indexOf('return');
  assert.ok(iReturn > -1, 'it returns early');
  assert.ok(feed.indexOf("need('newsEvents')") > feed.indexOf('opts.background'),
    'the gate is upstream of the module fetch');
  /* a reader whose saved mode IS the news surface has already asked */
  assert.match(fd[1], /HOST\.mode\s*!==\s*'news'/, 'a cold start straight into News still fetches');
});

/* ── A7 the climate raster ────────────────────────────────────────────────────────────────── */

test('R372 ⑭ Köppen retries the style instead of throwing past the change listener', () => {
  const js = code('js/data-layers.js');
  /* Both uncaught exceptions on the deployed site were addSource('src-climate'), thrown from
     inside a `change` listener where app-body's try{} around dispatchEvent cannot see them.
     src-subcables threw 53 times in the same load and reached nobody, because it has the ladder. */
  assert.ok(!/else if\(id===['"]climate['"]\)\{\s*addKoppen\(\);/.test(js.replace(/\s+/g, ' ').replace(/ /g, ''))
    || /_koppenBuild|_koppenAgain/.test(js), 'the bare call has a ladder behind it now');
  assert.match(js, /_koppenAgain|_koppenRetry/, 'there is a retry');
  assert.match(js, /events\.on\(\s*['"]styledata['"]/, 'woken by the renderer rather than only by a timer');
  /* ⚠ AND THE HORIZON MUST NOT BURN WHILE THE DOCUMENT IS HIDDEN. MapLibre reaches its own
     _load() through frameAsync() — requestAnimationFrame — so a document that is never
     composited never finishes parsing its style. Measured 5/5 with a control: rAF firing → 0
     exceptions and 63 layers; rAF never firing → 2 exceptions and 0 layers. A stopwatch would
     spend the whole horizon while the renderer was not running at all. */
  const again = /function\s+_koppenAgain\s*\(\s*\)\s*\{([\s\S]{0,600}?)\n\s{0,4}\}/.exec(js);
  assert.ok(again, '_koppenAgain() exists');
  assert.match(again[1], /document\.hidden/, 'a hidden document does not consume the horizon');
  /* ⚠ NOT a swallow: giving up must not leave the box ticked and silent forever without a word */
  assert.match(js, /console\.warn\('addKoppen/, 'a real give-up says so');
});
