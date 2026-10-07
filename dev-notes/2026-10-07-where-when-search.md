---
title: 「どこ＋いつ」を 1 つの欄で——検索欄・コマンドパレット・Atlas が「京都 1600」「Berlin May 1945」「慶長5年 京都」を同じ読み方で読み、選ぶとそこへ飛んで地図がその時刻の歴史地図になる
date: 2026-10-07
newsen: Type a place and a time together in the search box or the command palette — "Kyoto 1600", "Berlin May 1945", "Rome 44 BC". Pick the suggestion and the map flies there and becomes the historical map of that moment. Old names work, and Japanese era years are converted.
newsjp: 検索欄とコマンドパレットに場所と時刻を一度に打てるようになりました——「京都 1600」「Berlin May 1945」「ローマ 紀元前44年」「慶長5年 京都」。候補を選ぶとそこへ飛び、地図がその時刻の歴史地図になります。当時の地名でも引け、和暦は西暦の年に換算します。
---

〈依頼〉第 3 波「事業・プロダクト全体の再設計」の 1 本。検索欄とコマンドパレットは「場所」か「機能」を探す入口だった。
今日から紀元前まで遡れる時空間アトラスの入口として、場所と時刻を同時に受けるものに作り変える。

## 0. 測った・確かめた

- 既存の暦変換はリポジトリに無い（`旧暦|和暦|lunisolar` は滋賀県の 1 日の査読済み補正だけ）。⇒ 和暦は **ICU の japanese 暦**
  （`Intl.DateTimeFormat('ja-JP-u-ca-japanese')`）を標本して読み戻す。Node 24 で大化（645）から令和まで、元号の数は 230 超。
  1 元号 1 標本で始まりの年が決まる（年 n ＝ 始まり＋n−1）。標本は各年の 1/1 と 12/31、両端が食い違う年だけ月 2 回——数千回、数 ms。
- ICU は 1868 を「慶応4年」と書く（明治は 10 月 23 日から）。「明治元年」は 1868、「慶長5年」は 1600 で、手で検算した値と一致。
- `Intl` の紀元の語: en「BC/AD」「Before Christ/Anno Domini」、ja「紀元前/西暦」、zh-Hant「西元前」、de「v. Chr.」、fr「av. J.-C.」。
  narrow の 1 文字（「B」「A」）は語頭に当たるので捨てる。BCE / CE は CLDR の `alt="variant"` で `Intl` が出さない——そこだけ書いた。
- 「貞観12年」は中国の年号の例として試験に書いたら **日本の元号でもあった**（859–877、ICU は 870 を返す）——読み方は正しく、例が誤り。「乾隆30年」に替えた。
- 時計を過去に合わせることが既に歴史地図の表示そのもの（`js/time-borders.js` などが `IntMapTime.on` で追う）。別の「歴史モード」は作らない。

## 1. 作ったもの

- `js/where-when.js`（新規・遅延）: `parse`（構文。①ISO ②和暦 ③`n年m月d日` ④月名 ⑤紀元の語つきの年 ⑥末尾の 3〜4 桁）、`whenText`、
  `problemText`、`applyWhen`、`histCandidates`（歴史都市名・Pleiades を名前で引く）、`eraNameAt`、`interpret`（パレットと Atlas 用）。
- 検索欄（`js/search-geocode.js`）: 時刻を読んだら場所の部分で今までの検索（端末の行・3 つのジオコーダー）を走らせ、歴史の名の行を足し、
  どの行も「場所 · 時刻」と出す。選ぶと飛んで時計を合わせる。場所の無い時刻は「1914 へ移動」の 1 行。Enter は、場所の無い時刻なら即座に時計を合わせ、
  場所が 1 か所に決まる（名前そのものの候補が 1 つ、記録の守備半径で 1 都市の写しを 1 つに数える＝`samePlace`）なら最初の Enter で飛ぶ。
  複数の場所が当たるときだけカードを残して選ばせる。
  携帯のシートは同じ欄の打鍵ごとの候補で、同じ行が出る。
- コマンドパレット: 同じ `interpret` の行を先頭に、読めなかったことを上に 1 行。
- Atlas `time.whereWhen`（`{query, pick?}`）を能力表・catalogue・dispatch に登録（`node scripts/atlas-caps.mjs --write`）。
- 共通部品への最小差分: `js/hist-cities.js` と `js/hist-places.js` に読み取り専用の `records()`（読み込んだ記録の配列）を 1 つずつ。

## 2. 否定した見立て・残したもの

- 初版は「検索欄の最初の Enter は解釈を見せるだけ、2 度目で動く」だった（依頼文の「選んで確定」を字義どおりに読んだ）。これは
  `.agents/rules/one-pass-or-a-reason.md` の「同じ操作を二度やらせない」に反するので撤回し、Atlas と同じ規則（一意なら 1 回・曖昧なときだけ選ぶ）に揃えた。
  解釈は打っているあいだから行として見えるので、Enter の前に確かめられる。

- 「先頭の数字も年」は「1600 Pennsylvania Avenue」を 1600 年にする——番地は先に来るので、裸の数字は末尾（か文全体）のときだけ年。
- 中国の年号のような未知の元号に付いた 1〜2 桁の年は、西暦 5 年などと読まず「変換できない」と述べる。
- ユリウス暦の日付は換算しない（時計の数える先発グレゴリオ暦で読む）。和暦の月日は 1873 年より前は変換しない。どちらも行の上で述べる。

## 3. 検査

- `node --test tests/where-when-search-checks.test.mjs`（新規 13 件、実際の `data/hist-cities.json` を実際の `js/hist-cities.js` で読む）。
- `tests/search-identity.spec.js` の 2 つの起動に相乗り（スイートの天井 0.2 分の余白に新しい spec を足せないため）:
  机上で「1914」の 1 回の Enter で時計が 1914 になり地図は動かない・「江戸 1868-01」の 1 回の Enter で東京へ飛び 1868-01-15 になる・
  「Salisbury 1950」（イングランドと、記録上のハラレ）は Enter でカードが残り時計も地図も動かない・パレットの「Berlin May 1945」がベルリンへ飛び 1945-05-15 になる、
  携帯で「Constantinople 1453」の候補が Istanbul を述べ、タップでイスタンブールへ飛び 1453 年になる。

## 4. 窓口（`check:surface`）に足した読み

`js/where-when.js` は `window.IntMapHistCities`（3）・`window.IntMapHistPlaces`（2）・`window.IntMapHistScale`（1）・`window.IntMapPlaceRules`（1）を読む。
前の 2 つは import できる持ち主が無い（`js/hist-cities.js` は window に置く IIFE、`IntMapHistPlaces` は `js/app-body.js` が作る実体）。
`IntMapPlaceRules` は検索欄と同じく遅延の `js/atlas-geo-resolve.js` が置くもので、静的に import すると重いモジュールを引き込む。
`IntMapHistScale` は `module-graph --plan` が「いま export できる葉」と述べるが、export を足すのは共通部品の別の作業なので、ここでは
他の 22 か所と同じ読み方に揃えた。`node scripts/global-surface.mjs --update` で基準を書き直した。

## 5. 配る重さ（`check:perf`）

- 新しい遅延チャンク `where-when`（13.0 kB）と `atlas-where-when`（3.7 kB）は、数字か「元年」を含む文を打ったとき／Atlas が初めて使うときだけ取る。起動の経路には無い。
- `atlas-console` は `time.whereWhen` の項目（行・catalogue の文・語句）の分だけ増え、帯（7.1 kB）を越えた（1422.7 kB > 1415.2 kB）。実行は
  `js/atlas-where-when.js` に出して遅延にした——それでも項目そのもの（planner が読む文）は Atlas のチャンクに要る。
- `command-palette` は「場所＋時刻」の行と注記の分 2.3 kB 増えた（15.4 kB）。読み方そのものは `where-when` チャンクに置き、パレットには呼び出しだけ。
- 両方の行を `node scripts/perf-budget.mjs --update` で上げた（越えた行だけが上がる）。

## 6. Atlas の検索で time.travel を押しのけていた（CI の atlas-reach ③ 36 < 37）

能力の検索（`js/atlas-capabilities.js` `search`）は、ある分類の能力が 1 つでも「名指されて」いれば、分類の示唆（`time` の hint）だけで
当たった同じ分類の行を落とす。time.travel は日付を訊く問いに自分の証拠を持たず hint だけで残っていたので、`time.whereWhen` が
Berlin などで名指された「On what date was the Berlin Wall opened? Show Berlin on the map.」で消えた。文書の stretch は `{"type":…}` ごとに
互いに素なので、同じブロックに並べても証拠は共有されない。⇒ time.travel 自身に読者の言葉（「何年何月何日」「on what date」など）を
`phrases` として持たせた。答えの鍵での到達は 36 → 38（床 37 は触っていない。「東海道新幹線が開業したのは何年何月何日？」でも time.travel が届くようになった）。
