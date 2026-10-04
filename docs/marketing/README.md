# IntMap — マーケティング (Marketing)

> **読者を連れてくる仕組みの正本の索引と、ローンチの段取り。** 外へ出す文言そのものはここに書かない
> ——文言は `scripts/brand-text.mjs`（ブランド）と `scripts/launch-text.mjs`（投稿の下書き）、数は実装の
> 持ち主のファイルにあり、`node scripts/brand.mjs --write` が各所へ書き出す。
>
> ⚠ **このリポジトリのどのスクリプトも、外部へ投稿・送信・登録をしない。** 下の「承認が要ること」は
> すべて利用者（所有者）が判断し、人が実行する。

---

## 1. 何がどこにあるか

| 何 | 正本 | 書き出し先 | 門 |
|---|---|---|---|
| ポジショニング・タグライン・説明文（en / ja） | `scripts/brand-text.mjs` | `index.html` の head（title・description・canonical・Open Graph・X カード・JSON-LD）、`js/locales/ui.en.js` / `ui.jp.js` の `docTitle`・`docDesc`、`manifest.webmanifest`、`README.md` のタグライン、[`press-kit.md`](press-kit.md) | `node scripts/brand.mjs --check`（`tests/marketing-engine-checks.test.mjs`） |
| チャネル別の投稿の下書き | `scripts/launch-text.mjs` | [`launch-posts.md`](launch-posts.md)、`node scripts/brand.mjs --print <id>`（貼れる完成形） | 同上 |
| 文中の数（時計の下限・スナップショット数・境界の年・レイヤー数・言語数） | 実装の持ち主（`scripts/landing.mjs` `facts()` が読むファイル） | 上のすべて | 同上 |
| リンクのカードの絵 | `og-image.jpg`（本物の JPEG。大きさはファイルから読む） | `index.html` の `og:image*`、歴史地図の入口ページ | 同上 |
| 歴史地図の入口ページ（地域 × 日付、en / ja） | `scripts/history-pages.mjs`（文言は `scripts/history-pages-text.mjs`） | ビルド時に `dist/history/…`・`dist/ja/history/…`・`dist/sitemap-history.xml`・`dist/sitemap-index.xml` | `tests/marketing-engine-checks.test.mjs` |
| この日の歴史地図（暦の日ごと、en / ja）・日ごとのカードの絵 | 索引 `data/on-this-day.json`（`scripts/build-on-this-day.mjs`）、文言は `js/on-this-day.js`、ページは `scripts/on-this-day-pages.mjs`（文は `scripts/on-this-day-text.mjs`）、絵は `scripts/lib/map-card.mjs` | ビルド時に `dist/on-this-day/<MM-DD>/`（`card.png` を含む）・`dist/ja/on-this-day/…`・`dist/sitemap-on-this-day.xml`（`sitemap-index.xml` が束ねる） | `tests/marketing-next-checks.test.mjs` |
| 国別の入口ページ（国ごと、en / ja） | `scripts/country-pages.mjs`（文は `scripts/country-pages-text.mjs`。国の集合と行・条件は `scripts/public-api.mjs`、枠は `js/country-extent.js`） | ビルド時に `dist/countries/<code>/`・`dist/ja/countries/…`・`dist/sitemap-countries.xml`（`sitemap-index.xml` が束ねる） | `tests/country-pages-checks.test.mjs` |
| 毎日の投稿の下書き（X・Bluesky・Threads、en / ja） | `scripts/on-this-day-pages.mjs --queue [--from YYYY-MM-DD] [--days N]` | 標準出力（承認欄つきの Markdown。**投稿・予約・送信はしない**） | 同上（tag が計数器の規則を通ること・X の文字数） |
| プレスルーム（`press.html`・`ja/press.html`。説明文のコピー・数字・ロゴとスクリーンショットのダウンロード・フィードへの導線） | 文言は `scripts/brand-text.mjs`、数は `scripts/brand.mjs` の事実、画像は `js/showcase.js`、ページ専用の文は `scripts/org-pages-text.mjs`、生成は `scripts/org-pages.mjs` | `press.html`・`ja/press.html`（追跡対象。`node scripts/org-pages.mjs --write`）。`sitemap.xml` に載る | `tests/press-room-checks.test.mjs`・`node scripts/org-pages.mjs --check` |
| 紹介ページ・授業ページ・見本・`sitemap.xml`・`robots.txt` | `scripts/landing.mjs`（別の主題。ここでは触らない） | — | `node scripts/landing.mjs --check` |

仕組みの説明は現状仕様 [`architecture/08-ui.md`](../architecture/08-ui.md) §8.6b。

## 2. 承認が要ること（外部に出る・お金がかかる・名義が要る）

| # | 何 | なぜ承認が要るか |
|---|---|---|
| A1 | Google Search Console に `sitemap-index.xml` を送る（`sitemap.xml` と `sitemap-history.xml` を束ねたもの） | 所有者のアカウントでの操作。`robots.txt` はサブパス配信（`/IntMap/`）では読まれないので、送らない限り検索エンジンは入口ページを地図からのリンク以外で知らない |
| A2 | 各チャネルへの投稿（Product Hunt・Hacker News・Reddit・X・note・Zenn） | 外部への発信。名義（誰のアカウントで出すか）と時期を決めるのは所有者 |
| A3 | プレスキットに作り手の名前・連絡先を載せるか | 個人情報。今は「アプリの Feedback」と「GitHub Issues」だけを載せている |
| A4 | リンクのカードの絵を撮り直す | 今の `og-image.jpg` は**以前の画面**（右下に「See the past world — 1900 to present」）。今の時計は紀元前まで届くので、絵が今の主張と食い違う。撮り直しには開発サーバでの撮影が要る（`scripts/showcase-capture.mjs` と同じ手順） |
| A5 | 紹介ページ（`about.html`）・授業ページから歴史地図の入口（`history/`）へのリンクと、`robots.txt` の `Sitemap:` 行を `sitemap-index.xml` に向けること | `scripts/landing.mjs` が持ち主の別の主題。その作業で行う |
| A8 | プレスルームに作り手の名前・連絡先を載せるか（A3 と同じ個人情報の話） | 今は問い合わせページ（`contact.html`）への導線だけで、メールアドレスも名前も載せていない |
| A7 | この日の歴史地図の毎日の投稿（`--queue` の下書き） | 外部への発信。どのアカウントで・どのチャネルに・毎日か週に何回かを決めるのは所有者。下書きは 1 件ずつ承認欄を持ち、承認したものだけを人が投稿する |
| A6 | 独自ドメイン | 料金が発生する。`supabase/functions/_shared/site-origin.js` の 1 値で全ページが追従する作りは既にある |

## 3. ローンチの段取り（案）

日付は承認後に決める。**T** は Product Hunt と Show HN を出す日。

| いつ | やること | 誰 | 確かめること |
|---|---|---|---|
| T−14 | A1（Search Console に `sitemap-index.xml`）。A4（カードの絵の撮り直し）・A5（紹介ページからのリンク）を済ませる | 所有者・エージェント | 本番で `history/` と `ja/history/` が開く。Search Console が送った sitemap を「成功」と読む |
| T−10 | リンクのカードが本番で正しく出るか確かめる（各サービスのカード検証ツール） | エージェント（本番検証） | `og:image` が JPEG で読めて、題・説明がブランドの文言 |
| T−7 | 下書き（[`launch-posts.md`](launch-posts.md)）を所有者の言葉に直す。Product Hunt の掲載ページを用意（画像は [`press-kit.md`](press-kit.md) §6） | 所有者 | 数は実装から入っている——**直すのは語り口だけ**、数と機能の主張は足さない |
| T−1 | `node scripts/brand.mjs --print <id>` で完成形を出し、各コミュニティの最新の規則を読む | 所有者 | 自己宣伝の可否・画像投稿の条件 |
| T | Product Hunt を公開。同じ日に Show HN。X（en / ja）のスレッド | 所有者 | 最初の数時間はコメントに答える |
| T+1〜T+4 | Reddit を 1 日 1 コミュニティずつ（r/InternetIsBeautiful → r/geography → r/MapPorn → r/gis） | 所有者 | 同じ文を一度に複数へ貼らない |
| T+2 | note（読み物）。T+4 Zenn（技術記事） | 所有者 | Zenn のコード引用は公開リポジトリの該当箇所から |
| T+7 | 振り返り: 匿名集計（`utm_source` ごとの入場）と Search Console の表示回数・クリック | 所有者・エージェント | 歴史地図の入口ページがどの地域・年で表示されているか |

## 4. 測り方

- **アプリへのリンクには utm を付ける**（`?utm_source=<チャネル>&utm_medium=social&utm_campaign=launch`）。
  数えるのはアプリの匿名集計（`js/usage-counts.js`、項目の正本は `supabase/functions/usage-count/shape.js`）。
- **この日の歴史地図の日のページ（`on-this-day/<MM-DD>/`）と歴史地図の入口ページ（`history/…`）は、アプリの計数器が
  「入口」として数えるページ**（`supabase/functions/usage-count/shape.js` `SITE_PAGES`）。そこから地図へ進んだ読者は
  入口 `on-this-day`／`history` として数えられ、**そのページのアドレスの utm が読まれる**。だから毎日の投稿の下書きは
  日のページに utm（`utm_source=<チャネル>&utm_medium=social&utm_campaign=on-this-day`）を付ける。ページを見ただけで
  地図へ進まなかった人は数えない（静的ページは計数器を走らせない）。
- **それ以外の静的ページ（`about.html` など）へのリンクには付けない**——静的ページには数える読み手が無く、
  そこからアプリへ進んだ読者は「自サイトから」として数えられる。静的ページの効き目は Search Console で見る。
- 何を数え、何を数えないかはプライバシーポリシー（`js/legal-text.js` §1）が利用者に述べている。

## 5. 書き方の約束

- **数と機能の主張は、実装から確かめたものだけ。** 文中の数は全部プレースホルダで、持ち主のファイルから入る。
- 誇張しない（「唯一」「最大」「革命的」と書かない）。比べるときは何と比べたかを言う。
- **IntMap** はワードマークで訳さない。**Atlas** も訳さない。絵文字は使わない。
- 歴史について何かを言うときは `.agents/rules/historical-verification.md` に従う（典拠が述べていることだけ）。
