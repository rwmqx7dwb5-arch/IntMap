---
title: コレクションをワークスペースにする——場所に加えて「地図そのもの」をアカウントに保存し、コレクションを持ち主の明示的な操作で閲覧専用リンクとして公開する（見た人はログインすれば自分のアカウントへ写せる）
date: 2026-10-03
newsen: Collections are now workspaces: save the map itself to your account, and publish a collection as a read-only link that others can copy into their own places.
newsjp: コレクションがワークスペースになりました。場所に加えて地図そのものをアカウントに保存でき、閲覧専用リンクで公開すると、受け取った人は自分のマイプレイスへ写せます。
---

〈依頼〉全権委任の第 2 波。分野はバックエンド・Supabase・データ保護・アカウント。第 1 波（`2026-10-03-platform-backend`）が
「あなたのデータ」とマイプレイスを作った。その上に積む次の一歩として「アカウントを持つ価値の造形」——端末をまたぐ
ワークスペースと、明示的な閲覧専用リンク。

## 0. 測った（着手前）

| 何 | 着手前 | 意味 |
|---|---|---|
| アカウントに残せる「地図」 | 無い。レイヤー・日付・背景地図・視点・題は共有リンク（アドレスバー）にしか無く、ノートの同期（atlas-os）は Atlas のターンの記録 | 授業や調査のために組んだ地図を、別の端末で開き直す手段が「リンクを自分に送る」しかなかった |
| マイプレイスを人に渡す手段 | 無い（RLS は所有者だけ・`anon` は何も読めない） | 「集合場所と見学先」を同行者やクラスに配れない——アカウントの中身は外へ出る道を持たなかった |
| 共有リンク（`?tour=custom&t=…` 等） | 中身をクエリに詰める（8,192 バイトの上限を実測した tour-builder） | 場所が 100 件あるコレクションはリンクに入らない。中身は DB に置き、リンクは鍵だけにする |
| ローカルで DB を検査する手段 | Docker のデーモンが止まっている（`supabase test db` 不可） | 第 1 波と同じく PGlite（Postgres 17・WASM）＋ Supabase の薄い代役で全 migration ＋ seed を流す（下の §2） |

⚠ 同じ時刻に `wt-watch-places` という worktree が作られていた（中身は空・同じ base）。「保存した場所に起きた出来事を知らせる」
系統の商品と重なる恐れがあったので、本作業はそちらに触れず、**公開と地図の保存**だけを作った。

## 1. 何を作ったか

### DB（`supabase/migrations/20261003211500_collection_workspace.sql`）

- **`saved_views`（保存した地図）**——名前・メモ・コレクション・`state`（共有リンクのフラグメント。`js/map-state.js` の codec が
  書くもの）。入口は `save_view()` だけ（口座は `auth.uid()`）。同じフラグメントは同じ 1 行（生成列 `state_md5` に一意制約、
  2 度目は `created=false`）。上限 `saved_views_limit()`＝2,000（暴走の柵。観測なしの見積もりと失効条件は migration に）。
  行の大きさの柵 32,768 文字も**決定であって測定ではない**と書いた。
- **`collection_shares`（公開したコレクション）**——`collection`（NULL＝全部・''＝未分類）・`title`・`token`（`gen_random_uuid()` の
  32 桁＝122 ビット）。入口は `publish_collection()` だけで 1 コレクション 1 本（`UNIQUE NULLS NOT DISTINCT`）、公開済みを
  もう一度公開すると**同じトークン**（一発で決める規則）。空のコレクションは公開しない（22023）。公開をやめるのは所有者の DELETE。
- **`shared_collection(token)`——公開の読み取りはこの関数 1 つ**。SECURITY DEFINER で `anon` が呼べ（コメントに
  `ANON MAY CALL:` の理由。`11_definer_execute_test.sql` の規則）、そのコレクションの**今の**場所と地図を**名前つきの欄**から組んで
  返す（行 id・アカウント・メールを返さない。行ごとの `to_jsonb` を使わないので後で足した列が勝手に公開されない）。
  `anon` は 2 表のどちらにも権限を持たない＝トークンを列挙できない。判断の理由は `DECISIONS.md`。
- **`copy_shared_collection(token)`**——ログインした読者が公開コレクションを**自分の**アカウントへ写す。同じ位置・同じ地図は
  写さず `had` として数える（2 度写しても 1 度と同じ）。写した場所の `source` は `shared`——そのために
  `saved_places.source` の CHECK を**広げた**（旧値は全部受け付けたまま）。両方の柵を「新しく増える分」で数える。
- カタログの 2 行（en+jp）。書き出しとアカウント削除には一覧を書かずに入る（`_owned_by_user_cols()`）。

### 画面

- **マイプレイスのシート**（`js/my-places.js`）——「この地図を保存」（`MapState.hash()`）、地図は「地図」の印つきで場所と同じ
  コレクションに並び、押すと**共有リンクを貼ったときと同じ復元**（`IntMapBookmark.restore({shared:true})`）で開く・名前変更・
  2 度押しの削除。外から来た地図は codec に**書き直させてから**保存し開く（`canonicalState`。tour-player の規則と同じ）。
  各コレクションの見出しと「すべて」に「共有」——開くと**公開すると何が見えるか**を述べてから「閲覧専用リンクを作成」
  （`data-effect="outward"`）。公開中は「公開中」・リンク・コピー・2 度押しの「公開をやめる」。
- **公開リンクのページ**（`js/shared-collection.js`。`?collection=<token>` のときだけ `js/auth-ui.js` が読み込む）——場所を
  セッションのピンで出して枠に収め、左下のカード（閲覧専用・題・場所と地図の一覧・「マイプレイスに追加」・「閉じる」）。
  閉じるとアドレスから `collection` だけを外す。未ログインで「追加」を押すとログインへ進み、OAuth はクエリを持ち帰らない
  （`redirectTo` は素のページ）ので、トークンは**このタブの** `sessionStorage` で待ち、戻ったら頼まれた写しを**1 度だけ**行う
  （同じ操作を二度やらせない）。
- **Atlas**（`js/atlas-cap-places.js`）——`places.saveView`「この地図を保存して」・`places.openView`「保存した地図を開いて」
  （観測は notebook.open と同じ `time`）・`places.publish`「京都旅行を公開して」（risk `external`・confirm `explicit`。
  **コレクションの指定が無ければ訊き、全部を既定にしない**。結果がリンクを運ぶ）・`places.unpublish`（公開していないものを
  やめるのは「もう済んでいる」）。`places.list` は地図と公開中のリンクも読み返す。能力は 184 → 188。
- プライバシーポリシー §1・§6（en+jp）に保存した地図と公開したコレクション（何が・誰に・いつまで見えるか、写された
  ものは相手に残ること）を足した。

## 2. 確かめた

- **PGlite（Postgres 17）＋ Supabase の代役**で全 43 migration ＋ seed が通り、新しい `24_collection_workspace_test.sql` が
  **76/76**。既存の 00（`plan(116)` と実数が一致）・11・12・14・09・23 も緑——新しい関数が「anon が呼べる definer は理由を
  書く」「search_path」「anon の INSERT の全数」の規則を満たす。
  変異: 公開の読み取りからコレクションの絞り込みを外す／写しを `do update` にする → **5 本が赤**（Home が漏れる・写しが
  持ち主の行を書き換える・2 度目に増える）。
  ⚠ これは CI の `supabase test db` の代わりではない（pgTAP 本体でも Supabase の本物の auth でもない）。CI の DB job が正本。
- 共有面（`check:surface`）: `window.IntMapBookmark` を読む辺が 1 本増えた（7 → 8。`js/my-places.js` の `openView`）。
  持ち主の `js/map-ui.js` は `IntMapBookmark` を export しない（関数の中で組む）ので import にできず、同じことをする
  `js/tour-player.js` の `openLink` を import するとツアーの再生器がマイプレイスのチャンクに入る。辺を名指してここに記し
  `--update` した。
- `tests/collection-workspace-checks.test.mjs` 4 本（`docs/TESTING.md`）、`tests/platform-backend-checks.test.mjs` も緑。
- `tests/collection-workspace.spec.js`——公開の読み取りを PostgREST の形で答え、カード・枠（2 つのピンが `user-pins` の
  ソースにその位置で入る）・地図を開く（アドレスがその地図の `v=`／`tt=` になりカメラが移る）・ログイン待ちのトークン・
  閉じる、を実ブラウザで測る。**1 passed（テスト本体 21.9 s）**——`tests/durations.json` に 22 s。
- `check:perf`（このツリーの build。天井は `node scripts/perf-budget.mjs --update` で超えた行だけ上げた）:
  - 起動経路（eager）は帯の中（増えたのは `js/auth-ui.js` の `?collection=` の 1 行と待ちトークンの読み取り）。
  - `my-places` 11.9 → 21.5 kB——保存した地図（保存・一覧・開く・名前変更・削除）とコレクションごとの公開の操作がシートに入った。
  - `atlas-console` 1301.6 → 1312.4 kB——Atlas の能力 4 本（`places.saveView` / `openView` / `publish` / `unpublish`）と
    `places.list` の読み返しの拡張。
  - `async.gzip` 3944.7 → 3965.7 kB——上の 2 つと、新しいオンデマンドのチャンク `shared-collection` 9.4 kB（公開リンクの
    ページでだけ読む。天井は merge 後に main の CI が記録する）。

## 3. 残っていること

- **本番への migration 適用は未実施**（`docs/MIGRATIONS.md` §5 の手順で 1 本）。適用されるまで本番の公開リンクは
  `not_found` ではなく関数が無いエラーになり、カードは「取得できませんでした」と述べる。Edge Function は足していない。
- プライバシーポリシーの文言の変更は、第 1 波と同じく**利用者の承認が要る種類**の変更として最終報告に挙げる。
- 公開したコレクションの名前を後から変える UI は無い（場所ごとにコレクションを付け替えると、公開リンクはその名前の
  コレクションを読むので空になり、カードは「今は空です」と述べる）。
