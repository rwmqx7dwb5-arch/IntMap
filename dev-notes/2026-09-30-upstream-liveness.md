---
title: 「上流が生きているか」と「同梱データが新しいか」を宣言と実測で持つ——鮮度は unknown 129/130 だった（周期と日付が別の場所に住み、片方にしか訊いていなかった）。周期を上流ごとに根拠つきで 1 回だけ述べ、ブラウザが話す 113 ホストに代表の probe を持たせて毎晩訊き、期限の来た軽い束を TLE の PR に載せて無人で取り直す
date: 2026-09-30
---

〈依頼（監査）〉「上流が生きているか」と「同梱データが新しいか」を、宣言と実測で持つ構造にする。
①各ビルダーに更新周期を値として持たせ、鮮度を「built の日付 × 宣言された周期」で判定、宣言の欠落を
check:datagov で拒む（unknown を 0 に）②上流の応答を確かめずに data/ を書けるビルダーを直す③上流の死活を
probe で持ち、毎晩測って alive / refused / dead / unobserved に分類、読み手が行動できる変化だけで赤にする
④周期を持つ束のうち自動再生成が安全なものを定期実行→PR に載せる⑤回帰⑥文書。js/ は触らない。

## 0. 測った（着手時）

- `node scripts/data-governance.mjs --report`: 鮮度 **fresh 1 / aging 0 / stale 0 / unknown 129**。fresh の 1 は
  `build-cshapes.mjs` の `cadence: 'static'` だけ。
- **unknown の原因は宣言の欠落だけではなかった。** 語彙の `freshness()` は 1 つの記録に**日付と周期の両方**を
  訊く。周期は上流についての事実で builder の宣言に、日付はバイトについての事実で束の側に住む——builder の
  ソースは自分が最後にいつ走ったかを知らない。宣言を全部埋めても、builder の主題は日付が無いので unknown の
  ままだった。⇒ 門で 2 つを結ぶ（§1）。
- **宣言を持っていたのに一度も読まれていない builder が 4 本あった。** 書き込み先を
  `path.join(OUT_DIR, 'x')` で組み立てる builder は書き込みの検出から漏れ、`build-star-catalogue`・
  `build-tle-snapshot`・`build-who-don`・`build-world-basemap` は `export const GOVERNANCE` ごと主題でなかった。
  同じ理由で、`subcables`・`elections/`・`railways/`・`border-detail/`・`hist-admin2/3`・`language-aliases`・
  `hist-fidelity` を書く builder も「builder の居ない束」に見えていた。本当に builder が居ないのは 5 束
  （`basins_mrb`・`ecoregions_2017`・`precip-mm`・`precip-year`・`subcable-overrides`）。
- 定期実行されていたのは `tle-refresh.yml` だけ（1 日 2 回）。
- 応答を確かめずに書けるビルダー（監査の通り）: `build-deepsky.mjs:56`・`build-smallbodies.mjs:54`・
  `build-spacecraft.mjs:127` が確実、`build-maddison.mjs:112`・`probe-gibs-range.mjs:56` が疑い。読んで確かめた:
  - deep-sky: 4 回失敗した TAP は `null`、呼び手は null を「0 行」として扱い、名前付き天体や距離が欠けた
    **短い束**を書く。床（80 行）は**書いた後に**訊いていた。
  - small-bodies: 一括検索の失敗が `[]` になり、その種類が丸ごと欠けた束を書く。
  - spacecraft: 応答しなかった機体は `SKIPPED` で飛ばし、書く。
  - probe-gibs-range: 通信失敗の `null` を、今日から遡る歩みは「404（無い）」と読み、二分探索は「ここで止まる」と
    読んで、**そこまでの位置をアーカイブの端として記録**していた。取れなかったことが NASA のアーカイブについての
    事実として日付選択器に出る。
  - maddison:112 は委託ファイル（コミット済みの `data/maddison.json`）の読み取り失敗を `fail()`
    （`process.exit`）で終える catch で、**上流の応答ではない**。門の静的な疑い（「throw の無いファイルで
    catch が捨てている」）が `fail()` を見ていない誤検出。直さずに残した（§6）。
- 上流の死活を見る仕組みは無い（`uptime.yml` は自サイトと自前の中継だけ）。`scripts/outbound-hosts.json` は
  177 ホスト、うちブラウザが実際に要求する行は 113（`disclosure`）、残りは `link` 62・`dormant` 2。

## 1. 鮮度——周期は上流ごとに 1 回、日付は束の側から

- **周期は `scripts/lib/upstream-cadence.mjs` に上流ごとに 1 回だけ**（32 個）。Natural Earth を読む builder は
  4 本、GeoNames は 3 本、Wikidata は 5 本あり、周期と根拠を書き写さない。builder は `...NATURAL_EARTH` の
  ように展開する。1 本しか読まない上流の周期と `static` はその builder の記録に直接書く。
  ⚠ 門は builder を**実行せずに**宣言を読み、1 段だけ `import { … } from './…'` の純データ定数を追う
  （#729 の仕組み）——だから lib は文字列リテラルだけで書いた。別名 import（`as`）は追えないので、
  `build-tle-snapshot.mjs` の `CELESTRAK`（URL 定数）と衝突した周期は `CELESTRAK_GP` と名づけた。
- **周期の意味**: 「その上流が、この束が運ぶ種類の新しいものを出すまでの期間」。このリポジトリが取り直す頻度では
  ない（語彙の SPELLINGS.cadence の註の通り）。複数上流の束は最も短いもの。
- **どの周期にも根拠** `cadenceBasis: { observed, expires, canon }`。`observed` は何をいつ測った・読んだかで、
  測っていないものは「estimate」と書いた。この回に測ったもの（2026-09-30）:
  Natural Earth のリリース（v3.3.0 2016-09 … v5.1.2 2022-05、2022-06-02 以降コミット無し）／GeoNames の
  readme（前日分の修正ファイルを毎日）／OurAirports（毎日 01:53 UTC にコミット）／mledoze/countries（ほぼ年 1）／
  Glottolog（5〜7 か月ごと）／factbook.json（月に数回）／terrarium タイルの Last-Modified（2017-11、再生成なし
  ⇒ static）／fraxen/tectonicplates（2014-10 以降なし ⇒ static）／aourednik（9 月に 8 コミット）／
  submarinecablemap の Last-Modified（8 日前・1 回の観測）／WHO DON（コミット済みコーパスで 1 年 36 件 ⇒ P10D）／
  TLE（build 時の要素の中央値の年齢 19.9 h ⇒ P1D）。国政選挙は 12 政体の選挙周期から年約 4 回と計算して P3M。
  Horizons・SBDB・SIMBAD・GVP・WDI・GHO・IANA tz・USGS 惑星地名・JPL 衛星表は **estimate**。
- ⚠ **`P1W` は語彙の文法の外だった**（`js/data-governance.js` の DUR は Y/M/D/T だけ）。宣言したのに
  「上流が周期を述べていない」と判定され、3 束が周期を印字したまま unknown になった。⇒ `P7D` に直し、
  門は「解釈できない周期」を**別の名前で**落とす（「述べていない」とは違う欠陥なので）。
- **日付**: ①束自身の in-band `generatedAt` / `retrievedAt` ②無ければそのバイトを最後に変えたコミット
  （`git log --name-only -- data` を 1 回歩く。0.27 s。束ごとの `git log -1` は 5.8 s だった）③ git の外の集合は
  その sha256 を `data-assets.json` に記録したコミット（pickaxe）。⚠ コミット日は「最後に**変わった**日」で、
  同じバイトを再現したリビルドは残らない——どの行も日付の出所を述べる。⚠ **shallow clone は日付を持たない**
  （CI は 1 コミット）ので、そこでは `no-date`（note）と述べ、新しいとも古いとも言わない。
- **門**（`freshness-stated`）: 周期の無い主題・根拠の無い周期・解釈できない周期・1 束を 2 つの script が
  宣言する——どれも落第で、**台帳での免除は無い**。古さは今まで通り note。
- 書き込み検出から漏れていた builder は、`data/…` を鍵に持つ `GOVERNANCE` があれば主題にする。宣言の無かった
  16 本（build-hist-* 6 本・histnames・wars・companies/discover・probe-gibs-range・subcables・elections・border-detail・
  rail/build・lib/glottolog・hist-fidelity）に、書く束と周期だけの宣言を足した——**分かっていない出自の欄は
  埋めていない**（ledger が「述べていない」と数え続ける。`intmap-data-must-not-claim-an-author-it-lacks`）。
  builder の居ない 5 束は `scripts/data-unbuilt.mjs` が宣言する（builder が現れたらその行を譲る——二重宣言は落第）。
  `build-whs.mjs` の言語別の詳細束は `whc-detail.{locale}.json.gz` というパターンで宣言した（言語の一覧を
  書かない——その builder の註が拒んでいる形）。
- `build-hist-places.mjs` の宣言は `Object.freeze(...)` 越しに `SOURCE.publisher` を読んでいて門が評価できず、
  台帳に「読めなかった」と載っていた。フィールドを純粋なリテラル `SOURCE_FIELDS` に分け、`SOURCE` はその凍結。
- **結果**: 主題 154（束 72 ＋ builder の宣言 82）が全部周期を持ち、**fresh 82 / aging 6 / stale 66 / unknown 0**。
  束だけでは fresh 36 / aging 3 / stale 33。周期の内訳（束）: P1D 25・static 17・P1Y 10・P1M 9・P3M 3・P7D 3・
  P6M 2・P2Y 1・P4Y 1・P10D 1。日付の出所: git 67・data-assets.json 2・in-band 3。
  stale の多くは「毎日編集される上流（OHM・Wikidata・GeoNames・OSM）のスナップショット」で、**それは事実**
  ——古さは note であって落第ではない。
- 台帳（`data/governance-ledger.json`）: `undeclared` 130→154 主題、`undeclaredFacets` 1876→2135、
  `updateFailureExposed` 3→0、`unreadableDeclaration` 1→0。⚠ **増えた 2 つは新しい負債ではなく、見えていなかった
  主題が見えるようになった分**（上の 16 本の宣言と、読まれていなかった 4 本。1 本だった builder の主題が束ごとの
  主題に分かれたものを含む）。どの行も出自の欄を「述べていない」と正直に数えている。構造で減らすには、
  その上流の条件を読んで述べるしかなく、推測で埋めることはしない（`--update` で記録した理由はこの段落）。

## 2. 上流の応答を確かめずに書ける builder

- `scripts/lib/upstream.mjs`: **判定 1 つ**（`classify` → alive / refused / dead / unobserved）と
  `fetchChecked(url, init, {as, expect, validate, attempts, …})`。非 2xx・空の本文・JSON でない本文・呼び手の
  スキーマ違反を拒む。**再試行は dead と 429 だけ**（404 は上流の答えで、もう一度訊いても同じ問い）。
  エラーは試行回数と HTTP 状態を持つ。
- deep-sky: TAP の答えは `data` 配列を持つ JSON だけ。床を**書く前に**訊く。
- small-bodies: 一括検索が 0 行なら拒む。床を書く前に。⚠ **走らせて見つかった**: 手書き名簿の `1998 KY26`
  （空白を含む仮符号）に SBDB の query API は **HTTP 400**「bad character(s) in sb-cdata EQ argument」を返す。
  これは上流が**問いに**答えたもので停止ではない——元のコードが null として lookup API に回していた経路そのもの。
  ⇒ その 400 だけ lookup へ落とし、他の失敗は止める。実行: 1,142 天体（コミット済みと同数）・77/77 解決。
- spacecraft: Horizons は答えられない問いも 200 の `result` 文で返す（「No ephemeris … after A.D. 2031-SEP-21」
  を実測）ので、それは従来通り span の読み取りに渡す。**FLEET の 1 機でも返らなければ書かない**。
  実行: 17 機・667 KB。
- probe-gibs-range: 答えは 200 と 404 だけ。それ以外は失敗の後にもう一度訊き、なお駄目なら**止める**。
  11 年遡って 200 が 1 つも無い製品も止める（黙ってファイルから落とさない）。実行: 4 製品。
- 門: `unchecked response can ship` 3 確実・2 疑い → **0 確実・1 疑い**（maddison、上の誤検出）。

## 3. 上流の死活

- `scripts/outbound-hosts.json` の要求される 113 行に `probe: { url, expect?, why? }`。URL は製品が送る種類の
  実 URL（js/ の呼び出し箇所から拾った）。2xx 以外を期待する 4 行は理由つき: 自前の Supabase gateway（anon key
  無しに 401）・Mapbox（読者自身の token 無しに 401）・Sentinel Hub（存在しない instance id に 400）・
  RainViewer のタイル CDN（フレームの時刻が 2 時間しか有効でないので root を訊き、健全な答えが 404）。
  `link` / `dormant` 行は要求されないので probe を持たない。門の新しい規則 `probe-declared` が、要求される行の
  probe の欠落・別ホスト・理由の無い非 2xx 期待・link 行の probe を拒む。
- `scripts/upstream-liveness.mjs`: 全部を並列に 1 回ずつ訊き、生きていないものだけを 30 s 後に倍の時間で
  もう一度訊く（実在した失敗の後の、前回と違う再試行——`one-pass-or-a-reason` §5）。**どの probe も HTTP 応答を
  得られなければ全部 unobserved**（runner の網が落ちている）。
- **赤の条件**: 「前回 alive → 今回 dead/refused」をそのまま使うと、実測で `overpass-api.de` が同じ日の午前に
  200・午後に 504 を 2 回返した——公開サービスの悪い 1 時間で赤になり、誰も対処できない。⇒ 結果にホストごとの
  連続（`streak`）と、その前の状態（`from`）を持たせ、**up だったホストが 2 回続けて down になった回だけ**
  `--fail-on-transition` が exit 1（1 回の障害につき 1 回）。1 回目は「failing」として表に出す。ずっと死んでいる
  ホストは毎晩表に出るが赤にしない。unobserved は連続を伸ばしも切りもしない。
- `.github/workflows/upstream-liveness.yml`（毎晩 04:41 UTC）: 前回の完了した run の artifact を取り、比較して、
  結果を artifact `upstream-liveness`（90 日）と job summary に出す。`permissions: contents: read, actions: read`。
- **実測（2026-09-30、この worktree から 1 回）: alive 107 / refused 2 / dead 4 / unobserved 0。**
  - dead: `celestrak.org`（接続時間切れ——2026-08-01 の記録と同じ）、`overpass-api.de`（504 を 2 回。午前の
    手測りでは 200）、`overpass.kumi.systems`・`overpass.private.coffee`（2 回とも時間切れ）。
    ⚠ `js/overpass.js` の 3 本の Overpass が**同時に**答えなかった回がある。
  - refused: `api.airplanes.live`（403——旧経路）、`api.gdeltproject.org`（429。手の `curl` では 200。
    レート制限）。
  - 監査の curl で 403 だった `api.planespotters.net` は、識別できる User-Agent で **200**。
  - 所要 93 s（再試行の 30 s 待ちと 40 s の時間切れを含む）。

## 4. 無人の取り直し

- 2 本目の workflow を作らなかった。`tle-refresh.yml` は bot PR・承認・merge・deploy の起動という難しい部分を
  既に解いていて、写すとその約 100 行が 2 か所になる。⇒ その job に 1 段足した: `scripts/data-refresh.mjs --run`。
  CelesTrak が落ちた回もほかの束は止めない（`!cancelled()`。job はカタログのために赤のまま）。PR の本文と
  コミットに、取り直した束の表を載せる。`git add` は取り直しが報告したパスだけ。
- **名簿は宣言から発見する**: 記録の `autoRefresh: '<無人で走らせてよい理由>'`。⚠ 語彙の `refresh` は cadence の
  綴りの 1 つなので使えない。門の新しい規則 `refresh-safe` が、`update-failure` に名指される builder（確実でも
  疑いでも）と `static` / 周期なしの束からの宣言を拒む。
- **期限は宣言された周期**（`freshness()` と同じ `AGING_AT`）。job の shallow clone では日付を GitHub の履歴に
  訊き、どちらでも読めなければ期限扱い。⚠ `data-refresh.mjs` は `data-governance.mjs` を import するが、
  その job は `npm ci` しない——`outbound-hosts.mjs` の acorn を `main()` の中の動的 import に移した。
- 載せた 5 本（deep-sky・small-bodies・spacecraft・gibs-range・who-don）と、載せなかったものの理由は
  `docs/DATA-GOVERNANCE.md` §4.6。5 本とも scratch ディレクトリで実行して成功（deep-sky 6 s・small-bodies 47 s・
  spacecraft 29 s・who-don 47 s・gibs 63 s。gibs は `ROOT/data` に書くので元のバイトに戻した）。
  現在は 5 本とも期限切れ（初回の run で取り直される）。

## 5. 検査

- `tests/upstream-liveness-checks.test.mjs`（9 本）: 分類器／fetchChecked／measureAll（偽の fetch）／赤の条件／
  probe の宣言／**builder を子プロセスで実際に走らせ、大域 fetch を偽物に替えて**「書かずに非 0」／
  freshnessOf の拒否（周期なし・根拠なし・P1W・二重宣言）と実リポジトリ／名簿と期限。
  ⑥ は元のコードでは small-bodies と spacecraft が番兵のファイルを上書きして落ちる（両方とも短い束を書いてから
  exit 1 していた）。
- `npm run check:datagov`・`check:static`・`check:docs` 緑。全件の `npm test` は統合後に呼び出し元が 1 回。

## 6. 残したもの・提案

- **js/ は触っていない**ので、次は報告だけ:
  - `js/data-layers.js:4108` `genSyntheticPlanes()` は、実データが取れないとき空港の周りに**乱数で 270 機**
    作る（`:4573` の旧経路のフォールバック）。偽物の航空機を実データのように描く経路で、`AGENTS.md` §3-3 に
    反する。旧経路（`?aviation=v1` / `intmap_aviation_v2=0`）は `api.airplanes.live` に向かい、今夜も 403。
    **削除の提案**: 旧経路とその合成機を撤去し、行 `api.airplanes.live` を台帳から外す（承認が要る）。
  - 束の多くが日付を `built`（`deep-sky`・`small-bodies`・`spacecraft`・`who-don`）や `probed`（gibs-range）の
    綴りで持つが、語彙の `SPELLINGS.generatedAt` にその綴りが無いので in-band の日付として読まれず、git の
    コミット日で代わりに測っている。`js/data-governance.js` に `built` を足せば、shallow clone でも日付が
    測れる（js/ の変更なので今回はしていない）。
- `build-spacecraft.mjs` の `coverageFrom()` は月名を `Jan` の綴りで引くが、Horizons は `SEP` と大文字で返す
  （実測）ので月が 01 になる。JWST の span が実際の 2031-09 ではなく 2031-01 で切れている（コミット済みの束の
  `spanTo` の多くが -01- で終わる）。範囲外の変更なので直していない。
- `build-maddison.mjs:112` の「疑い」は誤検出（§0）。門の静的な読みが、呼び出し先で `process.exit` する関数を
  知らないため。
- 周期の多くは estimate。測れたら置き換える。
- 死活は**ブラウザが話すホスト**だけ。builder の上流（SIMBAD・SBDB・Horizons…）は、名簿の builder が走るときに
  自分で確かめるだけ。

## 統合時に足したこと

- `scripts/build-spacecraft.mjs` の `coverageFrom()` が Horizons の大文字の月名（`2031-SEP-20`）を読めず、知らない月を `01` で埋めていた。JWST の軌道は Horizons が 2031-09-20 まで持つのに 2031-01 で切れていた——**上流が述べていない日付をコードが代入していた**。月は大文字小文字を問わず読み、読めない月は代入せず例外にする。束を作り直して JWST は 2031-09-20 まで。
- 束が日付を `built`（deep-sky ほか）・`probed`（gibs-range）の綴りで持っていたので、`js/data-governance.js` の `generatedAt` の語彙に 2 つを足した。shallow clone でも束自身の日付で鮮度を測れる（fresh 82 → 84）。
