/* ============================================================================
 *  IntMap · Atlas capabilities — the `geo.*` namespace   (js/atlas-cap-geo.js)
 * ----------------------------------------------------------------------------
 *  `geo.similar` — 「この地区／この港に似た地域」を、土地そのものの特徴ベクトルで探す。
 *  エンジンと手法の説明は js/geo-similar.js。ここは扉と引数の束縛だけ。
 *  ⚠ 能力表の書式・生成の仕組みは js/atlas-cap-data.js の冒頭と同じ（`node scripts/atlas-caps.mjs --write`）。
 * ==========================================================================*/
import { str, num, int, list, obj } from './atlas-caps.js';
import { overpassQuery } from './overpass.js';
import { FEATURES, findSimilar, overpassCounts } from './geo-similar.js';

/* 特徴の和名。language-keyed な object ではなく 特徴 id → 和名 の表（英名は FEATURES.label）。表示のたびに L(英名, 和名) で解く */
const FEATURE_JP = {"buildings":"建物","residential":"住居系の建物","commercial":"商業・事務所系の建物","industrial":"工場・倉庫の建物","roads_major":"幹線道路","roads_local":"生活道路・サービス道路","paths":"歩道・小径","rail":"鉄道・地下鉄・路面電車","stations":"駅・停留所","food":"飲食店","shops":"店舗","offices":"事務所","education":"学校・大学","health":"医療施設","tourism":"観光・宿泊","green":"公園・運動場","water":"水面・海岸線","port":"桟橋・岸壁・ドック","port_land":"港湾・埠頭の用地","cranes":"クレーン・コンテナヤード"};
const pct = (v) => (v >= 0 ? '+' : '') + Math.round(v * 100) + '%';
const dens = (v) => (v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2));

export default [
  {
    /* column 7 'read', 8 'none': it asks OpenStreetMap's public servers (counts only) and changes no setting. column 11 'external':
       the answer carries OSM-derived numbers, not sentences a third party wrote — but the place names it prints come from a geocoder. */
    row: ['geo.similar', 'geoSimilar', 'similarRegions,findSimilarAreas,similarPlaces,regionEmbedding', 'data', 'none', '', 'explanation', 'read', 'none', 'place?', '', 'external'],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'spatial-analysis', at: 49, text: 'FIND REGIONS THAT RESEMBLE ONE (地域そのものの特徴で「似た地域」を探す): {"type":"geoSimilar","place"?:str,"lat"?:num,"lng"?:num,"sideKm"?:num,"within"?:str,"bounds"?:[w,s,e,n],"candidates"?:[{"name"?:str,"lat":num,"lng":num}],"candidatePlaces"?:[str],"cellKm"?:num,"maxCells"?:int,"k"?:int,"signal"?:"osm"|"embedding","year"?:int} = IntMap measures a square around the reference (a district, a port: "place" or lat/lng, side "sideKm", default = cellKm) as a FEATURE VECTOR — how densely OpenStreetMap shows buildings (residential / commercial / industrial), roads by class, rail and stations, food, shops, offices, schools, health, tourism, parks, water, piers and port land, cranes — does the same for CANDIDATE regions, standardises every feature inside that set, and ranks the candidates by cosine similarity, each with WHAT MADE IT SIMILAR (the features that contributed most, with both densities) and WHAT DIFFERS. Candidates are either a GRID scanned over "within" (a place name) or "bounds" (default: a square around the reference), "cellKm" per cell, nearest the centre first, at most "maxCells" cells — the answer says how many were scanned of how many existed — or POINTS you name: "candidates" or "candidatePlaces" (e.g. other ports from a "poi" result) each measured over a square of the same size as the reference. Use for 「深圳の南山区の科学園に似た地区は」「この港に機能的に似た港は」「ここと同じような街区を探して」, "find neighbourhoods like this one", "which ports are functionally similar to Rotterdam". NOTE: SIMILARITY IS A DESCRIPTION OF WHAT IS MAPPED, NOT A CAUSE: two regions with the same composition need not share an economic role, history or risk — SAY SO in the answer — and OpenStreetMap is drawn more densely in some countries than others, so a region that looks empty may be unmapped; the result states coverage (cells scanned / failed) and any feature that could not tell the set apart. A cell the servers did not answer is listed as failed, never counted as dissimilar. DEFAULT signal "osm" does NOT use satellite imagery, so it cannot see land cover, vegetation or building height. signal "embedding" compares the regions by the Google AlphaEarth satellite embedding (64 numbers per 10 m pixel, a year of radar and optical observations; "year" 2017–2025, default 2024; CC BY 4.0): it sees land cover, vegetation and texture that OpenStreetMap lacks and works where OSM is thin, but its dimensions are not readable quantities so it cannot say WHICH features are alike, and it is slower (tens of seconds). For a country-level comparison use "relate"/"rank"; for what stands near a known object use "worldRelated"; for GIS operations on datasets use "gis". ' },
    ],
    schema: () => ({ type: 'object', properties: { place: str(), lat: num(-90, 90), lng: num(-180, 180), sideKm: num(0.2, 20), within: str(), bounds: list(num()), candidates: list(obj()), candidatePlaces: list(str()), cellKm: num(0.5, 20), maxCells: int(4, 200), k: int(1, 30), signal: str(), year: int(2017, 2025) } }),
    async run(a, dctx, K) {
      const R = K.R, warn = K.warn, L = K.L, esc = K.esc, geocode = K.geocode, GE = K.GE, note = K.note;
      const fail = (msg, code) => R(false, warn(esc(msg)), { meta: { code, category: 'input', retryable: false, produced: [], userGoalSatisfied: false } });
      let ref = (a.lat != null && a.lng != null) ? { lat: +a.lat, lng: +a.lng, name: String(a.place || '') } : (a.place ? await geocode(a.place) : null);
      if (!ref) return fail(L('Similar to what? Give a place name or a latitude and longitude for the reference region.', '何に似た地域ですか？基準となる場所の名前か緯度経度を指定してください。'), 'NEEDS_INPUT');
      let within = null;
      if (Array.isArray(a.bounds) && a.bounds.length === 4 && a.bounds.every((v) => isFinite(+v))) within = a.bounds.map(Number);
      else if (a.within) { let e = null; try { e = await K._nomExtent(a.within); } catch (_) { /* named below */ } if (e && e.box && K._bboxOK(e.box)) within = e.box.map(Number); else return fail(L('IntMap could not find the extent of «' + a.within + '».', '「' + a.within + '」の範囲を特定できませんでした。'), 'INVALID_INPUT'); }
      let cands = Array.isArray(a.candidates) ? a.candidates.filter((c) => c && isFinite(+c.lat) && isFinite(+c.lng)).map((c) => ({ name: c.name ? String(c.name) : null, lat: +c.lat, lng: +c.lng })) : [];
      if (Array.isArray(a.candidatePlaces)) for (const nm of a.candidatePlaces.slice(0, 60)) { let g = null; try { g = await geocode(nm); } catch (_) { /* a name that did not resolve is left out and said below */ } if (g) cands.push({ name: String(nm), lat: g.lat, lng: g.lng }); }
      const unresolved = Array.isArray(a.candidatePlaces) ? a.candidatePlaces.length - (cands.length - (Array.isArray(a.candidates) ? a.candidates.length : 0)) : 0;
      try { GE().camera.flyTo({ center: [ref.lng, ref.lat], zoom: Math.max(GE().camera.getZoom(), 11) }); } catch (_) { /* the answer does not depend on the camera */ }
      if (a.signal === 'embedding') { const M = await import('./imagery-change-atlas.js'); return M.similarEmbeddingRun(a, ref, within, cands, K); }
      if (a.signal != null && a.signal !== 'osm') return fail(L('signal is "osm" or "embedding".', 'signal は osm か embedding です。'), 'INVALID_INPUT');
      const r = await findSimilar({ query: { lat: ref.lat, lng: ref.lng, name: ref.name || a.place, sideKm: a.sideKm }, within, candidates: cands, cellKm: a.cellKm, maxCells: a.maxCells, k: a.k }, overpassCounts(overpassQuery));
      const nameOf = ref.name || a.place || (ref.lat.toFixed(3) + ', ' + ref.lng.toFixed(3));
      if (!r.ok) {
        const why = r.code === 'QUERY_UNREAD' ? L('OpenStreetMap\'s servers did not answer for the reference region, so nothing can be said (this is not "no similar region").', '基準の地域について OpenStreetMap のサーバが応答せず、何も言えません（「似た地域が無い」ではありません）。')
          : r.code === 'POOL_TOO_SMALL' ? L('Fewer than 3 candidate regions could be measured (' + ((r.coverage && r.coverage.measured) || 0) + ' of ' + ((r.coverage && r.coverage.requested) || 0) + '), too few to compare against.', '測れた候補地域が 3 つ未満（' + ((r.coverage && r.coverage.measured) || 0) + '／' + ((r.coverage && r.coverage.requested) || 0) + '）で、比べられません。')
            : L('The reference region has no feature that distinguishes it inside this set.', 'この集合の中で基準の地域を区別できる特徴がありません。');
        return R(false, warn(esc(why)), { meta: { code: r.code, category: 'data', retryable: r.code !== 'POOL_TOO_SMALL', produced: [], userGoalSatisfied: false } });
      }
      const cv = r.coverage, lbl = (f) => esc(L(f.label, FEATURE_JP[f.id] || f.label));
      let h = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(L('Regions that resemble ', '似た地域: ') + nameOf) + '</div>';
      h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">' + esc(L('Square of ' + cv.sideKm.toFixed(1) + ' km per region · ' + cv.measured + ' of ' + cv.total + ' candidate regions measured' + (cv.truncated ? ' (the rest were not scanned: raise maxCells or narrow the area)' : '') + ((r.failed.length + (r.notAsked || 0)) ? ' · ' + (r.failed.length + (r.notAsked || 0)) + ' not answered' : '') + ' · features: ' + (FEATURES.length - r.droppedFeatures.length) + ' of ' + FEATURES.length, '1 地域 = 1 辺 ' + cv.sideKm.toFixed(1) + ' km の正方形・候補 ' + cv.total + ' のうち ' + cv.measured + ' を測定' + (cv.truncated ? '（残りは走査していません。maxCells を上げるか範囲を絞ってください）' : '') + ((r.failed.length + (r.notAsked || 0)) ? '・' + (r.failed.length + (r.notAsked || 0)) + ' 件は応答なし' : '') + '・特徴 ' + (FEATURES.length - r.droppedFeatures.length) + '／' + FEATURES.length)) + '</div>';
      if (r.emptyBuilt) h += '<div style="font-size:11px;color:#ff9f0a;">' + esc(L('The reference region has almost nothing mapped in OpenStreetMap, so this ranking reflects that.', '基準の地域は OpenStreetMap にほとんど描かれておらず、この並びはその状態を反映しています。')) + '</div>';
      h += '<table style="width:100%;font-size:12px;border-collapse:collapse;">';
      r.results.forEach((x, i) => {
        const where = x.cell.name ? esc(x.cell.name) + ' ' : '';
        h += '<tr style="border-top:1px solid var(--border,#3333);vertical-align:top"><td style="padding:3px 4px;">' + (i + 1) + '</td><td style="padding:3px 4px;">' + where + '<span style="color:var(--text-muted)">' + x.cell.lat.toFixed(3) + ', ' + x.cell.lng.toFixed(3) + '</span></td><td style="padding:3px 4px;white-space:nowrap">' + x.score.toFixed(2) + '</td><td style="padding:3px 4px;">'
          + esc(L('alike in: ', '似ている点: ')) + (x.because.map((b) => lbl(b) + ' (' + dens(b.queryPerKm2) + ' / ' + dens(b.candidatePerKm2) + ' per km²)').join('; ') || '—')
          + (x.differs.length ? '<br><span style="color:var(--text-muted)">' + esc(L('differs in: ', '違う点: ')) + x.differs.map((b) => lbl(b) + ' (' + dens(b.queryPerKm2) + ' / ' + dens(b.candidatePerKm2) + ')').join('; ') + '</span>' : '') + '</td></tr>';
      });
      h += '</table>';
      if (unresolved > 0) h += '<div style="font-size:11px;color:#ff9f0a;">' + esc(L(unresolved + ' named candidate place(s) could not be located and were left out.', '位置を特定できなかった候補が ' + unresolved + ' 件あり、除外しました。')) + '</div>';
      h += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + esc(L('Score = cosine similarity (−1 to 1) of density features standardised within this set; each figure pair is reference / candidate per km². This describes what OpenStreetMap shows, not causes: similar composition does not prove a shared economic role, history or risk, and OSM is mapped unevenly across the world. Source: OpenStreetMap contributors (ODbL).', 'スコア = この集合の中で標準化した密度特徴の cosine 類似度（−1〜1）。数値の組は 基準／候補 の 1 km² あたり。これは OpenStreetMap に描かれたものの記述であって因果ではありません。構成が似ていても、同じ経済的役割・歴史・リスクを持つ証明にはならず、OSM の入力の濃さは地域で違います。出典: OpenStreetMap contributors (ODbL)。')) + '</div>';
      return R(true, h, { meta: { code: 'OK', category: 'ok', retryable: false, semanticTarget: nameOf, produced: ['explanation'], userGoalSatisfied: true, geoSimilar: { coverage: cv, failed: r.failed.length, droppedFeatures: r.droppedFeatures, top: r.results.slice(0, 5).map((x) => ({ lat: x.cell.lat, lng: x.cell.lng, name: x.cell.name || null, score: +x.score.toFixed(3) })) } } });
    },
  },
  {
    /* column 7 'read', 8 'none': it reads public image archives (Earth Search, Planetary Computer, Source Cooperative) and changes no setting; its raster is registered as a dataset. */
    row: ['geo.imageChange', 'geoImageChange', 'imageChange,changeDetection,satelliteChange,landCoverChange,embeddingChange,radarChange,beforeAfter', 'data', 'none', 'gis.dataset', 'explanation', 'read', 'none', 'place?', '', 'external'],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'spatial-analysis', at: 50, text: 'BEFORE-AND-AFTER CHANGE FROM SATELLITE DATA (衛星データで 2 時点の変化を測る): {"type":"geoImageChange","kind":"optical"|"sar"|"landcover"|"embedding","before":"YYYY"|"YYYY-MM-DD","after":"YYYY"|"YYYY-MM-DD","place"?:str,"lat"?:num,"lng"?:num,"sideKm"?:num,"bounds"?:[w,s,e,n],"index"?:"ndvi"|"ndwi"|"nbr"|"ndbi","polarization"?:"vv"|"vh","pixelM"?:num,"maxCloud"?:num,"k"?:num} = IntMap finds REAL images of the before and after times, reads them onto ONE grid, drops unusable pixels, and counts what changed. kind "optical" = Sentinel-2 (2015–), cloud/shadow pixels dropped per pixel (SCL), a spectral index difference (ndvi vegetation, ndwi water, nbr burn/canopy loss, ndbi built-up); dates may be a day (±15 days searched, least cloudy chosen) or a year. kind "sar" = Sentinel-1 radar (RTC, works through cloud, 2014–) from a pair of passes with the SAME orbit geometry, dB difference. kind "landcover" = Impact Observatory annual 10 m land-cover maps (2017–2023, years only): class-to-class transitions with areas (e.g. Trees → Built area). kind "embedding" = Google AlphaEarth annual satellite embeddings (2017–2025, years only): per-pixel change of the yearly signature, for any kind of change. The window defaults to 3 km around the place (sideKm; the pixel budget enlarges pixels for bigger windows and the answer says so). The answer carries the EVIDENCE (image ids, dates, cloud cover, licences, thresholds, usable-pixel share) and the raster is saved as a dataset id you can draw or analyse with "gis". Use for 「この場所の 2019 年と 2025 年の変化」「森林が減った場所」「洪水の前後」「市街地が広がったか」. NOTE: THESE ARE ESTIMATES FROM IMAGES, NOT GROUND FACTS, AND A CHANGE IS NOT A CAUSE (season, haze, tide, sun angle and classifier error also change pixels) — SAY SO. The threshold comes from the window\'s own distribution (median ± 3σ), so a window where most pixels changed or the scenes differ in season cannot be judged. Optical and SAR read tens of MB per call (10–30 s); embedding is slowest (up to about 90 s). Night-time light is NOT available (no anonymous numeric source). To see which pictures exist and when they were taken use "imageryInfo". ' },
    ],
    schema: () => ({ type: 'object', required: ['kind', 'before', 'after'], properties: { kind: str(), before: str(), after: str(), place: str(), lat: num(-90, 90), lng: num(-180, 180), sideKm: num(0.3, 30), bounds: list(num()), index: str(), polarization: str(), pixelM: num(5, 500), maxCloud: num(0, 100), k: num(1, 10), windowDays: int(1, 120), maxPixels: int(1024, 1000000) } }),
    async run(a, dctx, K) { const M = await import('./imagery-change-atlas.js'); return M.imageChangeRun(a, K); },
  },
];
