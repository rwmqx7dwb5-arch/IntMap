---
title: マーケティングの仕組み——ブランドの正本 1 つから head・docTitle・manifest・README・プレスキット・投稿の下書きを書き出し、歴史地図の検索の入口ページ（地域 × 日付、en/ja）を地図自身のコードでビルド時に生成する。og-image を本物の JPEG に
date: 2026-10-03
---

〈依頼〉「求めるのは改善ではなく商品開発、マーケティング、営業。整形ではなく造形。引き算ではなく足し算。全権を委任する。」
——マーケティングの責任者として、読者を連れてくる仕組みを作り切る。⑴ 大量の検索入口を生成する仕組み（年 × 地域、
本文は IntMap のデータから導いた事実だけ）⑵ 価値提案の一本化とブランドの言葉の正本、index.html の head と manifest を
そこから導出、og-image の軽量化 ⑶ ローンチ素材一式（外部には出さない）。

## 0. 測った

- **約束が 3 つあった。** `index.html` の題「Explore the world. Ask the map.」（Atlas が先頭）、紹介ページ
  「Every year of the world, on one map.」、`README.md`「Explore the world across place, data, and time.」。
  `docTitle`（`js/locales/ui.*.js`）は実行時に head を上書きするので、4 つ目の置き場でもあった。
- **`og-image.jpg` は JPEG ではなかった。** 先頭 8 バイトが `89 50 4E 47`＝PNG（1440×815、RGBA、1,004,435 B）。
  `.jpg` の名前で `image/jpeg` として配られていた。`scripts/landing.mjs` の `jpegSize` に掛けると 15480×35216 と
  答えた（PNG のバイト列を JPEG の印として読んだ）。
- **`index.html` に canonical・X カード・JSON-LD が無く**、og:image の大きさも書かれていなかった。
- 検索の入口は静的ページだけ（地図の状態は `#` にあり、サーバにもクローラにも届かない。Edge Function は
  text/html を返せない——`dev-notes/2026-10-01-share-embed-distribution.md`）。

## 1. ブランドの正本（`scripts/brand-text.mjs` → `scripts/brand.mjs`）

- **約束は「世界のどの年も、一枚の地図で」に決めた。** 理由: 最初の訪問にはアカウントが無い。地図・全レイヤー・
  時計は登録なしで使え、Atlas はログインと 1 日の上限が要る。だから約束は登録なしのもの（全部に効く 1 つの時計・
  出典の明記）にし、Atlas は裏付けの側に置いた。紹介ページが既にこの選択をしていたので、そちらに揃えた
  （検査が両者の見出しを照合する）。
- 書き出し先: `index.html` の生成領域（title・description・canonical・Open Graph〔og:image の type/width/height/alt を含む〕・
  X カード・JSON-LD `WebApplication`〔inLanguage は言語の登録簿から 9 つ〕）、`ui.en.js`/`ui.jp.js` の `docTitle`/`docDesc`、
  `manifest.webmanifest`（`scripts/build-app-manifest.mjs` の導出と一致することも確かめる）、`README.md` のタグライン、
  `docs/marketing/press-kit.md`・`launch-posts.md`。
- **文中の数は全部プレースホルダ**で、`scripts/landing.mjs` の `facts()` と言語の登録簿から入る。投稿が名指す見本の
  日付と画像も `{date:<id>}`/`{image:<id>}` で `js/showcase.js` から入る。⚠ 最初の版の置換規則は `{word}` しか拾わず、
  `{date:europe-1914}` がそのまま出力された（検査を書く前に `--print` の出力を読んで見つけた）。規則を「波括弧の対は
  全部プレースホルダで、知らない綴りは拒む」に直した。
- `index.html` に `hreflang` は書かない: アプリは 1 つの URL を実行時に 9 言語へ切り替えるので、名指す別 URL が無い。
  別 URL の言語版を持つ紹介ページと入口ページが `hreflang` を持つ。
- **日英以外の 7 言語の `docTitle`/`docDesc` は旧い約束のまま**（凍結。`AGENTS.md` §3-5）。

## 2. og-image

同じ絵柄を 1200×679（縦横比を保つ）・品質 85・progressive の本物の JPEG に: **1,004,435 B → 186,653 B**。
⚠ 絵そのものは以前の画面（右下に「See the past world — 1900 to present」）で、今の時計の範囲と食い違う。
撮り直しは開発サーバでの撮影が要るので、承認事項として `docs/marketing/README.md` に残した。

## 3. 歴史地図の入口ページ（`scripts/history-pages.mjs`）

- **ページは地図のコードが書く。** 自前で束を読むと、地図と違う答えを出す 2 つ目の規則になる。
  `scripts/histeras/time-borders.mjs`（`js/time-borders.js` を Node で実体化する、hist-fidelity の道具）に
  `collectionAt(1 July of Y)` を訊く——CShapes → OpenHistoricalMap → historical-basemaps の選択も、年代に合わない
  名前を出さない規則も、地図と同じ。
- **名前も地図が書くもの。** 最初は記録の `NAME` を載せたが、1913 年のヨーロッパが「Russia・Germany・France・Iran」に
  なった（地図は「Russian Empire・German Empire・French Third Republic・Persia」と書く）。地図の名前はラベルの段
  `tagSame` が決め、その段は国の表 `countryStats` と `window.IntMapHistId`・`IntMapMaddison` を読む。
  ⇒ `js/time-borders.js` の返す API に `tagSame` を 1 つ足し（読むだけ・描かない）、harness に `countryStats` を渡す
  口を足した。表はアプリと同じ Natural Earth 10 m から `js/countries-ui.js` と同じ 3 つの式で作り、その日に有効な
  旧国家の行（`js/history.js` histStates）を足す。時計（`IntMapTime.year`）も訊く日付に合わせる——固定の 1500 の
  ままだと、日本語で「Austria-Hungary」が「オーストリア帝国」になった（同名の 2 つの国家のどちらかを年で選ぶ規則）。
- **単位**: 床（1689）より前はシート 1 枚ごと、1689〜2019 は毎年 7 月 1 日を訊き、地域に描かれる名前と記録が同じ年の
  続きごとに 1 ページ。地域は経緯度の矩形（ページに印字）で、輪郭を矩形で切り抜いた球面上の面積が 0 より大きい名前を
  面積順に載せる。最初の案（輪郭の重心が矩形に入るか）は、ロシア帝国の重心がシベリアにあるため「1914 年の
  ヨーロッパ」から消える形で、否定した。
- **数（このコミットのデータで）**: 1 言語あたり **1,677 ページ**（世界 302・ヨーロッパ 143・中東 110・アフリカ 181・
  南アジア 117・東アジア 135・東南アジア 147・中央アジア 79・北アメリカ 115・中央アメリカとカリブ海 135・南アメリカ 104・
  オセアニア 109）＋地域の一覧 12＋総覧 1、en と ja で **3,380 ページ**、sitemap 2 本（3,382 ファイル）。約 46.5 MB。生成は 15〜54 秒
  （この機械の負荷による）。
- **ビルド**: `vite.config.js` の `historyPagesPlugin` が静的コピーの後・サイト URL の埋め込み（post）の前に、
  **子プロセスで**走らせる——実体化はブラウザの大域（window・document・fetch）をそのプロセスに入れるので、Vite の
  プロセスには入れない。リポジトリには生成物を置かない（記録を直すたびに数千ファイルの差分になるため）。
- **配る量が増える（意図した増分）**: `check:perf` の `dist.total` は 834,584.5 kB（天井 788,384.6 kB、帯 3,941.9 kB）
  ——入口ページ 3,382 ファイル・約 46.5 MB の分（`dist.total` の天井を上げる理由: 検索の入口ページ）。起動経路（eager の JS・CSS・要求数）は変わらない（ページは地図を
  読み込まない静的 HTML）。⚠ `node scripts/perf-budget.mjs --update` は「この木は CI が測る木ではない」（origin/main に
  未取り込みの commit がある）として拒んだので、天井は origin/main に載せ直してから上げる。
- **sitemap**: `sitemap.xml`・`robots.txt` は `scripts/landing.mjs` の持ち物なので触らず、`sitemap-history.xml` と、
  両方を束ねる `sitemap-index.xml` を書く。

## 4. 年と場所を名指して読んだ（`.agents/rules/historical-verification.md` §2-1）

- 1913 年 7 月 1 日のヨーロッパ: Russian Empire・Ottoman Empire・Austria-Hungary・German Empire・French Third Republic・
  United Kingdom of Great Britain and Ireland・Kingdom of Italy……（Czechoslovakia・Poland は無い）。1920 年: Czechoslovakia・
  Poland・Weimar Republic があり、Austria-Hungary・German Empire は無い。1900 年の東アジア: Qing Empire・Korean Empire・
  Empire of Japan（日本語は 清・大韓帝国・大日本帝国）。紀元前 3000 年の世界はその年のシート。⇒ 検査にした。
- ⚠ **地図の名前の誤りを 3 つ見つけた（ページは地図に従うので、同じだけ誤る）。§4b で地図側を直した:**
  1. **日本語の「台湾」が全時代で「中華民国」。** ラベルの段は「名前が今の国と同じ輪郭には今の国名」を当て、今の国名は
     Natural Earth の `NAME_JA` から来る。`NAME_EN` が `Taiwan` の行の `NAME_JA` は「中華民国」なので、1492 年・1500 年の
     シートの台湾と、1895〜1945 年の「Taiwan (Japan)」（日本語は「中華民国（日本）」）がそう書かれる。中華民国の成立は 1912 年。
  2. **「West Germany」が 1945〜1948 年。** CShapes の 260 は 1945-05-08 からで、`js/time-borders.js` の表は 260 を 1990 年まで
     「West Germany」と呼ぶ。ドイツ連邦共和国の成立は 1949-05-23（それまでは占領地区）。
  3. **「North Korea」「South Korea」が 1945〜1947 年。** CShapes の 731/732 は 1945-08-15 から。両国家の成立は 1948 年。
  ——どれも名前の表（地図）の問題で、直す場所は `js/time-borders.js` の表とラベルの段。
- 否定した見立て: 入口ページのために名前の表を別に持つ（地図と違う答えになる）。

## 4b. 地図の名前を根本で直した（`js/time-borders.js`）

- **国家の名前を国家より前に書かない（`_CS_ERA`）。** 260・265・731・732 の最初の行を、記録が国家の行を始める日
  （1949-09-21・1949-10-05・1948-09-09・1948-08-15。どれも CShapes 自身の境界で、門 `check:histfidelity` §5 がそこに
  縛る）までは占領地の名前にした: 「Germany (Western Allies)」（ドイツ（西側連合国））「Germany (USSR)」（ドイツ（ソ連））
  「Korea (USSR)」（朝鮮（ソ連））「Korea (USA)」（朝鮮（アメリカ））——1945 年のシートが占領地区に使う「土地 (保有者)」の形。
  ⚠ 史実と記録の日がずれる所は記録の日に従った（基本法は 1949-05-23、GDR は 1949-10-07。CShapes は 09-21・10-05。
  門が記録に無い日を拒むので、日を作らない）。保有者の語「Western Allies」は `_COLONIZER` に en+jp で 1 行。
  ⚠ 東ドイツ（265）は報告に無かったが同じ形だったので同時に直した。
- **場所の名前を今の国家の名前で訳さない（`_placeLoc`）。** 今の国の表の `NAME_JA` は行によって国家の正式名で
  （CLDR の地域名と違う行が 245 行中 34 行: 中華民国・大韓民国・朝鮮民主主義人民共和国・マリ共和国・モンゴル国・タイ王国…）、
  それを日付の無い輪郭の名前と「土地 (保有者)」の土地の半分の訳に使っていた。規則: **CLDR の英語の地域名（short）が
  訳す名前そのものであるときだけ** CLDR の地域名で訳す（両方が同じものを名指しているので一方が他方の訳になる）。
  それ以外は今までどおり表の名前（「United States」は CLDR short の英語が「US」なのでアメリカ合衆国のまま）。日付のある
  記録（CShapes の `_gw`）の輪郭は、その日のその国家なので今の国名のまま（1950 年の台湾は中華民国）。入口ページの表も
  `a2` を `js/countries-ui.js` と同じ式で持つ（検査 ⑧ が式を照合）。
- **旧国家の名前はその期間の外では、自分の名前そのものを訳すときにしか使わない。** 以前は年が分かっていても、期間外の
  最初に一致した旧国家を返していた——1913 年の「Korea (Japan)」が「朝鮮（李氏朝鮮）（日本）」（李氏朝鮮は 1897 年まで）。
  1715 年のシートの「Austrian Empire」のような**同じ名前**の訳は残る。
- **「土地 (保有者)」の保有者を輪郭の政体と読まない（`_heldLand`）。** 旧国家の輪郭名の型（ソ連は `/soviet|u.s.s.r/`、
  無錨）が「Germany (USSR)」に当たり、占領地区が地図でも日本語でも「ソビエト連邦」になっていた。型は土地の半分に訊く。
- 結果（入口ページ、日本語）: 1492・1500 年「台湾」、1900・1913 年「台湾（日本）」「朝鮮（日本）」、1946 年
  「ドイツ（西側連合国）」「ドイツ（ソ連）」「朝鮮（アメリカ）」「朝鮮（ソ連）」、1949 年（7 月 1 日）は朝鮮の 2 国家、1950 年は西ドイツ・
  東ドイツ。ページは 1,677／言語（ヨーロッパが 141→143）。
- 検査: `tests/marketing-engine-checks.test.mjs` ⑥b（1500・1900 年に「中華民国」が無い／1946 年に 4 国家が無く 1950 年に在る／
  占領地区が「ソビエト連邦」にならない）。`tests/history-era-names-checks.test.mjs` #R716 ① の到達数は、全名を 1950 年の
  時計 1 つで訊いていたため期間外の旧国家の別名（1950 年の「India」が英領インド、「Sudan」が南スーダン込み等）を「届いた」と
  数えていた。各名前を地図が描く年に訊くように直し、床をその実測へ（CShapes 652／era 4,518 は jp。他言語も同じ形で
  下がり、下がった分はどれも別名による答え）。
- 直していないもの: クリックの解決（`resolveHist`）も同じ旧国家の型を使う。保有者の取り違えがそこにもあるかは測っていない。

## 5. ローンチ素材（`docs/marketing/`）

`README.md`（何がどこにあるか・**承認が要ること**・段取り表・測り方・書き方の約束）、`press-kit.md`（生成物）、
`launch-posts.md`（生成物。Product Hunt・Show HN・Reddit 4 つ・X en/ja・note・Zenn）。`node scripts/brand.mjs --print <id>`
が貼れる完成形を出す。**utm はアプリへのリンクにだけ付ける**——数えるのはアプリの匿名集計（`js/usage-counts.js`）だけで、
静的ページには読み手が無い（付ければ測っているように見えるだけ）。検査が、付けた 3 つが集計の規則（`campaignOf`）を
通ることを確かめる。どのスクリプトも投稿・送信・登録をしない。

## 6. 検査

`tests/marketing-engine-checks.test.mjs`（node, 10）: ブランドの書き出し 7 ファイルが正本どおり・manifest の導出と一致・
紹介ページの見出し＝タグライン・og-image が JPEG で 300 kB 以下・head の大きさがファイルの大きさ・文と投稿に数を
手で書いていない・utm・**年と場所を名指した史実の照合**・国家の名前が成立前に無く場所が今の国家名で訳されないこと（⑥b）・年の区切りが重ならず隣が必ず違う・リンクが全部生成物か
配られるファイルに着く・地図のリンクがページの地域と日付を開く・hreflang が相互・スクリプトを実行しない・sitemap が
過不足なし・日英の文のキーが揃う・ビルドが書く・`js/countries-ui.js` の式（`a2` を含む）。

## 統合時の性能予算（main へ重ね直した後の build）

超えた行だけ `--update` で上げた（増えた理由は上の節）:
- eager.gzip: 1523.9 kB → 1532.2 kB
- dist.total: 788384.6 kB → 834629.4 kB
