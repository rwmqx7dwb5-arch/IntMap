---
title: 組織向けの窓口・相談フォーム・支援のページ——報道/学校/研究の紹介、匿名 INSERT を開けずに相談を受け、寄付者を手作業の照合で名前つきで感謝する
date: 2026-10-03
---

〈依頼〉「求めるのは改善ではなく商品開発、マーケティング、営業。引き算ではなく足し算。全権を委任する。」の 1 本。
売る相手（報道機関・学校/教育委員会・研究機関/NGO・支援者）と、話を受ける窓口と、営業素材を作る。
料金を発生させる変更は利用者の承認事項なので、料金・課金・外部サービスの設定には触れていない。

## 0. 測った（着手前）

| 何 | 着手前 | 意味 |
|---|---|---|
| 組織が IntMap に連絡する経路 | 無い。`LICENSE` §6 は「商用ライセンスは著作権者に連絡」と書くが、連絡先がどこにも無い | 窓口そのものが欠けていた |
| 埋め込み | `?embed=1`（`js/embed-mode.js`）と共有パネルの「埋め込み」タブは実装済み。紹介するページは無い | 作るのは機能ではなく、それを相手に届ける面 |
| 匿名の INSERT | `supabase/tests/14_anon_write_guard_test.sql` の①が **public の全表**について「anon が直接 INSERT できない」を国勢調査で測る。`feedback` / `bug_reports` は監査（2026-09-30）で PostgREST からの書き込みを閉じ、`reader-reports` 経由になった | 依頼の「RLS で匿名 insert のみ」を文字どおり作ると、その監査が閉じた穴を開け直し、門 14 が赤になる |
| 支援者の名前の表示 | `PRODUCT.md` §2.4 に設計だけ。Stripe Webhook が前提で、外部サービスの設定変更＝未承認 | Webhook 無しで成立する形を探す |
| 導入事例 | 記録 0 件 | 事例のページは作らず、見本を「見本」と書く |
| 維持費の金額 | 記録は `operating_stats()`（今月の AI 要求数とトークン）だけ。Supabase の契約額・CARTO の請求は記録に無い | 金額は書かず、実在する費目と記録された数だけを出す |

## 1. 何を作ったか

**相談の書き込み経路は `reader-reports` の 3 つ目の kind（`inquiry`）。** 新しい Edge Function は作らず、
`feedback` と同じ形——Origin・本文の上限・共有の 2 つの bucket・service_role での書き込み——に載せた。
表 `org_inquiries` には **INSERT policy も grant も無い**。語彙（audience 5 語・purpose 7 語）・長さの上限・
返信先の規則・人には見えない欄（`website_confirm`）は `supabase/functions/_shared/inquiry-shape.js` に 1 回だけ書き、
関数・ページの生成器・DB の CHECK がそれに従う（`tests/sales-channels-checks.test.mjs` ① が 3 者を突き合わせる）。
⚠ **返信先は本人が書いたアドレス**——署名済みでも。組織が読むメールはアカウントのアドレスとは限らない。
`user_id` だけは検証済みのセッションから来る（本文からは来ない）。

**支援者の掲載は手作業の照合で。** 支援者が `support.html` から purpose `supporter_listing` の相談を送り、
管理者が Stripe のダッシュボードで寄付を照合してから `supporters` に 1 行書く。同意の時刻＝申し込みの時刻。
金額・決済情報・アドレスの列は無い。anon が読めるのは掲載中の行の表示名・月・ひとことの 3 列。

**ページは生成する**（`scripts/org-pages.mjs`、文は `scripts/org-pages-text.mjs`、en + jp）:
`for-newsrooms`・`for-schools`・`for-research`・`contact`・`support`（各 `ja/`）と、管理者の
`admin-inquiries.html`（英語・noindex）。数字は持ち主から読む——レイヤー数と時計の床（`landing.mjs` の `facts()`）、
Atlas の 1 日の回数（`plans.js`）、埋め込みの大きさ（`EMBED_SIZES`）、保存期間（migration の `purge_org_inquiries`
の既定値）、基図の無料枠（`js/carto-basemap.js` の冒頭）、バックエンドの住所と公開キー（`src/vendor.js`）。
読めなければ生成器が止まる。ページはインラインのスクリプトを持たず（`script-src 'self'` だけ）、
バックエンドへの `connect-src` は話す 2 ページ（contact・support）にだけ付く。

**営業素材** `docs/sales/`: 手引き（区分・経路・相談を受けてからの手順・支援者の掲載手順）、料金の答え、
提案書の骨子、FAQ とその根拠、導入事例の型（公開できる条件つき・現在 0 件）。

**利用規約 第12条・第13条**（`js/legal-text.js`、en + jp）: 埋め込みは料金を請求しない・クレジット行を消さない・
ソフトウェアの商用利用は `LICENSE` に従う／相談は契約を成立させない・寄付は対価の無い支援・支援者は申し込んだ人だけ。
プライバシーポリシーの追記は別の作業が `privacy.html` 側を触っているので、文案を残課題として渡した。

## 2. 構造として直したもの（場当たりにしなかったもの）

- **standalone ページの一覧を手書きから発見へ。** `scripts/js-reachability.mjs` の `STANDALONE_PAGES` は 5 つの名前の
  手書き一覧で、`js/org-page.js` を読み込む 6 つ目のページは「誰も import しないファイル」と判定された。
  名前を 1 つ足すのではなく、**ルートの `.html`（index.html 以外）を数え上げる** `standalonePages()` にした
  （`static-checks.mjs` の同じ一覧の写しもそれを使う）。
- **`data-effect` の markup の母集合に standalone ページを入れた。** `scripts/data-effects.mjs` は index.html と js/ の
  文字列しか markup として読まず、`contact.html` のフォームが宣言する `data-effect` を読めなかった。
  同じ `standalonePages()` を markup に足した。
- 管理画面の id（`auth-submit` など）が `admin.html` と同名だと、片方の宣言がもう片方を覆えない
  （同じ選択子が 2 つの文書に当たる）。新しい画面の id を `aq-` で始まる固有のものにした。

## 3. 残したこと（利用者の判断が要る）

- **営利の報道機関の埋め込みが `LICENSE` §3 の「商用利用」に当たるか**——ページは「埋め込みに料金は請求しない。
  営利で不安なら公開前に相談を」とだけ書き、判断を運営者に回している。方針が決まれば `org-pages-text.mjs` を直す。
- 利用規約 第12・13条の文言（法的な文書の変更）。
- プライバシーポリシーの追記（相談フォームで集める項目・目的・保存期間・削除の申し出）。
- `sitemap.xml` と紹介ページ（about/teachers）からのリンク——どちらも `scripts/landing.mjs` の生成物で別の作業の範囲。
- deploy: migration `20261003150000_org_inquiries.sql` を先に、次に `reader-reports`（`_shared/inquiry-shape.js` を import）。

### プライバシーポリシー追記の文案（`js/legal-text.js` の PRIVACY_JA / PRIVACY_EN に入れる。未適用）

- §1（集める情報）に追加 — JA: 「**お問い合わせ**：お問い合わせページから送信された氏名、返信先メールアドレス、内容、および任意で入力された組織名・役職・ウェブサイト・国または地域。」／EN: "**Enquiries:** the name, reply e-mail address and message you send through the contact page, and the organisation, role, website and country if you give them."
- §3（利用目的）に追加 — JA: 「お問い合わせへの回答のためにのみ使い、メールマガジンや名簿には使いません。支援者として掲載を申し込まれた場合は、寄付を確認したうえで、表示名・寄付の月・任意のひとことを支援者ページに掲載します（金額は掲載・保存しません）。」／EN: "Enquiries are used only to answer you — never for a newsletter or a list. If you ask to be named as a supporter, we show your display name, the month of your gift and an optional line on the support page after confirming the gift (the amount is neither shown nor stored)."
- §6（保存期間）に追加 — JA: 「お問い合わせは受信から 730 日後（迷惑メールと判断したものは 30 日後）に自動で削除します。ご希望があればそれより早く削除します。支援者の掲載はお申し出によりいつでも削除します。」／EN: "Enquiries are deleted automatically 730 days after they arrive (30 days if marked as spam), or sooner on request. A supporter listing is removed at any time on request."
- §4（第三者）は変更不要（保存先は既に記載の Supabase）。

### 共有窓口（`check:surface`）に足した 2 つの辺

`js/admin-inquiries.js` は `admin.html` と同じく**素の script** で、`vendor/supabase-js.js`（UMD）が出す
`window.supabase` を 3 回、`js/safe-html.js` が出す `window.IntMapSafe` を 2 回読む。素の script は import できず、
`admin.html` も同じ 2 つを同じ形で読んでいるので、`node scripts/global-surface.mjs --update` で台帳に記録した
（module 化するなら admin.html と一緒に）。
