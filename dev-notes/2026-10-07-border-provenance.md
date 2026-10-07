---
title: 境界線を押すと「この線の根拠」——両側の記録・行・識別子・日付を誰が述べたか・輪郭の精度・査読・ライセンス・調書を 1 枚で
date: 2026-10-07
newsen: Press any border on the map, historical or today's, to see where the line comes from: the record and row on each side, who stated its dates, how precise its outline is, the reviews, the licence, and the dossier for IntMap reconstructions. Report it from there, or ask Atlas.
newsjp: 歴史地図でも今日の地図でも、国境線や地方区分の線を押すと「この線の根拠」が開きます。両側の記録と行、日付を誰が述べたか、輪郭の精度、査読、ライセンス、IntMap の復元なら調書まで。そこから誤りを報告でき、Atlas にも訊けます。
---

〈依頼〉第 3 波「事業・プロダクト全体の再設計」のデータ担当。「線 1 本ごとに根拠を辿れる地球の時空間アトラス」の
商品として、境界線・区分を押すとその線と面がどこから来たかを 1 枚で見せる。両方の読み手（同梱の束と OHM の
ベクタタイル）で出し、Atlas からも届き、空の欄は空と言う。

## 0. 測った

- **線には listener が 1 つも無かった。** `imtb-line` は `js/time-borders.js` 自身のコメントが「どちらの分岐にも
  到達しない」と書いており、地方区分の 3 本の線（`imta*-vt-line`・`imta*-line`・`imta-gap-line`）も、今日の
  `borders-only-line` も、押して何も起きない。国名ラベル（`imtb-lbl`）と名前の無い形（`imtb-fill` の fallback）だけが答えていた。
- **束は出自を落としている。** `data/hist-borders.js` と `data/hist-borders-late.js` の行は名前・Wikidata・日付・環で、
  **OHM のリレーション id もタグの原文も無い**。`data/hist-clio.js` は Cliopatria の上流行の年と SeshatID を持たず、
  継ぎ足しの記録（`HIST_ADMIN_GAPS`）は `js/hist-bundles.js` の splice で**列 10〜12 が落ちる**——復元の府県から調書へ
  辿る鍵がページに無かった。

## 1. 作ったもの

- `js/border-provenance.js`（常時・小）: 行の指紋 `rowKey`、頂点の桁数、**押した点と周囲 8 点**を覆う形 `shapesAt`、
  読み手の登録、全ての線を受ける 1 本のクリック（独占の持ち主・地図全体の持ち主・道具に譲る）。
- `js/border-provenance-card.js`（押したとき）: カード（en+jp）・索引の読み込み・調書の読み込み・誤り報告への引き継ぎ・
  Atlas `time.borderSource`。マークアップは `IntMapSafe.markup` のテンプレートだけで組む。
- 読み手: `era-borders`（CShapes・OHM・OHM-late・Cliopatria・枚）と `today-borders`（タイルが述べること＝両側の名・
  係争の印・出典の credit。日付は主張しない）を `js/time-borders.js`、`era-subdivisions`（タイルの way id と日付タグ
  原文・査読済みの暦日・束／継ぎ足しの行）を `js/time-admin1.js`。
- 拡大時の輪郭の有無（`js/border-coast.js` `detailState`、5 MB の索引は読まずに「拡大したときに読む」と述べる）と、
  川・壁の経路で描き直した区間（`coursesAt`・`js/hist-courses.js` `course`）。
- 入口: 線そのもの／昔の国名カードの「この国境の根拠」／区分名カードの「この区分の根拠」（`showPopup` の `opts.more`
  ——呼び手が完成した文と動作を渡す、配置だけの 1 行）／Atlas。

## 2. 索引（`scripts/build-border-provenance.mjs`）

ビルドのキャッシュ（`intmap-histb-cache`・`intmap-clio-cache`）を読むだけで、ネットワークに出ない。各行に束の行の指紋。

| 索引 | 行 | 一致 | 一致しない／複数 |
|---|---:|---:|---|
| `border-provenance-ohm.json` hist-borders | 1,411 | 1,391 | **20 行は一致なし**・1 行は 2 リレーション |
| 同 hist-borders-late | 306 | 306 | 0 |
| `border-provenance-clio.json` | 12,878 | 12,878 | 16 行は同名同期間の上流行が複数（最初を示し、件数を述べる）。行数は main の歴史地図訂正（#1031）で hist-clio.js が 12,878 行になった後に作り直した値 |
| `border-provenance-gaps.json` | 5,079（5 記録） | 全行 | — |

- **20 行の一致なしは誤りではなく時間差。** 例: 束の «Empire of Japan (1869-1879)» は 1880-01-01 で終わるが、
  2026-10-05 のキャッシュでは同じ実体が «Empire of Japan»・終わり «1877»。束を作った後に OHM が名前と日付を変えた。
  カードは id を出さず「束を作った後に OpenHistoricalMap が変わった」と述べる。
- 日付の内訳（hist-borders の一致 1,391 行）: 始まりはタグがその日を述べる 877・年か月だけ 514（«1871» を 1 月 1 日と
  読む）。終わりはタグどおり 912・年か月だけ 198・タグ無し 4・**ビルドが後継の始まりに詰めた 257**（同じ Wikidata の
  次の行）・キャッシュのタグと束の日が違い理由が記録に無い 20（OHM 側の後の編集を含みうるので、カードは「◯◯ に読んだ
  タグは «…»」と読んだ日を添えて並べるだけにする）。Cliopatria の 25,736 端は、年だけ 20,822・より精密な記録に譲った
  切れ目 4,884・査読の描き戻しと合成の上端 30 で、日を述べた端は 0。
- 出自（`check:datagov`）: 3 つの索引は出版元・URL・ライセンス・帰属・取得日・周期・ビルダー・検査を**値として**持ち
  （ビルダーの `GOVERNANCE` 1 か所から頭に写す。Cliopatria は CC BY 4.0 なので `paidBy` に出典ページの行を名指す）、
  残る `integrity.rows/missing/outOfRange/duplicates`・`freshness.asOf`・`precedence.*` は `data/governance-ledger.json` に
  記録した（`--update`）。一致の測定（何行が上流行に結べたか）はこの記録の表と `--check` の出力にあり、まだ索引の値ではない。
- ⚠ 否定した見立て: 「Cliopatria の切れ目は 1 月 1 日でない端だけ」——OHM が年だけを述べる日は 1 月 1 日になるので、
  端の形からは切れ目を判定できない。上流行の FromYear と突き合わせて決めた。
- ⚠ Cliopatria の名前が査読で伏せられた行（`wn`）は `en` が空なので、初版は 313 行を「一致なし」にしていた。
  集合体（«(Holy Roman Empire)»）と構成国を区別しないと 2,172 行が「複数」になっていた。どちらも上流行の側で直した。

## 3. 史実との照合（年と場所を名指して、描かれる側を列挙）

各点で、ページと同じ合成（1886 年から CShapes→OHM-late→Cliopatria、それ以前は OHM→Cliopatria→最寄りの枚）を
組み、同じ `shapesAt` が返す両側をカードと同じ欄で読んだ。

**1914 年 6 月 15 日・バルカン**
- ルセ／ジュルジュのドナウ: CShapes «Bulgaria»(355) と «Rumania»(360)、どちらも **1913-08-10** から（CShapes の
  gwsdate）。ブカレスト条約の署名日で、史実と一致。
- ドブリチ（バザルジク）の点だけ: «Rumania»。南ドブルジャは 1913〜1940 年にルーマニア領——一致。
- メスタ川（ネストス）: «Greece» と «Bulgaria»。1913 年以後の西トラキアはブルガリア、カヴァラはギリシャ——一致。
- サンジャク: «Serbia» と «Montenegro»（1913 年にノヴィ・パザルのサンジャクを分割）——一致。Montenegro の終わり
  1915-07-01 は CShapes の値で、カードは CShapes が述べた日として出す（1915 年 6 月のシュコダル占領の後の線の変化）。

**1900 年 7 月 1 日・日本**
- 日本には陸の国境が無い（CShapes «Japan» 740 と、従属領 «Taiwan» 713・1895-04-17 下関条約は海で隔たる）。
  1900 年の日本の線は府県境で、両側は IntMap の復元（`hist-admin-recon.js`・調書 `fuken1891-changes.json`）。
- 多摩川（東京府／神奈川県）: «Tokyo Prefecture» 1898-07-24〜1907-04-01 と «Kanagawa Prefecture» 1893-04-01〜1912-04-01。
  東京府の 1898-07-24 は**南鳥島の編入**（調書 `islands`）、1907-04-01 は保谷村の編入（明治 40 年法律第 8 号）、
  神奈川県の 1893-04-01 は**三多摩の移管**（明治 26 年法律第 12 号）、1912-04-01 は多摩川の府県境画定（明治 45 年法律第 5 号）。
  八王子の点だけ: 東京府——三多摩移管の後なので一致。
- 生駒（大阪府／奈良県）: 両側とも 1891-01-01〜1943-07-01。1891 は調書の範囲の始まり、1943-07-01 は
  **「調書の範囲の終わり」と記録自身が導出だと述べており**、カードもそう出す（東京都制で記録全体を止める日）。
  奈良県の再設置（1887）は単位名 «奈良県（1887–）» が持つ。

**1600 年 7 月 1 日・西アフリカ**
- ここは Cliopatria（«Bornu Empire»・«Mali Empire»）と historical-basemaps の 1600 年の枚が描く。
- オヨ／ベニン: 枚の «Oyo» と «Benin»、どちらも BORDERPRECISION 1（概略）。カードは「日付なし——1600 年の枚の形」
  と「上流の境界精度分類: 概略」を出す。
- モシ／旧ソンガイ: 枚は «Songhai» と呼ぶが、査読（`data/hist-era-spans.json`）が **1591 年（トンディビの戦い）**で
  名前を伏せ、カードは「記録はこの形を «Songhai» と呼ぶが、その政体は 1600 年にはもう存在しない」と述べる。
  1600 年のニジェール湾曲部はトンブクトゥのパシャ領で、名前を伏せるのは史実どおり。⚠ 形は伏せられた名前のまま
  描かれており、パシャ領という主張はどの記録も述べていない——空白のまま。
- ハウサ／ボルヌ: Cliopatria «Bornu Empire»（FromYear 1579〜ToYear 1635・Seshat `ni_bornu_emp`・年だけ）と
  枚の «Hausa States»・«Bornu-Kanem»。

**2000 年 7 月 1 日・中国**
- エレンホト（中国／モンゴル）: CShapes «China» 710（1950-10-02〜）と «Mongolia» 712（1921-03-13〜）。
- ランソン（中国／ベトナム）: «China» と «Vietnam, Democratic Republic of» 816（1975-05-01〜、統一の日）。
- 黒河（アムール）: «China» と «Russia (Soviet Union)» 365（1991-12-21〜2014-03-17）。CShapes が同じ gwcode で
  ソ連とロシアを続け、2014-03-17（クリミア）で形を変える——記録の値どおり。
- マカオ（1999-12-20 返還）・香港は CShapes が国家として持たないので、2000 年に線は無い——一致。

## 4. この照合で見つかった、記録そのものの問題（直していない——依頼の範囲外で、データの変更になる）

- **1900 年の占守島（北千島）が CShapes «Russia» の中にある。** 千島は 1875 年の樺太千島交換条約から 1945 年まで
  日本領。CShapes の 1886〜1905 年のロシアの形が北千島を含んでいる（択捉は OHM-late の «Empire of Japan» が正しく描く）。
  カードはこの線の出自を正しく「CShapes の行」と述べるので、読者はそこから報告できる。
- CShapes «Korea» の併合の日が 1910-08-23（条約の署名の翌日）。韓国併合の施行は 1910-08-29。カードは CShapes の値
  として出す。
- CShapes «Japan» は 1886〜2019 年の 1 行で、1945〜1972 年の沖縄（米国の施政下）も日本の形。CShapes の規約（潜在主権）。

## 5. 検査

- 段 0: `node --test tests/border-provenance-checks.test.mjs`（9 件: 指紋・作り直された束の拒否・標本・日付の分類・
  全ての記録に文があること・1914 ルセ・ドブリチ・1900 多摩川・八王子・一致しない行に id を出さないこと・
  線のリスナが地名／道具／地図全体の持ち主に譲り、裸の線だけを 1 マイクロタスク後に取ること）。
- 段 1: `check:static`・`check:catalog`・`check:capabilities`・`check:datagov`・`check:docs`・`check:archfiles`・
  `check:i18n`・`check:histfidelity`・`check:histeras`・`check:histclio`・`check:histrecon`・
  `node scripts/build-border-provenance.mjs --check`。
- 段 2（ブラウザ・build した dist で手で確かめた）: 1914 年のドナウ（スヴィシュトフ〜ルセ）の線を押すと両側の CShapes の行・
  gwcode・gwsdate が出る／ブルガリアの国名を押すと国のカードが開き、その「この国境の根拠」が同じ検査器を開く／
  ジュルジュの町の名の上を押すと町のカードが開く（線は譲る）／1900 年の多摩川で区分線を押すと東京府・神奈川県の
  復元と OHM の «御幸村»（第 2 層）が出て、「調書を読む」が `fuken1891-changes.json` から三多摩移管・保谷・南鳥島の
  事実を出典付きで出す。
- **起動費用（`check:perf`）が上がる理由**: ① 起動グラフのモジュールが 1 つ増える（314 → 315）——`js/border-provenance.js`。
  押されるまで何もしない核（指紋・標本・登録・1 本のリスナ）で、線のクリックは起動時から存在しなければならないので
  遅延にできない。言葉・索引・調書は全部 `js/border-provenance-card.js`（押したときに読む別チャンク・29.2 kB）。
  ② `atlas-console` チャンクが約 7.8 kB 増える——`time.borderSource` の能力表の行・スキーマ・計画者が読む目録の文
  （能力は目録に書かれていなければ存在しない、`check:catalog`）。③ 索引 3 つは `js/boot-stage.js` に「押したとき（need）」と
  宣言した。⚠ 天井の更新（`node scripts/perf-budget.mjs --update`）は、この branch が origin/main より 2 commit 遅れているため
  ツール自身が拒んだ——rebase してから build し直して実行する。
  ⚠ **spec は出荷していない。** 一度書いて 2 回測ると本体 53〜59 s（並行 7 本で飽和した機械・1 起動）で、
  全体の天井（#R205 の 5,250 s）の余白は 29 s しかない。天井を上げず、クリックの裁定は Node で評価する ⑥ に移した。

> 統合列車（3 本を 1 本の PR に）での起動費用の天井の引き上げと、その内訳は `2026-10-07-place-through-time.md` §4b に記録した。

> 共有窓口（`check:surface`）: 本稿が足した window 越しの読み取りを統合列車で `node scripts/global-surface.mjs --update` に記録した——
> `js/border-provenance.js` の `_gestureOwned` が「線の押下を取ってよいか」を決めるために、地図の身振りを持ちうる他の持ち主に訊く
> `__scpPick`（比較の国選び）・`DrawTool.active()`・`IntMapIsolate.active()` と、押す範囲の幅を決める `_imTouchPrimary()`、
> `js/border-provenance-card.js` の `IntMapHistScale`（時代地図の範囲）と `IntMapSafe`（エスケープ）、`js/map-ui.js` の `IntMapSafe`。
> どれも既に同じ名前に複数の読み手がある窓口で、持ち主のモジュールはそれを export していない（`node scripts/module-graph.mjs --plan`）。
