---
title: 台帳の未申告を 2,581 → 2,445 に減らし、上流の優先規則を値にし、GIS の出力が入力の条件を引き継ぐようにした
date: 2026-11-19
newsen: Source priority is now a stated value for every multi-source dataset, and GIS results keep their inputs' licence, credit, retrieval time and as-of date.
newsjp: 複数の上流を持つデータの優先規則が値になり、GIS の分析結果が入力のライセンス・表示義務・取得時刻・対象時点を引き継ぐようになった。
---

〈依頼〉 外部評価 P1: 台帳の未申告（2,581 facet）、優先規則が機械可読でない、分析結果へ出典が引き継がれない。推測で埋めない。

## 0. 測った（`node scripts/data-governance.mjs --report`）

- 台帳: 2,581 → **2,445 facet**（subject は 205 のまま——まだ 1 facet でも欠ける束は残る）。内訳の減りは下記 1・2 のみで、`--update` で記録した。
- 残りの大半は、ビルド時に上流を取って測らないと言えない値（`integrity.*`・`retrievedAt`・`asOf`・`generatedAt` 約 1,550）で、前の記録（governance-ledger-shrink）の理由が今も当てはまる。**推測では埋めていない。**

## 1. 優先規則を値にした（precedence 約 48 facet 分）

- 複数の上流を持つ builder 16 本を、コードが実際に上流を合成する箇所まで読んで分類した（file:line つきで subagent が報告→実コードで確認）。**大半は同じ問いに 2 つが答えていない**（例: airports は OurAirports が件数、mledoze は cca2→cca3 の写像だけ）。この場合に順位を書けば誰も述べていない勝敗を述べることになるので、`priority.disjoint`（上流ごとに「その上流だけが答える問い」）を新設し、`precedence.*` を適用外（`disjoint-upstreams`）と数える。
- 本物の勝敗があるもの（star-catalogue: Hipparcos→BSC、tle: CelesTrak→SatNOGS）は `rank`＋`over`。静的な順位にならないもの（hist-admin-recon の dossier 単位、hist-admin-surveys の build 時に計算する順、hist-coast-snap のライセンスによる分割）は規則そのものを `rank` の文で述べた。
- 門 `precedence-declared` を `scripts/data-governance.mjs` に追加（disjoint の数が上流と一致、rank に理由）。**rank の名前と上流の綴りの一致は測らない**——既存の rank は短い呼び名で、綴りの照合は偽の失敗を作る（試して外した）。
- ⚠ hist-admin-surveys の `upstreams` は `scripts/histsurveys/*.mjs` から書き直される宣言なので、書き直すときは `priority` を残すこと。

## 2. 全上流が自分の行で述べているときの束全体の欄（`stated-per-upstream`）

- `read()` は多上流の束の top に 1 値を持たない（誰も言っていない 1 値を主張しないため）。そのため publisher/url/licence/licenceUrl は「未申告」と数えられていたが、**全ての上流が述べている**なら欠けているのではなく上流ごとに述べられている。この場合だけ適用外（`stated-per-upstream`）と数える。1 本でも黙っていれば未申告のまま。
- planets の Solar System Scope（CC BY 4.0）に正式 URL を補った。

## 3. GIS の出力に出典・条件が引き継がれていなかった（監査で確認した欠落）

- 実測（コード監査）: `js/gis-ops.js` の出力 provenance は coverage だけを継ぎ、licence・creditRequired・publisher・retrievedAt・asOf は 1 つも継がなかった。export は「ライセンスの記載が無い」と述べた＝入力が CC BY でも演算 1 回で義務が消えた。
- 直し: 取得（`gis-layers.js` の vector / raster）が登録の `rights` を provenance に運び、演算（`gis-ops.js` `inheritTerms`）が入力ごとの行を `provenance.upstreams` に残す（演算を重ねても平らに継ぐ・黙った入力は `{input}` の行・`read()` が最も厳しい義務を残す）。export（`gis-export.js`）は全入力が述べたときだけ `license` を書き、表示の文は述べた分を全部書く。`tests/gis-provenance-inherit-checks.test.mjs` が 5 点を測る。
- **残した欠落**: ベクタの複数入力演算の時点は第 1 入力のまま（`outTime(ds[0])`）。ただし各入力の `asOf`・取得時刻は `upstreams` に残るので情報は失われない。時点を 1 つにまとめる規則は設計判断が要るため入れていない。取り込みファイル・URL 取得（`gis-atlas.js`）の入力は元から条件を述べていないので `{input}` 行になる（出力にライセンスは生えない）。

## 4. 減らせなかったもの

- 上記 0 のとおり integrity / retrievedAt / asOf / generatedAt は再ビルドが要る。
- 約 40 の builder の publisher / url / licence は、上流の条件を確認できていないので書いていない。
