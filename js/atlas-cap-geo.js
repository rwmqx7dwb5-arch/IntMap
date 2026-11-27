/* ============================================================================
 *  IntMap · Atlas capabilities — the `geo.*` namespace   (js/atlas-cap-geo.js)
 * ----------------------------------------------------------------------------
 *  `geo.similar` — 「この地区／この港に似た地域」を、土地そのものの特徴ベクトルで探す。
 *  エンジンと手法の説明は js/geo-similar.js。ここは扉と引数の束縛だけ。
 *  ⚠ 能力表の書式・生成の仕組みは js/atlas-cap-data.js の冒頭と同じ（`node scripts/atlas-caps.mjs --write`）。
 * ==========================================================================*/
import { str, num, int, list, obj } from './atlas-caps.js';
import { overpassQuery } from './overpass.js';
import { FEATURES, findSimilar, overpassCounts, parseCounts, buildCountQuery } from './geo-similar.js';
import { runGeoMl } from './geo-ml-run.js';
import { farmlandCountQuery, parseFarmland } from './geo-ml.js';
import { makeAdminStats, KIND_LABEL, KIND_EN, KIND_JA } from './admin-stats.js';
import { jsonWithin } from './fetch-deadline.js';

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
      { in: 'spatial-analysis', at: 55, text: 'BEFORE-AND-AFTER CHANGE FROM SATELLITE DATA (衛星データで 2 時点の変化を測る): {"type":"geoImageChange","kind":"optical"|"sar"|"landcover"|"embedding","before":"YYYY"|"YYYY-MM-DD","after":"YYYY"|"YYYY-MM-DD","place"?:str,"lat"?:num,"lng"?:num,"sideKm"?:num,"bounds"?:[w,s,e,n],"index"?:"ndvi"|"ndwi"|"nbr"|"ndbi","polarization"?:"vv"|"vh","pixelM"?:num,"maxCloud"?:num,"k"?:num} = IntMap finds REAL images of the before and after times, reads them onto ONE grid, drops unusable pixels, and counts what changed. kind "optical" = Sentinel-2 (2015–), cloud/shadow pixels dropped per pixel (SCL), a spectral index difference (ndvi vegetation, ndwi water, nbr burn/canopy loss, ndbi built-up); dates may be a day (±15 days searched, least cloudy chosen) or a year. kind "sar" = Sentinel-1 radar (RTC, works through cloud, 2014–) from a pair of passes with the SAME orbit geometry, dB difference. kind "landcover" = Impact Observatory annual 10 m land-cover maps (2017–2023, years only): class-to-class transitions with areas (e.g. Trees → Built area). kind "embedding" = Google AlphaEarth annual satellite embeddings (2017–2025, years only): per-pixel change of the yearly signature, for any kind of change. The window defaults to 3 km around the place (sideKm; the pixel budget enlarges pixels for bigger windows and the answer says so). The answer carries the EVIDENCE (image ids, dates, cloud cover, licences, thresholds, usable-pixel share) and the raster is saved as a dataset id you can draw or analyse with "gis". Use for 「この場所の 2019 年と 2025 年の変化」「森林が減った場所」「洪水の前後」「市街地が広がったか」. NOTE: THESE ARE ESTIMATES FROM IMAGES, NOT GROUND FACTS, AND A CHANGE IS NOT A CAUSE (season, haze, tide, sun angle and classifier error also change pixels) — SAY SO. The threshold comes from the window\'s own distribution (median ± 3σ), so a window where most pixels changed or the scenes differ in season cannot be judged. Optical and SAR read tens of MB per call (10–30 s); embedding is slowest (up to about 90 s). Night-time light is NOT available (no anonymous numeric source). To see which pictures exist and when they were taken use "imageryInfo". ' },
    ],
    schema: () => ({ type: 'object', required: ['kind', 'before', 'after'], properties: { kind: str(), before: str(), after: str(), place: str(), lat: num(-90, 90), lng: num(-180, 180), sideKm: num(0.3, 30), bounds: list(num()), index: str(), polarization: str(), pixelM: num(5, 500), maxCloud: num(0, 100), k: num(1, 10), windowDays: int(1, 120), maxPixels: int(1024, 1000000) } }),
    async run(a, dctx, K) { const M = await import('./imagery-change-atlas.js'); return M.imageChangeRun(a, K); },
  },
  {
    /* column 5 'gis.dataset,map.object': with draw:true it registers the boundary layer it colours (a worker never draws). column 7 'session': it draws a layer the reader can remove; 8 'none'. Its numbers are Wikidata's population statements
       with their dates and methods (scripts/build-admin-stats.mjs) — figures, not sentences a third party wrote. */
    policy: { headless: true },   /* (worker-reach) as a worker: `draw` is ignored — the table comes back as data and the reader's map is not touched */
    row: ['geo.regionStat', 'regionStat', 'regionPopulation,adminPopulation,prefecturePopulation,countyPopulation,nutsPopulation,colourByPopulation', 'data', 'none', 'gis.dataset,map.object', 'explanation', 'session', 'none', '', ''],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'spatial-analysis', at: 54, text: 'POPULATION OF ADMINISTRATIVE UNITS, WITH ITS DATE AND METHOD (都道府県・州・郡・市区町村・NUTS の人口): {"type":"regionStat","kind"?:"iso3166-2"|"nuts"|"us-fips"|"jp-jis","country"?:str,"prefix"?:str,"level"?:"state"|"county"|"prefecture"|"municipality","year"?:int,"toleranceYears"?:int,"draw"?:bool,"top"?:int}. kind iso3166-2 (default) = first-level units worldwide, and with draw:true it COLOURS THOSE BOUNDARIES by population (「都道府県を人口で色分け」); kind nuts with draw:true AND level 1|2|3 colours the NUTS 2021 boundaries of Eurostat GISCO (joined by NUTS code, never by name; units of another NUTS version are counted as unjoined, not dropped silently); us-fips (counties) / jp-jis (municipalities) answer as a table only (no boundary file is shipped for them, and the answer says so). Every row carries the date the figure was stated for and how it was determined (census / estimate …). A year with no statement is REFUSED unless toleranceYears is given, and then the gap is named; an undated statement is never assigned a year; a unit outside its own lifespan (abolished / not yet established) is refused for that year, so a historical join is never made on the year alone. The answer says when figures of mixed methods or mixed years share one ranking.' },
    ],
    schema: () => ({ type: 'object', properties: { kind: str(), country: str(), prefix: str(), level: str(), year: int(-3000, 3000), toleranceYears: int(0, 100), draw: { type: 'boolean' }, top: int(1, 200) } }),
    async run(a, dctx, K) {
      const R = K.R, warn = K.warn, L = K.L, esc = K.esc;
      const fail = (msg, code, retry) => R(false, warn(esc(msg)), { meta: { code, category: 'input', retryable: !!retry, produced: [], userGoalSatisfied: false } });
      const dataFail = (msg, code, retry) => R(false, warn(esc(msg)), { meta: { code, category: 'data', retryable: !!retry, produced: [], userGoalSatisfied: false } });
      const AS = makeAdminStats();
      const kind = a.kind || 'iso3166-2';
      if (!KIND_LABEL[kind]) return fail(L('Unknown kind. Use one of: ', '種類が不明です。次のいずれか: ') + Object.keys(KIND_LABEL).join(', '), 'KIND_UNKNOWN');
      const admin1 = async () => (window.IntMapAtlasAdmin1 || (await import('./atlas-admin1.js')).makeAtlasAdmin1()).load();
      /* a country name → the code prefix its units carry. ISO 3166-2 and NUTS begin with the country's two letters; FIPS and JIS do not and are chosen by `prefix`. */
      let prefix = a.prefix ? String(a.prefix) : '';
      let countryName = null;
      if (a.country && !prefix) {
        let c = null; try { await K.ensureData(); c = await K.resolveCountry(a.country); } catch (_) { c = null; }
        if (!c || !c.code) return fail(L('IntMap could not tell which country "' + a.country + '" is.', '「' + a.country + '」がどの国か特定できませんでした。'), 'COUNTRY_UNKNOWN');
        countryName = c.name || a.country;
        let iso2 = String(c.code).toUpperCase();
        if (iso2.length === 3) { try { const adm = await admin1(); const u = (adm.byCountry[iso2] || [])[0]; if (u && u.iso2) iso2 = u.iso2; } catch (_) { /* the prefix stays as given and finds nothing, which is said below */ } }
        if (kind === 'iso3166-2') prefix = iso2 + '-';
        else if (kind === 'nuts') prefix = iso2 === 'GR' ? 'EL' : (iso2 === 'GB' ? 'UK' : iso2);
        else return fail(L('For this kind, choose the area with "prefix" (a state or prefecture code) rather than a country name.', 'この種類は国名でなく "prefix"（州・都道府県のコード）で範囲を選んでください。'), 'PREFIX_NEEDED');
      }
      let t;
      try { t = await AS.table({ kind, prefix, year: a.year, toleranceYears: a.toleranceYears }); } catch (e) { return dataFail(L('The statistics file could not be read.', '統計ファイルを読み込めませんでした。'), 'DATA_UNREADABLE', true); }
      if (!t.ok) return fail(L('Could not read that kind of statistics.', 'その種類の統計を読めませんでした。'), t.why);
      let rows = t.rows;
      if (a.level) {
        const lv = String(a.level).toLowerCase();
        const len = (r) => String(r.code).length;
        if (kind === 'us-fips') rows = rows.filter((r) => (lv === 'state' ? len(r) === 2 : lv === 'county' ? len(r) === 5 : true));
        else if (kind === 'nuts') { const n = { 1: 3, 2: 4, 3: 5 }[a.level]; if (n) rows = rows.filter((r) => len(r) === n); }
        else if (kind === 'jp-jis') rows = rows.filter((r) => (lv === 'prefecture' ? /^\d{2}0{3,4}\d?$/.test(r.code) : lv === 'municipality' ? !/^\d{2}0{3,4}\d?$/.test(r.code) : true));
      }
      if (!rows.length) {
        const why = a.year != null ? L('No unit states a population for ' + a.year + (a.toleranceYears ? ' (±' + a.toleranceYears + ' years)' : '') + '. Not "zero": the source has no statement. Refused: ' + JSON.stringify(t.refused), a.year + ' 年の人口を述べる単位がありません（ゼロではなく、出典に記載が無い）。拒否の内訳: ' + JSON.stringify(t.refused)) : L('No figures found for that area.', 'その範囲の数値はありません。');
        return dataFail(why, 'NO_FIGURES', false);
      }
      const top = a.top || 15;
      const mx = t.methods, mlist = Object.values(mx).map((m) => m.label + ' ×' + m.rows).join(', ');
      let drawn = null;
      /* (worker-reach) a delegated worker (source 'atlas-worker') is let in for the figures; the layer is the reader's map, which only the turn that delegated may change */
      const worker = !!dctx && dctx.source === 'atlas-worker';
      if (a.draw && !worker) {
        if (kind !== 'iso3166-2' && kind !== 'nuts') return fail(L('Only first-level units (iso3166-2) and NUTS regions have boundaries to colour; counties and municipalities answer as a table (no boundary file is shipped for them).', '境界を塗れるのは第1級行政区分（iso3166-2）と NUTS だけです。郡・市区町村は境界を同梱していないため表でのみ答えます。'), 'NO_BOUNDARIES');
        if (kind === 'nuts' && ![1, 2, 3].includes(Number(a.level))) return fail(L('To colour NUTS regions, give "level": 1, 2 or 3 (each level is a different set of regions).', 'NUTS を塗るには "level" を 1・2・3 で指定してください（レベルごとに別の地域の集合です）。'), 'LEVEL_NEEDED');
        const GU = window.GeoJSONUpload;
        let adm = null, nutsFc = null;
        if (kind === 'nuts') { try { nutsFc = await jsonWithin('https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_20M_2021_4326_LEVL_' + Number(a.level) + '.geojson', 60000); } catch (_) { nutsFc = null; } }
        else { try { adm = await admin1(); } catch (_) { adm = null; } }
        if ((kind === 'nuts' ? !nutsFc : !adm) || !GU || typeof GU.add !== 'function') return dataFail(L('The map could not take the layer (boundaries or the layer door are unavailable).', '地図にレイヤーを載せられませんでした（境界かレイヤーの入口が使えません）。'), 'MAP_UNAVAILABLE', true);
        const b = kind === 'nuts' ? await AS.nutsBoundaries(nutsFc, { prefix, year: a.year, toleranceYears: a.toleranceYears }) : await AS.boundaries(adm, { prefix, year: a.year, toleranceYears: a.toleranceYears });
        if (!b.ok || !b.matched) return dataFail(L('No boundary could be matched to a figure.', '図形と数値を結べた境界がありません。'), 'NO_MATCH', false);
        const title = (countryName || prefix || L('First-level units', '第1級行政区分')) + ' · ' + L('population', '人口') + (a.year != null ? ' ' + a.year : '');
        const put = GU.add(b.fc, title, null, {});
        if (!put) return dataFail(L('The layer was not drawn.', 'レイヤーを描けませんでした。'), 'NOT_RENDERED', false);
        const st = await GU.style(put.n, { field: 'population', mode: 'graduated', method: 'quantile', classes: 5 });
        drawn = { n: put.n, matched: b.matched, withoutFigure: b.boundariesWithoutFigure, figuresWithoutBoundary: b.figuresWithoutBoundary, classification: b.classification || null, styled: !!(st && st.ok) };
      }
      const fmt = (v) => Math.round(v).toLocaleString();
      let h = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(L(KIND_EN[kind], KIND_JA[kind]) + (countryName ? ' · ' + countryName : prefix ? ' · ' + prefix : '') + ' — ' + L('population', '人口')) + '</div>';
      h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">' + esc(rows.length + L(' units · years ', ' 単位・年 ') + (t.years ? t.years.min + '–' + t.years.max : '—') + L(' · methods: ', ' · 方式: ') + mlist) + '</div>';
      h += '<table style="width:100%;font-size:12px;border-collapse:collapse;">';
      rows.slice(0, top).forEach((r, i) => { h += '<tr style="border-top:1px solid var(--border,#3333)"><td style="padding:2px 4px;">' + (i + 1) + '</td><td style="padding:2px 4px;">' + esc(L(r.name || r.code, r.nameJa || r.name || r.code)) + ' <span style="color:var(--text-muted)">' + esc(r.code) + '</span></td><td style="padding:2px 4px;text-align:right;">' + fmt(r.value) + '</td><td style="padding:2px 4px;color:var(--text-muted)">' + esc((r.time || '') + (r.method.en ? ' · ' + r.method.en : '') + (r.gapYears ? ' · ±' + r.gapYears + 'y' : '')) + '</td></tr>'; });
      h += '</table>';
      if (t.mixedMethods) h += '<div style="font-size:11px;color:#ff9f0a;">' + esc(L('These figures use different determination methods (' + mlist + '); a census count and an estimate are different definitions.', 'これらの数値は決定方式が混在しています（' + mlist + '）。国勢調査の実数と推計は定義が異なります。')) + '</div>';
      if (t.mixedYears && a.year == null) h += '<div style="font-size:11px;color:#ff9f0a;">' + esc(L('Each unit shows its latest dated figure, so the years differ (' + t.years.min + '–' + t.years.max + '). Give "year" to compare one year.', '各単位は最新の日付つきの数値を示すため年が揃っていません（' + t.years.min + '–' + t.years.max + '）。比較するには year を指定してください。')) + '</div>';
      const refusedN = Object.values(t.refused).reduce((x, y) => x + y, 0);
      if (refusedN) h += '<div style="font-size:11px;color:var(--text-muted);">' + esc(L(refusedN + ' unit(s) in this area have no usable figure for this ask (' + Object.entries(t.refused).map(([k, v]) => k + ' ' + v).join(', ') + ') — absent from the source, not zero.', 'この範囲の ' + refusedN + ' 単位は今回の条件で使える数値がありません（' + Object.entries(t.refused).map(([k, v]) => k + ' ' + v).join(', ') + '）。出典に無いのであって、ゼロではありません。')) + '</div>';
      if (drawn) h += '<div style="font-size:11px;margin-top:4px;">' + esc(L('Drawn: ' + drawn.matched + ' boundaries coloured by population' + (drawn.withoutFigure ? ' (' + drawn.withoutFigure + ' without a figure left unpainted)' : '') + (drawn.figuresWithoutBoundary ? '; ' + drawn.figuresWithoutBoundary + ' figures have no boundary in ' + drawn.classification : '') + (drawn.styled ? '' : ' — colouring was not applied'), '描画: ' + drawn.matched + ' の境界を人口で色分け' + (drawn.withoutFigure ? '（数値の無い ' + drawn.withoutFigure + ' は塗らず）' : '') + (drawn.figuresWithoutBoundary ? '；境界の無い数値 ' + drawn.figuresWithoutBoundary + ' 件（' + drawn.classification + ' の範囲外）' : '') + (drawn.styled ? '' : '（色分けは適用されませんでした）'))) + '</div>';
      h += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + esc(L('Source: Wikidata (CC0), built ' + t.builtAt + '. Coverage is what Wikidata holds.', '出典: Wikidata（CC0）・' + t.builtAt + ' 時点。範囲は Wikidata が持つもの。')) + '</div>';
      return R(true, h, { meta: { code: 'OK', category: 'ok', retryable: false, semanticTarget: countryName || prefix || kind, produced: drawn ? ['explanation', 'map'] : ['explanation'], userGoalSatisfied: true, regionStat: { kind, rows: rows.length, years: t.years, methods: Object.keys(mx), drawn } } });
    },
  },
  {
    /* (atlas-ui-parts) A TABLE OF VALUES PER AREA -> THE REAL OUTLINES, SHADED. Everything before this either shaded WHOLE COUNTRIES from a catalogue key (map.choropleth),
       or coloured first-level units by ONE figure IntMap itself holds (geo.regionStat: population), so a table the model had read or fetched (a statistics office's
       CSV / Excel, rows from a page) ended as a table beside a map that highlighted "selected examples". This is the join and the paint, for any figure the caller states
       — which is exactly what makes it subject-free: it owns no indicator, it joins the caller's. Column 5 'gis.dataset,map.object': it registers a layer on the map. */
    row: ['geo.shadeAreas', 'shadeAreas', 'colourAreas,joinTableToAreas,areaChoropleth,shadeRegions,shadeUnits', 'map', 'paint', 'map.object', 'map,explanation', 'session', 'none', '', ''],
    ui: { none: '2026-11-26' },
    doc: [
      { in: 'spatial-analysis', at: 54.5, text: 'SHADE FIRST-LEVEL AREAS BY A TABLE YOU HOLD (自分で集めた表を行政区分の輪郭に結んで色分け): {"type":"shadeAreas","title"?:str,"rows":[{"area":str (a name or an ISO 3166-2 code),"value":num | "group":str,"country"?:str,…any other fields are kept on the shape}],"country"?:str,"unit"?:str,"source":str,"classes"?:int,"method"?:"quantile"|"equal","compare"?:str,"cuts"?:[num,…]} = the join and the paint, for ANY figure: put in the values a statistics office stated (read its CSV / Excel with fetchFile or read the page), and the REAL shipped outline of each unit (the same 4,515-unit index highlight uses) is shaded by it — "value" gives a numeric ladder with a legend (濃淡), "group" gives one colour per category (陣営・言語・類型の色分け). Units are joined by identifier or by name, never by position; "country" (or a row\'s own) settles a name two countries share, and a name that is still ambiguous or unknown is LISTED in the answer as unplaced — never guessed, never painted. "source" is required: the layer says where the numbers came from, because a shaded map reads as a fact. COMPARING SEVERAL MAPS (one era against another, before / after): a category keeps ONE colour for the whole conversation — a group that was orange stays orange on every later shadeAreas map, whatever its share. For numbers give the SAME "compare" label (any string) on each map and the later ones reuse the class boundaries of the first map and base colour, so one shade means one value on all of them; or pass "cuts" (ascending class boundaries) chosen over ALL the maps. A row whose country does not match its unit is listed as unplaced, never moved onto another country\'s unit; two rows with different values for one unit are listed as conflicting and not painted. Use it whenever the point is a PATTERN ACROSS AREAS (where it is high, where it changed, which side each belongs to) rather than one place — the table alone does not show a pattern the map would. Below first level (counties, municipalities) and whole countries are not shaded here.\n' },
    ],
    phrases: () => ['表を行政区分に結んで色分け', '都道府県を値で色分け', '州ごとの濃淡'].concat(['shade areas by my table', 'colour the states by a value', 'join a table to boundaries']),
    schema: () => ({ type: 'object', properties: { title: str(), rows: list(obj(), 1), country: str(), unit: str(), source: str(), classes: int(2, 9), method: str(), compare: str(), cuts: list(num()) }, required: ['rows', 'source'] }),
    async run(a, dctx, K) {
      const R = K.R, warn = K.warn, L = K.L, esc = K.esc;
      const fail = (msg, code) => R(false, warn(esc(msg)), { meta: { code, category: 'input', retryable: false, produced: [], userGoalSatisfied: false } });
      if (dctx && dctx.source === 'atlas-worker') return fail(L('A delegated worker cannot change the reader\'s map; hand the table back to the turn that delegated.', '委譲された作業者は地図を変えられません。表を委譲元のターンに返してください。'), 'draws_on_reader_map');
      /* No cap on the row count: every row the caller gave is joined. `received` is the denominator of every count below — what was asked, not what survived a filter. */
      const received = Array.isArray(a.rows) ? a.rows.length : 0;
      const rows = (Array.isArray(a.rows) ? a.rows : []).filter((r) => r && typeof r === 'object');
      const notObject = received - rows.length;
      if (!rows.length) return fail(L('No rows to join.', '結ぶ行がありません。'), 'NO_ROWS');
      if (!String(a.source || '').trim()) return fail(L('Say where the numbers came from ("source").', '数値の出典（"source"）を述べてください。'), 'NO_SOURCE');
      const areaOf = (r) => String(r.area != null ? r.area : (r.name != null ? r.name : (r.code != null ? r.code : ''))).trim();
      const numeric = rows.every((r) => r.value != null && r.value !== '' && Number.isFinite(Number(r.value)));
      const grouped = rows.every((r) => r.group != null && String(r.group).trim() !== '');
      if (!numeric && !grouped) return fail(L('Every row needs a numeric "value" (a shaded ladder) or every row a "group" (one colour per category) — not a mixture, and not neither.', 'すべての行に数値の "value"（濃淡）か、すべての行に "group"（カテゴリ別の色）のどちらかを付けてください。混在や欠落は描けません。'), 'ROWS_SHAPE');
      const GU = window.GeoJSONUpload;
      if (!GU || typeof GU.add !== 'function' || typeof GU.style !== 'function') return R(false, warn(esc(L('The map could not take the layer.', '地図にレイヤーを載せられませんでした。'))), { meta: { code: 'NOT_RENDERED', category: 'system', retryable: true, produced: [], userGoalSatisfied: false } });
      const hintOf = async (name) => {
        if (!name) return {};
        let c = null; try { await K.ensureData(); c = await K.resolveCountry(name); } catch (_) { c = null; }
        const code = c && c.code ? String(c.code).toUpperCase() : '';
        return code.length === 3 ? { iso3: code } : code.length === 2 ? { iso2: code, countryCode: code } : {};
      };
      const defaultHint = await hintOf(a.country);
      const asks = [];
      for (const r of rows) { const h = r.country ? await hintOf(r.country) : defaultHint; asks.push(Object.assign({ name: areaOf(r) }, h)); }
      const adm = window.IntMapAtlasAdmin1 || (await import('./atlas-admin1.js')).makeAtlasAdmin1();
      /* Each row is resolved ON ITS OWN and kept by its row index. The old shape keyed hits by the asked NAME, so a row whose country-narrowed
         search found nothing fell back to the name-only entry another row had made (`Aomori・USA` took `Aomori・Japan`'s unit), and the answer
         depended on the order of the rows. A row that states a country must land in THAT country, or it is unplaced. */
      const per = await Promise.all(asks.map((q) => (q.name ? adm.resolveMany([q], {}) : Promise.resolve({ hits: [], misses: [] }))));
      if (per.some((x) => x && x.error)) return R(false, warn(esc(L('The boundary index could not be read.', '境界の索引を読み込めませんでした。'))), { meta: { code: 'DATA_UNREADABLE', category: 'data', retryable: true, produced: [], userGoalSatisfied: false } });
      const feats = [], unplaced = [], ambiguous = [], conflicting = [], wrongCountry = [], byUnit = new Map();
      const sameCountry = (q, hit) => (q.iso3 ? String(hit.iso3 || '').toUpperCase() === q.iso3 : q.iso2 ? [hit.countryCode, hit.iso2].some((c) => String(c || '').toUpperCase() === String(q.iso2).toUpperCase()) : true);
      rows.forEach((r, i) => {
        const nm = areaOf(r); const hit = per[i].hits && per[i].hits[0];
        if (!hit) { unplaced.push(nm || '(blank)'); return; }
        const hasHint = !!(asks[i].iso3 || asks[i].iso2 || asks[i].countryCode);
        if (hasHint && !sameCountry(asks[i], hit)) { wrongCountry.push(nm + ' (' + (r.country || a.country) + ')'); return; }
        if (!hasHint && hit.ambiguousCountries && hit.ambiguousCountries.length > 1) { ambiguous.push(nm + ' (' + hit.ambiguousCountries.join('/') + ')'); return; }
        const v = numeric ? String(Number(r.value)) : String(r.group);
        const prev = byUnit.get(hit.stableId);
        if (prev) { prev.n++; if (prev.v !== v && !prev.conflict) { prev.conflict = true; conflicting.push(hit.canonicalName); } return; }   /* two rows, one unit: equal values are one fact; different values are a conflict, never "first wins" */
        const props = { name: hit.canonicalName, code: hit.stableId, asked: nm };
        Object.keys(r).forEach((k) => { if (!(k in props) && k !== 'area' && k !== 'country' && (typeof r[k] === 'string' || typeof r[k] === 'number' || typeof r[k] === 'boolean')) props[k] = r[k]; });
        if (numeric) props.value = Number(r.value); else props.group = String(r.group);
        const feat = { type: 'Feature', geometry: hit.geo, properties: props };
        byUnit.set(hit.stableId, { v, feat, conflict: false, n: 1 });
      });
      let rowsJoined = 0;   /* rows that landed on a painted unit: a duplicate of the same value counts, a row on a conflicting unit does not */
      byUnit.forEach((u) => { if (!u.conflict) { feats.push(u.feat); rowsJoined += u.n; } });
      unplaced.push(...wrongCountry.map((w) => w + ' [country mismatch]'));
      if (!feats.length) return R(false, warn(esc(L('None of the ' + received + ' rows could be joined to a first-level outline: ', '行 ' + received + ' 件のどれも第1級行政区分の輪郭に結べませんでした: ') + unplaced.concat(ambiguous, conflicting).slice(0, 12).join(', '))), { meta: { code: 'NO_MATCH', category: 'data', retryable: false, produced: [], userGoalSatisfied: false, unplaced: unplaced.slice(0, 50) } });
      const title = String(a.title || L('Shaded areas', '色分けした地域')).slice(0, 120) + (a.unit ? ' (' + String(a.unit).slice(0, 24) + ')' : '');
      const put = GU.add({ type: 'FeatureCollection', features: feats }, title, null, {});
      if (!put) return R(false, warn(esc(L('The layer was not drawn.', 'レイヤーを描けませんでした。'))), { meta: { code: 'NOT_RENDERED', category: 'system', retryable: true, produced: [], userGoalSatisfied: false } });
      const st = await GU.style(put.n, numeric ? { field: 'value', mode: 'graduated', method: a.method === 'equal' ? 'equal' : 'quantile', classes: Number(a.classes) || 5, compare: String(a.compare || '').trim() || undefined, cuts: Array.isArray(a.cuts) ? a.cuts : undefined } : { field: 'group', mode: 'categorical', compare: String(a.compare || '').trim() || 'shadeAreas' });
      if (!st || !st.ok) return R(false, warn(esc(L('The layer was added but could not be coloured (' + String(st && st.why || 'unknown') + ').', 'レイヤーは追加しましたが色を付けられませんでした（' + String(st && st.why || '不明') + '）。'))), { meta: { code: 'NOT_RENDERED', category: 'system', retryable: false, produced: [], userGoalSatisfied: false } });
      let h = '<div style="font-weight:600;margin:2px 0 4px;">' + esc(title) + '</div>';
      h += '<div style="font-size:11px;color:var(--text-muted);">' + esc(L(rowsJoined + ' of ' + received + ' rows joined to real first-level outlines' + (notObject ? ' (' + notObject + ' not a row object)' : ''), received + ' 行中 ' + rowsJoined + ' 行を第1級行政区分の輪郭に結びました' + (notObject ? '（行の形でないもの ' + notObject + ' 件）' : '')) + ' · ' + L('source: ', '出典: ') + String(a.source).slice(0, 200)) + '</div>';
      if (unplaced.length) h += '<div style="font-size:11px;color:#ff9f0a;">' + esc(L('Not placed (no such unit in the index): ', '特定できず塗っていません: ') + unplaced.slice(0, 20).join(', ')) + '</div>';
      if (ambiguous.length) h += '<div style="font-size:11px;color:#ff9f0a;">' + esc(L('Ambiguous between countries, not painted (give "country"): ', '複数の国で同名のため塗っていません（"country" を指定）: ') + ambiguous.slice(0, 20).join(', ')) + '</div>';
      if (conflicting.length) h += '<div style="font-size:11px;color:#ff9f0a;">' + esc(L('Rows gave different values for the same unit, not painted: ', '同じ行政区に異なる値の行があり塗っていません: ') + conflicting.slice(0, 20).join(', ')) + '</div>';
      return R(true, h, { meta: { code: 'OK', category: 'ok', retryable: false, produced: ['map', 'explanation'], userGoalSatisfied: rowsJoined === received, partial: rowsJoined !== received, shadeAreas: { received, processed: rows.length, rowsJoined, unjoined: received - rowsJoined, rows: rows.length, joined: feats.length, unplaced: unplaced.length, ambiguous: ambiguous.length, conflicting: conflicting.length, wrongCountry: wrongCountry.length, unplacedNames: unplaced.slice(0, 50), mode: numeric ? 'graduated' : 'categorical', layer: put.n } } });
    },
  },
  {
    /* column 5 'gis.dataset': it registers new datasets (a change raster, a class table, a prediction table). column 11 'external': OSM counts and
       facility / news text the caller passes in come from third parties. */
    row: ['geo.ml', 'geoMl', 'multiYearChange,changeTrend,classifyRegions,regionClasses,interpretChange,geoModel,spatialModel,predictWithUncertainty', 'data', 'none', 'gis.dataset', 'explanation', 'session', 'none', '', 'gisCore', 'external'],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'spatial-analysis', at: 52, text: 'GEOSPATIAL ML — MULTI-YEAR CHANGE, REGION CLASSES, CHANGE INTERPRETATION, A MODEL FROM A TARGET VARIABLE: {"type":"geoMl","op":"trend"|"classify"|"interpret"|"model", ...} = four operations over GIS datasets (複数年の変化・地域の分類・変化の解釈・目的変数からのモデル). op "trend": {"observations":[{"dataset":id,"band"?:int,"date"?:str,"endDate"?:str,"dateBasis"?:"acquired"|"composite"}],"season"?:"MM-DD","minObs"?:int,"alpha"?:num,"asOf"?:"YYYY-MM-DD","toleranceDays"?:int} = from N RASTER datasets on the SAME grid (e.g. yearly land-cover rasters, NDVI scenes, change results that carry their image dates) it quantifies per pixel WHETHER it changed, HOW (stable / gradual / abrupt), in which DIRECTION, how FAST (Theil–Sen slope per year) and WHEN (an abrupt step is dated only to the interval BETWEEN two observation dates), against a null distribution simulated for that number of observations; the result is a 7-band raster dataset (slope, p, breakFrom, breakTo, delta, pattern code, n) plus a summary (shares, break years, speeds). A dataset counts as an observation ONLY if its date is a real acquisition date — its own provenance.evidence.images[].date, or "date"+"dateBasis":"acquired" you pass because the source stated it; a file name, an upload date, a basemap tile year or a missing date is REJECTED and listed, never guessed. With "asOf" it does not analyse: it picks the dated observation to use for that Chronos date (nearest within "toleranceDays", default 30) or says there is none — NEVER present an undated image as the image of a requested date. "season" keeps one image per year near that day of year so seasons are not read as change. op "classify": {"regions":[{"name"?:str,"lat":num,"lng":num}],"place"?:str,"sideKm"?:num,"examples"?:[{"lat":num,"lng":num,"label":str}]} = classifies each square region as port / industrial / commercial / residential / agricultural / natural / mixed / unclassified from OpenStreetMap feature densities (the geo.similar features + farmland); the a-priori prototypes are tag meanings, NOT calibrated — with "examples" (≥2 per class, ≥6 in all) it learns prototypes from the user\'s own labelled regions and reports a leave-one-out accuracy against the majority baseline. A region with nothing mapped is "unclassified", never "rural". Result: a point dataset with the class. op "interpret": {"change":{"bbox":[w,s,e,n],"from":year|date,"to":year|date},"facilities"?:[{"name","lat","lng","openedAt"?,"kind"?,"source"?}],"news"?:[{"title","date","lat"?,"lng"?,"url"?}],"stats"?:[{"name","series":[{"year","value"}]}],"changeSeries"?:[{"year","value"}],"toleranceYears"?:num,"nearKm"?:num} = joins a change window to what coincides with it IN PLACE AND TIME (facilities, news, statistics with a rank correlation over ≥5 shared years), lists what FOLLOWED the change (cannot explain it) and what has no date (cannot be tied to timing); coincidence is NOT cause — SAY SO. Fetch the facilities / news / stats first (poi, news, worldRelated, data.query) and pass them in. op "model": {"target":{"dataset":id,"field":str,"timeField"?:str},"features":[{"dataset":id,"band"?:int,"name"?:str,"kind"?:"count"|"nearest"|"inside","radiiKm"?:[num],"radiusPx"?:int}],"predictAt"?:{"dataset":id},"gridCells"?:int,"coords"?:bool,"alpha"?:num,"folds"?:int,"blockKm"?:num,"bufferKm"?:num,"cutoff"?:year} = builds features at each target point (raster value and neighbourhood mean; point-layer counts within radii or the gap to the nearest one; inside a polygon layer), fits ridge and a random forest, picks by SPATIAL-BLOCK cross-validation (whole blocks held out), also reports the RANDOM-split score beside it (the gap is the spatial-autocorrelation flattery) and a TEMPORAL hold-out (fit on earlier rows, test on later ones) when the target has a time field, and writes the predictions as a point dataset with prediction / lower / upper / extrapolating columns (the interval is split-conformal from held-out-block residuals, its empirical coverage is reported; a point outside the training range or far from any training point is flagged "extrapolating", its interval is NOT validated). If the model does not beat the training mean on every held-out block, the answer says so and the predictions are not to be used. Draw a result with map.drawDataset (colour by prediction or by halfWidth). Use for "where did this change over the last years, when and how fast", "is this district industrial or residential", "what lies behind this change", "learn this target variable from geospatial data and map it with its uncertainty". NOTE: CHANGE IS NOT CAUSE, A MODEL IS NOT A FORECAST OF WHAT WILL HAPPEN — a model learnt from these points holds where the features look like the training points; say which checks passed and which could not run. For similar places use geo.similar.' },
    ],
    phrases: () => ['複数年の変化', '地域の分類', '変化の解釈', '目的変数からのモデル'].concat(['multi-year change', 'region classes', 'spatial cross-validation']),
    schema: () => ({ type: 'object', properties: { op: str(), observations: list(obj()), season: str(), minObs: int(3, 60), alpha: num(0.001, 0.5), asOf: str(), toleranceDays: int(1, 3650), title: str(), regions: list(obj()), place: str(), sideKm: num(0.2, 20), examples: list(obj()), change: obj(), facilities: list(obj()), news: list(obj()), stats: list(obj()), changeSeries: list(obj()), toleranceYears: num(0, 20), nearKm: num(0, 200), target: obj(), features: list(obj()), predictAt: obj(), gridCells: int(4, 400), coords: { type: 'boolean' }, folds: int(3, 10), blockKm: num(0.1, 5000), bufferKm: num(0, 5000), cutoff: num(1900, 2200) }, required: ['op'] }),
    async run(a, dctx, K) {
      const R = K.R, warn = K.warn, L = K.L, esc = K.esc, geocode = K.geocode;
      await window.IntMapLazy.need('gisCore');
      const D = window.IntMapData;
      if (!D) return R(false, warn(esc(L('The GIS engine could not be loaded.', 'GIS エンジンを読み込めませんでした。'))), { meta: { code: 'UNAVAILABLE', category: 'system', retryable: true, produced: [], userGoalSatisfied: false } });
      const env = { D, geocode, counts: async (bb) => parseCounts(await overpassQuery(buildCountQuery(bb), { budgetMs: 70000 })), farmland: async (bb) => parseFarmland(await overpassQuery(farmlandCountQuery(bb), { budgetMs: 70000 })) };
      const r = await runGeoMl(a, env);
      const fmt = (v) => (v == null ? '—' : Math.abs(v) >= 100 ? Math.round(v) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));
      const pc = (v) => (v == null ? '—' : Math.round(v * 100) + '%');
      if (!r.ok && !(r.mode === 'select')) {
        const msg = r.code === 'TOO_FEW_DATED_OBSERVATIONS' ? L('Only ' + r.have + ' observation(s) carry a real acquisition date (' + r.need + ' needed for a multi-year trend). Undated images were not used.', '撮影日が確かな観測が ' + r.have + ' 件しかありません（複数年の傾向には ' + r.need + ' 件要ります）。撮影日の不明な画像は使っていません。')
          : r.code === 'TOO_FEW_ROWS' ? L('Only ' + r.n + ' usable target points (' + r.need + ' needed to validate a model).', '使える目的変数の点が ' + r.n + ' 件しかありません（モデルの検証には ' + r.need + ' 件要ります）。')
            : r.code === 'TOO_FEW_BLOCKS' ? L('The points fall in only ' + r.blocks + ' spatial blocks, fewer than the ' + r.folds + ' folds: a spatial hold-out is impossible.', '点が ' + r.blocks + ' 個の空間ブロックにしか入らず、' + r.folds + ' 分割の空間検証ができません。')
              : r.code === 'NEEDS_INPUT' ? L('Missing input: ' + JSON.stringify(r.detail), '入力が足りません: ' + JSON.stringify(r.detail))
                : L('geo.ml could not complete (' + r.code + ').', 'geo.ml を完了できませんでした（' + r.code + '）。');
        return R(false, warn(esc(msg)), { meta: { code: r.code, category: r.code === 'NEEDS_INPUT' ? 'input' : 'data', retryable: false, produced: [], userGoalSatisfied: false, geoMl: { op: a.op, rejected: r.rejected || null } } });
      }
      let h = '';
      if (r.op === 'trend' && r.mode === 'select') {
        h = r.selected ? '<div>' + esc(L('For ' + r.asOf + ' use dataset ' + r.selected.dataset + ' (acquired ' + r.selected.date + ', ' + r.selected.offsetDays + ' days from the requested date).', r.asOf + ' に使えるのはデータセット ' + r.selected.dataset + '（撮影日 ' + r.selected.date + '・指定日から ' + r.selected.offsetDays + ' 日）です。')) + '</div>'
          : '<div style="color:#ff9f0a">' + esc(L('No observation with a real acquisition date is within the tolerance of ' + r.asOf + (r.nearestDays != null ? ' (nearest is ' + r.nearestDays + ' days away)' : '') + '. An undated image is not shown as that date.', r.asOf + ' の許容内に、撮影日が確かな観測がありません' + (r.nearestDays != null ? '（最も近いもので ' + r.nearestDays + ' 日離れています）' : '') + '。撮影日の不明な画像をその日の画像としては出しません。')) + '</div>';
      } else if (r.op === 'trend') {
        const sm = r.summary;
        h = '<div style="font-weight:600">' + esc(L('Multi-year change · ', '複数年の変化 · ') + r.nObservations + L(' dated observations, ', ' 件の撮影日つき観測・') + fmt(r.span[0]) + '–' + fmt(r.span[1])) + '</div>'
          + '<div>' + esc(L('stable ', '安定 ') + pc(sm.share.stable) + L(' · gradual ', ' · 漸進 ') + pc(sm.share.gradual) + L(' · abrupt ', ' · 急変 ') + pc(sm.share.abrupt) + L(' · gradual speed median ', ' · 漸進の速さ中央値 ') + fmt(sm.gradualSpeedPerYear.median) + L(' per year', ' /年') + L(' · direction up/down ', ' · 向き 増/減 ') + sm.direction.up + '/' + sm.direction.down) + '</div>'
          + (sm.abruptByYear.length ? '<div>' + esc(L('abrupt steps by year: ', '急変の年: ') + sm.abruptByYear.map((y) => y.year + ' ×' + y.count).join(', ') + L(' (each dated only to the gap between two observations)', '（どれも 2 つの観測の間までしか日付を絞れません）')) + '</div>' : '')
          + (r.rejected.length ? '<div style="color:#ff9f0a">' + esc(L(r.rejected.length + ' input(s) not used: ', r.rejected.length + ' 件は使っていません: ') + r.rejected.map((x) => x.id + ' (' + x.reason + ')').join(', ')) + '</div>' : '')
          + '<div style="color:var(--text-muted);font-size:11px">' + esc(L('Result dataset ' + r.dataset + ' (7 bands: slope, p, breakFrom, breakTo, delta, pattern code, n). Thresholds come from a null simulated for this number of observations. Change is not cause; seasons are not removed unless "season" was given.', '結果は ' + r.dataset + '（7 バンド: slope・p・breakFrom・breakTo・delta・型の符号・n）。閾値はこの観測数に合わせて simulate した帰無分布から決めています。変化は原因ではなく、"season" を指定しなければ季節は除いていません。')) + '</div>';
      } else if (r.op === 'classify') {
        h = '<div style="font-weight:600">' + esc(L('Region classes (square ' + r.sideKm + ' km)', '地域の分類（1 辺 ' + r.sideKm + ' km）')) + '</div><table style="width:100%;font-size:12px;border-collapse:collapse">'
          + r.results.map((x) => '<tr style="border-top:1px solid var(--border,#3333)"><td style="padding:3px 4px">' + esc(x.name || (x.lat.toFixed(3) + ', ' + x.lng.toFixed(3))) + '</td><td style="padding:3px 4px"><b>' + esc(x.class) + '</b>' + (x.why ? ' (' + esc(x.why) + ')' : '') + (x.supervised ? ' · ' + esc(L('from your examples: ', '正解から: ') + x.supervised.class) : '') + '</td><td style="padding:3px 4px;color:var(--text-muted)">' + esc(x.because.join(', ')) + '</td></tr>').join('') + '</table>'
          + (r.supervised ? '<div>' + esc(r.supervised.ok ? L('Leave-one-out accuracy on your ' + r.supervised.n + ' labelled regions: ' + pc(r.supervised.looAccuracy) + ' (always guessing the commonest class: ' + pc(r.supervised.majorityBaseline) + ').', 'あなたの正解 ' + r.supervised.n + ' 地域での 1 つ抜き正答率: ' + pc(r.supervised.looAccuracy) + '（最頻クラスを当て続けた場合: ' + pc(r.supervised.majorityBaseline) + '）。') : L('Could not learn from the examples (' + r.supervised.code + ').', '正解から学べませんでした（' + r.supervised.code + '）。')) + '</div>' : '<div style="color:#ff9f0a">' + esc(L('The classes come from a-priori prototypes (what the OSM tags mean), not calibrated on your region; give "examples" to learn from your own labels.', '分類は事前の原型（OSM タグの意味）によるもので、この地域では較正していません。"examples" を渡すと、あなたのラベルから学びます。')) + '</div>')
          + (r.failed ? '<div style="color:#ff9f0a">' + esc(L(r.failed + ' region(s) were not answered by the servers.', r.failed + ' 地域はサーバが応答しませんでした。')) + '</div>' : '')
          + '<div style="color:var(--text-muted);font-size:11px">' + esc(L('Result dataset ' + r.dataset + '. A class describes what OpenStreetMap shows; an empty region is "unclassified", not rural. Source: OpenStreetMap contributors (ODbL).', '結果は ' + r.dataset + '。分類は OpenStreetMap に描かれたものの記述で、何も描かれていない地域は「農村」ではなく unclassified です。出典: OpenStreetMap contributors (ODbL)。')) + '</div>';
      } else if (r.op === 'interpret') {
        const lab = (x) => ({ facility: L('facility', '施設'), news: L('news', 'ニュース'), statistic: L('statistic', '統計') }[x.type] || x.type);
        h = '<div style="font-weight:600">' + esc(L('What coincides with the change (' + fmt(r.change.from) + '–' + fmt(r.change.to) + ')', '変化と場所・時期が一致するもの（' + fmt(r.change.from) + '–' + fmt(r.change.to) + '）')) + '</div>'
          + (r.evidence.length ? r.evidence.map((x) => '<div style="font-size:12px;border-top:1px solid var(--border,#3333);padding:2px 0">' + esc(lab(x)) + ': <b>' + esc(x.name || '') + '</b> · ' + esc(x.where.rel + (x.where.km != null ? ' ' + x.where.km.toFixed(1) + ' km' : '')) + ' · ' + esc(x.when.rel) + (x.rho != null ? ' · rho ' + x.rho.toFixed(2) + ' (n=' + x.nYears + ')' : '') + (x.usable ? '' : ' · <span style="color:#ff9f0a">' + esc(L('cannot explain it', '説明には使えない')) + '</span>') + '</div>').join('') : '<div>' + esc(L('Nothing in the supplied lists is near the change.', '渡された一覧に、変化の近くのものはありません。')) + '</div>')
          + '<div style="color:var(--text-muted);font-size:11px">' + esc(L('Coincidence in place and time is not cause. Facilities without a date cannot be tied to timing; things that followed the change cannot explain it; absence from these lists is not absence.', '場所と時期の一致は原因ではありません。日付の無い施設は時期を結べず、変化の後のものは説明に使えず、一覧に無いことは存在しないことではありません。')) + '</div>';
      } else if (r.op === 'model') {
        const m = r.validation.models[r.model.kind], tmp = r.validation.temporal, iv = r.interval;
        h = '<div style="font-weight:600">' + esc(L('Model of ', '予測モデル: ') + a.target.field + ' · ' + r.model.kind + L(' · ', ' · ') + r.n + L(' points', ' 点')) + '</div>'
          + '<div>' + esc(L('Spatial-block validation: RMSE ', '空間ブロック検証: RMSE ') + fmt(m.spatial.rmse) + L(' vs ', ' ・平均 ') + fmt(m.spatial.baselineRmse) + L(' (skill ', '（改善 ') + pc(m.spatial.skill) + '), R² ' + fmt(m.spatial.r2) + ' · ' + esc(L('beats the mean in ', '平均に勝った fold: ')) + m.spatial.foldWins + '/' + m.spatial.foldCount) + '</div>'
          + '<div>' + esc(L('Random-split RMSE would have been ', 'ランダム分割なら RMSE ') + fmt(m.random.rmse) + L(' (flatters by ', '（水増し ') + pc(m.inflation) + ')') + '</div>'
          + '<div>' + (tmp.ok ? esc(L('Temporal hold-out (train < ', '時間検証（') + fmt(tmp.cutoff) + L(', test after): RMSE ', ' 未満で学習・以降で評価）: RMSE ') + fmt(tmp.models[r.model.kind].rmse) + L(' vs ', ' ・平均 ') + fmt(tmp.models[r.model.kind].baselineRmse)) : '<span style="color:#ff9f0a">' + esc(L('No temporal validation (' + tmp.code + ').', '時間検証はできていません（' + tmp.code + '）。')) + '</span>') + '</div>'
          + '<div>' + esc(L(pc(iv.level) + ' interval ±', pc(iv.level) + ' 区間 ±') + fmt(iv.halfWidth) + L(' · coverage on held-out blocks ', ' ・保留ブロックでの実測の被覆 ') + pc(iv.empiricalCoverage)) + '</div>'
          + '<div>' + esc(L('Top features: ', '効いた特徴: ') + r.importance.slice(0, 4).map((x) => x.name + ' (+' + fmt(x.rmseIncrease) + ')').join(', ')) + '</div>'
          + (r.warnings.length ? '<div style="color:#ff9f0a">' + esc(L('Warnings: ', '警告: ') + r.warnings.join('; ')) + '</div>' : '')
          + (r.droppedColumns.length || r.skippedTargets ? '<div style="color:var(--text-muted)">' + esc(L('Left out: ', '除いたもの: ') + r.skippedTargets + L(' target rows, ', ' 目的変数の行・') + r.droppedColumns.map((c) => c.name + ' (' + c.why + ')').join(', ')) + '</div>' : '')
          + '<div style="color:var(--text-muted);font-size:11px">' + esc(L('Result dataset ' + r.dataset + ': ' + r.predicted + ' predictions, ' + r.extrapolating + ' flagged extrapolating (outside the training range or far from any training point: their interval is not validated). A model holds where the features look like the training points; it is not a forecast of what will happen.', '結果は ' + r.dataset + '（予測 ' + r.predicted + ' 点・うち外挿 ' + r.extrapolating + ' 点: 学習の範囲外か学習点から遠く、区間は検証されていません）。モデルは特徴が学習点に似ている所でだけ成り立ち、将来を予言するものではありません。')) + '</div>';
      }
      return R(true, h, { meta: { code: 'OK', category: 'ok', retryable: false, produced: ['explanation'], userGoalSatisfied: true, geoMl: { op: r.op, dataset: r.dataset || null, selected: r.selected || null } } });
    },
  },
];
