/* ============================================================================
 *  IntMap · #R397 — Atlas's own eyes were shut, and its own data was a ceiling
 * ----------------------------------------------------------------------------
 *  「AtlasがIntMapを使うのであり、AtlasがIntMapに従属するのではありません。」
 *
 *  ⚠⚠⚠ THE CENTRAL FINDING OF THIS ROUND IS THAT THE VERIFIER COULD NOT SEE. Three names in
 *  js/atlas-capabilities.js — the file whose whole job is to observe the app before and after every
 *  operation — did not exist, and `try{}catch(_){}` turned each one into a plausible reading:
 *
 *    · `GE().layers.list()`   — no such method on the façade. `visibleLayerIds()` returned [] forever.
 *    · `getCenter()` read as `c[0]`/`c[1]` — it returns `{lng,lat}`, so lng/lat were NaN, and
 *      `JSON.stringify(NaN)` is `null`, so the camera observer compared nulls and COULD ONLY SEE
 *      ZOOM. A `view.flyTo` across the planet at an unchanged zoom reported `no_change`.
 *    · `'nlq-pin-src'` / `'atl-poi-src'` — source ids that occurred on exactly one line in the whole
 *      repository, this file's. The paint observer could not see a pin appear.
 *
 *  Every assertion about those three is derived FROM THE FAÇADE'S OWN SOURCE, not from a name typed
 *  here — because a name typed here is the same mistake in a second place (#R323's lesson: two lists
 *  that describe one thing and are never compared). So §1 reads js/geo-engine.js to learn which
 *  methods exist, and §2 reads js/app-body.js and js/atlas-console.js to learn which source ids do.
 *
 *  ⚠ AND EVERY NEGATIVE CHECK HERE WAS MUTATED UNTIL IT WENT RED. #R392's lesson — 「検査は変異させて
 *  赤を見るまで書けていない」 — cost that round two green tests that proved nothing. The mutation for
 *  each block is named in its comment, and §7 re-runs three of the pure predicates against
 *  deliberately wrong inputs so the file demonstrates its own sensitivity rather than asserting it.
 *
 *  ⚠ §5 (the intent gates) and §6 (the goal gate) are gone: #R406 deleted js/atlas-planner.js, so
 *  no regular expression reads the request and there is no plan for a gate to sit in front of. §7's
 *  two surviving claims — IntMap's data is not a ceiling, and a centroid is not a place — are
 *  asserted against the rewritten core paragraph in js/atlas-policy.js.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { makeAtlasGeoObject } from '../js/atlas-geo-object.js';
import { makeAtlasPolicy } from '../js/atlas-policy.js';
import { makeAtlasAnswerAudit } from '../js/atlas-answer-audit.js';
import { makeAtlasAnomalyScore } from '../js/atlas-anomaly-score.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

const CAPS = read('js/atlas-capabilities.js');
const CAPS_CODE = codeOnly(CAPS);
const ENGINE = read('js/geo-engine.js');

/* ══ §1 THE OBSERVERS NAME METHODS THAT EXIST ═══════════════════════════════════════════════════
   MUTATION THAT MUST GO RED: put `GE().layers.list()` back into visibleLayerIds, or change
   `camera.getCenter()` back to `c[0]`/`c[1]`. */

test('R397 ①a: the layers façade has no enumerator, so the observer must not call one', () => {
  /* The façade's own source is the authority on what it offers. */
  const facade = ENGINE.slice(ENGINE.indexOf('layers:{'), ENGINE.indexOf('layers:{') + 6000);
  assert.ok(facade.length > 100, 'js/geo-engine.js no longer has a `layers:{` façade — this check has lost its subject');
  assert.ok(!/\blist\s*:/.test(facade),
    'the layers façade now HAS a `list:` — if that is real, visibleLayerIds() may use it and this check must be rewritten');
  assert.ok(!/GE\(\)\.layers\.list\b/.test(CAPS_CODE),
    'js/atlas-capabilities.js calls GE().layers.list() — that method does not exist, the `?` guard hides it, and visibleLayerIds() returns [] forever');
});

test('R397 ①b: visibleLayerIds enumerates through a method the façade really has', () => {
  const fn = CAPS_CODE.slice(CAPS_CODE.indexOf('function visibleLayerIds'));
  const body = fn.slice(0, fn.indexOf('function sourceFeatureCount'));
  assert.ok(body.length > 50, 'visibleLayerIds() is gone — the layer observer has no population');
  const called = [...body.matchAll(/GE\(\)\.(\w+)\.(\w+)\s*\(/g)].map((m) => m[1] + '.' + m[2]);
  assert.ok(called.length > 0, 'visibleLayerIds() no longer asks the engine anything');
  for (const c of called) {
    const [group, method] = c.split('.');
    const g = ENGINE.indexOf(group + ':{');
    assert.ok(g >= 0, `js/geo-engine.js has no \`${group}:{\` façade group, but the observer calls ${c}`);
    const scope = ENGINE.slice(g, g + 6000);
    assert.ok(new RegExp('\\b' + method + '\\s*:').test(scope),
      `the observer calls GE().${c} and js/geo-engine.js's \`${group}\` façade does not define \`${method}\` — this is the #R388 shape`);
  }
});

test('R397 ①c: the camera observer reads the shape getCenter actually returns', () => {
  /* Both adapters return an OBJECT. Reading it positionally is what produced NaN. */
  assert.match(ENGINE, /getCenter\(\)\s*\{[^}]*return\s+m\?m\.getCenter\(\):null/,
    'the MapLibre adapter no longer forwards getCenter() — re-derive what shape it returns before trusting this check');
  const cesium = read('js/cesium-engine.js');
  assert.match(cesium, /getCenter\(\)\s*\{[\s\S]{0,200}?lng\s*:/,
    'the Cesium adapter no longer returns {lng,…} from getCenter()');
  const fn = CAPS_CODE.slice(CAPS_CODE.indexOf('function cameraNow'));
  const body = fn.slice(0, fn.indexOf('function openPanelIds'));
  assert.ok(body.length > 50, 'cameraNow() is gone — the camera observer has nothing to compare');
  assert.ok(/c\.lng/.test(body) && /c\.lat/.test(body),
    'cameraNow() does not read c.lng / c.lat — getCenter() returns {lng,lat} and a positional read yields NaN');
  /* NaN must never reach the snapshot: JSON.stringify turns it into null and the observer then
     reports that a camera which moved did not. */
  assert.ok(/isFinite\(/.test(body),
    'cameraNow() does not check that the centre is finite — a NaN stringifies to null and a moved camera reads as unchanged');
});

/* ══ §2 THE PAINT OBSERVER NAMES SOURCES THAT ARE ACTUALLY CREATED ═════════════════════════════
   MUTATION THAT MUST GO RED: change either id back to 'nlq-pin-src' / 'atl-poi-src'. */

test('R397 ②: every source id the paint observer counts is a source some file adds', () => {
  const fn = CAPS_CODE.slice(CAPS_CODE.indexOf('function paintNow'));
  const body = fn.slice(0, fn.indexOf('function changed'));
  assert.ok(body.length > 50, 'paintNow() is gone — the paint observer has no population');
  const ids = [...body.matchAll(/sourceFeatureCount\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(ids.length >= 4, `paintNow() counts only ${ids.length} sources — it counted four (poly, line, pins, poi)`);
  /* Where a source is CREATED is the authority. Searched across the app, not guessed. */
  const creators = ['js/app-body.js', 'js/atlas-console.js', 'js/map-tools.js', 'js/data-layers.js']
    .map((f) => codeOnly(read(f))).join('\n');
  for (const id of ids) {
    assert.ok(creators.indexOf("addSource('" + id + "'") >= 0 || creators.indexOf("hasSource('" + id + "'") >= 0,
      `paintNow() counts features in '${id}', and no file creates a source by that name — sourceFeatureCount() returns -1 for it on every call`);
  }
});

/* ══ §3 THE COMMON GEOGRAPHIC OBJECT, AND WHAT A COORDINATE IS ALLOWED TO CLAIM ════════════════ */

const G = makeAtlasGeoObject();

test('R397 ③a: an unplaced object is not at Null Island', () => {
  /* THE BUG THIS CHECK EXISTS FOR: `isFinite(Number(null))` is true, because Number(null) is 0. The
     first revision of js/atlas-geo-object.js therefore reported placed()===true for {lng:null,lat:null},
     which made mergeKnown() skip the merge — the file's whole purpose — for one revision. */
  const m = G.geoObject({ name: 'Nowhere' });
  assert.equal(m.provenance, 'model_named');
  assert.equal(m.lng, null);
  assert.equal(G.placed(m), false, 'an object with no coordinate reads as placed — Number(null) is 0, not absent');
  assert.equal(G.placed(G.geoObject({ name: 'x', lng: '', lat: '' })), false, 'an empty-string coordinate reads as placed');
  assert.equal(G.validLngLat(200, 0), false);
  assert.equal(G.validLngLat(0, 91), false);
});

test('R397 ③b: a representative centroid is never the point the reader chose', () => {
  /* 「ジオコーダが返した国・地域の代表座標を、ユーザー指定地点としてAI promptへ渡してはいけない。」 */
  const c = G.geoObject({ name: 'Kenya', lng: 37.9, lat: 0.02, provenance: 'resolved_place_centroid' });
  assert.equal(G.placed(c), true, 'a centroid is a real coordinate and stays one');
  assert.equal(G.pointLike(c), false, 'a centroid must not be treated as an exact spot');
  assert.equal(G.describesUserPoint(c), false, 'a centroid must never be described as the point the user specified');
  const u = G.geoObject({ name: 'here', lng: 1, lat: 2, provenance: 'user_specified' });
  assert.equal(G.describesUserPoint(u), true, 'a point the reader actually specified must be usable as one');
  assert.equal(G.describesUserPoint(G.geoObject({ name: 'x', lng: 1, lat: 2, provenance: 'feed_coordinate' })), false,
    'a feed coordinate is a real position but it is not the READER\'s point');
  /* An undeclared coordinate must fail SAFE — toward the centroid class, never toward a point. */
  assert.equal(G.pointLike(G.geoObject({ name: 'x', lng: 1, lat: 2 })), false,
    'a coordinate with no declared provenance is treated as an exact spot — it must default to the centroid class');
  assert.ok(G.POINT_LIKE.indexOf('resolved_place_centroid') < 0, 'the centroid class is inside POINT_LIKE');
  assert.ok(G.USER_POINT.indexOf('resolved_place_centroid') < 0, 'the centroid class is inside USER_POINT');
});

test('R397 ③c: a coordinate code already had is adopted, not re-resolved', () => {
  /* THE REPORTED DEFECT. The model names «Kahramanmaras»; IntMap already holds the USGS record for
     «14 km SSW of Kahramanmaras». Name-only matching made these two different places. */
  const merged = G.mergeKnown(
    [{ name: 'Kahramanmaras', country: 'Turkey' }],
    [{ id: 'k1', name: '14 km SSW of Kahramanmaras', lng: 36.9, lat: 37.6, provenance: 'feed_coordinate' }]
  );
  assert.equal(merged.length, 1, 'the same place arrived twice — containment matching did not join them');
  assert.equal(merged[0].lng, 36.9);
  assert.equal(merged[0].provenance, 'feed_coordinate', 'the merged object lost the provenance of the coordinate it took');
  /* A known object nobody named still belongs to the turn: it is already on the map. */
  const kept = G.mergeKnown([], [{ id: 'k2', name: 'Osaka', lng: 135.5, lat: 34.7, provenance: 'geocoded_point' }]);
  assert.equal(kept.length, 1, 'a place IntMap had already located was dropped because the model did not mention it');
  /* AND IT MUST NOT INVENT A JOIN. Two genuinely different places stay two. */
  const apart = G.mergeKnown(
    [{ name: 'Osaka', country: 'Japan' }],
    [{ id: 'k3', name: 'Reykjavik', lng: -21.9, lat: 64.1, provenance: 'feed_coordinate' }]
  );
  assert.equal(apart.length, 2, 'two unrelated places were merged — containment matching is too loose');
  assert.equal(apart.find((o) => o.name === 'Osaka').lng, null, 'Osaka took Reykjavik\'s coordinate');
});

/* ══ §4 THE ANSWER CARRIES THE COORDINATE, AND THE PINNING STEP READS IT ═══════════════════════ */

test('R397 ④a: the pinning step reads a coordinate off the place it was handed', () => {
  const verify = codeOnly(read('js/atlas-verify.js'));
  assert.ok(verify.indexOf('makePinReplyPlaces') >= 0,
    '_pinReplyPlaces is not in js/atlas-verify.js — eight of its dependencies live there and js/atlas-console.js has a shrink-only ceiling');
  const fn = verify.slice(verify.indexOf('function makePinReplyPlaces'));
  assert.ok(/GEOBJ\.pointLike\(/.test(fn),
    'the pinning loop does not ask whether the place already knows where it is — it re-geocodes a coordinate it was given');
  assert.ok(/GEOBJ\.geoObject\(/.test(fn),
    'the mapper does not build a GeoObject — lng/lat/provenance are dropped exactly as they were before #R397');
  /* The console must hand the place over WHOLE. Re-flattening to {n,c,k} one line earlier is what
     discarded the coordinate that normalizeAnswer had just merged in. */
  const console_ = codeOnly(read('js/atlas-console.js'));
  assert.ok(!/_pinReplyPlaces\(\(_env\.places\|\|\[\]\)\.map\(/.test(console_),
    'the analyze path still re-flattens _env.places before pinning — the merged coordinate is discarded one line before it is needed');
});

test('R397 ④b: the answer schema can carry a reference to a resolved place, and still no coordinates', () => {
  const contract = read('js/atlas-answer-contract.js');
  const places = contract.slice(contract.indexOf('places: {'), contract.indexOf('places: {') + 500);
  assert.ok(/geoId/.test(places), 'ANSWER_SCHEMA.places has no geoId — a coordinate code resolved has no field to travel in');
  assert.ok(!/\blat\b\s*:\s*\{/.test(places) && !/\blng\b\s*:\s*\{/.test(places),
    'ANSWER_SCHEMA.places now asks the MODEL for a latitude — a generated coordinate is the one kind a map must not draw');
  /* normalizeAnswer must actually merge, not merely accept the option. */
  assert.match(codeOnly(contract), /GEO\.mergeKnown\(/,
    'normalizeAnswer does not call mergeKnown — knownPlaces is accepted and ignored');
});

/* R397 ⑤a-⑤c (the intent gates) and ⑥a-⑥b (the goal gate) removed in #R406: _validatePlan, _requestProfile, _applyIntentGates and POLICY.unmetGoalText are deleted with js/atlas-planner.js — a regular expression no longer decides what the sentence meant, and there is no plan to gate. What the turn does is decided by the model choosing tools (tests/r406-agent.test.mjs). */

/* ══ §7 THE PROMPT NO LONGER MAKES INTMAP'S OWN DATA A CEILING ══════════════════════════════════ */

const POL = makeAtlasPolicy();

test('R397 ⑦a: the policy clauses exist, are reachable, and say what they must', () => {
  const all = POL.all();
  assert.ok(all.length > 800, 'the policy clauses collapsed to almost nothing');
  /* ⚠ (#R406) THE CLAUSE WAS REWRITTEN, NOT WITHDRAWN. POLICY.sourcePrecedence and its «NOT an
     obligation and NOT a ceiling» / «GENERAL ASSISTANT» headings are gone; both sentences are now
     inside the single core paragraph, which is what these two read. What #R397 established — that
     IntMap's own data is not a ceiling, and that an ordinary question may simply be answered — is
     asserted against the shipped wording, so a round that drops the meaning still goes red. */
  assert.ok(/not your knowledge ceiling/.test(all),
    'the core instruction no longer says IntMap\'s data is not a ceiling');
  assert.ok(/Answer directly when tools are unnecessary/.test(all),
    'nothing tells Atlas it may answer an ordinary question without reaching for a tool');
  assert.ok(/resolved_place_centroid/.test(all),
    'the model is never told what a representative centroid means, so it can read one as an exact spot');
  /* And SYS() must actually include them. */
  const c = codeOnly(read('js/atlas-console.js'));
  assert.ok(/POLICY\.all\(\)/.test(c), 'SYS() does not include the policy clauses — they exist and are never sent');
});

test('R397 ⑦b: the old forced-grounding framing is gone', () => {
  const c = read('js/atlas-console.js');
  assert.ok(c.indexOf('not a generic chatbot reply') < 0,
    'the MAPPING MANDATE still derives a reason to operate the map from IntMap being a map product');
  /* The anti-fabrication rule must NOT have gone with it. */
  assert.ok(c.indexOf('GROUNDING RULE') >= 0, 'the anti-fabrication grounding rule was removed along with the ceiling');
  assert.ok(c.indexOf('GROUNDING IS NOT A CEILING') >= 0,
    'the grounding rule no longer distinguishes «traceable» from «all you may use»');
});

/* ══ §8 THE SCHEMA REACHES THE PROVIDER THAT IS ACTUALLY CONFIGURED ════════════════════════════ */

const PROXY = read('supabase/functions/ai-proxy/index.ts');

test('R397 ⑧a: callOpenAI receives the caller schema, and degrades instead of failing', () => {
  const sig = PROXY.slice(PROXY.indexOf('async function callOpenAI'), PROXY.indexOf('async function callOpenAI') + 400);
  assert.ok(/schemaFormat/.test(sig),
    'callOpenAI has no schema parameter — every JSON schema in IntMap is client-validated only and the provider is asked for a bare json_object');
  assert.ok(/openAiSchemaFormat\(/.test(PROXY), 'nothing converts the Gemini-dialect schemas into OpenAI\'s');
  /* The ladder must still be able to walk down to what every call did before. */
  assert.ok(/usedJson\s*===\s*"schema"/.test(PROXY) && /usedJson\s*=\s*"object"/.test(PROXY),
    'a rejected strict schema no longer degrades to json_object — a dialect this model dislikes would kill the call');
  assert.ok(/schemaAttached/.test(PROXY),
    'the response does not say whether the provider was actually held to the schema, so a missing field cannot be attributed');
});

test('R397 ⑧b: the strict conversion is faithful, and refuses what it cannot express', () => {
  /* Exercised through the same rules the function follows, on the shapes this app really sends. */
  const m = PROXY.match(/function strictJsonSchema\([\s\S]*?\n\}/);
  assert.ok(m, 'strictJsonSchema is gone');
  const src = m[0];
  /* Upper-case Gemini type names must be mapped, not passed through. */
  assert.ok(/OPENAI_TYPE_BY_NAME/.test(PROXY) && /OBJECT:\s*"object"/.test(PROXY),
    'the uppercase Gemini dialect is not translated — OpenAI rejects `"type":"OBJECT"`');
  /* An optional field must be widened rather than forced. */
  assert.ok(/"null"/.test(src), 'an optional property is not widened with null — strict mode would force the model to invent it');
  /* And the enum has to be widened WITH it, or the schema is unsatisfiable. */
  assert.ok(/child\.enum/.test(src),
    'a nullable enum keeps its original enum — {type:["string","null"], enum:[…]} admits null by type and forbids it by enum, so no instance validates');
});

/* ══ §9 THE GATE THAT DECISIONS.md CLAIMS ACTUALLY RUNS ════════════════════════════════════════ */

/* ══ §11 AN EARTHQUAKE AGAINST A TYPHOON ════════════════════════════════════════════════════════ */

const AN = makeAtlasAnomalyScore();
const NOW = 1750000000000;
const hoursAgo = (n) => NOW - n * 3600 * 1000;
/* A day shaped the way the feeds really deliver: USGS publishes dozens of rows, everything else
   publishes a handful. THIS is what produced 「地震だけを3件」 — not a preference for seismology.
   ⚠ THE FIXTURE HAD TO BE MADE HARDER, AND FINDING THAT OUT IS WHY THE MUTATION RUN MATTERS. The
   first version used forty SMALL offshore quakes, and ⑪a passed with `perKind` removed entirely —
   the diversity was coming from the scoring (an unpopulated offshore M5 simply loses), so the check
   was green for a reason that had nothing to do with the mechanism it names. These are a swarm near a
   populated area: every one of them outscores the other hazards, so without the per-kind cap they
   take all three places, and ⑪a is measuring the cap. */
const QUAKE_HEAVY = Array.from({ length: 40 }, (_, i) => ({
  kind: 'earthquake', name: 'M' + (7.0 + i * 0.02).toFixed(2), place: 'near a city',
  severityRaw: 7.0 + i * 0.02, populationAffected: 9e6, radiusKm: 350,
  atMs: hoursAgo(1 + i * 0.05), confidence: 'high', internationalWeight: 0.85, baselineDeviation: 0.95,
}));
const OTHER_KINDS = [
  { kind: 'cyclone', name: 'Typhoon', place: 'Luzon', severityRaw: 4, populationAffected: 8e6, radiusKm: 400, atMs: hoursAgo(6), confidence: 'high', internationalWeight: 0.7, baselineDeviation: 0.6 },
  { kind: 'flood', name: 'Basin flooding', place: 'Sindh', severityRaw: 3, populationAffected: 2.5e6, radiusKm: 300, atMs: hoursAgo(20), confidence: 'medium', internationalWeight: 0.5, baselineDeviation: 0.8 },
  { kind: 'volcano', name: 'Sakurajima', place: 'Kagoshima', severityRaw: 3, populationAffected: 6e5, radiusKm: 30, atMs: hoursAgo(3), confidence: 'high', internationalWeight: 0.3 },
];

test('R397 ⑪a: one feed publishing hundreds of rows cannot take every place', () => {
  const all = QUAKE_HEAVY.concat(OTHER_KINDS);
  /* First establish that this fixture WOULD be swept, so the assertion below is about the cap. */
  const maxPerKind = (rows) => Math.max(...Object.values(rows.reduce((m, r) => {
    m[r.kindScale] = (m[r.kindScale] || 0) + 1; return m;
  }, {})));
  const unlimited = AN.rank(all, { nowMs: NOW, n: 3, perKind: 9999 });
  assert.equal(maxPerKind(unlimited), 3,
    'the fixture no longer reproduces the defect: with no per-kind cap it already returns mixed kinds, so ⑪a would pass without the cap existing');
  const top = AN.rank(all, { nowMs: NOW, n: 3 });
  assert.equal(top.length, 3);
  assert.ok(maxPerKind(top) <= 2,
    `a forty-row swarm took ${maxPerKind(top)} of the three places — one feed is still crowding out the rest`);
  assert.ok(new Set(top.map((r) => r.kindScale)).size >= 2,
    'every place went to one hazard class: ' + top.map((r) => r.kindScale).join(', '));
});

test('R397 ⑪b: …and a genuinely major earthquake still leads', () => {
  /* ⚠ THE HALF THAT MAKES ⑪a MEAN SOMETHING. A hard one-per-kind quota would also pass ⑪a while
     making the ranking useless, so this pins that the cap is on TICKETS, not on the output.
     MUTATION THAT MUST GO RED: change `pool.slice(0, n)` in rank() to a one-per-kind filter. */
  const top = AN.rank(QUAKE_HEAVY.concat(OTHER_KINDS), { nowMs: NOW, n: 3 });
  assert.equal(top[0].kindScale, 'earthquake',
    'on a day when the earthquakes genuinely outscore everything, the ranking still did not lead with one');
  assert.ok(top.filter((r) => r.kindScale === 'earthquake').length >= 2,
    'only ONE earthquake was allowed through on a genuinely seismic day — the per-kind cap has become a quota');
  /* Within a kind, the ordering is still the score's: the strongest of the swarm is the one sent up. */
  const quakes = top.filter((r) => r.kindScale === 'earthquake');
  assert.equal(quakes[0].rankWithinKind, 1, 'the swarm member sent forward first was not its own highest-scoring row');
  assert.ok(quakes[0].score >= quakes[1].score, 'the two earthquakes came through out of score order');
});

test('R397 ⑪c: severity is one component, and the kind scales are not interchangeable', () => {
  const city = AN.score({ kind: 'earthquake', severityRaw: 5.8, populationAffected: 4e6, radiusKm: 60, atMs: hoursAgo(2), confidence: 'high' }, NOW);
  const ocean = AN.score({ kind: 'earthquake', severityRaw: 7.4, populationAffected: 200, radiusKm: 150, atMs: hoursAgo(2), confidence: 'high' }, NOW);
  assert.ok(city.value > ocean.value,
    'an M5.8 under a city ranks below an M7.4 under open ocean — the ranking is still sorting by magnitude');
  /* 「事象種別ごとの尺度の違い」: 5 on the Mw curve and 5 on the cyclone curve must not be one number. */
  assert.ok(AN.severityOf('cyclone', 5) > AN.severityOf('earthquake', 5) + 0.3,
    'the per-kind severity curves have collapsed into one scale');
  assert.ok(AN.WEIGHTS.severity < 0.5, 'severity alone now decides the ranking');
});

test('R397 ⑪d: what was not measured is named, never defaulted', () => {
  const thin = AN.score({ kind: 'flood', name: 'x' }, NOW);
  assert.equal(thin.value, 0, 'a candidate with no measurements scored above zero — a default was invented');
  assert.ok(thin.missing.indexOf('severity') >= 0 && thin.missing.indexOf('population') >= 0,
    'the unmeasured components are not reported, so the model cannot tell a gap from a low value');
  /* And the explanation is carried out with the result, per 「説明可能な内部スコアまたは根拠を保持」. */
  const full = AN.score(OTHER_KINDS[0], NOW);
  assert.ok(Object.keys(full.why).length >= 5, 'the score has no component breakdown to explain it');
  assert.ok(AN.promptBlock([Object.assign({}, OTHER_KINDS[0], full, { score: full.value })]).indexOf('severity=') >= 0,
    'the prompt block states a rank without the components behind it');
});

test('R397 ⑪e: the ranking is wired to the real feed, not to a fixture', () => {
  /* ⚠ CLAUDE.md §3.3 forbids a placeholder implementation. A scorer nothing calls is one. */
  const c = codeOnly(read('js/atlas-console.js'));
  assert.ok(/ANOM\.fromUsgs\(/.test(c), 'nothing converts the live USGS rows into ranking candidates');
  assert.ok(/ANOM\.rank\(/.test(c), 'the cross-domain ranking is never computed in the app');
  assert.ok(/ANOM\.promptBlock\(/.test(c), 'the ranking is computed and never given to the model');
  assert.ok(/_lastQuakeFeatures/.test(c),
    '_quakeData returns prose only, so the ranking has no magnitudes to work from');
});

/* ══ §10 DID THE ANSWER ADDRESS THE QUESTION? ═══════════════════════════════════════════════════ */

const AUD = makeAtlasAnswerAudit();
const envOf = (text, lead, primary, limitations = []) => ({
  request: { text, answerGoal: '' },
  answer: { directAnswer: { text: lead, claimIds: ['c1'] }, sections: [], limitations },
  claims: [{ id: 'c1', text: primary, importance: 'primary', claimType: 'fact', dimension: 'level', evidenceIds: ['e1'], confidence: 'high' }],
});

test('R397 ⑩a: the question-coverage check reads the lead, and declines when it cannot tell', () => {
  const q = 'What is the life expectancy in Japan?';
  assert.equal(AUD.questionAddressed(envOf(q, 'Life expectancy in Japan is 84.0 years.', 'Japan life expectancy 84.0')).covered, true);
  /* Peripheral: same place, different metric. Detected, and only as `partial`. */
  const per = AUD.questionAddressed(envOf(q, 'Japan has an ageing population and low fertility.', 'Japan fertility 1.20'));
  assert.equal(per.covered, false, 'an answer about a different metric of the same place read as covered');
  assert.equal(per.partial, true, 'the peripheral case must be distinguishable from a wholly off-topic answer');
  /* A pronoun-only follow-up has no head term and must produce NO finding at all. */
  assert.ok(AUD.questionAddressed(envOf('and it?', 'Yes.', 'x')).skipped, 'a bare follow-up was judged');
  /* An honest refusal is answered by the evidence codes, not by this one. */
  assert.equal(AUD.questionAddressed(envOf(q, 'This cannot be verified from the available evidence.', 'x', ['no source covers it'])).skipped,
    'declined', 'an honest refusal was treated as a failure to address the question');
});

test('R397 ⑩b: the same defect gets the same verdict in Japanese as in English', () => {
  /* Before the CJK runs were split on their attributive particles, a Japanese question produced ONE
     term where the English produced three — so the Japanese reader got the harsher verdict for the
     identical answer. MUTATION THAT MUST GO RED: remove the `t.split(/[の的之]/)` loop. */
  const ja = AUD.questionAddressed(envOf('日本の平均寿命は？', '日本は高齢化が進み、出生率が低下しています。', '日本 出生率 1.20'));
  const en = AUD.questionAddressed(envOf('What is the life expectancy in Japan?', 'Japan has an ageing population.', 'Japan fertility'));
  assert.equal(ja.covered, false);
  assert.equal(en.covered, false);
  assert.equal(ja.partial, en.partial, 'the same peripheral answer is graded differently by language');
});

test('R397 ⑩d: the question tokeniser cannot be made to backtrack', () => {
  /* ⚠⚠⚠ THIS SHIPPED AS A HIGH-SEVERITY ReDoS AND CODEQL CAUGHT IT ON THE PULL REQUEST. The first
     version stripped particles with `(?:…|と|は|…|とは|…)+$` — and because BOTH `と` and `は` are
     alternatives alongside `とは`, 「とはとはとは…」 decomposes two ways at every step. Measured on the
     flagged sub-pattern: 26 repetitions took **3,484 ms** (16 → 27 ms, 20 → 47 ms, 24 → 767 ms), so a
     54-character question would have frozen the tab, and the input is the reader's own text.
     Two assertions, because the timing alone would be flaky and the shape alone would not prove it
     runs: the SHAPE says no quantifier ranges over an alternation, and the CLOCK says a pathological
     input a thousand times larger is still instant. */
  const src = read('js/atlas-answer-audit.js');
  assert.ok(!/_JA_TRIM|_KO_TRIM|_ZH_TRIM/.test(src),
    'the old combined trim regexes are back — they are the ones with the ambiguous alternation');
  /* No `(?:…|…)+` anywhere in this file's regex literals: one token per pass is the invariant. */
  for (const lit of src.match(/\/\(\?:[^\n]*?\/[gimsuy]*/g) || []) {
    assert.ok(!/\)\+/.test(lit),
      'a quantifier ranges over an alternation again: ' + lit.slice(0, 80) + ' — strip ONE token per pass instead');
  }
  const attack = 'X' + 'とは'.repeat(20000) + 'Z';
  const t0 = process.hrtime.bigint();
  AUD.headTerms(attack);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 500, `headTerms took ${ms.toFixed(0)} ms on 20,000 ambiguous repetitions — it is backtracking again`);
});

test('R397 ⑩c: neither verdict can block a turn', () => {
  /* ⚠ THE POINT OF THIS CHECK IS THE SEVERITY, AND IT IS DELIBERATE. Written as an error, this fired
     on tests/r350's own curated CORRECT answer — a good answer that reuses none of the question's
     nouns — costing a second model call. Anything that promotes either code to `error` must first
     make the extraction able to pass that fixture. */
  assert.equal(AUD.AUDIT_CODES['answer.question_not_addressed'], 'warning',
    'this code can now block a turn, and lexical overlap is not a reliable enough test to do that');
  assert.equal(AUD.AUDIT_CODES['answer.question_only_peripheral'], 'warning');
});

test('R397 ⑨: the capability audit runs in BOTH gates, and the match is a command not a comment', () => {
  /* ⚠ THIS CHECK WAS GREEN FOR THE WRONG REASON ON ITS FIRST RUN. Written as one regex over both
     runner files joined together, it matched `See scripts/atlas-capability-audit.mjs.` — a COMMENT in
     scripts/test-parallel.mjs — and would have reported the gate present in CI, where it is not. The
     recurring form (#R318's 9th, #R320's 10th, #R392's 12th): a check that reads source must strip
     comments and must ask about each place separately. */
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts['check:capabilities'], 'the capability audit script is gone');
  const local = codeOnly(read('scripts/test-parallel.mjs'));
  assert.ok(/atlas-capability-audit/.test(local),
    'the twenty-item capability audit does not run in npm test, while DECISIONS.md calls it the gate for the one-list rule');
  /* ci.yml is YAML, so codeOnly's JS comment rules do not apply — strip `#` lines instead. */
  const ci = read('.github/workflows/ci.yml').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.ok(/check:capabilities|atlas-capability-audit/.test(ci),
    'the capability audit runs locally but not in CI — the registry can be broken by a push that never runs its gate');
});
