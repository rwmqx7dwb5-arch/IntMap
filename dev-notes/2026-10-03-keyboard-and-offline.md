---
title: 画面を見られない人・マウスを使わない人・回線が無い人へ——地図を言葉で読む（Alt+R・読み上げモード）と、持ち歩ける地図（オフライン保存。保存してよいかは供給元の規約を台帳に書いたものだけが答える）
date: 2026-10-03
---

〈依頼〉「足し算。商品開発。新しい読者へ。全権を委任する。」新しい読者層は 3 つ——画面を見られない・マウスを使わない・回線が無い。
①キーボードだけで地図を移動・拡大し、いま画面に何があるかを読み上げさせる。②選んだ地域と基本表示・レイヤーを端末に保存し、
回線なしで開く。保存する量を事前に示し、上流の規約で保存してよいものだけを対象にする（手書きの許可一覧を作らない）。

## 0. 測った（着手前）

- 土台は在った。`js/map-narrator.js`（#map は名前のある region・`#map-narration` の live 領域・落ち着いてから 1 回・Alt+N で地物を巡る）、
  `js/place-dossier.js`（1 地点について地図が持つもの全部を **1 つの plain record** に。地点カードと Atlas の `research.placeProfile` が同じ record を読む）、
  `sw.js`（タイルのキャッシュと、**インストール済みの殻をブラウザがオフラインと言うときだけ**返す）。
- 欠けていたのは **「いま中心に何があるか」を声にする入口**——narrator の 1 段落は場所・日付・レイヤー名・件数だけで、標高・行政区分・
  現地時刻・**レイヤーの値**は地点カードを開かないと読めず、カードはポインタの操作だった。
- オフラインは **殻（アプリ本体）だけ**。地図のデータは 1 バイトも持てず、「読者が選んだ地域」を持つ場所が無かった。
- 保存してよいかを述べる場所が**どこにも無かった**。`scripts/outbound-hosts.json` は「どのホストへ何を送るか」の台帳で、
  「そのホストのファイルを写してよいか」の欄は無い。

## 1. 形

### 地図を言葉で読む（`js/map-reader.js`・遅延）
- **Alt+R**（地図にフォーカス）＝中心にあるものを読み上げ。**Alt+Shift+R**＝読み上げモードのオン・オフ（既定オフ・`intmap_map_reading`・設定に同じ select・Atlas の `settings.mapReading`）。
  オンの間は、落ち着いた移動のたびに「約 12 km 北東へ移動」→同じ段落。移動と拡大は既存の矢印と +/− のまま（新しい入力経路を作っていない）。
- ⚠ **何も集めず何も決めない**: 記録は `placeProfile` が作り、`profileSpeech`（`profileHtml` の隣）が文にする。**カードと耳は 1 つの record を読む**。
  答えられなかった節は理由を言う（「地名を取得できません: 取得先に到達できませんでした」）——黙れば「何も無い」と聞こえる。
- ⚠ **live 領域に書くのは narrator 1 つ**。reader は `narratorApi.say / enrich` に文字列を渡すだけ。読み上げモードでは**完成した 1 回**だけ言う
  （書きかけを書き換えると読み上げが途中で切り直される）。Alt+N の巡回は保留中の段落を捨てる（`enrichSeq`）——巡回の「地物 2 / 5」が後から上書きされない。
- Alt は Alt+N と同じ理由（1 文字ショートカットは修飾キーで戻る・レンダラは矢印と +/− だけ・ブラウザの既定に Alt+R は無い）。`e.code` で読むので macOS の Option+R も同じ。
  `tests/keyboard-and-offline-checks.test.mjs` ④ は他のどのファイルも Alt と R を結んでいないことを測る。

### 持ち歩ける地図（`js/offline-maps.js`・`js/offline-plan.js`・`sw.js`）
- 保存するもの: ①表示範囲の**地形（terrarium）タイル**（粗い細かさから）②開いたレイヤーの **IntMap 自身のファイル**（resource timing から**発見**・殻が持つものは除く）。
  ページが所有するキャッシュ `intmap-page-offline-v1`（`intmap-page-` 接頭辞なので activate が消さない）。
- **保存の前に大きさを言う**: タイル数は範囲から厳密、1 枚の重さは範囲の中心の数枚を**実測**して補間（外挿しない）・「約」。端末の空きの半分を超える細かさは出さない。
- **保存してよいかは台帳が述べたものだけ**: `scripts/outbound-hosts.json` の各ホスト行に任意の `offline: { allowed, kind, pathPrefix, basis, why, whyJp }`
  を足し、`scripts/offline-sources.mjs` が `data/offline-sources.json` に導出。ページはそれだけを読む。述べていないホスト＝**拒否**（沈黙は許可ではない）。
  `check:datagov` の規則 `offline-declared`（`outbound-hosts.mjs` の ④）が、basis・理由（en/jp）・kind が無い／許可に pathPrefix が無い／要求されないホストへの記述を拒み、
  `checkRepository` が導出との一致を測る。
- ⚠ **実測した規約**（2026-10-03・どちらも URL を開いて読んだ）:
  - **OpenFreeMap（基図のベクタタイル）＝ `allowed:false`**。利用規約 User Conduct は「許可なく自動的な方法でサービスからデータを収集しようとしない」ことを求める。
    地域の事前保存は自動収集そのもの。**手書きの許可一覧なら緑のまま保存していた**——台帳に「いいえ」と書いたので、ダイアログは規約へのリンクつきで「保存しないもの」に出す。
  - **AWS Terrain Tiles ＝ `allowed:true`（pathPrefix `/terrarium/`）**。AWS Open Data の公開バケット。登録ページは一括取得の道具（PlanetUtils 等）を挙げ、ライセンス
    （tilezen/joerd attribution.md）が求めるのは帰属表示で複製の制限ではない。
  - Esri World Imagery・CARTO は**誰も書いていない**＝保存しない（`not-stated`）。規約を読んで書けば保存できるようになる——コードは変わらない。
  - 結果として、基図のベクタタイル・衛星画像・天気や航空機などの生きたデータは**保存されない**（読者が既に見たタイルをブラウザのキャッシュが持つのは従来どおり）。
    オフラインで開いた地図は、IntMap 自身のデータ・コードと保存した地形で動く。これは依頼の「基本表示を保存する」より狭い——**規約が許さないものを足さなかった**。
- **sw.js は保存した領域を、ブラウザがオフラインと言うときだけ**返す（殻と同じ規則。オンラインの経路は変わらず、保存した写しが新しい取得より優先されることも無い）。
  地形タイルは 5 つのホスト別名で要求される（MapLibre が (x+y)%5 で選ぶ）ので、保存も参照も**1 つの綴り**（`offlineKey`）に畳む。ページ側（`savableTemplate`）が選ぶ綴りと同じことを
  5 別名すべてで `tests/keyboard-and-offline-checks.test.mjs` ③ が測る。
- 失敗したタイルは**数えて欠けを言う**・黙って取り直さない（`one-pass-or-a-reason` §5）。中断できる。粗い順なので中断しても範囲の全体が粗く残る。保存済みの一覧と削除（他の保存が使うファイルは残す）。

## 2. 否定した見立て・測り直したもの

- **基図も保存する**: 最初は OpenFreeMap のベクタタイルを保存するつもりだった（基本表示が主題）。規約を読んで撤回。
- **レイヤーごとに宣言を足す**（descriptor に `bundles`）: 176 のレイヤー宣言のうち出自を述べるのは `sources` の 6 件だけ。手で写せば写しが先に古くなる——実際に読み込まれたファイルから発見する形にした
  （代償: 「開いたレイヤー」ではなく「このセッションで開いたものが読み込んだ IntMap 自身のファイル」）。
- **許可を `data-governance.js` の FACETS に足す**: あちらは束の出自の語彙。ホストごとの事実は既に台帳にあるので、台帳に欄を足した（二重の正本を作らない）。
- `window.IntMapDem` を読む案: `check:surface` が新しい辺として拒んだ。持ち主 `makeDemSource` を import し、アドレスの写しを持たない。
- `L(...)` を関数でくるんで渡すと `i18n-pair-audit` が「2 つのデータ枠」と数えた（175 件）。`IntMapLang.pick` を直接束縛して 143 に戻した。`'Stop'` は経路の「経由地」と衝突したので `Stop saving`。
- `sw.js` に `'https://' + DEM_BUCKET + '.s3.amazonaws.com'` と書くと `outbound-hosts` が `*.s3.amazonaws.com` を新しいホストとして数えた——台帳の規則どおり。既存の規則（`TILE_PATH_RULES`）から綴りを取る形にした。

## 3. 検査

- `node --test tests/keyboard-and-offline-checks.test.mjs`（14 件）— ①台帳の導出と規則の拒否・「保存してよいか」の 3 値 ②タイル算術・粗い順・収まる細かさ ③sw.js を vm で評価（オフラインだけ・他オリジンは返さない・5 別名 1 キー）
  ④移動の言葉・profile を文に・live 領域の書き手が 1 つ・Alt+R の衝突なし ⑤設定の 2 行と能力 2 件。
- `npx playwright test tests/keyboard-and-offline.spec.js` — ①本物のキー（Alt+R・Alt+Shift+R・ArrowRight・Equal）で読み上げ・移動・拡大 ②保存ダイアログが測って「保存しないもの」を理由つきで言い、保存し、
  オフライン化した context で**保存時と別の別名**の地形タイルが返り・保存した IntMap のファイルが返り・アプリが殻から開き・削除でキャッシュが空になる。供給元は `context.route` が答える。

## 4. 起動費・結合

- `js/map-reader.js`・`js/offline-maps.js`・`js/offline-plan.js` は**遅延**（キー・設定・Atlas・保存済みスイッチのときだけ。chunk は 2.2 / 13.9 / 2.3 kB）。eager に足したのは
  `js/map-narrator.js` の約 25 行（キー 1 つと戸口の配線）、`js/keyboard-shortcuts.js` の設定 2 行ぶんの言葉、`js/atlas-capabilities.js` の行 2 本、**葉の 1 モジュール `js/narrator-api.js`**。
- ⚠ **eager.requests 9 → 10 になりかけて、直した**（`check:perf`）。lazy の 2 モジュールが `js/map-narrator.js` を import すると narrator が lazy と共有され、narrator から他の共有モジュール
  （runtime・chronos・lang-registry・bus）への辺を、bundler が entry へ**循環なしに**折り込めず `geo-engine` が別 chunk になった（`vite.config.js` の codeSplitting の註が書いている形そのもの）。
  戸口を **import を持たない葉**（`js/narrator-api.js`）に出して 9 に戻した。レンダラは narrator が渡された `GE` を読み、`geo-engine.js` を lazy から import しない。
- `check:perf` の残り 2 行は**理由のある増加**: `eager.modules` 309 → **310**（`js/narrator-api.js`）／async `atlas-console` 1258.1 → **1264.8 kB**（Atlas の chunk に能力 2 本の登録と、planner が読む doc の英日の文が入る）。
  eager raw は +3.8 kB・gzip +1.3 kB・brotli +0.7 kB で、いずれも既存の band 内。⚠ `perf-budget --update` は「この branch は origin/main より 1 commit 遅れている＝CI が測る木ではない」と**拒んだ**
  （正しい）。rebase のあとで `node scripts/perf-budget.mjs --update` をこの 2 行に対して 1 回走らせる（統合者の仕事）。
- `check:surface` が名指した新しい window 経由の結合: `window.IntMapDialog`（`js/offline-maps.js` が `open` する。`js/dialog.js` は葉だが export を持たず、キーボードの help ダイアログと同じ入口）。44 → 45。
- `tests/i18n-coverage-floor.json`: zh / zh-hans の inline 表が 1 行増えた（`Alt+R` の行の訳）ので床を上げた。`tests/durations.json` に新しい spec の実測（23 s）を足した——10 s を超えるので deep 層に入る
  （push と PR では走らない。変更した spec は PR の core で走る）。docs の spec 数（deep 133 → 134・all 139 → 140）を実体に合わせた。

## 5. まだ届いていないもの（正直に）

- 基図・衛星画像はオフラインで出ない。許可は供給元の規約を読んで台帳に書けば足りる（コードは読むだけ）。**規約は変わる**——OpenFreeMap の規約は 2026-09-09 改訂版を読んだ。
- 「選んだレイヤー」は、いま開いているレイヤー名と、このセッションが読み込んだ IntMap 自身のファイルまで。レイヤーごとの出自宣言は無い（上の否定した見立て）。
- 読み上げモードの地名（行政区分の鎖）は Nominatim で、オフラインでは「取得できません」と言う。保存した領域に地名は入っていない（Nominatim の事前取得を許すと台帳に書いた人がいない＝保存しない）。

## 統合時の性能予算（3b00e442 へ重ね直した後の build）

超えた行だけ `--update` で上げた（増えた理由は上の節）:
- eager.modules: 309 → 310
- async.gzip: 3917.3 kB → 3938.1 kB
- async chunk "atlas-console": 1266.3 kB → 1272.8 kB
