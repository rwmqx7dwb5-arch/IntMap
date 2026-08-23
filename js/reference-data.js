/* ============================================================================
 *  IntMap · Reference data tables  (#R162)
 * ----------------------------------------------------------------------------
 *  Two pure reference tables moved verbatim out of index.html:
 *    • dashCards    — the built-in dashboard cards (DEFAULT_DASH_CARDS + its _dc helper)
 *    • dataSources  — the attribution / data-source registry shown in the Sources modal
 *  Editing a data source here must still keep the attribution + terms text accurate.
 * ========================================================================== */
window.IntMapRefData=(function(){
  const _dc=(id,cat,type,lng,lat,en,jp,ben,bjp,wiki,badge)=>({id,cat,type,loc:[lng,lat],img:'',badge:badge||'',title:{en,jp},body:{en:ben,jp:bjp},wiki:wiki?{en:'https://en.wikipedia.org/wiki/'+wiki,jp:'https://ja.wikipedia.org/wiki/'+wiki}:null});
  const DEFAULT_DASH_CARDS=[
    _dc('d-ramstein','mil','mil',7.6,49.44,'Ramstein Air Base','ラムシュタイン空軍基地','Largest US Air Force base in Europe and USAFE/NATO air command hub.','在欧米空軍とNATO航空作戦の中枢。','Ramstein_Air_Base','USAF'),
    _dc('d-diego','mil','mil',72.41,-7.31,'Diego Garcia','ディエゴガルシア','Strategic US-UK naval & air base in the central Indian Ocean.','インド洋中央の米英の戦略拠点。','Diego_Garcia','US/UK'),
    _dc('d-humphreys','mil','mil',127.02,36.96,'Camp Humphreys','キャンプ・ハンフリーズ','Largest overseas US military base, anchoring deterrence on the Korean Peninsula.','米軍最大の海外基地。朝鮮半島の抑止の要。','Camp_Humphreys','USFK'),
    _dc('d-kaliningrad','mil','mil',20.51,54.71,'Kaliningrad','カリーニングラード','Russian exclave bristling with A2/AD systems between Poland and Lithuania.','A2/AD能力を集中させたロシアの飛び地。','Kaliningrad','RU'),
    _dc('d-pearl','mil','mil',-157.96,21.36,'Pearl Harbor','真珠湾','Headquarters of the US Pacific Fleet.','米太平洋艦隊の母港。','Pearl_Harbor','USN'),
    _dc('d-guam','mil','mil',144.92,13.58,'Andersen AFB, Guam','アンダーセン空軍基地','Forward US bomber & power-projection hub on the 2nd island chain.','第二列島線の米爆撃機・戦力投射拠点。','Andersen_Air_Force_Base','USAF'),
    _dc('d-sevastopol','mil','mil',33.53,44.62,'Sevastopol','セヴァストポリ','Home of Russia’s Black Sea Fleet in contested Crimea.','ロシア黒海艦隊の母港（クリミア）。','Sevastopol','RU Navy'),
    _dc('d-tartus','mil','maritime',35.88,34.9,'Tartus Naval Base','タルトゥース海軍基地','Russia’s only Mediterranean naval facility.','ロシア唯一の地中海海軍拠点。','Tartus','RU Navy'),
    _dc('d-incirlik','mil','mil',35.43,37.0,'İncirlik Air Base','インジルリク空軍基地','NATO air base in Türkiye hosting US nuclear-capable forces.','米核戦力も展開するトルコのNATO基地。','Incirlik_Air_Base','NATO'),
    _dc('d-thule','mil','space',-68.7,76.53,'Pituffik (Thule)','ピツフィク基地','Northernmost US base; missile-warning & space surveillance radar.','米最北の基地。ミサイル警戒・宇宙監視。','Pituffik_Space_Base','USSF'),
    _dc('d-severomorsk','mil','mil',33.42,69.07,'Severomorsk','セヴェロモルスク','Headquarters of Russia’s Northern Fleet and SSBN bastion.','ロシア北方艦隊・SSBNの拠点。','Severomorsk','RU Navy'),
    _dc('d-siachen','mil','mil',77.0,35.3,'Siachen Glacier','シアチェン氷河','World’s highest militarised zone, contested by India & Pakistan.','印パが対峙する世界最高所の軍事地帯。','Siachen_Glacier','Disputed'),
    _dc('d-fierycross','mil','maritime',112.89,9.55,'Fiery Cross Reef','永暑礁','Militarised Chinese artificial island in the Spratlys.','南沙諸島の中国の人工島・軍事拠点。','Fiery_Cross_Reef','PLA'),
    _dc('d-svalbard','geo','geo',15.6,78.22,'Svalbard','スヴァールバル','Arctic archipelago under a unique demilitarised treaty regime.','独特の非武装条約下にある北極の群島。','Svalbard','Arctic'),
    _dc('d-svm','tech','tech',-122.08,37.39,'Silicon Valley','シリコンバレー','Global epicenter of semiconductors, software and venture capital.','半導体・ソフト・VCの世界的中心地。','Silicon_Valley','Tech'),
    _dc('d-hsinchu','tech','tech',120.99,24.78,'Hsinchu Science Park','新竹サイエンスパーク','Heart of Taiwan’s chip industry — home of TSMC fabs.','台湾半導体の中心。TSMCの拠点。','Hsinchu_Science_Park','Semis'),
    _dc('d-shenzhen','tech','tech',114.06,22.54,'Shenzhen','深セン','China’s hardware & electronics manufacturing powerhouse.','中国のハードウェア製造の中枢。','Shenzhen','Tech'),
    _dc('d-bangalore','tech','tech',77.59,12.97,'Bengaluru','ベンガルール','India’s IT & software services capital.','インドのIT・ソフト産業の中心。','Bangalore','IT'),
    _dc('d-ftmeade','tech','tech',-76.77,39.11,'Fort Meade (NSA)','フォート・ミード（NSA）','US National Security Agency & Cyber Command headquarters.','米NSA・サイバー軍の本拠地。','Fort_Meade','SIGINT'),
    _dc('d-zgc','tech','tech',116.31,39.98,'Zhongguancun','中関村','Beijing’s “Silicon Valley” tech district.','北京のハイテク集積地。','Zhongguancun','Tech'),
    _dc('d-cern','tech','tech',6.05,46.23,'CERN','CERN','World’s largest particle-physics laboratory (LHC).','世界最大の素粒子物理研究所（LHC）。','CERN','Science'),
    _dc('d-pinegap','tech','space',133.74,-23.8,'Pine Gap','パインギャップ','US-Australia satellite intelligence ground station.','米豪の衛星情報地上局。','Pine_Gap','Intel'),
    _dc('d-canaveral','tech','space',-80.6,28.49,'Cape Canaveral','ケープカナベラル','Primary US east-coast spaceport.','米東海岸の主要宇宙基地。','Cape_Canaveral_Space_Force_Station','Space'),
    _dc('d-baikonur','tech','space',63.34,45.92,'Baikonur Cosmodrome','バイコヌール宇宙基地','World’s oldest & largest operational spaceport (Russia/Kazakhstan).','世界最古・最大の運用中の宇宙基地。','Baikonur_Cosmodrome','Space'),
    _dc('d-jiuquan','tech','space',100.29,40.96,'Jiuquan','酒泉衛星発射センター','China’s crewed-spaceflight launch center.','中国の有人宇宙飛行の発射拠点。','Jiuquan_Satellite_Launch_Center','Space'),
    _dc('d-kourou','tech','space',-52.77,5.24,'Guiana Space Center','ギアナ宇宙センター','Europe’s spaceport near the equator (Kourou).','赤道近くの欧州の宇宙基地（クールー）。','Guiana_Space_Center','ESA'),
    _dc('d-vandenberg','tech','space',-120.6,34.74,'Vandenberg SFB','ヴァンデンバーグ','US polar-orbit launches & missile testing.','米の極軌道打上げ・ミサイル試験。','Vandenberg_Space_Force_Base','USSF'),
    _dc('d-tanegashima','tech','space',130.97,30.39,'Tanegashima','種子島宇宙センター','Japan’s main rocket launch site.','日本の主要ロケット発射場。','Tanegashima_Space_Center','JAXA'),
    _dc('d-sriharikota','tech','space',80.23,13.72,'Satish Dhawan (Sriharikota)','サティシュ・ダワン','India’s spaceport (ISRO).','インドの宇宙基地（ISRO）。','Satish_Dhawan_Space_Center','ISRO'),
    _dc('d-hormuz','maritime','choke',56.3,26.57,'Strait of Hormuz','ホルムズ海峡','~20% of global oil passes this 33 km-wide chokepoint.','世界石油の約2割が通る要衝。','Strait_of_Hormuz','Chokepoint'),
    _dc('d-malacca','maritime','choke',100.4,2.5,'Strait of Malacca','マラッカ海峡','Vital Asia–Europe shipping lane; ~25% of traded goods.','アジア欧州を結ぶ最重要航路。','Strait_of_Malacca','Chokepoint'),
    _dc('d-suez','maritime','choke',32.35,30.6,'Suez Canal','スエズ運河','Egypt’s canal linking the Mediterranean and Red Sea.','地中海と紅海を結ぶ運河。','Suez_Canal','Chokepoint'),
    _dc('d-panama','maritime','choke',-79.7,9.1,'Panama Canal','パナマ運河','Atlantic–Pacific shortcut; drought-sensitive.','大西洋と太平洋を結ぶ運河。','Panama_Canal','Chokepoint'),
    _dc('d-babmandeb','maritime','choke',43.35,12.6,'Bab-el-Mandeb','バブ・エル・マンデブ海峡','Red Sea gateway flanked by Yemen & the Horn of Africa.','紅海の玄関口。','Bab-el-Mandeb','Chokepoint'),
    _dc('d-bosphorus','maritime','choke',29.0,41.1,'Bosphorus','ボスポラス海峡','Türkiye’s strait controlling Black Sea access.','黒海への出入りを制御する海峡。','Bosporus','Chokepoint'),
    _dc('d-shanghaiport','maritime','maritime',121.8,30.6,'Port of Shanghai','上海港','World’s busiest container port.','世界最大のコンテナ港。','Port_of_Shanghai','Port'),
    _dc('d-singaporeport','maritime','maritime',103.8,1.26,'Port of Singapore','シンガポール港','Premier global transshipment hub.','世界有数の中継貿易港。','Port_of_Singapore','Port'),
    _dc('d-rotterdam','maritime','maritime',4.4,51.95,'Port of Rotterdam','ロッテルダム港','Europe’s largest seaport.','欧州最大の港湾。','Port_of_Rotterdam','Port'),
    _dc('d-gwadar','maritime','maritime',62.32,25.12,'Gwadar Port','グワダル港','China-backed deep-water port on the Arabian Sea (CPEC).','中国支援のアラビア海深水港（CPEC）。','Gwadar_Port','BRI'),
    _dc('d-hambantota','maritime','maritime',81.1,6.12,'Hambantota Port','ハンバントタ港','Sri Lankan port leased to China for 99 years.','中国に99年租借されたスリランカの港。','Port_of_Hambantota','BRI'),
    _dc('d-djibouti','maritime','maritime',43.15,11.6,'Djibouti','ジブチ','Hosts US, French, Japanese & Chinese bases at a key chokepoint.','米仏日中の基地が集まる要衝。','Djibouti','Bases'),
    _dc('d-ghawar','geo','energy',49.3,25.4,'Ghawar Oil Field','ガワール油田','World’s largest conventional oil field (Saudi Arabia).','世界最大の在来型油田。','Ghawar_Field','Oil'),
    _dc('d-rastanura','geo','energy',50.16,26.64,'Ras Tanura','ラスタヌラ','One of the world’s largest oil-export terminals.','世界最大級の石油積出港。','Ras_Tanura','Oil'),
    _dc('d-nordstream','geo','energy',13.6,54.1,'Nord Stream landfall','ノルドストリーム','Baltic gas-pipeline landfall near Greifswald.','バルト海ガスパイプラインの陸揚げ地。','Nord_Stream','Gas'),
    _dc('d-powerofsiberia','geo','energy',127.5,50.27,'Power of Siberia','シベリアの力','Major Russia→China natural-gas pipeline.','ロシアから中国への大型ガス管。','Power_of_Siberia','Gas'),
    _dc('d-threegorges','geo','energy',111.0,30.82,'Three Gorges Dam','三峡ダム','World’s largest hydroelectric power station.','世界最大の水力発電ダム。','Three_Gorges_Dam','Hydro'),
    _dc('d-druzhba','geo','energy',29.2,52.05,'Druzhba Pipeline','ドルジバ・パイプライン','One of the world’s longest oil pipelines (Mozyr hub).','世界最長級の石油パイプライン。','Druzhba_pipeline','Oil'),
    _dc('d-taiwanstrait','geo','choke',119.6,24.4,'Taiwan Strait','台湾海峡','Flashpoint waterway between Taiwan and mainland China.','台湾と中国本土の間の緊張海域。','Taiwan_Strait','Flashpoint'),
    _dc('d-bagram','mil','mil',69.26,34.95,'Bagram Airfield','バグラム飛行場','Former principal US base in Afghanistan.','旧・在アフガニスタン米軍主要基地。','Bagram_Airfield','Former US'),
    _dc('d-guantanamo','mil','mil',-75.1,19.9,'Guantánamo Bay','グアンタナモ湾','US naval base & detention facility in Cuba.','キューバの米海軍基地・収容施設。','Guantanamo_Bay_Naval_Base','USN'),
    _dc('d-doha','tech','hub',51.53,25.29,'Doha (Al Udeid)','ドーハ（アル・ウデイド）','Qatar hub hosting the largest US base in the Middle East.','中東最大の米軍基地を擁する拠点。','Al_Udeid_Air_Base','CENTCOM'),
    _dc('d-novo','geo','geo',62.0,74.0,'Novaya Zemlya','ノヴァヤゼムリャ','Russian Arctic nuclear-test archipelago.','ロシア北極の核実験群島。','Novaya_Zemlya','Nuclear'),
    /* ===== +40 world military bases (#R7) — US, Russia, China, Europe, India & allies ===== */
    _dc('d-norfolk','mil','maritime',-76.33,36.95,'Naval Station Norfolk','ノーフォーク海軍基地','World’s largest naval base; home of the US Atlantic Fleet.','世界最大の海軍基地。米大西洋艦隊の母港。','Naval_Station_Norfolk','USN'),
    _dc('d-sandiego','mil','maritime',-117.13,32.68,'Naval Base San Diego','サンディエゴ海軍基地','Principal homeport of the US Pacific surface fleet.','米太平洋水上艦隊の主要母港。','Naval_Base_San_Diego','USN'),
    _dc('d-kitsap','mil','maritime',-122.71,47.72,'Naval Base Kitsap','キトサップ海軍基地','Pacific homeport for US Ohio-class ballistic-missile subs (Bangor).','米オハイオ級SSBNの太平洋拠点（バンゴー）。','Naval_Base_Kitsap','SSBN'),
    _dc('d-kingsbay','mil','maritime',-81.51,30.8,'Kings Bay Sub Base','キングスベイ潜水艦基地','Atlantic homeport for US ballistic-missile submarines.','米SSBNの大西洋拠点。','Naval_Submarine_Base_Kings_Bay','SSBN'),
    _dc('d-liberty','mil','mil',-79.0,35.14,'Fort Liberty (Bragg)','フォート・リバティ','Vast US Army base; home of airborne & special forces.','空挺・特殊部隊を擁する米陸軍大基地。','Fort_Liberty','US Army'),
    _dc('d-pentagon','mil','mil',-77.056,38.871,'The Pentagon','ペンタゴン','Headquarters of the US Department of Defense.','米国防総省の本庁舎。','The_Pentagon','DoD'),
    _dc('d-cheyenne','mil','space',-104.85,38.74,'Cheyenne Mountain','シャイアン・マウンテン','Hardened NORAD command bunker inside a mountain.','山中のNORAD要塞指令所。','Cheyenne_Mountain_Complex','NORAD'),
    _dc('d-whiteman','mil','mil',-93.55,38.73,'Whiteman AFB','ホワイトマン空軍基地','Home of the US B-2 stealth bomber fleet.','米B-2ステルス爆撃機の母基地。','Whiteman_Air_Force_Base','USAF'),
    _dc('d-minot','mil','mil',-101.34,48.42,'Minot AFB','マイノット空軍基地','ICBMs and B-52 bombers — two legs of the US nuclear triad.','ICBMとB-52を擁する核戦力拠点。','Minot_Air_Force_Base','USAF'),
    _dc('d-barksdale','mil','mil',-93.66,32.5,'Barksdale AFB','バークスデール空軍基地','US Air Force Global Strike Command & B-52 base.','米地球規模攻撃軍・B-52の拠点。','Barksdale_Air_Force_Base','USAF'),
    _dc('d-yokosuka','mil','maritime',139.67,35.29,'Yokosuka Naval Base','横須賀海軍基地','Forward base of the US Navy 7th Fleet in Japan.','在日米海軍第7艦隊の前方拠点。','United_States_Fleet_Activities_Yokosuka','USN'),
    _dc('d-kadena','mil','mil',127.77,26.35,'Kadena Air Base','嘉手納基地','Largest US Air Force base in the Pacific (Okinawa).','太平洋最大の米空軍基地（沖縄）。','Kadena_Air_Base','USAF'),
    _dc('d-misawa','mil','mil',141.37,40.7,'Misawa Air Base','三沢基地','Joint US–Japan air & intelligence base in northern Honshu.','本州北部の日米共同基地。','Misawa_Air_Base','USAF/JASDF'),
    _dc('d-osan','mil','mil',127.03,37.09,'Osan Air Base','烏山空軍基地','Frontline US/ROK air base near Seoul.','ソウル近郊の米韓最前線空軍基地。','Osan_Air_Base','USFK'),
    _dc('d-kunsan','mil','mil',126.62,35.9,'Kunsan Air Base','群山空軍基地','US fighter base on Korea’s west coast.','韓国西岸の米戦闘機基地。','Kunsan_Air_Base','USAF'),
    _dc('d-aviano','mil','mil',12.6,46.03,'Aviano Air Base','アヴィアーノ空軍基地','Key US/NATO air base in northern Italy.','北イタリアの米・NATO重要基地。','Aviano_Air_Base','USAF'),
    _dc('d-sigonella','mil','maritime',14.92,37.4,'NAS Sigonella','シゴネラ航空基地','“Hub of the Med” — US naval air station in Sicily.','地中海の要、シチリアの米海軍航空基地。','Naval_Air_Station_Sigonella','USN'),
    _dc('d-rota','mil','maritime',-6.35,36.62,'Naval Station Rota','ロタ海軍基地','US/Spanish base hosting missile-defense destroyers on the Atlantic.','弾道ミサイル防衛艦が展開する米西基地。','Naval_Station_Rota','USN'),
    _dc('d-souda','mil','maritime',24.15,35.53,'Souda Bay','スーダ湾','US/NATO naval base on Crete commanding the eastern Med.','東地中海を扼するクレタ島の米・NATO基地。','Naval_Support_Activity_Souda_Bay','NATO'),
    _dc('d-lakenheath','mil','mil',0.561,52.41,'RAF Lakenheath','レイクンヒース空軍基地','Largest US Air Force base in England (F-35).','英国最大の米空軍基地（F-35）。','RAF_Lakenheath','USAF'),
    _dc('d-menwith','mil','tech',-1.69,54.01,'RAF Menwith Hill','メンウィズヒル基地','Major US/UK signals-intelligence ground station.','米英の主要な信号情報傍受局。','RAF_Menwith_Hill','SIGINT'),
    _dc('d-faslane','mil','maritime',-4.82,56.07,'HMNB Clyde (Faslane)','クライド海軍基地','Home of the UK Trident nuclear-submarine deterrent.','英トライデント核抑止潜水艦の母港。','HMNB_Clyde','RN SSBN'),
    _dc('d-toulon','mil','maritime',5.92,43.1,'Toulon Naval Base','トゥーロン軍港','France’s largest naval base & Mediterranean fleet home.','仏最大の軍港・地中海艦隊の拠点。','Toulon','FR Navy'),
    _dc('d-ilelongue','mil','maritime',-4.49,48.31,'Île Longue','イル・ロング','Base for France’s ballistic-missile submarines.','仏SSBN（戦略原潜）の基地。','Île_Longue','FR SSBN'),
    _dc('d-bahrain','mil','maritime',50.61,26.21,'NSA Bahrain','バーレーン海軍支援施設','Headquarters of the US Navy 5th Fleet in the Gulf.','湾岸の米海軍第5艦隊司令部。','Naval_Support_Activity_Bahrain','USN'),
    _dc('d-psab','mil','mil',47.58,24.06,'Prince Sultan AB','プリンス・スルタン空軍基地','US air hub in Saudi Arabia for Gulf operations.','湾岸作戦の米空軍拠点（サウジ）。','Prince_Sultan_Air_Base','USAF'),
    _dc('d-alisalem','mil','mil',47.52,29.35,'Ali Al Salem AB','アリ・アル・サレム基地','Forward US air base in Kuwait near Iraq.','イラクに近いクウェートの米前線基地。','Ali_Al_Salem_Air_Base','USAF'),
    _dc('d-nevatim','mil','mil',35.01,31.21,'Nevatim Airbase','ネバティム空軍基地','Major Israeli Air Force base (F-35I “Adir”).','イスラエル空軍の主要基地（F-35I）。','Nevatim_Airbase','IAF'),
    _dc('d-hmeimim','mil','mil',35.95,35.41,'Khmeimim Air Base','フメイミム空軍基地','Russia’s main air base in Syria.','シリアにおけるロシアの主要空軍基地。','Khmeimim_Air_Base','RU'),
    _dc('d-engels','mil','mil',46.21,51.48,'Engels-2 Air Base','エンゲルス空軍基地','Home of Russia’s strategic Tu-160/Tu-95 bombers.','ロシア戦略爆撃機の母基地。','Engels-2_(air_base)','RU strat'),
    _dc('d-plesetsk','mil','space',40.68,62.93,'Plesetsk Cosmodrome','プレセツク宇宙基地','Russia’s military spaceport for ICBM & satellite launches.','ロシアの軍事宇宙基地。','Plesetsk_Cosmodrome','RU mil'),
    _dc('d-vladivostok','mil','maritime',131.88,43.11,'Vladivostok','ウラジオストク','Headquarters of Russia’s Pacific Fleet.','ロシア太平洋艦隊の司令部。','Vladivostok','RU Navy'),
    _dc('d-yulin','mil','maritime',109.51,18.23,'Yulin Naval Base','楡林海軍基地','Chinese SSBN base on Hainan with underground submarine pens.','海南島の中国SSBN基地（地下潜水艦壕）。','Yulin_Naval_Base','PLAN'),
    _dc('d-zhanjiang','mil','maritime',110.4,21.2,'Zhanjiang','湛江','Headquarters of China’s South Sea Fleet.','中国南海艦隊の司令部。','South_Sea_Fleet','PLAN'),
    _dc('d-mischief','mil','maritime',115.54,9.9,'Mischief Reef','ミスチーフ礁','Militarised Chinese artificial island in the Spratlys.','南沙の中国人工島・軍事拠点。','Mischief_Reef','PLA'),
    _dc('d-woody','mil','maritime',112.34,16.83,'Woody Island','永興島','China’s military & administrative hub in the Paracels.','西沙諸島における中国の軍事・行政拠点。','Woody_Island','PLA'),
    _dc('d-ream','mil','maritime',103.61,10.52,'Ream Naval Base','リアム海軍基地','Cambodian base expanded with Chinese backing.','中国の支援で拡張されたカンボジアの基地。','Ream_Naval_Base','CN-linked'),
    _dc('d-stirling','mil','maritime',115.68,-32.24,'HMAS Stirling','HMASスターリング','Australia’s west-coast fleet base, central to AUKUS submarines.','AUKUS潜水艦の要となる豪西岸の艦隊基地。','HMAS_Stirling','RAN'),
    _dc('d-darwin','mil','mil',130.95,-12.42,'Darwin (Robertson Bks)','ダーウィン（ロバートソン兵営）','Hosts rotational US Marines in northern Australia.','米海兵隊が輪番展開する豪北部の拠点。','Robertson_Barracks','AU/US'),
    _dc('d-kadamba','mil','maritime',74.13,14.81,'INS Kadamba (Karwar)','INSカダンバ','India’s largest naval base under Project Seabird.','インド最大の海軍基地（シーバード計画）。','INS_Kadamba','IN Navy'),
    _dc('d-vizag','mil','maritime',83.3,17.69,'Visakhapatnam','ヴィシャーカパトナム','Headquarters of India’s Eastern Naval Command & SSBN base.','インド東部海軍司令部・SSBN拠点。','Eastern_Naval_Command','IN Navy'),
    /* ===== +50 strategic-location cards (#R15) — chokepoints, ports, bases, tech & energy ===== */
    _dc('d2-gibraltar','maritime','choke',-5.35,35.97,'Strait of Gibraltar','ジブラルタル海峡','14 km gateway between the Atlantic and the Mediterranean.','大西洋と地中海を結ぶ幅14kmの要衝。','Strait_of_Gibraltar','Chokepoint'),
    _dc('d2-dardanelles','maritime','choke',26.4,40.2,'Dardanelles','ダーダネルス海峡','Turkish strait linking the Aegean to the Sea of Marmara.','エーゲ海とマルマラ海を結ぶトルコの海峡。','Dardanelles','Chokepoint'),
    _dc('d2-kiel','maritime','choke',9.45,54.37,'Kiel Canal','キール運河','World’s busiest artificial waterway, Baltic↔North Sea.','世界一通航量の多い運河（バルト海↔北海）。','Kiel_Canal','Chokepoint'),
    _dc('d2-dover','maritime','choke',1.45,51.0,'Strait of Dover','ドーバー海峡','Busiest shipping lane on Earth between England and France.','英仏間の世界一混雑する航路。','Strait_of_Dover','Chokepoint'),
    _dc('d2-sunda','maritime','choke',105.9,-5.95,'Sunda Strait','スンダ海峡','Indonesian strait between Java and Sumatra.','ジャワ島とスマトラ島の間の海峡。','Sunda_Strait','Chokepoint'),
    _dc('d2-lombok','maritime','choke',115.74,-8.73,'Lombok Strait','ロンボク海峡','Deep alternative passage for large vessels avoiding Malacca.','マラッカを避ける大型船の代替深水航路。','Lombok_Strait','Chokepoint'),
    _dc('d2-korea','maritime','choke',129.5,34.6,'Korea Strait','対馬海峡','Strait between Korea and Japan (Tsushima passage).','韓国と日本の間の海峡（対馬航路）。','Korea_Strait','Chokepoint'),
    _dc('d2-magellan','maritime','choke',-70.4,-53.6,'Strait of Magellan','マゼラン海峡','Historic Atlantic–Pacific passage south of mainland Chile.','チリ南部の大西洋–太平洋歴史的航路。','Strait_of_Magellan','Chokepoint'),
    _dc('d2-goodhope','maritime','choke',18.48,-34.35,'Cape of Good Hope','喜望峰','Southern-Africa cape route used when Suez is closed.','スエズ閉鎖時に使われる南アフリカ航路。','Cape_of_Good_Hope','Route'),
    _dc('d2-ningbo','maritime','maritime',122.07,29.87,'Ningbo-Zhoushan Port','寧波舟山港','World’s busiest port by cargo tonnage.','貨物取扱量で世界最大の港。','Port_of_Ningbo-Zhoushan','Port'),
    _dc('d2-busan','maritime','maritime',129.07,35.08,'Port of Busan','釜山港','South Korea’s largest port and a major transshipment hub.','韓国最大の港・主要中継拠点。','Port_of_Busan','Port'),
    _dc('d2-lalong','maritime','maritime',-118.21,33.74,'LA / Long Beach','ロサンゼルス・ロングビーチ港','Largest container port complex in the Americas.','南北アメリカ最大のコンテナ港群。','Port_of_Los_Angeles','Port'),
    _dc('d2-antwerp','maritime','maritime',4.4,51.27,'Antwerp-Bruges','アントワープ・ブルッヘ港','Europe’s second-largest seaport & top chemical cluster.','欧州第2の港・最大の化学産業集積地。','Port_of_Antwerp-Bruges','Port'),
    _dc('d2-jebelali','maritime','maritime',55.06,25.01,'Jebel Ali Port','ジェベル・アリ港','Largest man-made harbor & Middle East transshipment hub.','世界最大の人工港・中東の中継拠点。','Jebel_Ali_Port','Port'),
    _dc('d2-groton','mil','maritime',-72.09,41.4,'Sub Base New London','ニューロンドン潜水艦基地','Primary US East-coast attack-submarine base (Groton).','米東海岸の主要攻撃型潜水艦基地。','Naval_Submarine_Base_New_London','USN'),
    _dc('d2-mayport','mil','maritime',-81.4,30.39,'Naval Station Mayport','メイポート海軍基地','Atlantic surface-fleet & carrier-capable base in Florida.','大西洋水上艦隊の基地（フロリダ）。','Naval_Station_Mayport','USN'),
    _dc('d2-offutt','mil','mil',-95.91,41.12,'Offutt AFB','オファット空軍基地','Headquarters of US Strategic Command (STRATCOM).','米戦略軍（STRATCOM）の司令部。','Offutt_Air_Force_Base','STRATCOM'),
    _dc('d2-creech','mil','mil',-115.67,36.58,'Creech AFB','クリーチ空軍基地','Hub of US remotely-piloted (drone) operations.','米無人機（ドローン）作戦の中枢。','Creech_Air_Force_Base','USAF'),
    _dc('d2-edwards','mil','space',-117.88,34.9,'Edwards AFB','エドワーズ空軍基地','US flight-test center on a Mojave dry lakebed.','モハーベ砂漠の米飛行試験センター。','Edwards_Air_Force_Base','USAF'),
    _dc('d2-fairford','mil','mil',-1.79,51.68,'RAF Fairford','フェアフォード空軍基地','US strategic-bomber forward base in England.','英国の米戦略爆撃機前方基地。','RAF_Fairford','USAF'),
    _dc('d2-grafenwoehr','mil','mil',11.94,49.7,'Grafenwöhr','グラーフェンヴェーア','Largest US Army training area in Europe.','在欧米陸軍最大の訓練場。','Grafenwöhr_Training_Area','US Army'),
    _dc('d2-mkair','mil','mil',28.49,44.36,'Mihail Kogălniceanu','コガルニチェアヌ基地','Expanding US/NATO air hub on Romania’s Black Sea coast.','黒海沿岸の拡張中の米・NATO空軍拠点。','Mihail_Kogălniceanu_International_Airport','NATO'),
    _dc('d2-tapa','mil','mil',25.96,59.26,'Tapa Army Base','タパ陸軍基地','NATO enhanced-Forward-Presence battlegroup in Estonia.','エストニアのNATO前方展開部隊。','Tapa_Army_Base','NATO eFP'),
    _dc('d2-eielson','mil','mil',-147.1,64.66,'Eielson AFB','アイエルソン空軍基地','Arctic US F-35 base in interior Alaska.','アラスカ内陸の米F-35北極基地。','Eielson_Air_Force_Base','USAF'),
    _dc('d2-keflavik','mil','maritime',-22.6,63.99,'Keflavík','ケプラヴィーク','NATO anti-submarine air station guarding the GIUK gap.','GIUKギャップを守るNATO対潜基地。','Naval_Air_Station_Keflavik','NATO'),
    _dc('d2-futenma','mil','mil',127.76,26.27,'MCAS Futenma','普天間飛行場','US Marine Corps air station in central Okinawa.','沖縄中部の米海兵隊航空基地。','Marine_Corps_Air_Station_Futenma','USMC'),
    _dc('d2-iwakuni','mil','maritime',132.24,34.14,'MCAS Iwakuni','岩国基地','Joint US Marine / Japanese air base on the Inland Sea.','瀬戸内海の日米共同航空基地。','Marine_Corps_Air_Station_Iwakuni','USMC'),
    _dc('d2-changi','mil','maritime',103.99,1.32,'Changi Naval Base','チャンギ海軍基地','Singapore base able to host US aircraft carriers.','米空母も寄港可能なシンガポールの基地。','Changi_Naval_Base','SG/US'),
    _dc('d2-vostochny','tech','space',128.33,51.88,'Vostochny Cosmodrome','ボストチヌイ宇宙基地','Russia’s newest civil spaceport in the Far East.','ロシア極東の最新の民生宇宙基地。','Vostochny_Cosmodrome','Space'),
    _dc('d2-wenchang','tech','space',110.95,19.61,'Wenchang','文昌発射場','China’s coastal heavy-lift launch site (Hainan).','中国沿岸の大型ロケット発射場（海南）。','Wenchang_Space_Launch_Site','Space'),
    _dc('d2-starbase','tech','space',-97.18,25.997,'Starbase','スターベース','SpaceX Starship development & launch site in Texas.','SpaceXのスターシップ開発・発射場。','SpaceX_Starbase','Space'),
    _dc('d2-ksc','tech','space',-80.65,28.57,'Kennedy Space Center','ケネディ宇宙センター','NASA’s primary launch complex in Florida.','NASAの主要打上げ拠点（フロリダ）。','Kennedy_Space_Center','NASA'),
    _dc('d2-iter','tech','tech',5.75,43.7,'ITER','ITER','World’s largest nuclear-fusion experiment (Cadarache).','世界最大の核融合実験炉（カダラッシュ）。','ITER','Fusion'),
    _dc('d2-asml','tech','tech',5.46,51.41,'ASML / Eindhoven','ASML・アイントホーフェン','Sole maker of EUV lithography machines for chips.','EUV露光装置を独占供給する企業の拠点。','ASML_Holding','Semis'),
    _dc('d2-skhynix','tech','tech',127.44,37.27,'SK hynix (Icheon)','SKハイニックス（利川）','Major global memory-chip (DRAM/NAND) fabrication hub.','世界有数のメモリ半導体生産拠点。','SK_Hynix','Semis'),
    _dc('d2-tsukuba','tech','tech',140.1,36.08,'Tsukuba Science City','筑波研究学園都市','Japan’s planned national science & research city.','日本の国立研究学園都市。','Tsukuba_Science_City','Science'),
    _dc('d2-seattle','tech','tech',-122.33,47.6,'Seattle','シアトル','Aerospace (Boeing) & cloud-software (Amazon/MS) hub.','航空宇宙とクラウドソフトの中心地。','Seattle','Tech'),
    _dc('d2-telaviv','tech','tech',34.78,32.08,'Tel Aviv','テルアビブ','“Silicon Wadi” — Israel’s startup & cyber capital.','「シリコンワディ」イスラエルの起業・サイバー中心。','Silicon_Wadi','Tech'),
    _dc('d2-cambridgeuk','tech','tech',0.09,52.21,'Cambridge','ケンブリッジ','“Silicon Fen” research & deep-tech cluster (Arm, AI).','「シリコンフェン」研究・先端技術集積地。','Silicon_Fen','Tech'),
    _dc('d2-permian','geo','energy',-102.5,31.8,'Permian Basin','パーミアン盆地','Most prolific US oil & shale-gas producing region.','米最大の産油・シェールガス地帯。','Permian_Basin','Oil'),
    _dc('d2-prudhoe','geo','energy',-148.3,70.25,'Prudhoe Bay','プルドー湾','Largest US oil field; head of the Trans-Alaska Pipeline.','米最大の油田・アラスカ横断管の起点。','Prudhoe_Bay_Oil_Field','Oil'),
    _dc('d2-jamnagar','geo','energy',69.95,22.35,'Jamnagar Refinery','ジャムナガル製油所','World’s largest oil-refining complex (India).','世界最大の製油所複合体（インド）。','Jamnagar_Refinery','Oil'),
    _dc('d2-itaipu','geo','energy',-54.59,-25.41,'Itaipu Dam','イタイプダム','Binational mega-dam on the Brazil–Paraguay border.','ブラジル・パラグアイ国境の巨大ダム。','Itaipu_Dam','Hydro'),
    _dc('d2-kashagan','geo','energy',51.2,46.8,'Kashagan Field','カシャガン油田','Giant offshore oil field in the northern Caspian Sea.','カスピ海北部の巨大海上油田。','Kashagan_Field','Oil'),
    _dc('d2-atacama','geo','energy',-68.3,-23.5,'Lithium Triangle','リチウムトライアングル','Salar de Atacama — core of global lithium supply.','アタカマ塩湖、世界のリチウム供給の中核。','Salar_de_Atacama','Lithium'),
    _dc('d2-kolwezi','geo','energy',25.47,-10.71,'Kolwezi','コルウェジ','Heart of the DR Congo cobalt & copper belt.','コンゴのコバルト・銅鉱帯の中心。','Kolwezi','Cobalt'),
    _dc('d2-aralsea','geo','geo',59.8,45.0,'Aral Sea','アラル海','Lake that largely dried up — an ecological catastrophe.','大半が干上がった環境破壊の象徴。','Aral_Sea','Climate'),
    _dc('d2-chernobyl','geo','geo',30.1,51.39,'Chernobyl Zone','チェルノブイリ立入禁止区域','Exclusion zone around the 1986 nuclear disaster.','1986年原発事故周辺の立入禁止区域。','Chernobyl_Exclusion_Zone','Nuclear'),
    _dc('d2-kuriles','geo','geo',147.5,44.5,'Kuril Islands','千島列島','Russo-Japanese territorial dispute (Northern Territories).','日露の領土問題（北方領土）。','Kuril_Islands','Disputed'),
    _dc('d2-darien','geo','geo',-77.5,8.4,'Darién Gap','ダリエン地峡','Roadless jungle break in the Pan-American Highway.','パンアメリカン道が途切れる密林地帯。','Darién_Gap','Geo')
  ];
  const DATA_SOURCES=[
    {n:'CARTO basemaps',u:'https://carto.com/attribution/'},
    /* (#R180) the two rendering engines themselves. MapLibre has always been here in spirit; it is
       named explicitly now that it is a CHOICE rather than the only possibility. Both are
       permissively licensed and neither requires an account: the Cesium engine deliberately uses
       no Cesium Ion asset, so it draws the same Esri imagery and the same AWS terrarium elevation
       the MapLibre engine does, and no token is ever set. */
    {n:'MapLibre GL JS',u:'https://maplibre.org/'},
    {n:'CesiumJS',u:'https://cesium.com/platform/cesiumjs/'},
    {n:'Twemoji (Twitter Emoji)',u:'https://github.com/jdecked/twemoji'},
    {n:'Esri World Imagery',u:'https://www.esri.com/'},
    {n:'OpenStreetMap',u:'https://www.openstreetmap.org/copyright'},
    {n:'NASA GIBS / Worldview',u:'https://www.earthdata.nasa.gov/'},
    /* (#R186) the two datasets this round bundles WITH the app rather than fetching at run time —
       both are rebuilt by a script in scripts/, and both are named here because a shipped copy needs
       its attribution as much as a live request does. */
    {n:'NASA Blue Marble (via NASA EOSDIS GIBS)',u:'https://www.earthdata.nasa.gov/'},
    {n:'NOAA sea-surface currents, wind stress and temperature (CoastWatch / PolarWatch ERDDAP)',u:'https://polarwatch.noaa.gov/erddap/griddap/noaacwBLENDEDNRTcurrentsDaily.html'},
    {n:'JPL Solar System Dynamics — planetary satellites',u:'https://ssd.jpl.nasa.gov/sats/elem/'},
    {n:'Hipparcos Catalog (ESA 1997) — CDS I/239',u:'https://cdsarc.cds.unistra.fr/viz-bin/cat/I/239'},
    {n:'NASA/JPL Horizons — interplanetary spacecraft trajectories',u:'https://ssd.jpl.nasa.gov/horizons/'},
    {n:'NASA/JPL Small-Body Database (SBDB)',u:'https://ssd.jpl.nasa.gov/tools/sbdb_query.html'},
    {n:'SIMBAD — CDS, Strasbourg (deep-sky objects and their published distances)',u:'https://simbad.u-strasbg.fr/simbad/'},
    {n:'REST Countries',u:'https://restcountries.com/'},
    {n:'NASA FIRMS',u:'https://firms.modaps.eosdis.nasa.gov/'},
    {n:'RainViewer',u:'https://www.rainviewer.com/'},
    {n:'Open-Meteo',u:'https://open-meteo.com/'},
    {n:'Open-Meteo Marine',u:'https://open-meteo.com/en/docs/marine-weather-api'},
    {n:'MET Norway (Locationforecast)',u:'https://api.met.no/'},
    {n:'OSRM (Open Source Routing Machine)',u:'https://project-osrm.org/'},
    {n:'Transitous / MOTIS',u:'https://transitous.org/'},
    {n:'Valhalla (FOSSGIS)',u:'https://valhalla1.openstreetmap.de/'},
    {n:'Google Street View',u:'https://www.google.com/streetview/'},
    {n:'Global Watersheds (mghydro.com)',u:'https://mghydro.com/watersheds/'},
    {n:'GRDC / World Bank — Major River Basins of the World',u:'https://datacatalog.worldbank.org/search/dataset/0041426'},
    {n:'OpenTopoMap',u:'https://opentopomap.org/'},
    {n:'USGS Earthquake Hazards Program',u:'https://earthquake.usgs.gov/'},
    {n:'OpenStreetMap Overpass API',u:'https://wiki.openstreetmap.org/wiki/Overpass_API'},
    {n:'Wikidata Query Service',u:'https://query.wikidata.org/'},
    {n:'GeoNames',u:'https://www.geonames.org/'},
    /* (#R284) also the warning layer's last shape rung — the ADM1/ADM2 outline of a warning area
       that is in no NUTS, in no national file and in nothing the WMO register happens to hold today. */
    {n:'geoBoundaries',u:'https://www.geoboundaries.org/'},
    {n:'GDELT Project',u:'https://www.gdeltproject.org/'},
    {n:'Market data (fxratesapi / ER-API · gold-api · CoinGecko · alternative.me)',u:'https://fxratesapi.com/'},
    {n:'Yahoo Finance',u:'https://finance.yahoo.com/'},
    {n:'Clearbit Logo API / Google favicons',u:'https://logo.clearbit.com/'},
    {n:'Wikipedia (Wikimedia REST API)',u:'https://www.wikipedia.org/'},
    {n:'Live cameras — OpenStreetMap (Overpass API)',u:'https://wiki.openstreetmap.org/wiki/Key:contact:webcam'},
    /* (#R254) the data-center layer: OSM's own surveyed buildings (ODbL) plus the operators' published region lists */
    {n:'Data centers — OpenStreetMap (telecom/man_made/building = data_center, Overpass API)',u:'https://wiki.openstreetmap.org/wiki/Tag:telecom%3Ddata_center'},
    /* (#R255) the four surveyed-facility layers — js/osm-facilities.js. Same live Overpass path,
       same ODbL terms; each card prints the object’s own tags and links to the object itself. */
    {n:'Diplomatic missions — OpenStreetMap (amenity=embassy / office=diplomatic, Overpass API)',u:'https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dembassy'},
    {n:'Military sites — OpenStreetMap (military=*, Overpass API)',u:'https://wiki.openstreetmap.org/wiki/Key:military'},
    {n:'Health facilities — OpenStreetMap (amenity=hospital/clinic/doctors/pharmacy, Overpass API)',u:'https://wiki.openstreetmap.org/wiki/Key:healthcare'},
    {n:'Telecom & internet infrastructure — OpenStreetMap (telecom=*, communications towers, Overpass API)',u:'https://wiki.openstreetmap.org/wiki/Key:telecom'},
    /* (#R258/#R261) the eight further surveyed-facility layers — same engine, same live Overpass
       path, same ODbL terms. ⚠ #R258 shipped `osmpower`/`osmextract` WITHOUT registering them
       here, so two layers were drawing OSM data with no entry on the sources page; both are
       added with the six this round adds. */
    {n:'Power plants & grid — OpenStreetMap (power=plant/substation/generator, Overpass API)',u:'https://wiki.openstreetmap.org/wiki/Key:power'},
    {n:'Mines, quarries & wells — OpenStreetMap (landuse=quarry, man_made=mineshaft/petroleum_well, Overpass API)',u:'https://wiki.openstreetmap.org/wiki/Tag:landuse%3Dquarry'},
    {n:'Airports & air infrastructure — OpenStreetMap (aeroway=aerodrome/terminal/heliport, Overpass API)',u:'https://wiki.openstreetmap.org/wiki/Key:aeroway'},
    {n:'Ports, harbours & terminals — OpenStreetMap (harbour, landuse=port, ferry terminals, Overpass API)',u:'https://wiki.openstreetmap.org/wiki/Key:harbour'},
    {n:'Water & wastewater plant — OpenStreetMap (man_made=water_works/wastewater_plant/pumping_station, Overpass API)',u:'https://wiki.openstreetmap.org/wiki/Tag:man_made%3Dwater_works'},
    {n:'Universities & research institutes — OpenStreetMap (amenity=university/college/research_institute, Overpass API)',u:'https://wiki.openstreetmap.org/wiki/Tag:amenity%3Duniversity'},
    {n:'Emergency services — OpenStreetMap (fire_station / police / ambulance_station, Overpass API)',u:'https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dfire_station'},
    {n:'Spaceports & satellite ground stations — OpenStreetMap (aeroway=spaceport, man_made=launch_pad/satellite_dish, Overpass API)',u:'https://wiki.openstreetmap.org/wiki/Tag:man_made%3Dsatellite_dish'},
    /* (#R266) the round's new datasets */
    {n:'Annual precipitation, 1981–2010 normal — CHELSA V2.1 bio12 (30 arc-seconds, ~1 km)',u:'https://chelsa-climate.org/'},
    {n:'Annual precipitation by year, 1981–2020 — GPCC Full Data Monthly V2022, Deutscher Wetterdienst (0.5°, gauge analysis over land)',u:'https://opendata.dwd.de/climate_environment/GPCC/full_data_monthly_v2022/05/'},
    {n:'Religion and language composition by country — CIA World Factbook (US Government work, public domain)',u:'https://www.cia.gov/the-world-factbook/'},
    {n:'Weather warnings, Canada — Environment and Climate Change Canada (OGC API — Features)',u:'https://api.weather.gc.ca/collections/weather-alerts'},
    {n:'Weather warnings, Europe — MeteoAlarm (EUMETNET), 35 national services',u:'https://feeds.meteoalarm.org/'},
    {n:'Weather warnings, China — China Meteorological Administration public warning list',u:'https://www.nmc.cn/'},
    /* ══ (#R273) THE WARNING LAYER'S SOURCES, ONE PER COUNTRY — GDACS was removed this round ══════ */
    {n:'気象警報・注意報 — 気象庁 (Japan Meteorological Agency, bulletin list r8, by municipality)',u:'https://www.jma.go.jp/bosai/warning/'},
    {n:'気象庁の警報階級と配色 (JMA warning levels 20/30/40/50 and their published colours)',u:'https://www.jma.go.jp/bosai/warning/'},
    {n:'行政区域データ（市区町村界）— 国土交通省 国土数値情報 N03 (via smartnews-smri/japan-topography)',u:'https://nlftp.mlit.go.jp/ksj/'},
    {n:'Weather warnings, United States — NOAA National Weather Service (api.weather.gov, CAP)',u:'https://api.weather.gov/alerts/active'},
    {n:'Warnungen — Deutscher Wetterdienst GeoServer (Warnungen_Landkreise, WFS)',u:'https://maps.dwd.de/geoserver/dwd/ows'},
    {n:'Farevarsler — MET Norway MetAlerts 2.0',u:'https://api.met.no/weatherapi/metalerts/2.0/'},
    {n:'Avisos meteorológicos — INMET (Instituto Nacional de Meteorologia, Brazil)',u:'https://apiprevmet3.inmet.gov.br/avisos/ativos'},
    {n:'Weather warnings, Australia — Bureau of Meteorology',u:'https://api.weather.bom.gov.au/v1/warnings'},
    {n:'Weather warnings, Hong Kong — Hong Kong Observatory Open Data (warnsum)',u:'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum'},
    {n:'Weather advisories, the Philippines — PAGASA-DOST public alert feed (CAP)',u:'https://publicalert.pagasa.dost.gov.ph/feeds/'},
    {n:'災害告警 — 中央氣象署 CWA (Taiwan), via the NCDR CAP aggregator',u:'https://alerts.ncdr.nat.gov.tw/'},
    {n:'Weather warnings, New Zealand — MetService public CAP alerts',u:'https://alerts.metservice.com/cap/rss'},
    /* (#R275) every other country: its OWN national service, republished by the WMO's register */
    {n:'Weather warnings worldwide — national meteorological services via the WMO Severe Weather Information Centre (CAP)',u:'https://severeweather.wmo.int/'},
    {n:'WMO Members and their CAP implementation status (which national service files CAP, and which does not)',u:'https://severeweather.wmo.int/'},
    {n:'AWS Global Infrastructure — regions',u:'https://aws.amazon.com/about-aws/global-infrastructure/regions_az/'},
    {n:'Microsoft Azure — datacenter locations',u:'https://datacenters.microsoft.com/globe/explore/'},
    {n:'Google Cloud — locations',u:'https://cloud.google.com/about/locations'},
    {n:'Oracle Cloud — public cloud regions',u:'https://www.oracle.com/cloud/public-cloud-regions/'},
    {n:'Meta — data centers',u:'https://datacenters.atmeta.com/'},
    {n:'TOP500 — supercomputer sites',u:'https://top500.org/lists/top500/'},
    {n:'Transport for London — JamCams',u:'https://api.tfl.gov.uk/'},
    {n:'Caltrans — California DOT CCTV',u:'https://cwwp2.dot.ca.gov/'},
    {n:'Fintraffic / Digitraffic — Finland road-weather cameras',u:'https://www.digitraffic.fi/en/'},
    {n:'OpenTrafficCamMap — US state DOT cameras',u:'https://github.com/AidanWelch/OpenTrafficCamMap'},
    {n:'US / Canada DOT “511” traffic cameras',u:'https://511ny.org/'},
    {n:'Mapzen / AWS Terrain Tiles — elevation model (DEM)',u:'https://registry.opendata.aws/terrain-tiles/'},
    /* (#R176) the published models the seismic and sunlight engines COMPUTE from — the coefficients are
       the data, the numbers on screen are derived from them (standing instruction 4). */
    {n:'IASP91 reference Earth model — Kennett & Engdahl (1991)',u:'https://doi.org/10.1111/j.1365-246X.1991.tb06724.x'},
    {n:'Brune (1970) source model · Hanks & Kanamori (1979) · Boore stochastic method',u:'https://doi.org/10.1029/JB075i026p04997'},
    {n:'Wald, Quitoriano, Heaton & Kanamori (1999) — PGV → Modified Mercalli intensity',u:'https://doi.org/10.1193/1.1586058'},
    /* (#R189) the two models the terrain-aware intensity field and the JMA display compute from */
    {n:'Wald & Allen (2007) — topographic slope → Vs30 site proxy',u:'https://doi.org/10.1785/0120060267'},
    {n:'気象庁「計測震度の算出方法」 (JMA instrumental seismic intensity)',u:'https://www.data.jma.go.jp/eqev/data/kyoshin/kaisetsu/calc_sindo.html'},
    {n:'Okada (1985) · Wells & Coppersmith (1994) · Atkinson & Silva (2000)',u:'https://doi.org/10.1785/BSSA0750041135'},
    {n:'Kotani et al. (1998) — Manning roughness for tsunami run-up computation',u:'https://doi.org/10.2208/prohe.42.559'},
    {n:'Kasten & Young (1989) air mass · Meinel & Meinel clear-sky beam',u:'https://doi.org/10.1364/AO.28.004735'},
    {n:'GEBCO 2020',u:'https://www.gebco.net/'},
    {n:'AWS Terrain Tiles',u:'https://registry.opendata.aws/terrain-tiles/'},
    {n:'Beck et al. Köppen-Geiger (2018)',u:'https://www.nature.com/articles/sdata2018214'},
    {n:'MarineRegions',u:'https://www.marineregions.org/'},
    /* ══ (#R347) THE SUBMARINE-CABLE LAYER IS NOW SIX SOURCES, NOT ONE ═══════════════════════════
       Up to this round the layer drew TeleGeography's schematic geometry directly. It still supplies
       the inventory — which cables exist, their names, owners, landing points and the connection
       structure — but the ROUTES are rebuilt offline by scripts/build-subcables.mjs: surveyed
       positions from the government datasets below wherever a cable can be identified in one by name
       AND place, and a least-cost path over the sea floor everywhere else. Every one of these is
       named here because the map now carries their data. */
    /* ⚠ THE NAME IS THE KEY. `js/locales/pages.<code>.js` describes every row by its `n`, and
       tests/r218-checks ⑤ requires all nine — so renaming a row is renaming it in nine files. */
    {n:'TeleGeography Submarine Cable Map',u:'https://www.submarinecablemap.com/'},
    {n:'NOAA Office for Coastal Management — Marine Cadastre',u:'https://marinecadastre.gov/'},
    {n:'EMODnet Human Activities — submarine cables',u:'https://emodnet.ec.europa.eu/en/human-activities'},
    {n:'ACMA / Geoscience Australia — Australian submarine cable locations',u:'https://www.arcgis.com/home/item.html?id=bc1e7fb37fca40faa5dafbc8a5a4dc3c'},
    {n:'Natural Earth 1:10m physical — lakes',u:'https://www.naturalearthdata.com/'},
    {n:'NASA SEDAC GPW v4',u:'https://sedac.ciesin.columbia.edu/'},
    {n:'UNDP / EIU / SIPRI / World Bank',u:'https://hdr.undp.org/'},
    {n:'AISstream.io',u:'https://aisstream.io/'},
    {n:'adsb.lol',u:'https://www.adsb.lol/'},
    {n:'airplanes.live',u:'https://airplanes.live/'},
    {n:'CelesTrak',u:'https://celestrak.org/'},
    {n:'satellite.js',u:'https://github.com/shashwatak/satellite-js'},
    {n:'Planespotters.net',u:'https://www.planespotters.net/photo/api'},
    {n:'NOAA SWPC',u:'https://www.swpc.noaa.gov/'},
    /* (#R290) …and the warning layer's world administrative index — `data/admin1-world.json.gz`,
       4,515 first-level units across 247 countries, simplified from Natural Earth 10 m at build
       time by scripts/build-admin1.mjs. It is what lets 「発令なし」 be drawn at the UNIT for every
       country rather than for the fifty this map held a closer index for. Public domain. */
    {n:'Natural Earth',u:'https://www.naturalearthdata.com/'},
    /* (#R197) the three sources the global tsunami model and the space explorer added */
    {n:'AWS Terrain Tiles — the bundled global sea floor',u:'https://registry.opendata.aws/terrain-tiles/'},
    {n:'Solar System Scope — planetary surface textures',u:'https://www.solarsystemscope.com/textures/'},
    {n:'USGS Gazetteer of Planetary Nomenclature',u:'https://planetarynames.wr.usgs.gov/'},
    /* (#R263) the shipped earth model the earthquake simulator's regional constants come from,
       and the recordings its validation harness is scored against */
    {n:'CRUST1.0 — global crustal model',u:'https://igppweb.ucsd.edu/~gabi/crust1.html'},
    {n:'USGS Slab2 — subduction zone geometry',u:'https://www.sciencebase.gov/catalog/item/5aa1b00ee4b0b1c392e86467'},
    {n:'Bird (2003) PB2002 plate boundaries',u:'https://github.com/fraxen/tectonicplates'},
    {n:'USGS ShakeMap station lists',u:'https://earthquake.usgs.gov/data/shakemap/'},
    {n:'OpenRailwayMap / OpenSeaMap',u:'https://www.openrailwaymap.org/'},
    {n:'Wikipedia / Wikimedia',u:'https://www.wikipedia.org/'},
    {n:'Public CORS relays (allorigins.win, corsproxy.io, corsfix.com, codetabs.com)',u:'https://corsproxy.io/'},
    {n:'Google News',u:'https://news.google.com/'},
    {n:'OpenFreeMap / OpenMapTiles',u:'https://openfreemap.org/'},
    {n:'Google Fonts (Noto Sans JP / SC / TC)',u:'https://fonts.google.com/noto'},
    {n:'Inter / Pretendard (bundled, SIL OFL 1.1)',u:'https://rsms.me/inter/'},
    {n:'ESA WorldCover',u:'https://esa-worldcover.org/'},
    {n:'RESOLVE / WWF Ecoregions 2017',u:'https://ecoregions.appspot.com/'},
    {n:'Smithsonian GVP',u:'https://volcano.si.edu/'},
    /* (#R353) Volcano Intelligence — the five live sources beside the bundled GVP catalog. Four of
       them the browser reads directly; the two without CORS go through supabase/functions/volcano-feed. */
    {n:'Smithsonian / USGS Weekly Volcanic Activity Report',u:'https://volcano.si.edu/reports_weekly.cfm'},
    {n:'USGS Volcano Hazards Program — HANS (alert levels, aviation colour codes, VONA)',u:'https://volcanoes.usgs.gov/vhp/updates.html'},
    {n:'USGS Volcano Hazards Program — published volcano hazard zones',u:'https://www.usgs.gov/programs/VHP'},
    {n:'噴火警報・予報 — 気象庁 (JMA volcano warnings and eruption warning levels)',u:'https://www.jma.go.jp/bosai/map.html#contents=volcano'},
    {n:'International SIGMET (volcanic ash) — NOAA Aviation Weather Center',u:'https://aviationweather.gov/'},
    {n:'NASA GIBS — OMPS SO₂, upper troposphere & stratosphere',u:'https://www.earthdata.nasa.gov/'},
    {n:'DeepStateMap',u:'https://deepstatemap.live/'},
    {n:'historical-basemaps (aourednik)',u:'https://github.com/aourednik/historical-basemaps'},
    {n:'CShapes 2.0 (Schvitz et al., ETH Zürich)',u:'https://icr.ethz.ch/data/cshapes/'},
    {n:'Maddison Project Database 2020 (Bolt & van Zanden)',u:'https://www.rug.nl/ggdc/historicaldevelopment/maddison/'},
    {n:'World Bank Open Data',u:'https://data.worldbank.org/'},
    {n:'IMF World Economic Outlook',u:'https://www.imf.org/en/Publications/WEO'},
    {n:'WorldPop (University of Southampton)',u:'https://www.worldpop.org/'},
    {n:'AI provider — OpenAI (Anthropic / Google selectable)',u:'https://openai.com/'}
  ];
  /* ══ ⚠ (#R246) ONE RESOLVER FOR THIS REGISTRY'S DESCRIPTIONS, AND IT LIVES WITH THE REGISTRY ═══
     The `use:{en,jp}` object each entry used to carry is gone: every language's text — English and
     Japanese included — is `sourceUse` in its own js/locales/pages.<code>.js, lazily loaded, which
     is what puts the surface inside scripts/i18n-pages-audit.mjs's universe (it measures each
     language against every string PATH in the ENGLISH document, so with the English text living
     outside that file the de/ru/es translations were uncounted and the total absence of
     fr/ko/zh/zh-Hans read as 100 %). It also takes ~50 kB of prose out of the eager bundle.
     ⚠ THE READER IS HERE, ONCE. The in-app Sources dialog (js/app-body.js) and the reading page
     (js/sources-list.js) had a copy each, and two copies of one lookup is [[recurring-lessons]] G.
     ⚠ The page files are keyed by BCP-47 tag, not by the app's code (`jp`→`ja`, `zh`→`zh-hant`), and
     the tag comes from the registry — which is also what keeps a raw code out of the <script> src. */
  const _pgCode=(l)=>{ try{ return String(window.IntMapLang.htmlTag(l)||l).toLowerCase(); }catch(_){ return l==='jp'?'ja':l; } };
  const _pgDoc=(l)=>{ try{ const P=window.IntMapPageI18N; return (P&&P.doc&&P.doc(_pgCode(l)))||null; }catch(_){ return null; } };
  const useText=(name,lang)=>{ const d=_pgDoc(lang), e=_pgDoc('en');
    return (d&&d.sourceUse&&d.sourceUse[name])||(e&&e.sourceUse&&e.sourceUse[name])||''; };
  /* fetch the English document and the reader's, then call back; already-loaded languages are free */
  const ensureDocs=(lang,cb)=>{ const one=(l)=>{ if(_pgDoc(l)){ cb(); return; }
      const c=_pgCode(l); let ok=false; try{ ok=(window.IntMapLang.list()||[]).some(r=>String(r.html).toLowerCase()===c); }catch(_){}
      if(!ok) return; const sc=document.createElement('script'); sc.src='./js/locales/pages.'+c+'.js'; sc.async=true; sc.onload=cb; sc.onerror=cb; document.head.appendChild(sc); };
    one('en'); if(_pgCode(lang)!=='en') one(lang); };
  return { dashCards:DEFAULT_DASH_CARDS, dataSources:DATA_SOURCES, useText, ensureDocs };
})();
