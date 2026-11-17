---
title: News の品質の続き——検索の件数と一覧を同じ集合に・吹き出しは国名が置かれてから避ける・代表地点の規則を既存の出来事にも・Story の鍵を地名にしない
date: 2026-11-18
newsen: A search now lists every event it counts. News labels on the map avoid country names even right after the map moves. Events placed before the new place rule are re-placed, and Follow this story keys on what happened, not where.
newsjp: 検索の件数と一覧が同じ出来事を数えるようにしました。地図の吹き出しは、地図を動かした直後でも国名に重ならないようにしました。新しい代表地点の決め方は既にある出来事にも効き、「流れを追う」は場所ではなく出来事の中心の語で追います。
---

〈依頼〉News の品質修正（dev-notes 2026-11-17-news-quality）を本番（build dcd32a0）で確かめた所見 4 件。

## 1. 検索の件数 2・一覧 1（「Kerch」）

サーバーへの問い合わせは代表見出しと**要約**に語を当て、一覧が手元で絞る文（`toItem` の `_search`）は要約を
持たなかった。要約にだけ語を含む出来事（本番: 「Kerch Bridge…」の 1 件は見出しに、もう 1 件は要約だけに Kerch）は
「All topics」の件数（`globalData` の出来事を数える）に入り、一覧（`computeFilteredNews` が `_search` で絞る）から
消えた。⇒ 検索する列を `SEARCH_COLS` の 1 か所にし、問い合わせの `or()` と `_search` の両方がそれを読む。

## 2. 吹き出しが「Greenland」に重なる

国名を避ける判定は正しく働いていた（国名の層は発見でき、箱の問い合わせは「Greenland」の文字の上で
Greenland を返す——本番 375×812 で確かめた）。**問う時刻が早かった**: 配置は `moveend` で走り、そのとき新しい
視点のタイルはまだ読み込み中で、国名はまだ置かれていない。本番 2026-11-18（375×812・地球儀・z2.2〜2.6）の
6 視点で、移動の 3.5 秒後に 4 視点で表示中の帯が国名に重なり、配置をもう一度走らせると全部消えた。
⇒ 落ち着くたびに、描画系の次の `idle`（タイルの読み込みと配置が終わった時）で**もう 1 回だけ**配置する。
`on('idle')` にしない（配置が feature-state を書く → 再描画 → また idle、で回り続ける）。本番に同じ結び付けを
入れて 7 視点を測り、重なり 0。⚠ 欧州の z2.4 では帯が 0 本になる視点がある（どの帯も国名か画面外にかかる）——
規則どおりの答えで、点は残る。

## 3. 米中露会談が White House のまま

代表地点を選び直すのは `assign` が「この run で記事が足された出来事」を数え直すときだけで、規則を変えても
記事の来ない出来事は古い地点のままだった（51946「Trump, Xi, Putin to hold historic meeting in China」21 本、
最後の記事 11-16 08:38）。**既存分にも効かせるべきと判断した**: 地点は構成記事から決まる関数で、残っている記事で
選び直せば今の規則の答えになる。読者が見るのは今の規則で選ぶべき地点である。
⇒ `summariseEvent` が規則の版 `PLACE_RULE` を `location_evidence.rule` に書き、`assign` は版の違う出来事を、
構成記事が残っている限り（store にある実 ID）選び直す。書くのは地点の欄だけで `materially_updated_at` は
動かさない。人の決めた地点は触らない。予算の余白（20 秒）を切ったら次の run に回す（版が古いまま残るので拾われる）。
本番の構成記事で再生: 51946 は Shenzhen へ。Fed の Cook 公聴会（53766）や Bessent（53339）は White House のまま
（中身がホワイトハウスの話）。構成記事が 72 時間で消えた出来事は選び直せない（材料が無い）。

## 4. 韓国の不正行為の Story が「south + korea」

`news_story_terms` の実数（60 日・17,058 見出し）を取って `suggest()` を再生した。中心語は south・korea・cheat・
glasse・exam。対の候補は「少なくとも 1 つが名前」に限っていたので、名前ではない cheating・glasses の対
（3 件）は候補にならず、名前だけの「korea + south」（49 件）が選ばれていた。
⇒ ① **2 語ともその出来事の中心語なら、名前でなくても対の候補にする**。② **語が地名を綴るだけの選択は最初の
選択にしない**（決定論エンジンが返した地点の名前が語の並びと一致するか。「xi + putin」はロシアに解けるが名前では
ない）。名前だけの対と広い名前（> 30 件）に限る——珍しい単独の名前に効かせると深センの会談が「thursday」に
なった（曜日も大文字）。再生の結果: 韓国 2 件は「cheating + glasses」「cheating + exam」、深センの会談（shenzhen）・
北京の記事（putin + summit）・ケルチ（crimea）は変わらず。

## 5. 残り

- 欧州など国名の密な場所では z2.4 で帯が 1 本も出ない視点がある（規則どおり・点は押せる）。
- 共有窓口の読み取り **`window.IntMapNewsGeo` +1**（7 → 8）: `js/news-story.js` の `placeName`（語が地名を綴るか）。
  `js/newsgeo.js` は classic script（`supabase/functions/_shared/newsgeo.js` と 1 バイト同一の写し）で export を持てず、
  import できない。無いときは何も地名と判定しない（規則の無い順に戻る）。
