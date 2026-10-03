---
title: 火山灰の「いま噴火したら」を新しく作り、シミュレーションの出力を分析用データセットにし、放射拡散とパンデミックに幅（アンサンブル）を出させ、全シミュレータを手法のページに対応させる
date: 2026-10-03
---

〈依頼〉「修正・穴埋めではなく構造改革とイノベーション。整形ではなく造形。足し算。全権を委任する。」
分野は分析・ツール・シミュレータ（地震・火山・航空・船舶・放射性プルーム・パンデミック・気象・経路）。
途中で調査結果に基づく 7 項目（science.html の節の追加、シミュレーション出力の GIS 登録、
パンデミックの runs、放射拡散のアンサンブル、福島のヒンドキャスト、ドローンの正規の能力化、
sim.* と science.html の照合の門）が追加された。

## 0. 測った（着手前）

| 何 | 着手前 | 意味 |
|---|---|---|
| 火山カードが答える問い | 記録（GVP）・機関の状態・有効な SIGMET・SO₂・熱異常 | **「いま噴火したら灰はどこへ」は IntMap のどこにも無い** |
| 上空の風 | Open-Meteo 予報 API は `wind_speed_<p>hPa` を返す（850〜50 hPa を実測） | 気圧面の風で噴煙の高さの輸送ができる |
| その費用（実測 2026-10-03） | 121 地点 × 22 変数 × 4 日 = 10.3 s・1.6 MB。81＋121 地点の 2 回で 4.6 s | 入れ子 2 枚（9×9 と 11×11）が待てる上限 |
| シミュレーションの出力 | 放射拡散の沈着・到達圏は描画元（renderer source）にしか無い | 分析（`js/gis-ops.js`）も Atlas の `data.query` も**読めない** |
| 放射拡散の乱数 | `Math.random` のみ | 同じ放出の 2 回を区別できず、アンサンブルの各メンバーを名指せない |
| `sim.*` の能力と science.html | 15 能力・23 節。放射拡散・パンデミック・弾道・飛行アニメの節が**無い** | 手法を書いていないシミュレータがある |
| ドローン | `map.tool` の `name:"drone"` が正規表現で `IntMapDrone.toggle()` を呼ぶ特例 | 引数を持つ `routing.drone` と 2 つの扉 |

## 1. 新商品: 火山灰 — いま噴火したら（`js/ash-model.js`・`js/ash-plume.js`）

- **噴火源は Mastin ほか（2009）**の 5 型。既定の型は**同梱カタログの主要岩石**から（玄武岩系 → M0、
  それ以外 → S0。論文の既定の規則）。主要岩石の語彙は `data/volcanoes_gvp.json` の `rocks` から
  **発見して**全部が分類されることを検査が確かめる（カタログが 11 番目の岩石を足したら落ちる）。
- **噴出率は選ばない**。同じ論文の回帰式 H = 2.00 V^0.241 で高さから決める。数倍の不確かさを横に書く。
- 輸送は Suzuki（1983）の鉛直分布・Ganser（1993）の落下速度・HYSPLIT の変形（Smagorinsky）拡散。
  拡散係数は**風の場自身のシアから**セルごとに計算して保持する（粒子ごとに計算すると 7.4 s、保持で 0.86 s）。
- 2 集団: 粗粒（≥63 µm）が降灰、遠方まで残る細粒（総量の 5%・Webster ほか 2012）が雲。
  **置き場所を計算していない細粒分（凝集を扱わない）は「扱っていない質量」として報告する**。
- 出すもの: 降灰（mm・面積・最大値と誤差）、**1 mm 以上の地名辞典の町と人口**（ShakeMap と同じ結合・同じ言い方）、
  ロンドン VAAC の飛行高度帯ごとの濃度を時間スライダーと再生で、**灰が届く空港と最初に届く時刻**（Overpass）。
- 入口: 火山カード「いま噴火したら、灰はどこへ？」・Atlas `sim.ashPlume`（`ashPlume`）。火山名は
  **GVP カタログで解決し、解決できなければ拒否**（ジオコーダの最寄りの他人を火山にしない・#R515）。
- 実測（桜島＝Aira、S0、2026-10-03 の実際の風、24 h、20,000 粒子）:
  取得 4.6 s・計算 0.64 s。噴出率 2.95×10⁶ kg/s。最大 23 mm ±5%。0.1 mm 以上 17,941 km²・1 mm 以上
  3,226 km²・10 mm 以上 370 km²。雲の最大 SFC–FL200 は T+6 h で 10.7 mg/m³、T+24 h で 0.65 mg/m³、
  重心は東南東（138.6°E 29.7°N）。質量の内訳: 地表 62%・置き場所なし 35%・空中 2.9%。

## 2. シミュレーションの出力は分析用データセット（`js/sim-datasets.js`）

- 1 つの扉 `registerSimOutput` が**既存の登録簿**（`js/gis-datasets.js`）に普通のベクタ記録として足す。
  出自 `{kind:'sim', sim, version, params, seed, at, file}`。本体（BODY）として保存される——生きた風の
  上の計算は引数だけの関数ではないので、レシピとしては再実行しない。
- 同じシミュレーションを計算し直すと前の記録を置き換える。**そこから何かを作っていたら消さず、
  登録簿の invalidate で「古い」と印を付ける**（処理は古い入力を名指しで拒む）。
- 対象: 放射拡散の沈着（`kbq_m2`、単位を宣言）・火山灰の降灰（`mm`）と雲（`mg_m3`、時刻 `at` を instant で宣言）・
  到達圏（`minutes`）。到達圏の側は起動経路にあるので `import()` で使うときに読む。
- ⚠ 津波・見通し・地形と水はまだ（§6）。

## 3. 幅を出す

- **放射拡散**: `RAD.simulate` に種（mulberry32。種が無ければ従来どおり `Math.random`）。
  `RAD.ensemble` は**種は解き直し、公表された放出量の幅は倍率で**（沈着は放出量に線形）。区分の面積と
  最大値は p10/p50/p90 の**地図**から読む。Atlas `radiation` に `runs`（2〜10）と `seed`。
- **パンデミック**: Atlas `pandemicRun` に `runs`（2〜50）。同じ世界・同じ引数を連続する種で回し、
  エンジン自身の `summariseEnsemble` で中央値・p10–p90・結末の内訳を返す。地図と一覧は最初の 1 回。

## 4. science.html — 23 節 → 30 節、そして照合の門

足した節: `ash`・`volcano`・`radiation`・`pandemic`・`weather`・`aviation`（航空機・船舶・ドローン・飛行経路
アニメ）・`ballistic`。各節は「何を計算するか・どのデータか・仮定・限界」で、正本の docs へリンクする。en と jp。
**門**: 能力の項目に `science`（節の id）を持たせ（`js/atlas-caps.js` の ENTRY_KEYS）、
`tests/science-instruments-checks.test.mjs` ⑦ が**能力の項目とページの文書の両方から読んで**、
すべての `sim.*` が en と jp の両方に存在する節を名指すことを確かめる。手で並べた対応表は無い。

## 5. ドローン

`routing.drone` の実行を `droneRun` として export し、`map.tool` の `name:"drone"` は**それに引数ごと渡す**
（開く・経路を引く・計算する、が `{"type":"drone"}` と同じ答えになる）。正規表現での `toggle()` の特例は無くなった。

## 6. やらなかったこと・残り

- **福島のヒンドキャスト（依頼 5）はやっていない。** 公表された Cs-137 沈着（文部科学省の航空機モニタリング等）を
  数値として比較するには、その一次データを出典付きで同梱する必要がある。記憶から値を書けば偽の基準になる。
  次の作業で一次データ（CSV）を取得し、ERA5 の 2011-03 の風を固定して同梱したうえで門にする。
- 津波・見通し・地形と水の出力のデータセット化（扉は同じ `registerSimOutput` でよい）。
- 「プルームに入る市区町村の人口」: 沈着が登録されたので `data.query` の `from` に書けるが、
  **市区町村の人口を持つ同梱の記録が無い**ので、いま答えられるのは地名辞典の町（都市人口）まで。
- ツール欄（`js/map-ui.js` の `SIM_TOOLS`）に `sim.ashPlume` の行を足した。一覧から開くときは火山が
  カーソルの下に無いので、点を答えとする他の 4 行と同じく**地点を訊き**（`_askPoint`）、タップした地点を
  火口として開く（Atlas の `lng`+`lat` と同じ扉）。⚠ そのとき火口の標高は 0 m として扱われる
  （GVP の火山へ寄せる扉はパネルに無い）——火山名で開く火山カードと Atlas は標高と岩石を持つ。

## 7. 検査

- `node --test tests/science-instruments-checks.test.mjs` — 13 件（物理・保存則・再現性・データセットの扉・
  アンサンブル・ドローン・照合の門）。
- `node --test tests/radiation-plume-checks.test.mjs`（種の導入後も既存の全件が緑）。
- `check:capabilities`・`check:catalog`・`check:archfiles`・`check:surface`（新しい window 読みは下に名指す）。

### check:surface に足した辺（`--update`）

`js/ash-plume.js` は既存のシミュレータと同じく、eager な共有部品を window 越しに読む:
`IntMapWx`（Open-Meteo の唯一の guarded client）・`IntMapGazetteer`（地名辞典・classic script）・
`IntMapSafe`・`IntMapLangSwitch`・`IntMapVolcano`（気象庁名の結合表。遅延モジュール）。
`js/sim-datasets.js` は `IntMapData`（遅延の gisCore が公開）と `IntMapLazy`。
`IntMapAshPlume` は火山カード・Atlas の能力・ツール欄の行（`js/map-ui.js`、1 回）が遅延読み込みの後に読む
（パネルは遅延チャンクなので import にすると起動経路に載る）。Overpass は import に切り替えた。
`IntMapDrone` の読みは 2 つ減った（特例の撤去）。

### check:perf の天井を上げた理由（`--update`、超えた 5 行だけ）

同じ機械で base（`29f08177` を素のまま build）を測ると、すでに eager brotli 1154.2 kB・cssRaw 367.0 kB・
async gzip 3785.6 kB（天井は CI の機械の値）。この作業の分は次のとおり。

- `eager.brotli` 1149.9 → 1155.8 kB（base から +1.6 kB）・`eager.modules` 306 → 307: 起動経路にある
  `js/sims.js` が沈着をデータセットにするため `js/sim-datasets.js` を import する（扉は 1 つ）。
- `eager.cssRaw` 365.8 → 369.9 kB（base から +2.9 kB）: 火山灰パネルの CSS（`css/intmap.css`）。
- `async.gzip` 3774.0 → 3805.4 kB（base から +19.8 kB）: 火山灰の遅延チャンク（`js/ash-plume.js`・`js/ash-model.js`）。
- `atlas-console` 1134.1 → 1142.0 kB: Atlas の `ashPlume`・放射拡散の `runs`/`seed`・パンデミックの `runs`
  （`js/atlas-cap-sim.js`・`js/atlas-caps.js`・`js/pandemic-atlas.js`）。
