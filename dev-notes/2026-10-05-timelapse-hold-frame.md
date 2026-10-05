---
title: タイムラプスの動画がコマを落としていた——MediaRecorder は一時停止の時点で符号化中のコマを捨てる。WebCodecs でコマの時刻を自分で決め、全コマの返りを数えてから容器を自前で書く
date: 2026-10-05
newsen: Time-lapse videos no longer lose a frame on a busy computer, and they are written faster — every instant and the final hold are always in the file, each for exactly its share of a second.
newsjp: タイムラプスの動画が、重い計算機でもコマを落とさなくなり、書き出しも速くなりました。すべての瞬間と最後の静止コマが、それぞれちょうどの長さで必ずファイルに入ります。
---

〈依頼〉 `tests/smoke.spec.js` の timelapse-video-export ② が間欠的に `decoded = 2`（2 瞬間＋保持コマで 3 のはず）で
落ちる。PR の run 37246255555（#995）・37243704802・37242826799（#991 の branch）では 2 回とも、main の push run
37245992512（5aaab0b3）では 1 回目だけ落ちた。再現し、保持コマが必ず符号化されるように直す。assertion を緩めない・
再試行を足さない。

## 0. 測った

- **再現**: `npm run build` の後 `IM_PREBUILT_DIST=1 npx playwright test tests/smoke.spec.js -g "timelapse-video-export" --repeat-each N --retries 0`
  （webServer の 180 秒の上限に build が掛かるので分ける）。② 単独で 6 回中 2 回、8 回中 4〜5 回が 3 コマ中 2 コマ。
- **欠けるのは保持コマとは限らない。** 失敗した回のファイルの長さは 1 コマ分（0.37〜0.50 s）か 2 コマ分（0.86 s）で、
  抜けたのは 1 コマ目・2 コマ目・保持コマのどれでもあった（並行セッションの独立した計測も同じ結論）。
- **見立て 1: コマが録画器に届く前に `pause()` が来ている。** 複製したトラックを再生する video 要素の
  `requestVideoFrameCallback` で「トラックにコマが出た時刻」を測ると、失敗した 5 回はすべて、あるコマの出た時刻が
  その `pause()` より後（例 `pause@12805` → `seen1@13401`）。描画更新が最大 1 秒飢えていた。
- **⚠ 見立て 1 は半分だけ正しかった。** 「トラックに出たのを見てから止める」に直すと、10 回中 6 回（② ）と 1 回（①）
  がなお落ちた。`requestData()` を各コマの後に呼ぶと、1 コマ目の符号化データは `start` イベントの時点でも 0 バイトで、
  保持コマは「トラックには出たのに符号化データが 0」の回があった。**一時停止の時点でまだエンコーダの中にあるコマも
  捨てられる**（VP9 1080×1920 のソフト符号化が負荷で遅れる）。
- **MediaRecorder にはそれを待つ窓が無い。** MP4 は `requestData` でもコマごとのデータを出さず（停止時に一括。単体
  ページで実測）、キャンバスのトラックの `track.stats` は Chromium 153 で null。rAF を 2 回待ってから眠る案も効かない
  （並行セッションの実測: 7 回中 3 回 → 13 回中 3 回）。
- **WebCodecs は使える。** secure context の Chromium 153 で `VideoEncoder.isConfigSupported` が
  `vp09.00.40.08`・`vp8`・`avc1.640028`・`avc1.42E028` の 1080×1920 をすべて受ける（`about:blank` は secure context
  ではないので `VideoEncoder` 自体が無い——測るときに注意）。

## 1. 直したもの（利用者の承認: WebCodecs＋自前の muxer）

- `js/map-recorder.js` の録画を 2 つの書き手に分けた（«THE VIDEO WRITERS»）。**WebCodecs**（`codecWriter`）は
  k 番目のコマを時刻 k/fps・長さ 1/fps で `VideoEncoder` に渡し、`flush` の後に**返ったコマの数を渡した数と照合**し、
  違えば失敗として述べる。待つ実時間が無いので、書き出しは地図が描ける速さで進む。**MediaRecorder**
  （`recorderWriter`）は `VideoEncoder` の無いブラウザのためだけに従来のまま残し、負荷でコマを落としうることを
  コードと章に書いた（消すのは機能の縮小なので消さない）。どちらで書いたかは状態の `via`。
- `js/video-mux.js` を足した: `muxWebM`（Matroska の要素。鍵コマごとに cluster、`DefaultDuration` と `Duration`）と
  `muxMP4`（ftyp・moov・mdat の順。avcC はエンコーダの `decoderConfig.description`）。順序の崩れた列と鍵コマで
  始まらない列は拒む。依存は足していない。
- `recordLapse` は `isConfigSupported` に訊くので Promise を返す（呼び手の `js/atlas-cap-time.js` と書き出し欄は await）。
  書き出し欄が出す形式は、MediaRecorder の答えで先に組み、エンコーダの答えが返ったら組み直す。
- 形式の優先順は 1 つの表 `MIMES` のまま（MP4 の H.264 → WebM）。各行に WebCodecs の codec 名を持たせた。

## 2. 実測（修正後）

- 同じ条件の ①② を 10 回ずつ: **20 回中 20 回緑**（修正前は ② が 8〜10 回中 4〜6 回赤）。所要 7.6 分 → 4.0 分。
- 負荷をかけて（3 worker 並列で同じ 2 本を 9 回ずつ）: 動画の assertion は **18 回すべて**通った。1 件だけ ③ の
  比較ウィンドウが `cmp-hb-l` を描くのを待つ箇所（smoke.spec.js の ③・今回触っていない）が 60 秒で切れた——3 枚の
  IntMap を同時に描かせた負荷によるもので、録画とは別の待ち。
- smoke の ①② に `via === 'webcodecs'` と、長さがちょうど（コマ数＋1）/fps であることを足した——**締める方向の変更**で、
  旧い「負荷で伸びるので 2.5 倍まで許す」幅は要らなくなった。

## 2b. 配る重さ

- 遅延チャンク `map-recorder` が 35.7 kB → 41.8 kB（+6.1 kB）。中身は muxer（`js/video-mux.js`）と WebCodecs の書き手。
  書き出し欄を開いたとき／Atlas が録画・絵葉書を頼んだときにしか読まれず、起動の重さには入らない。依存を足す案（mediabunny など）
  より小さい。天井は `node scripts/perf-budget.mjs --update` で、超えた行だけ上げた。

## 3. 検査

- `tests/timelapse-hold-frame-checks.test.mjs`: muxer が書いたバイトを読み戻す（WebM の block の時刻・鍵・cluster・
  長さ、MP4 の sample の大きさ・位置・長さの和・sync・avcC）、順序の崩れを拒む、書き手が k/fps で渡し、
  エンコーダが 1 コマ返さなかったら失敗する、codec の優先順。
- `tests/smoke.spec.js` timelapse-video-export ①②: 実際の Chromium のエンコーダで書いたファイルを復号して数える。
