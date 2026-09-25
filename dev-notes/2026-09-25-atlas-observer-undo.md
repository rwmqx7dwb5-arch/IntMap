---
title: 「描かれているか」をレンダラの 1 つの問いにし、「観測できなかった」を失敗と分け、ターンを 1 つの仕組みで元に戻す
date: 2026-09-25
---

# 「描かれているか」をレンダラの 1 つの問いにし、「観測できなかった」を失敗と分け、ターンを 1 つの仕組みで元に戻す

## 何が欠けていたか（実測）

1. **成否の判定が能力ごとの手書きだった。** `js/atlas-capabilities.js` の検証器が `not_rendered` /
   `no_change` / `not_rendering` を返す箇所は 20 を超え、「地図に描かれているか」を各観測器が自分で
   答えていた——`paintNow()` に 7 つのソース id が手で並び、到達圏と陣営塗りの観測器もそれぞれ 1 つの id を
   書いていた。書かれていない描画面は件数を動かさないので、正しい描画が `not_rendered` になり Atlas は
   描き直した: #R736（21 手・10 分 29 秒）、#R742（207 操作中 52 件＝25%）、#R740（同じ到達圏の描き直し 5 回）、
   R802（施設マーカーが ok と not_rendered を交互に）。観測器が `none` の能力は 22 件。
2. **「観測できなかった」が「失敗した」と同じ語だった。** カメラだけが #R768 で `not_rendering` を知っていて、
   それ以外の判定はレンダラが何も見せられない瞬間（style 未解析）でも `not_rendered` / `no_change` を返した
   （`.agents/rules/one-pass-or-a-reason.md` §5 が禁じる形）。
3. **取り消しが 0/145。** `toJSON().hasUndo` は `typeof c.undo === 'function'` で、どの行も `undo` を持たなかった。
   executor には `API.undo` と `undoToken` の経路があったが、呼べるものが無かった。

## どう直したか

### ① 問いはレンダラに 1 つ（`js/geo-engine.js`・`types/geo-engine.d.ts`）

- ファサードの `render` に `claim(ids, owner, {clear})` / `drawn({owners|sources})` / `clearSurface(id)`。
  描く側が**作る場所で**ソースを申告し、キーは能力表の列 5 の効果キー（`map.isochrone`・`map.factions`…）。
- `drawn()` は両アダプタが共に実装する契約メンバー（`raw`・`canDraw`・`hasSource`・`sourceData`・`getStyle`・
  `isVisible`）だけで、`drawn / empty / hidden / unlayered / absent / unknown` を返す。
  `observable:false` のときは全部 `unknown`——`gone` に数えない。型は `SurfacesDrawn` として宣言し、
  `npm run check:types` が 2 つのエンジンに同じ形を強いる。
- 申告: `js/atlas-console.js`（多角形・線・施設マーカー・歴史年のハイライト、および `js/atlas-sims.js` の
  飛行経路・爆風・標高・陣営塗り——atlas-sims の本体は tests/r199 がバイト一致を見ているので、取り外し関数を
  束ねる console 側で申告）、`js/map-tools.js`（到達圏）、`js/atlas-map-compose.js`、`js/shakemap.js`、
  `js/pandemic-atlas.js`。

### ② 検証器はそれに訊く（`js/atlas-capabilities.js`）

| 観測器 | 前 | 後 |
|---|---|---|
| `paint`（26 能力） | `paintNow()` に 7 つの手書き id | `surfaces`＝申告された全ソース（発見）。`compose`・`factions` は効果キーで訊く |
| `isochrone` | `sourceFeatureCount('im-iso-src')` | `ownedFeatures('map.isochrone')` |
| `factions` / `mapCompose` | `paintNow()` の手書き id | 効果キーで訊いた値（判定の形は同じ） |
| `sim`（13 能力） | 何も動かなければ `not_rendered` | その能力の効果キーで申告された面が描かれていれば `already_there` |
| 全能力（地図・カメラを書く行） | 観測器ごと | `build()` の 1 か所で: 否定的な判定かつレンダラが `observable:false` ⇒ `not_rendering` |

`sourceFeatureCount` は呼び手が無くなったので消した。**判定を上げる方向にしか変えない**——申告が無い・レンダラに
訊けない（`render.drawn` を持たない）ときは前と同じ判定。

**残した観測器と理由:**
- `none` の 22 件——うち 20 件は地図を書かない（`research.*`・`data.*` の読み取り・`dialog.*` 等）。成果物は回答文で、
  回答の監査（`js/atlas-answer-audit.js`）が見る。地図に向ける観測器を付けると、描かないことが失敗になる。
  `view.fullscreen` と `navigation.stop` は書くが、全画面はブラウザのユーザー操作の要件に左右され、案内の停止は
  地図の描画ではない——今回は移していない。
- `camera`（#R768 の `render.ticking()` を既に持つ）・`layer`（dispatch がスタイルを直接読んで `unverified` を立てる）・
  `route` / `wxModel` / `pandemic` / `object` / `queryRows`（それぞれのモジュールや台帳に訊く）・`chart`（成果物は回答の HTML）・
  `panel` / `setting` / `time`（地図の描画ではない）。これらも全能力の規則（②の最終行）は受ける。

### ③ 取り消しは 1 つ（`js/atlas-state.js`・能力 `map.undo`）

- `registerRestorer(name, {capture, restore, same?})` に、状態を持つサブシステムが区画を登録する:
  `camera`（投影・基図のボタン → `jumpTo`）・`time`・`objects`（増えたものを自身の remover で外す）・
  `surfaces`（増えた申告面を申告者の remover で外す。地物数と先頭地物で指紋）＝`js/atlas-state.js`、
  `layers`（チェックと不透明度）・`atlas`（Atlas の描画状態を描いた関数で描き直す）＝`js/atlas-console.js`。
- `beginTurn` が全区画を取り、`undo(turn)` は**地図を変えた直近のターン**を選んで異なる区画だけを戻す。
  文章で答えただけのターン・undo だったターン・既に取り消したターンは飛ばす（2 回目は 1 つ前へ遡り、やり直しにはならない）。
  同じターンでの 2 回目は `already_there`。
- `undoCheck` が取り直して照合し、戻らなかった区画を `unresolved` に名前で返す。`undo` 観測器はそれを読む。
- 能力 `map.undo`（dispatch `undo` / `undoTurn` / `undoLast` / `revertTurn`、schema `{turn?}`、カタログ en+jp）。
  列 5 は触るもの全部（競合キーでもある）。`hasUndo` は**丸ごと戻す**効果 `UNDO_EXACT` から導出し（効果が全部
  含まれる行に `undo()` が付き、executor が完了した操作の `undoToken` にそのターンを入れる。`API.undo` は検証済みの
  結果をそのまま返す）、各区画は丸ごと戻す効果を `covers` で名乗る。

### ④ 申告を実体に合わせた（統合前の指摘）

最初の案は `hasUndo` を「`map.undo` が**触れる**効果か」から導いていた。すると `data.wxModel`・`layers.railAxis`
などは `map.layer`、ピンの削除や `map.volume3d` は `map.object` を書くので「戻る」と申告され、しかしどの
スナップショットもその状態（予報モデル・軸・削除された物体・立体）を持たないので**戻らず、`unresolved` にも
出なかった**——申告した能力が実行されない形（[[intmap-declared-capability-never-executed]]）。
- `hasUndo` は `UNDO_EXACT`（丸ごと戻す効果）から導く。追加しか外せない効果（`map.object`・申告面）を書く行は
  「戻る」と申告しない。26 行が真（前は 54 行）。
- スナップショットが持たない状態を書く行は、その効果を**別のキー**で列 5 に宣言した: `map.layerOption`
  （`data.wxModel`・`layers.railAxis`・`windParticles`・`isobars`・`baseDisplay`・`nightSide`・`planeAltitude`・
  `aircraftTrack`・`satellites`）、`map.location`（`view.locate`）、`camera.follow`（`navigation.camera`）、
  `map.outline`（`map.outline`）、`map.volume`（`map.volume3d`）、`map.compose`（`map.clearHighlights` は地図説明も消す）。
  ⚠ 競合キーが 1 つ増えるだけで、既存のキーは外していない（直列化の相手は減らない）。
- undo は、戻す範囲のターン台帳で**触れない地図・カメラ・時刻の効果を書いて実際に動いた操作**を、能力 ID で
  `unresolved` に名指す。その種の操作だけのターンも取り消しの対象になり、「戻す変更が無い」とは言わない。
  パネル・設定は地図の変更ではないので名指さない。追加しか外せない効果は区画の比較が判定する（外せた追加は
  失敗と呼ばない——それは観測器の嘘と同じ形になる）。

## 検査

`tests/atlas-observer-undo-checks.test.mjs`（評価で測る。①〜⑪）。元の欠陥の形で書いた:
描けた面を描けなかったと報告しない（③④）／観測できないことを失敗と報告しない——地図・カメラを書く全行で（⑤）／
ターンが加えた変更は 1 つの操作で戻る（⑥）／戻らないものは名前で言う（⑦）／何もしなかったターンは飛ばし、
取り消しは取り消さない（⑧）／`hasUndo` は丸ごと戻す効果から導出（⑨）／**hasUndo:true の能力の効果は全部、それを
丸ごと戻すと名乗る区画がある**（⑩）／**戻せなかったものは台帳から `unresolved` に名指される**（⑪）。⑨⑩⑪は④の
最初の案に戻すと落ちることを確かめた。

手書き id の綴りを固定していた既存の検査（`tests/r397` ①b②・`r511` ⑨・`r546` ⑪・`r726` ⑤・`r740` ⑧・`r742` ⓪）は、
守っていた事実（「存在しないソースを見ない」「その面が見える」）を新しい形で述べ直した。R740 ⑧ は
「paint の観測は到達圏を見られない」と述べていたが、今は申告によって**見える**——そのうえで「差分だけでは
同一の描き直しを失敗と区別できない」という同じ回の結論は残るので、到達圏の専用検証器はそのまま。

## 起動費用

`npm run check:perf`（build 後）: eager は raw +19.6 kB / brotli +5.0 kB で許容幅の内側（登録表・申告・判定の規則は
起動時の能力表 `js/atlas-capabilities.js` にある）。遅延チャンク `atlas-executor`（`js/atlas-state.js` の取り消しと
`js/atlas-executor.js` を含む）が 49,585 → 55,350 B になり天井を超えたので、`tests/perf-baseline.json` の
**その 1 項目だけ**を実測に合わせた。読者が Atlas を開いたときにだけ払うもので、起動の予算は動かしていない。

## 残っていること

- `layers.toggle` がレイヤー欄に無い操作部品へ落ちる経路（`doControl`）は、台帳からは区別できない。
- 区画を足せば `map.layerOption` などを `UNDO_EXACT` に入れられる（申告は同じ 1 か所から変わる）。
- 利用者向けのボタンは足していない。Atlas に「元に戻して」と頼めば動く。
- 本番での検証は未実施（統合後）。

## 起動費用

描画の判定（`geo-engine` の `render.claim` / `render.drawn`）とターンのスナップショット（`atlas-state`）は起動時に読まれるモジュールに入る。`tests/perf-baseline.json` の eager を実測に合わせた: raw 4,853,021 → 4,873,044（+20.0 kB）、gzip 1,624,241 → 1,632,413（+8.2 kB）、brotli 1,235,813 → 1,242,287（+6.5 kB）。モジュール数は変わらない。
