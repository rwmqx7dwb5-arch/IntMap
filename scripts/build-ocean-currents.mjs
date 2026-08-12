#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUILD THE OCEAN-CURRENT LAYER — data/ocean-currents.json   (#R221)
 *  (#R222) …plus data/ocean-currents-field.bin.gz and data/ocean-currents-months.bin.gz
 * ----------------------------------------------------------------------------
 *  ⚠⚠ (#R222) 「海流レイヤーのquality, coverageを増強して」 — confirmed as
 *  「本数増＋格子0.5°＋季節（月別）」, and the three of those are three different builds:
 *
 *    1. THE NAMED LIST GREW from 61 to ~120 seeds — the marginal-sea and coastal currents an atlas
 *       plate has and this file did not (Tsugaru, Sōya, Liman, East Korea Warm, Taiwan Warm, Yellow
 *       Sea Warm, Vietnam Coastal, New Guinea Coastal, Costa Rica Coastal, Davidson, Yucatán,
 *       Guiana, Cape Horn, West Spitsbergen, North Cape, Baffin, Beaufort Gyre, Algerian, Rim,
 *       East African Coastal, the two India coastal currents, the two monsoon currents …).
 *    2. THE FIELD IS A GRID, NOT A LIST OF ARROWS. `arrows` (28,208 points at 1°, 700 kB of JSON)
 *       is replaced by data/ocean-currents-field.bin.gz — the source's OWN 0.25° grid, speed and
 *       bearing as one byte each, gzipped. The client strides that grid for whatever spacing the
 *       zoom asks for, so one file serves 2°, 1°, 0.5° and 0.25° and NOTHING is thinned away
 *       before it ships. (⚠ This is also why the layer got LIGHTER while gaining 16× the cells.)
 *    3. THE SEASON. data/ocean-currents-months.bin.gz carries twelve monthly climatologies on the
 *       0.5° grid — one per calendar month, each the mean of several years of THAT month — so the
 *       monsoon reversal (Somali Current, the two Indian monsoon currents, Davidson) is a thing the
 *       reader can watch happen rather than a sentence. It is fetched only if a month is chosen.
 *
 *  ⚠ THE ANNUAL AND THE MONTHLY FIELDS ARE BUILT FROM THE SAME PIPELINE at two resolutions: the
 *  annual one keeps the native 0.25° (it is what the named paths are traced through, and a western
 *  boundary current is four cells wide there), the monthly ones are requested WITH A STRIDE of 2 so
 *  twelve of them cost a quarter of what twelve native ones would. A season is a large-scale signal;
 *  0.5° resolves the monsoon reversal completely.
 *
 *  ── the #R221 round that built the annual field ─────────────────────────────────────────────
 *  「海流レイヤーのquality, coverageが悪すぎる。」
 *
 *  ── ⚠ WHAT WAS WRONG WITH #R208's DATASET, MEASURED ─────────────────────────────────────────
 *  The file this replaces was the mean of EIGHT five-day composites — forty days of one year —
 *  rounded onto a 1° grid, and every defect in the picture follows from those two numbers:
 *
 *    · forty days is not a climatology. Mesoscale eddies survive a 40-day mean almost intact, so
 *      the "current" the tracer followed was frequently an eddy. The Kuroshio's trace ENDED WHERE
 *      IT STARTED (138.2 E 30.5 N → 138.7 E 30.7 N, 181 points) because it had gone round a ring.
 *    · a 1° cell is 111 km. The Gulf Stream is ~100 km wide and the Agulhas ~80 km, so a single
 *      cell smeared each of them across its own width and most of the neighbouring water, which
 *      halves the mean speed. Below the tracer's own 4 cm/s floor it simply stopped: the Canary
 *      Current came out SIX points long (a 300 km stub for a 3,000 km current), California six,
 *      the North Atlantic Drift eleven, the Brazil Current nine.
 *    · 26 currents is not the world's ocean. The Leeuwin, Malvinas, Mozambique, Alaska, East
 *      Kamchatka, Tsushima, Guinea, Angola, Irminger, Norwegian, North Brazil, Antilles, Loop,
 *      Florida, Mindanao, Alaskan Stream, East Icelandic and the whole monsoon system were absent.
 *    · the flow field was thinned to 2° — one arrow every 220 km, 5,484 for the world ocean.
 *
 *  ── WHAT THIS BUILD DOES INSTEAD ────────────────────────────────────────────────────────────
 *    1. A CLIMATOLOGY, not a season: N fields spread evenly across the WHOLE served record, so
 *       every season and every year of it is represented and the eddies average out. With 36
 *       samples the mesoscale variance is down by a factor of six.
 *    2. THE NATIVE GRID. 0.25° (28 km) is kept all the way through — no rounding to 1° — so a
 *       western boundary current is four cells wide instead of one.
 *    3. THE TRACER KNOWS WHEN IT IS GOING ROUND IN A CIRCLE. A visited-cell map with a lockout,
 *       plus a closure test against the start, ends a trace at the eddy instead of drawing it.
 *    4. It may cross weak water. A current is not over because one cell is quiet; the walk carries
 *       a small budget of weak steps and only stops when they run out.
 *    5. Sixty-odd named currents, five languages each, seeded from published core positions.
 *    6. The field is emitted at 1°, not 2° — four times the arrows.
 *
 *  ── SOURCES (a ladder — the first one that answers is used, and the file records which) ──────
 *  · NOAA CoastWatch/PolarWatch `noaacwBLENDEDNRTcurrentsDaily` — sea-surface GEOSTROPHIC currents
 *    from multi-mission satellite altimetry (Sentinel-3A/B, CryoSat-2, Jason-2/3, SARAL), 0.25°
 *    global, daily, 2015→present. Data courtesy of NOAA; generated using AVISO+ products.
 *  · NASA/JPL OSCAR via NOAA `jplOscar` (1/3°) — TOTAL surface current (geostrophic + Ekman +
 *    buoyancy). Preferred when the server has it loaded; at the time of this build it answered
 *    404 «Currently unknown datasetID», so the ladder fell through to the altimetric product.
 *  · THE WIND-DRIVEN PART, when the velocity source is geostrophic only: NOAA NCEI blended sea
 *    surface WIND STRESS (0.25°), turned into a surface Ekman current by the empirical relation
 *    Ralph & Niiler (1999) fitted to surface drifters — |u_ek| = B·|τ|/(ρ√f), 55° cum sole. This
 *    is the same decomposition OSCAR itself is built from, and it is what makes the eastern
 *    boundary currents (Canary, California, Benguela, Peru) and the equatorial system appear at
 *    their real strength rather than as the residue altimetry alone can see.
 *  · The NAMES and one seed each are editorial — a name is a fact about the world and a seed is
 *    the published position of a current's core. ⚠ NO VERTEX IS EDITORIAL: every point of every
 *    path comes out of the measured field.
 *
 *      node scripts/build-ocean-currents.mjs            # full build
 *      node scripts/build-ocean-currents.mjs --epochs 12   # a quicker, noisier one
 * ==========================================================================*/
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'ocean-currents.json');
const OUT_FIELD = join(ROOT, 'data', 'ocean-currents-field.bin.gz');
const OUT_MONTHS = join(ROOT, 'data', 'ocean-currents-months.bin.gz');
const CACHE = join(ROOT, 'node_modules', '.cache', 'intmap-currents');
const UA = 'IntMap/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap) ocean-current-build';

const argv = process.argv.slice(2);
const argNum = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? +argv[i + 1] : d; };
const EPOCHS = argNum('--epochs', 36);         /* velocity fields averaged */
const WIND_EPOCHS = argNum('--wind-epochs', 24);
const SST_EPOCHS = argNum('--sst-epochs', 8);
const GRID = 0.25;                              /* the native grid, kept */
const NX = Math.round(360 / GRID), NY = Math.round(180 / GRID);
const BAND = 20;                                /* degrees of latitude per request */
/* (#R222) the seasonal build — twelve calendar months, each averaged over this many years */
const MON_EPOCHS = argNum('--month-epochs', 6);        /* velocity fields per calendar month */
const MON_WIND_EPOCHS = argNum('--month-wind-epochs', 6);
const MGRID = 0.5;                                     /* the monthly grid (stride 2 of the native) */
const MNX = Math.round(360 / MGRID), MNY = Math.round(180 / MGRID);
const MBAND = 40;                                      /* wider bands: a strided row is a quarter the bytes */
const MON_CONC = argNum('--conc', 4);                  /* parallel ERDDAP requests */
const SKIP_MONTHS = argv.includes('--no-months');
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/* ── the ladder ──────────────────────────────────────────────────────────────────────────── */
/* ⚠ WHY jplOscar IS NOT THE PRIMARY, EVEN THOUGH IT IS THE BETTER PHYSICS. OSCAR is the TOTAL
   surface current and this build would prefer it — but measured on the server this round: its
   served record is 117 five-day composites (2011-12 → 2014-09), a third of the years the altimetric
   set offers, and its 1/3° grid is COARSER than the 0.25° accumulator here, so 44 % of the cells
   would have no sample and the bilinear sampler would trace through holes. Its axes also run
   latitude DESCENDING and longitude 20…419, which is why the first run of this script asked it for
   36 fields and got 0 rows from every one of them without noticing. The Ekman term below is what
   recovers the part of the physics OSCAR would have brought. */
const VEL_SOURCES = [
  { id: 'noaacwBLENDEDNRTcurrentsDaily', base: 'https://polarwatch.noaa.gov/erddap/griddap/noaacwBLENDEDNRTcurrentsDaily',
    u: 'u_current', v: 'v_current', extra: '', lon360: false, kind: 'geostrophic',
    t0: '2015-01-15', t1: '2026-06-15', grid: 0.25,
    name: 'NOAA CoastWatch blended sea-surface geostrophic currents from satellite altimetry (0.25°, multi-mission: Sentinel-3A/B, CryoSat-2, Jason-2/3, SARAL)',
    note: 'geostrophic surface current from altimetry; the Ekman part is added separately' },
];
/* ── WARM OR COLD IS A TEMPERATURE, SO IT IS MEASURED AS ONE ────────────────────────────────────
   NOAA OISST v2.1 — daily optimum-interpolation SST, 0.25° global, 1981→present, on exactly the grid
   this build already uses. See the classification note in main() for why the previous derivation
   (the mean poleward component of the flow) could not answer this and what it got wrong. */
const SST_SOURCE = { id: 'ncdcOisst21Agg', base: 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg',
  x: 'sst', y: 'sst', single: true, extra: '[(0.0)]', lon360: true,
  name: 'NOAA OISST v2.1 daily sea-surface temperature (0.25°, AVHRR-only, final)' };
const WIND_SOURCE = { id: 'noaacwBlendedWindStressMonthly',
  base: 'https://polarwatch.noaa.gov/erddap/griddap/noaacwBlendedWindStressMonthly',
  x: 'x_tau', y: 'y_tau', extra: '[(10.0)]', lon360: true, t0: '1988-01-16', t1: '2025-12-16',
  name: 'NOAA NCEI blended sea-surface wind stress (0.25°, monthly, Version 2.0)' };

/* ── the named currents ──────────────────────────────────────────────────────────────────────
   [en, ja, de, ru, es, seedLng, seedLat]. Seeds are the published position of each current's
   CORE. They decide where a trace starts and nothing else; the geometry is the field's. */
const SEEDS = [
  /* ── North Atlantic ─────────────────────────────────────────────────────────────────────── */
  ['Gulf Stream', 'メキシコ湾流', 'Golfstrom', 'Гольфстрим', 'Corriente del Golfo', -73.5, 36.0],
  ['Florida Current', 'フロリダ海流', 'Floridastrom', 'Флоридское течение', 'Corriente de Florida', -79.6, 27.0],
  ['Antilles Current', 'アンティル海流', 'Antillenstrom', 'Антильское течение', 'Corriente de las Antillas', -72.0, 22.0],
  ['Caribbean Current', 'カリブ海流', 'Karibikstrom', 'Карибское течение', 'Corriente del Caribe', -76.0, 15.5],
  ['Loop Current', 'ループ海流', 'Loop Current', 'Петлевое течение', 'Corriente del Lazo', -85.5, 24.5],
  ['North Atlantic Current', '北大西洋海流', 'Nordatlantikstrom', 'Североатлантическое течение', 'Corriente del Atlántico Norte', -30.0, 48.0],
  ['Norwegian Current', 'ノルウェー海流', 'Norwegischer Strom', 'Норвежское течение', 'Corriente Noruega', 5.0, 65.0],
  ['Irminger Current', 'イルミンガー海流', 'Irmingerstrom', 'Течение Ирмингера', 'Corriente de Irminger', -27.0, 62.0],
  ['East Greenland Current', '東グリーンランド海流', 'Ostgrönlandstrom', 'Восточно-Гренландское течение', 'Corriente de Groenlandia Oriental', -25.0, 68.0],
  ['West Greenland Current', '西グリーンランド海流', 'Westgrönlandstrom', 'Западно-Гренландское течение', 'Corriente de Groenlandia Occidental', -52.0, 62.0],
  ['Labrador Current', 'ラブラドル海流', 'Labradorstrom', 'Лабрадорское течение', 'Corriente del Labrador', -55.0, 55.0],
  ['Canary Current', 'カナリア海流', 'Kanarenstrom', 'Канарское течение', 'Corriente de Canarias', -16.5, 26.0],
  ['Portugal Current', 'ポルトガル海流', 'Portugalstrom', 'Португальское течение', 'Corriente de Portugal', -12.0, 40.0],
  ['Azores Current', 'アゾレス海流', 'Azorenstrom', 'Азорское течение', 'Corriente de las Azores', -28.0, 34.0],
  ['North Equatorial Current (Atlantic)', '北赤道海流（大西洋）', 'Nordäquatorialstrom (Atlantik)', 'Северное пассатное течение (Атлантика)', 'Corriente Ecuatorial del Norte (Atlántico)', -40.0, 12.0],
  ['North Equatorial Counter Current (Atlantic)', '北赤道反流（大西洋）', 'Äquatorialer Gegenstrom (Atlantik)', 'Экваториальное противотечение (Атлантика)', 'Contracorriente Ecuatorial (Atlántico)', -25.0, 5.5],
  ['Guinea Current', 'ギニア海流', 'Guineastrom', 'Гвинейское течение', 'Corriente de Guinea', -3.0, 3.5],
  /* ── South Atlantic ─────────────────────────────────────────────────────────────────────── */
  ['South Equatorial Current (Atlantic)', '南赤道海流（大西洋）', 'Südäquatorialstrom (Atlantik)', 'Южное пассатное течение (Атлантика)', 'Corriente Ecuatorial del Sur (Atlántico)', -20.0, -6.0],
  ['North Brazil Current', '北ブラジル海流', 'Nordbrasilstrom', 'Северо-Бразильское течение', 'Corriente de Brasil Norte', -47.0, 2.0],
  ['Brazil Current', 'ブラジル海流', 'Brasilstrom', 'Бразильское течение', 'Corriente de Brasil', -42.0, -26.0],
  ['Malvinas (Falkland) Current', 'マルビナス海流（フォークランド海流）', 'Malwinenstrom (Falklandstrom)', 'Фолклендское течение', 'Corriente de Malvinas', -58.0, -45.0],
  ['Benguela Current', 'ベンゲラ海流', 'Benguelastrom', 'Бенгельское течение', 'Corriente de Benguela', 13.0, -30.0],
  ['Angola Current', 'アンゴラ海流', 'Angolastrom', 'Ангольское течение', 'Corriente de Angola', 11.0, -12.0],
  ['South Atlantic Current', '南大西洋海流', 'Südatlantikstrom', 'Южно-Атлантическое течение', 'Corriente del Atlántico Sur', -20.0, -40.0],
  /* ── North Pacific ──────────────────────────────────────────────────────────────────────── */
  ['Kuroshio', '黒潮', 'Kuroshio', 'Куросио', 'Corriente de Kuroshio', 132.0, 30.0],
  ['Kuroshio Extension', '黒潮続流', 'Kuroshio-Ausläufer', 'Продолжение Куросио', 'Extensión de Kuroshio', 145.0, 35.0],
  ['Tsushima Current', '対馬海流', 'Tsushimastrom', 'Цусимское течение', 'Corriente de Tsushima', 130.0, 34.5],
  ['Oyashio', '親潮', 'Oyashio', 'Оясио', 'Corriente de Oyashio', 148.0, 44.0],
  ['East Kamchatka Current', '東カムチャツカ海流', 'Ostkamtschatkastrom', 'Восточно-Камчатское течение', 'Corriente de Kamchatka Oriental', 162.0, 53.0],
  ['North Pacific Current', '北太平洋海流', 'Nordpazifikstrom', 'Северо-Тихоокеанское течение', 'Corriente del Pacífico Norte', -170.0, 42.0],
  ['Alaska Current', 'アラスカ海流', 'Alaskastrom', 'Аляскинское течение', 'Corriente de Alaska', -145.0, 57.0],
  ['Alaskan Stream', 'アラスカ環流', 'Alaskastromkern', 'Аляскинская струя', 'Corriente Alaskiana', -160.0, 53.0],
  ['California Current', 'カリフォルニア海流', 'Kalifornienstrom', 'Калифорнийское течение', 'Corriente de California', -126.0, 40.0],
  ['North Equatorial Current (Pacific)', '北赤道海流（太平洋）', 'Nordäquatorialstrom (Pazifik)', 'Северное пассатное течение (Тихий океан)', 'Corriente Ecuatorial del Norte (Pacífico)', -150.0, 13.0],
  ['North Equatorial Counter Current (Pacific)', '北赤道反流（太平洋）', 'Äquatorialer Gegenstrom (Pazifik)', 'Экваториальное противотечение (Тихий океан)', 'Contracorriente Ecuatorial (Pacífico)', -160.0, 6.0],
  ['Mindanao Current', 'ミンダナオ海流', 'Mindanaostrom', 'Минданаоское течение', 'Corriente de Mindanao', 127.5, 8.0],
  /* ── South Pacific ──────────────────────────────────────────────────────────────────────── */
  ['South Equatorial Current (Pacific)', '南赤道海流（太平洋）', 'Südäquatorialstrom (Pazifik)', 'Южное пассатное течение (Тихий океан)', 'Corriente Ecuatorial del Sur (Pacífico)', -150.0, -5.0],
  ['East Australian Current', '東オーストラリア海流', 'Ostaustralstrom', 'Восточно-Австралийское течение', 'Corriente de Australia Oriental', 154.0, -30.0],
  ['Peru (Humboldt) Current', 'ペルー海流（フンボルト海流）', 'Humboldtstrom (Perustrom)', 'Перуанское течение (Гумбольдта)', 'Corriente de Humboldt (del Perú)', -76.0, -16.0],
  ['Chile Current', 'チリ海流', 'Chilestrom', 'Чилийское течение', 'Corriente de Chile', -76.0, -35.0],
  ['South Pacific Current', '南太平洋海流', 'Südpazifikstrom', 'Южно-Тихоокеанское течение', 'Corriente del Pacífico Sur', -140.0, -45.0],
  ['Tasman Front', 'タスマン前線流', 'Tasmanfront', 'Тасманово течение', 'Frente de Tasmania', 158.0, -34.0],
  /* ── Indian Ocean ───────────────────────────────────────────────────────────────────────── */
  ['Agulhas Current', 'アガラス海流', 'Agulhasstrom', 'Течение Агульяс', 'Corriente de Agulhas', 31.0, -31.0],
  ['Agulhas Return Current', 'アガラス反流', 'Agulhas-Rückstrom', 'Обратное течение Агульяс', 'Corriente de Retorno de Agulhas', 30.0, -39.0],
  ['Mozambique Current', 'モザンビーク海流', 'Mosambikstrom', 'Мозамбикское течение', 'Мозамбикское течение', 40.0, -20.0],
  ['East Madagascar Current', '東マダガスカル海流', 'Ostmadagaskarstrom', 'Восточно-Мадагаскарское течение', 'Corriente de Madagascar Oriental', 49.0, -22.0],
  ['Somali Current', 'ソマリ海流', 'Somalistrom', 'Сомалийское течение', 'Corriente de Somalia', 52.5, 6.0],
  ['South Equatorial Current (Indian)', '南赤道海流（インド洋）', 'Südäquatorialstrom (Indik)', 'Южное пассатное течение (Индийский океан)', 'Corriente Ecuatorial del Sur (Índico)', 65.0, -12.0],
  ['Equatorial Counter Current (Indian)', '赤道反流（インド洋）', 'Äquatorialer Gegenstrom (Indik)', 'Экваториальное противотечение (Индийский океан)', 'Contracorriente Ecuatorial (Índico)', 70.0, -5.0],
  ['West Australian Current', '西オーストラリア海流', 'Westaustralstrom', 'Западно-Австралийское течение', 'Corriente de Australia Occidental', 108.0, -28.0],
  ['Leeuwin Current', 'リーウィン海流', 'Leeuwinstrom', 'Течение Леувин', 'Corriente de Leeuwin', 113.5, -30.0],
  ['South Java Current', '南ジャワ海流', 'Südjavastrom', 'Южно-Яванское течение', 'Corriente de Java Meridional', 105.0, -9.0],
  ['Indonesian Throughflow', 'インドネシア通過流', 'Indonesischer Durchstrom', 'Индонезийский сквозной поток', 'Flujo Indonesio', 118.0, -9.0],
  /* ── Southern Ocean & Arctic ────────────────────────────────────────────────────────────── */
  ['Antarctic Circumpolar Current (Atlantic)', '南極周極流（大西洋区）', 'Antarktischer Zirkumpolarstrom (Atlantik)', 'Антарктическое циркумполярное течение (Атлантика)', 'Corriente Circumpolar Antártica (Atlántico)', -30.0, -50.0],
  ['Antarctic Circumpolar Current (Indian)', '南極周極流（インド洋区）', 'Antarktischer Zirkumpolarstrom (Indik)', 'Антарктическое циркумполярное течение (Индийский океан)', 'Corriente Circumpolar Antártica (Índico)', 80.0, -50.0],
  ['Antarctic Circumpolar Current (Pacific)', '南極周極流（太平洋区）', 'Antarktischer Zirkumpolarstrom (Pazifik)', 'Антарктическое циркумполярное течение (Тихий океан)', 'Corriente Circumpolar Antártica (Pacífico)', -150.0, -58.0],
  ['Antarctic Circumpolar Current (Drake Passage)', '南極周極流（ドレーク海峡）', 'Antarktischer Zirkumpolarstrom (Drakestraße)', 'Антарктическое циркумполярное течение (пролив Дрейка)', 'Corriente Circumpolar Antártica (Paso de Drake)', -65.0, -58.0],
  ['Antarctic Coastal Current', '南極沿岸流', 'Antarktischer Küstenstrom', 'Антарктическое прибрежное течение', 'Corriente Costera Antártica', 100.0, -65.0],
  ['Weddell Gyre', 'ウェッデル環流', 'Weddellwirbel', 'Круговорот Уэдделла', 'Giro de Weddell', -30.0, -65.0],
  ['Ross Gyre', 'ロス環流', 'Rosswirbel', 'Круговорот Росса', 'Giro de Ross', -160.0, -68.0],
  ['East Icelandic Current', '東アイスランド海流', 'Ostislandstrom', 'Восточно-Исландское течение', 'Corriente de Islandia Oriental', -12.0, 67.0],
  /* ══ (#R222) THE SECOND HALF OF THE PLATE ═════════════════════════════════════════════════════
     「海流レイヤーのquality, coverageを増強して」 — the 61 above are the currents a world map draws
     at the scale of an ocean. These are the ones it draws at the scale of a COAST: the marginal-sea
     and shelf currents, the monsoon system, and the polar branches. Every seed is a published core
     position, exactly as above, and a seed whose field does not support a trace is dropped by the
     build with a line saying so — nothing here is drawn from a name alone. */
  /* ── North Atlantic & Arctic ─────────────────────────────────────────────────────────────── */
  ['West Spitsbergen Current', '西スピッツベルゲン海流', 'Westspitzbergenstrom', 'Западно-Шпицбергенское течение', 'Corriente de Spitsbergen Occidental', 10.0, 78.0],
  ['North Cape Current', '北岬海流', 'Nordkapstrom', 'Нордкапское течение', 'Corriente del Cabo Norte', 22.0, 71.5],
  ['Norwegian Coastal Current', 'ノルウェー沿岸流', 'Norwegischer Küstenstrom', 'Норвежское прибрежное течение', 'Corriente Costera Noruega', 8.0, 63.0],
  ['Baffin Island Current', 'バフィン島海流', 'Baffinstrom', 'Баффиново течение', 'Corriente de la Isla de Baffin', -62.0, 68.0],
  ['Beaufort Gyre', 'ボーフォート環流', 'Beaufortwirbel', 'Круговорот Бофорта', 'Giro de Beaufort', -145.0, 76.0],
  ['Nova Scotia Current', 'ノバスコシア海流', 'Neuschottlandstrom', 'Новошотландское течение', 'Corriente de Nueva Escocia', -63.0, 43.5],
  ['Yucatán Current', 'ユカタン海流', 'Yucatánstrom', 'Юкатанское течение', 'Corriente de Yucatán', -86.0, 21.5],
  ['Guiana Current', 'ギアナ海流', 'Guayanastrom', 'Гвианское течение', 'Corriente de Guayana', -52.0, 7.0],
  ['Mauritania Current', 'モーリタニア海流', 'Mauretanienstrom', 'Мавританское течение', 'Corriente de Mauritania', -18.0, 17.0],
  ['Iberian Poleward Current', 'イベリア極向流', 'Iberischer Polwärtsstrom', 'Иберийское полярное течение', 'Corriente Ibérica hacia el Polo', -9.5, 42.0],
  /* ── the Mediterranean and the Black Sea ─────────────────────────────────────────────────── */
  ['Algerian Current', 'アルジェリア海流', 'Algerienstrom', 'Алжирское течение', 'Corriente Argelina', 3.0, 37.5],
  ['Liguro-Provençal Current', 'リグリア・プロヴァンス海流', 'Ligurisch-Provenzalischer Strom', 'Лигуро-Прованское течение', 'Corriente Liguro-Provenzal', 7.5, 43.3],
  ['Asia Minor Current', '小アジア海流', 'Kleinasienstrom', 'Малоазиатское течение', 'Corriente de Asia Menor', 30.0, 35.5],
  ['Black Sea Rim Current', '黒海周縁流', 'Randstrom des Schwarzen Meeres', 'Основное Черноморское течение', 'Corriente Perimetral del Mar Negro', 34.0, 43.5],
  /* ── the north-western Pacific and its marginal seas ─────────────────────────────────────── */
  ['Tsugaru Current', '津軽暖流', 'Tsugarustrom', 'Цугарское течение', 'Corriente de Tsugaru', 141.5, 41.5],
  ['Sōya Current', '宗谷暖流', 'Sōyastrom', 'Течение Соя', 'Corriente de Sōya', 142.5, 45.3],
  ['East Sakhalin Current', '東サハリン海流', 'Ostsachalinstrom', 'Восточно-Сахалинское течение', 'Corriente de Sajalín Oriental', 144.0, 51.0],
  ['Liman Current', 'リマン海流', 'Limanstrom', 'Приморское течение', 'Corriente de Liman', 135.0, 44.0],
  ['East Korea Warm Current', '東朝鮮暖流', 'Ostkoreanischer Warmstrom', 'Восточно-Корейское тёплое течение', 'Corriente Cálida de Corea Oriental', 130.0, 37.0],
  ['North Korea Cold Current', '北朝鮮寒流', 'Nordkoreanischer Kaltstrom', 'Северо-Корейское холодное течение', 'Corriente Fría de Corea del Norte', 130.5, 40.5],
  ['Yellow Sea Warm Current', '黄海暖流', 'Gelbmeer-Warmstrom', 'Тёплое течение Жёлтого моря', 'Corriente Cálida del Mar Amarillo', 124.0, 34.0],
  ['China Coastal Current', '中国沿岸流', 'Chinesischer Küstenstrom', 'Китайское прибрежное течение', 'Corriente Costera de China', 121.5, 31.0],
  ['Taiwan Warm Current', '台湾暖流', 'Taiwan-Warmstrom', 'Тайваньское тёплое течение', 'Corriente Cálida de Taiwán', 122.0, 25.5],
  ['Ryukyu Current', '琉球海流', 'Ryukyustrom', 'Течение Рюкю', 'Corriente de Ryukyu', 128.0, 26.0],
  ['Kuroshio Counter Current', '黒潮反流', 'Kuroshio-Gegenstrom', 'Противотечение Куросио', 'Contracorriente de Kuroshio', 138.0, 28.0],
  ['Subtropical Counter Current (Pacific)', '亜熱帯反流（太平洋）', 'Subtropischer Gegenstrom (Pazifik)', 'Субтропическое противотечение (Тихий океан)', 'Contracorriente Subtropical (Pacífico)', 135.0, 21.0],
  ['Vietnam Coastal Current', 'ベトナム沿岸流', 'Vietnamesischer Küstenstrom', 'Вьетнамское прибрежное течение', 'Corriente Costera de Vietnam', 110.0, 12.0],
  /* ── the north-eastern Pacific ───────────────────────────────────────────────────────────── */
  ['Bering Slope Current', 'ベーリング陸棚斜面流', 'Beringschelfstrom', 'Беринговоморское склоновое течение', 'Corriente del Talud de Bering', -177.0, 57.0],
  ['Aleutian North Slope Current', 'アリューシャン北斜面流', 'Aleuten-Nordhangstrom', 'Северо-Алеутское склоновое течение', 'Corriente del Talud Norte de las Aleutianas', -168.0, 53.5],
  ['Anadyr Current', 'アナディル海流', 'Anadyrstrom', 'Анадырское течение', 'Corriente de Anadyr', -176.0, 63.0],
  ['Alaska Coastal Current', 'アラスカ沿岸流', 'Alaskischer Küstenstrom', 'Аляскинское прибрежное течение', 'Corriente Costera de Alaska', -150.0, 59.0],
  ['Davidson Current', 'デービッドソン海流', 'Davidsonstrom', 'Течение Дэвидсона', 'Corriente de Davidson', -124.5, 44.0],
  ['Costa Rica Coastal Current', 'コスタリカ沿岸流', 'Costa-Rica-Küstenstrom', 'Коста-риканское прибрежное течение', 'Corriente Costera de Costa Rica', -90.0, 10.0],
  ['Hawaiian Lee Counter Current', 'ハワイ風下反流', 'Hawaii-Lee-Gegenstrom', 'Подветренное противотечение Гавайев', 'Contracorriente de Sotavento de Hawái', -175.0, 19.5],
  /* ── the south-western Pacific ───────────────────────────────────────────────────────────── */
  ['South Equatorial Counter Current (Pacific)', '南赤道反流（太平洋）', 'Südäquatorialer Gegenstrom (Pazifik)', 'Южное экваториальное противотечение (Тихий океан)', 'Contracorriente Ecuatorial del Sur (Pacífico)', -170.0, -8.0],
  ['New Guinea Coastal Current', 'ニューギニア沿岸流', 'Neuguinea-Küstenstrom', 'Новогвинейское прибрежное течение', 'Corriente Costera de Nueva Guinea', 145.0, -5.0],
  ['North Caledonian Jet', '北ニューカレドニア・ジェット', 'Nordkaledonischer Jet', 'Северо-Каледонская струя', 'Chorro de Nueva Caledonia Norte', 163.0, -18.0],
  ['East Auckland Current', '東オークランド海流', 'Ostaucklandstrom', 'Восточно-Оклендское течение', 'Corriente de Auckland Oriental', 176.0, -36.0],
  ['Southland Current', 'サウスランド海流', 'Southlandstrom', 'Течение Саутленд', 'Corriente de Southland', 172.0, -46.5],
  ['Cape Horn Current', 'ホーン岬海流', 'Kap-Hoorn-Strom', 'Течение мыса Горн', 'Corriente del Cabo de Hornos', -73.0, -55.0],
  /* ── the Indian Ocean and the monsoon system ─────────────────────────────────────────────── */
  ['Monsoon Current (Indian Ocean)', 'モンスーン海流（インド洋）', 'Monsunstrom (Indik)', 'Муссонное течение (Индийский океан)', 'Corriente Monzónica (Índico)', 78.0, 5.0],
  ['East African Coastal Current', '東アフリカ沿岸流', 'Ostafrikanischer Küstenstrom', 'Восточно-Африканское прибрежное течение', 'Corriente Costera de África Oriental', 41.0, -6.0],
  ['West India Coastal Current', '西インド沿岸流', 'Westindischer Küstenstrom', 'Западно-Индийское прибрежное течение', 'Corriente Costera de la India Occidental', 72.0, 13.0],
  ['East India Coastal Current', '東インド沿岸流', 'Ostindischer Küstenstrom', 'Восточно-Индийское прибрежное течение', 'Corriente Costera de la India Oriental', 82.0, 15.0],
  ['Ras al Hadd Jet', 'ラス・アル・ハッド・ジェット', 'Ras-al-Hadd-Jet', 'Струя Рас-эль-Хадд', 'Chorro de Ras al Hadd', 59.5, 22.0],
  ['South Indian Counter Current', '南インド反流', 'Südindischer Gegenstrom', 'Южно-Индийское противотечение', 'Contracorriente del Índico Sur', 80.0, -25.0],
  ['Eastern Gyral Current', '東部環流流', 'Östlicher Gyralstrom', 'Восточное круговоротное течение', 'Corriente Giral Oriental', 108.0, -17.0],
  ['Flinders Current', 'フリンダース海流', 'Flindersstrom', 'Течение Флиндерса', 'Corriente de Flinders', 135.0, -36.0],
  /* ── the Southern Ocean ──────────────────────────────────────────────────────────────────── */
  ['Prydz Bay Gyre', 'プリッツ湾環流', 'Prydz-Bucht-Wirbel', 'Круговорот залива Прюдс', 'Giro de la Bahía de Prydz', 75.0, -67.0],
];

/* ══ the accumulator — one global 0.25° grid of Σu, Σv, n ══════════════════════════════════ */
const su = new Float64Array(NX * NY), sv = new Float64Array(NX * NY), sn = new Int32Array(NX * NY);
const ix = (lng) => { let x = Math.floor((((lng + 180) % 360 + 360) % 360) / GRID); return x >= NX ? NX - 1 : x; };
const iy = (lat) => { let y = Math.floor((lat + 90) / GRID); return y < 0 ? 0 : (y >= NY ? NY - 1 : y); };

/* Ekman accumulator (wind stress) — same grid */
const tx = new Float64Array(NX * NY), ty = new Float64Array(NX * NY), tn = new Int32Array(NX * NY);

/* ⚠ ERDDAP SELECTS A GRID AXIS BY VALUE ONLY WHEN THE VALUE IS ON THE AXIS. `[(2006-12-31)]` on a
   MONTHLY dataset whose stamps are the 16th answers 404 «Your query produced no matching results»,
   which is the same status code as «Currently unknown datasetID» — so a build that reads the status
   alone concludes the dataset is missing and silently drops the whole Ekman term. That is exactly
   what the first run of this script did. The axis is therefore READ ONCE and selected BY INDEX,
   which is exact for every cadence, and the two 404s are told apart by their message. */
async function timeAxis(src) {
  const t = await getText(`${src.base}.csv?time`);
  if (t == null) return null;
  return t.split('\n').slice(2).map((s) => s.trim()).filter(Boolean);
}
function spread(list, n) {
  if (list.length <= n) return list.map((_, i) => i);
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.round((list.length - 1) * (i + 0.5) / n));
  return out;
}

async function getText(url, tries = 3) {
  let last = null;
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.ok) return await r.text();
      last = 'HTTP ' + r.status;
      if (r.status === 404) {
        const msg = await r.text().catch(() => '');
        /* null = the dataset is not on this server right now → the ladder moves down.
           ''   = the dataset is fine, this particular slice has no rows → skip the slice. */
        return /unknown datasetID/i.test(msg) ? null : '';
      }
    } catch (e) { last = (e && e.message) || String(e); }
    await new Promise((r) => setTimeout(r, 1500 * (k + 1)));
  }
  throw new Error(last || 'fetch failed');
}

/* one CSV band → accumulator. ERDDAP writes the AXES first and the two requested variables last,
   so a 3-axis dataset gives time,lat,lon,a,b and a 4-axis one time,depth,lat,lon,a,b. Counting
   from the END rather than the start is what makes one parser serve both — and it is the reason
   the first version of this build read the DEPTH column as a latitude on the wind-stress set. */
/* `single` = the source has ONE variable (SST). ERDDAP rejects `sst[…],sst[…]` with a 400, so a
   single-variable set is asked for once and the value is accumulated into A alone. */
function accumulate(csv, A, B, N, single) {
  if (!csv) return 0;
  let used = 0, i = 0;
  const len = csv.length;
  /* skip the two header lines */
  for (let k = 0; k < 2; k++) { const j = csv.indexOf('\n', i); if (j < 0) return 0; i = j + 1; }
  while (i < len) {
    let j = csv.indexOf('\n', i); if (j < 0) j = len;
    const line = csv.slice(i, j); i = j + 1;
    if (line.length < 12) continue;
    const c = line.split(',');
    const n = c.length;
    if (n < 4) continue;
    const lat = single ? +c[n - 3] : +c[n - 4], lon = single ? +c[n - 2] : +c[n - 3];
    const a = single ? +c[n - 1] : +c[n - 2], b = single ? 0 : +c[n - 1];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;     /* NaN = land / no retrieval */
    const k = iy(lat) * NX + ix(lon);
    A[k] += a; if (!single) B[k] += b; N[k]++; used++;
  }
  return used;
}

/* ⚠ THE LONGITUDE AXIS IS TAKEN WHOLE, WITH `[]`. Writing a value range for it means guessing the
   axis's own end points, and ERDDAP rejects a stop past the last cell centre rather than clamping:
   the wind-stress set ends at 359.75, so `[(0.1):(359.9)]` answered 404 «is greater than the axis
   maximum» for every one of the 24 epochs — and because that 404 is the SAME status as "no rows",
   the build reported "0k cells" 24 times and shipped without the Ekman term. `[]` cannot be wrong. */
async function sweep(src, tIdx, A, B, N) {
  let used = 0;
  for (let s = -80; s < 82; s += BAND) {
    const s1 = Math.min(82, s + BAND) - 1e-3;
    const sel = `[${tIdx}]${src.extra || ''}[(${s}):(${s1})][]`;
    const a = src.u || src.x, b = src.v || src.y;
    const url = `${src.base}.csv?${a}${sel}` + (src.single ? '' : `,${b}${sel}`);
    const t = await getText(url);
    if (t == null) return -1;                                       /* dataset gone */
    used += accumulate(t, A, B, N, !!src.single);
  }
  return used;
}

/* ══ (#R222) THE SEASONAL BUILD ═══════════════════════════════════════════════════════════════
   Twelve calendar months, each the mean of MON_EPOCHS different YEARS of that month, on the 0.5°
   grid. Two things make twelve fields affordable where one native field is already 50 MB of CSV:

     · ERDDAP STRIDES ON THE SERVER. `[(lat0):2:(lat1)][0:2:last]` returns every other cell of each
       axis, so a monthly field costs a QUARTER of a native one and arrives already at 0.5°.
     · THE REQUESTS RUN IN PARALLEL (MON_CONC at a time). ERDDAP's cost is mostly its own latency;
       four in flight is polite to the server and turns half a day into half an hour.

   ⚠ THE MONTH IS TAKEN FROM THE AXIS STAMP, NOT FROM AN INDEX GUESS. The daily set has gaps and the
   monthly wind set is stamped on the 16th, so grouping the axis by `date.getUTCMonth()` and then
   spreading the picks across the YEARS inside each group is the only construction that gives every
   month the same number of samples without assuming a cadence. */
const mix = (lng) => { let x = Math.floor((((lng + 180) % 360 + 360) % 360) / MGRID); return x >= MNX ? MNX - 1 : x; };
const miy = (lat) => { let y = Math.floor((lat + 90) / MGRID); return y < 0 ? 0 : (y >= MNY ? MNY - 1 : y); };

function accumulateM(csv, A, B, N, single) {
  if (!csv) return 0;
  let used = 0, i = 0;
  const len = csv.length;
  for (let k = 0; k < 2; k++) { const j = csv.indexOf('\n', i); if (j < 0) return 0; i = j + 1; }
  while (i < len) {
    let j = csv.indexOf('\n', i); if (j < 0) j = len;
    const line = csv.slice(i, j); i = j + 1;
    if (line.length < 12) continue;
    const c = line.split(',');
    const n = c.length;
    if (n < 4) continue;
    const lat = single ? +c[n - 3] : +c[n - 4], lon = single ? +c[n - 2] : +c[n - 3];
    const a = single ? +c[n - 1] : +c[n - 2], b = single ? 0 : +c[n - 1];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const k = miy(lat) * MNX + mix(lon);
    A[k] += a; if (!single) B[k] += b; N[k]++; used++;
  }
  return used;
}

/* how long the longitude axis is, so `[0:2:last]` can be written without guessing its end — the
   #R221 lesson about `[(0.1):(359.9)]` in a different shape (a stop past the last cell is a 404). */
const lonLenCache = Object.create(null);
async function lonLen(src) {
  if (lonLenCache[src.id] != null) return lonLenCache[src.id];
  const t = await getText(`${src.base}.csv?longitude`);
  const n = t ? t.split('\n').slice(2).filter((s) => s.trim()).length : 0;
  lonLenCache[src.id] = n;
  return n;
}

/* a bounded-concurrency map. Nothing clever: N workers pulling from one cursor. */
async function pmap(items, conc, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, conc) }, worker));
  return out;
}

/* one strided band of one time index → a monthly accumulator */
async function bandM(src, tIdx, s, s1, lastLon, A, B, N) {
  const sel = `[${tIdx}]${src.extra || ''}[(${s}):2:(${s1})][0:2:${lastLon}]`;
  const a = src.u || src.x, b = src.v || src.y;
  const url = `${src.base}.csv?${a}${sel}` + (src.single ? '' : `,${b}${sel}`);
  const t = await getText(url);
  if (t == null) return -1;
  return accumulateM(t, A, B, N, !!src.single);
}

/* group an ERDDAP time axis by calendar month and pick `n` of each, spread across the years */
function byMonth(axis, n) {
  const g = Array.from({ length: 12 }, () => []);
  axis.forEach((s, i) => {
    const d = new Date(s);
    if (!isFinite(+d)) return;
    g[d.getUTCMonth()].push(i);
  });
  return g.map((list) => spread(list, n).map((k) => list[k]));
}

/* ══ the sampler — bilinear over the mean field, skipping land ═════════════════════════════ */
function makeSampler(mu, mv, mn) {
  const at = (x, y) => {
    if (y < 0 || y >= NY) return null;
    x = ((x % NX) + NX) % NX;
    const k = y * NX + x;
    return mn[k] ? { u: mu[k], v: mv[k] } : null;
  };
  return (lng, lat) => {
    const fx = (((lng + 180) % 360 + 360) % 360) / GRID - 0.5, fy = (lat + 90) / GRID - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    let u = 0, v = 0, w = 0;
    for (const dy of [0, 1]) for (const dx of [0, 1]) {
      const c = at(x0 + dx, y0 + dy); if (!c) continue;
      const ww = (dx ? ax : 1 - ax) * (dy ? ay : 1 - ay);
      if (ww <= 0) continue;
      u += c.u * ww; v += c.v * ww; w += ww;
    }
    return w > 0.2 ? { u: u / w, v: v / w } : null;
  };
}

/* ⚠ A SEED IS "THE CURRENT IS AROUND HERE", NOT A VERTEX. Published core positions land on a cell
   the mean calls land, or in a lull beside a coast. The seed is snapped to the strongest flow in
   the nearest ring that has one — the name still says which current it is, the field still says
   where it goes. */
function snap(sample, lng0, lat0, maxDeg = 4) {
  const STEP = GRID;
  let best = null;
  for (let d = 0; d <= maxDeg / STEP; d++) {
    for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (d && Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const lo = lng0 + dx * STEP, la = lat0 + dy * STEP;
      if (la < -80 || la > 82) continue;
      const s = sample(lo, la); if (!s) continue;
      const sp = Math.hypot(s.u, s.v); if (sp < 0.035) continue;
      if (!best || sp > best.sp) best = { lng: lo, lat: la, sp };
    }
    if (best) return best;
  }
  return null;
}

/* ══ THE TRACER ═══════════════════════════════════════════════════════════════════════════════
   RK2 through the mean field, 25 km steps, up to 5,000 km each way from the seed, with the three
   things #R208's version did not have:
     · A VISITED MAP with a lockout. Every 0.25° cell the walk enters is stamped with its step
       number; re-entering a cell that was stamped more than LOCKOUT steps ago is a closed loop
       and the walk stops there. That is what ends the Kuroshio at Japan instead of drawing a ring.
     · A WEAK-WATER BUDGET. One quiet cell does not end a current. The walk may cross up to
       WEAK_MAX consecutive cells below the floor, and if it finds fast water again it keeps the
       crossing; if it does not, the trailing weak part is trimmed off.
     · A CLOSURE TEST against the start, so a gyre that comes back around is cut where it closes. */
/* ⚠ THE FLOOR IS LOWER THAN #R208's 4 cm/s BECAUSE THE FIELD IS SMOOTHER. A forty-day mean on a 1°
   grid at 4 cm/s is mostly eddy residue; a 28-epoch mean over eleven years on a 0.25° grid is the
   climatological flow, and the eastern boundary currents genuinely run at 5–8 cm/s — the Canary at
   its own published core measures 0.05 m/s here. A 3.5 cm/s floor is what cut it off at 369 km, i.e.
   the floor was deciding the answer for exactly the currents whose coverage was complained about.
   The weak budget is also longer: 12 steps is 300 km of slow water, which a boundary current really
   does cross between its wind-driven segments, and the trailing weak part is trimmed off anyway. */
const STEP_KM = 25, MAX_STEPS = 240, LOCKOUT = 12, WEAK_MAX = 12, WEAK_MS = 0.012, FLOOR_MS = 0.022;
function trace(sample, lng0, lat0) {
  const walk = (dir) => {
    const pts = [];
    const seen = new Map();
    let lng = lng0, lat = lat0, weak = 0, lastStrong = 0;
    for (let i = 0; i < MAX_STEPS; i++) {
      const s = sample(lng, lat); if (!s) break;
      const sp = Math.hypot(s.u, s.v);
      if (sp < WEAK_MS) break;                               /* genuinely still water: stop */
      if (sp < FLOOR_MS) { if (++weak > WEAK_MAX) break; } else { weak = 0; lastStrong = pts.length + 1; }
      const kmLat = 110.574, kmLng = 111.320 * Math.max(0.08, Math.cos(lat * Math.PI / 180));
      const h = (STEP_KM / 2) * dir;
      const mlng = lng + (s.u / sp) * h / kmLng, mlat = lat + (s.v / sp) * h / kmLat;
      const m = sample(mlng, mlat); if (!m) break;
      const msp = Math.hypot(m.u, m.v); if (msp < WEAK_MS) break;
      const H = STEP_KM * dir;
      lng += (m.u / msp) * H / kmLng;
      lat += (m.v / msp) * H / kmLat;
      if (lat > 82 || lat < -79) break;
      lng = ((lng + 180) % 360 + 360) % 360 - 180;
      if (pts.length && Math.abs(lng - pts[pts.length - 1][0]) > 180) break;   /* not across the seam */
      /* the loop detector */
      const key = iy(lat) * NX + ix(lng);
      const prev = seen.get(key);
      if (prev != null && i - prev > LOCKOUT) break;
      if (prev == null) seen.set(key, i);
      /* the closure test: back within 60 km of the seed after a real journey */
      if (i > LOCKOUT * 2) {
        const dLat = (lat - lat0) * 110.574, dLng = (lng - lng0) * kmLng;
        if (Math.hypot(dLat, dLng) < 60) { pts.push([+lng.toFixed(3), +lat.toFixed(3), +msp.toFixed(3), +(Math.sign(lat) * m.v).toFixed(4)]); break; }
      }
      pts.push([+lng.toFixed(3), +lat.toFixed(3), +msp.toFixed(3), +(Math.sign(lat) * m.v).toFixed(4)]);
    }
    return pts.slice(0, Math.max(lastStrong, 0));            /* trim a weak tail */
  };
  const back = walk(-1).reverse(), fwd = walk(1);
  const seed = sample(lng0, lat0);
  const mid = [lng0, lat0, seed ? +Math.hypot(seed.u, seed.v).toFixed(3) : 0, seed ? +(Math.sign(lat0) * seed.v).toFixed(4) : 0];
  return back.concat([mid], fwd);
}

/* Douglas–Peucker on the sphere, so a 400-point trace ships as the ~120 points that draw the same
   line. The tolerance is 8 km — a quarter of the grid cell the vertices came out of, i.e. below
   the resolution of the claim. */
/* ⚠ NOT HERON'S FORMULA. The triangles a traced current makes are extremely thin — the whole point
   of the test is that the middle point is nearly ON the chord — and Heron subtracts two nearly equal
   numbers there, so `s−ab` cancels to noise and the perpendicular distance comes back 0. Measured on
   the first run: the Drake Passage sector collapsed from a hundred vertices to TWO while still
   reporting 4,198 km. The projected cross-track distance below has no cancellation. */
function simplify(path, tolKm = 8) {
  if (path.length < 3) return path;
  const KM = 111.320, D = Math.PI / 180;
  const cosRef = Math.cos(path[Math.floor(path.length / 2)][1] * D);
  const xy = path.map((p) => [p[0] * KM * Math.max(0.05, cosRef), p[1] * 110.574]);
  const keep = new Uint8Array(path.length); keep[0] = keep[path.length - 1] = 1;
  const stack = [[0, path.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    const A = xy[i0], B = xy[i1];
    const vx = B[0] - A[0], vy = B[1] - A[1], vv = vx * vx + vy * vy;
    let far = -1, fd = 0;
    for (let i = i0 + 1; i < i1; i++) {
      const P = xy[i], wx = P[0] - A[0], wy = P[1] - A[1];
      let d;
      if (vv < 1e-9) d = Math.hypot(wx, wy);
      else { const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv));
        d = Math.hypot(wx - t * vx, wy - t * vy); }
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0 && fd > tolKm) { keep[far] = 1; stack.push([i0, far], [far, i1]); }
  }
  return path.filter((_, i) => keep[i]);
}

/* ══ (#R222) THE FIELD IS A GRID FILE, NOT A LIST OF ARROWS ═══════════════════════════════════
   #R219–#R221 shipped the field as `arrows` — a JSON array of [lng, lat, bearing, speed], thinned
   to 1° because 0.25° would have been 700,000 rows of it. That format pays for four numbers per
   cell in text AND it decides the spacing at BUILD time, which is the wrong place: the reader's
   zoom is what should decide how far apart two arrows are.

   A regular grid pays for two BYTES per cell and lets the client choose its own stride — 2°, 1°,
   0.5°, 0.25° are `stride = 8, 4, 2, 1` over the same array — so one file serves every zoom and
   the finest detail the source has is on the device. Measured: 1,036,800 cells at 0.25° is 2.07 MB
   raw and gzips to a fraction of the 700 kB of JSON it replaces, with SIXTEEN times the cells.

   ⚠ SPEED IS STORED THROUGH A SQUARE ROOT. A linear byte over 0–2.5 m/s would quantise at 1 cm/s
   everywhere, which is coarse exactly where the field is interesting (the 3–10 cm/s eastern
   boundary currents this round is meant to make legible). sqrt puts the resolution where the
   density of the data is: 0.05 cm/s at the low end, 2 cm/s at the Gulf Stream's core.
   ⚠ SPEED 0 MEANS "NOTHING HERE" — land, ice, or below the 3 cm/s floor the layer draws at — and
   the bearing byte is zeroed with it so the gzip window sees runs rather than noise. */
const SP_MAX = 2.5;
function encodePlanes(planes, nx, ny, gridDeg) {
  const head = Buffer.alloc(16);
  head.write('IMOC', 0, 'ascii');
  head.writeUInt8(1, 4);                       /* format version */
  head.writeUInt8(planes.length, 5);
  head.writeUInt16LE(nx, 6);
  head.writeUInt16LE(ny, 8);
  head.writeUInt16LE(Math.round(gridDeg * 1000), 10);
  head.writeUInt16LE(Math.round(SP_MAX * 1000), 12);
  head.writeUInt16LE(0, 14);
  const parts = [head];
  for (const p of planes) {
    const n = nx * ny;
    const sp = Buffer.alloc(n), br = Buffer.alloc(n);
    for (let k = 0; k < n; k++) {
      const s = p.speed[k];
      if (!(s > 0.03)) continue;                /* the floor the layer draws at */
      sp[k] = Math.max(1, Math.min(255, Math.round(255 * Math.sqrt(Math.min(s, SP_MAX) / SP_MAX))));
      br[k] = Math.round((((p.bearing[k] % 360) + 360) % 360) / 360 * 255) & 255;
    }
    parts.push(sp, br);
  }
  return Buffer.concat(parts);
}
/* u/v (east/north, m/s) on a grid → the speed + bearing planes the encoder wants */
function planeOf(u, v, n, cells) {
  const speed = new Float32Array(cells), bearing = new Float32Array(cells);
  for (let k = 0; k < cells; k++) {
    if (!n[k]) continue;
    const uu = u[k], vv = v[k];
    speed[k] = Math.hypot(uu, vv);
    bearing[k] = Math.atan2(uu, vv) * 180 / Math.PI;   /* 0 = north, clockwise — the map's own convention */
  }
  return { speed, bearing };
}

async function main() {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const meanFile = join(CACHE, `mean-${GRID}-${EPOCHS}.json`);

  let src = null, epochsUsed = 0, dates = [];
  if (existsSync(meanFile)) {
    const c = JSON.parse(readFileSync(meanFile, 'utf8'));
    src = VEL_SOURCES.find((s) => s.id === c.srcId) || VEL_SOURCES[0];
    epochsUsed = c.epochs; dates = c.dates || [];
    const A = c.u, B = c.v, N = c.n;
    for (let k = 0; k < NX * NY; k++) { su[k] = A[k]; sv[k] = B[k]; sn[k] = N[k]; }
    console.log(`cached mean field: ${src.id}, ${epochsUsed} epochs`);
  } else {
    for (const s of VEL_SOURCES) {
      console.log(`\ntrying ${s.id} …`);
      const axis = await timeAxis(s);
      if (!axis || !axis.length) { console.log('  — not loaded on this server, moving down the ladder'); continue; }
      const idx = spread(axis, EPOCHS);
      console.log(`  ${axis.length} fields on the record; taking ${idx.length} spread across ${axis[0].slice(0, 10)}…${axis[axis.length - 1].slice(0, 10)}`);
      dates = idx.map((i) => axis[i].slice(0, 10));
      let ok = 0, dead = false;
      for (let i = 0; i < idx.length; i++) {
        process.stdout.write(`  ${dates[i]} `);
        const used = await sweep(s, idx[i], su, sv, sn);
        if (used < 0) { console.log('— dataset went away, moving down the ladder'); dead = true; break; }
        console.log(`${(used / 1000).toFixed(0)}k cells`);
        if (used > 0) ok++;
      }
      if (!dead && ok > 0) { src = s; epochsUsed = ok; break; }
      su.fill(0); sv.fill(0); sn.fill(0);
    }
    if (!src) throw new Error('no velocity source answered');
    writeFileSync(meanFile, JSON.stringify({ srcId: src.id, epochs: epochsUsed, dates,
      u: Array.from(su), v: Array.from(sv), n: Array.from(sn) }));
  }

  /* ── the Ekman part, when the velocity source is geostrophic only ─────────────────────────
     Ralph & Niiler (1999) fitted the ageostrophic surface velocity of 1,500 drogued drifters to
     the wind stress and found |u_ek| = B·|τ| / (ρ_w · √(f · A_z-ish)) collapsing to
         u_ek = (B / √|f|) · τ / ρ_w ,   B = 0.065 s^-1/2 ,
     directed 55° cum sole (to the RIGHT of the stress in the northern hemisphere). f is the
     Coriolis parameter, so the relation is singular at the equator; it is tapered inside 2.5°
     the way every implementation of it is, and the equatorial current system there is altimetric.
     ⚠ THIS IS A PUBLISHED RELATION APPLIED TO A MEASURED WIND STRESS, not a fitted correction:
     the panel and the sources page say the field is geostrophic + Ekman and cite both. */
  let windEpochs = 0;
  if (src.kind === 'geostrophic') {
    const windFile = join(CACHE, `wind-${GRID}-${WIND_EPOCHS}.json`);
    if (existsSync(windFile)) {
      const c = JSON.parse(readFileSync(windFile, 'utf8'));
      for (let k = 0; k < NX * NY; k++) { tx[k] = c.x[k]; ty[k] = c.y[k]; tn[k] = c.n[k]; }
      windEpochs = c.epochs; console.log(`cached wind stress: ${windEpochs} epochs`);
    } else {
      console.log(`\nwind stress — ${WIND_SOURCE.id}`);
      const waxis = await timeAxis(WIND_SOURCE);
      if (!waxis || !waxis.length) console.log('  — not loaded, Ekman term skipped');
      else {
        const widx = spread(waxis, WIND_EPOCHS);
        console.log(`  ${waxis.length} monthly fields; taking ${widx.length} spread across ${waxis[0].slice(0, 10)}…${waxis[waxis.length - 1].slice(0, 10)}`);
        for (const i of widx) {
          process.stdout.write(`  ${waxis[i].slice(0, 10)} `);
          const used = await sweep(WIND_SOURCE, i, tx, ty, tn);
          if (used < 0) { console.log('— went away, Ekman term skipped'); windEpochs = 0; break; }
          console.log(`${(used / 1000).toFixed(0)}k cells`);
          windEpochs++;
        }
      }
      if (windEpochs) writeFileSync(windFile, JSON.stringify({ epochs: windEpochs,
        x: Array.from(tx), y: Array.from(ty), n: Array.from(tn) }));
    }
  }

  /* ── the SST climatology, for the warm/cold classification ──────────────────────────────── */
  const sstS = new Float64Array(NX * NY), sstN = new Int32Array(NX * NY);
  let sstEpochs = 0;
  {
    const sstFile = join(CACHE, `sst-${GRID}-${SST_EPOCHS}.json`);
    if (existsSync(sstFile)) {
      const c = JSON.parse(readFileSync(sstFile, 'utf8'));
      for (let k = 0; k < NX * NY; k++) { sstS[k] = c.s[k]; sstN[k] = c.n[k]; }
      sstEpochs = c.epochs; console.log(`cached SST: ${sstEpochs} epochs`);
    } else {
      console.log(`\nsea-surface temperature — ${SST_SOURCE.id}`);
      const ax = await timeAxis(SST_SOURCE);
      if (!ax || !ax.length) console.log('  — not loaded; warm/cold falls back to the flow derivation');
      else {
        const idx = spread(ax, SST_EPOCHS);
        console.log(`  ${ax.length} daily fields; taking ${idx.length} spread across ${ax[0].slice(0, 10)}…${ax[ax.length - 1].slice(0, 10)}`);
        for (const i of idx) {
          process.stdout.write(`  ${ax[i].slice(0, 10)} `);
          const used = await sweep(SST_SOURCE, i, sstS, sstS, sstN);
          if (used < 0) { console.log('— went away'); sstEpochs = 0; break; }
          console.log(`${(used / 1000).toFixed(0)}k cells`);
          sstEpochs++;
        }
        if (sstEpochs) writeFileSync(sstFile, JSON.stringify({ epochs: sstEpochs, s: Array.from(sstS), n: Array.from(sstN) }));
      }
    }
  }
  /* one variable, one sample per epoch — see the  flag on SST_SOURCE */
  const sstAt = (lng, lat) => {
    const k = iy(lat) * NX + ix(lng);
    return sstN[k] ? sstS[k] / sstN[k] : null;
  };
  /* the zonal mean SST at a latitude — what "warm relative to the sea it flows through" is relative to */
  const zonalSST = new Float64Array(NY), zonalN = new Int32Array(NY);
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    const k = y * NX + x; if (!sstN[k]) continue;
    zonalSST[y] += sstS[k] / sstN[k]; zonalN[y]++;
  }
  const zonalAt = (lat) => { const y = iy(lat); return zonalN[y] ? zonalSST[y] / zonalN[y] : null; };

  /* ══ ⚠⚠ (#R222) THE ZONAL MEAN IS THE WRONG BACKGROUND FOR A MARGINAL SEA ═══════════════════════
     #R221 replaced the flow derivation with a MEASURED temperature: the current's own SST against
     the GLOBAL zonal mean at the same latitude. That is the textbook definition and it fixed the
     open-ocean cases (Benguela cold, Canary cold). Run against the currents this round ADDS, it
     produces four flat contradictions of the currents' own names:

         East Korea WARM Current   −1.9 K      Yellow Sea WARM Current  −3.8 K
         Tsugaru  (暖流)           −2.9 K      Taiwan WARM Current      zonal

     and the reason is not the measurement, it is the reference. The Sea of Japan, the Yellow Sea and
     the Sea of Okhotsk are each several kelvin colder than the GLOBAL water at their own latitude
     (that latitude band is dominated by the open Pacific and the Gulf Stream). A current that is the
     warm water OF ITS OWN SEA is therefore cold against the planet — which answers a question nobody
     asked. 「暖流」 has always meant warmer than the sea it flows through, and for a current inside a
     marginal sea the sea it flows through is that marginal sea.

     So the background is LOCAL and the latitudinal trend is removed FIRST, which is what the zonal
     mean was really for:

         a(x)  = T(x) − ⟨T⟩(lat)                 the anomaly field: no latitude trend left in it
         ā(x)  = mean of a over a 900 km disc    the water this current is flowing through
         ΔT    = Σ w_i [ a(x_i) − ā(x_i) ]       weighted along the path as #R221 weights it

     ⚠⚠ AND THEN IT WAS MEASURED, AND IT DID NOT EARN THE CLASSIFICATION. Scored against forty
     currents whose warm/cold is not in doubt, the local contrast lands 26/40 and #R221's global
     zonal mean lands 25/40 — the same answer, with the errors merely MOVED: the local reference
     fixes the tropical eastern Atlantic (Angola, Guinea) and loses the broad eastern boundary
     currents (Benguela, Peru), because the Benguela upwelling is itself 1,000 km wide and a local
     background sits inside it. A water-connected flood fill (below) was built to keep the reference
     inside a marginal sea and does not rescue it either — the Tsushima and Tsugaru straits are wide
     enough that the fill leaks into the Pacific.

     So the CLASSIFICATION IS LEFT EXACTLY AS #R221 MEASURED IT, and this local contrast ships beside
     it as a second measured number (`sstLocalK`). A round does not overturn a previous round's
     measured answer with one that measures no better — and now the panel can say both, which is the
     honest description of a quantity that genuinely depends on what you compare it with. */
  const anom = new Float64Array(NX * NY), anomN = new Uint8Array(NX * NY);
  for (let y = 0; y < NY; y++) {
    const z = zonalN[y] ? zonalSST[y] / zonalN[y] : null;
    if (z == null) continue;
    for (let x = 0; x < NX; x++) {
      const k = y * NX + x; if (!sstN[k]) continue;
      const t = sstS[k] / sstN[k];
      if (t < -3 || t > 40) continue;
      anom[k] = t - z; anomN[k] = 1;
    }
  }
  /* ⚠ (#R222) THE REFERENCE MAY NOT CROSS LAND. A straight-line disc around a point in the Sea of
     Japan reaches the Kuroshio, so the East Korea WARM Current is measured against water it never
     touches — which is the whole reason a 「暖流」 came out blue. The neighbourhood is therefore a
     WATER-DISTANCE region: a flood fill over ocean cells from the point, out to BG_KM of travel
     THROUGH water. In the open ocean that is the same disc as before; inside a marginal sea it is
     that sea, because land is where the fill stops. */
  const bfsSeen = new Int32Array(NX * NY); let bfsMark = 0;
  const bfsQ = new Int32Array(200000), bfsD = new Float32Array(200000);
  function bgAnomWater(lng, lat, R) {
    R = R || 900;
    const k0 = iy(lat) * NX + ix(lng);
    if (!anomN[k0]) return null;
    bfsMark++;
    let head = 0, tail = 0;
    bfsQ[tail] = k0; bfsD[tail] = 0; tail++;
    bfsSeen[k0] = bfsMark;
    let s = 0, n = 0;
    while (head < tail) {
      const k = bfsQ[head], d = bfsD[head]; head++;
      s += anom[k]; n++;
      if (d >= R) continue;
      const y = (k / NX) | 0, x = k - y * NX;
      const dLat = 110.574 * GRID;
      const dLng = 111.320 * GRID * Math.max(0.08, Math.cos((-90 + (y + 0.5) * GRID) * Math.PI / 180));
      for (let e = 0; e < 4; e++) {
        let ny = y, nx2 = x, step;
        if (e === 0) { ny = y + 1; step = dLat; } else if (e === 1) { ny = y - 1; step = dLat; }
        else if (e === 2) { nx2 = (x + 1) % NX; step = dLng; } else { nx2 = (x + NX - 1) % NX; step = dLng; }
        if (ny < 0 || ny >= NY) continue;
        const k2 = ny * NX + nx2;
        if (bfsSeen[k2] === bfsMark || !anomN[k2]) continue;
        if (tail >= bfsQ.length) continue;
        bfsSeen[k2] = bfsMark;
        bfsQ[tail] = k2; bfsD[tail] = d + step; tail++;
      }
    }
    return n >= 40 ? s / n : null;
  }
  const BG_KM = 900;
  function bgAnom(lng, lat, R) {
    R = R || BG_KM;
    const dy = Math.round(R / 110.574 / GRID);
    const dx = Math.round(R / (111.320 * Math.max(0.12, Math.cos(lat * Math.PI / 180))) / GRID);
    const y0 = iy(lat), x0 = ix(lng);
    let s = 0, n = 0;
    for (let j = -dy; j <= dy; j++) {
      const y = y0 + j; if (y < 0 || y >= NY) continue;
      const rr = 1 - (j / dy) * (j / dy);                 /* the disc, not the box */
      if (rr <= 0) continue;
      const w = Math.round(dx * Math.sqrt(rr));
      for (let i = -w; i <= w; i++) {
        const x = ((x0 + i) % NX + NX) % NX;
        const k = y * NX + x; if (!anomN[k]) continue;
        s += anom[k]; n++;
      }
    }
    return n >= 40 ? s / n : null;
  }

  /* ── the mean, and the Ekman sum ──────────────────────────────────────────────────────── */
  const mu = new Float64Array(NX * NY), mv = new Float64Array(NX * NY), mn = new Int32Array(NX * NY);
  const OMEGA = 7.2921e-5, RHO = 1025, B_RN = 0.065, DEG = Math.PI / 180;
  let ocean = 0, ekCells = 0;
  for (let y = 0; y < NY; y++) {
    const lat = -90 + (y + 0.5) * GRID;
    const f = 2 * OMEGA * Math.sin(lat * DEG);
    const taper = Math.min(1, Math.abs(lat) / 2.5);                 /* the equatorial singularity */
    for (let x = 0; x < NX; x++) {
      const k = y * NX + x;
      if (!sn[k]) continue;
      let u = su[k] / sn[k], v = sv[k] / sn[k];
      if (windEpochs && tn[k] && Math.abs(f) > 1e-6) {
        const TX = tx[k] / tn[k], TY = ty[k] / tn[k];
        const mag = Math.hypot(TX, TY);
        if (mag > 1e-4) {
          const sp = B_RN / Math.sqrt(Math.abs(f)) * mag / RHO;      /* m/s */
          const th = Math.atan2(TY, TX) - Math.sign(lat) * 55 * DEG; /* cum sole */
          u += Math.cos(th) * sp * taper; v += Math.sin(th) * sp * taper;
          ekCells++;
        }
      }
      mu[k] = u; mv[k] = v; mn[k] = 1; ocean++;
    }
  }
  console.log(`\nmean field: ${ocean.toLocaleString()} ocean cells at ${GRID}° (${epochsUsed} velocity epochs`
    + (windEpochs ? `, ${windEpochs} wind-stress epochs on ${ekCells.toLocaleString()} cells)` : ')'));

  /* ── trace ────────────────────────────────────────────────────────────────────────────── */
  const sample = makeSampler(mu, mv, mn);

  /* ══ ⚠⚠ A TRACE THAT COMES BACK TO ITS OWN START IS AN EDDY, NOT A CURRENT ═════════════════════
     The loop detector stops a walk that closes — which is right, and is what ended #R208's Kuroshio
     ring. But STOPPING at the eddy still SHIPS the eddy: measured on the first rebuild, ten of the
     61 traces were closed loops of 700–2,300 km, and four of them were currents nobody would call
     circular (Brazil 741 km, Kuroshio Extension 742 km, Canary 914 km, West Australian 783 km).
     A published core position can land in a standing recirculation; the current is beside it.

     So a closed short trace is REJECTED and the seed is tried again from the ring of cells around
     it, keeping the longest OPEN result. Nothing is invented: every candidate seed is a cell of the
     measured field with real flow in it, and if every candidate closes the closed one is kept and
     said so — a genuinely circular feature (the Alaska Gyre, the Weddell Gyre) must survive this. */
  const CLOSED_KM = 1500;
  const pathKm = (p) => {
    let s = 0;
    for (let i = 1; i < p.length; i++) {
      const la = (p[i][1] + p[i - 1][1]) / 2 * Math.PI / 180;
      s += Math.hypot((p[i][1] - p[i - 1][1]) * 110.574, (p[i][0] - p[i - 1][0]) * 111.320 * Math.cos(la));
    }
    return s;
  };
  const isClosed = (p) => {
    if (p.length < 4) return false;
    const a = p[0], b = p[p.length - 1];
    const km = Math.hypot((b[1] - a[1]) * 110.574, (b[0] - a[0]) * 111.320 * Math.cos(a[1] * Math.PI / 180));
    return km < 150;
  };
  function traceBest(lng0, lat0) {
    let best = trace(sample, lng0, lat0);
    if (!(isClosed(best) && pathKm(best) < CLOSED_KM)) return { path: best, retried: 0 };
    let tried = 0;
    for (const d of [2, 4, 6]) {
      for (let k = 0; k < 8; k++) {
        const th = k * Math.PI / 4;
        const lo = lng0 + Math.cos(th) * d * GRID / Math.max(0.15, Math.cos(lat0 * Math.PI / 180));
        const la = lat0 + Math.sin(th) * d * GRID;
        if (la < -80 || la > 82) continue;
        const s = sample(lo, la);
        if (!s || Math.hypot(s.u, s.v) < FLOOR_MS) continue;
        tried++;
        const cand = trace(sample, lo, la);
        const open = !isClosed(cand);
        const bestOpen = !isClosed(best);
        if ((open && !bestOpen) || (open === bestOpen && pathKm(cand) > pathKm(best))) best = cand;
      }
      if (!isClosed(best) && pathKm(best) >= CLOSED_KM) break;
    }
    return { path: best, retried: tried };
  }

  const named = [];
  for (const [en, ja, de, ru, es, lng0, lat0] of SEEDS) {
    const sn2 = snap(sample, lng0, lat0);
    if (!sn2) { console.log(`  ⚠ ${en}: no flow within 4° of the seed`); continue; }
    const tb = traceBest(sn2.lng, sn2.lat);
    const raw = tb.path;
    if (tb.retried && isClosed(raw)) console.log(`  ⚠ ${en}: closes after ${tb.retried} alternative seeds — kept as a circulation`);
    if (raw.length < 8) { console.log(`  ⚠ ${en}: the field does not support a trace here (${raw.length} points)`); continue; }
    /* ══ ⚠⚠ WARM OR COLD IS A TEMPERATURE, AND IT WAS BEING INFERRED FROM A VELOCITY ═══════════════
       #R208 derived it from the mean poleward component of the flow — physically motivated (a
       current carrying water toward its own pole is warm relative to the sea it crosses) and, run
       against the real traces, wrong often enough to be a defect a reader spots at a glance. On the
       28-epoch field it called the **Benguela** — the textbook cold current — warm, the **Canary**
       zonal, the **West Australian** warm, the **Irminger** cold and the **Oyashio** zonal. The
       reason is that the sign of v along a traced path is dominated by the meanders, not by where
       the water came from, and a boundary current meanders a great deal.

       So it is measured instead, from the thing the words actually name: the current's own SST
       against the ZONAL MEAN SST AT THE SAME LATITUDE, averaged along the path. That is the
       definition in every textbook — "warm current" means warmer than the sea it flows through —
       and it needs no assumption about direction. NOAA OISST v2.1 supplies both sides of it on the
       grid this build already uses.
       ⚠ ±0.6 K IS THE BAND FOR "ZONAL", not zero: the equatorial and circumpolar currents really do
       run along their own isotherms, and forcing them into warm or cold would be inventing a claim.
       ⚠ THE FLOW DERIVATION REMAINS as the fallback for a build where SST did not load, and
       `kindFrom` records which one answered so the panel can never imply the wrong provenance. */
    const pole = raw.reduce((a, q) => a + (q[3] || 0), 0) / raw.length;
    let kind, kindFrom = 'flow', dT = null, dTlocal = null;
    /* ⚠ WEIGHTED BY DISTANCE FROM THE SEED, AND NEITHER OF THE TWO OBVIOUS ALTERNATIVES.
       A trace follows the measured flow into the current's own continuation — the Canary's runs
       6,400 km, well past the upwelling the name belongs to — so an unweighted mean over the whole
       length averages the cold core away against open ocean, and the Canary came out +0.4 K (zonal).
       ⚠ WEIGHTING BY SPEED WAS TRIED AND IS WRONG, which is worth writing down because it sounds
       right: "a current's identity is its transport". In an EASTERN boundary current the fast water
       is the warm offshore gyre and the slow water is the cold coastal upwelling, so speed weighting
       made the Canary +0.9 K and the Benguela +1.2 K — both WARM, both textbook-cold. Measured, both
       times, before either was kept.
       What the name is actually attached to is the published core, which is the one editorial input
       this file has. So the weight falls off with along-path distance from it: e^(−d/D), D = 1,200 km.
       The classification then describes the current where it is named, and degrades smoothly rather
       than at an arbitrary cut. */
    if (sstEpochs) {
      /* the seed is the exact vertex `trace()` inserted between the two walks */
      let mid = 0, bestd = Infinity;
      for (let i = 0; i < raw.length; i++) {
        const d = Math.abs(raw[i][0] - sn2.lng) + Math.abs(raw[i][1] - sn2.lat);
        if (d < bestd) { bestd = d; mid = i; }
      }
      const cum = new Float64Array(raw.length);
      for (let i = 1; i < raw.length; i++) {
        const la = (raw[i][1] + raw[i - 1][1]) / 2 * DEG;
        cum[i] = cum[i - 1] + Math.hypot((raw[i][1] - raw[i - 1][1]) * 110.574, (raw[i][0] - raw[i - 1][0]) * 111.320 * Math.cos(la));
      }
      const D = 1200;
      let s = 0, w = 0, n = 0, sl = 0, wl = 0, nl = 0;
      for (let i = 0; i < raw.length; i++) {
        const q = raw[i];
        const t = sstAt(q[0], q[1]), z = zonalAt(q[1]);
        if (t == null || z == null || t < -3 || t > 40) continue;
        const wi = Math.exp(-Math.abs(cum[i] - cum[mid]) / D);
        s += (t - z) * wi; w += wi; n++;
        const bg = bgAnomWater(q[0], q[1], BG_KM);        /* (#R222) the local reference */
        if (bg != null) { sl += ((t - z) - bg) * wi; wl += wi; nl++; }
      }
      if (n >= Math.max(4, raw.length * 0.3) && w > 0) { dT = s / w; kindFrom = 'sst'; }
      if (nl >= Math.max(4, raw.length * 0.3) && wl > 0) dTlocal = sl / wl;
    }
    if (kindFrom === 'sst') kind = dT > 0.6 ? 'warm' : (dT < -0.6 ? 'cold' : 'zonal');
    else kind = pole > 0.010 ? 'warm' : (pole < -0.010 ? 'cold' : 'zonal');
    const speeds = raw.map((p) => p[2]);
    const path = simplify(raw.map((p) => [p[0], p[1]]));
    /* the length of the claim, in km — the panel prints it, and it is what tells a reader that
       the Canary Current is 3,000 km rather than six points long */
    let lenKm = 0;
    for (let i = 1; i < path.length; i++) {
      const la = (path[i][1] + path[i - 1][1]) / 2 * DEG;
      lenKm += Math.hypot((path[i][1] - path[i - 1][1]) * 110.574, (path[i][0] - path[i - 1][0]) * 111.320 * Math.cos(la));
    }
    named.push({ en, ja, de, ru, es, kind, kindFrom, sstAnomK: (dT==null?null:+dT.toFixed(2)),
      sstLocalK: (dTlocal==null?null:+dTlocal.toFixed(2)), polewardMs: +pole.toFixed(4),
      meanSpeed: +(speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(3),
      maxSpeed: +Math.max.apply(null, speeds).toFixed(3),
      lengthKm: Math.round(lenKm),
      seed: [lng0, lat0], seedSnappedTo: [sn2.lng, sn2.lat], path });
  }

  /* ── (#R222) the flow field: the WHOLE 0.25° grid, two bytes a cell ────────────────────── */
  const annualPlane = planeOf(mu, mv, mn, NX * NY);
  let fieldCells = 0;
  for (let k = 0; k < NX * NY; k++) if (annualPlane.speed[k] > 0.03) fieldCells++;
  const fieldGz = gzipSync(encodePlanes([annualPlane], NX, NY, GRID), { level: 9 });
  writeFileSync(OUT_FIELD, fieldGz);
  console.log(`\nwrote data/ocean-currents-field.bin.gz — ${NX}×${NY} at ${GRID}°, `
    + `${fieldCells.toLocaleString()} cells with flow, ${(fieldGz.length / 1024).toFixed(0)} kB gzipped`);

  /* ── (#R222) the twelve months ──────────────────────────────────────────────────────────── */
  let months = null, monthMeta = null;
  if (!SKIP_MONTHS) {
    const monFile = join(CACHE, `months-${MGRID}-${MON_EPOCHS}-${MON_WIND_EPOCHS}.json`);
    let acc = null;
    if (existsSync(monFile)) {
      acc = JSON.parse(readFileSync(monFile, 'utf8'));
      console.log(`\ncached monthly fields: ${acc.velEpochs} velocity + ${acc.windEpochs} wind epochs per month`);
    } else {
      console.log(`\nmonthly climatology — ${MON_EPOCHS} velocity + ${MON_WIND_EPOCHS} wind fields per calendar month, `
        + `strided to ${MGRID}°, ${MON_CONC} requests in flight`);
      const vAxis = await timeAxis(src);
      const wAxis = await timeAxis(WIND_SOURCE);
      const lastV = (await lonLen(src)) - 1, lastW = (await lonLen(WIND_SOURCE)) - 1;
      const vPick = byMonth(vAxis || [], MON_EPOCHS), wPick = byMonth(wAxis || [], MON_WIND_EPOCHS);
      const U = [], V = [], N = [], TX = [], TY = [], TN = [];
      for (let m = 0; m < 12; m++) {
        U.push(new Float64Array(MNX * MNY)); V.push(new Float64Array(MNX * MNY)); N.push(new Int32Array(MNX * MNY));
        TX.push(new Float64Array(MNX * MNY)); TY.push(new Float64Array(MNX * MNY)); TN.push(new Int32Array(MNX * MNY));
      }
      const jobs = [];
      for (let m = 0; m < 12; m++) {
        for (const t of vPick[m]) for (let s = -80; s < 82; s += MBAND)
          jobs.push({ src, t, s, s1: Math.min(82, s + MBAND) - 1e-3, last: lastV, A: U[m], B: V[m], N: N[m], m, kind: 'vel' });
        for (const t of wPick[m]) for (let s = -80; s < 82; s += MBAND)
          jobs.push({ src: WIND_SOURCE, t, s, s1: Math.min(82, s + MBAND) - 1e-3, last: lastW, A: TX[m], B: TY[m], N: TN[m], m, kind: 'wind' });
      }
      console.log(`  ${jobs.length} band requests`);
      let done = 0, failed = 0;
      await pmap(jobs, MON_CONC, async (j) => {
        let used = -1;
        try { used = await bandM(j.src, j.t, j.s, j.s1, j.last, j.A, j.B, j.N); }
        catch (e) { used = -1; }
        done++;
        if (used < 0) failed++;
        if (done % 25 === 0 || done === jobs.length)
          process.stdout.write(`\r  ${done}/${jobs.length} bands (${failed} failed)   `);
        return used;
      });
      console.log('');
      acc = { velEpochs: MON_EPOCHS, windEpochs: MON_WIND_EPOCHS, failed,
        u: U.map((a) => Array.from(a)), v: V.map((a) => Array.from(a)), n: N.map((a) => Array.from(a)),
        tx: TX.map((a) => Array.from(a)), ty: TY.map((a) => Array.from(a)), tn: TN.map((a) => Array.from(a)) };
      writeFileSync(monFile, JSON.stringify(acc));
    }
    /* the same Ralph & Niiler sum the annual field uses, month by month */
    const planes = [];
    months = [];
    for (let m = 0; m < 12; m++) {
      const u = new Float64Array(MNX * MNY), v = new Float64Array(MNX * MNY), n = new Int32Array(MNX * MNY);
      let cells = 0;
      for (let y = 0; y < MNY; y++) {
        const lat = -90 + (y + 0.5) * MGRID;
        const f = 2 * OMEGA * Math.sin(lat * DEG);
        const taper = Math.min(1, Math.abs(lat) / 2.5);
        for (let x = 0; x < MNX; x++) {
          const k = y * MNX + x;
          const cnt = acc.n[m][k];
          if (!cnt) continue;
          let uu = acc.u[m][k] / cnt, vv = acc.v[m][k] / cnt;
          const wn = acc.tn[m][k];
          if (wn && Math.abs(f) > 1e-6) {
            const X = acc.tx[m][k] / wn, Y = acc.ty[m][k] / wn;
            const mag = Math.hypot(X, Y);
            if (mag > 1e-4) {
              const sp = B_RN / Math.sqrt(Math.abs(f)) * mag / RHO;
              const th = Math.atan2(Y, X) - Math.sign(lat) * 55 * DEG;
              uu += Math.cos(th) * sp * taper; vv += Math.sin(th) * sp * taper;
            }
          }
          u[k] = uu; v[k] = vv; n[k] = 1; cells++;
        }
      }
      const p = planeOf(u, v, n, MNX * MNY);
      planes.push(p);
      months.push({ u, v, n });
      let drawn = 0;
      for (let k = 0; k < MNX * MNY; k++) if (p.speed[k] > 0.03) drawn++;
      console.log(`  ${MONTH_NAMES[m].padEnd(10)} ${cells.toLocaleString()} cells, ${drawn.toLocaleString()} with flow`);
    }
    const gz = gzipSync(encodePlanes(planes, MNX, MNY, MGRID), { level: 9 });
    writeFileSync(OUT_MONTHS, gz);
    monthMeta = { file: 'data/ocean-currents-months.bin.gz', gridDeg: MGRID, nx: MNX, ny: MNY,
      velEpochs: acc.velEpochs, windEpochs: acc.windEpochs, bytes: gz.length };
    console.log(`wrote data/ocean-currents-months.bin.gz — 12 planes at ${MGRID}°, ${(gz.length / 1024).toFixed(0)} kB gzipped`);
  }

  /* ⚠ (#R222) THE SEASON OF A NAMED CURRENT IS SAMPLED ALONG ITS OWN PATH, NOT RE-TRACED.
     Re-tracing on a 0.5° monthly field would give twelve DIFFERENT geometries, and a line that
     jumps shape every time the reader steps a month is a claim about the path that a 0.5° field
     cannot support. What the monthly field CAN say about a named current is how fast it runs and
     WHICH WAY, so both are measured along the annual path: the mean speed, and the mean projection
     of the monthly flow onto the path's own direction. A projection that goes negative is the
     current running backwards — which is what the Somali Current and the two Indian coastal
     currents really do between the monsoons, and it is now a number rather than a sentence. */
  if (months) {
    const mSample = (m, lng, lat) => {
      const k = miy(lat) * MNX + mix(lng);
      return months[m].n[k] ? { u: months[m].u[k], v: months[m].v[k] } : null;
    };
    for (const c of named) {
      const speeds = [], along = [];
      for (let m = 0; m < 12; m++) {
        let s = 0, a = 0, n = 0;
        for (let i = 1; i < c.path.length; i++) {
          const p0 = c.path[i - 1], p1 = c.path[i];
          const mlng = (p0[0] + p1[0]) / 2, mlat = (p0[1] + p1[1]) / 2;
          if (Math.abs(p1[0] - p0[0]) > 180) continue;
          const q = mSample(m, mlng, mlat); if (!q) continue;
          const dx = (p1[0] - p0[0]) * Math.cos(mlat * DEG), dy = p1[1] - p0[1];
          const L = Math.hypot(dx, dy); if (!(L > 0)) continue;
          s += Math.hypot(q.u, q.v);
          a += (q.u * dx + q.v * dy) / L;
          n++;
        }
        speeds.push(n ? +(s / n).toFixed(3) : null);
        along.push(n ? +(a / n).toFixed(3) : null);
      }
      if (speeds.some((x) => x != null)) { c.monthSpeed = speeds; c.monthAlong = along; }
    }
  }

  const method = `mean of ${epochsUsed} fields spread evenly across ${dates[0]}…${dates[dates.length - 1]} on the source's native `
    + `${GRID}° grid` + (windEpochs ? `, plus the Ekman surface current from ${windEpochs} blended wind-stress fields (Ralph & Niiler 1999, B = 0.065 s^-1/2, 55° cum sole, tapered inside 2.5° of the equator)` : '')
    + `; named paths integrated (RK2, ${STEP_KM} km steps, loop- and closure-detecting) from a published seed on each current's core`
    + (sstEpochs
      ? `; warm/cold MEASURED as the mean SST anomaly along each path against the zonal mean at the same latitude (NOAA OISST v2.1, ${sstEpochs} fields)`
      : `; warm/cold derived from the mean poleward component along the trace`);

  const doc = {
    v: 2,
    built: new Date().toISOString().slice(0, 10),
    source: src.name + (windEpochs ? ' + ' + WIND_SOURCE.name : '') + (sstEpochs ? ' + ' + SST_SOURCE.name : ''),
    sourceId: src.id, sourceKind: windEpochs ? 'geostrophic+ekman' : src.kind,
    /* ⚠ THE LICENCE HAS TO BE IN THE STRING, not only in the source name (tests/r208 ⑧a). All three
       products are U.S. Government works in the public domain, and the sentence that says which part
       of the geometry is measured and which part is editorial is the other half of the same promise. */
    attribution: 'Ocean surface currents: ' + src.name + '. ' + (windEpochs ? WIND_SOURCE.name + '. ' : '')
      + (sstEpochs ? SST_SOURCE.name + '. ' : '')
      + 'All U.S. Government works in the public domain; data courtesy of NOAA, altimetric products generated using AVISO+. '
      + 'Paths traced through the measured mean velocity field; names and seed points are editorial.',
    method,
    gridDeg: GRID, epochs: epochsUsed, windEpochs, sstEpochs,
    /* (#R222) where the field lives now, and everything the decoder needs to read it without
       being told a second time. `stride` is the client's own contract: 1 = 0.25°, 2 = 0.5°, … */
    field: { file: 'data/ocean-currents-field.bin.gz', format: 'IMOC1', gridDeg: GRID,
      nx: NX, ny: NY, speedMax: SP_MAX, cells: fieldCells, bytes: fieldGz.length },
    months: monthMeta,
    fields: { named: ['en', 'ja', 'de', 'ru', 'es', 'kind', 'kindFrom', 'sstAnomK', 'sstLocalK', 'polewardMs', 'meanSpeed', 'maxSpeed', 'lengthKm', 'monthSpeed', 'monthAlong', 'seed', 'seedSnappedTo', 'path'] },
    named,
  };
  writeFileSync(OUT, JSON.stringify(doc));
  console.log('\nwrote data/ocean-currents.json — ' + named.length + ' named currents, '
    + (readFileSync(OUT).length / 1024).toFixed(0) + ' kB');
  for (const n of named) {
    console.log('  ' + n.kind.padEnd(5) + (n.sstAnomK==null?'      ':(n.sstAnomK>0?'+':'')+n.sstAnomK.toFixed(1)+'K ')
      + (n.sstLocalK==null?'       ':'(loc'+(n.sstLocalK>0?'+':'')+n.sstLocalK.toFixed(1)+') ') + n.en.padEnd(46) + String(n.path.length).padStart(4) + ' pts  '
      + String(n.lengthKm).padStart(6) + ' km  ' + n.meanSpeed.toFixed(2) + ' m/s mean, ' + n.maxSpeed.toFixed(2) + ' max');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
