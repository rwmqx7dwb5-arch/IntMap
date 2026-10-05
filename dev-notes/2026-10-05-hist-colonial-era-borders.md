---
title: 1886 年に地図から消えていた植民地の塊を戻した——CShapes が述べない土地を、Cliopatria より先に OpenHistoricalMap が答える（1886〜1923 年）
date: 2026-10-05
newsen: From 1886 the historical map now draws the colonial territories the sovereign-state record leaves out — the Congo Free State, German East Africa, Angola, Greenland under Denmark — from OpenHistoricalMap, up to 1923.
newsjp: 1886 年以降の歴史地図に、主権国家の記録には載らない植民地（コンゴ自由国・ドイツ領東アフリカ・アンゴラ・デンマーク領グリーンランドなど）を OpenHistoricalMap から 1923 年まで描くようになりました。
---

〈依頼〉1886 年に歴史地図の被覆が落ちる（1850 年 86.4% → 1886 年 79.1% → 1900 年 89.3%）。1886 年からも、CShapes が
描かない土地は OHM が述べるならそれで答え、そのあとに Cliopatria。

## 0. 測った——落ちていたのは記録の主語の交代だった

門と同じ計器（`scripts/hist-fidelity.mjs` `polityLandAt`・0.25° 格子・面積重み・Natural Earth の陸地）。
1886-01-01 にページは OHM（`data/hist-borders.js`、窓 1689〜1885）から CShapes（`data/cshapes.js`）へ渡り、CShapes は
**主権国家**の記録なので、OHM が描いていた植民地・保護領の塊がその日に消えていた。1885 → 1886 で消えた陸地の内訳
（現在の国の陸地に対する割合）は、OHM を足す前は:

- OHM の塊: コンゴ自由国・ドイツ領東アフリカ・アンゴラ・仏領コンゴ・ベチュアナランド……（アフリカの描画が 35,475 → 23,382 重みセル）
- グリーンランド（1885 年は OHM の Denmark が描き、1886〜1935 年はどの記録も述べない。世界の陸地の 1.45%）
- 年別の枚（1880 年の枚）: アラビア 0.76%・ソコト 0.29%・コン 0.14%・ロジ 0.14%・モシ 0.14%・カネム＝ボルヌ 0.11%・
  ザンジバル 0.10%……——枚は 1886 年から使わない（#991 の判断）。

OHM の admin_level=2 関係のうち 1886〜1960 年に効力を持つものは 1,132（索引 4,140 中・2026-10-05 取得）。

## 1. 作った

1. **`scripts/build-hist-borders.mjs`**: 記録の読み取り（日付・名前・重なりの整理・幾何）を `collect` に切り出し、束を作る
   `build` と新しい `buildLate`（CShapes の日付に効力を持つ関係を OHM のキャッシュに書く）が同じ読み取りを使う。
   `data/hist-borders.js` は作り直していない（窓・中身とも不変、`check:histborders` 緑）。
2. **`scripts/build-hist-clio.mjs --ohm-late`**: その関係を Cliopatria の行と同じ機構（`splitRow`）で CShapes の変化日ごとに
   切り、CShapes の土地を引いた残りだけを **`data/hist-borders-late.js`**（`window.__HISTBLATE`・0.92 MB・306 行・
   終わりは排他）に書く。通常のビルドはこのファイルをコミットされたまま読み、Cliopatria を CShapes ∪ このファイルで引く
   （OHM のキャッシュが無いセッションでも Cliopatria を作り直せる）。`basis` に双方の sha256、`check:histclio` が照合する。
3. **`js/time-borders.js` `csComposite`**: CShapes → OHM（`olLoad` / `olFC`、`_rec:'ohm'`）→ Cliopatria の和集合。
   どちらかが読めなくても残りで合成する。変化日（ステッパー・`changeAt`・`changePrecision` の `day`）にも OHM の日を足した。
   合成の注記は既存の文言（OHM・日単位・件数）がそのまま数える——新しい文字列は無い。
4. **`scripts/hist-fidelity.mjs` `politiesAt`**: 同じ合成を測る（`rec` で記録を名指す・`late:false` で比較）。
   `--year Y --in w,s,e,n` が、政体の層を記録ごとに列挙するようになった（`listPolities`。区分の列挙の前に出る）。
5. 名前: `scripts/histnames/records.mjs` の識別子の母集合に `data/hist-borders-late.js` を足し、
   `node scripts/build-histnames.mjs --identifiers` を走らせた。`--identifiers` は、どの記録ももう欠いていない言語を
   残していた（Cliopatria のハワイ共和国の行が OHM に引かれて消え、Q1057542 の 7 言語が「記録が自分で書いている」状態に
   なった）ので、`checkShipped` と同じ規則で行を欠いている言語だけに絞るようにした。

### 止める年 1923 は実測（`LATE_TOP`。観測と失効はビルダーに）

止める年を 1960 にして作り、OHM が CShapes ∪ Cliopatria に足す土地を何の土地かで分けた（世界の陸地に対する %）:

| 年 | 陸地 | グリーンランド | 南極 | 海（セル） |
|---|---|---|---|---|
| 1886 | 3.15 | 1.45 | 0 | 556 |
| 1890 | 4.84 | 1.45 | 0 | 562 |
| 1895 | 0.85 | 1.45 | 0 | 549 |
| 1899〜1923 | 0.03〜0.09（1904 は 1.10） | 1.36〜1.45 | 0 | 460〜638 |
| 1925 | 0.03 | 1.36 | **0.62** | 541 |
| 1933 | 0.03 | 1.34 | **4.19** | 833 |
| 1936 | 0.03 | 0.01 | 4.19 | 856 |
| 1953 | 0.03 | 0.01 | 4.19 | **5,864** |
| 1960 | 0.08 | 0.01 | 3.57 | **12,570** |

1925 年から OHM の関係は**南極の領有主張**（マダガスカル植民地の属領としてのアデリーランド 1924-11-21〜、
1933 年からオーストラリア南極領土）を、1953 年から**領海**（チリ・インドネシア・ソ連・中華人民共和国……）を政体の土地として
描く。どの記録もそこを述べず、国家体系も承認していない主張なので、最初の南極の片の前年 1923 年で止めた。
⚠ 否定した見立て: 「CShapes が自分の最終的な世界に達する年で止める」——CShapes の面積は 1937 年に 14,658.9 deg²、
1962 年からも 14,660.6 deg² と小刻みに動き、しきい値なしには年が決まらない。しかも南極と海の片は CShapes の年とは無関係に
OHM の側の性質として現れる。

## 2. 結果（世界の陸地のうち政体が描かれる割合 %）

| 年 | 前 | 後 |
|---|---|---|
| 1880 | 81.69 | 81.69 |
| 1885 | 85.76 | 85.76 |
| 1886 | 79.07 | **83.68** |
| 1887 | 79.15 | 83.69 |
| 1888 | 79.23 | 84.04 |
| 1889 | 80.10 | 85.19 |
| 1890 | 80.70 | **87.00** |
| 1895 | 87.23 | 89.54 |
| 1899 | 89.28 | 90.78 |
| 1900 | 89.28 | **90.78** |
| 1904 | 87.65 | 90.19 |
| 1905 | 89.11 | 90.63 |
| 1910 | 89.14 | 90.66 |
| 1914 | 89.15 | 90.66 |
| 1920 | 89.24 | 90.76 |
| 1923 | 89.57 | 90.95 |
| 1924〜1935 | 89.56〜90.06 | 同じ |
| 1936〜1960 | 91.39 | 91.39 |

**下がった年は無い。** ⚠ **1886 年はまだ 1885 年を下回る**（83.68 < 85.76）。残りの差は 1886 年から使わない年別の枚
（上の 0 節の 3 つ目）で、OHM も Cliopatria もその土地（アラビア内陸・ソコト・コン・モシ……）を 1886 年には述べていない。
枚を 1886 年以降の合成にも入れるかは、#991 の「1886 年からは枚を使わない」判断を変えることになるので、ここではしていない。

`npm run check:histfidelity` の観測（`data/hist-fidelity.json` ほか 2 本）を `--update` で取り直した: 1886 年 79.07 → 83.68、
1900 年 89.28 → 90.78、1914 年 89.15 → 90.66（他の年は不変）。

## 3. 列挙と史実の照合（historical-verification §2）

`node scripts/hist-fidelity.mjs --year Y --in w,s,e,n`（アフリカ −20,−35,55,38・グリーンランド −75,58,−10,84）。

- **グリーンランド**: 前は 1890・1900・1914 年とも CShapes のアイスランドだけ。後は OHM の «Denmark»（デンマークの植民地として。
  1886〜1920・1920・1920〜1921・1921〜1923 の 4 片）。史実と合う（1953 年まで植民地）。
- **アフリカ 1890 年**: OHM が 29 政体を足す——French Republic（アルジェリアのサハラ）・French Sudan・German East Africa・
  Ethiopian Empire（CShapes のエチオピアの外側）・Portuguese Angola・Barotziland・Sokoto Caliphate・Congo Free State・
  French Congo・British Raj（アデン後背地）・IBEAC・Mozambique・Dar al Kuti・Ottoman Empire（アラビア内陸）・Trucial States……。
  Cliopatria の «Kingdom of Portugal» 795 → 46 セル・«German Africa» 55 → 0 など、上の記録が述べた土地が Cliopatria から抜けた。
- **1900・1914 年**: 分割が CShapes に入り、OHM が足すのはアデン保護領・オスマン帝国（アラビア）・クウェート・セイシェルなど 8 政体。
- 日付の照合: コンゴ自由国 1885-07-01 → 1908-11-15（ベルギー併合）・ドイツ領東アフリカ（1890-07-01 のヘルゴランド＝ザンジバル条約で
  形が変わる）・仏領コンゴ 1882-11-30〜・トルーシャル 1892-03-08（排他協定 1892-03-06）・南西アフリカは史実と合う。

### おかしく見えるもの（直していない。上流 OHM の記述として報告）

- **Ottoman Empire 1920-04-26 → 1920-08-10 がアラビア中央部（ナジュド）に 563 セル**。オスマン軍は 1918〜19 年に撤退し、
  ヒジャーズ王国は 1916 年から独立。セーヴル条約（1920-08-10 署名）までの法的な主張を描いている。
- **Ottoman Empire 1886〜1898 がアラビア内陸（ハーイル周辺）**: ジャバル・シャンマルは自立しており、オスマンの宗主権は名目。
  Cliopatria の «Emirate of Jabal Shammar» がその下に回る。
- **French Republic 1890-01-01 → 1895-06-16 がサハラ中央に 2,144 セル**: トゥアト・イン・サラーの占領は 1899〜1902 年。
  1890 年の英仏宣言（1890-08-05）の勢力圏を描いている。開始日も年精度（1890）。
- **Ethiopian Empire 1889-05-02 → 1891-03-24 の南部**: カッファ（1897）・ウォライタ（1894）の征服より前に描いている。
- **British Raj 1887〜1891 がアデン後背地（ハドラマウト）**: アデンはボンベイ管区の一部だったが、後背地の保護条約は 1888 年以降。
- **French Sudan（«Upper River»）1886〜1895**: サモリ・トゥクルールの支配地を含む主張の範囲。
- Hawaiian Kingdom 1886 → 1894-01-01（王政の転覆は 1893-01-17）・Kingdom of Dahomey → 1895-01-01（降伏 1894-01-15）は年精度。
- 海の帯: Russian Empire（黒海・アゾフ海）・Argentina・Maldives・Empire of Japan などの片は陸地をほとんど持たない（OHM の関係が
  海域を含む。1886 年より前の束も同じものを描いている）。

## 4. 直していない（穴として記録）

- 1886 年 < 1885 年（枚の残り。上の 2 節）。
- グリーンランド 1924〜1935 年はどの記録も述べない（OHM は 1923 年で止め、Cliopatria は 1936 年から）。
- 1924 年以降の OHM の小さな陸地（クウェート保護領 1932〜1961 など）は描かない（止めた年の代償）。
- `scripts/histclio/review.json` の pending のうち 2 件（Montenegro 1913・Natalia Republic 1909）は、その Cliopatria の片が
  OHM に引かれて描かれなくなったので所見として現れなくなった。ファイルは触っていない（並行する #995 / #997 の持ち物）。
- 名前の識別子の欄を取り直したとき、Wikidata の今日のラベルで 11 行が広がった（他言語のラベルが増えた）。

## 5. 検査

`tests/hist-colonial-era-borders-checks.test.mjs`（新設）: ① 遅い記録が CShapes の土地に重ならない（格子で 1% 未満、
実測 0.06〜0.08%）② OHM を足すと 1886・1890・1900・1914 年の陸地が増え、グリーンランドの内陸点が 1886〜1914 年に OHM の
Denmark で描かれ、1886 年にコンゴ自由国・ドイツ領東アフリカ・アンゴラ・仏領コンゴが描かれる ③ ページ（node で走らせた
`js/time-borders.js`）が 1886-07-01 を CShapes → OHM → Cliopatria の順で合成し、その順に出典を述べる。

`check:histclio`（遅い記録の不変条件と、Cliopatria がそれに対して引かれたかの sha256）・`check:histborders`・`check:histeras`・
`check:histfidelity`（`--update` 後）・`check:histnames`・`check:bordercoast`（`data/border-coast.js` を作り直した——
束が 11 になり、環は 74,737 → 75,327）・`check:datagov`（書き手 `scripts/build-hist-clio.mjs → data/hist-borders-late.js` を、
`data/hist-borders.js` と同じ形式の理由で台帳に未宣言として記録: 179 件・2,366 facet）・`check:static`・`check:engine`・`check:docs`。
