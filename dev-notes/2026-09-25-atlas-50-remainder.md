---
title: Atlas 46 問（#R802）の「見て、残した」6 件のうち 5 件を根で直した——確定する扉が候補の先頭行を答えにしていた
date: 2026-09-25
pr: 732
---

〈利用者「全てやって」。#R802 §10 に「直していないもの」として残した項目。#R802 と同じく、到達した綴りではなく
元の欠陥を検査に書いた（`tests/atlas-50-remainder-checks.test.mjs` 9 件）〉

## 1. 「使用データ」行が、答えに使っていない証拠を並べていた

`js/atlas-console.js` の `usedNames` は、`analyze` が**プロンプトへ積んだ**データブロックの札を列挙していた
——湖の面積の問いにも台風の問いにも「地震」が出た理由。回答の claim が根拠を ID で申告する仕組み
（`evidenceIds`）は既にあったが、**データブロックには申告に使える ID が無かった**。
⇒ `js/atlas-evidence.js` の `addDataBlock` が各ブロックを証拠レコードにし（`d1, d2…`。ニュースの `e` 番号は
動かさない）、見出しに ID を書き、行は `js/atlas-answer-render.js` の `citedRecords` が**表示された文が引用した
レコード**（`basedOn` の先も）から作る。判定はモデルの申告であってコードの推測ではない。

## 2. ⚠⚠⚠ `Pacific` → Pacifica——確定する扉が、検索欄の「候補」の先頭行を答えにしていた

`js/atlas-geo-resolve.js` の `geocode` は、検索欄用のあいまい照合 `localFuzzyPlaces`（前方一致・部分一致・
綴り違い許容）の**先頭行を、規則に通す前に返していた**。実データで再現: `Pacific` → Pacifica（前方一致）、
`大西洋` → Atlantic City（中国語名「大西洋城」が問いを含む）。**海洋を訊かれて町を答えていた**。
⇒ 照合器が各行について「その行自身の名前が問いと完全に同じか」を `exact` で申告し、確定する扉は
**完全一致の行しか取らない**。それ以外は Nominatim へ進み、Nominatim は種類を自分で申告する
（`大西洋`・`太平洋`・`Pacific Ocean` は海洋として解決）。海洋・大陸の一覧も「太平洋」の特例も書いていない。
⚠ **残る**: 裸の「Pacific」は Pacific County（完全一致の同名地）になる。Nominatim も Open-Meteo も
「Pacific」という名の海洋を返さない（2026-09-25 実測）——この 1 語だけでは種類が決まらない。

## 3. 「現在地」が `view.locate` に届かなかった

能力検索（`js/atlas-capabilities.js` の `scoreParts`）が英語の綴りしか見ず、「現在地」は本文からの 3 点だけで
`navigation.camera` と `routing.isochrone` に負けていた。**穴は「説明が無い」ではなく「順位で負ける」**だったので、
#R802 ㉓ の未記述の数（62）は変わらない。⇒ 製品が 9 言語で既に持つ居場所の言い回しの表（`SELFLOC_WORDS`）を
`placeRules.selfLocWords` として 1 か所に置き、地名解決と能力検索（`js/atlas-catalog-text.js` の `phrases`）が
同じオブジェクトを読む（訳語は 1 件も足していない）。検査は**順位**を測る。

## 4. 言い換えた同じ線が 4 本重なった——同一性が引数の綴りだけだった

`js/atlas-agent.js` の同一判定は `callKey`（引数の文字列）だけで、結果が名乗る `meta.resultKey` が Atlas に
届いていなかった。⇒ `drawLine` / `drawPolygon` が**形状**から `resultKey` を名乗り（線は向きを問わない）、
`js/atlas-toolsurface.js` がそれを結果に載せ、2 回目以降は「もう済んでいる、地図には 1 本だけ」と名指す。
**拒否せず、上限も変えない**（`.agents/rules/one-pass-or-a-reason.md` §1 の形）。呼び出しは実行するので
ラベルや色の変更は反映され、作品の改訂は後継であって反復に数えない。
⚠ **残る**: `research.analyze` の言い換えが同じ問いかは意味の判断で、コードは決めない（`resultKey` を持たない）。

## 5. 「ローマ帝国」が見つからなかった——現代の地名表にしか訊いていなかった

時計を 117 年にしていても `⚠ 地名が見つかりません`。地図はその下でローマ帝国を描いていた。
⇒ `_histPolity`: **Chronos が過去を表示している間だけ**、画面上の記録（`IntMapTimeBorders.currentFC()`・各地物の
`_i18n` は `data/histnames.json` 由来）に**名前の完全一致**で訊く。政体の一覧は書いていない。現在時刻では
何も答えない（その記録は効力を持たない——`.agents/rules/historical-verification.md` §1）。

## 6. 英語の質問にドイツ語で答えた経路は実在した

`js/atlas-console.js` の `_replyLang` はドイツ語→スペイン語→…→英語の順に調べ、**最初に 1 語でも当たった言語**を
返していた。「Show Los Angeles on the map」はスペイン語、「…in Zürich」「Why did the dinosaurs die out?」は
ドイツ語。⇒ 同じ語リストのまま**各言語の当たりを数えて最多**、同点は UI の言語。⚠ #R802 の 1/46 がこの
経路だったかは再現手順が無いので確定できない。

## 7. ⚠⚠⚠ この回の片付けで、原本の `node_modules` を壊した（復旧済み）

依頼の一部（worktree 54 本の片付け）で、リンクを先に外すつもりの `cmd /c dir /s /b /aL` が **junction の向こう**
（原本の `node_modules`）まで列挙し、必須パッケージ 45 個とパッケージ内のファイル（`acorn/dist/acorn.mjs` ほか）が
消えた。全 worktree が junction で共有しているので、その間（2026-09-25 04:45〜05:10 頃）は**全セッションの
build とテストが環境要因で落ちえた**。原本で `npm ci` を走らせて復旧（lock の全 262 パッケージの中身が揃う・
`package-lock.json` 不変）。⚠ 最初の確認は `package.json` の有無だけを見ていて**ファイル単位の欠損を見逃した**
——build が `ERR_MODULE_NOT_FOUND` を出して気づいた。恒久の手順は `docs/AGENT-SETUP.md` §5.1
（リンクは `lstat` で見てリンクそのものだけ外す／OneDrive 配下のファイルは reparse point 属性を持つので
「reparse point か」でリンクを判定しない）。
⚠ 同じ片付けで、別セッションが数分前に作った worktree 5 本（R807〜R811）が削除リストに入っていた——
走査は調査時点の写真で、実行時には古かった。途中で止めて**5 本とも無傷**。消えたのは merge 済みラウンドの
未登録の残骸と、main に全部入っている worktree だけ（main に無い 3 件はパッチを
`%LOCALAPPDATA%\IntMap-worktree-archive\2026-09-25\` に退避し、R513 の A/B は branch `archive/r513-maplibre6-ab`）。

## 8. 触った門

`check:catalog` `check:capabilities` `check:atlasrepeat` `check:static` `check:i18n` `check:engine`
`check:surface` `check:docs` `check:perf`（build して within budget）＋ 触ったモジュールを読む既存テスト 171 本。
`tests/r760 ⑥` は `meta` の**最後のメンバーが `painted` であること**まで綴りで固定していたので「宣言がある」
事実へ付け替え、`tests/r733 ②` のスタブ行に照合器自身の申告 `exact: true` を足した。
同時期に着地した `tests/atlas-semantic-search-checks.test.mjs` の ① と ③ は「綴りだけでは「現在地」が view.locate に届かない」を欠陥の例に使い、自分で「綴りが届くようになったら ① を書き直せ」と述べていた——この回の §3 でそれが起きたので、意味の半分が要る例を**製品のどの表にも無い言い方**（「地図を今日に戻して」→ `time.travel`）に替えた（同じ性質を測る。閾値は変えていない）。

## 9. 残っていること

- 裸の「Pacific」（§2）・`research.analyze` の言い換え（§4）。
- ニュースの証拠 ID が 2 系統ある（NEWS EVIDENCE ブロックの `[eN]` は日付順、レジストリの `eN` は取得順）。既存の不整合。
- 「現在地の天気」が `data.weather` に届かない（探索中に見つけた。この回の範囲外）。
- #R802 の残り 12 問は、この回が本番に出たあとに投げる（本番の Atlas はログインが要る）。
