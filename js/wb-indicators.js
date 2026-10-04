/* ============================================================================
 *  IntMap · js/wb-indicators.js — EVERY WORLD BANK INDICATOR INTMAP READS, AND THE ONE READ  (country-analysis-unify)
 * ----------------------------------------------------------------------------
 *  MEASURED before this file (2026-10-04): the World Bank's indicators were named in SEVEN tables —
 *  js/wb-layers.js (the choropleth family, 61 rows), js/stats-compare.js (the comparison panel, 22 series),
 *  js/analysis-timeseries.js (a country's chart, 6 — every one of them also in the comparison), js/analysis-correlate.js
 *  (the scatter's axes, 37), js/time-countries.js (the clock's 7), js/layer-packs.js (5 rows) and js/layer-previews.js
 *  (the tiles, 60) — each with its own code, its own spelling of the name in five languages and, for CO₂, its own
 *  copy of «the World Bank retired EN.ATM.CO2E.PC, read its successor first». And the request was written in NINE
 *  places (those files, js/app-body.js's PPP read and js/data-layers.js's fertility row), each with its own cache,
 *  its own idea of what an empty answer means and its own idea of what a failure is.
 *
 *  ⚠ SO THIS FILE IS TWO THINGS AND ONLY TWO.
 *    WB_INDICATORS — what an indicator IS: its key (the comparison panel's, which Atlas's `compareStats` metrics use),
 *      its series (`code`; `parts` = one quantity the publisher splits in two, summed; `fallback` = retired
 *      predecessors, read only when the successor has nothing), its name in the languages it has always had, its
 *      unit, and — `stat` — the field of the country table it fills while the clock travels (js/time-countries.js).
 *      HOW a reader shows it (a ramp, a number format, an axis's log scale) stays with that reader: the map paints,
 *      the comparison formats, the scatter scales. Those are not facts about the indicator.
 *    readWorldBank(o) — the request, with ONE vocabulary for its outcome:
 *      'ok'          the API answered and there are values             (kept)
 *      'none'        the API answered and there are none               (kept — asking again gets the same answer)
 *      'unavailable' the API did not answer, or not with JSON          (NOT kept — the next call asks again)
 *      and, for an unavailable read, `late` (js/fetch-deadline.js isUnobserved: it ran out of time — the host was
 *      not observed, which is not the host saying no; .agents/rules/one-pass-or-a-reason.md §5).
 *  ⚠ A NEW READER IMPORTS THESE. It does not write the URL and it does not write a series code:
 *  tests/country-analysis-unify-checks.test.mjs fails on either anywhere else in js/.
 * ==========================================================================*/
import { clockFor } from './proxy-fetch.js';
import { readWithin, isUnobserved } from './fetch-deadline.js';
import { IntMapLang } from './lang-registry.js';

/* the translations held as data — the same `pickArgs` every table in js/ uses (js/lang-registry.js #R241) */
const LA = IntMapLang.pickArgs();

export const WB_INDICATORS = Object.freeze([
  /* ── the country table's own figures (js/time-countries.js keeps `stat` in step with the clock; `statScale` is
        the table's unit — its GDP and military spending are in US$ billions) ── */
  {k:'gdp', code:'NY.GDP.MKTP.CD', stat:'gdp', statScale:1e-9, n:LA('GDP (US$)','GDP（米ドル）','BIP (US$)','ВВП (долл.)','PIB (US$)'), unit:''},
  {k:'gdppc', code:'NY.GDP.PCAP.CD', stat:'gdppc', n:LA('GDP per capita','1人当たりGDP','BIP pro Kopf','ВВП на душу','PIB per cápita'), unit:''},
  {k:'pop', code:'SP.POP.TOTL', stat:'pop', n:LA('Population','人口','Bevölkerung','Население','Población'), unit:''},
  {k:'milb', code:'MS.MIL.XPND.CD', stat:'milSpend', statScale:1e-9, n:LA('Military spending ($)','軍事費（米ドル）','Militärausgaben ($)','Военные расходы ($)','Gasto militar ($)'), unit:''},
  /* the PPP pair js/app-body.js merges into the country table on its own schedule (not the clock's) */
  {k:'gdpppp', code:'NY.GDP.MKTP.PP.CD', n:LA('GDP (PPP)','GDP（PPP）','BIP (KKP)','ВВП (ППС)','PIB (PPA)'), unit:''},
  {k:'gdppcppp', code:'NY.GDP.PCAP.PP.CD', n:LA('GDP per capita (PPP)','1人当たりGDP（PPP）','BIP pro Kopf (KKP)','ВВП на душу (ППС)','PIB per cápita (PPA)'), unit:''},
  {k:'cab', code:'BN.CAB.XOKA.GD.ZS', n:LA('Current account (% GDP)','経常収支(対GDP)','Leistungsbilanz (% BIP)','Текущий счёт (% ВВП)','Cuenta corriente (% PIB)'), unit:'%'},
  {k:'exp', code:'NE.EXP.GNFS.ZS', n:LA('Exports (% GDP)','輸出(対GDP)','Exporte (% BIP)','Экспорт (% ВВП)','Exportaciones (% PIB)'), unit:'%'},
  /* ── (#R289) CO₂: one quantity, two divisions — the map's CO₂ row switches between them.
     (#R32/#R69) the World Bank RETIRED EN.ATM.CO2E.PC (it answers 0 values); the AR5 series is its successor, and the
     old code is read only when the successor has nothing for a country. ── */
  {k:'co2t', code:'EN.GHG.CO2.MT.CE.AR5', n:LA('CO₂ emissions (Mt)','CO₂排出量（百万t）','CO₂-Emissionen (Mt)','Выбросы CO₂ (млн т)','Emisiones de CO₂ (Mt)'), unit:' Mt'},
  {k:'co2', code:'EN.GHG.CO2.PC.CE.AR5', fallback:['EN.ATM.CO2E.PC'], n:LA('CO₂ per capita','1人当たりCO₂排出','CO₂ pro Kopf','CO₂ на душу','CO₂ per cápita'), unit:' t'},
  /* ── the choropleth family (js/wb-layers.js paints each of these as a row). (#R246) ONE NAME, ONE PLACE: a series
        two readers show is named here once, and the name says «World Bank» where another row of the Layers panel
        measures the same quantity from elsewhere (#R266/#R270). ── */
  {k:'urban', code:'SP.URB.TOTL.IN.ZS', n:LA('Urban population %','都市人口比率 %','Stadtbevölkerung %','Городское население %','Población urbana %'), unit:'%'},
  {k:'elec', code:'EG.ELC.ACCS.ZS', n:LA('Electricity access %','電力アクセス率','Stromzugang %','Доступ к электричеству %','Acceso a electricidad %'), unit:'%'},
  {k:'health', code:'SH.XPD.CHEX.GD.ZS', n:LA('Health spend %GDP','医療支出 対GDP','Gesundheitsausgaben % BIP','Расходы на здравоохранение % ВВП','Gasto en salud % PIB'), unit:'%'},
  {k:'forest', code:'AG.LND.FRST.ZS', n:LA('Forest area %','森林面積率','Waldfläche %','Площадь лесов %','Superficie forestal %'), unit:'%'},
  {k:'renew', code:'EG.FEC.RNEW.ZS', n:LA('Renewable energy %','再エネ比率','Erneuerbare Energie %','Возобновляемая энергия %','Energía renovable %'), unit:'%'},
  {k:'mobile', code:'IT.CEL.SETS.P2', n:LA('Mobile subs /100','携帯契約 /100人','Mobilfunkverträge /100','Моб. абоненты /100','Líneas móviles /100'), unit:''},
  {k:'infl', code:'FP.CPI.TOTL.ZG', n:LA('Inflation % (CPI)','インフレ率 (CPI)','Inflation % (VPI)','Инфляция % (ИПЦ)','Inflación % (IPC)'), unit:'%'},
  {k:'infmort', code:'SP.DYN.IMRT.IN', n:LA('Infant mortality /1k','乳児死亡率 /1k','Säuglingssterblichkeit /1k','Младенческая смертность /1k','Mortalidad infantil /1k'), unit:''},
  {k:'growth', code:'NY.GDP.MKTP.KD.ZG', n:LA('GDP growth %','GDP成長率 %','BIP-Wachstum %','Рост ВВП %','Crecimiento del PIB %'), unit:'%'},
  {k:'lit', code:'SE.ADT.LITR.ZS', n:LA('Literacy rate %','識字率 %','Alphabetisierungsrate %','Уровень грамотности %','Tasa de alfabetización %'), unit:'%'},
  {k:'water', code:'SH.H2O.SMDW.ZS', n:LA('Safe water access %','安全な水 %','Zugang zu sauberem Wasser %','Доступ к чистой воде %','Acceso a agua potable %'), unit:'%'},
  {k:'san', code:'SH.STA.SMSS.ZS', n:LA('Sanitation access %','衛生設備 %','Sanitärversorgung %','Доступ к санитарии %','Acceso a saneamiento %'), unit:'%'},
  {k:'pov', code:'SI.POV.DDAY', n:LA('Extreme poverty %','極度の貧困 %','Extreme Armut %','Крайняя бедность %','Pobreza extrema %'), unit:'%'},
  {k:'gini', code:'SI.POV.GINI', n:LA('Income inequality (Gini)','所得格差 (ジニ)','Einkommensungleichheit (Gini)','Неравенство доходов (Джини)','Desigualdad de ingresos (Gini)'), unit:''},
  {k:'trade', code:'NE.TRD.GNFS.ZS', n:LA('Trade % of GDP','貿易 対GDP %','Handel % des BIP','Торговля % ВВП','Comercio % del PIB'), unit:'%'},
  {k:'tax', code:'GC.TAX.TOTL.GD.ZS', n:LA('Tax revenue % GDP','税収 対GDP %','Steuereinnahmen % BIP','Налоговые доходы % ВВП','Ingresos fiscales % PIB'), unit:'%'},
  {k:'agri', code:'AG.LND.AGRI.ZS', n:LA('Agricultural land %','農地率 %','Landwirtschaftsfläche %','Сельхозземли %','Tierras agrícolas %'), unit:'%'},
  {k:'phys', code:'SH.MED.PHYS.ZS', n:LA('Physicians /1k','医師 /1k人','Ärzte /1k','Врачи /1k','Médicos /1k'), unit:''},
  {k:'school', code:'SE.SEC.ENRR', n:LA('Secondary enrollment %','中等教育就学 %','Sekundarschulquote %','Охват средним образованием %','Matrícula secundaria %'), unit:'%'},
  {k:'elecuse', code:'EG.USE.ELEC.KH.PC', n:LA('Electricity use /capita (kWh)','電力消費 /人 (kWh)','Stromverbrauch /Kopf (kWh)','Потребление электроэнергии /чел (кВт·ч)','Consumo eléctrico /cápita (kWh)'), unit:''},
  {k:'renelec', code:'EG.ELC.RNEW.ZS', n:LA('Renewable electricity %','再エネ電力 %','Erneuerbarer Strom %','Возобновляемое электричество %','Electricidad renovable %'), unit:'%'},
  {k:'fdi', code:'BX.KLT.DINV.WD.GD.ZS', n:LA('FDI inflow % GDP','対内直接投資 対GDP %','ADI-Zufluss % BIP','Приток ПИИ % ВВП','Entrada de IED % PIB'), unit:'%'},
  {k:'milppl', code:'MS.MIL.TOTL.P1', n:LA('Armed forces personnel','軍人数','Streitkräftepersonal','Численность вооружённых сил','Personal de fuerzas armadas'), unit:''},
  {k:'life', code:'SP.DYN.LE00.IN', stat:'lifeExp', n:LA('Life expectancy (World Bank)','平均寿命（世界銀行）','Lebenserwartung (Weltbank)','Продолжительность жизни (Всемирный банк)','Esperanza de vida (Banco Mundial)'), unit:' yr'},
  {k:'unemp', code:'SL.UEM.TOTL.ZS', n:LA('Unemployment %','失業率 %','Arbeitslosigkeit %','Безработица %','Desempleo %'), unit:'%'},
  {k:'net', code:'IT.NET.USER.ZS', stat:'internet', n:LA('Internet users %','インターネット利用率 %','Internetnutzer %','Пользователи интернета %','Usuarios de internet %'), unit:'%'},
  {k:'debt', code:'GC.DOD.TOTL.GD.ZS', n:LA('Govt debt % GDP','政府債務 対GDP %','Staatsverschuldung % BIP','Госдолг % ВВП','Deuda pública % PIB'), unit:'%'},
  {k:'manuf', code:'NV.IND.MANF.ZS', n:LA('Manufacturing % GDP','製造業 対GDP %','Verarbeitendes Gewerbe % BIP','Обрабатывающая пром. % ВВП','Manufactura % PIB'), unit:'%'},
  {k:'u5mort', code:'SH.DYN.MORT', n:LA('Under-5 mortality /1k','5歳未満死亡率 /1k','Sterblichkeit unter 5 J. /1k','Смертность до 5 лет /1k','Mortalidad de menores de 5 /1k'), unit:''},
  {k:'popgrow', code:'SP.POP.GROW', n:LA('Population growth %','人口増加率 %','Bevölkerungswachstum %','Прирост населения %','Crecimiento demográfico %'), unit:'%'},
  {k:'energy', code:'EG.USE.PCAP.KG.OE', n:LA('Energy use /capita','エネルギー消費 /人','Energieverbrauch /Kopf','Потребление энергии /чел','Consumo de energía /cápita'), unit:''},
  {k:'rnd', code:'GB.XPD.RSDV.GD.ZS', n:LA('R&D spending % GDP','研究開発費 対GDP %','F&E-Ausgaben % BIP','Расходы на НИОКР % ВВП','Gasto en I+D % PIB'), unit:'%'},
  {k:'tour', code:'ST.INT.ARVL', n:LA('Intl. tourist arrivals','外国人観光客数','Touristenankünfte','Прибытия туристов','Llegadas de turistas int.'), unit:''},
  {k:'ref', parts:['SM.POP.RHCR.EA','SM.POP.RRWA.EA'], n:LA('Refugees hosted','難民受入数','Aufgenommene Flüchtlinge','Принято беженцев','Refugiados acogidos'), unit:''},
  {k:'patent', code:'IP.PAT.RESD', n:LA('Patent applications (resident)','特許出願数（居住者）','Patentanmeldungen','Патентные заявки','Solicitudes de patentes (residentes)'), unit:''},
  {k:'womparl', code:'SG.GEN.PARL.ZS', n:LA('Women in parliament %','女性議員比率 %','Frauen im Parlament %','Женщины в парламенте %','Mujeres en el parlamento %'), unit:'%'},
  {k:'pm25', code:'EN.ATM.PM25.MC.M3', n:LA('PM2.5 air pollution (µg/m³)','PM2.5大気汚染（µg/m³）','PM2,5-Luftverschmutzung (µg/m³)','Загрязнение PM2.5 (мкг/м³)','Contaminación por PM2,5 (µg/m³)'), unit:' µg/m³'},
  {k:'cook', code:'EG.CFT.ACCS.ZS', n:LA('Clean cooking fuel access %','クリーン調理燃料 普及率 %','Zugang zu sauberem Kochbrennstoff %','Доступ к чистому топливу для готовки %','Acceso a cocina limpia %'), unit:'%'},
  {k:'flfp', code:'SL.TLF.CACT.FE.ZS', n:LA('Female labor participation %','女性労働参加率 %','Frauenerwerbsquote %','Участие женщин в раб. силе %','Participación laboral femenina %'), unit:'%'},
  {k:'tert', code:'SE.TER.ENRR', n:LA('Tertiary enrollment %','高等教育就学率 %','Hochschulquote %','Охват высшим образованием %','Matrícula terciaria %'), unit:'%'},
  {k:'rural', code:'SP.RUR.TOTL.ZS', n:LA('Rural population %','農村人口比率 %','Landbevölkerung %','Сельское население %','Población rural %'), unit:'%'},
  {k:'gni', code:'NY.GNP.PCAP.CD', n:LA('GNI per capita (Atlas, US$)','一人当たりGNI（アトラス法, US$）','BNE pro Kopf (Atlas, US$)','ВНД на душу (Атлас, US$)','INB per cápita (Atlas, US$)'), unit:''},
  {k:'under', code:'SN.ITK.DEFC.ZS', n:LA('Undernourishment %','栄養不足人口比率 %','Unterernährung %','Недоедание %','Subalimentación %'), unit:'%'},
  {k:'hitech', code:'TX.VAL.TECH.MF.ZS', n:LA('High-tech exports %','ハイテク製品輸出比率 %','Hightech-Exporte %','Высокотехнологичный экспорт %','Exportaciones de alta tecnología %'), unit:'%'},
  {k:'bbnd', code:'IT.NET.BBND.P2', n:LA('Fixed broadband /100','固定ブロードバンド /100人','Festnetz-Breitband /100','Фикс. широкополосный /100','Banda ancha fija /100'), unit:''},
  {k:'aging', code:'SP.POP.65UP.TO.ZS', n:LA('Population 65+ %','65歳以上人口比率 %','Bevölkerung 65+ %','Население 65+ %','Población de 65+ %'), unit:'%'},
  {k:'adofert', code:'SP.ADO.TFRT', n:LA('Adolescent fertility /1k','思春期出生率 /1k','Teenager-Geburtenrate /1k','Подростковая рождаемость /1k','Fecundidad adolescente /1k'), unit:''},
  {k:'beds', code:'SH.MED.BEDS.ZS', n:LA('Hospital beds /1k','病床数 /1k人','Krankenhausbetten /1k','Больничные койки /1k','Camas hospitalarias /1k'), unit:''},
  {k:'research', code:'SP.POP.SCIE.RD.P6', n:LA('Researchers /million','研究者数 /100万人','Forscher /Mio.','Исследователи /млн','Investigadores /millón'), unit:''},
  {k:'overwt', code:'HF.STA.OW18.ZS', n:LA('Overweight adults %','成人過体重率 %','Übergewichtige Erwachsene %','Избыточный вес у взрослых %','Adultos con sobrepeso %'), unit:'%'},
  {k:'remit', code:'BX.TRF.PWKR.DT.GD.ZS', n:LA('Remittances % GDP','海外送金受取 %GDP','Rücküberweisungen % BIP','Денежные переводы % ВВП','Remesas % PIB'), unit:'%'},
  {k:'suicide', code:'SH.STA.SUIC.P5', n:LA('Suicide rate /100k','自殺率 /10万人','Suizidrate /100k','Уровень суицида /100k','Tasa de suicidio /100k'), unit:''},
  {k:'alcohol', code:'SH.ALC.PCAP.LI', n:LA('Alcohol per capita L','一人当たり飲酒量 L','Alkohol pro Kopf L','Алкоголь на душу, л','Alcohol per cápita L'), unit:' L'},
  {k:'hom', code:'VC.IHR.PSRC.P5', n:LA('Homicide rate /100k','殺人発生率 /10万人','Mordrate /100k','Убийства /100k','Tasa de homicidios /100k'), unit:''},
  {k:'mil', code:'MS.MIL.XPND.GD.ZS', n:LA('Military spending % GDP','軍事費 %GDP','Militärausgaben % BIP','Военные расходы % ВВП','Gasto militar % PIB'), unit:'%'},
  {k:'tfr', code:'SP.DYN.TFRT.IN', stat:'tfr', n:LA('Fertility rate (World Bank)','合計特殊出生率（世界銀行）','Geburtenrate (Weltbank)','Суммарный коэфф. рождаемости (Всемирный банк)','Tasa de fecundidad (Banco Mundial)'), unit:''},
  {k:'density', code:'EN.POP.DNST', n:LA('Population density /km² (World Bank)','人口密度 /km²（世界銀行）','Bevölkerungsdichte /km² (Weltbank)','Плотность населения /км² (Всемирный банк)','Densidad de población /km² (Banco Mundial)'), unit:'/km²'},
  {k:'edu', code:'SE.XPD.TOTL.GD.ZS', n:LA('Education spending % GDP','教育支出 %GDP','Bildungsausgaben % BIP','Расходы на образование % ВВП','Gasto en educación % PIB'), unit:'%'},
  {k:'smoke', code:'SH.PRV.SMOK', n:LA('Smoking prevalence %','喫煙率 %','Raucherquote %','Распространённость курения %','Prevalencia de tabaquismo %'), unit:'%'},
  {k:'agremp', code:'SL.AGR.EMPL.ZS', n:LA('Employment in agriculture %','農業就業率 %','Beschäftigung Landwirtschaft %','Занятость в сельском хоз-ве %','Empleo en agricultura %'), unit:'%'},
  /* ── series only the scatter's axes read (js/analysis-correlate.js) ── */
  {k:'basw', code:'SH.H2O.BASW.ZS', n:LA('Basic water access %','基本的飲料水 %','Wasserzugang %','Доступ к воде %','Acceso a agua %'), unit:'%'},
  {k:'bass', code:'SH.STA.BASS.ZS', n:LA('Basic sanitation %','基本的衛生 %','Sanitärzugang %','Санитария %','Saneamiento %'), unit:'%'},
  {k:'hiv', code:'SH.DYN.AIDS.ZS', n:LA('HIV prevalence %','HIV有病率','HIV-Prävalenz %','Распр. ВИЧ %','Prevalencia VIH %'), unit:'%'},
  {k:'oop', code:'SH.XPD.OOPC.CH.ZS', n:LA('Out-of-pocket health %','自己負担医療費 %','Selbstzahlerquote %','Личные расходы %','Gasto de bolsillo %'), unit:'%'},
  {k:'arable', code:'AG.LND.ARBL.ZS', n:LA('Arable land %','耕地率','Ackerland %','Пашня %','Tierra cultivable %'), unit:'%'},
  /* ── series only js/layer-packs.js's rows read.
     cpi: the WGI moved to GOV_WGI_* ids under SOURCE 3 (the old CC.EST id returns 0 rows; curl-verified, #R22) — the
     source is part of the series' address, so it is said here and every read of the series carries it. ── */
  {k:'cpi', code:'GOV_WGI_CC.SC', source:3, n:LA('Corruption (control, WGI)','汚職・腐敗指標（世界銀行WGI）','Korruptionskontrolle (WGI)','Контроль коррупции (WGI)','Control de la corrupción (WGI)'), unit:''},
  {k:'precip', code:'AG.LND.PRCP.MM', n:LA('Annual precipitation (mm)','年降水量（mm）','Jahresniederschlag (mm)','Годовое количество осадков (мм)','Precipitación anual (mm)'), unit:' mm'}
].map((I) => Object.freeze(I)));

const BY_KEY = new Map(WB_INDICATORS.map((I) => [I.k, I]));
/** the indicator a key names — undefined for a key the catalogue does not have (the caller decides what that means) */
export function wbIndicator(k) { return BY_KEY.get(k); }
/** the indicator that fills a country-table field (`stat`), or undefined */
export function wbIndicatorFor(stat) { return WB_INDICATORS.find((I) => I.stat === stat); }

/* ══ THE READ ═══════════════════════════════════════════════════════════════════════════════════
   One answer per address. A read in flight is SHARED (two panels asking for the same series make one request) and at
   most WB_SLOTS run at once — #R69 measured 321 parallel requests from one comparison session: the browser queued them
   for minutes and the World Bank then throttled the IP, so everything World-Bank-backed showed «no data».
   WB_SLOTS — observation (#R69): the browser's own limit per host is 6, so more than 6 only queue inside the browser
   where no clock can see them; js/stats-compare.js held its own reads to 6 and the burst stopped. It is the whole
   app's limit now, because the burst was never one panel's. Lapses if the World Bank's API moves to a protocol that
   multiplexes one connection (HTTP/2). Canonical here. */
const WB_API = 'https://api.worldbank.org/v2/';
const WB_SLOTS = 6;

/**
 * makeWorldBankReader({ readWithin, clockFor }) → { read, clock }
 * The reader below, built on the two functions it needs — the app builds it once on js/fetch-deadline.js and
 * js/proxy-fetch.js (`readWorldBank` / `wbClock`); a check builds it on a stubbed fetch and a short clock, so what it
 * runs is this code and not a copy of it.
 *
 * read({ code, country, date, mrnev, perPage, source, scale, idle, keep })
 *   → Promise<{ status:'ok'|'none'|'unavailable', rows:{iso3,date,y,v}[], late?:boolean, error?:any }> — never rejects
 *   code     one series code                         country  ISO3 / ISO2 / 'all' (the default)
 *   date     '2022' or '1970:2030'                    mrnev    most recent non-empty values (1 = each country's latest)
 *   perPage  the page size (one page is read)         source   the WDI source id (the catalogue's `source`)
 *   scale    × the World Bank's clock — what a retry policy doubles     idle  the clock measures silence (a big body)
 *   keep     false = share the read while it is in flight, keep nothing after (a caller that keeps its own derived form)
 * clock() — the World Bank's clock at scale 1, the base a caller's retry policy (js/fetch-deadline.js untilObserved) waits by
 */
export function makeWorldBankReader(deps) {
  /* the dependencies under the names the app's own readers use, so tests/stalled-fetch-and-surface-gauge-checks ⑦ — «a read of a
     host with its own clock takes that clock from clockFor()» — reads THIS read as what it is */
  const readWithin = deps.readWithin, clockFor = deps.clockFor;
  const kept = new Map();      /* address → the Promise of its answer: one in flight, or a settled 'ok' / 'none' */
  const queue = []; let active = 0;
  const pump = () => { while (active < WB_SLOTS && queue.length) { const job = queue.shift(); active++; job().finally(() => { active--; pump(); }); } };
  const slot = (fn) => new Promise((res) => { queue.push(() => fn().then(res)); pump(); });
  function read(o) {
    const q = o || {};
    const u = 'https://api.worldbank.org/v2/country/' + encodeURIComponent(q.country || 'all') + '/indicator/' + encodeURIComponent(q.code)
      + '?format=json' + (q.source ? '&source=' + q.source : '') + (q.date ? '&date=' + q.date : '') + (q.mrnev ? '&mrnev=' + q.mrnev : '')
      + '&per_page=' + (q.perPage || 400);
    const scale = +q.scale || 1;
    const key = u + '#' + scale;
    if (kept.has(key)) return kept.get(key);
    const p = slot(() => readWithin(u, clockFor(u) * scale, undefined, q.idle ? { idle: true } : undefined)
      .then((r) => {
        const j = JSON.parse(r.text);
        if (!Array.isArray(j)) return { status: 'unavailable', rows: [], late: false };   /* the host answered, and not with the API's shape */
        const rows = (Array.isArray(j[1]) ? j[1] : []).filter((d) => d && d.value != null)
          .map((d) => ({ iso3: d.countryiso3code || (d.country && d.country.id) || '', date: String(d.date), y: +d.date, v: +d.value }));
        return { status: rows.length ? 'ok' : 'none', rows };
      })
      .catch((e) => ({ status: 'unavailable', rows: [], late: isUnobserved(e), error: e })))
      .then((r) => { if (r.status === 'unavailable' || q.keep === false) { if (kept.get(key) === p) kept.delete(key); } return r; });
    kept.set(key, p);
    return p;
  }
  return { read, clock: () => clockFor(WB_API) };
}
const READER = makeWorldBankReader({ readWithin, clockFor });
/** the World Bank read — see makeWorldBankReader above for its options and its answer */
export function readWorldBank(o) { return READER.read(o); }
/** the World Bank's clock at scale 1 */
export function wbClock() { return READER.clock(); }
