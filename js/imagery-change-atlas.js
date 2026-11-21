/* ============================================================================
 *  Atlas `geo.imageChange` と `geo.similar` の埋め込み版の本体   (js/imagery-change-atlas.js)
 * ----------------------------------------------------------------------------
 *  能力表の項目は js/atlas-cap-geo.js。ここは Atlas の chunk に遅延で入り、起動時には読まれない。
 *  画像の探索・読み出し・比較は js/imagery-change-io.js と js/imagery-change.js。ここは場所の解決・回答の組み立て・
 *  結果のデータセット登録（`gis.dataset`。以後 map.drawDataset などの操作が同じ id で使える）だけを持つ。
 *  ⚠ 回答は必ず根拠（どの画像・どの手順・何画素が使えたか）と、画像から推定した値であることの制約を述べる。
 * ==========================================================================*/
import { pct, LIMITS } from './imagery-change.js';

let ioCache = null;
async function getIO() {
  if (ioCache) return ioCache;
  try { await window.IntMapLazy.need('gisCore'); } catch (_) { /* named below */ }
  const warp = window.IntMapGisWarp, crs = window.IntMapGisCrs;
  if (!warp || !crs) return null;
  const { makeGisCog } = await import('./gis-cog.js');
  const { makeImageryChange } = await import('./imagery-change-io.js');
  const cog = makeGisCog({ warp, crs });
  ioCache = makeImageryChange({ readWindow: (u, o) => cog.readWindow(u, o) });
  return ioCache;
}

/* 種類・拒否理由の文は L(英, 日) の呼び出しで持つ（隣接した対の表にしない: 言語の組が 1 か所の表に溜まると i18n の計器の視野から外れる） */
const kindLabel = (kind, L) => (kind === 'optical' ? L('optical (Sentinel-2)', '光学（Sentinel-2）') : kind === 'sar' ? L('radar (Sentinel-1)', 'レーダー（Sentinel-1）')
  : kind === 'landcover' ? L('land cover (annual)', '土地被覆（年次）') : kind === 'embedding' ? L('satellite embedding (AlphaEarth)', '衛星埋め込み（AlphaEarth）') : null);
const KINDS = ['optical', 'sar', 'landcover', 'embedding'];
const whyText = (why, L) => (why === 'no-scene' ? L('No image of that kind was found for that place and period.', 'その場所・期間に該当する画像が見つかりませんでした。')
  : why === 'no-usable-scene' ? L('Every candidate scene was unreadable or fully clouded at that place.', '候補の画像がすべて読めないか、雲に覆われていました。')
  : why === 'bad-period' ? L('Give both times as a year (YYYY) or a date (YYYY-MM-DD).', '前後の時期を年（YYYY）か日付（YYYY-MM-DD）で指定してください。')
  : why === 'year-out-of-range' ? L('The satellite embedding exists for 2017 to 2025 only.', '衛星埋め込みがあるのは 2017〜2025 年だけです。')
  : why === 'no-tile' ? L('The embedding product has no tile at that place (open ocean or ice).', 'その場所に埋め込みのタイルがありません（外洋・氷上など）。')
  : why === 'TOO_FEW_VALID' ? L('Too few pixels were usable in both images (cloud, no-data) to say anything.', '両方の画像で使える画素が少なすぎて、何も言えません。') : null);
/* 場所 → 範囲 [w,s,e,n]。bounds が無ければ place か lat/lng のまわりの正方形（sideKm、既定 3 km）。 */
async function boundsOf(a, K) {
  if (Array.isArray(a.bounds) && a.bounds.length === 4 && a.bounds.every((v) => isFinite(+v))) return { bounds: a.bounds.map(Number), name: a.place || '' };
  let ref = (a.lat != null && a.lng != null) ? { lat: +a.lat, lng: +a.lng, name: String(a.place || '') } : (a.place ? await K.geocode(a.place) : null);
  if (!ref) return null;
  const side = +a.sideKm > 0 ? +a.sideKm : 3, dLat = side / 2 / 111.32, dLng = side / 2 / (111.32 * Math.max(0.05, Math.cos(ref.lat * Math.PI / 180)));
  return { bounds: [ref.lng - dLng, ref.lat - dLat, ref.lng + dLng, ref.lat + dLat], name: ref.name || a.place || (ref.lat.toFixed(3) + ', ' + ref.lng.toFixed(3)), centre: ref };
}

function registerDataset(r, title, evidence) {
  try {
    const D = window.IntMapData; if (!D || typeof D.add !== 'function') return null;
    const lat = r.lattice, b = lat.bounds;
    const cells = r.change ? r.change.diff : r.transitions.flag;
    return D.add({
      kind: 'raster', title, sourceCrs: 'EPSG:4326', width: lat.width, height: lat.height,
      grid: { west: b[0], north: b[3], pixelLng: (b[2] - b[0]) / lat.width, pixelLat: (b[3] - b[1]) / lat.height },
      bands: [{ name: r.kind === 'landcover' ? 'class changed (1 = yes)' : 'change', unit: r.kind === 'sar' ? 'dB' : r.kind === 'embedding' ? 'cosine distance' : r.kind === 'optical' ? (r.index + ' difference') : null, nodata: null }],
      read: () => cells,
      provenance: { kind: 'image-change', at: Date.now(), evidence, stats: r.change ? r.change.stats : { usable: r.transitions.usable, changedFraction: r.transitions.changedFraction } },
    });
  } catch (_) { return null; }
}

const block = (title, body) => '<div style="margin:4px 0;"><b>' + title + '</b><br>' + body + '</div>';

export async function imageChangeRun(a, K) {
  const { R, warn, esc, L } = K;
  const fail = (msg, code, retryable) => R(false, warn(esc(msg)), { meta: { code, category: 'data', retryable: !!retryable, produced: [], userGoalSatisfied: false } });
  const kind = KINDS.indexOf(a.kind) >= 0 ? a.kind : null;
  if (!kind) return fail(L('Choose a kind: optical, sar, landcover or embedding.', '種類を選んでください: optical・sar・landcover・embedding。'), 'INVALID_INPUT');
  if (a.before == null || a.after == null) return fail(L('Give the two times to compare: "before" and "after" (a year or a date).', '比べる 2 つの時期 "before" と "after"（年か日付）を指定してください。'), 'NEEDS_INPUT');
  const w = await boundsOf(a, K);
  if (!w) return fail(L('Where? Give a place name, a latitude and longitude, or bounds.', 'どこですか？場所の名前・緯度経度・範囲のいずれかを指定してください。'), 'NEEDS_INPUT');
  const io = await getIO();
  if (!io) return fail(L('The raster engine could not be loaded.', 'ラスタ処理の部品を読み込めませんでした。'), 'UNAVAILABLE', true);
  const args = { bounds: w.bounds, before: a.before, after: a.after, index: a.index, polarization: a.polarization, pixelM: a.pixelM, maxPixels: a.maxPixels, maxCloud: a.maxCloud, k: a.k, windowDays: a.windowDays };
  let r;
  try { r = await io[kind](args); } catch (e) { r = { ok: false, why: 'threw', detail: { message: String((e && e.message) || e).slice(0, 160) } }; }
  if (!r.ok) {
    const known = whyText(r.why, L), m = known || L('The images could not be read (' + r.why + ').', '画像を読み込めませんでした（' + r.why + '）。');
    const detail = r.detail ? ' ' + JSON.stringify(r.detail).slice(0, 400) : '';
    return fail(m + detail, String(r.why), !known);
  }
  const ev = r.evidence, lat = r.lattice, nameOf = w.name || (w.bounds[1].toFixed(3) + ', ' + w.bounds[0].toFixed(3));
  const lang = L('en', 'jp'), km2 = (v) => (v == null ? '' : (v >= 10 ? v.toFixed(1) : v.toFixed(2)) + ' km²');
  let h = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(L('Change at ', '変化: ') + nameOf + ' · ' + kindLabel(kind, L)) + '</div>';
  if (r.change) {
    const s = r.change.stats;
    if (kind === 'embedding') {
      h += block(esc(L('Result', '結果')), esc(L(pct(s.changedFraction) + ' of the ' + s.valid + ' valid pixels (' + km2(s.increaseKm2) + ') changed their yearly signature between ' + r.years.before + ' and ' + r.years.after + '. Distance median ' + s.median.toFixed(3) + ', threshold ' + s.thresholdHigh.toFixed(3) + '.', '有効な ' + s.valid + ' 画素のうち ' + pct(s.changedFraction) + '（' + km2(s.increaseKm2) + '）が、' + r.years.before + ' 年と ' + r.years.after + ' 年で年間の特徴を変えました。距離の中央値 ' + s.median.toFixed(3) + '・閾値 ' + s.thresholdHigh.toFixed(3) + '。')));
    } else {
      const unit = kind === 'sar' ? ' dB' : '';
      h += block(esc(L('Result', '結果')), esc(L(pct(s.changedFraction) + ' of ' + s.valid + ' valid pixels changed: ' + pct(s.increaseFraction) + ' increased (' + km2(s.increaseKm2) + '), ' + pct(s.decreaseFraction) + ' decreased (' + km2(s.decreaseKm2) + '). Typical shift (median) ' + s.median.toFixed(3) + unit + '; flagged beyond ' + s.thresholdLow.toFixed(3) + ' / ' + s.thresholdHigh.toFixed(3) + unit + ' (median ± ' + s.k + 'σ).', '有効 ' + s.valid + ' 画素のうち ' + pct(s.changedFraction) + ' が変化: 増加 ' + pct(s.increaseFraction) + '（' + km2(s.increaseKm2) + '）・減少 ' + pct(s.decreaseFraction) + '（' + km2(s.decreaseKm2) + '）。全体のずれ（中央値）' + s.median.toFixed(3) + unit + '・' + s.thresholdLow.toFixed(3) + ' / ' + s.thresholdHigh.toFixed(3) + unit + '（中央値 ± ' + s.k + 'σ）を超えた画素を変化とした。')));
      if (s.changedFraction > 0.4) h += '<div style="font-size:11px;color:#ff9f0a;">' + esc(L('More than 40% of pixels were flagged: this looks like a different imaging condition (season, sun, haze) or a window-wide change; the threshold cannot tell the two apart.', '40% を超える画素が変化とされました。撮影条件の違い（季節・太陽・もや）か範囲全体の変化で、この閾値では区別できません。')) + '</div>';
    }
  } else {
    const t = r.transitions, top = t.transitions.slice(0, 5).map((x) => x.fromName + ' → ' + x.toName + ' ' + x.count + ' px' + (x.km2 != null ? ' (' + km2(x.km2) + ')' : '')).join('; ');
    h += block(esc(L('Result', '結果')), esc(L(pct(t.changedFraction) + ' of ' + t.usable + ' classified pixels changed class between ' + r.years.before + ' and ' + r.years.after + (top ? '. Largest transitions: ' + top : '') + '.', t.usable + ' 画素のうち ' + pct(t.changedFraction) + ' が ' + r.years.before + ' 年と ' + r.years.after + ' 年で分類を変えました' + (top ? '。大きい遷移: ' + top : '') + '。')));
  }
  h += block(esc(L('Evidence', '根拠')), ev.scenes.map((s) => esc(s.role + ': ' + s.id + ' · ' + (s.datetime || '').slice(0, 10) + (s.cloudCover != null ? ' · cloud ' + Math.round(s.cloudCover) + '%' : '') + ' · ' + (s.license || '') + (s.attribution ? ' · ' + s.attribution : ''))).join('<br>')
    + '<br>' + esc(L('Method: ', '手順: ') + ev.method) + '<br>' + esc(L('Grid: ', '格子: ') + lat.width + '×' + lat.height + ' px at about ' + lat.pixelM + ' m' + (lat.enlarged ? L(' (enlarged from ' + lat.requestedPixelM + ' m to stay within the pixel budget)', '（画素数の上限のため ' + lat.requestedPixelM + ' m から拡大）') : '') + ', nearest-neighbour resampling'));
  const cav = ev.caveats.concat(LIMITS[lang === 'jp' ? 'jp' : 'en']);
  h += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + cav.map(esc).join('<br>') + '</div>';
  const title = (lang === 'jp' ? '画像変化 ' : 'Image change ') + kindLabel(kind, L) + ' ' + nameOf;
  const ds = registerDataset(r, title, ev);
  if (ds) h += '<div style="font-size:11px;margin-top:4px;">' + esc(L('Saved as a raster dataset — id ', 'ラスタのデータセットとして保存しました — id ')) + '<code>' + esc(ds.id) + '</code></div>';
  return R(true, h, { meta: { code: 'OK', category: 'ok', retryable: false, semanticTarget: nameOf, produced: ds ? ['explanation', 'gis.dataset'] : ['explanation'], userGoalSatisfied: true, imageChange: { kind, basis: ev.basis, scenes: ev.scenes.map((s) => ({ role: s.role, id: s.id, datetime: s.datetime })), stats: r.change ? r.change.stats : { usable: r.transitions.usable, changedFraction: r.transitions.changedFraction }, dataset: ds ? ds.id : null } } });
}

/* geo.similar の signal:'embedding'。入力の区画の取り方は OSM 版と同じ（planCells）。 */
export async function similarEmbeddingRun(a, ref, within, cands, K) {
  const { R, warn, esc, L } = K;
  const { findSimilarEmbedding } = await import('./geo-similar.js');
  const io = await getIO();
  const bad = (msg, code, retryable) => R(false, warn(esc(msg)), { meta: { code, category: 'data', retryable: !!retryable, produced: [], userGoalSatisfied: false } });
  if (!io) return bad(L('The raster engine could not be loaded.', 'ラスタ処理の部品を読み込めませんでした。'), 'UNAVAILABLE', true);
  const year = Number.isInteger(+a.year) && +a.year > 0 ? +a.year : 2024;
  const r = await findSimilarEmbedding({ query: { lat: ref.lat, lng: ref.lng, name: ref.name || a.place, sideKm: a.sideKm }, within, candidates: cands, cellKm: a.cellKm, maxCells: a.maxCells, k: a.k }, (boxes) => io.regionEmbeddings(boxes, year, {}));
  const nameOf = ref.name || a.place || (ref.lat.toFixed(3) + ', ' + ref.lng.toFixed(3));
  if (!r.ok) {
    const why = r.code === 'QUERY_UNREAD' ? L('The satellite embedding could not be read for the reference region (' + ((r.failed && r.failed[0] && r.failed[0].reason) || 'no answer') + '), so nothing can be said (this is not "no similar region").', '基準の地域の衛星埋め込みを読めず（' + ((r.failed && r.failed[0] && r.failed[0].reason) || '応答なし') + '）、何も言えません（「似た地域が無い」ではありません）。')
      : L('Fewer than 3 candidate regions could be read (' + ((r.coverage && r.coverage.measured) || 0) + ' of ' + ((r.coverage && r.coverage.requested) || 0) + '), too few to compare against.', '読めた候補地域が 3 つ未満（' + ((r.coverage && r.coverage.measured) || 0) + '／' + ((r.coverage && r.coverage.requested) || 0) + '）で、比べられません。');
    return bad(why, r.code, r.code !== 'POOL_TOO_SMALL');
  }
  const cv = r.coverage;
  let h = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(L('Regions that resemble ', '似た地域: ') + nameOf + L(' (satellite embedding, ' + year + ')', '（衛星埋め込み・' + year + ' 年）')) + '</div>';
  h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">' + esc(L('Square of ' + cv.sideKm.toFixed(1) + ' km per region · ' + cv.measured + ' of ' + cv.total + ' candidates read' + (cv.truncated ? ' (the rest were not scanned)' : '') + (r.failed.length ? ' · ' + r.failed.length + ' not readable' : ''), '1 地域 = 1 辺 ' + cv.sideKm.toFixed(1) + ' km の正方形・候補 ' + cv.total + ' のうち ' + cv.measured + ' を読み取り' + (cv.truncated ? '（残りは走査していません）' : '') + (r.failed.length ? '・' + r.failed.length + ' 件は読めず' : ''))) + '</div>';
  h += '<table style="width:100%;font-size:12px;border-collapse:collapse;">';
  r.results.forEach((x, i) => { h += '<tr style="border-top:1px solid var(--border,#3333);"><td style="padding:3px 4px;">' + (i + 1) + '</td><td style="padding:3px 4px;">' + (x.cell.name ? esc(x.cell.name) + ' ' : '') + '<span style="color:var(--text-muted)">' + x.cell.lat.toFixed(3) + ', ' + x.cell.lng.toFixed(3) + '</span></td><td style="padding:3px 4px;white-space:nowrap">' + x.score.toFixed(3) + '</td><td style="padding:3px 4px;color:var(--text-muted)">' + esc(L('valid pixels ', '有効画素 ') + Math.round(x.validCoverage * 100) + '%') + '</td></tr>'; });
  h += '</table>';
  h += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + esc(L('Score = cosine similarity of the mean 64-dimensional AlphaEarth embedding of each square (candidates: median ' + r.poolMedian.toFixed(3) + ', min ' + r.poolMin.toFixed(3) + ', max ' + r.poolMax.toFixed(3) + '; read a score against that spread). The dimensions are not human-readable quantities, so unlike the OpenStreetMap version this cannot say WHICH features are alike. Similarity describes the satellite signature, not a shared role, history or risk. Data: AlphaEarth Foundations Satellite Embedding, produced by Google and Google DeepMind (CC BY 4.0).', 'スコア = 各正方形の 64 次元 AlphaEarth 埋め込みの平均どうしの cosine 類似度（候補の中央値 ' + r.poolMedian.toFixed(3) + '・最小 ' + r.poolMin.toFixed(3) + '・最大 ' + r.poolMax.toFixed(3) + '。この広がりに照らして読んでください）。次元は人が読める量ではないため、OpenStreetMap 版と違い「何が似ているか」は言えません。類似は衛星から見た特徴の記述で、同じ役割・歴史・リスクの証明ではありません。出典: AlphaEarth Foundations Satellite Embedding（Google と Google DeepMind 作成・CC BY 4.0）。')) + '</div>';
  return R(true, h, { meta: { code: 'OK', category: 'ok', retryable: false, semanticTarget: nameOf, produced: ['explanation'], userGoalSatisfied: true, geoSimilar: { signal: 'embedding', year, coverage: cv, failed: r.failed.length, top: r.results.slice(0, 5).map((x) => ({ lat: x.cell.lat, lng: x.cell.lng, name: x.cell.name || null, score: +x.score.toFixed(3) })) } } });
}
