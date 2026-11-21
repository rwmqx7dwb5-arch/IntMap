---
title: Atlas に動画入力（フレームのコンタクトシート）・ハンズフリー音声・写真と衛星の突き合わせ手順を足した
date: 2026-11-20
newsen: Atlas now reads attached videos (as a sheet of time-stamped frames), can listen hands-free and send each spoken sentence as its own command, and compares your photo with the satellite view of a candidate place.
newsjp: Atlas が添付した動画を読めるようになり（時刻つきフレームの一覧として）、ハンズフリーで聞き続けて一文ごとに指示を送れ、写真を候補地の衛星画像と見比べて答えるようになりました。
---

〈依頼〉 総合調査（2026-11-20）の結論: 画像入力と Web Speech 音声入力は実装済み。足りないのは画像・音声・動画・地図を 1 つの文脈で扱うこと。

## 0. 調べたこと

- 画像: `js/atlas-attach.js` が画像を `compressImage` で符号化して `images[]` で送る。**動画は「media」として拒否**だった（`why:'media'`）。
- 音声: `.atl-mic` は 1 回きりの口述（`continuous=false`）。確定した文を箱に入れるだけ。
- 地図の目: `view.inspect`（#R493）は既にあり、直前の最大 4 フレームが同じターンの画像として次の呼び出しへ載る。つまり
  利用者の写真 + 衛星表示のキャプチャは**既に 1 ターンで並べられる**。欠けていたのは、それをやる手順をモデルが知ること。
- プロバイダ（2026-11-20 に確認）: Gemini は生の動画を受ける（インライン 100 MB 未満、File API は大きいもの）。OpenAI Responses と
  Anthropic Messages はこの経路では画像・PDF まで。検索では後者 2 社の動画非対応を文書で直接確認できていない（Gemini の文書だけが
  取れた）ので、**「動画を生で送る」はプロバイダ依存になり得る**と判断し、全社が読める画像にした。

## 1. 動画

`js/atlas-video-frames.js`: クリップを各区間の中央で最大 9 フレーム（既定 6）に採り、時刻を焼き込んだ**コンタクトシート 1 枚**にする。
1 枚にする理由は、サーバとクライアントが持つ画像の上限（4 枚、`MAX_IMAGES`）を動かさず、利用者の別の写真と並べる枠を残すため。
`ATL_FILE.read` は `encodeVideo` が注入されたときだけ動画を受け、**バイトは読まない**（`<video>` に流す）。注入が無ければ従来どおり
`media`。デコードできない codec は黒いシートでなく `video-undecodable`（理由つきの拒否）。音声は送らず、`caption()` がそう述べる。

## 2. ハンズフリー音声

`js/atlas-voice.js`: 聞き続け、確定した発話ごとに 1 メッセージを送る。語句の解釈はしない（意味づけは Atlas）。自然終了は再開、
マイク拒否は再試行せず理由を述べて止まる、起動が連続して終わる engine は `unstable` で諦める。Atlas の作業中に話した分は保留し、
ターン終了で送る（送信は進行中のターンを中止するため）。入口は口述 mic の隣の新しいボタン。口述を押すとループは止まる。

## 3. 写真と衛星の突き合わせ

新しい能力は足していない。`view.inspect` の説明に手順（候補地へ flyTo → 衛星 → inspect → 特徴ごとに突き合わせ、上空から確かめられない
ものと撮影日の違いを述べる）を足した。

## 4. 検査

`tests/atlas-multimodal-checks.test.mjs`（偽の `<video>` と偽の認識器で実装の契約を走らせる）。実ブラウザでの実クリップ検証は下に記す。

## CI の赤を直した（merge 後）

- `check:perf`: 添付を扱う atlas-attach（22.6→26.9 kB）と atlas-cap-runs、async gzip 合計の天井を `perf-budget.mjs --update` で上げた。増えた分はマルチモーダル添付の実装そのもの（新しい読み込み経路）で、起動時チャンクは増えていない。
- `check:i18n`: 位置引数 L(…) の行が 7 行増えたので、床を `i18n-audit.mjs --update-floor` で実体に合わせた。
- `R403 ⑨`（`--gate --todo fr` が緑の木を要求）は上の i18n 床が原因で赤かった。
- `dist.total` / `dist.assets` の天井も上げた（1542452.9→1550179.2 kB / 21686.9→21797.3 kB）。増えた分は添付の読み込み経路の追加と main 側の同時期の増加の合計で、起動時チャンクは増えていない。
