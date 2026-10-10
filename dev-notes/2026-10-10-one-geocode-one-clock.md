---
title: 経路の文字列ジオコーダ・河川の判定・「地図の時刻」の 2 本目の実装を 1 本へ寄せた——文字列で渡された出発地／目的地は検証つきの扉を通り、一致しなければ地点を作らない
date: 2026-10-10
newsen: When Atlas or a link names a route's start or destination, a place that does not match the name is no longer put on the map; the field is left empty instead.
newsjp: Atlas やリンクが経路の出発地・目的地を名前で渡したとき、名前と一致しない地点を置かなくなりました（その欄は空のまま残ります）。
---

〈方針〉能力と品質は下げない。同じ判断・同じ仕事の 2 本目の実装は形式上の削除として 1 本へ寄せ、
寄せた後に全呼び出し元が同じ（またはより正しい）結果を得ることを確かめる。

## 1. 何を消し、何が引き継いだか

| 消したもの | 引き継いだもの |
|---|---|
| `js/routing.js` の `geo1()` と `_pickNear()`（Open-Meteo／Nominatim を 5 行ずつ取り、300 km 以内の最寄り、無ければ人口〔Nominatim は importance×10⁶〕最大を**無検証で**返す） | `js/routing-geocode.js` の新しい `resolve(q, {near, lang})`。`suggest()` と同じ出典・同じ `rank()`・同じ `placeRules`（`queryCore`/`agreement`/`rankable`）に、確定する扉の条項 `namesakeOk` を足す。Nominatim は打鍵ではないので `drop` せず列に並ぶ。一致する行が無ければ `null` |
| `js/atlas-console.js` `fetchRiverLine` の waterway 判定式 | `js/river-course.js` の `isWaterwayLine(o)`（同ファイルの `_nominatim` も同じものを読む） |
| 12 行の `isLive ? Date.now()／new Date()／iso(new Date()) : when`（news-events・news-intel・news-story・news-timeline ×2・outbreaks・quake-history・war-layer ×3・world-packs-rows・world-packs） | `js/chronos.js` の `OS.nowMs()`（新設＝`when().getTime()`）・既存の `when()`・`iso()`。`try{…}catch{ Date.now() }` の既存フォールバックは各所に残した |

付随して消えたもの: `js/war-layer.js` の局所 `iso()`（唯一の用途が上の再導出だった）、
`js/news-timeline.js` `refreshUI` の未使用変数 `base`。

## 2. 呼び出し元と、結果が同じか

- `geoNear` の利用者は `js/atlas-cap-routing.js` の 1 か所（ジオコード結果が地図中心から 500 km 超のとき、
  同名で近い候補を探す #R126 の規則）。`resolve()` は地図中心を `near` にして同じ 300 km 規則で並べるので、
  Potsdam は独の視点で独、米の視点で米（回帰で評価）。違いは、名前の一致しない行を候補にしないこと。
- `openPanel(from, to)` に文字列が来た経路（Atlas・ウィジェット・共有）は、一致する行が無いとき
  `setPlace(…, null)`＝欄が空になる。以前は「人口最大」の別の場所が入っていた。
- 時刻の 12 行: `when()` は `_when ? new Date(_when) : now()` で、各行の `isLive` 分岐と同値。
  war-layer の局所 `iso` は `toISOString().slice(0,10)`、`IntMapTime.iso()` は UTC の `YYYY-MM-DD`
  （0〜9999 年で同一。それ以外の年はもともと非ライブ側で `IntMapTime.iso()` を使っていた）。
  購読者内の `e.isLive ? … : e.iso` は、通知が同期なので `IntMapTime.iso()` と同じ瞬間を読む。

## 3. 数えて報告だけしたもの（置換していない）

「`new Date().getFullYear()` 以上なら live」を呼び出し側で導いている箇所は js/ に 6 つ:
`js/atlas-cap-layers.js:145`（`setYear` が既に畳む形そのもの）・`js/atlas-cap-time.js:552`・
`js/time-admin1.js:1104`・`js/time-borders.js:2206`・`js/time-countries.js:162`・`js/time-lapse.js:233`。

## 4. 共有窓口

`window.IntMapRouteGeocode` の読みが 1 本増え（`js/routing.js` → `resolve`）、`window.IntMapRiverCourse` の
読みが 1 本増え（`js/atlas-console.js` → `isWaterwayLine`）、`window.IntMapNominatimGate` の読みが 1 本減った
（`geo1` と共に）。前の 2 つは公開元が `window` 専用（トップレベル宣言を持たない規則）なので import できない。
`tests/global-surface-baseline.json` と `tests/fetch-deadline-baseline.json`（routing.js の無期限 fetch 2→0）を更新。

回帰: `tests/one-geocode-one-clock-checks.test.mjs`（ジオコーダと時計は実モジュールを評価、
「2 本目が無い」は js/ 全体で事実として測る）。
