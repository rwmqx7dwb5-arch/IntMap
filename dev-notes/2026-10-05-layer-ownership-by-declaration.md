---
title: 歴史地図の国境が別のレイヤーの箱に「持ち物」として学ばれ、その箱を外すと隠されていた——箱がどの層を持つかを、同じ数秒に現れたことではなく、その箱自身の OFF が隠した書き込みから決める
date: 2026-10-05
newsen: Turning off a layer no longer hides the historical borders or other map layers that happened to appear at the same moment — for example, the 1890 borders stay on the map after you switch off Historical city populations.
newsjp: レイヤーをオフにしたとき、たまたま同じ時に現れた歴史上の国境などの別の層まで隠れてしまうことがなくなりました。たとえば「歴史上の都市人口」をオフにしても 1890 年の国境は地図に残ります。
---

〈依頼〉 本番検証（2026-10-05、build 076f908）で、歴史地図の国境・区分の線（imtb-* / imta-*）が別のレイヤーの
チェックボックスに自動で紐付けられた。地図ペインが非表示（innerWidth 0）のまま「歴史上の都市人口」をオンにすると、
自動のレイヤー追跡がそれらをその箱に割り当て、箱がオフになると国境が表示されるたびに隠され、1890 年の地図に
国境が出なくなった。新しく読み込んだ状態では同じ層が「State / province borders」に割り当てられている。
再現し、対応の決まり方を根本から直す（場当たりの除外リストではなく）。

## 0. 測った

- **仕組み**: `js/data-layers.js` の #R81 の学習器は、箱が ON になった瞬間のスタイルの層一覧と、0.5 / 1.8 / 4 秒後の
  一覧の差を取り、**その間に現れた層を全部その箱の持ち物にしていた**——誰が足したかは問わない。守りは手で並べた
  接頭辞の除外パターン `SKIP`（`ofm-|country-|…|imcmp-|imrad-|…`）だけで、**imtb- も imta- も載っていなかった**。
  学んだ持ち物は #R154 以降、箱が OFF の間に描かれていれば監査が隠す（`hide-learned`）。
- **再現（ローカル Playwright、修正前のビルド）**: 箱を ON にして 200 ms 後に時計を 1890 年へ動かすと、
  `dl-histurban` は `imta-line, imta-vt-line, imta-gap-line, imta-lbl` と自分の `imhu-*` を学び、外すと監査ログに
  `hide-learned` が出た。本番のペイン非表示はこの窓をもっと広げる——描けない間は箱の change が保留され
  （`IntMapLayerHold`）、描けるようになった瞬間に保留した ON と、時計の層の追加が同じ数秒に起きる。
- **同じ仕組みの別の被害**: 何も触らない起動直後に、**「鉄道」（`cb-rail2`）が首都（`layer-world-cap`）と夜側
  （`im-night-lights-lyr`・`im-night-shade`）を持っていた**。鉄道を外すと首都と夜側が隠される状態だった。
- **規模**: 起動時、表（`STATIC` / `BASE` / `_imAuditReg`）で名指されている箱は 177 箱中 31 箱で、**146 箱が
  この学習に頼っていた**。学習をやめると 146 箱の自己修復が消えるので、やめるのではなく「何を証拠にするか」を直す。
- **「State / province borders」側について**: `cb-admin1` が `imta-line` / `imta2-line` / `imta3-line` を持つのは
  学習ではなく `BASE` の**宣言**である（#R530/#R564: 州の行は今の州境と時代の州境の両方を 1 つのスイッチで出し入れ
  する。外せば時代の州境も消えるのは仕様）。宣言のある箱では学習は読まれない（`idsFor` が先）。修正後の 1890 年の
  実測で `cb-admin1` の持ち物は宣言の 5 層だけで、imtb-* は含まない。

## 1. 直したもの——持ち物は因果で決める

- **エンジンの窓口に `GE().layers.onVisibility(fn)` を足した**（`js/geo-engine.js`・`types/geo-engine.d.ts`）。
  add / remove / setVisible / setLayout('visibility') の**各書き込みの中で同期的に** `fn(id, shown, was)` を呼ぶ。
  `was` は書き込みの直前に描かれていたか（購読者がいるときだけ訊く）。
- **学習器を置き換え、`js/layer-rows.js` の `ownershipLearner(store)` に出した**（`js/data-layers.js` は行数の台帳が
  減る一方なので、配線の 4 行だけを残した——台帳は 5,246 → 5,227 行。⚠ 最初は独立の `js/layer-ownership.js` にしたが、
  CI の `check:perf` が「起動時に読むモジュール 314 → 315」で落とした。行の change の配送を既に扱う `layer-rows.js` に
  置けば、起動の費用は増えない）。箱の `change` を window の capture で受けて「配送中の事象」の
  スタックに積み、書き込みは **`eventPhase !== 0`（DOM が言う「この配送はまだ返っていない」）の最も内側の箱**に
  帰属する。時計の移動・描けるようになった瞬間・fetch の着地・Atlas の描画は、その同期配送の中では走れないので、
  **層の名前が何であれ箱に帰属しない**——除外パターン `SKIP` と「別の箱が動いたら捨てる」`_seq` は要らなくなり、消した。
- **学ぶのは OFF の側の「描かれていた層を隠した書き込み」だけ。** 「自分が外れたらこれも外れる」は監査の隠す枝が
  言い直す文そのものである（ON の非同期処理が OFF の後に着いた場合、#R36）。ON 側は学ばない——共有の処理が箱の
  持ち物でない層を出すから（`_applyBorders` は時計が旅していれば時代の国境を出す）。`was` を見るのも同じ理由で、
  修正の途中の実測では地名の箱の OFF が共有の処理を呼び、**すでに隠れていた** `ofm-country` や `imta-line` を
  もう一度 none にしていた。それは何も変えていないので数えない。
- **表が別の箱に与えた層は、この箱のものにならない**（`owned()` の `declaredElsewhere`）。宣言は観測に優先する。
- **表は 1 か所から読む**（`TABLES()`。`idsFor` と `declaredElsewhere` が同じものを引く）——`check:surface` が
  `window._imAuditReg` の読みが 1 件増えたのを捕まえた。`window._imLayerOwn` の読みは 15 → 7 に減った（基準を下げた）。
- **読み手は全部 `owned()` / `learned()` を通る**ようにした（監査・`toggleLook`・`IntMapLayerAudit.owned`・
  `__imLayerPainted`）。以前は 3 か所が `_imLayerOwn` を直に読んでいた。
- ⚠ **失ったもの**: 箱は最初の OFF で学ぶので、宣言の無い箱は最初の ON の間は持ち物が無い——`check()` は null
  （「表が無い」）を返し、起動画面と Atlas の健康診断はそれを「判定するものが無い」と読む（既存の扱い）。以前の
  学習が最初の ON でくれた答えは、上の測定のとおり誰が足したか分からない層を含んでいたので、正しい答えではなかった。

## 2. 修正後に全箱で測った（ローカル Playwright・3 並列・表の無い 146 箱を 1 箱ずつ ON 3 秒 → OFF）

- **起動時の持ち物: 0 箱**（修正前は鉄道が首都と夜側を持っていた）。
- 1 箱以上の層を足した 72 箱のうち **68 箱が自分の OFF から自分の層を学んだ**（例 `wp-dl-tides` は潮汐の 5 層、
  `dl-ww2` は `ww2-fill`）。
- **9 箱は、ON の 3 秒の間に他人の層が描かれていた**——`dl-tz`・`bx-wbwomparl` の間に時代の国境 `imtb-*`、
  `dl-ww2`・`dl-vietnam`・`dl-yugoslavia` の間に時代の州境 `imta-*`（これらの行は時計を動かす）、`dl-nato`・
  `beta-dl-ukrfront` の間に `imta-know-*`、`dl-wind`・`dl-ec-temp` の間に海岸線。**旧い学習器ならどれもその箱の
  持ち物にしていた。** 新しい学習器はどれも学ばず、それらは箱の OFF の後も描かれたまま（＝持ち主のもの）だった。
- ⚠ **学べなかった 1 箱**: `beta-dl-volcso2` は層を 1 つ足し、OFF で消えたが、学習は空。行の切り替えが遅延読み込みの
  モジュール（`volcanoLayers`）を待つので、隠す書き込みが同期配送の外で起きる。測定は合成した change だったので、
  利用者の本物のクリック（各リスナーの後にマイクロタスクが走る）では帰属することもありうるが、測っていない。
  この箱は宣言（`_registerLayerOpacity` の `cbId`）を持てば監査に戻る。

## 3. 検査

- `tests/hist-urban-population.spec.js` に 1 件足した（新しい spec を 1 本足すと全体の所要時間が天井 87.5 分を
  0.7 分超えた——`check:testbudget`。同じ行を測る既存の spec の共有ページに載せた）。1890 年の地図で行を ON にし、
  200 ms 後に**別の者がエンジン経由で新しい層を 1 つ足す** → 外す → 監査。行の持ち物が自分の OFF が外した
  `imhu-labels` / `imhu-circles` とちょうど等しく、別の者の層を**どの箱も**持たず、監査の後も別の者の層と時代の国境が
  描かれたまま、`hide-learned` が出ない。
  ⚠ **最初の版は修正前のコードでも報告の主張の部分が通っていた**（修正前のビルドで走らせて分かった）。共有ページでは
  前のテストが時代の層をもう作っているので時計を動かしても新しい層が足されず、しかも時計の移動が時間連動の行を
  切り替えるので、旧学習器は窓を「曖昧」として捨てていた。そこで時計は先に動かし、窓の中では別の者が層を足す。
  組み替えた版は修正前のビルドで**主張そのもので落ちる**: 行の持ち物が `ownership-probe-line, imhu-labels,
  imhu-circles, imta-know-fill, imta-know-lbl`——別の者の層と、時代の知識の層まで持っていた。修正後は 3 件とも緑。
- `tests/layer-ownership-by-declaration-checks.test.mjs`: 学習器を評価する 4 件（自分の OFF が外した層は自分のもの／
  配送の外の書き込みと、何も書かない OFF の直後の書き込みは誰のものでもない＝報告の欠陥／ON 側と、すでに隠れていた層の
  再非表示は何も述べない／入れ子の配送では最も内側へ）。⚠ Node の `EventTarget` は配送中の 2 つ目のリスナーで
  `eventPhase` を 0 にする（実測・Node 24。DOM の仕様では配送が返るまで非 0）ので、仕様どおりに動く小さな配送器で検査する。
- `npm run check:engine`・`check:types`・`tests/panel-rows-checks.test.mjs`（#R154 の隠す枝の性質）は緑。
