---
title: 最初の 1 枚——初回訪問は地図が全面、パネルは読者が開いたときだけ。起動は開いていないパネルの縮小画像と世界の地名辞典を取らない（同一オリジン 13.43 MB → 3.89 MB）。閉じた Chronos が年の軸を持つ
date: 2026-10-03
newsen: A first visit opens on a full-screen map, and start-up downloads fell from 13.4 MB to 3.9 MB.
newsjp: 初回の訪問は地図が全面に出ます。起動時のダウンロードは 13.4 MB から 3.9 MB に減りました。
---

〈依頼〉本番（2026-10-03、初訪問＝ストレージ・SW・キャッシュ消去、未ログイン、1024×768）で、**初回だけ**左（Countries の GDP 一覧）と右（Layers）の両パネルが開き、地球儀が中央 ~250 px に押し込まれる。2 回目以降は全画面＝初回のほうが悪い。初回転送 ~12 MB のうち、Layers の縮小画像 33 枚と `gazetteer-world.json.gz` 5.29 MB。一番の売り（about.html「Every year of the world, on one map」）の入口は右下の小さな Chronos ボタンだけ。「最初の 1 枚」という状態を 1 つ定義し、初回体験をそこから作る。

## 0. 測った（前・起点 b7978872 のビルド）

`tests/first-impression.spec.js` と同じ条件: 1024×768・ストレージ空・Service Worker 遮断・外部ホストは遮断（同一オリジンだけを数える）。**Worker からの取得も数える**ため `context.on('requestfinished')`（`page.on` では `js/data-door.js` の Worker が取る `data/` が漏れる——最初の計測は地名辞典 0 件と出た）。最初の描画から 16 秒。

| | 前 | 後 |
|---|---|---|
| 同一オリジンの要求 | 65 | 31 |
| 同一オリジンのバイト | 13,429,179 | 3,892,761 |
| `preview_*.png` | 33 枚・4,251,201 B | 0 |
| `data/gazetteer-world.json.gz` | 1 件・5,286,074 B | 0 |
| 左の側柱 | 開（画面上 400 px）・canvas 624 px | 閉・canvas 1024 px |

開けば取る: Layers を開くと縮小画像が来る、検索欄に focus すると地名辞典が来て `IntMapGazetteer.world()` が埋まる（同じ spec の ②）。

## 1. 根本原因（3 つとも「誰も頼んでいない」を区別していなかった）

- **左**: `js/app-body.js` は保存された答えが無い（`left===null`）とき**携帯だけ**畳み、デスクトップは index.html のマークアップ（開いた側柱）に落ちていた。既定タブ（Countries）が選ばれるので GDP 一覧がそのまま出る。
- **右**: `js/map-ui.js` は答えが無いときにレイヤーパネルを idle で開いていた（#R210 の「初回時は右サイドバーも開いた状態に」）。今回の依頼「初回も地図が全面。パネルは読者が開いたときだけ」はそれを撤回する同じ読者の後の指示。⚠ ヘッドレスの本計測ではこの経路は 6 秒以内に開かなかった（左は開いた）——本番で観測された右パネルはこの経路のもの。
- **縮小画像**: `js/layer-previews.js` の門は「`kick()`（パネル表示）・地図の最初の idle + 400 ms・6 秒天井」の早いほうで開いた。#R408 が携帯から、#R668 が横向きの携帯から自動開放を外し、**デスクトップだけに残っていた**——開いていないパネルの 33 枚を初回訪問が払っていた。
- **地名辞典**: `js/news-context.js` の `rebuildGeoIndex()` が `GZ.warm()` を呼び、それを `js/app-body.js` の起動が同期で呼ぶ。ニュースは読者が頼むまで取らない（#R372）ので、**置く見出しの無い索引のために** 5.29 MB を取っていた。

## 2. 作ったもの

- **起動時に開く側柱は、前のセッションが開いたまま終わった側だけ**（左 `_sessUI.left===true`・右 `ui.right===true`）。端末を問わない 1 文。復元された右パネルは即座に開く（格子は idle で前もって組まれている。#R210 の WARN が idle を待たせたのは「組まれていない初回の格子」で、その場合はもう開かない）。
- **縮小画像の門の鍵は `kick()` だけ**。自動開放の IIFE を外した（携帯判定 `_bootMobile` と埋め込みの例外はこの自動開放のためだけにあったので一緒に消えた）。`kick()` を呼ぶのは格子が表示されている所だけ——側柱の `open()`（ワークスペースの窓も `open()` で開く）、シートの mount（#R408 の `_hostShown`）、★ 行（`refreshFavs` は今回から、閉じた側柱では kick しない。同期された★が起動時に届くと門が開いてしまうため）。⚠ 削ったものは無い: 開けば同じキューが同じ順で全部出る。
- **地名辞典は読み手が取りに行く**。索引作りは `intmap-gazetteer-world` を**聞くだけ**になり、取りに行くのは ① ニュースの地名解決の最初の見出し（`analyzeContext`）② 地名検索欄の focus／検索ボタンの pointerdown（国データと同じ手、`_reach`）③ 既に自分で `warm()` を待つ読み手（`js/atlas-query.js`・`js/shakemap.js`・`js/seismic.js`・`js/pandemic-world.js`・`js/routing-ui.js`・`js/search-geocode.js`）。全数を確かめた: 同期で `world()` / `index()` を読むのは `HOST.BUILTIN_GAZETTEER`（検索・ニュース索引。届くまでは curated 行で答え、届けば索引が作り直される）と `pandemic-world` の候補（同じファイルの先頭で `warm()` を待つ）だけで、地図のラベルは読まない。
- **閉じた Chronos に年のレール**（デスクトップ、`#ntl-peek`・`js/news-timeline.js` `buildPeek`）。時計の床から「現在」まで、印は `niceTicks`（目盛りと同じ導出・年の一覧を書かない）、位置は Year スライダーの写像 `y2p`、点が地図のいまの年。印を押すとその年へ（`setYear`／`setNow`——スライダーと同じ書き込み、パネルは開かない）。重なる印は描画後の実幅で測って字だけを落とす。ポップアップ・ウェルカムカードは作らない（#R104）。携帯は閉じた Chronos 自体が出ない（シート頭の時計）ので配置は無変更。⚠ ボタンの副題「Chronos／地図の時間を操作」は #R289 の利用者指定なので変えていない。

## 3. 検査

- `tests/first-impression-checks.test.mjs`（段 0）: 左の起動状態の式を**評価**（null/false→閉、true→開）／`_openQueue` を参照する関数は `kick` だけ（AST。前のコードでは `layerPreviews` が 2 回参照していて落ちることを確かめた）／`warm` を呼ぶ関数に `rebuildGeoIndex` が無く `analyzeContext` が有る／レールの印を実際の `IntMapHistScale` で評価（床が先頭・レール順・「現在」より手前）。
- `tests/first-impression.spec.js`（段 2）: 上の表の前後と、Layers を開けば縮小画像・検索欄で地名辞典・レールの印で年が変わり「現在」で戻る。

## 4. 起動の天井を上げた行と、共有窓口の基準

`eager.cssRaw` 365.8 kB → 368.3 kB（`node scripts/perf-budget.mjs --update`、他の行は無変更）。年のレールの規則そのもの（`currentColor` と `--t`/`--pk` で状態ごとの規則を畳んだ後で約 1.4 kB）で、main の木が既に天井より約 1.1 kB 上（幅の中）にいたため幅を越えた。買ったものは「最初の画面に年の軸がある」こと。同じ変更で起動の同一オリジン転送は 9.5 MB 減っている。

`eager.gzip` 1523.9 kB → 1532.2 kB。⚠ **この行を越えたのはこの PR ではなく main の木**: main `9dcfdcad` の CI（run 37091191359、Gates 2/3）が同じ行で既に赤く、そこでの実測は 1531.8 kB（幅 7.6 kB を 0.3 kB 超過）。この PR の分は +0.4 kB（実測 1532.2 kB、ローカルの build と CI が一致）で、`_reach` と年のレールの JS。天井は main と合流した木で `--update` する（越えた行だけが上がる）。

`check:surface`: `window.IntMapGazetteer` の読みが 16 → 18。新しい 2 か所は地名辞典を**必要になったところで取りに行く**読み手（`js/app-body.js` の検索欄の `_reach`・`js/news-context.js` の `analyzeContext`）。`js/gazetteer.js` は `window` に自分を置く古典スクリプトで export を持たないので、所有者から import する道はまだ無い（`node scripts/module-graph.mjs --plan`）。同じ変更で `IntMapDevice` 82 → 80・`IntMapMemBudget` 34 → 33（縮小画像の自動開放を外して `_bootMobile` が消えた）。基準は `node scripts/global-surface.mjs --update` で書き直した。

## 5. 統合で直したこと

- **撤回前の挙動を固定していた既存の検査 4 本を、新しい事実に対して同じ強さで書き直した**（弱めていない）。
  `tests/process-map-shell-source-lines-checks.test.mjs` R195 ① は両方の側柱の起動式を**評価**する（保存なし／閉／開 × デスクトップ／携帯で、開くのは「開」だけ）。
  `tests/shell-test-infra-checks.test.mjs` R210 ⑥ は「試験の席が両方の問いに答えていること」と「この spec だけは席を使わないこと」。
  `tests/shell-layer-panel-checks.test.mjs` R408 ①c は「携帯では」から「どの端末でも」へ——`_openQueue` を参照するのは `kick()` だけ（main の木では 2 件余計に参照して落ちることを確かめた）。
  `tests/share-embed-distribution-checks.test.mjs` ⑧ は `js/layer-previews.js` を読み手一覧から外し、埋め込みが縮小画像を買わないことを同じ一般則として測る。
- ⚠ **試験の席（`tests/helpers/session-seed.js`）が左の問いに答えていなかった。** 席は `lsrOpen:false` だけを持ち、左は「答え無し」＝前はマークアップの開、今回からは閉。全 spec が書かれた時と違う画面を測ることになる。**実測**: `tests/r508.spec.js` は `#btn-open-settings` に届かず（element is outside of the viewport）、core の `tests/smoke.spec.js` #R349 は前線を 0 本と数えた。席に `sbOpen:true` を足して両方緑（#R210 が右に `lsrOpen:false` を足したのと同じ理由）。携帯では `collapsed` は無効（`css/intmap.css` のシート）。
- ⚠ **`tests/first-impression.spec.js` は「ストレージ空」と書きながら席を受け取っていた。** `playwright.config.js` の `storageState` は `browser.newContext()` にも効く。① は右 `false`・左「答え無し」の席で緑だった＝右の未回答経路を測っていなかった。`storageState` を空で明示し、起動時にページが保存を見なかったことを assert する。
- `tests/durations.json` に 22 秒（3 件の testcase 時間の和、実測 21.7 s）。core から deep へ移り、件数の写し（docs/FILES.md・docs/TESTING.md・package.json・scripts/worktree.mjs）を 128 / 134 に合わせた。
- ⚠ **並行の shell-experience は「初回の右パネルは地図が窓の半分以上残るときだけ開く」を入れている。統合で衝突したら、この branch の方針（初回はどちらの側柱も開かない＝地図全面、開くのは前回の保存が開だったときだけ）を正とする。** 依頼の文「初回も地図が全面。パネルは読者が開いたときだけ」は幅を条件にしていない。

## 6. 残したこと

- 起動の残り 3.89 MB の内訳（国データ・基図など）は今回の範囲外。測定は spec が毎回印字する。

## 統合時の性能予算（830f271b へ重ね直した後の build）

超えた行だけ `--update` で上げた（増えた理由は上の節）:
- eager.gzip: 1523.9 kB → 1532.2 kB
