/* ============================================================================
 *  IntMap · HISTORICAL CITY NAMES — Russia   (#R427)
 * ----------------------------------------------------------------------------
 *  The deepest single source of renamings this app can travel through: the imperial names the
 *  revolution replaced, the leaders' names the Soviet period put on the map and took off again,
 *  the German and Finnish names of the territory annexed in 1945, and the Japanese names of
 *  southern Sakhalin. See scripts/histcities/lang.mjs for what a row is.
 * ==========================================================================*/
import { C, E, N } from './lang.mjs';

export const ROWS = [
  /* ── the great imperial / Soviet renamings ─────────────────────────────────────────────── */
  C('saint-petersburg', 30.3141, 59.9386, 'RU', ['Saint Petersburg', 'Санкт-Петербург', 'St Petersburg', 'St. Petersburg'], [
    E(1914, 1923, N('Petrograd', 'ペトログラード', 'Петроград', '彼得格勒', '彼得格勒', '페트로그라드')),
    E(1924, 1991, N('Leningrad', 'レニングラード', 'Ленинград', '列寧格勒', '列宁格勒', '레닌그라드', { fr: 'Léningrad', es: 'Leningrado' })),
  ]),
  C('volgograd', 44.5169, 48.7080, 'RU', ['Volgograd', 'Волгоград'], [
    E(0, 1924, N('Tsaritsyn', 'ツァリーツィン', 'Царицын', '察里津', '察里津', '차리친', { de: 'Zarizyn', fr: 'Tsaritsyne' })),
    E(1925, 1961, N('Stalingrad', 'スターリングラード', 'Сталинград', '史達林格勒', '斯大林格勒', '스탈린그라드', { es: 'Stalingrado' })),
  ]),
  C('yekaterinburg', 60.5975, 56.8389, 'RU', ['Yekaterinburg', 'Екатеринбург', 'Ekaterinburg'], [
    E(1924, 1991, N('Sverdlovsk', 'スヴェルドロフスク', 'Свердловск', '斯維爾德洛夫斯克', '斯维尔德洛夫斯克', '스베르들롭스크')),
  ]),
  C('nizhny-novgorod', 44.0020, 56.3269, 'RU', ['Nizhny Novgorod', 'Нижний Новгород'], [
    E(1932, 1990, N('Gorky', 'ゴーリキー', 'Горький', '高爾基', '高尔基', '고리키', { de: 'Gorki', fr: 'Gorki', es: 'Gorki' })),
  ]),
  C('samara', 50.1006, 53.1951, 'RU', ['Samara', 'Самара'], [
    E(1935, 1990, N('Kuybyshev', 'クイビシェフ', 'Куйбышев', '古比雪夫', '古比雪夫', '쿠이비셰프', { de: 'Kuibyschew', fr: 'Kouïbychev' })),
  ]),
  C('tver', 35.9119, 56.8587, 'RU', ['Tver', 'Тверь'], [
    E(1931, 1990, N('Kalinin', 'カリーニン', 'Калинин', '加里寧', '加里宁', '칼리닌')),
  ]),
  C('perm', 56.2295, 58.0105, 'RU', ['Perm', 'Пермь'], [
    E(1940, 1957, N('Molotov', 'モロトフ', 'Молотов', '莫洛托夫', '莫洛托夫', '몰로토프')),
  ]),
  C('ulyanovsk', 48.4048, 54.3142, 'RU', ['Ulyanovsk', 'Ульяновск'], [
    E(0, 1923, N('Simbirsk', 'シンビルスク', 'Симбирск', '辛比爾斯克', '辛比尔斯克', '심비르스크')),
  ]),
  C('kirov-vyatka', 49.6601, 58.6035, 'RU', ['Kirov', 'Киров'], [
    E(0, 1933, N('Vyatka', 'ヴャトカ', 'Вятка', '維亞特卡', '维亚特卡', '뱌트카', { de: 'Wjatka', fr: 'Viatka' })),
  ]),
  C('krasnodar', 38.9769, 45.0355, 'RU', ['Krasnodar', 'Краснодар'], [
    E(0, 1920, N('Yekaterinodar', 'エカテリノダール', 'Екатеринодар', '葉卡捷琳諾達爾', '叶卡捷琳诺达尔', '예카테리노다르', { de: 'Jekaterinodar', fr: 'Iekaterinodar' })),
  ]),
  C('novosibirsk', 82.9346, 55.0084, 'RU', ['Novosibirsk', 'Новосибирск'], [
    E(0, 1925, N('Novonikolayevsk', 'ノヴォニコラエフスク', 'Новониколаевск', 0, 0, 0, { de: 'Nowonikolajewsk' })),
  ]),
  C('novokuznetsk', 87.1099, 53.7557, 'RU', ['Novokuznetsk', 'Новокузнецк'], [
    E(1932, 1960, N('Stalinsk', 'スターリンスク', 'Сталинск', '斯大林斯克', '斯大林斯克', '스탈린스크')),
  ]),
  C('vladikavkaz', 44.6819, 43.0367, 'RU', ['Vladikavkaz', 'Владикавказ'], [
    E(1931, 1943, N('Ordzhonikidze', 'オルジョニキーゼ', 'Орджоникидзе', '奧爾忠尼啟則', '奥尔忠尼启则', '오르조니키제')),
    E(1944, 1953, N('Dzaudzhikau', 'ジャウジカウ', 'Дзауджикау', 0, 0, 0)),
    E(1954, 1989, N('Ordzhonikidze', 'オルジョニキーゼ', 'Орджоникидзе', '奧爾忠尼啟則', '奥尔忠尼启则', '오르조니키제')),
  ]),
  C('stavropol', 41.9692, 45.0448, 'RU', ['Stavropol', 'Ставрополь'], [
    E(1935, 1942, N('Voroshilovsk', 'ヴォロシーロフスク', 'Ворошиловск', '伏羅希洛夫斯克', '伏罗希洛夫斯克', '보로실롭스크')),
  ]),
  C('orenburg', 55.0969, 51.7682, 'RU', ['Orenburg', 'Оренбург'], [
    E(1938, 1957, N('Chkalov', 'チカロフ', 'Чкалов', '奇卡洛夫', '奇卡洛夫', '치칼로프', { de: 'Tschkalow' })),
  ]),
  C('togliatti', 49.4204, 53.5078, 'RU', ['Tolyatti', 'Тольятти', 'Togliatti'], [
    E(0, 1963, N('Stavropol-on-Volga', 'スタヴロポリ・ナ・ヴォルゲ', 'Ставрополь-на-Волге', 0, 0, 0, { fr: 'Stavropol-sur-Volga' })),
  ]),
  C('sergiyev-posad', 38.1360, 56.3150, 'RU', ['Sergiyev Posad', 'Сергиев Посад'], [
    E(1930, 1991, N('Zagorsk', 'ザゴルスク', 'Загорск', '扎戈爾斯克', '扎戈尔斯克', '자고르스크')),
  ]),
  C('rybinsk', 38.8425, 58.0446, 'RU', ['Rybinsk', 'Рыбинск'], [
    E(1946, 1956, N('Shcherbakov', 'シチェルバコフ', 'Щербаков', 0, 0, 0)),
    E(1984, 1988, N('Andropov', 'アンドロポフ', 'Андропов', '安德羅波夫', '安德罗波夫', '안드로포프')),
  ]),
  C('naberezhnye-chelny', 52.4066, 55.7436, 'RU', ['Naberezhnye Chelny', 'Набережные Челны'], [
    E(1982, 1987, N('Brezhnev', 'ブレジネフ', 'Брежнев', '布里茲涅夫', '勃列日涅夫', '브레즈네프', { de: 'Breschnew', fr: 'Brejnev' })),
  ]),
  C('izhevsk', 53.2045, 56.8527, 'RU', ['Izhevsk', 'Ижевск'], [
    E(1985, 1986, N('Ustinov', 'ウスチノフ', 'Устинов', '烏斯季諾夫', '乌斯季诺夫', '우스티노프')),
  ]),
  C('sharypovo', 89.2000, 55.5333, 'RU', ['Sharypovo', 'Шарыпово'], [
    E(1985, 1987, N('Chernenko', 'チェルネンコ', 'Черненко', '契爾年科', '契尔年科', '체르넨코')),
  ]),
  /* ⚠ «Korolyov!» — the gazetteer's other Korolyov (UA, 114 034) is Корольовський район, a DISTRICT
     of Zhytomyr, not a settlement; OpenMapTiles' `place` layer does not carry raions, so nothing
     with that spelling can be relabelled. The town really was called Kaliningrad until 1996 — the
     second Kaliningrad on a Soviet map, 1 200 km from the first, which is why it is here. */
  C('korolyov', 37.8256, 55.9142, 'RU', ['Korolyov!', 'Королёв', 'Korolev'], [
    E(1938, 1995, N('Kaliningrad', 'カリーニングラード', 'Калининград', '加里寧格勒', '加里宁格勒', '칼리닌그라드')),
  ]),
  C('ivanovo', 40.9739, 56.9991, 'RU', ['Ivanovo', 'Иваново'], [
    E(0, 1931, N('Ivanovo-Voznesensk', 'イワノヴォ・ヴォズネセンスク', 'Иваново-Вознесенск', 0, 0, 0)),
  ]),
  C('kemerovo', 86.0873, 55.3547, 'RU', ['Kemerovo', 'Кемерово'], [
    E(0, 1931, N('Shcheglovsk', 'シチェグロフスク', 'Щегловск', 0, 0, 0)),
  ]),
  C('engels', 46.1146, 51.4830, 'RU', ['Engels', 'Энгельс'], [
    E(0, 1930, N('Pokrovsk', 'ポクロフスク', 'Покровск', 0, 0, 0)),
  ]),
  C('dimitrovgrad', 49.6162, 54.2194, 'RU', ['Dimitrovgrad', 'Димитровград'], [
    E(0, 1971, N('Melekess', 'メレケス', 'Мелекесс', 0, 0, 0)),
  ]),
  C('severodvinsk', 39.8302, 64.5635, 'RU', ['Severodvinsk', 'Северодвинск'], [
    E(1936, 1937, N('Sudostroy', 'スドストロイ', 'Судострой', 0, 0, 0)),
    E(1938, 1956, N('Molotovsk', 'モロトフスク', 'Молотовск', 0, 0, 0)),
  ]),
  C('syktyvkar', 50.8356, 61.6684, 'RU', ['Syktyvkar', 'Сыктывкар'], [
    E(0, 1929, N('Ust-Sysolsk', 'ウスチ・スイソリスク', 'Усть-Сысольск', 0, 0, 0)),
  ]),
  C('makhachkala', 47.5024, 42.9764, 'RU', ['Makhachkala', 'Махачкала'], [
    E(0, 1920, N('Petrovsk-Port', 'ペトロフスク・ポルト', 'Петровск-Порт', 0, 0, 0)),
  ]),
  C('buynaksk', 47.1167, 42.8167, 'RU', ['Buynaksk', 'Буйнакск'], [
    E(0, 1921, N('Temir-Khan-Shura', 'テミル・ハン・シュラ', 'Темир-Хан-Шура', 0, 0, 0)),
  ]),
  C('kaspiysk', 47.6383, 42.8783, 'RU', ['Kaspiysk', 'Каспийск'], [
    E(0, 1946, N('Dvigatelstroy', 'ドヴィガテリストロイ', 'Двигательстрой', 0, 0, 0)),
  ]),
  C('yoshkar-ola', 47.8908, 56.6316, 'RU', ['Yoshkar-Ola', 'Йошкар-Ола'], [
    E(0, 1918, N('Tsarevokokshaysk', 'ツァレヴォコクシャイスク', 'Царевококшайск', 0, 0, 0)),
    E(1919, 1926, N('Krasnokokshaysk', 'クラスノコクシャイスク', 'Краснококшайск', 0, 0, 0)),
  ]),
  C('elista', 44.2558, 46.3078, 'RU', ['Elista', 'Элиста'], [
    E(1944, 1956, N('Stepnoy', 'ステプノイ', 'Степной', 0, 0, 0)),
  ]),
  C('cherkessk', 42.0578, 44.2269, 'RU', ['Cherkessk', 'Черкесск'], [
    E(0, 1930, N('Batalpashinsk', 'バタルパシンスク', 'Баталпашинск', 0, 0, 0)),
    E(1934, 1936, N('Sulimov', 'スリモフ', 'Сулимов', 0, 0, 0)),
    E(1937, 1938, N('Yezhovo-Cherkessk', 'エジョヴォ・チェルケッスク', 'Ежово-Черкесск', 0, 0, 0)),
  ]),
  C('karachayevsk', 41.9139, 43.7736, 'RU', ['Karachayevsk', 'Карачаевск'], [
    E(1929, 1943, N('Mikoyan-Shakhar', 'ミコヤン・シャハル', 'Микоян-Шахар', 0, 0, 0)),
    E(1944, 1956, N('Klukhori', 'クルホリ', 'Клухори', 0, 0, 0)),
  ]),
  C('shakhty', 40.2158, 47.7085, 'RU', ['Shakhty', 'Шахты'], [
    E(0, 1919, N('Aleksandrovsk-Grushevsky', 'アレクサンドロフスク・グルシェフスキー', 'Александровск-Грушевский', 0, 0, 0)),
  ]),
  C('gorno-altaysk', 85.9601, 51.9582, 'RU', ['Gorno-Altaysk', 'Горно-Алтайск'], [
    E(0, 1931, N('Ulala', 'ウラーラ', 'Улала', 0, 0, 0)),
    E(1932, 1947, N('Oyrot-Tura', 'オイロト・トゥラ', 'Ойрот-Тура', 0, 0, 0)),
  ]),
  C('kyzyl', 94.4200, 51.7191, 'RU', ['Kyzyl', 'Кызыл'], [
    E(1914, 1917, N('Belotsarsk', 'ベロツァルスク', 'Белоцарск', 0, 0, 0)),
    E(1918, 1925, N('Khem-Beldyr', 'ヘム・ベルディル', 'Хем-Белдыр', 0, 0, 0)),
  ]),
  C('ulan-ude', 107.5842, 51.8335, 'RU', ['Ulan-Ude', 'Улан-Удэ'], [
    E(0, 1933, N('Verkhneudinsk', 'ヴェルフネウジンスク', 'Верхнеудинск', 0, 0, 0)),
  ]),
  C('birobidzhan', 132.9236, 48.7947, 'RU', ['Birobidzhan', 'Биробиджан'], [
    E(0, 1930, N('Tikhonkaya', 'チホンカヤ', 'Тихонькая', 0, 0, 0)),
  ]),
  C('komsomolsk-on-amur', 137.0079, 50.5500, 'RU', ['Komsomolsk-on-Amur', 'Комсомольск-на-Амуре'], [
    E(0, 1931, N('Permskoye', 'ペルムスコエ', 'Пермское', 0, 0, 0)),
  ]),
  C('sovetskaya-gavan', 140.2900, 48.9722, 'RU', ['Sovetskaya Gavan', 'Советская Гавань'], [
    E(0, 1921, N('Imperatorskaya Gavan', 'インペラトルスカヤ・ガヴァニ', 'Императорская Гавань', 0, 0, 0)),
  ]),
  C('ussuriysk', 131.9453, 43.7977, 'RU', ['Ussuriysk', 'Уссурийск'], [
    E(0, 1934, N('Nikolsk-Ussuriysky', 'ニコリスク・ウスリースキー', 'Никольск-Уссурийский', 0, 0, 0)),
    E(1935, 1956, N('Voroshilov', 'ヴォロシーロフ', 'Ворошилов', '伏羅希洛夫', '伏罗希洛夫', '보로실로프')),
  ]),
  C('partizansk', 133.1264, 43.1319, 'RU', ['Partizansk', 'Партизанск'], [
    E(0, 1971, N('Suchan', 'スチャン', 'Сучан', 0, 0, 0)),
  ]),
  C('dalnegorsk', 135.5667, 44.5561, 'RU', ['Dalnegorsk', 'Дальнегорск'], [
    E(0, 1971, N('Tetyukhe', 'テチューヘ', 'Тетюхе', 0, 0, 0)),
  ]),
  C('khanty-mansiysk', 69.0191, 61.0042, 'RU', ['Khanty-Mansiysk', 'Ханты-Мансийск'], [
    E(1930, 1939, N('Ostyako-Vogulsk', 'オスチャコ・ヴォグリスク', 'Остяко-Вогульск', 0, 0, 0)),
  ]),
  C('salekhard', 66.5300, 66.5300, 'RU', ['Salekhard', 'Салехард'], [
    E(0, 1932, N('Obdorsk', 'オブドルスク', 'Обдорск', 0, 0, 0)),
  ]),
  C('ukhta', 53.7036, 63.5672, 'RU', ['Ukhta', 'Ухта'], [
    E(0, 1938, N('Chibyu', 'チビュ', 'Чибью', 0, 0, 0)),
  ]),
  /* ⚠ «Кировск!» — the other Кировск the gazetteer knows is Holubivka in Ukraine, which
     carried that name until the 2016 decommunisation; it is in GeoNames' `alt` list for that reason
     and is not what OpenMapTiles carries as its `name` today (Голубівка). */
  C('kirovsk-khibiny', 33.6727, 67.6148, 'RU', ['Кировск!'], [
    E(1931, 1933, N('Khibinogorsk', 'ヒビノゴルスク', 'Хибиногорск', 0, 0, 0)),
  ]),
  C('murmansk', 33.0827, 68.9707, 'RU', ['Murmansk', 'Мурманск'], [
    E(1916, 1916, N('Romanov-na-Murmane', 'ロマノフ・ナ・ムルマネ', 'Романов-на-Мурмане', 0, 0, 0)),
  ]),
  C('kingisepp', 28.6136, 59.3733, 'RU', ['Kingisepp', 'Кингисепп'], [
    E(0, 1921, N('Yamburg', 'ヤムブルク', 'Ямбург', 0, 0, 0)),
  ]),
  C('gatchina', 30.1283, 59.5764, 'RU', ['Gatchina', 'Гатчина'], [
    E(1923, 1928, N('Trotsk', 'トロツク', 'Троцк', 0, 0, 0)),
    E(1929, 1943, N('Krasnogvardeysk', 'クラスノグヴァルデイスク', 'Красногвардейск', 0, 0, 0)),
  ]),
  C('pushkin-tsarskoye-selo', 30.3961, 59.7161, 'RU', ['Пушкин'], [
    E(0, 1917, N('Tsarskoye Selo', 'ツァールスコエ・セロー', 'Царское Село', 0, 0, 0)),
    E(1918, 1936, N('Detskoye Selo', 'デーツコエ・セロー', 'Детское Село', 0, 0, 0)),
  ]),
  /* ⚠ «Истра!» — the collision is Istres in Provence, whose Russian EXONYM is spelled the same
     way; its own `name` is «Istres», so no tile carries this spelling for it. */
  C('istra', 36.8583, 55.9142, 'RU', ['Istra', 'Истра!'], [
    E(0, 1929, N('Voskresensk (Istra)', 'ヴォスクレセンスク（イストラ）', 'Воскресенск (Истра)', 0, 0, 0)),
  ]),
  C('chapayevsk', 49.7081, 52.9783, 'RU', ['Chapayevsk', 'Чапаевск'], [
    E(0, 1918, N('Ivashchenkovo', 'イヴァシチェンコヴォ', 'Иващенково', 0, 0, 0)),
    E(1919, 1928, N('Trotsk (Samara)', 'トロツク（サマラ）', 'Троцк (Самарская губерния)', 0, 0, 0)),
  ]),
  C('veliky-novgorod', 31.2769, 58.5215, 'RU', ['Veliky Novgorod', 'Великий Новгород'], [
    E(0, 1998, N('Novgorod', 'ノヴゴロド', 'Новгород', '諾夫哥羅德', '诺夫哥罗德', '노브고로드', { de: 'Nowgorod' })),
  ]),
  /* ── East Prussia: German until 1946 ────────────────────────────────────────────────────── */
  C('kaliningrad', 20.5106, 54.7104, 'RU', ['Kaliningrad', 'Калининград'], [
    E(0, 1945, N('Königsberg', 'ケーニヒスベルク', 'Кёнигсберг', '柯尼斯堡', '柯尼斯堡', '쾨니히스베르크', { fr: 'Kœnigsberg' })),
  ]),
  C('sovetsk-tilsit', 21.8764, 55.0817, 'RU', ['Советск'], [
    E(0, 1945, N('Tilsit', 'ティルジット', 'Тильзит', '蒂爾西特', '蒂尔西特', '틸지트')),
  ]),
  C('chernyakhovsk', 21.8028, 54.6317, 'RU', ['Chernyakhovsk', 'Черняховск'], [
    E(0, 1945, N('Insterburg', 'インステルブルク', 'Инстербург', 0, 0, 0)),
  ]),
  C('baltiysk', 19.9167, 54.6511, 'RU', ['Baltiysk', 'Балтийск'], [
    E(0, 1945, N('Pillau', 'ピラウ', 'Пиллау', 0, 0, 0)),
  ]),
  C('gusev', 22.2000, 54.5919, 'RU', ['Gusev', 'Гусев'], [
    E(0, 1945, N('Gumbinnen', 'グムビンネン', 'Гумбиннен', 0, 0, 0)),
  ]),
  C('neman', 22.0322, 55.0333, 'RU', ['Неман'], [
    E(0, 1945, N('Ragnit', 'ラグニト', 'Рагнит', 0, 0, 0)),
  ]),
  C('zelenogradsk', 20.4753, 54.9603, 'RU', ['Zelenogradsk', 'Зеленоградск'], [
    E(0, 1945, N('Cranz', 'クランツ', 'Кранц', 0, 0, 0)),
  ]),
  /* ⚠ «Светлогорск!» — Belarus has a Svetlogorsk too, but it writes its own name in Belarusian
     (Светлагорск, а not о) and its `name:en` is Svietlahorsk; the Russian spelling reaches it only
     through GeoNames' alt list. The Latin key is deliberately NOT here for the same reason. */
  C('svetlogorsk-rauschen', 20.1500, 54.9433, 'RU', ['Светлогорск!'], [
    E(0, 1945, N('Rauschen', 'ラウシェン', 'Раушен', 0, 0, 0)),
  ]),
  /* ── Karelia and the Isthmus: Finnish until 1940/1944 ───────────────────────────────────── */
  C('vyborg', 28.7539, 60.7106, 'RU', ['Vyborg', 'Выборг'], [
    E(0, 1939, N('Viipuri', 'ヴィープリ', 'Виипури', 0, 0, 0, { de: 'Wiborg' })),
  ]),
  C('priozersk', 30.1289, 61.0397, 'RU', ['Priozersk', 'Приозерск'], [
    E(0, 1947, N('Käkisalmi', 'キャキサルミ', 'Кексгольм', 0, 0, 0, { de: 'Kexholm' })),
  ]),
  C('svetogorsk', 28.8622, 61.1128, 'RU', ['Svetogorsk', 'Светогорск'], [
    E(0, 1948, N('Enso', 'エンソ', 'Энсо', 0, 0, 0)),
  ]),
  /* ⚠ TERIJOKI IS NOT HERE, AND THE BUILD IS WHY. Zelenogorsk on the Karelian Isthmus shares
     BOTH of its spellings — Зеленогорск and Zelenogorsk — with the closed city of the same name in
     Krasnoyarsk Krai (71 354 people, 3 679 km away), which carries them as its OWN current name.
     There is no key that names one and not the other, so the row is dropped rather than declared:
     an «!» would be a claim that the other city cannot be relabelled, and it can. */
  /* ── southern Sakhalin: Japanese (Karafuto) 1905–1945 ───────────────────────────────────── */
  C('yuzhno-sakhalinsk', 142.7378, 46.9591, 'RU', ['Yuzhno-Sakhalinsk', 'Южно-Сахалинск'], [
    E(1905, 1945, N('Toyohara', '豊原', 'Тоёхара', '豐原', '丰原', '도요하라')),
  ]),
  C('korsakov', 142.7983, 46.6325, 'RU', ['Korsakov', 'Корсаков'], [
    E(1905, 1945, N('Ōtomari', '大泊', 'Отомари', '大泊', '大泊', '오도마리')),
  ]),
  C('kholmsk', 142.0428, 47.0408, 'RU', ['Kholmsk', 'Холмск'], [
    E(1905, 1945, N('Maoka', '真岡', 'Маока', '真岡', '真冈', '마오카')),
  ]),
  C('nevelsk', 141.8603, 46.6567, 'RU', ['Nevelsk', 'Невельск'], [
    E(1905, 1945, N('Honto', '本斗', 'Хонто', '本斗', '本斗', '혼토')),
  ]),
  C('poronaysk', 143.1167, 49.2333, 'RU', ['Poronaysk', 'Поронайск'], [
    E(1905, 1945, N('Shikuka', '敷香', 'Сикука', '敷香', '敷香', '시쿠카')),
  ]),
  C('uglegorsk', 142.0700, 49.0833, 'RU', ['Uglegorsk', 'Углегорск'], [
    E(1905, 1945, N('Esutoru', '恵須取', 'Эсутору', '惠須取', '惠须取', '에스토루')),
  ]),
  C('dolinsk', 142.7972, 47.3250, 'RU', ['Dolinsk', 'Долинск'], [
    E(1905, 1945, N('Ochiai', '落合', 'Отиай', '落合', '落合', '오치아이')),
  ]),
];
