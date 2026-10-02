---
title: 基本表示はレイヤーではない——宣言の `kind: 'display'` が種類を述べ、紹介ページの数・共有リンク・利用統計・Atlas の「全レイヤーをオフ」がそこに訊く。既定で点いているレイヤーを無くす（ケッペン・海底ケーブル）。紹介ページは「174 のレイヤー」→「163 のレイヤー」
date: 2026-10-02
---

〈依頼〉 既定で点いている層について訊いたところ、利用者:「**どちらも規定レイヤーは削除。基本表示をレイヤーって言うな。**」
⑴ スマホ・デスクトップの両方で既定オンのデータレイヤーを無くす（層は消さない） ⑵ 地名・ラベル・POI・国境・行政区分・
道路・鉄道など棚 `base` の項目は「基本表示」で、構造・表記・数え方・Atlas・文書・紹介ページでレイヤーと呼ばず数えない。

## 0. 測った（26a678bd）

- 登録簿 `#layer-dropdown` の 174 行のうち、棚 `base` が 11 行（`cb-*` 9＋`dl-nightside`＋`beta-dl-bldg3d`）。
  宣言に種類の欄は無く、「基本表示か」は棚 `base` に居ることでしか分からなかった。
- 区別していた読み手: パネルの「表示中のレイヤー (N)」・`N layers on` のカード（`window.IntMapBasicLayers` を引く）。
  区別していなかった読み手: 紹介ページ（`LAYERS.length`＝174）・共有リンクの `l=`（昼夜と 3D 建物を運んでいた）・
  利用統計の `layer`・Atlas の `layersOff`（`/^(cb-borders|cb-coast|cb-names|cb-countries)$/` の手書き 4 id で
  「基本」を守り、道路・鉄道・施設名・昼夜は「レイヤー」として消していた）・初回デモの「もう点いているか」（`.lyr-row.on`
  ——昼夜の行も `.lyr-row`）。
- 既定オン: 宣言の `on` は `dl-climate`・`dl-subcables`（#R186）。昼夜は `js/night-side.js` の設定が既定オン（#R210）で、
  `IntMapBaseDisplay` の「デフォルト」も昼夜をオンにする。
- パネルの節見出しは既に「Base map & labels／基本表示」で、レイヤーとは呼んでいなかった（変えていない）。

## 1. 造形

- **宣言の欄 `kind`**（`scripts/lib/layer-descriptor.mjs`）。`'display'` が基本表示、無ければレイヤー。門は
  ⑴ `kind` の値 ⑵ 「基本表示 ⇔ 棚 `base`」を両方向 ⑶ 1 つの棚に 2 種類を混ぜること、を拒む。棚 `base` の 11 本に
  `kind: 'display'` を書いた。生成器の報告は「163 layers + 11 map display items」。
- **manifest** に `isDisplay(id)`・`dataLayers()`・`displayItems()`・`sharedDisplayIds()`。`sharedIds()` はレイヤーだけ。
  `basicLayers()` は `kind` から導く。`catalog()` は各行の `kind` を述べる。`LAYERS`／`isLayer` は「登録簿の行」の
  ままにした——時間の宣言（`js/layer-time-decl.js` は基本表示にも時間を述べる）・行の生成・棚の振り分けは両方を扱う。
- **共有リンク**: `js/map-state.js` の SCHEMA に `display`（`d=`、`l=` の直後・同じ瞬間 700/1800/3200 ms）。
  ⚠ 古いリンクは昼夜・3D 建物を `l=` で運び、黙っていることが「オフ」だった。コーデックは何も import しないので
  基本表示の id を見分けられない——`d=` が無ければ `display` は **null** を返し、`js/map-ui.js` の持ち主が復元の状態
  （`ctx.state.layers`）から基本表示だけを取る。レイヤーの持ち主は `l=` から基本表示を外す。null にしたのは
  `l=` の写しにすると `encode(decode(link))` が `d=` を足して元のリンクに戻らないから（最初の版でそうなり、
  map-state-store の往復の検査が捕まえた）。
- **利用統計**: `layer` は基本表示を送らない（`isDisplay`）。
- **Atlas**: `layersOff` は基本表示を残す（`all:true` で基本表示も消す）。手書きの 4 id を `isDisplay` に置き換え、
  返答は「レイヤー n 件」と「基本表示 m 件」を分けて数える。doc の 1 文も同じことを言う。
- **基本表示の一覧の API**: `window.IntMapBaseDisplay.items()`——id・行が今名乗る名前・オン・既定。携帯の「地図」
  メニュー（別作業 mobile-shell）が描くための面。新しい window 名は作っていない。`js/data-layers.js` の行数は 5,246 のまま。
- **初回デモ**の「既にレイヤーが点いているか」は manifest に訊く（昼夜の行を数えない）。
- **紹介ページ**: `scripts/landing.mjs` の `layers` は `dataLayers().length`——**163**。

## 2. 既定

`dl-climate`・`dl-subcables` の `on` を外した（理由を宣言に書いた）。`window.IntMapDefaultLayers` は空になり、
起動時の dispatch・行の `checked`・セッションの off-sweep・`imAutoOff` はどれも同じ一覧を読むので追加の変更は要らない。
見本（`js/showcase.js`）と授業ツアー（`js/tours.js`）のリンクは既定を前提にしていない（どれも `l=` を明示）。
初回デモは Settings から `force` で走るだけで、終わると見せた 4 層を全部消す。

⚠ **昼夜（`dl-nightside`）は既定オンのまま。** 依頼文の ⑴ は昼夜を「既定で点いているデータレイヤー」に挙げ、⑵ は
棚 `base`（昼夜を含む——#R233 が利用者の指示で基本表示へ移し、Atlas の `baseDisplay` の doc も基本表示の行に数える）を
基本表示とした。2 つは昼夜について食い違うので、ここでは基本表示として扱い、既定は動かしていない。オフにするなら
既定を持つのは `js/night-side.js`（「鍵が無ければオン」・#R210）と Settings の初期値で、今回の範囲の外——利用者への確認待ち。

## 3. 残したこと

- 保存済みのセッションは、点いていたケッペン・海底ケーブルをそのまま復元する（読者のセッションとして扱う）。
  既定から来たものだけ外すには `js/session-tabs.js` の `defv` の世代を上げる移行が要る——範囲外。
- `cb-countries`（国境・国情報、棚 `hidden`）はレイヤーのまま（#R469 で「表示中のレイヤー」が唯一の消す手段とされた）。
  そのため Atlas の `layersOff` は今回からこれも消す（以前は手書きの 4 id で残していた）。
- 9 言語の節見出しは変えていない（en は「Base map & labels」で、レイヤーと呼んでいない）。Atlas の返答に足した 1 文は en+jp。

## 4. 検査

`tests/basic-display-not-layers-checks.test.mjs`（①〜⑤: 種類の事実・門の拒否・紹介ページの数・共有リンクの新旧と往復・
Atlas の `layersOff` を評価）。`tests/layer-descriptor-checks.test.mjs` ① は写真を「この作業の意図した差分」で書き換えた
うえで比べる（それ以外が 1 バイトも動いていないことを示し続ける）。既定オンを主張していた検査（#R186・#R187・#R188・#R355）は
新しい決定に合わせた——リトライ・キャッシュ・不透明度の主張はそのまま。

ブラウザ側:
- `tests/r186.spec.js` の初回訪問は「レイヤーが 1 つも点いていない（ケッペン・海底ケーブルも描かれない）」を測る。
- `tests/r355-cables.spec.js` は初回訪問の既定に頼れなくなったので、ケーブルを名指す共有リンクで開く。⚠ 実測で 2 つ踏んだ:
  ⑴ 層が起動途中の復元で入るので、`waitForCables` の直後は描画前（同じページが描き終えると 869 本）——最初の描画を待つ
  ⑵ 復元の後半（1.8 s・3.2 s）がリンクの層を再びチェックするので、② がチェックを外すと戻される——復元が落ち着いてから始める。
- `tests/landing-showcase.spec.js` は全ての見本（`d=` 以前のリンク）について、共有し返したリンクに `d=` が無い（＝基本表示は
  オフで開いた）ことを足した。⚠ 新しい spec を 1 本足したら全体の予算（87.5 分）を 0.1 分超えた（実測 8 s／2 起動）ので、
  既存の起動の上に載せる形にした。「古いリンクの `l=dl-nightside` で昼夜が点き、共有し返すと `d=` に出る」は、外す前の
  その spec で確かめた（同じ `dist/` で `#v=…&l=dl-nightside,dl-tz` を開き、`IntMapBookmark.link()` が `l=dl-tz` と
  `d=dl-nightside` を持つ——緑）。この形は node の検査 ④（コーデックと持ち主の分岐）が引き続き持つ。
- 同じ実行で `tests/smoke.spec.js` の time-compare-lapse ① が 1 回 30 s で落ち、単独では緑（2 workers の負荷。比較窓と
  歴史国境の主題で、この作業は触っていない）。

## 保存済みのセッションの移行（統合時に追加）

以前の版で既定オンだった Köppen と海底ケーブルは、読者のセッションに「既定が入れたもの」として保存されている。`js/session-tabs.js` の世代印を 190 → 191 に上げ、191 より古いセッションからこの 2 本を 1 回だけ外す（次の保存から、残っていればそれは読者自身の選択）。テストの種（playwright.config.js・tests/helpers/session-seed.js ほか）と、世代を照合する検査も 191 に揃えた。
