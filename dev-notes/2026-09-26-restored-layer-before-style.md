---
title: スタイルが読める前に復元されたレイヤーは、チェックが入ったまま永久に描かれなかった——箱の change を1か所で預かり、待ちは期限で「準備できた」と言わなくした
date: 2026-09-26
---

## 何が起きていたか（本番 38d0463 で観測）

`&l=dl-planes,dl-radar,…` を持つリンクを**隠れたタブ**で開くと、2 回とも:

- 航空機: `Uncaught Error: Style is not done loading.`（`startTraffic` がスタイルを待たずに同期で `addSource`）
- レーダー: `Uncaught (in promise) Error: Style is not done loading.` ×2（`whenStyleReady()` が**約 6 秒で強制解決**し、
  未解析のスタイルに `addRainViewer` させた）
- タブが見えてスタイルが読めても `lyr-planes` / `lyr-radar` は現れず、aviation-feed への要求も 0 件。
  **チェックは入ったまま描かれない**。外して入れ直すと描かれる。
- 海底ケーブルだけは同じ条件から回復した——#R187/#R355 がそのレイヤーにだけ再試行を持たせていたから。

## 根本原因（2 つ、どちらも構造）

1. **観測器の嘘。** `whenStyleReady()`（`js/data-layers.js`・写しが `js/time-borders.js`・`js/time-admin1.js`）は
   `canDraw()` を待ちつつ、**41 回 × 150 ms のポーリングが尽きたら無条件に解決**していた（#R41 が `idle` だけを
   待って永久に止まった件の保険）。#R170 以降は待つ述語が `canDraw()`（スタイル解析済みか）になり、タイルの
   往来で偽にならないので、保険の理由は消えていた——残ったのは「見えなかった準備を『準備できた』と答える」
   ことだけ（`.agents/rules/one-pass-or-a-reason.md` §2-1 の形）。
2. **入口が 1 つなのに、関門が無かった。** 指・共有リンク（`js/map-ui.js`、`load` が来なければ 8 秒で走る）・
   セッション復元（`js/session-tabs.js`）・既定 ON（`js/app-body.js`、600 ms で走る）・Atlas・お気に入り・パック
   ——どれも最後は**箱の `change`** で、行の持ち主（20 前後のモジュール）がそこで addSource/addLayer する。
   スタイルが受け取れるかを訊くのは個々のハンドラ任せで、訊かないもの（`startTraffic`）と、訊いて期限で
   諦めるもの（上の 1）があり、**再試行を持つのはケーブルだけ**だった。

隠れたタブで起きる理由: MapLibre はスタイルを**アニメーションフレームの中で**解析する（`browser.frame`）。
隠れたタブはフレームを走らせないが、タイマーは走る——復元の予備の時計だけが先に進む。

## 直したこと

- **`GE().whenCanDraw()`**（`js/geo-engine.js` のファサード・型は `types/geo-engine.d.ts`）: `canDraw()` が真に
  なるまで**決して解決しない**待ち。`styledata`/`load`/`idle` の購読＋150 ms ポーリングを、待ち手の数に
  よらずビューごとに 1 組。3 つの `whenStyleReady()` はこれを返すだけにした（写しと期限を消した）。
- **`holdUntilDrawable`**（`js/layer-rows.js`）: document の capture リスナで、manifest が宣言する箱の `change` を
  **レンダラが在って `canDraw()` が偽のあいだ**止め（`stopPropagation`——同じ document のセッション保存は利用者の
  クリックをそのまま見る）、後で箱ごとに 1 回、着いた順に、配る時点のチェック状態で出し直す。
  - 最初の `load` より前に預かったもの → **`load` の直後**。それまでに来たものも同じ列に並ぶ。
  - それより後（スタイル差し替え）→ `whenCanDraw()`。
  - レンダラが無い → 素通り（従来どおり）。
- ケーブルの梯子は残した（削除には承認が要る。いまは「待ちと追加のあいだにスタイルが消えた」場合だけの網）。
  註だけ現状に合わせた。

## 実測

再現は `page.addInitScript` で `requestAnimationFrame` を保留し `document.hidden` を真にする（＝隠れたタブの条件
そのもの。応答の遅延もモジュールの差し替えもしない）。16 秒保持してから解放。

| | 修正前 (HEAD 8d6ffd42) | 修正後 |
|---|---|---|
| `dl-planes,dl-radar` | `Style is not done loading.` ×2・`lyr-planes`/`lyr-radar` 不在 | 両方描かれる・例外 0・`load` 処理が走る |
| `sharedIds()` 全 87 件（通常起動と突き合わせ） | **23 レイヤー欠落**（180 秒待っても）: 航空機 5・船・放射線観測 3・火山 6・基本表示の道路/鉄道/州境/海岸線・地球全体の衛星ベース と極冠 | 欠落 0 |

報告された 2 つだけでなく、基本表示（`cb-roads`・`cb-rail2`・`cb-admin1`・海岸線）まで同じ形で失われていた。

## 否定された見立て

- **「`canDraw()` が真になった瞬間に配ればよい」**——最初はそう実装した。報告の 2 件は通ったが、87 件では
  スタイル解放から **28 秒たっても `js/app-body.js` の `load` 処理が走っていなかった**（`__imBoot.progress()` が 58 の
  まま、`layer-world-base` が無い）。MapLibre の `load` は「その時点の全 source が読めた」ときにしか発火しないので、
  解析の瞬間に 87 件の source を足すと、アプリ自身の起動処理がその後ろに並ぶ。アプリの復元経路は元々 `load` の
  後に走るよう書かれていた（`js/map-ui.js`・`js/session-tabs.js`）——予備の時計が先走った要求だけ、その順序に戻す。
- **「期限を延ばす」**——延ばしても、見えないものを見えたと答える形は同じ（`one-pass-or-a-reason.md` §3）。
- **「各レイヤーに try/catch と再試行を撒く」**——ケーブル以外の 20 前後のモジュールに写すことになり、次に足される
  レイヤーは黙って漏れる（`no-ad-hoc-hardcoding.md`）。守る事実は「箱の `change` はスタイルが受け取れるときに
  届く」で、それは入口の 1 か所が持てる。

## 検査

- `tests/restored-layer-before-style.spec.js` ①報告の 2 件 ②`sharedIds()` を実体から読み、通常起動の図層集合 ⊆ 保留起動の
  図層集合（手書きの id 一覧を持たない）。どちらも修正前の木で赤、修正後で緑を確認した。
- `tests/restored-layer-before-style-checks.test.mjs` ①待ちは 60 秒の偽時計でも解決しない・`styledata` で解決・
  取りこぼした event はポーリングが拾う・レンダラ無しは解決しない ②js/ の全 `whenStyleReady` 宣言（発見して数える）が
  エンジンの待ち ③関門: 起動時は `load` まで預かり順序と最終状態で 1 回ずつ・素通りの 3 条件・差し替え時は時計でなく
  `canDraw()` で配る。
- 旧実装の形を証人にしていた `tests/r170-checks` と `tests/r421-checks` #13（後者は「6 秒で強制解決すること」を
  要求していた）を、同じ主張（canDraw で解決する・同じ述語を使う）を新しい証人で問うよう書き換えた。
- `js/time-borders.js` を Node で走らせる `scripts/histeras/time-borders.mjs` の偽エンジンに `whenCanDraw` を足した
  （その harness の host は `canDraw()` 偽なので、決して解決しない待ち）。無いと `tests/r700-seam-density-checks` が
  `whenStyleReady(...).then is not a function` で落ちた。
- 新しい spec の実測を `tests/durations.json` に入れた（ローカル壁時計 69.8 s。`tests/r143.spec.js` の同条件の実測
  10.7〜12.9 s／表の 9 で較正した上限 59）。価格が `CORE_MAX_S` を超えるので、merge 後は deep（この PR では差分として core）。
  deep の本数（111→112）と全体（117→118・80.2 分）を述べる文書の数を合わせた。

## 残っている懸念

- 起動時に最初の `load` が永久に来ない環境では、預かった箱も永久に配られない。ただしそのとき `js/app-body.js` の
  `load` 処理（起動画面の段階・既定レイヤー・衛星ベース）も走らないので、この変更で新しく壊れるものは無い。
- 起動の最初の `load` 前（通常のタブでは数百 ms〜数秒）に指で入れたレイヤーは、`load` まで描画が遅れる。
- `js/app-body.js` の基本表示の一部は `once('idle')` で待つ（`idle` は忙しい地図で来ないことがある）。箱の `change`
  経由の起動は関門が守るが、それ以外の再描画経路は今回は触っていない。
