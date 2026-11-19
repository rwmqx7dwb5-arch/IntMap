---
title: 夜間 deep の 33 件を原因別に分け、14 晩を読めなかった欠陥と ReDoS 指摘 #269 を直した
date: 2026-11-19
---

〈依頼〉 夜間 deep tier の赤が製品の退行かテスト・環境の問題かを継続して判定できる状態にする。Issue #275 の 33 件の分類、14 晩分を読めない欠陥、コードスキャン #269（Issue #1156 の中身）。

## 0. 14 晩が読めなかった理由

`scripts/deep-history.mjs` は shard の job ログを `gh api …/logs` で取る。gh 2.96 は応答に端末のエスケープシーケンス（Playwright の色コード）が含まれると
「pass --allow-escape-sequences」と言って拒否する。CI のログには必ず色が入るので、**全夜・全 shard が「未読」**になり、
連続赤の判定（`regressions`）が常に空だった。#275 の「No night could be read」はこれ。
直し: gh が拒否を述べたときに限りフラグ付きで再試行（古い gh はフラグを知らないので最初は付けない）。`parseSummary` は色コードを除いてから読む。
直後に 14 晩すべて読め、連続赤 12 件・「連続したが最新は通った」4 件・散発 77 件が出た。回帰: `tests/nightly-triage-checks.test.mjs` ①〜③。

## 1. 33 件の分類（main 380ed607 で単独再現・`--workers=1 --retries=0` を 2 回ずつ。Windows headless）

12 件は再現時点で緑、21 件は 2/2 赤、1/2（flaky）は 0 件。

| 区分 | 件 | 原因と直し |
|---|---|---|
| **製品の退行** | r177 eye / r178 STARTUP / r179 ×4 | MapLibre 6.18（#1202）の合成 `Transform` は `isGlobeRendering` を持たず `_projection` にだけある。`camera-math.js` の `gSpherical` が常に false → globe で mercator の式で視点を保持（drift 最大 22,765,372 m）。`gSpherical` が `_projection` も読む。 |
| 製品の退行 | maplibre-6 ① | 6.18 の camera に `isEasing` が無く `geo-engine.js` の `isAnimating()` が flyTo 中も false。`camera.isMoving()`（scheduler＝プログラム的な動きだけ。ジェスチャーは handler manager）へ。spec は `painter.transform` を読んでいた古い前提も直した。 |
| 製品の欠陥 | data-governance #729 | #1172 の複合ライセンス値のせいで説明文の「CC0」が一致せず出典行が cc0 を二度述べた。説明文（en/ja）から重複する CC0 の言及を除いた。 |
| 製品の欠陥（隠れていた） | ui-a11y-polish ① | 古い期待が先に落ちて隠していた: dark テーマの「Details ›」が accent で 3.92:1（<4.5）。`.stat-detail` を `--primary-on-tint` へ。 |
| テストの前提が古い | r167 / r168 / r169 | #1204 が既定の News を出来事単位にし、`_event` の無い記事 cache は捨てる（仕様）。seed に `intmap_news_lang=multi` を足した。 |
| テストの前提が古い | r386 | 固定日付の seed が #1196 の 72 時間の窓から外れた。相対時刻 `at(h)` へ。`r386-detail.spec.js` は未確認（同じ固定日付なら今後腐る）。 |
| テストの前提が古い | r178 unlimited tilt | #1175 で globe の下限が `log2(min(w,h)/720)` になった（0 は 720 px のときだけ）。期待をその式で計算。 |
| テストの前提が古い | countries-companies | #1205 の `.cm-src` 注記が `textContent` に混ざった。clone して除く。 |
| テストの前提が古い | map-layer-system | #1155 が重複行を除き `.ind-note` は `also` が空だと出ない。注記の確認を `row:dl-gdppc` の「Drawn by its own row」へ移した。 |
| テストの前提が古い | map-next phone | #1217 が空欄フォーカスの一覧を撤去（利用者の依頼）。入力してから一覧を待つ。 |
| テストの前提が古い | r668 | Playwright 1.65 では `isMobile` でも `window.screen` がホストの画面。PHONE に `screen` を足した。 |
| テストの前提が古い | r318 ② | 12,000 字の上限が deep の spec にだけ取り残されていた（node 検査は 13,000 に更新済み）。`CORE_TOOL_BLOCK_MAX` を 1 か所に集めて両方が読む。カタログは 235,402 字・12,748 字は 5.4% で番人の根拠は失効していない。 |
| テストの前提が古い | r550 | #1223 で source URL が `imnl://<epoch>/…`。epoch を指しているかで判定。 |
| テストの前提が古い | r179-imagery | #1217 が placeholder 判定をバイト一致にし、open sea は z13 まで実タイル。海の点だけ z16。 |
| テストの前提が古い | r493 | #1210 で `captureFrame` は `html:''`。`toDataURL` を包んで実際の撮影経路の jpeg を取る。 |
| テストの前提が古い | r545 | 3129a930 で lifeExp が同梱から外れ世界銀行から入る。spec で `SP.DYN.LE00.IN` を route し、入るのを待つ。 |
| テストの前提が古い | r783 ⑤ | #1187 の確認ゲート（外部内容の後のモデル発呼び出しは要承認）は仕様で**緩めない**。`nope.pdf` の recall を外部内容を見る前の 1 手目に移した。 |
| **未確定** | r181-cesium ⑥ / r184-cesium-fs ② | 11-17 は緑（25 秒・2.3 分）、11-18 から CI の software GL だけで 60 秒/5 分超。手元の実 GPU では緑の頃と同じ。製品の遅化が濃厚（疑い: 6883ff3d の起動後アイドルへの移動）。bisect を dispatch（run 44500015903）。確定するまで数も期待も触らない。 |

## 2. 製品側の疑い（テストを直しただけで残したもの）

- `analysis-correlate.js:102` の `ensureWB` が世界銀行由来の軸で `applyStat` を呼ばない。世界銀行の最新値の読み込みが起動後のアイドルへ移ったので、早く開くと相関パネルが空になりうる（r545 の診断で観測）。
- r783 は 11-17 夜は緑で、窓（4acd374..abed98c4）の `atlas-agent.js` / `atlas-executor.js` に原因の差分は見つからなかった。ゲートは設計どおり。

## 3. #269（js/redos, opening-hours.js:85）

`/^((?:(?:Mo|…)(?:-(?:…))?\s*,?\s*)+)(?=\s|$)/` の `\s*,?\s*` は空白の連なりの分け方が 2 通り。CodeQL の文字列（`Mo` + `\tFr`×n）で測ると 0–2 ms。
後続の `(?=\s|$)` が空白位置で必ず成立するので、失敗側へ回らず、**現実の入力では悪用できない**。それでも曖昧さを残す理由は無いので、同じ言語を受理する `\s*(?:,\s*)?` に直す案を出したが、同じ修正（`(?:s*,s*|s+)?`）が別セッションの #1269 で先に main に入ったので、そちらを採った。
本 PR は、出荷された式が旧式と同じ言語を受理すること（乱数 4000 件）と、5000 回繰り返しの入力が線形で終わることを `nightly-triage-checks` ④ で固定する。警告は dismiss せず、再スキャンで閉じるのを待つ。

## 4. 残り

- Cesium の 2 件（r181 ⑥ / r184-fs ②）。bisect（run 44500015903・r181 ⑥）は**単調ではなかった**: 範囲 28 commit を各 3 回、0ba78e14・3db5232e・6883ff3d・5faebfe4 などは 3/3 緑、同じ範囲の 761f1527・78a06565・3129a930・#1175・#1196 などは 0/3 赤、4acd3743 は 1/3。1 つの commit が境ではなく、commit に依らず赤い所と緑の所が混ざる ＝ 単一の退行ではなく CI の software GL の負荷・順序に左右される遅さ（またはいくつかの変更の合算）。確定には、実 GPU を持たない shard での所要時間の分布を測る必要がある。それまで数も期待も触らない。
- 33 件に入っていない散発 77 件・「連続したが直った」4 件は `node scripts/deep-history.mjs` が毎晩述べる。
