/* ============================================================================
 *  Atlas · what the dispatch runs, what the catalogue tells the planner, and what a result carries
 *  (js/atlas-console.js dispatch, js/atlas-catalog-text.js, js/atlas-capabilities.js observers,
 *  js/atlas-toolsurface.js results, js/atlas-result-facts.js)
 * ----------------------------------------------------------------------------
 *  (tests-by-topic) Gathered from three round files; every test keeps the title it had there:
 *    · tests/r278-checks.test.mjs                  — 「半径でごまかすな」: no capability implemented and invisible
 *    · tests/r726-atlas-eval-checks.test.mjs ⑤–⑩ ⑫ ⑬ — Atlas evaluated on production, the registry / surface / facts half
 *    · tests/r150-checks.test.mjs #7               — ONE ambiguity gate before painting
 *  ⚠ tests/gate-parity-and-shards-checks.test.mjs re-inserts a retired line ceiling into #R278's
 *  checks as a mutation probe, using this file's ATLAS() helper — keep the name.
 * ==========================================================================*/
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
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditLines, catalogueText, dispatchCapabilities } from '../scripts/atlas-catalog.mjs';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly, codeOnly as stripComments } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { importModule } from './helpers/import-module.mjs';
import { appSource } from './app-source.mjs';
import { capsSource, capabilityEntry } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* (#R278) its own comment stripper, kept: it leaves string literals in place, which ⑤/⑥ read */
const ATLAS = () => (read('js/atlas-console.js') + '\n' + capsSource());
const TOOLS = () => stripComments(read('js/map-tools.js'));
const src = (p) => codeOnly(readLF(join(ROOT, p)));   /* (#R726's reader) */

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
/* (module-graph) the registry IMPORTS the engine now. The verdicts below are each observer's own, judged
   with no renderer to ask — what an absent window.IntMapGeoEngine was — so the engine edge is handed null.
   (The real engine with no map answers observable:false, which rightly turns a negative into unobserved.) */
const { makeAtlasCapabilities } = await importModule('js/atlas-capabilities.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine: null } } });
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const CONSOLE = (src('js/atlas-console.js') + '\n' + capsSource());
const CAPS_SRC = src('js/atlas-capabilities.js');
const SURF = src('js/atlas-toolsurface.js');
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
].join('\n').split('\n');
/* (atlas-capability-modules) what the dispatch can run is DATA too — one group per capability entry */
const FAKE_CAPS = [{ line: 1, names: ['flyTo'], src: 'return 1;' }, { line: 2, names: ['walkshed', 'reachable2'], src: 'return 2;' }];

test('R278 ① the catalogue gate names an uncatalogued capability, and only then goes quiet', () => {
  const red = auditLines(fakeAtlas(false), { minCaps: 2, caps: FAKE_CAPS });
  assert.equal(red.missing.length, 1, 'an action with a dispatch case and no catalogue entry must be reported');
  assert.deepEqual(red.missing[0].names, ['walkshed', 'reachable2'], 'and reported by every spelling it answers to');

  const green = auditLines(fakeAtlas(true), { minCaps: 2, caps: FAKE_CAPS });
  assert.equal(green.missing.length, 0, 'catalogued → silent');

  /* and the match is on the QUOTED name the planner would emit, not on the word appearing in prose:
     "Earth Replay" in a sentence told the model nothing it could put in JSON, and that is exactly the
     state earthReplay was in for dozens of rounds. */
  const prose = fakeAtlas(false).slice();
  prose[1] = prose[1].replace('.\\n', '. You can also show a walkshed around a place.\\n');
  assert.equal(auditLines(prose, { minCaps: 2, caps: FAKE_CAPS }).missing.length, 1, 'prose mentioning the word is not a catalogue entry');

  /* an empty or moved dispatch must fail loudly rather than pass on an empty set */
  assert.throws(() => auditLines(fakeAtlas(true), { minCaps: 2, caps: [] }), /dispatch cases/);
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
  /* ⚠ (#R469) FOUR NOW. `slope` went the way `earthReplay` went — 「⛰ 傾斜・斜面方向レイヤーは
     完全削除。」 — dispatch case, module, capability row, schema and catalogue entry together. #R278's
     rule is about the GAP between what the dispatch can run and what the planner is told about, and
     a capability that exists in NEITHER place opens no gap. It gets the same pair of negative
     assertions earthReplay has, so «deleted» stays measured rather than merely unlisted. */
  for (const t of ['isochrone', 'optimizeRoute', 'objects', 'rfCoverage']) {
    assert.ok(sys.includes(`{"type":"${t}"`), `${t} must be catalogued as an emittable action`);
  }
  assert.ok(!sys.includes('{"type":"earthReplay"'), 'and earthReplay is described nowhere, having been removed');
  assert.ok(!capabilityEntry('earthReplay'), '…including in the dispatch');
  assert.ok(!sys.includes('{"type":"slope"'), 'and neither is slope, deleted in #R469');
  assert.ok(!capabilityEntry('slope'), '…including in the dispatch');
  /* The mirror question — «does the catalogue offer anything the dispatch cannot run?» — is NOT
     asserted here, and the reason is worth writing down rather than leaving as an omission: the
     catalogue uses {"type":…} for NESTED schemas too, not only for actions. Running it once found
     {"type":"matmul"}, which is a verification check inside an answer's "checks" array and is
     supposed to have no dispatch case. A rule that cannot tell an action from a nested object would
     have to be taught the difference by a list of exceptions, and a list of exceptions is how a
     gate stops asserting anything. The six spellings each capability answers to are covered instead:
     if a `case` is renamed, ② fails on the name that vanished. */
  assert.ok(dispatchCapabilities().some((c) => c.names.includes('isochrone')), 'the isochrone case is still the one being catalogued');
});

/* ── ③ A TRAVEL-TIME QUESTION IS NOT A CIRCLE ──────────────────────────────────────────────────
   The substitution the user rejected has to be ruled out where the planner reads it, so the radius
   entry itself must send travel-time asks to the isochrone. */
test('R278 ③ the radius entry forbids standing in for a travel-time answer', () => {
  /* kept as a spelling: the dispatch cases and the map tools are closure code inside js/atlas-console.js / js/map-tools.js, which need the page and the map */
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
  /* kept as a spelling: the dispatch cases and the map tools are closure code inside js/atlas-console.js / js/map-tools.js, which need the page and the map */
  const body = stripComments((capabilityEntry('isochrone') || {}).run || '');   /* (atlas-capability-modules) the run of routing.isochrone */
  assert.ok(body);
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
  /* kept as a spelling: the dispatch cases and the map tools are closure code inside js/atlas-console.js / js/map-tools.js, which need the page and the map */
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
/* (#R795, completed in gate-parity-and-shards) R278 ⑦ was this ceiling and nothing else, so the test is retired with it: LINES measured the file's length, not what it costs or reaches. `npm run check:perf` ratchets the eager bundle and `npm run check:surface` ratchets IM_HOST / window.* — see tests/r168 #8. #R795's own detector missed this one on its spelling; tests/helpers/line-ceilings.mjs asks about the fact. */

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R726 ⑤–⑩ ⑫ ⑬ (formerly tests/r726-atlas-eval-checks.test.mjs)
   ⑤ the historical power map is verified by what is on the map ⑥ the camera is sampled when it has
   arrived ⑦ the base-display preset is a capability ⑧ a successful result carries the text the reader
   sees ⑨ results carry the facts their panels show ⑩ a highlight at a past year is that year's polity
   ⑫ find_capability says «nothing matched» so the search ends ⑬ map.clear verified against map and panels
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
const CAPS = makeAtlasCapabilities({});

test('R726 ⑤ the historical power map is verified by the faction fills on the map, so a redrawn map is rendered', () => {
  /* kept as a spelling: the dispatch cases and the map tools are closure code inside js/atlas-console.js / js/map-tools.js, which need the page and the map */
  const cap = CAPS.resolve('research.historicalMap');
  assert.equal(cap.observerKind, 'factions');
  const drawn = cap.verify({}, {}, { factions: 5 }, { factions: 5 }, { ok: true, html: '<b>map</b>' });
  assert.equal(drawn.status, 'completed', 'same count before and after is still a map on the globe');
  const none = cap.verify({}, {}, { factions: 0 }, { factions: 0 }, { ok: true, html: '' });
  assert.equal(none.code, 'not_rendered');
  const failed = cap.verify({}, {}, null, null, { ok: false, html: '' });
  assert.equal(failed.status, 'failed');
  /* (atlas-observer-undo) by effect key, through the renderer — js/atlas-console.js claims nlq-fac-src under map.factions */
  assert.match(liftFunction(CAPS_SRC, 'paintNow'), /ownedFeatures\('map\.factions'\)/, 'and every paint observer now sees the faction surface too');
});

test('R726 ⑥ the camera observer waits for the camera to arrive before it reports', () => {
  /* kept as a spelling: the dispatch cases and the map tools are closure code inside js/atlas-console.js / js/map-tools.js, which need the page and the map */
  const block = CAPS_SRC.slice(CAPS_SRC.indexOf('camera: {'), CAPS_SRC.indexOf('layer: {'));
  assert.match(block, /observe:\s*async function/, 'the AFTER sample is awaited');
  assert.match(block, /isAnimating/, 'the renderer is asked whether it is still easing');
  assert.match(block, /CAMERA_SETTLE_MS/, 'and the wait is bounded');
  assert.match(CAPS_SRC, /var CAMERA_SETTLE_MS = 2500;/);
});

test('R726 ⑦ the base-display preset is a capability Atlas can reach, with a schema, a catalogue block and a dispatch case', async () => {
  /* kept as a spelling: the dispatch cases and the map tools are closure code inside js/atlas-console.js / js/map-tools.js, which need the page and the map */
  const cap = CAPS.resolve('layers.baseDisplay');
  assert.ok(cap && !cap.withdrawn, 'registered');
  assert.equal(cap.observerKind, 'layer');
  const found = CAPS.search('基本表示をデフォルトに戻して', { want: 1, min: 1 }).ranked.map((r) => r.id);
  assert.ok(found.includes('layers.baseDisplay'), 'reachable by find_capability: ' + JSON.stringify(found.slice(0, 5)));
  const S = makeAtlasSchemas();
  assert.deepEqual(S.schemaFor('layers.baseDisplay').properties.mode.enum, ['default', 'clean', 'custom']);
  const docs = (await import('../js/atlas-catalog-text.js')).makeAtlasCatalogText({}, {});
  assert.match(docs.text(['layers.baseDisplay']), /"type":"baseDisplay"/, 'documented to the planner');
  assert.match(capabilityEntry('baseDisplay').run, /return doBaseDisplay\(a\);/, 'and the dispatch answers it');
  assert.match(liftFunction(src('js/atlas-controls.js'), 'doBaseDisplay'), /IntMapBaseDisplay/, 'through the panel\'s own owner, not a second copy of the rows');
});

test('R726 ⑧ a successful result carries the text of what the reader was shown', async () => {
  /* ⚠ (tests-by-topic) THE SURFACE IS RUN, NOT READ. This lifted mechanical() out of
     js/atlas-toolsurface.js and matched four spellings in it; the tool surface runs in node (the way
     tests for #R419 drive it), so a call is executed and its result read. */
  const { makeAtlasToolSurface } = await import('../js/atlas-toolsurface.js');
  const { makeAtlasAgent } = await import('../js/atlas-agent.js');
  const body = 'x'.repeat(3000);
  let reply = { ok: true, html: '<div>Osaka <b>is</b> shown ' + body + '</div>', meta: { status: 'completed' } };
  const surface = makeAtlasToolSurface({ capabilities: CAPS, schemas: makeAtlasSchemas(), runAction: async () => reply });
  const exec = surface.makeExecute(surface.baseTools(), makeAtlasAgent());
  const ok = await exec({ name: 'map_view', arguments: { place: 'Osaka' } });
  assert.equal(ok.ok, true);
  assert.ok(typeof ok.text === 'string' && ok.text.startsWith('Osaka is shown'), 'the shown text is on the result, as text: ' + String(ok.text).slice(0, 40));
  assert.ok(ok.text.length < 2100 && ok.text.length > 1900, 'bounded (RESULT_TEXT_MAX): ' + ok.text.length);
  /* on success only: a failure's html is not something the reader was shown as an answer */
  reply = { ok: false, html: '<div>could not</div>', meta: { status: 'failed' } };
  const bad = await exec({ name: 'map_view', arguments: { place: 'Nowhere' } });
  assert.equal(bad.text, undefined, 'on success');
});

test('R726 ⑫ an empty find_capability result ends the search instead of inviting a rephrase', () => {
  /* kept as a spelling: the dispatch cases and the map tools are closure code inside js/atlas-console.js / js/map-tools.js, which need the page and the map */
  const fn = liftFunction(SURF, 'find');
  assert.match(fn, /registry is complete/i);
  assert.match(fn, /IntMap has no such control/);
});

/* ── ⑨ the facts a tool's panel shows are in its result ────────────────────────────────────── */
test('R726 ⑨ satellites: sub-satellite point, the observer the reader named, and the next pass', () => {
  /* kept as a spelling: the dispatch cases and the map tools are closure code inside js/atlas-console.js / js/map-tools.js, which need the page and the map */
  const block = codeOnly(capabilityEntry('satellites').run);
  assert.match(block, /resolveObserver\(a,\{geocode,herePoint/, 'the observer is resolved from the arguments, the pin, the centre');
  const facts = src('js/atlas-result-facts.js');
  assert.match(liftFunction(facts, 'resolveObserver'), /a\.place \|\| a\.observer/, 'the place is read from the arguments');
  assert.match(liftFunction(facts, 'satelliteFacts'), /A\.nextPass\(found\.id/, 'the pass is computed by js/satellites-live.js, not narrated');
  assert.match(liftFunction(facts, 'satelliteFacts'), /found\.lat\.toFixed\(2\)/, 'the sub-satellite point is stated');
  const S = makeAtlasSchemas();
  assert.ok(S.schemaFor('layers.satellites').properties.place, 'the schema admits the observer place');
});

test('R726 ⑨ weather: the current conditions and the daily forecast, from the panel\'s own source', () => {
  /* kept as a spelling: the dispatch cases and the map tools are closure code inside js/atlas-console.js / js/map-tools.js, which need the page and the map */
  const block = codeOnly(capabilityEntry('weather').run);
  assert.match(block, /WX\.point\(ll\.lat,\s*ll\.lng/, 'js/weather.js IntMapWx.point — the same request the panel makes');
  assert.match(block, /weatherFacts\(j, WP&&WP\.describe, L\)/, 'the sky is named in the panel\'s own words');
  assert.match(src('js/weather.js'), /return \{ open, close, describe:/, 'js/weather.js exposes describe()');
});

test('R726 ⑨ routing: the journey is on the result, for the transit and the road branch alike', () => {
  /* kept as a spelling: the dispatch cases and the map tools are closure code inside js/atlas-console.js / js/map-tools.js, which need the page and the map */
  const block = codeOnly(capabilityEntry('directions').run);
  assert.match(src('js/atlas-result-facts.js'), /export function routeFacts\(r\)/);
  const n = (block.match(/exec:\{route:routeFacts\(r\)\}/g) || []).length;
  assert.equal(n, 2, 'both success returns carry it');
});

/* ── ⑩ the map's year applies to areas ─────────────────────────────────────────────────────── */
test('R726 ⑩ a country highlight while a past year is shown is drawn from that year\'s polities', () => {
  /* kept as a spelling: the dispatch cases and the map tools are closure code inside js/atlas-console.js / js/map-tools.js, which need the page and the map */
  const hl = liftFunction(CONSOLE, 'highlight');
  assert.match(hl, /_eraGeomsFor\(cs\)/, 'the era rung is asked first');
  assert.match(hl, /nlq-era-src/, 'and drawn into its own source');
  const era = liftFunction(src('js/atlas-era-highlight.js'), 'eraGeomsFor');
  assert.match(era, /IntMapTimeBorders/);
  assert.match(era, /geomForCode/, 'js/stats-compare.js\'s judgement, handed over');
  assert.match(era, /IntMapEraName/, 'a possessor gloss joins the possessor');
  assert.match(era, /resolveCountrySync\(p\.gloss\)/);
  assert.match(liftFunction(CONSOLE, 'clearHl'), /nlq-era-src/, 'and clearing the highlight clears it');
  const doc = src('js/atlas-catalog-text.js');
  assert.match(doc, /THE MAP\\'S YEAR APPLIES/, 'Atlas is told');
});

/* ── ⑬ a clear that found nothing to remove is complete, and the cards close through it ────── */
test('R726 ⑬ map.clear is verified against the map AND the panels, and an already-clean map is already_clear', () => {
  /* kept as a spelling: the dispatch cases and the map tools are closure code inside js/atlas-console.js / js/map-tools.js, which need the page and the map */
  const cap = CAPS.resolve('map.clear');
  assert.equal(cap.observerKind, 'clear');
  const moved = cap.verify({}, { what: 'route' }, { paint: { poly: 1 }, panels: [] }, { paint: { poly: 0 }, panels: [] }, { ok: true, html: 'x', exec: { cleared: ['route'] } });
  assert.equal(moved.code, 'ok');
  const still = cap.verify({}, { what: 'weather' }, { paint: { poly: 0 }, panels: ['weather-panel'] }, { paint: { poly: 0 }, panels: [] }, { ok: true, html: 'x', exec: { cleared: ['weather card'] } });
  assert.equal(still.status, 'completed', 'a closed card is a change of the panels, not of the paint');
  assert.equal(still.code, 'ok');
  const none = cap.verify({}, { what: 'pins' }, { paint: { poly: 0 }, panels: [] }, { paint: { poly: 0 }, panels: [] }, { ok: true, html: 'x', exec: { cleared: [] } });
  assert.equal(none.status, 'completed');
  assert.equal(none.code, 'already_clear');
  const block = codeOnly(capabilityEntry('clear').run);
  assert.match(block, /WP\.close\(\)/, 'the weather card closes through its owner');
  assert.match(block, /SP\.close\(\)/, 'so does the satellite card');
  assert.match(block, /exec:\{cleared:did\.slice\(\)\}/, 'and what was cleared is on the result');
  assert.match(src('js/atlas-results.js'), /'atlas\.code\.already_clear'/, 'the code has its sentence');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R150 #7 — geo-target unification: ONE ambiguity gate; confirmation never co-displays with a painted
   result (formerly tests/r150-checks.test.mjs). A spelling: the gate is closure code in the console.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
const html = appSource(new URL('../', import.meta.url));   /* (#R162) index.html + css/intmap.css + js/*.js */
test('R150 #7 geo-target: ONE ambiguity gate; confirmation never co-displays with a painted result', () => {
  /* kept as a spelling: the dispatch cases and the map tools are closure code inside js/atlas-console.js / js/map-tools.js, which need the page and the map */
  assert.match(html, /const _hlAmbigConfirm=\(ambigArr, clearNames\)=>\{/, 'single shared confirmation builder');
  // BOTH paths gate on ambiguity BEFORE painting and return a stop
  /* (atlas-capability-modules) `_hlGen` is a kernel `let`, so the run reads it live as `K._hlGen` */
  assert.match(html, /if\(gAmbig\.length\)\{ if\(_hlMyGen!==K\._hlGen\) return R\(true,''\); return R\(false, _hlAmbigConfirm\(gAmbig/, 'multi-region path gates before paint');
  assert.match(html, /if\(ambig\.length\)\{ if\(_hlMyGen!==K\._hlGen\) return R\(true,''\); const clear=/, 'single-colour path gates before paint');
  // the old co-display (ambiguous shown as a warning alongside the painted success) is GONE
  assert.ok(!/if\(gAmbig\.length\) hh\+=warn/.test(html), 'multi-region no longer appends an ambiguous warning to a painted reply');
  assert.ok(!/if\(ambig\.length\) hh\+=warn/.test(html), 'single-colour no longer appends an ambiguous warning to a painted reply');
  // the confirmation suppresses the planner say via meta.partial so "highlighted X" can't precede "which X?"
  assert.match(html, /_hlAmbigConfirm\(ambig, clear\)\+cwarn, \{meta:\{partial:true\}\}/, 'confirmation flags partial to suppress the planner say');
});
