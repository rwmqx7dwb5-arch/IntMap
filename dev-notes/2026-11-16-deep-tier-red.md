---
title: nightly の deep tier が 2026-10-13 から毎晩赤——14 晩分の失敗を 1 本ずつ根本原因で直す（製品の欠陥 7 件・待ちの誤り 6 件・説明できない 3 件）
date: 2026-11-16
pr: 1151
newsen: Nightly-test fixes: keyboard map reading always says how far the map moved, borders for years like 1916 draw up to twice as fast, the Rise and fall readout stays when you click, the globe opens on the daylit side at any hour, and then-and-now cards wait for the old borders.
newsjp: 夜間テストで見つかった欠陥を直しました。キーボードでの地図の読み上げが移動距離を必ず伝えます。1916 年などの国境が最大で約 2 倍速く描かれます。政体の盛衰でグラフをクリックしても読み取りが消えません。地球儀はどの時刻でも昼側で開きます。あの頃といまのカードは昔の国境が描かれてから作られます。
---

〈依頼〉nightly の deep tier（`npm run test:deep` の schedule 実行）が 2026-10-13 から毎晩赤く、直近 14 晩は「連続で赤 0 件 / 続けて赤だったが最新は通過 3 件 / 散発 34 件」で警報として働いていない。落ちている spec を全部挙げ、環境要因・不安定な待ち・本物の退行を分けて根本原因で直す（再試行・閾値・skip で隠さない）。

## 0. 測った

14 晩（run 41351831565〜43644293243）の失敗ジョブのログを全部読み、「再試行でも落ちた」（Playwright の `failed`）12 本と、再試行でだけ通る常連（`flaky`）を失敗の文言ごとに数えた。`node scripts/deep-history.mjs` の台帳と一致。

## 1. 製品の欠陥だったもの

| spec（赤の晩数） | 原因 | 直し |
|---|---|---|
| keyboard-and-offline ①（7） | 読み上げモードの `enrich()` が、プロファイルを集める**前に**「最後に伝えた中心」を進めていた。矢印キーの段落が「=」の段落に取り消されると、移動の一文も一緒に消え、次の段落はほぼ 0 km の移動を測って黙った | `js/map-reader.js` は実際に読み上げる段落でだけ中心を進める（`js/map-narrator.js` が `current()` を渡す） |
| r410-late ②（6）・r410 ① | 1886〜2019 年の国境は CShapes・後期 OHM・Cliopatria・海岸の埋め草の 4 記録の合成で、`collectionAt`→`csComposite` が**順番に**読んでいた（手元 12.7〜14.4 s。CI は 24〜27 s で spec の 20 s を越えた） | `js/time-borders.js` `csSide` で 4 本を同時に読み始める。合成の鍵・失敗時の退き方は不変（同じ鍵 `cp:cs1916…` を確認）。手元 5.7〜9.4 s |
| r203 ①（3） | 夜の UTC では太陽直下の経度が ±85° を越える。地図はメルカトル・`renderWorldCopies:false` で作られ、地球儀は後から設定されるので、最初の resize がカメラを −84.78° へ引き戻し、画面の中央が夜側になった（旧コメントが「padding」と呼んでいたものの正体） | 地図を最初から開く投影で作る（`js/map-projection.js` `openingProjection`、`js/geo-engine.js` `_projSpec`/`_builtInProjection`、`js/app-body.js`）。`?flat` は世界の複製を有効にして作る。r203 ①b が 22:55Z に時計を固定して回帰を測る |
| then-now-card（1・再試行 13） | `compare.js` の `judged()` が、層の選択で始まる 2 本目の判定を記録しておらず、国境の記録を読んでいる途中で「判定済み」と答えた。カードはその直後に窓を撮っていた | `js/compare.js` はすべての判定が自分を最新として記録する。`js/map-recorder.js` `viewSettled` は判定のあと窓の `idle` を待って撮る（上限 `VIEW_SETTLE_MS`・由来はコード横）。上限に達したら `settled:false` と述べる |
| hist-product（再試行 9） | 政体の盛衰シートが、時計が動くたびに 200 ms 後に**シート全体**を `innerHTML` で描き直していた。時計に依存するのはグラフの「現在年」の線だけ。グラフをクリック（＝時計を動かす）すると読み取り欄・フォーカス・グラフの要素そのものが消えた | `js/polity-arc.js` `paintNow` は時計の変化でグラフ要素の中身と属性だけを差し替える（要素は同じノードのまま） |
| r184 ③（局所） | `footprintRing` が最後の点を方位 2π で計算し直していて、`sin(2π)≠0` のため環が厳密に閉じない（ISS 高度で 4.8%） | `js/satellites-live.js` は最初の点を写して閉じる（RFC 7946 §3.1.6） |

## 2. テストの待ち・測り方が誤っていたもの

- **r165 #4・r167 #4（再試行 12・8 晩）**: 言語の切り替えは日本語の語彙チャンクを初回に取りに行く（`js/lang-switch.js` `when`）のに、固定 700〜900 ms しか眠っていなかった。`<html lang>` が切り替え先になるのを `tests/helpers/settle.js` `until` で待つ（setLang の同じコールバックで再描画の直前に設定される）。r166・r167 は並行して入った test-time-headroom（#1105）が同じ形で直していたので、そちらに合わせ、残っていた r165・r168 の 4 か所を同じ待ち方にした（独自の helper は作らない）。
- **r174（再試行 9）**: 飛行シムは 1 コマの dt を 0.1 s で頭打ちにする（`js/flight-sim.js` `loop`）ので、10 fps を切る CI では機体の時間が実時間より遅れる。8×900 ms の実時間では 111.6〜116.4° までしか上がらなかった。機首角が 120° を越えるまで待つ。
- **maplibre-6-migration ③b（2）・③**: 2 枚の画像の差で点を探していたので、地平線付近のラベルの出し入れも点に数えた。隠す→出す→隠すの 3 枚で、出したときだけ変わって戻る画素を点とする（`installProbePixels` を ③ と ③b で共有）。
- **r530（2）**: 共有ページに前の spec の航空機層が残っており、Maribo のラベルへのタップは機体が正しく受け取っていた。タップのあと `IntMapGeoEngine.events.clickClaimed` に訊き、他の持ち主が取ったら次のラベルへ移る（取られていないのに何も描かないのは失敗のまま）。
- **r201 ③（1）**: ズームアウトの押し込みを 2 回の `evaluate` に分けていたので、間が 900 ms（`OVER_DECAY`）を越えると身振りが終わったと扱われた。1 回の `evaluate` で押し込む。
- **r184 ⑤（4）・①（1）**: 衛星は ISS が先頭にあると仮定して `list()[0]` で代用していた（「LCS 1」）。射程の上限 13,000 km は根拠のない数で、地球の裏側の ISS は 13,156 km が正しい。ISS は NORAD 25544 で探し、射程は三角不等式 `rSat−rObs ≤ range ≤ rSat+rObs` で測る。⚠ ISS が欠けた真因は**同梱 TLE が 2026-10-22 から更新されていない**こと: 更新ボットの PR #1127 は main の「全 job に timeout-minutes」検査の赤で止まっていた（#1139 で解消済み）。CelesTrak に届かない晩は、同梱カタログの最新 epoch に時計を合わせて同じ検査を全部走らせる（skip しない）。

## 3. 説明できなかったもの（推測で直していない）

- **r170 「3-D volume」（3 晩・再試行 9）**: 地面の読みが `ground 0 / reading / error なし` のまま。CI の記録では DEM タイルは 3-D クリックの 8.8 s 後に全部 200 で届いている。手元では 6×・12× の CPU 絞り、SwiftShader、worker 1 本、DEM 9 s 遅延、CI の時刻のどれでも再現しなかった。製品も検査も変えず、失敗時に地形ソースが読み込み済みか・地図がコマを描いているか・中心での直接の標高を書き出すようにした（次に赤くなった晩に原因が分かる）。
- **r179 globe z1.7（1）・restored-layer-before-style（1）**: どちらも上限時間切れで、ログに個別の原因が無い（同じ晩の兄弟ケースも上限近く）。

## 4. 次の人のための事実

- 実行中に地球儀を Flat へ切り替えると、まだ ±84.78° に引き戻される（投影が先に変わり複製が後に有効になる）。同じ族の別経路で、今回は触っていない。
- `satellites-live.js` の `groundTrack(id, when)` は共有の時計でなく `new Date()` を既定にしている。時計を動かすと軌跡と点が食い違う。
- Atlas の `narrow()` は衛星カタログごとに固定 6 s 待ち、オフラインでは ISS の検索に 69 s かかった。
- 時刻 T の読み込みが上限時間で失敗すると `collectionAt` が 1914 年の snapshot へ落ち、`go()` は何も返らないときしか再試行しないので、年を変えるまでそのまま。

## 5. 検査

各 spec を `--retries=0` で 3〜5 回ずつ単独実行して緑。`check:static`・`check:engine`・`check:types`・`check:testbudget` 緑。
