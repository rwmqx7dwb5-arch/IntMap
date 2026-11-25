/* ============================================================================
 *  IntMap · WHAT EACH BUNDLE SAYS ABOUT ITS OWN ROWS  (`rowTables`)
 * ----------------------------------------------------------------------------
 *  A bundle that holds rows says so itself: a top-level `rowTables` array (scripts/data-tables.mjs reads it, checks it
 *  against the rows it describes, and indexes it into js/data-tables.js; js/atlas-query.js turns each into a table `data.query`
 *  can ask and hand on to data.gis / compute.run). The builders that write these bundles call `withRowTables(name, out)` as they
 *  write, so a rebuild keeps the declaration. They are here, in one module, because the bundles' builders are many and the
 *  declaration is the one thing they share. Nothing is a list of which bundles exist: `node scripts/data-tables.mjs --undeclared`
 *  walks data/ and names every bundle that holds rows and has no declaration.
 *
 *  Column paths: a dot path inside the row; `$key` is the key of a record keyed by code (rows given as an object); a segment
 *  `[field]` is the row's own value of `field` (`c.[w].n` is the name of the candidate at index `w`); `via` reads an index
 *  column through an array of the file (`via.field` omitted = the element itself).
 * ==========================================================================*/
const T = (en, jp) => ({ en, jp });
const num = (key, from, en, jp, unit) => Object.assign({ key, from, type: 'number', label: T(en, jp) }, unit ? { unit } : {});
const txt = (key, from, en, jp) => ({ key, from, type: 'text', label: T(en, jp) });

export const ROW_TABLES = {
  airports: [{
    id: 'airport-capacity-by-country', title: T('Airports with scheduled service, counted per country (OurAirports)', '定期便のある空港の国別の数（OurAirports）'),
    rows: 'countries', key: '$key', name: '$key',
    columns: [
      txt('iso3', '$key', 'ISO 3166-1 alpha-3 country code', 'ISO 3166-1 alpha-3 の国コード'),
      num('large', 'lg', 'Large airports with scheduled service', '定期便のある大型空港の数'),
      num('medium', 'md', 'Medium airports with scheduled service', '定期便のある中型空港の数'),
      num('capacity', 'cap', 'Capacity index: large + 0.25 x medium (airline infrastructure, not passengers or routes)', '容量指数: 大型 + 0.25 x 中型（旅客数・路線ではなく空港の基盤）'),
    ] }],
  sanctions: [{
    id: 'sanctions-by-authority-and-country', title: T('Sanctions listings: one row per imposing authority and targeted country (OFAC, UK, EU, UN lists as published)', '制裁リスト: 制裁を課した機関と対象国ごとの 1 行（OFAC・英国・EU・国連の公表リスト）'),
    rows: 'links', name: 'c',
    columns: [
      txt('authority', 'a', 'Imposing authority (US, UK, EU, UN)', '制裁を課した機関（US・UK・EU・UN）'),
      txt('country', 'c', 'Targeted country (ISO 3166-1 alpha-3)', '対象国（ISO 3166-1 alpha-3）'),
      num('listings', 'n', 'Listed persons, entities and ships', '掲載された個人・団体・船舶の数'),
      num('entities', 'kinds.entity', 'Listed entities', '掲載された団体の数'),
      num('individuals', 'kinds.individual', 'Listed individuals', '掲載された個人の数'),
      num('ships', 'kinds.ship', 'Listed ships', '掲載された船舶の数'),
      num('un', 'un', 'Of these, listed by the UN as well', 'うち国連も掲載したもの'),
      txt('first', 'first', 'Earliest listing date in the record', '記録で最も古い掲載日'),
      txt('last', 'last', 'Latest listing date in the record', '記録で最も新しい掲載日'),
    ] }],
  'border-crossings': [{
    id: 'border-crossings', title: T('Border crossings (OpenStreetMap barrier=border_control)', '国境の検問所（OpenStreetMap の barrier=border_control）'),
    rows: 'crossings', key: 'i', name: 'en', lng: 'x', lat: 'y',
    columns: [
      txt('osmId', 'i', 'OpenStreetMap element id', 'OpenStreetMap の要素 ID'),
      txt('name', 'n', 'Name as mapped', '地図上の名称'),
      txt('nameEn', 'en', 'English name as mapped', '英語名'),
      txt('timezone', 'tz', 'IANA time zone', 'IANA タイムゾーン'),
      txt('openingHours', 'oh', 'Opening hours as mapped', '開放時間（地図の記載）'),
      txt('operator', 'op', 'Operator as mapped', '運営者（地図の記載）'),
      txt('access', 'm.access', 'General access (as mapped)', '通行区分（地図の記載）'),
      txt('foot', 'm.foot', 'On foot (as mapped)', '徒歩（地図の記載）'),
      txt('vehicle', 'm.vehicle', 'Vehicles (as mapped)', '車両（地図の記載）'),
      txt('goods', 'm.goods', 'Goods vehicles (as mapped)', '貨物車（地図の記載）'),
    ] }],
  'whc-sites': [{
    id: 'world-heritage-sites', title: T('UNESCO World Heritage properties', 'ユネスコ世界遺産（登録物件）'),
    rows: 'sites', key: 'id', name: 'n.en',
    columns: [
      num('whcId', 'id', 'UNESCO World Heritage Centre property id', 'ユネスコ世界遺産センターの物件 ID'),
      num('inscribed', 'y', 'Year of inscription', '登録年'),
      { key: 'country', from: 'c', via: { rows: 'countries' }, type: 'text', label: T('Country (ISO 3166-1 alpha-2; the first state party)', '国（ISO 3166-1 alpha-2。筆頭の締約国）') },
      { key: 'region', from: 'r.0', via: { rows: 'regions' }, type: 'text', label: T('UNESCO region (the first listed)', 'ユネスコの地域区分（筆頭）') },
      num('transboundary', 't', 'Transboundary or serial across states (1 = yes)', '国境をまたぐ・複数国にまたがる物件（1 = はい）'),
      num('extension', 'x', 'Is an extension of an earlier inscription (1 = yes)', '既存登録の拡大（1 = はい）'),
    ] }],
  'us-elections': [{
    id: 'us-presidential-elections', title: T('U.S. presidential elections 1789-2024: the Electoral College result', '米国大統領選挙 1789-2024: 選挙人団の結果'),
    rows: 'elections', key: 'y', name: 'c.[w].n',
    columns: [
      num('year', 'y', 'Election year', '選挙の年'),
      num('electors', 't', 'Electors in the college that year', 'その年の選挙人総数'),
      txt('winner', 'c.[w].n', 'Winner (the candidate the record marks as elected)', '当選者（記録が当選と記す候補）'),
      txt('winnerParty', 'c.[w].p', 'Winner party code', '当選者の政党コード'),
      num('winnerElectors', 'c.[w].ev', 'Electoral votes received by the winner', '当選者の獲得選挙人数'),
      num('winnerPopularPct', 'c.[w].pv', 'Winner national popular vote, % (blank before 1824)', '当選者の全国得票率 %（1824 年より前は空欄）'),
      txt('first', 'c.0.n', 'Candidate listed first (most electoral votes)', '筆頭候補（獲得選挙人数が最多）'),
      txt('second', 'c.1.n', 'Candidate listed second', '2 番手の候補'),
      num('secondElectors', 'c.1.ev', 'Electoral votes received by the second candidate', '2 番手の候補の獲得選挙人数'),
      txt('note', 'note', 'Note on the election', '選挙についての注'),
    ] }],
  'on-this-day': [{
    id: 'dated-world-events', title: T('Dated world events: the curated events of the on-this-day index (Wikidata)', '日付のある世界の出来事: 「この日の歴史」索引の厳選された出来事（Wikidata）'),
    rows: 'events', key: 'q', name: 'name.en', lng: 'at.0', lat: 'at.1',
    columns: [
      txt('date', 'd', 'Date (YYYY, YYYY-MM or YYYY-MM-DD as far as the source states it)', '日付（出典が述べる精度の YYYY・YYYY-MM・YYYY-MM-DD）'),
      txt('precision', 'prec', 'Precision of the date (year, month, day)', '日付の精度（年・月・日）'),
      txt('kind', 'kind', 'Kind (war, disaster, geo, revolution, space, economic, assassination)', '種類（戦争・災害・地理・革命・宇宙・経済・暗殺）'),
      txt('nameJa', 'name.jp', 'Event name in Japanese', '出来事の日本語名'),
      txt('description', 'desc.en', 'Description (Wikidata)', '説明（Wikidata）'),
      txt('qid', 'q', 'Wikidata item', 'Wikidata の項目'),
      txt('calendar', 'cal', 'Calendar the date is stated in (Julian before the Gregorian reform where the source says so)', '日付の暦（出典が述べる場合はグレゴリオ改暦前のユリウス暦）'),
    ] }],
  'osm-diplo': [{
    id: 'embassies-and-consulates', title: T('Embassies, consulates and other diplomatic posts (OpenStreetMap)', '大使館・領事館などの外交施設（OpenStreetMap）'),
    rows: 'features', key: 'i', name: 'n', lng: 'x', lat: 'y',
    columns: [
      txt('kind', 'k', 'Kind (embassy, consulate, other)', '種別（大使館・領事館・その他）'),
      txt('country', 'c', 'Sending country (ISO 3166-1 alpha-2)', '派遣国（ISO 3166-1 alpha-2）'),
      txt('osmId', 'i', 'OpenStreetMap element id', 'OpenStreetMap の要素 ID'),
    ] }],
  'osm-space': [{
    id: 'space-infrastructure', title: T('Launch pads, spaceports, ground stations and radio telescopes (OpenStreetMap)', '発射台・宇宙港・地上局・電波望遠鏡（OpenStreetMap）'),
    rows: 'features', key: 'i', name: 'n', lng: 'x', lat: 'y',
    columns: [
      txt('kind', 'k', 'Kind (pad, spaceport, ground, radio)', '種別（発射台・宇宙港・地上局・電波望遠鏡）'),
      txt('osmId', 'i', 'OpenStreetMap element id', 'OpenStreetMap の要素 ID'),
    ] }],
  npp: [{
    id: 'nuclear-power-plants', title: T('Nuclear power plants, including planned, shut down and cancelled (Wikidata and IAEA PRIS)', '原子力発電所（計画・停止・中止を含む。Wikidata と IAEA PRIS）'),
    rows: 'plants', key: 'id', name: 'name', lng: 'lon', lat: 'lat',
    columns: [
      txt('country', 'country', 'Country (ISO 3166-1 alpha-2)', '国（ISO 3166-1 alpha-2）'),
      txt('status', 'status', 'Status (operational, under construction, shut down, cancelled...)', '状態（運転中・建設中・停止・中止など）'),
      num('units', 'units', 'Reactor units', '原子炉の基数'),
      num('netMW', 'netMW', 'Net capacity', '正味出力', 'MW'),
      txt('start', 'start', 'Start of operation (as stated)', '運転開始（記載のまま）'),
      txt('end', 'end', 'End of operation (as stated)', '運転終了（記載のまま）'),
      txt('operator', 'operator', 'Operator', '運転者'),
      txt('source', 'src', 'Where the row came from', '行の出所'),
    ] }],
  'small-bodies': [{
    id: 'small-bodies', title: T('Asteroids, comets and trans-Neptunian objects: osculating orbital elements (JPL SBDB)', '小惑星・彗星・太陽系外縁天体: 接触軌道要素（JPL SBDB）'),
    rows: 'bodies', key: 'id', name: 'full',
    columns: [
      txt('class', 'cls', 'Orbit class (MBA, NEA, TNO, comet...)', '軌道クラス（主帯小惑星・地球近傍小惑星・TNO・彗星など）'),
      txt('kind', 'kind', 'Kind (asteroid or comet)', '種別（小惑星・彗星）'),
      num('e', 'e', 'Eccentricity', '離心率'),
      num('a', 'a', 'Semi-major axis', '軌道長半径', 'AU'),
      num('q', 'q', 'Perihelion distance', '近日点距離', 'AU'),
      num('i', 'i', 'Inclination', '軌道傾斜角', 'deg'),
      num('period', 'per', 'Orbital period', '公転周期', 'days'),
      num('H', 'H', 'Absolute magnitude H', '絶対等級 H'),
      num('diameter', 'd', 'Diameter', '直径', 'km'),
      num('albedo', 'alb', 'Albedo', 'アルベド'),
    ] }],
  'deep-sky': [{
    id: 'deep-sky-objects', title: T('Deep-sky objects (Messier and bright NGC/IC; SIMBAD positions)', '深宇宙天体（メシエと明るい NGC/IC。SIMBAD の位置）'),
    rows: 'objects', key: 'main', name: 'main',
    columns: [
      txt('type', 'otype', 'Object type (SIMBAD)', '天体の種類（SIMBAD）'),
      txt('class', 'cls', 'Class (galaxy, nebula, cluster...)', '区分（銀河・星雲・星団など）'),
      num('raDeg', 'ra', 'Right ascension (J2000)', '赤経（J2000）', 'deg'),
      num('decDeg', 'dec', 'Declination (J2000)', '赤緯（J2000）', 'deg'),
      num('majorAxis', 'maj', 'Major axis', '長径', 'arcmin'),
      num('distancePc', 'pc', 'Distance', '距離', 'pc'),
      txt('catalogue', 'from', 'Catalogue it came from', '採録元のカタログ'),
    ] }],
  health: [{
    id: 'health-system-capacity', title: T('Country health-system capacity and immunisation coverage (WHO, UNICEF)', '国別の保健システム能力と予防接種率（WHO・UNICEF）'),
    rows: 'countries', key: '$key', name: '$key',
    columns: [
      txt('iso3', '$key', 'Country code (ISO 3166-1 alpha-3 or World Bank aggregate)', '国コード（ISO 3166-1 alpha-3 または世界銀行の集計コード）'),
      num('uhc', 'uhc', 'WHO UHC service coverage index (SDG 3.8.1)', 'WHO の UHC サービス提供範囲指標（SDG 3.8.1）', '0-100'),
      num('uhcYear', 'uhcY', 'Year of the UHC index', 'UHC 指標の年'),
      num('spar', 'spar', 'IHR SPAR capacity 7: health emergency management', 'IHR SPAR 能力 7: 保健緊急事態への対応管理', '0-100'),
      num('dtp3', 'dtp3', 'DTP3 immunisation coverage of one-year-olds', '1 歳児の DTP3 接種率', '%'),
      num('dtp3Year', 'dtp3Y', 'Year of DTP3 coverage', 'DTP3 接種率の年'),
      num('mcv1', 'mcv1', 'First-dose measles immunisation coverage of one-year-olds', '1 歳児の麻疹ワクチン 1 回目接種率', '%'),
      num('mcv1Year', 'mcv1Y', 'Year of measles coverage', '麻疹接種率の年'),
    ] }],
  'country-facts': [{
    id: 'country-facts', title: T('Country facts: capital, currency, languages, area, UN membership (REST Countries, Natural Earth)', '国の基本事実: 首都・通貨・言語・面積・国連加盟（REST Countries・Natural Earth）'),
    rows: 'countries', key: '$key', name: '$key',
    columns: [
      txt('code', '$key', 'Country code (Natural Earth set)', '国コード（Natural Earth の集合）'),
      txt('capital', 'capital', 'Capital', '首都'),
      txt('currency', 'currency', 'Currency', '通貨'),
      txt('languages', 'languages', 'Languages', '言語'),
      txt('demonym', 'dem', 'Demonym', '住民の呼称'),
      num('area', 'area', 'Area as the source states it', '面積（出典の記載）', 'km2'),
      txt('unMember', 'un', 'UN member state', '国連加盟国'),
      txt('independent', 'ind', 'Independent', '独立国'),
    ] }],
  'hist-cities': [{
    id: 'historical-city-names', title: T('Cities whose name changed: the place and the record that carries its names', '名称が変わった都市: 場所と、その名称の記録'),
    rows: 'cities', key: 'id', name: 'k.0', lng: 'lon', lat: 'lat',
    columns: [
      txt('country', 'cc', 'Country today (ISO 3166-1 alpha-2)', '現在の国（ISO 3166-1 alpha-2）'),
      txt('recordSource', 's', 'Record source (h handwritten, o OHM, p Pleiades, w Wikidata)', '記録の出所（h 手書き・o OHM・p Pleiades・w Wikidata）'),
      num('guardM', 'g', 'Guard radius within which the renaming applies', '改名を適用する範囲の半径', 'm'),
    ] }],
  'hist-places': [{
    id: 'ancient-places', title: T('Ancient places of the Pleiades gazetteer', '古代の地点（Pleiades 地名辞典）'),
    rows: 'places', key: 'id', name: 'title', lng: 'lon', lat: 'lat',
    columns: [
      txt('pleiadesId', 'id', 'Pleiades id', 'Pleiades の ID'),
      txt('title', 'title', 'Pleiades title', 'Pleiades の見出し'),
    ] }],
};

/** the object a builder writes, with its declaration first (the walk reads the first megabyte of a file for it) */
export function withRowTables(name, out) {
  const t = ROW_TABLES[name];
  if (!t) throw new Error('row-tables: no declaration for ' + name);
  const { rowTables: _drop, ...rest } = out;
  return { rowTables: t, ...rest };
}
