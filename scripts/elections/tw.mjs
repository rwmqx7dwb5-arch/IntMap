/* ============================================================================
 *  IntMap · TAIWAN — the Legislative Yuan, on the 73 single-member constituencies   (#R584)
 * ----------------------------------------------------------------------------
 *  ⚠ WHAT THIS PACK SAYS ABOUT TAIWAN IS: AN ELECTION WAS HELD AND THIS IS THE RESULT. Nothing
 *  here, and nothing in scripts/lib/elections-schema.mjs, is a claim about status — see the comment
 *  above `checkPolity`, which is where that decision is written down for every pack at once. The
 *  vocabulary below is the Central Election Commission's own: 選舉區, 鄉鎮市區, 村里. No other is
 *  introduced, and no word of this file describes what the polity is; it describes an election.
 *
 *  ══ THE COMMISSION DOES NOT PUBLISH A CONSTITUENCY POLYGON — IT PUBLISHES A MEMBERSHIP ═══════
 *  Measured 2026-09-10: there is no boundary file for the 73 區域立委 constituencies anywhere in
 *  data.gov.tw. What exists is (a) the Ministry of the Interior's village (村里) boundaries, and
 *  (b) the Commission's `elbase.csv`, a hierarchy of 省市 → 縣市 → 選舉區 → 鄉鎮市區 → 村里 in
 *  which every unit carries the constituency it belongs to. A constituency is therefore ASSEMBLED
 *  here, and the whole difficulty is that the two publishers must be joined without either of them
 *  offering a key for the other.
 *
 *  ⚠ THE JOIN IS BY CODE, NOT BY NAME, AND THAT WAS NOT OBVIOUS. The Commission's first, second and
 *  fourth columns (省市/縣市/鄉鎮市區) concatenate to exactly the Ministry's TOWNCODE — measured for
 *  all 368 towns in every year this pack builds, with the two publishers' Chinese names for those
 *  368 towns agreeing character for character as a cross-check. A name join was tried first and it
 *  is the wrong instrument: it leaves 24 villages unmatched because the Ministry brackets a rare
 *  glyph (「磚[磘]里」), substitutes a common one for a character outside the font (「[那]拔里」 for
 *  𦰡拔里), or simply spells one differently (濂 for 濓) — and the Commission's own file has lost the
 *  character 塭 from 塭南里 and 公塭里 altogether. None of those needs a table of characters here,
 *  because the code join never asks about the spelling.
 *
 *  ⚠ AND THE CONSTITUENCY IS NAMED AT THE TOWN LEVEL, WHICH IS WHY MATSU DOES NOT VANISH. Every
 *  town row in `elbase.csv` carries a constituency, so 356 of the 368 towns are assigned whole and
 *  no village is looked at at all. Only the 12 towns that appear under TWO constituencies (臺北市
 *  松山區, 士林區, 中正區, 新北市 板橋區, 三重區, 中和區, 新莊區, 桃園市 桃園區, 中壢區, 臺中市
 *  大里區, 高雄市 三民區, 苓雅區 — discovered, not listed) are resolved village by village. This
 *  matters: in 2016 and 2020 the Commission records 連江縣's villages ONLY as combined polling
 *  units, so a village-level assembly loses Matsu entirely, while a town-level one does not.
 *
 *  ══ WHY 2016 IS NOT HERE ════════════════════════════════════════════════════════════════════
 *  The Ministry's historical village series begins after that poll. Its earliest vintage is dated
 *  1070205 (2018-02-05), two years and one month after the 2016-01-16 election, and by then 桃園區 —
 *  one of the twelve towns SPLIT between two constituencies, where the village names are the only
 *  thing that decides which — had three villages (大樹里, 大業里, 福元里) that the 2016 record does
 *  not know. Painting the 2016 result on a 2018 map would hand pieces of 桃園 to a constituency on
 *  no authority but the assembler's. So the vintage is CHOSEN by date below rather than named, and
 *  an election for which no boundary vintage exists on or before polling day is left out and said
 *  aloud — which is also what will pick 2016 up automatically if the Ministry ever publishes one.
 * ==========================================================================*/
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { readDbf, readShp, zipEntries, shapefileParts, simplifyGeoJSON } from '../lib/elections-geo.mjs';

export const about = 'Taiwan — Legislative Yuan district constituencies (2020, 2024)';

/* ── the sources ───────────────────────────────────────────────────────────────────────────────
   Both are on data.gov.tw and both are catalogue entries rather than file names: the archives are
   re-cut and renamed, and the catalogue is the only thing that stays put. */
const CATALOGUE = 'https://data.gov.tw/api/v2/rest/dataset/';
const VILLAGE_DATASET = '130549';    /* 村里界歷史圖資(TWD97經緯度) — Ministry of the Interior */
const VOTE_DATASET = '13119';        /* 選舉資料庫(含選舉區資料) — Central Election Commission  */

const SRC = 'Constituency membership, candidates, parties and votes: Central Election Commission ' +
  '(中央選舉委員會) 選舉資料庫, data.gov.tw dataset 13119. Village (村里) boundaries: Ministry of ' +
  'the Interior (內政部) 村里界歷史圖資 (TWD97 geographic), data.gov.tw dataset 130549.';
/* Both datasets are published under licence code «1» in the catalogue, which is 政府資料開放授權條款
   第1版 — free re-use and redistribution, commercial included, on condition that the source is
   acknowledged. Read from the catalogue records themselves 2026-09-10, and asserted at build time
   below so that a change of licence stops the build instead of shipping a wrong notice. */
const OPEN_LICENCE_CODE = '1';
const LIC = 'Open Government Data License, Taiwan, version 1.0 (政府資料開放授權條款－第1版): free ' +
  'to use, redistribute and adapt, including commercially, with acknowledgement of the source.';

/* ⚠ SIMPLIFICATION IN DEGREES. A constituency here is the union of its villages' rings, so the file
   is large before anything is done to it: the Ministry ships 33 MB of .shp for ~7 950 villages.
   0.0002° is about 22 m at this latitude — finer than the width of the streets these boundaries
   follow, and two orders of magnitude below what is legible when 73 constituencies are on screen.
   Measured 2026-09-10: 33 MB of source .shp becomes 0.96 MB of written GeoJSON per era, most of the
   saving coming from the dissolve below rather than from this. */
const TOLERANCE = 0.0002;
/* the number of decimal places the geometry is written at — about a metre here, and the precision
   the dissolve below judges a ring by, so that the two cannot disagree about what a ring is */
const DECIMALS = 5;
/* half a cell of that grid. ⚠ THIS IS NOT A JUDGEMENT ABOUT HOW SMALL A PLACE MAY BE — it is the
   smallest area the written file can hold: below it a ring is a LINE once its coordinates are
   rounded, which is exactly what the noding slivers described in `dissolve` are. The nearest real
   thing to it is three orders of magnitude larger (a 10 m parcel is 8e-9 square degrees). */
const MIN_AREA = (10 ** -DECIMALS) ** 2 / 2;

/* ── the elections this pack knows the date of ─────────────────────────────────────────────────
   The archive's folder names carry the year and nothing else, so polling day is stated here; it is
   the one fact about these elections that the data does not contain. Everything else — which
   constituencies existed, which villages they held, who stood, who won — is read. */
const POLLS = [
  { y: 2016, date: '2016-01-16' },
  { y: 2020, date: '2020-01-11' },
  { y: 2024, date: '2024-01-13' },
];

/* ── the chamber ───────────────────────────────────────────────────────────────────────────────
   113 members: 73 from the constituencies this map draws, 6 from the two indigenous constituencies
   (3 highland, 3 lowland — their electorates are not pieces of ground) and 34 from the party
   lists. The two statutory numbers below are 公職人員選舉罷免法 §67: 34 list seats, shared by
   largest remainder among the parties that reach 5 % of the party vote. They are not derived from
   the data because the Commission publishes the votes and not the allocation; they expire if that
   article is amended, and the build stops if the allocation they produce does not come to 34. */
const LIST_SEATS = 34;
const LIST_THRESHOLD = 0.05;
const INDIGENOUS_SEATS = 6;

/* ── party colours and the English names the Commission does not publish ───────────────────────
   ⚠ THE LIST OF PARTIES IS DISCOVERED — it is whatever `elpaty.csv` contains, which for 2024 is 390
   registered parties. What that file does NOT contain is a colour or an English name, and neither
   can be derived from a Chinese name. So this table holds only those two things, keyed by the
   Commission's own Chinese string, and a party it does not know keeps its Chinese name and takes a
   colour derived from that name — it is never dropped and never silently merged with another.
   Colours and English forms are the parties' own, as they themselves publish them; observed
   2026-09-10, and they expire when a party changes its livery or its English name.
   ⚠ AND `nm` HOLDS ONLY THE NAMES THAT ALREADY EXIST IN THOSE LANGUAGES (AGENTS.md §3.5). The
   Commission publishes one name, in Chinese. A row therefore carries a language only where the
   party is actually called that in it — 時代力量 is 「New Power Party」 in German writing and
   台灣基進 has no settled German, Russian, Spanish or French form at all — and a language that is
   absent falls through to `en`, which is the English name the party itself publishes. Inventing the
   missing ones would be inventing data. The keys are the app's own codes (js/locales/_langs.js):
   `jp`, `zh` (traditional), `zh-hans`. */
const KNOWN = {
  中國國民黨: { en: 'Kuomintang', col: '#000095', nm: {
    de: 'Kuomintang', ru: 'Гоминьдан', es: 'Kuomintang', fr: 'Kuomintang',
    jp: '中国国民党', ko: '중국국민당', 'zh-hans': '中国国民党' } },
  民主進步黨: { en: 'Democratic Progressive Party', col: '#1b9431', nm: {
    de: 'Demokratische Fortschrittspartei', ru: 'Демократическая прогрессивная партия',
    es: 'Partido Democrático Progresista', fr: 'Parti démocrate progressiste',
    jp: '民主進歩党', ko: '민주진보당', 'zh-hans': '民主进步党' } },
  台灣民眾黨: { en: 'Taiwan People’s Party', col: '#28c8c8', nm: {
    de: 'Taiwanische Volkspartei', ru: 'Тайваньская народная партия',
    es: 'Partido Popular de Taiwán', fr: 'Parti populaire taïwanais',
    jp: '台湾民衆党', ko: '대만민중당', 'zh-hans': '台湾民众党' } },
  時代力量: { en: 'New Power Party', col: '#fbbe01', nm: {
    ru: 'Партия новой силы', es: 'Partido del Nuevo Poder', fr: 'Parti du nouveau pouvoir',
    jp: '時代力量', ko: '시대역량', 'zh-hans': '时代力量' } },
  親民黨: { en: 'People First Party', col: '#ff6310', nm: {
    ru: 'Первая народная партия', es: 'Partido Primero el Pueblo', fr: 'Parti du peuple d’abord',
    jp: '親民党', ko: '친민당', 'zh-hans': '亲民党' } },
  新黨: { en: 'New Party', col: '#ffdf01', nm: {
    de: 'Neue Partei', ru: 'Новая партия', es: 'Partido Nuevo', fr: 'Nouveau Parti',
    jp: '新党', ko: '신당', 'zh-hans': '新党' } },
  台灣基進: { en: 'Taiwan Statebuilding Party', col: '#a73f24', nm: {
    jp: '台湾基進', 'zh-hans': '台湾基进' } },
  台灣團結聯盟: { en: 'Taiwan Solidarity Union', col: '#c70044', nm: {
    de: 'Taiwanische Solidaritätsunion', ru: 'Тайваньский союз солидарности',
    es: 'Unión Solidaria de Taiwán', fr: 'Union solidaire de Taïwan',
    jp: '台湾団結連盟', ko: '대만단결연맹', 'zh-hans': '台湾团结联盟' } },
  無黨團結聯盟: { en: 'Non-Partisan Solidarity Union', col: '#c0a062', nm: {
    jp: '無党団結連盟', ko: '무당단결연맹', 'zh-hans': '无党团结联盟' } },
  綠黨: { en: 'Green Party Taiwan', col: '#89c33f', nm: {
    de: 'Grüne Partei Taiwan', ru: 'Партия зелёных Тайваня', es: 'Partido Verde de Taiwán',
    fr: 'Parti vert de Taïwan', jp: '緑の党', ko: '녹색당', 'zh-hans': '绿党' } },
  勞動黨: { en: 'Labour Party', col: '#cc2229', nm: {
    de: 'Arbeiterpartei', ru: 'Рабочая партия', es: 'Partido Laborista', fr: 'Parti travailliste',
    jp: '労働党', ko: '노동당', 'zh-hans': '劳动党' } },
};
/* ⚠ STANDING WITHOUT A PARTY IS NOT A PARTY, so it does not get a party's hue. The Commission
   records it as a party code all the same, because a ballot paper has to say something, and these
   candidates win seats — leaving them out of the bars would misreport the chamber. A neutral grey
   is what says «recorded, and not a party». */
/* ⚠ THESE TWO ARE ORDINARY NOUNS RATHER THAN NAMES, so unlike the parties above they exist in
   every language and are written out in all nine. */
const NEUTRAL = '#6b7280';
const NOT_A_PARTY = {
  無黨籍及未經政黨推薦: {
    en: 'No party endorsement', de: 'Parteilos, ohne Parteinominierung',
    ru: 'Без партии и без выдвижения партией', es: 'Sin partido ni respaldo de partido',
    fr: 'Sans étiquette, sans investiture de parti', jp: '無所属・政党推薦なし',
    ko: '무소속·정당 추천 없음', 'zh-hans': '无党籍及未经政党推荐',
  },
  連署: {
    en: 'Independent, nominated by petition', de: 'Unabhängig, durch Unterschriften nominiert',
    ru: 'Независимый, выдвинут подписями избирателей', es: 'Independiente, por recogida de firmas',
    fr: 'Indépendant, par recueil de signatures', jp: '無所属（署名による立候補）',
    ko: '무소속(연서 추천)', 'zh-hans': '连署',
  },
};

/** A Russian noun after a numeral, which is three forms and not two (1/21 one, 2–4 another, the
 *  rest a third, and the teens the third whatever they end in). The counts in the note below are
 *  read out of the Commission's files and change when the chamber does, so the form is chosen from
 *  the number rather than written beside it. */
const ruN = (n, one, few, many) => {
  const teen = n % 100, last = n % 10;
  if (teen > 10 && teen < 20) return many;
  return last === 1 ? one : (last >= 2 && last <= 4 ? few : many);
};

function derivedColour(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const hue = h % 360, s = 0.45, l = 0.45;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/* ══ READING A 110 MB ARCHIVE WITHOUT DOWNLOADING IT ═══════════════════════════════════════════
   ⚠ `ctx.get` CANNOT DO THIS, AND FOR TWO SEPARATE REASONS, BOTH MEASURED 2026-09-10.
   (1) votedata.zip is 110 316 470 bytes and the four members this pack needs from it total 11 MB
       compressed. The server does honour Range (206 with a Content-Range), so the central directory
       and the individual members can be fetched and inflated on their own.
   (2) `ctx.get` keys its cache on the URL alone, so two byte ranges of ONE archive would be each
       other's cache entry — the second range would silently receive the first range's bytes. That
       is the same failure the build script's own comment records for truncated cache keys.
   So the ranged reader keeps its own cache, and it caches the INFLATED MEMBER rather than the byte
   range, which is what a later run actually wants. */
function cacheDir(ctx) {
  const d = join(ctx.ROOT, 'node_modules', '.cache', 'intmap-elections-tw');
  mkdirSync(d, { recursive: true });
  return d;
}
const cacheKey = (dir, s) => join(dir, createHash('sha256').update(s).digest('hex').slice(0, 40));

async function range(url, from, to) {
  let last = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'IntMap/1.0 elections-build', Range: 'bytes=' + from + '-' + to } });
      if (r.status !== 206) throw new Error('HTTP ' + r.status + ' — the server ignored Range');
      const b = Buffer.from(await r.arrayBuffer());
      /* ⚠ SUCCESS IS THE RIGHT NUMBER OF BYTES, NOT A 206. A body that ends early arrives as a
         perfectly ordinary short read, and inflating it fails far away from here. */
      if (b.length !== to - from + 1) throw new Error('short read ' + b.length + ' of ' + (to - from + 1));
      return b;
    } catch (e) { last = e; }
  }
  throw new Error('tw: could not read bytes ' + from + '–' + to + ' of ' + url + ': ' + (last && last.message));
}

/** The members of a remote ZIP, read through Range requests. Member names are decoded with the code
 *  page the archive was packed with unless it says otherwise — the Commission's archive carries Big5
 *  names, and decoding those as UTF-8 makes every member unfindable. */
async function remoteZip(ctx, url, nameEncoding = 'big5') {
  const dir = cacheDir(ctx);
  const cdKey = cacheKey(dir, url + '#central-directory');
  let cd, total;
  if (existsSync(cdKey)) { cd = readFileSync(cdKey); }
  else {
    const probe = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    total = Number((probe.headers.get('content-range') || '').split('/')[1]);
    if (!total) throw new Error('tw: ' + url + ' does not report a size, so it cannot be read in ranges');
    const tailLen = Math.min(65557, total);            /* 22-byte EOCD plus the largest comment */
    const tail = await range(url, total - tailLen, total - 1);
    let at = -1;
    for (let p = tail.length - 22; p >= 0; p--) if (tail.readUInt32LE(p) === 0x06054b50) { at = p; break; }
    if (at < 0) throw new Error('tw: no end-of-central-directory in ' + url);
    if (tail.readUInt16LE(at + 10) === 0xffff || tail.readUInt32LE(at + 16) === 0xffffffff) {
      throw new Error('tw: ' + url + ' is a zip64 archive');
    }
    const size = tail.readUInt32LE(at + 12), off = tail.readUInt32LE(at + 16);
    const count = tail.readUInt16LE(at + 10);
    cd = Buffer.concat([Buffer.from(new Uint32Array([count]).buffer), await range(url, off, off + size - 1)]);
    writeFileSync(cdKey, cd);
  }
  const count = cd.readUInt32LE(0);
  const body = cd.subarray(4);
  const members = new Map();
  let off = 0;
  for (let i = 0; i < count; i++) {
    if (body.readUInt32LE(off) !== 0x02014b50) throw new Error('tw: bad central directory entry ' + i);
    const flags = body.readUInt16LE(off + 8);
    const nameLen = body.readUInt16LE(off + 28);
    const enc = (flags & 0x800) ? 'utf8' : nameEncoding;
    members.set(new TextDecoder(enc, { fatal: false }).decode(body.subarray(off + 46, off + 46 + nameLen)), {
      method: body.readUInt16LE(off + 10),
      compSize: body.readUInt32LE(off + 20),
      localOff: body.readUInt32LE(off + 42),
    });
    off += 46 + nameLen + body.readUInt16LE(off + 30) + body.readUInt16LE(off + 32);
  }
  const read = async (name) => {
    const key = cacheKey(dir, url + '#' + name);
    if (existsSync(key)) return readFileSync(key);
    const m = members.get(name);
    if (!m) throw new Error('tw: ' + url + ' has no member ' + name);
    const hdr = await range(url, m.localOff, m.localOff + 29);
    if (hdr.readUInt32LE(0) !== 0x04034b50) throw new Error('tw: bad local header for ' + name);
    const at = m.localOff + 30 + hdr.readUInt16LE(26) + hdr.readUInt16LE(28);
    const raw = await range(url, at, at + m.compSize - 1);
    const out = m.method === 0 ? raw : inflateRawSync(raw);
    writeFileSync(key, out);
    return out;
  };
  return { members, read };
}

/** A whole archive, for a server that will not serve ranges. ⚠ MEASURED: the Ministry's 21 MB
 *  village archives are served without Accept-Ranges and the connection is dropped part-way often
 *  enough that a single attempt is not a strategy — one download died after 7 258 478 of 21 431 732
 *  bytes. `ctx.get` throws rather than caching a short body, so retrying it is safe, and success is
 *  judged by the archive PARSING, not by the request returning. */
async function wholeArchive(ctx, url, what) {
  let last = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    try { return zipEntries(await ctx.get(url), { nameEncoding: 'big5' }); }
    catch (e) { last = e; }
  }
  throw new Error('tw: could not download ' + what + ' (' + url + '): ' + (last && last.message));
}

/* ══ THE COMMISSION'S CSV ══════════════════════════════════════════════════════════════════════
   Six unlabelled quoted columns, no header row, UTF-8 for the vintages this pack reads. The columns
   are the hierarchy: 省市 / 縣市 / 選舉區 / 鄉鎮市區 / 村里 and then the unit's name. */
const rowsOf = (buf) => new TextDecoder('utf8').decode(buf).trim().split(/\r?\n/)
  .map(l => l.split(',').map(s => s.replace(/^"|"$/g, '')));

/* ══ THE MINISTRY'S DBF ════════════════════════════════════════════════════════════════════════
   ⚠ THE CODE PAGE CHANGES BETWEEN VINTAGES AND THE FILE DOES NOT SAY. There is no .cpg member in
   any of them; measured 2026-09-10, the 108 and 112 vintages are UTF-8 and the 106 one is Big5.
   Decoding one as the other does not fail — it yields 「撅蝮」 where 「屏東縣」 was written, and a
   join on those names would simply find nothing. So the code page is settled by decoding and
   looking: the reading that produces no replacement character is the right one. */
function readVillageDbf(dbf) {
  const spoiled = (rs) => rs.some(r => JSON.stringify(r).includes('�'));
  const utf8 = readDbf(dbf, 'utf8');
  if (!spoiled(utf8)) return utf8;
  const big5 = readDbf(dbf, 'big5');
  if (spoiled(big5)) throw new Error('tw: the village .dbf reads as neither UTF-8 nor Big5');
  return big5;
}

/** A village name reduced to what both publishers agree on. ⚠ THE ONLY RULE HERE IS THE MINISTRY'S
 *  BRACKET CONVENTION: a glyph it cannot set is written enclosed — 「磚[磘]里」, 「[那]拔里」 — and
 *  the Commission writes the character itself. Nothing else is normalised, because nothing else
 *  needs to be: the towns are joined by code and only the twelve split towns compare names at all,
 *  where all 852 (2024) and 846 (2020) of them agree character for character. */
const villageKey = (s) => String(s || '').replace(/[[\]〔〕]/g, '').trim();

/** ROC-calendar date in a catalogue description — 「村里界歷史圖資_1120928」, 「(1081121版)」 — as an
 *  ISO date. ⚠ ONE ENTRY IS DATED BY YEAR ALONE (「106年版」) and is deliberately not resolved: a
 *  vintage whose day is unknown cannot be compared with a polling day, and guessing one would be
 *  the difference between a map drawn before an election and a map drawn after it. */
function rocDate(text) {
  const m = String(text).match(/(?<!\d)(\d{3})(\d{2})(\d{2})(?!\d)/);
  if (!m) return null;
  return (Number(m[1]) + 1911) + '-' + m[2] + '-' + m[3];
}

/* ══ DISSOLVING THE VILLAGES INTO ONE CONSTITUENCY ═════════════════════════════════════════════
   ⚠ `mergeFeatures` CONCATENATES RINGS; IT DOES NOT DISSOLVE THEM, and for this pack that is not a
   matter of file size. js/elections.js draws an `elec-line` outline round every ring of the source,
   so a constituency handed over as the 7 953 village rings it was assembled from is DRAWN as 7 953
   boundaries — the reader is shown village borders and told they are constituency borders. The
   union has to be real.

   It can be exact here, and cheaply, because these rings come from ONE topologically noded layer:
   where two villages meet, both store the same vertices, so the shared boundary appears once in
   each direction. An edge that occurs in both directions inside one constituency is therefore
   interior and cancels; what survives is exactly the outline. ⚠ THIS IS NOT A GENERAL POLYGON
   UNION and must not be reused as one — it is only correct for a noded partition, which is why it
   verifies its own result by stitching the survivors back into closed rings and stopping if any
   chain does not close. Measured 2026-09-10: all 146 constituencies built here close, the 2 031 651
   vertices of the 2023 village layer become 45 619 in 73 outlines, and the two eras together fall
   from 10.31 MB written without the dissolve to 1.87 MB with it. */
const ptKey = (c) => c[0] + ',' + c[1];

function ringsOf(geometry) {
  if (!geometry) return [];
  return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
}

function shoelace(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}

function inside(pt, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function dissolve(geometries, where) {
  /* every directed edge, counted */
  const out = new Map();                     /* "a>b" → { a, b, n } */
  for (const g of geometries) {
    for (const ring of ringsOf(g)) {
      for (let i = 0; i + 1 < ring.length; i++) {
        const a = ring[i], b = ring[i + 1];
        if (a[0] === b[0] && a[1] === b[1]) continue;      /* a repeated vertex is not an edge */
        const k = ptKey(a) + '>' + ptKey(b);
        const e = out.get(k);
        if (e) e.n++; else out.set(k, { a, b, n: 1 });
      }
    }
  }
  /* cancel each edge against its reverse: that pair is a boundary between two villages of THIS
     constituency, and no reader was ever meant to see it */
  for (const [k, e] of out) {
    if (!e.n) continue;
    const rk = ptKey(e.b) + '>' + ptKey(e.a);
    const r = out.get(rk);
    if (!r || !r.n) continue;
    const both = Math.min(e.n, r.n);
    e.n -= both; r.n -= both;
    if (!e.n) out.delete(k);
    if (!r.n) out.delete(rk);
  }
  /* stitch what is left into closed rings */
  const from = new Map();
  for (const e of out.values()) {
    const k = ptKey(e.a);
    if (!from.has(k)) from.set(k, []);
    for (let i = 0; i < e.n; i++) from.get(k).push(e.b);
  }
  const rings = [];
  for (const [start, ends] of from) {
    while (ends.length) {
      const ring = [];
      let here = start, next = ends.pop();
      ring.push(here.split(',').map(Number));
      for (let guard = 0; ; guard++) {
        ring.push(next);
        const k = ptKey(next);
        if (k === start) break;
        const list = from.get(k);
        if (!list || !list.length) throw new Error('tw: the boundary of ' + where + ' does not close at ' + k);
        if (guard > 4e6) throw new Error('tw: the boundary of ' + where + ' will not stitch');
        next = list.pop();
        here = k;
      }
      rings.push(ring);
    }
  }
  if (!rings.length) throw new Error('tw: ' + where + ' dissolved to nothing');
  /* ⚠ THE LAYER IS NOT PERFECTLY NODED AND THE LEFTOVERS ARE NOT HOLES. Measured 2026-09-10 on the
     2019-11-21 vintage: 新竹縣第02選區 leaves 94 extra rings besides its outline, every one of them
     of the order of 1e-12 square degrees — about a hundredth of a square metre — where two villages
     stored a shared boundary with one vertex more on one side than the other. Calling one of those a
     hole stops the build; calling it an island paints a dot in the sea. The rule that removes them
     is not a size of its own: it is `MIN_AREA`, which is half a cell of the grid this file is
     WRITTEN on. A ring that encloses less than that is a line once its coordinates are rounded, and
     `simplifyGeoJSON` would discard it a few lines later for the same reason. */
  const real = rings.filter(r => Math.abs(shoelace(r)) >= MIN_AREA);
  if (!real.length) throw new Error('tw: nothing of ' + where + ' survives at ' + DECIMALS + ' decimal places');
  rings.length = 0; rings.push(...real);
  /* ⚠ ORIENTATION IS THE ONLY THING THAT SAYS WHICH RING IS A HOLE, and it is inherited from the
     shapefile through readShp: an outer ring winds clockwise (negative shoelace in x-y order) and a
     hole winds the other way. A hole here is real — a village of ANOTHER constituency enclosed by
     this one — and it must survive, because filling it would colour that seat twice. */
  const outers = rings.filter(r => shoelace(r) < 0).map(r => [r]);
  const holes = rings.filter(r => shoelace(r) >= 0);
  if (!outers.length) throw new Error('tw: ' + where + ' has no outer ring');
  for (const h of holes) {
    let best = null, bestArea = Infinity;
    for (const poly of outers) {
      if (!inside(h[0], poly[0])) continue;
      const a = Math.abs(shoelace(poly[0]));
      if (a < bestArea) { best = poly; bestArea = a; }
    }
    if (!best) throw new Error('tw: a hole in ' + where + ' lies inside none of its outlines');
    best.push(h);
  }
  return outers.length === 1 ? { type: 'Polygon', coordinates: outers[0] } : { type: 'MultiPolygon', coordinates: outers };
}

/* ── the party-list allocation ─────────────────────────────────────────────────────────────────
   Largest remainder over the parties that reached the threshold, which is what 公職人員選舉罷免法
   §67 prescribes. ⚠ The threshold is a share of ALL valid party votes, not of the qualifying ones. */
function allocateList(votes, seats, threshold) {
  const total = [...votes.values()].reduce((a, v) => a + v, 0);
  const qualified = [...votes.entries()].filter(([, v]) => v >= total * threshold);
  const pool = qualified.reduce((a, [, v]) => a + v, 0);
  if (!pool) throw new Error('tw: no party reached the party-list threshold');
  const quota = pool / seats;
  const rows = qualified.map(([p, v]) => ({ p, exact: v / quota, seats: Math.floor(v / quota) }));
  let left = seats - rows.reduce((a, r) => a + r.seats, 0);
  for (const r of [...rows].sort((a, b) => (b.exact - b.seats) - (a.exact - a.seats))) {
    if (left <= 0) break;
    r.seats++; left--;
  }
  const got = rows.reduce((a, r) => a + r.seats, 0);
  if (got !== seats) throw new Error('tw: the list allocation came to ' + got + ', not ' + seats);
  return new Map(rows.map(r => [r.p, r.seats]));
}

export async function build(ctx) {
  /* ── the two catalogue records ─────────────────────────────────────────────────────────────
     Everything downloaded below is reached through these, so a renamed file or a re-cut archive
     follows automatically and a change of licence is caught rather than mis-stated. */
  const catalogue = {};
  for (const [key, id] of [['villages', VILLAGE_DATASET], ['votes', VOTE_DATASET]]) {
    const rec = (await ctx.get(CATALOGUE + id, { json: true })).result;
    if (!rec) throw new Error('tw: data.gov.tw has no dataset ' + id);
    if (String(rec.license) !== OPEN_LICENCE_CODE) {
      throw new Error('tw: dataset ' + id + ' is now under licence «' + rec.license + '», not «' + OPEN_LICENCE_CODE + '»');
    }
    catalogue[key] = rec;
  }

  /* the Commission's catalogue entry points at a one-line CSV that names the real archive; that
     indirection is the publisher's own, so it is followed rather than short-circuited */
  const pointer = await ctx.get(catalogue.votes.distribution[0].resourceDownloadUrl, { text: true });
  const zipUrl = (pointer.match(/https?:\/\/\S+?\.zip/i) || [])[0];
  if (!zipUrl) throw new Error('tw: the vote dataset pointer names no archive: ' + pointer.slice(0, 200));
  const archive = await remoteZip(ctx, encodeURI(zipUrl));

  /* ── which village vintages exist, and when ────────────────────────────────────────────────*/
  const vintages = catalogue.villages.distribution
    .map(d => ({ date: rocDate(d.resourceDescription), url: d.resourceDownloadUrl, label: d.resourceDescription.trim() }))
    .filter(v => v.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!vintages.length) throw new Error('tw: no dated village vintage in dataset ' + VILLAGE_DATASET);

  /* ── which races the archive holds ─────────────────────────────────────────────────────────
     The four words below are the Commission's own names for the four ballots of a legislative
     election; the folders that carry them are found rather than written out, because the archive
     has renamed them at least once (2008's 「區域」 became 「區域立委」). */
  const RACES = { district: '區域', list: '不分區', highland: '山地', lowland: '平地' };
  const folders = new Map();
  for (const name of archive.members.keys()) {
    const m = name.match(/voteData\/([^/]*(\d{4})[^/]*)\/([^/]+)\/(el[a-z]+)(_[A-Z]\d)?\.csv$/);
    if (!m) continue;
    const key = m[2] + '|' + m[3];
    if (!folders.has(key)) folders.set(key, new Map());
    folders.get(key).set(m[4], name);
  }
  const raceFiles = (year, race) => {
    const hits = [...folders.entries()].filter(([k]) => k.startsWith(year + '|') && k.split('|')[1].includes(RACES[race]));
    /* 2016 ships the same race twice, once under an 「old」 path; the deepest path is the reissue */
    if (!hits.length) return null;
    hits.sort((a, b) => a[0].length - b[0].length);
    return Object.fromEntries(hits[0][1]);
  };

  /* ── the opening view ──────────────────────────────────────────────────────────────────────
     Measured from the constituencies themselves, so that Kinmen and Matsu — 180 km west and 210 km
     north of the main island, and each a constituency of its own — cannot be cropped out by a
     number written here.
     ⚠ BUT NOT FROM EVERY RING. The Ministry's village layer carries what the Ministry carries, and
     that includes islets 1 700 km south (10.4°N) and 250 km east (124.6°E) of the main island. This
     pack neither removes them nor argues about them: it draws exactly what the two publishers
     record. It does, however, refuse to let them decide where the reader is put down, because a
     view stretched to hold them is 98 % ocean and Taiwan is four pixels of it. So the box is taken
     from each constituency's LARGEST ring — its main body — which is a fact about the geometry and
     mentions no place. */
  const box = [[180, 90], [-180, -90]];
  const stretchRing = (ring) => {
    for (const c of ring) {
      if (c[0] < box[0][0]) box[0][0] = c[0];
      if (c[0] > box[1][0]) box[1][0] = c[0];
      if (c[1] < box[0][1]) box[0][1] = c[1];
      if (c[1] > box[1][1]) box[1][1] = c[1];
    }
  };
  const stretch = (geometry) => {
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    let biggest = null, area = -1;
    for (const poly of polys) {
      const a = Math.abs(shoelace(poly[0]));
      if (a > area) { area = a; biggest = poly[0]; }
    }
    if (biggest) stretchRing(biggest);
  };
  /* ⚠ THE KEYS ARE THE APP'S OWN CODES, NOT BCP-47 (js/locales/_langs.js): Japanese is `jp` and
     traditional Chinese is `zh`. A table keyed `ja` / `zh-Hant` is read by the registry's alias
     rule, but writing both spellings makes one of the two dead weight that looks like coverage. */
  const polities = [{ id: 'tw', n: {
    en: 'Taiwan', native: '臺灣', zh: '臺灣', 'zh-hans': '台湾', jp: '台湾',
    de: 'Taiwan', ru: 'Тайвань', es: 'Taiwán', fr: 'Taïwan', ko: '대만',
  }, home: box }];
  const parties = {};
  const elections = [];
  const geo = {};
  const res = {};
  const skipped = [];

  for (const poll of POLLS) {
    const files = raceFiles(String(poll.y), 'district');
    if (!files) { skipped.push(poll.y + ': the archive has no 區域立委 folder'); continue; }
    const vintage = vintages.find(v => v.date <= poll.date);
    if (!vintage) {
      /* ⚠ SAID ALOUD, NOT SWALLOWED. The alternative is a constituency map drawn after the election
         it is used to explain, which is the one mistake this file exists to avoid. */
      skipped.push(poll.y + ': the earliest village vintage the Ministry publishes is ' +
        vintages[vintages.length - 1].date + ', after polling day ' + poll.date);
      continue;
    }

    /* ── the constituency membership ──────────────────────────────────────────────────────── */
    const base = rowsOf(await archive.read(files.elbase));
    const townCode = (r) => r[0] + r[1] + r[3];
    const districtOf = (r) => r[0] + r[1] + '-' + r[2];

    const districtName = new Map();
    for (const r of base) if (r[2] !== '00' && r[3] === '000' && r[4] === '0000') districtName.set(districtOf(r), r[5]);
    const townDistricts = new Map(), townName = new Map();
    for (const r of base) {
      if (r[3] === '000' || r[4] !== '0000') continue;
      if (!townDistricts.has(townCode(r))) townDistricts.set(townCode(r), new Set());
      townDistricts.get(townCode(r)).add(districtOf(r));
      townName.set(townCode(r), r[5]);
    }
    /* ⚠ A ROW WHOSE VILLAGE CODE IS NOT A VILLAGE CODE IS A COMBINED POLLING UNIT, NOT A PLACE. The
       Commission writes those with a letter in the code and names them by listing the villages they
       combine — 「復興村、福沃村」. Counting one as a village puts a name on the map that no ground
       answers to; and in 2016 and 2020 Matsu is recorded ONLY that way, which is why the assembly
       above works from the town rows. Every such row is checked to be naming several units, so a
       change in the Commission's coding stops the build rather than losing a village. */
    const villageRows = [], combined = [];
    for (const r of base) {
      if (r[4] === '0000' || r[3] === '000') continue;
      (/^\d+$/.test(r[4]) ? villageRows : combined).push(r);
    }
    for (const r of combined) {
      if (!r[5].includes('、')) throw new Error('tw ' + poll.y + ': «' + r[5] + '» has a village code of ' + r[4] + ' but names one unit');
    }
    /* the two levels must agree about which constituencies a town is in, or one of them is wrong */
    for (const r of villageRows) {
      const t = townDistricts.get(townCode(r));
      if (!t || !t.has(districtOf(r))) {
        throw new Error('tw ' + poll.y + ': village ' + r[5] + ' is in ' + districtOf(r) + ' but its town is not');
      }
    }

    /* ── the Ministry's villages ──────────────────────────────────────────────────────────── */
    const entries = await wholeArchive(ctx, vintage.url, 'the ' + vintage.date + ' village boundaries');
    const { shp, dbf } = shapefileParts(entries, '');
    if (!shp || !dbf) throw new Error('tw: the ' + vintage.date + ' village archive has no shapefile');
    const attrs = readVillageDbf(dbf);
    const geoms = readShp(shp);
    if (attrs.length !== geoms.length) throw new Error('tw: shp/dbf disagree (' + geoms.length + ' vs ' + attrs.length + ')');

    const shapesByTown = new Map();
    for (let i = 0; i < attrs.length; i++) {
      if (!geoms[i]) continue;
      if (!shapesByTown.has(attrs[i].TOWNCODE)) shapesByTown.set(attrs[i].TOWNCODE, []);
      shapesByTown.get(attrs[i].TOWNCODE).push(i);
    }
    /* ⚠ THE CODE JOIN IS CHECKED IN BOTH DIRECTIONS AND THEN CHECKED AGAIN BY NAME. A town the two
       publishers do not both have is a hole or an orphan; a town whose two Chinese names disagree
       would mean the codes had drifted apart and the join was answering confidently about the wrong
       piece of ground. */
    for (const code of townDistricts.keys()) {
      if (!shapesByTown.has(code)) throw new Error('tw ' + poll.y + ': the ' + vintage.date + ' boundaries have no town ' + code);
    }
    for (const code of shapesByTown.keys()) {
      if (!townDistricts.has(code)) throw new Error('tw ' + poll.y + ': the record does not place town ' + code + ' in any constituency');
      const theirs = villageKey(attrs[shapesByTown.get(code)[0]].TOWNNAME);
      const ours = villageKey(townName.get(code));
      if (theirs !== ours) throw new Error('tw ' + poll.y + ': town ' + code + ' is «' + ours + '» to the Commission and «' + theirs + '» to the Ministry');
    }

    /* ── assemble ─────────────────────────────────────────────────────────────────────────── */
    const members = new Map();          /* district → [shape index] */
    const put = (d, i) => { if (!members.has(d)) members.set(d, []); members.get(d).push(i); };
    let unassigned = 0;
    for (const [code, districts] of townDistricts) {
      const idx = shapesByTown.get(code);
      if (districts.size === 1) { const d = [...districts][0]; for (const i of idx) put(d, i); continue; }
      /* a split town: the village names decide, and every one of them must be found */
      const pool = idx.slice();
      for (const r of villageRows) {
        if (townCode(r) !== code) continue;
        const want = villageKey(r[5]);
        const k = pool.findIndex(i => villageKey(attrs[i].VILLNAME) === want);
        if (k < 0) {
          throw new Error('tw ' + poll.y + ': ' + villageKey(attrs[idx[0]].COUNTYNAME) + villageKey(attrs[idx[0]].TOWNNAME) +
            ' is split between constituencies and the ' + vintage.date + ' boundaries have no «' + want + '»');
        }
        put(districtOf(r), pool[k]);
        pool.splice(k, 1);
      }
      /* ⚠ WHAT MAY BE LEFT OVER IS GROUND THAT IS IN NO VILLAGE. The Ministry marks those
         「未編定村里」 and the Commission cannot place them, because it defines a constituency as a
         set of villages and this is not in one. Ground with a name that the record does not place
         is a different matter and stops the build. Measured 2026-09-10: two such shapes in all
         (新北市三重區, 高雄市苓雅區), and one of them touches both of its town's constituencies, so
         there is nothing to infer from. */
      for (const i of pool) {
        if (attrs[i].VILLNAME) {
          throw new Error('tw ' + poll.y + ': ' + villageKey(attrs[i].COUNTYNAME) + villageKey(attrs[i].TOWNNAME) +
            ' has a village «' + attrs[i].VILLNAME + '» the record places in no constituency');
        }
        unassigned++;
      }
    }
    if (members.size !== districtName.size) {
      throw new Error('tw ' + poll.y + ': assembled ' + members.size + ' constituencies but the record names ' + districtName.size);
    }

    const fc = { type: 'FeatureCollection', features: [] };
    for (const [d, idx] of [...members].sort()) {
      const native = districtName.get(d);
      if (!native) throw new Error('tw ' + poll.y + ': constituency ' + d + ' has no name');
      fc.features.push({
        type: 'Feature',
        /* ⚠ THE ENGLISH NAME IS THE CHINESE ONE, AND THAT IS DELIBERATE. The Commission publishes no
           English form of a constituency name and no romanisation of a county is reachable — the
           Ministry's COUNTYENG field lives behind tgos.tw, which answered 403 to every request on
           2026-09-10 — so the pack shows the reader what is written on the ballot rather than a
           transliteration invented here. */
        properties: { cd: d, n: { en: native, native, 'zh-Hant': native } },
        geometry: dissolve(idx.map(i => geoms[i]), native),
      });
    }
    simplifyGeoJSON(fc, { tolerance: TOLERANCE, decimals: DECIMALS });
    for (const f of fc.features) stretch(f.geometry);

    /* ── who stood, and who won ───────────────────────────────────────────────────────────── */
    const partyName = new Map(rowsOf(await archive.read(files.elpaty)).map(r => [r[0], r[1]]));
    const partyId = (code) => {
      const zh = partyName.get(code);
      if (!zh) throw new Error('tw ' + poll.y + ': party code ' + code + ' is not in elpaty.csv');
      /* ⚠ THE ID IS THE COMMISSION'S OWN CODE. It is the only identifier that is stable across the
         four ballots and the years, and a slug made from the name would change with a rename. */
      const id = 'tw:p' + code;
      if (!parties[id]) {
        const known = KNOWN[zh];
        const plain = NOT_A_PARTY[zh];
        /* ⚠ `native` AND `zh` ARE THE COMMISSION'S OWN STRING, and a party this table has never
           heard of carries nothing else: the reader is shown the name that was on the ballot
           rather than a transliteration invented here. */
        parties[id] = {
          n: { en: (plain && plain.en) || (known && known.en) || zh, native: zh, zh,
            ...(plain || (known && known.nm) || {}) },
          col: plain ? NEUTRAL : ((known && known.col) || derivedColour(zh)),
        };
      }
      return id;
    };

    const cands = new Map();            /* district → ballot number → {name, party} */
    for (const r of rowsOf(await archive.read(files.elcand))) {
      const d = districtOf(r);
      if (!cands.has(d)) cands.set(d, new Map());
      cands.get(d).set(r[5], { n: r[6], p: partyId(r[7]) });
    }

    /* ⚠ elctks CARRIES THE SAME VOTES AT FOUR LEVELS — polling station, village, town and
       constituency — so a naïve sum counts every ballot four times. The constituency rows are the
       ones read, and they are then CHECKED against the polling-station rows they summarise, because
       an aggregate that disagrees with its own detail is the way a level would be misread. */
    const ticks = rowsOf(await archive.read(files.elctks));
    const totals = new Map(), detail = new Map(), winner = new Map();
    for (const r of ticks) {
      const d = districtOf(r), num = r[6], v = Number(r[7]);
      if (!Number.isFinite(v)) throw new Error('tw ' + poll.y + ': a vote count is not a number in ' + d);
      if (r[3] === '000' && r[4] === '0000' && r[5] === '0000') {
        if (!totals.has(d)) totals.set(d, new Map());
        totals.get(d).set(num, v);
        if (r[9].trim() === '*') { if (!winner.has(d)) winner.set(d, []); winner.get(d).push(num); }
      } else if (r[3] !== '000' && r[4] !== '0000' && r[5] !== '0000') {
        if (!detail.has(d)) detail.set(d, new Map());
        detail.get(d).set(num, (detail.get(d).get(num) || 0) + v);
      }
    }
    if (totals.size !== members.size) {
      skipped.push(poll.y + ': the archive reports constituency totals for ' + totals.size + ' of ' + members.size +
        ' constituencies, so the result cannot be read at the level the map is drawn at');
      continue;
    }

    const d = {};
    const districtSeats = new Map();
    for (const [code] of members) {
      const tot = totals.get(code), det = detail.get(code) || new Map();
      const list = [...tot.entries()].map(([num, v]) => {
        const who = (cands.get(code) || new Map()).get(num);
        if (!who) throw new Error('tw ' + poll.y + ': ' + code + ' has votes for ballot number ' + num + ' and no candidate');
        if (det.size && det.get(num) !== v) {
          throw new Error('tw ' + poll.y + ': ' + code + ' candidate ' + num + ' has ' + v +
            ' votes in the constituency row and ' + det.get(num) + ' across the polling stations');
        }
        return { n: who.n, p: who.p, v };
      }).sort((a, b) => b.v - a.v);
      const won = (winner.get(code) || []);
      if (won.length !== 1) throw new Error('tw ' + poll.y + ': ' + code + ' has ' + won.length + ' elected members');
      const w = (cands.get(code) || new Map()).get(won[0]).p;
      districtSeats.set(w, (districtSeats.get(w) || 0) + 1);
      d[code] = { w, c: list, t: list.reduce((a, x) => a + x.v, 0) };
    }

    /* ── the seats the map cannot draw ────────────────────────────────────────────────────── */
    const offMap = new Map();
    const bump = (p, n) => offMap.set(p, (offMap.get(p) || 0) + n);
    let indigenous = 0;
    for (const race of ['highland', 'lowland']) {
      const f = raceFiles(String(poll.y), race);
      if (!f) throw new Error('tw ' + poll.y + ': the archive has no ' + RACES[race] + ' folder');
      const who = new Map(rowsOf(await archive.read(f.elcand)).map(r => [r[5], r[7]]));
      for (const r of rowsOf(await archive.read(f.elctks))) {
        if (r[0] !== '00' || r[9].trim() !== '*') continue;
        bump(partyId(who.get(r[6])), 1);
        indigenous++;
      }
    }
    if (indigenous !== INDIGENOUS_SEATS) throw new Error('tw ' + poll.y + ': ' + indigenous + ' indigenous members elected, not ' + INDIGENOUS_SEATS);

    const listRace = raceFiles(String(poll.y), 'list');
    if (!listRace) throw new Error('tw ' + poll.y + ': the archive has no 不分區 folder');
    const listParty = new Map(rowsOf(await archive.read(listRace.elcand)).map(r => [r[5], r[7]]));
    const listVotes = new Map();
    for (const r of rowsOf(await archive.read(listRace.elctks))) {
      if (r[0] !== '00') continue;
      listVotes.set(partyId(listParty.get(r[6])), Number(r[7]));
    }
    const listTotal = [...listVotes.values()].reduce((a, v) => a + v, 0);
    for (const [p, n] of allocateList(listVotes, LIST_SEATS, LIST_THRESHOLD)) bump(p, n);

    const n = [];
    for (const p of new Set([...districtSeats.keys(), ...offMap.keys(), ...listVotes.keys()])) {
      const ds = districtSeats.get(p) || 0, ls = offMap.get(p) || 0;
      const row = { p, seats: ds + ls, dseats: ds, lseats: ls };
      if (listVotes.has(p)) row.pct = Math.round(listVotes.get(p) / listTotal * 1000) / 10;
      if (row.seats || row.pct != null) n.push(row);
    }
    n.sort((a, b) => b.seats - a.seats || (b.pct || 0) - (a.pct || 0));
    const chamber = n.reduce((a, r) => a + r.seats, 0);
    const seatsTotal = members.size + INDIGENOUS_SEATS + LIST_SEATS;
    if (chamber !== seatsTotal) throw new Error('tw ' + poll.y + ': the files account for ' + chamber + ' of the ' + seatsTotal + ' seats');

    const geoId = 'tw-ly-' + poll.y + '.geo.json';
    const resId = 'tw-ly-' + poll.y + '.res.json';
    geo[geoId] = fc;
    res[resId] = { d, n };
    elections.push({
      id: 'tw-ly-' + poll.y,
      polity: 'tw',
      body: {
        en: 'Legislative Yuan', native: '立法院', zh: '立法院', 'zh-hans': '立法院',
        jp: '立法院', de: 'Legislativ-Yuan', ru: 'Законодательный юань',
        es: 'Yuan Legislativo', fr: 'Yuan législatif', ko: '입법원',
      },
      date: poll.date, y: poll.y,
      geo: geoId, res: resId,
      seatsTotal, districtSeats: members.size, listSeats: INDIGENOUS_SEATS + LIST_SEATS,
      listName: {
        en: 'at-large and indigenous', native: '不分區與原住民',
        zh: '不分區與原住民', 'zh-hans': '不分区与原住民', jp: '比例と原住民',
        de: 'Listensitze und indigene Sitze', ru: 'списочные места и места коренных народов',
        es: 'escaños de lista y escaños indígenas', fr: 'sièges de liste et sièges autochtones',
        ko: '비례대표와 원주민 의석',
      },
      /* ⚠ EVERY LANGUAGE SAYS THE SAME TWO THINGS AND SAYS THEM IN ITS OWN CLAUSE ORDER: which
         seats the map can colour, and that a constituency outline had to be assembled because none
         is published. ⚠ AND NONE OF THEM DESCRIBES WHAT THE POLITY IS — the note is about an
         election, exactly as the head of this file says, so no word here (in any language) makes a
         claim about status. */
      note: {
        en: 'The map colours the ' + members.size + ' single-member constituencies. The other ' +
          (INDIGENOUS_SEATS + LIST_SEATS) + ' members of the ' + seatsTotal + ' — ' + LIST_SEATS +
          ' from the party lists and ' + INDIGENOUS_SEATS + ' from the two indigenous constituencies, ' +
          'whose electorates are not territorial — belong to no piece of ground and are in the bars ' +
          'only. A constituency has no published outline: it is assembled from the villages the ' +
          'Commission records it as holding, on the Ministry of the Interior’s village boundaries of ' +
          vintage.date + '.',
        native: '地圖僅著色 ' + members.size + ' 個區域選舉區。其餘 ' + (INDIGENOUS_SEATS + LIST_SEATS) +
          ' 席（不分區 ' + LIST_SEATS + ' 席、原住民 ' + INDIGENOUS_SEATS + ' 席）之選舉區並非地域，' +
          '僅計入席次長條圖。選舉區界線係依中央選舉委員會所載村里，套疊內政部 ' + vintage.date + ' 版村里界圖組成。',
        zh: '地圖僅著色 ' + members.size + ' 個區域選舉區。其餘 ' + (INDIGENOUS_SEATS + LIST_SEATS) +
          ' 席（不分區 ' + LIST_SEATS + ' 席、原住民 ' + INDIGENOUS_SEATS + ' 席）之選舉區並非地域，' +
          '僅計入席次長條圖。選舉區界線係依中央選舉委員會所載村里，套疊內政部 ' + vintage.date + ' 版村里界圖組成。',
        'zh-hans': '地图仅着色 ' + members.size + ' 个区域选举区。其余 ' + (INDIGENOUS_SEATS + LIST_SEATS) +
          ' 席（不分区 ' + LIST_SEATS + ' 席、原住民 ' + INDIGENOUS_SEATS + ' 席）之选举区并非地域，' +
          '仅计入席位长条图。选举区界线系依中央选举委员会所载村里，套叠内政部 ' + vintage.date + ' 版村里界图组成。',
        jp: '地図が塗るのは ' + members.size + ' の小選挙区だけ。残る ' + (INDIGENOUS_SEATS + LIST_SEATS) +
          ' 議席（比例 ' + LIST_SEATS + '、原住民 ' + INDIGENOUS_SEATS + '）は地理的な区を持たないので、' +
          '議席の棒にのみ入る。選挙区の輪郭は公表されていないため、中央選挙委員会が記録する村里を、' +
          '内政部 ' + vintage.date + ' 版の村里界に重ねて組み立てた。',
        de: 'Die Karte färbt die ' + members.size + ' Einerwahlkreise. Die übrigen ' +
          (INDIGENOUS_SEATS + LIST_SEATS) + ' der ' + seatsTotal + ' Mitglieder — ' + LIST_SEATS +
          ' von den Parteilisten und ' + INDIGENOUS_SEATS + ' aus den beiden indigenen Wahlkreisen, ' +
          'deren Wählerschaft nicht an ein Gebiet gebunden ist — gehören zu keinem Stück Boden und ' +
          'stehen nur in den Balken. Für einen Wahlkreis ist kein Umriss veröffentlicht: er ist aus ' +
          'den Dörfern zusammengesetzt, die die Wahlkommission ihm zuordnet, auf den Dorfgrenzen des ' +
          'Innenministeriums vom ' + vintage.date + '.',
        ru: 'Карта закрашивает ' + members.size + ' ' +
          ruN(members.size, 'одномандатный округ', 'одномандатных округа', 'одномандатных округов') +
          '. Остальные ' + (INDIGENOUS_SEATS + LIST_SEATS) + ' из ' + seatsTotal + ' ' +
          ruN(seatsTotal, 'члена', 'членов', 'членов') + ' — ' + LIST_SEATS +
          ' по партийным спискам и ' + INDIGENOUS_SEATS + ' от двух округов коренных народов, ' +
          'избиратели которых не привязаны к территории, — не принадлежат никакому участку земли и ' +
          'показаны только в столбцах. Контур округа нигде не опубликован: округ собран из сёл, ' +
          'которые относит к нему избирательная комиссия, на границах сёл министерства внутренних ' +
          'дел от ' + vintage.date + '.',
        es: 'El mapa colorea las ' + members.size + ' circunscripciones uninominales. Los otros ' +
          (INDIGENOUS_SEATS + LIST_SEATS) + ' de los ' + seatsTotal + ' miembros —' + LIST_SEATS +
          ' de las listas de partido y ' + INDIGENOUS_SEATS + ' de las dos circunscripciones ' +
          'indígenas, cuyo electorado no es territorial— no pertenecen a ningún trozo de terreno y ' +
          'solo aparecen en las barras. No hay contorno publicado de una circunscripción: se compone ' +
          'de las aldeas que la comisión electoral le atribuye, sobre los límites de aldea del ' +
          'ministerio del interior de ' + vintage.date + '.',
        fr: 'La carte colore les ' + members.size + ' circonscriptions uninominales. Les ' +
          (INDIGENOUS_SEATS + LIST_SEATS) + ' autres membres sur ' + seatsTotal + ' — ' + LIST_SEATS +
          ' issus des listes de parti et ' + INDIGENOUS_SEATS + ' des deux circonscriptions ' +
          'autochtones, dont l’électorat n’est pas territorial — n’appartiennent à aucun morceau de ' +
          'terrain et ne figurent que dans les barres. Aucun contour de circonscription n’est ' +
          'publié : elle est assemblée à partir des villages que la commission électorale lui ' +
          'rattache, sur les limites de village du ministère de l’intérieur du ' + vintage.date + '.',
        ko: '지도는 ' + members.size + '개 지역구만 칠한다. 나머지 ' + (INDIGENOUS_SEATS + LIST_SEATS) +
          '석(전체 ' + seatsTotal + '석 가운데 정당 명부 ' + LIST_SEATS + '석, 두 개의 원주민 선거구 ' +
          INDIGENOUS_SEATS + '석)은 선거구가 지역이 아니어서 어느 땅에도 속하지 않으며 의석 막대에만 ' +
          '들어간다. 선거구의 경계는 공표되지 않으므로, 중앙선거위원회가 기록한 촌리를 내정부 ' +
          vintage.date + ' 판 촌리 경계도에 겹쳐 조립했다.',
      },
      src: SRC, lic: LIC,
    });
    console.log('    tw ' + poll.y + ': ' + members.size + ' constituencies on the ' + vintage.date +
      ' village boundaries' + (unassigned ? ', ' + unassigned + ' shape(s) in no village left off' : ''));
  }

  if (!elections.length) throw new Error('tw: no election could be assembled — ' + skipped.join('; '));
  for (const s of skipped) console.log('    tw: not shipped — ' + s);

  return { polities, parties, elections, geo, res };
}
