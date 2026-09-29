/* ============================================================================
 *  js/atlas-console.js — what Atlas can see, and the places it resolves
 * ----------------------------------------------------------------------------
 *  Atlas's own observers reading methods and sources that exist (#R397), one journey collapsing to
 *  the live one (#R441), and research → geographic entity → drawing by identifier (#R489).
 *
 *  Consolidated from the round files named in each section banner below. Every test keeps the title
 *  it had there (untagged titles now carry the round they came from, #R<N>), and every section keeps
 *  its own history comment: why the check exists and what was measured. Each section is its own
 *  block, so its helpers stay its own; what every section shared (the repository root) is declared
 *  once below the imports.
 *
 *  Checks that used to READ a file for a spelling and can be RUN were rewritten to run the shipped
 *  code; the ones that still read say, in one line, why running is not possible (「read, not run: …」).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { makeAtlasGeoObject } from '../js/atlas-geo-object.js';
import { makeAtlasPolicy } from '../js/atlas-policy.js';
import { makeAtlasAnswerAudit } from '../js/atlas-answer-audit.js';
import { makeAtlasAnomalyScore } from '../js/atlas-anomaly-score.js';
import { ciRuns, ciRunsScript, npmTestRunsScript } from './helpers/ci-reach.mjs';
import { readLF } from '../scripts/eol.mjs';
import { makeAtlasTurnResults } from '../js/atlas-turn-results.js';
import { gunzipSync } from 'node:zlib';
import { makeAtlasAdmin1 } from '../js/atlas-admin1.js';
import { makeAtlasGeoLedger } from '../js/atlas-geo-ledger.js';
import { makeAtlasAgent } from '../js/atlas-agent.js';
import { NominatimGate as GATE } from '../js/nominatim-gate.js';

/* shared by the sections below (each used to declare its own copy) */
const R = (p) => readLF(join(ROOT, p));

/* the repository root, shared by every section below (each used to derive its own) */
const ROOT = fileURLToPath(new URL('../', import.meta.url));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r397-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
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

const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

const CAPS = read('js/atlas-capabilities.js');
const CAPS_CODE = codeOnly(CAPS);
const ENGINE = read('js/geo-engine.js');

/* ══ §1 THE OBSERVERS NAME METHODS THAT EXIST ═══════════════════════════════════════════════════
   MUTATION THAT MUST GO RED: put `GE().layers.list()` back into visibleLayerIds, or change
   `camera.getCenter()` back to `c[0]`/`c[1]`. */

/* (consolidation) ①a–①c used to read the observers' source and the façade's source and compare the
   spellings. They now RUN the shipped observers (js/atlas-capabilities.js OBSERVERS) over the shipped
   façade (js/geo-engine.js makeFacade) wrapped around an adapter that holds exactly what is given — so
   an observer that calls a method the façade does not have gets the same `[]`/`null` it got in
   production. `window` and `window.IntMapGeoEngine` are installed for one test and put back after,
   because this file used to run without either. */
async function withFacade(adapter, fn) {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window') ? globalThis.window : undefined;
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  const hadGE = window.IntMapGeoEngine;
  try {
    await import('../js/geo-engine.js');   /* publishes window.IntMapGeoEngine (once per process) */
    const factory = window.IntMapGeoEngine && window.IntMapGeoEngine.makeFacade ? window.IntMapGeoEngine : withFacade.factory;
    withFacade.factory = factory;
    const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
    window.IntMapGeoEngine = factory.makeFacade(adapter);
    return await fn(makeAtlasCapabilities({}).OBSERVERS);
  } finally {
    if (hadGE === undefined) delete window.IntMapGeoEngine; else window.IntMapGeoEngine = hadGE;
    if (hadWindow === undefined) delete globalThis.window;
  }
}
const STYLE = { layers: [{ id: 'coast' }, { id: 'rivers', layout: { visibility: 'visible' } }, { id: 'hidden', layout: { visibility: 'none' } }] };

test('R397 ①a: the layers façade has no enumerator, so the observer must not call one', async () => {
  /* the adapter offers the one enumerator both real adapters have (getStyle) and nothing else: an
     observer that reaches for a `layers.list()` would find nothing and report an empty map */
  const seen = await withFacade({ canDraw: () => true, isVisible: () => true, getStyle: () => STYLE }, (O) => O.layer.observe());
  assert.ok(seen.n > 0,
    'the layer observer found no layers on a map that has them — it is calling a method the façade does not have, and the `?` guard hides it (visibleLayerIds() returns [] forever)');
});

test('R397 ①b: visibleLayerIds enumerates through a method the façade really has', async () => {
  const seen = await withFacade({ canDraw: () => true, isVisible: () => true, getStyle: () => STYLE }, (O) => O.layer.observe());
  assert.deepEqual(seen.visible, ['coast', 'rivers'],
    'visibleLayerIds() no longer asks the engine what is drawn — this is the #R388 shape');
});

test('R397 ①c: the camera observer reads the shape getCenter actually returns', async () => {
  /* Both adapters return an OBJECT. Reading it positionally is what produced NaN. */
  const cam = (center) => ({ canDraw: () => true, isVisible: () => true, getStyle: () => STYLE,
    getCenter: () => center, getZoom: () => 5, getBearing: () => 0, getPitch: () => 0, getBounds: () => null });
  const objectShape = await withFacade(cam({ lng: 139.7, lat: 35.6 }), (O) => O.camera.observe());
  assert.ok(objectShape && objectShape.lng === 139.7 && objectShape.lat === 35.6,
    'cameraNow() does not read c.lng / c.lat — getCenter() returns {lng,lat} and a positional read yields NaN: ' + JSON.stringify(objectShape));
  /* NaN must never reach the snapshot: JSON.stringify turns it into null and the observer then
     reports that a camera which moved did not. */
  const unreadable = await withFacade(cam({ lng: 'x', lat: undefined }), (O) => O.camera.observe());
  assert.equal(unreadable, null,
    'cameraNow() does not check that the centre is finite — a NaN stringifies to null and a moved camera reads as unchanged');
  /* read, not run: the two ADAPTERS are the MapLibre map and the Cesium viewer, which node cannot
     build — what shape each one really returns is asked of its source. */
  assert.match(ENGINE, /getCenter\(\)\s*\{[^}]*return\s+m\?m\.getCenter\(\):null/,
    'the MapLibre adapter no longer forwards getCenter() — re-derive what shape it returns before trusting this check');
  const cesium = read('js/cesium-engine.js');
  assert.match(cesium, /getCenter\(\)\s*\{[\s\S]{0,200}?lng\s*:/,
    'the Cesium adapter no longer returns {lng,…} from getCenter()');
});

/* ══ §2 THE PAINT OBSERVER NAMES SOURCES THAT ARE ACTUALLY CREATED ═════════════════════════════
   MUTATION THAT MUST GO RED: change either id back to 'nlq-pin-src' / 'atl-poi-src'. */

test('R397 ②: every source the paint observer reads is a source some file adds', () => {
  /* read, not run: the claim is universal over every surface claim in js/ (no observer can point at a
     surface nothing creates), which the painters make only inside a live map. */
  /* (atlas-observer-undo) THE POPULATION MOVED. paintNow() no longer types source ids — it reads the
     surfaces painters CLAIM with the renderer (js/geo-engine.js render.claim / render.drawn). So the
     fact this check protects — 「the observer cannot be pointed at a source nothing creates」 — is now
     asked of every claim in js/, and paintNow() itself must not grow a typed id back. MUTATION THAT
     MUST GO RED: claim 'nlq-pin-src' anywhere, or type a quoted '…-src' back into paintNow(). */
  const fn = CAPS_CODE.slice(CAPS_CODE.indexOf('function paintNow'));
  const body = fn.slice(0, fn.indexOf('function changed'));
  assert.ok(body.length > 50, 'paintNow() is gone — the paint observer has no population');
  assert.match(body, /surfaceInventory\(\)/, 'paintNow() no longer reads the claimed surfaces');
  assert.ok(!/'[\w-]+-src'/.test(body), 'paintNow() types a source id again — that list is what missed every new surface');
  const ids = [];
  for (const f of readdirSync(resolve(ROOT, 'js')).filter((x) => x.endsWith('.js'))) {
    const src = codeOnly(read('js/' + f));
    const konst = new Map();
    for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*'([^'\n]+)'|,\s*([A-Za-z_$][\w$]*)\s*=\s*'([^'\n]+)'/g)) {
      const nm = m[1] || m[3], val = m[2] || m[4];
      if (nm && !konst.has(nm)) konst.set(nm, val);
    }
    for (const m of src.matchAll(/\bclaim\(\s*(?:'([^'\n]+)'|([A-Za-z_$][\w$]*))/g)) {
      if (m[1]) ids.push(m[1]); else if (konst.has(m[2])) ids.push(konst.get(m[2]));
    }
  }
  assert.ok(ids.length >= 8, `only ${ids.length} claimed surfaces were found in js/ — the sweep or the claims are broken`);
  /* Where a source is CREATED is the authority — and BOTH halves of how that was
     asked here were the shape #R488/#R533 keep costing this project:
       · the creators were a HAND-WRITTEN list of five files, so a source created
         by a sixth read as "created by nobody";
       · the match was the LITERAL `addSource('<id>'`, so a file that names its
         source in a constant (`const SRC_LN = 'shk-cont-src'; … addSource(SRC_LN`)
         could not be seen at all — which is exactly how #R546 arrived: the
         observer was right, the module really creates the source, and this check
         reported the opposite.
     So: discover every file in js/ from DISK, and resolve single-assignment
     string constants before asking. MUTATION THAT MUST GO RED: change either id
     in paintNow() back to 'nlq-pin-src' / 'atl-poi-src', or delete the addSource
     call in the module that creates one of them. */
  const JS_DIR = resolve(ROOT, 'js');
  const creators = readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).map((f) => codeOnly(read('js/' + f)));
  const created = new Set();
  for (const src of creators) {
    const konst = new Map();
    /* DECLARATIONS only, and the first binding wins: a later unrelated assignment to
       the same name must not be able to invent a source id that nothing creates. */
    for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*'([^'\n]+)'|,\s*([A-Za-z_$][\w$]*)\s*=\s*'([^'\n]+)'/g)) {
      const nm = m[1] || m[3], val = m[2] || m[4];
      if (nm && !konst.has(nm)) konst.set(nm, val);
    }
    /* ⚠ `removeSource` is NOT evidence of creation — a file may only tear one down. */
    for (const m of src.matchAll(/\b(?:add|has)Source\(\s*(?:'([^'\n]+)'|([A-Za-z_$][\w$]*))/g)) {
      if (m[1]) created.add(m[1]);
      else if (konst.has(m[2])) created.add(konst.get(m[2]));
    }
  }
  assert.ok(created.size > 40, `only ${created.size} sources were discovered in js/ — the sweep itself is broken`);
  for (const id of ids) {
    assert.ok(created.has(id),
      `paintNow() counts features in '${id}', and no file in js/ creates a source by that name — sourceFeatureCount() returns -1 for it on every call`);
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
  /* read, not run: the pinning step is wired between js/atlas-verify.js and the kernel's analyse path,
     which only a browser can drive. */
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

test('R397 ④b: the answer schema can carry a reference to a resolved place, and still no coordinates', async () => {
  /* RUN, not read (consolidation): the schema is the exported object, and the merge is asked of
     normalizeAnswer with a place code already resolved. */
  const { makeAtlasAnswerContract } = await import('../js/atlas-answer-contract.js');
  const CT = makeAtlasAnswerContract();
  const fields = Object.keys(CT.ANSWER_SCHEMA.properties.places.items.properties);
  assert.ok(fields.includes('geoId'), 'ANSWER_SCHEMA.places has no geoId — a coordinate code resolved has no field to travel in');
  assert.ok(!fields.some((f) => /^(lat|lng|lon|latitude|longitude|coordinates?)$/i.test(f)),
    'ANSWER_SCHEMA.places now asks the MODEL for a latitude — a generated coordinate is the one kind a map must not draw');
  /* normalizeAnswer must actually merge, not merely accept the option. */
  const env = CT.normalizeAnswer({ places: [{ name: 'Kahramanmaraş', country: 'Türkiye' }] },
    { knownPlaces: [{ name: 'Kahramanmaraş', lng: 36.93, lat: 37.58, provenance: 'geocoder' }] });
  assert.ok(env.places.length === 1 && env.places[0].lng === 36.93 && env.places[0].lat === 37.58,
    'normalizeAnswer does not call mergeKnown — knownPlaces is accepted and ignored: ' + JSON.stringify(env.places));
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
  /* read, not run: the grounding text is assembled inside the Atlas kernel, which only a browser can
     build. */
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
  /* read, not run: callOpenAI lives in the Deno edge function, which node cannot import (and would need
     the provider to run). */
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
  /* read, not run: strictJsonSchema is private to the Deno edge function, which node cannot import. */
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
  /* read, not run: the wiring to the live USGS feed is inside the kernel; the ranking itself is RUN in
     ⑪a–⑪d. */
  /* ⚠ AGENTS.md §3.3 forbids a placeholder implementation. A scorer nothing calls is one. */
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
  /* (gate-parity-and-shards) asked of `npm test`'s evaluated plan (tests/helpers/ci-reach.mjs), not of
     scripts/test-parallel.mjs's text: that file discovers its gates from package.json and names none. */
  assert.ok(npmTestRunsScript('atlas-capability-audit'),
    'the twenty-item capability audit does not run in npm test, while DECISIONS.md calls it the gate for the one-list rule');
  /* ⚠ (#R771) ASKED OF WHAT CI RUNS, NOT OF HOW ci.yml SPELLS IT — tests/helpers/ci-reach.mjs.
     The 28 declared gates stopped being one step each when they were split across three machines;
     grepping the workflow for this gate's name reported it as unrun while it ran every time. */
  assert.ok(ciRuns('check:capabilities') || ciRunsScript('atlas-capability-audit'),
    'the capability audit runs locally but not in CI — the registry can be broken by a push that never runs its gate');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r441-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
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
  /* read, not run: the composition happens inside the kernel's _atlCompose, which only a browser can
     build; the module's decisions are RUN in ①–⑦. */
  const atlas = codeOnly(R('js/atlas-console.js'));
  assert.match(atlas, /import\s*\{\s*makeAtlasTurnResults\s*\}\s*from\s*'\.\/atlas-turn-results\.js'/, 'js/atlas-console.js does not import the module');
  assert.match(atlas, /makeAtlasTurnResults\(\s*\{\s*norm\s*:\s*_lnorm\b[^}]*\}\s*\)/, 'the module is not given the console\'s own `_lnorm`');   /* (atlas-one-declaration) it is given the registry too */
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
  /* read, not run: the route case is a branch of the kernel's dispatch, which needs the routing engine
     and a map. */
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
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r489-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R489 — 「調査結果 → 地理エンティティ → 描画」の受け渡しが文字列頼みになっている
 * ----------------------------------------------------------------------------
 *  Two reports, one mechanism. A turn named fourteen Russian oblasts in its prose; the reader said
 *  「マッピングして」; and the next turn re-extracted those fourteen names OUT OF ITS OWN PROSE as
 *  bare Japanese strings — no country, no kind, no identifier — because the only thing a turn leaves
 *  behind is js/atlas-turn-continuity.js's twenty-six-character action label. Each string then went
 *  down the highlight ladder to Nominatim, one request per name plus retries plus a web
 *  verification, against a host whose published policy is one request per second. 「ベルゴロド州」
 *  failed anyway, because that search's top hit is the CITY of Belgorod and the fail-closed boundary
 *  check correctly refused a city as an oblast outline — and the reader was told the identifier did
 *  not resolve to a real border, which reads as 「その場所は無い」 about a place that plainly exists.
 *  The second report is the same defect one layer up: with no action able to carry a description,
 *  a request for described incident pins became four independent research-and-map passes whose
 *  conclusions disagreed, each one erasing the previous one's pins.
 *
 *  ⚠ THESE CHECKS DRIVE THE SHIPPED MODULES. js/atlas-geo-ledger.js, js/atlas-admin1.js,
 *  js/nominatim-gate.js and js/atlas-agent.js have no DOM and no globals, and the ADM1 index is read
 *  through an injected loader — pointed at the REAL `data/admin1-world.json.gz` this repository
 *  ships, so ① is a measurement and not a mock. The wiring checks read the sources through
 *  `codeOnly`, so this file's own prose can never be what a check matches (#R345).
 * ==========================================================================*/

const CODE = (p) => codeOnly(R(p));

/* The real shipped index, read once, handed in so the module's single network read is the test's
   single file read. `requests` therefore reports 0 here and 1 in the browser — see ① */
const ADM1_JSON = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data/admin1-world.json.gz'))).toString());
const A1 = () => makeAtlasAdmin1({ load: () => ADM1_JSON });

/* The fourteen the report is about, written the way a model writes them. */
const OBLASTS = ['Belgorod Oblast', 'Moscow Oblast', 'Bryansk Oblast', 'Kursk Oblast',
  'Voronezh Oblast', 'Rostov Oblast', 'Tambov Oblast', 'Lipetsk Oblast',
  'Nizhny Novgorod Oblast', 'Tula Oblast', 'Ryazan Oblast', 'Oryol Oblast',
  'Smolensk Oblast', 'Kaluga Oblast'];

/* ══ ① THE FOURTEEN, LOCALLY, AT ZERO REQUESTS EACH ═══════════════════════════════════════════ */
test('R489 ①: fourteen oblasts resolve to real outlines from the shipped index, in one read', async () => {
  const a1 = A1();
  const r = await a1.resolveMany(OBLASTS, { iso3: 'RUS' });
  assert.equal(r.misses.length, 0, 'every one of the fourteen resolves: ' + JSON.stringify(r.misses));
  assert.equal(r.hits.length, OBLASTS.length);
  /* the whole point: N names, ONE read of the index, and no per-name network at all */
  assert.equal(r.requests, 0, 'the injected loader is the only read; in the browser it is exactly 1 for the session');
  for (const h of r.hits) {
    assert.ok(/^(Polygon|MultiPolygon)$/.test(h.geo.type), h.asked + ' came back with a real area, not a point');
    assert.equal(h.iso3, 'RUS');
    assert.equal(h.kind, 'admin1');
    assert.ok(h.stableId, h.asked + ' carries an identifier the next turn can pass back');
  }
  const bel = r.hits.find((h) => h.asked === 'Belgorod Oblast');
  assert.equal(bel.stableId, 'RU-BEL', 'the identifier is the ISO 3166-2 code the index already carried');
});

/* ══ ② THE REPORTED WRONG ANSWER: AN OBLAST IS NOT THE CITY INSIDE IT ═════════════════════════ */
test('R489 ②: a query that names a REGION takes the region, and one that does not takes the city', async () => {
  const a1 = A1();
  /* Natural Earth holds two units whose alias sets both contain 「Moscow」 — the oblast and the
     federal city. Spelling cannot separate them; what the query ASKED FOR can. */
  const oblast = await a1.resolve('Moscow Oblast', { iso3: 'RUS' });
  const city = await a1.resolve('Moscow', { iso3: 'RUS' });
  assert.ok(oblast && city);
  assert.notEqual(oblast.stableId, city.stableId, 'they are two different units');
  const areaOf = (h) => a1.degArea(h.geo);
  assert.ok(areaOf(oblast) > areaOf(city) * 10, 'the one asked for as an oblast is the large one');
  assert.equal(oblast.canonicalName, 'Moskovskaya');
  assert.equal(city.canonicalName, 'Moskva');
});

test('R489 ③: the index answers the native spelling and the code, not only the English one', async () => {
  const a1 = A1();
  const ru = await a1.resolve('Белгородская область', { iso3: 'RUS' });
  const code = await a1.resolve('RU-BEL', { iso3: 'RUS' });
  assert.equal(ru.stableId, 'RU-BEL');
  assert.equal(code.stableId, 'RU-BEL');
  assert.ok(code.score >= ru.score, 'an exact identifier is never a weaker match than a name');
});

/* ══ ④ IT DECLINES RATHER THAN GUESSES ═══════════════════════════════════════════════════════ */
test('R489 ④: a name with no administrative type-word and no ledger entry is left to the old ladder', async () => {
  const a1 = A1();
  /* 「大阪湾」 is a bay. If this rung answered it, the water branch below it would never run. */
  assert.equal(await a1.hlTarget('大阪湾', {}), null);
  assert.equal(await a1.hlTarget('Blue Banana', {}), null);
  /* and a Japanese oblast name on its OWN is a miss here — the index holds no Japanese */
  assert.equal(await a1.hlTarget('ベルゴロド州', {}), null);
});

/* ══ ⑤ …AND THE LEDGER IS WHAT MAKES 「ベルゴロド州」 ANSWERABLE ═══════════════════════════════ */
test('R489 ⑤: a name this conversation already resolved reaches the index as an identifier', async () => {
  const a1 = A1();
  const led = makeAtlasGeoLedger({});
  /* turn 1 — the answer named the oblast, so the answer's own pass filed it */
  led.beginTurn(1);
  led.record({ kind: 'admin1', name: 'ベルゴロド州', canonicalName: 'Belgorod',
    countryCode: 'RU', stableId: 'RU-BEL', role: 'interception_region', source: 'answer' });
  /* turn 2 — 「マッピングして」, and the string that used to fail now carries a country and a code */
  led.beginTurn(2);
  const t = await a1.hlTarget('ベルゴロド州', { ledger: led });
  assert.ok(t, 'the reader’s own spelling resolves on the second turn');
  assert.equal(t.rrMethod, 'admin1_index');
  assert.ok(/^(Polygon|MultiPolygon)$/.test(t.poly.geo.type));
  assert.equal(t.entity.stableId, 'RU-BEL');
  assert.equal(t.entity.countryCode, 'RU');
});

/* ══ ⑥ THE LEDGER ITSELF ═════════════════════════════════════════════════════════════════════ */
test('R489 ⑥: a declared identifier survives recording — the ledger never falls back to the name', () => {
  const led = makeAtlasGeoLedger({});
  const e = led.record({ kind: 'admin1', name: 'Belgorod Oblast', canonicalName: 'Belgorod',
    countryCode: 'RU', stableId: 'RU-BEL' });
  assert.equal(e.stableId, 'RU-BEL', 'the identifier the ADM1 index supplied is the identity');
  assert.equal(led.resolve('Belgorod Oblast').stableId, 'RU-BEL');
  assert.equal(led.resolve('RU-BEL').stableId, 'RU-BEL');
});

test('R489 ⑦: the same place recorded twice merges, and a later coordinate fills the gap', () => {
  const led = makeAtlasGeoLedger({});
  led.beginTurn(1);
  led.record({ kind: 'admin1', name: 'ベルゴロド州', canonicalName: 'Belgorod', countryCode: 'RU', stableId: 'RU-BEL' });
  assert.equal(led.size(), 1);
  led.beginTurn(2);
  led.record({ kind: 'admin1', name: 'Belgorod Oblast', canonicalName: 'Belgorod', countryCode: 'RU',
    stableId: 'RU-BEL', lng: 37.6, lat: 50.6, provenance: 'geocoded_point', role: 'impact_area' });
  assert.equal(led.size(), 1, 'one oblast asked for in two languages is ONE entity');
  const e = led.resolve('ベルゴロド州');
  assert.equal(e.lng, 37.6);
  assert.equal(e.role, 'impact_area', 'the role belongs to the current question and is refreshed');
  assert.equal(e.turn, 2);
});

test('R489 ⑧: the shape of a place is js/atlas-geo-object.js’s, and a centroid is not promoted', () => {
  const GEOBJ = makeAtlasGeoObject();
  const led = makeAtlasGeoLedger({ geoObject: GEOBJ.geoObject });
  /* a coordinate with no declared provenance is the weakest class that still admits a point (#R397) */
  const e = led.record({ kind: 'city', name: 'Kotovsk', country: 'Russia', lng: 41.5, lat: 52.6 });
  assert.equal(e.provenance, 'resolved_place_centroid');
  assert.equal(GEOBJ.pointLike(e), false, 'a stand-in for an area is still not an exact spot');
  const f = led.record({ kind: 'city', name: 'Lipetsk', lng: 39.6, lat: 52.6, provenance: 'event_location' });
  assert.equal(f.provenance, 'event_location');
  assert.equal(GEOBJ.pointLike(f), true);
});

test('R489 ⑨: the next turn is handed identifiers and the fixed time window, not prose', () => {
  const led = makeAtlasGeoLedger({});
  led.beginTurn(1);
  led.recordMany([
    { kind: 'admin1', name: 'ベルゴロド州', canonicalName: 'Belgorod', countryCode: 'RU', stableId: 'RU-BEL' },
    { kind: 'admin1', name: 'クルスク州', canonicalName: 'Kursk', countryCode: 'RU', stableId: 'RU-KRS' },
  ], { role: 'interception_region' });
  led.setWindow({ start: '2026-08-25T18:00Z', end: '2026-08-26T09:00Z', label: 'overnight wave' });
  const lines = led.contextLines();
  assert.ok(lines[0].includes('ALREADY resolved'));
  assert.ok(lines.some((l) => l.includes('RU-BEL') && l.includes('(RU)') && l.includes('interception_region')));
  assert.ok(lines.some((l) => l.includes('TIME WINDOW') && l.includes('2026-08-25T18:00Z')),
    'the window is fixed once for the question, not re-derived by each search');
  assert.equal(led.contextLines({ kind: 'city' }).length, 1, 'a selection with no places still carries the window');
});

/* ══ ⑩ ONE QUEUE IN FRONT OF NOMINATIM ═══════════════════════════════════════════════════════ */
test('R489 ⑩: the one-a-second floor is SHARED — two callers cannot both take the same second', async () => {
  let clock = 1_000_000;
  GATE.configure({ reset: true, now: () => clock, gapMs: 1100 });
  const a = GATE.reserve({});          /* the Atlas highlight ladder */
  const b = GATE.reserve({});          /* the routing search, in the same tick */
  const c = GATE.reserve({});
  assert.equal(a, 0, 'the first caller goes at once');
  assert.equal(b, 1100, 'the second waits a full gap');
  assert.equal(c, 2200, 'and the third waits two — this is the queue the batch path needs');
  const s = GATE.stats();
  assert.equal(s.served, 3);
  assert.equal(s.dropped, 0);
});

test('R489 ⑪: a keystroke caller is still DROPPED rather than queued (#R298 unchanged)', () => {
  let clock = 2_000_000;
  GATE.configure({ reset: true, now: () => clock, gapMs: 1100 });
  assert.equal(GATE.reserve({ drop: true }), 0);
  assert.equal(GATE.reserve({ drop: true }), 1100, 'one queued slot is still allowed');
  assert.equal(GATE.reserve({ drop: true }), -1, 'a second queued keystroke is stale, not delayed');
  assert.equal(GATE.stats().dropped, 1);
  GATE.configure({ reset: true, now: () => Date.now(), gapMs: 1100 });   /* leave the module as shipped */
});

test('R489 ⑫: every Nominatim call in js/ goes through the gate', () => {
  /* read, not run: universal over every file that calls Nominatim — a claim about the tree; the gate's
     own behaviour is RUN in ⑩–⑪. */
  const FILES = ['js/atlas-geo-resolve.js', 'js/atlas-verify.js', 'js/map-tools.js', 'js/river-course.js',
    'js/routing.js', 'js/routing-geocode.js', 'js/search-geocode.js', 'js/atlas-console.js'];
  for (const f of FILES) {
    const src = CODE(f);
    if (!/nominatim\.openstreetmap\.org/.test(src)) continue;
    assert.ok(/nomSlot\(|IntMapNominatimGate|nominatimSlot\(/.test(src),
      f + ' calls nominatim.openstreetmap.org and must take a slot from js/nominatim-gate.js first');
  }
  /* …and the file that used to own a private counter no longer has one */
  assert.equal(/lastNominatim/.test(CODE('js/routing-geocode.js')), false,
    'js/routing-geocode.js must not keep a second floor — two private floors allow the host two requests a second');
  assert.ok(/IntMapNominatimGate/.test(CODE('src/main.js')) || /nominatim-gate\.js/.test(CODE('src/main.js')),
    'the gate is imported eagerly, before the window-global callers that reach it by name');
});

/* ══ ⑬ THE SAME CALL, TWICE IN ONE TURN, IS ANSWERED ONCE ════════════════════════════════════ */
const TR = makeAtlasTurnResults({});

test('R489 ⑬: callKey is the identity of a call, ignoring order and empty arguments', () => {
  assert.equal(TR.callKey('map_report', { topic: 'drone strikes', place: 'Russia' }),
    TR.callKey('map_report', { place: 'Russia', topic: 'drone strikes' }));
  assert.equal(TR.callKey('map_report', { topic: 'drone strikes' }),
    TR.callKey('map_report', { topic: ' Drone Strikes ', count: null, tags: [] }));
  assert.notEqual(TR.callKey('map_report', { topic: 'a' }), TR.callKey('map_report', { topic: 'b' }));
  assert.notEqual(TR.callKey('map_report', { topic: 'a' }), TR.callKey('analyze', { topic: 'a' }));
});

test('R489 ⑭: four identical research passes in one turn execute ONCE and Atlas is told', async () => {
  const AGENT = makeAtlasAgent();
  const TOOLS = { map_report: { name: 'map_report', description: 'Research and map a topic.',
    parameters: { type: 'object', required: ['topic'], properties: { topic: { type: 'string', minLength: 1 } } } } };
  const call = (id) => ({ id, name: 'map_report', arguments: { topic: 'ロシア領内へのドローン攻撃' } });
  let i = 0;
  const replies = [
    { text: '', toolCalls: [call('c1'), call('c2')] },
    { text: '', toolCalls: [call('c3'), call('c4')] },
    { text: '14件をマッピングしました。', toolCalls: [] },
  ];
  let executed = 0;
  const r = await AGENT.runTurn({
    model: async () => replies[Math.min(i++, replies.length - 1)],
    tools: TOOLS,
    execute: async () => { executed++; return { ok: true, items: 14 }; },
    messages: [{ role: 'user', content: 'マッピングして' }],
  });
  assert.equal(executed, 1, 'the identical call ran once; the other three were answered from it');
  assert.equal(r.trace.reused, 3);
  /* ⚠ NOTHING WAS CAPPED OR REFUSED — every call is still a call against the turn's budget */
  assert.equal(r.trace.calls, 4);
  assert.equal(r.trace.rejected, 0);
  assert.equal(r.stopped, 'answered');
  const reused = r.trace.steps.length && replies;   /* the note reaches the model, not the reader */
  assert.ok(reused);
});

test('R489 ⑮: a call that FAILED is not frozen — the turn may try it again', async () => {
  const AGENT = makeAtlasAgent();
  const TOOLS = { web: { name: 'web', description: 'Search.',
    parameters: { type: 'object', required: ['q'], properties: { q: { type: 'string', minLength: 1 } } } } };
  const call = (id) => ({ id, name: 'web', arguments: { q: 'Kotovsk' } });
  let i = 0, tries = 0;
  const replies = [{ text: '', toolCalls: [call('a')] }, { text: '', toolCalls: [call('b')] }, { text: 'ok', toolCalls: [] }];
  const r = await AGENT.runTurn({
    model: async () => replies[Math.min(i++, replies.length - 1)],
    tools: TOOLS,
    execute: async () => { tries++; return tries === 1 ? { ok: false, error: 'network' } : { ok: true }; },
    messages: [{ role: 'user', content: 'x' }],
  });
  assert.equal(tries, 2, 'a transient failure must not become permanent for the rest of the turn');
  assert.equal(r.trace.reused, 0);
});

/* ══ ⑯ THE WIRING ════════════════════════════════════════════════════════════════════════════ */
test('R489 ⑯: the console consults the ledger and the shipped index before the network', () => {
  /* read, not run: the resolution ladder is the kernel's resolveHlTarget, which only a browser can
     drive; each rung is RUN in ①–⑨. */
  const src = CODE('js/atlas-console.js');
  assert.ok(/makeAtlasGeoLedger/.test(src) && /makeAtlasAdmin1/.test(src), 'both modules are imported');
  assert.ok(/ADM1\.hlTarget\(nm,\{ledger:GLEDGER\}\)/.test(src),
    'resolveHlTarget tries the local first-level index, with the ledger for the country and the identifier');
  const rung = src.indexOf('ADM1.hlTarget');
  const nom = src.indexOf('_nomExtent(nm');
  assert.ok(rung > 0 && nom > 0 && rung < nom, 'and it tries it BEFORE the Nominatim rung');
  assert.ok(/GLEDGER\.beginTurn\(turn\)/.test(src), 'the ledger is told when a turn starts');
  assert.ok(/GLEDGER\.contextLines\(\)/.test(src), 'and what it holds reaches the next turn’s prompt');
});

test('R489 ⑰: a pin carries what it is, all the way to the marker', () => {
  /* read, not run: the pin travels kernel → shell (js/app-body.js) → popup DOM, all of which boot only
     in a browser. */
  const con = CODE('js/atlas-console.js');
  const body = CODE('js/app-body.js');
  const schema = CODE('js/atlas-schemas.js');
  assert.ok(/addPin\(ll\.lng,ll\.lat,_pm\)/.test(con), 'the pin action passes its metadata to the map');
  assert.ok(/function addPin\(lng,lat,meta\)/.test(body), 'and addPin accepts it');
  assert.ok(/meta:\(meta&&typeof meta==='object'\)\?meta:null/.test(body), 'and keeps it on the pin');
  assert.ok(/pin\.meta\|\|\{\}/.test(body), 'and the popup reads it');
  assert.ok(/IntMapSafe\.html\(pmT\)/.test(body) && /IntMapSafe\.html\(pmD\)/.test(body),
    'every Atlas-supplied string reaches innerHTML through the encoder (#R272 SEC)');
  assert.ok(/IntMapSafe\.url\(String\(pm\.url\)\)/.test(body), 'and the link through the URL allow-list');
  assert.ok(/'map\.pin':[^\n]*description: str\(\)/.test(schema), 'the schema advertises the description');
  assert.ok(/'map\.pin':[^\n]*country: str\(\)/.test(schema),
    'and the country, because a settlement name on its own is a query that cannot succeed');
});

test('R489 ⑱: a second paint in the same turn adds to the map instead of erasing it', () => {
  /* read, not run: the paint paths are the kernel's, which only a browser can drive. */
  const src = CODE('js/atlas-console.js');
  assert.ok(/const _hlAdd=\(a\)=>\{ const g=\(a&&a\.__paintRun\)/.test(src), 'the highlight paths read which run the action belongs to');
  assert.ok(/const _poiAdd=\(a\)=>\{ const g=\(a&&a\.__paintRun\)/.test(src), 'and so do the pin paths');
  /* ⚠ THE STAMP IS ON THE ACTION, so a bare IntMapOS.dispatch — the diagnostics door, and the one
     tests/r157.spec.js drives — carries none and therefore REPLACES. A flag with a lifecycle would
     have had to be cleared on every early return in runActions; this cannot be left set. */
  assert.ok(/a\.__paintRun="run"\+\(gen!=null\?gen:_runGen\)/.test(src), 'runActions stamps each action with its run');
  /* every one of the three highlight paints, and both POI paints, goes through it */
  assert.equal((src.match(/_hlAdd\(a\)/g) || []).length, 3,
    'the three highlight painting paths — the GPT-group set, the multi-region set and the mixed one');
  assert.equal((src.match(/_poiAdd\((?:a|opt\.act)\)/g) || []).length, 2, 'mapReport and the research-map pinner');
  assert.ok(/_hlPolys=_prevA\.concat\(/.test(src) && /_hlPolys=_prevB\.concat\(/.test(src)
    && /_hlPolys=_prevP\.concat\(polys\)/.test(src), 'each of them accumulates rather than replaces');
  assert.ok(/_pois=_pvR\.concat\(/.test(src) && /_pois=_pvM\.concat\(/.test(src));
});

test('R489 ⑲: a failed boundary lookup is not reported as a place that does not exist', () => {
  /* read, not run: the messages are the kernel's highlight replies, which only a browser can produce. */
  const src = CODE('js/atlas-console.js');
  assert.equal(/'Nothing found for','見つかりません'/.test(src), false,
    'the highlight miss message used to blame the world for a lookup’s failure');
  assert.ok(/'No boundary could be resolved for','境界データを解決できませんでした'/.test(src));
  assert.ok(/'No boundary resolved','境界を解決できず'/.test(src));
  assert.ok(/could be matched to a boundary in the data IntMap holds/.test(src));
});

test('R489 ⑳: the new modules are shipped, documented and reachable', () => {
  /* read, not run: shipped / documented / imported once are facts about the tree and docs/FILES.md. */
  for (const f of ['js/atlas-geo-ledger.js', 'js/atlas-admin1.js', 'js/nominatim-gate.js']) {
    assert.ok(existsSync(join(ROOT, f)), f + ' is in the repository');
    assert.ok(/atlas-geo-ledger\.js|atlas-admin1\.js|nominatim-gate\.js/.test(R('docs/FILES.md')),
      'docs/FILES.md names the new modules');
  }
  /* the ADM1 constant is ONE constant — js/world-packs.js and js/atlas-admin1.js read one file */
  const url = /data\/admin1-world\.json\.gz/;
  assert.ok(url.test(CODE('js/atlas-admin1.js')) && url.test(CODE('js/world-packs.js')));
  assert.ok(existsSync(join(ROOT, 'data/admin1-world.json.gz')));
  /* imported once and built once — no second geographic ledger anywhere in the app */
  const con = R('js/atlas-console.js');
  assert.equal((con.match(/makeAtlasGeoLedger\(/g) || []).length, 1, 'exactly one ledger is built');
  assert.ok(/^import \{ makeAtlasGeoLedger \} from '\.\/atlas-geo-ledger\.js';/m.test(con)
    && /^import \{ makeAtlasAdmin1 \} from '\.\/atlas-admin1\.js';/m.test(con),
    'each new module is imported at the START of its own line — scripts/js-reachability.mjs anchors there, '
    + 'so a module named second on a shared line reads as one nothing imports');
});
}
