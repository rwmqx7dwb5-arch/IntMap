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
const SRC = resolve(ROOT, 'js/locales/ui.zh.js');
const OUT = resolve(ROOT, 'js/locales/ui.zh-hans.js');

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
  /* the aspect marker — everything not pinned above */
  ['著', '着'],
];

/* ── ③ TRADITIONAL → SIMPLIFIED CHARACTERS ───────────────────────────────────────────────────────
   Only characters that actually DIFFER, and only the ones this app's strings contain (plus the ones
   the word table above can introduce). Pairs, T then S. A one-to-many character never appears here;
   it is resolved in ② while its context is still readable. */
export const CHARS = (
  '並并亞亚來来個个們们偵侦備备傳传傷伤傾倾僅仅價价儀仪億亿優优儲储兩两冊册別别刪删剛刚劃划劇剧劑剂' +
  '動动務务勢势勻匀區区協协參参員员問问啟启嗎吗嘯啸嚴严國国圍围園园圓圆圖图團团執执堅坚報报場场塊块' +
  '墜坠壓压壩坝壽寿夠够夥伙奧奥學学實实寧宁寫写寬宽將将專专尋寻對对導导層层屬属島岛帳帐帶带幣币幫帮' +
  '幹干幾几庫库廠厂廣广廳厅張张強强彈弹彎弯彙汇後后徑径從从復复恆恒態态慣惯憑凭應应戰战戲戏拋抛捲卷' +
  '掃扫採采換换損损擇择擊击擋挡據据擬拟擴扩擷撷擾扰攝摄敗败敘叙數数斷断於于時时晝昼暫暂曆历會会東东' +
  '桿杆條条業业極极構构樂乐標标樣样橢椭橫横機机檔档檢检檻槛欄栏權权歐欧歡欢歷历歸归殘残殼壳毀毁氣气' +
  '決决沒没沖冲況况洩泄淨净淺浅減减測测準准溫温滾滚滿满漸渐潰溃濕湿濟济濾滤瀏浏灣湾災灾為为無无煙烟' +
  '熱热燈灯燒烧營营爭争爾尔狀状獄狱獨独現现環环產产畫画異异當当疊叠療疗發发盡尽監监盤盘眾众確确碼码' +
  '磚砖礙碍稜棱種种稱称積积穩稳窪洼筆笔節节範范築筑篩筛簡简紀纪約约紅红純纯級级細细終终組组結结絕绝' +
  '給给統统經经綠绿維维網网緊紧緒绪線线緣缘編编緩缓緯纬緻致縣县縮缩總总繞绕繪绘繫系繼继續续纜缆羅罗' +
  '義义聞闻聯联膠胶與与艙舱蒐搜蓋盖藍蓝蘊蕴處处虛虚號号螢萤衛卫衝冲補补裡里製制複复見见規规視视親亲' +
  '覺觉覽览觀观觸触訂订計计訊讯討讨記记訪访設设許许訴诉註注評评詢询試试話话該该詳详認认語语誤误說说' +
  '誰谁調调請请論论諾诺證证識识譜谱譯译議议護护讀读變变讓让負负貨货買买費费貼贴貿贸資资質质購购賽赛' +
  '贊赞趨趋跡迹蹤踪躍跃車车軌轨軍军軟软軸轴較较載载輕轻輪轮輯辑輸输輻辐轉转農农迴回這这連连週周進进' +
  '遊游運运過过達达遙遥遞递遠远適适選选還还邊边邏逻鄰邻醫医釋释釘钉鈕钮銀银銫铯錄录錨锚錯错鍵键鎖锁' +
  '鎮镇鏈链鏡镜鐘钟鐵铁鑰钥鑲镶長长門门閉闭開开間间閱阅闊阔關关陣阵陰阴陸陆陽阳階阶際际隨随險险隱隐' +
  '雙双雜杂離离難难雲云電电霧雾靈灵靜静響响頁页頂顶項项順顺預预領领頭头頻频顆颗題题額额顏颜願愿類类' +
  '顧顾顯显風风飛飞餘余饋馈馬马駐驻駛驶驅驱驗验髒脏體体麥麦麼么黃黄點点齊齐齡龄佈布佔占併并側侧係系' +
  '內内則则匯汇乾干絡络賬账戶户'
);

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
  /* ③ characters */
  const map = new Map();
  for (let i = 0; i + 1 < CHARS.length; i += 2) map.set(CHARS[i], CHARS[i + 1]);
  let out = '';
  for (const ch of s) out += map.get(ch) || ch;
  return out;
}

const HEAD = `/* ============================================================================
 *  IntMap · UI STRINGS — zh-Hans   ⚠ GENERATED FILE — DO NOT EDIT BY HAND
 * ----------------------------------------------------------------------------
 *  「簡体を追加して。(beta)」 (#R224)
 *
 *  Produced from js/locales/ui.zh.js by scripts/zh-hans.mjs: the Taiwan→mainland WORD table first
 *  (網路→网络, 資訊→信息, 螢幕→屏幕, 檔案→文件, 預設→默认, 選單→菜单, 使用者→用户 …), then the
 *  Traditional→Simplified character map. Fix a string in ui.zh.js and re-run the script; editing
 *  this file directly is undone by the next run, and tests/r224-checks.test.mjs fails if the two
 *  ever disagree.
 *
 *      node scripts/zh-hans.mjs
 * ==========================================================================*/
`;

function build() {
  const src = readFileSync(SRC, 'utf8');
  /* the body starts at the define() call — the header above replaces ui.zh.js's own */
  const at = src.indexOf("window.IntMapLang.define('zh'");
  if (at < 0) throw new Error('ui.zh.js does not start its table with define(\'zh\')');
  const body = toHans(src.slice(at)).replace("window.IntMapLang.define('zh'", "window.IntMapLang.define('zh-hans'");
  return HEAD + body;
}

const want = build();
if (process.argv.includes('--check')) {
  let have = '';
  try { have = readFileSync(OUT, 'utf8'); } catch (_) {}
  /* ⚠ (#R225) COMPARE THE TEXT, NOT THE LINE ENDINGS. Git checks these files out with CRLF on
     Windows and LF on Linux, and this script writes LF — so a byte comparison called a perfectly
     current file «out of date» on one platform and not the other. What the check is for is that the
     two TABLES agree; a carriage return is not a translation. */
  const norm = (t) => String(t).split(String.fromCharCode(13)).join('');
  if (norm(have) !== norm(want)) { console.error('js/locales/ui.zh-hans.js is out of date — run: node scripts/zh-hans.mjs'); process.exit(1); }
  console.log('ui.zh-hans.js is in sync with ui.zh.js');
} else {
  writeFileSync(OUT, want);
  console.log('wrote js/locales/ui.zh-hans.js (' + want.length + ' chars)');
}
