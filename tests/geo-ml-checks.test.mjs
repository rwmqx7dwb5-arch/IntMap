/* js/geo-ml.js — 複数年の変化・意味分類・変化の解釈・予測モデル。網に触れず、合成データで性質を測る。 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../js/geo-ml.js';
import { FEATURES } from '../js/geo-similar.js';

const rngOf = (seed) => { let a = seed; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };
const nrm = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const yrs = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];
const obs = (ys, f) => ys.map((y, i) => ({ id: 'o' + i, date: y + '-06-15', dateBasis: 'acquired', data: f(y, i) }));

test('an image whose date nobody observed never enters a series, and never answers a Chronos date', () => {
  const o = [
    { id: 'a', date: '2020-06-15', dateBasis: 'acquired' },
    { id: 'b', date: '2020-06-20', dateBasis: 'file-name' },
    { id: 'c', date: '2021-01-01', dateBasis: 'background-tile' },
    { id: 'd', dateBasis: 'acquired' },
    { id: 'e', date: 'last summer', dateBasis: 'acquired' },
    { id: 'f', date: '2019', dateBasis: 'composite' },
  ];
  const r = G.admitObservations(o);
  assert.deepEqual(r.admitted.map((x) => x.id), ['a']);
  assert.deepEqual(r.rejected.map((x) => x.reason).sort(), ['composite-needs-a-period', 'date-not-an-observation', 'date-not-an-observation', 'date-unparseable', 'no-date']);
  assert.equal(G.selectForTime(o, '2020-06-18').obs.id, 'a');
  /* the file-name-dated one is closer to the asked date but must not be chosen */
  const far = G.selectForTime(o.filter((x) => x.id !== 'a'), '2020-06-18');
  assert.equal(far.obs, null);
  assert.equal(far.reason, 'no-dated-observation');
  assert.equal(G.selectForTime(o, '2023-06-18').reason, 'nothing-within-tolerance');
});

test('a step is dated to the interval between two observations, and a ramp is not called a step', () => {
  const r = rngOf(5), t = yrs.map((y) => y + 0.45);
  const step = G.seriesStats(t, yrs.map((y) => (y >= 2020 ? 1 : 0) + 0.05 * nrm(r)));
  assert.equal(step.pattern, 'abrupt'); assert.equal(step.direction, 1);
  assert.ok(Math.abs(step.step.between[0] - 2019.45) < 1e-9 && Math.abs(step.step.between[1] - 2020.45) < 1e-9);
  const ramp = G.seriesStats(t, yrs.map((y) => -0.2 * (y - 2016) + 0.03 * nrm(r)));
  assert.equal(ramp.pattern, 'gradual'); assert.equal(ramp.direction, -1);
  assert.ok(Math.abs(ramp.slope + 0.2) < 0.05, 'Theil-Sen recovers the speed per year');
  assert.equal(G.seriesStats(t.slice(0, 3), [1, 2, 3]).pattern, 'insufficient');
});

test('pure noise is flagged no more often than alpha allows (the null is simulated, not a constant)', () => {
  const r = rngOf(9), t = yrs.map((y) => y + 0.45); let flagged = 0; const N = 1500;
  for (let i = 0; i < N; i++) { const s = G.seriesStats(t, yrs.map(() => nrm(r))); if (s.pattern === 'abrupt' || s.pattern === 'gradual') flagged++; }
  assert.ok(flagged / N < 0.12, 'false-positive share ' + flagged / N);
});

test('the raster analysis finds where, when and how fast, and says what it left out', () => {
  const W = 6, H = 4, r = rngOf(3);
  const layers = obs(yrs, (y) => { const d = new Float32Array(W * H); for (let i = 0; i < d.length; i++) { const x = i % W; d[i] = (x < 2 ? (y >= 2020 ? 1 : 0) : x < 4 ? 0.1 * (y - 2016) : 0) + 0.02 * nrm(r); } return d; });
  layers.push({ id: 'undated', date: null, dateBasis: 'unknown', data: new Float32Array(W * H) });
  const a = G.analyzeRasterSeries({ width: W, height: H, layers });
  assert.ok(a.ok); assert.equal(a.nObservations, 8); assert.equal(a.rejected.length, 1);
  const P = a.bands.pattern;
  assert.equal(P[0], 3); assert.equal(P[2], 2); assert.equal(P[4], 1);
  assert.ok(a.summary.share.abrupt > 0.25 && a.summary.share.gradual > 0.25);
  assert.equal(a.summary.abruptByYear[0].year, 2019, 'the break is bracketed 2019.45 to 2020.45 and reported by its middle year');
  assert.ok(Math.abs(a.summary.gradualSpeedPerYear.median - 0.1) < 0.03);
  assert.equal(G.analyzeRasterSeries({ width: W, height: H, layers: layers.slice(0, 3) }).code, 'TOO_FEW_DATED_OBSERVATIONS');
});

test('same-season selection keeps one image per year near the season, never an undated one', () => {
  const o = [{ id: 1, date: '2019-06-01', dateBasis: 'acquired' }, { id: 2, date: '2019-12-01', dateBasis: 'acquired' }, { id: 3, date: '2020-06-20', dateBasis: 'acquired' }, { id: 4, date: '2020-06-10', dateBasis: 'unknown' }];
  assert.deepEqual(G.sameSeason(o, '06-15', 30).kept.map((x) => x.id), [1, 3]);
});

const ev = (o) => ({ counts: FEATURES.map((f) => o[f.id] || 0), areaKm2: 4, ...(o._ || {}) });
test('regions are classified by what they are made of, and unmapped is not rural', () => {
  const c = (o) => G.classifyRegion(ev(o), { features: FEATURES });
  assert.equal(c({ port: 40, port_land: 5, cranes: 12, industrial: 60 }).cls, 'port');
  assert.equal(c({ industrial: 300, roads_major: 40, rail: 20 }).cls, 'industrial');
  assert.equal(c({ offices: 200, shops: 300, food: 400, commercial: 100, stations: 6 }).cls, 'commercial');
  assert.equal(c({ residential: 900, roads_local: 200 }).cls, 'residential');
  assert.equal(c({ _: { landcover: { crops: 0.8 } } }).cls, 'agricultural');
  const empty = c({}); assert.equal(empty.cls, 'unclassified'); assert.equal(empty.why, 'mapped-nothing');
});

test('supervised prototypes are learned from labelled regions and carry a leave-one-out accuracy', () => {
  const r = rngOf(2), mk = (base) => base.map((v) => v + nrm(r) * 0.3), rows = [], labels = [];
  for (let i = 0; i < 8; i++) { rows.push(mk([5, 0, 1])); labels.push('A'); rows.push(mk([0, 5, 1])); labels.push('B'); }
  const f = G.fitPrototypes(rows, labels); assert.ok(f.ok); assert.ok(f.looAccuracy > 0.9);
  assert.equal(G.classifyWith(f.model, [4.8, 0.1, 1]).cls, 'A');
  assert.equal(G.fitPrototypes(rows.slice(0, 3), labels.slice(0, 3)).code, 'TOO_FEW_LABELLED');
});

test('interpretation joins place and time, names what followed the change, and never says cause', () => {
  const ch = { bbox: [139.7, 35.6, 139.8, 35.7], from: 2019.4, to: 2020.4 };
  const yy = [2016, 2017, 2018, 2019, 2020, 2021, 2022];
  const r = G.interpretChange(ch, {
    facilities: [{ name: 'new terminal', lat: 35.65, lng: 139.75, openedAt: '2019-09-01', source: 'x' }, { name: 'later plant', lat: 35.65, lng: 139.75, openedAt: '2023-01-01' }, { name: 'undated mall', lat: 35.65, lng: 139.75 }, { name: 'far', lat: 40, lng: 100, openedAt: '2019-09-01' }],
    news: [{ title: 'opening', date: '2019-10-01', lat: 35.66, lng: 139.74 }, { title: 'no place', date: '2019-10-01' }],
    stats: [{ name: 'port throughput', series: yy.map((y, i) => ({ year: y, value: i })) }],
    changeSeries: yy.map((y, i) => ({ year: y, value: 2 * i + 1 })),
  });
  const by = (n) => r.evidence.find((e) => e.name === n);
  assert.equal(by('new terminal').usable, true);
  assert.equal(by('later plant').when.rel, 'followed-the-change'); assert.equal(by('later plant').usable, false);
  assert.equal(by('undated mall').when.rel, 'date-unknown'); assert.equal(by('undated mall').usable, false);
  assert.equal(by('far'), undefined);
  assert.equal(by('no place').usable, false);
  assert.ok(by('port throughput').usable && by('port throughput').rho > 0.99);
  assert.ok(r.caveats.includes('coincidence-in-place-and-time-is-not-cause'));
});

/* ── D. モデル ── */
function field(seed, n, { noise = 0.3, trendByTime = false } = {}) {
  const r = rngOf(seed), pts = [];
  const smooth = (lng, lat) => Math.sin(lng * 3) * Math.cos(lat * 3);
  for (let i = 0; i < n; i++) { const lng = 139 + r() * 1.2, lat = 35 + r() * 1.2, x1 = nrm(r), t = 2015 + Math.floor(r() * 8); pts.push({ id: i, lng, lat, t, x1, x2: nrm(r), y: 2 * x1 + 1.5 * smooth(lng, lat) + noise * nrm(r) + (trendByTime ? 0.2 * (t - 2015) : 0) }); }
  return pts;
}
const fnsOf = (byId) => [(p) => ({ x1: byId.get(p.id).x1, x2: byId.get(p.id).x2 })];

test('a real signal beats the mean under spatial validation, with an interval that covers held-out blocks', () => {
  const pts = field(1, 220), byId = new Map(pts.map((p) => [p.id, p]));
  const tab = G.assembleTable(pts, fnsOf(byId));
  const res = G.fitAndPredict(tab, tab.rows.slice(0, 5).map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, x: r.x })));
  assert.ok(res.ok, JSON.stringify(res).slice(0, 200));
  const m = res.validation.models[res.model.kind];
  assert.ok(m.spatial.skill > 0.3, 'skill ' + m.spatial.skill);
  assert.ok(res.interval.empiricalCoverage > 0.8, 'coverage ' + res.interval.empiricalCoverage);
  assert.equal(res.importance[0].name, 'x1');
  assert.ok(res.predictions.every((p) => p.lo < p.pred && p.pred < p.hi));
  assert.equal(G.predictionFeatures(res).length, 5);
});

test('pure noise is reported as not beating the mean, never as a model', () => {
  const r = rngOf(4), pts = Array.from({ length: 160 }, (_, i) => ({ id: i, lng: 139 + r(), lat: 35 + r(), x1: nrm(r), x2: nrm(r), y: nrm(r) })), byId = new Map(pts.map((p) => [p.id, p]));
  const res = G.fitAndPredict(G.assembleTable(pts, fnsOf(byId)), [{ lat: 35.5, lng: 139.5, x: [0, 0] }]);
  assert.ok(res.warnings.includes('does-not-beat-the-mean-under-spatial-validation'));
});

test('random splits flatter a model on spatially smooth data; the report shows both numbers', () => {
  const r = rngOf(8), pts = Array.from({ length: 300 }, (_, i) => { const lng = 139 + r() * 1.2, lat = 35 + r() * 1.2; return { id: i, lng, lat, y: Math.sin(lng * 6) * Math.cos(lat * 6) + 0.1 * nrm(r) }; });
  const cv = G.crossValidate(G.assembleTable(pts, [], { coords: true }));
  assert.ok(cv.ok);
  const f = cv.models.forest; assert.ok(f.random.rmse < f.spatial.rmse, 'random ' + f.random.rmse + ' < spatial ' + f.spatial.rmse);
  assert.ok(f.inflation > 0.05);
});

test('a temporal hold-out is reported only when every row has a time, and it is the future', () => {
  const pts = field(2, 220, { trendByTime: true }), byId = new Map(pts.map((p) => [p.id, p])), tab = G.assembleTable(pts, fnsOf(byId));
  const cv = G.crossValidate(tab); assert.ok(cv.temporal.ok); assert.ok(cv.temporal.test > 0);
  const noT = G.assembleTable(pts.map((p) => ({ ...p, t: undefined })), fnsOf(byId)); assert.equal(G.crossValidate(noT).temporal.code, 'NO_TIME_AXIS');
  const sp = G.temporalSplit(tab.rows); assert.ok(sp.train.every((i) => tab.rows[i].t < sp.cutoff) && sp.test.every((i) => tab.rows[i].t >= sp.cutoff));
});

test('feature engineering: missing stays missing, counts and distances are real, empty columns are dropped by name', () => {
  const rast = { width: 2, height: 2, grid: { west: 0, north: 2, pixelLng: 1, pixelLat: 1 }, data: [1, 2, -9999, 4], nodata: -9999 };
  const f = G.rasterFeature('elev', rast, { radiusPx: 1 });
  assert.equal(f({ lng: 0.5, lat: 1.5 }).elev, 1); assert.ok(isNaN(f({ lng: 0.5, lat: 0.5 }).elev)); assert.ok(isNaN(f({ lng: 5, lat: 5 }).elev));
  assert.equal(f({ lng: 0.5, lat: 0.5 }).elev_mean1, (1 + 2 + 4) / 3);
  const pc = G.pointCountFeature('shop', [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }], [1, 100]);
  assert.deepEqual(pc({ lat: 0, lng: 0 }), { shop_n1km: 2, shop_n100km: 2 });
  assert.ok(Math.abs(G.nearestDistanceFeature('d', [{ lat: 0, lng: 1 }])({ lat: 0, lng: 0 }).d_km - 111.19) < 0.5);
  assert.equal(G.insidePolygonFeature('in', [[[0, 0], [2, 0], [2, 2], [0, 2]]])({ lng: 1, lat: 1 }).in, 1);
  const tab = G.assembleTable([{ lat: 0, lng: 0, y: 1 }, { lat: 1, lng: 1, y: 2 }, { lat: 2, lng: 2, y: NaN }], [() => ({ a: NaN, b: 3, c: 1 }), (p) => ({ c: p.lat })]);
  assert.equal(tab.droppedRows, 1);
  assert.deepEqual(tab.droppedColumns.sort((x, y) => x.name.localeCompare(y.name)), [{ name: 'a', why: 'no-value-anywhere' }, { name: 'b', why: 'constant' }]);
});

test('too few rows is refused with its numbers', () => {
  const pts = field(3, 10), byId = new Map(pts.map((p) => [p.id, p]));
  assert.equal(G.crossValidate(G.assembleTable(pts, fnsOf(byId))).code, 'TOO_FEW_ROWS');
});
