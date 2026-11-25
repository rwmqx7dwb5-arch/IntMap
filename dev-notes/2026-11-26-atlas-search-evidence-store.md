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

## 4. 変更後の本番実測——**まだ測れていない**（2026-11-26 時点）
- 本番に届いたこと（事実）: PR #1433 が MERGED、migration `20261130100000` が本番に適用済み（`ai_delegation_journal.web_searches` を確認）、`ai-proxy` は v152（merge 直後の 2026-11-25 18:50 UTC に更新）、ページ側は main の 4c76be6 以降が公開済み（本番のビルド印 `2026-11-25T19:30:42Z-4c76be6`）。公開後のスモークの赤は外部ホスト `cdsarc.cds.unistra.fr` / `simbad.cds.unistra.fr` の DNS 消失で、この変更とは無関係。
- 測れなかったこと: 本番の Atlas に「日本・ドイツ・ブラジル・インドの人口」を出す検証を試みたが、検証用アカウントが「本日の無料 AI 上限」に達しており、ai-proxy への通信は 0 件だった。上限を迂回する操作（支援導線・別アカウント）は行っていない。公開後のジャーナルにも `outcome='ok'` の行がまだ無い（利用が無い）。`web.search` が実際に使われるか・同時に走るか・2 回目が再利用されるかは、**本番では未観測**。
- 代わりに確かめたこと: 単体（tests/atlas-search-evidence-store-checks.test.mjs の 8 本）で、同時の相乗り・TTL・状態復元・`web.search` の同時実行（ピーク 3）・`not_run`・ID での再読を観測している。
- 測る手順（利用枠のあるアカウントで 1 往復すれば足りる）: 独立した複数の検索を要る問いを 1 回、続けて同じ問いの 1 つを出す。ジャーナルで見る:
  `select task, web, count(*), round(avg(latency_ms)), round(avg(web_searches),2), max(web_searches) from public.ai_delegation_journal where created_at > '2026-11-25T18:50:00Z' and outcome='ok' group by 1,2;`
  変更前は atlas_turn の検索あり平均 23.8 s・p50 18.5 s（§1）。`task='web_search'` の行数（何問が別呼び出しになったか）と、その行の `web_searches`（1 に近い＝1 呼び出し 1 検索）が効果の指標。

## 5. 消したもの・引き継いだもの
何も消していない（加算のみ）。`research.analyze` の `turnPages` は残し、ストアの出典と重複排除して合わせる。

## 6. 残していること
- 親のホスト型検索はモデルの判断で従来どおり使われる。`web.search` を選ぶかはモデルの判断で、能力の説明に「複数の独立した問いは 1 回で同時に」と書いた。使われ方は本番のジャーナル（`task='web_search'` の行数・`web_searches`）で見る。

## 7. 起動費用（perf）の上げ幅
`atlas-console` の遅延チャンクが 1418.1 kB → 1437.6 kB（+19.5 kB、#1438 を取り込んだ main と同じ build 条件で測定）。**正味の増加**で、チャンクの割れではない: 新しい `js/atlas-web-evidence.js`（ストア）、`web.search` / `web.evidence` の 2 能力の実装と、モデルに渡す能力説明文（`doc`）、`web.browse`/`web.render` の再利用処理。起動時に読む主チャンク・要求数は変わらない（遅延チャンクのみ）。上限を `--update` で 1,437.6 kB に上げた。減らせる見込み: 能力説明文は `find_capability` で引かれる時だけ使うので、いずれ別チャンクへ分けられる。
