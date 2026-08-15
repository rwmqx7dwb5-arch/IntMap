/* ============================================================================
 *  IntMap · World-Bank indicator choropleths + latest-stats refresh — IntMapModules.wbLayers  (#R164)
 * ----------------------------------------------------------------------------
 *  window.IntMapWB — the cached World-Bank indicator fetch (mrnev with date-range fallback), the
 *  WDI choropleth layers built from it, and the one-shot "refresh Stats to latest WB figures" pass.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R164): the body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      currentLang -> HOST.lang, currentMode -> HOST.mode
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.wbLayers=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const computeFilteredNews=HOST.computeFilteredNews, countryStats=HOST.countryStats, imToast=HOST.imToast, loadCountryData=HOST.loadCountryData, renderStats=HOST.renderStats, searchVal=HOST.searchVal;
  (function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return;
    const jp=()=>HOST.lang==='jp';
    function ensureGeo(cb){ try{ if(window.countryGeo&&window.countryGeo.features) return cb(window.countryGeo); if(typeof loadCountryData==='function'){ loadCountryData().then(()=>cb(window.countryGeo)); return; } }catch(_){} cb(null); }
    const iso=(p)=>{ p=p||{}; return p.ISO_A3_EH||p.ISO_A3||p.ADM0_A3||p.SOV_A3||p.iso_a3||p.ADM0_A3_US||''; };
    const wbCache={};
    /* (#R32) Resilient fetch. Two real-world failures it now survives:
       (1) Newer WDI indicators (e.g. the AR5 CO₂ series) RETURN A SERVER ERROR for `mrnev=1` on country/all
           → the old code silently got empty data = "CO₂が映らない". We FALL BACK to a date-range query and
           pick each country's most-recent non-null year.
       (2) The WB API throttles rapid bursts → empty. We only CACHE non-empty results so a throttled attempt
           recovers on the next toggle, and the range fallback acts as a second attempt. */
    function wbFetch(code){ if(wbCache[code]) return Promise.resolve(wbCache[code]);
      const base='https://api.worldbank.org/v2/country/all/indicator/'+code+'?format=json';
      const mrnev=(j)=>{ const arr=(j&&j[1])||[]; const m={}; arr.forEach(d=>{ if(d&&d.value!=null&&d.countryiso3code) m[d.countryiso3code]={v:+d.value,y:d.date}; }); return m; };
      const range=(j)=>{ const arr=(j&&j[1])||[]; const m={}; arr.forEach(d=>{ if(d&&d.value!=null&&d.countryiso3code){ const cur=m[d.countryiso3code]; if(!cur||(+d.date)>(+cur.y)) m[d.countryiso3code]={v:+d.value,y:d.date}; } }); return m; };
      const tryMrnev=()=>fetch(base+'&mrnev=1&per_page=400').then(r=>r.json()).then(mrnev).catch(()=>({}));
      const tryRange=()=>fetch(base+'&date=2010:2024&per_page=20000').then(r=>r.json()).then(range).catch(()=>({}));
      return tryMrnev().then(m=>Object.keys(m).length?m:tryRange())
        .then(m=>{ if(Object.keys(m).length) wbCache[code]=m; return m; }).catch(()=>({}));
    }
    /* (#R40) expose the WB indicator fetch (cached, latest value per country) so the Correlation/Scatter tool
       can offer the full World-Bank indicator set as axes ("対応する項目を大幅に増やして"). */
    try{ window.IntMapWB={ fetch:wbFetch, get:(code)=>wbCache[code]||null }; }catch(_){}
    const LA=window.IntMapLang.pickArgs(), LWB=window.IntMapLang.pick(()=>HOST.lang);
    const WB=[
      {id:'wbco2', code:'EN.GHG.CO2.PC.CE.AR5', n:LA('CO₂ per capita','1人当たりCO₂排出','CO₂ pro Kopf','CO₂ на душу','CO₂ per cápita'), ramp:[0,'#1a9850',2,'#a6d96a',5,'#fee08b',10,'#f46d43',20,'#a50026'], unit:' t'},   /* (#R32) old EN.ATM.CO2E.PC was discontinued by the World Bank (returned 0 rows) → current AR5 per-capita series */
      {id:'wburb', code:'SP.URB.TOTL.IN.ZS', n:LA('Urban population %','都市人口率','Stadtbevölkerung %','Городское население %','Población urbana %'), ramp:[20,'#fee08b',40,'#a6d96a',60,'#66bd63',80,'#1a9850',95,'#006837'], unit:'%'},
      {id:'wbelec', code:'EG.ELC.ACCS.ZS', n:LA('Electricity access %','電力アクセス率','Stromzugang %','Доступ к электричеству %','Acceso a electricidad %'), ramp:[20,'#a50026',50,'#f46d43',80,'#fee08b',95,'#a6d96a',100,'#1a9850'], unit:'%'},
      {id:'wbhealth', code:'SH.XPD.CHEX.GD.ZS', n:LA('Health spend %GDP','医療支出 対GDP','Gesundheitsausgaben % BIP','Расходы на здравоохранение % ВВП','Gasto en salud % PIB'), ramp:[2,'#fff7ec',4,'#fdd49e',8,'#fc8d59',12,'#d7301f',18,'#7f0000'], unit:'%'},
      {id:'wbforest', code:'AG.LND.FRST.ZS', n:LA('Forest area %','森林面積率','Waldfläche %','Площадь лесов %','Superficie forestal %'), ramp:[5,'#f6e8c3',20,'#c7eae5',40,'#80cdc1',60,'#35978f',80,'#01665e'], unit:'%'},
      {id:'wbrenew', code:'EG.FEC.RNEW.ZS', n:LA('Renewable energy %','再エネ比率','Erneuerbare Energie %','Возобновляемая энергия %','Energía renovable %'), ramp:[5,'#fff7ec',20,'#fdd49e',40,'#a6d96a',60,'#66bd63',85,'#006837'], unit:'%'},
      {id:'wbmobile', code:'IT.CEL.SETS.P2', n:LA('Mobile subs /100','携帯契約 /100人','Mobilfunkverträge /100','Моб. абоненты /100','Líneas móviles /100'), ramp:[30,'#fee08b',80,'#a6d96a',110,'#66bd63',140,'#1a9850',180,'#006837'], unit:''},
      {id:'wbinfl', code:'FP.CPI.TOTL.ZG', n:LA('Inflation % (CPI)','インフレ率 (CPI)','Inflation % (VPI)','Инфляция % (ИПЦ)','Inflación % (IPC)'), ramp:[0,'#1a9850',3,'#a6d96a',6,'#fee08b',15,'#f46d43',40,'#a50026'], unit:'%'},
      /* (#R33) +16 NEW beta choropleths (World Bank, latest value per country) — "最低20レイヤーをβに追加". */
      {id:'wbinfmort', code:'SP.DYN.IMRT.IN', n:LA('Infant mortality /1k','乳児死亡率 /1k','Säuglingssterblichkeit /1k','Младенческая смертность /1k','Mortalidad infantil /1k'), ramp:[2,'#1a9850',8,'#a6d96a',25,'#fee08b',50,'#f46d43',90,'#a50026'], unit:''},
      {id:'wbgdpgrow', code:'NY.GDP.MKTP.KD.ZG', n:LA('GDP growth %','GDP成長率 %','BIP-Wachstum %','Рост ВВП %','Crecimiento del PIB %'), ramp:[-6,'#a50026',-1,'#f46d43',2,'#fee08b',5,'#a6d96a',9,'#1a9850'], unit:'%'},
      {id:'wblit', code:'SE.ADT.LITR.ZS', n:LA('Literacy rate %','識字率 %','Alphabetisierungsrate %','Уровень грамотности %','Tasa de alfabetización %'), ramp:[40,'#a50026',60,'#f46d43',80,'#fee08b',92,'#a6d96a',100,'#1a9850'], unit:'%'},
      {id:'wbwater', code:'SH.H2O.SMDW.ZS', n:LA('Safe water access %','安全な水 %','Zugang zu sauberem Wasser %','Доступ к чистой воде %','Acceso a agua potable %'), ramp:[30,'#a50026',55,'#f46d43',75,'#fee08b',90,'#a6d96a',100,'#1a9850'], unit:'%'},
      {id:'wbsan', code:'SH.STA.SMSS.ZS', n:LA('Sanitation access %','衛生設備 %','Sanitärversorgung %','Доступ к санитарии %','Acceso a saneamiento %'), ramp:[20,'#a50026',45,'#f46d43',70,'#fee08b',90,'#a6d96a',100,'#1a9850'], unit:'%'},
      {id:'wbpov', code:'SI.POV.DDAY', n:LA('Extreme poverty %','極度の貧困 %','Extreme Armut %','Крайняя бедность %','Pobreza extrema %'), ramp:[0,'#1a9850',2,'#a6d96a',10,'#fee08b',30,'#f46d43',60,'#a50026'], unit:'%'},
      {id:'wbgini', code:'SI.POV.GINI', n:LA('Income inequality (Gini)','所得格差 (ジニ)','Einkommensungleichheit (Gini)','Неравенство доходов (Джини)','Desigualdad de ingresos (Gini)'), ramp:[25,'#1a9850',32,'#a6d96a',38,'#fee08b',45,'#f46d43',60,'#a50026'], unit:''},
      {id:'wbtrade', code:'NE.TRD.GNFS.ZS', n:LA('Trade % of GDP','貿易 対GDP %','Handel % des BIP','Торговля % ВВП','Comercio % del PIB'), ramp:[20,'#fff7ec',50,'#fdd49e',90,'#fc8d59',150,'#d7301f',300,'#7f0000'], unit:'%'},
      {id:'wbtax', code:'GC.TAX.TOTL.GD.ZS', n:LA('Tax revenue % GDP','税収 対GDP %','Steuereinnahmen % BIP','Налоговые доходы % ВВП','Ingresos fiscales % PIB'), ramp:[5,'#fff7ec',12,'#fdd49e',20,'#a6d96a',30,'#66bd63',45,'#006837'], unit:'%'},
      {id:'wbagri', code:'AG.LND.AGRI.ZS', n:LA('Agricultural land %','農地率 %','Landwirtschaftsfläche %','Сельхозземли %','Tierras agrícolas %'), ramp:[5,'#f6e8c3',25,'#dfc27d',45,'#c7eae5',65,'#80cdc1',85,'#01665e'], unit:'%'},
      {id:'wbphys', code:'SH.MED.PHYS.ZS', n:LA('Physicians /1k','医師 /1k人','Ärzte /1k','Врачи /1k','Médicos /1k'), ramp:[0.1,'#a50026',0.5,'#f46d43',1.5,'#fee08b',3,'#a6d96a',6,'#1a9850'], unit:''},
      {id:'wbschool', code:'SE.SEC.ENRR', n:LA('Secondary enrollment %','中等教育就学 %','Sekundarschulquote %','Охват средним образованием %','Matrícula secundaria %'), ramp:[30,'#a50026',55,'#f46d43',80,'#fee08b',100,'#a6d96a',130,'#1a9850'], unit:'%'},
      {id:'wbelecuse', code:'EG.USE.ELEC.KH.PC', n:LA('Electricity use /capita (kWh)','電力消費 /人 (kWh)','Stromverbrauch /Kopf (kWh)','Потребление электроэнергии /чел (кВт·ч)','Consumo eléctrico /cápita (kWh)'), ramp:[100,'#fff7ec',1000,'#fdd49e',4000,'#fc8d59',10000,'#d7301f',20000,'#7f0000'], unit:''},
      {id:'wbrenelec', code:'EG.ELC.RNEW.ZS', n:LA('Renewable electricity %','再エネ電力 %','Erneuerbarer Strom %','Возобновляемое электричество %','Electricidad renovable %'), ramp:[5,'#fff7ec',25,'#fdd49e',50,'#a6d96a',75,'#66bd63',100,'#006837'], unit:'%'},
      {id:'wbfdi', code:'BX.KLT.DINV.WD.GD.ZS', n:LA('FDI inflow % GDP','対内直接投資 対GDP %','ADI-Zufluss % BIP','Приток ПИИ % ВВП','Entrada de IED % PIB'), ramp:[-2,'#a50026',1,'#fee08b',4,'#a6d96a',8,'#66bd63',15,'#006837'], unit:'%'},
      {id:'wbmilppl', code:'MS.MIL.TOTL.P1', n:LA('Armed forces personnel','軍人数','Streitkräftepersonal','Численность вооружённых сил','Personal de fuerzas armadas'), ramp:[5000,'#fff7ec',50000,'#fdd49e',200000,'#fc8d59',800000,'#d7301f',2000000,'#7f0000'], unit:''},
      /* (#R34) +8 more beta choropleths (World Bank) — same resilient mrnev+range fetch, hover values + source note. */
      {id:'wblife', code:'SP.DYN.LE00.IN', n:LA('Life expectancy','平均寿命','Lebenserwartung','Продолжительность жизни','Esperanza de vida'), ramp:[50,'#a50026',60,'#f46d43',70,'#fee08b',78,'#a6d96a',85,'#1a9850'], unit:' yr'},
      {id:'wbunemp', code:'SL.UEM.TOTL.ZS', n:LA('Unemployment %','失業率 %','Arbeitslosigkeit %','Безработица %','Desempleo %'), ramp:[2,'#1a9850',5,'#a6d96a',10,'#fee08b',20,'#f46d43',35,'#a50026'], unit:'%'},
      {id:'wbnet', code:'IT.NET.USER.ZS', n:LA('Internet users %','インターネット利用率 %','Internetnutzer %','Пользователи интернета %','Usuarios de internet %'), ramp:[10,'#a50026',30,'#f46d43',55,'#fee08b',80,'#a6d96a',98,'#1a9850'], unit:'%'},
      {id:'wbdebt', code:'GC.DOD.TOTL.GD.ZS', n:LA('Govt debt % GDP','政府債務 対GDP %','Staatsverschuldung % BIP','Госдолг % ВВП','Deuda pública % PIB'), ramp:[20,'#1a9850',45,'#a6d96a',70,'#fee08b',110,'#f46d43',180,'#a50026'], unit:'%'},
      {id:'wbmanuf', code:'NV.IND.MANF.ZS', n:LA('Manufacturing % GDP','製造業 対GDP %','Verarbeitendes Gewerbe % BIP','Обрабатывающая пром. % ВВП','Manufactura % PIB'), ramp:[5,'#fff7ec',12,'#fdd49e',20,'#fc8d59',28,'#d7301f',40,'#7f0000'], unit:'%'},
      {id:'wbu5mort', code:'SH.DYN.MORT', n:LA('Under-5 mortality /1k','5歳未満死亡率 /1k','Sterblichkeit unter 5 J. /1k','Смертность до 5 лет /1k','Mortalidad de menores de 5 /1k'), ramp:[3,'#1a9850',10,'#a6d96a',30,'#fee08b',70,'#f46d43',120,'#a50026'], unit:''},
      {id:'wbpopgrow', code:'SP.POP.GROW', n:LA('Population growth %','人口増加率 %','Bevölkerungswachstum %','Прирост населения %','Crecimiento demográfico %'), ramp:[-1,'#2c7fb8',0,'#7fcdbb',1.5,'#ffffb2',3,'#fe9929',5,'#cc4c02'], unit:'%'},
      {id:'wbenergy', code:'EG.USE.PCAP.KG.OE', n:LA('Energy use /capita','エネルギー消費 /人','Energieverbrauch /Kopf','Потребление энергии /чел','Consumo de energía /cápita'), ramp:[200,'#fff7ec',1000,'#fdd49e',3000,'#fc8d59',6000,'#d7301f',12000,'#7f0000'], unit:''},
      /* (#R122) +6 NEW beta choropleths (World Bank, latest value per country — same resilient mrnev fetch, hover values + source note). */
      {id:'wbrnd', code:'GB.XPD.RSDV.GD.ZS', n:LA('R&D spending % GDP','研究開発費 対GDP %','F&E-Ausgaben % BIP','Расходы на НИОКР % ВВП','Gasto en I+D % PIB'), ramp:[0.1,'#fff7ec',0.5,'#fdd49e',1.5,'#a6d96a',2.5,'#66bd63',4.5,'#006837'], unit:'%'},
      {id:'wbtour', code:'ST.INT.ARVL', n:LA('Intl. tourist arrivals','外国人観光客数','Touristenankünfte','Прибытия туристов','Llegadas de turistas int.'), ramp:[500000,'#fff7ec',3000000,'#fdd49e',10000000,'#fc8d59',40000000,'#d7301f',90000000,'#7f0000'], unit:''},
      {id:'wbref', code:'SM.POP.REFG', n:LA('Refugees hosted','難民受入数','Aufgenommene Flüchtlinge','Принято беженцев','Refugiados acogidos'), ramp:[1000,'#fff7ec',20000,'#fee08b',100000,'#fc8d59',500000,'#d7301f',2000000,'#7f0000'], unit:''},
      {id:'wbco2t', code:'EN.GHG.CO2.MT.CE.AR5', n:LA('CO₂ emissions (Mt)','CO₂排出量（百万t）','CO₂-Emissionen (Mt)','Выбросы CO₂ (млн т)','Emisiones de CO₂ (Mt)'), ramp:[5,'#1a9850',50,'#a6d96a',300,'#fee08b',1500,'#f46d43',10000,'#a50026'], unit:' Mt'},
      {id:'wbpatent', code:'IP.PAT.RESD', n:LA('Patent applications (resident)','特許出願数（居住者）','Patentanmeldungen','Патентные заявки','Solicitudes de patentes (residentes)'), ramp:[10,'#fff7ec',500,'#fdd49e',5000,'#fc8d59',50000,'#d7301f',500000,'#7f0000'], unit:''},
      {id:'wbwomparl', code:'SG.GEN.PARL.ZS', n:LA('Women in parliament %','女性議員比率 %','Frauen im Parlament %','Женщины в парламенте %','Mujeres en el parlamento %'), ramp:[5,'#a50026',15,'#f46d43',30,'#fee08b',45,'#a6d96a',60,'#1a9850'], unit:'%'},
      /* (#R123) +8 NEW beta choropleths (World Bank, latest value per country — same resilient mrnev fetch, hover
         values + source note; auto-wired into the layer list, Others(beta), Atlas layer-data + point sampling). */
      {id:'wbpm25', code:'EN.ATM.PM25.MC.M3', n:LA('PM2.5 air pollution (µg/m³)','PM2.5大気汚染（µg/m³）','PM2,5-Luftverschmutzung (µg/m³)','Загрязнение PM2.5 (мкг/м³)','Contaminación por PM2,5 (µg/m³)'), ramp:[5,'#1a9850',10,'#a6d96a',25,'#fee08b',50,'#f46d43',100,'#a50026'], unit:' µg/m³'},
      {id:'wbcook', code:'EG.CFT.ACCS.ZS', n:LA('Clean cooking fuel access %','クリーン調理燃料 普及率 %','Zugang zu sauberem Kochbrennstoff %','Доступ к чистому топливу для готовки %','Acceso a cocina limpia %'), ramp:[10,'#a50026',40,'#f46d43',70,'#fee08b',90,'#a6d96a',100,'#1a9850'], unit:'%'},
      {id:'wbflfp', code:'SL.TLF.CACT.FE.ZS', n:LA('Female labor participation %','女性労働参加率 %','Frauenerwerbsquote %','Участие женщин в раб. силе %','Participación laboral femenina %'), ramp:[15,'#a50026',30,'#f46d43',45,'#fee08b',60,'#a6d96a',80,'#1a9850'], unit:'%'},
      {id:'wbtert', code:'SE.TER.ENRR', n:LA('Tertiary enrollment %','高等教育就学率 %','Hochschulquote %','Охват высшим образованием %','Matrícula terciaria %'), ramp:[5,'#fff7ec',20,'#fdd49e',40,'#fc8d59',65,'#66bd63',95,'#006837'], unit:'%'},
      {id:'wbrural', code:'SP.RUR.TOTL.ZS', n:LA('Rural population %','農村人口比率 %','Landbevölkerung %','Сельское население %','Población rural %'), ramp:[10,'#2c7fb8',30,'#7fcdbb',50,'#ffffb2',70,'#fe9929',90,'#cc4c02'], unit:'%'},
      {id:'wbgni', code:'NY.GNP.PCAP.CD', n:LA('GNI per capita (Atlas, US$)','一人当たりGNI（アトラス法, US$）','BNE pro Kopf (Atlas, US$)','ВНД на душу (Атлас, US$)','INB per cápita (Atlas, US$)'), ramp:[1000,'#fff7ec',5000,'#fdd49e',15000,'#fc8d59',40000,'#66bd63',90000,'#006837'], unit:''},
      {id:'wbunder', code:'SN.ITK.DEFC.ZS', n:LA('Undernourishment %','栄養不足人口比率 %','Unterernährung %','Недоедание %','Subalimentación %'), ramp:[2.5,'#1a9850',10,'#a6d96a',25,'#fee08b',40,'#f46d43',60,'#a50026'], unit:'%'},
      {id:'wbhitech', code:'TX.VAL.TECH.MF.ZS', n:LA('High-tech exports %','ハイテク製品輸出比率 %','Hightech-Exporte %','Высокотехнологичный экспорт %','Exportaciones de alta tecnología %'), ramp:[1,'#fff7ec',5,'#fdd49e',15,'#fc8d59',30,'#66bd63',50,'#006837'], unit:'%'},
      /* (#R124) +6 more beta choropleths (World Bank, latest value per country — auto-wired like the rest). */
      {id:'wbbbnd', code:'IT.NET.BBND.P2', n:LA('Fixed broadband /100','固定ブロードバンド /100人','Festnetz-Breitband /100','Фикс. широкополосный /100','Banda ancha fija /100'), ramp:[1,'#a50026',5,'#f46d43',15,'#fee08b',30,'#a6d96a',45,'#1a9850'], unit:''},
      {id:'wbaging', code:'SP.POP.65UP.TO.ZS', n:LA('Population 65+ %','65歳以上人口比率 %','Bevölkerung 65+ %','Население 65+ %','Población de 65+ %'), ramp:[2,'#fff7ec',7,'#fdd49e',14,'#fc8d59',21,'#d7301f',30,'#7f0000'], unit:'%'},
      {id:'wbadofert', code:'SP.ADO.TFRT', n:LA('Adolescent fertility /1k','思春期出生率 /1k','Teenager-Geburtenrate /1k','Подростковая рождаемость /1k','Fecundidad adolescente /1k'), ramp:[2,'#1a9850',15,'#a6d96a',40,'#fee08b',80,'#f46d43',130,'#a50026'], unit:''},
      {id:'wbbeds', code:'SH.MED.BEDS.ZS', n:LA('Hospital beds /1k','病床数 /1k人','Krankenhausbetten /1k','Больничные койки /1k','Camas hospitalarias /1k'), ramp:[0.5,'#a50026',2,'#f46d43',4,'#fee08b',8,'#a6d96a',13,'#1a9850'], unit:''},
      {id:'wbresearch', code:'SP.POP.SCIE.RD.P6', n:LA('Researchers /million','研究者数 /100万人','Forscher /Mio.','Исследователи /млн','Investigadores /millón'), ramp:[50,'#fff7ec',500,'#fdd49e',2000,'#fc8d59',5000,'#66bd63',8000,'#006837'], unit:''},
      {id:'wboverwt', code:'SH.STA.OWAD.ZS', n:LA('Overweight adults %','成人過体重率 %','Übergewichtige Erwachsene %','Избыточный вес у взрослых %','Adultos con sobrepeso %'), ramp:[10,'#1a9850',25,'#a6d96a',40,'#fee08b',55,'#f46d43',70,'#a50026'], unit:'%'},
      /* (#R125) +6 more beta choropleths (World Bank, latest value per country — auto-wired like the rest). */
      {id:'wburban', code:'SP.URB.TOTL.IN.ZS', n:LA('Urban population %','都市人口比率 %','Stadtbevölkerung %','Городское население %','Población urbana %'), ramp:[20,'#edf8e9',40,'#bae4b3',60,'#74c476',80,'#31a354',95,'#006d2c'], unit:'%'},
      {id:'wbtourism', code:'ST.INT.ARVL', n:LA('Tourist arrivals','外国人観光客数','Touristenankünfte','Прибытия туристов','Llegadas de turistas'), ramp:[100000,'#fff7fb',1000000,'#d0d1e6',5000000,'#74a9cf',20000000,'#0570b0',60000000,'#023858'], unit:''},
      {id:'wbremit', code:'BX.TRF.PWKR.DT.GD.ZS', n:LA('Remittances % GDP','海外送金受取 %GDP','Rücküberweisungen % BIP','Денежные переводы % ВВП','Remesas % PIB'), ramp:[0.5,'#fff7ec',2,'#fdd49e',5,'#fc8d59',12,'#d7301f',25,'#7f0000'], unit:'%'},
      {id:'wbsuicide', code:'SH.STA.SUIC.P5', n:LA('Suicide rate /100k','自殺率 /10万人','Suizidrate /100k','Уровень суицида /100k','Tasa de suicidio /100k'), ramp:[3,'#1a9850',7,'#a6d96a',12,'#fee08b',20,'#f46d43',30,'#a50026'], unit:''},
      {id:'wbalcohol', code:'SH.ALC.PCAP.LI', n:LA('Alcohol per capita L','一人当たり飲酒量 L','Alkohol pro Kopf L','Алкоголь на душу, л','Alcohol per cápita L'), ramp:[1,'#fff7ec',4,'#fdd49e',7,'#fc8d59',10,'#d7301f',14,'#7f0000'], unit:' L'},
      {id:'wbhomicide', code:'VC.IHR.PSRC.P5', n:LA('Homicide rate /100k','殺人発生率 /10万人','Mordrate /100k','Убийства /100k','Tasa de homicidios /100k'), ramp:[1,'#1a9850',3,'#a6d96a',8,'#fee08b',20,'#f46d43',40,'#a50026'], unit:''},
      /* (#R126) +6 more beta choropleths (World Bank, latest value per country — auto-wired like the rest). */
      {id:'wbmilgdp', code:'MS.MIL.XPND.GD.ZS', n:LA('Military spending % GDP','軍事費 %GDP','Militärausgaben % BIP','Военные расходы % ВВП','Gasto militar % PIB'), ramp:[0.5,'#1a9850',1.5,'#a6d96a',2.5,'#fee08b',4,'#f46d43',8,'#a50026'], unit:'%'},
      {id:'wbfert', code:'SP.DYN.TFRT.IN', n:LA('Fertility rate (births/woman)','合計特殊出生率','Geburtenrate (Kinder/Frau)','Суммарный коэфф. рождаемости','Tasa de fecundidad (hijos/mujer)'), ramp:[1.2,'#2c7fb8',1.8,'#7fcdbb',2.5,'#ffffb2',4,'#fe9929',6,'#cc4c02'], unit:''},
      {id:'wbdensity', code:'EN.POP.DNST', n:LA('Population density /km²','人口密度 /km²','Bevölkerungsdichte /km²','Плотность населения /км²','Densidad de población /km²'), ramp:[5,'#fff7ec',25,'#fdd49e',100,'#fc8d59',300,'#d7301f',1000,'#7f0000'], unit:'/km²'},
      {id:'wbedu', code:'SE.XPD.TOTL.GD.ZS', n:LA('Education spending % GDP','教育支出 %GDP','Bildungsausgaben % BIP','Расходы на образование % ВВП','Gasto en educación % PIB'), ramp:[2,'#a50026',3,'#f46d43',4.5,'#fee08b',6,'#a6d96a',8,'#1a9850'], unit:'%'},
      {id:'wbsmoke', code:'SH.PRV.SMOK', n:LA('Smoking prevalence %','喫煙率 %','Raucherquote %','Распространённость курения %','Prevalencia de tabaquismo %'), ramp:[8,'#1a9850',15,'#a6d96a',22,'#fee08b',30,'#f46d43',40,'#a50026'], unit:'%'},
      {id:'wbagremp', code:'SL.AGR.EMPL.ZS', n:LA('Employment in agriculture %','農業就業率 %','Beschäftigung Landwirtschaft %','Занятость в сельском хоз-ве %','Empleo en agricultura %'), ramp:[2,'#fff7ec',10,'#fdd49e',25,'#fc8d59',45,'#d7301f',70,'#7f0000'], unit:'%'}
    ];
    /* (#R32) Hover tooltip for every beta choropleth ("ホバーして数値が出るように") — reuses the shared map
       tooltip so it matches HDI/pop. Shows the country name, the metric and its value. */
    function _wbHover(L,fill){ if(window['_wbhov_'+fill]) return; window['_wbhov_'+fill]=true;
      const fmt=(v)=>{ if(v==null) return '—'; const a=Math.abs(v); const r=(a>=100?Math.round(v):Math.round(v*10)/10); return r+(L.unit||''); };
      GE().events.onLayer('mousemove',fill,(e)=>{ if(!e.features||!e.features.length) return; GE().render.canvas().style.cursor='pointer'; const p=e.features[0].properties||{};
        try{ const el=window.ensureMapTooltip(); el.style.display='block'; el.innerHTML='<div style="font-weight:600;">'+(p.nm||'')+'</div><div style="color:var(--text-muted);font-size:11px;margin-top:2px;">'+(bxLabel(L))+'</div><div style="font-weight:700;margin-top:3px;">'+fmt(p.v)+'</div>'; window.positionTooltip(e.point); }catch(_){} });
      GE().events.onLayer('mouseleave',fill,()=>{ GE().render.canvas().style.cursor=''; try{ const el=window.ensureMapTooltip(); el.style.display='none'; }catch(_){} });
    }
    const _nmOf=(p)=>{ p=p||{}; return p.NAME_EN||p.ADMIN||p.name_en||p.NAME||p.name||p.NAME_LONG||p.ADM0_A3||''; };
    /* (#R37) IMF WEO (Oct 2024) GENERAL government gross debt, % of GDP — a broad, authoritative fallback for the
       Govt-debt layer, whose World-Bank series (GC.DOD.TOTL.GD.ZS = CENTRAL government debt) is reported by only
       ~half the world ("データのない国が多すぎる"). Merged ONLY where the World Bank has no value, and source-noted.
       This mirrors how HDI / Democracy / military-spend are embedded real datasets. Genuinely unreported states
       are omitted (they stay gray) rather than fabricated. */
    const DEBT_IMF_GG={JPN:251,GRC:159,ITA:135,USA:121,SGP:175,FRA:111,ESP:105,BEL:105,CAN:107,PRT:99,GBR:101,CYP:73,AUT:78,SVN:67,HUN:74,DEU:64,FIN:77,IRL:43,NLD:47,SWE:34,DNK:30,NOR:42,CHE:38,POL:55,CZE:45,SVK:59,HRV:62,ROU:52,BGR:24,EST:22,LVA:45,LTU:38,LUX:27,ISL:61,MLT:50,
      MEX:53,BRA:85,ARG:155,CHL:41,COL:55,PER:34,URY:62,ECU:55,BOL:84,PRY:40,PAN:54,CRI:63,DOM:60,SLV:73,GTM:28,HND:51,JAM:72,
      CHN:88,IND:83,IDN:39,KOR:55,THA:64,MYS:67,PHL:57,VNM:35,PAK:71,BGD:39,LKA:108,NPL:48,KHM:36,MMR:60,MNG:46,
      SAU:27,ARE:30,ISR:62,TUR:35,IRN:34,IRQ:44,EGY:96,JOR:89,QAT:45,KWT:8,OMN:36,BHR:122,LBN:150,YEM:78,
      ZAF:75,NGA:46,MAR:70,TUN:80,KEN:70,GHA:84,AGO:85,ETH:37,ZMB:113,MOZ:92,CIV:58,SEN:81,CMR:43,UGA:50,TZA:47,COD:21,SDN:152,NAM:66,BWA:24,MUS:80,
      AUS:50,NZL:46,FJI:80,RUS:20,UKR:88,KAZ:24,UZB:35,GEO:39,ARM:50,AZE:22,BLR:42,SRB:48,MKD:52,ALB:59,BIH:30,MNE:64,MDA:36};
    function choroOn(L){ ensureGeo(geo=>{ if(!geo) return; wbFetch(L.code).then(m=>{
      /* (#R37) Paint EVERY country, not only the ones WITH data: countries the World Bank has no value for now
         carry NO `v` property and are rendered NEUTRAL GRAY (like the core HDI/pop choropleths), instead of
         showing nothing ("レイヤーにおいて、データのない国は灰色にするように" + "Govt Debt にデータのない国が多すぎる"
         — the gray makes the real coverage gaps honest and visible rather than invisible). */
      if(L.id==='wbdebt'){ try{ Object.keys(DEBT_IMF_GG).forEach(k=>{ if(!(m[k]&&m[k].v!=null)) m[k]={v:DEBT_IMF_GG[k],y:'2024',imf:true}; }); }catch(_){} }
      const feats=[]; let withData=0; geo.features.forEach(f=>{ const d=m[iso(f.properties||{})]; const props={nm:_nmOf(f.properties)}; if(d&&d.v!=null){ props.v=d.v; withData++; } feats.push({type:'Feature',geometry:f.geometry,properties:props}); });
      if(!withData){ try{ if(typeof imToast==='function') imToast(window.IntMapLang.t(HOST.lang,"No data right now — please try again in a moment.","データを取得できませんでした。少し待って再試行してください。","Derzeit keine Daten — bitte gleich erneut versuchen.","Сейчас данных нет — попробуйте через мгновение.","Ahora mismo no hay datos; inténtelo en un momento.")); }catch(_){} }
      const fc={type:'FeatureCollection',features:feats}, src='src-'+L.id, fill=L.id+'-fill', line=L.id+'-line';
      try{ if(GE().layers.hasSource(src)) GE().layers.setSourceData(src,fc); else { GE().layers.addSource(src,{type:'geojson',data:fc});
        GE().layers.add({id:fill,type:'fill',source:src,paint:{'fill-color':['case',['has','v'],['interpolate',['linear'],['get','v']].concat(L.ramp),'#9aa0a6'],'fill-opacity':['case',['has','v'],0.62,0.42]}});
        GE().layers.add({id:line,type:'line',source:src,paint:{'line-color':'rgba(0,0,0,0.16)','line-width':0.3}}); _wbHover(L,fill); } }catch(_){}
      const cb=document.getElementById('bx-'+L.id), on=cb?cb.checked:true;
      [fill,line].forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility',on?'visible':'none'); }catch(_){} });
      try{ if(on&&window._registerLayerOpacity){ const el=window._registerLayerOpacity(L.id,L.n,[fill,line],'bx-'+L.id); if(el){ const ramp=L.ramp,parts=[]; for(let i=0;i<ramp.length;i+=2) parts.push('<span style="display:inline-flex;align-items:center;gap:3px;"><span style="width:11px;height:11px;border-radius:2px;background:'+ramp[i+1]+';"></span>'+ramp[i]+L.unit+'</span>'); let kk=el.querySelector('.bx-key'); if(!kk){ kk=document.createElement('div'); kk.className='bx-key'; kk.style.cssText='display:flex;flex-wrap:wrap;gap:7px;font-size:10px;color:var(--text-muted);margin-top:5px;'; el.appendChild(kk); } kk.innerHTML=parts.join('');
        /* (#R34) State the DATA SOURCE + PERIOD on every World Bank choropleth ("Inflation % (CPI)→データの
           出典と時期を記載しろ"). The period is the actual span of years present in the fetched data (each country
           shows its most-recent available year). */
        let yrs=[]; try{ yrs=Object.values(m).map(d=>+d.y).filter(isFinite); }catch(_){} let ysp=''; if(yrs.length){ const a=Math.min.apply(null,yrs),b=Math.max.apply(null,yrs); ysp=(a===b)?(''+a):(a+'–'+b); }
        let nn=el.querySelector('.bx-note'); if(!nn){ nn=document.createElement('div'); nn.className='bx-note'; nn.style.cssText='font-size:9.5px;color:var(--text-muted);margin-top:5px;line-height:1.4;'; el.appendChild(nn); }
        nn.textContent=(window.IntMapLang.t(HOST.lang,"Source: World Bank · ","出典: 世界銀行 · ","Quelle: Weltbank · ","Источник: Всемирный банк · ","Fuente: Banco Mundial · "))+L.code+(ysp?(' · '+ysp):'')+(window.IntMapLang.t(HOST.lang," · most recent value per country","（国ごとに最新値）"," · jeweils neuester Wert je Land"," · последнее значение по каждой стране"," · valor más reciente por país"))+(L.id==='wbdebt'?(window.IntMapLang.t(HOST.lang," + IMF WEO general govt gross debt (gap-fill)"," ＋ IMF WEO（一般政府総債務）で補完"," + IWF WEO Bruttoschuldenstand des Staates (Lückenfüllung)"," + МВФ WEO, валовой долг сектора госуправления (заполнение пробелов)"," + FMI WEO deuda bruta del gobierno general (relleno de huecos)")):''); } } }catch(_){}
    }); }); }
    function choroOff(L){ [L.id+'-fill',L.id+'-line'].forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility','none'); }catch(_){} }); try{ window._hideGenericLegend&&window._hideGenericLegend(L.id); }catch(_){} }

    /* ---------- Earthquakes (USGS realtime feed + historical query) ---------- */
    let eqWin='week', eqClickWired=false;
    function eqUrl(){ if(eqWin==='year') return 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime='+new Date(Date.now()-365*864e5).toISOString().slice(0,10)+'&minmagnitude=6&orderby=time&limit=2000';
      return 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/'+({day:'all_day',week:'all_week',month:'4.5_month'}[eqWin]||'all_week')+'.geojson'; }
    function eqOn(){ fetch(eqUrl()).then(r=>r.json()).then(j=>{ const src='src-eq';
      try{ if(GE().layers.hasSource(src)) GE().layers.setSourceData(src,j); else { GE().layers.addSource(src,{type:'geojson',data:j});
        GE().layers.add({id:'eq-pt',type:'circle',source:src,paint:{'circle-radius':['interpolate',['linear'],['get','mag'],1,2.5,4,6,6,12,8,22],'circle-color':['interpolate',['linear'],['get','mag'],1,'#ffd24d',3,'#ff9500',5,'#ff3b30',7,'#7a0010'],'circle-opacity':0.78,'circle-stroke-color':'rgba(255,255,255,0.6)','circle-stroke-width':0.4}}); } }catch(_){}
      const cb=document.getElementById('bx-eq'), on=cb?cb.checked:true; try{ if(GE().layers.has('eq-pt')) GE().layers.setLayout('eq-pt','visibility',on?'visible':'none'); }catch(_){}
      if(!eqClickWired){ eqClickWired=true; try{ GE().events.onLayer('click','eq-pt',(e)=>{ const p=(e.features&&e.features[0]&&e.features[0].properties)||{}; const when=p.time?new Date(+p.time).toLocaleString():'';
        /* (#R32) className 'plc-popup' → themed dark/light bg + readable text. The default white maplibre popup
           inherited the page text color (near-white in dark mode) = white-on-white "ポップアップがダークモードで
           は見えない". */
        GE().ui.attach(GE().ui.popup({closeButton:true,className:'plc-popup'}).setLngLat(e.lngLat).setHTML('<div style="font-size:12.5px;line-height:1.5;color:var(--text-main);"><b style="color:#ff453a;">M '+(p.mag!=null?(+p.mag).toFixed(1):'?')+'</b><br>'+IntMapSafe.html(p.place||'')+'<br><span style="color:var(--text-muted);">'+when+'</span></div>')); }); GE().events.onLayer('mouseenter','eq-pt',()=>{ GE().render.canvas().style.cursor='pointer'; }); GE().events.onLayer('mouseleave','eq-pt',()=>{ GE().render.canvas().style.cursor=''; }); }catch(_){} }
      try{ if(on&&window._registerLayerOpacity){ const el=window._registerLayerOpacity('eq',LA('Earthquakes (USGS)','地震（USGS）','Erdbeben (USGS)','Землетрясения (USGS)','Terremotos (USGS)'),['eq-pt'],'bx-eq');
        if(el){ let ctl=el.querySelector('.bx-eqwin'); if(!ctl){ ctl=document.createElement('div'); ctl.className='bx-eqwin'; ctl.style.cssText='display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;'; el.appendChild(ctl); }
          const opts=[['day',window.IntMapLang.t(HOST.lang,"24h","24時間","24 h","24 ч","24 h")],['week',window.IntMapLang.t(HOST.lang,"7d","7日","7 T","7 дн","7 d")],['month',window.IntMapLang.t(HOST.lang,"30d M4.5+","30日(M4.5+)","30 T M4,5+","30 дн M4.5+","30 d M4,5+")],['year',window.IntMapLang.t(HOST.lang,"1yr M6+","1年(M6+)","1 J M6+","1 год M6+","1 año M6+")]];
          ctl.innerHTML=opts.map(o=>'<button data-w="'+o[0]+'" style="border:1px solid rgba(128,128,128,0.3);background:'+(eqWin===o[0]?'var(--primary-color)':'var(--input-bg)')+';color:'+(eqWin===o[0]?'#fff':'var(--text-main)')+';border-radius:7px;padding:4px 7px;font-size:10.5px;font-weight:600;cursor:pointer;">'+o[1]+'</button>').join('');
          ctl.querySelectorAll('button').forEach(b=>b.onclick=()=>{ eqWin=b.getAttribute('data-w'); eqOn(); }); } } }catch(_){}
    }).catch(()=>{ try{ if(typeof imToast==='function') imToast(window.IntMapLang.t(HOST.lang,"Could not load earthquake data","地震データを取得できませんでした","Erdbebendaten konnten nicht geladen werden","Не удалось загрузить данные о землетрясениях","No se pudieron cargar los datos sísmicos")); }catch(_){} }); }
    function eqOff(){ try{ if(GE().layers.has('eq-pt')) GE().layers.setLayout('eq-pt','visibility','none'); }catch(_){} try{ window._hideGenericLegend&&window._hideGenericLegend('eq'); }catch(_){} }

    /* ---------- Heat of Attention (news-density heatmap) ---------- */
    function heatPts(){ const pts=[]; try{ (window.newsFeatures||[]).forEach(f=>{ if(f&&f.geometry&&f.geometry.coordinates) pts.push({type:'Feature',geometry:{type:'Point',coordinates:f.geometry.coordinates},properties:{}}); }); }catch(_){}
      if(pts.length<5){ try{ const list=(typeof computeFilteredNews==='function')?computeFilteredNews():[]; list.forEach(it=>{ const a=it&&it.analysis; if(a&&a.loc) pts.push({type:'Feature',geometry:{type:'Point',coordinates:a.loc},properties:{}}); }); }catch(_){} }
      return {type:'FeatureCollection',features:pts}; }
    function heatOn(){ const fc=heatPts(), src='src-heat';
      try{ if(GE().layers.hasSource(src)) GE().layers.setSourceData(src,fc); else { GE().layers.addSource(src,{type:'geojson',data:fc});
        GE().layers.add({id:'heat-h',type:'heatmap',source:src,paint:{'heatmap-intensity':1.1,'heatmap-radius':['interpolate',['linear'],['zoom'],1,18,4,42],'heatmap-opacity':0.72,'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(0,0,255,0)',0.2,'#3b82f6',0.4,'#22c55e',0.6,'#eab308',0.8,'#f97316',1,'#ef4444']}}); } }catch(_){}
      const cb=document.getElementById('bx-heat'), on=cb?cb.checked:true; try{ if(GE().layers.has('heat-h')) GE().layers.setLayout('heat-h','visibility',on?'visible':'none'); }catch(_){}
      try{ if(on&&window._registerLayerOpacity){ const el=window._registerLayerOpacity('heat',LA('Heat of Attention','注目度ヒートマップ','Aufmerksamkeits-Heatmap','Карта внимания','Mapa de calor de atención'),['heat-h'],'bx-heat'); if(el){ let h=el.querySelector('.bx-note'); if(!h){ h=document.createElement('div'); h.className='bx-note'; h.style.cssText='font-size:10px;color:var(--text-muted);margin-top:5px;line-height:1.4;'; el.appendChild(h);} h.textContent=window.IntMapLang.t(HOST.lang,'Estimated from world news density (approximate)','世界のニュース密度から推定（概算）','Geschätzt aus der weltweiten Nachrichtendichte (näherungsweise)','Оценка по плотности мировых новостей (приблизительно)','Estimado a partir de la densidad de noticias mundiales (aproximado)'); } } }catch(_){}
    }
    function heatOff(){ try{ if(GE().layers.has('heat-h')) GE().layers.setLayout('heat-h','visibility','none'); }catch(_){} try{ window._hideGenericLegend&&window._hideGenericLegend('heat'); }catch(_){} }

    const ALL=WB.map(L=>({id:L.id,n:L.n,on:()=>choroOn(L),off:()=>choroOff(L)}))
      .concat([{id:'eq',n:LA('Earthquakes (live + history)','地震（ライブ＋過去）','Erdbeben (live + Verlauf)','Землетрясения (онлайн + история)','Terremotos (en vivo + histórico)'),on:eqOn,off:eqOff},
               {id:'heat',n:LA('Heat of Attention','注目度ヒートマップ','Aufmerksamkeits-Heatmap','Карта внимания','Mapa de calor de atención'),on:heatOn,off:heatOff}]);
    /* ⚠ (#R246) ONE NAME, ONE PLACE. (#R38) gave every beta row a German and Russian label. Every indicator's name was an `{en,jp}` object with a SECOND
       table (`BX_TR`, 34 entries keyed by the English string) bolted on for de/ru — the same quantity
       in two homes ([[intmap-recurring-lessons]] G), no Spanish anywhere, and nothing at all for
       fr/ko/zh/zh-Hans, which read the English. `LA(…)` is IntMapLang.pickArgs(): both tables are now
       ONE call per indicator, and `LWB.arr()` resolves it through pick() itself — de/ru/es from the
       arguments, the rest from the inline table keyed by the English name. BX_TR is gone. */
    const bxLabel=(L)=> LWB.arr(L.n);
    /* (#R121) point-value hooks for the layer-data contract (IntMapLayers 'choropleth'): the value of every
       VISIBLE bx World-Bank choropleth at (lng,lat), read from the layer's OWN painted source data by
       point-in-polygon — works on- and off-screen. Registered here because this module owns these layers. */
    const _bxVis=L=>{ try{ const f=L.id+'-fill'; return !!(GE().layers.has(f)&&GE().layers.getLayout(f,'visibility')==='visible'); }catch(_){ return false; } };
    window._imBxChoroOn=function(){ try{ return WB.some(_bxVis); }catch(_){ return false; } };
    window._imBxChoroValueAt=function(lng,lat){ const out=[];
      try{ if(!window._imPipGeo) return out;
        WB.forEach(L=>{ if(!_bxVis(L)) return;
          const d=GE().layers.sourceData('src-'+L.id); if(!d||!d.features) return;
          for(const f of d.features){ if(f&&f.geometry&&window._imPipGeo(lng,lat,f.geometry)){ const p=f.properties||{};
            if(p.v!=null){ const a=Math.abs(+p.v); const rv=(a>=100?Math.round(+p.v):Math.round(+p.v*10)/10); out.push(bxLabel(L)+': '+rv+(L.unit||'')+(p.nm?(' ('+p.nm+')'):'')); }
            else out.push(bxLabel(L)+': — '+(p.nm?('('+p.nm+')'):''));   /* gray no-data country = honest dash */
            break; } } }); }catch(_){}
      return out; };
    function buildRows(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('bx-eq')) return;
      ALL.forEach(L=>{ const w=document.createElement('div'); w.className='lyr-row'; w.id='lyrrow-'+L.id;
        const lab=document.createElement('label'); lab.className='layer-option';
        const cb=document.createElement('input'); cb.type='checkbox'; cb.id='bx-'+L.id;
        const sp=document.createElement('span'); sp.className='bx-name'; sp.textContent=bxLabel(L);
        lab.appendChild(cb); lab.appendChild(document.createTextNode(' ')); lab.appendChild(sp); w.appendChild(lab); dd.appendChild(w);
        cb.addEventListener('change',e=>{ w.classList.toggle('on',e.target.checked); if(e.target.checked){ try{ L.on(); }catch(_){} } else { try{ L.off(); }catch(_){} } });
      });
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){}
    }
    /* keep labels in sync with UI language */
    window.addEventListener('intmap-lang',()=>{ ALL.forEach(L=>{ const r=document.getElementById('lyrrow-'+L.id); const sp=r&&r.querySelector('.bx-name'); if(sp) sp.textContent=bxLabel(L); }); });
    if(document.readyState!=='loading') setTimeout(buildRows,700); else document.addEventListener('DOMContentLoaded',()=>setTimeout(buildRows,700));

    /* (#R31) Refresh Stats to the LATEST available figures ("Statsの数値はできる限り最新に") — pull the most
       recent World Bank GDP / population / GDP-per-capita / life-expectancy and merge into countryStats
       (only overwriting where WB has a value), then re-render Stats if it's open. Runs once, low-priority. */
    function refreshStatsLatest(){ try{ const cs=(typeof countryStats!=='undefined'&&countryStats)||null; if(!cs) return;
      Promise.all([wbFetch('NY.GDP.MKTP.CD'),wbFetch('SP.POP.TOTL'),wbFetch('NY.GDP.PCAP.CD'),wbFetch('SP.DYN.LE00.IN')]).then(([gdp,pop,pc,le])=>{
        Object.keys(cs).forEach(code=>{ const s=cs[code]; if(!s) return;
          if(gdp[code]&&gdp[code].v>0) s.gdp=gdp[code].v/1e9;
          if(pop[code]&&pop[code].v>0) s.pop=pop[code].v;
          if(pc[code]&&pc[code].v>0) s.gdppc=pc[code].v;
          if(le&&le[code]&&le[code].v>0) s.lifeExp=le[code].v;
        });
        window.__statsRefreshed=true;
        try{ if(typeof HOST.mode!=='undefined'&&HOST.mode==='stats'&&typeof renderStats==='function') renderStats(typeof searchVal==='function'?searchVal():''); }catch(_){}
      }).catch(()=>{});
    }catch(_){} }
    if(window.requestIdleCallback) requestIdleCallback(()=>refreshStatsLatest(),{timeout:6000}); else setTimeout(refreshStatsLatest,4500);
  })();
};
