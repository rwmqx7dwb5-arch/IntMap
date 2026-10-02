---
title: Atlas をログイン前から見えるものに——押す前に無料枠を言い、押したら答え方を見せる／時計が過去なら例文もその時代から／携帯の Atlas タブの見た目を状態に合わせる
date: 2026-10-03
---

〈依頼〉Atlas を「押すまで正体が分からない機能」から「ログイン前から価値が見える商品の中核」へ。
本番（2026-10-03・未ログイン）で観測された 3 点から。

## 0. 測った（着手前）

| 何 | 着手前 | 意味 |
|---|---|---|
| 例文を押す（未ログイン） | `pick` が入力欄に入れて即送信 → `run()` が `HOST.user` 無しで `aiGate()`＋「Please log in to use AI features.」 | 読者が Atlas から最初に受け取る文が「答えない」だった。押す前にはどこにもログインが要ると書かれていない |
| 見本の素材 | `scripts/atlas-eval/cassettes/` 12 本は**全部 `origin.kind:"scripted"`**（欠陥と代表的な経路を手で書いたもの） | 本番の回答の記録は 1 つも無い。再生すれば「Atlas が言っていない回答」を見せることになる——使わない |
| 無料枠の正本 | `supabase/functions/_shared/plans.js` の `free.aiTurnsPerDay`（10）。`js/supporter.js` が既にブラウザから import している | 同じ扉から読む。数を文言に写さない |
| 1914 年の例文 | 候補は `V`（視界）・`P`（国）・`W`（世界）の 3 プールで、Chronos を読むのは `P` の `year`（重み 9）と `W` の `w-year` だけ。`euro`（重み 7）は `countryStats.currency==='EUR'` だけが門 | 「時計が過去」は 100 余の候補のうち 1 つの事実にすぎず、残りは全部今日の表・今日のポリゴン・今日の拠点を読んでいた |
| 「地図が今日か」を誰が知っているか | `js/time-borders.js` の `modernAt(when, live)`（live／今年／day-exact 記録の最終年より後 → 今日）。`js/compare.js` が同じ問いを自分の時計に訊いている | 年の閾値を書かずに済む |
| 描かれている時代の国境 | `IntMapTimeBorders.currentFC()`。ラベルの層は `_same` なら `_modName`、それ以外は `_locName`→`NAME` を描く。`_locName` は**読者の言語が英語でないときだけ**ラベル処理が書く | 名前は層が描く名前をそのまま使う |
| 携帯の Atlas タブ | 768 px 以下で `.control-panel` は segmented control（選択中＝浮いた白い pill、他は地の文字）。非選択の Atlas だけデスクトップのグラデーションの**輪**（`::before`）を持ち、特異度 (0,3,0) で携帯の `background:transparent` にも勝つ | 輪が「選択中」に見える。状態は `.active` クラスだけが持つ（`setMode`） |

## 1. 何を作ったか

**ログイン前（`js/atlas-examples.js`）。** 行の先頭に注記「Atlas を使うには無料の IntMap アカウントが必要です（1 日 {n} 回まで）」。
`{n}` は `planOf(DEFAULT_PLAN).aiTurnsPerDay` を実行時に読む。未ログインで例文を押すと**送らず**、その下にカードを出す:
問い・3 段（地図の状態を読む／IntMap の道具で地図を操作する／結果を読んでから最後に答えを書き、描いたものを残す——
`js/atlas-agent.js` の 1 ターンの形）・「図解（実際の回答の記録ではありません）」と書いた静止の図（アクセント色で塗った国・
経路・ピン）・無料枠・「ログインしてこの質問をする」「今はしない」。ログインのボタンは問いを入力欄に置いて
（`CTX.stage`——`pick` と違い送らない。`js/atlas-console.js` の 1 行に足した）ログイン画面を開く。
`exKey` がログイン状態を持ち、ログイン画面が閉じた（`#auth-modal` の style）ら引き直すので、ログイン後は注記もカードも消え、
例文は従来どおり押せば送る。文言は `js/locales/ui.{en,jp}.js` の `atlasGateNote`・`atlasPv*`（en＋jp。憲法 §7）。

**時計が過去なら、例文もその時代から。** `exFacts` が `eraFacts` を持つ: `modernAt` が「今日ではない」と答えたら
`examples()` は `V`/`P`/`W` を出さず、新しいプール `E` を出す。`E` の特定的な候補は描かれている集まりを
**視界の同じ 6×6 標本**で測ったもの（`js/atlas-view-subject.js` に `featuresInView` を足した。`landInView` と
格子・内側への半セル・細片の規則・ray-cast を共有し、格子は `VIEW_GRID` 1 つ）にだけ門を置く——中心の政体（`e-polity`）、
2 政体なら国境（`e-border`）、3 つ以上なら並び（`e-many`）、ラベル処理が `_same:0` と判定した政体がある（`e-renamed`）、
国境がこの形になった日（`e-since`。`changeAt` の非同期の答えを 1 件だけ覚え、届いたら行を描き直す。
`coverage().era` が真のスナップショットでは出さない）、視界の大半が海（`e-sea`）。年だけで成り立つ 4 文は `tail:1`。
年は `IntMapHistScale.yearText`（紀元前を紀元前と書く）。地図のクリック（`pointExamples`）も同じで、予約枠は
「この辺りでは{年}に何が起きていた？」（`HERE` の「最近」は今日の問い）。

**携帯の Atlas タブ（`css/intmap.css` の 768 px 以下）。** 非選択の Atlas は輪を外し（`::before{display:none}`）、
地を透明にして隣と同じ素の segment にする。藍色の字形だけが Atlas であることを示し、選択中の見た目は
グラデーションの塗り 1 つ。デスクトップの見た目は変えていない。

## 2. 変えていないもの

ログイン要求（`ai-proxy` の 401・`run()` の `aiGate`）、ログイン後の例文の挙動、今日の地図での 3 プールと重み、
Atlas の能力・上限（CONSTITUTION §5）。`P` の `year` と `W` の `w-year` は残っている——`modernAt` が今日と答える
過去（day-exact 記録の最終年より後で live でない年）では今もそれが時計の問いになる。

## 3. 否定した見立て

- 「`P` の候補のうち時代を超えて正しいものだけを残す」——`IntMapTimeCountries` が過去の人口・GDP を
  `countryStats` に重ねる（Maddison）ので、一部の欄は時代に合う。だが視界の国を決めるポリゴンも、通貨・言語・HDI・
  `bboxAll` も今日のもの。欄ごとに「時代に合うか」を候補へ書けば候補ごとの判断になる（場当たり）。
  「地図が今日か」1 つで切り替え、過去では描いているものだけを問う形にした。
- 「cassette を見本として再生する」——上の 0 の表。記録が全部 scripted なので採らない。

## 4. 費用

`npm run check:perf`（この木の build）: 非同期チャンク `atlas-console` が 1134.1 → 1144.2 kB（+10.1 kB raw、band 5.7 kB を超える）。
中身は時代のプール `E` の 10 候補×2 言語・未ログインのカードと図・その CSS・`featuresInView`・plans.js。
Atlas を開いたときだけ読まれる遅延チャンクで、起動時に読むもの（PHONE boot bytes 334.6 kB・eager CSS）は変わっていない。
天井は `node scripts/perf-budget.mjs --update` で `atlas-console` の 1 行だけを 1144.2 kB へ上げた（他の行は書いていない）。買ったもの: 未ログインの読者に押す前に条件を述べる見本と、時計の年から作る時代の例文。Atlas を開いたときにだけ読まれ、起動時の費用は変わらない。

## 5. 検査

`tests/atlas-before-login-checks.test.mjs`（新規 11 件）。出荷されている選択器を偽の時計・偽の時代の記録・偽の DOM で
動かす: 今日はユーロの例文が出うる固定具で 1914 年は出ない／国境・中心の政体・改名を描いた集まりから測る／
`modernAt` が今日と言えば今日のまま、記録が無ければ時代を主張しない／集まりが届く前は年だけの 4 文／紀元前の年と jp／
`changeAt` の日付は day-exact のときだけ・届いたら出る／クリックの予約枠／注記の数は plans.js の値で文言は数を写さない／
押しても送らずログイン画面も開かず、カードのボタンが入力欄へ置いてログイン画面を開く・ログイン後は従来どおり送る／
携帯の段で輪が外れている。変異で確かめた: 時代の分岐を切ると 5 件、押下の分岐を切ると 1 件が赤。
既存: `tests/atlas-examples-checks.test.mjs` の「`P` の重みの上限は `V` の下限より低い」が `const P=[` から**ファイル末尾まで**を
`P` と読むので、`E` を `V` の前に置いた（`E` は `V` と競わない——入れ替わる）。
