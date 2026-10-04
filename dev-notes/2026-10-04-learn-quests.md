---
title: 学ぶクエスト——地図の実データから問題を作り、地図の上で答える出題エンジン（場所当て・年代当て）と、クラス全員に同じ問題を配る挑戦リンク
date: 2026-10-04
pr: 973
newsen: Learn quests: find cities on the map or guess the year of a day in history with the year hidden, answered on the map. A challenge link gives a whole class the same questions.
newsjp: 学ぶクエスト——都市の場所当てと、年を隠した歴史のある日の年代当てを、地図の上で答えます。挑戦リンクを開いた人は全員が同じ問題を解けます。
---

〈依頼〉 地図そのものを教材にする出題エンジン「学ぶクエスト」(learn-quests)。既存のクイズ（`js/analysis-edu.js`）は
消さず縮めず、その上に IntMap の実データから問題を生成するエンジンを足し、クイズのメニュー・レイヤー ▸ ツール・挑戦リンク・
Atlas から入れるようにする。現状仕様の正本は `docs/architecture/08-ui.md` §8.6.4。

## 0. 測った

- `data/gazetteer-phone.json.gz` は 12,000 行（GeoNames、人口順）。`placeKinds` のうち settlement でないもの（PPLX 市の一部
  802・PPLH/PPLQ/PPLW/PPLCH 廃絶 等）を除くと 11,000 余り。
- `data/on-this-day.json` は 926 件（戦争 655・国境 271）。1 月 1 日付け（`maybeYearOnly`）16 件。出来事の文に 4 桁の数字を
  含むもの（「1943年のベンガル飢饉」「1949年休戦協定」「since 1940」…）が数十件。除いた後の年代当ての出題候補は 893 件。
- **難易度を順位の等分 3 段で切ったら、「やさしい」の最初の 1 問が Changyi（中国、302,072 人）だった。** 都市人口はおおむね
  順位に反比例する（Zipf）ので、順位の等分は「よく知られている」を測っていない。順位の対数で等分（境は N^(1/3)・N^(2/3)、
  いまの N で 22・495）に直した後、同じ seed の最初の 2 問は武漢・デリー。人口の閾値はどこにも書いていない。

## 1. 何を作ったか

- `js/quest-engine.js`（純関数）: 種類のレジストリ（`where`・`when`）、seed（FNV-1a → mulberry32）からの決定的な問題列、
  1 つの採点尺度 `round(1000^(1−x))`（x = 誤差 ÷ その問題で起こりうる最大の誤差。最悪の答えがちょうど 1 点、スキップは 0）、
  挑戦リンク `?quest=<kind>.<seed>.<n>` の読み書き。定数 1000 の由来・失効条件・正本はファイルの註に書いた
  （`.agents/rules/no-ad-hoc-hardcoding.md` §4）。最大の誤差は定数ではなく、地球の半周（`js/geodesy.js` `_HALF_CIRCUM`）と
  索引の `span` から来る。
- `js/quest-panel.js`（遅延・`window` グローバル無し）: 出題・地図のタップ（`claimClick` で消費し、下の地名ポップアップを
  開かない）・正解と回答の大円と距離・年代当ての間は `<body>` の class 1 つで年と日付の表示を隠す・合計と挑戦リンク・
  自己ベスト。閉じると時計と視点を戻す。
- `js/atlas-cap-learn.js`: 能力 `learn.quest`（`start`・`link`・`state`・`close`）。判定はパネル自身の状態を呼んだ後に読む
  （`.agents/rules/one-pass-or-a-reason.md`）。目録は自分の節 `learn.quest` を持つ（`tools-panels` に置いたら同じ節の
  `panel.education` が「学ぶ / learn」で見つかるようになり、check:capabilities ㉓ の台帳が動いたため、節を分けた）。
- 入口: クイズのメニューに 2 項目、レイヤー ▸ ツール に `tool.learnQuest`、`src/main.js` が `?quest=` を読む（`?tour=` の隣）。
- 授業ページ（`teachers.html`・`ja/teachers.html`）に「クラス全員に同じ問題を」の節（文は `scripts/landing-text.mjs`）。

## 2. 写さずに借りたもの（一覧の外のファイルを触った理由）

- `js/geodesy.js`: 測地距離の関数が無かった（`_gcPoints` の中で中心角を計算しているだけ）。`_centralAngle` を取り出して
  `_gcPoints` と新しい `_distKm` の両方がそれを使う——大円の線と報告する km が 1 つの式になる。`js/gis-geometry.js` の
  `distanceKm` は GIS コア（遅延の大きなチャンク）の中にあり、その工場を呼ぶと `window.IntMapGisGeometry` を書くので使わなかった。
- `js/on-this-day.js`: 出来事の視点（`stateFor` の中にあった）を `viewOf` として取り出した。年代当ての地図と「この日の地図」の
  リンクが同じ出来事を別の場所に置けない。
- `js/bus.js`: `MAP_ANSWER_EVENT` の送り手に `js/quest-panel.js` を足した。
- `tests/global-surface-baseline.json`: `window.IntMapGeodesy` と `window.IntMapSafe` の読みが 1 つずつ増えた（新しい
  グローバルは無い）。どちらも所有者が export を持たない古典スクリプト／公開物で、`js/on-this-day.js`・`js/my-map-doc.js` と
  同じ読み方。`--update` で記録した。

## 3. 否定した見立て・残したもの

- **`js/lazy-modules.js` の `LAZY_REGISTRY` には登録しなかった。** 登録の条件が「`window` にグローバルを公開すること」
  （`publishes` を検査する）で、グローバルを増やさない方針（check:surface）と両立しない。同じ「必要になったときだけ取得」を
  `js/here-now.js`・`js/command-palette.js`・`js/on-this-day.js` と同じ字句の `import()` で行い、起動の静的グラフに入らない
  ことを検査 ⑥ が測る。
- **1 月 1 日付けの国境の出来事は出題しない。** 記録が年しか述べていないかもしれず、「その日の地図」が記録の述べる日でない
  ことがある（`js/on-this-day.js` が見出しにしないのと同じ理由）。年そのものは記録が述べているが、16 件を外しても候補は 893 件。
- **基図の地名ラベル**——最初の実装は隠しておらず、場所当てで拡大すると答えが読めた（問題として成立していない）。ラベルの処理
  （`js/map-ui.js`・`js/app-body.js`）は source の更新のたびに**スイッチの状態どおり**に可視性を再適用するので、スタイルの層を
  隠しても戻る。⇒ 名前を書く行の一覧を quest 側に書くのではなく、**行の宣言に事実 `names: true` を足した**
  （`scripts/lib/layer-descriptor.mjs` の ROW_FIELDS・地名／自然地名／施設名の 3 行）。パネルは `nameItems()` を読み、読者と同じ
  チェックボックスで切り、答えを出したら**自分が切った行だけ**戻す。`tests/layer-descriptor-checks` ① の写真には
  2 つ目の意図した変更として「宣言が `names` と述べる行に、`html` の直後に `names: true` が付く」を足した（どの行かは宣言から読む）。
  本番前のプレビューで、出題中は 3 行とも off・答えると 3 行とも on に戻ることを確かめた。
- アドレスバーは地図の状態（`tt` を含む）を書き続けるので、年代当ての間もブラウザのアドレス欄には日付が出る（画面内の表示は隠す）。
- データを作り直すと同じ seed でも問題は変わる（その版の問題になる）。リンクに版を入れることはしていない。

## 4. 検査

`tests/learn-quests-checks.test.mjs`（node --test、9 件）: ① 同じ seed→同じ列・違う seed→違う列 ② 場所当ては settlement だけ・
帯は順位の対数・距離に単調・完全で 1000・対蹠点でちょうど 1・距離を測れないときは採点しない ③ 年代当ては |Δ年| に単調・
候補のどの文にも年が無い・年を含む出来事は実在し、外れている ④ 1 月 1 日付けは出ない ⑤ 挑戦リンクの往復と拒否 ⑥ パネルと
エンジンが起動の静的グラフに無い・全ての入口が import() ⑦ 年を隠す class が Chronos（`js/news-timeline.js` が書く全要素が
`#news-timeline` の中にある）・`#m-clock`・`.dl-clockrow`（時計の年を出す欄）に当たる ⑧ Atlas の行と目録が全種類を名指す ⑨ 名前を書く行（宣言の `names`）が基本表示で、場所当てで切られ・答えと終了で戻り・戻すのは切った行だけ。
Playwright の spec は足していない（試験時間の予算の余白が 0.3 分）。
