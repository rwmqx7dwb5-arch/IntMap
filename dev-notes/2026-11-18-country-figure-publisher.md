---
title: 国カードの出典——世界銀行の最新値と、時間を戻したあとの値にも発行者名を運ぶ
date: 2026-11-18
newsen: The country card now names the publisher beside the year for every figure, including the World Bank's latest values and after travelling through time.
newsjp: 国カードの全ての数値で、年と並べて発行者名を表示するように（世界銀行の最新値と、時間を戻したあとの値も）。
---

〈依頼〉国カードの出典を発行者名にした変更の本番検証（build 1be2049）で不合格: HDI は「(2022 · UNDP)」になったが、GDP・1 人当たり GDP・人口・平均寿命・インターネット利用率・軍事費は「(2025 · World Bank World Development Indicators (NY.GDP.MKTP.CD))」と全文のまま。発行者名を値の出所と一緒に運ぶ全経路を直し、「全ての値で発行者名が出る」ことを測る。

## 0. 全数（値と出典を書く箇所）

`setFigure` / `stampFigure` を呼ぶのは 4 ファイル: `js/countries-ui.js`（同梱の表・Natural Earth）、`js/app-body.js`（PPP・名前で 'World Bank'）、`js/wb-indicators.js`（世界銀行の最新値）、`js/time-countries.js`（時間旅行の値・Now への復元）。発行者名を落としていたのは 2 経路で、どちらも**引用の一部の欄を写し直していた**:

- `wb-indicators.js` `applyLatest`: `wbCitation` の結果から `{ source, licence, url }` だけを写し、`code` を足していた——`publisher` は写す欄に無かった。起動時に世界銀行の最新値が同梱の値を置き換えるので、カードの大半がこの経路の値だった。
- `time-countries.js`: Now の値を退避するとき `[年, source]` だけを保存し、戻すときその 2 つで押し直していた。

`stampFigure` は `publisher` の無い引用で `source` 全文に戻るので、どちらも画面では全文として出た。

## 1. 直したもの

- `applyLatest` は引用を**丸ごと**渡す（`{ ...cite, code }`）。引用に欄が増えても写し漏れない。
- `js/country-figures.js` に `stampOf(row, field)`——押された印を書き手が渡したまま返す（`{ y, src }`、`src` は引用オブジェクトか名前）。`time-countries.js` はこれで退避し、`stampFigure(row, field, st.y, st.src)` で戻す。

## 2. 検査

- `tests/country-figure-publisher-checks.test.mjs`: 表の欄を埋める世界銀行の系列**全部**について `applyLatest` を実際に走らせ、`figure` が発行者名・全文の引用・系列コード・年を返すこと／退避して戻した印が元の印と同じ（`deepEqual`）こと。
- `tests/countries-companies.spec.js` に 1 本: 世界銀行の API を形どおりの fixture で答えさせ（ネットワークの有無で経路が変わらないように）、`applyStat` で 6 欄を書いたあと、行の「詳細 ›」で国カードを開き、全ての「(年 · 出典)」が発行者名（括弧・系列コード・「Indicators」を含まない短い名前）であること、世界銀行の値が「World Bank」と出ること。続けて 2010 年へ行って Now に戻り、カードの表記が行く前と同じであること。
- 新しい spec ファイルにすると起動 1 回分で全体の時間の天井（5,250 s）を約 12 s 超えたので、同じ国カードを開く既存の spec に入れた。そこの「詳細ボタンが国を開き、カードに値の年が出る」1 本はこの検査が全部を含むので統合した（ボタンが見えること・開いた国が FRA であることはこちらで確かめる。同梱の値の出典は `tests/companies-live-time-wrap-checks.test.mjs` が測る）。所要は test body の合計 18.3 / 14.7 / 18.5 s で、上限の 19 を記録（18 → 19、全体 5,249 s）。

ブラウザで国カードを開いて確かめた表記（fixture の値で）: `GDP (nominal) (2024 · World Bank)`・`Population (2024 · World Bank)`・`HDI (2022 · UNDP)`・`Life expectancy (2024 · World Bank)`・`Internet users (2024 · World Bank)`・`Democracy Idx (2023 · EIU)`・`Mil. spending (2024 · World Bank)`——2010 年から戻った後も同じ。
