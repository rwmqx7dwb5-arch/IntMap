# IntMap — 営業の手引き (Sales playbook)

> **誰に・何を・どの経路で・何と答えるか**の正本。公開ページの文は `scripts/org-pages-text.mjs`
> （en + jp）が正本で、ここはそれを**使う人のための**手引き。製品の方針は `PRODUCT.md` §2、
> 料金の答えは [`pricing.md`](pricing.md)、よくある質問は [`faq.md`](faq.md)、
> 顧客区分ごとの提案書の骨子は [`proposals.md`](proposals.md)、導入事例の型は [`case-study-template.md`](case-study-template.md)。

---

## 1. 守ること（どの相手にも）

1. **記録に無いことを言わない。** 導入実績・利用者数・応答時間・稼働率は**記録が無い**ので言わない。
   見本の地図（`js/showcase.js`）は「見本」であって「導入事例」ではない。
2. **料金を作らない。** 有料プランは**未承認の設計案**（`PRODUCT.md` §2.4、`plans.js` の `offered:false`）。
   答えは常に [`pricing.md`](pricing.md) の文。個別の値引き・見積り・契約は**利用者（運営者）の承認事項**。
3. **いま無料のものは無料のまま**と言ってよい（`PRODUCT.md` §2.4 の原則）。
4. **出典の条件を代わりに許可しない。** 地図の各データの権利はその出典にある。IntMap が許せるのは
   IntMap 自身のソフトウェアと文だけ（`LICENSE`）。
5. **外部への発信（投稿・掲載申請・営業メールの初回送信）は、その都度利用者に確認してから**
   （`PRODUCT.md` §2.4「商品化の方針」）。受け身の窓口（問い合わせへの返信）はこの限りではない。
6. 文は **en + jp**（`CONSTITUTION.md` §7）。絵文字を使わない。

## 2. 顧客区分と経路

| 区分 | 何を求めているか | 入口（公開ページ） | 問い合わせの `audience` / 既定の `purpose` |
|---|---|---|---|
| 報道機関 | 記事に出典つきの地図を埋め込む | `for-newsrooms.html`・`ja/for-newsrooms.html` | `newsroom` / `embed` |
| 学校・教育委員会 | 授業での利用、端末・ネットワークの確認 | `for-schools.html`（授業そのものは `teachers.html`） | `education` / `classroom` |
| 研究機関・NGO | 報告書・サイトでの地図、データの追加・引用 | `for-research.html` | `research` / `data` |
| 支援者 | 支援の理由を知る、名前の掲載 | `support.html` | `supporter` / `supporter_listing` |
| 商用利用 | ソフトウェアの商用ライセンス（`LICENSE` §6） | どのページからも `contact.html` | 任意 / `licence` |

語彙（`audience`・`purpose`）の正本は `supabase/functions/_shared/inquiry-shape.js`。
フォームの選択肢はそこから生成され、DB の CHECK と一致することを `tests/sales-channels-checks.test.mjs` が測る。

## 3. 問い合わせを受けてから

1. 届いた相談は **`admin-inquiries.html`**（管理者だけが読める。`admin.html` と同じアカウントで入る）。
2. 返信は**相手が書いた返信先アドレス**へメールで行う（画面の宛先リンク）。返信したら状態を `replied`、
   終わったら `closed`、迷惑なものは `spam`（30 日で消える）。メモは管理者だけが見る。
3. 回答の文は [`faq.md`](faq.md) と [`pricing.md`](pricing.md) を使う。無い問いは**推測で答えず**、
   運営者に確認してから答え、答えを `faq.md` に 1 行足す。
4. 相談は受信から 730 日で自動削除（`purge_org_inquiries`）。相手が求めれば先に消す（画面の Delete）。
5. 導入が実際に決まり、**相手が書面で公開に同意した**ときだけ、[`case-study-template.md`](case-study-template.md)
   の型で事例を書く。

## 4. 支援者の掲載

1. 支援者が `support.html` の「掲載を申し込む」から `supporter_listing` の相談を送る（表示名・寄付した月・任意のひとこと）。
2. 管理者が **Stripe のダッシュボードで寄付を手で照合する**（Webhook は未承認なので自動照合は無い）。
3. 照合できたら `admin-inquiries.html` の **List as supporter** で `supporters` に 1 行書く
   （同意の時刻＝申し込みの時刻）。`support.html` に表示される。
4. 取り下げの申し出があれば **Hide**（非表示）か **Remove**（削除）。

⚠ 照合できない申し込みは掲載しない。金額は記録しない・表示しない。

## 5. 数字の出どころ（公開ページが自動で使うもの）

| 数字 | 正本 |
|---|---|
| データレイヤーの数 | `js/layer-manifest.js` の `dataLayers()`（`scripts/landing.mjs` の `facts()` 経由） |
| 時計の床（紀元前の年） | `js/hist-scale.js` の `FLOOR` |
| Atlas の 1 日の回数 | `supabase/functions/_shared/plans.js` の既定プラン |
| 埋め込みの大きさ | `js/embed-mode.js` の `EMBED_SIZES` |
| 相談の保存期間 | `supabase/migrations/20261003150000_org_inquiries.sql` の `purge_org_inquiries` の既定値 |
| 今月の AI の利用量 | `public.operating_stats()`（`support.html` がその場で読む） |
| 基図の無料枠 | `js/carto-basemap.js` の冒頭の記述 |

⚠ 提案書やメールに数字を書くときも**ここから取り、書き写した数を古くしない**。
