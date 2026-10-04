---
title: 歴史上の都市人口——Chandler と Modelski の表（Reba ほか 2016・CC BY 4.0）を、述べた年とともに、補間せずに描くレイヤーと Atlas の能力
date: 2026-10-04
newsen: New layer “Historical city populations”: city sizes stated by Chandler and Modelski (Reba et al. 2016), 3700 BC – AD 2000, follow the time machine, China, India, the Americas and Africa included. Each figure shows its year and source, never interpolated.
newsjp: 新レイヤー「歴史上の都市人口」: 紀元前3700年〜紀元2000年に Chandler と Modelski が述べた都市人口（Reba ほか 2016）が、中国・インド・アメリカ大陸・アフリカも含めタイムマシンの年に合わせて現れます。数値には記載年と出典を添え、補間しません。Atlas に「1000年の大都市は？」と訊けます。
---

〈依頼〉 タイムマシンの集落は `data/hist-cities.json`（現存地の旧名）と `data/hist-places.json`（Pleiades・ギリシア＝ローマ世界）だけで、
人口は無く、1500 年以前の中国・インド・アメリカ大陸・サハラ以南アフリカはほぼ空だった。Reba, Reitsma & Seto (2016)
「Spatializing 6,000 years of global urbanization from 3700 BC to AD 2000」（Scientific Data 3:160034, doi:10.1038/sdata.2016.34）を
加える——ビルダー（固定ダウンロード＋ハッシュ・決定的出力・`--check`）、時刻 T のレイヤー、Atlas の能力、出典、史実の突き合わせ。

## 0. 測った（2026-10-04）

- **上流**: figshare の 3 記事（2059494 v3・2059497 v2・2059500 v3、どれも CC BY 4.0）。各記事に V1 と V2 の CSV があり、
  **V2 は出版者自身の訂正**（名前の末尾空白・Magdeburg の綴り・Kiev → Ukraine・Istanbul の綴り 1 件）なので V2 を採った。
  figshare のダウンロード口（`ndownloader.figshare.com`）はスクリプトに **HTTP 202 のボット検査**を返す（403 の HTML 本文）。
  ファイル記録が指す保存先（`s3-eu-west-1.amazonaws.com/pfigshare-u-files/<id>/<name>`）から読み、**figshare の md5 と
  我々の sha256 の両方**を照合する（`scripts/build-hist-urban.mjs` `TABLES`）。
- **文字コード**: Windows-1252（chandlerV2.csv に 0x80–0x9F が 3 バイト）。`TextDecoder('windows-1252')` で読む。
- **中身**: Chandler 1,597 行 × 806 年列（列の並びは年順でない・値の無い列もある）、Modelski 古代 154 行 × 41 列
  （Sippar は数値ゼロ件）、Modelski 現代 293 行 × 1 列（2000 年）。数値は全部整数の文字列。`0`（Aleppo 1300 年）も
  出典の記載として保持する。小さい数（Cahokia 1400 年 4,000・Buenos Aires 1602 年 500 など）も記載どおり。
- **certainty は位置（ジオコーディング）の順位**で、人口の確からしさではない（論文 Technical Validation:「3 つの
  ジオコーダが一致＝1、2 つ＝2、最も不確か＝3」「ranking only ranks the certainty of geocoded city locations」）。
- **収録基準**（論文が報告する）: Chandler は AD 800〜1850 年に 2 万人超（アジア 4 万人超）、1850 年以降 4 万人超。
  Modelski は紀元前3500〜1000年 1 万人、紀元前1000〜紀元1000年 10 万人、2000 年 100 万人。⇒ **載っていない＝記載が無い**であって
  存在しなかったではない。カードと Atlas の答えがこの文を運ぶ。

## 1. 規則（`js/hist-urban.js` が唯一の正本・地図と Atlas とテストが同じ関数に訊く）

- **補間しない**: 年 T には「T 以前で最も新しい記載年 y の数値」を、`T < y + 窓[y]` の間だけ示す。ラベルとカードは常に y を
  述べる。**2 冊が同じ y を述べれば両方**（紀元1000年のバグダードは Chandler 125,000 と Modelski 1,500,000——同心円 2 つ）。
- **年は天文年**（BC n → 1 − n）。Modelski の BC_100 → AD_1 は 100 年（BC/AD の素朴な差 99 ではない）。
- **窓は記録自身の刻みから**（`windows()`）。⚠ **2 回作り直した**——否定された見立てを残す:
  1. 「y をまたぐ間隔の中央値」: 疎な時代で長い間隔に偏る（紀元361年 439 年）。
  2. 「y に記載された都市が次に記載されるまでの中央値」: 記載の少ない年で数件の標本になる（紀元630年＝Xuanzang 系の 10 都市で
     **896 年**。Aksu の 630 年の数値 1,500 人が **1250 年の地図に出ていた**——列挙して初めて見えた）。
  3. 採用: ① をまたぐ沈黙の中央値 S(y)、② [y − S(y), y] に記載された全数値の「次の記載までの年数」の中央値。
     紀元前は概ね 100〜200、紀元1000年 100、1500年 47、1850年 9、1900年以降 25。描かれる都市数（T: 件）:
     −1999: 17・−499: 7・1000: 113・1250: 101・1500: 235・1800: 555・1900: 1,116・1925: 249・1950: 450・2000: 293・2025 以降 0。
  1925 年に 1,116 → 249 と落ちるのは記録そのもの（Chandler の 1900 年表は 1,094 都市、1925 年表は 214 都市）。
- **同一性は座標＋名前**: 表をまたぐ 2 行は、名前（City 欄のカンマ区切り＋OtherName）が一致し、かつ**精度の粗い方の桁で
  座標が等しい**ときだけ 1 都市。同じ表の別行はまとめない（Chandler の Gwalior と Lashkar の Gwalior）。286 都市が複数の表に跨る。
  ⚠ Modelski は City 欄に「Kanauji, Kanauj」と 2 名を書く——最初は分割せず別都市になっていた。
- **Pleiades / 歴史都市名への結び付き**: 互いに最も近い相手であり、かつ共通の名前を持つときだけ（距離の閾値を書かない）。
  名前一致の距離分布は 1 km 未満 124・10 km 未満 197 / 246 で、残りは数十〜数千 km の同名異所。相互最近傍はこの尾を自然に落とす。
  結ばれた都市は、相手が名前を書いている間ラベルを数値だけにする（円は常に描く）。

## 2. 史実との突き合わせ（`.agents/rules/historical-verification.md`——年と場所を名指して列挙）

| 年・地域 | 描かれるもの | 照合 |
|---|---|---|
| 1000 年・中国（16） | 開封 40 万（両書）・成都・大理・蘇州・天水・杭州・銀川・南京・北京・洛陽・揚州・福州・広州・遼陽(928) ほか | 北宋の都・開封が最大は史実どおり。大理（大理国）・銀川（西夏の興慶府）も当時の都 |
| 1000 年・インド（7） | Kanauj・Patan（2 点）・Thanjavur・Somnath・Khajuraho・Rajahmundry | チョーラ朝の Thanjavur、Somnath（1025 年のガズナ朝侵攻前）、チャンデーラ朝の Khajuraho は妥当。**Patan が 2 点**: Modelski と Chandler の座標が 0.0228° 違う（同じ Anhilwara Patan と推定）——出典の座標どおり別に描き、統合しない |
| 1500 年・アメリカ（13） | Mexico City(Tenochtitlan) 8 万・Texcoco・Cuzco 5 万・Gumarcaj・Tlaxcala・Tzintzuntzan・Cholula・Quito・Riobamba(1487) ほか | アステカ三都市同盟・インカ・キチェ（Gumarcaj）・タラスコ（Tzintzuntzan）の首都が揃う。Tenochtitlan 8 万は現代推計（20 万前後）より小さい——Chandler の値を述べるだけ |
| 紀元前 500 年・メソポタミア | Babylon 20 万・Ecbatana 10 万（Modelski） | 新バビロニア滅亡後のアケメネス朝期。⚠ 窓の 2 案目では Nineveh（650 BC の記載）が 500 BC に出ていた——Nineveh は 612 BC に陥落。採用案では 550 BC で消える |
| 1400 年・サハラ以南（10） | Mali(Niani?)・Oyo・Gao・Great Zimbabwe・Axum・Kano・Kilwa・Dongola・Djenné・Timbuktu | 地域の主要都市が揃う。「Mali」は certainty 3（位置が最も不確か） |
| 紀元前 2000 年 | Ur・Memphis・Girsu・Isin・Larsa・Mari・Nippur・Uruk・Susa・Harappa・Mohenjo-daro ほか | ウル第三王朝末期とインダス文明期として妥当 |

**出典自体の疑わしい記載（記載どおり描き、ここに残す）**:
- **Modelski の Teotihuacan と Caracol の紀元前 900〜500/600 年の値は、同じ行の紀元 400〜800 年の値と完全に同じ並び**
  （Teotihuacan: BC 900/800/700/600 = 10/15/10/10 万、AD 400/500/600/700 = 10/15/10/10 万。Caracol も同形）。
  テオティワカンの都市化は紀元前 100 年ごろからで、紀元前 900 年に 10 万は史実に合わない。**転記で AD の列が BC に複写された**
  可能性が高い。さらに Caracol（ベリーズのマヤ都市）の座標は「El Caracol」＝チチェン・イッツァ（メキシコ）の天文台に当たっている
  （certainty 3）。⚠ 同じ「並びの複写」を全行で探すと、ほかに当たるのは Istanbul（AD 400–600 ＝ 800–1000）だけで、こちらは
  安定した値として起こりうる——**機械的な除外規則にはならない**。最終報告で扱いを提案する。
- **Chandler の Gelibolu（Gallipoli）1000 年 30 万・1200 年 15 万**: 同年のコンスタンティノープル（Chandler 30 万）と同規模で、
  史実のガリポリ（中世の小さな港町）に合わない。certainty は 1（座標は正しく Gelibolu）——数値の帰属先が違う疑い。
- **Modelski の Shangqi（Shanghi）が Chandler の Shanghai と全く同じ座標**（31.22222, 121.45806）。紀元前 500〜300 年の都市で、
  おそらく商丘（河南省）。certainty 3。⇒ 名前の違う 2 都市が同じ点に立つとき**互いにそれを述べる**（`same`）規則にした——
  カードが「この点は Shanghai と同じ座標で、その地点のジオコードの可能性がある」と言う。事例ではなく性質に付けた規則で、
  ほかに該当は無い（Chandler の中では座標の重複ゼロ）。

## 3. 入れ物（何を足したか）

- `scripts/build-hist-urban.mjs`（`--harvest --as-of`・`--check`）＋固定記録 `scripts/histurban/reba-record.json`
  （3 表の空でないセルを文字列のまま）→ `data/hist-urban.json`。`check:histurban`（オフライン・約 2 秒）。
  近傍探索は緯度帯の索引（大円距離は緯度差を下回らない）で、総当たりと同じ答え（テスト ⑦）。
- `scripts/lib/upstream-cadence.mjs` `REBA_URBAN`（static。figshare の版は不変）。`GOVERNANCE` は SOURCE を読むだけ。
- `js/hist-urban.js`（規則・純関数・1 回だけの遅延取得）／`js/layer-pkg-histurban.js`＋`js/layers/dl-histurban.js`（レイヤー）／
  `js/layer-time-decl.js` の `dl-histurban`（範囲は `data/hist-urban.json#span` を cite）／Atlas `time.cityPopulation`。
- 出典: `js/reference-data.js` の DATA_SOURCES 1 行（`n` は `GOVERNANCE.paidBy` と値で一致）と sources ページの en/jp 説明。
- 起動費用ゼロ: データは行を切り替えたときだけ取る（パッケージは動的 import）。取得は `js/fetch-deadline.js` の
  `readWithin`＋`clockFor`（本文の各チャンクで時計を再始動）——素の `fetch` は `check:static` の fetch-deadline 台帳が拒んだ。
- `tests/global-surface-baseline.json`: 新しい window の名前は足していない。読みの辺が増えただけ（`IntMapHistPlaces` 0→2・
  `IntMapHistScale` 20→22・`IntMapLabelScale` 48→49・`IntMapMapTypography` 9→10・`IntMapPlaceReaders` 5→6・`IntMapSafe` 144→145）。
  どれも import できる持ち主を持たない IIFE なので、`js/hist-places.js` と同じく window から読む。
- `scripts/atlas-eval/cassettes/rail-request-reached-nothing.json` を再録音: 「所要時間 距離」の `find_capability` の答えに
  新しい `time.*` 行が並ぶようになった（意図した変化）。
- 時刻の宣言は `follows` と `self` の両方（`js/layer-pkg-histurban.js apply`）: `follows` だけだと現在の時計で「預かる」層になり、
  門が「今日の層は現在を述べよ」と拒んだ。範囲の外では自分で何も描かない、が実際の振る舞い。

## 4. 検査

- `tests/hist-urban-population-checks.test.mjs`（10 件）: バイト再導出／全数値が出典のセルそのもの（追加・欠落・変更なし）／
  天文年／窓を総当たりで再計算・補間なし・最新の記載だけ・窓の外では描かない（Aksu 630 → 1000 年は無し）／
  certainty の保持／座標＋名前の同一性（Kanauj 統合・Gwalior 2・Springfield 3・Shangqi ⇄ Shanghai）／結び付きが相互最近傍＋共通名で
  索引の答えが総当たりと一致／中国・インド・アメリカ・サハラ以南・メソポタミアに届く／壊れた記録を拒む／推移。
- `tests/hist-urban-population.spec.js`（地図）・`tests/hist-urban-population-atlas-checks.test.mjs`（Atlas）。
