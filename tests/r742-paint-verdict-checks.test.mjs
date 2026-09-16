/* ============================================================================
 *  R742 — THE SIX COUNTRIES WERE ON THE MAP AND THE VERDICT SAID
 *         「not_rendered」, UNTIL THE TURN DIED RE-PAINTING THEM
 * ----------------------------------------------------------------------------
 *  Measured on production (https://rwmqx7dwb5-arch.github.io/IntMap/), 2026-09-15, signed in:
 *
 *    「Which countries border Kazakhstan?」   highlight [FAIL/failed] → [FAIL/not_rendered]
 *                                            → [FAIL/not_rendered]      10 steps, 26.2 s
 *                                            …while the map had the six neighbours painted
 *                                            correctly from the first call.
 *    「シベリア鉄道の経路」                     railAxis [FAIL/not_rendered] ×5, 18 steps, 1m44s
 *    「地中海の最深点へ飛んでマークして」          the same pin at 36.5585, 21.1286 dropped SEVEN
 *                                            times, 22 steps, 2m14s, six pins on the map
 *
 *  Root cause: `paint.verify` decided「did this draw anything」by diffing the observation, and every
 *  value in the observation is a CARDINAL — feature counts, visible-layer counts, object counts, and
 *  (since #R736) the painter's own counts of highlighted countries, polygons, lines and shaded codes.
 *  A cardinal cannot tell a redraw from a failure, and it cannot tell a REPAIR from either: six
 *  countries repainted as six OTHER countries is 6 → 6. Second root cause: `meta.partial` returned
 *  `not_rendered` without reading the map at all, so thirteen shapes drawn and one target unresolved
 *  was reported as「nothing was drawn」.
 *
 *  ⚠ THIS IS #R740's SHAPE ON THE OTHER HALF OF THE SAME FILE. There the camera learned to ask「is
 *  the reader looking at what they asked for」instead of「did the camera move」; the generic paint
 *  verdict was left asking the movement question, and tests/r740 ⑦ wrote that down as deliberate.
 *
 *  ⚠ THESE TESTS DO NOT READ THE SOURCE (#R505). They build the SHIPPED registry
 *  (`makeAtlasCapabilities`) and the SHIPPED painter state (`makeEraHighlight().paintState`), wire
 *  them together the way js/atlas-console.js:364 does, and EVALUATE the observer/verifier pair
 *  against a stub renderer — because the defect was in what the verdict could SEE.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeEraHighlight } = await import('../js/atlas-era-highlight.js');

const CAPS = makeAtlasCapabilities({ lang: 'en' });
const hl = CAPS.resolve('map.highlight');

/* the seven sources `paintNow()` counts. They stay empty throughout: a country highlight adds a
   feature to NONE of them (it paints with `setFeatureState` on `nlq-src`), which is the whole
   reason the painter has to declare its own state. */
const SOURCES = ['nlq-poly-src', 'nlq-line-src', 'user-pins', 'nlq-poi-src', 'atl-compose-src',
  'shk-cont-src', 'nlq-fac-src'];

function renderer() {
  const empty = { type: 'FeatureCollection', features: [] };
  return {
    hasRenderer: () => true,
    layers: { sourceData: (id) => { if (SOURCES.indexOf(id) < 0) throw new Error('no such source: ' + id); return empty; } },
    scene: { getStyle: () => ({ layers: [{ id: 'nlq-fill' }, { id: 'ofm-country' }] }) },
    camera: { getCenter: () => ({ lng: 60, lat: 48 }), getZoom: () => 3, getBearing: () => 0, getPitch: () => 0 }
  };
}

/* the live values js/atlas-console.js:364 hands to `paintState`, in their real shapes:
   `_hl` a Set of ISO3, `_eraHl` names, `_hlPolys`/`_hlLines` objects with a `name`,
   `_choroState` code → normalised value, `_choroMetric` the measure being shaded. */
function supplier(s) {
  return {
    countries: () => new Set(s.countries || []),
    era: () => (s.era || []).slice(),
    polys: () => (s.polys || []).map((n) => ({ name: n, geo: {}, color: '#ff9500' })),
    lines: () => (s.lines || []).map((n) => ({ name: n, geo: {} })),
    choro: () => (s.choro || []).reduce((o, c, i) => { o[c] = (i + 1) / 10; return o; }, {}),
    metric: () => s.metric || null
  };
}

/* one observation of a map in state `s` — taken from the SHIPPED observer, with the SHIPPED painter
   declaration installed exactly where js/atlas-console.js installs it. */
function observe(s) {
  const hadP = window._imAtlasPaint, hadG = window.IntMapGeoEngine;
  window._imAtlasPaint = makeEraHighlight({ GE: () => window.IntMapGeoEngine, resolveCountrySync: () => null })
    .paintState(supplier(s));
  window.IntMapGeoEngine = renderer();
  try { return hl.observe(); }
  finally {
    if (hadP === undefined) delete window._imAtlasPaint; else window._imAtlasPaint = hadP;
    if (hadG === undefined) delete window.IntMapGeoEngine; else window.IntMapGeoEngine = hadG;
  }
}

/* THE DIFFERENTIAL. Before this round the painter declared counts and nothing else, so an
   observation had no `ids` at all — that reading, put through the SHIPPED verifier, reproduces the
   old verdict exactly (no declaration to hold against the map → nothing is claimed). It is the same
   device tests/r551 ④⑤ use: the old pair is kept runnable so the comparison cannot quietly stop. */
function asR741(o) { const a = Object.assign({}, o.atlas); delete a.ids; return Object.assign({}, o, { atlas: a }); }

const KAZ_NEIGHBOURS = ['CHN', 'KGZ', 'RUS', 'TKM', 'UZB', 'TJK'];
const SIX_OTHERS = ['DEU', 'FRA', 'ITA', 'ESP', 'POL', 'AUT'];
const painted = (d) => ({ ok: true, html: '<div>✦ …</div>', meta: { painted: d } });

test('R742 ⓪: map.highlight is on the generic paint verdict, and the painter declares who is painted', () => {
  assert.equal(hl.observerKind, 'paint', 'map.highlight moved off `paint` — this file lost its subject');
  const o = observe({ countries: KAZ_NEIGHBOURS, choro: [], polys: [], lines: [] });
  assert.equal(o.atlas.hlCountries, 6, 'the count #R736 added, still reported (tests/r736-atlas-multiprobe.spec.js reads it)');
  assert.deepEqual(o.atlas.ids.countries, KAZ_NEIGHBOURS.slice().sort(), 'and WHO, in a stable order');
  /* none of the counted sources holds it — a highlight is a feature-state paint, not a source */
  assert.equal(o.poly, 0);
  assert.equal(o.line, 0);
});

test('R742 ①: repainting the SAME six countries is completed, not `not_rendered`', () => {
  /* THE PRODUCTION FAILURE. Atlas was told three times that a correct map was not drawn. */
  const before = observe({ countries: KAZ_NEIGHBOURS });
  const after = observe({ countries: KAZ_NEIGHBOURS });
  assert.equal(JSON.stringify(before), JSON.stringify(after), 'this test is about a redraw: the map must not move');

  const v = hl.verify({}, { countries: KAZ_NEIGHBOURS }, before, after, painted({ countries: KAZ_NEIGHBOURS }));
  assert.equal(v.status, 'completed', `a redraw of the same six countries was called ${v.status}/${v.code}`);
  assert.equal(v.code, 'already_there', 'and it says WHY — the reader asked for a state and the state is there');
  assert.equal(v.observed.already, true);

  /* …and the verdict this replaces */
  const old = hl.verify({}, { countries: KAZ_NEIGHBOURS }, asR741(before), asR741(after), painted({ countries: KAZ_NEIGHBOURS }));
  assert.equal(old.code, 'not_rendered', 'the old reading had no identities, so it could only answer «nothing moved»');
});

test('R742 ②: repainting six countries as six OTHER countries is a change, though the count did not move', () => {
  const before = observe({ countries: KAZ_NEIGHBOURS });
  const after = observe({ countries: SIX_OTHERS });
  assert.equal(before.atlas.hlCountries, after.atlas.hlCountries,
    'the cardinals are identical — that is exactly why a count diff cannot see this repair');

  const v = hl.verify({}, { countries: SIX_OTHERS }, before, after, painted({ countries: SIX_OTHERS }));
  assert.equal(v.status, 'completed');
  assert.equal(v.code, 'ok', 'the map really did change, so this is not «already there»');

  const old = hl.verify({}, { countries: SIX_OTHERS }, asR741(before), asR741(after), painted({ countries: SIX_OTHERS }));
  assert.equal(old.code, 'not_rendered', 'and the correction used to read as the failure it was repairing');
});

test('R742 ③: a claim over a map that has nothing on it is still `not_rendered` — the refusal was not removed', () => {
  /* The declaration is READ, not trusted: a dispatch that says it painted six countries over a bare
     map gets the verdict the map supports. */
  const empty = observe({});
  const v = hl.verify({}, { countries: KAZ_NEIGHBOURS }, empty, observe({}), painted({ countries: KAZ_NEIGHBOURS }));
  assert.equal(v.status, 'partial');
  assert.equal(v.code, 'not_rendered');
  assert.deepEqual(v.produced, []);

  /* and half a declaration is not a pass either */
  const half = hl.verify({}, {}, observe({ countries: ['RUS'] }), observe({ countries: ['RUS'] }),
    painted({ countries: KAZ_NEIGHBOURS }));
  assert.equal(half.code, 'not_rendered', 'five of six missing is not the state the reader asked for');

  /* a failed dispatch is still failed */
  const f = hl.verify({}, {}, empty, empty, { ok: false, meta: { code: 'no_border_geometry' }, html: '' });
  assert.equal(f.status, 'failed');
  assert.equal(f.code, 'no_border_geometry');
});

test('R742 ④: some targets unresolved while the rest ARE on the map is completed, and the names survive', () => {
  /* Fourteen oblasts asked for, four painted, two never resolved: the map was read as「nothing was
     drawn」 before the map was read at all. `unresolved` has to reach Atlas either way — it is what
     the repair loop acts on (js/atlas-console.js `_mkExec`). */
  const drawn = ['RUS', 'KGZ', 'UZB', 'TKM'];
  const before = observe({ countries: drawn });
  const after = observe({ countries: drawn });
  const raw = { ok: true, html: '<div>…</div>', meta: { partial: true, painted: { countries: KAZ_NEIGHBOURS } },
    exec: { unresolved: [{ name: '', iso3: 'CHN', reason: 'no_border_geometry' }, { name: 'ないない国', iso3: 'TJK' }] } };

  const v = hl.verify({}, { countries: KAZ_NEIGHBOURS }, before, after, raw);
  assert.equal(v.status, 'completed', `four of six painted was called ${v.status}/${v.code}`);
  assert.equal(v.code, 'partially_resolved', 'and the code says which part failed — the targets, not the drawing');
  assert.equal(v.unresolved.length, 2, 'the repair loop still gets the names');
  assert.equal(v.unresolved[1].name, 'ないない国');
  assert.equal(v.observed.reach.have, 4);
  assert.equal(v.observed.reach.want, 6);

  /* nothing of it on the map at all → the refusal stands, names and all */
  const none = hl.verify({}, {}, observe({}), observe({}), raw);
  assert.equal(none.status, 'partial');
  assert.equal(none.code, 'not_rendered');
  assert.equal(none.unresolved.length, 2);

  const old = hl.verify({}, {}, asR741(before), asR741(after), raw);
  assert.equal(old.code, 'not_rendered', 'the old pair never looked at the map when `partial` was set');
});

test('R742 ⑤: nothing is guessed — no declaration, or one about a surface the reading does not hold', () => {
  const before = observe({ countries: KAZ_NEIGHBOURS });
  const after = observe({ countries: KAZ_NEIGHBOURS });
  assert.equal(hl.verify({}, {}, before, after, { ok: true, html: '' }).code, 'not_rendered',
    'a result that declares nothing must keep the verdict it always had');
  assert.equal(hl.verify({}, {}, before, after, painted({})).code, 'not_rendered', 'an empty declaration declares nothing');
  assert.equal(hl.verify({}, {}, before, after, painted({ reach: ['渋谷駅'] })).code, 'not_rendered',
    'a surface this observation does not hold is «could not observe», never «yes»');
  assert.equal(hl.verify({}, {}, before, after, painted({ countries: [''] })).code, 'not_rendered',
    'a nameless target has no identity to check');
});

test('R742 ⑥: the other painted surfaces are identified the same way, by the supplier\'s own key', () => {
  /* Not only countries: the same turn paints regions, rivers, era polities and a choropleth, and each
     one used to be a bare cardinal. The keys are `paintState`'s, which are the console's. */
  const s = { countries: ['KAZ'], era: ['大日本帝国'], polys: ['東海地方'], lines: ['Yenisei'], choro: ['JPN', 'USA'], metric: 'pop' };
  const o = observe(s);
  assert.deepEqual(o.atlas.ids, { countries: ['KAZ'], era: ['大日本帝国'], polys: ['東海地方'], lines: ['Yenisei'], choro: ['JPN', 'USA'] });
  const same = observe(s);
  assert.equal(hl.verify({}, {}, o, same, painted({ polys: ['東海地方'], lines: ['Yenisei'] })).code, 'already_there');
  assert.equal(hl.verify({}, {}, o, same, painted({ choro: ['JPN', 'USA'] })).code, 'already_there');
  assert.equal(hl.verify({}, {}, o, same, painted({ era: ['大日本帝国'], countries: ['KAZ'] })).code, 'already_there');
  assert.equal(hl.verify({}, {}, o, same, painted({ polys: ['関西地方'] })).code, 'not_rendered');
  /* re-shading the SAME countries by a different measure is still a change (#R736's `choroMetric`) */
  assert.equal(hl.verify({}, {}, o, observe(Object.assign({}, s, { metric: 'gdp' })), painted({ choro: ['JPN', 'USA'] })).code, 'ok');
});

test('R742 ⑦: an observation that could not be taken is not read as agreement', () => {
  const before = observe({ countries: KAZ_NEIGHBOURS });
  assert.equal(hl.verify({}, {}, before, null, painted({ countries: KAZ_NEIGHBOURS })).status, 'completed',
    'an unobservable map keeps the legacy verdict — unchanged from before this round');
  const half = hl.verify({}, {}, null, null,
    { ok: true, html: '', meta: { partial: true }, exec: { unresolved: ['x'] } });
  assert.equal(half.code, 'not_rendered', '…and an unobservable map with unresolved targets still refuses');
  assert.deepEqual(half.unresolved, ['x']);
});
