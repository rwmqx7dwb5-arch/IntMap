---
title: module graph 後の deep tier の赤 6 件——古くなった検査 4 本と誤った判定 1 本を実体に合わせ、共有リンクの層が 39 枚消えた正体（地図自身の自己修復の off→on が戦争の行に「読者の操作」と読まれ、時計を開戦日へ動かしていた）を直す
date: 2026-10-01
pr: 883
---

〈依頼〉main の CI run 36932631456（a925952 の deep tier）で赤い 6 件を直す。r167 / r168 / r169 / r545 は #860（module graph）で古くなった検査、r201 ① は判定の欠陥、restored-layer-before-style は 4 晩連続の赤で、欠けた層が 3 → 39 枚に増え、CI でだけ再現する。待ち時間の延長でごまかさず根本で直す。

## 0. 測った

| spec | CI で出ていたもの | 正体 |
|---|---|---|
| r167 #2 | `exportedKeys(js/tables.js)` が 0 件 | 読み手が `window.X = (function(){…})()` しか探さず、#860 後の `export const IntMapTables = (function(){…})()` を見落としていた |
| r168 #1 / r169 #1 | `typeof window.IntMapModules.<name>` が全部 `undefined` | 登録簿は #860 で廃止。ファクトリは `export function` を名前で import する（無ければリンクの誤り） |
| r545 ② | 失敗の札ではなく塗りの凡例が出た | 失敗を注入する accessor が廃止された登録簿に仕掛けられていて**一度も走っていなかった**。再読込みは成功して塗った——観測器が無効 |
| r201 ① | `dec −3.29°` で「両極に夜」が偽 | 判定が帯（\|dec\| < 90 − joinLat）だけを見ていた。層は継ぎ目の夜らしさ（−18° までの smoothstep）を 1/20 に丸めて 1 以上のところにだけ楔を描く。南極の継ぎ目の最低太陽高度 −1.66° → 夜らしさ 0.024 → 0。**製品が正しく、判定が誤り** |
| restored-layer-before-style | 押さえた側の起動で 39 層が欠落、retry は通常側の起動が 60 s 待っても落ち着かない | 下の §2 |

## 1. 古くなった検査（製品は正しい）

- **r167**: `tests/app-source.mjs` の `exportedKeys` が両方の綴り（`window.X = IIFE` と `export const X = IIFE`）を読む。事実は「その名前に束縛された IIFE」であって、束縛する文ではない。
- **r168 / r169 #1**: 新しい `factoryHomes(root, names)` が、各ファクトリについて「誰が呼ぶか」（`factoryCalls`）と「import 元のファイルが本当に `export function` として宣言しているか」をソースから読む。ページ側は起動の守り（`__imModuleCheck`）が清潔で、**ファクトリを走らせている間に例外が出ていない**こと。走った結果の仕事は既存の #2 以降（シムを通した実際の描画）が測る。
- **r545**: 注入をやめず、**届く場所に移した**。`countriesUi(HOST)` が返すオブジェクトは今は配られるバンドルの中にしか無いので、`js/countries-ui.js` の `return { … }` のキーを順番どおりに読み（新しい `returnedKeys`）、`dist/assets/*.js` を配るときにそのリテラルの `loadCountryData` 1 つだけを包む。**ちょうど 1 回包めたことを断言する**——何にも当たらない注入は、今回の赤と同じ「黙って通る」になる。
- **r201 ①**: 各極について、継ぎ目の最低太陽高度（反太陽子午線で `joinLat ± dec − 90`）→ ページが述べる薄明の端（`twilightEnd`）での smoothstep → `js/night-side.js` の `CAP_STEP`（`constFrom` で読む）の半段と比べる。丸めの縁の ±1/5 段では何も主張しない（楔は 180 個の中心を標本にしていて、反太陽点そのものではない）。日付に依らず正しい。

## 2. 共有リンクの層が 39 枚消えていた——観測器ではなく製品だった

**否定された見立て**: 「時刻のために預けた層の除外（`IntMapLayerTime.heldIds()` × 通常起動の所有表）が漏れている」。漏れてはいたが、それは二次的だった。欠けた 39 層の箱を `js/layer-time-decl.js` の判定に掛けると、**時計が 1939-08-23 にあるときに預けられる箱とほぼ一致**し（`dl-tz`・`dl-elect`・`beta-dl-dc`・`beta-dl-rail`・火山 2 つ・`wp-dl-alerts`・`wp-dl-trade`・`dl-netreach` …、WW2 の層だけは欠けていない）、残り（`imrad-obs-*`・`wp-tide-*`）はその年に自分で何も描かない `self` / `follows` の層。**リンクは時刻を名指していない（`tt` が無い＝今）のに、押さえた側の時計が開戦日にあった。**

**再現**（`tt` の無い全層リンク・時刻の表 `js/layer-time-decl.js` の到着を遅らせる——CI の遅い起動が自分で満たしていた条件を確実にしたもの）:

```
1.5 s   dl-ww2 … dl-yugoslavia  on   __imRestored=1        ← 復元
36.5 s  6 本とも               off  __syn=1               ← js/data-layers.js の自己修復（rearm）
37.9 s  dl-ww2                 on   __syn=1 → IntMapTime.set(1939-08-23)  war-layer toggle
38.6 s  dl-ww1                 on   __syn=1 → IntMapTime.set(1914-06-28)
…        korea 1950-06-25 / vietnam 1954-04-26 / yugoslavia 1991-06-25
```

復元された戦争の行は、時計（今）が記録の外なので**わざと何も見せていない**（`awaitClock`）。自己修復はそれを「点いているのに空」と見て off→on を送った。`js/war-fronts.js` は復元の印（`__imRestored`）だけを見ていたので、その「on」を**読者の操作**と読み、`js/war-layer.js` が時計を開戦日へ動かした。時刻の表が届いていれば門（`js/layer-time-kernel.js`）がその「on」を預かるので、**起動が遅いときだけ**起きる——CI でだけ赤く、ローカル単独で緑だった理由。時計が過去へ行けば、世界時刻の機構は今日の層を正しく下ろす。それが 39 枚。

**直したこと**:
- `js/war-fronts.js`: 地図自身の送り直し（`__syn`）も読者の操作ではない——門（`js/layer-time-kernel.js`）がすでにそう定義している（`!cb.__syn && !cb.__imRestored`）のと同じ線で、`{ restored, own }` を渡す。
- `js/war-layer.js`: `own` も時計を動かさない。描けずに待った再試行（`whenDrawable(() => toggle(true))`）が出自を落としていたので、同じ要求として `opts` ごと再試行する。

**修正後、同じ条件で時計への書き込みは 0 回**（修正前 5 回）。自己修復の off→on そのものは残る——それは別の層の正しい仕事で、ここで直したのは「その on が誰の手か」を読み違えていたこと。

## 3. 検査に足したもの（新しい spec は作っていない）

`tests/restored-layer-before-style.spec.js` の全層テスト:
- 通常側の起動は時刻の表を最後まで押さえる（`lateTable`）。基準を読んだあと、自己修復と同じ形の off→on（`__syn` を立てて配る）を WW2 の行に送り、**時計が今のまま**であることを断言する。前提（今・表なし・チェック済み）も断言するので、門が預かって通る空振りにはならない。**修正を外すと `live: false` で赤くなることを確かめた。**
  - ⚠ 最初の版は「戦争の記録が届くまで 60 s 待つ」をしていて、PR の CI（Browser rest 1/2）で時間切れになった。記録は data/wars.json と CShapes（13 MB、別スレッドで開く）で、175 層のページでは CI で 60 s 以内に揃わない。待つのをやめ、pulse の直後に行と同じ扉 `IntMapWarFronts.toggle('ww2', true, { restored: true })` を呼んでその答えを待つ形にした——記録の読み込みを（まだなら）自分で起こし、pulse の要求と同じ latched な load の上で、その後に解決する。記録が届いたこと（`record`）も断言する（読み込みが失敗すれば戦争は何も決めず、空振りになるため）。修正を外すと同じく赤。
- 比較の poll は「欠けた層」と並べて**押さえた側の時計**を返す（`{ clock: 'now', missing: [] }`）。時計が動いたら、それが名指される。

## 4. 検査

| 何 | 結果 |
|---|---|
| `IM_TIER=all npx playwright test r167 r168 r169 r201 --workers=1` | 33 passed |
| `… restored-layer-before-style r545 --workers=1` | 2 + 3 passed |
| `… 上の 6 本 + r355-cables + r185 --workers=2`（CI に近い負荷） | 47 passed (3.5 m) |
| 修正を外した build で restored-layer-before-style | 赤（`live: false`）——検査は欠陥を捕まえる |
| `node --test` module-split / suite-hygiene / engine-app-shell-split / history-wars / world-at-time / restored-layers-under-load / shell-app-body-modules | 120 / 120 |
| `check:static` `check:docs` `check:testbudget` `check:types` `dev-notes --check` | 緑 |

⚠ retry 側の症状（通常側の起動の「押さえた変更が全部配られる」待ちが 60 s で切れた）は CI の trace からは単独で確定できなかった。時計が開戦日へ飛ぶたびに約 50 の箱が下ろされ配り直される churn がその待ちを伸ばしていたと見ているが、**見立てであって実測ではない**。次の夜間で再び出たら、その時点の `IntMapLayerHold.pending()` の中身から始める。
