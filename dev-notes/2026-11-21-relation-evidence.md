---
title: 世界グラフの関係に「確認済み・推定・未確認」と根拠を持たせ、AI が記録にない関係を補完しないようにする
date: 2026-11-21
newsen: Atlas now says whether a relation between two objects is confirmed by a source, inferred by a stated rule, or unconfirmed — and checks a relation against the graph before stating it.
newsjp: Atlasが、2つの対象の関係を「出典が述べている（確認済み）」「規則から導いた（推定）」「記録なし（未確認）」に分けて答え、述べる前にグラフで確かめられるようになりました。
---

〈依頼〉総合技術監査（2026-11-21）。「実際の関係やネットワークを使った横断分析ができ、確認済み・推定・未確認の関係が区別されている」こと。⚠ #1315（識別・同一判断の根拠）の上に積む。

## 0. 先に在ったもの・足りなかったもの
- `world_graph_edges` は `confidence`（high/medium/low）と `source` を持ち、「出典が述べたことだけ・推測は入れない」と書いてある。足りない: **読む側がその区別を持たない**——`research.object` は結び付きを件数でしか返さず、`research.related` の「linked／near／concurrent」は同じ列に並び、`near`（規則で近いだけ）と `linked`（結び付き）の確かさが利用者にもモデルにも見えない。モデルは「港は通常その会社が運営する」で記録にない関係を言える。

## 1. 作ったもの
- **`js/relation-evidence.js`**（純粋）: 状態 3 つと、各々を支えるものが**値**。`confirmed`=出典または証拠記録が名指されている／`inferred`=`basis:'inferred'` で**規則（`rule`）を言える**／`unconfirmed`=記録なし・出典なし・規則なしの「推定」・look-alike（`candidate_match`）・識別子の食い違い（`conflicting_identity`）。**昇格しない**: 推定は出典が述べる新しい記録でしか確認済みにならない（もっともらしさや頻度では上がらない）。
- 配線: `cleanLink` が `basis`／`rule` を保持（述べられた結び付きは既定で、欄を足さない）。`related()` の各項目が `state` と `grounds`（どの根拠か: 型付きの結び付き／共通の記事／近さ〔N km 以内〕／同時期）を持ち、最も強い根拠が勝つ。多段の道は最も弱い辺の状態。`brief()` が各 link に `state` を付ける。`relatedHtml` の各行に状態語。
- **`research.object` の `check:[{rel,ref}]`**: 述べようとしている関係をグラフに**先に訊く**。記録があれば状態と根拠、無ければ「記録なし（存在しない証拠ではない）」。逆向き（`operates`）は `REL_INVERSE` を通して反対側の記録から見つかる。**何も足さない**。能力の説明文が「check を通して返ったことだけを言え・記録のない関係を通常そうだからと補うな」と指示する。

## 2. していないこと（消せる条件つき）
- DB 側（`world_graph_edges`）に `basis`／`rule` 列は足していない——今ある行は全部「出典が述べた」ものなので、`source` 空の行を `unconfirmed` と読めば足りる。推定の辺を**永続化**する書き手（#1316 の網の分析が導く港↔鉄道・都市）が出たときに列を足す。それまで推定は答えの中だけで、グラフには入らない。
- 答えの文章を機械で検査して「述べた関係が check を通っていない」と止める門は無い（散文から関係を取り出すのは推測になる）。防ぎ方は、述べる前に問える道具と、結果に状態が付くこと、説明文の規則。

## 3. 検査
`tests/relation-evidence-checks.test.mjs`（8 件）: 出典のある結び付きだけが確認済み／規則を言えない推定は推定でない／look-alike は確認済みにならない／`cleanLink` の保持／`related()` の状態と根拠／`checkRelations`（記録あり・なし・逆向き・何も足さない）／`brief()` の link 注釈／語彙。

## 4. 追補(CI で赤になった 3 点を直した)
- `stateLabel` が [en, jp] の組を返していたのを、呼び出し側の `L(en, jp)` で解く形へ変えた(隣り合ったデータ枠に翻訳を置かない・check:docs の i18n-open-gap)。
- 呼ばれていなかった `stateWords` を消した(消費者がなく、同じ仕事は `stateLabel` が負う)。
- 「inferred」の和語を既存の `atlas-cap-knowledge` と同じ「推論」に揃えた(1 つの英語キーに 2 つの意味を持たせない)。

- perf: async.raw 15259.8→15336.6 kB・async.gzip 5186.3→5213.0 kB・place-dossier 73.0→77.0 kB へ天井を上げた。関係の状態(relation-evidence)と research.object の check を、関係を読む側の遅延チャンクへ足したため。
