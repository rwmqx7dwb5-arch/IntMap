---
title: ニュースの文字の強弱・角丸・地図の吹き出しを整え、国名を 1 行の太字に、地名の縁取りを細く、比較の棒グラフに並び替えを足した
date: 2026-11-16
pr: 1154
newsen: Clearer type hierarchy in news cards and event details, less rounded corners, dark map news labels beside their pins, country names as one bold line, thinner place-name outlines, and a one-button sort for the country comparison bar chart.
newsjp: ニュースの一覧と詳細の文字に強弱を付け、角丸を弱め、地図のニュースの吹き出しを暗い色にしてピンの横に置き、地図の国名を 1 行の太字に、地名の縁取りを細くし、国の比較の棒グラフを 1 つのボタンで並び替えられるようにした。
---

〈依頼〉ニュースカードの文字の大小と太さ（見出し 16px 太字・要約 14px 標準・場所/時刻/出典 12px）、ニュースソースの重複表示、角丸（カード 12・欄とボタン 8・カプセルは小さなタグだけ）、
「· by IntMap news collection」の削除、国名の現地名併記をやめる、Countries の棒グラフを 1 つのボタンで並び替え、地図の白い吹き出しを
半透明チャコールへ・ピンとの接続、ニュース詳細の組版 6 点。途中の追加:「国名ラベルは太字に」「地名ラベルの周囲の黒縁取りは幅を細く」。

## 0. 測った

- **吹き出しがピンに半分埋まる**: 帯の文字は 1.25 em 右に置かれ、sprite の `content` の内側余白 8 px が fit padding に**足されて**いたので、
  帯の左端はピンの中心より約 4 px 左にあった（ピンは半径 7＋縁 2 = 9 px）。さらに重なり回避（`declutterNewsBands`）は帯を「ピンの
  9 px 右から、文字幅＋18 px」と仮定していて、**同じ帯について 3 つの答え**があった。
- **重複表示**: 媒体が 1 つの出来事では、要約の頭の出典（`.ev-gist-src`）と下の `.news-pub` が同じ名前を 2 回出していた。
  媒体が複数のときは要約の頭の出典が「どの媒体の文か」を言う唯一の場所なので残す（#R405 の理由のとおり）。
- **文字の強弱**: 実測で、補助情報（`--text-muted` = rgb 207）が要約（白の 74%）より**明るく**、序列が逆だった。要約と補助情報の色を
  別の token（`--text-sub` / `--text-meta`、カード地との混色。明るい面で 12px が 4.5:1 を保つ 62%）に分けた。
- 国名の太字に要る地図用グリフは無かった（`fonts/Inter Regular/` だけ）。同梱の `fonts/src/Inter.ttf` は **可変フォント**（wght 100–900）
  なので、新しいファイルを持ち込まずに 700 のインスタンスを生成できる。⚠ opentype.js 2.0 の `getTransform()` が返す glyph の path は
  unitsPerEm を持たず **2048/1000 倍**に出る（太字の A が 24px で 35.8px）——輪郭は `getPath(…, { variation }, font)` で取り、
  `getTransform` は HVAR の字幅にだけ使う。

## 1. 直したこと（構造）

- **角と文字の尺度を `:root` の token 1 か所に**（`--r-card` / `--r-control` / `--r-inner` / `--fs-head|body|meta` / `--text-sub|meta`）。
  各規則は自分の値を token で言う。タグ（loc-chip・カテゴリ chip・バッジ）はカプセルのまま。
- **帯の幾何は `js/map-typography.js` の `BAND` 1 つ**を、層の `text-offset`（ズームごとに em へ換算する `bandOffset()`）・fit padding・
  sprite（`content` は帯そのもの）・重なり回避の 3 者が読む。帯はテーマで反転せず、半透明チャコール・白文字・細い縁・弱い影・角 6。
- **縁取り**: 各レイヤーが書いていた `text-halo-width` の数（1.7 / 1.6 / 1.45 / 1.1…）を `IntMapLabelScale.halo(w)` に通し、係数
  `HALO_K = 0.6` の 1 か所で細くする（層どうしの関係は保つ）。POI は地名ではないので対象外。
- **国名**: `ui+local` の 2 行目を足す前の式を `ofm-country` にだけ渡す。太字は `placeFont('bold')` / `readerFont('bold')`——面の名前に
  «Bold» を付け、`glyphRewrite` がそれを見て `fonts/Inter Bold/`（範囲外は配信元の Noto Sans Bold）へ送る。CJK は MapLibre の
  `_fontWeight` がスタック名の «Bold» を 700 として描く。昔の国名（`imtb-lbl*`）も同じ太字。
- **比較の棒グラフ**: 1 つのボタンで 追加順 → 大きい順 → 小さい順。色は国に付いたまま。Atlas `compareStats` に `order` を足し、
  パネルの `state()` も `order` を述べる。
- ニュース詳細: AI 注記は通常の太さ・小さい灰色・細い区切り線の下へ。冒頭はラベル／24px の見出し／小さい日時、件数の行は離す。
  文末の出典は 13px 標準。「How this event was assembled」と「How this was written」は小さい補助見出し、原文の引用は左罫線。
  出典一覧は 媒体名・バッジ・日時 → 見出し → 「Read at …」を同じ位置に。間隔は節 36 / 見出しと本文 14 / 段落 14 / 媒体行と見出し 7。
- 「· by IntMap news collection」はニュース一覧の 1 行だけから外した（その行では測った者が一覧自身）。今日の世界・情報の面には残す。

## 2. 形式上の削除

- `_newsUIDark()`（js/app-body.js）——帯が テーマで反転しなくなったので読み手が 0。役目は消えた（帯は 1 つの素材）。

## 3. 台帳を緩めたもの（理由）

- **`eager.cssRaw` の天井を上げた**（約 +2 kB）: build はコメントを落とすので増分は宣言そのもの——`:root` の尺度 token、詳細の補助見出し・
  引用・AI 注記・区切りの新しい規則、各規則の値が token 参照になった分。依頼された見た目を運ぶ CSS で、削れる重複は無かった。
- **`window.IntMapLabelScale` の読みが 49 → 50**: `js/time-admin1.js` の 2 つの名前層が縁取りを `halo()` に訊くようになった分（同じ
  ファイルの文字の大きさが既にこの窓口から読んでいる。`js/time-borders.js` は 4 回の読みを 1 つの局所名にまとめて −1）。
  `js/label-scale.js` は window の上の IIFE で、import できる出口をまだ持たない。

## 4. 検査

- `tests/news-type-polish-checks.test.mjs`（縁取りの係数と literal の不在・太字アトラスの全範囲・帯の幾何の 1 か所・1 媒体の重複・
  並び替えと Atlas・token）。`tests/shell-map-labels-checks.test.mjs` に国名 1 行と太字のグリフ経路を、既存の stub は新しい部品に合わせた。
- プレビューで実測: カード 見出し 16/700・要約 14/400・補助 12/400（色は 見出し＞要約＞補助）、角 12、帯はピンの右に隙間を空けて
  チャコール、国名は 1 行の太字（`fonts/Inter Bold/0-255.pbf` 200）、比較の並びが 3 状態を巡回し色が国に残ること。
