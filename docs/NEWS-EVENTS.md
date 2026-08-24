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

⚠⚠⚠ **そして「その媒体が書いた」は「それは記事である」を意味しない**（#R351 実測）。
`google_news_site` の `site:` 検索は**そのホストで索引されている何か**を返すので、記者ページ・
タグページ・節見出し・企業データベースのページ・銘柄ページが記事として届く。直接 RSS にも
ポッドキャストの回・定期物の索引が混ざる。取り込み 1,367 件に対する内訳（2026-08-23）:

| 落とした形 | 実測 | 例 |
|---|---|---|
| 語数 5 未満（要約 8 語以上＋canonical URL があれば通す） | 34 | `HILLEL ITALIE` / `Tech Life` / `Yonhap News Summary` / `FEIA.DE` |
| 定型の非記事表題 | 60 | `…: Profile and Biography`（Bloomberg 人物 DB）/ `About … (HBF.TO)`（Reuters 銘柄）/ `(EDITORIAL from …)` |
| **索引ページ（`|` のあとが配信の宣伝）** | **43**（2026-08-24 実測・active 1,377 本中の **3.1%**） | `(IBX.N) \| Stock Price & Latest News`（Reuters 33）/ `Weather, Hurricanes and Storms \| Latest News & Updates`（AP 10） |
| **多主題のまとめ記事** | 5〜6 | `PODCAST: …` / `…, Trump's Ballroom, More` / `…, and other Middle East developments` / 要約が `The following is …` |
| 登録外のホスト（帰属できない） | 91 | CNN の World RSS に混ざった `fool.com` 広告 6 件を含む |

⚠⚠ **まとめ記事は「惜しいから残す」ではなく「橋になるから落とす」。** 実測: Reuters の
«PODCAST: Trump tariffs hit Canada, ballroom reprieve, … and Somali piracy» が**カナダ関税**と
**ソマリア海賊**という無関係な 2 つの塊をつなぎ、NYT の海賊の記事が Quebec 分離独立の記事と
同じ Event に入った。#R334 が閾値 ×0.70 で観測した「両方に触れた 1 本が橋になる」の、
閾値ではなく**入力側**の形である。

⚠⚠⚠ **「`|` があれば索引ページ」にしてはならない。** 実測 (2026-08-24): `|` を持つ見出しは
47 本あり、うち **4 本は The Guardian の署名記事**（«Time has lost all meaning \| Dave Schilling»）
である。判定するのは**最後の `|` のあとが記事の見出しか配信の宣伝か**——`Latest` / `Breaking` /
`Stock Price` / `Scores` / `Stats` / `Live updates` があるときだけ落とす。この規則は
`|` を持たない見出しに 1 本も当たらない（実測）。

⚠ **この門は近似である。** だから落とした数と理由を `news_ingest_runs.rejects` に必ず出す
（§13）。効きすぎたときも、効かなくなったときも、次のラウンドが数字で見られるように。

⚠⚠⚠ **門が「在る」ことと「効いている」ことは別である。** #R351 が書いた Yonhap 索引記事の
規則（`^…the following (is|are)`）は、末尾の `\b` が**バックスペース文字 1 個（0x08）に潰れて
いた**ため、**一度も発火していなかった**。JavaScript としては妥当なので `node --check` も
lint も黙り、門は緑のまま索引記事を通し続けていた。⇒ `scripts/static-checks.mjs` の
`regex-control-char` が、**正規表現の中の生の制御文字**を落とす（意図的な区切り文字は
文字列リテラルの中にいるので当たらない）。

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

⚠⚠⚠ **同じ穴が「国」以外にも開いていた（#R351 実測）。** `IntMapNewsGeo` が
`kind:'org'` に解決した subject は**その組織の本部座標**なので、同じ会社の無関係な 2 件は
やはり距離ゼロになる。実データで «Samsung Electronics が株主還元に最大 110 兆ウォン» と
«Samsung SDI が Samsung Display 株を 4.45 兆ウォンで売却» が 1 件に融合していた。
⇒ **代表点しか持たない解決は 3 種類**——`country` / `admin1`（州県省）/ `org`。
`news-cluster.js` の `DEFAULTS.representativeKinds` がその一覧で、そこに入る種類は
閾値を**下げるのではなく上げる**。`city` / `seat` / `flashpoint` / `feature` は
「出来事が起きた場所」なので入れない。

### 5.2 3段で判定する

1. **決定論の候補生成** — 時間窓・地理・共有 entity・event/action 語・`title_fingerprint`。
   全 Event と総当たりしない（#R76 は 600件で 179,700 ペアを回していた）。
2. **embedding** — pgvector の ANN で言い換えを拾う。決定論トークンでは
   「Walmart 決算」と「Walmart が Apple Pay 対応」を分けられても、言い換えは拾えない。
   ⚠⚠⚠ **この段は実装されているが、現在の鍵では 1 本も動かない。** 実測 (2026-08-24):
   `text-embedding-3-small` は **403 `model_not_found`**（"Project … does not have access to
   model"）で、`GET /v1/models` は**このプロジェクトに 1 件しか返さず**、その 1 件は埋め込み
   モデルではない。⇒ `news-ingest` の `embed` 段は ① 何を頼んだか (`configured_model`)、
   ② 鍵が何に届くか (`available_embedding_models`)、③ 何が起きたか (`error`) を**応答と
   `news_ingest_runs` の両方に**出して止まる。埋め込みモデルに届く鍵が入った日に、
   `NEWS_EMBED_MODEL` を設定するだけで動き出す。
   ⚠ **だから recall の段を埋め込みだけに依存させてはならない**（§5.5）。
3. **LLM** — **中間帯だけ**。返答は JSON schema・候補IDの実在・時刻整合・地理整合を
   サーバー側で検証してから採る。モデルの返答だけで確定しない。

**強い決定論一致は AI を通さず統合する。明確に違うものは新 Event にする。**

### 5.3 Union-Find の推移を信用しない

A–B と B–C が近くても A–C が別事件のことがある。edge を結んだ後に **cluster 全体**で
時間幅・地理範囲・主要人物・組織・event type を再検証する。

⚠⚠⚠ **増分の側では「最初の 1 本」が誰にも検算されていない（#R351 実測）。**
新着を候補 Event へ載せる条件は「メンバーの `transitivity`（34%）以上と一致すること」だが、
**メンバーが 1 件の Event ではその条件が 1 本の辺で必ず満たされる**——推移の検算が効かない。
実データの決定履歴がそのまま原因を言っている:

```
592 Samsung SDI（別の発表）→ 新規 Event（メンバー 1）
591 URGENT             → SDI と一致 1/1 = 100%  ⇒ 参加
590 LEAD               → 2 件中 1 件と一致 50%   ⇒ 参加
588 2nd LD             → 3 件中 2 件と一致 67%   ⇒ 参加
```

⇒ **新しい定数は足さない。同じ `transitivity` を、育ったあとの塊の全員に当てる。**
他のメンバーの 34% 未満としか合わない者はその塊の一員ではないので、`news_event_articles`
から外して自分の Event へ移す（`findOutlier` / `placeArticle`）。実測: 上の例では
**SDI が外れ、残る 3 本は残った**。1 回の取り込みで外れるのは 3〜4 件。
⚠ 一度に 1 人だけ、かつ残りが 2 件を下回るなら外さない——全員が弱く結ばれた塊は
「誰が余計か」を言えないので、判断は §11 の review queue に残す。

### 5.5 塊どうしを結ぶ (`link` 段・Phase C)

⚠⚠⚠ **新着に候補を足すだけでは、すでに分かれた塊は永久に分かれたままである。**
§13.1 が recall の代表例として挙げたカナダ・米国の関税（1 日で 5 つの Event）は、
どれも**既存の** Event なので `assign` の候補生成からは触れない。

候補の入口は 2 つあり、**片方は鍵を必要としない**:

| 入口 | 何を見るか | 使えるか |
|---|---|---|
| 珍しい語の共有（`eventPairCandidates`） | Event ごとの語の和集合を転置索引にし、IDF 質量の大きい対から見る | **常に使える** |
| embedding の近傍（`news_event_link_candidates`） | メンバーどうしの cos が高い Event 対 | 鍵が埋め込みモデルに届くときだけ |

**判定は `eventsAgree` 1 本**で、規則は `assign` と同じ——交差する対のうち
`transitivity`（34%）以上が「同じ」と言えば同じ出来事である。**新しい推移の規則を作らない。**

⚠⚠⚠ **ただし割合だけでは足りない。** 分母が小さいと 1 本の辺で満たされる——#R351 が
`findOutlier` で踏んだ「メンバー 1 件の Event では推移の検算が必ず満たされる」の、塊どうし版
である。実測 (2026-08-24・本番 898 Event) で空撃ちした 17 対を 1 件ずつ人が読んだ結果:

| 規則 | 結ばれる対 | 誤り |
|---|---|---|
| `share ≥ transitivity` だけ | 17 | **2**（「インディアナ 11 日間の停電」←→「バルト海の暴風雨で 2 人死亡」／「イスラエルがヒンド・ラジャブ殺害を調査」←→「ガザ中部で 4 歳児ら 3 人殺害」） |
| ＋ `matched ≥ linkMinMatched`（3） | **8** | **0** |

⇒ `DEFAULTS.linkMinMatched = 3`。⚠ 落ちた 7 対は失われるのではない——通った 8 対が塊を
大きくするので、**次の run では同じ相手に対する対の本数が増えて条件を満たす**。この段は
1 回で終える仕事ではなく、run をまたいで収束する仕事である。

⚠ `manual_lock` の Event は機械が動かさない。生き残るのは記事の多いほう（同数なら古いほう）で、
代表見出し・地点・分類は次の取り込みで塊全体から選び直される。
⚠ 統合は `news_event_merge_into(source, target, actor := null, note, decided_by)` を通る——
**人が呼ぶ口と同じ 1 本**で、`actor` が null の行が機械の操作である。だから `manual_lock` を
立てない（機械が立てると、その Event は以後どの取り込みでも更新できなくなる）。

⚠⚠⚠ **走っていない機構の名前を書かない。** この関数は当初、機械の merge に無条件で
`assigned_by='embedding'` を書いていた。実測 (2026-08-24): **埋め込みを持つ記事は本番に 0 行**
なのに、そう名乗る辺が **23 本**あった——`link` 段の候補は語からしか出ていないからである。
`news_event_articles.assigned_by` は「どの段が何件を運んだか」を後から数えるための列なので、
走っていない機構の名前が入ると、その列は情報ではなく**嘘**を持つ。
⇒ **何で決めたかは呼び出し側が引数で渡す**（`p_decided_by`。値も関数側で確かめる）。
`link` 段は `pairVerdict` の `code` から導き、候補が語から来たときは note にも
«no embedding (candidate came from shared rare words)» と書く。
⚠ 監査の note も同じ罠を踏んでいた——`Number(null).toFixed(3)` が `"0.000"` になるので、
**cos が無いのに「cos 0.000」**と 11 行に書かれていた。**無かったものを 0 と書くのは、
無かったと書くことではない。**
⚠ 数える側は `scripts/news-events-eval.mjs --from-db` が常に印字する
「⚠ 走っていない機構を名乗る辺」。**この行が 0 でなくなった日が、また同じことが起きた日である。**

### 5.4 増分の候補生成（本番が通る経路）

窓 = 直近 48 時間（記事の保持は 72 時間なので、実際には表の全部）。その窓から
**転置索引**を作り、`df` が窓の 4%（上限 40）を超える語は投稿リストに入れない
——頻出語の投稿リストは窓の大半になり、「候補を絞る」という索引の仕事を止める。
新着 1 本につき、語を共有する記事が属する Event を **IDF 質量の大きい順に最大 12 件**だけ
見て、各 Event のメンバー最大 20 件と `pairVerdict` を撃つ。
⚠ `clusterArticles()` は評価と backfill 用の総当たりで、**本番はこれを通らない**。
⚠ 評価スクリプト（`scripts/news-events-eval.mjs`）も**同じ関数**を通る——測るものと
動くものが別の実装になると、#R334 の「fixture の精度は精度の測定になっていない」を
もう一度踏む。

実測 (2026-08-23・本番): 冷えた状態で 779 本 → 620 Event が **1,005 ms**、
1 本あたり p50 0 ms / p95 1 ms。定常状態（新着 4 本）で **519 ms**。

---

## 6. カテゴリ

優先順位は **① フィードのセクション → ② 決定論規則 → ③ embedding 分類器 → ④ 曖昧なものだけ LLM
→ ⑤ 人手の上書き**。

実測: キーワード規則だけでは英語見出しの **50.6% が未分類**だった。一方、セクション別フィードは
**15/15 稼働**し Business / Climate & Weather / Politics & Conflict / Science & Health /
Technology / World の6つを**フィード自体が持つ**。⇒ 分類器が要るのは **Disasters と Society だけ**。

⚠ **段はもう 1 つある（#R351）。** フィード全体の `category` と見出しキーワードの**あいだ**に、
**媒体自身がその 1 本に付けたタグ**（RSS の項目内 `<category>`）が入る。実測 (2026-08-23):
Guardian は `domain="…/world/africa"` 付きの slug、NYT は `des`/`nyt_geo`/`nyt_per`/`nyt_org` の
4 taxonomy、The Japan Times は `SOCCER` / `CULTURE` の素の節名、France 24 は `Africa`。
BBC・Yonhap・Google News は 1 つも出さない。**出す媒体からは受け取り、出さない媒体のために
捨てない。**
⚠⚠ **実体のタグは節のタグではない。** 実測で外した 1 件はこれが原因だった——
«Turkey Requests Netanyahu's Arrest» に付いた NYT の `nyt_org` タグが
`Interpol (International Criminal Police Organization)` で、その中の `police` を節名として
読んで政治の記事を society にしていた。⇒ **実体を名指す taxonomy は分類に使わない**
（保存はする。§5.2 の「共有 entity」の材料であり、`news_articles.entities` に入る）。

⚠ **上書きしてよいのは `world` と空だけ。** business / technology / science_health /
climate_weather / politics のフィードは「編集部がそう分類した」という強い証拠で、見出しの
単語より強い。`world` は「国際面」であって主題ではないので、そこだけ譲る。

⚠ **同じ語をもう一度数えるのは、証拠が増えることではない。** 実測で外した 1 件——
«Indiana **residents** endure 11th day without power after storms» は `residents` 1 語が
見出しと要約に出ただけで発火点に届いていた。⇒ 発火の条件は「4 点以上・相手に 2 点差以上」に
加えて **強い語 1 つ、または別々の語 2 つ**。

内部は multi-label を許し、UI には primary を1つ出す。`primary_category` /
`secondary_categories` / `confidence` / `classifier_version` / `manual_override`、そして
**どの段が何を根拠に決めたか**（`category_evidence`）を保存する。

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

**実装 (#R351)**

- 訳す相手は Event の代表見出し。代表見出しは記事が増えると変わる（medoid で選び直す）ので、
  `news_event_i18n.source_title_fp` に**訳した見出しそのものの SHA-256** を持ち、
  **見出しが変わったときだけ**払う。⚠ `news_events.updated_at` で判定すると、記事が 1 本
  増えるたびに同じ文を翻訳し直して課金される。
- 1 回の run で最大 80 件・20 件ずつ。返答は **id が今回渡したものであること・文字列であること・
  空でないこと・400 文字以内であること**をサーバー側で確かめてから採る。
- ⚠⚠ **書記体系が混ざった訳は採らない。** 実測 (79 件中 1 件): «101 **रन** のリード» ——
  `run` がデーヴァナーガリーで返っていた。日本語の見出しにデーヴァナーガリー・アラビア・
  ヘブライ・タイ・ベンガル・タミル・テルグが出ることは無いので、機械的に落とせる。
  落とした Event は次の run で再び候補になる（英語の見出しが出るだけで、壊れた訳は残らない）。
- ⚠⚠⚠ **`AI_MODEL` を無条件に信じてはならない。** これは Atlas 用の secret 1 つを 9 本の
  Function が読む形で、実測 (2026-08-23) では `AI_MODEL=gpt-5.6-terra` がこのプロジェクトの鍵で
  **403** を返す。`ai-proxy` はそれを知っていて 403/404 のとき `gpt-5.6-luna` へ 1 回だけ
  retry する (#R148/#R150)。**`refresh-news` にはその retry が無い**——#R334 が測った
  「`analyzed_by='ai'` が 1,651 行中 0 件」はこれである。⇒ `news-ingest` は
  ① `NEWS_TRANSLATE_MODEL` で翻訳のモデルを**独立に**選べるようにし、② それでも 403/404 なら
  同じ既知の代替へ 1 回だけ落ち、③ **失敗した理由を応答と `news_ingest_runs` の両方に出す**。
  黙って 0 件になる AI 経路をもう一度作らない。

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

**実装 (#R351)**: `news-ingest` の `prune` 段。数字の正本は
`supabase/functions/_shared/news-ingest.js` の `RETENTION`（`tests/r351-checks ⑭` が
この表と突き合わせる）。⚠ Event が消えるのは **3 つとも当てはまらないとき**だけ——
★保存されている / merge の行き先である / 自身が merged。**merge の redirect を消すと、
古い ID から新しい ID へ辿る道が無くなる。**

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

**Event card は `.news-item` を発展させた**（`js/news-events.js` の `decorate()`）。
新しいカードは無く、既存の `.news-item` に足すのは 3 つだけ——カテゴリ・`Updated` の印・
`N sources`。カード全体は代表地点へ fly（現行どおり）。`N sources` が
**同じ News surface 内で**（既存の `#news-reader-pane`）Event detail を開く。

**カテゴリ chips** は `All/Saved | Subject/Publisher` の**下に横スクロールの1行**
（`#news-cat-chips`）。⚠ **0 件のカテゴリは出さない**——押せない chip は嘘である。
⚠ 一覧と地図へ同時に適用される。これは規律ではなく**構造**で、述語は
`IntMapNewsEvents.passes()` 1 本しかなく、`computeFilteredNews()` がそれを呼び、
ピンはその戻り値から作られる。片方だけに効く状態を作れない。

**Event detail が出すもの**（すべて機械的に検証できる事実だけ）:

- 代表地点・カテゴリ・代表見出し（`jp` では訳、原文も添える）
- **初出と最新**、経過時間
- **Coverage** — どの媒体がいつ何と書いたか。初報に印、**同一系列の 2 本目には「同系列」**の印
- **媒体間で食い違っている数量** — §9.1
- **この出来事の組み立て方** — 決定論で束ねたこと、独立媒体を資本系列で数えていること、
  分類を決めた段、運用者が固定したか、地点が特定できたか

**正直に出すもの**: 場所不明・低確度・stale・fallback。
⚠ 実測で現行は **140件中 31〜35件（22〜25%）が「場所不明」**で、海の上にばらまかれている。
Event 側では `state().unplacedCount` がそれを数え、詳細は「地点は特定できていない」と書く。

### 9.1 「媒体ごとの主張や数値が異なる場合、その相違を保持して表示できる」

⚠⚠⚠ **バイアス評価はしない**（§15）。出すのは**原文にそのまま書いてある数量**だけで、
IntMap は「どちらが正しいか」を言わない。「両者はこう言っている」だけを言う。

- 規則の正本は **`js/news-claims.js`**（`makeNewsClaims()`）。⚠ **表示の層に置かない**——
  #R386 は `js/news-events.js` の factory の奥に書いたので、**ブラウザの外からは誰も呼べず**、
  歩留まりも精度も測れなかった（#R340 が `research.events` で直したのと同じ形）。いまは
  UI と `scripts/news-events-eval.mjs --diffs` が**同じ 1 本**を呼ぶ。
- 取り出す種類は 5 つ——死者 / 負傷者 / 行方不明 / 金額 / 割合。1 本の文から**すべての**一致を取る。
- ⚠⚠⚠ **英語のニュースは死者数を「動詞が先」で書く。** 実測 (2026-08-24・active 1,367 本):
  «kills 30» / «killed 16» / «kill at least 10» が **24 件**、«30 killed» は **4 件**。#R386 は
  後者だけを見ていたので、災害と紛争の数量をほとんど読めていなかった（実際に発火したのは
  `money` だけ）。⇒ 両方の綴りを持つ。**実測: 抽出 76 → 108、数量を持つ Event 51 → 66。**
- ⚠⚠ **年齢を死者数と読まない。** «Girl, 17, killed in Swedish sword attack» の 17 は年齢で、
  #R386 の綴りはこれを死者数として取り出していた（当時の 4 件中 1 件）。⇒ 数字がコンマで
  終わる形と «N-year-old» の直前は取らない。
- ⚠ **相違と呼ぶのは、別々の `source_family` が別々の値を言ったときだけ。**
  同じ系列の速報 3 人 → 続報 5 人は**更新**であって相違ではない。
- ⚠⚠⚠ **「値が違う」は「食い違っている」ではない。** 実測 (2026-08-24・本番 1,069 Event):
  この規則が出したのは 2 件で、**うち 1 件は誤り**だった——香港の上場の塊で Shein の IPO
  （$1.8B / $27B）と Alibaba の売出（$10B / $10.2B）が並び、「媒体が食い違っている」と
  表示されていた。**同じ記事群に出てくる別々の数字**であって、同じ数字についての相違ではない。
  ⇒ **同じ量についての別々の説明だけを相違と呼ぶ。** 2 つの値がそれでありうるのは、互いに
  丸めや精度の差の範囲にあるときで、倍半分も違えば別の事実である。実測: 正しい 2 組は
  min/max = **0.966**（Uber の制裁金: Reuters $966M / AP «nearly $1 billion»）と **0.980**
  （Alibaba: Reuters $10B / CNBC $10.2B）、誤りの相手は **0.18 / 0.37**。
  ⇒ `sameQuantityRatio = 0.5`（＝2 倍以内）。閾値は「隙間の真ん中」ではなく**意味**で選んだ
  ——同じ数字の別々の報じ方は丸めの差であり、2 倍は丸めではない。母数は薄い（2 Event・4 値）。
  ⇒ **精度 1/2 → 3/3**（綴りを広げたあとの実測。新しく出たのは日本の地震で、
  AP «injuring more than 30» と Al Jazeera «37 injured»——min/max 0.811）。
- 表示は原文の断片そのままと出典名、そして**前後の語**（何についての数かが分かる）。
  要約も言い換えもしない。
- ⚠ **歩留まりの天井はフィードが決める。** 実測 (2026-08-24): active 1,367 本のうち要約を
  持つのは **683 本（50%）**で、要約が 0% なのは **Reuters 231 / Bloomberg 182 / AP News 160**
  ——`google_news_site` の `site:` 検索は `<description>` に**リンク一覧**を入れるので
  （§3）、この 3 社からは見出ししか読めない。死者数・負傷者数は要約にしか出ないことが多い。

---

## 10. Atlas

- capability は **既存の Registry 1本**（`js/atlas-capabilities.js`）に足した:
  **`news.category`**（`legacy: newsCategory`・target `text`・produces `panel,map`・
  lazy `newsEvents`）。⚠ `lazy` 列は `js/lazy-modules.js` に実在する id でなければならない
  （#R347 が 4 件の「存在しない lazy を名指した行」を測っている）。
- **state provider `news`** を `js/atlas-state.js` に登録した。⚠ 答えは 3 通りある——
  出来事モード / 記事モード / そもそも一覧が無い。**`null` は 3 つ目だけ**で、2 つ目を null に
  すると「News が無い」と「News が記事単位である」が見分けられなくなる。
  出す事実: `mode` / `selectedEventId` / `selectedCategory` / `visibleEventCount` /
  `loadedEventCount` / `visiblePinCount` / `unplacedCount` / `multiSourceCount` /
  `categories` / `freshestArticleAt` / `loadedAt` / `savedCount` / `lastError`。
- `research.events` は**新パイプラインへ載せ替えた**。出来事モードでは
  `HOST.globalData` の `_event` を**そのまま**使い、**ブラウザ側で束ね直さない**
  ——再計算するとブラウザに載っている 200 件しか見ないので、窓全体（1,163 件）を見た
  サーバーの答えより必ず悪くなる。記事モードの経路（`groupNewsEvents`）はそのまま残る。
- 「表示した」「選んだ」「描いた」は**実状態を観測してから**名乗る（`produces-observed`）——
  `news.category` は絞った結果の件数とピンの本数を state provider から読み、
  0 件なら `NO_RESULTS`、ピンが 0 なら `partial` を立てる。

---

## 11. 運用者の修正

`admin.html` に **News Events タブ**を1枚追加した（3 つの面: Review queue / All events /
Operator log）。

- **Review queue** = 機械が最も自信の無いもの。⚠ 単独記事の Event は判定が 1 本も走って
  いないので確度を並べても意味が無い——`article_count ≥ 2` かつ未 review に絞り、
  `cluster_confidence` の低い順に出す。
- **Merge**（Event を 2 つ選ぶ）/ **Split**（記事を選んで新しい Event へ）/
  **Reassign**（記事を選んで既存の Event へ）/ **代表見出し・カテゴリ・地点の上書き** /
  **Lock** / **Undo**。
- 運用者には score・`assigned_by`・件数・独立媒体数・確度・地点・分類を決めた段を見せる。

⚠⚠⚠ **どの操作も SECURITY DEFINER の RPC 1 本を通る。表を直接 UPDATE しない。**
1 回の操作が `news_event_articles` の付け替え・`merged_into`・件数の再計算・監査の書き出しの
4 つに分かれるので、途中で失敗すると**どの表も嘘をつく**。

| RPC | すること |
|---|---|
| `news_event_merge(source, target, note)` | 人の merge（`news_event_merge_into` を admin 確認のうえ呼ぶ） |
| `news_event_merge_into(source, target, actor, note)` | 機構そのもの。`actor` が null なら機械（`link` 段） |
| `news_event_reassign(article_ids, target, note)` | `target` が null なら split |
| `news_event_update_meta(event, title, category, lng, lat, place, clear_location, lock, note)` | 上書き。**override の旗も立てる**（値だけ書くと次の run が黙って戻す） |
| `news_event_undo(action)` | `news_event_admin_actions` の 1 行を、**その操作が変えたものだけ**戻す |
| `news_event_recount(event)` | 件数と独立媒体数（`source_family` 単位）の再計算 |

⚠⚠⚠ **`public.is_admin()` を呼んではならない。** リポジトリの baseline はその名前の
**引数なし**の関数を宣言しているが、**本番に在るのは `public.is_admin(uid uuid)` だけである**
（2026-08-24 実測）。#R334 の migration が本番に通ったのは、述語をインラインで書いていたから
である。⇒ 上の RPC はどれも
`exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)`
を自分で確かめる。grant は「呼べる」であって「やってよい」ではない。

⚠ **`news_articles` と `news_cluster_decisions` は admin にも書かせない**（§4）。上の RPC は
どちらの表も UPDATE しない。運用者が直すのは「どの記事がどの Event に属するか」だけである。

⚠ 監査証跡は `news_event_admin_actions`。`before` は**元に戻すのに要るものだけ**を持つ——
表全体の写しを復元すると、その後の取り込みで増えた記事まで巻き戻る。
⚠ `actor` / `reverted_by` に `auth.users` への FK を張らない（`news_events.reviewed_by` と
同じ理由。§4）。
⚠ ただし**尊重する側はもう実装されている**——`news-ingest` は `manual_lock` が立つ Event の
代表・分類・地点を上書きせず、観測された事実（件数・時刻）だけを更新する。
`category_override` / `location_override` も個別に効く。

---

## 12. 段階導入

| Phase | 中身 | UI への影響 | 状態 |
|---|---|---|---|
| **A** | 現状監査・#R76 検証・source matrix・設計文書・費用見積 | 無し | **完了** |
| **B** | migrations・Source Registry・記事の正規化・Event パイプライン・カテゴリ・翻訳・計測・保持 | 無し（article mode のまま・shadow） | **完了** |
| **C** | `link` 段による recall・admin 待ち行列・merge/split/reassign/undo・閾値の実測 | 無し | **完了**（embedding の段は実装済み・鍵が届かない。§5.2） |
| **D** | `articles / events` の dual-read・Event card・chips・ピン・detail・検索・★ | 出来事の一覧になる | **完了** |
| **E** | Capability・state provider・observed な produces・research 証拠・本番 smoke → 既定へ | 既定切替 | **完了** |

⚠⚠⚠ **スイッチは 2 つあり、別物である。**

| 旗 | 何の経路か | 現在 |
|---|---|---|
| `USE_SERVER_NEWS` | #R40 で止めた `current_news`（記事単位・出来事の概念なし） | **false のまま** |
| `NEWS_EVENT_MODE` | `news_events`（永続 Event・カテゴリ・Source Registry・増分・merge/split） | **true** |

⚠ **`USE_SERVER_NEWS=true` に切り替えて完了としてはならない。** 旧 server feed は記事単位で、
永続 Event・カテゴリ・Source Registry・増分更新・merge/split・品質指標・費用指標を持たない。
⚠ **経路を変えたら同じ変更でプライバシーポリシー（`js/legal-text.js`）を直す。**
`scripts/doc-facts.mjs` §15 がこの一致を機械的に検査しており、**2 つの旗の両方を見る**
（`NEWS_EVENT_MODE` が true なのにポリシーが「画面には出していません」と書いていたら赤）。

⚠ **落ちる先がある。** `IntMapNewsEvents.load()` が false（DB が無い・表が空・失敗）なら
記事モードへ落ちる。そして **検索・過去の日付（時間旅行）・多言語モードは最初から記事モード**
である——収集が英語のみ・保持が 72 時間・カテゴリが Event 単位、という前提の外にあるので、
Event 経路はそこで答えを持たない（§2 の決定 2 と §8）。

---

## 12.1 運用 — `news-ingest` (#R351)

**Edge Function 1 本**（`supabase/functions/news-ingest/`。9 本目）。論理は
`_shared/news-ingest.js`（サーバー専用。`tests/r351-checks ⑮` が `js/` と `src/` からの参照を禁じる）。

| 段 | すること | 実測 |
|---|---|---|
| `fetch` | 32 フィード取得 → 正規化 → 媒体の帰属 → 地点 → `news_articles` へ upsert | 3.5〜3.8 s・32/32 稼働・1,367 件 → 779 行 (08-23) |
| `embed` | 埋め込みの無い記事を埋める（§5.2） | **0 件**。鍵が埋め込みモデルに届かない (08-24)。理由は応答に出る |
| `assign` | 未割り当ての記事を候補 Event へ増分で載せる（§5.4） | 冷 1.0 s / 779 本、定常 0.5 s / 4 本 (08-23) |
| `link` | 意味の近い Event 対を `eventsAgree` で結ぶ（§5.5） | 2.0 s・候補 120 対 → **5 件統合**（898 → 893 Event）(08-24) |
| `translate` | 代表見出しを ja へ（§7） | 80 件 / 約 27 s / 約 $0.019 (08-23) |
| `prune` | 記事 72 h・Event 30 d・判定 30 d・★は無期限（§8） | 0.1 s (08-23) |

⚠ 段の**順序は関数が決める**（`ORDER`）——`embed` は `assign` より前（埋め込みが無ければ
第 2 段は何も足せない）、`link` は `assign` より後（新しくできた Event も対象にする）。
body で並べ替えても順序は変わらない。

- **POST のみ・`x-news-ingest-secret` ヘッダのみ・定数時間比較・fail-closed**
  （secret 未設定なら 503。実測で確認: 未設定 503 / 誤り 401 / GET 405）。
- 上流の取得は `_shared/relay-guard.js` の `fetchGuarded`（期限 15 s・6 MB・content-type）。
  ⚠ `refresh-news` は `AbortSignal` を 1 つも持っていない。同じ形を新しく作らない。
- **壁時計の予算**を見て、足りなければその段で止めて次の run に残す（既定 240 s）。
- cron は **2 本**。SQL の形は `docs/AREA-MONITORS.md` §4 と同じで、秘密は**ヘッダ**で送り、
  body で段を選ぶ:

  | job | 間隔 | body |
  |---|---|---|
  | `news-ingest-tick` | `*/20 * * * *` | `{"stages":["fetch","assign","link","prune"]}` |
  | `news-ingest-translate` | `7 * * * *` | `{"stages":["translate"]}` |

  ⚠ `embed` は cron に入れていない——**入れても 0 件で終わる**（鍵が届かない。§5.2）。
  届く鍵が入ったら `news-ingest-tick` の body に足す。それだけで動き出す。

  ⚠ **翻訳だけ間隔が違うのは、そこだけが有料だからである**（利用者の判断。§14.1）。
  間隔を伸ばすと安くなるのは、**1 時間のあいだに代表見出しが 2 度変わっても 1 回しか払わない**からで、
  翻訳そのものの単価が下がるわけではない。上限 80 件/run は 1 日 1,920 件分なので、
  実測の Event 生成量（約 620 件/日）に対して backlog は残らない。
- ⚠ `current_news` と `refresh-news` には触れない（`tests/r351-checks ⑯` が押さえる）。

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

### 13.1 Phase B の実測 (#R351・2026-08-23)

**測り方**: 本番の `news_events` / `news_articles` をそのまま読み（`--from-db`）、
**n≥2 の Event を 1 件ずつ人が読んで**「1 つの出来事か」を判定した。
⚠ ラベル付き fixture の上の数字は精度の測定になっていない（#R334 の教訓）。

| 指標 | 実測 | 母数 |
|---|---|---|
| **pairwise precision** | **98.1%** | Event 内の 267 対のうち誤りは 5 対 |
| Event 単位（n≥2 が単一の出来事か） | 95.9% | 93 / 97 |
| n≥3 の Event | 97.2% | 35 / 36 |
| 圧縮率 | 1.25 倍 | 775 記事 → 618 Event |
| 独立 2 媒体以上 / 3 媒体以上 | 53 / 17 件 | 618 中 |
| **location** — Event に代表地点がある | 73.1% | 618 中（記事側は 76.6%） |
| **category** — 目視した n≥3 の 36 件のうち妥当 | 34 / 36 | 誤り 2 = 西岸入植（society ではなく world）・オランダ GP（sport が world のまま） |
| **source count** — 独立媒体数が家族単位で正しい | 実測 誤り 0 | 同一タイトルの転載 3 例すべてが 1 票に畳まれた |
| 割り当て遅延 | p50 0 ms / p95 1 ms | 779 本 |
| translation coverage | 618 / 618 | |

**残った 5 対（誤統合）の内訳** — どれも「話題は近いが別の出来事」で、決定論の段の限界:

1. 米国債利回りの解説（NYT）と韓国政府の国債監視（Yonhap）
2. 与党の昼食会と与党の野党批判（Yonhap・同日）
3. ドイツ外相のキーウ訪問とインド外相のロシア訪問（`foreign minister visits` の型）
4–5. プレミアリーグ開幕節の Hull の試合と Ipswich の試合（`Premier League return` の型）

**不足統合（recall）の代表例**: カナダ・米国の関税は 1 日で **5 つの Event** に分かれた
（交渉決裂 / 50% 発動 / dollar-for-dollar / 報復開始 / 経済への影響）。言い換えを結ぶのは
embedding の仕事で、**Phase C**（§5.2 の第 2 段）。⚠ **ANN index はデータが入ってから作る**
——空の表に張った ivfflat はリストを学習できない。

### 13.2 Phase C の実測 (2026-08-24)

**測り方**: `node scripts/news-events-eval.mjs --from-db --link` は、本番の表をそのまま読んで
`link` 段が**何を結ぶか**を、**結ぶ前に**印字する。⚠ 呼ぶのは Edge Function が呼ぶのと同じ
2 つの関数（`eventPairCandidates` / `eventsAgree`）で、測るものと動くものを別にしない。

| 指標 | 実測 | 母数 |
|---|---|---|
| 着手時 | **記事 1,163 / Event 898**・圧縮 1.3 倍・最大 11 | — |
| 空撃ちで出た対 | 17 | 候補 400 対 |
| **人が読んだ判定** | **15 正 / 2 誤（88.2%）** | 17 対すべて |
| `linkMinMatched = 3` を入れた後 | **8 対・誤り 0（100%）** | 同じ 17 対 |
| 本番で実際に統合された | **5 件**（連鎖で 8 対が 5 操作になる） | 898 → 893 Event |
| 米加関税の 5 分割（§13 の recall 例） | **5 → 2 Event**（n=14/8 媒体 と n=12/7 媒体） | — |
| `embed` 段 | **0 件**・403 `model_not_found`・鍵が到達できるモデルは全部で 1 件 | 1,163 件が pending |

⚠ 結んだ 5 件の中身は、カナダ・米国の貿易戦争 3 件・北京の人型ロボット競技会・
ソウル株式市場の同日場中と引け。**どれも 1 つの出来事である。**

---

### 13.3 Phase C/D/E のあとの読み直し (2026-08-24)

**測り方**: `--from-db` で本番の表をそのまま読み、**n≥4 の Event 33 件を 1 件ずつ人が読んだ**。

| 指標 | 実測 |
|---|---|
| n≥4 の Event | 33（active 1,069 中） |
| **そのうち単一の出来事だったもの** | **31 / 33** |
| `link` 段が結んだ 11 件 | **11 / 11 が正しい**（Alibaba の塊の汚れは `assign` 段が入れたもので、`link` ではない） |
| 索引ページの混入 | **43 本**（Reuters 33 / AP 10）。8 Event を汚し、#1221 は 3 本とも NBA の索引 |
| 多主題の digest の混入 | 1 本（NPR «…. And, …»）——イラン制裁の塊に |
| `assigned_by='embedding'` を名乗る辺 | **23 本**（埋め込みを持つ記事は **0 行**） |
| 数量の相違 | 2 件・**うち 1 件は誤り**（§9.1）。規則を直したあと **3 件・誤り 0** |

**掃除のあと**（同日）: 記事 1,377 → **1,333**、Event 1,076 → **1,041**（記事が 1 本も残らな
かった 35 件を `archived`）、地点あり **69.4% → 71.6%**、走っていない機構を名乗る辺 **23 → 0**。

⚠ **残っている誤り 2 件のうち 1 件は掃除では消えない**——«Shein の香港 IPO» が
«Alibaba の香港売出» と同じ Event に入っている。どちらも都市 `Hong Kong` に解決するので
`tight`（最も低い閾値の段）に入り、«hong kong billion» で結ばれた。#R351 が **組織**で見つけた
「代表点しか持たない解決」の、**金融都市**版である。⚠ `representativeKinds` に `city` を足すと
**大多数の出来事の閾値が上がる**ので、blunt な直し方はしない。次のラウンドの材料として測って残す。

⚠ **この数字は 1 日分の窓（72 時間）で測った 1 回の観測である。** 同じ測り方を繰り返せる
ように、測定器は `scripts/news-events-eval.mjs` として残してある。

## 14. 費用（実測ベース）

| 項目 | 現行量 | 直接RSS 導入後（3〜5倍見込み） |
|---|---|---|
| embedding（`text-embedding-3-small` $0.02/M） | 1.31M tok/月 = $0.03 | $0.10〜0.20 |
| LLM 判定（中間帯・Haiku級） | — | $3〜8 |
| **日本語翻訳**（Event 600〜1,000件/日・1言語） | — | **$3〜4** |
| Supabase storage（記事 0.71MB/日・embedding 1536次元30日で 97MB） | 0.25 GB/年 | 1〜1.2 GB/年 |
| **合計** | — | **月 $10〜15**（上限 $50） |

### 14.1 実測 (#R351・2026-08-23)

| 項目 | 実測 | 1 か月換算（見込み） |
|---|---|---|
| 日本語訳 | **620 Event で $0.154**（37,000 in / 27,000 out tok・$0.00025/Event） | **約 $4.6** |
| embedding | **$0**——鍵が埋め込みモデルに届かないので 1 トークンも使っていない（§5.2） | 届く鍵が入れば $0.10〜0.20 の見込み |
| LLM 判定 | 0（`link` 段は決定論だけで動いている。§5.5） | — |
| 収集・割り当て・保持 | Supabase の実行時間だけ（外部課金なし） | — |
| **合計（現状）** | | **約 $5**（上限 $50） |

⚠ **単価は推定であって請求ではない。** `news_ingest_runs.notes.cost_rate_usd_per_mtok` に
**使った単価**を一緒に残してあるので、あとから「どの数字を信じていいか」を言える。
⚠ **`translate` を cron に入れた時点で継続課金が確定する。** 上の数字は手動で回して測ったもので、
**見積・上限・送信されるもの・代替案を示したうえで、利用者が「頻度を落として cron に入れる」を選んだ**
（#R351 追記）。⇒ `news-ingest-translate` を**1 時間ごと**に置いている（§12.1）。
⚠ 送信されるのは**既に公表されている英語の見出しだけ**で、利用者の情報は 1 バイトも含まない。
プロバイダは Atlas と同じサーバー保持の鍵で、プライバシーポリシーに記載済み。
⚠ 止め方は 2 つある——`select cron.unschedule('news-ingest-translate');` か、
`supabase secrets set NEWS_TRANSLATE=off`（後者は cron を残したまま止められる）。

⚠ 既製の Event API（NewsAPI.ai $90/月〜・NewsAPI.org $449/月）は**買わない**。
媒体選定もクラスタリングも他社のものになり、Source Registry と「主要媒体に限定」の方針が成り立たない。

---

## 15. やらないこと（初期スコープ外）

政治バイアス評価 / Factuality rating / long-tail の大量収集 / 無断の全文 warehouse /
paywall 回避 / claim contradiction engine / ownership visualization / 巨大な News UI 再設計 /
根拠のない AI 要約 / 全 Event の常時 LLM 再評価 / 全記事と全 Event の総当たり。

**ただし将来足せるよう、証拠・relation・監査証跡は失わない。**
