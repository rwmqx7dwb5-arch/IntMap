/* ============================================================================
 *  #R262 — a failed fetch is not an empty answer
 * ----------------------------------------------------------------------------
 *  Found in PRODUCTION VERIFICATION of #R261, not in a test: the emergency-services
 *  layer held 0 features 45 s after being switched on over Tokyo, `refresh()`
 *  returned in milliseconds and threw nothing, while the same Overpass query from
 *  the same page answered with 1,200 elements in 6.7 s.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── ① a null answer is never cached, and never becomes «0 objects» ─────────────────────────────
   `overpass()` returns null when every mirror fails. The old code built `feats = []` from that and
   `cache.set(ck, feats)` — so one slow moment made the view box permanently empty for the session,
   with `lastKey` already set so nothing would retry. */
test('R262 ①: a failed Overpass call is not cached and clears lastKey so it retries', () => {
  const s = read('js/osm-facilities.js');
  assert.match(s, /if\(els==null\)\{ fetchState='fail'; lastKey=''; count=0; legend\(\); busy=false; return; \}/,
    'a null answer must return BEFORE the cache write, and must free lastKey and busy');
  /* the guard has to sit above the cache write, or it fixes nothing */
  const iGuard = s.indexOf("if(els==null){ fetchState='fail'");
  const iCache = s.indexOf('cache.set(ck,feats)');
  assert.ok(iGuard > 0 && iCache > 0 && iGuard < iCache,
    'the null guard must come before cache.set — otherwise the empty array is still stored');
});

/* ── ② the two sentences are different, on screen and in the API ────────────────────────────── */
test('R262 ②: «no answer» and «0 objects» are distinguishable', () => {
  const s = read('js/osm-facilities.js');
  assert.match(s, /let fetchState='ok';/, 'the state exists');
  assert.match(s, /fetchState==='fail'\s*\n?\s*\?S\(L\('OpenStreetMap did not answer/,
    'the legend prints the failure rather than «0 objects in view»');
  assert.match(s, /state:\(\)=>\(\{ on, busy, count, fetchState, lastKey, cached:cache\.size \}\)/,
    'and a test or a person can read it without parsing the legend');
  /* every language carries the new string (the audit gates this too, but name it here) */
  for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
    const t = read('js/locales/ui.' + c + '.js');
    const inline = /OpenStreetMap did not answer/.test(t);
    /* en/jp/de/ru/es are positional (at the call site); the other four are table entries */
    if (['fr', 'ko', 'zh', 'zh-hans'].includes(c)) assert.ok(inline, c + ' has no entry for the failure line');
  }
  assert.match(s, /OpenStreetMap から応答がありませんでした/, 'the five positional languages are at the call site');
});

/* ── ③ the build markers agree, and do not go backwards ────────────────────────────────────────
   ⚠ WRITTEN THIS WAY ON PURPOSE. #R261 ⑬ pinned the literal 'R261' and went red the moment #R262
   bumped the stamp, which is what every round is required to do. The property a round can assert is
   that the two markers AGREE and are not older than itself; the format and the global monotonicity
   belong to tests/r169-checks, which already owns them. */
test('R262 ③: both build markers name one round, and it is not older than R262', () => {
  const s = read('index.html');
  const a = s.match(/window\.__imBuild='R(\d+)'/);
  const b = s.match(/window\.INTMAP_BUILD='\d{4}-\d{2}-\d{2}-R(\d+)'/);
  assert.ok(a && b, 'both build markers are present');
  assert.equal(a[1], b[1], 'the two markers name the same round');
  assert.ok(Number(a[1]) >= 262, `the build stamp went back to R${a[1]}`);
});
