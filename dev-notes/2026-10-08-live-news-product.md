---
title: この場所の地震の記録——地震ピン・地点カード・リンク・Atlas から、その場所のまわりで USGS カタログが持つ全地震を記録の始まりから開き、開いた地震の順位と前回を出す。地図の円は Chronos の瞬間までの記録で、時計をその地震の瞬間へ動かせる
date: 2026-10-08
newsen: "Earthquake record here": from a quake pin, the place card or Atlas, see every earthquake the USGS catalogue holds around a place since records began — the largest, the decades, and where this one ranks. The map follows the clock.
newsjp: 「この場所の地震の記録」を追加。地震ピン・地点カード・Atlas から、その場所のまわりで USGS のカタログが持つすべての地震を記録の始まりから開けます。最大・年と規模の図・年代ごとの記録、そして今回の地震が何番目の大きさか、同じ規模の前回は何年前かが出ます。地図は時計に従い、その地震の瞬間の地図にもできます。
---

〈依頼〉「ライブの地図とニュース」分野の商品開発担当として、全権委任で「今を見てやるべきこと」を決めて作る。修正・監査ではなく、
新しい価値・使い方・読者を生む足し算で、IntMap が実際に取得している実データで本物に作れるもの。UI と Atlas の両方から届くこと。

## 0. 既にあったもの（調べた範囲）

- 地震レイヤー（`js/wb-layers.js` の `eq-pt`）: 24 時間／7 日／30 日（M4.5+）／1 年（M6+）の窓。ポップアップは M・場所・時刻と ShakeMap。
- ShakeMap（`js/shakemap.js`）: 1 つの地震の揺れの場。地点カード（`js/place-dossier.js`）: 300 km・7 日の地震。見守る場所: 新しい地震の通知。
- 今週の地球（`weekly/`）: 週ごとの大きな自然現象。Atlas の表 `earthquakes`（`js/atlas-query.js`）: 最大 10 年の FDSN 検索。
- ⇒ どれも「**いま・最近**」を答える。ニュースで地震を見た人が次に訊く「**これはここでは珍しいのか／前回はいつか／ここで最大は**」に
  答える面が無く、地震は時空間アトラスの中で唯一「時計に載らないライブ」だった（1914 年に時計を戻すと地震レイヤーは描かれない）。

## 1. 作ったもの

- **カード**（`js/quake-history.js`、遅延 `quakeHistory`）: 件数・記録の始まり・最大／開いた地震の順位・同じかそれ以上の前回と次回／
  年 × 規模の図（点は時計の瞬間から何年前かで色分け、時計より後は白抜き）／年代ごとの件数とその年代に記録された最小の規模／
  大きい順 10 件／選んだ地震（UTC の時刻・深さ・USGS の津波フラグ・「この瞬間の地図にする」・ShakeMap があればその扉・USGS のページ）。
  半径 100／300／500 km と下限 M4.5〜7 のチップ。脚注に出典（ComCat・ISC-GEM CC BY-SA 3.0）と「推定しない」と「整数度に丸めて送る」。
- **地図**: 円（半径）と記録の点。**時計の瞬間までに記録されたものだけ**を描き、色は 1 年／10 年／50 年／それ以前。時計が動くたびに
  1 フレーム 1 回描き直すので、Chronos のタイムラプスで記録が積み上がる。点を押すと選択。
- **事実**（`js/quake-history-core.js`、純粋）: 下の §2 の規則・順位・年代・時刻 T までの記録・リンク。
- **扉**: 地震ポップアップの「この場所の地震の記録」（押した地震の feature をそのまま渡す——正規化は core の `normalise` 1 つ）・
  地点カードの「周辺の地震」の行・リンク `?qh=緯度,経度,半径,下限[,地震ID]`（カメラと時計は通常のハッシュ）・命令 `quakehistory.open`・
  Atlas `time.quakeHistory`（`select`・`moment` で時計を動かす。要約は `forAtlas`——推定しないことを `caveat` に持つ）。

## 2. 決めたことと実測（2026-10-08）

- **出典は USGS ANSS ComCat の FDSN 検索**（既存の上流。CORS `*`・ブラウザ直読）。`starttime=1000-01-01` で 383 件の 1900 年より前の記録
  （最古 1568 年、北米の歴史地震が中心）を含めて読む。年をこちらで切らず、カードは記録が始まる年を名乗る。
- **ISC-GEM のライセンス**: ComCat の 20 世紀前半の多くは `net=iscgem/iscgemsup`。isc.ac.uk/iscgem/download.php が **CC BY-SA 3.0** と
  述べるので（営利可・表示と継承）、出典行（`js/reference-data.js`）を足し、地図ソースの `attribution` と脚注に入れた。IntMap は複製を配らない。
- **位置を送らない**: 地点カードはこれまで「位置は送らない」を守ってきた（`js/events-near.js`）。この機能は半径検索が要るので、地点を
  **整数度に丸め、半径を 1° のセルの半対角（79 km、`haversineKm` から導出）だけ広げて**送り、正確な円は端末で適用する。
  プライバシーポリシー §4（en/jp）・`scripts/outbound-hosts.json`（`coordinates`）・接続台帳を更新し、`LEGAL_DATE` を 2026-10-08 に。
- **3,000 件の上限と下限の繰り上げ**: 実測で東京近く（36°N 140°E・380 km・M5+）が 2,476 件＝圧縮 251 kB・2.6 秒。M4.5 なら 6,284 件。
  件数を先に訊き（`count`）、収まらなければ下限を次の段へ上げて**そう言う**。統計は常に名乗った下限で欠けのない記録の上。
  件数が答えられなかったときは「切れている可能性」と言う（収まったとは言わない）。
- **推定しない**: 頻度・確率・再来間隔は出さない。代わりに年代ごとの**記録された最小の規模**を出す——神戸 300 km・M5+ で 1900 年代
  M5.77 → 1970 年代以降 M5.0。「増えたのは観測の細かさ」をデータ自身が言う。
- 実測例（fixture＝カードが実際に送る要求の答え）: 神戸 300 km・M5+ は 229 件、最大は 1946 年の南海地震（M8.3）、1995-01-16 の兵庫県南部地震
  （M6.9）は 14 番目（同規模 1 件）、同じかそれ以上の前回は 1984-01-01 の M7.2（深さ 368 km）で 11 年前。

## 3. 検査

- `tests/live-news-product-checks.test.mjs`（node, 6 件）: 要求が丸めた地点・広げた半径・地震だけ・上限つきであること、正確な中心が
  どの要求にも現れないこと、全緯度で半対角が誤差を覆うこと／実際の ComCat の答え（`tests/fixtures/quake-history-kobe.json`、
  上流の答えから `normalise` が読む欄だけ残した 126 kB）で、端末の円・最大・順位・前回・年代を fixture 自身と突き合わせる／
  時刻 T までの記録と色の帯／下限の繰り上げと「件数不明」／リンクの往復／Atlas の登録・en+jp の説明・対象なしの拒否・扉。
- ブラウザでの確認（spec `live-news-product.spec.js`、1 起動、build 済みの dist で合格。**木には入れていない**——下の試験時間）: `?qh=` リンクでカードが開き、順位・図・年代・地図の点が出る／「この瞬間の地図に
  する」で時計が 1995-01-16 になり地図の点が減る・「いまに戻す」／半径チップで読み直し・USGS へ送られた URL に正確な座標が無い／
  `IntMapOS.execute('time.quakeHistory')` が completed。USGS は fixture で応答し、他の外部は遮断。
- ゲート: check:static・check:i18n・check:capabilities・check:catalog・check:datagov・check:surface（新しい窓口 `IntMapQuakeHistory` と、
  `IntMapLazy`・`IntMapOS`・`IntMapSafe`・`IntMapShakeMap`・`IntMapDevice`・`__setDetent` の読みを、ストーリーのカードと同じ形で足した——
  基準を `--update`）・check:archfiles・check:docs。

- **試験時間**: spec は 1 起動で実測 7.0 s（本体）。全体の天井（`TOTAL_BUDGET_S` 5,250 s・#R205）に余地が無く、天井は上げない判断
  （統合）なので、spec は木から外して保管し、古い記入値の測り直しで余地ができてから足す。fixture は node 検査が使うので残した。

- **起動予算**: カードの CSS は起動時のスタイルシートに置かず、遅延チャンクと一緒に届く（`QH_CSS`、地点カードと同じ形）——eager の CSS は
  増えていない。`async.gzip` の天井を **4,095.3 → 4,119.5 kB** に上げた（`node scripts/perf-budget.mjs --update`、origin/main へ rebase 後の
  `vite build --configLoader native`）。内訳は同じ設定で origin/main（f93f23f1）を別に build して chunk ごとの gzip で比べた: 新しいチャンク
  `quake-history` **+12.7 kB**・`atlas-console` **+2.3 kB**（`time.quakeHistory` の説明と run）・`place-dossier` +0.3 kB——この変更の遅延側は
  計 +15.3 kB（eager の `main` は +0.8 kB で、起動予算の行は天井の内）。上げ幅 24.2 kB の残り約 8.9 kB は、天井が記録された後に main に入った
  変更の分で、この変更のものではない（main の CI が merge 後に記録するはずだった差）。

## 4. 残したこと
- ブラウザの spec（`live-news-product.spec.js`、実測 7.0 s）を、試験時間の余地ができてから木に戻す。

- 地震レイヤーそのものは今も「ライブ」の宣言のまま（過去の時計では描かない）。過去の任意の日の地震を時計で描くレイヤー化は、
  時刻判定の宣言（`js/layer-time-decl.js`）を変える別の仕事として残した。
- カードの絵葉書（SNS 用画像）への図の焼き込みはしていない。地図の円は地図の絵葉書に入り、出典は `attribution` から入る。
