---
title: アプリ内の作例ギャラリー（検索欄の空の状態・すべて見る・Atlas の gallery）、作例を 8→16 本に、用途別ページ 2 本（ニュースを地図で読む／記事に地図を埋め込む）
date: 2026-10-03
---

〈依頼〉新しい入口と集客。作例（`s/` の 8 本）と授業ツアー（3 本）は about.html と teachers.html からしか辿れず、
アプリ本体に入口が無かった。初回の価値提示は自動のレイヤー巡回デモだけ。⇒ ①アプリ内の作例ギャラリー（自動では
出さない——初回ウェルカムカードは利用者の指示で撤去済み）②作例を 16 本に ③用途別ランディング 2 本。

## 0. 測った（着手前）

| 何 | 着手前 | 意味 |
|---|---|---|
| アプリから作例への入口 | 0（設定の「IntMap について」は外部ページへのリンク、`#btn-tours` はツアーのピッカーだけ） | 作例を開けるのは紹介ページと Atlas の `showcase` だけ |
| 検索欄の空の状態 | 何も出ない（`doGeocode({suggest})` は空の欄で結果欄を閉じる） | 読者がすでに行く場所が空いている |
| 撮影の実行 | `showcase-capture.mjs` が `#v=…&d=dl-nightside&tt=…` を書いて自分で拒否（world-1279） | 昼夜が既定で点く基本表示になってから、撮影は `d=` を消していなかった。基本表示も自分の箱で消すよう直した |
| カードの重さ | 18 枚のカードが 109〜241 kB（計 3.2 MB） | アプリ内で 1/5 の幅に描くのに全部を落とさせない ⇒ カードを縮めた 480×252 の縮小（16 枚で計 375 kB） |
| `dl-gdppc` を 2018 年で開く | 塗りは Maddison の実質 GDP（国の一覧が「2018 · real GDP (2011 int$)」）、凡例は「USD, nominal」 | 同じ画面で文と凡例が食い違う ⇒ 経済の作例は `dl-hdi`（凡例が自分の年と出典を述べる）に替えた。凡例の不一致は報告 |
| 1279 年の名前 | `hist-eras` の 1279 年の枚に Great Khanate / Ilkhanate / Chagatai Khanate / Khanate of the Golden Horde / Shogun Japan (Kamakura)。宋は無い（1279-03 の厓山で滅亡と整合） | 記録が答える見本（`RECORD_ANSWERED` に入った） |

## 1. 何を作ったか

- **`js/showcase-gallery.js`（遅延）**: `galleryItems()` が `SHOWCASE`（捕えたリンクと縮小のあるもの）を `TOPICS` の見出しで、
  `TOURS` を最初の見本の段の縮小で導く。検索欄に何も打たずに触れると結果欄（携帯ではシート）に 1 列のカード、最初の 1 文字で
  地名の候補に替わる。「すべて見る」・`data-im-gallery`・Atlas `panel.gallery` で全体（`IntMapDialog` の契約）。
  1 タップで見本は `openShowcase`（共有リンクの復元＋時計とレイヤーの読み返し）——**Atlas の `panel.showcase` も同じ関数**に
  した（復元と読み返しが 2 か所にあった）。ツアーは `tour-player.js` の `startTour`。
- **作例 8 本**（16 本に）: world-1279（モンゴル世界）・el-nino-2023（GHRSST 偏差 2023-12-15）・hdi-2022・population-density
  （GPW 2020）・night-lights（Black Marble 2016・朝鮮半島）・rail-gauges（OSM の軌間）・undersea-cables（経路は再構成で近似と明記）・
  world-heritage（文化／自然／複合）。どれも典拠が自分の日付を述べる記録か現在のスナップショットで、翌日に古くなる生の
  フィードは選ばなかった（写真が嘘になる）。画像はすべて `showcase-capture.mjs --serve dist` がビルドしたアプリから撮った。
- **用途別ページ** `news-map.html` / `embed-map.html`（と `ja/`）。埋め込みのコードは `embed-mode.js` の `embedUrl`・`iframeCode`
  を英雄の見本の捕えたリンクに当て、枠の題はアプリの `embedFrameTitle`——アプリが書かないコードは載せない。about から相互リンク。
- 撮影: `--serve <dir>`（この実行の間だけ serve.mjs を立てて PID で止める）・`--only a,b`・`--thumbs`・基本表示を消す。

## 2. 残したこと（外のファイル）

- `vite.config.js` の静的コピーに `news-map.html` と `embed-map.html` が要る（無いと本番に出ない。`landing-showcase-checks` ④が赤）。
- `index.html` の設定「IntMap について」に `data-im-gallery` のボタン 1 つ（委譲された click はもう `search-geocode.js` が聞いている）。
- `tests/map-state-store-checks.test.mjs` の `ADDRESS_SITES` から `js/atlas-cap-panel.js` を外す（直接の `history.replaceState` が
  `MapState.address` に移った＝減った）。
- ギャラリーのブラウザ検査（卓上で空の欄→カード→すべて見る→カードで地図、携帯でツアーのカード→授業モード）は 2/2 緑で
  走らせたが、新しい spec は p75 で課金されて core の天井を 0.7 分超えるので残していない。既存の起動（`landing-showcase.spec.js`）の中へ。
- `dl-gdppc` の凡例「USD, nominal」は、過去の年では Maddison の実質値を塗っている。

## 3. 上げた天井と、記録し直したもの

- `check:perf`: async chunk `tours`（`showcase.js` と `tours.js`）を 23.0 → 31.6 kB。増えたのは作例 8 本の文（en+jp の題・説明・問い）と
  捕えたリンク・画像の欄で、Atlas・ツアー・用途別ページ・ギャラリーが**同じ 1 つの宣言**を読む。ギャラリーの chunk へ寄せると
  正本が 2 つになるので寄せなかった（ギャラリーだけが読む `TOPICS` は約 0.1 kB で、`landing.mjs --check` も読む）。
- `check:surface`: `showcase-gallery.js` の大域の読み 4 つを記録（`--update`）。`IntMapSafe`（2）は持ち主 `safe-html.js` が静的ページ 2 枚から
  bundler 無しで読まれるため `export` できない（1 つの関数を経由させると `check:static` の safe-output / output-taint が符号器と認めない）。`IntMapDialog`（`dialog.js`）と `IntMapI18N`（`i18n.js`）は
  持ち主がまだ export していない（`module-graph.mjs --plan`）——持ち主を書き換えるのはこの作業の外。`tour-player.js` と同じ読み方。
- cassette `rail-request-reached-nothing` を `--write` で記録し直した。「rail directions」の順位から `routing.isochrone`・`layers.railAxis`
  が落ちたのは別名の変更ではなく、作例 `rail-gauges` の題で「about-and-showcase」の節が語 rail を持ち、rail を持つ節が 4 → 5 に
  なって `DOC_TERM_MAX_DF`（4）を超え、rail が文書の証拠として 0 点になったため（main では 3 点）。判定（fail・reach/operations）は不変。
- 入口の数え上げ（`usage-count/shape.js` の `SITE_PAGES` と `entry`）に `news-map`・`embed-map` を足し、`entry` の `maxDims` を 5 → 7
  （閉じた次元の `maxDims` はその大きさ）。admin の成長タブにその 2 つの札。⚠ Edge Function `usage-count` の再配備が要る。

## 統合時の性能予算

main へ重ね直したあとの build で、超えた 3 行だけを `--update` で上げた。eager.gzip 1523.9 → 1532.8 kB と eager.requests 9 → 10 は、検索欄の空の状態にギャラリーの入口が加わったぶん。async.gzip 3774.0 → 3795.8 kB は、作例 8 本の文と js/showcase-gallery.js のぶん。
