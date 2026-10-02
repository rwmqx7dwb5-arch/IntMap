---
title: 集めていた匿名集計を閉ループにした——admin «Growth» で読み、utm 付きの発信リンクを作り、Atlas の回答の型を数える。紹介ページ経由の訪問は入口として数え、そのページの utm を読む
date: 2026-10-03
---

〈依頼〉営業・マーケティングの閉ループ。自前の匿名集計（`js/usage-counts.js` → `usage-count` →
`usage_counts`）は集めていたが、(a) マーケティングの問いで読む画面が無い (b) utm 付きの発信リンクを作る
道具が無い (c) Atlas の回答の型（`answerMode`）が数えられていない。

## 0. 測った（実装の前に）

- **読む経路は既にあった。** `usage_counts` は admin だけが SELECT でき、`usage_counts_summary(p_days)` は
  SECURITY INVOKER。前の期間との比較は `summary(2·days) − summary(days)` で同じ関数から出る（2·days が
  保持 400 日の内側のときだけ）。⇒ **migration は足していない**（DB の形は何も変わらない。新しい metric
  `atlas_mode` は表の CHECK `^[a-z][a-z_]{0,31}$` を通り、上限 `cap` は shape.js から関数が渡す）。
- **紹介ページ経由の訪問は見えていなかった。** `about.html` / `teachers.html` / `s/<id>.html`（各 `ja/`）
  は計数器を走らせず、作例ページは固定のアドレスへ即リダイレクトする。地図側の `referrerOf` は自サイトを
  `null`（到着ではない）として捨てていたので、**紹介ページへ向けた utm 付きリンクは乗り換えで utm を失い、
  入口も記録されなかった**。同一オリジンの referrer はパスとクエリごと届く（既定の
  strict-origin-when-cross-origin・紹介ページは referrer meta を持たない）ので、そこから読める。

## 1. 変えたこと

- `supabase/functions/usage-count/shape.js`: `entry` に `showcase` / `about` / `teachers`（`SITE_PAGES`・
  `sitePageOf`）。`entryOf` は新規の遷移のときだけ紹介ページを返し、`link` より優先（作例のリンクも地図の
  視点を持つので、より具体的な方）。`atlas_mode`（text / map / chart / mixed、max は `atlas` と同じ 100）。
- `js/usage-counts.js`: `arrivalRows` が紹介ページからの到着でだけ、地図自身のアドレスに utm が無いとき
  そのページのアドレスの utm を読む（他サイトの query は読まない）。バスの
  `{kernel:'atlas', phase:'answered', answerMode}` を `atlas_mode` として数える（同じ同意条件）。
- `js/atlas-agent.js` runTurn: 読者に回答を渡したターン（`answered` か、回答を書いた後で上限が閉じた
  `CUT_STOPS`）でだけ、宣言された型をバスに流す。中止・転送失敗・聞き返し・空の回答・型の宣言無しは流さない。
  バスは `opts.os`（node の検査）か、無ければページの `IntMapOS`。
- `admin.html` «Growth»: 期間（7/30/90/400 日）・訪問と Atlas 質問の日別・KPI 4 つ（前期間比）・入口・
  リファラ host・utm 3 種・機能・レイヤー・Atlas の回答の型の比率。行が無ければ「Nothing counted」。
  発信リンク: 行き先は `sitemap.xml` から発見、アドレスは build が埋める `<meta name="intmap-site">`
  （`scripts/site-url.mjs` `fillSiteToken`。script の外に置くので CSP の hash を変えない）、tag は計数器の規則で検査。
- `js/legal-text.js` §1（en / jp）: 回答の型と紹介ページの入口・utm を開示。`LEGAL_DATE` 2026-10-03。

## 2. 写しが 1 つ残っている

admin の tag 規則 `G_TAG` は shape.js `TOKEN` の写し（admin.html は verbatim でコピーされ、shape.js は
その横に置かれない——`vite.config.js` STATIC_ASSETS はこの回の範囲外）。`tests/growth-loop-checks.test.mjs`
が両者の一致を測る。shape.js を STATIC_ASSETS に足して admin から import すれば写しは消せる。

## 3. 見えないまま残るもの

- 作例ページ経由の訪問の**外部の**リファラ（例: SNS）は見えない——地図が見る referrer は作例ページになる。
  utm を付けたリンクで補う（それが発信リンク作成の役目）。
- 紹介ページ自体の閲覧数は数えていない（地図へ進んだ訪問だけ）。
- `atlas_mode` はこの回の配備より前の質問には無い。Growth の「質問数と回答数の差」はその旨を述べる。

## 4. 検証

`node --test tests/growth-loop-checks.test.mjs`（8 件）・`anonymous-usage-counts` / `atlas-agent-loop` /
`atlas-agent-repeat` / `atlas-turn-engine` / `landing-showcase` の検査・`check:static` / `check:i18n` /
`check:datagov` / `check:docs`。`check:surface` は `window.IntMapOS` の読み手が 1 つ増えた（51 → 52）ことを
名指す——上の runTurn の 1 行で、ここに名を書き、`node scripts/global-surface.mjs --update` で基準を更新する。

## 統合時の判断（check:surface）

`js/atlas-agent.js` が `globalThis.IntMapOS` を読む 1 行で、読み手が 51 → 52 になった。atlas-console.js から os を渡す (b) は、同じ時期に別の作業が atlas-console.js を編集しているため衝突を避けて採らず、(a) `node scripts/global-surface.mjs --update` で受け入れた。
