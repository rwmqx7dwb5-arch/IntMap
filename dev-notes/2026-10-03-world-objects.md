---
title: 地震・出来事・施設・企業・火山・地点が 1 つの「実世界オブジェクト」の型で返り、辿れる——Atlas に research.object / research.related を足す
date: 2026-10-03
newsen: Earthquakes, events, facilities, companies, volcanoes and places now link to one another, and Atlas can follow those links.
newsjp: 地震・出来事・施設・企業・火山・地点が互いに辿れるようになり、Atlas もそれを辿れます。
---

〈依頼〉 `PRODUCT.md` §4 の Atlas 項目 5「世界を共通の対象として理解」。地震・ニュースの事象・施設・企業・火山・
地点プロファイルの結果がばらばらの形で返っていて、「この地震について」が位置・影響・関連記事へ 1 つの参照で
辿れなかった。利用者は「修正ではなく構造改革。基幹や根幹もいじってよい」と全権を委任した。

## 1. 設計（実装の前に決めたこと）

### 1.1 型 — `worldObject()`（`js/atlas-geo-object.js` を拡張。写さない）

`geoObject()` を**呼んで**、6 欄を足す。座標の由来（provenance）は `geoObject` のものをそのまま運ぶので、重心が
「正確な地点」に昇格することは起きず、`geoObject` の読み手（回答契約・台帳・地図合成）は 1 行も変わらない
（`GEO_OBJECT_VERSION` は 1 のまま。`WORLD_OBJECT_VERSION = 1` を別に持つ）。

| 欄 | 意味 | 無いとき |
|---|---|---|
| `type` | 種別（`earthquake` `news_event` `article` `facility` `company` `volcano` `city` `electoral_district` `place_profile` `place`）。語彙であって門ではない（範囲外はそのまま保つ） | `place` |
| `ref` | `type:id`。どの能力・カード・次の質問も、この 1 つで対象を名指す | 空（id の無い対象は辿れない） |
| `bounds` | `[w,s,e,n]`。範囲を持つ対象だけ。点から作らない | `null` |
| `time` | `{atMs,endMs}`。ソースが述べた時刻だけ。**時計の床を入れない** | `null`（施設は「今」ではない） |
| `articleIds` / `evidenceIds` | 報じた記事の id／per-call 証拠レジストリ（`atlas-evidence.js`）の id | `[]` |
| `sources` / `links` / `facts` | 出典（ソースの書いたまま）／型付きの辺 `{rel,ref}`／ソースが与えた小さな値（M・深さ・VEI・件数） | 空 |

### 1.2 関係 — 3 つの理由を返す（点数にしない）

- `linked` — 辺（`links`）、または共有する `articleIds` / `evidenceIds`。事実。
- `near` — 両方に位置があり `km` 以内、または一方が他方の `bounds` の中。
- `concurrent` — 両方に時刻があり、区間の隙間が `hours` 以内。

関連 = `linked`、または `near` かつ（`concurrent` または**どちらかが時刻を持たない**）。**時刻だけでは関連にしない**
（同じ午後に地球の反対側で起きたものは無関係）。理由は結果に付けて返す——順位付けの数字は誰も検算できない。

既定値は新しい数ではない: `km 300` は `research.impact` 自身の既定半径、`hours 72` はニュースストアが保持・クラスタする窓
（`docs/NEWS-EVENTS.md`）。呼び手は自分の値を渡せる。上限は設けない（`limit` は呼び手のもの）。

### 1.3 索引と配り方

`js/atlas-world-objects.js`（新規）: アダプタ（`fromUsgs` `fromNewsEvent` `fromNewsGroup` `fromEventRow` `fromNewsArticle`
`fromFacility` `fromCity` `fromVolcano` `fromCompany` `fromPlace` `fromPlaceProfile`）、セッション内の索引（`register` /
`find`）、`relation` / `related`、描画 1 本 `relatedHtml`。**モジュールの単一インスタンス `worldObjects`** を能力とカードが
共有する（`window` のグローバルにしない: `check:surface`）。アダプタは**読むだけ**で決めない——記録が述べない欄は空のまま
（擬似座標・時計の床・隣の行の代入をしない。`news-events.js` の `mapped === false` は位置として採らない）。

## 2. 既存の返り値からの対応表

| 能力 | これまで返していたもの | 今回から（`exec.worldObjects`） |
|---|---|---|
| `research.impact` | HTML ＋ピン（`_pois`）のみ。中心の地震は USGS の feature のまま消える | 中心（地震は USGS の id・時刻・深さ・M／場所は `place`）と、半径内の施設・都市・地震。各々が中心へ `within_impact_of` の辺 |
| `research.events` | HTML ＋ピン。「2 番の出来事」は表示順の位置でしかなく、次の手では消える | 各出来事が `news_event`（サーバーの Event、無ければ束ねた群）。`articleIds` に構成記事 |
| `data.volcano` | HTML のみ | `volcano`（GVP id・標高・最大 VEI・警戒レベル。最終噴火は**年**のまま `facts`） |
| `news.company` | HTML ＋`meta.events`（独自形） | `company`（本社の位置は profile が読み込まれているときだけ）と、それに触れる `news_event`（辺 `mentions`） |
| `research.placeProfile` | `exec.placeProfile`（独自形） | 加えて `place_profile`（由来は gazetteer が引いたときだけ宣言） |
| 選挙区 | — | **移行の順の最後**（型の語彙には入れた。結果を返す能力が今は無い） |

## 3. 新しい能力と UI

- `research.object`（`worldObject`）— ref か名前から 1 つの対象を返す。索引に無ければ、既にある読み手（読み込み済みニュース・
  火山カタログ・企業アトラス・USGS 週フィード）へ落ち、**同じアダプタで書き下ろす**。どれにも無い名前は「無い」と答える（推測しない）。
- `research.related`（`worldRelated`）— 索引＋読み込み済みニュース＋USGS 週フィードを**同じ規則**で判定。理由・件数・
  取れなかった情報源（USGS が読めなかったとき）を述べる。見つけた対象は索引へ入れ、次に辿れる。
- 地点カードに「関連」。同じ索引・同じ規則・同じ描画（`relatedHtml`）を読む。

## 4. 移行の順

1. 型（`worldObject`）— 既存の読み手を壊さない加算。
2. アダプタ・索引・関係（新規モジュール）と検査。
3. 結果を返す側: impact → events → volcano → company → placeProfile。
4. 辿る能力（object / related）。
5. カード。
6. （次）選挙区・施設の個別カード・地図ピンのクリックからの「関連」。ピンの `_pois` は今も独自形で、ref を持たせるのは別の作業。

## 5. 退けたもの

- 関連度の**点数**: 検算できない順位は、Atlas の答えを誤らせたときに理由を言えない。理由を返す。
- 時刻だけの関連: 上記。
- `window.IntMapWorldObjects`: グローバルを足さず、ES モジュールの単一インスタンスで共有する。
- 能力ごとの結果整形の写し: 描画は `relatedHtml` 1 本。

## 6. 残していること

- 索引は**ページの寿命**（会話をまたいで永続化しない）。ref を別の会話で使うと「無い」と答える（`research.object` は名前でも引ける）。
- 地図ピンのクリックから「関連」を開く入口は未実装（§4-6）。

## 7. 窓口の読み取りが 5 回増えた理由（`check:surface` の基準を更新した）

`research.object` が索引に無い名前を既存の読み手へ落とすため、`window.IntMapLazy`（2）・`window.IntMapVolcano`（1）・
`window.IntMapCompanyData`（1）・`window.IntMapSafe`（1・地点カードの `markup` タグ）の読み取りが各 1〜2 本増えた。
火山カタログと企業アトラスは lazy モジュールで、所有者が import の戸口をまだ持たない（`data.volcano` / `news.company` が
同じ理由で同じグローバルを読んでいる）。戸口ができたら、この読み取りもそちらへ移す。

## 8. 起動費用の天井を上げた理由（`check:perf --update`）

- `atlas-console` 非同期チャンク 1258.1 → 1266.3 kB（+8.2 kB）: `research.object` / `research.related` の能力 2 件（カタログの文を含む）と、
  impact / events / volcano / company / placeProfile が対象を載せる配線。Atlas を開いたときだけ読まれる側で、起動には載らない。
- `place-dossier` 非同期チャンク 15.2 → 32.8 kB（+17.6 kB）: 型（`worldObject`）・アダプタ・索引・関係の規則（`atlas-world-objects.js` と `atlas-geo-object.js`）が
  このチャンクに置かれた。能力（`atlas-console` チャンク）も同じ単一インスタンスを import するので、**重複して配られてはいない**
  （ビルド後に両チャンクを grep して、モジュール本体が 1 つのチャンクにしか無いことを確かめた）。地点カードを開いたときに初めて読まれる。
- 回収の見込み: 型とアダプタを共有チャンクに分ける余地はあるが、いまは 2 つの読み手のどちらも非同期で、起動の経路には載らないので、そのままにした。
