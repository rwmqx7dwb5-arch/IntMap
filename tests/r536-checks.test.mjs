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

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasVerify } = await import('../js/atlas-verify.js');
const { makeAtlasGeoObject } = await import('../js/atlas-geo-object.js');
const { makeAtlasGeoLedger } = await import('../js/atlas-geo-ledger.js');
const { NominatimGate } = await import('../js/nominatim-gate.js');

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

const mapped = (html) => { const m = /\u{1F4CD} (\d+) place/u.exec(html); return m ? +m[1] : 0; };
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
