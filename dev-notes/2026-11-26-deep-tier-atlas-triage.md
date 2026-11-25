---
title: 夜間 deep tier の連続赤を Atlas 周辺から切り分け、観測器の誤報（凍結した夜間評価）を直す
date: 2026-11-26
internal: 製品の挙動は変えていない。spec 3 本が守る契約を、現在の製品が実際に述べている契約に合わせた。status の 1 行が実体（workflow の状態）から凍結を述べる
---

〈依頼〉 夜間 deep tier が 13 件連続で赤（run 45527400586）。Atlas に関わるものを原因のレベルで直す。`status` が凍結済みの Atlas 夜間評価を失敗と報じている。

## 測った（現在の main を build して deep 単独で再現）

| spec | 原因 | 製品の退行か |
|---|---|---|
| `r494 #4` | 出典の溢れチップは、押すと消える（旧）から、押すと「−」に変わり畳める（新）トグルになった（#1256 の回答表示の仕上げ・`js/atlas-reply.js`）。spec は「消える」を期待していた | spec が古い。新契約（展開で 9 件・チップは「−」・`aria-expanded=true`・もう一度で 6 件に戻り「+3」）を検証するよう書き直した |
| `r145 トグル` | タブのボタンが `IntMapOS.press('panel.tab')` → `execute()` を通る（#1278・2026-11-19）ので、Atlas 欄はクリックの中でなくその扉が答えたあとに載る。spec はクリック直後に `.atl-chat` を同期で読んでいた | 製品は意図どおり（#1278 の記録）。spec は読者が見る載った状態を待つ形にした。待ちは 5 秒までで、載らなければ従来どおり落ちる |
| `atlas-cited-answers ①` | 夜間の失敗は #1423 より前のコード。**手元では旧コード（35feb77）でも現コードでも再現しない**。CI の失敗スナップショットは、本文 `6,879` の直後に `[1]` があるのに、テストが読んだ瞬間は印が 0 個だった（出典リストの再描画と本文の印の付与が別の時刻に届く）。確定はできていない | 競合の疑い。spec は読者の `[n]` が画面に出るまで待ってから読む。印が付かないのが実際なら 30 秒で落ち、診断は残る。来夜も赤なら原因は別に居る |

`atlas-cited-answers ②〜⑤` ほか 3 本の spec は現在の main で緑。

## 直さなかったもの（Atlas ではない）と見立て

- `data-governance #729`: Re:Earth の建物の出典文が odbl を二度述べる（出典の文面の重複・データ側）。
- `r353-live`: 同梱の火山カタログに無い火山 243018 をフィードが名指す（同梱カタログの鮮度）。
- `landing-showcase`: 共有リンクの投影が `flat` のはずが `globe`（共有・投影の状態）。
- `form-control-names ③`: `#share-panel` の `input.sh-url` に名前が無い（共有パネル）。
- `r160`: 右サイドバーを開いても HUD が左へ寄らない（ HUD の配置）。
- `restored-layer-before-style`: 埋め込みの帰属表示に © が無い（#1423 の背景地図帰属の分離で `Powered by Esri …` になった可能性・要確認）。
- `r147`: 企業ロゴの梯子が解決しない／`r184-cesium-fs`・`r181-cesium`: Cesium のズーム差（0.286）。

どれも原因は特定していない（再現と見立てだけ）。spec の数字を書き換えて緑にはしていない。

## 観測器の誤報

`node scripts/worktree.mjs status` は凍結中の `atlas-eval.yml`（`disabled_manually`・2026-11-19 の開発者の判断・`dev-notes/2026-11-19-atlas-eval-frozen.md`）を「成功 0 回」の ⚠ として毎回報じていた。
`scripts/lib/nightly-status.mjs` が workflow 自身の状態を GitHub に訊き、`disabled*` なら凍結中（再開手順つき）と述べる。凍結かどうかは書いておらず、再開（`gh workflow enable`）すれば次の status から赤・緑の判定に戻る。有効なまま赤い場合は従来どおり赤。

## 手元の注意

ビルドは 3 分を超えるので、spec の単独実行は先に `npm run build` を済ませ `IM_PREBUILT_DIST=1 IM_TIER=deep npx playwright test …` が確実（webServer の 180 秒に収まらない）。
