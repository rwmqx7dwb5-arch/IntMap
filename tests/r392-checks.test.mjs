/* ============================================================================
 *  IntMap · #R392 — the starter chips are about the VIEW, not about the country
 * ----------------------------------------------------------------------------
 *  「Atlasにはプリセットの送信文が用意されていますが、それは今地図で見ている地域に応じて用意して
 *    変えるようにして。（追記：まだほぼ定型文みたいなものしかない。もっとその場所にあったものに。）」
 *
 *  ⚠⚠⚠ THE SAME SENTENCE, A FOURTH TIME — SO THE GATE HAS TO MEASURE THE THING THE PREVIOUS THREE
 *  GATES COULD NOT SEE. #R313's check asked the FILE 「are there more than twenty candidates」, which
 *  a mail merge passes once it has twenty sentences. #R337's check fixed that by running the shipped
 *  chooser over a synthetic WORLD and comparing the four it returns for two different COUNTRIES —
 *  and that is exactly as far as it went, because the pool it was measuring could only ever answer
 *  per country. Every assertion in this file is about two different VIEWS, and most of them are two
 *  views of the SAME COUNTRY, which #R337's world could not express and #R337's pool could not
 *  distinguish.
 *
 *  ⚠ AND THE NAME IS MASKED BACK OUT BEFORE ANY COMPARISON (#R337's lesson, kept and widened). Two
 *  mail-merged copies of one sentence are never the same string, because each carries its own proper
 *  noun — so comparing rendered chips finds zero overlap between any two places and proves nothing.
 *  `mask()` below removes every noun this pool can substitute, so what is compared is the QUESTION.
 *
 *  ⚠ AND EVERY SOURCE READ GOES THROUGH `readLF()` (#R283, scripts/eol.mjs): this repository's js/
 *  is `i/lf w/crlf`, so a pattern spanning a line break is green in CI and red on Windows for a
 *  reason that has nothing to do with the property being asserted (#R317).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
const code = (p) => codeOnly(read(p));

const { makeAtlasExamples } = await import('../js/atlas-examples.js');
const { makeAtlasViewSubject } = await import('../js/atlas-view-subject.js');
/* ⚠ THE PURE HELPERS COME OFF A FACTORY INSTANCE, NOT OFF THE MODULE. `tests/r175-checks ③`
   requires a js/ module to have no unexported top-level declaration AND every export to be
   imported by name by another js/ module — a test is not js/, so exporting them for this file
   alone made all five DEAD EXPORTS. They ride on the returned object instead; none of them
   touches CTX, so a bare instance is enough to drive them. */
const PURE = makeAtlasViewSubject({});
const { waterKind, waterReachKm, pickWater, scaleOf } = PURE;

/* ══════════════════════════════════════════════════════════════════════════
   the synthetic map: two square countries side by side, one lake, one sea
   ═══════════════════════════════════════════════════════════════════════ */
const sq = (id, w, s, e, n) => ({ type: 'Feature', id: id,
  geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });
/* ALFA fills 0..10 E, BETA fills 10..20 E; everything north of 20N is sea */
const GEOFC = { type: 'FeatureCollection', features: [sq('ALF', 0, 0, 10, 20), sq('BET', 10, 0, 20, 20)] };
const STATS = {
  ALF: { code: 'ALF', nameEn: 'Alfa', sov: true, bbox: [0, 0, 10, 20], latlng: [10, 5],
         pop: 5e7, area: 5e5, density: 100, gdp: 500, gdppc: 10000, lifeExp: 75,
         internet: 60, hdi: 0.7, dem: 6, milSpend: 10, capital: 'Cap', subregion: 'Western Europe',
         currency: 'XXX', languages: 'One' },
  BET: { code: 'BET', nameEn: 'Beta', sov: true, bbox: [10, 0, 20, 20], latlng: [10, 15],
         pop: 5e7, area: 5e5, density: 100, gdp: 500, gdppc: 10000, lifeExp: 75,
         internet: 60, hdi: 0.7, dem: 6, milSpend: 10, capital: 'Cap', subregion: 'Western Europe',
         currency: 'XXX', languages: 'One' }
};
/* [lng, lat, z, en, jp, de, ru, es] — the shipped row shape */
const SEAS = [
  [5, 24, 2.5, 'Test Sea', 'テスト海', 'Testsee', 'Тестовое море', 'Mar de prueba'],
  [5, 5, 6, 'Lake Test', 'テスト湖', 'Testsee', 'Озеро Тест', 'Lago Test'],
  [-150, 0, 0.5, 'North Pacific Ocean', '北太平洋', 'Nordpazifik', 'Тихий океан', 'Pacífico Norte']
];

/* every chip the pool can substitute a proper noun into, taken back out */
const NOUNS = ['Alfa', 'Beta', 'Test Sea', 'Lake Test', 'North Pacific Ocean', 'Bigtown', 'Smallville',
               'Mt Test', 'Cap'];
const mask = (list) => list.map((s) => {
  let t = String(s);
  for (const n of NOUNS) t = t.split(n).join('{}');
  return t.replace(/\d+/g, '#');
});

/* ── the shipped chooser, with a whole fake map under it ─────────────────────────────────────
   ⚠ `querySourceFeatures` is what the module reads for what is named on the ground, so the fixture
   supplies it directly — the same door js/place-labels.js's own harvester uses. */
function chips(opts) {
  const o = opts || {};
  const box = o.box;                                   /* [w,s,e,n] the camera reports */
  const places = o.places || [];
  const peaks = o.peaks || [];
  const pd = globalThis.document, pw = globalThis.window;
  globalThis.document = {
    getElementById: (id) => (id === 'layer-dropdown' ? {
      querySelectorAll: () => (o.layers || []).map((l) => ({
        checked: true, id: l, type: 'checkbox', closest: () => null, parentElement: null }))
    } : null),
    addEventListener: () => {}
  };
  globalThis.window = {
    SEA_LABELS: o.seas === null ? null : (o.seas || SEAS),
    IntMapTime: { state: () => ({ isLive: true, year: null }) }
  };
  const GE = () => ({
    camera: {
      getCenter: () => ({ lng: (box[0] + box[2]) / 2, lat: (box[1] + box[3]) / 2 }),
      getZoom: () => (o.zoom == null ? 6 : o.zoom),
      getBounds: () => ({ getWest: () => box[0], getSouth: () => box[1],
                          getEast: () => box[2], getNorth: () => box[3] })
    },
    layers: { hasSource: (s) => s === 'ofm' && o.tiles !== false },
    coords: {
      querySourceFeatures: (src, p) => {
        if (src !== 'ofm') return [];
        const list = (p && p.sourceLayer === 'mountain_peak') ? peaks : places;
        return list.map((x) => ({
          properties: (p && p.sourceLayer === 'mountain_peak')
            ? { name: x.name, ele: x.ele }
            : { name: x.name, class: x.cls || 'city', rank: x.rank == null ? 1 : x.rank },
          geometry: { type: 'Point', coordinates: [x.lng, x.lat] }
        }));
      }
    }
  });
  try {
    const api = makeAtlasExamples({ lang: 'en' }, {
      L: (en) => en, GE: GE,
      codeAtPoint: (lng, lat) => {
        for (const f of GEOFC.features) {
          const r = f.geometry.coordinates[0];
          const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]);
          if (lng >= Math.min(...xs) && lng <= Math.max(...xs) &&
              lat >= Math.min(...ys) && lat <= Math.max(...ys)) return String(f.id);
        }
        return null;
      },
      countryStats: STATS, cName: (st) => st.nameEn,
      loadCountryData: () => Promise.resolve(), geo: () => GEOFC,
      panelEl: () => null, pick: () => {}
    });
    return o.point
      ? api.pointExamples(o.point[0], o.point[1], o.point[2] || 6, o.point[3] || 3)
      : api.examples();
  } finally { globalThis.document = pd; globalThis.window = pw; }
}

/* the redraw signature for one view, straight from the shipped module — no DOM, no chips */
function viewKeyFor(box, zoom, places) {
  const pw = globalThis.window;
  globalThis.window = { SEA_LABELS: SEAS };
  try {
    const V = makeAtlasViewSubject({
      GE: () => ({
        camera: {
          getCenter: () => ({ lng: (box[0] + box[2]) / 2, lat: (box[1] + box[3]) / 2 }),
          getZoom: () => zoom,
          getBounds: () => ({ getWest: () => box[0], getSouth: () => box[1],
                              getEast: () => box[2], getNorth: () => box[3] })
        },
        layers: { hasSource: () => true },
        coords: { querySourceFeatures: (s, p) => ((p && p.sourceLayer === 'place') ? (places || []) : [])
          .map((x) => ({ properties: { name: x.name, class: 'city', rank: 1 },
                         geometry: { type: 'Point', coordinates: [x.lng, x.lat] } })) }
      }),
      geo: () => GEOFC, countryStats: STATS, cName: (st) => st.nameEn, lang: () => 'en'
    });
    return V.viewKey(V.subject());
  } finally { globalThis.window = pw; }
}

/* ══════════════════════════════════════════════════════════════════════════
   ① THE REPORT ITSELF: two views of ONE country are not handed the same questions
   ═══════════════════════════════════════════════════════════════════════ */
test('R392 ① two different views of the SAME country are not asked the same four questions', () => {
  /* both of these are 「Alfa」 — the same country, the same `codeAtPoint`, the same everything the
     first three rounds could see. A city view over a town, and a wide view of empty countryside. */
  const town = mask(chips({ box: [4.9, 9.9, 5.1, 10.1], zoom: 11,
    places: [{ name: 'Bigtown', lng: 5, lat: 10, cls: 'city' }] }));
  /* ⚠ THE TILES HAVE ARRIVED AND NAME NOTHING INSIDE THE FRAME, which is not the same fixture as
     「the cache is empty」 — see ④. `Faraway` sits in the loaded tiles but outside the box. */
  const empty = mask(chips({ box: [1, 1, 9, 9], zoom: 5,
    places: [{ name: 'Faraway', lng: 19, lat: 19, cls: 'city' }] }));

  assert.equal(town.length, 4, 'a full row either way');
  assert.equal(empty.length, 4);
  const shared = town.filter((q) => empty.includes(q));
  assert.ok(shared.length < 4,
    'ONE country must not produce one fixed row of four — this is the whole report:\n' +
    '  town : ' + JSON.stringify(town) + '\n  empty: ' + JSON.stringify(empty));
  /* …and specifically, the close view must ask about the thing that is ON it */
  assert.ok(town.some((q) => q.includes('{}') && /built on|part of it/.test(q)),
    'the city view asks about the city: ' + JSON.stringify(town));
  assert.ok(empty.some((q) => /not one named settlement/.test(q)),
    'the empty view says so, because it measured it: ' + JSON.stringify(empty));
});

test('R392 ① the redraw guard names the view, so panning inside one country actually redraws', () => {
  /* #R309 shipped this as a feature: 「a pan that stays inside one country costs one `codeAtPoint`
     and redraws nothing」 — so a reader who flew from Tokyo to Wakkanai kept Tokyo's chips.
     ⚠⚠⚠ THE FIRST VERSION OF THIS CHECK COULD NOT GO RED, AND THAT IS WORTH RECORDING. It asserted
     that the SOURCE of `exKey` mentioned `VIEW.viewKey(f.vw)`, and then asserted that two views
     produce different CHIPS. Deleting the concatenation that actually puts the view into the key —
     the whole defect — left the declaration in place and left the chips different (they come from
     `examples()`, which never reads the key), so the mutation stayed green. Measured, by doing it.
     The key itself is what has to be compared, so the exported `viewKey` is driven directly. */
  const a = viewKeyFor([0.5, 0.5, 2.5, 2.5], 9, [{ name: 'Bigtown', lng: 1.5, lat: 1.5 }]);
  const b = viewKeyFor([7.5, 17.5, 9.5, 19.5], 9, [{ name: 'Smallville', lng: 8.5, lat: 18.5 }]);
  const c = viewKeyFor([0.5, 0.5, 2.5, 2.5], 9, [{ name: 'Bigtown', lng: 1.5, lat: 1.5 }]);
  assert.notEqual(a, b, 'two corners of ONE country must not share a redraw signature');
  assert.equal(a, c, '…and the same view must, or every pan repaints');

  /* zooming without moving is also a different subject — #R309's key held no zoom either */
  const wide = viewKeyFor([0, 0, 10, 20], 4, []);
  const tight = viewKeyFor([4.9, 9.9, 5.1, 10.1], 12, []);
  assert.notEqual(wide, tight, 'the whole country and one city block are not the same subject');

  /* ⚠⚠⚠ AND POSITION ALONE HAS TO MOVE THE KEY. Measured, by mutation: deleting the coordinates
     from `viewKey` left this check green, because the two views above ALSO differ in the city the
     tiles name and in the scale band — so the key changed for reasons that were not the position.
     These two are the same size, the same country, the same (empty) tiles and the same distance
     from every water body, so POSITION is the only thing left that can separate them. */
  const west = viewKeyFor([1, 9, 3, 11], 8, []);
  const east = viewKeyFor([7, 9, 9, 11], 8, []);
  /* both are 221 km across, both lie wholly inside Alfa, both have empty tiles, and both resolve to
     the SAME water body — asserted here, because the first pair chosen for this check happened to
     differ in the water as well and would have masked the mutation a second time */
  assert.equal(west.split('|').slice(2).join('|'), east.split('|').slice(2).join('|'),
    'the fixture really does hold everything but the position equal');
  assert.notEqual(west, east,
    'two same-sized views of the same country differ only in where they are — and that must count');

  /* and the concatenation is pinned, not just the declaration — this is the line the mutation cut */
  const src = code('js/atlas-examples.js');
  assert.match(src, /VIEW\.viewKey\(f\.vw\)/, 'exKey asks the view module for a signature');
  assert.match(src, /f\.layers\.map\(x=>x\.id\)\.sort\(\)\.join\(','\)\+'\|'\+vk/,
    '…and actually concatenates it into the key it returns');

  const two = chips({ box: [0.5, 0.5, 2.5, 2.5], zoom: 9, places: [{ name: 'Bigtown', lng: 1.5, lat: 1.5 }] });
  const far = chips({ box: [7.5, 17.5, 9.5, 19.5], zoom: 9, places: [{ name: 'Smallville', lng: 8.5, lat: 18.5 }] });
  assert.notDeepEqual(two, far, 'two corners of one country are two different subjects');
});

/* ══════════════════════════════════════════════════════════════════════════
   ② facts that only a VIEW has — a border, a coast, open water
   ═══════════════════════════════════════════════════════════════════════ */
test('R392 ② a view holding two countries is asked about the border, which no country-level fact can be', () => {
  const both = chips({ box: [8, 5, 12, 9], zoom: 8 });
  assert.ok(both.some((q) => /border between Alfa and Beta|border between Beta and Alfa/.test(q)),
    'both countries are named, ordered by how much of the frame each holds: ' + JSON.stringify(both));
  /* one country in frame must NOT get it */
  const one = chips({ box: [1, 5, 5, 9], zoom: 8 });
  assert.ok(!one.some((q) => /border between/.test(q)), 'and a view inside one country does not');
});

test('R392 ② open water is asked about the water, not handed the generic world row', () => {
  /* north of 20N there is no land at all, so `codeAtPoint` returns null — the case that used to
     fall through to #R309's four fixed world sentences for every ocean on the planet */
  const sea = chips({ box: [3, 25, 7, 35], zoom: 5 });
  assert.ok(sea.some((q) => /Test Sea/.test(q)),
    'the named water this view is about reaches the chips: ' + JSON.stringify(sea));
  /* ⚠ THE CLAIM IS ABOUT THE MAJORITY OF THE ROW, NOT ABOUT THE ABSENCE OF THE TAIL. The first
     version of this check asserted that no generic world sentence appeared at all, and failed for a
     reason worth keeping: with no layers switched on, the synthetic world has nothing else to say,
     and #R309's four world questions are REAL questions whose nine translations are live — they are
     the floor, exactly as the country tail is (#R337). What must not happen is one specific chip in
     a row of four generic ones, which is what shipped before this round. */
  const specific = sea.filter((q) => /Test Sea|no land anywhere/.test(q));
  assert.ok(specific.length >= 2,
    'at least half the row is about this water, not about the world: ' + JSON.stringify(sea));
});

test('R392 ② a coast is a fact about the frame — half land, half named water', () => {
  const coast = chips({ box: [3, 15, 7, 25], zoom: 6 });
  assert.ok(coast.some((q) => /where Alfa meets Test Sea/.test(q)),
    'the coast chip names both sides: ' + JSON.stringify(coast));
});

/* ══════════════════════════════════════════════════════════════════════════
   ③ THE GAZETTEER IS 120 SHIPPED ROWS AND 33 OF THEM ARE FRESH WATER
   ═══════════════════════════════════════════════════════════════════════ */
test('R392 ③ every row of the shipped sea gazetteer classifies, and no lake is called marine', () => {
  const src = read('js/tables.js');
  const m = /window\.SEA_LABELS=\[([\s\S]*?)\n\];/.exec(src);
  assert.ok(m, 'the gazetteer is where this check thinks it is');
  const rows = [...m[1].matchAll(/\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*([\d.]+)\s*,\s*'([^']+)'/g)]
    .map((x) => ({ lng: +x[1], lat: +x[2], z: +x[3], en: x[4] }));
  assert.ok(rows.length >= 100, 'read the whole table, not a slice — got ' + rows.length);

  /* ⚠ 「other」 IS A REAL ANSWER AND IS ALLOWED, because the pool asks nothing of it. What must not
     happen is a lake being asked who patrols it or how deep the shipping lane is. */
  const lakes = rows.filter((r) => /\b(?:Lake|Reservoir)\b/i.test(r.en));
  assert.ok(lakes.length >= 30, 'the table really does carry the fresh water — ' + lakes.length);
  for (const r of lakes) {
    assert.equal(waterKind(r.en), 'lake',
      r.en + ' is fresh water and must not be classified as an ocean, sea, gulf or narrows');
  }
  /* …and the seven oceans are oceans */
  const oceans = rows.filter((r) => /\bOcean\b/.test(r.en));
  assert.ok(oceans.length >= 5);
  for (const r of oceans) assert.equal(waterKind(r.en), 'ocean', r.en);

  /* the Caspian and the Aral are named 「Sea」 and are lakes — DELIBERATELY on the marine side,
     because every question the pool asks of a sea is true of them. Pinned so the choice is a
     decision and not an accident. */
  const casp = rows.find((r) => /Caspian/.test(r.en));
  if (casp) assert.equal(waterKind(casp.en), 'sea', 'the Caspian stays marine on purpose');
});

test('R392 ③ a chokepoint is recognised from the curated table, never by matching its name', () => {
  /* ⚠ THE GAZETTEER HOLDS NO FAMOUS STRAIT — its only two 「Strait」 rows are Bass and Davis. A chip
     that recognised a chokepoint by string-matching 「Strait」 would therefore fire for two obscure
     passages and stay silent over every one that matters. This is pinned so that a future round
     which adds Hormuz to the gazetteer has to revisit the candidates rather than discover the gap
     by accident. */
  const tbl = read('js/tables.js');
  for (const nm of ['Hormuz', 'Malacca', 'Gibraltar', 'Bosphorus', 'Dover']) {
    assert.ok(!new RegExp(nm).test(tbl),
      nm + ' is now in the sea gazetteer — the water candidates were written on the fact that it ' +
      'was not, so they must be revisited rather than left to fire by accident');
  }
  /* the chokepoints reach the chips through the CURATED table instead, which really does hold them */
  const ref = read('js/reference-data.js');
  for (const nm of ['Hormuz', 'Malacca', 'Bosphorus']) {
    assert.ok(new RegExp(nm).test(ref), nm + ' is the source the `vchoke` candidate is gated on');
  }
  assert.match(ref, /type:'choke'|,'choke',/, 'and it is gated on the TYPE, which is what the table grades');

  /* …and no candidate anywhere recognises a water body by its name */
  const pool = code('js/atlas-examples.js');
  assert.ok(!/'[^']*\bStrait\b[^']*'/.test(pool), 'no candidate recognises a strait by its name');
  for (const nm of ['Hormuz', 'Malacca', 'Gibraltar', 'Bosphorus']) {
    assert.ok(!new RegExp(nm).test(pool), 'and no candidate hard-codes ' + nm);
  }
});

test('R392 ③ the strategic-site chips substitute no name, because that table has two languages of nine', () => {
  /* #R313 追記 removed a chip's proper noun for exactly this reason: `CAPITAL` is English-only, so a
     translated sentence carried an untranslated value. `dashCards` carries `title:{en,jp}` — the
     same trap, and the same answer. The question is gated on the card's TYPE and interpolates
     nothing, which is what keeps all nine languages real. */
  const src = code('js/atlas-examples.js');
  const vSect = src.slice(src.indexOf('const V=['), src.indexOf('const P=['));
  /* each candidate runs from its own `k:` to the next one — the object literals end `') },` and a
     brace-counting regex over them is exactly the kind of pattern that silently matches nothing */
  const keys = ['vchoke', 'vspace', 'venergy', 'vtech', 'vport', 'vmil'];
  let found = 0;
  for (const k of keys) {
    const i = vSect.indexOf("k:'" + k + "'");
    assert.ok(i >= 0, k + ' is shipped');
    const rest = vSect.slice(i + 4);
    const j = rest.indexOf("{ k:'");
    const body = j >= 0 ? rest.slice(0, j) : rest;
    assert.ok(!/\{[a-z]+\}/.test(body),
      k + ' interpolates nothing — it would be an English noun in eight other languages: ' +
      (/\{[a-z]+\}/.exec(body) || [''])[0]);
    found++;
  }
  assert.equal(found, 6, 'all six site candidates measured');
  /* and the module reads the card's `type`, not its `title` */
  const vs = code('js/atlas-view-subject.js');
  assert.match(vs, /r\.type/, 'the type is what is read');
  assert.ok(!/\.title\b/.test(vs), 'the two-language title is never read');
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ the measurements refuse rather than guess
   ═══════════════════════════════════════════════════════════════════════ */
test('R392 ④ a water body too small for the view is refused, not named', () => {
  /* Lake Test is z=6 → a reach of ~313 km. A view 2,000 km across must not be told it is about
     a lake it happens to contain. */
  const near = pickWater([{ lng: 0, lat: 0, z: 6, en: 'Lake Test', name: 'Lake Test' }],
    { lng: 0, lat: 0 }, 30);
  assert.ok(near && near.name === 'Lake Test', 'a 30 km view of the lake IS about the lake');
  /* ⚠ AND SAYING NOTHING IS THE RIGHT ANSWER. The first version of this check asserted that the
     lone row came back anyway 「rather than a crash」, which contradicted this test's own title: a
     9,000 km view is not about a 313 km pond, and the honest answer is no water at all. */
  const far = pickWater([{ lng: 0, lat: 0, z: 6, en: 'Lake Test', name: 'Lake Test' }],
    { lng: 0, lat: 0 }, 9000);
  assert.equal(far, null, 'a planetary view is told about no water rather than about a pond');
  const both = pickWater([{ lng: 0, lat: 0, z: 6, en: 'Lake Test', name: 'Lake Test' },
                          { lng: 20, lat: 0, z: 0.5, en: 'North Pacific Ocean', name: 'North Pacific Ocean' }],
    { lng: 0, lat: 0 }, 9000);
  assert.equal(both.kind, 'ocean', 'a 9,000 km view is about the ocean, not the pond inside it');

  /* ⚠⚠⚠ THE DEFECT THIS RULE EXISTS TO REMOVE, PINNED. Measured in a real browser: Shibuya at
     z=14 — a view about 2 km across — was told 「Lake Kasumigaura: what lives in it…」, a lake 60 km
     outside the frame, because the lake's OWN reach (156 km) covered the distance and it was the
     most specific row in range. Reach answers 「is it big enough」; it never answers 「is it here」. */
  const kasumi = pickWater([{ lng: 140.4, lat: 36.0, z: 7, en: 'Lake Kasumigaura', name: 'Lake Kasumigaura' }],
    { lng: 139.700, lat: 35.659 }, 2);
  assert.equal(kasumi, null, 'a lake 60 km away is not what a 2 km view is about');

  /* …and the other direction, also measured: the tropical Pacific was told 「Arctic Ocean」, because
     the Arctic's reach is SMALLER than the North Pacific's and both covered the distance. Nearest
     has to win, not most specific. */
  /* ⚠ AND AN OCEAN ANSWERS FROM WELL INSIDE ITS OWN BODY. A row is ONE label point, and the
     Pacific's sits 2,600 km from a click on the open Pacific — measured, that click was told about
     no water at all and fell back to the generic world row. A quarter of the row's own reach is
     7,084 km for the Pacific and 39 km for Lake Kasumigaura, so this admits the ocean without
     re-admitting the lake. */
  const openSea = pickWater([
    { lng: -160, lat: 32, z: 0.5, en: 'North Pacific Ocean', name: 'North Pacific Ocean' }
  ], { lng: -150, lat: 10 }, 150);
  assert.ok(openSea && openSea.kind === 'ocean',
    'a click on open ocean names the ocean it is on, not nothing');
  /* …and the lake is still refused at the size the defect was measured at. ⚠ THE VIEW SIZE IS PART
     OF THE CLAIM: at 150 km a lake 60 km from the centre really IS in frame and should be named —
     the first draft of this check asserted otherwise and was simply wrong. Shibuya at z=14 is 2 km
     across, and that is where naming Kasumigaura was absurd. */
  const stillNoLake = pickWater([
    { lng: 140.4, lat: 36.0, z: 7, en: 'Lake Kasumigaura', name: 'Lake Kasumigaura' }
  ], { lng: 139.700, lat: 35.659 }, 2);
  assert.equal(stillNoLake, null, '…and the 60 km lake is still refused by a 2 km view');
  const nearLake = pickWater([
    { lng: 140.4, lat: 36.0, z: 7, en: 'Lake Kasumigaura', name: 'Lake Kasumigaura' }
  ], { lng: 139.700, lat: 35.659 }, 150);
  assert.ok(nearLake && nearLake.kind === 'lake', '…while a 150 km view that contains it does name it');

  /* ⚠⚠⚠ TWO ROWS INSIDE THE SAME FRAME MUST STILL BE ORDERED BY DISTANCE. Measured on production:
     the whole of Japan at z=5 was told 「This is where Japan meets East China Sea」. Both the Sea of
     Japan (452 km from that centre) and the East China Sea (1,501 km) have their label points inside
     that frame; the first version scored every in-frame row as `d = 0`, both are rank z=3 so the
     reach tie-break was equal too, and the winner was whichever js/tables.js listed first.
     ⚠ THE ASSERTION IS ORDER-INDEPENDENT ON PURPOSE — a check that passes only for one array order
     is measuring the fixture, not the rule. */
  const JP_BOX = { w: 122.2, s: 27.1, e: 153.8, n: 46.9, lng: 138, lat: 37, spanKm: 2807 };
  const JP_ROWS = [
    { lng: 134.5, lat: 40, z: 3, en: 'Sea of Japan', name: 'Sea of Japan' },
    { lng: 125, lat: 29, z: 3, en: 'East China Sea', name: 'East China Sea' }
  ];
  for (const rows of [JP_ROWS, JP_ROWS.slice().reverse()]) {
    const hit = pickWater(rows, { lng: 138, lat: 37 }, 2807, JP_BOX);
    assert.equal(hit && hit.name, 'Sea of Japan',
      'the nearer of two in-frame seas wins, whatever order the gazetteer lists them in');
  }
  /* …and a row INSIDE the frame outranks a NEARER one outside it, because the chip says 「this view
     is about {water}」 and a body that is not on screen is not what the view is about. The centre
     sits at the frame's eastern edge so the two pull in opposite directions: `Offscreen Sea` is
     530 km away but outside the box, `Onscreen Sea` is 2,500 km away but inside it. */
  const inBeatsOut = pickWater([
    { lng: 156, lat: 37, z: 3, en: 'Offscreen Sea', name: 'Offscreen Sea' },
    { lng: 123, lat: 30, z: 3, en: 'Onscreen Sea', name: 'Onscreen Sea' }
  ], { lng: 150, lat: 37 }, 2807, JP_BOX);
  assert.equal(inBeatsOut && inBeatsOut.name, 'Onscreen Sea',
    'a row inside the frame outranks a nearer one outside it');

  const pac = pickWater([
    { lng: -160, lat: 32, z: 0.5, en: 'North Pacific Ocean', name: 'North Pacific Ocean' },
    { lng: 0, lat: 85, z: 0.8, en: 'Arctic Ocean', name: 'Arctic Ocean' }
  ], { lng: -150, lat: 10 }, 6900);
  assert.equal(pac.name, 'North Pacific Ocean', 'the water a view is on beats the water merely in range');

  /* the reach really is derived from the table's own rank and not typed */
  assert.ok(waterReachKm(0.5) > waterReachKm(2.5), 'an ocean reaches further than a sea');
  assert.ok(waterReachKm(2.5) > waterReachKm(7), '…and a sea further than a pond');
});

test('R392 ④ the register is measured in kilometres, not read off the zoom number', () => {
  assert.equal(scaleOf(9000), 'world');
  assert.equal(scaleOf(2000), 'continent');
  assert.equal(scaleOf(600), 'country');
  assert.equal(scaleOf(120), 'region');
  assert.equal(scaleOf(30), 'city');
  assert.equal(scaleOf(3), 'street');
  /* ⚠ a zoom level is a different WIDTH at the equator and at 70°N, and the reader is looking at a
     width — so the source must not band on the zoom number */
  const src = code('js/atlas-view-subject.js');
  assert.match(src, /function scaleOf\(spanKm\)/, 'the register takes kilometres');
});

test('R392 ④ the tiles are a cache, so "nothing is named here" is only said when the tiles answered', () => {
  /* with no source at all, the empty-view chip must NOT fire — otherwise every slow network tells a
     reader looking at a city that nobody lives there */
  const cold = chips({ box: [1, 1, 9, 9], zoom: 5, places: [], tiles: false });
  assert.ok(!cold.some((q) => /not one named settlement/.test(q)),
    'an unanswered tile cache is not an empty landscape: ' + JSON.stringify(cold));

  /* ⚠⚠⚠ AND THE SOURCE BEING PRESENT IS NOT ENOUGH EITHER — this is the case that was shipped wrong
     and caught in a real browser. Four seconds after jumping to Shibuya, `querySourceFeatures`
     returned ZERO features; four seconds later it returned 1,437. The flag said 「the tiles
     answered」 both times, so 「there is not one named settlement in this view」 was one redraw away
     from firing over central Tokyo. An empty return is 「not known」, not 「nothing there」. */
  const loading = chips({ box: [1, 1, 9, 9], zoom: 5, places: [] });
  assert.ok(!loading.some((q) => /not one named settlement/.test(q)),
    'a source that returned nothing at all has not answered yet: ' + JSON.stringify(loading));

  /* …and when the tiles really have arrived — features exist, just none inside the frame — it does */
  const warm = chips({ box: [1, 1, 9, 9], zoom: 5,
    places: [{ name: 'Faraway', lng: 19, lat: 19, cls: 'city' }] });
  assert.ok(warm.some((q) => /not one named settlement/.test(q)),
    'features outside the box still prove the tiles arrived: ' + JSON.stringify(warm));
});

test('R392 ④ a peak with no stated elevation is refused rather than printed empty', () => {
  const withEle = chips({ box: [4.9, 9.9, 5.1, 10.1], zoom: 11,
    peaks: [{ name: 'Mt Test', lng: 5, lat: 10, ele: 3200 }] });
  assert.ok(withEle.some((q) => /Mt Test rises 3200 m/.test(q)), JSON.stringify(withEle));
  const noEle = chips({ box: [4.9, 9.9, 5.1, 10.1], zoom: 11,
    peaks: [{ name: 'Mt Test', lng: 5, lat: 10, ele: null }] });
  assert.ok(!noEle.some((q) => /Mt Test rises/.test(q)),
    'a peak whose row states no height says nothing about its height: ' + JSON.stringify(noEle));
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ the OTHER preset row — clicking a point
   ═══════════════════════════════════════════════════════════════════════ */
test('R392 ⑤ two different clicks do not open with the same three sentences', () => {
  const inland = chips({ box: [1, 1, 9, 9], zoom: 6, point: [5, 5, 9, 3],
    places: [{ name: 'Bigtown', lng: 5, lat: 5, cls: 'city' }] });
  const atSea = chips({ box: [1, 1, 9, 9], zoom: 6, point: [5, 30, 5, 3] });
  assert.equal(inland.length, 3, 'still three');
  assert.equal(atSea.length, 3);
  assert.notDeepEqual(mask(inland), mask(atSea),
    'a click on a town and a click on open sea are different questions:\n' +
    '  inland: ' + JSON.stringify(inland) + '\n  sea   : ' + JSON.stringify(atSea));
});

test('R392 ⑤ the three original sentences survive as the tail and still fill a row about nothing', () => {
  /* a click on a patch the app knows nothing about must still offer three real questions —
     #R337's rule that the tail is never deleted, one row down */
  const bare = chips({ box: [1, 1, 9, 9], zoom: 6, point: [5, 5, 6, 3], seas: null, tiles: false });
  assert.equal(bare.length, 3);
  assert.ok(bare.some((q) => /Why is this area the way it is\?/.test(q)),
    '#R309\'s three are the floor, not the ceiling: ' + JSON.stringify(bare));

  /* …and they are the TAIL: a click somewhere the app knows about must displace at least one */
  const known = chips({ box: [1, 1, 9, 9], zoom: 6, point: [5, 30, 5, 3] });
  assert.ok(!known.every((q) => /Why is this area|What is important about|happening here recently/.test(q)),
    'a spot the app knows something about is not offered three generic sentences: ' + JSON.stringify(known));
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑥ the source-level promises the behaviour above rests on
   ═══════════════════════════════════════════════════════════════════════ */
test('R392 ⑥ the view module reads what is already in memory and fetches nothing', () => {
  const src = code('js/atlas-view-subject.js');
  assert.ok(!/\bfetch\s*\(/.test(src), 'no network on the chip path');
  assert.ok(!/import\s*\(/.test(src), 'and no dynamic import either');
  /* the ground truth comes from the SOURCE, not from what happens to be rendered — a reader who
     switched labels off is still looking at Osaka */
  assert.match(src, /querySourceFeatures/, 'the tiles are read through the source');
  assert.ok(!/queryRenderedFeatures/.test(src),
    'rendered features would make the chips depend on the label checkboxes');
  /* and the bounds object is unpacked the way both engines expose it (js/atlas-state.js does the
     same): `getSouthWest` exists on MapLibre's and not on the Cesium adapter's stand-in */
  assert.match(src, /getWest\s*===\s*'function'|typeof b\.getWest/, 'bounds unpacked by edge, not corner');
  assert.ok(!/getSouthWest|getNorthEast/.test(src), 'no corner accessor that only one engine has');

  /* ⚠⚠⚠ THE WATER'S NAME COMES THROUGH `pick().arr()`, NOT THROUGH A COLUMN MAP. The first version
     of this module indexed the gazetteer's five positional columns with `{en:3, jp:4, de:5, ru:6,
     es:7}`. `npm run check:i18n` refuses that shape — 「a translation tuple held as data instead of
     as a call」 — and the refusal is the point: a hand-written map reaches FIVE languages, so fr,
     ko, zh-Hant and zh-Hans readers would have been given the ENGLISH name of the sea inside a
     translated sentence. js/place-labels.js resolves these very rows the same way. */
  assert.match(src, /IntMapLang\.pick\(/, 'the row is resolved through the language kernel');
  assert.match(src, /L\.arr\(\[r\[3\], r\[4\], r\[5\], r\[6\], r\[7\]\]\)/, '…across all five columns');
  assert.ok(!/\{\s*en:\s*3\s*,/.test(src), 'and never through a hand-written column map again');
  /* …while the KIND still reads the English spelling, which is what `waterKind` is written against */
  assert.match(src, /en:\s*r\[3\]/, 'the English column is carried separately for the classifier');
});

test('R392 ⑥ one redraw measures the view once, not twice', () => {
  /* ⚠ `renderExamples` computes the facts for the redraw guard and then hands them to `examples()`.
     It used to call `exFacts()` twice, which was free while the facts were one `codeAtPoint` and is
     not free now: each sweep is 36 point-in-polygon samples plus two tile scans, and this round also
     put a redraw on `idle`, which fires far more often than `moveend`. */
  const src = code('js/atlas-examples.js');
  const body = src.slice(src.indexOf('function renderExamples'), src.indexOf('let _exWired'));
  assert.equal((body.match(/exFacts\(\)/g) || []).length, 1,
    'the redraw measures the view exactly once');
  assert.match(body, /examples\(f\)/, '…and passes what it measured to the chooser');
  /* the published no-argument contract still works — it is what #R337's checks drive */
  assert.match(src, /function examples\(pre\)/, 'the argument is optional');
  const four = chips({ box: [1, 1, 9, 9], zoom: 5,
    places: [{ name: 'Faraway', lng: 19, lat: 19, cls: 'city' }] });
  assert.equal(four.length, 4, 'examples() with no argument still answers');
});

test('R392 ⑥ the place and peak names come from the same key order the map’s own labels use', () => {
  /* MEASURED in a real browser: reading `p.name` produced chips that said 「Tanger ⵟⴰⵏⵊⴰ طنجة」,
     「خصب」 and 「珠穆朗玛峰 ཇོ་མོ་གླང་མ། सगरमाथा」 — three scripts in one label for a reader who asked for
     English. js/place-labels.js publishes the key order its label layers use; asking the same
     question gets the same answer, and turned those into Tangier, Khasab and Mount Everest. */
  const src = code('js/atlas-view-subject.js');
  assert.match(src, /IntMapOsmNameKeys/, 'the published key order is what resolves a tile name');
  assert.match(src, /nameOf\(p\)/, '…through one helper, used for both settlements and peaks');
  /* the raw local name is the LAST resort, not the first */
  const i = src.indexOf('const nameOf');
  const body = src.slice(i, src.indexOf('};', i));
  assert.ok(body.lastIndexOf('p.name ?') > body.indexOf('IntMapOsmNameKeys'),
    'p.name is the fallback, not the first choice');
});

test('R392 ⑥ the view pool outranks the country pool, and does not delete it', () => {
  const src = code('js/atlas-examples.js');
  /* the country pool is still there in full */
  for (const k of ['dense', 'empty', 'vast', 'micro', 'capital', 'subregion', 'latest', 'wx']) {
    assert.ok(new RegExp("k:'" + k + "'").test(src), "#R313/#R337's `" + k + "` candidate is still shipped");
  }
  /* …and every view candidate outweighs every country candidate */
  const grab = (re) => [...src.matchAll(re)].map((m) => +m[1]);
  const vSect = src.slice(src.indexOf('const V=['), src.indexOf('const P=['));
  const pSect = src.slice(src.indexOf('const P=['));
  const vw = grab.call(null, /w:(\d+)/g) && [...vSect.matchAll(/w:(\d+)/g)].map((m) => +m[1]);
  const pw = [...pSect.matchAll(/w:(\d+)/g)].map((m) => +m[1]);
  assert.ok(vw.length >= 10, 'the view pool is a pool — ' + vw.length + ' candidates');
  assert.ok(Math.min(...vw) > Math.max(...pw),
    'a question about what is on screen beats a true sentence about the wrong object ' +
    '(view min ' + Math.min(...vw) + ' vs country max ' + Math.max(...pw) + ')');
});

test('R392 ⑥ every view candidate is a literal L(), so all nine languages stay reachable', () => {
  /* scripts/i18n-report.mjs drops any L() whose first argument is not a Literal, and #R309 shipped
     four chips reading English in zh/zh-Hans/fr/ko while the gate reported 100 %.
     ⚠ READ WITH THE COMMENTS TAKEN OUT (scripts/code-only.mjs, #R345). The first version of this
     check read the raw file and failed on the sentence in js/atlas-examples.js that EXPLAINS the
     rule — 「leaves every sentence a literal `L()` with nothing interpolated」. This project has now
     had a check hit its own prose a dozen times; `codeOnly()` exists because of it. */
  const src = code('js/atlas-examples.js');
  const vSect = src.slice(src.indexOf('const V=['), src.indexOf('const P=['));
  const calls = [...vSect.matchAll(/L\(\s*(.)/g)].map((m) => m[1]);
  assert.ok(calls.length >= 10, 'found the candidates — ' + calls.length);
  for (const c of calls) assert.equal(c, "'", 'every L() opens on a string literal, never a variable');
  /* and each one carries all five positional languages */
  const five = [...vSect.matchAll(/t:\(\)=>L\(([\s\S]*?)\)\s*\}/g)];
  assert.ok(five.length >= 10);
  for (const f of five) {
    const commas = (f[1].match(/',\s*\n?\s*'/g) || []).length;
    assert.ok(commas >= 4, 'five positional languages per candidate, got ' + (commas + 1) + ' in: ' + f[1].slice(0, 60));
  }
});
