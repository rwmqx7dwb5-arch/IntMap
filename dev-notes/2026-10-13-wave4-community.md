---
title: みんなの地図——公開したコレクションを持ち主が「掲載」すると誰でも探して開け、ライブラリに写して元にでき、写したものから掲載すると元の地図が示される。持ち主には保存した人数と元にされた数だけが届き、報告は管理者が裁く
date: 2026-10-13
newsen: Community maps: list a published collection and anyone can find it by words, by what readers kept most or by the area on the map — open it, add it to your Library to build on it, and see how many readers kept yours.
newsjp: みんなの地図ができました。公開したコレクションを掲載すると、誰でも言葉・よく保存された順・地図の範囲で見つけて開き、ライブラリに写して元にできます。自分の地図を何人が保存したかも見られます。
---

〈依頼〉全権委任の第 4 波。分野はコミュニティ・アカウント・保存/共有/コレクション・フィードバック。「利用者同士で地図が広がる（作った地図が読まれ、
再利用される）仕組みを。外部 SNS への自動投稿は作らない。」

## 0. 測った（着手前）——何が無かったか

| 何 | 着手前 | 意味 |
|---|---|---|
| 公開したコレクションに届く道 | 持ち主がリンクを渡した相手だけ（`collection_shares` は `anon` から列挙できない＝設計どおり） | 授業のために作った地図が、同じ単元を教える次の先生に届く道が無い |
| 持ち主が知れること | 何も無い（写されても、持ち主には何も記録されない） | 作った地図が使われているかが分からない＝作り続ける理由が無い |
| 写したものの出自 | 写した場所の `source='shared'` だけ（どこから来たかは残らない） | 誰かの地図を元に作ったものを公開しても、元の作者の名が付かない |
| 公開された中身への苦情の道 | 無い（地図の誤り報告は地図そのものについて） | 誰でも見つけられる場所を作るなら、それを裁く道が同時に要る |
| `community_posts`（旧コミュニティ投稿） | 表は残るが画面の入口は撤去済み（`index.html` の `btn-community` が Atlas を開く） | 旧フィードを生き返らせるのは過去の判断を覆すことになるので触らず、今生きている「コレクション」の上に作った |

第 1〜3 波（`2026-10-03-collection-workspace`・`2026-10-04-map-document-unify`）が作った「地図ドキュメント」「公開コレクション」「写す」をそのまま使い、
その上に**見つかる場所・届いた数・系譜・裁き**の 4 つを足した。作り直したものは無い。

## 1. 作ったもの

### DB（`supabase/migrations/20261013080000_community_maps.sql`、pgTAP `38_community_maps_test.sql`）

- **掲載** — `collection_shares` に `listed_at`・`author_name`（1〜40 字。持ち主がその場で打つ名前）・`summary`（≤ 500）・`derived_from`・`hidden_at`/`hidden_reason`。
  入口は `list_community_map()` だけ（未公開なら `publish_collection()` を通して公開してから掲載＝1 回の依頼で済む。2 度目は `listed=false`）。所有者の列 grant は `title` のまま。
  `unlist_community_map()` は目録から外すだけでリンクは残る。
- **目録** — `community_maps(query, sort, limit, offset, bbox)`。`anon` が GET で呼べる 2 本目の公開読み取り（コメントに `ANON MAY CALL:`）。掲載中・非表示でない・中身のあるものだけを
  名前つきの欄で返す（中心と箱は場所から、場所が無ければ最初の地図のカメラ `v=` から）。語は語として探す（`%`・`_`・`\` を逃がす）。並びは新着／よく保存された／更新、範囲は
  `[西,南,東,北]`（西 > 東で経度 180° をまたぐ）。
- **届いた数** — `copy_shared_collection()` を置き換え（中身はそのまま）、写した口座の受領 `collection_copies`（コレクションと口座ごとに 1 行・持ち主自身の写しは残さない）を足した。
  持ち主は `my_collection_reach()` で数だけを読む。**開いた回数は数えない**（下の §3）。
- **系譜** — 写した先のコレクションを掲載すると、そこへ写した最新の受領から `derived_from` を決める。目録と `shared_collection()` の `listing` は、**元が掲載中で非表示でない間だけ**
  元の題・作者・リンクを返す（リンクだけで配った元のトークンが他人の掲載から漏れない）。
- **報告と裁き** — `report_community_map()`（ログイン必須・口座ごとに 1 件・自分のものと未掲載は不可・理由 6 種）→ `community_map_reports`。管理者は
  `community_map_reports_admin()`（報告者は出さない）と `moderate_community_map()`（外す〔理由必須・持ち主が読む・再掲載不可〕／戻す／却下）。
- 目録の 2 行（en+jp）と `collection_shares` の説明の更新。書き出しと削除には一覧を書かずに入る。

### 画面

- **`js/community-maps.js`（新規・オンデマンド）** — みんなの地図のシート: 検索・並び・「地図に表示している範囲のものだけ」・20 件ずつ。カードは題・作成者・紹介文・中身・
  「N 人が保存」・「元にした地図」・「地図で開く」。管理者（`is_admin()`）には報告されたコレクションと 3 つの決定。ライブラリの掲載の箱、公開カードの掲載欄と報告の欄もここ。
  **持ち主の語は全部テキストとして置く**（このモジュールは markup を書かない——門が見る）。
- `js/shared-collection.js` — 公開の読み取りが `listing` を運び、カードに掲載欄（非同期に読み込む）・「みんなの地図をもっと見る」。アプリ内から開く `openShared(HOST, token)`
  （アドレスを `?collection=<token>` にし、リンクと同じカードとピン）。`listShares` は持ち主の掲載の列も読む（migration 前の DB では 42703 で旧列に戻る）。
- `js/my-places.js` — 公開中のコレクションの共有パネルに掲載の箱、見出しの札「掲載中」、届いた数、ボタン「みんなの地図」。
- 入口: アカウントメニューの「みんなの地図」（`js/auth-ui.js`）、作例ギャラリーの最後の節（`js/showcase-gallery.js`。ホストを持たないので `js/bus.js` に宣言した
  `intmap-open-community` を出し、`js/auth-ui.js` が開く）。
- **Atlas**（`js/atlas-cap-community.js`、at 680〜715）: `community.browse`（目録・`show` でシートも）・`community.open`（題で開く・複数一致は開かない）・`community.list`
  （risk `external`・confirm `explicit`。コレクションの指定が無ければ訊き、**表示名が無ければ訊く——作らない**）・`community.unlist`（掲載していないものは「もう済んでいる」）・
  `community.mine`（公開したコレクションごとの掲載状態と届いた数）。`resolveCollection` は `js/atlas-cap-places.js` のものを export して使う（写さない）。
- プライバシーポリシー §1・§6（en+jp）に掲載・写しの記録・報告（誰が読むか・いつまで）を足した。

## 2. 確かめた

- **PGlite（Postgres 17・WASM）＋ Supabase の薄い代役**で全 53 migration ＋ seed を流し（News Events の pgvector の表など代役で作れない 124 文は飛ばした——今回の表とは無関係）、
  `38_community_maps_test.sql` が **98/98**。既存の 11・12・14・24・29・03・09 も緑、23 は代役に無い `saved_news_events` の 1 件だけ（代役の欠落）。00 は同じ理由で news 系が赤。
  ⚠ これは CI の `supabase test db` の代わりではない。
  - 初回に**本物の欠陥を 1 つ**見つけた: `collection_shares` の説明文（en）が `account_data_catalog` の 400 字の CHECK を超えていて、migration の最後の UPDATE が失敗していた。縮めた。
  - 変異: 目録の `based_on` から「元が掲載中」の条件を外す／持ち主自身の写しにも受領を残す → **4 本が赤**（未掲載の元のリンクが目録に出る・非表示の元を指し続ける・自分の写しが数えられる）。
- `tests/wave4-community-checks.test.mjs` 5 本。変異: ページの表示名の上限を 41 にする／Atlas の掲載で表示名を訊く分岐を外す → ②④ が赤。
- 共有面（`check:surface`）: `window.IntMapDialog` を読む辺が 1 本増えた（48 → 49。`js/community-maps.js` のシートを開く所）。持ち主の `js/dialog.js` は
  window に出す素の script で何も export しないので import にできない（ライブラリ・見守る場所のシートも同じ読み方）。辺を名指してここに記し `--update` した。
- i18n: 同じ英語の鍵に別の訳を付けていた 3 つ（Hide／Restore／Something else）を、意味ごとの英語に分けた（「みんなの地図から外す」は掲載の箱と同じ組）。
- 画面: Chromium（Playwright）で `js/community-maps.js` を作業木のファイルのまま読み込み（サーバーは立てず `page.route` で返す）、代役の DB で
  シート・掲載の箱・公開カードの掲載欄・管理者の欄を明暗両方・en/jp で撮って見た。題に `<b>` を入れた掲載は文字のまま出る。暗い画面で選んだ並びが
  シートと同じ色で見分けられなかったので、iOS の分段の暗色（#636366）にした。
- 呼び出し元の無い export（`r175 ③`）: 内部でしか使わない 4 つ（`reportMap`・`adminQueue`・`moderate`・`searchWith`）を export しない形にし、
  `js/my-places.js` は `import('./community-maps.js')` を直接書く（包んだ関数越しだと名前で読まれたと数えられない）。
- `js/bus.js` の `intmap-open-community` は中身なし（`detail: null`）——ギャラリーは何も渡さずに開く。

## 3. 判断（`DECISIONS.md` に 1 節）

- **開いた回数を数えなかった理由。** ログインの要らない書き込みはこの DB では Edge Function とバケツを通す形（`anon-write-guard`・`14_anon_write_guard_test.sql`）で、ページから
  直に増やせる数は誰でも膨らませられる。それを並びに使えば目録を操作できる。写すにはアカウントが要り、同じ口座の 2 度目は数えないので、届いた数は写した口座で数えた。
- **公開と掲載を分けた理由。** 既存の公開リンクは「配る相手を選ぶ」ためのもので、それを勝手に目録へ載せると意味が変わる。

## 4. 残っていること

- **本番への migration 適用**（`docs/MIGRATIONS.md` §5）。適用されるまで目録は「このサーバーではまだ利用できません」と述べ（PGRST202）、ライブラリは掲載の箱を出しても掲載できない。
  Edge Function は足していない。
- プライバシーポリシーの文言の追加は利用者の承認が要る種類の変更として最終報告に挙げる。
- 能力の手書きの件数（PRODUCT・DECISIONS・docs/FILES・02-features。222 → 227、到達可能 219 → 224）と perf の天井は統合時に合わせる（第 4 波の指示書のとおり）。
- **起動費用（このツリーの build で `check:perf`）**: 起動経路は帯の中。遅延チャンク `atlas-console` 1,456.2 → 1,470.0 kB（`community.*` の 5 能力と説明文）と
  `async.raw` 12,536.3 → 12,599.1 kB が天井を越える。新しいオンデマンドのチャンク `community-maps` 22.1 kB（シートを開いたときだけ）。天井
  （`tests/perf-baseline.json`）は触っていない。
