# IntMap — 現状仕様書 §17 セキュリティ基盤

> **現状仕様書の §17。** 案内図は [`Architecture.md`](../../Architecture.md)（§ → ファイルの表）。**節番号は案内図と共有している**
> ——他の文書・コード・テストが書く「`Architecture.md` §17.x」は、このファイル（と案内図の表が同じ行に挙げる文書）の見出しを指す。
> 今どうなっているかだけを書く。変更履歴・ラウンド番号・PR 番号は書かない（`npm run check:docs` の `arch-rounds` がこのファイルも読む）。

## 17. セキュリティ基盤

**信頼境界＝サーバー（Supabase）**、ブラウザ JS は非信頼。外部から来る値（コミュニティ投稿、ニュース RSS 見出し、OSM/Nominatim の地名、OSM で編集可能なウェブカメラ URL、AI 出力、URL hash）は
すべて敵性入力として扱う。**正本は [`docs/SECURITY-ARCHITECTURE.md`](../SECURITY-ARCHITECTURE.md)**（脅威モデル・データフロー図・認証認可・公開値と秘密値の区別・**残存リスク**・本番の手動設定）。
報告方法は [`SECURITY.md`](../../SECURITY.md)、検査手順は [`docs/TESTING.md`](../TESTING.md) の「セキュリティ」節。

### 17.1 XSS 出力エンコード（第一防御）

トークンが `localStorage` にあるので **XSS ＝ トークン窃取**であり、各シンクでの正しい出力エンコードが最優先の防御（CSP は二次防御）。非信頼テキストは唯一の正規ヘルパー `window.IntMapSafe`
（本体は **`js/safe-html.js` の 1 ファイル**）を通す。

- `.html(s)` ＝ `& < > " '` エスケープ（テキスト／属性の両方に安全）。
- `.url(s,{allowData})` ＝ http(s) / mailto / tel（＋ ラスタの `data:image`。SVG は不可）のみ許可し、`javascript:` / `data:text/html` 等は `''`。href / src / style は `html(url(s))` で包む。
- `.text(s)` ＝ HTML 断片の文字だけ（`document.implementation.createHTMLDocument()` の不活性な文書で解析する——生きた文書の要素は未接続でも `<img onerror>` を発火する。ニュースの
  `stripHTML` はこれを呼ぶ）。
- `.markup` ＝ タグ付きテンプレート（各ファイルでは `html` と別名にする）。差し込まれた値は静的な文面から読んだ落ちる場所に応じてエスケープされる——テキストと引用符つき属性値は `html()`、
  引用符つき `href` / `src` 等の先頭の値は `url(v,{allowData:true})`、属性と属性のあいだは裸の属性名だけ（`<option${sel?' selected':''}>`）。タグ名・属性名・引用符の無い値・`on*` 属性・`srcdoc`・
  SVG アニメーションの `to` 等・`<script>` / `<style>` の中・コメント・タグの途中で終わるテンプレートは拒否する（初回使用時の `TypeError`）。`null` / `undefined` は空、配列は要素ごと。戻り値は
  マークアップ値で、別のテンプレートへはそのまま入る（`+` で連結すると文字列に戻るので、組み立て関数は ``html`…` `` を返し sink でだけ文字列になる）。
- `.trusted(x)` ＝ テンプレートが作っていないマークアップ（`IntMapSafe.flag` の画像など）を入れる唯一の口（呼び出しは書かれた場所で `x` を門が判定する）。
- **読み込み方は全経路で同じファイル**（アプリは `src/main.js` が固定の 3 枠の直後に import。`sources.html`・`admin.html` は描画する script より前に `<script src>`——`vite.config.js` がコピー。
  ES module は `import './safe-html.js'` して `globalThis.IntMapSafe` を読む。classic なファイルを `new Function('window', …)` で評価する Node の検査は `tests/helpers/safe-html.mjs` で本物を渡す）。
- **ファイルごとの独自エスケープは持たない**（局所の `esc` は `window.IntMapSafe.html` を呼ぶ 1 行の委譲）。
- **門**は `scripts/safe-output.mjs`（`check:static` の 1 規則。独自エスケープ・生きた文書でのテキスト化・`IntMapSafe.url` を通らない href/src の始まりを形で数え、
  `scripts/safe-output-ledger.json` より増えたら落ち、減ったら `--write` で下げさせる。XML を書き出すもの——GeoTIFF の PAM・GPX/KML——は理由つきで `kept`）。
- **sink に流れ込む値そのものも測る**（`scripts/output-taint.mjs`＝`check:static` の `output-taint` 規則）。`js/` の全 HTML sink（`innerHTML` / `outerHTML` の代入・`insertAdjacentHTML`・MapLibre の
  `setHTML`）に差し込まれる式を葉に分け、各葉を判定する——リテラル・数値（算術・`Math.*`・`.toFixed`・Date の書式）・`IntMapSafe.*` の戻り値・戻り値が全部安全な同じファイルの組み立て関数
  （引数ごと）・`js/` 全体でその名前の関数が全部安全な注入依存（`{ esc }`）・宣言された翻訳関数（`TRUSTED`。定義場所と理由の文を持つ）。判定できない葉はファイルごとに
  `tests/output-taint-baseline.json` と両方向に照合する（未判定は「危険」ではない）。`--why` は葉を定義まで辿る。同じ規則が `.markup` タグを読み（タグ付きテンプレートは安全、`.trusted(x)` は
  呼ばれた場所で判定、`trusted` を呼ばずに参照する箇所は未判定の葉）、タグ自身の `plan` を全テンプレートの文面に走らせて実行時に拒否されるものを落とす。母集合は `js/**/*.js` と、追跡されて
  いる全 `*.html` の inline script（`git ls-files`。`scripts/safe-output.mjs` の `inlineScripts`）。`js/data-layers.js`・`js/stats-compare.js`・`admin.html` は未判定の値を持たない。門に見えないもの:
  別モジュールで引数を sink に渡す関数（`js/map-tooltip.js` の `setMapTooltipHTML`）の呼び手が渡す文字列。
- **書き込む操作要素は自分でそう述べる**（Atlas がボタンを押す前の確認——`js/atlas-controls.js` `controlEffect` → `js/atlas-executor.js` 4b——は `data-effect` しか読まない。
  `scripts/data-effects.mjs`＝`check:static` の `data-effect` 規則が、Supabase の書き込み・`rpc`・`functions.invoke`・認証の変更・POST の Edge Function に届く UI ハンドラ〔同じファイルの関数・
  他ファイルで同名の分割代入・`Obj.name.apply` の転送・`window.name`・工場関数に渡された host リテラルのメンバーを辿る。引数として渡された関数は辿らない〕のうち要素が `data-effect` を
  持たないものをファイルごとに `tests/data-effect-baseline.json` と照合する）。
- 回帰は `tests/security.spec.js`（実ブラウザで無害化を確認）＋ CodeQL。

### 17.2 認証・認可

- **ai-proxy** ＝ `verify_jwt` ＋ 明示的なユーザー検証（未ログイン 401）・プラン別1日上限を `consume_ai_turn`（ターンごとに 1 回 `increment_ai_usage`）で原子的に消費・入力上限を本文を読む前に
  適用・鍵/prompt/JWT は非ログ。上流の本文と例外文言は応答にもログにも出さない。
- **refresh-news** ＝ **fail-closed**（`REFRESH_SECRET` 未設定なら全リクエスト拒否。秘密は `x-refresh-secret` ヘッダのみ・定数時間比較・POST のみ）。
- **delete-account** ＝ `verify_jwt` ＋ 関数内検証 ＋ `confirm:"DELETE"`。1トランザクションで所有行を削除し、削除後に数え直して残っていれば raise。Auth ユーザーの削除はその後だけ。
- **アカウントの目録・書き出し・場所の保存**（`account_data_inventory` / `export_account_data` / `save_place`）＝ Edge Function を持たない SECURITY DEFINER RPC で、口座を名指す引数を持たない
  （`auth.uid()` だけが口座を決める。`delete_account_data(uuid)` が service_role 専用なのと逆の設計）。EXECUTE は `authenticated` だけ。書き出しは `relay_take('account-export')` の柵を持つ。
  `saved_places` へ入る口は `save_place()` だけ（INSERT の grant が無い）で、所有者は列単位 grant で `user_id` / `created_at` を書き換えられない。`save_view` と `publish_collection` も同じ形。
  `anon` が呼べるのは `shared_collection(token)` だけ（トークン 122 ビットがリンクの鍵・表は `anon` から読めない・返すのは名前つきの欄だけ）。正本は `docs/SECURITY-ARCHITECTURE.md`。
- **無認証中継**は `_shared/relay-guard.js` を共有する（本数と一覧は §6.2）。

### 17.3 ブラウザ側の設定

- **CSP は `<meta http-equiv>`**（GitHub Pages は独自のレスポンスヘッダを設定できない）。`index.html` は `default-src 'self'` を持ち、**14 の directive** を明示的に書く。配信する HTML ページは
  全部 CSP を持つ（`index.html`・`admin.html`・紹介／授業／共有ページ〔en と ja〕・privacy・terms・science・sources）。**どの `script-src` にも `'unsafe-inline'` は無い**——インラインの
  `<script>` は本文の sha256 で 1 本ずつ許す（nonce は静的配信では定数になる）。`index.html` のハッシュはビルドがスタンプを入れた後に `scripts/csp.mjs` の `cspHashesPlugin()`（最後の
  `transformIndexHtml`。閉じるときに `dist/` の全ページも）が導き、逐語コピーのページはソースに持つ（`node scripts/csp.mjs --write`・生成ページは `scripts/landing.mjs`）。**インラインのイベント
  属性（`onclick=` 等）は配信しない**——マークアップは `data-im-click="名前"` で名前を述べ、`js/inline-actions.js` の 1 つのリスナが宣言済みの語彙だけを実行する（未知の名前は拒んで記録）。
  `npm run check:static`（規則 `script-policy`）が CSP の無いページ・`'unsafe-inline'`／`'unsafe-hashes'`・ハッシュの過不足・イベント属性・宣言に無い／使われていない action 名を落とし、
  `tests/security.spec.js` がビルドした全ページを違反記録つきで開いて違反 0 件を実測する。`style-src` の `'unsafe-inline'` は `index.html`・`admin.html`・privacy・terms・science に残る
  （アプリのマークアップと KaTeX と規約本文が style 属性を書く）。`connect-src`・`img-src`・`frame-src` の `https:` は評価した上で残す（記事リーダー・OSM で誰でも書けるウェブカメラ URL・
  実行時に組み立てる 7 つの URL。理由は `docs/SECURITY-ARCHITECTURE.md` §6）。
- **アナリティクスは在るが、止まっている。** Google Analytics（`G-57X5MX0ZPW`）と Microsoft Clarity（`x2colhytq7`）のタグは `index.html` に残り CSP にもホストが載るが、どちらのローダも
  `window.INTMAP_ANALYTICS`（`false` で宣言）の後ろに在るので、リクエストは 1 本も出ず GA の Cookie も session replay も作られない（`gtag()` / `clarity()` の queue shim は定義されたまま）。
  止まっている理由は `js/legal-text.js` の「4. 第三者 / Third parties」がこの 2 社を名指していないこと——`tests/shell-index-document-checks.test.mjs` がフラグと本文を結んでおり、`Google Analytics`
  と `Clarity` を書かないまま `true` に戻すと赤くなる。auth 復帰 URL に対する防御は消していない（`docs/SECURITY-ARCHITECTURE.md` §7）。アナリティクスは URL に認証情報がある間タグを挿さない
  （OAuth 復帰時の `?code=` / `#access_token=`）。
- **ブラウザが通信しうるホストは台帳にあり、プライバシー §4 と照合される。** `scripts/outbound-hosts.mjs` が `js/`・`src/`・配信する `*.html`・`sw.js`・`css/` の文字列とテンプレートのリテラル
  からホストを発見し（コメントは数えない・`+` で組み立てた URL も 1 本）、`scripts/outbound-hosts.json` がホストごとに何を取りに行き何を送るかと `js/legal-text.js` §4 の語句を en と jp の両方で
  持つ。`npm run check:datagov`（規則 `outbound-disclosed`）が台帳に無いホスト・§4 に無い語句・コードがもう要求しない行・スイッチが `true` になった眠っている送信先を落とす。利用者のデータを
  運ぶ送信先: Jina AI Reader（`r.jina.ai`）には記事の URL、Pwned Passwords（`api.pwnedpasswords.com`）には SHA-1 の先頭 5 文字だけ（照合はブラウザ内）。ホスト全体が実行時の式で決まる URL
  （OSRM の `'https://'+prof[0]` 等）は件数と場所を note として印字する。正本 [`docs/DATA-GOVERNANCE.md`](../DATA-GOVERNANCE.md) §4.3。
- **このページが実際に通信した相手を、読者が見られる**（設定 ▸ プライバシー ▸ このページの通信・Atlas `system.connections`）。`js/connection-watch.js`（起動経路）がブラウザ自身の報告——
  Resource Timing（`buffered`）・WebSocket（コンストラクタを 1 回だけサブクラスで包む）・`securitypolicyviolation`（拒否は別扱い）・`sw.js` が見たバックグラウンド処理の要求（window 以外の
  クライアントの分を 1 秒ごとにまとめ、開いている window の数を添える）——をスキームとホストだけで記録する。`js/connections-panel.js` が各ホストを `data/connection-ledger.json`（台帳から
  `scripts/connection-ledger.mjs` が導出・`check:datagov` が照合）と突き合わせ、送るもの別・名前の無いもの・食い違うもの（`link`／`dormant` の行に通信した）・拒否したものに分け、見えないもの
  （枠の中・`sw.js` が制御していないときのバックグラウンド処理）を毎回述べる。台帳を読めないときは「照合できなかった」と言う。公開のページ `security.html`（`ja/`）は、送るものと接続先の数・
  アクセス解析の有無・`script-src` の中身を台帳と `index.html` から、依存の脆弱性照合を `.github/workflows/` から読んで書き、非公開の報告窓口（相談フォームの用件 `security`）へ渡す。GitHub の
  非公開の脆弱性報告は有効になっていない（`docs/SECURITY-ARCHITECTURE.md` §9）。
- **`index.html` の `script-src` には現在 `'unsafe-eval'` と 7 つの CDN の source が入っている**（インラインの `<script>` のハッシュはこの数に入らない）（`unpkg.com` / `maps.googleapis.com` /
  `www.googletagmanager.com` / `www.google-analytics.com` / `ssl.google-analytics.com` / `www.clarity.ms` / `*.clarity.ms`）。`unpkg.com` だけは 1 ファイルの完全なパス
  （`https://unpkg.com/@openmeteo/weather-map-layer@0.0.19/dist/index.js`）で、`js/wx-ecmwf.js` の `SDK_VER` を上げるときは CSP のパスも同じ版にする（`tests/output-taint-gate-checks.test.mjs` ⑥ が
  `SDK_URLS` を AST から組み立てて照合する）。これは受け入れて追跡している残存リスクで、理由・影響・軽減策は `docs/SECURITY-ARCHITECTURE.md §8` の 1 番。`'unsafe-eval'` を外せるかは実測済み
  （MapLibre だけなら違反 0 件。Cesium は同梱の knockout が読み込み時に `(0,eval)("this")` を評価するので `'wasm-unsafe-eval'` では 3-D エンジンが起動しない。
  `tests/backend-edge-hardening-checks.test.mjs` ⑦ が `node_modules/cesium` を測り、要らなくなった日に赤くなる）。`admin.html` はそのどちらも持たない（`tests/security-logic.test.mjs` が毎回検査）。
  新しい CDN ホストを CSP に足さない（実行時依存は npm から取り `src/vendor.js` が再公開する——§1.1）。
- **他 origin から読む `<script>` は、実行時に挿入するものも含めて Subresource Integrity で固定する**（`unpkg.com` の ECMWF タイル SDK——`js/wx-ecmwf.js`、`@openmeteo/weather-map-layer`——は
  `integrity`〔その版の sha384〕と `crossOrigin='anonymous'` を持つ。同梱しないのは GPL-2.0 だから——`docs/SECURITY-ARCHITECTURE.md` §6）。固定できないもの（Street View の JSONP・gtag.js・Clarity）は
  `scripts/runtime-scripts.mjs` の `UNPINNABLE` に理由の文つきで、コードが名指さない CSP ホスト（`www.google-analytics.com` / `ssl.google-analytics.com`）は `CSP_ONLY` に宣言され、
  `npm run check:static` が両表を配信物と両方向に照合する。不在の directive は「許可」ではなく「不在」。
- **ヘッダ形式でしか設定できないもの**（`X-Frame-Options` / `Referrer-Policy` / `Permissions-Policy` / `X-Content-Type-Options`）は GitHub Pages では設定できないので未設定のまま
  （`docs/SECURITY-ARCHITECTURE.md §6/§8`）。
- **本番にソースマップを出さない。**
- **Service Worker** のパス規則はホストを見る（ドット境界）。DEM（terrarium）はホスト 1 つとパスの先頭から固定した接頭辞 1 つの組で許す（`s3.amazonaws.com` のパス形式は誰でも作れるバケットを
  配るので、接頭辞はバケット名まで含む——`/elevation-tiles-prod/terrarium/`。`tests/output-taint-gate-checks.test.mjs` ⑤ が `isTileRequest` を実行して確かめる）。`postMessage` のプリフェッチ口には
  送信元検証・同じ allowlist・件数／URL 長／応答サイズ／容量上限・`credentials:'omit'` が付き、allowlist 外の URL は page 側へ差し戻す。
- **admin.html** は隔離する（§11）。SDK は同梱版を読み、データ取込は `js/admin-literal.js` のパーサ（オブジェクト／配列リテラル文法だけを読み、それ以外は `SyntaxError`）で、`eval` は使わない。

### 17.4 CI

**CodeQL**（`security.yml`）＋ `check:static` の **Action SHA 固定検査（全リモート Action・error・除外なし）** ＋ **依存の既知脆弱性**（`security.yml` の `Dependency advisories (npm audit)` が
ロックファイルを公開の勧告データベースに照会する——ブラウザに配る依存は全深刻度、ビルド／テストの道具は high 以上。毎週と全 PR。必須チェックではない。Dependabot alerts は無効なので
これが唯一の見張り——`docs/SECURITY-ARCHITECTURE.md` §9）＋ **ロックファイルの整合**（`check:static` の `lock-ranges`・`scripts/lock-ranges.mjs` が全依存辺について解決される版が依存元の
宣言する範囲を満たすかを node-semver と同じ読みで判定し、読めない指定は拒む）＋ **秘密の混入**（`check:static` の `secret-scan`・`scripts/secret-scan.mjs` が git が commit しうる全ファイル
のうちバイトが text のものを読み、全 JWT の role を見て、Supabase の個人アクセストークン・Stripe の制限キーと webhook 署名秘密・Google OAuth のクライアント秘密・npm トークンほかの形を拒む）
＋ `tests/security-logic.test.mjs`（Edge Function／SW／admin／CSP の不変条件とパーサのユニットテスト）＋ pgTAP。`npm test` で全部走る。

- 「X は消えたか」を検査するときは、X が書かれていた構文で書く（パターンが自分を説明するコメントに当たる）。
- 除外を書いたら、残る母集合を数える（空集合を検査して緑になる）。
