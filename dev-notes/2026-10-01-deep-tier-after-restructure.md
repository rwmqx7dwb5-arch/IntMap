---
title: 構造改革 13 本のあとの deep tier（run 36772277497）の赤 4 件は、4 件とも観測器だった——歴史の束の先読みは動いていて DevTools プロトコルが読み切った取得を ERR_ABORTED と報告し、残り 3 件は滑らかなスクロール・フェード・入力の往復に固定の待ちで賭けていた。製品は変えていない
date: 2026-10-01
---

〈依頼〉 main 1a66ec7（2026-09-30 の構造改革 13 本の後）で手動実行した deep tier run 36772277497 の失敗を切り分ける。A: `tests/history-prefetch-on-demand.spec.js`（1 回目も再試行も赤）。B: `tests/r169.spec.js` #3、`tests/r203.spec.js` ②③（散発か、今日の変更——凡例の合流・重なり順・起動の減量の宇宙エクスプローラ遅延読み込み——による退行か）。

## A. history-prefetch-on-demand —— 製品は正しく、観測器が嘘をついていた

**症状**: Chronos を押したあと、`data/cshapes.js` と `data/hist-admin1.js` の `requestfinished` を 60 秒待って時間切れ。ローカルでも毎回再現した。

**切り分け**（2026-10-01、この worktree・Playwright Chromium・同じ hermetic routing）:

- 押した 0.8 秒後に 2 本とも `request` が出て、**`response` は 200**、そのあと **`requestfailed net::ERR_ABORTED`**。
- 同じ瞬間の扉は `IntMapHistBundles.counts()` = `opened:2`・`broken:false`・`inFlight:0`、`requested('__CSHAPES')` と `requested('__HISTADM1')` は true、`loaded()` も true——**Worker は全バイトを `JSON.parse` し終えていた**（1 バイトでも欠ければ parse は失敗する）。
- ページ自身の Resource Timing は、同じ要求について **status 200・encodedBodySize 11,218,612・decodedBodySize 41,457,871**（`data/hist-admin1.js`）、`data/cshapes.js` は 3,921,167 / 12,955,808（ファイルの大きさと一致）。
- 製品を外して素のページで `fetch` → `getReader()` で読み切る形だけを試すと、**3 回中 1 回**が同じ `ERR_ABORTED`（hermetic routing の有無は関係なし）。`arrayBuffer()` で読んだ場合は全部 `requestfinished`。アプリ内では 4 回中 3 回。
- `js/fetch-deadline.js` `readWithin` は読み切ったあと abort しない（`done=true` の後に `relay()` は走らない）。

⇒ **#837 で束の読み方が `<script>` から「本文をストリームで読み切る fetch」に変わり、DevTools プロトコルの完了イベントが「届いた」を意味しなくなった**。`js/chronos.js` の意図 → `js/time-borders.js` / `js/time-admin1.js` の `onIntent` → `IntMapHistBundles.open` の配線は新しい扉に届いている（製品の退行ではない）。

**直したもの**（`tests/history-prefetch-on-demand.spec.js`、主張は緩めていない）:

- 「いつ頼まれたか」は従来どおり `request` イベント（成否に関係なく出る）。
- 「届いたか」は**ページの Resource Timing**——init script の `PerformanceObserver({type:'resource', buffered:true})` が data/ の完了を集め（バッファが一杯でも落ちない）、2 本が **status 200・本文 > 0** で揃うまで待つ。バイト数の記録もここから。
- 扉の側の事実として `IntMapHistBundles.requested()` が 2 本とも true であることを足した。
- 起動中に 1 本も頼まれていないこと・意図のあとに 2 本が来ることの主張はそのまま。

## B. r169 #3・r203 ②③ —— 散発。今日の変更による退行ではない

**履歴**（`node scripts/deep-history.mjs`、直近 14 晩）:

| test | 赤の晩 | 再試行で通った晩 | 日付 |
|---|---|---|---|
| r169 #3 | 0 | 5 | 09-16, 24, 25, 26, 27 |
| r203 ③ | 1 | 2 | 09-18, 25, 29 |
| r203 ② | 0 | 1 | 09-18 |

r203 ③ の 09-29 の赤は **b684b168（2026-09-29 20:12 UTC）**——宇宙エクスプローラの遅延読み込み（2026-09-30 05:13 UTC）より前で、**同じ assertion（`the map is back`: true）**で落ちている。しかも r203 は `beforeAll` で `IntMapSpace.ready()` を待つので、③ の crossing は本体の到着後に起きる（到着前の `enterFromZoom()` は `js/space-approach.js` が到着の promise に積む）。凡例の合流・重なり順はどちらの経路にも触れない。

### r169 #3 —— 滑らかなスクロールに 900 ms で賭けていた

- `#live-news-feed` は `.content-area` で、`css/intmap.css` が `scroll-behavior:smooth` を与えている。`feed.scrollTop = feed.scrollHeight` は位置を動かさず**アニメーションを始める**だけ。
- 実測（この boot）: 合成した scroll を送った時点の `scrollTop` は **0**（リスナーの「末尾近く」判定は偽で何も足されない）、第 2 束はアニメーション自身の scroll イベントから **614〜644 ms 後**に来た——900 ms の待ちに対して 300 ms 未満の余裕で、フレームで進むアニメーションは混んだ走者で伸びる。
- 同じ待ちは他人の再描画の窓でもあった: フィードの `innerHTML` setter を包んだ probe で、`js/auth-ui.js` の `onAuthStateChange` → `setTimeout` → `refreshCurrentUser`/`loadFavorites` → `startNews()` がフィードを空にして最初の 30 件を描き直すのを、News タブを開いてから約 3.3 秒後に観測（正当な再描画で、製品は変えていない）。
- **直したもの**: `scrollTo({ top, behavior:'instant' })` でこの 1 回だけスタイルシートを上書きし、合成 scroll を送った**同じタスクの中で**数える。リスナー（`js/app-body.js`）と `appendNewsBatch`（`js/news-ui.js`）は同期なので、`dispatchEvent` が返った時点で 45 件ある。主張（閉包の `renderedCount<newsFiltered.length` への書き戻し）はそのまま測っている。
- ⚠ 否定した 1 回目: `scrollTop =` のまま同期で読む形にしたら **3 回中 3 回赤**（30 件）——これで滑らかなスクロールが主因だと分かった。

### r203 ③ —— フェードの終わりに 1,200 ms で賭けていた

- `leaveToMap()` はカメラを即座に動かし、探索器を閉じるのは 250 ms のフェードの終わり（`js/space.js` `fadeRoot`: 次のアニメーションフレーム → +270 ms → `close()`）。閉じる時刻は「1 フレーム＋270 ms」で、フレームの長さは走者が決める。
- 実測（ローカル・CPU 抑制 1x / 4x / 8x）: **443 / 683 / 624 ms**。CI の失敗時スクリーンショットには既に地図が戻っている（閉じたのが 1,200 ms より後だった）。
- **直したもの**: `waitForFunction(() => !IntMapSpace.state().open)` で**戻ったことを待ってから**大きさと顔を測る（戻らなければ従来どおり赤）。回転した往復も同じく閉じるまで待ち、`back` を assert する——残ったフェードが次の ④ の `open()` を閉じてしまう形も塞ぐ。

### r203 ② —— 同じ点へのマウス移動 11 回が予算を使い切っていた

- run 36772277497 の再試行の trace: **assertion は全部通っていた**（90 フレーム・遠方平面の跳びは上限内）のに、最後の `jumpTo` の途中で 60 秒切れ。混んだ走者で `mouse.move` 1 回 0.3〜1.6 s、`wheel` 1 回 0.8〜2.7 s。
- 12 回の wheel の前に毎回同じ座標へ `mouse.move` していた。**移動は 1 回にした**（wheel は現在位置に出るので、何も変わらない往復を 11 回減らした）。上限は延ばしていない。

## 検証

- 修正前: A はローカルで毎回赤。r169 / r203 は `--repeat-each=4 --workers=3` で 60/60 緑（ローカルでは再現せず、CI の負荷でだけ出る——上の実測がその理由）。
- 修正後: A `--repeat-each=3` 3/3 緑。r169 + r203 `--repeat-each=3 --workers=3` 45/45 緑。3 本まとめて `--repeat-each=3 --workers=6`（負荷をかけて）48/48 緑。
- `npm run check:static` `check:docs` `check:engine` `check:types`。

## 変えなかったもの

製品のコードは 1 行も変えていない。`js/auth-ui.js` の認証イベントがフィードを最初の 30 件に描き直す（スクロールして読み進めた位置を起動直後に失いうる）のは、この依頼の外なので記録だけ残す。
