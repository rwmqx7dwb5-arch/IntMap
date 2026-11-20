---
title: 長い調査の「集めた値」を分析に渡す扉（data.table）と、未知の業種が「0 社」に化ける欠陥
date: 2026-11-20
newsen: Atlas can now turn the values it gathered into a table that map analysis can use, and a mistyped company sector is now named instead of answering "none".
newsjp: Atlas が集めた値を、地図分析に使える表にできるようになった。業種名を取り違えたときも「0 社」ではなく、使える業種名を返す。
---

〈依頼〉 「世界の主要半導体メーカーの工場立地を電力・水・労働力・輸送で比較」を、対象列挙→値取得→単位・期間統一→計算→地図分析まで通す。現状の能力で実際に通して詰まる所を実測し、構造で直す。

## 1. 実測（本番・2026-11-20・ログイン済み）
依頼文をそのまま Atlas に投げた。**5 分 44 秒かかり、数値は 1 つも出なかった。**
- `data.companySites` を `sectors:["semiconductor"]` で呼び **「0 社・拠点 0 か所」**。実際の業種キーは `semi`（24 社・134 拠点）。「世界に無い」と同じ言葉で返っていた。
- 次に worker 1 体へ「9 拠点 × 4 指標」を丸ごと渡した（Web 検索のみ・`tools` 無し）。2 分 39 秒後に「原典で確認できず」。出典 URL は 0。地図に置かれた点は 1 つ。
- 企業アトラスの TSMC の拠点は 5 つで、工場は Arizona Fab 21 の 1 つだけ。**fab は施設の種別（OSM/Wikidata の kind）にも無い。** 列挙は調査（Web）でしか得られない。
- 年・単位を揃える op（`convert`）、スコア（`compute`）、最寄り結合（`nearestJoin`）、都市の `precipMm`・人口は既にある。**切れていたのは「調べた行」→ データセットの継ぎ目**: worker は facts を返すだけで dataset を作らず、`data.studio` は添付ファイル専用、残るのは Python の文字列に値を埋め込む経路（単位も出典も検査も無い）だけだった。

## 2. 直したこと
- **`data.table`（`js/atlas-table.js` + `js/atlas-cap-data.js`）**: 行 `[{列:値}]` を dataset として登録する。lat/lng（または lon・latitude・longitude・指定列）を点にし、位置の無い行は行のまま数える（レジストリの表の規則）。**列の単位・量・出所は呼び出し側が述べたものだけを `fieldStatements` として運ぶ**（`convert` がそれを読む）。単位を宣言したのに文字が入っている列・どの行にも無い宣言列・範囲外の位置は、直さずに報告する。行数に上限は無い。答えは `gis.dataset` で、次の gis 段（`@id:data.gis.dataset`）にそのまま渡る。
- **`data.companySites` の未知の業種・種別**: 空の答えではなく、**行から読んだ有効値の一覧つきの拒否**（`INVALID_INPUT`・`validValues`）。一覧は行から導くので、業種が増えても手で足さない。

## 3. 直していないこと（次の候補）
- `data.companyTies` にも同じ形の未知フィルタの沈黙がある（同じ検査を共有する形に直せる）。
- 1 体の worker に 36 値を渡す分け方は Atlas の判断で、コードは縛らない（`kind:"capability"` の仕事で `data.query` の cities / precipMm を並べればモデルを挟まず取れる値があるが、それを選ぶのも Atlas）。
- 本番での再実測は、この PR のデプロイ後に行う。

## 4. perf 上限を上げた理由
`data.table`（atlas-cap-data → atlas-console チャンクに約 5.7 kB）と、取り込んだ main の差で async.raw が上限を超えた。新しい能力の実コードで、遅延チャンク内のため起動時の転送は増えない。`node scripts/perf-budget.mjs --update` で上げた。
