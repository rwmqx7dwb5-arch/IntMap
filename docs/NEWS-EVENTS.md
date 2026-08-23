# News Events — 出来事単位のニュース基盤

> **これは何の正本か**: 記事ではなく**出来事 (Event)** を主語にするニュース基盤の設計。
> Source Registry・データモデル・クラスタリング・カテゴリ・翻訳・保持期間・運用者の修正経路。
>
> - **読む人**: ニュース周りを実装・運用する人。
> - **更新条件**: 収集元・クラスタリング・カテゴリ・保持・翻訳のいずれかを変えたとき。
> - **関連**: 現行の記事パイプラインは [`../Architecture.md`](../Architecture.md) §4、
>   表と RLS は [`DATABASE.md`](DATABASE.md)、試験は [`TESTING.md`](TESTING.md)。
> - ⚠ **ここに書いた数字は実測値である。** 出所は各節に記す。推定には「見込み」と書く。

---

## 1. なぜ作るのか — 測って分かったこと

`PRODUCT.md` は「記事ではなく出来事を扱うニュース — 同一出来事の複数報道を統合し、続報・
訂正・情報源間の相違を更新し続ける」を Atlas 到達目標の第6項として掲げている。#R76 が
最初の実装を入れたが、**それは Atlas の1アクションであって、通常の News 基盤ではなかった。**

本番 `current_news` の実データ（2026-08-23・1,651行・72時間）を測った結果:

| 測ったこと | 実測 |
|---|---|
| 記事量 | 約 550 件/日（en 932 / jp 719・72時間） |
| Google News が `description` に埋めるクラスタ | **平均 1.08 件**（n=1 が 1,169・n=2 が 102）＝**使えない** |
| 決定論クラスタリングの圧縮率 | **1.20〜1.37倍**（Event の 88% が単独記事） |
| 「3媒体以上」の Event | **72時間で 41 件＝1日あたり約 14 件** |
| 1 Event = 1 ピンにした場合のピン削減 | 1,460 → 1,183（**−19.0%**） |

**結論: 統合率が低いのは閾値のせいではなく、フィードが Google News の2トピックしか無いから。**
同じ出来事を報じる記事が、そもそも手元に届いていない。だから **Source Registry からの直接収集が、
クラスタリングの価値そのものを決める。** これが本設計の中心にある事実である。

---

## 2. 決定（利用者が承認済み）

| # | 決定 | 理由 |
|---|---|---|
| 1 | **直接RSS（主要媒体）＋ Google News の併用** | 直接RSS は実測 20/23 が稼働し、1回のpullで 750 件。**本物の canonical URL** が得られる（Google News の `CBMi…` リダイレクトでは記事の同一性が判定できない） |
| 2 | **収集は英語ソースのみ** | 単一言語なら言語間クラスタリングが Phase B で不要になる。日本国内報道が 37.8%→3.1% に落ちることは承認済み |
| 3 | **翻訳は日本語へのみ。** 英語・日本語以外の話者には英語を見せる | 一次措置。全9言語の事前翻訳は月$13〜22 かかり、実際に読まれない言語にも払う |
| 4 | **集約サイトは最初から収集しない** | Yahoo!ニュース・ライブドア・dメニュー・株探等（実測 9.2%）は原発信元ではなく、`independent_source_count` を水増しする |
| 5 | **記事 72時間 / Event 30日** に保持を分ける | ⚠ `CONSTITUTION.md` §5 の「72時間より古いニュースは削除」を**改訂する**。改訂しないと ★保存した Event も共有URLも72時間で失われる |
| 6 | **8カテゴリ** | World / Politics & Conflict / Business / Technology / Science & Health / Climate & Weather / Disasters / Society。うち6つは**セクション別フィードから決定論的に**付く（実測 15/15 稼働）。分類器が要るのは Disasters と Society だけ |
| 7 | **★は Event 単位へ切替。既存の記事★は壊さず自動移行** | 記事★のキーは Google News のリダイレクト URL なので、直接RSS に移ると同じ記事でも別キーになる |
| 8 | **NEW / UPDATED は全体の時刻状態** | 未ログインの閲覧者にも同じだけ意味があり、起動経路に何も足さない |
| 9 | **Publisher モード＝選択中 Event の媒体HQだけ**（同じ媒体は1ピン） | 「この出来事をどこが報じているか」が一目で分かる。転載で水増ししない |
| 10 | **費用上限 月$50**（Supabase Pro $25 を含みうる） | merge/split 履歴と保存済み Event は**再生成できない**データなので、自動バックアップと PITR の価値が上がる |
| 11 | **Merge / Split / Reassign は `admin.html` にタブを1枚追加** | 既存のタブ構造・認証・モーダルをそのまま使え、本体アプリのバンドルに1バイトも入らない |

---

## 3. Source Registry — 媒体の正本を1つにする

**正本は DB の `news_sources`。** クライアントへは UI が要る列だけを射影する
（`id` / `name` / `slug` / `type`）。⚠ **`js/news-sources.js` に第二の媒体一覧を残さない**
——あれは「到着した記事の publisher を数える表示フィルタ」であって収集対象の一覧ではない。

収集は **3経路**あり、どれも `news_source_feeds.collection` が決める（1媒体は複数のフィードを持つので、
経路とカテゴリは媒体ではなく**フィード**に属する）:

投入した実体は **18媒体 / 33フィード**（`20260823120100_news_sources_seed.sql`）。
**33/33 が 200 を返し `<item>` を持つことを投入前に測ってある**（合計 1,380 件・2026-08-23）。

| collection | 本数 | 使う相手 | 実測 |
|---|---|---|---|
| `direct_rss` | 27（＋既定オフ1） | 媒体自身のセクション別 RSS | **922 件**。全て日時と description あり。**セクションがそのままカテゴリになる** |
| `google_news_site` | 3 | 無料 RSS を持たない媒体 | `news.google.com/rss/search?q=when:24h+site:<domain>` で **Reuters 98 / AP 100 / Bloomberg 100**。既存の `news-relay` allowlist（`/rss/search` ＋ `q`）を**変更せずに通る** |
| `google_news_topic` | 2 | 補完（現行の WORLD / BUSINESS） | 140 件。Phase E まで fallback として維持 |

⚠⚠ **「そのフィードから来た」は「その媒体が書いた」を意味しない。** 実測で **CNN の World RSS
29 件のうち 6 件が CNN の記事ではなかった**（fool.com のクレジットカード広告 3 件・lendingtree.com の
住宅ローン広告 3 件。見出しに 2022 年・2024 年が残っている）。⇒ **ingest は canonical URL の
ホストを `news_sources.domains` と<u>完全一致</u>で突き合わせ、合わない記事はその媒体のものとして
数えない。** 接尾辞一致にしてはならない——Sky News（`news.sky.com`）が Sky の物販ページ
（`sky.com`）まで自分のものだと主張する。

⚠⚠ **`disasters` と `society` を出すフィードは 0 本である。** 実測の内訳は
world 16 / business 5 / science_health 5 / technology 4 / climate_weather 2 / politics 1。
**この 2 カテゴリは分類器だけが埋める**——「6 つはフィードが決める」の残り 2 つがここ。
⚠ The Washington Post の World は 3 件しか返さない（空ではないが薄い）。

Registry が持つ列は §4 の `news_sources` を見ること。**`independent_source_count` は
`source_family` 単位で数える**——実測で Sinclair 3局・Hearst 4局が同一タイトルを配信しており、
媒体名で数えると1つの出来事が「7媒体が報じた」に化ける。

---

## 4. データモデル

⚠ **`current_news` は触らない。** article mode の fallback として Phase E まで生きている
（`Architecture.md` §4）。Event 側は別の表として足す。

| 表 | 役割 | 読み | 書き |
|---|---|---|---|
| `news_sources` | 媒体の正本（Source Registry） | 全員 | service_role |
| `news_source_feeds` | 1媒体の複数フィード。**`collection` と `category` はここ** | 全員 | service_role |
| `news_articles` | 正規化された記事1本 | 全員（`status='active'` のみ） | **service_role だけ** |
| `news_events` | 出来事1件（代表見出し・代表地点・時刻・件数・カテゴリ・確度） | 全員 | service_role |
| `news_event_articles` | Event と記事の関係（`same_event` / `update` / `related_context`） | 全員 | service_role |
| `news_cluster_decisions` | なぜその判定になったかの監査 | **admin のみ** | **service_role だけ** |
| `news_event_i18n` | Event の訳文（現在は `ja` のみ） | 全員 | service_role |
| `saved_news_events` | ユーザーが★を付けた Event | 本人 | 本人 |

⚠ **今は書き込みが service_role（ingest）だけである。** 運用者の Merge / Split / Reassign は
`admin.html` の News Events タブ（§11）と**同じ変更で** `geo_pins` と同じ形の
`for all to authenticated using (public.is_admin())` を `news_events` / `news_event_articles` /
`news_sources` / `news_source_feeds` に足す。**使う相手が無いうちに書き込み privilege を配ると、
誰も試していない権限が本番に居座る。**

⚠ **そのときも `news_articles` と `news_cluster_decisions` は admin にも書かせない。** 上流が何と
言ったかと、機械が何を根拠に判定したかは、**後から書き換えてよい種類の記録ではない**。運用者が
直すのは「どの記事がどの Event に属するか」であって、記事そのものではない。

⚠ **`news_events.reviewed_by` は `auth.users` への FK を持たない。**
`public.delete_account_data()` は `auth.users` への単一列 FK を**行の所有者を表す列**として発見し
その行を削除する。`reviewed_by` は所有ではなく**監査**なので、FK を張ると
**運用者がアカウントを消したときに、その人が確認した公開の出来事まで消える。**

⚠ **service_role への表の grant は migration で明示する。** baseline の
`grant all on all tables in schema public to service_role` は**その時点のスナップショット**で、
あとから作られた表には届かない。

**識別子の規則**

- 記事の identity は **URL ではなく fingerprint**。`canonical_url` を正規化した上で、
  `title_fingerprint`（正規化見出しのハッシュ）と併せ持つ。URL は変わるが出来事は変わらない。
- Event ID は **merge しても壊れない**。統合された側は行を消さず `merged_into` を立て、
  古い ID からは canonical ID へ解決できる（保存・共有URL・Atlas 参照・ブラウザ履歴が生き残る）。
- 1記事が同時に2つの primary Event に属さない制約を持たせる。関連は `related_context` で表す。

**⚠ pgvector は現在有効化されていない。** migration で `create extension vector` から始める。

---

## 5. クラスタリング

**誤統合を最も重く扱う。** 関係のない2件を1つにするより、同じ出来事が一時的に2つに分かれるほうが
修復しやすい。

### 5.1 #R76 の実装から引き継がないもの

#R76 のアルゴリズムは `js/atlas-console.js` に**今も生きており**、実データで破綻している。
同じ入力（600件）での ablation:

| 設定 | events | 最大クラスタ | 判定 |
|---|---|---|---|
| #R76 実定数（150km / 48h / J≥0.15 / 密ペア→**0.06**） | 315 | **43** | **破綻**。無関係な記事が同居 |
| 緩和規則 0.06 を除去 | 447 | 10 | まだ過統合 |
| **stopwords ＋ J≥0.25〜0.35** | **489** | **9** | **妥当** |
| J≥0.45 | 560 | 7 | 過小統合 |

**根本原因**: 国レベルに解決された subject は座標が**完全一致（d=0km）**するため
`d<30km && dh≤24h` が常に真になり、**Jaccard 0.06 だけが最後の関門**になる。
⇒ **緩和規則は使わない。国の代表点を「近い」として扱わない。**

### 5.2 3段で判定する

1. **決定論の候補生成** — 時間窓・地理・共有 entity・event/action 語・`title_fingerprint`。
   全 Event と総当たりしない（#R76 は 600件で 179,700 ペアを回していた）。
2. **embedding** — pgvector の ANN で言い換えを拾う。決定論トークンでは
   「Walmart 決算」と「Walmart が Apple Pay 対応」を分けられても、言い換えは拾えない。
3. **LLM** — **中間帯だけ**。返答は JSON schema・候補IDの実在・時刻整合・地理整合を
   サーバー側で検証してから採る。モデルの返答だけで確定しない。

**強い決定論一致は AI を通さず統合する。明確に違うものは新 Event にする。**

### 5.3 Union-Find の推移を信用しない

A–B と B–C が近くても A–C が別事件のことがある。edge を結んだ後に **cluster 全体**で
時間幅・地理範囲・主要人物・組織・event type を再検証する。

---

## 6. カテゴリ

優先順位は **① フィードのセクション → ② 決定論規則 → ③ embedding 分類器 → ④ 曖昧なものだけ LLM
→ ⑤ 人手の上書き**。

実測: キーワード規則だけでは英語見出しの **50.6% が未分類**だった。一方、セクション別フィードは
**15/15 稼働**し Business / Climate & Weather / Politics & Conflict / Science & Health /
Technology / World の6つを**フィード自体が持つ**。⇒ 分類器が要るのは **Disasters と Society だけ**。

内部は multi-label を許し、UI には primary を1つ出す。`primary_category` /
`secondary_categories` / `confidence` / `classifier_version` / `manual_override` を保存する。

---

## 7. 翻訳

**一次措置: 日本語へのみ。英語・日本語以外の UI 言語には英語を見せる。**

- 翻訳は**サーバー側で生成し `news_event_i18n` に永続キャッシュ**する。
  クライアントの AI 枠を消費せず、未ログインでも読める。
- 対象は Event の**代表見出し**（および将来の要約）。カテゴリ名・UI 文言は既存の9言語 i18n が持つ。
- ⚠ **地名は別問題**。`IntMapNewsGeo` が返す `name` は `{en, jp}` の2言語しかない。
  他の7言語では地点ピルが英語になる（#R313 追記2 と同じ形の穴）。Phase D で扱う。
- ⚠ 既存の「Translate titles」ボタン（`#ai-translate-btn` → `aiTranslateTitles()`）は
  **article mode のものとして残す**。Event mode の翻訳は事前生成なのでボタンを出さない。

---

## 8. 保持期間

| 対象 | 保持 | 根拠 |
|---|---|---|
| `news_articles` | **72時間**（表示窓と同じ） | `CONSTITUTION.md` §5 の既存規則を維持 |
| `news_events` | **30日** | 保存・共有URL・Atlas 参照・merge redirect が生き残る必要がある |
| `saved_news_events` | **無期限** | ユーザーが明示的に保存したものを通常の retention で失わない |
| `news_cluster_decisions` | 30日 | 誤統合の原因を後から説明できる期間 |

Event は構成記事が表示窓を越えても残せる。**hard delete と archive を分ける**——
merge redirect と split 履歴は消さない。

⚠ この表は `CONSTITUTION.md` §5 の改訂を伴う。改訂の理由は `DECISIONS.md` に記録する。

---

## 9. UI

**既存の視覚言語と密度を維持する。Ground News 風の独立画面や巨大モーダルを作らない。**

実測した現行 UI（本番・1440×900）:

- サイドバー **400px**。News は**既定タブではない**（起動時はウィジェットボード）
- 検索欄は**独立した行**（y=167.3）。`All / Saved` と `Subject / Publisher` が**同じ行**（y=216.7）
- `.news-item` は初期 **30件**（`NEWS_BATCH=30`）・平均 **123.6px**・gap 9px
- カード内の実在要素は8つ: `.btn-bookmark` / `.loc-chip` / `.news-date` / `.news-title` /
  `.news-pub` / `.btn-read`（画像・要約は無い）
- 地図のピンは **140件**（source `news-points`、layer `news-pulse` / `news-dots` / `news-labels`）

**Event card は `.news-item` を発展させる。** 上段＝代表地点＋`Updated …`、中段＝代表見出し、
下段＝代表媒体2〜3件＋`N sources`、右上＝★。カード全体は代表地点へ fly（現行どおり）。
`N sources` が同じ News surface 内で Event detail を開く。

**カテゴリ chips** は `All/Saved | Subject/Publisher` の**下に横スクロールの1行**として足す。
一覧と地図へ同時に適用する。

**正直に出すもの**: 場所不明・低確度・処理中・stale・source failure・partial。
⚠ 実測で現行は **140件中 31〜35件（22〜25%）が「場所不明」**で、海の上にばらまかれている。

---

## 10. Atlas

- capability は **既存の Registry 1本**（`js/atlas-capabilities.js`）に足す。第二の表を作らない。
- **news feed の state provider は現在0件**。Event 用に1つ登録する
  （selected event id / selected category / visible event count / visible pin count /
  freshness / source failure count / fallback mode / processing state）。
- `research.events` は**新パイプラインへ載せ替える**。第二のクラスタリング実装を残さない。
- 「表示した」「選んだ」「描いた」は**実状態を観測してから**名乗る（`produces-observed`）。

---

## 11. 運用者の修正

`admin.html` に **News Events タブ**を1枚追加する。

low-confidence 待ち行列 / Merge / Split / Reassign / 代表見出し・地点・カテゴリの変更 /
reviewed Event の自動更新ロック / undo / 監査証跡 / 分類器の再実行。

運用者には **score・共有 entity・相違 entity・地理距離・時間差・トークン類似・embedding 類似・
モデルの判断・source family・記事の時刻**を見せる。自動化が間違った理由を隠さない。

---

## 12. 段階導入

| Phase | 中身 | UI への影響 |
|---|---|---|
| **A** | 現状監査・#R76 検証・source matrix・設計文書・費用見積 | 無し（完了） |
| **B** | migrations・Source Registry・記事の正規化・Event パイプライン・カテゴリ・計測 | **無し**（article mode のまま・shadow) |
| **C** | ラベル付き corpus・admin 待ち行列・merge/split・閾値調整・保持と費用の実測 | 無し |
| **D** | `articles / events` の dual-read フラグ・Event card・chips・ピン・detail・検索・保存 | **フラグの裏** |
| **E** | Capability・state provider・observer/verifier・research 証拠・本番 smoke → 既定へ | 既定切替 |

⚠ **`USE_SERVER_NEWS=true` に切り替えて完了としてはならない。** 旧 server feed は記事単位で、
永続 Event・カテゴリ・Source Registry・増分更新・merge/split・品質指標・費用指標を持たない。
⚠ **経路を変えたら同じ変更でプライバシーポリシー（`js/legal-text.js`）を直す。**
`scripts/doc-facts.mjs` §15 がこの一致を機械的に検査している。

---

## 13. 品質評価

実装前に baseline を測り、実装後も**同じ corpus** で比較する。

- 指標: pairwise precision / recall / F1・B-cubed・over-merge rate・under-merge rate・
  category accuracy・location accuracy・source count accuracy・p50/p95 latency・cost/Event
- **precision 優先**。baseline を測った後、初期目標候補は Event precision 95% / recall 85%。
- 本文は無断保存しない。評価には合法な metadata・snippet・ID を使う。

Phase A で確認済みの誤り例（実データ）:

- **不足統合**: TikTok $400M 和解が `ByteDance` と `United States` の2 Event に分割（地点の違い）
- **不足統合**: 恒大の創業者判決が en(7件) と jp(6件) に分割（言語の違い・英語のみ収集で解消）
- **転載の水増し**: 「Mount Fuji」6件のうち3件は Sinclair 系列の同一タイトル

---

## 14. 費用（実測ベース）

| 項目 | 現行量 | 直接RSS 導入後（3〜5倍見込み） |
|---|---|---|
| embedding（`text-embedding-3-small` $0.02/M） | 1.31M tok/月 = $0.03 | $0.10〜0.20 |
| LLM 判定（中間帯・Haiku級） | — | $3〜8 |
| **日本語翻訳**（Event 600〜1,000件/日・1言語） | — | **$3〜4** |
| Supabase storage（記事 0.71MB/日・embedding 1536次元30日で 97MB） | 0.25 GB/年 | 1〜1.2 GB/年 |
| **合計** | — | **月 $10〜15**（上限 $50） |

⚠ 既製の Event API（NewsAPI.ai $90/月〜・NewsAPI.org $449/月）は**買わない**。
媒体選定もクラスタリングも他社のものになり、Source Registry と「主要媒体に限定」の方針が成り立たない。

---

## 15. やらないこと（初期スコープ外）

政治バイアス評価 / Factuality rating / long-tail の大量収集 / 無断の全文 warehouse /
paywall 回避 / claim contradiction engine / ownership visualization / 巨大な News UI 再設計 /
根拠のない AI 要約 / 全 Event の常時 LLM 再評価 / 全記事と全 Event の総当たり。

**ただし将来足せるよう、証拠・relation・監査証跡は失わない。**
