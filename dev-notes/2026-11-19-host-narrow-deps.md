---
title: 共有環境 IM_HOST への依存を縮める第一歩——工場には読むメンバーだけを渡し、丸ごと渡す工場を数えて増やさせない
date: 2026-11-19
---

## 背景

外部監査の結論は「全面書き直しは不要。共有実行環境への依存を縮めて機能の独立性を上げる」。測定（`tests/global-surface-baseline.json`）では
`IM_HOST` が 281 メンバー（書き換え可能 55）で、`factory(IM_HOST)` と呼ばれる工場が 163 本だった。既存モジュールの書き直しはしない。
新規の標準と、効果の大きい既存から順に縮める手順を入れる。

## 実装

1. **`js/host-slice.js` の `hostSlice(HOST, [名前])`** — 名前に挙げたメンバーだけを持つ、`IM_HOST` の**生きた**窓を返す。
   値の写しではなく getter（シェルが実行時に付け替える言語などが古くならない・#R165）。setter は `IM_HOST` 側に在るときだけ。
   `IM_HOST` に無い名前はハンドオフ時にエラー（あとで `undefined` として見つかるのではなく）。
2. **`js/app-body.js` の 15 工場**（`satProto`・`viewControls`・`space`・`newsSources`・`usElections`・`warFronts`・`netHealth`・
   `elections`・`newsPulse`・`facilities`・`industryWeb`・`oceanCurrents`・`precipAnnual`・`histPlaces`）を
   `factory(hostSlice(IM_HOST, [読むメンバー]))` へ。対象は「`HOST` を `HOST.メンバー` の形でしか使わず、メンバーが 4 つ以下」の
   工場。工場本体は 1 行も変えていない。一覧が呼び出し側の依存契約になる。

## 門

- `scripts/global-surface.mjs` に **`hostWhole`** 台帳: 「`IM_HOST` を丸ごと渡されている工場」の名簿を両方向に棘（ratchet）する。
  新しい工場が丸ごと受け取れば落ち、減らせば `--update` が受領証になる（163 → 148）。
- `tests/host-narrow-deps-checks.test.mjs`: ① `hostSlice` が生きた窓であること ② 各スライスの一覧が**工場自身のソースから導いた**
  読むメンバーと完全一致（過少宣言＝黙った `undefined`、過剰宣言＝誰も使わない依存の両方を拒む） ③ スライスされた工場が `HOST` を
  他の方法で触っていない ④ スライスと丸ごと台帳が両立しない。
- `factory(IM_HOST)` の綴りをソース文字列で固定していた既存の検査 6 本（elections・view-controls・industryWeb・newsPulse・satProto・
  startup-lazy）は、`hostSlice(IM_HOST, [...])` も同じ呼び出しとして受けるよう直した（固定の中身＝呼ばれていること・順序は不変）。

## 試して取り下げたもの（次に同じ道を通らないために）

CI で実測して、広げすぎた分を戻した。

- **`companies`・`legal`・`windowManager`・`make*` 系 5 工場**: R163/R167/R169/R200 が `factory(IM_HOST)` の綴りや、第 1 引数が
  `IM_HOST` であることを AST で固定している。`own-fetch-relay` は「ホストの getter が返す import」を束縛で辿るので、スライス越しには
  追えない。これらの解析（`scripts/data-effects.mjs`・`output-taint.mjs`・`export-readers.mjs` も `factory(IM_HOST)` の流れを読む）に
  `hostSlice` を教えてから移す。**先にそれ**。
- **`IntMapDialog`／`IntMapLabelScale` の import 化**（`module-graph --migrate`）: `label-scale.js` を `vm`／`new Function` で
  classic script として評価するテストが 14 本、`search-geocode` などを vm で評価する spec と classic の到達検査（`service-status.js`）が
  `export`/`import` で落ちた。テストの読み込み器を 1 本に寄せるのが先。

## 測定

| | 前 | 後 |
|---|---|---|
| `IM_HOST` を丸ごと渡される工場（`hostWhole`） | 163 | 148 |
| `IM_HOST` メンバー／書き換え可能／公開グローバル | 281／55／660 | 同じ（挙動と能力は不変） |
| `window` 経由の参照 | 4,162 | 4,155（main 側の変動。この変更では減らしていない） |

## 残り・次の一手

1. 解析（データ効果・出力汚染・書き出し読み手・own-fetch-relay）と、`factory(IM_HOST)` を固定する検査群を、スライスを透過して辿れる
   ようにする。そのあと取り下げた工場と、遅延モジュールの `mount`（`m.x(IM_HOST)`）をスライスにする。
2. テストの classic-script 読み込みを 1 つの器に集めてから、`IntMapDialog`（42 件）・`IntMapLabelScale`（48 件）を import 化。
   以降の候補は `--plan` の leaf: `IntMapWx`（34）・`IntMapHistScale`（26）・`IntMapCache`（26）。
3. `IM_HOST` のメンバー数そのものは減らしていない。スライスの一覧にも現れないメンバーを落とす段が、その次。
