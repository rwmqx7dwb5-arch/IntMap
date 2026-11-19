---
title: Atlas は IntMap 独自の能力しか使えなかった——外部 MCP サーバのツールを同じ道で発見・実行できる汎用クライアントを足した
date: 2026-11-20
newsen: Atlas can now use tools from external MCP servers you register, discovered and run the same way as its own capabilities. Their output is treated as untrusted data, never as instructions.
newsjp: Atlasが、登録した外部MCPサーバーのツールを、自身の能力と同じ流れで見つけて実行できるようになりました。外部の出力は命令ではなく、信頼できないデータとして扱われます。
---

〈依頼〉 外部監査（2026-11-20）の指摘のうち「汎用 MCP クライアントが無い」を直す。要件: 利用者が MCP サーバを登録でき、そのツールを `find_capability` で発見・スキーマ取得・実行し、結果は `read_result` で続きを読める。外部の出力と説明は命令として扱わない。外部通信・書き込みの性質は別属性。CSP/CORS の現実を測り、動かない経路は理由を返す。

## 0. 測った

- 登録簿の列 11 `ingests: 'external'`・列 7 `risk`・列 8 `confirm` と、実行器 4b の確認（`explicit` は外部内容が前にあるときだけ、`always` は毎回）は**既にあった**。MCP はそこに乗せればよく、新しい確認機構は要らない。
- CSP（`index.html`）は `connect-src 'self' https: wss: data: blob:`。`http://localhost` を含む `http:` はページ自身が遮断する。
- 既存の `fetch-relay` は GET 専用・ホスト一覧つきで、MCP（POST・利用者が指名するサーバ）には使えない。
- `find_capability` の結果は `describe()` の 1 か所で作られ、ツール結果は `mechanical()` の 1 か所で作られる。`read_result` は結果の長さで自動的に効くので、MCP 側に切り詰めの仕組みは要らない。

## 1. 直したこと

- `js/atlas-mcp-client.js`（新）: DOM にも Atlas カーネルにも触れない `createMcpClient`。Streamable HTTP（JSON 応答・SSE 応答・`Mcp-Session-Id`）、`tools/list` の巡回、`tools/call`、`inputSchema` の実行前検査、失敗理由（`blocked_by_csp` / `network_or_cors` / `session_header_not_exposed` / `unsupported_transport` / `auth_required` / `relay_*` / `timeout` …）。直接が失敗したら 1 回だけリレーへ。外部の文字列は制御文字・向き上書き文字を除いて長さを抑え、`untrusted` で渡し、結果は囲いで包む。
- `js/atlas-cap-mcp.js`（新）: `mcp.servers` / `mcp.connect`（always）/ `mcp.call`（読むだけと**利用者が宣言した**ツール・explicit）/ `mcp.act`（その他・always）。いずれも risk `external`、実行系は ingests `external`。効果の属性は `effectsOf` の 1 つのオブジェクト（`network` は常に external、`writes` は利用者の宣言でだけ false）。サーバの `readOnlyHint` は信用しない。
- `supabase/functions/mcp-relay/` と `_shared/mcp-relay-policy.js`（新）: ログイン必須・https・公開 DNS 名（解決結果も公開のみ）・JSON-RPC 1 件で method は 5 つ・ヘッダ 5 つ・リダイレクトなし・サイズと時間の上限・呼び出し元の上限。開いたプロキシにしないための絞りの正本は policy 1 か所。
- 既存の編集は最小: `atlas-toolsurface.js`（`find()` が登録サーバのツールを `mcpTools` に足す・`mechanical()` が `external` を運ぶ）、`atlas-console.js`（`external` 依存を 1 行）、`atlas-results.js`（確認文 2 行）、生成物（`atlas-capabilities.js`・`atlas-caps-modules.js`）。

## 2. 検証

- `tests/mcp-client-checks.test.mjs`（11 件）: モック MCP サーバ（JSON・SSE・CORS 拒否・401・旧 transport・セッション）で、発見・効果の宣言・囲い・引数検査・セッション id・失敗理由・リレー経由・登録の上限・リレー方針・登録簿の列を確かめる。⑪ は `find_capability` → `run_capability('mcp.call')` を実際のツール面で通す。
- ⚠ **本番での実 MCP サーバとの接続は測っていない**（このラウンドは外部サーバの資格情報を持たない）。`mcp-relay` は deploy 後に未ログインで 401 になることまでを確かめる対象で、実サーバ越しの往復は次に実在のサーバを登録した人が最初の観測になる。

## 3. 残したもの

設定画面（登録は Atlas 経由）、OAuth、resources/prompts/sampling、旧 HTTP+SSE、SSE の途中経過の表示、トークンの暗号化保存（いまは `localStorage` に平文）。詳細は `docs/architecture/05-ai.md` の同名の節。
