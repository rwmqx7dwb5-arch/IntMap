---
title: 「あなたのデータ」とマイプレイス——アカウントが持つものを利用者自身が見て持ち出し、場所をアカウントに保存する（削除と同じ発見で数え・書き出す）
date: 2026-10-03
---

〈依頼〉「修正・穴埋めではなく構造改革とイノベーション。整形ではなく造形。足し算。全権を委任する」の 1 本。
分野は Supabase・データ保護・セキュリティ・バックアップ。地域監視の再開はしない（利用者が撤去中と決めたもの）。
作った商品は 2 つ——**「あなたのデータ」**（アカウントが保持するものの目録と完全な書き出しを、問い合わせなしで）と
**マイプレイス**（地図上の場所をアカウントに保存し、どの端末でも地図に出す）。どちらも画面と Atlas の両方から届く。

## 0. 測った（着手前）

| 何 | 着手前 | 意味 |
|---|---|---|
| 利用者が自分のデータに届く扉 | `delete-account`（消す）だけ。プライバシーポリシー §7 は「アクセス・訂正・削除…お問い合わせください」 | 見る・持ち出すは運用者の手作業で、運用者にも 1 表ずつ SQL を書く以外の方法が無かった |
| アカウントが行を持つ表 | `_owned_by_user_cols()`（`auth.users` を指す列＋FK の消えた uuid `user_id`）が**発見**する 21 表 | 削除はもう「手書きの一覧」ではない。同じ発見を、見る・持ち出すにも使える |
| 作者が RLS で自分の行を読めない表 | `feedback`・`bug_reports`・`donations`・`community_reports`（admin-read） | 「自分のデータ」を RLS の内側で集めると、まさにこの 4 表が欠ける——書き出しは SECURITY DEFINER が要る |
| アカウントに紐づく地図の持ち物 | 無い。ピン・図形・半径・経路はすべてページの中で、再読み込みで消える | 「自分の地図」の最初の 1 つは場所 |
| ローカルで DB を検査する手段 | Docker のデーモンが無い（`supabase test db` 不可）。psql も無い | 下の §2 で PGlite（WASM の Postgres 17）に Supabase の薄い代役を足し、**全 39 migration ＋ seed** を流せることを確かめた |

## 1. 何を作ったか

### 「あなたのデータ」（account-data-center）

- `supabase/migrations/20261003130000_account_data_center.sql`
  - `account_data_catalog`——所有される表 1 つにつき 1 行（何か・なぜ・いつまで・誰が書いたか〈`you` / `intmap`〉、en+jp）。
    誰でも読める（誰のデータも持たない＝プライバシーの目録）。書けるのは migration だけ。
    ⚠ **説明であって絞り込みではない**——説明の無い表も数えられ書き出され（`described=false`）、検査だけが赤くなる。
  - `account_data_inventory()`——呼び手の口座について、表ごとの件数と説明。
  - `export_account_data()`——全行・全列（`to_jsonb`）＋`auth.users`/`auth.identities` が持つもの（メール・作成・確認・最終ログイン・
    提供元・提供元のプロフィール）＋各表の説明を、1 つの JSON（`format: intmap-account-export`, `version: 1`）。
    共有バケツ `relay_take('account-export')` でアカウントごとに 1 時間 6 回（拒否は `{ok:false,error:'rate_limited'}` で何も読まない）。
  - ⚠ どちらも**引数を持たない**。口座は `auth.uid()`（検証済みの JWT）だけが決める。`delete_account_data(uuid)` が service_role 専用
    なのと逆の設計で、他人の uuid を渡す扉が存在しない。EXECUTE は `authenticated` だけ。
  - ⚠ **目録・書き出し・削除は同じ `_owned_by_user_cols()` を歩く。** 後で足された表は外部キーができた瞬間に 3 つ全部に入る。
- `js/account-data.js`（オンデマンド）——アカウントの「あなたのデータ」のシート（「あなたが作ったもの」「IntMap が利用について
  記録したもの」「保持していない種類」、行を開くと何か・なぜ・いつまで）と書き出し（`intmap-account-<日付>.json`）。
  **表の名前を 1 つも持たない。**
- Atlas: `account.data`（「私のデータは何が保存されている？」）・`account.export`（「データを書き出して」）——`js/atlas-cap-account.js`。

### マイプレイス（my-places）

- `supabase/migrations/20261003140000_saved_places.sql`
  - `saved_places`（名前・メモ・コレクション・位置・ズーム・出所）。**同じ口座の同じ位置（約 1 m）は 1 行**——生成列 `lng5`/`lat5`
    （`round(…,5)`＝セッションのピンの同一性）に一意制約。
  - 入口は `save_place()` だけ（`authenticated` に INSERT の grant が無い）。口座は `auth.uid()`。2 度目は `created=false` で、与えられた
    欄だけ更新し与えられなかった欄は残す。`ON CONFLICT` で同時の 2 保存も 1 行。上限 `saved_places_limit()`＝10,000（暴走の柵、
    観測なしの見積もりであることと失効条件は migration に書いた）を超える新しい場所は 54000。
  - 所有者は列単位 grant で名前・メモ・コレクション・位置・ズームを変え、自分の行を消す。`user_id` と `created_at` は書けない。
  - カタログの 1 行もこの migration に（書かなければ下の検査が赤い）。削除・目録・書き出しには**どこも編集せずに**入った。
- `js/my-places.js`（オンデマンド）——アカウントの「マイプレイス」のシート（地図の中心を名前・コレクション・メモつきで保存／
  コレクションごとの一覧・押すと地図へ／行の中での名前変更／2 度押しの削除）、**ピンのポップアップの「保存」**（ピンの題と説明が
  場所の名前とメモになる。保存済みなら「マイプレイスに保存済み」）。地図に出した場所は**セッションのピンそのもの**（`HOST.addPin`）なので、
  ポップアップ・オブジェクト一覧・計測・削除が最初から効く。
- Atlas: `places.save`（地名＋国・座標・ピン id のいずれか。**何も無ければ訊く——地図の中心を使わない**）・`places.list`・
  `places.show`（作ったピンを `objectIds` で返す→ object 観測器）・`places.remove`（複数一致なら何も消さず一覧を返す。コレクション
  ごとは `all:"collection"` を明示したときだけ）——`js/atlas-cap-places.js`。2 度目の保存は `ALREADY_SAVED` で「もう済んでいる」と
  述べる（一発で決める規則。覚えているのは DB で、Atlas 側は何も記憶しないし拒否もしない）。

### 共有面（`check:surface`）

新しい 2 モジュールはシートを `window.IntMapDialog.open(...)` で開く（Esc・Tab トラップ・フォーカス復帰を登録簿から）。
`js/dialog.js` は `window.IntMapDialog` を export しないので、`window.IntMapDialog` を読む辺が 4 本増える（38 → 42）。
`IntMapGeoEngine` は `./geo-engine.js` から import した（window 経由で読まない）。

## 2. 確かめた

- **PGlite（Postgres 17・WASM）に Supabase の薄い代役**（`anon`/`authenticated`/`service_role`、`auth.users`/`auth.identities`/`auth.uid()`、
  `storage.*`、Supabase の既定権限）を足し、**全 39 migration ＋ `seed.sql` が通る**ことを確かめた上で、pgTAP の最小の代役
  （`ok`/`is`/`has_table`/`finish`）で `supabase/tests/23_account_data_center_test.sql` を流した: **55/55 ok**。
  変異: カタログから `favorites` の 1 行を消すと ①完全性・目録の `described`・書き出しの説明の 3 本が赤くなる。
  既存の 09/11/12 も同じ代役で流し、赤は代役自身の表（`_tap` に `grant all to public`）だけ——新しい 2 表は TRUNCATE/REFERENCES/TRIGGER
  を誰にも渡していない・anon の INSERT を受けない。
  ⚠ これは CI の `supabase test db` の代わりではない（pgTAP 本体ではなく、Supabase の本物の auth スキーマでもない）。CI の DB job が正本。
- `tests/platform-backend-checks.test.mjs` 5 本（`docs/TESTING.md`）。
- `00_structure_test.sql` は 2 表を両方のリストに足して `plan(104)`（+4）。
- `check:perf`（`origin/main` 9dcfdcad の CI 実測との差。天井は `node scripts/perf-budget.mjs --update` で上げる）:
  - **起動費用（eager）も動く**——raw 4648.8→4653.0 kB（+4.2 kB）・gzip 1531.8→1533.1 kB（+1.3 kB）。モジュール数は
    307 のまま（新しいファイルは起動経路に入らない）で、増えたのは既に起動経路にある 4 本: `js/auth-ui.js`（アカウント
    シートの「あなたのデータ」「マイプレイス」の入口）・`js/legal-text.js`（保持と書き出しの説明）・`js/app-body.js`・
    `js/atlas-capabilities.js`（能力表の 6 行）。⚠ eager の天井 4628.5 kB を main 自身が既に +20.3 kB 超えている
    （gzip は帯の外で main の CI も赤）。この PR の分は上の +4.2 kB だけ。
  - `atlas-console` +13.4 kB（Atlas の能力 `account.*`・`places.*` の 2 モジュールは `js/atlas-caps-modules.js` から
    import され Atlas の束に入る）。新しいオンデマンドのチャンク `account-data` 7.2 kB・`my-places` 11.9 kB
    （開いたときにだけ読む。天井は merge 後に main の CI が記録する）。

## 3. 残っていること

- **本番への migration 適用は未実施**（この作業の範囲外。`docs/MIGRATIONS.md` §5 の 1 ファイルずつの手順で 2 本）。Edge Function は
  足していないので配備は無い。
- **プライバシーポリシー（`js/legal-text.js` の PRIVACY_*）**: 利用者の承認（2026-10-03）を得て、合流時に §1（保存物の列挙に
  マイプレイス）・§6（保存した場所の保持期間）・§7（「お問い合わせください」→『アカウント ▸ あなたのデータ』での一覧と
  完全な書き出し・アカウント削除による削除・その他は問い合わせ）を en+jp で入れた。利用規約 §4 にも自己書き出しと削除の 1 文。
- migration は他 branch と時刻が重ならないよう `20261003130000_account_data_center.sql`・`20261003140000_saved_places.sql`、
  pgTAP は `23_account_data_center_test.sql` に改名した。
- `docs/architecture/02-features.md` と `PRODUCT.md` の「440 綴り」は、今の行から再計算できる式が見つからなかった（ID＋別名の重複を
  除いた数は追加前 413・追加後 440、ID＋dispatch 名＋別名は 563→596）。数を変えずに残した。

## 統合時の性能予算（830f271b へ重ね直した後の build）

超えた行だけ `--update` で上げた（増えた理由は上の節）:
- eager.raw: 4628.5 kB → 4653.1 kB
- eager.gzip: 1523.9 kB → 1533.2 kB
- async.raw: 11518.0 kB → 11588.8 kB
- async chunk "atlas-console": 1144.2 kB → 1162.7 kB
