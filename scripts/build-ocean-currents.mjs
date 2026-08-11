#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUILD THE OCEAN-CURRENT LAYER — data/ocean-currents.json   (#R221)
 * ----------------------------------------------------------------------------
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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'ocean-currents.json');
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
    let kind, kindFrom = 'flow', dT = null;
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
      let s = 0, w = 0, n = 0;
      for (let i = 0; i < raw.length; i++) {
        const q = raw[i];
        const t = sstAt(q[0], q[1]), z = zonalAt(q[1]);
        if (t == null || z == null || t < -3 || t > 40) continue;
        const wi = Math.exp(-Math.abs(cum[i] - cum[mid]) / D);
        s += (t - z) * wi; w += wi; n++;
      }
      if (n >= Math.max(4, raw.length * 0.3) && w > 0) { dT = s / w; kindFrom = 'sst'; }
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
    named.push({ en, ja, de, ru, es, kind, kindFrom, sstAnomK: (dT==null?null:+dT.toFixed(2)), polewardMs: +pole.toFixed(4),
      meanSpeed: +(speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(3),
      maxSpeed: +Math.max.apply(null, speeds).toFixed(3),
      lengthKm: Math.round(lenKm),
      seed: [lng0, lat0], seedSnappedTo: [sn2.lng, sn2.lat], path });
  }

  /* ── the flow field: one arrow per moving ocean cell, thinned to 1° ───────────────────── */
  const arrows = [];
  const stride = Math.round(1 / GRID);
  for (let y = 0; y < NY; y += stride) for (let x = 0; x < NX; x += stride) {
    /* the 1° value is the mean of the GRID cells inside it, so thinning does not sample-and-hope */
    let u = 0, v = 0, n = 0;
    for (let dy = 0; dy < stride; dy++) for (let dx = 0; dx < stride; dx++) {
      const k = (y + dy) * NX + ((x + dx) % NX);
      if (y + dy < NY && mn[k]) { u += mu[k]; v += mv[k]; n++; }
    }
    if (!n) continue;
    u /= n; v /= n;
    const sp = Math.hypot(u, v);
    if (sp < 0.03) continue;
    const lat = -90 + (y + stride / 2) * GRID, lng = ((-180 + (x + stride / 2) * GRID + 180) % 360 + 360) % 360 - 180;
    if (lat < -80 || lat > 82) continue;
    arrows.push([+lng.toFixed(2), +lat.toFixed(2), +(Math.atan2(u, v) * 180 / Math.PI).toFixed(1), +sp.toFixed(3)]);
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
    fields: { named: ['en', 'ja', 'de', 'ru', 'es', 'kind', 'kindFrom', 'sstAnomK', 'polewardMs', 'meanSpeed', 'maxSpeed', 'lengthKm', 'seed', 'seedSnappedTo', 'path'], arrows: ['lng', 'lat', 'bearingDeg', 'speedMs'] },
    named, arrows,
  };
  writeFileSync(OUT, JSON.stringify(doc));
  console.log('\nwrote data/ocean-currents.json — ' + named.length + ' named currents, '
    + arrows.length.toLocaleString() + ' arrows, ' + (readFileSync(OUT).length / 1024).toFixed(0) + ' kB');
  for (const n of named) {
    console.log('  ' + n.kind.padEnd(5) + (n.sstAnomK==null?'      ':(n.sstAnomK>0?'+':'')+n.sstAnomK.toFixed(1)+'K ') + n.en.padEnd(46) + String(n.path.length).padStart(4) + ' pts  '
      + String(n.lengthKm).padStart(6) + ' km  ' + n.meanSpeed.toFixed(2) + ' m/s mean, ' + n.maxSpeed.toFixed(2) + ' max');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
