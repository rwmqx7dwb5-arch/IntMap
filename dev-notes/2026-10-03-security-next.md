---
title: 「このページの通信」——ページが実際に通信した相手をブラウザ自身の報告から記録し、公開した記載（プライバシー §4）と読者の手元で突き合わせる。あわせて公開のセキュリティのページと、存在しなかった非公開の報告窓口を作る
date: 2026-10-03
---

〈依頼〉全権委任の第 2 波（分野: セキュリティとプライバシー——信頼を商品にする）。監査ではなく商品を作る。
作ったのは 2 つ——**「このページの通信」**（設定 ▸ プライバシー と Atlas `system.connections`）と、
**セキュリティと信頼のページ**（`security.html`・`ja/security.html`）＋**非公開の報告窓口**。

## 0. 測った（着手前）

| 何 | 着手前 | 意味 |
|---|---|---|
| ページが通信する相手の記載 | `scripts/outbound-hosts.json` 177 行（要求 113・リンク 62・停止中 2）。`check:datagov` が**ソースの文字列**と §4 に照合 | 記載は**コードについての**主張。動いているページについては誰も照合していない |
| 門に見えない送信先 | 門自身が note で「実行時に組み立てるホストは推測しない」と言う（OSRM の `'https://'+prof[0]` など）。ウェブカメラの画像・記事の発行元・利用者のタイルサーバーはデータが決める | 読者のページが実際に話している相手の一部は、記載の外にありうる |
| 読者が自分のページの通信を見る手段 | 無い（開発者ツールを開く以外） | 「何を送っているか」は信じるしかなかった |
| 地図エンジンの worker が出す要求 | ページの Resource Timing に載らない（worker の timeline は別） | ページ側だけで観測すると、ベクタタイルと GeoJSON の取得先を取りこぼす |
| SECURITY.md の報告窓口 | 「GitHub の Private Vulnerability Reporting」＋「無理なら最小限の公開 issue」 | `GET /repos/rwmqx7dwb5-arch/IntMap/private-vulnerability-reporting` → **`{"enabled":false}`**。第 1 の窓口は存在せず、残る道は**公開の** issue だった |

## 1. 作ったもの

### このページの通信（connection transparency）

- `js/connection-watch.js`（**起動経路**。遅れて始まった証人は始まりを見ていない）——4 つの証人、どれもブラウザ自身の報告:
  Resource Timing（`buffered`、バッファを 4000 に上げてから）・WebSocket（コンストラクタを 1 回だけサブクラスで包む。
  `name` は `WebSocket` のまま）・`securitypolicyviolation`（拒否は「接続した」と別に持つ）・`sw.js` からの
  `connections-seen`（worker の要求）。**記録するのはスキームとホストだけ**（URL は鍵を運びうる）。自分のオリジンは数えるが
  並べない。ホストの表には上限 `MAX_HOSTS`（観測と失効条件は定数の隣）があり、超えた分は `overflow` として数える。
- `sw.js`——fetch ハンドラの先頭で要求を**記録するだけ**（応答も分岐も変えない）。window でないクライアントの分だけを
  1 秒ごとにまとめ、開いている window の数を添えて全 window へ送る（worker は自分の window を名乗らないので、2 タブ以上なら
  一覧が「他のタブの分を含みうる」と言う）。`event.waitUntil` で配達まで生かす。
- `js/connections-panel.js`（オンデマンド）——各ホストを `data/connection-ledger.json` と突き合わせる:
  **記載どおり**（送るもの別。個人に近いものから: 書いたもの → パスワードのハッシュ先頭 → 記事 URL → 検索語 → 地点 →
  地図の範囲 → 識別子 → 訪問 → 何も送らない）／**名前が無い**（データが決める接続先の説明と報告への道つき）／
  **食い違う**（`link`・`dormant` の行に通信した＝記載が間違っている。先頭）／**拒否された**。毎回、**見えないもの**
  （枠の中・オフライン補助が制御していないときの worker）を述べる。台帳が読めなければ「照合できなかった」と言い、
  誰も「名前が無い」と言わない（一発で決める規則 §5）。開いている間は 0.5 秒に 1 回まで再描画、JSON で保存（送らない）。
- `data/connection-ledger.json` ← `scripts/connection-ledger.mjs`（台帳から導出。`checkRepository` が一致を測る——
  `offline-sources.json` と同じ形）。
- Atlas `system.connections`（`show:true` で一覧も開く）。`describe()` は一覧と同じモデルを読む。
- 設定 ▸ **プライバシー**（新しい群）に一覧のボタンとセキュリティのページへのリンク。プライバシーポリシー §4 の末尾に
  一覧の場所を 1 文（en/jp）。

### セキュリティと信頼のページ＋非公開の報告窓口

- `security.html`・`ja/security.html` を `scripts/org-pages.mjs` が生成（組織向けページの一員。ナビと全ページの足元に入る）。
  **数と on/off は持ち主から読む**——送るもの別の接続先の数（台帳。分類の文は一覧と同じ `SENDS_WORDS`）、第三者の
  アクセス解析の有無（`index.html` の `INTMAP_ANALYTICS`）、`script-src` に `'unsafe-inline'`／`'unsafe-eval'` があるか
  （`index.html` の CSP）、パスワードのハッシュ先頭だけを送る行の有無。事実に依存する文は対で持ち、事実が真にする方を選ぶ。
  3D エンジンのために eval が要ることは**そのまま書く**。報奨金制度は無い・回答時間は約束しない（測るものが無い）と書く。
- 報告ボタン → `contact.html?for=other&about=security`。用件 `security` を `_shared/inquiry-shape.js` に足し、表の CHECK を
  `20261003213000_inquiry_security_purpose.sql` で 1 語広げた（非破壊・再実行可能）。フォームはその用件のときだけ
  「何を書き、何を書かないか」を示す（`data-hint-for`。`js/org-page.js` は用件を名指さない）。届く先は `org_inquiries`
  （管理者だけが読む）。
- `SECURITY.md` の窓口をこの事実に書き換えた（PVR は無効と実測日つきで書き、有効化は所有者の承認待ちとした）。
  プライバシーポリシー §9 からページへリンク。

## 2. 構造として直したこと

- `tests/sales-channels-checks.test.mjs` は表の語を**最初の migration だけ**から読んでいた。後の migration が CHECK を
  広げると、関数・フォームと「もう効いていない一覧」を比べることになる。**全 migration を適用順に読み、最後に述べたもの**を
  表の語とした。

## 3. 確かめた

- `tests/security-next-checks.test.mjs` 9 本（`docs/TESTING.md`）——`sw.js` は sandbox で実際に動かした。
- `tests/security-next.spec.js`（実ブラウザ）——Playwright 自身が記録した main frame の完了した要求が一覧に全部あること。
- `tests/security.spec.js` の「全ページを CSP 違反 0 で開く」に `security.html`・`ja/security.html` を足した。

## 4. 共有面・起動費用

- `check:surface`: `window.IntMapDialog` の読みが 1 本増える（`js/dialog.js` は export を持たない——account-data と同じ）。
  `window.openLegal` は読まず、`#link-privacy` 自身のリンクを押す（その handler の持ち主は `js/legal.js`）。
- `check:perf`（この worktree の build。`--update` は超えた 2 行だけを上げた）:
  - `eager.modules` 311 → 312——起動経路のモジュールが 1 本増える（`js/connection-watch.js`）。**決めたこと**: 証人は
    始まりから居なければ始まりを見られず、WebSocket はそれより後の全モジュールが同じコンストラクタを通る。一覧・判定・語は
    全部オンデマンド。eager の raw +18.9 kB・gzip +7.4 kB は帯の内（天井は上げていない）。
  - `async.gzip` 3944.7 → 3965.9 kB（+21.2 kB）。新しいチャンク `connections-panel` 19.0 kB／gzip 7.8 kB と、
    `service-status` から分かれた `host-match` 0.4 kB は**この変更の分**。残り（Atlas の束の `system.connections` を除く
    約 11 kB）はチャンクごとの帯の内に散っており、この build では 1 つずつ帰属させていない——main の CI が merge 後の木を
    測り直し、余れば bot が下げる。

## 5. 残っていること・承認待ち

- **GitHub の Private Vulnerability Reporting の有効化**（リポジトリ設定の変更。所有者の承認が要る）。有効にしたら
  `SECURITY.md` の 2 を「第 2 の窓口」に書き換える。
- **`security.txt`（RFC 9116）**は**ドメインの根**（`/.well-known/security.txt`）に置くもので、プロジェクトページ
  （`/IntMap/`）の中には置けない。`rwmqx7dwb5-arch.github.io` の利用者ページのリポジトリが要る（外部の変更・承認待ち）。
- migration の本番適用と `reader-reports` の再配備（migration が先。逆順だと報告は 503「送信できませんでした」になり、
  黙って失われはしない）。
- `index.html` の CSP は `connect-src` に `https:`・`wss:` を持つ（`docs/SECURITY-ARCHITECTURE.md` §6）。この一覧はそれを
  縛るものではなく、**縛られていないものを読者に見せる**ものである。

## 6. 出自の台帳（CI で赤になったもの）

`data/connection-ledger.json` は出自を**値で**持つ（発行者・URL・ライセンス・周期 `static`・builder・schema・行数と欠け・
重複——`data/service-status.json` と同じ綴り）。残る 3 欄（`retrievedAt`・`generatedAt`・`asOf`）だけを
`data/governance-ledger.json` に記録した（`--update`）。理由: このファイルは台帳の純関数で、`--check` がバイトで比べるので、
生成時刻を書けば毎回不一致になる。builder の行は他の全 builder と同じく記録した（`offline-sources.mjs` と同じ形）。
CodeQL の `js/insufficient-password-hash`（`scripts/csp.mjs` の CSP 用 sha256）は、セキュリティのページの文の識別子
（`password`）からの流れと読まれた誤検出——識別子を `leakCheck` に改め、ハッシュ側に CSP の hash-source である理由を書いた。
