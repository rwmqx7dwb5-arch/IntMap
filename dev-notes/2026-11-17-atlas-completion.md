---
title: Atlas は「地図が無いのに完了」「海路を陸路の状態で判定」「失敗を実施済みとして履歴へ」「移動時間を証拠の窓に」をしていた——宣言と観測を照合し、未達を最後まで運ぶ
date: 2026-11-17
newsen: When Atlas could not draw the map or route it promised, it now says so under the answer and remembers what is still owed, instead of reporting the request as finished.
newsjp: Atlas が約束した地図や航路を描けなかったとき、完了扱いにせず回答の下に「まだ完了していないもの」を示し、次の会話にも未達として引き継ぐようになりました。
---

〈依頼〉利用者が 2026-11-17 の main（5faebfe）で関数単位に再現した Atlas の欠陥 2 報告（完了判定 6 項目・「2時間以内」の誤解釈 4 項目）を、根本で直す。見た目（回答下の余白・入力欄）は別作業。

## 0. 測った（直す前、実ソースを node で評価）

- runTurn に「3 回とも関数呼び出し無し・answer_mode "map"・本文あり」の偽モデル → `{"modelCalls":3,"stopped":"answered","mapDrawn":false,"outputGate":2}`。既存テスト（R511 ③）がこれを正常として検証していた。
- routing.setEndpoints の観測器は family `route`（陸路 `IntMapRouting`）。海路あり・陸路なし→`failed/no_route`、海路なし・以前の陸路あり→`completed/ok`、出発地だけ解決→実行側 `ok:true`。`IntMapRoute.setEnd` は何も返さず、計算は setTimeout の中。
- compose_map の `route`（上海→ロッテルダム）は大円弧: 最高緯度 61.6°、スエズを通らない、結果に根拠区分なし。
- 回答ピン: 描画試行 6 回・描画 0 件で「4 places from this answer mapped」。描画中の面 `atl-compose-src`・`nlq-poi-src` があるのに `IntMapObjects.list()` は `[]`。
- `_analyzeFreshness('名古屋駅から公共交通で2時間以内で行ける紅葉スポットを、直近3日の紅葉情報で比較して')` → `{"critical":true,"windowMs":7200000}`。
- ai-core: サーバが `retryable:false`・`meta.providerStatus:400` を返しても「temporarily unavailable」。openai.ts: `incomplete_details.reason` を捨てる。検索を timeout で外して作り直すと `webAttached:false,webUsed:false`（頼んでいない場合と同じ）。

## 1. 直したこと

- **完了判定**（`js/atlas-agent.js`）: 宣言（answer_mode・このターンの計画ステップ）と観測（`produced`・計画の観測状態）を照合する `unmetOf`。宣言した出力が無いまま差し戻しを使い切ったら `stopped:'output_unmet'`、返り値に `completion`（complete/partial/none）と `unmet`。"mixed" は従来どおりどちらか一方で満たされる（表示モードの仕様は変えず、照合と分けた）。`readReply` が `finish`（incomplete と理由）を保持、最後の回答生成の失敗は `trace.finalError`、通信失敗は `trace.transportErrorInfo`。execute に計画ステップ（`planStep`）を渡す。
- **海路**（`js/map-tools.js`・`js/atlas-cap-routing.js`・`js/atlas-capabilities.js`）: `IntMapRoute.run/state/seaPath/seaCheck`。run は操作 ID を振り計算と描画の完了まで待つ（後の run は前を `superseded` に）。パネルのボタンも同じ run。setEndpoints は両端の解決を必須にし、観測器 `seaRoute` が今回の操作 ID の海路を読む。produces 列は `route,map`。
- **合成航路**（`js/atlas-map-compose.js`・`js/atlas-cap-map.js`・`js/atlas-toolsurface.js`）: relation に `via`（地名。座標をモデルに書かせない既存の不変条件は維持）と `basis`（schematic／computed／track）。computed は経由点を順に海上経路で結び、失敗したら大円で代用せず `sea_path_failed` として描かない。track は実航跡データが無いので拒む。凡例・地物・結果で 3 区分と海上判定を区別し、判定は地図上の線を数える（`relations_not_rendered`）。
- **回答ピンと一覧**（`js/atlas-verify.js`・`js/map-tools.js`）: 座標解決と描画完了を分け、`map.poi` 名義の面に描かれた件数で報告（`not_drawn`）。`IntMapObjects` の `collect()` は描画管理（`render.drawn`）に claim された描画中の面を発見して載せ、地物 ID は描いたモジュールのもの。
- **履歴と表示**（`js/atlas-console.js`）: `[did: …]` は実行器の観測（`__exec` を `opState` で読む）が completed のものだけ。未達は元の要求とともに返信の 180 字抜粋とは別の行で履歴に入り、`ASTATE.endTurn` に `completion`・`unmet`・`request`・`failed`・エラーの code/status/retryable。最終回答があるとき、調査ツールの途中回答と失敗操作のメッセージは折りたたみと 1 行の「完了しなかった操作」へ。同じ計画ステップの調査は安定した goal ID で 1 つに。
- **鮮度**（`js/atlas-console.js`）: 期間を全部読み、今に結び付いたもの（直近・過去・今後・現在から・last・past・〜前…）だけを証拠の窓に（複数なら狭い方）。それ以外は「別のものを測る期間」としてモデルに渡す。窓の手前の観測は日付付きで比較し、「窓内で観測」「以前に観測（日付）」「取得できず」を分けるよう指示。話題ごとの例外は書いていない。
- **伝送と調査**（`js/ai-core.js`・`supabase/functions/ai-proxy/*`・`js/atlas-cap-research.js`）: Error に code・status・retryable・meta。meta に `status`・`incompleteReason`・`web:{state,reason,searches,sources}`（3 プロバイダ）。研究の注意書きは検索の結末と回答が引いた記録の由来から作り、ツール結果として Atlas にも届く（`mechanical()` が `web`・`finish`・`retrieved`・`webNote` を通す）。
- **出典契約**（`js/atlas-answer-contract.js`・`js/atlas-answer-audit.js`・`js/atlas-answer-pipeline.js`）: `metric.kind` = statistic／stated。stated（運賃・所要時間・観測日）は unit だけ必須。宣言なしは statistic。同じターンで先に取得したページは呼び出し前に証拠台帳へ登録。

## 2. 形式上の削除

- 海路の旧 `compute()`（setTimeout 実装）→ `run` が同じ役目（計算・描画・パネル表示）を完了報告つきで引き継ぐ。
- 研究の固定注意書き（「取得済みの見出し中心」）→ 検索の結末から作る注意書き。死んだ訳文 4 行と staging 1 行を codemod で除去。
- i18n の床: fr・ko の inline 5671→5670、zh・zh-hans 5879→5878。下がったのは、上の固定注意書き（"Live web verification did not complete … PROVISIONAL assessment…"）の訳行で、英文がもうどこからも呼ばれないため（その文自体が今回の欠陥）。de・es・ru の positional は新しい文で 7109→7115。
- 鮮度の `_FRESH_NUM`（最初の 1 件だけ読む正規表現）→ `_FRESH_DUR`（全件）。

## 3. 測れていないこと

- 本番での原因分岐（どの turnId がどの経路を通ったか）は本番ログが無く未確定。元の 2 つの日本語質問の全文は報告に無かったため、回帰テストは同じ形の質問で組んだ。
- 同じ呼び出しの中で検索が開いたページにはまだ ID が無い（ID が付くのは同じターンの次の呼び出しから）。
- 置いた定数: `ANCHOR_KM = 40`（港・海峡の点の周りで陸を数えない半径。推定。由来と失効条件はコードに）。ツールブロックの番人を 12,000 → 13,000 字（catalogue 64,250 字の再来を防ぐ番人で、方針ではない）。
