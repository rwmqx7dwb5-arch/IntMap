---
title: 利用者の指摘 14 件——Atlas の答えを 1 つのデータから作り直す・浮遊表示・ニュース詳細の圧縮・ロゴ・Tools の分割・宇宙ズームの床・カードの追従（衛星の速度は律速を測って特定、変更なし）
date: 2026-11-17
newsen: Atlas rankings now use dated World Bank figures with their source, and the answer is edited into one conclusion. Atlas can float over the map (Settings). News details are shorter, the Tools menu holds only Measure & draw, and map cards follow their place.
newsjp: Atlas の順位は年と出典の付いた世界銀行の値で作られ、答えは 1 つの結論に編集されるようになりました。設定で Atlas を地図の上に浮かせられます。ニュース詳細は短くなり、Tools は測る・描くだけに、地図上のカードは場所に付いて動きます。
---

〈依頼〉利用者の指摘 14 件（ニュースカードの画像は相談の結果見送り）。不明点は 4 問で確認した: ニュース画像＝見送り／動かないポップアップ＝全数を洗って直す／
浮遊モード＝入力欄も地図の上／Tools の残り＝左に 1 つのボタン／上部の位置＝余白 10px→6px。

## 0. 測った・原因

- **Atlas の古い順位**: `js/tables.js` の `LIFE`（54 か国）と `INTERNET`（43 か国）は年も出典も無い手書きの値で、`_fillMetric` は値が 25 件以上あると世界銀行を
  取りに行かなかった（同じ規則が Countries タブの `_imFillStat` にも写しとしてあった）。訂正は別の操作結果として残り、`keep()` は操作の引数が違えば別の
  枠にしたので、同じ指標の順位が「本文・Top 10・Highest」の 3 回出た。指標ブラウザは国を `k.length===3` で数え、世界銀行の集計コード（AFW・WLD…）を
  入れて「261 countries」。世界銀行の結果は `meta.provenance` を持たず、出典欄には基図のクレジットだけが並んだ。
- **宇宙ズームの閾値**: 地球儀の床は固定の minZoom 0。ズームは CSS px の大きさで、z0 の地球は画面に関係なく半径約 89px（js/space.js の実測表）。
  よって狭い画面ほど地球が大きく見え、床の 2 段上で出るヒントと切り替えが画面ごとに違う見かけで来ていた。
- **上部の位置**: 1440px 幅で検索バーも右上の群も上・右 10px（Playwright で実測）。

## 1. 直したこと

- **Atlas の答え**（`js/tables.js`・`js/wb-layers.js` `applyStat`・`js/wb-indicators.js` `applyLatest`/`wbCitation`・`js/atlas-turn-results.js` `subjectKey`/`supersedes`/`present`・
  `js/indicator-browser.js`・`js/atlas-cap-*.js`・`js/atlas-answer-sources.js`・SYS の REPLY FORMAT）: 世界銀行の系列を表へ書く経路を `applyStat` 1 本にし、
  年と出典（`_prov`）を値の横に持たせる。結果は `meta.subject`／`meta.facet` を宣言し、同じ主題・同じ面は後（年が言えれば新しい年）が前を置き換える。
  本文が既に述べた順位表と地図の報告は 1 行に畳む。国の数え上げは `isRankableCountry` を通ったものだけ。数値の結果は `meta.provenance` を持つ。
  出典欄の仕組みの説明は 1 行（詳細は tooltip）。
- **浮遊表示**（`js/atlas-float.js`・設定「Atlas の回答」・`settings.atlasDisplay`）: 同じ `#atlas-panel` を地図左のガラスのカードへ運ぶ。携帯・ワークスペース・埋め込みはタブのまま。
- **Atlas の見た目**（`js/atlas-progress.js`・`js/atlas-live.js`・`js/atlas-styles.js`）: 説明文の斜体をやめ 14px/1.55、走っている行をアクセント色と太さで前に、完了の緑を落ち着かせ、
  ラベルと秒数は通常の太さ、吹き出しの影と縁を弱めた。
- **ニュース詳細**（`js/news-brief.js` `novelty`/`condenseGist`/`latest().learned`/`groupCoverage`・`js/news-events.js`）: 要約直下の説明は 1 行、作り方は末尾の 1 つの畳みへ。
  要約と重なる引用は畳む（語の重なり 0.8・新しい数字が無いもの）。「最新の記事で更新された点」は新しく分かったことを先に、無ければ節を出さない。
  発信元は系列ごとに代表 1 本、残りとほぼ同じ見出しは「あと N 本」に畳む。消したものは無い（畳んだだけ）。
- **地図上のカードの追従**（`js/popup-anchor.js` `anchorToLngLat`）: 7 か所（施設・データセンター・OSM 施設・鉄道・企業の本社・ニュースの国の日報・警報の地点カード）の
  「1 回だけ投影して left/top を書く」手書きを、共有のカメラ購読で置き直す 1 つの部品に。点に属さない右寄せパネルと国カードは固定のまま（分類は全数）。
- **国境線のカード**: 時計が現在のときは `today-borders` の読み手が線を返さない（`js/time-borders.js`）。
- **気象警報 official の凡例**: 各国で違うのに固定で出していた「下位／上位の階級」の凡例と注記を削除。IntMap 自身の色（発表なし・未対応の斜線）だけ残す。
- **Tools**: デスクトップの Tools ▾ は測る・描くだけ、左の「その他のツール ▾」に道具・シミュレーション・分析（`mountTools` の `sections`）。携帯のシートは 4 節のまま。
- **ロゴ**: `IntMap.name.png` から黒地を抜き、t からはみ出た亀を縦棒の右端で切り、`img/intmap-wordmark.png`（225×72）に。大文字の高さを 22px の文字と同じ 20px で描く。
- **上部の位置**: 検索バーと右上の群を `--chrome-edge`（6px）1 つの値に、2 段の間は 3px。
- **宇宙ズームの床**（`js/map-projection.js` `globeMinZoom`）: log2(地図の短い辺 / 720)、下限 -2、窓の大きさが変わると引き直す。720 は入口を調整した 1280×720 の短い辺。
- **衛星画像の速度**: 別の作業場で計測した（DPR 2 の ABBA）。改善を再現できた変更が無かったので入れていない。律速と残る手は §3。

## 2. 形式上の削除と、その役目を引き継いだもの

- `LIFE`・`INTERNET` の手書き表 → 世界銀行 SP.DYN.LE00.IN・IT.NET.USER.ZS（`applyStat`、年と出典付き、報告する全ての国）。
- `_fillMetric` と `_imFillStat` の「25 件以上なら取らない」規則 → 規則なし。どちらも `applyStat` を呼ぶ。
- 入力欄の「当時の地図に置く」チップ（`_atlPasted` と `.atl-eramap`）→ `time.textMap` は言葉で頼めば同じく動く（`docs/architecture/05-ai.md`・`PRODUCT.md` を更新）。
- 警報の固定凡例 → 国をタップすると開くその機関自身の凡例（`legendFor`）。i18n の床をこの 4 行とニュースの「{s} が新たに報じた」1 行の分だけ下げた（5 行）。
- 呼ぶものの無い訳の行 8 行（2 キー）→ `i18n-dead-key-codemod`。

## 3. 衛星画像

**この回はコードを変えていない。** 試した変更はどれも利用者に見える改善を再現できず、退行させないために入れなかった。

- **計器**: `scripts/map-motion.mjs` の desktop は DPR 1 で @2x の貼り合わせ経路を通らない。DPR 2 の desktop と phone で、まだ見ていない場所での
  ジャンプ・連続パン・連続ズームを ABBA で比べ、「カメラ停止から全タイルがくっきりするまで」と「ぼやけていた時間の積算」を測った。
- **律速（実測）**: ① Esri の 2 ホストは HTTP/1.1 だけ（`nextHopProtocol`）＝衛星全体で 12 接続。96 枚を同時に投げると単独 150 ms が 1.25〜1.30 s。
  ② @2x は 1 タイルに子 4 枚で、ズーム 6 段＋パン 1 回で 458 タイル・2,634 要求、worker の往復は p50 195 ms・p99 1.3 s（待ち行列）。
  ③ Esri CDN が冷えているかどうかが他の全部より大きい（同じ景色で最初 1.2〜2.2 s、直後 0.3〜0.5 s）。④ フレーム間隔 p95 は 16.7〜16.8 ms
  ＝カクつきは描画負荷ではなく到着の遅れ（headless の観測）。
- **採らなかったもの**: worker 内の自前の待ち行列（要求 −5〜7%、往復 p90 1,278→1,033 ms だが、くっきりまでの時間は 2 回の 8 rep ABBA で結果が逆、
  パンは 2 回とも悪化側）／先読みを描画の後ろへ（パン悪化）／`priority:'low'`（phone のズームでぼやけ 60→145 ms）／3 本目のホスト
  `server2.arcgisonline.com`（往復 p50 372→507 ms）／`tiledbasemaps.arcgis.com`（配信元がドイツの AWS）。
- **残る手**: `ibasemaps-api.arcgis.com` は同じ World_Imagery を HTTP/2 で配る（`h2` を実測）＝12 接続の天井が消える。ただし ArcGIS Location
  Platform の API キーが要る（契約・鍵・出典と規約の表記・`scripts/outbound-hosts.json`・`sw.js` の `TILE_HOSTS`）。利用者の判断待ち。
- **否定された見立て**: 「描画が重くてカクつく」——フレーム間隔は 60 fps のまま。

## 4. 全域変数の新しい結合（`check:surface` の台帳を更新）

- `window._closeMoreToolsMenu`・`window._closeMapMenus` の読み 1 増: 左のメニューを閉じる関数。既存の `_closeMeasureMenu`／`_closeShareMenu` と同じ形（集合の持ち主は `_closeMapMenus`）。
- `window.imAtlasDisplay`: 設定の値。既存の `window.im*` 設定と同じ形（`loadSettings`/`saveSettings`）。
- `window.IntMapAtlas` ×2・`window.IntMapConsole` ×1・`window.IntMapDevice` ×1（`js/atlas-float.js`）: 遅延で載るコンソールと端末判定を、静的 import で起動の束に入れないため。
- `window.IntMapRuntime` ×1（`js/popup-anchor.js`）: 共有カメラ購読。インスタンスを渡すモジュールが無く、`js/data-layers.js` などと同じ形。

## 5. 検査

- この回: `tests/ui-feedback-nov17-checks.test.mjs`（床の式を関数ごと評価・現在時の国境・凡例・Tools・ロゴ）、`tests/atlas-answer-integrity-checks.test.mjs`、
  `tests/atlas-float-checks.test.mjs`、`tests/news-detail-condense-checks.test.mjs`、`tests/popup-follow-checks.test.mjs`。
- 仕様の変更に合わせて書き換えた既存の検査: R313 ⑦（メニュー 3 つ）、R299 ⑤⑭⑰（消えた注記）、#R255 ③・R275 ⑦（配置の持ち主）、R502 ⑤（1 行＋畳んだ 9 言語）、
  #R170（検索と群が同じ値）、R167 #3（表の一覧）、map-layer-system ④⑦（国の判定）、spec 3 本（Tools の行が左のメニューへ）。
- ゲート: static・engine・types・docs・i18n・catalog・capabilities・atlasrepeat・surface・archfiles・agents・datagov が緑。
- 画面: Playwright で 1440×900 と 390×844 を撮り、Tools／その他のツールの中身と床（1440×877 で 0.28、390×844 で -0.88）を確かめた。
  Atlas の浮遊表示とニュース詳細はログインと本番データが要るので本番検証で見る。
