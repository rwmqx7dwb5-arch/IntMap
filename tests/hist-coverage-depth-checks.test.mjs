/* ============================================================================
 *  hist-coverage-depth — the records spliced into the first subdivision tier are ONE list, and
 *  every reader of them reads that list   (HIST_ADMIN_GAPS (js/border-coast.js))
 * ----------------------------------------------------------------------------
 *  Before: the gap records were written in js/time-admin1.js (`const GAPS = [ … ]`) and a regex in
 *  scripts/hist-fidelity.mjs `bundles()` held a second copy of the same judgement. Adding a third
 *  record — the surveyed atlases scripts/build-hist-admin-surveys.mjs writes — would have been drawn
 *  and not measured, or measured and not drawn (.agents/rules/no-ad-hoc-hardcoding.md §1).
 *
 *    ① the layer IMPORTS the list and holds no literal list of its own;
 *    ② the fidelity gate measures every record of the list that is built;
 *    ③ every surveyed record that is built passes its builder's offline `--check`;
 *    ④ the layer's note counts DERIVED and SURVEYED rows apart, and says of each what is true of it
 *       — evaluated, not read (#R505): `note()` is lifted from the shipped source and run;
 *    ⑤ a surveyed row's own dates reach the popup: the splice carries them and `fcAt` reads them;
 *    ⑥ the popup names a derived edge's basis;
 *    ⑦–⑪ the SHIPPED bundles: licences sorted by the publishers' own SOURCE, every row opening on a
 *       day its publisher states, the fill answering Russia, Greenland and Australia, the fill's era
 *       record being the composition the reader sees, and the list naming exactly the survey files;
 *    ⑫ zoomed in, a surveyed row's line is its publisher's outline (data/border-detail/), finer than
 *       the overview and never coarser, and the non-commercial record's detail is fragments of its own.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { HIST_ADMIN_GAPS } from '../js/border-coast.js';
import { bundles } from '../scripts/hist-fidelity.mjs';
import { loadDoor } from '../scripts/build-hist-tiles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const TA = rd('js/time-admin1.js');

test('① js/time-admin1.js imports HIST_ADMIN_GAPS and writes no second list', () => {
  const code = codeOnly(TA);
  assert.match(code, /^\s*import\s*\{[^}]*\bHIST_ADMIN_GAPS\b[^}]*\}\s*from\s*'\.\/border-coast\.js';/m, 'the layer imports the one list');
  assert.match(code, /const GAPS = HIST_ADMIN_GAPS;/, 'and its GAPS is that list, not a copy of it');
  /* no file a gap record lives in is spelled in the layer's code — a second list would have to */
  for (const g of HIST_ADMIN_GAPS) {
    assert.ok(!code.includes("'" + g.file + "'"), g.file + ' is spelled in js/time-admin1.js — a second copy of the list');
    assert.ok(!code.includes("'" + g.global + "'"), g.global + ' is spelled in js/time-admin1.js — a second copy of the list');
  }
});

test('② scripts/hist-fidelity.mjs measures every gap record that is built', () => {
  const measured = new Set(bundles().map((x) => x.file));
  const built = HIST_ADMIN_GAPS.map((g) => g.file).filter((f) => existsSync(join(ROOT, f)));
  assert.ok(built.length > 0, 'no gap record is built at all — the check would be measuring nothing');
  for (const f of built) assert.ok(measured.has(f), f + ' is built and drawn, and the fidelity gate does not measure it');
  /* …and nothing else: every bundle it reads is a tier or a record of the list */
  for (const f of measured) assert.ok(/^data\/hist-admin\d+\.js$/.test(f) || built.includes(f), f + ' is measured but is neither a tier nor a listed gap record');
});

test('③ every surveyed gap record that is built passes its builder\'s offline --check', (t) => {
  const surveyed = HIST_ADMIN_GAPS.filter((g) => g.derived === false);
  const absent = surveyed.filter((g) => !existsSync(join(ROOT, g.file)));
  if (absent.length) {
    /* the builder's --check holds EVERY surveyed record; one not built here cannot be checked here */
    t.skip(absent.map((g) => g.file).join(', ') + ' not built in this tree — node scripts/build-hist-admin-surveys.mjs writes it');
    return;
  }
  const r = spawnSync(process.execPath, ['scripts/build-hist-admin-surveys.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, 'build-hist-admin-surveys --check failed:\n' + (r.stderr || r.stdout));
});

/* `note()` runs inside the layer's factory; it is lifted from the shipped source and given exactly
   the names it reads: the coverage answer, the first tier's collection, the list, and the tuple
   helpers (LA hands back the tuple; _LT picks the reader's slot — en 0, jp 1). */
function noteWith(features, slot) {
  const ctx = vm.createContext({
    coverage: () => ({ active: true, units: features.length + 3, known: null }),
    T1: { fc: () => ({ type: 'FeatureCollection', features }) },
    GAPS: HIST_ADMIN_GAPS,
    LA: (...a) => a,
    _LT: { arr: (a) => (Array.isArray(a) ? (a[slot] || a[0]) : String(a)) },
  });
  vm.runInContext(liftFunction(codeOnly(TA), 'note'), ctx, { filename: 'time-admin1.js#note' });
  return vm.runInContext('note()', ctx);
}
const gapRow = (set) => ({ properties: { _gap: 1, _gapSet: set } });
const ohmRow = () => ({ properties: { _gap: 0, _gapSet: -1 } });

test('④ the note counts derived and surveyed rows apart, and says of each what is true', () => {
  const D = HIST_ADMIN_GAPS.map((g, i) => [g, i]).filter(([g]) => g.derived === true).map(([, i]) => i);
  const S = HIST_ADMIN_GAPS.map((g, i) => [g, i]).filter(([g]) => g.derived === false).map(([, i]) => i);
  assert.ok(D.length && S.length, 'the list holds both kinds');
  /* 2 derived, 3 surveyed, 1 OpenHistoricalMap row */
  const feats = [gapRow(D[0]), gapRow(D[D.length - 1]), gapRow(S[0]), gapRow(S[0]), gapRow(S[S.length - 1]), ohmRow()];
  const en = noteWith(feats, 0), jp = noteWith(feats, 1);
  assert.match(en, / 2 of them are outlines OpenHistoricalMap holds no record for, derived by IntMap/, 'the derived sentence counts only derived rows');
  assert.match(en, / 3 of them are dated records published by national and research atlases/, 'the surveyed rows are counted apart');
  assert.match(jp, /うち 2 件は OpenHistoricalMap に記録が無いため、公開データ/);
  assert.match(jp, /うち 3 件は、OpenHistoricalMap に無い単位を、各国・研究機関の歴史地図が日付とともに記録したもの/);
  /* the record that is silent is no longer named as OpenHistoricalMap alone */
  assert.match(en, /one the records are still silent about/);
  assert.doesNotMatch(en, /one OpenHistoricalMap is still silent about/);
  /* with only surveyed rows, nothing is said to be derived */
  const onlySurvey = noteWith([gapRow(S[0]), ohmRow()], 0);
  assert.doesNotMatch(onlySurvey, /derived by IntMap/, 'a surveyed row was described as an IntMap derivation');
  assert.match(onlySurvey, / 1 of them are dated records/);
  /* with only derived rows, nothing is said to be surveyed */
  const onlyDerived = noteWith([gapRow(D[0])], 0);
  assert.doesNotMatch(onlyDerived, /national and research atlases/);
  /* a row whose record is not in the list is counted as neither — never guessed into one */
  const unknown = noteWith([gapRow(HIST_ADMIN_GAPS.length + 5)], 0);
  assert.doesNotMatch(unknown, /of them are/);
});

/* ⑤ the dates: the splice (run where the record is, js/hist-bundles.js) carries each gap record's own
   `dates` and `dateSemantics`, and the layer's `fcAt` reads a gap row's by its record and its own row */
test('⑤ a surveyed row carries its publisher\'s dates from the splice to the feature', async () => {
  /* the splice and head, evaluated through the door's own job (the tile builder's loader) over synthetic records */
  const D = loadDoor();
  assert.ok(D && typeof D.histJob === 'function', 'the door exposes its job');
  const enc = (g, o) => new TextEncoder().encode('window.' + g + '=' + JSON.stringify(o) + ';').buffer;
  const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
  const main = { v: 1, levels: [3, 4], dateSemantics: 'exclusive-end', dates: { 77: { start: { raw: '1850', precision: 'year' }, end: { raw: null } } },
    rings: [ring], feats: [['A', 4, 1850, 1, 1, 9999, 1, 1, [[0]], { en: 'A' }, 77]] };
  const derived = { v: 1, src: 'derived', rings: [ring], feats: [['K', 4, 1000, 1, 1, 1871, 8, 29, [[0]], { en: 'K' }, null]] };
  const sDates = { 0: { start: { raw: '1867-07-01', precision: 'day' }, end: { raw: '1870', precision: 'year', derived: true, basis: 'the next survey no longer shows it' } } };
  const survey = { v: 1, src: 'survey', dateSemantics: 'exclusive-end', sources: { x: { publisher: 'P' } }, dates: sDates, rings: [ring],
    feats: [['S', 4, 1867, 7, 1, 1870, 1, 1, [[0]], { en: 'S' }, 'x', 'x:1', 'CAN']] };
  const S = {};
  const head = await D.histJob(S, { op: 'open', global: '__M', bytes: enc('__M', main), gaps: [
    { global: '__K', bytes: enc('__K', derived) }, { global: '__ABSENT', bytes: null }, { global: '__S', bytes: enc('__S', survey) }] }, () => {});
  const plain = (x) => JSON.parse(JSON.stringify(x));
  assert.equal(head.gapDates.length, 3, 'one entry per gap record, absent ones included');
  assert.equal(head.gapDates[0], null, 'a derived record states no dates');
  assert.equal(head.gapDates[1], null, 'a record that could not be read states none');
  assert.deepEqual(plain(head.gapDates[2]), sDates, 'the surveyed record\'s own dates ride on the head');
  assert.equal(head.gapPools[2].dateSemantics, 'exclusive-end');
  assert.equal(head.rowDates, undefined, 'the tier keys its dates by relation id; nothing row-keyed is lifted');
  /* a surveyed record opened on its own (the tile builder does that) lifts its row-keyed dates into the head */
  const own = await D.histJob({}, { op: 'open', global: '__S', bytes: enc('__S', survey) }, () => {});
  assert.deepEqual(plain(own.rowDates), sDates, 'a record whose rows hold no relation id keeps its dates in the head');

  /* fcAt, lifted and run against the spliced record */
  const code = codeOnly(TA);
  const fctx = vm.createContext({ _ymd: (y, m, d) => y * 10000 + m * 100 + d, cfg: { key: 'a1', gaps: HIST_ADMIN_GAPS }, SORT_PROP: '_s', sortKeyOf: () => 0, areaOf: () => 0,
    geomOf: () => ({ type: 'Polygon', coordinates: [ring] }), nameOf: (f) => f[0] });
  vm.runInContext(liftFunction(code, 'claimKeyOf') + '\nasync ' + liftFunction(code, 'fcAt'), fctx);   /* the lift starts at `function`; fcAt is declared async */
  const d = Object.assign({}, head, { feats: S.__M.d.feats, dates: main.dates });
  fctx._H = { at: async () => [0, 1, 2] };
  const fc = await vm.runInContext('fcAt', fctx)(d, 1868, 1, 1);
  const byName = Object.fromEntries(fc.features.map((f) => [f.properties.NAME, f.properties]));
  assert.deepEqual(plain(byName.A.dates), main.dates[77], 'an OpenHistoricalMap row still reads its dates by relation id');
  assert.deepEqual(plain(byName.S.dates), sDates[0], 'the surveyed row reads its publisher\'s dates by its own row');
  assert.equal(byName.S.dateSemantics, 'exclusive-end');
  assert.equal(byName.K.dates, undefined, 'a derived row states no source dates — the popup says «?»');
});

/* ⑥ and the popup says which edge was inferred, in the record's own words, beside the raw it prints */
test('⑥ the popup names a derived edge\'s basis; a null raw is still «?»', async () => {
  const { langRegistry } = await import('./helpers/import-module.mjs');
  const c = vm.createContext({ HOST: { lang: 'en' }, window: {}, IntMapLang: langRegistry() });
  vm.runInContext(liftFunction(codeOnly(rd('js/map-ui.js')), '_eraSourceDates'), c);
  c.props = { dates: { start: { raw: '1867-07-01', precision: 'day' }, end: { raw: '1870', precision: 'year', derived: true, basis: 'the next survey no longer shows it' } } };
  assert.equal(vm.runInContext('_eraSourceDates(props)', c), 'Source dates: 1867-07-01 – 1870 · end derived: the next survey no longer shows it');
  c.HOST.lang = 'jp';
  assert.equal(vm.runInContext('_eraSourceDates(props)', c), '出典の日付: 1867-07-01 – 1870 · 終わりは導出: the next survey no longer shows it');
  c.props = { dates: { start: { raw: null }, end: { raw: null } } };
  assert.equal(vm.runInContext('_eraSourceDates(props)', c), '出典の日付: ? – ?', 'nothing is invented for an edge nobody dated');
});

/* ── ⑦–⑪ the SHIPPED bundles ──────────────────────────────────────────────────────────────────
   Read as the page reads them (one `window.X=` assignment, evaluated). A bundle that is not built in
   this tree is skipped with the reason — never passed. */
function shipped(rel) {
  if (!existsSync(join(ROOT, rel))) return null;
  const w = {};
  vm.runInNewContext(rd(rel), { window: w });
  return w[Object.keys(w)[0]];
}
const SURVEYS = HIST_ADMIN_GAPS.filter((g) => g.derived === false);
/* the publishers' own SOURCE values, discovered as the builder discovers them */
async function harvesterSources() {
  const dir = join(ROOT, 'scripts', 'histsurveys');
  const by = new Map();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort()) {
    const m = await import(pathToFileURL(join(dir, f)).href);
    if (m.SOURCE) by.set(m.SOURCE.key, m.SOURCE);
  }
  return by;
}

test('⑦ each publisher sits in the record its own SOURCE licence allows — no non-commercial one in the open record', async (t) => {
  const SRC = await harvesterSources();
  assert.ok(SRC.size > 0, 'no harvester declares a SOURCE — the check would be measuring nothing');
  const built = SURVEYS.filter((G) => existsSync(join(ROOT, G.file)));
  if (!built.length) { t.skip('no survey bundle is built in this tree — node scripts/build-hist-admin-surveys.mjs writes them'); return; }
  for (const G of built) {
    const d = shipped(G.file);
    const keys = Object.keys(d.sources || {});
    assert.ok(keys.length > 0, G.file + ' credits no publisher at all');
    for (const k of keys) {
      const S = SRC.get(k);
      assert.ok(S, G.file + ' credits «' + k + '», which no harvester in scripts/histsurveys/ declares');
      assert.equal(!!S.nonCommercial, !!G.nonCommercial, G.file + ' credits ' + k + ', whose own SOURCE says nonCommercial=' + !!S.nonCommercial);
    }
    /* and a credited publisher is one the file draws rows from — no credit for being asked */
    const used = new Set(d.feats.map((f) => f[10]));
    for (const k of keys) assert.ok(used.has(k), G.file + ' credits ' + k + ' and draws no row from it');
  }
});

test('⑧ every survey row opens on a day its publisher states, or says it was derived and from what', (t) => {
  const built = SURVEYS.filter((G) => existsSync(join(ROOT, G.file)));
  if (!built.length) { t.skip('no survey bundle is built in this tree'); return; }
  for (const G of built) {
    const d = shipped(G.file);
    d.feats.forEach((f, i) => {
      const dt = d.dates && d.dates[i];
      const st = dt && dt.start;
      assert.ok(st && st.raw, G.file + ' row ' + i + ' (' + f[0] + ') carries no source start date');
      if (st.derived) {
        assert.ok(typeof st.basis === 'string' && st.basis.trim(), G.file + ' row ' + i + ' (' + f[0] + ') marks its start derived and names no basis');
      } else {
        /* «1867» opens on 1 January of it, «1867-07» on the 1st of July — any other day would be invented */
        const m = /^(-?\d+)(?:-(\d\d))?(?:-(\d\d))?$/.exec(st.raw);
        assert.ok(m, G.file + ' row ' + i + ' states an unreadable start «' + st.raw + '»');
        const want = [Number(m[1]), m[2] ? Number(m[2]) : 1, m[3] ? Number(m[3]) : 1];
        assert.deepEqual([f[2], f[3], f[4]], want,   /* the bundle's arrays are of the vm's realm; compare values */
 G.file + ' row ' + i + ' (' + f[0] + ') opens on ' + f.slice(2, 5).join('-') + ' but its publisher states ' + st.raw);
      }
      /* an end edge the publisher did not state is open (raw null) or derived WITH its basis */
      if (dt.end && dt.end.derived) assert.ok(typeof dt.end.basis === 'string' && dt.end.basis.trim(), G.file + ' row ' + i + ' marks its end derived and names no basis');
    });
  }
});

test('⑨ the fill lists its unplaced units and answers Russia, Greenland and Australia on 2020-07-01', (t) => {
  const FILL = HIST_ADMIN_GAPS.find((g) => g.global === '__HISTADMFILL');
  assert.ok(FILL, 'the list names the fill record');
  const d = shipped(FILL.file);
  if (!d) { t.skip(FILL.file + ' not built in this tree — node scripts/build-hist-admin-fill.mjs writes it'); return; }
  assert.ok(Array.isArray(d.unplaced), FILL.file + ' has no `unplaced` list — it was built by a builder older than scripts/build-hist-admin-fill.mjs');
  const at = 20200701;
  const inForce = new Map();
  for (const f of d.feats) {
    if (f[2] * 1e4 + f[3] * 100 + f[4] <= at && f[5] * 1e4 + f[6] * 100 + f[7] > at) inForce.set(f[11], (inForce.get(f[11]) || 0) + 1);
  }
  /* the three the measurement named: Russia (its whole-country rule had been blocked by ground no polity
     covers), Greenland (placed only by Cliopatria), Australia (Jervis Bay is smaller than the sample grid) */
  for (const iso of ['RUS', 'GRL', 'AUS']) assert.ok(inForce.get(iso) > 0, iso + ' has no fill row in force on 2020-07-01');
});

/* ⑩ evaluated, not read (#R505). `eraIndex` is not exported, so it is lifted from the shipped source and run
   with its own free names supplied: `loadBundle` records which files it is asked for and hands back
   synthetic records, `fs.existsSync` says which of them are present. (Running the builder itself,
   `--only GRL --diagnose`, needs Wikidata's cache and the whole outline set — minutes, and not offline.) */
function runEraIndex(present) {
  const code = codeOnly(rd('scripts/build-hist-admin-fill.mjs'));
  const ring = [[0, 0], [10, 0], [10, 10], [0, 0]];
  const synth = {
    'data/cshapes.js': { rings: [ring], feats: [['C', 0, 1886, 1, 1, 2020, 1, 1, [[0]], {}]] },
    'data/hist-borders.js': { window: [1689, 1886], rings: [ring], feats: [['H', 0, 1700, 1, 1, 1886, 1, 1, [[0]], {}]] },
    'data/hist-clio.js': { rings: [ring], feats: [['L', 0, -3000, 1, 1, 2025, 1, 1, [[0]], {}], ['R', 0, -3000, 1, 1, 2025, 1, 1, [[0]], { r: 1 }]] },
    'data/hist-eras-rest.js': { rings: [ring], snaps: [{ y: -2000, feats: [['S', 0, [[0]]]] }] },
    'data/hist-eras.js': { rings: [ring], snaps: [{ y: -2000, feats: [['S', 0, [[0]]]] }] },
  };
  const asked = [];
  const ctx = vm.createContext({
    ROOT: '/r', path: { join: (...a) => a.join('/') },
    fs: { existsSync: (p) => present.some((f) => p.endsWith('/' + f)) },
    loadBundle: (rel) => { asked.push(rel); return { global: 'x', data: synth[rel] }; },
    ymd: (y, m, d) => y * 10000 + m * 100 + d,
    meets: (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]),
  });
  vm.runInContext(liftFunction(code, 'bbox') + '\n' + liftFunction(code, 'eraIndex'), ctx, { filename: 'build-hist-admin-fill.mjs#eraIndex' });
  const idx = vm.runInContext('eraIndex()', ctx);
  const here = idx.meeting([1, 1, 2, 2]);
  return { asked, idx, here, recs: new Set(here.map((u) => u.rec)), cshapes: synth['data/cshapes.js'] };
}
test('⑩ the fill\'s era record is the composition the reader sees: Cliopatria and the sheet remainder when present', () => {
  const both = runEraIndex(['data/hist-clio.js', 'data/hist-eras-rest.js']);
  assert.ok(both.asked.includes('data/hist-clio.js'), 'eraIndex did not read data/hist-clio.js');
  assert.ok(both.asked.includes('data/hist-eras-rest.js'), 'eraIndex did not read data/hist-eras-rest.js');
  assert.ok(!both.asked.includes('data/hist-eras.js'), 'eraIndex read the whole sheets beside their remainder — the band chain, not the composition');
  assert.ok(both.recs.has('cl'), 'a Cliopatria polity does not answer «which polity is here»');
  /* a realm row is the union of the member rows drawn beside it, not a polity of its own */
  assert.equal(both.here.filter((u) => u.rec === 'cl').length, 1, 'a Cliopatria realm row answered as a polity');
  /* Cliopatria answers up to the end of CShapes' window; after it the present-day map answers */
  const cl = both.here.find((u) => u.rec === 'cl');
  assert.equal(cl.e, both.idx.present, 'Cliopatria answers to the end of CShapes\' window, no further');
  /* the day after CShapes' last year, derived from the CShapes record eraIndex read — the builder's own
     `ceil = ymd(csMax + 1, 1, 1)`, not a date copied here */
  const csMax = Math.max(...both.cshapes.feats.map((f) => f[5]));
  assert.equal(both.idx.present, (csMax + 1) * 10000 + 1 * 100 + 1, 'the present-day map answers from 1 January after CShapes\' last year');
  /* without the composed files, the band chain answers */
  const chain = runEraIndex([]);
  assert.ok(chain.asked.includes('data/hist-eras.js') && !chain.asked.includes('data/hist-clio.js'), 'with no composed files the sheets themselves must answer');
  assert.ok(!chain.recs.has('cl'));
});

test('⑪ the list\'s records are exactly the files the survey builder governs, each licensed as it declares', async (t) => {
  const { GOVERNANCE } = await import('../scripts/build-hist-admin-surveys.mjs');
  assert.deepEqual(SURVEYS.map((g) => g.file).sort(), Object.keys(GOVERNANCE).sort(),
    'HIST_ADMIN_GAPS (js/border-coast.js) marks as records (derived:false) exactly the files scripts/build-hist-admin-surveys.mjs builds');
  for (const G of SURVEYS) {
    assert.equal(!!GOVERNANCE[G.file].licence, !!G.nonCommercial, G.file + ': its governance licence and the list\'s nonCommercial disagree');
    const d = shipped(G.file);
    if (!d) { t.diagnostic(G.file + ' not built in this tree — its file licence is not checked'); continue; }
    assert.equal(!!d.licence, !!G.nonCommercial, G.file + ' states licence «' + d.licence + '» but the list says nonCommercial=' + !!G.nonCommercial);
    if (G.nonCommercial) assert.equal(d.licence, GOVERNANCE[G.file].licence, G.file + ': the file and its governance name different licences');
  }
});

/* ── ⑫ zoomed in, a surveyed row is drawn from its PUBLISHER'S outline, not the overview's ────────────
   The shipped rings are simplified to the first tier's overview tolerance (0.004°, ~400 m). Past the
   zoom where js/border-coast.js asks data/border-detail/ for an outline, a surveyed row's line comes
   from that row's detail fragments, which scripts/build-border-detail.mjs builds from the harvester's
   own coordinates with no tolerance — proven to be the source of the shipped ring (simplifying them
   the builder's way reproduces it exactly). This reads the fragments the page would read and asks:
     · is every vertex the overview draws as BORDER present in the detail (within the overview's own
       tolerance)? A coast run is left to js/coast-line.js exactly as for the OHM detail, so a vertex
       the coast band (scripts/build-border-coast.mjs markRing, the same `inlandKm` and band) claims is
       not required — any other one missing would mean the detail is coarser than, or not, the outline;
     · does the detail carry at least as many vertices as the overview's border vertices?
     · is the non-commercial record's geometry in fragments of its own, each stating its licence? */
test('⑫ every surveyed row with detail is drawn from finer publisher geometry; the NC detail is fragments of its own', async (t) => {
  const OUT = join(ROOT, 'data', 'border-detail');
  const built = SURVEYS.filter((g) => existsSync(join(ROOT, g.file)));
  if (!built.length) { t.skip('no surveyed record is built in this tree'); return; }
  assert.ok(existsSync(join(OUT, 'index.json')), 'data/border-detail/ is not placed — `npm run data:pull` (it lives outside git, data-assets.json)');
  /* the merged view the builder and its gate hold: index.json plus each surveyed set's own index */
  const { loadIndex } = await import('../scripts/build-border-detail.mjs');
  const top = JSON.parse(rd('data/border-detail/index.json')), index = loadIndex(OUT);
  const { water, INLAND_KM } = await import('../scripts/build-border-coast.mjs');
  const W = water();
  const familyOf = new Map();
  for (const G of built) {
    const d = shipped(G.file), base = G.file.replace(/^.*\//, '').replace(/\.js$/, '');
    const entries = index.sets && index.sets[G.global], pub = index.publishers && index.publishers[G.global];
    assert.ok(entries && pub, G.file + ' is built but data/border-detail/ holds no detail for it — `node scripts/build-border-detail.mjs --sets ' + base + '`');
    /* its entries are NOT in index.json, which every zoomed view reads — only a pointer to its own index */
    assert.ok(!(top.sets && top.sets[G.global]) && top.external && top.external[G.global] === 'index-' + base + '.json', G.file + ': its detail entries must live in index-' + base + '.json, pointed to from index.json');
    assert.equal(pub.targetTolerance, 0, G.file + ': its detail must be the publisher\'s geometry, not simplified');
    assert.equal(pub.licence || null, d.licence || null, G.file + ': the index entry must state the record\'s own licence');
    if (G.nonCommercial) assert.equal(pub.licence, 'CC BY-NC-SA 4.0');
    const rows = Object.keys(entries);
    assert.ok(rows.length > d.feats.length * 0.9, G.file + ': only ' + rows.length + ' of ' + d.feats.length + ' rows have detail');
    const cache = new Map(), body = (p) => { if (!cache.has(p)) cache.set(p, JSON.parse(readFileSync(join(OUT, p), 'utf8'))); return cache.get(p); };
    const tol = d.tolerance, cell = tol, K = (x, y) => Math.floor(x / cell) + ':' + Math.floor(y / cell);
    let checked = 0, borderAll = 0, detailAll = 0;
    for (const i of rows) {
      const [key, parts] = entries[i];
      const lines = [];
      for (const [p] of parts) {
        assert.match(p, new RegExp('^' + base + '-[a-f0-9]{16}\\.json$'), G.file + ' row ' + i + ' reads a fragment of another family: ' + p);
        const b = body(p);
        assert.equal(b.licence || null, d.licence || null, p + ' states licence «' + b.licence + '», its record «' + d.licence + '»');
        familyOf.set(p, G.global);
        lines.push(...(b.lines[key] || []));
      }
      /* the detail's vertices, bucketed at the overview tolerance */
      const grid = new Map(); let detailV = 0;
      for (const l of lines) for (const v of l) { detailV++; const k = K(v[0], v[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(v); }
      const near = (v) => { const cx = Math.floor(v[0] / cell), cy = Math.floor(v[1] / cell);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of grid.get((cx + a) + ':' + (cy + b)) || []) if (Math.hypot(q[0] - v[0], q[1] - v[1]) <= tol) return true;
        return false; };
      let border = 0;
      for (const poly of d.feats[i][8]) for (const ri of poly) {
        const r = d.rings[ri];
        for (let n = 0; n < r.length - 1; n++) {
          const v = r[n];
          if (!(W.inlandKm(v[0], v[1], INLAND_KM) > INLAND_KM)) continue;   // on the coast band: js/coast-line.js draws it
          border++;
          assert.ok(near(v), G.file + ' row ' + i + ' («' + d.feats[i][0] + '»): overview border vertex ' + v + ' is not in its detail — the detail is not this outline at finer precision');
        }
      }
      borderAll += border; detailAll += detailV;
      assert.ok(detailV >= border, G.file + ' row ' + i + ': detail has ' + detailV + ' vertices, the overview\'s border ' + border);
      checked++;
    }
    /* a check that compared nothing would pass: the overview must have border vertices to compare */
    assert.ok(borderAll > 0, G.file + ': no overview border vertex was compared');
    t.diagnostic(G.file + ': ' + checked + ' rows, ' + borderAll + ' overview border vertices all in ' + detailAll + ' detail vertices, ' + cache.size + ' fragments');
  }
  /* no fragment is shared between two records — the NC geometry is never in an open fragment */
  const nc = new Set(built.filter((g) => g.nonCommercial).map((g) => g.global));
  for (const [global, entries] of Object.entries(index.sets || {})) {
    if (nc.has(global)) continue;
    for (const e of Object.values(entries)) for (const [p] of e[1]) assert.ok(!nc.has(familyOf.get(p)), p + ' holds non-commercial geometry and is read by ' + global);
  }
});

/* ── ⑬ …and the page's reader actually draws it: evaluated, not read (#R505) ──────────────────────────
   js/time-admin1.js strokes a gap row with `IntMapBorderCoast.lineGeom(<the record's view>, <its own
   row>, <its marks>)`; the view is the one js/hist-bundles.js registers for the record (`globalOf`).
   This hands the IMPORTED reader that same shape for a real non-commercial row and the real files,
   and asks what it draws: the overview below the detail zoom (no fragment fetched), the publisher's
   lines at it. */
test('⑬ zoomed in, the gap line of a surveyed row is its detail; zoomed out, the overview, with no fragment fetched', async (t) => {
  const { importModule } = await import('./helpers/import-module.mjs');
  const G = SURVEYS.find((g) => g.nonCommercial && existsSync(join(ROOT, g.file)));
  if (!G || !existsSync(join(ROOT, 'data', 'border-detail', 'index.json'))) { t.skip('no non-commercial survey record or no data/border-detail/ in this tree'); return; }
  const { loadIndex } = await import('../scripts/build-border-detail.mjs');
  const d = shipped(G.file), index = loadIndex(join(ROOT, 'data', 'border-detail'));
  const entries = (index.sets || {})[G.global] || {};
  const i = Object.keys(entries).map(Number).find((k) => entries[k][1].length > 0);
  assert.ok(i != null, G.file + ': no row has detail lines');
  /* the record's view as js/hist-bundles.js builds it: sparse, only this row and its rings */
  const view = { rings: new Array(d.rings.length), feats: new Array(d.feats.length), precision: null };
  view.feats[i] = d.feats[i].slice(0, 10);
  for (const p of d.feats[i][8]) for (const ri of p) view.rings[ri] = d.rings[ri];
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of d.feats[i][8]) for (const ri of p) for (const [x, y] of d.rings[ri]) { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
  let zoom = 7;
  const calls = [], on = {};
  const engine = { camera: { getZoom: () => zoom, getBounds: () => ({ getWest: () => box[0], getSouth: () => box[1], getEast: () => box[2], getNorth: () => box[3] }) }, events: { on: (name, cb) => { on[name] = cb; } } };
  const w = { __IMBCOAST: { sets: { [G.set]: { global: G.global, rings: d.rings.length, draw: Array(d.rings.length).fill(1) } } },
    IntMapHistBundles: { globalOf: (o) => (o === view ? G.global : null), ringOrigin: () => null } };
  const fetch = async (p) => { calls.push(p); const f = join(ROOT, p); return existsSync(f) ? { ok: true, json: async () => JSON.parse(readFileSync(f, 'utf8')) } : { ok: false, json: async () => null }; };
  const { IntMapBorderCoast: bc } = await importModule('js/border-coast.js', { globals: { window: w, fetch },
    mocks: { 'js/geo-engine.js': { IntMapGeoEngine: engine }, 'js/chronos.js': { IntMapTime: { on: () => {} } } } });
  await bc.load();
  const marks = bc.marks(G.set);
  const count = (g) => (g ? g.coordinates.reduce((n, l) => n + l.length, 0) : 0);
  const coarse = count(bc.lineGeom(view, i, marks));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls.length, 0, 'below the detail zoom nothing is fetched');
  zoom = 9; if (on.moveend) on.moveend();   // the camera arrives, as the page's moveend says
  /* first ask starts the index, the second the fragments in view, the third draws them */
  let g = null;
  for (let n = 0; n < 40 && !(g && count(g) > coarse); n++) { g = bc.lineGeom(view, i, marks); await new Promise((r) => setTimeout(r, 25)); }
  const want = entries[i][1].reduce((n, [p]) => n + JSON.parse(readFileSync(join(ROOT, 'data', 'border-detail', p), 'utf8')).lines[entries[i][0]].reduce((m, l) => m + l.length, 0), 0);
  assert.equal(count(g), want, 'zoomed in, the row is drawn from exactly its detail lines');
  assert.ok(want > coarse, 'the detail is finer than the overview (' + want + ' vs ' + coarse + ' vertices)');
  const base = G.file.replace(/^.*\//, '').replace(/\.js$/, '');
  assert.ok(calls.includes('data/border-detail/index-' + base + '.json'), 'the record\'s own index was fetched when its row needed detail');
  assert.ok(calls.every((p) => p === 'data/border-detail/index.json' || p === 'data/border-detail/index-' + base + '.json' || new RegExp('^data/border-detail/' + base + '-[a-f0-9]{16}\\.json$').test(p)), 'only the index, this record\'s own index and its own fragments were fetched: ' + calls.join(', '));
});
