---
title: 現状仕様書 Architecture.md を案内図と 18 本の章に分ける——1 本 741 KB・6,166 行・直近 101 commit のうち 70 が触るファイルを、節番号を保ったまま docs/architecture/<NN>-<slug>.md へ。Architecture.md は「§ → ファイル」の表だけを持ち、他の文書・コード・テストの「Architecture.md §N.M」は表を通して解決する。移す前の H2/H3 80 節はすべて章の中にバイト一致で在る
date: 2026-10-01
---

〈依頼〉利用者承認済み（2026-10-01）の構造改革。Architecture.md を主題ごとの文書に分割する。目的は ①エージェントが主題の節だけを開ける（それまでは grep で節を引いて読むしかなかった） ②並行 PR が同じ巨大ファイルを触らない。内容は 1 文字も失わない。

## 0. 測った

- 分ける前（`366fca43`）: `Architecture.md` 741,286 バイト・6,166 行・H2 18 本・H3 63 本。`git log -101` のうち **70** が触っていた。
- 先例が 2 つあった。§3 のファイル台帳は `docs/FILES.md`、§7 の大半（レイヤー実装）は `docs/MAP-LAYERS.md` へ、**節番号を保ったまま**移されていた。`scripts/doc-facts.mjs` の `section-refs` は、この 3 本を「1 つの番号空間」として手書きの配列で持っていた。
- `Architecture.md` を名前で読む箇所: `scripts/doc-facts.mjs` の規則 19 個（`app-size`・`edge-functions`・`edge-count`・`migrations`・`serving`・`languages`・`app-shape`・`arch-rounds`・`cesium`・`monitors`・`csp`・`db-tables`・`i18n-open-gap`・`histnames`・`hist-cities`・`capability-count`・`prompt-count`・`histb-count`・`section-refs` ）と、`tests/` の 18 本（読む・変異させる）。

## 1. 決めたこと

- **1 章 1 ファイル。** H2 の節を、その下の H3 ごと `docs/architecture/<NN>-<slug>.md` へ（`01-overview` … `18-area-monitors`）。見出しも本文も**そのまま**で、各章の先頭に「現状仕様書の §N。節番号は案内図と共有している」の 3 行を足しただけ。
- **既存の主題文書には混ぜなかった。** §15 と `docs/TESTING.md`、§16 と `docs/DATABASE.md`、§17 と `docs/SECURITY-ARCHITECTURE.md`、§18 と `docs/AREA-MONITORS.md` は主題が近いが、どの章も既に「手順の正本はあちら」と指していて、書いてあるのは仕様書側の要約と不変条件だった。番号の付いた H2 を番号の無い文書に入れると番号空間が 2 種類の文書にまたがり、表で引けなくなる。
- **`Architecture.md` は案内図**になった: 「この文書の読み方」（書き直した）と、`| §N | ファイル | 要約と H3 の見出し |` の 18 行の表。§3 と §7 の行には `docs/FILES.md`・`docs/MAP-LAYERS.md` も並ぶ。
- **§参照の解決は表が持つ。** `scripts/architecture-spec.mjs`（新規）が、章を `docs/architecture/` から**発見**し（手書きの一覧ではない）、案内図の表から「番号空間を共有するファイル」を導く。`section-refs` の手書きの 3 本の配列はこれに置き換わった——参照側（文書の中の §参照、この回の終わりに 329 件）は 1 行も書き換えていない。
- **規則は仕様全体を読む。** doc-facts の `ARCH` は「案内図＋全章」を順に連ねた文字列になり、文面を測る規則はそのまま章の中を読む。報告は開くべきファイルを名指す（`docs/architecture/10-i18n.md §10.1 says …`）。
- **読んだことを数えて示す。** 新しい規則 `arch-split` が、章が 1 本も読めない・案内図に載っていない章がある・表の行が見出しの無いファイルを指す・案内図に章が戻ってきた、のどれでも赤にし、緑のときは「18 章・N 行・番号空間 21 ファイル」を印字する。`arch-rounds` は章ごとの行番号で読み、読んだファイル数を印字する（案内図だけを読む規則は 60 行を読んで緑と言うので）。`section-refs` は番号空間のファイル数を印字する。
- テストの側: 「`Architecture.md`」を**住所**として持つ変異（`{ file: 'Architecture.md', from: '…' }`）は、`specFileFor()` がその文を今持っている章へ解決する。文面を読むテストは `readSpec()` で仕様全体を読む。

## 2. 内容を失っていない証明

`tests/architecture-split-checks.test.mjs` ①: 分ける前の `Architecture.md`（未 commit のあいだは `HEAD`、commit 後は docs/architecture/ を作った commit の親）の **H2 18・H3 62 の 80 節**が、章のどれかにバイト一致で在る。ただし相対リンクは章が 2 段下に移ったぶん書き換わるので、**両側のリンクを、それぞれのファイルの場所から解いたリポジトリ上のパスに直してから**比べる（分割に使った書き換えとは別の、素のパス計算）。例外は 1 つだけで、名指してある: 案内図の「この文書の読み方」（1 ファイルだった頃の文書の形を述べていたので書き直した）。各 H2 がちょうど 1 本の章に在ることも見る。章の 1 文字を変えると赤になることを確かめた。
⚠ CI は 1 commit だけを clone するので、commit 後はその親が無い。そのときは比較できなかったと**述べて skip** し、空の比較で緑にしない。

## 3. 検証

`npm run check:docs`・`check:static`・`check:agents`・`check:i18n`、および `Architecture.md` を名指す `tests/*.test.mjs` 全部と新しいテストを `node --test` で。

## 4. 残したもの

- 分割は機械で行った（一時スクリプト、commit しない）。main に並行して `Architecture.md` の変更が入った場合、rebase の衝突は「main の `Architecture.md` から分割し直す」で解く。
- js/ のコメント中の「`Architecture.md` §N.M」は書き換えていない。案内図の表で引けるので住所として生きている（`section-refs` が読むのは文書だけ）。
