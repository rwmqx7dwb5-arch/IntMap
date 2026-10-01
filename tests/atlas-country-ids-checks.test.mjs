/* ============================================================================
 *  js/atlas-country-ids.js — reading a highlight's identifiers and names
 * ----------------------------------------------------------------------------
 *  The model interprets meaning and the code validates (#R157), and an identifier is read in every ISO
 *  notation the border store declares (#R742).
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
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';
import { makeHighlightTargets } from '../js/atlas-country-ids.js';
import { fileURLToPath } from 'node:url';

/* the repository root, shared by every section below (each used to derive its own) */
const root = new URL('../', import.meta.url);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r157-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
// R157 source-level regression checks (deterministic, no browser).
// Guards the "Atlas NL redesign — the model interprets MEANING, the code validates & executes":
//   #1 REMOVED in #R406 — its subject (localPlan) is deleted; see the note where the test stood
//   #2 dispatch highlight: a GPT-decided-targets path validates ISO3 → real borders (no regionGroup on this path)
//   #3 SYS: highlight schema is targets:[{name,iso3}] / groups / query, and the model must expand concepts itself
//   #4 image-only: run() fabricates NO user text; the default instruction moves to the API boundary (_visionPrompt)
//   #5 IntMapAtlasDebug exposes the new pure spine (hlReadGroups / validCodeSet / hlState)

const html = appSource(root);
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;   /* (#R747) the reader below is a shipped module, and it is EVALUATED rather than read (#R505) */   /* (#R162) index.html + css/intmap.css + js/*.js */

/* R157 #1 (localPlan's highlight shortcuts, kept and removed) deleted in #R406: localPlan is gone, so no regular expression decides a highlight target — or anything else — before the model; the turn loop that decides instead is covered by tests/r406-agent.test.mjs and tests/r406-turn.test.mjs. */

test('R157 #2 dispatch: GPT-decided-targets path validates ISO3 → real borders (no regionGroup)', async () => {
  /* read, not run: the dispatch path is the Atlas kernel's highlight case (a closure over the whole HOST
     that only a browser can build); the field reader it depends on is RUN at the end. */
  assert.match(html, /function _hlValidCodeSet\(\)\{/, 'ISO3 validity set built from window.countryGeo');
  assert.match(html, /function _hlReadGptGroups\(a\)\{/, 'reads the model\'s structured targets into validated code groups');
  // accepts targets / groups / iso3 / codes, and a bare-ISO3 "countries" array (never a name array or concept string)
  assert.match(html, /if\(!src&&Array\.isArray\(a\.countries\)&&a\.countries\.length&&a\.countries\.every\(x=>norm3\(x\)\)\) src=a\.countries;/,
    'a name array / concept string does NOT count as targets (only an all-ISO3 array)');
  // (#R158) NO auto-correction: the old resolveCountrySync auto-rescue is REMOVED — a wrong/blank ISO3 is returned as
  // UNRESOLVED with a deterministic candidate identifier merely REPORTED (Terra decides, code never corrects).
  assert.doesNotMatch(html, /if\(!code&&t\.name\)\{ try\{ const c=resolveCountrySync\(t\.name\); if\(c&&c\.code&&valid\.has/,
    'the resolveCountrySync auto-rescue is removed');
  assert.match(html, /unresolved\.push\(\{name:t\.name\|\|'', iso3:gi, reason:/, 'a wrong/blank ISO3 is reported as unresolved, not rescued');
  assert.match(html, /availableIdentifiers:available\}\)/, 'a candidate identifier is REPORTED, never applied');
  // the dispatch path runs BEFORE the legacy resolver and draws real borders via _codesGeo
  assert.match(html, /\(#R157\) GPT-DECIDED TARGETS — the model already interpreted the concept/, 'dispatch targets path documented');
  assert.match(html, /const _gGroups=_hlReadGptGroups\(a\);/, 'dispatch reads the model groups');
  assert.match(html, /const cg=_codesGeo\(grp\.codes\);/, 'real borders built from validated codes');
  assert.match(html, /if\(!cg\.geo\|\|!cg\.hit\.length\) return;/, 'no geometry for a group → skip it');
  assert.match(html, /const vg=_validGeo\(cg\.geo,\{trusted:true,autoclose:true\}\);/, 'geometry validated before drawing');
  // (#R158) all-unresolved → honest ok:false with the STRUCTURED execution result fed back to Terra (not a silent skip)
  /* ⚠ (#R489) THE SENTENCE CHANGED AND THE PROPERTY DID NOT. This check is about the BRANCH — an
     all-unresolved highlight must return ok:false with a structured exec, never a silent skip — and
     that is unchanged. What the old wording claimed was that the identifiers did not resolve to a
     REAL BORDER, which reads as 「その場所は無い」; the reported case was Belgorod Oblast, which has a
     real administrative outline that Nominatim simply did not rank first. A message that blames the
     world for a lookup's failure sent the next turn off to re-verify a place never in doubt. */
  assert.match(html, /return R\(false, warn\('⚠ '\+L\('None of those identifiers could be matched to a boundary in the data IntMap holds/,
    'all-unresolved → honest ok:false + structured exec back to Terra');
  assert.match(html, /status:\(gUnresolved\.length\?'partial_or_failed':'ok'\)/, 'the mechanical execution-result status');
  // it STATES the interpretation used
  assert.match(html, /Interpreted from your request and drawn from real national borders/, 'the definition used is stated in the reply');
  /* a.query (a concrete single feature the model chose NOT to expand) flows into the legacy resolver.
     ⚠ (#R747) THIS USED TO FIX THE SPELLING of the field list — /a\.region\|\|a\.query\|\|''\)\.split/ —
     and the field list is exactly what went wrong: there were TWO of them, js/atlas-console.js's own
     and js/atlas-country-ids.js's, and `targets` was in only one. A highlight whose members are plain
     NAMES under `targets` (the shape js/atlas-catalog-text.js documents FIRST) was therefore read by
     neither: measured on production, the same sixteen country names gave failed/failed under
     `targets` and completed/ok under `countries`. Fixing the spelling here would have kept passing
     through all of it, and would fail now that the list lives in ONE place — #R488's shape exactly.
     So the FACT is asked of the shipped reader instead: every field that carries the request is read,
     `query` among them, and the reader is the same one the identifier path uses. */
  const { makeHighlightTargets } = await import('../js/atlas-country-ids.js');
  const IDS = makeHighlightTargets({ geo: () => ({ features: [] }), resolveCountrySync: () => null });
  assert.deepEqual(IDS.readNames({ query: 'the Alps' }), ['the Alps'], 'a.query reaches the concrete-place resolver ladder');
  assert.deepEqual(IDS.readNames({ region: 'the Sahel' }), ['the Sahel'], '…and so does a.region');
  assert.deepEqual(IDS.readNames({ targets: ['Botswana', 'Chad'] }), ['Botswana', 'Chad'],
    'a.targets carries names too — the field the two lists disagreed about');
  assert.ok(IDS.requestFields().text.includes('query'), 'and there is ONE list that says so');
});

test('R157 #3 SYS: highlight schema is targets/groups/query; the model expands concepts itself', async () => {
  /* ASKED of the shipped catalogue (consolidation): the words have to be in what the model is SHOWN for
     map.highlight, not merely somewhere in the app source. */
  const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
  const shown = makeAtlasCatalogText({}, { moduleCatalog: () => '', langLine: () => 'English', metricList: () => '' })
    .text(['map.highlight']);
  assert.match(shown, /\{"type":"highlight","interpretation":str,"targets":\[\{"name":"<English country name>","iso3":"<ISO 3166-1 alpha-3>"\}/,
    'highlight schema uses interpretation + targets[{name,iso3}]');
  assert.match(shown, /THE MEANING IS YOURS TO RESOLVE — IntMap has NO concept dictionary and will NOT expand a phrase for you/,
    'the model is told to expand the concept itself (no code-side dictionary)');
  assert.match(shown, /"groups":\[\{"label":str,"targets":\[\{"name","iso3"\}/, 'multi-set "groups" form documented');
  assert.match(shown, /use \{"type":"highlight","query":"<the place name exactly as the user said it/,
    'a genuine single feature uses "query" (concrete place → real geometry)');
  // the old "pass the name as the user said it" country-name resolution is gone from the primary path
  assert.ok(!/= highlight the named targets on the map \("on":false clears/.test(html),
    'the old name-target highlight description is replaced');
});

test('R157 #4 image-only: no fabricated user text; default instruction only at the API boundary', () => {
  /* read, not run: run() and _visionPrompt are closures of the kernel, which only a browser can build. */
  // run() no longer overwrites q with a default sentence for an image-only message
  assert.ok(!/if\(!q&&imgs\.length\) q=L\('Read and analyze this image/.test(html),
    'run() no longer injects a default user message for an image-only send');
  assert.match(html, /IMAGE-ONLY: do NOT fabricate a user message/, 'documented: the user bubble/history stay empty of invented prose');
  // the default instruction now lives in _visionPrompt, applied only when the user typed nothing (API boundary)
  assert.match(html, /const _imgDefault=L\('Read and analyze this image\. If it is a document, a maths\/science problem/,
    'the default image instruction moved into _visionPrompt');
  assert.match(html, /\(q\?\('The user says: '\+q\+'\\n\\n'\):\('\[No text was typed — default instruction\] '\+_imgDefault/,
    '_visionPrompt supplies the default ONLY when q is empty (hidden, at the API boundary)');
  // the user bubble is built from esc(q) (empty for an image-only send) + the thumbnails — no default text baked in
  /* (safe-output-single-module) …through the one scheme guard: a thumbnail is a data:image and nothing else */
  assert.match(html, /imgs\.map\(u=>'<img src="'\+esc\(IntMapSafe\.url\(u,\{allowData:true\}\)\)/, 'user bubble shows the image thumbnails');
});

test('R157 #5 IntMapAtlasDebug exposes the new pure spine', () => {
  /* read, not run: IntMapAtlasDebug is published by the kernel when it boots in a browser. */
  for (const fn of ['hlReadGroups:function', 'validCodeSet:function', 'hlState:function']) {
    assert.ok(html.includes(fn), `IntMapAtlasDebug.${fn.split(':')[0]} exposed`);
  }
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r742-atlas-identifier-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* R742 — the identifiers the border store itself declares (Atlas → highlight)

   ⚠⚠⚠ MEASURED ON PRODUCTION 2026-09-15, not reasoned about. Atlas was asked 16 questions against
   production. Three of the failures were one defect:
     · "Which EU countries use the euro?" — 12 consecutive `highlight:FAIL/failed`, 27 steps, 2m14s.
     · "Which countries border Kazakhstan?" — the reply carried "⚠ … UZ → UZB" beside a correct map.
     · "Which African countries are landlocked?" — DZA BWA BFA BDI CAF TCD SWZ ETH LSO MWI MLI NER RWA
       SSD were ALL reported to the reader as "could not be matched to a boundary in the data IntMap
       holds"; the retry one step later drew every one of them.

   The store was never empty. At the moment of the failure window.countryGeo held 258 features,
   IntMapAtlasDebug.validCodeSet() held 252 codes, and codesGeo(['DEU','FRA','ESP','ITA']) hit all
   four. What failed was the READING. Probed live with IntMapAtlasDebug.hlReadGroups:

       {codes:['DEU','FRA']}          → 2 codes
       {codes:['DE','FR']}            → 0 codes, 2 unresolved
       {targets:['Germany','France']} → 0 codes, 2 unresolved

   …while resolveHl('Germany') returns DEU, resolveHl('ドイツ') returns DEU, and
   resolveHl('Korean Peninsula') returns a real admin_union polygon (bbox 124.21..131.86 /
   33.20..43.01). The resolver that could answer was one function away; the reply to question 12 was
   "⚠ Place not found: Korean Peninsula".

   So these measure two FACTS, not two spellings:
     ① an identifier the store declares is read, in whichever ISO notation it is written;
     ② a request in which nothing was an identifier falls through to the concrete-place resolver —
        which is what this reader's own comment has promised since #R157 while doing the opposite. */

/* The reader moved WHOLE out of js/atlas-console.js in #R742 — the kernel's line budget is
   shrink-only (tests/r318-checks ⑨b) — so these run the shipped function itself rather than a text
   lifted out of a file. */

/* A border store shaped like the one that ships (Natural Earth Admin-0, fetched at runtime from
   nvkelso/natural-earth-vector — see js/countries-ui.js). It declares the alpha-3 IntMap keys on
   (__code) beside ISO_A2 and ISO_N3 for the SAME feature. The FIPS trap below is real data: Natural
   Earth gives Germany `FIPS_10` "GM", and ISO 3166-1 alpha-2 "GM" is Gambia — so a reader that
   indexed every column would resolve "GM" to Germany and be wrong about a country nobody asked
   after. */
const STORE = { type: 'FeatureCollection', features: [
  { id: 'DEU', properties: { __code: 'DEU', ISO_A2: 'DE', ISO_A3: 'DEU', ISO_N3: '276', FIPS_10: 'GM', NAME: 'Germany' }, geometry: null },
  { id: 'FRA', properties: { __code: 'FRA', ISO_A2: 'FR', ISO_A3: 'FRA', ISO_N3: '250', FIPS_10: 'FR', NAME: 'France' }, geometry: null },
  { id: 'GMB', properties: { __code: 'GMB', ISO_A2: 'GM', ISO_A3: 'GMB', ISO_N3: '270', FIPS_10: 'GA', NAME: 'Gambia' }, geometry: null },
  { id: 'UZB', properties: { __code: 'UZB', ISO_A2: 'UZ', ISO_A3: 'UZB', ISO_N3: '860', FIPS_10: 'UZ', NAME: 'Uzbekistan' }, geometry: null },
  /* Natural Earth writes -99 where it states no code; an absence is not an identifier. */
  { id: 'XKX', properties: { __code: 'XKX', ISO_A2: -99, ISO_A3: -99, ISO_N3: -99, NAME: 'Kosovo' }, geometry: null }
] };

/* the shipped reader, with only the two collaborators it names */
function reader(store) {
  const t = makeHighlightTargets({ geo: () => store, resolveCountrySync: () => null });
  return { idIndex: t.idIndex, valid: t.validCodeSet, read: t.readGroups, cols: t.isoAliasColumns };
}

const R = reader(STORE);
const codesOf = (g) => (g || []).flatMap((x) => x.codes);

test('R742 ① an identifier is read in every ISO notation the SAME feature declares', () => {
  assert.deepEqual(codesOf(R.read({ codes: ['DEU', 'FRA'] })), ['DEU', 'FRA'], 'alpha-3 — the notation that already worked');
  assert.deepEqual(codesOf(R.read({ codes: ['DE', 'FR'] })), ['DEU', 'FRA'], 'alpha-2 — measured failing on production');
  assert.deepEqual(codesOf(R.read({ codes: ['276', '250'] })), ['DEU', 'FRA'], 'numeric-3');
  assert.deepEqual(codesOf(R.read({ codes: ['UZ'] })), ['UZB'], 'the exact token the Kazakhstan reply warned about');
  assert.deepEqual(codesOf(R.read({ codes: ['de', 'fr'] })), ['DEU', 'FRA'], 'case is not an identity');
});

test('R742 ② the columns are NAMED, so a FIPS collision cannot answer for ISO', () => {
  assert.deepEqual(codesOf(R.read({ codes: ['GM'] })), ['GMB'],
    '"GM" is Gambia, because only the ISO namespaces are read — Germany\'s FIPS_10 is also "GM"');
  assert.ok(!R.idIndex().map.has('GA'), 'a FIPS-only token is not an identifier this map keys on');
  const cols = R.cols();
  assert.ok(cols.length > 0, 'the list is not empty');
  assert.ok(cols.every((c) => /^ISO_/.test(c)),
    'every column read is an ISO namespace; the moment a WB_/FIPS_/UN_ column is added there the ' +
    'collision this test names becomes reachable again');
});

test('R742 ③ a token two features claim identifies neither', () => {
  const R2 = reader({ type: 'FeatureCollection', features: [
    { id: 'AAA', properties: { __code: 'AAA', ISO_A2: 'ZZ' }, geometry: null },
    { id: 'BBB', properties: { __code: 'BBB', ISO_A2: 'ZZ' }, geometry: null } ] });
  assert.ok(R2.idIndex().ambiguous.has('ZZ'), 'the collision is observed');
  assert.ok(!R2.idIndex().map.has('ZZ'), 'and resolved to neither, rather than to whichever was walked first');
});

test('R742 ④ "not stated" is not an identifier', () => {
  assert.ok(!R.idIndex().map.has('-99'), 'Natural Earth writes -99 where it declares no code');
  assert.equal(R.read({ codes: ['-99'] }), null, 'and a request made only of it read nothing');
});

test('R742 ⑤ a request in which NOTHING was an identifier falls through, as the reader documents', () => {
  /* #R157 wrote that a NAME array "does NOT [count as GPT targets] — those fall through to the legacy
     concrete-place resolver". Returning null IS that fall-through. Before this round the same input
     built a group with zero codes, which ended the request with a claim about the boundary data. */
  assert.equal(R.read({ targets: ['Germany', 'France'] }), null, 'plain names');
  assert.equal(R.read({ targets: ['ドイツ'] }), null, "a name in the reader's own language");
  assert.equal(R.read({ targets: ['Korean Peninsula'] }), null, 'a place that is not a country at all');
  assert.equal(R.read({ groups: [{ label: 'x', targets: ['Germany'] }] }), null, 'the grouped form too');
});

test("R742 ⑥ a WRONG identifier still comes back structured — #R158's contract is untouched", () => {
  const g = R.read({ codes: ['XXX'] });
  assert.ok(Array.isArray(g), 'a bogus alpha-3 does not fall through: it IS an identifier, just not one that resolves');
  assert.deepEqual(g[0].codes, [], 'nothing is drawn for it');
  assert.equal(g[0].unresolved.length, 1, 'and it is reported rather than dropped');
  assert.equal(g[0].unresolved[0].reason, 'iso3_not_in_border_data', 'with the machine reason Terra repairs from');
});

test('R742 ⑦ a MIXED request executes the identifiers and reports the rest', () => {
  const g = R.read({ targets: [{ iso3: 'DE', name: 'Germany' }, { name: 'Atlantis' }] });
  assert.deepEqual(codesOf(g), ['DEU'], 'the identifier is executed as-is');
  assert.equal(g[0].unresolved.length, 1, 'the name is neither drawn nor silently dropped');
  assert.equal(g[0].unresolved[0].name, 'Atlantis');
});

test('R742 ⑧ the reply can state which notation it read, so no spelling is swapped in silence', () => {
  const g = R.read({ codes: ['DE', 'FRA'] });
  assert.deepEqual(g[0].read, [{ as: 'DE', code: 'DEU' }], 'only the token that needed reading is reported');
});

test('R742 ⑨ an unreadable store yields an empty index, never a half-built one', () => {
  for (const bad of [null, {}, { features: null }, { features: [{}] }]) {
    const R2 = reader(bad);
    assert.equal(R2.idIndex().map.size, 0, 'nothing is claimed about a store that could not be read');
    assert.equal(R2.read({ codes: ['DE'] }), null, 'and no token resolves through it');
  }
});

test('R742 ⑩ offering an identifier and getting it wrong is NOT the same as offering none', () => {
  /* ⚠ The first cut of the fall-through asked `!t.iso3` — what RESOLVING produced — so
     {name:'Germany', iso3:'XX'} looked like a request with no identifiers and fell through, taking
     #R158's repair contract with it. tests/r157.spec.js caught it. The caller named the identifier
     slot; it just got the value wrong, and that is precisely the case Terra is supposed to be handed
     back so it can re-issue with the right code. */
  const g = R.read({ targets: [{ name: 'Germany', iso3: 'XX' }, { name: 'France', iso3: '' }] });
  assert.ok(Array.isArray(g), 'a wrong identifier does not fall through to the place resolver');
  assert.deepEqual(g[0].codes, [], 'and nothing is auto-applied from the name');
  assert.equal(g[0].unresolved.length, 2, 'both are returned to Terra');

  assert.equal(R.read({ targets: [{ name: 'Germany' }, { name: 'France' }] }), null,
    'the same objects WITHOUT an identifier slot offered none, so they belong to the place resolver');
  assert.ok(Array.isArray(R.read({ codes: ['XXX'] })), 'a bare code-shaped string is an offer too');
  assert.equal(R.read({ targets: ['Korean Peninsula'] }), null, 'and a plain name still is not');
});
}
