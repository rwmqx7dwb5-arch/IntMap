/* ============================================================================
 *  Atlas · the mapping self-check and the answer's own verification — js/atlas-verify.js
 *  (_pinReplyPlaces' ladder, the verdict and its note, the source audit, the content-class spine,
 *  exact-rational checks) and the answer contract that feeds it
 * ----------------------------------------------------------------------------
 *  (tests-by-topic) Gathered from six round files; every test keeps the title it had there:
 *    · tests/r536-checks.test.mjs                  — a rung that cannot answer must not end the ladder
 *    · tests/r545-checks.test.mjs                  — the hint a caller holds; why a place is unplaced
 *    · tests/r726-atlas-eval-checks.test.mjs ①–④   — heading text, line breaks, lone tokens, every name
 *    · tests/r150-checks.test.mjs #10 (×3)         — research-mapping verification is real
 *    · tests/r149-checks.test.mjs #10              — the mapping-quality commission
 *    · tests/r156-checks.test.mjs #3 #4 #8         — content-class spine, exact rationals, debug surface
 *  #R536 and #R545 each drove the pin pass through a harness of its own; they are kept apart as
 *  run() / runR545() (and listAfter() / listAfterR545(): #R536's answers [] for a missing line,
 *  #R545's answers null, and each round's assertions depend on its own).
 * ==========================================================================*/
/* ============================================================================
 *  R536 — A RUNG THAT CANNOT ANSWER MUST NOT BE ABLE TO END THE LADDER
 * ----------------------------------------------------------------------------
 *  `_pinReplyPlaces` (js/atlas-verify.js) resolves each place an answer named down a ladder:
 *  the coordinate it arrived with → this conversation's geo ledger → the region geocoder →
 *  strict Nominatim. #R489 inserted the ledger rung as `else if(ledger)`, and `ledger` is an
 *  object js/atlas-console.js ALWAYS passes — so that arm was taken for every place without a
 *  coordinate, and an empty ledger ENDED the chain. The two rungs below it were unreachable in
 *  the running app: 「京阪神の経済」 named six prefectures and cities and every one came back
 *  「本文に登場したが未配置（正確に特定できませんでした）」 with ZERO lookups made.
 *
 *  ⚠ WHY EVERY EXISTING CHECK STAYED GREEN. js/atlas-verify.js says of the ledger 「OPTIONAL:
 *  without a ledger this file behaves exactly as it did (the node checks)」 — and that claim was
 *  written in prose and then tested on one side only. So these tests never read the source: they
 *  RUN the shipped module (#R505) in every ledger configuration the app can be in, and assert
 *  that ADDING a rung which has nothing to say changes nothing at all about the rungs below it.
 *  The geocoder and Nominatim are scripted, so a rung that is reached is a rung that is counted.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { appSource } from './app-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => codeOnly(readLF(join(ROOT, p)));

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
await import('../js/safe-html.js');   /* (icon-system) the app loads the encoder before any module that draws an icon (src/main.js); so does this */
const { makeAtlasVerify } = await import('../js/atlas-verify.js');
const { makeAtlasGeoObject } = await import('../js/atlas-geo-object.js');
const { makeAtlasGeoLedger } = await import('../js/atlas-geo-ledger.js');
const { NominatimGate } = await import('../js/nominatim-gate.js');
const { makeAtlasAnswerContract } = await import('../js/atlas-answer-contract.js');

NominatimGate.configure({ gapMs: 0, reset: true });   /* the 1,100 ms floor is #R298's and is tested there; here it would only make this file slow */

const GEOBJ = makeAtlasGeoObject();
const V = makeAtlasVerify({}, { L: (en) => en, esc: (s) => String(s) });
const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();

/* the six the reader actually saw refused, each at its OWN coordinate so the 0.05° cell dedupe
   can never stand in for a rung that failed to run */
const NAMES = ['大阪府', '京都府', '兵庫県', '大阪市', '京都市', '神戸市'];
const spotOf = (n) => ({ lng: 135 + NAMES.indexOf(n) * 0.5, lat: 34 + NAMES.indexOf(n) * 0.5 });
const placesOf = () => NAMES.map((n) => ({ name: n, country: '日本', kind: 'region', summary: '' }));

function emptyLedger() {
  const l = makeAtlasGeoLedger({ norm, geoObject: GEOBJ.geoObject });
  try { l.beginTurn(1); } catch (_) { /* the ledger works without one */ }
  return l;
}

/* one run of the shipped pass, with every rung below the ledger scripted and counted */
async function run(o) {
  o = o || {};
  const seen = { geocode: [], nominatim: [] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    seen.nominatim.push(String(url));
    const body = (o.nominatim || (() => []))(String(url));
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
  const pin = V.makePinReplyPlaces({
    GE: () => ({ camera: { flyTo() {}, fitBounds() {}, getZoom() { return 3; } } }),
    GEOBJ,
    L: (en) => en,
    geocode: async (q) => {
      seen.geocode.push(q);
      if (o.geocode === false) return null;
      const n = NAMES.find((x) => q.indexOf(x) === 0);
      return n ? Object.assign({ name: n }, spotOf(n)) : null;
    },
    paintPois: () => true,
    getPois: () => [],
    setPois: (v) => { seen.pois = v; },
    ledger: ('ledger' in o) ? o.ledger : null,
  });
  let html = '';
  try {
    html = await pin(o.places || placesOf(), { text: '', citations: [], contentClass: 'geographic' });
  } finally { globalThis.fetch = realFetch; }
  return { html, seen };
}

const mapped = (html) => { const m = /<\/svg> (\d+) place/.exec(html); return m ? +m[1] : 0; };   /* (icon-system) the count follows the pin js/icons.js draws */
const listAfter = (html, label) => {
  const i = html.indexOf(label);
  if (i < 0) return [];
  const seg = html.slice(i + label.length);
  return seg.slice(0, seg.indexOf('<')).replace(/…$/, '').split(', ').filter(Boolean);
};
const unplaced = (html) => listAfter(html, 'not placed (couldn’t locate precisely): ');
const ambiguous = (html) => listAfter(html, 'not placed): ');

/* ══ ① AN OPTIONAL RUNG WITH NOTHING TO SAY IS INDISTINGUISHABLE FROM ITS ABSENCE ═══════════ */

test('R536 ①: an empty ledger resolves exactly what no ledger resolves', async () => {
  const none = await run({ ledger: null });
  const empty = await run({ ledger: emptyLedger() });

  assert.equal(mapped(none.html), NAMES.length, 'the no-ledger shape did not place all six — the scripted geocoder is wrong, not the ladder');
  assert.deepEqual(empty.seen.geocode, none.seen.geocode,
    'an EMPTY ledger changed which places reached the geocoder — the ladder stops at a rung that had no answer (this is the #R489 defect: six 京阪神 names, zero lookups)');
  assert.equal(mapped(empty.html), mapped(none.html), 'an empty ledger changed how many places were mapped');
  assert.deepEqual(unplaced(empty.html), unplaced(none.html), 'an empty ledger changed which places were reported 未配置');
  assert.deepEqual(unplaced(empty.html), [], 'places the geocoder can answer for were still reported as 未配置');
});

/* ══ ② …AND A RUNG THAT DOES ANSWER STILL SPARES THE ONES BELOW IT (#R489 is kept) ══════════ */

test('R536 ②: a place this conversation already resolved is not geocoded again', async () => {
  const led = emptyLedger();
  led.record({ kind: 'region', name: '大阪府', canonicalName: '大阪府', countryName: '日本', lng: 135.5, lat: 34.68, source: 'answer', provenance: 'geocoded_point' });
  const r = await run({ ledger: led });

  assert.ok(!r.seen.geocode.some((q) => q.indexOf('大阪府') === 0), '大阪府 was sent to the geocoder although the ledger already held it — #R489 is undone');
  assert.equal(r.seen.geocode.length, NAMES.length - 1, 'the five the ledger does NOT hold must still be geocoded');
  assert.equal(mapped(r.html), NAMES.length, 'all six are on the map: one from the ledger, five from the geocoder');
});

/* ══ ③ A COORDINATE THAT ARRIVED IS NOT RE-RESOLVED, BY ANY RUNG (#R397, asked by running it) ═ */

test('R536 ③: a place that already knows where it is reaches no resolver at all', async () => {
  const r = await run({
    ledger: emptyLedger(),
    places: [{ name: '神戸港', country: '日本', kind: 'port', summary: '', lng: 135.19, lat: 34.68, provenance: 'feed_coordinate' },
      { name: '大阪市', country: '日本', kind: 'city', summary: '' }],
  });
  assert.deepEqual(r.seen.geocode, ['大阪市, 日本'], 'the place that arrived with a coordinate was resolved again (or the one without one was not)');
  assert.equal(r.seen.nominatim.length, 0, 'Nominatim was asked although both places were answered above it');
  assert.equal(mapped(r.html), 2);
});

/* ══ ④ WHEN THE GEOCODER DECLINES, THE LADDER REACHES THE BOTTOM RUNG ════════════════════════ */

test('R536 ④: a geocoder that answers nothing falls through to strict Nominatim', async () => {
  const r = await run({
    ledger: emptyLedger(),
    geocode: false,
    places: [{ name: '大阪府', country: '日本', kind: 'region', summary: '' }],
    nominatim: () => [{ class: 'boundary', addresstype: 'province', display_name: '大阪府, 日本', lat: '34.62', lon: '135.49' }],
  });
  assert.equal(r.seen.geocode.length, 1, 'the region geocoder was skipped');
  assert.equal(r.seen.nominatim.length, 1, 'the geocoder declined and NOTHING below it ran — the place was declared 未配置 without ever being looked up');
  assert.equal(mapped(r.html), 1, 'the strict result was found and then not pinned');
});

/* ══ ⑤ …AND THE AMBIGUOUS VERDICT SURVIVES THE CHAIN (it must not read as 未配置) ═══════════ */

test('R536 ⑤: two places sharing a name are reported ambiguous, not unplaced', async () => {
  const r = await run({
    ledger: emptyLedger(),
    geocode: false,
    places: [{ name: 'Springfield', country: '', kind: 'city', summary: '' }],
    nominatim: () => [{ class: 'place', display_name: 'Springfield, Illinois', lat: '39.80', lon: '-89.64' },
      { class: 'place', display_name: 'Springfield, Massachusetts', lat: '42.10', lon: '-72.59' }],
  });
  assert.deepEqual(ambiguous(r.html), ['Springfield'], 'the ambiguous verdict was lost when the ladder was rewritten as a chain');
  assert.equal(mapped(r.html), 0, 'an ambiguous name was pinned at one of its meanings');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R545 (formerly tests/r545-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ============================================================================
 *  R545 — THE HINT A CALLER CAN ACTUALLY SUPPLY, AND THE REASON A PLACE IS UNPLACED
 * ----------------------------------------------------------------------------
 *  Two things #R536 measured but deliberately left alone, both in the same pass:
 *
 *  ①  THE LEDGER'S NARROWING KEYS WERE ONES NO CALLER HELD. `resolve()` read `kind` and
 *     `countryCode`; js/atlas-verify.js passed `countryCode: it.countryCode` off a mapper that
 *     copies name/country/kind/summary/lng/lat/provenance/src and no code at all — always
 *     undefined — and js/atlas-console.js passed `countryName`, which `resolve()` ignored. So at
 *     every call site the hint was structurally dead and 「モスクワ」 came back as whichever
 *     entity happened to be recorded last. The fix reads what callers hold; these tests measure
 *     that by RECORDING two entities that differ only in the narrowed field.
 *
 *  ②  「正確に特定できませんでした」 WAS PRINTED FOR FOUR DIFFERENT THINGS — a name the geocoders
 *     could not resolve, the 14-pin cap, the pass deadline, and a lookup that never answered.
 *     Three of those are facts about US, not about the place. The verdict now carries the reason
 *     and the note prints one line per cause. These tests drive the shipped module into each
 *     cause and read the note, so they cannot pass by spelling.
 * ==========================================================================*/
const ledgerOf = () => makeAtlasGeoLedger({ norm, geoObject: GEOBJ.geoObject });

/* one run of the shipped pass, every rung below the ledger scripted and counted */
async function runR545(o) {
  o = o || {};
  const seen = { geocode: [], nominatim: [], pois: [] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    seen.nominatim.push(String(url));
    if (o.nominatim === 'dead') throw new Error('offline');
    const body = (typeof o.nominatim === 'function') ? o.nominatim(String(url)) : [];
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  };
  const pin = V.makePinReplyPlaces({
    GE: () => ({ camera: { flyTo() {}, fitBounds() {}, getZoom() { return 3; } } }),
    GEOBJ,
    L: (en) => en,
    geocode: async (q) => {
      seen.geocode.push(q);
      if (o.geocode === 'throw') throw new Error('geocoder down');
      if (o.geocode === false) return null;
      return (typeof o.geocode === 'function') ? o.geocode(q) : null;
    },
    paintPois: () => true,
    getPois: () => [], setPois: (v) => { seen.pois = v; },
    ledger: ('ledger' in o) ? o.ledger : null,
  });
  let html = '';
  try { html = await pin(o.places || [], { text: '', citations: [], contentClass: 'geographic' }); }
  finally { globalThis.fetch = realFetch; }
  return { html, seen };
}

const LINE = {
  not_found: 'not placed (couldn’t locate precisely): ',
  budget: 'not placed (this answer reached its lookup limit — not a judgement about the place): ',
  infra: 'not placed (the map lookup did not answer — not a judgement about the place): ',
};
const listAfterR545 = (html, label) => {
  const i = html.indexOf(label);
  if (i < 0) return null;
  const seg = html.slice(i + label.length);
  return seg.slice(0, seg.indexOf('<')).replace(/…$/, '').split(', ').filter(Boolean);
};

/* ══ ① THE LEDGER NARROWS ON WHAT THE CALLER HOLDS ══════════════════════════════════════════ */

/* ⚠ WHAT THE COUNTRY HINT IS FOR, EXACTLY. Two same-named places with no country code are ONE
   entity in this ledger — identity is name + kind + code, and #R521 is the round that took the
   equivalent lesson for city labels. So the hint cannot pick between two Springfields it never
   held apart; what it does is REFUSE the one it holds when the answer is talking about another
   country, which is the difference between falling through to a geocoder that will be asked
   「Springfield, New Zealand」 and pinning Illinois with confidence. That refusal is the thing
   worth measuring, and it is what these two tests measure. */
test('R545 ①a: the ledger declines a place it holds for a DIFFERENT country', () => {
  const led = ledgerOf();
  led.record({ kind: 'city', name: 'Springfield', canonicalName: 'Springfield', countryName: 'United States', lng: -89.64, lat: 39.80, source: 'answer', provenance: 'geocoded_point' });

  assert.ok(led.resolve('Springfield', { countryName: 'United States' }), 'the ledger stopped answering for the country it actually holds');
  assert.equal(led.resolve('Springfield', { countryName: 'New Zealand' }), null,
    'the ledger handed back the United States entity for a New Zealand question — resolve() still ignores the key every caller passes');
});

test('R545 ①b0: …and the pin pass then falls through to the geocoder with the right country', async () => {
  const led = ledgerOf();
  led.record({ kind: 'city', name: 'Springfield', canonicalName: 'Springfield', countryName: 'United States', lng: -89.64, lat: 39.80, source: 'answer', provenance: 'geocoded_point' });
  const r = await runR545({
    ledger: led,
    geocode: (q) => ({ name: 'Springfield', lng: 171.93, lat: -43.33 }),
    places: [{ name: 'Springfield', country: 'New Zealand', kind: 'city', summary: '' }],
  });
  assert.deepEqual(r.seen.geocode, ['Springfield, New Zealand'], 'the pass took the ledger\'s Illinois coordinate instead of asking about New Zealand');
  assert.equal(Math.round(r.seen.pois[0].lng), 172, 'the pin landed in Illinois');
});

test('R545 ①b: an entity that does not know its country is not excluded by a country hint', () => {
  const led = ledgerOf();
  led.record({ kind: 'city', name: 'Kotovsk', canonicalName: 'Kotovsk', lng: 41.5, lat: 52.6, source: 'answer', provenance: 'geocoded_point' });
  const hit = led.resolve('Kotovsk', { countryName: 'Russia' });
  assert.ok(hit, 'a hint invented a fact: an entity with no country was refused because the caller named one');
});

test('R545 ①c: the kind hint still narrows, and the pin pass supplies both keys it holds', async () => {
  const led = ledgerOf();
  led.record({ kind: 'city', name: 'Москва', canonicalName: 'Москва', countryName: 'Россия', lng: 37.62, lat: 55.75, source: 'answer', provenance: 'geocoded_point' });
  led.record({ kind: 'admin1', name: 'Москва', canonicalName: 'Московская область', countryName: 'Россия', lng: 36.5, lat: 55.5, source: 'answer', provenance: 'geocoded_point' });
  assert.equal(led.resolve('Москва', { kind: 'admin1' }).kind, 'admin1', 'the kind hint does not narrow');

  /* …and the pass hands the ledger the kind the model declared, so it does not take the other one */
  const r = await runR545({
    ledger: led,
    places: [{ name: 'Москва', country: 'Россия', kind: 'admin1', summary: '' }],
  });
  assert.equal(r.seen.geocode.length, 0, 'the ledger held this place and it was geocoded anyway');
  assert.equal(r.seen.pois.length, 1, 'the place was not pinned from the ledger');
  assert.equal(Math.round(r.seen.pois[0].lng * 10), 365, 'the pass pinned the CITY although the answer declared an admin1 — the kind hint is not reaching the ledger');
});

/* ══ ② AN UNPLACED PLACE SAYS WHY ═══════════════════════════════════════════════════════════ */

test('R545 ②a: a name nothing could resolve is the only one called “couldn’t locate precisely”', async () => {
  const r = await runR545({
    ledger: ledgerOf(),
    geocode: false,
    nominatim: () => [],
    places: [{ name: 'Nowhere At All', country: 'Atlantis', kind: 'city', summary: '' }],
  });
  assert.deepEqual(listAfterR545(r.html, LINE.not_found), ['Nowhere At All']);
  assert.equal(listAfterR545(r.html, LINE.budget), null, 'a genuine miss was blamed on our lookup limit');
  assert.equal(listAfterR545(r.html, LINE.infra), null, 'a genuine miss was blamed on the network');
});

test('R545 ②b: the 14-pin cap is reported as OUR limit, not as a fact about the place', async () => {
  const places = Array.from({ length: 16 }, (_, i) => ({ name: 'Place Number ' + i, country: 'Japan', kind: 'city', summary: '' }));
  const r = await runR545({
    ledger: ledgerOf(),
    geocode: (q) => { const i = +(/Place Number (\d+)/.exec(q) || [])[1]; return { name: 'Place Number ' + i, lng: 130 + i, lat: 30 + i * 0.7 }; },
    places,
  });
  const budget = listAfterR545(r.html, LINE.budget);
  assert.ok(budget && budget.length >= 2, 'the places refused by the 14-pin cap are not reported under the cap — the reader is told they could not be located');
  assert.deepEqual(budget, ['Place Number 14', 'Place Number 15']);
  assert.equal(listAfterR545(r.html, LINE.not_found), null, 'the cap was still described as a failure to locate');
  assert.match(r.html, /<\/svg> 14 places/, 'the 14 that fit are not reported as mapped (after the pin js/icons.js draws)');
});

test('R545 ②c: a lookup that never answered is reported as the lookup, not as the place', async () => {
  const r = await runR545({
    ledger: ledgerOf(),
    geocode: 'throw',
    nominatim: 'dead',
    places: [{ name: 'Ube Port', country: 'Japan', kind: 'port', summary: '' }],
  });
  assert.deepEqual(listAfterR545(r.html, LINE.infra), ['Ube Port'], 'an unreachable geocoder was reported as “couldn’t locate precisely”');
  assert.equal(listAfterR545(r.html, LINE.not_found), null);
});

test('R545 ②d: a verdict built the old way still prints the line it always printed', () => {
  const html = V._atlMappingNoteHtml({ mapped: [], unplaced: ['Ube Port'], ambiguous: [] }, null, {});
  assert.deepEqual(listAfterR545(html, LINE.not_found), ['Ube Port'],
    'a caller that predates `unplacedBy` now prints nothing at all — the fallback is missing');
});

test('R545 ②e: every unplaced name still appears in `unplaced`, whatever its reason', () => {
  const v = V._atlMappingVerdict([
    { name: 'A One', verdict: 'unplaced', reason: 'budget', src: 'structured' },
    { name: 'B Two', verdict: 'unplaced', reason: 'infra', src: 'structured' },
    { name: 'C Three', verdict: 'unplaced', src: 'structured' },
    { name: 'D Four', verdict: 'mapped', src: 'structured' },
  ]);
  assert.deepEqual(v.unplaced, ['A One', 'B Two', 'C Three'], 'splitting by cause dropped names out of the list callers already read');
  assert.deepEqual(v.unplacedBy.budget, ['A One']);
  assert.deepEqual(v.unplacedBy.infra, ['B Two']);
  assert.deepEqual(v.unplacedBy.not_found, ['C Three'], 'a spot with no reason must fall into the cause the note used to name for all of them');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R726 ①–④ (formerly tests/r726-atlas-eval-checks.test.mjs) — fourteen questions put to production
   Atlas on 2026-09-15; what was fixed is what Atlas is TOLD, never a judgement made in its place.
   ① a heading is text, not markup  ② a place phrase does not bridge a line  ③ a lone capitalised
   token is weak evidence  ④ the strict geocoder matches every NAME a feature carries
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
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
  /* kept as a spelling: IntMapAtlasDebug and the dispatch call sites are built inside js/atlas-console.js’s closure, which needs the page */
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

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R149 #10 / #R150 #10 / #R156 #3 #4 #8 — the research-mapping verification, the content-class spine
   and exact-rational checks (formerly tests/r149-, r150-, r156-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
const html = appSource(new URL('../', import.meta.url));   /* (#R162) index.html + css/intmap.css + js/*.js */
test('R149 #10 mapping-quality commission: reply places get pinned + honest self-audit', () => {
  /* kept as a spelling: IntMapAtlasDebug and the dispatch call sites are built inside js/atlas-console.js’s closure, which needs the page */
  assert.match(html, /async function _pinReplyPlaces\(places, ctx\)/, 'reply-place pinning helper');
  // (#R150) the orchestrator now audits via the pure verdict (mapped/unplaced/ambiguous) + merges pins; see r150-checks.
  assert.match(html, /_atlMappingNoteHtml\(_atlMappingVerdict\(spots\)/, 'reply mapping folds into the pure verdict');
  assert.match(html, /but not placed \(couldn/, 'honest not-placed note (R150 wording)');
  /* ⚠ (#R350) THE TRAILER IS GONE AND THE PROPERTY IT STOOD FOR IS NOT. #R149's requirement was
     「no extra AI call to find the places the answer named」, and the mechanism it used was a
     `PLACES:` JSON line glued to the end of the prose and peeled off with a regular expression.
     #R350 replaced the whole answer with a structure, so the places are a FIELD of it — still one
     call, now without a trailer to scrape. Asserting the old regex would pin the mechanism instead
     of the property, and would go red for the round that improved it. */
  /* ⚠ (#R397) AND THE SENTENCE ABOVE CAME TRUE. This asserted the exact flattening
     `.map(p2=>({n:p2.name,c:p2.country,k:p2.kind}))` — which was the DEFECT: it dropped the
     coordinate and the provenance that `normalizeAnswer` had just merged in, one line before the
     pinning step that needed them, so every place was re-geocoded from its name. The requirement is
     that analyze hands its structured places to the pinning step; the shape it hands them in is the
     mechanism. Asserted as the property now. */
  assert.match(html, /_pinReplyPlaces\(_env\.places\|\|\[\]/, 'analyze no longer maps the places the structured answer names');
  assert.ok(!/replace\(\/\\n\?\\s\*PLACES/.test(html), 'the PLACES: trailer regex is back');
  assert.match(html, /"type":"answer","text":str,"contentClass"\?:str,"checks"\?:object\[\],"places"\?:\[\{"n":str,"c":str,"k":str\}\]/, 'answer action schema has places (R156 added contentClass + checks)');
  /* ⚠ (#R406) THE PROMPT HALF OF THIS COMMISSION IS NOW ONE CLAUSE, AND ONE OF ITS TWO HALVES IS
     GONE ON PURPOSE. #R149 wired a MAPPING MANDATE paragraph into planner/answer/analyze, and it
     said two things: (a) the places in the prose and the places on the map must agree, never invent
     a coordinate, say what could not be placed; (b) do not finish a location-rich answer having
     mapped nothing. #R406 removed (b) by name — 「回答内に地点名が出るだけでピン配置を要求する規則」 —
     because it turned 「フランス革命はなぜ起きたのか」, which names Paris and wants prose, into an
     unrequested camera move; whether to map at all is Atlas's decision now. So the «MAPPING MANDATE»
     assertion is deleted rather than re-aimed — and note HOW it was found: with the mandate gone it
     went on passing, because js/atlas-console.js has a comment that merely NAMES it. (a) — which is
     what the self-audit instruction served — is asserted against the surviving text in
     js/atlas-policy.js instead, and that assertion was mutation-tested until it went red.
     ⚠ `includes`, not `assert.match`: a failing match prints all 14 MB of appSource (#R390). */
  assert.ok(html.includes('and say which of them could not be placed'),
    'the model is still told to report the places it could NOT put on the map (js/atlas-policy.js mapWhatYouName)');
});
test('R150 #10 research-mapping: PURE audit helpers exist and are exposed for tests', () => {
  /* ⚠ (tests-by-topic) THE MODULE IS ASKED WHAT IT HANDS OUT, instead of the concatenated app source
     being searched for eight declarations. js/atlas-verify.js is the module these helpers live in, and
     its factory returns them — which is how js/atlas-console.js gets them. */
  for (const fn of ['_atlNorm', '_atlNameOk', '_atlExtractPlaces', '_atlRegDomain', '_atlAuditSources', '_atlMappingVerdict', '_atlMappingNoteHtml', '_atlGeocodeStrict']) {
    assert.equal(typeof V[fn], 'function', fn + ' is defined');
  }
  /* exposed on IntMapAtlasDebug for the runtime spec — the debug object is built inside the console's
     closure, so this half stays a spelling */
  assert.match(html, /extractPlaces:function\(t\)\{/, 'extractPlaces exposed on IntMapAtlasDebug');
  assert.match(html, /auditSources:function\(c\)\{/, 'auditSources exposed');
  assert.match(html, /mappingVerdict:function\(s\)\{/, 'mappingVerdict exposed');
});

test('R150 #10 orchestrator: MERGES with existing pins (no skip-on-pins) and NEVER an empty catch', () => {
  /* kept as a spelling: IntMapAtlasDebug and the dispatch call sites are built inside js/atlas-console.js’s closure, which needs the page */
  // the old `!(_pois&&_pois.length)` skip guard is gone from BOTH call sites
  assert.ok(!/&&!\(_pois&&_pois\.length\)\)\{ try\{ html\+=await _pinReplyPlaces/.test(html), 'analyze no longer skips when pins exist');
  assert.ok(!/a\.places\.length&&!\(_pois&&_pois\.length\)/.test(html), 'answer no longer skips when pins exist');
  /* the analyze call passes the final text + citations.
     ⚠ (#R350) THE PROPERTY IS UNCHANGED AND THE NOUNS MOVED. `txt` was the model's prose and
     `_aCites` was `window._aiLastCitations` — a global whichever call answered LAST overwrites. The
     reconciliation now reads the ANSWER STRUCTURE's text and the evidence registry of THIS call, so
     the audit still sees the finished answer and its real sources; it just cannot be handed another
     turn's. Asserting the old two variable names would pin the defect, not the requirement. */
  /* ⚠ (#R397) The `.map(...)` in the middle is gone — it was re-flattening the places and discarding
     the coordinates merged in by the contract. The property this check is about (the finished text and
     THIS call's registry, never another turn's) is unchanged, so only the middle is relaxed. */
  assert.match(html, /_pinReplyPlaces\(_env\.places\|\|\[\][\s\S]{0,60}?\{text:answerPlainText\(_env\),citations:_reg\.all\(\)/, 'analyze passes the answer text + its own citations');
  // no empty catch — it logs the cause and returns an honest note
  assert.match(html, /console\.warn\('reply-mapping audit failed',e\)/, 'orchestrator records the failure cause');
  assert.match(html, /Could not run the map self-check for this answer\./, 'honest fallback note (not silent)');
  // merge, not wipe: existing pins are read into `pre` and concatenated
  assert.match(html, /const merged=pre\.concat\(newPins\.map/, 'merges existing pins with the new ones');
});
test('R150 #10 source-concentration audit is real (normalized domains + official detection)', () => {
  /* ⚠ (tests-by-topic) RUN, NOT READ. This matched the text of _atlIsOfficial's declaration, one
     comparison inside _atlAuditSources and the English caveat. The audit is a pure function, so it is
     handed citations and its verdict — and the note the reader gets — are read. */
  const one = V._atlAuditSources([{ url: 'https://www.bbc.co.uk/a' }, { url: 'https://news.bbc.co.uk/b' }]);
  assert.equal(one.distinct, 1, 'two hosts of one registered domain are one source (normalized domains)');
  assert.equal(one.concentrated, true, 'single-domain concentration detected');
  const spread = V._atlAuditSources(['https://www.mhlw.go.jp/x', 'https://www.reuters.com/y', 'https://apnews.com/z']);
  assert.equal(spread.concentrated, false, 'three independent sources are not a concentration');
  assert.deepEqual(spread.official, ['mhlw.go.jp'], 'official/primary detection by institutional TLD (no per-site hardcoding)');
  const note = V._atlMappingNoteHtml({ mapped: ['A'], unplaced: [], ambiguous: [] }, one, {});
  assert.match(note, /Sources here concentrate on one site/, 'honest one-domain caveat');
  assert.doesNotMatch(V._atlMappingNoteHtml({ mapped: ['A'], unplaced: [], ambiguous: [] }, spread, {}), /concentrate on one site/,
    'and no caveat where there is nothing to warn about');
});

test('R156 #3 content-class spine + code-side geo gate', async () => {
  /* ⚠ (tests-by-topic) THE SPINE IS CALLED, NOT READ. This matched the declarations of
     _atlContentClass / _atlShouldMap and the early-return line of _pinReplyPlaces; all three are in
     the factory js/atlas-verify.js returns, so each is asked the question the round is about. */
  assert.equal(V._atlContentClass('Mathematics problem'), 'math', 'math class detected');
  assert.equal(V._atlContentClass('matrix algebra'), 'math');
  assert.equal(V._atlShouldMap('geographic'), true, 'geographic maps');
  assert.equal(V._atlShouldMap(''), true, '…and so does an unclassified answer');
  for (const cls of ['math', 'code', 'document', 'photo', 'conceptual'])
    assert.equal(V._atlShouldMap(cls), false, 'only geographic (or unclassified) maps — ' + cls + ' blocks mapping');
  /* _pinReplyPlaces refuses to run for a non-geographic class — no extraction, no note, NO LOOKUP
     (Problem/Thus/Let U can never be geocoded) */
  let asked = 0;
  const pin = V.makePinReplyPlaces({ GE: () => ({ camera: {} }), GEOBJ, L: (en) => en,
    geocode: async () => { asked++; return null; }, paintPois: () => true, getPois: () => [], setPois: () => {}, ledger: null });
  const out = await pin([{ name: 'Problem', country: '', kind: 'city' }, { name: 'Thus', country: '', kind: 'city' }],
    { text: 'Let U be the matrix. Thus V·P = U.', citations: [], contentClass: 'math' });
  assert.equal(out, '', '_pinReplyPlaces early-returns for a non-geo class');
  assert.equal(asked, 0, '…before a single lookup');
  /* the answer dispatch + vision turn gate mapping on the SAME class — that call site is closure code
     in js/atlas-console.js, so it stays a spelling */
  assert.match(html, /if\(_atlShouldMap\(_acls\)\) _ah\+=await _pinReplyPlaces\(a\.places\|\|\[\],\{text:String\(a\.text\|\|''\),citations:_acit,contentClass:_acls\}\);/, 'answer dispatch gates mapping on the class');
});

test('R156 #4 exact-rational deterministic verification', () => {
  /* ⚠ (tests-by-topic) THE CHECKER IS RUN, NOT READ. This matched five declarations and one regular
     expression inside js/atlas-verify.js; _atlVerifyChecks, _atlParseRat and _atlChecksNoteHtml are
     returned by its factory, so a transition-matrix check is actually verified here. */
  const v = V._atlVerifyChecks([
    /* V·P = U with thirds and halves — a float product would not compare equal */
    { type: 'matmul', a: [['1/2', '1/2'], ['1/3', '2/3']], b: [[1], [1]], expect: [[1], [1]], label: 'rows sum to 1' },
    { type: 'matrixProduct', a: [[1, 2]], b: [[1], [1]], expect: [[4]], label: 'wrong product' },
    { type: 'nonsense', a: 1 },
  ]);
  assert.equal(v.ran, 2, 'matmul check (V·P = U) supported; an unsupported check is skipped, never counted as verified');
  assert.equal(v.passed, 1, 'the exact product verified');
  assert.deepEqual(v.failed.map((f) => f.label), ['wrong product'], 'the wrong one is named');
  /* exact fraction parsing (1/22 etc.) — never a rounded decimal */
  const r = V._atlParseRat('1/22');
  assert.ok(r && r.n === 1n && r.d === 22n, 'parses "a/b" exact fractions');
  assert.ok(V._atlParseRat('0.1').d === 10n, 'and a decimal as the fraction it is');
  /* honest self-check note (verified / did-not-match) */
  assert.match(V._atlChecksNoteHtml({ ran: 1, passed: 1, failed: [] }), /verified independently/);
  assert.match(V._atlChecksNoteHtml(v), /did NOT match \(wrong product\)/);
  assert.equal(V._atlChecksNoteHtml({ ran: 0, passed: 0, failed: [] }), '', 'nothing checked, nothing claimed');
});

test('R156 #8 IntMapAtlasDebug exposes the new spine', () => {
  /* kept as a spelling: IntMapAtlasDebug and the dispatch call sites are built inside js/atlas-console.js’s closure, which needs the page */
  for (const fn of ['contentClass:function', 'shouldMap:function', 'verifyChecks:function', 'checksNote:function', 'parseRat:function', 'visionSys:function']) {
    assert.ok(html.includes(fn), `IntMapAtlasDebug.${fn.split(':')[0]} exposed`);
  }
});
