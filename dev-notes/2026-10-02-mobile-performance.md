---
title: 携帯の起動を「段」で読む——いつ読むかを資源ごとに宣言し、宣言の完全さと boot の重さを門に／国の輪郭を自サイトの固定コミットから／同じグリフ範囲を二度頼まない
date: 2026-10-02
newsen: Phones load the map in stages, fetching each resource only when it is needed.
newsjp: スマホでは地図を段階的に読み込み、各資源を必要になったときだけ取得します。
---

〈依頼〉「スマホのパフォーマンスと UI を改善して。任せる。」→「修正じゃなくて作り変え。意図を理解しろ」。
投影は地球儀のまま軽くする。既定のデータレイヤーは別作業（basic-display-not-layers）が無くすので触らない。
このエントリはその内の**起動の段・国境データ・フォント・計器**の部分。

## 0. 測った（着手前）

本番の実測（390×844・CPU ×4、依頼に添えられた数）: 操作できるまで 9.7〜10.8 秒、long task 合計 6.7〜7.1 秒、
初回転送 133 件・6.5 MB、ズームで jsDelivr（`@master`）から ne_10m を 4.34 MB、glyph pbf の同じ範囲の重複要求、
Noto の断片多数。

ローカルで同じ条件を再現する計器が無かったので、まず計器を足した（`scripts/frame-profile.mjs --boot --detail`、§4）。
着手前のローカル build（未操作の初回訪問＝既定レイヤー付き、5 起動・前 2 回は捨てる）:

| 何 | 値 |
|---|---|
| 起動画面が上がるまで（ready） | 10.3 s（本番 9.7〜10.8 s と一致） |
| ready までに始まった要求 | 118 件・8.2 MB（3 回平均） |
| long animation frame（ready まで） | DOMContentLoaded の処理 1.26 s（強制レイアウト 0.42 s）・MapLibre の rAF 0.83 s・module 評価 0.61 s・`ReadableStream.read` 0.50 s・main の `Worker.onmessage` 0.30〜0.82 s |
| ready までに読んでいた「無くても触れる」もの | `data/stars.bin` 773 kB・`data/gazetteer-phone.json.gz` 551 kB・jsDelivr の ne_110m 819 kB・世界銀行 6 指標 |
| glyph pbf | `fonts/Inter Regular/*.pbf` 12 件（6 範囲×2）・Noto の範囲 22 件（11×2） |
| Google Fonts の rule sheet | 889 kB（JP＋SC、静的 4 ウェイト） |

どれも作者ごとに「idle で読む」と書いてあった。**主スレッドが 9 秒忙しい携帯では、idle は起動の中にある。**

属性（dev サーバ・`--attribute`、順位だけが移る）: `_imAppBoot` 1.2 s のうち `initMobileUI → mountInto`（携帯の
レイヤー格子を閉じたシートの中に組む）0.33〜0.77 s、`loadSettings → applyDockMode → renderUI` 0.14〜0.31 s、
`updateI18n` 0.1〜0.26 s。`news-context.js _compileTerm` 0.55 s（地名辞書が届いたときの正規表現 約 9 万個）。

## 1. 起動の段（`js/boot-stage.js`）

**いつ読むかを 1 表で宣言し、読み手がそれを訊く。** 段は `boot`（起動画面の間）／`settled`（起動画面が上がった
後の idle）／`need`（読み手が頼んだとき）。携帯以外は全行 `boot`（従来どおり）。

- 「起動画面が上がった」は `__imBoot.done` を包んで観測し、index.html の 20 秒の非常口（`done` を通らない）のために
  起動画面の `boot-gone` も MutationObserver で見る。ポーリングしない。
- ⚠ **1 版目は 1 つの `settled` を全員で待っていた。** 実測で 4 つの読みが同じ idle の 0.4 ms 以内に出て、着いた
  後の仕事が触れ始めの数秒に重なった。**2 版目は 1 idle に 1 件**にしたが、読みがネットワークにいる間は idle が
  連続するので、星と地名辞書は 5 ms 差で出た。**3 版目（いま）は読み手が「仕事」（読み＋着いた後の処理）を渡し、
  それが終わってから次の idle で次を出す。** 終わらない仕事が列を止めないよう、6 s で次へ進む（仕事には触れない）。
- 段を訊く読み手: `js/space-sky.js`（星空・読みと 98,887 行の導出が 1 つの仕事）、`js/gazetteer.js`（読み・変換・
  `intmap-gazetteer-world` の通知が 1 つの仕事）、`js/wb-layers.js`（最新値の更新）、`js/app-body.js`（国の表の暖機）。
- ⚠ **見つかった潜在欠陥**: 携帯では世界銀行の最新値（7.6 s）が国の表（8.8 s）より先に着き、更新は**空の表に
  merge して何も変えていなかった**。いまの仕事は国の表の約束を待ってから merge する。

## 2. 宣言の門（`npm run check:perf` に追記。新しい check:* は足していない）

- **完全さ**: 起動グラフ（build report の eager チャンクのモジュール）が名指す `data/…` を全部発見し
  （コメントは `scripts/code-only.mjs` で除く）、表に行の無いものを赤にする。何も指さない行も赤
  （`shipped: false` は「コードは名指すが配っていない」——`data/asher_languages.geojson`）。
- **重さ**: 携帯が `boot` で読む行の合計を `phone.bytes` / `phone.requests` の天井にする（`eager.*` と同じ規則・
  `requests` は個数で幅 0）。初回の行は note で、main の CI が天井を記録する。
- 静的に見えない「`settled` の行が本当に後で読まれたか」は `frame-profile.mjs --boot --detail` の PLAN 節が実測で
  突き合わせる（着手前の build では 9 件の違反、いまは既定レイヤーの海底ケーブル 3 件だけ——別作業の範囲）。

## 3. 国の輪郭（`data/ne-countries/`・`scripts/build-ne-countries.mjs`・`js/ne-countries.js`）

jsDelivr の `@master`（動く枝）を、`natural-earth-vector` の**固定コミット** `ca96624a`（2022-06-02、master の
最終コミットと一致を確認）の自サイト配信に置き換えた。**可逆**: 属性はそのまま、座標は整数マイクロ度の差分
（上流は小数 6 桁まで——3 縮尺の全頂点で `n/1e6` が上流の double と一致することを builder が確かめ、
復号が上流 JSON と**キー順まで**深く等しいことを `--check --cache` が確かめる）。

| 縮尺 | 上流の text を gzip -9 | 出荷（gzip） | 以前の転送（jsDelivr） |
|---|---:|---:|---:|
| 110m | 203 kB | 187 kB | 819 kB（非圧縮で計上） |
| 50m | 997 kB | 705 kB | — |
| 10m | 4,549 kB | **2,811 kB** | 4.34 MB |

- 展開と parse はデータの扉の Worker、10m の座標の復号は 2 万頂点ごとに `scheduler.yield`。
- 携帯の 10m は、カメラが z ≥ 4 で止まった時点か従来の 15 秒後の早い方（早くなる方向だけ）。
- 出典ページ（en・jp）・`docs/SECURITY-ARCHITECTURE.md` §7・`scripts/outbound-hosts.json`（jsDelivr の probe を
  まだ使っている URL へ）を同時に更新。jsDelivr は他のデータで今も使うので行は残る。

## 4. フォント

- **同じ glyph 範囲の二度目の要求を消した。** 原因は CJK の書体が届くたびに呼ぶ `setGlyphs()` で、これは
  グリフのキャッシュを**全部**空にする（Inter と Noto のダウンロード済み範囲まで）。新しい書体で変わるのは
  ブラウザが TinySDF で描いたグリフだけなので、それと描いた rasterizer だけを捨て、スタイルに「グリフが変わった」
  と告げる（`js/geo-engine.js _redrawLocalGlyphs`。内部の形が違えば従来の `setGlyphs` へ戻る）。
  実測: Inter 12 → 6 件、Noto の範囲 22 → 11 件。
- **Noto の rule sheet を可変ウェイトの範囲で頼む**（`wght@400..700`）。静的 4 ウェイトでは同じ 124 ファイルが
  4 回ずつ宣言されていた（JP 496 規則・458,744 B → 124 規則・115,182 B。SC 113,332 B・TC 125,340 B）。
  ファイル URL は同一で、描かれるウェイトも同じ。実測 889 kB → 223 kB。

## 5. 実測（前後・同じ条件・ABAB 交互・4 組）

`frame-profile.mjs --boot --detail --reps 1` を前（着手前の HEAD を同じ手順で build）と後で交互に 4 組。
⚠ このマシンは他のセッションで CPU 100% の時間があり、1 回目の 4 組は捨てた（静かになってから取り直し）。
数は**組ごとの差の中央値**（TESTING.md の規則）。

| 何（4 組・ABAB） | 前（中央値） | 後（中央値） | 組ごとの差の中央値 |
|---|---:|---:|---:|
| 起動画面が上がるまで（ready・ページの時計） | 11.2 s | 10.1 s | **−1.47 s** |
| ready までの long animation frame の合計 | 10.85 s | 9.67 s | **−1.55 s** |
| 同・blocking（50 ms を超えた分） | 7.27 s | 6.44 s | −1.07 s |
| ready までに始まった要求 | 110.5 件 | 88 件 | −22.5 件 |
| ready までに読んだ本体 | 7,303 kB | 5,123 kB | **−2,180 kB** |
| glyph pbf の要求 | 34 | 17 | −17 |
| Google Fonts の rule sheet | 889 kB | 223 kB | −666 kB |
| ready 後 3 秒の long animation frame の合計 | 0.46 s | 1.85 s | **+1.10 s** |
| ready 後 3 秒の最長フレーム | 0.30 s | 0.68 s | +0.37 s |
| first draw（ハーネスの時計） | 6.4 s | 7.0 s | +0.43 s（※） |

※ 1 回目の 4 組（同じ条件・静かなとき）でも ready −1.0 s・ready 前の long frame −1.0 s・同 blocking −0.77 s・
本体 −2,180 kB と同じ向き。first draw は組ごとに ±2 s 揺れ、向きが揃わなかった（ハーネスのポーリングの時計）。
起動画面の中のマイルストーン（`style`）も同じく揃わず、差は出ていないと読む。

**読み方**: 起動画面が上がるまでが約 1 秒短くなり、その前に読む量が 2.2 MB・23 件減った。⚠ **long task の総量は
減っていない**——星の導出・地名辞書の照合器の構築・国の表は、起動画面が上がった**後**へ移っただけで、
上がってから 3 秒の long frame は増えた。最大のものは地名辞書が届いたときの `news-context.js` の照合器構築
（約 0.6 s の 1 タスク）で、これは触ってよいファイルの外（§7）。

操作中（`mobile-trace.mjs --engine chromium --cpu 4 --reps 1`、前後 1 回ずつ。再生キャッシュに無い地図タイルは
遮断＝両腕同じ）:

| 相（後は台帳と同じ回） | 前 fps | 後 fps | 前 16.7 ms 超 | 後 16.7 ms 超 | 前 vsync 落ち | 後 vsync 落ち | 前 blocking | 後 blocking |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| pan-first | 30.7 | 22.1 | 69.9 % | 66.7 % | 30.1 % | 23.8 % | 641 ms | 1,493 ms |
| pan-warm | 35.2 | 38.3 | 63.8 % | 53.6 % | 31.0 % | 29.0 % | 183 ms | 749 ms |
| pan-touch（本物の指） | 28.5 | 31.1 | 66.7 % | 52.7 % | 54.1 % | 30.9 % | 773 ms | 1,870 ms |
| pan-alerts | 17.8 | 23.6 | 86.6 % | 59.3 % | 83.8 % | 52.1 % | 2,179 ms | 2,049 ms |

1 回ずつなので傾向以上は言えない。後の `pan-first` の blocking が増えているのは、起動後へ移した仕事が最初の操作に
重なったもの（上と同じ理由）。

## 6. 台帳（`tests/perf-phone-ledger.json`）

実行時の数（操作可能時刻・long task・16.7 ms 超の割合）は GPU と `.frame-cache/` が要るので CI の門にできない。
`frame-profile.mjs --boot --ledger` と `mobile-trace.mjs --ledger` が、測った commit と条件と一緒に書き、
`check:perf` が門の行の横に「記録・門ではない」と印字する（別の木で測ったものはそう言う）。
`mobile-trace` の各相は `over16_7Pct`（16.7 ms 超の割合）と `missedVsyncPct`（25 ms 超＝vsync を落とした割合）を
出すようにした。

## 7. やっていないこと・触ってよい範囲の外で要ること

- **ジェスチャ中に解像度を下げる案は入れていない。** R229 で利用者が「品質に影響する」として撤去を指示した
  機構と同じで（DEV-NOTES-ARCHIVE R229）、検査も「消えていること」を主張している。入れるなら利用者の確認が要る。
- **`js/news-context.js` の照合器構築**（地名辞書が届くと約 9 万個の正規表現を 1 タスクで作る。後へ移した
  long task の最大のもの）。提案: `_terms` を項目ごとに初回の照合で作る＋大文字化した 3-gram の前置フィルタ
  （正規表現 `i` フラグの一致は大文字化した部分文字列の一致を含むので、取りこぼさない）。
- **起動時の携帯のレイヤー格子**（`js/mobile-ui.js applyLayout → js/map-ui.js mountInto`、閉じたシートの中に
  全行を組む。0.33〜0.77 s）——シートを開いたときに組めば起動から消えるが、`mobile-ui.js` は別作業の範囲。
- **起動画面のアイコン** `IntMap.Icon_BW-inverted.png` 201 kB（css から。表示は 96 px 程度）——殻の CSS の範囲。
- **main の分割**（`js/lazy-modules.js`）: 起動時に作られるボタンを数えてからでないと切れない（§9.4 の
  analysis-panels の教訓）。今回は手を付けていない。大きい順の候補: data-layers 328 kB・map-ui 210 kB
  （いずれもレイヤー作業と重なる）・time-borders 139 kB・map-tools 126 kB。
- 既定レイヤー（ケッペン 1.47 MB・海底ケーブル）由来の要求と `ReadableStream.read` の大半は別作業が消す。

## 8. 検査

`tests/mobile-performance-checks.test.mjs`（全部**走らせて**確かめる）: ① 携帯の `settled` は起動画面が上がって
idle になるまで出ない・他の端末はすぐ・仕事が終わるまで次を出さない・`need` は止めない ② 起動グラフの未宣言の
`data/` は赤・コメントの中の名前は読みではない・何も指さない行は赤・boot 行の合計 ③ 出荷した 3 縮尺が固定コミット
で、可逆に復号できる（builder の `--check` も走らせる） ④ 新しい CJK 書体はブラウザが描いたグリフだけを捨て、
`setGlyphs` を呼ばない（呼ぶと範囲の再要求が戻る）・知らない形なら従来へ戻る ⑤ 読み手がそれぞれの行を訊く。
`tests/shell-map-labels-checks.test.mjs` の Noto の URL を `wght@400..700` に。

新しい公開名: `window.__imBootStage`（js/boot-stage.js。ES module で読めない `js/gazetteer.js` のため。`IntMap…`
にしないのは `moduleCatalog()` が自動発見するから）。

### 上げる天井（`check:perf`）とその理由

- `eager.modules` 301 → 303: `js/boot-stage.js`（段の表と待ち合わせ）と `js/ne-countries.js`（可逆形式の復号器）。
  どちらも起動の最初から要る（読み手が eager で、段の判断はその読み手が自分の読みの前にする）。
- `dist.data`・`dist.total` +3.78 MB: `data/ne-countries/` の 3 縮尺（第三者 CDN の `@master` から読んでいたもの）。
  読者の転送は減る（10m 4.34 MB → 2.81 MB）。
- `dist.assets` 18,757.6 kB → 18,851.4 kB（+93.8 kB）: rebase 前のこの branch は天井の内側だった。#901（mobile-shell）を
  取り込んだ木で `check:perf` が初めて超えた——両者を合わせた木の実測で、どちらか片方の内訳はこの回では測っていない。
- 新しい行 `phone.bytes` 342,631 B／`phone.requests` 3（boot の 3 行: world-basemap・land-mask・hdi-series）。
- ⚠ この木は `origin/main` より遅れているので `--update` は拒否する（perf-measure-parity）。rebase → build →
  `node scripts/perf-budget.mjs --update` で上の行だけが上がる。

その他の台帳: `tests/fetch-deadline-baseline.json`（js/map-tools.js の期限なし fetch 3 → 2、下げただけ）・
`tests/global-surface-baseline.json`（`window.__imBootStage` を記録）。
