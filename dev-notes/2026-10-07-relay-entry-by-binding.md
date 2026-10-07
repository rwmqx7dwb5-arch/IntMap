---
title: own-fetch-relay の検出を「名前」から「束縛」へ——組み込みメソッドと同名の関数 1 つで全 x.indexOf が relay 呼び出しになっていた（入口 460 → 26、落とした実 URL 0・増えた実 URL 2）
date: 2026-10-07
internal: 検査（tests/）の作り直しだけで、配られるページの挙動は変わらない
---

〈依頼〉 `tests/own-fetch-relay-checks.test.mjs` の検出部は、proxy-fetch に URL を渡す関数の集合 ENTRIES を
呼び出し先の**綴り**で増やしていた。PR #1029 で `js/where-when.js` の関数 `indexOf` が昇格し、全ての
`x.indexOf` が入口になって ENTRIES 460 → 764、部分評価が爆発して CI の shard 1/3 が 1 時間を超えた
（関数名の変更で回避済み）。一致を束縛で取るように作り直し、本物の入口が残ることと偽の入口が消えることを検査で示す。

## 0. 測った（2026-10-07、main = a7025c7）

- 旧方式: ENTRIES **460**。本物の後ろに `ch set watchLegendSize … every … add … push … apply …` が続く。
  連鎖の一例: `js/offline-maps.js` の関数 `put` は本物の入口（URL は第 2 引数）だが、綴り一致は常に第 1 引数を見るので
  `js/atlas-geo-resolve.js` の `_rrIdbPut(key, val)` が IDB の `objectStore(…).put(val, key)` を理由に昇格し、
  そこから `_rrCachePut` へ広がっていた。SITES 14,858 件のうち relay へ届く URL として評価できたのは 46 件。
- 「組み込みメソッド名の昇格を禁じる」案は 460 → 33 だが、何を落としたかが分からない（依頼文の指摘どおり）。
- 束縛で取ると **26**。旧と新の PLAN（relay ごとの URL 集合）を URL で突き合わせた結果、**落ちた URL 0、増えた URL 2**
  （news-relay の BUSINESS フィード 2 本——実際に `feedUrls().map(u => HOST.fetchViaProxy(u))` で送られているのに、
  旧方式では検査されていなかった）。

## 1. 否定された見立て

- 初版は news-feed の 8 件（WORLD 見出し）を「落とした」ように見えた。調べると旧方式がそれを拾っていたのは
  **`push` が偽の入口だったから**——`base.push(url)` を relay 呼び出しと誤認していた。URL 自体は本当に relay へ
  送られているので、部分評価器に「その scope が push で満たす配列」を辿らせ、本物の経路（`.map` の callback 引数）で取り戻した。
- `.map(u => fetchViaProxy(u))` の callback を入口に昇格させると、その中の呼び出しが「定義」として捨てられ、
  callback 自身には呼び出し元が見つからないので URL が消える。⇒ 呼び出し元が 1 つも解決されない関数は昇格させない。
- 静的に辿れないと思った依存注入は、実は全部束縛で辿れた: `makeAtlasSources(HOST, { _fetchJSON })` → `CTX._fetchJSON`、
  `IM_HOST` の getter `get fetchViaProxy(){ return fetchViaProxy; }`、`js/lazy-modules.js` の
  `R[name].load()` → `import('./satellites-live.js')` → `.then(mod => …)` → `e.mount(IM_HOST, mod)` → `m.satellitesLive(IM_HOST)`。
- 循環を含む値を memo しない作りは指数的に遅くなった（`then` と計算メンバーを足した時点で 100 秒を超えた）。
  循環で切った時点の値を pass 内で保持する（決定的な過小近似）に変えて 3 秒。

## 2. 作ったもの

- `tests/helpers/js-bindings.mjs` — js/ 全体の束縛解決。識別子はスコープ（block・関数・hoist した var・catch・for・class）と
  import の辺（named・default・namespace・re-export・`export *`）で、メンバー `o.p` は `o` が既知の値（import した名前空間・
  オブジェクトリテラル・global）のときだけ解く。引数は呼び出し元を不動点で解く。**知らない受け手のメンバーは何にも解かない**——
  `arr.indexOf` は誰の関数 `indexOf` の呼び出しでもない。`then` は Promise の規約として値を運ぶだけで、呼び出しを関数に結びつけない。
- `discover(files)` — 入口は関数ノード（名前は報告用）。URL が何番目の引数かも持つ（`offline-maps.js` の `put` は第 2 引数）。
- 時間: 検出 約 6 秒（旧 約 10 秒）。ファイル全体 約 20 秒（変異検査 2 回を含む）。

## 3. 検査

- `own-fetch-relay ⓪` 手で確かめた 5 つの入口（`_fetchText`・`_fetchJSON`・`_fjson`・`cmpRead`・`guardedJSON`——それぞれ違う種類の束縛）
  と、注入でしか届かない 3 か所の呼び出し（atlas-sources の `CTX._fetchJSON`・news-feed と satellites-live の `HOST.fetchViaProxy`）が見つかる。
- `⓪ mutation` `_fetchText` から relay を外すと入口でなくなり ⓪ が名指す／`IM_HOST` から getter を外すと
  `HOST.fetchViaProxy` の呼び出しが全部消える（どちらもメモリ上の木で。チェックアウトは書かない）。
- `⓪ PR #1029` 組み込みメソッドと同名の関数（`indexOf`・`set`）が relay へ届く fixture で、配列・Map・文字列・同名のローカル関数の呼び出しは
  入口にならず、別名 import と名前空間経由は入口になる。同じ fixture で綴り一致なら 4 件を誤認することも確かめる（fixture が両方式を区別できる証拠）。
- `tests/relay-entry-by-binding-checks.test.mjs` 解決器の種類ごとの回帰（shadowing・hoist・別名・名前空間・re-export・default・factory・getter・
  注入・`import()`＋registry＋`then`・知らない受け手）。
