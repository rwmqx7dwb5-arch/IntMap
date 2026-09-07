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
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasVerify } = await import('../js/atlas-verify.js');
const { makeAtlasGeoObject } = await import('../js/atlas-geo-object.js');
const { makeAtlasGeoLedger } = await import('../js/atlas-geo-ledger.js');
const { NominatimGate } = await import('../js/nominatim-gate.js');

NominatimGate.configure({ gapMs: 0, reset: true });

const GEOBJ = makeAtlasGeoObject();
const V = makeAtlasVerify({}, { L: (en) => en, esc: (s) => String(s) });
const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
const ledgerOf = () => makeAtlasGeoLedger({ norm, geoObject: GEOBJ.geoObject });

/* one run of the shipped pass, every rung below the ledger scripted and counted */
async function run(o) {
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
const listAfter = (html, label) => {
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
  const r = await run({
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
  const r = await run({
    ledger: led,
    places: [{ name: 'Москва', country: 'Россия', kind: 'admin1', summary: '' }],
  });
  assert.equal(r.seen.geocode.length, 0, 'the ledger held this place and it was geocoded anyway');
  assert.equal(r.seen.pois.length, 1, 'the place was not pinned from the ledger');
  assert.equal(Math.round(r.seen.pois[0].lng * 10), 365, 'the pass pinned the CITY although the answer declared an admin1 — the kind hint is not reaching the ledger');
});

/* ══ ② AN UNPLACED PLACE SAYS WHY ═══════════════════════════════════════════════════════════ */

test('R545 ②a: a name nothing could resolve is the only one called “couldn’t locate precisely”', async () => {
  const r = await run({
    ledger: ledgerOf(),
    geocode: false,
    nominatim: () => [],
    places: [{ name: 'Nowhere At All', country: 'Atlantis', kind: 'city', summary: '' }],
  });
  assert.deepEqual(listAfter(r.html, LINE.not_found), ['Nowhere At All']);
  assert.equal(listAfter(r.html, LINE.budget), null, 'a genuine miss was blamed on our lookup limit');
  assert.equal(listAfter(r.html, LINE.infra), null, 'a genuine miss was blamed on the network');
});

test('R545 ②b: the 14-pin cap is reported as OUR limit, not as a fact about the place', async () => {
  const places = Array.from({ length: 16 }, (_, i) => ({ name: 'Place Number ' + i, country: 'Japan', kind: 'city', summary: '' }));
  const r = await run({
    ledger: ledgerOf(),
    geocode: (q) => { const i = +(/Place Number (\d+)/.exec(q) || [])[1]; return { name: 'Place Number ' + i, lng: 130 + i, lat: 30 + i * 0.7 }; },
    places,
  });
  const budget = listAfter(r.html, LINE.budget);
  assert.ok(budget && budget.length >= 2, 'the places refused by the 14-pin cap are not reported under the cap — the reader is told they could not be located');
  assert.deepEqual(budget, ['Place Number 14', 'Place Number 15']);
  assert.equal(listAfter(r.html, LINE.not_found), null, 'the cap was still described as a failure to locate');
  assert.match(r.html, /📍 14 places/, 'the 14 that fit are not reported as mapped');
});

test('R545 ②c: a lookup that never answered is reported as the lookup, not as the place', async () => {
  const r = await run({
    ledger: ledgerOf(),
    geocode: 'throw',
    nominatim: 'dead',
    places: [{ name: 'Ube Port', country: 'Japan', kind: 'port', summary: '' }],
  });
  assert.deepEqual(listAfter(r.html, LINE.infra), ['Ube Port'], 'an unreachable geocoder was reported as “couldn’t locate precisely”');
  assert.equal(listAfter(r.html, LINE.not_found), null);
});

test('R545 ②d: a verdict built the old way still prints the line it always printed', () => {
  const html = V._atlMappingNoteHtml({ mapped: [], unplaced: ['Ube Port'], ambiguous: [] }, null, {});
  assert.deepEqual(listAfter(html, LINE.not_found), ['Ube Port'],
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
