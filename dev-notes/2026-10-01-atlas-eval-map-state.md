---
title: Atlas の品質研究所は答えの文面しか採点しておらず、「答えは地図の状態として現れる」を一度も測っていなかった。地図の期待状態を鍵に書く欄・製品から発見した語彙で赤くなる鍵の検査・文面と混ぜない map 軸（一致／不一致／観測できず）・年と範囲で数え上げた歴史の単位との照合を足し、再生と時系列の報告に載せた
date: 2026-10-01
---

〈依頼〉品質研究所（#853）の答えの鍵 74 問は数値・日付・名前の文面で採点される。PRODUCT.md §2.2-2「答えは
地図の状態として現れる」を測れていない。地図が正しい場所・年・層・描画を示したかを、モデル無しの決定的な採点で、
文面とは別軸で測る。観測できなかったことを不一致と言わない。歴史の問いは historical-verification に従う。

## 0. 測った

- `judge.mjs` の地図に関する規則は `expect.map`（`atlas.pins.n ≥ 1` のような 2 行）だけで、記録の問い 2 問にしか
  付いていない。答えの鍵 74 問は 1 問も地図を問わない。「ルートを地図に出して。何 km？」に「515.4 km」とだけ書いて
  地図を起動時のままにしたターンは correct だった。
- 読める地図の状態: 本番のハーネス（`scripts/atlas-eval.mjs` の `observe`）は
  `IntMapAtlasState.snapshot({ only: ['atlas', 'activeLayers', 'camera'] })` を取る。製品は他に `viewport`
  （見えている枠）・`time`（時計・`travelDate` は UTC の `YYYY-MM-DD`、範囲外は符号付き 6 桁）・`objects`（地物の
  一覧と種類）・`routing`・`comparison` を公開している（`js/atlas-state.js`）。`lastPlan().dispatches` は
  操作の列であって地図の状態ではない。
- 再生のカセット 12 本は全部 `world.snapshot: {}`（手書きの世界は地図について何も述べていなかった）。
- 層の行は `js/layers/<id>.js` の宣言 174 本で、宣言の `id` が `activeLayers` の行の `id`（チェックボックスの id）。
  歴史の行政区分は `cb-admin1` が時代の単位も支配する（`js/time-admin1.js`「ONE FEATURE, ONE SWITCH」）。
- `scripts/hist-fidelity.mjs --year Y --in w,s,e,n` は束が Y 年 7 月 1 日に描く単位を列挙する（関数は export
  されていないので CLI として呼ぶ。1 回約 1.2 秒）。日本 [122,24,146,46] で 1750 年 82 単位（うち「…国」68）、
  1900 年 123 単位（「…国」0）。

## 1. 作ったもの

**`scripts/atlas-eval/map-state.mjs`** — 地図の軸。
- 鍵の欄 `mapState`（全部任意・書いた基準だけ採点）: `view.contains`（枠に入るべき地点・座標の出典 URL つき）、
  `layers.on/off`、`clock`（年・日付・live）、`comparison`、`drawn`（スナップショットの数え上げ。`atlas.lines`・
  `objects.kind:route` など。`anyOf` で「どの能力が描いてもよい」を表す）、`era`（年・範囲・含むべき／含まない単位）。
- **語彙は発見する**（no-ad-hoc-hardcoding §2-4）: 層 id は `js/layers/` の宣言、節は `js/` に登録された provider、
  `atlas.*` はコンソールが `atlas` として登録した関数の欄、地物の種類は `js/map-tools.js` の一覧が出すもの、
  歴史の単位は hist-fidelity の列挙。無いものを書いた鍵は `validateAnswerKey` / `validateQuestionSet`
  （`--validate` と検査）で赤。
- **採点**（純粋）: 基準ごとに `match` / `mismatch` / `unobserved`。スナップショットに節が無い（provider が無い・
  ハーネスが取っていない・再生が乖離して録画の地図がこの回のものでない）は `unobserved`。読めた節が違うと
  言うときだけ `mismatch`。`anyOf` は全部の候補が読めて全部外れたときだけ `mismatch`。枠は日付変更線を跨ぐ。
  チェックされていても描かれていない層（`painted:false`）は「点いていない」。
- **歴史を歴史として採点する**: 束が描く単位は時計と枠の関数なので、**観測された年・観測された枠**で列挙した
  単位（読者が見たもの）を、**問われた年**で列挙した単位と比べ、欠けたもの・その年でないものを名指す。鍵の側も
  同じ列挙と制度の日付で検査する（`includes` / `excludes`。1900 年に「…国」は無い＝1871-08-29 廃藩置県）。
  ⚠ これは束の読み手。線そのものは OHM のタイルからも描かれ、node からは読めない（§2b）——報告にそう書く。

**軸を混ぜない** — `judgeTurn` は `metrics.map` を足すが失敗（`failures`）には足さない。回帰の鍵は
`<id>:map`（観測された判定だけ）。集計 `metricsOf().map`（種類・言語・能力別）、報告に `## Map` 節と各ターンの
`map:` 行、時系列（`summaryOf`/`renderTrend`）に「map right (observed)」「map unobserved」の列と map 別の表。
map 軸を持たない昔の夜は「—」で、0 ではない。

**鍵** — 答えの鍵 74 問のうち、**問いの文言が地図に何かを求める 30 問**に `mapState`（視野 23・描画 18。
日 14・英 16）。座標は Wikidata の P625（2026-10-01 に読んだ QID を URL で残す）か、その行の `derivation` が
既に使っている空港の座標。地図を求めない問い（「日本の総人口は？」など）には書かない。「日本で一番長い川は？
地図に出して」（川を出す手段が視野か描画か決まらない）と「活火山の数…地図に表示して」（描かれ方を製品から
特定できなかった）は書いていない。記録の問いには 3 問（`rail-tokyo-osaka` 経路、`ryoseikoku-1750` と
`japan-admin-1900` の時計・`cb-admin1`・era）。記録の問いの `expect` は「その回が判定に使った基準だけ」なので、
`mapState` はそれと別の軸だと `$comment` に書いた。

**再生** — 12 本のうち問いが地図を述べる 8 本に `expect.map`。一致 5（経路・計測 2・ピン 2＋計測・Canberra）、
不一致 1（`rail-request-reached-nothing`: 操作ゼロ＋ハーネスは毎問新しいページ＝何も描かれていない、は導ける）、
観測できず 2（`unobserved-call-is-not-run-twice`: 合成されていないページでカメラの行き先がまさに観測できなかった
／`observer-contradicts-itself`: R802 は時計と枠を記録していない）——この 2 本にはスナップショットを書かなかった。
`measured-and-stated-wrong` は**文面は誤り・地図は正しい**で、2 軸が食い違う見本になった。
`--replay` の表に `map` 列。

## 2. 否定された見立て・途中で見つかったもの

- 「中心からの距離」で視野を採点する案は、許容距離が由来を書けない定数になるので捨てた。枠への包含は定数が要らない。
  ⚠ その代わり、**世界全体を映す枠も包含では通る**（下の残し）。
- 本番の録画（`cassetteOf`）は `expect.map` を書かないので、「問いが地図を述べるのに宣言が無い」を赤にすると
  `--record` の往復検査が赤くなった。録画は採点と表示だけして保持はせず、**手書きのカセットには宣言を要求する**
  （新しい検査）形にした。
- 歴史の列挙を読んで見えたこと（直していない・historical-verification §5 の記録として）: 日本の範囲で
  **1872〜1880 年は 11〜14 単位しかない**（廃藩置県 1871-08-29 から穴埋め束の開始 1881-02-07 までの府県が無い）。
  `Okinawa Prefecture` の行は 1880-01-01 から（`Ryukyu Domain` が 1872-09-14〜1880-01-01）だが、琉球藩は 1879 年に
  沖縄県になった（Wikipedia「Ryukyu Domain」: 1872 to 1879）——上流の年精度の問題に見える。

## 3. 検査

`tests/atlas-eval-map-state-checks.test.mjs`（10 本）: 語彙が製品から発見される／両方の問題集の `mapState` が
語彙で検証され、地図を求めない問いには無い／存在しない層・節・欄・種類・出典の無い座標・why の無い基準は赤／
era の鍵が列挙と制度の日付に縛られる（1900 年に山城国を求める鍵は赤）／節が無いのは unobserved・読めて違うのが
mismatch／日付変更線・painted:false・時計（符号付き 6 桁）・比較パネル／era が観測年と観測枠で数え上げられる
（1900 年に合わせた時計は「…国」の欠けを名指す、時計 live は不一致、列挙が渡されなければ unobserved）／
2 軸が混ざらず map が自分の鍵で回帰する／再生が各カセットの map 判定を保持し、枠を動かすと赤・乖離した再生は
unobserved／報告と時系列が map 軸を持ち、昔の夜は「—」。既存の `atlas-quality-lab`・`atlas-eval-harness` も緑。
`node scripts/atlas-eval.mjs --replay`（12 本緑・map 5/1/2）、`--validate` 緑、`check:static`・`check:catalog`・
`check:capabilities`・`check:atlasrepeat`・`check:docs` 緑。

## 4. 残したこと

- **本番のハーネスが `viewport`・`time`・`objects` を取っていない**（`scripts/atlas-eval.mjs` の `observe` は
  `only: ['atlas','activeLayers','camera']`）。このままだと夜間の map 軸は視野・時計・地物の基準が全部
  `unobserved` になる。`only` を `map-state.mjs` の `sectionsRead(全問)` との和にする 1 行が要る。あわせて
  `cassetteOf` が `expect.map: judged.metrics.map?.verdict` を書けば、録画のカセットも map 判定を保持できる。
- 包含だけでは「世界全体の枠」も通る。枠の広さの上限は問いごとの根拠が書けないので入れていない。
- era の比較は束の読み手だけ。OHM のタイルが描く線は node から読めない。時代の単位を描いた結果を製品が
  スナップショットに出す（`time-admin1` の provider が枠内の在位単位を返す）なら、列挙からの導出でなく実物と照合できる。
