/* ============================================================================
 *  IntMap · HISTORICAL CITY NAMES — Poland, Germany, Czechia, Slovakia   (#R427)
 * ----------------------------------------------------------------------------
 *  The single largest redrawing of a European map this app can travel across: the German names
 *  east of the Oder–Neisse, which stood until 1945 and were replaced wholesale in 1946–1947, plus
 *  the Prussian names of the provinces Poland regained in 1920, the German names of the Bohemian
 *  borderlands, and the Hungarian names Slovakia carried until 1919.
 *
 *  ⚠ A GERMAN NAME HERE IS A DATE, NOT AN OPINION. Each span ends at the year the place was
 *  actually renamed — 1945 for the territories taken in that year, 1920 for the ones the Treaty
 *  of Versailles moved, 1919 for Upper Hungary — and the rest of the timeline shows the modern
 *  label the tile carries.
 * ==========================================================================*/
import { C, E, N } from './lang.mjs';

export const ROWS = [
  /* ── the 1945 line: Silesia, Pomerania, East Prussia, Lubusz ─────────────────────────────── */
  C('wroclaw', 17.0326, 51.1097, 'PL', ['Wrocław', 'Wroclaw'], [
    E(0, 1945, N('Breslau', 'ブレスラウ', 'Бреслау', '布雷斯勞', '布雷斯劳', '브레슬라우')),
  ]),
  C('gdansk', 18.6466, 54.3520, 'PL', ['Gdańsk', 'Gdansk'], [
    E(0, 1945, N('Danzig', 'ダンツィヒ', 'Данциг', '但澤', '但泽', '단치히')),
  ]),
  C('szczecin', 14.5528, 53.4285, 'PL', ['Szczecin'], [
    E(0, 1945, N('Stettin', 'シュテッティン', 'Штеттин', '斯德丁', '斯德丁', '슈테틴')),
  ]),
  C('gdynia', 18.5305, 54.5189, 'PL', ['Gdynia'], [
    E(1939, 1945, N('Gotenhafen', 'ゴーテンハーフェン', 'Готенхафен', 0, 0, 0)),
  ]),
  C('sopot', 18.5601, 54.4418, 'PL', ['Sopot'], [
    E(0, 1945, N('Zoppot', 'ツォッポト', 'Цоппот', 0, 0, 0)),
  ]),
  C('elblag', 19.4044, 54.1522, 'PL', ['Elbląg', 'Elblag'], [
    E(0, 1945, N('Elbing', 'エルビング', 'Эльбинг', 0, 0, 0)),
  ]),
  C('olsztyn', 20.4801, 53.7784, 'PL', ['Olsztyn'], [
    E(0, 1945, N('Allenstein', 'アレンシュタイン', 'Алленштайн', 0, 0, 0)),
  ]),
  C('elk', 22.3564, 53.8275, 'PL', ['Ełk', 'Elk'], [
    E(0, 1945, N('Lyck', 'リュック', 'Лык', 0, 0, 0)),
  ]),
  C('gizycko', 21.7600, 54.0381, 'PL', ['Giżycko', 'Gizycko'], [
    E(0, 1945, N('Lötzen', 'レッツェン', 'Лётцен', 0, 0, 0)),
  ]),
  C('ketrzyn', 21.3789, 54.0797, 'PL', ['Kętrzyn', 'Ketrzyn'], [
    E(0, 1945, N('Rastenburg', 'ラステンブルク', 'Растенбург', 0, 0, 0)),
  ]),
  C('bartoszyce', 20.8089, 54.2531, 'PL', ['Bartoszyce'], [
    E(0, 1945, N('Bartenstein', 'バルテンシュタイン', 'Бартенштайн', 0, 0, 0)),
  ]),
  C('braniewo', 19.8269, 54.3811, 'PL', ['Braniewo'], [
    E(0, 1945, N('Braunsberg', 'ブラウンスベルク', 'Браунсберг', 0, 0, 0)),
  ]),
  C('malbork', 19.0297, 54.0361, 'PL', ['Malbork'], [
    E(0, 1945, N('Marienburg', 'マリエンブルク', 'Мариенбург', '馬林堡', '马林堡', '마리엔부르크')),
  ]),
  C('kwidzyn', 18.9311, 53.7358, 'PL', ['Kwidzyn'], [
    E(0, 1945, N('Marienwerder', 'マリーエンヴェルダー', 'Мариенвердер', 0, 0, 0)),
  ]),
  C('ostroda', 19.9650, 53.6958, 'PL', ['Ostróda', 'Ostroda'], [
    E(0, 1945, N('Osterode in Ostpreußen', 'オスターローデ・イン・オストプロイセン', 'Остероде', 0, 0, 0)),
  ]),
  C('ilawa', 19.5658, 53.5964, 'PL', ['Iława', 'Ilawa'], [
    E(0, 1945, N('Deutsch Eylau', 'ドイチュ・アイラウ', 'Дойч-Эйлау', 0, 0, 0)),
  ]),
  C('pisz', 21.8119, 53.6264, 'PL', ['Pisz'], [
    E(0, 1945, N('Johannisburg', 'ヨハニスブルク', 'Йоханнисбург', 0, 0, 0)),
  ]),
  C('mragowo', 21.3044, 53.8642, 'PL', ['Mrągowo', 'Mragowo'], [
    E(0, 1945, N('Sensburg', 'ゼンスブルク', 'Зенсбург', 0, 0, 0)),
  ]),
  C('kolobrzeg', 15.5766, 54.1758, 'PL', ['Kołobrzeg', 'Kolobrzeg'], [
    E(0, 1945, N('Kolberg', 'コルベルク', 'Кольберг', 0, 0, 0)),
  ]),
  C('koszalin', 16.1814, 54.1943, 'PL', ['Koszalin'], [
    E(0, 1945, N('Köslin', 'ケスリン', 'Кёслин', 0, 0, 0)),
  ]),
  C('slupsk', 17.0287, 54.4641, 'PL', ['Słupsk', 'Slupsk'], [
    E(0, 1945, N('Stolp', 'シュトルプ', 'Штольп', 0, 0, 0)),
  ]),
  C('swinoujscie', 14.2478, 53.9106, 'PL', ['Świnoujście', 'Swinoujscie'], [
    E(0, 1945, N('Swinemünde', 'スヴィネミュンデ', 'Свинемюнде', 0, 0, 0)),
  ]),
  C('stargard', 15.0428, 53.3364, 'PL', ['Stargard'], [
    E(0, 1945, N('Stargard in Pommern', 'シュタルガルト・イン・ポンメルン', 'Штаргард-ин-Поммерн', 0, 0, 0)),
  ]),
  C('szczecinek', 16.6989, 53.7083, 'PL', ['Szczecinek'], [
    E(0, 1945, N('Neustettin', 'ノイシュテッティン', 'Нойштеттин', 0, 0, 0)),
  ]),
  C('walcz', 16.4719, 53.2739, 'PL', ['Wałcz', 'Walcz'], [
    E(0, 1945, N('Deutsch Krone', 'ドイチュ・クローネ', 'Дойч-Кроне', 0, 0, 0)),
  ]),
  C('choszczno', 15.4181, 53.1653, 'PL', ['Choszczno'], [
    E(0, 1945, N('Arnswalde', 'アルンスヴァルデ', 'Арнсвальде', 0, 0, 0)),
  ]),
  C('mysliborz', 14.8681, 52.9247, 'PL', ['Myślibórz', 'Mysliborz'], [
    E(0, 1945, N('Soldin', 'ゾルディン', 'Зольдин', 0, 0, 0)),
  ]),
  C('kostrzyn-nad-odra', 14.6469, 52.5894, 'PL', ['Kostrzyn nad Odrą', 'Kostrzyn nad Odra'], [
    E(0, 1945, N('Küstrin', 'キュストリン', 'Кюстрин', 0, 0, 0)),
  ]),
  C('gorzow-wielkopolski', 15.2394, 52.7368, 'PL', ['Gorzów Wielkopolski', 'Gorzow Wielkopolski'], [
    E(0, 1945, N('Landsberg an der Warthe', 'ランツベルク・アン・デア・ヴァルテ', 'Ландсберг-на-Варте', 0, 0, 0)),
  ]),
  C('zielona-gora', 15.5064, 51.9356, 'PL', ['Zielona Góra', 'Zielona Gora'], [
    E(0, 1945, N('Grünberg in Schlesien', 'グリューンベルク・イン・シュレージエン', 'Грюнберг', 0, 0, 0)),
  ]),
  C('nowa-sol', 15.7161, 51.8028, 'PL', ['Nowa Sól', 'Nowa Sol'], [
    E(0, 1945, N('Neusalz an der Oder', 'ノイザルツ', 'Нойзальц', 0, 0, 0)),
  ]),
  C('zagan', 15.3158, 51.6169, 'PL', ['Żagań', 'Zagan'], [
    E(0, 1945, N('Sagan', 'ザーガン', 'Заган', 0, 0, 0)),
  ]),
  C('zary', 15.1403, 51.6403, 'PL', ['Żary', 'Zary'], [
    E(0, 1945, N('Sorau', 'ゾーラウ', 'Зорау', 0, 0, 0)),
  ]),
  C('luban', 15.2892, 51.1206, 'PL', ['Lubań', 'Luban'], [
    E(0, 1945, N('Lauban', 'ラウバン', 'Лаубан', 0, 0, 0)),
  ]),
  C('zgorzelec', 15.0064, 51.1489, 'PL', ['Zgorzelec'], [
    E(0, 1945, N('Görlitz (east bank)', 'ゲルリッツ（東岸）', 'Гёрлиц (восточный берег)', 0, 0, 0)),
  ]),
  C('boleslawiec', 15.5697, 51.2639, 'PL', ['Bolesławiec', 'Boleslawiec'], [
    E(0, 1945, N('Bunzlau', 'ブンツラウ', 'Бунцлау', 0, 0, 0)),
  ]),
  C('legnica', 16.1619, 51.2100, 'PL', ['Legnica'], [
    E(0, 1945, N('Liegnitz', 'リーグニッツ', 'Лигниц', 0, 0, 0)),
  ]),
  C('glogow', 16.0861, 51.6636, 'PL', ['Głogów', 'Glogow'], [
    E(0, 1945, N('Glogau', 'グローガウ', 'Глогау', 0, 0, 0)),
  ]),
  C('walbrzych', 16.2844, 50.7714, 'PL', ['Wałbrzych', 'Walbrzych'], [
    E(0, 1945, N('Waldenburg in Schlesien', 'ヴァルデンブルク・イン・シュレージエン', 'Вальденбург', 0, 0, 0)),
  ]),
  C('jelenia-gora', 15.7289, 50.8994, 'PL', ['Jelenia Góra', 'Jelenia Gora'], [
    E(0, 1945, N('Hirschberg im Riesengebirge', 'ヒルシュベルク・イム・リーゼンゲビルゲ', 'Хиршберг', 0, 0, 0)),
  ]),
  C('swidnica', 16.4892, 50.8444, 'PL', ['Świdnica', 'Swidnica'], [
    E(0, 1945, N('Schweidnitz', 'シュヴァイトニッツ', 'Швайдниц', 0, 0, 0)),
  ]),
  C('dzierzoniow', 16.6519, 50.7278, 'PL', ['Dzierżoniów', 'Dzierzoniow'], [
    E(0, 1945, N('Reichenbach im Eulengebirge', 'ライヒェンバッハ・イム・オイレンゲビルゲ', 'Райхенбах', 0, 0, 0)),
  ]),
  C('klodzko', 16.6597, 50.4353, 'PL', ['Kłodzko', 'Klodzko'], [
    E(0, 1945, N('Glatz', 'グラーツ', 'Глац', 0, 0, 0)),
  ]),
  C('zabkowice-slaskie', 16.8125, 50.5903, 'PL', ['Ząbkowice Śląskie', 'Zabkowice Slaskie'], [
    E(0, 1945, N('Frankenstein in Schlesien', 'フランケンシュタイン・イン・シュレージエン', 'Франкенштайн', 0, 0, 0)),
  ]),
  C('brzeg', 17.4675, 50.8611, 'PL', ['Brzeg'], [
    E(0, 1945, N('Brieg', 'ブリーク', 'Бриг', 0, 0, 0)),
  ]),
  C('olawa', 17.2969, 50.9444, 'PL', ['Oława', 'Olawa'], [
    E(0, 1945, N('Ohlau', 'オーラウ', 'Олау', 0, 0, 0)),
  ]),
  C('olesnica', 17.3831, 51.2094, 'PL', ['Oleśnica', 'Olesnica'], [
    E(0, 1945, N('Oels', 'エルス', 'Эльс', 0, 0, 0)),
  ]),
  C('namyslow', 17.7031, 51.0750, 'PL', ['Namysłów', 'Namyslow'], [
    E(0, 1945, N('Namslau', 'ナムスラウ', 'Намслау', 0, 0, 0)),
  ]),
  C('kluczbork', 18.2181, 50.9722, 'PL', ['Kluczbork'], [
    E(0, 1945, N('Kreuzburg in Oberschlesien', 'クロイツブルク・イン・オーバーシュレージエン', 'Кройцбург', 0, 0, 0)),
  ]),
  C('opole', 17.9333, 50.6751, 'PL', ['Opole'], [
    E(0, 1945, N('Oppeln', 'オッペルン', 'Оппельн', 0, 0, 0)),
  ]),
  C('nysa', 17.3339, 50.4736, 'PL', ['Nysa'], [
    E(0, 1945, N('Neisse', 'ナイセ', 'Нейсе', 0, 0, 0)),
  ]),
  C('prudnik', 17.5786, 50.3203, 'PL', ['Prudnik'], [
    E(0, 1945, N('Neustadt in Oberschlesien', 'ノイシュタット・イン・オーバーシュレージエン', 'Нойштадт', 0, 0, 0)),
  ]),
  C('glubczyce', 17.8272, 50.2011, 'PL', ['Głubczyce', 'Glubczyce'], [
    E(0, 1945, N('Leobschütz', 'レオープシュッツ', 'Леобшюц', 0, 0, 0)),
  ]),
  C('raciborz', 18.2200, 50.0917, 'PL', ['Racibórz', 'Raciborz'], [
    E(0, 1945, N('Ratibor', 'ラティボール', 'Ратибор', 0, 0, 0)),
  ]),
  C('kedzierzyn-kozle', 18.2264, 50.3494, 'PL', ['Kędzierzyn-Koźle', 'Kedzierzyn-Kozle'], [
    E(0, 1945, N('Cosel', 'コーゼル', 'Козель', 0, 0, 0)),
  ]),
  C('krapkowice', 17.9647, 50.4744, 'PL', ['Krapkowice'], [
    E(0, 1945, N('Krappitz', 'クラピッツ', 'Краппиц', 0, 0, 0)),
  ]),
  C('strzelce-opolskie', 18.3033, 50.5106, 'PL', ['Strzelce Opolskie'], [
    E(0, 1945, N('Groß Strehlitz', 'グロース・シュトレーリッツ', 'Гросс-Штрелиц', 0, 0, 0)),
  ]),
  C('gliwice', 18.6714, 50.2945, 'PL', ['Gliwice'], [
    E(0, 1945, N('Gleiwitz', 'グライヴィッツ', 'Гляйвиц', '格萊維茨', '格莱维茨', '글라이비츠')),
  ]),
  C('zabrze', 18.7856, 50.3249, 'PL', ['Zabrze'], [
    E(1915, 1945, N('Hindenburg in Oberschlesien', 'ヒンデンブルク・イン・オーバーシュレージエン', 'Гинденбург', 0, 0, 0)),
  ]),
  C('bytom', 18.9156, 50.3483, 'PL', ['Bytom'], [
    E(0, 1945, N('Beuthen', 'ボイテン', 'Бойтен', 0, 0, 0)),
  ]),
  C('chorzow', 18.9547, 50.2975, 'PL', ['Chorzów', 'Chorzow'], [
    E(0, 1921, N('Königshütte', 'ケーニヒスヒュッテ', 'Кёнигсхютте', 0, 0, 0)),
    E(1939, 1945, N('Königshütte', 'ケーニヒスヒュッテ', 'Кёнигсхютте', 0, 0, 0)),
  ]),
  C('pyskowice', 18.6331, 50.4008, 'PL', ['Pyskowice'], [
    E(0, 1945, N('Peiskretscham', 'パイスクレチャム', 'Пайскречам', 0, 0, 0)),
  ]),
  C('tarnowskie-gory', 18.8592, 50.4458, 'PL', ['Tarnowskie Góry', 'Tarnowskie Gory'], [
    E(0, 1922, N('Tarnowitz', 'タルノヴィッツ', 'Тарновиц', 0, 0, 0)),
  ]),
  C('lubliniec', 18.6858, 50.6672, 'PL', ['Lubliniec'], [
    E(0, 1922, N('Lublinitz', 'ルブリニッツ', 'Люблиниц', 0, 0, 0)),
  ]),
  /* ── the 1920 line: the provinces Versailles moved back to Poland ─────────────────────────── */
  C('poznan', 16.9252, 52.4064, 'PL', ['Poznań', 'Poznan'], [
    E(0, 1918, N('Posen', 'ポーゼン', 'Позен', '波森', '波森', '포젠')),
  ]),
  C('bydgoszcz', 17.9990, 53.1235, 'PL', ['Bydgoszcz'], [
    E(0, 1919, N('Bromberg', 'ブロンベルク', 'Бромберг', 0, 0, 0)),
  ]),
  C('torun', 18.5985, 53.0138, 'PL', ['Toruń', 'Torun'], [
    E(0, 1919, N('Thorn', 'トルン', 'Торн', 0, 0, 0)),
  ]),
  C('grudziadz', 18.7554, 53.4837, 'PL', ['Grudziądz', 'Grudziadz'], [
    E(0, 1919, N('Graudenz', 'グラウデンツ', 'Грауденц', 0, 0, 0)),
  ]),
  C('inowroclaw', 18.2611, 52.7972, 'PL', ['Inowrocław', 'Inowroclaw'], [
    E(1904, 1919, N('Hohensalza', 'ホーエンザルツァ', 'Хоэнзальца', 0, 0, 0)),
  ]),
  C('gniezno', 17.5828, 52.5348, 'PL', ['Gniezno'], [
    E(0, 1918, N('Gnesen', 'グネーゼン', 'Гнезен', 0, 0, 0)),
  ]),
  C('leszno', 16.5775, 51.8444, 'PL', ['Leszno'], [
    E(0, 1919, N('Lissa', 'リッサ', 'Лисса', 0, 0, 0)),
  ]),
  C('tczew', 18.7797, 54.0925, 'PL', ['Tczew'], [
    E(0, 1919, N('Dirschau', 'ディルシャウ', 'Диршау', 0, 0, 0)),
  ]),
  C('starogard-gdanski', 18.5300, 53.9656, 'PL', ['Starogard Gdański', 'Starogard Gdanski'], [
    E(0, 1919, N('Preußisch Stargard', 'プロイシッシュ・シュタルガルト', 'Прейсиш-Штаргард', 0, 0, 0)),
  ]),
  C('chojnice', 17.5567, 53.6958, 'PL', ['Chojnice'], [
    E(0, 1919, N('Konitz', 'コーニッツ', 'Кониц', 0, 0, 0)),
  ]),
  C('lebork', 17.7503, 54.5394, 'PL', ['Lębork', 'Lebork'], [
    E(0, 1945, N('Lauenburg in Pommern', 'ラウエンブルク・イン・ポンメルン', 'Лауэнбург', 0, 0, 0)),
  ]),
  C('wejherowo', 18.2358, 54.6053, 'PL', ['Wejherowo'], [
    E(0, 1919, N('Neustadt in Westpreußen', 'ノイシュタット・イン・ヴェストプロイセン', 'Нойштадт', 0, 0, 0)),
  ]),
  C('pila', 16.7414, 53.1511, 'PL', ['Piła', 'Pila'], [
    E(0, 1945, N('Schneidemühl', 'シュナイデミュール', 'Шнайдемюль', 0, 0, 0)),
  ]),
  /* ── the German occupation names of 1939–1945 ─────────────────────────────────────────────── */
  C('lodz', 19.4570, 51.7592, 'PL', ['Łódź', 'Lodz'], [
    E(1940, 1944, N('Litzmannstadt', 'リッツマンシュタット', 'Лицманштадт', 0, 0, 0)),
  ]),
  C('oswiecim', 19.2211, 50.0347, 'PL', ['Oświęcim', 'Oswiecim'], [
    E(1939, 1944, N('Auschwitz', 'アウシュヴィッツ', 'Освенцим', '奧斯威辛', '奥斯威辛', '아우슈비츠')),
  ]),
  C('rzeszow', 21.9990, 50.0413, 'PL', ['Rzeszów', 'Rzeszow'], [
    E(1941, 1944, N('Reichshof', 'ライヒスホーフ', 'Райхсхоф', 0, 0, 0)),
  ]),
  /* ── Germany ────────────────────────────────────────────────────────────────────────────── */
  C('chemnitz', 12.9242, 50.8333, 'DE', ['Chemnitz'], [
    E(1953, 1989, N('Karl-Marx-Stadt', 'カール・マルクス・シュタット', 'Карл-Маркс-Штадт', '卡爾馬克思城', '卡尔马克思城', '카를마르크스슈타트')),
  ]),
  C('eisenhuettenstadt', 14.6383, 52.1500, 'DE', ['Eisenhüttenstadt', 'Eisenhuttenstadt'], [
    E(1953, 1960, N('Stalinstadt', 'シュターリンシュタット', 'Сталинштадт', 0, 0, 0)),
  ]),
  C('guben', 14.7150, 51.9506, 'DE', ['Guben'], [
    E(1961, 1990, N('Wilhelm-Pieck-Stadt Guben', 'ヴィルヘルム・ピーク・シュタット・グーベン', 'Вильгельм-Пик-Штадт-Губен', 0, 0, 0)),
  ]),
  C('wuppertal', 7.1833, 51.2562, 'DE', ['Wuppertal'], [
    E(1929, 1929, N('Barmen-Elberfeld', 'バルメン・エルバーフェルト', 'Бармен-Эльберфельд', 0, 0, 0)),
  ]),
  /* ── the Bohemian and Moravian borderlands ──────────────────────────────────────────────── */
  C('karlovy-vary', 12.8712, 50.2321, 'CZ', ['Karlovy Vary'], [
    E(0, 1945, N('Karlsbad', 'カールスバート', 'Карлсбад', '卡爾斯巴德', '卡尔斯巴德', '카를스바트')),
  ]),
  C('marianske-lazne', 12.7011, 49.9646, 'CZ', ['Mariánské Lázně', 'Marianske Lazne'], [
    E(0, 1945, N('Marienbad', 'マリエンバート', 'Мариенбад', 0, 0, 0)),
  ]),
  C('usti-nad-labem', 14.0375, 50.6607, 'CZ', ['Ústí nad Labem', 'Usti nad Labem'], [
    E(0, 1945, N('Aussig', 'アウシヒ', 'Ауссиг', 0, 0, 0)),
  ]),
  C('liberec', 15.0562, 50.7663, 'CZ', ['Liberec'], [
    E(0, 1945, N('Reichenberg', 'ライヒェンベルク', 'Райхенберг', 0, 0, 0)),
  ]),
  C('cheb', 12.3743, 50.0796, 'CZ', ['Cheb'], [
    E(0, 1945, N('Eger', 'エーガー', 'Эгер', 0, 0, 0)),
  ]),
  C('decin', 14.2125, 50.7821, 'CZ', ['Děčín', 'Decin'], [
    E(0, 1945, N('Tetschen', 'テチェン', 'Течен', 0, 0, 0)),
  ]),
  C('chomutov', 13.4179, 50.4604, 'CZ', ['Chomutov'], [
    E(0, 1945, N('Komotau', 'コモタウ', 'Комотау', 0, 0, 0)),
  ]),
  C('most', 13.6362, 50.5031, 'CZ', ['Most'], [
    E(0, 1945, N('Brüx', 'ブリュックス', 'Брюкс', 0, 0, 0)),
  ]),
  C('teplice', 13.8245, 50.6404, 'CZ', ['Teplice'], [
    E(0, 1945, N('Teplitz-Schönau', 'テプリッツ・シェーナウ', 'Теплиц-Шёнау', 0, 0, 0)),
  ]),
  C('opava', 17.9026, 49.9384, 'CZ', ['Opava'], [
    E(0, 1945, N('Troppau', 'トロッパウ', 'Троппау', 0, 0, 0)),
  ]),
  C('znojmo', 16.0488, 48.8555, 'CZ', ['Znojmo'], [
    E(0, 1945, N('Znaim', 'ツナイム', 'Цнайм', 0, 0, 0)),
  ]),
  C('jihlava', 15.5906, 49.3961, 'CZ', ['Jihlava'], [
    E(0, 1945, N('Iglau', 'イーグラウ', 'Иглау', 0, 0, 0)),
  ]),
  C('olomouc', 17.2509, 49.5938, 'CZ', ['Olomouc'], [
    E(0, 1918, N('Olmütz', 'オルミュッツ', 'Ольмюц', 0, 0, 0)),
  ]),
  C('brno', 16.6068, 49.1951, 'CZ', ['Brno'], [
    E(0, 1918, N('Brünn', 'ブリュン', 'Брюнн', '布爾諾', '布尔诺', '브륀')),
  ]),
  C('ceske-budejovice', 14.4747, 48.9745, 'CZ', ['České Budějovice', 'Ceske Budejovice'], [
    E(0, 1918, N('Budweis', 'ブトヴァイス', 'Будвайс', 0, 0, 0)),
  ]),
  C('plzen', 13.3776, 49.7475, 'CZ', ['Plzeň', 'Plzen'], [
    E(0, 1918, N('Pilsen', 'ピルゼン', 'Пильзен', '皮爾森', '皮尔森', '필젠')),
  ]),
  C('karvina', 18.5419, 49.8542, 'CZ', ['Karviná', 'Karvina'], [
    E(0, 1918, N('Karwin', 'カルヴィン', 'Карвин', 0, 0, 0)),
  ]),
  C('ostrava', 18.2625, 49.8209, 'CZ', ['Ostrava'], [
    E(0, 1918, N('Mährisch Ostrau', 'メーリッシュ・オストラウ', 'Меришь-Острау', 0, 0, 0)),
  ]),
  C('zlin', 17.6668, 49.2264, 'CZ', ['Zlín', 'Zlin'], [
    E(1949, 1989, N('Gottwaldov', 'ゴットワルドフ', 'Готвальдов', 0, 0, 0)),
  ]),
  C('havlickuv-brod', 15.5806, 49.6078, 'CZ', ['Havlíčkův Brod', 'Havlickuv Brod'], [
    E(0, 1944, N('Německý Brod', 'ニェメツキー・ブロト', 'Немецкий Брод', 0, 0, 0, { de: 'Deutschbrod' })),
  ]),
  /* ── Slovakia: Hungarian and German until 1919 ────────────────────────────────────────────── */
  C('bratislava', 17.1077, 48.1486, 'SK', ['Bratislava'], [
    E(0, 1918, N('Pressburg', 'プレスブルク', 'Прессбург', '普雷斯堡', '普雷斯堡', '프레스부르크')),
  ]),
  C('kosice', 21.2611, 48.7164, 'SK', ['Košice', 'Kosice'], [
    E(0, 1918, N('Kassa', 'カッシャ', 'Кашша', 0, 0, 0, { de: 'Kaschau' })),
    E(1938, 1944, N('Kassa', 'カッシャ', 'Кашша', 0, 0, 0, { de: 'Kaschau' })),
  ]),
  C('presov', 21.2393, 48.9975, 'SK', ['Prešov', 'Presov'], [
    E(0, 1918, N('Eperjes', 'エペルイェシュ', 'Эперьеш', 0, 0, 0, { de: 'Eperies' })),
  ]),
  C('banska-bystrica', 19.1462, 48.7364, 'SK', ['Banská Bystrica', 'Banska Bystrica'], [
    E(0, 1918, N('Besztercebánya', 'ベステルツェバーニャ', 'Бестерцебанья', 0, 0, 0, { de: 'Neusohl' })),
  ]),
  C('nitra', 18.0902, 48.3069, 'SK', ['Nitra'], [
    E(0, 1918, N('Nyitra', 'ニトラ', 'Нитра', 0, 0, 0, { de: 'Neutra' })),
  ]),
  /* ⚠ «Komárno!» / «Komarno!» — the gazetteer's second Komárno is the OKRES (district) centroid
     42 km north of the town, in the same country; OpenMapTiles' `place` layer carries no districts,
     so there is no second settlement with this spelling to relabel. */
  C('komarno', 18.1281, 47.7639, 'SK', ['Komárno!', 'Komarno!'], [
    E(0, 1918, N('Komárom', 'コマーロム', 'Комаром', 0, 0, 0, { de: 'Komorn' })),
  ]),
];
