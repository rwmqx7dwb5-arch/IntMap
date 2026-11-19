---
title: Atlas の確認ボタンが、何を実行するか言わないまま読み取りにまで出ていた——外へ出る・消える操作だけに絞り、何をするかを書く
date: 2026-11-19
newsen: Atlas no longer asks you to press Run before a read or a change you can undo. It asks only before publishing, listing, navigating or deleting, and says exactly what it will do.
newsjp: Atlas は、読み取りや元に戻せる変更の前に「実行」を押させなくなりました。公開・投稿・経路案内・削除の前だけ、何をするかを書いて確認します。
---

〈依頼〉 本番の回答で「進めてよければ『実行』を押してください。まだ何も実行していません。」と出て、押しても何も変わらなかった。何を進めるのかも書かれていない。

## 0. 測ったこと

- 止めたのは `view.inspect`（画面のピクセルをモデルへ渡す読み取り）。#R801 の規則「Web 検索などの外部文章のあと、モデルが呼ぶ confirm=`explicit` の操作は本人の押下を要する」に掛かった。
- 押しても何も変わらない理由: `view.inspect` の結果は「次のモデル入力に画像として付く」もので、回答の手番はすでに終わっており、受け取る手番がない。
- 確認の文言は固定の 1 行で、何をするかを持たなかった。押す側は判断できず、盲目の承認にしかならない（防御として働かない）。
- `explicit` は 31 行にあった。読み取り（`view.inspect`・`view.locate`・`attach.recall`）、元に戻せる設定（`settings.*` 11 行）、追加・保存・書き出し（`places.save`・`data.gis*` ほか）まで含んでいた。

## 1. 変えたこと

- 確認が要るのは「外へ出る（risk=external）」か「消す」操作だけ: `community.list`・`navigation.start`・`places.publish`・`research.hereNow`（現在地を読み、その座標で外のサービスへ問い合わせる＝risk を external に直した。CI の mobile-next ⑥ が「現在地は黙って読まない」を守っていた）・`places.remove`・`places.unwatch`・`map.clearAll`。残りの 24 行は confirm=`none`。何を消してよいかは「消したあと何が同じだけ働くか」ではなく、「押す側が判断できる中身があるか」で決めた。
- 確認は何をするかを書く: `atlas.confirm.what.<capability id>`（en+jp）。`{what}` は呼び出しが名指すもの（場所・ボタン・行き先）。`system.control` が `data-effect=outward/destructive` のボタンを押すときも同じ（`atlas.confirm.what.system.control`）。汎用の 1 行は、文を持たない行のためだけに残る。
- 回帰: `tests/atlas-console-boundary-checks.test.mjs` が「asking 行 = external の行 + 消す 3 行」かつ「asking 行はすべて自分の文を持つ」を測る。`tests/atlas-capabilities-checks.test.mjs` ② は旧「モデル入力を運ぶ行は confirm-free でない」を「読み取りと元に戻せる変更は決して尋ねない」へ反転した。

## 2. 直していないもの

- 曖昧な依頼を選択肢で尋ねる経路（`atlas.input.choice`）は既存のまま（今回は触っていない）。
- 外へ出る操作が外部文章に操られうるという #R801 の脅威モデルそのものは残している。変えたのは「何を尋ねるか」と「尋ね方」で、尋ねる対象は減らしたが外へ出る・消す操作の確認は維持した。
