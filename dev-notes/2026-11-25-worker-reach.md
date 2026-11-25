---
title: 子の AI（委譲の worker）ができることを広げる——判定を「読者に見えるものを変えるか」に、同時呼び出し・出力量・画像
date: 2026-11-25
---

〈依頼〉子の AI ができることが限られている。利用者承認の方針: ① 判定を「読者に見えるものを変えるか」に ② 1 回に複数の能力を同時に
③ 出力上限を親が上げられる既存の仕組みにつなぐ ④ 画像を渡す。地図に描くのは親（Atlas）だけ。

## 実測（2026-11-25・`makeAtlasCapabilities({})` の生きている 287 件）

子が走らせてよい能力は 56 件。`facets.mutatesState`（何かを書くか）で一律に拒んでいたため、結果をデータとして返せばよい
Python 計算（`compute.run`）・予測モデル（`model.run`）・データの絞り込み（`data.query`）・`geo.ml`・`geo.imageChange` が拒まれていた。
ページの子は 1 回に能力 1 つ、出力は 3,000 トークン固定（`maxOutputHint` を送らない）、画像は渡らない（`images:null`）。

## 変えたこと

1. **判定**（`js/atlas-capabilities.js` `facetsOf`・`js/atlas-console.js` `classifyCapability`）:
   - 新しい facet `changesSeen`: 書き込み先の名前空間が読者に見えるものを出さず、書き手が全員 read/session のときだけ非公開
     （今日は `gis.dataset` だけが該当）。persist/external・名乗られない session の変化は見えるものとして扱う。id の一覧は無い。
   - 新しい方針の鍵 `headless`（`js/atlas-caps.js` POLICY_KEYS → 生成表 `HEADLESS`）: 子（`source:'atlas-worker'`）として走ると
     ピン・描画・カメラを省きデータで返す、と能力が宣言する。`model.run`（`meta.specialistModel`）と `data.query`（`answer(a,{pin:false})`・`meta.query`）。
   - 許可 = (`changesSeen===false` かつ表示しない、または `headless`) かつ 訊かない・保存しない・委譲しない・確認不要。
   - `compute.run` は子のとき read の許可だけ、読者の作業へ記録しない。
   - `web.fetchFile` の行は取り込みが読者の地図に描くのに `gis.dataset` しか名乗っていなかった → `gis.dataset,map.object`（実態の宣言）。
   - 結果: 56 → **62** 件。加わったのは compute.run・model.run・data.query・geo.ml・geo.imageChange など。
2. **同時呼び出し**（`js/atlas-delegate.js`・`js/atlas-job-core.js`）: 子は `{"calls":[…]}` を返せ、同じ回は同時に走り順に返る。上限は足していない。
3. **出力量**: 契約の `maxOutput` を `maxOutputHint` として送る（省略時はサーバの既定）。ai-proxy がモデルの上限で抑える。
4. **画像**: 契約の `images` に添付の名前（台帳の名前）か `@view`（そのターンの地図フレーム）。見せられなかったものは理由つきで gaps に出す。
   `js/atlas-console.js` に `get ATTACH_LOG()` を足した。

## 残したこと

- サーバ側の永続ジョブの子は `images`・`maxOutput` を運ばないので、名前つきで断る（`images_unsupported_on_server` 等）。
- `research.brief` 等、内部でモデルを呼ぶ読み取り能力の呼び出しは、子のキーではなく親ターンのキーで記録される。
- `geo.regionStat` は描画するのに行が何も書くと名乗っていないので拒まれたまま（行の宣言を正せば対象になる）。

## 検査

新規 `tests/worker-reach-lane-checks.test.mjs`（7）・`tests/worker-reach-exec-checks.test.mjs`（9）。既存 4 件を新しい判定に合わせた
（facets ③⑤・delegation-wiring ⑨・jobs-atlas の形）。関連 394 件緑、check:static / capabilities / catalog / types / docs 緑。
