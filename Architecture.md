# IntMap — 現状仕様書 (Architecture)

> 本ファイルは**開発日記ではなく**、現在の IntMap を再現・保守するための**現状仕様書の案内図**です。
> 本文は主題ごとに `docs/architecture/` の章（1 章 1 ファイル）に分かれていて、**節番号は分ける前と同じ**。
> Claude や他のAIが、下の表で主題の章を選んで開くだけで IntMap の構造をほぼ理解できることを目的とします。
>
> Last reviewed: 2026-10-01

### この文書の読み方

- **§1–§18 は「今どうなっているか」だけ**を書く。**この仕様書（このファイルと `docs/architecture/`）には
  変更履歴を書かない。** 「いつ・なぜ・どう直したか」は開発記録——`dev-notes/`（1 エントリ 1 ファイル、索引は
  `DEV-NOTES.md`）と `DEV-NOTES-ARCHIVE.md`（それ以前）の担当。
  標準指示（やってはいけないこと等）は `CONSTITUTION.md`、作業の進め方は `AGENTS.md`
  （Claude Code 固有の作法だけが `CLAUDE.md`、2 製品の配線図が [`docs/AGENT-SETUP.md`](docs/AGENT-SETUP.md)）。
- **本文は章ごとのファイルにあり、このファイルは「§ → ファイル」の表と各章の要約だけを持つ。**
  主題の章だけを開けるように、また並行する変更が 1 本の巨大なファイルで衝突しないように分けた。
  **節番号は分けた先でも同じ**なので、どの文書・コード・テストが書く「`Architecture.md` §7.4」も下の表で引ける。
  `npm run check:docs` の `section-refs` がこの表を通して §参照を解決し、`arch-split` が表と各章の見出しを突き合わせる。
  表の同じ行に挙がる [`docs/FILES.md`](docs/FILES.md)（ファイル台帳）と [`docs/MAP-LAYERS.md`](docs/MAP-LAYERS.md)
  （レイヤー実装の詳細）も同じ番号空間にある。
- **「何ができるか」は [`PRODUCT.md`](PRODUCT.md)、「なぜそうなっているか」は
  [`DECISIONS.md`](DECISIONS.md)。** どの文書が何の正本かは
  [`docs/README.md`](docs/README.md) が1枚の表で持っている。
- **ラウンド番号・PR 番号をこの仕様書に書かない。** 「いつその事実になったか」を知りたいときは
  `git log -S'<その記述>' -- Architecture.md docs/architecture/` で入った commit を辿り（件名の末尾が PR 番号。
  章に分ける前の履歴は `Architecture.md` 側にある）、その回の記録を読む。本文に番号を埋めると、それを手掛かりに
  履歴の物語がまた増えるので、`npm run check:docs` が本文中のラウンド・PR 参照を（桁数によらず）検査して落とす。
- 数字（行数・KB・件数など）を書くときは**その場で実測した値**にする。実測できる主要な数字は
  `npm run check:docs` が仕様書と実体の一致を毎回検査する。
- 実装を変えたら、その主題の章を同じコミットで更新すること。**章（H2）を足すときは** `docs/architecture/` に
  ファイルを 1 本足し、下の表に 1 行、`docs/README.md` に 1 行足す。
- `tests/r783-format-compat-checks.test.mjs` のような**ファイル名**に含まれる番号は履歴参照ではない。

---

## 節の在り処（§ → ファイル）

| § | ファイル | 主題と、その下の節 |
|---|---|---|
| §1 | [`docs/architecture/01-overview.md`](docs/architecture/01-overview.md) | **概要 (Overview)** — IntMap が何であるか、どう束ねて配るか（Vite・`dist/`・GitHub Pages・git の外のデータ）、2 つの地図エンジン（MapLibre と第2エンジンの Cesium）、バックエンドと言語。<br>節: 1.1 ビルドと配信 ／ 1.2 地図エンジン ／ 1.3 バックエンド・言語 |
| §2 | [`docs/architecture/02-features.md`](docs/architecture/02-features.md) | **主要機能一覧 (Features)** — 機能が**どう組み上がっているか**（一覧は `PRODUCT.md`）。Atlas の制御カーネル（dispatch・能力表・ターン）、語句の注釈、データ横断クエリ、回答の契約、添付、返答内の小注釈、写真の撮影地点探索、放射性物質の拡散のモジュール分担。<br>節: 2.1 制御カーネル (The control kernel) ／ 2.1b 回答の中の語句を引く (The term gloss) ／ 2.1c データ横断クエリ (The cross-dataset query) ／ 2.2 回答の契約 (The answer contract) ／ 2.2b 添付ファイル (Attachments) ／ 2.3 返答の中の小注釈 (In-reply notes) ／ 2.4 写真の撮影地点探索 (Photo geolocation) ／ 2.5 放射性物質の拡散 (Radioactive dispersion) |
| §3 | [`docs/architecture/03-files.md`](docs/architecture/03-files.md)<br>＋ [`docs/FILES.md`](docs/FILES.md)（§3.1〜§3.13 ファイル台帳） | **ファイル構成 (Files)** — 置き場所の規約（ルート＝サイト・`js/`・`src/`・`css/`・`data/` と git の外のデータ・運用側）。1 本ずつの台帳は `docs/FILES.md`（§3.1〜§3.13）。 |
| §4 | [`docs/architecture/04-news.md`](docs/architecture/04-news.md) | **ニュース処理の流れ (News pipeline)** — サーバー側の事前処理（`refresh-news`）、フロントエンドの表示、非 AI の地点解析 `IntMapNewsGeo`、出来事 (Event) 単位の基盤、Atlas の `research.events`、出来事を地理・時間・企業・健全性から読む口。<br>節: 4.1 サーバー側（事前処理）— `supabase/functions/refresh-news/index.ts` ／ 4.2 フロントエンド（表示） ／ 4.3 非AI地点解析エンジン `IntMapNewsGeo` ／ 4.4 出来事 (Event) 単位の基盤 ／ 4.5 Atlas `research.events` ／ 4.6 出来事を地理・時間・企業・健全性から読む — `js/news-intel.js` |
| §5 | [`docs/architecture/05-ai.md`](docs/architecture/05-ai.md) | **AI APIの使い方と鍵管理 (AI usage & key policy)** — Atlas の人格の正本、サーバー保持の鍵と BYOK、モデルと fallback、system prompt の本数。 |
| §6 | [`docs/architecture/06-supabase.md`](docs/architecture/06-supabase.md) | **Supabase（テーブル・Edge Functions・環境変数）** — テーブル、Edge Functions（名簿と各関数の役割・共有部品）、secrets。<br>節: 6.1 テーブル ／ 6.2 Edge Functions ／ 6.3 環境変数（Edge Functions の secrets） |
| §7 | [`docs/architecture/07-map.md`](docs/architecture/07-map.md)<br>＋ [`docs/MAP-LAYERS.md`](docs/MAP-LAYERS.md)（§7.1・§7.2・§7.5〜§7.10・§7.14 レイヤー実装の詳細） | **地図・レイヤー・Globe・ウィジェットの構造** — 地図とレイヤーの**契約**——`window.IntMapLayers`、世界遺産・予報モデル・鉄道・持ち込みファイル・GIS の基盤、Chronos（統一時間）と「年」・歴史地図、ウィジェット基盤。レイヤー実装の詳細は `docs/MAP-LAYERS.md`。<br>節: 7.2 レイヤー欄の分類・7.5 地図の初期化 ／ 7.3 レイヤー・データ契約 `window.IntMapLayers` ／ 7.3a 世界遺産 (World Heritage) ／ 7.3b 予報モデル（複数） ／ 7.3c 世界の鉄道 (World railways) ／ 7.3d 利用者が持ち込むファイル (User data import) ／ 7.3e データセットと処理の基盤 (The GIS core) ／ 7.4 Chronos（統一時間）と「年」 ／ 7.5 ウィジェット基盤 |
| §8 | [`docs/architecture/08-ui.md`](docs/architecture/08-ui.md) | **UI/UX の構造** — 画面の骨格、アカウント、企業アトラス、Panels タブ、パネルとウィンドウの作法、経路と案内、パンデミック・シミュレーター、紹介ページと見本の地図。<br>節: 8.1 画面の骨格 ／ 8.1.2 アカウントのボタンとアカウントメニュー ／ 8.1.3 IntMap のいま（状態ページ）と、失敗が名指すデータ元 ／ 8.1.1 企業アトラス (Company atlas) ／ 8.2 Panels タブ（ドック） ／ 8.3 パネルとウィンドウの作法 ／ 8.4 経路 (Directions) ／ 8.4b 案内 (Active Navigation) ／ 8.5 パンデミック・シミュレーター (Pandemic Simulator) ／ 8.6 紹介ページ・授業ページ・見本の地図 (Landing & showcase) |
| §9 | [`docs/architecture/09-mobile.md`](docs/architecture/09-mobile.md) | **モバイル対応の構造** — viewport、Tools 帯の運び先、IntMap Runtime（1 つのフレーム・camera 購読・タイマ）、レイアウト、DEM タイルの予算、指の経路、携帯が持たない／待たないもの。<br>節: 9.0 ページの拡大は読者のもの（viewport） ／ 8.6 レイヤー欄の Tools 帯 (`#layer-tools`) は読者のパネルへ運ばれる ／ 9.1 IntMap Runtime ／ 9.2 レイアウト ／ DEM タイルの保持と、常駐タイルの予算 ／ 9.3 指の経路——DOM に訊くのは 1 ジェスチャに 1 回 ／ 9.4 携帯が余分に持たない／待たないもの |
| §10 | [`docs/architecture/10-i18n.md`](docs/architecture/10-i18n.md) | **多言語対応の構造** — `npm run check:i18n` の一つの答え、言語を足すコスト、読み込みと組み立て、言語切替で塗り直されるもの。<br>節: 10.1 答えは1つ ／ 10.2 言語を1つ増やすコスト＝ファイル1本 ／ 10.3 読み込みと組み立て ／ 10.4 言語が変わった瞬間に、画面のどこが塗り直されるか |
| §11 | [`docs/architecture/11-feedback-admin.md`](docs/architecture/11-feedback-admin.md) | **フィードバック・寄付・管理機能** — フィードバックの書き込み経路、Stripe の寄付リンク、管理コンソール `admin.html`。 |
| §12 | [`docs/architecture/12-fragile.md`](docs/architecture/12-fragile.md) | **壊れやすい部分・注意すべき部分** — レイヤー欄の並べ替え・レイヤー manifest・ケッペンのメモリなど、壊すと気づきにくい箇所の一覧。 |
| §13 | [`docs/architecture/13-touch-guide.md`](docs/architecture/13-touch-guide.md) | **触ってよい部分 / 慎重に触るべき部分** — 加算的に拡張しやすい所（辞書・レイヤー・文言・ウィジェット・設定）と、慎重に触るべき所。 |
| §14 | [`docs/architecture/14-restore.md`](docs/architecture/14-restore.md) | **新しい環境で IntMap を復元する手順** — clone・`npm ci`・`npm run data:pull` から、DB と Edge Functions を戻すまでの番号つき手順。 |
| §15 | [`docs/architecture/15-ops-quality.md`](docs/architecture/15-ops-quality.md) | **運用品質基盤 (CI・テスト・リリース・監視)** — 正本の在り処、実行、アプリが診断のために持つもの、リリース、`check:docs`、本番 Atlas の夜間評価、上流の死活と同梱データの鮮度、nightly の赤を起こした変更へ渡す仕組み。<br>節: 15.1 正本の在り処 ／ 15.2 実行 ／ 15.3 診断のためにアプリが持っているもの ／ 15.4 リリース（現行） ／ 15.5 文書間の固定事実の照合 ／ 15.6 本番 Atlas の夜間評価 ／ 15.7 上流の死活と、同梱データの鮮度 ／ 15.8 nightly の赤を、それを起こした変更へ渡す |
| §16 | [`docs/architecture/16-data-protection.md`](docs/architecture/16-data-protection.md) | **データ保護基盤 (migrations・RLS/権限テスト・バックアップ・復元)** — Supabase CLI 構成、RLS の 3 大保証、CI とバックアップ、実行。<br>節: 16.1 Supabase CLI 構成 ／ 16.2 RLS の3大保証（テストで実証） ／ 16.3 CI・バックアップ ／ 16.4 実行 |
| §17 | [`docs/architecture/17-security.md`](docs/architecture/17-security.md) | **セキュリティ基盤** — XSS 出力エンコード、認証・認可、ブラウザ側の設定（CSP など）、CI。<br>節: 17.1 XSS 出力エンコード（第一防御） ／ 17.2 認証・認可 ／ 17.3 ブラウザ側の設定 ／ 17.4 CI |
| §18 | [`docs/architecture/18-area-monitors.md`](docs/architecture/18-area-monitors.md) | **地域監視基盤 (Area Monitors)** — 入口は撤去済みで、仕組み（モジュール・Edge Function・DB・cron）は動いたまま。 |
