---
title: Cliopatria の «Gothia» が曖昧さ回避ページの QID を出荷していた——同一性の試験の前に「世界についての項目か」を Wikidata のクラス階層に訊く
date: 2026-10-05
internal: 地図の形と名前は変わらない。変わるのは、誤った項目に結ばれていた 103 行が QID（と、それによる訳語・リンク）を持たなくなる・2 名前が正しい項目へ移ることで、別の項目の訳語で名前が出ることがなくなる修正
---

〈依頼〉 `data/hist-clio.js` が Cliopatria の «Gothia»（207–383）に Q422253 を付けて出荷している。Q422253 は
Wikimedia の曖昧さ回避ページ（P31 = Q4167410）。`verifiedQid` は「存続期間が重なる」か「期間が無ければ英語ラベルが
一致する」で通すので、名前と同じラベルを持つ曖昧さ回避ページが通る。構造で直す。

## 0. 測った（2026-10-05）

- `scripts/histclio/wikidata.json` の 1,472 項目すべてについて P31 と、P31 が Wikidata のクラス階層
  （`P31/P279*`）で **Q17379835「Wikimedia page outside the main knowledge tree」** の下にあるかを訊いた。
  **38 項目**が内部項目: 曖昧さ回避ページ 32（Han・Xia・Rus・Angles・Kalinga・Gothia…）、一覧記事 5
  （Median dynasty・Gutian dynasty of Sumer・Hamengkubuwono・Imam of Yemen〈Wikimedia information list〉・
  Factions in the Mexican Revolution）、重複項目 1（Kingdom of Dumnonia——historical country でもあり、
  英語版の記事もこの項目に結ばれているが、Wikidata 自身が「統合待ちの重複」と分類している）。
- 取り直しで P31 以外の事実（ラベル・P571・P576・記事→項目の対応）は **1 件も動いていない**（ドリフト 0）。
  だから下の変化はすべてクラスの規則によるもの。
- 出荷行への影響: **24 の名前/QID の組・103 行**。うち 2 組は同じ行が名指す Wikipedia 記事の項目が試験を通った
  （«White Huns» Q41761342 → **Hephthalites Q26576**・«Western Liang» Q4186404 → **Q994451**）。残り 22 組
  （Gothia 12 行・Mongol Khanate 12・Han 9・Zululand 7・Norse 6…）は**記事そのものが曖昧さ回避ページ**で、
  ほかに身元を述べる記録が無いので QID を持たない（名前と記事は残る）。
- `data/histnames.json` の識別子の欄: 21 QID が落ち（どの記録も問わなくなった）、2 QID が加わり、
  **ほかの行は 1 行も変わらない**。

## 1. 規則（`scripts/build-hist-clio.mjs` `verifiedQid`）

2 つの試験はどちらも「その項目は行と一致するか」を訊いていて、「その項目は世界についてのものか」を訊いていな
かった。内部項目は Wikimedia のページについての項目なので、どんな期間もラベルもそれを描かれた政体にしない。
⇒ どちらの試験より先に、facts の `i`（P31 が内部項目の根の下にある）を持つ項目を拒む。

- クラスの一覧を手で並べない。**根を 1 つ**（`WIKIMEDIA_INTERNAL = 'Q17379835'`）だけ持ち、その下にあるかは
  `--fetch` が Wikidata 自身のクラス階層に `P31/P279*` で訊く。曖昧さ回避・一覧・カテゴリ・テンプレート・重複…
  は全部その下にあり、Wikidata に新しい内部クラスが増えても同じ問いが拾う。
- facts は判定の材料として P31 を `c` に持つ（拒否の理由を読めるように）。
- ⚠ **クラスの問いを訊かずに取った facts では `i` がどこにも無く、拒否は黙って消える。** だから `--fetch` は
  訊いた根を `internal` として記録し、門（`--check`）はそれが無い facts を拒む。

検討して採らなかったもの: 「政体のクラス（Q7275 など）の下にあるか」を要求する肯定側の規則。Cliopatria は
王朝・地域・部族連合も描き、Wikidata の型付けは揺れているので、正しい項目を大量に落とす。依頼の範囲
（内部項目を拒む）を超えるので入れていない。

## 2. `--identities`——QID だけを決め直す（引き算はしない）

QID の判定は同一性についての判断で、合成（数分のポリゴン差分）はどの QID にも依存しない
（`restSheets` が読むのはポリゴンと日付だけ）。そこで判定を `identityOf()` 1 つにまとめ、ビルドと
`--identities` の両方がそれを呼ぶ。`--identities` は出荷行を (名前, Wikipedia 記事) で上流の行に結び直す
——実測で固定リリースの 1,567 鍵すべてが Wikidata の値を 1 つしか持たず、2 つになればこのモードは実行を拒む。
pending の所見を数え直し、`data/hist-eras-rest.js` が記録する「切った相手の hist-clio.js の sha256」を新しい
バイトへ移す（形は同じものに対して切られている）。

- **同等性の確かめ**: 古い facts のままこのモードを走らせると、`data/hist-clio.js`・`data/hist-eras-rest.js`・
  `review.json` が**1 バイトも変わらない**——ビルドと同じ判定である。

## 3. 検査

- `tests/clio-qid-not-polity-checks.test.mjs`: ① 内部項目は、ラベルが一致しても期間が重なっても拒まれる
  ② facts がクラスの問いを訊いて取られている（`internal`）③ 出荷行に内部項目の QID が無く、名前表がそれで
  訳していない。変異: 古い facts に戻すと ② が、古い bundle に戻すと ③ が落ちる（門も 103 件を挙げて落ちる）。
- `npm run check:histclio` が `internal` を要求する。

## 4. 同じ判断がもう 1 か所にあった

名前の欄（`scripts/build-histnames.mjs`）は以前から「**曖昧さ回避ページは記事ではないので落とす**」としていた
（現状仕様 07-map）。識別子の経路だけがそれを持っていなかった——同じ判断が 2 か所にあって片方だけが答えて
いた形で、今回で両経路が同じ答えを返す。名前表の件数（訳語 13,705 → 13,618・識別子 1,265 → 1,246）は
9 言語の出典ページと現状仕様の該当行を `check:docs` に合わせて直した。
