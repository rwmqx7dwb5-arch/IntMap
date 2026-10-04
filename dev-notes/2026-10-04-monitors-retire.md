---
title: 旧・地域監視（Area Monitors）の基盤を撤去する——モジュール・Edge Function・5 表・関数 10 個・cron・vault の秘密・Atlas の撤去済み能力
date: 2026-10-04
internal: 入口はすでに 1 つも無く（タブ・ワークスペース・ウィジェット・Atlas）、読者が触れていたものは何も変わらない。見守る場所はそのまま。
---

〈依頼〉 利用者が承認した撤去。入口が無いまま動いていた旧・地域監視の基盤を、ページ・サーバー・DB の全部から取り除く。
**見守る場所（`js/place-watch.js`・`_shared/place-watch.js`・`place_watches`）は残す。**

## 0. 測った（撤去の前）

- 入口: タブ・ワークスペースのウィンドウ・Atlas の計画（`monitor` 行動）は以前に撤去済み、ウィジェット板のカードは
  widget-watch-unify で「見守る場所」に置き換え済み。Atlas の `system.monitor` は `FEATURE_WITHDRAWN` を返すだけ。
- 残っていたもの: `js/monitors.js`（`window.IntMapMonitors` を毎回の起動で組み立てていた）、`#monitors-feed`、
  `css/intmap.css` の `.mon-*` 66 行、Edge Function `monitor-run`、DB の 5 表と関数 10 個、cron `intmap-monitor-run`
  （10 分ごとに本番の関数へ POST）と vault の `monitor_run_secret`、`_shared/plans.js` の `monitors` 列。

## 1. 撤去したもの

- **ページ**: `js/monitors.js` と `app-body.js` の生成、`#monitors-feed` とそれを出し入れする `news-ui.js` の分岐、
  `atlas-state.js` の `monitors` 状態提供者（とスナップショットの 1 行）、`.mon-*` の CSS、使われなくなった
  9 言語の行 269 行（`scripts/i18n-dead-key-codemod.mjs --write`。中国語 2 表に残っていた `monitors.js` の出所注記も外した）。
  ⚠ **翻訳の床を下げた**（`tests/i18n-coverage-floor.json`、`node scripts/i18n-audit.mjs --update-floor`）: keyed 421→420
  （`tabMonitors`）、positional 7,642→7,519、inline fr/ko 6,102→6,014・zh 6,309→6,221。理由は訳の喪失ではなく
  **訳していた文の持ち主（`js/monitors.js` と Atlas の撤去文）が消えたこと**——残っている文の訳は 1 行も減っていない。
- **Atlas**: `system.monitor` の登録（`js/atlas-cap-system.js`）。能力表は `node scripts/atlas-caps.mjs --write` で
  209 → 208 行に再生成。撤去済み能力（`WITHDRAWN`）は空になった——仕組みは残す。
- **サーバー**: `supabase/functions/monitor-run/`、`supabase/config.toml` の宣言、persona の写しの説明。
- **DB**: 新しい migration `20261004150000_retire_area_monitors.sql`——cron を `cron.unschedule`（無ければ何もしない）、
  vault の秘密を削除（あれば）、realtime の publication から外す、`account_data_catalog` の 5 行を削除、5 表を
  `drop … cascade`（policy・trigger・index・grant も消える）、関数 10 個を `drop function if exists`。
  ⚠ **行は表とともに消える**（承認済みの撤去）。アカウント削除と書き出しは `_owned_by_user_cols()` が外部キーから
  **発見**するので、手で直す一覧は無い（`20260820120000_delete_account_txn.sql` で確認）。
- **計画表**: `_shared/plans.js` の `monitors` 列（読み手は SQL の `monitor_limit()` だけだった）。

## 2. 残したもの・失ったもの

- **残した**: 見守る場所の全部。ウィジェットの旧 ID `intmap.monitors` は「見守る場所」のカードの別名のまま。
  `docs/AREA-MONITORS.md` と `docs/architecture/18-area-monitors.md` は**ファイル名を変えずに**見守る場所の文書に改め、
  旧基盤は撤去の事実の 1 段落にした（変更できない migration `20261003211700_place_watches.sql` とコードがこのファイル名を指す）。
- **失ったもの**: 旧・地域監視の保存済みの監視・実行記録・証拠・レポートの行（本番の件数はこの作業では数えていない）。
  サーバーで定期実行して AI がレポートを書く能力そのもの。設計は旧 migration と git の履歴にだけ残る。

## 3. 構造として直したもの（撤去で見えた欠陥）

- `scripts/doc-facts.mjs` の `db-tables` は**すべての `create table` を「存在する」と数えていた**——表を落とす最初の
  migration が来ると、もう無い 5 表を pgTAP に要求し続ける。migration をファイル順・本文順に再生し、
  `drop table` で外すようにした。
- `tests/edge-spend-and-models-checks.test.mjs` の `cronJobs()` も同じ形で、`cron.unschedule` を読まず
  撤去した job を永久に「動いている」と数えていた。再生に `cron.unschedule` を入れ、`jobs.size >= 4` の手書きの数を
  「読めた schedule が 1 つ以上・残る job が 1 つ以上」に替えた。
- `doc-facts` の `monitors` 規則は `FEATURE_WITHDRAWN` の有無を前提にしていたので、撤去で「規則を書き直せ」の
  素通りになるところだった。木の事実（モジュールと関数のディレクトリが無い）から、文書が撤去した部品を
  「在る」と書いていないかを行ごとに測る規則に書き直した。
- **検査ではなく証人を消した**（memory「intmap-withdrawing-a-mechanism-keeps-its-check」）: `withdrawal-honest` と
  「撤去済みは索引に出さない」は合成の撤去（fixture）で測る。IM_HOST の live getter の不変条件は IM_HOST に訊く。
  `supporter-funnel` の①は「SQL の写しと表の列がいっしょに消えたか」を測る。

## 4. 本番で要る手作業（merge 後・この作業ではしていない）

- `supabase functions delete monitor-run --project-ref vpekfwdpurzejrrmacac`（CI の配備は消えた関数を消さない）。
- secrets の削除: `supabase secrets unset MONITOR_SECRET MONITOR_AI_MODEL MONITOR_AI MONITOR_RUN_GLOBAL_PER_DAY --project-ref vpekfwdpurzejrrmacac`。
- migration の適用で cron と vault の秘密は消える。適用後に `select jobname from cron.job` に `intmap-monitor-run` が
  無いこと、`node scripts/release-state.mjs --edge` が 21 本で一致することを確かめる。

## 5. 検査

`npm run check:static` `check:engine` `check:types` `check:i18n` `check:docs` `check:archfiles` `check:capabilities`
`check:catalog` `check:surface` `check:datagov`、触った検査ファイル、`npm run test:checks`、build 後の `check:perf`。
結果は PR に書く。
