---
title: 前日の作業が見つけて直さなかった歴史地図の誤り 8 件を、それを生んだ規則の側で直す——国名の宗主国の括弧は記録が変わる日に外れ、再置された県は最後の再置から描き、上流が 2 つの年で書いた引き継ぎは審査した日へ動かし、名前は単位ごとに 1 つ・大きい順に置き、史実が述べる成立年をカードが言えるようにする
date: 2026-10-02
---

〈依頼〉「構造改革とイノベーション。全権を委任する。固執ではなく保全」（2026-10-02）。2026-10-01 の記録
（hist-era-span-fidelity・restore-clock-and-elam・atlas-eval-map-state・time-compare-lapse・landing-showcase）が
地図の上で見つけて直していない 8 件を、`.agents/rules/historical-verification.md` §2 の 5 つ（年と場所で列挙・
制度と照合・述べられていない日付の代入・面積で被覆・二重主張の区別）を当てて、1 件ずつの特例ではなく構造で直す。

## 0. 測った——見立てのうち 2 つは否定された

- **「Netherlands がドイツの上に置かれる」（1914）は、アンカーの誤りではなかった。** ページ自身の `_labelFC` を
  1914-06-27 の CShapes に評価すると «Netherlands» のアンカーは 6.28°E 52.89°N（ドレンテ州・国境から 0.7°）で、
  オランダの中にある。原因は**置く順**: 時代の国名 2 層には `symbol-sort-key` が無く、`text-variable-anchor` で
  小国の名前が隣へ逃げ、ドイツの名前（極はカッセルの 40 km、#R520 の記録では «Frankfurt am Main» の下）は唯一の
  候補を失っていた。
- **「1872〜1880 年の府県が 11〜14 単位しかない」は、埋められる欠落ではなかった——そして穴埋めは逆に、存在しない
  県を 1881〜1888 年に描いていた。** OpenHistoricalMap の Overpass（2026-10-02、admin_level 3〜5・日本の箱）が
  1871〜1890 年に持つのは 滋賀県 3 版・愛媛県（1873〜1876）・名東県 3 版・琉球藩・沖縄県だけ。Wikidata の
  廃止県（例: 名東県 Q9610752）は P571/P576/P1365/P1366 を述べるが**どの土地を治めたか**を述べない——形の出典が
  無い（§3「名前と日付の上流と、形の上流は別」）。地図は描かず、注記が「記録がまだ無い」と述べる（既存の `note()`）。
  一方 `data/hist-admin-fill.js` の日本 45 行は**全部 1881-02-07 から**だった。ビルダーが 1 つの ISO コードの
  発足を**最も早いもの**で取っていたため。香川県（Q161454）は 1871-12-26・1875-09-05・1888-12-03 を述べる——
  設置・名東県へ合併・再置・愛媛県へ合併・再置。最も早い年を取ると日本の床は 福井県の 1881-02-07 になり、
  1881〜1888 年に、愛媛県だった土地に香川県、大阪府だった土地に奈良県（1887-11-04 再置）、石川・長崎・鹿児島だった
  土地に富山・佐賀・宮崎（1883-05-09 再置）を描いていた。ビルダー自身の注記は「日本の床は 1888-12-03」と書いて
  いて、コードがそれと食い違っていた。
- 沖縄県: OHM は琉球藩（2890077）と沖縄県（2890076）を**同じイベント名**「Ryukyu Domain becomes Okinawa
  Prefecture」で結びながら、`end_date=1879`・`start_date=1880` と**2 つの年**で書く。束は年精度の終わりを
  「その年の末まで」と読むので 1880-01-01 で接していた。Wikidata: 琉球藩 Q707474 P576 **1879-04-04**、沖縄県
  Q766445 P571 1879-03-27（処分の達の日）。
- 1960-06-15 の括弧なしの国名: `js/time-borders.js` `_CS_ERA` が**年**で書かれ `y < before` で比べていた。
  123 の日付つき規則のうち 81 は、CShapes 自身がその年にその gwcode の新しい記録を始める年（＝記録が日を述べている）。
  1947 年の «India» も 1 月 1 日から «(UK)» を失っていた。
- 1950 年の府県名の繰り返し: 区分名の層が多角形 source を読み、MapLibre が外環ごとに候補を作っていた（#R520 が国名で
  直した形が 1 層下に残っていた）。1950-07-01 の日本 46 県は外環 135 個（沖縄 20・東京 14・鹿児島 12・長崎 12）。
- Elam: restore-clock-and-elam が `refuted` に移したので紀元前 5000・4000 年の枚でも名前が出ていた。理由は
  `blankNote` が「Wikidata が述べ、史実が一致する」としか言えないことだった（記録に明記）。

## 1. 直した（規則として）

1. **国名の宗主国の括弧は CShapes の記録が変わる日に外れる**（`js/time-borders.js` `_csBefore`）。表の年 Y は
   「その gwcode の記録が Y に変わる日」: 描いている記録が Y より前に始まり Y の中で終わるなら変化はまだ先、
   Y の中で始まったならもう後。記録がその年に変わらない規則（35 件）は表の年精度のまま（`--report` が列挙）。
   その年に 2 回変わる 4 規則は日付で書いた（仏領スーダン 1960-06-20・ニヤサランド 1964-07-06・モロッコ 1956-03-02・
   イラク 1932-10-03）。ハワイ共和国の規則 1899 → 1898（記録の最初の行が 1898-07-06 の併合から始まる）。
2. **名前は 1 単位に 1 つ、大きい順に置く。** `_labelFC(fc, keyOf, asParts)`——国名は点の `_sort`（その名前の
   最大の部分の面積の −log10。`js/time-admin1.js` `sortKeyOf` と同じ鍵）を持ち、2 層が `symbol-sort-key` で読む。
   区分名は `labelsFor` が同じ関数に `keyOf`＝行・`asParts` で訊き、`imta-src` には単位ごとに選んだ部分だけが載る。
   ⚠ 点ではなく部分を渡すのは費用のため: 極の探索をページでやると 1950 年の第 1 層 794 単位で 391 ms（1900 年
   688 単位で 512 ms）、部分を選ぶだけなら 35 ms で、極はレンダラの worker が探す。
3. **再置された単位は最後の再置から描く**（`scripts/build-hist-admin-fill.mjs` `wikidataSpans`）。発足は全部
   `ss` に残し、描くのは最も遅いものから。それより前の解散（香川の 1876）はこの単位の終わりではない。
   既出荷の行には `--redate`（線は動かさない）で規則だけを当てた: **動いたのは日本 45 行だけ**（1881-02-07 →
   1888-12-03）、落ちた行 0。束は各コードの最も遅い発足を `inception` 欄に持つ（622 コード）。
4. **上流が 1 つの引き継ぎを 2 つの年で書いたら、審査した日へ両端を動かす**（`scripts/histadmin/edges.mjs`・
   `data/hist-admin-edges.json`・`node scripts/build-hist-admin1.mjs --edges`）。母集合は機械が発見する:
   ある単位の**最後の**行と別の単位の**最初の**行が同じ `…:event` を名乗るもの。実測（全 3 層）9 件、年が
   食い違うのは琉球藩→沖縄県の 1 件。判定は Wikidata が述べる日（Q707474 P576 1879-04-04）で、行の `dates` には
   上流の言葉（1879 / 1880）を残し、隣に `corrected` を置く。
5. **史実が述べる成立年をカードが言える**（`sBy: "history"`）。Elam の行は s = hs = −3199（原エラム期 c. 3200 BCE）
   で、Wikidata が述べるどの成立年（−2699）よりも早いときだけ門が認める。カード（en + jp）は「史実はこの政体の
   成立を紀元前 3200 年頃に置く。Wikidata はそれより後の紀元前 2700 年を述べるが用いていない」と述べる。
   `refuted` の Elam は消した（行と反証が同じ所見に 2 つの判定を持たないため）。

`npm run check:histfidelity` に足した規則: `cs-name-not-before` / `cs-name-still-after` / `cs-name-ambiguous-year` /
`cs-name-day-off-record`（⑸）、`fill-before-inception` / `fill-inception-unstated`（⑹）、`edge-unjudged` /
`edge-unstated` / `edge-unreviewed` / `edge-not-applied` / `edge-unmarked` / `edge-reviewed-dead`（⑺）、
`era-span-history-bound-not-earlier` / `era-span-history-bound-not-hs` / `era-span-row-bad-basis`。
`--year` の列挙は審査済みの引き継ぎを「上流 X → 審査済み Y」と印付けする。

## 2. 列挙（年・範囲・描かれるもの）

| 年・箱 | 描かれるもの（修正後） |
|---|---|
| 1960-06-15・西アフリカ | French Sudan (France)・Dahomey (France)・Niger (France)・Cote d'Ivoire (France)・Nigeria (UK)・British Somaliland (UK) |
| 1960-08-05 | Mali・Dahomey・Niger・**Cote d'Ivoire (France)**（独立 08-07）・Nigeria (UK) |
| 1947-03-01 / 08-15 | India (UK) / India |
| 1914-06-27・欧州（2,49,12,55） | 国名の置く順: Germany の `_sort` < Netherlands の `_sort`（大きい順） |
| 1875・日本（122,24,146,46） | 第 1 級 7 単位（滋賀県・愛媛県・名東県・琉球藩〔1879-04-04 まで〕ほか朝鮮・盛京）、穴埋め 0 |
| 1882・日本 | 滋賀県・沖縄県（1879-04-04 から）、穴埋め **0**（以前は 45 県＝今日の輪郭で、うち 6 県はその年に存在しない） |
| 1890・日本 | 滋賀県・沖縄県＋穴埋め 45 県（1888-12-03 から） |
| 1950・日本 | 穴埋め 46 県＋滋賀県、区分名の候補 46（以前は外環 135） |
| 前 5000・前 4000・前 3300 年・イラン（40,20,65,40） | Elam の形は描き、名前は外す（史実の境界 −3199） |
| 前 3000 年 | Elam（名前つき） |

面積で国ごとに（0.25° 格子・`coverage()`）: 日本の第 1 級区分の被覆は 1872 年 0.0%・1875 年 6.4%・1880 年 2.9%・
1882 年 2.5%・1886 年 1.5%・1889 年 98.5%・1900 年 98.5%・1950 年 98.3%。1886 年の世界の被覆は 51.01% → 50.72%
（日本が「丸ごと」から「一部だけ」へ。存在しない県を描いていた分が消えた）——`data/hist-fidelity.json` を
`--update` で記録し直した（変わったのは 1886 年だけ）。

## 3. 直していない（担当範囲の外——統合時に要るもの）

- **④ NATO の凡例「32 members」（1985 年）**: `js/data-layers.js:654` の `makeLegend('nato',…, IntMapLang.t(HOST.lang,'32 members',…))`
  が凡例の注記を**作成時の文字列**で持ち、`natoLegend()` は年の表示しか更新しない。規則は「凡例が述べる数は、
  そのレイヤーがその瞬間に塗っている集合の数」で、数える相手は既に公開されている `window.IntMapNatoFC()`
  （時計の年で加盟国を絞った FeatureCollection）。必要な変更は data-layers 側の 2 行: ⑴ 654 行の注記を
  `IntMapNatoFC().features.length` から作る、⑵ `natoLegend()` の更新枝で `.dl-hint` を同じ式で書き直す。
  共有の凡例モジュールを新設しても、読み込む者（`js/app-body.js` か data-layers）が範囲外なので死んだ部品になる
  ——作らなかった。
- **⑥ プレート境界の凡例の題が英語 UI で「プレート境界」**: 根本は `js/layer-packs.js:495`
  `const nm=[ECLBL[which][1],ECLBL[which][0],…]` が位置引数の言語順（en, jp, de, ru, es）の 0 と 1 を入れ替えて
  `_registerLayerOpacity` に渡していること。英語の読者には日本語、日本語の読者には英語が出る。土地被覆・生態地域の
  凡例も同じ。直すのは `const nm=ECLBL[which];` の 1 行で、locale ファイルではない。
- 区分のポップアップ（`js/map-ui.js` `_eraSourceDates`）は `dates[...].corrected` をまだ述べない——沖縄県は
  「出典の日付: 1880 – 1885」のまま 1879-04-04 から描かれる。`raw` の隣に「審査済み 1879-04-04（Q707474 P576）」を
  出す 1 行が要る。
- 名前の表の年精度の規則 35 件（記録がその年に変わらないもの、例: Dahomey → Benin 1975・Ceylon → Sri Lanka 1972・
  Siam → Thailand 1939）は 1 月 1 日で切り替わる。日を書くには規則ごとに出典が要るので、一覧（`--report`）に残した。
- 1872〜1888 年の日本の府県は描けない（§0）。

## 4. 検査

- `node --test tests/hist-fidelity-sweep-checks.test.mjs`（11 件・緑）: ①名前が記録の日に切り替わり、1 月 1 日の読みに
  戻すと門が赤 ②国名の `_sort` が区分名の `sortKeyOf` と一致し層が読む ③1950 年の日本で候補が単位の数・同名 2 単位は
  2 つ ④日本の行が 1888-12-03 から・1881-02-07 に戻すと赤・`inception` が無いと赤・ビルダーが香川の 3 つの発足から
  最後を取り 1876 の解散を無視 ⑤沖縄の 2 行が 1879-04-04 で接し上流の言葉が残る・判定を消す／述べられない日／適用前で
  赤・`applyEdges` が線を動かさず直す・所見はタグから発見 ⑥Elam が前 4000 年で名前を外しカードが史実の年と Wikidata の
  年を述べる・史実の境界が Wikidata より遅い／`hs` と違う／別の根拠名で赤。
- 既存: `tests/restore-clock-and-elam-checks.test.mjs` ①を新しい判定に合わせた（「Elam に作用する行は無い」→
  「作用するのは史実の境界の行」）。`history-era-display`・`shell-map-labels`・`r564`・`hist-bundles-off-main`・
  `history-admin-tiers`・`r530`・`history-border-coast`・`news-timeline`・`r201`・`history-prefetch-on-demand`・
  `chronos-unnamed-shapes`・`history-era-names`・`hist-era-span-fidelity` 緑。
- `check:histfidelity` / `histeras` / `histnames` / `histborders` / `histadmin` / `histfill` / `kuni` / `cshapes` 緑。

## 5. 台帳を動かした理由

- **`check:surface`（`window.IntMapTimeBorders` の読み 26 → 27）**: `js/time-admin1.js` `labelsFor` が国名と同じ
  「名前をどこに置くか」の持ち主 `labelFC` を、ページが先に作った時代の国境モジュールの実体から読む。import に
  しないのは、要るのが関数ではなく `js/app-body.js` が作る**実体**だから（工場関数を import しても `_labelFC` は
  閉包の中）。`--update` した。
- **`data/hist-fidelity.json`**: 1886 年の被覆 51.01 → 50.72%（§2）。
- **`check:datagov`（新しい subject 2 つ）**: `data/hist-admin-edges.json` と `scripts/histadmin/edges.mjs → …` は
  出自・権利・周期を値で述べ（ファイルの `gov` と `GOVERNANCE`）、残る facet（`freshness.asOf`・`integrity.*`、
  edges.mjs 側は `origin.retrievedAt` も）を `--update` で台帳に記録した——隣の `data/hist-era-spans.json` と同じ形で、
  審査の台帳には単一の「何年の世界か」が無く、`integrity.*` は宣言の語彙がまだ無い。
- **`check:perf`（`eager.modules` 300 → 301）**: この変更は eager のモジュールを 1 つも足していない
  （`js/` で触ったのは `js/time-borders.js` と `js/time-admin1.js` だけで、import は増えていない）。増えた 1 は
  main に先に着地した #887 の `js/inline-actions.js`（`src/main.js` が eager に import）で、#886 が天井を 300 に
  下げた後に入ったため main の上で天井を 1 超えていた。main を取り込んだこの branch の build で測って、超えた行だけを
  `--update` で上げた（他の行は帯の内）。
- **`js/time-admin1.js` の段落の数**: `data/hist-admin1.js` は `--edges` が `dates` に審査の印を書いたので
  41,457,870 → 41,458,052 B（LF）。`tests/history-admin-tiers-checks.test.mjs` #R700 ⑤ がその段落と実バイトを
  照合するので、段落の数を書き直した（環は動いていない）。
