---
title: クラスのセット——挑戦リンクにクラスのコードを足し、生徒はアカウントなしで名前を入れて解き、答えが先生のボードに届く（提出者・問題ごとの得点・いちばん苦戦した問題・クラス全員のタップを地図に・CSV）
date: 2026-10-13
newsen: New for teachers: class sets. Give a class a learn quest by link; students need no account. Their answers come to your board: who handed in, every score, the hardest question and the whole class's taps on the map. Download it as CSV.
newsjp: 先生向けに「クラスのセット」。学ぶクエストをリンクで配ると、生徒はアカウントなしで解き、答えが先生のボードに届きます。提出者・全員の得点・いちばん苦戦した問題・クラス全員のタップを地図に。CSV でも保存できます。
---

〈依頼〉第 4 波・教育分野の商品開発（全権委任）。授業ツアー（第二次世界大戦・冷戦の終結）を複製せず、教員が授業で使える次の商品を。

## 0. 何を・誰に・なぜ

- **今あるもの**（第 1〜3 波）: 授業ツアー・ツアー作成・印刷用ワークシート・単元対応表と学校向けの 1 枚・学ぶクエスト（場所当て・年代当て）と
  挑戦リンク・今日のクエスト。
- **欠けていたもの**: 挑戦リンクは「クラス全員に同じ問題」を配れるが、**生徒の答えはそれぞれの端末に残るだけ**で、先生には何も返らなかった
  （授業ページ自身が「どこにも送信しません」と書いていた）。先生は誰が解いたかも、どの問題でクラスがつまずいたかも、クラスが「ラゴス」をどこだと
  思っていたかも知れない。授業で使う道具としては、配るところで止まっていた。
- **作ったもの**: **クラスのセット**。挑戦リンク＋クラスのコード（`&class=<code>`）。生徒は**アカウントなし**で名前を入れて解き、解き終えると
  答えが先生の**ボード**に届く。ボードはクラスの平均・中央値・**いちばん苦戦した問題**（次の授業で戻るべき 1 問）・場所の問題では**クラス全員の
  タップを正解のまわりに地図へ**描く（教室の画面に映すと、それ自体が授業の教材になる）・年の問題は答えた年の分布・生徒ごとの得点・CSV（成績簿へ）。
  IntMap の地図と出題エンジンがあるから作れるもので、ふつうの小テストの道具には「クラスのタップの散らばり」は描けない。
- 1 つの大きな商品として選んだ理由: 教員にとっての価値（形成的評価）・新しい読者（生徒はアカウントなしで来る）・流通（先生が配るリンクが
  クラス全員を連れてくる）が 1 つの仕組みで同時に増える。

## 1. 形

- **得点を保存しない・送らない。** 問題は（種類・seed・n）とデータの関数、得点は問題と答えの関数（`js/quest-engine.js`）なので、生徒は**生の答え**
  だけを送り、ボードが `js/quest-panel.js` の `questionsOf()` から**パネル自身の問題とエンジン**を借りて `tally()` で採点する。生徒が送る得点は
  誰も検証できない 2 本目の写しになる。答えは場所＝`[lng, lat]` を小数 3 桁（約 100 m。1000^(−0.1/20015) ≈ 0.99997 で得点の差は 1 点未満——検査 ②
  が実データの問題で確かめる）・経度は [−180, 180] に（世界を回した地図は −160° を 200° と言う）、年＝整数、スキップ＝null。
- **セットの問題はセットの持ち物。** 生徒のリンクの `quest=` を手で書き換えても、開くのは DB が持つ kind・seed・n。違う問題に答えを付けない。
- **最初の提出が残る**（`.agents/rules/one-pass-or-a-reason.md`）: 同じセットに同じ名前（大文字小文字・前後の空白を無視）の 2 度目は `name_taken` と述べる。
  上書きしない。締め切ったセットは `closed`。結果画面は「何が起きたか」を述べ、送り直しは**結果が変わりうる**とき（名前を変える・接続の失敗）だけ出す。
- **長さは 1 つの一覧** `SET_LENGTHS`（`js/quest-engine.js`）。パネルの「1 回の問題数」の `<option>` も DB の `CHECK (n in (5, 10))` もそこと一致
  （パネルの選択肢は一覧から作るように直した——表示は同じ）。種類は `QUEST_KIND_IDS`、名前の上限 24 は `CLASS_NAME_MAX` で、表の CHECK・
  `class_set_submit` の検査と 3 か所を検査 ① が突き合わせる。
- **DB**（`supabase/migrations/20261013090000_class_quest.sql`）: `class_sets`（所有者の RLS・`user_id`・`code`・`open`・`created_at` はトリガー
  `tg_class_sets_own` が決める・kind/seed/n は書き換え不可）と `class_set_answers`（INSERT の権限は誰にも無く、`class_set_submit` だけが書く。読む・
  消すはセットの持ち主だけ）。生徒の扉は `class_set_open`・`class_set_submit` の 2 つ（SECURITY DEFINER・`ANON MAY CALL:` の理由つき）。コードは
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` から 8 文字（40 ビット、`gen_random_uuid()` の version/variant 以外のバイトを mod 32——256 は 32 の倍数なので偏らない）。
  `class_sets` は `user_id` で `_owned_by_user_cols()` に入るので、書き出し・アカウント削除・目録は何も名指さずに届く（`account_data_catalog` に 1 行）。
- **ボード**（`js/quest-class-board.js`）は受付中のセットを開いている間だけ 15 秒ごとに読み直す（`everyTick`。閉じる・締め切る・他の画面で止まる）。
- **Atlas** `learn.class`（`classSet`: `list`・`create`・`results`・`open`・`close`・`board`）。`results` はボードと同じ `tally()`。判定は DB が返した行か
  ボードの状態を呼んだ後に読む。catalogue は `learn.quest` の節の at 720。

## 2. 定数（`.agents/rules/no-ad-hoc-hardcoding.md` §4）

| 数 | 観測 | 失効 | 正本 |
|---|---|---|---|
| 1 セット 400 件 | **推定**: 日本の 1 学年（最大 10 クラス×40 人）が 1 セット | 先生がそれ未満で拒まれたと実測された日 | migration |
| 1 日 50 セット／先生 | **推定**: 1 日 6 コマ×数セット＋余裕。ループを止める柵で割当ではない | 同上 | migration（`relay_take('class-set')`） |
| 365 日で削除 | 選択: 1 学年＋余裕。子どもの名前を入力した年より長く残さない | 方針の変更 | migration の cron 引数（プライバシーポリシー §6 と目録の文は検査 ⑦ が同じ数か確かめる） |
| 名前 24 文字 | 選択: 名字なしの名前か出席番号が携帯の 1 行に入る | 先生がフルネームを求めた場合（ボードはそれを勧めない） | `js/quest-class.js` |
| ボード 15 秒 | **推定**（測っていない）: 1 回は最大 400 行の select 1 本 | realtime に替える・遅いと報告された日 | `js/quest-class-board.js` |

## 3. 一緒に変えたもの

- プライバシーポリシー §1・§6（en+jp）: アカウントの無い人（生徒）が送るデータの初めての形なので、§1 に生徒側の段落「クラスのセット（生徒）」を足し、
  保持 365 日を §6 に。最終更新日を 2026-10-13 に。外部ホストは増えていない（送り先は既に開示している Supabase）。
- 授業ページ（`scripts/landing-text.mjs` → `teachers.html`・`ja/teachers.html`）: 「クラス全員に同じ問題を」に 4 段目「生徒全員の答えを見る」。
  注記の「どこにも送信しません」は挑戦リンクについてだけ真になったので、クラスのリンクが何を誰に送るかを書き分けた。
- 文書: `docs/architecture/08-ui.md` §8.6.4・`06-supabase.md` §6.1（47 表）・`docs/DATABASE.md`（表・関係・関数・分類・pgTAP）・`PRODUCT.md`・`docs/FILES.md`。
- `tests/global-surface-baseline.json`: `window.IntMapSafe` の読みが 1 つ増えた（新しいグローバルは無い）。`js/safe-html.js` は export を持たない古典スクリプトで、ボードは `js/quest-panel.js` と同じ読み方で文字を逃がす。`--update` で記録した。
- migration の本数（`docs/FILES.md`・`docs/architecture/16-data-protection.md`）を 53 に。**能力の手書きの数（222 → 223）は統合時に合わせる**ので触っていない（`check:docs` の capability-count はこの枝では赤のまま）。
- pgTAP `39_class_quest_test.sql`、`00_structure_test.sql` の 2 つの一覧に 2 表（plan +4）。

## 4. 確かめたこと・残したこと

- **費用**（`npm run build` → `check:perf`、天井は統合時に合わせるので `tests/perf-baseline.json` は触っていない）: 起動時に読むものは 0 バイト増（PHONE 334.6 kB・3 リクエストのまま。新しい 2 本はどちらも遅延チャンク）。`quest-panel` 27.5 → 33.1 kB（名前の画面・提出・クラスで使う）、新しい遅延チャンク `quest-class` 8.4 kB・`quest-class-board` 22.1 kB、`atlas-console` +7.9 kB（`learn.class` の実行と目録の文）。いずれも先生がクエストを開いたとき／Atlas を開いたときだけ読まれる。

- 回帰 `tests/wave4-education-checks.test.mjs`（8 件）。採点の逆転（最難の問題を最高平均にする）を入れると ③ が落ちることを確かめた。
- **このマシンに Docker が無く、`supabase db reset`／`supabase test db` は走らせていない**——pgTAP 39 は CI の DB ジョブが初めて実行する。
- 生徒の名前は先生のデータとして先生にだけ見せる。生徒どうしの順位表は作っていない（意図して: 教室で順位を晒すかは先生がボードを映すかどうかで決める）。
- 先生が未ログインでボードを開いた場合はログインを出すが、ログイン後に自動で作成へ進む配線は無い（もう一度「クラスで使う」を押す）。
