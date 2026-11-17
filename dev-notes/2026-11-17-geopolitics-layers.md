---
title: 経済制裁・国連総会の採決・国境検問所の 3 レイヤーを、商用で使える典拠だけで足した——典拠の欠落は測って述べる
date: 2026-11-17
newsen: New Politics layers: Sanctions (who the US, UK and EU designate, with which measures), UN General Assembly votes (1946–2023, each member coloured by its vote) and Border crossings (open or closed by local published hours, who may cross). Atlas answers all three.
newsjp: 「政治・統治」に新レイヤー: 経済制裁（米・英・EU が誰をどんな措置で指定したか）、国連総会の採決（1946〜2023年、加盟国を投票で色分け）、国境検問所（現地の公開時間で開閉と通過条件）。Atlas も 3 つに答えます。
---

〈依頼〉「ないもの 16 個」のうち利用者が選んだ 3 つ——経済制裁・禁輸、国連決議の採決結果、国境検問所と開閉状況——を実装する。
条件は、営利サービスなので非営利条件の典拠を使わないこと、出典・規約・説明を同時に更新すること、実データだけ、Atlas と時間軸にも組み込むこと。

## 0. 測った（2026-11-17）

| 典拠 | 条件 | 判断 |
|---|---|---|
| 米 OFAC SDN（sdn.csv・add.csv） | 米国政府著作物（17 U.S.C. §105） | 使う |
| 英国制裁リスト（FCDO、CSV 50 MB） | OGL v3.0 | 使う（帰属が条件） |
| EU 金融制裁リスト（FSF、CSV 25 MB） | 決定 2011/833/EU（出典明記で再利用可） | 使う（帰属が条件） |
| 国連安保理 統合制裁リスト | 国連サイトの利用条件は「個人的・非商用」 | **使わない**。安保理の指定は英国・EU が実施する分としてそのリストに現れる（`un` として数える） |
| 国連デジタルライブラリの総会投票データ（81/1 まで） | レコードに「Copyright, United Nations; Non commercial use, with attribution」 | **使わない** |
| Voeten・Strezhnev・Bailey「UN General Assembly Voting Data」（Dataverse doi:10.7910/DVN/LEJUQZ） | CC0 1.0 | 使う。投票の CSV は v32（2024-03-21）が最後で、v33 は RData のみ、v34 以降は投票ファイル自体が無い |
| OpenStreetMap `barrier=border_control` | ODbL | 使う。9,582 件、opening_hours 1,019 件、access:citizenship 650 件 |
| timezone-boundary-builder 2026f（with oceans, now） | ODbL | 使う。各検問所の IANA 時間帯（0 件が未割当） |
| 米 CBP 国境待ち時間 API（Open/Closed を持つ） | 米国政府 | **使わない**: `Access-Control-Allow-Origin` が無く（読者のブラウザから読めない）、座標も無い |

## 1. 何を作ったか

- 生成器 3 本（`scripts/build-sanctions.mjs`・`build-unga-votes.mjs`・`build-border-crossings.mjs`）と同梱データ、規則の正本 `js/geopolitics-core.js`、
  時刻表の評価器 `js/opening-hours.js`、描画 `js/layer-pkg-geopolitics.js`、Atlas の本体 `js/geopolitics-atlas.js`、能力 3 件（`data.sanctions`・
  `data.unVote`・`data.borderCrossings`）、層の宣言 3 枚、時間軸の宣言 3 件、出典行 6 件（en+jp の説明つき）。
- 経路パネルの「国境通過」に、越境地点ごとの最寄りの検問所・距離・到着予想時刻での開閉を足した（既存の `routing-ops.js borders()` の座標を使う）。
- 共有 CSV 解析器 `scripts/lib/cldf.mjs parseCSV` に区切り文字の引数を足した（EU のファイルは「;」区切りで、1,068 行が引用符の中に「;」や改行を持つ）。
- レイヤー・パッケージの道具箱に `wireDrag` を足した（凡例カードを既存の凡例と同じ仕組みで動かせるように）。

## 2. 典拠を史実と突き合わせて見つけたこと（否定された見立ても）

- **国名の解決**: Wikidata の別名を Natural Earth・CLDR と対等に混ぜると「Russia」「China」「France」が曖昧になり 7,500 件が地図から落ちた。
  別名は主たる名前が無いところだけを埋める規則にした（`scripts/lib/country-name-index.mjs`）。残る未解決は文言のまま数える（米 1,376・英 1,093・EU 2,025。
  EU の大半は国の記載そのものが無い）。
- **国連総会のデータ**:
  - A/RES/68/262（ウクライナの領土保全、2014-03-27）は 100–11–58 で総会の記録と一致。
  - 新しい行では `short` が主題（「ARMED CONFLICTS PREVENTION--MEDIATION」）で、決議の題名は `descr` 側にある。主題だけを検索すると 68/262 が見つからなかったので、
    説明も索引に入れて検索する。記号は「R/68/262」と「A/RES/77/321」の二表記があり、接頭辞を外して同一視する。
  - **欠落**: 第76会期は 2021-12-24 より後を含まない（2022 年のウクライナに関する緊急特別会期の採決は無い）。
  - **日付**: 1971 年の中国代表権の採決は 10 月 7 日付だが総会は 10 月 25 日に採決した。第19会期の唯一の採決（アルバニアの異議）は 1965-02-06 付だが、
    説明自身が 2 月 8 日の裁定に対する異議だと述べる。これらは直さず（独立の典拠を持たない）、凡例と Atlas の説明に測った事実として書いた。
  - **セルビアのコードが無い**: 現在のセルビアの議席を、記録は 2023 年まで YUG「Yugoslavia」で書く（第47会期はほぼ全件「非加盟」＝1992〜2000 年の参加停止と一致）。コードを読み替えて塗ることはせず、一覧に示し、そう述べる。
  - session 74 の 17,472 行は加盟国を大文字の国名で書き Countryname が NA。他の行が持つ COW 番号との対応で ISO コードに結んだ（綴りでは結ばない）。
- **時刻表**: 1,019 件のうち 1,005 件を評価でき、14 件（日の出・第 n 曜日・「-1 day」・「+」・「@」・時だけの表記）は「評価できない」と返す。
  月の範囲の直後の時刻（「Nov-Mar 07:00」）を日付と誤読する欠陥、「Aug 31:」のコロンを時刻と誤読する欠陥を、全件の評価で見つけて直した。

## 3. 描かないもの・言わないこと

- 制裁は指定対象の名簿で、分野全体の輸出禁止や物品の禁輸は含まない（各画面が述べる）。過去の時計では描かない（snapshot）。
- 国連総会の採決は今日の国の輪郭に塗る。東独・チェコスロバキア・ユーゴスラビア・イエメン・アラブ共和国・ザンジバルは輪郭が無いので凡例に列挙する。
- 検問所の開閉は公開時刻表の評価で、実況ではない。経路の越境地点と検問所を半径で結び付けない（距離を示す）。

## 4. 検査

`tests/geopolitics-layers-checks.test.mjs`（15 件）: 3 データの形と件数の整合、制裁の弧の始点と終点、EU の引用符入り「;」、名前の曖昧さ、
A/RES/68/262 の照合、測った欠落がまだ欠落であること（埋まったら文言を直す合図）、時刻以前の最後の採決、時刻表の各書式と現地時刻、
評価できない書式がトークン付きで「unread」になること、最寄り検問所の順序。

## 5. 台帳を緩めた 2 か所と、その理由

- **`tests/global-surface-baseline.json`**: 新しいパッケージが既存の共有部品を `window` 越しに読む（`IntMapSafe` +3、
  `_ensureLegendOpacity` +2、地図ツールチップの `show/set/hideMapTooltip` +4）。どれも持ち主（`js/safe-html.js`・`js/data-layers.js`・
  `js/app-body.js`）が export しておらず（`node scripts/module-graph.mjs --plan`）、既存の凡例・ツールチップを使う層はすべて同じ経路で読む。
  `IntMapSafe` は URL 用に 1 回束縛して減らした（markup のタグは output-taint が束縛で判定するので直に読む）。`node scripts/global-surface.mjs --update`。
- **`check:perf` の天井**: Atlas の能力 3 件の説明（`atlas-cap-runs`・`atlas-console` の目録）と経路パネルの検問所欄（`routing-ui`）の分だけ
  非同期チャンクが増えた。新しいチャンク（`layer-pkg-geopolitics`・`geopolitics-core`・`geopolitics-atlas`）は層を入れたとき・Atlas が呼んだときに
  だけ読む。`node scripts/perf-budget.mjs --update` で、増えたぶんだけ上げた。
  **起動時（eager）も +25 kB（gzip +8.6 kB）増えた**——#1177 が天井を main の実測まで下げた後に測り直して見えた。中身を起動チャンクで確かめると、
  増えたのは宣言だけ（レイヤー・マニフェストの 3 行、出典行 6 件とその en+ja の説明、時間軸の宣言 3 件、能力索引の 3 行）で、どれも設計上起動時に
  読む表（出典ページ・レイヤー欄・Atlas の索引がデータを読まずに答えるため）。描画・規則・時刻表・Atlas の本体は起動チャンクに 1 行も入っていない
  （`Voted yes`・`unga-votes` は 0 件）。
- `tests/durations.json` に新しい spec を 10 s で記入。最初は 3 件で 44 s だったが、並行の PR が余地を使い切り全体が 5,282 s（天井 5,250 s）になったので、
  自分で払った: 9,582 点のソースを Node に戻さずページ内で数える・確認用の撮影と固定待ちをやめる・地図のタップはカメラを動かさず今見えている点を叩く
  （段ごとに測ってタップが 4.9 s だった）。1 件の spec にまとめ、実測 8.9 / 9.3 / 9.0 s。主張は 1 つも減らしていない。全体の天井は動かしていない。

## 6. CI で赤だった 5 件と、その直し方（手元で再現してから直した）

- **出自（check:datagov ledger-shrinks）**: 3 本の生成器の `GOVERNANCE` が、別の定数や `GOVERNANCE[OUT]` を参照していて門が読めず、
  束も取得日・生成日・品質の数を持っていなかった。宣言を自己完結した値にし（日付・ライセンス・測った品質・上流の優先順位）、束はその宣言をそのまま
  運ぶ。生成器は測った品質と日付が宣言と食い違えば書かない（`scripts/lib/gov-stamp.mjs`）。台帳（`--update`）で逃がしていない。
- **レイヤー・パッケージの道具箱**: `wireDrag` を足したので、検査の写しにも同じ名前を足した。凡例は描画できるようになってから作る（⑥）。
- **タイマー（#R408 ②a）**: 生の `setInterval` を `js/runtime.js` の `everyTick` へ。
- **時計（one-geocode-one-clock (c)）**: 「live なら今、さもなくば時計」を自前で組まず `IntMapTime.nowMs()` に訊く。
- **政治・統治の並び（#R469 ④）**: 読者が並べた 6 行の一覧を伸ばさないよう、3 行は棚の「その他」に畳み、棚の末尾に置いた（`dl-histurban` と同じ扱い）。
