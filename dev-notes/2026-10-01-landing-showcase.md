---
title: 紹介ページ・授業ページ・見本の地図 10 件を作った——ページは文・見本・事実の持ち主から生成し、見本のリンクと画面写真はビルドしたアプリ自身に作らせ、全見本を開いて「その日付に、その国名が地図にあるか」を地図に訊く。作る途中で、共有リンクの復元が 3 つの形で宣言どおりに開かないことを実測した（NATO の行がカメラを奪う・復元中の 2 本目のリンクを捨てる・tt の無いリンクが時計を戻さない）
date: 2026-10-01
---

〈依頼〉「求めるのは改善ではなく商品開発・マーケティング・営業」（2026-10-01 利用者の回答）。顧客層は未決定、
調査の推奨は ① 地図・歴史好きの一般層 ② 歴史・地理の教員（日英）。ランディングページ、見本の地図ギャラリー、
教員向けページ、SEO（sitemap・robots・各ページの meta と JSON-LD）、アプリと Atlas からの導線、PRODUCT.md の
商品化方針の節。主張はすべて製品の実体と照合し、開発中の機能は書かない。

## 0. 測った——何年まで遡れて、何が描かれるか

- 時計の床は `js/hist-scale.js` `FLOOR = -122999`（紀元前 123,000 年）で、`data/hist-eras.js` の最初の
  スナップショットと同じ年。スナップショットは 54 枚。国境は 1689 年より前がそのスナップショット、
  1689〜1885 年が OpenHistoricalMap（`HB_MIN/HB_MAX`）、1886〜2019 年が CShapes 2.0（`CS_MIN/CS_MAX`）。
  調査が提案した「紀元前 3000 年から」は過小で、ページは床を持ち主から読んで書く。
- 西暦 117 年（トラヤヌスの最大版図）を指しても、地図は西暦 100 年のスナップショットを描く（ラベルの集合が
  同一）。「ローマ帝国最大版図の年」を題にすると主張が地図とずれるので、題は「西暦100年の世界」にした。
- 1900 年の日本（`node scripts/hist-fidelity.mjs --year 1900 --in 128,30,146,46`）: 滋賀県（OHM）＋45 の府県
  （穴埋め・1881-02-07 から）。令制国 0。廃藩置県 1871-08-29・香川県の再置 1888 と矛盾しない。国の層は
  Japan・Taiwan (Japan)・Korean Empire（1897–1910）。⚠ 府県の**輪郭**は現代の区分を遡らせた穴埋めなので、
  見本の文は「府県で区切られている」までしか言わない（境界が 1900 年のものだとは言わない）。
- 1914-06-27 の欧州は Austria-Hungary・Serbia・Montenegro・Ottoman Empire・Germany・Russia を持つが、
  この視点では Germany と Russia のラベルが衝突で出ない。文は**見えている**名前だけで書いた。
- 1920-07-01 は Poland・Czechoslovakia・Finland・バルト 3 国・Austria・Hungary。⚠ CShapes は 1920 年の
  セルブ＝クロアート＝スロヴェーン王国を「Yugoslavia」と綴る（国名は 1929 年）——文には出さない。
- 今週の地震（`bx-eq`）は共有リンクが運べない（manifest の `share` が無い）。見本に入れていない。

## 1. 作ったもの

- `js/showcase.js` — 見本 10 件の宣言（視点・日付・レイヤー・ベースマップ・`LA(en, jp)` の題/説明/問い・
  学習指導要領の項目・`drawn`＝文が依拠する国名と行政区分）。生成領域 `CAPTURED` にリンクと写真。
- `scripts/showcase-capture.mjs` — ビルドしたサイトを実ネットワークで開き、アプリ自身のボタン・チェック・
  カメラ契約・Chronos で宣言どおりの状態を作り、`IntMapBookmark.link()` を読んで同じ瞬間に撮る。
  宣言に無い状態（`s=` など）を符号化したリンクは書かない。
- `scripts/landing-text.mjs`（文・en+jp）と `scripts/landing.mjs`（生成器と門）→ `about.html`・`teachers.html`・
  `ja/about.html`・`ja/teachers.html`・`sitemap.xml`・`robots.txt`。数字（床・スナップショット数・国境の帯・
  レイヤー数 174）、サイトの住所（`index.html` の `og:url`——新しい綴りを作らない）、寄付リンク
  （`js/app-body.js`）はそれぞれの持ち主から読む。言語は別 URL（hreflang）、全文が HTML にある。
- 授業ページ: 50 分の 5 段の手順、見本と問い、高等学校学習指導要領（平成30年告示）の見出しとの対応。
  見出しは文部科学省の PDF（2026-10-01 取得・`pdftotext`）から引用し、対応は「IntMap の提案」と明記した。
- 設定 ▸ 情報とサポートに「IntMap について」。Atlas に `panel.about`（ページへのリンク）と `panel.showcase`
  （見本を地図に開き、日付と宣言したレイヤーを**読み返してから** completed）。catalogue の一覧は
  `SHOWCASE` から作る。
- `PRODUCT.md` §2.4 商品化の方針（利用者の回答のまま）と §3.5、現状仕様 §8.6。

## 2. 作る途中で実測した製品側の欠陥（直していない——担当範囲の外。報告した）

1. **NATO（`dl-nato`）を点ける共有リンクは、リンクの視点で開かない。** `js/layer-home.js` は初回の
   有効化で NATO を枠に収め、セッション復元のときは `__imRestored` の印で飛ばない。共有リンクの復元
   （`js/map-ui.js` `restore()` の `apply`）はその印を付けない。実測: 1985 年の見本で経度 16 → 80.1。
   EU・米大統領選・選挙・ウクライナ前線の行も同じ形のはず。⇒ 見本からは NATO を外した。
2. **復元中（3.5 秒）に貼った 2 本目のリンクは黙って捨てられる。** `hashchange` の受け手が
   `if(restoring) return;`。実測: 1942 年の見本の直後に 1985 年のリンクへ移ると、時計は 1942-11-01 のまま。
3. **`tt` の無いリンクは時計を「今」に戻さない。** `encode()` は live のとき `tt` を書かず、`restore()` は
   `tt` が無いと時計に触れない——同じタブで過去の地図から「今」のリンクを開くと過去のまま。
   Atlas の `panel.showcase` は「今」の見本で `setNow` を自分で呼ぶ。
4. **ECMWF のモジュールが、気象レイヤーが 1 つも無いのに予報時刻を共有リンクへ書くことがある**
   （`js/weather.js` `shareIO().get` の `o.t`）。同じ見本の 2 回の撮影で一方だけに `s={"weatherEC":{"t":"2026-10-01T14:00Z"}}`。
5. 画面で見えたもの: プレート境界の凡例の題が英語 UI で「プレート境界」。1985 年の NATO 凡例が「32 members」
   （今日の数）。1950 年の朝鮮半島の地図で日本の府県名ラベルが何度も繰り返される。1914 年の欧州で
   「Netherlands」がドイツの上に置かれる。

## 3. 検査

- `tests/landing-showcase-checks.test.mjs`: 生成物が生成器と一致・捕えたリンクが宣言と一致（日付・パラメータ・
  レイヤー・カメラのずれをそれぞれ入れると落ちることも確かめる）・en/jp が同じ鍵・ページの数字が持ち主の値・
  ページが名指す資産が全部 dist/ へ写る・sitemap・Search Console のファイル・設定の導線・Atlas の一覧。
- `tests/landing-showcase.spec.js`（ヘルメティック）: 10 件を全部開き、時計・カメラ・レイヤー（と描画）・
  `drawn` の国名と行政区分を地図に訊く（30.8 秒・1 起動）。4 ページのリンク・画像・アンカー、320/390 px で
  横スクロール無し、日本語を選んだ読者だけが ja/ へ移ること。

## 4. 費用（同じ機械で HEAD をビルドして比べた）

このチェックアウトは CRLF なので、`check:perf` の天井（main の LF ビルドで測った値）とは直接比べられない
（HEAD そのものが eager raw +9.1 kB・async gzip +16.6 kB と出る）。`git archive HEAD` を同じ機械でビルドして比べた:

| | HEAD | この変更 | 差 |
|---|---|---|---|
| eager raw / gzip | 4566.6 / 1500.1 kB | 4567.0 / 1500.2 kB | +0.4 / +0.1 kB（設定のリンク 1 行と ui の 2 鍵・能力表の 2 行） |
| `atlas-console` チャンク raw / gzip | 1,112,009 / 414,501 B | 1,126,288 / 420,262 B | +14.3 / +5.8 kB |

起動費はほぼ動かない（紹介ページはアプリのバンドルに入らない静的ページ）。`atlas-console` が増えたのは、
Atlas が見本を開いて題・説明・問いを返すために `js/showcase.js`（en+jp の文 10 件分）を読むから。
⇒ `node scripts/perf-budget.mjs --update` で `atlas-console` と async gzip の天井を上げた。⚠ この機械（CRLF）の
値で書いたので、増分のうち実費は上の表の差（+14.3 kB / +5.8 kB gzip）で、残りは改行の差。merge 後に main の
計測で天井を下げる仕組み（#862・#864 の bot）が実費まで戻す。

- `check:surface`（`--update` で台帳へ）: `js/atlas-cap-panel.js` が `window.IntMapBookmark` を 1 回読む（5 → 6）。`IntMapBookmark` は
  `js/map-ui.js` の `viewHash()` が実行時に作るもので export が無い（他の 5 か所も window で読む）。
  時計は `import { IntMapTime } from './chronos.js'` で読む。
- `check:testbudget`: 新しい spec は実測 3 テスト 30.9 秒（並列 2・サーバ起動済み）／例の 1 本が 27.9 秒。
  1 worker で test body 39.4 / 34.8 秒を測って `tests/durations.json` に 40 を入れ（core の価格 `CORE_MAX_S` を超えるので
  固定の gate には入らず、PR では差分の規則で走る）、**全体の天井を測った分だけ上げた**（5,196 → 5,236 秒・
  `scripts/test-budget.mjs` の注記）。既存の起動済み spec へ足すことも考えたが、例の 10 件は種を入れた
  ヘルメティックな 1 起動を丸ごと使う（smoke に足すと固定 gate が 30 秒以上伸びる）ので独立させた。

## 5. 見本ごとの共有ページ（追加の依頼）

`index.html#v=…` は状態を断片（`#`）に持ち、断片はサーバにもクローラにも届かない——どの見本の URL を SNS に
貼っても同じ汎用カードに展開される。Supabase Edge Function は text/html を返せない（公式文書）ので、要求時に
カードを作る道も無い。⇒ 見本ごと・言語ごとに静的な共有ページ `s/<id>.html`・`ja/s/<id>.html`（20 本）を
`scripts/landing.mjs` が生成する。`<head>` がそのままカード（og:title/description/url/image・
`twitter:card=summary_large_image`・自身への canonical・hreflang）、画像は `scripts/showcase-capture.mjs` が
同じセッションでサイドバーを畳んで撮った 1200×630（`img/showcase/<id>-card.jpg`）。`og:image:width/height` は
JPEG の SOF から読む（画像が正本）。人は meta refresh・`location.replace`・リンクの 3 段でその見本の地図へ。
絶対 URL は今の方式（`index.html` の `og:url`）1 か所から——アドレスの正本が別 PR で入ったら `facts().site` を
そこへ向ける。spec はスクリプト有り・無しの両方で転送先の断片が捕えたリンクと一致することを確かめる。
