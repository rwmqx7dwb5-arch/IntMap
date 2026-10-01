---
title: マーケティングの効果を自前の匿名集計だけで測る——（UTC の日, metric, dimension）→ 件数の upsert だけを持つ usage_counts と、匿名の Edge Function usage-count。何を数えてよいかは 1 つの宣言（usage-count/shape.js）をブラウザと関数が共有し、宣言外は関数が捨てる。Cookie・IP・アカウント・User-Agent・質問の内容・日より細かい時刻は送らず持たない。DNT / GPC / 設定オフ（Atlas からも）では何も送らない
date: 2026-10-01
---

〈依頼〉利用者の決定（2026-10-01）:「マーケティング効果測定のため**自前の匿名集計のみ**を入れる。Cookie なし・IP や個人を保存しない・Supabase に日別・流入元・使われた機能の**件数だけ**。プライバシーページも更新。」

## 0. 測った（着手前）

- 利用を数える仕組みは**無かった**。`window.INTMAP_ANALYTICS` は第三者アナリティクスのスイッチで、既定オフのまま何も読んでいない（`js/client-error-report.js` の註）。
- 近い前例は `client-errors`（client-error-log）: 匿名・`verify_jwt=false`・Origin 許可・共有 bucket 2 つ（呼び手はアドレスの HMAC）・表は admin だけが読み、書くのは SECURITY DEFINER の RPC だけ。形はそのまま借りた。
- 機能の「中央の経路」を探した結果:
  - **レイヤー**: `#layer-dropdown` のチェックボックスの `change`。行・セッション復元・Atlas（`toggleLayer` は `checked` を立てて `change` を発火）が全部ここを通る。⚠ 復元も同じイベントなので、「読者が点けた」は `isTrusted` か user activation の窓の中、で分けた（起動時の復元は数えない）。
  - **比較・共有**: UI のボタン（`#btn-compare` / `#btn-share`）は IntMapOS を通らず直接開く。Atlas 側は能力 `panel.compare` / `panel.share` で、実行器が `IntMapOS.emit` に lifecycle を流す（`capabilityId` 付き。同じ phase が syscall ログ側にも `cmd` 付きで 2 度目に流れる——`capabilityId` だけを読む）。⇒ document への委譲クリック 1 本＋バス購読 1 本。
  - **タイムラプス**: 時刻の再生ボタンは 2 系統（`IntMapWxPlayer` の `.ecl-b` と雨雲レーダーの `.rv-b`）とも `data-act="play"` を持つ。⇒ 選択子 1 つ。
  - **寄付**: `window.INTMAP_STRIPE_URL_EN/JP`（js/app-body.js）を指すリンクのクリック。URL は写さず、クリック時に読む。
  - **インストール**: 既存のインストール導線は無い（`beforeinstallprompt` を扱うコードは 0）。ブラウザ自身の `appinstalled` を聞く。
  - **Atlas への質問**: ⚠ **ターン開始はどこにも放送されていなかった**（`js/atlas-console.js` の中で `ASTATE.beginTurn` を呼ぶだけ）。バスに `{kernel:'atlas', phase:'turn', turnId}` を 1 つ流すのが最小の変更（質問文は載せない）。
- 起動の時点: `window.IntMapOS` は js/app-body.js の DOMContentLoaded（Cesium 選択時はさらに後）で作られる。⇒ ポーリングせず、DOMContentLoaded・load・最初の pointerdown/keydown で冪等に購読を試みる。

## 1. 形

- **宣言は 1 か所**: `supabase/functions/usage-count/shape.js`。metric ごとに dimension の規則（閉じた集合／ホスト名／utm の字句／レイヤー ID の形）、1 要求の最大、**1 日の dimension 数の上限**（`maxDims`）。ブラウザ（`js/usage-counts.js`）と関数（`usage-count/index.ts`）が同じファイルを import する（client-error-shape と同じ「1 ファイル・2 読み手・写し無し」）。
- ⚠ **開いた dimension（参照元ホスト・utm・レイヤー ID）は値の許可リストにできない**。字句（`@`・空白・`/`・`%` を通さない、ローカル名と IP リテラルを通さない）と、**metric ごと 1 日の異なる値の数**（`record_usage_counts` の中で、新しい値は拒み既知の値は数える）の 2 段で縛った。レイヤーの許可リストを関数に持たせることは考えたが、関数は js/layer-manifest.js を import できない（関数のバンドルの外）——ブラウザ側は `isLayer()` で manifest にある ID だけを送り、検査がマニフェストの全 ID がサーバーの規則を通ることを測る。
- **送信**: ページが隠れる／閉じるときに `navigator.sendBeacon`（text/plain・preflight なし）。本番のオリジンからだけ。DNT / GPC / 設定オフでは**記録もしない**（オフにした瞬間に未送信分を捨てる）。設定の select は `index.html` に 1 つ、配線は `js/usage-counts.js` が持つ（app-body の設定保存には足していない）。Atlas の `settings.usageCounts` が同じ `set()` を呼ぶ。
- **DB**: `usage_counts` は `(day, metric, dimension, count)` だけ。RLS・admin の SELECT だけ・書くのは service_role の RPC だけ。集計表示は `usage_counts_summary`（**SECURITY INVOKER**——admin の policy がそのまま効くので 2 つ目の門を持たない）。保持 400 日（pg_cron `usage-counts-purge`）。
- **admin.html**: Usage タブ（日別 PV と metric ごとの上位）。既存のタブ切替の行は触らず、追加のリスナが自分のセクションだけを出し入れする。値は全部 `window.IntMapSafe.html`。表示する metric 名は表から読み、名前の一覧を写していない。

## 2. 否定した見立て・測り直したもの

- `preview()` は最初、DNT が実行中に立ったとき**それ以前の保留分を見せていた**（送信時には捨てるので漏れはしないが、「送るもの」の表示が嘘になる）。spec がこれを捕まえた——保留の読み出しにも同じ判定を通した。
- 宣言の各行に `what`（意味の文）を値として持たせていたが、実行時に読む者が 0 で、このファイルは起動の束に入る。コメントに移した。
- `HOST_LABEL` を後読みの正規表現リテラルで書いていた。Safari 16.4 未満では**構文エラーで束ごと読み込めない**ので、後読みなしの形にした。

## 3. 起動費

`check:perf`: eager に 2 モジュール（`js/usage-counts.js`・`usage-count/shape.js`）。**この変更の寄与を同じ木で測った**——`src/main.js` の import 1 行だけを外したビルドとの差で eager raw **+7.5 kB**・gzip **+2.3 kB**・modules **+2**（単体を esbuild で minify して 5.9 kB + 3.5 kB）。⚠ import を外した木でも、このマシンのビルドは天井を gzip +6.3 kB 超えていた——それはこの変更ではなく、天井（main の CI で測った値）とこの木の計測の差である。起動時に行うのは購読と URL の読み取りだけで、ネットワークは隠れるときの 1 本だけ。

`check:surface` が名指した新しい window 経由の結合（持ち主が export していないので import にできないもの）:
- `window.IntMapUsage` — 新しい global。設定と Atlas は `usage` を **import** する（`js/atlas-cap-settings.js`）。window に置くのは、組み上がったページを spec が問うためだけ（spec には import の道が無い）。
- `window.INTMAP_STRIPE_URL_EN` / `_JP` — 寄付リンクの判定。URL を写さず持ち主（js/app-body.js）の値をクリック時に読む。
- `window.IntMapDevice` — 端末の種類の唯一の持ち主（js/ui-device.js）。
- `window.IntMapOS` — カーネルのバス（js/app-body.js が起動中に作る）。
- `window.SUPABASE_URL` — 送り先。`js/client-error-report.js` と同じ読み方。

## 4. 検査

- `node --test tests/anonymous-usage-counts-checks.test.mjs` — 宣言・ブラウザ（偽のページで評価）・Edge Function（Deno と fetch を差し替えて `handle()`）・migration・設定と Atlas・開示。
- `npx playwright test tests/anonymous-usage-counts.spec.js` — 1 回の起動で、送る本文が宣言どおり／DNT・GPC を実行中に切り替えて止まる／設定スイッチ／ローカルから 1 本も beacon しない。計測 8.6 / 10.6 / 8.5 秒（1 worker）。
- `supabase/tests/15_usage_counts_test.sql`（pgTAP・`no_plan()`）と `00_structure_test.sql`（両リスト＋2）。

## 起動費の天井を上げた理由

`js/usage-counts.js` と宣言 `supabase/functions/usage-count/shape.js` は起動時に読まれる（表示と入口は起動の瞬間に数えるので、遅延読み込みにすると最初の 1 件を数え損なう）。この 2 本の分だけ eager.modules が 292→294 になり、gzip はこの変更の寄与として +2.3 kB（import 1 行を外したビルドとの差）。`node scripts/perf-budget.mjs --update` で超えた行だけを上げた。gzip と brotli の天井にはこの変更の分に加えてこのマシンと CI の計測差が乗っている可能性がある——天井は main の実測で bot が下げるので、過大な分はそこで戻る。
