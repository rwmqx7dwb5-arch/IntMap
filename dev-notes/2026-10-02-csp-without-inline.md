---
title: 全ページの script-src から 'unsafe-inline' を外す——インラインの script は本文の sha256 で 1 本ずつ許し、39 個のインラインのイベント属性を宣言済みの名前付き操作に置き換え、CSP の無かった 20 ページに CSP を足す
date: 2026-10-02
newsen: Stricter security on every page: no inline script may run unless it is the exact one IntMap ships.
newsjp: 全ページのセキュリティを強化し、IntMap が配ったものと一致しないインラインのスクリプトは実行されないようにしました。
---

〈依頼〉構造改革（2026-10-02）の一部。監査: `index.html` の CSP の `script-src` に `'unsafe-inline'` と
`'unsafe-eval'`、inline script が 7 個、`connect-src`・`img-src`・`frame-src` は `https:` 全許可。
作るもの: inline script をハッシュで許して `'unsafe-inline'` を外す／`connect-src`・`img-src` を外部ホストの
台帳から生成できるか評価する／戻ったら赤くなる門。

## 0. 測った

- **配信する HTML は 22 ページ（＋Search Console の 1 行ファイル）、CSP を持つのは 2 ページだけ。**
  `index.html`（`'unsafe-inline' 'unsafe-eval'`）と `admin.html`（`'unsafe-inline'`）。about・teachers・
  共有ページ 8 本（en と ja）・privacy・terms・science・sources は **policy そのものが無かった**。
- **`'unsafe-inline'` を外すと壊れるもの**は inline script（ハッシュで救える）だけではなかった。
  `js/` のマークアップを組み立てる文字列に**インラインのイベント属性が 39 個**（companies-ui 16・
  countries-ui 9・analysis-world-events 5・app-body 4・cameras 2・atlas-reply 1・news-ui 1・tool-panel 1）。
  ハッシュは `<script>` 要素しか許さず、属性には `'unsafe-hashes'` が要り、`_coSfSetKey(${i},this.value)` の
  ように実行時の値を含む属性は定まった本文を持たない。しかも **ハッシュを 1 つでも書いた瞬間に
  ブラウザは `'unsafe-inline'` を無視する**ので、属性が 1 個でも残っていれば「ハッシュを足すだけ」も壊れる。
  （最初の数え方は 42 で、3 個は註の中の綴りと変数名だった——門は註を数えない `codeOnly` で数える。）
- **nonce は使えない。** GitHub Pages は応答ごとに値を変えられない（静的配信・ヘッダ不可）。静的ファイルの
  nonce は誰でも読める定数。
- **`index.html` の inline script の本文はビルドが変える**（`__INTMAP_BUILD_STAMP__` を
  `scripts/build-stamp.mjs` が埋める）。ソースの本文のハッシュは配信物では誤り。
- **このマシンの作業ツリーは CRLF、CI は LF。** HTML の tokenizer は CR LF を LF にしてから script の本文を
  作るので、ハッシュは LF に正規化した本文で取る（`tests/csp-without-inline-checks.test.mjs` ②）。

## 1. inline script はハッシュで、人が書かない

`scripts/csp.mjs`:
- `inlineScripts(html)` — パーサが見る script だけ（`<!-- -->` の中の `<script>` という綴り・
  `application/ld+json` のデータブロック・`src` 付きは数えない）。
- `withInlineHashes(html)` — `script-src` の sha256 をそのページの inline script のハッシュに**置き換える**
  （古いものは消える・冪等）。
- `cspHashesPlugin()` — `vite.config.js` の**最後の**プラグイン。`transformIndexHtml`（`order:'post'`）で
  スタンプ入りの本文から導き、`closeBundle`（`order:'post'`）で `dist/` の全ページにもう一度かけ、まだ
  `'unsafe-inline'` を持つページがあれば**ビルドを落とす**。
- 逐語コピーのページ（admin・privacy・terms・science・sources）は `node scripts/csp.mjs --write` がソースに書く。
  紹介・授業・共有ページは `scripts/landing.mjs` が生成時に書く（CSP もそのページが実際に読むものから導く——
  Google Fonts は日本語版だけが読むので、日本語版の `style-src`/`font-src` にだけ載る）。

## 2. イベント属性は「名前」にする

`js/inline-actions.js`（新規・`src/main.js` が描画より前に import）:
`onclick="_coSfRemove(${i})"` → `data-im-click="coFilterRemove" data-im-arg="${i}"`。
`window` の capture に、event ごとに 1 つのリスナ。capture を選んだのは、inline 属性がターゲットで走って
祖先の bubble より先だった順序を保つためと、bubble しない `error`（`<img data-im-error>`）を拾うため。
- 語彙は **`ACTIONS` 1 か所**。属性の文字列で `window[...]` を引く汎用実行器にはしない——それは注入された
  名前も実行する。未知の名前は拒んで `window.__imErrors`（Bug Report が添付する ring）と console に記録。
- `data-im-arg` はデータ。添字は非負整数でなければ拒む（`'2);alert(1'` は `bad-index`）。語は列挙した
  ものだけ（`places`/`events`、`mil`/`tech`/`maritime`/`geo`、`min`/`max`）。
- 呼ぶ関数は属性が呼んでいた window 関数そのもの——挙動は動かしていない。`js/app-body.js` は compare 系を
  含む 4 個だけの最小差分。

## 3. CSP の無かったページに CSP を足す

各ページが**実際に読むもの**から: 自オリジン＋（読むページだけ）Google Fonts。`connect-src 'self'`・
`frame-src 'none'`。`style-src` の `'unsafe-inline'` は style 属性を書くページにだけ——privacy と terms は
`js/legal-text.js` の見出しが、science は KaTeX が glyph ごとに style 属性で位置を決める。sources と
紹介・共有ページは書かないので持たない。

## 4. connect-src / img-src を台帳から生成できるか——できない（評価の記録）

`scripts/outbound-hosts.json` は 176 ホストを持つが、policy にはならない:
1. 記事リーダーは**出版元のページを直接読む**（`js/article-reader.js` の `direct:true`）——ニュースが
   リンクするどのホストでもありうる。
2. ウェブカメラの画像とパノラマの枠は **OSM で誰でも書ける URL**、ニュースのサムネイルはフィードの URL。
3. ホストを**実行時に組み立てる** URL が 7 本（511 の交通カメラのドメイン・OSRM のプロファイルなど。
   `node scripts/outbound-hosts.mjs` が印字する）。
4. 台帳は `https?://` しか読まないので **scheme も WebSocket も持たない**。`wss:` は Supabase Realtime
   （URL は `SUPABASE_URL` から実行時に組み立てる）と `wss://stream.aisstream.io`（読者自身の AIS キー）に
   届いていて、台帳はどちらも発見しない。
⇒ `index.html` の `connect-src`・`img-src`・`frame-src` は `https:` を残す。外部へ何も取りに行かない
ページ（admin・読み物・紹介）は使うものだけを書く。
⚠ 4 の副産物: **`stream.aisstream.io` は台帳にもプライバシー本文の照合にも入っていない**（`outbound-disclosed`
は http(s) の URL しか発見しない）。この作業の範囲外なので直していない。

## 5. 門

- `npm run check:static` の規則 `script-policy`（新しい `check:*` は足していない）: CSP の無い HTML ページ・
  `script-src` の `'unsafe-inline'`／`'unsafe-hashes'`・ハッシュの不足（ブラウザが拒む）と余り（消えた本文への
  許可）・配信物のどこかのインラインのイベント属性（マークアップと、マークアップを組み立てる文字列・
  テンプレートの中。註は数えない）・`data-im-*` の名前が宣言に無い／event が違う／式で書かれている／
  宣言が使われていない。データの束（数十 MB）は `on…=` を含まなければ走査しない。
- `tests/csp-without-inline-checks.test.mjs`（9 件）: 各規則に欠陥を食わせて赤を確かめ、`index.html` の
  ソースのハッシュがスタンプを埋めると古くなること・プラグインが直すこと・それが最後のプラグインで
  あることを確かめる。
- `tests/security.spec.js` に 2 件: ビルドしたページを、最初のバイトより前に `securitypolicyviolation`
  の記録器を入れて開く。**アプリの起動で違反 0 件**、注入した `<img onerror>` は動かずに違反として
  記録される、宣言した操作は子要素のクリックでも 1 回走る、宣言に無い名前は拒まれて記録される。
  admin・紹介／授業（en・ja）・privacy・terms・science・sources で違反 0 件、共有ページはリダイレクトの
  前にブラウザの console に拒否が出ないこと。
  変異で確かめた: `dist/sources.html` のハッシュを 1 文字変えると `script-src-elem inline … sources.html:62`
  が記録されて赤。

## 6. 起動費用

`check:perf` の `eager.modules` を 299 → 300 に上げた（`perf-budget.mjs --update`、上がった行はこれだけ）。
増えた 1 つは `js/inline-actions.js`——属性を持つ要素が描画される前に聞いている必要があるので、遅延読み込みに
できない（`<img data-im-error>` は挿入された瞬間に失敗しうる）。中身は語彙の表と 3 つの `addEventListener`。

## 7. 検査

段 0〜2 の結果は PR の本文に書いた。`smoke.spec.js` を `landing-showcase.spec.js` と 2 worker で走らせた
とき `time-compare-lapse ①` が 1 回時間切れ（3.6 秒待ちの後の `timeState()`）——単独では 2 件とも緑。
この作業は compare に触れていない。
