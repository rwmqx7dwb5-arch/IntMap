/* ============================================================================
 *  R737 — #R736's OWN LESSON, HAPPENING TO #R736's OWN FIX
 * ----------------------------------------------------------------------------
 *  #R736 found that `flyTo('Korean Peninsula')` answered 「Moved to: Korean Peninsula」 with `ok:true`
 *  and put the reader in Newport News, Virginia, and it put the repair on `placeExtent`'s resolver.
 *  Production verification the same day, on the deployed build: THE SAME CALL, THE SAME CHURCH.
 *
 *  The POINT resolver (`geocode` → `_pickNominatim`) has the #R515 name-agreement floor and nothing
 *  under it, and free-text Nominatim hands both endpoints the same eight strangers — measured here,
 *  live, on both URLs. So #R736 fixed one of the two functions that answer this question, which is
 *  precisely the shape (#R429 / #R488, and #R736 §2 itself) that round was written about.
 *
 *  ⇒ The rule is stated ONCE, beside the measure it extends (`_rankableFor`), and both resolvers ask
 *  it. These tests drive the SHIPPED js/atlas-geo-resolve.js over the captured responses with only
 *  `fetch` replaced, the way tests/r515-checks.test.mjs does — and they drive BOTH doors, because a
 *  test that drove one of them is how this round came to exist.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasGeoResolve } = await import('../js/atlas-geo-resolve.js');
const { NominatimGate } = await import('../js/nominatim-gate.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/r736-nominatim.json'), 'utf8')).queries;

function resolver() {
  return makeAtlasGeoResolve({ lang: 'en' }, {
    GE: () => ({ camera: { getCenter: () => ({ lng: 0, lat: 0 }) } }),
    L: (en) => en,
    _lnorm: (s) => String(s || '').toLowerCase().trim(),
    _setLast: (x) => x,
    lastPlace: () => null,
    _classBonus: () => 0,
    regionBox: () => null,
  });
}

async function overFixtures(fn) {
  const realFetch = globalThis.fetch;
  NominatimGate.configure({ gapMs: 0, reset: true });
  globalThis.fetch = async (url) => {
    const q = decodeURIComponent(String(url).split('&q=')[1] || '');
    if (!(q in FIX)) throw new Error('no recorded response for ' + q);
    return { ok: true, status: 200, text: async () => JSON.stringify(FIX[q]) };
  };
  try { return await fn(); } finally { globalThis.fetch = realFetch; NominatimGate.configure({ gapMs: 1100, reset: true }); }
}

test('R737 ①: BOTH doors refuse the stranger — the point resolver is the one that shipped broken', async () => {
  const R = resolver();
  await overFixtures(async () => {
    const point = await R.geocode('Korean Peninsula');
    assert.equal(point, null, `geocode resolved to ${point && point.name} — this is the door flyTo actually used in production`);
    const extent = await R.placeExtent('Korean Peninsula');
    assert.equal(extent, null, `placeExtent resolved to ${extent && extent.name}`);
  });
});

test('R737 ②: the honest answers are untouched — including a POI whose own name IS the query', async () => {
  const R = resolver();
  await overFixtures(async () => {
    /* real features, far above the floor, through both doors */
    assert.equal((await R.geocode('Chesapeake Bay')).name, 'Chesapeake Bay');
    assert.equal((await R.placeExtent('Mount Fuji')).name, 'Mount Fuji');
  });
  /* …and the exemption is CONTAINMENT, which is what keeps a low-importance POI answerable. Stated as
     a fact about the rule rather than about one place: the fixture holds no such row, and inventing
     one would be testing the fixture. */
  const SRC = readFileSync(join(ROOT, 'js/atlas-geo-resolve.js'), 'utf8').replace(/\r\n/g, '\n');
  const fn = (SRC.match(/function _rankableFor\(core,o\)\{[\s\S]*?return ag; \}/) || [])[0] || '';
  assert.ok(fn, 'the shared rule is gone');
  assert.match(fn, /ag<1/, 'the exemption is not containment — a low-importance POI named exactly as asked would be refused');
});

test('R737 ③: the rule is asked by both resolvers and written once', () => {
  const SRC = readFileSync(join(ROOT, 'js/atlas-geo-resolve.js'), 'utf8').replace(/\r\n/g, '\n');
  const bare = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  /* one definition … */
  assert.equal((bare.match(/function _rankableFor\(/g) || []).length, 1);
  /* … and exactly two readers: the point picker and the extent filter. A third would be a copy, and a
     first would be the state this round found. */
  assert.equal((bare.match(/_rankableFor\(/g) || []).length, 3, 'the shared rule has a reader it should not have, or has lost one');
  /* the floor it adds is a NUMBER WITH A NAME, so the measurement can be re-run against the fixture */
  assert.match(bare, /const IMPORTANCE_FLOOR=/);
});
