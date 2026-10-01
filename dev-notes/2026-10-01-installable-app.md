---
title: 「PWA としても入る」の下に実体を置いた——Web App Manifest とアイコン（index.html の title・--bg-color・IntMap.Icon.png から生成し --check で照合）、Service Worker がビルドの eager 集合から導いたアプリ本体の殻（オフラインのときだけ文書に答える）、設定の「アプリとして追加」とオフライン通知、端末の現在地を 1 回読む実装の一本化（Atlas の 2 入口が同じ requestFix を呼ぶ）
date: 2026-10-01
---

〈依頼〉監査で PRODUCT.md §1 の「PWA としても入る」に対し、`rel="manifest"`・webmanifest・theme-color・
apple-touch-icon・`beforeinstallprompt` がリポジトリに 0 件だった（`sw.js` はタイルの cache-first のみ）。
主張と実体の食い違いを、実体を足して解消する: ① manifest とアイコン ② アプリ本体のオフライン起動
③ インストールの入口 ④ 「現在地へ移動」を地図のコントロールに足し、Atlas と同じ実装を呼ぶ。

## 0. 測った

- 0 件の確認: `rel="manifest"`・`.webmanifest`・`theme-color`・`apple-touch-icon`・`beforeinstallprompt` は
  追跡ファイルに無かった。CSP（index.html:8）は既に `manifest-src 'self'` と `img-src 'self'` を持っていた。
- アイコンの原版: 暗色のマーク `IntMap.Icon.png` は **384×384**（地は `scripts/boot-icon-flatten.mjs` が
  `#000000` に平らにしたもの、ただし角に (0,1,2) の残りが 15 画素）。`IntMap.Icon_BW-inverted.png` は
  1254 px だが**明色のマーク**で別の絵。⇒ 512 px は 384 からの拡大（bicubic）しか無い。
- 現在地を読むコードは 3 か所に別々にあった: `js/atlas-cap-view.js` view.locate（許可の事前確認・25 s・
  28 s の見張り）、`js/atlas-geo-resolve.js` の「現在地から…」（20 s・事前確認なし・失敗は全部 `null`）、
  `js/map-extras.js` の `IntMapLocate.start`（20 s・事前確認なし）。携帯には現在地 FAB（#m-fab-locate）が
  既にあり、**デスクトップの地図コントロールに無かった**。
- `DECISIONS.md` は「Service Worker に navigation を持たせない」と記録している（温まった起動に往復を足さない・
  ハンドラの不具合で戻ってきた読者を締め出さない）。依頼の「index.html を stale-while-revalidate」は
  #R16／#R465 の古い文書対策とも衝突する（古い文書を 1 回は必ず見せる）。

## 1. manifest とアイコン（`scripts/build-app-manifest.mjs`）

値は全部、既に述べているものから読む: 名前＝`<title>` の語標（「IntMap」は訳さない）、説明＝
`<meta name="description">`、lang＝`<html lang>`、`background_color`/`theme_color`＝暗色の `--bg-color`
（アイコンの地の色。`--check` が地の実測と一致を確かめる）。アイコンは 192／512／apple-touch 180。
maskable の縮尺は「マークの最遠点を安全域（半径 40 %）に収める」から導く。
⚠ **否定された見立て**: 最初は「地の色と 1 でも違う画素はマーク」とし、角の (0,1,2) を 270 px 先のマークと
読んで maskable を半分の大きさにした。人に見える差で決める（ΔE00 ≥ 1。`tests/helpers/colour-difference.js`）
と最遠点は 149.6 px（"Map" の p の下端）で、等倍で既に安全域に収まる ⇒ maskable は `any` の 512 と
**画素まで同一**になり、2 ファイル出すと同じ中身を 2 回配る（`check:assets` が拒む）。同一なら 1 ファイルが
`"any maskable"` を名乗る規則にした。index.html は `vite-ignore` で manifest とアイコンをそのまま指す
（ハッシュ化されると manifest 内の相対パスが `assets/` 基準になって壊れる）。

## 2. アプリ本体の殻（`sw.js`・`scripts/app-shell.mjs`）

- 一覧は手で持たない。`vite.config.js` の `appShell`（copyStatic の後）が build-report の **eager 集合**
  （`check:perf` と同じ定義）＋`dist/index.html` と manifest が名指すもの＋eager CSS の `url()` を導き、
  ビルド印と一緒に `dist/sw.js` のトークンへ書く。実測: **21 ファイル・6,171 kB**（main 3.26 MB・
  MapLibre 1.1 MB・Pretendard 748 kB を含む）。最初の版は `./assets/x` と `assets/x` を別物として 29 件・
  11 MB を数えていた（正規化の漏れ）。
- 殻のキャッシュ名はビルド印を含む ⇒ 配信ごとに新しい worker、activate が前の殻を消す。前の殻が持つ
  同名のハッシュ付き資産は引き継ぐ（変わったチャンクだけ取り直す）。
- **文書（navigation）はブラウザがオフラインと言うときだけ**殻から答える。オンラインでは respondWith しない
  ので、DECISIONS.md の 2 つの理由（どちらもオンラインの経路の話）はそのまま成り立つ。install は
  `cache:'reload'` で文書を取り、**この build の印を含むときだけ**貯める（Pages の max-age=600 が前の文書を
  返しうる #R465 の形）。ハッシュ付き資産は殻から（再検証なし）、manifest とアイコンは
  stale-while-revalidate。⚠ 残る穴: `onLine` が true のまま通らない回線では答えない（従来どおりのエラー）。
- 殻から開いた頁は `shell-status` で worker に訊き、**オフライン通知**（`#im-offline`、`.im-reload` と同じ
  カード）を出す。回線が戻ると「再読み込みで取得し直す」に変わる。オフラインの間に取れなかったデータが
  静かな空白に見えないため（CONSTITUTION）。

## 3. インストールの入口（`js/installable-app.js`）

設定 ▸ About & support の先頭。Chromium の `beforeinstallprompt` を保持して（mini-infobar は出さない）
押されたら `prompt()`、iOS は共有シートの手順を 1 文、どちらも無い環境と既にインストール済みの窓では
**出さない**（押しても何も起きないボタンは出さない）。theme-color はアプリ内のテーマ選択に追従する
（実行時の `--bg-color` を読む。トークンの写しを持たない）。

## 4. 現在地（`js/locate-me.js`）

`requestFix()` が唯一の読み取り: 許可の事前確認（ブロック済みは待たずに `blocked`）、25 s の予算と
3 s 外側の見張り、理由 5 種（unsupported / blocked / denied / unavailable / timeout）。文言は持たない
——Atlas は自分の声で、地図のコントロールはインターフェースの声で言う。呼ぶのは view.locate・「現在地から…」・
`js/map-extras.js` の `IntMapLocate.start`（携帯の FAB と、方位磁針の下に足したデスクトップの `#btn-locate`
が押すもの）の 3 つ。`#btn-locate` は携帯の FAB と同じダートと 2 状態（中心が位置に乗っている間だけ `.on`）で、
見た目は `.compass-btn` をそのまま着る（同じ 42 px のガラスの円。規則を写さない）。
⚠ **記憶は持たせなかった**: 最初の版は最新の位置を入口をまたいで覚えたが、
`tests/atlas-geo-resolve-checks.test.mjs` R413 ⑤（拒否された GPS は何も返さない）が、別の入口の古い位置が
答えてしまう形を正しく赤にした。各入口が自分に許された再利用（Atlas の 5 分のキャッシュ等）を持つ。
⚠ **同じ要求で 2 回読まない**: view.locate は読み取った位置を `IntMapLocate.start({fly:false, fix})` に渡し、
`start` は渡された位置があればそれを描き、無ければ `requestFix()` で読む（以後の追従は従来どおり watchPosition）。
実測（Playwright の位置エミュレーション）: 1 回目の読み取りの直後に同じ文脈で 2 回目を読むと
**2 回目は永久に返らず**、点と精度円が描かれなかった（以前の実装も同じ二重読み取りだった）。

## 5. 起動予算

`eager.modules` 292 → 294: `js/installable-app.js`（`beforeinstallprompt` は読み込みごとに 1 回、条件を満たした
時点で飛ぶので、**起動時に評価されるモジュール**が先に聞いていないと受け取れない）と `js/locate-me.js`
（携帯の FAB とデスクトップの丸ボタンが起動時から押せるので、読み取りも起動経路に載る）。
`eager.gzip` の天井も `--update` で 1,529,748 → 1,538,268 に上げた。⚠ この差の全部がこの変更ではない:
この変更が eager に足したモジュールは描画後の長さで installable-app 3,946 B・locate-me 2,000 B（＋map-extras・
tile-warm・ui.en の数百 B）で、同じ測定には取り込んだ main（#865/#866）の分が含まれる——main 単体は測っていない。
raw は +14.5 kB（帯の内側）。

## 6. 検査の置き場所と、直した既存の検査

- 新しい spec ファイルは作らない（docs/TESTING.md の前例: 新しいファイルは未計測の p75 で core と全体の天井に
  課金される。実測、独立した spec にすると check:testbudget が core 1.1 / 0.4 分・全体 87.3 / 86.6 分で赤、
  check:docs の deep-tier-size も赤だった）。ブラウザの 5 本は `tests/smoke.spec.js` の末尾へ:
  ① Chromium 自身の `Page.getAppManifest` と `Page.getInstallabilityErrors`（空） ② view.locate が位置へ動かし
  同じ読み取りから点と精度円 ③ `#btn-locate` と `.on` ④ 拒否を拒否と言う ⑤ 殻を満たしてから `setOffline(true)`
  で開き直して通知、復帰で「再読み込み」。①〜④ は smoke の起動を使い、⑤ だけが Service Worker を許した自分の文脈で
  起動を払う（試験全体の設定が worker を塞いでいて、⑤ の主題が worker だから）。
- `node --test tests/installable-app-checks.test.mjs`（11 件）: manifest・アイコン・head の照合、install 条件と
  サブパスでの解決、maskable の安全域（実画素）、`vite-ignore` と STATIC_ASSETS、殻の導出と拒否、worker を
  評価して install／activate／オフラインだけの navigation／不変資産と SWR、requestFix の 5 理由、view.locate を実際に呼ぶ。
- 綴りを固定していた既存の検査を、振る舞いを測る形に直した:
  `tests/atlas-geo-resolve-checks.test.mjs` R413 ⑧（`+p2.coords.accuracy` の綴り → view.locate を端末の stub で呼び、
  返す `exec` と「現在地」への seed を確かめる）、`tests/assistant-panel-checks.test.mjs` #R155（`navigator.permissions&&…`
  の綴り → ブロック済みならセンサーに訊かない・拒否と取得不可を言い分ける、を実際に呼んで）、
  `tests/shell-compass-controls-checks.test.mjs` R480 ③（「行は 3 つ」→ 方位磁針は 3 行目で、そこから下の行は
  どれも丸い独立ボタン）。
- `tests/hazard-other-i18n-registry-checks.test.mjs` R223 ⑩ は「zh のキー数 ≥ en」だった——2026-09-11 の改正
  （CONSTITUTION §7: 新しい文は en+jp、他は床）以後に初めて en のキーを足したこの変更で 423 vs 428 と赤になり、
  方針が許すことを禁じていた。方針そのものに訊く形に直した: zh が書く言語なら en に追いつく、運ぶ言語なら
  `tests/i18n-coverage-floor.json` の keyed の床を割らない。
- `scripts/asset-report.mjs`: manifest を消費者として**発見**する（ページの `<link rel="manifest">` から）。
  無いと 512 px のアイコンが「生成スクリプトだけが名指す（build）」と分類されていた。
- `DECISIONS.md` の「Service Worker に navigation を持たせない」に、オフライン時だけの例外とその理由を足した。
