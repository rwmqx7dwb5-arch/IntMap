---
title: Atlas が宣言するビュー（ui.compose）——JSON の仕様を IntMap の部品だけで描き、全部の問題を理由つきで拒む
date: 2026-11-20
---

# declarative-workspace — Atlas の宣言的 UI（ダッシュボード）

## 問題（外部監査 2026-11-20）
「Atlas に生成 UI／ダッシュボードが無い」。返答に載せられたのは `chart.compose` の図 1 枚か `ui.inlineControls` の操作の列 1 つで、
数字の札・表・図・操作・地名を 1 つのまとまりとして出し、あとで見返す手段が無かった。

## 直し方
- **能力 1 行だけ足した**: `ui.compose`（綴り `dashboard`・`js/atlas-cap-ui.js`）。251 → 252 行。row は `ui.inlineControls` と同じ性質
  （writes 空・risk `session`・confirm `none`・観測器 `none`）。`ui.inlineControls` の拡張にしなかったのは、あちらの引数（`items`）と
  意味（操作の列）を変えずに済ませるため。
- **仕様の正本は `js/atlas-ui-spec.js` の BLOCKS 表**（`metrics`／`table`／`chart`／`controls`／`places`／`text`）。schema（`viewSchema` →
  `js/atlas-schemas.js` → TOOLS.schemaOf）・カタログの形（`blockShapes`）・検査（`checkView`）はすべてこの表から導く。手書きの種類一覧は無い。
  `chart`／`controls` の種類は「その dispatch の綴り（`via`）」を名乗り、レジストリに無ければ理由つきで拒む。
- **二重実装を作らない**: `chart` ブロックは chart.compose の run を同じ dispatch で走らせる（`source` 必須・最小点数・`data-mark` は
  そのまま）。`controls` ブロックの描画は `ui.inlineControls` の run から `controlRows` へ切り出して 2 つの能力が共有する
  （`ui.inlineControls` の「描けない項目は外して残りを描く」は変えていない）。表と文は返答の Markdown 描画器（`mdMini`）に渡す
  （表は GFM にして `.atl-md-table` で描く。セルの `|` はその描画器の分け方に合わせて `\|`）。
- **検査は全部をまとめて返す**（一発で決める）: 未知の種類・未知の欄・上限超え・URL・HTML・表の列数違い・JSON 32,768 字超を、
  `blocks[2].rows[4]` のような経路と理由（en+jp）つきで 1 回で返す（`meta.code:'invalid_view'`・`meta.problems`）。部品が描画時に拒んだもの
  （出所の無い図、地図に無いレイヤー）も同じ一覧に入り、1 つでもあればビュー全体を描かない（半分だけ描いて成功と言わない）。
- **任意の HTML/JS を実行しない**: 仕様の文字列はすべて文字として扱う（`mdMini` か `IntMapSafe.html`）。タグを含む文字列は拒む（エスケープした
  ゴミを見せない）。URL も拒む——返答の中のリンクは「IntMap がそのページを取得した」と主張する（`demoteProseLinks` と同じ理由）。
  `places` のボタンは押されると `js/atlas-console.js` が**ボタンの属性だけから** `{type:'flyTo',…}` を組み、`runDirect` で Atlas のスレッドに流す。
- 上限（`LIMITS`）の由来は `js/atlas-ui-spec.js` の註（返答欄 ≤ 400 px、ノートの 1 MiB）。失効条件も同じ註。

## 調査ノート（判断が要る点として残した）
`js/atlas-notebook-store.js` の `NOTEBOOK_SHOWN = false`（2026-10-04 利用者:「機能だけ残すけど、いったんユーザーには存在せず、見えないように」）。
**この作業では `true` に戻していない。** 戻すと帯・シート・設定・`notebook.*` の 3 能力・ブリーフィングの扉・ターンの自動保存が全部利用者に見える
ようになり、利用者がはっきり隠した機能を戻す判断になるため。代わりに、戻したときにビューが保存・再表示される経路は実装した:
- ターンの記録はステップの引数をそのまま持つ（`entryFromTurn` → `cleanArgs`）ので、仕様は既に保存される。
- 詳細画面（`renderDetail`）が、この端末が記録した `ui.compose` のステップを、コンソールの dispatch（`D.redraw`）で**もう一度描く**。
  マークアップは保存しない（今の部品・今の検査で描く）。取り込んだ記録のビューは描かず、再現（`replayCalls` が外部内容の印を付ける）を通る。
- `ui.compose` は risk `session` なので `replayable` が真＝「地図を再現」でもビューが描き直される。

## 台帳と費用
- **output-taint の台帳 `js/atlas-notebook.js` 1 → 2**（`tests/output-taint-baseline.json`）。増えた 1 件はノートの詳細でビューを描く
  `box.innerHTML = r.html`——`ui.compose` が `IntMapSafe.html` と `mdMini` だけで組んだマークアップで、解析がモジュールをまたいで追えない葉
  （同じファイルの `D.mdMini(e.answer)` と同じ形）。
- **check:perf**: この木（origin/main より 2 commit 遅れ）で `atlas-cap-runs` +7.3 kB（`js/atlas-ui-spec.js` と `ui.compose` の run）、
  async gzip +24.5 kB、dist.assets +123.5 kB が天井を超えた。後 2 つの大半と `atlas-delegate` → `atlas-turn-results`・`gis-packed` の
  チャンク名の変化は、天井を書いた木とこの木の差（この変更は data/・css/ に触れていない）。origin/main が最新でないので
  `perf-budget --update` はしていない——merge 後の木で build して測り直し、上がった行だけを上げる。

## 検査
`tests/declarative-workspace-checks.test.mjs`（6 件・モジュールを評価する）: 全種類の仕様が通り schema の種類＝検査の種類、悪い仕様は全部の問題を
経路と理由つきで返す、レジストリの行と schema と agent の引数検査、run は部品だけで描き chart／controls を委ね部品の拒否でビュー全体を拒む、
`ui.inlineControls` の挙動は不変、ノートが仕様を保ち再現できる。
`tests/declarative-workspace.spec.js`（build した app・`runDirect` → executor → dispatch・実測 4.9 s、`tests/durations.json` に 5 s）:
5 種類のブロックが描かれ（図の札 2・表のセル 4・棒 2 本＝chart.compose の `data-mark`・地名ボタン 1）、HTML／URL／列数違いの仕様は 3 件の
理由を経路つきで返して何も描かない。

## 実測（2026-11-20・build した app・Chromium）
- (a) 仕様 → 描画、(b) 不正な仕様の拒否: 上の spec のスクリーンショットを目視（札・表・棒・地名ボタン・文がひとつの枠に並ぶ／拒否は 3 行の理由）。
- (c) ノート: `NOTEBOOK_SHOWN` を**一時的に** `true` にして build し（コミットしていない）、`ui.compose` を含むターンの記録（`entryFromTurn` の形）を
  端末の IndexedDB に置く → 再読み込み → ノートを開いて記録を選ぶ → 回答の下に同じビュー（札 2・棒 2・地名ボタン）が仕様から描き直された。
  ⚠ 観測: `runDirect` で走らせた手順はノートに綴じられない（モデルのターンだけが `onTurnEnd` で綴じられる）ので、(c) は記録を直接置いて確かめた。
  モデルのターンが `ui.compose` を呼んだときに記録へ仕様が入ることはノード検査 ⑥ が持つ。

## perf 天井の引き上げ
`atlas-cap-runs` +7.3 kB(js/atlas-ui-spec.js と ui.compose の run。これが本件の増分)。`async.gzip` と `dist.assets` は main の最新木で build して天井を超えたため同時に引き上げた(増分の大半は本件ではなく main 側のチャンク変動)。Notebook は利用者が 2026-10-04 に隠した決定を尊重して再有効化していない。
