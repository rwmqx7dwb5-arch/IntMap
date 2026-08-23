/* ============================================================================
 *  R352 — the aircraft card credits the provider that actually supplied the aircraft
 * ----------------------------------------------------------------------------
 *  #R341's production verification opened ten aircraft cards on the deployed site. All ten
 *  credited `airplanes.live · ADS-B`. None of the aircraft came from that provider: #R341 had
 *  moved the live feed to adsb.lol, whose data is ODbL 1.0 — a licence that REQUIRES the source
 *  to be named — and had taught the hover tooltip to name it while leaving the card's literal
 *  where it was. An attribution obligation was being discharged onto a third party.
 *
 *  ⚠ THE SOURCE-LEVEL CHECK IS IN tests/r352-checks.test.mjs AND IT IS NOT THIS. That one proves
 *  the expression reads `p._srcLine`; this one proves the string a reader SEES. #R318 measured the
 *  gap between those two claims at its most expensive — a module that every source-level check and
 *  every one of 1,900 node checks passed, and that could not mount in a real browser at all.
 *
 *  ⚠ AND IT NEEDS NO FEED. This is the round's own spec, so scripts/tiers.mjs puts it in front of
 *  every push, and #R339 wrote down why nothing here may depend on a third party answering this
 *  minute: a gate that goes red because adsb.lol had a bad afternoon is a gate people learn to
 *  ignore. So the card is opened directly with a record this file supplies — which is also the
 *  only way to assert the FALLBACK, the branch a live feed can never reach.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

/* The two records: one carrying the line the layer computed, one shaped like the v1 rollback path
   (?aviation=v1), whose records have no _srcLine and whose provider really was airplanes.live. */
const WITH_SOURCE = {
  icao24: 'FFFFFE', callsign: 'FIXTURE1', reg: 'X-TEST', type: 'civilian',
  lng: 8.57, lat: 50.04, alt: 10000, hdg: 90, speed: 220,
  _srcLine: 'fixture-provider.example · ADS-B',
};
const NO_SOURCE = { ...WITH_SOURCE, icao24: 'FFFFFD', callsign: 'FIXTURE2', _srcLine: undefined };

test('R352 ① the card prints the source it was handed, and still credits one when handed none', async ({ app }) => {
  const page = app.page;

  /* The photo lookup leaves the card for planespotters.net. It is not this test's subject and a
     third party must not be able to change this result, so it is answered here. */
  await page.route('**/api.planespotters.net/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"photos":[]}' }));

  await page.evaluate(() => window.IntMapLazy.need('aircraftDetail'));

  const read = async (rec) => page.evaluate((r) => {
    const P = window.IntMapAircraftPanel;
    if (!P) throw new Error('window.IntMapAircraftPanel is missing — the card module did not publish');
    /* undefined does not survive the argument crossing, so the absent case is spelled by deleting */
    if (r._srcLine === null) delete r._srcLine;
    if (!P.open(r, {})) throw new Error('the card refused to open for ' + r.icao24);
    const el = document.querySelector('.acp-src');
    const text = el ? el.textContent : null;
    P.close();
    return text;
  }, { ...rec, _srcLine: rec._srcLine === undefined ? null : rec._srcLine });

  const given = await read(WITH_SOURCE);
  expect(given, '.acp-src is not in the card at all').not.toBeNull();
  expect(given).toContain('fixture-provider.example');
  /* the exact defect: a literal printed regardless of who answered */
  expect(given, 'the card is still printing a hard-coded provider name').not.toContain('airplanes.live');

  /* ⚠ AND THE FALLBACK MUST SURVIVE. Deleting the literal outright would satisfy the assertion
     above and leave the v1 rollback path — which really did use that provider — crediting nobody,
     which is the same licence problem pointing the other way. */
  const fallback = await read(NO_SOURCE);
  expect(fallback, 'a record with no source line leaves the credit line empty').toBeTruthy();
  expect(fallback.trim().length).toBeGreaterThan(3);
  expect(fallback).not.toContain('fixture-provider.example');
});

test('R352 ② the live layer reports the age of the ANSWER and the age of the OLDEST OBSERVATION separately', async ({ app }) => {
  const page = app.page;

  /* §22.2 requires source-observed time, IntMap-received time and client-rendered time to be
     distinguishable. `x-intmap-age-ms` used to be the snapshot's age on one channel and the oldest
     aircraft in the box on the other — production measured 12.7-13.5 s against 531-564 s, the same
     field, alternating. Both fields must EXIST here whether or not anything has answered yet;
     what the numbers are needs a feed, and that assertion lives in tests/r352-live.spec.js. */
  await page.evaluate(() => window.IntMapLazy.need('aviationLive'));

  const stats = await page.evaluate(() => {
    const A = window.IntMapAviation;
    if (!A || !A.stats) throw new Error('window.IntMapAviation.stats is missing');
    const s = A.stats();
    return { keys: Object.keys(s), server: s.serverAgeMs, oldest: s.oldestObservationMs };
  });

  expect(stats.keys, 'stats() no longer reports how old its answer is').toContain('serverAgeMs');
  expect(stats.keys,
    'stats() reports one age again — a reader cannot tell a fresh answer holding an old '
    + 'observation from a stale one').toContain('oldestObservationMs');
  expect(typeof stats.server).toBe('number');
  expect(typeof stats.oldest).toBe('number');
});
