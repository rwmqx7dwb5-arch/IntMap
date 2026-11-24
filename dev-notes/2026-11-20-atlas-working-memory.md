---
title: Atlas の長時間作業に作業記憶を足した——履歴が落ちても目標・条件・数値・出典・未解決が残り、数値は原本へ戻れる
date: 2026-11-20
---

〈依頼〉総合技術監査 3.4（P0）。会話要約だけでなく、目標・決定済み条件・完成した作業・保存データ・未解決・根拠を別々の構造で持ち、圧縮・復元・再注入・引き継ぎができること。重要な数値・出典は要約文に閉じ込めず原データへ再到達できること。

## 0. 測った現状（足す前）
- 長い作業が次のターンへ渡すのは `_hist`（48 行・返答 180 字・did 260 字）と `_wctx`（5 つの値）だけ。予算が尽きると `composeInput` は古い履歴を落とし「N 件省いた」の 1 項目を足すだけ。
- 今ターンの古いツール結果は 4,000 字に絞られ、`read_result` で戻れるが、**その ref は今ターンの `callById` だけ**——次のターンになると原本は無い。数値は clipped な文か消えた。
- 根拠（`makeEvidenceRegistry`）は 1 回の呼び出しに縛られ、会話をまたがない。ノートブックは利用者に非表示（`NOTEBOOK_SHOWN=false`）で、再利用できない。

## 1. 何を足したか（`js/atlas-working-memory.js`）
別々の構造: goal（計画の手順つき）・goals（過去の目標と結末）・decisions（キーつき・設定したターンと主体）・done（capability・引数・状態・ref・見出し）・pins（保存した数値＝値＋ref＋path。保管した原本に照らして検証し、原本が違う値を持てば原本の値を採る）・open（未解決。次のターンが挙げない項目は解消済み、読者への質問は答えが来るまで）・evidence・results（ツール結果の原本。ref は `t<ターン>.<call>`）。
- ループが答えた全 call を `noteResult` で**トリミングの前に**原本のまま保管する（`find_capability`・`plan`・`read_result` は app の結果でないので対象外）。数値の葉は住所つきで索引する（機械的・意味は読まない）。
- 入口は 1 つ: 既にループが持っていた `read_result`。前のターンの ref・`path`（1 値）・`memory`（全記録）にも答える。今ターンの結果への `path` も可。結果はモデルの次の手へ届く（one-pass-or-a-reason §2）。
- ブロックは `composeInput` の `memory`。履歴とは別枠（予算の固定費）なので履歴が落ちても届く。`_agentCtx` でターンに 1 回だけ作る（ターン内は同じバイト＝キャッシュ prefix）。セクションごとに公平な配分、新しい項目を優先、落とした分は件数と `memory` の読み出し口を名指す。
- 外部由来の印: 外部内容のあったターンを記録した記憶は `memoryOutside` で `contextOutside` に載る（SECURITY-ARCHITECTURE §8 item 16 と同じ扱い）。
- 引き継ぎ: `snapshot`/`restore`/`handoffText`、tab 内は sessionStorage（変更ごとに 1 tick に 1 回、上限つき）。

## 2. 再利用したもの・しなかったもの
`_wctx` は生きた作業文脈のまま（記憶には鏡として写し、ブロックでは二重に出さない）。ターン台帳（atlas-state）は operations の機械的記録のまま——未解決だけ読む。計画（atlas-plan）は手順を読む。`read_result`・`composeInput`・外部内容の印は既存のものを拡張。**新しい tool は足していない**（read_result の schema に optional `path` を足し、`offset` を必須から外した）。

## 3. 上限と、その由来（no-ad-hoc-hardcoding §4）
- 保管する本文の合計 1,500,000 字・device 用 900,000 字（localStorage の 1 origin 約 5M 字から。観測でなく見積もり／ブラウザの上限が変われば再測）。超えたら古い本文から外し、digest・shape・数値は残す。`read_result` が「本文は落とした・数値はここ・再実行は引数つきで」と述べる。
- ブロック 7,000 字（見積もり。`INPUT_BUDGET.total` 240,000 字の約 3%）。
- 件数の上限（pins 200・done 300 など）は無限増殖を止める柵であり、Atlas の手数ではない。

## 4. 永続化の判断（利用者に確認が要るもの）
sessionStorage（タブを閉じれば消える）にした。localStorage にすると質問文と結果が端末に残り続け、プライバシー文の更新が要る。端末をまたぐ・再訪問をまたぐ引き継ぎは、方針の決定（`NOTEBOOK_SHOWN` と同じ話）の後で足す。

## 5. 検証
`tests/atlas-working-memory-checks.test.mjs` が出荷モジュールと実ループを走らせる: 履歴を圧縮で落としたあとも数値がモデル入力に残る／前のターンの ref と path で原本の値が返り次の手のモデルに届く／ピンは原本と違う値を持てない／本文の追い出しは述べられ数値は残る／予算超過は名指し／未解決の解消・質問の保持／再読込（snapshot 往復）／巻き戻しで一緒に消える／外部内容の印。
既存の 2 本（`atlas-native-tools` ③・`atlas-agent-loop` R742 ⑤）は read_result の提示条件とモジュールの import に合わせた。

## 6. 起動費用の天井を上げた理由
`atlas-console` の async チャンクが約 15 kB 増えた（作業記憶モジュールが `atlas-console` から読まれるため。1,061 → 1,077 kB）。引き換えに得たのは、履歴が落ちても数値・出典・条件が原本へ戻れること。毎ターン使うので遅延読み込みにはしていない。CI の `async.gzip` も同じ理由で超えた場合は同じ判断で上げる。

## perf 天井の引き上げ(2026-11-24)

`atlas-console` の非同期チャンクの天井を 1190.5 kB → 1209.4 kB(+18.9 kB)に上げた。最新の main を取り込んだ状態でビルドして測ると、この PR のぶんだけ超える(取り込み前の測定でも +14.9 kB 超過)。増えた中身は、作業記憶(`js/atlas-working-memory.js`)を Atlas のターンに繋ぐ配線: 回答に載った出典の登録(`WM.addEvidence`)、ツール定義の読み戻し(`READ_RESULT_TOOL` の `recallable` 分岐)、`memory:WM` を `runTurn` へ渡す経路。長時間の調べものでコンテキストが途切れても、読んだ根拠を引き直せることの対価で、別チャンクへ切り出せる大きさのものは見つからなかった(console のクロージャが握る `_hist`・`turn` を直接読むため)。他の行は触っていない。
