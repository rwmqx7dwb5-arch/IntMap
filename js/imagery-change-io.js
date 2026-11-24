/* ============================================================================
 *  IntMap · 画像変化の取得と実行 — 画像を探し、同じ格子に読み、js/imagery-change.js で比べる   (js/imagery-change-io.js)
 * ----------------------------------------------------------------------------
 *  4 種類の観測を、実在する公開の取得経路から読む。どれも利用条件を一次情報で読み、ブラウザからの読み出し（CORS・範囲読み）を
 *  実測した（2026-11-20、dev-notes/2026-11-20-satellite-change-analysis.md §1）:
 *
 *    optical    Sentinel-2 L2A（Earth Search の STAC ＋ sentinel-cogs の COG）。雲は SCL で画素ごとに落とす。
 *    sar        Sentinel-1 RTC（Microsoft Planetary Computer。地形補正済みの後方散乱）。同じ軌道方向・相対軌道の 2 時点だけを比べる。
 *    landcover  Impact Observatory の年次 10 m 土地被覆（Planetary Computer）。年ごとに同じ手法なので比べられる。
 *    embedding  AlphaEarth Foundations の年次衛星埋め込み（Source Cooperative の COG・CC BY 4.0）。64 次元・10 m。
 *
 *  ⚠ 読み出しは js/gis-cog.js（範囲読み・再標本化は nearest）。呼び出し側が範囲と画素数を述べ、こちらは雲の無い画素だけを残す。
 *  ⚠ 夜間光は含めない: 全球の数値（VIIRS DNB の年次合成）は登録が要る配布（EOG）か、地図タイルの画像（NASA GIBS・数値でない）で、
 *    ブラウザから匿名で読める数値の供給元を確認できなかった（理由は dev-notes）。標高は SAR の地形補正（RTC）が内部で使う。
 *  ⚠ Planetary Computer の COG は、同社の「データ認証 API」が匿名で配る短命の SAS トークンを付けて読む（トークンは作らず、
 *    API が返したものをそのまま使い、失効前に取り直す。URL 以外に利用者の情報は送らない）。
 * ==========================================================================*/
import { sclUsable, INDICES, reflectanceOf, normalisedDifference, pairedChange, classTransitions, aefVectors, embeddingChange, meanEmbedding, meanEmbeddingIn, toDecibel, pixelAreaKm2, evidenceOf, AEF_DIMS } from './imagery-change.js';

export const SOURCES = Object.freeze({
  earthSearch: { url: 'https://earth-search.aws.element84.com/v1', host: 'earth-search.aws.element84.com', checked: '2026-11-20' },
  planetary: { stac: 'https://planetarycomputer.microsoft.com/api/stac/v1', sas: 'https://planetarycomputer.microsoft.com/api/sas/v1/token/', host: 'planetarycomputer.microsoft.com', checked: '2026-11-20' },
  aef: {
    base: 'https://data.source.coop/tge-labs/aef/v1/annual', s3: 's3://us-west-2.opendata.source.coop/tge-labs/aef/v1/annual/', host: 'data.source.coop',
    license: 'CC-BY-4.0', attribution: 'The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind.',
    years: [2017, 2025], dims: AEF_DIMS, checked: '2026-11-20',
  },
  s2: { license: 'Copernicus Sentinel data — free, full and open', attribution: 'Contains modified Copernicus Sentinel data', collection: 'sentinel-2-l2a' },
  s1: { license: 'CC-BY-4.0', attribution: 'Contains modified Copernicus Sentinel data, processed by Catalyst (Microsoft Planetary Computer)', collection: 'sentinel-1-rtc' },
  lulc: { license: 'CC-BY-4.0', collection: 'io-lulc-annual-v02' },
});

const dayMs = 86400000;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

/* 期間の言い方: 'YYYY'（その年の全部）／'YYYY-MM-DD'（その日の前後 windowDays 日）／{from,to}。 */
export function periodOf(p, windowDays) {
  const w = Number.isFinite(windowDays) && windowDays > 0 ? windowDays : 15;
  if (p && typeof p === 'object' && p.from && p.to) return { from: String(p.from).slice(0, 10), to: String(p.to).slice(0, 10), mid: isoDay((Date.parse(p.from) + Date.parse(p.to)) / 2) };
  const s = String(p == null ? '' : p).trim();
  if (/^\d{4}$/.test(s)) return { from: s + '-01-01', to: s + '-12-31', mid: s + '-07-01', year: +s };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const t = Date.parse(s + 'T00:00:00Z'); return { from: isoDay(t - w * dayMs), to: isoDay(t + w * dayMs), mid: s }; }
  return null;
}

/* 範囲と画素の大きさ(m)から格子（画素数）を決める。maxPixels を超えるなら画素を大きくし、その事実を返す。 */
export function latticeFor(bounds, pixelM, maxPixels) {
  const lat = (bounds[1] + bounds[3]) / 2, wM = (bounds[2] - bounds[0]) * 111320 * Math.cos(lat * Math.PI / 180), hM = (bounds[3] - bounds[1]) * 110574;
  let px = Math.max(1, +pixelM || 20), enlarged = false;
  const cap = Math.max(1024, maxPixels | 0 || 262144);
  let width = Math.max(1, Math.round(wM / px)), height = Math.max(1, Math.round(hM / px));
  if (width * height > cap) { px = px * Math.sqrt((width * height) / cap); enlarged = true; width = Math.max(1, Math.round(wM / px)); height = Math.max(1, Math.round(hM / px)); }
  return { bounds: bounds.slice(0, 4), width, height, pixelM: Math.round(px * 10) / 10, requestedPixelM: +pixelM || 20, enlarged, pixelKm2: pixelAreaKm2(bounds, width, height) };
}

const bboxContains = (outer, inner) => Array.isArray(outer) && outer.length >= 4 && outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];

export function makeImageryChange(deps) {
  const D = deps || {};
  const fetchFn = (...a) => (D.fetch || globalThis.fetch)(...a);
  const readWindow = (...a) => D.readWindow(...a);
  const fail = (why, detail) => ({ ok: false, why, detail: detail === undefined ? null : detail });

  async function json(url, init) {
    let r;
    try { r = await fetchFn(url, init); } catch (e) { return { ok: false, why: 'fetch-failed', detail: { url, message: String((e && e.message) || e).slice(0, 120) } }; }
    if (!r.ok) return { ok: false, why: 'http-status', detail: { url, status: r.status } };
    try { return { ok: true, json: await r.json() }; } catch (_) { return { ok: false, why: 'not-json', detail: { url } }; }
  }
  async function stacSearch(root, body) {
    const r = await json(root + '/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return r;
    return { ok: true, items: (r.json && r.json.features) || [], matched: r.json && r.json.context ? r.json.context.matched : null };
  }

  /* ── Planetary Computer の匿名トークン（コレクション単位・失効前に取り直す） ── */
  const tokens = new Map();
  async function pcToken(collection) {
    const t = tokens.get(collection), now = Date.now();
    if (t && t.expires - now > 120000) return { ok: true, token: t.token };
    const r = await json(SOURCES.planetary.sas + encodeURIComponent(collection));
    if (!r.ok) return r;
    const tok = r.json && r.json.token, exp = Date.parse(r.json && r.json['msft:expiry']);
    if (!tok) return fail('token-missing', { collection });
    tokens.set(collection, { token: tok, expires: Number.isFinite(exp) ? exp : now + 600000 });
    return { ok: true, token: tok };
  }
  async function signed(collection, href) {
    const t = await pcToken(collection);
    if (!t.ok) return t;
    return { ok: true, url: href + (href.indexOf('?') < 0 ? '?' : '&') + t.token };
  }

  /* ── 共通: 1 時点を、同じ格子に何枚かの帯域として読む ── */
  async function readBands(urls, lat, extra) {
    const out = {};
    for (const [name, url] of Object.entries(urls)) {
      const r = await readWindow(url, { bounds: lat.bounds, width: lat.width, height: lat.height });
      if (!r.ok) return fail(r.why, Object.assign({ band: name, url: String(url).split('?')[0] }, r.detail || {}));
      out[name] = { values: r.raster.read(0), coverage: r.coverage, source: r.source };
    }
    return { ok: true, bands: out };
  }
  const coverageOf = (bands) => { const cs = Object.values(bands).map((b) => b.coverage); return { complete: cs.every((c) => c && c.completeness === 'all'), reasons: [...new Set(cs.map((c) => c && c.reason).filter(Boolean))] }; };

  /* ═════════════ optical: Sentinel-2 L2A ═════════════ */
  async function s2Candidates(bounds, per, maxCloud) {
    const r = await stacSearch(SOURCES.earthSearch.url, {
      collections: [SOURCES.s2.collection], bbox: bounds, datetime: per.from + 'T00:00:00Z/' + per.to + 'T23:59:59Z', limit: 24,
      query: { 'eo:cloud_cover': { lte: maxCloud } }, sortby: [{ field: 'properties.eo:cloud_cover', direction: 'asc' }],
    });
    return r;
  }
  /* 候補から 1 枚を選ぶ。範囲を完全に覆い（item.bbox）、その範囲の SCL で使える画素が minUsable 以上の最初のもの。
     preferGrid（先に選んだ時点の MGRS 格子）と同じものを優先する: 同じ格子なら 2 時点は再標本化なしで重なる。 */
  async function chooseS2(cands, lat, preferGrid, minUsable) {
    const ordered = cands.slice().sort((a, b) => ((preferGrid && b.properties['grid:code'] === preferGrid) - (preferGrid && a.properties['grid:code'] === preferGrid)) || (a.properties['eo:cloud_cover'] - b.properties['eo:cloud_cover']));
    const tried = []; let best = null;
    for (const it of ordered.slice(0, 6)) {
      if (!it.assets || !it.assets.scl) continue;
      const covers = bboxContains(it.bbox, lat.bounds);
      const r = await readWindow(it.assets.scl.href, { bounds: lat.bounds, width: lat.width, height: lat.height });
      if (!r.ok) { tried.push({ id: it.id, why: r.why }); continue; }
      const v = r.raster.read(0); let ok = 0; for (let i = 0; i < v.length; i++) if (sclUsable(v[i])) ok++;
      const usable = ok / v.length, row = { item: it, scl: v, usable, covers, sclCoverage: r.coverage };
      tried.push({ id: it.id, cloudCover: it.properties['eo:cloud_cover'], usable: Math.round(usable * 1000) / 1000, covers });
      if (!best || usable > best.usable) best = row;
      if (usable >= minUsable && covers) { best = row; break; }
    }
    return best ? { ok: true, chosen: best, tried } : fail('no-usable-scene', { tried });
  }
  async function optical(a) {
    const per = { before: periodOf(a.before, a.windowDays), after: periodOf(a.after, a.windowDays) };
    if (!per.before || !per.after) return fail('bad-period', { need: "'YYYY', 'YYYY-MM-DD' or {from,to} for both before and after" });
    const idx = INDICES[a.index || 'ndvi']; if (!idx) return fail('bad-index', { accepts: Object.keys(INDICES) });
    const lat = latticeFor(a.bounds, a.pixelM || 20, a.maxPixels);
    const maxCloud = Number.isFinite(+a.maxCloud) ? +a.maxCloud : 60, minUsable = Number.isFinite(+a.minUsable) ? +a.minUsable : 0.8;
    const picks = {};
    for (const role of ['before', 'after']) {
      const c = await s2Candidates(lat.bounds, per[role], maxCloud);
      if (!c.ok) return c;
      if (!c.items.length) return fail('no-scene', { role, period: per[role], maxCloud, hint: 'widen the period or raise maxCloud' });
      const ch = await chooseS2(c.items, lat, role === 'after' && picks.before ? picks.before.item.properties['grid:code'] : null, minUsable);
      if (!ch.ok) return fail(ch.why, Object.assign({ role }, ch.detail));
      picks[role] = ch.chosen; picks[role].tried = ch.tried;
    }
    const arrays = {};
    for (const role of ['before', 'after']) {
      const it = picks[role].item, urls = {};
      for (const b of idx.bands) { if (!it.assets[b]) return fail('asset-missing', { role, asset: b, id: it.id }); urls[b] = it.assets[b].href; }
      const rb = await readBands(urls, lat);
      if (!rb.ok) return rb;
      const refl = {};
      for (const b of idx.bands) { refl[b] = reflectanceOf(rb.bands[b].values, it.assets[b]); if (!refl[b]) return fail('scale-not-stated', { role, asset: b, hint: 'the STAC asset states no raster:bands scale, so a reflectance would be a guess' }); }
      const mask = picks[role].scl.map((v) => (sclUsable(v) ? 1 : 0));
      arrays[role] = { index: normalisedDifference(refl[idx.bands[0]], refl[idx.bands[1]], mask), cov: coverageOf(rb.bands), masked: 1 - picks[role].usable };
    }
    const ch = pairedChange(arrays.before.index, arrays.after.index, { pixelKm2: lat.pixelKm2, k: a.k });
    if (!ch.ok) return fail(ch.code, { valid: ch.valid, total: ch.total, scenes: { before: picks.before.item.id, after: picks.after.item.id } });
    const sc = (role) => { const it = picks[role].item; return { role, id: it.id, datetime: it.properties.datetime, cloudCover: it.properties['eo:cloud_cover'], grid: it.properties['grid:code'] || null, collection: SOURCES.s2.collection, href: SOURCES.earthSearch.url + '/collections/' + SOURCES.s2.collection + '/items/' + it.id, source: 'Earth Search (Element 84) / AWS sentinel-cogs', license: SOURCES.s2.license, attribution: SOURCES.s2.attribution }; };
    const sameGrid = picks.before.item.properties['grid:code'] && picks.before.item.properties['grid:code'] === picks.after.item.properties['grid:code'];
    const caveats = [];
    if (!sameGrid) caveats.push('The two scenes are on different MGRS grids, so one of them was resampled (nearest) onto the lattice; edge pixels can shift by up to one pixel.');
    for (const role of ['before', 'after']) { if (!picks[role].covers) caveats.push('The ' + role + ' scene does not fully cover the window.'); if (picks[role].usable < minUsable) caveats.push('Only ' + Math.round(picks[role].usable * 100) + '% of the ' + role + ' window is clear (cloud, shadow or no-data pixels were dropped).'); if (!arrays[role].cov.complete) caveats.push('The ' + role + ' read was partial: ' + arrays[role].cov.reasons.join(', ') + '.'); }
    return {
      ok: true, kind: 'optical', index: a.index || 'ndvi', indexInfo: idx, lattice: lat, change: ch, before: arrays.before.index, after: arrays.after.index,
      evidence: evidenceOf({
        kind: 'optical', scenes: [sc('before'), sc('after')], method: idx.label + ' per pixel (' + idx.bands.join(' vs ') + ' reflectance from the STAC scale/offset), after minus before; cloud, shadow, cirrus, saturated and no-data pixels (SCL) dropped',
        params: { index: a.index || 'ndvi', k: ch.stats.k, maxCloud, minUsable, windowDays: a.windowDays || 15 }, lattice: { bounds: lat.bounds, width: lat.width, height: lat.height, pixelM: lat.pixelM, resampling: 'nearest' },
        quality: { sameGrid: !!sameGrid, beforeUsable: picks.before.usable, afterUsable: picks.after.usable, validFraction: ch.stats.validFraction, tried: { before: picks.before.tried, after: picks.after.tried } }, caveats,
      }),
    };
  }

  /* ═════════════ sar: Sentinel-1 RTC (Planetary Computer) ═════════════ */
  async function sar(a) {
    const per = { before: periodOf(a.before, a.windowDays || 12), after: periodOf(a.after, a.windowDays || 12) };
    if (!per.before || !per.after) return fail('bad-period', { need: "'YYYY', 'YYYY-MM-DD' or {from,to}" });
    const pol = a.polarization === 'vh' ? 'vh' : 'vv', lat = latticeFor(a.bounds, a.pixelM || 40, a.maxPixels);
    const search = async (per1, extra) => stacSearch(SOURCES.planetary.stac, Object.assign({ collections: [SOURCES.s1.collection], bbox: lat.bounds, datetime: per1.from + '/' + per1.to, limit: 30 }, extra || {}));
    const b0 = await search(per.before); if (!b0.ok) return b0;
    const covering = (items) => items.filter((it) => bboxContains(it.bbox, lat.bounds) && it.assets && it.assets[pol]);
    const bc = covering(b0.items); if (!bc.length) return fail('no-scene', { role: 'before', period: per.before });
    const nearest = (items, mid) => items.slice().sort((x, y) => Math.abs(Date.parse(x.properties.datetime) - Date.parse(mid)) - Math.abs(Date.parse(y.properties.datetime) - Date.parse(mid)));
    const before = nearest(bc, per.before.mid)[0], P = before.properties;
    /* 同じ軌道方向・相対軌道・偏波だけを比べる: 入射角が違うと後方散乱が地表と無関係に変わる */
    const a0 = await search(per.after, { query: { 'sat:orbit_state': { eq: P['sat:orbit_state'] }, 'sat:relative_orbit': { eq: P['sat:relative_orbit'] } } }); if (!a0.ok) return a0;
    const ac = covering(a0.items); if (!ac.length) return fail('no-scene', { role: 'after', period: per.after, constraint: { orbit: P['sat:orbit_state'], relativeOrbit: P['sat:relative_orbit'] }, hint: 'no pass with the same geometry in that period' });
    const after = nearest(ac, per.after.mid)[0];
    const arr = {};
    for (const [role, it] of [['before', before], ['after', after]]) {
      const u = await signed(SOURCES.s1.collection, it.assets[pol].href); if (!u.ok) return u;
      const rb = await readBands({ [pol]: u.url }, lat); if (!rb.ok) return rb;
      arr[role] = { db: toDecibel(rb.bands[pol].values), cov: coverageOf(rb.bands) };
    }
    const ch = pairedChange(arr.before.db, arr.after.db, { pixelKm2: lat.pixelKm2, k: a.k });
    if (!ch.ok) return fail(ch.code, { valid: ch.valid, total: ch.total });
    const sc = (role, it) => ({ role, id: it.id, datetime: it.properties.datetime, cloudCover: null, grid: 'orbit ' + it.properties['sat:orbit_state'] + ' #' + it.properties['sat:relative_orbit'], collection: SOURCES.s1.collection, href: SOURCES.planetary.stac + '/collections/' + SOURCES.s1.collection + '/items/' + it.id, source: 'Microsoft Planetary Computer (Sentinel-1 RTC, Catalyst)', license: SOURCES.s1.license, attribution: SOURCES.s1.attribution });
    const caveats = ['Radar backscatter changes with surface moisture, wind on water and vegetation structure as well as with construction or clearing; a dB change is not a type of change.'];
    if (lat.pixelM < 30) caveats.push('Speckle is strong at a pixel this fine; a larger pixel averages it.');
    return {
      ok: true, kind: 'sar', polarization: pol, lattice: lat, change: ch, before: arr.before.db, after: arr.after.db,
      evidence: evidenceOf({ kind: 'sar', scenes: [sc('before', before), sc('after', after)], method: 'Sentinel-1 RTC γ0 ' + pol.toUpperCase() + ' in dB, after minus before; the two passes share orbit direction and relative orbit', params: { polarization: pol, k: ch.stats.k, orbit: P['sat:orbit_state'], relativeOrbit: P['sat:relative_orbit'] }, lattice: { bounds: lat.bounds, width: lat.width, height: lat.height, pixelM: lat.pixelM, resampling: 'nearest (overview average where the file has one)' }, quality: { validFraction: ch.stats.validFraction }, caveats }),
    };
  }

  /* ═════════════ landcover: Impact Observatory annual (Planetary Computer) ═════════════ */
  let lulcClasses = null;
  async function lulcMeta() {
    if (lulcClasses) return { ok: true, meta: lulcClasses };
    const r = await json(SOURCES.planetary.stac + '/collections/' + SOURCES.lulc.collection);
    if (!r.ok) return r;
    const fv = r.json && r.json.item_assets && r.json.item_assets.data && r.json.item_assets.data['file:values'];
    if (!Array.isArray(fv)) return fail('classes-not-stated', { collection: SOURCES.lulc.collection });
    const classes = {}; let cloud = null;
    for (const e of fv) { const c = e.values && e.values[0]; if (c === 0) continue; if (/cloud/i.test(e.summary)) { cloud = c; continue; } classes[c] = e.summary; }
    lulcClasses = { classes, cloud, providers: (r.json.providers || []).map((p) => p.name), license: r.json.license, years: r.json.extent && r.json.extent.temporal && r.json.extent.temporal.interval && r.json.extent.temporal.interval[0] };
    return { ok: true, meta: lulcClasses };
  }
  async function landcover(a) {
    const yb = periodOf(a.before), ya = periodOf(a.after);
    if (!yb || !ya || !yb.year || !ya.year) return fail('bad-period', { need: 'a year (YYYY) for both before and after' });
    const m = await lulcMeta(); if (!m.ok) return m;
    const lat = latticeFor(a.bounds, a.pixelM || 30, a.maxPixels), centre = [(lat.bounds[0] + lat.bounds[2]) / 2, (lat.bounds[1] + lat.bounds[3]) / 2];
    const got = {};
    for (const [role, y] of [['before', yb.year], ['after', ya.year]]) {
      const s = await stacSearch(SOURCES.planetary.stac, { collections: [SOURCES.lulc.collection], bbox: lat.bounds, datetime: y + '-01-01T00:00:00Z/' + y + '-12-31T23:59:59Z', limit: 10 });
      if (!s.ok) return s;
      const it = s.items.find((i) => i.assets && i.assets.data && i.bbox[0] <= centre[0] && i.bbox[2] >= centre[0] && i.bbox[1] <= centre[1] && i.bbox[3] >= centre[1]);
      if (!it) return fail('no-scene', { role, year: y, hint: 'this collection covers 2017–2023 and not every place' });
      const u = await signed(SOURCES.lulc.collection, it.assets.data.href); if (!u.ok) return u;
      const rb = await readBands({ data: u.url }, lat); if (!rb.ok) return rb;
      got[role] = { item: it, values: rb.bands.data.values, cov: coverageOf(rb.bands) };
    }
    const tr = classTransitions(got.before.values, got.after.values, m.meta.classes, { pixelKm2: lat.pixelKm2 });
    if (!tr.ok) return fail(tr.code, { usable: tr.usable, total: tr.total });
    const sc = (role) => { const it = got[role].item; return { role, id: it.id, datetime: it.properties.datetime || it.properties.start_datetime, collection: SOURCES.lulc.collection, href: SOURCES.planetary.stac + '/collections/' + SOURCES.lulc.collection + '/items/' + it.id, source: 'Microsoft Planetary Computer (Impact Observatory / Esri)', license: m.meta.license || SOURCES.lulc.license, attribution: (m.meta.providers || []).join(', ') }; };
    const caveats = ['Each year is a classifier output; a class change between years can come from the model, not the ground. Small shifts between neighbouring classes (e.g. crops and rangeland) are the least reliable.'];
    if (tr.unusable / tr.total > 0.05) caveats.push(Math.round(tr.unusable / tr.total * 100) + '% of pixels had no usable class in one of the years (no data or cloud) and were left out.');
    return { ok: true, kind: 'landcover', lattice: lat, transitions: tr, years: { before: yb.year, after: ya.year }, evidence: evidenceOf({ kind: 'landcover', scenes: [sc('before'), sc('after')], method: 'class transition between two annual maps made by the same classifier, per pixel', params: { classes: m.meta.classes }, lattice: { bounds: lat.bounds, width: lat.width, height: lat.height, pixelM: lat.pixelM, resampling: 'nearest' }, quality: { usable: tr.usable, unusable: tr.unusable }, caveats }) };
  }

  /* ═════════════ embedding: AlphaEarth Foundations ═════════════ */
  /* 索引（aef_index.csv, 約 800 MB）は UTM 帯・年の順に並んでいる。全部は読まず、バイト範囲の二分探索で (帯, 年) の塊だけを読む。
     並び順は観測（2026-11-20、先頭・10%・25%・50%・75%・90%・99% の各位置の行が 北半球 1N…60N → 南半球 1S…60S、帯の中で年の昇順）で、
     読んだ塊の行が欲しい (帯, 年) でなければ `index-order-unexpected` と名指しして止まる（黙って別の年の画像を返さない）。 */
  const indexUrl = SOURCES.aef.base + '/aef_index.csv';
  let indexSize = null; const probeCache = new Map(); const blockCache = new Map();
  /* 公開の配布先は接続を途中で切ることがある（観測: 2026-11-20、undici "terminated"）。実在した失敗なので 1 回だけ同じ範囲を取り直す。 */
  async function rangeText(from, to) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetchFn(indexUrl, { headers: { Range: 'bytes=' + from + '-' + to } });
        if (r.status !== 206 && r.status !== 200) throw new Error('index http ' + r.status);
        if (r.status === 200 && from > 0) throw new Error('index server ignored the Range header');
        return await r.text();
      } catch (e) { last = e; }
    }
    throw last;
  }  async function sizeOfIndex() {
    if (indexSize) return indexSize;
    const r = await fetchFn(indexUrl, { method: 'HEAD' });
    const n = +r.headers.get('content-length');
    if (!(n > 0)) throw new Error('index size unknown');
    return (indexSize = n);
  }
  const rowOf = (line) => {
    const m = /\)\)",(EPSG:\d+),(s3:\/\/[^,]+),(\d{4}),(\d+)([NS]),([\d.\-]+),([\d.\-]+),([\d.\-]+),([\d.\-]+),([\d.\-]+),([\d.\-]+),([\d.\-]+),([\d.\-]+)\s*$/.exec(line);
    if (!m) return null;
    return { crs: m[1], s3: m[2], year: +m[3], zone: +m[4], hem: m[5], key: (m[5] === 'N' ? 0 : 1) * 1e6 + (+m[4]) * 1e4 + (+m[3]), bbox: [+m[10], +m[11], +m[12], +m[13]] };
  };
  const keyOf = (zone, hem, year) => (hem === 'N' ? 0 : 1) * 1e6 + zone * 1e4 + year;
  async function probe(offset) {
    if (probeCache.has(offset)) return probeCache.get(offset);
    const text = await rangeText(offset, offset + 16383);
    const lines = text.split('\n'); let row = null;
    for (let i = 1; i < lines.length - 1 && !row; i++) row = rowOf(lines[i]);
    probeCache.set(offset, row);
    return row;
  }
  async function searchOffset(pred, size) {
    let lo = 0, hi = size - 16384;
    while (hi - lo > 49152) {
      const mid = Math.floor((lo + hi) / 2), row = await probe(mid);
      if (!row) { hi = mid; continue; }
      if (pred(row.key)) hi = mid; else lo = mid;
    }
    return { lo, hi };
  }
  async function aefBlock(zone, hem, year) {
    const ck = zone + hem + year;
    if (blockCache.has(ck)) return blockCache.get(ck);
    const size = await sizeOfIndex(), target = keyOf(zone, hem, year);
    const [ra, rb] = await Promise.allSettled([searchOffset((k) => k >= target, size), searchOffset((k) => k > target, size)]);
    if (ra.status === 'rejected') throw ra.reason; if (rb.status === 'rejected') throw rb.reason;
    const a = ra.value, b = rb.value;
    const text = await rangeText(a.lo, Math.min(size - 1, b.hi + 16383));
    const rows = text.split('\n').map(rowOf).filter((r) => r && r.key === target);
    blockCache.set(ck, rows);
    return rows;
  }
  const zoneOf = (lng) => Math.min(60, Math.max(1, Math.floor((lng + 180) / 6) + 1));
  async function aefLocate(bounds, year) {
    const [lo, hi] = SOURCES.aef.years;
    if (!(year >= lo && year <= hi)) return fail('year-out-of-range', { year, available: [lo, hi] });
    const cx = (bounds[0] + bounds[2]) / 2, cy = (bounds[1] + bounds[3]) / 2, hem = cy >= 0 ? 'N' : 'S';
    const z0 = zoneOf(cx), tried = [];
    for (const z of [z0, z0 - 1, z0 + 1].map((v) => ((v - 1 + 60) % 60) + 1)) {
      let rows;
      try { rows = await aefBlock(z, hem, year); } catch (e) { return fail('index-unreadable', { message: String((e && e.message) || e).slice(0, 120) }); }
      tried.push({ zone: z + hem, rows: rows.length });
      const hit = rows.find((r) => r.bbox[0] <= cx && r.bbox[2] >= cx && r.bbox[1] <= cy && r.bbox[3] >= cy);
      if (hit) return { ok: true, tile: Object.assign({}, hit, { url: hit.s3.replace('s3://us-west-2.opendata.source.coop/', 'https://data.source.coop/'), covers: bboxContains(hit.bbox, bounds) }), tried };
    }
    return fail(tried.every((t) => !t.rows) ? 'index-order-unexpected' : 'no-tile', { year, tried, hint: tried.every((t) => !t.rows) ? 'no row of the expected UTM zone and year was found where the sorted index should hold it' : 'the place has no embedding tile (open ocean or ice, or outside the product)' });
  }
  async function aefWindow(bounds, year, lat) {
    const loc = await aefLocate(bounds, year); if (!loc.ok) return loc;
    const r = await readWindow(loc.tile.url, { bounds: lat.bounds, width: lat.width, height: lat.height, bands: Array.from({ length: AEF_DIMS }, (_, i) => i) });
    if (!r.ok) return fail(r.why, Object.assign({ year, tile: loc.tile.url }, r.detail || {}));
    return { ok: true, tile: loc.tile, vectors: aefVectors(r.rasters.map((g) => g.read(0))), coverage: r.coverage, source: r.source };
  }
  async function embedding(a) {
    const yb = periodOf(a.before), ya = periodOf(a.after);
    if (!yb || !ya || !yb.year || !ya.year) return fail('bad-period', { need: 'a year (YYYY) for both before and after', available: SOURCES.aef.years });
    const lat = latticeFor(a.bounds, a.pixelM || 20, Math.min(a.maxPixels || 40000, 40000));
    const [wb, wa] = await Promise.all([aefWindow(lat.bounds, yb.year, lat), aefWindow(lat.bounds, ya.year, lat)].map((p) => p.catch((e) => fail('read-threw', { message: String((e && e.message) || e).slice(0, 120) }))));
    if (!wb.ok) return wb; if (!wa.ok) return wa;
    const ch = embeddingChange(wb.vectors, wa.vectors, { pixelKm2: lat.pixelKm2, k: a.k });
    if (!ch.ok) return fail(ch.code, { valid: ch.valid, total: ch.total });
    const sc = (role, w, y) => ({ role, id: w.tile.s3.split('/').pop().replace(/\.tiff$/, ''), datetime: y + '-01-01/' + y + '-12-31', collection: 'GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL', href: w.tile.url, source: 'Source Cooperative (tge-labs/aef)', license: SOURCES.aef.license, attribution: SOURCES.aef.attribution });
    const caveats = ['An embedding year summarises a whole year of observations (optical, radar and more) per 10 m pixel; a large distance says the pixel\'s yearly signature changed, not what changed.'];
    for (const [role, w] of [['before', wb], ['after', wa]]) { if (!w.tile.covers) caveats.push('The ' + role + ' tile does not fully cover the window.'); if (w.coverage.completeness !== 'all') caveats.push('The ' + role + ' read was partial: ' + w.coverage.reason + '.'); }
    return { ok: true, kind: 'embedding', lattice: lat, change: ch, years: { before: yb.year, after: ya.year }, evidence: evidenceOf({ kind: 'embedding', scenes: [sc('before', wb, yb.year), sc('after', wa, ya.year)], method: 'AlphaEarth Foundations 64-dimensional annual embedding per pixel, decoded (v/127.5)²·sign(v); change = cosine distance 1 − a·b between the two years', params: { k: ch.stats.k, dims: AEF_DIMS }, lattice: { bounds: lat.bounds, width: lat.width, height: lat.height, pixelM: lat.pixelM, resampling: 'nearest (the file\'s own mean-then-renormalised overview)' }, quality: { validFraction: ch.stats.validFraction }, caveats }) };
  }
  /* geo.similar の入力: 範囲の埋め込み（有効画素の平均を再正規化した 64 次元）。 */
  async function regionEmbedding(bounds, year, o) {
    const lat = latticeFor(bounds, (o && o.pixelM) || 80, 4096);
    const w = await aefWindow(lat.bounds, year, lat); if (!w.ok) return w;
    const m = meanEmbedding(w.vectors); if (!m) return fail('no-valid-pixels', { year });
    return { ok: true, embedding: m, tile: w.tile, coverage: w.coverage, lattice: lat };
  }

  /* 複数の区画（box）の埋め込みを一度に。区画が 1 つの広い窓に収まるなら窓を 1 回だけ読んで局所で切り分ける
     （区画ごとに 64 面 × 数十リクエストを繰り返さない）。収まらない（離れた候補）なら区画ごとに読む（同時 2 本）。
     戻り値は boxes と同じ順の { embedding } か { reason }。観測（2026-11-20）: 東京 2 km 区画 1 つ・80 m 画素で約 25 s。 */
  async function regionEmbeddings(boxes, year, o) {
    const px = (o && o.pixelM) || 80, cap = (o && o.maxPixels) || 160000;
    const uni = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
    const lat = latticeFor(uni, px, cap);
    const out = new Array(boxes.length);
    if (!lat.enlarged) {
      const w = await aefWindow(uni, year, lat);
      if (!w.ok) return boxes.map(() => ({ reason: w.why + (w.detail && w.detail.status ? ' ' + w.detail.status : '') }));
      const dx = (uni[2] - uni[0]) / lat.width, dy = (uni[3] - uni[1]) / lat.height;
      boxes.forEach((b, i) => {
        const rect = { x0: Math.max(0, Math.floor((b[0] - uni[0]) / dx)), x1: Math.min(lat.width, Math.ceil((b[2] - uni[0]) / dx)), y0: Math.max(0, Math.floor((uni[3] - b[3]) / dy)), y1: Math.min(lat.height, Math.ceil((uni[3] - b[1]) / dy)) };
        const m = rect.x1 > rect.x0 && rect.y1 > rect.y0 ? meanEmbeddingIn(w.vectors, lat.width, rect) : null;
        out[i] = m && m.coverage >= 0.5 ? { embedding: m, tile: w.tile.url } : { reason: m ? 'only ' + Math.round(m.coverage * 100) + '% of the region has embedding pixels' : 'no embedding pixels' };
      });
      return out;
    }
    let next = 0;
    async function lane() {
      while (next < boxes.length) {
        const i = next++, r = await regionEmbedding(boxes[i], year, { pixelM: px });
        out[i] = r.ok ? { embedding: r.embedding, tile: r.tile.url } : { reason: r.why };
      }
    }
    await Promise.all([lane(), lane()]);
    return out;
  }

  return { optical, sar, landcover, embedding, regionEmbedding, regionEmbeddings, aefLocate, periodOf, latticeFor };
}
