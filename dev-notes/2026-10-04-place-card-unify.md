---
title: 地点のカードを 1 枚に——地点プロファイルと「いま、ここ」を同じカード・同じ記録にし、範囲 × 期間の地震と出来事の読み手を 1 本にした
date: 2026-10-04
newsen: The place profile and «Here, now» are now one card. Long-press the map ▸ About the place shows what the map knows about a point and what is happening there now.
newsjp: 地点プロファイルと「いま、ここ」を 1 枚のカードにしました。地図を長押し ▸ 地点について で、その地点について地図が知っていることと、いまそこで起きていることが 1 枚に並びます。
---

〈依頼〉 2 つの統合を 1 本で。⑴ 同じ長押しメニューから別々のカードとして開いていた地点プロファイル（`js/place-dossier.js`）と
「いま、ここ」（`js/here-now.js`）を 1 枚の地点カードに。⑵ USGS の週のフィードと `news_events` の窓を「範囲 × 期間」で読む処理
（それぞれ 5 か所・2 か所）と haversine（5 つ）を 1 本に。利用者は統合を承認済み。

## 何が二重だったか（実測）

- 2 つのカードがそれぞれ Nominatim reverse（zoom 14 と zoom 10）・`IntMapWx.point`（タイムゾーンと天気を**別々に 2 回**）・
  日の出入りの整形・理由コード→文の表（`words()`／`WHY`）・`clock()` を持っていた。
- USGS `2.5_week.geojson` を丸ごと取って端末で絞る処理: here-now `quakesNear`・place-watch `makeReaders.quake`・
  `research.related`・`research.impact`・実世界オブジェクトの解決（`resolveWorldObject`）の **5 か所**。1 セッションで同じ
  0.5 MB を何度も取れた。
- `news_events` を距離で絞る処理: here-now（1,000 行 × 最大 5 ページ）と place-watch（**1 ページで打ち切り**）。
  place-watch は 1,000 行を超えた窓の 2 ページ目以降を一度も見ていなかった（`truncated` とは言っていたが、取りこぼしである）。
- `research.impact` は USGS の取得を `.catch(()=>null)` で包み、**取得できなかったときも「地震なし」と同じ描画**をしていた
  （`.agents/rules/one-pass-or-a-reason.md` §5「観測できなかった」は「失敗」でも「無い」でもない）。
- 大円距離が 5 つ。地球の書き方が 2 通り（半径 6371 と直径 12742）。

## どう直したか

- **地点カードは 1 モジュール**（`js/place-dossier.js`）。`placeProfile()` が 1 つの記録を作り、`hereNow()` は同じ関数に
  「いま」を先頭にする指示を足しただけ。記録の節: place・country・elevation・layers・time（タイムゾーンと太陽）・weather・
  quakes・news・past。`profileHtml()` がカードと Atlas の吹き出しを、`profileSpeech()` が読み上げを描く（map-reader はそのまま動く）。
  タイムゾーンと天気は**同じ 1 回の応答**から読む。
- **起点（`at.from`）が何を端末の外へ送るかを決める。** `point`（地図で選んだ地点）は従来の地点プロファイルの規則
  （そのまま送る・zoom 14・レイヤーのタイル）。`device`（端末の現在地）と `shared`（共有シート・写真の地点）は従来の「いま、ここ」の
  規則（0.1° に丸めた地点を地名と天気にだけ・zoom 10）。⚠ 統合で新しく生じた問い——「端末の現在地でも標高とレイヤーの値を
  読むか」——は、**読まない**にした。タイルの要求は位置を述べるので、読めば privacy.html の「丸めた地点だけを送る」が偽になる。
  節は消えず、理由 `position-kept-on-device`（地図の長押しで選べば読める、と述べる）。郵便番号も丸めた地点には付けない。
- メニューは 1 項目。⚠ 依頼の文言「この地点」は既存の門 `layer-map-tools` #R216 ⑦（メニューに「この地点」「ここ」を繰り返さない）が
  正確にその綴りを禁じているので、**「地点について / About the place」**にした。「いまの様子」は消え、カードの「いま」の節になった。
- `js/here-now.js` は**削除**。外から呼ばれる名前（`openHereNow`・`bootFromUrl`・`whenMapReady`・`sentPoint`・`spanYear`・`style`）は
  `js/place-dossier.js` が持つ。呼び出し元（tool-panel・here-entry・share-inbox・src/main.js・atlas-cap-research・bus の発行者表・
  docs/FILES.md）を全数書き換えた。遅延モジュール表（`js/lazy-modules.js`）には元から載っていない（どちらも動的 import）。
- **Atlas**: `research.placeProfile` と `research.hereNow` は**両方残した**（到達できる能力を減らさない。`check:capabilities`）。
  どちらも同じ記録を返し（`exec.placeProfile` / `exec.hereNow`）、`hereNow` だけが端末の位置を読む扉を持つ（confirm `explicit` のまま）。
  吹き出しは `inert`（押しても何も起きない操作は描かない）。
- **`js/events-near.js`**: `readQuakes({area, days, minMag})` と `readNewsEvents({db, area, hours, minSources})`。
  USGS はセッション内で 1 回の取得を共有し（同時に来た呼び手は同じ要求を待つ）、USGS が述べる更新間隔 1 分より古ければ読み直す。
  7 日超・M2.5 未満は `unavailable('window-beyond-feed')` と述べる。ニュースは here-now のページ送りに揃えた（place-watch の取りこぼしが直る）。
  状態の語彙 `STATE` はここ 1 か所。place-watch の読み手は差し替えたが、判定規則（`_shared/place-watch.js`）と digest の理由コード
  （`usgs-deadline` など）は変えていない。
- **距離**は `supabase/functions/_shared/great-circle.js` の `haversineKm`（6,371 km）1 つ。`_shared/place-watch.js`・volcano-intel・
  atlas-world-objects・atlas-cap-research（impact と events の `_havKm`）・events-near が import する。

## 変えなかったもの

- `placeProfile` の記録のうち、既存の欄（place・country・elevation・layers・time）の形と理由コード。`profileSpeech` の文。
- `research.hereNow` の confirm `explicit`、両能力の行（`js/atlas-capabilities.js`）。
- place-watch の判定規則と digest の理由。
- privacy.html / `js/legal-text.js` の文（端末の現在地については従来の約束どおり。地図の地点は従来の地点プロファイルどおり）。

## 残したもの（範囲外）

- `js/atlas-console.js` の `_havKm`（K に公開している本体）は残した——このファイルは縮小のみの天井（`atlas-capabilities-checks` #R318 ⓑ）で、
  import 1 行を足す余白が無い。research の 2 か所はもう使っていない。
- 同じ式の haversine は他にも `js/atlas-view-subject.js`・`js/widget-defs-map.js`・`_shared/news-cluster.js`・`_shared/monitor-logic`（monitor-run・対象外）にある。
- `research.impact` の「直近 24 時間の地震を選ぶ」段は `2.5_day.geojson` を別に読む（選ぶための読みで、範囲 × 期間の読みではない）。
  `js/layer-previews.js` の `QUAKES_WEEK` も同じフィードを読む。

## 費用（check:perf）と窓口（check:surface）

- 遅延チャンク `place-dossier` は 19.6 kB → 52.4 kB に増える。**増えたのではなく寄った**: 以前は `place-dossier` 19.6 kB ＋ `here-now`
  25.5 kB ＋ `atlas-world-objects` 16.4 kB ＝ 61.5 kB で、今は `place-dossier` 52.4 kB ＋ `events-near` 9.3 kB ＋ `great-circle` 0.2 kB
  ＝ 61.9 kB（`here-now` と `atlas-world-objects` のチャンクは消えた）。`place-watch` は 29.1 → 24.3 kB（−4.8 kB）。
  rebase 後の木で `node scripts/perf-budget.mjs --update` を走らせ、`place-dossier` の天井だけを 19.2 kB → 52.4 kB に上げた（他の行は書いていない。消えた `here-now` の行は main の CI が落とす）。
- `tests/global-surface-baseline.json` を `--update` で**下げた**: `window.IntMapAtlas` 38 → 35・`IntMapSafe` 144 → 143・`IntMapWx` 39 → 35。
  二重の取得と二重の描画が消えた分、窓口を読む箇所が減った。

## 検査

新しい回帰 `tests/place-card-unify-checks.test.mjs`（7 件）: 1 セッションで USGS を 1 回だけ取ること（カード・見守る場所・
research.related の 3 者で）・窓外を unavailable と述べること・「該当なし」と「応答なし」が別の状態であること・見守る場所が
2 ページ目以降を読むこと・端末の位置では精密座標がどの要求にも入らずタイルも読まないこと・2 つの Atlas 能力が同じ記録を返すこと・
メニュー項目が 1 つで距離の実装が 1 つであること。既存の検査（place-dossier・mobile-next・watch-places・world-objects・
keyboard-and-offline・community-next・layer-map-tools）は弱めず、前提が変わったものは同じ主張を新しい形で書き直した
（例: here-now の `sun` 節 → `time.sun`、文字列で USGS の URL を探していた検査 → events-near が URL を 1 か所から読み、他は URL を書かないこと）。
