---
title: Atlas の OpenAI モデルを GPT-6.1 Sol → 6.1 Terra → 6 Luna に。地図・出典・回答の焦点の 4 つの欠陥も直した
date: 2026-11-16
newsen: Atlas now runs on GPT-6.1 Sol. Answers lead with what was asked, citations name their publisher, and policy answers no longer drop a map pin.
newsjp: Atlas が GPT-6.1 Sol で動くようになりました。質問への答えから先に述べ、出典は発行元の名前で示し、政策などの回答に関係のない地図を出さなくなりました。
---

〈依頼〉「Sol→Terra→luna の順番かつ、それぞれの最新番号に変えて。gpt-6.1-sol / gpt-6.1-terra / gpt-6-luna。その他諸々も任せる」。
添えられたのは、チェコ公共放送の財源についての追い質問「具体的には？」への Atlas の回答を ChatGPT に分析させた文書。

## 0. 測った

- 変更前のモデルは `gpt-5.6-terra`、予備は `gpt-5.6-sol` → `gpt-5.6-luna`（2026-09-15 の指示のまま）。
- OpenAI の公式のモデルページと料金ページ（2026-11-16 に読んだ。100 万トークンあたり入力/出力）:
  `gpt-6.1-sol` $2/$10、`gpt-6.1-terra` $1/$5、`gpt-6-luna` $0.1/$0.5。変更前の `gpt-5.6-terra` は $2/$12。
  3 つとも reasoning effort low/medium/high（callOpenAI が送るのはこの 3 値だけ）と、Responses API の
  `web_search` に対応する。GPT-5.6 系に廃止日はまだ無い。`gpt-6-astra` は 2026-09-15 の判断どおり、選択肢に出さないままにした。
- 公式ページに 5.6 と 6 の性能比較は無い。速さは第三者の計測しか無い（6.1 Sol の出力速度は 5.6 Sol の約 6 割）。
  ⇒ 本番で `meta.modelServed` と応答時間を見て確かめる。

## 1. 直したもの（どれも報告された 1 件ではなく、それを生んだ仕組みを直した）

1. **関係のない地図。** 分析の回答には、モデルが場所を入れる欄（`places`）がある。それなのに `_pinReplyPlaces` は、
   本文の大文字語から場所を拾う安全網も走らせていた。空の欄は「場所の話ではない」というモデルの判断であって、書き漏れではない。
   欄を持つ呼び出し元は `placesDeclared` を渡し、そのときはモデルが名指した場所だけを置く。
   契約の規則には「政策・法律・お金・人物・考え方の質問では places を空にする」を足した。
2. **番号だけの出典「1」。** 回答の下の出典カードには番号が無いので、丸の中の数字はどこにも対応していなかった。
   丸には発行元の短い名前を出す（全名は tooltip、番号は `data-n` に残す。リンクは同じ）。
3. **「google.com に集中」の誤警告。** 復号できない Google News の転送 URL を、記事の発行元ではなく
   `google.com` として数えていた。出典は `publisher` で数える。host の形をした名前は host と同じく丸め、
   公的ドメインの判定はそのまま効く。`publisher` の無い出典は、これまでどおり URL で数える。
4. **焦点と重複。** 分析の規則に FOCUS（追い質問は直前の話題に答え、変化を問われたら新しいものから述べる）、
   NO REPETITION（結論は 1 回。各節は新しい情報だけを足す）、STATUS（決定済みと提案・報道を分け、日付を付ける）を足した。
   選び方と順序の規則であって、Atlas が何を調べてよいかは縛らない（`one-pass-or-a-reason.md` §1）。

## 2. 手を付けなかったもの

- 1 問あたり最大 8 往復のループ（`maxSteps`）は下げていない。手数の上限は柵であって、遅さへの対処ではない（`CONSTITUTION.md` §5）。
  遅さは、新しいモデルでの本番の実測を見てから扱う。

## 3. 検査

`tests/atlas-gpt6-models-checks.test.mjs`（5 件）。変更前の `atlas-verify.js` と `atlas-answer-render.js` に戻すと 3 件が落ちる（確認済み）。
