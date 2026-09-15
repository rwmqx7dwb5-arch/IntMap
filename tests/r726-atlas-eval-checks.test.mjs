/* ============================================================================
 *  #R726 — Atlas evaluated on production, and what the evaluation found
 * ----------------------------------------------------------------------------
 *  Fourteen questions were put to the production Atlas on 2026-09-15 and the answers, the map and
 *  the reply were read as a reader would. Every defect below was measured there, not supposed.
 *  The repairs share one direction (the user's instruction that day): Atlas is an AI agent, so
 *  what is fixed is what it is TOLD — the observation it is handed, the facts a tool returns, the
 *  capability it can reach — never a code-side judgement made in its place.
 *
 *  ① A heading is text, not markup — «## Nominal GDP» was rendered literally (contract.js).
 *  ② A place phrase does not bridge a line — «Nominal GDP The» was geocoded (verify.js).
 *  ③ A lone capitalised token from prose is weak evidence for ambiguous as for unplaced —
 *     «Ambiguous: JST, Available, Providing» (verify.js).
 *  ④ The strict geocoder matches every NAME a feature carries, in one rule shared with
 *     js/atlas-geo-resolve.js — «Tokyo» came back as 東京都 and was «not placed» (verify.js).
 *  ⑤ The historical power map is verified by what is on the map, not by a count diff — six
 *     identical maps in one turn, four of them called not_rendered (capabilities.js).
 *  ⑥ The camera is sampled when it has arrived — a flyTo under way was called no_change.
 *  ⑦ The base-display preset is a capability — nine searches and nothing done (registry/schema/
 *     catalogue/dispatch).
 *  ⑧ A successful tool result carries the text the reader sees — data.rank ×8, routing.route ×7,
 *     with the answer on screen from the first call (toolsurface.js).
 *  ⑨ The satellite, weather and route results carry the facts their panels show.
 *  ⑩ A country highlight at a past year is that year's polity (console.js).
 *  ⑪ Atlas is told what of its own is still on the map (state.js) and that the map is its
 *     workspace (persona.js).
 *  ⑫ find_capability says «nothing matched» in a way that ends the search.
 *
 *  ⚠ Sources are read through codeOnly, so no comment — including the ones that record these
 *  measurements — can be what a check matches (#R345).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => codeOnly(readLF(join(ROOT, p)));
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const { makeAtlasAnswerContract } = await import('../js/atlas-answer-contract.js');
const { makeAtlasVerify } = await import('../js/atlas-verify.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const { makeAtlasState } = await import('../js/atlas-state.js');
const { personaPrompt } = await import('../js/atlas-persona.js');

const CONSOLE = src('js/atlas-console.js');
const CAPS_SRC = src('js/atlas-capabilities.js');
const SURF = src('js/atlas-toolsurface.js');

/* ── ① the heading field holds the heading's text ─────────────────────────────────────────── */
test('R726 ① normalizeAnswer strips ATX marks from a section heading, however many the model wrote', () => {
  const C = makeAtlasAnswerContract();
  const env = C.normalizeAnswer({ directAnswer: { text: 'x' }, sections: [
    { heading: '## Nominal GDP', blocks: [] }, { heading: '## ## Military Spending', blocks: [] },
    { heading: '### Population ##', blocks: [] }, { heading: 'Comparability Notes', blocks: [] }] }, {});
  assert.deepEqual(env.answer.sections.map((s) => s.heading),
    ['Nominal GDP', 'Military Spending', 'Population', 'Comparability Notes']);
  /* the same text feeds place extraction, so the strip lives in the contract, not in a renderer */
  assert.deepEqual(C.renderedTexts(env).filter((t) => t.where.startsWith('heading')).map((t) => t.text),
    ['Nominal GDP', 'Military Spending', 'Population', 'Comparability Notes']);
});

/* ── ② ③ ④ the mapping self-check ─────────────────────────────────────────────────────────── */
const V = makeAtlasVerify({}, { L: (en) => en, esc: (s) => String(s) });
const { featureNames } = (await import('../js/atlas-geo-resolve.js')).makeAtlasGeoResolve;

test('R726 ② a candidate place never bridges a line break (heading + first paragraph)', () => {
  const names = V._atlExtractPlaces('## Nominal GDP\n\nThe latest full comparable database is the April 2026 edition.\n\nUnited States: $32 trillion. China: $20 trillion.');
  assert.ok(!names.some((n) => /GDP The/i.test(n)), 'no phrase crosses the newline: ' + JSON.stringify(names));
  assert.ok(names.includes('China'), 'real names on their own line still extract: ' + JSON.stringify(names));
  /* the sentence-boundary rule this joins is unchanged */
  const s = V._atlExtractPlaces('We flew to Italy. The Colosseum was open.');
  assert.ok(!s.some((n) => /Italy The/i.test(n)), JSON.stringify(s));
});

test('R726 ③ a lone capitalised token from prose is surfaced as ambiguous no more than as unplaced', () => {
  const v = V._atlMappingVerdict([
    { name: 'JST', verdict: 'ambiguous', src: 'text' }, { name: 'Providing', verdict: 'ambiguous', src: 'text' },
    { name: 'Springfield Illinois', verdict: 'ambiguous', src: 'text' }, { name: 'GDP', verdict: 'ambiguous', src: 'structured' },
    { name: 'Available', verdict: 'unplaced', src: 'text' }, { name: 'Tokyo', verdict: 'mapped', src: 'structured' }]);
  assert.deepEqual(v.ambiguous, ['Springfield Illinois', 'GDP'], 'multi-word prose and every structured place stay');
  assert.deepEqual(v.unplaced, [], 'the unplaced rule is the same rule');
  assert.deepEqual(v.mapped, ['Tokyo']);
});

test('R726 ④ the strict geocoder asks for namedetails and matches every name the feature carries, through the one shared rule', () => {
  const fn = liftFunction(src('js/atlas-verify.js'), '_atlGeocodeStrict');
  assert.match(fn, /namedetails=1/, 'the request carries the names');
  assert.match(fn, /featureNames\(j\)\.some\(/, 'every name is tried');
  assert.doesNotMatch(fn, /display_name\|\|''\)\.split\(','\)\[0\]\)\s*;\s*\}\)/, 'the first display_name segment is no longer the only name compared');
  /* the rule is js/atlas-geo-resolve.js's, handed in — not a second copy in atlas-verify.js */
  assert.equal(typeof featureNames, 'function');
  assert.deepEqual([...new Set(featureNames({ display_name: '東京都, 日本', name: '東京都', namedetails: { 'name:en': 'Tokyo', 'name:ja': '東京都', ref: 'TYO' } }))].sort(), ['Tokyo', '東京都'], 'name, label and every name:* — never ref');
  assert.doesNotMatch(src('js/atlas-verify.js'), /_ATL_NAME_KEY_RE|function _atlFeatureNames/, 'no copy of the key rule in atlas-verify.js');
  assert.match(src('js/atlas-verify.js'), /const featureNames=makeAtlasGeoResolve\.featureNames;/, 'the verifier reads the resolver\'s rule');
  /* an English query agrees with a Japanese localised label through the English name */
  assert.ok(featureNames({ display_name: 'アメリカ合衆国', namedetails: { 'name:en': 'United States' } }).some((n) => V._atlNameOk('United States', n)));
});

/* ── ⑤ ⑥ ⑦ the capability registry ────────────────────────────────────────────────────────── */
const CAPS = makeAtlasCapabilities({});

test('R726 ⑤ the historical power map is verified by the faction fills on the map, so a redrawn map is rendered', () => {
  const cap = CAPS.resolve('research.historicalMap');
  assert.equal(cap.observerKind, 'factions');
  const drawn = cap.verify({}, {}, { factions: 5 }, { factions: 5 }, { ok: true, html: '<b>map</b>' });
  assert.equal(drawn.status, 'completed', 'same count before and after is still a map on the globe');
  const none = cap.verify({}, {}, { factions: 0 }, { factions: 0 }, { ok: true, html: '' });
  assert.equal(none.code, 'not_rendered');
  const failed = cap.verify({}, {}, null, null, { ok: false, html: '' });
  assert.equal(failed.status, 'failed');
  assert.match(liftFunction(CAPS_SRC, 'paintNow'), /nlq-fac-src/, 'and every paint observer now sees the faction source too');
});

test('R726 ⑥ the camera observer waits for the camera to arrive before it reports', () => {
  const block = CAPS_SRC.slice(CAPS_SRC.indexOf('camera: {'), CAPS_SRC.indexOf('layer: {'));
  assert.match(block, /observe:\s*async function/, 'the AFTER sample is awaited');
  assert.match(block, /isAnimating/, 'the renderer is asked whether it is still easing');
  assert.match(block, /CAMERA_SETTLE_MS/, 'and the wait is bounded');
  assert.match(CAPS_SRC, /var CAMERA_SETTLE_MS = 2500;/);
});

test('R726 ⑦ the base-display preset is a capability Atlas can reach, with a schema, a catalogue block and a dispatch case', async () => {
  const cap = CAPS.resolve('layers.baseDisplay');
  assert.ok(cap && !cap.withdrawn, 'registered');
  assert.equal(cap.observerKind, 'layer');
  const found = CAPS.search('基本表示をデフォルトに戻して', { want: 1, min: 1 }).ranked.map((r) => r.id);
  assert.ok(found.includes('layers.baseDisplay'), 'reachable by find_capability: ' + JSON.stringify(found.slice(0, 5)));
  const S = makeAtlasSchemas();
  assert.deepEqual(S.schemaFor('layers.baseDisplay').properties.mode.enum, ['default', 'clean', 'custom']);
  const docs = (await import('../js/atlas-catalog-text.js')).makeAtlasCatalogText({}, {});
  assert.match(docs.text(['layers.baseDisplay']), /"type":"baseDisplay"/, 'documented to the planner');
  assert.match(CONSOLE, /case 'baseDisplay': return doBaseDisplay\(a\);/, 'and the dispatch answers it');
  assert.match(liftFunction(src('js/atlas-controls.js'), 'doBaseDisplay'), /IntMapBaseDisplay/, 'through the panel\'s own owner, not a second copy of the rows');
});

/* ── ⑧ ⑫ the tool surface ─────────────────────────────────────────────────────────────────── */
test('R726 ⑧ a successful result carries the text of what the reader was shown', () => {
  const fn = liftFunction(SURF, 'mechanical');
  assert.match(fn, /if \(ok && res && res\.html\)/, 'on success');
  assert.match(fn, /out\.text = /, 'the shown text is on the result');
  assert.match(fn, /RESULT_TEXT_MAX/, 'bounded');
  assert.match(SURF, /var RESULT_TEXT_MAX = 2000;/);
});

test('R726 ⑫ an empty find_capability result ends the search instead of inviting a rephrase', () => {
  const fn = liftFunction(SURF, 'find');
  assert.match(fn, /registry is complete/i);
  assert.match(fn, /IntMap has no such control/);
});

/* ── ⑨ the facts a tool's panel shows are in its result ────────────────────────────────────── */
test('R726 ⑨ satellites: sub-satellite point, the observer the reader named, and the next pass', () => {
  const block = CONSOLE.slice(CONSOLE.indexOf("case 'satellites':")).slice(0, 9000);
  assert.match(block, /resolveObserver\(a,\{geocode,herePoint/, 'the observer is resolved from the arguments, the pin, the centre');
  const facts = src('js/atlas-result-facts.js');
  assert.match(liftFunction(facts, 'resolveObserver'), /a\.place \|\| a\.observer/, 'the place is read from the arguments');
  assert.match(liftFunction(facts, 'satelliteFacts'), /A\.nextPass\(found\.id/, 'the pass is computed by js/satellites-live.js, not narrated');
  assert.match(liftFunction(facts, 'satelliteFacts'), /found\.lat\.toFixed\(2\)/, 'the sub-satellite point is stated');
  const S = makeAtlasSchemas();
  assert.ok(S.schemaFor('layers.satellites').properties.place, 'the schema admits the observer place');
});

test('R726 ⑨ weather: the current conditions and the daily forecast, from the panel\'s own source', () => {
  const block = CONSOLE.slice(CONSOLE.indexOf("case 'weather':")).slice(0, 4000);
  assert.match(block, /WX\.point\(ll\.lat,\s*ll\.lng/, 'js/weather.js IntMapWx.point — the same request the panel makes');
  assert.match(block, /weatherFacts\(j, WP&&WP\.describe, L\)/, 'the sky is named in the panel\'s own words');
  assert.match(src('js/weather.js'), /return \{ open, close, describe:/, 'js/weather.js exposes describe()');
});

test('R726 ⑨ routing: the journey is on the result, for the transit and the road branch alike', () => {
  const block = CONSOLE.slice(CONSOLE.indexOf("case 'directions':"), CONSOLE.indexOf("case 'streetview':"));
  assert.match(src('js/atlas-result-facts.js'), /export function routeFacts\(r\)/);
  const n = (block.match(/exec:\{route:routeFacts\(r\)\}/g) || []).length;
  assert.equal(n, 2, 'both success returns carry it');
});

/* ── ⑩ the map's year applies to areas ─────────────────────────────────────────────────────── */
test('R726 ⑩ a country highlight while a past year is shown is drawn from that year\'s polities', () => {
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

/* ── ⑪ what Atlas is told about its own workspace ──────────────────────────────────────────── */
test('R726 ⑪ the state names the power map, the era polities, the weather and satellite cards', () => {
  const ST = makeAtlasState({});
  const text = ST.renderPrompt({ atlas: { factions: { n: 12 }, eraPolities: { n: 2, names: ['Japan', 'Taiwan (Japan)'] } }, panels: { open: ['Weather card'] } });
  assert.match(text, /power\/alliance map you drew earlier is still on the globe \(12/);
  assert.match(text, /clear what:"historical"/);
  assert.match(text, /displayed year's polities \(Japan, Taiwan \(Japan\)\)/);
  assert.match(text, /Open panels: Weather card/);
  const st = src('js/atlas-state.js');
  assert.match(st, /\['#weather-panel', 'Weather card'\]/);
  assert.match(st, /\['#sat-popup', 'Satellite detail card'\]/);
  assert.match(src('js/weather.js'), /panel\.id='weather-panel'/, 'the id the state watches is the id the panel has');
  assert.match(src('js/satellite-detail.js'), /el\.id='sat-popup'/);
  assert.match(liftFunction(CONSOLE, '_atlasOverlayState'), /nlq-fac-src/, 'the console publishes the faction fills');
});

test('R726 ⑪ the persona holds the workspace clause, and the machine-read calls do not pay for it', () => {
  assert.ok(personaPrompt.spec.order.includes('workspace'));
  assert.ok(!personaPrompt.spec.internal.includes('workspace'));
  assert.match(personaPrompt('answering here'), /THE MAP IS YOUR WORKSPACE/);
  assert.doesNotMatch(personaPrompt('tracing outlines', { mode: 'internal' }), /WORKSPACE/);
  /* the Edge Function's copy is the same file (check:static persona-mirror) — asserted here too so
     the two cannot drift between that gate and this one */
  assert.match(readLF(join(ROOT, 'supabase/functions/_shared/atlas-persona.js')), /THE MAP IS YOUR WORKSPACE/);
});

/* ── ⑬ a clear that found nothing to remove is complete, and the cards close through it ────── */
test('R726 ⑬ map.clear is verified against the map AND the panels, and an already-clean map is already_clear', () => {
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
  const block = CONSOLE.slice(CONSOLE.indexOf("case 'clear': {"), CONSOLE.indexOf("case 'fullscreen':"));
  assert.match(block, /WP\.close\(\)/, 'the weather card closes through its owner');
  assert.match(block, /SP\.close\(\)/, 'so does the satellite card');
  assert.match(block, /exec:\{cleared:did\.slice\(\)\}/, 'and what was cleared is on the result');
  assert.match(src('js/atlas-results.js'), /'atlas\.code\.already_clear'/, 'the code has its sentence');
});
