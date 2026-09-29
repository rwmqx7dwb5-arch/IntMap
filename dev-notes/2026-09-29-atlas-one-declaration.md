---
title: Atlas の 1 能力が 7〜9 か所に書かれていた——別名は登録行だけに置き、dispatch・地図チップ・会話状態はそこから導出する。チップのレイヤーは写しの id 表ではなく render.claim から引き、SYS() の言語行を末尾へ移し、プロンプトの計器が実物の索引を測るようにした
date: 2026-09-29
---

〈依頼（監査・構造改革）〉`routing.isochrone` を実測すると 1 能力が 7〜9 か所に書かれている。登録行
（`js/atlas-capabilities.js`）、dispatch の `case 'isochrone': case 'reach': …`（別名の 2 回目）、
`OVL_OF` の `isochrone:'isochrone', reach:…`（3 回目）、`_OVL` の手書きレイヤー id（`js/map-tools.js` の写し。
同じ能力の観測器はすでに `render.claim` で同じ事実を得ている＝#R736 の形）、引数スキーマ。
能力の宣言を 1 つにし、残りを導出する。**到達できる能力を 1 本も減らさない**（`CONSTITUTION.md` §5）。

## 0. 測った（2026-09-29、origin/main 6dad1019）

- **dispatch の case ラベル 368 個**（`switch(a.type)` の中、コメント内の 2 個を除く）。143 の fall-through 列、
  146 能力。**368 個すべてが登録行に宣言済み**で、ラベルのうち **222 個は別名の写し**だった。
- 逆方向: **登録行が宣言した 12 綴りはどの case にも無かった**（`explainTerm` `defineTerm` `shaking`
  `pressureContours` `isolines` と基図プリセットの 7 綴り）。dispatch に直接来ると `default` に落ちていた。
- `OVL_OF` は **81 綴り**。登録行と突き合わせると、同じ能力の別名を半分しか持っていないものが 9 能力
  （`facilities` `mapPois` `transitRoute` `trajectory` `extent` `showExtent` `newsEvents` `groupNews`
  `impactAnalysis` `nearbyCritical` `airports` `shaking`）。**`sim.rfCoverage` は別名 `viewshed` だけを持ち、
  列 1 の `rfCoverage` を持っていなかった**——tool 面（`legacyExecute`）が送るのは列 1 の綴りなので、
  Atlas の道具経路からはこのチップは一度も出ていなかった。どの行にも無い綴りが 6 つ
  （`flyPath` `greatCircle` `radarShadow` `isolateRegion` `focus` `marker`）——どの case も答えない死んだキー。
- `updateWctx`（次のターンへ持ち越す会話状態）も別名を 27 回手書きしていて、`historical` `synthesize`
  `reportMap` `research`… の一部を落としていた（`{type:'historical', era:'1914'}` は年を持ち越さない）。
- `_OVL` は **20 kind・61 レイヤー id**。うち 7 kind・19 id（到達圏・合成図・POI・標高・勢力図・飛行・爆風）は、
  描画元がソースを `render.claim` しているのに id を写していた。
- `SYS()` は persona → 中核指示 → 返答形式 → **返答言語** → 能力の索引 → 道具の順。言語で変わるのは 1 行だけで、
  それが索引より前にあった。**言語に依存しない前置きは native 11,199 字／legacy 11,066 字**（全長 14,369／25,450）。
- `tests/r285-checks.test.mjs` の `plannerPromptSize()` は `SYS()` を道具なしで呼び、`_capIndex` を `''` に
  していた。実物（`TOOLS.baseTools()` と実際の索引）との差は **legacy 2,677 字・native 2,828 字**——
  計器は誰も送らないプロンプトを測っていた。

## 1. 直したもの

- **`js/atlas-capabilities.js`** — `ofSpelling(t)` と `dispatchName(t)`。綴り → 登録行（**大文字小文字を区別**。
  `switch` がそうだったので、宣言されていない綴りを新しく受け付けない）。衝突は `resolve()` と同じ持ち主に帰す。
  `define()` で後から足された行も同じ表に入る。
- **dispatch** — `switch(CAPS.dispatchName(a.type))`。case は列 1 の綴りだけ（**368 → 146 ラベル**、別名の写し 222 個を削除）。
  `a.type` は書き換えないので、綴りで分岐する case（`walkingRoute` `standHere` `volcanoCard`…）は同じ綴りを受け取る。
- **`updateWctx`** — 同じ解決器で case 名に揃えてから比べる（別名の手書き 27 回 → 0）。
- **`OVL_OF`** — 能力 ID をキーに（**81 綴り → 27 ID**）。`_ovlOf(t)` が綴りから行を引く。上の 9 能力の抜けた別名と
  `rfCoverage` は、同じ行の他の綴りと同じチップを持つようになった。行に無い 6 キーは消えた（どの case も答えないので
  到達できる挙動は変わらない）。
- **`_ovlIds(kind)`** — kind が効果キーなら、**その効果キーで claim されたソースを読むスタイル上のレイヤー**
  （＋`_OVL` にその kind の行があれば足す）。観測器（`ownSurfaces` / `paintNow`）が読む `render.drawn` と同じ問い。
  `_ovlVisible` / `overlayToggle` / `_ovlSnapshot` / クローン / チップ生成はすべて `_ovlIds` だけを読む。
- **描画元の claim を 6 ファイルに足した**（層を作る関数の頭で、その能力が宣言する効果キーの下に。**remover は渡さない**
  ——一つの undo（`js/atlas-state.js` の `surfaces`）の扱いを変えないため）: `js/routing.js`（`imroute-src`・
  `imroute-area-src` → `map.route`）、`js/sims.js`（`imrad-src`・`imrad-dep-src` → `map.radiation`）、
  `js/stats-compare.js`（`imcmp-src` → `panel.compare`）、`js/viewshed.js`（`los-src`・`los-img-src` → `map.los`）、
  `js/shakemap.js`（`shk-field-src` → `map.shakemap`。等値線は既に claim 済み）、`js/outbreaks.js`（`who-don-src` →
  `map.outbreaks`）。**`_OVL` は 20 kind・61 id → 8 kind・15 id。**
  実測で写しの誤りが 2 つ出た: 視線の行は**どのファイルも作らない** 3 層（`los-cover` `los-shadow` `los-cover-line`）を持ち、
  実際に描かれる `los-link` `los-obst` `los-img` を持っていなかった（チップを OFF にしても解析画像が残った）。放射線の行は
  `imrad-dep-line`（沈着の輪郭）を持っていなかった。導出でどちらも切り替わるようになった。
- **評決への影響（上がる方向だけ）**: claim が足されたので `paintNow().surfaces` にこれらの面が入り、`sim` 観測器の
  `ownSurfaces`（`sim.radiation`・`sim.lineOfSight`）が効くようになる。変わりうるのは「数が動かなかったので
  `not_rendered`／`no_change`」だったものが、その面が実際に描かれている／変わったときに `completed`（`ok` /
  `already_there`）になる場合だけ（検証器は動きを証拠として足すだけで、下げる経路は無い）。`routing.route` は
  `routingNow()`、`data.compareStats` は `panel` 観測器で、自分の評決には効かない。
  ミサイルは `['arc','map.fly','map.ballistic']`——`map.ballistic` は弾道と爆風の両方のソースを claim しているので
  切り替える集合は以前の fly＋blast と同じ。`map.fly` を別 kind に残したのは、後の `fly` がそのソースを
  取り直したときにミサイルのチップが OFF になる（#R122 の kind ごとの所有）を保つため。
- **`SYS()`** — 返答言語の行を末尾へ。**言語に依存しない前置き: native 11,199 → 14,172 字、legacy 11,066 → 25,253 字**
  （末尾 1 行以外すべて）。文言は 1 字も変えていない。persona（`js/atlas-persona.js`）は触っていない。
- **計器** — `plannerPromptSize()` は `SYS(TOOLS.baseTools())` を呼び、`_capIndex` / `_directCaps` / `_toolBlock` は
  出荷している関数本体を持ち上げて実物の登録表で評価する。測定値は native 14,369／legacy 25,450。
  `MAX_SYSTEM` 160,000 に対して 50% の余白の条件は満たすので**天井は動かしていない**。

## 2. 残したもの（直せなかった理由つき）

- **強調・コロプレス・線（`nlq-src`）は見送った。** 3 つは 1 つの共有ソースの一部を feature-state で塗る。claim は
  ソース単位なので、claim すると 3 つのチップが一緒に切り替わり、しかも `nlq-src` は全ての国を持つので観測器から見て
  常に「描かれている」になる。直すにはレイヤー単位の帰属を `js/geo-engine.js` の契約（`claim` / `drawn`）に足す必要があり、
  それは両エンジンに同じ答えを要求する契約の変更なので別の作業にした。
- **ピン（`js/app-body.js`）は見送った**（今回の範囲外のファイル）。
- **`js/map-tools.js` の輪郭と孤立化マスクは claim しない。** `map.outline` / `map.isolateCountry` は `paint` 観測器で、
  claim すると判定の入力が変わる——それは観測器の変更として別に判断する。
- **ストリートビューの行（`sv-here-pt` `sv-here-cone`）はどのファイルも作らない**（`js/street-view.js` が描くのは
  `sv-cov-*`）。チップは可視のときしか出ないので害は無いが、削除は確認を要する撤去なので残した。
- **`js/routing-ops.js` の 2 解析**（`imroute-diff` `imroute-hist`）は範囲外のファイルなので `_OVL['map.route']` に残し、
  `js/routing.js` の claim に足される形にした。
- `ANSWER_TYPES`（`js/atlas-turn-results.js`）は**直した**: 14 綴り → 5 つの能力 ID。登録表は `capabilities` として注入
  （`js/atlas-console.js` は自分の `CAPS` を渡す）。`js/atlas-agent.js` は `makeAtlasTurnResults({})` で `callKey` だけを使うので、
  注入の無い呼び元には `makeAtlasCapabilities({}, { publish: false })` の私的な複製を使う——この新しい引数が無いと、
  複製を作った瞬間に `window.IntMapCapabilities`（`define()` で行が足されているかもしれないアプリの表）を置き換えてしまう。
- 引数スキーマ（`js/atlas-schemas.js`）は能力 ID がキーで、綴りの写しは持っていなかった（コメント中の綴りは説明文）。
  引数名は今も dispatch の本体から人が読み取った照合の表である。

## 3. 検査

- `tests/atlas-one-declaration-checks.test.mjs`（9 本、すべて評価型）。前の状態は
  `tests/fixtures/atlas-one-declaration-before.json`（6dad1019 の case 列・`_OVL`・`OVL_OF`・`ANSWER_TYPES`）。
  ④ は上の 6 ファイルの描画関数と claim 文もそのまま走らせる（経路・比較・ShakeMap・WHO は前の手書き id と同じ集合、
  放射線は＋`imrad-dep-line`、視線は「どこかのファイルが作る id だけ」）。④b は全 claim が能力の宣言する効果キーの下にあり、
  足した claim が remover を持たないことを確かめる。⑥ `ANSWER_TYPES` は注入あり／なしの両方で前の 14 綴りと一致し、
  注入なしでも公開された登録表を置き換えない。
  ① 368 綴りすべてについて `dispatchName` が**前と同じ列の中の**、今も生きている case を返す／今の列はどれも前の 1 列の
  部分集合（本体をまたいで動いたラベルは無い）／case は列 1 の綴りだけ。①b 宣言された全綴り（380）が case に届く。
  ①c 大文字小文字を区別する・ID は綴りではない・`define()` の行も入る。② `updateWctx` を評価し、歴史地図と分析の
  全綴りが年と主題を持ち越す。③ `OVL_OF` の旧キーはすべて同じチップ（kind の改名を通して）に着く。
  ④ `js/map-tools.js` `js/atlas-sims.js` `js/atlas-console.js` `js/atlas-map-compose.js` の描画関数と claim 文を
  そのまま走らせ、`js/geo-engine.js` の `claimSurfaces` / `surfacesDrawn` の上で `_ovlIds` が前の手書き id と
  同じ集合を返す。④b `_ovlIds` は claim を変えない（観測器の入力は前後で同一）。⑤ `SYS()` を英日で組み、
  最後の 1 行以外が同じバイト列。
- 変異で赤くなることを確かめた: 登録行から `reach` を消す／`_ovlIds` の導出を空にする／`updateWctx` を綴りの比較へ戻す／
  `OVL_OF` に `view.flyTo` のチップを足す／`js/routing.js`・`js/sims.js`・`js/outbreaks.js`・`js/shakemap.js` の claim を
  1 つ消す／`ANSWER_CAPS` から 1 能力を消す／`publish:false` を無視する——どれも落ちる。
- `scripts/atlas-capability-audit.mjs` の `alias-coverage` は両方向を数える（146 ラベル・宣言された 380 綴りが case に届く）。
- 別名の case ラベルを読んでいた既存の検査 15 本は、同じ解決器に訊く形へ直した（ラベル 1 つ＋`dispatchName`）。
  `tests/engine-camera-tilt-checks.test.mjs` の否定の検査は、ラベル列が消えると**空振りで緑になる**形だったので、
  先に `case 'pitch':` の存在を確かめてから否定する。
