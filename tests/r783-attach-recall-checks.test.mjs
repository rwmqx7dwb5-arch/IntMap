/* ============================================================================
 *  R783 — 添付の「取り寄せ」を、読んで確かめるのではなく**走らせて**確かめる
 * ----------------------------------------------------------------------------
 *  #R773 は台帳（js/atlas-attach-log.js）と能力 `attach.recall` を作り、テキストが
 *  ターンをまたいで残ることを実測した。残っていたのは**取り寄せの経路**で、そこは Atlas が
 *  必要と判断したときだけ通るので、本番では一度も通っていない（回答にはログインが要る）。
 *
 *  ⚠ だからここは綴りを読まない。**実バイト**（本物の %PDF- と本物の PNG）を
 *  `ATL_FILE.read` に食わせ、返った記録を台帳に載せ、`find` が返したものを**復号して
 *  元のバイトと突き合わせる**。「名前が残っている」と「中身が戻ってくる」は別の事実で、
 *  #R773 が測ったのは前者だけだった（memory: intmap-edge-function-must-be-evaluated —
 *  ソースを読む検査は評価順序も実際の答えも見られない）。
 *
 *  ⚠ ここが測れないのは 1 つだけ: **モデルが本当に取り寄せを選ぶか**。それは Atlas の判断で
 *  あり（CONSTITUTION.md §5）、判断を検査で固定してはならない。取り寄せ**が起きたとき**に
 *  中身が次の一手の目の前に載ることは tests/r783-attach-recall.spec.js が実物の経路で測る。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { ATL_FILE } from '../js/atlas-attach.js';
import { ATTACH_LOG } from '../js/atlas-attach-log.js';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');

const LIM = ATL_FILE.LIMITS;

/* ── 実バイト。どちらも「その形式である」ことを署名で名乗るものそのもの ────────────────── */
/* 最小の、構造として本物の PDF（ISO 32000-1 の骨格。%PDF- 署名と trailer と %%EOF を持つ） */
const PDF_BYTES = Buffer.from(
  '%PDF-1.7\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
  + '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n'
  + 'trailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');
/* 1×1 の本物の PNG（署名・IHDR・IDAT・IEND。canvas に描けるものでなければ #R540 は image と
   答えない——だから「画像として扱われるか」を綴りではなくバイトで訊ける） */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64');

const fileOf = (name, bytes, type) => new File([bytes], name, { type: type || '' });
/* ⚠ canvas はこのモジュールが自分で供給できない唯一の能力なので、呼び出し元が注入する契約
   （js/atlas-attach.js の read() の見出し）。ここが注入するのは**本物の PNG を返す符号化器**で、
   ブラウザの canvas が同じ場所でするのと同じこと——返り値の形は read() が検証する。 */
const encodeImage = async (f) => 'data:image/png;base64,' + Buffer.from(await f.arrayBuffer()).toString('base64');

const b64bytes = (s) => Buffer.from(String(s || ''), 'base64');
const dataUrlBytes = (u) => b64bytes(String(u || '').replace(/^data:[^,]*,/, ''));

test('① PDF は取り寄せで**中身が戻る** — 名前ではなくバイトを突き合わせる', async () => {
  const rec = await ATL_FILE.read(fileOf('paper.pdf', PDF_BYTES, 'application/pdf'), {});
  assert.equal(rec.kind, 'doc', '%PDF- 署名を持つバイトは文書チャネルのもの');
  assert.equal(rec.mime, ATL_FILE.DOC_MIME);

  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [], [rec]);
  /* 次のターン: 載っていないが、在ることは述べられている */
  ATTACH_LOG.carry(2, [], LIM);
  assert.match(ATTACH_LOG.declare(2, []), /paper\.pdf \(application\/pdf\)/);

  const got = ATTACH_LOG.find(2, 'paper.pdf');
  assert.ok(got, '述べた名前で取り寄せられなければ、述べたことに意味が無い');
  /* ⚠ ここが「中身が戻る」の全部。b64 が欠けていても truncate されていても declare は同じ文を書く */
  assert.ok(b64bytes(got.b64).equals(PDF_BYTES), '取り寄せた PDF が元のバイトと一致しない');
  /* そして次の一手が積む先（js/atlas-console.js の recallAttachment）が要求する欄が揃っている */
  assert.equal(typeof got.name, 'string');
  assert.equal(got.mime, 'application/pdf');
});

test('② 画像も取り寄せで**中身が戻る** — data URL を復号して元の PNG と突き合わせる', async () => {
  const rec = await ATL_FILE.read(fileOf('shot.png', PNG_BYTES, 'image/png'), { encodeImage });
  assert.equal(rec.kind, 'image', '符号化器が raster を返したものだけが image');

  ATTACH_LOG.reset();
  /* js/atlas-console.js は画像を data URL の文字列でしか渡さない（台帳が最小の記録に包む） */
  ATTACH_LOG.remember(1, [rec.dataUrl], []);
  ATTACH_LOG.carry(2, [], LIM);
  const d = ATTACH_LOG.declare(2, []);
  assert.match(d, /image-1 \(image\)/, '画像は種別を名乗る（文書チャネルと別の道に載るから）');

  const got = ATTACH_LOG.find(2, 'image-1');
  assert.ok(got && got.kind === 'image');
  assert.ok(dataUrlBytes(got.dataUrl).equals(PNG_BYTES), '取り寄せた画像が元のバイトと一致しない');
});

test('③ 取り寄せの失敗は失敗として返る — 別のものを黙って返さない', async () => {
  const pdf = await ATL_FILE.read(fileOf('paper.pdf', PDF_BYTES, 'application/pdf'), {});
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [], [pdf]);

  /* ⚠ 「確認できなかった」を成功にしないための唯一の条件: 名前が違えば null であって、
     たまたま 1 件しか無いからそれを返す、ではない（memory: 推測は拒否より悪い）。 */
  assert.equal(ATTACH_LOG.find(2, 'nope.pdf'), null);
  assert.equal(ATTACH_LOG.find(2, 'report'), null);
  assert.equal(ATTACH_LOG.find(2, ''), null, '名前を渡し忘れた呼び出しは成功ではない');
  assert.equal(ATTACH_LOG.find(2, null), null);
  /* そして失敗のときに読み手（モデル）へ渡せる事実を台帳が持っている＝「在るのはこれ」 */
  assert.deepEqual(ATTACH_LOG.names(2), ['paper.pdf']);

  /* ⚠ 「台帳が空」と「その名前が無い」は違う失敗で、違う文になる（names が空か否か）。 */
  ATTACH_LOG.reset();
  assert.equal(ATTACH_LOG.find(2, 'paper.pdf'), null);
  assert.deepEqual(ATTACH_LOG.names(2), []);
});

test('④ 二度目の取り寄せは同じ答えを返す（冪等）— 台帳は呼ばれて変わらない', async () => {
  const pdf = await ATL_FILE.read(fileOf('paper.pdf', PDF_BYTES, 'application/pdf'), {});
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [pdf.b64 ? 'data:image/png;base64,' + PNG_BYTES.toString('base64') : ''], [pdf]);
  const a = ATTACH_LOG.find(2, 'paper.pdf'), b = ATTACH_LOG.find(2, 'paper.pdf');
  assert.equal(a, b, '同じ引数で違う記録が返るなら、二度目は一度目と違うことをしている');
  assert.deepEqual(ATTACH_LOG.names(2).slice().sort(), ['image-1', 'paper.pdf']);
  /* declare も冪等（取り寄せても台帳からは消えない——同じ会話で何度でも要求できる） */
  ATTACH_LOG.carry(2, [], LIM);
  assert.equal(ATTACH_LOG.declare(2, []), ATTACH_LOG.declare(2, []));
  /* ⚠ 「もう済んでいる」と述べるのはターンの層（js/atlas-agent.js の doneCalls）で、
     台帳の仕事は**二度目が一度目と違う結果にならないこと**。その宣言のほうは
     tests/r783-attach-recall.spec.js が実際のターンで測る（.agents/rules/one-pass-or-a-reason.md §2 の 3）。 */
});

test('⑤ モデルに見せた名前で取り寄せられる — 台帳が自分で足した札を自分で外す', () => {
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [], [{ kind: 'text', name: 'a.csv', text: 'x,y\n1,2' }]);
  const shown = ATTACH_LOG.carry(2, [], LIM)[0].name;
  assert.notEqual(shown, 'a.csv', 'いつ添付されたかを名前が述べる（#R773）');
  /* ⚠ 実測された欠陥: モデルがそのファイルについて知る唯一の名前がこれで、これを渡した
     取り寄せは null を返していた＝見せられた名前で頼むと必ず失敗する取り寄せだった。 */
  const got = ATTACH_LOG.find(2, shown);
  assert.ok(got, '台帳が見せた名前が、台帳の取り寄せに通らない');
  assert.equal(got.name, 'a.csv');
  /* 語として名前が現れる言い方も通る。⚠ ただし境界は元の文字列で見る——
     image-1 は image-12 の部分列だが別のファイルである。 */
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, ['data:image/png;base64,AAA'], []);
  for (let i = 0; i < 11; i++) ATTACH_LOG.remember(1, ['data:image/png;base64,BBB'], []);
  assert.equal(ATTACH_LOG.find(2, 'image-1').dataUrl, 'data:image/png;base64,AAA');
  assert.equal(ATTACH_LOG.find(2, 'image-12').dataUrl, 'data:image/png;base64,BBB');
  assert.equal(ATTACH_LOG.find(2, 'please reopen image-12').dataUrl, 'data:image/png;base64,BBB',
    '語として名前を含む問い合わせが外れる');
});

test('⑥ 画像の名前は一意で、同名が 2 件できない（片方が取り寄せ不能になる）', () => {
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, ['data:image/png;base64,A', 'data:image/png;base64,B'], []);
  ATTACH_LOG.remember(2, ['data:image/png;base64,C'], []);
  const names = ATTACH_LOG.names(2);
  assert.equal(names.length, 3);
  assert.equal(new Set(names).size, 3, '同名が 2 件在ると、古いほうは永久に取り寄せられない');
  /* 実測されていた欠陥: 名前を `log.length + i + 1` で作っていたので 1 通 2 枚が image-1/image-3
     になり、次のターンの 1 枚目がまた image-3 になった。1 枚ずつ番号が進むのが名前の意味。 */
  assert.deepEqual(names.slice().sort(), ['image-1', 'image-2', 'image-3']);
  assert.equal(ATTACH_LOG.find(3, 'image-1').dataUrl, 'data:image/png;base64,A');
  assert.equal(ATTACH_LOG.find(3, 'image-3').dataUrl, 'data:image/png;base64,C');
});

test('⑦ 台帳に在るものは、載るか述べられるかのどちらかである（黙って落ちない）', async () => {
  const pdf = await ATL_FILE.read(fileOf('paper.pdf', PDF_BYTES, 'application/pdf'), {});
  ATTACH_LOG.reset();
  /* 混ぜて、枠を絞る。⚠ 実測: 以前のターンのテキスト 10 件のうち carry が載せたのは 8 件で、
     残る 2 件は carry も declare も述べなかった——読者が添付したものがモデルにとって存在しない
     という、#R773 が直したはずの形が枠の下に残っていた。 */
  for (let i = 0; i < 10; i++) ATTACH_LOG.remember(1, [], [{ kind: 'text', name: 't' + i + '.txt', text: 'x'.repeat(50) }]);
  ATTACH_LOG.remember(1, ['data:image/png;base64,AAA'], [pdf]);
  const inLedger = ATTACH_LOG.names(1);
  assert.equal(inLedger.length, 12);

  const sent = ['now.txt'];
  const carried = ATTACH_LOG.carry(2, [{ kind: 'text', name: 'now.txt', text: 'n' }], { files: 8, textTotal: 400 });
  const declared = ATTACH_LOG.declare(2, sent);
  /* 載った名前（札を外して台帳の名前に戻す）と、述べられた名前の和集合 */
  const front = new Set(carried.map((f) => f.name.replace(/ \(attached earlier in this conversation\)$/, '')));
  const missing = inLedger.filter((n) => !front.has(n) && declared.indexOf(n) < 0 && sent.indexOf(n) < 0);
  assert.deepEqual(missing, [], '台帳に在るのに、載りもせず述べられもしないもの');
  /* 述べられたものは取り寄せられる（述べるだけで届かない道を作らない） */
  inLedger.filter((n) => declared.indexOf(n) >= 0).forEach((n) => {
    assert.ok(ATTACH_LOG.find(2, n), n + ' は述べられたのに取り寄せられない');
  });
  /* 枠で落ちたテキストは、落ちたことが分かる形で述べられる（画像・PDF と同じ顔にしない） */
  assert.match(declared, /\(text, not included in this request\)/);
});

test('⑧ 枠の写しを持たない — 台帳が切るのは呼び出し元が渡した数そのもの', async () => {
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(1, [], [{ kind: 'text', name: 'big.txt', text: 'z'.repeat(LIM.textPerFile) }]);
  /* 総字数の枠を 1 字下回らせると入らない＝比べているのは渡された数である */
  assert.equal(ATTACH_LOG.carry(2, [], { files: 8, textTotal: LIM.textPerFile - 1 }).length, 0);
  assert.equal(ATTACH_LOG.carry(2, [], { files: 8, textTotal: LIM.textPerFile }).length, 1);
  /* そして入らなかったターンでは述べられる */
  ATTACH_LOG.carry(2, [], { files: 8, textTotal: LIM.textPerFile - 1 });
  assert.match(ATTACH_LOG.declare(2, []), /big\.txt/);
});

/* ══ そして、扉に鍵が存在するか ════════════════════════════════════════════════════════
 *  ⚠⚠⚠ この検査を書いた理由は実測である。上の①〜⑧がすべて緑で、#R773 の ⑪
 *  「取り寄せは実装されている — 宣言だけして繋がっていない道具を作らない」も緑だったのに、
 *  **本物のターンで Atlas が `attach.recall` を呼ぶと dispatch に届かなかった**:
 *  `run_capability{id:'attach.recall', args:{name:'paper.pdf'}}` が `needs_input`
 *  （「これを実行するには、もう1つ必要です。使用する値を教えてください。」）で返る。
 *
 *  `resolveInputs` は**読者に何かを出してもらう**ための門（クリックする点・打ち込む語）で、
 *  能力が的（targetPolicy）を宣言していると、その的を「持っている」と認められる欄の一覧が
 *  `hasTarget` に書かれている。`attach.recall` の的は `'text'` で、その一覧は
 *  `query/text/question/value/place/term` ——この能力が持つ唯一の引数 `name` は無い。
 *  ⇒ **自分のスキーマが許すどの呼び出しでも、自分の的を満たせない能力**が在った。
 *
 *  だからここが測るのは事例ではなく構造: **スキーマが許す呼び出しの集合と、的が受け取る
 *  集合が交わること**。交わらない能力は、どんな正しい呼び出しでも読者への質問に落ちる
 *  （＝誰も開けられない扉。memory: intmap-door-in-a-container-no-reader-opens）。
 *  ⚠ 「スキーマの required だけで的が満たされること」を測ってはならない——`sim.pandemicRun`
 *  は `days` だけを required にしつつ場所を的にしており、場所を訊くのは正しい。測るのは
 *  「宣言された欄を**全部**埋めても満たせない」ことである。
 * ==========================================================================================*/
test('⑨ 自分のスキーマが許す呼び出しで満たせない的を宣言した能力は無い（誰も開けられない扉）', () => {
  const CAPS = makeAtlasCapabilities({}), SCHEMAS = makeAtlasSchemas();
  /* 宣言された欄を、その型が許す最も素直な値で埋める（値の良さは問わない——`hasTarget` は
     「在るか」しか訊かないと自分で述べている）。 */
  const fill = (sc) => {
    const a = {};
    for (const k of Object.keys(sc.properties || {})) {
      const pr = sc.properties[k] || {};
      a[k] = pr.type === 'number' ? 1 : pr.type === 'boolean' ? true : pr.type === 'array' ? ['x']
        : pr.type === 'object' ? { x: 1 } : (Array.isArray(pr.enum) && pr.enum.length ? pr.enum[0] : 'x');
    }
    return a;
  };
  const unreachable = [], seen = [];
  for (const cap of CAPS.all()) {
    let sc = null;
    try { sc = SCHEMAS.schemaFor(cap.id); } catch (_) { sc = null; }
    if (!sc || !sc.properties || !Object.keys(sc.properties).length) continue;
    seen.push(cap.id);
    let need = null;
    try { need = cap.resolveInputs({}, fill(sc)); } catch (e) { need = { threw: (e && e.message) || 'threw' }; }
    if (need) unreachable.push(cap.id + ' (target «' + ((cap.targetPolicy && cap.targetPolicy.kind) || '?')
      + '» / schema declares ' + Object.keys(sc.properties).join(', ') + ')');
  }
  /* 母集合が縮んだら、この検査は何も見ていない（#R707 の床の分母） */
  assert.ok(seen.length > 120, '引数スキーマを持つ能力が ' + seen.length + ' 件しか見えていない');
  assert.deepEqual(unreachable, [],
    '自分のスキーマが許すどの呼び出しでも的を満たせない＝Atlas からは到達できない。'
    + '直すのは事例ではなく列: その能力のスキーマが既に的を required にしているなら、'
    + 'targetPolicy の列（js/atlas-capabilities.js の 10 列目）は空であるべきで、'
    + '門は js/atlas-schemas.js の required 1 つになる。'
    + '⚠ hasTarget の一覧に欄名を足して直してはならない——同じ的を持つ他の能力すべてで'
    + '「読者に出してもらう」の意味が緩む。');
});
