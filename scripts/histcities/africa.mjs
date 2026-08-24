/* ============================================================================
 *  IntMap · HISTORICAL CITY NAMES — Africa   (#R427)
 * ----------------------------------------------------------------------------
 *  Independence is a date, and on that date a great many cities stopped carrying the name of a
 *  European king, governor or company. Congo-Kinshasa renamed almost every provincial capital in
 *  1966; Angola and Mozambique did the same in 1975–1976; Zimbabwe in 1982; and South Africa is
 *  still doing it, which is why several spans here end in the 2000s and one in 2021.
 * ==========================================================================*/
import { C, E, N } from './lang.mjs';

export const ROWS = [
  /* ── Democratic Republic of the Congo: the 1966 authenticity campaign ─────────────────────── */
  C('kinshasa', 15.3136, -4.3276, 'CD', ['Kinshasa'], [
    E(0, 1965, N('Léopoldville', 'レオポルドヴィル', 'Леопольдвиль', '利奧波德維爾', '利奥波德维尔', '레오폴드빌', { de: 'Leopoldville', es: 'Leopoldville' })),
  ]),
  C('kisangani', 25.1918, 0.5153, 'CD', ['Kisangani'], [
    E(0, 1965, N('Stanleyville', 'スタンリーヴィル', 'Стэнливиль', '斯坦利維爾', '斯坦利维尔', '스탠리빌', { de: 'Stanleyville', es: 'Stanleyville' })),
  ]),
  C('lubumbashi', 27.4794, -11.6642, 'CD', ['Lubumbashi'], [
    E(0, 1965, N('Élisabethville', 'エリザベートヴィル', 'Элизабетвиль', '伊麗莎白維爾', '伊丽莎白维尔', '엘리자베트빌', { de: 'Elisabethville', es: 'Elisabethville' })),
  ]),
  C('mbandaka', 18.2633, 0.0478, 'CD', ['Mbandaka'], [
    E(0, 1965, N('Coquilhatville', 'コキラヴィル', 'Кокийавиль', 0, 0, 0)),
  ]),
  C('kananga', 22.4178, -5.8961, 'CD', ['Kananga'], [
    E(0, 1965, N('Luluabourg', 'ルルアブール', 'Лулуабург', 0, 0, 0)),
  ]),
  C('likasi', 26.7384, -10.9814, 'CD', ['Likasi'], [
    E(0, 1965, N('Jadotville', 'ジャドヴィル', 'Жадовиль', 0, 0, 0)),
  ]),
  C('bandundu', 17.3800, -3.3133, 'CD', ['Bandundu'], [
    E(0, 1965, N('Banningville', 'バニングヴィル', 'Баннингвиль', 0, 0, 0)),
  ]),
  C('bukavu', 28.8480, -2.5083, 'CD', ['Bukavu'], [
    E(0, 1965, N('Costermansville', 'コステルマンスヴィル', 'Костерманвиль', 0, 0, 0)),
  ]),
  C('isiro', 27.6167, 2.7667, 'CD', ['Isiro'], [
    E(0, 1965, N('Paulis', 'ポーリス', 'Паулис', 0, 0, 0)),
  ]),
  C('kalemie', 29.1944, -5.9467, 'CD', ['Kalemie'], [
    E(0, 1970, N('Albertville', 'アルベールヴィル', 'Альбервиль', 0, 0, 0)),
  ]),
  C('ilebo', 20.5833, -4.3167, 'CD', ['Ilebo'], [
    E(0, 1971, N('Port-Francqui', 'ポール・フランキ', 'Порт-Франки', 0, 0, 0)),
  ]),
  /* ── Zimbabwe: the 1982 renaming ─────────────────────────────────────────────────────────── */
  C('harare', 31.0534, -17.8252, 'ZW', ['Harare'], [
    E(0, 1981, N('Salisbury', 'ソールズベリー', 'Солсбери', '索爾茲伯里', '索尔兹伯里', '솔즈베리', { de: 'Salisbury', es: 'Salisbury' })),
  ]),
  C('mutare', 32.6500, -18.9724, 'ZW', ['Mutare'], [
    E(0, 1981, N('Umtali', 'ウムタリ', 'Умтали', 0, 0, 0)),
  ]),
  C('gweru', 29.8167, -19.4500, 'ZW', ['Gweru'], [
    E(0, 1981, N('Gwelo', 'グウェロ', 'Гвело', 0, 0, 0)),
  ]),
  C('kwekwe', 29.8149, -18.9281, 'ZW', ['Kwekwe'], [
    E(0, 1981, N('Que Que', 'クェクェ', 'Кве-Кве', 0, 0, 0)),
  ]),
  C('masvingo', 30.8333, -20.0667, 'ZW', ['Masvingo'], [
    E(0, 1981, N('Fort Victoria', 'フォート・ヴィクトリア', 'Форт-Виктория', 0, 0, 0)),
  ]),
  C('chinhoyi', 30.2000, -17.3667, 'ZW', ['Chinhoyi'], [
    E(0, 1981, N('Sinoia', 'シノイア', 'Синоя', 0, 0, 0)),
  ]),
  /* ⚠ KADOMA (formerly Gatooma) IS NOT HERE: 門真市 Kadoma in Osaka Prefecture, 131 727 people,
     carries the same Latin spelling as its own name. The build found it. */
  C('marondera', 31.5500, -18.1833, 'ZW', ['Marondera'], [
    E(0, 1981, N('Marandellas', 'マランデラス', 'Марандельяс', 0, 0, 0)),
  ]),
  C('chegutu', 30.1500, -18.1333, 'ZW', ['Chegutu'], [
    E(0, 1981, N('Hartley', 'ハートレー', 'Хартли', 0, 0, 0)),
  ]),
  C('zvishavane', 30.0667, -20.3333, 'ZW', ['Zvishavane'], [
    E(0, 1981, N('Shabani', 'シャバニ', 'Шабани', 0, 0, 0)),
  ]),
  C('hwange', 26.5000, -18.3667, 'ZW', ['Hwange'], [
    E(0, 1981, N('Wankie', 'ワンキー', 'Ванки', 0, 0, 0)),
  ]),
  C('shurugwi', 30.0000, -19.6667, 'ZW', ['Shurugwi'], [
    E(0, 1981, N('Selukwe', 'セルクウェ', 'Селукве', 0, 0, 0)),
  ]),
  C('chipinge', 32.6206, -20.1889, 'ZW', ['Chipinge'], [
    E(0, 1981, N('Chipinga', 'チピンガ', 'Чипинга', 0, 0, 0)),
  ]),
  /* ── Zambia ─────────────────────────────────────────────────────────────────────────────── */
  C('kabwe', 28.4464, -14.4469, 'ZM', ['Kabwe'], [
    E(0, 1965, N('Broken Hill', 'ブロークン・ヒル', 'Брокен-Хилл', 0, 0, 0)),
  ]),
  /* ── Mozambique: 1975–1976 ──────────────────────────────────────────────────────────────── */
  C('maputo', 32.5832, -25.9653, 'MZ', ['Maputo'], [
    E(0, 1975, N('Lourenço Marques', 'ロウレンソ・マルケス', 'Лоренсу-Маркиш', '洛倫索馬貴斯', '洛伦索马贵斯', '로렌수마르케스')),
  ]),
  C('chimoio', 33.4833, -19.1167, 'MZ', ['Chimoio'], [
    E(0, 1974, N('Vila Pery', 'ヴィラ・ペリ', 'Вила-Пери', 0, 0, 0)),
  ]),
  C('xai-xai', 33.6442, -25.0519, 'MZ', ['Xai-Xai'], [
    E(0, 1974, N('João Belo', 'ジョアン・ベロ', 'Жуан-Белу', 0, 0, 0)),
  ]),
  C('lichinga', 35.2406, -13.3128, 'MZ', ['Lichinga'], [
    E(0, 1974, N('Vila Cabral', 'ヴィラ・カブラル', 'Вила-Кабрал', 0, 0, 0)),
  ]),
  C('pemba-mz', 40.5178, -12.9739, 'MZ', ['Pemba'], [
    E(0, 1975, N('Porto Amélia', 'ポルト・アメリア', 'Порту-Амелия', 0, 0, 0)),
  ]),
  C('cuamba', 36.5372, -14.8031, 'MZ', ['Cuamba'], [
    E(0, 1974, N('Nova Freixo', 'ノヴァ・フレイショ', 'Нова-Фрейшу', 0, 0, 0)),
  ]),
  /* ── Angola: 1975 ───────────────────────────────────────────────────────────────────────── */
  C('huambo', 15.7392, -12.7761, 'AO', ['Huambo'], [
    E(1928, 1974, N('Nova Lisboa', 'ノヴァ・リスボア', 'Нова-Лижбоа', '新里斯本', '新里斯本', '노바리스보아')),
  ]),
  C('lubango', 13.4925, -14.9177, 'AO', ['Lubango'], [
    E(0, 1974, N('Sá da Bandeira', 'サー・ダ・バンデイラ', 'Са-да-Бандейра', 0, 0, 0)),
  ]),
  C('kuito', 16.9333, -12.3833, 'AO', ['Kuito'], [
    E(0, 1974, N('Silva Porto', 'シルヴァ・ポルト', 'Силва-Порту', 0, 0, 0)),
  ]),
  C('saurimo', 20.3956, -9.6608, 'AO', ['Saurimo'], [
    E(0, 1974, N('Henrique de Carvalho', 'エンリケ・デ・カルヴァーリョ', 'Энрике-де-Карвалью', 0, 0, 0)),
  ]),
  C('menongue', 17.6911, -14.6572, 'AO', ['Menongue'], [
    E(0, 1974, N('Serpa Pinto', 'セルパ・ピント', 'Серпа-Пинту', 0, 0, 0)),
  ]),
  C('uige', 15.0614, -7.6086, 'AO', ['Uíge', 'Uige'], [
    E(0, 1974, N('Carmona', 'カルモナ', 'Кармона', 0, 0, 0)),
  ]),
  C('ndalatando', 14.9117, -9.2978, 'AO', ["N'dalatando", 'Ndalatando'], [
    E(0, 1974, N('Vila Salazar', 'ヴィラ・サラザール', 'Вила-Салазар', 0, 0, 0)),
  ]),
  C('sumbe', 13.8436, -11.2061, 'AO', ['Sumbe'], [
    E(0, 1974, N('Novo Redondo', 'ノヴォ・レドンド', 'Нову-Редонду', 0, 0, 0)),
  ]),
  C('ondjiva', 15.7344, -17.0667, 'AO', ['Ondjiva'], [
    E(0, 1974, N("Vila Pereira d'Eça", 'ヴィラ・ペレイラ・デサ', 'Вила-Перейра-д’Эса', 0, 0, 0)),
  ]),
  C('luena', 19.9167, -11.7833, 'AO', ['Luena'], [
    E(0, 1974, N('Luso', 'ルソ', 'Лусу', 0, 0, 0)),
  ]),
  C('mocamedes', 12.1522, -15.1961, 'AO', ['Moçâmedes', 'Mocamedes'], [
    E(1985, 2015, N('Namibe', 'ナミベ', 'Намибе', 0, 0, 0)),
  ]),
  /* ── South Africa: still running ─────────────────────────────────────────────────────────── */
  C('gqeberha', 25.6022, -33.9608, 'ZA', ['Gqeberha'], [
    E(0, 2020, N('Port Elizabeth', 'ポートエリザベス', 'Порт-Элизабет', '伊麗莎白港', '伊丽莎白港', '포트엘리자베스', { de: 'Port Elizabeth', es: 'Port Elizabeth', fr: 'Port Elizabeth' })),
  ]),
  C('kariega', 25.5728, -33.7658, 'ZA', ['Kariega'], [
    E(0, 2020, N('Uitenhage', 'ユイテンハーヘ', 'Эйтенхахе', 0, 0, 0)),
  ]),
  C('makhanda', 26.5328, -33.3103, 'ZA', ['Makhanda'], [
    E(0, 2018, N('Grahamstown', 'グラハムズタウン', 'Грэхэмстаун', 0, 0, 0)),
  ]),
  C('polokwane', 29.4667, -23.9045, 'ZA', ['Polokwane'], [
    E(0, 2004, N('Pietersburg', 'ピーターズバーグ', 'Питерсбург', 0, 0, 0)),
  ]),
  C('mbombela', 30.9700, -25.4653, 'ZA', ['Mbombela'], [
    E(0, 2008, N('Nelspruit', 'ネルスプロイト', 'Нелспрёйт', 0, 0, 0)),
  ]),
  C('emalahleni', 29.2333, -25.8772, 'ZA', ['eMalahleni', 'Emalahleni'], [
    E(0, 2005, N('Witbank', 'ウィットバンク', 'Витбанк', 0, 0, 0)),
  ]),
  C('mthatha', 28.7894, -31.5889, 'ZA', ['Mthatha'], [
    E(0, 2003, N('Umtata', 'ウムタタ', 'Умтата', 0, 0, 0)),
  ]),
  C('kwadukuza', 31.0519, -29.3311, 'ZA', ['KwaDukuza'], [
    E(0, 2005, N('Stanger', 'スタンガー', 'Стангер', 0, 0, 0)),
  ]),
  C('musina', 30.0433, -22.3483, 'ZA', ['Musina'], [
    E(0, 2002, N('Messina', 'メッシーナ', 'Мессина', 0, 0, 0)),
  ]),
  C('modimolle', 28.4081, -24.7000, 'ZA', ['Modimolle'], [
    E(0, 2001, N('Nylstroom', 'ネイルストルーム', 'Нилстром', 0, 0, 0)),
  ]),
  C('bela-bela', 28.2833, -24.8833, 'ZA', ['Bela-Bela'], [
    E(0, 2001, N('Warmbaths', 'ワームバス', 'Вармбатс', 0, 0, 0)),
  ]),
  C('lephalale', 27.7000, -23.6667, 'ZA', ['Lephalale'], [
    E(0, 2001, N('Ellisras', 'エリスラス', 'Эллисрас', 0, 0, 0)),
  ]),
  C('mokopane', 29.0167, -24.1833, 'ZA', ['Mokopane'], [
    E(0, 2002, N('Potgietersrus', 'ポチーターズラス', 'Потгитерсрюс', 0, 0, 0)),
  ]),
  /* ── the Sahel and Central Africa ────────────────────────────────────────────────────────── */
  C('ndjamena', 15.0444, 12.1067, 'TD', ["N'Djamena", 'Ndjamena'], [
    E(0, 1972, N('Fort-Lamy', 'フォール・ラミー', 'Форт-Лами', '拉密堡', '拉密堡', '포르라미')),
  ]),
  C('sarh', 18.3903, 9.1450, 'TD', ['Sarh'], [
    E(0, 1971, N('Fort-Archambault', 'フォール・アルシャンボー', 'Форт-Аршамбо', 0, 0, 0)),
  ]),
  C('dolisie', 12.6667, -4.1981, 'CG', ['Dolisie'], [
    E(1975, 1990, N('Loubomo', 'ルボモ', 'Лубомо', 0, 0, 0)),
  ]),
  C('malabo', 8.7833, 3.7500, 'GQ', ['Malabo'], [
    E(0, 1972, N('Santa Isabel', 'サンタ・イサベル', 'Санта-Исабель', 0, 0, 0)),
  ]),
  C('limbe-cm', 9.2119, 4.0228, 'CM', ['Limbe'], [
    E(0, 1981, N('Victoria (Cameroon)', 'ヴィクトリア（カメルーン）', 'Виктория (Камерун)', 0, 0, 0)),
  ]),
  C('bujumbura', 29.3599, -3.3822, 'BI', ['Bujumbura'], [
    E(0, 1961, N('Usumbura', 'ウスンブラ', 'Усумбура', 0, 0, 0)),
  ]),
  /* ── Madagascar: the 1975 malgachisation ─────────────────────────────────────────────────── */
  C('antananarivo', 47.5216, -18.8792, 'MG', ['Antananarivo'], [
    E(0, 1974, N('Tananarive', 'タナナリブ', 'Тананариве', '塔那那利佛', '塔那那利佛', '타나나리브', { de: 'Tananarive', es: 'Tananarive' })),
  ]),
  C('toamasina', 49.4023, -18.1499, 'MG', ['Toamasina'], [
    E(0, 1974, N('Tamatave', 'タマタブ', 'Таматаве', 0, 0, 0)),
  ]),
  C('mahajanga', 46.3167, -15.7167, 'MG', ['Mahajanga'], [
    E(0, 1976, N('Majunga', 'マジュンガ', 'Мадзунга', 0, 0, 0)),
  ]),
  C('antsiranana', 49.2917, -12.2750, 'MG', ['Antsiranana'], [
    E(0, 1974, N('Diégo-Suarez', 'ディエゴ・スアレス', 'Диего-Суарес', 0, 0, 0, { de: 'Diego Suarez', es: 'Diego Suárez' })),
  ]),
  C('toliara', 43.6667, -23.3500, 'MG', ['Toliara'], [
    E(0, 1974, N('Tuléar', 'トゥレアール', 'Тулеар', 0, 0, 0)),
  ]),
  /* ── the Maghreb: the 1962 renaming of French Algeria ─────────────────────────────────────── */
  C('annaba', 7.7667, 36.9000, 'DZ', ['Annaba', 'عنابة'], [
    E(0, 1961, N('Bône', 'ボーヌ', 'Бон', 0, 0, 0, { de: 'Bône', es: 'Bona' })),
  ]),
  C('skikda', 6.9094, 36.8761, 'DZ', ['Skikda', 'سكيكدة'], [
    E(0, 1961, N('Philippeville', 'フィリップヴィル', 'Филиппвиль', 0, 0, 0)),
  ]),
  C('bejaia', 5.0842, 36.7556, 'DZ', ['Béjaïa', 'Bejaia', 'بجاية'], [
    E(0, 1961, N('Bougie', 'ブジー', 'Бужи', 0, 0, 0)),
  ]),
  C('chlef', 1.3347, 36.1653, 'DZ', ['Chlef', 'الشلف'], [
    E(0, 1961, N('Orléansville', 'オルレアンヴィル', 'Орлеанвиль', 0, 0, 0)),
    E(1962, 1980, N('El Asnam', 'エル・アスナム', 'Эль-Аснам', 0, 0, 0)),
  ]),
  C('el-eulma', 5.6906, 36.1533, 'DZ', ['El Eulma', 'العلمة'], [
    E(0, 1961, N('Saint-Arnaud', 'サン・タルノー', 'Сен-Арно', 0, 0, 0)),
  ]),
  C('kenitra', -6.5802, 34.2610, 'MA', ['Kenitra', 'القنيطرة'], [
    E(1932, 1955, N('Port-Lyautey', 'ポール・リョーテ', 'Порт-Лиотей', 0, 0, 0)),
  ]),
  C('dakhla', -15.9300, 23.6848, 'EH', ['Dakhla', 'الداخلة'], [
    E(0, 1975, N('Villa Cisneros', 'ビジャ・シスネロス', 'Вилья-Сиснерос', 0, 0, 0)),
  ]),
];
