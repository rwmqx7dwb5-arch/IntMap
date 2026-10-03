---
title: nightly の赤を、それを起こした変更へ渡す——spec の reach の発見・範囲と容疑・1 commit ずつ測る bisect
date: 2026-10-03
---

〈依頼〉「修正・穴埋めではなく構造改革」の運用と品質の分野。deep tier は push でも PR でも走らず、nightly が
唯一の読者で、その読者（Issue 1 本）は**何が**落ちたかしか言わない。**誰の**赤かを運ぶ仕組みを作る。

## 0. 測った（着手前）

| 何 | 実測 | 意味 |
|---|---|---|
| 予定実行の CI | 2026-08-08 以降、**緑の晩が 1 つも無い**（直近 6 晩も全部 failure） | 「赤」が常態で、読み手は赤を読まなくなっている |
| 直近の晩（2026-10-01 の run） | 赤は deep の 3 shard ＋集約ジョブ。Issue の本文は 6 テストの名前だけ | 名前はある。変更が無い |
| `tests/restored-layer-before-style.spec.js` | **4 晩連続**（09-28 から）。範囲 `00897520..001f2639` に main の merge が 10 本。Issue のどこにも無い | 退行に持ち主が居ない |
| 同じ spec を手元で単独に（現在の main） | 2 テストとも緑（1.6 分・1.2 分） | CI の失敗は 1 回目「41 層が 60 秒で出ない」、再試行「60 秒で状態に届かない」。単独では再現しない——負荷か隣のテストの可能性。**推測で直さない**（下の bisect が判定する） |
| PR の門に「触ったファイルを守る deep spec」を足したら | 直近 80 merge で中央値 **31 本 / 1,292 秒**（p90 112 本 / 4,885 秒）。パスと import だけに絞っても中央値 5 本 / 76 秒・p90 35 本 / 1,400 秒 | 利用者が #R203〜#R207 で門から出させたものを別の扉から戻すことになる。**採らない** |
| reach の閾値（識別子が現れるファイル数） | 1: 939 語 / 2: 738 / 3: 381 / 4: 261 / 5: 195 / 6: 161…（膝が無い）。閾値ごとの中央値 reach と js/map-ui.js に届く spec 数: ≤1 8・30 / ≤2 12・42 / ≤3 16・52 / ≤4 20・59 / ≤6 27・70 / ≤10 43・91 | 用途（容疑の順位づけ）から 3 に決めた。`--df-sweep` で再測定できる |

## 1. 作ったもの（3 段が 1 本の鎖）

**① `scripts/spec-reach.mjs` ——各 spec が守っているものを発見する。** spec が綴るもの（パス・import・
`window.IntMapX` を**代入する**ファイル・3 ファイル以下にしか現れない設計上の識別子＝`-`/`_`/数字/内側の大文字を
含むもの）から求める。無視語の一覧は持たない——共有された語は「多くのファイルに現れる」という性質で落ちる。
静的な答えなので**順位づけにだけ使い、tier には効かない**。`--changed` は tiers.mjs の #R205 が「人が grep せよ」と
書いていた作業（push 前に走らせる deep spec）を機械がやる。

**② `scripts/nightly-blame.mjs` ——範囲と容疑。** `deep-history.mjs` の分類が退行に `good`（最後に通った晩）と
`bad`（赤の初日）を持つようにし、その 2 commit の間の main の merge を、spec そのもの・reach のファイルに触れたかで
並べる（証拠つき）。ci.yml の `deep-alarm` job が**その晩自身も含めて**（`--include-run`）計算し、Issue に節として足す
（`#123` が PR #123 の timeline に相互参照を残す＝コメントを毎晩撒かずに持ち主へ届く）。`worktree.mjs status` も
退行の下に 1 行で出す。

**③ `.github/workflows/nightly-bisect.yml` ＋ `scripts/nightly-bisect.mjs` ——判定は測る。** `deep-alarm` が退行と
範囲ごとに**1 回だけ**起動する（run 名が鍵なので「もう測ったか」は run の一覧に訊く。一覧が読めなければ何も起動しない）。
範囲の各 commit と対照の晩を 1 台ずつ、**その commit 自身の木・build・データ**（rollback.yml と同じ規則）で、
その 1 テストを単独で 3 回。判定は 6 通り——`culprit`（その PR にもコメント）／`narrowed`／`passes-alone`（範囲の
どの merge も壊していない。shard の中でだけ落ちる＝テストの隔離が欠陥）／`control-not-clean`／`flaky-at-bad`／
`unmeasured`（build できなかった commit は「通った」とも「落ちた」とも読まない）。

## 2. 検査

`tests/delivery-quality-checks.test.mjs`（17 本）: reach の 4 規則と「共有語は証拠にならない」、退行が範囲を持つこと
と窓の端で範囲を作らないこと、容疑の順位、起動が 1 回であること（run-name を実際に展開して鍵と照合）、
plan の 256 件標本（両端を残す）、Playwright JSON の数え方、judge の 6 判定と非単調、入力がシェルに env でしか
届かないこと、`deep-alarm` job の配線（`actions: write`・`fetch-depth: 0`・失敗しても警報を黙らせない）。

## 3. 残っていること

- **nightly-bisect.yml はまだ一度も CI で走っていない**（merge 後に手で 1 回起動して確かめる:
  `gh workflow run nightly-bisect.yml -f test='tests/restored-layer-before-style.spec.js › every layer a link can carry: holding the style back costs no layer' -f good=00897520 -f bad=001f2639`）。
  古い commit の playwright.config.js が `IM_PREBUILT_DIST` を知らない場合は自前でもう一度 build する（遅いが正しい）。
- restored-layer-before-style の赤そのものは直していない。単独で緑なので、bisect の判定を待つ。
- 本番の状態ページ（上流の死活・鮮度・起動時間を読者に見せる）は今回の範囲外。

## 統合時の性能予算（main へ重ね直した後の build）

超えた行だけ `--update` で上げた（増えた理由は上の節）:
- eager.gzip: 1523.9 kB → 1531.8 kB
