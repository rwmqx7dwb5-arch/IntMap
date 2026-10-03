---
title: 全レイヤーの共有リンクをスタイル保留のまま開く deep の spec が 4 晩赤——遅いだけの層と、記録なしに消えるタイムゾーンの行が混ざっていた。行は取得を期限つきの共有の読み手にして失敗を行の状態に残し、spec は 60 秒の待ちをやめて「各層に製品が答えたか」を待つ
date: 2026-10-03
---

〈依頼〉`tests/restored-layer-before-style.spec.js:134`「every layer a link can carry」が nightly（deep tier）で 4 晩連続赤
（2026-09-28 から。不足は 9/28 `lyr-radar` → 9/30 `wp-alert-hatch/choro/hatch-cut` → 10/1 41 層）。
退行か時間切れかを判別し、根本原因で直す。上限を伸ばして塞がない・層名の特例を足さない。

## 0. 判別——どちらも在った

再現条件は前回（`dev-notes/2026-10-01-restored-layers-under-load.md` §3）と同じ: 全体を 4 コアに固定（PowerShell で
自プロセスの `ProcessorAffinity=0xF`。`start /affinity` はこの環境で「アクセスが拒否されました」）、ローカルのビルド
（`IM_PREBUILT_DIST=1`）、`tests/r170.spec.js` を同時に。単独・22 コアでは緑（1 回）、CDP 4 倍減速でも緑（1 回）。

計器は spec に一時的に入れたもの（出荷物に残していない）: 解放後 15 秒ごとに不足を列挙し、不足層の持ち主の箱の
`checked`・`IntMapLayerState`・時間の保留、`dl-tz` の `checked` setter と `change` の呼び出し元、TZ の fetch の結果を記録。

- **遅いだけの層**（大半）: 4 回の再現で、解放後 t+36 s に 50 層不足 → t+75 s に 6 層。警報・潮汐・貿易・電力・
  鉄道・火山・データセンター・ネット観測・放射線の層は**全部あとから来た**。CI 10/1 の 41 層はこの顔ぶれと一致する
  ＝60 秒の poll が来る途中で切れていた。
- **永久に来ない層: タイムゾーン（`tzl-*`）**。3 回中 3 回、t+415 s でも不足。箱は `checked:false`、行の記録なし。
  追跡の結果: 復元の `change`（32 s）→ `fetch(TZURL)` 開始 → **158 s に `TypeError: Failed to fetch`**（126 秒）→
  catch が `cb.checked=false` を書いて終わり。読み取りは期限なし・`layerInflight` に渡されず、失敗はトースト 4 秒だけ。
  ⇒ 利用者が外した箱と見分けがつかず、Atlas も読めない。製品の欠陥（`.agents/rules/one-pass-or-a-reason.md` §2 ②
  「結果が持ち帰られなかった」）。同じ URL は jsDelivr の `@master`（実ネット）で、通常側は 29 秒で取れた回もある。
- **永久に来ないように見えた別の 1 件は spec の読み違い**: `country-fill — cb-countries`。`cb-countries` はリンクが
  運ばない隠し箱で両方の起動で OFF。`country-fill` は全ての塗り分けが足す `countries` source と一緒に作られ、
  持ち主の表が OFF の箱を持ち主にしていた。
- ⚠ 否定した見立て: 「#903 の国データ移設（`data/ne-countries/`）で国の source が永久に来ない」——1 回目の再現で
  23 層（国の塗り分け系）が 172 s 不足したが、以後の 4 回では全部 47〜91 s で来た。止まった経路は見つからなかった。
- ⚠ 否定した見立て: `layer-world-cap`（極冠）が欠ける——不足に出た回も `IntMapWorldBase.state()` は ready、
  `world-cap-src` と `layer-polar-cap` は在った。不足に出ない回もあり、来る途中だった。
- ⚠ spec 自身の負荷: 毎 2 秒の `getStyle()` は全 GeoJSON source のデータを複製する。全レイヤーのページで
  1 回の評価が 12〜22 秒返らず、待ちの方が切れた（2 回）。

## 1. 直したこと

### 1.1 タイムゾーンの行（`js/layer-packs.js`）

- 読み取りを `jsonWithin(TZURL, clockFor(TZURL), …, {idle:true})`（共有の読み手。期限は沈黙を測り 5 MB の長さを
  測らない）にし、行と `IntMapTimeZones.ensure()` で**1 本を共有**（前は同じ URL を別々に fetch していた）。
- 読み取りを `layerInflight.track('dl-tz', …)` に渡す——走っている間は「答えを取りに行っている」と読める。
- 失敗は箱を外す**前に** `layerState.report('dl-tz', err, {told:true})`——行に「読み込めません」（期限切れなら
  「応答なし」）、Atlas も `layerStates` で読む。読み終わる前に利用者が外した箱には何も言わない。
- 描画の待ちを「150 ms × 60 回、尽きたら MapLibre の `idle`」から `GE().whenCanDraw()` に（忙しいページは `idle` に
  届かない。前回 §2.4 と同じ形の 5 つ目）。

### 1.2 ページの扉（`js/layer-rows.js`）

`window.IntMapLayerHold` に `inflight()`（`layerInflight.pending()`）を足した。`pending()` と合わせて「全部の変更に
答えたか」の 2 つの半分を読める。

### 1.3 spec（`tests/restored-layer-before-style.spec.js`）

- 解放後の 60 秒 poll をやめ、**通常側が描いた各層に、保留側の製品が答えたか**を待つ: 地図に在る／時間で保留
  （`IntMapLayerTime.held`）／行の記録が上流の不提供を述べる（`unobserved`、または `failed` で
  `network`・`http`・`parse`・`timeout`。annotation に列挙）。ページ側の理由（`not-drawn` など）は除外しない。
- 記録なしに外れた箱は待たずに落とす（このファイルが捕まえるべき無言の喪失）。
- 持ち主の表は**通常側で ON だった箱だけ**から作る（`cb-countries` の読み違い）。
- 待ちの上限は**試験自身の残り時間**（`test.info().timeout` から経過を引いた値）。秒数を新しく選んでいない。
  `test.setTimeout(240000)` は変えていない。
- 層の一覧は `getLayersOrder()`（custom 層を除き、`getStyle().layers` と同じ集合）。
- 報告された 2 箱（航空機・レーダー）の確認も同じく状態を待つ形に。

## 2. 検査

- `tests/restored-layer-catchup-checks.test.mjs`（新規・node、6 本）: TZ の closure を `js/layer-packs.js` から
  持ち上げて実行。① 共有の読み手・idle・`layerInflight` に渡る・2 回目の要求で 2 本目を始めない ② 失敗は記録
  （`told`）してから外し、追跡中の要求は終わる ③ 先に外された箱には何もしない ④ 描けないスタイルの間に届いた
  境界は、**発火しない setTimeout** の下でも `whenCanDraw` で描かれる ⑤ 本物の `inFlight`＋`makeLayerState` で
  `failed/network`（期限切れは `unobserved`）、`ok` に上書きされない ⑥ 扉が `inflight` を出す。
  直す前の `js/layer-packs.js` で ①〜⑤ が赤。
- 関連 node 14 ファイル 207/207。Playwright: 当 spec 単独 `--repeat-each=3` 6/6 緑（4.7 分）、
  `heal-waits-for-inflight`・`legend-stack-and-held-heal`・`landing-showcase`・`r204` 9/9、`smoke` の時間帯アクセサ 1/1。
- `check:engine` `check:types` `check:testbudget` 緑。`check:static` は `fetch-deadline` の台帳だけ赤
  （`js/layer-packs.js` の期限なし fetch 9 → 7。台帳を下げる: `node scripts/fetch-deadlines.mjs --update`）。

## 3. 残るもの

- CI の形（4 コア固定・2 worker・この spec 1 本と `r170` を同時）は直した後 2 回とも緑（2.4 分・1.6 分）。
  それより重い形——同じ spec を 2 本同時（4 ページ）——では 3 回中 2 回赤で、どちらも製品の答えではなく
  **ページが `page.evaluate` に 12〜36 秒応答しなかった**（読み取り 1 回分も返らない）。全レイヤーのページの主スレッドが
  その間ずっと塞がっている。原因は未特定（前回 §4 の描画の飽和と同じものか、CPU プロファイルで見る）。上限は伸ばしていない。
- 残る期限なし・回数打ち切りの待ち: `js/beta-overlays.js`（放射線の行も失敗で箱を外す）・`js/volcano-layers.js` の
  壁時計 `setTimeout(abort)`、`js/lazy-modules.js` `lazyRowFailed`（本体が届かなかった行を記録なしに外す）。
  同じ形なので同じ直し方が効くが、今回の再現では来る途中で、欠けたままにはならなかった。
