---
title: Atlas ブリーフィング——調査ノートの回答を、開けばそのまま読めるリンクにする。受け取った人はアカウントなしで、回答が終わったときの地図の上で回答と根拠（とその時刻）を読み、記録時の行が地図に描かれる。中身はリンクの断片に入り、サーバーには送られない。Atlas の `thisTurn` で「調べてブリーフィングにして」が 1 回の依頼になる
date: 2026-10-03
newsen: Atlas briefings: share a research note as a link. Anyone can open it without an account and read the answer, its sources and the map as it ended.
newsjp: Atlas ブリーフィング: 調査ノートをリンクで共有できます。受け取った人はアカウントなしで、回答と根拠と、回答が終わったときの地図をそのまま読めます。
---

〈依頼〉全権委任の第 2 波、Atlas 分野。「Atlas を『質問に答える窓』から次の段の商品へ」。例として、複数ステップの調査を
地図付きレポートとして保存・共有し URL 1 本で第三者が同じ地図状態と根拠を再生できるもの、定型の問いのレシピ、回答の根拠
（出典・データ時刻）を地図上に可視化する仕組み。AI 費用を増やすなら 1 日上限の内側で、Atlas の手数の上限を下げない・縛らない。

今日すでに入っていたもの（重複させない）: 調査ノート（`2026-10-03-atlas-os`）、地点プロファイル、実世界オブジェクト、
推論の 4 欄、ログイン前の Atlas、作例ギャラリー、ツアー作成（`?tour=custom&t=…`）。⇒ 作ったのは**ノートの上の 1 段**:
記録を「人に手渡せる、開けば読める調査」にすること。レシピは作っていない（下の §5）。

## 0. 測った（着手前）

| 何 | 着手前 | 意味 |
|---|---|---|
| ノートの記録を他人に渡す手段 | Markdown（地図なし）とノートのファイル（相手がダウンロードして設定から読み込む） | 「チャットに貼って、相手が開く」ができない |
| 記録が持っているもの | 問い・回答・表示（カメラ・時計・レイヤー）・操作（能力 ID と引数）・問い合わせの行（座標つき）・出典 | 地図付きレポートに要るものは**全部すでに記録にある**。足りないのは運び方と読む画面 |
| 共有リンクの運び手 | `MapState`（`js/map-state.js`）の SCHEMA。アドレスバーは移動のたびに `MapState.hash()` で書き直される | 断片に勝手な引数を足すと、次の移動で消える ⇒ 欄として宣言する |
| クエリの上限 | ツアー作成が実測: 8,192 バイトで 414（ホスト） | 断片はホストに送られないので、この上限は掛からない |
| 断片の上限（Chromium 153.0.8010.12） | 2,097,152 文字で開ける、2,097,153 で `net::ERR_ABORTED`（本記録の計測。下の §4） | `LINK_LIMIT_MEASURED`。Firefox と Safari は測っていない（作成画面もそう言う） |
| 地図のレイヤーを restorer で戻すと | **NATO を記録したブリーフィングが 25°E 58°N z3.4 から 48°W z1.9 へ飛んだ**（ブラウザで実測） | 下の §2 |

## 1. 作ったもの

- **`js/atlas-briefing-codec.js`**（データだけ）: ノートの記録 → ブリーフィング（再現で走らない操作は ID と状態だけ・
  メモは選んだときだけ・端末の帳簿〔ピン・同期時刻〕は運ばない）、deflate-raw＋base64url（先頭 1 字が詰め方）、
  展開の上限 `MAX_INFLATED`（推定 8 MiB＝アカウントのノートの 1 件あたり上限 1 MiB の 8 件ぶん。超えたら**読むのをやめて**
  `too-large`）、検証は**ノートの `normalize` をそのまま通す**、リンクは `MapState.encode`（`v` は最初にカメラを持つ回答の
  カメラ、基図と 3D も）。
- **`js/map-state.js` に `brief` 欄**（`b`、`restore:'full'`、`at:[300]`、末尾＝既存リンクはバイト同値）と `briefText`
  （base64url 以外は「無い」）。持ち主は新しい起動時モジュール **`js/briefing-link.js`**——値を覚えて store に答え、
  復元が値を渡したら `window.IntMapAtlas.call('openBriefing')` でカーネルを取りに行く（閉じるときは取りに行かない）。
- **`js/atlas-briefing.js`**（Atlas チャンク）: 作成画面（題・並べ替え・ノートから追加・メモを含めるか・長さ・コピー／
  共有／プレビュー／ノートのファイル）と、開いた人の画面（回答・**根拠と、その時刻**・記録時の行を地図に描く・地図を再現・
  今と比べる・ノートに保存）、パネルへ戻る帯。Atlas の状態に `briefing` 節を足す。
- **Atlas の能力 2 つ**（`js/atlas-cap-briefing.js`）: `briefing.share`（`ids` / `query` / `recent` / **`thisTurn`** / `title`）、
  `briefing.open`（`section` / `only` / `read`）。どちらも第 12 列 `external`（中身は他人の Atlas が書いた文）。
  `thisTurn` は、ノートに足した `claim(turnId)` / `onFiled(fn)` で、そのターンが綴じられた瞬間に作成画面を開く
  （記録がオフの読者でも、そのターンだけは記録を作って手渡し、保存しない。終わらなかったターンは理由を言う）。
- ノートの詳細に「ブリーフィングで共有」（ボタンの格子を 3 列 → 4 列）。

## 2. 見つけて直したもの（構造で）

**Atlas の `layers` restorer は、レイヤーを「戻す」のに「読者が点けた」と同じ `change` を出していた。** 共有リンク
（`js/map-ui.js`）とセッション（`js/session-tabs.js`）は戻す箱に `__imRestored` を付け、家へ飛ぶレイヤー（`js/layer-home.js`）
と戦争の日へ時計を動かすレイヤー（`js/war-fronts.js`）はその印を見て動かない。restorer は印を付けていなかったので、
同じ復元が戻したカメラ（と時計）を、遅れて読み込まれたレイヤーが動かしていた。restorer が戻す箱に印を付けるようにした
（点けるときだけ）。⚠ **undo と調査ノートの「地図を再現」も同じ restorer** なので、同じ欠陥がそちらでも直る
（同じ経路を通る。undo と再現では測っていない）。spec ① が「3 秒間カメラが記録した
位置に留まる」を測る。

あわせて、ノートのシートの背景が半透明（`--popup-bg` 0.72）で、左の列に入った Atlas パネルでは下の文字が透けていた
（ブラウザのスクリーンショットで確認）。ブリーフィングのシートと揃えて `--card-bg` にした。

## 3. 門と、名前を付けて増やしたもの

- 能力 184 → 186（到達可能 183 → 185）を文書に反映（`check:docs`）。deep の spec 135 → 136 本。
- `check:static` output-taint: **`js/atlas-briefing.js` 1**——保存された回答を返答と同じ `mdMini` で描く 1 か所
  （ノートの詳細と同じ葉。`mdMini` は文を符号化し、リンクは `IntMapSafe.url` を通す）。`output-taint.mjs --update`。
- `check:surface`: `window.IntMapAtlas` 33 → 34、`window.IntMapConsole` 39 → 40（`js/briefing-link.js` の 2 読み）。
  持ち主（`js/atlas-loader.js` と `js/lazy-modules.js` の mount）は export しない——起動時の欄の持ち主が Atlas の遅延
  カーネルへ届く道はこの 2 つの大域だけ。`global-surface.mjs --update`。
- `check:perf`（`perf-budget.mjs --update`）: eager.modules 311 → 312（`js/briefing-link.js`。起動時の gzip は天井内）、
  チャンク `atlas-console` 1301.6 → 1342.9 kB、async.raw 11937.7 → 12007.6 kB、async.gzip 3944.7 → 3969.3 kB。
  買ったのはブリーフィングの作成画面・読む画面・能力 2 つ・codec で、Atlas を開いたときに初めて読まれる。
  欄の持ち主だけは起動時に要る（無いと移動のたびに `b` が落ちる）。
- `tests/durations.json` に `tests/atlas-briefing.spec.js` 20 秒（実測: ① 17.3 s・③ 3.0 s）。未計測の spec は p75（40 s）で
  core に課金されて天井を 0.7 分超えた。実測で 10 秒を超えるので deep（PR では差分から core で走る）。

## 4. 検証

- 段 0: `node --test tests/atlas-briefing-checks.test.mjs` 7/7（往復・敵対的な欄・展開の上限・リンクの形・欄の持ち主・
  記録時の行と出典の符号化・能力表）。関係する node 検査（`tests/atlas-*-checks` ほか）1212/1212。
- 段 1: `check:static` `check:types` `check:i18n` `check:capabilities` `check:catalog` `check:archfiles` `check:surface`
  `check:perf` `check:testbudget` `check:docs`。
- 段 2: `npx playwright test tests/atlas-briefing.spec.js`（ビルドしたアプリ）2/2: アカウントなしで開く → 回答と根拠 →
  NATO が戻る → 記録時の行が地図に描かれ出典行に載る → カメラが留まる → 移動してもアドレスに `b` が残る →
  `briefing.open` が completed → 2 つ目の回答で時計が 1990 年 → ノートに保存（IndexedDB）→ 閉じると `b` が消える →
  ノートから「ブリーフィングで共有」→ リンクが元の記録に戻る／壊れたリンクは名前で拒み、地図は `v` で開く。
  卓上（1440×900）と携帯（390×844）のスクリーンショットを見た。
- 断片の上限: 一時スクリプトで Chromium 153.0.8010.12 に `http://127.0.0.1:<port>/#aaa…` を 2,097,151 / 2,097,152 /
  2,097,153 / 2,097,160 文字で開き、前 2 つは `location.href` がその長さ、後 2 つは `net::ERR_ABORTED`。

## 5. 残したもの

- **「Atlas レシピ」（定型の問いを保存して再実行）は作っていない。** ノートの「もう一度訊く」と「今と比べる」が
  同じ問いを再実行する道として既にあり、名前を付けて保存する層を足すかは利用者の判断に回す。
- 開いた回数を数えていない。匿名の利用集計（`usage-count`）の `entry` に `briefing` を足すには Edge Function の
  再配備が要るので、この回は触っていない（ブリーフィングのリンクは今は `link` として数えられる）。
- プライバシーポリシーは変えていない: 中身はリンクの断片にあってサーバーへ送られず、新しい保存先も受け手も無い。
  「リンクを持つ人は誰でも読める」は作成画面が述べる。
