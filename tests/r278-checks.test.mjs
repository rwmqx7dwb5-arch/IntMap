/* ============================================================================
 *  IntMap · #R278 source checks
 * ----------------------------------------------------------------------------
 *  「現在地から徒歩一時間で行ける範囲を表示して。」→ a 5 km RADIUS CIRCLE.
 *  「いや半径でごまかすな。」→ 「実道路ネットワークによる徒歩到達圏（等時間圏）を描画する機能を実行
 *    できないため、半径円で代用せず、今回は表示できません。」→ 「ふざけんな」
 *
 *  The last message was not true. The isochrone has existed since #R86, it draws from Valhalla /
 *  OpenStreetMap, and it works — verified against the live endpoint at the user's own coordinates.
 *  What did not exist was its ENTRY IN THE CATALOGUE the planner is given, so the model reached for
 *  the only reach-shaped action it had ever been shown (radius) and then reported the capability as
 *  absent. Six capabilities were in that state; §① proves the gate that now finds them can actually
 *  go red, which is the only thing that makes §② mean anything.
 *
 *  ⚠ ASSERTIONS ARE ABOUT PROPERTIES, NOT LITERALS (fourteen rounds of a pinned number turning a
 *  correct change into a false regression). The catalogue is checked as «the planner can emit it»,
 *  not as a sentence. (§④/④b asked the same of localPlan's own parser; #R406 deleted localPlan.)
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY SEARCH — 「自分の検査が自分のコメントに当たる」, thirteen times.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditLines, catalogueText, dispatchCapabilities } from '../scripts/atlas-catalog.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const ATLAS = () => read('js/atlas-console.js');
const TOOLS = () => codeOnly(read('js/map-tools.js'));

/* ── ① THE GATE CAN GO RED. ────────────────────────────────────────────────────────────────────
   A gate that has only ever been seen green is indistinguishable from a gate that looks at nothing
   (#R274 ③). So build a miniature atlas-console — a SYS() body and a dispatch switch — that has the
   exact defect this round fixed, and require the audit to name it; then catalogue it and require the
   audit to fall silent. Both directions, on synthetic input, so nothing here depends on the real
   file's current contents. */
const fakeAtlas = (catalogued) => [
  '    function SYS(){ const lang=1;',
  `      return 'ACTIONS: {"type":"flyTo","place":str}${catalogued ? '; {"type":"walkshed","place":str}' : ''}.\\n'`,
  "        +'Other controls: '+controlCatalog();",
  '    }',
  '        case \'flyTo\': { return 1; }',
  '        case \'walkshed\': case \'reachable2\': { return 2; }',
].join('\n').split('\n');

test('R278 ① the catalogue gate names an uncatalogued capability, and only then goes quiet', () => {
  const red = auditLines(fakeAtlas(false), { minCaps: 2 });
  assert.equal(red.missing.length, 1, 'an action with a dispatch case and no catalogue entry must be reported');
  assert.deepEqual(red.missing[0].names, ['walkshed', 'reachable2'], 'and reported by every spelling it answers to');

  const green = auditLines(fakeAtlas(true), { minCaps: 2 });
  assert.equal(green.missing.length, 0, 'catalogued → silent');

  /* and the match is on the QUOTED name the planner would emit, not on the word appearing in prose:
     "Earth Replay" in a sentence told the model nothing it could put in JSON, and that is exactly the
     state earthReplay was in for dozens of rounds. */
  const prose = fakeAtlas(false).slice();
  prose[1] = prose[1].replace('.\\n', '. You can also show a walkshed around a place.\\n');
  assert.equal(auditLines(prose, { minCaps: 2 }).missing.length, 1, 'prose mentioning the word is not a catalogue entry');

  /* an empty or moved dispatch must fail loudly rather than pass on an empty set */
  assert.throws(() => auditLines(fakeAtlas(true).filter((l) => !/^ {8}case/.test(l)), { minCaps: 2 }), /dispatch cases/);
});

/* ── ② EVERY LIVE CAPABILITY IS DESCRIBED TO THE PLANNER ───────────────────────────────────────
   The #R115 rule, enforced instead of merely written down. `monitor` is the one exception and it is
   allowed only while it really is withdrawn (#R231). */
test('R278 ② no capability is implemented and invisible', () => {
  const { rows, missing } = auditLines(ATLAS().split(/\r?\n/));
  assert.equal(missing.length, 0, `invisible to the planner: ${missing.map((m) => m.names.join('/')).join(', ')}`);
  assert.ok(rows.length > 100, 'the dispatch really was scanned');
  const wd = rows.filter((r) => r.withdrawn).map((r) => r.names[0]);
  assert.deepEqual(wd, ['monitor'], 'withdrawal is an exception with a reason, not a habit');

  /* the six that were missing this round, named individually so a future edit that drops one is a
     failure with its name on it rather than a count that moved */
  const lines = ATLAS().split(/\r?\n/);
  const sys = catalogueText(lines);
  /* ⚠ (#R296) FIVE, NOT SIX. `earthReplay` was deleted whole this round — 「「地球リプレイ」は存在
     意義が不明だから全削除」 — dispatch case, module, tools row, local matcher and catalogue entry
     together, so it is neither implemented nor described. #R278's rule is about the GAP between the
     two, and a capability that exists in neither place opens no gap; scripts/atlas-catalog.mjs
     (which runs in `npm test`) is what keeps the general form of that rule. The named five stay named. */
  for (const t of ['isochrone', 'optimizeRoute', 'objects', 'slope', 'rfCoverage']) {
    assert.ok(sys.includes(`{"type":"${t}"`), `${t} must be catalogued as an emittable action`);
  }
  assert.ok(!sys.includes('{"type":"earthReplay"'), 'and earthReplay is described nowhere, having been removed');
  assert.ok(!ATLAS().includes("case 'earthReplay':"), '…including in the dispatch');
  /* The mirror question — «does the catalogue offer anything the dispatch cannot run?» — is NOT
     asserted here, and the reason is worth writing down rather than leaving as an omission: the
     catalogue uses {"type":…} for NESTED schemas too, not only for actions. Running it once found
     {"type":"matmul"}, which is a verification check inside an answer's "checks" array and is
     supposed to have no dispatch case. A rule that cannot tell an action from a nested object would
     have to be taught the difference by a list of exceptions, and a list of exceptions is how a
     gate stops asserting anything. The six spellings each capability answers to are covered instead:
     if a `case` is renamed, ② fails on the name that vanished. */
  assert.ok(dispatchCapabilities(lines).some((c) => c.names.includes('isochrone')), 'the isochrone case is still the one being catalogued');
});

/* ── ③ A TRAVEL-TIME QUESTION IS NOT A CIRCLE ──────────────────────────────────────────────────
   The substitution the user rejected has to be ruled out where the planner reads it, so the radius
   entry itself must send travel-time asks to the isochrone. */
test('R278 ③ the radius entry forbids standing in for a travel-time answer', () => {
  const sys = catalogueText(ATLAS().split(/\r?\n/));
  const i = sys.indexOf('{"type":"radius"');
  assert.ok(i > 0, 'the radius action is catalogued');
  const entry = sys.slice(i, sys.indexOf('{"type":"measure"', i));
  assert.match(entry, /isochrone/, 'the radius entry must name the action to use instead');
  assert.match(entry, /NOT an answer to a travel-TIME question|never a radius circle standing in/i, 'and say plainly that a circle is not that answer');

  const iso = sys.slice(sys.indexOf('{"type":"isochrone"'));
  assert.match(iso.slice(0, 2000), /road network/i, 'and the isochrone entry must say what it actually follows');
  assert.match(iso.slice(0, 2000), /pedestrian/, 'including the walking profile the user asked for');
});

/* ── ④/④b (localPlan's isochrone branch, and its kanji numerals) removed in #R406: localPlan is deleted — the reader's words are read by Atlas now, and the turn that reads them is covered by tests/r406-agent.test.mjs and tests/r406-turn.test.mjs. §② above still requires the isochrone to be described somewhere Atlas can reach it, which is the half of this round that was actually missing. */

/* ── ⑤ THE COORDINATES ARE NOT DROPPED ─────────────────────────────────────────────────────────
   MEASURED before the fix, in the running app: dispatch({type:'isochrone',lng:136.934,lat:35.133,
   mode:'pedestrian',minutes:60}) answered 「✓ 60 分の到達圏」 and drew the contour at 10°E 20°N,
   because the handler only ever called geocode(a.place||…) and geocode('') falls back to the map
   centre. Every sibling handler reads lng/lat first; this one now does too. */
test('R278 ⑤ the isochrone action honours explicit lng/lat', () => {
  const s = codeOnly(ATLAS());
  const i = s.indexOf("case 'isochrone':");
  assert.ok(i > 0);
  const body = s.slice(i, s.indexOf("case 'route':", i));
  const iLL = body.indexOf('const ll=');
  assert.ok(iLL > 0, 'the origin is still resolved into `ll`');
  const decl = body.slice(iLL, body.indexOf(';', iLL + 40));
  assert.match(decl, /a\.lng!=null&&a\.lat!=null/, 'null must not be read as the coordinate 0');
  assert.match(decl, /isFinite\(\+a\.lng\)&&isFinite\(\+a\.lat\)/, 'and the pair must be finite before it is trusted');
  assert.ok(decl.indexOf('geocode(') > decl.indexOf('a.lng'), 'coordinates are read BEFORE the geocoder, not after it');

  /* and a duration outside what the router serves is refused, not silently replaced by [15,30] */
  assert.match(body, /_asked/, 'the number of durations actually asked for is remembered');
  const iF = body.indexOf('mins=mins.filter(');
  assert.ok(iF > 0 && /return R\(false/.test(body.slice(iF, iF + 700)), 'an out-of-range duration returns a failure, not a different answer');
});

/* ── ⑥ «✓» ONLY WHEN SOMETHING WAS DRAWN ───────────────────────────────────────────────────────
   MEASURED: on a tab whose style had not finished loading, addSource threw «Style is not done
   loading», the one write that matters was inside try{…}catch(_){}, and run() returned {ok:true}
   anyway — 「✓ 60 分の到達圏」 over an empty map. Three separate ways to report work not done. */
test('R278 ⑥ the isochrone reports failure when nothing reached the map', () => {
  const s = TOOLS();
  const i = s.indexOf('async function run(lngLat,opts)');
  assert.ok(i > 0, 'IntMapIsochrone.run was not found');
  const body = s.slice(i, s.indexOf('function ensurePanel()', i));

  assert.match(body, /(const|let)\s+\w+\s*=\s*ensureLayers\(\)/, 'ensureLayers() returns a boolean and it must be kept');
  assert.match(body, /reason:'render'/, 'a map that could not be written to is its own failure, distinct from the router');
  assert.match(body, /!polys\.length/, 'a response carrying no polygon is not a success either');

  /* ⚠ (#R296) ANCHOR ON THE WRITE THAT REPORTS SUCCESS, not on the first `setSourceData` in the
     function. 「到達圏と公共交通機関の到達圏に分離するのを辞めろ」 added a `transit` branch that
     CLEARS this source before handing to the rail model — a legitimate write, earlier in the body,
     which made the slice land on a call that never claimed anything. The claim is `features:feats`. */
  const iSet = body.indexOf('features:feats');
  const after = body.slice(iSet, iSet + 400);
  assert.match(after, /hasSource\(SRC\)/, 'the write is confirmed against the source that had to exist');
  assert.ok(/if\(!\w+\)\s*\{[^}]*reason:'render'/.test(after), 'and an unconfirmed write returns before the ok:true line');

  /* ⚠ (#R296) THE FUNCTION NOW HAS TWO SUCCESSES, and each must be earned by ITS OWN engine.
     The road path's `ok:true` still follows the confirmed write; the `transit` branch added this
     round returns through the rail model, so what it must not do is claim success without one. */
  const iOk = body.lastIndexOf('return {ok:true');
  assert.ok(iOk > iSet, 'the road path’s ok:true still comes after its confirmed write');
  const tr = body.slice(body.indexOf("if(cost==='transit')"), iSet);
  assert.ok(tr.length > 0, 'the transit branch is in this function');
  assert.match(tr, /if\(!r\|\|!r\.ok\)\{[^}]*renderPanel\('err'\)/,
    'and a transit answer that did not come back is a failure, not a silent ok');
  assert.ok(tr.indexOf('return {ok:true') > tr.indexOf('if(!r||!r.ok)'),
    '…which is returned BEFORE its own ok:true line');
  assert.ok(!/try\{ GE\(\)\.layers\.setSourceData\(SRC,\{type:'FeatureCollection',features:feats\}\); \}catch\(_\)\{\}/.test(body),
    'the swallowed write is gone, in the syntax it was written in');
});

/* ── ⑦ THE CEILING HELD ────────────────────────────────────────────────────────────────────────
   #R199 capped js/atlas-console.js and the cap is the reason this round's catalogue entries and
   notes live inside existing source lines. Raising it would have been the easy half of the same
   mistake this round is about. */
test('R278 ⑦ js/atlas-console.js did not grow', () => {
  const n = ATLAS().split(/\r?\n/).length;
  assert.ok(n < 5300, `js/atlas-console.js is ${n} lines; #R199's ceiling is 5,300 and is never raised`);
});
