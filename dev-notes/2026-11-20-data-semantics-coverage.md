---
title: データの自己記述（期間・範囲・方法・解像度・完全性・精度）の被覆を、出典が述べたことと束の実測だけで広げた——完全に未申告の主題を 115 から 17 へ
date: 2026-11-20
newsen: More bundled datasets now state their period, extent, method, resolution, completeness and accuracy, taken only from what each source publishes or from the committed data itself.
newsjp: 同梱データの期間・範囲・測り方・細かさ・網羅性・精度の記述を、出典が公表している内容と束の実測だけから広げた。
---

〈依頼〉 総合技術調査（2026-11-20）の続き。#1319 が `describes.*` を 2 束にしか書けなかった（残り約 220 主題が未申告）ので、出典が公表している内容から実態として広げる。無理に説明を作らない。

## 1. 何をしたか
- 68 本の builder の `GOVERNANCE` 宣言に `describes.*` を足した（`period` `extent` `method` `resolution` `completeness` `accuracy`）。**根拠は 2 種類だけ**: ⑴ 出典の公式ページ・論文・README を取得して確認した記述 ⑵ コミット済みの束を数えた実測（実測と分かる書き方）。
- 根拠のない欄は**足していない**。結果: `data/data-facts.json` の「6 欄すべて未申告」の主題が 115 → 17。欄別の未申告は period 69・accuracy 99・resolution 48・completeness 79・extent 22・method 31（118 主題中）。
- 例: 歴史上の都市人口（hist-urban）は Reba et al. 2016 が述べる通り、Chandler の単位は「市域の外の郊外を含み市域内の農地を除く urban area」、Modelski の AD2000 は UN の「cities proper」と書いた。世界遺産は UNESCO の件数と束の実測を照合し、in-danger 52 と 58 が未調整であることを accuracy に書いた。復元・補間した束（hist-admin-fill/recon など）は復元と明記した。
- `data-governance.mjs --update` で facts と台帳を再生成した。

## 2. 足せなかったもの（正直に）
- 17 主題は根拠が無く未申告のまま（border-detail・border-provenance・polity-arcs・planets・world-basemap・subcable-overrides ほか IntMap 自身が作る索引や導出物）。
- accuracy は多くの出典が数値で述べない。述べていないものを「高い」「十分」と書かない。
- 期間は終端が動く束（gazetteer・subcables・tle ほか）では書いていない。

## 3. 未了（別の仕事）
- **未知の外部データへの Semantic Layer の適用**（都市人口の行政市域/都市的地域/都市圏、GDP の名目/実質/PPP）は #1281（未 merge・conflict）の層に載るので、そちらが入ってから。今回の `method` 欄が、その層が読む供給者陳述になる。
- 約 70 本の builder の出典 URL のうち、取得できなかったもの（nature.com・UN Dataverse・CIA Factbook・MLIT）は実測だけを根拠にし、出典の陳述は足していない。

## 4. ⚠ 途中で踏んだ穴
- 単引用符の文字列に `IntMap's` のような英語の所有格が入り、7 本が構文エラーになった（`node --check` で検出して修正）。
- builder を import して宣言を読むと `main()` が走り `data/` を書き換える builder があった（戻した）。
