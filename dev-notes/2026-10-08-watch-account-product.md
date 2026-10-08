---
title: 今日のクエスト——暦の 1 日ごとに学ぶクエストの「その日のセット」を置き、年代当ては歴史の「今日」から出し、最初の結果と連続日数をこのブラウザとアカウントに残す（毎日戻ってくる理由）
date: 2026-10-08
newsen: New: Today's quest. Each day has its own five-question set of each learn quest, the same for everyone; the year quest starts with today's date in history. Your first finish counts, with your streak and the last seven days, on every device when signed in.
newsjp: 「今日のクエスト」を追加。学ぶクエストに毎日 5 問のその日のセット（その日は全員が同じ問題）。年代当ては地図の記録が「今日」の日付をつける出来事から出ます。最初に解き終えた結果がその日の記録になり、連続日数と最近 7 日を表示。ログインすると、どの端末でも同じ連続記録に。結果はコピーして共有できます。Atlas に「連続何日？」とも訊けます。
---

〈依頼〉「見守る場所・アカウント・リピート利用」分野の商品開発（全権委任）。利用者が毎日 IntMap に戻ってくる理由を作る。
足し算のみ・課金なし・Web Push は実装しない・外部サービスの設定を変えない。

## 0. 何を・誰に・なぜ今

- **何を**: 学ぶクエスト（場所当て・年代当て）に、暦の 1 日ごとの**その日のセット**。その日の最初の結果が記録になり、
  **連続日数**・最長・最近 7 日を示す。ログインすると記録がアカウントに入り、どの端末でも同じ連続記録になる。
- **誰に**: 地図・歴史好きの一般層と、授業で毎日 1 問を出したい教員（その日の挑戦リンクはクラス全員が同じ問題）。
- **なぜ今**: 既存の「戻ってくる理由」を数えると、見守る場所（何かが起きたときだけ）・この日の歴史地図（読むだけ）・
  今週の地球（週 1）で、**毎日、手を動かす理由**が無かった。学ぶクエストは決定的なエンジン（seed → 問題）を既に持ち、
  時計（Chronos）を使う唯一の遊びなので、「今日」という日付そのものを seed にすればサーバーも問題の一覧も要らない。
  アカウントの価値（どの端末でも続く）も、新しい表 1 つで足りる。

## 1. 作ったもの

- **`js/quest-engine.js`「THE DAY'S SET」**（純関数）——seed `d<YYYY>-<MM>-<DD>` がその日のセットを述べる（読者の暦の日）。
  `DAILY_N`＝5、`dailySeed`・`dailyOf`・`parseDay`（2 月 30 日は日ではない）・`dayOf`・`isDailySet`（「今日の記録になるか」の判定は
  これ 1 つ。メニュー・Atlas・友達のリンクのどの扉からでも）・`addDays`（UTC 正午の暦算）・`dailyStreak`。
  `when.generate` は日付の seed のとき、索引がその**月日**に日付をつける出来事を先に、残りを全体から出す。**日付でない seed の
  問題列は 1 問も変わらない**（以前の挑戦リンクのため。検査が旧アルゴリズムを再計算して照合）。
- **`js/quest-daily.js`**——記録と集計。ブラウザ（`intmap_quest_daily`）とアカウント（`quest_daily_results`）。最初の結果が残り、
  同じ日・種類の 2 回目は「記録済み」（失敗ではない——`.agents/rules/one-pass-or-a-reason.md`）。アカウントを読めなかったときは
  「記録なし」と言わずブラウザの記録を示して読めなかったと述べる。アカウントは 1,000 行ずつ短いページまで読む（PostgREST の `max_rows`）。
- **パネル**（`js/quest-panel.js`）——メニューの先頭に「今日のクエスト」（日付・連続日数「今日解くと N 日目」・最近 7 日の点・2 種類の
  ボタン・記録の置き場所）。結果画面に「今日の記録に入りました／練習です」と保存先、**結果をコピー**（日付・種類・合計・連続日数・
  各問の得点・リンク。絵文字は使わない）。
- **アカウントのシート**（`js/auth-ui.js`）——「あなたのデータ」に「今日のクエスト」の行（連続日数を添える）。
- **Atlas** `learn.daily`（`dailyQuest`: `state`・`start`・`link`）。`state` はパネルと同じ集計を読み、**アカウントへの追記はしない**
  （行が宣言する効果のまま）。`start` の判定はパネル自身の状態（今日のセットの 1 問目か）を呼んだ後に読む。
- **DB** `supabase/migrations/20261008090000_quest_daily.sql`——`quest_daily_results`（主キー＝読者・日・種類、得点 5 つだけ）。
  INSERT（`day`・`kind`・`scores` の列だけ）と SELECT のみ、UPDATE と DELETE の扉は無い（最初の結果を書き換えられない）。
  `user_id` はトリガーが呼び手に固定、UTC で明日より後の日は拒む、最初の日は 2026-10-08。目録 `account_data_catalog` に 1 行、
  書き出しとアカウント削除は FK の発見で届く。pgTAP `30_quest_daily_test.sql`、構造の検査 `00_structure_test.sql` に 2 か所（plan 104→106）。
- **プライバシーポリシー**（`js/legal-text.js` §1・§6、日英）——保持するもの・ログイン前の記録はブラウザにだけあること・保持期間。

## 2. 決めたことと理由

- **日付は読者の暦の日**（UTC ではない）。壁のカレンダーと同じ日に同じ問題。DB は UTC＋1 日まで受ける（UTC+14 の地域がある）。
- **1 日 2 種類、連続日数はどちらか 1 つで数える**。年代当てを主にした（時計を使う遊びで、「今日」の出来事から出る）。
- **ログイン前の記録は、ログイン中に集計を読んだときアカウントへ足す**。連続記録が端末で分かれないことを優先し、メニューと
  プライバシーポリシーでそう述べる。Atlas の `state` だけは読むだけ（追記はパネルとアカウントのシートが行う）。
- **やらなかったこと**: ランキング（他人の記録を読む扉を作らない）・通知（Web Push は未承認）・連続記録の「救済」（記録の改竄に当たる）。

## 3. 検証

- `node --test tests/watch-account-product-checks.test.mjs`（7 件）・`tests/learn-quests-checks.test.mjs`（10 件）。
  ④ は偽のブラウザと偽のアカウント（主キー・挿入のみ・1,000 行のページ）の上で記録と集計を**実行**する。
- ブラウザ（build 済みの dist）: その日の挑戦リンクで年代当てを最後まで解く→「今日の記録に入りました」・ブラウザに今日の 1 件→メニューに「1-day streak」・最近 7 日の今日の点・年代当てが済み→もう一度解くと「練習」で最初の結果が残る、を 3 回通した。
  ⚠ spec は**コミットしていない**——`check:testbudget` の天井（全体 87.5 分）に余白が無く、測っていない spec 1 本で超える。
- `check:static`・`check:i18n`・`check:docs`・`check:catalog`・`check:capabilities`・`check:archfiles`・`check:types`・`check:surface`。
- ⚠ `supabase db reset` / `supabase test db` は**走らせていない**——このマシンの Docker デーモンが止まっている（`docker ps` が
  `dockerDesktopLinuxEngine` に接続できない）。pgTAP は PR の CI の DB ジョブが走らせる。

## 4. 残り

- 本番の DB に migration を流すのは merge 後の配備（Edge Function は変えていない）。
- 9 言語のうち en+jp だけを書いた（憲法 §7）。
