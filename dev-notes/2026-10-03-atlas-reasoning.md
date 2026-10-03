---
title: Atlas の推論 3 項目を、文章ではなく欄を持つ結果にする——シナリオ（項目 12）・期間の変化（項目 8・9）・相関（項目 10）
date: 2026-10-03
newsen: Atlas can now work through what-if scenarios, change over a period, and whether a correlation between two things holds.
newsjp: Atlas が「もし〜なら」のシナリオ、期間の変化、2 つの関係が確かかを、欄を持つ結果として答えられるようになりました。
---

〈依頼〉 PRODUCT.md §4 の 20 項目のうち未達だった 3 つを、能力として実装する。修正ではなく足し算。Atlas に制限は足さない
（CONSTITUTION.md §5）。一発で決める（one-pass-or-a-reason.md）。文言は en + jp。

## 0. 先に測ったもの

- `panel.correlate` は引数なしの行で、返すのは「相関ツール」の 1 語だけだった。パネル自身は r・ρ・国数を描くが、
  それは読者の目にだけ見えた。しかも `ps.length >= 3` で「非常に強い正の相関」と書く——**3 か国の散布図と 190 か国の散布図が同じ言葉**。
  外れ値・欠損件数・区間・反証は、パネルにも Atlas にも無かった（`data.exploreRelated` は最大の例外を 1 件持つが、
  欠損も区間も持たない）。
- `time.*` に期間を訊く能力は無かった。材料は揃っていた——`readYear`（両端）・`changeDates`（国境の変化日）・`data/wars.json` の
  日付つき出来事・Maddison・`LayerTime.coverage`——が、「t0 と t1 の差」を訊く入口が無かった。`research.events` は直近 168 時間の
  ニュース専用で、過去の期間には届かない。
- `research.scenario` に当たるものは無く、シミュレータは生の出力を返すだけだった。

## 1. 作ったもの

**`js/atlas-reasoning.js`**（新・純関数だけ。DOM も window も持たず、検査が評価できる）

- シナリオ: `scenarioFrame`（空の欄を全部まとめて名指す）→ `scenarioCall`（前提を各モデルの引数へ。モデルが入力を持たない前提と、
  取れない基準時点は `applied:false` で残す）→ `scenarioReport`（4 欄。`complete` が偽なら報告しない）。
  モデルごとの事実表 `SCENARIO_MODELS`（ash・radiation・tsunami・pandemic）。文は各シミュレータが自分で印字している注記と
  science.html の方法の節から。
- 期間の変化: `changesPeriod`・`diffPolities`・`diffEconomy`・`diffLayers`・`rankChanges`。
- 相関: `correlationReport`（n・欠損・Pearson/Spearman と Fisher 区間・外れ値・4 欄・`assertion: none|tentative|stated`）。

**能力**: `research.scenario`（`js/atlas-cap-research.js`）・`time.changes`（`js/atlas-cap-time.js`）・`panel.correlate`
（`js/atlas-cap-panel.js`。`x` / `y` を足し、パネルが描く報告を返す）。**UI**: 相関パネルが同じ `correlationReport` を描く
（確認できたこと／考えられる説明（未検証）／反証／限界）。`window.IntMapCorrelate.open(o)` は `{report, picked, x, y, …}` を
返し、`o = {x, y}` で 2 指標を選べる。

## 2. 構造として決めたこと（場当たりでないことの根拠）

- **言葉は標本が決める。** 強さ・向きの語は、n < 4 か区間が 0 に届くときは使わない。区間の半幅が 1 段階（パネルの帯の幅 0.2）以内なら
  「述べる」、広ければ「示唆される」。0.2 はパネルが昔から使う帯の幅で、`BAND` 1 か所にある（帯を変えるとき失効）。
- **年を日にしない。** シナリオの基準時点が年だけなら、モデルに日を代入せず「反映できない」と述べる。期間の変化の日付は
  記録が述べるものだけで、述べない記録は `date:null` のまま。1 月 1 日の変化日は「年だけの可能性」と印を付ける
  （historical-verification.md §2 ③）。片端だけが述べる統計は「ゼロからの増加」と読まず、件数だけ数える。
- **モデルは再実装しない。** シナリオは `K.dispatch` で各シミュレータ自身の能力を呼ぶ（成果物と観測器はそのまま）。同じ呼び出しを
  繰り返さない（モデル 1 回・曝露 1 回。失敗は失敗として欄に書く）。
- **モデルの表を別に持たない。** 各シミュレータの項目に `scenario` 欄（subject・baselineParam・data・excluded・uncertainty）を宣言し
  （`js/atlas-caps.js` の `ENTRY_KEYS`。形は項目の検証が拒む）、`scenarioModels(entries)` が項目から表を組む。引数語彙は項目の schema
  そのもの。能力 ID をキーにした手書きの表は `atlas-capability-single-source` ⑤ が落とすので、最初の版（`js/atlas-reasoning.js` の
  `SCENARIO_MODELS`）はこれで書き直した。方法の節（`science`）を持つ `sim.*` で `scenario` も理由台帳 `NOT_YET` も無いものは落ちる。
- **重要度は数で、何を数えたかを印字する。** 国境の変化日＝出現・消滅 1・境界変化 ½、戦争＝期間内の日付つきの出来事の数。
  歴史の判断ではない。（観測: 戦争記録は 6 件・出来事 655 件で `kind` に重みの根拠が無い——重みを付けるなら別の典拠が要る。）
- **宣言した上限。** 調べる変化日は既定 40（`maxDays` で最大 366）。調べなかった数を答えに書く。

## 3. 結果の欄・検査

- `tests/atlas-reasoning-checks.test.mjs` 23 件（空欄の拒否・前提の扱い・表と schema の一致・4 欄が空でない・期間・差分・統計・
  順位・相関の語の制限・外れ値・欠損・到達性）。
- `scripts/atlas-eval/cassettes/rail-request-reached-nothing.json` を `--write` で録り直した: 「所要時間 距離」の find が返す
  カテゴリ語（`time`）だけの尾に `time.changes` が 1 つ増えただけ（差分は 4 行）。`atlas-capability-single-source` ⑥ が緑に戻る。
- 触った段のゲート: `check:capabilities`（`research.scenario` の subject-findable は jp の主題語を doc の頭に置いて解消）・
  `check:catalog`・`check:atlasrepeat`・`check:static`・`check:i18n`（辞書行は「使用データ」に合わせた＝既存と衝突しない）・
  `check:surface`・`check:docs`（能力 178 → 180・到達可能 179）・`check:archfiles`・`check:agents`。

## 4. check:perf（作業木で `npm run build` のあと）

- 引き上げた行: **`analysis-correlate` 23.6 → 25.8 kB**（報告の描画 1 関数・CSS・指標の解決）、
  **`atlas-console` 1258.1 → 1284.8 kB**（能力 2 本の本体、シナリオの 4 シミュレータの宣言＝`scenario` 欄の文、計画者が読むカタログの断片）。
- **新しい async chunk `atlas-reasoning` 15.0 kB**（2 つの能力と相関パネルが共有する純関数）。起動（eager・phone）は
  **変化なし**（334.6 kB・3 requests）。main の CI が merge 後にその天井を記録する。

## 5. 残したもの（今回やらない）

- `sim.earthquake`・`sim.rfCoverage`・`sim.terrainWater`・`sim.ballistic`・`sim.lineOfSight` はシナリオのモデルにしていない
  （4 欄の文がまだ書かれていない）。検査の台帳 `NOT_YET` が理由つきで持つ——モデルに足すと台帳の行を消す必要が出て気づく。
- `time.changes` の「重要度」は件数で、歴史上の重みではない。重みを持つ典拠を見つけたら差し替える。
- 相関の「考えられる説明」は論理的な 3 通り（x→y・y→x・第三の要因）と、r と ρ の差から読める形だけ。領域知識の説明は
  Atlas が足す。
- 9 言語: en + jp のみ（9 言語体制は凍結）。

## 統合時の性能予算

超えた行だけ `--update`（推論の 3 能力と相関の報告のぶん）:
- async.raw: 11866.2 kB → 11937.7 kB
- async.gzip: 3917.3 kB → 3944.7 kB
- async chunk "atlas-console": 1266.3 kB → 1292.8 kB
