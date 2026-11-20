---
title: W杯のイングランド・スコットランドが描けなかった——highlight の「何であるか」と「どの形で描くか」を別々に名指す(ISO 3166-1 と ISO 3166-2)
date: 2026-11-21
newsen: Atlas can colour a set whose members are not sovereign countries, such as England and Scotland in a World Cup, by drawing each member's own first-level outline.
newsjp: Atlas が、W杯のイングランドとスコットランドのように主権国家でない参加単位も、その地域自身の輪郭で塗り分けられるようになりました。
---

〈依頼〉総合技術監査（2026-11-21）§9.2。`map.highlight` の複数グループ塗りは、メンバーが ISO 3166-1 alpha-3 を持つ国であることを前提にしていた。

## 原因（構造）
メンバーの「何であるか」（チーム・加盟単位）と「描く形」（国境ポリゴン）が、国コード 1 つに溶接されていた。国境ファイルは主権国家だけなので、GB-ENG / GB-SCT のような参加単位は `iso3_not_in_border_data` で未解決になるしかなかった。W杯専用の分岐は足していない。

## 直し方
- 形は**識別子の表記**で名指す: ISO 3166-1（国コード）→ 国境、ISO 3166-2（`subdivision`。`iso3`/`code`/`id` に書かれても読む）→ 第 1 級区分の輪郭。`js/atlas-country-ids.js` が表記を読み、`units`/`members` を返す。
- 「何であるか」は任意の `kind`（team など）で別に運び、形を決めない。
- 輪郭の取得は `_hlUnitGeo`（`js/atlas-console.js`）: ①同梱の第 1 級ファイル（コード完全一致・要求 0 件）②geoBoundaries ADM1 を `shapeISO` で、無ければ名前**完全一致**で。近い綴りの救済は付けない（実測: Moskva/Moskovskaya は別の単位）。見つからない単位は `no_subdivision_geometry` で未解決として返し、黙って落とさない。
- 同梱の Natural Earth 第 1 級には GB-ENG が無い（GBR は 232 件の郡・地区）ため、イングランドは geoBoundaries 経由（実行時の取得）になる。

引き継いだもの: 国のみの要求は従来どおり（既存検査は緑）。
未測: 本番での GB-ENG/GB-SCT の実描画（geoBoundaries の取得に依存。`shapeISO` に GB-ENG が入っているかは本番で確認する）。
