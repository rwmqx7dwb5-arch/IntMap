---
title: 作り変えたスマホの画面の流れ——シートの段を「読者がいま何をしているか」の 1 つの表で決める。場所を選ぶとシートは検索欄の段へ下がりカードが見える、アプリが地図を動かせば full から half へ、カードは操作グループに届かない、Chronos は指で動かすものが先
date: 2026-10-02
pr: 904
newsen: On phones, the sheet moves out of the way when you pick a place or the map moves, so the place card stays in view.
newsjp: スマホで場所を選んだときや地図が動いたとき、シートが下がって場所のカードが見えるようになりました。
---

〈依頼〉本番（0cb41ee・390×844）で、作り変えたスマホの画面（シート 1 枚と操作グループ）の**流れ**に欠陥が 5 つ見つかった。構造で直す: ① 候補を選んだ後もシートが全体の段のまま ② 地点カードの × が操作グループの下 ③ Chronos を半分で開くと年スライダーが画面外 ④ 半分の段に残る 44 px 未満 ⑤ ピンチで `Unable to preventDefault inside passive event listener invocation.`。

## 0. 測った（前・このブランチの起点 0cb41ee のビルド、390×844・isMobile・hasTouch）

| 流れ | 前 |
|---|---|
| 「Paris」→ 候補 → 5 s 後 | シート `full`（上端 118 px）・カード y −108〜28（画面の上で切れる）・× は画面外・ボタン 28 px |
| Chronos を `half` で開く | 年スライダー y 819〜863（画面 844） |
| `half` のウィジェット盤 | 編集・追加の当たり判定 48×41・70×41（`::after` の 44 px がスクロール箱に切られる）・歯車 44×44（描画 32） |
| レイヤー画面 | List 26×25・すべて解除 74×22・検索欄 38 px・節の見出し 28 px |

**① の原因は 2 つ。** (a) 段の決め方が 3 か所（欄の focus・blur の条件・タブ）に散っていて、どれも「答えが地図に出た」を聞いていなかった——blur の戻し条件は「欄が空」なので、選んだ場所の名前が入った欄では戻らない。(b) 候補タイマー（`js/app-body.js`、打鍵 120 ms 後）が**選択の後に**発火すると、同じ欄の文字（いまは場所の名前）で候補を開き直す——本番の「5 秒後も候補 8 行」はこれ。

**② の原因。** カードはピンに中心を合わせた幅 280 px で、ピンが中央より右なら × がグループ（右端から 58 px）に届く。`#map-container` は `position:fixed` で**それ自身が重なりの文脈**なので、カードの z 1500 はその中の番号にすぎず、グループ（body 直下・1150）の下に描かれる——番号を上げても直らない（直すのは置き場）。

**④ の測り方。** 44 px は**当たり判定**（`elementFromPoint` を中心から外へ 1 px ずつ）で測った。ウィジェット盤・凡例は「描く大きさは小さく、`::after` で指の 44 px」という規則を既に持っているので、箱の大きさで数えると誤る（歯車は箱 32 で当たり 44）。

**⑤ を特定した。** EventTarget を包んで、passive なリスナーの中で `preventDefault` を呼んだものを記録: `js/mobile-map-input.js` の長押しの `touchmove`（`{passive:true}`）が `cancel(e)` を呼び、長押しが既に発火していれば（`fired`）`preventDefault` する。**指 1 本を 550 ms 以上置いて（長押しで文脈メニューが出る）から 2 本目でピンチする**と再現した（同時に 2 本置くピンチ・CDP の合成ピンチ・ctrl+wheel では出ない）。

## 1. 直したもの

**段の規則を 1 か所に**（`js/mobile-sheet.js` `detentFor`——純関数。`js/mobile-ui.js` の信号は全部 `go(activity)` からここに訊く）:
- `type`（欄にカーソル）→ `full`／`leave`（何も選ばず離れた）→ 欄が上げる前の段／`card`（答えが地図の上のカード）→ `min`／`move`（指ではなくアプリが地図を動かした）→ `half`／`tab` → `half`（欄が上げた `full` は読者のものではない）。答えは**下げるだけで上げない**。
- 「カードを置いた」は 1 つの名前のイベント `MAP_ANSWER_EVENT`（名前は `js/mobile-sheet.js` が持ち、`js/search-geocode.js` と `js/mobile-ui.js` が import する）。持ち主は事実を述べるだけで段を選ばない。
- 「アプリが動かした」は movestart。指の動き（MapLibre は `originalEvent` を付ける／3-D エンジンは付けないので、シートの外の指も数える）とシート自身の padding（発行中に印）は答えではない。
- ⚠ **飛行中に padding を動かすと飛行が止まる**（`easeTo` は進行中のアニメーションを止める）。シートは今動き、padding は飛行の着地後に追う——最初の実装の計測で、選んだ場所の飛行が 3 s を超えて続く間は padding が `full` のままだった（カードは着地まで上にある）。
- 選ぶと検索が終わる: 世代を進めて遅れた結果を捨て、欄に「選んだ名前」の印を付け（候補タイマーはその文字では開かない・次の打鍵で印は消える）、携帯ではキーボードを閉じる。

**地図の上のカード**: 重なり順の表に `--z-m-card`（1100：凡例 ＜ カード ＜ 操作 ＜ シート）。携帯ではカードの左右の端を CSS が持ち（画面の端から凡例トレイと同じ `--m-legend-right` まで）、尾だけが `--src-x` でピンを指す。× と 2 つのボタンは 44 px。ニュースの点のカード（`.m-news-pop-back`、暗幕つき）は z 1190 で、作り変えでシートが 1200 になってから**シートの下**にあった——地図から開いたポップアップの行（`--z-popup`）へ。

**Chronos**: `half` のまま（年を動かしながら地図を見るため）、シートの中では値・スライダー・目盛り・再生がタブの直後、時計の選択・日時へ移動・Date／Time の入力欄が後ろ（CSS `order`。デスクトップの順は不変）。「必要な段へ上げる」は地図を隠すので取らなかった。

**44 px**: 盤の題の行を 44 px にしてスクロール箱の上端から始める（`::after` が切られない）・レイヤー画面の検索欄 44 px／16 px（iOS のフォーカス拡大も止まる）・節の見出し 44 px・List と「すべて解除」は `::after` で指に 44 px（List と隣の間を 2 px 空けないと 43 になる）。

## 2. 測った（後・同じ手順）

| 流れ | 後 |
|---|---|
| 「Paris」→ 候補 → 着地 | シート `min`（上端 766）・候補は閉じたまま・カード y 175〜335、右端 324（グループ 330）・× は自分に当たる・ボタン 48 px・欄のフォーカスは外れる |
| Atlas タブを `full` にして `fitBounds`（アプリの飛行） | `half`・飛行は目的地（中心 lng 5.0）に着き、着地後に padding 380 |
| `full` で地図の帯を指でパン | `full` のまま |
| 欄に打って「Atlas に聞く」 | Atlas タブが `half` |
| 打って消して離れる | `min` へ戻る |
| Chronos `half`: Year／Date／Time | スライダー 703〜747／703〜747／713〜757、Time の再生 796〜840 |
| `half` の盤・Chronos・レイヤー画面 | 当たり判定 44 px 未満 0 |
| ニュースの点のカード（`half`） | y 296〜480、シートの上・閉じるが自分に当たる |

## 3. 検査

- `tests/mobile-shell-flow-checks.test.mjs`（新規・node）: `detentFor` の表（答えは上げない・欄の上げは読者のものではない）／答えの名前は 1 つで、`js/` で自分で綴るファイルが無い（全数）／重なり順の 4 行とカードの行・右端・ニュースのカードの行／Chronos の並べ替えが `#ntl-body` に実在する子を名指す。
- `tests/ui-a11y-polish.spec.js` ③b（追記）: 上の流れを 390×844 で歩く——選択の 120 ms の競合を含む検索→カード、`full` でのアプリの飛行と指のパン、`half` の盤・Chronos 3 タブ・レイヤー画面の当たり判定。
- `tests/z-layers-baseline.json` を `--update`（`.search-result-card → 1100`・`.m-news-pop-back → 2000`）。
- 段 1: static・engine・types・i18n・surface・docs・archfiles・perf・testbudget。段 2: `ui-a11y-polish`・`form-control-names`。

## 4. 残り

- **⑤ は特定したが直していない**——`js/mobile-map-input.js` はこの作業の触ってよい範囲の外。根本: 長押しの `cancel` は `touchend`（`{passive:false}`）では選択後の click を止める意味があるが、`touchmove`／`touchcancel`（`{passive:true}`）から呼ばれても何も止められない。`touchend` の時だけ `preventDefault` する形にすれば消える。
- Atlas タブの例のチップ（`.atl-chip`、`js/atlas-styles.js`）が `half` で 44 px 未満。範囲外。
- Time タブの再生（796〜840）は、home indicator（34 px）のある iPhone ではその帯にかかる。
