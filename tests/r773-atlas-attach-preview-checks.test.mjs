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

test('① 表かどうかは中身に訊く — 名前も MIME も見ない', () => {
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

test('② JSON は整形できたことが答え（綴りではない）', () => {
  assert.equal(ATTACH_VIEW.prettyJson('{"a":[1,2]}'), '{\n  "a": [\n    1,\n    2\n  ]\n}');
  assert.equal(ATTACH_VIEW.prettyJson('name,pop\nTokyo,1'), null, 'CSV を JSON と呼ばない');
  assert.equal(ATTACH_VIEW.prettyJson('{ broken'), null);
});

test('③ 記録は id を 1 度だけもらい、外されたら預かりを解く', () => {
  const rec = { kind: 'text', name: 'a.txt', text: 'x' };
  const a = ATTACH_STORE.put(rec);
  const b = ATTACH_STORE.put(rec);
  assert.equal(a, b, '再描画のたびに id が増えると、古いチップが開けなくなる');
  assert.equal(ATTACH_STORE.get(a), rec);
  ATTACH_STORE.drop(rec);
  assert.equal(ATTACH_STORE.get(a), null);
  assert.equal(ATTACH_STORE.put(null), '');
});

test('④ チップとビューアの結び目は 1 つの綴り — 両側のソースから読む', () => {
  const con = read('js/atlas-console.js'), att = read('js/atlas-attach.js');
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

test('⑤ 畳みは「残りの量」を述べ、開閉の両方が在る', () => {
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

test('⑥ ビューアの CSS は実際に配られる（作っただけで誰も足していない、を防ぐ）', () => {
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

test('⑦ 前のターンのテキスト添付は、次のターンのリクエストに載る', () => {
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

test('⑧ 今のターンの添付が先、以前のものは後ろ、枠を超えたら入れない', () => {
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

test('⑨ 重いもの（画像・PDF）は載せず、在ることを述べ、名前で取り寄せられる', () => {
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

test('⑩ 編集で履歴を巻き戻すと、そのターンの添付も落ちる', () => {
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [], [txt('keep.txt', 'k')]);
  ATTACH_LOG.remember(2, [], [txt('gone.txt', 'g')]);
  ATTACH_LOG.rewind(2);   /* js/atlas-console.js の rewindHist と同じ境界 */
  const carried = ATTACH_LOG.carry(3, [], LIM);
  assert.equal(carried.length, 1);
  assert.match(carried[0].name, /keep\.txt/);
});

test('⑪ 取り寄せは実装されている — 宣言だけして繋がっていない道具を作らない', () => {
  const con = read('js/atlas-console.js'), cat = read('js/atlas-catalog-text.js'), cap = read('js/atlas-capabilities.js'), sch = read('js/atlas-schemas.js');
  assert.match(cap, /'attach\.recall'/, 'レジストリの行');
  assert.match(sch, /'attach\.recall':/, '引数の schema');
  /* ⚠ 常設の道具にはしない——毎ターン全リクエストに載る面は 12,000 字の天井を持ち、そこへ足すと
     道具の面が再びカタログになる（tests/r406-turn ②）。find_capability が返す 1 件として置く。 */
  assert.match(cat, /ids: \['attach\.recall'\]/, 'カタログの 1 件');
  assert.equal(read('js/atlas-toolsurface.js').indexOf('attach.recall'), -1, '常設ツールに置かない');
  assert.match(con, /^ {8}case 'recallAttachment':/m, 'dispatch の case（監査はインデント 8 で数える）');
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
