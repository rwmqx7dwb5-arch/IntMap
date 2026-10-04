---
title: プレスルーム——記者・ブロガーが「サイトの上で」辿り着ける資料室(press.html)。説明文はブランドの正本のまま、コピー・数字・ロゴとスクリーンショットのダウンロード
date: 2026-10-04
newsen: A press room page now collects what to quote, the facts and where they come from, and the logo and screenshots to download, for anyone writing about IntMap.
newsjp: IntMap について書く人のために、引用できる説明文・数字とその出典・ダウンロードできるロゴとスクリーンショットをまとめたプレスルームのページを追加しました。
---

〈依頼〉記者・ブロガー向けの公開ページ。プレスキットは `docs/marketing/press-kit.md`（リポジトリ内の文書）だけで、
記事を書く人がサイトの上で辿り着ける場所が無かった。

## 何をしたか

- `press.html`／`ja/press.html` を `scripts/org-pages.mjs` に 1 ページ足した（`ORG_NAV` に `press`。ナビ・全ページの足元・
  `PAGES` はこの 1 行から導かれる）。landing.mjs は紹介・授業・開発者用、org-pages は「組織・相談者が行き着く先」で、
  報道機関向け・相談の窓口と同じ族なので後者に置いた。
- 説明文（一言・短・中・長）・ポジショニング・裏付け文は `brand.mjs` の `words()` が埋めたものをそのまま運ぶ（写しでなく導出）。
  数（時計の下限・スナップショット・レイヤー・言語）は `brand.mjs` の `factWords()`（今回 export しただけ）。ページ専用の文は
  `org-pages-text.mjs` の `press`。コピーのボタンは `js/org-page.js` の `wireCopy()`（ボタンは `hidden` で出し、スクリプトが
  動いたときだけ見せる。「コピーしました」はクリップボードが受け取ってから言う）。
- ダウンロードは実在のファイルだけ: `IntMap.Icon.png`・`icons/icon-512.png`・`icons/apple-touch-icon.png` と、`js/showcase.js`
  の撮影済みスクリーンショット全件。大きさ・容量はファイルから読む。`vite.config.js` には `press.html` を足しただけ。
- `for-newsrooms.html` に「IntMap について書く方へ」の節を足して相互にリンク（役割は分けた: あちらは地図を記事に埋め込む窓口、
  こちらは記事を書く資料室。数は写していない）。
- **sitemap.xml に組織向けページが 1 つも載っていなかった**（`scripts/landing.mjs` の `sitemap()` は自分の `PAGES` しか回していなかった）。
  press だけ手で足さず `ORG_NAV` から導くようにした——for-newsrooms ほか 7 ページも載るようになった。

## 載せなかったもの（と理由）

- `og-image.jpg`: 以前の画面（`docs/marketing/README.md` A4）のままで、いまの時計の主張と食い違う。撮り直したら足す。
- `IntMap.Icon_BW-inverted.png`（明るい地用マーク）: ビルドは Rollup が hash したコピーしか配らない（`vite.config.js` STATIC_EXCLUDE の注）。
  配ると 206 kB を二重に出荷する判断になるので、利用者の判断を待つ。

## 検査

`tests/press-room-checks.test.mjs`: ① 説明文が brand-text の文字列と一致・コピーボタンに的がある ② 数が持ち主のもの ③ ダウンロードが実在し
ビルドが配る・他のリンクが解決する ④ hreflang の対と sitemap ⑤ ナビ・足元・for-newsrooms から辿れる ⑥ メールアドレスも個人名も無い。
