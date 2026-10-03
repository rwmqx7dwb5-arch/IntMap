---
title: 見守る場所——撤去された地域監視の入口の代わりに、保存した場所の周辺の地震・警報・火山・ニュースの新着をページが判定して知らせる。AI もサーバーの定期実行も使わず、既読はアカウントに、閉じている間の通知（Web Push）は設計のみ・承認待ち
date: 2026-10-03
---

〈依頼〉全権委任の再開発の 1 本。分野は地域監視 (Area Monitors)——入口は撤去済みで基盤は動いたまま。
「放置された基盤を、今の IntMap（マイプレイス・events・地点プロファイル・状態ページ）の上に新しい商品として作り直す。
AI を定期実行して費用を増やす設計は避け、既存の非 AI データで判定する。Web Push など外部サービスの設定が要るものは
承認待ちとして設計だけ。なぜ入口が撤去されたかを dev-notes で調べ、その理由を解決した設計に。旧入口の復活ではなく新設計。」

## 0. 調べた（着手前）

### 0.1 なぜ入口が撤去されたか

撤去は R231 の 13 件の指示の 1 行「⑪Monitorsを一旦撤去」で、**理由は書かれていない**（`DEV-NOTES-ARCHIVE.md` R231、
memory にも無い）。理由を推測で作らず、**記録に残っている「この機能が払わせていたもの・届けていなかったもの」**を集めた:

| 記録 | 出典 |
|---|---|
| 専用タブとワークスペースのウィンドウ。撤去した回の 1 件目の指示は「携帯がまだ劇的に遅い」 | R231 |
| そのウィンドウは既定の矩形が無く、デスクトップの起動ごとに throw していた（1 ラウンド握り潰されていた） | R142 |
| 作成フォームは「情報源」を選ばせるが、実装はニュース 1 種類だけ（`COLLECTORS = { news }`） | R141 |
| サーバーの cron・共有秘密・変化ごとの AI 呼び出し——読者が増えるほど費用が増える | R141 / `docs/AREA-MONITORS.md` §Cost control |
| 読者の画面からの保存は R150 まで一度も成功していなかった（insert が `user_id` を欠いていた。検証は service_role 経由だけ） | R150 |

### 0.2 今ある材料（既に動いているもの）

- マイプレイス（`saved_places`・`js/my-places.js`）——場所がアカウントにある。
- 地震: USGS 2.5_week（`js/atlas-cap-research.js` `USGS_WEEK`）。**実測 2026-10-03**: 全世界 323 件。4 地点の半径 300 km /
  1,000 km の件数は 東京 5/9・LA 3/25・ジャカルタ 0/0・アンカレッジ 27/41。
- ニュース: `news_events`（anon で読める）。**実測**: 直近 72 時間・独立 2 媒体以上の active で代表地点のあるもの 296 件・48.8 kB。
  半径 300 km で 東京 6・ロンドン 25・NY 6。代表記事の URL は `news_articles!news_events_representative_article_id_fkey` で埋め込める（200 を確認）。
- 火山: `js/volcano-intel.js` の `status()` / `statusIndex()`（USGS HANS・気象庁・週報）。
- 警報: `js/world-packs.js` の `IntMapWorld.alertsQuery`（ウィジェット用に既にある、地図が塗る正規化済みの記録）と `__wpAlerts.at`（点判定）。
- ⚠ **見つけた既存の欠陥（直していない・§6）**: ウィジェットの「地点を監視」は `runCommand('tab.monitors')`（撤去で登録されていない）を呼び、
  失敗すると「監視はサイドバーにあります」と言っていた——何もしない扉と、真でない文。

## 1. 作ったもの——見守る場所

- **判定**: `supabase/functions/_shared/place-watch.js`（純粋な ESM。DOM・時計・ネットワーク・Deno に触れない）。
  4 種類それぞれ自分の尺度（M・機関の段階 1–4・火山の順位・独立媒体数）で「近い・強い」を決め、**鍵**で「新しい」を決める
  （警報の鍵に発表時刻を入れない＝再発表は新着でない／段階が上がれば新着、火山は順位が変われば新着）。
  初回は基準を記録するだけ。読めなかった種類は `unavailable`（理由つき）で返り、その種類の既読は次の保存でも保たれる。
  ページと将来のサーバー評価が同じ 1 本を使えるよう `_shared/` に置いた（`plans.js` と同じ前例）。
- **ページ**: `js/place-watch.js`——各フィードを 1 回の実行につき 1 回だけ読む（USGS 1 要求・ニュース 1 問い合わせで全見守りに答える）。
  USGS は `js/fetch-deadline.js` の `jsonWithin` と `js/proxy-fetch.js` の `clockFor`。警報は**警報レイヤーが読み込んでいる間だけ**
  （2 本目の正規化を作らない）。ログイン後に `js/auth-ui.js` が動的 import で起動し、idle 後に 1 回、以後 10 分ごと
  （隠れている間は休む）。新着はトースト 1 回（端末ごとに一度だけ）＋アカウントボタンの赤い点＋アカウントのシートの件数。
  ダイジェストのシート: 場所ごとに新着と現在のもの（種類・強さ・距離・時刻・出典・リンク）、情報源の状態、既読・一時停止と再開・設定・停止、
  見守っていない保存場所を 1 押しで追加。
- **DB**: `supabase/migrations/20261003190500_place_watches.sql`——保存場所 1 件に 1 行（`place_id` が主キー＝2 度目の見守りは同じ行の更新）。
  半径・種類ごとの基準（NULL＝見守らない）・オン/オフ・既読（`seen_at`・`seen_keys`）。RLS は本人だけ、挿入は場所が呼び手のもののときだけ、
  `user_id` はトリガーが場所の持ち主に固定。`account_data_catalog` に 1 行（書き出しと削除には一覧なしで入る）。
  pgTAP `supabase/tests/24_place_watches_test.sql`、`00_structure_test.sql` の 2 つの一覧に足して `plan(114)`。
- **Atlas**: `places.watch`（未保存の地名なら `places.save` を通して保存してから見守る。2 度目は `ALREADY_WATCHED`）・
  `places.unwatch`（見守っていなければ `ALREADY_DONE`）・`places.watchDigest`（もう一度確認して `exec.watchDigest` で構造ごと渡す・既読にしない）・
  `places.watchSeen`。`node scripts/atlas-caps.mjs --write` で 188 行。
- **入口**: アカウント ▸ 見守る場所／マイプレイスの「見守る場所…」／Atlas。
- **プライバシーポリシー §1**（en+jp）: 取得する情報に「見守りの設定（範囲・基準・既に見た出来事の識別子）」を足した。
  新しい送信先は無い（USGS・Supabase・火山の各機関は既存のレイヤーが既に読んでいる）。

## 2. 理由ごとの答え（設計の要点）

| 撤去の記録 | 見守る場所 |
|---|---|
| タブとウィンドウ・起動の重さ | タブを足さない。保存場所・アカウント・Atlas の中に置き、未ログインの起動経路には載らない |
| 情報源がニュース 1 種類 | 地図が既に描いている 4 種類 |
| cron・秘密・変化ごとの AI | サーバー実行なし・AI なし。判定はコード、文はレコードそのもの |
| 読者としての経路が未検証 | 全ての扉を**読者として**pgTAP で試す（拒まれるべきものも） |

## 3. 承認待ち（実装していない）

**IntMap を閉じている間の通知（Web Push）**——VAPID 鍵（Supabase secret）・購読の表・プライバシーポリシーでのプッシュ提供元の明記・
サーバー評価（既存 pg_cron で 10 分ごと、同じ `_shared/place-watch.js`、AI なし）・送信。外部サービスの設定・秘密・読者ごとに増える
関数呼び出しの費用を伴うので承認事項。設計は `docs/AREA-MONITORS.md` §Watched places。⚠ 警報だけはサーバーで同じように読めない
（正規化がブラウザの `js/world-packs.js` にある）ので、先にそれを `_shared/` へ移す必要がある。

## 4. 境界の窓口（`check:surface`）

`window.IntMapDialog`（+2）・`window.IntMapNewsEvents`（+3）・`window.IntMapVolcano`（+3）の読みが増える。
どれも持ち主がまだ export していない（`IntMapDialog` は `js/dialog.js`、`IntMapNewsEvents` は `js/news-events.js` が作る API、
`IntMapVolcano` は遅延モジュール `volcanoIntel` が mount 時に公開する）。`node scripts/global-surface.mjs --update` で記録した。

## 5. 検査

- `tests/watch-places-checks.test.mjs`（新規・node・7 本）: 規則を評価（種類ごとの近さ・強さ・鍵、初回は何も新着にしない、
  読めなかった種類の既読を保つ、SEEN_MAX で新しい方を残す）／規則が名指す数と migration の CHECK・既定値を照合／
  ページの読み手と実行器を代役のフィードで（USGS 1 要求・ニュース 1 問い合わせ・警報は点判定で区域内のものだけ・レイヤーが
  オフなら「未確認」）／見守りを端から端まで（基準の保存 → 新着 → トースト 1 回 → 同じものは再び知らせない → 既読がアカウントに）／
  Atlas の能力（places.watch・unwatch・watchDigest・watchSeen）／扉（動的 import・`data-effect`・AI を呼ばない・規則が純粋）。
  変異: 端末ごとの重複排除を外す → ④ が赤、初回の基準を外す → ①④ が赤。
- **DB は PGlite（Postgres・WASM）に最小の代役**（`anon`/`authenticated`/`service_role`・`auth.users`・`auth.uid()`）を置き、
  `account_data_catalog` の表・`saved_places`・この migration（2 回流して冪等）を流して読者として試した: 既定値 300/4.5/2/2/2、
  2 度目は同じ行の更新（`created_at` 不変）、NULL で種類を止める、`user_id` の書き換え・他人の場所の見守り・`user_id` を
  名指した挿入はすべて 42501、半径 1,001 km と既読 2,001 件は 23514、他人の行は 0 件・更新 0 行、anon は 42501、
  場所の削除で見守りも消える、カタログに 1 行。⚠ これは pgTAP の代わりではない（Supabase の本物の auth・既定権限・
  `_owned_by_user_cols()` での書き出しと削除は通していない）。正本は CI の DB job の `24_place_watches_test.sql`。
- ⚠ 説明文の語が `find_capability` の順位を動かした（実測）: 最初の説明文は「見守っている場所」「measure, distance」を含み、
  「今いる場所の天気」で `data.weather` が 5 位に落ち（`atlas-find-semantic` ①）、「measure distance between two places」の
  記録済みカセットが 1 件 → 6 件に変わった（`atlas-capability-single-source` ⑥）。説明文から「いる場所」「場所の」「measure」
  「distance」を外して両方とも元の順位に戻した——検査は弱めていない。

## 6. 残したこと・提案

- **ウィジェットの「地点を監視」はまだ撤去済みの `tab.monitors` を呼び、「監視はサイドバーにあります」と言う。** 見守る場所を
  開くように直すと、その 5 言語の文が使われなくなり、fr/ko/zh/zh-Hans の locale の 1 鍵（4 行）が「誰も求めない鍵」になって
  `check:i18n` が赤くなる（実測）。この作業は en/jp 以外の locale を触らない取り決めなので、直していない。直すには
  `js/widget-layout.js` の `openMonitors` を `import('./place-watch.js')` の `openWatchDigest` に替え、
  `scripts/i18n-dead-key-codemod.mjs --write` で 4 行を消し、`tests/i18n-coverage-floor.json` の de/es/ru の位置引数の床を 1 下げる
  （消えるのは真でない文 1 つ）。

- ウィジェットの「保存地点の警報」カードは、端末の `intmap_saved_places`（ウィジェット専用の localStorage 一覧）と旧 `IntMapMonitors.list()` を
  読む——アカウントのマイプレイス／見守る場所とは別の一覧である。1 本にするのは今回の範囲外（ウィジェットの持ち主の判断が要る）。
- 旧・地域監視基盤（`js/monitors.js`・`monitor-run`・5 表・cron）は**触っていない**。見守る場所が置き換えたので、撤去
  （cron の停止・関数の削除・表の削除）を提案できる状態になった——削除は承認事項なので提案に留める。
