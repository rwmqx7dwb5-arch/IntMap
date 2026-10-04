---
title: 埋め込みをページから動かす API（js/embed-client.js）と、台帳が再配布を許すデータだけを出す静的なオープンデータ API（api/v1/）、開発者向けページ
date: 2026-10-03
newsen: For developers: control an embedded map from your page with a small script, and use a static open-data API of the datasets whose licenses allow redistribution.
newsjp: 開発者向け: 埋め込んだ地図を小さなスクリプトでページから操作でき、再配布が許されるデータだけを出す静的なオープンデータ API も使えます。
---

〈依頼〉 全権委任の「配信と外部への流通」分野。IntMap を他所のサイト・授業資料・記事の中で生かす流通経路を、
GitHub Pages の静的配信の範囲で。ライセンス上再配布できないデータは出さない（台帳で判定）。
今日すでに着地していたもの（埋め込みの紹介ページ・共有リンクの題と一言・絵葉書）の上に積む。

## 0. 測った（着手前）

| 何 | 着手前 | 意味 |
|---|---|---|
| 埋め込みとそれを置いたページ | 置いたページは枠に何も言えず、枠も何も言わない（postMessage の受け手 0） | 記事の「1914 → 1939」のボタン、授業の段階的な提示、2 枠の同期が作れない |
| data/ のデータセット | 80（`rightsTable()`）。全部サイトから取れるが、どれが何でどの条件で再利用してよいかを述べる場所が無い | 開発者・教員・記者が使えない。黙って持ち出せば条件を破る |
| 台帳が述べるライセンス | 34 が再配布を許すライセンスを値で述べる。42 は述べていない（散文だけ・記録なし）。2 は「© UNESCO」 | 「出せるもの」は台帳がもう知っていた。読み手が居なかった |

## 1. 何を作ったか

**埋め込み API。** `js/embed-client.js` が約束事 `PROTOCOL`（命令 get / state / view / time、イベント ready / state /
reply）と `mount()` を持ち、他サイトはこれを URL で import する（何も import しないファイル。vite がそのまま写す）。
枠の側（`js/embed-mode.js`）は `window.parent` からの命令だけを受け、**命令を共有リンクの断片 1 つにして**
（`commandHash` → `js/map-state.js` の encode）、貼ったリンクと同じ `hashchange` の経路で適用する。だから命令で
できることは共有リンクでできることと同じで、レイヤー・比較・題も `state` で渡せる。年だけの `time` は 7 月 1 日
（歴史の入口ページと同じ瞬間）、紀元前は拡張 ISO（`-000499-07-01`）、時計が読めない日付は理由つきで拒む
（時計の持ち主と同じ `new Date` の読み方で——受け取って黙って捨てるのではなく）。
⚠ **`location.hash = …` を使わない。** 枠の履歴はホストの履歴で、命令のたびにホストの「戻る」が地図を戻すことになる。
`replaceState` で書いて合成の `hashchange` を送る（spec で `history.length` が増えないことを測る）。

**オープンデータ API。** `scripts/public-api.mjs` をビルドの plugin（静的コピーの後）で走らせ `dist/api/v1/` に
`catalog.json`・`countries.json`・`countries/<CODE>.json`（252 か国）・`embed.json` を書く。
出すかどうかは **`scripts/data-governance.mjs` の新しい `rightsTable()`**（`check:datagov` と同じ読み方の値）と、
ライセンス識別子ごとに許すことを述べる語彙 `LICENCES` で決める。上流の**すべて**が語彙の知るライセンスを述べている
ときだけ出し、最も厳しい条件を全体にかける。出さない理由は 4 つで、カタログに理由ごと載る。
国ごとのファイルは**一覧を持たない**——出すデータセットの中で「鍵の過半が国コードの表」を発見する（今日 7 表）。
国の集合は Natural Earth admin-0（パブリックドメイン。`country-facts` が使うコードの集合）。

**開発者向けページ** `developers.html`・`ja/developers.html`（`scripts/landing.mjs`）。命令とイベントの表は
`PROTOCOL` から、データセットの表はビルドが `CATALOG_MARK` の位置に埋める（コミットされるページは台帳の写しを
持たない）。全ページの足元・埋め込みの紹介ページ・共有パネルの「埋め込み」タブから辿れる。
入口の数え上げ（`usage-count/shape.js` の `SITE_PAGES`・`entry`）と admin の Growth の札に `developers` を足した。

**Atlas `data.openData`（`openData`）。** 同じ `catalog.json` を読み、データセット名・出典で絞るか、国名で
その国のファイルを答える。カタログが読めないときは「無い」ではなく「読めなかった」と述べる。

## 2. 測って直したこと（作りながら）

- **最初の版は `country-facts` を「ODbL・出典表示が必要」と出しながら、表示する出典を 1 つも述べていなかった。**
  束の中の記録は `{ n, u, licence }`（DATA_SOURCES の綴り）で、`js/data-governance.js` の `read()` はそれを
  出版者として読まない。ビルダー（`scripts/build-country-facts.mjs`）の `GOVERNANCE` は同じ表から `publisher`・`url` を
  述べている。⇒ ビルダーの宣言を先に読む。さらに「出典表示が条件なのに、出典の名前も住所も述べていない」ものは
  **出さない**（`credit-not-stated`）——読者に果たせない義務を渡さないため。
- `airports` は出版者を `name` と綴るので出典の名前が読めない。住所とライセンス（`https://… (ODbL 1.0)`）で引用する。
  ⚠ 直すのは束の側（`publisher` で述べる）で、今回はしていない（4 節）。
- シャード（`data/planets/`）は索引を持たないので、カタログには索引ではなくファイルを並べる。`data/planets.json` と
  `data/planets/` は別のデータセットなので、シャードの id は末尾の `/` を保つ。
- `new Date('31 Febtember')` は V8 で読めてしまう（3 月 3 日）。拒む規則は時計の持ち主と同じ読み方なので、
  それを「拒め」とは書かない（検査の例を本当に読めない文字列にした）。

## 3. 確かめたこと

- `node --test tests/developer-embed-checks.test.mjs`（9 件）——語彙・1 データセットの条件（変異: 黙る上流・知らない
  ライセンス・出典の無い BY）・木のカタログ（排他で全部を覆う・URL が実在・「© …」の注入は出さない側へ・
  写されないものは載せない）・国の表の発見・クライアントの URL＝`embedUrl`・全命令に枠の答え・断片の規則・配信・Atlas
- `npx playwright test tests/developer-embed.spec.js`——他サイトと同じく URL で import したクライアントが、ready・
  setTime・setView を枠の中の時計とカメラまで届け、読めない日付を理由つきで拒み、読者のドラッグを `cause:'reader'` で
  受け取り、ホストの履歴を増やさない（② の開発者ページの検査と合わせて 2 テスト 19.0 s。`tests/durations.json` に 19 を記入）
- `npx vite build`——`public-api: 33 datasets offered, 47 withheld, 252 country files from 7 per-country tables`
  （ビルドでは `data/planets.json` が写されないので木の上より 1 つ少ない）

- **`check:perf`: 遅延チャンク `embed-mode` の天井を 9.9 → 13.4 kB に上げた**（`node scripts/perf-budget.mjs --update`、
  上がったのはこの 1 行だけ）。増えた 3.5 kB は枠の側のホスト API（命令の検証と断片への変換・ready / state / reply・
  受け手の検査）と約束事の表。`mount()` は木揺すりで落ちている（チャンクに `mount` は 0 回）。このチャンクは
  `?embed=1` の頁と共有パネルを開いたときだけ読まれ、通常の起動には載らない。
- `check:static` が 5 種を指摘し、全部直した: `HashChangeEvent` は解決されない自由識別子（`new Event('hashchange')` に。
  受け手は `location.hash` を読むので同じ）／Atlas の答えの href を `IntMapSafe.url` に通す／`fetch` を
  `js/fetch-deadline.js` の `jsonWithin` と `clockFor` に（読めない＝「観測できなかった」の区別もそこが持つ）／
  検査のコメント除去を `codeOnly` に／admin.html の CSP ハッシュを `node scripts/csp.mjs --write` で書き直す
  （Growth の入口の札に `developers` を足したため）。
- 約束事の各メッセージの説明（en/jp）を最初は `js/embed-client.js` に 2 要素の配列で置き、`check:i18n` が
  「データとして持った翻訳の組」7 件として落とした。⇒ 説明は読み物なので開発者ページの文（`scripts/landing-text.mjs`
  の `developers.api.does`）へ移し、`PROTOCOL` は名前と項目だけを持つ。表の生成は、名前に説明の無いメッセージが
  あれば落ちる。
- Atlas の能力が 1 つ増え（185 行・到達可能 184）、`check:docs` の `capability-count` と、spec が 1 本増えて
  `deep-tier-size`（deep 136・全体 142 本 / 82.1 分）が数を書いた箇所を名指した。数だけを直した。

## 4. 残したもの

- `airports`・`country-facts` などの束が自分の中で出典を DATA_SOURCES の綴り（`n`/`u`/`name`）で述べている。
  `publisher`/`url` で述べ直せば、ファイルだけを持つ読者にも出典の名前が渡る（`check:datagov` の台帳も縮む）
- `maddison`・`hdi-series`・`wars` などはライセンスを値で述べていないので出していない。上流の条件を確かめて
  `GOVERNANCE` に書けば、次のビルドから自動でカタログに入る（このファイルは何も足さなくてよい）
- `usage-count` の Edge Function は `developers` の入口を受け付けるよう変わった——配備が要る
- oEmbed は `?url=` を受けるサーバが要り、静的配信では作れない。代わりに `embed.json` に文法を置いた
