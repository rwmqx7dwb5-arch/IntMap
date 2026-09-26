---
title: dependabot の大型更新 3 本——Turf 7 と supabase-js 2.117 は入れ、MapLibre 6 は測ったうえで入れなかった。Turf 7 の起動費用は Turf ではなく「遅延させるものの名前の一覧」から来ていた
date: 2026-09-27
---

〈依頼〉dependabot の PR #762（`@turf/*` 6.5 → 7.4）・#763（maplibre-gl 5.24 → 6.11）・#772（supabase-js 2.58 → 2.117）
を壊さずに取り込む（利用者承認「全部」）。どれかが安全に入らなければ、その 1 本だけ外して残りを仕上げる。

## 0. 結論

| 更新 | 結果 | 版 |
|---|---|---|
| `@turf/*`（19 パッケージ） | **入れた** | 7.4.0 |
| `@supabase/supabase-js` | **入れた**（admin.html の同梱版も同じパッケージから作られるので同じ版） | 2.117.2（#772 の 2.117.0 と同じ minor の最新 patch） |
| `maplibre-gl` | **入れなかった**（§3） | 5.24.0 のまま |

## 1. Turf 7

### 1.1 CI の赤の正体——起動時 +285 kB は Turf ではなかった

dependabot の枝の赤は `eager modules 322 > 306`・`eager.raw 5065 kB`。この木で同じ更新だけを入れて測ると
eager raw **4,778.7 → 5,064.0 kB**、そして **async の合計が 304 kB 減っていた**——遅延チャンクにあったものが
起動時チャンクへ移った形。起動時の `geo` チャンクの中身を数えると先頭が `@turf/jsts/dist/jsts.min.js`
**272,327 B**。Turf 7 は buffer の幾何エンジンの名前を `turf-jsts` から `@turf/jsts` に変えた。
`vite.config.js` の規則は「`node_modules/@turf` は全部 `geo`、ただしこの一覧を除く（turf-jsts・polygon-clipping・
@turf/buffer・@turf/convex・splaytree・concaveman）」で、**一覧が知らない新しい名前を接頭辞の規則が拾った**。
`window.turf.ensureHeavy()` の後ろに置いていた 272 kB が、毎セッション読まれるチャンクに入っていた。

⇒ 名前を 1 つ足すのではなく（`.agents/rules/no-ad-hoc-hardcoding.md` §2-4「手で並べた一覧は、次に足されたものを
黙って落とす」）、**問いをモジュールグラフに移した**: `@turf/*` と `topojson-client` は、**入口から静的 import
だけで届く**ときに限り `geo`。除外の一覧は消えた。
⚠ この作業の途中で main が vite 8（Rolldown）に移り（`2026-09-27-vite-8-migration`、PR #777）、`manualChunks` は
優先度つきの `codeSplitting.groups` になった。そこへ合流させた形: geo group の `test` は「どのパッケージの話か」
（`@turf`・`topojson-client`）だけを言い、`name(id, ctx)` が `ctx.getModuleInfo` で**静的な `importers` を
入口まで遡れるか**を訊いて、届けば `'geo'`、届かなければ `null`（この group には入らない＝その `import()` が
作るチャンクに残る）。Rolldown の ModuleInfo は「同じ分割の回の中では同じオブジェクト」なので、メモはその
オブジェクトを鍵にした WeakMap——次の回は新しいオブジェクトなので、判定がグラフを越えて生き残らない。
vite 8 移行が書いていた「#R734 の polygon-clipping は geo group が @turf/union の依存として取り込むから起動時に
入る」はその通りで、Turf 7 の union はもう polygon-clipping を使わない。

### 1.2 union は polyclip-ts ＋ bignumber.js になった——だから union も遅延にした

jsts を外した後もなお `geo` に `bignumber.js` 84.6 kB・`polyclip-ts` 39.2 kB・`splaytree-ts` 11.5 kB（いずれも
ソース寸法）が居た。Turf 7 の `union` の中身である。呼び手は `js/time-borders.js` の 2 か所（1951 年以降の
チベットを中国に、1920/1930 年の東プロイセンをドイツに溶かす）だけで、どちらも**非同期の snapshot 取得の中**
——しかも aourednik の snapshot の経路で、1886–2019 年は通常 CShapes の日単位の経路が答えるので、ここに来るのは
その束が読めないときと帯の外の年だけ。毎セッション払う理由は無い。
⇒ `window.turf.ensureUnion()` を足し（`ensureHeavy()` と同じ形・失敗したら次の snapshot で取り直す）、
`fetchFC` が snapshot と**並列に**要求して、最初の補正の前に待つ。

### 1.3 API の変更で直したもの

- **`union(a, b)` → `union(featureCollection([a, b]))`**（`js/time-borders.js` の 2 か所）。⚠ 旧い形は 7 では
  「Must have at least 2 geometries」で**投げ**、両方のループの `catch` がそれを飲んで**改名だけの退避**に落ちる
  ——国境線は独立時代のまま残り、何も言わない。`tests/deps-runtime-majors-checks` ① が 2 つの関数を
  実物の Turf 7 で評価する（溶けて 1 つの環になり、面積が 2 つの和に一致）。
- **`bbox` が宣言された `bbox` 欄を読まずに返す**（`recompute:true` を渡さない限り）。6.5 は常に座標を測った。
  呼び手（取り込んだファイルへの `fitBounds`・最小の国の選択・シムの切り分け格子）は全部「この座標の範囲」を
  訊いていて、読者のファイルが持つ `bbox` 欄は誰も確かめていない主張なので、**公開する `turf.bbox` 1 つ**が
  6.5 の契約を保つ（`src/vendor.js`。呼び手ごとに旗を覚えさせない）。
- 変えずに済んだもの（6.5 と 7.4 を同じ入力で比べて一致）: distance・bearing・length・along・circle・kinks・
  bboxClip・pointOnFeature・center・centroid・bbox（欄が無いとき）・booleanPointInPolygon・convex・buffer・
  union の面積。

### 1.4 数が動いたもの（直していない——理由つき）

- **`area` が 0.223% 小さくなる**（例 864,099,854,796 → 862,169,499,687 m²）。6.5 の `@turf/area` は赤道半径
  6,378,137 m、7.4 は平均半径 6,371,008.8 m（(6371008.8/6378137)² = 0.99777）。IntMap 自身の半径は
  `js/geodesy.js` の 6,371.0088 km ただ 1 つなので、計測ツールの面積（`js/app-body.js` の `ringArea`）と国の面積が
  **これで IntMapGeodesy と同じ半径になった**。
- **`greatCircle` の座標が 6 桁に丸まる**（7 は `arc` パッケージ経由）。0.1 m 級で、描画と距離に影響しない。

### 1.5 否定された見立て

- 「#R734 は Rollup が `manualChunks` の undefined を無視して polygon-clipping を起動時チャンクに入れた」
  ——違った。**Turf 6.5 の `union` が polygon-clipping を静的に import していて、union が起動時の turf オブジェクトに
  居た**ので、sweep-line は起動経路の静的な依存だった。Turf 7 の union はそれを使わず、しかも遅延なので、
  polygon-clipping は自分の async チャンク（`polygon-clipping.esm`・vite 6 で 23.0 kB、vite 8 で 22.0 kB）になった。`vite.config.js` と
  `js/gis-geometry.js` の該当の註を現状に直した。

## 2. supabase-js 2.117

### 2.1 起動時の増分——Storage と Functions は束に入れない

`createClient` は 5 つのサブクライアントを静的に import し、`storage` をコンストラクタで必ず組む
（`functions` は getter）。アプリはどちらも使わない——Edge Function は全部 `fetch` で
`<SUPABASE_URL>/functions/v1/<name>` を直に呼び、バケットは無い。
⇒ `vite.config.js` の alias で `@supabase/storage-js`・`@supabase/functions-js` を
`src/supabase-unbundled-stub.js` に向けた。Storage のクライアントは組めるが最初の読み取りで投げる Proxy
（SDK 自身が `accessToken` 指定時の `auth` に使う形）、Functions は読んだ瞬間に投げる。
`createClient` をやめて auth・postgrest・realtime を自前で組む案は採らなかった: SDK の結合部（トークンの
受け渡し・Realtime の認証・セッション鍵 `sb-<ref>-auth-token` の名前）の**写し**になる。

実測（eager raw、`supabase` チャンク）: 2.58 = 130.6 kB → 2.117 そのまま 224.6 kB → スタブ後 **193.3 kB**。
eager 全体では +92.9 kB → **+62.4 kB**（gzip +7.3 kB 減）。残りは auth-js（ソース 166 → 407 kB：パスキー・
WebAuthn・OAuth サーバ・web3 サインイン）・postgrest-js・realtime-js（＋`@supabase/phoenix`）で、どれも使っている
クライアントの中身。`tests/deps-runtime-majors-checks` ④ が、SDK が 2 パッケージから import する**全部の名前**を
スタブが持つこと（SDK の実ファイルから読む）と、アプリの誰もそのクライアントに触れていないこと
（`window.sb` から代入された束縛名を発見して走査）を測る。

### 2.2 パスキーの UI が表に出る——失敗が読者に分かり、パスワードへ退避できること

2.58 の auth-js にはパスキーの関数が 1 つも無く、#R155 の UI は機能検出でずっと隠れていた。2.117 は持つ。
本番のプロジェクトは `passkeys_enabled: true` で、`POST /auth/v1/passkeys/authentication/options` は
**`rpId: rwmqx7dwb5-arch.github.io`** を返す（2026-09-27 実測）——本番の origin では動く。
それ以外の origin（プレビュー・fork・127.0.0.1）ではブラウザの WebAuthn が relying party を拒み、押すたびに失敗する。

直したもの（`js/auth-ui.js`）:

- **`_pkFailure(e)`** が SDK の返すエラーから 3 つに分ける: **取消**（NotAllowedError / AbortError。WebAuthn は
  取消と「選ばなかった」を意図的に区別させない）／**使えない**（SecurityError・SDK の `ERROR_INVALID_DOMAIN` /
  `ERROR_INVALID_RP_ID`・404）／**失敗**（それ以外：通信・5xx・期限切れの challenge）。
- **使えない**と分かったら、そのセッションの間はパスキーの操作を**全部引っ込める**（`_pkOff`。ログイン画面の
  ボタンもアカウントのカードも `_passkeysAvailable()` に訊いてから描く）。押せば必ず失敗するボタンを残さない。
- どの失敗でも「代わりにメールアドレスとパスワードでログインできます」と述べ、カーソルをパスワードの欄へ移す。
- ⚠ **一覧の取得失敗が「パスキーはまだありません」と表示されていた**。SDK の `list()` は投げずに `{data:null,error}`
  を**返し**、元の行は `(r.data)||r`＝結果オブジェクトそのものを一覧として読んでいた。失敗は失敗として述べる。
- ⚠ **削除が効いていなかった**。SDK の引数は `{passkeyId}`（`DELETE …/passkeys/<passkeyId>`）。元の行は `{id}` を先に
  試し、「投げたら」`{passkeyId}` に替える作りだったが、SDK は投げずに `{error}` を返すので、`…/passkeys/undefined`
  が「成功」し、パスキーは残ったまま一覧が描き直されていた。`tests/deps-runtime-majors-checks` ⑥ が、SDK が
  実際に読む引数名を SDK の実ファイルから取り出して突き合わせる。
- `experimental.passkey` は 2.117 では無視される（SDK 自身の型がそう述べる）。`tests/r175-checks` が選択肢を
  逐語で固定しているので書いたまま残し、`src/vendor.js` の註に「効いていない」と書いた。

`tests/deps-runtime-majors.spec.js` がブラウザで確かめる: ① 通信が塞がれた失敗 → 文言・パスワードへの案内・
ボタンは残る・カーソルはフォームへ ② 本番の応答（上の rpId）を返すと**実物の WebAuthn が拒み**、
「このサイトでは現在パスキーを利用できません」→ ボタンが消え、タブを描き直しても戻らない
③ ログイン中の一覧取得失敗が「読み込めませんでした」になる（「まだありません」ではない）。

新しい文字列は 4 つ（en・jp・de・ru・es の位置引数で書いた。zh / ko / fr / zh-hans は英語へ落ちる）:
「代わりにメールアドレスとパスワードでログインできます。」「このサイトでは現在パスキーを利用できません。」
「パスキーを読み込めませんでした。」「パスキーを削除できませんでした。」。`check:i18n` は緑（en+jp 100%・残りは床の上）。

## 3. MapLibre 6 を入れなかった理由（6.11.2 を入れて測った）

#R158 の固定の理由はカメラ API の振る舞い（飛行シムのコックピットが `calculateCameraOptionsFromTo` の
5.24.0 の実装に依って視点の跳ねを消した）。6.11.2 の `calculateCameraOptionsFromTo` は Map から内部の
`_camera.transform` へ委ねるだけで式は残っている。GHSA-jrc7-96c5-q579 も 6.4.1 で直っている。
それでも依存の更新の中では入れられない——IntMap は MapLibre の**内部**の上に建っていて、その内部が 6 で動いた:

1. **`map.transform` が無い**（Map は Camera を継承せず `_camera` に持つ）。`js/geo-engine.js` の 12 か所
   （大気の周縁の uniforms・視錐台・視点の位置・地平線の far 面の上書き・`worldSize` ほか）と
   `js/camera-math.js` の 1 か所が読む。移すなら内部の `map._camera.transform` で、公開 API ではない。
2. **`transform.getMatrixForModel` が消えた**。`projectAltitude` / `projectMercAlt`（航空機・軌道の高度つき hover の
   投影）はそれを「再導出するな、写せ」（#R186）の答えとして使っている。公開の代替は無く、機能検出で null に落ちて
   **地上の位置で拾う**ようになる＝黙った劣化。
3. **`_elevateCameraIfInsideTerrain` は Camera のメソッドになり**、`js/geo-engine.js` が Map のインスタンスに置く
   上書き（視点モードで地形の下に入らないための守り）は**効かなくなる**——投げもしない。
4. **ESM 専用**・default export が無い（`import * as maplibregl`）・**worker が束の隣の実 URL**
   （`maplibre-gl-worker.mjs` ＋ `maplibre-gl-shared.mjs`）。#R512/#R513 の A/B は Vite がそれを出さず
   「何も描かない地図が最速」だった。Vite の worker 化と CSP の `worker-src` が要る。
5. 描画の既定が変わる: `zoomLevelsToOverscale` 既定 4・offset つき icon の拡大を廃止・GeoJSON の入れ子の
   properties を値で返す。163 レイヤーの目視と、`queryRenderedFeatures` の読み手の監査が要る。
6. 5.24.0 の `maplibre-gl-dev.js` の内部文字列を読む検査（r182・r230・r241・r322）と、prototype 鎖から
   `_elevateCameraIfInsideTerrain` を探す deep の r179。

⇒ 1〜3 は「公開 API に無いものを内部から取り直す」か「機能を落とす」かの二択で、後者は承認が要る（§3-1）。
MapLibre 6 は #R512 §3 が述べた通り**それ自体を 1 本の作業**にする。版は 5.24.0 のまま、XSS は従来どおり
到達経路で閉じている（`DECISIONS.md` の該当行と `docs/SECURITY-ARCHITECTURE.md` §8 の 12 に今回の実測を足した）。
⚠ 否定された見立て: 「GeoJSON の入れ子の properties が値で返ると `js/cameras.js` の `presets` の `JSON.parse` が
壊れる」——違った。`presets` はアプリ自身が `JSON.stringify` して入れている文字列だった。

## 4. 起動費用（`check:perf`）

vite 8 の main（90d0d693、PR #777）との比較。main の天井は vite 8 移行が `--update` で記録した**その木の
測定値そのもの**（同じ機械・同じ vite 8.3.1）なので、差はこの変更の分だけである:

| | main（vite 8） | この変更 | Δ |
|---|---:|---:|---|
| eager raw | 4,655.5 kB | 4,699.9 kB | **+44.4 kB**（+45,462 B） |
| eager gzip | 1,526.8 kB | 1,537.1 kB | +10.4 kB（+10,610 B） |
| eager brotli | 1,144.1 kB | 1,152.7 kB | +8.6 kB（+8,840 B） |
| eager modules | 296 | 280 | −16 |
| eager requests | 7 | 7 | 0 |
| eager CSS | 334.5 / 56.4 kB | 334.5 / 56.4 kB | 0 |

eager のチャンク（raw、B）: supabase 122,906 → 184,714（**+61,808**：使っている auth・postgrest・realtime の成長。
Storage と Functions を外した後）／geo 51,164 → 29,533（**−21,631**：jsts と union の engine と polygon-clipping が
抜けた）／main 3,560,221 → 3,565,502（+5,281：パスキーの失敗の扱い・`bbox` の包み・`ensureUnion`）／
maplibre-gl +4／rolldown-runtime 0。async は Turf 6 の遅延チャンク `es`（352,762 B）が Turf 7 の `esm`
（286,281 B。`@turf/jsts`＋d3-geo。同名の `esm` がほかに convex 13,798 B と union 42,863 B の 2 つあり、表は同名の
最大を載せる）に替わり、`polygon-clipping.esm`（22,543 B）が増えた。
（vite 6 の時点で測った同じ比較は raw +43.2 / gzip +10.0 / brotli +8.0 kB・modules 306 → 279 で、束ね器が
変わっても増分はほぼ同じ。）

天井（`tests/perf-baseline.json`）は main の値を基準に、**この変更が動かした行だけ**を書き換えた: eager の
raw・gzip・brotli・modules、async の raw・gzip、async チャンク 5 行（`es` → `esm`・`polygon-clipping.esm` を
追加・cesium −1,110 B／cesium-vector-tiles +4 B／gis-core −1 B は束ね直しの揺れ）。`--update` が書くはずの全項目を
先に main の記録と突き合わせ（差はこの 12 行だけで、dist の 3 行は天井の内側なので触っていない）、そのうえで
スクリプトでその行だけを書いた。増分の理由は、使っている
supabase の 3 クライアント（auth-js のパスキー・WebAuthn を含む）の成長で、Storage と Functions を外した後に残る分。

## 5. 検査

- 足した: `tests/deps-runtime-majors-checks.test.mjs`（6 本。どれも出荷する関数を acorn で取り出し、**入っている
  実物のライブラリで評価する**）と `tests/deps-runtime-majors.spec.js`（3 経路・実測 9.0 s → 表に 17 として登録し、
  `scripts/test-budget.mjs` の全体の天井を 4,910 → 4,927 s。較正は #R402 の上限側の方法）。
- 直した: `tests/r209-checks` ⑥ の遅延メンバーの一覧を `ensure<X>()` ローダから**読み出す**形にした
  （手の一覧 HEAVY を撤去）。`tests/r209.spec.js` ⑤ は union が起動時に無く、`ensureUnion()` で届いて
  FeatureCollection の形で 1 つの多角形を返すことを確かめる。`scripts/gis-kernel-versions.mjs` は
  `js/gis-geometry.js` の**註だけ**の変更なので版 geom-2 のまま hash だけ記録し直した。
- 段 1: `check:static`・`check:engine`・`check:types`・`check:assets`・`check:i18n`・`check:archfiles`・
  `check:docs`・`check:testbudget`・`check:perf` 全部緑。vendor・turf・maplibre・supabase を参照する node 検査
  40 本（417 件）緑。
- 段 2: `r209`・`r210`・`r205`・`r175`・`r168`・`r753-account-menu`・`smoke`・`security`・`r173`・`r174`・
  `r149`・`r545`・`monitors`（124 件）——r209 ⑤ の 1 件だけが赤で、それは union を起動時から外した設計の変更
  そのもの（上で直した）。直した後 r209 は 5/5。
- 段 3: `npm test` 1 回——browser 91 passed。checks は 5,507 件中 7 件が赤で、うち 6 件は 600〜900 s の
  gate-lock 待ちの時間切れ（同じ機械で他のセッションの `npm test` が並走していた）、1 件が上の hash。
  7 本のファイル（r274・r407・r500・r503・r699・r717・r749）を単独で回して全部緑。
- ⚠ 途中で `maplibre-gl` を 6.11.2 に上げて 5.24.0 に戻した際、npm が `@maplibre/mlt` を 1.1.12 → 1.3.0 に
  再解決していた（maplibre-gl 5.24.0 の `^1.1.8` の範囲内だが、この変更の主題ではない）。lock の該当項目を main の
  記録に戻して `npm ci` し直し、その木で `npm test` を回した。lock の残りの差は Turf と supabase の推移的な依存だけ
  （`@supabase/node-fetch` 系・`ws`・`@types/node` 系が消え、`@turf/boolean-valid` が足した
  `geojson-polygon-self-intersections` が入る）。
- **vite 8 の main（PR #777）へ合流したあと、同じ木で回し直した**: build（vite 8.3.1）→ `check:perf`・`check:assets`・
  `check:static`・`check:engine`・`check:types`・`check:docs`・`check:testbudget`・`check:i18n`・`check:archfiles` 全部緑。
  node 検査 38 本（`tests/deps-runtime-majors-checks`・`r180`・`r209`・`r175`・`r184`・`r307`・`r749` ほか、429 件）緑。
  spec 10 本（`deps-runtime-majors`・`r209`・`r175`・`r168`・`r753-account-menu`・`smoke`・`security`・`r210`・`r205`・`monitors` ほか、107 件）緑。
  起動時に読むチャンクは geo・main・maplibre-gl・rolldown-runtime・supabase の 5 本で、cesium は入っていない。
  main が足した spec 1 本で deep の本数は 116・全体は 122 本（docs と `TOTAL_BUDGET_S` 4,919 → 4,936 はそれに合わせた）。
