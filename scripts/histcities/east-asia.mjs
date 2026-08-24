/* ============================================================================
 *  IntMap · HISTORICAL CITY NAMES — Japan, Korea, China, Taiwan, Mongolia   (#R427)
 * ----------------------------------------------------------------------------
 *  Four different KINDS of change live in this file, and they are not the same claim:
 *
 *   ① A city really was renamed. Edo became Tōkyō in 1868; Beiping became Beijing in 1949;
 *      Dihua became Ürümqi in 1954; Takow became Takao in 1920.
 *   ② A colonial administration read the same characters in its own language and printed that
 *      on its maps. 京城 was Keijō from 1910 to 1945 and Gyeongseong to the people who lived
 *      there; 高雄 was Takao. Those spans end at 1945.
 *   ③ The English exonym changed while the Chinese name did not. Canton, Amoy, Chungking,
 *      Mukden, Tientsin, Port Arthur and Peking are the names the place carried in English —
 *      different WORDS, not different spellings of one — and they left general use with the
 *      adoption of Hanyu Pinyin in 1979.
 *      ⚠ THIS IS WHY THE zh / jp / ko COLUMNS OF SUCH A ROW REPEAT THE MODERN NAME. 廣州 was
 *      廣州 the whole time. A reader in Chinese, Japanese or Korean correctly sees no change,
 *      and only the languages whose word for the place actually changed see one. A row that
 *      transcribed «Canton» into Chinese would be inventing a rename that never happened.
 *   ④ A merger replaced a city's name with a new one — Urawa into Saitama in 2001, Tokuyama
 *      into Shūnan in 2003. The label on the map changed on a datable day, which is what this
 *      file is about.
 *
 *  ⚠ MERE ROMANISATION IS NOT IN HERE. Pusan → Busan, Kiev → Kyiv and Chungking → Chongqing
 *  are three different things: the first two are one word respelled, the third is a different
 *  word. Only the third kind is a name the map carried.
 * ==========================================================================*/
import { C, E, N } from './lang.mjs';

export const ROWS = [
  /* ── Japan ─────────────────────────────────────────────────────────────────────────────── */
  C('tokyo', 139.6917, 35.6895, 'JP', ['Tokyo', '東京'], [
    E(0, 1868, N('Edo', '江戸', 'Эдо', '江戶', '江户', '에도', { de: 'Edo', fr: 'Edo' })),
  ]),
  C('saitama', 139.6455, 35.8617, 'JP', ['Saitama', 'さいたま市'], [
    E(0, 2000, N('Urawa', '浦和', 'Урава', '浦和', '浦和', '우라와')),
  ]),
  C('kitakyushu', 130.8752, 33.8834, 'JP', ['Kitakyushu', '北九州市'], [
    E(0, 1962, N('Kokura', '小倉', 'Кокура', '小倉', '小仓', '고쿠라')),
  ]),
  C('iwaki', 140.8878, 37.0505, 'JP', ['Iwaki', 'いわき市'], [
    E(0, 1965, N('Taira', '平', 'Тайра', '平', '平', '다이라')),
  ]),
  C('hitachinaka', 140.5347, 36.3964, 'JP', ['Hitachinaka', 'ひたちなか市'], [
    E(0, 1993, N('Katsuta', '勝田', 'Кацута', '勝田', '胜田', '가쓰타')),
  ]),
  C('shunan', 131.8064, 34.0553, 'JP', ['Shunan', '周南市'], [
    E(0, 2002, N('Tokuyama', '徳山', 'Токуяма', '德山', '德山', '도쿠야마')),
  ]),
  C('satsumasendai', 130.3039, 31.8133, 'JP', ['Satsumasendai', '薩摩川内市'], [
    E(0, 2004, N('Sendai (Kagoshima)', '川内', 'Сэндай (Кагосима)', '川內', '川内', '센다이')),
  ]),
  C('kirishima', 130.7631, 31.7408, 'JP', ['Kirishima', '霧島市'], [
    E(0, 2005, N('Kokubu', '国分', 'Кокубу', '國分', '国分', '고쿠부')),
  ]),
  C('miyakojima', 125.2811, 24.8056, 'JP', ['Miyakojima', '宮古島市'], [
    E(0, 2004, N('Hirara', '平良', 'Хирара', '平良', '平良', '히라라')),
  ]),
  C('uruma', 127.8578, 26.3792, 'JP', ['Uruma', 'うるま市'], [
    E(0, 2004, N('Gushikawa', '具志川', 'Гусикава', '具志川', '具志川', '구시카와')),
  ]),
  C('sanyo-onoda', 131.1817, 34.0006, 'JP', ['Sanyo-Onoda', '山陽小野田市'], [
    E(0, 2004, N('Onoda', '小野田', 'Онода', '小野田', '小野田', '오노다')),
  ]),
  C('nikko', 139.6186, 36.7198, 'JP', ['Nikko', '日光市'], [
    E(0, 2005, N('Imaichi', '今市', 'Имаити', '今市', '今市', '이마이치')),
  ]),
  /* ── Korea: the colonial readings, and what replaced them ────────────────────────────────── */
  C('seoul', 126.9780, 37.5665, 'KR', ['Seoul', '서울'], [
    E(0, 1910, N('Hanseong', '漢城', 'Хансон', '漢城', '汉城', '한성')),
    E(1911, 1945, N('Keijō', '京城', 'Кэйдзё', '京城', '京城', '경성', { de: 'Keijō', fr: 'Keijō' })),
  ]),
  C('incheon', 126.7052, 37.4563, 'KR', ['Incheon', '인천'], [
    E(1911, 1945, N('Jinsen', '仁川（じんせん）', 'Дзинсэн', '仁川', '仁川', '인천')),
  ]),
  C('daegu', 128.6014, 35.8714, 'KR', ['Daegu', '대구'], [
    E(1911, 1945, N('Taikyū', '大邱（たいきゅう）', 'Тайкю', '大邱', '大邱', '대구')),
  ]),
  C('daejeon', 127.3845, 36.3504, 'KR', ['Daejeon', '대전'], [
    E(1911, 1945, N('Taiden', '大田（たいでん）', 'Тайдэн', '大田', '大田', '대전')),
  ]),
  C('gwangju', 126.8526, 35.1595, 'KR', ['Gwangju', '광주'], [
    E(1911, 1945, N('Kōshū', '光州（こうしゅう）', 'Косю', '光州', '光州', '광주')),
  ]),
  C('jeonju', 127.1480, 35.8242, 'KR', ['Jeonju', '전주'], [
    E(1911, 1945, N('Zenshū', '全州（ぜんしゅう）', 'Дзэнсю', '全州', '全州', '전주')),
  ]),
  C('iksan', 126.9575, 35.9483, 'KR', ['Iksan', '익산'], [
    E(0, 1994, N('Iri', '裡里', 'Ири', '裡里', '里里', '이리')),
  ]),
  C('asan', 127.0043, 36.7898, 'KR', ['Asan', '아산'], [
    E(0, 1994, N('Onyang', '溫陽', 'Оньян', '溫陽', '温阳', '온양')),
  ]),
  C('pyongyang', 125.7625, 39.0392, 'KP', ['Pyongyang', '평양'], [
    E(1911, 1945, N('Heijō', '平壌（へいじょう）', 'Хэйдзё', '平壤', '平壤', '평양')),
  ]),
  C('nampo', 125.4083, 38.7375, 'KP', ['Nampo', '남포'], [
    E(0, 1946, N('Chinnampo', '鎮南浦', 'Чиннампхо', '鎮南浦', '镇南浦', '진남포')),
  ]),
  C('kimchaek', 129.3358, 40.6711, 'KP', ['Kimchaek', '김책'], [
    E(0, 1951, N('Songjin', '城津', 'Сонджин', '城津', '城津', '성진')),
  ]),
  C('chongjin', 129.7756, 41.7956, 'KP', ['Chongjin', '청진'], [
    E(1911, 1945, N('Seishin', '清津（せいしん）', 'Сэйсин', '清津', '清津', '청진')),
  ]),
  C('wonsan', 127.4464, 39.1475, 'KP', ['Wonsan', '원산'], [
    E(1911, 1945, N('Genzan', '元山（げんざん）', 'Гэндзан', '元山', '元山', '원산')),
  ]),
  C('hamhung', 127.5361, 39.9183, 'KP', ['Hamhung', '함흥'], [
    E(1911, 1945, N('Kankō', '咸興（かんこう）', 'Канко', '咸興', '咸兴', '함흥')),
  ]),
  C('sinuiju', 124.3983, 40.1006, 'KP', ['Sinuiju', '신의주'], [
    E(1911, 1945, N('Shingishū', '新義州（しんぎしゅう）', 'Сингисю', '新義州', '新义州', '신의주')),
  ]),
  C('kaesong', 126.5544, 37.9700, 'KP', ['Kaesong', '개성'], [
    E(1911, 1945, N('Kaijō', '開城（かいじょう）', 'Кайдзё', '開城', '开城', '개성')),
  ]),
  /* ── China: real renamings ──────────────────────────────────────────────────────────────── */
  C('beijing', 116.3974, 39.9075, 'CN', ['Beijing', '北京'], [
    E(0, 1927, N('Peking', '北京', 'Пекин', '北京', '北京', '베이징', { de: 'Peking', es: 'Pekín', fr: 'Pékin' })),
    E(1928, 1949, N('Peiping', '北平', 'Бэйпин', '北平', '北平', '베이핑', { de: 'Peiping', es: 'Peiping', fr: 'Peiping' })),
    E(1950, 1978, N('Peking', '北京', 'Пекин', '北京', '北京', '베이징', { de: 'Peking', es: 'Pekín', fr: 'Pékin' })),
  ]),
  C('changchun', 125.3235, 43.8171, 'CN', ['Changchun', '长春'], [
    E(1932, 1945, N('Hsinking', '新京', 'Синьцзин', '新京', '新京', '신징', { de: 'Hsinking', fr: 'Hsinking' })),
  ]),
  C('shenyang', 123.4315, 41.8057, 'CN', ['Shenyang', '沈阳'], [
    E(0, 1945, N('Mukden', '奉天', 'Мукден', '奉天', '奉天', '무크덴', { de: 'Mukden', es: 'Mukden', fr: 'Moukden' })),
  ]),
  C('hohhot', 111.7519, 40.8414, 'CN', ['Hohhot', '呼和浩特'], [
    E(0, 1953, N('Kweisui', '帰綏', 'Гуйсуй', '歸綏', '归绥', '귀수이', { de: 'Kweisui', fr: 'Kweisui' })),
  ]),
  C('urumqi', 87.6168, 43.7928, 'CN', ['Ürümqi', 'Urumqi', '乌鲁木齐'], [
    E(0, 1953, N('Tihwa', '迪化', 'Дихуа', '迪化', '迪化', '디화', { de: 'Tihwa', fr: 'Tihwa' })),
  ]),
  C('shijiazhuang', 114.5143, 38.0428, 'CN', ['Shijiazhuang', '石家庄'], [
    E(1938, 1946, N('Shihmen', '石門', 'Шимэнь', '石門', '石门', '스먼')),
  ]),
  C('kunming', 102.8329, 24.8801, 'CN', ['Kunming', '昆明'], [
    E(0, 1927, N('Yunnanfu', '雲南府', 'Юньнаньфу', '雲南府', '云南府', '윈난부', { de: 'Yünnanfu', fr: 'Yunnanfou' })),
  ]),
  C('lushunkou', 121.2681, 38.8512, 'CN', ['Lüshunkou', 'Lushunkou', '旅顺口区'], [
    E(0, 1904, N('Port Arthur', '旅順', 'Порт-Артур', '旅順', '旅顺', '뤼순', { de: 'Port Arthur', es: 'Port Arturo', fr: 'Port-Arthur' })),
    E(1905, 1945, N('Ryojun', '旅順', 'Рёдзюн', '旅順', '旅顺', '뤼순')),
  ]),
  C('huludao', 120.8560, 40.7114, 'CN', ['Huludao', '葫芦岛'], [
    E(0, 1993, N('Jinxi', '錦西', 'Цзиньси', '錦西', '锦西', '진시')),
  ]),
  C('xiangyang', 112.1440, 32.0426, 'CN', ['Xiangyang', '襄阳'], [
    E(1983, 2010, N('Xiangfan', '襄樊', 'Сянфань', '襄樊', '襄樊', '샹판')),
  ]),
  C('huangshan', 118.3175, 29.7147, 'CN', ['Huangshan', '黄山市'], [
    E(0, 1986, N('Tunxi', '屯渓', 'Туньси', '屯溪', '屯溪', '툰시')),
  ]),
  C('zhangjiajie', 110.4793, 29.1174, 'CN', ['Zhangjiajie', '张家界'], [
    E(0, 1993, N('Dayong', '大庸', 'Даюн', '大庸', '大庸', '다융')),
  ]),
  C('shangri-la', 99.7065, 27.8259, 'CN', ['Shangri-La', '香格里拉市'], [
    E(0, 2001, N('Zhongdian', '中甸', 'Чжундянь', '中甸', '中甸', '중뎬')),
  ]),
  C('puer', 100.9722, 22.7773, 'CN', ["Pu'er", '普洱市'], [
    E(0, 2006, N('Simao', '思茅', 'Сымао', '思茅', '思茅', '쓰마오')),
  ]),
  C('sanya', 109.5082, 18.2528, 'CN', ['Sanya', '三亚'], [
    E(0, 1983, N('Yaxian', '崖県', 'Ясянь', '崖縣', '崖县', '야현')),
  ]),
  C('weihai', 122.1201, 37.5136, 'CN', ['Weihai', '威海'], [
    E(0, 1930, N('Weihaiwei', '威海衛', 'Вэйхайвэй', '威海衛', '威海卫', '웨이하이웨이', { de: 'Weihaiwei', fr: 'Weihaiwei' })),
  ]),
  /* ── China: the English exonyms, which left general use with Hanyu Pinyin in 1979 ────────── */
  C('guangzhou', 113.2644, 23.1291, 'CN', ['Guangzhou', '广州'], [
    E(0, 1978, N('Canton', '広州', 'Кантон', '廣州', '广州', '광저우', { de: 'Kanton', es: 'Cantón', fr: 'Canton' })),
  ]),
  C('nanjing', 118.7969, 32.0603, 'CN', ['Nanjing', '南京'], [
    E(0, 1978, N('Nanking', '南京', 'Нанкин', '南京', '南京', '난징', { de: 'Nanking', es: 'Nankín', fr: 'Nankin' })),
  ]),
  C('chongqing', 106.5516, 29.5630, 'CN', ['Chongqing', '重庆'], [
    E(0, 1978, N('Chungking', '重慶', 'Чунцин', '重慶', '重庆', '충칭', { de: 'Tschungking', es: 'Chungking', fr: 'Tchoung-king' })),
  ]),
  C('xiamen', 118.0894, 24.4798, 'CN', ['Xiamen', '厦门'], [
    E(0, 1978, N('Amoy', '厦門', 'Амой', '廈門', '厦门', '샤먼', { de: 'Amoy', es: 'Amoy', fr: 'Amoy' })),
  ]),
  C('tianjin', 117.2010, 39.0842, 'CN', ['Tianjin', '天津'], [
    E(0, 1978, N('Tientsin', '天津', 'Тяньцзинь', '天津', '天津', '톈진', { de: 'Tientsin', es: 'Tientsin', fr: 'Tientsin' })),
  ]),
  C('shantou', 116.7081, 23.3535, 'CN', ['Shantou', '汕头'], [
    E(0, 1978, N('Swatow', '汕頭', 'Шаньтоу', '汕頭', '汕头', '산터우', { de: 'Swatau', fr: 'Swatow' })),
  ]),
  C('fuzhou', 119.2965, 26.0745, 'CN', ['Fuzhou', '福州'], [
    E(0, 1978, N('Foochow', '福州', 'Фучжоу', '福州', '福州', '푸저우', { de: 'Futschou', fr: 'Foutcheou' })),
  ]),
  C('ningbo', 121.5497, 29.8683, 'CN', ['Ningbo', '宁波'], [
    E(0, 1978, N('Ningpo', '寧波', 'Нинбо', '寧波', '宁波', '닝보', { de: 'Ningpo', fr: 'Ningpo' })),
  ]),
  C('qingdao', 120.3826, 36.0671, 'CN', ['Qingdao', '青岛'], [
    E(0, 1913, N('Tsingtau', '青島', 'Циндао', '青島', '青岛', '칭다오', { de: 'Tsingtau', fr: 'Tsingtau' })),
    E(1914, 1978, N('Tsingtao', '青島', 'Циндао', '青島', '青岛', '칭다오', { de: 'Tsingtao', fr: 'Tsingtao' })),
  ]),
  C('yantai', 121.4479, 37.4638, 'CN', ['Yantai', '烟台'], [
    E(0, 1978, N('Chefoo', '芝罘', 'Чифу', '芝罘', '芝罘', '즈푸', { de: 'Tschifu', fr: 'Tchefou' })),
  ]),
  C('dalian', 121.6147, 38.9140, 'CN', ['Dalian', '大连'], [
    E(1899, 1904, N('Dalny', 'ダーリニー', 'Дальний', '達里尼', '达里尼', '달니', { de: 'Dalny', fr: 'Dalny' })),
    E(1905, 1945, N('Dairen', '大連', 'Дайрэн', '大連', '大连', '다롄', { de: 'Dairen', fr: 'Dairen' })),
  ]),
  C('zhangjiakou', 114.8871, 40.7686, 'CN', ['Zhangjiakou', '张家口'], [
    E(0, 1978, N('Kalgan', '張家口', 'Калган', '張家口', '张家口', '칼간', { de: 'Kalgan', fr: 'Kalgan' })),
  ]),
  C('qiqihar', 123.9182, 47.3543, 'CN', ['Qiqihar', '齐齐哈尔'], [
    E(0, 1978, N('Tsitsihar', '斉斉哈爾', 'Цицикар', '齊齊哈爾', '齐齐哈尔', '치치하얼', { de: 'Tsitsihar', fr: 'Tsitsihar' })),
  ]),
  C('jilin-city', 126.5530, 43.8436, 'CN', ['Jilin', '吉林市'], [
    E(0, 1978, N('Kirin', '吉林', 'Гирин', '吉林', '吉林', '지린', { de: 'Kirin', fr: 'Kirin' })),
  ]),
  C('yining', 81.3246, 43.9132, 'CN', ['Yining', '伊宁'], [
    E(0, 1978, N('Kuldja', 'クルジャ', 'Кульджа', '固勒扎', '固勒扎', '쿨자', { de: 'Kuldscha', fr: 'Kuldja' })),
  ]),
  C('tacheng', 82.9787, 46.7461, 'CN', ['Tacheng', '塔城'], [
    E(0, 1978, N('Chuguchak', 'チュグチャク', 'Чугучак', '楚呼楚', '楚呼楚', '추구차크', { de: 'Tschugutschak', fr: 'Tchougoutchak' })),
  ]),
  /* ── Taiwan: the Japanese period, and the 1920 reform that created today's names ─────────── */
  C('kaohsiung', 120.3014, 22.6273, 'TW', ['Kaohsiung', '高雄'], [
    E(0, 1919, N('Takow', '打狗', 'Дагоу', '打狗', '打狗', '다거우', { de: 'Takau', fr: 'Takow' })),
    E(1920, 1945, N('Takao', '高雄（たかお）', 'Такао', '高雄', '高雄', '다카오')),
  ]),
  C('taipei', 121.5654, 25.0330, 'TW', ['Taipei', '台北', '臺北'], [
    E(1895, 1945, N('Taihoku', '台北（たいほく）', 'Тайхоку', '臺北', '台北', '다이호쿠')),
  ]),
  C('taichung', 120.6736, 24.1477, 'TW', ['Taichung', '台中', '臺中'], [
    E(1895, 1945, N('Taichū', '台中（たいちゅう）', 'Тайтю', '臺中', '台中', '다이추')),
  ]),
  C('tainan', 120.2025, 22.9997, 'TW', ['Tainan', '台南', '臺南'], [
    E(1895, 1945, N('Tainan (Japanese)', '台南（たいなん）', 'Тайнан', '臺南', '台南', '다이난')),
  ]),
  C('keelung', 121.7419, 25.1276, 'TW', ['Keelung', '基隆'], [
    E(1895, 1945, N('Kīrun', '基隆（きいるん）', 'Кирун', '基隆', '基隆', '기룽')),
  ]),
  C('hsinchu', 120.9686, 24.8138, 'TW', ['Hsinchu', '新竹'], [
    E(1895, 1945, N('Shinchiku', '新竹（しんちく）', 'Синтику', '新竹', '新竹', '신치쿠')),
  ]),
  C('chiayi', 120.4491, 23.4801, 'TW', ['Chiayi', '嘉義'], [
    E(1895, 1945, N('Kagi', '嘉義（かぎ）', 'Каги', '嘉義', '嘉义', '가기')),
  ]),
  C('hualien', 121.6015, 23.9769, 'TW', ['Hualien', '花蓮'], [
    E(0, 1936, N('Karenkō', '花蓮港', 'Карэнко', '花蓮港', '花莲港', '가렌코')),
  ]),
  C('pingtung', 120.4881, 22.6693, 'TW', ['Pingtung', '屏東'], [
    E(0, 1919, N('Akau', '阿緱', 'Акау', '阿緱', '阿猴', '아카우')),
    E(1920, 1945, N('Heitō', '屏東（へいとう）', 'Хэйто', '屏東', '屏东', '헤이토')),
  ]),
  /* ⚠ THE SIMPLIFIED FORM «台東» IS DELIBERATELY NOT A KEY: it is also Taitō, a ward of Tokyo with
     211 000 people, and the build found it. Taiwan writes the county in traditional characters. */
  C('taitung', 121.1444, 22.7583, 'TW', ['Taitung', '臺東'], [
    E(1895, 1945, N('Taitō', '台東（たいとう）', 'Тайто', '臺東', '台东', '다이토')),
  ]),
  /* ── Mongolia ───────────────────────────────────────────────────────────────────────────── */
  C('ulaanbaatar', 106.9177, 47.8864, 'MN', ['Ulaanbaatar', 'Улаанбаатар'], [
    E(0, 1923, N('Urga', 'ウルガ', 'Урга', '庫倫', '库伦', '우르가', { de: 'Urga', fr: 'Ourga' })),
  ]),
  C('choibalsan', 114.5350, 48.0894, 'MN', ['Choibalsan', 'Чойбалсан'], [
    E(0, 1940, N('Bayan Tümen', 'バヤン・トゥメン', 'Баян-Тумэн', 0, 0, 0)),
  ]),
];
