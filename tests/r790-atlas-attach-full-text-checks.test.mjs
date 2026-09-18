/* ============================================================================
 *  R790 — 添付ファイルは、長すぎても全文が Atlas に届く
 * ----------------------------------------------------------------------------
 *  利用者の実測:「Atlas に添付したファイルは、長すぎると先頭部分しか読み込んでくれない」。
 *
 *  ⚠ 原因は js/atlas-attach.js の textDesc() が、読み取った時点で LIMITS.textPerFile
 *  （120,000 字）を超える分をその場で `slice` して捨てていたこと。捨てた文字列はどこにも
 *  残らないので、#R773 が作った `attach.recall`（一度捨てたはずの添付を取り戻す道具）を
 *  呼んでも、台帳（js/atlas-attach-log.js）に載っていたのは同じ切り詰め済みの先頭だけだった
 *  ——取り寄せが「もう捨てたものを取り寄せる」という、届きようのない依頼になっていた。
 *
 *  直したのは 1 点: 読み取り時には切らず全文を保つ。切るのは送るとき（毎ターン自動で載る
 *  1 窓ぶん）だけにし、続きは `attach.recall` に offset を付けて呼ばせる——画像と PDF が
 *  「全部持っているが送るのは要求されたときだけ」なのと同じ形。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { ATL_FILE } from '../js/atlas-attach.js';
import { ATTACH_LOG } from '../js/atlas-attach-log.js';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');

const LIM = ATL_FILE.LIMITS;
const fileOf = (name, bytes, type) => new File([bytes], name, { type: type || '' });

/* ── 最小の ZIP を自分で組む（本物のバイト構造で「読み取りにくい形式」を作る #R505 の作法）。
   method=0（無圧縮）で足りる——zipOpen() は CRC を検証しないので、実物のバイトである必要は
   構造だけで、圧縮まで本物にする必要はない。 ─────────────────────────────────────────── */
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n & 0xffff, 0); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; }
function buildZip(entries) {
  let offset = 0; const locals = [], centrals = [];
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const dataBuf = Buffer.from(e.data, 'utf8');
    const local = Buffer.concat([
      u32(0x04034B50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(dataBuf.length), u32(dataBuf.length),
      u16(nameBuf.length), u16(0), nameBuf, dataBuf,
    ]);
    centrals.push(Buffer.concat([
      u32(0x02014B50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(dataBuf.length), u32(dataBuf.length),
      u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), nameBuf,
    ]));
    locals.push(local);
    offset += local.length;
  }
  const localBuf = Buffer.concat(locals), centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054B50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralBuf.length), u32(localBuf.length), u16(0),
  ]);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

test('① ATL_FILE.read() は 1 ファイルの全文を保つ — 末尾は読み取り時に捨てない', async () => {
  const big = 'r790-full-text-'.repeat(12000);   /* LIM.textPerFile(120,000) を大きく超える */
  assert.ok(big.length > LIM.textPerFile);
  const rec = await ATL_FILE.read(fileOf('big.txt', Buffer.from(big, 'utf8'), 'text/plain'), {});
  assert.equal(rec.kind, 'text');
  assert.equal(rec.text.length, big.length, '読み取った時点で切られている＝取り寄せても戻らない');
  assert.equal(rec.text, big, '一部が入れ替わっていないか（slice の境界ミスの検出）');
  assert.equal(rec.truncated, true, '送るときには窓で切られることは、読者への表示のために引き続き分かる');
});

test('② 120,000 字ちょうどの短いファイルは truncated を立てない（境界）', async () => {
  const exact = 'z'.repeat(LIM.textPerFile);
  const rec = await ATL_FILE.read(fileOf('exact.txt', Buffer.from(exact, 'utf8'), 'text/plain'), {});
  assert.equal(rec.text.length, LIM.textPerFile);
  assert.equal(rec.truncated, false);
});

test('③ ATTACH_LOG.carry() は先頭 1 窓だけを送るが、台帳は全文を持ち続ける', async () => {
  const full = 'a'.repeat(LIM.textPerFile + 54321);
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [], [{ kind: 'text', name: 'huge.txt', text: full }]);

  const carried = ATTACH_LOG.carry(2, [], LIM);
  assert.equal(carried.length, 1);
  assert.equal(carried[0].text.length, LIM.textPerFile, '自動で送る量はこれまでどおり 1 窓ぶん');
  assert.equal(carried[0].text, full.slice(0, LIM.textPerFile));
  assert.equal(carried[0].truncated, true);

  /* ⚠ ここが直った点そのもの: 送った量とは別に、台帳自身は全文を持っている */
  const found = ATTACH_LOG.find(2, 'huge.txt');
  assert.ok(found, '台帳が名乗った名前で取り寄せられなければ、取り寄せに意味が無い');
  assert.equal(found.text.length, full.length, '台帳が保持する記録が既に切られていたら、recall は捨てたものを取り寄せることになる');
  assert.equal(found.text, full);
});

test('④ ATTACH_LOG.page() の窓を offset で送り足すと、元の全文にちょうど戻る', () => {
  const full = Array.from({ length: 400 }, (_, i) => String(i).padStart(6, '0')).join('-');   /* 位置が分かる目印つきの文字列 */
  const rec = { kind: 'text', name: 'seq.txt', text: full };
  const per = 500;   /* 全文よりだいぶ小さい窓で、複数回の取り寄せを強制する */
  assert.ok(full.length > per * 3, 'この検査は複数回の取り寄せが要る長さで組まれている前提');

  let offset = 0, assembled = '', guard = 0;
  while (true) {
    const w = ATTACH_LOG.page(rec, offset, per);
    assert.ok(w.text.length <= per);
    assembled += w.text;
    assert.equal(w.total, full.length);
    if (!w.more) { assert.equal(w.next, full.length); break; }
    offset = w.next;
    if (++guard > 1000) throw new Error('page() が終端に達しない — more の判定を疑う');
  }
  assert.equal(assembled, full, '窓を順につなげると元の全文と一字も違わない');
});

test('⑤ page() は範囲外・負の offset を全文の内側へ丸める（読者の入力を信じない）', () => {
  const rec = { kind: 'text', name: 'x.txt', text: 'abcdef' };
  assert.equal(ATTACH_LOG.page(rec, -50, 3).offset, 0);
  const past = ATTACH_LOG.page(rec, 999, 3);
  assert.equal(past.text, '');
  assert.equal(past.more, false);
});

test('⑥ 汎用 ZIP コンテナは、旧・毎ターン予算（120,000 字）で抽出そのものを止めない', async () => {
  const per = LIM.textPerFile;
  const chunkLen = Math.floor(per * 0.7);   /* 2 件で per を確実に超える組み合わせ */
  const zipBytes = buildZip([
    { name: 'part-1.txt', data: 'A'.repeat(chunkLen) },
    { name: 'part-2.txt', data: 'B'.repeat(chunkLen) },
  ]);
  const rec = await ATL_FILE.read(fileOf('bundle.zip', zipBytes, 'application/zip'), {});
  assert.equal(rec.kind, 'text', '既知の拡張子を持たない ZIP も、部品がテキストなら text になる');
  assert.ok(rec.text.includes('A'.repeat(chunkLen)), '1 件目の部品は全量抽出される');
  assert.ok(rec.text.includes('B'.repeat(chunkLen)), '2 件目の部品も全量抽出される — 旧予算は 1 件目の途中で止めていた');
  assert.ok(rec.text.length > per, '抽出そのものは毎ターン送信予算より大きく行われている');
});

test('⑦ attach.recall のスキーマは任意の offset を許す（無ければ拒否されて続きが読めない）', () => {
  const SCHEMAS = makeAtlasSchemas();
  const sc = SCHEMAS.schemaFor('attach.recall');
  assert.ok(sc && sc.properties && sc.properties.offset, 'offset が宣言されていないと、その引数を渡した呼び出しは拒否される');
  assert.deepEqual(sc.required, ['name'], 'offset は任意のまま — 先頭窓の取り寄せに offset は要らない');
});
