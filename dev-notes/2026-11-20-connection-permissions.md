---
title: 接続先ごとの権限・秘密の保管・利用条件・操作履歴の共通基盤（connection-permissions）
date: 2026-11-20
newsen: Atlas now has one shared foundation for the services it connects to — per-service permissions, encrypted credentials and an activity record — so reads stay prompt-free while writes, spending and deletion follow your rules.
newsjp: Atlasがつなぐサービスごとの権限・暗号化した認証情報・操作の記録を、共通の基盤にまとめました。読み取りは確認なしのまま、書き込み・支払い・削除はあなたのルールに従います。
---

〈依頼〉 総合技術調査（2026-11-20）。ブラウザ・MCP・外部データ・クラウド実行を足すと、Atlas が扱う認証情報・保存先・送信先が増える。**能力を制限するためではなく、より多くのサービスを使えるようにするための基盤**。読み取りのたびの承認は求めない。`mcp-auth` / `browser-operate` / `server-exec` の接続側とは別に、共通の台帳と方針の層だけを担当する。

## 境界（他セッションが使うのはここだけ）
`supabase/functions/_shared/connection-gateway.js` の 4 つの動詞:

```
const gw = createGateway({ store: makeRpcStore(rpc, selectConnection), vaultKeys: Deno.env.get('CONNECTION_VAULT_KEYS') });
const a  = await gw.authorize(userId, 'github', { name:'tools/call:create_issue', class:'write', sensitivity:'personal' });
//   a.verdict: 'allow' | 'ask' | 'deny'（+ a.reason の型付きコード・a.connection）
await gw.record(a, 'ok'|'failed'|'declined'|'refused', { host, costMicros, code });   // 例外を投げない
const secret = await gw.credential(userId, a.connection);                             // service_role だけ
await gw.storeCredential(userId, connection, secret, { expiresAt });
```

- **呼び出し側は判断しない。** 操作の性質を `classifyOp({writes,spends,destroys})` で申告し、返ってきた verdict に従う。`ask` は呼び出し側が利用者に訊く合図で、ここは訊かない・止めない。訊いた結果は `record` に `ok`（承認して実行）／`declined`。
- **読み取りは既定で allow**（確認なし）。write / spend / destructive は既定 ask。**4 つとも利用者が allow にも deny にも動かせる**。分類されていない呼び出しは read ではなく write 扱い（慎重な側）。
- 拒否は `authorize` が台帳へ自動で 1 行残す（呼び出し側が覚えている必要がない）。`record` が失敗しても本体の仕事は失敗させない（delegation journal と同じ姿勢）。
- 判断そのものは純関数 `connection-policy.js` の `decide()`。ページと Edge Function が同じ行から同じ答えを出す。順序は 状態（revoked/paused）→ データ条件 → 日次の支出上限 → 性質ごとの mode。データ条件（`max_sensitivity`・保持・学習への同意）は ask ではなく deny: 毎回訊くと設定が催促に変わるため。公開データは保持される先へ送ってもよい。

## データ（migration `20261120130000_connection_permissions.sql`）
- `connections` — 利用者ごとの接続と方針。RLS は本人のみ。列 grant で本人が編集できるのは方針の列だけ（`user_id` は不可）。50 件まで。`revoked` は戻せず、**失効と同じ文でその秘密が消える**（トリガ）。
- `connection_credentials` — **AES-256-GCM の暗号文だけ**。鍵は Edge Function の秘密 `CONNECTION_VAULT_KEYS`（`<版>:<base64 32 バイト>` をカンマ区切り・新しい順）で、**DB にもリポジトリにも無い**ので表のダンプでは何も開かない。接続 ID を追加認証データに束ねてあり、別の接続の行へ写した暗号文は開かない。ブラウザの役割には grant も policy も無い。
- `connection_ledger` — 追記専用。操作名・性質・判断・結果・実行者・コード・**ホストだけ（URL は持たない）**・費用。内容も秘密も持たない。本人が読め、更新も削除も誰にもできない。90 日で pg_cron が消す。
- 戸口: `conn_credential_put/get/delete`（service_role のみ）・`conn_log`（本人は自分の行だけ・service_role は利用者を指名・他人の接続への記録は拒否）・`conn_usage`（今日の呼び出し数と支出）。
- 利用者のデータ一覧（`account_data_catalog`）に 3 表の文を足した。

## 判断
- 秘密の暗号化を DB 側（pgcrypto / Vault）に置かなかった理由: 鍵が DB の中にあると、DB の読み取りを得た者が暗号文と鍵を同時に得る。鍵は Edge Function の秘密に置く。回転は先頭に新しい版を足すだけ（古い版は使い切るまで残す）。
- 台帳の保持 90 日は観測ではなく運用上の仮置き（内容を持たず安いので）。`docs/MONITORING.md` が別の窓を要るなら migration の 1 か所を変える。失効条件: 利用者が 1 年の履歴を求めたとき。

## 未了（接続側の仕事）
- `CONNECTION_VAULT_KEYS` を Supabase の Edge Function 秘密に設定すること（未設定だと `storeCredential` は `vault_not_configured` で拒否する。平文では保存しない）。
- 接続を作る・秘密を入れる画面と Edge Function、`ask` を利用者に訊く UI は、各接続側（mcp-auth / browser-operate / server-exec）と設定画面の仕事。この層は `makeRpcStore` を通して呼ばれる前提。
- `mcp-server` の既存キー表（`mcp_api_keys`）は触っていない。統合するかは `mcp-auth` 側の判断。

## 検査
`tests/connection-permissions-checks.test.mjs`（方針・保管庫・gateway を実際に評価、migration の形）／`supabase/tests/52_connection_permissions_test.sql`（pgTAP: 利用者分離・列 grant・秘密の不可視・失効で秘密が消える・台帳が追記専用）。**この端末では Docker が動かず pgTAP をローカルで走らせていない**（CI の `supabase test db` が最初の実行）。
