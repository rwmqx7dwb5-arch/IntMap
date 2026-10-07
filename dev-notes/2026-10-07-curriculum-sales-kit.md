---
title: 教員の言葉（単元）から入る導入パック——単元対応表（学習指導要領 地理歴史 5 科目・イングランド KS3・C3 次元2 の 80 単元を一次資料から引用）、「この単元のツアーを作る」（既存のツアー作成を単元の地図入りで開く）、学校向けの A4 1 枚
date: 2026-10-07
newsen: New for teachers: a unit map of Japan's high-school geography and history, England's key stage 3 and the US C3 Framework, with the maps, tours and quests for each unit, and a one-page handout for schools.
newsjp: 教員向けに単元対応表を公開しました。高校の地理歴史・イングランドのキーステージ3・米国の C3 の単元ごとに使える地図・授業ツアー・クエストを並べ、学校に回せる A4 1 枚の案内も用意しました。
---

〈依頼〉第 3 波「事業・プロダクト全体の再設計」の営業担当（教育市場）。教員が「この単元でこれを使う」と即決できる導入パック:
① 単元対応表（日本：高等学校学習指導要領〔平成30年告示〕の地理総合・歴史総合・地理探究・日本史探究・世界史探究の大項目・中項目／
英国 National Curriculum KS3 の Geography・History／米国 C3 Framework の Geography・History の次元）——各単元に開ける状態
（共有 URL・レイヤー・年・場所）と既存のツアー・クエスト・ワークシート、一次資料で確かめて典拠を明記、未対応は正直に。
② 単元からツアーを即作る（既存のツアー作成に引数で渡す）。③ 管理職・情報担当に回す A4 1 枚。④ 学校・授業ページから入れる。

## 1. 作ったもの

- **`data/curriculum-units.json`**（単元の正本）: 4 文書・10 科目・80 単元。`label` は文書の文字どおり、`gloss` は IntMap の訳、
  `basis` は対応の根拠にした文書の句。対応は見本（`example`）・状態（視点＋データレイヤー、**日付なし**）・ツアー・クエストで、
  リンクは 1 本も書いていない。`gov` に出自を値で持つ（19 項目すべて述べた・`check:datagov` 緑）。
- **`scripts/curriculum-kit.mjs`**: 単元表をレジストリに照らす（`problems()`——レイヤーは `sharedIds()`、見本は `SHOWCASE`（見せない見本は不可）、
  ツアーは `TOURS`、クエストの種類はエンジン、問題数は**パネルの選択肢を読んで**）。リンクは見本の捕えたリンク・`MapState.encode`・
  `tourLink`・`questQuery`（seed＝単元キー＝クラス全員が同じ問題）。不一致があれば生成器は書かない。
- **`curriculum.html` / `ja/curriculum.html`**（`scripts/org-pages.mjs` が生成）: 単元ごとに地図・授業ツアー・挑戦リンク、
  「この単元のツアーを作る」、または「現在は未対応」。表の下に典拠（発行者・URL・閲覧日・ライセンス）。
- **「この単元のツアーを作る」**: 単元の地図を段にした自作ツアー（見本の段は見本の説明と問いを持つ）を `?tour=custom&t=…&edit=1#段1`
  にする。`js/tour-player.js` の `bootFromUrl` が `edit` を見ると再生せずに `openBuilder({ load })`（「このツアーを編集」と同じ経路・
  同じ変換 `builderLoad`）へ渡し、クエリを消す。**新しい作成器は無い**。
- **`school-handout.html` / `ja/`**: 費用・生徒のアカウント不要・端末・WebGL・インストール不要・プライバシー・3 ステップ・アドレス。
  事実はすべて他のページの文（`TEXT.common.price`・`TEXT.schools`・`TEXT.security` の解析の文を `index.html` の
  `INTMAP_ANALYTICS` で選ぶ——セキュリティページと同じ選び方）と持ち主の数（レイヤー数・時計の床・記載した接続先の数）。
- **入口**: `for-schools.html` の「授業での使い方」に単元対応表と 1 枚の案内、`teachers.html` の「高等学校学習指導要領との対応」に
  単元対応表、全ページの足元に 2 つ。

## 2. 一次資料の確かめ方（2026-10-07）

| 文書 | 取得 | sha256（先頭） |
|---|---|---|
| 文部科学省「高等学校学習指導要領（平成30年告示）」PDF（3,707,108 B） | mext.go.jp から直接 | `59ef17a8…` |
| DfE「Geography programmes of study: key stage 3」（DFE-00193-2013） | gov.uk の公開ページから PDF | `74bdc613…` |
| DfE「History programmes of study: key stage 3」（DFE-00194-2013） | 同上 | `9048c2a7…` |
| NCSS「C3 Framework」rev0617 PDF | socialstudies.org は **403**（ボット遮断）。Internet Archive の 2024-12-19 の保存版で読み、ページに「保存版で閲覧」と書く | `8239d89b…` |

`pdftotext` で本文を取り出し、**単元表の `label`・`basis`・群の見出し 142 件すべてが本文に文字どおりあることを機械で照合**した
（空白と欄外の「地理歴史」を除いて比較。C3 は表組みなので `-raw` で取り出した）。0 件の不一致。英国の撇号は文書どおり U+2019。
ライセンス: MEXT は政府標準利用規約（第2.0版・CC BY 4.0 互換。サイトの利用規約ページで確認）、DfE は Open Government Licence
（PDF の末尾）、C3 は「本文と抜粋は自由に複製してよい」（PDF の表紙裏）。前 2 者は表示が条件なので `DATA_SOURCES` に行を足し、
単元表の `paidBy` がその行を値で名指す。

⚠ C3 の単位は次元2 の 4＋4 区分（指標番号 `D2.Geo.1-3` などは区分の範囲を IntMap が書いたもの）。英国 KS3 は法定の箇条
（角括弧の例示は法的な必修ではない、と文書自身が書く）。

## 3. 対応できた単元／未対応の単元——次の商品開発の入力

**80 単元中 39 単元に対応、41 単元は未対応。**

| 科目 | 対応 | 未対応 |
|---|---|---|
| 地理総合（必履修） | 4/5 | Ｃ（2）生活圏の調査と地域の展望 |
| 地理探究 | 7/8 | Ｂ（2）現代世界の諸地域 |
| 歴史総合（必履修） | 3/14 | Ａ（1）（2）、Ｂ（1）（2）（4）、Ｃ（1）（3）（4）、Ｄ（1）（3）（4） |
| 日本史探究 | 3/13 | Ａ（1）（2）（3）、Ｂ（1）（2）、Ｃ（1）（2）（3）、Ｄ（2）（4） |
| 世界史探究 | 8/16 | Ａ（1）（2）、Ｂ（1）、Ｃ（1）（3）、Ｄ（1）（2）、Ｅ（4） |
| KS3 地理 | 7/9 | Ordnance Survey の地図の読図、野外調査 |
| KS3 歴史 | 2/7 | 中世ブリテン 1066-1509、1509-1745、1745-1901、地域史、1066 年以前からのテーマ |
| C3 地理 | 4/4 | — |
| C3 歴史 | 1/4 | Perspectives、Historical Sources and Evidence、Causation and Argumentation |

読み取れること（提案であって未実行）:
- **歴史総合（必履修＝全国の高校生）の対応が 3/14 で最も薄い。** 埋まらない理由は地図ではなく**検査済みの見本・ツアーが無い**こと:
  時代の地図そのもの（紀元前 123,000 年〜）はあるが、単元表は日付つきの新しい状態を書かない（下の §4）。最も効くのは
  「結び付く世界と日本の開国」（1850 年代の東アジア）・「経済危機と第二次世界大戦」・「世界秩序の変容と日本」（冷戦の終結 1989–1991）
  の**授業ツアー**を `drawn` つきで足すこと。第二次世界大戦は見本 `ww2-1942` が戦争層と共有リンクの時計の競合で**見せない**
  ままなので（`js/showcase.js` の `withheld`）、それを直すと歴史総合 Ｃ（3）と世界史探究 Ｄ（4）が同時に埋まる。
- **日本史探究は古代〜近世が全滅。** 令制国は #R730 で 1871-08-29 までの期間に正されたので、奈良時代・江戸時代の日本の見本／ツアーを
  `hist-fidelity --year` で列挙してから作れば A・B・C が埋まる。
- 「問い」の中項目（Ｂ（1）・Ｃ（1）・Ｄ（1）など）と「歴史資料」の中項目は、地図の状態ではなく**資料と問いの型**が要る——出典つきの
  境界（各地物が出典を持つ）を資料として読む授業ツアーの型があれば対応できる。
- KS3 の英国史 3 期と地域史、C3 の Perspectives/Sources/Causation も同じ形。

## 4. 判断と実測

- **歴史の単元は検査済みの主張だけで答える。** 日付つきの地図は、その日の記録に照らして `drawn` が検査された見本とツアーだけを
  使い、単元表に新しい日付つきの状態を書かなかった（`.agents/rules/historical-verification.md`——年と場所を名指して列挙し制度と
  突き合わせる作業をこの回で 41 単元ぶん行うより、未対応と書くほうが正直）。状態は日付なしのデータレイヤーだけ。
- **状態 14 個はビルドしたアプリで開いて確かめた**（ハーメチックなネットワーク・共有リンクの復元・`window.__imLayerPainted`）。
  14 層すべて点いて地図に載った。「主な作物の産地」（`wp-dl-crops`）だけは載らなかった——データが GAEZ への生の要求で、
  ハーメチックでは拒まれる（パネルに「GAEZ から取得できませんでした」）。**検査で除外せず、単元表から外した。**
- この確認を spec に残すと 15 秒かかり、全体の上限（87.5 分）を 0.2 分超えた（`check:testbudget`）。時間は減らすことしか
  できないので、spec は「作成器が単元の段で開く」「案内が A4 1 枚に印刷される」の 2 つ（7 秒）にし、状態の確認はこの記録と
  node の検査（全リンクをアプリの読み手で読み戻す・レイヤーは共有リンクが運ぶデータレイヤー）に置いた。全体は 87.47 分
  （5,248 秒）で上限ちょうど——**次の spec は自分の時間を払う必要がある**（並行の第 3 波で spec を足す担当がいれば統合時に超える）。
- **上の帯に 2 つを足さなかった。** 実測（1280〜1680 px）: 英語の帯は 8 つのリンクで余りが 68 px、足す 2 つは 264 px。帯は
  `justify-content:flex-end` のまま溢れると**先頭のリンクがロゴの下に隠れる**（「報道機関」の「報道」が消えた画面写真で確認）。
  ⇒ `ORG_NAV` に `{ bar: false }` を足し、帯から外したページは組織向けページの足元に並べる（紹介ページの足元は元から全 `ORG_NAV`）。
- **「この単元のツアーを作る」の `t` は素の `j` 書式。** `packText` に `{ plain:true }` を足した。DEFLATE の出力は zlib のビルド
  （SIMD のハッシュの有無）で変わりうるので、`--check` がバイト一致で守るページに `z` を書くとページが機械の関数になる。
  読み手は両方を読む（`decodeCustomTour` で往復を検査）。最長は地理総合 Ｂ（1）の 2,798 B で、上限 8,192 B に収まる。
- `js/showcase.js` の `CURRICULUM`（見本のカードが名指す 5 見出し）と単元表は同じ見出しを 2 か所で持つ。検査が同じ文字であることと、
  その見出しを宣言した見本・ツアーがすべて対応する単元に入っていることを測る（写しの片方だけ直る、を防ぐ）。
- `teachers.html` の学習指導要領の URL は単元表の `mext-2018` から読むようにした（同じ URL の 2 か所目を消した）。

## 5. 検査

- `node --test tests/curriculum-sales-kit-checks.test.mjs`（7 件）緑。
- `npx playwright test tests/curriculum-sales-kit.spec.js`（ビルド済み dist・2 件）緑。
- 触った主題のゲート: `check:static`・`check:types`・`check:engine`・`check:i18n`・`check:archfiles`・`check:surface`・
  `check:docs`・`check:datagov`（新しい束を一時インデックスで追跡させて実行）・`check:testbudget` 緑。
- 関連の node 検査 17 本（sales-channels・teachers-and-entrances・press-room・community-next・security-next・sales-next・
  classroom-tours・guide-unify・map-document-unify・tour-builder・landing-showcase・generated-file-merge-driver・learn-quests・
  data-studio・marketing-next・data-sources-page・licence-stated-once）126 件緑。横断 7 本 96 件緑。
- spec を足したので `docs/TESTING.md`・`docs/FILES.md`・`package.json`・`scripts/worktree.mjs` の段の件数（deep 150・全体 155）と
  `tests/durations.json`（7 秒）を更新。
