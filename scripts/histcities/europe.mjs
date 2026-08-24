/* ============================================================================
 *  IntMap · HISTORICAL CITY NAMES — the rest of Europe   (#R427)
 * ----------------------------------------------------------------------------
 *  The Adriatic coast, which was mapped in Italian until 1947; the Habsburg successor states,
 *  where every town in Transylvania, the Banat and the Vojvodina had a Hungarian and a German
 *  name until 1918; the eastern bloc's leader-cities, of which Stalin alone had four; Norway's
 *  Kristiania; and Ireland's crown names, which went in 1920.
 * ==========================================================================*/
import { C, E, N } from './lang.mjs';

export const ROWS = [
  /* ── the leader-cities of the eastern bloc ───────────────────────────────────────────────── */
  C('podgorica', 19.2636, 42.4411, 'ME', ['Podgorica', 'Подгорица'], [
    E(1946, 1991, N('Titograd', 'チトーグラード', 'Титоград', '鐵托格勒', '铁托格勒', '티토그라드')),
  ]),
  C('varna', 27.9147, 43.2141, 'BG', ['Varna', 'Варна'], [
    E(1949, 1956, N('Stalin (Varna)', 'スターリン（ヴァルナ）', 'Сталин (Варна)', 0, 0, 0)),
  ]),
  C('brasov', 25.6012, 45.6579, 'RO', ['Brașov', 'Brasov'], [
    E(0, 1918, N('Kronstadt', 'クロンシュタット', 'Кронштадт (Трансильвания)', 0, 0, 0)),
    E(1950, 1959, N('Orașul Stalin', 'オラシュル・スターリン', 'Сталин (Румыния)', 0, 0, 0)),
  ]),
  C('dunaujvaros', 18.9355, 46.9628, 'HU', ['Dunaújváros', 'Dunaujvaros'], [
    E(1951, 1960, N('Sztálinváros', 'スターリンヴァーロシュ', 'Сталинварош', 0, 0, 0)),
  ]),
  C('uzice', 19.8483, 43.8586, 'RS', ['Užice', 'Ужице'], [
    E(1946, 1991, N('Titovo Užice', 'チトヴォ・ウジツェ', 'Титово-Ужице', 0, 0, 0)),
  ]),
  C('veles', 21.7753, 41.7156, 'MK', ['Veles', 'Велес'], [
    E(1946, 1995, N('Titov Veles', 'チトフ・ヴェレス', 'Титов-Велес', 0, 0, 0)),
  ]),
  C('pernik', 23.0333, 42.6000, 'BG', ['Pernik', 'Перник'], [
    E(1949, 1961, N('Dimitrovo', 'ディミトロヴォ', 'Димитрово', 0, 0, 0)),
  ]),
  C('dobrich', 27.8272, 43.5714, 'BG', ['Dobrich', 'Добрич'], [
    E(1913, 1940, N('Bazargic', 'バザルジク', 'Базарджик', 0, 0, 0)),
    E(1949, 1989, N('Tolbukhin', 'トルブーヒン', 'Толбухин', 0, 0, 0)),
  ]),
  C('montana-bg', 23.2250, 43.4083, 'BG', ['Montana', 'Монтана'], [
    E(0, 1944, N('Ferdinand', 'フェルディナント', 'Фердинанд', 0, 0, 0)),
    E(1945, 1992, N('Mihaylovgrad', 'ミハイロフグラード', 'Михайловград', 0, 0, 0)),
  ]),
  C('blagoevgrad', 23.1000, 42.0167, 'BG', ['Blagoevgrad', 'Благоевград'], [
    E(0, 1949, N('Gorna Dzhumaya', 'ゴルナ・ジュマヤ', 'Горна-Джумая', 0, 0, 0)),
  ]),
  C('onesti', 26.7664, 46.2489, 'RO', ['Onești', 'Onesti'], [
    E(1965, 1989, N('Gheorghe Gheorghiu-Dej', 'ゲオルゲ・ゲオルギュ＝デジ', 'Георге Георгиу-Деж', 0, 0, 0)),
  ]),
  /* ── the Adriatic, mapped in Italian until 1947 ──────────────────────────────────────────── */
  C('rijeka', 14.4422, 45.3271, 'HR', ['Rijeka'], [
    E(0, 1946, N('Fiume', 'フィウメ', 'Фиуме', '阜姆', '阜姆', '피우메', { de: 'Fiume', es: 'Fiume', fr: 'Fiume' })),
  ]),
  C('zadar', 15.2314, 44.1194, 'HR', ['Zadar'], [
    E(0, 1946, N('Zara', 'ザーラ', 'Зара', 0, 0, 0, { de: 'Zara', es: 'Zara', fr: 'Zara' })),
  ]),
  C('pula', 13.8481, 44.8666, 'HR', ['Pula'], [
    E(0, 1946, N('Pola', 'ポーラ', 'Пола', 0, 0, 0, { de: 'Pola', es: 'Pola', fr: 'Pola' })),
  ]),
  C('dubrovnik', 18.0944, 42.6507, 'HR', ['Dubrovnik'], [
    E(0, 1918, N('Ragusa (Dalmatia)', 'ラグーザ（ダルマチア）', 'Рагуза', 0, 0, 0)),
  ]),
  C('sibenik', 15.8956, 43.7350, 'HR', ['Šibenik', 'Sibenik'], [
    E(0, 1918, N('Sebenico', 'セベニコ', 'Себенико', 0, 0, 0)),
  ]),
  C('kotor', 18.7712, 42.4247, 'ME', ['Kotor', 'Котор'], [
    E(0, 1918, N('Cattaro', 'カッタロ', 'Каттаро', 0, 0, 0)),
  ]),
  C('herceg-novi', 18.5375, 42.4531, 'ME', ['Herceg Novi', 'Херцег Нови'], [
    E(0, 1918, N('Castelnuovo di Cattaro', 'カステルヌオーヴォ', 'Кастельнуово', 0, 0, 0)),
  ]),
  C('durres', 19.4458, 41.3236, 'AL', ['Durrës', 'Durres'], [
    E(0, 1918, N('Durazzo', 'ドゥラッツォ', 'Дураццо', 0, 0, 0, { de: 'Durazzo', es: 'Durazzo', fr: 'Durazzo' })),
  ]),
  C('vlore', 19.4847, 40.4661, 'AL', ['Vlorë', 'Vlore'], [
    E(0, 1918, N('Valona', 'ヴァローナ', 'Валона', 0, 0, 0, { de: 'Valona', es: 'Valona', fr: 'Valona' })),
  ]),
  C('shkoder', 19.5117, 42.0683, 'AL', ['Shkodër', 'Shkoder'], [
    E(0, 1918, N('Scutari', 'スクタリ', 'Скутари', 0, 0, 0, { de: 'Skutari', es: 'Scutari', fr: 'Scutari' })),
  ]),
  C('bolzano', 11.3548, 46.4983, 'IT', ['Bolzano'], [
    E(0, 1918, N('Bozen', 'ボーツェン', 'Боцен', 0, 0, 0)),
  ]),
  /* ⚠ «Latina!» — the other Latina is a BOROUGH of Madrid (distrito), and the era name is written
     only onto the `ofm-city` layer, whose filter is `class in [city, town]`; a district of a
     capital is carried as a suburb and is not in that layer. */
  C('latina', 12.9033, 41.4676, 'IT', ['Latina!'], [
    E(1932, 1945, N('Littoria', 'リットリア', 'Литтория', 0, 0, 0)),
  ]),
  /* ── the Habsburg successor states ───────────────────────────────────────────────────────── */
  C('cluj-napoca', 23.6000, 46.7700, 'RO', ['Cluj-Napoca'], [
    E(0, 1918, N('Kolozsvár', 'コロジュヴァール', 'Коложвар', 0, 0, 0, { de: 'Klausenburg' })),
    E(1919, 1973, N('Cluj', 'クルージュ', 'Клуж', 0, 0, 0)),
  ]),
  C('timisoara', 21.2272, 45.7597, 'RO', ['Timișoara', 'Timisoara'], [
    E(0, 1918, N('Temesvár', 'テメシュヴァール', 'Темешвар', 0, 0, 0, { de: 'Temeswar' })),
  ]),
  C('oradea', 21.9189, 47.0722, 'RO', ['Oradea'], [
    E(0, 1918, N('Nagyvárad', 'ナジヴァーラド', 'Надьварад', 0, 0, 0, { de: 'Großwardein' })),
  ]),
  C('sibiu', 24.1521, 45.7983, 'RO', ['Sibiu'], [
    E(0, 1918, N('Hermannstadt', 'ヘルマンシュタット', 'Германштадт', 0, 0, 0)),
  ]),
  C('targu-mures', 24.5594, 46.5425, 'RO', ['Târgu Mureș', 'Targu Mures'], [
    E(0, 1918, N('Marosvásárhely', 'マロシュヴァーシャールヘイ', 'Марошвашархей', 0, 0, 0, { de: 'Neumarkt am Mieresch' })),
  ]),
  C('satu-mare', 22.8850, 47.7900, 'RO', ['Satu Mare'], [
    E(0, 1918, N('Szatmárnémeti', 'サトマールネーメティ', 'Сатмарнемети', 0, 0, 0, { de: 'Sathmar' })),
  ]),
  /* ⚠ «Constanța!» — the collision is Konstanz on the Bodensee, whose ROMANIAN exonym is spelled
     this way in GeoNames' alternate names; its own name, in every tile, is «Konstanz». */
  C('constanta', 28.6348, 44.1795, 'RO', ['Constanța!', 'Constanta'], [
    E(0, 1877, N('Küstendje', 'キュステンジェ', 'Кюстендже', 0, 0, 0)),
  ]),
  C('drobeta-turnu-severin', 22.6597, 44.6319, 'RO', ['Drobeta-Turnu Severin'], [
    E(0, 1971, N('Turnu Severin', 'トゥルヌ・セヴェリン', 'Турну-Северин', 0, 0, 0)),
  ]),
  C('subotica', 19.6650, 46.1006, 'RS', ['Subotica', 'Суботица'], [
    E(0, 1918, N('Szabadka', 'サバトカ', 'Сабадка', 0, 0, 0, { de: 'Maria-Theresiopel' })),
  ]),
  C('zrenjanin', 20.3894, 45.3814, 'RS', ['Zrenjanin', 'Зрењанин'], [
    E(0, 1918, N('Nagybecskerek', 'ナジベチケレク', 'Надьбечкерек', 0, 0, 0, { de: 'Großbetschkerek' })),
    E(1919, 1934, N('Veliki Bečkerek', 'ヴェリキ・ベチケレク', 'Велики-Бечкерек', 0, 0, 0)),
    E(1935, 1945, N('Petrovgrad', 'ペトロヴグラード', 'Петровград', 0, 0, 0)),
  ]),
  C('novi-sad', 19.8335, 45.2671, 'RS', ['Novi Sad', 'Нови Сад'], [
    E(0, 1918, N('Újvidék', 'ウーイヴィデーク', 'Уйвидек', 0, 0, 0, { de: 'Neusatz' })),
  ]),
  C('bitola', 21.3347, 41.0319, 'MK', ['Bitola', 'Битола'], [
    E(0, 1912, N('Monastir', 'モナスティル', 'Монастир', 0, 0, 0, { de: 'Monastir', fr: 'Monastir' })),
  ]),
  /* ── Greece: the exonyms the Ottoman and Venetian centuries left behind ───────────────────── */
  C('thessaloniki', 22.9352, 40.6401, 'GR', ['Thessaloniki', 'Θεσσαλονίκη'], [
    E(0, 1912, N('Salonica', 'サロニカ', 'Салоники', '薩洛尼卡', '萨洛尼卡', '살로니카', { de: 'Saloniki', es: 'Salónica', fr: 'Salonique' })),
  ]),
  /* ⚠ THE GREEK KEY «Ηράκλειο» IS DELIBERATELY ABSENT: Irakleio in Attica, a municipality of
     49 642 people, spells its own name exactly that way. Only the Latin key is safe here. */
  C('heraklion', 25.1442, 35.3387, 'GR', ['Heraklion'], [
    E(0, 1912, N('Candia', 'カンディア', 'Кандия', 0, 0, 0, { de: 'Candia', es: 'Candía', fr: 'Candie' })),
  ]),
  C('chania', 24.0192, 35.5122, 'GR', ['Chania', 'Χανιά'], [
    E(0, 1912, N('Canea', 'カネア', 'Канея', 0, 0, 0, { de: 'Canea', fr: 'La Canée' })),
  ]),
  C('ioannina', 20.8537, 39.6650, 'GR', ['Ioannina', 'Ιωάννινα'], [
    E(0, 1912, N('Janina', 'ヤニナ', 'Янина', 0, 0, 0, { de: 'Janina', fr: 'Janina' })),
  ]),
  C('komotini', 25.4058, 41.1222, 'GR', ['Komotini', 'Κομοτηνή'], [
    E(0, 1919, N('Gümülcine', 'ギュミュルジネ', 'Гюмюрджина', 0, 0, 0)),
  ]),
  /* ── Norway and Ireland ─────────────────────────────────────────────────────────────────── */
  C('oslo', 10.7522, 59.9139, 'NO', ['Oslo'], [
    E(0, 1924, N('Kristiania', 'クリスチャニア', 'Кристиания', '克里斯蒂安尼亞', '克里斯蒂安尼亚', '크리스티아니아', { de: 'Christiania', es: 'Cristianía', fr: 'Christiania' })),
  ]),
  C('trondheim', 10.3951, 63.4305, 'NO', ['Trondheim'], [
    E(1930, 1930, N('Nidaros', 'ニーダロス', 'Нидарос', 0, 0, 0)),
  ]),
  C('halden', 11.3875, 59.1289, 'NO', ['Halden'], [
    E(0, 1927, N('Fredrikshald', 'フレドリクスハル', 'Фредриксхальд', 0, 0, 0)),
  ]),
  C('dun-laoghaire', -6.1361, 53.2939, 'IE', ['Dún Laoghaire', 'Dun Laoghaire'], [
    E(1821, 1920, N('Kingstown', 'キングスタウン', 'Кингстаун', 0, 0, 0)),
  ]),
  C('cobh', -8.2958, 51.8508, 'IE', ['Cobh'], [
    E(1849, 1920, N('Queenstown', 'クイーンズタウン', 'Куинстаун', 0, 0, 0)),
  ]),
  C('portlaoise', -7.3019, 53.0344, 'IE', ['Portlaoise'], [
    E(0, 1928, N('Maryborough', 'メアリーバラ', 'Мэриборо', 0, 0, 0)),
  ]),
  /* ── Spain: the official readoption of the Galician, Catalan and Basque forms ─────────────── */
  C('a-coruna', -8.3959, 43.3623, 'ES', ['A Coruña', 'A Coruna'], [
    E(0, 1983, N('La Coruña', 'ラ・コルーニャ', 'Ла-Корунья', 0, 0, 0, { es: 'La Coruña', fr: 'La Corogne' })),
  ]),
  C('ourense', -7.8639, 42.3358, 'ES', ['Ourense'], [
    E(0, 1983, N('Orense', 'オレンセ', 'Оренсе', 0, 0, 0, { es: 'Orense' })),
  ]),
  C('girona', 2.8214, 41.9794, 'ES', ['Girona'], [
    E(0, 1980, N('Gerona', 'ヘローナ', 'Херона', 0, 0, 0, { es: 'Gerona', fr: 'Gérone' })),
  ]),
  C('lleida', 0.6200, 41.6167, 'ES', ['Lleida'], [
    E(0, 1979, N('Lérida', 'レリダ', 'Лерида', 0, 0, 0, { es: 'Lérida', fr: 'Lérida' })),
  ]),
];
