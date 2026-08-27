// R157 source-level regression checks (deterministic, no browser).
// Guards the "Atlas NL redesign — the model interprets MEANING, the code validates & executes":
//   #1 REMOVED in #R406 — its subject (localPlan) is deleted; see the note where the test stood
//   #2 dispatch highlight: a GPT-decided-targets path validates ISO3 → real borders (no regionGroup on this path)
//   #3 SYS: highlight schema is targets:[{name,iso3}] / groups / query, and the model must expand concepts itself
//   #4 image-only: run() fabricates NO user text; the default instruction moves to the API boundary (_visionPrompt)
//   #5 IntMapAtlasDebug exposes the new pure spine (hlReadGroups / validCodeSet / hlState)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */

/* R157 #1 (localPlan's highlight shortcuts, kept and removed) deleted in #R406: localPlan is gone, so no regular expression decides a highlight target — or anything else — before the model; the turn loop that decides instead is covered by tests/r406-agent.test.mjs and tests/r406-turn.test.mjs. */

test('R157 #2 dispatch: GPT-decided-targets path validates ISO3 → real borders (no regionGroup)', () => {
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
  // a.query (a concrete single feature the model chose NOT to expand) flows into the legacy resolver
  assert.match(html, /a\.region\|\|a\.query\|\|''\)\.split/, 'a.query reaches the concrete-place resolver ladder');
});

test('R157 #3 SYS: highlight schema is targets/groups/query; the model expands concepts itself', () => {
  assert.match(html, /\{"type":"highlight","interpretation":str,"targets":\[\{"name":"<English country name>","iso3":"<ISO 3166-1 alpha-3>"\}/,
    'highlight schema uses interpretation + targets[{name,iso3}]');
  assert.match(html, /THE MEANING IS YOURS TO RESOLVE — IntMap has NO concept dictionary and will NOT expand a phrase for you/,
    'the model is told to expand the concept itself (no code-side dictionary)');
  assert.match(html, /"groups":\[\{"label":str,"targets":\[\{"name","iso3"\}/, 'multi-set "groups" form documented');
  assert.match(html, /use \{"type":"highlight","query":"<the place name exactly as the user said it/,
    'a genuine single feature uses "query" (concrete place → real geometry)');
  // the old "pass the name as the user said it" country-name resolution is gone from the primary path
  assert.ok(!/= highlight the named targets on the map \("on":false clears/.test(html),
    'the old name-target highlight description is replaced');
});

test('R157 #4 image-only: no fabricated user text; default instruction only at the API boundary', () => {
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
  assert.match(html, /imgs\.map\(u=>'<img src="'\+esc\(u\)/, 'user bubble shows the image thumbnails');
});

test('R157 #5 IntMapAtlasDebug exposes the new pure spine', () => {
  for (const fn of ['hlReadGroups:function', 'validCodeSet:function', 'hlState:function']) {
    assert.ok(html.includes(fn), `IntMapAtlasDebug.${fn.split(':')[0]} exposed`);
  }
});
