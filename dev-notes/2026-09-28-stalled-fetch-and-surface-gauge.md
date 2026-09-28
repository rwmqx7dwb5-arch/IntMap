---
title: 地図の行の要求になる取得が期限を持たず、止まった相手に対して永久に「取得中」だった——雨雲レーダー・火災・海底ケーブル・出生率の取得を本文まで覆う時計で読み、秒数は proxy-fetch の host ごとの表が答え、期限切れを各枝の既存の失敗の経路へ流した／check:surface は正規表現リテラルを知らず、76 の公開名を見落としていた——字句を acorn に訊くようにした
date: 2026-09-28
---

〈依頼〉直前の作業（heal-waits-for-inflight：取得中の箱は自己修復が判定しない）で見つかった 2 つの穴。

## 1. 行の要求になる取得に期限が無かった（rvFetch と、同じ形の 3 枝）

**原因。** `js/data-layers.js` の `rvFetch` は RainViewer の索引（`weather-maps.json`）を素の `fetch` で読んで
いた。雨雲レーダーの行の要求（`toggleLayer` の `req`）はこの取得で、`layerInflight.track` に渡る。
直前の作業で「取得中の箱は判定しない」にしたので、応答しなくなったホストに対しては:

- 要求が settle しない → 箱は永久に登録に残り、整合器は二度と判定しない；
- 失敗の経路（「Live weather data unavailable」のトーストと箱を外す処理）へ届かない；
- `_rvPending` は取得中の要求を共有する器なので、以後の ON も 4 分ごとの更新も**同じ死んだ Promise**を受け取る。

同じ形——期限の無い取得が行の要求になっている——が他に 3 枝あった: **火災**（`_thermalLayersFor` の GIBS WMS
探り。`addFirmsThermal` → `req`）、**海底ケーブル**（`_cableLocal` の同一オリジン `data/subcables*.json`・`_cableNet`
の TeleGeography 直と cable-geo relay）、**合計特殊出生率**（World Bank。`withCountries` の callback が返す）。
`climate`（ケッペン）は地平線（`KOPPEN_HORIZON_MS`）で要求が settle し、`_ensureDateDomain` の GIBS capabilities は
要求の鎖に入っていない。

⚠ 登録（`layerInflight.track`）の段で一律に時計を掛ける案は採らなかった。ネットワークは止まらず、枝ごとの失敗の
経路（トースト・箱を外す）にも届かない——期限は**取得そのもの**が持つべきもの。

**直したもの。**
- **`js/fetch-deadline.js`** に `readWithin(url, ms, init, opts)` を足した（`jsonWithin` はその上に載る。時計は 1 つ）。
  状態・型・本文を返し、本文は時計の中で読む（火災の探りは ServiceException の本文を読むので JSON では足りない）。
  `opts.idle` は本文の塊が届くたびに時計を掛け直す——2.2 MB のファイルに全体の期限を掛けると回線の速さを測って
  しまうので、**無音の長さ**を測る。
- **`js/proxy-fetch.js`** に `clockFor(url, via)` を export した。`via` 'direct' は既存の host ごとの表 `directMsFor`、
  'relay' は `ownRelayUrl(url)` が指す自前 relay を梯子が走らせる時計（gdelt-relay は `OWN_RELAY_TIMEOUT_MS`、
  規則が時計を持つならそれ、他は `PROXY_TIMEOUT_MS`）。⚠ 依頼は「`DIRECT_TIMEOUT_MS` を export」だったが、
  host ごとの判断は既に `directMsFor` が 1 か所で持っていて（#R464「呼び手に持たせない」）、World Bank には 6 秒では
  足りない（下）ので、定数ではなくその判断を配った。6 秒の正本は `DIRECT_TIMEOUT_MS` の 1 行のまま。
- **World Bank の行**を `directMsFor` に足した（`WORLDBANK_DIRECT_MS = 20000`）。
- 4 枝の取得を `jsonWithin` / `readWithin` ＋ `clockFor` に替えた。期限切れはどれも拒否と同じ `catch` に落ちる。

**期限の値（観測・失効条件）。**

| 枝 | 取得 | 時計 | 観測 2026-09-28 | 失効条件 |
|---|---|---|---|---|
| radar | RainViewer 索引 | 直接 6 s（`DIRECT_TIMEOUT_MS`） | 5 回 0.97〜1.24 s・818 B | 索引が 1 KB 未満・1 秒前後でなくなったとき |
| thermal | GIBS WMS 4×4 探り | 直接 6 s | 3 回 1.19〜1.35 s・83 B PNG | GIBS が 4×4 GetMap に 1 秒前後で答えなくなったとき |
| subcables | `data/subcables.json`（2,188,692 B）・`-lp.json`（329,206 B） | 直接 6 s、**無音** | 本番から 1.06 / 1.87 s・0.71 / 0.92 s | 自前の配信が 6 秒黙ることが正常になったとき |
| subcables | TeleGeography 直・cable-geo relay | 直接 6 s／relay 8 s（`PROXY_TIMEOUT_MS`）、**無音** | （直は CORS で即拒否） | 冷えた relay の上流が 8 秒を超えるなら relay 行に時計が要る |
| tfr | World Bank `SP.DYN.TFRT.IN` | World Bank 行 20 s | 8 回 0.34〜2.99 s、初回 **8.23 s** | 冷えた応答が 6 秒を超えなくなったとき、または relay 経由にしたとき |

World Bank の 20 秒は `js/analysis-timeseries.js` が #R69 以来同じ host に手書きで与えてきた時計（アプリにあった唯一の数）。
同じ host を読む他の箇所も揃えた（§1b）。

**失敗の経路（④ で評価して確かめた）。** radar: トースト「Live weather data unavailable」・箱を外す・共有の要求が
空になり次の要求は新しく読む（6 s で settle）。thermal: 探りを諦めて今の一覧のまま層を足す（6 s）。subcables:
null → 保存した写し → TeleGeography → 5/15/45 秒の後退（#R188）→「Submarine cable data unavailable」・`imAutoOff`
（24 回の取得・145 s で settle）。tfr: 既存の「Could not load fertility data」（20 s）。
⚠ `addSubcables` の **90 秒の地平線は取得の上限ではない**——`fetchSubcables()` がデータを返してから始まる構築の
梯子の上限。取得の上限は上の時計（1 回の試行＝同一オリジン 2 本の並走・直・relay、各 1 回の無音）× 4 回＋後退 65 秒。

**検査。** `tests/stalled-fetch-and-surface-gauge-checks.test.mjs`
- ①——出荷された radar の状態・`rvFetch`・`toggleLayer` を持ち上げ、本物の `jsonWithin` / `clockFor` / `inFlight()`、
  接続して何も返さないホスト、模擬時計で評価（期限の 1 ms 前は取得中、期限で失敗の経路・登録解除・次の要求で新しい取得）。
- ④——`toggleLayer` の**全枝**（関数から読む）を、それが届くレイヤーの閉包の宣言（acorn で発見・到達可能なものだけ）
  ごと評価し、何も返さないホストと模擬時計（上限 1 時間）で**各枝の要求が終わる**ことと、4 枝の期限切れが既存の
  失敗の経路に届くことを確かめる。**4 つとも素の `fetch` に戻す変異で赤**（「NO CLOCK」と名指す）。
  閉包の外は「すぐ何も無しで答える」代役で、このファイル自身が公開する `window.*` は未公開（そうしないと
  `if (window._tfrData)` が「もう持っている」と答えて取得に届かない）。
- ⑤——`readWithin` の idle 時計: 900 ms ごとに届く 6.3 秒の本文は 1 秒の時計で切られず、3 塊で黙った本文は最後の塊の
  1 秒後に切られる。再掛けを外す変異で赤。
- ⑥——`clockFor` が World Bank に最も遅い実測（8,230 ms）を超える時計を返し、速い host の 6 秒を上げていない。
- ⑦——§1b。

## 1b. World Bank を読む他の箇所——期限の正本を 1 つに

World Bank を読む箇所を全部 `clockFor(u)` の時計に揃えた（⑦ が発見した 10 か所）。以前は素の `fetch` が 4 か所、
手書きの時計が 5 か所（20 s ×4、12 s ×1）あった。**本文の読み方は以前のまま**——以前 `r.json()` を状態に関係なく
呼んでいた箇所は `JSON.parse((await readWithin(u, clockFor(u))).text)` で同じく状態を問わず読む（`jsonWithin` は
2xx 以外を throw するので、「API は答えたが空」を負のキャッシュにする `stats-compare` / `analysis-timeseries` の
区別や、tfr の「空の表で塗る」を変えてしまう）。期限切れはどれも拒否・解析失敗と同じ `catch` に落ちる:

| 箇所 | 以前 | 期限切れ・失敗の行き先（従来どおり） |
|---|---|---|
| `js/data-layers.js` tfr | 素の `fetch` | 「Could not load fertility data」 |
| `js/app-body.js` `loadGdpPPP` の `fetchInd` | 素の `fetch` | `{}`（PPP 表は空のまま・保存しない） |
| `js/layer-packs.js` WB 系コロプレスの単年フォールバック | 素の `fetch` | 空 →「Could not load the data」 |
| `js/layer-previews.js` `_wbPump2` | 素の `fetch` | `done({})`。⚠ 待ち行列は **1 本ずつ**なので、止まった 1 本が以後の全プレビューを塞いでいた |
| `js/wb-layers.js` `wbSeries` | 素の `fetch` | `[]`。`per_page=20000`（全年×全国）の大きな本文なので**無音**を測る（`idle`） |
| `js/analysis-timeseries.js` `_tsOne` | 手書き 20 s | 次の系列 id、無ければ null（失敗はキャッシュしない） |
| `js/stats-compare.js` `_wbOne` / `_wbLatestOne` / `_wbYearOne` | 手書き 20 s ×3 | 同上（失敗は再試行可能、空の答えだけを覚える） |
| `js/time-countries.js` `fetchYear` | 手書き **12 s** | その指標は空のまま次へ。⚠ 1 回の上限が 12 → 20 秒に伸びた（7 指標を直列に読むので最悪 84 → 140 秒） |

`js/proxy-fetch.js` の `WORLDBANK_DIRECT_MS` の註も「手書きだった箇所はここから読む」に改めた。

**検査 ⑦（発見ベース）。** host の一覧は書かない——`clockFor(url)` が未知の host と違う答えを返す URL を
「自分の時計を持つ host」とする。`js/`・`src/` を全部 acorn で読み、`fetch` / `jsonWithin` / `readWithin` の
第 1 引数（文字列・テンプレート・連結の先頭、同じ関数の `const u = …` を 1 段たどる）がそういう host なら、
`fetch` は「時計なし」、`jsonWithin` / `readWithin` は第 2 引数が `clockFor(…)` でなければ「正本でない時計」と
名指す。今日の発見は 10 か所で全部緑。fixture で両方の種類を見分けること、`analysis-timeseries` を手書きの 20000 に
戻す変異で名指されることを確かめた。

## 2. check:surface は正規表現リテラルを知らなかった

**原因。** `scripts/global-surface.mjs` の `codeOnly` は文字ごとのループで、コメントと引用符は知っていたが
正規表現リテラルを知らなかった。`js/data-layers.js` の `/named '([^']+)'/` は引用符が 3 つなので、開いた
「文字列」がその後のコードへ流れ込み、そこにある `window.X =` を全部消していた。後ろのコメントに `'` を
1 つ足すと区間が反転する（依頼時の実測：`_refreshThermal` / `_setThermalOpacity` が「新しい大域名」として出た）。
同じ形は `js/app-body.js` の `/"/g`・`/'/g`・`/[&<>"']/g`、`js/weather.js` の `/"/g` にもあった。

**直したもの。** `codeOnly` を acorn の字句解析に置き換えた（`hostMembers()` が既に使っている acorn）。
`/` が正規表現か除算かは文法にしか分からないので、パーサが出すトークンのうち文字列・テンプレートの文面・
正規表現・逆引用符と、コメントを同じ位置で空白にする（行と位置は保つ——角括弧形は同じ位置から名前を読み戻す）。
module で読めなければ script で読み、それでも読めないファイルは推測せず、そのファイル名で落ちる。

**基準線に増えた公開名：76。** 修正後の計測は AST（全 `window.X = …` 代入の歩査）と完全に一致した
（増 76・減 0・合計 609 → 685）。**76 件すべてが基準線を作った #R795 の commit（`e5557bed`）の木に既に在った**
——同じ計器をその木で走らせて確かめた。#R795 以後に計器の盲点をすり抜けて足された新しい結合は **0 件**。
したがって全部を「既存の結合で、基準線が見落としていたもの」として `--update` で記録した（禁止すべき新しい
結合は無い）。

- `js/app-body.js`（51）: `INTMAP_STRIPE_URL_EN` `INTMAP_STRIPE_URL_JP` `IntMapCompanies` `IntMapOS`
  `__IM_NEWS_EVENT_MODE` `__IM_NEWS_SURFACE` `__IM_USE_SERVER_NEWS` `__countryPick` `__countryPickActive`
  `_azimuthalFromPin` `_backToStats` `_baseReassertT` `_clearCompare` `_closePinPopup` `_coClearCompare`
  `_coSfAdd` `_coSfClear` `_coSfRemove` `_coSfSetKey` `_coSfSetOp` `_coSfSetVal` `_coSfToggle` `_coShowCompare`
  `_coToggleCompare` `_companiesActive` `_companiesSearchVal` `_countriesActive` `_hideCompare` `_imFillStat`
  `_measureFromPin` `_openBlueberry` `_pinHandlersBound` `_radiusFromPin` `_removePin` `_sfAdd` `_sfClear`
  `_sfRemove` `_sfSetKey` `_sfSetOp` `_sfSetVal` `_sfToggle` `_showCompare` `_toggleCompare` `_wsCountryInfo`
  `_wsRenderCountries` `imCropImage` `renderCompanies` `setCoSort` `showCompanyDetail` `stripeDonateURL`
  `toggleCoSortDir`
- `js/atlas-console.js`（3）: `_imAtlasPaint` `_imHlPolys` `_imNoteObjects`
- `js/analysis-correlate.js`（2）: `__imAnalysisCorrelate` `_refreshResidualColors`
- `js/world-packs.js`（2）: `__wpEnergy` `__wpTrade`
- `js/weather.js`（2）: `IntMapWeather` `_ecSyncTimeLegend`
- `js/data-layers.js`（2）: `_refreshThermal` `_setThermalOpacity`
- 1 件ずつ: `IntMapAnswerAudit`（atlas-answer-audit）`IntMapAnswerRender`（atlas-answer-render）
  `IntMapAtlasAdmin1`（atlas-admin1）`IntMapAtlasCompose`（atlas-map-compose）`IntMapCorrelate`（analysis-panels）
  `IntMapDrone`（drone-nav）`IntMapElevEdit`（terrain-water）`IntMapGeoObject`（atlas-geo-object）
  `IntMapGisGeotiff`（gis-geotiff）`IntMapMoveShape`（map-tools）`IntMapOverlays`（dash-extended）
  `IntMapPopArea`（sims）`__atlAnnotateWired`（atlas-annotate）`__atlRenderWired`（atlas-reply）

⚠ 「窓口がこれだけ広い」は今日の事実で、減らすのは別の作業（どれも今回の依頼の外）。

**検査。** 同じ検査ファイルの ②——正規表現（引用符 3 つ・1 つ・両方の文字クラス・コメント開始記号・`)` の後）、
除算、文字列・コメント・正規表現の中の偽の代入を並べた fixture。出荷した `codeOnly` は正しい 7 名だけを返し、
**置き換えた旧ループ（検査の中に変異として逐語で保持）は同じ fixture で赤**。木を読む経路でも角括弧形・
テンプレート形を含めて同じ答え、読めないファイルはその名前で落ちる。③——js/・src/ の AST 歩査で見つかる
`window.X =` と登録簿が両方向に一致し、`_refreshThermal` と `_setThermalOpacity` が基準線に在る。

## 走らせた検査

- `node --test tests/stalled-fetch-and-surface-gauge-checks.test.mjs`: 9/9。
- 触ったファイルに関わる既存の node 検査 71 本（771 件。heal-waits-for-inflight・r452・r464・r515・r175・r168・
  r200・r345・r188・r190・r212・r355・own-fetch-relay ほか、World Bank・プレビュー・パック・時系列・比較・時間旅行を
  読む 51 本）: 全緑。`r190`・`r212` は `import { ownRelayUrl }` / `import { fetchViaProxy }` を**綴りで**固定して
  いたので、「その名前を proxy-fetch から import している」という性質に替えた。
- `check:surface`・`check:static`・`check:engine`・`check:types`・`check:docs`、build＋`check:perf`
  （範囲内。eager の modules 280・requests 7 は不変）。
- `IM_TIER=all` で heal-waits-for-inflight・restored-layer-before-style・legend-stack-and-held-heal・smoke・r164・r209 の
  spec: 69 passed。

## 追補: 鉄道の引き渡しの検査は、上限を回数でなく時間で切る

CI の Regression 3/3 で `tests/nightly-state-leaks-checks` ② が「never reached: the detail cells were handed over」で赤。
同じファイルを単独のパターンで走らせると緑、別の worktree でも緑——判定が走者の速さで決まっていた。
待ちの上限が「setImmediate を 400 回」という**回数**で、セルは fetch → DecompressionStream（イベントループの外）を
通って届くので、その 400 回が数ミリ秒で尽きる機械では届く前に諦めていた。上限を壁時計の 5 秒にし、
各回は `setTimeout(0)` で譲る。失敗の文面は待った時間と回数を述べる。3 回連続で緑。
