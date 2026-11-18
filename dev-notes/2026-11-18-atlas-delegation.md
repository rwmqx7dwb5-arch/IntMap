---
title: Atlas が大きな依頼を子のモデルに手分けして調べさせる——変わらない約束（契約・実行者・外に置く状態）と、設定で変わる払い方と停止スイッチ
date: 2026-11-18
newsen: Atlas can now split a large request into independent pieces, have worker models research them at the same time with web search, and build its answer and map from what they return.
newsjp: Atlas が大きな依頼を独立な部分に分け、子のモデルに Web 検索つきで同時に調べさせ、その結果から答えと地図を作れるようになりました。
---

〈依頼〉 Atlas にマルチエージェントの基盤を入れる。目的は今回の 5 分の短縮だけではない。将来、モデルの能力・価格・組織の形が変わっても、作り直さずに差し替えられる基盤にすること。利用者との議論で決めた条件は次のとおり。

- 表現（データの形）は今のうちに開いておき、機構は必要になったら足す。
- 記録は木ではなく「事象＋関係」で持つ。状態は実行者の外に置く。
- 子に別枠を与え、払い方（共有枠・独立枠・実費の上限）は設定で切り替えられるようにする。実費はモデル単価×トークンで予約し、あとで精算する。
- 全利用者に出す。守るのは停止スイッチと費用の上限。

## 0. 測った

- **本番台帳 `public.ai_turns`**（2026-11-18 に読んだ。2026-10-04 以降の、提供元を呼んだ利用者ターン 60 件。開発者は台帳の対象外）
  - 最も高かったターンは入力 367,309 トークン（うちキャッシュ 79,461）、出力 1,803 トークン。gpt-6.1-sol の単価で **$0.61**。
  - p99 は入力 345,819、出力 9,716 トークン。1 ターンの提供元呼び出しは最大 12 回で、`TURN_MAX_CALLS` に達していた。
  - これをもとに上限を **$3.00**（約 4.9 倍）にした。親の最悪の場合に、同じ規模の子 2 体を足しても余裕がある。
- **単価**: gpt-6.2-sol（現在の既定モデル）の価格は 2026-11-18 に見つからなかった。第三者の表は 6／6.1 Sol の $2／$10 だけだった。表に無いモデルは最も高い行の単価で数えるので、上限に早く着くことはあっても超えることはない。
- **呼び出し元**: `runTurn` を呼ぶ本番コードは `js/atlas-console.js` の 1 か所だけ。道具の結果がモデルに渡すのは `meta` 由来の欄だけで、HTML の本文は渡らない（`js/atlas-toolsurface.js` `mechanical`）。だから子の結果は `delegated` 欄で運ぶ必要があった。

## 1. 作ったもの

- **基盤 `js/atlas-delegate.js`**（DOM・ネットワーク・グローバルを持たない）
  - 契約: `{goal, returns, inputs}` を受け取り、6 つの状態のどれかで結果を返す。`failed` と `unobservable` は別の答えとして扱う。
  - 事象記録: 追記だけで、種類の付いた関係を持つ。
  - その他: 依存（データとして）、同じ契約の再利用（`reused`）、取消、実行権の事象、記録から読む実費。
  - 実行役 `makeWorkerExecutor`: 形が誤っていたら、何が誤りかを述べて 1 回だけ直させる。
- **能力 `research.delegate`**（`js/atlas-cap-research.js`）
  - 子は読むだけで、地図を書かない。結果は道具結果の `delegated` で Atlas に届く。
  - カードには各仕事の状態だけを出す。
- **サーバ**
  - ai-proxy は `x-intmap-parent-turn` を読む。方式は `delegationPolicy` で決まる（independent／shared／off＝停止）。
  - 子の呼び出しに許すタスクは `atlas_delegate` だけ。`atlas_delegate` も子の呼び出しでしか使えない。
  - 実費は `reserve_ai_spend` で予約し、`settle_ai_spend` で精算する。応答の `meta.costUsd` に実費が載る。
  - 拒否は 409 で名前付きで返す（429 はページが利用者の枠として読むため使わない）。
- **DB**（migration `20261118120000`）
  - `ai_turns.parent_turn_key` を追加。
  - `consume_ai_child_turn` を追加。子の行は課金しない。子の子は作れない。他人の鍵や利用者自身のターンの鍵は借りられない。
  - `ai_turn_spend` と予約・精算の RPC を追加。

## 2. 作らなかったもの（議論で決めた）

- 固定の役割、スケジューラ、子同士のやり取り。
- サーバ側の実行者と、記録の永続化。いまは同じページの中で動く。
- 提供元への要求そのものの冪等化。「意図→完了」の記録だけでは、完了を書く前に止まった場合に二重実行を防げない（利用者の指摘）。受け手の側で重複を除く必要があり、ストリームの replay 鍵（`ai_turn_answers`）と同じ形で足すのが次の段。

## 3. 次の人のための事実

- **単独と委譲の比較はまだ測っていない。** 同じ課題で、正確さ・所要時間・実費を比べるのが次の段。比べるための値は、事象記録（`ms`・`costUsd`・`calls`）と `meta.costUsd` に揃っている。
- **2 体×各 3 回は実測値ではない。** 利用者が決めた実験の出発点で、`ATLAS_DELEGATION_CHILDREN`・`ATLAS_DELEGATION_CHILD_CALLS` で変えられる。
- **開発者アカウントは台帳の対象外。** 子の数・回数・実費の上限は開発者には効かない（`openTurn` と同じ扱い）。停止スイッチだけは開発者にも効く。

## 3b. 検証で見つかって直したもの

- 予約の RPC に届かないとき 500 を返していたので、どの質問も止まっていた（migration より先に関数が配備された場合も同じ）。予約なしで通し、`meta.spend:'unavailable'` とログに残すように変えた。請求額の柵は、失敗時に止まるものがほかに 2 つある。
- `x-intmap-parent-turn` が CORS の許可ヘッダに無かった。ブラウザの事前確認で弾かれ、子の呼び出しは 1 件も届かなかったはず。
- 子への指示文が名乗りを手書きしていた。`personaPrompt(…, {mode:'internal'})` を通すようにした（R285）。
- ai-proxy の写真（`tests/fixtures/atlas-core-split-before.json`）を撮り直した。差分は意図した変更だけ（許可ヘッダ、予約の RPC 呼び出し、`meta` の `costUsd`・`priceKnown`・`spend`）。

## 3c. 容量の上限を上げた理由（check:perf）

- **async**: gzip で +5.2 kB（4,743,807 → 4,749,042 バイト）。うち `atlas-cap-runs` が +5.0 kB。これは委譲の能力の実行部分と、基盤 `js/atlas-delegate.js` の増加で、この PR が買ったものそのもの。
- **eager**: 起動時に読む分（gzip 1,573,348 バイト）のうち、この PR の増分は 77 バイトだけ（能力表の 1 行と、ai-core のヘッダ 1 行）。2026-11-18 に同じ機械で `025caa33`（このブランチの土台の main）をビルドすると、main だけで 1,573,271 バイトになり、すでに上限 1,565,397 を超えていた。上限を引き下げた bot が測ったのは `3f1c208d` で、その後の main で増えた分が台帳に入っていなかった。`perf-budget --update` が超えた行だけを実測まで上げた（eager.gzip・eager.brotli・async.gzip・`atlas-cap-runs`）。

## 4. 検査

- `tests/atlas-delegation-checks.test.mjs`（13 件）は、基盤と実行役を実際に評価する。並列実行、依存、再利用、取消、拒否と応答なしの区別、修復は 1 回だけ、方式の環境変数（未設定を 0 と読まない。単体で評価してこの誤りを見つけた）、単価と実測の上限を確かめる。
- `supabase/tests/49_atlas_delegation_test.sql` は子のターンの枠と鍵、予約と精算を確かめる。
- `00_structure_test` に `ai_turn_spend` を足した。
- `check:capabilities`・`check:catalog`・`check:docs` は緑。
