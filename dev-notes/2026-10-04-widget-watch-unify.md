---
title: ウィジェット板の旧「地域監視」を「見守る場所」へ一本化し、「国のウォッチ」の見出しを綴りではなく地点で国に結ぶ
date: 2026-10-04
newsen: The widget board's monitors card is now Watched places, place alerts use the same test as your watches, and Country watch lists only that country's headlines.
newsjp: ウィジェットの「地域監視」カードが「見守る場所」になり、保存地点の警報は見守りと同じ判定に、国のウォッチはその国の見出しだけを出すようになりました。
---

〈依頼〉 撤去済みの地域監視（§18.2）がウィジェット板にだけ残っていたのを「見守る場所」（§18.1）へ統合する。
あわせて「国のウォッチ」の国別ニュースの誤答を、評価して再現してから直す。DB の表・Edge Function・cron は消さない。

## 1. 板に残っていた旧「地域監視」——3 つの入口が 1 つの撤去済み機能を指していた

- **何が**: カード `intmap.monitors` が `window.IntMapMonitors._list()` を読み、「監視を開く」は
  `runCommand('tab.monitors')`——未登録（`js/session-tabs.js`）なので必ず toast「監視はサイドバーにあります」に落ちる。
  サイドバーに監視は無い。保存地点の警報カードの「地点を監視」も同じ扉。`WC.savedPlaces()` は監視地域を
  「監視している地点」として混ぜ、Smart Stack は「地域を監視中」でカードを前に出していた。
- **どう直したか**: カードを「見守る場所」（`intmap.watched-places`）に作り替え、旧 ID は `legacyIds` に置いた——
  保存された板は `WC.resolveId` で同じ位置にこのカードを得る（移行コードは要らない）。読むのは
  `js/place-watch.js` の公開関数だけ: `lastRun()` → `digestData()`（Atlas の `places.watchDigest` と同じ構造）・
  `itemLine()`・`freshCount()`・`checkNow()`・`openWatchDigest()`。板は自分で判定しない。
  モジュールはログインしている読み手にだけ、必要になったときに動的 import する（`WC.watchModule()`。
  ログイン中は auth-ui が既に読み込んでいるのでキャッシュから返る）。扉 `openMonitors` は `openWatchedPlaces` に
  なり、アカウント ▸ 見守る場所のシートを開く（未ログインならシート自身がログインを出す）。
- Smart Stack の段は「監視している地域がある」ではなく「**見守りの直近の確認に新着がある**」で前に出る。
- `WC.savedPlaces()` の「見守っている地点」は見守りの直近の確認が持つ場所（名前と点）から取る。

## 2. 保存地点の警報と見守りが同じ地点で違う警報を出しえた

- **何が**: カードは `alertsQuery({lng, lat, padDeg: radiusKm/111})`（既定 40 km の矩形）、見守りは
  `makeReaders().warning().near()`（警報レイヤー自身の点判定で、区域が地点を**含む**もの）。
- **どう直したか**: カードは見守りの `near()` をそのまま呼ぶ。判定は 1 本。半径の設定（「各地点の周辺」）は意味を
  失ったので消した——保存済みの `radiusKm` は `validateConfig` がスキーマに無い欄として落とす。
  ⚠ このため警報カードは未ログインの読み手でも `js/place-watch.js` を読み込む（カードが板にあって描かれたときだけ・
  動的 import・起動経路ではない。既定の板には入っていない）。
- **検査の再現**: 東京の地点に対し、23 区（区域が含む）・伊豆諸島（都の箱は含むが区域は含まない）・神奈川東部
  （0.2° 南。旧カードの矩形には入る）の 3 件——旧規則は 3 件、カードと見守りはどちらも 23 区の 1 件。

## 3. 「国のウォッチ」——3 つの欠陥が重なっていた（全部評価して再現した）

1. **見出し**: `String(p.mapped).toUpperCase().indexOf(cc)`。`mapped` は国コードではなくピンの種類
   （`'true'`＝主題に置いた・`'none'`＝擬似座標。`js/news-feed.js`）。実測（このファイルを読み込み、
   東京・パリ・ニューヨークの見出しで描画）: **TR と RU に東京とパリが並び、NO に「場所不明」の見出し、
   JP・FR・US は 0 件**。依頼の見立て（LI・IS）は外れで、当たるのは TRUE と NONE の部分文字列（TR・RU・UE・NO・ON・NE）。
   ⇒ ピンの地点（散らす前の `__oc`）が国の輪郭に入るかを `js/news-intel-core.js` `makeCountryIndex`（10 m）に訊く
   ——国日報とストーリーが使う判定。輪郭はブートの窓口 `IntMapNewsIntel.outlines('10m')` から（news-story.js と同じ）。
   `mapped:'none'` は数えない。輪郭が届くまで見出し数は「…」（0 とは言わない）。
2. **警報**: `alertsQuery({iso: row.iso3 || cc})`。国の行に `iso3` という欄は無く（鍵は alpha-3 の `code`）、
   設定は alpha-2 なので、警報の記録（alpha-3）に一度も当たらなかった。⇒ 行の `code` で訊く。
3. **選んだ国が保たれない**: 国の選択肢は行の alpha-3（`JPN`）を値にしていたが、`country` 型の検証は alpha-2 だけを
   通す——実測 `validateConfig({cc:'JPN'})` → `'US'`。しかも行は alpha-3 が鍵なので既定の `'US'` も行に当たらず、
   名前・人口も出なかった。⇒ 選択肢を alpha-2 にした（`countryOptions()`）。国の行は `countryRow()` が alpha-2 と
   alpha-3 のどちらからも引く。同じ選択肢を持つ「国」「次の祝日」のカードも同じ一覧にした（祝日の API は alpha-2 で
   訊くので、alpha-3 を通す検証にすると祝日カードが壊れる——検証のほうを広げなかった理由）。「国」カードの
   「この国をウォッチ」も alpha-2 を渡す。

## 3b. ギャラリーのプレビューは何も取りに行かない

プレビュー（`js/widget-gallery.js`）は通信しない約束なので、プレビューの文脈に `preview: true` を足し、3 枚のカードは
プレビューでは見守りの確認・輪郭の取得・モジュールの読み込みを始めない（既に手元にあるものだけで描く）。

## 4. 撤去しなかったもの

`js/monitors.js` と `js/app-body.js` の `window.IntMapMonitors=monitors(IM_HOST)` は残した。板以外に読み手が居る:
`js/atlas-state.js`（Atlas の状態提供 `monitors`）・`js/news-ui.js`（`mode==='monitors'` の描画）・
`tests/monitors.spec.js`・`tests/prod-smoke.spec.js`・`tests/r163.spec.js`。`CONSTITUTION.md` §0-3 はこの基盤を名指しで
「提案 → 確認」の対象にしているので、撤去は提案に回す。

## 5. 数の床を下げた理由

- `tests/i18n-coverage-floor.json`: de/es/ru の位置引数 7656 → 7642、fr/ko の表 6114 → 6102、zh/zh-hans 6321 → 6309。
  消えたのは訳ではなく**文そのもの**（「地域監視」カードの 10 語・「監視はサイドバーにあります」・「各地点の周辺」・
  「地点を監視」・旧い説明文）。fr/ko/zh の表に残った 8 キーは `scripts/i18n-dead-key-codemod.mjs --write` で外した。
  新しい文は en + jp（`CONSTITUTION.md` §7）。
- `tests/global-surface-baseline.json`: `IntMapMonitors` 7 → 2（板からの読みが消えた）、`IntMapNewsIntel` 17 → 18
  （国のウォッチが輪郭の窓口を読む。news-story.js と同じ理由で、`js/ne-countries.js` を import せず窓口を通す）。

## 検査

`tests/widget-watch-unify-checks.test.mjs`（5 本・ネットワーク無し）。既存の `shell-widgets-checks`・
`widget-board-checks`・`watch-places-checks` は弱めていない（Smart Stack の代役の ID だけ新しい名前にした）。
