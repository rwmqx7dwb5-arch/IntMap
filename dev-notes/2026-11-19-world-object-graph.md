---
title: 世界オブジェクトが出典の識別子を捨てていた——同じ港が別の対象になり、関係は型も期間も持たなかった
date: 2026-11-19
newsen: Atlas now recognises the same facility, company or place when two sources describe it, follows named relations such as "operates" or "contains" across several steps, and can answer "as of" a date.
newsjp: Atlasが、複数の出典で同じ施設・企業・場所を同一の対象として扱い、「運営する」「含む」などの関係を何段でもたどり、特定の日付時点で答えられるようになりました。
---

〈依頼〉 技術監査（世界オブジェクト・地理空間知識統合基盤）の指摘を、できる限り全部直す。

## 0. 測った（コードの経路を追った）

- `overpassPOIs` は OSM 要素の `type/id` を捨て、`fromFacility` は名前＋座標から `ref` を作り、`facilityRows` は `f0`・`f1` を付けていた。名前が変わる・座標が改善されると別の対象になり、`f3` は次の検索で別の施設を指す。
- `fromCompany` は行の `wd`（Wikidata QID）を持たず、`precision: 'city'` の本社座標も `feed_coordinate`（実地点）として扱っていた。
- `links` は `{rel, ref}` だけで、関係の種類は `linked` に畳まれ、期間・確度・根拠を持てなかった。`research.related` は近接と時間の推測だけで、名指した関係を辿れなかった。
- GIS の行は `datasetID:行番号` で、並びが変わると別の地物になる。

## 1. 直したこと（既存の `type:id` と `research.*` はそのまま。足したのは欄と規則）

- `ids`（外部識別子）と方式ごとの検査。Overpass の要素 id・Wikidata・企業 id・GIS の地物 id を、出典から対象まで落とさずに運ぶ。
- `register()` の同一性: 同じ外部識別子を述べた記録だけを 1 件にする（別名を残し、辺は別名から届く）。名前＋座標だけでは畳まない。橋渡し・食い違い（`conflicting_identity`）・型違い（`candidate_match`）・畳まなかった候補（`identity().candidates`）。
- 型付きの辺: 期間・確度・根拠・出典。逆向きの名前（`REL_INVERSE`）。`traverse()`・`related({rels, depth, atMs})`。`assertLink`（同じ関係・相手・期間は冪等）。
- `validity`（存在期間）と `claims`（値＋単位＋期間＋出典。上書きせず並べ、`claimConflicts` で食い違いを出す）。
- `fromCompanyProfile`（企業と拠点を `operated_by`＋開業・閉鎖期間で）、本社の精度を座標の種別へ、`fromDatasetRow`。
- Atlas: `research.related` に `rels`・`depth`・`at`、`research.object` に `wikidata:Q…`／`osm:…` での指名と同一性の表示。能力は増やしていない。

## 2. 否定した見立て・残したもの

- 名前＋座標の近さでの自動統合は採らない。港全体とターミナル、同名の別施設は別の対象で、近接は候補（0.5 km は見積り）に留める。
- 専用のグラフ DB は入れない。索引はセッションの寿命のまま。永続化（Supabase）と大規模索引は、ノード数・探索深度を実測してから（監査の P3）。
- 鉄道・統計の時系列・港湾台帳との接続は、辺の型と期間は用意したが、データ側の接続（接続点・港湾 id への紐付け）は未着手。

## 3. 検査

`tests/world-object-graph-checks.test.mjs`（15 件。Overpass の返答を差し替えた `overpassPOIs`、能力の実行を含む）。既存の `world-objects-checks` は変更なしで通る。

## 4. 上げた起動費用の天井

`async chunk "place-dossier"` 61.9 → 73.0 kB、`"atlas-cap-runs"` 853.4 → 860.7 kB。世界オブジェクトの同一性・型付き辺・期間・claims の規則と企業プロフィールのアダプタが、両方のチャンクが取り込む `atlas-geo-object.js`／`atlas-world-objects.js` に入ったため。何が買えたか: 同じ対象の統合、多段の関係探索、時点指定の回答。起動時のチャンクには入らない（async のみ）。
