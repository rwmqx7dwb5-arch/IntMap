---
title: 年ごとの世界地図——「1914年 世界地図」「world map 1648」と年で探す人に、その年の世界を地図と同じ記録から描いた絵・地図に描かれる名前と記録・前の年からの変化・その年の出来事を見せ、地図をその年で開く静的ページを 114 年分（en / ja）。年は手で並べず記録から 3 つの規則で選ぶ
date: 2026-10-07
newsen: World map by year — 114 pages, from 123,000 BC to 2016, each showing the world on 1 July of that year drawn from the map's own records, the names on it with their sources, what changed and the events of that year
newsjp: 年ごとの世界地図——紀元前12万3000年から2016年までの114年分。その年の7月1日の世界を地図と同じ記録から描いた絵、描かれる名前と出典、変化、その年の出来事
---

〈依頼〉第 3 波「事業・プロダクト全体の再設計」のマーケティング（検索流入）。人は年で探す（「1900年 世界地図」「world map 1914」）。
IntMap はその答えを持っているのに、地図の状態はアドレスの断片にあり検索エンジンからは見えない。国別の入口ページと同じ流儀で、
**年ごとの入口ページ**を作る。

## 0. 着手前に測ったこと

- 既存の歴史地図の入口（`scripts/history-pages.mjs`）は地域 × 日付で、地域 `world` も持つ（名前の表だけで**地図の絵は無い**。
  1689 年より前はシートの年だけ）。年ページはその隣に置き、同じ名前の表を持つ地域ページへ結ぶ。重複は避けられないので
  §5 に提案として残す。
- 毎年 7 月 1 日を `collectionAt` で読むと、名前の数の前年差は**記録の継ぎ目に支配される**: 1792 年（−225）・1847 年（−185）・
  1750 年（−46）は、どれも最寄りの historical-basemaps のシートが別のシートに切り替わる年で、消えた名前はシートの文化圏や
  オーストラリアの言語集団だった。1689（OHM 開始）・1886（CShapes 開始）・1924（OHM 後期の終わり）・紀元前 3199（Cliopatria 開始）は
  答えを組む記録の組そのものが変わる年。⇒ 素の差で選ぶと**世界ではなく記録の切り替わりを選ぶ**。

## 1. 年の選び方（`scripts/year-pages.mjs` `chooseYears`。手で並べた年は無い）

3 つの集合の和。各ページは「この年にページがある理由」にどれに選ばれたかを書く。

1. **シートの年**——historical-basemaps の地図帳が世界図を描いた年（`data/hist-eras.js` `snaps`、CShapes の最終年まで）: **54 年**。
2. **転換点**——日付を持つ記録（Cliopatria・OpenHistoricalMap・CShapes。最寄りのシートで補った輪郭は除く）を、記録が始まる前の
   シートの年（紀元前 3999 年）から 2019 年まで毎年 7 月 1 日に読み、描き始めた名前＋描かなくなった名前を数える。記録の組が
   変わる年（継ぎ目: 紀元前 3199・1689・1886・1924）は数えない。0 でない変化 **657** のうち上位 `TURN_SHARE`＝5%（**21 名以上**）
   の年: **34 年**（紀元前 599、911、936、990、1040、1056、1066、1139、1147、1188、1202、1236、1260、1294、1305、1344、1363、
   1385、1572、1796、1800、1807、1811、1814、1815、1816、1822、1867、1885、1890、1919、1946、1961、1992）。
3. **出来事の年**——日付つき出来事の索引の Wikidata の出来事のうち、種類が政体に関わるもの（`EVENT_KINDS`: geo・war・revolution。
   disaster・space・economic・assassination は選ぶ理由にしないが、選ばれた年のページには載る）の年、2019 年まで: **36 年**。
   索引の種類はすべて分類してあり、未分類の種類が現れるとビルドが止まる（黙って落とさない）。

和は **114 年**（紀元前 12 万 3000 年〜2016 年）。2019 年より後の出来事（2021〜2024 年の 4 年）は、地図が現在の国境を描くので選ばない。
`TURN_SHARE` だけが定数で、観測・失効条件・正本はコードの註に書いた（閾値は毎回記録から計算し直す）。

## 2. ページの中身

- **絵**（`scripts/lib/world-svg.mjs`）: 地図が 7 月 1 日に描く集まりそのものを Equal Earth・幅 1000 px の SVG に。輪郭は表示の
  ためだけにおよそ 1 px まで簡略化（Douglas–Peucker）、1 px 未満の環は絵から省く。陸地は Natural Earth 1:110m を灰色で先に敷く。
  シートの年でない年に最寄りのシートから補った輪郭は淡く塗る。日付変更線をまたぐ環は両側に描いて縁で切る。簡略化と灰色と淡色の
  意味はページの図の註に書く。1 年 1 枚を両言語で共有。
- **名前の表**: 地図が書く名前（en / jp）、それを描く記録、記録が結ぶ Wikidata の項目、描かれる面積。上位 50 行と、残りは折りたたみ
  （全部ページにある）。見出しは「名前」——シートは「Antarctica」や文化圏も描くので「政体」「国」とは言わない。
- **変化**: 前のページの年との差。数えるのは日付を持つ記録の名前だけ（シートで補った名前は両方がシートの年のときだけ）。名前は
  書かれたとおりに比べるので、綴りの変わる政体（Carthaginian Empire → Carthage）は両方の欄に出る、とページに書く。
- **出来事**: 索引の記録のうち日付が名指す年がその年のもの。最初は `inYear`（その年をまたぐ期間）を使ったが、1945 年のページに
  1939 年 9 月 1 日に始まる戦争記録の項目が並び「1945 年の出来事」と言えなかったので、`yearOf` に替えた。
- **SEO**: title / description / canonical / hreflang（en↔ja・x-default）/ OGP（絵はサイト共通）/ JSON-LD（`WebPage` の
  `mainEntity` に `Map`——`temporalCoverage` は ISO 8601 の年、`image` は絵、`url` は地図を開くリンク——と `BreadcrumbList`）/
  `sitemap-years.xml`（`sitemap-index.xml` が束ねる。`sitemap.xml` は `scripts/landing.mjs` の持ち物なので触らない）/ 世紀ごとの一覧。
- **置き場所**: `history/years/`。歴史地図の家族で、計数器の `history` 入口（`shape.js` `SITE_PAGES`）と Privacy §1 の開示が既に
  それを数えている——新しい計数の値も開示も要らない。

## 3. 大きさ（2026-10-07、`node scripts/year-pages.mjs --out`）

345 ファイル・約 21 MB（絵 114 枚で 8.3 MB——最大 1453 年の約 140 kB、1914 年は 79 kB・gzip で約 30 kB。HTML 228 本で約 12 MB——
名前の多い 1492 年の日本語版が最大で約 200 kB）。リポジトリには入らない（ビルド時だけ）。生成は約 19〜25 秒。
1:50m の陸地で 9.2 MB だったのを、この大きさの世界図に向けた 1:110m にして 8.3 MB。
ビルドした `dist/` では `history/years/` が 14.0 MB・`ja/history/years/` が 6.6 MB（比較: 既存の歴史地図の入口 `history/` の地域ページは
英語だけで約 35.6 MB、この日の歴史地図 `on-this-day/` は 14.8 MB、国別 `countries/` は 3.2 MB）。
⚠ **`check:perf` の天井を 1 行上げた**: `dist.total` 1,311,472.7 kB → 1,329,220.3 kB（`node scripts/perf-budget.mjs --update`。
上げたのはこの行だけ）。増えた 17.7 MB は上の年ページそのもの（約 20.6 MB のうち、天井の余白が吸った残り）。買ったものは
114 年分の「<年> 世界地図」の入口と、その年の世界の絵——検索エンジンと JavaScript を動かさない読者が読める唯一の形。
起動の予算（eager の JS・初回の要求）は触らない: ページはアプリの外の静的ページで、アプリからは読まれない。年ごとのリンクのカード（PNG）は
1 枚 0.25〜1 秒・約 100 kB かかるので今回は作らず、`og:image` は他の生成ページと同じサイト共通の絵（§5）。

## 4. 史実との照合（`.agents/rules/historical-verification.md`）

6 年を名指して、ページが述べること（地図が描く名前・前の年からの変化・出来事）を制度の成立と廃止に照らした。

- **紀元前 200 年**（シートの年）: Roman Republic・Han Dynasty（前 202）・Seleucid Empire・Ptolemaic Kingdom・Greco-Bactrian・
  Parthian・Nanyue（前 204）・Maurya（〜前 185 頃）・Carthage——成立と廃止に矛盾なし。紀元前 300 年からの変化で Qin と戦国の諸国が
  消えるのも正しい。⚠ 同じ政体が記録ごとに別名で 2 行（Maurya Empire［Cliopatria］と Mauryan Empire［シート］、Han Dynasty と
  Han Empire）。シートの「名前」の多くは文化圏（hunter-gatherers 等）。
- **西暦 1000 年**: Northern Song・Liao・Fatimid・Ghaznavid・Holy Roman Empire・Kievan Rus'・Byzantine・Córdoba・Chola・Ghana——
  矛盾なし。⚠ Cliopatria の述べ方の問題（地図そのものの主張）: **Kingdom of Hungary** は 1000-01-01 から（戴冠は 1000 年 12 月 25 日
  または 1001 年 1 月 1 日。記録の精度が年なので 7 月 1 日は半年早い）、**Kingdom of Poland** は 962 年から（王国は 1025 年、それ
  以前は公国——名前の時代錯誤）、Seljuk Dynasty は 990 年から。
- **1648 年**（シートの間の年。Cliopatria＋最寄りのシートを淡色で）: Dutch Republic・Tsardom of Russia・Qing と Southern Ming・
  Kingdom of Portugal（1640 年の再独立後）・Irish Catholic Confederation・New Netherland——矛盾なし。Peace of Westphalia は Wikidata の
  1648-10-24。⚠ **Commonwealth of England** を Cliopatria が 1645 年から描く（共和国の宣言は 1649 年 5 月）。スコットランドは
  シートの綴りのまま「Scottalnd」（淡色）、Cliopatria の「Kingdom of England」約 9.3 万 km² が別にある。
- **1815 年**（シート・転換点・出来事）: 1814 年からの変化に German Confederation・Kingdom of the Netherlands・Congress Poland
  （Kingdom of Poland）・Free City of Krakow、消えたものに Duchy of Warsaw・Confederation of the Rhine——ウィーン会議と一致。Holy
  Roman Empire は描かれない（1806 年解消）。Austrian Empire・Sweden–Norway（1814 年 11 月から）も正しい。
- **1914 年**（シート）: German Empire・Austria-Hungary・Ottoman Empire・Russian Empire・Republic of China（1912）・Union of South
  Africa（1910）・Nigeria (UK)（1914-01-01 統合）。1900 年からの変化（Korea (Japan) 1910・Norway 1905・Panama 1903・Albania 1912・
  Libya (Italy) 1912・Belgian Congo 1908 が現れ、Orange Free State・Transvaal・Congo Free State・Korean Empire・Qing が消える）も
  すべて制度の成立・廃止と一致。⚠ 「Egypt (UK)」は CShapes の名づけ（保護国の宣言は 1914 年 12 月）。
- **1945 年**（シート・出来事）: Soviet Union・Germany (Western Allies)／Germany (USSR)（6 月 5 日の占領区分）・Austria・Iceland
  （1944）・Kingdom of Hungary（王制の廃止は 1946 年 2 月）——矛盾なし。German Empire・Austria-Hungary・Ottoman・Russian Empire は
  描かれない。1938 年からの変化でバルト 3 国・Danzig が消えるのも正しい。⚠⚠ **Cliopatria が 1945 年にグリーンランドを
  「United States of America」として描く**（約 219 万 km²。デンマークの主権のもと、1941 年の協定で米国が防衛していた——主権の主張と
  しては誤り）。CShapes はグリーンランドを描かず、1924 年以降 OHM 後期も無いので、Cliopatria だけがそこを答えている。
  また「French Fourth Republic」（第四共和政は 1946 年 10 月）を Cliopatria が 9,127 km² の小片で描く（「French Indochina」と同じ面積）。

**上流が述べていない日付を代入していないか**: ページが自分で置く日付は「7 月 1 日」だけで、これは地図を読む瞬間（アプリの年の
リンクと同じ）としてページに書いてあり、どの典拠の主張としても出していない。出来事の日付は索引のもの（精度つき）、名前・記録・
項目は記録のもの。年が選ばれた理由は規則として書く。代入は無い。

⇒ ⚠ 上の ⚠ は**地図そのものが描いているもの**で、ページは地図と同じだけ正しく、同じだけ誤る。直す場所は Cliopatria の審査台帳
（`scripts/histclio/review.json`）と CShapes の名づけで、この作業の範囲の外。照合の結果は名前の有無として門に固定した（下）。

## 5. 門と検査

- `tests/history-year-pages-checks.test.mjs`: 規則をデータから導き直して年が一致すること・継ぎ目を数えないこと・6 年に描かれる
  べき名前と描かれてはならない名前（1914 に Soviet Union が無い、1945 に German Empire が無い、1815 に Holy Roman Empire が無い、
  1648 に Russian Empire が無い、紀元前 200 年に Roman Empire が無い、1000 年に Ottoman・Mongol が無い）・シートで補った名前を
  変化に数えないこと・出来事の年・絵と地図のリンク（世界・その年の 7 月 1 日）と構造化データ・hreflang・sitemap と索引・リンク先の
  実在・計数器が `history` と数えること・文のキーの一致・日付変更線と 1 px 未満の環。

## 6. 残したもの・提案

- **地域ページ（世界）との重なり**（決定: 既存ページの題は変えない）: 年ページの題・h1・description を別の検索意図に向けて分けた——
  en「The world in 1914: states, borders and changes」／jp「1914年の世界——国と国境、前の年からの変化」。地域ページは「地図」、
  年ページは「その年の国の一覧と変化と出来事」で、互いのリンク文がそう言う（世界の地域ページに年ページへの帯を 1 つ足した）。
  canonical はそれぞれ自分自身。題が重ならないことを門 ⑧ が見る（地域ページの題は生成器から読む）。
- **年ごとのリンクのカード（PNG）**: 合成された記録（Cliopatria・OHM・シート）を描けるよう `scripts/lib/map-card.mjs` を広げれば
  作れる（1 枚 0.25〜1 秒・約 100 kB × 114）。
- 上の Cliopatria の 4 件（グリーンランド＝米国 1945、Commonwealth of England 1645、Kingdom of Poland 962、French Fourth Republic 1945）。
