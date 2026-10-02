---
title: ツアー作成を足した——いまの地図を段として足し、語りと問いを書き、ツアーをリンクそのもの（?tour=custom&t=…）に入れて配る。既存のプレイヤーがそのまま再生し、リンクの長さは本番サイトの上限を実測して先に警告する
date: 2026-10-03
---

〈依頼〉授業ツアーは手書きの 3 本だけで、教員が自分の授業用のツアーを作る道が無い。共有リンクは地図の状態を全部
運ぶので、それを段にしてツアーを作る機能を足す。保存はサーバではなく URL、作者のブラウザでは下書きを保持、
URL 長の上限を超えそうなら事前に警告、リンクのコピーと `navigator.share`、Atlas から到達できること。

## 1. 作ったもの

- `js/tour-builder.js`（新規・独立チャンク）: 作成パネル。「いまの地図をステップに追加」は `MapState.hash()`
  ——アドレスバーと共有リンクを書く codec そのもの——を段にする。題・話すこと・問い、上へ／下へ・削除・
  「いまの地図にする」・「この地図を表示」・このステップから再生。下書きは `localStorage` `intmap_tour_draft`。
- `js/tours.js`: `?tour=custom&t=…` の codec（`encodeCustomTour` / `decodeCustomTour` / `customTourLink`）、
  `tourQuery` の第 3 引数 `t`、`tourFromSearch` が `t` を返す（宣言ツアーの形は不変）。
- `js/tour-player.js`: `tourFor('custom')`（`opts.t` かページのクエリから）。段を移るたびアドレスに `t` を保つ。
  一覧に「自分のツアーを作る」、自作／Atlas の一時ツアーの再生中に「このツアーを編集」。作成器が言語・HTML 符号化・
  地図への道をプレイヤーの既存の辺から借りる口（`readerLang`・`escapeHtml`・`mapReady`・`openLink`）。
- Atlas: `panel.tourBuilder`（`tourBuilder`。open / addStep / replace / edit / move / remove / title / list / link /
  play / clear）。catalogue は `panel.tour` の塊の 2 番目の断片。行の 7・8 列は `persist` / `explicit`、5 列に
  `tour.draft`（undo が戻せない効果なので、取り消しは可逆と名乗らない）。

## 2. 測った——本番サイトが受け取る URL の長さ

クエリはサーバへ送られる（断片は送られない）ので、上限はブラウザではなくホストの側にある。本番の
`/IntMap/index.html?tour=custom&t=<a×N>` を curl で二分探索した（2026-10-03）:

| path＋query のバイト数 | 応答 |
|---|---|
| 8,192 | 200 |
| 8,193 | **414 URI Too Long** |

⇒ `TOUR_REQUEST_LIMIT = 8192`（`js/tours.js`。失効条件: 別ホストへの移転、ツアーをクエリから出すとき）。
「あと 1 段入らないかもしれない」は、残りがこのツアー自身の 1 段あたりの平均（`t` の長さ ÷ 段数）より少ないとき
——割合を決め打ちしない。超えたツアーにはリンクを渡さない（コピー・共有ボタンを止め、Atlas の `link` は拒否を返す）。
目安（実測・宣言ツアー 3 本 10 段の実際の文と段のリンクを `encodeCustomTour` に通した）: 地図だけなら 1 段 24 バイト、
英語の語り（1 段平均 336 字）で 234 バイト、日本語（平均 163 字）で 284 バイト。⇒ 宣言ツアー並みの文なら 25〜30 段が入る。

## 3. 見つけて直したもの

- **再読み込みで下書きが消えていた**（自作の欠陥、出荷前）: `let draft = readDraft()` が、それが使う `newId`・`str`
  の宣言より前にあり、TDZ の例外を `try` が飲んで空の下書きを返していた。node の検査 ③（新しいインスタンスで
  読み直す）で露見。宣言順を直した。
- `addCurrent({ after })` で存在しない段を名指すと黙って末尾に足していた → `no-step` で拒む。
- `tourFromSearch` に `t: ''` を常に足すと既存の `classroom-tours-checks` ② の形が変わる → 書かれたツアーだけが `t` を持つ。

## 4. 検証

- 段 0: `node --test tests/tour-builder-checks.test.mjs tests/classroom-tours-checks.test.mjs` 13/13。
- 段 1: `check:static` `check:i18n` `check:catalog` `check:capabilities` `check:archfiles` `check:surface` `check:docs`。
- 段 2: 一時 spec（ビルドしたアプリ・ヘルメティック）で、ピッカー →「自分のツアーを作る」→ 2 段（東京・パリ）→
  並べ替え → リンクをコピー → 再読み込みで下書きが戻る → 別ページで読者としてリンクを開く（授業モード、段 1 が
  パリ、→ で段 2・アドレスの `step=2` と `t`・カメラが東京）→「このツアーを編集」で作成器へ → プレビューと Esc で
  作成器へ戻る → 390×844 に収まる、を 1 回通した（2.2 分、pageerror 0）。**spec は残していない**——テスト時間の
  天井（`check:testbudget`）があり、未計測の spec は p75 で課金される。常設の browser 検査が要るなら
  `tests/landing-showcase.spec.js` のツアー区間へ足すのが筋（今回の担当範囲の外）。

## 5. 残したもの

- `teachers.html`・`ja/teachers.html` は `scripts/landing.mjs` の生成物（文面は `scripts/landing-text.mjs`）。
  landing.mjs は別作業が編集中なので、授業ページへの「ツアーを作る」案内節は**見送った**。
- 自作ツアーの語りは作者の文であって、宣言ツアーのような「その日付の記録に照らした検査」は無い
  （作者の主張は作者のもの。地図そのものは codec が書き直した状態だけ）。
