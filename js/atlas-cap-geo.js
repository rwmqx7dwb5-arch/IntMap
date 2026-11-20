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
import { makeAdminStats, KIND_LABEL, KIND_EN, KIND_JA } from './admin-stats.js';

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
      { in: 'spatial-analysis', at: 49, text: 'FIND REGIONS THAT RESEMBLE ONE (地域そのものの特徴で「似た地域」を探す): {"type":"geoSimilar","place"?:str,"lat"?:num,"lng"?:num,"sideKm"?:num,"within"?:str,"bounds"?:[w,s,e,n],"candidates"?:[{"name"?:str,"lat":num,"lng":num}],"candidatePlaces"?:[str],"cellKm"?:num,"maxCells"?:int,"k"?:int} = IntMap measures a square around the reference (a district, a port: "place" or lat/lng, side "sideKm", default = cellKm) as a FEATURE VECTOR — how densely OpenStreetMap shows buildings (residential / commercial / industrial), roads by class, rail and stations, food, shops, offices, schools, health, tourism, parks, water, piers and port land, cranes — does the same for CANDIDATE regions, standardises every feature inside that set, and ranks the candidates by cosine similarity, each with WHAT MADE IT SIMILAR (the features that contributed most, with both densities) and WHAT DIFFERS. Candidates are either a GRID scanned over "within" (a place name) or "bounds" (default: a square around the reference), "cellKm" per cell, nearest the centre first, at most "maxCells" cells — the answer says how many were scanned of how many existed — or POINTS you name: "candidates" or "candidatePlaces" (e.g. other ports from a "poi" result) each measured over a square of the same size as the reference. Use for 「深圳の南山区の科学園に似た地区は」「この港に機能的に似た港は」「ここと同じような街区を探して」, "find neighbourhoods like this one", "which ports are functionally similar to Rotterdam". NOTE: SIMILARITY IS A DESCRIPTION OF WHAT IS MAPPED, NOT A CAUSE: two regions with the same composition need not share an economic role, history or risk — SAY SO in the answer — and OpenStreetMap is drawn more densely in some countries than others, so a region that looks empty may be unmapped; the result states coverage (cells scanned / failed) and any feature that could not tell the set apart. A cell the servers did not answer is listed as failed, never counted as dissimilar. It does NOT use satellite imagery, so it cannot see land cover, vegetation or building height. For a country-level comparison use "relate"/"rank"; for what stands near a known object use "worldRelated"; for GIS operations on datasets use "gis". ' },
    ],
    schema: () => ({ type: 'object', properties: { place: str(), lat: num(-90, 90), lng: num(-180, 180), sideKm: num(0.2, 20), within: str(), bounds: list(num()), candidates: list(obj()), candidatePlaces: list(str()), cellKm: num(0.5, 20), maxCells: int(4, 200), k: int(1, 30) } }),
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
    /* column 7 'session': it draws a layer the reader can remove; 8 'none'. Its numbers are Wikidata's population statements
       with their dates and methods (scripts/build-admin-stats.mjs) — figures, not sentences a third party wrote. */
    row: ['geo.regionStat', 'regionStat', 'regionPopulation,adminPopulation,prefecturePopulation,countyPopulation,nutsPopulation,colourByPopulation', 'data', 'none', '', 'explanation', 'session', 'none', '', ''],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'spatial-analysis', at: 50, text: 'POPULATION OF ADMINISTRATIVE UNITS, WITH ITS DATE AND METHOD (都道府県・州・郡・市区町村・NUTS の人口): {"type":"regionStat","kind"?:"iso3166-2"|"nuts"|"us-fips"|"jp-jis","country"?:str,"prefix"?:str,"level"?:"state"|"county"|"prefecture"|"municipality","year"?:int,"toleranceYears"?:int,"draw"?:bool,"top"?:int}. kind iso3166-2 (default) = first-level units worldwide, and with draw:true it COLOURS THOSE BOUNDARIES by population (「都道府県を人口で色分け」); kind nuts with draw:true AND level 1|2|3 colours the NUTS 2021 boundaries of Eurostat GISCO (joined by NUTS code, never by name; units of another NUTS version are counted as unjoined, not dropped silently); us-fips (counties) / jp-jis (municipalities) answer as a table only (no boundary file is shipped for them, and the answer says so). Every row carries the date the figure was stated for and how it was determined (census / estimate …). A year with no statement is REFUSED unless toleranceYears is given, and then the gap is named; an undated statement is never assigned a year; a unit outside its own lifespan (abolished / not yet established) is refused for that year, so a historical join is never made on the year alone. The answer says when figures of mixed methods or mixed years share one ranking.' },
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
      if (a.draw) {
        if (kind !== 'iso3166-2' && kind !== 'nuts') return fail(L('Only first-level units (iso3166-2) and NUTS regions have boundaries to colour; counties and municipalities answer as a table (no boundary file is shipped for them).', '境界を塗れるのは第1級行政区分（iso3166-2）と NUTS だけです。郡・市区町村は境界を同梱していないため表でのみ答えます。'), 'NO_BOUNDARIES');
        if (kind === 'nuts' && ![1, 2, 3].includes(Number(a.level))) return fail(L('To colour NUTS regions, give "level": 1, 2 or 3 (each level is a different set of regions).', 'NUTS を塗るには "level" を 1・2・3 で指定してください（レベルごとに別の地域の集合です）。'), 'LEVEL_NEEDED');
        const GU = window.GeoJSONUpload;
        let adm = null, nutsFc = null;
        if (kind === 'nuts') { try { nutsFc = await (await import('./fetch-deadline.js')).jsonWithin('https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_20M_2021_4326_LEVL_' + Number(a.level) + '.geojson', 60000); } catch (_) { nutsFc = null; } }
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
];
