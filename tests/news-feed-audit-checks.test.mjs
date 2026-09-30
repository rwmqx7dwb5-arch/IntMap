/* ============================================================================
 *  IntMap · #R372 — the audit's A tier (news fetch, lazy chunks, nightly, i18n gate, FX, climate raster)
 * ----------------------------------------------------------------------------
 *  全リポジトリ監査の A 段 7 件。主題が 1 つではない（監査の結論ごとに 1 検査）ので、監査の単位で残した。
 *
 *  ⚠ 主題単位へ統合した検査（旧ラウンド単位のファイルから、題名を保ったまま移した）。
 *    各節はブロックに包んであり、補助の名前は節ごとに閉じている（別ファイルだった頃と同じ隔離）。
 *    「綴りのまま:」の注記は、評価に置き換えられない検査がなぜそうなのかを 1 行で言う。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { resolveValue as zResolve, tokens as zTokens } from '../scripts/z-layers.mjs';
import { readSpec } from '../scripts/architecture-spec.mjs';

/* ════════ #R372 — from tests/r372-checks.test.mjs ════════ */
{
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
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raw = (p) => readLF(resolve(ROOT, p));
const code = (p) => codeOnly(raw(p));

/* ── A2 the redeploy ───────────────────────────────────────────────────────────────────────── */

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
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

/* 綴りのまま: 主張が CSS / HTML の規則・markup の存在で、それが当たるか（計算済みスタイル）はブラウザにしか無い */
test('R372 ② the reload prompt is PRESSABLE — it is not the pointer-events:none toast', () => {
  const css = raw('css/intmap.css');
  /* .sat-toast is deliberately pointer-events:none so a toast never eats a map drag. A button
     inside one cannot be clicked, which is why this prompt has a class of its own. */
  assert.match(css, /\.sat-toast\b[^{]*\{[^}]*pointer-events\s*:\s*none/,
    'the toast is still click-through (that is what it is for)');
  const m = /\.im-reload\s*\{([^}]*)\}/.exec(css);
  assert.ok(m, 'the reload prompt has its own class');
  assert.ok(!/pointer-events\s*:\s*none/.test(m[1]), 'and it is not click-through');
  assert.match(m[1], /z-index\s*:\s*[^;]+/, 'it declares a stacking order');
  /* a chunk that 404s DURING boot leaves the launch screen up, so the prompt has to be above it.
     (map-a11y-structure) both read a named layer now — resolved through the stylesheet's own tokens */
  const zOf = (block) => zResolve(/z-index\s*:\s*([^;]+)/.exec(block)[1], zTokens(css));
  const zPrompt = zOf(m[1]);
  const splash = /\.boot-splash\s*\{([^}]*)\}/.exec(css);
  if (splash && /z-index\s*:\s*[^;]+/.test(splash[1])) {
    assert.ok(zPrompt > zOf(splash[1]),
      'above the launch screen, or a boot-time failure is invisible');
  }
});

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
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

/* 綴りのまま: 対象は CI の workflow・文書で、実行されるのは GitHub 上（ここでは記述を確かめるしかない） */
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

/* 綴りのまま: 対象は CI の workflow・文書で、実行されるのは GitHub 上（ここでは記述を確かめるしかない） */
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

/* 綴りのまま: 主張が配線・不在・一意性（どこが何を呼ぶか／無いこと／1 か所だけ）で、評価して取り出せる値が無い */
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

/* 綴りのまま: 主張が「この呼び出しの前にある／この順で書かれている」という構造で、評価して比べる値が無い */
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

/* 綴りのまま: 対象は CI の workflow・文書で、実行されるのは GitHub 上（ここでは記述を確かめるしかない） */
test('R372 ⑧ Architecture.md §10.1 states the MEASURED open gap', () => {
  /* #R334 found these numbers stale, and they were stale again here (275 across two files, when
     one of the two had been at zero for rounds). scripts/doc-facts.mjs now compares them, so this
     check exists to say that the rule is wired up rather than to re-copy the numbers. */
  const df = code('scripts/doc-facts.mjs');
  assert.match(df, /i18n-open-gap/, 'check:docs owns the comparison');
  assert.match(df, /i18n-pair-audit/, 'against the audit, not against a number copied into the script');
  const arch = readSpec(ROOT);   /* the spec: the map and its chapters (architecture-split) */
  assert.ok(!/analysis-panels\.js`?\s*132/.test(arch),
    'the file that reached zero is no longer listed as carrying 132');
});

/* ── A5 the catalogue ─────────────────────────────────────────────────────────────────────── */

/* 綴りのまま: 対象は CI の workflow・文書で、実行されるのは GitHub 上（ここでは記述を確かめるしかない） */
test('R372 ⑨ the TLE snapshot finishes the job it starts', () => {
  const wf = raw('.github/workflows/tle-refresh.yml');
  /* (perf-baseline-auto-tighten) the landing moved into a local composite action shared with
     perf-ceiling.yml; the workflow must still reach it, and the lander must still do every step. */
  assert.match(wf, /uses:\s*\.\/\.github\/actions\/land-bot-pr/, 'the catalogue is landed by the shared lander');
  const y = raw('.github/actions/land-bot-pr/action.yml');
  /* Opening the PR was never the last step: a PR authored by github-actions[bot] has its checks
     parked at `action_required`, so EVERY scheduled run from 2026-08-01 came back at 0 s and the
     three that ever landed landed because a person clicked Approve. */
  assert.match(wf, /actions:\s*write/, 'it may approve the runs it caused');
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

test('R372 ⑩ a rate-limited candidate is skipped, not re-asked every minute', async () => {
  const js = code('js/widget-defs-data.js');
  /* getJSON() classified the 429 all along; firstOf()'s catch threw the classification away and
     fell to the next URL, so the scheduler's rate-limited state was structurally unreachable and
     the widget kept spending a 61/h keyless quota on a 60 s timer. */
  /* ⚠ (tests-by-topic) EVALUATED: the shipped `coolUntil` / `coolingMs` / `getJSON` / `firstOf` are
     lifted as one region and run against a fetch that answers 429 for the first host — instead of
     the file being searched for the words `rateLimited`, `coolUntil` and `cool`. */
  const a = js.indexOf('var coolUntil = {};');
  const i = js.indexOf('function firstOf(', a);
  assert.ok(a > 0 && i > a, 'the cooldown and firstOf() are one region of js/widget-defs-data.js');
  let depth = 0, end = -1;
  for (let k = js.indexOf('{', i); k < js.length; k++) {
    if (js[k] === '{') depth++;
    else if (js[k] === '}' && !--depth) { end = k; break; }
  }
  const asked = [];
  const answer = { A: { status: 429, retry: '60' }, B: { status: 200, body: { rate: 1.5 } } };
  const fetchStub = async (url) => {
    asked.push(url);
    const r = answer[url];
    return { status: r.status, ok: r.status === 200, headers: { get: (h) => (h === 'retry-after' ? r.retry || null : null) },
      json: async () => r.body };
  };
  const firstOf = new Function('fetch', js.slice(a, end + 1) + '\nreturn firstOf;')(fetchStub);
  const got = await firstOf(['A', 'B']);
  assert.deepEqual([got.value, got.url], [{ rate: 1.5 }, 'B'], 'the fallback answers, and says it was the fallback');
  assert.deepEqual(asked, ['A', 'B']);
  asked.length = 0;
  await firstOf(['A', 'B']);
  assert.deepEqual(asked, ['B'], 'a URL that answered 429 is not asked again inside the window it named');
  asked.length = 0;
  await assert.rejects(async () => firstOf(['A']), (e) => e.rateLimited === true && e.retryAfterMs > 0,
    'when every candidate is cooling, nothing is asked and the group is told it is rate limited');
  assert.deepEqual(asked, [], '…without spending a request');
});

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
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

test('R372 ⑫ the ticker does not re-send a refused URL through the proxy ladder', async () => {
  const js = code('js/map-ui.js');
  /* fjson() walked corsproxy.io and allorigins.win with the SAME dead URL because it only looked
     at r.ok — so one 429 cost three requests. A proxy is the answer to "CORS blocked us", not to
     "the upstream said 429". */
  /* ⚠ (tests-by-topic) EVALUATED: the shipped `fjson` and `PEER_REFUSED` are run against a peer
     that refuses and a peer that errors, and the rungs it actually asked are counted — instead of
     the one-line function being searched for `PEER_REFUSED` and `i===0&&`. */
  const f = /async function fjson\(url\)\{.*/.exec(js);
  assert.ok(f, 'fjson() is still the ladder');
  const pr = /const PEER_REFUSED\s*=\s*new Set\(\[[^\]]*\]\);/.exec(js);
  assert.ok(pr, 'the refusals are one declared set');
  const run = (script, extraRelay) => {
    const asked = [];
    const fjson = new Function('rungs', 'readWithin', 'clockFor', pr[0] + '\n' + f[0] + '\nreturn fjson;')(
      (url) => [url, 'relay:' + url].concat(extraRelay ? ['relay2:' + url] : []),
      async (u) => { asked.push(u); const r = script(u); return { ok: r.status === 200, status: r.status, text: r.text || '' }; },
      () => 0);
    return { fjson, asked };
  };
  /* a 429 from the peer itself stops the ladder: one request, not one per rung */
  const refused = run(() => ({ status: 429 }));
  assert.equal(await refused.fjson('https://peer.test/q'), null);
  assert.deepEqual(refused.asked, ['https://peer.test/q'], 'a refusal from the peer stops the ladder');
  /* a failure that is not a refusal still walks on to the relay */
  const flaky = run((u) => (u.startsWith('relay:') ? { status: 200, text: '{"p":1}' } : { status: 503 }));
  assert.deepEqual(await flaky.fjson('https://peer.test/q'), { p: 1 }, 'a busy peer is still answered through the relay');
  assert.equal(flaky.asked.length, 2);
  /* ⚠ only the DIRECT attempt (i===0) may conclude «the peer refused» — a relay's own status is
     ambiguous (the relay itself may be the one that is busy). Asked with a third rung behind the
     relay, because with two rungs a relay that «stops the ladder» and a relay that is simply the
     last rung are indistinguishable. */
  const relayRefuses = run((u) => (u.startsWith('relay:') ? { status: 429 }
    : u.startsWith('relay2:') ? { status: 200, text: '{"q":2}' } : { status: 0 }), true);
  assert.deepEqual(await relayRefuses.fjson('https://peer.test/q'), { q: 2 },
    'and only the direct attempt is read that way — a relay’s 429 does not stop the descent');
  assert.equal(relayRefuses.asked.length, 3);
});

/* ── the invariant tests/r209 ① was defending ─────────────────────────────────────────────── */

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R372 ⑬ news is not fetched for a reader who has not asked for it', () => {
  const body = code('js/app-body.js');
  /* js/lazy-modules.js and docs/NEWS-EVENTS.md §12 both promise the Event module does not arrive
     until the News surface is opened. It arrived on every cold load, because the boot called
     fetchData() and the Event branch reached need('newsEvents') unconditionally. */
  assert.match(body, /fetchData\(\s*\{\s*background:\s*true\s*\}\s*\)/, 'the boot pass is marked background');
  /* ⚠ (#R408) the three-minute timer is an entry on js/runtime.js's one wheel now. The claim is
     that the TIMER's pass is marked background — not which function armed it — so the needle takes
     the new arming and leaves the assertion alone. */
  assert.match(body, /everyTick\([^)]*180000,\s*\(\)\s*=>\s*fetchData\(\s*\{\s*background:\s*true\s*\}\s*\)/,
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

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
test('R372 ⑮ opening the News surface asks — the boot pass is not what the tab was living on', () => {
  /* ⚠ THE REGRESSION ⑬ CAUSED, FOUND IN PRODUCTION. setMode() calls renderUI(), never fetchData();
     the News tab worked only because the boot pass had already filled globalData. With ⑬ in place
     and nothing else asking, opening News painted 「Loading articles...」 and stayed there — measured
     on the deployed site: 0 requests to news_events / news_sources / the relay after the click, and
     window.IntMapNewsEvents still undefined. Opening the surface IS the gesture, so startNews()
     asks when it has nothing. */
  const feed = code('js/news-feed.js');
  const sn = /function startNews\(\)\s*\{([\s\S]{0,900}?)HOST\.newsFiltered/.exec(feed);
  assert.ok(sn, 'startNews() still starts by checking what it has');
  assert.match(sn[1], /globalData\.length\s*===\s*0/, 'it still detects the empty case');
  assert.match(sn[1], /fetchData\(\s*\)/, '…and now asks for the data instead of only painting «loading»');
  /* ⚠ ONE SHOT: fetchData() calls startNews() back on success, so an unguarded call is a loop. */
  assert.match(sn[1], /!\s*_asked/, 'guarded by the same latch, so a fetch that finds nothing does not re-ask');
  /* ⚠ AND THE LATCH IS DECLARED ABOVE BOTH READERS — a `let` below a function that reads it is a
     TDZ waiting for the first caller that runs early (this repo has paid for that across chunks). */
  assert.ok(feed.indexOf('let _asked') < feed.indexOf('function startNews'),
    'the latch is declared before the first function that reads it');
  assert.equal((feed.match(/let _asked/g) || []).length, 1, 'declared exactly once');
});

/* ── A7 the climate raster ────────────────────────────────────────────────────────────────── */

/* 綴りのまま: 対象は DOM・地図（MapLibre / WebGL）に触れる closure の中で、ブラウザの外では走らない（実ブラウザ側は spec が持つ） */
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
}
