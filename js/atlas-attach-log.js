/* ============================================================================
 *  IntMap · Atlas — 添付は会話に属する（1 つのメッセージではなく）  (#R773)
 * ----------------------------------------------------------------------------
 *  利用者の実測:「ファイル類を添付したときに、のちのやりとりでそのファイルのことを話しても、
 *  『全部見れません』と返される。」
 *
 *  ⚠ これは Atlas の判断ではなく、**本当に 1 バイトも届いていなかった**。#R158/#R540 の設計では
 *  添付は `run()` のローカル変数で、そのリクエスト 1 回きり。履歴 `_hist` に入るのは利用者が
 *  打った文字列と Atlas の返答だけで、添付の名前すら残らない。だから 2 ターン目のモデルにとって
 *  「前のターンに添付があった」という事実自体が存在しなかった——**画像も PDF もテキストも共通**。
 *  方針（js/atlas-policy.js）は逆に添付を文脈として数えていて、実装がそれに追いついていなかった。
 *
 *  ここが持つのは会話 1 本ぶんの台帳で、答えるのは 2 つの問いだけ:
 *    · 今のターンに**ただで載せられる**のは何か  → `carry()`（テキストだけ。下の理由）
 *    · 今の会話に**他に何が在るか**             → `declare()`（名前と種別。取り寄せは Atlas が決める）
 *
 *  ⚠ なぜテキストだけ毎回載せ、画像と PDF は載せないのか。テキストの抽出は 1 件 120,000 字が
 *  上限で、その再送は転記の費用しかかからない。画像と PDF は 1 件 8 MB あり、毎ターン再送すると
 *  **読者が一度添付しただけのものが、会話が続くかぎり毎回課金される**。だから在ることだけを述べ、
 *  要るかどうかは Atlas が決めて取り寄せる（能力 `attach.recall`。⚠ 常設の道具にはしない——毎ターン全リクエストに載る面は 12,000 字の天井を持っていて、そこへ足すと道具の面が再びカタログになる。`find_capability` が返す 1 件として置く）——
 *  CONSTITUTION.md §5「Atlas に全権、機構は縛らない」。
 *
 *  ⚠⚠⚠ (#R790) 利用者の実測その2:「添付したファイルは、長すぎると先頭部分しか読み込んでくれない」。
 *  「120,000 字が上限」は**1 ターンに自動で載る量**のつもりだったが、js/atlas-attach.js は
 *  その字数で読み取った時点の文字列そのものを切り捨てていた——だから同じファイルを `attach.recall`
 *  で取り寄せても、返るのは同じ切り詰められた先頭で、末尾は最初から存在しなかった。今は
 *  ATL_FILE.read が全文を保つ。ここが「窓」で切るのは**送るとき**だけ（`carry` は自動で載る先頭の
 *  1 窓、`page` は `attach.recall` が offset 付きで呼ぶたびの次の窓）——画像と PDF が
 *  「全部持っているが送るのは要求されたときだけ」なのと同じ形を、テキストにも適用しただけ。
 *
 *  ⚠ 台帳はターン番号を持つ。編集（#R298 の Edit）が履歴を巻き戻すとき、**添付も一緒に巻き戻る**
 *  ——巻き戻したはずのターンの添付が残っていると、消えた質問の資料だけが会話に居座る。
 * ==========================================================================*/
/* ⚠ この台帳は「ファイルが何か」を知らない。枠（何件・何字まで）は呼び出し元が渡す
   `ATL_FILE.LIMITS` そのもので、写しを持たない——サーバ側の同じ数と食い違う写しを 3 つ目に
   作らないため。おかげでこのファイルは何も import せず、循環参照も作らない。 */
export const ATTACH_LOG = (function () {
  /* {turn, rec} の並び。rec は ATL_FILE.read が返したものそのもの（写しを作らない）。
     画像は data URL の文字列でしか渡ってこないので、ここで最小の記録に包む。 */
  let log = [];
  const CAP = 48;   /* js/atlas-console.js の _hist と同じ数。会話の記憶が 2 つの長さを持つ状態を作らない */

  /* ⚠⚠⚠ (#R783) 「前に添付された」という札の綴りは、**モデルがそのファイルについて知る唯一の名前**
     である。だから 1 か所に持ち、取り寄せ（`find`）が同じ 1 か所からそれを外す。実測: 台帳が
     モデルに見せた `a.csv (attached earlier in this conversation)` をそのまま `find` に渡すと
     `null` が返っていた——**見せられた名前で頼むと必ず失敗する**取り寄せだった。 */
  const EARLIER_TAG = ' (attached earlier in this conversation)';

  /* ⚠⚠⚠ (#R783) carry() の判定は declare() の前提である。台帳に在って carry が載せなかったものは
     画像と PDF だけではない——**テキストも枠で落ちる**（1 ターン 8 件・総計 400,000 字）。実測:
     以前のターンのテキスト 10 件のうち carry が載せたのは 8 件で、残る 2 件は carry も declare も
     述べなかった＝読者が添付したものが、モデルにとって存在しない。これは #R773 が直した
     「1 バイトも届いていなかった」と同じ形が、枠の下で残っていたということ。
     ⚠ だから carry は**そのターンについてだけ**「何を目の前に置いたか」を記録し、declare はその
     差分を述べる。turn が一致しないとき（carry を経ずに declare が呼ばれた）は差分を知らないので
     #R773 の規則（テキストは載っている前提）に戻る——知らないことを「このリクエストには無い」と
     述べるほうが悪い。 */
  let carriedTurn = -1, carriedNames = new Set();

  /* ⚠⚠⚠ (#R783) 画像の名前は**単調に増える番号**から作る。以前は `log.length + i + 1` で、
     その `log.length` を同じループが押し込みながら変えていた——1 通に 2 枚添付すると
     `image-1` と `image-3`（4 枚なら 1,3,5,7）になり、**次のターンの 1 枚目がまた `image-3`**
     になる。同名が 2 件在ると `find` は新しいほうだけを返すので、読者が最初に添付した画像は
     取り寄せ不能になる（実測）。名前は台帳が発行する識別子であって、長さの計算ではない。 */
  let imgSeq = 0;

  /** このターンに添付されたものを台帳に載せる。imgs は data URL の配列、files は read() の記録。 */
  function remember(turn, imgs, files) {
    (imgs || []).forEach((u) => { if (u) log.push({ turn: turn, rec: { kind: 'image', name: 'image-' + (++imgSeq), dataUrl: u } }); });
    (files || []).forEach((f) => { if (f) log.push({ turn: turn, rec: f }); });
    /* ⚠ 会話は終わらない（「新しい会話」でモジュールが作り直される経路はこの製品に無い）。
       台帳は会話履歴 `_hist` と同じ 48 件で頭を落とす——1 件 8 MB の PDF を無限に抱えないため。
       落ちるのは最も古いものなので、`declare()` が述べる一覧＝取り寄せられる一覧のままになる。 */
    if (log.length > CAP) log = log.slice(log.length - CAP);
  }

  /** 編集で巻き戻されたターン以降の添付を落とす（履歴の巻き戻しと同じ境界）。 */
  /* ⚠ どちらも carry の判定を無効にする（残っていると、もう台帳に無いものについて
     「載せた」と答える集合が declare の入力になる）。 */
  function rewind(turn) { log = log.filter((e) => e.turn < turn); carriedTurn = -1; carriedNames = new Set(); }
  function reset() { log = []; carriedTurn = -1; carriedNames = new Set(); imgSeq = 0; }

  /** 今のターンの分を除いた、以前のターンの記録（新しい順）。 */
  function earlier(turn) { return log.filter((e) => e.turn < turn).map((e) => e.rec).reverse(); }

  /** テキストを「窓」で 1 回ぶん切り出す。offset 省略時は先頭から、limit 省略時は全文。
   *  ⚠ (#R790) `carry` の自動掲載と `attach.recall`（下の case）の取り寄せが**同じ窓**を使う——
   *  切り方を 2 か所に持たない。ここでの `more` は「まだ続きがある」で、`carry` はそれを
   *  記録の `truncated`（読者への表示用と同じ語）にそのまま渡す。 */
  function page(rec, offset, limit) {
    const full = String((rec && rec.text) || '');
    const lim = Math.max(1, Math.floor(Number(limit) || 0) || full.length || 1);
    const off = Math.max(0, Math.min(full.length, Math.floor(Number(offset) || 0)));
    const text = full.slice(off, off + lim);
    const next = off + text.length;
    return { text: text, offset: off, next: next, total: full.length, more: next < full.length };
  }

  /** 今のターンに載せるテキスト添付。今回の分が先、余った枠に以前の分を新しい順で入れる。
   *  ⚠ 枠はサーバと同じ `ATL_FILE.LIMITS`。ここで切るのは、切られたことを IntMap が知るため
   *  （サーバが黙って落とすと、読者にもモデルにも何が欠けたか分からない）。
   *  ⚠⚠⚠ (#R790) 記録の `.text` はもう事前に切られていない（js/atlas-attach.js）ので、
   *  ここが**唯一**このターンへ実際に送る分を決める場所になった——1 件ぶんは `page()` の先頭窓
   *  （`L.textPerFile`）、その先は `attach.recall` に offset 付きで取りに来させる。 */
  function carry(turn, files, limits) {
    const L = limits || { files: 8, textTotal: 400000 };
    const per = L.textPerFile || 120000;
    const bound = (f) => { const c = page(f, 0, per); return { name: f.name, text: c.text, truncated: c.more || !!f.truncated }; };
    const out = (files || []).filter((f) => f && f.kind === 'text').map(bound);
    let used = out.reduce((n, f) => n + f.text.length, 0);
    const put = new Set(out.map((f) => String(f.name)));   /* (#R783) このターンに目の前へ置いた名前——declare がここを読む */
    for (const rec of earlier(turn)) {
      if (rec.kind !== 'text') continue;
      if (out.length >= L.files) break;
      const b = bound(rec);
      if (used + b.text.length > L.textTotal) continue;
      /* ⚠ いつ添付されたものかを名前が述べる。「今このメッセージに付いている」と
         「前に付けられた」を同じ顔で渡すと、モデルは読者が今見せたものだと思って答える。 */
      out.push({ name: rec.name + EARLIER_TAG, text: b.text, truncated: b.truncated });
      put.add(String(rec.name));
      used += b.text.length;
    }
    carriedTurn = turn; carriedNames = put;
    return out;
  }

  /** 今のターンに載っていない添付を、名前と種別だけで述べる文。
   *  ⚠ 中身は渡さない——渡さないことと、在ることを黙っていることは別である。 */
  function declare(turn, sentNames) {
    const sent = new Set((sentNames || []).map(String));
    /* (#R783) 述べるのは「台帳に在って、このターンの carry が目の前に置かなかったもの」。
       種別で決めていたので、枠で落ちたテキストがどちらの文にも現れなかった（上の見出し）。 */
    const known = (carriedTurn === turn);
    const rest = earlier(turn).filter((r) => !sent.has(r.name)
      && (known ? !carriedNames.has(String(r.name)) : r.kind !== 'text'));
    if (!rest.length) return '';
    const seen = new Set(), rows = [];
    const what = (r) => (r.kind === 'image' ? 'image'
      : (r.kind === 'text' ? 'text, not included in this request' : (r.mime || 'document')));
    rest.forEach((r) => { if (seen.has(r.name)) return; seen.add(r.name); rows.push('· ' + r.name + ' (' + what(r) + ')'); });
    return '\n[ATTACHED EARLIER IN THIS CONVERSATION — not in this request. Ask find_capability for "attach.recall" and run it with the name to put one back in front of you on your next step.]\n' + rows.join('\n') + '\n';
  }

  /** 名前で 1 件取り寄せる（新しいほうを優先）。無ければ null。
   *  ⚠ (#R783) 問い合わせは**台帳が見せた名前**で来る。だから比べる前に、台帳が自分で足した札
   *  （`EARLIER_TAG`）を外す——この 1 行が無いと、carry が渡したその名前で頼まれた取り寄せが
   *  全部失敗する（実測）。 */
  function _nm(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase(); }
  function _ask(s) {
    const q = _nm(s), i = q.indexOf(_nm(EARLIER_TAG));
    return (i >= 0 ? q.slice(0, i).trim() : q);
  }
  /* 名前がその問い合わせの中に**語として**現れるか（「x.pdf を見せて」「paper.pdf (document)」）。
     ⚠ 境界は元の文字列で見る——`image-1` は `image-12.png` の部分列だが別のファイルである
     （memory: 語境界は元の文字列で見る／推測は拒否より悪い）。 */
  function _namedIn(q, nm) {
    if (!nm) return false;
    const i = q.indexOf(nm); if (i < 0) return false;
    const w = (c) => !!c && /[0-9a-z]/.test(c);
    return !w(i > 0 ? q.charAt(i - 1) : '') && !w(q.charAt(i + nm.length));
  }
  function find(turn, name) {
    const n = _ask(name);
    if (!n) return null;
    const all = earlier(turn + 1);
    return all.find((r) => _nm(r.name) === n)
      || all.find((r) => _nm(r.name).indexOf(n) >= 0)
      || all.find((r) => _namedIn(n, _nm(r.name))) || null;
  }

  /** 台帳に在るものの名前（読者向けの文と、道具の誤りの説明に使う）。 */
  function names(turn) { return earlier(turn + 1).map((r) => r.name); }

  return { remember: remember, rewind: rewind, reset: reset, carry: carry, declare: declare, find: find, names: names, earlier: earlier, page: page };
})();
