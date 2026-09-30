/* ============================================================================
 *  Atlas · what the reader hands Atlas — pasted images, attached files, the viewer, and the
 *  conversation's attachment ledger (js/atlas-file-view.js, js/atlas-attach-log.js, the vision turn)
 * ----------------------------------------------------------------------------
 *  (tests-by-topic) Gathered from three round files; every test keeps the title it had there
 *  (#R773's titles, which carried no round name, now begin with «#R773»):
 *    · tests/r773-atlas-attach-preview-checks.test.mjs — preview, fold, and 「添付は会話に属する」
 *    · tests/r149-checks.test.mjs #9                   — image paste / vision wired on the client
 *    · tests/r156-checks.test.mjs #5                   — the dedicated vision pipeline
 * ==========================================================================*/
/* ============================================================================
 *  R773 — 添付ファイルのプレビュー（クリックで全画面・中身を見せる・長い本文は畳む）
 * ----------------------------------------------------------------------------
 *  ⚠ ここが測るのは**綴りではなく判断**。表かどうかを決めるのは `.csv` という名前ではなく
 *  列数の揃い方なので、検査も実際の文字列を `asTable` に食わせてその答えを見る。
 *
 *  ⚠ そして**繋がりは両側から読む**（#R493 の教訓）: チップを描くのは js/atlas-console.js、
 *  クリックを拾うのは js/atlas-attach.js で、`data-atlvid` という 1 つの綴りが両者の唯一の
 *  結び目である。片側の改名は**無言で**「押しても何も起きない」になるので、2 つのソースから
 *  その綴りを読み出して突き合わせる。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATTACH_VIEW, ATTACH_STORE, ATTACH_VIEW_CSS } from '../js/atlas-file-view.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('#R773 ① 表かどうかは中身に訊く — 名前も MIME も見ない', () => {
  const csv = 'name,pop,area\nTokyo,13960000,2194\n"Osaka, city",2691000,225\nKyoto,1464000,827';
  const t = ATTACH_VIEW.asTable(csv);
  assert.ok(t, 'CSV は表として読めなければならない');
  assert.equal(t.delim, ',');
  /* 引用符の中のカンマは区切りではない——ここが割れると列がずれる */
  assert.deepEqual(t.rows[2], ['Osaka, city', '2691000', '225']);

  /* 拡張子の無い TSV（.xlsx から起こした行もこの形） */
  assert.equal(ATTACH_VIEW.asTable('a\tb\n1\t2\n3\t4').delim, '\t');
  /* 欧州式の `;` 区切り */
  assert.equal(ATTACH_VIEW.asTable('a;b;c\n1;2;3\n4;5;6').delim, ';');

  /* ⚠ 散文は表ではない。カンマを含む文章を表にすると、読める本文が壊れたグリッドになる。 */
  const prose = '# notes\nThis is prose, with commas, and more.\nA second line without structure.';
  assert.equal(ATTACH_VIEW.asTable(prose), null);
  /* 1 行しかないものも表ではない（見出しだけの表は表ではない） */
  assert.equal(ATTACH_VIEW.asTable('a,b,c'), null);
});

test('#R773 ② JSON は整形できたことが答え（綴りではない）', () => {
  assert.equal(ATTACH_VIEW.prettyJson('{"a":[1,2]}'), '{\n  "a": [\n    1,\n    2\n  ]\n}');
  assert.equal(ATTACH_VIEW.prettyJson('name,pop\nTokyo,1'), null, 'CSV を JSON と呼ばない');
  assert.equal(ATTACH_VIEW.prettyJson('{ broken'), null);
});

test('#R773 ③ 記録は id を 1 度だけもらい、外されたら預かりを解く', () => {
  const rec = { kind: 'text', name: 'a.txt', text: 'x' };
  const a = ATTACH_STORE.put(rec);
  const b = ATTACH_STORE.put(rec);
  assert.equal(a, b, '再描画のたびに id が増えると、古いチップが開けなくなる');
  assert.equal(ATTACH_STORE.get(a), rec);
  ATTACH_STORE.drop(rec);
  assert.equal(ATTACH_STORE.get(a), null);
  assert.equal(ATTACH_STORE.put(null), '');
});

test('#R773 ④ チップとビューアの結び目は 1 つの綴り — 両側のソースから読む', () => {
  /* kept as a spelling: the chips, the viewer and the dispatch are wired inside DOM closures (js/atlas-console.js, js/atlas-attach.js) that need the page */
  const con = (read('js/atlas-console.js') + '\n' + capsSource()), att = read('js/atlas-attach.js');
  /* 描く側: 2 か所（コンポーザの行と、送信後のバブル）に id が載る */
  const written = con.match(/data-atlvid="/g) || [];
  assert.equal(written.length, 2, 'チップを描く場所が増減したら、この検査も一緒に見直す');
  /* 拾う側: 同じ綴りを dataset として読む（dataset は camelCase） */
  assert.match(att, /dataset\.atlvid/, 'クリックを拾う側が同じ綴りを読んでいない＝押しても何も起きない');
  assert.match(att, /closest\('\.atl-fchip'\)/);
  /* × は「外す」であって「開く」ではない */
  assert.match(att, /atl-fchip-x/);
  /* 送る前のサムネも開ける（送ってからしか見られない理由が無い） */
  assert.match(att, /\.atl-thumb img/);
  /* 枠は 1 本。中身を組むのはあちらのファイルで、こちらは全画面の枠を持つ */
  assert.match(att, /from '\.\/atlas-file-view\.js'/);
  assert.equal((att.match(/className = 'atl-lightbox'/g) || []).length, 1, '全画面の枠が 2 実装あってはならない');
});

test('#R773 ⑤ 畳みは「残りの量」を述べ、開閉の両方が在る', () => {
  /* kept as a spelling: the chips, the viewer and the dispatch are wired inside DOM closures (js/atlas-console.js, js/atlas-attach.js) that need the page */
  const fv = read('js/atlas-file-view.js');
  /* 押す前と押したあとで違うことを述べる文が要る（残りの量と、畳むという行き先） */
  assert.match(fv, /moreChars:/);
  assert.match(fv, /moreRows:/);
  assert.match(fv, /collapse:/);
  /* 畳みの量は実装が持つ 1 つの定数から来る（散らばった数を 2 つ持たない） */
  assert.equal(typeof ATTACH_VIEW.FOLD_CHARS, 'number');
  assert.equal(typeof ATTACH_VIEW.FOLD_ROWS, 'number');
  assert.ok(ATTACH_VIEW.FOLD_CHARS > 0 && ATTACH_VIEW.FOLD_ROWS > 0);
  /* ⚠ 畳むのは切り捨てではない——asTable は全行を返す（見せる量を決めるのは描画側）。 */
  let csv = 'a,b\n';
  for (let i = 0; i < ATTACH_VIEW.FOLD_ROWS + 50; i++) csv += i + ',' + i + '\n';
  assert.equal(ATTACH_VIEW.asTable(csv).rows.length, ATTACH_VIEW.FOLD_ROWS + 51);
});

test('#R773 ⑥ ビューアの CSS は実際に配られる（作っただけで誰も足していない、を防ぐ）', () => {
  /* kept as a spelling: the chips, the viewer and the dispatch are wired inside DOM closures (js/atlas-console.js, js/atlas-attach.js) that need the page */
  assert.match(ATTACH_VIEW_CSS, /\.atl-fv-fold\{/);
  assert.match(ATTACH_VIEW_CSS, /\.atl-fv-table\{/);
  const st = read('js/atlas-styles.js');
  assert.match(st, /import \{ ATTACH_VIEW_CSS \}/);
  assert.match(st, /\+ATTACH_VIEW_CSS/);
});

/* ── 添付は会話に属する（ターンをまたぐ台帳。#R773 後半） ───────────────────────────── */
import { ATTACH_LOG } from '../js/atlas-attach-log.js';

const LIM = { files: 8, textTotal: 400000 };
const txt = (name, text) => ({ kind: 'text', name: name, text: text, truncated: false });

test('#R773 ⑦ 前のターンのテキスト添付は、次のターンのリクエストに載る', () => {
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [], [txt('a.csv', 'x,y\n1,2')]);
  /* 2 ターン目: 添付なしで質問しても、1 ターン目のファイルが届く——ここが空だったので
     Atlas は「見られません」と答えていた（利用者の実測） */
  const carried = ATTACH_LOG.carry(2, [], LIM);
  assert.equal(carried.length, 1);
  assert.equal(carried[0].text, 'x,y\n1,2');
  /* ⚠ いつ添付されたものかを名前が述べる（今このメッセージに付いていると誤解させない） */
  assert.match(carried[0].name, /attached earlier/);
});

test('#R773 ⑧ 今のターンの添付が先、以前のものは後ろ、枠を超えたら入れない', () => {
  ATTACH_LOG.reset();
  for (let i = 0; i < 10; i++) ATTACH_LOG.remember(1, [], [txt('old' + i + '.txt', 'o')]);
  const carried = ATTACH_LOG.carry(2, [txt('now.txt', 'n')], LIM);
  assert.equal(carried[0].name, 'now.txt', '今このメッセージに付いているものが先頭');
  assert.equal(carried.length, LIM.files, 'サーバと同じ枠で切る');
  /* 新しい順に入る（古いほうから落ちる） */
  assert.match(carried[1].name, /old9\.txt/);
  /* 字数の枠 */
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [], [txt('big.txt', 'z'.repeat(300))]);
  assert.equal(ATTACH_LOG.carry(2, [], { files: 8, textTotal: 100 }).length, 0);
});

test('#R773 ⑨ 重いもの（画像・PDF）は載せず、在ることを述べ、名前で取り寄せられる', () => {
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, ['data:image/png;base64,AAA'], [{ kind: 'doc', name: 'paper.pdf', mime: 'application/pdf', b64: 'JVBER' }, txt('n.txt', 'hi')]);
  /* 毎ターン再送しない＝carry には出ない */
  const carried = ATTACH_LOG.carry(2, [], LIM);
  assert.equal(carried.length, 1);
  assert.equal(carried[0].text, 'hi');
  /* ⚠ しかし黙ってもいない。渡さないことと、在ることを黙っていることは別。 */
  const d = ATTACH_LOG.declare(2, []);
  assert.match(d, /paper\.pdf/);
  assert.match(d, /application\/pdf/);
  assert.match(d, /image/);
  assert.match(d, /attach\.recall/, 'どうすれば取り戻せるかを同じ文が述べる');
  /* 今このリクエストに載っているものは二度述べない */
  assert.equal(ATTACH_LOG.declare(2, ['paper.pdf']).indexOf('paper.pdf'), -1);
  /* 名前で取り寄せる（部分一致も可・無ければ null で、別のものを黙って返さない） */
  assert.equal(ATTACH_LOG.find(2, 'paper.pdf').b64, 'JVBER');
  assert.equal(ATTACH_LOG.find(2, 'paper').kind, 'doc');
  assert.equal(ATTACH_LOG.find(2, 'nope.pdf'), null);
  assert.ok(ATTACH_LOG.names(2).indexOf('paper.pdf') >= 0, '無い名前を渡されたとき、在る名前を言えること');
});

test('#R773 ⑩ 編集で履歴を巻き戻すと、そのターンの添付も落ちる', () => {
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [], [txt('keep.txt', 'k')]);
  ATTACH_LOG.remember(2, [], [txt('gone.txt', 'g')]);
  ATTACH_LOG.rewind(2);   /* js/atlas-console.js の rewindHist と同じ境界 */
  const carried = ATTACH_LOG.carry(3, [], LIM);
  assert.equal(carried.length, 1);
  assert.match(carried[0].name, /keep\.txt/);
});

test('#R773 ⑪ 取り寄せは実装されている — 宣言だけして繋がっていない道具を作らない', () => {
  /* kept as a spelling: the chips, the viewer and the dispatch are wired inside DOM closures (js/atlas-console.js, js/atlas-attach.js) that need the page */
  const con = (read('js/atlas-console.js') + '\n' + capsSource()), cat = read('js/atlas-catalog-text.js'), cap = read('js/atlas-capabilities.js'), sch = read('js/atlas-schemas.js');
  assert.ok(capabilityEntry('attach.recall'), 'レジストリの行（js/atlas-cap-attach.js の entry の row）');
  assert.ok(capabilityEntry('attach.recall').schema, '引数の schema（同じ entry）');
  /* ⚠ 常設の道具にはしない——毎ターン全リクエストに載る面は 12,000 字の天井を持ち、そこへ足すと
     道具の面が再びカタログになる（tests/r406-turn ②）。find_capability が返す 1 件として置く。 */
  assert.match(cat, /ids: \['attach\.recall'\]/, 'カタログの 1 件');
  assert.equal(read('js/atlas-toolsurface.js').indexOf('attach.recall'), -1, '常設ツールに置かない');
  assert.equal(capabilityEntry('attach.recall').spelling, 'recallAttachment', 'dispatch の綴り（行の 1 列目）');
  assert.ok(capabilityEntry('attach.recall').run, 'dispatch が走らせる run（監査は entry を数える）');
  /* ⚠ 取り戻したものは tool の結果テキストではなく、次のモデル呼び出しの**チャネル**に載る
     （プロンプト本文に置いた data URL は画像ではなく数十万文字の base64・#R493）。 */
  /* (#R779) 取り戻した画像はターンの画像一覧に載る。⚠ 組む場所は 1 か所で、
     `VFRAMES.urls()` が空のとき返す null はそこが受け止める（直接 .concat しない）。 */
  assert.match(con, /_atlTurnImgs\(VFRAMES\.urls\(\),_atlRecallImgs\)/);
  assert.match(con, /_atlRecallAtts\.docs\.push/);
  /* 台帳は毎ターンの入口で更新され、編集の巻き戻しと同じ境界を持つ */
  assert.match(con, /ATTACH_LOG\.remember\(turn,imgs,files\)/);
  assert.match(con, /ATTACH_LOG\.carry\(turn,files,ATL_FILE\.LIMITS\)/);
  assert.match(con, /ATTACH_LOG\.rewind\(t\)/);
  assert.match(con, /ATTACH_LOG\.declare\(_curTurn/);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R149 #9 / #R156 #5 — images reach a vision turn (formerly tests/r149-checks.test.mjs, tests/r156-checks.test.mjs)
   ⚠ spellings on purpose: run(), the paste handler and _atlVisionTurn are closure code inside
   js/atlas-console.js's factory (the whole app), and ai-proxy is a Deno TypeScript Edge Function.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
import { appSource } from './app-source.mjs';
import { capsSource, capabilityEntry } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */
const html = appSource(new URL('../', import.meta.url));   /* (#R162) index.html + css/intmap.css + js/*.js */
const aiproxy = read('supabase/functions/ai-proxy/index.ts');
test('R149 #9 image paste/vision wired on the client (transport + proxy already support images)', () => {
  assert.match(html, /let _atlImgs=\[\]/, 'pending image buffer');
  assert.match(html, /inEl\.addEventListener\('paste'/, 'paste handler on the input');
  assert.match(html, /async function _atlAddFiles\(files\)/, 'add-files helper');
  /* (#R540) THE PROPERTY IS THE 2000/0.9 TUPLE, NOT THE PARAMETER NAME. The attach path injects the
     encoder into ATL_FILE.read now, so the argument is named x; a check written against f was pinning a
     spelling that carries no meaning (#R488). tests/r540 ① evaluates what that injection DOES — an
     encoder that returns nothing must not yield an image. */
  assert.match(html, /encodeImage:\(x\)=>compressImage\(x,2000,0\.9\)/, 'the attach path still encodes at R156 hi-fi 2000/0.9 for OCR/maths (was 1100/0.72)');
  // run() takes the images the paste/attach handlers collected
  assert.match(html, /async function run\(q,imgs,files\)\{/, 'run accepts images (and R158 file attachments)');
  /* «the planner call gets imgs» removed in #R406: the planner is deleted, and that assertion had been guarding a path that could never run — `if(imgs.length){ … _atlVisionTurn … return; }` returns BEFORE the model call, so an image has never reached the planner; the pipeline the images do reach is the one asserted above. */
  assert.match(html, /class="atl-attach"/, 'attach button present');
  // server already supports vision
  assert.match(aiproxy, /const MAX_IMAGES = 4/, 'proxy caps images');
  assert.match(aiproxy, /type: "input_image"/, 'proxy forwards OpenAI input_image');
});
test('R156 #5 dedicated vision pipeline (image bypasses the map-oriented planner)', () => {
  /* kept as a spelling: the chips, the viewer and the dispatch are wired inside DOM closures (js/atlas-console.js, js/atlas-attach.js) that need the page */
  assert.match(html, /async function _atlVisionTurn\(ai, q, imgs, gen, atts\)\{/, 'dedicated vision turn');
  assert.match(html, /function _visionSYS\(\)\{/, 'vision system prompt (classify → transcribe → solve → verify → map-only-if-geo)');
  assert.match(html, /task:'vision_read',effortHint:'high',imageDetail:'high'/, 'vision call: vision_read task + high effort + detail:high');
  // run() routes images to the vision turn, NOT the generic planner
  /* ⚠ (#R540) THE PROPERTY IS THE ROUTING, AND IT IS UNCHANGED — an attached image still goes to
     this pipeline and still returns before the planner. What changed is HOW the other attachments
     ride along: #R158 concatenated their text into `q`, where ai-proxy sliced it away at
     MAX_PROMPT; they are channels now (`_atts`, merged into the same opts object the
     re-examination round reuses). A check written against the concatenation was pinning the
     defect rather than the property. */
  /* ⚠ (#R723) AND THIS CHECK HAD THE VERY SHAPE ITS OWN COMMENT WARNS ABOUT. It pinned the line
     BYTE FOR BYTE — `const aiv=bubble('a',stageDots('read'))` — so wrapping that bubble to open a
     work trace failed a routing test while the routing was untouched. What #R540 states is a
     property with three parts, and each is asked for on its own below. */
  const visionBranch = /if\(imgs\.length\)\{[\s\S]{0,600}?\breturn;\s*\}/.exec(html);
  assert.ok(visionBranch, 'run() has a branch for an attached image that returns');
  assert.match(visionBranch[0], /await _atlVisionTurn\(\s*\w+\s*,\s*q\s*,\s*imgs\s*,\s*gen\s*,\s*_atts\s*\)/,
    'it hands the image to the vision pipeline, with the files/docs channels riding along (R540)');
  assert.ok(html.indexOf(visionBranch[0]) < html.indexOf('AGENT.runTurn('),
    'and it does so BEFORE the planner, which is what 「routes to the vision turn, not the generic planner」 means');
  // ONE image re-examination round when a deterministic check fails
  assert.match(html, /\[SELF-CHECK FAILED\] Your emitted check\(s\) did NOT hold/, 'failed check triggers an image re-examination round');
  // neutral default prompt (no forced mapping)
  assert.ok(!/Describe and analyze this image, and map any real places/.test(html), 'the old forced-mapping default image prompt is gone');
  assert.match(html, /Read and analyze this image\. If it is a document, a maths\/science problem/, 'neutral default image prompt (classify first, map only if geographic)');
  // the vision prompt STRICTLY forbids places for non-geographic content
  assert.match(html, /NEVER turn a word like "Problem", "Thus", "Let", "Figure", "Theorem" or a person/, 'vision prompt forbids non-geo place fabrication');
});
