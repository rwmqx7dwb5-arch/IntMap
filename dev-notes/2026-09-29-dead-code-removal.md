---
title: 死んだコードの撤去——読み手 0 の window 公開 51・呼ばれない局所関数 35・呼ばれない PMTiles ローダ・未配備の gemini 退避ファイル・起動元の無いスクリプト 4 本。次の 1 件は手ではなく check:surface の「読み手の無い公開名」が見つける
date: 2026-09-29
---

〈依頼〉構造監査（`dev-notes/2026-09-29-structural-audit-reform.md`）が列挙した死んだコードの撤去を、
利用者が承認した。条件は「**撤去の直前に、実行時の読み手が 0 であることをもう一度確かめる**。
確かめられないものは残して報告」。

## 0. どう確かめたか

- **window の公開名**: 名前ごとに `git grep -w -F` を全追跡ファイル（`dist/`・`.md`・基準 JSON を除く）へ
  かけ、`window.NAME =` の代入以外の出現を 1 行ずつ読んだ。出現は 9 名にあったが、全部コメントだった
  （`js/tables.js` の `refreshGeoLabels()`、`index.html` の `_populateNewsSources` など——文も直した）。
  ⚠ **Atlas の到達範囲**: `js/atlas-controls.js` の `moduleCatalog()` は `Object.keys(window)` を
  `MOD_RE` で絞り、`MOD_METHODS`（open/toggle/close/clear/exit/refresh/render）を 1 つでも持つ
  オブジェクトを planner の目録に載せる。消す候補の `IntMap*` を 1 つずつ見て、
  **`IntMapActionResult` は `API.render` を持つので目録に載っている＝残した**（CONSTITUTION.md §5）。
  `js/lazy-modules.js` の `publishes` 名簿と `js/gis-project.js` の `/^IntMapGis/` にも候補は無かった。
- **局所関数**: TypeScript 自身のスコープ解析（`tsc --noUnusedLocals --allowJs --checkJs`、TS6133）で
  「宣言されたが値が読まれない」を出し、依頼の一覧の全件がそこに在ることを確かめた（同名の遮蔽——
  `js/map-tools.js` の `jp` は 3 つある——も TS が区別する）。文字列・`onclick` の中の名前は `git grep` で別に見た。
- **撤去の後にもう一度** TS6133 を HEAD と比べ、撤去が新しく作った「読まれない宣言」を列挙した（§3）。

## 1. 撤去したもの

| 種類 | 件数 | 行 |
|---|---|---|
| `js/layer-packs.js` の `loadPMTiles`（`pmReady`・`pmLoading`・`pmQ`・見出し） | 1 | −15 |
| `supabase/functions/ai-proxy/index.gemini-backup.ts`（未配備・参照 0） | 1 ファイル | −486 |
| 起動元 0 のスクリプト `_resolve.mjs`・`scripts/decouple-residue.mjs`・`scripts/i18n-append-keyed.mjs`・`scripts/i18n-pair-apply.mjs` | 4 ファイル | −372 |
| 読み手 0 の window 公開（js/・src/ 49、`admin.html` の `_admSafeUrl`、`index.html` の `INTMAP_STAGING`） | 51 | — |
| 　うち本体ごと消えたもの（`smoothGeoPath`・`refreshGeoLabels`・`_hideCompare`・`_backToStats`・`_wsCountryInfo`・`_azimuthalFromPin`・`IntMapSim`・`IntMapWorker`・`IntMapDatedLayers`・`_refreshKoppenImage_LEGACY`・`imToggleRimland`/`imToggleFSU` とその `addRimland`・`applyRimland`・`addFSU`・`applyFSU`・`RIMLAND`・`FSU`） | | |
| 宣言スコープで参照 0 の局所関数 | 35 | |
| 撤去の巻き添えで読み手 0 になった宣言（`MILITARY_CALLSIGN_PREFIXES`・2 つの factory の `GE`） | 3 | |

js/・`admin.html`・`index.html` の合計は **−296 / +25 行**（+ は書き直したコメント）。
Atlas の目録から消えた能力は無い（消した `IntMap*` はどれも `MOD_METHODS` を持たない）。
Rimland / 旧ソ連の塗りは #R225 で行が消えてから UI からも Atlas からも到達不能だった
（Atlas の別名表の `'former soviet union':'fsu'` は id `fsu` の要素を探し、それは存在しない——§4）。

## 2. 残したもの（と理由）

- **ACLED ブロック（`js/app-body.js` の `return; /* ACLED card retired (#R22) */` の IIFE）と `IntMapACLED`。**
  中身は全部到達不能だが、**`tests/r164-checks.test.mjs` #2 が「`renderUI` は実行時に再代入される」を
  必須にしていて、その唯一の再代入がこの死んだブロックの中にある**（テスト自身のコメントもそう書いている）。
  消すと r164 #2 が赤くなる。r164 は並行作業の統合中で触れないので見送った。
- **コンソール用の診断（用途が文書・コメントに書いてあるもの）**: `IntMapDataHealth`（`docs/TESTING.md` が
  「ブラウザのコンソールで手動診断」と表に載せる）・`IntMapAtlasTrace`（`IntMapAtlasDev` で入るデバッグ）・
  `IntMapRegionResolverDebug`・`_imBasinDiag2`（「read-only diagnostics」）・`_imLabelStats`（「diagnostics」）・
  `__applyFlagFont`（「canvas probe が当てにならないとき手で強制する」）・`IntMapPerfHud`（`?perf=1` の計器の `state()`）。
- **`IntMapActionResult`**（Atlas の目録に載る。§0）。
- **局所関数のうち 7 つ**:
  `polyGeometry`（js/gis-ops.js）— 呼び出しは 0 だが、**`tests/r749-gis-raster-pipeline-checks` ⑨ が
  カーネルのバイトの sha256 を `scripts/gis-kernel-versions.mjs` の台帳と照合する**。答えを変えない編集なので
  台帳の手順は「版はそのまま、新しいハッシュを記録」だが、その台帳はこの作業の一覧の外なので見送った。
  `ringLines`（js/seismic.js）— 呼び出しは 0 だが **`tests/r237-checks` が本文 `_frontSteps(a)/2` を綴りで固定**。
  `mmiWord`（js/seismic.js）と `addJunction`（js/workspace.js）— 消すと **`check:i18n` が赤**（下の §4）。
  `_openSetPassword`・`openArticleInSidebar`（js/app-body.js の shim）— **`tests/r168`/`r169` が shim の存在を要求**。
  `_healthFlag`（js/atlas-console.js）— 残した `IntMapDataHealth.flag` が読んでいる。
- 依頼どおり触らなかった: `faultFrontLines`・`_clock`、`_precip_convert.py`・`_precip_years_convert.py`・
  `scripts/perf-compare.mjs`・`scripts/histeras/coverage.mjs`、locale と `scripts/i18n/*.json`。

## 3. 次の 1 件を見つける規則（`check:surface` の `unread`）

60 件は一回きりの手作業の調査で見つかった。**61 件目を見つける者はいなかった。**
`scripts/global-surface.mjs` の `unreadPublications()` が、公開名ごとに「代入以外の読み手」を数え、
0 の名前を `tests/global-surface-baseline.json` の `unread` に**名前で**持って両方向に照合する
（既存の register と同じ流儀——増えたら「読み手の無い公開」、減ったら `--update`）。

- 読み手＝`js/`・`src/`・`tests/`・`scripts/`・トップの HTML の**コード**での出現。コメントは acorn で消し、
  **文字列は残す**（`onclick="_x()"` や `window['X']` は読み手）。
- `Object.keys(window)` を正規表現で絞って列挙するコードは**ソースから発見する**（今日は Atlas の目録と
  `js/gis-project.js`）。列挙が入口の一覧も要求するなら（Atlas）、公開元ファイルがその入口を定義していれば
  読まれている扱い。⚠ 判定はファイル単位なので**「読まれている」側にしか誤らない**——この規則が
  Atlas の届くモジュールを消させる理由になってはならない。
- 今日の `unread` は 8 名: 残した診断 4（`__applyFlagFont`・`_imBasinDiag`・`_imBasinDiag2`・`_imLabelStats`）と、
  §4 の 4 名。
- `tests/dead-code-removal-checks.test.mjs` が規則を 1 点ずつ違う fixture で測る（どの置き場の読み手でも外れる／
  コメントは読み手でない／文字列は読み手／二度目の代入は読み手でない／列挙の発見と入口の要求）。
  **消した名前は 1 つも書いていない**——消したものの一覧はその名前しか守らない。

## 4. 未解決（見つけたが、この依頼の外）

- **撤去の巻き添えで読み手 0 になったもの**: `_refreshKoppenImage_LEGACY` が唯一の呼び手だった
  `applyKoppenGPUHighlight`・`buildKoppenHighlightFull`・`freeKoppenFull`（と `ensureKoppenFull`・
  `koppenColorRamp`・`KOPPEN_MIX` 等の全解像度／GPU 経路、約 100 行）と、その状態の
  `window._koppenGPUOK`・`_koppenHLSeq`・`_koppenHLUrl`（`unread` に出ている）。コメント自身が
  「#R23 以来 OFF」と書く経路で、撤去の候補。
- `window._mAddPoint`（js/mobile-map-input.js）— 読み手 0。今回の一覧の外。
- `mmiWord` / `addJunction` を消すと `check:i18n` が **de/es/ru の位置引数行 −13、fr/ko/zh/zh-hans の
  inline 行 −6、到達不能キー 3（"barely felt"・"violent"・"Drag to move all the borders that meet here"）**で赤。
  言語体制は凍結で locale を消せないので、関数ごと残した。
- `tests/r469-checks.test.mjs:133` と `tests/r375-checks.test.mjs:46` のコメントが、消した
  `_wsCountryInfo`・`applyRimland` を名指している（検査は赤くならない。r-test は並行統合中で触れない）。
- Atlas の別名表（js/atlas-console.js）の `'former soviet union'/'ussr'/'soviet'/'旧ソ連' → 'fsu'` は
  存在しない要素を指している（#R225 以来）。今回の撤去の前から到達不能。

## 5. 否定した見立て

- 「`IntMap*` の名前は全部 Atlas の目録に載るので消せない」——**否定**。目録は `MOD_METHODS` を 1 つでも
  持つオブジェクトしか載せない。消した 17 の `IntMap*` はどれも持たず、持つ `IntMapActionResult` だけ残した。
- 「`loadPMTiles` を消すと SRI のゲートの被覆が減る」——**否定**。`scripts/runtime-scripts.mjs` の規則は
  ファイルでなく事実に付いていて（`tests/vendored-runtime-scripts-checks` ⑦ が新しいローダを任意の形で捕まえる）、
  消えたのは対象の 1 件だけ。⑥（このローダ専用の変異）は対象ごと消した。
- 「プロトコルは 7 つ」（js/dash-extended.js・tests/helpers/network.js）——**否定**。数えると
  `imapsat`・`om`・DEM（`imapterr`）・world-base・`imapcrop` の **5 つ**。pmtiles を入れても 6 で、7 は前から誤り。
