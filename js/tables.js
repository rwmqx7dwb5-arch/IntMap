/* ============================================================================
 *  IntMap · Reference data tables  (#R167)
 * ----------------------------------------------------------------------------
 *  Pure lookup tables lifted verbatim out of index.html (Architecture.md §3.1 step 4): country
 *  statistics, the gazetteer add-ons for DE/RU/ES, the publisher dictionary, the geo-theory layer
 *  catalogue, satellite providers, news editions and the small UI tables.
 *  None of them is ever mutated at runtime — index.html rebinds each name and reads it as before.
 *  window.SEA_LABELS keeps its own global because its consumers already read it off window.
 * ==========================================================================*/

/* (#R62) FIXED sea/ocean/gulf label gazetteer — one stable point per water body (fixes the per-tile label drift),
   5 languages, clickable like place labels. [lng, lat, minzoom, en, jp, de, ru, es] */
/* @i18n-entity-data  sea and ocean NAMES, one row per water body, pinned by [lng,lat]  (#R249 — declared, and validated by scripts/i18n-pair-audit.mjs
   against the row carrying a coordinate / ISO code / ticker / domain) */
window.SEA_LABELS=[
  [-160,32,0.5,'North Pacific Ocean','北太平洋','Nordpazifik','Северная часть Тихого океана','Océano Pacífico Norte'],
  [-125,-30,0.5,'South Pacific Ocean','南太平洋','Südpazifik','Южная часть Тихого океана','Océano Pacífico Sur'],
  [-40,36,0.5,'North Atlantic Ocean','北大西洋','Nordatlantik','Северная Атлантика','Océano Atlántico Norte'],
  [-16,-30,0.5,'South Atlantic Ocean','南大西洋','Südatlantik','Южная Атлантика','Océano Atlántico Sur'],
  [80,-22,0.5,'Indian Ocean','インド洋','Indischer Ozean','Индийский океан','Océano Índico'],
  [-10,82,0.8,'Arctic Ocean','北極海','Arktischer Ozean','Северный Ледовитый океан','Océano Ártico'],
  [15,-62,0.8,'Southern Ocean','南極海','Südlicher Ozean','Южный океан','Océano Antártico'],
  [17,34.8,2.5,'Mediterranean Sea','地中海','Mittelmeer','Средиземное море','Mar Mediterráneo'],
  [-75,15,2.5,'Caribbean Sea','カリブ海','Karibisches Meer','Карибское море','Mar Caribe'],
  [114,13,2.5,'South China Sea','南シナ海','Südchinesisches Meer','Южно-Китайское море','Mar de China Meridional'],
  [125,29,3,'East China Sea','東シナ海','Ostchinesisches Meer','Восточно-Китайское море','Mar de China Oriental'],
  [123,35.5,3.5,'Yellow Sea','黄海','Gelbes Meer','Жёлтое море','Mar Amarillo'],
  [119.5,38.8,4.5,'Bohai Sea','渤海','Bohai-Meer','Бохайский залив','Mar de Bohai'],
  [134.5,40,3,'Sea of Japan','日本海','Japanisches Meer','Японское море','Mar de Japón'],
  [150,53,3,'Sea of Okhotsk','オホーツク海','Ochotskisches Meer','Охотское море','Mar de Ojotsk'],
  [179,58,3,'Bering Sea','ベーリング海','Beringmeer','Берингово море','Mar de Bering'],
  [19.5,58,3.5,'Baltic Sea','バルト海','Ostsee','Балтийское море','Mar Báltico'],
  [3.5,56.5,3.5,'North Sea','北海','Nordsee','Северное море','Mar del Norte'],
  [2,68,3,'Norwegian Sea','ノルウェー海','Europäisches Nordmeer','Норвежское море','Mar de Noruega'],
  [40,73.5,3,'Barents Sea','バレンツ海','Barentssee','Баренцево море','Mar de Barents'],
  [72,76,3.5,'Kara Sea','カラ海','Karasee','Карское море','Mar de Kara'],
  [126,76.5,3.5,'Laptev Sea','ラプテフ海','Laptewsee','Море Лаптевых','Mar de Láptev'],
  [160,74,3.5,'East Siberian Sea','東シベリア海','Ostsibirische See','Восточно-Сибирское море','Mar de Siberia Oriental'],
  [-170,70.5,3.5,'Chukchi Sea','チュクチ海','Tschuktschensee','Чукотское море','Mar de Chukotka'],
  [-137,72,3.5,'Beaufort Sea','ボーフォート海','Beaufortsee','Море Бофорта','Mar de Beaufort'],
  [-8,75,3,'Greenland Sea','グリーンランド海','Grönlandsee','Гренландское море','Mar de Groenlandia'],
  [-55,58,3,'Labrador Sea','ラブラドル海','Labradorsee','Море Лабрадор','Mar de Labrador'],
  [-72,73,3.5,'Baffin Bay','バフィン湾','Baffin Bay','Море Баффина','Bahía de Baffin'],
  [-84,59.5,3,'Hudson Bay','ハドソン湾','Hudson Bay','Гудзонов залив','Bahía de Hudson'],
  [-90,25,3,'Gulf of Mexico','メキシコ湾','Golf von Mexiko','Мексиканский залив','Golfo de México'],
  [-146,57.5,3,'Gulf of Alaska','アラスカ湾','Golf von Alaska','Залив Аляска','Golfo de Alaska'],
  [-110.5,27.5,4,'Gulf of California','カリフォルニア湾','Golf von Kalifornien','Калифорнийский залив','Golfo de California'],
  [-61.5,48.3,4.5,'Gulf of St. Lawrence','セントローレンス湾','Sankt-Lorenz-Golf','Залив Святого Лаврентия','Golfo de San Lorenzo'],
  [-63,28,3.5,'Sargasso Sea','サルガッソ海','Sargassosee','Саргассово море','Mar de los Sargazos'],
  [38.5,20.5,3.5,'Red Sea','紅海','Rotes Meer','Красное море','Mar Rojo'],
  [63,15,3,'Arabian Sea','アラビア海','Arabisches Meer','Аравийское море','Mar Arábigo'],
  [51.5,26.7,4,'Persian Gulf','ペルシア湾','Persischer Golf','Персидский залив','Golfo Pérsico'],
  [58.5,24.5,4.5,'Gulf of Oman','オマーン湾','Golf von Oman','Оманский залив','Golfo de Omán'],
  [47.5,12.5,4.5,'Gulf of Aden','アデン湾','Golf von Aden','Аденский залив','Golfo de Adén'],
  [88,15,3,'Bay of Bengal','ベンガル湾','Golf von Bengalen','Бенгальский залив','Bahía de Bengala'],
  [74,8,4.5,'Laccadive Sea','ラッカディブ海','Lakkadivensee','Лаккадивское море','Mar de Laquedivas'],
  [96.5,10.5,4,'Andaman Sea','アンダマン海','Andamanensee','Андаманское море','Mar de Andamán'],
  [101.5,9.5,4,'Gulf of Thailand','タイランド湾','Golf von Thailand','Сиамский залив','Golfo de Tailandia'],
  [107.5,20,4.5,'Gulf of Tonkin','トンキン湾','Golf von Tonkin','Тонкинский залив','Golfo de Tonkín'],
  [110.5,-5.2,4,'Java Sea','ジャワ海','Javasee','Яванское море','Mar de Java'],
  [127,-5.8,4,'Banda Sea','バンダ海','Bandasee','Море Банда','Mar de Banda'],
  [120.5,-7.9,4.5,'Flores Sea','フローレス海','Floressee','Море Флорес','Mar de Flores'],
  [122,3.8,4,'Celebes Sea','セレベス海','Celebessee','Море Сулавеси','Mar de Célebes'],
  [120,8.5,4.5,'Sulu Sea','スールー海','Sulusee','Море Сулу','Mar de Joló'],
  [125.5,0.5,4.5,'Molucca Sea','モルッカ海','Molukkensee','Молуккское море','Mar de las Molucas'],
  [132,17,2.5,'Philippine Sea','フィリピン海','Philippinensee','Филиппинское море','Mar de Filipinas'],
  [155,-15,3,'Coral Sea','珊瑚海','Korallenmeer','Коралловое море','Mar del Coral'],
  [160,-38,3,'Tasman Sea','タスマン海','Tasmansee','Тасманово море','Mar de Tasmania'],
  [127.5,-11,4,'Timor Sea','ティモール海','Timorsee','Тиморское море','Mar de Timor'],
  [135.5,-9.5,4,'Arafura Sea','アラフラ海','Arafurasee','Арафурское море','Mar de Arafura'],
  [139,-14.5,4.5,'Gulf of Carpentaria','カーペンタリア湾','Golf von Carpentaria','Залив Карпентария','Golfo de Carpentaria'],
  [131,-34.5,4,'Great Australian Bight','グレートオーストラリア湾','Große Australische Bucht','Большой Австралийский залив','Gran Bahía Australiana'],
  [146,-39.7,4.5,'Bass Strait','バス海峡','Bass-Straße','Бассов пролив','Estrecho de Bass'],
  [152.5,-8,4.5,'Solomon Sea','ソロモン海','Salomonensee','Соломоново море','Mar de Salomón'],
  [147,-3.8,4.5,'Bismarck Sea','ビスマルク海','Bismarcksee','Море Бисмарка','Mar de Bismarck'],
  [34,43.3,3.5,'Black Sea','黒海','Schwarzes Meer','Чёрное море','Mar Negro'],
  [36.5,46.1,5,'Sea of Azov','アゾフ海','Asowsches Meer','Азовское море','Mar de Azov'],
  [50.5,41.5,3.5,'Caspian Sea','カスピ海','Kaspisches Meer','Каспийское море','Mar Caspio'],
  [28.2,40.7,5.5,'Sea of Marmara','マルマラ海','Marmarameer','Мраморное море','Mar de Mármara'],
  [15.3,42.7,4.5,'Adriatic Sea','アドリア海','Adria','Адриатическое море','Mar Adriático'],
  [25.2,38.5,4.5,'Aegean Sea','エーゲ海','Ägäis','Эгейское море','Mar Egeo'],
  [12,40,4.5,'Tyrrhenian Sea','ティレニア海','Tyrrhenisches Meer','Тирренское море','Mar Tirreno'],
  [18.5,37.8,4.5,'Ionian Sea','イオニア海','Ionisches Meer','Ионическое море','Mar Jónico'],
  [8.9,43.4,5.5,'Ligurian Sea','リグリア海','Ligurisches Meer','Лигурийское море','Mar de Liguria'],
  [-3,36,5.5,'Alboran Sea','アルボラン海','Alboránmeer','Море Альборан','Mar de Alborán'],
  [-4.5,45.5,4,'Bay of Biscay','ビスケー湾','Golf von Biskaya','Бискайский залив','Golfo de Vizcaya'],
  [-2.6,49.9,5,'English Channel','イギリス海峡','Ärmelkanal','Ла-Манш','Canal de la Mancha'],
  [-4.8,53.7,5,'Irish Sea','アイリッシュ海','Irische See','Ирландское море','Mar de Irlanda'],
  [11.5,57,5,'Kattegat','カテガット海峡','Kattegat','Каттегат','Kattegat'],
  [19.5,62.5,4.5,'Gulf of Bothnia','ボスニア湾','Bottnischer Meerbusen','Ботнический залив','Golfo de Botnia'],
  [26,59.9,5,'Gulf of Finland','フィンランド湾','Finnischer Meerbusen','Финский залив','Golfo de Finlandia'],
  [37.5,65.5,4.5,'White Sea','白海','Weißes Meer','Белое море','Mar Blanco'],
  [2,2.5,3.5,'Gulf of Guinea','ギニア湾','Golf von Guinea','Гвинейский залив','Golfo de Guinea'],
  [41,-19,4,'Mozambique Channel','モザンビーク海峡','Straße von Mosambik','Мозамбикский пролив','Canal de Mozambique'],
  [-58,66,4,'Davis Strait','デービス海峡','Davisstraße','Пролив Дейвиса','Estrecho de Davis'],
  [-65,-58.5,4,'Drake Passage','ドレーク海峡','Drakestraße','Пролив Дрейка','Pasaje de Drake'],
  [-50,-57,4.5,'Scotia Sea','スコシア海','Scotiasee','Море Скоша','Mar del Scotia'],
  [-45,-73,3.5,'Weddell Sea','ウェッデル海','Weddellmeer','Море Уэдделла','Mar de Weddell'],
  [-175,-76,3.5,'Ross Sea','ロス海','Rossmeer','Море Росса','Mar de Ross'],
  /* (#R63) major LAKES — their OFM per-tile label points drifted with zoom too */
  [-87.5,47.6,4.5,'Lake Superior','スペリオル湖','Oberer See','Озеро Верхнее','Lago Superior'],
  [-87.1,44.0,5,'Lake Michigan','ミシガン湖','Michigansee','Озеро Мичиган','Lago Míchigan'],
  [-82.2,44.8,5,'Lake Huron','ヒューロン湖','Huronsee','Озеро Гурон','Lago Hurón'],
  [-81.2,42.2,5.5,'Lake Erie','エリー湖','Eriesee','Озеро Эри','Lago Erie'],
  [-77.8,43.6,5.5,'Lake Ontario','オンタリオ湖','Ontariosee','Озеро Онтарио','Lago Ontario'],
  [-114.1,60.8,5,'Great Slave Lake','グレートスレーブ湖','Großer Sklavensee','Большое Невольничье озеро','Gran Lago del Esclavo'],
  [-120.5,66.0,5,'Great Bear Lake','グレートベア湖','Großer Bärensee','Большое Медвежье озеро','Gran Lago del Oso'],
  [-98.0,50.5,5.5,'Lake Winnipeg','ウィニペグ湖','Winnipegsee','Озеро Виннипег','Lago Winnipeg'],
  [-111.9,41.1,6,'Great Salt Lake','グレートソルト湖','Großer Salzsee','Большое Солёное озеро','Gran Lago Salado'],
  [-69.4,-15.8,5.5,'Lake Titicaca','チチカカ湖','Titicacasee','Озеро Титикака','Lago Titicaca'],
  [-71.5,10.0,6,'Lake Maracaibo','マラカイボ湖','Maracaibo-See','Озеро Маракайбо','Lago de Maracaibo'],
  [108.0,52.7,4.5,'Lake Baikal','バイカル湖','Baikalsee','Озеро Байкал','Lago Baikal'],
  [76.5,45.7,5.5,'Lake Balkhash','バルハシ湖','Balchaschsee','Озеро Балхаш','Lago Baljash'],
  [59.5,45.0,5.5,'Aral Sea','アラル海','Aralsee','Аральское море','Mar de Aral'],
  [31.2,60.9,5.5,'Lake Ladoga','ラドガ湖','Ladogasee','Ладожское озеро','Lago Ládoga'],
  [35.5,61.7,6,'Lake Onega','オネガ湖','Onegasee','Онежское озеро','Lago Onega'],
  [33.0,-1.5,4.5,'Lake Victoria','ヴィクトリア湖','Victoriasee','Озеро Виктория','Lago Victoria'],
  [29.8,-6.3,5,'Lake Tanganyika','タンガニーカ湖','Tanganjikasee','Озеро Танганьика','Lago Tanganica'],
  [34.5,-12.0,5.5,'Lake Malawi','マラウイ湖','Malawisee','Озеро Малави','Lago Malaui'],
  [14.2,13.1,5.5,'Lake Chad','チャド湖','Tschadsee','Озеро Чад','Lago Chad'],
  [37.5,3.6,6,'Lake Turkana','トゥルカナ湖','Turkana-See','Озеро Туркана','Lago Turkana'],
  [32.4,31.0,6.5,'Lake Manzala','マンザラ湖','Manzala-See','Озеро Манзала','Lago Manzala'],
  [45.3,42.0,6.5,'Mingachevir Reservoir','ミンガチェヴィル湖','Mingəçevir-Stausee','Мингечевирское вдхр.','Embalse de Mingachevir'],
  [90.5,46.9,6,'Lake Ulungur','ウルングル湖','Ulungur-See','Озеро Улюнгур','Lago Ulungur'],
  [100.2,36.9,5.5,'Qinghai Lake','青海湖','Qinghai-See','Озеро Кукунор','Lago Qinghai'],
  [120.2,31.2,6.5,'Lake Tai','太湖','Tai-See','Озеро Тайху','Lago Tai'],
  [116.3,29.2,6.5,'Poyang Lake','鄱陽湖','Poyang-See','Озеро Поянху','Lago Poyang'],
  [139.4,36.0,7,'Lake Kasumigaura','霞ヶ浦','Kasumigaura-See','Озеро Касумигаура','Lago Kasumigaura'],
  [136.1,35.3,6.5,'Lake Biwa','琵琶湖','Biwa-See','Озеро Бива','Lago Biwa'],
  [17.9,-0.7,6,'Lake Mai-Ndombe','マイ・ンドンベ湖','Mai-Ndombe-See','Озеро Маи-Ндомбе','Lago Mai-Ndombe'],
  [13.3,46.4,7,'Lake Bled','ブレッド湖','Bleder See','Озеро Блед','Lago Bled'],
  [6.6,46.4,6.5,'Lake Geneva','レマン湖','Genfersee','Женевское озеро','Lago Lemán'],
  [9.4,47.6,7,'Lake Constance','ボーデン湖','Bodensee','Боденское озеро','Lago de Constanza'],
  [12.2,42.6,7.5,'Lake Bracciano','ブラッチャーノ湖','Braccianosee','Озеро Браччано','Lago de Bracciano'],
  [144.8,-38.1,7,'Port Phillip Bay','ポートフィリップ湾','Port Phillip Bay','Залив Порт-Филлип','Bahía de Port Phillip'],
  [174.9,-36.9,7,'Hauraki Gulf','ハウラキ湾','Hauraki Gulf','Залив Хаураки','Golfo de Hauraki']
];

window.IntMapTables=(function(){
  /* =============================================================================
   *  SATELLITE IMAGERY ENGINE
   *  (1) Multi-provider registry — free built-ins + Pro/BYOK; dynamic URL builder.
   *  (2) Double-buffered cross-fade raster swapping, with fallback + notifications.
   *  (3) Sat-Controller panel, capture-date overlay, settings API-key management.
   *  Every free endpoint below was verified to return real tiles (HTTP 200 image/*).
   *  ============================================================================= */
  /* ⚠ (#R246) EVERY TRANSLATION TUPLE IN THIS FILE IS A CALL. They were `{en:…,jp:…}` objects read
     by `x[HOST.lang]||x.en` at half a dozen call sites, which is the eleventh shape
     (scripts/i18n-langmap-audit.mjs): invisible to every instrument, and English for every language
     the object does not name — here that was de/ru/es/fr/ko/zh/zh-Hans, all of them. `LA(…)` is
     IntMapLang.pickArgs(): the SAME array, written as a call, resolved by `L.arr()` through pick()
     itself. ⚠ One radius group read `grp.g[HOST.lang]` with no `||` fallback at all, so the German,
     Russian, Spanish, French, Korean and Chinese optgroup labels rendered the string 「undefined」. */
  const LA=window.IntMapLang.pickArgs();
  const SAT_PROVIDERS=[
    { id:'esri', tier:'free', short:'Esri', name:LA('Esri World Imagery','Esri 衛星画像','Esri Satellitenbilder','Спутниковые снимки Esri','Imágenes satelitales de Esri'),
      dated:false, maxzoom:19, attribution:'Imagery © Esri, Maxar, Earthstar Geographics',
      /* Two host aliases serving the SAME World_Imagery tiles — MapLibre round-robins across them, so
         the browser's per-host connection cap no longer throttles high-res imagery in 3D (#2,#18). */
      tiles:()=>['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}','https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'] },
    { id:'gibs-modis', tier:'free', short:'MODIS Terra', name:LA('NASA GIBS · MODIS Terra','NASA GIBS · MODIS Terra','NASA GIBS · MODIS Terra','NASA GIBS · MODIS Terra','NASA GIBS · MODIS Terra'),
      dated:true, dateMode:'day', maxzoom:9, attribution:'NASA EOSDIS GIBS — MODIS Terra true color',
      tiles:(d)=>['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/'+d+'/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg'] },
    { id:'gibs-viirs', tier:'free', short:'VIIRS SNPP', name:LA('NASA GIBS · VIIRS (SNPP)','NASA GIBS · VIIRS (SNPP)','NASA GIBS · VIIRS (SNPP)','NASA GIBS · VIIRS (SNPP)','NASA GIBS · VIIRS (SNPP)'),
      dated:true, dateMode:'day', maxzoom:9, attribution:'NASA EOSDIS GIBS — VIIRS SNPP true color',
      tiles:(d)=>['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/'+d+'/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg'] },
    { id:'gibs-viirs-n20', tier:'free', short:'VIIRS N20', name:LA('NASA GIBS · VIIRS (NOAA-20)','NASA GIBS · VIIRS (NOAA-20)','NASA GIBS · VIIRS (NOAA-20)','NASA GIBS · VIIRS (NOAA-20)','NASA GIBS · VIIRS (NOAA-20)'),
      dated:true, dateMode:'day', maxzoom:9, attribution:'NASA EOSDIS GIBS — VIIRS NOAA-20 true color',
      tiles:(d)=>['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/'+d+'/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg'] },
    { id:'s2cloudless', tier:'free', short:'Sentinel-2', name:LA('Sentinel-2 cloudless (EOX)','Sentinel-2 雲なし (EOX)','Sentinel-2 wolkenfrei (EOX)','Sentinel-2 без облаков (EOX)','Sentinel-2 sin nubes (EOX)'),
      dated:true, dateMode:'year', years:[2024,2023,2022,2021,2020,2019,2018,2017], maxzoom:16,
      attribution:'Sentinel-2 cloudless — EOX IT Services GmbH (CC BY-NC-SA 4.0)',
      tiles:(y)=>['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-'+y+'_3857/default/g/{z}/{y}/{x}.jpg'] },
    /* --- Pro / BYOK: selectable only after the user registers an API key in Settings --- */
    { id:'sentinelhub', tier:'pro', keyName:'sentinelhub', short:'Sentinel Hub', name:LA('Sentinel Hub (S2 / Landsat)','Sentinel Hub (S2 / Landsat)','Sentinel Hub (S2 / Landsat)','Sentinel Hub (S2 / Landsat)','Sentinel Hub (S2 / Landsat)'),
      dated:true, dateMode:'day', maxzoom:16, attribution:'Sentinel Hub by Sinergise',
      keyLabel:LA('Sentinel Hub instance ID','Sentinel Hub インスタンスID','Sentinel-Hub-Instanz-ID','Идентификатор экземпляра Sentinel Hub','ID de instancia de Sentinel Hub'), keyPh:'xxxxxxxx-xxxx-xxxx-xxxx',
      tiles:(d,k)=>['https://services.sentinel-hub.com/ogc/wmts/'+encodeURIComponent(k)+'?service=WMTS&request=GetTile&version=1.0.0&tilematrixset=PopularWebMercator256&layer=TRUE-COLOR-S2L2A&tilematrix={z}&tilerow={y}&tilecol={x}&format=image/jpeg&time='+d] },
    { id:'mapbox', tier:'pro', keyName:'mapbox', short:'Mapbox', name:LA('Mapbox Satellite','Mapbox Satellite','Mapbox Satellite','Mapbox Satellite','Mapbox Satellite'),
      dated:false, maxzoom:22, attribution:'© Mapbox © Maxar',
      keyLabel:LA('Mapbox access token','Mapbox アクセストークン','Mapbox-Zugriffstoken','Токен доступа Mapbox','Token de acceso de Mapbox'), keyPh:'pk.eyJ1Ijoi…',
      tiles:(d,k)=>['https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token='+encodeURIComponent(k)] },
    { id:'custom', tier:'pro', keyName:'custom', short:'Custom', name:LA('Custom XYZ source','カスタム XYZ ソース','Eigene XYZ-Quelle','Свой источник XYZ','Fuente XYZ personalizada'),
      dated:false, maxzoom:22, attribution:'User-supplied XYZ tile source',
      keyLabel:LA('XYZ URL template — use {z}/{x}/{y}','XYZ URLテンプレート — {z}/{x}/{y} を使用','XYZ-URL-Vorlage — {z}/{x}/{y} verwenden','Шаблон URL XYZ — используйте {z}/{x}/{y}','Plantilla de URL XYZ — use {z}/{x}/{y}'), keyPh:'https://…/{z}/{x}/{y}.jpg?key=…',
      tiles:(d,k)=>[k] }
  ];
  /* (#R28) ORGANIZATIONS / INSTITUTIONS / militant & political GROUPS → a representative location.
     Flagged org:true and docked below an explicit place (like demonyms, see scoreGeo) so a headline that
     also names a real city/country pins THERE, while a headline naming only the org still gets placed.
     Row = [[match terms…], lng, lat, nameEn, nameJp]. Avoids acronyms that collide with common English
     words (no bare "WHO"/"US" here). */
  /* @i18n-entity-data  organisation names and their HQ coordinates  (#R249 — declared, and validated by scripts/i18n-pair-audit.mjs
     against the row carrying a coordinate / ISO code / ticker / domain) */
  const _ORG_GZ=[
    /* international institutions → HQ */
    [['United Nations','U.N.','国連','国際連合'],-73.97,40.75,'United Nations','国連'],
    [['NATO','北大西洋条約機構'],4.42,50.88,'NATO','NATO'],
    [['IMF','国際通貨基金'],-77.04,38.90,'IMF','IMF'],
    [['World Bank','世界銀行'],-77.04,38.90,'World Bank','世界銀行'],
    [['OPEC','石油輸出国機構'],16.37,48.21,'OPEC','OPEC'],
    [['European Commission','欧州委員会'],4.38,50.84,'European Commission','欧州委員会'],
    [['World Health Organization','世界保健機関'],6.14,46.23,'WHO','世界保健機関'],
    [['African Union'],38.74,9.03,'African Union','アフリカ連合'],
    [['ASEAN','東南アジア諸国連合'],106.83,-6.21,'ASEAN','ASEAN'],
    /* state security forces (metonyms for their country's seat) */
    [['IRGC','Revolutionary Guard','革命防衛隊'],51.39,35.69,'Iran (IRGC)','イラン（革命防衛隊）'],
    [['IDF','Israel Defense Forces'],34.78,32.08,'Israel (IDF)','イスラエル（IDF）'],
    /* militant / armed groups → their stronghold */
    [['Hamas','ハマス'],34.45,31.50,'Gaza (Hamas)','ガザ（ハマス）'],
    [['Hezbollah','Hizbollah','ヒズボラ'],35.50,33.85,'Lebanon (Hezbollah)','レバノン（ヒズボラ）'],
    [['Houthi','Houthis','フーシ'],44.21,15.35,'Yemen (Houthis)','イエメン（フーシ）'],
    [['Taliban','タリバン'],69.18,34.53,'Afghanistan (Taliban)','アフガニスタン（タリバン）'],
    [['Wagner','ワグネル'],37.62,55.75,'Russia (Wagner)','ロシア（ワグネル）'],
    [['Islamic State','ISIL','Daesh','イスラム国'],38.99,35.95,'Islamic State (Raqqa)','イスラム国'],
    [['Al-Qaeda','Al Qaeda','アルカイダ'],65.0,33.0,'Al-Qaeda','アルカイダ'],
    [['Boko Haram','ボコ・ハラム'],13.0,11.5,'Boko Haram (NE Nigeria)','ボコ・ハラム'],
    [['Al-Shabaab','Al Shabaab','アルシャバブ'],45.0,2.5,'Al-Shabaab (Somalia)','アルシャバブ'],
    [['Islamic Jihad','イスラム聖戦'],34.45,31.50,'Gaza (Islamic Jihad)','ガザ（イスラム聖戦）'],
    [['Polisario'],-13.0,24.5,'Western Sahara (Polisario)','西サハラ'],
    [['Wagner Group'],37.62,55.75,'Russia (Wagner)','ロシア（ワグネル）']
  ];
  /* (#R27) DEMONYM gazetteer — a very large share of geopolitical headlines reference a country by its
     ADJECTIVE/people ("Ukrainian drone", "Israeli strike", "Iranian-backed", "Chinese vessels") rather
     than the country NAME, which the old locator missed entirely. These map the demonym → the country's
     representative point. They are flagged demonym:true and scored a notch BELOW an explicit place name
     (see scoreGeo) so precision is preserved — an explicit city/country in the headline always wins, and
     a demonym only places a story that would otherwise be "location unknown". Big coverage + accuracy gain. */
  /* @i18n-entity-data  demonyms and the country they resolve to, by coordinate  (#R249 — declared, and validated by scripts/i18n-pair-audit.mjs
     against the row carrying a coordinate / ISO code / ticker / domain) */
  const _DEMONYM_GZ=[
    ['Ukrainian',30.52,50.45,'Ukraine','ウクライナ'],['Russian',37.62,55.75,'Russia','ロシア'],
    ['Israeli',35.21,31.77,'Israel','イスラエル'],['Palestinian',34.47,31.50,'Palestinian territories','パレスチナ'],
    ['Iranian',51.39,35.69,'Iran','イラン'],['Chinese',116.40,39.90,'China','中国'],
    ['American',-77.04,38.91,'United States','アメリカ'],['British',-0.13,51.51,'United Kingdom','イギリス'],
    ['French',2.35,48.85,'France','フランス'],['German',13.40,52.52,'Germany','ドイツ'],
    ['Japanese',139.69,35.69,'Japan','日本'],['South Korean',126.98,37.57,'South Korea','韓国'],
    ['North Korean',125.76,39.04,'North Korea','北朝鮮'],['Indian',77.21,28.61,'India','インド'],
    ['Pakistani',73.06,33.69,'Pakistan','パキスタン'],['Taiwanese',121.56,25.03,'Taiwan','台湾'],
    ['Syrian',36.30,33.51,'Syria','シリア'],['Lebanese',35.50,33.89,'Lebanon','レバノン'],
    ['Turkish',32.86,39.93,'Turkey','トルコ'],['Saudi',46.72,24.69,'Saudi Arabia','サウジアラビア'],
    ['Egyptian',31.24,30.04,'Egypt','エジプト'],['Yemeni',44.21,15.35,'Yemen','イエメン'],
    ['Afghan',69.18,34.53,'Afghanistan','アフガニスタン'],['Sudanese',32.53,15.50,'Sudan','スーダン'],
    ['Venezuelan',-66.90,10.49,'Venezuela','ベネズエラ'],['Mexican',-99.13,19.43,'Mexico','メキシコ'],
    ['Brazilian',-47.88,-15.79,'Brazil','ブラジル'],['Italian',12.50,41.90,'Italy','イタリア'],
    ['Spanish',-3.70,40.42,'Spain','スペイン'],['Polish',21.01,52.23,'Poland','ポーランド'],
    ['Greek',23.73,37.98,'Greece','ギリシャ'],['Dutch',4.90,52.37,'Netherlands','オランダ'],
    ['Australian',149.13,-35.28,'Australia','オーストラリア'],['Canadian',-75.70,45.42,'Canada','カナダ'],
    ['Nigerian',7.49,9.06,'Nigeria','ナイジェリア'],['Ethiopian',38.74,9.03,'Ethiopia','エチオピア'],
    ['Kenyan',36.82,-1.29,'Kenya','ケニア'],['South African',28.19,-25.75,'South Africa','南アフリカ'],
    ['Thai',100.50,13.75,'Thailand','タイ'],['Vietnamese',105.83,21.03,'Vietnam','ベトナム'],
    ['Indonesian',106.85,-6.21,'Indonesia','インドネシア'],['Filipino',120.98,14.60,'Philippines','フィリピン'],
    ['Iraqi',44.36,33.31,'Iraq','イラク'],['Qatari',51.53,25.29,'Qatar','カタール'],
    ['Emirati',54.37,24.45,'United Arab Emirates','UAE'],['Jordanian',35.94,31.95,'Jordan','ヨルダン'],
    ['Cuban',-82.38,23.13,'Cuba','キューバ'],['Argentine',-58.38,-34.60,'Argentina','アルゼンチン'],
    ['Argentinian',-58.38,-34.60,'Argentina','アルゼンチン'],['Colombian',-74.07,4.71,'Colombia','コロンビア'],
    ['Swedish',18.07,59.33,'Sweden','スウェーデン'],['Finnish',24.94,60.17,'Finland','フィンランド'],
    ['Norwegian',10.75,59.91,'Norway','ノルウェー'],['Swiss',7.45,46.95,'Switzerland','スイス'],
    ['Belgian',4.35,50.85,'Belgium','ベルギー'],['Austrian',16.37,48.21,'Austria','オーストリア'],
    ['Hungarian',19.04,47.50,'Hungary','ハンガリー'],['Czech',14.42,50.09,'Czechia','チェコ'],
    ['Romanian',26.10,44.43,'Romania','ルーマニア'],['Serbian',20.46,44.79,'Serbia','セルビア'],
    ['Belarusian',27.57,53.90,'Belarus','ベラルーシ'],['Armenian',44.51,40.18,'Armenia','アルメニア'],
    ['Azerbaijani',49.87,40.41,'Azerbaijan','アゼルバイジャン'],
    /* (#R28) many more nationalities — a huge share of headlines name a country only by its adjective */
    ['Algerian',3.06,36.75,'Algeria','アルジェリア'],['Moroccan',-6.84,34.02,'Morocco','モロッコ'],
    ['Tunisian',10.18,36.81,'Tunisia','チュニジア'],['Libyan',13.19,32.89,'Libya','リビア'],
    ['Malian',-8.00,12.65,'Mali','マリ'],['Somali',45.34,2.05,'Somalia','ソマリア'],
    ['Congolese',15.27,-4.44,'DR Congo','コンゴ民主共和国'],['Angolan',13.23,-8.84,'Angola','アンゴラ'],
    ['Zimbabwean',31.05,-17.83,'Zimbabwe','ジンバブエ'],['Ghanaian',-0.19,5.60,'Ghana','ガーナ'],
    ['Ivorian',-4.01,5.36,"Cote d'Ivoire",'コートジボワール'],['Senegalese',-17.45,14.69,'Senegal','セネガル'],
    ['Ugandan',32.58,0.35,'Uganda','ウガンダ'],['Rwandan',30.06,-1.94,'Rwanda','ルワンダ'],
    ['Chilean',-70.65,-33.45,'Chile','チリ'],['Peruvian',-77.04,-12.05,'Peru','ペルー'],
    ['Bolivian',-68.15,-16.50,'Bolivia','ボリビア'],['Ecuadorian',-78.47,-0.18,'Ecuador','エクアドル'],
    ['Uruguayan',-56.16,-34.90,'Uruguay','ウルグアイ'],['Paraguayan',-57.58,-25.30,'Paraguay','パラグアイ'],
    ['Bangladeshi',90.41,23.81,'Bangladesh','バングラデシュ'],['Sri Lankan',79.86,6.93,'Sri Lanka','スリランカ'],
    ['Nepali',85.32,27.70,'Nepal','ネパール'],['Burmese',96.08,21.97,'Myanmar','ミャンマー'],
    ['Malaysian',101.69,3.14,'Malaysia','マレーシア'],['Singaporean',103.85,1.29,'Singapore','シンガポール'],
    ['Cambodian',104.92,11.56,'Cambodia','カンボジア'],['Mongolian',106.92,47.92,'Mongolia','モンゴル'],
    ['Kazakh',71.45,51.18,'Kazakhstan','カザフスタン'],['Uzbek',69.24,41.31,'Uzbekistan','ウズベキスタン'],
    ['Georgian',44.83,41.72,'Georgia','ジョージア'],['Kurdish',44.00,36.50,'Kurdistan','クルド'],
    ['Catalan',2.17,41.39,'Catalonia','カタルーニャ'],['Portuguese',-9.14,38.72,'Portugal','ポルトガル'],
    ['Irish',-6.26,53.35,'Ireland','アイルランド'],['Danish',12.57,55.68,'Denmark','デンマーク'],
    ['Bulgarian',23.32,42.70,'Bulgaria','ブルガリア'],['Croatian',15.98,45.81,'Croatia','クロアチア'],
    ['Slovak',17.11,48.15,'Slovakia','スロバキア'],['Slovenian',14.51,46.05,'Slovenia','スロベニア'],
    ['Estonian',24.75,59.44,'Estonia','エストニア'],['Latvian',24.11,56.95,'Latvia','ラトビア'],
    ['Lithuanian',25.28,54.69,'Lithuania','リトアニア'],['Kuwaiti',47.98,29.38,'Kuwait','クウェート'],
    ['Omani',58.41,23.59,'Oman','オマーン'],['Bahraini',50.59,26.23,'Bahrain','バーレーン'],
    ['Tanzanian',39.28,-6.79,'Tanzania','タンザニア'],['Nigerien',2.12,13.51,'Niger','ニジェール']
  ];

  /* Publisher HQ gazetteer — drives the "Publisher" pin mode. Expanded from 24 → ~130 outlets
     so most stories resolve to a real source location (so the Subject/Publisher toggle actually
     moves the pin). Matched longest-key-first with word boundaries (see matchPublisher). */
  const sourceDict={
    /* UK */
    "BBC":{loc:[-0.12,51.50]},"Reuters":{loc:[-0.12,51.50]},"ロイター":{loc:[-0.12,51.50]},"The Guardian":{loc:[-0.12,51.50]},"Guardian":{loc:[-0.12,51.50]},"Financial Times":{loc:[-0.12,51.50]},"Sky News":{loc:[-0.12,51.50]},"The Times":{loc:[-0.12,51.50]},"Telegraph":{loc:[-0.12,51.50]},"The Independent":{loc:[-0.12,51.50]},"Independent":{loc:[-0.12,51.50]},"Daily Mail":{loc:[-0.12,51.50]},"The Economist":{loc:[-0.12,51.50]},"Economist":{loc:[-0.12,51.50]},"Middle East Eye":{loc:[-0.12,51.50]},"Mirror":{loc:[-0.12,51.50]},
    /* US */
    "AP":{loc:[-74.00,40.71]},"Associated Press":{loc:[-74.00,40.71]},"Bloomberg":{loc:[-74.00,40.71]},"NYT":{loc:[-74.00,40.71]},"New York Times":{loc:[-74.00,40.71]},"WSJ":{loc:[-74.00,40.71]},"Wall Street Journal":{loc:[-74.00,40.71]},"CNN":{loc:[-84.39,33.75]},"Washington Post":{loc:[-77.03,38.90]},"NBC":{loc:[-74.00,40.71]},"CBS":{loc:[-74.00,40.71]},"ABC News":{loc:[-74.00,40.71]},"Fox News":{loc:[-74.00,40.71]},"NPR":{loc:[-77.03,38.90]},"Politico":{loc:[-77.03,38.90]},"Axios":{loc:[-77.03,38.90]},"The Hill":{loc:[-77.03,38.90]},"Newsweek":{loc:[-74.00,40.71]},"Forbes":{loc:[-74.00,40.71]},"USA Today":{loc:[-77.03,38.90]},"LA Times":{loc:[-118.24,34.05]},"Los Angeles Times":{loc:[-118.24,34.05]},"Business Insider":{loc:[-74.00,40.71]},"CNBC":{loc:[-74.00,40.71]},
    /* Middle East */
    "Al Jazeera":{loc:[51.53,25.28]},"Al Arabiya":{loc:[55.27,25.20]},"Arab News":{loc:[46.72,24.69]},"The National":{loc:[54.38,24.45]},"Gulf News":{loc:[55.27,25.20]},"Khaleej Times":{loc:[55.27,25.20]},"Haaretz":{loc:[34.78,32.08]},"Times of Israel":{loc:[35.21,31.77]},"Jerusalem Post":{loc:[35.21,31.77]},"Anadolu":{loc:[32.86,39.93]},"Daily Sabah":{loc:[28.98,41.01]},"Hurriyet":{loc:[28.98,41.01]},"TRT":{loc:[32.86,39.93]},"Press TV":{loc:[51.39,35.69]},"Tehran Times":{loc:[51.39,35.69]},
    /* Europe */
    "Deutsche Welle":{loc:[7.10,50.74]},"DW":{loc:[7.10,50.74]},"Der Spiegel":{loc:[9.99,53.55]},"Spiegel":{loc:[9.99,53.55]},"Die Welt":{loc:[13.40,52.52]},"FAZ":{loc:[8.68,50.11]},"Bild":{loc:[13.40,52.52]},"France 24":{loc:[2.35,48.85]},"AFP":{loc:[2.35,48.85]},"Le Monde":{loc:[2.35,48.85]},"Le Figaro":{loc:[2.35,48.85]},"RFI":{loc:[2.35,48.85]},"El País":{loc:[-3.70,40.42]},"El Pais":{loc:[-3.70,40.42]},"El Mundo":{loc:[-3.70,40.42]},"ANSA":{loc:[12.50,41.90]},"Corriere":{loc:[9.19,45.46]},"La Repubblica":{loc:[12.50,41.90]},"Euronews":{loc:[4.84,45.76]},"Kyiv Independent":{loc:[30.52,50.45]},"Kyiv Post":{loc:[30.52,50.45]},"TASS":{loc:[37.61,55.75]},"RT":{loc:[37.61,55.75]},"Moscow Times":{loc:[37.61,55.75]},"Interfax":{loc:[37.61,55.75]},
    /* Asia-Pacific */
    "NHK":{loc:[139.69,35.66]},"日経":{loc:[139.76,35.68]},"Nikkei Asia":{loc:[139.76,35.68]},"Nikkei":{loc:[139.76,35.68]},"朝日":{loc:[139.69,35.66]},"Asahi":{loc:[139.69,35.66]},"読売":{loc:[139.76,35.68]},"Yomiuri":{loc:[139.76,35.68]},"毎日":{loc:[139.76,35.69]},"Mainichi":{loc:[139.76,35.69]},"産経":{loc:[139.74,35.66]},"Japan Times":{loc:[139.76,35.68]},"Kyodo":{loc:[139.76,35.68]},"Xinhua":{loc:[116.40,39.90]},"CGTN":{loc:[116.40,39.90]},"Global Times":{loc:[116.40,39.90]},"People's Daily":{loc:[116.40,39.90]},"South China Morning Post":{loc:[114.16,22.28]},"SCMP":{loc:[114.16,22.28]},"Yonhap":{loc:[126.97,37.56]},"Korea Herald":{loc:[126.97,37.56]},"Korea Times":{loc:[126.97,37.56]},"Straits Times":{loc:[103.85,1.29]},"Channel News Asia":{loc:[103.85,1.29]},"CNA":{loc:[103.85,1.29]},"The Hindu":{loc:[80.27,13.08]},"Times of India":{loc:[72.88,19.08]},"Hindustan Times":{loc:[77.21,28.61]},"NDTV":{loc:[77.21,28.61]},"Indian Express":{loc:[77.21,28.61]},"India Today":{loc:[77.21,28.61]},"Dawn":{loc:[67.01,24.86]},"Jakarta Post":{loc:[106.85,-6.21]},"Bangkok Post":{loc:[100.50,13.75]},"Sydney Morning Herald":{loc:[151.21,-33.87]},"The Age":{loc:[144.96,-37.81]},
    /* Americas (non-US) / Africa */
    "CBC":{loc:[-79.38,43.65]},"Globe and Mail":{loc:[-79.38,43.65]},"Toronto Star":{loc:[-79.38,43.65]},"CTV":{loc:[-79.38,43.65]},"Folha":{loc:[-46.63,-23.55]},"O Globo":{loc:[-43.17,-22.91]},"Clarín":{loc:[-58.38,-34.60]},"News24":{loc:[18.42,-33.92]},"Mail & Guardian":{loc:[28.05,-26.20]},"The East African":{loc:[36.82,-1.29]},
    /* (#R32) more high-frequency Google-News sources whose name carries no place token */
    "TechCrunch":{loc:[-122.27,37.80]},"The Verge":{loc:[-74.00,40.71]},"Wired":{loc:[-122.42,37.77]},"Ars Technica":{loc:[-87.63,41.88]},"Vox":{loc:[-74.00,40.71]},"Vice":{loc:[-74.00,40.71]},"The Daily Beast":{loc:[-74.00,40.71]},"Time":{loc:[-74.00,40.71]},"The Atlantic":{loc:[-77.03,38.90]},"ProPublica":{loc:[-74.00,40.71]},"The Conversation":{loc:[144.96,-37.81]},"Engadget":{loc:[-74.00,40.71]},"Gizmodo":{loc:[-74.00,40.71]},"The Register":{loc:[-0.12,51.50]},"POLITICO Europe":{loc:[4.35,50.85]},"EUobserver":{loc:[4.35,50.85]},"Euractiv":{loc:[4.35,50.85]},"The Local":{loc:[18.07,59.33]},"Irish Times":{loc:[-6.26,53.35]},"RTÉ":{loc:[-6.26,53.35]},"The Print":{loc:[77.21,28.61]},"Scroll.in":{loc:[72.88,19.08]},"Firstpost":{loc:[72.88,19.08]},"Economic Times":{loc:[72.88,19.08]},"Mint":{loc:[77.21,28.61]},"Al-Monitor":{loc:[35.21,31.77]},"Middle East Monitor":{loc:[-0.12,51.50]},"Premium Times":{loc:[7.49,9.06]},"Daily Nation":{loc:[36.82,-1.29]},"AllAfrica":{loc:[18.42,-33.92]},"MercoPress":{loc:[-57.95,-34.92]},"NZ Herald":{loc:[174.76,-36.85]},"Stuff":{loc:[174.78,-41.29]},"The Diplomat":{loc:[-77.03,38.90]},"Foreign Policy":{loc:[-77.03,38.90]},"Defense News":{loc:[-77.03,38.90]},"Barron's":{loc:[-74.00,40.71]},"MarketWatch":{loc:[-74.00,40.71]},"Semafor":{loc:[-74.00,40.71]},
    /* (#R36) more branded outlets whose NAME carries no place token (so the embedded-place fallback can't
       catch them) — reduces "publisher unknown" pins further. Accurate HQ coordinates. */
    "Rappler":{loc:[121.05,14.59]},"Infobae":{loc:[-58.38,-34.60]},"EFE":{loc:[-3.70,40.42]},"dpa":{loc:[9.99,53.55]},"PTI":{loc:[77.21,28.61]},"ANI":{loc:[77.21,28.61]},"IANS":{loc:[77.21,28.61]},"Caixin":{loc:[116.40,39.90]},"Sixth Tone":{loc:[121.47,31.23]},"Quartz":{loc:[-74.00,40.71]},"Grist":{loc:[-122.33,47.61]},"The Markup":{loc:[-74.00,40.71]},"Rest of World":{loc:[-74.00,40.71]},"Meduza":{loc:[24.11,56.95]},"Novaya Gazeta":{loc:[37.61,55.75]},"RNZ":{loc:[174.78,-41.29]},"Crikey":{loc:[144.96,-37.81]},"The Wire":{loc:[77.21,28.61]},"Tortoise":{loc:[-0.12,51.50]},"UnHerd":{loc:[-0.12,51.50]},"openDemocracy":{loc:[-0.12,51.50]},"Jacobin":{loc:[-74.00,40.71]},"Mother Jones":{loc:[-122.42,37.77]},"The Intercept":{loc:[-74.00,40.71]},"Punchbowl News":{loc:[-77.03,38.90]},"Breaking Defense":{loc:[-77.03,38.90]},"War on the Rocks":{loc:[-77.03,38.90]},"Defense One":{loc:[-77.03,38.90]},
    /* (#R37) "Publisher locationにすると位置不明のピンが多い" — a large batch of national/regional outlets whose
       NAME carries no place token, so neither the dict nor the embedded-place scan caught them. Accurate HQ. */
    "Aftenposten":{loc:[10.75,59.91]},"Dagens Nyheter":{loc:[18.07,59.33]},"Svenska Dagbladet":{loc:[18.07,59.33]},"Helsingin Sanomat":{loc:[24.94,60.17]},"Yle":{loc:[24.94,60.17]},"Politiken":{loc:[12.57,55.68]},"Berlingske":{loc:[12.57,55.68]},
    "Gazeta Wyborcza":{loc:[21.01,52.23]},"Rzeczpospolita":{loc:[21.01,52.23]},"Onet":{loc:[21.01,52.23]},"iDNES":{loc:[14.42,50.08]},"Index.hu":{loc:[19.04,47.50]},"Delfi":{loc:[25.28,54.69]},"Postimees":{loc:[24.75,59.44]},
    "De Telegraaf":{loc:[4.90,52.37]},"NRC":{loc:[4.90,52.37]},"NOS":{loc:[4.90,52.37]},"De Standaard":{loc:[4.35,50.85]},"Le Soir":{loc:[4.35,50.85]},"RTBF":{loc:[4.35,50.85]},"Tagesschau":{loc:[9.99,53.55]},"Süddeutsche Zeitung":{loc:[11.58,48.14]},"Süddeutsche":{loc:[11.58,48.14]},"taz":{loc:[13.40,52.52]},"Kathimerini":{loc:[23.73,37.98]},"NZZ":{loc:[8.54,47.37]},"swissinfo":{loc:[7.45,46.95]},
    "Kompas":{loc:[106.85,-6.21]},"Tempo":{loc:[106.85,-6.21]},"New Straits Times":{loc:[101.69,3.14]},"Philstar":{loc:[121.05,14.59]},"Manila Bulletin":{loc:[121.05,14.59]},"VnExpress":{loc:[105.85,21.03]},"Tuoi Tre":{loc:[106.70,10.78]},"The Daily Star":{loc:[90.41,23.81]},"The Express Tribune":{loc:[67.01,24.86]},"Geo News":{loc:[67.01,24.86]},"Kathmandu Post":{loc:[85.32,27.71]},
    "El Universal":{loc:[-99.13,19.43]},"Milenio":{loc:[-99.13,19.43]},"El Comercio":{loc:[-77.04,-12.05]},"El Tiempo":{loc:[-74.07,4.71]},"El Espectador":{loc:[-74.07,4.71]},"La Nación":{loc:[-58.38,-34.60]},"Estadão":{loc:[-46.63,-23.55]},"El Mercurio":{loc:[-70.65,-33.45]},
    "Al-Ahram":{loc:[31.24,30.04]},"Ahram Online":{loc:[31.24,30.04]},"Egypt Independent":{loc:[31.24,30.04]},"Vanguard":{loc:[3.39,6.45]},"Daily Maverick":{loc:[18.42,-33.92]},"Ynet":{loc:[34.78,32.08]},
    "RBC":{loc:[37.61,55.75]},"Kommersant":{loc:[37.61,55.75]},"Vedomosti":{loc:[37.61,55.75]},"RIA Novosti":{loc:[37.61,55.75]},"Ukrainska Pravda":{loc:[30.52,50.45]},"UNIAN":{loc:[30.52,50.45]},
    "National Post":{loc:[-79.38,43.65]},"The Australian":{loc:[151.21,-33.87]},"Australian Financial Review":{loc:[151.21,-33.87]},"The Spectator":{loc:[-0.12,51.50]}
  };
  /* (#R39) German + Russian gazetteer so the NON-AI locator places DE/RU headlines at the same quality as
     EN/JP ("ドイツ語、ロシア語でも追加して。同じ品質で"). German = full exonyms; Russian = STEMS (the Cyrillic
     matcher appends ≤4 inflectional letters: «Москв» → Москва/Москве/Москвы/Москву). Coords = capital/city.
     Mirrors the entry shape [type,[terms],lng,lat,en,jp]; merged below alongside the built-ins. */
  /* @i18n-entity-data  DE/RU place-name spellings and the place they resolve to  (#R249 — declared, and validated by scripts/i18n-pair-audit.mjs
     against the row carrying a coordinate / ISO code / ticker / domain) */
  const _DERU_GZ=[
    ['country',['Deutschland','Герман'],13.40,52.52,'Germany','ドイツ'],
    ['country',['Russland','Росси','РФ'],37.62,55.75,'Russia','ロシア'],
    ['country',['Ukraine','Украин'],30.52,50.45,'Ukraine','ウクライナ'],
    ['country',['Vereinigte Staaten','США','Соединённ'],-77.04,38.91,'United States','アメリカ'],
    ['country',['China','Кита'],116.40,39.90,'China','中国'],
    ['country',['Japan','Япони'],139.69,35.69,'Japan','日本'],
    ['country',['Frankreich','Франци'],2.35,48.85,'France','フランス'],
    ['country',['Italien','Итали'],12.48,41.89,'Italy','イタリア'],
    ['country',['Spanien','Испани'],-3.70,40.42,'Spain','スペイン'],
    ['country',['Großbritannien','Vereinigtes Königreich','Великобритан','Британи'],-0.13,51.51,'United Kingdom','イギリス'],
    ['country',['Polen','Польш'],21.01,52.23,'Poland','ポーランド'],
    ['country',['Iran','Иран'],51.39,35.69,'Iran','イラン'],
    ['country',['Israel','Израил'],35.21,31.77,'Israel','イスラエル'],
    ['country',['Türkei','Турци'],32.85,39.93,'Turkey','トルコ'],
    ['country',['Indien','Инди'],77.21,28.61,'India','インド'],
    ['country',['Brasilien','Бразили'],-47.88,-15.79,'Brazil','ブラジル'],
    ['country',['Kanada','Канад'],-75.70,45.42,'Canada','カナダ'],
    ['country',['Mexiko','Мексик'],-99.13,19.43,'Mexico','メキシコ'],
    ['country',['Australien','Австрали'],149.13,-35.28,'Australia','オーストラリア'],
    ['country',['Ägypten','Египет','Египт'],31.24,30.04,'Egypt','エジプト'],
    ['country',['Saudi-Arabien','Саудовск'],46.72,24.69,'Saudi Arabia','サウジアラビア'],
    ['country',['Syrien','Сири'],36.30,33.51,'Syria','シリア'],
    ['country',['Nordkorea','КНДР','Северная Коре'],125.76,39.04,'North Korea','北朝鮮'],
    ['country',['Südkorea','Республика Коре'],126.98,37.57,'South Korea','韓国'],
    ['country',['Niederlande','Нидерланд','Голланди'],4.90,52.37,'Netherlands','オランダ'],
    ['country',['Schweiz','Швейцари'],7.45,46.95,'Switzerland','スイス'],
    ['country',['Schweden','Швеци'],18.07,59.33,'Sweden','スウェーデン'],
    ['country',['Norwegen','Норвеги'],10.75,59.91,'Norway','ノルウェー'],
    ['country',['Finnland','Финлянди'],24.94,60.17,'Finland','フィンランド'],
    ['country',['Österreich','Австри'],16.37,48.21,'Austria','オーストリア'],
    ['country',['Griechenland','Греци'],23.73,37.98,'Greece','ギリシャ'],
    ['country',['Belgien','Бельги'],4.35,50.85,'Belgium','ベルギー'],
    ['country',['Tschechien','Чехи'],14.42,50.09,'Czechia','チェコ'],
    ['country',['Ungarn','Венгри'],19.04,47.50,'Hungary','ハンガリー'],
    ['country',['Rumänien','Румыни'],26.10,44.43,'Romania','ルーマニア'],
    ['country',['Weißrussland','Belarus','Белорус','Беларус'],27.57,53.90,'Belarus','ベラルーシ'],
    ['country',['Georgien','Грузи'],44.83,41.72,'Georgia','ジョージア'],
    ['country',['Kasachstan','Казахстан'],71.43,51.13,'Kazakhstan','カザフスタン'],
    ['country',['Afghanistan','Афганистан'],69.18,34.52,'Afghanistan','アフガニスタン'],
    ['country',['Pakistan','Пакистан'],73.06,33.69,'Pakistan','パキスタン'],
    ['country',['Indonesien','Индонези'],106.83,-6.21,'Indonesia','インドネシア'],
    ['country',['Südafrika','ЮАР','Южно-Африк'],28.19,-25.75,'South Africa','南アフリカ'],
    ['country',['Nigeria','Нигери'],7.49,9.06,'Nigeria','ナイジェリア'],
    ['country',['Argentinien','Аргентин'],-58.38,-34.60,'Argentina','アルゼンチン'],
    ['country',['Venezuela','Венесуэл'],-66.90,10.49,'Venezuela','ベネズエラ'],
    ['country',['Irak','Ирак'],44.36,33.31,'Iraq','イラク'],
    ['city',['Moskau','Москв'],37.62,55.75,'Moscow','モスクワ'],
    ['city',['München','Мюнхен'],11.58,48.14,'Munich','ミュンヘン'],
    ['city',['Köln','Кёльн','Кельн'],6.96,50.94,'Cologne','ケルン'],
    ['city',['Wien','Вене','Вену','Вена'],16.37,48.21,'Vienna','ウィーン'],
    ['city',['Prag','Праг'],14.42,50.09,'Prague','プラハ'],
    ['city',['Warschau','Варшав'],21.01,52.23,'Warsaw','ワルシャワ'],
    ['city',['Peking','Пекин'],116.40,39.90,'Beijing','北京'],
    ['city',['Kiew','Киев','Київ'],30.52,50.45,'Kyiv','キーウ'],
    ['city',['Genf','Женев'],6.14,46.20,'Geneva','ジュネーブ'],
    ['city',['Brüssel','Брюссел'],4.35,50.85,'Brussels','ブリュッセル'],
    ['city',['Mailand','Милан'],9.19,45.46,'Milan','ミラノ'],
    ['city',['Istanbul','Стамбул'],28.98,41.01,'Istanbul','イスタンブール'],
    ['city',['Teheran','Тегеран'],51.39,35.69,'Tehran','テヘラン'],
    ['city',['Damaskus','Дамаск'],36.30,33.51,'Damascus','ダマスカス'],
    ['city',['Sankt Petersburg','Петербург'],30.34,59.93,'Saint Petersburg','サンクトペテルブルク'],
    /* (#R41) news-hotspot enhancement — conflict zones + major capitals in DE + RU (RU = declension-safe stems). */
    ['city',['Charkiw','Charkow','Харьков','Харків'],36.23,49.99,'Kharkiv','ハルキウ'],
    ['city',['Odessa','Одесс','Одеса'],30.73,46.48,'Odesa','オデーサ'],
    ['city',['Lwiw','Lemberg','Львов','Львів'],24.03,49.84,'Lviv','リヴィウ'],
    ['city',['Donezk','Донецк'],37.80,48.00,'Donetsk','ドネツク'],
    ['region',['Donbass','Донбасс'],37.80,48.00,'Donbas','ドンバス'],
    ['region',['Westjordanland','Западный берег','Западном берег'],35.30,32.00,'West Bank','ヨルダン川西岸'],
    ['city',['Gaza','Газа'],34.47,31.50,'Gaza','ガザ'],
    ['city',['Rafah','Рафах'],34.25,31.29,'Rafah','ラファ'],
    ['city',['Beirut','Бейрут'],35.50,33.89,'Beirut','ベイルート'],
    ['city',['Aleppo','Алеппо'],37.16,36.20,'Aleppo','アレッポ'],
    ['city',['Bagdad','Багдад'],44.36,33.31,'Baghdad','バグダッド'],
    ['region',['Kaschmir','Кашмир'],74.80,34.08,'Kashmir','カシミール'],
    ['city',['Taipeh','Тайбэ'],121.56,25.03,'Taipei','台北'],
    ['city',['Pjöngjang','Пхеньян'],125.76,39.04,'Pyongyang','平壌'],
    ['city',['Kairo','Каир'],31.24,30.04,'Cairo','カイロ'],
    ['city',['Riad','Эр-Рияд','Рияд'],46.72,24.69,'Riyadh','リヤド'],
    ['city',['Neu-Delhi','Нью-Дели','Дели'],77.21,28.61,'New Delhi','ニューデリー'],
    ['city',['Schanghai','Шанха'],121.47,31.23,'Shanghai','上海'],
    ['city',['Hongkong','Гонконг'],114.17,22.32,'Hong Kong','香港'],
    ['city',['Seoul','Сеул'],126.98,37.57,'Seoul','ソウル'],
    ['city',['Tokio','Токио'],139.69,35.69,'Tokyo','東京'],
    ['city',['Chartum','Хартум'],32.53,15.50,'Khartoum','ハルツーム']
  ];
  /* Russian demonym/adjective stems → docked country entries (the Cyrillic matcher handles -ий/-ая/-ое/-их). */
  /* @i18n-entity-data  DE/RU demonyms and the country they resolve to  (#R249 — declared, and validated by scripts/i18n-pair-audit.mjs
     against the row carrying a coordinate / ISO code / ticker / domain) */
  const _DERU_DEM=[
    ['Российск',37.62,55.75,'Russia','ロシア'],['Украинск',30.52,50.45,'Ukraine','ウクライナ'],
    ['Американск',-77.04,38.91,'United States','アメリカ'],['Китайск',116.40,39.90,'China','中国'],
    ['Израильск',35.21,31.77,'Israel','イスラエル'],['Иранск',51.39,35.69,'Iran','イラン'],
    ['Немецк',13.40,52.52,'Germany','ドイツ'],['Французск',2.35,48.85,'France','フランス'],
    ['Британск',-0.13,51.51,'United Kingdom','イギリス'],['Японск',139.69,35.69,'Japan','日本'],
    ['Турецк',32.85,39.93,'Turkey','トルコ'],['Польск',21.01,52.23,'Poland','ポーランド'],
    ['Сирийск',36.30,33.51,'Syria','シリア'],['Индийск',77.21,28.61,'India','インド']
  ];
  /* (#R40) Spanish exonyms for the non-AI locator (Latin script → the standard word-boundary matcher works,
     no Cyrillic special-casing needed). Same [type,terms,lng,lat,en,jp] shape as _DERU_GZ. */
  /* @i18n-entity-data  ES place-name spellings and the place they resolve to  (#R249 — declared, and validated by scripts/i18n-pair-audit.mjs
     against the row carrying a coordinate / ISO code / ticker / domain) */
  const _ES_GZ=[
    ['country',['Estados Unidos','EE.UU.','EEUU'],-77.04,38.91,'United States','アメリカ'],
    ['country',['Reino Unido','Gran Bretaña','Inglaterra'],-0.13,51.51,'United Kingdom','イギリス'],
    ['country',['Alemania'],13.40,52.52,'Germany','ドイツ'],
    ['country',['Francia'],2.35,48.85,'France','フランス'],
    ['country',['España'],-3.70,40.42,'Spain','スペイン'],
    ['country',['Rusia'],37.62,55.75,'Russia','ロシア'],
    ['country',['Ucrania'],30.52,50.45,'Ukraine','ウクライナ'],
    ['country',['Japón','Japon'],139.69,35.69,'Japan','日本'],
    ['country',['China'],116.40,39.90,'China','中国'],
    ['country',['Italia'],12.48,41.89,'Italy','イタリア'],
    ['country',['Polonia'],21.01,52.23,'Poland','ポーランド'],
    ['country',['Irán','Iran'],51.39,35.69,'Iran','イラン'],
    ['country',['Israel'],35.21,31.77,'Israel','イスラエル'],
    ['country',['Turquía','Turquia'],32.85,39.93,'Turkey','トルコ'],
    ['country',['India'],77.21,28.61,'India','インド'],
    ['country',['Brasil'],-47.88,-15.79,'Brazil','ブラジル'],
    ['country',['Canadá','Canada'],-75.70,45.42,'Canada','カナダ'],
    ['country',['México','Mexico'],-99.13,19.43,'Mexico','メキシコ'],
    ['country',['Argentina'],-58.38,-34.60,'Argentina','アルゼンチン'],
    ['country',['Colombia'],-74.07,4.71,'Colombia','コロンビア'],
    ['country',['Venezuela'],-66.90,10.49,'Venezuela','ベネズエラ'],
    ['country',['Chile'],-70.65,-33.45,'Chile','チリ'],
    ['country',['Perú','Peru'],-77.04,-12.05,'Peru','ペルー'],
    ['country',['Australia'],149.13,-35.28,'Australia','オーストラリア'],
    ['country',['Egipto'],31.24,30.04,'Egypt','エジプト'],
    ['country',['Arabia Saudí','Arabia Saudita'],46.72,24.69,'Saudi Arabia','サウジアラビア'],
    ['country',['Siria'],36.30,33.51,'Syria','シリア'],
    ['country',['Corea del Norte'],125.76,39.04,'North Korea','北朝鮮'],
    ['country',['Corea del Sur'],126.98,37.57,'South Korea','韓国'],
    ['country',['Países Bajos','Holanda'],4.90,52.37,'Netherlands','オランダ'],
    ['country',['Suiza'],7.45,46.95,'Switzerland','スイス'],
    ['country',['Suecia'],18.07,59.33,'Sweden','スウェーデン'],
    ['country',['Grecia'],23.73,37.98,'Greece','ギリシャ'],
    ['country',['Bélgica','Belgica'],4.35,50.85,'Belgium','ベルギー'],
    ['country',['Marruecos'],-6.85,33.97,'Morocco','モロッコ'],
    ['country',['Sudáfrica','Sudafrica'],28.19,-25.75,'South Africa','南アフリカ'],
    ['country',['Nigeria'],7.49,9.06,'Nigeria','ナイジェリア'],
    ['country',['Pakistán','Pakistan'],73.06,33.69,'Pakistan','パキスタン'],
    ['country',['Afganistán','Afganistan'],69.18,34.52,'Afghanistan','アフガニスタン'],
    ['country',['Irak'],44.36,33.31,'Iraq','イラク'],
    ['city',['Moscú','Moscu'],37.62,55.75,'Moscow','モスクワ'],
    ['city',['Londres'],-0.13,51.51,'London','ロンドン'],
    ['city',['Nueva York'],-74.01,40.71,'New York','ニューヨーク'],
    ['city',['Pekín','Pekin'],116.40,39.90,'Beijing','北京'],
    ['city',['Kiev'],30.52,50.45,'Kyiv','キーウ'],
    ['city',['Ginebra'],6.14,46.20,'Geneva','ジュネーブ'],
    ['city',['Bruselas'],4.35,50.85,'Brussels','ブリュッセル'],
    ['city',['Milán','Milan'],9.19,45.46,'Milan','ミラノ'],
    ['city',['Estambul'],28.98,41.01,'Istanbul','イスタンブール'],
    ['city',['Teherán','Teheran'],51.39,35.69,'Tehran','テヘラン'],
    ['city',['Damasco'],36.30,33.51,'Damascus','ダマスカス'],
    ['city',['Múnich','Munich'],11.58,48.14,'Munich','ミュンヘン'],
    /* (#R41) news-hotspot enhancement — conflict zones + major capitals (Spanish exonyms). */
    ['city',['Járkov','Jarkov'],36.23,49.99,'Kharkiv','ハルキウ'],
    ['city',['Leópolis','Leopolis'],24.03,49.84,'Lviv','リヴィウ'],
    ['city',['Odesa','Odessa'],30.73,46.48,'Odesa','オデーサ'],
    ['city',['Donetsk'],37.80,48.00,'Donetsk','ドネツク'],
    ['region',['Cisjordania'],35.30,32.00,'West Bank','ヨルダン川西岸'],
    ['city',['Gaza'],34.47,31.50,'Gaza','ガザ'],
    ['city',['Rafah'],34.25,31.29,'Rafah','ラファ'],
    ['city',['Beirut'],35.50,33.89,'Beirut','ベイルート'],
    ['city',['Alepo'],37.16,36.20,'Aleppo','アレッポ'],
    ['city',['Bagdad'],44.36,33.31,'Baghdad','バグダッド'],
    ['region',['Cachemira'],74.80,34.08,'Kashmir','カシミール'],
    ['city',['Taipéi','Taipei'],121.56,25.03,'Taipei','台北'],
    ['city',['Pionyang'],125.76,39.04,'Pyongyang','平壌'],
    ['city',['El Cairo'],31.24,30.04,'Cairo','カイロ'],
    ['city',['Riad'],46.72,24.69,'Riyadh','リヤド'],
    ['city',['Nueva Delhi'],77.21,28.61,'New Delhi','ニューデリー'],
    ['city',['Shanghái','Shanghai'],121.47,31.23,'Shanghai','上海'],
    ['city',['Hong Kong'],114.17,22.32,'Hong Kong','香港'],
    ['city',['Seúl'],126.98,37.57,'Seoul','ソウル'],
    ['city',['Tokio'],139.69,35.69,'Tokyo','東京'],
    ['city',['Jartum'],32.53,15.50,'Khartoum','ハルツーム']
  ];
  /* Spanish demonym/adjective forms → low-confidence country entries (docked below explicit places). */
  /* @i18n-entity-data  ES demonyms and the country they resolve to  (#R249 — declared, and validated by scripts/i18n-pair-audit.mjs
     against the row carrying a coordinate / ISO code / ticker / domain) */
  const _ES_DEM=[
    ['ruso',37.62,55.75,'Russia','ロシア'],['rusa',37.62,55.75,'Russia','ロシア'],
    ['ucraniano',30.52,50.45,'Ukraine','ウクライナ'],['ucraniana',30.52,50.45,'Ukraine','ウクライナ'],
    ['estadounidense',-77.04,38.91,'United States','アメリカ'],['israelí',35.21,31.77,'Israel','イスラエル'],
    ['iraní',51.39,35.69,'Iran','イラン'],['chino',116.40,39.90,'China','中国'],['china',116.40,39.90,'China','中国'],
    ['alemán',13.40,52.52,'Germany','ドイツ'],['francés',2.35,48.85,'France','フランス'],['británico',-0.13,51.51,'United Kingdom','イギリス']
  ];
  /* ===== Geo overlay layer data — rebuilt with reliable, simpler geometry ===== */
  /* ===== Geopolitical layers — rebuilt with accurate geometry + labels =====
     Structure: each layer may contain areas[] (filled polygons), lines[] (paths),
     points[] (POI markers). Every feature carries a human label drawn on the map. */
  /* ⚠⚠ (#R225) `geoLayersDB` WAS HERE — the geometry of the nine Strategic geography / Strategic
   networks layers (Sahel, the two island chains, String of Pearls, the Northern Sea Route, the
   chokepoints, Belt & Road, the pipelines, the nuclear sites) plus a `cables` entry that no
   checkbox had referenced for rounds. 「大昔に捨てたはずの地政学レイヤーが勝手にオンになる。
   ふざけるな。」 — confirmed as 「レイヤー自体を削除してほしい」, so the data goes with the rows in
   index.html, the drawing and labelling in js/place-labels.js, the preview in
   js/layer-previews.js and the favourite in js/layer-favs.js. */
  /* JP translations for the on-map geo-theory labels (#1) — English leaked onto the Japanese map
     because these labels were drawn verbatim. geoLabel() swaps them when the UI is in Japanese, and
     refreshGeoLabels() re-emits the source data on a language switch. */
  /* (#R225) `GEO_LABEL_JP` translated the geo layers' on-map labels; those layers are deleted. */
  /* ===== Country data & extended stats ===== */
  const GDP={USA:27361,CHN:17795,JPN:4213,DEU:4456,IND:3550,GBR:3340,FRA:3031,ITA:2255,BRA:2174,CAN:2140,RUS:2021,MEX:1789,AUS:1724,KOR:1713,ESP:1581,IDN:1371,TUR:1108,NLD:1118,SAU:1068,CHE:884,POL:811,TWN:790,BEL:632,SWE:593,ARG:641,IRL:545,NOR:486,AUT:516,ISR:510,ARE:504,THA:515,SGP:501,BGD:446,PHL:437,VNM:430,DNK:404,MYS:400,HKG:382,EGY:396,IRN:388,ZAF:378,COL:364,ROU:351,CHL:335,CZE:330,FIN:300,PRT:287,PER:268,IRQ:264,KAZ:261,NZL:251,GRC:238,QAT:235,DZA:240,HUN:213,UKR:179,KWT:162,ETH:156,MAR:142,SVK:132,ECU:119,KEN:108,OMN:108,GTM:102,BGR:101,VEN:92,CRI:86,LUX:86,PAN:82,CIV:79,HRV:80,LTU:79,UZB:90,TZA:76,GHA:76,SRB:75,LKA:74,BLR:73,SVN:68,COD:67,MMR:65,TKM:56,JOR:50,CMR:49,UGA:49,TUN:47,BOL:45,LBY:45,PRY:43,NPL:41,ZWE:32,CYP:32,ISL:30,GEO:30,SEN:31,KHM:31,PNG:31,ZMB:28,BIH:27,ARM:24,LBN:23,ALB:23,HTI:20,MOZ:21,YEM:21,GAB:21,BWA:20,MLT:20,BFA:20,MLI:20,BEN:19,PRK:18,MNG:18,NIC:17,NER:17,MDG:16,MDA:16,LAO:15,BRN:15,MUS:14,AFG:14,RWA:14,MWI:13,TCD:13,KGZ:12,TJK:12,NAM:12,SOM:11,CUB:107,SDN:109,FJI:5};
  /* HDI 2022, Democracy Index 2023, Military spending 2023 ($B SIPRI), Life expectancy 2022, Internet users % 2023 */
  /* HDI 2022 (UNDP) — broad coverage so very few countries fall back to the "no data" gray fill. */
  const HDI={NOR:.966,CHE:.967,ISL:.959,HKG:.956,DNK:.952,SWE:.952,DEU:.950,IRL:.950,SGP:.949,AUS:.946,NLD:.946,BEL:.942,FIN:.942,LIE:.942,GBR:.940,NZL:.939,ARE:.937,CAN:.935,KOR:.929,TWN:.926,LUX:.927,USA:.927,AUT:.926,SVN:.926,JPN:.920,MLT:.915,ISR:.915,ESP:.911,FRA:.910,CYP:.907,ITA:.906,EST:.899,CZE:.895,GRC:.893,BHR:.888,AND:.884,POL:.881,LVA:.879,LTU:.879,HRV:.878,QAT:.875,SAU:.875,PRT:.874,SVK:.855,CHL:.860,TUR:.855,HUN:.851,ARG:.849,KWT:.847,MNE:.844,KNA:.838,URY:.830,ATG:.826,PAN:.820,ROU:.827,RUS:.821,OMN:.819,GEO:.814,TTO:.814,KAZ:.811,BHS:.812,BRB:.809,MYS:.807,CRI:.806,SRB:.805,THA:.803,MUS:.802,SYC:.802,BLR:.801,GRD:.793,ALB:.789,CHN:.788,ARM:.786,MEX:.781,MDA:.763,IRN:.780,LKA:.780,BIH:.779,DOM:.766,MKD:.765,ECU:.765,CUB:.764,MDV:.762,PER:.762,AZE:.760,BRA:.760,COL:.758,VCT:.751,LBY:.746,TKM:.744,GUY:.742,MNG:.741,DMA:.740,JOR:.736,UKR:.734,TUN:.732,SUR:.730,PRY:.731,FJI:.729,EGY:.728,UZB:.727,VNM:.726,LCA:.725,LBN:.723,ZAF:.717,PSE:.716,IDN:.713,PHL:.710,BWA:.708,JAM:.706,KGZ:.701,BLZ:.700,VEN:.699,BOL:.698,MAR:.698,GAB:.693,BTN:.681,TJK:.679,SLV:.674,IRQ:.673,BGD:.670,NIC:.669,IND:.644,GTM:.629,KIR:.628,HND:.624,LAO:.620,NAM:.610,SWZ:.610,MMR:.608,GHA:.602,KEN:.601,NPL:.601,KHM:.600,COG:.593,AGO:.591,CMR:.587,ZMB:.569,PNG:.568,COM:.558,SYR:.557,HTI:.552,ZWE:.550,UGA:.550,RWA:.548,NGA:.548,TGO:.547,MRT:.540,PAK:.540,CIV:.534,TZA:.532,LSO:.521,SEN:.517,SDN:.516,DJI:.515,MWI:.508,BEN:.504,GMB:.500,ERI:.493,ETH:.492,LBR:.487,GNB:.483,COD:.481,SLE:.477,GIN:.471,AFG:.462,MOZ:.461,GNQ:.650,BFA:.438,MLI:.428,YEM:.424,BDI:.420,NER:.394,TCD:.394,CAF:.387,SSD:.381,SOM:.380};
  /* EIU Democracy Index 2023 — broad coverage (the EIU rates 167 states; the rest fall back to gray). */
  const DEM={NOR:9.81,NZL:9.61,ISL:9.45,SWE:9.39,FIN:9.30,DNK:9.28,IRL:9.19,CHE:9.14,NLD:9.00,TWN:8.92,LUX:8.81,DEU:8.80,CAN:8.69,AUS:8.66,URY:8.66,JPN:8.40,CRI:8.29,GBR:8.28,AUT:8.28,CHL:8.22,MUS:8.14,KOR:8.09,FRA:8.07,ESP:8.07,EST:8.06,CZE:7.97,PRT:7.95,USA:7.85,ISR:7.80,BWA:7.73,ITA:7.69,CPV:7.65,BEL:7.64,MLT:7.57,GRC:7.50,SVN:7.46,LVA:7.38,LTU:7.31,MYS:7.30,POL:7.18,IND:7.18,TTO:7.16,JAM:7.13,PAN:7.10,SVK:7.07,ZAF:7.05,BRA:6.68,DOM:6.62,ARG:6.62,COL:6.55,IDN:6.53,NAM:6.52,MNG:6.50,HRV:6.50,HUN:6.50,ROU:6.48,BGR:6.45,ALB:6.41,PHL:6.36,THA:6.35,SRB:6.33,PRY:6.22,SGP:6.18,LKA:6.17,ECU:6.13,MKD:6.13,LSO:6.11,MDA:6.09,SUR:6.06,MNE:6.02,PER:5.99,PNG:5.97,SEN:5.96,MWI:5.91,BGD:5.87,ZMB:5.80,BTN:5.54,TUN:5.51,ARM:5.42,LBR:5.43,FJI:5.40,HKG:5.28,GEO:5.20,TZA:5.10,MDG:5.10,UKR:5.06,KEN:5.05,MAR:5.04,BIH:5.00,SLV:4.97,HND:4.83,BOL:4.65,GTM:4.62,UGA:4.49,TUR:4.33,NGA:4.23,CIV:4.22,BEN:4.20,NPL:4.07,AGO:3.96,MRT:3.92,PSE:3.86,KWT:3.83,DZA:3.66,QAT:3.65,KGZ:3.62,LBN:3.56,MOZ:3.51,IRQ:3.51,PAK:3.25,MLI:3.23,JOR:3.17,OMN:3.12,RWA:3.10,KAZ:3.08,ETH:3.06,TGO:2.99,SWZ:2.96,EGY:2.93,ZWE:2.92,BFA:2.91,ARE:2.90,AZE:2.80,GAB:2.79,CUB:2.65,GIN:2.65,COG:2.61,VNM:2.62,CMR:2.56,KHM:2.55,HTI:2.50,NIC:2.26,LBY:2.25,VEN:2.23,RUS:2.22,NER:2.20,UZB:2.12,SAU:2.08,ERI:2.03,YEM:1.95,IRN:1.96,TJK:1.94,CHN:1.94,BLR:1.99,GNQ:1.92,SDN:1.76,LAO:1.71,TCD:1.67,TKM:1.66,SYR:1.43,COD:1.40,CAF:1.18,SSD:1.16,PRK:1.08,MMR:0.85,AFG:0.26};
  /* Military expenditure, latest available year, current USD $B (SIPRI 2023 where covered; IISS
     Military Balance estimates for the handful SIPRI omits). (#R14) Expanded from ~58 to ~150 states so
     far fewer countries fall to "No data" gray. Genuinely unpublished spenders (DPRK, Syria, Eritrea,
     Turkmenistan, Somalia, Yemen) are deliberately left out rather than fabricated → they stay gray. */
  const MILSPEND={USA:916,CHN:296,RUS:109,IND:84,SAU:75,UKR:65,GBR:75,DEU:67,FRA:61,JPN:50,KOR:48,ITA:36,AUS:32,POL:32,ISR:27,CAN:27,ESP:24,BRA:23,NLD:19,TUR:16,SGP:14,IDN:9,IRN:10,PAK:9,EGY:5,GRC:7,NOR:9,SWE:9,FIN:7,DNK:9,BEL:8,NZL:3,PRT:4,CZE:5,HUN:3,ROU:4,VNM:6,THA:5,COL:9,MEX:8,DZA:18,ARE:23,QAT:11,KWT:8,IRQ:11,LBY:3,MMR:2,VEN:1,CUB:1,NGA:3,ZAF:2,KEN:1,CHL:4,ARG:3,PER:2,PHL:4,MYS:4,TWN:14,
    OMN:6,BHR:1.5,JOR:2,LBN:0.7,MAR:5,TUN:1.2,SDN:1.5,AGO:1.6,ETH:1,TZA:0.9,UGA:1,COD:0.5,GHA:0.3,CIV:0.6,CMR:0.5,MLI:0.6,TCD:0.4,NER:0.3,SEN:0.5,BWA:0.5,NAM:0.4,ZMB:0.3,ZWE:0.5,MOZ:0.2,MRT:0.2,BFA:0.4,RWA:0.2,MWI:0.05,TGO:0.1,BEN:0.1,GIN:0.2,GAB:0.3,COG:0.3,MDG:0.1,SSD:0.5,LBR:0.05,SLE:0.05,GMB:0.03,BDI:0.07,DJI:0.1,GNQ:0.1,LSO:0.05,SWZ:0.08,
    BGD:4,LKA:1.3,NPL:0.5,AFG:0.3,KAZ:1.5,UZB:2,KGZ:0.13,TJK:0.08,MNG:0.1,KHM:0.6,LAO:0.02,BRN:0.5,
    AZE:3.4,ARM:1.3,GEO:0.5,BLR:1,MDA:0.1,
    HRV:1.5,SRB:1.6,SVK:2,SVN:0.8,BGR:1.4,AUT:4,CHE:6,IRL:1.3,LTU:2,LVA:1,EST:1.2,CYP:0.6,ALB:0.4,MKD:0.2,BIH:0.2,MNE:0.1,LUX:0.5,MLT:0.07,
    ECU:2.4,BOL:0.6,PRY:0.4,URY:1.2,DOM:0.6,GTM:0.4,HND:0.5,SLV:0.4,NIC:0.1,TTO:0.3,JAM:0.2,GUY:0.1,SUR:0.05,FJI:0.1,PNG:0.3,
    /* (#R15 / #8) Further reduce "No data": IISS Military Balance estimates for states SIPRI omits, plus
       near-zero for countries with no standing army (security/coast-guard budgets). Genuinely-unknowable
       ones with NO credible figure stay gray rather than fabricated. */
    PRK:4,SYR:2.5,TKM:1.5,YEM:1.4,ERI:0.1,SOM:0.2,CRI:0.05,PAN:0.7,ISL:0.05,CAF:0.07,BTN:0.1,MDV:0.13,HTI:0.05,BLZ:0.03,BHS:0.07,BRB:0.02,GNB:0.04,CPV:0.01,COM:0.02,STP:0.005,MUS:0.03,SYC:0.02,TLS:0.04,XKX:0.09,HKG:0};
  const LIFE={JPN:84.0,CHE:83.6,KOR:83.6,SGP:83.5,AUS:83.3,ISL:83.0,ITA:82.9,ESP:82.8,SWE:83.0,FRA:82.5,NOR:83.2,IRL:82.6,NZL:82.5,DEU:80.8,CAN:81.5,GBR:80.7,FIN:81.8,NLD:81.5,BEL:81.6,AUT:81.1,DNK:81.5,GRC:80.1,PRT:81.1,USA:77.4,POL:77.5,CHN:78.2,TUR:76.0,SAU:77.9,BRA:75.9,MEX:70.2,RUS:69.4,IRN:76.7,ARG:75.9,VNM:74.6,THA:78.7,COL:73.7,IDN:71.3,PHL:69.3,EGY:70.2,IND:67.3,BGD:72.4,PAK:66.2,ZAF:62.3,KEN:61.4,NGA:53.6,ETH:65.0,COD:59.2,IRQ:70.4,UKR:71.6,AFG:62.0,MMR:65.7,YEM:63.7,SDN:65.3};
  const INTERNET={NOR:99,DNK:99,KOR:97,SWE:98,JPN:84,USA:91,GBR:97,DEU:93,FRA:86,CAN:93,ITA:84,ESP:94,SGP:96,AUS:96,NZL:91,RUS:88,CHN:73,IND:46,BRA:81,MEX:78,ARG:88,KOR2:97,IDN:62,VNM:73,THA:85,PHL:67,EGY:72,SAU:99,UAE2:0,ARE:100,ISR:90,TUR:83,POL:88,ZAF:72,KEN:32,NGA:55,BGD:39,PAK:36,ETH:17,COD:23,IRN:79,IRQ:75,AFG:18};
  /* Capital cities, currencies, primary languages, calling codes — fills the N/A fields */
  const CAPITAL={USA:"Washington, D.C.",CHN:"Beijing",JPN:"Tokyo",DEU:"Berlin",IND:"New Delhi",GBR:"London",FRA:"Paris",ITA:"Rome",BRA:"Brasília",CAN:"Ottawa",RUS:"Moscow",MEX:"Mexico City",AUS:"Canberra",KOR:"Seoul",ESP:"Madrid",IDN:"Jakarta",TUR:"Ankara",NLD:"Amsterdam",SAU:"Riyadh",CHE:"Bern",POL:"Warsaw",TWN:"Taipei",BEL:"Brussels",SWE:"Stockholm",ARG:"Buenos Aires",IRL:"Dublin",NOR:"Oslo",AUT:"Vienna",ISR:"Jerusalem",ARE:"Abu Dhabi",THA:"Bangkok",SGP:"Singapore",BGD:"Dhaka",PHL:"Manila",VNM:"Hanoi",DNK:"Copenhagen",MYS:"Kuala Lumpur",HKG:"Hong Kong",EGY:"Cairo",IRN:"Tehran",ZAF:"Pretoria",COL:"Bogotá",ROU:"Bucharest",CHL:"Santiago",CZE:"Prague",FIN:"Helsinki",PRT:"Lisbon",PER:"Lima",IRQ:"Baghdad",KAZ:"Astana",NZL:"Wellington",GRC:"Athens",QAT:"Doha",DZA:"Algiers",HUN:"Budapest",UKR:"Kyiv",KWT:"Kuwait City",ETH:"Addis Ababa",MAR:"Rabat",SVK:"Bratislava",ECU:"Quito",KEN:"Nairobi",OMN:"Muscat",GTM:"Guatemala City",BGR:"Sofia",VEN:"Caracas",CRI:"San José",LUX:"Luxembourg",PAN:"Panama City",CIV:"Yamoussoukro",HRV:"Zagreb",LTU:"Vilnius",UZB:"Tashkent",TZA:"Dodoma",GHA:"Accra",SRB:"Belgrade",LKA:"Sri Jayawardenepura Kotte",BLR:"Minsk",SVN:"Ljubljana",COD:"Kinshasa",MMR:"Naypyidaw",TKM:"Ashgabat",JOR:"Amman",CMR:"Yaoundé",UGA:"Kampala",TUN:"Tunis",BOL:"Sucre",LBY:"Tripoli",PRY:"Asunción",NPL:"Kathmandu",ZWE:"Harare",CYP:"Nicosia",ISL:"Reykjavík",GEO:"Tbilisi",SEN:"Dakar",KHM:"Phnom Penh",PNG:"Port Moresby",ZMB:"Lusaka",BIH:"Sarajevo",ARM:"Yerevan",LBN:"Beirut",ALB:"Tirana",HTI:"Port-au-Prince",MOZ:"Maputo",YEM:"Sana'a",GAB:"Libreville",BWA:"Gaborone",MLT:"Valletta",BFA:"Ouagadougou",MLI:"Bamako",BEN:"Porto-Novo",PRK:"Pyongyang",MNG:"Ulaanbaatar",NIC:"Managua",NER:"Niamey",MDG:"Antananarivo",MDA:"Chișinău",LAO:"Vientiane",BRN:"Bandar Seri Begawan",MUS:"Port Louis",AFG:"Kabul",RWA:"Kigali",MWI:"Lilongwe",TCD:"N'Djamena",KGZ:"Bishkek",TJK:"Dushanbe",NAM:"Windhoek",SOM:"Mogadishu",CUB:"Havana",SDN:"Khartoum",FJI:"Suva",PAK:"Islamabad",SYR:"Damascus",NGA:"Abuja",AZE:"Baku",ERI:"Asmara",SSD:"Juba",ESH:"El Aaiún",SLE:"Freetown",LBR:"Monrovia",GIN:"Conakry",GNB:"Bissau",GMB:"Banjul",MRT:"Nouakchott",LSO:"Maseru",SWZ:"Mbabane",BDI:"Gitega",DJI:"Djibouti",COM:"Moroni",STP:"São Tomé",GNQ:"Malabo",CAF:"Bangui",CPV:"Praia",AGO:"Luanda",EST:"Tallinn",LVA:"Riga",MKD:"Skopje",MNE:"Podgorica",XKX:"Pristina",AND:"Andorra la Vella",MCO:"Monaco",SMR:"San Marino",VAT:"Vatican City",LIE:"Vaduz",HND:"Tegucigalpa",SLV:"San Salvador",BLZ:"Belmopan",JAM:"Kingston",BHS:"Nassau",TTO:"Port of Spain",BRB:"Bridgetown",DMA:"Roseau",GRD:"St. George's",LCA:"Castries",VCT:"Kingstown",ATG:"St. John's",KNA:"Basseterre",GUY:"Georgetown",SUR:"Paramaribo",URY:"Montevideo",MDV:"Malé",BTN:"Thimphu",TLS:"Dili",VUT:"Port Vila",SLB:"Honiara",WSM:"Apia",TON:"Nukuʻalofa",FSM:"Palikir",PLW:"Ngerulmud",MHL:"Majuro",KIR:"South Tarawa",NRU:"Yaren",TUV:"Funafuti"};
  const CURRENCY={USA:"USD",CHN:"CNY",JPN:"JPY",DEU:"EUR",IND:"INR",GBR:"GBP",FRA:"EUR",ITA:"EUR",BRA:"BRL",CAN:"CAD",RUS:"RUB",MEX:"MXN",AUS:"AUD",KOR:"KRW",ESP:"EUR",IDN:"IDR",TUR:"TRY",NLD:"EUR",SAU:"SAR",CHE:"CHF",POL:"PLN",TWN:"TWD",BEL:"EUR",SWE:"SEK",ARG:"ARS",IRL:"EUR",NOR:"NOK",AUT:"EUR",ISR:"ILS",ARE:"AED",THA:"THB",SGP:"SGD",BGD:"BDT",PHL:"PHP",VNM:"VND",DNK:"DKK",MYS:"MYR",HKG:"HKD",EGY:"EGP",IRN:"IRR",ZAF:"ZAR",COL:"COP",ROU:"RON",CHL:"CLP",CZE:"CZK",FIN:"EUR",PRT:"EUR",PER:"PEN",IRQ:"IQD",KAZ:"KZT",NZL:"NZD",GRC:"EUR",QAT:"QAR",DZA:"DZD",HUN:"HUF",UKR:"UAH",KWT:"KWD",ETH:"ETB",MAR:"MAD",SVK:"EUR",ECU:"USD",KEN:"KES",OMN:"OMR",GTM:"GTQ",BGR:"BGN",VEN:"VES",CRI:"CRC",LUX:"EUR",PAN:"PAB / USD",CIV:"XOF",HRV:"EUR",LTU:"EUR",UZB:"UZS",TZA:"TZS",GHA:"GHS",SRB:"RSD",LKA:"LKR",BLR:"BYN",SVN:"EUR",COD:"CDF",MMR:"MMK",TKM:"TMT",JOR:"JOD",CMR:"XAF",UGA:"UGX",TUN:"TND",BOL:"BOB",LBY:"LYD",PRY:"PYG",NPL:"NPR",ZWE:"ZWG",CYP:"EUR",ISL:"ISK",GEO:"GEL",SEN:"XOF",KHM:"KHR / USD",PNG:"PGK",ZMB:"ZMW",BIH:"BAM",ARM:"AMD",LBN:"LBP",ALB:"ALL",HTI:"HTG",MOZ:"MZN",YEM:"YER",GAB:"XAF",BWA:"BWP",MLT:"EUR",BFA:"XOF",MLI:"XOF",BEN:"XOF",PRK:"KPW",MNG:"MNT",NIC:"NIO",NER:"XOF",MDG:"MGA",MDA:"MDL",LAO:"LAK",BRN:"BND",MUS:"MUR",AFG:"AFN",RWA:"RWF",MWI:"MWK",TCD:"XAF",KGZ:"KGS",TJK:"TJS",NAM:"NAD",SOM:"SOS",CUB:"CUP",SDN:"SDG",FJI:"FJD",PAK:"PKR",SYR:"SYP",NGA:"NGN",AZE:"AZN",ERI:"ERN",SSD:"SSP",EST:"EUR",LVA:"EUR",MKD:"MKD",MNE:"EUR",HND:"HNL",SLV:"USD",BLZ:"BZD",JAM:"JMD",URY:"UYU",GUY:"GYD",SUR:"SRD",MDV:"MVR",BTN:"BTN",TLS:"USD",VUT:"VUV"};
  const LANGS={USA:"English",CHN:"Mandarin",JPN:"Japanese",DEU:"German",IND:"Hindi, English",GBR:"English",FRA:"French",ITA:"Italian",BRA:"Portuguese",CAN:"English, French",RUS:"Russian",MEX:"Spanish",AUS:"English",KOR:"Korean",ESP:"Spanish",IDN:"Indonesian",TUR:"Turkish",NLD:"Dutch",SAU:"Arabic",CHE:"German, French, Italian",POL:"Polish",TWN:"Mandarin",BEL:"Dutch, French, German",SWE:"Swedish",ARG:"Spanish",IRL:"English, Irish",NOR:"Norwegian",AUT:"German",ISR:"Hebrew, Arabic",ARE:"Arabic",THA:"Thai",SGP:"English, Malay, Mandarin, Tamil",BGD:"Bengali",PHL:"Filipino, English",VNM:"Vietnamese",DNK:"Danish",MYS:"Malay",HKG:"Cantonese, English",EGY:"Arabic",IRN:"Persian",ZAF:"11 official langs",COL:"Spanish",ROU:"Romanian",CHL:"Spanish",CZE:"Czech",FIN:"Finnish, Swedish",PRT:"Portuguese",PER:"Spanish",IRQ:"Arabic, Kurdish",KAZ:"Kazakh, Russian",NZL:"English, Māori",GRC:"Greek",QAT:"Arabic",DZA:"Arabic, Berber",HUN:"Hungarian",UKR:"Ukrainian",KWT:"Arabic",ETH:"Amharic",MAR:"Arabic, Berber",SVK:"Slovak",ECU:"Spanish",KEN:"Swahili, English",OMN:"Arabic",GTM:"Spanish",BGR:"Bulgarian",VEN:"Spanish",CRI:"Spanish",LUX:"Luxembourgish, French, German",PAN:"Spanish",CIV:"French",HRV:"Croatian",LTU:"Lithuanian",UZB:"Uzbek",TZA:"Swahili, English",GHA:"English",SRB:"Serbian",LKA:"Sinhala, Tamil",BLR:"Belarusian, Russian",SVN:"Slovene",COD:"French",MMR:"Burmese",TKM:"Turkmen",JOR:"Arabic",CMR:"French, English",UGA:"English, Swahili",TUN:"Arabic",BOL:"Spanish",LBY:"Arabic",PRY:"Spanish, Guaraní",NPL:"Nepali",ZWE:"English + 15 official",CYP:"Greek, Turkish",ISL:"Icelandic",GEO:"Georgian",SEN:"French",KHM:"Khmer",PNG:"Tok Pisin, English",ZMB:"English",BIH:"Bosnian, Croatian, Serbian",ARM:"Armenian",LBN:"Arabic",ALB:"Albanian",HTI:"French, Creole",MOZ:"Portuguese",YEM:"Arabic",GAB:"French",BWA:"English, Setswana",MLT:"Maltese, English",BFA:"French",MLI:"French",BEN:"French",PRK:"Korean",MNG:"Mongolian",NIC:"Spanish",NER:"French",MDG:"Malagasy, French",MDA:"Romanian",LAO:"Lao",BRN:"Malay",MUS:"English, French",AFG:"Pashto, Dari",RWA:"Kinyarwanda, English, French",MWI:"English, Chichewa",TCD:"French, Arabic",KGZ:"Kyrgyz, Russian",TJK:"Tajik",NAM:"English",SOM:"Somali, Arabic",CUB:"Spanish",SDN:"Arabic, English",FJI:"English, Fijian, Hindi",PAK:"Urdu, English",SYR:"Arabic",NGA:"English",AZE:"Azerbaijani",ERI:"Tigrinya, Arabic, English",SSD:"English"};
  const RADIUS_PRESETS=[
    {g:LA("Aircraft (combat radius)","航空機(行動半径)","Flugzeuge (Einsatzradius)","Самолёты (боевой радиус)","Aeronaves (radio de combate)"),items:[["F-16",550],["F-35A",1100],["F-22",850],["Su-57",1500],["B-2 Spirit",11100],["B-52 (range)",14000],["H-6K",3500]]},
    {g:LA("Cruise missiles","巡航ミサイル","Marschflugkörper","Крылатые ракеты","Misiles de crucero"),items:[["Tomahawk",1600],["Storm Shadow",550],["Kalibr",2000],["Kh-101",2500],["Kinzhal",2000]]},
    {g:LA("Ballistic missiles","弾道ミサイル","Ballistische Raketen","Баллистические ракеты","Misiles balísticos"),items:[["ATACMS",300],["Iskander",500],["DF-21D",1500],["DF-26",4000],["Minuteman III",13000],["Trident II",12000]]},
    {g:LA("Air defense","防空","Luftverteidigung","Противовоздушная оборона","Defensa aérea"),items:[["Patriot PAC-3",35],["THAAD",200],["S-400",400]]}
  ];
  /* ============================================================================================
   *  (#R139) COMPANIES — replaces the retired Information tab. A Countries-style, sortable ranking of the world's
   *  largest public companies across various indicators (market cap by default). Reference figures (revenue / net
   *  income / employees / founded) are the LATEST REPORTED values in billions USD; MARKET CAP is LIVE for US-listed
   *  names — shares outstanding × live price via the SAME keyless Yahoo v8 chart endpoint the bottom ticker uses —
   *  and the latest reported snapshot for the rest (non-US listings, honestly labelled). A company logo loads where
   *  the country flag sat in Countries. Wired into Atlas via IntMapOS ('tab.companies'). ======================== */
  const CO_SECTORS={
    tech:LA('Technology','テクノロジー','Technologie','Технологии','Tecnología'),
    semi:LA('Semiconductors','半導体','Halbleiter','Полупроводники','Semiconductores'),
    software:LA('Software','ソフトウェア','Software','ПО','Software'),
    internet:LA('Internet & Media','インターネット・メディア','Internet & Medien','Интернет и медиа','Internet y medios'),
    ecommerce:LA('E-commerce','Eコマース','E-Commerce','Электронная торговля','Comercio electrónico'),
    finance:LA('Financials','金融','Finanzen','Финансы','Finanzas'),
    bank:LA('Banking','銀行','Banken','Банки','Banca'),
    payments:LA('Payments','決済','Zahlungen','Платежи','Pagos'),
    health:LA('Healthcare','ヘルスケア','Gesundheit','Здравоохранение','Salud'),
    pharma:LA('Pharmaceuticals','製薬','Pharma','Фармацевтика','Farmacéutica'),
    energy:LA('Energy','エネルギー','Energie','Энергетика','Energía'),
    consumer:LA('Consumer','消費財','Konsumgüter','Потреб. товары','Consumo'),
    retail:LA('Retail','小売','Einzelhandel','Розничная торговля','Minorista'),
    auto:LA('Automotive','自動車','Automobil','Автопром','Automoción'),
    industrial:LA('Industrials','資本財','Industrie','Промышленность','Industria'),
    telecom:LA('Telecom','通信','Telekom','Телеком','Telecomunicaciones'),
    media:LA('Media','メディア','Medien','Медиа','Medios'),
    aerospace:LA('Aerospace & Defense','航空宇宙・防衛','Luft- & Raumfahrt','Аэрокосмос','Aeroespacial'),
    materials:LA('Materials','素材','Werkstoffe','Материалы','Materiales'),
    staples:LA('Consumer Staples','生活必需品','Basiskonsumgüter','Товары первой необходимости','Bienes básicos')
  };
  const CO_CC={ USA:['United States','アメリカ','🇺🇸'], CHN:['China','中国','🇨🇳'], TWN:['Taiwan','台湾','🇹🇼'], KOR:['South Korea','韓国','🇰🇷'], JPN:['Japan','日本','🇯🇵'], DEU:['Germany','ドイツ','🇩🇪'], FRA:['France','フランス','🇫🇷'], GBR:['United Kingdom','イギリス','🇬🇧'], CHE:['Switzerland','スイス','🇨🇭'], NLD:['Netherlands','オランダ','🇳🇱'], DNK:['Denmark','デンマーク','🇩🇰'], SWE:['Sweden','スウェーデン','🇸🇪'], CAN:['Canada','カナダ','🇨🇦'], AUS:['Australia','オーストラリア','🇦🇺'], SAU:['Saudi Arabia','サウジアラビア','🇸🇦'], IRL:['Ireland','アイルランド','🇮🇪'], IND:['India','インド','🇮🇳'], BRA:['Brazil','ブラジル','🇧🇷'], ESP:['Spain','スペイン','🇪🇸'], ITA:['Italy','イタリア','🇮🇹'], SGP:['Singapore','シンガポール','🇸🇬'], ARG:['Argentina','アルゼンチン','🇦🇷'], MEX:['Mexico','メキシコ','🇲🇽'], BEL:['Belgium','ベルギー','🇧🇪'] };
  /* (#R41) Localize the repeated Information-card badges in DE/RU/ES (acronyms like USN/NATO pass through). The
     curated card bodies stay English/Japanese where no translation exists, but the recurring chrome localizes. */
  const _DASH_BADGE={
    'Chokepoint':LA('Chokepoint','要衝','Engstelle','Узкое место','Punto crítico'),
    'Port':LA('Port','港','Hafen','Порт','Puerto'),
    'Route':LA('Route','航路','Route','Маршрут','Ruta'),
    'Strait':LA('Strait','海峡','Meerenge','Пролив','Estrecho'),
    'Canal':LA('Canal','運河','Kanal','Канал','Canal'),
    'Naval base':LA('Naval base','海軍基地','Marinestützpunkt','Военно-морская база','Base naval'),
    'Air base':LA('Air base','空軍基地','Luftwaffenbasis','Авиабаза','Base aérea'),
    'Base':LA('Base','基地','Stützpunkt','База','Base'),
    'Hub':LA('Hub','拠点','Drehkreuz','Узел','Centro'),
    'Tech hub':LA('Tech hub','技術拠点','Technologiezentrum','Техноцентр','Centro tecnológico'),
    'Spaceport':LA('Spaceport','宇宙基地','Weltraumbahnhof','Космодром','Puerto espacial'),
    'Dam':LA('Dam','ダム','Staudamm','Плотина','Presa'),
    'Pipeline':LA('Pipeline','パイプライン','Pipeline','Трубопровод','Oleoducto'),
    'Nuclear':LA('Nuclear','原子力','Nuklear','Ядерный','Nuclear'),
    'Border':LA('Border','国境','Grenze','Граница','Frontera')
  };
  /* Google News editions. In multi-language mode we pull several foreign editions too, so the
     feed includes non-UI-language headlines (which the AI then translates onto the cards). */
  /* World editions pulled in multi-language mode. The UI-language edition is excluded at build
     time (it is already the base feed), so a JP user also gets English + others and vice-versa. */
  const NEWS_EDITIONS_MULTI=[
    {lang:'en',q:'hl=en-US&gl=US&ceid=US:en'},{lang:'ja',q:'hl=ja&gl=JP&ceid=JP:ja'},
    {lang:'fr',q:'hl=fr&gl=FR&ceid=FR:fr'},{lang:'de',q:'hl=de&gl=DE&ceid=DE:de'},
    {lang:'es',q:'hl=es&gl=ES&ceid=ES:es'},{lang:'pt',q:'hl=pt-BR&gl=BR&ceid=BR:pt-419'},
    {lang:'it',q:'hl=it&gl=IT&ceid=IT:it'},{lang:'ar',q:'hl=ar&gl=EG&ceid=EG:ar'},
    {lang:'ru',q:'hl=ru&gl=RU&ceid=RU:ru'},{lang:'zh',q:'hl=zh-CN&gl=CN&ceid=CN:zh-Hans'},
    {lang:'ko',q:'hl=ko&gl=KR&ceid=KR:ko'}
  ];
  /* National editions for the "News by country media" setting (#29) — keys match NEWS_COUNTRY_FEEDS. */
  const NEWS_COUNTRY_EDITIONS={
    us:'hl=en-US&gl=US&ceid=US:en', gb:'hl=en-GB&gl=GB&ceid=GB:en', jp:'hl=ja&gl=JP&ceid=JP:ja',
    fr:'hl=fr&gl=FR&ceid=FR:fr', de:'hl=de&gl=DE&ceid=DE:de', cn:'hl=zh-CN&gl=CN&ceid=CN:zh-Hans',
    ru:'hl=ru&gl=RU&ceid=RU:ru', in:'hl=en-IN&gl=IN&ceid=IN:en', kr:'hl=ko&gl=KR&ceid=KR:ko',
    il:'hl=he&gl=IL&ceid=IL:he', ua:'hl=uk&gl=UA&ceid=UA:uk', br:'hl=pt-BR&gl=BR&ceid=BR:pt-419',
    au:'hl=en-AU&gl=AU&ceid=AU:en', sa:'hl=ar&gl=SA&ceid=SA:ar', tr:'hl=tr&gl=TR&ceid=TR:tr', eg:'hl=ar&gl=EG&ceid=EG:ar'
  };
  /* Post categories — drive the composer chips, feed filter, card chip and pin color. */
  const COMM_CATEGORIES=[
    { id:'general',  emoji:'💬', color:'#8e8e93', label:LA('General','全般','Allgemein','Общее','General') },
    { id:'conflict', emoji:'⚔️', color:'#ff3b30', label:LA('Conflict','紛争','Konflikt','Конфликт','Conflicto') },
    { id:'military', emoji:'🛡️', color:'#ff9500', label:LA('Military','軍事','Militär','Военное','Militar') },
    { id:'maritime', emoji:'⚓', color:'#30b0c7', label:LA('Maritime','海事','Maritim','Морское','Marítimo') },
    { id:'economy',  emoji:'📈', color:'#34c759', label:LA('Economy','経済','Wirtschaft','Экономика','Economía') },
    { id:'cyber',    emoji:'🖧', color:'#5856d6', label:LA('Cyber','サイバー','Cyber','Кибер','Ciber') },
    { id:'question', emoji:'❓', color:'#007aff', label:LA('Question','質問','Frage','Вопрос','Pregunta') },
    { id:'analysis', emoji:'🔍', color:'#af52de', label:LA('Analysis','分析','Analyse','Анализ','Análisis') }
  ];
  const NEWS_COUNTRY_FEEDS={
    us:{name:LA('United States','アメリカ','Vereinigte Staaten','США','Estados Unidos'),flag:'🇺🇸'}, gb:{name:LA('United Kingdom','イギリス','Vereinigtes Königreich','Великобритания','Reino Unido'),flag:'🇬🇧'},
    jp:{name:LA('Japan','日本','Japan','Япония','Japón'),flag:'🇯🇵'}, fr:{name:LA('France','フランス','Frankreich','Франция','Francia'),flag:'🇫🇷'},
    de:{name:LA('Germany','ドイツ','Deutschland','Германия','Alemania'),flag:'🇩🇪'}, cn:{name:LA('China','中国','China','Китай','China'),flag:'🇨🇳'},
    ru:{name:LA('Russia','ロシア','Russland','Россия','Rusia'),flag:'🇷🇺'}, in:{name:LA('India','インド','Indien','Индия','India'),flag:'🇮🇳'},
    kr:{name:LA('South Korea','韓国','Südkorea','Южная Корея','Corea del Sur'),flag:'🇰🇷'}, il:{name:LA('Israel','イスラエル','Israel','Израиль','Israel'),flag:'🇮🇱'},
    ua:{name:LA('Ukraine','ウクライナ','Ukraine','Украина','Ucrania'),flag:'🇺🇦'}, br:{name:LA('Brazil','ブラジル','Brasilien','Бразилия','Brasil'),flag:'🇧🇷'},
    au:{name:LA('Australia','オーストラリア','Australien','Австралия','Australia'),flag:'🇦🇺'}, sa:{name:LA('Saudi Arabia','サウジ','Saudi-Arabien','Саудовская Аравия','Arabia Saudí'),flag:'🇸🇦'},
    tr:{name:LA('Türkiye','トルコ','Türkei','Турция','Turquía'),flag:'🇹🇷'}, eg:{name:LA('Egypt','エジプト','Ägypten','Египет','Egipto'),flag:'🇪🇬'}
  };
  return {SAT_PROVIDERS,_ORG_GZ,_DEMONYM_GZ,sourceDict,_DERU_GZ,_DERU_DEM,_ES_GZ,_ES_DEM,GDP,HDI,DEM,MILSPEND,LIFE,INTERNET,CAPITAL,CURRENCY,LANGS,RADIUS_PRESETS,CO_SECTORS,CO_CC,_DASH_BADGE,NEWS_EDITIONS_MULTI,NEWS_COUNTRY_EDITIONS,COMM_CATEGORIES,NEWS_COUNTRY_FEEDS};
})();
