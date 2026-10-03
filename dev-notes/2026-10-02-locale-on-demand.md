---
title: 言語の束は読者の 1 言語ぶんしか起動時に読まれていなかった——それを守る者が居なかったので check:perf が名指すようにし、locale の取得失敗を理由つきで読者に言い、失敗をキャッシュしないようにした
date: 2026-10-02
newsen: Only your own language is downloaded at start-up, and a language that fails to load now says so.
newsjp: 起動時に読むのは読者の言語だけになり、言語の読み込みに失敗したときはその旨を表示します。
---

〈依頼〉「構造改革とイノベーション。保守ではなく改革。……引き算ではなく足し算。固執ではなく保全」——
言語を消さずに配り方を作り替える。読者の言語の束だけを起動時に読み、他は切替時に遅延 import。
起動時に読者の言語以外の locale を読んだら赤。切替は束の到着を待ってから適用し、失敗したら理由を出す。

## 0. 測った（実装の前に）

`npm run build` の `.perf/build-report.json` と、`dist/` を配った実ブラウザ（Playwright・
`localStorage.intmap_settings.lang` を設定して起動 → 6 秒待つ → ピルで切替）で、locale のバイトを
読者の言語ごとに数えた。

| 読者 | 起動時に読む locale | 切替で読むもの |
|---|---|---|
| en | `ui.en`（main チャンクの中・描画長 19,238 字）のみ | `zh-hans` へ: `ui.zh-hans` 417,438 B だけ |
| jp | `ui.en` ＋ `ui.jp` 21,846 B（gzip 9,648） | `zh-hans` へ: 417,438 B だけ |
| fr | `ui.en` ＋ `ui.fr` 446,528 B（gzip 165,805） | `ko` へ: `ui.ko` 439,960 B だけ |

locale チャンク（raw / gzip）: de 16,366 / 7,309・es 16,642 / 7,258・ru 23,805 / 8,702・
jp 21,846 / 9,648・fr 446,528 / 165,805・ko 439,960 / 174,259・zh 417,405 / 181,091・
zh-hans 417,438 / 180,660。`pages.<code>.js` は起動時には 1 本も読まれない（出典ダイアログと
読み物ページが `<script src>` で読む）。

⇒ **依頼の 2（読者の言語だけを起動時に読み、他は切替時に遅延 import）は既に成り立っていた**
（`src/locale-boot.js` の lazy glob。英語は全テーブルのプロトタイプなので eager）。前後のバイト数は
同じで、この回は配り方そのものを変えていない。**欠けていたのは、それを守る者**——`src/main.js` に
静的 import を 1 行足すか、glob に `{eager:true}` を付ければ 1 言語あたり最大 45 万 B が全読者の
起動経路に戻り、`check:perf` はそれを「eager.raw が増えた」としか言えなかった。

依頼の 3（欠けたキーは英語へ落ちる規則を 1 か所に）も既に 1 か所だった: キー付きの表は
`js/lang-registry.js` の `keyed()`（`Object.create(en)`）、inline は同じファイルの `pick()` と `t()`
（位置引数 → その言語の `inline` 表 → 英語）。⚠ ただし `js/app-body.js` の `updateI18n()` が
`Object.assign({}, base, lang)` で**同じ落ち方をもう一度書いている**（結果は同じだが写し）。
このファイルはこの回の範囲外なので触っていない（§4）。

## 1. 門: 起動時に英語以外の locale を読んだら `check:perf` が赤

`scripts/perf-budget.mjs` に `eagerLocales(report)` と `localeErrors()` を足した。build report の
**eager チャンクのモジュール一覧**から `js/locales/ui.<code>.js` を数え、フォールバック以外が
1 つでもあれば、またはフォールバックが無ければ `judge()` の error にする（PR が赤）。
フォールバックの言語は **`IntMapLang.FALLBACK` に訊く**（門に `'en'` を書かない）。
新しい `check:*` は足していない。`measure()` はモジュール一覧を持たない report を拒む——
持たなければこの規則は何も主張しないまま緑になる（#R301 の形）。
現在の build で `eager locales: ui.en 18.8 kB`・within budget。

## 2. 失敗は理由つきの事実で、キャッシュしない

`IntMapLang.ensure()` は失敗を `console.warn` に流し、`null` を `pendingLoad` に**永久に**
キャッシュしていた。⑴ 読者には何も言われず、⑵ もう一度ピルを押しても取り直さない（再読み込み
以外に再試行の手段が無い）。静的ホストで実際に起きる形は、配備の前に開いたタブが、新しい配備には
もう無いハッシュ名のチャンクを頼む「Failed to fetch dynamically imported module」。

- 登録簿: 理由を `failure(code)` に残し、`onFail(fn)` の聞き手に 1 回知らせ、キャッシュを外す
  （次に頼まれたら取り直す）。成功は従来どおりキャッシュし、理由を消す。自分では繰り返さない
  （`.agents/rules/one-pass-or-a-reason.md` §5——再試行は実在した失敗のあと、頼まれたときだけ）。
- `js/lang-switch.js` が唯一の聞き手で、**頼まれた言語か画面の言語のとき**（起動時の保存言語を
  含む——switch が bind される前に頼まれる）に、`js/notify.js` の live region でその言語の言葉
  （en / jp を書いた。他 7 言語は英語に落ちる＝凍結の規則どおり）と言語名と理由を述べる。
  背景の言語の失敗は言わない。
- ⚠ **切替は失敗しても適用する**（#R233 の決定: 「ピルが何もしない」を避けるため英語を下に敷いて
  適用する）。その決定は変えていない——変えるなら利用者に確認が要る（§4）。

## 3. 検査

- `tests/locale-on-demand-checks.test.mjs`（評価型）: ① 合成の build report を `measureFrom()` に
  通し、`ui.fr` が eager に入れば `judge()` が赤・英語が無ければ赤・英語だけなら緑 ② 出荷している
  登録簿で、失敗 → 理由が残る・聞き手に 1 回・2 回目は取り直す・成功はキャッシュ ③ 出荷している
  switch で、起動時の失敗も切替の失敗も言われ、背景の言語は言われず、切替は従来どおり適用される。
- 走らせた門: `check:i18n`・`check:perf`（build 後）・`check:assets`・`check:static`・
  `check:engine`・`check:types`・`check:surface`・`check:docs`・`check:archfiles`・
  `check:testbudget`、および `tests/locale-strings-checks.test.mjs`（#R233 の switch 検査）・
  `tests/perf-baseline-auto-tighten-checks.test.mjs`・`tests/perf-startup-and-cache-checks.test.mjs`。
- ⚠ 最初の版は文言を `const tr = LANG.t || …; tr(code, en, jp)` と書き、`check:i18n` に
  「隣り合ったデータとして持たれた翻訳の組」と数えられて落ちた（143 → 144）。`IntMapLang.t(code, en, jp)`
  を直に呼ぶ形にして通した。

## 4. 残したこと

- `js/app-body.js` `updateI18n()` の `Object.assign({}, base, lang)` は `keyed()` のプロトタイプ鎖の
  写し。`i18n[currentLang] || i18n.en` で足りる（範囲外のため未着手）。
- 失敗した切替を**適用しない**（前の言語のまま・ピルを戻す）ほうが「混在」は起きない。#R233 の
  決定を覆すことになるので、提案に留める。
- `inline` 表を持つ 4 言語（fr / ko / zh / zh-hans）は 1 本 42〜45 万 B で、その読者は表全体を
  起動時に払う。表を機能ごとのチャンクに割れば下がるが、`pick()` が同期で表を引くので、割るには
  「その機能のモジュールが届くときに表の断片も届く」構造が要る。今回は測っただけ。
