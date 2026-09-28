---
title: MapLibre 6 の worker を同じビルドの entry チャンクにした——本体と worker が shared を 1 本のチャンクで共有し、起動時の JS は raw −451,713 B・brotli −98,564 B。本番と同じキャッシュ見出しの下で shared はサーバに 1 回しか届かない
date: 2026-09-28
---

〈依頼〉MapLibre 6 移行（開発記録 `2026-09-27-maplibre-6-migration` §4）で、worker を Vite の `?worker&url`
（本体の束とチャンクを共有しない別の束）にしたため、`maplibre-gl-shared.mjs` が本体側と worker 側に二重に入り、
起動時の転送が brotli で約 +120 kB 増えていた。前任の提案（配布ファイル 3 本を束ねずに配る）またはそれと同等の
MapLibre 6 の公式の方法で減らす（利用者承認済み）。

## 0. 結論

**worker を別の束ではなく、同じビルドの entry チャンクとして出した**（`vite.config.js` `maplibreSharedWorker`・
`emitFile({type:'chunk'})`）。本体と worker が import するものは束ね器が `maplibre-gl-shared` チャンク 1 本にまとめ、
worker チャンク（19,079 B）はそれを import するだけになった。MapLibre 6 自身が前提にしている形——本体と worker が
隣の shared を import し、本体が worker を module worker として起こす（`node_modules/maplibre-gl/build/readme.md`、
`dist/maplibre-gl.mjs` の worker 生成部）——を、Vite のハッシュ・modulepreload・計器の中で再現したもの。

## 1. 公式の形と、なぜ「束ねずに配る」ではなくこの形か

MapLibre 6.11.2 の `package.json` は `exports` に `"."`（`dist/maplibre-gl.mjs`）と `"./dist/*"` だけを出し、
`dist/` は `maplibre-gl.mjs`（590,228 B）・`maplibre-gl-shared.mjs`（515,924 B）・`maplibre-gl-worker.mjs`（19,133 B）の
3 本。本体の worker 生成は `new Worker(url, {type:'module'})` で、URL の既定は `import.meta.url` の隣、`setWorkerUrl`
で上書きできる（別オリジンなら Blob で包み直す）。worker の 1 文目は `import … from "./maplibre-gl-shared.mjs"`。

3 本を束ねずに配る案は、`maplibre-gl` を external にして import を出力パスへ書き換え、3 本を版つきの置き場へ写すことに
なる。それだと Vite はそのファイルに `modulepreload` を出さない——ブラウザは main を解析してから本体を、本体を解析して
から shared を知る 2 段の滝が起動経路に入る（preload を index.html へ別に差し込む仕組みが要る）。同じグラフの entry
チャンクにすれば、shared は main の静的 import の閉包に入るので Vite が今までどおり modulepreload し、ファイル名は
内容ハッシュで、`scripts/build-report.mjs` もチャンクとして数えられる。バイトもほぼ同じ（束ねない 3 本 1,125,285 B、
この形 1,126,021 B）。

## 2. 何を shared に置くか——グラフに訊く

chunk group を 2 つにした。優先度 5 の `maplibre-gl-shared` は「worker の entry から静的 import で届く」モジュール、
優先度 4 の `maplibre-gl` はそれ以外（本体と、worker が使わない束ね器の補助）。判定は `inWorkerGraph`
（worker の `importedIds` を下へ辿る）で、ファイル名の一覧ではない。

⚠ **実測: Vite の preload helper は worker のグラフに本当に属していた。** 最初のビルドで `\0vite/preload-helper.js`
が shared チャンクに入り、誤配置を疑ったが、worker の `importScriptInWorkers` 用の `import(e)` を Vite が
`__vitePreload(() => import(e), [], import.meta.url)` で包むので、helper は worker の依存だった（top-level は
`const yT='modulepreload'` 等の定義だけで、`document` は関数の中でしか触れない）。一方 modulepreload polyfill
（top-level で `document` に触れる）と Oxc の補助は worker のグラフの外で、`maplibre-gl` に残った。

**ビルドが拒む形**: `generateBundle` で worker チャンクの静的 import の閉包を辿り、そこに worker のグラフの外の
モジュールが 1 つでもあれば `this.error` で止める（worker は読んだチャンクのモジュールを全部評価するので、本体の
主スレッドのコードが入れば worker の中で走る）。worker チャンクが出ていないビルドも止める。
`tests/maplibre-6-migration-checks` ④ が、合成グラフで配置（shared／本体／補助 2 種／worker 自身）を実際の
group に評価させ、主スレッドのモジュールが混ざった束と、worker の無い束の両方で落ちることを確かめる。

## 3. 計器——worker チャンクを eager に数える

`build-report.mjs` の eager は「main の静的 import の閉包＋`?worker&url` が名指す worker アセット」だった。
emitted entry チャンクはどちらでもないので、**最初のビルドでは worker が ASYNC に落ち、起動が 19 kB 軽く見えた**。
規則を足した: eager のモジュールの描画コードが名指す emitted（HTML でない）entry チャンクは起動が持つ URL で、
その静的 import の閉包ごと eager に入る。

⚠ **実測: この hook の時点でモジュールの描画コードは hash の placeholder を持つ**
（`new URL("maplibre-gl-worker-!~{01n}~.js", import.meta.url)`）。最終名では当たらないので、チャンクの
`preliminaryFileName` でも照合する。さらに**どのモジュールも名指さない emitted entry はエラー**にした——黙って
ASYNC に数える経路が、今回の見落としそのものだったため。検査は同じ ⑤（placeholder で名指された worker は eager・
shared は 1 回・requests 4、名指されない entry は throw）。

## 4. 起動費用の前後（同じ木・同じ機械の 2 ビルド）

| eager | 前 | 後 | Δ |
|---|---:|---:|---:|
| raw | 5,366,121 | 4,914,408 | −451,713 |
| gzip | 1,735,022 | 1,610,156 | −124,866 |
| brotli | 1,313,222 | 1,214,658 | −98,564 |
| requests | 8 | 9 | +1（shared が独立のファイル） |
| modules | 283 | 284 | +1（worker モジュールがグラフに入った） |

MapLibre の JS は 1,577,770 → 1,126,021 B（本体チャンク 1,067,660 → 591,365 ＋ shared 515,577、worker 510,110 → 19,079）。
CSS と async は動いていない（async の +3,678 B は同じ作業ディレクトリの別の変更の `cesium-input`）。
`tests/perf-baseline.json` は `--update` を使わず、**動いた行だけ**を前後の差で下げた（eager の 5 行と
`dist.total`・`dist.assets` に −451,713）。天井と測定の差は変更前から在った +1.0 kB のまま。

## 5. 実ブラウザでの確認

**本番と同じキャッシュ見出しで測った**（本番の `assets/*.js` は `Cache-Control: max-age=600`＋ETag、2026-09-28 実測）。
同じ見出しを返す計測用サーバで build を配り、Chromium で起動→GeoJSON をタイル化させて数えた:
`maplibre-gl-shared-*.js` はブラウザが 2 回要求（ページの modulepreload と worker の import）し、**サーバに届いたのは
1 回**、2 回目の `transferSize` は 0。worker は同一オリジンの `assets/maplibre-gl-worker-*.js`、タイル化した地物が
入れ子の properties を値のまま返した。Cesium への要求は 0。
`vite dev`（`npx vite`）でも同じ手順で worker が起き、タイル化した（dev では同じ virtual モジュールが
`/node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs?worker_file&type=module` を返す＝従来の dev と同じ経路）。
⚠ テスト用サーバ（`scripts/serve.mjs`）は `no-store` なので、そこでは worker の import が shared をもう一度取りに行く。
本番の転送の主張はこの節の計測で、spec ② は「worker が import するファイルはすべてページ自身が読んだもの」を測る。

## 6. 検査

- `tests/maplibre-6-migration-checks` ③（vendor.js の import を plugin が build／serve の両方で解決し、build では
  worker を**チャンクとして** emit する）・④・⑤。
- `tests/maplibre-6-migration.spec.js` ②: 「worker は自己完結」を「worker の import はすべてページが読んだファイル」に。
- `tests/r180-checks` ③: group の `name` が関数（グラフに訊く）になったので、所有者を**評価して**読む
  （文字列として読むと関数の group は何も持たないように見えた）。

## 7. 残したもの

- この作業の中では、作業ディレクトリの `node_modules` の junction を外して専用に `npm ci` した——原本が #783
  （maplibre 5.24.0）のままで、junction 越しの依存がこの木の `package.json`（6.11.2）と合っていなかった。
