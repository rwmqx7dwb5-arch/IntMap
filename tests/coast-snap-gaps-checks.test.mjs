/* ============================================================================
 *  coast-snap-gaps — the land a record's coast left out, and the claim a judgement left behind
 *  (scripts/histclio/coast-snap.mjs → data/hist-coast-snap.js, scripts/build-hist-clio.mjs `heldWhole`,
 *   js/time-borders.js `_snapsFor` / `placeRecords` / `typeNote`, js/place-history.js `compose`)
 * ----------------------------------------------------------------------------
 *    ① 1933, East Greenland: no piece of «Kingdom of Norway» is left on the edge of the Greenland fill (the four
 *       triangles production showed), in the shipped bundle at the four places; Greenland holds them
 *    ② the rule behind it, on its own: a polygon of an `over` row is taken whole only when what lies outside the
 *       outline is narrower than the record's band; a polygon with ground of its own outside stays split
 *    ③ the snap bundle as shipped: made against the shipped records, every row's parent drawn over its years, every
 *       piece land, inside no record, within its parent's band (`checkCoastSnap`, the gate's own function)
 *    ④ the sheet the build dates a piece by is the sheet the page shows: the copy of `nearest` against the page's
 *    ⑤ the old city of Istanbul, the land a grid point at a time: every land point of the peninsula's tip is drawn in
 *       1000, 1500 and 1650; across ten port cities and seven years the snap never draws less than the records did
 *    ⑥ the page: the composition draws the snap pieces with their parent's name, and the card says the coast is
 *       matched to the real coastline (en + jp)
 *    ⑦ the place timeline: Sirkeci from 1886 is drawn (the snap) and a timeline whose last piece ends before the records
 *       do lists the years to today as a span no record covers
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { heldWhole, meanWidthKm } from '../scripts/build-hist-clio.mjs';
import { inlandKmFor } from '../scripts/build-border-coast.mjs';
import * as CS from '../scripts/histclio/coast-snap.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const bundle = (file, g) => { const w = {}; new Function('window', rd(file))(w); return w[g]; };
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const at = (d, f) => ({ s: ymd(f[2], f[3], f[4]), e: ymd(f[5], f[6], f[7]), polys: f[8].map((p) => p.map((i) => d.rings[i])) });

test('① 1933, East Greenland: the four triangles of «Kingdom of Norway» are Greenland\'s', () => {
  const d = bundle('data/hist-clio.js', '__HISTCLIO');
  /* the triangles' interiors as production showed them (build 10d4c3b) */
  const PTS = [[-23.29, 72.13], [-20.71, 75.32], [-20.53, 75.16], [-19.61, 75.14]];
  for (const y of [1932, 1933, 1934, 1935]) {
    const t = ymd(y, 7, 1), rows = d.feats.filter((f) => { const r = at(d, f); return r.s <= t && t < r.e; });
    const nor = rows.filter((f) => f[0].en === 'Kingdom of Norway').flatMap((f) => at(d, f).polys);
    assert.ok(nor.every((p) => p[0].every(([x]) => x > -10)), y + ': «Kingdom of Norway» still draws a piece west of 10°W (East Greenland)');
    const gl = rows.filter((f) => f[0].en === 'Greenland').flatMap((f) => at(d, f).polys);
    for (const [x, yy] of PTS) assert.ok(CS.inPolys(gl, x, yy), y + ': ' + x + ',' + yy + ' is not drawn as Greenland');
  }
});

test('② a polygon of an `over` row is taken whole only when what lies outside the outline is narrower than the record\'s band', () => {
  const band = inlandKmFor('__HISTCLIO');
  const sq = (x0, y0, w, h) => [[[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]]];
  const inside = [sq(0, 60, 2, 1)];
  /* a sliver 0.01° wide (about 0.5 km at 60°N) outside — the same claim, two drawings of one edge */
  const thin = [sq(2, 60, 0.01, 1)];
  assert.ok(meanWidthKm(thin[0]) < band);
  assert.equal(heldWhole(inside, thin), true);
  assert.equal(heldWhole(inside, null), true);
  /* a ground of its own outside (Egypt beside the Sudan) keeps the split exact */
  const wide = [sq(2, 60, 1, 1)];
  assert.ok(meanWidthKm(wide[0]) > band);
  assert.equal(heldWhole(inside, wide), false);
  assert.equal(heldWhole(inside, thin.concat(wide)), false);
  assert.equal(heldWhole(null, thin), false);
});

test('③ the snap bundle as shipped: its parents, its years, on land, inside no record, within the band', () => {
  const bad = [];
  const r = CS.checkCoastSnap((c, m) => { if (!c) bad.push(m); });
  assert.deepEqual(bad.filter(Boolean).slice(0, 5), []);
  assert.ok(r && r.rows > 0 && r.rings > 0);
  const snap = bundle(CS.SNAP_FILE, CS.SNAP_GLOBAL);
  /* (coast-snap-detail) each record reaches the coast its terms allow, judged with that coast's agreement width */
  for (const c of Object.values(CS.COASTS)) assert.equal(snap.lands[c.id].agreementKm, c.agreementKm);
  assert.deepEqual(snap.coasts, { cshapes: 'ne', 'ohm-late': 'osm', ohm: 'osm', clio: 'osm', sheet: 'ne' });
  assert.equal(snap.basis[CS.OSM_LAND.file], CS.OSM_LAND.sha256);
  for (const T of CS.TIERS) assert.equal(snap.bands[T.t], inlandKmFor(T.global));
  /* every given piece is wider than the two coasts' agreement, and every judged verdict is counted */
  for (const k of ['given', 'two-polities', 'beyond-band', 'no-sea', 'too-far', 'within-the-coasts-agreement']) assert.ok(Number.isInteger(snap.judged[k]), 'no count for ' + k);
  /* the parent's own facts ride on the row: its dates as its record writes them (all but a sheet), its name */
  for (const f of snap.feats.slice(0, 2000)) {
    const m = f[9];
    if (m.t === 'sheet') assert.ok(m.y != null && m.d == null); else assert.equal(m.d.length, 6);
    assert.ok(CS.snapName(f).length > 0);
  }
});

test('④ the build dates a sheet\'s pieces by the sheet the page shows (`nearest`, evaluated from js/time-borders.js)', () => {
  const src = rd('js/time-borders.js'), a = src.indexOf('const nearest=(y,years)=>{'), b = src.indexOf('};', src.indexOf('MAXGAP) ? next : prev', a)) + 2;
  assert.ok(a > 0 && b > a, 'the page\'s `nearest` is not where this test reads it');
  const page = new Function('CS_MIN', 'MAXGAP', 'YEARS', src.slice(a, b) + ' return nearest;')(1886, 20, []);
  const ys = bundle('data/hist-eras-rest.js', '__HISTERASREST').snaps.map((s) => s.y);
  for (let y = -5000; y < 1886; y += 7) assert.equal(CS.nearestSheet(y, ys), page(y, ys), 'year ' + y);
  for (const y of ys) { const [lo, hi] = CS.sheetReach(y, ys, -122999, 1886); assert.equal(page(lo, ys), y); assert.equal(page(hi, ys), y); if (hi < 1885) assert.notEqual(page(hi + 1, ys), y); }
});

/* ⑤ the land, a grid point at a time */
let _G = null;
/* (coast-snap-detail) ⚠ the land is the BASE MAP'S (OpenStreetMap's): counted on Natural Earth's land — the coast the pieces
   were cut to — this test found Üsküdar complete while production showed 240 of 919 base-map land points blank there */
const G = () => _G || (_G = { rows: CS.loadRows().rows, snap: bundle(CS.SNAP_FILE, CS.SNAP_GLOBAL), land: new CS.Land('osm') });
test('⑤ the tip of the old city of Istanbul and Üsküdar are drawn in 1000, 1500 and 1650 — every land point', () => {
  const { rows, snap, land } = G();
  /* Hagia Sophia, Topkapı, Sultanahmet to Sarayburnu, the ground production showed outside the fill */
  const TIP = [28.970, 41.000, 28.995, 41.020], USKUDAR = [29.005, 41.012, 29.040, 41.035];
  for (const y of [1000, 1500, 1650]) for (const box of [TIP, USKUDAR]) {
    const c = CS.portCoverage({ rows, snap, land, box, y, step: 0.001 });
    assert.ok(c.land > 200, 'no land under the box ' + box.join(','));
    assert.equal(c.drawn + c.snapped, c.land, y + ': ' + (c.land - c.drawn - c.snapped) + ' land points of the tip are drawn under nothing');
    assert.ok(c.snapped > 0, y + ': the tip was covered without the snap — the test is not measuring the defect');
  }
});
test('⑤ ten port cities, seven years: the snap only adds, and adds where the records\' coasts stop short', () => {
  const { rows, snap, land } = G();
  let added = 0;
  for (const [nm, box] of CS.PORTS) for (const y of CS.PORT_YEARS) {
    const c = CS.portCoverage({ rows, snap, land, box, y });
    assert.ok(c.drawn + c.snapped <= c.land && c.snapped >= 0, nm + ' ' + y);
    added += c.snapped;
  }
  assert.ok(added > 0);
});

test('⑥ the page draws the pieces under their parent\'s name, and the card says the coast is matched to the real coastline', async () => {
  const { timeBorders } = await import('../scripts/histeras/time-borders.mjs');
  const { repoFetch } = await import('../scripts/hist-fidelity.mjs');
  const { api } = await timeBorders({ lang: 'en', fetch: repoFetch });
  const c = await api.compositeAt(1650, 6, 15);
  assert.ok(c && c.fc, 'no composition for 1650');
  const sn = c.fc.features.filter((f) => f.properties._coastSnap);
  assert.ok(sn.length > 0, 'the 1650 composition draws no snap piece');
  /* the tip point (Topkapı) is inside a drawn shape, and that shape is the Ottoman Empire's */
  const hit = c.fc.features.filter((f) => { const g = f.geometry, P = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return CS.inPolys(P, 28.984, 41.012); });
  assert.ok(hit.length >= 1, 'Topkapı is drawn under nothing in 1650');
  assert.ok(hit.some((f) => f.properties._coastSnap && /Ottoman/.test(f.properties.NAME)), 'Topkapı is not drawn by an Ottoman snap piece: ' + hit.map((f) => f.properties.NAME).join(', '));
  /* each piece carries exactly its parent's name: the parent is drawn at the same instant */
  const names = new Set(c.fc.features.filter((f) => !f.properties._coastSnap).map((f) => f.properties.NAME));
  for (const f of sn) assert.ok(names.has(f.properties.NAME), '«' + f.properties.NAME + '» is drawn as a snap piece without its parent');
  for (const [lang, re] of [['en', /copy of the coast.*real coastline.*No record draws this strip/], ['jp', /海岸線の写し.*本物の海岸線.*記録の海岸を本物の海岸線に合わせた/]]) {
    const { api: a } = await timeBorders({ lang });
    assert.match(a.typeNote({ properties: { NAME: 'Ottoman Empire', _coastSnap: 1 } }), re, lang);
    /* what the parent's own note says follows it */
    assert.match(a.typeNote({ properties: { NAME: 'Mahdist State', _coastSnap: 1, _heldFrom: 1885, _heldShape: 1890 } }), lang === 'en' ? /real coastline.*· .*1885/ : /本物の海岸線.*· .*1885/);
  }
});

test('⑦ the place timeline: Sirkeci is drawn after 1885, and the years to today after a last piece are said', async () => {
  const { harness, historyAt } = await import('../scripts/place-history.mjs');
  const H = await harness('en');
  const rec = await historyAt(H, 28.975, 41.010);
  const N = rec.nation;
  assert.equal(N.status, 'ok');
  const k1900 = ymd(1900, 7, 1), k1950 = ymd(1950, 7, 1);
  assert.ok(N.entries.some((E) => E.from.k <= k1900 && k1900 < E.to.k), 'Sirkeci has no entry in 1900');
  assert.ok(N.entries.some((E) => E.from.k <= k1950 && k1950 < E.to.k), 'Sirkeci has no entry in 1950');
  assert.ok(!N.gaps.some((g) => g.from <= k1900 && k1900 < g.to), 'Sirkeci 1900 is still a gap');
  /* (coast-snap-detail) its «Turkey» row ends where CShapes ends, and 2020 to today is said, not left out */
  assert.ok(N.gaps.some((g) => g.beyond && g.toNow && g.from === ymd(2020, 1, 1)), 'Sirkeci says nothing of 2020 to today: ' + JSON.stringify(N.gaps));
  /* the composer: a last piece ending before the records do leaves a span to today; one ending with them does not */
  const P = H.PH, piece = (s, e) => ({ tier: 'clio', file: 'data/hist-clio.js', name: 'X', s, e, sEdge: 'stated', eEdge: 'stated' });
  const top = ymd(2020, 1, 1), now = ymd(2026, 10, 8);
  const a = P.compose({ pieces: [piece(ymd(1500, 1, 1), ymd(1886, 1, 1))], records: [], order: ['clio'], top, now });
  assert.deepEqual(a.gaps, [{ from: ymd(1886, 1, 1), to: now, toNow: true }]);
  /* (coast-snap-detail) one ending with them leaves the years from the records' end to today, said as «no record» */
  const b = P.compose({ pieces: [piece(ymd(1500, 1, 1), top)], records: [], order: ['clio'], top, now });
  assert.deepEqual(b.gaps, [{ from: top, to: now, toNow: true, beyond: true }]);
  assert.match(String(P.historyMarkup({ nation: Object.assign({ status: 'ok' }, b), admin: null }, 'en')), /No historical record covers these years[\s\S]*today/);
  assert.match(String(P.historyMarkup({ nation: Object.assign({ status: 'ok' }, b), admin: null }, 'jp')), /この期間を述べる歴史の記録はない[\s\S]*今日/);
  assert.equal(P.forAtlas({ at: {}, nation: Object.assign({ status: 'ok' }, b), admin: {} }).nation.gaps[0].afterTheRecords, true);
  const html = String(P.historyMarkup({ nation: Object.assign({ status: 'ok' }, a), admin: null }, 'en'));
  assert.match(html, /No record draws a polity here[\s\S]*today/);
  const jp = String(P.historyMarkup({ nation: Object.assign({ status: 'ok' }, a), admin: null }, 'jp'));
  assert.match(jp, /今日/);
  assert.equal(P.forAtlas({ at: {}, nation: Object.assign({ status: 'ok' }, a), admin: {} }).nation.gaps[0].toToday, true);
});
