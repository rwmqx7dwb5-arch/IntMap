---
title: nightly で 2〜6 晩続けて赤だった 6 件——4 件は検査の形の陳腐化、1 件は見本の綴りの陳腐化、1 件は地方区分が国境の描画と取り合っていた（国境を先に描く順に）
date: 2026-10-08
newsen: When you move the clock to a past year, the country borders now appear first and the provinces follow, instead of both arriving late together.
newsjp: 時計を過去へ動かしたとき、国境が先に出て地方区分が続くようになった（以前は両方がそろって遅れて出ていた）。
---

〈依頼〉利用者「続きやって」→「全権を委任する」。`worktree.mjs status` が nightly の deep tier で連続して赤の 6 件を退行の疑いとして挙げていた。

## 0. 測った

最新の nightly（run 37695484150）のログと `nightly-blame` の範囲から 1 件ずつ再現し、止まる場所を確定した。手元の build は並行作業で混み、
`IM_PREBUILT_DIST=1` と専用ポートで走らせた。製品の退行だったのは 1 件（r410-late）だけで、残り 5 件は検査か見本が古くなっていた。

| spec | 晩 | 原因 | 直したもの |
|---|---|---|---|
| `layer-manifest` ⑥ | 6 | 凡例を HTML の写しと比べていた。#978 が年の行に意図して足した `data-prints-map-time` 1 属性で落ちた（#902 の SVG 化に続き 2 度目） | 凡例は「何を述べているか」（表示・文言・操作の名前・範囲・色・状態）で比べる。地図側はバイト一致のまま |
| `atlas-briefing` ① | 4 | #980 で `NOTEBOOK_SHOWN=false` になり、ノートの入口（keep・compare）が描かれないのに押そうとして 240 s 待っていた | 製品の切り替えそのものを import して分岐。隠している間は入口が無いこと・`briefing.share` が訊き返すことを確かめる |
| `r493` | 3 | dist のチャンクを export 名で import していた。#998 で 2 つの遅延チャンクが共有するチャンクになり、名前が `t` に縮められた | Atlas が実際に通る道（`inspect`）で撮った画像を測る。回帰: dist のチャンクを名前で探す spec は、そのモジュールが `import()` の的であることを要求 |
| `restored-layer-before-style` share-embed | 3 | #1003 でプレビューが共有パネルの下へ下がり、ドラッグの始点が画面外（iframe の上端 y=683、高さ 293）だった。埋め込みの地図はドラッグで動く | 利用者と同じくスクロールして入れてから触り、`elementFromPoint` がその iframe を返すことを先に確かめる |
| `landing-showcase` japan-1900 | 2 | #1021 で 1891〜1943 年の府県の出どころが自作復元に移り、綴りが「Kagawa」→「Kagawa Prefecture」になった。失敗文のスウェーデンの区分は配列の先頭が見えていただけ | 見本の `drawn.admin` を記録の綴りに。回帰: 見本の名前はその日付に効力のある単位の名前かを node でデータに訊く |
| `r410-late` ② | 2 | 製品。下の §1 | 下の §1 |

## 1. 1916 年の国境が 20 秒の上限を越えていた

止まっていたのではなく遅かった（以前から 13.3・17.7 秒で上限の手前）。CPU 3 倍絞りで測ると、地方区分を出したままだと国境まで 27〜35 秒、
地方区分の束を拒むと 14〜21 秒。最大の単独処理は #1020 が地方区分の線にも入れた `strokedOnce`（共有辺を 1 回だけ描く）で、1916 年の
387,993 区間に 490〜534 ms——型付き配列の表に書き直して約 50 ms（出力は旧来の規則の参照実装と完全一致）。それでも全体は動かなかった。

⚠ 否定された見立て: 「地方区分の組み立てを 1 フレームずつ刻めば国境は飢えない」。プロファイル上、地方区分自身のスクリプトは約 1.5 秒で、
残りは約 11 MB の GeoJSON を MapLibre が複製して worker へ送る処理（`_dispatchWorkerUpdate`、ページのスレッド）と描画——こちらからは刻めない。
歴史データ用 Worker を記録ごとに分ける案も全体時間が変わらず戻した。

直したのは順序: `js/time-borders.js` の `settled()` が時計のイベントで国境の番を開き、その時刻の国境がどう終わっても（描いた・同じ・現代年・
答えが来ない・`clear()`）閉じる。`js/time-admin1.js` はタイル線の絞り込みを先に合わせてから、束を読む前に番を待つ。

| 3 倍絞り・1916 年欧州・各 3 回 | 国境が出るまで | 地方区分が出るまで |
|---|---|---|
| 前 | 23.6 / 31.5 / 34.8 s | 16.0〜26.7 s |
| 後 | 10.2 / 11.1 / 12.2 s | 15.3 / 16.5 / 17.1 s |

テストの 20 秒は延ばしていない。⚠ 残る経路: 国境の束の読み込みが終わらないまま止まると地方区分も出ない。束の読み込みは時計付きで、
worker が死んでも拒否されるので有限時間で閉じるが、その時間切れの値は測っていない。夜間 CI の負荷での緑はこの PR の後の nightly が答える。

## 2. 検査

`tests/deep-tier-reds-checks.test.mjs`（5 件）: ① dist のチャンクを名前で探す spec はその的が `import()` されている ② ノートの入口を押す spec は
`NOTEBOOK_SHOWN` を読む（入口はソースから拾う）③ 見本の `drawn.admin` を記録に訊く ④ `strokedOnce` が旧来の規則と実データ 1916 年で一致
⑤ `scripts/histeras/time-borders.mjs` で `js/time-borders.js` を動かし、番が開き・保留中は開いたまま・失敗でも `clear()` でも閉じる
（`time-admin1` の並び順はソースを読むだけ——動かすハーネスが無い）。
6 本の spec を単独で緑、`check:static`・`surface`・`histeras`・`histrecon`・`histfidelity`・`bordercoast`・`borderdetail`・`perf`・`types`・`engine`。

別件として記録: 共有パネルで「プレビュー」を押したときにプレビューを画面内へスクロールすると親切（UI の変更なので入れていない）。
`restored-layer-before-style` の 183 行目は所要時間が 2.5→2.7→3.7→4.0 分と伸び、天井 240 s に近い（10-07 の 1 晩だけ `dl-radar` が 102 秒 loading のまま。未調査）。
