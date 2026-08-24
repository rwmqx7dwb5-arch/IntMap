/* ============================================================================
 *  IntMap · HISTORICAL CITY NAMES — South and South-East Asia   (#R427)
 * ----------------------------------------------------------------------------
 *  Two waves. The first is independence: Batavia became Djakarta in 1942, Saigon became Ho Chi
 *  Minh City in 1976, Rangoon became Yangon in 1989. The second is the long Indian programme of
 *  replacing anglicised spellings with the local form — Bombay in 1995, Madras in 1996, Calcutta
 *  in 2001, Bangalore in 2014 — each on a datable day, each carried by every atlas of its time.
 * ==========================================================================*/
import { C, E, N } from './lang.mjs';

export const ROWS = [
  /* ── India ─────────────────────────────────────────────────────────────────────────────── */
  C('mumbai', 72.8777, 19.0760, 'IN', ['Mumbai', 'मुंबई'], [
    E(0, 1995, N('Bombay', 'ボンベイ', 'Бомбей', '孟買', '孟买', '봄베이', { de: 'Bombay', es: 'Bombay', fr: 'Bombay' })),
  ]),
  C('chennai', 80.2707, 13.0827, 'IN', ['Chennai', 'சென்னை'], [
    E(0, 1996, N('Madras', 'マドラス', 'Мадрас', '馬德拉斯', '马德拉斯', '마드라스', { de: 'Madras', es: 'Madrás', fr: 'Madras' })),
  ]),
  C('kolkata', 88.3639, 22.5726, 'IN', ['Kolkata', 'কলকাতা'], [
    E(0, 2000, N('Calcutta', 'カルカッタ', 'Калькутта', '加爾各答', '加尔各答', '캘커타', { de: 'Kalkutta', es: 'Calcuta', fr: 'Calcutta' })),
  ]),
  C('bengaluru', 77.5946, 12.9716, 'IN', ['Bengaluru', 'ಬೆಂಗಳೂರು'], [
    E(0, 2006, N('Bangalore', 'バンガロール', 'Бангалор', '班加羅爾', '班加罗尔', '방갈로르', { de: 'Bangalore', es: 'Bangalore', fr: 'Bangalore' })),
  ]),
  C('kochi', 76.2673, 9.9312, 'IN', ['Kochi', 'കൊച്ചി'], [
    E(0, 1996, N('Cochin', 'コーチン', 'Кочин', '科欽', '科钦', '코친', { de: 'Cochin', es: 'Cochín', fr: 'Cochin' })),
  ]),
  C('thiruvananthapuram', 76.9366, 8.5241, 'IN', ['Thiruvananthapuram', 'തിരുവനന്തപുരം'], [
    E(0, 1990, N('Trivandrum', 'トリバンドラム', 'Тривандрам', '特里凡得琅', '特里凡得琅', '트리반드룸', { de: 'Trivandrum', es: 'Trivandrum', fr: 'Trivandrum' })),
  ]),
  C('puducherry', 79.8083, 11.9416, 'IN', ['Puducherry', 'புதுச்சேரி'], [
    E(0, 2006, N('Pondicherry', 'ポンディシェリ', 'Пондишери', '本地治里', '本地治里', '퐁디셰리', { de: 'Pondicherry', es: 'Pondicherry', fr: 'Pondichéry' })),
  ]),
  C('varanasi', 82.9739, 25.3176, 'IN', ['Varanasi', 'वाराणसी'], [
    E(0, 1946, N('Benares', 'ベナレス', 'Бенарес', '貝拿勒斯', '贝拿勒斯', '베나레스', { de: 'Benares', es: 'Benarés', fr: 'Bénarès' })),
  ]),
  C('kanpur', 80.3319, 26.4499, 'IN', ['Kanpur', 'कानपुर'], [
    E(0, 1947, N('Cawnpore', 'カーンプル', 'Канпур', '康普爾', '康普尔', '칸푸르', { de: 'Cawnpore', fr: 'Cawnpore' })),
  ]),
  C('pune', 73.8567, 18.5204, 'IN', ['Pune', 'पुणे'], [
    E(0, 1977, N('Poona', 'プーナ', 'Пуна', '浦那', '浦那', '푸나', { de: 'Poona', es: 'Poona', fr: 'Poona' })),
  ]),
  C('vadodara', 73.1812, 22.3072, 'IN', ['Vadodara', 'વડોદરા'], [
    E(0, 1974, N('Baroda', 'バローダ', 'Барода', '巴羅達', '巴罗达', '바로다', { de: 'Baroda', fr: 'Baroda' })),
  ]),
  C('kozhikode', 75.7804, 11.2588, 'IN', ['Kozhikode', 'കോഴിക്കോട്'], [
    E(0, 1995, N('Calicut', 'カリカット', 'Каликут', '卡利卡特', '卡利卡特', '캘리컷', { de: 'Kalikut', es: 'Calicut', fr: 'Calicut' })),
  ]),
  C('kannur', 75.3704, 11.8745, 'IN', ['Kannur', 'കണ്ണൂർ'], [
    E(0, 1990, N('Cannanore', 'カンナノール', 'Каннанор', 0, 0, 0)),
  ]),
  C('thrissur', 76.2144, 10.5276, 'IN', ['Thrissur', 'തൃശ്ശൂർ'], [
    E(0, 1990, N('Trichur', 'トリチュール', 'Тричур', 0, 0, 0)),
  ]),
  C('kollam', 76.6141, 8.8932, 'IN', ['Kollam', 'കൊല്ലം'], [
    E(0, 1990, N('Quilon', 'キーロン', 'Квилон', 0, 0, 0, { fr: 'Quilon' })),
  ]),
  C('alappuzha', 76.3388, 9.4981, 'IN', ['Alappuzha', 'ആലപ്പുഴ'], [
    E(0, 1990, N('Alleppey', 'アレッピー', 'Аллеппи', 0, 0, 0)),
  ]),
  C('tiruchirappalli', 78.7047, 10.7905, 'IN', ['Tiruchirappalli', 'திருச்சிராப்பள்ளி'], [
    E(0, 1970, N('Trichinopoly', 'トリチノポリ', 'Тричинополи', 0, 0, 0)),
  ]),
  C('thoothukudi', 78.1348, 8.7642, 'IN', ['Thoothukudi', 'தூத்துக்குடி'], [
    E(0, 2010, N('Tuticorin', 'トゥティコリン', 'Тутикорин', 0, 0, 0)),
  ]),
  C('thanjavur', 79.1378, 10.7870, 'IN', ['Thanjavur', 'தஞ்சாவூர்'], [
    E(0, 1970, N('Tanjore', 'タンジョール', 'Танджор', 0, 0, 0)),
  ]),
  C('vellore', 79.1325, 12.9165, 'IN', ['Vellore', 'வேலூர்'], [
    E(0, 1970, N('Vellore (Arcot)', 'アルコット', 'Аркот', 0, 0, 0)),
  ]),
  C('mysuru', 76.6394, 12.2958, 'IN', ['Mysuru', 'ಮೈಸೂರು'], [
    E(0, 2014, N('Mysore', 'マイソール', 'Майсур', '邁索爾', '迈索尔', '마이소르', { de: 'Mysore', es: 'Mysore', fr: 'Mysore' })),
  ]),
  C('mangaluru', 74.8560, 12.9141, 'IN', ['Mangaluru', 'ಮಂಗಳೂರು'], [
    E(0, 2014, N('Mangalore', 'マンガロール', 'Мангалор', 0, 0, 0, { de: 'Mangalore', fr: 'Mangalore' })),
  ]),
  C('hubballi', 75.1240, 15.3647, 'IN', ['Hubballi', 'ಹುಬ್ಬಳ್ಳಿ'], [
    E(0, 2014, N('Hubli', 'フブリ', 'Хубли', 0, 0, 0)),
  ]),
  C('belagavi', 74.4977, 15.8497, 'IN', ['Belagavi', 'ಬೆಳಗಾವಿ'], [
    E(0, 2014, N('Belgaum', 'ベルガウム', 'Белгаум', 0, 0, 0)),
  ]),
  C('kalaburagi', 76.8343, 17.3297, 'IN', ['Kalaburagi', 'ಕಲಬುರಗಿ'], [
    E(0, 2014, N('Gulbarga', 'グルバルガ', 'Гулбарга', 0, 0, 0)),
  ]),
  C('shivamogga', 75.5681, 13.9299, 'IN', ['Shivamogga', 'ಶಿವಮೊಗ್ಗ'], [
    E(0, 2014, N('Shimoga', 'シモガ', 'Шимога', 0, 0, 0)),
  ]),
  C('ballari', 76.9214, 15.1394, 'IN', ['Ballari', 'ಬಳ್ಳಾರಿ'], [
    E(0, 2014, N('Bellary', 'ベラリー', 'Беллари', 0, 0, 0)),
  ]),
  C('vijayapura', 75.7100, 16.8302, 'IN', ['Vijayapura', 'ವಿಜಯಪುರ'], [
    E(0, 2014, N('Bijapur', 'ビジャープル', 'Биджапур', 0, 0, 0)),
  ]),
  C('tumakuru', 77.1010, 13.3409, 'IN', ['Tumakuru', 'ತುಮಕೂರು'], [
    E(0, 2014, N('Tumkur', 'トゥムクール', 'Тумкур', 0, 0, 0)),
  ]),
  C('prayagraj', 81.8463, 25.4358, 'IN', ['Prayagraj', 'प्रयागराज'], [
    E(0, 2018, N('Allahabad', 'アラーハーバード', 'Аллахабад', '安拉阿巴德', '安拉阿巴德', '알라하바드', { de: 'Allahabad', es: 'Allahabad', fr: 'Allahabad' })),
  ]),
  C('ayodhya', 82.1998, 26.7922, 'IN', ['Ayodhya', 'अयोध्या'], [
    E(0, 2018, N('Faizabad', 'ファイザーバード', 'Файзабад', 0, 0, 0)),
  ]),
  C('gurugram', 77.0266, 28.4595, 'IN', ['Gurugram', 'गुरुग्राम'], [
    E(0, 2016, N('Gurgaon', 'グルガオン', 'Гургаон', 0, 0, 0)),
  ]),
  C('shimla', 77.1734, 31.1048, 'IN', ['Shimla', 'शिमला'], [
    E(0, 1982, N('Simla', 'シムラ', 'Симла', '西姆拉', '西姆拉', '심라', { de: 'Simla', es: 'Simla', fr: 'Simla' })),
  ]),
  C('indore', 75.8577, 22.7196, 'IN', ['Indore', 'इंदौर'], [
    E(0, 1947, N('Indore (Holkar State)', 'インドール藩王国', 'Индур', 0, 0, 0)),
  ]),
  C('panaji', 73.8278, 15.4909, 'IN', ['Panaji', 'पणजी'], [
    E(0, 1960, N('Pangim', 'パンジム', 'Панжин', 0, 0, 0, { fr: 'Pangim', es: 'Pangim' })),
  ]),
  /* ── Pakistan, Bangladesh, Sri Lanka ────────────────────────────────────────────────────── */
  C('faisalabad', 73.0791, 31.4187, 'PK', ['Faisalabad', 'فیصل آباد'], [
    E(0, 1976, N('Lyallpur', 'ライアルプル', 'Лайалпур', 0, 0, 0)),
  ]),
  /* ⚠ SAHIWAL (formerly Montgomery) IS NOT HERE: Pakistan has a second Sahiwal, in Sargodha
     District, carrying the name as its own — so «Montgomery» could not be written on one without
     being written on the other. The build found it. */
  /* ⚠ JACOBABAD (Khangarh until 1847) IS NOT HERE, and the build is why: the span ends three years
     before the clock's floor of 1850, so no reader could ever reach a year that would draw it. A
     row shipped and invisible is indistinguishable in the source from one that works — #R409's
     lesson, one file over. */
  C('chattogram', 91.7832, 22.3569, 'BD', ['Chattogram', 'চট্টগ্রাম'], [
    E(0, 2018, N('Chittagong', 'チッタゴン', 'Читтагонг', '吉大港', '吉大港', '치타공', { de: 'Chittagong', es: 'Chittagong', fr: 'Chittagong' })),
  ]),
  C('dhaka', 90.4074, 23.7104, 'BD', ['Dhaka', 'ঢাকা'], [
    E(0, 1982, N('Dacca', 'ダッカ', 'Дакка', '達卡', '达卡', '다카', { de: 'Dacca', es: 'Dacca', fr: 'Dacca' })),
  ]),
  C('barishal', 90.3711, 22.7010, 'BD', ['Barishal', 'বরিশাল'], [
    E(0, 2018, N('Barisal', 'バリサル', 'Барисал', 0, 0, 0)),
  ]),
  C('cumilla', 91.1809, 23.4607, 'BD', ['Cumilla', 'কুমিল্লা'], [
    E(0, 2018, N('Comilla', 'コミラ', 'Комилла', 0, 0, 0)),
  ]),
  C('jashore', 89.2137, 23.1667, 'BD', ['Jashore', 'যশোর'], [
    E(0, 2018, N('Jessore', 'ジェソール', 'Джессор', 0, 0, 0)),
  ]),
  C('colombo', 79.8612, 6.9271, 'LK', ['Colombo', 'කොළඹ'], [
    E(0, 1971, N('Colombo (Ceylon)', 'コロンボ（セイロン）', 'Коломбо (Цейлон)', 0, 0, 0)),
  ]),
  C('sri-jayawardenepura-kotte', 79.8878, 6.8867, 'LK', ['Sri Jayawardenepura Kotte'], [
    E(0, 1984, N('Kotte', 'コッテ', 'Котте', 0, 0, 0)),
  ]),
  /* ── South-East Asia ────────────────────────────────────────────────────────────────────── */
  C('ho-chi-minh-city', 106.6297, 10.8231, 'VN', ['Ho Chi Minh City', 'Thành phố Hồ Chí Minh'], [
    E(0, 1975, N('Saigon', 'サイゴン', 'Сайгон', '西貢', '西贡', '사이공', { de: 'Saigon', es: 'Saigón', fr: 'Saïgon' })),
  ]),
  C('da-nang', 108.2208, 16.0678, 'VN', ['Da Nang', 'Đà Nẵng'], [
    E(0, 1950, N('Tourane', 'ツーラン', 'Туран', '沱㶞', '沱㶞', '투란', { de: 'Turane', es: 'Tourane', fr: 'Tourane' })),
  ]),
  C('yangon', 96.1951, 16.8409, 'MM', ['Yangon', 'ရန်ကုန်'], [
    E(0, 1988, N('Rangoon', 'ラングーン', 'Рангун', '仰光', '仰光', '랑군', { de: 'Rangun', es: 'Rangún', fr: 'Rangoon' })),
  ]),
  C('mawlamyine', 97.6283, 16.4906, 'MM', ['Mawlamyine', 'မော်လမြိုင်'], [
    E(0, 1988, N('Moulmein', 'モールメイン', 'Моулмейн', 0, 0, 0, { fr: 'Moulmein' })),
  ]),
  C('pathein', 94.7360, 16.7742, 'MM', ['Pathein', 'ပုသိမ်'], [
    E(0, 1988, N('Bassein', 'バセイン', 'Бассейн', 0, 0, 0)),
  ]),
  /* ⚠ BAGO (formerly Pegu) IS NOT HERE: Bago City in Negros Occidental, the Philippines, carries
     that exact name today (192 993 people), so the row would put «Pegu» on it. */
  C('sittwe', 92.9000, 20.1500, 'MM', ['Sittwe', 'စစ်တွေ'], [
    E(0, 1988, N('Akyab', 'アキャブ', 'Акьяб', 0, 0, 0)),
  ]),
  C('taunggyi', 97.0378, 20.7892, 'MM', ['Taunggyi', 'တောင်ကြီး'], [
    E(0, 1988, N('Taunggyi (Burma)', 'タウンジー（ビルマ）', 'Таунджи', 0, 0, 0)),
  ]),
  C('jakarta', 106.8451, -6.2088, 'ID', ['Jakarta', 'Daerah Khusus Ibukota Jakarta'], [
    E(0, 1941, N('Batavia', 'バタヴィア', 'Батавия', '巴達維亞', '巴达维亚', '바타비아', { de: 'Batavia', es: 'Batavia', fr: 'Batavia' })),
    E(1942, 1971, N('Djakarta', 'ジャカルタ', 'Джакарта', '雅加達', '雅加达', '자카르타', { de: 'Djakarta', fr: 'Djakarta' })),
  ]),
  C('makassar', 119.4221, -5.1477, 'ID', ['Makassar'], [
    E(1971, 1999, N('Ujung Pandang', 'ウジュン・パンダン', 'Уджунг-Панданг', '烏戎潘當', '乌戎潘当', '우중판당')),
  ]),
  C('jayapura', 140.7181, -2.5330, 'ID', ['Jayapura'], [
    E(0, 1962, N('Hollandia', 'ホーランディア', 'Голландия', 0, 0, 0, { de: 'Hollandia', es: 'Hollandia', fr: 'Hollandia' })),
    E(1963, 1968, N('Kota Baru', 'コタ・バル', 'Кота-Бару', 0, 0, 0)),
    E(1969, 1969, N('Sukarnapura', 'スカルナプラ', 'Сукарнапура', 0, 0, 0)),
  ]),
  C('sorong', 131.2611, -0.8762, 'ID', ['Sorong'], [
    E(0, 1962, N('Sorong (Netherlands New Guinea)', 'ソロン（オランダ領ニューギニア）', 'Соронг', 0, 0, 0)),
  ]),
  C('bandar-seri-begawan', 114.9424, 4.8903, 'BN', ['Bandar Seri Begawan'], [
    E(0, 1969, N('Brunei Town', 'ブルネイ・タウン', 'Бруней-Таун', 0, 0, 0, { de: 'Brunei Town', es: 'Brunei Town', fr: 'Brunei Town' })),
  ]),
  C('kota-kinabalu', 116.0724, 5.9804, 'MY', ['Kota Kinabalu'], [
    E(0, 1967, N('Jesselton', 'ジェッセルトン', 'Джесселтон', '亞庇', '亚庇', '제셀턴')),
  ]),
  C('george-town-penang', 100.3327, 5.4141, 'MY', ['George Town', 'Pulau Pinang'], [
    E(0, 1975, N('George Town (Penang)', 'ジョージタウン（ペナン）', 'Джорджтаун (Пинанг)', 0, 0, 0)),
  ]),
  C('phnom-penh', 104.9160, 11.5564, 'KH', ['Phnom Penh', 'ភ្នំពេញ'], [
    E(1976, 1979, N('Phnom Penh (Democratic Kampuchea)', 'プノンペン（民主カンプチア）', 'Пномпень (Демократическая Кампучия)', 0, 0, 0)),
  ]),
  C('vientiane', 102.6331, 17.9757, 'LA', ['Vientiane', 'ວຽງຈັນ'], [
    E(0, 1953, N('Vientiane (French Laos)', 'ヴィエンチャン（仏領ラオス）', 'Вьентьян', 0, 0, 0, { fr: 'Vientiane' })),
  ]),
  C('port-moresby', 147.1803, -9.4438, 'PG', ['Port Moresby'], [
    E(1873, 1884, N('Port Moresby (British New Guinea)', 'ポートモレスビー（英領ニューギニア）', 'Порт-Морсби', 0, 0, 0)),
  ]),
];
