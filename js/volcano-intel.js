/* ============================================================================
 *  IntMap · VOLCANO INTELLIGENCE — window.IntMapVolcano  (#R353)
 * ----------------------------------------------------------------------------
 *  「現在はGVPの完新世火山1,215座を全部入れてありますが、視覚上の主要分類は「1950年以降」
 *   「1500年以降」「古い／不明」です。ここは恐ろしく深くできます。」
 *
 *  ── WHAT THE LAYER COULD NOT SAY, AND WHY ──────────────────────────────────────────────────
 *  The three colours were not a design decision about depth. data/volcanoes_gvp.json carried SIX
 *  properties per volcano — name, country, type, elevation, last eruption year, region — and no GVP
 *  volcano number, so there was no join key: the eruption history, the VEI, the magma, the people
 *  living around it and every live feed on Earth were unreachable from the bundled file no matter
 *  what UI stood on top of it. scripts/build-volcanoes.mjs put the number in (and the whole eruption
 *  record beside it); this file is what the number is FOR.
 *
 *  ── THE STATUS LADDER, AND WHY IT IS A LADDER ──────────────────────────────────────────────
 *  There is no single feed that states a current alert level for every volcano on Earth. Pretending
 *  otherwise would make 1,150 quiet-looking volcanoes out of "nobody publishes this in a form a map
 *  can read", which is exactly the failure the weather-warning layer's grey hatching exists to
 *  prevent (docs/MAP-LAYERS.md §7.1). So the same three-state discipline applies here, with the
 *  rungs named on screen and each one carrying its own source and clock:
 *
 *    ① USGS HANS         United States (+ CNMI)  aviation colour code AND alert level, structured
 *    ② JMA               Japan                    噴火警戒レベル 1–5, or the worded warning where JMA
 *                                                 does not operate a level for that volcano
 *    ③ GVP weekly report World                    "New Unrest" / "Ongoing Activity" for the volcanoes
 *                                                 reported this week — an ACTIVITY statement, not a level
 *    ⓪ nothing published World                    said in words, never drawn as calm
 *
 *  ⚠ ①②③ ARE NOT THE SAME QUANTITY AND ARE NEVER MERGED INTO ONE NUMBER. A JMA level 2 and a USGS
 *  YELLOW/ADVISORY are different instruments of different agencies; the panel prints what the agency
 *  said, in the agency's own vocabulary, with the agency's name against it. What the map's colour
 *  mode reduces them to is a four-step SEVERITY ORDER for drawing, and the legend says so.
 *
 *  ⚠ JMA'S WARNING UNIT IS NOT ALWAYS GVP'S VOLCANO, AND THE TABLE BELOW IS HONEST ABOUT IT.
 *  JMA warns for 桜島; GVP's catalog entry is Aira, the caldera it sits in. JMA warns separately for
 *  樽前山 and 恵庭岳; GVP has one entry, Shikotsu. The mapping is therefore many-to-one by design, the
 *  panel shows JMA's OWN unit name, and the map colours the GVP point that contains it.
 *
 *  ── WHAT IS NOT HERE, AND WHY ──────────────────────────────────────────────────────────────
 *  · «噴火様式» (Strombolian / Vulcanian / Plinian …) is NOT a field in the GVP database. It appears
 *    only in Bulletin prose. So this file does not print a style label it cannot source: the
 *    eruption-character section is built from what the record actually contains — the VEI
 *    distribution of that volcano's own eruptions, its dominant rock type, its landform and its
 *    repose intervals — and says which of those is measured and which is derived.
 *  · Pyroclastic-flow / ashfall / lahar hazard ZONES exist as machine-readable GIS for a handful of
 *    volcanoes and for no others. js/volcano-layers.js draws the ones USGS publishes and this panel
 *    says plainly, per volcano, when none is published. No modelled circle is drawn anywhere.
 *
 *  ── RENDERER / MODULE RULES ────────────────────────────────────────────────────────────────
 *  · No <style> here — the CSS lives in css/intmap.css (standing rule since #R162).
 *  · The card is a `.country-popup`, so it inherits the app's detail-card look, drag behaviour and
 *    mobile bottom-sheet rather than inventing a second UI vocabulary.
 *  · Every value that reaches the DOM goes through window.IntMapSafe (#R138).
 *  · Five languages inline; the other four come from js/locales/ui.*.js (`npm run check:i18n`).
 *  · Load-on-demand (js/lazy-modules.js → `volcanoIntel`): nothing here is downloaded until a
 *    volcano is clicked, an Atlas volcano command runs, or the intelligence legend is opened.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.volcanoIntel=function(HOST){
  const L=window.IntMapLang.pick(()=>HOST.lang);
  const GE=()=>window.IntMapGeoEngine;
  const S=(v)=>{ try{ return window.IntMapSafe.html(v==null?'':String(v)); }catch(_){ return ''; } };
  const loc=()=>{ try{ return window.IntMapLang.locale(HOST.lang,'en-GB'); }catch(_){ return 'en-GB'; } };
  const n0=(v)=>(v==null||!isFinite(v))?'':Math.round(v).toLocaleString(loc());

  /* ══ 1. THE BUNDLED RECORD ════════════════════════════════════════════════════════════════
     data/volcano-detail.json.gz — the eruption history, the geological summary, the photograph and
     the four population radii for all 1,214 volcanoes, in one gzipped file fetched the first time a
     panel is opened. ⚠ The gzip is DECIDED FROM THE BYTES, not from the file name: a host that
     labels `.gz` with Content-Encoding makes the browser decompress it already (js/gazetteer.js
     carries the same note and the same magic-number test). */
  const DETAIL_URL=(function(){ try{ return new URL('data/volcano-detail.json.gz',
    (window.IM_HOST&&window.IM_HOST.base)||document.baseURI).toString(); }catch(_){ return 'data/volcano-detail.json.gz'; } })();
  let detailDoc=null, detailPromise=null, detailFailed=false;
  function detail(){
    if(detailPromise) return detailPromise;
    detailPromise=(async()=>{
      try{
        const r=await fetch(DETAIL_URL,{cache:'force-cache'});
        if(!r.ok) throw new Error('HTTP '+r.status);
        const bytes=new Uint8Array(await r.arrayBuffer());
        let text;
        if(bytes[0]===0x1f&&bytes[1]===0x8b){
          if(typeof DecompressionStream!=='function') throw new Error('DecompressionStream unavailable');
          text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
        } else { text=new TextDecoder().decode(bytes); }
        detailDoc=JSON.parse(text);
      }catch(e){ detailFailed=true; try{ console.warn('[IntMap] volcano detail unavailable —',e.message); }catch(_){} }
      return detailDoc;
    })();
    return detailPromise;
  }
  /* the layer's own FeatureCollection — js/beta-overlays.js owns it and publishes the accessor */
  const layerFC=()=>{ try{ return window.__imVolcLayer&&window.__imVolcLayer.data(); }catch(_){ return null; } };
  function base(vn){ const fc=layerFC(); if(!fc) return null;
    for(const f of fc.features){ if(f.properties&&f.properties.v===vn) return f; } return null; }

  /* ══ 2. JMA's WARNING UNIT → THE GVP VOLCANO THAT CONTAINS IT ══════════════════════════════
     JMA names its unit in Japanese and gives it a JMA volcano code; nothing in either feed carries a
     GVP number. This table is the join, keyed on JMA's own name because the name is what JMA prints
     and what a Japanese reader recognises. Every right-hand value was checked against the 105 GVP
     entries whose Country is Japan (data/volcanoes_gvp.json); tests/r353-checks.test.mjs re-checks
     all of them on every commit, so a catalog revision that retires a number fails the build rather
     than silently dropping a country's alert levels.
     ⚠ MANY-TO-ONE IS CORRECT HERE. 桜島 and 若尊 are both inside GVP's Aira; 樽前山 and 恵庭岳 are both
     inside Shikotsu; 池田・山川 and 開聞岳 are both inside Ata; the three 霧島山 units are all
     Kirishimayama. Merging them would be wrong only if the panel then claimed JMA had warned for the
     caldera — it does not: it prints JMA's unit name. */
  const JMA_TO_GVP={
    /* 北海道 */
    'アトサヌプリ':285080,'摩周':285081,'雌阿寒岳':285070,'大雪山':285060,'十勝岳':285050,
    '樽前山':285040,'恵庭岳':285040,'倶多楽':285034,'有珠山':285030,'北海道駒ヶ岳':285020,
    '恵山':285011,'渡島大島':285010,'知床硫黄山':285090,'羅臼岳':285082,'利尻山':285041,
    'ニセコ':285031,'羊蹄山':285032,'丸山':285061,
    /* 東北 */
    '恐山':283290,'岩木山':283270,'八甲田山':283280,'十和田':283271,'秋田焼山':283260,
    '八幡平':283250,'岩手山':283240,'秋田駒ヶ岳':283230,'鳥海山':283220,'栗駒山':283210,
    '鳴子':283200,'肘折':283191,'蔵王山':283190,'吾妻山':283180,'安達太良山':283170,
    '磐梯山':283160,'沼沢':283151,
    /* 関東・中部 */
    '那須岳':283150,'高原山':283143,'男体山':283141,'日光白根山':283140,'燧ヶ岳':283131,
    '赤城山':283130,'榛名山':283122,'草津白根山':283120,'浅間山':283110,'妙高山':283100,
    '新潟焼山':283090,'弥陀ヶ原':283080,'焼岳':283070,'アカンダナ山':283069,'乗鞍岳':283060,
    '白山':283050,'御嶽山':283040,'横岳':283031,'富士山':283030,'箱根山':283020,
    '伊豆東部火山群':283010,'三瓶山':283002,'阿武火山群':283001,
    /* 伊豆・小笠原 */
    '伊豆大島':284010,'利島':284011,'新島':284020,'神津島':284030,'三宅島':284040,
    '御蔵島':284041,'八丈島':284050,'青ヶ島':284060,'ベヨネース列岩':284061,'明神礁':284070,
    '須美寿島':284080,'伊豆鳥島':284090,'孀婦岩':284091,'西之島':284096,'海形海山':284097,
    '海徳海山':284100,'噴火浅根':284110,'硫黄島':284120,'北福徳堆':284121,
    '福徳岡ノ場':284130,'南日吉海山':284131,'日光海山':284132,
    /* 九州・南西諸島 */
    '鶴見岳・伽藍岳':282130,'九重山':282120,'阿蘇山':282110,'雲仙岳':282100,'福江火山群':282091,
    '霧島山':282090,'米丸・住吉池':282081,'桜島':282080,'若尊':282080,'池田・山川':282070,
    '開聞岳':282070,'薩摩硫黄島':282060,'口永良部島':282050,'中之島':282040,'諏訪之瀬島':282030,
    '硫黄鳥島':282020,'口之島':282043,'横当島':282021,'悪石島':282022,
    '西表島北北東海底火山':282010,
  };
  /* 「霧島山（新燃岳）」 → 「霧島山」. JMA qualifies a unit with the active vent in brackets; the
     bracket is a vent, not a different volcano, and the full string is what the panel shows. */
  const jmaKey=(name)=>String(name||'').replace(/[（(][^）)]*[）)]\s*$/,'').trim();

  /* ══ 2.5 THE CONTROLLED VOCABULARIES ══════════════════════════════════════════════════════════
     「クリックしたら出てくるカードの情報が翻訳されていない。」

     ⚠⚠⚠ THE LABELS WERE TRANSLATED IN ALL NINE LANGUAGES AND THE VALUES WERE NOT. A Japanese reader
     opening this card read 「火山の型 Stratovolcano」「構造区分 Subduction zone / Continental crust
     (> 25 km)」「収録の根拠 Eruption Observed」 — every left-hand side in Japanese, every right-hand
     side in English. `npm run check:i18n` printed 100 %, correctly: it measures how full the tables
     are, and an upstream VALUE that reaches the DOM is not a call site, so it is in no instrument's
     denominator. That is [[intmap-recurring-lessons]] B again — the gate cannot see what never
     entered its universe — and the fix is not a new instrument but to put these values INTO the
     universe, which is what the tables below do.

     ⚠ THEY ARE CLOSED SETS, WHICH IS WHY THIS IS TRANSLATABLE AT ALL. Measured against the shipped
     files: 27 volcano types, 10 rocks, 10 tectonic settings, 7 landforms, 1 epoch, 5 inclusion
     bases, 25 dating methods, 19 regions and 116 subregions. `tests/r395-checks.test.mjs` derives
     that requirement FROM data/volcanoes_gvp.json and data/volcano-detail.json.gz rather than from a
     list somebody maintains here, so a Smithsonian catalog revision that introduces a 28th type
     fails the build instead of silently printing English (#R335's rule: a hand-kept table cannot say
     what it is missing).

     ⚠ AND THE PROSE IS NOT IN HERE. The geological summary (894,670 characters across the catalog),
     the VONA synopsis and the weekly report's narrative are what an institution WROTE, not terms
     from a vocabulary; they stay in the language they were published in and the card says so in the
     reader's language rather than pretending they were translated.

     ⚠ THE SHAPE IS `LA(…)` — the five-argument tuple held as data (#R241), resolved by `L.arr`. It is
     a CallExpression bound to IntMapLang.pickArgs, so the i18n instruments see all of it, and the
     remaining four languages come from js/locales/ui.{fr,ko,zh,zh-hans}.js keyed by the English
     string, exactly like every other call site in this repo. ⚠ DO NOT INVENT A THIRD HELPER: #R353
     lost 40 strings to an arrow-function alias that `provenNames` could not see. */
  const LA=window.IntMapLang.pickArgs();
  const langNow=()=>{ try{ return String((HOST&&HOST.lang)||'en').toLowerCase(); }catch(_){ return 'en'; } };
  const VOCAB={
    type:{
      'Caldera':LA('Caldera','カルデラ','Caldera','Кальдера','Caldera'),
      'Caldera(s)':LA('Caldera(s)','カルデラ群','Calderen','Кальдеры','Calderas'),
      'Complex':LA('Complex','複合火山','Komplexvulkan','Сложный вулкан','Volcán complejo'),
      'Compound':LA('Compound','複式火山','Zusammengesetzter Vulkan','Составной вулкан','Volcán compuesto'),
      'Cone':LA('Cone','火山錐','Vulkankegel','Вулканический конус','Cono volcánico'),
      'Crater rows':LA('Crater rows','火口列','Kraterreihen','Цепочки кратеров','Alineaciones de cráteres'),
      'Explosion crater(s)':LA('Explosion crater(s)','爆裂火口群','Explosionskrater','Взрывные кратеры','Cráteres de explosión'),
      'Fissure vent':LA('Fissure vent','割れ目火口','Eruptionsspalte','Трещинное жерло','Fisura eruptiva'),
      'Fissure vent(s)':LA('Fissure vent(s)','割れ目火口群','Eruptionsspalten','Трещинные жерла','Fisuras eruptivas'),
      'Lava cone':LA('Lava cone','溶岩錐','Lavakegel','Лавовый конус','Cono de lava'),
      'Lava cone(es)':LA('Lava cone(es)','溶岩錐群','Lavakegel (mehrere)','Лавовые конусы','Conos de lava'),
      'Lava dome':LA('Lava dome','溶岩ドーム','Lavadom','Лавовый купол','Domo de lava'),
      'Lava dome(s)':LA('Lava dome(s)','溶岩ドーム群','Lavadome','Лавовые купола','Domos de lava'),
      'Maar':LA('Maar','マール','Maar','Маар','Maar'),
      'Maar(s)':LA('Maar(s)','マール群','Maare','Маары','Maares'),
      'Pyroclastic cone':LA('Pyroclastic cone','火砕丘','Pyroklastischer Kegel','Пирокластический конус','Cono piroclástico'),
      'Pyroclastic cone(s)':LA('Pyroclastic cone(s)','火砕丘群','Pyroklastische Kegel','Пирокластические конусы','Conos piroclásticos'),
      'Shield':LA('Shield','楯状火山','Schildvulkan','Щитовой вулкан','Volcán en escudo'),
      'Shield(pyroclastic)':LA('Shield(pyroclastic)','楯状火山（火砕性）','Schildvulkan (pyroklastisch)','Щитовой вулкан (пирокластический)','Volcán en escudo (piroclástico)'),
      'Shield(s)':LA('Shield(s)','楯状火山群','Schildvulkane','Щитовые вулканы','Volcanes en escudo'),
      'Stratovolcano':LA('Stratovolcano','成層火山','Schichtvulkan','Стратовулкан','Estratovolcán'),
      'Stratovolcano(es)':LA('Stratovolcano(es)','成層火山群','Schichtvulkane','Стратовулканы','Estratovolcanes'),
      'Stratovolcano?':LA('Stratovolcano?','成層火山（推定）','Schichtvulkan (vermutet)','Стратовулкан (предположительно)','Estratovolcán (probable)'),
      'Tuff cone':LA('Tuff cone','タフコーン','Tuffkegel','Туфовый конус','Cono de toba'),
      'Tuff cone(s)':LA('Tuff cone(s)','タフコーン群','Tuffkegel (mehrere)','Туфовые конусы','Conos de toba'),
      'Tuff ring(s)':LA('Tuff ring(s)','タフリング群','Tuffringe','Туфовые кольца','Anillos de toba'),
      'Volcanic field':LA('Volcanic field','単成火山群','Vulkanfeld','Вулканическое поле','Campo volcánico'),
    },
    rock:{
      'Foidite':LA('Foidite','フォイダイト','Foidit','Фоидит','Foidita'),
      'Basalt / Picro-Basalt':LA('Basalt / Picro-Basalt','玄武岩 / ピクロ玄武岩','Basalt / Pikrobasalt','Базальт / Пикробазальт','Basalto / Picrobasalto'),
      'Trachybasalt / Tephrite Basanite':LA('Trachybasalt / Tephrite Basanite','粗面玄武岩 / テフライト・バサナイト','Trachybasalt / Tephrit-Basanit','Трахибазальт / Тефрит-базанит','Traquibasalto / Tefrita-basanita'),
      'Trachyte / Trachydacite':LA('Trachyte / Trachydacite','粗面岩 / 粗面デイサイト','Trachyt / Trachydazit','Трахит / Трахидацит','Traquita / Traquidacita'),
      'Phono-tephrite /  Tephri-phonolite':LA('Phono-tephrite /  Tephri-phonolite','フォノテフライト / テフリフォノライト','Phonotephrit / Tephriphonolith','Фонотефрит / Тефрифонолит','Fonotefrita / Tefrifonolita'),
      'Phonolite':LA('Phonolite','響岩','Phonolith','Фонолит','Fonolita'),
      'Andesite / Basaltic Andesite':LA('Andesite / Basaltic Andesite','安山岩 / 玄武岩質安山岩','Andesit / Basaltischer Andesit','Андезит / Базальтовый андезит','Andesita / Andesita basáltica'),
      'Rhyolite':LA('Rhyolite','流紋岩','Rhyolith','Риолит','Riolita'),
      'Trachyandesite / Basaltic Trachyandesite':LA('Trachyandesite / Basaltic Trachyandesite','粗面安山岩 / 玄武岩質粗面安山岩','Trachyandesit / Basaltischer Trachyandesit','Трахиандезит / Базальтовый трахиандезит','Traquiandesita / Traquiandesita basáltica'),
      'Dacite':LA('Dacite','デイサイト','Dazit','Дацит','Dacita'),
    },
    setting:{
      'Rift zone / Continental crust (> 25 km)':LA('Rift zone / Continental crust (> 25 km)','リフト帯 / 大陸地殻（> 25 km）','Riftzone / Kontinentale Kruste (> 25 km)','Рифтовая зона / Континентальная кора (> 25 km)','Zona de rift / Corteza continental (> 25 km)'),
      'Intraplate / Continental crust (> 25 km)':LA('Intraplate / Continental crust (> 25 km)','板内 / 大陸地殻（> 25 km）','Intraplatte / Kontinentale Kruste (> 25 km)','Внутриплитная обстановка / Континентальная кора (> 25 km)','Intraplaca / Corteza continental (> 25 km)'),
      'Subduction zone / Continental crust (> 25 km)':LA('Subduction zone / Continental crust (> 25 km)','沈み込み帯 / 大陸地殻（> 25 km）','Subduktionszone / Kontinentale Kruste (> 25 km)','Зона субдукции / Континентальная кора (> 25 km)','Zona de subducción / Corteza continental (> 25 km)'),
      'Rift zone / Oceanic crust (< 15 km)':LA('Rift zone / Oceanic crust (< 15 km)','リフト帯 / 海洋地殻（< 15 km）','Riftzone / Ozeanische Kruste (< 15 km)','Рифтовая зона / Океаническая кора (< 15 km)','Zona de rift / Corteza oceánica (< 15 km)'),
      'Rift zone / Intermediate crust (15-25 km)':LA('Rift zone / Intermediate crust (15-25 km)','リフト帯 / 中間地殻（15-25 km）','Riftzone / Intermediäre Kruste (15-25 km)','Рифтовая зона / Кора промежуточной мощности (15-25 km)','Zona de rift / Corteza intermedia (15-25 km)'),
      'Intraplate / Oceanic crust (< 15 km)':LA('Intraplate / Oceanic crust (< 15 km)','板内 / 海洋地殻（< 15 km）','Intraplatte / Ozeanische Kruste (< 15 km)','Внутриплитная обстановка / Океаническая кора (< 15 km)','Intraplaca / Corteza oceánica (< 15 km)'),
      'Subduction zone / Oceanic crust (< 15 km)':LA('Subduction zone / Oceanic crust (< 15 km)','沈み込み帯 / 海洋地殻（< 15 km）','Subduktionszone / Ozeanische Kruste (< 15 km)','Зона субдукции / Океаническая кора (< 15 km)','Zona de subducción / Corteza oceánica (< 15 km)'),
      'Subduction zone / Crustal thickness unknown':LA('Subduction zone / Crustal thickness unknown','沈み込み帯 / 地殻の厚さ不明','Subduktionszone / Krustendicke unbekannt','Зона субдукции / Мощность коры неизвестна','Zona de subducción / Espesor cortical desconocido'),
      'Subduction zone / Intermediate crust (15-25 km)':LA('Subduction zone / Intermediate crust (15-25 km)','沈み込み帯 / 中間地殻（15-25 km）','Subduktionszone / Intermediäre Kruste (15-25 km)','Зона субдукции / Кора промежуточной мощности (15-25 km)','Zona de subducción / Corteza intermedia (15-25 km)'),
      'Intraplate / Intermediate crust (15-25 km)':LA('Intraplate / Intermediate crust (15-25 km)','板内 / 中間地殻（15-25 km）','Intraplatte / Intermediäre Kruste (15-25 km)','Внутриплитная обстановка / Кора промежуточной мощности (15-25 km)','Intraplaca / Corteza intermedia (15-25 km)'),
    },
    landform:{
      'Cluster':LA('Cluster','火山群','Vulkangruppe','Группа вулканов','Agrupación volcánica'),
      'Caldera':LA('Caldera','カルデラ','Caldera','Кальдера','Caldera'),
      'Composite':LA('Composite','複成火山','Kompositvulkan','Композитный вулкан','Volcán compuesto (estratovolcán)'),
      'Shield':LA('Shield','楯状火山','Schildvulkan','Щитовой вулкан','Volcán en escudo'),
      'Minor (Basaltic)':LA('Minor (Basaltic)','小型火山（玄武岩質）','Kleinvulkan (basaltisch)','Малый вулкан (базальтовый)','Volcán menor (basáltico)'),
      'Minor (Silicic)':LA('Minor (Silicic)','小型火山（珪長質）','Kleinvulkan (silizisch)','Малый вулкан (кислый)','Volcán menor (silícico)'),
      'Minor':LA('Minor','小型火山','Kleinvulkan','Малый вулкан','Volcán menor'),
    },
    epoch:{
      'Holocene':LA('Holocene','完新世','Holozän','Голоцен','Holoceno'),
    },
    evidenceCat:{
      'Eruption Dated':LA('Eruption Dated','噴火年代を測定','Eruption datiert','Извержение датировано','Erupción datada'),
      'Evidence Credible':LA('Evidence Credible','証拠は信頼できる','Belege glaubwürdig','Свидетельства достоверны','Evidencia creíble'),
      'Evidence Uncertain':LA('Evidence Uncertain','証拠は不確実','Belege unsicher','Свидетельства сомнительны','Evidencia incierta'),
      'Eruption Observed':LA('Eruption Observed','噴火を観測','Eruption beobachtet','Извержение наблюдалось','Erupción observada'),
      'Unrest / Holocene':LA('Unrest / Holocene','活動の高まり / 完新世','Vulkanische Unruhe / Holozän','Активизация / Голоцен','Actividad anómala / Holoceno'),
    },
    evidence:{
      'Isotopic: 14C (uncalibrated)':LA('Isotopic: 14C (uncalibrated)','同位体：14C（未較正）','Isotopisch: 14C (unkalibriert)','Изотопный: 14C (некалиброванный)','Isotópico: 14C (sin calibrar)'),
      'Correlation: Tephrochronology':LA('Correlation: Tephrochronology','対比：テフラ年代学','Korrelation: Tephrochronologie','Корреляция: Тефрохронология','Correlación: Tefrocronología'),
      'Isotopic: 14C (calibrated)':LA('Isotopic: 14C (calibrated)','同位体：14C（較正済み）','Isotopisch: 14C (kalibriert)','Изотопный: 14C (калиброванный)','Isotópico: 14C (calibrado)'),
      'Observations: Reported':LA('Observations: Reported','観測：報告による','Beobachtungen: Berichtet','Наблюдения: Сообщения','Observaciones: Reportado'),
      'Correlation: Magnetism':LA('Correlation: Magnetism','対比：地磁気','Korrelation: Magnetismus','Корреляция: Магнетизм','Correlación: Magnetismo'),
      'Isotopic: Cosmic Ray Exposure':LA('Isotopic: Cosmic Ray Exposure','同位体：宇宙線曝露','Isotopisch: Kosmische Strahlungsexposition','Изотопный: Космогенное облучение','Isotópico: Exposición a rayos cósmicos'),
      'Observations: Seismicity':LA('Observations: Seismicity','観測：地震活動','Beobachtungen: Seismizität','Наблюдения: Сейсмичность','Observaciones: Sismicidad'),
      'Isotopic: Ar/Ar':LA('Isotopic: Ar/Ar','同位体：Ar/Ar','Isotopisch: Ar/Ar','Изотопный: Ar/Ar','Isotópico: Ar/Ar'),
      'Isotopic: Uranium-series':LA('Isotopic: Uranium-series','同位体：ウラン系列','Isotopisch: Uran-Reihen','Изотопный: Урановые ряды','Isotópico: Series del uranio'),
      'Uncertain':LA('Uncertain','不確実','Unsicher','Неопределённо','Incierto'),
      'Observations: Hydrophonic':LA('Observations: Hydrophonic','観測：水中音響（ハイドロフォン）','Beobachtungen: Hydrophon','Наблюдения: Гидрофон','Observaciones: Hidrófono'),
      'Chem/Bio: Hydration Rind':LA('Chem/Bio: Hydration Rind','化学/生物：水和層','Chem./Biol.: Hydratationsrinde','Хим./Биол.: Гидратационная кайма','Quím./Biol.: Corteza de hidratación'),
      'Correlation: Anthropology':LA('Correlation: Anthropology','対比：人類学','Korrelation: Anthropologie','Корреляция: Антропология','Correlación: Antropología'),
      'Radiogenic: Thermoluminescence':LA('Radiogenic: Thermoluminescence','放射線：熱ルミネッセンス','Radiogen: Thermolumineszenz','Радиогенный: Термолюминесценция','Radiogénico: Termoluminiscencia'),
      'Sidereal: Varve Count':LA('Sidereal: Varve Count','暦年：年縞計数','Siderisch: Warvenzählung','Сидерический: Подсчёт варв','Sidéreo: Recuento de varvas'),
      'Radiogenic: Fission track':LA('Radiogenic: Fission track','放射線：フィッション・トラック','Radiogen: Spaltspuren','Радиогенный: Треки деления','Radiogénico: Trazas de fisión'),
      'Observations: Satellite (infrared)':LA('Observations: Satellite (infrared)','観測：衛星（赤外）','Beobachtungen: Satellit (Infrarot)','Наблюдения: Спутник (инфракрасный)','Observaciones: Satélite (infrarrojo)'),
      'Sidereal: Dendrochronology':LA('Sidereal: Dendrochronology','暦年：年輪年代学','Siderisch: Dendrochronologie','Сидерический: Дендрохронология','Sidéreo: Dendrocronología'),
      'Chem/Bio: Lichenometry':LA('Chem/Bio: Lichenometry','化学/生物：地衣計測法','Chem./Biol.: Lichenometrie','Хим./Биол.: Лихенометрия','Quím./Biol.: Liquenometría'),
      'Sidereal: Ice Core':LA('Sidereal: Ice Core','暦年：氷床コア','Siderisch: Eisbohrkern','Сидерический: Ледяной керн','Sidéreo: Testigo de hielo'),
      'Observations: Satellite (visual)':LA('Observations: Satellite (visual)','観測：衛星（可視）','Beobachtungen: Satellit (visuell)','Наблюдения: Спутник (визуальный)','Observaciones: Satélite (visual)'),
      'Isotopic: K/Ar':LA('Isotopic: K/Ar','同位体：K/Ar','Isotopisch: K/Ar','Изотопный: K/Ar','Isotópico: K/Ar'),
      'Observations: Aviation':LA('Observations: Aviation','観測：航空機','Beobachtungen: Luftfahrt','Наблюдения: Авиация','Observaciones: Aviación'),
      'Isotopic: Po-Pb':LA('Isotopic: Po-Pb','同位体：Po-Pb','Isotopisch: Po-Pb','Изотопный: Po-Pb','Isotópico: Po-Pb'),
      'Observations: Photo / Video':LA('Observations: Photo / Video','観測：写真 / 動画','Beobachtungen: Foto / Video','Наблюдения: Фото / Видео','Observaciones: Foto / Vídeo'),
    },
    region:{
      'Antarctic-Scotia Volcanic Regions':LA('Antarctic-Scotia Volcanic Regions','南極・スコシアの火山地域','Vulkanregionen Antarktis–Scotia','Вулканические регионы Антарктики и Скоша','Regiones volcánicas de la Antártida y Scotia'),
      'Arabia-Central Asia Volcanic Regions':LA('Arabia-Central Asia Volcanic Regions','アラビア・中央アジアの火山地域','Vulkanregionen Arabien–Zentralasien','Вулканические регионы Аравии и Центральной Азии','Regiones volcánicas de Arabia y Asia Central'),
      'Atlantic Ocean Volcanic Regions':LA('Atlantic Ocean Volcanic Regions','大西洋の火山地域','Vulkanregionen des Atlantischen Ozeans','Вулканические регионы Атлантического океана','Regiones volcánicas del océano Atlántico'),
      'Eastern Africa Volcanic Regions':LA('Eastern Africa Volcanic Regions','東アフリカの火山地域','Vulkanregionen Ostafrikas','Вулканические регионы Восточной Африки','Regiones volcánicas de África Oriental'),
      'Eastern Asia Volcanic Regions':LA('Eastern Asia Volcanic Regions','東アジアの火山地域','Vulkanregionen Ostasiens','Вулканические регионы Восточной Азии','Regiones volcánicas de Asia Oriental'),
      'Eastern Australia Volcanic Regions':LA('Eastern Australia Volcanic Regions','東オーストラリアの火山地域','Vulkanregionen Ostaustraliens','Вулканические регионы Восточной Австралии','Regiones volcánicas de Australia Oriental'),
      'Eastern Pacific Volcanic Regions':LA('Eastern Pacific Volcanic Regions','東太平洋の火山地域','Vulkanregionen des Ostpazifiks','Вулканические регионы востока Тихого океана','Regiones volcánicas del Pacífico Oriental'),
      'European Volcanic Regions':LA('European Volcanic Regions','ヨーロッパの火山地域','Vulkanregionen Europas','Вулканические регионы Европы','Regiones volcánicas de Europa'),
      'Middle America-Caribbean Volcanic Regions':LA('Middle America-Caribbean Volcanic Regions','中央アメリカ・カリブ海の火山地域','Vulkanregionen Mittelamerikas und der Karibik','Вулканические регионы Центральной Америки и Карибского бассейна','Regiones volcánicas de América Central y el Caribe'),
      'North America Volcanic Regions':LA('North America Volcanic Regions','北アメリカの火山地域','Vulkanregionen Nordamerikas','Вулканические регионы Северной Америки','Regiones volcánicas de América del Norte'),
      'Northern Africa Volcanic Regions':LA('Northern Africa Volcanic Regions','北アフリカの火山地域','Vulkanregionen Nordafrikas','Вулканические регионы Северной Африки','Regiones volcánicas del norte de África'),
      'Northwestern Pacific Volcanic Regions':LA('Northwestern Pacific Volcanic Regions','北西太平洋の火山地域','Vulkanregionen des Nordwestpazifiks','Вулканические регионы северо-запада Тихого океана','Regiones volcánicas del Pacífico noroccidental'),
      'Somalian-Antarctic Volcanic Regions':LA('Somalian-Antarctic Volcanic Regions','ソマリア・南極の火山地域','Vulkanregionen Somalia–Antarktis','Сомалийско-Антарктические вулканические регионы','Regiones volcánicas somalí-antárticas'),
      'South America Volcanic Regions':LA('South America Volcanic Regions','南アメリカの火山地域','Vulkanregionen Südamerikas','Вулканические регионы Южной Америки','Regiones volcánicas de América del Sur'),
      'Southern Pacific Volcanic Regions':LA('Southern Pacific Volcanic Regions','南太平洋の火山地域','Vulkanregionen des Südpazifiks','Вулканические регионы юга Тихого океана','Regiones volcánicas del Pacífico Sur'),
      'Southwestern Pacific Volcanic Regions':LA('Southwestern Pacific Volcanic Regions','南西太平洋の火山地域','Vulkanregionen des Südwestpazifiks','Вулканические регионы юго-запада Тихого океана','Regiones volcánicas del Pacífico suroccidental'),
      'Sunda-Banda Volcanic Regions':LA('Sunda-Banda Volcanic Regions','スンダ・バンダの火山地域','Vulkanregionen Sunda–Banda','Зондско-Бандские вулканические регионы','Regiones volcánicas de la Sonda y Banda'),
      'Tonga-Kermadec Volcanic Regions':LA('Tonga-Kermadec Volcanic Regions','トンガ・ケルマデックの火山地域','Vulkanregionen Tonga–Kermadec','Вулканические регионы Тонга и Кермадек','Regiones volcánicas de Tonga y Kermadec'),
      'Western Pacific Volcanic Regions':LA('Western Pacific Volcanic Regions','西太平洋の火山地域','Vulkanregionen des Westpazifiks','Вулканические регионы запада Тихого океана','Regiones volcánicas del Pacífico Occidental'),
    },
    subregion:{
      'Aeolian Volcanic Arc':LA('Aeolian Volcanic Arc','エオリア火山弧','Äolischer Vulkanbogen','Эолийская вулканическая дуга','Arco volcánico Eolio'),
      'Afar Rift Volcanic Province':LA('Afar Rift Volcanic Province','アファール地溝火山区','Vulkanprovinz des Afar-Rifts','Вулканическая провинция Афарского рифта','Provincia volcánica del Rift de Afar'),
      'Alaska Peninsula Volcanic Arc':LA('Alaska Peninsula Volcanic Arc','アラスカ半島火山弧','Vulkanbogen der Alaska-Halbinsel','Вулканическая дуга полуострова Аляска','Arco volcánico de la península de Alaska'),
      'Albertine Rift Volcanic Province':LA('Albertine Rift Volcanic Province','アルバーティン地溝火山区','Vulkanprovinz des Albertine-Grabens','Вулканическая провинция Албертинского рифта','Provincia volcánica del Rift Albertino'),
      'Aleutian Ridge Volcanic Arc':LA('Aleutian Ridge Volcanic Arc','アリューシャン海嶺火山弧','Vulkanbogen des Aleutenrückens','Вулканическая дуга Алеутского хребта','Arco volcánico de la dorsal de las Aleutianas'),
      'Amsterdam-St. Paul Hotspot Volcano Group':LA('Amsterdam-St. Paul Hotspot Volcano Group','アムステルダム・サンポール島ホットスポット火山群','Vulkangruppe des Amsterdam-St.-Paul-Hotspots','Группа вулканов горячей точки Амстердам — Сен-Поль','Grupo volcánico del punto caliente de Ámsterdam-San Pablo'),
      'Andaman Volcanic Province':LA('Andaman Volcanic Province','アンダマン火山区','Vulkanprovinz der Andamanen','Андаманская вулканическая провинция','Provincia volcánica de Andamán'),
      'Antarctic Peninsula Volcanic Province':LA('Antarctic Peninsula Volcanic Province','南極半島火山区','Vulkanprovinz der Antarktischen Halbinsel','Вулканическая провинция Антарктического полуострова','Provincia volcánica de la península Antártica'),
      'Arctic Ridge Volcanic Province':LA('Arctic Ridge Volcanic Province','北極海嶺火山区','Vulkanprovinz des Arktischen Rückens','Вулканическая провинция Арктического хребта','Provincia volcánica de la dorsal Ártica'),
      'Austral Andean Volcanic Arc':LA('Austral Andean Volcanic Arc','アンデス最南部火山弧','Australer Anden-Vulkanbogen','Аустральная вулканическая дуга Анд','Arco volcánico Austral de los Andes'),
      'Austral-Cook Hotspot Volcano Group':LA('Austral-Cook Hotspot Volcano Group','オーストラル・クック諸島ホットスポット火山群','Vulkangruppe des Austral-Cook-Hotspots','Группа вулканов горячей точки Австральных островов и островов Кука','Grupo volcánico del punto caliente de las Australes y Cook'),
      'Azores-Terceira Rift Volcanic Province':LA('Azores-Terceira Rift Volcanic Province','アゾレス・テルセイラリフト火山区','Vulkanprovinz des Azoren-Terceira-Rifts','Вулканическая провинция Азорско-Терсейрского рифта','Provincia volcánica del Rift Azores-Terceira'),
      'Baikal Rift Volcanic Province':LA('Baikal Rift Volcanic Province','バイカル地溝火山区','Vulkanprovinz des Baikalgrabens','Вулканическая провинция Байкальского рифта','Provincia volcánica del Rift de Baikal'),
      'Balleny Hotspot Volcano Group':LA('Balleny Hotspot Volcano Group','バレニー諸島ホットスポット火山群','Vulkangruppe des Balleny-Hotspots','Группа вулканов горячей точки Баллени','Grupo volcánico del punto caliente de Balleny'),
      'Basin and Range Volcanic Province':LA('Basin and Range Volcanic Province','ベースン・アンド・レンジ火山区','Vulkanprovinz Basin and Range','Вулканическая провинция Бассейнов и хребтов','Provincia volcánica de Cuencas y Cordilleras'),
      'Bismarck Sea Volcanic Province':LA('Bismarck Sea Volcanic Province','ビスマルク海火山区','Vulkanprovinz der Bismarcksee','Вулканическая провинция моря Бисмарка','Provincia volcánica del mar de Bismarck'),
      'Bismarck Volcanic Arc':LA('Bismarck Volcanic Arc','ビスマルク火山弧','Bismarck-Vulkanbogen','Вулканическая дуга Бисмарка','Arco volcánico de Bismarck'),
      'Bougainville Volcanic Arc':LA('Bougainville Volcanic Arc','ブーゲンビル火山弧','Bougainville-Vulkanbogen','Вулканическая дуга Бугенвиля','Arco volcánico de Bougainville'),
      'California Coast Ranges Volcano Group':LA('California Coast Ranges Volcano Group','カリフォルニア海岸山脈火山群','Vulkangruppe der kalifornischen Küstengebirge','Группа вулканов Береговых хребтов Калифорнии','Grupo volcánico de las cordilleras Costeras de California'),
      'Canary Volcanic Province':LA('Canary Volcanic Province','カナリア諸島火山区','Vulkanprovinz der Kanaren','Канарская вулканическая провинция','Provincia volcánica de Canarias'),
      'Cape Verde Hotspot Volcano Group':LA('Cape Verde Hotspot Volcano Group','カーボベルデホットスポット火山群','Vulkangruppe des Kapverden-Hotspots','Группа вулканов горячей точки Кабо-Верде','Grupo volcánico del punto caliente de Cabo Verde'),
      'Caucasus Volcanic Province':LA('Caucasus Volcanic Province','カフカス火山区','Vulkanprovinz des Kaukasus','Кавказская вулканическая провинция','Provincia volcánica del Cáucaso'),
      'Central America Volcanic Arc':LA('Central America Volcanic Arc','中央アメリカ火山弧','Zentralamerikanischer Vulkanbogen','Центральноамериканская вулканическая дуга','Arco volcánico Centroamericano'),
      'Central Anatolian Volcanic Province':LA('Central Anatolian Volcanic Province','中央アナトリア火山区','Zentralanatolische Vulkanprovinz','Центральноанатолийская вулканическая провинция','Provincia volcánica de Anatolia Central'),
      'Central Andean Volcanic Arc':LA('Central Andean Volcanic Arc','中央アンデス火山弧','Zentralanden-Vulkanbogen','Центральноандийская вулканическая дуга','Arco volcánico de los Andes Centrales'),
      'Central East Asia Volcanic Province':LA('Central East Asia Volcanic Province','東アジア中部火山区','Vulkanprovinz Zentral-Ostasiens','Вулканическая провинция Центральной Восточной Азии','Provincia volcánica de Asia Oriental Central'),
      'Central European Volcanic Province':LA('Central European Volcanic Province','中央ヨーロッパ火山区','Mitteleuropäische Vulkanprovinz','Центральноевропейская вулканическая провинция','Provincia volcánica de Europa Central'),
      'Central Kamchatka Volcanic Arc':LA('Central Kamchatka Volcanic Arc','中央カムチャツカ火山弧','Vulkanbogen Zentral-Kamtschatkas','Центральнокамчатская вулканическая дуга','Arco volcánico de Kamchatka Central'),
      'Central Mid-Atlantic Rift Volcanic Province':LA('Central Mid-Atlantic Rift Volcanic Province','大西洋中央リフト中部火山区','Vulkanprovinz des zentralen Mittelatlantischen Rifts','Вулканическая провинция центральной части Срединно-Атлантического рифта','Provincia volcánica del Rift Medioatlántico Central'),
      'Chiapanecan Volcanic Arc':LA('Chiapanecan Volcanic Arc','チアパス火山弧','Vulkanbogen von Chiapas','Вулканическая дуга Чьяпаса','Arco volcánico Chiapaneco'),
      'Crozet Hotspot Volcano Group':LA('Crozet Hotspot Volcano Group','クローゼー諸島ホットスポット火山群','Vulkangruppe des Crozet-Hotspots','Группа вулканов горячей точки Крозе','Grupo volcánico del punto caliente de Crozet'),
      'East Central Sahara Volcanic Province':LA('East Central Sahara Volcanic Province','サハラ中東部火山区','Vulkanprovinz der ostzentralen Sahara','Вулканическая провинция восточной части Центральной Сахары','Provincia volcánica del Sahara centro-oriental'),
      'Eastern Kamchatka Volcanic Arc':LA('Eastern Kamchatka Volcanic Arc','東カムチャツカ火山弧','Vulkanbogen Ost-Kamtschatkas','Восточно-Камчатская вулканическая дуга','Arco volcánico de Kamchatka Oriental'),
      'Eastern Philippine Volcanic Arc':LA('Eastern Philippine Volcanic Arc','東フィリピン火山弧','Ostphilippinischer Vulkanbogen','Восточно-Филиппинская вулканическая дуга','Arco volcánico de Filipinas Oriental'),
      'Fiji Volcanic Arc':LA('Fiji Volcanic Arc','フィジー火山弧','Fidschi-Vulkanbogen','Вулканическая дуга Фиджи','Arco volcánico de Fiyi'),
      'Galapagos Hotspot Volcano Group':LA('Galapagos Hotspot Volcano Group','ガラパゴスホットスポット火山群','Vulkangruppe des Galapagos-Hotspots','Группа вулканов Галапагосской горячей точки','Grupo volcánico del punto caliente de Galápagos'),
      'Galapagos Rift Volcanic Province':LA('Galapagos Rift Volcanic Province','ガラパゴスリフト火山区','Vulkanprovinz des Galapagos-Rifts','Вулканическая провинция Галапагосского рифта','Provincia volcánica del Rift de Galápagos'),
      'Garibaldi Volcanic Arc':LA('Garibaldi Volcanic Arc','ガリバルディ火山弧','Garibaldi-Vulkanbogen','Вулканическая дуга Гарибальди','Arco volcánico de Garibaldi'),
      'Gulf of California Rift Volcanic Province':LA('Gulf of California Rift Volcanic Province','カリフォルニア湾リフト火山区','Vulkanprovinz des Rifts im Golf von Kalifornien','Вулканическая провинция рифта Калифорнийского залива','Provincia volcánica del Rift del Golfo de California'),
      'Halmahera Volcanic Arc':LA('Halmahera Volcanic Arc','ハルマヘラ火山弧','Halmahera-Vulkanbogen','Вулканическая дуга Хальмахеры','Arco volcánico de Halmahera'),
      'Hawaiian-Emperor Hotspot Volcano Group':LA('Hawaiian-Emperor Hotspot Volcano Group','ハワイ・天皇海山列ホットスポット火山群','Vulkangruppe des Hawaii-Emperor-Hotspots','Группа вулканов горячей точки Гавайско-Императорского хребта','Grupo volcánico del punto caliente de Hawái-Emperador'),
      'Hellenic Volcanic Arc':LA('Hellenic Volcanic Arc','ヘレニック火山弧','Hellenischer Vulkanbogen','Эллинская вулканическая дуга','Arco volcánico Helénico'),
      'High Cascades Volcanic Arc':LA('High Cascades Volcanic Arc','ハイカスケード火山弧','Vulkanbogen der High Cascades','Вулканическая дуга Высоких Каскадных гор','Arco volcánico de las Altas Cascadas'),
      'High Lava Plains Volcanic Province':LA('High Lava Plains Volcanic Province','高溶岩平原火山区','Vulkanprovinz der High Lava Plains','Вулканическая провинция Высоких лавовых равнин','Provincia volcánica de las Altas Llanuras de Lava'),
      'Iceland Neovolcanic Rift Volcanic Province':LA('Iceland Neovolcanic Rift Volcanic Province','アイスランド新期火山リフト火山区','Vulkanprovinz der neovulkanischen Riftzone Islands','Вулканическая провинция неовулканического рифта Исландии','Provincia volcánica del Rift Neovolcánico de Islandia'),
      'Inner Banda Volcanic Arc':LA('Inner Banda Volcanic Arc','内バンダ火山弧','Innerer Banda-Vulkanbogen','Внутренняя Бандская вулканическая дуга','Arco volcánico de Banda Interior'),
      'Interior Western Canada Volcanic Province':LA('Interior Western Canada Volcanic Province','カナダ西部内陸火山区','Vulkanprovinz im Inneren Westkanadas','Вулканическая провинция внутренних районов Западной Канады','Provincia volcánica del interior del oeste de Canadá'),
      'Italian Peninsula Volcanic Provinces':LA('Italian Peninsula Volcanic Provinces','イタリア半島火山区','Vulkanprovinzen der Italienischen Halbinsel','Вулканические провинции Апеннинского полуострова','Provincias volcánicas de la península itálica'),
      'Izu Volcanic Arc':LA('Izu Volcanic Arc','伊豆火山弧','Izu-Vulkanbogen','Вулканическая дуга Идзу','Arco volcánico de Izu'),
      'Kenyan Rift Volcanic Province':LA('Kenyan Rift Volcanic Province','ケニア地溝火山区','Vulkanprovinz des Kenia-Grabens','Вулканическая провинция Кенийского рифта','Provincia volcánica del Rift de Kenia'),
      'Kerguelen Hotspot Volcano Group':LA('Kerguelen Hotspot Volcano Group','ケルゲレンホットスポット火山群','Vulkangruppe des Kerguelen-Hotspots','Группа вулканов Кергеленской горячей точки','Grupo volcánico del punto caliente de Kerguelen'),
      'Kuril Volcanic Arc':LA('Kuril Volcanic Arc','千島火山弧','Kurilen-Vulkanbogen','Курильская вулканическая дуга','Arco volcánico de las Kuriles'),
      'Lesser Antilles Volcanic Arc':LA('Lesser Antilles Volcanic Arc','小アンティル諸島火山弧','Vulkanbogen der Kleinen Antillen','Вулканическая дуга Малых Антильских островов','Arco volcánico de las Antillas Menores'),
      'Luzon Volcanic Arc':LA('Luzon Volcanic Arc','ルソン火山弧','Luzon-Vulkanbogen','Лусонская вулканическая дуга','Arco volcánico de Luzón'),
      'Madagascar-Comoros Volcanic Province':LA('Madagascar-Comoros Volcanic Province','マダガスカル・コモロ火山区','Vulkanprovinz Madagaskar–Komoren','Вулканическая провинция Мадагаскара и Коморских островов','Provincia volcánica de Madagascar y Comoras'),
      'Madeira Hotspot Volcano Group':LA('Madeira Hotspot Volcano Group','マデイラホットスポット火山群','Vulkangruppe des Madeira-Hotspots','Группа вулканов горячей точки Мадейра','Grupo volcánico del punto caliente de Madeira'),
      'Main Ethiopian Rift Volcanic Province':LA('Main Ethiopian Rift Volcanic Province','主エチオピア地溝火山区','Vulkanprovinz des Hauptäthiopischen Grabens','Вулканическая провинция Главного Эфиопского рифта','Provincia volcánica del Rift Etíope Principal'),
      'Mariana Volcanic Arc':LA('Mariana Volcanic Arc','マリアナ火山弧','Marianen-Vulkanbogen','Марианская вулканическая дуга','Arco volcánico de las Marianas'),
      'Marion Hotspot Volcano Group':LA('Marion Hotspot Volcano Group','マリオン島ホットスポット火山群','Vulkangruppe des Marion-Hotspots','Группа вулканов горячей точки Марион','Grupo volcánico del punto caliente de Marion'),
      'Mathematicians Ridge Volcanic Province':LA('Mathematicians Ridge Volcanic Province','数学者海嶺火山区','Vulkanprovinz des Mathematiker-Rückens','Вулканическая провинция хребта Математиков','Provincia volcánica de la dorsal de los Matemáticos'),
      'McMurdo Volcanic Province':LA('McMurdo Volcanic Province','マクマード火山区','Vulkanprovinz McMurdo','Вулканическая провинция Мак-Мердо','Provincia volcánica de McMurdo'),
      'Middle Kermadec Volcanic Arc':LA('Middle Kermadec Volcanic Arc','ケルマデック中部火山弧','Mittlerer Kermadec-Vulkanbogen','Средняя Кермадекская вулканическая дуга','Arco volcánico de Kermadec Central'),
      'Mindanao Volcanic Province':LA('Mindanao Volcanic Province','ミンダナオ火山区','Vulkanprovinz Mindanao','Вулканическая провинция Минданао','Provincia volcánica de Mindanao'),
      'Nankai Volcanic Arc':LA('Nankai Volcanic Arc','南海火山弧','Nankai-Vulkanbogen','Вулканическая дуга Нанкай','Arco volcánico de Nankai'),
      'Negros-Sulu Volcanic Arc':LA('Negros-Sulu Volcanic Arc','ネグロス・スールー火山弧','Negros-Sulu-Vulkanbogen','Вулканическая дуга Негрос — Сулу','Arco volcánico de Negros-Sulú'),
      'Northeast Japan Volcanic Arc':LA('Northeast Japan Volcanic Arc','東北日本火山弧','Nordost-Japan-Vulkanbogen','Северо-Восточная Японская вулканическая дуга','Arco volcánico del noreste de Japón'),
      'Northeast Lau Basin Volcano Group':LA('Northeast Lau Basin Volcano Group','ラウ海盆北東部火山群','Vulkangruppe des nordöstlichen Lau-Beckens','Группа вулканов северо-восточной части бассейна Лау','Grupo volcánico de la cuenca de Lau nororiental'),
      'Northeast Pacific Rifts Volcanic Province':LA('Northeast Pacific Rifts Volcanic Province','北東太平洋リフト火山区','Vulkanprovinz der Rifts im Nordostpazifik','Вулканическая провинция рифтов северо-восточной части Тихого океана','Provincia volcánica de los rifts del Pacífico nororiental'),
      'Northeastern Australia Volcanic Province':LA('Northeastern Australia Volcanic Province','オーストラリア北東部火山区','Vulkanprovinz Nordostaustraliens','Вулканическая провинция Северо-Восточной Австралии','Provincia volcánica del noreste de Australia'),
      'Northern Alaska-Bering Sea Volcanic Province':LA('Northern Alaska-Bering Sea Volcanic Province','北アラスカ・ベーリング海火山区','Vulkanprovinz Nordalaska–Beringmeer','Вулканическая провинция Северной Аляски и Берингова моря','Provincia volcánica del norte de Alaska y el mar de Bering'),
      'Northern Andean Volcanic Arc':LA('Northern Andean Volcanic Arc','北アンデス火山弧','Nordanden-Vulkanbogen','Северная вулканическая дуга Анд','Arco volcánico de los Andes Septentrionales'),
      'Northern Arabia Volcanic Province':LA('Northern Arabia Volcanic Province','北アラビア火山区','Vulkanprovinz Nordarabiens','Вулканическая провинция Северной Аравии','Provincia volcánica del norte de Arabia'),
      'Northern Cordilleran Volcanic Province':LA('Northern Cordilleran Volcanic Province','北部コルディレラ火山区','Nördliche Kordilleren-Vulkanprovinz','Северная Кордильерская вулканическая провинция','Provincia volcánica de la Cordillera Septentrional'),
      'Northern East Pacific Rise Volcanic Province':LA('Northern East Pacific Rise Volcanic Province','東太平洋海嶺北部火山区','Vulkanprovinz des nördlichen Ostpazifischen Rückens','Вулканическая провинция северной части Восточно-Тихоокеанского поднятия','Provincia volcánica de la dorsal del Pacífico Oriental septentrional'),
      'Northern Galapagos Volcanic Province':LA('Northern Galapagos Volcanic Province','ガラパゴス北部火山区','Vulkanprovinz der nördlichen Galapagosinseln','Вулканическая провинция северных Галапагосских островов','Provincia volcánica de las Galápagos septentrionales'),
      'Northern Kermadec Volcanic Arc':LA('Northern Kermadec Volcanic Arc','ケルマデック北部火山弧','Nördlicher Kermadec-Vulkanbogen','Северная Кермадекская вулканическая дуга','Arco volcánico de Kermadec Septentrional'),
      'Northern Tibetan Plateau Volcanic Province':LA('Northern Tibetan Plateau Volcanic Province','チベット高原北部火山区','Vulkanprovinz des nördlichen Tibetischen Hochlands','Вулканическая провинция северной части Тибетского нагорья','Provincia volcánica de la meseta tibetana septentrional'),
      'Ogasawara Volcanic Arc':LA('Ogasawara Volcanic Arc','小笠原火山弧','Ogasawara-Vulkanbogen','Вулканическая дуга Огасавара','Arco volcánico de Ogasawara'),
      'Pacific-Antarctic Ridge Volcanic Province':LA('Pacific-Antarctic Ridge Volcanic Province','太平洋南極海嶺火山区','Vulkanprovinz des Pazifisch-Antarktischen Rückens','Вулканическая провинция Тихоокеанско-Антарктического хребта','Provincia volcánica de la dorsal Pacífico-Antártica'),
      'Pitcairn Hotspot Volcano Group':LA('Pitcairn Hotspot Volcano Group','ピトケアンホットスポット火山群','Vulkangruppe des Pitcairn-Hotspots','Группа вулканов горячей точки Питкэрн','Grupo volcánico del punto caliente de Pitcairn'),
      'Queen Charlotte Volcano Group':LA('Queen Charlotte Volcano Group','クイーンシャーロット火山群','Queen-Charlotte-Vulkangruppe','Группа вулканов Королевы Шарлотты','Grupo volcánico de la Reina Carlota'),
      'Red Sea Rift Volcanic Province':LA('Red Sea Rift Volcanic Province','紅海リフト火山区','Vulkanprovinz des Rotmeer-Grabens','Вулканическая провинция Красноморского рифта','Provincia volcánica del Rift del mar Rojo'),
      'Reunion Hotspot Volcano Group':LA('Reunion Hotspot Volcano Group','レユニオンホットスポット火山群','Vulkangruppe des Réunion-Hotspots','Группа вулканов горячей точки Реюньон','Grupo volcánico del punto caliente de Reunión'),
      'Rukwa Rift Volcanic Province':LA('Rukwa Rift Volcanic Province','ルクワ地溝火山区','Vulkanprovinz des Rukwa-Grabens','Вулканическая провинция рифта Руква','Provincia volcánica del Rift de Rukwa'),
      'Ryukyu Volcanic Arc':LA('Ryukyu Volcanic Arc','琉球火山弧','Ryukyu-Vulkanbogen','Вулканическая дуга Рюкю','Arco volcánico de Ryukyu'),
      'Salas y Gómez Ridge Volcano Group':LA('Salas y Gómez Ridge Volcano Group','サラ・イ・ゴメス海嶺火山群','Vulkangruppe des Salas-y-Gómez-Rückens','Группа вулканов хребта Сала-и-Гомес','Grupo volcánico de la dorsal de Salas y Gómez'),
      'Samoan Hotspot Volcano Group':LA('Samoan Hotspot Volcano Group','サモアホットスポット火山群','Vulkangruppe des Samoa-Hotspots','Группа вулканов Самоанской горячей точки','Grupo volcánico del punto caliente de Samoa'),
      'Sangihe Volcanic Arc':LA('Sangihe Volcanic Arc','サンギヘ火山弧','Sangihe-Vulkanbogen','Вулканическая дуга Сангихе','Arco volcánico de Sangihe'),
      'Sicily Volcanic Province':LA('Sicily Volcanic Province','シチリア火山区','Vulkanprovinz Sizilien','Вулканическая провинция Сицилии','Provincia volcánica de Sicilia'),
      'Society Islands Hotspot Volcano Group':LA('Society Islands Hotspot Volcano Group','ソシエテ諸島ホットスポット火山群','Vulkangruppe des Gesellschaftsinseln-Hotspots','Группа вулканов горячей точки Островов Общества','Grupo volcánico del punto caliente de las islas de la Sociedad'),
      'Solomon Volcanic Province':LA('Solomon Volcanic Province','ソロモン諸島火山区','Vulkanprovinz der Salomonen','Вулканическая провинция Соломоновых островов','Provincia volcánica de las Salomón'),
      'South Sandwich Volcanic Arc':LA('South Sandwich Volcanic Arc','サウスサンドウィッチ諸島火山弧','Vulkanbogen der Südlichen Sandwichinseln','Южно-Сандвичева вулканическая дуга','Arco volcánico de las Sandwich del Sur'),
      'South Shetlands Volcanic Arc':LA('South Shetlands Volcanic Arc','サウスシェトランド諸島火山弧','Vulkanbogen der Südlichen Shetlandinseln','Вулканическая дуга Южных Шетландских островов','Arco volcánico de las Shetland del Sur'),
      'Southeast Asia Volcanic Province':LA('Southeast Asia Volcanic Province','東南アジア火山区','Vulkanprovinz Südostasiens','Вулканическая провинция Юго-Восточной Азии','Provincia volcánica del Sudeste Asiático'),
      'Southeast Sahara Volcanic Province':LA('Southeast Sahara Volcanic Province','サハラ南東部火山区','Vulkanprovinz der südöstlichen Sahara','Вулканическая провинция юго-восточной Сахары','Provincia volcánica del Sahara sudoriental'),
      'Southeastern Australia Volcanic Province':LA('Southeastern Australia Volcanic Province','オーストラリア南東部火山区','Vulkanprovinz Südostaustraliens','Вулканическая провинция Юго-Восточной Австралии','Provincia volcánica del sudeste de Australia'),
      'Southern Andean Volcanic Arc':LA('Southern Andean Volcanic Arc','南アンデス火山弧','Südanden-Vulkanbogen','Южная вулканическая дуга Анд','Arco volcánico de los Andes Meridionales'),
      'Southern Atlantic Volcano Group':LA('Southern Atlantic Volcano Group','南大西洋火山群','Vulkangruppe des Südatlantiks','Группа вулканов южной части Атлантического океана','Grupo volcánico del Atlántico Sur'),
      'Southern East Pacific Rise Volcanic Province':LA('Southern East Pacific Rise Volcanic Province','東太平洋海嶺南部火山区','Vulkanprovinz des südlichen Ostpazifischen Rückens','Вулканическая провинция южной части Восточно-Тихоокеанского поднятия','Provincia volcánica de la dorsal del Pacífico Oriental meridional'),
      'Southern Kermadec Volcanic Arc':LA('Southern Kermadec Volcanic Arc','ケルマデック南部火山弧','Südlicher Kermadec-Vulkanbogen','Южная Кермадекская вулканическая дуга','Arco volcánico de Kermadec Meridional'),
      'Southwest Arabia Volcanic Province':LA('Southwest Arabia Volcanic Province','南西アラビア火山区','Vulkanprovinz Südwestarabiens','Вулканическая провинция Юго-Западной Аравии','Provincia volcánica del suroeste de Arabia'),
      'Sunda Volcanic Arc':LA('Sunda Volcanic Arc','スンダ火山弧','Sunda-Vulkanbogen','Зондская вулканическая дуга','Arco volcánico de la Sonda'),
      'Taupo Volcanic Arc':LA('Taupo Volcanic Arc','タウポ火山弧','Taupo-Vulkanbogen','Вулканическая дуга Таупо','Arco volcánico de Taupo'),
      'Tofua Volcanic Arc':LA('Tofua Volcanic Arc','トフア火山弧','Tofua-Vulkanbogen','Вулканическая дуга Тофуа','Arco volcánico de Tofua'),
      'Trans-Mexican Volcanic Arc':LA('Trans-Mexican Volcanic Arc','メキシコ横断火山弧','Transmexikanischer Vulkanbogen','Трансмексиканская вулканическая дуга','Arco volcánico Transmexicano'),
      'Trobriand Volcanic Province':LA('Trobriand Volcanic Province','トロブリアンド諸島火山区','Vulkanprovinz der Trobriand-Inseln','Вулканическая провинция островов Тробриан','Provincia volcánica de las islas Trobriand'),
      'Vanuatu Volcanic Arc':LA('Vanuatu Volcanic Arc','バヌアツ火山弧','Vanuatu-Vulkanbogen','Вулканическая дуга Вануату','Arco volcánico de Vanuatu'),
      'West Central Sahara Volcanic Province':LA('West Central Sahara Volcanic Province','サハラ中西部火山区','Vulkanprovinz der westzentralen Sahara','Вулканическая провинция западной части Центральной Сахары','Provincia volcánica del Sahara centro-occidental'),
      'Western Africa Volcanic Province':LA('Western Africa Volcanic Province','西アフリカ火山区','Vulkanprovinz Westafrikas','Вулканическая провинция Западной Африки','Provincia volcánica de África Occidental'),
      'Western Anatolian Volcanic Province':LA('Western Anatolian Volcanic Province','西アナトリア火山区','Westanatolische Vulkanprovinz','Западноанатолийская вулканическая провинция','Provincia volcánica de Anatolia Occidental'),
      'Western Antarctica Volcanic Province':LA('Western Antarctica Volcanic Province','西南極火山区','Vulkanprovinz der Westantarktis','Вулканическая провинция Западной Антарктиды','Provincia volcánica de la Antártida Occidental'),
      'Western Arabia Volcanic Province':LA('Western Arabia Volcanic Province','西アラビア火山区','Vulkanprovinz Westarabiens','Вулканическая провинция Западной Аравии','Provincia volcánica de Arabia Occidental'),
      'Western European Volcanic Province':LA('Western European Volcanic Province','西ヨーロッパ火山区','Westeuropäische Vulkanprovinz','Западноевропейская вулканическая провинция','Provincia volcánica de Europa Occidental'),
      'Western North Island Volcanic Province':LA('Western North Island Volcanic Province','北島西部火山区','Vulkanprovinz der westlichen Nordinsel','Вулканическая провинция западной части Северного острова','Provincia volcánica del oeste de la Isla Norte'),
      'Wrangell Volcanic Arc':LA('Wrangell Volcanic Arc','ランゲル火山弧','Wrangell-Vulkanbogen','Вулканическая дуга Врангеля','Arco volcánico de Wrangell'),
      'Yellowstone-Snake River Hotspot Volcano Group':LA('Yellowstone-Snake River Hotspot Volcano Group','イエローストーン・スネークリバーホットスポット火山群','Vulkangruppe des Yellowstone-Snake-River-Hotspots','Группа вулканов горячей точки Йеллоустон — Снейк-Ривер','Grupo volcánico del punto caliente de Yellowstone-río Snake'),
    },
    usgs:{
      'GREEN':LA('GREEN','緑','Grün','Зелёный','Verde'),
      'YELLOW':LA('YELLOW','黄','Gelb','Жёлтый','Amarillo'),
      'ORANGE':LA('ORANGE','橙','Orange','Оранжевый','Naranja'),
      'RED':LA('RED','赤','Rot','Красный','Rojo'),
      'UNASSIGNED':LA('UNASSIGNED','未設定','Nicht zugewiesen','Не назначено','Sin asignar'),
      'NORMAL':LA('NORMAL','平常','Normal','Норма','Normal'),
      'ADVISORY':LA('ADVISORY','注意報','Hinweis','Уведомление','Advertencia'),
      'WATCH':LA('WATCH','警戒','Vorwarnung','Наблюдение','Vigilancia'),
      'WARNING':LA('WARNING','警報','Warnung','Предупреждение','Alerta'),
    },
    threat:{
      'Very High Threat':LA('Very High Threat','非常に高い脅威','Sehr hohe Gefährdung','Очень высокая угроза','Amenaza muy alta'),
      'High Threat':LA('High Threat','高い脅威','Hohe Gefährdung','Высокая угроза','Amenaza alta'),
      'Moderate Threat':LA('Moderate Threat','中程度の脅威','Mittlere Gefährdung','Умеренная угроза','Amenaza moderada'),
      'Low Threat':LA('Low Threat','低い脅威','Geringe Gefährdung','Низкая угроза','Amenaza baja'),
      'Very Low Threat':LA('Very Low Threat','非常に低い脅威','Sehr geringe Gefährdung','Очень низкая угроза','Amenaza muy baja'),
    },
    observatory:{
      'Alaska Volcano Observatory':LA('Alaska Volcano Observatory','アラスカ火山観測所','Vulkanobservatorium Alaska','Аляскинская вулканологическая обсерватория','Observatorio Vulcanológico de Alaska'),
      'Hawaiian Volcano Observatory':LA('Hawaiian Volcano Observatory','ハワイ火山観測所','Vulkanobservatorium Hawaii','Гавайская вулканологическая обсерватория','Observatorio Vulcanológico de Hawái'),
      'Cascades Volcano Observatory':LA('Cascades Volcano Observatory','カスケード火山観測所','Vulkanobservatorium Kaskaden','Вулканологическая обсерватория Каскадных гор','Observatorio Vulcanológico de las Cascadas'),
      'California Volcano Observatory':LA('California Volcano Observatory','カリフォルニア火山観測所','Vulkanobservatorium Kalifornien','Калифорнийская вулканологическая обсерватория','Observatorio Vulcanológico de California'),
      'Yellowstone Volcano Observatory':LA('Yellowstone Volcano Observatory','イエローストーン火山観測所','Vulkanobservatorium Yellowstone','Йеллоустонская вулканологическая обсерватория','Observatorio Vulcanológico de Yellowstone'),
      'Northern Mariana Islands':LA('Northern Mariana Islands','北マリアナ諸島','Nördliche Marianen','Северные Марианские острова','Islas Marianas del Norte'),
    },
    weekly:{
      'New Unrest':LA('New Unrest','新たな活動の高まり','Neue Unruhe','Новая активизация','Nueva actividad anómala'),
      'Ongoing Unrest':LA('Ongoing Unrest','継続中の活動の高まり','Anhaltende Unruhe','Продолжающаяся активизация','Actividad anómala en curso'),
      'Continuing Unrest':LA('Continuing Unrest','引き続く活動の高まり','Fortdauernde Unruhe','Непрекращающаяся активизация','Actividad anómala continuada'),
      'New Eruptive Activity':LA('New Eruptive Activity','新たな噴火活動','Neue Eruptionstätigkeit','Новая эруптивная активность','Nueva actividad eruptiva'),
      'Ongoing Activity':LA('Ongoing Activity','継続中の活動','Anhaltende Aktivität','Продолжающаяся активность','Actividad en curso'),
      'Continuing Eruptive Activity':LA('Continuing Eruptive Activity','引き続く噴火活動','Fortdauernde Eruptionstätigkeit','Непрекращающаяся эруптивная активность','Actividad eruptiva continuada'),
      'New Activity/Unrest':LA('New Activity/Unrest','新たな活動/活動の高まり','Neue Aktivität/Unruhe','Новая активность/активизация','Nueva actividad/actividad anómala'),
    },
    jma:{
      '火口周辺危険':LA('火口周辺危険','火口周辺危険','Gefahr in Kraternähe','Опасность вблизи кратера','Peligro en las inmediaciones del cráter'),
      '入山危険':LA('入山危険','入山危険','Vulkan nicht betreten','Не приближайтесь к вулкану','No se acerque al volcán'),
      'レベル２（火口周辺規制）':LA('レベル２（火口周辺規制）','レベル２（火口周辺規制）','Stufe 2 (Krater nicht annähern)','Уровень 2 (не приближайтесь к кратеру)','Nivel 2 (no se acerque al cráter)'),
      'レベル３（入山規制）':LA('レベル３（入山規制）','レベル３（入山規制）','Stufe 3 (Vulkan nicht betreten)','Уровень 3 (не приближайтесь к вулкану)','Nivel 3 (no se acerque al volcán)'),
      '周辺海域警戒':LA('周辺海域警戒','周辺海域警戒','Warnung für das umliegende Seegebiet','Предупреждение для прилегающей акватории','Alerta en la zona marítima circundante'),
      '継続':LA('継続','継続','Unverändert','Без изменений','Sin cambios'),
      '引下げ':LA('引下げ','引下げ','Herabgestuft','Понижен','Rebajado'),
      '引上げ':LA('引上げ','引上げ','Heraufgestuft','Повышен','Elevado'),
    },
    misc:{
      'administered by':LA('administered by','管理国','Verwaltet von','Управляющая страна','Administrado por'),
      'claimed by':LA('claimed by','領有権主張国','Beansprucht von','Претендующая страна','Reclamado por'),
      'Undersea Features':LA('Undersea Features','海底地形','Unterseeische Strukturen','Подводные формы рельефа','Rasgos submarinos'),
    },  };
  /* ⚠ the five USGS hazard classes are NOT duplicated here — js/volcano-layers.js owns them, and the
     only moment this card has a hazard class to print is a moment that module is already loaded
     (`hazardFor` comes from it). A second copy is how the legend and the popup came to disagree. */
  const hazName=(k)=>{ try{ return window.IntMapVolcanoLayers.hazardName(k); }catch(_){ return String(k||''); } };
  /* ⚠ AN UNKNOWN VALUE FALLS BACK TO WHAT THE AGENCY SAID, never to an empty cell. The catalog
     vocabularies are gated; the live feeds are not gateable (USGS can add an observatory tomorrow),
     so for those the honest answer to «I have no translation» is the original words. */
  function term(kind,v){
    if(v==null||v==='') return '';
    const t=VOCAB[kind]&&VOCAB[kind][v];
    return t?L.arr(t):String(v);
  }

  /* GVP's Country is a STRING, and the reader's language already has every country name in it —
     CLDR, through Intl.DisplayNames (js/widget-core.js, #R249: «never a bundled table»). So the
     table below carries ISO 3166 codes, not names, and the names come from the platform. GVP's own
     compounds are preserved: a volcano ON a border names both countries, and the two entries GVP
     qualifies («administered by», «claimed by») keep the qualification — dropping it would make this
     map assert a sovereignty GVP itself declines to assert. */
  const CTRY_ISO={
    'Algeria':'DZ','Antarctica':'AQ','Argentina':'AR','Armenia':'AM','Armenia-Azerbaijan':'AM,AZ',
    'Australia':'AU','Bolivia':'BO','Burma (Myanmar)':'MM','Cabo Verde':'CV','Cameroon':'CM',
    'Canada':'CA','Chad':'TD','Chile':'CL','Chile-Argentina':'CL,AR','Chile-Bolivia':'CL,BO',
    'China':'CN','China-North Korea':'CN,KP','Colombia':'CO','Colombia-Ecuador':'CO,EC',
    'Costa Rica':'CR','DR Congo':'CD','DR Congo-Rwanda':'CD,RW','Djibouti':'DJ','Dominica':'DM',
    'Ecuador':'EC','El Salvador':'SV','Equatorial Guinea':'GQ','Eritrea':'ER','Eritrea-Djibouti':'ER,DJ',
    'Ethiopia':'ET','Ethiopia-Djibouti':'ET,DJ','Ethiopia-Eritrea':'ET,ER','Ethiopia-Eritrea-Djibouti':'ET,ER,DJ',
    'Fiji':'FJ','France':'FR','Georgia':'GE','Germany':'DE','Greece':'GR','Grenada':'GD',
    'Guatemala':'GT','Guatemala-El Salvador':'GT,SV','Honduras':'HN','Iceland':'IS','India':'IN',
    'Indonesia':'ID','Iran':'IR','Italy':'IT','Japan':'JP','Kenya':'KE','Mexico':'MX',
    'Mexico-Guatemala':'MX,GT','Mongolia':'MN','Netherlands':'NL','New Zealand':'NZ','Nicaragua':'NI',
    'Niger':'NE','Norway':'NO','Panama':'PA','Papua New Guinea':'PG','Peru':'PE','Philippines':'PH',
    'Portugal':'PT','Russia':'RU','Saint Kitts and Nevis':'KN','Saint Lucia':'LC',
    'Saint Vincent and the Grenadines':'VC','Samoa':'WS','Saudi Arabia':'SA','Solomon Islands':'SB',
    'South Africa':'ZA','South Korea':'KR','Spain':'ES','Sudan':'SD','Syria-Jordan-Saudi Arabia':'SY,JO,SA',
    'Taiwan':'TW','Tanzania':'TZ','Tonga':'TO','Turkiye':'TR','Uganda':'UG','Union of the Comoros':'KM',
    'United Kingdom':'GB','United States':'US','Vanuatu':'VU','Vietnam':'VN','Yemen':'YE',
  };
  /* the two GVP entries that name a country AND a dispute, and the one that names no country at all */
  const CTRY_QUAL={
    'France - claimed by Vanuatu':{ iso:'FR', by:'VU', kind:'claim' },
    'Japan - administered by Russia':{ iso:'JP', by:'RU', kind:'admin' },
  };
  const cldr=(cc)=>{ try{ return window.IntMapWidgetCore.countryName(cc,cc); }catch(_){ return cc; } };
  /* OpenStreetMap's own multilingual name key for the reader's language. ⚠ (#R395) the aerodrome
     query used to prefer `name:en` unconditionally, so a Japanese reader was shown «Kagoshima
     Airport» even where OSM carries 「鹿児島空港」. OSM's tags do not use IntMap's language codes:
     Japanese is `ja` (this repo says `jp`) and Chinese splits into script subtags. */
  const OSM_LANG={ jp:'ja', ja:'ja', zh:'zh-Hant', 'zh-hans':'zh-Hans' };
  const osmName=()=>{ const c=langNow(); return 'name:'+(OSM_LANG[c]||c); };
  function countryName(name){
    if(name==null||name==='') return '';
    /* ⚠ the qualifier is a row of the vocabulary like any other — writing it inline here as well
       would give one English key two Japanese translations, which is the #R370 collision exactly. */
    const q=CTRY_QUAL[name];
    if(q) return cldr(q.iso)+' — '+term('misc',q.kind==='claim'?'claimed by':'administered by')+': '+cldr(q.by);
    const iso=CTRY_ISO[name];
    if(iso) return iso.split(',').map(cldr).join(' – ');
    return term('misc',name);
  }

  /* ══ 3. THE LIVE SOURCES ═══════════════════════════════════════════════════════════════════
     Four are fetched directly (they answer with Access-Control-Allow-Origin: *) and two go through
     supabase/functions/volcano-feed, which is where the measurement of who does and does not send
     that header is written down. Each feed keeps its own state so the UI can tell "nothing is
     happening" apart from "this feed did not answer" — the same distinction the warning layer draws
     with hatching, and the reason nothing below collapses a failure into an empty array. */
  const RELAY=(qs)=>{ let b=''; try{ b=String(window.SUPABASE_URL||'').replace(/\/$/,''); }catch(_){ b=''; }
    return b?(b+'/functions/v1/volcano-feed?'+qs):''; };
  const HANS='https://volcanoes.usgs.gov/hans-public/api/';
  const JMA_WARN='https://www.jma.go.jp/bosai/volcano/data/warning.json';

  const FEEDS={
    usgs:{ state:'idle', at:0, rows:null, err:'' },
    usgsMon:{ state:'idle', at:0, rows:null, err:'' },
    vona:{ state:'idle', at:0, rows:null, err:'' },
    jma:{ state:'idle', at:0, rows:null, err:'' },
    weekly:{ state:'idle', at:0, rows:null, err:'' },
  };
  const FRESH_MS=5*60*1000;

  async function getJSON(url,ms){
    const ctrl=new AbortController(); const to=setTimeout(()=>{ try{ ctrl.abort(); }catch(_){} }, ms||15000);
    try{ const r=await fetch(url,{signal:ctrl.signal}); clearTimeout(to);
      if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); }
    finally{ clearTimeout(to); }
  }
  function mark(k,rows,err){ const f=FEEDS[k];
    if(err){ f.state='failed'; f.err=String(err&&err.message||err||'').slice(0,120); }
    else { f.state='ok'; f.rows=rows; f.err=''; }
    f.at=Date.now(); notify(); }

  async function pull(k){
    const f=FEEDS[k];
    if(f.state==='loading') return f.rows;
    if(f.state==='ok'&&Date.now()-f.at<FRESH_MS) return f.rows;
    f.state='loading'; notify();
    try{
      if(k==='usgs'){
        const j=await getJSON(HANS+'volcano/getElevatedVolcanoes',15000);
        mark(k, Array.isArray(j)?j:[]);
      } else if(k==='usgsMon'){
        const j=await getJSON(HANS+'volcano/getMonitoredVolcanoes',20000);
        mark(k, Array.isArray(j)?j:[]);
      } else if(k==='vona'){
        const j=await getJSON(HANS+'notice/getVonasWithinLastYear',20000);
        mark(k, Array.isArray(j)?j:[]);
      } else if(k==='jma'){
        const j=await getJSON(JMA_WARN,15000);
        mark(k, Array.isArray(j)?j:[]);
      } else if(k==='weekly'){
        const u=RELAY('feed=weekly'); if(!u) throw new Error('no relay');
        const j=await getJSON(u,20000);
        mark(k, (j&&Array.isArray(j.rows))?j.rows:[]);
      }
    }catch(e){ mark(k,null,e); }
    return FEEDS[k].rows;
  }
  /* ⚠ ALL FIVE AT ONCE, AND FAILURES DO NOT CANCEL EACH OTHER. A dead relay must not take the two
     national feeds down with it — that is how one outage turns into "IntMap says nothing about
     volcanoes", which is the failure mode this project keeps rediscovering. */
  function warm(){ return Promise.all(['usgs','usgsMon','vona','jma','weekly'].map(k=>pull(k).catch(()=>null))); }

  const subs=new Set();
  function notify(){ for(const fn of subs){ try{ fn(); }catch(_){} } }
  function onChange(fn){ subs.add(fn); return ()=>subs.delete(fn); }

  /* ══ 4. THE STATUS LADDER ══════════════════════════════════════════════════════════════════
     `rank` is a DRAWING order — 0 quiet … 4 the highest thing any of the three agencies said — and it
     exists only so the map can sort colours. It is never shown as a number and never presented as a
     level: `label` and `source` carry the agency's own words. */
  const RANK={ NORMAL:0, GREEN:0, ADVISORY:2, YELLOW:2, WATCH:3, ORANGE:3, WARNING:4, RED:4 };

  /* ⚠⚠⚠ (#R395) «NOTHING PUBLISHED» WAS BEING SAID ABOUT 65 VOLCANOES USGS PUBLISHES A LEVEL FOR.
     Rung ① read `volcano/getElevatedVolcanoes`, which by construction answers ONLY the volcanoes
     currently above normal — 5 of them on the day this was measured. Every other US volcano fell
     through to rung ⓪ and the card said «no observatory publishes a current level», which is the one
     sentence this file exists to make true. `volcano/getMonitoredVolcanoes` is the same shape over
     the whole monitored set — measured the same minute: 70 rows, of which 65 GREEN/NORMAL, and the
     five elevated ones carry byte-identical colour/level/timestamps to the elevated feed, so it is a
     strict superset rather than a second opinion. GREEN/NORMAL from USGS is a STATEMENT — the map
     already draws rank 0 in its own colour precisely so that «an agency looked and says normal»
     cannot be confused with «nobody publishes anything» (js/beta-overlays.js volcColor, #R353). */
  function usgsFor(vn){
    const el=FEEDS.usgs.rows;
    if(el){ for(const r of el){ if(+r.vnum===vn) return r; } }
    const mon=FEEDS.usgsMon.rows;
    if(mon){ for(const r of mon){ if(+r.vnum===vn) return r; } }
    return null;
  }
  /* whether USGS carries this volcano in its monitored set at all — the difference between «USGS
     says normal» and «USGS does not speak about this volcano», which the panel prints in words */
  function usgsMonitors(vn){
    const mon=FEEDS.usgsMon.rows; if(!mon) return false;
    for(const r of mon){ if(+r.vnum===vn) return true; } return false;
  }
  function vonaFor(vn){
    const rows=FEEDS.vona.rows; if(!rows) return [];
    return rows.filter(r=>+r.vnum===vn).sort((a,b)=>(+b.sent_unixtime||0)-(+a.sent_unixtime||0));
  }
  function weeklyFor(vn){
    const rows=FEEDS.weekly.rows; if(!rows) return null;
    for(const r of rows){ if(+r.v===vn) return r; } return null;
  }
  /* JMA publishes one entry per volcano under warning; `volcanoInfos[0]` is the 対象火山 block and its
     items name the warning. 「レベル２（火口周辺規制）」 carries the number in the string, and the
     volcanoes JMA does not operate a level for carry a worded warning instead (「入山危険」,
     「周辺海域警戒」) — which is printed as written rather than converted into a level that does not
     exist for that volcano. */
  const JMA_LEVEL=/レベル\s*([1-5１-５])/;
  const jmaNum=(s)=>{ const m=JMA_LEVEL.exec(s||''); if(!m) return null;
    const c=m[1]; return c>='１'?(c.charCodeAt(0)-'０'.charCodeAt(0)):+c; };
  function jmaFor(vn){
    const rows=FEEDS.jma.rows; if(!rows) return null;
    let best=null;
    for(const e of rows){
      const infos=(e&&e.volcanoInfos)||[]; const block=infos[0]; if(!block) continue;
      for(const it of (block.items||[])){
        for(const a of (it.areas||[])){
          if(JMA_TO_GVP[jmaKey(a.name)]!==vn) continue;
          const lvl=jmaNum(it.name);
          const cand={ unit:a.name, jmaCode:a.code, text:it.name, kind:it.code,
                       level:lvl, condition:it.condition||'', at:e.reportDatetime||'' };
          if(!best||(cand.level||0)>(best.level||0)) best=cand;
        }
      }
    }
    return best;
  }

  /* JMA's five levels against the same 0–4 drawing order. 1 (活火山であることに留意) is not "calm" and
     not "elevated" — it is the baseline for a volcano JMA watches, so it draws as rank 1. */
  const JMA_RANK={1:1,2:2,3:3,4:4,5:4};

  function status(vn){
    /* ① the United States */
    const u=usgsFor(vn);
    if(u) return { tier:1, rank:Math.max(RANK[u.color_code]||0,RANK[u.alert_level]||0),
      label:(u.color_code||'')+' / '+(u.alert_level||''), colorCode:u.color_code||'', alertLevel:u.alert_level||'',
      unit:u.volcano_name||'', source:u.obs_fullname||'USGS', at:u.sent_utc||'',
      monitored:true, elevated:(RANK[u.color_code]||RANK[u.alert_level]||0)>0,
      url:u.notice_url||'https://volcanoes.usgs.gov/vhp/updates.html' };
    /* ② Japan */
    const j=jmaFor(vn);
    if(j) return { tier:2, rank:(j.level!=null?JMA_RANK[j.level]:3), label:j.text, level:j.level,
      unit:j.unit, condition:j.condition, source:L('Japan Meteorological Agency','気象庁',
        'Japanische Wetterbehörde','Японское метеорологическое агентство','Agencia Meteorológica de Japón'),
      at:j.at||'', url:'https://www.jma.go.jp/bosai/map.html#contents=volcano' };
    /* ③ the world, this week */
    const w=weeklyFor(vn);
    if(w) return { tier:3, rank:/eruptiv|eruption/i.test(w.status||'')?3:2, label:w.status||'',
      unit:w.name||'', period:w.period||'', text:w.text||'',
      source:L('Smithsonian / USGS Weekly Volcanic Activity Report','スミソニアン／USGS 週間火山活動報告',
        'Smithsonian/USGS Wöchentlicher Vulkanaktivitätsbericht','Еженедельный отчёт Смитсоновского института и USGS',
        'Informe semanal de actividad volcánica (Smithsonian/USGS)'),
      at:w.at||'', url:'https://volcano.si.edu/reports_weekly.cfm' };
    /* ⓪ nothing published — said, not drawn as calm */
    return { tier:0, rank:null, label:'', source:'', at:'', url:'' };
  }
  /* every volcano the four feeds have anything to say about, for the map's colour mode.
     ⚠ (#R395) THE MONITORED SET IS IN HERE TOO, AND THAT IS THE POINT: a volcano USGS watches and
     calls GREEN/NORMAL belongs in rank 0 — «an observatory looked» — and not in the base colour,
     which means «nobody publishes anything a map can read». */
  function statusIndex(){
    const m=new Map();
    const add=(vn,st)=>{ const p=m.get(vn); if(!p||(st.tier<p.tier)) m.set(vn,st); };
    for(const r of (FEEDS.usgs.rows||[])) add(+r.vnum,status(+r.vnum));
    for(const r of (FEEDS.usgsMon.rows||[])) add(+r.vnum,status(+r.vnum));
    for(const e of (FEEDS.jma.rows||[])){
      for(const it of (((e.volcanoInfos||[])[0]||{}).items||[])){
        for(const a of (it.areas||[])){ const vn=JMA_TO_GVP[jmaKey(a.name)]; if(vn) add(vn,status(vn)); }
      }
    }
    for(const r of (FEEDS.weekly.rows||[])) add(+r.v,status(+r.v));
    return m;
  }

  /* ══ 5. WHAT THE ERUPTION RECORD ITSELF SAYS ═══════════════════════════════════════════════
     Everything below is computed from that volcano's own slice of the bundled GVP eruption record
     (d.er). Nothing is a lookup of "volcanoes like this usually…", and the panel labels each figure
     with how many eruptions it rests on, because a "typical VEI" from three eruptions and one from
     forty-eight are not the same claim. */
  function character(rows){
    if(!rows||!rows.length) return null;
    const confirmed=rows.filter(r=>r[9]===1);
    const veis=confirmed.map(r=>r[7]).filter(v=>v!=null);
    const hist=[0,0,0,0,0,0,0,0];
    for(const v of veis) if(v>=0&&v<=7) hist[v]++;
    const years=confirmed.map(r=>r[1]).filter(y=>y!=null).sort((a,b)=>a-b);
    /* repose intervals from the OBSERVED era only. Prehistoric dates come from radiocarbon and
       tephrochronology, which resolve centuries, so mixing them into a mean interval would produce a
       number about the dating methods rather than about the volcano. */
    const obs=years.filter(y=>y>=1500);
    let repose=null;
    if(obs.length>=3){ const gaps=[]; for(let i=1;i<obs.length;i++) gaps.push(obs[i]-obs[i-1]);
      gaps.sort((a,b)=>a-b); repose=gaps[Math.floor(gaps.length/2)]; }
    let biggest=null;
    for(const r of confirmed){ if(r[7]!=null&&(!biggest||r[7]>biggest[7])) biggest=r; }
    const ongoing=confirmed.some(r=>r[4]==null&&r[1]!=null&&r[1]>=(new Date().getFullYear()-2));
    return { n:confirmed.length, uncertain:rows.length-confirmed.length, veis:veis.length, hist,
      first:years.length?years[0]:null, last:years.length?years[years.length-1]:null,
      maxVei:veis.length?Math.max(...veis):null, modeVei:hist.indexOf(Math.max(...hist)),
      explosive:veis.length?veis.filter(v=>v>=4).length:0, repose, biggest, ongoing, obsCount:obs.length };
  }

  /* ══ 6. NEARBY EARTHQUAKES — asked per volcano, never as a background sweep ════════════════ */
  const QUAKE='https://earthquake.usgs.gov/fdsnws/event/1/query';
  const quakeCache=new Map();
  async function quakesNear(vn,radiusKm,days){
    const f=base(vn); if(!f) return null;
    const key=vn+':'+(radiusKm||50)+':'+(days||30);
    if(quakeCache.has(key)) return quakeCache.get(key);
    const c=f.geometry.coordinates;
    const start=new Date(Date.now()-(days||30)*86400000).toISOString().slice(0,10);
    const u=QUAKE+'?format=geojson&latitude='+c[1].toFixed(4)+'&longitude='+c[0].toFixed(4)
      +'&maxradiuskm='+(radiusKm||50)+'&starttime='+start+'&orderby=time&limit=200';
    try{
      const j=await getJSON(u,20000);
      const rows=((j&&j.features)||[]).map(q=>({
        m:q.properties&&q.properties.mag, at:q.properties&&q.properties.time,
        depth:q.geometry&&q.geometry.coordinates&&q.geometry.coordinates[2],
        place:q.properties&&q.properties.place, url:q.properties&&q.properties.url,
        km:haversine(c[1],c[0],q.geometry.coordinates[1],q.geometry.coordinates[0]) }));
      const out={ ok:true, rows, radiusKm:radiusKm||50, days:days||30 };
      quakeCache.set(key,out); return out;
    }catch(e){ const out={ ok:false, rows:[], radiusKm:radiusKm||50, days:days||30 }; quakeCache.set(key,out); return out; }
  }
  function haversine(la1,lo1,la2,lo2){ const R=6371, r=Math.PI/180;
    const dLa=(la2-la1)*r, dLo=(lo2-lo1)*r;
    const a=Math.sin(dLa/2)**2+Math.cos(la1*r)*Math.cos(la2*r)*Math.sin(dLo/2)**2;
    return 2*R*Math.asin(Math.min(1,Math.sqrt(a))); }

  /* ══ 7. NEAREST AERODROMES — OpenStreetMap, asked per volcano ══════════════════════════════
     「周辺人口・空港・航空路への影響」. The population radii are bundled (GVP measures them); the
     airports are not, because no bundled airport set exists in this repo. `aeroway=aerodrome` inside
     150 km, from the same three Overpass mirrors js/atlas-sources.js races, raced rather than
     chained so one slow mirror does not become the answer's latency. */
  const OP_EPS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
  const aptCache=new Map();
  async function airportsNear(vn,radiusKm){
    const f=base(vn); if(!f) return null;
    const key=vn+':'+(radiusKm||150);
    if(aptCache.has(key)) return aptCache.get(key);
    const c=f.geometry.coordinates;
    const q='[out:json][timeout:25];nwr["aeroway"="aerodrome"](around:'+((radiusKm||150)*1000)+','+c[1].toFixed(4)+','+c[0].toFixed(4)+');out center tags 60;';
    const one=(ep)=>fetch(ep,{method:'POST',body:'data='+encodeURIComponent(q),
      headers:{'content-type':'application/x-www-form-urlencoded'}}).then(r=>r.ok?r.json():Promise.reject(new Error('HTTP '+r.status)));
    try{
      const j=await Promise.any(OP_EPS.map(one));
      const rows=((j&&j.elements)||[]).map(el=>{
        const t=el.tags||{}, lat=el.lat!=null?el.lat:(el.center&&el.center.lat), lon=el.lon!=null?el.lon:(el.center&&el.center.lon);
        if(lat==null||lon==null) return null;
        return { name:t[osmName()]||t['name:en']||t.name||t.icao||t.iata||'', icao:t.icao||'', iata:t.iata||'',
          kind:t.aerodrome||t['aerodrome:type']||'', km:haversine(c[1],c[0],lat,lon), lat, lng:lon };
      }).filter(Boolean).filter(a=>a.name||a.icao||a.iata).sort((a,b)=>a.km-b.km).slice(0,12);
      const out={ ok:true, rows, radiusKm:radiusKm||150 };
      aptCache.set(key,out); return out;
    }catch(_){ const out={ ok:false, rows:[], radiusKm:radiusKm||150 }; aptCache.set(key,out); return out; }
  }

  /* ══ 8. THE PANEL ══════════════════════════════════════════════════════════════════════════ */
  let el=null, curVn=null, extra={ quakes:null, apts:null, forVn:null }, tab='now';
  function ensureEl(){
    if(el&&document.body.contains(el)) return el;
    el=document.createElement('div');
    el.className='country-popup volc-popup'; el.id='volc-popup';
    el.innerHTML='<button class="country-popup-close" id="volcp-close" type="button" title="'+S(L('Close','閉じる','Schließen','Закрыть','Cerrar'))+'">×</button>'
      +'<div class="country-popup-header"><h3 id="volcp-title"></h3></div>'
      +'<div class="volc-tabs" id="volcp-tabs"></div><div id="volcp-body"></div>';
    (document.getElementById('map-container')||document.body).appendChild(el);
    el.querySelector('#volcp-close').addEventListener('click',()=>close());
    try{ HOST.makeDraggable(el, el.querySelector('.country-popup-header')); }catch(_){}
    el.addEventListener('mousedown',()=>{ try{ HOST.bringToFront(el); }catch(_){} });
    el.addEventListener('click',(ev)=>{
      const b=ev.target&&ev.target.closest?ev.target.closest('[data-volcp]'):null; if(!b) return;
      const a=b.dataset.volcp;
      if(a==='goto') gotoVolcano();
      else if(a==='quakes') loadQuakes();
      else if(a==='apts') loadAirports();
      else if(a==='ash'){ try{ window.IntMapLazy.need('volcanoLayers').then(()=>window.IntMapVolcanoLayers&&window.IntMapVolcanoLayers.ash(true)); }catch(_){} }
      else if(a==='so2'){ try{ window.IntMapLazy.need('volcanoLayers').then(()=>window.IntMapVolcanoLayers&&window.IntMapVolcanoLayers.so2(true)); }catch(_){} }
      else if(a==='hazard'){ try{ window.IntMapLazy.need('volcanoLayers').then(()=>window.IntMapVolcanoLayers&&window.IntMapVolcanoLayers.hazard(true,curVn)); }catch(_){} }
      else if(a==='thermal'){ openThermal(); }
      else if(b.dataset.tab){ tab=b.dataset.tab; render(); }
    });
    return el;
  }
  const row=(k,v)=>(v===''||v==null)?'':'<div class="acp-row"><span class="acp-k">'+S(k)+'</span><span class="acp-v">'+S(v)+'</span></div>';
  const sec=(t2)=>'<div class="acp-sec">'+S(t2)+'</div>';
  const note=(t2)=>'<div class="acp-note">'+S(t2)+'</div>';
  const hint=(t2)=>'<div class="tp-hint">'+S(t2)+'</div>';

  /* ⚠⚠ (#R395) PROSE IS NOT VOCABULARY, AND THE DIFFERENCE IS VISIBLE TO THE READER. The terms above
     come from closed lists and are translated; the geological summary, the VONA synopsis, the weekly
     report's narrative and JMA's own wording are paragraphs an institution WROTE. They are shown in
     the language they were published in, and the line under them says which language that is — in
     the reader's language. Saying nothing would let a reader take an untranslated paragraph for a
     translation failure; machine-translating it would put words in a volcano observatory's mouth. */
  function proseNote(src){
    const c=langNow();
    if(src==='ja'){ if(c==='jp'||c==='ja') return '';
      return '<div class="volc-orig">'+S(L('Published in Japanese by the agency and shown exactly as issued — this map does not reword a warning.',
        '気象庁が日本語で発表した文言を、そのまま表示しています。',
        'Von der Behörde auf Japanisch veröffentlicht und unverändert wiedergegeben — diese Karte formuliert eine Warnung nicht um.',
        'Опубликовано агентством по-японски и показано дословно — карта не перефразирует предупреждение.',
        'Publicado en japonés por la agencia y mostrado tal cual — este mapa no reformula un aviso.'))+'</div>'; }
    if(c.startsWith('en')) return '';
    return '<div class="volc-orig">'+S(L('Published in English by the source and shown exactly as written. Descriptions written by an observatory are not machine-translated here; the classifications above are translated because they come from a fixed vocabulary.',
      '出典が英語で公表した文章を、そのまま表示しています。観測機関が書いた記述は機械翻訳しません（上の分類語は決まった語彙なので翻訳しています）。',
      'Von der Quelle auf Englisch veröffentlicht und unverändert wiedergegeben. Von einem Observatorium verfasste Beschreibungen werden hier nicht maschinell übersetzt; die Klassifikationen oben schon, weil sie aus einem festen Vokabular stammen.',
      'Опубликовано источником по-английски и приведено дословно. Описания, написанные обсерваторией, здесь не переводятся машинно; классификации выше переведены, потому что взяты из фиксированного словаря.',
      'Publicado en inglés por la fuente y mostrado tal cual. Las descripciones redactadas por un observatorio no se traducen automáticamente aquí; las clasificaciones anteriores sí, porque proceden de un vocabulario cerrado.'))+'</div>';
  }
  const prose=(txt,src)=>!txt?'':('<div class="volc-narr">'+S(txt)+'</div>'+proseNote(src||'en'));
  /* JMA's warning wording is a fixed phrase, so it IS translatable — but the agency's own words stay
     on screen beside the translation, because 「レベル２（火口周辺規制）」 is what a Japanese reader
     will hear on the news and what any other source will quote. */
  function jmaWord(s){
    if(!s) return '';
    const t=term('jma',s); const c=langNow();
    return (t&&t!==s&&c!=='jp'&&c!=='ja')?(t+' ('+s+')'):t;
  }

  function yearTxt(y){ if(y==null) return '';
    return y<0?L('BCE ','紀元前','v. Chr. ','до н.э. ','a.C. ')+Math.abs(y):String(y); }
  function dateTxt(y,m,d){ if(y==null) return '';
    if(!m) return yearTxt(y);
    if(!d) return yearTxt(y)+'-'+String(m).padStart(2,'0');
    return yearTxt(y)+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }

  /* the four rungs, as words. Never a number, never a merged scale. */
  function statusBadge(st){
    if(st.tier===0) return '<span class="volc-badge q">'+S(L('No current statement published','現在の状況を公表している出典なし',
      'Keine aktuelle Angabe veröffentlicht','Текущих сообщений не публикуется','Sin declaración actual publicada'))+'</span>';
    const cls=st.rank>=4?'r':st.rank>=3?'o':st.rank>=2?'y':'g';
    return '<span class="volc-badge '+cls+'">'+S(st.label)+'</span>'
      +'<span class="volc-badge src">'+S(st.source)+'</span>';
  }

  function tabsHTML(){
    const items=[['now',L('Now','現在','Jetzt','Сейчас','Ahora')],
      ['history',L('Eruptions','噴火履歴','Ausbrüche','Извержения','Erupciones')],
      ['about',L('The volcano','火山の姿','Der Vulkan','О вулкане','El volcán')],
      ['impact',L('Exposure','影響範囲','Exposition','Воздействие','Exposición')]];
    return items.map(([k,lab])=>'<button type="button" class="volc-tab'+(tab===k?' on':'')+'" data-volcp="tab" data-tab="'+k+'">'+S(lab)+'</button>').join('');
  }

  function nowHTML(f,d){
    const vn=f.properties.v, st=status(vn), u=usgsFor(vn), j=jmaFor(vn), w=weeklyFor(vn), vona=vonaFor(vn);
    let h='<div class="volc-badges">'+statusBadge(st)+'</div>';
    if(st.tier===0){
      h+=note(L('No volcano observatory publishes a machine-readable current level for this volcano. That is not the same as "quiet" — it means this map has nothing to report.',
        'この火山について、現在の警戒レベルを機械可読な形で公表している観測機関がありません。「静穏」という意味ではなく、この地図が報告できる情報が無いという意味です。',
        'Kein Observatorium veröffentlicht für diesen Vulkan eine maschinenlesbare aktuelle Stufe. Das heißt nicht „ruhig“, sondern dass diese Karte nichts zu melden hat.',
        'Ни одна обсерватория не публикует машиночитаемый текущий уровень для этого вулкана. Это не значит «спокоен» — это значит, что карте нечего сообщить.',
        'Ningún observatorio publica un nivel actual legible por máquina para este volcán. No significa «en calma»: significa que este mapa no tiene nada que informar.'));
    }
    if(u){
      h+=sec(L('United States — USGS aviation colour code and alert level','米国 — USGS 航空カラーコードと警戒レベル',
        'USA — USGS Luftfahrt-Farbcode und Warnstufe','США — цветовой код авиации и уровень тревоги USGS','EE. UU. — código de color de aviación y nivel de alerta del USGS'))
        +row(L('Aviation colour code','航空カラーコード','Luftfahrt-Farbcode','Цветовой код для авиации','Código de color de aviación'),term('usgs',u.color_code))
        +row(L('Volcano alert level','火山警戒レベル','Vulkan-Warnstufe','Уровень вулканической тревоги','Nivel de alerta volcánica'),term('usgs',u.alert_level))
        +row(L('Observatory','観測所','Observatorium','Обсерватория','Observatorio'),term('observatory',u.obs_fullname))
        +row(L('Issued','発表','Ausgegeben','Выпущено','Emitido'),(u.sent_utc||'')+' UTC');
      /* ⚠ (#R395) GREEN/NORMAL IS A STATEMENT, AND THE CARD HAS TO SAY THAT IT IS ONE. Until this
         round only the elevated feed was read, so 65 of the 70 volcanoes USGS monitors fell to rung
         ⓪ and this card told the reader nobody publishes a level for them — the opposite of true. */
      if(!st.elevated) h+=note(L('This is a published statement, not silence: USGS monitors this volcano and its current level is the one above. The date is when that level was last issued — it stands until USGS changes it.',
        'これは「公表されている状況」であって、沈黙ではありません。USGS はこの火山を監視しており、現在の水準は上記のとおりです。日付はその水準が最後に発表された日で、USGS が変更するまで有効です。',
        'Das ist eine veröffentlichte Aussage, kein Schweigen: USGS überwacht diesen Vulkan, die aktuelle Stufe steht oben. Das Datum ist die letzte Ausgabe dieser Stufe; sie gilt, bis USGS sie ändert.',
        'Это опубликованное заявление, а не молчание: USGS ведёт наблюдение за этим вулканом, текущий уровень указан выше. Дата — когда этот уровень был выпущен в последний раз; он действует, пока USGS его не изменит.',
        'Es una declaración publicada, no silencio: el USGS vigila este volcán y su nivel actual es el anterior. La fecha es la última emisión de ese nivel; sigue vigente hasta que el USGS lo cambie.'));
    }
    if(j){
      h+=sec(L('Japan — JMA eruption warning','日本 — 気象庁 噴火警報・予報','Japan — JMA-Ausbruchswarnung','Япония — предупреждение JMA','Japón — aviso de erupción de la JMA'))
        +row(L('Warning unit','対象火山（気象庁の単位）','Warngebiet','Единица предупреждения','Unidad de aviso'),j.unit)
        +row(L('Announcement','発表内容','Warnung','Предупреждение','Aviso'),jmaWord(j.text))
        +(j.level!=null?row(L('Eruption warning level','噴火警戒レベル','Ausbruchswarnstufe','Уровень предупреждения','Nivel de alerta'),String(j.level)+' / 5'):'')
        +row(L('Change','変化','Änderung','Изменение','Cambio'),jmaWord(j.condition))
        +row(L('Issued','発表','Ausgegeben','Выпущено','Emitido'),String(j.at||'').replace('T',' ').slice(0,16));
      if(j.level==null) h+=note(L('JMA does not operate a numbered eruption warning level for this volcano; the worded warning above is what it publishes.',
        'この火山では気象庁の噴火警戒レベルは運用されていません。上の文言そのものが公表されている内容です。',
        'Für diesen Vulkan betreibt die JMA keine nummerierte Warnstufe; die Wortmeldung oben ist das Veröffentlichte.',
        'Для этого вулкана JMA не ведёт нумерованный уровень; публикуется именно приведённая формулировка.',
        'La JMA no opera un nivel numerado para este volcán; lo publicado es el aviso en palabras.'));
    }
    if(w){
      h+=sec(L('This week — Smithsonian / USGS Weekly Volcanic Activity Report','今週 — スミソニアン／USGS 週間火山活動報告',
        'Diese Woche — Wöchentlicher Vulkanaktivitätsbericht','На этой неделе — еженедельный отчёт','Esta semana — informe semanal de actividad volcánica'))
        +row(L('Status','状況','Status','Статус','Estado'),term('weekly',w.status))
        +row(L('Report period','報告期間','Berichtszeitraum','Период отчёта','Periodo del informe'),w.period)
        +prose(w.text,'en');
    }
    /* VONA — the aviation notice itself, not a summary of it */
    h+=sec(L('VONA — Volcano Observatory Notice for Aviation','VONA — 航空関係者向け火山情報','VONA — Vulkanmeldung für die Luftfahrt','VONA — уведомление для авиации','VONA — aviso volcánico para la aviación'));
    if(FEEDS.vona.state==='failed') h+=hint(L('The USGS notice feed did not answer.','USGS の情報フィードが応答しませんでした。','Der USGS-Meldungsfeed hat nicht geantwortet.','Лента уведомлений USGS не ответила.','El feed de avisos del USGS no respondió.'));
    else if(FEEDS.vona.state!=='ok') h+=hint(L('Reading…','読み込み中…','Wird gelesen…','Чтение…','Leyendo…'));
    else if(!vona.length) h+=hint(L('No VONA has been issued for this volcano in the last year. VONA is issued by the volcano observatories of a handful of countries — the United States among them — so an absence here is not a statement about volcanoes elsewhere.',
      'この火山について、直近1年間に VONA は発表されていません。VONA を発表しているのは米国など一部の国の観測機関に限られるため、ここが空であることは他国の火山について何も述べていません。',
      'Für diesen Vulkan wurde im letzten Jahr keine VONA ausgegeben. VONA geben nur die Observatorien einiger Länder heraus — eine Leerstelle sagt nichts über Vulkane anderswo.',
      'За последний год для этого вулкана VONA не выпускались. VONA выпускают обсерватории лишь нескольких стран — пустота здесь ничего не говорит о вулканах в других местах.',
      'No se ha emitido ninguna VONA para este volcán en el último año. Solo los observatorios de algunos países emiten VONA — su ausencia aquí no dice nada sobre volcanes de otros lugares.'));
    else {
      for(const v of vona.slice(0,4)){
        h+='<div class="volc-vona"><div class="volc-vona-h">'+S(term('usgs',v.color_code)+' / '+term('usgs',v.alert_level)+' · '+String(v.sent_utc||'').slice(0,16)+' UTC')+'</div>'
          +'<div class="volc-vona-b">'+S(v.synopsis_complete||'')+'</div>'
          +(v.vona_url?'<a class="volc-link" target="_blank" rel="noopener" href="'+S(v.vona_url)+'">'+S(L('Read the notice','原文を読む','Meldung lesen','Читать уведомление','Leer el aviso'))+'</a>':'')
          +'</div>';
      }
      h+=proseNote('en');
      if(vona[0]&&vona[0].nvews_threat) h+=row(L('USGS national threat ranking','USGS 国内脅威度ランク','USGS-Bedrohungseinstufung','Рейтинг угрозы USGS','Clasificación de amenaza del USGS'),term('threat',vona[0].nvews_threat));
    }
    /* ash / SO2 / thermal — the three satellite-and-airspace doors */
    h+=sec(L('Ash, gas and heat','火山灰・ガス・熱','Asche, Gas und Hitze','Пепел, газ и тепло','Ceniza, gas y calor'))
      +'<button type="button" class="acp-mini" data-volcp="ash">'+S(L('Show volcanic-ash areas now in force (SIGMET)','現在有効な火山灰域を表示（SIGMET）','Aktuelle Vulkanasche-Gebiete zeigen (SIGMET)','Показать действующие зоны пепла (SIGMET)','Mostrar zonas de ceniza vigentes (SIGMET)'))+'</button>'
      +'<button type="button" class="acp-mini" data-volcp="so2">'+S(L('Show satellite SO₂ (OMPS, today)','衛星 SO₂ を表示（OMPS・当日）','Satelliten-SO₂ zeigen (OMPS, heute)','Показать SO₂ со спутника (OMPS, сегодня)','Mostrar SO₂ satelital (OMPS, hoy)'))+'</button>'
      +'<button type="button" class="acp-mini" data-volcp="thermal">'+S(L('Show satellite thermal anomalies here','この付近の衛星熱異常を表示','Thermische Anomalien hier zeigen','Показать тепловые аномалии здесь','Mostrar anomalías térmicas aquí'))+'</button>';
    return h;
  }

  function historyHTML(f,d){
    if(!d) return hint(detailFailed
      ?L('The bundled eruption record could not be loaded.','同梱の噴火記録を読み込めませんでした。','Der mitgelieferte Ausbruchsdatensatz konnte nicht geladen werden.','Не удалось загрузить встроенную запись извержений.','No se pudo cargar el registro de erupciones incluido.')
      :L('Reading the eruption record…','噴火記録を読み込み中…','Ausbruchsdatensatz wird gelesen…','Чтение записи извержений…','Leyendo el registro de erupciones…'));
    const ch=character(d.er);
    if(!ch) return hint(L('The Global Volcanism Program holds no dated eruption for this volcano. It is in the Holocene catalog on other evidence — see “The volcano”.',
      'この火山について、GVP は日付のある噴火を1件も記録していません。完新世カタログには別の証拠にもとづいて収録されています（「火山の姿」を参照）。',
      'Das Global Volcanism Program führt keinen datierten Ausbruch. Die Aufnahme in den Holozän-Katalog beruht auf anderen Belegen — siehe „Der Vulkan“.',
      'В базе GVP нет ни одного датированного извержения. В голоценовый каталог вулкан включён по иным свидетельствам — см. «О вулкане».',
      'El Global Volcanism Program no registra ninguna erupción fechada. Está en el catálogo del Holoceno por otras evidencias — ver «El volcán».'));
    const V=window.IntMapLang;
    let h=sec(L('The record','記録の全体','Der Datensatz','Запись','El registro'))
      +row(L('Confirmed eruptions','確認された噴火','Bestätigte Ausbrüche','Подтверждённые извержения','Erupciones confirmadas'),n0(ch.n))
      +row(L('Uncertain eruptions','不確実な噴火','Unsichere Ausbrüche','Неподтверждённые','Erupciones inciertas'),ch.uncertain?n0(ch.uncertain):'')
      +row(L('Earliest / latest','最古 / 最新','Frühester / letzter','Первое / последнее','Más antigua / más reciente'),
           (ch.first!=null?yearTxt(ch.first):'')+(ch.last!=null?' → '+yearTxt(ch.last):''))
      +row(L('Largest recorded VEI','記録された最大VEI','Größter erfasster VEI','Наибольший зафиксированный VEI','Mayor VEI registrado'),
           ch.maxVei==null?'':('VEI '+ch.maxVei+(ch.biggest&&ch.biggest[1]!=null?' · '+yearTxt(ch.biggest[1]):'')))
      +row(L('Eruptions at VEI 4 or above','VEI 4 以上の噴火','Ausbrüche ab VEI 4','Извержения VEI 4 и выше','Erupciones de VEI 4 o más'),
           ch.veis?(n0(ch.explosive)+' / '+n0(ch.veis)):'')
      +row(L('Median interval since 1500','1500年以降の噴火間隔（中央値）','Medianes Intervall seit 1500','Медианный интервал с 1500 г.','Intervalo mediano desde 1500'),
           ch.repose==null?'':(n0(ch.repose)+L(' years',' 年',' Jahre',' лет',' años')+' · '+n0(ch.obsCount)+L(' eruptions',' 回',' Ausbrüche',' извержений',' erupciones')));

    /* the VEI histogram — this volcano's own eruptions, drawn as bars with the counts on them */
    const max=Math.max(...ch.hist);
    if(max>0){
      h+=sec(L('Explosivity of this volcano’s own eruptions (VEI)','この火山自身の噴火の爆発規模（VEI）','Explosivität der eigenen Ausbrüche (VEI)','Взрывная сила собственных извержений (VEI)','Explosividad de sus propias erupciones (VEI)'));
      h+='<div class="volc-vei">';
      for(let v=0;v<=7;v++){
        const c=ch.hist[v], pct=max?Math.round(c/max*100):0;
        h+='<div class="volc-vei-row"><span class="volc-vei-k">VEI '+v+'</span>'
          +'<span class="volc-vei-bar"><i style="width:'+pct+'%"></i></span>'
          +'<span class="volc-vei-n">'+S(c?n0(c):'')+'</span></div>';
      }
      h+='</div>';
      h+=note(L('VEI is the Volcanic Explosivity Index — the erupted volume and plume height of one eruption on a 0–8 scale, as recorded by the Global Volcanism Program. It is the only structured measure of eruptive size the catalog carries; an eruption STYLE (Strombolian, Vulcanian, Plinian…) is not a field in that database and is therefore not shown here as if it were.',
        'VEI は火山爆発指数 — 1回の噴火の噴出量と噴煙高度を 0〜8 で表した、GVP が記録している値です。カタログが持つ噴火規模の構造化データはこれだけであり、「噴火様式」（ストロンボリ式・ブルカノ式・プリニー式など）はデータベースの項目に存在しないため、あるかのようには表示しません。',
        'VEI ist der Vulkanexplosivitätsindex — Fördervolumen und Säulenhöhe eines Ausbruchs auf einer Skala 0–8, wie vom GVP erfasst. Ein Ausbruchs-STIL (strombolianisch, vulkanianisch, plinianisch …) ist kein Feld dieser Datenbank und wird hier deshalb nicht so dargestellt.',
        'VEI — индекс вулканической эксплозивности: объём выброса и высота колонны одного извержения по шкале 0–8, как зафиксировано GVP. Стиль извержения (стромболианский, вулканский, плинианский…) в этой базе не поле, и здесь он не показывается как таковой.',
        'El VEI es el Índice de Explosividad Volcánica — volumen emitido y altura de la columna de una erupción en una escala 0–8, según lo registra el GVP. El ESTILO eruptivo (estromboliano, vulcaniano, pliniano…) no es un campo de esa base de datos y por eso no se muestra como si lo fuera.'));
    }

    h+=sec(L('Every recorded eruption, most recent first','記録されている全噴火（新しい順）','Alle erfassten Ausbrüche, neueste zuerst','Все зафиксированные извержения, сначала новые','Todas las erupciones registradas, la más reciente primero'));
    h+='<div class="volc-er">';
    const vocab=(detailDoc&&detailDoc.vocab)||{};
    for(const r of d.er){
      const vei=r[7]==null?'':('VEI '+r[7]+(r[8]||''));
      const start=dateTxt(r[1],r[2],r[3]), end=dateTxt(r[4],r[5],r[6]);
      const ev=(r[10]!=null&&vocab.evidence)?term('evidence',vocab.evidence[r[10]]):'';
      h+='<div class="volc-er-row'+(r[9]===1?'':' unc')+'">'
        +'<span class="volc-er-d">'+S(start+(end&&end!==start?' → '+end:(r[1]!=null&&r[4]==null?' → '+L('continuing','継続中','andauernd','продолжается','en curso'):'')))+'</span>'
        +'<span class="volc-er-v'+(r[7]>=4?' big':'')+'">'+S(vei)+'</span>'
        +'<span class="volc-er-e">'+S(ev)+'</span></div>';
    }
    h+='</div>';
    if(d.er.some(r=>r[9]!==1)) h+=note(L('Rows in grey are recorded by GVP as uncertain eruptions.','灰色の行は、GVP が「不確実な噴火」として記録しているものです。','Graue Zeilen sind vom GVP als unsichere Ausbrüche geführt.','Серые строки GVP относит к неподтверждённым извержениям.','Las filas en gris están registradas por el GVP como erupciones inciertas.'));
    return h;
  }

  function aboutHTML(f,d){
    const p=f.properties, fc=layerFC(), voc=(detailDoc&&detailDoc.vocab)||{};
    const rocks=(fc&&fc.rocks)||voc.rocks||[], sets=(fc&&fc.settings)||voc.settings||[];
    let h=sec(L('Form and setting','形と場','Form und Lage','Форма и обстановка','Forma y contexto'))
      +row(L('Primary volcano type','火山の型','Vulkantyp','Тип вулкана','Tipo de volcán'),term('type',p.t))
      +row(L('Landform','地形区分','Geländeform','Форма рельефа','Forma del terreno'),(d&&d.lf!=null&&voc.landform)?term('landform',voc.landform[d.lf]):'')
      +row(L('Summit elevation','標高','Gipfelhöhe','Высота','Altitud de la cumbre'),p.e==null?'':(n0(p.e)+' m'))
      +row(L('Tectonic setting','構造区分','Tektonische Lage','Тектоническая обстановка','Contexto tectónico'),p.s!=null?term('setting',sets[p.s]):'')
      +row(L('Dominant magma composition','主要なマグマ組成','Vorherrschende Magmazusammensetzung','Преобладающий состав магмы','Composición dominante del magma'),p.k!=null?term('rock',rocks[p.k]):'')
      +row(L('Region','地域','Region','Регион','Región'),term('region',p.r))
      +row(L('Subregion','小地域','Teilregion','Субрегион','Subregión'),d?term('subregion',d.sub):'')
      +row(L('Country','国','Land','Страна','País'),countryName(p.c))
      +row(L('GVP volcano number','GVP 火山番号','GVP-Vulkannummer','Номер вулкана GVP','Número de volcán GVP'),String(p.v))
      +row(L('Geologic epoch','地質時代','Geologische Epoche','Геологическая эпоха','Época geológica'),(d&&d.ep!=null&&voc.epoch)?term('epoch',voc.epoch[d.ep]):'')
      +row(L('Basis for inclusion','収録の根拠','Grundlage der Aufnahme','Основание включения','Base de la inclusión'),(d&&d.ev!=null&&voc.evidenceCat)?term('evidenceCat',voc.evidenceCat[d.ev]):'');
    if(p.k!=null&&rocks[p.k]){
      h+=note(L('Magma composition is GVP’s dominant rock type for this volcano — the silica content behind it is what makes an eruption runny or sticky, and therefore effusive or explosive. It is a property of the volcano, not a forecast of the next eruption.',
        'マグマ組成は、GVP がこの火山の主要岩石として記録している値です。その背後にある SiO₂ 量が溶岩の粘性を決め、溶岩流型か爆発型かに効きます。火山の性質であって、次の噴火の予測ではありません。',
        'Die Magmazusammensetzung ist der vom GVP geführte vorherrschende Gesteinstyp — der dahinterstehende Kieselsäuregehalt entscheidet über zähflüssig oder dünnflüssig und damit über effusiv oder explosiv. Eine Eigenschaft des Vulkans, keine Vorhersage.',
        'Состав магмы — преобладающий тип породы по GVP; стоящее за ним содержание кремнезёма определяет вязкость и, значит, эффузивность или взрывной характер. Это свойство вулкана, а не прогноз.',
        'La composición del magma es el tipo de roca dominante según el GVP — el contenido de sílice detrás determina si la lava es fluida o viscosa, y por tanto efusiva o explosiva. Es una propiedad del volcán, no un pronóstico.'));
    }
    if(d&&d.ph){
      h+=sec(L('Photograph','写真','Fotografie','Фотография','Fotografía'))
        +'<img class="volc-photo" loading="lazy" alt="'+S(p.n)+'" src="'+S('https://volcano.si.edu/gallery/photos/'+d.ph[0]+'.jpg')+'">'
        +(d.ph[1]?'<div class="volc-cap">'+S(d.ph[1])+'</div>':'')
        +(d.ph[2]?'<div class="volc-cred">'+S(d.ph[2])+'</div>':'');
    }
    if(d&&d.g){
      h+=sec(L('Geological summary','地質の概要','Geologische Übersicht','Геологический обзор','Resumen geológico'))
        +prose(d.g,'en');
    }
    h+='<div class="acp-src">'+S('Smithsonian Institution · Global Volcanism Program — Volcanoes of the World')+'</div>';
    h+='<a class="volc-link" target="_blank" rel="noopener" href="'+S('https://volcano.si.edu/volcano.cfm?vn='+p.v)+'">'
      +S(L('Open the GVP record','GVP の原典を開く','GVP-Eintrag öffnen','Открыть запись GVP','Abrir la ficha del GVP'))+'</a>';
    return h;
  }

  function impactHTML(f,d){
    const p=f.properties;
    let h=sec(L('People living around it','周辺人口','Menschen im Umkreis','Население вокруг','Población alrededor'));
    if(d&&d.p&&d.p.some(x=>x!=null)){
      h+=row(L('Within 5 km','半径 5 km 以内','Im Umkreis von 5 km','В радиусе 5 км','A menos de 5 km'),n0(d.p[0]))
       +row(L('Within 10 km','半径 10 km 以内','Im Umkreis von 10 km','В радиусе 10 км','A menos de 10 km'),n0(d.p[1]))
       +row(L('Within 30 km','半径 30 km 以内','Im Umkreis von 30 km','В радиусе 30 км','A menos de 30 km'),n0(d.p[2]))
       +row(L('Within 100 km','半径 100 km 以内','Im Umkreis von 100 km','В радиусе 100 км','A menos de 100 km'),n0(d.p[3]))
       +note(L('Population counts are the Global Volcanism Program’s own figures for this volcano.','人口は、GVP がこの火山について公表している値です。','Die Bevölkerungszahlen sind die Angaben des Global Volcanism Program für diesen Vulkan.','Данные о населении — собственные оценки GVP для этого вулкана.','Las cifras de población son las del propio Global Volcanism Program para este volcán.'));
    } else h+=hint(L('The Global Volcanism Program publishes no population figures for this volcano.','GVP はこの火山について人口の値を公表していません。','Das GVP veröffentlicht für diesen Vulkan keine Bevölkerungszahlen.','GVP не публикует данных о населении для этого вулкана.','El GVP no publica cifras de población para este volcán.'));

    /* hazard zones — real GIS or an explicit absence, never a modelled circle */
    h+=sec(L('Mapped hazard zones','公表されたハザード域','Kartierte Gefahrenzonen','Картированные зоны опасности','Zonas de peligro cartografiadas'));
    const hz=window.IntMapVolcanoLayers&&window.IntMapVolcanoLayers.hazardFor?window.IntMapVolcanoLayers.hazardFor(p.v):null;
    if(hz&&hz.length){
      h+=row(L('Zones published','公表されている区域','Veröffentlichte Zonen','Опубликованные зоны','Zonas publicadas'),hz.map(hazName).join(' · '))
       +'<button type="button" class="acp-mini" data-volcp="hazard">'+S(L('Draw them on the map','地図に表示','Auf der Karte zeichnen','Показать на карте','Dibujarlas en el mapa'))+'</button>';
    } else {
      h+=hint(L('No machine-readable hazard-zone GIS is published for this volcano. Pyroclastic-flow, ashfall and lahar zones exist on paper for many volcanoes and as data for very few; this map draws only the ones that exist as data, and says so for the rest rather than drawing a modelled circle.',
        'この火山については、機械可読なハザード域の GIS データが公表されていません。火砕流・降灰・ラハールの想定区域は多くの火山で紙のハザードマップとしては存在しますが、データとして公開されているものはごく僅かです。この地図はデータとして存在するものだけを描き、それ以外については「無い」と述べます（推定の円は描きません）。',
        'Für diesen Vulkan ist kein maschinenlesbares Gefahrenzonen-GIS veröffentlicht. Pyroklastik-, Aschefall- und Lahar-Zonen existieren für viele Vulkane auf Papier und für sehr wenige als Daten; diese Karte zeichnet nur letztere und sagt es sonst, statt einen modellierten Kreis zu malen.',
        'Для этого вулкана нет машиночитаемой ГИС зон опасности. Зоны пирокластических потоков, пеплопада и лахаров существуют на бумаге для многих вулканов и в виде данных — для единиц; карта рисует только вторые, а в остальных случаях говорит об отсутствии, а не рисует модельный круг.',
        'No se publica un SIG de zonas de peligro legible por máquina para este volcán. Las zonas de flujos piroclásticos, caída de ceniza y lahares existen en papel para muchos volcanes y como datos para muy pocos; este mapa dibuja solo estas últimas y, para el resto, lo dice en vez de dibujar un círculo modelado.'));
    }

    /* airports */
    h+=sec(L('Aerodromes nearby','周辺の空港','Flugplätze in der Nähe','Аэродромы поблизости','Aeródromos cercanos'));
    const A=(extra.forVn===p.v)?extra.apts:null;
    if(!A) h+='<button type="button" class="acp-mini" data-volcp="apts">'+S(L('Find aerodromes within 150 km','150 km 以内の空港を検索','Flugplätze im Umkreis von 150 km suchen','Найти аэродромы в радиусе 150 км','Buscar aeródromos en 150 km'))+'</button>';
    else if(A==='busy') h+=hint(L('Searching OpenStreetMap…','OpenStreetMap を検索中…','OpenStreetMap wird durchsucht…','Поиск в OpenStreetMap…','Buscando en OpenStreetMap…'));
    else if(!A.ok) h+=hint(L('OpenStreetMap did not answer.','OpenStreetMap が応答しませんでした。','OpenStreetMap hat nicht geantwortet.','OpenStreetMap не ответил.','OpenStreetMap no respondió.'));
    else if(!A.rows.length) h+=hint(L('No aerodrome is mapped within 150 km.','150 km 以内に空港はありません。','Im Umkreis von 150 km ist kein Flugplatz erfasst.','В радиусе 150 км аэродромов не найдено.','No hay aeródromos en 150 km.'));
    else for(const a of A.rows) h+=row(a.name+(a.icao?' ('+a.icao+')':''),Math.round(a.km)+' km');

    /* seismicity */
    h+=sec(L('Earthquakes nearby','周辺の地震','Erdbeben in der Nähe','Землетрясения поблизости','Sismos cercanos'));
    const Q=(extra.forVn===p.v)?extra.quakes:null;
    if(!Q) h+='<button type="button" class="acp-mini" data-volcp="quakes">'+S(L('Look for earthquakes within 50 km, last 30 days','50 km 以内・直近30日の地震を検索','Erdbeben im Umkreis von 50 km, letzte 30 Tage','Землетрясения в 50 км за 30 дней','Sismos en 50 km, últimos 30 días'))+'</button>';
    else if(Q==='busy') h+=hint(L('Asking the USGS earthquake catalog…','USGS 地震カタログに問い合わせ中…','USGS-Erdbebenkatalog wird abgefragt…','Запрос к каталогу землетрясений USGS…','Consultando el catálogo sísmico del USGS…'));
    else if(!Q.ok) h+=hint(L('The USGS earthquake catalog did not answer.','USGS 地震カタログが応答しませんでした。','Der USGS-Erdbebenkatalog hat nicht geantwortet.','Каталог землетрясений USGS не ответил.','El catálogo sísmico del USGS no respondió.'));
    else if(!Q.rows.length) h+=hint(L('The USGS catalog holds no earthquake within 50 km in the last 30 days. Volcanic seismicity is often too small or too shallow for the global catalog — a local network may still be recording it.',
      'USGS のカタログには、直近30日・50 km 以内の地震はありません。火山性地震は規模が小さく浅いことが多く、全球カタログに載らないことがあります（現地の観測網では観測されている場合があります）。',
      'Der USGS-Katalog enthält in den letzten 30 Tagen kein Beben im Umkreis von 50 km. Vulkanische Seismizität ist oft zu klein für den globalen Katalog.',
      'В каталоге USGS за 30 дней нет землетрясений в радиусе 50 км. Вулканическая сейсмичность часто слишком слаба для глобального каталога.',
      'El catálogo del USGS no tiene sismos en 50 km en los últimos 30 días. La sismicidad volcánica suele ser demasiado pequeña para el catálogo global.'));
    else {
      const mags=Q.rows.map(q=>q.m).filter(m=>m!=null);
      h+=row(L('Events','件数','Ereignisse','События','Eventos'),n0(Q.rows.length))
       +row(L('Largest','最大規模','Größtes','Максимум','Mayor'),mags.length?('M '+Math.max(...mags).toFixed(1)):'');
      for(const q of Q.rows.slice(0,10)){
        h+=row('M '+(q.m==null?'?':q.m.toFixed(1))+' · '+Math.round(q.km)+' km',
          (q.depth==null?'':Math.round(q.depth)+' km · ')+new Date(q.at).toLocaleString(loc(),{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}));
      }
      h+='<div class="acp-src">'+S('USGS Earthquake Hazards Program')+'</div>';
    }
    return h;
  }

  function bodyHTML(){
    const f=base(curVn);
    if(!f) return hint(L('This volcano is not in the loaded catalog.','この火山は読み込まれたカタログにありません。','Dieser Vulkan ist nicht im geladenen Katalog.','Этого вулкана нет в загруженном каталоге.','Este volcán no está en el catálogo cargado.'));
    const d=detailDoc&&detailDoc.volcanoes?detailDoc.volcanoes[String(curVn)]:null;
    if(tab==='history') return historyHTML(f,d);
    if(tab==='about') return aboutHTML(f,d);
    if(tab==='impact') return impactHTML(f,d);
    return nowHTML(f,d);
  }

  function render(){
    if(curVn==null) return; const e=ensureEl();
    const f=base(curVn), p=f?f.properties:null;
    const h=e.querySelector('#volcp-title');
    if(h) h.innerHTML=S((p&&p.n)||('#'+curVn))+(p&&p.c?'<span class="volc-sub">'+S(countryName(p.c))+'</span>':'');
    const tb=e.querySelector('#volcp-tabs'); if(tb) tb.innerHTML=tabsHTML();
    const b=e.querySelector('#volcp-body'); if(!b) return;
    b.innerHTML=bodyHTML();
  }

  function loadQuakes(){
    if(curVn==null) return; extra.forVn=curVn; extra.quakes='busy'; render();
    quakesNear(curVn,50,30).then(r=>{ if(extra.forVn===curVn){ extra.quakes=r; render(); } });
  }
  function loadAirports(){
    if(curVn==null) return; extra.forVn=curVn; extra.apts='busy'; render();
    airportsNear(curVn,150).then(r=>{ if(extra.forVn===curVn){ extra.apts=r; render(); } });
  }
  function openThermal(){
    const f=base(curVn); if(!f) return;
    try{ GE().camera.easeTo({ center:f.geometry.coordinates, zoom:Math.max(GE().camera.zoom(),7), duration:900 }); }catch(_){}
    try{ const cb=document.getElementById('dl-thermal'); if(cb&&!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change')); } }catch(_){}
  }
  function gotoVolcano(){
    const f=base(curVn); if(!f) return false;
    try{ GE().camera.easeTo({ center:f.geometry.coordinates, zoom:Math.max(GE().camera.zoom(),9), duration:900 }); return true; }catch(_){ return false; }
  }

  function place(){
    const e=ensureEl(); const mc=document.getElementById('map-container'); if(!mc) return;
    if(e.dataset.placed==='1') return; e.dataset.placed='1';
    const r=mc.getBoundingClientRect();
    e.style.left=Math.max(12,r.width-e.offsetWidth-24)+'px'; e.style.top='84px';
  }

  function open(vn){
    if(vn==null) return false;
    vn=+vn; if(!isFinite(vn)) return false;
    if(curVn!==vn){ extra={ quakes:null, apts:null, forVn:vn }; tab='now'; }
    curVn=vn;
    const e=ensureEl(); e.style.display='block';
    render(); place();
    try{ HOST.bringToFront(e); }catch(_){}
    /* the two things the card needs and does not have yet, started together */
    detail().then(()=>{ if(curVn===vn) render(); });
    warm().then(()=>{ if(curVn===vn) render(); });
    return true;
  }
  function close(){ curVn=null; if(el) el.style.display='none'; }
  function isOpen(){ return !!(el&&el.style.display!=='none'&&curVn!=null); }

  /* the merged record, for Atlas and for anything else that wants the numbers without the card */
  async function record(vn){
    vn=+vn; await detail();
    const f=base(vn); if(!f) return null;
    const d=detailDoc&&detailDoc.volcanoes?detailDoc.volcanoes[String(vn)]:null;
    const fc=layerFC();
    return { v:vn, name:f.properties.n, country:f.properties.c, type:f.properties.t,
      elevation:f.properties.e, lastEruption:f.properties.y, region:f.properties.r,
      rock:f.properties.k!=null&&fc?fc.rocks[f.properties.k]:null,
      setting:f.properties.s!=null&&fc?fc.settings[f.properties.s]:null,
      maxVei:f.properties.x, eruptions:f.properties.q, pop30:f.properties.p,
      lngLat:f.geometry.coordinates,
      population:d?d.p:null, summary:d?d.g:null, subregion:d?d.sub:null,
      character:d?character(d.er):null, history:d?d.er:null, status:status(vn),
      /* ⚠ (#R395) THE ENGLISH FIELDS STAY — they are the catalog's own values and anything joining on
         them must keep working. The reader-facing wording rides beside them so an answer written for
         a Japanese reader does not have to invent 「成層火山」 from «Stratovolcano» and risk a term
         this map does not use. */
      typeL:term('type',f.properties.t), regionL:term('region',f.properties.r),
      subregionL:d?term('subregion',d.sub):null, countryL:countryName(f.properties.c),
      rockL:f.properties.k!=null&&fc?term('rock',fc.rocks[f.properties.k]):null,
      settingL:f.properties.s!=null&&fc?term('setting',fc.settings[f.properties.s]):null };
  }
  function byName(q){
    const fc=layerFC(); if(!fc||!q) return [];
    const s=String(q).toLowerCase();
    return fc.features.filter(f=>String(f.properties.n||'').toLowerCase().indexOf(s)>=0)
      .slice(0,20).map(f=>({ v:f.properties.v, name:f.properties.n, country:f.properties.c }));
  }
  /* the health of each rung, so a legend can print three states rather than two */
  function feeds(){ const o={}; for(const k of Object.keys(FEEDS)) o[k]={ state:FEEDS[k].state, at:FEEDS[k].at, rows:FEEDS[k].rows?FEEDS[k].rows.length:0 }; return o; }

  /* ⚠ (#R395) THE CARD FOLLOWS THE LANGUAGE SWITCH. Every string in it — labels and, since this
     round, values — is resolved at render time, so the only thing missing was a reason to render
     again. Without this, switching language with a card open left a full panel in the old one. */
  try{ window.IntMapLangSwitch.bind(()=>HOST.lang,()=>{ if(isOpen()) render(); }); }catch(_){}

  const API={ open, close, isOpen, current:()=>curVn, record, status, statusIndex, byName,
    warm, feeds, onChange, quakesNear, airportsNear, detail, character,
    term, countryName, usgsMonitors,
    _jmaMap:JMA_TO_GVP, _jmaKey:jmaKey, _jmaLevel:jmaNum, _rank:RANK, _vocab:VOCAB, _ctry:CTRY_ISO };
  window.IntMapVolcano=API;
  return API;
};
