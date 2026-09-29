---
title: Atlas の「どのボタンでも押せる」能力は確認を一度も通らなかった——送信・公開・削除は押される要素が自分で宣言し、実行の前に読む
date: 2026-09-29
---

〈依頼〉監査の指摘。確認の関門（`js/atlas-executor.js` 4b）は能力表の confirm 列だけを読むが、
`system.control` は confirm='none' の 1 行で、DOM 上の任意のボタンを押し、入力に値を入れて Enter を送れる。
届く先にフィードバック送信・バグ報告・コミュニティへの**公開投稿**・アカウント削除がある。
外部内容（ニュース・取得したページ・添付）に書かれた指示で、確認なしに公開投稿が起こりうる。
あわせて、操作一覧が欄の名前に placeholder を使い、アカウント削除の欄の placeholder が読者のメールアドレス
そのもので、それがモデルへ出ていた。

## 0. 測った（コードで。本番では再現していない）

- 能力表 146 行のうち `explicit` 15・`always` 0。`system.control`・`system.module` はともに `none`。
- クリック／変更／Enter のハンドラから Supabase の書き込み・rpc・auth の変更・POST する Edge Function に
  届くものを AST で数えると **29 件**（`tests/atlas-outward-effects-checks.test.mjs` D①）。宣言は 0 件だった。
  コミュニティの投稿は `js/app-body.js` の `compose-submit` → 転送シム `cmAddPost.apply` →
  `js/community-board.js` の insert、と**別ファイルを 2 つ**またいでいた。
- `system.module` が呼べるのは `open/toggle/close/clear/exit/refresh/render` の引数なし呼び出しだけで、
  書き込みを持つファイル（auth-ui・community・feedback・monitors・news-events・news-ui・app-body）の
  公開オブジェクトにこの名前で書き込むものは見つからなかった。**触っていない。**

## 1. 直した

- **効果は押される要素が宣言する**（`data-effect`）: `outward`（読者の名で外へ送る・公開する・アカウントを
  変える）・`destructive`（取り戻せない削除）・`private`（読者自身の状態だけ・取り消せる）・`none`
  （書き込むハンドラを共有するが自分は書かない枝）。危険なボタンの一覧はどこにも書いていない。
- `js/atlas-controls.js` `controlEffect(a)` は `findControl` と同じ採点で対象を解決して宣言を読む。
  `js/atlas-capabilities.js` の全行に `effectOf(ctx,args)`（`bindRuntime({effects})` で結ばれたものだけが答える）。
  `js/atlas-executor.js` 4b は**実行の前に**それを訊き、`outward` / `destructive` を `explicit` と
  **同じ条件**（モデル発・そのターンに外部内容）で `needs_confirm` にする。inputRequest に `effect`、
  押した結果の `meta.effect` にも残る。確認の往復は既存の `_confirmedBy` のまま。
- `system.control` 以外から `doControl` へ後退する 4 経路（レイヤー名・道具名・未知の type）は 4b を
  通っていないので、宣言された `outward` / `destructive` を押さない（拡大ボタンなど無宣言のものは従来どおり押す）。
- 操作一覧の欄の名前は aria-label → `<label>` → data-i18n → title → placeholder。個人情報の欄
  （type email/password/tel、autocomplete が人を指す）の placeholder は使わない——**欄の性質**に付けたので、
  見つかった 1 つの欄だけでなく同種のすべてに効く。
- `_acctAsk` の確認ボタンと欄は、呼び出し元が渡す `effect` を宣言する（Enter でも確定するため欄にも）。

## 2. 選ばなかったもの

- **`system.control` を `explicit` にする**: 地図の操作まで外部内容のあとで毎回訊くことになり、
  Atlas の既定の到達手段を縛る。判断できるのは行ではなくボタンである。
- **外部内容の印をターンをまたいで持ち越す**（`js/atlas-console.js` の履歴 `_hist` はモデルへ渡るが、
  `externalContentSeen` は毎ターン false から始まる）: 持ち越すと、一度ニュースを読んだ会話では以後
  `view.locate` なども毎回訊くことになる挙動の変更で、今回の範囲を超える。残した。

## 3. 検査

- `tests/atlas-outward-effects-checks.test.mjs`（13）: 実物の executor・capabilities・controls を評価する。
  外部内容のあとで outward／destructive は押す前に `needs_confirm`、確認後の同じ呼び出しは押される、
  外部内容の無いターン・UI・resume・無宣言は従来どおり、後退経路は宣言済みを押さない、
  email placeholder が一覧に出ない。D は源を読む門で、宣言の無い送信ボタンを足すと赤くなることを
  合成した源で確かめている（別ファイルの関数・転送シム・ハンドラの中のハンドラも）。
- 関連する既存の node テスト 1084 件、`check:catalog` `check:capabilities` `check:atlasrepeat` `check:static`。
- ⚠ **門の限界**: 別のボタンの `.click()` を呼んで押させるハンドラ（コメント欄の Enter →隣の投稿ボタン）は
  辿らない。その欄には手で宣言した。
