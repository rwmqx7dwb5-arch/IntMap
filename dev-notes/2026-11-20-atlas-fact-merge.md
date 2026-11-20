---
title: 複数の子 AI が述べた事実を、文の綴りでなく「実世界オブジェクト×属性」で突き合わせる——Port of Rotterdam とロッテルダム港が同じ対象として一致・矛盾・欠落に分かれる
date: 2026-11-20
newsen: When several research workers report facts, Atlas now matches them by the real-world object and attribute — even when each wrote the name in a different language — and returns agreements, conflicts (with their sources) and gaps.
newsjp: 複数の調査担当 AI が報告した事実を、名前の言語が違っても同じ実世界の対象として突き合わせ、一致・矛盾（出典つき）・欠落に分けて返せるようになりました。
---

〈依頼〉 外部監査（2026-11-20）: `integrate` は重複文・同じ場所の数値差・取得不能を整理するだけで、「Port of Rotterdam」と「ロッテルダム港」が同じ対象であることを解決しない。

## 作ったもの
- `js/atlas-fact-merge.js`（新規・純）: `normalizeFact(s)`・`mergeFacts(results,{resolve})`・`makeFactResolver`。
- 子の結果に `facts`（対象・属性・値・単位・対象時点・出典・取得時刻・evidenceId）。`shapeOf` と結果の正規化（`atlas-delegate.js` に 3 行）、worker への指示文。
- `research.delegate` の道具結果に `integrated.facts`、カードに矛盾件数の 1 行。
- 検査 `tests/atlas-fact-merge-checks.test.mjs`（7 件）: 英語名と日本語名＋Wikidata id が 1 対象／矛盾が出典・evidence つきで返る／単位違い・年違い／欠落／解決不能・resolver 失敗・失敗した子は読まない／worker の形。

## 設計の判断
- 名前一覧・別名表は持たない（no-ad-hoc-hardcoding）。同一性は ref → 共有 id → 注入された resolve（セッション索引→永続グラフ）。解決できない名前は束ねず `unresolved` に挙げる。
- 差は**測って**返す（`relDiff`）。閾値で「矛盾」を作らない。単位は換算しない。
## 未着手
- 言語をまたぐ名前だけ（id なし）は、索引・グラフがその綴りを持たなければ解決しない。Wikidata の多言語ラベル検索を resolver に足すのは、網の呼び出し（費用・遅延）を決めてから。
- 永続ジョブ化（atlas-jobs）が結果を保存する際に `facts` を運ぶ必要がある（契約を 05-ai.md に記載）。
- worker が返す `evidenceId` の発行はページ側（evidence-lineage）の仕事で、いまは文字列を運ぶだけ。

## perf-budget の天井(dist.assets)を引き上げた理由

`dist.assets` を 21961000 から 22076000 バイトへ(CI の実測 21557.9 kB に合わせた)。増えた分は新しい遅延モジュール
`atlas-fact-merge.js` と、`atlas-delegate.js`・`atlas-cap-research.js` の配線。起動時(eager)の経路には載せていない
(遅延チャンクのみ)ので、起動費用の天井は動かしていない。main の CI が事後に締める。
