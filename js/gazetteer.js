/* ============================================================================
 *  IntMap · Built-in news gazetteer  (#R162)
 * ----------------------------------------------------------------------------
 *  The ALWAYS-present place rows the non-AI news locator falls back on, moved verbatim
 *  out of index.html. Pure data (row = [type,[terms…],lng,lat,nameEn,nameJp]); the
 *  matcher index is still compiled in index.html by rebuildGeoIndex(), and the newer
 *  deterministic scorer lives in js/newsgeo.js.
 * ========================================================================== */
window.IntMapGazetteer=(function(){
  /* === Built-in gazetteer (#11) — a strong, ALWAYS-present set of high-news-frequency places so the
     NON-AI locator can place most stories even with no/limited Supabase geo_pins. Merged with geoRaw
     in rebuildGeoIndex (Supabase entries are layered on top). Row = [type, [match terms…], lng, lat,
     nameEn, nameJp]. Flashpoints outrank cities outrank countries (see TYPE_SCORE/TYPE_LOCAL), so a
     headline naming "Gaza" pins to Gaza rather than the whole of Israel. */
  const _BUILTIN_GZ=[
    /* current flashpoints / contested zones */
    ['flashpoint',['Gaza','ガザ'],34.47,31.50,'Gaza','ガザ'],
    ['flashpoint',['Rafah','ラファ'],34.25,31.29,'Rafah','ラファ'],
    ['flashpoint',['West Bank','ヨルダン川西岸'],35.30,32.00,'West Bank','ヨルダン川西岸'],
    ['flashpoint',['Bakhmut','バフムト'],38.00,48.59,'Bakhmut','バフムト'],
    ['flashpoint',['Donetsk','ドネツク'],37.80,48.00,'Donetsk','ドネツク'],
    ['flashpoint',['Kharkiv','ハルキウ','Kharkov'],36.23,49.99,'Kharkiv','ハルキウ'],
    ['flashpoint',['Zaporizhzhia','ザポリージャ'],35.14,47.84,'Zaporizhzhia','ザポリージャ'],
    ['flashpoint',['Mariupol','マリウポリ'],37.54,47.10,'Mariupol','マリウポリ'],
    ['flashpoint',['Crimea','クリミア'],34.10,45.30,'Crimea','クリミア'],
    ['flashpoint',['Taiwan Strait','台湾海峡'],119.6,24.4,'Taiwan Strait','台湾海峡'],
    ['flashpoint',['South China Sea','南シナ海'],114.0,12.0,'South China Sea','南シナ海'],
    ['flashpoint',['Kashmir','カシミール'],74.8,34.0,'Kashmir','カシミール'],
    ['flashpoint',['Red Sea','紅海'],38.0,20.0,'Red Sea','紅海'],
    ['flashpoint',['Strait of Hormuz','ホルムズ海峡'],56.3,26.6,'Strait of Hormuz','ホルムズ海峡'],
    ['flashpoint',['Golan','ゴラン'],35.75,33.0,'Golan Heights','ゴラン高原'],
    /* capitals & major cities */
    ['city',['Kyiv','キーウ','Kiev','キエフ'],30.52,50.45,'Kyiv','キーウ'],
    ['city',['Moscow','モスクワ'],37.62,55.75,'Moscow','モスクワ'],
    ['city',['Jerusalem','エルサレム'],35.21,31.77,'Jerusalem','エルサレム'],
    ['city',['Tel Aviv','テルアビブ'],34.78,32.08,'Tel Aviv','テルアビブ'],
    ['city',['Beirut','ベイルート'],35.50,33.89,'Beirut','ベイルート'],
    ['city',['Damascus','ダマスカス'],36.30,33.51,'Damascus','ダマスカス'],
    ['city',['Tehran','テヘラン'],51.39,35.69,'Tehran','テヘラン'],
    ['city',['Baghdad','バグダッド'],44.36,33.31,'Baghdad','バグダッド'],
    ['city',['Riyadh','リヤド'],46.72,24.69,'Riyadh','リヤド'],
    ['city',["Sana'a",'サヌア','Sanaa'],44.21,15.35,"Sana'a",'サヌア'],
    ['city',['Cairo','カイロ'],31.24,30.04,'Cairo','カイロ'],
    ['city',['Khartoum','ハルツーム'],32.53,15.50,'Khartoum','ハルツーム'],
    ['city',['Kabul','カブール'],69.18,34.53,'Kabul','カブール'],
    ['city',['Islamabad','イスラマバード'],73.04,33.68,'Islamabad','イスラマバード'],
    ['city',['New Delhi','ニューデリー','Delhi','デリー'],77.21,28.61,'New Delhi','ニューデリー'],
    ['city',['Mumbai','ムンバイ'],72.88,19.08,'Mumbai','ムンバイ'],
    ['city',['Beijing','北京'],116.40,39.90,'Beijing','北京'],
    ['city',['Shanghai','上海'],121.47,31.23,'Shanghai','上海'],
    ['city',['Hong Kong','香港'],114.16,22.28,'Hong Kong','香港'],
    ['city',['Taipei','台北'],121.56,25.03,'Taipei','台北'],
    ['city',['Pyongyang','平壌'],125.76,39.04,'Pyongyang','平壌'],
    ['city',['Seoul','ソウル'],126.98,37.57,'Seoul','ソウル'],
    ['city',['Tokyo','東京'],139.69,35.69,'Tokyo','東京'],
    ['city',['Washington','ワシントン'],-77.04,38.91,'Washington, D.C.','ワシントンD.C.'],
    ['city',['New York','ニューヨーク'],-74.0,40.71,'New York','ニューヨーク'],
    ['city',['London','ロンドン'],-0.12,51.51,'London','ロンドン'],
    ['city',['Paris','パリ'],2.35,48.85,'Paris','パリ'],
    ['city',['Berlin','ベルリン'],13.40,52.52,'Berlin','ベルリン'],
    ['city',['Brussels','ブリュッセル'],4.35,50.85,'Brussels','ブリュッセル'],
    ['city',['Istanbul','イスタンブール'],28.98,41.01,'Istanbul','イスタンブール'],
    ['city',['Ankara','アンカラ'],32.86,39.93,'Ankara','アンカラ'],
    ['city',['Rome','ローマ'],12.50,41.90,'Rome','ローマ'],
    ['city',['Madrid','マドリード'],-3.70,40.42,'Madrid','マドリード'],
    ['city',['Warsaw','ワルシャワ'],21.01,52.23,'Warsaw','ワルシャワ'],
    /* countries (representative point) */
    ['country',['Ukraine','ウクライナ'],31.0,49.0,'Ukraine','ウクライナ'],
    ['country',['Russia','ロシア'],93.0,62.0,'Russia','ロシア'],
    ['country',['Israel','イスラエル'],34.85,31.5,'Israel','イスラエル'],
    ['country',['Palestine','パレスチナ'],35.2,31.9,'Palestine','パレスチナ'],
    ['country',['Iran','イラン'],53.0,32.5,'Iran','イラン'],
    ['country',['Iraq','イラク'],43.7,33.2,'Iraq','イラク'],
    ['country',['Syria','シリア'],38.0,35.0,'Syria','シリア'],
    ['country',['Yemen','イエメン'],47.5,15.5,'Yemen','イエメン'],
    ['country',['Lebanon','レバノン'],35.8,33.9,'Lebanon','レバノン'],
    ['country',['China','中国'],104.0,35.0,'China','中国'],
    ['country',['Taiwan','台湾'],121.0,23.7,'Taiwan','台湾'],
    ['country',['North Korea','北朝鮮'],127.5,40.0,'North Korea','北朝鮮'],
    ['country',['South Korea','韓国'],127.8,36.5,'South Korea','韓国'],
    ['country',['Japan','日本'],138.0,37.0,'Japan','日本'],
    ['country',['India','インド'],79.0,22.0,'India','インド'],
    ['country',['Pakistan','パキスタン'],69.3,30.0,'Pakistan','パキスタン'],
    ['country',['Afghanistan','アフガニスタン'],66.0,34.0,'Afghanistan','アフガニスタン'],
    ['country',['United States','アメリカ','米国'],-98.0,39.0,'United States','アメリカ'],
    ['country',['United Kingdom','イギリス','英国'],-1.5,52.5,'United Kingdom','イギリス'],
    ['country',['France','フランス'],2.2,46.5,'France','フランス'],
    ['country',['Germany','ドイツ'],10.0,51.0,'Germany','ドイツ'],
    ['country',['Turkey','トルコ','Türkiye'],35.0,39.0,'Turkey','トルコ'],
    ['country',['Saudi Arabia','サウジアラビア'],45.0,24.0,'Saudi Arabia','サウジアラビア'],
    ['country',['Egypt','エジプト'],30.0,27.0,'Egypt','エジプト'],
    ['country',['Sudan','スーダン'],30.0,15.5,'Sudan','スーダン'],
    ['country',['Venezuela','ベネズエラ'],-66.0,8.0,'Venezuela','ベネズエラ'],
    ['country',['Poland','ポーランド'],19.5,52.0,'Poland','ポーランド'],
    ['country',['Sahel','サヘル'],10.0,15.0,'Sahel','サヘル'],
    /* (#R25/#28) Aliases the formal country names don't catch — big accuracy win for the non-AI locator. */
    ['country',['U.S.','US','U.S.A.','USA','America','American'],-98.0,39.0,'United States','アメリカ'],
    ['country',['U.K.','UK','Britain','British','Great Britain'],-1.5,52.5,'United Kingdom','イギリス'],
    ['country',['UAE','U.A.E.','Emirates'],54.0,24.0,'United Arab Emirates','アラブ首長国連邦'],
    ['country',['EU','European Union','欧州連合'],4.35,50.85,'European Union','欧州連合'],
    ['country',['DPRK'],127.5,40.0,'North Korea','北朝鮮'],
    ['country',['PRC'],104.0,35.0,'China','中国'],
    /* (#R25/#28) Additional high-news-frequency cities (precise coords) + current flashpoints. */
    ['city',['Dubai','ドバイ'],55.27,25.20,'Dubai','ドバイ'],
    ['city',['Abu Dhabi','アブダビ'],54.37,24.45,'Abu Dhabi','アブダビ'],
    ['city',['Doha','ドーハ'],51.53,25.29,'Doha','ドーハ'],
    ['city',['Jeddah','ジッダ'],39.20,21.49,'Jeddah','ジッダ'],
    ['city',['Aleppo','アレッポ'],37.16,36.20,'Aleppo','アレッポ'],
    ['city',['Mosul','モスル'],43.13,36.34,'Mosul','モスル'],
    ['city',['Kandahar','カンダハル'],65.71,31.61,'Kandahar','カンダハル'],
    ['city',['Karachi','カラチ'],67.01,24.86,'Karachi','カラチ'],
    ['city',['Lahore','ラホール'],74.34,31.55,'Lahore','ラホール'],
    ['city',['Singapore','シンガポール'],103.85,1.29,'Singapore','シンガポール'],
    ['city',['Bangkok','バンコク'],100.50,13.75,'Bangkok','バンコク'],
    ['city',['Jakarta','ジャカルタ'],106.85,-6.21,'Jakarta','ジャカルタ'],
    ['city',['Manila','マニラ'],120.98,14.60,'Manila','マニラ'],
    ['city',['Sydney','シドニー'],151.21,-33.87,'Sydney','シドニー'],
    ['city',['Toronto','トロント'],-79.38,43.65,'Toronto','トロント'],
    ['city',['Los Angeles','ロサンゼルス'],-118.24,34.05,'Los Angeles','ロサンゼルス'],
    ['city',['Chicago','シカゴ'],-87.63,41.88,'Chicago','シカゴ'],
    ['city',['Geneva','ジュネーブ'],6.14,46.20,'Geneva','ジュネーブ'],
    ['city',['Brussels','ブリュッセル'],4.35,50.85,'Brussels','ブリュッセル'],
    ['flashpoint',['Kherson','ヘルソン'],32.62,46.64,'Kherson','ヘルソン'],
    ['flashpoint',['Kursk','クルスク'],36.19,51.73,'Kursk','クルスク'],
    ['flashpoint',['Khan Younis','ハンユニス','Khan Yunis'],34.30,31.34,'Khan Younis','ハンユニス'],
    ['flashpoint',['Lebanon border','南レバノン'],35.4,33.2,'South Lebanon','南レバノン'],
    /* (#R27) Greatly expanded coverage — current conflict/flashpoint cities + high-news-frequency hubs. */
    ['flashpoint',['Odesa','オデーサ','Odessa'],30.73,46.48,'Odesa','オデーサ'],
    ['flashpoint',['Lviv','リヴィウ'],24.03,49.84,'Lviv','リヴィウ'],
    ['flashpoint',['Dnipro','ドニプロ'],35.05,48.46,'Dnipro','ドニプロ'],
    ['flashpoint',['Sumy','スームィ'],34.80,50.91,'Sumy','スームィ'],
    ['flashpoint',['Belgorod','ベルゴロド'],36.59,50.60,'Belgorod','ベルゴロド'],
    ['flashpoint',['Sevastopol','セヴァストポリ'],33.53,44.62,'Sevastopol','セヴァストポリ'],
    ['flashpoint',['Idlib','イドリブ'],36.63,35.93,'Idlib','イドリブ'],
    ['flashpoint',['Homs','ホムス'],36.72,34.73,'Homs','ホムス'],
    ['flashpoint',['Raqqa','ラッカ'],38.99,35.95,'Raqqa','ラッカ'],
    ['flashpoint',['Sanaa','サナア',"Sana'a"],44.21,15.35,'Sanaa','サナア'],
    ['flashpoint',['Hodeidah','ホデイダ','Hudaydah'],42.95,14.80,'Hodeidah','ホデイダ'],
    ['flashpoint',['Aden','アデン'],45.04,12.79,'Aden','アデン'],
    ['flashpoint',['El Fasher','エルファシル','Al-Fashir'],25.35,13.63,'El Fasher','エルファシル'],
    ['flashpoint',['Port Sudan','ポートスーダン'],37.22,19.62,'Port Sudan','ポートスーダン'],
    ['flashpoint',['Goma','ゴマ'],29.23,-1.68,'Goma','ゴマ'],
    ['flashpoint',['Tigray','ティグレ'],38.50,13.50,'Tigray','ティグレ'],
    ['flashpoint',['Nagorno-Karabakh','ナゴルノ・カラバフ','Nagorno Karabakh'],46.75,39.82,'Nagorno-Karabakh','ナゴルノ・カラバフ'],
    ['flashpoint',['Taiwan','台湾'],120.96,23.70,'Taiwan','台湾'],
    ['flashpoint',['Senkaku','尖閣'],123.47,25.74,'Senkaku Islands','尖閣諸島'],
    ['city',['Taipei','台北'],121.56,25.03,'Taipei','台北'],
    ['city',['Pyongyang','平壌'],125.76,39.04,'Pyongyang','平壌'],
    ['city',['Seoul','ソウル'],126.98,37.57,'Seoul','ソウル'],
    ['city',['Baghdad','バグダッド'],44.36,33.31,'Baghdad','バグダッド'],
    ['city',['Riyadh','リヤド'],46.72,24.69,'Riyadh','リヤド'],
    ['city',['Ankara','アンカラ'],32.86,39.93,'Ankara','アンカラ'],
    ['city',['Istanbul','イスタンブール'],28.98,41.01,'Istanbul','イスタンブール'],
    ['city',['Cairo','カイロ'],31.24,30.04,'Cairo','カイロ'],
    ['city',['Khartoum','ハルツーム'],32.53,15.50,'Khartoum','ハルツーム'],
    ['city',['Tripoli','トリポリ'],13.19,32.89,'Tripoli (Libya)','トリポリ'],
    ['city',['Caracas','カラカス'],-66.90,10.49,'Caracas','カラカス'],
    ['city',['Kabul','カブール'],69.18,34.53,'Kabul','カブール'],
    ['city',['Islamabad','イスラマバード'],73.06,33.69,'Islamabad','イスラマバード'],
    ['city',['New Delhi','ニューデリー','Delhi','デリー'],77.21,28.61,'New Delhi','ニューデリー'],
    ['city',['Mumbai','ムンバイ'],72.88,19.08,'Mumbai','ムンバイ'],
    ['city',['Beijing','北京'],116.40,39.90,'Beijing','北京'],
    ['city',['Shanghai','上海'],121.47,31.23,'Shanghai','上海'],
    ['city',['Hong Kong','香港'],114.16,22.28,'Hong Kong','香港'],
    ['city',['Washington','ワシントン','Washington DC','Washington, D.C.'],-77.04,38.91,'Washington, D.C.','ワシントンD.C.'],
    ['city',['Brasília','ブラジリア','Brasilia'],-47.88,-15.79,'Brasília','ブラジリア'],
    ['city',['São Paulo','サンパウロ','Sao Paulo'],-46.63,-23.55,'São Paulo','サンパウロ']
  ];
  /* (#R28) ===== MAJOR coverage expansion for the non-AI news locator =====
     The locator already auto-adds every COUNTRY + its CAPITAL from countryStats, so the real gaps were:
     (1) large NON-capital metros (Lagos, Kolkata, Guangzhou, Osaka, Houston…), (2) subnational regions /
     US states / conflict regions (Donbas, Kurdistan, Xinjiang, Texas, Catalonia…), and (3) government-seat
     metonyms (Kremlin, Pentagon, White House, Downing Street…). Same row format as _BUILTIN_GZ:
     [type, [match terms…], lng, lat, nameEn, nameJp]. Government seats are type 'city' (a precise location
     reference). Word boundaries (Latin) / substring (CJK) are compiled in rebuildGeoIndex. */
  const _EXTRA_GZ=[
    /* — Europe (secondary metros not already covered) — */
    ['city',['Amsterdam','アムステルダム'],4.90,52.37,'Amsterdam','アムステルダム'],
    ['city',['Rotterdam','ロッテルダム'],4.48,51.92,'Rotterdam','ロッテルダム'],
    ['city',['Munich','ミュンヘン','Muenchen'],11.58,48.14,'Munich','ミュンヘン'],
    ['city',['Frankfurt','フランクフルト'],8.68,50.11,'Frankfurt','フランクフルト'],
    ['city',['Hamburg','ハンブルク'],9.99,53.55,'Hamburg','ハンブルク'],
    ['city',['Cologne','ケルン'],6.96,50.94,'Cologne','ケルン'],
    ['city',['Milan','ミラノ','Milano'],9.19,45.46,'Milan','ミラノ'],
    ['city',['Naples','ナポリ','Napoli'],14.27,40.85,'Naples','ナポリ'],
    ['city',['Venice','ベネチア','ヴェネツィア','Venezia'],12.32,45.44,'Venice','ヴェネツィア'],
    ['city',['Barcelona','バルセロナ'],2.17,41.39,'Barcelona','バルセロナ'],
    ['city',['Lisbon','リスボン','Lisboa'],-9.14,38.72,'Lisbon','リスボン'],
    ['city',['Porto','ポルト'],-8.61,41.15,'Porto','ポルト'],
    ['city',['Dublin','ダブリン'],-6.26,53.35,'Dublin','ダブリン'],
    ['city',['Edinburgh','エディンバラ'],-3.19,55.95,'Edinburgh','エディンバラ'],
    ['city',['Manchester','マンチェスター'],-2.24,53.48,'Manchester','マンチェスター'],
    ['city',['Marseille','マルセイユ'],5.37,43.30,'Marseille','マルセイユ'],
    ['city',['Lyon','リヨン'],4.83,45.76,'Lyon','リヨン'],
    ['city',['Stockholm','ストックホルム'],18.07,59.33,'Stockholm','ストックホルム'],
    ['city',['Oslo','オスロ'],10.75,59.91,'Oslo','オスロ'],
    ['city',['Copenhagen','コペンハーゲン'],12.57,55.68,'Copenhagen','コペンハーゲン'],
    ['city',['Helsinki','ヘルシンキ'],24.94,60.17,'Helsinki','ヘルシンキ'],
    ['city',['Athens','アテネ'],23.73,37.98,'Athens','アテネ'],
    ['city',['Vienna','ウィーン','Wien'],16.37,48.21,'Vienna','ウィーン'],
    ['city',['Zurich','チューリッヒ','Zuerich'],8.54,47.37,'Zurich','チューリッヒ'],
    ['city',['Prague','プラハ','Praha'],14.42,50.09,'Prague','プラハ'],
    ['city',['Budapest','ブダペスト'],19.04,47.50,'Budapest','ブダペスト'],
    ['city',['Bucharest','ブカレスト'],26.10,44.43,'Bucharest','ブカレスト'],
    ['city',['Belgrade','ベオグラード'],20.46,44.79,'Belgrade','ベオグラード'],
    ['city',['Zagreb','ザグレブ'],15.98,45.81,'Zagreb','ザグレブ'],
    ['city',['Sofia','ソフィア'],23.32,42.70,'Sofia','ソフィア'],
    ['city',['Sarajevo','サラエボ'],18.41,43.86,'Sarajevo','サラエボ'],
    ['city',['Krakow','クラクフ','Krakow','Cracow'],19.94,50.06,'Krakow','クラクフ'],
    ['city',['Minsk','ミンスク'],27.57,53.90,'Minsk','ミンスク'],
    /* — Russia / Caucasus / Central Asia — */
    ['city',['Saint Petersburg','サンクトペテルブルク','St Petersburg','St. Petersburg'],30.36,59.93,'Saint Petersburg','サンクトペテルブルク'],
    ['city',['Kazan','カザン'],49.12,55.79,'Kazan','カザン'],
    ['city',['Yekaterinburg','エカテリンブルク'],60.61,56.84,'Yekaterinburg','エカテリンブルク'],
    ['city',['Novosibirsk','ノヴォシビルスク'],82.92,55.03,'Novosibirsk','ノヴォシビルスク'],
    ['city',['Vladivostok','ウラジオストク'],131.89,43.12,'Vladivostok','ウラジオストク'],
    ['city',['Sochi','ソチ'],39.73,43.60,'Sochi','ソチ'],
    ['flashpoint',['Grozny','グロズヌイ'],45.70,43.32,'Grozny','グロズヌイ'],
    ['city',['Tbilisi','トビリシ'],44.83,41.72,'Tbilisi','トビリシ'],
    ['city',['Yerevan','エレバン'],44.51,40.18,'Yerevan','エレバン'],
    ['city',['Baku','バクー'],49.87,40.41,'Baku','バクー'],
    ['city',['Almaty','アルマトイ'],76.89,43.24,'Almaty','アルマトイ'],
    ['city',['Tashkent','タシケント'],69.24,41.31,'Tashkent','タシケント'],
    /* — Middle East — */
    ['city',['Amman','アンマン'],35.94,31.95,'Amman','アンマン'],
    ['city',['Ramallah','ラマラ'],35.21,31.90,'Ramallah','ラマラ'],
    ['flashpoint',['Hebron','ヘブロン'],35.10,31.53,'Hebron','ヘブロン'],
    ['flashpoint',['Jenin','ジェニン'],35.30,32.46,'Jenin','ジェニン'],
    ['flashpoint',['Nablus','ナブルス'],35.26,32.22,'Nablus','ナブルス'],
    ['city',['Mecca','メッカ'],39.83,21.42,'Mecca','メッカ'],
    ['city',['Medina','メディナ'],39.61,24.47,'Medina','メディナ'],
    ['city',['Kuwait City','クウェート市'],47.98,29.38,'Kuwait City','クウェート市'],
    ['city',['Muscat','マスカット'],58.41,23.59,'Muscat','マスカット'],
    ['city',['Manama','マナーマ'],50.59,26.23,'Manama','マナーマ'],
    ['flashpoint',['Basra','バスラ'],47.78,30.51,'Basra','バスラ'],
    ['flashpoint',['Erbil','アルビル','Irbil'],44.01,36.19,'Erbil','アルビル'],
    ['flashpoint',['Kirkuk','キルクーク'],44.39,35.47,'Kirkuk','キルクーク'],
    ['flashpoint',['Deir ez-Zor','デリゾール','Deir ez Zor'],40.15,35.34,'Deir ez-Zor','デリゾール'],
    ['city',['Latakia','ラタキア'],35.78,35.52,'Latakia','ラタキア'],
    ['city',['Gaziantep','ガジアンテプ'],37.38,37.07,'Gaziantep','ガジアンテプ'],
    ['city',['Izmir','イズミル'],27.14,38.42,'Izmir','イズミル'],
    ['city',['Isfahan','イスファハン','Esfahan'],51.68,32.65,'Isfahan','イスファハン'],
    ['city',['Mashhad','マシュハド'],59.61,36.30,'Mashhad','マシュハド'],
    ['flashpoint',['Tabriz','タブリーズ'],46.29,38.08,'Tabriz','タブリーズ'],
    ['city',['Shiraz','シーラーズ'],52.53,29.59,'Shiraz','シーラーズ'],
    /* — Africa (major non-capitals / hotspots) — */
    ['city',['Lagos','ラゴス'],3.38,6.52,'Lagos','ラゴス'],
    ['city',['Kano','カノ'],8.52,12.00,'Kano','カノ'],
    ['city',['Casablanca','カサブランカ'],-7.59,33.57,'Casablanca','カサブランカ'],
    ['city',['Marrakech','マラケシュ','Marrakesh'],-7.98,31.63,'Marrakech','マラケシュ'],
    ['flashpoint',['Benghazi','ベンガジ'],20.07,32.12,'Benghazi','ベンガジ'],
    ['city',['Alexandria','アレクサンドリア'],29.92,31.20,'Alexandria','アレクサンドリア'],
    ['city',['Johannesburg','ヨハネスブルグ'],28.05,-26.20,'Johannesburg','ヨハネスブルグ'],
    ['city',['Cape Town','ケープタウン'],18.42,-33.92,'Cape Town','ケープタウン'],
    ['city',['Durban','ダーバン'],31.02,-29.86,'Durban','ダーバン'],
    ['city',['Mombasa','モンバサ'],39.66,-4.04,'Mombasa','モンバサ'],
    ['city',['Dar es Salaam','ダルエスサラーム'],39.28,-6.79,'Dar es Salaam','ダルエスサラーム'],
    ['city',['Douala','ドゥアラ'],9.77,4.05,'Douala','ドゥアラ'],
    /* — South / Southeast / East Asia (major non-capitals) — */
    ['city',['Chittagong','チッタゴン'],91.78,22.36,'Chittagong','チッタゴン'],
    ['city',['Peshawar','ペシャワール'],71.58,34.01,'Peshawar','ペシャワール'],
    ['flashpoint',['Quetta','クエッタ'],67.00,30.18,'Quetta','クエッタ'],
    ['city',['Rawalpindi','ラワルピンディ'],73.07,33.60,'Rawalpindi','ラワルピンディ'],
    ['city',['Kolkata','コルカタ','Calcutta'],88.36,22.57,'Kolkata','コルカタ'],
    ['city',['Chennai','チェンナイ','Madras'],80.27,13.08,'Chennai','チェンナイ'],
    ['city',['Bengaluru','ベンガルール','Bangalore'],77.59,12.97,'Bengaluru','ベンガルール'],
    ['city',['Hyderabad','ハイデラバード'],78.47,17.38,'Hyderabad','ハイデラバード'],
    ['city',['Ahmedabad','アーメダバード'],72.57,23.03,'Ahmedabad','アーメダバード'],
    ['city',['Pune','プネー'],73.86,18.52,'Pune','プネー'],
    ['flashpoint',['Srinagar','スリナガル'],74.80,34.08,'Srinagar','スリナガル'],
    ['city',['Guangzhou','広州'],113.26,23.13,'Guangzhou','広州'],
    ['city',['Shenzhen','深圳','深セン'],114.06,22.54,'Shenzhen','深圳'],
    ['city',['Chengdu','成都'],104.07,30.57,'Chengdu','成都'],
    ['city',['Chongqing','重慶'],106.55,29.56,'Chongqing','重慶'],
    ['city',['Wuhan','武漢'],114.30,30.59,'Wuhan','武漢'],
    ['city',["Xi'an",'西安'],108.95,34.27,"Xi'an",'西安'],
    ['city',['Tianjin','天津'],117.36,39.34,'Tianjin','天津'],
    ['flashpoint',['Urumqi','ウルムチ'],87.62,43.83,'Urumqi','ウルムチ'],
    ['flashpoint',['Lhasa','ラサ'],91.17,29.65,'Lhasa','ラサ'],
    ['city',['Macau','マカオ','Macao'],113.54,22.20,'Macau','マカオ'],
    ['city',['Kaohsiung','高雄'],120.31,22.63,'Kaohsiung','高雄'],
    ['city',['Busan','釜山','Pusan'],129.08,35.18,'Busan','釜山'],
    ['city',['Incheon','仁川'],126.71,37.46,'Incheon','仁川'],
    ['city',['Osaka','大阪'],135.50,34.69,'Osaka','大阪'],
    ['city',['Kyoto','京都'],135.77,35.01,'Kyoto','京都'],
    ['city',['Nagoya','名古屋'],136.91,35.18,'Nagoya','名古屋'],
    ['city',['Yokohama','横浜'],139.64,35.44,'Yokohama','横浜'],
    ['city',['Fukuoka','福岡'],130.40,33.59,'Fukuoka','福岡'],
    ['city',['Hiroshima','広島'],132.46,34.39,'Hiroshima','広島'],
    ['city',['Sapporo','札幌'],141.35,43.06,'Sapporo','札幌'],
    ['city',['Okinawa','沖縄','Naha','那覇'],127.68,26.21,'Okinawa','沖縄'],
    ['city',['Ho Chi Minh City','ホーチミン','Saigon'],106.66,10.82,'Ho Chi Minh City','ホーチミン'],
    ['city',['Da Nang','ダナン'],108.22,16.05,'Da Nang','ダナン'],
    ['city',['Kuala Lumpur','クアラルンプール'],101.69,3.14,'Kuala Lumpur','クアラルンプール'],
    ['city',['Surabaya','スラバヤ'],112.75,-7.26,'Surabaya','スラバヤ'],
    ['city',['Cebu','セブ'],123.89,10.32,'Cebu','セブ'],
    ['city',['Davao','ダバオ'],125.61,7.07,'Davao','ダバオ'],
    ['flashpoint',['Mandalay','マンダレー'],96.08,21.97,'Mandalay','マンダレー'],
    /* — Americas (major non-capitals) — */
    ['city',['Guadalajara','グアダラハラ'],-103.35,20.67,'Guadalajara','グアダラハラ'],
    ['city',['Monterrey','モンテレイ'],-100.32,25.69,'Monterrey','モンテレイ'],
    ['flashpoint',['Tijuana','ティファナ'],-117.04,32.51,'Tijuana','ティファナ'],
    ['flashpoint',['Ciudad Juarez','シウダー・フアレス','Ciudad Juárez'],-106.49,31.74,'Ciudad Juarez','シウダー・フアレス'],
    ['city',['Rio de Janeiro','リオデジャネイロ'],-43.20,-22.91,'Rio de Janeiro','リオデジャネイロ'],
    ['city',['Medellin','メデジン','Medellín'],-75.56,6.24,'Medellin','メデジン'],
    ['city',['Guayaquil','グアヤキル'],-79.89,-2.19,'Guayaquil','グアヤキル'],
    ['city',['Houston','ヒューストン'],-95.37,29.76,'Houston','ヒューストン'],
    ['city',['Miami','マイアミ'],-80.19,25.76,'Miami','マイアミ'],
    ['city',['Atlanta','アトランタ'],-84.39,33.75,'Atlanta','アトランタ'],
    ['city',['Boston','ボストン'],-71.06,42.36,'Boston','ボストン'],
    ['city',['Seattle','シアトル'],-122.33,47.61,'Seattle','シアトル'],
    ['city',['San Francisco','サンフランシスコ'],-122.42,37.77,'San Francisco','サンフランシスコ'],
    ['city',['Dallas','ダラス'],-96.80,32.78,'Dallas','ダラス'],
    ['city',['Philadelphia','フィラデルフィア'],-75.16,39.95,'Philadelphia','フィラデルフィア'],
    ['city',['Detroit','デトロイト'],-83.05,42.33,'Detroit','デトロイト'],
    ['city',['Montreal','モントリオール','Montréal'],-73.57,45.50,'Montreal','モントリオール'],
    ['city',['Vancouver','バンクーバー'],-123.12,49.28,'Vancouver','バンクーバー'],
    /* — Oceania — */
    ['city',['Melbourne','メルボルン'],144.96,-37.81,'Melbourne','メルボルン'],
    ['city',['Brisbane','ブリスベン'],153.03,-27.47,'Brisbane','ブリスベン'],
    ['city',['Perth','パース'],115.86,-31.95,'Perth','パース'],
    ['city',['Auckland','オークランド'],174.76,-36.85,'Auckland','オークランド'],
    /* — Subnational regions / US states / conflict regions (type 'city' so they out-rank a bare country) — */
    ['city',['Donbas','ドンバス','Donbass'],37.80,48.30,'Donbas','ドンバス'],
    ['city',['Kurdistan','クルディスタン'],44.0,36.5,'Kurdistan','クルディスタン'],
    ['city',['Xinjiang','新疆','ウイグル'],85.0,41.0,'Xinjiang','新疆'],
    ['city',['Tibet','チベット'],88.0,31.5,'Tibet','チベット'],
    ['city',['Catalonia','カタルーニャ','Catalunya'],1.5,41.8,'Catalonia','カタルーニャ'],
    ['city',['Bavaria','バイエルン','Bayern'],11.5,48.8,'Bavaria','バイエルン'],
    ['city',['Sicily','シチリア','Sicilia'],14.0,37.5,'Sicily','シチリア'],
    ['city',['Siberia','シベリア'],90.0,60.0,'Siberia','シベリア'],
    ['city',['Punjab','パンジャブ'],75.0,31.0,'Punjab','パンジャブ'],
    ['city',['Balochistan','バロチスタン','Baluchistan'],65.0,28.0,'Balochistan','バロチスタン'],
    ['city',['Darfur','ダルフール'],24.0,13.5,'Darfur','ダルフール'],
    ['city',['California','カリフォルニア'],-119.4,36.8,'California','カリフォルニア'],
    ['city',['Texas','テキサス'],-99.0,31.5,'Texas','テキサス'],
    ['city',['Florida','フロリダ'],-81.5,28.0,'Florida','フロリダ'],
    ['city',['Alaska','アラスカ'],-152.0,64.0,'Alaska','アラスカ'],
    ['city',['Hawaii','ハワイ'],-156.3,20.8,'Hawaii','ハワイ'],
    /* — Government-seat metonyms (a precise location reference, NOT docked) — */
    ['city',['Kremlin','クレムリン'],37.62,55.75,'Kremlin','クレムリン'],
    ['city',['Pentagon','ペンタゴン','米国防総省'],-77.06,38.87,'Pentagon','ペンタゴン'],
    ['city',['White House','ホワイトハウス'],-77.04,38.90,'White House','ホワイトハウス'],
    ['city',['Downing Street','ダウニング街'],-0.13,51.50,'Downing Street','ダウニング街'],
    ['city',['Capitol Hill'],-77.01,38.89,'Capitol Hill','米連邦議会'],
    ['city',['Zhongnanhai','中南海'],116.38,39.91,'Zhongnanhai','中南海'],
    ['city',['Blue House','青瓦台'],126.97,37.59,'Blue House','青瓦台'],
    ['city',['Elysee','エリゼ宮','Élysée'],2.32,48.87,'Elysee','エリゼ宮'],
    /* (#R29) Strengthened fallback locator: maritime/strait flashpoints, contested regions and the war
       cities that dominate world headlines (the AI is primary now; these raise the FALLBACK's coverage
       for non-en/jp items, time-travel/search, and any AI outage). */
    ['flashpoint',['Strait of Hormuz','ホルムズ海峡'],56.5,26.6,'Strait of Hormuz','ホルムズ海峡'],
    ['flashpoint',['Taiwan Strait','台湾海峡'],119.5,24.5,'Taiwan Strait','台湾海峡'],
    ['flashpoint',['South China Sea','南シナ海'],114.0,15.0,'South China Sea','南シナ海'],
    ['flashpoint',['Suez Canal','スエズ運河'],32.35,30.7,'Suez Canal','スエズ運河'],
    ['flashpoint',['Bab el-Mandeb','バブ・エル・マンデブ'],43.33,12.58,'Bab el-Mandeb','バブ・エル・マンデブ'],
    ['flashpoint',['Golan Heights','ゴラン高原'],35.74,32.95,'Golan Heights','ゴラン高原'],
    ['flashpoint',['West Bank','ヨルダン川西岸'],35.30,31.95,'West Bank','ヨルダン川西岸'],
    ['flashpoint',['Nagorno-Karabakh','ナゴルノ・カラバフ','Artsakh'],46.75,39.82,'Nagorno-Karabakh','ナゴルノ・カラバフ'],
    ['city',['Kashmir','カシミール'],76.0,34.0,'Kashmir','カシミール'],
    ['city',['Kaliningrad','カリーニングラード'],20.51,54.71,'Kaliningrad','カリーニングラード'],
    ['city',['Transnistria','沿ドニエストル'],29.48,46.84,'Transnistria','沿ドニエストル'],
    ['flashpoint',['Zaporizhzhia','ザポリージャ'],35.14,47.84,'Zaporizhzhia','ザポリージャ'],
    ['flashpoint',['Kherson','ヘルソン'],32.62,46.64,'Kherson','ヘルソン'],
    ['flashpoint',['Bakhmut','バフムート'],38.0,48.6,'Bakhmut','バフムート'],
    ['flashpoint',['Avdiivka','アウディーイウカ'],37.74,48.14,'Avdiivka','アウディーイウカ'],
    ['city',['Kursk','クルスク'],36.19,51.73,'Kursk','クルスク'],
    ['city',['Sevastopol','セヴァストポリ'],33.52,44.60,'Sevastopol','セヴァストポリ'],
    ['city',['Aleppo','アレッポ'],37.16,36.20,'Aleppo','アレッポ'],
    ['flashpoint',['Idlib','イドリブ'],36.63,35.93,'Idlib','イドリブ'],
    ['city',['Mosul','モスル'],43.13,36.34,'Mosul','モスル'],
    ['city',['Kandahar','カンダハル'],65.71,31.61,'Kandahar','カンダハル'],
    ['flashpoint',['Hodeidah','ホデイダ','Al Hudaydah'],42.95,14.80,'Hodeidah','ホデイダ'],
    ['city',['Tigray','ティグレ'],38.5,14.0,'Tigray','ティグレ'],
    ['city',['Goma','ゴマ'],29.22,-1.68,'Goma','ゴマ'],
    ['city',['Port Sudan','ポートスーダン'],37.22,19.62,'Port Sudan','ポートスーダン']
  ];
  /* ══ (#R198) THE LONG TAIL — data/gazetteer-world.json ═══════════════════════════════════════
     「Gazetteerを今の10倍の網羅性に。」

     The 334 rows above are the places world news is ABOUT and they are unchanged: hand-checked
     coordinates, hand-written Japanese, and a type (`flashpoint` outranks `city` outranks `country`)
     that the scorer depends on. Ten times that many rows cannot be written by hand and should not
     be — so the rest of the world arrives from the published sources instead, built by
     scripts/build-gazetteer.mjs (GeoNames CC BY 4.0 for the places, Wikidata CC0 for the names in
     ja/de/ru/es) and read here.

     ⚠ IT IS FETCHED, NOT BUNDLED, AND THAT IS THE WHOLE DESIGN. #R195 got the startup transfer to
     189 KB; putting a 200 KB table in the module graph would undo that for a feature nobody has
     asked for yet on the first frame. So this file loads on first NEED — the news locator starting
     a pass, or the search box being used — the same shape as js/land-mask.js and js/bathymetry.js.
     Until then the app behaves exactly as it did, because the curated rows are still synchronous.

     ⚠ AND IT IS ADDITIVE ONLY. A world row whose name is already a curated surface form was dropped
     at BUILD time, so nothing here can move a place the curated table already knows. The rows enter
     the deterministic engine through IntMapNewsGeo.register(), which files them at rank 3 — below
     everything curated — for the same reason. */
  const WORLD_URL=(function(){ try{ return new URL('data/gazetteer-world.json',
    (window.IM_HOST&&window.IM_HOST.base)||document.baseURI).toString(); }catch(_){ return 'data/gazetteer-world.json'; } })();
  let _worldRows=null, _worldPromise=null, _worldMeta=null;
  /* population → the same `type` vocabulary the curated rows use. A city of two million and a town
     of twenty thousand are not the same claim about a headline, and the scorer already knows how to
     rank `city` above `country`; this is the only judgement the conversion makes. */
  function _rowsFrom(doc){
    const out=[];
    for(const r of (doc&&doc.rows)||[]){
      const en=r[0], ja=r[1], lng=+r[3], lat=+r[4], pop=+r[5]||0, alt=r[6]||[];
      if(!en||!isFinite(lng)||!isFinite(lat)) continue;
      const terms=[en]; if(ja) terms.push(ja);
      for(const a of alt){ if(a&&terms.indexOf(a)<0) terms.push(a); }
      out.push([pop>=250000?'city':'town', terms, lng, lat, en, ja||en]);
    }
    return out;
  }
  /* Resolves to the row array (possibly empty — a build that was never run, or an offline session,
     is a smaller gazetteer and not a broken one). Never rejects, and never fetches twice. */
  function warm(){
    if(_worldPromise) return _worldPromise;
    _worldPromise=(async()=>{
      try{
        const r=await fetch(WORLD_URL,{cache:'force-cache'});
        if(!r.ok) throw new Error('HTTP '+r.status);
        const doc=await r.json();
        _worldMeta={v:doc.v,built:doc.built,attribution:doc.attribution,count:(doc.rows||[]).length};
        _worldRows=_rowsFrom(doc);
      }catch(e){ _worldRows=[]; try{ console.warn('[IntMap] world gazetteer unavailable —',e.message); }catch(_){} }
      try{ window.dispatchEvent(new Event('intmap-gazetteer-world')); }catch(_){}
      return _worldRows;
    })();
    return _worldPromise;
  }
  /* (#R198) …and the matcher-shaped index built from all three sets. It lived as one expression in
     js/app-body.js, which could only ever see the two synchronous ones; it is here now because THIS
     file is what knows when a third arrives. Memoised, invalidated exactly once (when the world rows
     land), so `HOST.BUILTIN_GAZETTEER` stays the free property read every caller treats it as. */
  let _index=null;
  function index(){
    if(_index) return _index;
    const acc={};
    const feed=(rows)=>{ for(const [type,terms,lng,lat,en,jp] of rows){ (acc[type]=acc[type]||[]).push({terms,loc:[lng,lat],name:{en,jp}}); } };
    feed(_BUILTIN_GZ); feed(_EXTRA_GZ); if(_worldRows&&_worldRows.length) feed(_worldRows);
    _index=acc; return acc;
  }
  try{ window.addEventListener('intmap-gazetteer-world',()=>{ _index=null; }); }catch(_){}
  return { builtin:_BUILTIN_GZ, extra:_EXTRA_GZ, warm, index,
    world:()=>_worldRows, worldMeta:()=>_worldMeta, worldUrl:WORLD_URL, _rowsFrom };
})();
