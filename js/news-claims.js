/* ============================================================================
 *  IntMap · 「媒体間で食い違っている数量」を取り出す規則  (#R394)
 * ----------------------------------------------------------------------------
 *  #R386 がこの規則を書いたのは js/news-events.js の中、`HOST` を要求する factory の
 *  奥だった。⇒ **ブラウザの外からは誰も呼べない＝「効いている」は意見でしかない。**
 *  #R340 が `research.events` について直したのと同じ形なので、同じ答えにする——
 *  規則を**純粋なモジュール**へ出し、`scripts/news-events-eval.mjs` が本番のデータで
 *  測れるようにする。表示（見出し・9 言語のラベル・DOM）は news-events.js に残る。
 *
 *  ══ ⚠⚠⚠ 「値が違う」は「食い違っている」ではない ═══════════════════════════
 *  #R386 の規則は「同じ種類の数量に 2 つ以上の値があり、それを言っているのが別々の
 *  系列なら相違」だった。本番 1,069 Event を全部通して出たのは **2 件**で、**そのうち
 *  1 件は誤り**だった（実測 2026-08-24）:
 *
 *    ✅ Uber の制裁金   Reuters「$966 million」 vs AP News「nearly $1 billion」
 *    ❌ 香港の上場      Bloomberg「$1.8 Billion」(Shein の IPO) / Reuters「$10 billion」
 *                       (Alibaba の売出) / CNBC「$10.2 billion」/ Reuters「$27 billion」
 *                       (Shein の評価額)
 *
 *  2 つ目は**同じ記事群に出てくる別々の数字**であって、同じ数字についての食い違いでは
 *  ない。並べて「媒体が食い違っている」と読ませるのは嘘である。
 *
 *  ⇒ **同じ量についての異なる説明だけを相違と呼ぶ。** 2 つの値が同じ量の説明でありうる
 *    のは、互いに**丸めや精度の差**の範囲にあるときで、倍半分も違えば別の事実である。
 *    実測: 正しい 2 組は min/max = **0.966** と **0.980**、誤りの相手は **0.18 / 0.37**。
 *    ⇒ `sameQuantityRatio = 0.5`（＝2 倍以内）。上の Alibaba は
 *      {1.8} / **{10, 10.2}** / {27} の 3 群に割れ、残るのは Reuters $10B vs CNBC $10.2B
 *      ——**本物の、同じ数字についての食い違い**である。
 *
 *  ⚠ 母数は薄い（2 Event・4 値）。だから閾値は「隙間の真ん中」ではなく**意味**で選んだ:
 *    同じ数字の別々の報じ方は丸めの差（966M と 1B で 3.5%）で、2 倍は丸めではない。
 *    次のラウンドが測り直せるように、測定器は scripts/news-events-eval.mjs --diffs にある。
 *
 *  ⚠ **推定しない。** 出すのは原文に書いてある断片そのままと、その前後の語だけ。
 *    どちらが正しいかは言わない（docs/NEWS-EVENTS.md §9.1 / §15）。
 * ==========================================================================*/

export function makeNewsClaims() {
  /* ── 取り出す数量の種類 ────────────────────────────────────────────────────
     ⚠ 同じ `kind` を複数の綴りで書いてよい。下流は kind と単位でまとめるので、行が増えても
       規則は 1 つのままである。数は名前付きの群で読む: `num` 数字 ／ `mag` 桁の語（million・億…）／
       `cur` 書かれた通貨 ／ `q` 通貨記号の直前に付いた国の略号（«US$» の US）。
     ⚠⚠⚠ **通貨は量の一部である**（2026-11-17）。以前は `money` を 1 つにして「英語のみの収集なので
       通貨は混ざらない」としていたが、«$10 billion» と «£10 billion» は同じ値 1e10 として
       一致にも相違にも並びえた。⇒ **原文に書かれた通貨をそのまま単位として持ち、単位が違う 2 値は
       同じ量として比べない。換算しない**（為替は原文に書かれていない事実である）。
       単位は綴りの揺れ（複数形・大文字・«U.S.» の点）だけを畳む。`$` と `US$` と `dollars` は
       **別の単位**——`$` が米ドルか香港ドルかを原文は言っていない。
     ⚠⚠⚠ **英語のニュースは死者数を「動詞が先」で書く。** 実測 (2026-08-24・本番の
       active 1,367 本): «kills 30» / «killed 16» / «kill at least 10» の形が **24 件**、
       «30 killed» の形は **4 件**しかない。#R386 は後者だけを見ていたので、災害と紛争の
       数量をほとんど読めていなかった（実際に発火したのは `money` だけだった）。
     ⚠⚠ **年齢を死者数と読まない。** «Girl, 17, killed in Swedish sword attack» の 17 は
       年齢で、#R386 の綴りはこれを死者数として取り出していた（実測 4 件中 1 件）。
       ⇒ 数字がコンマで終わる形は取らず、«N-year-old» の直前も取らない。 */
  const MAG_WORD = '(?<mag>billion|million|trillion|bn\\b|tn\\b)';
  const CUR_WORD = '(?<cur>(?:US |U\\.S\\. )?dollars?|euros?|pounds?|yen|yuan|renminbi|rupees?|roubles?|rubles?|francs?|pesos?|ringgit|baht|rand|lira|naira|shillings?|dirhams?|riyals?|won)';
  const KINDS = [
    ['dead', /\b(?:(?:at least|more than|over|about|around|nearly|up to)\s+)?(?<num>[\d][\d,]*[\d]|[\d])\s+(?:people\s+)?(?:killed|dead|died|deaths?|fatalities)\b/i],
    ['dead', /\b(?:kills?|killed|killing)\s+(?:(?:at least|more than|over|about|around|nearly|up to)\s+)?(?<num>[\d][\d,]*[\d]|[\d])(?!\s*[-–]\s*year)\b/i],
    ['injured', /\b(?:(?:at least|more than|over|about|around|nearly|up to)\s+)?(?<num>[\d][\d,]*[\d]|[\d])\s+(?:people\s+)?(?:injured|wounded|hurt)\b/i],
    ['injured', /\b(?:injures?|injured|injuring|wounds?|wounded|wounding|hurt)\s+(?:(?:at least|more than|over|about|around|nearly|up to)\s+)?(?<num>[\d][\d,]*[\d]|[\d])(?!\s*[-–]\s*year)\b/i],
    ['missing', /\b(?:(?:at least|more than|over|about|around|nearly|up to)\s+)?(?<num>[\d][\d,]*[\d]|[\d])\s+(?:people\s+)?missing\b/i],
    /* 記号が先: «$966 million» «US$1 billion» «£10bn» «€3 trillion» */
    ['money', new RegExp('(?<![A-Za-z])(?<q>[A-Z]{1,3})?(?<cur>[$€£¥₹₩])\\s?(?<num>[\\d][\\d,.]*)\\s*' + MAG_WORD + '?', 'i')],
    /* 語が後: «10 billion dollars» «2.5 trillion yen»。⚠ 桁の語を要求する——«200 pounds» は重さでもあり
       «10 won» は動詞でもある。桁の語の付いた数に続く通貨名だけが、確かに金額である。 */
    ['money', new RegExp('\\b(?<num>[\\d][\\d,.]*)\\s*' + MAG_WORD + '\\s+' + CUR_WORD + '\\b', 'i')],
    /* 漢字の単位: «10億円» «3兆円» «500万元» */
    ['money', /(?<num>[\d][\d,.]*)\s*(?<mag>万|億|兆)?\s*(?<cur>円|元)/],
    ['percent', /\b(?<num>[\d][\d.]*)\s?(?:%|percent|per cent)\b/i],
  ];
  const MULT = { billion: 1e9, bn: 1e9, million: 1e6, trillion: 1e12, tn: 1e12, '万': 1e4, '億': 1e8, '兆': 1e12 };
  /* 書かれた通貨を単位の鍵に畳む——**綴りの揺れだけ**（複数形・大文字・«U.S.» の点）。
     記号と語は畳まない（`$` を dollars と読むのは原文に無い主張になる）。 */
  function unitOf(kind, g) {
    if (kind === 'percent') return '%';
    if (kind !== 'money') return '';
    const cur = String(g.cur || '');
    if (/^[$€£¥₹₩円元]$/u.test(cur)) return String(g.q || '').toUpperCase() + cur;
    const w = cur.toLowerCase().replace(/\./g, '');
    const us = /^us /.test(w);
    const base = w.replace(/^us /, '');
    return (us ? 'US ' : '') + (/(?:ss|us|is)$/.test(base) || !base.endsWith('s') ? base : base.slice(0, -1));
  }

  /* ── 時とともに数え直される量 ──────────────────────────────────────────────
     ⚠ 死者・負傷者・行方不明者の数は、**捜索と集計が進むにつれて報じ直される累計**である。
       初報「10 人死亡」→ 続報「15 人に」は媒体の食い違いではなく**時刻とともに更新された**数で、
       「媒体間で食い違っている」と並べると読者は「どちらかが誤っている」と読む。
       ⇒ これは件数の例外ではなく**量の性質**として種類に持たせる（`cumulative`）。下の
       `compare()` はこの性質と、各値に付いた**記事の公開時刻**だけを見て、時刻順に増えていく
       群を `updates` に分ける。金額や割合は累計ではないので、時刻で並べても相違は相違である。 */
  const KIND_INFO = Object.freeze({
    dead: Object.freeze({ cumulative: true }),
    injured: Object.freeze({ cumulative: true }),
    missing: Object.freeze({ cumulative: true }),
    money: Object.freeze({ cumulative: false }),
    percent: Object.freeze({ cumulative: false }),
  });

  const DEFAULTS = {
    /* 2 つの値が「同じ量についての別々の説明」でありうる下限（min/max）。§冒頭の実測。 */
    sameQuantityRatio: 0.5,
    /* 前後どれだけの字を「何についての数か」の手がかりとして持ち帰るか。 */
    contextChars: 45,
  };

  /* 1 本の文から**すべての**数量を取り出す。
     ⚠ #R386 は種類ごとに最初の 1 件しか取っていなかった。実測では歩留まりは変わらな
       かったが（1,069 Event で 2 → 2）、**取りこぼしを規則に埋め込む理由が無い**。
     ⚠ 同じ種類の 2 つの綴りが同じ断片に当たったら、先に書いた行の 1 つだけを残す。 */
  function quantities(text, opt) {
    const o = { ...DEFAULTS, ...(opt || {}) };
    const t = String(text || '');
    const out = [];
    const taken = [];
    for (const [kind, re] of KINDS) {
      const g = new RegExp(re.source, re.flags.includes('i') ? 'gi' : 'g');
      let m;
      while ((m = g.exec(t)) !== null) {
        const G = m.groups || {};
        let v = parseFloat(String(G.num || '').replace(/,/g, ''));
        const a0 = m.index, b0 = m.index + m[0].length;
        const overlaps = taken.some(([k, x, y]) => k === kind && a0 < y && x < b0);
        if (Number.isFinite(v) && !overlaps) {
          if (G.mag) v *= (MULT[String(G.mag).toLowerCase()] || 1);
          const a = Math.max(0, a0 - o.contextChars);
          const b = Math.min(t.length, b0 + o.contextChars);
          out.push({ kind, unit: unitOf(kind, G), value: v, text: m[0].trim(), context: t.slice(a, b).replace(/\s+/g, ' ').trim() });
          taken.push([kind, a0, b0]);
        }
        if (m.index === g.lastIndex) g.lastIndex++;   /* 幅ゼロの一致で止まらない */
      }
    }
    return out;
  }
  /** 同じ量を名指す鍵——種類と**書かれた単位**と値。単位の違う値は同じ鍵を持たない。 */
  const quantityKey = (q) => q.kind + '|' + (q.unit || '') + '|' + q.value;

  /* 昇順の値を「同じ量でありうる」かたまりに割る。
     ⚠ 連続する値だけを見る。[1.8, 10, 10.2, 27] は {1.8} / {10,10.2} / {27} になる。 */
  function groupBySameQuantity(claims, ratio) {
    const sorted = claims.slice().sort((a, b) => a.value - b.value);
    const groups = [];
    for (const c of sorted) {
      const g = groups[groups.length - 1];
      if (g && c.value > 0 && g[0].value / c.value >= ratio) g.push(c);
      else groups.push([c]);
    }
    return groups;
  }

  const msOf = (c) => { const t = typeof c.at === 'number' ? c.at : Date.parse(c.at || ''); return Number.isFinite(t) ? t : NaN; };
  /* 時刻順に読んで、どの値も**それより前に出たどの値も下回らず**、同じ時刻に別の値が無く、
     少なくとも 1 度は増えている——累計が数え直されていった形。時刻の無い値が 1 つでもあれば
     判断しない（並べる根拠が無い）。 */
  function risesOverTime(claims) {
    if (!claims.every((c) => Number.isFinite(msOf(c)))) return false;
    const byT = claims.slice().sort((a, b) => msOf(a) - msOf(b));
    let before = -Infinity, rose = false;
    for (let i = 0; i < byT.length;) {
      let j = i;
      while (j < byT.length && msOf(byT[j]) === msOf(byT[i])) j++;
      const vals = new Set(byT.slice(i, j).map((c) => c.value));
      if (vals.size > 1) return false;                 /* 同じ時刻に 2 つの値＝食い違い */
      const v = byT[i].value;
      if (v < before) return false;                    /* 後から出た値が前の値を下回った */
      if (before !== -Infinity && v > before) rose = true;
      before = Math.max(before, v);
      i = j;
    }
    return rose;
  }

  /**
   * members: [{ title, description, family, source, at? }]   `at` は記事の公開時刻（ISO 文字列か ms）
   * 返す: { differences: [{ kind, unit, claims }], updates: [{ kind, unit, claims }] }
   *   claims: [{ value, unit, text, context, source, family, at }]
   *
   * ⚠ 相違と呼ぶのは、**別々の `family`（資本系列）が、同じ量について別々の値**を
   *   言っているときだけ。同じ系列の速報 3 人 → 続報 5 人は**更新**であって相違ではない
   *   （詳細の時系列がそれを見せる）。
   * ⚠ 累計の量（`KIND_INFO[kind].cumulative`）で、値が時刻順に増えていく群は `updates` に入る
   *   ——別々の系列でも、後から出た大きい数は「数え直された」であって「食い違った」ではない。
   *   `updates[].claims` は時刻順、`differences[].claims` は値の昇順。時刻が無ければ判断せず
   *   `differences` に入る（以前と同じ）。
   */
  function compare(members, opt) {
    const o = { ...DEFAULTS, ...(opt || {}) };
    const byUnit = new Map();
    for (const m of members || []) {
      const text = String(m.title || '') + ' — ' + String(m.description || '');
      const at = m.at != null ? m.at : (m.publishedAt != null ? m.publishedAt : null);
      for (const q of quantities(text, o)) {
        const k = q.kind + '|' + q.unit;
        let g = byUnit.get(k);
        if (!g) byUnit.set(k, (g = []));
        g.push({ ...q, source: m.source, family: m.family, at });
      }
    }
    const differences = [], updates = [];
    for (const claims of byUnit.values()) {
      const { kind, unit } = claims[0];
      for (const group of groupBySameQuantity(claims, o.sameQuantityRatio)) {
        /* 同じ値を 2 度並べない——先に言ったほうを代表にする（時刻があれば最も早いもの）。 */
        const byValue = new Map();
        for (const c of group) {
          const had = byValue.get(c.value);
          if (!had || msOf(c) < msOf(had)) byValue.set(c.value, c);
        }
        if (byValue.size < 2) continue;
        const families = new Set([...byValue.values()].map((c) => c.family));
        if (families.size < 2) continue;
        const reps = [...byValue.values()];
        if ((KIND_INFO[kind] || {}).cumulative && risesOverTime(group)) {
          updates.push({ kind, unit, claims: reps.sort((a, b) => msOf(a) - msOf(b)) });
        } else {
          differences.push({ kind, unit, claims: reps.sort((a, b) => a.value - b.value) });
        }
      }
    }
    return { differences, updates };
  }
  /** 媒体間で食い違っている数量だけ（`compare().differences`）。形は以前と同じ配列。 */
  function differences(members, opt) { return compare(members, opt).differences; }

  return { KINDS, KIND_INFO, DEFAULTS, quantities, quantityKey, compare, differences, groupBySameQuantity };
}
