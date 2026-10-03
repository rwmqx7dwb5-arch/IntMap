# IntMap — 現状仕様書 §17 セキュリティ基盤

> **現状仕様書の §17。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §17.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 17. セキュリティ基盤

**信頼境界＝サーバー（Supabase）**、ブラウザ JS は非信頼。外部から来る値（コミュニティ投稿、
ニュース RSS 見出し、OSM/Nominatim の地名、OSM で編集可能なウェブカメラ URL、AI 出力、URL hash）は
すべて敵性入力として扱う。

**正本は [`docs/SECURITY-ARCHITECTURE.md`](../SECURITY-ARCHITECTURE.md)**（脅威モデル・データフロー図・
認証認可・公開値と秘密値の区別・**残存リスク**・本番の手動設定）。報告方法は
[`SECURITY.md`](../../SECURITY.md)、検査手順は [`docs/TESTING.md`](../TESTING.md) の「セキュリティ」節。

### 17.1 XSS 出力エンコード（第一防御）

トークンが `localStorage` にあるので **XSS ＝ トークン窃取**であり、**各シンクでの正しい出力エンコードが
最優先の防御**になる（CSP は二次防御）。非信頼テキストは唯一の正規ヘルパー `window.IntMapSafe`
（本体は **`js/safe-html.js` の 1 ファイル**）を通す。

- `.html(s)` ＝ `& < > " '` エスケープ（テキスト／属性の両方に安全）。
- `.url(s,{allowData})` ＝ http(s) / mailto / tel（＋ ラスタの `data:image`。SVG は不可）のみ許可し、
  `javascript:` / `data:text/html` 等は `''` にする。href / src / style は `html(url(s))` で包む。
- `.text(s)` ＝ HTML 断片の文字だけ（不活性な文書で解析。下記）。
- `.markup` ＝ **タグ付きテンプレート**（各ファイルでは `html` と別名にする）。差し込まれた値は、テンプレートの
  静的な文面から読んだ**落ちる場所**に応じて既定でエスケープされる——テキストと引用符つき属性値は `html()`、
  引用符つき `href` / `src` 等の**先頭**の値は `url(v,{allowData:true})`、属性と属性のあいだは裸の属性名だけ
  （`<option${sel?' selected':''}>`）。タグ名・属性名・引用符の無い値・`on*` 属性・`srcdoc`・SVG アニメーションの `to` 等・`<script>` / `<style>` の中・
  コメント・タグの途中で終わるテンプレートは**拒否**する（初回使用時の `TypeError`）。`null` / `undefined` は空、
  配列は要素ごとに同じ規則で連結。戻り値は**マークアップ値**で、別のテンプレートへはそのまま入る（二重に
  エスケープしない）。⚠ `+` で連結すると文字列に戻り、次のテンプレートでテキストとして扱われる——組み立て関数は
  ``html`…` `` を返し、受け手も ``html`…` `` に入れ、sink でだけ文字列になる。
- `.trusted(x)` ＝ テンプレートが作っていないマークアップ（`IntMapSafe.flag` の画像など）を入れる唯一の口。
  呼び出しは全部、書かれた場所で `x` を門が判定する。
- **読み込み方は全経路で同じファイル。** アプリは `src/main.js` が固定の 3 枠の直後に import（その 3 枠と
  その依存、`index.html` の inline script は `IntMapSafe` を使わない）、`sources.html`・`admin.html` は描画する
  script より前に `<script src>`（`vite.config.js` がコピー）、ES module は `import './safe-html.js'` して
  `globalThis.IntMapSafe` を読む（Node でも動く）、classic なファイルを `new Function('window', …)` で評価する
  Node の検査は `tests/helpers/safe-html.mjs` で本物をその `window` に渡す（写しや恒等関数の代用を作らない）。
- **ファイルごとの独自エスケープは持たない。** 局所の `esc` は `window.IntMapSafe.html` を呼ぶ 1 行の委譲にする
  （独自実装は強さがばらばらで、`"` を変換しないものがあった）。HTML から**文字だけ**を取るときは、生きた
  `document` ではなく `document.implementation.createHTMLDocument()` の不活性な文書で解析する
  （生きた文書の要素は未接続でも `<img onerror>` を発火する）——それが `IntMapSafe.text` で、ニュースの
  `stripHTML` はそれを呼ぶ。
- **門**は `scripts/safe-output.mjs`（`check:static` の 1 規則）。独自エスケープ・生きた文書でのテキスト化・
  `IntMapSafe.url` を通らない href/src の始まりを**形で**数え、`scripts/safe-output-ledger.json` の台帳より
  増えたら落ち、減ったら台帳を下げさせる（`--write`）。XML を書き出すもの（GeoTIFF の PAM・GPX/KML）は
  別の文法なので理由つきで `kept`。
- **sink に流れ込む値そのものも測る。** 上の門はエンコーダの写しを数えるだけで、「innerHTML に書かれる
  値がマークアップを運びうるか」は訊かない。`scripts/output-taint.mjs`（`check:static` の `output-taint`
  規則）が `js/` の全 HTML sink（`innerHTML` / `outerHTML` の代入・`insertAdjacentHTML`・MapLibre の
  `setHTML`）に差し込まれる式を**葉**に分け、各葉を判定する——リテラル・数値（算術・`Math.*`・`.toFixed`・
  Date の書式）・`IntMapSafe.*` の戻り値・同じファイルで定義され戻り値が全部安全な組み立て関数（引数ごとに、
  どの引数が出力に効くかまで見る）・`js/` 全体でその名前で提供される関数が全部安全な注入依存
  （`{ esc }`）・宣言された翻訳関数（`TRUSTED`。定義場所と理由の文を持ち、消えた関数・呼ばれない宣言・
  理由の無い行は門が落とす）。判定できない葉はファイルごとに `tests/output-taint-baseline.json` の台帳と
  両方向に照合する（増えたら落ち、減ったら `--update` で下げさせる）。**未判定は「危険」ではない**——
  解析が辿れない自前の数値やラベルが大半で、だから拒否でなく台帳である。`--why` は葉を定義まで辿って
  決め手の読み取り（記録の欄・引数・他モジュール）を印字する。
  同じ規則が `.markup` タグを読む——タグ付きテンプレートは何を差し込んでも安全、`.trusted(x)` は呼ばれた
  場所で `x` を判定、`trusted` を呼ばずに参照する箇所（別名・コールバック）はそれ自体が未判定の葉。タグ自身の
  `plan` を全タグ付きテンプレートの静的な文面に走らせ、実行時に拒否されるテンプレートは `check:static` で落ちる。
  母集合は `js/**/*.js` と、**追跡されている全 `*.html` の inline script**（`git ls-files` で発見し、
  `scripts/safe-output.mjs` の `inlineScripts` で読む——両規則が同じ読み手）。`js/data-layers.js`・
  `js/stats-compare.js`・`admin.html` は未判定だった sink を全部タグで組み、未判定の値を持たない。
  ⚠ 門に見えないもの：別モジュールで引数を sink に渡す関数（`js/map-tooltip.js` の `setMapTooltipHTML`）は
  そのモジュールの葉 1 つで、呼び手が渡す文字列は測られない。
- **書き込む操作要素は自分でそう述べる。** Atlas がボタンを押す前の確認（`js/atlas-controls.js`
  `controlEffect` → `js/atlas-executor.js` 4b）は要素の `data-effect` しか読まない。`scripts/data-effects.mjs`
  （`check:static` の `data-effect` 規則）が、Supabase の書き込み・`rpc`・`functions.invoke`・認証の変更・
  POST の Edge Function に**届く** UI ハンドラ（同じファイルの関数・他ファイルで同名の分割代入・
  `Obj.name.apply` の転送・`window.name`・工場関数に渡された host リテラルのメンバーを辿る）のうち、
  要素が `data-effect` を持たないものをファイルごとに `tests/data-effect-baseline.json` と照合する。
  引数として渡された関数（`fn()`）は名前で辿らない——辿ると全ハンドラが全書き込みに届いてしまう。
- 回帰は `tests/security.spec.js`（実ブラウザで無害化を確認）＋ CodeQL。

### 17.2 認証・認可

- **ai-proxy** ＝ `verify_jwt` ＋ 明示的なユーザー検証（未ログイン 401）・プラン別1日上限を
  `consume_ai_turn`（ターンごとに 1 回 `increment_ai_usage`）で原子的に消費・入力上限を**本文を読む前に**
  適用・鍵/prompt/JWT は非ログ。
  ⚠ **上流の本文と例外文言は応答にもログにも出さない。**
- **refresh-news** ＝ **fail-closed**。`REFRESH_SECRET` 未設定なら全リクエスト拒否（公開実行しない）。
  秘密は `x-refresh-secret` **ヘッダのみ**・**定数時間比較**・POST のみ。
- **monitor-run** ＝ 同型の fail-closed（`x-monitor-secret`）。ユーザーの「今すぐ実行」は JWT ＋ 所有権照合
  ＋ AI の段では `ai-proxy` と同じ AI 枠の消費（`_shared/ai-ledger.js`）。
- **delete-account** ＝ `verify_jwt` ＋ 関数内検証 ＋ `confirm:"DELETE"`。**1トランザクション**で
  所有行を削除し、**削除後に数え直して**残っていれば raise（fail-closed）。Auth ユーザーの削除はその後だけ。
- **アカウントの目録・書き出し・場所の保存**（`account_data_inventory` / `export_account_data` / `save_place`）
  ＝ Edge Function を持たない SECURITY DEFINER RPC。**口座を名指す引数を持たない**——`auth.uid()`（検証済みの JWT）
  だけが口座を決めるので、他人の uuid を渡す扉が存在しない（`delete_account_data(uuid)` が service_role 専用で
  あるのと逆の設計）。EXECUTE は `authenticated` だけ（anon は不可）。書き出しは共有バケツ
  `relay_take('account-export')` でアカウントごとに柵を持つ。`saved_places` へ入る口は `save_place()` だけ
  （INSERT の grant が無い）で、所有者は列単位 grant で `user_id` / `created_at` を書き換えられない。
- **無認証中継**は `_shared/relay-guard.js` を共有する（本数と一覧は §6.2。ここには書き写さない）。

### 17.3 ブラウザ側の設定

- **CSP は `<meta http-equiv>`**（GitHub Pages は独自のレスポンスヘッダを設定できない）。
  `index.html` は `default-src 'self'` を持ち、**14 の directive** を明示的に書く。
  ⚠ **配信する HTML ページは全部 CSP を持つ**（`index.html`・`admin.html`・紹介／授業／共有ページ
  〔en と ja〕・privacy・terms・science・sources）。**どの `script-src` にも `'unsafe-inline'` は無い**——
  インラインの `<script>` は本文の sha256 で 1 本ずつ許す。nonce は使えない（応答ごとに変える値で、
  同じバイトを全員に配る静的配信では誰でも読める定数になる）。`index.html` の本文はビルドがスタンプを
  入れて初めて確定するので、ハッシュは `scripts/csp.mjs` の `cspHashesPlugin()`（最後の
  `transformIndexHtml`。閉じるときに `dist/` の全ページも）がその後で導く。逐語コピーのページは
  ソースに持つ（`node scripts/csp.mjs --write`・生成ページは `scripts/landing.mjs`）。
  ⚠ **インラインのイベント属性（`onclick=` 等）は配信しない。** マークアップは `data-im-click="名前"`
  で**名前を述べ**、`js/inline-actions.js` の 1 つのリスナが宣言済みの語彙だけを実行する
  （未知の名前は拒んで記録）。`npm run check:static`（規則 `script-policy`）が、CSP の無いページ・
  `'unsafe-inline'`／`'unsafe-hashes'`・ハッシュの過不足・イベント属性・宣言に無い／使われていない
  action 名を落とし、`tests/security.spec.js` がビルドした全ページを違反記録つきで開いて**違反 0 件**を
  実測する。
  ⚠ `style-src` の `'unsafe-inline'` は `index.html`・`admin.html`・privacy・terms・science に残る
  （アプリのマークアップと KaTeX と規約本文が style 属性を書く）。紹介・共有ページと sources は持たない。
  ⚠ `connect-src`・`img-src`・`frame-src` の `https:` は**評価した上で残す**——記事リーダーは出版元の
  ページを直接読み、ウェブカメラの画像と枠は OSM で誰でも書ける URL、7 つの URL はホストを実行時に
  組み立て、外部ホストの台帳（`scripts/outbound-hosts.json`）は scheme も WebSocket も持たない。
  理由の全文は `docs/SECURITY-ARCHITECTURE.md` §6。
- ⚠ **アナリティクスは在るが、止まっている。** Google Analytics（`G-57X5MX0ZPW`）と
  Microsoft Clarity（`x2colhytq7`）のタグは `index.html` に残り、CSP にもホストが載ったままだが、
  **どちらのローダも `window.INTMAP_ANALYTICS`（`false` で宣言）の後ろに在る**ので、
  `www.googletagmanager.com` にも `www.clarity.ms` にもリクエストは 1 本も出ず、GA の Cookie も
  session replay も作られない。`gtag()` / `clarity()` の queue shim は定義されたままなので、
  呼ぶ側があっても落ちない（黙って配列に溜まる）。
  ⚠ **止まっている理由はタグの不具合ではなく、実装と文書の対応が無かったこと。** `js/legal-text.js` の
  「4. 第三者 / Third parties」は英語と日本語で数十社を挙げているのに、**実際に Cookie を置き DOM 再生を
  録っている 2 社だけを名指していない**。だから戻しかたも 1 か所ではなく 2 つを束ねてある——
  `tests/shell-index-document-checks.test.mjs` が**フラグと本文を結んでおり**、`js/legal-text.js` に
  `Google Analytics` と `Clarity` を書かないまま `true` に戻すとゲートが赤くなる。
  auth 復帰 URL に対する防御は 1 行も消していない（`docs/SECURITY-ARCHITECTURE.md` §7）。
- **ブラウザが通信しうるホストは台帳にあり、プライバシー §4 と照合される。**
  `scripts/outbound-hosts.mjs` が `js/`・`src/`・配信する `*.html`・`sw.js`・`css/` の文字列と
  テンプレートのリテラルからホストを発見し（コメントは数えない・`+` で組み立てた URL も 1 本）、
  `scripts/outbound-hosts.json` がホストごとに**何を取りに行き、何を送るか**と、それを述べる
  `js/legal-text.js` §4 の語句を **en と jp の両方**で持つ。`npm run check:datagov`（規則
  `outbound-disclosed`）が、台帳に無いホスト・§4 に無い語句・コードがもう要求しない行・
  スイッチが `true` になった眠っている送信先（上の GA / Clarity）を落とす。
  利用者のデータを運ぶ送信先は 2 つを特に正確に述べる: 記事リーダーの 1 段目
  **Jina AI Reader（`r.jina.ai`）には記事の URL**、パスワードの漏えい確認
  **Pwned Passwords（`api.pwnedpasswords.com`）には SHA-1 の先頭 5 文字だけ**（照合はブラウザ内）。
  ⚠ ホスト全体が実行時の式で決まる URL（OSRM の `'https://'+prof[0]` 等）は発見できず、
  門が件数と場所を note として印字する。正本 [`docs/DATA-GOVERNANCE.md`](../DATA-GOVERNANCE.md) §4.3。
- ⚠ **`index.html` の `script-src` には現在 `'unsafe-eval'` と 7 つの CDN の source が入っている**
  （インラインの `<script>` のハッシュはこの数に入らない）
  （`unpkg.com` / `maps.googleapis.com` / `www.googletagmanager.com` / `www.google-analytics.com` /
  `ssl.google-analytics.com` / `www.clarity.ms` / `*.clarity.ms`）。`unpkg.com` だけは**ホストではなく
  1 ファイルの完全なパス**（`https://unpkg.com/@openmeteo/weather-map-layer@0.0.19/dist/index.js`）で、
  unpkg 上の他のパッケージも同じパッケージの他の版も拒まれる。CSP のパス照合は `/` で終わらない限り
  完全一致なので、`js/wx-ecmwf.js` の `SDK_VER` を上げるときは CSP のパスも同じ版にする——
  `tests/output-taint-gate-checks.test.mjs` ⑥ が `SDK_URLS` を AST から組み立てて CSP と照合する。
  これは**受け入れて追跡している残存リスク**で、理由・影響・軽減策は
  `docs/SECURITY-ARCHITECTURE.md §8` の 1 番に測定日つきで書いてある。
  ⚠ **`'unsafe-eval'` を外せるかは実測済み**（2026-09-18・`securitypolicyviolation` を最初のバイトから記録）:
  MapLibre だけなら違反 0 件。**Cesium は同梱の knockout が読み込み時に `(0,eval)("this")` を評価する**ので
  `'wasm-unsafe-eval'` に替えても 3-D エンジンが起動しない。外せる条件は Cesium が eval を要らなくなること
  で、`tests/backend-edge-hardening-checks.test.mjs` ⑦ が `node_modules/cesium` をその条件で測り、要らなくなった
  日に「外せ」と赤くなる。
  ⚠ **`admin.html` はそのどちらも持たない**（SDK 同梱＋データリテラル・パーサ）。
  `tests/security-logic.test.mjs` が admin 側に `'unsafe-eval'` が戻らないことを毎回検査する。
  ⚠ **新しい CDN ホストを CSP に足さない。** 実行時依存は npm から取り `src/vendor.js` が再公開する
  （§1.1）。現在残っている 7 つは、その方針より前からある計測・地図・タイル系のタグである。
  ⚠ **他 origin から読む `<script>` は、実行時に挿入するものも含めて Subresource Integrity で固定する。**
  `unpkg.com` に残る 1 本——ECMWF タイル SDK（`js/wx-ecmwf.js`、`@openmeteo/weather-map-layer`）——は `integrity`（その版のファイルの sha384）と
  `crossOrigin='anonymous'` を持ち、CDN が別のバイトを返せばブラウザが実行を拒む。SDK を同梱しないのは
  GPL-2.0 だから（`docs/SECURITY-ARCHITECTURE.md` §6）。固定できないもの（Street View の JSONP・
  gtag.js・Clarity——配信元が中身を変える前提）は `scripts/runtime-scripts.mjs` の `UNPINNABLE` に
  理由の文つきで宣言され、コードが名指さない CSP ホスト（`www.google-analytics.com` /
  `ssl.google-analytics.com`）は `CSP_ONLY` に宣言されている。`npm run check:static` がこの 2 表を
  配信物と両方向に照合する。
  ⚠ 不在の directive は「許可」ではなく「**不在**」であり、それが意図かどうかを policy が言えない。
- **ヘッダ形式でしか設定できないもの**（`X-Frame-Options` / `Referrer-Policy` / `Permissions-Policy` /
  `X-Content-Type-Options`）は **GitHub Pages では設定できない**ので未設定のままである。
  この事実は `docs/SECURITY-ARCHITECTURE.md §6/§8` に測定日つきで記録してある。
- **本番にソースマップを出さない。**
- **Service Worker** のパス規則は**ホストを見る**（ドット境界での判定）。DEM（terrarium）は
  **ホスト 1 つとパスの先頭から固定した接頭辞 1 つの組**で許す——S3 のパス形式のエンドポイント
  （`s3.amazonaws.com/<bucket>/…`）は誰でも作れるバケットを全部配るので、接頭辞がバケット名まで含む
  （`/elevation-tiles-prod/terrarium/`）。`js/` にある DEM の URL テンプレートは全部許され、別のバケットは
  許されないことを `tests/output-taint-gate-checks.test.mjs` ⑤ が `isTileRequest` を実行して確かめる。
  `postMessage` のプリフェッチ口には
  送信元検証・同じ allowlist・件数／URL 長／応答サイズ／容量上限・`credentials:'omit'` が付く。
  ⚠ allowlist 外の URL は**page 側へ差し戻す**（カスタム XYZ プロバイダの温めを失わない）。
- **admin.html** は隔離する（§11）。SDK は同梱版を読み、データ取込は `js/admin-literal.js` の
  **パーサ**（オブジェクト／配列リテラル文法だけを読み、それ以外は `SyntaxError`）で、**`eval` は使わない**。
- **アナリティクスは URL に認証情報がある間タグを挿さない**（OAuth 復帰時の `?code=` / `#access_token=`）。

### 17.4 CI

**CodeQL**（`security.yml`）＋ `check:static` の **Action SHA 固定検査（全リモート Action・error・除外なし）**
＋ `tests/security-logic.test.mjs`（Edge Function／SW／admin／CSP の不変条件とパーサのユニットテスト）
＋ pgTAP。`npm test` で全部走る。

⚠ **「X は消えたか」を検査するときは、X が書かれていた構文で書く。** 検査のパターンが、
そのパターンを説明している自分のコメントに当たる事故が繰り返し起きている。
⚠ **除外を書いたら、残る母集合を数える**（空集合を検査して緑になる）。
