---
title: Web 検索・取得を「検索と解釈を分けた共有の証拠ストア」に——同じ取得は 1 回・独立した検索は同時・証拠は参照 ID で読み直す
date: 2026-11-26
newsen: Atlas now keeps what it has already read or searched on the web for the session, shares it with the AI workers it delegates to, runs several searches at once, and can re-read any of it by reference.
pr: 1433
newsjp: Atlas が調べたページ・検索結果をセッション内で覚え、委譲した作業者と共有し、複数の検索を同時に走らせ、取得済みの内容を参照 ID で読み直せるようにしました。
---

〈依頼〉外部監査の項目⑤「Web 検索の実行効率」。同じ国の人口統計を 4 回検索する／検索が逐次で数十秒かかる／取得済みページを再利用しない／証拠を参照 ID で読み直せない。

## 0. 現行 main で再確認した監査の主張
- 古くなかった: `web.*`（browse / render / session）に URL 正規化・キャッシュ・同時取得の重複排除は無く、親と子の間で取得物は共有されていなかった。ジャーナルは検索を yes/no（`web`）でしか持たなかった。
- 直せないもの: ホスト型検索（OpenAI `web_search`・Anthropic `web_search_20250305`）は **1 回のプロバイダ呼び出しの内側**で 1 問ずつ逐次に走る（`js/atlas-toolsurface.js` の実測 38/18/26/46 秒）。IntMap 側からは並列化できない。⇒ 並列にするのは IntMap が走らせる検索（`web.search`）で、親のホスト型検索は従来どおり残す（能力は下げない）。

## 1. 変更前の本番実測（`ai_delegation_journal`・直近 8 日・outcome=ok）
| 種別 | 件数 | 平均 | p50 | p90 |
|---|---|---|---|---|
| atlas_turn・検索あり | 365 | 23.8 s | 18.5 s | 48.7 s |
| atlas_turn・検索なし | 322 | 5.1 s | 3.3 s | 8.2 s |
| atlas_delegate・検索あり | 11 | 81.0 s | 28.4 s | 178.6 s |
| atlas_delegate・検索なし | 5 | 10.2 s | 10.5 s | 12.0 s |

検索回数はジャーナルに無かったので変更前は測れていない（今回 `web_searches` を足した）。

## 2. 何を作ったか
- **`js/atlas-web-evidence.js`**（セッションに 1 つのストア）。URL は `js/atlas-evidence.js` の正規化（追跡パラメータ・fragment・末尾スラッシュ）で同一視、問いは語で同一視（大小・幅・空白・縁の句読点）。`acquire(kind,key,fetcher)` が ① 鮮度内の記録を返す ② 同時に走る同じ取得に相乗りさせる ③ ok だけ保存（失敗は保存しない＝次の呼び出しがやり直す）。TTL は page・render 10 分／search 5 分／cited 60 分（観測値ではなく選択。期限条件はファイル内）。繰り返しは**拒否せず**由来と年齢を添える（`evidence:{id,reused,how,ageSec}`）。`refresh:true` で取り直す。
- **取得の入口**: `js/web-browse.js` の `browse`(open・URL のみ) と `render` がストアを通る。再利用時はブラウジング状態（ページと ref）を戻し、保持している cookie は残すので、再利用したページの ref へのクリックは動く。ハンドオフ・失敗は保存しない。`web.session` は状態を持つ操作なので通さない。
- **`web.search {queries:[{q,lang?}], refresh?}`**: 問いを `Promise.all` で同時に走らせる。1 問 1 回の ai-proxy 呼び出し（新タスク `web_search`・`webMode:'required'`）。検索が実際には走らなかった（`webUsed` が偽）ものは `not_run` と返し、検索結果としては出さない。取得済みの問いは `how:'stored'|'joined'`。
- **`web.evidence {ref?,chars?,kind?}`**: ID・URL・検索語から記録を読み直す（本文・取得時刻・年齢・**出典の全リスト**）。ref なしは保持一覧。
- **親子の共有**: 子の引用（`atlas-delegate.js`）と親ターンの引用（`atlas-console.js`）を `note()` でストアへ。子の各リクエストの末尾に「いま保持している新鮮な記録」（ID・題・URL・年齢）を付ける（`replayKey` は変えない）。`research.analyze` の `webSources` にはそのターンで取得・引用された出典を加える（回答側で出典 ID が付く）。
- **計測**: ジャーナルに `web_searches`（migration `20261130100000`・`log_ai_delegation` の最後の引数・既定 0）。`web_search` 呼び出しもジャーナルに行を残す。

## 3. 検証
- `tests/atlas-search-evidence-store-checks.test.mjs`（8 本）: 同時の相乗り・TTL・失敗非保存・URL 別綴り・状態復元・ハンドオフ非保存・`web.search` の同時実行（ピーク 3）・`not_run`・参照 ID での再読・サーバ側の登録とジャーナル。
- `atlas-core-split` の写真（fixture）は `p_web_searches` を足した分だけ更新（検索を走らせた 1 件は 1）。

## 4. 変更後の本番実測
（本番公開後に追記する）

## 5. 消したもの・引き継いだもの
何も消していない（加算のみ）。`research.analyze` の `turnPages` は残し、ストアの出典と重複排除して合わせる。

## 6. 残していること
- 親のホスト型検索はモデルの判断で従来どおり使われる。`web.search` を選ぶかはモデルの判断で、能力の説明に「複数の独立した問いは 1 回で同時に」と書いた。使われ方は本番のジャーナル（`task='web_search'` の行数・`web_searches`）で見る。
