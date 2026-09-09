/* ============================================================================
 *  IntMap · JAPAN — 衆議院小選挙区 と 参議院選挙区   (#R584)
 * ----------------------------------------------------------------------------
 *  「アメリカ大統領選挙以外の選挙レイヤーも作って。衆院選、参院選など。」
 *
 *  ══ WHAT THE MINISTRY ACTUALLY PUBLISHES, MEASURED 2026-09-10 ═══════════════════════════════
 *  総務省「選挙関連資料」 puts every election's 結果調 online as about twenty-five separate files.
 *  The aggregate tables (party totals, seats, turnout) are .xls or .xlsx. The one table this layer
 *  needs most — 「候補者別得票数（小選挙区／選挙区）」, the only per-DISTRICT record that exists — is
 *  a typeset PDF for ten of the fourteen elections here and a spreadsheet for the other four.
 *  There is no CSV, no API and no e-Stat equivalent: e-Stat serves the ministry's own files back.
 *
 *  ⚠ SO THE PDF IS NOT A LAST RESORT HERE, IT IS THE RECORD, and it is read with `pdfjs-dist`
 *  (already a devDependency; build time only, no part of it reaches the browser). A layer built
 *  only from the spreadsheets would have to tell the reader that 2009, 2012, 2014, 2021, 2024 and
 *  2026 have no result, which is false — the result exists, it is just set in type.
 *
 *  ⚠ AND NOTHING THE PARSE PRODUCES IS TRUSTED. Every failure met while writing this file produced
 *  a full-looking map: half the ballot box missing, a fifth of the candidates orphaned, thirty-nine
 *  districts holding their neighbours' members. So each election passes three checks that come from
 *  three different documents before it can be written:
 *    · checkAgainstMinistry — the per-candidate votes, summed by party, against 総務省's own
 *      national 得票数 table AND its grand total (the ministry itemises 政党 and pools the rest in
 *      「諸派」, so the comparison is made in its vocabulary, not this file's);
 *    · checkDistricts — every district returns exactly the members it should, and the districts
 *      were read in the prefecture-then-district order the tables are printed in;
 *    · 参議院 only — the winners the candidate table names, constituency by constituency and party
 *      by party, against the ministry's separately compiled 都道府県別当選人数 table.
 *  Thirteen of the fourteen elections carry a full per-candidate record. The exceptions are named
 *  where they are excluded, in HC: 第24回 (2016) is a scanned PDF with no text in it at all, and
 *  第25回 (2019) is a BIFF8 spreadsheet that records its printed page breaks in a binary record this
 *  build cannot read — and the page break is what says which column a candidate's constituency is
 *  in. Both are still on the map, coloured from the ministry's compiled seat table; what is missing
 *  from those two is the list of who stood.
 *
 *  ══ GEOMETRY: FOUR 衆議院 MAPS AND TWO 参議院 MAPS ══════════════════════════════════════════
 *  Japan redrew its single-member districts in 1994 (300), 2002 (300, revised), 2013 (295),
 *  2017 (289) and 2022 (289, 10増10減). 西澤明 (東京大学空間情報科学研究センター) publishes the
 *  polygons for the last four at https://gtfs-gis.jp/senkyoku/ and puts them in the public domain
 *  ("選挙区のポリゴンデータはパブリックドメイン（CC0相当）とします。出所等を明示しないで使用しても
 *  かまいません。"). The 1994 map is not published anywhere this build could find, so 第41回 (1996)
 *  and 第42回 (2000) are NOT in this pack: an election drawn on the wrong decade's boundaries hands
 *  a seat to the wrong piece of ground.
 *
 *  The 参議院 constituency is the prefecture, except that since 2016 鳥取県・島根県 and
 *  徳島県・高知県 each elect one member together. ⚠ THAT PAIRING IS NOT WRITTEN OUT HERE. It is
 *  read from the ministry's own per-district table, which labels the row 「鳥取県・島根県」 in
 *  2016 and later and 「鳥取県」/「島根県」 before it — so the same code builds the 47-constituency
 *  map and the 45-constituency map, and a third 合区 would arrive without a line of new logic.
 *
 *      node scripts/elections/_selftest.mjs jp
 * ==========================================================================*/
import XLSX from 'xlsx';
/* ⚠ THE LEGACY BUILD, NOT THE DEFAULT ONE. pdfjs' default entry point expects a DOM (it reaches for
   `DOMMatrix` while building a page's text layer) and throws under Node; `legacy/build/pdf.mjs` is
   the same reader compiled for environments that have none. Build time only — no part of pdfjs is
   shipped to the browser. */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  zipEntries, shapefileParts, readShp, readDbf, mergeFeatures, simplifyGeoJSON,
} from '../lib/elections-geo.mjs';
import { feature as topoFeature, merge as topoMerge } from 'topojson-client';

export const about = '衆議院小選挙区 2009–2026（7回・4つの区割り）と 参議院選挙区 2007–2025（7回）。'
  + '区割り・都道府県境界のポリゴンと、総務省の候補者別得票数・当選人数・党派別得票数から構築。';

const SOUMU = 'https://www.soumu.go.jp/main_content/';
const GTFS = 'https://gtfs-gis.jp/';
const SMARTNEWS = 'https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/data/';

/* ── attribution ───────────────────────────────────────────────────────────────────────────────
   Every election carries the line the reader is shown. The result and the boundary come from two
   different publishers with two different licences, so both are named. */
const SRC_RESULT = '総務省 選挙関連資料（衆議院議員総選挙結果調／参議院議員通常選挙結果調）';
const LIC_RESULT = '総務省ホームページ利用規約（出典明示のうえ自由に利用可・CC BY 4.0 互換）';
const SRC_HR_GEO = '小選挙区ポリゴン（西澤明・東京大学空間情報科学研究センター, gtfs-gis.jp/senkyoku）';
const LIC_HR_GEO = 'パブリックドメイン（CC0 相当）';
const SRC_HC_GEO = '都道府県境界 (smartnews-smri/japan-topography) ／ 国土交通省 国土数値情報 行政区域データ';
const LIC_HC_GEO = '無償利用可（国土数値情報のクレジット表記が条件）';

/* ══ PARTIES ═══════════════════════════════════════════════════════════════════════════════════
   ⚠ THIS IS THE ONLY HAND-WRITTEN TABLE IN THE FILE AND IT EXISTS FOR ONE REASON: A COLOUR IS NOT
   IN THE DATA. 総務省 publishes party names, votes and seats; it does not publish the colour NHK
   and the newspapers use on election night, and that colour is what makes the map readable to
   somebody who watched the count. The key is the ministry's own 届出政党等 name exactly as it is
   printed, so this table is also the vocabulary the PDF reader matches candidates' party names
   against — and a name that is not here is a BUILD FAILURE, never a candidate silently dropped
   (#R538 measured what a "names I don't recognise" table does to a layer: it repaints the country).
   ⚠ `bloc` groups the bars a reader sees as one thing; it never merges a fill, because the seat
   belongs to the party that won it. */
const PARTIES = {
  '自由民主党':           { id: 'ldp',      en: 'Liberal Democratic Party',  col: '#3ca03c', bloc: '与党' },
  '公明党':               { id: 'komeito',  en: 'Komeito',                   col: '#f05a96', bloc: '与党' },
  '立憲民主党':           { id: 'cdp',      en: 'Constitutional Democratic Party', col: '#1e5fd0' },
  '民主党':               { id: 'dpj',      en: 'Democratic Party of Japan', col: '#1e5fd0' },
  '民進党':               { id: 'dp',       en: 'Democratic Party',          col: '#2f7ad6' },
  '希望の党':             { id: 'kibo',     en: 'Party of Hope',             col: '#1fa87a' },
  '国民民主党':           { id: 'dpfp',     en: 'Democratic Party for the People', col: '#f0b400' },
  '日本維新の会':         { id: 'ishin',    en: 'Japan Innovation Party',    col: '#8dc63f' },
  '維新の党':             { id: 'ishin-o',  en: 'Japan Innovation Party (2014)', col: '#8dc63f' },
  'おおさか維新の会':     { id: 'osaka-i',  en: 'Initiatives from Osaka',    col: '#8dc63f' },
  '日本共産党':           { id: 'jcp',      en: 'Japanese Communist Party',  col: '#d0343a' },
  '社会民主党':           { id: 'sdp',      en: 'Social Democratic Party',   col: '#4bb3d4' },
  'れいわ新選組':         { id: 'reiwa',    en: 'Reiwa Shinsengumi',         col: '#e0457b' },
  '参政党':               { id: 'sanseito', en: 'Sanseito',                  col: '#e8730c' },
  '日本保守党':           { id: 'conserv',  en: 'Conservative Party of Japan', col: '#1d3f8f' },
  'みんなの党':           { id: 'yourparty',en: "Your Party",                col: '#00a0b0' },
  '国民新党':             { id: 'pnp',      en: 'People’s New Party',   col: '#f7941e' },
  '新党大地':             { id: 'daichi',   en: 'New Party Daichi',          col: '#a3673f' },
  '新党大地・真民主':     { id: 'daichi-sm',en: 'New Party Daichi–Shin Minshu', col: '#a3673f' },
  '日本未来の党':         { id: 'mirai',    en: 'Tomorrow Party of Japan',   col: '#5bbf8a' },
  '生活の党':             { id: 'seikatsu', en: 'People’s Life Party',  col: '#7a55a8' },
  '生活の党と山本太郎となかまたち': { id: 'seikatsu-y', en: 'People’s Life Party & Taro Yamamoto and Friends', col: '#7a55a8' },
  '次世代の党':           { id: 'jisedai',  en: 'Party for Future Generations', col: '#2a4b8d' },
  '日本のこころを大切にする党': { id: 'kokoro', en: 'Party for Japanese Kokoro', col: '#8e3f8e' },
  '新党改革':             { id: 'kaikaku',  en: 'New Renaissance Party',     col: '#c26a2a' },
  /* 改革クラブ renamed itself 新党改革 in 2010, so the two are the same continuing party and
     carry the same colour; they are separate ids because the ministry reports them separately
     and a reader looking at 第45回 is shown the name that was on the 2009 ballot */
  '改革クラブ':           { id: 'kaikaku-c',en: 'Reform Club',               col: '#c26a2a' },
  '新党日本':             { id: 'nippon',   en: 'New Party Nippon',          col: '#c05a8a' },
  '新党改革・無所属の会': { id: 'kaikaku-m',en: 'New Renaissance Party / Independents', col: '#c26a2a' },
  '幸福実現党':           { id: 'happiness',en: 'Happiness Realization Party', col: '#f2b23a' },
  'ＮＨＫから国民を守る党': { id: 'nhk',    en: 'Party to Protect the People from NHK', col: '#1a9ad6' },
  'ＮＨＫと裁判してる党弁護士法７２条違反で': { id: 'nhk', en: 'Party to Protect the People from NHK', col: '#1a9ad6' },
  'ＮＨＫ党':             { id: 'nhk',      en: 'NHK Party',                 col: '#1a9ad6' },
  'みんなでつくる党':     { id: 'minnade',  en: 'Party of Everyone',         col: '#1a9ad6' },
  '教育無償化を実現する会': { id: 'kyoiku', en: 'Council for Free Education', col: '#57b5a5' },
  '減税日本':             { id: 'genzei',   en: 'Tax Cuts Japan',            col: '#e07b39' },
  /* the alliance 減税日本 fought 第51回 in; the ministry gives it its own column (354,617 votes
     in the 小選挙区) and it took no seat, so it is its own row in the bars and a shade of the
     orange 減税日本 is drawn in, dark enough to be told apart from it on a map */
  '減税日本・ゆうこく連合': { id: 'genzei-y', en: 'Tax Cuts Japan – Yūkoku Alliance', col: '#b8541c' },
  'チームみらい':         { id: 'team-m',   en: 'Team Mirai',                col: '#00b3a4' },
  '再生の道':             { id: 'saisei',   en: 'Path to Rebirth',           col: '#6b7f9e' },
  '中道改革連合':         { id: 'chudo',    en: 'Centrist Reform Alliance',  col: '#2f7ad6' },
  /* ── the 政治団体 that stood, took a column in the ministry's tables and never became one
     of the parties an election night has a colour for ─────────────────────────────
     ⚠ THEY ARE NAMED HERE BECAUSE THE MINISTRY NAMES THEM, AND THEY SHARE THE NEUTRAL BECAUSE
     NOBODY PUBLISHES A COLOUR FOR THEM. Every one of them heads a column of a 得票数 or a
     当選人数 table, so leaving them out makes the strict header check stop the build — which is
     the point of that check. Inventing twenty-one colours would be inventing data; they carry the
     same neutral as 諸派 and are told apart by their names, which ARE in the data and are what the
     reader is shown. A row here earns a colour of its own on the day it wins something and a
     broadcaster gives it one. */
  '維新政党・新風': { id: 'shinpu', en: 'Ishin Seitō Shinpū', col: '#9aa0a8' },
  '９条ネット': { id: 'kyujo-net', en: 'Article 9 Net', col: '#9aa0a8' },
  '共生新党': { id: 'kyosei', en: 'Kyōsei New Party', col: '#9aa0a8' },
  '女性党': { id: 'josei', en: 'Women’s Party', col: '#9aa0a8' },
  '新党本質': { id: 'honshitsu', en: 'Shintō Honshitsu', col: '#9aa0a8' },
  'たちあがれ日本': { id: 'tachiagare', en: 'Sunrise Party of Japan', col: '#9aa0a8' },
  '日本創新党': { id: 'soshin', en: 'New Party Nippon Sōshin', col: '#9aa0a8' },
  'みどりの風': { id: 'midori-kaze', en: 'Green Wind', col: '#9aa0a8' },
  '緑の党': { id: 'midori', en: 'Greens Japan', col: '#9aa0a8' },
  '支持政党なし': { id: 'shijinashi', en: 'The Party for No Party', col: '#9aa0a8' },
  '国民怒りの声': { id: 'ikari', en: 'Party of the People’s Anger', col: '#9aa0a8' },
  'オリーブの木': { id: 'olive', en: 'Olive Tree', col: '#9aa0a8' },
  '労働の解放をめざす労働者党': { id: 'roudousha', en: 'Workers’ Party for the Liberation of Labour', col: '#9aa0a8' },
  'ごぼうの党': { id: 'gobou', en: 'Gobō Party', col: '#9aa0a8' },
  '新党くにもり': { id: 'kunimori', en: 'Shintō Kunimori', col: '#9aa0a8' },
  '日本第一党': { id: 'jfp', en: 'Japan First Party', col: '#9aa0a8' },
  '新党やまと': { id: 'yamato', en: 'Shintō Yamato', col: '#9aa0a8' },
  '安楽死制度を考える会': { id: 'anrakushi', en: 'Association to Consider a Euthanasia System', col: '#9aa0a8' },
  '無所属連合': { id: 'musozoku-r', en: 'Independents Alliance', col: '#9aa0a8' },
  '日本誠真会': { id: 'seishinkai', en: 'Nihon Seishinkai', col: '#9aa0a8' },
  '日本改革党': { id: 'kaikakutou', en: 'Japan Reform Party', col: '#9aa0a8' },
  '諸派':                 { id: 'minor',    en: 'Minor parties',             col: '#9aa0a8' },
  '無所属':               { id: 'ind',      en: 'Independent',               col: '#8a8f98' },
};
/* ══ THE PARTY NAMES IN THE OTHER LANGUAGES ════════════════════════════════════════════════════
   ⚠ ONLY WHERE A NAME ALREADY EXISTS IN THAT LANGUAGE. 総務省 publishes 届出政党等 in Japanese and
   nothing else, so a row here is a name a party is ACTUALLY CALLED by the press and the reference
   works of that language — never a translation invented while writing this file. Most of the sixty
   rows of PARTIES are 政治団体 that stood once and were never written about outside Japan; those
   carry their Japanese name and the English form the table above already holds, which is what a
   reader is better served by than a coinage.
   ⚠ WHERE ONLY PART OF A LANGUAGE SET EXISTS, ONLY THAT PART IS WRITTEN. 日本維新の会 is 維新會 in
   Chinese and 유신회 in Korean, while German, Russian, Spanish and French reporting uses the party's
   own English name — so this row has the four East Asian keys and no others, and those four
   readers fall through to `en`, which is the name the party itself publishes.
   ⚠ 諸派 and 無所属 are not parties at all but the ministry's two catch-all columns, and they are
   ordinary nouns in every language, so they are the two rows that are complete everywhere. */
const PARTY_I18N = {
  ldp: { de: 'Liberaldemokratische Partei', ru: 'Либерально-демократическая партия',
    es: 'Partido Liberal Democrático', fr: 'Parti libéral-démocrate',
    ko: '자유민주당', zh: '自由民主黨', 'zh-hans': '自由民主党' },
  komeito: { de: 'Kōmeitō', ru: 'Комэйто', es: 'Kōmeitō', fr: 'Kōmeitō',
    ko: '공명당', zh: '公明黨', 'zh-hans': '公明党' },
  cdp: { de: 'Konstitutionell-Demokratische Partei', ru: 'Конституционно-демократическая партия',
    es: 'Partido Constitucional Democrático', fr: 'Parti constitutionnel démocrate',
    ko: '입헌민주당', zh: '立憲民主黨', 'zh-hans': '立宪民主党' },
  dpj: { de: 'Demokratische Partei Japans', ru: 'Демократическая партия Японии',
    es: 'Partido Democrático de Japón', fr: 'Parti démocrate du Japon',
    ko: '민주당', zh: '民主黨', 'zh-hans': '民主党' },
  kibo: { de: 'Partei der Hoffnung', ru: 'Партия надежды', es: 'Partido de la Esperanza',
    fr: 'Parti de l’espoir', ko: '희망의 당', zh: '希望之黨', 'zh-hans': '希望之党' },
  dpfp: { de: 'Demokratische Partei für das Volk', ru: 'Демократическая партия для народа',
    es: 'Partido Democrático para el Pueblo', fr: 'Parti démocrate pour le peuple',
    ko: '국민민주당', zh: '國民民主黨', 'zh-hans': '国民民主党' },
  ishin: { ko: '일본유신회', zh: '日本維新會', 'zh-hans': '日本维新会' },
  jcp: { de: 'Kommunistische Partei Japans', ru: 'Коммунистическая партия Японии',
    es: 'Partido Comunista de Japón', fr: 'Parti communiste japonais',
    ko: '일본공산당', zh: '日本共產黨', 'zh-hans': '日本共产党' },
  sdp: { de: 'Sozialdemokratische Partei', ru: 'Социал-демократическая партия',
    es: 'Partido Socialdemócrata', fr: 'Parti social-démocrate',
    ko: '사회민주당', zh: '社會民主黨', 'zh-hans': '社会民主党' },
  reiwa: { ru: 'Рэйва синсэнгуми', ko: '레이와 신선조', zh: '令和新選組', 'zh-hans': '令和新选组' },
  sanseito: { ru: 'Сансэйто', ko: '참정당', zh: '參政黨', 'zh-hans': '参政党' },
  conserv: { de: 'Konservative Partei Japans', ru: 'Консервативная партия Японии',
    es: 'Partido Conservador de Japón', fr: 'Parti conservateur du Japon',
    ko: '일본보수당', zh: '日本保守黨', 'zh-hans': '日本保守党' },
  minor: { de: 'Kleinparteien', ru: 'Прочие партии', es: 'Partidos menores', fr: 'Petits partis',
    ko: '기타 정파', zh: '其他政團', 'zh-hans': '其他政团' },
  ind: { de: 'Parteilos', ru: 'Независимый', es: 'Independiente', fr: 'Sans étiquette',
    ko: '무소속', zh: '無黨籍', 'zh-hans': '无党籍' },
};

/* The candidate tables print a party in brackets when the candidate was not that party's own
   nominee, and print 無所属 that way too. The brackets are typography, not a different party. */
const stripParens = (s) => s.replace(/^[（(]\s*/, '').replace(/\s*[）)]$/, '');
/* The ministry marks a renamed party with a footnote (「立憲民主党　※１」) and wraps a long name
   across two header cells. Both are typesetting; neither is part of the name. */
const cleanPartyName = (s) => String(s == null ? '' : s)
  .replace(/[\s　]+/g, '').replace(/※.*$/, '').replace(/\(.*$/, '');

/* ⚠ ONE RESOLVER FOR EVERY TABLE IN THE FILE. `partyOfCell` (below) is what turns a printed
   届出政党等 into an id, and the spreadsheets go through the same door as the PDFs because they
   clip a name the same way: MEASURED on 第49回, the vote table heads a column
   「ＮＨＫと裁判してる党」 where the ballot said 「ＮＨＫと裁判してる党弁護士法７２条違反で」 — the
   rest of the name did not fit the cell. Two resolvers would disagree about that cell, which is the
   shape #R515 records: one rule, applied to the fact, not one per caller. */
function partyId(rawName) {
  const id = partyOfCell(rawName);
  if (!id) {
    throw new Error('unknown party 「' + stripParens(cleanPartyName(rawName)) +
      '」 — add it to PARTIES with its broadcast colour');
  }
  return id;
}
const knownParty = (name) => partyOfCell(name) != null;
/* longest first, so 「日本維新の会」 is never read as 「日本…」 and 「維新」 never eats 「日本維新の会」 */
const PARTY_NAMES = Object.keys(PARTIES).sort((a, b) => b.length - a.length);
/* the ministry's own bucket for every 政治団体 its summary tables do not give a column to */
const MINOR = 'jp:' + PARTIES['諸派'].id;

/* ══ PREFECTURE NAMES ══════════════════════════════════════════════════════════════════════════
   The JIS code and the Japanese name are read from the boundary file itself (§ prefTable). Only
   the ROMANISATION is written here, because no file in this build carries it: it is the one from
   ISO 3166-2:JP, which is also what every English-language source uses. */
const ROMAJI = ['', 'Hokkaido', 'Aomori', 'Iwate', 'Miyagi', 'Akita', 'Yamagata', 'Fukushima',
  'Ibaraki', 'Tochigi', 'Gunma', 'Saitama', 'Chiba', 'Tokyo', 'Kanagawa', 'Niigata', 'Toyama',
  'Ishikawa', 'Fukui', 'Yamanashi', 'Nagano', 'Gifu', 'Shizuoka', 'Aichi', 'Mie', 'Shiga', 'Kyoto',
  'Osaka', 'Hyogo', 'Nara', 'Wakayama', 'Tottori', 'Shimane', 'Okayama', 'Hiroshima', 'Yamaguchi',
  'Tokushima', 'Kagawa', 'Ehime', 'Kochi', 'Fukuoka', 'Saga', 'Nagasaki', 'Kumamoto', 'Oita',
  'Miyazaki', 'Kagoshima', 'Okinawa'];

/* ══ SHAPEFILE → DISTRICTS ═════════════════════════════════════════════════════════════════════
   ⚠ THE 2022 FILE IS 119,706 RECORDS FOR 289 DISTRICTS AND THAT IS NOT A DISSOLVE PROBLEM. Measured
   on 岩手2区: 8,201 records, of which the largest covers 1.010 of the district's 1.015 square
   degrees and the median covers 5.4e-9 (about 60 m²). The thousands of extras are offshore rocks
   carried over from the coastline source, so grouping the records of one district into one
   MultiPolygon is the whole of the work; `simplifyGeoJSON` then drops the rocks that are smaller
   than the tolerance, which is the correct answer for something that cannot be drawn at all.
   ⚠ Do NOT try to union the records: they were traced from two different sources (国土数値情報
   行政界 and 国勢調査 町丁字境域) and share no vertices at all — measured on 北海道9区, 61,168
   points and 60,731 distinct at 1e-7°, i.e. every boundary is digitised twice. */
async function readDistrictShapefile(ctx, url, { encoding = 'shift_jis' } = {}) {
  const entries = zipEntries(await ctx.get(url));
  const { shp, dbf } = shapefileParts(entries, '');
  if (!shp || !dbf) throw new Error('no shapefile inside ' + url);
  const geoms = readShp(shp);
  const rows = readDbf(dbf, encoding);
  if (geoms.length !== rows.length) throw new Error('shp/dbf disagree in ' + url);
  return { geoms, rows, url };
}

/** The name column, found by what it CONTAINS rather than by what it is called: the two older
 *  files carry Shift_JIS field names that a dBASE III header cannot represent, so 「タイトル」
 *  arrives as `^Cg` and any hard-coded field name would read the wrong column. */
/** ⚠ A BLANK IS NOT A FAILED TEST. The 2017 detailed set carries 21 records with every attribute
 *  null — lakes and reservoirs that belong to no district — and a field test that counts those as
 *  "this column is not the one" rejects the column that every other record fills correctly. */
function findField(rows, test) {
  /* ⚠ and NaN is blank too: readDbf turns a numeric field of spaces into Number('') → null but a
     field of anything else unparseable into NaN, which is neither null nor a failed test. */
  const blank = (v) => v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v));
  for (const k of Object.keys(rows[0])) {
    let ok = 0, bad = 0;
    for (const r of rows) { if (blank(r[k])) continue; if (test(r[k])) ok++; else bad++; }
    if (ok && !bad) return k;
  }
  return null;
}

/* ⚠ THE BOUNDARY FILES AND THE RESULT TABLES DO NOT SPELL A PREFECTURE THE SAME WAY. The shapefile
   writes 「青森1区」 and the ministry writes 「青森県 第1区」; only 北海道, 東京都, 大阪府 and 京都府
   carry their suffix in both. So the district name is split by trying every prefecture NAME the
   build knows — long forms and short forms together — rather than by a pattern that assumes one. */
const DISTRICT_NAME_RE = /^(.+?)\s*第?\s*(\d+)\s*区$/;

/** 「7,747」「１２３」「(3)」 → a number, or NaN. ⚠ NaN AND NOT ZERO for anything unreadable: an
 *  unparsed cell that became 0 is a candidate who polled nothing, which is a statement about a
 *  ballot rather than about this parser (elections-schema.mjs says the same about absent counts).
 *  Full-width digits occur in the older spreadsheets, where a cell typed by hand is text and not a
 *  number; the ministry's own tables mix 「,」 and the full-width 「，」 as the thousands mark. */
function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v == null ? '' : v)
    .replace(/[０-９．，－]/g, (c) => '0123456789.,-'['０１２３４５６７８９．，－'.indexOf(c)])
    .replace(/[\s　,]/g, '')
    .replace(/^[（(]|[）)]$/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

/** 「青森1区」「青森県 第1区」「東京都第25区」 → { ken, ku }, or null when the text names no
 *  single-member district at all.
 *  ⚠ THE PREFECTURE IS LOOKED UP, NOT CUT OUT BY A PATTERN. The boundary files print the short
 *  name (青森) and the ministry prints the long one (青森県), while 北海道・東京都・大阪府・京都府
 *  carry their suffix in both; an expression that assumes either shape reads one of the two
 *  sources wrong. `prefIdx` holds every spelling of every prefecture the build has actually seen,
 *  so what is accepted here is what the two files themselves say a prefecture is called.
 *  ⚠ The head is matched by its LONGEST known ending rather than by equality, because a result
 *  table prefixes the label in some years (「（再選挙）愛知県第5区」) and a shorter ending would let
 *  「京都府」 be read as 「都」 if such a prefecture existed. */
function districtOf(label, prefIdx) {
  const t = String(label == null ? '' : label).replace(/[\s　]/g, '');
  const m = DISTRICT_NAME_RE.exec(t);
  if (!m) return null;
  const head = m[1];
  let ken = prefIdx.get(head) ?? null;
  if (ken == null) {
    let best = '';
    for (const name of prefIdx.keys()) if (head.endsWith(name) && name.length > best.length) best = name;
    if (!best) return null;
    ken = prefIdx.get(best);
  }
  const ku = Number(m[2]);
  if (!Number.isInteger(ku) || ku < 1) return null;
  return { ken, ku };
}

/** JIS prefecture code → { short, full, en }. The code and the short name come from the boundary
 *  file that carries them side by side; the full name comes from the prefecture outlines, matched
 *  by prefix, so neither list is written out here. */
function prefTable(rows, fullNames) {
  const codeK = findField(rows, (v) => Number.isInteger(v) && v >= 1 && v <= 47);
  const nameK = findField(rows, (v) => typeof v === 'string' && DISTRICT_NAME_RE.test(v));
  if (!codeK || !nameK) throw new Error('the 2022 boundary file no longer carries ken + kuname');
  const out = new Map();
  for (const r of rows) {
    const ja = DISTRICT_NAME_RE.exec(r[nameK])[1];
    const was = out.get(r[codeK]);
    if (was && was.short !== ja) throw new Error('prefecture ' + r[codeK] + ' is both ' + was.short + ' and ' + ja);
    if (!was) {
      const hits = fullNames.filter((f) => f.startsWith(ja));
      if (hits.length !== 1) throw new Error('「' + ja + '」 matches ' + hits.length + ' prefecture outlines');
      out.set(r[codeK], { short: ja, full: hits[0], en: ROMAJI[r[codeK]] });
    }
  }
  if (out.size !== 47) throw new Error('expected 47 prefectures, found ' + out.size);
  return out;
}

/** Every spelling of every prefecture → its JIS code. */
function prefIndex(pref) {
  const idx = new Map();
  for (const [code, p] of pref) { idx.set(p.short, code); idx.set(p.full, code); }
  return idx;
}

/** One 衆議院 boundary era → a FeatureCollection keyed by 「<JIS>-<district number>」.
 *  ⚠ The join key is arithmetic, not a name: both file layouts carry a unique integer that is
 *  prefecture×100 + district, and this asserts that against the printed name before using it. */
function districtsToGeoJSON({ geoms, rows, url }, pref, prefIdx, tolerance) {
  const nameK = findField(rows, (v) => typeof v === 'string' && DISTRICT_NAME_RE.test(v));
  const codeK = findField(rows, (v) => Number.isInteger(v) && v >= 101 && v <= 4799);
  if (!nameK || !codeK) throw new Error(url + ': no district name / code column (' + Object.keys(rows[0]).join(',') + ')');
  const by = new Map();
  for (let i = 0; i < rows.length; i++) {
    if (!geoms[i]) continue;
    const code = rows[i][codeK], name = rows[i][nameK];
    /* a record that names no district IS in no district — the lakes described above */
    if (!Number.isFinite(code) || !name) continue;
    /* ⚠ THE NAME IS THE AUTHORITY FOR WHICH DISTRICT, THE CODE ONLY FOR WHICH PREFECTURE. Measured
       on the 2017 detailed set: four records are labelled 「島根1区」 and coded 3202, and the
       publisher's own change log records that a release of this set fixed 「コードの誤り」. The name
       is also what the ministry's result tables are keyed by, so a record follows its label; the
       code is still checked, but only for the half of itself that has never disagreed. */
    const d = districtOf(name, prefIdx);
    if (!d) throw new Error(url + ': cannot read the district out of 「' + name + '」');
    if (Math.floor(code / 100) !== d.ken) {
      throw new Error(url + ': code ' + code + ' is not in the prefecture its name 「' + name + '」 gives');
    }
    const { ken, ku } = d;
    const cd = ken + '-' + ku;
    if (!by.has(cd)) by.set(cd, { ken, ku, name: pref.get(ken).full + ku + '区', fs: [] });
    by.get(cd).fs.push({ geometry: geoms[i] });
  }
  const fc = {
    type: 'FeatureCollection',
    features: [...by].map(([cd, o]) => ({
      type: 'Feature',
      properties: { cd, n: { en: pref.get(o.ken).en + ' ' + o.ku, native: o.name, ja: o.name } },
      geometry: mergeFeatures(o.fs),
    })),
  };
  return simplifyGeoJSON(fc, { tolerance, decimals: 5 });
}

/* ══ 参議院: THE CONSTITUENCY IS THE PREFECTURE, EXCEPT WHEN TWO SHARE ONE ══════════════════════
   The prefecture outlines arrive as a TopoJSON, and that matters: a 合区 is a genuine union of two
   prefectures, and `topojson.merge` removes the boundary they share instead of leaving it drawn
   through the middle of one constituency. */
async function prefectureTopology(ctx) {
  const topo = await ctx.get(SMARTNEWS + 'municipality/topojson/s0010/prefectures.json', { json: true });
  const key = Object.keys(topo.objects)[0];
  const object = topo.objects[key];
  const named = new Map();
  for (const g of object.geometries) {
    const ja = String(Object.values(g.properties || {})[0] || '');
    if (!ja) throw new Error('a prefecture in the topology has no name');
    named.set(ja, g);
  }
  if (named.size !== 47) throw new Error('prefecture topology has ' + named.size + ' entries, not 47');
  return { topo, named, sample: topoFeature(topo, object) };
}

/** `labels` are the ministry's own district labels for one election — 「東京都」 or 「鳥取県・島根県」. */
function upperHouseGeo({ topo, named }, pref, prefIdx, labels) {
  const features = [];
  for (const label of labels) {
    const parts = label.split('・');
    const codes = parts.map((ja) => {
      const c = prefIdx.get(ja);
      if (c == null) throw new Error('the ministry names a constituency 「' + ja + '」 that is not a prefecture');
      return c;
    });
    const geometry = topoMerge(topo, parts.map((ja) => named.get(ja)));
    features.push({
      type: 'Feature',
      properties: {
        cd: codes.join('+'),
        n: { en: codes.map((c) => pref.get(c).en).join('–'), native: label, ja: label },
      },
      geometry,
    });
  }
  /* the prefecture outlines are already generalised by their publisher; rounding is all that is
     wanted here, and a tolerance would take a second bite out of the same coastline */
  return simplifyGeoJSON({ type: 'FeatureCollection', features }, { tolerance: 0, decimals: 5 });
}

/* ══ PDF ═══════════════════════════════════════════════════════════════════════════════════════
   ⚠ THE PDF IS NOT A LAST RESORT HERE, IT IS THE RECORD. 総務省 publishes 「候補者別得票数（小選挙
   区）」 — the only per-DISTRICT account of who stood and how many votes each of them took — as a
   typeset PDF for every 衆議院 election but 第48回 and for every 参議院 election but 第25·27回.
   There is no CSV, no API, and e-Stat serves the ministry's own files straight back. A pack that
   refused to read a PDF would colour one 衆議院 election out of seven.

   ⚠ AND IT IS READ WITH pdfjs, NOT WITH A READER WRITTEN HERE. An earlier draft of this file
   carried ~160 lines of one: an xref-free object scanner, a /ToUnicode CMap interpreter, an
   /ObjStm unpacker and four text encodings, because these seven files were produced by four
   different generators over seventeen years. It parsed, and it was WRONG IN A WAY THAT LOOKED
   RIGHT — measured 2026-09-10 on 第45回, it recovered 17,910,632 of the DPJ's 33,475,335 votes,
   i.e. about half the ballot box, while still producing a full-looking map. `pdfjs-dist` is
   already a devDependency of this repository, is Mozilla's own reader, and reads all seven files
   exactly (the checks in checkAgainstMinistry are what says «exactly»). It never reaches the
   browser: this file runs at build time only.

   `pdfRuns` is the whole of the interface to it — every glyph run with the position the file puts
   it at — and everything below works on those positions rather than on any reading order, because
   these tables are TWO INDEPENDENT COLUMNS on one landscape page and reading order interleaves
   them. */

/** One PDF → an array of pages, each an array of `{ x, y, w, t, s }` runs.
 *  ⚠ `y` IS NEGATED, so that «further down the page» is «larger y» for everything downstream. PDF
 *  user space grows upward; every other coordinate this build handles grows downward, and mixing
 *  the two sorts a table bottom to top without failing.
 *  ⚠ `w` IS THE FILE'S OWN ADVANCE WIDTH, not an estimate from the character count. The ministry's
 *  tables set a candidate's name one glyph per run with the tracking chosen by the typesetter
 *  (measured on 第45回: 「熊」「谷」「ひ」「さ」「子」 are five runs), so rejoining them needs the width
 *  of the run that came before, and guessing it from «wide characters are one em» misjoins the
 *  columns of any year whose tracking differs. */
async function pdfRuns(buf) {
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    const runs = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const m = it.transform;
      runs.push({ x: m[4], y: -m[5], w: it.width || 0, t: it.str, s: Math.hypot(m[0], m[1]) || 10 });
    }
    pages.push(runs);
  }
  await doc.destroy();
  return pages;
}

/** Glyph runs → cells, each tagged with the ROW it is printed on.
 *  A run ends where the next one does not continue it: `w` says where the previous run's ink
 *  stopped, and a following run that starts within `slack` ems of that point is the same cell
 *  continued rather than the next column.
 *
 *  ⚠ A ROW IS A BAND OF BASELINES, NOT ONE BASELINE. MEASURED on 第51回 page 19: the candidate
 *  「田中かずのり」 is set 0.25 pt above his own age, party and vote — the same row to any reader,
 *  two baselines to the file — while the rows themselves are 12 pt apart. Keying a row by its exact
 *  y (or by a rounded y, which is the same mistake with a hidden edge) cuts such a row in half and
 *  the half with the numbers has no 当落 mark, so it is not read as a candidate at all and its
 *  district is left one member short. Baselines are therefore grouped while they keep coming closer
 *  than a fraction of the type size, which is far below the line pitch in every file measured. */
const BAND = 0.45;   /* of the type size: 3.1 pt where the pitch is 28.5, 5.2 pt where it is 12 */

export function joinRuns(runs, slack) {
  if (!runs.length) return [];
  const sizes = runs.map((r) => r.s).sort((a, b) => a - b);
  const tol = sizes[sizes.length >> 1] * BAND;
  const band = new Map();
  { let id = 0, prev = -Infinity;
    for (const y of [...new Set(runs.map((r) => r.y))].sort((a, b) => a - b)) {
      if (y - prev > tol) id++;
      band.set(y, id); prev = y;
    } }
  const lines = new Map();
  for (const r of runs) {
    const k = band.get(r.y);
    if (!lines.has(k)) lines.set(k, []);
    lines.get(k).push(r);
  }
  const out = [];
  for (const [k, line] of lines) {
    line.sort((a, b) => a.x - b.x);
    let cur = null, end = -Infinity;
    for (const r of line) {
      if (cur && r.x <= end + r.s * slack) {
        cur.t += r.t; end = Math.max(end, r.x + r.w); cur.e = end; continue;
      }
      if (cur) out.push(cur);
      cur = { x: r.x, y: r.y, r: k, t: r.t, s: r.s, e: r.x + r.w }; end = cur.e;
    }
    if (cur) out.push(cur);
  }
  out.sort((a, b) => a.r - b.r || a.x - b.x);
  return out;
}

/* ══ THE CANDIDATE TABLE ═══════════════════════════════════════════════════════════════════════
   Every year's 候補者別得票数 is the same table typeset TWICE ACROSS ONE LANDSCAPE PAGE: a left
   half and a right half, each a run of 「<県> 第N区」 headings followed by that district's
   candidates, and the two halves share every text line. Reading such a page left to right
   interleaves two different districts, so the halves have to be separated before anything is read.

   ⚠ THE HALVES ARE FOUND FROM THE TABLE'S OWN HEADER ROW, NOT FROM ANY PROPERTY OF THE ROWS BELOW
   IT. A first attempt took the divide from the 当/落 marks that open each candidate row — hundreds
   of them per page, the widest gap between them being the gutter. MEASURED 2026-09-10 on 第50回
   page 18: 「落語家」 is a candidate's PROFESSION, printed mid-row at x=265, and it begins with 落.
   That one job title moved the divide from 417 to 265 and cut the 得票数 column off fourteen rows,
   which produced fourteen candidates with no votes and a district with no winner — on a page that
   still looked complete. Reading the rows to find out where the columns are was the mistake; the
   header row says where they are, prints 「当落」 and 「得票数」 once per half, and cannot be
   confused with anything a candidate might be called or do for a living.
   ⚠ A page with no such header is not a page of this table (these files open with contents and
   summary pages) and is skipped whole rather than parsed as if it were. */
function pageColumns(cells) {
  const norm = (t) => t.replace(/[\s　]/g, '');
  const find = (labels) => cells.filter((c) => labels.has(norm(c.t))).sort((a, b) => a.x - b.x);
  /* ⚠ 「当落」 IS ONE CELL IN THE 衆議院 TABLES AND TWO STACKED CELLS IN THE 参議院 ONES — 「当」
     set above 「落」 in a column one character wide. Both are the same heading, so the column is
     located by its x: the x of a 当落 cell, or an x that carries a 当 with a 落 under it. Only the
     x is wanted, which is why the fallback cannot be confused by the hundreds of 当 and 落 marks
     that open the candidate rows BELOW the heading — they stand at exactly that same x. */
  const cellsAt = (label) => find(new Set([label]));
  let markCells = cellsAt('当落');
  if (!markCells.length) {
    const raku = new Set(cellsAt('落').map((c) => Math.round(c.x)));
    markCells = cellsAt('当').filter((c) => raku.has(Math.round(c.x)));
  }
  /* one representative cell per column: the fallback matches the hundreds of 当 marks that open the
     candidate rows below the heading as well, and they all stand at the heading's own x */
  const seen = new Set();
  markCells = markCells.filter((c) => { const k = Math.round(c.x); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.x - b.x);
  if (!markCells.length) return null;
  const marks = markCells.map((c) => c.x);
  const votes = find(new Set(['得票数']));
  /* ⚠ TWO SPELLINGS OF ONE COLUMN, AND BOTH ARE THE MINISTRY'S. 衆議院 tables head it
     「届出政党等」 (the party that nominated the candidate) and the older 参議院 tables head it
     「党派」. This is the ministry's vocabulary for the same column, not a list of special cases. */
  /* ⚠ TWO SPELLINGS OF ONE COLUMN, AND BOTH ARE THE MINISTRY'S. 衆議院 tables head it
     「届出政党等」 (the party that nominated the candidate) and the 2026 and 参議院 tables head it
     「党派」. This is the ministry's vocabulary for one column, not a list of special cases. */
  const parties = find(new Set(['届出政党等', '党派']));
  /* 「新前元別」 / 「新現元別」 — whether the member is new, sitting or returning. It is wanted here
     only as a LANDMARK: it is the column immediately to the right of the party (see
     readCandidateRow), and it is set on two lines, 「新前」 above 「元別」, at one x. */
  const ranks = find(new Set(['新前', '新現', '新前元別', '新現元別']));
  if (votes.length !== marks.length || parties.length !== marks.length || ranks.length < marks.length) {
    throw new Error('a page of the candidate table has ' + marks.length + ' 当落 column(s), ' +
      votes.length + ' 得票数, ' + parties.length + ' 届出政党等 and ' + ranks.length +
      ' 新前元別 — the table has been re-typeset');
  }
  /* ── where one half ends and the next begins ───────────────────────────────────────────────
     ⚠ NOT «just left of the 当落 column». MEASURED on 第26回参院選, the right half's headings are
     set 3 pt to the LEFT of its own 当落 column (「埼玉県」 at 401, 当落 at 404), so a boundary at
     the column loses the first word of every heading in that half to the half beside it — 24 of the
     45 constituencies never opened. And a boundary far enough left to catch it would swallow the
     LEFT half's 惜敗率 column, which starts 26 pt before the gutter in the 衆議院 tables and would
     take the leading 当落 mark off every row of the right half instead.
     So the gutter is the middle of the empty space: from where the left half's own header row stops
     to where the right half's 当落 begins. The header band is the row the 当落 heading is on and the
     rows either side of it, because these tables set 「新前 / 元別」 and 「惜敗率 / (%)」 across two
     and three lines. */
  const band = new Set(markCells.map((c) => c.r));
  const inHead = cells.filter((c) => [...band].some((r) => Math.abs(c.r - r) <= 1));
  const gutter = marks.map((m, i) => {
    if (i === 0) return -Infinity;
    /* ⚠ WHOLLY INSIDE THE HALF: the table's own title is set across the middle of the page and
       is on the header band too, so a cell that merely BEGINS in this half can end 85 pt into
       the next one and drag the gutter with it (measured on 第21回参院選: 459 instead of 408,
       which cut the right half's 当落 mark off every row of the page). */
    const left = inHead.filter((c) => c.x >= marks[i - 1] && c.e <= m).reduce((w, c) => Math.max(w, c.e), marks[i - 1]);
    return (left + m) / 2;
  });
  return marks.map((m, i) => {
    const from = gutter[i];
    const to = i + 1 < marks.length ? gutter[i + 1] : Infinity;
    const rank = ranks.filter((c) => c.x >= from && c.x < to).sort((a, b) => a.x - b.x)[0];
    if (!rank) throw new Error('a half of the candidate table has no 新前元別 heading');
    return { from, to, vote: votes[i], rank };
  });
}

/* ⚠ ONE SHOW OPERATOR CAN CROSS THE GUTTER, AND THEN NO FILTER ON RUNS CAN SEPARATE THE HALVES.
   MEASURED on 第47回 page 6: the file emits 「18,554.100 茨城県」 as ONE run spanning 381.6–439.8,
   i.e. the left half's 供託物没収点 figure and the right half's next heading in a single string
   (pdfjs is asked for uncombined items and still returns it as one, because it is one). The whole
   heading 「茨城県第6区」 therefore landed in the left half, 茨城6区 never opened, and its members
   were counted into 茨城2区 — three districts of that election, four of 第46回 and five of 第45回.
   Such a run is cut at the space nearest the gutter. ⚠ THE POSITION OF THAT SPACE IS ESTIMATED,
   because the file gives one advance width for the whole run: full-width characters take an em and
   the rest half of one, which is exactly true of the fixed-pitch faces these tables are set in and
   only has to be good enough to tell one side of a 40 pt gutter from the other. */
const FULL_WIDTH = /[\u1100-\u115f\u2e80-\u4dbf\u4e00-\u9fff\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;
const emUnits = (t) => { let u = 0; for (const ch of t) u += FULL_WIDTH.test(ch) ? 1 : 0.5; return u; };

function splitAcross(runs, at) {
  const out = [];
  for (const r of runs) {
    if (!(r.x < at && r.x + r.w > at) || !/\s/.test(r.t.trim())) { out.push(r); continue; }
    const em = r.w / emUnits(r.t);
    let cut = -1, near = Infinity;
    for (let i = 0; i < r.t.length; i++) {
      if (!/\s/.test(r.t[i])) continue;
      const d = Math.abs(r.x + emUnits(r.t.slice(0, i)) * em - at);
      if (d < near) { near = d; cut = i; }
    }
    if (cut < 0) { out.push(r); continue; }
    const left = r.t.slice(0, cut), right = r.t.slice(cut + 1);
    if (left.trim()) out.push({ ...r, t: left, w: emUnits(left) * em });
    if (right.trim()) out.push({ ...r, x: r.x + emUnits(r.t.slice(0, cut + 1)) * em, t: right, w: emUnits(right) * em });
  }
  return out;
}

/** The cell of `row` that belongs to the column `head` heads: the one whose ink overlaps the
 *  heading's the most.
 *  ⚠ OVERLAP AND NOT DISTANCE, because a value is centred under its heading and may be much WIDER
 *  than it — 「（自民党を終わらせる党）」 is 84 pt under a 48 pt heading and starts 21 pt to the left
 *  of it, i.e. left of where the previous column's heading starts. Nearest-left-edge puts it in the
 *  年齢 column; overlap puts it where it is printed. */
function inColumn(row, head, test) {
  let best = null, most = 0;
  for (const c of row) {
    if (test && !test(c)) continue;
    const o = Math.min(c.e, head.e) - Math.max(c.x, head.x);
    if (o > most) { most = o; best = c; }
  }
  return best;
}

/** 「北海道第8区供託物没収点19,247.200」 or 「鳥取県・島根県(定数1名)」 → the district code and how
 *  many characters of the line the heading occupied, or null.
 *  ⚠ The prefecture is matched by NAME, longest first, never by a pattern: 「東京都第25区」 and
 *  「京都府第1区」 both open with a string ending in 都, and an expression that guesses where the
 *  prefecture stops gets one of them wrong every time. A 参議院 heading may name two prefectures
 *  joined by 「・」, which is where the 合区 appears in the typeset record too. */
function headingOf(text, prefIdx, names) {
  const t = String(text == null ? '' : text).replace(/[\s　]/g, '');
  const codes = [];
  let at = 0;
  for (;;) {
    const name = names.find((n) => t.startsWith(n, at));
    if (!name) break;
    codes.push(prefIdx.get(name));
    at += name.length;
    if (t[at] === '・') { at += 1; continue; }
    break;
  }
  if (!codes.length) return null;
  /* 衆議院: 「第8区」, and the 供託物没収点 figure printed beside it belongs to the heading */
  const lower = /^第?(\d+)区(供託物没収点[\d,.]*)?/.exec(t.slice(at));
  if (lower && codes.length === 1) return { cd: codes[0] + '-' + Number(lower[1]), len: at + lower[0].length };
  /* 参議院: 「(定数3名)」 — and the 定数 is KEPT, because it is the number of members that
     constituency returns and therefore the number of 当 marks that must follow this heading. It is
     the only place the ministry prints it beside the constituency, and checkDistricts uses it. */
  const upper = /^[（(]?定数(\d+)名?[）)]?/.exec(t.slice(at));
  if (upper) return { cd: codes.join('+'), len: at + upper[0].length, seats: Number(upper[1]) };
  return null;
}

/** Where a candidate's party name starts in the line, and which party it is.
 *  ⚠ THE PARTY IS LOOKED UP, NEVER CUT OUT WITH A PATTERN. 「日本維新の会前政党役員」 has no
 *  separator, and a non-greedy 「.+?(新|前|元|現)」 reads it as 日本維 | 新 — the party's own name
 *  contains the marker the pattern is looking for.
 *  ⚠ AND THE COLUMN IS SOMETIMES CLIPPED. Measured in 第24回参院選, 「日本のこころを大切にする党」
 *  is printed as 「日本のこころを」 with 「大切にする党」 wrapped onto the line below. A clipped cell
 *  is accepted only when it is the beginning of exactly one party's name; an ambiguous prefix stops
 *  the build rather than guessing which party a seat belongs to. */
function partyIn(line) {
  let at = -1, party = null;
  for (const name of PARTY_NAMES) {
    for (const written of [name, '（' + name + '）', '(' + name + ')']) {
      const i = line.indexOf(written, 1);
      if (i >= 0 && (at < 0 || i < at || (i === at && written.length > party.written.length))) {
        at = i; party = { name, written };
      }
    }
  }
  if (at >= 0) return { at, name: party.name, written: party.written };
  for (let i = 1; i + 4 <= line.length; i++) {
    const stem = line.slice(i).replace(/[新前元現][^新前元現]*$/, '');
    for (let len = Math.min(stem.length, 20); len >= 4; len--) {
      const head = line.slice(i, i + len);
      const hits = PARTY_NAMES.filter((n) => n.startsWith(head));
      if (!hits.length) continue;
      if (hits.length > 1) throw new Error('「' + head + '」 is the start of ' + hits.length + ' party names');
      return { at: i, name: hits[0], written: head };
    }
  }
  return null;
}

/** 「（川口自警団）」「日本のこころを」「立憲民主党」 → the party id printed in a 届出政党等 cell,
 *  or null when the cell names no party this build knows.
 *  ⚠ NULL IS A REAL ANSWER AND NOT A FAILURE. The ministry's summary table gives a column to each
 *  政党 and puts every other 政治団体 into 「諸派」; the per-candidate table names them all, so
 *  MEASURED on 第50回, 「川口自警団」 and 「自民党を終わらせる党」 stood for real seats. Refusing them
 *  (which the first draft did) dropped their rows silently and took 22,084 votes off the map; the
 *  caller instead files them where the ministry files them, and checkAgainstMinistry then compares
 *  that pile against the 諸派 column — so a party this table SHOULD have recognised cannot hide
 *  there, because 諸派 would come out too big by exactly its votes.
 *  ⚠ A CLIPPED CELL IS ACCEPTED ONLY WHEN IT CAN BE ONE PARTY. MEASURED in 第24回参院選,
 *  「日本のこころを大切にする党」 is printed as 「日本のこころを」 with the rest wrapped onto the line
 *  below; a prefix that fits two parties is ambiguous and stops the build rather than guessing. */
function partyOfCell(text) {
  const name = stripParens(cleanPartyName(text));
  if (!name) return null;
  /* ⚠ A TRAILING IDEOGRAPHIC SPACE MEANS A DIFFERENT REGISTRATION OF THE SAME NAME, and this is the
     one place in this file where a single row of one election is being described rather than a rule
     (.agents/rules/no-ad-hoc-hardcoding.md §6). MEASURED on 第27回参院選: the 東京都 candidate
     石濱哲信 (129,130 votes) has 「日本保守党　」 in the 届出政党等 column — the party's own four
     nominees have 「日本保守党」 with nothing after it — and 総務省's own 得票数 table counts his
     129,130 votes under 諸派 and gives 日本保守党 652,266 without them. Two 政治団体 registered the
     same name, the printed table distinguishes them by that character and by nothing else, and the
     ministry's totals say which is which. So the cell is compared with the trailing space intact:
     internal spacing is typography (「無　所　属」 is 無所属), a trailing one is a different body.
     ⚠ This costs nothing if it is wrong about some other file, because it cannot be wrong quietly:
     a party whose nominees were filed under 諸派 by this rule makes checkAgainstMinistry fail by
     exactly their votes. It can be deleted on the day the ministry stops printing the two the same.
     ⚠ It is applied to the raw cell, so 「（自由民主党）」 — the brackets that mark a candidate the
     party certified but did not nominate — is untouched. */
  if (/　[ \t]*$/.test(String(text == null ? '' : text))) return null;
  if (Object.prototype.hasOwnProperty.call(PARTIES, name)) return 'jp:' + PARTIES[name].id;
  if (name.length < 4) return null;
  const hits = PARTY_NAMES.filter((n) => n.startsWith(name));
  if (hits.length > 1) throw new Error('「' + name + '」 is the start of ' + hits.length + ' party names');
  return hits.length ? 'jp:' + PARTIES[hits[0]].id : null;
}

/** One row of one half of the table → a candidate, or null.
 *  ⚠ THE CELLS AND NOT JUST THE JOINED TEXT. The party and the vote are read from the columns the
 *  header names (see pageColumns and inColumn), because both were read wrong when they were looked
 *  for in the text: the vote «first whole number in the row» took the candidate's AGE for the 35
 *  rows of 第50回 whose count is fractional (按分票 — a ballot bearing only a surname two candidates
 *  share is split between them), and the party «longest known name appearing anywhere in the row»
 *  cannot see a 政治団体 that is not a party at all. The NAME is still read out of the text: the
 *  ministry sets name, age, party and profession without separators, and the name is simply what is
 *  printed between the 当落 mark and the party. */
function readCandidateRow(row, col) {
  const t = row.map((c) => c.t).join('').replace(/[\s　]/g, '');
  const won = t[0] === '当';
  if (!won && t[0] !== '落') return null;
  /* ⚠ THE PARTY IS THE LAST CELL BEFORE THE 新前元別 COLUMN, AND IT IS FOUND THAT WAY BECAUSE IT
     CANNOT BE FOUND BY ITS OWN HEADING. The heading is CENTRED over a wide column and the values in
     it are set FLUSH LEFT, so they need not touch it at all: MEASURED on 第51回, 「参政党」 occupies
     200–226 under a 「党 派」 heading that occupies 243–265 — no overlap — while the age 「50」 sits
     at 184–195, five points to its left. Any rule written on the heading's own ink puts the party
     in the 年齢 column, and 872 of that file's 1,207 rows were lost that way. What IS invariant is
     the ORDER of the columns: 年齢, 党派, 新前元別, 職業. So the party is whatever was printed last
     before the 新前元別 column began, and if that is a number then this row is not a candidate. */
  const pc = row.filter((c) => c.x < col.rank.x).pop();
  if (!pc) return null;
  if (/^[\d,.]+$/.test(pc.t.replace(/[\s　]/g, ''))) {
    throw new Error('the cell before the 新前元別 column is a number (「' + pc.t + '」) in row 「' +
      t.slice(0, 40) + '」 — the columns are not where the heading says');
  }
  const party = partyOfCell(pc.t);
  const vc = inColumn(row, col.vote, (c) => /^[\d,]+(?:\.\d+)?$/.test(c.t.replace(/[\s　]/g, '')));
  if (!vc) return null;
  const votes = toNumber(vc.t);
  if (!Number.isFinite(votes)) return null;
  /* the name runs from the 当落 mark to whichever of 性別 / 年齢 this year's table prints next */
  const head = row.filter((c) => c.x < pc.x).map((c) => c.t).join('').replace(/[\s　]/g, '');
  const name = head.slice(1).replace(/[（(].*$/, '').replace(/[男女]?\d+$/, '');
  return { won, party, votes, name: name || null };
}

/** A whole 候補者別得票数 PDF → Map<district code, { w, c[] }>.
 *  ⚠ THE DISTRICT BEING READ IS CARRIED ACROSS HALVES AND ACROSS PAGES, because a district's
 *  candidates are: the heading is printed once and the list runs on into the next column and onto
 *  the next page. MEASURED on 第50回, resetting it at each half orphaned 253 of the 1,190 candidate
 *  rows — a fifth of the ballot — and every one of those rows was silently dropped rather than
 *  reported, which is how the sums came out at two thirds of the ministry's while the map still
 *  looked complete. The order the halves are visited in is the order the table is set in: the left
 *  column of a page, then its right column, then the next page. `checkDistricts` is what says that
 *  order is right — a wrong one scrambles which candidates share a district, and a district then
 *  holds two winners or none. */
async function readCandidatePdf(buf, prefIdx) {
  const names = [...prefIdx.keys()].sort((a, b) => b.length - a.length);
  const out = new Map();
  let cur = null;
  const pages = await pdfRuns(buf);
  const perPage = pages.map((page) => (page.length ? pageColumns(joinRuns(page, 0.55)) : null));
  /* ⚠ ONE GUTTER FOR THE WHOLE DOCUMENT, NOT ONE PER PAGE. The table is set once, so the two halves
     stand in the same place on all of its pages, and measuring the gutter page by page lets one
     page's contents move it. MEASURED on 第21回参院選 page 4: something on that page's left half
     reaches 3 pt further right than on any other page, the gutter moved from 408 to 415, and the
     three headings that begin at 414 (新潟・富山・石川) fell into the left half and never opened —
     while every other page of the same file was read correctly. The median across the pages is the
     layout; a page that disagrees with it has something unusual printed on it, not a different
     layout. */
  const gutters = [];
  for (let i = 1; ; i++) {
    const xs = perPage.filter((c) => c && c.length > i).map((c) => c[i].from).sort((a, b) => a - b);
    if (!xs.length) break;
    gutters[i] = xs[xs.length >> 1];
  }
  for (const cols of perPage) {
    if (!cols) continue;
    for (let i = 0; i < cols.length; i++) {
      if (gutters[i] != null) cols[i].from = gutters[i];
      if (gutters[i + 1] != null) cols[i].to = gutters[i + 1];
    }
  }

  for (const [pi, page] of pages.entries()) {
    const cols = perPage[pi];
    if (!page.length || !cols) continue;
    let runs = page;
    for (const col of cols) if (Number.isFinite(col.from)) runs = splitAcross(runs, col.from);
    for (const col of cols) {
      /* ⚠ THE HALVES ARE CUT OUT OF THE RUNS AND RE-JOINED, NOT CUT OUT OF THE JOINED CELLS. The
         left half's last column and the right half's first are set flush against the gutter, so
         joining the whole line first glues them: MEASURED on 第50回 page 14, the left half's
         供託物没収点 figure 「24,191.600」 ends exactly where the right half's heading 「東京都」
         begins, they became one cell that sat in the left half, and 東京13区 lost its heading and
         had its candidates counted into 東京10区. Joining inside a half cannot cross the gutter. */
      const half = joinRuns(runs.filter((r) => r.x >= col.from && r.x < col.to), 0.55);
      const lines = new Map();
      for (const c of half) { if (!lines.has(c.r)) lines.set(c.r, []); lines.get(c.r).push(c); }
      for (const k of [...lines.keys()].sort((a, b) => a - b)) {
        let row = lines.get(k).sort((a, b) => a.x - b.x);
        /* a heading opens its district, and a candidate may share the heading's line; the heading
           is cut out of the row and what is left of the row is read as a candidate */
        for (;;) {
          const text = row.map((c) => c.t).join('').replace(/[\s　]/g, '');
          let found = null;
          for (let i = 0; i < text.length && !found; i++) { const h = headingOf(text.slice(i), prefIdx, names); if (h) found = { i, h }; }
          if (!found) break;
          cur = found.h.cd;
          if (!out.has(cur)) out.set(cur, { c: [], seats: found.h.seats });
          /* the heading occupies whole cells; drop the cells its characters fall in */
          let at = 0;
          row = row.filter((c) => {
            const len = c.t.replace(/[\s　]/g, '').length, from = at; at += len;
            return from >= found.i + found.h.len || at <= found.i;
          });
        }
        if (!cur) continue;
        const cand = readCandidateRow(row, col);
        if (!cand) continue;
        /* a 政治団体 the summary table does not itemise is where the ministry puts it: 諸派 */
        out.get(cur).c.push({ n: cand.name || '—', p: cand.party || MINOR, v: cand.votes, won: cand.won });
      }
    }
  }
  return out;
}

/* ⚠ THE COLOUR OF A DISTRICT IS THE ELECTED MEMBER WHO POLLED HIGHEST THERE, and for the 衆議院
   that is simply the member, because a 小選挙区 returns one. A 参議院 選挙区 returns up to four
   and they are not all of one party, so the fill answers 「その選挙区の最多得票の当選人」 and the
   note beside the map says so — averaging or blending them would paint a party that won nothing. */
function markWinners(byDistrict) {
  for (const rec of byDistrict.values()) {
    let best = null;
    for (const c of rec.c) if (c.won && (!best || c.v > best.v)) best = c;
    if (best) rec.w = best.p;
    /* who was elected here, party by party — kept because the ministry's own compiled seat table
       says the same thing independently, and the two are compared (see the 参議院 block of build) */
    rec.winners = rec.c.filter((c) => c.won).map((c) => c.p);
    rec.won = rec.winners.length;
    for (const c of rec.c) delete c.won;
    /* the fill is the elected member who polled highest; the bars come from the seat table */
  }
  return byDistrict;
}

/* ⚠ EVERY DISTRICT RETURNS EXACTLY ONE MEMBER, AND THAT IS WHAT SAYS THE PARSE PUT THE CANDIDATES
   IN THE RIGHT DISTRICTS. checkAgainstMinistry compares SUMS, and a sum is blind to which district
   a vote was counted in: two districts whose candidate lists were swapped add up to exactly the
   same national total. The seat does not — a district that collected somebody else's rows holds
   two 当 or none — so this is the check that the column-then-page reading order is the order the
   table was set in, and it is separate from the one on the money. */
function checkDistricts(label, byDistrict, districts, expected, seats) {
  /* ⚠ 参議院 CONSTITUENCIES DO NOT ALL RETURN ONE MEMBER — 東京 returns six and 鳥取・島根 one — so
     the number to check against is the 定数 the heading itself printed, and `seats` is only the
     fallback for the 衆議院, where every 小選挙区 returns exactly one and no heading says so. */
  const bad = [...byDistrict].filter(([, r]) => (r.won || 0) !== (r.seats ?? seats));
  if (bad.length) {
    throw new Error(label + ': ' + bad.length + ' district(s) do not return the members they should — ' +
      bad.slice(0, 6).map(([cd, r]) => cd + ' returns ' + (r.seats ?? seats) + ' and has ' + (r.won || 0)).join(', '));
  }
  /* and the 定数 of every constituency must add up to the seats the chamber filled this way */
  const filled = [...byDistrict.values()].reduce((n, r) => n + (r.seats ?? seats), 0);
  if (Number.isFinite(expected) && filled !== expected && [...byDistrict.values()].some((r) => r.seats != null)) {
    throw new Error(label + ': the constituencies return ' + filled + ' members between them, not ' + expected);
  }
  if (byDistrict.size !== districts) {
    throw new Error(label + ': read ' + byDistrict.size + ' constituencies, the chamber has ' + districts);
  }
  /* ⚠ AND THE ORDER THEY WERE READ IN IS CHECKED TOO. The ministry prints these tables in the
     order of the JIS prefecture code and then the district number, without exception in any of the
     fourteen files this pack reads. The insertion order of the map is the order the parse walked
     the columns and pages in, so a reading order that visits the halves or the pages in the wrong
     sequence shows up here as a district that opens out of turn — which is what 第48回 did, with
     both the national totals and the one-member-per-district count still perfect. */
  const seq = [...byDistrict.keys()].map((cd) => cd.split(/[-+]/).map(Number));
  for (let i = 1; i < seq.length; i++) {
    const [ka, ua = 0] = seq[i - 1], [kb, ub = 0] = seq[i];
    if (kb < ka || (kb === ka && ub <= ua)) {
      throw new Error(label + ': the districts were read out of order — ' +
        [...byDistrict.keys()][i - 1] + ' then ' + [...byDistrict.keys()][i] +
        '. The table is printed in prefecture then district order, so the parse walked the columns ' +
        'or the pages in the wrong sequence.');
    }
  }
}

/* ══ SPREADSHEETS ══════════════════════════════════════════════════════════════════════════════ */
const sheetRows = (buf) => {
  const wb = XLSX.read(buf, { type: 'buffer' });
  return wb.SheetNames.map((n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true }));
};

/** The rows an .xlsx says its own printed pages break after, or null when the file does not say.
 *  ⚠ THIS IS THE ONLY EXACT ANSWER TO A QUESTION THE ROWS THEMSELVES CANNOT SETTLE. An .xlsx is a
 *  zip of XML and the worksheet carries `<rowBreaks><brk id="45"/>…`, which is where the ministry
 *  set the page to end when it laid the table out — measured on 第27回参院選: 14 breaks at rows 45,
 *  87, 129 … , i.e. a 45-row first page and 42-row pages after it. That offset is why solving for a
 *  single page HEIGHT fails on this file, and why the order-derived fallback below also fails on it:
 *  東京都's candidates fill a whole column with no heading in it, so the columns never «go back to
 *  the left» and two pages merge. .xls (BIFF8) records the same thing in a binary record this build
 *  has no reader for, which is why 第25回参院選 is the one spreadsheet with no per-candidate data. */
function sheetPageBreaks(buf) {
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) return null;   /* not a zip → BIFF8 */
  for (const [name, data] of zipEntries(buf)) {
    if (!/^xl\/worksheets\/sheet1\.xml$/i.test(name)) continue;
    const at = [];
    for (const m of data.toString('utf8').matchAll(/<brk\b[^>]*\bid="(\d+)"/g)) at.push(Number(m[1]));
    return at.length ? at.sort((a, b) => a - b) : null;
  }
  return null;
}

/** 第48回衆院選 and 第25·27回参院選 published their 候補者別得票数 as a spreadsheet, and it is the
 *  same table as the PDF — two halves of one printed page — with the columns already cut into
 *  cells and the pages stacked into one sheet.
 *  ⚠ THE COLUMNS ARE READ FROM THE SHEET'S OWN HEADER ROW, exactly as the PDF's are read from its
 *  printed heading (pageColumns). An earlier draft took «the first string cell that names a party»
 *  and «the first integer above 99» instead: MEASURED on 第48回 that put 39 of the 289 districts
 *  out by a member, because a candidate whose profession wraps onto the next line leaves the vote
 *  cell of THAT line empty and the search then walked on into the next half.
 *  ⚠ AND THE HEADER IS TWO ROWS DEEP IN SOME YEARS. 第25回参院選 sets 「当」 above 「落」 in one
 *  cell's worth of column, so the label of a column is its cell joined with the cell beneath it. */
function readCandidateXls(buf, prefIdx) {
  const rows = sheetRows(buf)[0];
  const names = [...prefIdx.keys()].sort((a, b) => b.length - a.length);
  const norm = (v) => String(v == null ? '' : v).replace(/[\s　]/g, '');
  const label = (i, j) => norm(rows[i] && rows[i][j]) + norm(rows[i + 1] && rows[i + 1][j]);

  let head = null;
  for (let i = 0; i < rows.length && !head; i++) {
    const marks = rows[i].map((v, j) => j).filter((j) => label(i, j).startsWith('当落'));
    if (marks.length) head = { i, marks };
  }
  if (!head) throw new Error('the candidate spreadsheet has no 当落 column');
  const halves = head.marks.map((from, k) => {
    const to = k + 1 < head.marks.length ? head.marks[k + 1] : Math.max(...rows.map((r) => r.length));
    const col = (labels) => { for (let j = from; j < to; j++) if (labels.has(label(head.i, j))) return j; return -1; };
    const party = col(new Set(['届出政党等', '党派']));
    const vote = col(new Set(['得票数']));
    const name = col(new Set(['候補者氏名']));
    if (party < 0 || vote < 0) throw new Error('a half of the candidate spreadsheet has no 届出政党等 / 得票数 column');
    return { from, to, mark: from, party, vote, name };
  });

  /* ── where the printed pages end ───────────────────────────────────────────────────────────
     ⚠ THE READING ORDER IS PER PAGE — the left column of one page, then the right column of THAT
     page, then the next page — and the sheet does not record where a page ends. MEASURED on 第48回,
     the heading 「北海道 第5区」 is at the BOTTOM of the first page's left column (row 48) while its
     two candidates are at the TOP of the same page's right column (rows 4–10); reading every left
     row and then every right row misfiles thirty-nine districts, with the national totals still
     exact because nothing is lost, only put in the wrong place. 第48回 prints a 「(注)」 footer under
     every page and 第27回参院選 prints nothing at all, and the pages are not even the same height —
     MEASURED on 第27回, the first break must fall in rows 43–48 and the second in rows 73–93, and no
     constant height satisfies both.
     ⚠ SO THE PAGES ARE RECOVERED FROM THE ONE THING THAT IS INVARIANT: these tables are printed in
     prefecture-then-district order. Put the headings in that order and the columns they were found
     in read 0,0,1,1,0,0,1,1,…; every time the column goes BACK to the left, a page began. The break
     row is then the first heading of the new page, which keeps every district's candidates with the
     heading that opened them. ⚠ AND IT IS NOT ASSUMED TO BE RIGHT — checkDistricts counts the 当
     marks in each constituency against the 定数 printed in its own heading, and a page boundary in
     the wrong place moves a winner into a neighbour. */
  const heads = [];
  for (const [k, half] of halves.entries()) {
    for (let i = 0; i < rows.length; i++) {
      for (let j = half.from; j < half.to; j++) {
        const h = headingOf(norm(rows[i][j]), prefIdx, names);
        if (h) heads.push({ row: i, half: k, cd: h.cd });
      }
    }
  }
  if (!heads.length) throw new Error('the candidate spreadsheet has no district headings');
  const key = (x) => x.cd.split(/[-+]/).map(Number);
  heads.sort((x, y) => { const [ka, ua = 0] = key(x), [kb, ub = 0] = key(y); return ka - kb || ua - ub; });

  const groups = [[heads[0]]];
  for (const h of heads.slice(1)) {
    const last = groups[groups.length - 1];
    if (h.half >= last[last.length - 1].half) last.push(h); else groups.push([h]);
  }
  /* a page holds every row from the first heading printed on it to the last row before the next
     page's first heading, in BOTH halves at once — the two columns are side by side on one sheet
     of paper, so they break at the same place */
  /* ⚠ WHERE THE SHEET PRINTS ITS PAGE FOOTER, THAT IS THE ANSWER AND NOTHING HAS TO BE INFERRED.
     第48回 repeats 「(注)…」 under every page, and the footer sits BELOW the last candidate row and
     ABOVE the next page's first — which the district order alone cannot pin down, because a page
     can begin with rows that carry no heading (they continue the district the previous page's right
     column ended on). Inferring the break from the first heading of the next page instead put those
     rows on the wrong page for 26 of that election's districts. */
  /* ⚠ THE HEADER IS NOT A PAGE OF THE TABLE. 第25回参院選 sets 「当」 above 「落」, so the second
     header row looks exactly like a candidate row that has lost its vote — and it is one row
     per sheet, which is enough to stop the build with a message about the wrong thing. */
  const body = head.i + 2;
  /* ⚠ WHERE THE FILE ITSELF RECORDS THE PAGE BREAKS, NOTHING HAS TO BE INFERRED. */
  const recorded = sheetPageBreaks(buf);
  if (recorded) {
    const cuts = [body];
    for (const r of recorded) if (r > cuts[cuts.length - 1] && r < rows.length) cuts.push(r);
    cuts.push(rows.length);
    return readSheetPages(rows, halves, cuts, prefIdx, names, norm);
  }
  const footer = [];
  for (let i = 0; i < rows.length; i++) if (/^[（(]注[）)]/.test(norm(rows[i][0]))) footer.push(i);
  if (footer.length > 1) {
    const cuts = [body];
    for (const i of footer) if (i + 1 < rows.length && i + 1 > cuts[cuts.length - 1]) cuts.push(i + 1);
    cuts.push(rows.length);
    return readSheetPages(rows, halves, cuts, prefIdx, names, norm);
  }
  const breaks = [body];
  for (let g = 1; g < groups.length; g++) {
    const start = Math.min(...groups[g].map((h) => h.row));
    const end = Math.max(...groups[g - 1].map((h) => h.row));
    if (start <= end) {
      throw new Error('the headings of this sheet cannot be cut into printed pages: ' +
        'a page whose last heading is at row ' + end + ' is followed by one whose first is at row ' +
        start + ' — they cannot both be where the district order says they are');
    }
    breaks.push(start);
  }
  breaks.push(rows.length);

  return readSheetPages(rows, halves, breaks, prefIdx, names, norm);
}

/** The rows of a candidate spreadsheet, read page by page: the left column of one page, then the
 *  right column of that page, then the next page. `cuts` is where the printed pages begin. */
function readSheetPages(rows, halves, breaks, prefIdx, names, norm) {
  const out = new Map();
  let cur = null;
  for (let g = 0; g + 1 < breaks.length; g++) {
    for (const half of halves) {
      for (let i = breaks[g]; i < breaks[g + 1]; i++) {
        const row = rows[i];
        /* a heading opens its constituency, and may share its row with a candidate of the previous */
        for (let j = half.from; j < half.to; j++) {
          const h = headingOf(norm(row[j]), prefIdx, names);
          if (!h) continue;
          cur = h.cd;
          if (!out.has(cur)) out.set(cur, { c: [], seats: h.seats });
        }
        const mark = norm(row[half.mark]);
        if (!cur || (mark !== '当' && mark !== '落')) continue;
        const votes = toNumber(row[half.vote]);
        if (!Number.isFinite(votes)) {
          throw new Error(cur + ': a candidate row of the spreadsheet has nothing in the 得票数 column');
        }
        const who = norm(row[half.name >= 0 ? half.name : half.mark + 1]) || '—';
        out.get(cur).c.push({ n: who, p: partyOfCell(row[half.party]) || MINOR, v: votes, won: mark === '当' });
      }
    }
  }
  return out;
}

/** A cell of a 当選人数 table → the number of members it stands for.
 *  ⚠ 「14(1)」 IS FIFTEEN MEMBERS AND THE FILE SAYS SO IN A FOOTNOTE: 「（　）書は、通常選挙と
 *  合併して行われた補欠選挙の当選人の数で外書である」 — a by-election held on the same day, counted
 *  OUTSIDE the figure beside it. 第27回 filled 74 seats by the ordinary rotation and one more in
 *  東京 that way, and a reader of the bar chart is looking at the 125 members who took their seats.
 *  ⚠ The older sheets store these columns as TEXT and the newer ones as numbers; both arrive here. */
function seatCount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v == null ? '' : v).replace(/[\s　]/g, '');
  let n = 0;
  for (const m of s.matchAll(/\d+/g)) n += Number(m[0]);
  return n;
}

/** A row of one of the ministry's cross-tabs that NAMES the columns below it → `[[column, id]]`
 *  for the party columns, or null when the row is not a header.
 *  ⚠ 「合計」 IS PART OF THE HEADER AND IS NOT A PARTY, AND GETTING THAT WRONG COSTS A WHOLE BLOCK.
 *  These sheets print a wide table as several stacked blocks of six or eight parties. MEASURED on
 *  第26回参院選, the last block is headed 「無所属」 and 「合計」 — one party — so a rule that needed
 *  two party names to believe a row was a header did not believe it, kept the PREVIOUS block's
 *  header, and read the 合計 column as if it were ＮＨＫ党's: 150 members elected to 75 seats.
 *  ⚠ AND A HEADER CELL THAT IS NEITHER A PARTY NOR ONE OF THE TABLE'S OWN LABELS STOPS THE BUILD.
 *  #R538 is the shape this avoids: a table that quietly forgets the names it does not recognise
 *  reports a clean, complete, wrong answer. The labels below are the ministry's own furniture —
 *  the corner and stub cells of these cross-tabs — and not a list of exceptions. */
/* the stub and corner cells the ministry heads these cross-tabs with. ⚠ THIS LIST IS FOUND, NOT
   GUESSED: every cell of every header row of all 42 spreadsheets this pack reads was collected
   and the ones that are not party names are exactly these. A new one stops the build, which is
   the whole point — the alternative is a column whose meaning nobody checked being read as a
   party's votes (第26回参院選 did precisely that with 「合計」). */
const TABLE_LABEL = /^(合計|総計|小計|区分|政党等所属|都道府県|定|数|定数|男|女|計|新|前|元|現)$/;
const isTotalCol = (v) => /^(合計|総計)$/.test(cleanPartyName(v));

function partyHeader(row) {
  const cells = row.map((v, i) => [i, v]).filter(([, v]) => typeof v === 'string' && cleanPartyName(v));
  const named = cells.filter(([, v]) => !isTotalCol(v) && partyOfCell(v));
  if (!named.length) return null;
  const strange = cells.filter(([, v]) => !partyOfCell(v) && !TABLE_LABEL.test(cleanPartyName(v)));
  if (strange.length) {
    throw new Error('a ministry table has a column headed 「' + cleanPartyName(strange[0][1]) +
      '」 that is not in PARTIES — add it with the colour its election night was painted in');
  }
  return named.map(([i, v]) => [i, partyOfCell(v)]);
}

/** 「(届出政党等|党派)別男女別新前元別当選人数」 → the chamber, party by party.
 *  The table repeats in blocks of parties across the sheet; in every block the three rows whose
 *  second column is 「計」 are, in order, the constituency seats, the list seats and the total. */
function readSeatTable(buf) {
  const sheets = sheetRows(buf);
  const totals = new Map();
  for (const rows of sheets) {
    let header = null, seen = 0;
    for (const row of rows) {
      const head = partyHeader(row);
      if (head) { header = head; seen = 0; continue; }
      if (!header) continue;
      if (String(row[1] == null ? '' : row[1]).replace(/[\s　]/g, '') !== '計') continue;
      seen++;
      if (seen > 3) continue;
      const kind = seen === 1 ? 'dseats' : (seen === 2 ? 'lseats' : 'seats');
      for (const [i, id] of header) {
        /* each party occupies 男/女/計, so its 計 is two columns right of where its name is printed */
        const v = seatCount(row[i + 2]);
        if (!v) continue;
        if (!totals.has(id)) totals.set(id, { p: id });
        totals.get(id)[kind] = (totals.get(id)[kind] || 0) + v;
      }
    }
  }
  return [...totals.values()];
}

/** 「(届出政党等|党派)別得票数(小選挙区|選挙区)」 → the national vote per party, which is what the
 *  parse of the candidate table is checked against.
 *  ⚠ THE TABLE IS SEVERAL BLOCKS, NOT ONE ROW, AND THE BLOCKS ARE SPREAD OVER SEVERAL SHEETS. The
 *  ministry fits about seven parties across a printed page and then starts again lower down with
 *  the rest; 第50回 puts 自民…れいわ in one block, 社民・参政・みんなでつくる党 in a second block of
 *  the same sheet and 諸派・無所属・合計 on a second sheet. Reading the first 「今回」 row and
 *  stopping there — which is what this did first — recovered seven parties out of thirteen and
 *  then reported the other six as «votes the ministry never reports».
 *  ⚠ 「合計」 IS KEPT SEPARATELY, because it is the same ballots counted once more: adding it to the
 *  party totals doubles them, and comparing against it is a check the parties cannot give. */
function readNationalVotes(buf) {
  const byParty = new Map();
  let total = null;
  for (const rows of sheetRows(buf)) {
    let header = null, totalAt = [];
    for (const row of rows) {
      const head = partyHeader(row);
      if (head) {
        header = head;
        /* 「合計」 is the same ballots counted once more, so it is kept out of the party totals */
        totalAt = row.map((v, i) => [i, v]).filter(([, v]) => typeof v === 'string' && isTotalCol(v)).map(([i]) => i);
        continue;
      }
      if (!header) continue;
      /* the block prints 「今　回」, then the previous election and the difference; only the first
         is this election, and the header is spent once it has been read */
      if (String(row[0] == null ? '' : row[0]).replace(/[\s　]/g, '') !== '今回') continue;
      for (const [i, id] of header) {
        const n = toNumber(row[i]);
        if (Number.isFinite(n)) byParty.set(id, (byParty.get(id) || 0) + n);
      }
      for (const i of totalAt) { const n = toNumber(row[i]); if (Number.isFinite(n)) total = (total || 0) + n; }
      header = null; totalAt = [];
    }
  }
  if (!byParty.size) throw new Error('no 「今回」 row in the national vote table');
  return { byParty, total };
}

/** 参議院: 「都道府県別党派別新現元別当選人数（選挙区）」 gives both the constituency LABELS for
 *  this election — which is where the 合区 comes from — and who won the seats in each.
 *  ⚠ A ROW IS A CONSTITUENCY ONLY IF ITS LABEL NAMES PREFECTURES. Testing the label's last
 *  character instead (「ends in 都・道・府・県」) admits the table's own corner cell 「都道府県」 and
 *  invents a 46th constituency out of the column heading — measured on 第27回. The prefecture names
 *  come from the boundary files (§ prefTable), so what is accepted here is what those files say a
 *  prefecture is called, and a 合区 is simply two of them joined by 「・」 in the ministry's own row
 *  label. That is why nothing in this file writes 鳥取県・島根県 down: a third 合区 would arrive
 *  through this line without a word of new logic. */
function readUpperSeatsByDistrict(buf, prefIdx) {
  const rows = sheetRows(buf)[0];
  let header = null;
  const byLabel = new Map();
  for (const row of rows) {
    const head = partyHeader(row);
    if (head) { header = head; continue; }
    if (!header) continue;
    const label = String(row[0] == null ? '' : row[0]).replace(/[\s　]/g, '');
    if (!label || !label.split('・').every((n) => prefIdx.has(n))) continue;
    if (!byLabel.has(label)) byLabel.set(label, new Map());
    const seats = byLabel.get(label);
    for (const [i, id] of header) {
      /* 新 / 現 / 元 / 計 — the 計 is three columns right of the party's name */
      const n = seatCount(row[i + 3]);
      if (!n) continue;
      seats.set(id, (seats.get(id) || 0) + n);
    }
  }
  if (!byLabel.size) throw new Error('no constituency rows in the upper-house seat table');
  return byLabel;
}

/* ══ WHAT WAS PARSED IS CHECKED AGAINST WHAT THE MINISTRY PUBLISHED ════════════════════════════
   ⚠ THIS IS THE POINT OF THE WHOLE FILE. A parse that reads one column too far, loses a page or
   glues two halves still produces a plausible-looking map — every failure measured while writing
   this file did exactly that, and not one of them looked like a failure. Summing the extracted
   candidate votes by party and comparing them with 総務省's own national totals for the same
   election makes it impossible to ship: they are the same ballots, counted twice.

   ⚠ THE MINISTRY'S TABLE HAS FEWER PARTIES THAN THE BALLOT DID, AND THAT IS ITS RULE RATHER THAN
   AN OMISSION. 「(4)届出政党等別得票数」 gives a column to each 政党 and puts everything else in
   「諸派」: 第50回 names seven parties plus 社民・参政・みんなでつくる党 and leaves 日本保守党 in
   諸派. The per-candidate table names every party a candidate stood for, so the comparison is made
   in the MINISTRY'S vocabulary — a party it gives a column to is compared against that column, and
   everything else is added up and compared against 諸派. Doing it the other way round would report
   a correct parse as wrong for every party the summary table does not itemise.

   ⚠ The ministry's figures carry fractions (按分票 — a ballot bearing only a surname two candidates
   share is split between them), so equality is asserted to within the number of districts rather
   than to the digit: a district can round at most once per candidate. */
function checkAgainstMinistry(label, byDistrict, national, districtCount) {
  const { byParty, total } = national;
  const mine = new Map();
  let sum = 0;
  for (const rec of byDistrict.values()) {
    for (const c of rec.c) { mine.set(c.p, (mine.get(c.p) || 0) + c.v); sum += c.v; }
  }
  /* what the ministry does not itemise, it calls 諸派 — so that is where the rest is compared */
  const minor = MINOR;
  let rest = 0;
  for (const [p, got] of mine) if (!byParty.has(p)) rest += got;
  const problems = [];
  for (const [p, want] of byParty) {
    const got = p === minor ? (mine.get(p) || 0) + rest : (mine.get(p) || 0);
    if (Math.abs(got - want) > districtCount) {
      problems.push(p + ': parsed ' + Math.round(got) + ', 総務省 says ' + Math.round(want));
    }
  }
  if (rest && !byParty.has(minor)) {
    problems.push('parsed ' + Math.round(rest) + ' votes for parties the table does not itemise, ' +
      'and it has no 諸派 column to put them in');
  }
  /* ⚠ THE GRAND TOTAL IS A SEPARATE STATEMENT AND IT IS CHECKED SEPARATELY. Party sums that all
     match still miss a candidate whose party was misread as another party in the same table; the
     total does not. */
  if (total != null && Math.abs(sum - total) > districtCount) {
    problems.push('the votes add up to ' + Math.round(sum) + ', 総務省 says ' + Math.round(total));
  }
  if (problems.length) {
    throw new Error(label + ' does not match the published totals — ' + problems.slice(0, 6).join(' | '));
  }
}

/* ══ THE ELECTIONS ═════════════════════════════════════════════════════════════════════════════
   Each row names the ministry's own files for that election. ⚠ The boundary era is a property of
   the election and two elections share one only when they were genuinely fought on the same map:
   第45·46回 on the 2002 revision, 第47回 on the 2013 revision, 第48·49回 on 2017 and 第50·51回 on
   2022. `cand` is the per-district record — a spreadsheet where one exists, otherwise the PDF. */
const HR = [
  { no: 45, date: '2009-08-30', era: 'hr2002', seats: 480, dist: 300, cand: '000037488.pdf', seatTab: '000037622.xls', voteTab: '000037627.xls' },
  { no: 46, date: '2012-12-16', era: 'hr2002', seats: 480, dist: 300, cand: '000194197.pdf', seatTab: '000194183.xls', voteTab: '000194186.xls' },
  { no: 47, date: '2014-12-14', era: 'hr2013', seats: 475, dist: 295, cand: '000328955.pdf', seatTab: '000328943.xls', voteTab: '000328946.xls' },
  { no: 48, date: '2017-10-22', era: 'hr2017', seats: 465, dist: 289, cand: '000516731.xls', seatTab: '000516719.xls', voteTab: '000516722.xls' },
  { no: 49, date: '2021-10-31', era: 'hr2017', seats: 465, dist: 289, cand: '000777792.pdf', seatTab: '000776967.xls', voteTab: '000776970.xls' },
  { no: 50, date: '2024-10-27', era: 'hr2022', seats: 465, dist: 289, cand: '000979134.pdf', seatTab: '000979122.xls', voteTab: '000979125.xls' },
  { no: 51, date: '2026-02-08', era: 'hr2022', seats: 465, dist: 289, cand: '001061487.pdf', seatTab: '001061475.xlsx', voteTab: '001061478.xlsx' },
];
const HC = [
  { no: 21, date: '2007-07-29', seats: 121, dist: 73, cand: 'sangiin21/pdf/sangiin21_3_13.pdf', seatTab: 'sangiin21/xls/sangiin21_3_1.xls', distSeatTab: 'sangiin21/xls/sangiin21_3_2.xls', voteTab: 'sangiin21/xls/sangiin21_3_4.xls' },
  { no: 22, date: '2010-07-11', seats: 121, dist: 73, cand: '000074817.pdf', seatTab: '000074805.xls', distSeatTab: '000074806.xls', voteTab: '000074808.xls' },
  { no: 23, date: '2013-07-21', seats: 121, dist: 73, cand: '000244389.pdf', seatTab: '000244365.xls', distSeatTab: '000244366.xls', voteTab: '000244368.xls' },
  /* ⚠ 第24回 has no `cand`: its 候補者別得票数 is a SCANNED PDF (measured 2026-09-10 —
     main_content/000430629.pdf, ten pages, zero text runs), so the per-candidate record cannot
     be read at all and the constituencies are coloured from the compiled seat table instead. */
  { no: 24, date: '2016-07-10', seats: 121, dist: 73, cand: null, seatTab: '000430606.xls', distSeatTab: '000430607.xls', voteTab: '000430609.xls' },
  /* ⚠ 第25回 has no `cand` either, for the opposite reason: its 候補者別得票数 is a spreadsheet
     and reads perfectly, but it is BIFF8 (.xls) and so records its printed page breaks in a
     binary record this build has no reader for, while printing no 「(注)」 footer either. Its
     東京都 column runs a whole page without a heading, so the order-derived fallback merges two
     pages and misfiles nine constituencies — which checkDistricts catches, and which is why
     this is a missing table rather than a wrong map. */
  { no: 25, date: '2019-07-21', seats: 124, dist: 74, cand: null, seatTab: '000636671.xls', distSeatTab: '000636672.xls', voteTab: '000636674.xls' },
  { no: 26, date: '2022-07-10', seats: 125, dist: 75, cand: '000825874.pdf', seatTab: '000825825.xls', distSeatTab: '000825826.xls', voteTab: '000825829.xls' },
  { no: 27, date: '2025-07-20', seats: 125, dist: 75, cand: '001027842.xlsx', seatTab: '001027813.xlsx', distSeatTab: '001027814.xlsx', voteTab: '001027816.xlsx' },
];
const ERA_URL = {
  hr2002: GTFS + 'senkyoku/senkyoku300polygon_shape.zip',
  hr2013: GTFS + 'senkyoku/senkyoku295polygon_shape.zip',
  hr2017: GTFS + 'senkyoku/senkyoku289polygon_detailed.zip',
  hr2022: GTFS + 'senkyoku2022/senkyoku2022.zip',
};
/* ⚠ THE TOLERANCE IS IN DEGREES AND IT IS PER FILE, because the four eras arrive at four
   resolutions. The 2002 and 2013 sets are already generalised by their publisher (52,007 and
   51,140 points for the whole country) and are only rounded; the 2017 and 2022 sets are the
   detailed traces (10,458 and 119,706 records) and are cut to the same order of detail the
   published generalisation has, about 100 m at these latitudes, which is invisible at any zoom a
   national choropleth is read at. MEASURED 2026-09-10 on the files this writes: 1.08 MB (2002),
   1.06 MB (2013), 3.29 MB (2017) and 3.25 MB (2022). Re-measure if the publisher reissues a set. */
const ERA_TOL = { hr2002: 0, hr2013: 0, hr2017: 0.0009, hr2022: 0.0009 };

/** 45 → '45th'. The ministry numbers every election and the reader is shown that number, so it
   is written out in both languages rather than dropped. */
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th'
  : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

const soumu = (name) => (name.includes('/') ? 'https://www.soumu.go.jp/senkyo/senkyo_s/data/' + name : SOUMU + name);

/* ══ WHAT THE READER IS SHOWN, IN THE NINE LANGUAGES THIS PRODUCT SHIPS ════════════════════════
   AGENTS.md §3.5. ⚠ THE KEYS ARE THE APP'S OWN CODES, NOT BCP-47 (js/locales/_langs.js): Japanese
   is `jp`, Traditional Chinese is `zh`, Simplified is `zh-hans`. `ja` and `zh-Hant` are spellings
   the registry also answers to, but a table that carries two spellings of one language is a second
   translation nobody is ever shown, and which of the two wins depends on key order — so only the
   canonical code is written here.
   ⚠ `src` and `lic` ARE NOT TRANSLATED, and that is not an omission: an attribution line is the
   publisher's own wording and a licence is a legal condition, so rewording either misquotes it. */
const BODY_HR = {
  en: 'House of Representatives', native: '衆議院', jp: '衆議院',
  de: 'Repräsentantenhaus', ru: 'Палата представителей', es: 'Cámara de Representantes',
  fr: 'Chambre des représentants', ko: '중의원', zh: '眾議院', 'zh-hans': '众议院',
};
const BODY_HC = {
  en: 'House of Councillors', native: '参議院', jp: '参議院',
  de: 'Haus der Räte', ru: 'Палата советников', es: 'Cámara de Consejeros',
  fr: 'Chambre des conseillers', ko: '참의원', zh: '參議院', 'zh-hans': '参议院',
};
const LIST_HR = {
  en: 'proportional-representation blocks', native: '比例代表（11ブロック）', jp: '比例代表（11ブロック）',
  de: 'Verhältniswahlblöcke', ru: 'блоки пропорционального представительства',
  es: 'bloques de representación proporcional', fr: 'blocs à la proportionnelle',
  ko: '비례대표 권역', zh: '比例代表區塊', 'zh-hans': '比例代表区块',
};
const LIST_HC = {
  en: 'seats the map cannot draw', native: '地図に描けない議席', jp: '地図に描けない議席',
  de: 'Sitze, die die Karte nicht zeichnen kann', ru: 'места, которые карта не может показать',
  es: 'escaños que el mapa no puede dibujar', fr: 'sièges que la carte ne peut pas dessiner',
  ko: '지도에 그릴 수 없는 의석', zh: '地圖無法繪出的席次', 'zh-hans': '地图无法绘出的席位',
};
const POLITY_JP = {
  en: 'Japan', native: '日本', jp: '日本', de: 'Japan', ru: 'Япония', es: 'Japón',
  fr: 'Japon', ko: '일본', zh: '日本', 'zh-hans': '日本',
};

/** A Russian noun after a numeral, which is THREE forms and not two: 1, 21, 121 take one form, 2–4
 *  and 22–24 take another, everything else a third, and the teens take the third whatever they end
 *  in. ⚠ THIS IS NOT COSMETIC HERE — 第21回参院選 elected 121 members, and a sentence built as
 *  «из 121 мест» is as wrong to a Russian reader as «121 seat**s**» would be in English. The
 *  numbers these notes carry are read out of the ministry's tables and change with every election,
 *  so the form has to be chosen from the number rather than written beside it. */
const ruN = (n, one, few, many) => {
  const teen = n % 100, last = n % 10;
  if (teen > 10 && teen < 20) return many;
  return last === 1 ? one : (last >= 2 && last <= 4 ? few : many);
};

/** The 衆議院 note. ⚠ EACH LANGUAGE BUILDS ITS OWN SENTENCE, AND THAT IS WHY THIS IS A FUNCTION.
 *  An ordinal is not a suffix everywhere («45th» is 「第45回」, „die 45.", «45-е», '제45회'), and the
 *  three counts do not fall in the same place in a Japanese, Korean or Chinese clause as in an
 *  English one — splicing numbers into one English sentence writes text no reader of those
 *  languages would recognise as their own. `按分票` is kept in every language because it is the name
 *  of the thing the ministry publishes, and the sentence beside it says what it means. */
function houseNote(no, dist, seats) {
  const list = seats - dist;
  return {
    en: 'The ' + ordinal(no) + ' general election (第' + no + '回衆議院議員総選挙). ' +
      'The map colours the ' + dist + ' single-member districts; the other ' + list + ' of the ' +
      seats + ' members are returned by eleven proportional blocks that belong to no single ' +
      'district and are in the bars only. Votes are the ministry’s own per-candidate figures ' +
      'and carry fractions, because a ballot bearing only a surname two candidates share is ' +
      'divided between them (按分票).',
    jp: '第' + no + '回衆議院議員総選挙。地図は小選挙区 ' + dist + ' を塗る。残り ' + list +
      ' 議席（定数 ' + seats + ' 議席）は全国11ブロックの比例代表で選ばれ、特定の選挙区に属さないため' +
      '地図には現れない（議席グラフには含む）。得票数は総務省の候補者別得票数そのままで、按分票のため' +
      '小数を含む。',
    de: 'Die ' + no + '. Unterhauswahl (第' + no + '回衆議院議員総選挙). Die Karte färbt die ' +
      dist + ' Einerwahlkreise; die übrigen ' + list + ' der ' + seats + ' Sitze werden über elf ' +
      'Verhältniswahlblöcke vergeben, gehören zu keinem einzelnen Wahlkreis und stehen nur in den ' +
      'Balken. Die Stimmen sind die Zahlen des Ministeriums je Kandidat und enthalten Bruchteile, ' +
      'weil ein Stimmzettel, der nur einen von zwei Kandidaten geteilten Familiennamen trägt, ' +
      'zwischen ihnen aufgeteilt wird (按分票).',
    ru: no + '-е всеобщие выборы (第' + no + '回衆議院議員総選挙). Карта закрашивает ' + dist + ' ' +
      ruN(dist, 'одномандатный округ', 'одномандатных округа', 'одномандатных округов') +
      '; остальные ' + list + ' из ' + seats + ' ' + ruN(seats, 'места', 'мест', 'мест') +
      ' избираются по одиннадцати блокам пропорционального представительства, не принадлежат ни ' +
      'одному округу и показаны только в столбцах. ' +
      'Голоса — собственные данные министерства по каждому кандидату; ' +
      'они дробные, потому что бюллетень, на котором написана лишь фамилия, общая для двух ' +
      'кандидатов, делится между ними (按分票).',
    es: 'Las ' + no + '.ª elecciones generales (第' + no + '回衆議院議員総選挙). El mapa colorea ' +
      'los ' + dist + ' distritos uninominales; los otros ' + list + ' de los ' + seats +
      ' escaños se eligen en once bloques de representación proporcional, no pertenecen a ningún ' +
      'distrito y solo aparecen en las barras. Los votos son las cifras del ministerio por ' +
      'candidato e incluyen fracciones, porque una papeleta que lleva solo un apellido compartido ' +
      'por dos candidatos se reparte entre ellos (按分票).',
    fr: 'La ' + (no === 1 ? '1re' : no + 'e') + ' élection générale (第' + no + '回衆議院議員総選挙). ' +
      'La carte colore les ' + dist + ' circonscriptions uninominales ; les ' + list + ' autres ' +
      'sièges sur ' + seats + ' sont pourvus par onze blocs à la proportionnelle, n’appartiennent ' +
      'à aucune circonscription et ne figurent que dans les barres. Les voix sont les chiffres du ' +
      'ministère par candidat et comportent des fractions, car un bulletin ne portant qu’un nom de ' +
      'famille partagé par deux candidats est réparti entre eux (按分票).',
    ko: '제' + no + '회 중의원 총선거(第' + no + '回衆議院議員総選挙). 지도는 소선거구 ' + dist +
      '곳을 칠한다. 나머지 ' + list + '석(정수 ' + seats + '석)은 11개 권역의 비례대표로 뽑혀 특정 ' +
      '선거구에 속하지 않으므로 지도에는 나타나지 않고 의석 막대에만 들어간다. 득표수는 총무성의 ' +
      '후보자별 득표수 그대로이며, 두 후보가 같은 성만 적힌 표를 나누어 가지기 때문에 소수가 있다(按分票).',
    zh: '第 ' + no + ' 屆眾議院議員總選舉。地圖著色 ' + dist + ' 個小選舉區；其餘 ' + list +
      ' 席（定數 ' + seats + ' 席）由十一個比例代表區塊選出，不屬於任何一個選舉區，僅計入席次長條圖。' +
      '得票數為總務省的候選人別得票數原始數字；兩名候選人同姓而選票只寫姓氏時該票由兩人分攤，因此含有小數（按分票）。',
    'zh-hans': '第 ' + no + ' 届众议院议员总选举。地图着色 ' + dist + ' 个小选举区；其余 ' + list +
      ' 席（定数 ' + seats + ' 席）由十一个比例代表区块选出，不属于任何一个选举区，仅计入席位长条图。' +
      '得票数为总务省的候选人别得票数原始数字；两名候选人同姓而选票只写姓氏时该票由两人分摊，因此含有小数（按分票）。',
  };
}

/** The 参議院 note. `hasCand` is false for the one election whose per-candidate table exists only
 *  as a scanned image; the sentence that says so is part of every language's note, because a
 *  reader who is shown no candidate list is owed the reason in their own language. */
function councillorsNote(no, districts, dist, seats, hasCand) {
  const list = seats - dist;
  return {
    en: 'The ' + ordinal(no) + ' ordinary election (第' + no + '回参議院議員通常選挙). ' +
      'Half the House is renewed every three years. The map colours the ' + districts +
      ' constituencies, which returned ' + dist + ' of the ' + seats + ' members elected here — ' +
      'a constituency returns between one and six, and the colour is the elected member who ' +
      'polled highest in it. The remaining ' + list + ' were elected from one nationwide list and ' +
      'belong to no piece of ground; they are in the bars only.' +
      (hasCand ? '' : ' The ministry published this election’s per-candidate table only as a ' +
        'scanned image, so no list of candidates is shown for it.'),
    jp: '第' + no + '回参議院議員通常選挙。参議院は3年ごとに半数を改選する。地図は選挙区 ' + districts +
      ' を塗り、ここから ' + dist + ' 議席（今回の改選 ' + seats + ' 議席）が選ばれた。一つの選挙区の' +
      '定数は1〜6人で、色はその区の最多得票の当選人を表す。残り ' + list +
      ' 議席は全国を一単位とする比例代表で選ばれ、地図には現れない。' +
      (hasCand ? '' : 'この回の候補者別得票数は画像のPDFでしか公表されておらず、候補者一覧は表示しない。'),
    de: 'Die ' + no + '. ordentliche Oberhauswahl (第' + no + '回参議院議員通常選挙). Das Haus ' +
      'erneuert alle drei Jahre die Hälfte seiner Sitze. Die Karte färbt die ' + districts +
      ' Wahlkreise, die ' + dist + ' der hier gewählten ' + seats + ' Mitglieder gestellt haben — ' +
      'ein Wahlkreis entsendet einen bis sechs, und die Farbe ist das gewählte Mitglied mit den ' +
      'meisten Stimmen darin. Die übrigen ' + list + ' wurden über eine landesweite Liste gewählt ' +
      'und gehören zu keinem Stück Boden; sie stehen nur in den Balken.' +
      (hasCand ? '' : ' Das Ministerium hat die Tabelle je Kandidat für diese Wahl nur als ' +
        'eingescanntes Bild veröffentlicht, daher wird dafür keine Kandidatenliste gezeigt.'),
    ru: no + '-е очередные выборы (第' + no + '回参議院議員通常選挙). Палата обновляется наполовину ' +
      'каждые три года. Карта закрашивает ' + districts + ' ' +
      ruN(districts, 'округ', 'округа', 'округов') + '. На этих выборах в них избраны ' + dist +
      ' из ' + seats + ' ' + ruN(seats, 'места', 'мест', 'мест') +
      ': округ избирает от одного до шести членов, и цвет — это ' +
      'победитель с наибольшим числом голосов в нём. Остальные ' + list + ' избраны по единому ' +
      'общегосударственному списку и не принадлежат никакому участку земли; они показаны только в ' +
      'столбцах.' + (hasCand ? '' : ' Таблицу по кандидатам для этих выборов министерство ' +
        'опубликовало только в виде отсканированного изображения, поэтому список кандидатов не показан.'),
    es: 'Las ' + no + '.ª elecciones ordinarias (第' + no + '回参議院議員通常選挙). La cámara ' +
      'renueva la mitad de sus escaños cada tres años. El mapa colorea las ' + districts +
      ' circunscripciones, que aportaron ' + dist + ' de los ' + seats + ' miembros elegidos aquí: ' +
      'una circunscripción elige entre uno y seis, y el color es el electo más votado en ella. Los ' +
      list + ' restantes se eligieron en una única lista de ámbito estatal y no pertenecen a ningún ' +
      'trozo de terreno; solo aparecen en las barras.' +
      (hasCand ? '' : ' El ministerio publicó la tabla por candidato de estas elecciones solo como ' +
        'imagen escaneada, por lo que no se muestra ninguna lista de candidatos.'),
    fr: 'La ' + (no === 1 ? '1re' : no + 'e') + ' élection ordinaire (第' + no + '回参議院議員通常選挙). ' +
      'La chambre renouvelle la moitié de ses sièges tous les trois ans. La carte colore les ' +
      districts + ' circonscriptions, qui ont fourni ' + dist + ' des ' + seats +
      ' membres élus ici : une circonscription en élit de un à six, et la couleur est l’élu qui y a ' +
      'obtenu le plus de voix. Les ' + list + ' autres ont été élus sur une liste unique couvrant ' +
      'tout le territoire et n’appartiennent à aucun morceau de terrain ; ils ne figurent que dans ' +
      'les barres.' + (hasCand ? '' : ' Le ministère n’a publié le tableau par candidat de cette ' +
        'élection que sous forme d’image scannée : aucune liste de candidats n’est donc affichée.'),
    ko: '제' + no + '회 참의원 통상선거(第' + no + '回参議院議員通常選挙). 참의원은 3년마다 절반을 ' +
      '다시 뽑는다. 지도는 선거구 ' + districts + '곳을 칠하며, 여기에서 이번에 뽑힌 ' + seats +
      '석 가운데 ' + dist + '석이 나왔다. 한 선거구의 정수는 1~6명이고, 색은 그 선거구에서 가장 많은 ' +
      '표를 얻은 당선인을 나타낸다. 나머지 ' + list + '석은 전역을 하나의 단위로 하는 비례대표로 뽑혀 ' +
      '지도에는 나타나지 않는다.' + (hasCand ? '' : ' 이 회차의 후보자별 득표수는 이미지 PDF로만 ' +
        '공표되어 후보자 명단은 표시하지 않는다.'),
    zh: '第 ' + no + ' 屆參議院議員通常選舉。參議院每三年改選半數。地圖著色 ' + districts +
      ' 個選舉區，本次在此選出的 ' + seats + ' 席中有 ' + dist + ' 席由這些選舉區產生；一個選舉區的' +
      '名額為一至六人，顏色代表該區得票最多的當選人。其餘 ' + list +
      ' 席以全境為一個單位的比例代表選出，不屬於任何一塊土地，僅計入席次長條圖。' +
      (hasCand ? '' : '本屆的候選人別得票數僅以掃描影像的PDF公布，因此不顯示候選人名單。'),
    'zh-hans': '第 ' + no + ' 届参议院议员通常选举。参议院每三年改选半数。地图着色 ' + districts +
      ' 个选举区，本次在此选出的 ' + seats + ' 席中有 ' + dist + ' 席由这些选举区产生；一个选举区的' +
      '名额为一至六人，颜色代表该区得票最多的当选人。其余 ' + list +
      ' 席以全境为一个单位的比例代表选出，不属于任何一块土地，仅计入席位长条图。' +
      (hasCand ? '' : '本届的候选人别得票数仅以扫描影像的PDF公布，因此不显示候选人名单。'),
  };
}

export async function build(ctx) {
  /* ── prefectures, from the boundary file that names them beside their code ─────────────────── */
  const topo = await prefectureTopology(ctx);
  const shp2022 = await readDistrictShapefile(ctx, ERA_URL.hr2022);
  const pref = prefTable(shp2022.rows, [...topo.named.keys()]);
  const prefIdx = prefIndex(pref);

  const geo = {}, res = {}, elections = [];

  /* ── 衆議院 ────────────────────────────────────────────────────────────────────────────────── */
  const eras = new Map();
  for (const e of HR) {
    if (eras.has(e.era)) continue;
    const shp = e.era === 'hr2022' ? shp2022 : await readDistrictShapefile(ctx, ERA_URL[e.era]);
    eras.set(e.era, districtsToGeoJSON(shp, pref, prefIdx, ERA_TOL[e.era]));
  }
  for (const [era, fc] of eras) geo['jp-' + era + '.geo.json'] = fc;

  for (const e of HR) {
    const geoId = 'jp-hr' + e.era.slice(2) + '.geo.json';
    const buf = await ctx.get(soumu(e.cand));
    const label = '第' + e.no + '回衆院選';
    const byDistrict = markWinners(e.cand.endsWith('.pdf')
      ? await readCandidatePdf(buf, prefIdx)
      : readCandidateXls(buf, prefIdx));
    checkDistricts(label, byDistrict, e.dist, e.dist, 1);
    checkAgainstMinistry(label, byDistrict,
      readNationalVotes(await ctx.get(soumu(e.voteTab))), e.dist);

    const d = {};
    for (const [cd, rec] of byDistrict) d[cd] = { w: rec.w, c: rec.c };
    const id = 'jp-hr-' + e.date.slice(0, 4);
    res[id + '.res.json'] = { d, n: readSeatTable(await ctx.get(soumu(e.seatTab))) };
    elections.push({
      id, polity: 'jp', date: e.date, y: Number(e.date.slice(0, 4)),
      body: BODY_HR,
      geo: geoId, res: id + '.res.json',
      seatsTotal: e.seats, districtSeats: e.dist, listSeats: e.seats - e.dist,
      listName: LIST_HR,
      note: houseNote(e.no, e.dist, e.seats),
      src: SRC_RESULT + ' / ' + SRC_HR_GEO, lic: LIC_RESULT + ' / ' + LIC_HR_GEO,
    });
  }

  /* ── 参議院 ──────────────────────────────────────────────────────────────────────────────── */
  for (const e of HC) {
    const label = '第' + e.no + '回参院選';
    const seatsByDistrict = readUpperSeatsByDistrict(await ctx.get(soumu(e.distSeatTab)), prefIdx);
    const labels = [...seatsByDistrict.keys()];
    /* the 合区 is whatever the ministry printed: a label with 「・」 in it is two prefectures voting
       as one, and the prefectures it names then do not stand alone */
    const combined = new Set(labels.filter((l) => l.includes('・')).flatMap((l) => l.split('・')));
    const districts = labels.filter((l) => l.includes('・') || !combined.has(l));
    const geoId = 'jp-hc-' + districts.length + '.geo.json';
    if (!geo[geoId]) geo[geoId] = upperHouseGeo(topo, pref, prefIdx, districts);
    const cdOf = new Map(geo[geoId].features.map((f) => [f.properties.n.native, f.properties.cd]));

    /* ⚠ THE SEAT TABLE IS READ EVEN WHEN THE CANDIDATE TABLE IS, because it is a second, independent
       statement of who won each constituency: 「都道府県別党派別新現元別当選人数」 is compiled by the
       ministry, and the candidate table's 当 marks are typeset. They are compared below. */
    const won = new Map();
    for (const l of districts) won.set(cdOf.get(l), seatsByDistrict.get(l) || new Map());

    const d = {};
    if (e.cand) {
      const buf = await ctx.get(soumu(e.cand));
      const byDistrict = markWinners(e.cand.endsWith('.pdf')
        ? await readCandidatePdf(buf, prefIdx)
        : readCandidateXls(buf, prefIdx));
      /* ⚠ HOW MANY MEMBERS A CONSTITUENCY RETURNED IS THE SEAT TABLE'S ANSWER, NOT THE HEADING'S.
         The heading prints the 定数 — the seats due at the ordinary rotation — and a by-election
         held on the same day fills more: MEASURED on 第26回, 神奈川県 is headed 「(定数4名)」 and
         returned five, which the seat table records as 「4(1)」 and the footnote explains as an
         外書. Checking against the heading would call the correct parse wrong. */
      for (const [cd, rec] of byDistrict) {
        const seats = won.get(cd);
        rec.seats = seats ? [...seats.values()].reduce((a, b) => a + b, 0) : rec.seats;
      }
      checkDistricts(label, byDistrict, districts.length, e.dist, 1);
      checkAgainstMinistry(label, byDistrict,
        readNationalVotes(await ctx.get(soumu(e.voteTab))), districts.length);
      /* ⚠ AND THE TWO RECORDS MUST NAME THE SAME WINNERS. A 参議院 constituency returns up to six
         members and they are not all of one party, so «one 当 per district» does not pin the parse
         down the way it does for the 衆議院: two neighbouring three-member constituencies whose
         rows were swapped would both still have three. The parties do. */
      for (const [cd, rec] of byDistrict) {
        const mine = new Map();
        for (const pid of rec.winners) mine.set(pid, (mine.get(pid) || 0) + 1);
        const theirs = won.get(cd);
        if (!theirs) throw new Error(label + ': the candidate table has a constituency ' + cd + ' the seat table does not');
        for (const [pid, n] of theirs) {
          if ((mine.get(pid) || 0) !== n) {
            throw new Error(label + ' · ' + cd + ': the seat table gives ' + pid + ' ' + n +
              ' seat(s) and the candidate table gives it ' + (mine.get(pid) || 0));
          }
        }
      }
      for (const [cd, rec] of byDistrict) d[cd] = { w: rec.w, c: rec.c };
    } else {
      /* ⚠ 第24回 IS THE ONE ELECTION WITH NO PER-CANDIDATE RECORD THIS BUILD CAN READ. Its
         候補者別得票数 is published only as a SCANNED PDF — measured 2026-09-10, all ten pages of
         soumu.go.jp/main_content/000430629.pdf carry zero text runs, so there is nothing to extract
         and an OCR of it would be a guess wearing a number's clothes. The constituencies are still
         coloured, from the ministry's own compiled 当選人数 table; what is missing is the list of
         who stood and how many votes each of them took. */
      for (const [cd, seats] of won) {
        let best = null;
        for (const [pid, n] of seats) if (!best || n > best[1]) best = [pid, n];
        d[cd] = best ? { w: best[0] } : {};
      }
    }

    const id = 'jp-hc-' + e.date.slice(0, 4);
    res[id + '.res.json'] = { d, n: readSeatTable(await ctx.get(soumu(e.seatTab))) };
    /* ⚠ `districtSeats` IS THE NUMBER OF POLYGONS, NOT THE NUMBER OF SEATS THEY RETURN, because the
       schema's join check measures it against the map (see scripts/lib/elections-schema.mjs, and the
       same note in the European and Hong Kong packs). A 参議院 選挙区 returns between one and six
       members, so these constituencies hold more seats than they are polygons; the numbers the
       reader is shown are `n`, which is the ministry's own seat distribution, and the note below
       says in words what the two figures mean. */
    elections.push({
      id, polity: 'jp', date: e.date, y: Number(e.date.slice(0, 4)),
      body: BODY_HC,
      geo: geoId, res: id + '.res.json',
      seatsTotal: e.seats, districtSeats: districts.length,
      listSeats: e.seats - districts.length,
      listName: LIST_HC,
      note: councillorsNote(e.no, districts.length, e.dist, e.seats, !!e.cand),
      src: SRC_RESULT + ' / ' + SRC_HC_GEO, lic: LIC_RESULT + ' / ' + LIC_HC_GEO,
    });
  }

  const parties = {};
  for (const p of Object.values(PARTIES)) {
    const ja = Object.keys(PARTIES).find((k) => PARTIES[k] === p);
    /* ⚠ THE JAPANESE NAME IS THE MINISTRY'S OWN KEY, AND IT IS BOTH `native` AND `jp`: the reader
       is shown the name that was on the ballot beside the name in their language, and `jp` is the
       app's own code for Japanese (a `ja` key would be a second spelling of the same language). */
    parties['jp:' + p.id] = {
      n: { en: p.en, native: ja, jp: ja, ...(PARTY_I18N[p.id] || {}) },
      col: p.col,
      ...(p.bloc ? { bloc: p.bloc } : {}),
    };
  }
  return {
    polities: [{ id: 'jp', n: POLITY_JP, home: [[122.9, 24.0], [153.99, 45.6]] }],
    parties, elections, geo, res,
  };
}
