---
title: 送信先の発見器が http(s) しか読まず、読者自身の AIS キーを送る wss://stream.aisstream.io が台帳にもプライバシー本文の照合にも入っていなかった——scheme を URL 標準のネットワーク scheme 全部に、母集合を build が配る全ページに広げた
date: 2026-10-02
---

〈依頼〉別作業 #887 が、`check:datagov` の外部ホストの発見器（`scripts/outbound-hosts.mjs`、規則
`outbound-disclosed`）は http(s) の URL しか読まず、`wss://stream.aisstream.io` が台帳
（`scripts/outbound-hosts.json`）にも Privacy §4 の照合にも入っていないと見つけた。発見器を
WebSocket と、同じく漏れうる他の経路にも綴りの一覧でなく構文で広げ、見つかったホストを台帳に入れ、
Privacy に送信先と送るもの（AIS は読者自身のキー・保存場所）を英日で開示する。新しい `check:*` は足さない。

## 0. 測った

ブラウザが読むファイル（`git ls-files js src css '*.html' sw.js` の 611 本）を全数 grep:

| 経路 | 実在 | 外部ホストのリテラル |
|---|---|---|
| `new WebSocket(` | 1（`js/data-layers.js` の AIS） | `wss://stream.aisstream.io/v0/stream` ——**発見されていなかった** |
| `EventSource` / `SharedWorker` / `RTCPeerConnection` / `WebTransport` | 0 | — |
| `navigator.sendBeacon` | 2（誤り報告・利用回数） | URL は実行時に組み立て（`d.endpoint()`）。既存の Supabase のリテラルで既に発見済み |
| `import(` | 全部が相対か bare specifier | 外部 URL 0 |
| `new Worker(` | blob: URL か `new URL('./…', import.meta.url)` | 外部 URL 0 |
| `importScripts` | コメントのみ | — |

ソースに現れる scheme は `https` 724・`http` 21・`file` 17・`om` 10・`imapsat` 9・`wss` 1。
`om://`・`imapsat://` はページ自身が登録して答えるプロトコルで、その先で取りに行くものは別の https
リテラルとして既に発見されている。

もう 1 つの穴: 母集合の正規表現 `[^/]+\.html` はルートのページだけを読み、`vite.config.js` の
`STATIC_ASSETS` が配る `ja/about.html`・`ja/teachers.html` と `s/*.html`・`ja/s/*.html`（各 8 本）は読まれていなかった。
広げて走らせた結果、そこにだけある送信先は**今日は 0**（`ja/about.html` の fonts.googleapis.com は
台帳に既にある）。今日は 0 でも、次に足された `<script src>` は誰にも見られない形だった。

## 1. 直したこと

- **scheme は WHATWG URL 標準の special scheme のうちネットワークのホストを持つもの全部**
  （`http`・`https`・`ws`・`wss`・`ftp`。`file` はホストを持たない）。受け取る API で分けない——
  リテラルはどこにあっても見つかり、免除するのは既存のリンク文脈（`linkByAncestry`）だけ。
- **母集合に build が配る全 `*.html` を足した。** 一覧は `vite.config.js` の `STATIC_ASSETS` /
  `STATIC_EXCLUDE` を AST から読む `scripts/runtime-scripts.mjs` の `viteStaticAssets` を配って使い、
  写さない。`data/` の `*.js` は配られる**データ**で、その URL は出典と値なので入れない。
- 台帳に `stream.aisstream.io` を 1 行: `sends` は読者自身の aisstream.io キー（`localStorage` の
  `intmap_ais_key` にだけ保存）と表示中の地図範囲。probe は `https://stream.aisstream.io/v0/stream` に
  `expect: [400]`（WebSocket の端点に Upgrade 無しの GET を投げると 400
  «handshake error: bad "Upgrade" header»、2026-10-02 実測——端点が答えている）。
- Privacy §4（en/jp）の AIS の文を「直接接続し、表示中の地図範囲を購読」から
  「`stream.aisstream.io` に WebSocket で直接接続し、**そのキーと表示中の地図範囲**を送って購読」へ。
  §2（ローカル保存）にも、衛星タイルのキーと並べて aisstream.io のキーを足した（§4 には
  「キーはブラウザにだけ保存」とあったのに、§2 の保存物の一覧には無かった）。

## 2. 否定した見立て・残したもの

- 新しい sends 符号 `credential` を足すことも考えたが、読者自身の資格情報を送る既存の行
  （Sentinel Hub の instance id・Mapbox）は `area` ＋ `detail` で述べている。1 行だけ別の符号にすると
  同じ事実が 2 通りに書かれるので、既存に合わせた。符号を分けるなら全行同時に。
- ⚠ index.html の CSP の `connect-src` は `wss:` を**ホストを問わず**許している。WebSocket の送信先を
  縛っているのは CSP ではなくこの台帳である（`docs/SECURITY-ARCHITECTURE.md` §7 に書いた）。CSP を
  絞るかは別の判断で、この回では触っていない。

## 3. 検査

`tests/outbound-websocket-disclosure-checks.test.mjs`（作業ツリーを書き換えず、ファイル一覧を差し替えて
規則を評価する）: ① 今のリポジトリは緑で wss の送信先が発見され §4 に英日で語句がある
② `ws`・`wss`・`ftp`・`https` を WebSocket・EventSource・sendBeacon・`import()`・Worker・
importScripts に渡す新しいリテラルは全部赤 ③ `om://`・`imapsat://`・コメントの中の wss は送信先でない
④ wss の行を台帳から消すと赤 ⑤ build が配る全 `*.html` が母集合にあり、入れ子のページに足した
`<script src>` は赤 ⑥ §2 が英日で aisstream.io のキーを述べる。
変異: scheme を `https?` に戻すと ① ② が赤になることを確かめた。
