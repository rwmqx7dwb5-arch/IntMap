---
title: 共有環境 IM_HOST への依存を縮める第一歩——工場には読むメンバーだけを渡し、丸ごと渡す工場を数えて増やさせない
date: 2026-11-19
---

## 背景

外部監査の結論は「全面書き直しは不要。共有実行環境への依存を縮めて機能の独立性を上げる」。測定（`tests/global-surface-baseline.json`）では
`IM_HOST` が 281 メンバー（書き換え可能 55）で、`factory(IM_HOST)` と呼ばれる工場が 162 本、`window` 経由の参照が 4,162 件だった。
既存モジュールの書き直しはしない。新規の標準と、効果の大きい既存から順に縮める手順を入れる。

## 実装

1. **`js/host-slice.js` の `hostSlice(HOST, [名前])`** — 名前に挙げたメンバーだけを持つ、`IM_HOST` の**生きた**窓を返す。
   値の写しではなく getter（シェルが実行時に付け替える言語などが古くならない・#R165）。setter は `IM_HOST` 側に在るときだけ。
   `IM_HOST` に無い名前はハンドオフ時にエラー（あとで `undefined` として見つかるのではなく）。
2. **`js/app-body.js` の 23 工場**（`satProto`・`legal`・`makeI18nLate`・`makeLayerFavs`・`newsPulse`・`warFronts`・`elections` ほか）を
   `factory(hostSlice(IM_HOST, [読むメンバー]))` へ。対象は「`HOST` を `HOST.メンバー` の形でしか使わず、メンバーが 4 つ以下」の
   工場を**ソースから機械的に**選んだもの（`HOST[...]`・分割代入・他へ渡す工場は対象外）。工場本体は 1 行も変えていない。
   一覧が呼び出し側の依存契約になる。
3. **`window` 経由の参照を import へ**（`scripts/module-graph.mjs --migrate` の手順）: `IntMapDialog`（30 ファイル 49 件）と
   `IntMapLabelScale`（32 ファイル 48 件）。どちらも所有者が `export const` し `globalThis.X = X` で従来どおり公開も続ける
   （Atlas・テスト・クラシック script の読み手は変わらない）。

## 門

- `scripts/global-surface.mjs` に **`hostWhole`** 台帳を追加: 「`IM_HOST` を丸ごと渡されている工場」の名簿を両方向に棘（ratchet）する。
  新しい工場が丸ごと受け取れば落ち、減らせば `--update` が受領証になる。
- `tests/host-narrow-deps-checks.test.mjs`: ① `hostSlice` が生きた窓であること ② 各スライスの一覧が**工場自身のソースから導いた**
  読むメンバーと完全一致（過少宣言＝黙った `undefined`、過剰宣言＝誰も使わない依存の両方を拒む） ③ スライスされた工場が `HOST` を
  他の方法で触っていない ④ スライスと丸ごと台帳が両立しない。

## 測定（`global-surface.mjs`）

| | 前 | 後 |
|---|---|---|
| `window` 経由の参照 | 4,162 | 4,065 |
| `IM_HOST` を丸ごと渡される工場 | 162 | 139 |
| `IM_HOST` メンバー／書き換え可能／公開グローバル | 281／55／660 | 同じ（挙動と能力は不変） |

## 残り・次の一手

- `IM_HOST` のメンバー数そのものは、ここでは減らしていない（読み手が消えたメンバーは無い）。次はスライスの一覧が**どの工場からも
  読まれない**メンバーを `IM_HOST` から落とす段。
- 遅延モジュール（`js/lazy-modules.js` の `mount`）は `m.x(IM_HOST)` のまま——`hostWhole` 台帳に載っている。同じ手順でスライスに
  できるが、工場が lazy-registry の宣言を介するので別の変更にする。
- 次の import 化の候補（`--plan` の「leaf: can export now」）: `IntMapWx`（34）・`IntMapHistScale`（26）・`IntMapCache`（26）。
