---
title: 衛星・航空画像の供給網——供給元を 1 か所の台帳に宣言し、撮影日・解像度・利用条件を画面と Atlas から読め、Chronos の時刻に合う過去画像を選べる
date: 2026-11-20
newsen: The satellite view now says when each picture was taken and how sharp it is, lists the better pictures available at the place you are looking at, and can match the Chronos time with older aerial photos (Japan 1945–1990, Netherlands 2016–2026, Landsat 1984–2000).
newsjp: 衛星画像に撮影日と解像度が表示され、見ている場所で使える画像の一覧から選べます。Chronos の時刻に合わせて過去の航空写真（日本 1945〜1990 年、オランダ 2016〜2026 年、Landsat 1984〜2000 年）も出せます。
---

〈依頼〉外部監査（2026-11-20）の指摘への対応の 1 領域: Esri World Imagery 中心の衛星画像供給を、利用条件が明確で長期に安定する供給へ広げ、
撮影日・解像度を見えるようにし、Chronos の時刻に対応する過去画像を選べるようにする。

## 1. 実測（2026-11-20、実際のタイル URL に curl）

| 供給元 | 実測 | 利用条件（一次情報） | 採否 |
|---|---|---|---|
| Esri World Imagery（鍵なし） | 200・約 1 s。**Citations レイヤー（MapServer/4）が場所ごとの撮影日・解像度を鍵なしで返す**（東京 20260116・0.34 m・Vivid Advanced） | 鍵なしの商用可否は一次情報で読めず（E300 PDF は読めず、項目ページは空）。利用者が「そのまま」と判断 | 残す（既定のまま・「未確認」と表示） |
| NASA GIBS MODIS/VIIRS | 200。Terra は **2026-12-01 に観測終了予定**（GIBS ページの告知）。Aqua は 2002-07 から現在まで | NASA は GIBS ページで謝辞を求めるのみ・ライセンス名は無し・制限の記述なし | 残す＋Aqua 追加 |
| GIBS HLS（Sentinel-2/Landsat 30 m） | 200 だが**日ごとの観測帯だけ**（空タイルは 155〜935 B）。S30 は 2015-11-28〜、L30 は 2013-03-22〜 | 同上 | 「観測帯のみ」と明示して追加（背景には使えない） |
| GIBS Landsat WELD 年次（30 m） | 1984・1985・1988〜1990・1998〜2000 だけ 200、2005 以降は 404 | 同上 | 年次合成として追加（1984〜2000 の過去画像） |
| 国土地理院 seamlessphoto＋年代別 | 200（z14–18、年代別は z10–17）。1945–50・1961–69・1974–78・1979–83・1984–86・1987–90、東京/大阪 1936–42。日本の外は 404 | 地理院タイル一覧: Web アプリでのリアルタイム読み込みは出典の明示のみで申請不要。商用の明記は無いが制限も無い | 追加 |
| USGS Imagery | 200（z16 まで。z17 以上は 404） | 連邦政府の著作物は PD。NAIP の PD は MapServer の説明からの推論と明記 | 追加（z16） |
| PDOK 航空写真 | 200。**年別レイヤー 2016〜2026**（8 cm は 2021〜）。オランダの外も 200 の空画像 | CC BY 4.0（PDOK の項目ページ・著作権ページで確認） | 追加（年別が Chronos に対応） |
| swisstopo SWISSIMAGE | 200。スイスの外は 400 | BGDI 利用条件: 自由利用・出典「© Data: swisstopo」・1 日約 2 万人の Web アプリは公正利用。個別データセットの条件（geocat.ch）は未読 | 追加（未読の点を台帳に記載） |
| IGN France オルソ | 200 だが初回 8.6 s | ライセンスを述べるページが読めず | **載せない**（読めるまで） |
| EOX Sentinel-2 cloudless | 2024 は 200、2016 は 404 | **CC BY-NC-SA・Web サービスは有償の商用ライセンス**（cloudless.eox.at/documentation/license） | **外した**（利用者判断・代替は GIBS の HLS／WELD と各国オルソ） |

## 2. 構造

- `js/imagery-registry.js`: 供給元 1 件 = 1 オブジェクト（範囲・ズーム・時間軸・撮影日の分かり方・解像度・利用条件と読んだ日）。
  `SAT_PROVIDERS` の無料側（tables.js）はここから生成。**供給元ごとの特例を足さない**。
- 撮影日の三種を言い分ける（`captureLine`）: **実測**（Esri）／**選んだ日が撮影日**（GIBS・PDOK）／**範囲の宣言**（地理院・USGS・swisstopo。場所別の日付は公開されない）。
  宣言された範囲を撮影日のように見せない。
- Chronos: `pickForTime`（その供給元がその時刻に持つ日／年。年は前後 2 年まで最も近い年を「近似」と明示）、`rankAt`（その場所・時刻に画像を持つ供給元を並べる）、
  `planClockMatch`（現在の供給元が持てばそれ、無ければ最良の供給元）。パネルに「Chronos の時刻に合わせる」「この場所で使える画像」。自動では切り替えない。
- 地域別・観測帯の供給元は範囲外で 404（スイスは 400）を返すので、`satOnError` はそれを失敗として数えず Esri に戻さない。
- Atlas: 能力 `data.imageryInfo`（`js/imagery-atlas.js`、遅延）。場所・時刻の画像一覧、撮影日、解像度、利用条件、`apply` で切り替え。
- 通信先の開示: 地理院・USGS・PDOK・swisstopo を追加し EOX を除いた（outbound-hosts・プライバシー §4 en/jp・出典ページ）。SW のキャッシュ名簿には**入れていない**
  （キャッシュの可否を各供給元が述べていないため）。

## 3. 保証していないこと・残り

- Esri 以外の撮影日は場所別には出せない（供給元が公開しない）。地理院の写真索引・swisstopo のメタデータ層・USGS の NAIP 年次は別途の接続が要る。
- 欧州などの他国オルソ（IGN・PNOA 等）は一次情報で条件を読めたものから追加する余地がある。
- Esri 鍵なしの商用条件は未確認のまま（利用者判断で現状維持）。
- 検査: `tests/sat-imagery-supply-checks.test.mjs`（宣言の完全性・非商用の不在・ホスト台帳・時刻選択）。

## 4. 門の動かし方（理由つき）

- `tests/i18n-coverage-floor.json` の positional / inline を各言語 1 行ずつ下げた: 外した EOX「Sentinel-2 cloudless (EOX)」の提供元名の行が無くなったため（決定による削除。ほかの訳は 1 行も消していない。Esri・GIBS の 5 言語名は台帳へ移して保った）。
  その名前だけを引く翻訳行 4 件は `i18n-dead-key-codemod` で削除。
- 通信先台帳: 利用条件ページ 6 宛先をリンクのみで追加（取得はしない）。
