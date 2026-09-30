---
title: レイヤーが「描けなかった」ことを状態として持ち、行・読み上げ・Atlas に同じ 1 つの記録で伝える——取得の失敗は成功と同じく消えていた。通知を 1 本の live region にまとめ、孤児の掃除と表示状態の監査から周期実行を無くす
date: 2026-09-30
---

〈依頼（監査）〉レイヤー行は取得が失敗しても成功しても印を消すだけで失敗状態を持たない。自己修復は黙ってやり直すだけ。
通知の実装が 6 系統あり、実体は同じ位置の 2 要素で、どちらも live region ではない。孤児の掃除と表示状態の監査が
常駐ポーリングしている。衛星の凡例が、同梱カタログで描いている最中に「Loading the catalog…」のまま。

## 0. 測った（監査の実測と、この作業での再計測）

- `js/layer-rows.js` `inFlight().track` は `p.then(clear, clear)`——reject した要求は**成功と同じく痕跡を残さず**消えた。
  自分で失敗を捕まえる行（雨雲レーダー・火災・カラー標高・等高線・人工衛星）はトーストを出して箱を外し、その後は
  **利用者が外した箱と見分けがつかない**。海面上昇の失敗は何も言わずに箱を外していた。
- 通知の呼び出し: imToast 105・toast 42・satToast 31・aiToast 22・_toast 9・majorToast 2。実体は `#ai-toast`（4,600 ms）と
  `#sat-toast`（4,400 ms）の 2 要素で、どちらも `.sat-toast`＝**同じ位置**（`css/intmap.css`）。role も aria-live も無い。
- ⚠ **`js/navigation.js` の `toast` は `window.imToast` を呼んでいたが、それを代入するものは無い**（`js/app-body.js` の
  `imToast` は閉包の中）。経路案内の失敗 4 種（`NO_ROUTE`・`LOCATION_UNAVAILABLE`・再探索の失敗ほか）は**何も言わずに
  捨てられていた**。`js/railways.js` の「Could not load railway data」も同じ `window.imToast` を読むので同じく無言
  （このファイルは今回の範囲外——§5）。
- 周期実行: `data-layers:orphan-sweep` 2,500 ms（全スタイル層の `getLayout` と全チェックボックス×表示中の層の総当たり、
  それと `_raiseLabelLayers`）、`data-layers:layer-audit` 10,000 ms（起動 12 秒後から）。何も動いていない地図で
  **1 分に掃除 24 回・監査 6 回**（周期からの計算）。
- MapLibre の `styledata` は `Style.update()` の中で `if (changed) this.fire(new MapStyleDataEvent("data"))`——
  層の追加・削除・移動・レイアウトの変更があった描画のたびに、**idle かどうかに関係なく**撃たれる
  （`node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs` の `Style.update`）。#R41 が心拍を足した理由
  「idle が来ない地図」は、この事象で満たせる。
- ラベルの持ち上げは `js/label-occlusion.js` がすでに `idle` と `styledata` で走らせている——心拍の中の 2 回目は重複。

## 1. 設計

**状態の持ち主は 1 つ——`js/layer-state.js`（`window.IntMapLayerState`）。** 箱ごとに
`loading` / `ok` / `failed` / `unobserved` と `reason`・`status`・伝えた文・時刻・最後の直し。
- `failed` は**答えが届いてそれが「否」だった**（状態・拒否・読めない本文・描画器の拒否）。
- `unobserved` は**時間内に何も届かなかった**（`js/fetch-deadline.js` の `isUnobserved`）。
  `.agents/rules/one-pass-or-a-reason.md` §5 のとおり「確認できなかった」は「失敗した」ではないので、行の言葉も
  `Couldn't load`／`読み込めません` と `No reply`／`応答なし` で分ける。
- 呼び手自身の中止（`aborted`）は状態にならない。

**入口は共有の経路で、行を片端から書き換えない。**
1. `inFlight(watch)`——`layerInflight` は追跡した要求を全部 `layerState.request` にも渡す。reject は、共有の読み手
   （fetch-deadline・data-door・proxy-fetch）が error に付ける `reason` だけで分類される。
2. 自分で失敗を捕まえる腕は、すでに持っている error をそのまま `report(箱, err, {told:true})`（7 か所。雨雲レーダーは
   読みの error を `why` に保持するよう 1 行変えた——以前は `false` に潰していた）。
3. どのモジュールも `window.IntMapLayerState.report(id, 'failed', {reason})`。

**出口は 3 つで同じ記録を読む。**
- 行: 名前の後ろに iOS の pill（system red `--info-mil` / orange `--info-choke`）。**同じ箱のタイル
  `.lst-tile[data-lid]` にも同じ pill**——デスクトップのサイドバーと携帯のタイル表示ではタイルが唯一の顔で、行だけに
  書くと誰も読まない。タイルは作り直されるので、**失敗が在るあいだだけ**追加されたタイルを観測して付け直す（失敗が
  無ければ何も観測しない）。
- 読み上げ: 状態に**入ったときに 1 回だけ** `js/notify.js` へ。行がすでにトーストした失敗は `told` で黙る。
- Atlas: `snapshot()` / `get(id)` / `heals()`＝DOM を持たない素のデータ（`IntMapLayerAudit.states()` も同じ）。
- 消えるのは箱の次の `change` だけ（やり直し、または利用者が外した）。

**通知は 1 本——`js/notify.js`（`window.IntMapNotify`）。** 揃え方:
- 要素: `#ai-toast`（`.sat-toast`）1 つ。id は `tests/r510.spec.js`・`tests/r576.spec.js` が読むので残した。
  `#sat-toast` はもう作られない（2 つの箱が同じ位置に重なることが無くなった）。
- 時計: 4,600 ms 1 つ（あった 2 つのうち長い方——短くなったメッセージは無い）。新しい文は今の文を置き換えて時計を
  やり直す。
- 声: live region は 1 つで中に 2 声——`role=status`/`aria-live=polite` と、`urgent` を付けた呼び手だけの
  `role=alert`/`aria-live=assertive`。どちらも最初の文より前から文書に在る（文と一緒に挿入された region は
  読み上げられない）。`urgent` を使うのは経路案内の失敗（`js/navigation.js`）だけ。
- 1 回だけ: 表示中に同じ文が来たら時計を延ばすだけで書き直さない（書き直しは 2 回目の読み上げ）。`log()` が
  告げたものと畳んだものを記録する。
- 6 系統の関数は消さずに委譲: `aiToast`・`satToast` は直に、`imToast`→aiToast、`_toast`→imToast、各 `toast`→imToast
  （`js/navigation.js` だけは直に `urgent`）、`majorToast` は文を `visual:false` で渡す。
- ⚠ **`majorToast` だけは見た目を揃えていない。** シミュレータ自身の「速報」カードを画面上部に残した——その HUD は
  z-index 6300 でトースト層（`--z-toast` 3000）より上にあり、下のトーストへ移すと HUD の下に隠れうる。
  告げる経路は他と同じ 1 本。

**整合器は事象で走る。** 契機は `idle`・`styledata`（`_coalesce`：束の最初は即座に、以後は掃除 2,500 ms・監査
10,000 ms に 1 回＝旧周期より頻繁にならず、遅くもならない）・`visibilitychange`・`#layer-dropdown` への**箱を含む**
要素の挿入・監査の初回（`whenCanDraw()`）。
- ⚠ 2 回連続判定は 2 回目の見直しが要り、事象が来るとは限らない。**当たりがちょうど 1 回の箱があるときだけ**
  10 秒後（旧周期）に 1 回見直す。2 回以上（直した／直しの 4 分の冷却中）の箱で見直すと、見直しが永久に仕掛け
  直されて別名の心拍になる——検査で固定した。
- **低頻度の見回りは残していない。** 不一致はスタイルの変化・箱や行の変化・タブの復帰の後にしか生まれず、その
  3 つとも観測している。隠れたタブは描画しないので `styledata` は復帰時に届く。
- 回数は `IntMapLayerAudit.runs()` が契機ごとに数える。直しは `IntMapLayerState.heals()` にも残る
  （`IntMapLayerAudit.log()` に書く全件——リングの push を包んだので書き手は 1 つも変えていない）。

**衛星の凡例**: 数えるものが在るあいだは数を出し、取得中なら「· updating from the live feed…」／
「・ライブ配信から更新中…」を後ろに足す。「Loading the catalog…」はカタログが 0 件のときだけ。

## 2. 周期実行の前後（測定）

- 前: 掃除 2,500 ms・監査 10,000 ms の心拍（周期からの計算で何もしない地図で 1 分に掃除 24 回・監査 6 回）。
- 後（一時的な spec `tests/layer-failure-state.spec.js` ②——下の §4 の理由で常設していない。ビルドした本体・hermetic・1280×800）: 起動が落ち着いた後の 15 秒で
  **掃除 0 回・監査 0 回**。起動中の回数は契機ごとに `{sweep: rows 3・styledata 3・idle 4, audit: rows 3・start 1・
  styledata 1・idle 1}`（起動から約 8 秒）。その後スタイルに層を 1 枚足すと掃除が走る（配線は生きている）。
- ⚠ 最初の版は「当たりが 1 回以上」で見直しを仕掛けており、同じ spec の 15 秒窓で監査が `styledata` 1・`recheck` 1
  増えた。前者は起動時の束の後ろ端（監査の束ね間隔 10 秒）で、spec の待ちを 20 秒に延ばした。後者を受けて
  見直しの条件を「当たりがちょうど 1 回」に狭めた。

## 3. 新しい共有窓口（`npm run check:surface`）

- `window.IntMapLayerState` — Atlas・他モジュールが状態を読む／報告する窓口（`get`・`snapshot`・`heals`・`report`・`on`）。
- `window.IntMapNotify` — classic 形の factory（`js/ai-core.js`・`js/satellite.js`・`js/navigation.js`・`js/playground.js`）が
  import 無しで 1 本の通知へ届く窓口。
- `IntMapLayerAudit` に `runs()`・`states()` を足した（既存のキーは変えていない）。

## 4. 検査

- `tests/layer-failure-state-checks.test.mjs`（12 本・出荷するコードを評価）。内容は `docs/TESTING.md` の同名の節。
- ブラウザの検査は**新しい spec ファイルにしなかった**。`tests/layer-failure-state.spec.js` を書いて 2 本とも緑に
  したところで `npm run check:testbudget` が落ちた——未計測の新しいファイルは p75（43 秒）で課金され、core が
  0.4 分の天井を 0.7 分、全体が 86.0 分の天井を 0.7 分超える（天井は下げるだけで上げない、#R197）。
  拒否の場面（行とタイルの pill・持ち主の `{failed, http, 503}`・1 回だけの読み上げ・次の ON で消える）は、同じ
  雨雲レーダーの要求の反対側を見ている `tests/heal-waits-for-inflight.spec.js` に 2 本目として移した（2 本で 35 秒）。
  静かな地図の測定（§2）は 1 回の記録として残し、常設は node の ⑦ が持つ。
  ⚠ 既存ファイルへの追加なので `tests/durations.json` の記録（8 秒）は次の計測まで増えない——計測し直すと
  全体の天井に対して数秒超える可能性がある。
- 既存の radar の検査（`tests/unobserved-is-not-refused-checks.test.mjs`・`tests/stalled-fetch-and-surface-gauge-checks.test.mjs`）は
  変えずに緑——トーストは今までどおり 1 回で、持ち主への報告は `try` の中なので、持ち主を渡さない harness でも挙動は同じ。

## 5. 残したもの（範囲外・提案）

- **Atlas の地図状態の入力はまだ `IntMapLayerAudit.check()` しか読まない**（`js/atlas-state.js` の `activeLayers` は
  チェックされた箱だけを列挙する）。行が自分で外した失敗は Atlas に見えない。`js/atlas-*` は今回編集禁止なので、
  `reg('layerStates', () => GLOBAL('IntMapLayerState').snapshot())` の 1 行を足すことを提案する。
- `js/railways.js` の `window.imToast` も死んでいる（§0）。`window.IntMapNotify.show` へ向ける 1 行で直る。
- 他モジュールの行（`js/layer-packs.js`・`js/world-packs.js`・`js/wb-layers.js` ほか）は要求を `layerInflight` に渡して
  いないので、失敗は各自のトーストだけで状態に残らない。`report()` を呼ぶか、要求を渡せば同じ経路に乗る。
- タイルの失敗（MapLibre の `error` 事象）は状態にしていない。1 枚の 404（海の空タイル）は層の失敗ではなく、
  「その source のタイルが 1 枚も読めなかった」を測る仕組みが要る。
- `Architecture.md` の「30 ファイル・43 本が `everyTick`」は今回の前から実数（34 ファイル）と合っていない。

## 統合時に足したこと

- Atlas の地図状態（`js/atlas-state.js`）に `layerStates` の節を足した。行が失敗を受けて自分の箱を外すので `activeLayers` には出てこず、Atlas は「失敗した雨雲レーダー」を「オフの雨雲レーダー」と区別できなかった。持ち主は `js/layer-state.js` のまま、この節は読むだけ。
- `js/railways.js` が一度も代入されない `window.imToast` を呼び、「鉄道データを読み込めませんでした」が無言で捨てられていた（経路案内の 4 種と同じ形）。`IntMapNotify.show` へ向けた。`window.imToast` を読む箇所はこれで 0。
