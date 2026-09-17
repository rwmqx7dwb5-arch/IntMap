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

  /** このターンに添付されたものを台帳に載せる。imgs は data URL の配列、files は read() の記録。 */
  function remember(turn, imgs, files) {
    (imgs || []).forEach((u, i) => { if (u) log.push({ turn: turn, rec: { kind: 'image', name: 'image-' + (log.length + i + 1), dataUrl: u } }); });
    (files || []).forEach((f) => { if (f) log.push({ turn: turn, rec: f }); });
    /* ⚠ 会話は終わらない（「新しい会話」でモジュールが作り直される経路はこの製品に無い）。
       台帳は会話履歴 `_hist` と同じ 48 件で頭を落とす——1 件 8 MB の PDF を無限に抱えないため。
       落ちるのは最も古いものなので、`declare()` が述べる一覧＝取り寄せられる一覧のままになる。 */
    if (log.length > CAP) log = log.slice(log.length - CAP);
  }

  /** 編集で巻き戻されたターン以降の添付を落とす（履歴の巻き戻しと同じ境界）。 */
  function rewind(turn) { log = log.filter((e) => e.turn < turn); }
  function reset() { log = []; }

  /** 今のターンの分を除いた、以前のターンの記録（新しい順）。 */
  function earlier(turn) { return log.filter((e) => e.turn < turn).map((e) => e.rec).reverse(); }

  /** 今のターンに載せるテキスト添付。今回の分が先、余った枠に以前の分を新しい順で入れる。
   *  ⚠ 枠はサーバと同じ `ATL_FILE.LIMITS`。ここで切るのは、切られたことを IntMap が知るため
   *  （サーバが黙って落とすと、読者にもモデルにも何が欠けたか分からない）。 */
  function carry(turn, files, limits) {
    const L = limits || { files: 8, textTotal: 400000 };
    const out = (files || []).filter((f) => f && f.kind === 'text').map((f) => ({ name: f.name, text: f.text, truncated: !!f.truncated }));
    let used = out.reduce((n, f) => n + f.text.length, 0);
    for (const rec of earlier(turn)) {
      if (rec.kind !== 'text') continue;
      if (out.length >= L.files) break;
      if (used + rec.text.length > L.textTotal) continue;
      /* ⚠ いつ添付されたものかを名前が述べる。「今このメッセージに付いている」と
         「前に付けられた」を同じ顔で渡すと、モデルは読者が今見せたものだと思って答える。 */
      out.push({ name: rec.name + ' (attached earlier in this conversation)', text: rec.text, truncated: !!rec.truncated });
      used += rec.text.length;
    }
    return out;
  }

  /** 今のターンに載っていない添付を、名前と種別だけで述べる文。
   *  ⚠ 中身は渡さない——渡さないことと、在ることを黙っていることは別である。 */
  function declare(turn, sentNames) {
    const sent = new Set((sentNames || []).map(String));
    const rest = earlier(turn).filter((r) => r.kind !== 'text' && !sent.has(r.name));
    if (!rest.length) return '';
    const seen = new Set(), rows = [];
    rest.forEach((r) => { if (seen.has(r.name)) return; seen.add(r.name); rows.push('· ' + r.name + ' (' + (r.kind === 'image' ? 'image' : (r.mime || 'document')) + ')'); });
    return '\n[ATTACHED EARLIER IN THIS CONVERSATION — not in this request. Ask find_capability for "attach.recall" and run it with the name to put one back in front of you on your next step.]\n' + rows.join('\n') + '\n';
  }

  /** 名前で 1 件取り寄せる（新しいほうを優先）。無ければ null。 */
  function find(turn, name) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    const all = earlier(turn + 1);
    return all.find((r) => String(r.name).toLowerCase() === n)
      || all.find((r) => String(r.name).toLowerCase().indexOf(n) >= 0) || null;
  }

  /** 台帳に在るものの名前（読者向けの文と、道具の誤りの説明に使う）。 */
  function names(turn) { return earlier(turn + 1).map((r) => r.name); }

  return { remember: remember, rewind: rewind, reset: reset, carry: carry, declare: declare, find: find, names: names, earlier: earlier };
})();
