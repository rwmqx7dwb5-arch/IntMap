---
title: nightly の deep tier で 2 晩続けて赤かった 5 spec——4 件は製品が意図して変わったあとの陳腐化、1 件は綴りの写しが外れて検査が空振りしていた
date: 2026-10-04
---

〈依頼〉 nightly の deep tier（2026-10-03 run 37150910390・main cb3a3918）で 2 晩続けて赤かった spec を、
検査を弱めずに根本から直す。spec の数も待ち時間も増やさない（テスト時間の予算は余白がほぼ 0）。

先に全部を手元で再現した（`IM_TIER=all npx playwright test <file> --workers=1`）。CI と同じ 5 件が
同じ値で落ちた。直したあと同じ方法で単独実行して全部緑。
⚠ `tests/r753-account-menu.spec.js`（アカウントボタン 34 px → 44 px）は別の作業（wave2-prod-fixes）が
扱うので、ここからは外した。

## 1. `tests/cesium-koppen-and-boot-probe-cesium.spec.js` — spec の陳腐化（製品は壊れていない）

- **何が**: `lyr-climate` の imagery を 90 秒待っても ready にならない。
- **なぜ**: spec は「Köppen は既定でオン」を前提に、起動後に待つだけだった。basic-display-not-layers（#900、
  2026-10-02「どちらも規定レイヤーは削除」）で、初めて開いた読者には**どのレイヤーも点かない**ようになったので、
  誰も点けていないレイヤーを待っていた。検証役の見立て（#903/#905 の geo-engine の退行）は誤り。
- **どう直したか**: 起動後に読者と同じやり方で `#dl-climate` にチェックを入れる。描画の主張（サハラが BWh の赤・
  Mercator で塗られる・隠すと消える・`updateImage` のあとも塗られている）は 1 つも変えていない。
- **実測**: 直したあと緑。Cesium で Köppen は実際に塗られていて、製品の退行ではないことを確かめた。

## 2. `tests/layer-manifest.spec.js` ⑥ — 意図した変更（#902）。生成器で撮り直した

- **何が**: dl-radar の凡例 HTML がスナップショットと違う。
- **なぜ**: #902 でアイコンが絵文字・グリフから `js/icons.js` の SVG に移った。
- **どう直したか**: スナップショットの生成器（`IM_LAYER_PACKAGES_CAPTURE=<file>`、spec 自身が持つ）で、
  チェックアウトの外に撮って中身を比べた。cb3a3918 で撮った結果と古い fixture の違いは**ちょうど 6 か所**で、
  dl-radar と dl-thermal の凡例 HTML（それぞれ on・opacity・off の 3 段）だけだった。⏮ ◀ ▶ ▶ ⏭ と、
  「いつ」の行の 🕒 が `<svg class="im-icon">` に変わっている。レイヤー・ソース・paint・layout・タイル・
  重なりの位置は**バイト単位で同じ**だった。なので撮ったものを fixture にした。
  dl-thermal の違いは CI では見えていなかった（dl-radar で先に止まるので）。
- **実測**: 緑。

## 3. `tests/r168.spec.js` #8 と `tests/r410-late.spec.js` ② — 綴りの写しが外れていた（同じ原因）

- **何が**: r168 は 2 か国の代役を期待したのに、本物の 258 か国を読んだ。r410-late は保留したはずの route に
  1 件も来なかった（`delayed` 0）。
- **なぜ**: どちらの spec も jsDelivr の URL を正規表現に写していた（`natural-earth-vector.*admin_0_countries\.geojson`・
  `ne_\d+m_admin_0_countries\.geojson`）。mobile-performance（#903）でファイルがこのサイトの
  `data/ne-countries/ne_<scale>_admin_0_countries.json.gz`（差分符号化・gzip・データの入口が展開）に移ってから、
  どちらの route も何にも当たらなくなった。**検査は緑のつもりで何も測っていなかった。**
- **どう直したか**: `tests/helpers/ne-countries-route.js` を足した。パスは `NE_SCALES` と `neCountriesPath()`、
  代役の中身は `encodeNECountries()` を gzip したもの。どれも**ページ自身が読み込むモジュール**
  （`js/ne-countries.js`）から取る。次にファイルが動いても、helper は同じものを追いかける。
  r410-late は中身を差し替えずに保留だけする（主張を変えないため）。
- **主張が新しい経路でも成り立つか**: 成り立つ。r168 #8: 代役の 2 か国が `countryGeo` に届き、checkbox を外して
  付け直すとソースが戻る（closure への書き込みが届いている）。r410-late ②: 属性ファイルを 1916 年の国境より後に
  届けても、地図の国名は一覧（German Empire ほか・Russian Empire）に追いつく。製品は直していない。
- **実測**: 両方とも緑。

## 4. `tests/r353-live.spec.js` ① — 製品に新しい正当な状態が増えていた（volcano-feed-weekly）

- **何が**: `weekly never settled: unavailable`。
- **なぜ**: dev-notes/2026-10-03-volcano-feed-weekly.md で、週報の中継は「発行元に拒否された」を
  `unavailable` として述べるようになった。`curl` で中継を直接叩くと、今も
  `{"rows":[],"unavailable":{"reason":"upstream_http_403","status":403,…}}` が返る。spec は確定した状態を
  `['ok','failed']` と自分で並べていた。
- **どう直したか**: 
  - 製品（`js/volcano-intel.js` の `feeds()`）: 各フィードに `settled`（確定したか）と、拒否されたときの記録
    `unavailable` を足した。確定した状態の一覧は、状態を書く `mark()` のすぐ下に 1 か所だけ置く。
    「どの状態が確定か」の答えは、spec ではなく製品が返す。
  - spec: `feeds[k].settled` を確かめる。週報は `ok`（件数 > 0）か `unavailable`（HTTP 状態 ≥ 400 と確認時刻を
    持つ）のどちらかでよい。`failed`（中継自身が応答しない＝こちらの失敗）は、これまでどおり赤になる。
  - フィード名の一覧は書いたまま残した。`tests/hazard-volcano-checks.test.mjs` の #R432 ⑤ が、モジュールから
    フィード名を導き出してこのループの綴りと照合しているため。
- ⚠ 最初は `mark()` に状態の定数表を使わせて 1 か所にまとめたが、`tests/volcano-feed-weekly-checks.test.mjs` ④ が
  `state='unavailable'` という綴りを読む検査で、それが赤くなった。そのファイルは今回の担当外なので、
  綴りは元に戻した（同じ形の検査があることを報告に書いた）。
- **実測**: 3 本とも緑（`weekly` は `unavailable` の側を通った）。`npm run check:perf` も予算内。

## 散発の台帳にあるもの（同じ run の r341・r410 ①・r384・r424）

どれも再試行で緑になった。`natural-earth-vector`・`admin_0_countries` の綴りを tests/ 全体で探したところ、
写していたのは上の 2 本だけだった。この 4 本は ne-countries の経路移動とは原因が別。
r410 ① は、共有している page で描かれた名前が日本語（「ドイツ帝国」）だった。前の test の言語が残っていた形に
見えるが、確かめてはいない。ここでは直していない。
