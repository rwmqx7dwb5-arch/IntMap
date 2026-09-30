---
title: 匿名で起こせる書き込みと上流の消費を、既存の 1 つの守りの形に揃える——feedback / bug_reports は公開キーで行数の制限なく書けたので Edge Function reader-reports（client-errors と同じ形の共有バケット）へ移して表の直接 INSERT を閉じ、aviation-feed / ais-feed の ?refresh=1 はプロジェクト全体で 1 つの強制更新枠（relay_take・鍵 *）から取り、枠を超えたら強制せずキャッシュ済みの答えを返す
date: 2026-09-30
---

〈依頼（監査の是正）〉⑴ `feedback`（policy `feedback_insert_any`）と `bug_reports`（`bug_reports_insert_any`）は
anon の insert を許し、#R155 の `len_guard` は長さを縛るが**件数を縛るものが無い**——公開キーで PostgREST から
大量に行を作れる。`client-errors` が既に持つ「Edge Function ＋ `relay_take` のバケット」の形に揃える。
同種の表があれば全数を調べる。⑵ `aviation-feed` / `ais-feed` の `?refresh=1` は誰でも呼べ、isolate 内の
バケットでしか抑えていない。（最初の指示は「秘密ヘッダ」の形だったが、途中で設計変更の指示が来た——§2。）

## 0. 測った

- **anon が INSERT できる表の全数（migrations を全部読んで）。** INSERT/ALL policy のうち `anon` を含むのは
  `feedback_insert_any` と `bug_reports_insert_any` の 2 つだけ（baseline で作られ、#R801 が `user_id` の条件を
  足して作り直したもの）。役割を書かない（＝PUBLIC の）INSERT policy は 0。`public` の 37 表はすべて RLS が有効
  （`create table` の全数と `enable row level security` の全数を突き合わせて差 0）。
- **authenticated が直接書ける表。** `community_posts` / `community_comments` / `community_votes` /
  `community_comment_votes` / `community_reports` / `favorites` / `user_prefs` / `saved_news_events` /
  `donations` / `area_monitors`（と admin だけの `geo_pins` / `dashboard_cards`）。票と通報は (post, account) の
  主キー、保存した Event は (event, account) の unique、`area_monitors` は `monitor_limit()` で上限がある。
  **投稿・コメント・お気に入り・寄付の意図は 1 アカウントあたりの件数の上限が無い。**
- **「確認なしの authenticated」は本番に無い。** `GET /auth/v1/settings`（公開キー）→ `mailer_autoconfirm: false`、
  `anonymous_users: false`、外部プロバイダは Google だけ。⚠ `supabase/config.toml` の `enable_confirmations = false`
  はローカル用で本番の値ではない。⇒ authenticated の表は今回動かさず、`docs/SECURITY-ARCHITECTURE.md` §8 の 15 に
  残りの危険として書いた（件数の上限を付けるのはコミュニティの書き方を変えることなので、判断が要る）。
- **`?refresh=1` を送るのは誰か。** ブラウザは 0（`js/` の検索。航空は snapshot を読み、船は `?bbox=` だけ）。
  航空は `.github/workflows/aviation-sweep.yml` だけ。**船には掃引が無い**（`ais-feed` 自身の註）。
- **「_shared に共有の器具があるはず」は無かった。** 定数時間比較は `monitor-run`・`refresh-news`・`news-ingest`・
  `who-don` の 4 か所に**同じ 8 行の写し**がある（`who-don` の註が自分で書いている）。最初の設計では
  `_shared/secret-header.js` を新しく作ったが、設計変更で使う関数が無くなったので**ファイルごと消した**（§2）。
- **HMAC の呼び手鍵も `client-errors` の中にしか無かった。** `reader-reports` も同じ鍵が要るので
  `_shared/rate-limit.js` の `hashedCallerKey` へ移し、`client-errors` はそれを呼ぶ（値はバイト単位で同じ——
  `tests/client-error-log-checks.test.mjs` ③ が旧来の期待値のまま緑）。

## 1. 直したもの

- **`supabase/functions/reader-reports`（新規・21 本目）** — `client-errors` と同じ形: POST 限定・64 KiB・
  Origin 許可（`client-error-shape.js` の `originAllowed` を import）・共有バケット 2 つ（呼び手ごと／1 日の全体）・
  どちらも**閉じて失敗**。**誰からの報告かは関数が決める**——#R801 が policy に書いた「匿名か本人、他人は不可」を
  ここへ移した: token が無い（または公開キー）なら匿名、利用者の token は `/auth/v1/user` で検証して `user_id` と
  `email` をそのアカウントから取る（本文の値は捨てる）。Auth が拒んだ token は 401（黙って匿名にしない）。
  読むのは表の列だけで、`created_at` / `id` は DB が書く。
- **`supabase/migrations/20260930090000_anon_write_guard.sql`** — 2 つの INSERT policy を落とし、INSERT grant を
  `public, anon, authenticated` から revoke（policy だけだと既定権限が grant を戻したときに…ではなく、grant と RLS の
  **両方**で閉じる）。**非破壊**: 行も列も触らない。
- **`js/feedback.js`** — 2 つのフォームは `sendReport(kind, fields)` 経由で `reader-reports` へ POST。サインイン中
  だけ access token を付け、`user_id` / `email` は送らない（関数が決める）。失敗時のバグ報告の端末保存は従来どおり。
- **`aviation-feed` / `ais-feed`** — `?refresh=1` はハンドラの先頭で**プロジェクト全体の強制更新枠**に訊く
  （`_shared/rate-limit.js` の `forceGrant`＝`relay_take` の鍵 `'*'` のバケット 1 つ。呼び手を問わない）。
  `granted` なら従来どおり強制更新、`capped`（枠を使い切った）と `unavailable`（DB が答えない＝**強制しない側に倒す**）は
  `refresh=1` が無かったのと同じ答え——200・キャッシュ済み・**上流に 1 本も触れない**——を返し、`x-intmap-forced` が
  どれだったかを述べる（掃引のログは `x-intmap-` ヘッダを印字するので、そのまま見える）。
  **枠の大きさ（no-ad-hoc-hardcoding §4）**:
  - aviation: `FORCE_BURST`＝10（ワークフローの `SLICES=10`）／`FORCE_PERIOD_S`＝300（cron が 5 分ごと）。
    **観測**: 掃引は 1 run で 10 スライスを 20 秒おきに訊く（ワークフロー）。GitHub は cron を 1 日約 6 回しか走らせない
    （#R504 の実測、同ワークフローの註）ので、掃引自身はこの枠に届かない——枠が縛るのは**それ以外の誰か**が足す分。
    **失効**: `SLICES` か cron が変わったとき。**正本**: ワークフロー（検査 ② が両方をそこから読んで照合する）。
    ⚠ 指示の文言は「N 分に 1 回」だったが、文字どおり 1 回にすると掃引の 1 run の 2〜10 スライス目がすべて
    `capped` になり、掃引の被覆が 1/10 に落ちる。単位を「掃引 1 run」にして、N＝cron 間隔ごとに 10 回とした。
  - ais: 掃引が無いので `FORCE_BURST`＝1／`FORCE_PERIOD_S`＝`WORLD_TTL_MS`（30 秒）。温まった isolate は TTL ごとに
    自分で更新するので、強制更新でプロジェクトが上流に訊く頻度が TTL の更新 1 回分を超えることは無い。
    **正本**: `WORLD_TTL_MS`（定数はそれから導く）。**失効**: 船の掃引を足したとき。
  - 誰かが枠を先に使い切ると、掃引のスライスは次の補充まで `capped` になる（その間も読者の viewport 読みが世界を
    進める）。秘密を持たない以上の代償で、上流への負荷の上限のほうを守った。
- **`aviation-sweep.yml`** — **変えていない**（掃引は今までどおり `?refresh=1` を送るだけ）。一度は秘密ヘッダと
  secret の門の step を足したが、設計変更で元に戻した。⚠ その途中で `tests/backup-and-deploy-as-code-checks.test.mjs` ①
  （secret を読む job の門を**実行して**測る）が、門の代わりに掃引そのものを実行して本番の aviation-feed（旧版）へ
  `?refresh=1` を数回送った——cron の掃引と同じ要求で害は無いが、形として誤りだったことは記録しておく。
- **`ais-feed` の `?ws=`** は触っていない（`WS_MS_MAX` で頭打ちのまま、refresh が開く 1 本の socket を延ばすだけ）。

## 2. 設計変更——秘密ヘッダをやめ、共有バケットにした（コーディネータの指示）

最初は「強制更新を送るブラウザは 0、送るのは運用者の掃引だけ」という実測から、`?refresh=1` を運用者の秘密ヘッダの後ろに
置いた。だがそれは配備の前に **Supabase と GitHub の両方へ人が secret を登録する**ことを要し、登録されるまで
aviation-sweep の run は赤になる。コーディネータの指示で、既存の共有バケット（`relay_take`）による**呼び手を問わない
全体の頭打ち**に替えた——拒否ではなく、超えた分は強制しないだけなので、読者・掃引・配備のどれにも手作業が要らない。

**`_shared/secret-header.js` は消した（足さない方を選んだ）。** 使う関数が無くなったので、残せば読み手のいない共有部品に
なる。4 関数のうち 1 本だけを寄せる案は採らなかった: 寄せた 1 本と写しの 3 本という「同じ判断の 2 つの形」が残り、
今より悪い。しかも 4 本はどれも認証そのもの（`monitor-run` はユーザー JWT とも併用）で、監査の是正と無関係な再配備と
回帰の面を足すことになる。**4 本を一度に寄せる別の作業**として §5 に残した。

## 3. 門

- `tests/anon-write-guard-checks.test.mjs`（12 本・段 0）— 関数は**評価して**測る（#R505）。②〜⑤は
  `docs/TESTING.md` の同名節。
- `supabase/tests/14_anon_write_guard_test.sql` — ⚠ 規則は名前ではなく**事実**に付けた: `pg_class` × `pg_policies`
  の全数で「`public` のどの表も `anon` の直接 INSERT を受けない」。次に anon へ開く表は名前に関係なく赤になる。
  memory の教訓どおり、全数は自分の `_cap` を作る**前**に走らせ（`_cap` は既定権限で anon ALL を受ける）、
  `_` で始まる名前を除く。拒否は DENIED（42501）で読み、台帳は所有者として読む。`no_plan()`。
- 既存の pgTAP の期待値を新しい事実へ: `01`（anon と A の直接 insert は DENIED）、`02`・`05`（anon に INSERT が
  無い／service_role にはある）、`09` §4（受け入れる側の半分は関数へ移ったと註に書いた）。
- `tests/hazard-other-edge-relay-input-checks.test.mjs` ⑧ — 強制更新 4 本が全体の枠で許されるよう `relay_take` の
  スタブと service key を足した（測っているのは isolate ごとのバケットのまま。枠を使い切ったときは新しいファイルが測る）。
- `tests/backup-and-deploy-as-code-checks.test.mjs` — ワークフローを元に戻したので変更なし（緑）。
- `tests/aviation-feed-checks.test.mjs` R352 ⑥ — world channel の始まりを `const force = url.searchParams` の綴りで
  探していたので、channel 自身の分岐 `if (channel === "world")` を錨にした（force は URL だけからは決まらなくなった）。
- ⚠ **21 本目の関数で `check:docs` の edge-count そのものが壊れた。** 英語の数詞の表が規則
  （`scripts/doc-facts.mjs`）と検査（`tests/process-doc-facts-edge-counts-checks.test.mjs`）に**別々に手書き**され、
  どちらも `twenty` で止まっていた。しかも英語の needle は `[A-Za-z]+` なので「twenty-one Edge Functions」の
  ハイフンの後ろの `one` だけを拾い、**正しい文を「1 本」と読んで赤**にした（検査の側は 21 の錨語が undefined）。
  ⇒ 数詞を合成する `ENGLISH_CARDINALS`（〜ninety-nine）を `scripts/doc-claims.mjs` に 1 つ置いて両方が import し、
  needle はハイフンでつないだ数詞を 1 語として読む。22 本目の関数はこの穴を踏まない。

⚠ **`supabase test db` は走らせていない**——このマシンの Docker デーモンが止まっている。pgTAP の 4 ファイルの修正と
新しい 14 は CI の Database checks が初めて走らせる。

## 4. 配備の順序（守らないと、その間フィードバックが送れない）

1. Edge Functions: `reader-reports`（新規）・`aviation-feed`・`ais-feed`（強制更新の枠）・`client-errors`（共有鍵の移動）。secret の登録は要らない。
2. ページ（merge で公開）。
3. **最後に** migration `20260930090000_anon_write_guard.sql`。先に当てると、新しいページが出るまで
   フィードバックは「送信できませんでした」、バグ報告は端末保存になる（失われはしない）。

## 5. 残り

- 4 つの関数（`monitor-run`・`refresh-news`・`news-ingest`・`who-don`）の定数時間比較の写しを、`_shared/` の
  1 つ（relay-guard ではない専用のファイル）へ**4 本同時に**寄せる作業（4 本の再配備が要る）。
- `atlas-embed` の `callerId`（`/auth/v1/user` を訊く）と `reader-reports` の `verifiedCaller` は同じ問いの 2 実装。
- authenticated の直接書き込み（§0）に 1 アカウントあたりの件数の上限が無い——`docs/SECURITY-ARCHITECTURE.md` §8 の 15。
- 送信先はこれまでと同じ Supabase プロジェクトで、保存する列も変わらない（IP は保存しない）ので、
  プライバシーポリシー（`js/legal-text.js`）は変えていない。

## CI で見つかった検出漏れ

送信を `fetch(base + '/functions/v1/reader-reports', { method: 'POST' })` に変えた日、`scripts/data-effects.mjs`（書き込みに届く操作要素の門）は `#fb-send` と `#bug-send` を**書き込みとして見失った**——URL が文字列リテラル 1 つのときしか読んでいなかった。連結（`+`）の中の文字列も読み、分からない部分は `${}` とする（テンプレート文字列と同じ扱い）。2 本とも `sendReport→edge-function` として再び見え、宣言済み。
