/* ============================================================================
 *  #R441 — 「経路を聞いたらいくつも出てきてしまう。6つぐらい出てきた。」
 * ----------------------------------------------------------------------------
 *  One question, 「ここから大阪駅まで電車で行きたい。」, and the reply carried the SAME five
 *  itineraries twice — count line, five cards, the Transitous/MOTIS footnote, then the count line
 *  and the five cards again. Same departure, same arrival, same transfers, same selected card.
 *
 *  A turn may run a tool more than once; that is Atlas's (CONSTITUTION.md §5). What repeated on the
 *  PAGE is a different question, and js/atlas-console.js had exactly one guard for it: «drop any
 *  exact-duplicate html fragment» — a string comparison. js/routing.js stamps every computed route
 *  set with a fresh id (`_rsNew` = `'rs' + (++_rsSeq)`) and js/routing-cards.js writes it into every
 *  card as `data-rset`, so two runs of ONE journey differ by exactly that nonce and are never
 *  byte-equal. The guard was reading the rendering; the thing that repeated was the operation.
 *
 *  ⚠ THESE CHECKS DRIVE THE SHIPPED MODULE. js/atlas-turn-results.js has no DOM, no network and no
 *  globals, so the decision the browser makes is the decision made here. The two wiring checks read
 *  js/atlas-console.js through `codeOnly`, so this file's own prose — which necessarily spells the
 *  defect — can never be what a check matches (#R345).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { makeAtlasTurnResults } from '../js/atlas-turn-results.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));

/* js/atlas-console.js's own `_lnorm`, so the module is built the way the console builds it. */
const LNORM = (s) => {
  try { return String(s == null ? '' : s).replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase().replace(/\s+/g, ' ').trim(); } catch (_) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); }
};
const TRES = makeAtlasTurnResults({ norm: LNORM });

/* One reply-block, in the shape runActions files on the bubble: {act, ok, html, meta}. */
const res = (act, html, extra) => Object.assign({ act, ok: true, html, meta: null }, extra || null);

/* The rendered fragment of one transit answer, as js/routing-cards.js writes it: the SAME five
   itineraries, differing only in the route-set nonce every computed set gets. */
const cards = (rs) => '<div style="font-size:11px;">5 件の候補 — タップで地図に表示</div>'
  + '<div class="atl-trips" data-rset="' + rs + '">'
  + [0, 1, 2, 3, 4].map((i) => '<div class="atl-trip" data-rset="' + rs + '" data-ai="' + i + '">05:56 – 07:28</div>').join('')
  + '</div>';

const JOURNEY = 'routing.route|transit|136.9340,35.1330;135.4959,34.7332|-|-|-|-|-|depart';

/* ── ① the reported reply: one journey, run twice, is ONE block ─────────────────────────────────
   And the block kept is the LATEST — the set js/routing.js is still holding and the map is still
   drawing, so the cards the reader can tap are the ones that are live. */
test('R441 ① two runs of one journey collapse to the live one', () => {
  const a1 = { type: 'directions', from: '現在地', to: '大阪駅', mode: 'transit' };
  const a2 = { type: 'directions', from: '現在地', to: '大阪駅', mode: 'transit' };
  const r1 = res(a1, cards('rs1'), { meta: { resultKey: JOURNEY } });
  const r2 = res(a2, cards('rs2'), { meta: { resultKey: JOURNEY } });

  /* ⚠ the premise of the whole round: the two fragments are NOT byte-equal, so the exact-HTML
     comparison that was the only guard cannot have been what removed one of them. */
  assert.notEqual(r1.html, r2.html, 'the fixture no longer reproduces the nonce — it proves nothing');

  const kept = TRES.keep([r1, r2]);
  assert.equal(kept.length, 1, 'the reply still lists the same five itineraries twice');
  assert.equal(kept[0].html, r2.html, 'the block kept is not the route set the map is holding');
});

/* ── ② the same journey asked in two different words is still one journey ───────────────────────
   `my_location` returns coordinates mid-turn, so a later step may route from those instead of from
   「ここから」. The arguments differ; what was resolved does not. */
test('R441 ② a resolved journey outranks how it was spelled', () => {
  const r1 = res({ type: 'directions', from: 'ここから', to: '大阪駅', mode: 'transit' }, cards('rs1'), { meta: { resultKey: JOURNEY } });
  const r2 = res({ type: 'directions', from: '35.133,136.934', to: '大阪駅', mode: 'transit' }, cards('rs2'), { meta: { resultKey: JOURNEY } });
  assert.notEqual(TRES.opKey(r1.act, r1), TRES.opKey(r1.act, null), 'the declared identity is being ignored');
  assert.equal(TRES.keep([r1, r2]).length, 1, 'two spellings of one journey still render twice');
});

/* ── ③ …and two DIFFERENT journeys are both kept ────────────────────────────────────────────────
   「東京→大阪と大阪→福岡」 and 「車と電車で比べて」 are two answers to one question, not a repeat. */
test('R441 ③ genuinely different journeys both stay', () => {
  const other = 'routing.route|transit|135.4959,34.7332;130.4207,33.5903|-|-|-|-|-|depart';
  const road = 'routing.route|driving|136.9340,35.1330;135.4959,34.7332|-|-|-|-|-|depart';
  const legs = [
    res({ type: 'directions', from: '名古屋', to: '大阪', mode: 'transit' }, cards('rs1'), { meta: { resultKey: JOURNEY } }),
    res({ type: 'directions', from: '大阪', to: '福岡', mode: 'transit' }, cards('rs2'), { meta: { resultKey: other } }),
    res({ type: 'directions', from: '名古屋', to: '大阪', mode: 'driving' }, cards('rs3'), { meta: { resultKey: road } }),
  ];
  assert.equal(TRES.keep(legs).length, 3, 'three different journeys were folded into fewer blocks');
});

/* ── ④ a re-run that FAILED never displaces the run that worked ─────────────────────────────────
   Equal standing lets the later win; lower standing does not. */
test('R441 ④ a failed re-run does not replace a successful one', () => {
  const ok = res({ type: 'highlight', countries: ['JPN'] }, '<ok>');
  const bad = Object.assign(res({ type: 'highlight', countries: ['JPN'] }, '<bad>'), { ok: false });
  assert.equal(TRES.keep([ok, bad])[0].html, '<ok>', 'a failure took the place of the result that succeeded');
  assert.equal(TRES.keep([bad, ok])[0].html, '<ok>', 'the successful re-run did not replace the failure');
});

/* ── ⑤ #R159's answer semantics are unchanged ───────────────────────────────────────────────────
   A repair REPLACES the failure it repairs; a same-scoring retry does NOT displace the answer
   already written on the page. Both are the behaviour that shipped, and neither is this round's. */
test('R441 ⑤ answers still repair, and a tie still keeps the first', () => {
  const failed = Object.assign(res({ type: 'analyze', topic: 'Sahel' }, '<first>'), { ok: false });
  const repair = res({ type: 'analyze', topic: 'Sahel' }, '<repair>', { meta: { produced: ['explanation'], userGoalSatisfied: true } });
  assert.equal(TRES.keep([failed, repair])[0].html, '<repair>', 'a repair no longer replaces the failure it repairs');

  const a = res({ type: 'analyze', topic: 'Sahel' }, '<a>');
  const b = res({ type: 'analyze', topic: 'Sahel' }, '<b>');
  assert.equal(TRES.keep([a, b])[0].html, '<a>', 'a same-scoring retry displaced the answer already written');

  /* the inherited goal key still wins outright, whatever the type says */
  assert.equal(TRES.answerKey({ type: 'directions', __goalKey: 'answer:sahel' }), 'answer:sahel');
});

/* ── ⑥ operations that are NOT repeats keep every one of them, in order ─────────────────────────
   This is the half the round must not break: 「ドイツとフランスを塗って東京へ飛んで」 is three
   different operations and all three belong in the reply. */
test('R441 ⑥ different operations are all kept, in the order they ran', () => {
  const list = [
    res({ type: 'highlight', countries: ['DEU'] }, '<de>'),
    res({ type: 'highlight', countries: ['FRA'] }, '<fr>'),
    res({ type: 'flyTo', place: '東京' }, '<tokyo>'),
    res({ type: 'layer', name: 'rail', on: true }, '<on>'),
    res({ type: 'layer', name: 'rail', on: false }, '<off>'),
  ];
  assert.deepEqual(TRES.keep(list).map((r) => r.html), ['<de>', '<fr>', '<tokyo>', '<on>', '<off>']);
});

/* ── ⑦ an empty argument is not an argument ─────────────────────────────────────────────────────
   `{from,to}` and `{from,to,via:[],avoid:null,note:'  '}` are one request asked twice, and a key
   built by listing whatever fields happen to be present would call them two. */
test('R441 ⑦ blank and empty fields do not change what an operation is', () => {
  const bare = { type: 'directions', from: '名古屋', to: '大阪' };
  const padded = { type: 'directions', to: ' 大阪 ', from: '名古屋', via: [], avoid: null, note: '   ', opts: {} };
  assert.equal(TRES.opKey(bare, null), TRES.opKey(padded, null));
  /* …and the console's own bookkeeping fields are not part of the request either */
  assert.equal(TRES.opKey(Object.assign({ __result: { x: 1 }, __exec: {}, __status: 'partial' }, bare), null), TRES.opKey(bare, null));
  /* argument order is not part of it, and a different DESTINATION certainly is */
  assert.notEqual(TRES.opKey(bare, null), TRES.opKey({ type: 'directions', from: '名古屋', to: '京都' }, null));
});

/* ── ⑧ the console builds this module and composes from it ──────────────────────────────────────
   The rule must exist ONCE. A second copy left behind in js/atlas-console.js is how a fix ends up
   living in a file nothing calls. */
test('R441 ⑧ js/atlas-console.js composes through the module and keeps no second copy', () => {
  const atlas = codeOnly(R('js/atlas-console.js'));
  assert.match(atlas, /import\s*\{\s*makeAtlasTurnResults\s*\}\s*from\s*'\.\/atlas-turn-results\.js'/, 'js/atlas-console.js does not import the module');
  assert.match(atlas, /makeAtlasTurnResults\(\s*\{\s*norm\s*:\s*_lnorm\s*\}\s*\)/, 'the module is not given the console\'s own `_lnorm`');
  assert.match(atlas, /const\s+keep\s*=\s*TRES\.keep\(results\)/, '_atlCompose no longer composes from the module');
  assert.ok(!/_atlGoalKey|_atlGoalScore|_ATL_ANSWER_TYPES/.test(atlas), 'the old in-file de-dupe is still there — two rules for one decision');
  /* the exact-HTML guard stays: two DIFFERENT operations that render the same fragment are still one */
  assert.match(atlas, /seen\[h\]/, 'the exact-duplicate html guard was removed with the rest');
});

/* ── ⑨ the route case declares what it resolved, at every successful exit ───────────────────────
   ⚠ COUNTED, NOT SPOT-CHECKED. The transit branch and the road branch each end in their own
   `return R(true, h)`, and one of them carrying the identity while the other does not is exactly
   the shape that reproduces the report on half the modes. */
test('R441 ⑨ every successful route answer carries its journey identity', () => {
  const atlas = codeOnly(R('js/atlas-console.js'));
  const i = atlas.indexOf("case 'directions':");
  assert.ok(i > 0, "the directions case is gone from js/atlas-console.js");
  const j = atlas.indexOf("case 'streetview':", i);
  assert.ok(j > i, 'the end of the directions case could not be found');
  const body = atlas.slice(i, j);
  assert.match(body, /const\s+_jKey\s*=\s*'routing\.route\|'\s*\+\s*mode/, 'the route case no longer builds a journey identity');
  const exits = body.match(/return R\(true, h[^)]*\)/g) || [];
  assert.equal(exits.length, 2, `expected the transit and road answers, found ${exits.length}`);
  exits.forEach((e) => assert.match(e, /resultKey:_jKey/, 'a successful route answer ships without its journey identity: ' + e));
});

/* ── ⑩ the identity is built from what was RESOLVED, and survives geocoder jitter ───────────────
   Two runs whose endpoints agree to ~11 m are the same journey; 10 km apart is not. The check runs
   the shipped expression, lifted out of the case, rather than a re-derivation of it. */
test('R441 ⑩ the journey identity is coordinate-based, at ~11 m', () => {
  const atlas = codeOnly(R('js/atlas-console.js'));
  const line = (atlas.split('\n').find((l) => l.includes("const _jKey='routing.route|'")) || '').trim();
  assert.ok(line, 'the journey identity is no longer one expression');
  const make = new Function('mode', 'A', 'B', 'via', '_avoid', '_tmodes', '_mw', '_areas', 'a',
    line.replace(/^const\s+/, 'const ') + ' return _jKey;');
  const A = { lng: 136.93400, lat: 35.13300 }, B = { lng: 135.49590, lat: 34.73320 };
  const A2 = { lng: 136.934004, lat: 35.132999 };                 /* the same platform, re-geocoded */
  const far = { lng: 137.04000, lat: 35.13300 };                  /* ~9 km east — another station */
  const run = (from, to, mode, opt) => make(mode, from, to, [], null, [], null, [], opt || {});
  assert.equal(run(A, B, 'transit'), run(A2, B, 'transit'), 'float jitter split one journey into two');
  assert.notEqual(run(A, B, 'transit'), run(far, B, 'transit'), 'two different starting points share one identity');
  assert.notEqual(run(A, B, 'transit'), run(A, B, 'driving'), 'the mode is not part of the journey identity');
  assert.notEqual(run(A, B, 'transit'), run(A, B, 'transit', { arriveBy: true }), '「9時までに着きたい」 is not a different request');
  assert.equal(run(A, B, 'transit'), JOURNEY, 'the shipped identity no longer matches the one these checks route on');
});
