---
title: スマホでしかできないこと——「いま、ここ」（現在地の天気・地震・ニュース・かつての名前を 1 枚で、正確な位置は端末から出さない）と「共有で開く」（共有シートの宛先になり、写真はカメラの記録から撮影地と撮影日の地図へ）。浮く単体ボタンもシートの上へ
date: 2026-10-03
newsen: On phones: "Here and now" shows weather, earthquakes, news and a place's former names in one card without sending your exact position, and IntMap can receive photos shared from the share sheet.
newsjp: スマホ向け: 「いま、ここ」が現在地の天気・地震・ニュース・かつての名前を 1 枚で示します（正確な位置は送りません）。共有シートから写真を IntMap で開くこともできます。
---

〈依頼〉全権委任の監査（common: 商品開発）。分野はモバイル。今日すでに着地した mobile-shell・mobile-shell-flow・mobile-card-reach・mobile-panels-reach・mobile performance の上に、**スマホでしかできない体験**を商品として積む。途中で追加: 本番 f01c607（375×812）で、地図上のオブジェクトの一覧を開く丸ボタン `#iol-fab` が中段シートのレイヤー画面の検索欄 `input.lsr-q` に重なり、重なった範囲のタップをボタンが取る——#944 の調整は「中に押せる要素を持つパネル」だけを探すので、ボタン単体が対象外。

## 0. 測った（前）

- 端末の位置を使っていたのは**青い点だけ**（`js/map-extras.js` IntMapLocate）。「いまここで何が起きているか」は、天気パネル・地震レイヤー・ニュース一覧・Chronos（その街のかつての名前）を読者が自分で組み立てるしかなかった。材料は全部あった: `IntMapWx.point`・`IntMapWx.sunTimes`・USGS のフィード・`news_events`（`rep_lng/rep_lat`）・改名都市の記録 `data/hist-cities.json`（6,474 都市・判定半径 `g` つき）。
- IntMap は共有シートの**送る側**にしかいなかった（`IntMapShare`・絵葉書）。manifest に `share_target` も `shortcuts` も無い。
- EXIF の読み手は既にあった（`js/photo-geo-exif.js`・稜線照合用）が、**JPEG だけ**で撮影時刻を読まない。携帯が共有するのは HEIC/WebP もある。
- `makeFloatFit`（`js/mobile-sheet.js`）の `isFloater` は `el.querySelector(FLOAT_CONTROL)`——**中に**操作部品を持つかだけを訊いていた。`#iol-fab` は `<button>` そのもので、中に操作部品を持たない。

## 1. 浮く単体ボタン（`#iol-fab`）

- **規則を性質に付け直した**: 要素が**それ自身操作部品である**ことも「操作部品を持つ」と同じに数える（`el.matches(FLOAT_CONTROL) || el.querySelector(…)`）。名前は書いていない——明日足される単体ボタンも同じに扱われる。
- シートが `full` で地図の余地が無いとき、パネルは従来どおり描いたまま（読むもの）だが、**単体の操作部品は退く**（`data-m-fit="out"`＝見えず指を受けない。操作グループが `full` で退くのと同じ）。自分の印で隠したものは次の走査でも浮くものとして数える（でないと隠した瞬間に対象から外れ、印が外れて再び現れる）。
- spec の census（`tests/mobile-panels-reach.spec.js`）も同じ盲点を持っていた（`querySelector` だけ）ので、同じ性質に直し、`#iol-fab` の試験を足した: ピンを刺す → レイヤー画面を `half` → 丸ボタンがシートの上で指に当たる／レイヤーの検索欄が自分のタップを受ける → `full` で丸ボタンは指を取らない → `half` に戻ると戻る。**直しを外すと赤**（`controls a finger cannot use` で 3 件）、直すと緑を実測。

## 2. いま、ここ（`js/here-now.js`）

- 1 つの記録（JSON）を作り、カードと Atlas が同じものを読む（place-dossier の規則）: いまの天気と今日・現地時刻・日の出入り／300 km 以内の M2.5 以上の地震（7 日）／300 km 以内の出来事（72 時間）／**その場所のかつての名前**。各節は `ok`・`none`（訊いたが無い——近くに地震が無いのは答え）・`unavailable`（理由つき）。地震と出来事は地図に点で描き、閉じれば消す。
- 「近く」は 1 か所（`js/atlas-world-objects.js` `RELATED_DEFAULTS`: 300 km・72 時間）。写していない。
- **かつての名前**は `IntMapHistCities.near()` を足して読む——**記録自身の判定半径**（ラベルの式が改名するかを決めるのと同じ `g`）で「この地点はこの都市か」を答え、各 span は書かれたまま（開始・終了が述べられていなければ年を代入しない。押すと時計がその span の最後の年へ、開始しか無ければ最初の年へ、どちらも無ければ押せない）。`.agents/rules/historical-verification.md` の「上流が述べていない日付を代入しない」。
- **正確な現在地は端末から出ない。** 外へ送るのは `PRIVACY_GRID_DEG`（0.1°）に丸めた地点だけで、送り先は地名（Nominatim zoom 10）と天気の 2 つ。USGS のフィードは**全体を**読み、出来事は**位置の条件を付けずに**直近 72 時間を読んで、どちらも端末で距離を測る（FDSN の半径検索や DB の範囲検索は位置を送るので使わない）。node の検査がこれを**実際の要求の URL と DB 呼び出しで**確かめる（正確な座標の文字列がどの要求にも無い）。
  - ⚠ 出来事は 1 回 1,000 行まで（Supabase の PostgREST の既定 `max-rows`）。72 時間がそれを超えたら記録は `truncated` を持ち、カードは「新しい N 件だけを読みました」と言う。
- 入口: 検索欄の空の状態の先頭（`js/here-entry.js`・作例の上の 2 行）・長押しメニュー「現地の情報 ▸ この地点のいま」・**ホーム画面アイコンの長押し**（manifest `shortcuts` → `?here=1`）・Atlas `research.hereNow`（地点が無ければ端末の位置。確認の列は `explicit`、外部の見出しを持ち込むので `ingests:external`）。どれも押したとき／クエリが付いたときに読む——起動経路に載せていない。
- 遅延モジュールに `IM_HOST` を渡す戸口が無かった（`narratorApi.host` は narrator の戸口）ので、葉の `js/host-door.js` を足し、`app-body.js` が IM_HOST を作った直後に入れる。

## 3. 共有で開く（`js/share-inbox.js`・`sw.js`・manifest）

- manifest（`scripts/build-app-manifest.mjs` が書く）に `share_target`（POST・multipart・`photos`／title／text／url）と `shortcuts`。静的ホストは POST を受けられない（Pages は 405）ので、**sw.js が `share-target` への POST を受け**、中身をページの cache（`intmap-page-share-inbox`——`PAGE_CACHE_PREFIX` なので activate は消さない）に置いて `?share=<id>` へ 303。ページ（src/main.js がそのクエリでだけ import）は 1 度だけ読んで消し、1 時間より古いものも消す。写真 1 枚・40 MB、文 4,000 字（定数の観測と失効は sw.js に）。
- **写真**: `photo-geo-exif.js` に 2 つ足した——DateTimeOriginal と OffsetTimeOriginal（**オフセットが書かれていなければ付けない**——時計はその日の正午 UTC で、カードは「その日」と言う）、**JPEG 以外の容器**（HEIC/AVIF の `Exif\0\0`＋TIFF、WebP の `EXIF` チャンク）。位置があればピン・その地点の「いま、ここ」・**「撮影日の地図にする」**。カードは「カメラの記録」と名乗る。**位置の無い写真は推測しない**——稜線照合（`photo-geo.js`。`open({file})` を足した）に渡して推定だと言う。
- **リンクと文**: Google（場所の `!3d…!4d…` をカメラの `@` より先に）・Apple（`ll`）・OSM（印 `mlat/mlon` を表示範囲より先に）・`geo:`（RFC 5870 と Android の `?q=`）・座標 → 地点。名前だけのリンクと文は検索欄へ。**短縮リンクは行き先をページから読めない**（CORS）のでそう言い、一緒に来た題で検索する。IntMap のリンクはそれ自身として開く。
- iOS は Web Share Target を持たないので、検索欄の「写真の場所」が同じ処理への入口。⚠ ファイル選択は**押した瞬間に**開く（Safari は await をまたいだ `click()` をユーザー操作と数えない）——読む側のモジュールは選んだ後に取りに行く。
- Atlas `view.openShared` が貼られたリンクや文を同じ関数で開く。⚠ 結果が地点か検索かで変わるので、観測器は `none`・produces は `explanation`（`camera,map` を約束すると `check:capabilities` の map-verified が正しく赤にする——検索に落ちた回はカメラが動かない）。

## 4. 文書

`docs/architecture/09-mobile.md` §9.2（単体の操作部品）と §9.5（新設）・`PRODUCT.md` §1 と §3.3・`docs/FILES.md`（4 モジュール）・privacy の §2（日英——丸めた地点だけが出ること、共有された写真はどこにも送らないこと、inbox の保持）。

## 5. 検査

- `tests/mobile-next-checks.test.mjs`（node・6 件）: ① リンクと文の読み（16 形） ② 3 容器の EXIF（手で組んだ TIFF——位置と撮影時刻とオフセット）と `takenInstant` ③ **sw.js を評価して** POST を投げる（303・inbox の名前・2 枚目は数えて捨てる・他の POST は答えない・activate が inbox を消さない・manifest が名指す欄を worker が読む） ④ `hereNow` を偽の網で走らせ、**出た要求に正確な座標が無い**こと・地震と出来事は端末で絞ったこと・各節の 3 状態 ⑤ 本物の `data/hist-cities.json` で東京→江戸、南極海は無し ⑥ 入口。
- `tests/mobile-next.spec.js`（375×812・タッチ・位置は東京タワーにエミュレート）: ① 空の検索欄 → 2 行が作例の上・44 px 以上 → 「いま、ここ」→ 地図が現在地へ・シートは `min`・4 節が全部値か理由・全ボタンがシートの上で指に当たる・かつての名前を押すとその年 ② worker が書く形で inbox に写真を置き `?share=<id>` で開く → クエリが消える・カードが「カメラの記録」と撮影時刻を言う・地図がその位置・「撮影日の地図」で時計が 2019-04-01T05:22:05Z・inbox は空。
- `tests/mobile-panels-reach.spec.js` に単体ボタンの試験（上の §1）。

## 6. 残したもの・否定した見立て

- 「位置情報は端末内のみ」を**完全には**満たせない節がある: 地名と天気は地点が無いと答えられない。丸めて送ることにし、カードと privacy にそう書いた（「端末内のみ」とは書いていない）。
- 写真の撮影位置を「IntMap が見つけた」と言わない（photo-geo-exif の既存の原則と同じ）。
- worker が居ない状態で共有シートから POST されると Pages は 405 を返す。インストールは worker を登録したページから行われるので通常は起きないが、ページ側では直せない穴として残る。

## 7. 境界の窓口（`check:surface`）

新しい読みは `window.IntMapHistCities`・`IntMapHistScale`・`IntMapI18N`・`IntMapLazy`・`IntMapLocate`・`IntMapNewsEvents`・`IntMapPhotoExif`・`IntMapPhotoGeo`・`IntMapSafe`・`IntMapWeather`・`IntMapWx`・`fmtTemp`。どれも持ち主（`js/hist-cities.js`・`js/hist-scale.js`・`js/i18n.js`・`js/lazy-modules.js`・`js/map-extras.js`・`js/news-events.js`・`js/photo-geo-exif.js`・`js/photo-geo.js`・`js/safe-html.js`・`js/weather.js`・`js/wx-source.js`・`js/app-body.js`）がまだ実体を export していないので、`tests/global-surface-baseline.json` を `--update` した。`IM_HOST` は窓口を増やさず、葉の `js/host-door.js` で渡している。

## 8. 起動費用（`check:perf`）

超えた 3 行だけ `--update`:
- `eager.modules`: 311 → 312 —— 葉の `js/host-door.js`（import なし・数行。`app-body.js` が IM_HOST を入れる）。要求は増えない（main に畳まれる）。
- `async.raw`: 11937.7 kB → 12008.7 kB・`async.gzip`: 3944.7 kB → 3975.1 kB —— 押したとき／クエリが付いたときにだけ読む新しい chunk（`here-now`・`share-inbox`・`here-entry`）と、それを呼ぶ側の増分。起動経路には載らない。
