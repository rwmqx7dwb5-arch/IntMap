---
title: 歴史の束をメインスレッドで評価しない——リングプールした 8 本の記録を <script> で注入していたので、最初の時間旅行で 13〜41 MB のオブジェクトリテラルの評価と全リングの割り当てがページで起きていた。js/hist-bundles.js が束を Worker に置き、「その日に有効な行」「エポックの境目」「時代の 1 枚」を向こうで答え、ページへは描く行と環だけを同じ形の疎な写しとして送る
date: 2026-09-30
---

〈依頼（構造改革）〉歴史のデータ束をメインスレッドで評価している構造を変える。監査の実測（`dist/data`）:
`hist-admin1.js` 41.5 MB・`hist-admin2.js` 40.7 MB・`hist-borders.js` 34.0 MB・`cshapes.js` 13.0 MB・
`hist-eras.js` 10.6 MB。注入箇所 `js/time-borders.js`（3 か所）・`js/time-admin1.js`（束と穴埋め 2 本）・
`js/war-layer.js` がどれも `document.createElement('script')` で読み、Worker 参照は 0。

## 0. 測った

**仕組みだけ**——Playwright Chromium、何も描かない同一オリジンの静的ページで、旧＝`<script>` 注入、
新＝`js/hist-bundles.js` で開いて最初の旅行が描く瞬間を 1 つ訊く。新しいページ 3 回の中央値。
長いタスク（最長 ms）・使えるまでの壁時計（ms）・GC 後のページのヒープ増分（MB）。

| 記録（訊いた瞬間） | 1×: 旧 最長 / 壁 / ヒープ | 1×: 新 | 4× 減速: 旧 最長 / 壁 | 4×: 新 |
|---|---|---|---|---|
| cshapes.js（1900-06-15） | 0 / 230 / 27.3 | **0** / 148 / **10.3** | 259 / 421 | 97 / 430 |
| hist-borders.js（1800-06-15） | 90 / 632 / 77.9 | **0** / 431 / **12.5** | 561 / 1,488 | 58 / 736 |
| hist-eras.js（1000 年の 1 枚） | 57 / 234 / 28.2 | **0** / 148 / **1.8** | 259 / 443 | 114 / 291 |
| hist-admin1.js＋穴埋め 2 本（1900-06-15） | 158 / 960 / 100.1 | **0** / 524 / **16.8** | 725 / 1,581 | **0** / 749 |
| hist-admin2.js（1900-06-15） | 162 / 1,172 / 86.1 | **0** / 474 / **21.1** | 913 / 2,131 | 52 / 678 |

ページが受け取ったもの（新）: cshapes 151 行・環 1,592/2,165（24 通）／hist-borders 163 行・1,479/3,607（30 通）／
時代の 1 枚 132 地物・603/8,826（4 通）／第 1 層 688 行・1,838 環（37 通）／第 2 層 4,158 行・6,483/23,416（42 通）。

- **4× で残る 52〜114 ms の 1 本は、束でも写しでもない。** トレース（`RunTask` の子）で cshapes の
  それは `ResponseBodyLoader::DidFinishLoadingBody` 114.6 ms、うち `TextResourceDecoder::Decode` 75.6 ms
  ——ブラウザの読み込み器が応答の完了時に行う処理で、`content-type` を `application/octet-stream` に
  差し替えると decode が消えて 33.7 ms になった（計測器が Network ドメインを有効にしているため、
  DevTools の外で同じだけ払うかは確かめていない）。写しの受け取りは CPU プロファイルで第 1 層 37 通
  合計 205 ms（4×）＝1 通約 6 ms で、どれも長いタスクではない。
- **アプリ全体では長いタスクの合計はほとんど動かない。** 同じ手順をアプリで（新しいページで年を
  1900・1800・1000 へ、および 1900 で z7 まで寄せて第 2 層）測ると、ヘッドレスの地図描画（ソフトウェア
  GL）が 1 本 200〜500 ms の長いタスクを旅行 1 回に 25〜80 本出しており、束の評価はその中の 1〜2 本に
  すぎなかった。変わったのは**ページのヒープ**で、GC 後の増分は 1×: 1900 245〜268 → 88〜92 MB、
  1800 245〜269 → 88〜89、1000 247〜266 → 45〜69、z7（第 2 層まで）367〜369 → 116。4×: 230 前後 →
  23〜51、z7 336 → 86。z7 は 4× の最長も 1,751〜1,839 → 1,315〜1,444 ms、準備完了 32〜37 → 31〜33 s。
  ⚠ 束そのもの（41 MB 級の JSON を parse した値）は Worker が持つので、**タブ全体のメモリは減っていない**
  ——減ったのは描画するスレッドが抱える量である。
- ⚠ **測定中、このマシンは別セッションの負荷で CPU 使用率 84〜95% だった。** 上の表は旧と新を
  同じシナリオの中で交互に走らせた（負荷の偏りを両者に同じだけ掛けるため）。アプリ全体の 2 回ずつの
  値は幅として書いた。測定器は `scratchpad` の使い捨てで、リポジトリには置いていない。

## 1. 構造

- **`js/hist-bundles.js`（`window.IntMapHistBundles`）が唯一の扉。** `open({file, global, gaps})` が
  束のバイトを `js/fetch-deadline.js` の `readWithin`（`clockFor`・idle 時計。classic script なので
  `window.IntMapFetchWithin` 経由）で読み、**バイトのまま Worker へ移譲**する。Worker は `window.__X=` を
  確かめて `JSON.parse` し、束を保持する。ページは本文を decode も parse もしない。
- **全行を歩く問いは Worker が答える**: `at(t, end)`（その日に有効な行。CShapes は `inclusive`、
  OHM 系は `exclusive`）・`during(t0, t1)`（戦争の層）・`snap(y)`（時代の 1 枚）・`edges(end, lo, hi)`
  （エポックの境目。CShapes は終わりの翌日、OHM 系は終わりそのもの）。述語は `histJob` の 1 か所で、
  `js/time-borders.js`（`csFC`・`hbFC`・`csBounds`・`hbBounds`）と `js/time-admin1.js`（`fcAt`・`bounds`）
  から写しが消えた。
- **ページは束と同じ形の疎な写しを持つ**（`h.data`: `rings`・`feats`・`dates`・`snaps` と上位の値）。
  答えに要る行と環は、答えより先に `SLICE_POINTS`（8,000 対。超える前に切る）ずつ届き、**1 回だけ**
  送られ、**受け取った配列は差し替えない**。だから描画・線（`js/border-coast.js` の run と詳細境界の
  指紋）・ラベル・クリック（`geomAt`・`idAt`）・`coverage()`・Atlas の `currentFC()` は前と同じ行と
  同じ環を同じ索引で読む。
- **穴埋め記録の継ぎ足しは Worker へ移した**（`js/time-admin1.js` の `addGaps` をそのまま）。
  `h.data.gapPools[gi].view` がその記録自身の索引で見た写しで、`gapLinesFor` と印はそれを読む。
  出典表記は継ぎ足しが運ぶ `gapSrcs` から組む（束はもう `window` に無いので、`window[e.global].src` を
  読んでいたら表記が Wikidata だけに縮むところだった）。
- **`js/border-coast.js`**: 時代帯は collection を丸ごと渡すので、印は環の同一性で引いていた
  （`window[global].rings` を歩く索引）。ページの環は扉の `ringOrigin(ring)` が「どの束の何番目か・
  その束の長さ」を答えるので、それで引く。詳細境界の束名も `globalOf(写し)` で知る。
- **`js/war-layer.js`**: 同じ扉・同じ `open` で CShapes を開き、全戦争の期間の和を `during` で 1 回だけ
  訊いて、`entitiesAt` はその中から日付で選ぶ（写しを丸ごと歩かない）。
- **形式・ビルダー・門は変えていない**（厳密な JSON なので Worker は `JSON.parse` するだけ）。
  `data-assets.json`・`sw.js`・CSP（`worker-src 'self' blob:`・`connect-src 'self'`）も変更不要だった。
- **Worker が作れない・死んだとき**は同じ `histJob` をページで走らせる（死んだら同じ写しへ開き直すので
  描かれたものの同一性は変わらない）。束が既に `window` にある（node の足場）ときはそれをそのまま使う。
- 起動費用: eager モジュール 286 → 287（`tests/perf-baseline.json` の `modules` 1 行だけ）。eager raw
  +8.8 kB（許容幅の中）。扉は時間旅行より前に存在しなければならないので eager に置いた。

## 2. 同一性（「年を動かしたときの描画結果が前後で同一」）

旧 dist と新 dist を同じ手順で開き、年を -200・1000・1600・1871・1900・1918・1945・2000 の順に動かし、
各年で **`IntMapTimeBorders.currentFC()`・`IntMapTimeAdmin1.currentFC()`・地図の source
`imtb-src`・`imtb-ln-src`・`imtb-lbl-src`・`imta-src`・`imta-ln-src`・`imta-gap-src`** の地物列を
JSON にして FNV-1a で要約し、さらに地域（日本・欧州・南北アメリカ・インド）ごとに外接矩形が重なる
地物の名前の集合を取った。加えて 1900 年 z7（中欧）の第 2 層 `imta2-src`・`imta2-ln-src` と、
戦争の層 WW1（1916-07-01）・WW2（1942-11-19）の `ww1-src`・`ww2-src`。

**86 項目すべてバイト一致**（最終ビルドでもう一度取り直して 86/86）。例: 1900 年＝国境 151・区分 688・
線 126・ラベル 154・区分の線 630・穴埋めの線 51、1871 年＝国境 168・区分 665（うち日本 80）、
-200 年＝国境 179・区分 3、第 2 層 4,032 地物・線 3,980、WW2 172 地物。

node 側の回帰（`tests/hist-bundles-off-main-checks.test.mjs`）は同じ主張を**モジュールを 2 通りに
走らせて**確かめる: 束を `window` に丸ごと載せた旧い形と、扉を通す新しい形で、`js/time-borders.js` と
`js/time-admin1.js` が書く collection と線が 8 つの年で一致すること。

## 3. 検証

- 回帰 `tests/hist-bundles-off-main-checks.test.mjs`（8 本）。変異で確かめた: 排他端を包含端に
  変えると ① が、穴埋めの写しへ環を入れないと ④⑦ が赤くなる。
- 形の変わった既存の検査を、**同じ主張を実装に訊く形**へ直した: `tests/history-era-borders-checks`
  #R518 ②（選別は扉の実 job で評価）、`tests/news-timeline-checks` R421 #1/#7/#8（エポック索引を
  束の規則と突き合わせて評価。綴りの検査 3 本を置き換えた）、`tests/history-admin-tiers-checks`
  #R705（`load` を持ち上げて扉を通す）、`tests/history-admin-coverage-gate-checks` #R719 ⑥・
  `tests/r530-checks` ⑫（継ぎ足しと読み込みの場所）、`tests/vendored-runtime-scripts-checks` ⑧
  （例にしていた 2 ファイルが注入をやめたので、合成の 1 ファイルと `js/border-coast.js` に）。
  spec: `tests/r145.spec.js`・`tests/r146.spec.js` はデータの検査なので束を自分で読み、
  `tests/r530.spec.js` は第 2 層を「要求したか」を扉に訊く（束はもう `window.__HISTADM2` に載らないので、
  z6 未満で「取りに行っていない」ことを見ていた `!!window.__HISTADM2` は常に偽＝無意味になっていた）。
- node の足場 `scripts/histeras/time-borders.mjs` と、`js/time-borders.js` を評価する 4 本の検査は
  `js/hist-bundles.js` も評価する。

## 4. 残った問題

- 4× 減速で、読み込み完了時のブラウザ内部の処理（上の `DidFinishLoadingBody`）が 52〜114 ms の
  長いタスクを 1 本残す。バイトの取得を Worker 側へ移せば消える見込みだが、そのためには期限つきの
  読み手（`readWithin` の idle 時計）の 2 つ目の実装が要る——`fetch-deadline` の規則が禁じる形なので
  採らなかった。
- アプリ全体の長いタスクは地図の描画が支配しており、この変更の対象外。
- ⚠ 否定した見立て: 「アプリで年を動かしたときの長いタスクの大半は束の評価」——ヘッドレスの測定では
  描画のほうが桁違いに多かった。束の評価そのものは 1× で 57〜162 ms、4× で 259〜913 ms の 1 本で、
  それは消えた。

## 公開名

`window.IntMapHistBundles` を 1 つ足した（`check:surface` の台帳 +1）。歴史の束 8 本を読む唯一の扉で、`time-borders`・`time-admin1`・`war-layer`・`border-coast` の 4 つの読み手が同じ 1 つを引く——読み手ごとに束を `window` から直接読んでいた 8 つの名前（`__HISTB` ほか）の代わりである。
