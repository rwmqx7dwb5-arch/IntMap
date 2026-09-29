---
title: 期限切れは拒否ではない——レーダーの行は負荷の高いページで索引を読みきれなかっただけで箱を外され、二度と読まれなかった。判定（isUnobserved）と方針（untilObserved）を 1 つずつ置き、行の側は rowUntilObserved の 1 か所を通す
date: 2026-09-29
---

〈依頼（nightly の赤）〉deep tier が 10 夜連続で赤。直近 run 36493764477 の失敗は
`tests/restored-layer-before-style.spec.js:127`「通常起動にはあり hold した起動には無いレイヤー = ["lyr-radar"]」。

## 0. 測った

- **赤の run は #802 を含んでいない。** run 36493764477 は 2026-09-28T22:40Z、head `001f2639`。
  `js/fetch-deadline.js` の「時計はホストの沈黙を数え、このページ自身の凍結を数えない」（#802・659cd6ac）は
  2026-09-29 15:34 JST に入った。この spec は RainViewer をローカルで即答させている（`ctx.route`）ので、
  期限切れはページ自身の凍結で起きていた——#802 が直接の原因を塞いだ可能性が高い。
  ⚠ **それでも構造は残っていた**: 期限切れ（観測できなかった）と拒否（相手が答えて断った）が同じ腕で
  処理され、行は箱を外して打ち切っていた。`.agents/rules/one-pass-or-a-reason.md` §5 の禁止そのもの。
- **全数調査**（`js/` の `checked=false` を含む全 47 行、および `jsonWithin` / `readWithin` を読む 19 ファイル）:
  - 行を ON にする経路の「取得に失敗したら箱を外す」: data-layers 8（レーダー・ケーブル・火災・衛星・波・
    陰影起伏・海面上昇・等高線）、weather 1、net-health 1、war-fronts 1、dash-extended 1、
    beta-overlays 2、layer-packs 1。
  - **そのうち期限切れが届くもの＝2**: レーダー（`rvFetch` → `jsonWithin`）とケーブル（`_cableLocal` /
    `_cableNet` → `jsonWithin`・4 回目で `autoUncheck`）。**この 2 つを方針に通した。**
  - 残りに期限切れは届かない: 遅延読み込みの失敗（net-health・war-fronts・beta-overlays の 2・衛星・波）、
    構築の例外（火災の同期 catch・陰影起伏・海面上昇・等高線）、期限の無い素の fetch（dash-extended の言語・
    layer-packs のタイムゾーン）、ECMWF（`guardedJSON` の期限切れは null を返し `ready()` は reject しない。
    reject するのは SDK の script の読み込み失敗＝観測された失敗）。火災の探りの期限切れは「今の一覧のまま描く」で箱を外さない。

## 1. 判定と方針（`js/fetch-deadline.js`）

- **`isUnobserved(err)`** — `reason === 'timeout'` だけが真。`aborted`（呼び手自身の Stop）・`network`・`http`・
  `parse`・理由の無い例外は偽（分類されていない失敗を「再試行」へ昇格させない）。
- **`untilObserved(read, opts)`** — 観測されなかった失敗だけを、時計を 2 倍にして読み直す（1→2→4→8 倍。
  `read(scale)` に倍率を渡す）。その前に**失敗した試みの時計と同じだけ**待つ（負荷の高いページに捌く時間を渡し、
  再試行が壁時計の半分を超えない）。観測された失敗は**その場で・手を付けずに**返す（1 回しか読まない）。
  8 倍でも沈黙なら `retries` を付けて投げる。`wanted()` が偽なら `aborted` で終わる。`onWait` が記録を受ける。
- **`UNOBSERVED_RETRIES = 3`** — 観測: 6 秒の時計（`DIRECT_TIMEOUT_MS`）× 8 = 48 秒の数えた沈黙は、夜間の
  runner で測った最長の主スレッド凍結（30 秒・同ファイルの註）より長い。失効条件: ある相手の正当な応答が
  `clockFor` の自分の行の 8 倍より遅いこと（そのときは再試行を増やさず `clockFor` に行を足す）。正本はここ。
- `js/proxy-fetch.js` の `fetchDeadline` も同じ語彙の `reason`（`timeout`・`aborted`・`network`・`http`＋`status`）
  を投げるようにした。梯子はまだそれで分岐しない（全段の失敗を同じに扱い、報告は note の `reason`）。
- `js/runtime.js` に **`afterTick(key, ms)`** — タイマーホイールの 1 回。発火したら自分を外す。隠れたタブでは
  進まない（再試行は描いたものを見られる読者を待つ）。

## 2. 行の側（`js/data-layers.js` の `rowUntilObserved(箱, read, 基準の時計)`）

- 待つあいだ**箱は ON のまま**・行に `aria-busy`・トースト 1 回・回数を箱の `data-im-unobserved`（§5 の記録）。
  要求は settle しないので自己修復（heal-waits-for-inflight）は行を揺すらない。
- 箱を外す／もう一度入れる（新しい世代 `_unobsGen`）と `aborted` で終わる。レーダーの枝は描く直前にも箱を
  確かめる——**OFF の箱の後ろに描かない**（CONSTITUTION §3。以前は取得中に外した箱の後ろに描けた）。
- レーダー: `rvFetch(scale)` が時計に倍率を掛け、最後の失敗を `_rvWhy` に残す。`rvRead` がそれを投げ直す。
  サムネイル（`layerReads.radarIndex = rvFetch`）への契約は不変（索引か null）。
- ケーブル: `fetchSubcables(scale)` の全段に倍率と `seen` を渡し、何も得られず**どれか 1 段でも期限切れなら**
  `unobserved` を返す。梯子全体を方針が読み直す。全段が答えて断ったときだけ #R188 の 5/15/45 秒の後退。
  方針が尽きたら後退を回さず報告へ（4×4 回にしない）。
- 最悪の待ち（相手が本当に沈黙し続けるとき）: レーダー 6+6+12+12+24+24+48 = 132 秒、ケーブルは 1 試行が
  最大 3 つの時計なので約 5 分。その間、箱は ON で `aria-busy`。

## 3. 新しい文字列

- 「Still waiting for the data — asking again」／「データの応答を待っています — もう一度問い合わせます」
- 「The data did not arrive in time — try again」／「データが時間内に届きませんでした — もう一度お試しください」
  （どちらも en + jp の 2 言語。`AGENTS.md` §3-5）。

## 4. 検査

- 新規 `tests/unobserved-is-not-refused-checks.test.mjs` — ① 分類（実際の `readWithin` の期限・Stop・404・拒否・
  不正な本文）② 方針（倍の時計・待ち・記録・観測された失敗は 1 回・尽きたとき・`wanted` 偽）③ `afterTick`
  ④ **出荷されたレーダーの枝**（acorn で `rowUntilObserved`・`rvFetch`・`rvRead`・枝そのものを取り出し、本物の
  `jsonWithin` / `untilObserved` / `afterTick` で評価）: 期限切れ→箱 ON・`aria-busy`・記録・2 回目の読みで描く／
  404→従来どおり外す（読み 1 回）／待機中に OFF→描かない ⑤ 方針を通る行を源から発見。
  変異: `isUnobserved` を常に偽にすると ①②④（期限切れ・OFF）の 4 件が赤。
- 更新した既存検査（旧挙動「期限切れ＝即、外す」を守っていたもの）:
  `tests/stalled-fetch-and-surface-gauge-checks.test.mjs` ①④（方針を最後まで歩かせる。④の rig の `window` は
  runtime を持たないと明示——代役が `afterTick` を永久に待たせていた）、
  `tests/layer-subcables-checks.test.mjs`・`tests/subcables-route-checks.test.mjs`（呼び出しの綴り）、
  `tests/helpers/load-wx-source.mjs`（`fetch-deadline.js` の `export` を全部外す——関数本体は export を持てない）。
- `tests/restored-layer-before-style.spec.js`（`IM_TIER=all`・build 済みの dist）: 7 回中 6 回緑（1 worker×1・2 workers×2・**4 workers×4**＝同時 8 ページ）。最初の 1 回だけ「the reported layers are on the map」の 30 秒の poll で赤——どの層が欠けたかは出力に無く、未特定。直後に同じ条件へ 20 秒の待ちと診断を足した写しでは両層あり、レーダーの再試行は 0 回（`data-im-unobserved` 無し）。
- 別件（触っていない）: `tests/durations.json` のこの spec の記録（70 秒）は実測（100〜250 秒）より大幅に小さい。

## 5. 箱を外さない 5 経路（続き・同じ worktree）

最初の報告で挙げた「期限切れを『データ無し』と同じに扱うが箱は外さない」5 経路を同じ方針に通した。
共通の最終表示は「The data did not arrive in time — try again」／「データが時間内に届きませんでした — もう一度
お試しください」（en + jp。§3 の 2 本目）。どれも**期限切れの結果を保存しない**ので、次の要求で取り直せる。

- **出生率**（`js/data-layers.js` の tfr）: `rowUntilObserved('dl-tfr', …)` を通す。再試行を尽くした沈黙は
  灰色の「データ無し」塗りを下ろし、上の文を出す（`_tfrData` は未設定のまま）。
- **`js/precip-annual.js`**: `manifests()` を `untilObserved`（`wanted`＝行が ON、待ちは `afterTick`）に通し、
  同時の呼び手（paint と ensureVals）で 1 つの試みを共有。OFF で待ちが終われば何も言わない。
- **`js/wb-layers.js`**: `wbSeries` の各読みは、拒否・不正な本文なら従来どおり `[]`、**沈黙なら投げ直す**。
  **実害があった**: 合算の指標（UNHCR＋UNRWA）で片方が沈黙すると、残り半分だけの合計が系列として cache
  されていた。全体が沈黙すると全国を灰色（データ無し）で塗っていた。今は再試行を尽くすと reject し、
  cache に何も残さない。`choroOn` は塗らずに上の文を出す。
- **`js/layer-packs.js:844`**（単年の World Bank 読み）: ⚠ **最初の報告の「期限切れの空結果を cache に保存」は
  誤読だった**。空の結果は拒否の枝が cache の行より前で `return` するので、もともと保存されていない
  （評価して確認）。直したのは表示だけで、期限切れ（系列または単年の読み）なら「Could not load the data」ではなく
  上の文を出す。
- **`js/countries-ui.js`**（classic script）: 最後の段の例外を `grabErr` に残し、
  `window.IntMapFetchWithin.isUnobserved` で分類して、期限切れなら上の文を出す。約束はもともと失敗時に
  消えるので、次の呼び出しは読み直す。`js/app-body.js` は import の 1 行（:47）と公開の 1 行（:63）だけ。
- 門 ⑦（`stalled-fetch-and-surface-gauge`）は `clockFor(u) * scale` を host の時計と認める（リテラルの倍率は
  今までどおり拒否）。回帰は `tests/unobserved-is-not-refused-checks.test.mjs` ⑥（wb-layers・layer-packs・
  precip-annual を出荷されたソースから評価し、countries-ui と app-body の公開を確認）。
