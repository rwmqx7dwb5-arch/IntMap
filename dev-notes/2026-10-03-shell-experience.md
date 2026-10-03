---
title: 「IntMap のいま」——夜の確認を読者へ。状態ページ・失敗が名指すデータ元・出典の一覧、Atlas 夜間評価が一度も走っていないことを worktree status が言う、中継の梯子も失敗の上流を述べる
date: 2026-10-03
---

〈依頼〉画面全体の体験の再開発（全権委任）。追補 2 件: ① upstream-liveness の夜間結果を読者に見える形にし、死んだ上流のレイヤーを空の地図ではなく理由付きで出す ② Atlas の夜間評価が Secret 不在で一度も走っていないことを `worktree.mjs status` と状態ページに言わせる。

## 0. 測った（前）

| 事実 | どこに在ったか | 読者に見えたか |
|---|---|---|
| 2026-10-02 の晩、113 ホスト中 6 件が応答せず（api.gdeltproject.org 429・api-v2.oec.world 403・celestrak.org・overpass-api.de・Overpass の予備ミラー 2 つ） | `upstream-liveness` の artifact（CI の中） | 見えない。該当レイヤーは空の地図か「読み込めません」だけ |
| atlas-eval.yml は全 8 回（runs API の `total_count`）すべて最初の段で停止、報告なし | 実行ページの annotation「missing repository secret(s): ATLAS_EVAL_REFRESH_TOKEN ATLAS_EVAL_SECRET_WRITER. Nothing was measured.」 | `worktree.mjs status` も言わない |
| この端末に IntMap の本体が保存されオフラインで開けるか | `sw.js` の `intmap-shell-<build>` | 言う場所が無い |

`upstream-liveness` の結果は「いつから」「最後に応答したのはいつか」を持っていなかった（`streak` と `from` だけ）。

## 1. 作ったもの

**データの道。** `scripts/build-service-status.mjs` が最新の `upstream-liveness` artifact と `atlas-eval.yml` の実行記録（runs・artifacts・失敗した段の annotation）を gh で読み、`data/service-status.json` に書く。`tle-refresh.yml`（main へ無人で載る唯一の道）が 1 日 2 回走らせ、同じ bot PR で運ぶ。言うことが変わったときだけ書く。読めなかった半分は `null` と理由で、前回の答えを今夜の答えのように繰り返さない。出自は先頭に値で（`check:datagov` の bundle 側は全 facet が埋まる。builder 側の実行時の 7 facet は他の builder と同じく台帳へ——静的に読まれる宣言は実行の時刻を述べられないため）。

**`lastAlive` / `downSince`。** `scripts/upstream-liveness.mjs` の `transitions()` が夜ごとに運ぶ。書くのは観測した時刻だけ（その夜 alive と判定された run の measuredAt、または前の結果から運んだもの）。それ以前の結果からは streak が言える分だけ導く（up の後 1 回 down ⇒ 前の run が最後の応答、この run が始まり）。

**状態ページ「IntMap のいま」**（`js/service-status.js`・設定 ▸ IntMap のいま／Atlas）。この端末・地図のレイヤー・データ元（毎晩の確認）・Atlas の品質評価の 4 節。見出しは「いま本当である最も悪いこと」。初めて使われたときに取得し、起動の経路に載らない（握りの `window.IntMapStatus` は起動済みの `js/layer-state.js`）。

**失敗が名指すデータ元。** 共有の読み手（`js/fetch-deadline.js`・`js/proxy-fetch.js`）が投げるエラーに要求の URL を載せ、`js/layer-state.js` が記録に残し、失敗に入った瞬間に夜の記録と結ぶ。中継（`?u=https://…`）は運んでいる先のホストで。pill の文・読み上げのラベル・Atlas の `snapshot()`（`upstream`・`detail`）に「このデータ元は 10月2日 から応答していません（毎晩の確認：…・最後に応答 10月1日）」。レイヤーとホストの対応表は作っていない。

**出典の一覧。** アプリ内の出典ダイアログと `sources.html` が同じ記録を読み、リンクのホスト（または `www.` を除いたサイトの下のホスト）が応答していなければ行に同じ文。登録ドメインの推測はしない（`*.nasa.gov` の 1 つが落ちても NASA の出典すべてには付けない）。

**名前の照合を 1 つに。** `hostMatches` を `js/host-match.js` へ移し、liveness スクリプトは再輸出。ブラウザが 2 人目の読み手になったため（写しを作らない）。

**データ元の名前を両言語で。** `scripts/outbound-hosts.json` の probe を持つ 113 行すべてに `whatJp`。

**worktree status。** `scripts/lib/nightly-status.mjs` の `atlasEvalState` / `atlasEvalLine`。brief は緑でないときだけ 1 行、full は常に 1 行。報告を残さなかった回は「評価の前に停止（何も測っていない）」と色とは別に言う。

**中継の梯子も失敗の上流を述べる。** `js/proxy-fetch.js` の `fetchViaProxy` は失敗を `null` と理由の語だけで返していたので、そこを通るレイヤーは訊いた上流を名指せなかった。戻り値は変えず、呼び手の `note` に `failure`（`{ reason, status?, url }`・`url` は訊いた上流であって中継ではない）を書く。各段が投げたものを集め、状態コードがあれば `http`、全段が時間切れなら `timeout`（応答なし）、文書でない答えなら `parse`、訊ける段が無ければ `unrelayable`（誰にも会っていないので上流を責めない）、それ以外は `network`。`js/layer-state.js` の `classify()` が共有の読み手の throw と同じに読む。人工衛星（`js/satellites-live.js`）は何も描けなかったときだけそれを `state().failure` で出し、`js/data-layers.js` が行へ渡す（入ったときに 1 回。毎秒渡すと新しい記録が夜の記録の文を落とす）。

**取り下げたもの: 初回の右パネルの幅の規則。** この作業は「左右の実際の幅の和が窓の半分以下のときだけ初回に右パネルを自動で開く」を入れていたが、並行する first-impression が「初回は開かない（前回の保存が開のときだけ開く）」を正として入るので、`js/map-ui.js` を `origin/main` の形に戻し、検査（node ⑨・spec ①）と文書（`docs/architecture/08-ui.md`・`PRODUCT.md`）からも外した。2 つの規則が同じ箇所を別々に書くのを避けるため。観測（デスクトップ初回で地図が約 250 px）は first-impression の規則で解消される。

## 2. 測った（後）

- `node scripts/build-service-status.mjs`（実データ）: 2026-10-02T10:44 の確認・113 件中 6 件が alive でない・Atlas 評価は 8 回中成功 0（2026-09-25 以降）・最新は評価の前に停止。
- celestrak.org / overpass-api.de は `lastAlive` 2026-10-01T11:11・`downSince` 2026-10-02T10:44（streak から）。GDELT・OEC と予備ミラー 2 つは系列の初回から down なので「2 回続けて」とだけ言い、日付は書かない。
- `node scripts/worktree.mjs status --brief`: `⚠ Atlas 夜間評価: 成功 0 回（全 8 回・2026-09-25 以降） / 最新 2026-10-02 評価の前に停止（何も測っていない）: … missing repository secret(s) …（8 回続けて）`。

## 3. 検査

- `tests/shell-experience-checks.test.mjs`（新規・node・12 件）: 照合関数が 1 つ／`lastAlive`・`downSince` は観測した分だけ（unobserved は動かさない）／読者向け要約は台帳の語だけ・streak 以上を推さない／Atlas 評価の「測っていない」／probe 行すべてに `whatJp`／中継の先で結ぶ・登録ドメインを推さない／文の en+jp と「いつから」を書かない場合／見出しの順位と「読めなかった」は灰色／同梱の出自／URL がエラーに載り記録に残る・状態ページは動的 import だけ／中継の梯子の `note.failure`（503・接続不能・文書でない答え・訊ける段なし・成功、を stub した fetch で評価）と人工衛星の行への配線／bot PR の道と worktree status の配線。
- `tests/ui-a11y-polish.spec.js` に 1 件（新しい spec ファイルは `check:testbudget` に余白が無いため同じ主題のこのファイルへ）: 設定から状態ページ・4 節・行数が同梱の記録と一致・登録されたダイアログ・Escape／中継経由の失敗が夜の記録のホストと結ばれる。
- `tests/global-surface-baseline.json` を `--update`。新しい名前は 2 つだけ: **`window.IntMapStatus`**（`system.module` が `window.IntMap*` を列挙して開けるようにするための名前。アプリ内の読み手は全部 `js/layer-state.js` の `statusPage` を import する——設定のボタン・Atlas の `diagnose`）と、**`window.IntMapDialog` の読み 1 つ**（`js/dialog.js` は export を持たない古典的な登録簿で、状態ページはそこへ登録しないと Escape とフォーカスの罠を失う）。レイヤーの記録は `window.IntMapLayerState` を読まずに `statusPage` が手で渡す（`js/service-status.js` は `sources.html` からも生で読まれるため）。
- `data/governance-ledger.json` を `--update`（`scripts/build-service-status.mjs → data/service-status.json` の実行時 7 facet。理由は §1）。

## 4. 残り

- **Atlas 夜間評価の Secret は未設定のまま**（`ATLAS_EVAL_REFRESH_TOKEN`・`ATLAS_EVAL_SECRET_WRITER`）。手順は `docs/TESTING.md`「Atlas evaluation」。評価用アカウントのリフレッシュトークンと、このリポジトリの Secrets 読み書きだけを持つ fine-grained PAT が要る。
- `fetchViaProxy` の `note.failure` を行へ渡しているのは人工衛星だけ。他の呼び手（カメラの州別一覧・企業の株価・統計比較・ニュース）はレイヤー行の失敗として報告していない（補助の取得か、パネルであって行ではない）ので、行には何も足していない。
- 状態ページの数字は bot PR が着地した時点のもの（最大で約半日遅れ）。ページは測定の時刻を必ず添える。
