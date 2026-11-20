---
title: 産業立地の比較を実データで（電力・産業用地・労働力・研究・規制 × 日本の 47 都道府県 × 企業拠点 — siting.compare）
date: 2026-11-20
newsen: Atlas can now compare Japanese prefectures for siting a plant — wholesale power price, industrial land price, minimum wage and workforce, universities and the factory-location rules — with the company sites IntMap carries in each.
newsjp: Atlasが、工場の立地として日本の都道府県を、卸電力価格・工業系の地価・最低賃金と労働力・大学数・工場立地法の規則、そして各県にあるIntMapの企業拠点とあわせて比べられるようになりました。
---

〈依頼〉 総合技術調査（2026-11-20）: 産業立地分析に電力価格・工業用水・産業用地・労働力・研究機関・規制が要る。実在する公開データを取り込み、企業・都市・施設に結び、半導体集積地の立地条件を Atlas が比べられる状態へ。日本を通しで、世界へ広げる設計で。

## 0. 作ったもの

- `scripts/build-siting-jp.mjs` → `data/siting/jp.json`（47 県。指標 14・標準地 948・企業拠点 266）。`js/siting.js`（純粋なエンジン）と `siting.compare`（`js/atlas-cap-siting.js`）。仕様の正本 `docs/SITING.md`。
- 出典（実測 2026-11-20）: JEPX スポット FY2025（17,520 コマ）／国土数値情報 L01-26（25,565 標準地のうち工業系 948）／厚労省 最低賃金（令和 8 年度の改定は県ごとに発効日が違い、3 県は未発効 → `pending`）／SSDSE-B 2026 年版（2023 年データ）／e-Gov 工場立地法・施行令。
- 企業拠点: footprint の日本 267 拠点のうち 266 が県に落ちた（1 件は輪郭の外で 0.1° 以内に県が無い）。`sector:"semi"` で半導体企業の拠点が出る（Micron・Panasonic・Bosch・TI・SK hynix ほか。TSMC の日本拠点は企業アトラスにまだ無い）。

## 1. 測って決めたこと

- **ダム（国土数値情報 W01）は使わない。** メタデータが「商用で本データを利用する事は認めない」と述べる。工業用水の代わりにはしない。
- **METI 経済構造実態調査の Excel（地域別）は取らない。** 2 表目以降が HTTP 202 の bot 確認の裏にある。回避しない。e-Stat の検索は列が絞れず、ID を当て推量しない。⇒ **工業用水は `gaps` に理由つきで残した**（偽の値を置かない）。
- 電力は**卸**のエリアプライス。需要家の産業用料金は県別の公開源が無い。答えにそう書く。
- 最低賃金は「発効日が今日以前の最新の改定」を採る（全国一律に最新年度を採ると未発効の値を現在値として出す）。

## 2. 引き継いだもの・消したもの

何も消していない。能力は 252 → 253（文書の数を更新）。出典 5 件を `js/reference-data.js` に足した（同じ値が全部載る）。

## 3. 次

工業用水（e-Stat 経由の工業統計／経済構造実態調査の都道府県表）・物流（港・空港・幹線道路を県の表へ）・研究機関（大学以外）・小売の産業用料金。世界へは `data/siting/<iso2>.json` を同じスキーマで足す。

## 4. CI で見つけた退行（直した）

- 能力を 1 つ足すと `find_capability` の順位が動き、Atlas の再生カセット `promoted-tool-runs-the-capability`（「measure distance between two places」への find_capability の返り）が 22 本中 1 本ずれた。原本の main では 22/22。意図した変更（弱い一致 4 件が結果から落ち、先頭 `map.measure` は不変）と読んで `scripted-cassettes.mjs --write` で記録し直した。
- 能力数を文書で 252→253 に直す一括置換が、無関係の「全 252 の国と地域」まで書き換え、置換関数の引数を取りこぼして `undefined` を入れていた。`check:docs` は通っていたが、変異テスト（R500／#R699）が検出した。やり直して正しい箇所だけを直した。
