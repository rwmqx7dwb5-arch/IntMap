---
title: 寄付の導線を「支援の使い道」から作り直した——支援パネルが Atlas の 1 日の上限とその理由、今月の AI 要求数とトークン数（記録開始日つき・金額と「回答数」は出さない）を示し、控えめな提案カードは上限を告げた瞬間と 7 日目の一度だけ出て、閉じれば 30 日眠る。プランで変わる値は 4 か所の綴りから 1 つの表（_shared/plans.js）へ。Atlas からは「運営費を見る」で届く。有料プランは設計案だけ（未承認）
date: 2026-10-01
---

〈依頼〉利用者の方針（2026-10-01、本人の回答）:「当面は無料＋寄付のまま、いずれ有料プラン」。
⇒ 寄付の導線を商品として作り込み、将来の Pro に向けて構造だけ準備する（課金の実装・料金・契約は発生させない）。

## 0. 測った

**寄付の入口は 3 つで、どれも「何に使われるか」を言っていなかった。** 設定の最後のボタン（`#btn-blueberry`）、
ワークスペースの直通ボタン（`js/workspace.js`）、フィードバックで星 4〜5 を付けたあとの一文（`js/feedback.js`）。
パネル（`#blueberry-modal`）の本文は 3 文で、事業の説明だけ。言語別の Stripe リンク（日本語＝JPY、他＝USD）は
`js/app-body.js` の `stripeDonateURL()` がすでに出し分けていた。

**本番の台帳から何が言えるか**（`supabase db query --linked`、2026-10-01 14:04 UTC、集計だけを読んだ）:

| 列 | 何が言えるか |
|---|---|
| `ai_usage.provider_calls` / `*_tokens` | AI 提供元へ送った要求とトークン。2026-09-29 の migration から記録、最初の非 0 行は **2026-10-01**。今月 **10 要求・入力 140,082（うちキャッシュ 53,863）・出力 4,266 トークン**、未計測 0 |
| `ai_usage.count` | **使えない。** 枠の鏡で返金を差し引いた値。負の行が **25 行・24 日**、最小 **−99,999,938**、2026-07 の合計は **−110,219,626** |
| `ai_turns.succeeded` | 回答した turn だが、表は 1 日で掃く作業台。**月の「回答数」はどこにも記録されていない** |

⇒ 画面に出せる実数は「今月の AI 要求数とトークン数（記録開始日つき・開発者の検証を含む）」だけ。金額は台帳に
無い（提供元はトークンで請求し、単価は使用中のモデルの設定次第）ので出さない。「今月 Atlas が答えた数」は
**出せない**——推計を事実として出すことになる（PRODUCT.md §2.1-3）。

**プランで変わる値は 4 か所で別々に綴られていた**: `_shared/ai-ledger.js` の `PLAN_LIMITS`（質問数）、
`ai-proxy` の `GLOSS_PLAN_LIMITS`（用語解説）、SQL の `monitor_limit()`（監視の件数）、`js/app-body.js` の
`AI_FREE_DAILY`。互いを結ぶものは無かった。

## 1. 支援の使い道（`js/supporter.js`・`public.operating_stats()`）

- パネルを開くたびに「支援の使い道」を組み立てる: Atlas（上限の数はプラン表から、理由は「回答ごとに提供元へ
  払っている」「サイト全体にも 1 日の上限がある」）、今月（RPC の答え）、その他（Supabase と GitHub Pages・金額は
  載せない）。
- `operating_stats()` は**集計だけ**を返す SECURITY DEFINER（アカウントも日別も返さない、`count` は足さない）。
  anon も呼べる——コメントに `ANON MAY CALL:` で理由（pgTAP 11 の規則）。STABLE なので**GET で呼ぶ**——PostgREST は
  GET を読み取り専用の transaction で走らせる。
- 読めなかった月は「読み込めませんでした」、記録が無い月は「まだ記録されていません」。**どちらも 0 と書かない。**

## 2. 提案カード（モーダルではない）

`js/ai-core.js` が読者に「本日の上限」を告げる 4 か所（クリック時の門・askAI の 2 つの門・ai-proxy の 429
`limit`）で `intmap:ai-limit` を出し、`js/supporter.js` がそれを聞く。`turn_calls` と用語解説の枠では出さない
（読者の枠が尽きたのではない）。もう 1 つは**異なる 7 日目**に開いたときの一度だけのお礼。
閉じると 30 日、「支援について」を押すと 180 日、どちらも出ない。ダイアログが開いている間は出さない。
記録は端末の localStorage（`intmap.supporter.v1`）だけ。⚠ この 3 つの日数は**観測ではなく選択**で、
`OFFER` の註がそう書き、失効条件（提案が閉じられたか押されたかの記録ができたら、それに合わせる）を持つ。

地図は止めない: カードは `.im-reload` と同じ上端中央、`--z-toast`（全ダイアログより下）。z-index は
stylesheet ではなく名前つきの層として JS が書く（`z-layers` の台帳の順序を変えない）。

## 3. プラン表（`supabase/functions/_shared/plans.js`）

`PLANS` 1 表に `aiTurnsPerDay`・`aiGlossPerDay`・`monitors`・`offered` の列。**数は 1 つも変えていない。**
`ai-ledger.js` の `PLAN_LIMITS` はその列を引く。import できない 3 つ（ai-proxy の 1 行・SQL・ページの初期値）は
`tests/supporter-funnel-checks.test.mjs` ① が表と突き合わせる（SQL は `monitor_limit` を定義する**最後の**
migration を発見して読む）。購入できるのは `free` だけ（② が `offered` を守る。数そのものは固定しない——
固定すると正しい変更を落第させる番人になる）。
- **採らなかったもの**: DB に `plan_definitions` 表を置いて正本にする——Edge Function が毎回その表を読む往復が
  増え、値が変わるのは料金を決めたときだけ（DECISIONS.md）。
- `ai-proxy` の `GLOSS_PLAN_LIMITS` も `planColumn("aiGlossPerDay")` から引く（#866 を取り込んだ後に 1 行＋import）。
  ① はそれが import であってリテラルでないことを確かめる。`ai-ledger.js` と `ai-proxy` を変えたので、次の配備で
  `ai-proxy` と `monitor-run` を出し直す（値は同じなので挙動は変わらない）。

## 4. Atlas

`panel.operatingCosts`（`operatingCosts`。別名 `runningCosts`・`supportCosts`・`whereSupportGoes`）を足した:
支援パネルを「支援の使い道」で開き、**同じ数を Atlas に返す**（金額は返さない）。`panel.donate` はそのまま。
カタログの 06 ブロックに 1 項目。能力は 147 → 148（到達可能 146 → 147）、文書の数も追随。

## 5. 有料プランの設計案（未承認）

`PRODUCT.md` §2.4 に置いた（新しい文書は作っていない）。原則（いま無料のものは無料のまま・広告なし・寄付は
対価ではない）、有料にしてよいのは**利用ごとに費用が出るものだけ**（Atlas と用語解説の回数・監視）、
料金は**根拠の無い仮置き**と明記（1 回答の費用がまだ測れない——要求 10 件しか記録が無い）、Stripe Billing の
構成（Checkout・Customer Portal・署名を検証する webhook・`subscriptions` 表・`profiles.plan`）、支援者の表示
（Payment Link の任意欄＋同意＋webhook。外部サービスの変更なので作っていない）、法的文書（特定商取引法に基づく
表記・利用規約・プライバシーポリシー）。

## 6. 否定された見立て

- 「`ai_usage.count` の月合計を回答数として出せる」——負の行で否定。
- 「提案は寄付ページへ直接飛ばせばよい」——押した人に使い道を見せずに Stripe へ送ることになる。カードは
  **パネル**を開き、Stripe を開くのは読者のクリックだけ。

## 7. 検査

`node --test tests/supporter-funnel-checks.test.mjs`（11 件）、`npx playwright test tests/supporter-funnel.spec.js`
（4 件: 上限の合図でカードが出て地図を塞がない／閉じたら同じ合図で出ず、眠りが端末に記録される／月の数が記録から
出て、読めないときは「読み込めませんでした」・GET で呼ぶ／Stripe のリンクが言語で切り替わる）。spec は共有の
起動済みページ（`tests/helpers/app.js`）に乗り、RPC は全部ここで答える（本番の migration の有無に依らない）。
実測 4 件で 9.4 秒（起動を除く）。⚠ 最初は「通信失敗」で読めない月を作ったが、supabase-js は GET の通信失敗を
再試行するので 1 件 8.9 秒かかった——PostgREST が「関数が無い」と答える 404（migration 適用前の実際の状態）に替えて 1.1 秒。
## 8. 一緒に直したもの（#866 を取り込んだ後）

- **読み取り専用の rpc は書き込みではない。** `scripts/data-effects.mjs` は `.rpc(…)` を全部書き込みと数え、
  Atlas の `run` という名前を経由して `js/atlas-reading.js` の 3 ボタンが書き込みに届くと報告した。台帳を上げて
  黙らせず、**呼び出しの形**で判定する `rpcIsRead()` を足した——`{ get: true }`（と、オブジェクトの引数を持たない
  `{ head: true }`）は supabase-js が GET/HEAD で送り、PostgREST はそれを読み取り専用の transaction で走らせる。
  関数名では免除しない。同じ規則を別に綴っていた `tests/atlas-outward-effects-checks.test.mjs` の狭い歩行も
  同じ述語を import する（規則が 2 か所にあった）。`tests/supporter-funnel-checks.test.mjs` が 10 の呼び出し形で
  両向きに評価する。
- 既存の 2 件（R147 #13・R500 ⑤）は `ai-ledger.js` の数を正規表現で読んでいた。前者は表を import して評価し、
  後者は `plans.js` の free 行を読む。
- `tests/durations.json` に 28 秒、`scripts/test-budget.mjs` の全体の天井を 5,196 → 5,224（註に較正の算術）、
  `docs/TESTING.md` を 131 本・87.1 分に。
- プライバシーポリシー（`js/legal-text.js`、en+jp）に 2 点: 寄付（決済は Stripe のページで行われ当方は決済情報を
  受け取らない・ログイン中に押した記録を `donations` に保存・アカウント削除で消える）と、端末内の記録（開いた日数・
  案内を閉じた日時。送信しない）。`donations` の記録は以前から書かれていなかった。
- ⚠ `check:datagov`（外部ホストの開示）は `git ls-files` を母集合にするので、未追跡の `js/supporter.js` が
  見えず「`donate.stripe.com` を誰も呼ばない」と赤くなる。commit すれば消える（一時 index に `add -N` して緑を確認）。

## 起動費の天井を上げた理由

支援の提案カードは `intmap:ai-limit`（上限を告げた瞬間）と起動時の「異なる 7 日目」を聞くので、`js/supporter.js` と `_shared/plans.js` は起動時から読まれる（eager.modules +2）。カードの CSS（eager.cssRaw）と en/jp の 17 キー（ui.jp チャンク）もそれに伴う。どれもこの変更の分で、`node scripts/perf-budget.mjs --update` で超えた行だけを上げた。eager.raw / brotli にはこの機械の計測差が乗っている可能性があり、天井は main の実測で bot が下げる。
