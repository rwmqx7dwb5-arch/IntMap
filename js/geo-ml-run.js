/* ============================================================================
 *  IntMap · 地理空間 ML を GIS のデータセットに結ぶ   (js/geo-ml-run.js)
 * ----------------------------------------------------------------------------
 *  js/geo-ml.js は純粋で、配列しか知らない。ここはそれを `IntMapData`（データセットの登録簿）に結ぶ薄い層:
 *  データセットを読み、geo-ml の関数へ渡し、結果を**新しいデータセット**として登録して返す（地図へは map.drawDataset）。
 *  依存（登録簿・Overpass・ジオコーダ）は env で受け取る＝fake で評価できる。
 *
 *    op 'trend'     撮影日の確かな複数のラスターから、画素ごとの変化の型・速さ・向き・時期（asOf があれば Chronos 用の選択だけ）
 *    op 'classify'  地域の意味分類（工業・住居・商業・港湾・農業・自然）。examples があれば利用者の正解から学ぶ
 *    op 'interpret' 変化した場所と時期に、施設・ニュース・統計を結ぶ（原因とは言わない）
 *    op 'model'     目的変数のデータセット + 特徴量のデータセット → 空間/時間で評価 → 区間つきの予測（点のデータセット）
 * ==========================================================================*/
import * as G from './geo-ml.js';
import { FEATURES, measureCells, squareAround } from './geo-similar.js';

const fail = (code, detail) => ({ ok: false, code, detail: detail || null });
const isNum = (v) => typeof v === 'number' && isFinite(v);
const num = (v) => (v == null || v === '' ? NaN : +v);

/* データセットの撮影日を、**データセット自身が述べている場合だけ**拾う（取得時の証拠 #1318 の形: provenance.evidence.images[].date）。
   述べていなければ呼び出し側の明示（date + dateBasis）に頼り、それも無ければ observation として数えない。 */
function datedFrom(ds, spec) {
  if (spec.date != null) return { date: spec.date, endDate: spec.endDate || null, dateBasis: spec.dateBasis || null };
  const ev = ds && ds.provenance && ds.provenance.evidence, im = ev && Array.isArray(ev.images) ? ev.images : [];
  if (im.length === 1 && im[0] && im[0].date) return { date: im[0].date, endDate: null, dateBasis: 'acquired' };
  return { date: null, endDate: null, dateBasis: null };
}
const sameGrid = (a, b) => a.width === b.width && a.height === b.height && ['west', 'north', 'pixelLng', 'pixelLat'].every((k) => Math.abs(a.grid[k] - b.grid[k]) < 1e-9);

async function rasterOf(ds, band) {
  const b = (ds.bands && ds.bands[band]) || {}, data = await ds.read(band);
  return { width: ds.width, height: ds.height, grid: ds.grid, data, nodata: b.nodata != null ? b.nodata : undefined };
}
function pointsOf(ds) {
  const out = []; let skipped = 0;
  for (const f of ds.features()) {
    const g = f && f.geometry; if (!g) { skipped++; continue; }
    let c = null;
    if (g.type === 'Point') c = g.coordinates;
    else { const flat = []; (function w(a) { if (typeof a[0] === 'number') flat.push(a); else a.forEach(w); })(g.coordinates || []); if (flat.length) c = [flat.reduce((s, p) => s + p[0], 0) / flat.length, flat.reduce((s, p) => s + p[1], 0) / flat.length]; }
    if (!c) { skipped++; continue; }
    out.push({ lng: +c[0], lat: +c[1], props: f.properties || {}, geom: g });
  }
  return { points: out, skipped };
}
function ringsOf(ds) { const r = []; for (const f of ds.features()) { const g = f.geometry; if (!g) continue; if (g.type === 'Polygon') r.push(g.coordinates[0]); else if (g.type === 'MultiPolygon') g.coordinates.forEach((p) => r.push(p[0])); } return r; }

/* ── trend ── */
async function runTrend(a, env) {
  const D = env.D, specs = Array.isArray(a.observations) ? a.observations : [];
  if (!specs.length) return fail('NEEDS_INPUT', 'observations');
  const rejected = [], cand = [];
  for (const s of specs) {
    const ds = D.get(s.dataset);
    if (!ds || ds.kind !== 'raster') { rejected.push({ id: s.dataset, reason: !ds ? 'no-such-dataset' : 'not-a-raster' }); continue; }
    const d = datedFrom(ds, s); cand.push({ id: ds.id, ds, band: s.band | 0, date: d.date, endDate: d.endDate, dateBasis: d.dateBasis });
  }
  if (a.asOf != null) {
    const sel = G.selectForTime(cand, a.asOf, { toleranceDays: a.toleranceDays });
    return { ok: !!sel.obs, op: 'trend', mode: 'select', code: sel.obs ? 'OK' : 'NO_DATED_OBSERVATION_FOR_THAT_DATE', asOf: a.asOf, selected: sel.obs ? { dataset: sel.obs.id, date: sel.obs.date, basis: sel.obs.dateBasis, offsetDays: sel.offsetDays } : null, reason: sel.reason || null, nearestDays: sel.nearestDays != null ? sel.nearestDays : null, rejected: rejected.concat(sel.rejected || []) };
  }
  const adm = G.admitObservations(cand), ref = adm.admitted[0];
  const layers = []; const gridRejected = [];
  for (const o of adm.admitted) {
    if (!sameGrid(o.ds, ref.ds)) { gridRejected.push({ id: o.id, reason: 'grid-differs-from-' + ref.id }); continue; }
    layers.push({ id: o.id, date: o.date, endDate: o.endDate, dateBasis: o.dateBasis, data: await o.ds.read(o.band) });
  }
  const sea = a.season ? G.sameSeason(layers, a.season, a.seasonWindowDays) : null;
  const use = sea ? sea.kept : layers;
  const res = G.analyzeRasterSeries({ width: ref.ds.width, height: ref.ds.height, layers: use }, { minObs: a.minObs, alpha: a.alpha, nodata: ref.ds.bands && ref.ds.bands[ref.band] && ref.ds.bands[ref.band].nodata });
  const allRejected = rejected.concat(adm.rejected, gridRejected, sea ? [{ id: 'season', reason: 'kept-' + use.length + '-of-' + layers.length + '-by-season' }] : []);
  if (!res.ok) return Object.assign({ op: 'trend', rejected: allRejected }, res);
  const B = res.bands, names = [['slope', 'per year'], ['p', null], ['breakFrom', 'year'], ['breakTo', 'year'], ['delta', null], ['pattern', 'code'], ['n', 'observations']];
  const out = D.add({
    kind: 'raster', title: String(a.title || 'multi-year change'), width: ref.ds.width, height: ref.ds.height, grid: ref.ds.grid,
    bands: names.map(([name, unit]) => ({ name, unit })), read: (i) => B[names[i][0]],
    provenance: { kind: 'geo-ml', op: 'trend', evidence: { basis: 'image-derived', observations: res.admitted, rejected: allRejected, method: 'Theil-Sen slope; Mann-Kendall; best single step against a simulated null', patternCodes: res.patternCodes, caveats: res.caveats } },
  });
  return { ok: true, op: 'trend', code: 'OK', dataset: out.id, nObservations: res.nObservations, span: res.span, summary: res.summary, patternCodes: res.patternCodes, admitted: res.admitted, rejected: allRejected, caveats: res.caveats };
}

/* ── classify ── */
async function measureRegions(list, env, sideKm) {
  const cells = list.map((c) => ({ name: c.name || null, lat: +c.lat, lng: +c.lng, label: c.label, bbox: squareAround(+c.lat, +c.lng, sideKm) }));
  const m = await measureCells(cells, env.counts, { concurrency: 2 });
  const rows = [];
  for (const r of m.rows) { let farm = null; if (env.farmland) { try { farm = await env.farmland(r.bbox); } catch (_) { farm = null; } } rows.push(Object.assign({}, r, { farmland: farm })); }
  return { rows, failed: m.failed, notAsked: m.notAsked };
}
const vecOf = (r) => FEATURES.map((_, j) => Math.log1p((r.counts[j] || 0) / r.areaKm2)).concat([Math.log1p((r.farmland || 0) / r.areaKm2)]);
async function runClassify(a, env) {
  const sideKm = +a.sideKm > 0 ? +a.sideKm : 2;
  let regions = Array.isArray(a.regions) ? a.regions.filter((c) => c && isNum(+c.lat) && isNum(+c.lng)) : [];
  if (!regions.length && a.place && env.geocode) { const g = await env.geocode(a.place); if (g) regions = [{ name: a.place, lat: g.lat, lng: g.lng }]; }
  if (!regions.length) return fail('NEEDS_INPUT', 'regions');
  const m = await measureRegions(regions.slice(0, 60), env, sideKm);
  if (!m.rows.length) return fail('NOTHING_MEASURED', { failed: m.failed.length });
  let sup = null;
  const ex = Array.isArray(a.examples) ? a.examples.filter((e) => e && e.label && isNum(+e.lat) && isNum(+e.lng)) : [];
  if (ex.length) {
    const em = await measureRegions(ex.slice(0, 120), env, sideKm), labels = em.rows.map((r) => r.label);
    const fit = G.fitPrototypes(em.rows.map(vecOf), labels);
    sup = fit.ok ? { ok: true, model: fit.model, looAccuracy: fit.looAccuracy, majorityBaseline: fit.majorityBaseline, n: fit.n, confusion: fit.confusion, notMeasured: ex.length - em.rows.length } : Object.assign({ notMeasured: ex.length - em.rows.length }, fit);
  }
  const results = m.rows.map((r) => {
    const u = G.classifyRegion({ counts: r.counts, areaKm2: r.areaKm2, farmland: r.farmland }, { features: FEATURES });
    const s = sup && sup.ok ? G.classifyWith(sup.model, vecOf(r)) : null;
    return { name: r.name, lat: r.lat, lng: r.lng, class: u.cls, why: u.why || null, margin: u.margin != null ? u.margin : null, scores: (u.scores || []).slice(0, 3).map((x) => ({ cls: x.cls, score: +x.score.toFixed(3) })), because: (u.because || []).map((b) => b.id), supervised: s ? { class: s.cls, margin: s.margin } : null, farmlandKnown: r.farmland != null };
  });
  const out = env.D.add({
    title: String(a.title || 'region classes'),
    features: results.map((x) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x.lng, x.lat] }, properties: { name: x.name, class: x.class, supervised_class: x.supervised ? x.supervised.class : null, margin: x.margin } })),
    provenance: { kind: 'geo-ml', op: 'classify', method: sup && sup.ok ? 'a-priori prototypes + nearest centroid of user-labelled examples' : 'a-priori prototypes over OSM feature density (not calibrated)', sideKm },
  });
  return { ok: true, op: 'classify', code: 'OK', dataset: out.id, sideKm, results, failed: m.failed.length + (m.notAsked || 0), supervised: sup ? { ok: sup.ok, code: sup.code || null, looAccuracy: sup.looAccuracy != null ? sup.looAccuracy : null, majorityBaseline: sup.majorityBaseline != null ? sup.majorityBaseline : null, n: sup.n || null, confusion: sup.confusion || null } : null, caveats: ['classes-are-a-description-of-what-is-mapped', 'unmapped-is-not-rural', 'a-priori-prototypes-are-not-calibrated-unless-examples-were-given'] };
}

/* ── interpret ── */
function runInterpret(a) {
  const c = a.change; if (!c || !Array.isArray(c.bbox) || c.bbox.length !== 4) return fail('NEEDS_INPUT', 'change.bbox');
  const from = typeof c.from === 'number' ? c.from : G.toYear(c.from), to = typeof c.to === 'number' ? c.to : G.toYear(c.to);
  if (from == null || to == null) return fail('INVALID_INPUT', 'change.from/to');
  const r = G.interpretChange({ bbox: c.bbox.map(Number), from, to, direction: c.direction }, { facilities: a.facilities, news: a.news, stats: a.stats, changeSeries: a.changeSeries }, { toleranceYears: a.toleranceYears, nearKm: a.nearKm });
  return Object.assign({ ok: true, op: 'interpret', code: 'OK' }, r);
}

/* ── model ── */
async function featureFnsFor(specs, D) {
  const fns = [], used = [], problems = [];
  for (const s of specs) {
    const ds = D.get(s.dataset); if (!ds) { problems.push({ dataset: s.dataset, reason: 'no-such-dataset' }); continue; }
    const name = String(s.name || ds.title || ds.id).replace(/[^\w]+/g, '_').slice(0, 24) || ds.id;
    if (ds.kind === 'raster') { fns.push(G.rasterFeature(name, await rasterOf(ds, s.band | 0), { radiusPx: s.radiusPx })); used.push({ dataset: ds.id, as: name, kind: 'raster' }); continue; }
    const kind = s.kind || ((ds.geometryType === 'Polygon') ? 'inside' : 'count');
    if (kind === 'inside') { fns.push(G.insidePolygonFeature(name, ringsOf(ds))); used.push({ dataset: ds.id, as: name, kind }); }
    else { const pts = pointsOf(ds).points; if (kind === 'nearest') fns.push(G.nearestDistanceFeature(name, pts)); else fns.push(G.pointCountFeature(name, pts, Array.isArray(s.radiiKm) && s.radiiKm.length ? s.radiiKm.map(Number) : [1, 5])); used.push({ dataset: ds.id, as: name, kind }); }
  }
  return { fns, used, problems };
}
async function runModel(a, env) {
  const D = env.D, t = a.target || {}, tds = D.get(t.dataset);
  if (!tds || tds.kind !== 'vector' || !t.field) return fail('NEEDS_INPUT', 'target.dataset (a vector dataset) and target.field');
  const { points, skipped } = pointsOf(tds);
  const rows = points.map((p, k) => ({ id: k, lat: p.lat, lng: p.lng, y: num(p.props[t.field]), t: t.timeField ? (/^d{4}$/.test(String(p.props[t.timeField])) ? +p.props[t.timeField] : G.toYear(p.props[t.timeField])) : null }));
  const F = await featureFnsFor(Array.isArray(a.features) ? a.features : [], D);
  if (!F.fns.length && !a.coords) return fail('NEEDS_INPUT', { features: F.problems });
  const table = G.assembleTable(rows, F.fns, { coords: !!a.coords });
  /* 予測する場所: 点のデータセット、なければ目的変数の外接箱の格子（最大 400） */
  let where = [];
  if (a.predictAt && a.predictAt.dataset) { const pd = D.get(a.predictAt.dataset); if (pd && pd.kind === 'vector') where = pointsOf(pd).points.slice(0, 5000).map((p, i) => ({ id: i, lat: p.lat, lng: p.lng })); }
  if (!where.length) {
    const lats = rows.map((r) => r.lat), lngs = rows.map((r) => r.lng), s = Math.min(...lats), n = Math.max(...lats), w = Math.min(...lngs), e = Math.max(...lngs);
    const k = Math.max(2, Math.min(20, Math.round(Math.sqrt(a.gridCells > 0 ? +a.gridCells : 400))));
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) where.push({ id: i * k + j, lat: s + (n - s) * (i + 0.5) / k, lng: w + (e - w) * (j + 0.5) / k });
  }
  const newRows = where.map((p) => { const x = {}; for (const f of F.fns) Object.assign(x, f(p)); if (a.coords) { x.lat = p.lat; x.lng = p.lng; } return { id: p.id, lat: p.lat, lng: p.lng, x: table.names.map((nm) => (isNum(x[nm]) ? x[nm] : NaN)) }; });
  const res = G.fitAndPredict(table, newRows, { alpha: a.alpha, folds: a.folds, blockKm: a.blockKm, bufferKm: a.bufferKm, cutoff: a.cutoff, seed: a.seed });
  if (!res.ok) return Object.assign({ op: 'model', features: F.used, droppedColumns: table.droppedColumns }, res);
  const out = D.add({
    title: String(a.title || ('prediction of ' + t.field)), features: G.predictionFeatures(res),
    provenance: { kind: 'geo-ml', op: 'model', target: { dataset: tds.id, field: t.field }, features: F.used, model: res.model, interval: res.interval, validation: { design: res.validation.design, spatial: res.validation.models[res.model.kind].spatial, temporal: res.validation.temporal }, warnings: res.warnings },
  });
  return { ok: true, op: 'model', code: 'OK', dataset: out.id, n: table.rows.length, skippedTargets: skipped + table.droppedRows, features: F.used, featureProblems: F.problems, droppedColumns: res.dropped.columns, model: res.model, validation: res.validation, interval: res.interval, importance: res.importance.slice(0, 8), extrapolating: res.predictions.filter((p) => p.extrapolating).length, predicted: res.predictions.length, warnings: res.warnings };
}

export async function runGeoMl(a, env) {
  try {
    if (a.op === 'trend') return await runTrend(a, env);
    if (a.op === 'classify') return await runClassify(a, env);
    if (a.op === 'interpret') return runInterpret(a);
    if (a.op === 'model') return await runModel(a, env);
    return fail('INVALID_INPUT', 'op must be trend, classify, interpret or model');
  } catch (e) { return fail('RUN_FAILED', String((e && e.message) || e).slice(0, 200)); }
}
