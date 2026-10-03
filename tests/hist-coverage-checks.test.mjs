/* ══ hist-coverage — the historical map says where it knows, where it does not, and why ══════════════
 *
 *  「Every year of the world, on one map」 is the product's first promise. Measured 2026-10-03, the land
 *  inside a polity that carries a first-level subdivision was 0.0% in 500 BC, 1.1% in 1000, 4.9% in 1500,
 *  25.4% in 1800, 47.5% in 1900 and 64.6% in 2019 — and the reader saw none of that: an unrecorded polity
 *  looked exactly like one with no subdivisions. This file holds the four structural pieces, each
 *  EVALUATED (#R505) and each with its defect put back to show the check goes red on it:
 *    ① one measure, two readers — js/hist-knowledge.js is what the gate records AND what the map hatches
 *    ② the unknown ground is drawn: a polity with no record carries its own outline; a partial one its
 *       uncovered ground, never a covered cell
 *    ③ a double claim is one of three kinds (js/hist-scale.js claimKind), asked only of pairs that share
 *       GROUND — the old count paired namesakes
 *    ④ the fill joins Natural Earth to Wikidata by every non-deprecated ISO 3166-2 code, preferred first,
 *       then HASC — and refuses a country with a stated reason the holes ledger carries
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const K = await import(pathToFileURL(path.join(ROOT, 'js', 'hist-knowledge.js')).href);
const HF = await import('../scripts/hist-fidelity.mjs');
const HS = (() => { const w = {}; vm.runInNewContext(rd('js/hist-scale.js'), { window: w, Date, Math }); return w.IntMapHistScale; })();

/* a square polity of `w` degrees at (x, y), as polygons of rings */
const sq = (x, y, w, h = w) => [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];

/* ── ① ─────────────────────────────────────────────────────────────────────────────────────────── */
test('① the edge-bucketed scanline decides every cell exactly as the per-row walk did', () => {
  /* the rule the gate recorded every number with, written out as it was */
  function naive(win, rings, cb) {
    let minY = 90, maxY = -90;
    for (const r of rings) for (const p of r) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const R = win.res, j0 = Math.max(0, Math.floor((minY - win.y0) / R - 0.5)), j1 = Math.min(win.NY - 1, Math.ceil((maxY - win.y0) / R));
    for (let j = j0; j <= j1; j++) {
      const y = win.y0 + (j + 0.5) * R, xs = [];
      for (const r of rings) for (let k = 0; k < r.length; k++) { const a = r[k], b = r[(k + 1) % r.length]; if ((a[1] <= y) === (b[1] <= y)) continue; xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
      if (xs.length < 2) continue; xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) { const i0 = Math.ceil((xs[k] - win.x0) / R - 0.5), i1 = Math.floor((xs[k + 1] - win.x0) / R - 0.5); if (i1 < 0 || i0 > win.NX - 1) continue; cb(j, Math.max(0, i0), Math.min(win.NX - 1, i1)); }
    }
  }
  /* a star with a hole, vertices on and off the cell centres, and an edge lying exactly on a row centre */
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rings = [];
  for (let t = 0; t < 6; t++) {
    const cx = -170 + rnd() * 340, cy = -80 + rnd() * 160, n = 5 + Math.floor(rnd() * 40), ring = [];
    for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n, r = 0.5 + rnd() * 6; ring.push([+(cx + r * Math.cos(a)).toFixed(t % 2 ? 2 : 4), +(cy + r * Math.sin(a)).toFixed(t % 2 ? 2 : 4)]); }
    ring.push(ring[0]); rings.push(ring);
  }
  rings.push([[10, 10.125], [20, 10.125], [20, 20], [10, 20], [10, 10.125]]);
  const win = { x0: -180, y0: -90, res: 0.25, NX: 1440, NY: 720 };
  const A = [], B = [];
  K.scan(win, rings, (j, i0, i1) => A.push([j, i0, i1].join()));
  naive(win, rings, (j, i0, i1) => B.push([j, i0, i1].join()));
  assert.deepEqual(A.sort(), B.sort());
});

test('① the gate\'s coverage IS the page\'s measure — one function, evaluated in both places', () => {
  /* scripts/hist-fidelity.mjs imports js/hist-knowledge.js; the page imports it lazily */
  const page = rd('js/time-admin1.js');
  assert.match(page, /import\('\.\/hist-knowledge\.js'\)/, 'js/time-admin1.js does not load the shared measure');
  const bs = HF.bundles();
  const c = HF.coverage(bs, 1900);
  const obs = JSON.parse(rd('data/hist-fidelity.json')).years.find((r) => r.year === 1900);
  assert.equal(+c.pct.toFixed(2), obs.pct, 'the recorded 1900 coverage is not what the shared measure returns');
  assert.equal(+c.pctArea.toFixed(2), obs.pctArea, 'the area-weighted share is not recorded');
});

test('① status and the area weighting', () => {
  /* two equal-cell polities, one at the equator and one at 60°: covering the polar one only halves the
     area share relative to the cell share */
  const pol = [{ nm: 'E', polys: [sq(0, 0, 4)] }, { nm: 'P', polys: [sq(0, 58, 4)] }];
  const m = K.measure(pol, [{ polys: [sq(0, 58, 4)] }]);
  assert.equal(Math.round(m.pct), 50);
  assert.ok(m.pctArea < 40 && m.pctArea > 30, 'a cell at 60° is not weighted as the ground it is: ' + m.pctArea);
  assert.deepEqual(m.per.map((p) => [p.nm, K.status(p.pct)]).sort(), [['E', 'none'], ['P', 'full']]);
});

/* ── ② ─────────────────────────────────────────────────────────────────────────────────────────── */
test('② unknown ground: an unrecorded polity carries its own outline, a partial one only its uncovered ground', () => {
  const none = { nm: 'Silent', polys: [sq(20, 20, 6)] };
  const part = { nm: 'Half', polys: [sq(0, 0, 10)] };
  const whole = { nm: 'Whole', polys: [sq(40, 0, 4)] };
  const unit = { polys: [sq(0, 0, 5, 10)] };          /* the western half of «Half» */
  const unit2 = { polys: [sq(40, 0, 4)] };
  const r = K.unknownGround([none, part, whole], [unit, unit2]);
  const by = Object.fromEntries(r.areas.features.map((f) => [f.properties.nm, f]));
  assert.ok(!by.Whole, 'a polity recorded whole is hatched');
  assert.equal(by.Silent.properties.kind, 'none');
  assert.deepEqual(by.Silent.geometry.coordinates, none.polys, 'the unrecorded polity is not drawn on its own outline');
  assert.equal(by.Half.properties.kind, 'partial');
  assert.equal(Math.round(by.Half.properties.pct), 50);
  /* no hatched rectangle reaches into the covered half */
  for (const poly of by.Half.geometry.coordinates) for (const p of poly[0]) assert.ok(p[0] >= 5 - 1e-9, 'a hatched cell lies over a recorded unit at ' + p);
  /* every label sits on ground the record is silent about */
  const lab = Object.fromEntries(r.labels.features.map((f) => [f.properties.nm, f.geometry.coordinates]));
  assert.ok(lab.Half[0] > 5 && lab.Half[0] < 10 && lab.Half[1] > 0 && lab.Half[1] < 10);
  assert.ok(lab.Silent[0] > 20 && lab.Silent[0] < 26);
  /* the defect put back: with the unit dropped, the half that IS recorded would be hatched */
  const bad = K.unknownGround([part], []);
  assert.equal(bad.areas.features[0].properties.kind, 'none');
});

test('② 1900, named: the polities the reader is told nothing about carry the hatch', () => {
  const bs = HF.bundles();
  const c = HF.coverage(bs, 1900);
  const names = new Set(c.per.filter((p) => K.status(p.pct) === 'none').map((p) => p.nm));
  /* historical-verification.md §2-1 — a year and a place, named: in 1900 the Persian and Congo Free State
     ground had no first-level record in any shipped bundle */
  for (const nm of ['Iran (Persia)', 'Congo, Democratic Republic of (Zaire)']) assert.ok(names.has(nm), nm + ' is not measured as unrecorded in 1900');
});

/* ── ③ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('③ claimKind: seam, duplicate, contested — and no claim without a shared instant', () => {
  const u = (name, s, e) => ({ name, s, e });
  /* a year-precision handover: [1938..1949) × [1948..1973) */
  assert.equal(HS.claimKind(u('A', [1938, 1, 1], [1949, 1, 1]), u('B', [1948, 1, 1], [1973, 1, 1])), 'seam');
  /* the same, a leap year long — still the record's precision */
  assert.equal(HS.claimKind(u('A', [1900, 1, 1], [1949, 1, 1]), u('B', [1948, 1, 1], [1973, 1, 1])), 'seam');
  /* longer than a year, one name: one unit held twice */
  assert.equal(HS.claimKind(u('Texas', [1845, 12, 29], [9999, 1, 1]), u('Texas', [1850, 12, 12], [9999, 1, 1])), 'duplicate');
  /* nested and short is not a handover */
  assert.equal(HS.claimKind(u('A', [1890, 1, 1], [1950, 1, 1]), u('B', [1900, 1, 1], [1900, 6, 1])), 'contested');
  /* two names, longer than a year: the Alaska boundary dispute over British Columbia */
  assert.equal(HS.claimKind(u('Alaska boundary dispute', [1821, 1, 1], [1903, 3, 3]), u('British Columbia', [1871, 7, 20], [1903, 3, 3])), 'contested');
  /* touching is not overlapping (exclusive ends), before the common era too */
  assert.equal(HS.claimKind(u('A', [-500, 1, 1], [-300, 1, 1]), u('B', [-300, 1, 1], [-100, 1, 1])), null);
  assert.equal(HS.claimKind(u('A', [-500, 1, 1], [-299, 1, 1]), u('B', [-300, 1, 1], [-100, 1, 1])), 'seam');
  assert.deepEqual([...HS.CLAIM_KINDS], ['seam', 'duplicate', 'contested']);
});

test('③ a double claim shares GROUND: two units with one name in two places are not one', () => {
  const b = { file: 'data/hist-x.js', b: { levels: [4], rings: [sq(0, 0, 2)[0], sq(50, 50, 2)[0], sq(0.5, 0.5, 1)[0]],
    feats: [['Lincoln', 4, 1900, 1, 1, 1950, 1, 1, [[0]], { en: 'Lincoln' }, 1],
            ['Lincoln', 4, 1900, 1, 1, 1950, 1, 1, [[1]], { en: 'Lincoln' }, 2],
            ['Lincoln', 4, 1920, 1, 1, 1960, 1, 1, [[2]], { en: 'Lincoln' }, 3]] } };
  const got = HF.groundClaims([b]).map((c) => [c.a.f[10], c.b.f[10], c.kind].join(':')).sort();
  /* 1 × 2 are namesakes 50° apart; 1 × 3 share ground for 30 years */
  assert.deepEqual(got, ['1:3:duplicate']);
});

test('③ the ledger the page counts is what the gate measures, and every row in it is a shipped row', () => {
  const L = JSON.parse(rd('data/hist-claims.json'));
  assert.deepEqual(L.kinds, [...HS.CLAIM_KINDS]);
  const keys = new Set();
  for (const { file, b } of HF.firstLevelBundles(HF.bundles())) b.feats.forEach((f, i) => keys.add(HF.claimKey(file, f, i)));
  for (const [kind, a, c, os, oe] of L.pairs) {
    assert.ok(HS.CLAIM_KINDS.includes(kind), kind);
    assert.ok(keys.has(a) && keys.has(c), 'the ledger names a row that is not shipped: ' + a + ' / ' + c);
    assert.ok(a < c, 'a pair is not in canonical order');
    assert.ok(os[0] * 1e4 + os[1] * 100 + os[2] < oe[0] * 1e4 + oe[1] * 100 + oe[2]);
  }
  const obs = JSON.parse(rd('data/hist-fidelity.json'));
  assert.ok(obs.claims && HS.CLAIM_KINDS.every((k) => Number.isInteger(obs.claims[k])), 'the claims by kind are not recorded');
  assert.equal(obs.selfOverlaps, undefined, 'the namesake count is still recorded beside the ground count');
});

/* ── ④ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('④ the ISO join reads the code Natural Earth carries even when ISO has since renamed it, preferred rank first; HASC only where ISO is silent', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'histcov-'));
  const v = (x) => ({ type: 'literal', value: x });
  const R = (rank) => v('http://wikiba.se/ontology#' + rank);
  const row = (code, q, rank, inc, dis) => ({ code: v(code), item: v('http://www.wikidata.org/entity/' + q), rank: R(rank), ...(inc ? { inc: v(inc) } : {}), ...(dis ? { dis: v(dis) } : {}) });
  fs.writeFileSync(path.join(dir, 'p300-spans-ranked.json'), JSON.stringify([
    /* Lower Silesian Voivodeship: the old code at normal rank on the same item */
    row('PL-DS', 'Q54150', 'NormalRank', '1999-01-01T00:00:00Z'),
    row('PL-02', 'Q54150', 'PreferredRank', '1999-01-01T00:00:00Z'),
    /* a reused code: preferred on North Khorasan (2004), normal on the dissolved Khorasan (1993) */
    row('IR-28', 'Q180075', 'PreferredRank', '2004-01-01T00:00:00Z'),
    row('IR-28', 'Q1105893', 'NormalRank', '1993-01-01T00:00:00Z', '2004-09-29T00:00:00Z'),
  ]));
  fs.writeFileSync(path.join(dir, 'p8119-spans-ranked.json'), JSON.stringify([
    { code: v('NP.BA'), item: v('http://www.wikidata.org/entity/Q1'), rank: R('NormalRank'), inc: v('1962-01-01T00:00:00Z'), dis: v('2015-09-20T00:00:00Z') },
    { code: v('PL.DS'), item: v('http://www.wikidata.org/entity/Q2'), rank: R('NormalRank'), inc: v('1800-01-01T00:00:00Z') },
  ]));
  process.env.INTMAP_HISTFILL_CACHE = dir;
  try {
    const F = await import('../scripts/build-hist-admin-fill.mjs');
    const m = await F.wikidataSpans();
    assert.equal(m.get('PL-DS').s, 19990101, 'the code Natural Earth carries does not reach its item');
    assert.equal(m.get('IR-28').s, 20040101);
    assert.equal(m.get('IR-28').e, null, 'a reused code took the dissolved holder\'s end');
    assert.equal(m.get('IR-28').qid, 'Q180075');
    const ids = F.unitIds('Bagmati|NP-BA~|NP.BA|BA');
    assert.equal(F.spanOf(m, ids).via, 'P8119', 'HASC is not asked where ISO is silent');
    assert.equal(F.spanOf(m, F.unitIds('Lower Silesian|PL-DS|PL.DS')).via, 'P300', 'HASC overrode a date the ISO join found');
  } finally { delete process.env.INTMAP_HISTFILL_CACHE; fs.rmSync(dir, { recursive: true, force: true }); }
});

test('④ every refused country states why, every hole states why, and the reasons are written down', () => {
  const s = rd('data/hist-admin-fill.js');
  const fill = JSON.parse(s.slice(s.indexOf('=') + 1).replace(/;\s*$/, ''));
  const WHY = ['undated', 'no-identifier', 'no-set-floor', 'never-whole'];
  assert.ok(fill.refused && Object.keys(fill.refused).length > 0, 'the fill does not say which countries it refused');
  for (const [iso, r] of Object.entries(fill.refused)) {
    assert.ok(/^[A-Z]{2,3}$/.test(iso), iso);
    assert.ok(WHY.includes(r[0]), iso + ' refused for «' + r[0] + '»');
    assert.ok(Number.isInteger(r[1]) && Number.isInteger(r[2]) && r[1] <= r[2], iso + ' counts ' + r.slice(1));
  }
  /* a refused country draws nothing, and a drawn one is not refused */
  const drawn = new Set(fill.feats.map((f) => f[11]));
  for (const iso of Object.keys(fill.refused)) assert.ok(!drawn.has(iso), iso + ' is refused and drawn');
  for (const via of Object.values(fill.inceptionVia || {})) assert.equal(via, 'P8119');

  const H = JSON.parse(rd('data/hist-coverage-holes.json'));
  assert.ok(/^\d{4}-\d\d-\d\d$/.test(H.measured), 'the holes carry no observation date');
  const obsYears = JSON.parse(rd('data/hist-fidelity.json')).years.map((y) => y.year);
  assert.deepEqual(H.years.map((y) => y.year), obsYears, 'the holes are not recorded for every measured year');
  for (const y of H.years) for (const [nm, pct, cells, parts] of y.holes) {
    assert.ok(pct < 95 && cells > 0, nm + ' ' + y.year);
    for (const p of parts) {
      const reason = p[0] === '*' ? '*' : p[2];
      assert.ok(Object.prototype.hasOwnProperty.call(H.reasons, reason), nm + ' ' + y.year + ' has a share with no stated reason: ' + JSON.stringify(p));
    }
  }
});

/* ── ⑤ THE PAGE ────────────────────────────────────────────────────────────────────────────────────
   js/time-admin1.js IMPORTED with a stand-in renderer (the scaffold tests/history-admin-tiers-checks.test.mjs
   uses), travelled to 1900, and asked what it put on the map: the hatch over the silent polity's own
   outline and over the uncovered half of the partial one, a label on each, the share and the double claim
   in `coverage()` and in the layer row's note — and nothing once the box is switched off. */
test('⑤ travelled to 1900, the page hatches the ground the record is silent about and says how much it knows', async () => {
  const { importModule } = await import('./helpers/import-module.mjs');
  const REAL = setTimeout, sleep = (ms) => new Promise((r) => REAL(r, ms));
  const layers = new Map(), sources = new Map(), vis = new Map(), images = new Set();
  const L = {
    hasSource: (id) => sources.has(id), addSource: (id, spec) => sources.set(id, { spec, data: null }),
    setSourceData: (id, d) => { if (sources.has(id)) sources.get(id).data = d; },
    has: (id) => layers.has(id), add: (spec) => layers.set(spec.id, { spec }),
    setLayout: (id, k, v) => { if (k === 'visibility') vis.set(id, v); }, setFilter: () => {},
  };
  const bus = { on: () => {}, once: () => {}, off: () => {}, emit: () => {}, onLayer: () => {} };
  const GE = { hasRenderer: () => true, ready: () => true, layers: L, events: bus, whenCanDraw: () => Promise.resolve(),
    camera: { getZoom: () => 4 }, coords: { queryRenderedFeatures: () => [] },
    scene: { hasImage: (id) => images.has(id), addImage: (id) => { images.add(id); return true; } } };
  const ring = (x, y, w, h = w) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
  /* one first-level unit over the western half of «Half», held twice by upstream (a duplicate) */
  const T1 = { v: 1, src: 'synthetic', since: 1, tolerance: 0.02, levels: [3, 4], rings: [ring(0, 0, 5, 10)],
    feats: [['West', 4, 1800, 1, 1, 1950, 1, 1, [[0]], { en: 'West' }, 1001], ['West', 4, 1800, 1, 1, 1950, 1, 1, [[0]], { en: 'West' }, 1002]] };
  const empty = { v: 1, src: 'synthetic', since: 1, tolerance: 0.02, levels: [5, 6], rings: [], feats: [] };
  const win = {}; win.window = win; win.addEventListener = () => {};
  win.IntMapMemBudget = { deviceIsPhone: () => true, maySpeculate: () => false };
  win.__HISTADM1 = T1; win.__HISTADM2 = empty; win.__HISTADM3 = { ...empty, levels: [7] };
  const polities = { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { NAME: 'Half' }, geometry: { type: 'Polygon', coordinates: [ring(0, 0, 10)] } },
    { type: 'Feature', properties: { NAME: 'Silent' }, geometry: { type: 'Polygon', coordinates: [ring(20, 20, 6)] } }] };
  win.IntMapTimeBorders = { currentFC: () => polities };
  /* the page reads the ledger through its one clock (js/fetch-deadline.js, published by js/app-body.js) */
  let read = null;
  win.IntMapFetchWithin = { jsonWithin: async (u) => { read = u; return ledgerFor(); }, clockFor: () => 9000 };
  const ctx = { window: win, console, Promise, Math, JSON, Number, Array, Date, Set, Map, isFinite, URL };
  vm.createContext(ctx);
  vm.runInContext(rd('js/hist-scale.js'), ctx);
  vm.runInContext(rd('js/hist-bundles.js'), ctx);
  const box = { checked: true, closest: () => null };
  const canvas = { width: 0, height: 0, getContext: () => ({ beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }) };
  const ledger = { kinds: ['seam', 'duplicate', 'contested'], pairs: [['duplicate', 'r1001', 'r1002', [1800, 1, 1], [1950, 1, 1]]] };
  function ledgerFor() { return ledger; }
  const { timeAdmin1 } = await importModule('js/time-admin1.js', {
    globals: {
      window: win, navigator: {},
      document: { getElementById: (id) => (id === 'cb-admin1' ? box : { checked: true, closest: () => null }),
                  createElement: (t) => (t === 'canvas' ? canvas : { style: {} }), head: { appendChild: () => {} } },
      setTimeout: (fn, ms) => { const h = REAL(fn, ms); if (h && h.unref) h.unref(); return h; },
      fetch: (u) => (/hist-claims\.json$/.test(String(u)) ? Promise.resolve({ ok: true, json: () => Promise.resolve(ledger) }) : Promise.reject(new Error('offline'))),
    },
    mocks: {
      'js/geo-engine.js': { IntMapGeoEngine: GE },
      'js/chronos.js': { IntMapTime: { on: () => {}, min: 1, onIntent: () => {} } },
      'js/lang-registry.js': { IntMapLang: { pickArgs: () => ((...a) => a), pick: () => ({ arr: (a) => a[0] }), htmlTag: () => 'en' } },
      'js/border-coast.js': { IntMapBorderCoast: { marks: () => null, lineGeom: () => null, load: () => Promise.resolve(null),
                                                   onArrive: () => {}, wholeLines: () => ({ type: 'FeatureCollection', features: [] }) } },
    },
  });
  const mod = timeAdmin1({ canDraw: () => true, lang: 'en', isMobile: () => true });
  mod._go(new Date(Date.UTC(1900, 5, 15)));
  let areas = null;
  for (let i = 0; i < 60 && !(areas && areas.features && areas.features.length); i++) { await sleep(50); areas = sources.has('imta-know-src') ? sources.get('imta-know-src').data : null; }
  assert.ok(areas && areas.features.length, 'nothing was hatched');
  const by = Object.fromEntries(areas.features.map((f) => [f.properties.nm, f]));
  assert.equal(by.Silent.properties.kind, 'none');
  assert.deepEqual(by.Silent.geometry.coordinates, [polities.features[1].geometry.coordinates], 'the silent polity is not hatched on its own outline');
  assert.equal(by.Half.properties.kind, 'partial');
  for (const poly of by.Half.geometry.coordinates) for (const p of poly[0]) assert.ok(p[0] >= 5 - 1e-9, 'the recorded half is hatched');
  const labels = sources.get('imta-know-lbl-src').data.features.map((f) => f.properties.txt).sort();
  assert.deepEqual(labels, ['No subdivision record for this date', 'Subdivisions recorded for 50% of this land']);
  assert.equal(layers.get('imta-know-fill').spec.paint['fill-pattern'], 'imta-know-hatch');
  assert.ok(images.has('imta-know-hatch'), 'the hatch image was never added');
  const k = mod.coverage().known;
  assert.equal(k.none, 1); assert.equal(k.partial, 1);
  assert.deepEqual(k.claims, { seam: 0, duplicate: 1, contested: 0 });
  assert.match(mod.note(), /hatched/);
  assert.match(mod.note(), /1 duplicate/);
  assert.equal(read, 'data/hist-claims.json');
  assert.equal(vis.get('imta-know-fill'), 'visible');
  /* one switch: the province-border box */
  box.checked = false; win._applyAdmin1();
  assert.equal(vis.get('imta-know-fill'), 'none');
  assert.equal(vis.get('imta-know-lbl'), 'none');
  /* and back at Now there is nothing left */
  mod._clear();
  assert.equal(sources.get('imta-know-src').data.features.length, 0);
});

/* ── ⑥ ATLAS ───────────────────────────────────────────────────────────────────────────────────────
   AGENTS.md §3-3: a capability the map gains is reachable from Atlas in the same change. `time.coverage`
   answers, for the instant on the clock, the share the subdivision record covers and the claims by kind —
   read from the page's own `coverage().known`, never re-measured; for any other instant it says nothing
   rather than the clock's numbers. */
test('⑥ Atlas time.coverage carries the subdivision record\'s own answer for the instant on the clock — and only that instant', async () => {
  const { importModule } = await import('./helpers/import-module.mjs');
  const when = new Date(Date.UTC(1900, 5, 15, 12));
  const known = { pct: 47.21, pctArea: 43.8, none: 82, partial: 29, full: 39, claims: { seam: 3, duplicate: 1, contested: 2 } };
  const win = { IntMapTimeAdmin1: { coverage: () => ({ active: true, when, known }) } };
  let asked = when;
  win.IntMapLayerTime = { coverage: async () => ({ at: { date: asked.toISOString(), live: false }, stated: [], carried: [], unstated: [], unknown: [] }) };
  const caps = (await importModule('js/atlas-cap-time.js', { globals: { window: win }, mocks: { 'js/chronos.js': { IntMapTime: { isLive: () => false, when: () => when } } } })).default;
  const cap = caps.find((c) => c.row[0] === 'time.coverage');
  const K = { R: (ok, html, extra) => ({ ok, html, ...(extra || {}) }), L: (en) => en, warn: (x) => x, esc: (x) => String(x) };
  const r = await cap.run({}, {}, K);
  assert.deepEqual(r.subdivisions, { pct: 47.2, pctArea: 43.8, unrecorded: 82, partial: 29, whole: 39, claims: known.claims });
  assert.match(r.html, /Subdivisions recorded for 47\.2% of the land inside a polity \(82 polities with no record and 29 with a partial one — hatched on the map\); ground claimed twice: 3 seam, 1 duplicate, 2 contested/);
  /* another instant: the clock's numbers are not about it */
  asked = new Date(Date.UTC(1500, 5, 15, 12));
  const r2 = await cap.run({ year: 1500 }, {}, K);
  assert.equal(r2.subdivisions, undefined);
  assert.doesNotMatch(r2.html, /Subdivisions recorded/);
});
