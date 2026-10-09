# IntMap — 外へ出す文の下書き（承認待ち・未送信）(Outreach drafts)

> ⚠ **ここにある文は 1 通も送っていない。** 外部への発信（投稿・掲載申請・営業メールの初回送信）は、その都度
> 運営者の確認を取ってから（[営業の手引き](README.md)「1. 守ること」の 5、`PRODUCT.md` §2.4）。送ったら、送った日・宛先・
> 文を `admin-inquiries.html` のパイプラインに 1 件起こし、この表の「状態」を書き換える。
> 文は en + jp（`CONSTITUTION.md` §7）。絵文字は使わない。数字・機能は公開ページと同じ正本から取り、ここで増やさない。
> ⚠ 送る前に、文中の地図リンクを**実際に開いて**、描かれるものを年と場所を名指して確かめる
> （`.agents/rules/historical-verification.md`）。

| # | 読者 | 何を売るか | 経路の候補（未連絡） | 状態 |
|---|---|---|---|---|
| 1 | 報道機関のグラフィック・調査報道の班 | 引用タブ（出典表記）と、ある日の国境の GeoJSON | 相談フォームに来た報道機関への返信、運営者が選んだ報道機関の窓口 | 下書き |
| 2 | 歴史学・政治学・デジタル人文学の研究者 | 参考文献 5 形式と、形ごとに出典つきの国境データ | 運営者が選んだ学会・メーリングリスト・研究者 | 下書き |
| 3 | 地図・データ可視化の開発者 | オープンデータ `api/v1/`・埋め込み API・国境の GeoJSON | 運営者が選んだ開発者向けの掲示板・ニュースレター | 下書き |

---

## 1. 報道機関へ（返信・紹介文）

**件名（en）**: Historical borders for your graphics desk — with the source of every line
**件名（jp）**: 記事の地図に、線 1 本ごとの出典を

**本文（en）**

> IntMap is a free space-time atlas of the Earth: one map for the present and for any date in the past, with the
> source of every border stated line by line.
>
> Two things in it are made for a newsroom. First, the Cite tab under Share writes the credit line to put under a
> published map — the date it shows, the link that reopens it, and every source drawn on it. Second, while the map
> shows a past date, the same tab saves that day's borders as GeoJSON for QGIS, Datawrapper or Flourish. Each shape
> carries the record it came from, its dates and who stated them, and its licence; shapes whose terms are
> non-commercial are left out, and the file says which and where to get them. Press any border on the map to see
> its record — the checking a fact-check needs.
>
> There is no fee. An example: {地図のリンク — 送る前に開いて確かめる}

**本文（jp）**

> IntMap は無料の「地球の時空間アトラス」です。いまの世界も、過去のどの日付の世界も 1 枚の地図で見られ、
> 国境は線 1 本ごとに出典を示しています。
>
> 報道の仕事のために 2 つの機能があります。1 つは「共有」の「引用」タブで、掲載する地図の下に入れる出典表記
> （地図が示す日付・その表示を開き直すリンク・描かれているすべての出典）を作ります。もう 1 つは、地図が過去の
> 日付を示しているとき、同じタブからその日の国境を GeoJSON で保存でき、QGIS・Datawrapper・Flourish で使えることです。
> 形ごとに元の記録・日付とそれを誰が述べたか・ライセンスが付き、非営利に限られた条件の形は含めず、何を除いたかと
> 入手先をファイルに書きます。地図上のどの国境線も、押せば根拠の記録が分かります（ファクトチェックの裏付け）。
>
> 料金はかかりません。見本: {地図のリンク — 送る前に開いて確かめる}

---

## 2. 研究者へ（紹介文）

**件名（en）**: Borders on any date as cited GeoJSON — and a reference for the map view
**件名（jp）**: 任意の日付の国境を、出典つきの GeoJSON で

**本文（en）**

> IntMap draws the world's borders on any date, composed from published records — OpenHistoricalMap (day by day,
> 1689–1885), Seshat's Cliopatria, CShapes 2.0 and historical-basemaps — and states the source of every line.
>
> For a paper: the Cite tab under Share gives the view as a reference in APA, Chicago, SIST 02, BibTeX or RIS, and
> the citation each record's publisher asks for. While a past date is shown, it saves that day's borders as GeoJSON:
> every feature names its record and row, its start and end and who stated them (the record itself, a year read as
> its first day, or a date the build derived and why), its OpenHistoricalMap relation, Wikidata and Seshat
> identifiers, and its licence. Terms are applied row by row from the open-data catalogue; CShapes 2.0 is
> non-commercial and is not redistributed by IntMap — the file counts those shapes and points to ETH Zürich.
>
> Free, no account. The developers page describes the open data: {developers.html の URL}

**本文（jp）**

> IntMap は、出版された記録——OpenHistoricalMap（1689〜1885 年・日単位）、Seshat の Cliopatria、CShapes 2.0、
> historical-basemaps——を組み合わせて任意の日付の世界の国境を描き、線ごとの出典を示します。
>
> 論文のために: 「共有」の「引用」タブが、表示を APA・Chicago・SIST 02・BibTeX・RIS の参考文献にし、各記録の出版元が
> 求める引用文を添えます。過去の日付を表示しているときは、その日の国境を GeoJSON で保存できます。各地物は、
> 記録と行・始まりと終わりとそれを誰が述べたか（記録そのもの／年だけの記述を初日として読んだもの／ビルドが
> 導いた日付とその理由）・OpenHistoricalMap のリレーション・Wikidata・Seshat の識別子・ライセンスを持ちます。
> 条件はオープンデータのカタログから行ごとに当てます。CShapes 2.0 は非営利の条件のため IntMap からは再配布せず、
> ファイルが件数と ETH Zürich の入手先を示します。
>
> 無料・アカウント不要。オープンデータの説明: {developers.html の URL}

---

## 3. 開発者へ（短い紹介）

**en**

> IntMap's open data is plain JSON next to the map, with no key: a catalogue that states each dataset's licence and
> what it asks of you (api/v1/catalog.json), per-country files, and an embed API that lets your page set an embedded
> map's date and place and hear where the reader took it. Historical borders of any drawn date can be saved as
> GeoJSON, each feature with its record and licence. {developers.html の URL}

**jp**

> IntMap のオープンデータは、地図と同じサイトに置かれたキー不要の JSON です。データセットごとのライセンスと
> その条件を述べるカタログ（api/v1/catalog.json）、国ごとのファイル、埋め込んだ地図の日付と場所をページから
> 動かし読者の操作を受け取れる埋め込み API があります。描かれている日付の国境は、地物ごとに記録とライセンスを
> 持つ GeoJSON で保存できます。{developers.html の URL}

---

## 送る前の確認（毎回）

1. 文中の地図を開き、年と場所を名指して描かれるものを確かめた（何が出典で、何が除かれるか）
2. 料金・稼働・導入実績について、[`pricing.md`](pricing.md) と[営業の手引き](README.md)「1. 守ること」にない約束をしていない
3. 宛先と経路を運営者が承認した（承認の日付を表に書く）
