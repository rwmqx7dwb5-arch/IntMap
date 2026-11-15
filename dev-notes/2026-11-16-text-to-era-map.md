---
title: 文章を貼るとその時代の地図になる——Atlas が読み、IntMap が文中にあるかを照合し、歴史上の名前で置く（time.textMap）
date: 2026-11-16
newsen: Paste or attach a historical text — a chronicle, a travel diary, a war record — and Atlas places its places on the map of the year the text states, using historical city names and ancient place records first. A year the text does not state is only offered, never applied.
newsjp: 史料・紀行文・戦記などの文章を貼るか添付すると、Atlas が文中の地名を、その文章が述べる年の地図（国境・地方区分・当時の都市名）に置きます。歴史都市名と古代の地名の記録を先に引き、文中に無い年は提案するだけで適用しません。
---

〈依頼〉史料・紀行文・戦記・教材などの文章を貼ると、Atlas が地名と時代を読み取り、その時代の地図の上に地名を置く。既存の部品で組み、
新しい AI 呼び出し経路を増やさない。解決できない地名は解決できなかったと明示し、年が文中に無ければ年を捏造しない。

## 0. 利用者が決めたこと（AskUserQuestion）

- **年の根拠**: 時計を動かすのは文中の語句を根拠にできるときだけ。作品の成立年のように文の外から分かる年は「推定・文中に記載なし」の
  ボタンで示し、押したときだけ移る。
- **複数の年**: 1 時点に合わせ（Atlas が理由を述べる）、文中の他の年はボタンで並べる。
- **UI の入口**: Atlas の入力欄にテキストを貼る／テキストを添付したときに出るチップ「当時の地図に置く」。

## 1. 既にあったもの・足したもの

既にあった: 「場所＋時刻」の読み（`js/where-when.js`。和暦は ICU、歴史都市名と Pleiades の候補 `histCandidates`）、地図説明を 1 回で描く
`map.compose`（台帳 → ジオコーダ → ウェブ確認、未解決は名前で返す）、会話に残る添付（`ATTACH_LOG`）。欠けていたのは **(a) 複数の地名を
その年の名前で引く段**（compose は今日のジオコーダにしか訊かず、「江戸」「Bibracte」を今日の問いとして解いていた）と **(b) Atlas が読んだ
ものを文章と照合する所**。

- `js/where-when.js` `placeAt(name, era)` — 全名一致だけ（前方一致は打鍵者への提案であって文の読みではない）。同じ場所の複数記録は
  歴史都市名自身の同一性検査（`samePlace`）で 1 つにまとめ、別の場所が 2 つ以上なら `ambiguous` で候補を返す。
- `js/atlas-map-compose.js` — `a.era` があると台帳の次に `placeAt`（文中の綴り、次に Atlas の `as`）。`ambiguous` は `country` が無ければ
  ジオコーダにも訊かず未解決（今日のジオコーダは黙って 1 つを選ぶだけ）。凡例の各行に出所。`era` が無ければ挙動は変わらない（検査で確認）。
- `js/atlas-text-map.js`（新）と能力 `time.textMap` — 照合・時点・ボタン。入力欄のチップは `js/atlas-console.js` の既存行の中で（行の天井）。

## 2. 年を捏造しないための線

引用（`quote`）が文中に無ければ時計は動かない。引用を暦で読めるとき（「元禄二とせ」→ 漢数字と「とせ」を年を数える位置だけ数字に直して
元禄2年 → 1689）は暦の読みが正で、Atlas の `read` が食い違えば拒む。暦で読めない引用（«L. Pisone, A. Gabinio consulibus»）は Atlas の
読みを使い、凡例が「Atlas が 58 BC と読みました」と述べる。

## 3. 測ったこと

- 実データ（`data/hist-cities.json`・`data/hist-places.json`）で: 江戸@1689 → 東京の座標（歴史都市名）、Bibracte → Pleiades（ジオコーダに
  訊かない）、Alexandria → 同梱の Pleiades に 5 件あり `ambiguous`。
- ⚠ 同梱の Pleiades には Lutetia・Genava・Massilia が無い（2026-11-16 実測）。これらは Atlas の `as`（Paris・Geneva）で今日の地名辞典に
  訊き、凡例が「Atlas の同定 → … · 現代の地名辞典」と書く。
- 回帰: `tests/text-to-era-map-checks.test.mjs`（奥の細道の旅立ち・草加、ガリア戦記 I.6–7・I.23 の実文で評価）。
