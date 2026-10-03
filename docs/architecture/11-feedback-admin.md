# IntMap — 現状仕様書 §11 フィードバック・寄付・管理機能

> **現状仕様書の §11。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §11.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 11. フィードバック・寄付・管理機能

- **フィードバック**：`feedback` テーブル（書くのは Edge Function `reader-reports` だけ。§6.2）。`recordLogin()` が本物のログインを数え、3回目に既存モーダルを
  1回表示する（設定からはいつでも開ける）。
- **寄付**：Stripe リンク（言語別。日本語の画面は JPY、他の言語は USD のページ）。リンクの宣言は
  `js/supporter.js` の `STRIPE_DONATE`、どちらを出すかは `js/app-body.js` の `stripeDonateURL()`。
  押した記録（意図）は `donations` テーブル（支払いそのものは Stripe が持ち、IntMap には届かない）。
  - **支援パネル**（設定 ▸ 情報とサポート ▸ サポート、`#blueberry-modal`）は開くたびに**「支援の使い道」**を
    組み立てる（`renderSupportCosts`）——Atlas の 1 日の上限（プラン表 `_shared/plans.js`）、今月の AI 要求数と
    トークン数（`public.operating_stats()`。記録開始日つき・IntMap 自身の検証を含むと明記）、その他の運営
    （Supabase と GitHub Pages）。**金額は出さない**。読めなかった月は「読み込めなかった」と出し、0 にしない。
  - **提案カード**（`#supporter-offer`。モーダルではない・地図の操作を止めない）は 2 つの瞬間にだけ出る:
    Atlas の 1 日の上限を告げたとき（`js/ai-core.js` が `intmap:ai-limit` を出す。1 日 1 回まで）と、
    異なる 7 日目に開いたとき（一度だけ）。「今はしない」で 30 日、「支援について」で 180 日、どちらの提案も
    出さない（`OFFER`。記録は端末の localStorage だけ）。ダイアログが開いている間は出さない。
  - **Atlas** からは `donate`（パネルを開く）と `operatingCosts`（パネルを「支援の使い道」で開き、同じ数を
    Atlas に返す）で届く。Stripe のページを開くのは読者のクリックだけ。
  - **支援のページ `support.html`**（`ja/support.html`。`scripts/org-pages.mjs` が生成）は、運営にかかるもの
    （Atlas の AI 提供元・Supabase・CARTO の基図の無料枠・運営者の時間。**金額は出さない**）、今月の AI の利用量
    （`operating_stats()` をその場で読む。読めなければそう言う）、寄付の 2 つのリンク、**支援者の一覧**を出す。
  - **支援者の一覧**は `supporters` 表の `listed` の行（表示名・寄付した月・任意のひとこと）。行は**本人が掲載を
    申し込み**（相談の purpose `supporter_listing`）、管理者が **Stripe のダッシュボードで寄付を手で照合してから**
    `admin-inquiries.html` で書く。金額・決済の情報は持たない。Webhook による自動の掲載は無い（`PRODUCT.md` §2.4、未承認）。
  - EN: `https://donate.stripe.com/5kQdR2d2m1oa1lAadk5gc01?locale=en`
  - JA: `https://donate.stripe.com/8x29AM9Qa2se7JYetA5gc00?locale=ja`
- **管理コンソール `admin.html`**：`geo_pins`（ニュース辞書）の追加／編集、`dashboard_cards` 編集、
  `community_reports` の対応、`feedback` 閲覧、`community_posts` / `community_comments` のモデレーション。
  ⚠ 公開サインアップは無い。CSP は厳格（`connect-src` は self ＋ `*.supabase.co`）。
  破壊的操作の前に再認証を求める。ログインゲートは利便のためのもので、非 admin が開いても
  **RLS が 0 行しか返さない**。
- **バグ報告**：`bug_reports`（診断情報 JSON 付き。`reader-reports` 経由で誰でも送れる・表へ直接は書けない・admin が閲覧）。
- **組織からの相談**：報道機関・学校・研究機関/NGO 向けの紹介ページ（`for-newsrooms.html`・`for-schools.html`・
  `for-research.html` と `ja/`）から `contact.html` のフォームへ。`reader-reports`（kind `inquiry`）経由で `org_inquiries`
  に入り、**表へ直接は書けない**。読むのは**相談のコンソール `admin-inquiries.html`**（`admin.html` とは別のページ・
  同じアカウント・`noindex`）——状態（new / replied / closed / spam）とメモを付け、削除し、支援者を掲載する。
  保存期間は受信から 730 日、spam は 30 日（`purge_org_inquiries`・pg_cron）。ページの文は `scripts/org-pages-text.mjs`
  （en + jp）、生成と門は `scripts/org-pages.mjs`。営業の手引きは `docs/sales/`。
