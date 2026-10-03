/* ══ hist-fidelity-sweep — eight claims the historical map made, each answered by the rule that made it ══
 *
 *  The day's other work (dev-notes/2026-10-01-*) listed what it saw on the map and did not fix. This file
 *  holds the structural repairs, each EVALUATED against the shipped bundles and the page's own functions
 *  (#R505), and each with the defect put back to show the check goes red on it:
 *    ① a coloniser's bracket falls on the CShapes record's day, not on 1 January (1960-06-15 Dahomey)
 *    ② the era country names are placed largest first, with #R707's key (1914 «Netherlands» over Germany)
 *    ③ a subdivision's name is offered once per unit, not once per outer ring (1950 Japan)
 *    ④ a carried-back country is drawn from the LATEST founding its units state (Kagawa 1888-12-03)
 *    ⑤ one handover that upstream writes in two years is moved to the day Wikidata and history agree on
 *       (Ryukyu Domain → Okinawa Prefecture, 1879-04-04)
 *    ⑥ a start history states and Wikidata states later is drawn, and the card says whose it is (Elam)
 *  Items 4 (the NATO legend's «32 members») and 6 (the plate legend's title) live in files another round
 *  is rewriting — see dev-notes/2026-10-02-hist-fidelity-sweep.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { eraContext, eraSpanProblems, csNameProblems, fillInceptionProblems, historyNames } from '../scripts/hist-fidelity.mjs';
import { readEdges, edgeProblems, successions, applyEdges } from '../scripts/histadmin/edges.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const load = (rel) => { const s = rd(rel); return JSON.parse(s.slice(s.indexOf('=') + 1).replace(/;\s*$/, '')); };
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
const ctx = await eraContext();
const { api } = ctx;
const CS = load('data/cshapes.js');

/* ── ① ─────────────────────────────────────────────────────────────────────────────────────────── */
test('① 1960-06-15: Dahomey, Niger, Cote d\'Ivoire and Nigeria carry their coloniser until the record\'s own day', async () => {
  const r = await api.collectionAt(new Date(1960, 5, 15));
  const nm = (gw) => r.fc.features.filter((f) => f.properties._gw === gw).map((f) => f.properties.NAME);
  assert.deepEqual(nm(434), ['Dahomey (France)']);
  assert.deepEqual(nm(436), ['Niger (France)']);
  assert.deepEqual(nm(437), ["Cote d'Ivoire (France)"]);
  assert.deepEqual(nm(475), ['Nigeria (UK)']);
  /* and the day the record changes, the bracket is gone — 1960-08-01 for Benin/Dahomey */
  const row = (gw, t) => CS.feats.find((f) => f[1] === gw && ymd(f[2], f[3], f[4]) <= t && t <= ymd(f[5], f[6], f[7]));
  assert.equal(api.csName('Benin', 434, 1960, 7, 31, row(434, 19600731)), 'Dahomey (France)');
  assert.equal(api.csName('Benin', 434, 1960, 8, 1, row(434, 19600801)), 'Dahomey');
  assert.equal(api.csName('India', 750, 1947, 8, 14, row(750, 19470814)), 'India (UK)');
  assert.equal(api.csName('India', 750, 1947, 8, 15, row(750, 19470815)), 'India');
});

test('① the gate holds every dated rule to the record\'s day, and goes red on the 1-January reading', () => {
  assert.deepEqual(csNameProblems(ctx).out, []);
  /* the shipped defect: `y < before` with the year alone */
  const era = api.csEra();
  const old = (nm, gw, y) => { const rules = era[gw]; if (rules) for (const r of rules) { const Y = Array.isArray(r[0]) ? r[0][0] : r[0]; if (y < Y) return r[1]; } return String(nm || '').replace(/\s*\([^)]*\)\s*$/, ''); };
  const bad = csNameProblems({ ...ctx, api: { ...api, csName: old } }).out;
  const hit = bad.filter((p) => p[0] === 'cs-name-not-before').map((p) => p[1]);
  assert.ok(hit.some((m) => /gw 434 «Dahomey \(France\)»/.test(m)), JSON.stringify(hit.slice(0, 5)));
  assert.ok(hit.some((m) => /gw 750 «India \(UK\)»/.test(m)));
  /* a bare year in a year the record changes twice cannot say which day it means */
  const amb = csNameProblems({ ...ctx, api: { ...api, csEra: () => ({ 553: [[1964, 'Nyasaland (UK)'], [9999, 'Malawi']] }) } }).out;
  assert.ok(amb.some((p) => p[0] === 'cs-name-ambiguous-year'), JSON.stringify(amb));
});

/* ── ② ─────────────────────────────────────────────────────────────────────────────────────────── */
test('② the era names carry #R707\'s collision order, and the layer reads it', async () => {
  const r = await api.collectionAt(new Date(1914, 5, 27));
  const pts = api.labelFC(r.fc);
  const by = (n) => pts.features.find((f) => f.properties.NAME === n);
  const de = by('Germany'), nl = by('Netherlands');
  assert.ok(de && nl && Number.isFinite(de.properties._sort) && Number.isFinite(nl.properties._sort));
  assert.ok(de.properties._sort < nl.properties._sort, 'Germany is placed before the Netherlands');
  /* the key is js/time-admin1.js's own `sortKeyOf`, evaluated — one ordering for both name layers */
  const TA = codeOnly(rd('js/time-admin1.js'));
  const box = vm.createContext({ Math });
  vm.runInContext(liftFunction(TA, 'sortKeyOf'), box);
  const geomOf = (n) => r.fc.features.find((f) => f.properties.NAME === n).geometry;
  const R = 6371.0088, D = Math.PI / 180;
  const ringKm2 = (ring) => { let s = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { let dl = ring[i][0] - ring[j][0]; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360; s += dl * D * (2 + Math.sin(ring[j][1] * D) + Math.sin(ring[i][1] * D)); } return Math.abs(s / 2) * R * R; };
  const largest = (g) => { const ps = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return ps.map((p) => p[0]).sort((a, b) => b.length - a.length).map(ringKm2).sort((a, b) => b - a)[0]; };
  assert.ok(Math.abs(de.properties._sort - box.sortKeyOf(largest(geomOf('Germany')))) < 1e-6, 'the era key is the subdivision key');
  const line = rd('js/time-borders.js').split('\n').find((l) => l.includes('const _ERAVAR='));
  assert.match(line, /'symbol-sort-key':\['coalesce',\['get','_sort'\],0\]/);
});

/* ── ③ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('③ 1950: one name candidate per prefecture, not one per island', () => {
  const fill = load('data/hist-admin-fill.js');
  const t = ymd(1950, 7, 1), feats = [];
  fill.feats.forEach((f, i) => {
    if (f[11] !== 'JPN' || !(ymd(f[2], f[3], f[4]) <= t && t < ymd(f[5], f[6], f[7]))) return;
    const polys = f[8].map((p) => p.map((ri) => fill.rings[ri]));
    feats.push({ type: 'Feature', geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys }, properties: { NAME: f[0], _ix: i, _sort: 0 } });
  });
  const fc = { type: 'FeatureCollection', features: feats };
  const rings = feats.reduce((n, f) => n + (f.geometry.type === 'Polygon' ? 1 : f.geometry.coordinates.length), 0);
  assert.ok(rings > feats.length * 2, 'the defect needs islands to show: ' + rings + ' rings for ' + feats.length + ' units');
  /* js/time-admin1.js `labelsFor`, lifted and run against the era module the page builds first — with
     `eraBorders`, the one place the file reads that module through the global */
  const box = vm.createContext({ window: { IntMapTimeBorders: api } });
  const TAsrc = codeOnly(rd('js/time-admin1.js'));
  vm.runInContext(liftFunction(TAsrc, 'eraBorders') + ';' + liftFunction(TAsrc, 'labelsFor'), box);
  const out = box.labelsFor(fc);
  const outer = out.features.reduce((n, f) => n + (f.geometry.type === 'Polygon' ? 1 : f.geometry.coordinates.length), 0);
  assert.equal(outer, feats.length, 'one outer ring — one renderer candidate — per prefecture');
  assert.ok(out.features.every((f) => f.geometry.type === 'Polygon'));
  /* the unit is named by its row: two units with one name keep two names */
  const twin = { type: 'FeatureCollection', features: [feats[0], { ...feats[1], properties: { ...feats[1].properties, NAME: feats[0].properties.NAME } }] };
  assert.equal(box.labelsFor(twin).features.length, 2);
  /* and the copy keeps what the click reads */
  assert.ok(out.features.every((f) => f.properties._ix != null && f.properties.NAME));
});

/* ── ④ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('④ the carried-back Japan begins 1888-12-03 — the latest founding its prefectures state — and the gate re-derives it', () => {
  const fill = load('data/hist-admin-fill.js');
  const jp = fill.feats.filter((f) => f[11] === 'JPN');
  assert.ok(jp.length >= 40);
  assert.ok(jp.every((f) => ymd(f[2], f[3], f[4]) >= 18881203), 'a Japanese row starts before 1888-12-03');
  assert.equal(fill.inception['JP-37'], 18881203, 'Kagawa\'s last founding');
  assert.deepEqual(fillInceptionProblems([{ file: 'data/hist-admin-fill.js', b: fill }]), []);
  /* the shipped defect: every Japanese row from 1881-02-07 */
  const bad = structuredClone(fill);
  for (const f of bad.feats) if (f[11] === 'JPN') { f[2] = 1881; f[3] = 2; f[4] = 7; }
  const ps = fillInceptionProblems([{ file: 'data/hist-admin-fill.js', b: bad }]);
  assert.equal(ps.length, 1); assert.equal(ps[0][0], 'fill-before-inception');
  /* and without the evidence the rule cannot be measured, which is said */
  const none = structuredClone(fill); delete none.inception;
  assert.equal(fillInceptionProblems([{ file: 'data/hist-admin-fill.js', b: none }])[0][0], 'fill-inception-unstated');
});

test('④ the builder keeps every stated inception and draws from the last; an earlier incarnation\'s end is not this one\'s', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'histfill-'));
  const v = (d) => ({ type: 'literal', value: d });
  const row = (code, q, inc, dis) => ({ code: v(code), item: v('http://www.wikidata.org/entity/' + q), ...(inc ? { inc: v(inc) } : {}), ...(dis ? { dis: v(dis) } : {}) });
  /* 香川県 as Wikidata states it: three foundings, and the 1876 merger into 愛媛県 */
  /* (hist-coverage) the query reads every non-deprecated rank now, and HASC after it; a row with no rank is a best-ranked one */
  fs.writeFileSync(path.join(dir, 'p8119-spans-ranked.json'), '[]');
  fs.writeFileSync(path.join(dir, 'p300-spans-ranked.json'), JSON.stringify([
    row('JP-37', 'Q161454', '1871-12-26T00:00:00Z', '1876-08-21T00:00:00Z'),
    row('JP-37', 'Q161454', '1875-09-05T00:00:00Z'),
    row('JP-37', 'Q161454', '1888-12-03T00:00:00Z'),
    row('JP-18', 'Q133879', '1881-02-07T00:00:00Z'),
  ]));
  process.env.INTMAP_HISTFILL_CACHE = dir;
  try {
    const { wikidataSpans } = await import('../scripts/build-hist-admin-fill.mjs');
    const m = await wikidataSpans();
    assert.equal(m.get('JP-37').s, 18881203);
    assert.equal(m.get('JP-37').e, null, 'the 1876 merger ended an earlier Kagawa');
    assert.deepEqual(m.get('JP-37').ss.sort(), [18711226, 18750905, 18881203]);
    assert.equal(m.get('JP-18').s, 18810207);
  } finally { delete process.env.INTMAP_HISTFILL_CACHE; fs.rmSync(dir, { recursive: true, force: true }); }
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────────────────────────── */
const tiers = () => fs.readdirSync(path.join(ROOT, 'data')).filter((f) => /^hist-admin\d\.js$/.test(f)).sort().map((f) => ({ file: 'data/' + f, b: load('data/' + f) }));
test('⑤ Okinawa Prefecture begins and Ryukyu Domain ends on 1879-04-04, and the rows still say what upstream wrote', () => {
  const T1 = load('data/hist-admin1.js');
  const ok = T1.feats.find((f) => f[10] === 2890076), ry = T1.feats.find((f) => f[10] === 2890077);
  assert.deepEqual(ok.slice(2, 5), [1879, 4, 4]);
  assert.deepEqual(ry.slice(5, 8), [1879, 4, 4]);
  assert.equal(T1.dates[2890076].start.raw, '1880', 'upstream\'s own word stays');
  assert.equal(T1.dates[2890077].end.raw, '1879');
  assert.equal(T1.dates[2890076].start.corrected.at, '1879-04-04');
  const ledger = readEdges();
  assert.deepEqual(edgeProblems(tiers(), ledger, historyNames), []);
});

test('⑤ the gate goes red when a finding is unjudged, unstated, or not applied', () => {
  const ledger = readEdges(), bs = tiers();
  const kinds = (l, b = bs) => edgeProblems(b, l, historyNames).map((p) => p[0]);
  assert.ok(kinds({ ...ledger, reviewed: [] }).includes('edge-unjudged'));
  assert.ok(kinds({ ...ledger, reviewed: ledger.reviewed.map((r) => ({ ...r, at: '1879-03-27' })) }).includes('edge-unstated'), 'Q707474 states 04-04 for the dissolution, not 03-27');
  const shipped = structuredClone(bs);
  const t1 = shipped.find((x) => x.file === 'data/hist-admin1.js').b;
  const ok = t1.feats.find((f) => f[10] === 2890076); ok[2] = 1880; ok[3] = 1; ok[4] = 1;
  assert.ok(kinds(ledger, shipped).includes('edge-not-applied'));
  /* and applying the ledger to the shipped defect repairs it, without touching a ring */
  const rings = t1.rings.length;
  const touched = applyEdges(shipped.map((x) => ({ file: x.file, data: x.b })), ledger);
  assert.deepEqual(touched, ['data/hist-admin1.js']);
  assert.deepEqual(ok.slice(2, 5), [1879, 4, 4]);
  assert.equal(t1.rings.length, rings);
});

test('⑤ the finding is discovered from upstream\'s own event tags, not listed', () => {
  const rows = [['Ryukyu Domain', 3, 1872, 9, 14, 1880, 1, 1, [], {}, 1], ['Okinawa Prefecture', 4, 1880, 1, 1, 1886, 1, 1, [], {}, 2], ['Okinawa Prefecture', 4, 1886, 1, 1, 1901, 1, 1, [], {}, 3]];
  const tags = new Map([[1, { end_date: '1879', 'end_date:event': 'X becomes Y' }], [2, { start_date: '1880', 'start_date:event': 'X becomes Y' }], [3, { start_date: '1886' }]]);
  const r = successions([{ file: 'data/hist-admin1.js', feats: rows, tagsById: tags }]);
  assert.equal(r.pairs, 1); assert.equal(r.found.length, 1);
  assert.equal(r.found[0].end.raw, '1879'); assert.equal(r.found[0].start.raw, '1880');
  /* the same event in the same year is no finding */
  tags.get(2).start_date = '1879';
  assert.equal(successions([{ file: 'x', feats: rows, tagsById: tags }]).found.length, 0);
});

/* ── ⑥ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('⑥ Elam is unnamed before c. 3200 BCE, and the card says the bound is history\'s, not Wikidata\'s', () => {
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { NAME: 'Elam' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] } }] };
  const f = api.eraShown(fc, -4000).features[0];
  assert.equal(f.properties.NAME, '');
  assert.equal(f.properties._wBy, 'history');
  assert.equal(f.properties._wWd, -2699);
  const card = api.blankNote(f).lines.join(' ');
  assert.match(card, /historical record places the beginning/);
  assert.match(card, /3200 BC/); assert.match(card, /2700 BC/);
  assert.equal(api.eraShown(fc, -3100).features[0].properties.NAME, 'Elam');
  assert.deepEqual(eraSpanProblems(ctx), []);
});

test('⑥ a history bound is admitted only where it is earlier than every start Wikidata states', () => {
  const withRow = (edit) => { const ledger = structuredClone(ctx.ledger); edit(ledger.rows.find((r) => r.name === 'Elam')); return eraSpanProblems({ ...ctx, ledger }).map((p) => p[0]); };
  assert.ok(withRow((r) => { r.s = -2000; r.hs = -2000; r.history = 'from 2001 BCE'; }).includes('era-span-history-bound-not-earlier'));
  assert.ok(withRow((r) => { r.hs = -3000; }).includes('era-span-history-bound-not-hs'));
  assert.ok(withRow((r) => { r.sBy = 'tradition'; }).includes('era-span-row-bad-basis'));
});
