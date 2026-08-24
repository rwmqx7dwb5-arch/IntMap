/* ============================================================================
 *  IntMap · HISTORICAL CITY NAMES — the Americas   (#R427)
 * ----------------------------------------------------------------------------
 *  Fewer wholesale programmes here than in Europe or Africa, and two distinct kinds instead:
 *  the settlements of the Canadian Arctic, which took back their Inuktitut names one at a time
 *  between 1987 and 2020, and the individual acts — a war, a dictator, a dead president, a radio
 *  show — that renamed a single town on a single day.
 * ==========================================================================*/
import { C, E, N } from './lang.mjs';

export const ROWS = [
  /* ── the Canadian Arctic ────────────────────────────────────────────────────────────────── */
  C('iqaluit', -68.5170, 63.7467, 'CA', ['Iqaluit'], [
    E(0, 1986, N('Frobisher Bay', 'フロビッシャー・ベイ', 'Фробишер-Бей', 0, 0, 0)),
  ]),
  C('kuujjuaq', -68.4094, 58.1014, 'CA', ['Kuujjuaq'], [
    E(0, 1979, N('Fort Chimo', 'フォート・シモ', 'Форт-Чимо', 0, 0, 0)),
  ]),
  C('kugluktuk', -115.0972, 67.8272, 'CA', ['Kugluktuk'], [
    E(0, 1995, N('Coppermine', 'カッパーマイン', 'Коппермайн', 0, 0, 0)),
  ]),
  C('arviat', -94.0589, 61.1083, 'CA', ['Arviat'], [
    E(0, 1988, N('Eskimo Point', 'エスキモー・ポイント', 'Эскимо-Пойнт', 0, 0, 0)),
  ]),
  C('naujaat', -86.2422, 66.5264, 'CA', ['Naujaat'], [
    E(0, 2014, N('Repulse Bay', 'リパルス・ベイ', 'Рипалс-Бей', 0, 0, 0)),
  ]),
  C('kinngait', -76.5264, 64.2300, 'CA', ['Kinngait'], [
    E(0, 2019, N('Cape Dorset', 'ケープ・ドーセット', 'Кейп-Дорсет', 0, 0, 0)),
  ]),
  C('qikiqtarjuaq', -64.0333, 67.5583, 'CA', ['Qikiqtarjuaq'], [
    E(0, 1997, N('Broughton Island', 'ブロートン島', 'Остров Броутон', 0, 0, 0)),
  ]),
  C('kimmirut', -69.8739, 62.8472, 'CA', ['Kimmirut'], [
    E(0, 1995, N('Lake Harbour', 'レイク・ハーバー', 'Лейк-Харбор', 0, 0, 0)),
  ]),
  C('taloyoak', -93.5333, 69.5372, 'CA', ['Taloyoak'], [
    E(0, 1991, N('Spence Bay', 'スペンス・ベイ', 'Спенс-Бей', 0, 0, 0)),
  ]),
  C('kugaaruk', -89.8272, 68.5347, 'CA', ['Kugaaruk'], [
    E(0, 1998, N('Pelly Bay', 'ペリー・ベイ', 'Пелли-Бей', 0, 0, 0)),
  ]),
  C('inukjuak', -78.1000, 58.4539, 'CA', ['Inukjuak'], [
    E(0, 1964, N('Port Harrison', 'ポート・ハリソン', 'Порт-Гаррисон', 0, 0, 0)),
  ]),
  /* ── the rest of Canada ─────────────────────────────────────────────────────────────────── */
  C('kitchener', -80.4831, 43.4516, 'CA', ['Kitchener'], [
    E(0, 1915, N('Berlin (Ontario)', 'ベルリン（オンタリオ州）', 'Берлин (Онтарио)', 0, 0, 0)),
  ]),
  C('thunder-bay', -89.2477, 48.3809, 'CA', ['Thunder Bay'], [
    E(0, 1969, N('Fort William', 'フォート・ウィリアム', 'Форт-Уильям', 0, 0, 0)),
  ]),
  C('gatineau', -75.7013, 45.4765, 'CA', ['Gatineau'], [
    E(0, 2001, N('Hull (Quebec)', 'ハル（ケベック州）', 'Халл (Квебек)', 0, 0, 0)),
  ]),
  C('saguenay', -71.0683, 48.4283, 'CA', ['Saguenay'], [
    E(0, 2001, N('Chicoutimi', 'シクーティミ', 'Шикутими', 0, 0, 0)),
  ]),
  /* ── the United States ──────────────────────────────────────────────────────────────────── */
  C('cape-canaveral', -80.6053, 28.3922, 'US', ['Cape Canaveral'], [
    E(1963, 1972, N('Cape Kennedy', 'ケープ・ケネディ', 'Мыс Кеннеди', '甘迺迪角', '肯尼迪角', '케네디곶', { de: 'Kap Kennedy', es: 'Cabo Kennedy', fr: 'Cap Kennedy' })),
  ]),
  C('utqiagvik', -156.7886, 71.2906, 'US', ['Utqiagvik'], [
    E(0, 2016, N('Barrow', 'バロー', 'Барроу', 0, 0, 0)),
  ]),
  C('sitka', -135.3300, 57.0531, 'US', ['Sitka'], [
    E(0, 1867, N('Novo-Arkhangelsk', 'ノヴォアルハンゲリスク', 'Ново-Архангельск', 0, 0, 0, { de: 'Nowo-Archangelsk' })),
  ]),
  C('truth-or-consequences', -107.2528, 33.1284, 'US', ['Truth or Consequences'], [
    E(0, 1949, N('Hot Springs (New Mexico)', 'ホットスプリングス（ニューメキシコ州）', 'Хот-Спрингс (Нью-Мексико)', 0, 0, 0)),
  ]),
  C('sleepy-hollow', -73.8588, 41.0857, 'US', ['Sleepy Hollow'], [
    E(0, 1996, N('North Tarrytown', 'ノース・タリータウン', 'Норт-Тэрритаун', 0, 0, 0)),
  ]),
  C('jim-thorpe', -75.7324, 40.8698, 'US', ['Jim Thorpe'], [
    E(0, 1953, N('Mauch Chunk', 'モーク・チャンク', 'Мок-Чанк', 0, 0, 0)),
  ]),
  /* ── Latin America and the Caribbean ────────────────────────────────────────────────────── */
  /* ⚠ «Santo Domingo!» — Ecuador's Santo Domingo carries «Santo Domingo de los Colorados» as its
     own name in the tiles and this spelling only as a GeoNames alternate; the bare form belongs to
     the Dominican capital. */
  C('santo-domingo', -69.9312, 18.4861, 'DO', ['Santo Domingo!'], [
    E(1936, 1960, N('Ciudad Trujillo', 'シウダ・トルヒーヨ', 'Сьюдад-Трухильо', '特魯希略城', '特鲁希略城', '시우다드트루히요')),
  ]),
  C('la-plata', -57.9545, -34.9215, 'AR', ['La Plata'], [
    E(1952, 1955, N('Eva Perón', 'エバ・ペロン', 'Эва-Перон', 0, 0, 0)),
  ]),
  C('ciudad-juarez', -106.4869, 31.7386, 'MX', ['Ciudad Juárez', 'Ciudad Juarez'], [
    E(0, 1887, N('Paso del Norte', 'パソ・デル・ノルテ', 'Пасо-дель-Норте', 0, 0, 0)),
  ]),
  C('ciudad-obregon', -109.9403, 27.4828, 'MX', ['Ciudad Obregón', 'Ciudad Obregon'], [
    E(0, 1927, N('Cajeme', 'カヘメ', 'Кахеме', 0, 0, 0)),
  ]),
  C('chetumal', -88.2968, 18.5036, 'MX', ['Chetumal'], [
    E(0, 1935, N('Payo Obispo', 'パヨ・オビスポ', 'Пайо-Обиспо', 0, 0, 0)),
  ]),
  C('linden-gy', -58.3029, 6.0009, 'GY', ['Linden'], [
    E(0, 1969, N('Mackenzie (Guyana)', 'マッケンジー（ガイアナ）', 'Маккензи (Гайана)', 0, 0, 0)),
  ]),
];
