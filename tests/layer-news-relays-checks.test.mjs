/* ============================================================================
 *  News on the map: our own relays, the proxy router, news pins and saved snapshots
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r212-checks.test.mjs, tests/r215-checks.test.mjs, tests/r216-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r212-checks.test.mjs — 2 of its 15 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/app-body.js・js/news-ui.js・js/weather.js は DOM と描画に閉じていて node では組み立てられない（proxy-fetch は import して評価している） */
/* (#R212) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ── 12. the news says where a story came FROM, or says it does not know ───────────────────────── */
/* ⚠⚠ (#R416) THIS TEST'S FIRST HALF GUARDED A MECHANISM THAT NO LONGER EXISTS — the same shape
   #R276 found in ⑬ below. #R212 answered 「ニュースの発信地が全然発信地の場所になっていない」 by
   forbidding the publisher branch from borrowing the subject's coordinates. #R416 removed that
   branch, and the toggle above it, because in the surface that is now the DEFAULT it did something
   worse than borrowing: an 出来事 has no publisher location at all, so pressing it scattered 200 of
   200 events to invented coordinates (measured — DEV-NOTES #R416).
   ⚠ THE INVARIANT IS KEPT, FROM THE OTHER SIDE. What #R212 protected is that a pin never claims an
   origin it does not have; with only one placement left, the way to break that promise again is to
   bring the branch back — so this asserts it is ABSENT. The rest of the test, which is about
   resolving an outlet from its URL, is untouched and still runs.
   ⚠ The needle is code-shaped for the same reason tests/r416-checks ⑤ is: this comment names the
   removed mechanism, and a test that banned the WORD would fail on its own prose. */
test('R212 ⑫: a news pin never claims an origin it does not have', () => {
  const app = read('js/app-body.js');
  assert.ok(!/if\(newsPinMode==='publisher'\)\{/.test(app),
    'the publisher pin branch must stay removed — it placed events at invented coordinates (#R416)');
  assert.match(app, /function applyPinMode\(a\)\{/, 'the one placement rule is still here');
  const ctx = read('js/news-context.js');
  assert.match(ctx, /function matchPublisher\(publisher,link\)/, 'the outlet can be resolved from its URL too');
  assert.match(ctx, /_hostKey\(publisher\), _hostKey\(link\)/, 'both the publisher string and the link are tried');
  assert.match(ctx, /label:publisher, place:/, 'a place-name match labels the pin with the OUTLET, not the city');
});

/* ── 13. no request waits forever ──────────────────────────────────────────────────────────────── */
test('R212 ⑬: the news proxies and the wind grid both carry a deadline', () => {
  const pf = read('js/proxy-fetch.js');
  assert.match(pf, /const PROXY_TIMEOUT_MS = \d+/);
  /* ⚠ (#R452) THE PROPERTY IS 「EACH RACER HAS ITS OWN CLOCK」; the exact third argument was one way
     of holding it. It is now `Math.min(PROXY_TIMEOUT_MS, left())` — still a per-racer clock, and
     additionally one that cannot outlast the budget the caller named, which is strictly stronger.
     Pinning the old spelling would have failed the day the guarantee got better. */
  assert.match(pf, /fetchDeadline\(make\(url\),[\s\S]{0,48}PROXY_TIMEOUT_MS[\s\S]{0,48}ctls\[i\]\)/, 'each racer has its own clock');
  assert.match(pf, /ctls\.forEach\(\(c\) => \{ try \{ c\.abort\(\)/, 'and the losers are aborted when one wins');
  /* the import may name what else the core takes from the router (stalled-fetch-and-surface-gauge: `clockFor`) */
  assert.match(read('js/app-body.js'), /import \{[^}]*\bfetchViaProxy\b[^}]*\} from '\.\/proxy-fetch\.js'/, 'and the core just imports it');
  /* ⚠⚠ (#R276) THE SECOND HALF OF THIS TEST GUARDED A MECHANISM THAT NO LONGER EXISTS, AND THE
     PROPERTY IT WAS FOR IS NOW SATISFIED MORE STRONGLY. #R212's report was 「Wind(animated)が表示
     されるまでが非常に遅い」, and its answer was a deadline on each of the five chunked Open-Meteo
     point requests the wind field was assembled from. #R276 removed the requests: the field is the
     ECMWF IFS `.om` file, read once through the Open-Meteo SDK (which carries its own
     AbortController) after ONE metadata fetch through the guarded client. So the check is that the
     wind layer asks for no per-point weather at all — a stronger statement than 「each of its many
     requests has a clock」, and one that cannot be satisfied by re-adding the grid. */
  const w = read('js/weather.js') + read('js/wx-ecmwf.js') + read('js/wx-wind.js');
  assert.doesNotMatch(w, /api\.open-meteo\.com\/v1\/forecast/,
    'the wind field must not be built from point-forecast requests');
  assert.doesNotMatch(w, /latitude='\+lats\.join|latitude='\+las\.join/,
    '…and certainly not from a joined list of coordinates');
  assert.match(read('js/wx-ecmwf.js'), /window\.IntMapWx && window\.IntMapWx\.guardedJSON/,
    'the one metadata fetch goes through the guarded client, which is where the deadline and the breaker live');
});
}

/* ══════════ from tests/r215-checks.test.mjs — 1 of its 19 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/app-body.js・js/news-ui.js・js/weather.js は DOM と描画に閉じていて node では組み立てられない（proxy-fetch は import して評価している） */
/* (#R215) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ═══ ⑥ A SAVED ★ CARD CANNOT TAKE THE LIST DOWN WITH IT ═════════════════════════════════════
   「★保存…（追記：いやその時は保存されるけど数日後とかには消えるって話だわボケ）」 */
test('R215 ⑥: a snapshot always carries an analysis object, and the renderer does not assume', () => {
  const nu = read('js/news-ui.js');
  assert.match(nu, /function snapAnalysis/, 'there is one place that shapes a snapshot’s analysis');
  const code = nu.replace(/\/\*[\s\S]*?\*\//g, '');   /* the prose still NAMES the old shape, on purpose */
  assert.equal(/analysis:\s*null/.test(code), false, 'nothing writes a null analysis any more — that is what threw');
  /* merge() must normalise records written by an OLDER build, or the fix never reaches existing stars */
  const merge = nu.slice(nu.indexOf('merge(feed,links)'), nu.indexOf('merge(feed,links)') + 700);
  assert.match(merge, /snapAnalysis/, 'records already on disk are normalised on the way out');
  /* ⚠ (#R386) the window is 1600, not 900: the renderer gained the EVENT branch of the star
     (an event's ★ is keyed by its public_id, not by a link), which sits above this guard. The
     guard itself has not moved relative to the card — only its byte offset has. */
  const batch = nu.slice(nu.indexOf('function appendNewsBatch'), nu.indexOf('function appendNewsBatch') + 1600);
  assert.match(batch, /if\(!item\.analysis\|\|typeof item\.analysis!=='object'\)/,
    'and the card renderer guards, because one throw inside forEach ends the whole batch');
});
}

/* ══════════ from tests/r216-checks.test.mjs — 2 of its 23 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: supabase/functions/<名前>/index.ts は Deno.serve の中で上流を読む Edge Function で、ここでは起動しない（起動して測る検査は tests/layer-ais-ships-checks の #R510 ⑨⑩⑪） */
/* (#R216) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')
  : readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
/* ⚠ a comment that DESCRIBES a defect is not the defect. Two checks below assert that a string does
   NOT appear in a file, and both files explain in prose why it must not — so they are read with the
   block comments taken out, or the note about the bug would trip the test for the bug. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ── ① the news relay: our own origin first, and the URL allow-list is real ────────────
   ⚠ (#R533) THIS TEST USED TO PIN FOUR SPELLINGS, AND ALL FOUR WERE HOW IT HAPPENED TO BE WRITTEN.
   It required the literal `news-relay?u=`, the byte offset of that literal against
   `api.allorigins.win`, the exact ternary `? [(x) => \`${base}/functions/v1/news-relay`, and a
   `relayable = (u) => /^https:\/\/news\.google\.com` binding. When #R533 generalised the single
   hard-coded relay into the OWN_RELAYS table — because the Companies tab's share prices needed the
   same treatment, and a second caller is evidence that the first was never a special case — every
   one of those four went red WITHOUT ANY GUARANTEE CHANGING.
   #R488's lesson: pin the fact, not the characters. What #R216 actually bought is three facts, and
   they are what is asserted now. */
test('#R216 ① proxy-fetch offers the Supabase relay FIRST, and reads SUPABASE_URL at call time', async () => {
  /* (consolidation) EVALUATED. The router is imported the way the app imports it and ASKED which
     relay it offers (`ownRelayUrl`, the published door onto the same table the race reads), with
     `window.SUPABASE_URL` changed between calls — so «read at call time», «ours alone» and «only
     for the URLs its allow-list answers» are what the module does, not how it is spelled. */
  const realWindow = globalThis.window;
  globalThis.window = { SUPABASE_URL: '' };
  try {
    const { ownRelayUrl } = await import(new URL('../js/proxy-fetch.js', import.meta.url).href);
    const FEED = 'https://news.google.com/rss/search?q=x';
    const at = (base) => base + '/functions/v1/news-relay?u=' + encodeURIComponent(FEED);

    /* (a) the list is built INSIDE a function — a base captured when the module is evaluated would
       be '' for the whole session, because src/vendor.js may not have run yet */
    /* (own-fetch-relay) the function also takes the caller's `as` now (only an article caller is offered the
       article rule); what matters is that the list is a function of the call, not a module constant */
    assert.equal(ownRelayUrl(FEED), '', 'with no base yet there is no relay to offer');
    globalThis.window.SUPABASE_URL = 'https://a.test';
    assert.equal(ownRelayUrl(FEED), at('https://a.test'), 'SUPABASE_URL must be read at call time, not at module evaluation');
    globalThis.window.SUPABASE_URL = 'https://b.test/';
    assert.equal(ownRelayUrl(FEED), at('https://b.test'), '…every call, against the base as it is now');

    /* (b) our own Edge Functions are what is offered — the defect was a Japanese reader waiting out a
       ladder of PUBLIC relays that could not read that edition. #R216 put ours at the head; (own-fetch-relay)
       there is now nothing behind it, so the list the router builds is ours and only ours. */
    for (const u of ['https://example.com/rss/search?q=x', 'https://example.com/feed.xml'])
      assert.equal(ownRelayUrl(u), '', 'a URL none of our relays admits is offered nothing — no public relay stands behind ours: ' + u);
    /* spelling kept for the absence of the named public relays: an absence is a property of the code */
    assert.doesNotMatch(code('js/proxy-fetch.js'), /PUBLIC_PROXIES|corsproxy\.io|allorigins\.win|corsfix\.com|codetabs\.com/,
      'no public relay stands behind ours (own-fetch-relay)');

    /* (c) …and each is offered only for the URLs its own allow-list will answer */
    assert.ok(ownRelayUrl(FEED).includes('/functions/v1/news-relay?u='), 'news-relay is offered for the feed URLs it serves');
    assert.ok(!/news-relay/.test(ownRelayUrl('https://example.com/rss/search?q=x')),
      'news-relay is NOT offered for URLs it would refuse');
  } finally { globalThis.window = realWindow; }
});

test('#R216 ① the news-relay function is an allow-list, and refuses a non-feed body', () => {
  const s = read('supabase/functions/news-relay/index.ts');
  assert.match(s, /u\.hostname\s*!==\s*"news\.google\.com"/, 'the host is not pinned');
  /* ⚠ «THE PATH IS PINNED» IS THE PROPERTY; `startsWith("/rss/")` was one (loose) way of holding it.
     It accepted /rss/articles/CBMi… — the aggregator redirect every Google News item links to — so the
     relay would follow an arbitrary Google-hosted redirect target server-side. The rule is now the two
     endpoints js/news-feed.js actually builds, which is strictly narrower, and this assertion says so
     rather than naming the old expression. */
  assert.match(s, /"\/rss\/search"/, 'the search endpoint is not named');
  assert.match(s, /rss\\\/headlines\\\/section\\\/topic/, 'the headlines endpoint is not named');
  assert.ok(!/pathname\.startsWith\("\/rss\/"\)/.test(s), 'the whole /rss/ directory is allowed again');
  /* Google answers a blocked request with 200 + an HTML interstitial; passing it through would let
     the browser's race declare this relay the winner and then parse zero items */
  assert.match(s, /includes\("<rss"\)[\s\S]{0,40}includes\("<feed"\)/, 'a non-feed body is not rejected');
  assert.match(s, /status:\s*502/, 'a bad upstream must not be reported as success');
});
}
