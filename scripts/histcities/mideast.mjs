/* ============================================================================
 *  IntMap · HISTORICAL CITY NAMES — Turkey, Iran and the Levant   (#R427)
 * ----------------------------------------------------------------------------
 *  The Turkish Post Office fixed the modern spellings of Istanbul, İzmir and Ankara for
 *  international mail in 1930 — before that every atlas in Europe printed Constantinople, Smyrna
 *  and Angora — and the Republic went on replacing Ottoman and Arabic-era names for another fifty
 *  years. Iran's Pahlavi renamings of the 1930s are the same shape one border to the east.
 * ==========================================================================*/
import { C, E, N } from './lang.mjs';

export const ROWS = [
  /* ── Turkey ─────────────────────────────────────────────────────────────────────────────── */
  C('istanbul', 28.9784, 41.0082, 'TR', ['Istanbul', 'İstanbul'], [
    E(0, 1929, N('Constantinople', 'コンスタンティノープル', 'Константинополь', '君士坦丁堡', '君士坦丁堡', '콘스탄티노폴리스', { de: 'Konstantinopel', es: 'Constantinopla', fr: 'Constantinople' })),
  ]),
  C('izmir', 27.1428, 38.4237, 'TR', ['İzmir', 'Izmir'], [
    E(0, 1929, N('Smyrna', 'スミルナ', 'Смирна', '士麥那', '士麦那', '스미르나', { de: 'Smyrna', es: 'Esmirna', fr: 'Smyrne' })),
  ]),
  C('ankara', 32.8541, 39.9334, 'TR', ['Ankara'], [
    E(0, 1929, N('Angora', 'アンゴラ', 'Ангора', '安哥拉', '安哥拉', '앙고라', { de: 'Angora', es: 'Angora', fr: 'Angora' })),
  ]),
  C('edirne', 26.5557, 41.6771, 'TR', ['Edirne'], [
    E(0, 1929, N('Adrianople', 'アドリアノープル', 'Адрианополь', '亞得里亞堡', '亚得里亚堡', '아드리아노폴리스', { de: 'Adrianopel', es: 'Adrianópolis', fr: 'Andrinople' })),
  ]),
  C('trabzon', 39.7168, 41.0027, 'TR', ['Trabzon'], [
    E(0, 1929, N('Trebizond', 'トレビゾンド', 'Трапезунд', '特拉比松', '特拉比松', '트레비존드', { de: 'Trapezunt', es: 'Trebisonda', fr: 'Trébizonde' })),
  ]),
  C('antakya', 36.1612, 36.2021, 'TR', ['Antakya'], [
    E(0, 1938, N('Antioch', 'アンティオキア', 'Антиохия', '安條克', '安条克', '안티오키아', { de: 'Antiochia', es: 'Antioquía', fr: 'Antioche' })),
  ]),
  C('iskenderun', 36.1667, 36.5870, 'TR', ['İskenderun', 'Iskenderun'], [
    E(0, 1938, N('Alexandretta', 'アレクサンドレッタ', 'Александретта', 0, 0, 0, { de: 'Alexandrette', es: 'Alejandreta', fr: 'Alexandrette' })),
  ]),
  C('gaziantep', 37.3781, 37.0662, 'TR', ['Gaziantep'], [
    E(0, 1920, N('Aintab', 'アインターブ', 'Айнтаб', 0, 0, 0, { de: 'Aintab', fr: 'Aïntab' })),
  ]),
  C('sanliurfa', 38.7955, 37.1591, 'TR', ['Şanlıurfa', 'Sanliurfa'], [
    E(0, 1983, N('Urfa', 'ウルファ', 'Урфа', 0, 0, 0)),
  ]),
  C('kahramanmaras', 36.9371, 37.5753, 'TR', ['Kahramanmaraş', 'Kahramanmaras'], [
    E(0, 1972, N('Maraş', 'マラシュ', 'Мараш', 0, 0, 0, { de: 'Marasch', fr: 'Marach' })),
  ]),
  C('mersin', 34.6415, 36.8121, 'TR', ['Mersin'], [
    E(1933, 2001, N('İçel', 'イチェル', 'Ичель', 0, 0, 0)),
  ]),
  C('elazig', 39.2233, 38.6810, 'TR', ['Elazığ', 'Elazig'], [
    E(0, 1936, N('Mamuretülaziz', 'マームレトゥルアズィーズ', 'Мамурет-уль-Азиз', 0, 0, 0)),
  ]),
  C('bursa', 29.0610, 40.1885, 'TR', ['Bursa'], [
    E(0, 1929, N('Brusa', 'ブルサ', 'Бруса', 0, 0, 0, { de: 'Brussa', fr: 'Brousse' })),
  ]),
  /* ── Iran ───────────────────────────────────────────────────────────────────────────────── */
  C('bandar-e-anzali', 49.4622, 37.4733, 'IR', ['Bandar-e Anzali', 'بندر انزلی'], [
    E(1935, 1979, N('Bandar-e Pahlavi', 'バンダレ・パフラヴィー', 'Бендер-Пехлеви', 0, 0, 0)),
  ]),
  C('bandar-e-emam-khomeyni', 49.0764, 30.4275, 'IR', ['Bandar-e Emam Khomeyni', 'بندر امام خمینی'], [
    E(0, 1978, N('Bandar Shahpur', 'バンダレ・シャープール', 'Бендер-Шахпур', 0, 0, 0)),
  ]),
  C('khorramshahr', 48.1839, 30.4392, 'IR', ['Khorramshahr', 'خرمشهر'], [
    E(0, 1924, N('Mohammerah', 'モハンメラ', 'Мохаммера', 0, 0, 0)),
  ]),
  C('ahvaz', 48.6692, 31.3183, 'IR', ['Ahvaz', 'اهواز'], [
    E(1897, 1935, N('Nasseri', 'ナーセリー', 'Насери', 0, 0, 0)),
  ]),
  C('zahedan', 60.8629, 29.4963, 'IR', ['Zahedan', 'زاهدان'], [
    E(0, 1928, N('Duzdab', 'ドゥズダーブ', 'Дуздаб', 0, 0, 0)),
  ]),
  C('arak', 49.6893, 34.0917, 'IR', ['Arak', 'اراک'], [
    E(0, 1937, N('Soltanabad', 'ソルターナーバード', 'Султанабад', 0, 0, 0)),
  ]),
  C('kermanshah', 47.0650, 34.3142, 'IR', ['Kermanshah', 'کرمانشاه'], [
    E(1986, 1994, N('Bakhtaran', 'バフタラーン', 'Бахтаран', 0, 0, 0)),
  ]),
  C('gorgan', 54.4349, 36.8381, 'IR', ['Gorgan', 'گرگان'], [
    E(0, 1937, N('Astarabad', 'アスタラーバード', 'Астрабад', 0, 0, 0)),
  ]),
  /* ── the Levant and the Gulf ─────────────────────────────────────────────────────────────── */
  C('tel-aviv', 34.7818, 32.0853, 'IL', ['Tel Aviv-Yafo', 'תל אביב-יפו'], [
    E(0, 1949, N('Tel Aviv', 'テルアビブ', 'Тель-Авив', '特拉維夫', '特拉维夫', '텔아비브')),
  ]),
  C('eilat', 34.9518, 29.5581, 'IL', ['Eilat', 'אילת'], [
    E(0, 1948, N('Umm al-Rashrash', 'ウンム・アッラシュラーシュ', 'Умм-эр-Рашраш', 0, 0, 0)),
  ]),
];
