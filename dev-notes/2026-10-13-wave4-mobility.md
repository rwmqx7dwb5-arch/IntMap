---
title: 世界とのつながり——1 つの国が人（国連の移民ストック 1990〜2024）・データ（海底ケーブル系統）・航空路（2014 年の路線）でどの国とどれだけつながるかを、相手の一覧と地図の弧で、時計に従って。モノは既存の「貿易フロー」レイヤーへの扉
date: 2026-10-13
newsen: World flows — pick a country to see where people born there live and where its residents were born (UN migrant stock 1990–2024), which countries share its submarine cables and where its airline routes went: ranked partners and arcs that follow the time machine
newsjp: 「世界とのつながり」を追加——国を選ぶと、その国の出身者がどこに住み、その国に住む人がどこから来たか（国連の移民ストック 1990〜2024 年）、どの国と海底ケーブルを共有しているか、航空路がどこへ伸びていたかを、大きい順の一覧と地図の弧で表示。時計を動かすとその年の記録に変わります
---

〈依頼〉第 4 波・移動と交通の分野の商品開発（全権委任）。「世界の流れ（人・物・情報）を地図で見せる新しい商品を、商用可の実データで」。

## 0. 何が無かったか（調べた範囲）

- 「いまどこにあるか」はある: 航空機（`aviation-feed`・adsb.lol）、船舶（AIS のスナップショット）、鉄道アトラス、海底ケーブル。
- 「誰と誰がつながっているか」は**モノだけ**: 「貿易フロー」レイヤー（`wp-dl-trade`・`js/world-packs.js`、CEPII BACI を OEC の API で、
  相手国別・品目区分別・1995〜2024 年、弧と時計つき）。**人の流れは地図のどこにも無く**、ケーブルは線の地図であって「この国は
  どの国とつながるか」に答えず、航空路の国別の表（`data/mobility.json`）はパンデミック・シミュレーターの重みとしてしか読まれていなかった。
- ⇒ 読者が国について次に訊く「この国の人はどこに住んでいる？ この国に住む人はどこから来た？ この国はどこと線でつながる？」に答える面が無い。

## 1. 作ったもの

- **カード「世界とのつながり」**（`js/world-flows.js`、遅延チャンク・窓口を公開しない）と**事実**（`js/world-flows-core.js`、純粋）。
  国を選び（検索欄・地図の相手の丸・一覧の行）、流れを選ぶ（人・モノ・データ・航空路）と、合計・相手の数・最大の相手の割合、
  1 文の見出し、年ごとの合計の図（棒を押すと時計がその年へ）、大きい順の相手（15 件・「すべて表示」）、何の数か／何ではないか、出典。
- **地図**: 国から相手への大圏の弧（太さは最大の相手との比、`›` が向き）、相手の丸に順位、押すとその国へ。リストと地図は同じ相手を同じ順で。
- **時計に従う**: 時計の年以前で最も新しい記録の年を読む。記録より前は描かず「記録は N 年から」と言い、その年へ動かすボタンを出す。
- **人**の記録 `data/world-flows.json`（423 KB）を `scripts/build-world-flows.mjs` が UN DESA **International Migrant Stock 2024** の
  Table 1 から書く: 出身国 × 居住国 9,345 組 × 8 時点（1990・1995 … 2020・2024 の年央）、DESA が述べる国ごとの合計（「その他・不明」込み）、
  居住国ごとの**推計の根拠**（DESA の type-of-data: B 外国生まれ／C 外国籍／R 難民等を加算／**I 補完推計**）と注（例「1990〜2005 年の
  スーダンは南スーダンを含む」）。カードは居住国側でその根拠と注を、出身国側の一覧で補完推計の相手に「国連の補完推計」を出す。
- **データ**は `data/subcables-meta.json`（海底ケーブルレイヤーと同じ記録）、**航空路**は `data/mobility.json` の `pairs` を**そのまま読む**（写さない）。
- **モノは描かない**——「貿易フロー」レイヤーを同じ国・向きで開く扉（行の `change` と、レイヤー族が登録した `IntMapShareState` の `world`。
  共有リンクが通るのと同じ 2 手）。貿易の実装は 1 つのまま、入口が 2 つになった。
- **扉**: Tools ▾「道具」の `tool.worldFlows`／地点カードの国の行「◯◯と世界のつながり」／リンク `?wf=<ISO3>.<流れ>.<向き>`（`src/main.js`）／
  Atlas `data.worldFlows`（`country` 必須・`kind`・`direction`・`year`・`top`・`show`。observer `panel`。`at` は割当の 600）。
- 補助: `js/card-clearance.js`——カードが覆わない部分に `fitBounds` する余白。同じ規則が `js/news-story.js` と `js/quake-history.js` に閉包で 2 つあり、
  3 つ目を書かずに外へ出した（その 2 つの置き換えは他分野のファイルなので残した）。

## 2. 決めたこと・否定したこと（実測 2026-10-13）

- **ライセンスは商用可だけ**: IMS 2024 の各シートに「CC BY 3.0 IGO」（営利可・表示）。Natural Earth は公有。
- **IMF PortWatch（チョークポイント通過数）を採用しなかった**: ArcGIS の項目のライセンス欄は IMF の利用条件を指し、その「Use of IMF Data」節は
  再配布を認めつつ末尾で「For any potential commercial reuse of IMF Data, please email copyright@imf.org to request permission」と述べる。
  IntMap は営利なので、許諾なしに使える典拠と読めない。
- **CEPII BACI を自前の束にしかけて、やめた**: Etalab 2.0（営利可）で、HS92 版 2.4 GB を範囲読みで年ごとに集計する builder を書いた
  （1995 年: 498 万行 → 19,015 組・8 秒）。その後 `js/world-packs.js` の「貿易フロー」が同じ BACI を OEC 経由で既に描いていると分かり、
  **同じ問いへの 2 本目の実装**になるので撤回した（`.agents/rules/substance-over-form.md`——統合は削除ではない、二重実装は作らない）。
  モノはそのレイヤーへの扉にした。
- **国の位置と名前は Natural Earth 10m**（地図が描く形と同じ）。M49＝`ISO_N3_EH` で結び、同じ番号を国と属領が持つときは
  `ADM0_A3 = ISO_A3_EH` の地物を国とする（フランス／クリッパートン、オーストラリア／外領——表を手で並べない）。Natural Earth に無い
  DESA の地域（マヨット・レユニオン・チャネル諸島・ボネール等・グアドループ・マルティニーク・仏領ギアナ・トケラウの 8 件）は
  落とさず `N:<M49>` で残し、位置なし・「地図外」と数える。
- **欠けは 0 にしない**: DESA の「..」・空欄は null（1990 年に 1 セル）。名前末尾の注記号「*」は名前から外す。注のシートは
  UTF-8 を Latin-1 で読んだ文字化け（「RÃ©union」）を含むので、UTF-8 として綺麗に戻るセルだけ戻す。
- **大圏はアプリの turf（`@turf/great-circle`、`window.turf.greatCircle` と同じモジュール）**——東京→サンフランシスコで 179.8 → −164.2 と
  経度が飛ぶので、経度を連続に直す（`arcLine`）。弧の実装を新しく書かない。
- **ケーブルは過去を少なく数える**: 記録は現役と計画中だけで退役したケーブルを持たない。年は運用開始年（`rfsYear`）。年の無い 8 系統は
  「現在」だけに数える。カードがこの 3 点を言う。
- 一覧の既定 15 件は表示の選択（推定: 世界図で 15 本の弧と番号の丸が読める数・カード 1 枚分の行）で、記録を切るものではない。
  「すべて表示」で全件・地図も全件。

## 3. 検査

- `node --test tests/wave4-mobility-checks.test.mjs` 7/7（束の整合・欠けは null・根拠と注・時刻の規則・両側から同じセル・ケーブルは
  年とともに減らない・路線は表の行・弧の向きと 180 度線・Atlas の事実／before-record／NOT_FOUND／時計を動かさない・扉）。
  移民の向きを入れ替えると ① が落ちることを確かめた。
- 段 1: check:static・check:docs・check:types・check:datagov・check:i18n・check:capabilities・check:catalog・check:archfiles・check:surface、
  横断 7 本（下の最終報告のとおり）。
- **出自の台帳に 2 件**（`data/world-flows`・`scripts/build-world-flows.mjs → data/world-flows.json`）: 出自は値で述べた（`upstreams` 2 件・
  `asOf`・`paidBy`・`cadence` と根拠・`schema`・`builtBy`、束の側は `generatedAt` と `quality`＝measureQuality の実測）。残る publisher・url・
  licence・licenceUrl・retrievedAt・precedence は構造上 1 つに述べられない: 束は 2 つの上流（人の数は DESA、国の位置と名前は Natural Earth）を
  持ち、どちらか一方の値を束全体の値と書くともう一方について誤った主張になる（`js/data-governance.js` の規則どおり上流ごとには述べてある）。
  2 つは別の問いに答えるので優先順位（precedence）も当たらない。builder の宣言は書き込み日と測定値を持てない（走ったときにしか無い）。
  `node scripts/data-governance.mjs --update` で記録した。

- ブラウザでの通し（build 済みの dist・使い捨ての spec、木には入れていない）: `?wf=MEX.migration.out` でカードが開き 1 位が米国／
  検索で日本・「この国に住む外国出身者」で推計の根拠の行／図の 1990 年の棒で時計が 1990 年・見出しが「mid-1990」／航空路は 1990 年に
  「記録は 2014 年から」／現在に戻して路線表・ケーブル（43 系統）／「モノ」→「日本の輸出」で貿易フローが日本の輸出で開く／
  `IntMapOS.execute('data.worldFlows', {country:'Egypt', kind:'cables', show:true})` が completed／携帯幅 390 px でカードが殻どおり。
  ページの例外 0。最初の通しで、地球儀表示では相手が地球の半分を超えて広がると `fitBounds` が小さな地球（直径約 300 px、半分がカードの裏）を
  出すと分かり、地球が空いている部分を満たすズームより引かないようにした（`fit()` の註）。
- **起動費用**（`check:perf`、build 後）: 新しい遅延チャンク `world-flows` 35.5 kB。`async.gzip` 4,181.2 kB（天井 4,159.4・幅 20.8 kB）と
  `dist.data` 1,179,451.8 kB（天井 1,173,525.5 kB）が天井を越える。この変更の分は `world-flows` チャンクと `atlas-console`（能力の説明）、
  データは `data/world-flows.json` の 0.43 MB で、`dist.data` の残りの差はこの木が origin/main より 1 コミット遅れていることを含む。
  天井は担当の外（統合時に main で測り直して `--update`）。
- **共有窓口の読み 2 件増**（`check:surface`、`node scripts/global-surface.mjs --update`）: `window.IntMapSafe`（153 → 154）は
  `js/world-flows.js` の `esc` 1 か所——`js/safe-html.js` は admin.html が classic script として読む IIFE で輸出の口が無い（`js/polity-arc.js` と同じ事情）。
  `window.IntMapShareState`（31 → 32）は「モノ」の扉——貿易フローの選択を設定する口は、レイヤー族が `js/world-packs-rows.js` で登録した
  共有リンクの `world` しか無く（`STATE.tradeLoad` は窓口に出ていない）、共有リンクと同じ道を通すのがレイヤーを 2 つ目の方法で操作しない形。
  当初書いた `window.IntMapStack.opened` の 2 読みは、同じカードの殻の `js/quake-history.js` が使わない（`HOST.bringToFront` で足りる）ので外した。

## 4. 残したこと

- `js/news-story.js` と `js/quake-history.js` の `clearOfCard` を `js/card-clearance.js` へ寄せる（他分野のファイル）。
- 航空路は 2014 年の表しか無い（公開されていて現行の二国間の旅客行列は存在しない——`scripts/build-mobility.mjs` の実測）。
- ブラウザの spec は足していない（試験時間の天井。node の検査が事実・扉・Atlas を評価する）。
