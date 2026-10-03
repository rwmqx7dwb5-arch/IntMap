---
title: 地図の誤り報告を往復にした——読者が「ここが違う」を地点・表示・年つきで送り、運営者が地図の上で裁き、回答が受付番号で報告者に返り、直したものを公開の訂正記録に載せる
date: 2026-10-03
---

〈依頼〉「様々な側面から監査し、すべてやりきって。……改善ではなく商品開発、マーケティング、営業。」の 1 本。
分野はフィードバック・寄付・管理・コミュニティ。同じ日に相談フォーム・支援のページ（sales-channels）と
admin の Growth（growth-loop）が着地していたので、その上に**利用者が IntMap に参加する仕組み**を作った。

## 0. 測った（着手前）

| 何 | 着手前 | 意味 |
|---|---|---|
| 地図の誤りを伝える経路 | フィードバック（星と自由記述）とバグ報告（診断情報）だけ。**地点・年・レイヤーを運ばず、返事も来ない** | 「ここが違う」は文章 1 行として届き、運営者はどこのことかを推測するしかなかった |
| 歴史地図の主張の検査 | 門は形式を測る。「その年にその単位があったか」は測れない（`historical-verification.md` §1） | その土地を知る読者が唯一の計器なのに、聞く経路が無かった |
| 匿名の書き込み | `supabase/tests/14` が public の全表に「anon が直接 INSERT できない」を課す。`reader-reports` が唯一の書き手 | 誤り報告も同じ経路に載せる。INSERT policy を開けない |
| 報告者への返事 | 相談はメールで返す。フィードバックは返さない | メールを集めずに返す方法が要る |
| 運営者の画面 | admin.html は表の一覧。地図は無い | 地点つきの報告を地図の上で見る画面が無い |

## 1. 作ったもの

1. **報告のカード**（`js/map-corrections.js`、クリックで取得）。入口は地図の右クリック、地点プロファイルのカード、
   Atlas の `corrections.report`（下書きして開く・**送るのは読者**）。添付は地点・ズーム・`MapState.hash()`（共有リンクの
   断片＝レイヤー・年・比較まで）・過去の時計の年。読者が選ぶのは種類・レイヤー・本文・出典。
2. **書き込み**は `reader-reports` の kind `correction`。規則は `_shared/correction-shape.js` の `checkCorrection` 1 つで、
   カードは送る前に同じ関数を通す。表 `map_corrections`（`20261003184500_map_corrections.sql`）に INSERT policy は無い。
3. **受付番号による返事**。関数が 32 バイトの受付番号を作り、表には sha256 だけを書き、201 で一度だけ返す。端末は
   `localStorage` に保持し、`map_correction_status(receipts[])` で回答を読む（anon 可・自分の行だけ・spam は「終了」）。
   ログイン中は `my_map_corrections()` で全端末から。設定 ▸「地図の誤り報告」、Atlas `corrections.mine`、未回答の
   受付番号を持つ端末だけの 12 時間ごとの確認と一度だけの通知。**メールアドレスは集めない**。
4. **運営者のコンソール `admin-corrections.html`**：報告を世界地図の点で並べ（`data/land-mask.png` を経緯度そのままの
   SVG に敷く）、読者が見た表示を本番の地図で開き、25 km 以内の報告を重複の候補に出し、**歴史の年を持つ報告には
   `hist-fidelity.mjs --year --in` の列挙と規則の 5 問を出す**。状態・回答・変更内容・公開を保存する。
5. **公開の訂正記録 `corrections.html`**（en/ja、組織向けページのナビに並ぶ）：報告のしかた・確かめ方・件数と
   回答までの日数の中央値・公開した訂正（運営者の要約だけ）・このブラウザの報告。Atlas `corrections.log`。
6. プライバシーポリシー §1・§6（en + jp）に、集めるもの・ハッシュだけを持つこと・公開の範囲・保存期間を書いた。

## 2. 構造として決めたこと

- **語彙と上限は 1 か所**（`correction-shape.js`）。表の CHECK、トリガーの「未回答」、状態関数の spam→closed、
  生成ページのラベル、コンソールの選択肢がそれに従い、`tests/community-next-checks.test.mjs` ① が突き合わせる。
  ラベルの無い語があれば生成器が止まる。
- **resolved_at は事実に付けた**（トリガー）。書く画面が正しく書くことに頼らない。
- **公開できるのは運営者の文だけ**。公開の CHECK は「回答あり・回答済みの状態」、公開関数は本文・報告者・受付番号の
  列を持たない。
- **話すページの一覧を生成器の 1 つの集合にした**（`TALKS`）。sales-channels の検査は `contact|support` を正規表現で
  持っていたので、3 つ目のページを足すと検査の写しが古くなる形だった。検査は `GEN.TALKS` と `GEN.ADMIN_PAGES` を読む。
- 受付番号の保存キー `intmap_corrections` は 3 か所（モジュール・起動時の安い確認・公開ページ）に現れる。起動経路に
  モジュールを載せないための写しで、検査⑤が 3 者の一致を測る。

## 3. 残したこと

- **deploy の順序**：migration `20261003184500_map_corrections.sql` を先に、次に `reader-reports`（`_shared/correction-shape.js`
  を import）。逆順だと報告は 503 になり、カードは「送れなかった」と言う（失われない）。
- `sitemap.xml` は組織向けページ（corrections を含む）をまだ載せていない（sales-channels から続く穴。`scripts/landing.mjs` の範囲）。
- 公開の訂正記録の最初の 1 件は、運営者が実際に報告を裁いてから現れる。それまでページは「まだありません」と言う。
- 9 言語のうち en と jp 以外は凍結のまま（設定の 1 ラベル `myMapReportsBtn` は en/jp だけに足した）。

## 4. 共有窓口（`check:surface`）に足した辺

- `js/map-corrections.js` が `window.IntMapLayers` を 1 回（表示中レイヤーの選択肢。`js/place-dossier.js` と同じ読み方）と
  `window.SUPABASE_URL` を 1 回（`reader-reports` の住所。`js/feedback.js` と同じ読み方）読む。
- `js/admin-corrections.js` は `admin-inquiries.js` と同じ**素の script** で、`vendor/supabase-js.js`（UMD）が出す
  `window.supabase` を 3 回、`js/safe-html.js` の `window.IntMapSafe` を 1 回読む（import できない。admin.html と同じ形）。
- `node scripts/global-surface.mjs --update` で台帳に記録した。module 化するなら 3 つの管理画面を一緒に。
