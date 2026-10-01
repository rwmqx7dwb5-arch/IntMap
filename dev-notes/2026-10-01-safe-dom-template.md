---
title: DOM への書き込みを機械で閉じる——落ちる場所で escape するタグ IntMapSafe.markup（html``）を足し、output-taint の門がタグ・trusted()・追跡された全 *.html の inline script を読むように。js/data-layers.js・js/stats-compare.js・admin.html の未判定 62 葉を 0 に（全体 441 → 379）、国の hover tooltip 3 か所で国名が生のまま innerHTML に入っていたのを直した
date: 2026-10-01
---

〈依頼〉js/ と admin.html の innerHTML / insertAdjacentHTML / outerHTML への代入（約 602 か所）は、外部データを `IntMapSafe.html/.url` に通すかどうかが人の注意に依存している。⑴ 補間値を既定で escape するタグ付きテンプレート `html``…``` を js/safe-html.js に足す ⑵ 代入の右辺を分類して未証明の件数をファイルごとに数え、下向きにだけ動く台帳で固める門を `check:static` の規則として足す（母集合は追跡された js/**/*.js と *.html を発見）⑶ js/data-layers.js・js/stats-compare.js・admin.html を移行して台帳を下げる。表示を変えないこと、見つけた未 escape の外部データを列挙すること。

## 0. 測った——門は**もう在った**

着手前に `scripts/` を読んで分かったこと: 依頼の ⑵ は `scripts/output-taint.mjs`（`check:static` の `output-taint` 規則・台帳 `tests/output-taint-baseline.json`・両方向の ratchet）が**既に実装していた**。しかも依頼の (a)〜(d) の分類（文字列リテラルだけ／タグ経由／IntMapSafe 経由だけ／それ以外）より細かく、値を「葉」に割って、同じファイルの組み立て関数・局所 helper の呼び手・注入された `esc` まで辿ってから判定する。

⇒ 2 つ目の分類器と 2 つ目の台帳は作らなかった（`.agents/rules/no-ad-hoc-hardcoding.md` §2-3「同じ判断を既に持っている場所を先に探す。あれば配る。写さない」）。足したのは**既存の門に欠けていたもの**だけ:

| 欠けていたもの | 実測 | 足したもの |
|---|---|---|
| タグを知らない | — | `IntMapSafe.markup` で印を付けたテンプレートは何を差し込んでも安全、と読む |
| `*.html` を読まない | admin.html は sink 31 か所・未判定 8 葉が**門の外** | 追跡された全 `*.html`（`git ls-files`）の inline script を母集合に |
| 「マークアップとして信頼する」口が無い | — | `IntMapSafe.trusted(x)` の呼び出しを、書かれた場所で x によって判定する |
| 実行時に拒否されるテンプレートを事前に知らない | — | タグ自身の `plan` を全タグ付きテンプレートの静的文面に走らせる |

母集合（同じ道具・同じ木で前後を測った。前 = HEAD の 3 ファイル＋今回の母集合）:

| | 前 | 後 |
|---|---:|---:|
| sink（`trusted()` を含む） | 629 | 633 |
| 未判定の葉を持つ sink | 232 | **197** |
| 未判定の葉 | 441 | **379** |
| うち js/ だけ（台帳の旧母集合） | 224 sink / 433 葉 | 197 / 379 |
| js/data-layers.js | 17 sink / 40 葉 | **0** |
| js/stats-compare.js | 10 sink / 14 葉 | **0** |
| admin.html | 8 sink / 8 葉（門の外） | **0** |

## 1. タグ（js/safe-html.js `IntMapSafe.markup`、各ファイルでは `html` と別名）

- **落ちる場所はテンプレートの静的な文面から読む**（テンプレートごとに 1 回、strings 配列に cache）。テキスト・引用符つき属性値 → `html()`、引用符つき `href`/`src`/`action`/… の**先頭**の値 → `url(v,{allowData:true})`（先頭が scheme を決める。固定の接頭辞の後ろは属性値）、属性と属性のあいだ → 裸の属性名だけ（`<option${sel?' selected':''}>` の形）。
- **拒否する**（初回使用時の `TypeError`）: タグ名・属性名・引用符の無い値・`on*` 属性（ブラウザは実行前に実体参照を戻すので escape は守らない）・`<script>`/`<style>` の中・コメント・タグの途中で終わるテンプレート。
- 戻り値は**マークアップ値**（閉じた class のインスタンス。外部データの JSON は偽造できない）。マークアップ値は別のテンプレートへそのまま入り、二重 escape しない。属性値の位置では引用符だけ符号化する。`null`/`undefined` は空、配列は要素ごとに同じ規則で連結。
- `IntMapSafe.trusted(x)` がタグの作っていないマークアップを入れる唯一の口。stats-compare / data-layers では `IntMapSafe.flag`（旧国家の旗画像を 1 か所で判別する既存の読み手）の答えだけに使った。
- ⚠ **依頼は「ESM export」だったが、export にはしなかった。** js/safe-html.js は sources.html と admin.html が `<script src>`（classic）で読むので `export` は構文エラーになる。既存の契約どおり、Node でも `import '../js/safe-html.js'` して `globalThis.IntMapSafe` を読めば純関数として検査できる（検査はそうしている）。

## 2. 門（scripts/output-taint.mjs・規則名 `output-taint`。新しい `check:*` は足していない）

- `IntMapSafe.markup`（とその `const` の別名）でタグ付けしたテンプレートは安全。`trusted(x)` は kind `trusted` の擬似 sink として x の葉を数える——結果がそのファイルの sink に届くかどうかに関係なく。`trusted` を呼ばずに参照する箇所（別名・コールバック）は、それ自体を葉 1 つと数える（何を渡されるか隠すから）。
- `templateProblems()`: タグ付きテンプレート全部の cooked 文面に `IntMapSafe.markup.plan` を走らせ、拒否されるものを `check()` の行にする。plan は js/safe-html.js から import した本物で、写しではない。
- ページ: `discoverPages()` が `git ls-files -- '*.html'` で発見（一覧を書かない。列挙できなければ門の失敗で、空の母集合にはしない）。inline script の切り出しは `scripts/safe-output.mjs` の `inlineScripts` を export して**両規則で共有**。
- ⚠ **共有した読み手に欠陥があった。** `inlineScripts`（旧 safe-output の内側の正規表現）は HTML コメントを飛ばさず、index.html の「the `<script>` is inserted」という註から次の `</script>` までを 1 ブロックとして読んでいた——**本物の Clarity ローダのブロックは読まれていなかった**（output-taint が parse 失敗として報告して判明。safe-output 側は例外を握りつぶしていた）。`codeOnly(html,{lang:'html',offsets:true})` でコメントを先に空白化（行番号は動かない）。手書きの置換は `comment-stripper` 規則に正しく落とされた。
- `scripts/safe-output.mjs` の `rawUrlAttr`: タグ付きテンプレートの href/src は数えない（タグが `url()` を通し、引用符無しは拒否する）。タグ無しの同じテンプレートは今までどおり数える。

## 3. 移行（表示を変えない）

- **組み立て関数はマークアップ値を返し、受け手も `html`` ` に入れる。** `+` で連結すると文字列に戻り、次のテンプレートでテキストとして escape される（`&lt;b&gt;` が画面に出る）——これがこの移行の唯一の危険で、門からは見えない（安全側の誤りだから）。だから検査は組み立て関数を**評価**して「出力に escape されたタグが無い」ことを測る。
- 静的な部分をバイト単位で保つため、長い連結は `html`${[html`…`, html`…`]}`` の配列にした（改行入りのテンプレートにすると要素間に空白ノードが増える）。
- js/stats-compare.js: `mChart`・tooltip・`secHtml`（詳細ボタンを隠すのは、完成した文字列への `.replace('scp-focus', …)` ではなく引数 `hideFocus` で属性を書く）・`fmtSigned`・`barsHtml`・`barBlockHtml`・`blockHtml`・年の選択肢・期間・フォーカス表示・時間旅行の帯・ピボット表。CSV は `String()` してタグを剥がすので変わらない。
- js/data-layers.js: 凡例（汎用・EEZ・海面・ケッペン・不透明度・NATO/EU の年）・`_legendDesc`・`yearKeyHTML`・`_dateBoxHTML`（属性を**文字列で差し込む**引数 `inputAttrs` を `{cls, style}` の値に）・レイヤー行・切替ボタン。山形の矢印 2 つは `html`` ` の定数。`window._legendDescHTML` 経由の `insertAdjacentHTML` は `html`${dh}`` で包む（マークアップ値ならそのまま、それ以外は escape）。
- admin.html: ニュースの出来事カード・コミュニティ 3 表・geo pin・ダッシュボード・モーダル。モーダルの `list="…"` は属性を文字列で差し込んでいたので、挿入後に `setAttribute('list', …)` へ（DOM は同じ）。
- **同値性を実測した**: 旧（HEAD）と新の組み立て関数を同じスタブで評価して出力を比べた（使い捨ての照合。リポジトリには入れていない）。stats-compare 264 比較で**バイト一致**（旗画像・`&`・`<`・引用符を含む国名を含めて）。data-layers 47 比較で、違いは ⑴ わざと入れた敵対的な値が escape されるようになった所 ⑵ 旧が生で出していた `& ` と `< `（ブラウザは文字として表示する）が `&amp;`・`&lt;` になった所——**表示は同じ**。
- i18n: `secHtml` の「詳細」2 つ（title と本文）を 1 つの変数にまとめたら、`check:i18n` が de/es/ru で「位置引数の L(…) 行が 1 つ減った」と落とした（訳が消えたのではなく呼び出しが 1 つ減った）。床を下げずに 2 つの呼び出しに戻した。

## 4. 見つけた、生のまま入っていた外部データ

- **js/data-layers.js の国の hover tooltip 3 か所**（コロプレス・NATO・EU）が `cName(s)`——Natural Earth / 歴史の束（OpenHistoricalMap 由来の名前を含む）の国名——を `window.setMapTooltipHTML` に生のまま渡していた。`setMapTooltipHTML`（js/map-tooltip.js）は引数を `innerHTML` に入れる関数で、**門からは別モジュールの葉 1 つにしか見えず、呼び手が渡す文字列は測られていなかった**。タグで組み、tooltip の「前回と同じ文字列なら書かない」比較のために sink の手前で `String()` する。⚠ 同じ形（引数を sink に渡す別モジュールの関数）は他にもあり、門の残っている盲点として docs/SECURITY-ARCHITECTURE.md と章 17 に書いた。
- 未 escape だったが外部データではなかったもの（記録だけ）: admin.html の `article_count`・`independent_source_count`・`cluster_confidence`・`assignment_score`（DB の integer / real 列）と各 `id`・`lng`/`lat`、stats-compare の出典ラベル `x.e.src`（自前の 'IMF' 等）と `data-m` から戻した色。

## 5. 検査

- `node --test tests/safe-dom-template-checks.test.mjs` — 15 件: タグの配置規則（テキスト・属性・URL の先頭・裸の属性名・配列・null）と拒否 9 形、門の読み方（タグ・`trusted`・別名・拒否テンプレート・ページの母集合）、台帳の一致と 3 ファイルそれぞれで移行済みの sink を 1 つ生に戻すと赤（メモリ上の変異。作業木は書かない）、移行した組み立て関数の**評価**（escape されたタグが出ないこと・旗が画像のまま）、safe-output の href 規則とコメントを越えた inline script の読み取り。
- `npm run check:static`・`check:engine`・`check:types`・`check:i18n`・`check:docs` 緑。
- 3 ファイル・safe-html・両門を名指す既存の node 検査 136 本（1,827 件）: 1,826 緑、1 件赤——`tests/data-subcables-checks.test.mjs`「#R384 ② the note lives INSIDE the .dl-desc block」が `_legendDesc` の戻り値を**綴り** `return '<div class="dl-desc">'+desc+note+'</div>';` で固定している。守っている事実（註は `.dl-desc` の内側）は変わっておらず、新しい綴りは ``return html`<div class="dl-desc">${desc}${note}</div>`;``。`tests/output-taint-baseline.json` は `--update` で 433 → 379（admin.html・ページを含む母集合で）。

## 起動費の天井を上げた理由

`check:perf` の eager.gzip が天井 1493.9 kB を帯（7.5 kB）を超えて上回った（この変更で 1501.5 kB）。同じ worktree で変更を退けて build すると天井内に収まったので、増分はこの変更のもの——タグ（`IntMapSafe.markup`・`trusted`・`isMarkup`）と、それを使う `data-layers.js`・`stats-compare.js` の組み立てが起動時に読まれる。DOM への書き込みを機械で閉じる仕組みは起動直後から要る（国の hover tooltip は最初の操作で使われる）ので遅延読み込みにはせず、`node scripts/perf-budget.mjs --update` で超えた行だけを上げた。
