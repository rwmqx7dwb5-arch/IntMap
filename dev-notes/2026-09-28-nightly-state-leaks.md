---
title: 夜間 run 36348262163 の新しい赤は、共有ページに前のテストのパネルが残っていたこと（r322 → r388-detail・r170 の 3-D volume）と、鉄道の世界図を詳細が描ける前に下ろしていた空白——リセットは「地図の上にあるもの」を当たり判定で見つけて自分の × で閉じ、鉄道は詳細ソースが描けると述べてから世界図を下ろす
date: 2026-09-28
---

〈夜間 run 36348262163 の新しい赤を直す。製品の退行ではなく観測器、ただし 1 つは製品の空白〉

## 0. 測った

| 赤 | 実際に起きていたこと |
|---|---|
| `tests/r388-detail.spec.js` ①（1 回目） | 同じ worker で先に走った `tests/r322.spec.js` ② が `#btn-correlate` を押して Correlation の overlay（`position:fixed; inset:0; z-index:9998`）を出したまま終わっていた。失敗時のスクリーンショットは散布図で、線へのクリックは overlay に当たり `#rail-detail` は出なかった |
| `tests/r388-detail.spec.js` ①（再試行・新しい worker） | `hit: null`。待ちは `'rail-det-ln'` **または** `'rail-ln'` を 120 px の箱で訊いていて、世界図の線で満たされた。直後に `js/railways.js` が世界図を下ろし、詳細はまだ描かれておらず、別の `evaluate` でした点探索が何も見つけなかった |
| `tests/r170.spec.js`「Measure ▸ 3-D volume」（Deep rest 3/5 の 1 回目） | `points: 0`。右の Layers サイドバーが前のテストから開いたままで、右寄せのツールパネルがその分だけ左へずれ（`js/map-ui.js`）、4 回のクリックが全部ツールパネルに当たっていた（スクリーンショットで確認） |
| `tests/r168.spec.js` #7（2 回とも） | 30 枚のまま。スクリーンショットではフィードが最下部までスクロールされ、News タブは active |

**再現**（どれも修正前の木で）:
- `r322.spec.js` と `r388-detail.spec.js` を `--workers=1` で続けて走らせる → r388-detail ① が `#rail-detail` の待ちで落ちる（夜間と同じ形）。
- 一時的な spec で、1 本目が Layers サイドバーを開いたまま終わり、2 本目が r170 と同じ 4 回のクリックをする → `points: 0`。
- r170 の 3-D volume の直前にどのテストが Layers サイドバーを開いていたかは、成果物からは特定できなかった。候補として `tests/layer-manifest.spec.js` ②③ がある：タイルがまだ無いときだけ `toggle()` で開き、最後は**状態を見ずに**もう一度 `toggle()` する。ほかのテストがすでにタイルを作っていれば、最後の `toggle()` はサイドバーを**開く**。そのファイルはこの作業の範囲外なので手を入れていない。

## 1. リセットは名前でなく性質で閉じる（`tests/helpers/app.js`）

`resetPage()` が閉じていたのは `_close*(Menu|Popup)` と `#tool-panel` だけで、どちらの漏れもそこに名前が無かった。
**`#corr-overlay` と `#layer-sidebar-r` を足せばこの 2 件は直るが、次に足されるパネルは同じように漏れる**
（`.agents/rules/no-ad-hoc-hardcoding.md`）。そこでページに事実として訊く：

- **起動時の家具**は正確に列挙できる。根はどれも「canvas の祖先の子で、canvas を含まないもの」なので、最初のリセットの時点で表示されていて・`visibility:hidden` でなく・ビューポートと交わる子をすべて記録する。
  ⚠ 最初の版は格子に当たったものだけを記録していたので、幅 22 px でサイドバーと一緒に動く ‹ ボタンが、格子点に初めて当たった時点で「漏れ」と報告された。
- **いまクリックを受けるもの**は、ビューポートを 24×14 の格子に分けて `elementFromPoint` で訊き、それぞれの根まで持ち上げて求める。家具でない根は、どれもテストが開いたものである。
- 閉じるのは**その根自身の ×**（全ラベルが `×` のボタン）で、既存の `#tool-panel .tp-close` と同じ扉である。外から隠すことはしない（隠すとモジュールは開いているつもりのまま残る）。
- ⚠ **1 回の掃引ではなく、何度か繰り返す。** r170「every Companies figure」は、全面スクリムの市場カード（`#co-detail-ov`）が会社アトラス（`#co-popup`）の上に載った状態で終わる。1 回目の格子にはスクリムしか見えず、アトラスはスクリムを閉じて初めて露出する。1 回だけの掃引はアトラスの × を**押さずに**「閉じなかった」と報告し、施設を fit したアトラスが次のテストに残った。
  このとき同じ worker で後に走った r388-detail ① が 60 秒で timeout した（修正後の組み合わせでは緑）。
- **掃引をカメラの jumpTo より前に置く。** パネルを閉じるとカメラが動くことがあるので、名前のついたビューに戻すのは最後にする。
- × が無いもの・× を押しても消えなかったものは、worker ごとに 1 回だけ `console.warn` で名指しする（そのあとは覚えておき、テストのたびには出さない）。

**定数は 1 つ、`CLOSE_GLYPH = '×'`。** 実測（2026-09-28・`js/` と `index.html`）：全ラベルがグリフ 1〜2 字のコントロールのうち、`×` が 100、十字形の別字（✕ ✖ ⨯ ╳ ❌ `&times;` …）は 0。
`tests/nightly-state-leaks-checks.test.mjs` ① がこれを毎回測り直すので、アプリが 2 つ目の閉じるグリフを採った日に、何も言わずにパネルを取りこぼすのではなく赤になる。

## 2. 鉄道の世界図は、詳細が描けてから下ろす（`js/railways.js`）

`refreshDetail()` は `setSourceData('rail-det-src')` と同じ tick で `rail-ln` を隠していた。GeoJSON はワーカーで解析されてからタイルに切られるので、その間は線が 1 本も無い。
これを `revealDetail()` に移した。データを渡す**前に**待ち受けを張り（一方のエンジンは `setSourceData` の中で同期的に読み込み済みを述べる）、次のどちらかが先に答えたら世界図を下ろす：

- `rail-det-src` の `sourcedata` が読み込み済みを述べたとき。条件は、タイル着地（`e.tile`）とともに述べたこと、または告知でない（`sourceDataType` を持たない）こと。⚠ `content` / `metadata` / `idle` といった告知は描画の証拠にしない。まだタイルを 1 枚も頼まれていないソースは即座に読み込み済みと言うからで、これは `js/weather.js` の #R297 / #R298 と同じ形である。
- 地図が `idle` になったとき。何も取りに行く必要が無い場合（同じ中身は `skipData` が送り直さない・タイルはキャッシュから戻る）にはタイル事象が来ないので、こちらが答える。

時限は置かない。待つ間は同じ線路が 2 本重なるだけで、空白は生じない。より新しい表示・閾値未満への縮小・OFF・`drop()` は、待っている引き渡しを取り消す。

`tests/nightly-state-leaks-checks.test.mjs` ② は、モジュールを「いつ描けるかをテストが決める」偽の描画器の上で**評価**して、欠陥そのもの（線が 1 本も無いフレーム）を測る。
変異で確かめた：旧来の「同じ tick で隠す」を戻すと ② の 2 本が赤になり、告知を受け入れるようにすると ② の 1 本目が赤になる。

## 3. r388-detail の待ち（`tests/r388-detail.spec.js`）

待つのは `'rail-det-ln'` だけにした（zoom 11 で読者がクリックするのは詳細の線）。点の探索も `waitForFunction` の**中**で行い、点を 1 回で返す。こうすると返る点は、描画器が答えた瞬間に描いていた点になる。

## 4. r168 #7（`tests/r168.spec.js`）

固定の 900 ms を、期限（10 s）つきで「カードが 30 枚を超える」のを待つ形に替えた。assert は元のまま。失敗したときは、ハンドラが見た `scrollTop` / `clientHeight` / `scrollHeight` / News タブの状態と待った時間をメッセージに載せる。
**同期の scroll で追加されなかった理由は分からない。** 成果物には `renderedCount` も `newsFiltered`（`js/app-body.js` のクロージャ状態）も無く、変更前のファイルをこのマシンで 4 回＋3 回走らせても再現しなかった（変更前の側の赤は起動 timeout の 1 件だけ）。

## 5. 検査

- node: `tests/nightly-state-leaks-checks.test.mjs`（4 本）・`tests/r388-checks.test.mjs`・`tests/r266-checks.test.mjs` 緑。`npm run check:static`・`npm run check:engine` 緑。
- 再現の組み合わせ（`IM_TIER=all`・`--workers=1`）：r322 → r388-detail が修正後は 5/5 緑、`--repeat-each=3` で 15/15 緑。Layers サイドバーの漏れ → 3-D volume のクリックは 2 回とも 4 点、Correlation の漏れ → 次のテストの開始時は地図の中心が `CANVAS`、r170「every Companies figure」→ r388-detail ① は緑（警告なし）。
- `r170`・`r209`・`r322`・`r388`・`r388-detail` を `--workers=1 --repeat-each=2` で 40/40 緑、`r168` を `--repeat-each=3` で 30/30 緑、`r171`・`r650` は 17/17 緑。`layer-manifest`・`r205`・`r192`・`r142` も緑。
- ⚠ `--workers=2` で回した回に出た赤は、どれも起動 timeout・`dl-aod took 2034 ms`・遅延モジュールの 45 s 待ちといった負荷の形だった（同じマシンで別の作業も Playwright を回していた）。同じ spec を `--workers=1` で回すとすべて緑。
  ⚠ 最初の回は同じ worktree のポート 4344 を共有していたため、途中でサーバが落ちて `ERR_CONNECTION_REFUSED` が 40 件出た。以降は `PORT=4891` で回した。
