/* ============================================================================
 *  IntMap · js/locales/ui.zh-hans.js — GENERATED FROM ui.zh.js   (#R224)
 * ----------------------------------------------------------------------------
 *  「簡体を追加して。(beta)」（確認済：**字体変換＋大陸語彙の置換**）
 *
 *  ══ WHY THIS IS A SCRIPT AND NOT A SECOND TRANSLATION ═══════════════════════════════════════════
 *  #R223 translated 2,100 strings into Traditional Chinese. Simplified Chinese is not a different
 *  translation of those strings — for the overwhelming majority of them it is the SAME sentence in a
 *  different orthography, and a hand-made second copy would start drifting from the first the day
 *  after it shipped. So the Simplified file is DERIVED, the derivation is this file, and
 *  tests/r224-checks.test.mjs re-runs it and fails if the committed output is not what it produces.
 *  A string fixed in ui.zh.js is therefore fixed in both, or the build says so.
 *
 *  ⚠ BUT A CHARACTER MAP ALONE IS NOT SIMPLIFIED CHINESE, which is why 「語彙の置換」 was the answer:
 *  「網路」 converts to 「网路」, a spelling nobody in mainland China writes — it is 「网络」. Same for
 *  資訊/信息, 螢幕/屏幕, 檔案/文件, 預設/默认, 選單/菜单, 視窗/窗口, 伺服器/服务器, 演算法/算法,
 *  資料/数据, 使用者/用户, 解析度/分辨率, 座標/坐标, 公尺/米 … So the WORD table runs FIRST, on the
 *  Traditional text (where the Taiwanese spellings are unambiguous), and the character map second.
 *
 *  ⚠ ONE-TO-MANY IS HANDLED IN THE WORD TABLE, NEVER IN THE CHARACTER MAP. 著 is 着 in mainland
 *  orthography for the aspect marker and for 着色/着陆, but stays 著 in 著名/著作/顯著 — so those
 *  words are pinned before the blanket 著→着 runs. Same shape for 乾 (干燥, but 乾坤 keeps 乾).
 *
 *  RUN:  node scripts/zh-hans.mjs          → rewrites js/locales/ui.zh-hans.js
 *        node scripts/zh-hans.mjs --check  → exits non-zero if the committed file is out of date
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/* ══ (#R231) TWO FILES NOW, NOT ONE ═══════════════════════════════════════════════════════════════
   The reading pages (sources.html / science.html) got their Chinese this round, and they are a
   SECOND body of text with the same property #R224 identified for the first: Simplified is not a
   different translation of it, it is the same sentences in a different orthography. So the same
   derivation runs over both, and `--check` covers both — a Traditional string fixed by hand in
   either file is fixed in its Simplified twin, or the build says so.
   ⚠ The page files are keyed by BCP-47 tag (js/page-i18n.js takes each language's `html` value as
   the file suffix), which is why they are `zh-hant`/`zh-hans` while the app's UI table is `zh`. */
const JOBS = [
  { src: 'js/locales/ui.zh.js', out: 'js/locales/ui.zh-hans.js', what: 'UI STRINGS',
    from: "window.IntMapLang.define('zh'", to: "window.IntMapLang.define('zh-hans'" },
  { src: 'js/locales/pages.zh-hant.js', out: 'js/locales/pages.zh-hans.js', what: 'READING PAGES',
    from: "window.IntMapPageI18N.define('zh-hant'", to: "window.IntMapPageI18N.define('zh-hans'" },
];

/* ── ① WORDS THAT ARE PINNED BEFORE ANYTHING ELSE ────────────────────────────────────────────────
   Traditional spellings whose characters must NOT take the blanket rule below. Written as a
   placeholder round-trip so a later rule cannot reach inside them. */
export const PINNED = ['著名', '著作', '著者', '顯著', '土著', '編著', '著述', '乾坤', '乾隆'];

/* ── ② TAIWAN → MAINLAND VOCABULARY ──────────────────────────────────────────────────────────────
   Applied to the TRADITIONAL text, longest first. Right-hand sides are written in Traditional too
   (the character map runs afterwards), so this table only ever states a WORD choice — never an
   orthography, which keeps the two concerns from tangling.
   ⚠ Every entry is a term where the mainland reader would otherwise be given a word that is either
   wrong or foreign. Words that are simply shared (按鈕/預覽/區域/範圍/警告/錯誤…) are NOT here. */
export const WORDS = [
  /* computing & UI */
  ['網際網路', '互聯網'], ['重新整理', '刷新'], ['工作階段', '會話'], ['行動裝置', '移動設備'],
  ['解析度', '分辨率'], ['演算法', '算法'], ['伺服器', '服務器'], ['使用者', '用戶'],
  ['最佳化', '優化'], ['資料庫', '數據庫'], ['資料集', '數據集'], ['快速鍵', '快捷鍵'],
  ['全螢幕', '全屏'], ['解壓縮', '解壓'], ['位元組', '字節'], ['記憶體', '內存'],
  ['資料夾', '文件夾'], ['網路', '網絡'], ['資訊', '信息'], ['螢幕', '屏幕'],
  ['檔案', '文件'], ['預設', '默認'], ['設定', '設置'], ['選單', '菜單'],
  ['視窗', '窗口'], ['連結', '鏈接'], ['登入', '登錄'], ['帳號', '賬號'],
  ['搜尋', '搜索'], ['支援', '支持'], ['匯出', '導出'], ['匯入', '導入'],
  ['資料', '數據'], ['頻寬', '帶寬'], ['變數', '變量'], ['物件', '對象'],
  ['座標', '坐標'], ['拖曳', '拖動'], ['點選', '點擊'], ['游標', '光標'],
  ['清單', '列表'], ['套用', '應用'], ['重設', '重置'], ['儲存', '保存'],
  ['自訂', '自定義'], ['載入', '加載'], ['圖示', '圖標'], ['貼上', '粘貼'],
  ['剪下', '剪切'], ['影片', '視頻'], ['音訊', '音頻'], ['連線', '連接'],
  ['線上', '在線'], ['即時', '實時'], ['精確度', '精度'], ['品質', '質量'],
  ['軟體', '軟件'], ['硬體', '硬件'], ['滑鼠', '鼠標'], ['程式', '程序'],
  ['介面', '界面'], ['專案', '項目'], ['智慧型', '智能'], ['位元', '比特'],
  ['迴圈', '循環'], ['函式', '函數'], ['陣列', '數組'], ['效能', '性能'],
  ['相容', '兼容'], ['當機', '崩潰'], ['字型', '字體'], ['列印', '打印'],
  /* map & science */
  ['圖磚', '瓦片'], ['圖資', '地圖數據'], ['取樣', '採樣'],
  ['報導', '報道'], ['觀光', '旅遊'], ['公尺', '米'], ['公分', '厘米'], ['浬', '海里'],
  ['太空人', '宇航員'],
  /* ══ (#R322) PROPER NOUNS THE TWO READERSHIPS TRANSLITERATE DIFFERENTLY ═══════════════════════
     A transliteration is not an orthography, so the character map cannot reach it: 西發里亞 and
     威斯特伐利亞 are different SYLLABLE choices for «Westphalia», and converting the characters of
     the first gives 西发里亚 — a spelling a mainland reader has never seen. OpenCC already carries
     the common ones (拿破崙→拿破仑, 蘇伊士→苏伊士, 哥倫布→哥伦布); these are the ones it does not,
     found by reading this round's 262 new Chinese strings against their generated Simplified.
     ⚠ THE RIGHT-HAND SIDE IS TRADITIONAL, like every other row here — the character map runs after
     this table, so a cell states a WORD choice and never an orthography.
     ⚠ AND THE LEFT-HAND SIDE MUST NOT BE A WORD THE UI ALSO USES. 「複製」 is Taiwan's word for
     cloning AND the ordinary word for «copy»: MEASURED, it is on 19 lines of ui.zh.js and 18 of
     them are the Copy button, the copy-coordinates menu item, 「已複製」… A blanket 複製→克隆 would
     have relabelled every one of them «clone». The entry is 複製羊 instead — Dolly, and nothing
     else. Every other left-hand side here was checked the same way and occurs only in its event. */
  ['西發里亞', '威斯特伐利亞'], ['布列敦森林', '布雷頓森林'], ['西盤半島', '韋斯特普拉特'],
  ['全球資訊網', '萬維網'], ['柏內茲-李', '伯納斯-李'], ['史普尼克', '斯普特尼克'],
  ['塞拉耶佛', '薩拉熱窩'], ['車諾比', '切爾諾貝利'], ['盤尼西林', '青黴素'],
  ['突尼西亞', '突尼斯'], ['卡斯楚', '卡斯特羅'], ['聖母峰', '珠穆朗瑪峰'],
  ['鐵達尼', '泰坦尼克'], ['紐奧良', '新奧爾良'], ['卡崔娜', '卡特里娜'],
  ['甘迺迪', '肯尼迪'], ['格達費', '卡扎菲'], ['福克蘭', '馬爾維納斯'],
  ['太空梭', '航天飛機'], ['鄂圖曼', '奧斯曼'], ['盧安達', '盧旺達'],
  ['哈瑪斯', '哈馬斯'], ['希拉瑞', '希拉里'], ['尼克森', '尼克松'],
  ['複製羊', '克隆羊'], ['曼菲斯', '孟菲斯'], ['韓戰', '朝鮮戰爭'],
  ['金恩', '馬丁·路德·金'], ['蓋達', '基地'], ['華生', '沃森'],
  ['川普', '特朗普'], ['康邊', '貢比涅'], ['桃莉', '多莉'],
  ['韋伯', '韋布'], ['加薩', '加沙'], ['飛彈', '導彈'], ['日圓', '日元'],
  /* place names */
  ['玻里尼西亞', '波利尼西亞'], ['紐西蘭', '新西蘭'],
  /* the aspect marker — everything not pinned above */
  ['著', '着'],
];

/* ── ③ TRADITIONAL → SIMPLIFIED CHARACTERS ───────────────────────────────────────────────────────
   ⚠⚠⚠ (#R251) THIS WAS 440 HAND-TYPED PAIRS, AND IT COVERED 439 OF THE 1,529 HAN CHARACTERS
   ui.zh.js ACTUALLY USES. Everything outside it passed through unchanged, so the SIMPLIFIED file
   shipped Traditional characters inside Simplified sentences — 「烏克蘭前线」, 「貪腐指标」,
   「紐芬蘭自治领」, 「制藥生产基地」, 「樹木覆盖」, 「苔蘚与地衣」 — for as long as the table has
   existed. Nobody forgot anything: a hand-maintained character map has no way to say what it is
   MISSING, so each round added the characters that round happened to introduce and the gap grew in
   silence. That is [[intmap-recurring-lessons]] G in its purest form, and the same defect this
   round found in the translation instruments — a table of ours standing in for a published fact.

   ⚠ SO THE CHARACTERS ARE NOT OUR TABLE ANY MORE. OpenCC is the reference implementation of Han
   orthography conversion; opencc-js is its pure-JS port, and it is a BUILD-TIME devDependency —
   nothing new ships to the browser, because this script runs at build time and writes a file.
   `tw → cn` is the ORTHOGRAPHY, and it resolves every one-to-many case this file used to pin by
   hand: 著名 keeps 著, 着色 takes 着, 乾坤 keeps 乾, 乾燥 takes 干. That is precisely the knowledge
   the ⚠ notes above describe as the hard part, and it is published data.

   ⚠ NOT `twp`, WHICH CONVERTS THE VOCABULARY A SECOND TIME. The phrase-aware variant also rewrites
   Taiwanese TERMS into mainland ones — and the WORD table below has already done exactly that, in
   Traditional characters. Running both turned 檔案 into 文件 (the table, correctly) and then 文件
   into 文档 (OpenCC, reading our mainland word as a Taiwanese one). MEASURED: 「十年時光回溯檔案」
   came out as 「十年时光回溯文档」, and tests/r224 ④ caught it. One layer owns the vocabulary, the
   other owns the orthography.

   ⚠ THE WORD TABLE ABOVE STILL RUNS FIRST, AND STILL WINS. Those are this project's own choices
   about mainland vocabulary, reviewed one at a time over several rounds. OpenCC agrees with almost
   all of them; where the app wants a particular word regardless, the table is where that is said.
   What has been deleted is only the part that was standing in for a published mapping. */
import * as OpenCC from 'opencc-js';
const toSimplifiedChars = OpenCC.Converter({ from: 'tw', to: 'cn' });

export function toHans(text) {
  let s = String(text);
  /* ① pin. ⚠ THE SENTINEL IS TWO PRIVATE-USE CODE POINTS AROUND THE INDEX (U+E000 … U+E001), and
     they are INVISIBLE in a terminal — do not "tidy" them into empty quotes. A bare index would be
     the digit "0", and the un-pinning pass would then turn every 0 in the file into 著名. */
  const guard = PINNED.map((w, i) => [w, '' + i + '']);
  for (const [w, g] of guard) s = s.split(w).join(g);
  /* ② words, longest first so a shorter entry cannot eat a longer one's prefix */
  for (const [a, b] of [...WORDS].sort((x, y) => y[0].length - x[0].length)) s = s.split(a).join(b);
  /* unpin BEFORE the character map — the pinned words still need their own characters converting
     (顯著 → 显著), they just must not have 著 turned into 着 on the way. */
  for (const [w, g] of guard) s = s.split(g).join(w);
  /* ③ characters — OpenCC, not a table of ours (see the ⚠⚠⚠ note above) */
  return toSimplifiedChars(s);
}

const HEAD = `/* ============================================================================
 *  IntMap · UI STRINGS — zh-Hans   ⚠ GENERATED FILE — DO NOT EDIT BY HAND
 * ----------------------------------------------------------------------------
 *  「簡体を追加して。(beta)」 (#R224)
 *
 *  Produced from js/locales/ui.zh.js by scripts/zh-hans.mjs: this project’s Taiwan→mainland WORD
 *  table first (its own reviewed choices), then OpenCC twp→cn for the orthography itself (#R251 —
 *  the 440-pair map it replaced covered 439 of the 1,529 characters in use). Fix a string in
 *  ui.zh.js and re-run the script; editing
 *  this file directly is undone by the next run, and tests/r224-checks.test.mjs fails if the two
 *  ever disagree.
 *
 *      node scripts/zh-hans.mjs
 * ==========================================================================*/
`;

function build(job) {
  const src = readFileSync(resolve(ROOT, job.src), 'utf8');
  /* the body starts at the define() call — the header above replaces the source file's own */
  const at = src.indexOf(job.from);
  if (at < 0) throw new Error(job.src + ' does not start its table with ' + job.from + ')');
  /* ⚠⚠ (#R231) THE `inline` TABLE'S KEYS ARE ENGLISH SOURCE STRINGS AND MUST NOT BE CONVERTED.
     Two of them quote Japanese inside otherwise-English prose (the seismic method note cites
     気象庁「計測震度の算出方法」; the routing hint gives a Japanese example). The character map
     rewrote those quotes, so the Simplified file's key no longer equalled the string at the call
     site and both entries were dead — a translation present in the file and never used. Keys are
     therefore lifted out before the conversion and put back after. Measured: 2 of 2,068 keys, which
     is exactly the kind of small silent hole this project keeps paying for. */
  let body = src.slice(at);
  const keys = [];
  body = body.replace(/\n(\s{4})('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")(\s*:)/g, (m, ind, key, tail) => {
    keys.push(key);
    return '\n' + ind + ' K' + (keys.length - 1) + ' ' + tail;
  });
  body = toHans(body).replace(/ K(\d+) /g, (m, i) => keys[+i]);
  body = body.replace(job.from, job.to);
  return HEAD.split('UI STRINGS').join(job.what)
    .split('js/locales/ui.zh.js').join(job.src)
    .split('ui.zh.js').join(job.src.split('/').pop()) + body;
}

const CHECK = process.argv.includes('--check');
let stale = 0;
for (const job of JOBS) {
const OUT = resolve(ROOT, job.out);
const want = build(job);
if (CHECK) {
  let have = '';
  try { have = readFileSync(OUT, 'utf8'); } catch (_) {}
  /* ⚠ (#R225) COMPARE THE TEXT, NOT THE LINE ENDINGS. Git checks these files out with CRLF on
     Windows and LF on Linux, and this script writes LF — so a byte comparison called a perfectly
     current file «out of date» on one platform and not the other. What the check is for is that the
     two TABLES agree; a carriage return is not a translation. */
  const norm = (t) => String(t).split(String.fromCharCode(13)).join('');
  if (norm(have) !== norm(want)) { console.error(job.out + ' is out of date — run: node scripts/zh-hans.mjs'); stale++; }
  else console.log(job.out + ' is in sync with ' + job.src);
} else {
  writeFileSync(OUT, want);
  console.log('wrote ' + job.out + ' (' + want.length + ' chars)');
}
}
if (CHECK && stale) process.exit(1);
