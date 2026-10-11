---
title: 3-D volume の夜間テストは AWS の地形タイルの速さを測っていた——地面はテストが答え、待ちは全部条件に
date: 2026-10-11
internal: テストの測り方だけの変更で、地図にも読者にも見える変化は無い
---

〈きっかけ〉夜間 deep tier の台帳（`node scripts/deep-history.mjs`）で、`tests/r170.spec.js` の
「Measure ▸ 3-D volume draws a real-scale box and honours the typed altitudes」が直近 14 晩で
赤 1・再試行で通過 5。それより前にも同じ揺れが 6 晩あった（2026-09-01〜09-21）。

## 0. 測った（6 晩の job log）

| 晩 | 結果 | 落ちた所 |
|---|---|---|
| 09-27 | 再試行で通過 | `:147` 4 回クリックして `points` が 0 |
| 09-28・10-04・10-05・10-08 | 再試行で通過 | `:174` 3-D 地形を ON にしたあと `ground > 0` を 30 秒待って timeout |
| 09-29 | 赤 | `:174` 同上（1 回目も再試行も） |

製品側は時間でも回数でもなく描画のイベント（`sourcedata`・`render`・`idle`・`error`）で地面を追う
（`js/volume3d.js` の `chaseGround`）。同じ夜、同じ DEM 経路の他の spec は緑。30 秒間 0 のままだったのは、
**実網の AWS terrarium タイルが届かなかった**から。この spec は実網に依存していた。

## 1. 直し方（テストだけ）

- `tests/helpers/network.js` に `terrariumTile(m)`（全画素が m メートルにデコードされる 256×256 PNG）と
  `answerTerrarium(target, m)`（`js/dem-source.js` の全エイリアスに答え、止める関数を返す）を置いた。
  `tests/keyboard-and-offline.spec.js` が自前で持っていた同じ PNG 生成器（灰 0x80＝128.5 m）はこれに置き換えた
  （バイト列は同一）。写しが 2 本になるのを避けた。
- r170 の 3-D volume は地面を 1,000 m で答え、**その値が読まれたこと**（|ground − 1000| < 1）を確かめる。
  こうすると「テストの答えが実際に使われた」ことまで証明される（実網の富士なら落ちる）。共有ページなので
  ルートは `finally` で外す。
- 固定の待ち（2 s・200 ms×4・500 ms・400 ms）は全部、それが待っていたものの条件に置き換えた
  （頂点の数・base/top/painted・ground・painted=false）。待ちが切れたときは `groundState`・`groundError`
  を含む状態を出すので、次に落ちたら log だけで原因を言える。
- 閾値（< 1.5 m）は動かしていない。

## 2. 確かめた

`IM_TIER=all` でこの spec と keyboard-and-offline の 11 件が緑。3-D volume は単独でさらに 3 回、4 回とも緑
（本体 24.6 s。従来は 1 回目でも 54〜60 s）。check:static・check:testbudget は緑。
