/* ============================================================================
 *  The submarine-cable default layer: retry, cache, and our own relay
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r187-checks.test.mjs, tests/r188-checks.test.mjs, tests/r190-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { publishedList } from './helpers/layer-groups.mjs';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r187-checks.test.mjs — 1 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない */
/* (#R187) the round's header note is kept with its largest block, in tests/layer-globe-rendering-checks.test.mjs */
/* (on the import of './helpers/layer-groups.mjs') */ /* (layer-manifest) the lists are views of js/layer-manifest.js */

/* ── 7. a refused layer add is retried ───────────────────────────────────────────────────────── */
test('R187 default layers: the cables survive a style that is not ready yet', () => {
  const src = read('js/data-layers.js');
  assert.deepEqual(publishedList('IntMapDefaultLayers'), ['dl-climate', 'dl-subcables'], 'both still default on');
  /* REPRODUCED on a cold load: whenStyleReady() hard-resolves after ~6 s (that escape hatch is #R41's
     and is deliberate), MapLibre then refuses addSource with "Style is not done loading", and the old
     code logged it and stopped — one of the two default layers on screen, which is the report. */
  const fn = /function addSubcables\(\)\{[\s\S]*?\n    \}/.exec(src);
  assert.ok(fn, 'addSubcables must exist');
  /* ⚠ (#R354) THE CLAIM IS UNCHANGED AND THE SPELLING IS NOT. #R187's ladder was twelve tries at
     750 ms — `build(tries)` counting down — and it was written against a style that was merely SLOW.
     #R354 measured a style blocked for 22 s by a rate-limited basemap: the ladder ran out and the
     box came off. It is bounded by a HORIZON now and woken by the renderer's own `styledata`, which
     is strictly more persistent, not less. What this test asserts is what #R187 was about — a
     refused add is retried, the retry is bounded, and the reader unticking the box ends it. */
  assert.match(fn[0], /const build=\(\)=>/, 'the build step must be retryable');
  assert.match(fn[0], /setTimeout\(\(\)=>\{ _retryT=null; build\(\); \},750\)/, 'and actually retry');
  assert.match(fn[0], /BUILD_HORIZON_MS=\d+/, 'with a bounded horizon');
  assert.match(fn[0], /Date\.now\(\)>_giveUpAt/, 'that is actually enforced');
  assert.match(fn[0], /GE\(\)\.events\.on\('styledata',_styleHook\)/, 'and woken by the style itself, not only by a timer');
  assert.match(fn[0], /cb&&cb\.checked/, 'and give up the moment the user unticks the box');
});
}

/* ══════════ from tests/r188-checks.test.mjs — 1 of its 7 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない・js/session-tabs.js も DOM に閉じている */
/* (#R188) the round's header note is kept with its largest block, in tests/layer-aircraft-checks.test.mjs */
/* (on the import of './helpers/layer-groups.mjs') */ /* (layer-manifest) the lists are views of js/layer-manifest.js */

/* ── 2. the default layers: a failed download is not a preference ────────────────────────────── */
test('R188 default layers: the cable data is kept, and an outage is never saved as a choice', () => {
  /* (#R200) the snapshot moved to js/session-tabs.js with the rest of the session block. */
  const dl = read('js/data-layers.js'), ab = read('js/session-tabs.js');
  assert.deepEqual(publishedList('IntMapDefaultLayers'), ['dl-climate', 'dl-subcables'],
    'both layers still start on');
  /* measured: the direct fetch is `TypeError: Failed to fetch` every time (no ACAO), so this layer
     has ALWAYS come through a volunteer CORS proxy — which is the whole asymmetry with Köppen. */
  assert.match(dl, /const _CABLE_CACHE='intmap-page-subcables-v1';/, 'a successful download must be kept');
  assert.match(dl, /async function _cableCached\(u\)\{/, 'and served before the network on the next visit');
  /* ⚠ (#R354) THE ROUTES COME FROM THIS APP'S OWN ORIGIN NOW, and the kept TeleGeography copy is a
     fallback BEHIND that rather than the first answer. #R188's claim survives whole — a successful
     download is kept, and is served without waiting for the network — and it covers the local
     dataset too. What must never come back is asking a stranger FIRST. */
  assert.match(dl, /return \{cab:cCache,lp:lCache,from:'telegeography-cache',fromCache:true\};/, 'the kept copy answers immediately');
  assert.match(dl, /const \[cab,lp\]=await Promise\.all\(\[_cableLocal\(CABLE_LOCAL_URL\),_cableLocal\(CABLE_LOCAL_LP_URL\)\]\);/,
    "and this app's own dataset is tried before any of it");
  assert.ok(dl.indexOf('_cableLocal(CABLE_LOCAL_URL)') < dl.indexOf('_cableCached(CABLE_URL)'),
    'the own-origin dataset must be tried before the kept TeleGeography copy');
  assert.match(dl, /_cableStore\(u,j\); return j;/, 'and a successful local answer is kept too');
  /* retried with backoff before the box is ever touched */
  assert.match(dl, /if\(cb&&cb\.checked&&_subcableTries<3\)\{ const wait=\[5000,15000,45000\]\[_subcableTries\+\+\];/,
    'three backed-off retries before giving up');
  /* and when it does give up, the app marks the untick as ITS OWN */
  assert.match(dl, /function autoUncheck\(id\)\{[\s\S]{0,120}cb\.dataset\.imAutoOff='1';/,
    'an app-side untick must be marked');
  assert.ok(!/if\(!cab\)\{ const cb=document\.getElementById\('dl-subcables'\); if\(cb\)\{ cb\.checked=false;/.test(dl),
    'the old bare untick must be gone');
  /* …and the session keeps wanting it, which is what made the failure PERMANENT before */
  assert.match(ab, /if\(cb&&!cb\.checked&&cb\.dataset&&cb\.dataset\.imAutoOff==='1'&&layers\.indexOf\(id\)<0\) layers\.push\(id\);/,
    'the snapshot must not record an app-side untick as the user switching the layer off');
  assert.match(ab, /if\(e\.isTrusted&&e\.target\.dataset\) delete e\.target\.dataset\.imAutoOff;/,
    'a real click settles it, in either direction');
});
}

/* ══════════ from tests/r190-checks.test.mjs — 1 of its 10 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: supabase/functions/<名前>/index.ts は Deno.serve の中で上流を読む Edge Function で、ここでは起動しない（起動して測る検査は tests/layer-ais-ships-checks の #R510 ⑨⑩⑪）。js/data-layers.js は DOM・MapLibre・fetch に閉じた Layers パネル全体のファクトリで node では組み立てられない（リレー URL の組み立ては js/proxy-fetch.js を import して評価している） */
/* (#R190) the round's header note is kept with its largest block, in tests/layer-simulators-checks.test.mjs */

/* ── 2 · the submarine cables stop depending on a volunteer proxy ────────────────────────────── */
test('R190 default layers: the cables come through our own origin', async () => {
  const fn = read('supabase/functions/cable-geo/index.ts');
  assert.match(fn, /Access-Control-Allow-Origin/, 'the relay sends ACAO — the whole reason it exists');
  assert.match(fn, /const ALLOWED = new Set\(\[/, 'an allowlist, not an open proxy');
  assert.match(fn, /submarinecablemap\.com\/api\/v3\/cable\/cable-geo\.json/, 'the cable routes');
  assert.match(fn, /submarinecablemap\.com\/api\/v3\/landing-point\/landing-point-geo\.json/, 'and the landing points');
  /* ⚠ THE SET DECIDES, whatever else the same `if` now also checks (a length bound went in beside
     it). Pinning the whole condition made the test fail when the guard got STRONGER. */
  assert.match(fn, /!ALLOWED\.has\(u\)/, 'anything else is refused');
  assert.match(fn, /status:\s*400/, 'and refused with a 400 rather than fetched');
  assert.match(fn, /Array\.isArray\(j\.features\)/,
    'an HTTP-200 error page is not cached for a day as if it were data');
  assert.doesNotMatch(fn, /:\s*Request\b/, 'no TypeScript annotations — scripts/static-checks parses .ts with acorn');

  /* THE DEFECT: the layer was up only while a VOLUNTEER proxy happened to be alive — a stranger's
     uptime, and a stranger on the path. (own-fetch-relay) The relay URL is no longer spelled in this file; it
     is asked of js/proxy-fetch.js, so what is checked is what that router ANSWERS for the two URLs. */
  const dl = read('js/data-layers.js');
  const net = /async function _cableNet\(u\)\{[^\n]*/.exec(dl);
  assert.ok(net, 'the cable fetcher is still one function');
  /* (cable-relay-first) our relay FIRST, the bare URL only for a build with no relay: the bare URL is refused by
     every browser origin (no ACAO), so trying it first was a guaranteed CORS error in production. */
  assert.match(net[0], /for\(const src of \[ownRelayUrl\(u\), u\]\)/,
    'our relay is tried first, then the direct URL — and nothing else');
  /* the import may name what else it takes from the router (stalled-fetch-and-surface-gauge: `clockFor`);
     what is held is that ownRelayUrl comes from there */
  assert.match(dl, /import \{[^}]*\bownRelayUrl\b[^}]*\} from '\.\/proxy-fetch\.js';/, 'the relay URL comes from the one router');
  const realWindow = globalThis.window;
  globalThis.window = { SUPABASE_URL: 'https://sb.test' };
  try {
    const { ownRelayUrl } = await import(new URL('../js/proxy-fetch.js', import.meta.url).href);
    for (const u of ['https://www.submarinecablemap.com/api/v3/cable/cable-geo.json',
                     'https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json']) {
      assert.equal(ownRelayUrl(u), 'https://sb.test/functions/v1/cable-geo?u=' + encodeURIComponent(u),
        'the router sends ' + u + ' to cable-geo');
    }
  } finally { globalThis.window = realWindow; }
  assert.doesNotMatch(dl.replace(/\/\*[\s\S]*?\*\//g, ''), /corsproxy\.io|allorigins\.win|codetabs\.com/,
    'no volunteer proxy is left behind our relay (own-fetch-relay)');

  /* the stored sessions written while that dependency existed are healed once */
  /* (#R200) …in js/session-tabs.js, where the session block lives since this round. */
  const body = read('js/session-tabs.js');
  assert.match(body, /defv:190/, 'the snapshot stamps the new generation');
  assert.match(body, /if\(!\(\+s\.defv>=190\)\)/, 'and an older stamp gets the default-on ids back once');
});
}
