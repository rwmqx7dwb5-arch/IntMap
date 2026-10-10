---
title: 翻訳の解決規則を 1 本にする——t() の本体を pick() と共有し、局所の (en, jp) => IntMapLang.t(...) 79 か所を pick に寄せ、キー引きの再実装 1 本を keyedText に寄せる
date: 2026-10-10
internal: 利用者に見える挙動は変えない内部の整理（訳は 1 文字も変わらない。旧 HEAD の registry を oracle にした 312 通りの突き合わせで差分 0）
---

〈依頼〉同じ規則の 2 本目の実装を形式上の削除として 1 本へ寄せる。言語体制は凍結（訳文は足さず消さない）。

## やったこと

- `js/lang-registry.js`: `pick()` と `t()` の本体（10 行の複製）を `resolve(read, args, o)` 1 本にした。`o` は英語列の位置（pick は 0、t は 1）。
- `keyedText(code, key, fallback)` を足した。生きている `window.IntMapI18N` の表（js/i18n.js が in place で merge し、js/i18n-late.js が起動後に鍵を足す）を先に読み、英語、呼び出し側の fallback の順。registry の `ui` は late の鍵を見ないので、`keyed()` の上ではなくこの表を読む。
- `js/embed-mode.js` の `tr` を `keyedText` へ。
- 局所の `(en, jp) => IntMapLang.t(<lang>, en, jp)` 79 か所（`L` / `T` / `t` / `tr` / `text` ほか）を `IntMapLang.pick(() => <lang>)` へ。lang の式はそのまま運んだ。3 引数の `(lang, en, jp) => IntMapLang.t(...)` の別名 5 本（map-narrator, on-this-day, service-status, weekly-earth, whats-new）は別名を消して `IntMapLang.t(` を直に呼ぶ。
- `tests/one-translate-rule-checks.test.mjs`: 言語 × 引数長 × 空/null の網羅で pick と t を突き合わせ、keyedText を評価し、js/ に再実装と局所ラッパが残っていないことを形で捕まえる。

## 見つかったこと（挙動の差）

- `lang()` が例外を投げる場合、旧 `t(lang(), …)` は呼び出し側へ例外が出たが、`pick(() => lang())` は英語を返す。layer-time-kernel の `tr` が既に try/catch で英語を返していたのと同じ。通常経路の差ではない。
- 局所ラムダは 3 引数目以降を捨てていた。79 か所の全呼び出しを AST で数え、3 引数以上の呼び出しが 0 であることを確かめてから寄せた（寄せた後は de 列以降が効く形だが、今は渡している箇所が無い）。
- supporter.js の `tr` と atlas-examples.js の `_t` はキー引きの再実装ではなく、注入された `ctx.t` / `HOST.t` を包むだけ（テストが偽の `t` を注入する）。本体は持たないので触っていない。

## 計器（scripts/i18n-helpers.mjs）の副作用と直し

局所ラムダが「証明された束縛」になった結果、`exposedHelpers()` が 5 個から約 800 個の鍵（`text`, `title`, `name`, `from`…）に爆発し、`from('profiles')` 形の呼び出し 591 件が「引数 1 個の翻訳呼び出し」と数えられた。原因は 2 つあり、どちらも構造として直した。
1. 計器は束縛名をファイル単位で証明し、スコープを見ない。map-recorder.js は `t` を map 内の仮引数 `(t, i) => ({ text: t })` にも使っており、鍵 `text` が全ファイルに渡った。`onePass` の鍵の露出に限り、同じ名前をそのファイルが仮引数や非 helper としても宣言しているなら露出しない `unshadowed()` を足した（呼び出し位置の検出は従来どおりファイル単位）。
2. map-recorder.js は 1 ファイルの別関数で `t` を「キー引き」(`ctx.t`) と「英日引き」の 2 つの意味に使っていた。キー引き側を `tk` に改名した（postcard タブの範囲だけ）。

## 残したもの

- `connections-panel.js` の `(lang, en, jp) => IntMapLang.t(lang, en, jp)`: `t(lang, ...row)` で長さ不定の行を通し、3 列目以降を捨てている。`IntMapLang.t` に直すと長い行の訳が変わるので、行の長さを確かめるまで残す（検査の ALIAS_PENDING に理由つき）。
- 手書きの「鍵 → 英語」引き 4 本（app-body.js の `t`, data-layers.js, i18n-late.js, map-ui.js）は別作業者が編集中のため未着手（検査の KEYED_PENDING。形が消えたら検査が外すよう促す）。

## 台帳の動き

- `tests/i18n-coverage-floor.json`: inline の行数が +2（fr / ko ほか、+3 の言語もある）。局所ラムダが「証明された束縛」になった分だけ、計器が今まで数えていなかった文を数えるようになった。en と jp は 100% のまま、残り 7 言語の穴は凍結の方針どおり記録だけ（床が上がっただけで、訳は足していない）。
- `tests/global-surface-baseline.json`: `window.IntMapI18N` の読み取りが 19 から 16。registry の読み取りを `live()` 1 か所にし、embed-mode の `tr` は registry に訊くだけになったため。

## 未解決: i18n の「1 つの英語鍵が 2 つの意味」門が赤（43 件）

局所ラムダが計器から見えるようになった結果、`scripts/i18n-key-collision-audit.mjs` の母集合が 7643 鍵から 8383 鍵に広がり、これまで見えなかった衝突が 43 件出た（BENIGN 未記載）。`From` / `To`（期間か通貨か）、`open`（開く か 規制なし）、`Stop`（やめる か 経由地）、`Years`、`skipped` などは意味が実際に違い、直すには英語鍵を分ける（英語の文面を変える）必要がある。同ファイルの規則どおり「門を緑にするために BENIGN へ足さない」。この PR の「訳は 1 文字も変えない」と両立しないので、扱いは別に決める。

## 門の扱い（メインが決めた）

局所ラムダが計器に見えるようになって現れた 43 件の衝突は、新しく生じたものではない（同じ inline 行を前から共有していた）。
意味の違いを判定し外れた側に別の英語鍵を与えるのは翻訳作業で、9 言語体制は凍結中（`AGENTS.md` §3-5: 穴は記録して次へ）。
英語と日本語は各呼び出しの引数から出るので影響しない。そこで BENIGN（「一行で務まる」と判定済み）には入れず、
`scripts/i18n-key-collision-audit.mjs` に別の一覧 `FROZEN_OPEN`（記録済み・未判定）として載せた。新しい衝突は今までどおり赤、
衝突しなくなった項目を一覧に残すのも赤（BENIGN と同じ両方向の規則）。
