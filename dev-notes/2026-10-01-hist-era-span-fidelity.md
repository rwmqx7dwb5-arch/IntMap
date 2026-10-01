---
title: 1600 年の地図に «Songhai»（1591 年に滅亡）と «Watassid Morocco»（1554 年に終焉）が描かれていた——上流の 1600 年の枚そのものが述べていた。枚の名前を「読者の年にその政体が存在したか」で問い直し、Wikidata の存続期間を史実と突き合わせた審査済みの行（118 名）で名前を外す。形は残す。門が未判定の所見を落とす
date: 2026-10-01
---

〈依頼〉本番（048e4ce）で Chronos を 1600 年にすると「Songhai」と「Watassid Morocco」が描かれる。ソンガイ帝国は 1591 年（トンディビの戦い）、ワッタース朝は 1554 年に滅んでいる。地物は NAME と BORDERPRECISION しか持たない。古い年のスナップショットを次の枚までの期間に当てているのではないか——推測なので実測で確かめ、同じ形の全件を見つけ、構造で直し、`check:histfidelity` に検出規則を足す。

## 0. 測った——推測は半分だけ当たっていた

- **否定された見立て:「古い枚を次の枚まで延長している」は、報告された 2 件の原因ではない。**
  出荷済みの `data/hist-eras.js` の 1600 年の枚（上流 `world_1600.geojson`）**そのもの**が
  «Songhai» と «Watassid Morocco» を持っている（どちらも BORDERPRECISION 1）。`world_1700` もまだ
  «Songhai» を持つ。上流の作図者が前の枚から名前を持ち越し、**その枚の年として**述べていた。
  形式としては完全に正しい行で、門は全部緑だった（`.agents/rules/historical-verification.md` §1）。
- **ただし「延長」も実在する別の経路だった。** `js/time-borders.js` の `nearest()` は空白の年を近い方の
  枚で答えるので、`world_1600` は **1566〜1625 年**に描かれる（ページ自身の `nearest` を二分探索で
  評価して測った）。その結果 1581 年成立の «Dutch Republic» が 1570 年に、1547 年戴冠の
  «Tsardom of Muscovy» が 1516〜1546 年に載っていた。
- 2 経路は地図の上で同じ主張（「この年に、この政体」）になるので、**問う年は枚の年ではなく読者の年**。
- **OpenHistoricalMap のベクタタイル（もう 1 人の読み手）は政体の名前を描かない**:
  `ohmFilter` の呼び手は `js/time-admin1.js` の 3 段だけで、admin_level 3〜4 / 5〜6 / 7。
  1689 年より前の政体名はこの束（とその年切りタイル `data/hvt/hist-eras.*`、遠隔の代替）からしか
  出ず、3 つとも `js/time-borders.js` の `go()` を通る。だから規則は `go()` の後ろ 1 か所に効く。
- **上流には識別子が無い**（名前付き 10,388 件のうち `wikipedia` 欄は 21 件）。存続期間に届く道は
  名前だけ。
- **Wikidata への機械的な結合だけでは足りない**（§2-2・§4-3 の実測）:
  - 報告された 2 件を**見つけられない**。«Songhai» にラベルが一致する項目は 6 件あるが帝国
    （Q202687 «Songhai Empire»）はその中に無い。«Watassid Morocco» は綴り違いで一致する項目が無い。
  - 結べた所でも**別の単位**のことが多い。«Mali» → Q912（共和国・1960）、«Vijayanagara» → 町、
    «Benin» → 共和国、«Shan states» → P576 1563（シャン諸州は 1948 年まで続く）。
  - **Wikidata 自身の誤り**: «Hittites»（Q5406）の P571 は **+1500（西暦）**。そのまま使えば紀元前の
    ヒッタイトが全部消える。（上流＝Wikidata 側の誤りとして記録し、適用していない。）
  ⇒ **機械が見つけ、人が史実で判定する**構造にした。

## 1. 構造

- **規則は 1 か所**: `js/hist-scale.js` の `eraSpanOut(row, y)`。`e` より後・`s` より前なら外す
  （境界の年そのものは期間の内）。`js/time-borders.js` が描画に、`scripts/hist-fidelity.mjs` が門に
  同じ関数を使う（門はページを評価して確かめる）。
- **審査済みの存続期間** `data/hist-era-spans.json`（`scripts/histeras/spans.mjs`）:
  - `rows` — 上流の名前・**その名前が指す単位だと確かめた** QID・**Wikidata が述べ、かつ史実が一致する**
    境界・史実の一文（`history`）。⚠ **境界が史実より厳しい（存在した年まで外す）ものは行にしない**
    （例: Kadambas の 525 は史実 c.540 より早い → 反証）。
  - `refuted` — 調べて**外さなかった**所見と理由（`other-identity` / `date-disputed` / `name-not-claim`）。
  - `facts` — Wikidata の P571 / P576（`--fetch` で取り直す。照合器が結んだ QID と行・反証の QID 全部）。
  - `gov` — 出自を値で（`check:datagov`）。
- **ページ**（`js/time-borders.js`）:
  - `go()` の枚の分岐は `_eraShow(fc, year)`（チベット合併と名前の期間を 1 関数に）を通す。
    比較する状態 `shownCorr` は「チベット合併の有無＋外す名前の集合」で、同じ枚のまま 1591→1592 を
    跨いでも描き直す。言語切替も同じ関数を通る。キャッシュの枚は書き換えない（上流が述べたまま）。
  - **外すのは名前だけで、形は残す。** 外した形は `NAME:''` と `_wName` / `_wQ` / `_wSide` / `_wYear` /
    `_wLabel` を持ち、ラベルは出ず、クリックすると `blankNote()` が「上流はこの形を «X» と呼ぶが、
    その政体は Y には存在しない」と、どの QID の何年に基づくかを述べる（「上流は名前を与えていない」
    とは言わない——それは偽になる）。代わりの名前は付けない。
  - ⚠ **読み手は 1 人ではない**: `currentFC`（Atlas・比較・語り手・時代の強調）・`featureAt`・
    `geomFor`・`geomForCode` は**描いている当の collection**（`_drawnFC()`＝`shownFC`）を読むように
    した。以前はキャッシュの生の枚を読んでいて、#R106 のチベット合併ですら描画と食い違っていた。
  - `coverage()` は外した名前を「上流が名前を与えていない形」と**別に**数え、`note()`（レイヤー行の
    注記）が列挙する。新しい文は en + jp（`CONSTITUTION.md` §7）。
  - 読み込みは `jsonWithin` + `clockFor`（`check:static` の fetch-deadline）。時間切れ（観測できなかった）
    は「行が無い」と覚えず、次の travel でもう一度読む。
- **門**（`npm run check:histfidelity` の ④ `era-span`）: どの枚がどの年に描かれるかを `nearest` から求め、
  存続期間を持つ名前（照合器の QID か審査済みの行）が描かれる年に掛かる所見を**実体から発見**する。
  判定の無い所見・Wikidata が述べない境界・`history` の無い行・何にも掛からなくなった行や反証・
  ページが外さない／期間内なのに外す——どれも落第。`--report` が全所見を判定つきで出し、
  `--year Y --in w,s,e,n` は区分に加えて**その年に描かれる時代の枚の政体**を、外す名前に印を付けて列挙する。

## 2. 列挙した年×地域と処置

列挙は 2 段。⑴ 機械: 全 54 枚・全名前について、照合器の QID と審査済みの行の存続期間が描かれる年に
掛かるもの（**189 所見**）。⑵ 人: 1600 / 1650 / 1700 / 1530 / 1500 / 1492 / 1400 / 1300 / 1279 / 1200 /
1100 / 1000 / 900 / 800 / 700 / 600 / 500 / 400 / 300 / 200 / 100 / 前1 / 前100 年の枚について、
オーストラリアと北米の民族名を除く名前を全部読み、史実に照らして照合器が拾えない政体を探した
（Songhai・Watassid Morocco・Adal・Wadai・Vijayanagara・Bidar・Ahmadnagar・Golkonda・Dutch Brazil・
New Amsterdam・Austrian Empire・Mali・Seljuk Caliphate（ルーム・セルジューク）・Srivijaya・Kediri・Pagan・
Chola・Kamakura・Ghaznavid・Buyid・Liao・Benevento・Tiahuanaco・Sukhothai・Chimú・Bulgar Khanate・Koguryo・
Sui・Tang・Aghlabid・Pallava・Essex・Kent・Nan-Yue・Min-Yue・Satavahana・Suren・Jin Empire）。それぞれ
Wikidata で単位を選び（検索の第 1 候補を信じず、ラベル・P571・P576 を見て）、行にした。

`--year 1600 --in -20,0,40,40`（アフリカ）の結果: Songhai（1591 終焉）・Watassid Morocco（1554 終焉）・
Wadai（1635 成立）の 3 つの名前を外す。全世界では 1600 年に Wadai・Inca Empire（1572）・Songhai・Adal（1577）・
Pegu（1552）・Watassid Morocco の 6 つ。`--year 1570 --in 0,45,10,55`: Dutch Republic（1581 成立）を外す。

### 名前を外したもの（131 所見）

| 上流の名前 | 単位（QID・Wikidata のラベル） | 境界 | 名前を外す年（枚: 年の範囲） |
|---|---|---|---|
| Elam | Q128904 Elam | 成立 前2700 | 前5000枚: 前6499–前4500・前4000枚: 前4499–前3500・前3000枚: 前3499–前2701 |
| Urartu | Q185068 Urartu | 成立 前860 | 前1500枚: 前1749–前1250・前1000枚: 前1249–前861 |
| Assyria | Q41137 Assyrian Empire | 終焉 前609 | 前700枚: 前608–前600 |
| Achaemenid Empire | Q389688 Achaemenid Empire | 成立 前550 | 前500枚: 前599–前551 |
| Xiongnu | Q188836 Xiongnu | 成立 前300 | 前400枚: 前449–前362 |
| Atropatene | Q260437 Atropatene | 成立 前323 | 前323枚: 前361–前324 |
| Ptolemaic Kingdom | Q2320005 Ptolemaic Kingdom | 成立 前305 | 前300枚: 前311–前306 |
| Mauryan Empire | Q62943 Maurya empire | 終焉 前185 | 前200枚: 前184–前150・前100枚: 前149–前51 |
| Nan-Yue | Q827040 Nanyue | 成立 前207 | 前200枚: 前249–前208 |
| Han Empire | Q7209 Han dynasty | 成立 前206 | 前200枚: 前249–前207 |
| Min-Yue | Q1936158 Minyue | 終焉 前110 | 前100枚: 前109–前51 |
| Nan-Yue | Q827040 Nanyue | 終焉 前111 | 前100枚: 前110–前51 |
| Seleucid Kingdom | Q93180 Seleucid Empire | 終焉 前63 | 前100枚: 前62–前51 |
| Kushan Empire | Q25979 Kushan Empire | 成立 30 | 前100枚: 前149–前51 |
| Odrysian Kingdom | Q870517 Odrysian kingdom | 終焉 46 | 前1枚: 47–50 |
| Koguryo | Q28370 Goguryeo | 成立 前37 | 前1枚: 前50–前38 |
| Dacia | Q173082 Dacia | 終焉 106 | 100枚: 107–150 |
| Nabatean Kingdom | Q11029653 Nabataean kingdom | 終焉 106 | 100枚: 107–150 |
| Satavahanihara | Q5257 Satavahana dynasty | 終焉 220 | 200枚: 221–250・300枚: 251–350・400枚: 351–450 |
| Han | Q123576003 Han | 終焉 220 | 200枚: 221–250 |
| Suren Kingdom | Q1255614 Indo-Parthian kingdom | 終焉 226 | 200枚: 227–250・300枚: 251–350・400枚: 351–450 |
| Parthian Empire | Q1986139 Parthian Empire | 終焉 224 | 200枚: 225–250・300枚: 251–350 |
| Jin | Q124738742 Jin | 成立 266 | 300枚: 251–265 |
| Gupta Empire | Q11774 Gupta Empire | 成立 320 | 300枚: 251–319 |
| Han Zhao | Q1574107 Han Zhao | 終焉 329 | 300枚: 330–350 |
| Han Zhao | Q1574107 Han Zhao | 成立 304 | 300枚: 251–303 |
| Northern Liang | Q1539360 Northern Liang | 終焉 439 | 400枚: 440–450 |
| Northern Liang | Q1539360 Northern Liang | 成立 397 | 400枚: 351–396 |
| Western Roman Empire | Q42834 Western Roman Empire | 終焉 476 | 500枚: 477–550 |
| Jin Empire | Q306928 Eastern Jin dynasty | 終焉 420 | 500枚: 451–550 |
| Khazars | Q173282 Khazars | 成立 618 | 600枚: 551–617 |
| Göktürks | Q205466 Göktürks | 成立 552 | 600枚: 551–551 |
| Sui Empire | Q7405 Sui dynasty | 終焉 618 | 600枚: 619–650・700枚: 651–750 |
| Sui Empire | Q7405 Sui dynasty | 成立 581 | 600枚: 551–580 |
| Barghawata | Q808139 Barghawata | 成立 744 | 700枚: 651–743 |
| Koguryo | Q28370 Goguryeo | 終焉 668 | 700枚: 669–750 |
| Paekche | Q28428 Baekje | 終焉 660 | 700枚: 661–750 |
| Sasanian Empire | Q83891 Sasanian Empire | 終焉 651 | 700枚: 652–750 |
| Aghlabid Emirate | Q207600 Aghlabids | 成立 800 | 800枚: 751–799 |
| Emirate of Córdoba | Q1337854 Emirate of Córdoba | 成立 756 | 800枚: 751–755 |
| Essex | Q110888 Kingdom of Essex | 終焉 825 | 800枚: 826–850・900枚: 851–950 |
| Tibetan Empire | Q2431480 Tibetan Empire | 終焉 842 | 800枚: 843–850・900枚: 851–950 |
| Carolingian Empire | Q31929 Carolingian Empire | 成立 800 | 800枚: 751–799・800枚: 751–799 |
| Papal States | Q170174 Papal States | 成立 754 | 800枚: 751–753 |
| Wessex | Q105313 Kingdom of Wessex | 終焉 927 | 900枚: 928–950 |
| Aghlabid Emirate | Q207600 Aghlabids | 終焉 909 | 900枚: 910–950 |
| Emirate of Córdoba | Q1337854 Emirate of Córdoba | 終焉 929 | 900枚: 930–950 |
| Nan Chao | Q1045322 Kingdom of Nanzhao | 終焉 902 | 900枚: 903–950・1000枚: 951–1050・1100枚: 1051–1150・1200枚: 1151–1239 |
| Tang Empire | Q9683 Tang dynasty | 終焉 907 | 900枚: 908–950 |
| Pallava | Q466803 Pallava dynasty | 終焉 897 | 900枚: 898–950 |
| Kent | Q328818 Kingdom of Kent | 終焉 871 | 900枚: 872–950 |
| Silla | Q28456 Silla | 終焉 935 | 900枚: 936–950 |
| Great Moravia | Q193152 Great Moravia | 終焉 907 | 900枚: 908–950 |
| Carolingian Empire | Q31929 Carolingian Empire | 終焉 887 | 900枚: 888–950・900枚: 888–950 |
| Balhae | Q28322 Balhae | 終焉 926 | 900枚: 927–950 |
| Saffarids | Q45310 Saffarid dynasty | 成立 861 | 900枚: 851–860 |
| Kyivan Rus | Q1108445 Kievan Rus' | 成立 882 | 900枚: 851–881 |
| Ghaznavid Emirate | Q249578 Ghaznavid Empire | 成立 962 | 1000枚: 951–961 |
| Kingdom of France | Q70972 Kingdom of France | 成立 987 | 1000枚: 951–986 |
| Caliphate of Córdoba | Q171740 Caliphate of Córdoba | 終焉 1031 | 1000枚: 1032–1050 |
| Poland | Q36 Poland | 成立 960 | 1000枚: 951–959 |
| Kingdom of Georgia | Q154667 Kingdom of Georgia | 成立 1008 | 1000枚: 951–1007 |
| Khazars | Q173282 Khazars | 終焉 1048 | 1000枚: 1049–1050 |
| Holy Roman Empire | Q12548 Holy Roman Empire | 成立 962 | 1000枚: 951–961 |
| Denmark-Norway | Q62651 Denmark–Norway | 成立 1536 | 1000枚: 951–1050・1492枚: 1447–1496・1500枚: 1497–1515・1530枚: 1516–1535 |
| Pratiharas | Q5324 Gurjara-Pratihara | 終焉 1036 | 1000枚: 1037–1050・1100枚: 1051–1150 |
| Kingdom of Sukhotai | Q863279 Sukhothai Kingdom | 成立 1238 | 1100枚: 1051–1150 |
| Liao | Q4958 Liao dynasty | 終焉 1125 | 1100枚: 1126–1150・1200枚: 1151–1239 |
| Dutchy of Benevento | Q267816 Duchy of Benevento | 終焉 1081 | 1100枚: 1082–1150・1200枚: 1151–1239 |
| Almoravid dynasty | Q75613 Almoravid dynasty | 終焉 1147 | 1100枚: 1148–1150 |
| Kakheti-Hereti | Q7216494 First Kingdom of Kakheti | 終焉 1104 | 1100枚: 1105–1150 |
| Ghaznavid Emirate | Q249578 Ghaznavid Empire | 終焉 1187 | 1200枚: 1188–1239 |
| Buwayhid Emirates | Q273874 Buyid dynasty | 終焉 1062 | 1200枚: 1151–1239 |
| Fatimid Caliphate | Q160307 Fatimid Caliphate | 終焉 1171 | 1200枚: 1172–1239 |
| Tiahuanaco Empire | Q1307407 Tiwanaku polity | 終焉 1150 | 1200枚: 1151–1239 |
| Principality of Galicia-Volhynia | Q239502 Kingdom of Galicia–Volhynia | 成立 1199 | 1200枚: 1151–1198 |
| Buyiids | Q273874 Buyid dynasty | 終焉 1062 | 1200枚: 1151–1239 |
| Principality of Novgorod | Q130499974 Principality of Novgorod | 終焉 1136 | 1200枚: 1151–1239 |
| Mongol Empire | Q12557 Mongol Empire | 成立 1206 | 1200枚: 1151–1205 |
| Kamarupa | Q1194765 Kamarupa | 終焉 1140 | 1200枚: 1151–1239 |
| Angevin Empire | Q538677 Angevin Empire | 成立 1154 | 1200枚: 1151–1153 |
| Chola state | Q151148 Chola dynasty | 終焉 1279 | 1279枚: 1280–1289・1300枚: 1290–1350・1400枚: 1351–1446 |
| Mamluke Sultanate | Q282428 Mamluk Sultanate of Egypt | 成立 1250 | 1279枚: 1240–1249 |
| Ilkhanate | Q178084 Ilkhanate | 成立 1256 | 1279枚: 1240–1255 |
| Khanate of the Golden Horde | Q79965 Golden Horde | 成立 1243 | 1279枚: 1240–1242 |
| Kediri | Q756895 Kediri | 終焉 1221 | 1279枚: 1240–1289・1300枚: 1290–1350・1400枚: 1351–1446 |
| Pagan | Q888574 Pagan kingdom | 終焉 1297 | 1300枚: 1298–1350・1400枚: 1351–1446 |
| Seljuk Caliphate | Q975405 Sultanate of Rum | 終焉 1307 | 1300枚: 1308–1350・1400枚: 1351–1446 |
| Ilkhanate | Q178084 Ilkhanate | 終焉 1335 | 1300枚: 1336–1350 |
| Shogun Japan (Kamakura) | Q736839 Kamakura shogunate | 終焉 1333 | 1300枚: 1334–1350・1400枚: 1351–1446 |
| Srivijaya Empire | Q234197 Srivijaya | 終焉 1377 | 1400枚: 1378–1446 |
| Sukhothai | Q863279 Sukhothai Kingdom | 終焉 1438 | 1400枚: 1439–1446・1400枚: 1439–1446・1400枚: 1439–1446 |
| Bulgar Khanate | Q420759 Second Bulgarian Empire | 終焉 1396 | 1400枚: 1397–1446 |
| Beylik of Aydin | Q717112 Beylik of Aydın | 終焉 1426 | 1400枚: 1427–1446 |
| Nanzan | Q55522 Nanzan | 終焉 1429 | 1400枚: 1430–1446 |
| Chūzan | Q55521 Chūzan | 終焉 1429 | 1400枚: 1430–1446 |
| Hokuzan | Q55523 Hokuzan | 終焉 1416 | 1400枚: 1417–1446 |
| Kalmar Union | Q62623 Kalmar Union | 成立 1397 | 1400枚: 1351–1396 |
| Timurid Empire | Q484195 Timurid Empire | 成立 1370 | 1400枚: 1351–1369 |
| Khmer Empire | Q201705 Khmer Empire | 終焉 1431 | 1400枚: 1432–1446 |
| Papua New Guinea | Q691 Papua New Guinea | 成立 1975 | 1492枚: 1447–1496・1500枚: 1497–1515 |
| Khanate of Sibir | Q190513 Siberian Khanate | 成立 1490 | 1492枚: 1447–1489 |
| Chimú | Q581741 Chimor | 終焉 1470 | 1492枚: 1471–1496 |
| Ahmadnagar | Q400998 Ahmadnagar Sultanate | 成立 1490 | 1492枚: 1447–1489 |
| Berar | Q818666 Berar Sultanate | 成立 1490 | 1492枚: 1447–1489 |
| Golkonda | Q19805959 Golconda Sultanate | 成立 1518 | 1492枚: 1447–1496・1500枚: 1497–1515・1530枚: 1516–1517 |
| Alwa | Q449639 Alodia | 終焉 1504 | 1500枚: 1505–1515 |
| Wadai | Q1132786 Ouaddai Empire | 成立 1635 | 1530枚: 1516–1565・1600枚: 1566–1625・1650枚: 1626–1634 |
| Astrakhan Khanate | Q210163 Astrakhan Khanate | 終焉 1556 | 1530枚: 1557–1565 |
| Mughal Empire | Q33296 Mughal Empire | 成立 1526 | 1530枚: 1516–1525 |
| Pegu | Q1572529 Hanthawaddy Kingdom | 終焉 1552 | 1530枚: 1553–1565・1600枚: 1566–1625 |
| Watassid Morocco | Q970799 Wattasid dynasty | 終焉 1554 | 1530枚: 1555–1565・1600枚: 1566–1625 |
| Tsardom of Muscovy | Q186096 Tsardom of Russia | 成立 1547 | 1530枚: 1516–1546・1530枚: 1516–1546 |
| Inca Empire | Q28573 Inca Empire | 終焉 1572 | 1600枚: 1573–1625 |
| Songhai | Q202687 Songhai Empire | 終焉 1591 | 1600枚: 1592–1625・1650枚: 1626–1675・1700枚: 1676–1688 |
| Adal | Q2365048 Adal Sultanate | 終焉 1577 | 1600枚: 1578–1625 |
| Dutch Republic | Q170072 Dutch Republic | 成立 1581 | 1600枚: 1566–1580 |
| Bidar | Q669317 Bidar Sultanate | 終焉 1619 | 1600枚: 1620–1625・1650枚: 1626–1675 |
| Dutch East Indies | Q188161 Dutch East Indies | 成立 1800 | 1650枚: 1626–1675・1700枚: 1676–1688 |
| Rozwi | Q986822 Rozwi Empire | 成立 1660 | 1650枚: 1626–1659 |
| Austrian Empire | Q131964 Austrian Empire | 成立 1804 | 1650枚: 1626–1675・1700枚: 1676–1688・1700枚: 1676–1688 |
| Sardinia-Piedmont | Q2577303 Kingdom of Sardinia | 成立 1720 | 1650枚: 1626–1675・1700枚: 1676–1688 |
| Mali | Q184536 Mali Empire | 終焉 1670 | 1650枚: 1671–1675・1700枚: 1676–1688 |
| Dutch Brazil | Q221357 Dutch Brazil | 終焉 1654 | 1650枚: 1655–1675・1700枚: 1676–1688 |
| Dutch Brazil | Q221357 Dutch Brazil | 成立 1630 | 1650枚: 1626–1629 |
| New Amsterdam | Q382593 New Netherland | 終焉 1667 | 1650枚: 1668–1675・1700枚: 1676–1688 |
| Dutch Formosa | Q699446 Dutch Formosa | 終焉 1662 | 1650枚: 1663–1675・1700枚: 1676–1688 |
| Nogai Horde | Q631210 Nogai Horde | 終焉 1634 | 1650枚: 1635–1675・1700枚: 1676–1688 |
| Ahmadnagar | Q400998 Ahmadnagar Sultanate | 終焉 1636 | 1650枚: 1637–1675 |
| Vijayanagara | Q167639 Vijayanagara Empire | 終焉 1646 | 1650枚: 1647–1675 |
| Hong Kong | Q8646 Hong Kong | 成立 1841 | 1650枚: 1626–1675・1700枚: 1676–1688 |

### 反証して外さなかったもの（58 所見）

| 上流の名前 | QID | Wikidata の境界 | 理由 |
|---|---|---|---|
| Ur | Q5699 Ur | 成立 前3800 | date-disputed — Ur was occupied from the Ubaid period (5th millennium BCE); Wikidata's 3800 BCE is later than the archaeological record. |
| Hittites | Q5406 Hittites | 成立 1500 | date-disputed — Wikidata states an inception of +1500 CE for the Hittites — evidently an error (the Hittite kingdom is dated c. 1650-1180 BCE). Not applied; reported upstream-side in the dev note. |
| Saba | Q216068 Sheba | 成立 前1000 | date-disputed — Saba is dated from the 12th to the 8th century BCE depending on the source; the record does not fix 1000 BCE. |
| Wu | Q912068 Wu | 成立 前900 | date-disputed — Wu is traditionally founded by Taibo (12th-11th c. BCE); 900 BCE is not a date history fixes. |
| Gandhāra | Q112980583 Gandhāra | 終焉 前535 | name-not-claim — Gandhara names the region, which outlived the Achaemenid conquest (c. 535 BCE). |
| Kosala | Q756854 Kosala | 終焉 前500 | date-disputed — Kosala's annexation by Magadha is dated only to the 5th century BCE. |
| Magadha | Q234009 Magadha | 終焉 前345 | other-identity — Magadha names the realm of successive dynasties (Nanda, Maurya, Gupta), not only the kingdom Wikidata ends in 345 BCE. |
| Suren Kingdom | Q1255614 Indo-Parthian kingdom | 成立 前19 | date-disputed — Gondophares' accession is dated variously from c. 20 BCE to c. 20 CE. |
| New Zealand | Q664 New Zealand | 成立 1841 | name-not-claim — A geographic name for the islands. |
| Iceland | Q189 Iceland | 成立 1918 | name-not-claim — A geographic name for the island. |
| Kadambas | Q1479952 Kadamba dynasty | 終焉 525 | date-disputed — The Kadambas of Banavasi ended c. 540, later than Wikidata's 525. |
| Alwa | Q449639 Alodia | 成立 600 | date-disputed — Alodia is attested in the 6th century (conversion, c. 580); Wikidata's 600 is later. |
| Huari Empire | Q923516 Wari Empire | 成立 600 | date-disputed — Wari is dated from c. 500-600; Wikidata's 600 is the later bound. |
| Dvaravati | Q1268307 Dvaravati kingdom | 成立 600 | date-disputed — Dvaravati is dated from the 6th century. |
| Nobatia | Q568523 Nobatia | 終焉 650 | date-disputed — Nobatia merged with Makuria at some point before 707; 650 is not fixed. |
| Chen-La | Q1057118 Zhenla | 終焉 706 | other-identity — Chenla continued, divided into Land and Water Chenla, until the Khmer Empire (802). |
| Göktürks | Q205466 Göktürks | 終焉 657 | other-identity — The Second Turkic Khaganate (682-744) is also Göktürk; the 657 end is the Western Khaganate's. |
| Visigothic Kingdom | Q126936 Visigothic Kingdom | 終焉 718 | date-disputed — The last Visigothic king Ardo held Septimania until c. 721; Wikidata's 718 is earlier. |
| Ghana | Q117 Ghana | 成立 1957 | other-identity — The upstream draws the Ghana Empire, not the Republic of Ghana (1957). |
| Gurjara Pratihara | Q5324 Gurjara-Pratihara | 成立 800 | date-disputed — The Gurjara-Pratiharas are dated from Nagabhata I, c. 730. |
| Sindh | Q7522081 Sind Division | 成立 1843 | other-identity — The upstream draws Sindh under the Habbari emirate, not the British division (1843). |
| Kingdom of Norway | Q20 Norway | 成立 900 | date-disputed — Harald Fairhair's unification is dated c. 872; Wikidata's 900 is later. |
| Pechenegs | Q181752 Pechenegs | 成立 860 | name-not-claim — A people, not a dated polity. |
| Madagascar | Q1019 Madagascar | 成立 1960 | name-not-claim — A geographic name for the island. |
| Tibet | Q2444884 Tibet | 成立 1912 | other-identity — The upstream draws Tibet as a region and its successive states, not the 1912-1951 state. |
| Yemen | Q805 Yemen | 成立 1990 | name-not-claim — A geographic name for the region. |
| Georgia | Q230 Georgia | 成立 1008 | name-not-claim — A geographic name; the polity is drawn separately as «Kingdom of Georgia». |
| Croatia | Q224 Croatia | 成立 1991 | other-identity — The upstream draws the medieval Kingdom of Croatia (925), not the republic (1991). |
| Mali | Q184536 Mali Empire | 成立 1235 | other-identity — A kingdom of Mali (Malal) is attested from the 11th century (al-Bakri, 1068); 1235 is the founding of the empire. |
| Bulgar Khanate | Q420759 Second Bulgarian Empire | 成立 1185 | other-identity — On the 1000 and 1100 sheets upstream uses the same name for the First Bulgarian Empire (681-1018); one name, two units — unresolved, see dev-notes/2026-10-01-hist-era-span-fidelity.md. |
| Huari Empire | Q923516 Wari Empire | 終焉 1100 | date-disputed — Wari collapsed c. 1000; Wikidata's 1100 is generous but not stated by the record. Left as drawn. |
| Toltec Empire | Q17523945 Toltec Empire | 終焉 1122 | date-disputed — Tula fell c. 1150-1179; Wikidata's 1122 is earlier. |
| Nepal | Q837 Nepal | 成立 1768 | other-identity — The upstream draws the Kathmandu valley kingdoms, not the Gorkha state (1768). |
| Bhutan | Q917 Bhutan | 成立 1907 | name-not-claim — A geographic name for the region. |
| Benin | Q962 Benin | 成立 1960 | other-identity — The upstream draws the Kingdom of Benin, not the Republic of Benin (1960). |
| Great Khanate | Q7313 Yuan dynasty | 成立 1271 | other-identity — The Great Khan's realm predates the Yuan proclamation (1271). |
| Aymara kingdoms | Q6104778 Aymara kingdoms | 終焉 1438 | date-disputed — The Inca conquest of the Aymara kingdoms is dated variously (c. 1438-1470s). |
| Great Khanate | Q7313 Yuan dynasty | 終焉 1368 | other-identity — The Northern Yuan continued the Great Khanate after 1368. |
| Moldova | Q217 Moldova | 成立 1991 | other-identity — The upstream draws the Principality of Moldavia (1346), not the republic (1991). |
| Blue Horde | Q644979 Blue Horde | 終焉 1395 | date-disputed — The White/Blue Horde naming is contested and no source fixes its end at 1395. |
| Philippines | Q928 Philippines | 成立 1565 | name-not-claim — A geographic name for the archipelago. |
| Cambodia | Q424 Cambodia | 成立 1953 | name-not-claim — A geographic name (Kambuja), not the 1953 kingdom. |
| Funj | Q1475713 Sennar Sultanate | 成立 1505 | other-identity — The Funj are a people attested before the Sennar sultanate (1504); the name does not claim the sultanate. |
| Songhai | Q202687 Songhai Empire | 成立 1464 | other-identity — Before 1464 the Songhai state of Gao (Sonni dynasty) already existed; 1464 is the start of the imperial expansion under Sonni Ali. |
| Laos | Q819 Laos | 成立 1949 | other-identity — The upstream draws Lan Xang, not the 1949 state. |
| Otavalo | Q1020794 Otavalo | 成立 1534 | other-identity — The upstream draws the Otavalo people, not the city (1534). |
| Calvas | Q1989880 Calvas Canton | 成立 1824 | other-identity — The upstream draws the Calvas people, not the canton (1824). |
| Natchez | Q944044 Natchez | 成立 1716 | other-identity — The upstream draws the Natchez people, not the settlement (1716). |
| Bidar | Q669317 Bidar Sultanate | 成立 1527 | date-disputed — Barid Shahi rule at Bidar began in 1492; 1527 is the end of nominal Bahmani suzerainty. |
| White Horde | Q2553863 White Horde | 終焉 1500 | date-disputed — The White/Blue Horde naming is contested and no source fixes its end at 1500. |
| Oman | Q842 Oman | 成立 1970 | name-not-claim — A geographic name for the region. |
| Senegal | Q1041 Senegal | 成立 1960 | name-not-claim — A geographic name for the region. |
| Shan states | Q4765854 Shan States | 終焉 1563 | date-disputed — The Shan states persisted under Burmese suzerainty until 1885 and as British protectorates until 1948; Wikidata's 1563 is not their end. |
| Republic of the Seven Zenden | Q3456432 République des Sept-Dizains | 成立 1613 | date-disputed — The Zenden of the Valais governed themselves from the 15th century; 1613 is a formal date. |
| Belize | Q242 Belize | 成立 1981 | name-not-claim — A place name in use since the 17th century. |
| Surinam | Q7646305 Surinam | 成立 1667 | other-identity — The English colony of Surinam (1650-1667) is a different unit from the Dutch colony (1667). |
| Cayenne | Q44401 Cayenne | 成立 1664 | other-identity — The upstream draws French Guiana, not the town founded in 1664. |
| Ceylon | Q918153 British Ceylon | 成立 1815 | name-not-claim — A geographic name for the island, not British Ceylon (1815). |

## 3. 残っていること（未解決として記録する）

- **識別子の無い名前は、行を書かない限り見つからない。** 門が発見できるのは照合器が QID を結んだ名前と
  審査済みの行だけ。今回人が読んだ 23 枚以外（前 200 年より前の枚と、1715 / 1783 / 1800 年以降の代替用の枚）
  の照合器外の名前は、まだ人の目を通っていない。
- **1 つの名前が 2 つの単位を指す**: «Bulgar Khanate» は 1000・1100 年の枚では第一次ブルガリア帝国
  （1018 年滅亡）で、1279〜1400 年の枚では第二次ブルガリア帝国。行は名前ごとに 1 つなので 1396 年の終焉だけ
  適用し、1100 年の «Bulgar Khanate»（その頃はビザンツ領）は外していない。名前×枚で単位を結ぶ形が要る。
- 適用しなかった明白な誤り: «Post-Ming Warlords»（1700 年の枚・1676〜1688 年。三藩の乱は 1681 年、
  鄭氏は 1683 年に終わる）は記述名で QID が無い。«Imperial Japan (Fujiwara)»（1200 年の枚）は鎌倉期。
  «Vallabhi»（Maitraka 朝・Wikidata 767 年 / 史実 c.776）は Wikidata が史実より厳しいので書かなかった。
  «Mercia» は未調査。
- **Wikidata の誤り**: Q5406（Hittites）の P571 が +1500。Wikidata 側を直すのはこのリポジトリの外の仕事。
- **門の被覆計（③ coverage）の `politiesAt` は「その年以下で最も新しい枚」を使っていて、ページの
  `nearest()`（近い方へ進む）と食い違う。** 今回の ④ は `nearest` を評価して求めたが、③ は触っていない
  （観測値 `data/hist-fidelity.json` が動くため。直すなら観測を取り直して理由を書く別の作業）。
- 深い過去（前 5000〜前 2000 年）の «Indus valley civilization»・«Minoan» などの文化名は、今回の新しい
  Wikidata の値では所見に上がらなかった（以前の照合器のキャッシュでは上がっていた）。日付の付いていない
  ものは門の外にある。

## 4. 検査

- `node --test tests/hist-era-span-fidelity-checks.test.mjs` — 5 件緑（①枚そのものが述べている ②期間の外で
  名前だけ外れ、内では残り、形は消えない ③`go()` を通して `currentFC`・`featureAt`・`coverage`・`note`・
  カードが en / jp とも同じことを言う ④門が緑で全所見に判定がある ⑤判定を消す・Wikidata の述べない境界・
  `history` の無い行で門が赤くなる）。
- `npm run check:histfidelity` 緑（era-span: 189 所見・131 は行で外し・58 は理由つきで反証）。
- `check:histeras` / `check:histnames` / `check:histborders` / `check:static` / `check:datagov` /
  `check:docs` 緑。
- `check:datagov`: 新しい subject 2 つ（`data/hist-era-spans` と `scripts/histeras/spans.mjs → …`）は
  出自・権利・周期を値で述べ（`gov` と `GOVERNANCE`）、残る facet（`freshness.asOf`・`integrity.*`、
  spans.mjs 側は `origin.retrievedAt` も）を `--update` で台帳に記録した。`asOf` は「何年の世界か」で、
  存続期間の表には単一の値が無い。`integrity.*` は隣の `data/histnames.json` と同じく未宣言のまま。
- ⚠ `tests/history-era-borders-checks.test.mjs` の R710 の 2 件は、`featureAt` を関数名で切り出して vm で
  走らせる足場が `_drawnFC` を切り出しておらず赤くなる。足場の一覧に `_drawnFC` を足し、ctx に
  `shownFC: null` を置けば元の意味のまま通る（この作業の触ってよいファイルの外なので、統合時に直す）。

## 門の台帳を 2 つ動かした理由

- **`check:surface`（`window.IntMapHistScale` の読み 12 → 13）**: `js/time-borders.js` の `_spanOff` が規則の持ち主 `eraSpanOut` を `window.IntMapHistScale` から読む。import に替えることを試したが、`js/hist-scale.js` は 8 本以上の検査が `vm.runInContext` で classic script として評価しており（`tests/history-admin-tiers-checks.test.mjs` ほか）、`export` を書くとそれらが構文エラーになる。モジュール化はこの作業の範囲を越えるので、既存の 12 の読みと同じ経路で 1 つ足し、ベースラインを `--update` した。
- **`check:perf`（eager.gzip）**: CI で 1502.1 kB（天井 1493.9 kB・帯 7.5 kB）。増分は `js/time-borders.js` に足した規則の適用・`blankNote`・描いている collection を読む 4 つの読み手で、起動直後に描かれる地図に効く規則なので遅延読み込みにしない。`--update` で超えた行だけを上げた。
