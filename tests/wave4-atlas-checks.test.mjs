/* ============================================================================
 *  wave4-atlas — «持ち主が変わった土地»: two instants, one region, the land whose polity changed, on the map
 *  (js/territory-change.js, Atlas `time.territoryChange`)
 * ----------------------------------------------------------------------------
 *    ① THE LATTICE IS THE SPHERE: the cell areas of a whole-globe lattice add up to 4πR², and a cell's area is exact;
 *    ② ONE POINT-IN-POLYGON RULE: the row-at-a-time labeller answers exactly what js/routing-ops.js `featuresAt` answers
 *       at every cell centre — on squares with holes and parts, and on the shipped record of 1913 over Europe;
 *    ③ THE OUTLINES ARE THE CELLS: a traced set has the cells' area, keeps its hole, runs outer rings counter-clockwise,
 *       and two cells touching at one corner are two rings;
 *    ④ WHO A POLITY IS: the CShapes code decides before the Wikidata item, the item before the name, and a name is any
 *       of the names the record writes (Natural Earth's NAME_LONG «United States» meets CShapes' «United States»);
 *    ⑤ WHAT THE RECORDS DRAW, AND NOTHING ELSE: a transfer with its km² and shares; a state renamed under one code is
 *       listed, not drawn (unless asked); a new bracket under one code («Korea (Japan)») IS drawn; land drawn at one
 *       instant only is the edge of a record; an overlap is both shapes; a pair with no shared identifier says so;
 *    ⑥ ATLAS: the answer reaches the model (`exec.territoryChange`), each transfer is one polygon declared in
 *       `meta.painted.polys`, the same question twice leaves the same polygons, an answer with nothing to draw is
 *       complete (`meta.paintsNothing`, read by the paint observer), and a missing instant or an unknown place is
 *       asked for rather than guessed;
 *    ⑦ THE RECORDS, NAMED (historical-verification §2-1): Europe 1913 → 1924 — the Irish Free State, Bessarabia and
 *       Alsace-Lorraine at their treaty areas, Russia → Soviet Union a rename; East Asia 1904 → 1911 — Korea annexed and
 *       southern Sakhalin; the Levant 1938 → 1950 — Israel within its armistice area;
 *    ⑧ the capability is declared once, on the paint observer, its run in the lazy module.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importModule } from '../scripts/lib/import-module.mjs';
import { harness, run } from '../scripts/territory-change.mjs';

import * as GA from '../js/routing-ops.js';
import * as T from '../js/territory-change.js';

const sq = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const P = (...rings) => ({ type: 'Polygon', coordinates: rings });
const F = (geometry, properties) => ({ type: 'Feature', geometry, properties });
const R_KM = 6371.0088;

test('① the cell areas of a whole-globe lattice add up to the sphere', () => {
  const L = T.lattice([-180, -90, 180, 90], 1);
  assert.equal(L.cols, 360); assert.equal(L.rows, 180);
  let sum = 0; for (let r = 0; r < L.rows; r++) sum += T.rowCellKm2(L, r) * L.cols;
  assert.ok(Math.abs(sum - 4 * Math.PI * R_KM * R_KM) < 1, 'Σ cells = 4πR² (' + sum + ')');
  /* a 1° cell at the equator is R²·(π/180)·sin 1° */
  assert.ok(Math.abs(T.rowCellKm2(L, 90) - R_KM * R_KM * (Math.PI / 180) * Math.sin(Math.PI / 180)) < 1e-6);
  /* with no step, about DEFAULT_CELLS cells */
  const D = T.lattice([0, 0, 50, 20]);
  assert.ok(Math.abs(D.cols * D.rows - T.DEFAULT_CELLS) / T.DEFAULT_CELLS < 0.01);
  assert.equal(T.lattice([5, 0, 5, 1]), null, 'a region with no width is refused');
});

test('② the row labeller answers what featuresAt answers at every cell centre', async () => {
  const feats = [
    F(P(sq(0, 0, 4, 4), sq(1, 1, 2, 2)), { NAME: 'Holed' }),                              /* a hole */
    F({ type: 'MultiPolygon', coordinates: [[sq(5, 0, 6, 1)], [sq(7, 2, 9, 3.3)]] }, { NAME: 'Parts' }),
    F(P([[0.5, 3], [3.7, 4.6], [6.2, 2.1], [0.5, 3]]), { NAME: 'Tri' }),                   /* slanted edges, overlapping Holed */
  ];
  const check = (features, L) => {
    const lab = T.labelCells(features, L);
    let n = 0;
    for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
      const want = GA.featuresAt(T.cellLng(L, c), T.cellLat(L, r), features).map((f) => features.indexOf(f)).sort((a, b) => a - b);
      const got = T.featuresOfCell(lab, r * L.cols + c).slice().sort((a, b) => a - b);
      assert.deepEqual(got, want, 'cell ' + c + ',' + r); n++;
    }
    return n;
  };
  assert.ok(check(feats, T.lattice([-0.5, -0.5, 10, 5], 0.13)) > 2000);
  /* the shipped record of 1913 over Europe, at a step the test can afford */
  const H = await harness('en');
  const c = await H.deps.borders.collectionAt(H.J.instantOf({ year: 1913 }).when);
  assert.ok(check(c.fc.features, T.lattice([-11, 35, 45, 62], 0.5)) > 5000);
});

test('③ a traced set of cells has their area, its hole, counter-clockwise outer rings, and corner-touching cells apart', () => {
  const L = T.lattice([0, 0, 10, 10], 1);
  const ring = []; for (let r = 2; r <= 6; r++) for (let c = 2; c <= 6; c++) if (!(r === 4 && c === 4)) ring.push(r * L.cols + c);
  const polys = T.traceCells(ring, L);
  assert.equal(polys.length, 1); assert.equal(polys[0].length, 2, 'one outer ring and its hole');
  const area = (ll) => { let a = 0; for (let i = 1; i < ll.length; i++) a += ll[i - 1][0] * ll[i][1] - ll[i][0] * ll[i - 1][1]; return a / 2; };
  assert.equal(area(polys[0][0]), 25); assert.equal(area(polys[0][1]), -1);
  assert.equal(polys[0][0].length, 5, 'collinear corners dropped: a square is four corners and the closing one');
  const diag = T.traceCells([0 * L.cols + 0, 1 * L.cols + 1], L);
  assert.equal(diag.length, 2, 'two cells touching at a corner are two rings');
});

test('④ a polity is its code, then its Wikidata item, then any name the record writes', () => {
  const id = (p, modern) => T.identityOf({ properties: p }, 'en', modern);
  assert.equal(T.samePolity(id({ NAME: 'Russia', _gw: 365 }), id({ NAME: 'Soviet Union', _gw: 365 })).same, true);
  assert.equal(T.samePolity(id({ NAME: 'Serbia', _gw: 340 }), id({ NAME: 'Serbia', _gw: 345 })).same, false, 'the code decides before the name');
  assert.deepEqual(T.samePolity(id({ NAME: 'A', _qid: 'Q1' }), id({ NAME: 'B', _qid: 'Q1' })), { same: true, by: 'qid' });
  const cs = id({ NAME: 'United States', _gw: 2 }), ne = id({ NAME: 'United States of America', NAME_LONG: 'United States', WIKIDATAID: 'Q30' }, true);
  assert.deepEqual(T.samePolity(cs, ne), { same: true, by: 'name' });
  assert.equal(T.samePolity(id({ NAME: 'French Third Republic', _qid: 'Q70802' }), id({ NAME: 'France', _gw: 220 })).same, false);
});

/* two instants over 0°–10°, 0°–2° */
const PAST = [
  F(P(sq(0, 0, 4, 2)), { NAME: 'Old Empire', _gw: 300 }),
  F(P(sq(4, 0, 6, 2)), { NAME: 'Russia', _gw: 365 }),
  F(P(sq(6, 0, 7, 2)), { NAME: 'Korean Empire', _gw: 730 }),
  F(P(sq(7, 0, 8, 2)), { NAME: 'Cliopatria Land', _qid: 'Q9' }),
  F(P(sq(8, 0, 9, 2)), { NAME: 'Edge' }),
];
const NOW = [
  F(P(sq(0, 0, 3, 2)), { NAME: 'Old Empire', _gw: 300 }),
  F(P(sq(3, 0, 4, 2)), { NAME: 'New State', _gw: 315 }),
  F(P(sq(4, 0, 6, 2)), { NAME: 'Soviet Union', _gw: 365 }),
  F(P(sq(6, 0, 7, 2)), { NAME: 'Korea (Japan)', _gw: 730 }),
  F(P(sq(7, 0, 8, 2)), { NAME: 'CShapes Land', _gw: 999 }),
  F(P(sq(7.5, 0, 8, 2)), { NAME: 'Claimant', _gw: 998 }),
];
const LAND = [F(P(sq(0, 0, 9.5, 2)), { NAME: 'Land' })];
const bordersOf = (map) => ({ collectionAt: async (when) => ({ tier: 'test', fc: { type: 'FeatureCollection', features: map[when.getFullYear()] } }), recordOf: () => ({ src: 'TEST RECORD' }) });

test('⑤ what the records draw: a transfer, a rename, a new bracket, the edge of a record, an overlap, a name-only pair', async () => {
  const deps = { borders: bordersOf({ 1900: PAST, 1920: NOW }), land: () => ({ features: LAND }), lang: 'en', yieldTo: () => Promise.resolve() };
  const R = await T.territoryChange([0, 0, 10, 2], T_instant(1900), T_instant(1920), deps, { stepDeg: 0.1 });
  const name = (x) => x.from.map((n) => n.en).join(' / ') + ' → ' + x.to.map((n) => n.en).join(' / ');
  const tr = Object.fromEntries(R.transfers.map((x) => [name(x), x]));
  /* Old Empire gave its eastern quarter (1° of 4) to New State */
  const oe = tr['Old Empire → New State'];
  assert.ok(oe, 'the transfer is found'); assert.equal(oe.pieces.length, 1);
  assert.ok(Math.abs(oe.shareOfFrom - 0.25) < 1e-9 && Math.abs(oe.shareOfTo - 1) < 1e-9);
  /* the area is the sphere's: 1° × 2° at the equator */
  const want = R_KM * R_KM * (Math.PI / 180) * (Math.sin(2 * Math.PI / 180) - 0);
  assert.ok(Math.abs(oe.km2 - want) / want < 1e-9, oe.km2 + ' vs ' + want);
  assert.ok(!tr['Russia → Soviet Union'], 'one code, a new name: not a transfer');
  assert.deepEqual(R.renamed.map(name), ['Russia → Soviet Union']);
  const ko = tr['Korean Empire → Korea (Japan)'];
  assert.ok(ko && ko.sameIdentifier && ko.holderInName, 'one code, a holder in the bracket: drawn as a change of hands');
  assert.ok(tr['Cliopatria Land → CShapes Land'] && tr['Cliopatria Land → CShapes Land'].comparedByNameOnly, 'no shared identifier: said');
  const ov = tr['Cliopatria Land → CShapes Land / Claimant'];
  assert.ok(ov && ov.overlap, 'two shapes at once: both named, none chosen');
  assert.deepEqual(R.recordOnly.map((x) => x.side + ':' + x.polity[0].en), ['from:Edge'], 'drawn at one instant only is the edge of a record');
  assert.equal(R.recordOnly[0].otherDraws, 'none');
  /* asked to, the rename is drawn too */
  const R2 = await T.territoryChange([0, 0, 10, 2], T_instant(1900), T_instant(1920), deps, { stepDeg: 0.1, drawRenamed: true });
  assert.ok(R2.transfers.some((x) => name(x) === 'Russia → Soviet Union' && x.sameIdentifier && !x.holderInName));
  /* the record that cannot be read says so */
  const bad = await T.territoryChange([0, 0, 10, 2], T_instant(1900), T_instant(1920), { borders: null, land: () => null, lang: 'en' }, { stepDeg: 0.5 });
  assert.equal(bad.failed, 'history-borders-not-loaded');
  /* a lattice no page can hold is refused by name, with the step that fits */
  const huge = await T.territoryChange([-180, -85, 180, 85], T_instant(1900), T_instant(1920), deps, { stepDeg: 1e-5 });
  assert.equal(huge.failed, 'lattice-too-large'); assert.ok(huge.fits && huge.fits.step > 0.2);
  assert.equal(T.forAtlas(huge, 'en').defaultStepDeg, +huge.fits.step.toFixed(5));
});
function T_instant(y) { const d = new Date(0); d.setFullYear(y, 5, 15); d.setHours(12, 0, 0, 0); return { now: false, when: d, year: y, iso: null }; }

test('⑥ Atlas: the answer reaches the model, each transfer is one declared polygon, the same question twice is the same map', async () => {
  globalThis.window = globalThis.window || globalThis;
  window.IntMapTimeBorders = bordersOf({ 1900: PAST, 1920: NOW });
  window.countryGeo = { features: LAND };
  let polys = [], painted = 0;
  const K = {
    R: (ok, html, extra) => Object.assign({ ok: !!ok, html }, extra || null), warn: (s) => '<w>' + s + '</w>', note: (s) => '<n>' + s + '</n>',
    L: (en) => en, HOST: { lang: 'en' }, geocode: async () => null, placeExtent: async (n) => (n === 'Testland' ? { name: 'Testland', box: [[0, 0], [10, 2]] } : null),
    get _hlPolys() { return polys; }, set _hlPolys(v) { polys = v; },
    _hlPaletteColor: (i) => ['#e6550d', '#3182bd', '#31a354', '#756bb1'][i % 4], paintPolys: () => { painted++; return true; },
    GE: () => ({ camera: { fitBounds() {} } }), ensureData: async () => {},
  };
  const a = { type: 'territoryChange', from: 1900, to: 1920, place: 'Testland', stepDeg: 0.1 };
  const r1 = await T.atlasRun(a, K);
  assert.equal(r1.ok, true);
  const X = r1.exec.territoryChange;
  assert.ok(X.transfers.length >= 3 && X.transfers.every((t) => typeof t.km2 === 'number' && t.from && t.to));
  assert.deepEqual(X.renamed.map((x) => x.from + ' → ' + x.to), ['Russia → Soviet Union']);
  assert.equal(X.stepDeg, 0.1);
  assert.equal(polys.length, X.transfers.length, 'one polygon per transfer');
  assert.deepEqual(r1.meta.painted.polys, polys.map((p) => p.name));
  assert.ok(polys.every((p) => /^(Multi)?Polygon$/.test(p.geo.type) && p.color));
  const r2 = await T.atlasRun(a, K);
  assert.equal(polys.length, X.transfers.length, 'a redraw of the same question replaces its own land');
  assert.equal(r2.meta.resultKey, r1.meta.resultKey);
  polys.push({ geo: { type: 'Polygon', coordinates: [sq(0, 0, 1, 1)] }, name: 'someone else' });
  await T.atlasRun(a, K);
  assert.equal(polys.length, X.transfers.length + 1, 'another drawing is left alone');
  /* nothing changed hands: an empty map is the answer, and the paint observer calls it complete rather than not_rendered */
  const same = await T.atlasRun({ from: 1900, to: 1900, place: 'Testland', stepDeg: 0.5 }, K);
  assert.equal(same.ok, true); assert.equal(same.exec.territoryChange.transfers.length, 0);
  assert.equal(same.meta.paintsNothing, true); assert.equal(same.meta.painted, undefined);
  const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
  const still = { surfaces: {}, visible: 0, objects: 0 };
  const verdict = makeAtlasCapabilities({}).OBSERVERS.paint.verify({}, {}, JSON.parse(JSON.stringify(still)), still, same);
  assert.equal(verdict.status, 'completed'); assert.equal(verdict.code, 'ok');
  const unsaid = makeAtlasCapabilities({}).OBSERVERS.paint.verify({}, {}, JSON.parse(JSON.stringify(still)), still, { ok: true, html: '' });
  assert.equal(unsaid.code, 'not_rendered', 'a painter that did not say so has made no such claim');
  /* asked for, not guessed */
  const noFrom = await T.atlasRun({ to: 1920, place: 'Testland' }, K);
  assert.equal(noFrom.ok, false); assert.equal(noFrom.meta.code, 'NEEDS_INPUT');
  const nowhere = await T.atlasRun({ from: 1900, to: 1920, place: 'Nowhere' }, K);
  assert.equal(nowhere.ok, false); assert.match(nowhere.html, /Nowhere/);
  const badDate = await T.atlasRun({ from: '1920-02-31', to: 1920, place: 'Testland' }, K);
  assert.equal(badDate.ok, false);
  delete window.IntMapTimeBorders; delete window.countryGeo;
});

test('⑦ the records, named: the Irish Free State, Bessarabia, Alsace-Lorraine, Korea, Sakhalin, Israel', async () => {
  const H = await harness('en');
  const name = (x) => x.from.map((n) => n.en).join(' / ') + ' → ' + x.to.map((n) => n.en).join(' / ');
  const km = (R, k) => { const t = R.transfers.find((x) => name(x) === k); return t ? t.km2 : null; };
  /* the tolerance is the lattice's: at 0.1° a cell is ≈ 7–11 km across, and a treaty area of tens of thousands of km²
     moves by about half a cell along its edge — under 10 % for every area named here */
  const near = (got, want, what) => assert.ok(got != null && Math.abs(got - want) / want < 0.1, what + ': ' + got + ' km² vs ' + want);
  const EU = await run(H, [-11, 35, 45, 62], '1913', '1924', 0.1);
  near(km(EU, 'United Kingdom → Irish Free State'), 70273, 'the Irish Free State (Anglo-Irish Treaty)');
  near(km(EU, 'Russia → Romania'), 44422, 'Bessarabia');
  near(km(EU, 'Germany → France'), 14522, 'Alsace-Lorraine (Versailles)');
  near(km(EU, 'Germany → Denmark'), 3984, 'North Schleswig (the 1920 plebiscite)');
  assert.ok(!EU.transfers.some((x) => name(x) === 'Russia → Soviet Union'), 'one state code: a rename, not a conquest');
  assert.ok(EU.renamed.some((x) => name(x) === 'Russia → Soviet Union'));
  assert.ok(/CShapes/.test(EU.records.from.src), 'the record names itself');
  const EA = await run(H, [115, 25, 150, 55], '1904', '1911', 0.1);
  const korea = EA.transfers.find((x) => name(x) === 'Korean Empire → Korea (Japan)');
  assert.ok(korea && korea.sameIdentifier, 'the annexation of Korea (1910) is a change of hands under one code');
  near(korea.km2, 220000, 'Korea');
  /* Portsmouth (1905): ALL of the land the record holds as Karafuto in 1911 was Russia's in 1904. Its area is not compared
     with the 36,090 km² of the prefecture: the record's outline of southern Sakhalin measures ≈ 32,300 km² at a 2 km step
     as at a 10 km one — its coastline, not the lattice (dev-notes/2026-10-13-wave4-atlas.md) */
  const sak = EA.transfers.find((x) => name(x) === 'Russia → Karafuto (Japan)');
  assert.ok(sak && sak.shareOfTo > 0.99, 'southern Sakhalin came from Russia whole');
  const LV = await run(H, [25, 25, 60, 45], '1938', '1950', 0.1);
  near(km(LV, 'Mandatory Palestine → Israel'), 20770, 'Israel within the 1949 armistice lines');
});

test('⑧ time.territoryChange is declared once: the paint observer, an optional region, the run in the lazy module', async () => {
  const caps = (await importModule('js/atlas-cap-time.js')).default;
  const E = caps.filter((c) => c.row[0] === 'time.territoryChange');
  assert.equal(E.length, 1);
  const row = E[0].row;
  assert.equal(row[1], 'territoryChange'); assert.equal(row[4], 'paint'); assert.equal(row[5], 'map.polygon'); assert.equal(row[9], 'place?');
  assert.ok(E[0].doc.some((d) => /持ち主が変わった土地/.test(d.text) && /LAND THAT CHANGED HANDS/.test(d.text)), 'the planner reads its name in en and jp');
  assert.ok(E[0].doc.every((d) => d.at >= 440 && d.at <= 479), 'its place in the catalogue is in the range this work was given');
  assert.match(String(E[0].run), /import\('\.\/territory-change\.js'\)/);
});
