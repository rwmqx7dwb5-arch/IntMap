---
title: ストリームが `done` の前に切れたあとの頼み直しは、答えを作り直していた——ai-proxy が 1 手の答えを再受信の鍵で短時間置き、頼み直しは置いた答えを受け取る（提供元を呼ばず課金もしない）。作り直すのは観測された失敗か、死んだ isolate のあとだけで、そう述べる
date: 2026-10-01
---

〈依頼〉監査の指摘: `js/ai-core.js` はストリーム（atlas-live-stream）が `done` の前に切れると同じターン鍵でストリームなしに頼み直す。サーバーは最初の要求を最後まで走らせて `waitUntil` で精算する。つまり**結果が持ち帰られなかった**（one-pass-or-a-reason §2 の原因 2）のに答えを作り直し、2 回目は別の答え・二重のモデル費用になりうる。目的: 完了した答えをターン鍵で短時間保持し、再接続を再計算ではなく再受信（冪等な再生）にする。上限は触らない。

## 0. 測った（コードから）

- **ターン鍵は 1 手を名指さない。** `x-intmap-turn` は 1 ターン＝最大 `TURN_MAX_CALLS`（12）手の要求を束ねる鍵で、`public.ai_turns` は (アカウント, ターン鍵) に 1 行（`calls`・`charged`・`succeeded`）。答えの本文はどこにも無い。⇒ 置き場は `ai_turns` の列ではなく、**1 手ごとの行**が要る。さらに開発者のアカウントは `openTurn` を通らず `ai_turns` に行を持たないので、`ai_turns` に載せると開発者の頼み直しだけ作り直しのまま残る。
- **`callId` は鍵にならない。** `aiCallServerFull` の `callId` は呼び出し側が `opts.callId` で渡せる。2 つの要求が同じ値を持てば、片方がもう片方の答えを受け取る。⇒ 鍵は要求を送るその場で新しく作る（`aiNewReplayKey`、`crypto.randomUUID`）。
- **頼み直しは消費の前に答えなければならない。** 消費（`consume_ai_turn`）は本文を読む前で、頼み直しが消費を通ると `calls` が 1 増える——12 手目のストリームが切れた場合、頼み直しは `429 turn_calls` で拒まれ、**置いてある答えを受け取れない**。⇒ 頼み直しの鍵はターン鍵と同じ理由で**ヘッダ**（`x-intmap-replay`）で運び、消費の前に引く。
- **`done` を送ったあとに置くと、置く前に切れた読者は見つけられない。** ⇒ `finish_ai_answer` は `done` の前（精算の後）。
- pg_cron は本番にある（`20260925110000_client_errors.sql` が同じ防御で予定を入れている）。ローカル／CI には無い。
- `sweep_ai_turns()` はどこからも予定されていない（今回の範囲外。記録だけ）。

## 1. 作ったもの

**表 `public.ai_turn_answers`**（migration `20261001090000_ai_turn_answers.sql`）: 鍵は (アカウント, ターン鍵, 再受信の鍵)。`state` は `running` → `done` / `failed`。`body` は `done` のときだけ（失敗は事実として置き、再生しない）。RLS あり・所有者は自分の行を読める・書くのは service_role の RPC だけ。
- `claim_ai_answer` — 行ロック 1 つで決める: `claimed`（走らせる。`attempts` と、作り直しなら `after_state` = `failed` / `abandoned`）／`done`（置いた答え）／`running`（別の要求が心拍を打っている。待つ）。
- `peek_ai_answer` — 取らずに見る。頼み直しが消費の前に使う。
- `beat_ai_answer` / `finish_ai_answer` — 取った試行だけが更新できる（追い越された試行は何も変えない）。
- `sweep_ai_turn_answers` ＋ pg_cron `ai-turn-answers-sweep`（15 分ごと）。

**定数の由来**（no-ad-hoc-hardcoding §4）
- 寿命＝`TURN_TTL_S`（900 秒）: その後は同じターン鍵が新しいターンを開くので、古い答えには戻る先が無い。
- リース＝心拍 2 回分（`HEARTBEAT_MS` 15 秒から導出）: 走っている要求は心拍ごとに更新し、1 回の遅れは許し、死んだ isolate は 2 回で分かる。⚠ 最初は「Edge Function の wall clock 上限（400 秒）」をリースにする案だった——死んだ isolate の頼み直しが最大 400 秒待つことになり、頼み直し自身がそれより先に殺される（free は 150 秒）ので捨てた。
- 待ちの間隔 1 秒は**推定**（提供元の往復は秒単位——atlas-live-stream の実測で最初の文字が 6.9〜71.5 秒——なので 1 秒の読み取りは待ちを最大 1 秒延ばすだけ）。

**ai-proxy**: `x-intmap-replay` を CORS に足した。消費の前に、頼み直しの鍵で `peek` → `done` なら返す（`charged:false`・`meta.replay {kind:"replayed", attempts}`・`meta.streamed` は落とす）／`running` なら完了まで読む。それ以外は普通の経路へ落ちて `claim`。`keyedAnswer` が `answer()` を包み: 取れたら走らせ（心拍つき）、`done` の前に置き、作り直しなら `meta.replay {kind:"rerun", after, attempt}`。台帳が答えなければ従来どおり走らせて `meta.replay {kind:"unheld"}`。鍵の無い要求は何も変わらない。`_shared/` は触っていない。

**ページ**: ストリームの要求ごとに `replayKey` を付け、頼み直しは同じ鍵を `x-intmap-replay` に載せる。封筒の `streamReplay` はサーバーが述べた種類（`replayed` / `rerun` / `unheld`）をそのまま運び、述べなかったら `unreported`（古いサーバー）。推測しない。window への写しは作らない（`check:surface` が新しい結合として拒んだ——封筒が呼び出しごとの正本なので写しは要らない）。

**変えていないもの**: `TURN_MAX_CALLS`・`TURN_TTL_S`・プランの枠・期限（`CONSTITUTION.md` §5）。台帳の順（消費は本文の前、精算は `done` の前、失敗は払い戻し）。作り直しの課金は普通の要求と同じく `consume_ai_turn` が決める（払い戻された失敗のあとは課金、続きの手は続き）。ループ（`js/atlas-agent.js`）は無変更。

## 2. 残っていること

- **配備の順**: migration → `ai-proxy` → ページ。ページが先に出ると、頼み直しの `x-intmap-replay` がプリフライトで拒まれる（切れたストリームの頼み直しだけ。最初の要求は本文の欄なので古いサーバーでも通る）。`ai-proxy` が migration より先だと `claim` が失敗し、`unheld` として従来どおり走る（安全側）。
- 置いた答え（Atlas の 1 手の応答本文）を最長 15 分＋掃除の間隔だけサーバーに置くようになった。プライバシーポリシー（`js/legal-text.js`）の該当箇所の確認が要る。
- DB の実行（`supabase db reset` / `supabase test db`）は、このマシンの Docker デーモンが止まっていて走らせられなかった。SQL は `supabase/tests/15_ai_turn_answers_test.sql` が CI で読む。

## 3. 検査

- `tests/atlas-stream-replay-checks.test.mjs`（12 件）: ai-proxy を**実際に走らせて**（この process で import し、提供元・認証・RPC だけを fetch で演じる）① 切断→頼み直しで提供元 1 回・消費 1 回・使用量の記録 1 回・払い戻し 0・`charged:false`・`replayed`、置いたのは `done` の前 ② 走行中の頼み直しは待って同じ答え・同じ鍵の同時 2 本は 1 本だけ走る ③ 観測された失敗のあとだけ作り直し（attempt 2・after failed）、心拍の切れた走行は `abandoned` で作り直し ④ 鍵の無い要求は従来どおり・台帳が答えなければ `unheld` ⑤ `js/ai-core.js` を実際に走らせて、鍵は要求ごとに別・頼み直しは同じ鍵をヘッダで運ぶ・`streamReplay` はサーバーの言葉（無ければ `unreported`）⑥ migration の RLS／権限／掃除、上限が動いていない、CORS。
  ⚠ その DB は claim / peek / beat / finish の JS の模型である。同じ人が書いた模型と実装は同じ間違いで一致しうるので、SQL そのものは pgTAP 15 が読む。
- `supabase/tests/15_ai_turn_answers_test.sql`（pgTAP・`no_plan`）と `00_structure_test.sql`（表を 2 リストに足して plan 96→98）。
- 近隣: `atlas-live-stream-checks`・`ai-quota-fairness-checks`・`atlas-gloss-checks`・`r333`・`r345`（CORS）・`backend-edge-hardening-checks`・`ai-one-ledger-checks` は 70 件すべて緑。
- ゲート: `check:static`・`check:types`・`check:atlasrepeat` は緑。`check:docs` は件数の写し 5 か所（migration 33→34、pgTAP 16→17、表 37→38）が赤——それぞれ `docs/FILES.md`・`docs/architecture/16-data-protection.md`・`docs/architecture/06-supabase.md` にある。
