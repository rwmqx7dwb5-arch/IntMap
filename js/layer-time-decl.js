// @ts-check
/* ============================================================================
 *  IntMap · js/layer-time-decl.js — WHAT TIME EACH LAYER'S SOURCE CAN STATE  (world-at-time)
 * ----------------------------------------------------------------------------
 *  One declaration per layer of js/layer-manifest.js — the gate (scripts/world-at-time.mjs --check,
 *  run by tests/world-at-time-checks.test.mjs) is red while a layer has none, while a declaration
 *  names a layer the manifest does not have, and while a bound has no author.
 *  The vocabulary — kind, follows / self / entry, from / to / asOf / period, carry — is written once,
 *  in js/layer-time.js, beside the rule that reads it. Read that header before adding a row.
 *
 *  ⚠ SHAPED AS ONE FIELD OF A LAYER'S DESCRIPTION. Each value is what a per-layer descriptor would hold
 *  under `time`: `TIME[id]` and nothing else keyed by anything else, no reference to the DOM or the
 *  window, so a table that describes a layer whole can take it as its `time` field unchanged.
 *
 *  ⚠ PURE DATA, LOADED WHEN IT CAN MATTER (js/layer-time-kernel.js): on the live clock no held kind is
 *  unstated, so this file is not on the boot path.
 *
 *  ⚠ A SHARED OBJECT BELOW IS ONE STATEMENT ABOUT ONE SOURCE, read by every row that draws from it —
 *  the 61 World Bank rows are one series reader (js/wb-layers.js) and say one thing. A row is not
 *  matched to it by its id's spelling: every id is written out.
 * ==========================================================================*/

/* IntMap's own words, en + jp (CONSTITUTION.md §7), held as the translation call the instruments read —
   `pickArgs()` returns the array it is handed, so headless (node, the gate) the same data is the bare array */
const LA = (function () { try { return window.IntMapLang.pickArgs(); } catch (_) { return (...a) => a; } }());

/* ── the sources several rows draw from ─────────────────────────────────────────────────────────── */

/* OpenStreetMap-derived features fetched as the present: an OSM edition is a day (planet replication). */
const OSM = Object.freeze({
  kind: 'snapshot', asOf: 'fetch', period: 'P1D', by: 'scripts/lib/upstream-cadence.mjs OPENSTREETMAP',
  says: LA('OpenStreetMap (today’s map)', 'OpenStreetMap（現在の地図）'),
});
/* the base map's vector tiles (OpenFreeMap, built from OpenStreetMap) — the same statement about time */
const OFM = Object.freeze(Object.assign({}, OSM, {
  says: LA('The base map’s OpenStreetMap tiles (today’s map)', 'ベースマップの OpenStreetMap タイル（現在の地図）'),
}));

/* landforms: a DEM measured around 2000. Before the Holocene sea-level highstand the shore and the
   ice-covered land were not these shapes (sea level within a few metres of today since ~7,000 years
   ago — Lambeck et al. 2014, PNAS 111:15296), so the measurement speaks from 5000 BC (astronomical −4999). */
const LANDFORM = Object.freeze({
  kind: 'enduring', from: -4999, by: 'https://doi.org/10.1073/pnas.1411762111 (Lambeck et al. 2014: sea level near today’s since ~7 ka)',
  says: LA('The terrain model', '地形モデル'),
  why: LA('Landforms change by less than this layer resolves over the last ~7,000 years, except where mines, reservoirs, glaciers or volcanoes moved them; before that the sea stood far lower and ice covered the north', '過去約7,000年の地形の変化はこのレイヤーの解像度より小さい（鉱山・貯水池・氷河・火山を除く）。それより前は海面がはるかに低く、北半球は氷床に覆われていた'),
});

/* the World Bank WDI series, read whole by js/wb-layers.js and painted one year at a time — the year is
   the clock's; the years the layer holds are the years the fetched series has (reported at run time) */
const WB = Object.freeze({
  /* the fetch begins at WB_FROM, so no row states a year before it whatever the series holds; the last year
     is the series' own, reported when it arrives */
  kind: 'series', from: 1990, by: 'js/wb-layers.js WB_FROM', to: 'runtime', carry: 'last',
  follows: 'js/wb-layers.js clockYear', reports: 'js/wb-layers.js IntMapLayerTime',
  says: LA('World Bank WDI (the years this layer reads)', '世界銀行 WDI（このレイヤーが読む年）'),
});

/* ECMWF IFS open data: one run's valid times answer for every ECMWF row (js/wx-ecmwf.js reports them) */
const ECMWF = Object.freeze({
  kind: 'forecast', from: 'runtime', to: 'runtime', group: 'ecmwf-ifs',
  follows: 'js/wx-ecmwf.js _followClock', reports: 'js/wx-ecmwf.js IntMapLayerTime',
  says: LA('The ECMWF forecast run', 'ECMWF の予報ラン'),
});

/* observations of now from a feed that keeps no history the layer reads */
const live = (says) => Object.freeze({ kind: 'live', says });
/* a dated archive of NASA GIBS imagery whose extent was measured by tile probe (data/gibs-range.json) */
const gibs = (id, says) => Object.freeze({
  kind: 'record', from: 'data/gibs-range.json#layers.' + id + '.from', to: 'data/gibs-range.json#layers.' + id + '.to', carry: 'last',
  follows: 'js/layer-packs.js gxAt', says,
});
/* the dated GIBS rasters of js/data-layers.js — first day from DATED_SPEC, the newest day the product has */
const dated = (from, says) => Object.freeze({
  kind: 'record', from, by: 'js/data-layers.js DATED_SPEC', follows: 'js/data-layers.js setGlobalLayerDate', carry: 'last', says,
});
/* a war of data/wars.json — the row opens on its first day and follows the clock inside it. The span is
   written here and CITED: the gate reads data/wars.json (954 kB — not fetched just to learn two dates) and
   is red the day the file says otherwise. */
const war = (id, from, to, says) => Object.freeze({
  kind: 'record', from, to, by: 'data/wars.json',
  cite: { from: 'data/wars.json#wars[id=' + id + '].span.0', to: 'data/wars.json#wars[id=' + id + '].span.1' },
  follows: 'js/war-layer.js setDate', entry: 'js/war-layer.js spanOf', says,
});
/* a dated snapshot with no period of its own: it states the year it is for */
const asOf = (year, by, says) => Object.freeze({ kind: 'snapshot', asOf: year, period: 'P1Y', by, says });

export const TIME = Object.freeze({
  /* ── base view switches ── */
  'cb-names': { kind: 'record', self: 'js/hist-cities.js IntMapHistCities',
    says: LA('Place names (historical names where a historical record states them)', '地名（歴史記録が述べる地名は当時の名前）') },
  'cb-geolabels': OFM,
  'cb-poi': OFM,
  'cb-borders': { kind: 'record', self: 'js/time-borders.js IntMapTimeBorders',
    says: LA('Borders (CShapes 2.0, OpenHistoricalMap, historical-basemaps)', '国境（CShapes 2.0・OpenHistoricalMap・historical-basemaps）') },
  'cb-coast': OFM,
  'cb-admin1': { kind: 'record', self: 'js/time-admin1.js ohmFilter',
    says: LA('Subdivisions (OpenHistoricalMap, dated)', '行政区分（OpenHistoricalMap・日付つき）') },
  'cb-roads': OFM,
  'cb-rail2': OFM,
  'cb-grid': { kind: 'convention', says: LA('The graticule (a convention, not a record)', '経緯線（記録ではなく約束事）') },
  'dl-nightside': { kind: 'instant', says: LA('Day and night, computed from the Sun’s position at the instant', '昼夜（その瞬間の太陽の位置から計算）') },
  'beta-dl-bldg3d': OSM,
  'cb-countries': { kind: 'record', self: 'js/time-countries.js IntMapHistStates',
    says: LA('Countries (the states that existed at the date)', '国（その日に存在した国家）') },
  'dl-contours': LANDFORM,

  /* ── climate & weather ── */
  'dl-climate': { kind: 'series', from: 1901, to: 2020, carry: 'last', by: 'js/data-layers.js KOPPEN_PERIODS',
    follows: 'js/data-layers.js addKoppen', says: LA('Köppen–Geiger classes (Beck et al., 30-year periods 1901–2020)', 'ケッペン–ガイガー区分（Beck ほか、1901〜2020 年の30年期間）') },
  'dl-wind': ECMWF,
  'dl-annprecip': { kind: 'record', from: 1981, to: 2020, carry: 'last', by: 'js/precip-annual.js CLIM', ownDate: 'js/precip-annual.js CLIM',
    says: LA('Annual precipitation (CHIRPS 1981–2020)', '年降水量（CHIRPS 1981〜2020 年）') },
  'dl-ec-temp': ECMWF, 'dl-ec-precip': ECMWF,
  'dl-radar': live(LA('RainViewer radar (the last two hours)', 'RainViewer レーダー（直近2時間）')),
  'dl-ec-slp': ECMWF, 'dl-ec-gust': ECMWF,
  'dl-snow': dated('2000-02-24', LA('MODIS snow cover (NASA GIBS)', 'MODIS 積雪（NASA GIBS）')),
  'dl-ec-cloud': ECMWF, 'dl-ec-dew': ECMWF,
  'dl-aod': dated('2017-04-19', LA('MODIS aerosol optical depth (NASA GIBS)', 'MODIS エアロゾル光学的厚さ（NASA GIBS）')),
  'dl-ec-cape': ECMWF,
  'bx-wbpm25': WB, 'bx-wbco2': WB,

  /* ── space & orbit ── */
  'dl-sats': { kind: 'live', self: 'js/satellites-live.js _elementSpan',
    says: LA('CelesTrak orbital elements (each set states days around its epoch)', 'CelesTrak の軌道要素（各要素は元期の前後数日を述べる）') },
  'l9-dl-aurora': live(LA('NOAA OVATION aurora forecast (the next hour)', 'NOAA OVATION オーロラ予測（この先1時間）')),
  'fac-dl-osmspace': OSM,

  /* ── oceans ── */
  'dl-sst': dated('2002-06-01', LA('GHRSST MUR sea-surface temperature (NASA GIBS)', 'GHRSST MUR 海面水温（NASA GIBS）')),
  'dl-waves': ECMWF,
  'wp-dl-currents': { kind: 'record', rangeUnstated: LA('Surface-current climatology: the averaging period is not stated in the data this layer reads', '海流の気候値：平均期間が、このレイヤーの読むデータに書かれていません'),
    ownDate: 'js/ocean-currents.js month', says: LA('Surface-current climatology', '表層海流の気候値') },
  'gx-gxsstanom': gibs('gxsstanom', LA('GHRSST MUR sea-surface temperature anomaly (NASA GIBS)', 'GHRSST MUR 海面水温偏差（NASA GIBS）')),
  'wp-dl-tides': { kind: 'forecast', follows: 'js/world-packs-rows.js onYear',
    rangeUnstated: LA('Open-Meteo’s tide model: how far back it answers is not stated', 'Open-Meteo の潮汐モデル：どこまで遡れるかが述べられていません'),
    says: LA('Open-Meteo marine tides', 'Open-Meteo 潮汐') },
  'gx-gxseaice': gibs('gxseaice', LA('GHRSST MUR sea-ice concentration (NASA GIBS)', 'GHRSST MUR 海氷密接度（NASA GIBS）')),

  /* ── terrain ── */
  'eco-dl-plates': { kind: 'enduring', says: LA('Tectonic plate boundaries (Bird 2003)', 'プレート境界（Bird 2003）'),
    why: LA('Plates move a few centimetres a year — under 10 km since the oldest date the clock reaches, finer than this layer draws', 'プレートの移動は年に数センチ——時計の最古の日付から今日までで 10 km 未満で、このレイヤーの描画より細かい') },
  'dl-relief': LANDFORM,
  'dl-sealevel': { kind: 'convention', says: LA('Sea-level scenario simulator (a what-if, not a record of a date)', '海面上昇シミュレータ（日付の記録ではなく仮定）') },
  'dl-hillshade': LANDFORM,
  'gx-gxrelief': LANDFORM,

  /* ── land cover ── */
  'eco-dl-worldcover': { kind: 'record', from: 2020, to: 2021, carry: 'last', by: 'js/layer-packs.js WC_EPOCHS', ownDate: 'js/layer-packs.js WC_EPOCHS',
    says: LA('ESA WorldCover (2020, 2021)', 'ESA WorldCover（2020・2021 年）') },
  'eco-dl-ecoregions': { kind: 'enduring', from: -4999, by: 'data/ecoregions_2017 (RESOLVE Ecoregions, Dinerstein et al. 2017)',
    says: LA('RESOLVE Ecoregions 2017', 'RESOLVE エコリージョン 2017'),
    why: LA('Ecoregions describe the natural communities the land would hold, not what covers it today — a biogeographic unit of the Holocene', 'エコリージョンは現在の土地被覆ではなく、その土地が本来持つ生物群集を表す——完新世の生物地理の単位') },
  'gx-gxndvi': gibs('gxndvi', LA('MODIS NDVI 8-day (NASA GIBS)', 'MODIS NDVI 8日合成（NASA GIBS）')),
  'bx-wbforest': WB,

  /* ── population ── */
  'dl-popgrid': { kind: 'record', from: 2000, to: 2020, carry: 'last', by: 'js/data-layers.js POPGRID_EPOCHS', ownDate: 'js/data-layers.js POPGRID_EPOCHS',
    says: LA('WorldPop population grid (2000–2020)', 'WorldPop 人口グリッド（2000〜2020 年）') },
  'dl-nightsat': { kind: 'record', from: 2012, to: 2016, carry: 'last', by: 'js/night-lights.js forYear', self: 'js/night-lights.js forYear',
    says: LA('NASA Black Marble night lights (2012, 2016)', 'NASA Black Marble 夜間光（2012・2016 年）') },
  'dl-tfr': { kind: 'series', from: 1960, carry: 'last', by: 'js/time-countries.js WB_FLOOR', follows: 'js/time-countries.js WB_FLOOR',
    says: LA('Total fertility rate (World Bank, from 1960)', '合計特殊出生率（世界銀行、1960 年〜）') },
  'dl-pop': { kind: 'series', from: 1850, to: 2018, carry: 'last', by: 'data/maddison.json (its smallest and largest year)', follows: 'js/time-countries.js MFLOOR',
    says: LA('Population (Maddison Project 2020, 1850–2018)', '人口（マディソン・プロジェクト 2020、1850〜2018 年）') },
  'bx-wbpopgrow': WB, 'bx-wbaging': WB, 'bx-wbfert': WB, 'bx-wbadofert': WB, 'bx-wburb': WB, 'bx-wbrural': WB, 'bx-wbdensity': WB, 'bx-wbref': WB,

  /* ── hazards ── */
  'wp-dl-alerts': live(LA('National weather & disaster warnings (in force now)', '各国の気象・災害警報（現在発令中）')),
  'bx-eq': live(LA('USGS earthquake feed (the window chosen in its legend, ending now)', 'USGS 地震フィード（凡例で選ぶ、現在までの期間）')),
  'beta-dl-volc2': { kind: 'enduring', from: -9699, by: 'https://volcano.si.edu/ (Smithsonian GVP: the Holocene volcano list)',
    says: LA('Holocene volcanoes (Smithsonian GVP)', '完新世の火山（スミソニアン GVP）'),
    why: LA('The list is of volcanoes active in the Holocene (the last 11,700 years); a volcano’s position does not move at this scale', '一覧は完新世（過去11,700年）に活動した火山で、位置はこの縮尺では動かない') },
  'dl-thermal': live(LA('NASA FIRMS active fires (the last 24 h – 7 days)', 'NASA FIRMS 火災（直近24時間〜7日）')),
  'fac-dl-osmemg': OSM,
  'beta-dl-radobs': { kind: 'live', self: 'js/radiation-layer.js historyDays',
    says: LA('Measured radiation (each network’s own history)', '放射線の実測（各観測網の保存期間）') },

  /* ── politics ── */
  'dl-dem': asOf(2023, 'js/time-countries.js FIELDS (EIU Democracy Index 2023)', LA('EIU Democracy Index 2023', 'EIU 民主主義指数 2023')),
  'beta-dl-cpi': asOf(2023, 'js/layer-packs.js cpi (WGI 2023)', LA('Worldwide Governance Indicators 2023', '世界ガバナンス指標 2023')),
  'dl-eez': { kind: 'snapshot', asOf: 'fetch', period: 'P1Y', by: 'js/data-layers.js lgdEEZ (Marine Regions, the claims as published today)',
    says: LA('Exclusive economic zones (Marine Regions, today’s claims)', '排他的経済水域（Marine Regions、現在の主張）') },
  'dl-uselect': { kind: 'record', from: 1789, to: 2024, carry: 'last', by: 'data/us-elections.json',
    cite: { from: 'data/us-elections.json#elections.$min(y)', to: 'data/us-elections.json#elections.$max(y)' }, ownDate: 'js/us-elections.js year',
    says: LA('U.S. presidential elections (1789–2024)', 'アメリカ大統領選挙（1789〜2024 年）') },
  'dl-eu': { kind: 'record', from: '1958-01-01', by: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:11957E/TXT (Treaty of Rome, in force 1958-01-01)',
    follows: 'js/data-layers.js EU_JOIN', says: LA('EU (EEC from 1958) members by accession year', 'EU（1958 年の EEC から）加盟国') },
  'dl-ww2': war('ww2', '1939-08-23', '1945-10-18', LA('The Second World War (data/wars.json)', '第二次世界大戦（data/wars.json）')),
  'dl-elect': { kind: 'record', from: '1949-08-14', to: '2026-02-08', carry: 'last', by: 'data/elections/index.json',
    cite: { from: 'data/elections/index.json#elections.$min(date)', to: 'data/elections/index.json#elections.$max(date)' }, ownDate: 'js/elections.js election.date',
    says: LA('National elections (the elections this layer holds)', '国政選挙（このレイヤーが持つ選挙）') },
  'dl-ww1': war('ww1', '1914-06-28', '1918-11-25', LA('The First World War (data/wars.json)', '第一次世界大戦（data/wars.json）')),
  'dl-korea': war('korea', '1950-06-25', '1953-07-27', LA('The Korean War (data/wars.json)', '朝鮮戦争（data/wars.json）')),
  'dl-vietnam': war('vietnam', '1954-04-26', '1975-04-30', LA('The Vietnam War (data/wars.json)', 'ベトナム戦争（data/wars.json）')),
  'dl-mideast': war('mideast', '1948-05-14', '1974-05-31', LA('The Arab–Israeli wars (data/wars.json)', '中東戦争（data/wars.json）')),
  'dl-yugoslavia': war('yugoslavia', '1991-06-25', '2001-08-13', LA('The Yugoslav Wars (data/wars.json)', 'ユーゴスラビア紛争（data/wars.json）')),
  'dl-tz': { kind: 'snapshot', asOf: 'fetch', period: 'P3M', by: 'scripts/lib/upstream-cadence.mjs IANA_TZDB',
    says: LA('Time zones (today’s, IANA tz database)', 'タイムゾーン（現在のもの、IANA tz データベース）') },
  'bx-wbwomparl': WB,
  'fac-dl-osmdiplo': OSM,

  /* ── security ── */
  'dl-milSpend': { kind: 'series', from: 1960, carry: 'last', by: 'js/time-countries.js WB_FLOOR', follows: 'js/time-countries.js WB_FLOOR',
    says: LA('Military expenditure (World Bank, from 1960)', '国防費（世界銀行、1960 年〜）') },
  'dl-nato': { kind: 'record', from: '1949-08-24', by: 'https://www.nato.int/cps/en/natohq/official_texts_17120.htm (North Atlantic Treaty, in force 1949-08-24)',
    follows: 'js/data-layers.js NATO_JOIN', says: LA('NATO members by accession year', 'NATO 加盟国（加盟年）') },
  'beta-dl-ukrfront': { kind: 'live', says: LA('Ukraine front line (the latest published line)', 'ウクライナの前線（最新の公表線）') },
  'bx-wbmilgdp': WB, 'bx-wbmilppl': WB,
  'fac-dl-osmmil': OSM,

  /* ── health ── */
  'beta-dl-lifeexp': asOf(2022, 'js/layer-packs.js lifeexp (World Bank 2022)', LA('Life expectancy (World Bank 2022)', '平均寿命（世界銀行 2022）')),
  'bx-wbinfmort': WB, 'bx-wbsuicide': WB, 'bx-wbsmoke': WB, 'bx-wbalcohol': WB, 'bx-wbwater': WB, 'bx-wbhealth': WB, 'bx-wbphys': WB,
  'bx-wbbeds': WB, 'bx-wbu5mort': WB, 'bx-wblife': WB, 'bx-wbsan': WB, 'bx-wboverwt': WB,
  'fac-dl-osmhealth': OSM, 'fac-dl-osmwater': OSM,

  /* ── technology ── */
  'dl-subcables': { kind: 'snapshot', asOf: 'fetch', period: 'P1M', by: 'data/subcables (TeleGeography Submarine Cable Map, refreshed by scripts)',
    says: LA('Submarine cables (TeleGeography, today’s map incl. planned)', '海底ケーブル（TeleGeography、計画中を含む現在の地図）') },
  'beta-dl-dc': { kind: 'snapshot', asOf: 'fetch', period: 'P1M', by: 'js/datacenters.js',
    says: LA('Data centres (today’s list)', 'データセンター（現在の一覧）') },
  'dl-nethlth': live(LA('Internet health (Cloudflare Radar / IODA, now)', 'インターネットの健康状態（Cloudflare Radar / IODA、現在）')),
  'dl-netreach': live(LA('Internet reachability (now)', 'インターネット到達性（現在）')),
  'bx-wbnet': WB, 'bx-wbmobile': WB, 'bx-wbbbnd': WB, 'bx-wbrnd': WB, 'bx-wbresearch': WB, 'bx-wbpatent': WB,
  'fac-dl-osmtelecom': OSM,

  /* ── economy ── */
  'dl-gdppc': { kind: 'series', from: 1850, to: 2018, carry: 'last', by: 'data/maddison.json (its smallest and largest year)', follows: 'js/time-countries.js MFLOOR',
    says: LA('GDP per capita (Maddison Project 2020, 1850–2018)', '1人当たりGDP（マディソン・プロジェクト 2020、1850〜2018 年）') },
  'wp-dl-trade': { kind: 'series', from: 1995, to: 2024, carry: 'last', by: 'js/world-packs.js YMIN', follows: 'js/world-packs-rows.js onYear',
    says: LA('Trade flows (CEPII BACI 1995–2024)', '貿易フロー（CEPII BACI 1995〜2024 年）') },
  'bx-wbgini': WB,
  'wp-dl-industry': { kind: 'snapshot', asOf: 'fetch', period: 'P1D', by: 'scripts/lib/upstream-cadence.mjs WIKIDATA',
    says: LA('Industrial sites (Wikidata, today’s)', '産業拠点（Wikidata、現在）') },
  'bx-wbgdpgrow': WB, 'bx-wbinfl': WB, 'bx-wbtrade': WB, 'bx-wbtax': WB, 'bx-wbdebt': WB, 'bx-wbmanuf': WB, 'bx-wbhitech': WB,
  'bx-wbfdi': WB, 'bx-wbunemp': WB, 'bx-wbgni': WB, 'bx-wbpov': WB, 'bx-wbflfp': WB, 'bx-wbremit': WB, 'bx-wbtour': WB,
  'beta-dl-pharma': { kind: 'snapshot', asOf: 'fetch', period: 'P1D', by: 'scripts/lib/upstream-cadence.mjs WIKIDATA',
    says: LA('Pharmaceutical companies (Wikidata, today’s)', '製薬企業（Wikidata、現在）') },

  /* ── society ── */
  'dl-hdi': { kind: 'series', from: 1990, to: 2022, by: 'data/hdi-series.json', cite: { from: 'data/hdi-series.json#years.0', to: 'data/hdi-series.json#years.$last' }, carry: 'last', follows: 'js/time-countries.js _imHdiYear',
    says: LA('Human Development Index (UNDP, 1990–2022)', '人間開発指数（UNDP、1990〜2022 年）') },
  'bx-wbhomicide': WB,
  'beta-dl-cat-language': { kind: 'snapshot', asOf: 'fetch', period: 'P6M', by: 'scripts/lib/upstream-cadence.mjs GLOTTOLOG',
    says: LA('Languages (Glottolog & national shares, today’s)', '言語（Glottolog と各国の比率、現在）') },
  'beta-dl-whs': { kind: 'snapshot', asOf: 'fetch', period: 'P1Y', by: 'data/whc-sites.json (the UNESCO World Heritage List as bundled; inscriptions are yearly)',
    says: LA('UNESCO World Heritage List (today’s list)', 'ユネスコ世界遺産一覧（現在の一覧）') },
  'bx-wblit': WB, 'bx-wbschool': WB, 'bx-wbtert': WB, 'bx-wbedu': WB,
  'fac-dl-osmedu': OSM,
  'beta-dl-cat-religion': { kind: 'snapshot', asOf: 'fetch', period: 'P1Y', by: 'js/layer-packs.js religion',
    says: LA('Religions (national shares, today’s)', '宗教（各国の比率、現在）') },

  /* ── transport ── */
  'dl-planes': live(LA('Aircraft positions (ADS-B, now)', '航空機の位置（ADS-B、現在）')),
  'beta-dl-rail': OSM,
  'dl-ships': live(LA('Ship positions (AIS, now)', '船舶の位置（AIS、現在）')),
  'ox-oxrail': OSM,
  'ox-oxsea': OSM,
  'fac-dl-osmair': OSM,
  'fac-dl-osmport': OSM,
  'dl-webcams': live(LA('Webcams (live images)', 'ウェブカメラ（ライブ映像）')),

  /* ── agriculture ── */
  'wp-dl-crops': { kind: 'record', from: 2000, to: 2010, carry: 'last', by: 'js/world-packs.js nowYear (SPAM 2000 / 2010)', follows: 'js/world-packs.js nowYear',
    says: LA('Crop production (SPAM 2000, 2010)', '作物生産（SPAM 2000・2010 年）') },
  'bx-wbagremp': WB, 'bx-wbunder': WB, 'bx-wbagri': WB,
  'gx-gxsoil': gibs('gxsoil', LA('AMSR2 soil moisture (NASA GIBS)', 'AMSR2 土壌水分（NASA GIBS）')),

  /* ── energy ── */
  'wp-dl-energy': { kind: 'series', follows: 'js/world-packs.js pickYear',
    rangeUnstated: LA('Energy mix (Our World in Data): the years are read from the CSV and not yet declared to the clock', 'エネルギー構成（Our World in Data）：年は CSV から読むが、時計にまだ宣言されていません'),
    says: LA('Energy mix (Our World in Data)', 'エネルギー構成（Our World in Data）') },
  'bx-wbrenew': WB, 'bx-wbelec': WB,
  'fac-dl-osmpower': OSM, 'fac-dl-osmextract': OSM,
  'l9-dl-dams': { kind: 'snapshot', asOf: 'fetch', period: 'P1Y', by: 'js/layer-packs.js dams',
    says: LA('Dams (today’s list)', 'ダム（現在の一覧）') },
  'bx-wbcook': WB, 'bx-wbelecuse': WB, 'bx-wbrenelec': WB, 'bx-wbenergy': WB,

  /* ── others ── */
  'dl-precip': dated('2000-06-01', LA('IMERG precipitation rate (NASA GIBS)', 'IMERG 降水強度（NASA GIBS）')),
  'dl-ec-wind': ECMWF,
  'beta-dl-volcash': live(LA('Volcanic-ash advisories (SIGMETs in force now)', '火山灰情報（現在有効な SIGMET）')),
  'beta-dl-volchaz': { kind: 'snapshot', asOf: 'fetch', period: 'P1Y', by: 'js/volcano-layers.js',
    says: LA('Volcanic hazard zones (today’s assessment)', '火山ハザード区域（現在の評価）') },
  'beta-dl-volcso2': { kind: 'record', follows: 'js/volcano-layers.js IntMapTime',
    rangeUnstated: LA('Volcanic SO₂ (NASA GIBS): the first day of the product is not declared to the clock', '火山 SO₂（NASA GIBS）：製品の初日が時計に宣言されていません'),
    says: LA('Volcanic SO₂ (NASA GIBS)', '火山 SO₂（NASA GIBS）') },
  'beta-dl-unemp': asOf('fetch', 'js/layer-packs.js unemp (World Bank, latest value per country)', LA('Unemployment (World Bank, latest per country)', '失業率（世界銀行、国ごとの最新値）')),
  'beta-dl-internet': asOf('fetch', 'js/layer-packs.js internet (World Bank, latest value per country)', LA('Internet users (World Bank, latest per country)', 'インターネット利用率（世界銀行、国ごとの最新値）')),
  'beta-dl-precip': asOf('fetch', 'js/layer-packs.js precip (World Bank, latest value per country)', LA('Precipitation (World Bank, latest per country)', '降水量（世界銀行、国ごとの最新値）')),
  'beta-dl-spin': { kind: 'convention', says: LA('Globe rotation (a view, not data)', '地球の自転表示（データではなく表示）') },
  'wp-dl-outbreaks': { kind: 'record', follows: 'js/outbreaks.js clockDay',
    rangeUnstated: LA('WHO Disease Outbreak News: the first item’s date is not declared to the clock', 'WHO 疾病発生ニュース：最初の記事の日付が時計に宣言されていません'),
    says: LA('WHO Disease Outbreak News', 'WHO 疾病発生ニュース') },
  'bx-heat': { kind: 'record', follows: 'js/news-events.js IntMapTime',
    rangeUnstated: LA('News heat: the reach of the news archive is not declared to the clock', 'ニュースの熱量：ニュース記録の範囲が時計に宣言されていません'),
    says: LA('News heat (the news archive)', 'ニュースの熱量（ニュース記録）') },
});
