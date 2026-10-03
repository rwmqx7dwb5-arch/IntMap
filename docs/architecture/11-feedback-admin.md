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
- **地図の誤り報告（map corrections）**：読者が「地図のここが違う」を**地点つきで**報告し、運営者が地図の上で裁き、回答が
  報告者に返り、直したものを公開する往復。
  - **入口**：地図の右クリック（長押し）▸「地図の誤りを報告」（`js/tool-panel.js`）、地点プロファイルのカードの下の
    ボタン（`js/place-dossier.js`。地名・国・表示中レイヤーの行をそのまま渡す）、Atlas の `corrections.report`
    （下書きを入れてカードを開く。**送るのは読者**）。カードは `js/map-corrections.js`（クリックで取得・起動経路に載らない）。
  - **添付されるもの**：地点、ズーム、**そのときの地図の状態**（`MapState.hash()`＝共有リンクの断片。レイヤー・年・比較も含む。
    上限を超えたとき・視点がまだ無いときは、報告した地点そのものの表示を同じ符号器で書く。表はこの断片を必須にしているので、読む側が断片を組み立てることは無い）、時計が過去なら**その年**。読者が選ぶのは誤りの種類（name / boundary / date / value /
    position / missing / other）・レイヤー（表示中のレイヤーと基図）・本文・任意の出典 URL。
  - **書き込み経路**：`reader-reports` の 4 つ目の kind `correction`。語彙・上限・検証規則は
    `supabase/functions/_shared/correction-shape.js` の `checkCorrection` に 1 回だけ書き、カードは送信前に同じ関数を通す。
    表 `map_corrections` に INSERT policy も grant も無い。**メールアドレスは求めない**。
  - **回答の戻り方**：関数が 32 バイトの**受付番号**を作り、表には `sha256` の hex だけを書き、受付番号は 201 の本文で一度だけ
    返す。端末は `localStorage` の `intmap_corrections` に保持し、`map_correction_status(receipts[])`（anon 可・受付番号を
    持つ者に自分の行だけ・spam は「終了」と読める）で読む。ログイン中に送ったものは `my_map_corrections()` で全端末から読める。
    設定 ▸ 情報とサポート ▸「地図の誤り報告」と Atlas の `corrections.mine` が一覧を出す。未回答の受付番号を持つ端末だけが
    起動後の待機時に最大 12 時間に 1 回確かめ、回答が付いたら一度だけ知らせる（持たない端末の費用は localStorage の 1 回の読み取り）。
  - **運営者のコンソール `admin-corrections.html`**（`admin.html`・`admin-inquiries.html` と同じアカウント・`noindex`）：
    全報告を**世界地図の上の点**で並べ（`data/land-mask.png` を経緯度そのままの SVG に敷く）、状態で絞り、点を押すとその報告へ。
    「読者の見た表示を IntMap で開く」は報告の断片をそのまま本番の地図で開く。半径 25 km 以内の他の報告を重複の候補として出す。
    **歴史地図の年を持つ報告**には `node scripts/hist-fidelity.mjs --year <年> --in <範囲>` と
    `.agents/rules/historical-verification.md` §2 の 5 問を出す（報告されたことは誤りであることの証明ではない）。
    書けるのは状態・回答・変更内容・内部メモ・重複先・公開・公開用の地名だけで、読者の本文は誰も書き換えられない。
    `resolved_at` は状態に従う（トリガー）。公開は回答のある「確認・修正・誤りなし・直せない」だけ（CHECK）。
  - **公開の訂正記録 `corrections.html`**（`ja/corrections.html`。`scripts/org-pages.mjs` が生成し、組織向けページの
    ナビゲーションに並ぶ）：報告のしかた・確かめ方・件数（`map_corrections_summary()`：受付・対応中・修正・誤りなし・
    歴史の年について・回答までの日数の中央値）・公開した訂正（`public_map_corrections()`：運営者の要約・地点は約 100 m・
    レイヤー・年。**報告者と本文は出さない**）・このブラウザの報告と回答。Atlas の `corrections.log` が同じものを返す。
  - **保存期間**：spam は 30 日、公開しなかった回答済みは回答から 730 日、未回答と公開分は残す（`purge_map_corrections`・
    pg_cron `map-corrections-purge`）。アカウントを削除すると、そのアカウントの報告は消える（`_owned_by_user_cols` が発見する）。
  **セキュリティ上の問題の非公開の報告**も同じ道を通る——`security.html`（`ja/`）の報告ボタンが用件 `security` を
  選んだ相談フォームを開き、フォームはその用件のときだけ「何を書き、何を書かないか」を示す（`data-hint-for`）。
  語は `_shared/inquiry-shape.js`、表の CHECK は最後にそれを述べた migration（`tests/sales-channels-checks.test.mjs`
  が全 migration を順に読んで照合する）。ページの中身は §17.3。
  - **パイプライン**（コンソールの Pipeline タブ・`js/admin-pipeline.js`、タブを開いたときだけ `import()`）: 状態（返信したか）とは
    別に、**会話がどこまで進んだか**を持つ——`stage`（lead → talking → trial → adopted | declined）・`next_step`（次にやること 1 文）・
    `next_step_on`（期日）・`stage_changed_at`。段ごとの列、送り手の区分 × 段の件数、**期日が今日（運営者の暦日）以前の
    もの**、段が進んだのに期日の無いもの、ページが知らない段を出す。spam と支援者の掲載申し込みは載せない。語は
    `supabase/functions/_shared/inquiry-shape.js` の `INQUIRY_PIPELINE` が 1 回だけ宣言し、生成器がページの `data-*` に書き、
    コンソールのスクリプトはそれを読む（綴らない）。表の CHECK は `20261003211800_org_inquiry_pipeline.sql`。書けるのは
    管理者だけ（既存の RLS）。730 日の保存期間は変わらない——導入事例は相手の書面の同意から書く。
