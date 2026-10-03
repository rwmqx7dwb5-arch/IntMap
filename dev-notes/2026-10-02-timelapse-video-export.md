---
title: タイムラプスを動画（MP4／WebM）に、比較を 1 枚の PNG に書き出す——描き終えたコマだけを 1 コマずつ録り、年・出典・語標とリンクを焼き込む
date: 2026-10-02
newsen: Export a time-lapse as a video (MP4 or WebM) and a comparison as one PNG, with the year, the sources and a link burned in.
newsjp: タイムラプスを動画（MP4／WebM）に、比較を PNG 1 枚に書き出せます。年・出典・リンクを焼き込みます。
---

〈依頼〉「商品開発・マーケティング・営業。足し算。全権を委任する」の 1 本。PRODUCT.md §2.4 が最優先とする
SNS で広げる読者にとって、タイムラプスと時間比較は投稿する素材そのもの。それを画面録画ではなく**ファイルとして**
持ち出せるようにする。動画は地図・年・出典（ライセンス上必須の帰属）・IntMap の語標とリンクを合成し、
**再生器が「描き終えた」と判定したコマだけ**を記録する。Atlas から到達可能に。

## 0. 測った（着手前）

| 何 | 着手前 | 意味 |
|---|---|---|
| 地図の画素の読み手 | `js/atlas-view-capture.js` の `captureCanvas`（スクリーンショットと Atlas が共有）。`preserveDrawingBuffer` は切ってあり、`render.onNextFrame` で tick の中で読む | 3 つ目の読み手を書かずに、同じ扉から読める |
| Cesium の描画通知 | `scene.postRender` → `fire('render')`（`js/cesium-engine.js`） | 両エンジンで同じ `onNextFrame` が効く |
| 画面の出典 | メイン地図はレンダラの帰属表示を切り（GHSA-jrc7-96c5-q579）、`#map-credit` は**基図だけ**を名指す | データ層（CShapes 2.0 など）の帰属は画面に出ていない。ファイルにする以上、描いている典拠全部を入れる必要がある |
| 製品の住所 | `supabase/functions/_shared/site-origin.js` の `SITE_URL`。ビルドが index.html の og:url に書き込む | リンクは書き写さず og:url から読む（js/ から site-origin.js を import すると、js/ と types/ だけを写す型検査の門〈typecheck-gate〉で解決できない——CI で実測） |
| MediaRecorder（Chromium 実測） | `start` 直後の `pause`／`resume` の間だけ時間が進む。200〜800 ms の待ちを挟んだ 7 コマのブロック時刻 0・250・501・785・1014・1268・1519 ms | 地図を待つ時間はファイルに入れずに済む |
| 同（終わり） | 長さは最後のコマの時刻で終わる（7 コマで 1519 ms） | 最後の瞬間は表示時間 0。ループ再生では見えない |
| 同（コマの取り方） | キャンバスのトラックは `requestFrame` の**後の描画**でコマを取る。待ってから要求したコマ → 4 中 1 しか残らない。描画と要求を同じタスクにすると全部 | 合成と要求を同じタスクにする |
| 同（保持のコマ） | 描き直さずに同じキャンバスへ要求した保持のコマは出ない（4+1 → 4）。自分自身へ `drawImage` してから要求すると 5 | 保持のコマは描き直してから |
| 同（`start()` が取るコマ） | 描かれたキャンバスでは `start()` が**自分で 1 コマ取る**。`start()`＋要求 → 5 のはずが 6、'start' イベントを待ってから要求しても 6。描いていないキャンバスでは 'start' イベント自体が来ない。`resume()` は取らない | 1 コマ目は `start()` が取る絵、2 コマ目以降は `resume()`＋描き直し＋要求を 1 タスクで（MP4／WebM・主スレッドの負荷あり／なしの 8 回すべて 5 中 5） |
| 同（コマの長さ） | 上の形で 1 コマ目は 0.28〜0.62 s（0.25 s のところ。録画器の起動）、2 コマ目以降は 0.26〜0.30 s | 長さは実時間。1 コマ目は少し長い |
| 同（Cesium） | 1920×1080 WebM・3 瞬間で、上の形にする前は 3＋1 のうち 1 コマ落ち、後は 4 コマ | 両エンジンで同じ形が効く |
| 同（形式） | このマシンの Playwright Chromium は `video/mp4;codecs=avc1.*` も録れて再生できる | MP4 を先に（投稿先が受け付けるのは MP4） |

## 1. 何を作ったか

**`js/map-recorder.js`（遅延チャンク）——1 つの合成器。** 地図（枠いっぱいに中央で切り抜き）・各面の左上にその瞬間・
下の帯に語標（`apple-mobile-web-app-title`）とリンク（og:url）、そして出典。枠は 1080×1080・1920×1080・
1080×1920。配置は純関数 `layoutFrame`（文字幅を測る関数を受け取る）で、出典は 24 px で 4 行を超えると 20 px まで
縮め、それでも入らなければ**帯を高くする——切らない**。

**出典は「描いているもの」。** `drawnCredits(style, zoom, extra)` が `scene.getStyle()`（両エンジンが答える）を読み、
可視でズーム範囲内の層が読むソースの `attribution` と、画面の `#map-credit`（基図）を、マークアップを外した文に
して、他の出典に含まれるものを畳む（`js/geo-engine.js` の `_drawnAttributions` と同じ規則。あちらは生きた地図の
層順を歩くので Cesium では使えない）。**その瞬間に空の GeoJSON は何も描いていないので数えない**——1900 年の
最初の録画で、令制国（1871 年に廃止）の派生データの長い帰属が帯を占めていた。

**`js/time-lapse.js` にコマの受け手（sink）。** `startLapse({ …, sink })` は描き終えたコマ（時間カーネルの判定・
全タイル・その瞬間の国境、の 3 条件）を `sink.frame(state)` に渡し、**画面の留まりの代わりに**それを待つ。
`sink.end(reason)` は終わり方（`end`・`clock-moved`・`replaced`・`record-failed`・`stopped`）を聞く。録画は必ず
開始から始め、ループしない。`lapseState()` に `total`（その実行が持つ瞬間の数）と `recording`。

**録画器。** 受け取ったコマごとに、tick の中で地図を読み（`captureCanvas`。`live:false`＝tick が来なかった
〈隠れたタブ〉は観測できなかったのであって、黒いコマとして録らずに次の描画を待つ）、合成し、1 コマ目は録画器を
起動して（起動がその絵を取る）、2 コマ目以降は再開して絵を描き直して 1 コマ要求し、1/fps だけ録って止める
（上の表のとおり、要求の仕方でコマの数が変わるので、この形は実測で決めた）。終点に達したら同じ絵をもう 1 コマ
（`encoded` = `frames` + 1）。終点より前に止まった録画は何も残さない。形式は録れる最初のもの（MP4 の H.264
レベル 4.0〈1920×1080 に要る〉High → Main → Baseline → 素の `video/mp4`〈Safari〉 → WebM VP9 → VP8）。

**出典の読み方。** 帰属表示は典拠がマークアップで書くので、文字列置換で「消毒」せず、左から 1 度だけ読む（タグの外は文字・タグは何も出さない・script/style の中身は捨てる。`js/geo-engine.js` の `_creditParts` と同じ読み方）。結果はキャンバスの `fillText` と `textContent` にしか渡らない。最初の版の置換は CodeQL（js/incomplete-multi-character-sanitization）に止められた。

**比較の 1 枚。** 比較ウィンドウ（公開された制御 `window.IntMapCompare`。`js/compare.js` をこの遅延チャンクに
import しない理由は `js/atlas-cap-time.js` と同じ）の地図とメイン地図を、それぞれの瞬間の札つきで左右（縦長なら
上下）に並べた PNG。ウィンドウの出典はその地図自身が描く帰属表示、メイン地図は上の規則。

**UI。** `index.html` に `#ntl-rec` を 1 要素。タイムラプスが「動画・画像に書き出す」ボタンを置き、押すと録画器を
読む。枠（1:1・16:9・9:16）、形式（録れるものだけ）、**書き出す絵そのもののプレビュー**、録画／比較画像、進み具合と
中止、終わったら保存リンク・端末がファイルを渡せるなら共有シート・「ファイル内の出典」。

**Atlas。** `time.lapse` に `record`・`size`・`format`。Chronos パネルを開き、書き出し欄を据えてから録る（結果に
コマ数・枠・形式）。カタログの文に「1900〜1950 年のヨーロッパのタイムラプスを動画にして」＝カメラをヨーロッパへ、
それから `{"type":"timeLapse","from":"1900","to":"1950","record":true}`。

## 2. 歴史の主張として何が描かれたか（`.agents/rules/historical-verification.md`）

この変更は**何を描くか**を変えない（コマはタイムラプスが描いたものそのもの）。ファイルに入るのは、その瞬間に
画面が描いていたものと、その典拠の名前。1900〜1903 年の録画（smoke ①）の出典は CShapes 2.0・OpenHistoricalMap・
historical-basemaps（境界の束の帰属）と基図。Cesium で 1910〜1912 年を録ると、出典は GIBS Blue Marble・Esri・
OpenHistoricalMap (CC0) だった（Cesium は境界を OHM のベクタタイルで描く）。

## 3. 設計判断

- **MediaRecorder で録る（依頼の指定）。WebCodecs＋自前のマルチプレクサは書かなかった。** その代わりに
  **1 コマの長さは録画器が動いている実時間**になる。実測: 4 コマ・毎秒 4 のファイルの長さは 1.05〜1.75 s
  （長い方は隣で Cesium のページが起動中）。1 コマ目は録画器の起動のぶん長い。コマが落ちる・重なることはない
  （数は上の形で実測一致）。長さとコマの時刻を負荷から切り離すなら、`VideoEncoder` に時刻を渡して
  WebM／MP4 の箱を自前で組む道がある（残る問題として提案）。
- **出典を `#map-credit` だけにしなかった。** 画面は基図だけを名指すが、ファイルはページを離れて配られる。
  CShapes 2.0 のように帰属が条件の典拠を、描いている限り落とさない。
- **地図は切り抜き、縮めて余白を作らない。** 縦長の枠で横長の画面を縮めると地図が帯になる。どこが切れるかは
  プレビューが示す。
- **保持のコマを 1 枚足す。** 記録したコマ数と一致しない 1 枚だが、無ければ最後の瞬間が見えない。状態は
  `frames`（瞬間）と `encoded`（書いたコマ）を分けて述べる。

## 4. 検査

- `node --test tests/timelapse-video-export-checks.test.mjs`（5 件）: ① 受け手は瞬間ごとに 1 回、画面の留まり
  なしで呼ばれ、終わり方（`end`・`clock-moved`・`replaced`・`record-failed`）を聞く、録画は開始から始めループしない、
  `total`（年・日・時）② 3 つの枠 × 1 面・2 面 × 短い／長い出典で、瞬間と出典の全語が枠の中・重ならない・
  出典は 20 px 以上・長い出典は帯が伸びる ③ `drawnCredits`: 隠れた層・ズーム範囲外・空の集まりは数えない、
  URL のデータは数える、マークアップと実体参照を読む、含まれる出典を畳む ④ 形式の選択と枠の名前
  ⑤ MediaRecorder が無ければ `unsupported` と述べてラプスも動かさない、比較ウィンドウが無ければ `no-compare`。
- `tests/smoke.spec.js` の timelapse-video-export ①②（新しい spec ファイルは作らない）: ① 書き出し欄から
  1900→1903 を正方形で録画 → 保存されるファイルを `<video>` で**デコード**して 1080×1080、デコードされたコマ数が
  4＋保持 1、長さは待ちを含まない、1 コマ目の帯の各出典行に文字がある（帯の下の余白は暗く、筆跡が無い）、出典に CShapes と
  画面の基図 ② Atlas `time.lapse {record:true, size:'portrait', format:'webm'}` が completed、1080×1920 の WebM で
  2＋1 コマ、帯に文字 ③ 比較ウィンドウ 1914 年・メイン 1960 年で 1920×1080 の PNG、両方の瞬間と CShapes の出典。
- Cesium（一度きりの計測。spec は残していない）: Atlas から 1910〜1912 を 1920×1080 WebM に録画、デコード
  4 コマ（3 瞬間＋保持）、地図の領域に 247 色（黒ではない）。出典は GIBS Blue Marble・Esri・OpenHistoricalMap。

## 起動費

起動時（eager）の requests 9・modules 299 は変わらない。書き出しは 2 段の遅延読み込み——タイムラプスのチャンクは
Chronos パネルを開いたとき（以前から）、録画器のチャンク `map-recorder`（17,970 B・gzip 7,546 B）は書き出し欄を
開いたときか Atlas が録画を頼んだときだけ。この変更が足した非同期の量は、`map-recorder` の新規 17,970 B、
`time-lapse` +1,657 B（受け手と書き出し欄のボタン）、`atlas-console` +2,930 B（カタログの文）。⚠ この機械の
`check:perf` は async.gzip が天井を 24.3 kB 超えると言うが、同じ表で `atlas-executor`・`satellites-live`・`ui.jp`
など**この変更が触っていない**チャンクも天井より大きく、作業ツリーが CRLF で取り出されていることによる差
（門の判定が走者の性質になる形。チャンクの中身はチェックアウトのバイトそのもの）と main 側の未記録の増分が混じっている。天井は CI（LF）の
実測で判定し、超えたら `node scripts/perf-budget.mjs --update` で上げる——上げる理由は上の 3 行。

## 起動費の天井を上げた理由（origin/main への rebase 後）

#890（能力の宣言を 1 つに）の後の main へ載せ直してビルドすると、天井を超えた行は **async.raw**（11,389.5 → 11,455.5 kB）だった。`node scripts/perf-budget.mjs --update` は超えた行だけを上げる。この変更が足したのは `map-recorder` の新規チャンク 18,644 B（gzip 7,839 B。書き出し欄を開いたときか Atlas が録画を頼んだときだけ読む）と、`time-lapse` の受け手・書き出し欄のボタン、`time.lapse` の説明の断片。残りは上に書いたこの機械の CRLF による差で、main の CI（LF）が実測で下げる。起動時（eager）の行は超えていない。
