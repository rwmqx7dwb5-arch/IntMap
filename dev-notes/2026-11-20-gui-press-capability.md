---
title: GUI のボタンを execute() 経由にする（IntMapOS.press）と、直接 exec が残る理由の台帳
date: 2026-11-20
internal: ボタンの見た目と結果は変わらない。操作の記録・観測・事後条件が Atlas と同じ経路になる
---

〈依頼〉 外部監査（2026-11-20）「GUI は OS.exec、Atlas は execute の二重経路」。記録 `2026-11-19-exec-path-unify.md` の未了（36 か所の移行）。

## 測った
`IntMapOS.exec(` の直接呼び出しは 19 ファイル。能力が `commands:` で宣言している command を、**能力の引数だけで 1:1 に表せる**ボタンは
投影（`view.projection` ×2）・基図（`view.basemap` ×2）・タブ（`panel.tab` ×4）の 8 つだけだった。
それ以外は 1:1 ではない: `news.company` は `company.open` の上に企業ニュースの取得と world object の書き込みを足す／
`data.companyTies`・`data.companySites` は自分で query して文を作る／`layers.toggle` は ID でなく名前を取る／
ツール行・パレット・ウィジェットは command id がデータ。これを execute に寄せると、ボタンに無かった効果が増える（挙動が変わる）。

## 直したもの
- `js/atlas-capabilities.js` `OS.press(capabilityId, args, command)`: `execute(…, {source:'ui'})`。**reject のときだけ**
  command へ戻る（executor の chunk が取れない場合にボタンが無言で死なない。失敗の *結果* は正直な答えなので戻らない）。
- 8 つのボタン（`app-body.js` `map-projection.js` `session-tabs.js`）を press に。
- `scripts/gui-exec-sites.json`: 直接 exec が残る 15 ファイルとその理由。`tests/exec-path-unify-checks.test.mjs` が
  ①直接呼び出しは全部台帳にある・古い項目は落ちる ②press の（能力, command）の組は能力が実際にその command を宣言している
  ③press の fallback の挙動、を測る。既存の `capability-command-bridge-checks`（command↔能力の網羅）とは別の事実
  （**呼び出し側**）なので、同じファイルに足した（`atlas-command-unbridged.json` は command 側の台帳）。

## 未了・注意
- 残る 15 ファイルは理由つきで残した。能力側が command と同じ効果だけを持つように分けられたものから順に press へ。
- 本番／ブラウザでの 8 ボタンの実機確認は、このセッションの環境では build に必要なデータが無く未実施（CI の spec が見る）。
