/* tests/hist-recon-expand-checks.test.mjs — the reconstruction reaches further back on finer parts
   (geoBoundaries at one level per dossier), across today's borders (`atomCountries`), and never with two
   answers for the same land on the same day (docs/HIST-RECONSTRUCTION.md §1, §3).

   Every rule is exercised by a case it must refuse, next to the case it must accept. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDossier, atomCountriesOf, catalogueView } from '../scripts/histrecon/dossier-check.mjs';
import { sameLandClaims, gbDatasetsOf, licenceUrlOf, isShareAlike, GOVERNANCE, GB_ROW, gbUpstreams, moduleUpstreams } from '../scripts/build-hist-admin-recon.mjs';
import { MANIFEST } from '../scripts/histrecon/atoms/geoboundaries.mjs';
import pc from 'polygon-clipping';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = [{ url: 'https://example.org/law', says: 'the law creates the units', accessed: '2026-10-06' }];

test('atomCountries: a unit across today\'s borders is judged over every named country\'s atoms — none may be left out', () => {
  const CAT = { XXA: [{ id: 'A1' }, { id: 'A2' }], XXB: [{ id: 'B1' }] };
  const D = { country: 'OTX', atomCountries: ['XXA', 'XXB'], atomSet: 'test', scope: { from: '1870-01-01', to: '1899-12-31' },
    units: [{ id: 'v', names: { en: 'Vilayet' }, spans: [{ from: '1870-01-01', precision: 'day', to: null, atoms: ['A1', 'A2', 'B1'], sources: src }] }] };
  assert.deepEqual(atomCountriesOf(D), ['XXA', 'XXB']);
  assert.equal(catalogueView(D, CAT).OTX.length, 3);
  assert.deepEqual(checkDossier(D, CAT).err, []);
  const missing = structuredClone(D); missing.units[0].spans[0].atoms = ['A1', 'A2'];
  assert.ok(checkDossier(missing, CAT).err.some((e) => /B1/.test(e)), 'the other country\'s atom left unassigned is a gap');
  const unknown = structuredClone(D); unknown.atomCountries = ['XXA', 'XXC'];
  assert.ok(checkDossier(unknown, CAT).err.some((e) => /atomCountries: no atoms for XXC/.test(e)));
  /* a dossier without atomCountries reads its own country exactly as before */
  assert.equal(catalogueView({ country: 'XXA' }, CAT), CAT);
});

test('same land, same day: two dossiers may not both answer — on one atom set by atom, across sets by country', () => {
  const D = (atomSet, from, to, extra = {}) => ({ country: 'XXA', atomSet, scope: { from, to }, ...extra });
  const atoms = [{ id: 'A1', group: 'g1' }, { id: 'A2', group: 'g2' }];
  /* accepted: a geoBoundaries dossier that ends the day before the Natural Earth one begins */
  assert.deepEqual(sameLandClaims([{ file: 'old', D: D('gb-adm2@x', '1967-05-27', '1996-09-30'), atoms }, { file: 'new', D: D('ne-admin1@x', '1996-10-01', '2019-12-31'), atoms }]), []);
  /* refused: one day of overlap across sets */
  assert.equal(sameLandClaims([{ file: 'old', D: D('gb-adm2@x', '1967-05-27', '1996-10-01'), atoms }, { file: 'new', D: D('ne-admin1@x', '1996-10-01', '2019-12-31'), atoms }]).length, 1);
  /* refused: the same atom in overlapping scopes on one set */
  assert.equal(sameLandClaims([{ file: 'a', D: D('s', '1900-01-01', '1950-12-31'), atoms }, { file: 'b', D: D('s', '1950-01-01', '1999-12-31'), atoms }]).length, 2);
  /* accepted: one set, the same scope, disjoint groups (the Russian Empire's regions) */
  assert.deepEqual(sameLandClaims([{ file: 'a', D: D('s', '1800-01-01', '1917-12-31', { atomGroups: ['g1'] }), atoms }, { file: 'b', D: D('s', '1800-01-01', '1917-12-31', { atomGroups: ['g2'] }), atoms }]), []);
  /* refused across sets when a cross-border dossier names the country */
  assert.equal(sameLandClaims([{ file: 'ott', D: { country: 'OTX', atomCountries: ['XXB', 'XXA'], atomSet: 'gb-adm2@x', scope: { from: '1870-01-01', to: '1922-10-31' } }, atoms }, { file: 'xxa', D: D('ne-admin1@x', '1920-01-01', '2019-12-31'), atoms }]).length, 1);
});

test('geoBoundaries parts: every dataset is pinned to a commit, and every licence a dossier relies on is a value with a URL', () => {
  const sets = Object.values(MANIFEST.datasets);
  assert.ok(sets.length > 400, 'the manifest lists the gbOpen release (459 datasets read 2026-10-06)');
  for (const d of sets) {
    assert.match(d.url, /\/wmgeolab\/geoBoundaries\/raw\/[0-9a-f]{7,40}\/releaseData\/gbOpen\//, d.iso + ' ' + d.level + ' is pinned to a commit');
    assert.ok(d.licence, d.iso + ' ' + d.level + ' states a licence');
  }
  const dir = path.join(ROOT, 'scripts', 'histrecon', 'dossiers');
  for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const D = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
    if (!/^gb-/.test(D.atomSet)) continue;
    const ds = gbDatasetsOf(D);
    assert.equal(ds.length, atomCountriesOf(D).length, n + ': every country it draws on has a dataset at its level');
    for (const d of ds) assert.ok(/^Public Domain$/i.test(d.licence) || licenceUrlOf(d.licence), n + ': the licence «' + d.licence + '» resolves to its text');
  }
});

test('share-alike: an ODbL or CC BY-SA part makes its record carry that licence; the credit row is one real source row', () => {
  assert.ok(isShareAlike('Open Data Commons Open Database License 1.0'));
  assert.ok(isShareAlike('Creative Commons Attribution-ShareAlike 3.0 Unported'));
  assert.ok(!isShareAlike('Creative Commons Attribution 4.0 International (CC BY 4.0)'));
  /* the declaration is pure data (the governance gate reads it sliced); what the dossiers USE is derived — every
     credit it implies must be declared, and every declared credit row must be a real source row */
  const declared = GOVERNANCE['data/hist-admin-recon.js'].upstreams;
  const used = [...gbUpstreams(), ...moduleUpstreams()];
  assert.ok(used.length > 0, 'the dossiers draw on geoBoundaries or a module with its own credit');
  for (const u of used) assert.ok(declared.some((d) => d.paidBy === u.paidBy), 'declared: the credit row «' + u.paidBy + '»');
  for (const u of gbUpstreams()) assert.equal(u.offeredUnder, isShareAlike(u.licence) ? u.licence : null);
  assert.ok(declared.some((d) => d.paidBy === GB_ROW && /per dataset/.test(d.licence) && /geoboundaries-manifest.json/.test(d.licenceUrl)), 'geoBoundaries is declared with its per-dataset licences as values');
  const ref = fs.readFileSync(path.join(ROOT, 'js', 'reference-data.js'), 'utf8');
  for (const d of declared.filter((x) => x.paidBy)) assert.ok(ref.includes("n:'" + d.paidBy + "'") || ref.includes('n:"' + d.paidBy + '"'), 'js/reference-data.js has the row «' + d.paidBy + '»');
  const lic = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  assert.match(lic, /share-alike licenses[\s\S]*made\s+available under the license of the source/);
});

test('union: a union the library refuses in one shot is computed pairwise, then on a sub-millimetre grid, and the step is reported', async () => {
  const { robustUnion } = await import('../scripts/build-hist-admin-recon.mjs');
  const sq = (x0, x1, e = 0) => [[[[x0, 0], [x1, 0 + e], [x1, 1], [x0, 1], [x0, 0]]]];
  const logs = [];
  /* two touching squares — the ordinary case is unioned exactly, without a snap */
  const u = robustUnion([sq(0, 1), sq(1, 2)], 'plain', (m) => logs.push(m));
  assert.equal(u.length, 1);
  assert.equal(logs.length, 0, 'no grid is used when the exact union succeeds');
  const one = sq(0, 1);
  assert.equal(robustUnion([one], 'one'), one, 'a single atom is returned as it is');
  /* a library that refuses more than two at once: the pairwise tree answers, and says so */
  const two = (...gs) => { if (gs.length > 2) throw new Error('Infinite loop when putting segment endpoints'); return pc.union(...gs); };
  const said = [];
  assert.equal(robustUnion([sq(0, 1), sq(1, 2), sq(2, 3)], 'many', (m) => said.push(m), two).length, 1);
  assert.match(said.join(' '), /computed pairwise/);
  /* when pairwise also fails, the whole-set union of @turf/union answers, and says so */
  const told = [];
  assert.equal(robustUnion([sq(0, 1), sq(1, 2)], 'turf', (m) => told.push(m), () => { throw new Error('no'); }).length, 1);
  assert.match(told.join(' '), /computed by @turf.union/);
  /* a union that fails off the grid and succeeds on it: retried on 1e-9°, and the retry is reported */
  const onGrid = (gs) => gs.every((g) => g.every((p) => p.every((r) => r.every(([x, y]) => Math.round(x * 1e9) / 1e9 === x && Math.round(y * 1e9) / 1e9 === y))));
  const picky = (...gs) => { if (!onGrid(gs)) throw new Error('Infinite loop when putting segment endpoints'); return [[[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]]]; };
  const seen = [];
  const v = robustUnion([sq(0, 1, 1e-13), sq(1, 2)], 'drift', (m) => seen.push(m), picky, () => { throw new Error('whole refused'); });
  assert.equal(v.length, 1);
  assert.match(seen.join(' '), /recomputed pairwise on a 1e-9° grid/);
  /* a union that fails on every grid is an error, never an empty shape */
  assert.throws(() => robustUnion([sq(0, 1), sq(1, 2)], 'broken', () => {}, () => { throw new Error('x'); }, () => { throw new Error('y'); }), /failed even pairwise on a 1e-8° grid/);
});

test('dossier-check: two dossiers under one polity key that name different countries do not share a catalogue', async () => {
  /* the rule is the catalogue cache key, not the catalogues — it is evaluated with a loader that serves only the
     countries it is asked for, so nothing is fetched (a CI run once failed here on a geoBoundaries 504) */
  const os = await import('node:os');
  const { checkFiles } = await import('../scripts/histrecon/dossier-check.mjs');
  const CAT = { XXA: [{ id: 'A1' }], XXB: [{ id: 'B1' }] };
  const loads = [];
  const load = async (set, cs) => { loads.push(set + '|' + cs.join(',')); return Object.fromEntries(cs.filter((c) => CAT[c]).map((c) => [c, CAT[c]])); };
  const D = (cs, atoms) => ({ country: 'PKX', atomSet: 'test', atomCountries: cs, scope: { from: '1900-01-01', to: '1930-12-31' },
    units: [{ id: 'u', names: { en: 'Unit', ja: '単位' }, spans: [{ from: '1900-01-01', precision: 'day', to: null, atoms, sources: src }] }] });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'intmap-dossier-cache-'));
  try {
    /* fewest countries first — the order that used to reuse the smaller catalogue for the larger dossier */
    const small = path.join(tmp, 'small.json'), large = path.join(tmp, 'large.json');
    fs.writeFileSync(small, JSON.stringify(D(['XXA'], ['A1'])));
    fs.writeFileSync(large, JSON.stringify(D(['XXA', 'XXB'], ['A1', 'B1'])));
    const out = [];
    assert.equal(await checkFiles([small, large], { load, log: (m) => out.push(m) }), 0, out.join(' / '));
    assert.deepEqual(loads, ['test|XXA', 'test|XXA,XXB'], 'each country list is loaded for itself');
    /* a dossier that names the same countries again reuses the catalogue */
    loads.length = 0;
    assert.equal(await checkFiles([small, large, small], { load, log: () => {} }), 0);
    assert.equal(loads.length, 2);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  /* the shipped dossiers: a polity key whose dossiers name different country lists (British India before and
     after Burma) asks the loader once per list — the same rule on the files it was written for */
  const dir = path.join(ROOT, 'scripts', 'histrecon', 'dossiers');
  const groups = new Map();
  for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const J = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
    if (!J.atomCountries) continue;
    const k = J.atomSet + '|' + J.country;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ n, set: J.atomSet, cs: J.atomCountries.join(',') });
  }
  const mixed = [...groups.values()].find((g) => new Set(g.map((x) => x.cs)).size > 1);
  if (!mixed) return;
  const order = mixed.slice().sort((p, q) => p.cs.split(',').length - q.cs.split(',').length);
  loads.length = 0;
  await checkFiles(order.map((x) => path.join(dir, x.n)), { load: async (set, cs) => { loads.push(set + '|' + cs.join(',')); return Object.fromEntries(cs.map((c) => [c, []])); }, log: () => {} });
  assert.deepEqual(loads, [...new Set(order.map((x) => x.set + '|' + x.cs))]);
});

test('sample points by scanline are the fill\'s sample points — same cells, same order, same cap — on shipped rows', async () => {
  const { samplePoints } = await import('../scripts/build-hist-admin-fill.mjs');
  const { samplePointsFast } = await import('../scripts/histrecon/sample-points.mjs');
  const vm = await import('node:vm');
  const w = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', 'hist-admin-recon.js'), 'utf8'), { window: w });
  const d = w.__HISTADMRECON;
  let n = 0;
  for (let k = 0; k < d.feats.length; k += Math.max(1, Math.floor(d.feats.length / 400))) {
    const polys = d.feats[k][8].map((poly) => poly.map((ri) => d.rings[ri]).filter((r) => r && r.length >= 4)).filter((p) => p.length);
    if (!polys.length) continue;
    const a = samplePoints(polys), b = samplePointsFast(polys);
    assert.equal(b.length, a.length, 'row ' + k);
    assert.equal(!!b.vertex, !!a.vertex, 'row ' + k);
    assert.deepEqual({ ...b.win }, { ...a.win }, 'row ' + k);
    for (let i = 0; i < a.length; i++) assert.deepEqual(b[i], a[i], 'row ' + k + ' point ' + i);
    n++;
  }
  assert.ok(n > 100, 'compared ' + n + ' rows');
});

test('withheld ground: the fill yields where research found the line unknown, and refuses to build without that record', async () => {
  const os = await import('node:os');
  const { recordUnits } = await import('../scripts/build-hist-admin-fill.mjs');
  const { withheldFile } = await import('../scripts/histrecon/withheld-file.mjs');
  const { HIST_ADMIN_GAPS } = await import('../js/border-coast.js');
  const G = HIST_ADMIN_GAPS.find((g) => g.reconstructed);
  assert.equal(G.withheld, true, 'the reconstruction declares that it states withheld ground');
  const prev = process.env.INTMAP_HISTRECON_CACHE;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intmap-withheld-'));
  try {
    process.env.INTMAP_HISTRECON_CACHE = dir;
    /* missing: an error that says what to run — never a fill built as if nobody had looked */
    assert.throws(() => recordUnits([G.file]), /withheld ground of the reconstruction is missing[\s\S]*build-hist-admin-recon/);
    /* present: its windows are record units like the drawn rows, marked withheld */
    fs.writeFileSync(withheldFile(), JSON.stringify({ units: [{ key: 'XXA', s: 19910101, e: 19970601, what: 'test', polys: [[[[60, 40], [61, 40], [61, 41], [60, 41], [60, 40]]]] }] }));
    const units = recordUnits([G.file]);
    const w = units.filter((u) => u.withheld);
    assert.equal(w.length, 1);
    assert.deepEqual([w[0].s, w[0].e], [19910101, 19970601]);
    assert.deepEqual(w[0].bb, [60, 40, 61, 41]);
    assert.ok(units.length > w.length, 'the drawn rows are still read');
  } finally {
    if (prev == null) delete process.env.INTMAP_HISTRECON_CACHE; else process.env.INTMAP_HISTRECON_CACHE = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
