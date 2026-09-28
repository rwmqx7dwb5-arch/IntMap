---
title: 配備をまたいだタブの遅延チャンク 404——案内は既に出ていたが「新しい版」を確かめずに言っていた。配信中の版を訊いてから文を選ぶ
date: 2026-09-29
---

〈依頼〉ビルド 24107be で開いたままのタブが次の配備（04f3f0c）をまたぐと、`atlas-console-*.js`・
`atlas-geo-resolve-*.js` が 404 になり「[IntMap] lazy module atlasConsole — could not be downloaded」が出て、
その機能が使えなくなった。黙って死なないようにする。

## 0. 測った

- 本番（`2026-09-28T20:19:10Z-b778dd6`）で `atlas-console-*.js` を 404 にして `IntMapLazy.need('atlasConsole')`。
  `need` は `false`、上の console.error が出る。**同時に `vite:preloadError` が発火し、`#im-reload`
  「A new version of IntMap is available.」が出ていた**（390×844 でも `elementFromPoint` は案内の中）。
  ⇒ 「黙って死ぬ」はこの条件では再現しなかった。preload helper は `baseModule().catch(handlePreloadError)`
  で包むので、依存の有無に関わらず発火する。
- ただし listener は**オンラインなら何の失敗でも**「新しい版」と言っていた。同じ版で通信が落ちただけでも。
- 起動時の先読みとクリックで、同じモジュールが 1 回の読み込みで **3 回**失敗した。

## 1. 直した

- `js/lazy-modules.js` に `chunkFailureVerdict`（純関数）と `makeChunkFailureCheck`（1 タブ 1 回）。
  `makeLazyModules` が `window.__imChunkFailed` として公開し、`index.html` の listener はそれを呼ぶだけ
  （行数は変えていない。946 行のまま）。
  - 配信中の `index.html` の `__imBuild` が違う → 「新しい版があります」（従来の文）
  - 同じ／読めない → 「IntMap の一部を取得できませんでした。再読み込みすると再試行します」（en+jp）。
    ⚠ **黙らせない**——失敗した URL の `import()` はモジュールマップに残り、タブの寿命いっぱい失敗する
    （Architecture.md §1.1 の実測）。通知しなければそれこそ「黙って死ぬ」になる。
  - 文書を取れない → オフライン扱い。案内なし、問いは消費しない。
- `cache:'reload'` で取るので、案内の再読み込みは HTTP キャッシュ（Pages の max-age=600）ではなく今の版を読む。

## 2. 選ばなかったもの

- **Service Worker に保持させる**: `sw.js` はタイルしか扱わない。しかも失われるのは**そのタブがまだ
  一度も取っていない**チャンクなので、取ったものの保持では救えない（全チャンクの事前キャッシュは別設計）。
- **前の版の assets を残す**: 再読み込み無しで生き続ける唯一の案だが、Pages の成果物は丸ごと置き換わる。
  直前の版を取り寄せて混ぜる経路と保持期間の設計が要るので、今回はしていない。

## 3. 検査

- `tests/stale-tab-chunks-checks.test.mjs`: 判定を評価（新しい版／同じ版／読めない）、1 タブ 1 回
  （3 同時失敗で取得 1 回）、取得失敗で案内なし・次の失敗で再び訊く。`index.html` の listener と
  案内を切り出して実行（判定へ渡す・`preventDefault` しない・オフラインで何もしない・`load` 前は待つ・
  判定が無ければ従来の案内）、案内の文を en/jp で。
- ビルドした dist を実ブラウザで: 新しい版 → 「A new version…」、同じ版 → 「Part of IntMap could not be
  downloaded…」、文書が取れない → 案内なし（取得 2 回＝問いは消費されない）。
- ⚠ `tests/r209` ② は「exported function は makeLazyModules の 1 つだけ」を要求するので、2 つは
  arrow の export const にした（shell が呼ぶ factory ではなく、失敗の方針）。

## 追補: 新しい大域名 `window.__imChunkFailed` を名指して登録した

`index.html` のインラインの `vite:preloadError` リスナーは import できないので、判定を呼ぶには大域名が要る。
最初の版は型検査のために `/** @type {any} */ (window).__imChunkFailed = …` と括弧で包んでいて、大域名の計器
（`npm run check:surface`）がこれを代入と認識せず、計器を**すり抜けていた**（CI の
`tests/stalled-fetch-and-surface-gauge-checks` ③——AST で数えた `window.X` の代入と登録簿の突き合わせ——が捕まえた）。
素直な `window.__imChunkFailed = …` にし、型は `types/globals.d.ts` の `IntMapPublished` に宣言し、
`node scripts/global-surface.mjs --update` で登録簿に 1 件足した（685 → 686、差はこの 1 件だけ）。
