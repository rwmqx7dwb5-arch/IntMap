---
title: スマホでシートを引き上げると「はじめる」——ライブのレイヤーを 1 タップで点けて地図へ下りる「いまの地球」・いまいる場所・この日と作例・ホーム画面への追加が、ウィジェット板の上に並ぶ（最初の画面は地図と検索欄のまま、何も自分では開かない）
date: 2026-10-13
newsen: On phones, pulling up the sheet now starts with "Live now" — rain radar, earthquakes, aircraft and other live layers, one tap each, the map right behind — then Here, now, the day's map, example maps and, where your browser allows, adding IntMap to your Home Screen.
newsjp: スマホでシートを引き上げると、まず「いまの地球」が並びます。雨雲レーダー・地震・航空機などのライブのレイヤーを 1 タップで点けると、そのまま地図に戻ります。続いて「いま、ここ」、この日の歴史地図、作例、そして（対応するブラウザでは）ホーム画面への追加です。
---

〈依頼〉第 4 波・UI／モバイル体験／初回体験／PWA の商品開発。「スマホで初めて開いた人が 30 秒で価値に着く体験を設計から。preview の mobile 幅で
実測し、スクリーンショットを撮って確かめる」。前提（利用者の決定）: 基本表示はレイヤーと呼ばない・既定のデータレイヤーは無し・地球儀のまま・
iOS 風・「改善」は作り変え。

## 0. 測った（着手時 `6830fffd`、390 × 844・タッチ・ストレージ空・ビルドしたアプリ）

- **最初の画面**は地球儀・右上の操作グループ・下の検索欄の行（`min`）。初回の歓迎カードは利用者の依頼で撤回済み（#R104）、初回は地図が全面
  （`dev-notes/2026-10-03-first-impression.md`）——この 2 つは守る前提。
- 新しい人が最初にする操作は 2 つ: **検索欄を押す**か、**シートを引き上げる**。前者は既に「いま、ここ」「写真の場所」・この日の歴史地図・
  作例へ着く（`js/search-geocode.js` の空の状態）。**後者は着かなかった**: 半分の段の中身はデスクトップの見出し（IntMap／Log in／Feedback／
  Settings）とタブの行、その下の既定のウィジェット板——時計・USD/EUR の為替・「おすすめレイヤー」・国カード（スクリーンショットで確認）。
  about.html とインストールしたアプリの説明文が約束する 2 つ（「今日の世界をライブで——地震・雨雲レーダー・航空機」「どの年にも」）は、
  iOS で最も自然な操作の先のどこにも無かった。
- ライブのレイヤーを点けるには Layers 画面を開いて棚の中から探す必要があった。ホーム画面への追加は 設定 ▸ About & support の中だけ。

## 1. 作ったもの

**シートのホーム**（`js/start-home.js`、新規）。タブを選んでいないシートの先頭に 4 節、その下に同じスクロールでウィジェット板:

1. **いまの地球**——ライブのレイヤーのスイッチ。押すとそのレイヤーが点き、シートが `min` へ下りて地図が見える（地図が答え＝`MAP_ANSWER_EVENT` `card`）。
   もう一度押すと消え、シートは動かない（消すのは答えではない）。読者に何も求めない（位置も年の選択も要らない）始まりなので先頭に置いた。
2. **いまいる場所**——「いま、ここ」「写真の場所」。検索欄の空の状態と**同じ行**（`js/here-entry.js` を `entryRow` に分け、押したときに何を
   終えるかだけを置き場ごとに渡す）。
3. **この日の歴史地図と作例・ツアー**——検索欄の帯そのもの（`js/showcase-gallery.js` `showInResults`）。カードの開き方も同じ `choose`。
4. **ホーム画面への追加**——設定の入口と同じ保持された `beforeinstallprompt`（`js/installable-app.js` に `installState`・`promptInstall`・
   `onInstallChange` を足して両方の入口から読む）。押せる prompt があるときはボタン、iOS Safari は手順の 1 文、インストール済み・どちらも
   無いブラウザには何も出さない（設定と同じ規則）。

**一覧は書いていない**（`.agents/rules/no-ad-hoc-hardcoding.md`）。「いまの地球」は `liveStarts` が 3 つの持ち主から導く:
時間の宣言が「いま」を述べる（`js/layer-time-decl.js` `kind:'live'`）・パネルが畳んでいない（`js/layer-manifest.js` の `rest` でも beta の
棚でも hidden でもない）・パネルの行が組まれている。名前はタイルと同じ `IntMapLayerSidebar.rows()`（`js/map-ui.js` の `rowsFromDropdown`
を返り値に足しただけ——3 本目の「行の名前」の実装を作らない）。この木では 7 層（Precipitation radar・Live satellites・Aurora forecast・
Weather & disaster warnings・Earthquakes・Ukraine frontline・Live aircraft traffic）。宣言を足せば翌日から並ぶ。

**起動では何も増えない**。`js/start-home.js` を静的に import するファイルは無く、`js/mobile-ui.js` `wantStart` がシートを**掴んだとき**
（`dragStart`）か `min` より上で止まったとき（`setDetent`）に読む。`min` のシートは検索欄の行のまま。幅が広がるとボードを列へ返す
（`unmountStart`）。埋め込みにはシートが無いので読まない。

**ボードは貸すだけ**。`.m-home` がホームの唯一のスクロールで、`#widget-board` をその中へ移す（id・render・持ち主の表示／非表示はそのまま）。
「タブを選んでいない」の判定は持ち主（`js/widgets.js` がボードに書く `display`）を CSS の `:has()` で読むだけ——2 つ目の判定を作らない。

## 2. 見つけて直したこと

- **断った層は自分のチェックを `change` 無しで外す**（実測: 外部ホストを塞いだ spec で雨雲レーダーが `layerState.report` の直後に
  `cb.checked=false`——`js/layer-pkg-radar.js`）。地図の状態ストアには届かないので、最初の版のスイッチは「押されている」と言い続け、
  次のタップがレイヤーを**点け直して**シートを下ろした（spec ③ が捕まえた）。スイッチは状態ストアの `toggles` に加えて `layerState.on` も
  聞き、報告した側がその手番を終えた後（マイクロタスク）にチェックを読み直す。

## 3. 確かめた

- スクリーンショット（390 × 844、ビルドしたアプリ）: 半分の段で「いまの地球」の見出しと最初の 2 つのスイッチ、全体の段で
  いまいる場所・作例・ウィジェット板。Earthquakes を押すとシートが `min` に下り、地球儀に震央が描かれ、凡例チップ（1）が出た。
- `tests/wave4-ux-mobile.spec.js`（本物の指＝CDP のタッチでシートの頭を引き上げる）: ① 起動で `js/start-home.js` を取らない・ホームが無い
  ② 1 回引き上げると指を離す前にホームがあり、最初のスイッチが画面内で指を受け、名前はタイルと同じ、並びは「いまの地球」が先頭、
  ボードが同じスクロールの中 ③ スイッチで点く→シートが下りる／断った層はスイッチもそう言う／保った層をもう一度押すと消えてシートは動かない
  ④ タブを選ぶとボードと一緒にホームが消え、幅を広げるとボードが列へ戻る。
- `tests/wave4-ux-mobile-checks.test.mjs`: `liveStarts` を実際の宣言とマニフェストで評価（3 つの事実のどれかを欠く層は出ない・行が無ければ
  出ない・宣言が live でなくなれば消える）／起動経路に無い／検索とホームが同じ行／install の 2 入口。`!l.rest` を外す・`dragStart` の
  `wantStart()` を外すと落ちることを確かめた。
- 時間（このマシン・負荷の高い状態・外部ホストを塞いだビルド）: 読み込み開始から、1 回の引き上げで「いまの地球」が画面内に出るまで 6.7〜11.4 秒
  （起動を含む。spec ② が毎回印字する）。点けたレイヤーの描画はそのレイヤーの上流の速さに従う。
- 作例の帯の「すべて見る」とこの日のカードの「すべて」は指には 32 px だった（どちらもポインタ向けに描かれた帯の部品）。シートのホームの
  中では 44 px にし、spec ② が「はじめる」の全ボタンの高さを測る。
- `tests/mobile-next.spec.js` ① の選択子を `#ms-results .hn-entry` に絞った。同じ行がホームにもあり（検索の一覧が開いている間は隠れている）、
  文書全体の `.hn-entry button` が隠れた方にも「指が届く」かを問うて落ちた。主題（検索欄の空の状態）と強さは変えていない。
- 影響しうる携帯の spec を build 済みで単独に走らせて緑: `mobile-next`・`ui-a11y-polish`・`mobile-panels-reach`・`map-next`・`first-impression`。

## 4. 共有窓口と試験の予算

- `check:surface`: 新しい読みは 4 件で、どれも持ち主がまだ export を持たない窓口——`window.IntMapLayerSidebar`（パネルの行。js/map-ui.js の IIFE）・
  `window.IntMapOS`（OS のコマンド。js/app-body.js の IIFE）・`window.IntMapI18N`（言語。js/here-entry.js・js/showcase-gallery.js と同じ読み方）・
  `globalThis.IntMapSafe`（エスケープ。同じ）。`window.IntMapDevice` の読みは `js/mobile-ui.js` の 2 つの問いを 1 つの `embedded()` にまとめて増やしていない。
  基準は `node scripts/global-surface.mjs --update`。
- `tests/durations.json` に 22 秒（4 件の testcase の和、実測 21.6 s）。1 秒を越えるので deep。件数の写し（docs/FILES.md・docs/TESTING.md・
  package.json・scripts/worktree.mjs）を deep 158 / 全 163 に合わせた。⚠ **全体の天井（87.5 分）を 0.4 分越える**——着手時の木がちょうど天井にいたため。
  天井は上げず、どこから時間を取るかは統合で決める（`scripts/test-budget.mjs` の台帳の流儀）。
