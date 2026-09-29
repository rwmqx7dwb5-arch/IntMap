---
title: 有料の提供元へ通じる扉を 1 つにし、鍵を持つ 6 本すべてにプロジェクト全体の 1 日の天井を付けた——モデル名は 1 表、失敗は本文でなく長さを運ぶ
date: 2026-09-29
---

〈依頼〉`supabase/functions` の監査結果 6 点: ① モデル ID が 5 関数に散在し古い ② 提供元呼び出しの
私的コピーが 3 つ ③ `monitor-run` が提供元のエラー本文を所有者が読む列に保存 ④ `ai-proxy` に
プロジェクト全体の日次上限が無い（アカウントを作れば請求に上限が無い）・`atlas-embed` の全体上限は
1 アカウントで枯らせる ⑤ `ai-proxy` の Anthropic 経路が web 検索の有無を返さない
⑥ `ai-proxy/index.gemini-backup.ts`（境界の無い旧版）。

## 0. 測った

- **本番の台帳（2026-09-29 読み取りのみ）**: `public.ai_turns` で最も多い日は 2026-09-17 の
  114 呼び出し／43 ターン。AI を使った口座は 1 日に最大 2。口座は 56。開発者口座は台帳から免除されて
  いるので、その呼び出しは数に入っていない。
- `public.news_ingest_runs`: 96 run/日（tick 72 ＋ summarise 24。migration の予定表どおり）、
  AI 地点解析は最大 1,188 件/日（2026-09-23）。`public.current_news` の AI 地点解析は最大 770 件/日。
- `public.who_don_extracts`: 抽出は 2026-09-09 の backfill 1 日だけで 461 件。
- `public.area_monitors`: **0 件**（監視は本番で誰も使っていない）。
- ⚠ **`public.ai_usage.count` に負の値がある**（例 2026-09-16 に -97、09-17 に -20、08-27 に -81。
  すべて 1 口座）。払い戻しが消費を上回った跡で、#R801 の settle（答えが出たターンは払い戻さない）より
  前の日付だけ。今回は直していない（下の「残り」）。
- `relay_take` は任意の scope 名を受ける（migration 20260918100000）——新しい天井に migration は要らない。

## 1. 直した

- **`_shared/ai-provider.js`（新規）**: 既定モデルの表（`PROVIDER_DEFAULT_MODEL`・`OPENAI_DEFAULT_MODEL`・
  `FALLBACK_CHAIN`・`OPENAI_LAST_RESORT_MODEL`）、提供元の期限とバイト上限、`ProviderFail` /
  `providerFail(status, bodyLength)`（引数に本文を運ぶ口が無い）、`spendCeiling`（`<fn>:global:day`・
  fail-closed・`<FN>_GLOBAL_PER_DAY` で deploy なしに動く）、そして扉 `providerFetch`
  ——天井か、天井が発行した受領証（module 内の WeakSet）が無ければ送らない・提供元以外のホストを拒む。
- 5 関数（`ai-proxy`・`monitor-run`・`news-ingest`・`refresh-news`・`who-don`）の既定モデルは表から。
  Anthropic の既定は `claude-haiku-4-5-20251001`（軽量）、Gemini は `ai-proxy` の値に揃った。
  secret（関数別 → `AI_MODEL`）が勝つのは従来どおり。背景 job の 1 段の代替は `FALLBACK_CHAIN` の最後。
- 6 関数（上 ＋ `atlas-embed`）の提供元への要求は全部扉を通る。`ai-proxy` の `fetchWithTimeout` は
  扉の失敗を自分の `ProviderError` に訳すだけの `providerCall` になった（OpenAI の timeout 再試行と
  Gemini の 5xx 再試行がその欄を読むので）。`monitor-run` の私的コピーは消えた。
- 本文を運んでいた 5 か所（`monitor-run` 3・`news-ingest` の embeddings と一覧）は `providerFail`。
- 天井の数（すべて定数の横に観測・失効・正本）:

  | 関数 | 1 日 | 由来 |
  |---|---|---|
  | `ai-proxy` | 3,000 | 最多の日 114 の約 26 倍。free の上限いっぱい（10 ターン×12＋グロス 60＝180）なら約 16 口座 |
  | `monitor-run` | 2,880 | 予定表 144 回 × `CLAIM_LIMIT` 5 × 2 要求 × 2 |
  | `refresh-news` | 2,304 | 予定表 72 回 × 2 版 × 8 要求 × 2 |
  | `news-ingest` | 6,336 | tick 72 × locate 24 ＋ summarise 24 × 60、× 2 |
  | `who-don` | 1,000 | backfill の日 461 と、その代替 1 段 |
  | `atlas-embed` | 20,000（従来） | ＋ **口座ごとの取り分 2,000**（÷ `READERS_PER_ADDRESS`） |

  「× 2」は `SCHEDULE_HEADROOM`（手で走らせる分。推定であることと失効を `ai-provider.js` に書いた）。
- `ai-proxy` で天井に当たったら払い戻して `provider_quota`（`meta.ceiling:"project_day"`・503）。
  ページは既にこの語を「IntMap の無料枠とは別の上限」と訳しているので、新しい文字列は無い。
- Anthropic の両経路が `webAttached` / `webUsed` / `webCount` / `citations` を返す
  （`server_tool_use` の数と `usage.server_tool_use.web_search_requests` の大きい方）。
- `index.gemini-backup.ts` は**消していない**（削除は承認制）。先頭に「NOT DEPLOYED」を書き、
  「関数ディレクトリのコードは index.ts から届くか、配備されないと述べる」を検査にした。

## 2. 選ばなかったもの

- **天井を Atlas の手数に掛ける**: しない。数えるのは提供元への要求であって、ターンの上限・能力は
  1 つも変えていない（`CONSTITUTION.md` §5）。
- **provider 推測の順序（OpenAI 優先か Anthropic 優先か）を 1 本にする**: 関数ごとに違うが、揃えると
  挙動が変わるので今回の範囲外。
- **天井を「値段」で決める**: 提供元は token で請求し、天井は要求を数える。値段の約束ではない。

## 3. 検査

- `tests/edge-spend-and-models-checks.test.mjs`（11 本）。関数は子プロセスで評価（`Deno.serve` を捕まえ
  `fetch` を差し替える。`ai-proxy` は Node の型除去で走る）。変異 8 種（扉が天井を飛ばす・本文を戻す・
  Anthropic が検索を忘れる・取り分を飛ばす・予定表の回数を半分に書く・素の fetch・印を消す・
  モデル名を戻す）がすべて赤。
- 定数の置き場が動いたので、それを綴りで読んでいた既存の検査を新しい置き場へ向けた
  （r147・r151・r722・r736・atlas-native-tools・r801-security-audit ④・atlas-semantic-search ⑤・
  r351 ⑯・r404 ⑩）。主張は変えていない。

## 4. 残り

- **配備が要る**: `_shared/` を変えたので**全 20 関数**（`scripts/supabase-deploy.mjs` の規則）。
- **`ai_usage.count` の負の値**の是正（行の修復と、`refund_ai_usage` が 0 未満にしない制約）は別の作業。
- 天井は「多数の口座で使い切られると、その日は全員が AI を使えない」形で残る（請求は有界）。
  完全に閉じるには口座の作成に費用を持たせる製品判断が要る（`docs/SECURITY-ARCHITECTURE.md` §8 の 13）。
