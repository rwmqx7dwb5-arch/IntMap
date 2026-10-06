---
title: Virtual Shanghai「Provinces in Republican China」(ID 2210) は CHGIS 由来か——配布ファイルは出自を述べず、頂点は CHGIS 派生の 1909 府界と共有されない（削除不要）
date: 2026-10-06
internal: 出典の出自を調べて記録しただけで、配る中身も画面も変わらない
---

〈依頼〉同じ出版元の「Prefectures in 1909 Qing China」(ID 2211) が CC0 表示なのに、配布 zip の処理履歴が
CHGIS V6 の融合（`Dissolve v6_1911_pref_pgn_utf`、2019-06-17）だった。IntMap が既に配っている ID 2210
（中華民国の省 1912–49、`scripts/histsurveys/virtualshanghai.mjs`）も同じ出自ではないかを確かめる。
CHGIS V4–V6 は非商用・再配布禁止で、IntMap は商用サービスなので、派生なら使えない。

## 0. ファイルが述べていること（2026-10-06 取得、汎用 User-Agent）

- No-01〜06 は 200、No-07〜10 は 404（2026-10-05 と同じ）。
- No-06 の `1912_1921.shp.xml` は `<Esri><CreaDate>20210616</CreaDate>…` だけで、`<Lineage>`・`<Process>` が**無い**。
  `.prj` は `WGS_1984_Web_Mercator_Auxiliary_Sphere`。dbf の更新日 2022-07-08。
- GeoPackage 5 本（2022-07-08）: `gpkg_metadata` は**空の QGIS 3.20 テンプレート**、`gpkg_contents.description` は空。
  行ごとの `License`「CC0 1.0 Universal」・`Copyright`「ENP-China Project」・`Cartograph`「Pierre-Henri Dubois」。
  全ファイルを `chgis|harvard|fudan|dissolve|v<N>_<年>` で走査して 0 件。`__MACOSX` は Dropbox の xattr だけ。
- 出版元ページの「Comments」と公開告知（enepchina.hypotheses.org/3554、2021-06-16。Anubis のため Wayback の
  2026-06-18 版で読んだ）も出典を述べない。
- ⚠ 比較のため ID 2211 も取りに行ったが、2026-10-06 時点で `vcMap_ID-2211_No-01〜04.zip` は**全部 404**
  （ページは No-02 へリンクしたまま）。比較には hist-recon-expand セッションが同日に取得した
  `Prefectures_1909_V1` を読み取り専用で写して使った。

**履歴が空であることは「独立に描いた」の申告ではない**——2211 のページも「1909 年の商務印書館の地図に基づく」と
述べていて、処理履歴だけが CHGIS を名指していた。だから幾何で訊いた。

## 1. 幾何で測った

融合（dissolve）も Douglas-Peucker の単純化も入力の頂点を残すので、CHGIS V6 1911 由来なら 2211（その融合）と
頂点を共有するはず。2211 は Xian 1980 / GK zone 19（中央子午線 111°）を逆投影、2210 は Web Mercator を逆投影
（外接矩形は両者 18.15–53.6°N で一致し、近傍のずれの平均は -25 m・+1 m で系統誤差は無い）。

| 2210 の層 | 頂点数 | 2211 の頂点 ≤1 m | ≤50 m | 2211 の線までの中央値 | 線から 5 km 超 |
|---|---|---|---|---|---|
| 1912–1921 | 20,615 | 0.0% | 0.2% | 1.8 km | 23.6% |
| 1922–1928 | 20,395 | 0.0% | 0.2% | — | — |
| 1947–1949 | 21,558 | 0.0% | 0.2% | — | — |

対照として Natural Earth 10m admin-1（中国・台湾・モンゴル、60,802 頂点）とも: 頂点 ≤1 m 0.0%、線までの中央値 2.3 km。

⇒ 2210 の線は CHGIS V6 1911 とも Natural Earth とも別に引かれている。**測れる範囲で CHGIS 派生ではない**ので、
何も削除しない（`AGENTS.md` §3-1 の承認も不要）。

## 2. 測れていないこと

- GADM（非商用）と CHGIS V4 の 1820 年などとは比べていない（取得していない）。
- 出版元が処理履歴を後から足したら、もう一度訊く。結論と測り方は収穫器の見出し（LINEAGE）に置いた。
