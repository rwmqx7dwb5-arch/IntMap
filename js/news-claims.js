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
     ⚠ 同じ `kind` を複数の綴りで書いてよい。下流は kind でまとめるので、行が増えても
       規則は 1 つのままである。
     ⚠ 種類は「同じ量かどうか」を比べられる単位で切る。`money` を 1 つにしてあるのは
       通貨記号が混ざらない実データ（英語のみ収集）だからで、混ざる日が来たら通貨ごとに割る。
     ⚠⚠⚠ **英語のニュースは死者数を「動詞が先」で書く。** 実測 (2026-08-24・本番の
       active 1,367 本): «kills 30» / «killed 16» / «kill at least 10» の形が **24 件**、
       «30 killed» の形は **4 件**しかない。#R386 は後者だけを見ていたので、災害と紛争の
       数量をほとんど読めていなかった（実際に発火したのは `money` だけだった）。
     ⚠⚠ **年齢を死者数と読まない。** «Girl, 17, killed in Swedish sword attack» の 17 は
       年齢で、#R386 の綴りはこれを死者数として取り出していた（実測 4 件中 1 件）。
       ⇒ 数字がコンマで終わる形は取らず、«N-year-old» の直前も取らない。 */
  const KINDS = [
    ['dead', /\b(?:(?:at least|more than|over|about|around|nearly|up to)\s+)?([\d][\d,]*[\d]|[\d])\s+(?:people\s+)?(?:killed|dead|died|deaths?|fatalities)\b/i],
    ['dead', /\b(?:kills?|killed|killing)\s+(?:(?:at least|more than|over|about|around|nearly|up to)\s+)?([\d][\d,]*[\d]|[\d])(?!\s*[-–]\s*year)\b/i],
    ['injured', /\b(?:(?:at least|more than|over|about|around|nearly|up to)\s+)?([\d][\d,]*[\d]|[\d])\s+(?:people\s+)?(?:injured|wounded|hurt)\b/i],
    ['injured', /\b(?:injures?|injured|injuring|wounds?|wounded|wounding|hurt)\s+(?:(?:at least|more than|over|about|around|nearly|up to)\s+)?([\d][\d,]*[\d]|[\d])(?!\s*[-–]\s*year)\b/i],
    ['missing', /\b(?:(?:at least|more than|over|about|around|nearly|up to)\s+)?([\d][\d,]*[\d]|[\d])\s+(?:people\s+)?missing\b/i],
    ['money', /([$€£¥])\s?([\d][\d,.]*)\s*(billion|million|trillion|bn\b|tn\b)?/i],
    ['percent', /\b([\d][\d.]*)\s?(?:%|percent|per cent)\b/i],
  ];
  const MULT = { billion: 1e9, bn: 1e9, million: 1e6, trillion: 1e12, tn: 1e12 };

  const DEFAULTS = {
    /* 2 つの値が「同じ量についての別々の説明」でありうる下限（min/max）。§冒頭の実測。 */
    sameQuantityRatio: 0.5,
    /* 前後どれだけの字を「何についての数か」の手がかりとして持ち帰るか。 */
    contextChars: 45,
  };

  /* 1 本の文から**すべての**数量を取り出す。
     ⚠ #R386 は種類ごとに最初の 1 件しか取っていなかった。実測では歩留まりは変わらな
       かったが（1,069 Event で 2 → 2）、**取りこぼしを規則に埋め込む理由が無い**。 */
  function quantities(text, opt) {
    const o = { ...DEFAULTS, ...(opt || {}) };
    const t = String(text || '');
    const out = [];
    for (const [kind, re] of KINDS) {
      const g = new RegExp(re.source, 'gi');
      let m;
      while ((m = g.exec(t)) !== null) {
        const raw = (m[1] || '').replace(/,/g, '');
        let v = parseFloat(kind === 'money' ? (m[2] || '').replace(/,/g, '') : raw);
        if (Number.isFinite(v)) {
          if (kind === 'money' && m[3]) v *= (MULT[String(m[3]).toLowerCase()] || 1);
          const a = Math.max(0, m.index - o.contextChars);
          const b = Math.min(t.length, m.index + m[0].length + o.contextChars);
          out.push({ kind, value: v, text: m[0].trim(), context: t.slice(a, b).replace(/\s+/g, ' ').trim() });
        }
        if (m.index === g.lastIndex) g.lastIndex++;   /* 幅ゼロの一致で止まらない */
      }
    }
    return out;
  }

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

  /**
   * members: [{ title, description, family, source }]
   * 返す: [{ kind, claims: [{ value, text, context, source, family }] }]
   *
   * ⚠ 相違と呼ぶのは、**別々の `family`（資本系列）が、同じ量について別々の値**を
   *   言っているときだけ。同じ系列の速報 3 人 → 続報 5 人は**更新**であって相違ではない
   *   （詳細の時系列がそれを見せる）。
   */
  function differences(members, opt) {
    const o = { ...DEFAULTS, ...(opt || {}) };
    const byKind = new Map();
    for (const m of members || []) {
      const text = String(m.title || '') + ' — ' + String(m.description || '');
      for (const q of quantities(text, o)) {
        let g = byKind.get(q.kind);
        if (!g) byKind.set(q.kind, (g = []));
        g.push({ ...q, source: m.source, family: m.family });
      }
    }
    const out = [];
    for (const [kind, claims] of byKind) {
      for (const group of groupBySameQuantity(claims, o.sameQuantityRatio)) {
        /* 同じ値を 2 度並べない——先に言ったほうを代表にする。 */
        const byValue = new Map();
        for (const c of group) if (!byValue.has(c.value)) byValue.set(c.value, c);
        if (byValue.size < 2) continue;
        const families = new Set([...byValue.values()].map((c) => c.family));
        if (families.size < 2) continue;
        out.push({ kind, claims: [...byValue.values()].sort((a, b) => a.value - b.value) });
      }
    }
    return out;
  }

  return { KINDS, DEFAULTS, quantities, differences, groupBySameQuantity };
}
