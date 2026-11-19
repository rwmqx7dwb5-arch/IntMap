/* ============================================================================
 *  Imagery registry — WHICH satellite / aerial picture IntMap can show, where, when, how sharp, and on what terms.
 * ----------------------------------------------------------------------------
 *  ONE declaration per supplier. Nothing about a supplier lives anywhere else: the satellite provider list
 *  (js/tables.js SAT_PROVIDERS), the controller's capture line (js/satellite.js), the «what picture is there»
 *  picker and Atlas's `imageryInfo` all read THIS array, so adding a supplier is one object and a supplier cannot
 *  be on screen without having declared its licence.
 *
 *  A source declares (see SOURCES below):
 *    coverage   [[w,s,e,n], …]  where it has pictures (a tile outside answers 404 = transparent, so this only RANKS)
 *    zoom       [min,max]       the zooms the supplier cuts tiles for (the renderer over-zooms past max)
 *    resolutionM                nominal ground sample distance at the best zoom, metres — or a function of the date
 *    time       {mode,…}        'latest' | 'day' (from/to) | 'year' (years) | 'epoch' (from/to years)
 *    capture    {kind,…}        how the date/resolution of the picture UNDER A POINT is known:
 *                                'service-query' — the supplier answers per place (Esri's Citations layer)
 *                                'layer-date'    — the picture IS the date chosen (GIBS: one swath/composite per day)
 *                                'declared'      — the supplier publishes a range, not a per-place date (GSI, USGS, PDOK)
 *    license    {name,url,commercial,checked,attribution}   commercial: 'allowed' | 'unconfirmed' | 'restricted'
 *
 *  ⚠ NO SOURCE IS HERE ON A GUESS. Every row names what was READ and WHEN (`license.checked`) and every URL was
 *  fetched as a real tile on 2026-11-20 (dev-notes/2026-11-20-sat-imagery-supply.md has the measurements). A supplier
 *  whose terms could not be read from a primary page is not in this list (IGN France's Géoplateforme orthophotos:
 *  the page that states the licence could not be read, so they are out until it can).
 *  ⚠ `commercial:'restricted'` rows are never listed: IntMap is a for-profit service (memory intmap-commercial-service-licences),
 *  and EOX Sentinel-2 cloudless (CC BY-NC-SA, paid licence for web services — cloudless.eox.at/documentation/license,
 *  read 2026-11-20) was REMOVED for that reason on the user's decision of the same day. tests/sat-imagery-supply-checks.test.mjs
 *  fails if a restricted source is added to SOURCES.
 *  EXPIRY: a row is re-read when its `checked` date is a year old (the test says so), or when its tiles stop answering.
 * ==========================================================================*/
import { imageryTiles, imagerySources, imageryCaptureAt } from './esri-imagery.js';
import { IntMapLang } from './lang-registry.js';

/* every translation tuple is a CALL (IntMapLang.pickArgs) — the same answer the other tables use; it is the same array, indexable [en, jp, …] */
const LA = IntMapLang.pickArgs();

const WORLD = [[-180, -85.06, 180, 85.06]];
const TODAY = () => new Date().toISOString().slice(0, 10);

/* GIBS: the same host and path shape for every layer; `level` is the TileMatrixSet's finest level. */
const gibs = (layer, level, ext) => (d) => ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' + layer + '/default/' + d + '/GoogleMapsCompatible_Level' + level + '/{z}/{y}/{x}.' + ext];
const GIBS_LICENSE = {
  name: 'NASA open data (no licence; acknowledgement requested)',
  url: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api',
  commercial: 'allowed',
  checked: '2026-11-20',
  note: 'NASA\'s GIBS page names no licence and asks that GIBS/ESDIS be acknowledged; its data policy describes full and open sharing. Nothing read restricts commercial use.',
};
const GSI_LICENSE = {
  name: '国土地理院コンテンツ利用規約 (PDL 1.0 compatible)',
  url: 'https://maps.gsi.go.jp/development/ichiran.html',
  commercial: 'allowed',
  checked: '2026-11-20',
  note: 'The tile list says a website or app that loads the tiles live needs only the credit (国土地理院 / 地理院タイル) and a link to the list — no application — for the seamlessphoto and the dated aerial-photo series.',
};

/** @type {Array<any>} */
export const SOURCES = [
  { id: 'esri', short: 'Esri', scope: 'global', name: LA('Esri World Imagery', 'Esri 衛星画像', 'Esri Satellitenbilder', 'Спутниковые снимки Esri', 'Imágenes satelitales de Esri'),   /* the five-language names this row already carried stay (the i18n floor) */
    coverage: WORLD, zoom: [0, 19], resolutionM: 0.3, time: { mode: 'latest' },
    capture: { kind: 'service-query' },
    tiles: () => imageryTiles(), attributionFn: () => 'Powered by Esri · Sources: ' + imagerySources(),
    license: { name: 'Esri terms (keyless endpoint — unresolved)', url: 'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9', commercial: 'unconfirmed', checked: '2026-11-20',
      note: 'The keyless endpoint carries no licence for a commercial app that a primary page states (dev-notes/2026-11-17-sat-arcgis-3d.md); the user kept it as it is on 2026-11-20.' } },

  { id: 'gibs-modis', short: 'MODIS Terra', scope: 'global', name: LA('NASA GIBS · MODIS Terra', 'NASA GIBS · MODIS Terra', 'NASA GIBS · MODIS Terra', 'NASA GIBS · MODIS Terra', 'NASA GIBS · MODIS Terra'),
    coverage: WORLD, zoom: [0, 9], resolutionM: 250, time: { mode: 'day', from: '2000-02-24', announcedEnd: '2026-12-01' },
    capture: { kind: 'layer-date' }, tiles: gibs('MODIS_Terra_CorrectedReflectance_TrueColor', 9, 'jpg'),
    attribution: 'NASA EOSDIS GIBS — MODIS Terra true color', license: GIBS_LICENSE,
    note: LA('Terra observations are announced to end 2026-12-01 (banner on the GIBS page, read 2026-11-20); MODIS Aqua carries on.', 'Terra の観測は 2026-12-01 に終了予定（GIBS ページの告知、2026-11-20 確認）。MODIS Aqua は続きます。') },
  { id: 'gibs-modis-aqua', short: 'MODIS Aqua', scope: 'global', name: LA('NASA GIBS · MODIS Aqua', 'NASA GIBS · MODIS Aqua'),
    coverage: WORLD, zoom: [0, 9], resolutionM: 250, time: { mode: 'day', from: '2002-07-04' },
    capture: { kind: 'layer-date' }, tiles: gibs('MODIS_Aqua_CorrectedReflectance_TrueColor', 9, 'jpg'),
    attribution: 'NASA EOSDIS GIBS — MODIS Aqua true color', license: GIBS_LICENSE },
  { id: 'gibs-viirs', short: 'VIIRS SNPP', scope: 'global', name: LA('NASA GIBS · VIIRS (SNPP)', 'NASA GIBS · VIIRS (SNPP)', 'NASA GIBS · VIIRS (SNPP)', 'NASA GIBS · VIIRS (SNPP)', 'NASA GIBS · VIIRS (SNPP)'),
    coverage: WORLD, zoom: [0, 9], resolutionM: 250, time: { mode: 'day', from: '2015-11-24' },
    capture: { kind: 'layer-date' }, tiles: gibs('VIIRS_SNPP_CorrectedReflectance_TrueColor', 9, 'jpg'),
    attribution: 'NASA EOSDIS GIBS — VIIRS SNPP true color', license: GIBS_LICENSE },
  { id: 'gibs-viirs-n20', short: 'VIIRS N20', scope: 'global', name: LA('NASA GIBS · VIIRS (NOAA-20)', 'NASA GIBS · VIIRS (NOAA-20)', 'NASA GIBS · VIIRS (NOAA-20)', 'NASA GIBS · VIIRS (NOAA-20)', 'NASA GIBS · VIIRS (NOAA-20)'),
    coverage: WORLD, zoom: [0, 9], resolutionM: 250, time: { mode: 'day', from: '2018-01-05' },
    capture: { kind: 'layer-date' }, tiles: gibs('VIIRS_NOAA20_CorrectedReflectance_TrueColor', 9, 'jpg'),
    attribution: 'NASA EOSDIS GIBS — VIIRS NOAA-20 true color', license: GIBS_LICENSE },
  { id: 'gibs-hls-s30', short: 'HLS Sentinel-2', scope: 'global', name: LA('NASA GIBS · HLS Sentinel-2 (30 m, daily swaths)', 'NASA GIBS · HLS Sentinel-2（30 m・日ごとの観測帯）'),
    coverage: WORLD, zoom: [0, 12], resolutionM: 30, time: { mode: 'day', from: '2015-11-28' }, partial: true,
    capture: { kind: 'layer-date' }, tiles: gibs('HLS_S30_Nadir_BRDF_Adjusted_Reflectance', 12, 'png'),
    attribution: 'NASA EOSDIS GIBS — Harmonized Landsat Sentinel-2 (S30)', license: GIBS_LICENSE,
    note: LA('One day covers only that day\'s satellite swath (a 2–5-day revisit); the rest is transparent over the Esri picture. Measured 2026-11-20: tiles are 155–935 bytes (empty) on most days.', 'ある日の画像はその日に衛星が通った帯だけ（再訪 2〜5 日）。それ以外は透明で下の Esri 画像が見えます。') },
  { id: 'gibs-hls-l30', short: 'HLS Landsat', scope: 'global', name: LA('NASA GIBS · HLS Landsat (30 m, daily swaths)', 'NASA GIBS · HLS Landsat（30 m・日ごとの観測帯）'),
    coverage: WORLD, zoom: [0, 12], resolutionM: 30, time: { mode: 'day', from: '2013-03-22' }, partial: true,
    capture: { kind: 'layer-date' }, tiles: gibs('HLS_L30_Nadir_BRDF_Adjusted_Reflectance', 12, 'png'),
    attribution: 'NASA EOSDIS GIBS — Harmonized Landsat Sentinel-2 (L30)', license: GIBS_LICENSE },
  /* Landsat WELD annual composites — the only 30 m global pictures before 2013 that GIBS serves. The years are the ones the
     layer's GetCapabilities lists (1983-12-01…1985-12-01, 1988-12-01…1990-12-01, 1998-12-01…2000-12-01), each probed 2026-11-20. */
  { id: 'gibs-weld', short: 'Landsat WELD', scope: 'global', name: LA('NASA GIBS · Landsat WELD annual (30 m)', 'NASA GIBS · Landsat WELD 年次合成（30 m）'),
    coverage: WORLD, zoom: [0, 12], resolutionM: 30, time: { mode: 'year', years: [2000, 1999, 1998, 1990, 1989, 1988, 1985, 1984], composite: true },
    capture: { kind: 'layer-date' }, tiles: (y) => gibs('Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual', 12, 'jpg')(y + '-12-01'),
    attribution: 'NASA EOSDIS GIBS — Landsat WELD true color (annual)', license: GIBS_LICENSE },

  /* ── regional: national mapping agencies that publish their orthophotos as tiles on stated terms ── */
  { id: 'gsi-photo', short: '地理院 最新', scope: 'regional', country: 'JP', name: LA('GSI Japan · latest aerial photo', '国土地理院 · 全国最新写真'),
    coverage: [[122.9, 24.0, 146.0, 45.6]], zoom: [14, 18], resolutionM: 0.2, time: { mode: 'latest' },
    capture: { kind: 'declared', range: LA('2007–', '2007年〜'), text: LA('A mosaic of orthophotos, aerial photos and satellite scenes; the date differs from place to place (GSI publishes no per-place date).', 'オルソ画像・空中写真・衛星画像の合成。撮影時期は場所ごとに違います（国土地理院は場所別の撮影日を公開していません）。') },
    tiles: () => ['https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'], attribution: '国土地理院（地理院タイル）', license: GSI_LICENSE },
  ...[
    ['gsi-1945', 'ort_USA10', 'png', [1945, 1950], LA('US military photography', '米軍撮影'), [10, 17], 1.5],
    ['gsi-1961', 'ort_old10', 'png', [1961, 1969], null, [10, 17], 1.5],
    ['gsi-1974', 'gazo1', 'jpg', [1974, 1978], null, [10, 17], 1.5],
    ['gsi-1979', 'gazo2', 'jpg', [1979, 1983], null, [10, 17], 1.5],
    ['gsi-1984', 'gazo3', 'jpg', [1984, 1986], null, [10, 17], 1.5],
    ['gsi-1987', 'gazo4', 'jpg', [1987, 1990], null, [10, 17], 1.5],
  ].map(([id, layer, ext, [a, b], who, zoom, res]) => ({
    id, short: '地理院 ' + a + '–' + b, scope: 'regional', country: 'JP',
    name: LA('GSI Japan · aerial photos ' + a + '–' + b + (who ? ' (' + who[0] + ')' : ''), '国土地理院 · 空中写真 ' + a + '〜' + b + '年' + (who ? '（' + who[1] + '）' : '')),
    coverage: [[122.9, 24.0, 146.0, 45.6]], zoom, resolutionM: res, time: { mode: 'epoch', from: a, to: b },
    capture: { kind: 'declared', range: [a + '–' + b, a + '〜' + b + '年'], text: ['Aerial photographs taken in ' + a + '–' + b + '; each frame\'s exact day is in GSI\'s photo index, not in the tiles.', a + '〜' + b + '年に撮影された空中写真。1 枚ごとの撮影日はタイルではなく国土地理院の写真索引にあります。'] },
    tiles: () => ['https://cyberjapandata.gsi.go.jp/xyz/' + layer + '/{z}/{x}/{y}.' + ext], attribution: '国土地理院（地理院タイル・空中写真 ' + a + '–' + b + '）', license: GSI_LICENSE,
  })),
  { id: 'gsi-1936', short: '地理院 1936–42', scope: 'regional', country: 'JP', name: LA('GSI Japan · aerial photos 1936–42 (Tokyo, Osaka)', '国土地理院 · 空中写真 1936〜42年頃（東京・大阪）'),
    coverage: [[139.45, 35.5, 139.95, 35.85], [135.2, 34.45, 135.75, 34.95]], zoom: [13, 18], resolutionM: 1, time: { mode: 'epoch', from: 1936, to: 1942 },
    capture: { kind: 'declared', range: LA('1936–42', '1936〜42年頃'), text: LA('Army aerial photographs of Tokyo\'s 23 wards and Osaka and its surroundings.', '東京 23 区と大阪市周辺の陸軍撮影の空中写真。') },
    tiles: () => ['https://cyberjapandata.gsi.go.jp/xyz/ort_riku10/{z}/{x}/{y}.png'], attribution: '国土地理院（地理院タイル・空中写真 1936–42）', license: GSI_LICENSE },

  { id: 'usgs-imagery', short: 'USGS', scope: 'regional', country: 'US', name: LA('USGS · The National Map orthoimagery', 'USGS · The National Map オルソ画像'),
    coverage: [[-125, 24.4, -66.9, 49.5], [-179.2, 51, -129, 71.5], [-160.5, 18.8, -154.7, 22.3]], zoom: [0, 16], resolutionM: 1, time: { mode: 'latest' },
    capture: { kind: 'declared', range: LA('2010s–2020s', '2010〜2020年代'), text: LA('Mostly NAIP aerial imagery (about 1 m) in a multi-year cycle per state; the service states a data refresh (June 2024 when read), not a per-place date.', '主に NAIP の航空写真（約 1 m）で、州ごとに数年周期。提供元が示すのは更新時期（確認時点で 2024 年 6 月）で、場所別の撮影日ではありません。') },
    tiles: () => ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'], attribution: 'USDA, USGS The National Map: Orthoimagery',
    license: { name: 'US Government work (public domain)', url: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits', commercial: 'allowed', checked: '2026-11-20',
      note: 'USGS states its own content is public domain and asks for the credit; the page does not name NAIP, so NAIP\'s public-domain status is inferred from the MapServer text ("public domain, 1-meter").' } },

  { id: 'pdok-latest', short: 'PDOK', scope: 'regional', country: 'NL', name: LA('PDOK · Netherlands aerial photo, latest year', 'PDOK · オランダ航空写真（最新年）'),
    coverage: [[3.2, 50.7, 7.3, 53.6]], zoom: [0, 20], resolutionM: 0.08, time: { mode: 'latest' },
    capture: { kind: 'declared', range: LA('latest year', '最新の年'), text: LA('The most recent national flight (8 cm); the layer is replaced each year.', '最新年の全国撮影（8 cm）。毎年差し替わります。') },
    tiles: () => ['https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg'], attribution: 'Luchtfoto © Beeldmateriaal Nederland / PDOK (CC BY 4.0)', license: null },
  { id: 'pdok-year', short: 'PDOK 年別', scope: 'regional', country: 'NL', name: LA('PDOK · Netherlands aerial photo by year (2016–2026)', 'PDOK · オランダ航空写真 年別（2016〜2026）'),
    coverage: [[3.2, 50.7, 7.3, 53.6]], zoom: [0, 20], resolutionM: (y) => (y >= 2021 ? 0.08 : 0.25), time: { mode: 'year', years: [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016], composite: false },
    capture: { kind: 'layer-date', text: LA('A national flight made in the chosen year (8 cm from 2021, 25 cm before).', '選んだ年に行われた全国撮影（2021 年以降は 8 cm、それ以前は 25 cm）。') },
    tiles: (y) => ['https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/' + y + '_' + (y >= 2021 ? 'orthoHR' : 'ortho25') + '/EPSG:3857/{z}/{x}/{y}.jpeg'], attribution: 'Luchtfoto © Beeldmateriaal Nederland / PDOK (CC BY 4.0)', license: null },

  { id: 'swisstopo', short: 'swisstopo', scope: 'regional', country: 'CH', name: LA('swisstopo · SWISSIMAGE', 'swisstopo · SWISSIMAGE'),
    coverage: [[5.9, 45.8, 10.6, 47.9]], zoom: [0, 20], resolutionM: 0.1, time: { mode: 'latest' },
    capture: { kind: 'declared', range: LA('rolling 3-year cycle', '3 年周期で更新'), text: LA('Switzerland is flown on a three-year cycle, so a place\'s picture is up to about three years old; the date per place is in swisstopo\'s metadata layer, not in the tiles.', 'スイスは 3 年周期で撮影されるため、場所ごとの画像は最大でおよそ 3 年前のものです。場所別の日付はタイルではなく swisstopo のメタデータにあります。') },
    tiles: () => ['https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg'], attribution: '© Data: swisstopo',
    license: { name: 'swisstopo / BGDI terms of use (free use, source "© Data: swisstopo")', url: 'https://www.geo.admin.ch/de/allgemeine-nutzungsbedingungen-bgdi', commercial: 'allowed', checked: '2026-11-20',
      note: 'The BGDI terms say the data are free to use, name the source, and treat a web app of ~20,000 users a day as fair use; high-frequency bots are not allowed. The per-dataset terms on geocat.ch were not read.' } },
].map((s) => {
  if (s.license === null) s.license = { name: 'CC BY 4.0', url: 'https://www.pdok.nl/introductie/-/article/pdok-luchtfoto-rgb-open-', commercial: 'allowed', checked: '2026-11-20', note: 'PDOK\'s dataset page says the open RGB aerial photos are free for any use under CC BY 4.0 (its copyright page lists commercial use as permitted).' };
  return s;
});

/* ── lookups ─────────────────────────────────────────────────────────────── */
export const sourceById = (id) => SOURCES.find((s) => s.id === id) || null;
const inBox = (lng, lat, b) => lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
export const covers = (s, lng, lat) => s.coverage.some((b) => inBox(lng, lat, b));
const resAt = (s, y) => (typeof s.resolutionM === 'function' ? s.resolutionM(y) : s.resolutionM);

/** The SAT_PROVIDERS rows (js/tables.js) for every declared source — the shape the satellite controller already reads. `LA` is IntMapLang.pickArgs(). */
export function imageryProviders() {
  return SOURCES.map((s) => {
    const t = s.time, p = { id: s.id, tier: 'free', short: s.short, name: LA(...s.name), maxzoom: s.zoom[1], minzoom: s.zoom[0], source: s,
      dated: t.mode === 'day' || t.mode === 'year', tiles: s.tiles };
    if (t.mode === 'day') p.dateMode = 'day';
    if (t.mode === 'year') { p.dateMode = 'year'; p.years = t.years; }
    if (t.mode === 'epoch') p.epoch = [t.from, t.to];
    if (s.attributionFn) Object.defineProperty(p, 'attribution', { get: s.attributionFn, enumerable: true }); else p.attribution = s.attribution;
    return p;
  });
}

/* ── Chronos: which date of THIS source answers a clock time? ───────────────────────────────────────────
   null = the source has no picture for that time. `exact:false` = the nearest year the source has (the label says so). */
export function pickForTime(s, iso, today) {
  today = today || TODAY();
  const t = s.time, y = +String(iso).slice(0, 4);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso)) || !isFinite(y)) return null;
  if (t.mode === 'latest') return iso >= today.slice(0, 4) + '-01-01' ? { exact: true } : null;   /* «latest» is the present year only */
  if (t.mode === 'day') { const to = t.to || today; return iso >= t.from && iso <= to ? { day: iso, exact: true } : null; }
  if (t.mode === 'epoch') return y >= t.from && y <= t.to ? { exact: true, epoch: true } : null;
  if (t.mode === 'year') {
    const ys = t.years, exact = ys.includes(y);
    if (exact) return { year: y, exact: true };
    const near = ys.slice().sort((a, b) => Math.abs(a - y) - Math.abs(b - y) || b - a)[0];
    return Math.abs(near - y) <= 2 ? { year: near, exact: false } : null;   /* two years either way; farther is a different picture, not «the same time» */
  }
  return null;
}

/** Every source that has a picture at (lng,lat) — best first for the asked time. `time` is an ISO date or null (now). */
export function rankAt({ lng, lat, zoom, time, today }) {
  today = today || TODAY();
  const iso = time || today, live = !time || time >= today.slice(0, 4) + '-01-01';
  const rows = [];
  for (const s of SOURCES) {
    if (!covers(s, lng, lat)) continue;
    const pick = pickForTime(s, iso, today); if (!pick) continue;
    const y = pick.year || +iso.slice(0, 4), res = resAt(s, y);
    const zoomFit = zoom == null ? true : (zoom >= s.zoom[0] - 0.5 && zoom <= s.zoom[1] + 3);
    rows.push({ id: s.id, source: s, pick, resolutionM: res, zoomFit, scope: s.scope, live });
  }
  rows.sort((a, b) => (b.pick.exact - a.pick.exact) || (b.zoomFit - a.zoomFit) || (a.resolutionM - b.resolutionM) || (a.scope === 'regional' ? -1 : 1) - (b.scope === 'regional' ? -1 : 1));
  return rows;
}

/* ── what the picture under a point is: date, sharpness, product, and whether that is MEASURED or only DECLARED ──────── */
export async function captureAt(s, { lng, lat, day, year }) {
  const k = s.capture.kind;
  if (k === 'service-query') {
    const r = await imageryCaptureAt(lng, lat);
    if (r) return { kind: 'measured', date: r.date, resolutionM: r.resolutionM, product: r.product };
    return { kind: 'unknown', resolutionM: resAt(s, null) };
  }
  if (k === 'layer-date') {
    const y = year || (day ? +String(day).slice(0, 4) : null);
    return { kind: 'chosen', date: s.time.mode === 'year' ? String(year) : day, resolutionM: resAt(s, y), composite: !!s.time.composite, text: s.capture.text || null };
  }
  return { kind: 'declared', range: s.capture.range || null, resolutionM: resAt(s, null), text: s.capture.text || null };
}

/** One readable line (lang 'jp' or anything else → en). */
export function captureLine(s, c, lang) {
  const T = (en, jp) => IntMapLang.t(lang, en, jp), fmtRes = (m) => m == null ? '' : (m < 1 ? Math.round(m * 100) + ' cm' : (m >= 1000 ? (m / 1000) + ' km' : (Math.round(m * 10) / 10) + ' m'));
  const parts = [];
  if (c.kind === 'measured') { parts.push(T('Captured ', '撮影 ') + String(c.date).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')); if (c.product) parts.push(c.product); }
  else if (c.kind === 'chosen') parts.push((s.time.mode === 'year' ? T('Year ', '撮影年 ') : T('Date ', '撮影日 ')) + c.date + (c.composite ? T(' (annual composite)', '（年次合成）') : ''));
  else if (c.kind === 'declared') parts.push(T('Taken ', '撮影時期 ') + ((c.range && IntMapLang.t(lang, c.range[0], c.range[1])) || T('unknown', '不明')));
  else parts.push(T('Capture date unknown', '撮影日 不明'));
  if (c.resolutionM != null) parts.push(T('about ', '解像度 約 ') + fmtRes(c.resolutionM) + T(' per pixel', ''));
  return parts.join(' · ');
}

/** Which supplier + date answers a Chronos time at a place: the current supplier if it has that time there, else the best one that does. null = no picture for that time. */
export function planClockMatch({ providerId, lng, lat, zoom, iso, today }) {
  const cur = sourceById(providerId);
  if (cur && covers(cur, lng, lat)) { const pick = pickForTime(cur, iso, today); if (pick) return { providerId: cur.id, pick, switched: false }; }
  const rows = rankAt({ lng, lat, zoom, time: iso, today });
  const r = rows.find((x) => x.zoomFit) || rows[0];
  return r ? { providerId: r.id, pick: r.pick, switched: r.id !== providerId } : null;
}
