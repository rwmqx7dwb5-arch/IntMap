---
title: 地図を他サイトへ埋め込めるようにした（?embed=1・共有パネルの「埋め込み」タブ・Atlas の share がリンク／コードそのものを返す）——共有カード（og:）は Supabase が HTML を返させないので作らなかった
date: 2026-10-01
---

〈依頼〉 商品の流通経路を作る: ⑴ `?embed=1` の読み取り専用の埋め込み表示 ⑵ 共有パネルに埋め込みコードを作るタブ
⑶ 共有リンクを SNS に貼ったときに地図ごとの題と画像が出るソーシャルカード（Edge Function `share-card`）
⑷ Atlas の配線 ⑸ 共有カードが保存するものを privacy / terms に。

## 0. 測った

- **埋め込みの手段は 0。** `embed` の grep は 0 件。共有リンク（`js/map-ui.js` viewHash の `#v=…`）は位置・投影・
  基図・全レイヤー・時刻・比較・シミュレータの入力まで運べるのに、iframe に入れる形が無かった。
- **枠の設定（2026-10-01・本番）**: `curl -I https://rwmqx7dwb5-arch.github.io/IntMap/` は `Server: GitHub.com`・
  `Access-Control-Allow-Origin: *` を返し、**`X-Frame-Options` も `Content-Security-Policy` ヘッダも無い**。
  `index.html` の CSP は `<meta>` で、`frame-ancestors` は `<meta>` では無視される（仕様。`index.html` の注記どおり
  書いていない）。⇒ 今日すでにどのページも IntMap を枠に入れられる。埋め込みが新たに許したものは無い。
- **Supabase Edge Function は HTML を返せない。** 公式文書（`apps/docs/content/guides/functions/http-methods.mdx`、
  2026-10-01 取得）:「HTML content is not supported. `GET` requests that return `text/html` will be rewritten to
  `text/plain`.」独自ドメインの例外も書かれていない。⇒ ⑶ の「crawler には og:/twitter: の meta を持つ HTML、人には
  リダイレクト」は、`*.supabase.co` の上では crawler に HTML として届かない（Facebook・Slack・Discord 等の unfurl は
  `text/html` を要る）。`application/xhtml+xml` や SVG で書き換えを避ける手は**プラットフォームの意図の回避**なので
  採らない。**⑶（と、⑶に依存する短縮 URL・⑸ のカード保存の記載・migration）は作っていない**——作れば
  「誰にも読まれない meta を返す関数」というハリボテになる（`AGENTS.md` §3-3）。選択肢は最終報告に書いた。
- **共有リンクが NATO・EU・ウクライナ・米大統領選の層を含むと、`v=` が失われていた（既存の欠陥）。**
  `#v=15.0000,50.0000,3.00,0,0,f&l=dl-nato` を開くと `#v=-48.1019,54.7064,1.20` に落ち着く。原因は viewHash の
  復元ループが箱に `__imRestored` を付けずに `change` を配っていたこと——`js/layer-home.js` はそれを「読者が点けた」と
  読んで自分の範囲へ飛ぶ（`js/session-tabs.js` の復元は付けている）。埋め込みはこのリンクそのものなので直した。

## 1. 埋め込み表示（`js/embed-mode.js`）

- **文法は共有リンク＋1 つ**: `?embed=1`（`&interactive=0` で静止画）。地図の状態の 2 つ目の符号化は無い。
  書き手は `embedUrl`、早い読み手は `index.html` の最初の script（`<html data-embed>` を立てる。最初のフレームを
  決めるので module より前に要る）。両者の一致は検査が**その script の本文を評価して** `embedFlags` と突き合わせる。
- **残すものの一覧で書く CSS**（`EMBED_CSS`）: 地図・凡例（`js/data-layers.js` が凡例として扱う
  `.data-legend` / `.koppen-legend`）・クレジット（`#map-credit` と地図内の `.map-credit-view`）・起動画面・上端右の帯。
  それ以外は名指さずに隠れる。⚠ クレジットは削らない側にあり、狭い枠でも省略記号で切らず折り返す（480×320 で
  枠内に全部収まり `scrollWidth <= clientWidth` を spec が測る）。携帯レイアウトの `position:fixed` の地図は、
  シートが無いので卓上と同じ「地図の下にクレジット」の積み方に戻す。
- **読み取り専用**: 読者の（`isTrusted` の）click・右クリック・ダブルクリック・change・input・キーを document の
  capture で止める——地図のポップアップ・道具・凡例のスイッチ（× / 表示切替 / 年）に届かない。パン・ズーム・
  ダブルクリックのズームは通す。⚠ **合成イベントは通す**: 共有リンク復元は `change` の dispatch と `button.click()`
  で層・投影・基図を戻すので、それを止めると「何も描かれない埋め込み」になる（実装中に一度その形を書いて気づいた）。
- **帯**: 時計の瞬間（ライブ／日付。紀元前は `IntMapHistScale.dateText` が唯一の持ち主）と「IntMap で開く」
  （`target=_blank rel=noopener`、その時点のアドレスから `embed` を外したもの）。
- **起動費用**: 通常の起動はこの module を読まない。`src/main.js` は `data-embed` のときだけ動的 import し、共有パネルは
  開いたときに取りに行き、Atlas の `share` は遅延カーネルの中から import する。`js/atlas-loader.js` のデスクトップの
  Atlas 暖機（658 kB）は埋め込みでは走らない（同じ属性に訊く）。

## 2. 共有パネル・Atlas

- 共有パネルは **リンク／埋め込み** の 2 タブ。どちらも `IntMapBookmark.link()` を 1 つの値として読む。埋め込みタブは
  大きさ（`EMBED_SIZES` の 4 つ。選択肢の文字は数そのもの）・パン／ズームの可否・コード・コピー・プレビュー。コードは
  変更のたび・コピーのたびに**現在の地図から**作り直す。プレビューはそのコードを本物の iframe で起動する（押したときだけ・
  閉じると破棄）。`open()` は埋め込みタブが組み上がると解決する Promise を返す（既存の呼び手は戻り値を使わない）。
- Atlas `share`（`panel.share`）は開いて「✓ 共有パネル」と言うだけだった。**作ったリンク／`<iframe>` コードそのもの**を
  結果に載せ（`embed`・`size`・`width`/`height`・`interactive`）、パネルを同じタブで開く。schema の `size` の enum と
  `width`/`height` の上下限は `EMBED_SIZES` / `EMBED_PX` から読む。

## 3. 埋め込みで走らせない起動時の仕事——判定は 1 か所

「埋め込みか」に答えるのは **`js/ui-device.js` の `embedded()` だけ**（`<html data-embed>` を読む。画面について
の 3 つ目の問い——①レイアウト ②端末 ③提示）。起動の入口がそれぞれこれを訊く:

| 入口 | 埋め込みでは |
|---|---|
| `src/main.js` | 埋め込み表示（`js/embed-mode.js`）を取りに行く**のはこのときだけ** |
| `js/app-body.js` の `_sessUI` | 左右どちらのサイドバーも開かない（開いた Layers パネルはサムネイルを買う） |
| `js/app-body.js` の `bootSupabase()` | 走らない（サインイン・geo_pins・dashboard_cards・お気に入り・コミュニティ・realtime） |
| `js/session-tabs.js` | 既定タブを開かない・保存したセッションを読まない・書かない（同一オリジンのプレビュー枠が読者の IntMap を書き換えない） |
| `js/widgets.js` | ウィジェット板を出さない |
| `js/layer-previews.js` | サムネイル列の自動の開放をしない（`kick()` はそのまま） |
| `js/atlas-loader.js` | デスクトップの Atlas 暖機をしない |
| `js/mobile-ui.js` | シートの camera padding は 0（2 か所に書き写されていた式を `sheetCovers` 1 つにした） |

検査は「この 7 ファイルが `embedded()` を呼ぶ」ことと「それ以外の js/・src/ が query や属性を自分で読まない」ことを測る。

**実測（build・hermetic・1280×800・20 s）**: 外部への要求は アプリ 178 本 → 埋め込み 124 本、同一オリジン 68 → 26 本。
Supabase（15 本）・ウィジェット（Wikipedia・為替 2 本）・レイヤーパネルのサムネイル（GIBS 8・Open-Meteo・NOAA オーロラ・
OpenRailwayMap・OpenSeaMap）が消え、World Bank は 41 → 6 本。
⚠ **残した 6 本は画面に出る**: `refreshStatsLatest`（`js/wb-layers.js`）の 4 指標と `loadGdpPPP` の 2 本は
`countryStats` を書き、1 人当たり GDP などの国の塗り分け（`js/data-layers.js` `applyChoro('gdppc', s=>s.gdppc)`）が
それを読む。止めると、埋め込んだ塗り分けがアプリより古い値を描く。地形（タイル）と国境（Natural Earth）も地図そのもの。

## 4. 共有リンク復元の 3 つの欠陥（landing-showcase が見つけた・再現してから直した）

- **復元中の 2 本目のリンクが捨てられていた。** `restoring` の 3.5 s の間、hashchange の受け手は `return` していた。
  実測: 0.8 s 差で 2 本貼ると、地図は 1 本目（30,10）・アドレスは 2 本目（-60,-10）。⇒ 覚えておき、1 本目の段取りが
  終わったときにその時点のアドレスで復元する（何本貼っても最後の 1 本）。同時に走らせないのは、700/900/1800/3200 ms の
  段取りが 2 組交ざるから。
- **`tt` の無いリンクが時計を「今」に戻さなかった。** 1990 年に立っているタブへ `tt` 無しのリンクを貼ると、カメラと層は
  変わり時計は 1990 のまま（アドレスは `#v=20,40,4…&tt=1990-06-15`＝貼ったのとは別の地図）。`encode()` は時計が live で
  ないときだけ `tt` を書くので、**無いことは「今」という主張**——完全な復元は `setNow` する。⚠ `js/session-tabs.js` の
  保存年の復元も同じ 900 ms に時計を動かしていたので、アドレスが地図の状態（`v=`）で開いたときはリンクに譲る
  （`IntMapBookmark.carriesState()`）。素の URL で開けば従来どおり保存した年に戻る。
- **気象レイヤーが 1 つも点いていないのに予報時刻をリンクに書いていた**（`js/weather.js` `shareIO`）。実測:
  `dl-ec-*` は全部 OFF、`IntMapECMWF.setIndex(nowIndex()+3)` で `s={"weatherEC":{"t":…}}` が付いた。他の欄と同じく
  「層が点いているときだけ」書く。（同じ関数の `wo` は読む要素 `#op-wind` がどこにも無いので書かれることが無い。触っていない。）

## 5. 起動費用（実測。同じ機械で origin/main と並べて build）

| | origin/main | この変更 | 差 |
|---|---|---|---|
| eager raw | 4,677,497 | 4,681,310 | **+3.8 kB** |
| eager gzip | 1,536,655 | 1,537,963 | **+1.3 kB** |
| eager modules / requests / CSS | 292 / 9 / 360,358 | 同じ | 0 |
| async gzip | 3,810,259 | 3,815,093 | **+4.8 kB**（`embed-mode` チャンク 9.9 kB raw・カタログ文・jp の文言） |

main 自体がこの機械で帯の端にあり（eager gzip 1500.6 / 天井 1493.9＋帯 7.5）、この変更の増分で帯を越えたので、
`node scripts/perf-budget.mjs --update` で **eager.gzip と async.gzip の 2 行だけ**を上げた。買ったもの: 共有パネルの
タブ（eager 側に残るのはタブの切り替えと英語の文言だけ——埋め込みタブの中身・埋め込み表示・その CSS は全部非同期
チャンク）と、通常起動が読まない埋め込み表示。

## 6. 共有窓口に足した辺（`check:surface`、`--update` 済み）

`window.IntMapDevice` +11（上の表の 8 入口の `embedded()`——`js/ui-device.js` は classic の形で export を持たない）、
`window.IntMapBookmark` +1（`js/session-tabs.js` の `carriesState`）、`window.IntMapI18N` +2（`js/embed-mode.js`：現在の
言語と表——import できる持ち主が無い）、`window.IntMapHistScale` +1（`dateText`——export しない）、`globalThis.IntMapSafe`
+2（唯一の符号化器——classic の形）。Atlas の `share` が `window.IntMapShare` を読む回数は 2 減った。

## 7. 残したもの

- **⑶ ソーシャルカード**は §0 の理由で未着手（関数・migration・privacy/terms の記載も無し）。
- 共有パネルが右の Layers パネルの下に隠れていた既存の欠陥は直した（`--lsr-w` を引いた可視の地図の中央に置く——
  他の重なり物と同じ読み方）。左のフロスト型サイドバーとの重なりは今回測っていない。

## 8. 検査

- `tests/share-embed-distribution-checks.test.mjs`（node, 12）: 文法・URL の往復・iframe コードの符号化と http(s) 以外の拒否・
  大きさの表と上下限・Atlas `share` を評価・CSS が残す側の一覧・en/jp の文言・head script の評価・通常起動が静的 import
  しない・`embedded()` を評価し、入口が全部それを訊き、他が switch を自分で読まない。
- ブラウザは**新しい spec を作らず** `tests/restored-layer-before-style.spec.js`（共有リンクが何を復元するか、が主題）に
  1 本足した（`check:testbudget` の天井に余白が無い）。アプリを 1 回起動し、共有パネルのプレビュー＝読者がコピーする
  コードそのものを 2 回起動して読み返す: 480×320 の枠で全点が地図／凡例／クレジット／帯・クレジットが枠内で切れない・
  `v=`/`l=`/`tt=`・Atlas カーネル無し・padding 0・地図クリックが renderer に届かずドラッグはパン・静止画は動かない・
  パネルと Atlas が渡す値・NATO を含むリンクが `v=` で開く・予報時刻・`tt` 無しは「今」・2 本目のリンク。
