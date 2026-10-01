---
title: 共有リンクの復元が戦争の層に時計を奪われていた・紀元前 3000 年のエラムが名前を外されていた——復元が時刻を持ち、成立年は史実の年と照らす
date: 2026-10-01
---

〈依頼〉landing-showcase の作業が実測した 2 件。⑴ 見本 `ww2-1942`（1942-11-01）が 1939-08-23 で開いた
（朝鮮戦争も同形）。⑵ `data/hist-eras.js` の紀元前 3000 年の枚に Elam があるのに、#868 以後のビルドでは
地図に Elam の名前が無い。

## 0. 測った

### ⑴ 時計

- 見立て（showcase 側の記録）:「復元は +700 ms で行を点け +900 ms で時計を合わせる。戦争の層は
  `data/wars.json` 到着**後**に時計を動かすので、到着が 900 ms より遅いと戦争が勝つ」。
- ⚠ **この見立ては、そのままでは再現しなかった。** `js/war-layer.js` は到着後に時計を**読んでから**書く
  （読みと書きの間に await が無い）ので、到着が遅ければ時計はもう 1942 で、期間内として何もしない。
  `wars.json` を 6 s 遅らせた新規起動・同じタブでの 1920→1942 の復元、どちらも 1942-11-01 のまま（spec の下書きで実測）。
- **再現した形: 復元が重なったとき。** landing-showcase の spec は見本を同じタブで
  `IntMapBookmark.restore({shared:true})` で次々に開く。前の復元の段（層 700/1800/3200 ms・時計 900 ms）は
  タイマーで、**新しい復元が始まっても走り続けていた**。前のリンク（`l=dl-ww2&tt=1942-11-01`）の
  3200 ms の層の段が、新しいリンク（`tt=1985-07-01`）が消した戦争の行を**新しいリンクの時刻で**点け直し、
  その印付きのチェックを `js/layer-time-kernel.js` の門が「読者の操作」として通し（`__syn` しか見ていなかった）、
  戦争の層が時計を記録の初日へ動かした。**実測: 1985 を開いたのに 1939-08-23 で終わった。**
  showcase の記録の「1985 年の見本で West Germany が無かった回は、直前の見本が時計を 1939 年へ戻していた」と同じ形。
- 根本原因は 2 つ:
  - `js/map-ui.js` restore() — 段取りが世代を持たず、古い復元の段が新しい復元の上で走る。
  - `js/layer-time-kernel.js` gate（`!cb.__syn && entersOnTick`）と `js/war-layer.js` toggle — 「行が点いた」を
    すべて読者の選択として扱い、復元が述べている時刻の上に戦争の初日を書く。
- 全数: 層が点いた瞬間に時計を動かすのは `js/layer-time-decl.js` で `entry` を宣言した 6 行
  （ww1・ww2・korea・vietnam・mideast・yugoslavia）だけで、全部 `js/war-layer.js` の 1 か所
  （`tests/world-at-time-checks.test.mjs` ① がその集合を固定している）。カメラを動かすのは `js/layer-home.js`
  だけで、そちらは既に `__imRestored` を使い切って飛ばない。地球回転（`beta-dl-spin`）はカメラを動かすこと自体が
  その層の機能なので、この規則の対象にしていない。

### ⑵ エラム

```
node scripts/hist-fidelity.mjs --year -3000 --in 40,20,65,40
data/hist-eras.js: sheet -2999 drawn for -3000 — 5 named shape(s) in the box
    Elam   ✂ 名前を描かない（Q128904 Elam が -2699 に成立）
```

- **形は消えていない。外れたのは名前だけ**（#868 の規則どおり、形は上流のまま描かれ、カードが理由を述べる）。
- 外したのは `data/hist-era-spans.json` の行 `Elam → Q128904, s:-2699`。Q128904 は確かに Elam（ラベル Elam、
  終焉 -538＝前 539 年）で、識別子は正しい。誤っていたのは**成立年**: Wikidata の前 2700 年は古エラム期の始まりで、
  エラム文明は原エラム期（前 3200 年頃・スーサとアンシャン・原エラム文字）から数える。**行の `history` の文自身が
  「c. 3200 BCE」と書いていたのに、門は「Wikidata がその年を述べるか」しか訊いていなかった。**
- 同じ形（成立年が文の年より遅い）を全 59 の成立側の行で調べた:
  - Elam: 前 3000 年の枚で −3199..−2700 を外していた（史実が在ったと言う年）。
  - Khanate of the Golden Horde: Wikidata 1243、文は「1242-43」。1279 年の枚で 1242 年を外していた。
  - Xiongnu: Wikidata 前 300 年、文は「前 318 年に初めて記録に現れる」。ただし外していた年は −448..−361 で、
    どちらの年よりも前——**地図の上では誤りは無い**ので行は残す（`hs: -317`）。
  - 残り 56 行は文の年と `s` が一致。

## 1. 直した

- `js/map-ui.js` restore(): 復元ごとに世代（`restoreGen`）を取り、全段を `later()` に通す。新しい復元が
  始まると古い復元の残りの段は何もしない。hashchange で途中に来たリンクを溜めて後で適用する既存の挙動は変えていない。
- `js/war-fronts.js`: 行の `change` の瞬間に復元の印（`__imRestored`）を読み、**使い切って**
  `toggle(id, want, {restored})` で渡す（`wars.json` 到着後に読むと、その間に読者が点け直したかが分からない）。
- `js/war-layer.js` toggle: 時計が期間外のとき、読者が点けたなら従来どおり初日へ動かし、**復元が点けたなら
  動かさない**——行を隠し、時の門（`IntMapLayerTime.ready()`）に任せ、時計が記録に入った瞬間に描く（`awaitClock`）。
- `js/layer-time-kernel.js` gate: 「読者の操作なら時計を動かしてよい」の判定に `!cb.__imRestored` を足す。
  復元のチェックは他の層と同じく保留され、復元が合わせた時計が記録に入ったときに配られる。
- `data/hist-era-spans.json`: 成立側の行に **`hs`**（その行の `history` が単位を置く最も早い年）を値として足し、
  Elam と Golden Horde の成立側を `refuted`（`date-disputed`）へ移した——「Ur」の前例と同じ扱い。
  ⚠ その結果、Elam は前 5000 年・前 4000 年の枚でも名前が出る（行が外していた年）。前 3200 年の境界を置くには
  地図が「Wikidata ではなく史実がそう述べる」とカードに書く必要があり、`js/time-borders.js` の `blankNote` は今
  「Wikidata が述べ、史実が一致する」としか言えない。**IntMap が誰も述べていない日付を地図に書かない**ほうを取った。
- `scripts/hist-fidelity.mjs`（`check:histfidelity`）に 3 規則:
  `era-span-row-no-history-start`（`hs` が無い）／`era-span-row-history-start-unsaid`（文が `hs` の年を述べない。
  BCE・範囲・「As «…»」の別名行を読む）／`era-span-withholds-history`（地図が `hs` 以降の年で名前を外す）。
- 見本 `ww2-1942`・`korea-1950` の `withheld` を外す作業は、`js/showcase.js` がまだ main に無い（#873）ので
  していない。

## 2. 検査

- `tests/restore-clock-and-elam-checks.test.mjs`: 前 3000 年に Elam が名前つきで出る／出荷した台帳が緑で、
  全成立行が `hs` を持つ／**出荷時の欠陥（s −2699・hs −3199）を戻すと `era-span-withholds-history` が
  −3199..−2700 を名指して赤**／`hs` 欠落・文に無い年で赤／文の読み方（「318 BCE」は 318 ではない等）。
- `tests/restored-layer-before-style.spec.js` ⑥（新しい spec は作らず、共有リンク復元の既存の 1 起動に足した）:
  (a) `wars.json` を時計の段の後まで止めても 1942-11-01 のまま、層もその日を描く。
  (b) 1942 のリンクの直後に 1985 のリンクを復元して、時計 1985・戦争の行 OFF。修正前の実装では
  1939-08-23 で終わる（下書きで実測）。最後に、読者のチェックは今も記録の初日へ時計を動かす。
