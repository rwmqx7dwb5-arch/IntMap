---
title: Atlas の到達性検査が「能力表→画面」の向きしか測らず、画面から Atlas に届かない操作と死んだ widgets 能力が見えなかった——逆向きを測る
date: 2026-11-19
pr: 1224
newsen: Atlas can now press more of the page's own controls (list options, switches, tabs, menu items, summaries), the W key and Atlas open the real Add-a-widget sheet again, and checks now fail when a control or a capability's screen entry goes unaccounted for.
newsjp: Atlas が押せる画面の部品が増え（選択肢・スイッチ・タブ・メニュー項目・折り畳み見出し）、W キーと Atlas が実在の「ウィジェットを追加」シートを再び開くように。画面の操作や能力の入口が宣言されないと検査が落ちる。
---

〈依頼〉 Atlas から届かない機能の調査（`side-session-notes/.../atlas-reach-gaps.md`）の穴を、特例でなく構造で塞ぐ。

## 0. 測ったこと

- `check:catalog`・`check:capabilities` は能力表→画面（`ui.at` が実在するか）だけ。画面→能力表は誰も測っていなかった。
- `system.control` の選択子（`_ctlEls`）は `role=option/switch/radio/tab/menuitem`・`summary`・ページ内 `a` を含まなかった（本番実測: option 80・switch 175×2）。`IntMapUIAudit.run()` の 100% は「名前がある」だけで「届く」ではなかった。
- `window.IntMapWidgets` は #R15 の空 stub（`toggle:function(){}`）。W キーと `panel.widgets` はそれを呼んで成功を報告していた（one-pass 規則の症状 1）。実在するのは `IntMapWidgetGallery`。

## 1. 変えたこと

- **選択子を 1 本に**: `js/atlas-controls.js` の `_CTL_SEL` を `findControl`/`controlCatalog` と新しい `IntMapUIAudit.reach()` が共有。上の役割と `summary`・`a[href^="#"]` を足した（外部文書へのリンクは「ページの機能」ではなく内容として数えない。タブ停止だけで widget の役割を持たない card/canvas も構造として数えない）。
- **`IntMapUIAudit.reach()`**: DOM から「操作部品」（ネイティブ・ARIA widget・tabindex・onclick・`cursor:pointer`）を数え上げ、`_CTL_SEL` に当たらず祖先にも当たらないものを返す。一覧は手で持たない。`tests/atlas-screen-reach.spec.js` が設定・レイヤー・ツール・ニュースを開いた状態で 0 件を要求（本番相当ビルドで 750 件中 0）、植えた div が名指しされることも確かめる。
- **`ui-declared`（check:capabilities ㉕）**: 生きている能力はすべて `ui`（at/key/none+日付）を宣言する。13 件が未宣言だったので埋めた（draw 系は `#btn-tool-draw`、画面に入口の無いものは `none: 2026-11-19`）。
- **widgets**: 死んだ app-body の stub と、`return;` で始まる 40 行の死んだ IIFE を撤去。`widgets.js` が `window.IntMapWidgets = { toggle, isOpen, refresh }` を公開（実体は「ウィジェットを追加」シート）。W キーと `panel.widgets` は同じ入口に着き、観測器は `isOpen()`（シートが開いたか）を測る。`panel.widgets` の `ui` は `{ key: 'W' }`。
- 回帰: `tests/atlas-screen-reach-checks.test.mjs`（過去の穴 = 空の公開ドア・未宣言の `ui`・観測器が呼んだだけで ok と言う形、を落とす）。

## 2. 直していないもの（理由）

- **言い回しの到達（語の一致だけだと 24%）**: モデルは自分で検索語を書くので「届かない」の下限ではない。`search` は #R802 以来細かく調律されており、phrases を足すのは Atlas の順位を動かす変更なので、この変更では触らない。夜間評価（secret 不在で 30 回停止）が通ってから、意味検索側と合わせて測る。
- **`layers.countryInfo`**: 画面の行は #R469 で隠しに移った。Atlas のほうが多くできるのは欠陥ではないので `none` のまま。画面へ戻すかは別の判断。
- **`system.module` の引数つき操作・lazy モジュール**: 「届かない」を実証していない。モジュールが自分の操作を名乗る仕組みは別の変更で。
- 名指す検査の無い 76 能力: 別途。

## 3. 数

撤去した死んだ IIFE は L() の 5 言語表を持っていたが `return;` で到達不能だったので、i18n の床（tests/i18n-coverage-floor.json）を実測まで下げた（読み手が失う行は無い）。

孤立した翻訳 4 キー（天気・為替の読み込み中／失敗の表示、16 行）は `i18n-dead-key-codemod --write` で撤去。

`check:capabilities` 25→26 検査。core tier 5→6 本（`docs/TESTING.md` ほか追従）。`fetch-deadlines`・`global-surface` の台帳は死んだコードの撤去分だけ更新。

## 4. CI で赤くなって直したもの

- `tests/durations.json` に新しい spec の実測（8 s）を記録。未測定だと p75 の 32 s が core に課金されていた。spec は 1 秒の価格を超えるので core には入らず deep に置かれる（core 5・deep 168・全体 173）。
- `scripts/device-storage-words.json` の `local:intmap_widgets` を撤去し台帳を再生成（死んだ IIFE が最後の書き手だった）。
- `tests/perf-baseline.json`: `eager.modules` 908→909 を、main を取り込んだこの木で実測して引き上げ。この変更の差分に import の追加は無い（`js/widgets.js` と `js/atlas-controls.js` は既存モジュール内の編集）ので、+1 の出所は main 側の取り込みの可能性が高いが、どのモジュールかは特定していない。
- `ui-declared` は main から入った `data.gisExport` を初回で捕まえた（GIS パネルを入口として宣言）。
