---
title: HTML 出力の安全を「エスケープ関数の写しを数える」から「sink に流れ込む値を測る」へ——外部データの生書き込み 7 ファイル、S3 の任意バケットを 60 日キャッシュしていた Service Worker、unpkg 全体を許していた CSP
date: 2026-09-30
---

〈依頼〉 監査の実測: innerHTML/outerHTML 代入と insertAdjacentHTML が 562、式を含むもの 469、エスケープ系でない呼び出し／識別子が混じるもの 300（AST）。`check:static` §12（`scripts/safe-output.mjs`）はエンコーダの写しを形で数えるだけで、値そのものを測っていなかった。

## 0. 測った

- `scripts/output-taint.mjs` を書いて `js/` を読んだ。sink は **590**（MapLibre の `setHTML` 30 を含む。`IntMapSafe.text` の不活性文書への代入は sink ではないので除く）。最初の素朴な判定では未判定の葉が 567、判定規則を足していって 434（75 ファイル）で台帳にした。
- 規則を足すたびに「その規則が安全と言いすぎないか」を反例で確かめた: 復号器（`/&lt;/g→'<'`）は符号器と同じ文字を含む／`arguments` を転送する翻訳関数は全引数に依存する／`esc` という名の CSV 引用符付けが 1 つでも提供されていれば、受け取った `esc` は符号器ではない。どれも `tests/output-taint-gate-checks.test.mjs` ① に両方向で入れた。
- 未判定の葉を `--why`（定義まで辿って決め手の読み取りを印字）で読み、外部データ（API 応答・タイル属性・フィード）と読んで確かめたものを直した。

## 1. 直した外部データの生書き込み

- `js/map-extras.js` — OpenFreeMap/OSM の国名 `p.name`（label-isolate のチップ。今は `return;` で無効化されている経路だが、書かれている式そのものを直した）。
- `js/data-layers.js` `trafficTooltipHTML` — ADS-B の callsign / reg / icao24 / desc / acType / squawk。同じ関数の船側も name / callsign / dest 以外（MMSI・IMO・喫水）は生だった。ツールチップは別のファイルの sink に渡されるので、門では**組み立て関数の戻り値**を判定する（`functionLeaves`）。
- `js/countries-ui.js` — 国カードの名前（統計表に行が無いとき地物の NAME_EN / ADMIN / NAME）・首都・通貨・言語・隣国・時間帯、一覧の名前と首都、`title` 属性（`"` だけを置き換えていた）。
- `js/weather.js` — Open-Meteo の `model` と `precipitation`。
- `js/cameras.js` — ウェブカメラの出典行（OpenTrafficCamMap の州・機関名、511 のホスト）。
- `js/seismic.js` — 体感表の地名（GeoNames の gazetteer）。`title` は既にエスケープしていて本文だけ生だった。
- どれも既存の器具（`IntMapSafe.html`・そのファイルの `escapeHtml` / 委譲）を通しただけで、場合分けは足していない。

## 2. Service Worker

`sw.js` の DEM 規則は「ホストが 6 つのどれか ＆ パスのどこかに `/terrarium/`」だった。6 つのうち 3 つは S3 の**パス形式**エンドポイントで、最初のパス区切りがバケット名＝誰でも作れる。`https://s3.amazonaws.com/<任意>/terrarium/x.png` が初回でキャッシュされ 60 日 cache-first で返っていた。`docs/SECURITY-ARCHITECTURE.md` §8-11 は「任意のバケットは許されない」と書いていた。規則を「ホスト 1 つとパス先頭からの接頭辞 1 つの組」にした（パス形式はバケット名まで含む）。`js/` の DEM テンプレートを発見して全部許されること、別バケット・`..`・平文が拒まれることを ⑤ が関数を実行して確かめる。実 URL（パス形式と dualstack 仮想ホスト）は curl で 200 image/png を確認。`tests/security-logic.test.mjs` の旧照合式の綴りを新しい式に合わせた。

## 3. CSP

`index.html` の `script-src` の `https://unpkg.com` を `https://unpkg.com/@openmeteo/weather-map-layer@0.0.19/dist/index.js` にした。実際に読むのは `js/wx-ecmwf.js` の 1 本だけ（SRI 付き）。測った: その URL は 200 でリダイレクト無し（リダイレクト後は CSP がパスを比べない）、SDK の worker は `blob:`（`worker-src` 済み）、sha384 は `SDK_URLS` の値と一致。CSP のパスは `/` で終わらない限り完全一致なので、`SDK_VER` を上げたら CSP も変える——⑥ が `SDK_URLS` を AST から組み立てて照合する。Cesium の `'unsafe-eval'` と admin.html は触っていない。

## 4. 書き込む操作要素

`scripts/data-effects.mjs`（`check:static` の `data-effect`）。Atlas の確認は `data-effect` 宣言にしか効かない。書き込み（表・rpc・functions.invoke・認証・POST の Edge Function）に届く UI ハンドラで宣言の無いものを台帳にした: 39 本中 10 本（言語ボタン・設定を閉じる・ニュース言語・レイヤープリセット保存/削除——どれも `window._syncPrefsUp` で利用者自身の設定を upsert する＝ `private`）。既存の `tests/atlas-outward-effects-checks.test.mjs` D は `window.*` と host リテラルを辿らないのでこれらを見ていなかった。
⚠ 否定された見立て: 最初は「工場関数の引数のメンバー呼び出しを名前で辿る」と「未定義の識別子呼び出しを名前で辿る」を入れ、**462 本中 433 本が書き込みに届く**と出た（`fn()`・`ctx.tick()`・`v.stop()` が全ファイルの同名関数につながる）。引数として受け取った名前は辿らず、host は「その工場が呼ばれるときに渡されるオブジェクトリテラル」から解決するようにして 39 本になった。

## 5. 門

- `check:static` §20 `output-taint`（台帳 `tests/output-taint-baseline.json`）・§21 `data-effect`（台帳 `tests/data-effect-baseline.json`）。新しい `check:*` は作っていない（`execution-strategy.md` の表に余白が無い）。
- `TRUSTED`（`IntMapLang.t`・`IntMapLang.pick`・`HOST.t`）は宣言。行ごとに実装の場所と理由の文を持ち、関数が消えた・誰も呼ばない・理由が無い行を門が落とす。
- `tests/shell-data-layers-checks.test.mjs` の国カードの harness に本物の `IntMapSafe`（`tests/helpers/safe-html.mjs`）を渡した——カードが符号器を呼ぶようになったため。

## 6. 残り

- 未判定 434 の大半は自前の数値・ラベルが解析の辿れない経路で届いているもの。外部データと読めたのに**直していない**もの: `js/atlas-*.js` の sink（この作業では編集禁止）と、`js/data-layers.js` の 5440〜5500 行以外（別作業の範囲）。一覧は `node scripts/output-taint.mjs --why`。
- 10 本の未宣言の書き込み操作要素には `data-effect="private"` を付けられる（markup は `index.html` と `js/app-body.js` / `js/map-ui.js`）。この作業では台帳化まで。

## 統合時に足したこと

- 書き込みに届く未宣言の 10 本に宣言を付けた。言語ボタン 5・`#setting-lang`・`#newslang-multi`・`#btn-close-settings`・`#lp-save` は利用者自身の設定を upsert するだけなので `private`。プリセットの削除（`[data-del]`）は戻せないので `destructive`（Atlas が押す前に確認を求める）。台帳は 10 → 0。
- 検出器はセレクタを全ファイルのマークアップ横断で照合していたので、`[data-del]` が書き込まない `js/drone-nav.js` の経路点削除にも当たり、宣言しても「未宣言」のままだった。ハンドラと同じファイルに一致するマークアップがあればそれを優先し、無いとき（index.html の id）だけ全体に訊く。
